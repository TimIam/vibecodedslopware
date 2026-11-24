// The patient: a small real-time physiology model. Pure JS (no DOM, no three.js) so tools/sim.mjs can run whole calls
// headless. One Patient per call; conditions (conditions.js) push it around, drugs (meds.js) and interventions
// (actions.js) push back, and everything the player sees (monitor, skin, breathing, what a stethoscope hears) is read
// from the state here.
//
// Time: the model runs SIM_SPEED times faster than the wall clock, so a "2 minute" CPR cycle is one real minute and a
// 25 minute call plays in about twelve. Every clock shown to the player is sim time. All rates below are per SIM second.
//
// The model, in one paragraph: stroke volume = preload (blood volume, venous tone, anything squeezing the heart) x
// contractility (myocardial energy, drugs); output = rate x stroke volume; pressure = output x resistance; a baroreflex
// (sympathetic tone) defends pressure with rate and resistance until it runs out. Alveolar O2 and CO2 are stores filled
// by ventilation and drained by metabolism, so apnoea desaturates on a real time course and pre-oxygenation buys real
// minutes. Brain and heart keep reversible "function" and irreversible "injury" tallies that decide consciousness,
// rhythm, whether a shock works, and the outcome read out at the hospital.

import { resolveOpioids } from './meds.js';

export const SIM_SPEED = 2;
const STEP = 0.25;
export const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
const hill = po2 => { const x = Math.pow(Math.max(po2, 0.5), 2.7); return x / (x + 7190); }; // P50 26.8 mmHg

// Shockable / perfusing classification
export const SHOCKABLE = { vf: 1, vfFine: 1, vtPulseless: 1, torsades: 1 };
const ARREST = { vf: 1, vfFine: 1, vtPulseless: 1, asystole: 1, pea: 1, agonal: 1 };

export class Patient {
  constructor(spec, diff = {}) {
    this.spec = spec; this.diff = Object.assign({ rate: 1, forgiving: 0 }, diff);
    this.age = spec.age; this.sex = spec.sex; this.h = spec.heightM || (spec.sex === 'f' ? 1.63 : 1.77);
    this.w = spec.weight || 80; this.bmi = this.w / (this.h * this.h);
    this.wIdeal = Math.min(this.w, 24 * this.h * this.h * 1.15);
    const b = this.base = Object.assign({ hr: 72, map: 93, rr: 14, bgl: 95, temp: 36.9, rhythm: 'sinus', ino: 1, svr: 1 }, spec.baseline || {});
    this.meds = new Set(spec.meds || []);         // home medication flags: betaBlocker, anticoagulant, pde5, insulin, opioidTolerant, ...
    this.allergies = new Set(spec.allergies || []);
    this.rng = mulberry(spec.seed || 1);
    this.t = 0; this.acc = 0;

    // circulation
    this.volN = (this.sex === 'f' ? 65 : 70) * this.wIdeal; this.vol = this.volN; this.rbc = 1; this.crystalloid = 0;
    this.sym = 0.15; this.symCap = 1; this.ino = b.ino; this.svr0 = b.svr;
    this.rhythm = b.rhythm; this.pulse = true; this.hr = b.hr; this.hrFixed = null;
    this.svRest = 72 * (this.wIdeal / 75); this.coRest = b.hr * this.svRest / 1000;
    this.co = this.coRest; this.sv = this.svRest; this.map = b.map; this.sys = b.map + 27; this.dia = b.map - 13;
    this.energy = 1;            // myocardial energy state 0..1
    this.cpp = 0; this.ntgSens = this.meds.has("pde5") ? 3 : 1;
    this.heartInjury = 0;       // irreversible 0..1
    this.shockTime = 0;         // seconds spent in decompensated shock
    // respiration / gas
    this.rr = b.rr; this.tv = 1; this.airway = 1; this.lung = { L: 1, R: 1 }; this.shunt = 0; this.vqm = 0; this.broncho = 0; this.hyperinfl = 0;
    this.frc = 2.4 * Math.pow(this.h / 1.75, 2) * (this.bmi > 30 ? clamp(1 - (this.bmi - 30) * 0.025, 0.55, 1) : 1) * (this.age < 14 ? 0.8 : 1);
    this.pAO2 = 104; this.pCO2 = 38; this.sao2 = 0.975; this.svo2 = 0.72; this.fio2 = 0.21; this.spo2Lag = 0.975;
    this.mvAlv = 4.2; this.spontMv = 4.2; this.stomachAir = 0; this.aspirated = 0; this.secretions = 0;
    // brain / metabolic
    this.brain = 1; this.brainInjury = 0; this.bgl = b.bgl; this.temp = b.temp; this.pain = 0; this.anxiety = 0.25; this.sedation = 0;
    this.seizing = false; this.postictal = 0; this.vomitT = 0; this.nausea = 0;
    this.arrest = false; this.tArrest = null; this.downtime = 0; this.noFlow = 0; this.rosc = 0; this.roscAt = null; this.dead = false;
    this.inPEA = 0; this.peaLook = 'sinus';
    this.ecgMods = { st: 0, tInv: false, peakedT: false, wideQRS: false, longQT: false, lowVoltage: false, alternans: false, pvc: 0 };
    this.twelve = 'normal';     // 12-lead pattern id the monitor prints
    // drugs: name -> { depots: [{ amt, ka, f }], c }
    this.drugs = {}; this.given = [];
    // treatments in place
    this.tx = {
      o2: null,                 // { device: 'nc' | 'nrb' | 'neb' , flow }
      adjunct: null,            // 'opa' | 'npa' | 'igel' | 'cric'
      manoeuvre: false,         // someone is holding a jaw thrust / head tilt
      vent: { on: false, by: null, rate: 0, tv: 0.5, o2: false, seal: 0.8, last: -99 },
      cpr: { on: false, by: null, q: 0, rate: 0, momentum: 0, total: 0, handsOff: 0, lastPause: 0, fatigue: 0 },
      iv: [], io: null, fluidsRunning: null,
      mon: { ecg: false, spo2: false, cap: false, cuff: false, pads: false },
      nibp: null, nibpCycling: 0,
      pos: 'supine', collar: false, board: false, blanket: false, splints: {}, binder: false,
      tq: {}, dressings: {}, seal: {}, decomp: {}, thoracostomy: {}, pericardial: false, thoracotomy: false,
      suction: false,
    };
    this.defib = { mode: 'monitor', energy: 200, charge: 0, charging: false, charged: false, sync: false, shocks: 0, paceRate: 70, paceMa: 0, capture: false, msg: '' };
    this.cond = []; this.log = []; this.events = []; this.flags = {}; this.find = {}; this.errors = [];
    this.m = this.freshMods();
    this.fx = { skin: {}, };
    this.step(0.001);
  }

