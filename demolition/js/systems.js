// The parts of a data centre that make the destruction matter: power, cooling, network,
// fire detection and suppression, and the running cost of all of it.
import * as THREE from 'three';
import { ROWS, RACKS_PER_ROW, COST, THERMAL, FIRE, SHIFT_SECONDS } from './config.js';

export class Ledger {
  constructor() { this.items = {}; this.downtime = 0; this.outageMinutes = 0; }
  add(key, label, n, cost) { const it = this.items[key] ||= { label, count: 0, cost: 0 }; it.count += n; it.cost += cost; }
  get total() { return Object.values(this.items).reduce((a, b) => a + b.cost, 0) + this.downtime; }
}

export class Systems {
  constructor(G) {
    this.G = G; this.ledger = new Ledger();
    this.stats = { ejected: 0, doors: 0, toppled: 0, maxChain: 0, glassBroken: 0, roofBroken: 0, tilesLifted: 0, cylRocket: 0, fiberCut: 0, maxInlet: 0, discharged: false, epo: false, sprinklers: 0, hdd: 0 };
    this.deathKind = null;
    this.shiftLeft = SHIFT_SECONDS; this.health = 100; this.dead = false; this.over = false; this.facts = [];
    this.power = new Power(this); this.thermal = new Thermal(this); this.network = new Network(this); this.suppression = new Suppression(this);
    this.fires = []; this.fireId = 0; this.tick = 0;
    this.objectives = [
      { id: 'door', text: 'Knock a door off a rack', test: s => s.doors > 0 },
      { id: 'tile', text: 'Lift a floor tile', test: s => s.tilesLifted > 0 },
      { id: 'eject', text: 'Eject 50 servers', test: s => s.ejected >= 50 },
      { id: 'topple', text: 'Topple a rack (shear its anchors, then push)', test: s => s.toppled > 0 },
      { id: 'chain', text: 'Domino: five racks in one chain', test: s => s.maxChain >= 5 },
      { id: 'glass', text: 'Breach the hot-aisle containment', test: s => s.glassBroken > 0 },
      { id: 'fiber', text: 'Cut the fibre', test: s => s.fiberCut > 0 },
      { id: 'thermal', text: 'Thermal event: inlet above 35 °C', test: s => s.maxInlet > 35 },
      { id: 'agent', text: 'Trigger the clean-agent discharge', test: s => s.discharged },
      { id: 'epo', text: 'Hit the EPO', test: s => s.epo },
      { id: 'million', text: '$1,000,000 in damage', test: () => this.ledger.total >= 1e6 },
      { id: 'tenmil', text: '$10,000,000 in damage', test: () => this.ledger.total >= 1e7 },
    ];
    this.objectives.forEach(o => o.done = false);
  }
  init() { this.power.recompute(); this.G.hud.objectives(this.objectives); }
  log(m, c) { this.G.hud.log(m, c); }

