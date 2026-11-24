// What is wrong with the patient. Each condition is a small object with tick(p, dt, m) that pushes on the physiology
// (through the modifier bag m and the per-step channels p.lungC, p.airwayC, p.brainC, p.painC ...), sets examination
// findings (p.find.*) and skin signs (p.fx.skin), and may say how far it has been reversed (for getting a pulse back).
// Scenarios list conditions by name with options: { type: 'tensionPneumo', side: 'L', rate: 0.5 }.
//
// All rates are per sim second unless a comment says per minute.

import { clamp } from './physio.js';

const also = (cur, x) => 1 - (1 - cur) * (1 - x);

export const COND = {
  // ---- bleeding. sites: [{ id, label, region, rate (mL/min at a normal pressure), ext (visible, compressible), fix: { tq: 'legL', pack: true, pressure: true, binder: true, traction: 'legL' }, arterial }]
  hemorrhage(o) {
    return {
      type: 'hemorrhage', sites: o.sites.map(s => Object.assign({ clot: 0, ctl: 0, lost: 0 }, s)),
      control(p, s) {
        let c = 0; const t = p.tx, f = s.fix || {};
        if (f.tq && t.tq[f.tq]) c = Math.max(c, 0.99 * t.tq[f.tq].q);
        if (t.dressings[s.id]) { const d = t.dressings[s.id]; c = Math.max(c, d.kind === 'pack' ? (f.pack ? 0.9 * d.q : 0.5) : d.kind === 'pressure' ? (s.arterial ? 0.45 : 0.85) : 0.25); }
        if (f.pressure && t.pressureOn === s.id) c = Math.max(c, s.arterial ? 0.7 : 0.9);
        if (f.binder && t.binder) c = Math.max(c, 0.6);
        if (f.traction && t.splints[f.traction] === 'traction') c = Math.max(c, 0.55);
        return c;
      },
      tick(p, dt, m) {
        let total = 0, pain = 0, ext = 0;
        for (const s of this.sites) {
          s.ctl = this.control(p, s);
          const pressure = p.arrest ? clamp(p.map / 90) : Math.pow(clamp(p.map / 90, 0.05, 1.7), 1.3);
          const flow = s.rate / 60 * pressure * (1 - s.ctl) * (1 - 0.88 * s.clot) * (p.meds.has('anticoagulant') ? 1.35 : 1);
          s.flow = flow; total += flow; p.bleed(flow * dt); s.lost += flow * dt;
          if (s.ext && flow > 0.05) ext += flow;
          // clots form in the low-pressure, treated wound; a restored pressure can blow them off
          const grow = (p.map < 80 ? 1 : 0.35) * (0.0011 + 0.0022 * m.clotAid) * (s.ext ? 0.3 + 2 * s.ctl : 1) * (p.temp < 35 ? 0.5 : 1) * (p.meds.has('anticoagulant') ? 0.4 : 1);
          s.clot = clamp(s.clot + grow * dt, 0, 0.92);
          if (p.sys > 112 && (p.fluidsGiven || 0) > 600 && s.clot > 0.25 && s.ctl < 0.8 && !s.popped && !p.arrest) { s.clot *= 0.3; s.popped = p.t; p.emit('rebleed', { site: s.label }); p.error('popClot', `Pressure driven above 110 systolic with an uncontrolled bleed (${s.label}): the clot gave way.`, 2); }
          if (s.popped && p.t - s.popped > 240) s.popped = 0;
          pain = Math.max(pain, s.pain || 5);
        }
        this.rate = total * 60; this.extRate = ext * 60;
        p.painC = Math.max(p.painC, pain);
      },
      reversed(p) { return clamp(1 - (this.rate - 20) / 120); },
    };
  },

  // ---- air under pressure in one side of the chest
  tensionPneumo(o) {
    return {
      type: 'tensionPneumo', side: o.side || 'L', sev: o.sev ?? 0.25, rate: (o.rate ?? 0.25) / 60, open: !!o.open, maxOpen: 0.45,
      tick(p, dt, m) {
        const S = this.side, t = p.tx;
        const breathing = p.spontMv > 0.4 ? 1 : 0.1;
        let g = this.rate * (breathing + 2.6 * (p.ppv || 0));
        const dec = t.decomp[S], thor = t.thoracostomy[S], seal = t.seal[S];
        this.relieved = false;
        if (thor) { this.sev = Math.max(0.04, this.sev - dt * 0.12); g = 0; this.relieved = true; }
        else if (dec && dec.ok) {
          if (p.t - dec.t < dec.dur) { this.sev = Math.max(0.14, this.sev - dt * 0.09); g = 0; this.relieved = true; }
          else if (!dec.failed) { dec.failed = true; p.emit('decompFailed', { side: S }); }
        }
        if (this.open) {
          if (!seal) { g *= this.sev < this.maxOpen ? 1 : 0.55; p.tvC *= 0.8; }                    // sucking wound: air goes both ways
          else if (seal.vented) { g = this.relieved ? 0 : g * 0.15; if (!this.relieved && this.sev > 0.35) this.sev -= dt * 0.01; }
          else if (!this.relieved) { g *= 1.4; if (!this.warned && this.sev > 0.6) { this.warned = true; p.error('occlusiveSeal', 'A non-vented occlusive dressing on an open chest wound trapped air: tension pneumothorax.', 2); } }
        }
        this.sev = clamp(this.sev + g * dt);
        const s = this.sev;
        p.lungC[S] *= 1 - 0.92 * Math.pow(s, 0.7);
        m.obstruct *= 1 - 0.9 * Math.pow(clamp((s - 0.42) / 0.58), 1.25);
        p.painC = Math.max(p.painC, 6); p.anxiety = Math.max(p.anxiety, 0.5 + 0.5 * s);
        const other = S === 'L' ? 'R' : 'L';
        p.find['breath' + S] = s > 0.55 ? 'absent' : s > 0.2 ? 'diminished' : null;
        p.find['percuss' + S] = s > 0.3 ? 'hyper-resonant' : null;
        if (s > 0.8) p.find.trachea = `deviated to the ${other === 'L' ? 'left' : 'right'}`;
        if (s > 0.5 && p.vol / p.volN > 0.75) p.find.jvd = 'distended';
        p.find.chestRise = s > 0.3 ? `${S === 'L' ? 'left' : 'right'} side barely moving` : null;
      },
      reversed() { return clamp(1 - (this.sev - 0.3) / 0.35); },
    };
  },

  haemothorax(o) {
    return {
      type: 'haemothorax', side: o.side || 'L', vol: o.vol || 0, rate: (o.rate || 60) / 60,
      tick(p, dt) {
        const f = this.rate * clamp(p.map / 90, 0.05, 1.5) * (1 - clamp(this.vol / 2800));
        this.vol += f * dt; p.bleed(f * dt);
        p.lungC[this.side] *= 1 - Math.min(0.8, this.vol / 2600);
        if (this.vol > 400) { p.find['breath' + this.side] = p.find['breath' + this.side] || 'diminished at the base'; p.find['percuss' + this.side] = 'dull'; }
        p.painC = Math.max(p.painC, 6);
      },
    };
  },

  // ---- blood in the pericardium
  tamponade(o) {
    return {
      type: 'tamponade', vol: o.vol ?? 60, rate: (o.rate ?? 25) / 60, clotted: o.clotted ?? 0.5, wound: o.wound !== false,
      tick(p, dt, m) {
        if (p.tx.thoracotomy) { this.vol = Math.max(0, this.vol - dt * 40); if (p.tx.thoracotomy.woundControlled) this.rate = 0; else if (this.wound) p.bleed(this.rate * 1.5 * dt * clamp(p.map / 60, 0.1, 1)); }
        else { const f = this.rate * clamp(p.map / 80, 0.15, 1.3) * clamp(1 - this.vol / 420); this.vol += f * dt; p.bleed(f * dt); }
        const s = this.sev = clamp(this.vol / 260);
        m.obstruct *= 1 - 0.94 * Math.pow(clamp((s - 0.28) / 0.72), 1.15);
        p.ecgMods.lowVoltage = s > 0.4; p.ecgMods.alternans = s > 0.6;
        if (s > 0.35) p.find.heartSounds = 'muffled, distant';
        if (s > 0.4 && p.vol / p.volN > 0.7) p.find.jvd = 'distended';
        p.anxiety = Math.max(p.anxiety, s);
      },
      // needle aspiration: liquid blood only; clot does not come up a needle
      aspirate(p, ml) { const liquid = this.vol * (1 - this.clotted); const got = Math.min(ml, liquid); this.vol -= got; return got; },
      reversed() { return clamp(1 - (this.sev - 0.3) / 0.3); },
    };
  },

  // ---- heart attack
  mi(o) {
    return {
      type: 'mi', territory: o.territory || 'inferior', rv: !!o.rv, sev: o.sev ?? 0.7, vfAt: o.vfAt ?? null, vfRisk: o.vfRisk ?? 0.00015, brady: o.brady ?? (o.territory !== 'anterior'), pain: o.pain ?? 8,
      init(p) { p.twelve = this.rv ? 'inferiorRV' : this.territory === 'anterior' ? 'anteriorSTEMI' : this.territory === 'lateral' ? 'lateralSTEMI' : 'inferiorSTEMI'; if (this.rv) { p.rvInfarct = true; p.ntgSens = Math.max(p.ntgSens, 2.2); } this.ino0 = p.ino; },
      tick(p, dt, m) {
        const asa = p.asa || 0;
        this.sev = clamp(this.sev + dt * 0.00012 * (1 - 0.7 * asa));
        p.coronary = this.sev * 0.34;
        p.ino = this.ino0 * (1 - (this.territory === 'anterior' ? 0.5 : 0.22) * this.sev);
        p.ecgMods.st = this.territory === 'inferior' ? 2 + 2.5 * this.sev : this.territory === 'lateral' ? 1.2 : 0.4;
        p.ecgMods.pvc = Math.max(p.ecgMods.pvc, 0.06 + 0.1 * (p.ischaemia || 0));
        if (this.brady && !p.arrest) m.vagal = Math.max(m.vagal, 0.42 * this.sev);
        
        const relief = 2.8 * (p.ntg || 0);
        p.painC = Math.max(p.painC, this.pain - relief);
        p.nausea = Math.max(p.nausea, 0.38); p.anxiety = Math.max(p.anxiety, 0.6);
        p.fx.skin.sweat = Math.max(p.fx.skin.sweat || 0, 0.7); p.fx.skin.pallor = Math.max(p.fx.skin.pallor || 0, 0.5);
        if (!p.arrest) {
          m.vfRisk += this.vfRisk * (1 + 4 * (p.ischaemia || 0)) * (p.rosc ? 2.5 : 1);
          if (this.vfAt != null && p.t >= this.vfAt && !this.fired) { this.fired = true; p.vfWhy = 'acute myocardial infarction'; p.setRhythm('vf', 'acute MI'); }
        }
      },
    };
  },

  // ---- primary cardiac arrest found on arrival
  cardiacArrest(o) {
    return {
      type: 'cardiacArrest', rhythm: o.rhythm || 'vf', downtime: o.downtime ?? 240, bystanderCPR: !!o.bystanderCPR, cause: o.cause || 'cardiac',
      init(p) {
        const eff = this.bystanderCPR ? 0.3 : 1;
        p.energy = clamp(1 - this.downtime * 0.0021 * eff, 0.08, 1);
        p.brainInjury = clamp(Math.max(0, this.downtime - 60) * (this.bystanderCPR ? 0.1 : 1) / 330);
        p.sao2 = 0.6; p.spo2Lag = 0.6; p.pAO2 = 35; p.pCO2 = 62; p.brain = 0; p.vfWhy = this.cause;
        p.setRhythm(this.rhythm, this.cause); p.downtime = this.downtime; p.noFlow = this.downtime * eff;
        if (this.rhythm === 'pea') { p.peaRate = 40; p.peaLook = 'wide'; }
      },
      tick(p, dt, m) { if (p.rosc && !p.arrest) { p.ino = Math.min(p.ino, 0.72); m.vfRisk += 0.0006 * (1 - 0.75 * m.antiarr) * (this.cause === 'cardiac' ? 1 : 0.2); } },
    };
  },

  // ---- allergy
  anaphylaxis(o) {
    return {
      type: 'anaphylaxis', peak: o.sev ?? 0.85, med: o.start ?? 0.25, exposure: 1, airway: o.airway ?? false, biphasic: !!o.biphasic,
      tick(p, dt, m) {
        this.exposure = Math.max(this.biphasic && p.t > 900 && p.t < 1300 ? 0.6 : 0, this.exposure - dt / 1700);
        const target = this.peak * (this.exposure > 0.05 ? 1 : 0);
        this.med = clamp(this.med + (target - this.med) * dt / 110 - m.adr * 0.011 * dt);
        const eff = this.eff = this.med * (1 - 0.78 * m.adr);
        m.svrMul *= 1 - 0.68 * eff; m.leak += eff * 2.3; m.veno += 0.12 * eff;
        p.bronchoC = also(p.bronchoC, 0.62 * eff);
        p.airwayC *= 1 - (this.airway ? 0.99 : 0.45) * Math.pow(eff, 1.4);
        p.warmShock = eff > 0.3; p.anxiety = Math.max(p.anxiety, 0.4 + 0.6 * eff); p.nausea = Math.max(p.nausea, 0.3 * eff);
        p.fx.skin.flush = Math.max(p.fx.skin.flush || 0, eff * (1 - 0.5 * (p.antihist || 0)));
        p.find.skinExtra = eff > 0.25 ? 'raised urticarial rash over the chest and arms, lips and eyelids swollen' : null;
        if (eff > 0.45 && this.airway) p.find.airwayExtra = 'tongue and lips grossly swollen';
      },
      reversed() { return clamp(1 - (this.eff || 0) * 1.3); },
    };
  },

  // ---- airway swelling that marches on regardless (ACE-inhibitor angio-oedema, inhalation burn)
  airwaySwelling(o) {
    return {
      type: 'airwaySwelling', sev: o.sev ?? 0.3, rate: (o.rate ?? 0.05) / 60, epi: o.epi ?? 0.15, max: o.max ?? 1, why: o.why || 'angio-oedema',
      tick(p, dt, m) {
        this.sev = clamp(this.sev + this.rate * (1 - this.epi * m.adr * 4) * dt, 0, this.max);
        p.airwayC *= 1 - Math.pow(this.sev, 1.6);
        p.anxiety = Math.max(p.anxiety, this.sev);
        if (this.sev > 0.4) p.find.airwayExtra = this.why === 'burn' ? 'soot in the mouth, singed nasal hair, hoarse voice, swelling worsening' : 'tongue massively swollen, cannot swallow saliva';
        p.swollenAirway = this.sev;                       // above ~0.6 an oral airway or supraglottic device will not pass
      },
      reversed(p) { return p.tx.adjunct === 'cric' ? 1 : clamp(1 - (this.sev - 0.5) / 0.3); },
    };
  },

  // ---- foreign body
  choking(o) {
    return {
      type: 'choking', lodged: true, depth: o.depth ?? 0.6, item: o.item || 'a piece of steak',
      tick(p) { if (this.lodged) { p.airwayC *= 0.015; p.anxiety = 1; p.find.airwayExtra = p.conscious ? 'silent, hands at the throat, cannot cough or speak' : null; } },
      // attempt: 'backBlows' | 'thrusts' | 'magill' | 'cpr'. Returns true if it came out.
      attempt(p, how, skill = 1) {
        if (!this.lodged) return false;
        const pr = { backBlows: 0.22, thrusts: 0.3, cpr: 0.12, magill: 0.85 * skill }[how] * (1 - this.depth * (how === 'magill' ? 0.5 : 0.75));
        if (p.rng() < pr) { this.lodged = false; p.note('fbaoCleared', { how }); p.emit('fbaoCleared', { how, item: this.item }); return true; }
        return false;
      },
      reversed(p) { return this.lodged && p.tx.adjunct !== 'cric' ? 0 : 1; },
    };
  },

  // ---- asthma / COPD
  asthma(o) {
    return {
      type: 'asthma', sev: o.sev ?? 0.7, trend: (o.trend ?? 0.012) / 60, response: o.response ?? 1, copd: !!o.copd,
      init(p) { p.betaResponse = this.response; p.fatigue = o.fatigue ?? 0.1; },
      tick(p, dt, m) {
        const relief = m.bronchoRelief;
        this.sev = clamp(this.sev + (this.trend - relief * 0.0016 * this.response) * dt, 0.05, 0.98);
        p.bronchoC = also(p.bronchoC, this.sev);
        const bron = this.sev * (1 - relief);
        p.tvC *= 1 - 0.3 * bron;
        const work = clamp((bron - 0.38) / 0.5);
        p.fatigue = clamp(p.fatigue + dt * (work > 0 ? work / 700 : -1 / 900));
        p.anxiety = Math.max(p.anxiety, 0.3 + 0.7 * bron);
        if (this.copd && p.sao2 > 0.95 && p.tx.o2) m.respDrive -= 0.3;
        p.find.speech = bron > 0.7 ? 'cannot speak, nods only' : bron > 0.5 ? 'speaks in single words' : bron > 0.32 ? 'short phrases' : null;
        p.find.breathBoth = bron > 0.82 ? 'almost silent chest, minimal air movement' : bron > 0.3 ? 'widespread expiratory wheeze' : bron > 0.15 ? 'scattered wheeze' : null;
        p.find.posture = bron > 0.45 ? 'sitting bolt upright, tripod position, using accessory muscles' : null;
      },
      reversed(p) { return clamp(1 - ((p.bronchoNow || 0) - 0.45) / 0.35) * clamp(1 - p.hyperinfl * 1.5); },
    };
  },

  // ---- low blood sugar
  hypoglycaemia(o) {
    return {
      type: 'hypoglycaemia',
      init(p) { p.bgl = o.bgl ?? 32; p.bglDrift = -(o.drift ?? 0.6) / 60; p.glycogen = o.glycogen !== false; this.until = o.until ?? 2400; },
      tick(p, dt, m) {
        if (p.t > this.until) p.bglDrift = 0;
        if (p.bgl < 60) { m.symAdd += 0.25; p.fx.skin.sweat = Math.max(p.fx.skin.sweat || 0, clamp((70 - p.bgl) / 30)); p.fx.skin.pallor = Math.max(p.fx.skin.pallor || 0, 0.4); }
        if (p.bgl < 24 && !p.seizing && !p.get('seizure') && p.rng() < dt / 150) p.add(COND.seizure({ cause: 'hypoglycaemia', status: true }));
        if (o.focal && p.bgl < 55) p.find.fast = { face: 'no droop', arm: `${o.focal} arm drifts down`, speech: 'slurred, confused words', positive: true };
      },
    };
  },

  // ---- heroin, fentanyl, methadone
  opioidOD(o) {
    return {
      type: 'opioidOD', level: o.dose ?? 55, half: o.long ? 28000 : 5200, co: o.co || null,
      init(p) { if (o.dependent !== false) p.flags.opioidDependent = true; if (this.co === 'alcohol') p.alcohol = true; },
      tick(p, dt, m) {
        this.level *= Math.exp(-Math.LN2 / this.half * dt);
        m.opioid += this.level;
        if (this.co) { m.respDep = also(m.respDep, 0.32); m.sed += 0.3; }      // the part naloxone will not touch
      },
    };
  },

  // ---- convulsions
  seizure(o) {
    return {
      type: 'seizure', cause: o.cause || 'epilepsy', status: o.status !== false, dur: o.dur ?? 150, on: true, t0: null, recurs: 0,
      tick(p, dt, m) {
        if (this.t0 == null) { this.t0 = p.t; if (this.on) { p.note('seizureStart'); p.emit('seizureStart'); } }
        if (this.on) {
          p.seizing = true; p.airwayC *= 0.72; p.tvC *= 0.7; p.temp += dt * 0.0007; p.secretions = Math.max(p.secretions, 0.15);
          p.find.jaw = 'clenched (trismus)';
          const b = p.benzo || 0;
          let hazard = b * b * 0.07;
          if (!this.status && p.t - this.t0 > this.dur) hazard += 0.05;
          if (this.cause === 'hypoglycaemia' && p.bgl > 70) hazard += 0.08;
          if (p.rng() < hazard * dt) { this.on = false; this.tEnd = p.t; p.seizing = false; p.postictal = 1; p.note('seizureStop', { dur: p.t - this.t0 }); p.emit('seizureStop'); }
          if (p.t - this.t0 > 900) p.brainInjury = clamp(p.brainInjury + dt / 3000);
        } else {
          p.seizing = false;
          const untreatedCause = this.cause === 'hypoglycaemia' && p.bgl < 55;
          const prone = untreatedCause ? 1 / 100 : (this.status && (p.benzo || 0) < 0.25 ? 1 / 240 : 0);
          if (prone && p.t - this.tEnd > 60 && p.rng() < prone * dt) { this.on = true; this.t0 = p.t; this.recurs++; p.note('seizureStart', { again: true }); p.emit('seizureStart', { again: true }); }
        }
      },
    };
  },

  // ---- stroke
  stroke(o) {
    return {
      type: 'stroke', side: o.side || 'left', sev: o.sev ?? 0.5, bleed: !!o.bleed,
      init(p) { this.map0 = p.base.map; },
      tick(p, dt, m) {
        if (this.bleed) { this.sev = clamp(this.sev + dt / 2600); if (this.sev > 0.7) { m.vagal = Math.max(m.vagal, 0.4); m.svrMul *= 1.25; p.nausea = Math.max(p.nausea, 0.6); } }
        let c = 1 - 0.3 * this.sev - (this.bleed ? 0.5 * clamp((this.sev - 0.55) / 0.45) : 0);
        if (p.map < this.map0 * 0.82) { c -= 0.25; if (p.ntg > 0.2 || p.level('nitroglycerin') > 0.05) p.error('strokeBP', 'Lowered the blood pressure of an acute stroke patient: the brain was depending on it.', 2); }
        p.brainC *= clamp(c, 0.05, 1);
        const S = this.side;
        p.find.fast = { face: `${S} facial droop`, arm: `${S} arm falls to the bed`, speech: this.sev > 0.6 ? 'no words, only sounds' : 'slurred, wrong words', positive: true };
        p.find.pupils = this.bleed && this.sev > 0.75 ? `${S === 'left' ? 'right' : 'left'} pupil 6 mm and fixed, other 3 mm reactive` : null;
        p.find.limbs = `${S} arm and leg weak, ${S === 'left' ? 'right' : 'left'} side normal power`;
      },
    };
  },

  sepsis(o) {
    return {
      type: 'sepsis', sev: o.sev ?? 0.6, source: o.source || 'chest',
      init(p) { p.temp = o.temp ?? 39.4; },
      tick(p, dt, m) {
        this.sev = clamp(this.sev + dt / 9000);
        m.svrMul *= 1 - 0.46 * this.sev; m.leak += 0.25 * this.sev; m.respDrive += 0.45 * this.sev; p.brainC *= 1 - 0.22 * this.sev; p.warmShock = this.sev < 0.8;
        if (this.source === 'chest') { p.shuntC += 0.14 * this.sev; p.find.breathR = 'coarse crackles at the right base'; }
        p.fx.skin.flush = Math.max(p.fx.skin.flush || 0, 0.5); p.fx.skin.sweat = Math.max(p.fx.skin.sweat || 0, 0.5);
      },
    };
  },

  headInjury(o) {
    return {
      type: 'headInjury', sev: o.sev ?? 0.4, expand: (o.expand ?? 0) / 60, lucidUntil: o.lucidUntil ?? 0, side: o.side || 'right', insult: 0,
      tick(p, dt, m) {
        if (p.t > this.lucidUntil) this.sev = clamp(this.sev + this.expand * dt);
        if (!p.arrest && (p.spo2 < 90 || p.sys < 90)) { this.insult += dt; if (this.insult > 60) p.flags.secondaryInsult = this.insult; }
        const s = this.sev;
        p.brainC *= clamp(1 - s * 0.95, 0.03, 1);
        if (s > 0.72) { m.vagal = Math.max(m.vagal, 0.5); m.svrMul *= 1.35; p.find.breathingExtra = 'irregular, with long pauses'; p.find.pupils = `${this.side} pupil 7 mm and fixed, other 3 mm sluggish`; }
        else if (s > 0.5) p.find.pupils = `${this.side} pupil 5 mm sluggish, other 3 mm reactive`;
        if (s > 0.45) p.nausea = Math.max(p.nausea, 0.55);
        p.painC = Math.max(p.painC, 5);
      },
    };
  },

  spinal(o) {
    return {
      type: 'spinal', level: o.level || 'C5',
      tick(p, dt, m) {
        m.svrMul *= 0.62; m.hrCap = Math.min(m.hrCap, 62); p.tvC *= 0.7; p.warmShock = true;
        p.find.limbs = 'no movement or sensation in the legs, weak arms, priapism';
        p.find.breathingExtra = 'abdominal (diaphragmatic) breathing only';
        if (p.flags.moved && !p.tx.collar && !this.flagged) { this.flagged = true; p.error('spineMoved', 'Moved a patient with a suspected cervical spine injury without immobilising the neck.', 3); p.flags.cordWorse = true; }
      },
    };
  },

  pe(o) {
    return {
      type: 'pe', sev: o.sev ?? 0.6,
      init(p) { p.twelve = 'pe'; },
      tick(p, dt, m) {
        m.obstruct *= 1 - 0.72 * this.sev; p.shuntC += 0.24 * this.sev; p.vqmC += 0.2 * this.sev;
        p.painC = Math.max(p.painC, 5); p.anxiety = Math.max(p.anxiety, 0.8);
        if (this.sev > 0.5 && p.vol / p.volN > 0.8) p.find.jvd = 'distended';
        p.find.legs = 'right calf swollen, warm and tender';
      },
      reversed() { return 0.3; },
    };
  },

  hyperK(o) {
    return {
      type: 'hyperK', k: o.k ?? 7.2, rise: (o.rise ?? 0.02) / 60,
      init(p) { p.twelve = 'hyperkalaemia'; },
      tick(p, dt, m) {
        this.k += this.rise * dt;
        const k = this.kEff = this.k - 0.9 * m.kShift;
        const tox = clamp((k - 6.0) / 2.2) * (1 - 0.92 * m.memStab);
        p.ecgMods.peakedT = k > 6 && m.memStab < 0.6; p.ecgMods.wideQRS = tox > 0.45;
        if (tox > 0.3) { m.hrMul *= 1 - 0.5 * tox; m.inoMul *= 1 - 0.3 * tox; }
        if (!p.arrest && tox > 0.5) { m.vfRisk += (tox - 0.5) * 0.004; if (tox > 0.85 && p.rng() < dt / 90) { p.peaLook = 'wide'; p.peaRate = 30; p.arrestWhy = 'hyperkalaemia'; p.setRhythm('pea', 'hyperkalaemia'); } }
        this.tox = tox;
        p.find.medAlert = 'dialysis fistula in the left forearm';
        p.find.limbs = 'generalised weakness, heavy legs';
      },
      reversed() { return clamp(1 - (this.tox || 0) * 1.6); },
    };
  },

  // ---- rhythm problems with a pulse
  svt(o) {
    return {
      type: 'svt', rate: o.rate ?? 192,
      init(p) { p.base.rhythm = 'svt'; p.rhythm = 'svt'; p.hrFixed = this.rate; p.twelve = 'svt'; p.adenosine = c => this.adeno(p, c); },
      adeno(p, c) { if (p.rhythm !== 'svt') return; p.pauseUntil = p.t + 7; if (p.rng() < (c > 9 ? 0.92 : 0.62)) this.convert(p, 'adenosine'); },
      vagal(p, modified) { if (p.rhythm !== 'svt') return false; if (p.rng() < (modified ? 0.43 : 0.17)) { this.convert(p, 'vagal manoeuvre'); return true; } return false; },
      convert(p, how) { p.base.rhythm = 'sinus'; p.hrFixed = null; p.hr = 96; p.twelve = 'sinusTach'; p.setRhythm('sinus', how); p.flags.converted = how; },
      tick(p) { if (p.rhythm === 'svt') { p.painC = Math.max(p.painC, 3); p.anxiety = Math.max(p.anxiety, 0.7); p.ecgMods.st = -1; } },
    };
  },
  vt(o) {
    return {
      type: 'vt', rate: o.rate ?? 186, decay: o.decay ?? 1 / 600,
      init(p) { p.base.rhythm = 'vt'; p.rhythm = 'vt'; p.hrFixed = this.rate; p.twelve = 'vt'; },
      tick(p, dt, m) {
        if (p.rhythm !== 'vt') return;
        p.anxiety = Math.max(p.anxiety, 0.8); p.painC = Math.max(p.painC, 4);
        if (m.antiarr > 0.4 && p.rng() < m.antiarr * dt / 260) { p.base.rhythm = 'sinus'; p.hrFixed = null; p.setRhythm('sinus', 'amiodarone'); return; }
        if (p.rng() < this.decay * dt * (1 - 0.5 * m.antiarr)) { p.vfWhy = 'ventricular tachycardia degenerated'; p.hrFixed = null; p.setRhythm('vf', 'VT degenerated'); }
      },
    };
  },
  heartBlock(o) {
    return {
      type: 'heartBlock', rate: o.rate ?? 32, threshold: o.threshold ?? 75,
      init(p) { p.base.rhythm = 'chb'; p.rhythm = 'chb'; p.hrFixed = this.rate; p.twelve = 'chb'; p.paceThreshold = this.threshold; },
      tick(p, dt, m) { if (p.rhythm === 'chb') { p.hrFixed = p.paced ? p.defib.paceRate : this.rate + 12 * m.adr; p.ecgMods.wideQRS = true; } },
    };
  },

  // ---- fractures and chest wall
  fracture(o) {
    return {
      type: 'fracture', where: o.where || 'legL', pain: o.pain ?? 8, find: o.find,
      tick(p) {
        const sp = p.tx.splints[this.where];
        p.painC = Math.max(p.painC, this.pain - (sp ? (sp === 'traction' ? 3.5 : 2.5) : 0) + (p.moving && !sp ? 1.5 : 0));
        if (this.find) Object.assign(p.find, this.find);
      },
    };
  },
  flailChest(o) {
    return { type: 'flailChest', side: o.side || 'R', tick(p) { p.tvC *= 0.6; p.lungC[this.side] *= 0.75; p.shuntC += 0.1; p.painC = Math.max(p.painC, 8); p.find.chestRise = `paradoxical movement of the ${this.side === 'L' ? 'left' : 'right'} chest wall`; } };
  },

  // ---- intoxication (colours everything else)
  alcohol(o) { return { type: 'alcohol', init(p) { p.alcohol = true; }, tick(p, dt, m) { m.sed += o.sed ?? 0.25; p.find.smell = 'strong smell of alcohol'; p.nausea = Math.max(p.nausea, 0.3); } }; },

  // ---- low body temperature
  hypothermia(o) {
    return { type: 'hypothermia', init(p) { p.temp = o.temp ?? 31; p.twelve = 'hypothermia'; }, tick(p, dt, m) { const c = clamp((35 - p.temp) / 7); m.hrMul *= 1 - 0.45 * c; m.respDrive -= 0.3 * c; p.brainC *= 1 - 0.5 * c; if (p.temp < 30 && !p.arrest) m.vfRisk += 0.0004 + (p.moving ? 0.004 : 0); p.shiver = p.temp > 32; if (p.tx.blanket) p.temp += dt * 0.0006; } };
  },
};

export function addConditions(p, list) { for (const c of list || []) { const f = COND[c.type]; if (!f) throw new Error('unknown condition ' + c.type); p.add(f(c)); } return p; }