  // ------------------------------------------------------------ bookkeeping
  note(type, data = {}) { this.log.push(Object.assign({ t: this.t, type }, data)); }
  emit(type, data = {}) { this.events.push(Object.assign({ t: this.t, type }, data)); }
  error(id, text, sev = 2) { if (this.errors.find(e => e.id === id && this.t - e.t < 60)) return; this.errors.push({ t: this.t, id, text, sev }); this.note('error', { id, text, sev }); }
  did(type) { return this.log.some(l => l.type === type); }
  firstTime(type) { const l = this.log.find(l => l.type === type); return l ? l.t : null; }
  add(cond) { this.cond.push(cond); cond.init?.(this); return cond; }
  get(type) { return this.cond.find(c => c.type === type); }
  freshMods() { return { hrAdd: 0, hrMul: 1, hrCap: 999, svrMul: 1, inoAdd: 0, inoMul: 1, veno: 0, respDep: 0, respDrive: 0, sed: 0, analgesia: 0, vfRisk: 0, vagal: 0, antiarr: 0, obstruct: 1, symAdd: 0, bronchoRelief: 0, o2Demand: 1, clotAid: 0, antiemetic: 0, adr: 0, kShift: 0, memStab: 0, leak: 0, opioid: 0 }; }

  tick(dtReal) {
    this.acc += dtReal * SIM_SPEED;
    let n = 0;
    while (this.acc >= STEP && n++ < 40) { this.step(STEP); this.acc -= STEP; }
    if (this.acc > STEP) this.acc = 0;
  }

  // ------------------------------------------------------------ one model step
  step(dt) {
    this.t += dt;
    const m = this.m = this.freshMods();
    const R = this.diff.rate;
    this.ecgMods.st = 0; this.ecgMods.tInv = false; this.ecgMods.peakedT = false; this.ecgMods.wideQRS = false; this.ecgMods.longQT = false; this.ecgMods.lowVoltage = false; this.ecgMods.alternans = false; this.ecgMods.pvc = 0;
    this.shuntC = 0; this.vqmC = 0; this.bronchoC = 0; this.airwayC = 1; this.lungC = { L: 1, R: 1 }; this.brainC = 1; this.painC = 0; this.tvC = 1; this.find = {}; this.fx.skin = {};
    // drugs report first so that conditions can see what is on board (calcium, epinephrine, TXA ...)
    this.tickDrugs(dt, m);
    for (const c of this.cond) c.tick?.(this, dt * (c.noScale ? 1 : R), m);
    resolveOpioids(this, m, dt);
    this.tickCpr(dt);
    this.tickRhythm(dt, m);
    this.tickCirculation(dt, m);
    this.tickRespiration(dt, m);
    this.tickGas(dt, m);
    this.tickOrgans(dt, m);
    this.tickFluids(dt, m);
    this.tickDefib(dt);
  }

  // ------------------------------------------------------------ drugs (pharmacokinetics; effects live in meds.js)
  give(name, amt, route, def) {
    const d = this.drugs[name] || (this.drugs[name] = { depots: [], c: 0, total: 0 });
    const r = def.routes[route]; if (!r) return false;
    d.depots.push({ amt, ka: Math.LN2 / r.abs, f: r.f ?? 1, route, zero: r.zero || 0, left: amt });
    d.total += amt; d.def = def;
    this.given.push({ t: this.t, name, amt, route });
    this.note('drug', { name, amt, route });
    return true;
  }
  level(name) { return this.drugs[name]?.c || 0; }
  tickDrugs(dt, m) {
    const perf = clamp(this.co / this.coRest, 0.05, 1);
    for (const name in this.drugs) {
      const d = this.drugs[name];
      for (const dp of d.depots) {
        if (dp.left <= 0) continue;
        let k = dp.ka;
        if (dp.route === 'IM' || dp.route === 'IN' || dp.route === 'SL' || dp.route === 'BUC') k *= 0.15 + 0.85 * perf;   // poor perfusion, poor absorption
        if (dp.route === 'PO') k *= 0.2 + 0.8 * perf;
        if (dp.route === 'IV' || dp.route === 'IO') k *= this.arrest ? clamp(this.tx.cpr.momentum * 0.9, 0.02, 1) : 1; // needs circulation to arrive
        let flow;
        if (dp.zero) { flow = Math.min(dp.left, dp.amt / dp.zero * dt * (dp.route === 'NEB' ? clamp(this.mvAlv / 4, 0.1, 1.2) : 1)); }
        else flow = dp.left * (1 - Math.exp(-k * dt));
        dp.left -= flow; d.c += flow * dp.f; d.def.onFlow?.(this, flow * dp.f);
      }
      d.c *= Math.exp(-Math.LN2 / d.def.half * dt);
      if (d.c < 1e-6 && d.depots.every(x => x.left <= 1e-6)) d.c = 0;
      d.def.fx?.(this, m, d.c, dt, d);
    }
  }