  // ---------------------------------------------------------------- events
  startFire(pos, rack, why) {
    if (rack && this.fires.some(f => f.rack === rack && !f.out)) return;
    const f = { id: this.fireId++, pos: pos.clone(), rack, intensity: 0.02, t: 0, out: false, sprinkler: 0, why };
    this.fires.push(f); this.G.audio.fireCrackle(f.id, true);
    this.log(`Fire: ${why}${rack ? ' in ' + rack.name : ''}.`, 'bad');
  }
  arcFlash(point, what) {
    const fx = this.G.fx; fx.screenFlash('rgba(255,255,255,1)', 1500); fx.sparkBurst(point, 400, null, 2, 14); fx.puff(point, 30, 0.7);
    this.G.audio.arcFlash(); this.startFire(point.clone(), null, 'arc flash'); this.deathKind = 'arc';
    this.G.gameOver(`Arc flash. You put a sledgehammer into ${what}. An arc flash at this voltage is roughly 20,000 °C and hits like a shotgun of molten copper; the shift ended with the paramedics. Trip it, lock it, tag it, test it dead: that is the whole job.`, 'death');
  }
  pressEPO(byHammer) {
    const e = this.G.world.epo;
    if (this.power.epo) return;
    if (!byHammer && e.armed <= 0) { e.armed = 3; this.G.audio.click(); this.log('EPO: lift the cover and press again to confirm.'); return; }
    this.power.epo = true; this.stats.epo = true; e.armed = 0;
    this.G.audio.breaker(); this.G.audio.thud(1.2); this.G.setBlackout(true);
    this.log('EMERGENCY POWER OFF. UPS output, every PDU and every CRAC dropped at once. The lights stay on: they are on the house panel, not the critical bus.', 'bad');
    this.log('In real life this is a résumé-generating event.', 'warn');
    this.power.recompute();
  }
  pullStation(ent) {
    if (ent.pulled) return; ent.pulled = true; this.G.audio.click();
    if (ent.release) this.suppression.manualPull();
    else this.suppression.alarmPull();
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    if (this.over) return;
    this.shiftLeft -= dt; this.tick += dt;
    const W = this.G.world;
    if (W.epo.armed > 0) W.epo.armed -= dt;
    this.power.update(dt); this.thermal.update(dt); this.updateFires(dt); this.suppression.update(dt); this.network.update(dt);
    // offline accounting (rack-weighted downtime, Ponemon $9k/min)
    let offline = 0;
    for (const r of W.racks) { r.offline = !r.powered || !r.net || r.destroyed; if (r.offline) offline++; }
    this.offline = offline;
    if (offline > 0) { const frac = offline / W.racks.length; this.ledger.outageMinutes += frac * dt / 60; this.ledger.downtime += frac * dt / 60 * COST.downtimePerMinute; }
    // player hazards
    this.playerHazards(dt);
    // objectives
    let changed = false;
    for (const o of this.objectives) if (!o.done && o.test(this.stats)) { o.done = true; changed = true; this.G.audio.chime(); this.log(`Objective: ${o.text}`, 'good'); }
    if (changed) this.G.hud.objectives(this.objectives);
    // audio bed
    const fans = this.power.racksPowered / W.racks.length, cr = this.thermal.cracRunning / W.cracs.length;
    this.G.audio.setHum(fans, cr);
    if (this.shiftLeft <= 0) this.G.gameOver('Shift over. Security walked you out; the incident report follows.', 'shift');
  }
  updateFires(dt) {
    const W = this.G.world, fx = this.G.fx, conc = this.suppression.concentration;
    for (const f of this.fires) {
      if (f.out) continue;
      f.t += dt;
      let growth = FIRE.growth;
      if (conc >= 0.8) growth -= 0.35; else if (conc > 0) growth -= conc * 0.15;
      if (f.sprinkler > 0) { growth -= 0.5; f.sprinkler -= dt; fx.waterSpray(f.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), 12); }
      f.intensity = Math.min(1, f.intensity + growth * dt);
      if (f.intensity <= 0) { f.out = true; f.intensity = 0; this.G.audio.fireCrackle(f.id, false); this.log(`Fire ${f.rack ? 'in ' + f.rack.name : ''} out.`, 'good'); continue; }
      if (f.rack) {
        const r = f.rack;
        if (f.intensity > 0.3 && !r.breakerTripped) { r.breakerTripped = true; this.power.recompute(); this.log(`${r.name} breakers tripped: insulation burning off the rack PDUs.`, 'warn'); }
        if (Math.random() < f.intensity * 1.5 * dt) { const sv = r.servers.find(s => s.attached && !s.destroyed); if (sv) W.destroyServer(sv, 'fire'); }
        if (f.intensity > FIRE.spreadAt && Math.random() < FIRE.spreadChancePerSec * dt) {
          const nb = W.rackNeighbors(r).filter(n => !this.fires.some(g => g.rack === n && !g.out));
          if (nb.length) { const n = nb[Math.floor(Math.random() * nb.length)]; this.startFire(new THREE.Vector3().setFromMatrixPosition(n.root).add(new THREE.Vector3(0, 0.6 + Math.random(), 0)), n, 'spread from ' + r.name); }
        }
      }
      // pre-action sprinklers: armed by detection, head fuses at ~68 °C above the fire
      if (this.suppression.sprinklersArmed && f.intensity > FIRE.sprinklerFuseAt && f.sprinkler === 0 && !f.sprinklered) {
        f.sprinklered = true; f.sprinkler = 60; this.stats.sprinklers++; this.G.audio.sprinkler();
        this.log(`Sprinkler head fused above ${f.rack ? f.rack.name : 'the fire'}. Pre-action pipe was already charged. Water in the data hall.`, 'bad');
        let n = 0; for (const r of W.racks) { const p = new THREE.Vector3().setFromMatrixPosition(r.root); if (p.distanceTo(f.pos) < 2.6 && !r.water) { r.water = true; r.breakerTripped = true; for (const sv of r.servers) if (!sv.destroyed) { W.destroyServer(sv, 'water'); n++; } } }
        this.ledger.add('water', 'Water damage clean-up', 1, 25000); this.log(`${n} servers water-damaged.`, 'bad'); this.power.recompute();
      }
    }
    this.fx = fx;
  }
  playerHazards(dt) {
    const p = this.G.player.pos();
    let smoke = 0;
    for (const f of this.fires) if (!f.out) { const d = f.pos.distanceTo(p); if (d < 3) smoke += f.intensity * (3 - d) / 3; }
    if (smoke > 0.15) { this.health -= smoke * 8 * dt; if (Math.random() < dt) this.log('You are breathing burning plastic. Back off.', 'warn'); }
    else if (this.health < 100) this.health = Math.min(100, this.health + 2 * dt);
    if (this.thermal.inlet > 50) this.health -= (this.thermal.inlet - 50) * 0.1 * dt;
    if (this.health <= 0 && !this.dead) { this.deathKind = 'smoke'; } if (this.health <= 0 && !this.dead) this.G.gameOver('Smoke inhalation. Burning PCB and PVC jacketing is a cocktail of hydrogen cyanide and hydrogen chloride; you went down before the suppression did.', 'death');
    // crushed by a moving rack
    const W = this.G.world;
    for (const r of W.racks) {
      if (r.bolted || r.body.isSleeping()) continue;
      const av = r.body.angvel(), lv = r.body.linvel(); const speed = Math.hypot(av.x, av.y, av.z) + Math.hypot(lv.x, lv.y, lv.z);
      if (speed < 0.8) continue;
      const local = p.clone().applyMatrix4(new THREE.Matrix4().copy(r.root).invert());
      if (Math.abs(local.x) < 0.45 && Math.abs(local.z) < 0.7 && local.y > -0.1 && local.y < 2.1) {
        this.deathKind = 'crush'; this.G.gameOver(`Crushed by ${r.name}. A loaded 42U cabinet weighs about as much as a small car and tips faster than you can step back. Racks get bolted down for a reason.`, 'death'); return;
      }
    }
  }
  snapshot() {
    return { ledger: this.ledger, shiftLeft: this.shiftLeft, thermal: this.thermal, power: this.power, fire: this.suppression.label(), net: this.network.label(), offline: this.offline || 0, health: this.health, facts: this.facts };
  }
}

// ---------------------------------------------------------------- power
class Power {
  constructor(S) { this.S = S; this.epo = false; this.feedA = true; this.feedB = true; this.racksPowered = 0; this.racksTotal = 0; }
  upsOk(feed) { const u = this.S.G.world.upss.find(x => x.feed === feed); return !this.epo && (u.alive || u.bypass); }
  pduOk(feed, half) { const p = this.S.G.world.pdus.find(x => x.feed === feed && x.half === half); return this.upsOk(feed) && p.alive && !p.tripped; }
  // Tripping a PDU's own main breaker kills its output; the line side and transformer stay live from upstream.
  pduEnergized(p) { return this.upsOk(p.feed) && p.alive && !this.epo; }
  // A tap-off box's breaker isolates its drop; the busway stabs inside it are live as long as the busway is.
  tapEnergized(t) { return this.pduOk(t.feed, t.cols[0] >= 10 ? 1 : 0) && t.alive; }
  tapFor(rack, feed) { return this.S.G.world.taps.find(t => t.feed === feed && t.row === rack.row && t.cols.includes(rack.col)); }
  recompute() {
    const W = this.S.G.world; let n = 0; this.racksTotal = W.racks.length;
    this.feedA = this.upsOk('A'); this.feedB = this.upsOk('B');
    for (const r of W.racks) {
      const half = r.col >= 10 ? 1 : 0;
      const tA = this.tapFor(r, 'A'), tB = this.tapFor(r, 'B');
      r.feedA = this.pduOk('A', half) && tA.on && tA.alive && r.parts.pdu_A;
      r.feedB = this.pduOk('B', half) && tB.on && tB.alive && r.parts.pdu_B;
      const was = r.powered;
      r.powered = (r.feedA || r.feedB) && !r.breakerTripped && !r.thermalTrip && !r.destroyed && !r.water;
      if (r.powered !== was) W.setRackLeds(r, r.powered);
      if (r.powered) n++;
    }
    this.racksPowered = n;
  }
  update(dt) { /* static unless something changes; recompute() is called by events */ }
}