  // ------------------------------------------------------------ rhythm and arrest
  setRhythm(r, why) {
    if (this.rhythm === r) return;
    const was = this.rhythm; this.rhythm = r;
    const nowArrest = !!ARREST[r];
    if (nowArrest && !this.arrest) { this.arrest = true; this.pulse = false; this.tArrest = this.t; this.note('arrest', { rhythm: r, why }); this.emit('arrest', { rhythm: r, why }); this.rosc = 0; }
    if (!nowArrest && this.arrest) { this.arrest = false; this.pulse = true; this.rosc++; this.roscAt = this.t; this.sym = 0.75; this.note('rosc', { rhythm: r }); this.emit('rosc', { rhythm: r }); this.inPEA = 0; }
    this.note('rhythm', { from: was, to: r, why }); this.emit('rhythm', { from: was, to: r });
  }
  tickRhythm(dt, m) {
    const e = this.energy;
    if (!this.arrest) {
      // ventricular fibrillation from an irritable heart
      const risk = m.vfRisk * (1 - 0.6 * m.antiarr) * (this.diff.forgiving ? 0.6 : 1);
      if (risk > 0 && this.rng() < risk * dt) { this.vfWhy = this.vfWhy || 'irritable myocardium'; this.setRhythm('vf', this.vfWhy); return; }
      // a starved heart slows, then stops pumping
      if (e < 0.10 || this.map < 22) {
        this.inPEA += dt;
        if (this.inPEA > 6) { this.peaLook = this.hr < 50 ? 'brady' : (this.ecgMods.wideQRS ? 'wide' : 'sinus'); this.peaRate = clamp(this.hr, 20, 130); this.setRhythm('pea', this.arrestWhy || 'pump failure'); }
      } else this.inPEA = Math.max(0, this.inPEA - dt * 0.5);
    } else {
      this.downtime += dt;
      const flow = this.cprFlow();
      if (flow < 0.08) this.noFlow += dt;
      if (this.rhythm === 'vf' && e < 0.22) this.setRhythm('vfFine', 'fading');
      else if (this.rhythm === 'vfFine' && e < 0.05 && this.rng() < dt / 40) this.setRhythm('asystole', 'exhausted');
      else if (this.rhythm === 'vtPulseless' && this.rng() < dt / 70) this.setRhythm('vf', 'degenerated');
      else if (this.rhythm === 'pea') {
        this.peaRate = Math.max(18, (this.peaRate || 60) - dt * (flow > 0.15 ? 0.02 : 0.12) * 60 / 60);
        if ((e < 0.035 && this.rng() < dt / 25) || this.peaRate <= 18.5) this.setRhythm('asystole', 'exhausted');
      }
      this.tickRosc(dt, m, flow);
    }
  }
  // Compressions build flow over the first seconds and lose it the moment they stop; a lone rescuer tires.
  tickCpr(dt) {
    const c = this.tx.cpr;
    if (c.on) {
      c.momentum = approach(c.momentum, 1, 6, dt); c.total += dt * (c.rate || 110) / 60;
      if (c.by !== "me") { c.fatigue = clamp(c.fatigue + dt / 320); c.q = (c.baseQ ?? 0.84) * (1 - 0.32 * clamp((c.fatigue - 0.4) / 0.6)); }
    } else { c.momentum = 0; c.fatigue = Math.max(0, c.fatigue - dt / 45); }
  }
  // Fraction of normal cardiac output that compressions are producing right now.
  cprFlow() { const c = this.tx.cpr; return c.on ? 0.30 * c.q * (0.25 + 0.75 * c.momentum) * clamp(this.vol / this.volN * 1.25, 0.2, 1) * this.m.obstruct : 0; }
  // Non-shockable arrests come back when the cause is fixed and the heart has been perfused; rolled continuously.
  tickRosc(dt, m, flow) {
    if (this.rhythm !== 'pea' && this.rhythm !== 'asystole') return;
    const cause = this.reversible();           // 0 (cause untreated) .. 1 (cause fixed / none)
    const cpp = this.cpp;
    let p = 0;
    if (this.rhythm === 'pea') p = clamp((cpp - 12) / 20) * cause * (0.5 + 0.8 * m.adr) * clamp(this.energy * 3) / 55 * (this.t - this.tArrest < 300 ? 3 : 1);
    else p = clamp((cpp - 15) / 20) * cause * m.adr * clamp(this.energy * 4) / 220;
    p *= clamp(1 - this.brainInjury * 0.5);
    if (this.rng() < p * dt) {
      if (this.rhythm === 'asystole' && this.rng() < 0.6) { this.peaRate = 40; this.peaLook = 'brady'; this.setRhythm('pea', 'electrical activity returns'); }
      else { this.hr = 95; this.setRhythm(this.base.rhythm === 'afib' ? 'afib' : 'sinus', 'ROSC'); }
    }
  }
  // How far the reversible causes (the Hs and Ts) have been dealt with; conditions report through cond.reversed(p).
  reversible() { let r = 1; for (const c of this.cond) if (c.reversed) r = Math.min(r, c.reversed(this)); const vf = this.vol / this.volN; r = Math.min(r, clamp((vf - 0.45) / 0.25)); r = Math.min(r, clamp((this.sao2 - 0.38) / 0.3)); return r; }

  // A defibrillator discharge. Returns a short description of what happened.
  shock(joules, sync) {
    const d = this.defib; d.shocks++; this.note('shock', { joules, rhythm: this.rhythm, sync });
    this.tx.cpr.momentum *= 0.5;
    const r = this.rhythm;
    if (SHOCKABLE[r]) {
      let p = 0.08 + 0.62 * clamp((this.energy - 0.12) / 0.5);
      p *= 0.75 + 0.4 * this.m.antiarr; p *= clamp(joules / 150, 0.3, 1.1);
      if (r === 'vfFine') p *= 0.45;
      if (this.heartInjury > 0.5) p *= 0.6;
      const cause = Math.max(this.reversible(), 0.55);
      if (this.rng() < p) {
        if (this.rng() < 0.82 * cause + 0.05) { this.hr = 105; this.setRhythm(this.base.rhythm === 'afib' ? 'afib' : 'sinus', 'defibrillated'); return 'converted'; }
        if (this.rng() < 0.5) { this.peaRate = 55; this.peaLook = 'wide'; this.setRhythm('pea', 'organised, no output'); return 'pea'; }
        this.setRhythm('asystole', 'defibrillated to standstill'); return 'asystole';
      }
      if (r === 'vfFine' && this.rng() < 0.25) { this.setRhythm('asystole', 'shocked fine VF'); return 'asystole'; }
      return 'no change';
    }
    if (r === 'asystole' || r === 'pea' || r === 'agonal') { this.error('shockNonShockable', `Shocked a non-shockable rhythm (${r === 'pea' ? 'PEA' : 'asystole'}): no benefit, and time off the chest.`, 2); this.energy = Math.max(0, this.energy - 0.03); return 'no effect'; }
    // a perfusing rhythm
    const tachy = r === 'vt' || r === 'svt' || r === 'afib' || r === 'aflutter';
    if (sync && tachy) {
      const p = clamp(joules / 100, 0.4, 0.95) * (r === 'afib' ? 0.7 : 0.9);
      this.pain = Math.max(this.pain, this.brain > 0.5 && this.sedation < 0.4 ? 9 : 0);
      if (this.brain > 0.5 && this.sedation < 0.4) this.error('cardiovertAwake', 'Cardioverted a conscious patient without sedation or analgesia.', 1);
      if (this.rng() < p) { this.base.rhythm = 'sinus'; this.hrFixed = null; this.hr = 88; this.setRhythm('sinus', 'cardioverted'); this.flags.cardioverted = true; return 'converted'; }
      return 'no change';
    }
    this.error('shockPerfusing', 'Delivered an unsynchronised shock to a patient with a pulse.', 3);
    this.pain = 10;
    if (this.rng() < (tachy ? 0.35 : 0.3)) { this.vfWhy = 'shock on T wave'; this.setRhythm('vf', 'R-on-T from unsynchronised shock'); return 'vf'; }
    if (tachy && this.rng() < 0.5) { this.base.rhythm = 'sinus'; this.hrFixed = null; this.setRhythm('sinus', 'cardioverted'); return 'converted'; }
    return 'no change';
  }

  tickDefib(dt) {
    const d = this.defib;
    if (d.charging) { d.charge = Math.min(1, d.charge + dt / (4 * SIM_SPEED)); if (d.charge >= 1) { d.charging = false; d.charged = true; this.emit('charged'); } }
    if (d.charged) { d.hold = (d.hold || 0) + dt; if (d.hold > 120) { d.charged = false; d.charge = 0; d.hold = 0; d.msg = 'ENERGY DUMPED'; } } else d.hold = 0;
    // transcutaneous pacing
    if (d.mode === 'pacer' && this.tx.mon.pads && !this.arrest) {
      const thr = this.paceThreshold || 70; d.capture = d.paceMa >= thr;
      if (d.capture) { this.paced = true; if (this.brain > 0.5 && this.sedation < 0.3) this.painC = Math.max(this.painC, 6); } else this.paced = false;
    } else { d.capture = false; this.paced = false; }
  }