// ---------------------------------------------------------------- cooling
class Thermal {
  constructor(S) { this.S = S; this.inlet = THERMAL.inletStart; this.itKW = 0; this.coolKW = 0; this.cracRunning = 0; this.cracTotal = 8; this.doorOpen = 0; this.tripTimer = 0; }
  update(dt) {
    const W = this.S.G.world, S = this.S, P = S.power;
    let it = 0; for (const r of W.racks) if (r.powered) it += r.kw * (this.inlet > THERMAL.throttleC ? 0.7 : 1);
    for (const f of S.fires) if (!f.out) it += 150 * f.intensity;
    this.itKW = it;
    const running = W.cracs.filter(c => c.alive && c.on && !P.epo); this.cracRunning = running.length; this.cracTotal = W.cracs.length;
    const contain = Math.max(0.5, 1 - 0.06 * S.stats.roofBroken - 0.08 * this.doorOpen);
    const tiles = Math.max(0.5, W.perfInPlace / W.perfTotal) * Math.max(0.5, 1 - 0.02 * W.holes);
    const capacity = running.length * THERMAL.cracKW * contain * tiles;
    const cool = this.inlet <= THERMAL.setpoint ? Math.min(capacity, it) : capacity;
    this.coolKW = capacity;
    this.inlet += (it - cool) / THERMAL.heatCapacityKJperK * dt;
    if (this.inlet < 18) this.inlet = 18;
    S.stats.maxInlet = Math.max(S.stats.maxInlet, this.inlet);
    // thermal trips
    if (this.inlet > THERMAL.shutdownC) {
      this.tripTimer += dt;
      if (this.tripTimer > 1) { this.tripTimer = 0; let n = 0; for (const r of W.racks) if (r.powered && !r.thermalTrip && Math.random() < 0.08) { r.thermalTrip = true; n++; } if (n) { P.recompute(); S.log(`${n} racks shut down on over-temperature (inlet ${this.inlet.toFixed(0)} °C, ASHRAE A1 allowable is 32).`, 'warn'); } }
    }
    if (!this.warned27 && this.inlet > 27) { this.warned27 = true; S.log('Cold-aisle inlet above 27 °C: outside ASHRAE recommended range. BMS alarm.', 'warn'); }
    if (!this.warned35 && this.inlet > 35) { this.warned35 = true; S.log('Inlet 35 °C: servers throttling. Hot aisle is past 50 °C. This is a thermal event.', 'bad'); }
  }
}

// ---------------------------------------------------------------- network
class Network {
  constructor(S) { this.S = S; this.wanDown = false; this.cuts = 0; }
  trayCut(t, how) {
    const W = this.S.G.world; this.cuts++;
    const x0 = -6 + t.seg * 3, x1 = x0 + 3; let n = 0;
    for (const r of W.racks) { const x = -5.7 + r.col * 0.6; if (r.row === t.row && x >= x0 - 0.01 && x <= x1 + 0.01 && r.net) { r.net = false; n++; } }
    this.S.log(`${how} the structured cabling over row ${ROWS[t.row].name}, bay ${t.seg + 1}. ${n} racks lost their uplinks.`, 'warn');
  }
  ductCut(d) {
    const W = this.S.G.world; this.S.stats.fiberCut++;
    const both = W.ducts.some(x => x.cut && x.aisle === 0) && W.ducts.some(x => x.cut && x.aisle === 1);
    this.S.log(`Fibre trunk cut over cold aisle ${d.aisle + 1}. ${both ? 'Both diverse paths are now dark: the whole hall is off the network.' : 'Traffic failed over to the second path.'}`, both ? 'bad' : 'warn');
    if (both && !this.wanDown) { this.wanDown = true; for (const r of W.racks) r.net = false; }
  }
  update() {}
  label() {
    if (this.wanDown) return { label: 'WAN DARK (both fibre paths cut)', cls: 'bad' };
    const c = this.S.G.world.ducts.filter(d => d.cut).length;
    if (this.cuts || c) return { label: `${this.cuts} tray cuts · ${c ? 'fibre on 1 path' : 'fibre ok'}`, cls: 'warn' };
    return { label: 'All links up · 2 diverse fibre paths', cls: '' };
  }
}