  // ------------------------------------------------------------ circulation
  tickCirculation(dt, m) {
    const volFrac = this.vol / this.volN;
    let pre = volFrac - m.veno * 0.5;
    if (this.tx.pos === 'legsUp') pre += 0.05; if (this.tx.pos === 'sitting' || this.tx.pos === 'semi') pre -= volFrac < 0.85 ? 0.07 : 0.01;
    let preloadF = Math.pow(clamp((pre - 0.30) / 0.70, 0, 1.12), 0.9);
    if (this.rvInfarct) preloadF = Math.pow(preloadF, 2.4);          // an infarcting right ventricle lives on its filling pressure
    const obstruct = m.obstruct * (1 - 0.55 * this.hyperinfl);
    this.m.obstruct = obstruct;
    const eF = 0.5 + 0.5 * clamp(this.energy / 0.6);
    const sym = Math.min(this.sym, this.symCap);

    if (this.arrest) {
      const c = this.tx.cpr, flow = this.cprFlow();
      this.co = this.coRest * flow; this.sv = 0; this.hr = 0;
      // coronary perfusion pressure during CPR: built by uninterrupted, good compressions and by adrenaline
      const cppT = c.on ? c.q * c.momentum * (22 + 14 * m.adr) * clamp(volFrac * 1.2, 0.3, 1) * obstruct : 0;
      this.cpp = approach(this.cpp || 0, cppT, c.on ? 5 : 1.2, dt);
      this.map = approach(this.map, 8 + this.cpp * 1.35, 2, dt); this.sys = this.map + (c.on ? 28 * c.q : 0); this.dia = Math.max(2, this.map - (c.on ? 8 : 0));
      this.sym = approach(this.sym, 1, 20, dt);
      return;
    }
    this.cpp = 0;
    // rate
    let hrT;
    const r = this.rhythm;
    if (this.hrFixed != null) hrT = this.hrFixed;                       // fixed-rate rhythms (blocks, SVT, VT) set by a condition
    else {
      const hrMax = (208 - 0.7 * this.age) * 0.92;
      hrT = this.base.hr + (hrMax - this.base.hr) * clamp(sym * 1.05 - 0.15, 0, 1) + m.hrAdd;
      hrT *= m.hrMul; hrT = Math.min(hrT, m.hrCap);
      const vag = m.vagal * (1 - (m.vagalBlock || 0)); if (vag > 0) hrT = lerp(hrT, 32, clamp(vag));
      if (this.energy < 0.38) hrT = lerp(26, hrT, clamp((this.energy - 0.08) / 0.30));     // pre-arrest bradycardia
      if (r === 'afib') hrT *= 1.25;
    }
    if (this.paced) hrT = Math.max(hrT, this.defib.paceRate);
    hrT = clamp(hrT, 18, 240);
    this.hr = approach(this.hr, hrT, this.hrFixed != null ? 1.5 : 7, dt);
    // stroke volume
    const fill = this.hr > 140 ? clamp(1 - (this.hr - 140) / 150, 0.3, 1) : 1;
    let ino = this.ino * eF * (1 + 0.32 * sym + m.inoAdd) * m.inoMul;
    let rf = 1; if (r === 'afib') rf = 0.86; else if (r === 'vt') rf = 0.55; else if (r === 'chb' || r === 'idioventricular') rf = 1.15; else if (r === 'junctional') rf = 0.9;
    this.sv = this.svRest * preloadF * obstruct * clamp(ino, 0, 1.7) * fill * rf;
    this.co = this.hr * this.sv / 1000;
    const svr = this.svr0 * (0.82 + 1.2 * sym) * m.svrMul;
    const mapT = Math.max(6, this.co * svr * (this.base.map / this.coRest));
    this.map = approach(this.map, mapT, 4, dt);
    const pp = clamp(40 * (this.sv / this.svRest) * (1 + Math.max(0, this.age - 40) * 0.007) / Math.sqrt(clamp(svr, 0.4, 3)) * 1.0, 6, 110);
    this.sys = this.map + 0.64 * pp; this.dia = Math.max(8, this.map - 0.36 * pp);
    this.pulse = this.sys > 42;
    // baroreflex: defend pressure, driven also by hypoxia, pain and fear
    const hyp = clamp((0.92 - this.sao2) / 0.2);
    let drive = 0.15 + 2.4 * Math.max(0, (this.base.map - this.map) / this.base.map) + 0.45 * hyp + 0.03 * Math.max(0, this.pain - m.analgesia) + 0.12 * this.anxiety + m.symAdd - 0.25 * this.sedation;
    if (this.map > this.base.map * 1.04) drive -= 2.2 * (this.map / this.base.map - 1.04);
    this.sym = clamp(approach(this.sym, clamp(drive), 9, dt));
    // decompensation: the reflex cannot be held at maximum for ever
    const shocky = this.map < 60 || volFrac < 0.62;
    if (shocky) this.shockTime += dt; else this.shockTime = Math.max(0, this.shockTime - dt * 0.5);
    const capT = this.shockTime > 240 ? clamp(1 - (this.shockTime - 240) / 420, 0.25, 1) : 1;
    this.symCap = approach(this.symCap, Math.min(capT, volFrac < 0.5 ? 0.45 : 1), 30, dt);
  }