// ---------------------------------------------------------------- detection + clean agent + pre-action sprinklers
class Suppression {
  constructor(S) { this.S = S; this.stage = 'normal'; this.countdown = 0; this.concentration = 0; this.supply = 1; this.discharging = 0; this.discharged = false; this.sprinklersArmed = false; this.strobe = 0; this.smoke = 0; }
  cylinderLost() { this.supply = Math.max(0, this.supply - 1 / 3); }
  vent(dt) { /* agent leaking from a rocketing cylinder */ this.concentration = Math.min(this.concentration + 0.02 * dt, 0.3); }
  alarmPull() {
    if (this.stage !== 'normal' && this.stage !== 'alert') { this.S.log('Fire panel already past that point.'); return; }
    this.stage = 'action'; this.S.G.audio.setBeep(false); this.S.G.audio.setHorn(true);
    this.S.log('Pull station: building alarm, horns and strobes, the fire brigade is dispatched. A pull station does not release the agent; the manual release by the cylinders does.', 'warn');
  }
  manualPull() {
    if (this.stage === 'predischarge' || this.stage === 'discharging' || this.discharged) { this.S.log('Fire panel already past that point.'); return; }
    this.stage = 'predischarge'; this.countdown = FIRE.preDischarge; this.sprinklersArmed = true; this.S.G.audio.setBeep(false);
    this.S.log('MANUAL RELEASE. Horns and strobes, and a 30-second pre-discharge delay you do not have the abort key for.', 'bad');
  }
  update(dt) {
    const S = this.S, W = S.G.world, au = S.G.audio, fx = S.G.fx;
    this.smoke = S.fires.reduce((a, f) => a + (f.out ? 0 : f.intensity), 0);
    if (this.stage !== 'alert') au.setBeep(false);
    if (this.stage === 'normal' && this.smoke > FIRE.vesdaAlert) { this.stage = 'alert'; au.setBeep(true); S.log('VESDA: Alert. Aspirating smoke detection has picked up particulates well below visible smoke.', 'warn'); }
    if (this.stage === 'alert' && this.smoke > FIRE.vesdaAction) { this.stage = 'action'; au.setBeep(false); au.setHorn(true); S.log('VESDA: Action. Horns. Someone is supposed to walk the hall with an extinguisher now.', 'warn'); }
    if (this.stage === 'action' && this.smoke > 0.3) { this.stage = 'predischarge'; this.countdown = FIRE.preDischarge; this.sprinklersArmed = true; S.log('Fire 1: cross-zoned detection confirmed. Clean-agent pre-discharge: 30 seconds. Pre-action sprinkler pipe charging.', 'bad'); }
    if (this.stage === 'predischarge') {
      au.setHorn(true); this.countdown -= dt;
      if (this.countdown <= 0) {
        this.stage = 'discharging'; this.discharging = FIRE.dischargeTime; this.discharged = true; S.stats.discharged = true;
        au.discharge(); fx.screenFlash('rgba(255,255,255,0.35)', 600);
        S.ledger.add('agent', 'Inert-gas (IG-541) system recharge and inspection', 1, COST.agentRecharge);
        // acoustic shock: ~130 dB nozzles vs. spinning hard drives (ING Bucharest, 2016; several other incidents since)
        const drives = W.racks.filter(r => r.powered).reduce((a, r) => a + r.drives, 0); const dead = Math.round(drives * 0.03 * this.supply);
        if (dead) { S.ledger.add('hdd', 'Hard drives failed by discharge noise (acoustic shock)', dead, dead * COST.hdd); S.stats.hdd = dead; }
        S.log(`DISCHARGE. 300 bar inert gas through every nozzle for 60 seconds, ${Math.round(this.supply * 100)}% of design concentration. The nozzles scream at ~130 dB and ${dead.toLocaleString()} spinning drives just failed on vibration. (Yes, this really happens.)`, 'bad');
      }
    }
    if (this.stage === 'discharging') {
      this.discharging -= dt; this.concentration = Math.min(this.supply, this.concentration + this.supply / FIRE.dischargeTime * dt);
      for (let i = 0; i < 4; i++) fx.agentFog(new THREE.Vector3((Math.random() - 0.5) * 24, 2.5 + Math.random(), (Math.random() - 0.5) * 14), 1);
      if (this.discharging <= 0) { this.stage = 'discharged'; au.setHorn(false); S.log(this.supply >= 0.99 ? 'Design concentration reached: oxygen is down to about 12.5%. Fires out. Room sealed for a 10-minute hold; you have a few minutes to leave.' : 'Discharge complete, but with a cylinder missing the room never reached design concentration. The fire keeps going. Sprinklers are the last line.', this.supply >= 0.99 ? 'good' : 'bad'); }
    }
    if (this.stage === 'discharged') this.concentration = Math.max(0, this.concentration - 0.0015 * dt);
    if (this.stage === 'discharged' && this.smoke > 0.6 && !this.lateWarn) { this.lateWarn = true; S.log('Fire re-flash after discharge. There is no second shot of agent. Waiting on sprinkler heads to fuse.', 'bad'); }
    // strobes
    const alarm = this.stage === 'action' || this.stage === 'predischarge' || this.stage === 'discharging';
    this.strobe += dt;
    if (this.strobe > 0.5) { this.strobe = 0; this.flash = !this.flash; for (const i of W.strobes) W.kits.strobe.setLeds(i, alarm ? this.flash : true); }
    // IG-541 is colourless: only the discharge itself throws a brief condensation mist, then the room looks normal again
    S.G.setFog(0.012 + (this.stage === 'discharging' ? 0.07 : 0) + Math.min(0.08, this.smoke * 0.02));
  }
  label() {
    switch (this.stage) {
      case 'normal': return { label: 'Fire panel: normal', cls: '' };
      case 'alert': return { label: 'VESDA ALERT', cls: 'warn' };
      case 'action': return { label: 'VESDA ACTION — horns', cls: 'warn' };
      case 'predischarge': return { label: `PRE-DISCHARGE 0:${String(Math.ceil(Math.max(0, this.countdown))).padStart(2, '0')}`, cls: 'bad' };
      case 'discharging': return { label: `INERT GAS DISCHARGING ${Math.ceil(Math.max(0, this.discharging))}s`, cls: 'bad' };
      default: return { label: this.supply >= 0.99 ? 'Discharged — agent spent' : 'Discharged — below design, sprinklers armed', cls: 'warn' };
    }
  }
}