  // ------------------------------------------------------------ breathing
  airwayPatency() {
    let a = this.airway * this.airwayC;                       // anatomical/pathological patency (swelling, foreign body)
    // a floppy tongue in the unconscious: snoring obstruction unless positioned or an adjunct holds it
    const tone = clamp((this.brain - 0.18) / 0.35);
    let tongue = lerp(0.3, 1, tone);
    if (this.seizing) tongue = Math.max(tongue, 0.75);          // rigid, not floppy
    if (this.tx.manoeuvre) tongue = Math.max(tongue, 0.85);
    if (this.tx.adjunct === 'opa' || this.tx.adjunct === 'npa') tongue = Math.max(tongue, 0.8);
    if (this.tx.pos === 'recovery') tongue = Math.max(tongue, 0.8);
    if (this.tx.adjunct === 'igel') tongue = 1;
    if (this.tx.adjunct === 'cric') return clamp(0.8 * (this.cricPatency ?? 1));    // bypasses everything above the cricoid
    const fluid = clamp(1 - this.secretions);                 // vomit, blood
    return clamp(a * tongue * fluid);
  }
  tickRespiration(dt, m) {
    const hyp = clamp((0.94 - this.sao2) / 0.16);
    let drive = 1 + 1.5 * hyp + 0.35 * Math.min(this.sym, this.symCap) + 0.03 * Math.max(0, this.pain - m.analgesia) + 0.2 * this.anxiety + (this.pCO2 - 40) * 0.035 + m.respDrive;
    const dep = clamp(m.respDep);
    drive *= (1 - dep) * (1 - dep * 0.3);
    if (this.pCO2 > 75) drive *= clamp(1 - (this.pCO2 - 75) / 60, 0.2, 1);          // CO2 narcosis
    const central = this.seizing ? 0.85 : clamp((this.brain - 0.07) / 0.18);   // a convulsing brainstem still drives breathing
    drive *= central;
    if (this.seizing) drive *= 0.62;
    if (this.arrest) drive = (this.downtime < 90 && SHOCKABLE[this.rhythm]) ? 0.18 : 0;   // agonal gasps early in VF
    let rrT = this.base.rr * drive * (this.fatigue ? 1 - this.fatigue * 0.7 : 1);
    rrT = drive < 0.22 ? (drive < 0.08 ? 0 : 4) : clamp(rrT, 6, 46);
    this.rr = approach(this.rr, rrT, 5, dt);
    this.agonal = this.arrest && this.rr > 0;
    // alveolar volume per breath (tidal volume less dead space); shallow breathing cuts this, not the dead space
    const alv = 0.35 * (this.wIdeal / 75) * this.tvC * (1 - 0.5 * dep) * clamp(1.15 - this.rr / 110, 0.72, 1.05);
    const patency = this.airwayPatency();
    const lungF = (this.lung.L * this.lungC.L + this.lung.R * this.lungC.R) / 2;
    const bron = clamp(this.broncho + this.bronchoC - m.bronchoRelief * (this.broncho + this.bronchoC));
    this.bronchoNow = bron;
    this.spontMv = this.rr * alv * clamp(patency * 1.3) * lungF * (1 - 0.62 * bron) * (this.agonal ? 0.2 : 1);
    // assisted ventilation
    const v = this.tx.vent; let assist = 0;
    if (v.on && v.rate > 0) {
      const seal = this.tx.adjunct === 'igel' || this.tx.adjunct === 'cric' ? 0.95 : v.seal * (this.tx.adjunct || this.tx.manoeuvre ? 1 : 0.55);
      const eff = seal * clamp(patency * 1.2) * lungF * (1 - 0.55 * bron);
      assist = v.rate * Math.max(0, v.tv - 0.15) * (this.wIdeal / 75) * eff;
      // air goes to the stomach when the airway is not secured and breaths are big or fast
      if (this.tx.adjunct !== 'igel' && this.tx.adjunct !== 'cric') this.stomachAir += (dt * v.rate / 60 * Math.max(0, v.tv - 0.42) * 0.14 + dt * Math.max(0, v.rate - 14) * 0.0035) * (this.tx.adjunct || this.tx.manoeuvre ? 0.6 : 1.3);
      // breath stacking in obstructed lungs
      this.hyperinfl = clamp(this.hyperinfl + dt * (bron > 0.35 ? (v.rate - 9) * 0.004 * bron : -0.02));
      // positive pressure feeds a tension pneumothorax
      this.ppv = v.rate * v.tv / 6;
    } else { this.hyperinfl = clamp(this.hyperinfl - dt * 0.015); this.ppv = 0; }
    if (this.arrest && this.tx.cpr.on && !v.on) assist += 0.25 * clamp(patency);   // compressions alone move a little air
    this.mvAlv = this.spontMv + assist;
    // regurgitation
    if (this.stomachAir > 1 && this.tx.adjunct !== 'igel' && this.tx.adjunct !== 'cric') { this.stomachAir = 0.2; this.vomit('gastric insufflation'); }
  }
  vomit(why) {
    if (this.t - this.vomitT < 45) return;
    this.vomitT = this.t; this.note('vomit', { why }); this.emit('vomit', { why });
    const protectedAirway = this.tx.adjunct === 'igel' || this.tx.adjunct === 'cric' || this.brain > 0.62 || this.tx.pos === 'recovery';
    if (!protectedAirway) { this.secretions = clamp(this.secretions + 0.75); this.aspirated = clamp(this.aspirated + 0.25); this.note('aspiration'); this.emit('aspiration'); }
    else if (this.brain <= 0.62) this.secretions = clamp(this.secretions + 0.3);
  }

  // ------------------------------------------------------------ gas exchange
  o2Fraction() {
    const v = this.tx.vent, o = this.tx.o2;
    const breathing = this.spontMv > 1;
    let f = 0.21;
    if (o) { if (o.device === 'nc') f = 0.21 + 0.035 * o.flow; else if (o.device === 'nrb') f = breathing ? clamp(0.4 + 0.03 * o.flow, 0.4, 0.85) : 0.3; else if (o.device === 'neb') f = 0.45; else if (o.device === 'mask') f = 0.5; }
    if (v.on) f = v.o2 ? 0.95 : 0.21;
    return f;
  }
  tickGas(dt, m) {
    this.fio2 = this.o2Fraction();
    const k = this.mvAlv / this.frc / 60;                     // alveolar turnover per second
    const vo2 = (this.arrest ? 0.25 + this.cprFlow() : 1) * m.o2Demand * (this.seizing ? 1.5 : 1) * (1 + Math.max(0, this.temp - 37) * 0.1) * (this.wIdeal / 75);
    const drain = 71 / 60 * vo2 * (2.4 / this.frc);
    const pio2 = this.fio2 * 713;
    this.pAO2 = clamp(this.pAO2 + (k * (pio2 - this.pAO2) - drain * clamp(this.pAO2 / 30)) * dt, 0, 680);
    const vco2 = 57 / 60 * vo2 * (2.4 / this.frc);
    this.pCO2 = clamp(this.pCO2 + (vco2 - k * this.pCO2) * dt * 0.13, 8, 140);
    // arterial saturation: well-ventilated blood mixed with shunted venous blood
    const lungShunt = 0.5 * (1 - this.lung.L * this.lungC.L) * 0.7 + 0.5 * (1 - this.lung.R * this.lungC.R) * 0.7;
    const shunt = clamp(this.shunt + this.shuntC + lungShunt + this.aspirated * 0.35, 0, 0.9);
    const vqm = clamp(this.vqm + this.vqmC + 0.6 * (this.bronchoNow || 0));
    const sc = hill(this.pAO2 * (1 - 0.6 * vqm));
    const hb = clamp(this.rbc * this.volN / this.vol, 0.2, 1.2);
    const extraction = clamp(0.26 * (this.coRest / Math.max(this.co, 0.15)) / hb * vo2, 0.1, 0.7);
    this.svo2 = clamp(this.sao2 - extraction, 0.05, 0.85);
    const target = (1 - shunt) * sc + shunt * this.svo2;
    this.sao2 = clamp(approach(this.sao2, target, this.arrest ? 25 : 11, dt), 0.02, 1);
    this.spo2Lag = approach(this.spo2Lag, this.sao2, 14, dt);
    this.hb = hb;
  }

  // ------------------------------------------------------------ brain, heart, pain
  tickOrgans(dt, m) {
    // oxygen delivery relative to normal
    const flowFrac = this.arrest ? this.cprFlow() : this.co / this.coRest;
    const press = this.arrest ? clamp(this.map / 45) : clamp((this.map - 28) / 34);
    const o2 = clamp((this.sao2 - 0.42) / 0.45) * clamp(this.hb / 0.55);
    const brainO2 = Math.min(press, clamp(flowFrac * 3.2)) * o2;
    // reversible function
    const glu = clamp((this.bgl - 12) / 46);
    const narc = this.pCO2 > 70 ? clamp(1 - (this.pCO2 - 70) / 55, 0.25, 1) : 1;
    this.sedation = clamp(m.sed);
    let fn = Math.min(clamp(brainO2 * 1.15), 0.25 + 0.75 * glu, narc) * (1 - this.sedation * 0.85) * this.brainC * (1 - 0.92 * this.brainInjury);
    if (this.seizing) fn = Math.min(fn, 0.08);
    if (this.postictal > 0) { fn = Math.min(fn, 1 - 0.6 * this.postictal); this.postictal = Math.max(0, this.postictal - dt / 600); }
    this.brain = approach(this.brain, clamp(fn), fn < this.brain ? 6 : 18, dt);
    // irreversible injury: about five minutes of no flow, far slower with compressions
    if (brainO2 < 0.2) this.brainInjury = clamp(this.brainInjury + dt * (0.2 - brainO2) / 0.2 / (this.arrest ? 300 : 420) * (this.temp < 34 ? 0.5 : 1));
    // heart
    if (this.arrest) {
      const feed = clamp((this.cpp - 10) / 18) * o2;
      const fib = SHOCKABLE[this.rhythm] ? 1 : 0.55;
      this.energy = clamp(this.energy + dt * (feed * 0.0045 * (1 - this.energy) * 1.5 - (1 - feed) * 0.0021 * fib));
      if (this.noFlow > 600) this.heartInjury = clamp(this.heartInjury + dt / 900);
    } else {
      // coronary flow can rise ~2.6x above resting need (less with coronary disease) before the heart goes short
      const reserve = 2.6 * clamp(1 - (this.coronary || 0) * 1.9, 0.25, 1);
      const supply = clamp((this.dia - 14) / 52, 0, 1.25) * clamp((this.sao2 - 0.3) / 0.65) * clamp(this.hb / 0.6) * reserve;
      const demand = 0.35 + 0.65 * (this.hr / 72) * (Math.max(this.sys, 45) / 120) * (1 + m.inoAdd * 0.5);
      const ratio = Math.min(1, supply / Math.max(demand, 0.2));
      this.ischaemia = clamp(1 - ratio);
      this.energy = clamp(this.energy + dt * (ratio >= 1 ? 0.018 * (1 - this.energy) : -0.0075 * (1 - ratio)));
      if (ratio < 0.6) this.heartInjury = clamp(this.heartInjury + dt * (0.6 - ratio) / 1500);
      // a hypoxic, starving heart is an irritable one
      if (this.energy < 0.3 && this.hr > 60) this.m.vfRisk += (0.3 - this.energy) * 0.004;
    }
    if (this.conscious && this.t > 2) this.wasConscious = true;
    this.pain = this.painC;
    this.painFelt = this.brain > 0.3 ? clamp(this.pain - m.analgesia, 0, 10) : 0;
    // nausea -> vomiting
    const nau = clamp(this.nausea - m.antiemetic);
    if (nau > 0.5 && this.rng() < (nau - 0.5) * dt / 60) this.vomit('nausea');
    // temperature drifts down in the exposed and the shocked
    if (!this.tx.blanket && (this.exposed || this.arrest || this.map < 65)) this.temp -= dt * 0.00035;
    // glucose
    if (this.bglDrift) this.bgl = Math.max(8, this.bgl + this.bglDrift * dt);
  }

  // ------------------------------------------------------------ fluids
  tickFluids(dt) {
    const f = this.tx.fluidsRunning;
    if (f && f.left > 0) {
      const line = f.io ? this.tx.io : this.tx.iv.find(i => i.patent);
      if (!line) { this.tx.fluidsRunning = null; return; }
      const rate = (f.io ? 1.1 : ({ 14: 4.5, 16: 3.4, 18: 2.2, 20: 1.3, 22: 0.7 }[line.gauge] || 2)) * (f.pressure ? 1.8 : 1) * (this.arrest ? 0.6 : 1);   // mL per sim second
      const d = Math.min(f.left, rate * dt); f.left -= d; this.vol += d; this.crystalloid += d; this.fluidsGiven = (this.fluidsGiven || 0) + d;
      if (f.warm !== true) this.temp -= d * 0.00009;
      if (f.left <= 0) { this.emit('bagEmpty', { what: f.what }); this.tx.fluidsRunning = null; }
    }
    // crystalloid leaks out of the circulation
    const leak = this.crystalloid * (1 - Math.exp(-dt / 1500)) * 0.7; this.crystalloid -= leak / 0.7 * 1; this.vol -= leak;
    if (this.m.leak > 0) this.vol = Math.max(this.volN * 0.3, this.vol - this.m.leak * dt);
  }
  bleed(ml) { const frac = Math.min(ml, this.vol * 0.9) / this.vol; this.rbc *= (1 - frac); this.vol -= ml; this.bloodLost = (this.bloodLost || 0) + ml; }

  // ------------------------------------------------------------ read-outs
  get gcs() {
    const b = this.brain; if (this.arrest) return { e: 1, v: 1, m: 1, total: 3 };
    if (this.gcsOverride) return this.gcsOverride(b);
    const e = b > 0.8 ? 4 : b > 0.55 ? 3 : b > 0.32 ? 2 : 1;
    const v = b > 0.88 ? 5 : b > 0.68 ? 4 : b > 0.5 ? 3 : b > 0.3 ? 2 : 1;
    const mo = b > 0.72 ? 6 : b > 0.5 ? 5 : b > 0.36 ? 4 : b > 0.24 ? 3 : b > 0.14 ? 2 : 1;
    return { e, v, m: mo, total: e + v + mo };
  }
  get avpu() { const b = this.brain; if (this.arrest) return 'U'; return b > 0.8 ? 'A' : b > 0.5 ? 'V' : b > 0.25 ? 'P' : 'U'; }
  get conscious() { return !this.arrest && this.brain > 0.5; }
  get canSwallow() { return !this.arrest && this.brain > 0.72 && !this.seizing; }
  get canTalk() { return !this.arrest && this.brain > 0.6 && !this.seizing && this.airwayPatency() > 0.25 && this.rr > 5; }
  get spo2() { return Math.round(clamp(this.spo2Lag, 0, 1) * 100); }
  get perf() { if (this.arrest) return this.tx.cpr.on ? 0.05 : 0; return clamp((this.sys - 52) / 48) * clamp(1.15 - Math.min(this.sym, this.symCap) * 0.55) * (this.temp < 35 ? 0.6 : 1); }
  get etco2() {
    const flow = this.arrest ? this.cprFlow() / 0.30 * 0.52 : Math.sqrt(clamp(this.co / this.coRest, 0.05, 1.1));
    return Math.max(0, this.pCO2 * clamp(flow, 0, 1.05) * (1 - 0.25 * (this.bronchoNow || 0)) * (this.mvAlv < 0.3 ? 0 : 1));
  }
  get radial() { return this.pulse && this.sys >= 82; }
  get carotid() { return this.pulse && this.sys >= 50; }
  get capRefill() { if (this.arrest) return 6; const s = Math.min(this.sym, this.symCap); return clamp(1.4 + s * 3.2 + (this.map < 60 ? 1.2 : 0) - (this.warmShock ? 1.6 : 0), 1, 6); }
  get ventRhythm() { return this.rhythm; }
  outcomeState() { return { alive: !this.arrest, brainInjury: this.brainInjury, heartInjury: this.heartInjury, rosc: this.rosc, downtime: this.downtime, noFlow: this.noFlow, map: this.map, spo2: this.spo2, gcs: this.gcs.total, vol: this.vol / this.volN, aspirated: this.aspirated }; }

  // What the monitor is shown. Sensors that are not attached read nothing.
  vitals() {
    const mon = this.tx.mon, d = this.defib, e = this.ecgMods, c = this.tx.cpr;
    const moving = (this.seizing ? 1 : 0) + (this.shiver ? 0.5 : 0) + (this.conscious && this.painFelt > 7 ? 0.25 : 0);
    let rhythm = this.rhythm, hr = this.hr;
    if (this.pauseUntil > this.t) { rhythm = 'asystole'; }
    if (rhythm === 'pea') hr = this.peaRate || 50;
    if (this.paced && rhythm !== 'vf') rhythm = 'paced';
    const touch = this.touchHeart > this.t;      // a needle against the epicardium shows as ectopy and an injury current
    const assisted = this.tx.vent.on && this.tx.vent.rate > 0;
    const capShape = this.mvAlv < 0.3 ? 'flat' : this.arrest ? 'low' : (this.bronchoNow > 0.3 ? 'sharkfin' : 'normal');
    return {
      ecg: mon.ecg || mon.pads, rhythm, hr, peaLook: this.peaLook, pvc: touch ? Math.max(e.pvc, 0.5) : e.pvc, st: touch ? e.st + 3 : e.st, tInv: e.tInv, peakedT: e.peakedT, wideQRS: e.wideQRS, longQT: e.longQT, lowVoltage: e.lowVoltage, alternans: e.alternans,
      artefact: clamp(moving + (this.moving || 0)), cpr: c.on, cprRate: c.rate || 110, pulse: this.pulse,
      spo2On: mon.spo2, spo2: this.perf > 0.08 ? this.spo2 : null, perf: this.perf,
      capOn: mon.cap, etco2: this.etco2, rr: assisted ? this.tx.vent.rate + (this.spontMv > 1 ? this.rr : 0) : this.rr, capShape,
      nibp: this.tx.nibp ? { sys: this.tx.nibp.sys, dia: this.tx.nibp.dia, age: this.t - this.tx.nibp.t } : null, nibpCycling: this.tx.nibpCycling > 0,
      temp: this.tempShown ?? null, bgl: this.bglShown ?? null, units: 'mgdl',
      defib: { mode: d.mode, energy: d.energy, charge: d.charge, charged: d.charged, sync: d.sync, shocks: d.shocks, paceRate: d.paceRate, paceMa: d.paceMa, capture: d.capture, msg: d.msg },
      clock: this.t, cprClock: c.on ? this.t - c.cycleStart : null, muted: false,
    };
  }
}

function mulberry(seed) { let s = seed >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
