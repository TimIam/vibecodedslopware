// Felling mechanics. The stump cross-section is sampled on a grid to find the hinge and holding wood;
// the stem is a rigid body tipping about the hinge, resisted by the hinge fibres until they tear or the
// notch closes, then falling free until it meets the ground, a neighbour, or something expensive.
import * as THREE from 'three';
import { G } from './data.js';
import { tiltQuat } from './tree.js';
import { distToSeg2 } from './world.js';

const N = 60;
const deg = THREE.MathUtils.degToRad;

export class Felling {
  constructor(tree, world, opts) {
    this.tree = tree; this.world = world; this.opts = opts;
    this.sp = tree.spec.sp;
    this.sigma = this.sp.sigma * 1e6;
    this.cut = {
      notch: { type: 'open', top: 60, bottom: 30, target: tree.R * 2 * 0.25, dTop: 0, dBot: 0, removed: false },
      method: 'standard',
      back: { step: 0, yaw: 0, progress: 0 },
      bore: null,
      hingePlan: tree.R * 2 * 0.1,
    };
    this.wedgeLift = 0; this.wedges = 0;
    this.phase = 'standing';
    this.t = new THREE.Vector2(); this.w = new THREE.Vector2();
    this.events = []; this.log = [];
    this.wind = { base: opts.wind.speed, az: opts.wind.az, speed: opts.wind.speed, gust: 0, next: 4 + Math.random() * 6 };
    this.time = 0;
    this.fallTime = 0;
    this.hitNeighbours = new Set();
    this.player = { x: -tree.Rc * 0.2, z: -(tree.Rc + 0.6), retreating: false, retreated: 0, hit: 0 };
    this.result = { events: [] };
  }

  get Rc() { return this.tree.Rc; }
  get xA() { return this.Rc - this.cut.notch.target; }

  // --- cross-section ---
  intact(x, z) {
    const R = this.Rc, c = this.cut;
    if (x * x + z * z > R * R) return 0;
    const rot = this.tree.spec.rot;
    if (rot && x * x + z * z < (rot * R) ** 2) return 0;
    if (c.notch.removed && x > this.xA) return 0;
    if (!c.notch.removed && x > this.xA) return 0.15; // wedge still attached by a sliver
    if (c.method === 'standard') {
      const xb = -R + c.back.progress + z * Math.tan(c.back.yaw);
      if (x < xb) return 0;
    } else if (c.bore) {
      const b = c.bore;
      const xH = b.hingeBack + z * Math.tan(b.yaw);
      const xS = -R + b.strap;
      const span = (xH - xS) * Math.min(1, b.progress);
      if (x < xH && x > xH - span) return 0;
      if (x < -R + b.strapCut) return 0;
    }
    return 1;
  }

  stats() {
    const R = this.Rc, cell = (2 * R) / N, A = cell * cell, xA = this.xA;
    let Cf = 0, Ch = 0, S = 0, area = 0, hingeArea = 0;
    let tL = 0, tR = 0, nL = 0, nR = 0, tC = 0, wMin = 1e9, wMax = -1e9;
    const strapX = this.cut.method === 'bore' && this.cut.bore ? -R + this.cut.bore.strap : -1e9;
    const rows = [];
    for (let j = 0; j < N; j++) {
      const z = -R + (j + 0.5) * cell;
      let rowT = 0;
      for (let i = 0; i < N; i++) {
        const x = -R + (i + 0.5) * cell;
        const k = this.intact(x, z); if (!k) continue;
        const a = A * k;
        area += a;
        Cf += this.sigma * a * Math.max(0, xA - x) * 0.5;
        if (x > strapX + 0.0001 && x <= xA + 1e-6) {
          hingeArea += a; Ch += this.sigma * a * Math.max(0, xA - x) * 0.5; S += this.sigma * a * Math.abs(z) * 0.25;
          rowT += cell * k;
        }
      }
      rows.push(rowT);
      if (rowT > 0.002) { wMin = Math.min(wMin, z); wMax = Math.max(wMax, z); }
      if (rowT > 0) { if (z < -R * 0.25) { tL += rowT; nL++; } else if (z > R * 0.25) { tR += rowT; nR++; } }
    }
    tC = rows[Math.floor(N / 2)];
    const width = wMax > wMin ? wMax - wMin : 0;
    const TL = nL ? tL / nL : 0, TR = nR ? tR / nR : 0;
    const steer = TL + TR > 0 ? (TR - TL) / (TL + TR) : 0;
    return { Cf, Ch, S, area, hingeArea, hingeT: tC, hingeW: width, TL, TR, steer, D: 2 * this.tree.R };
  }

  wedgeTilt() {
    const lever = this.xA - (-this.Rc + 0.07);
    return lever > 0 ? this.wedgeLift / lever : 0;
  }

  // driving moment in the tree-local frame (x forward, y side), N·m
  driving(t = this.t) {
    const tr = this.tree;
    const tilt = new THREE.Vector2().copy(tr.leanLocal).add(new THREE.Vector2(this.wedgeTilt(), 0)).add(t);
    const th = tilt.length();
    const dir = th > 1e-6 ? tilt.clone().divideScalar(th) : new THREE.Vector2();
    const Mg = dir.multiplyScalar(tr.mass * G * tr.hc * Math.sin(Math.min(th, Math.PI * 0.75)));
    const Mc = tr.crownOffsetLocal.clone().multiplyScalar(tr.crownMass * G * Math.cos(Math.min(th, 1.5)));
    const wa = this.wind.az - tr.aim;
    const v = this.wind.speed;
    const Acrown = tr.spec.crownR * 2 * tr.spec.crownLen * 0.6;
    const F = 0.5 * 1.2 * 0.35 * Acrown * v * v * Math.max(0, Math.cos(th));
    const Mw = new THREE.Vector2(Math.cos(wa), Math.sin(wa)).multiplyScalar(F * tr.crownY);
    return Mg.add(Mc).add(Mw);
  }

  updateWind(dt) {
    const w = this.wind;
    w.next -= dt;
    if (w.next < 0 && w.base > 0.5) { w.gust = 1; w.next = 6 + Math.random() * 9; this.events.push({ type: 'gust' }); }
    w.gust = Math.max(0, w.gust - dt * 0.35);
    const shape = Math.sin(Math.min(1, w.gust) * Math.PI);
    w.speed = w.base * (1 + 0.15 * Math.sin(this.time * 0.7)) + w.base * 0.9 * shape;
  }

  // ---- called while the player holds the saw on a cut. returns metres advanced
  cutRate(chordAt) {
    const tool = this.opts.tool;
    const chord = Math.max(0.03, chordAt);
    if (tool.kind === 'saw') {
      let rate = 0.0072 * tool.power / this.sp.hardness / chord; // m/s advance
      if (chord > tool.bar * 0.95) rate *= 0.55; // working from both sides
      return rate;
    }
    return 0;
  }
  chordAtX(x) { return 2 * Math.sqrt(Math.max(0, this.Rc ** 2 - x * x)); }
  maxCutChord() { const t = this.opts.tool; return t.kind === 'saw' ? t.bar * 2 * 0.98 : 1e9; }

  // ---- release / dynamics
  checkRelease() {
    const st = this.stats();
    const M = this.driving(new THREE.Vector2());
    this.load = st.Cf > 0 ? M.x / st.Cf : 9;
    this.lastStats = st; this.lastM = M;
    if (st.area < 1e-5 || (M.x > st.Cf && M.x > 0) || (st.hingeArea < 1e-5 && Math.abs(M.x) > st.Cf)) {
      this.release(st, M);
      return true;
    }
    // pinch: back-leaner with the kerf past the midline closes on the bar
    if (this.cut.method === 'standard' && M.x < 0 && this.cut.back.progress > this.Rc * 0.9 && this.opts.tool.kind === 'saw') this.pinched = true;
    else if (this.cut.method === 'bore' && M.x < 0 && this.cut.bore && this.cut.bore.strapCut > this.cut.bore.strap * 0.6) this.pinched = true;
    else this.pinched = false;
    return false;
  }

  release(st, M) {
    const D = 2 * this.tree.R;
    const c = this.cut;
    this.phase = 'hinge';
    this.releaseStats = st;
    this.releaseTime = this.time;
    this.Ch0 = st.Ch; this.S0 = st.S;
    this.steer = st.steer * 0.45;
    const tr = st.hingeT / D;
    // thicker hinge bends less before tearing; very thin hinge barely holds at all
    this.thetaB = st.hingeArea < 1e-5 ? 0.01 : this.sp.ductility * THREE.MathUtils.clamp(0.1 / Math.max(tr, 0.02), 0.45, 1.35) * (tr < 0.03 ? 0.25 : 1);
    const opening = deg(c.notch.top + c.notch.bottom);
    const over = Math.max(c.notch.dTop, c.notch.dBot) - c.notch.target;
    this.dutchman = over > 0.015 ? 'overcut' : !c.notch.removed ? 'undercut' : null;
    this.closure = this.dutchman ? deg(4 + Math.random() * 6) : opening;
    if (this.dutchman) this.addEvent('dutchman', this.dutchman === 'overcut' ? 'Dutchman — the overcut kerf closes the notch within a few degrees.' : 'The notch never came out — face closes immediately.');
    if (st.hingeArea < 1e-5) this.addEvent('nohinge', 'You cut through the hinge. Nothing is steering this tree now.');
    // barber chair: forward lean, released while lots of holding wood remained, brittle species
    const fwdLean = THREE.MathUtils.radToDeg(this.tree.leanLocal.x + this.wedgeTilt());
    if (c.method === 'standard' && fwdLean > 3) {
      const q = st.hingeT / D;
      const p = this.sp.brittle * THREE.MathUtils.clamp((q - 0.12) * 6, 0, 1) * THREE.MathUtils.clamp((fwdLean - 2.5) / 7, 0, 1) * 1.8;
      if (Math.random() < p) {
        this.barber = true;
        this.addEvent('barberchair', 'BARBER CHAIR — the stem split up from the back cut. Heavy forward lean on a slow back cut.');
      }
    }
    if (M.x < 0 && st.hingeArea < 1e-5) this.addEvent('backward', 'It\'s going over backwards!');
    this.events.push({ type: 'release', barber: this.barber });
  }

  addEvent(type, text) { this.result.events.push({ type, text }); this.events.push({ type, text }); }

  update(dt) {
    this.time += dt;
    this.updateWind(dt);
    this.updatePlayer(dt);
    if (this.phase === 'standing' || this.phase === 'landed' || this.phase === 'hung') return;
    const tr = this.tree;
    const sub = 6, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      const tau = this.driving();
      const net = tau.clone();
      if (this.phase === 'hinge') {
        const rotF = this.t.x;
        const hold = this.Ch0 * Math.max(0, 1 - Math.max(0, rotF) / this.thetaB) * (this.barber ? 0.2 : 1);
        net.x -= hold;
        if (this.w.x <= 0 && net.x < 0) { net.x = 0; this.w.x = Math.max(0, this.w.x); }
        // hinge keeps the stem on its axis (toward the thicker side if tapered)
        const target = this.steer * Math.max(0, rotF);
        const I = tr.inertia;
        const Ks = I * 30, Cs = 2 * Math.sqrt(Ks * I);
        let hingeSide = -Ks * (this.t.y - target) - Cs * this.w.y - tau.y;
        const avail = this.S0 * Math.max(0, 1 - Math.max(0, rotF) / this.thetaB) + 1;
        if (Math.abs(tau.y) > avail && rotF < this.thetaB * 0.85) {
          this.breakHinge('side', 'The hinge tore off one end — side lean took over.');
          hingeSide = 0;
        } else hingeSide = THREE.MathUtils.clamp(hingeSide, -avail - Math.abs(tau.y), avail + Math.abs(tau.y));
        net.y = tau.y + hingeSide;
        if (this.phase === 'hinge' && rotF >= this.closure) this.breakHinge('closed');
        else if (this.phase === 'hinge' && rotF >= this.thetaB) this.breakHinge('torn');
      }
      this.w.addScaledVector(net, h / tr.inertia);
      this.t.addScaledVector(this.w, h);
      if (this.kick) {
        const k = Math.min(this.kick.left, this.kick.speed * h);
        this.kick.left -= k; this.kickOffset += k;
      }
    }
    this.fallTime += dt;
    this.applyPose();
    this.checkContacts();
  }

  breakHinge(why, text) {
    if (this.phase !== 'hinge') return;
    this.phase = 'free';
    const c = this.cut;
    this.breakAngle = this.t.x;
    this.events.push({ type: 'hingeBreak', why });
    if (text) this.addEvent('side', text);
    if (why === 'closed') {
      const angle = this.closure;
      let kick = this.w.length() * 1.2 * Math.max(0, 1 - angle / deg(80));
      if (c.notch.type === 'humboldt') kick *= 0.35;
      const step = c.method === 'standard' ? c.back.step : c.bore?.step || 0;
      if (step < -0.005) kick *= 1.8;
      if (step > 0.02) kick *= 0.6;
      kick = Math.min(kick, 1.8);
      if (kick > 0.25) {
        this.kick = { left: kick, speed: 3 };
        this.kickOffset = 0;
        this.addEvent('kick', `The face closed at ${Math.round(THREE.MathUtils.radToDeg(angle))}° and kicked the butt ${kick.toFixed(1)} m back off the stump.`);
      }
    }
  }

  applyPose() {
    const tr = this.tree;
    const tot = new THREE.Vector2(this.wedgeTilt(), 0).add(this.t);
    tiltQuat(tot, tr.fallPivot.quaternion);
    if (this.kickOffset) {
      tr.fallPivot.position.x = (this.barber ? tr.fallPivot.userData.x0 : this.xA) - this.kickOffset;
      tr.fallPivot.position.y = Math.max(tr.h0 - this.kickOffset * 0.5, 0.05);
    }
    tr.root.updateMatrixWorld(true);
  }

  // ground, neighbours, hazards
  checkContacts() {
    const tr = this.tree, world = this.world;
    const p = new THREE.Vector3();
    const samples = 22;
    const th = this.t.length() + tr.leanLocal.length();
    for (let i = 0; i <= samples; i++) {
      const y = tr.buttTop + (tr.H - tr.buttTop) * (i / samples);
      tr.stemPoint(y, p);
      const inCrown = y > tr.spec.crownBase;
      const crownR = inCrown ? tr.spec.crownR * (tr.spec.sp.crown === 'conifer' ? (tr.H - y) / tr.spec.crownLen : 0.8) : 0;
      const clearance = tr.radiusAt(y) + crownR * 0.3;
      let ground = world.height(p.x, p.z);
      for (const r of world.rocks) if (Math.hypot(r.x - p.x, r.z - p.z) < r.r) ground = Math.max(ground, world.height(r.x, r.z) + r.h * 0.8);
      if (p.y - clearance <= ground && th > 0.3) { this.land(y, p.clone()); return; }

      // power line
      for (const hz of world.hazards) {
        if (hz.kind === 'powerline' && !this.hitLine) {
          const d = distToSeg2(p.x, p.z, hz.line[0], hz.line[1]);
          const wireY = hz.line[0].y - 1.2;
          if (d < 0.5 + crownR * 0.4 && Math.abs(p.y - wireY) < 1.2 + crownR * 0.3) {
            this.hitLine = true; this.addEvent('powerline', 'You put it through the power line. The utility is on its way, and so is the bill.');
            this.events.push({ type: 'zap', pos: p.clone() });
          }
        }
      }
      // neighbours
      if (y < tr.H * 0.3) continue;
      for (const nb of world.standing) {
        if (nb === tr.spec || nb.felled || this.hitNeighbours.has(nb)) continue;
        const dx = p.x - nb.x, dz = p.z - nb.z, dh = Math.hypot(dx, dz);
        const rel = p.y - nb.y;
        if (rel < 1 || rel > nb.h) continue;
        const nbCrown = rel > nb.crownBase ? nb.crownR * 0.5 : 0;
        if (dh < nb.dbh / 2 + tr.radiusAt(y) + nbCrown) {
          this.hitNeighbours.add(nb);
          const lodge = th < deg(46) && (dh < nb.dbh / 2 + tr.radiusAt(y) + nbCrown * 0.6);
          if (lodge) {
            this.phase = 'hung'; this.hungOn = nb;
            this.addEvent('hangup', `Hung up in a ${nb.sp.name.toLowerCase()} at ${Math.round(THREE.MathUtils.radToDeg(th))}°. A lodged tree is the most dangerous thing in the woods.`);
            this.events.push({ type: 'hung', pos: p.clone() });
            return;
          }
          this.w.multiplyScalar(0.9);
          this.addEvent('brushed', `Clipped a ${nb.sp.name.toLowerCase()} on the way down — damaged leave tree.`);
          this.events.push({ type: 'brush', pos: p.clone() });
        }
      }
    }
  }

  land(yContact, pos) {
    const tr = this.tree, world = this.world;
    this.phase = 'landed';
    const vTip = this.w.length() * tr.H;
    this.impactSpeed = vTip;
    // breakage: impact energy, brittleness, slope, rocks/logs under the stem
    let under = 0;
    const p = new THREE.Vector3();
    for (let i = 2; i < 12; i++) {
      tr.stemPoint(tr.H * i / 12, p);
      for (const r of world.rocks) if (Math.hypot(r.x - p.x, r.z - p.z) < r.r + 0.3) under++;
    }
    const slenderness = tr.H / (2 * tr.R) / 60;
    const pBreak = THREE.MathUtils.clamp((vTip - 14) / 30, 0, 1) * (0.4 + this.sp.brittle) * (0.6 + slenderness) + under * 0.12 + (this.dutchman ? 0.1 : 0);
    this.broke = Math.random() < pBreak;
    if (this.broke) this.addEvent('break', `The stem broke on impact (tip speed ${vTip.toFixed(0)} m/s${under ? ', landed across rock' : ''}).`);
    this.events.push({ type: 'land', speed: vTip, broke: this.broke });

    // lay direction (world)
    const base = tr.stemPoint(tr.buttTop, new THREE.Vector3());
    const tip = tr.stemPoint(tr.H, new THREE.Vector3());
    this.layAz = Math.atan2(tip.z - base.z, tip.x - base.x);
    this.layError = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(this.layAz - tr.aim), Math.cos(this.layAz - tr.aim)));
    this.tipPos = tip; this.basePos = base;
    // hazards on the ground
    for (const hz of world.hazards) {
      if (hz.kind === 'cabin') {
        const d = distToSeg2(hz.x, hz.z, base, tip);
        if (d < hz.r + tr.spec.crownR * 0.4) this.addEvent('cabin', 'Right through the cabin roof.');
      }
      if (hz.kind === 'fence') {
        if (segIntersect(base, tip, hz.line[0], hz.line[1])) this.addEvent('fence', 'Flattened a section of fence.');
      }
    }
    // the player
    const pl = this.playerWorld();
    const d = distToSeg2(pl.x, pl.z, base, tip);
    if (d < Math.max(1.0, tr.spec.crownR * 0.45) && !this.playerHitBy) { this.hurt(100, 'crushed'); }
  }

  playerWorld() {
    const tr = this.tree;
    const v = new THREE.Vector3(this.player.x, 0, this.player.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -tr.aim);
    return { x: tr.spec.x + v.x, z: tr.spec.z + v.z };
  }
  retreat() { if (!this.player.retreating) { this.player.retreating = true; this.retreatTime = this.time; } }
  // walk back to the stump (only while the tree still stands)
  returnToStump() { const pl = this.player; pl.retreating = false; pl.retreated = 0; pl.x = -this.tree.Rc * 0.2; pl.z = -(this.tree.Rc + 0.6); this.retreatTime = null; }
  updatePlayer(dt) {
    const pl = this.player;
    if (pl.retreating && pl.retreated < 7) {
      const v = 2.3 * dt; pl.retreated += v;
      const side = Math.sign(pl.z) || -1;
      pl.x -= v * 0.7071; pl.z += side * v * 0.7071;
    }
    // hazards that strike the stump area
    if (this.phase !== 'standing' && !this.playerHitBy) {
      const dStump = Math.hypot(pl.x, pl.z);
      const since = this.time - this.releaseTime;
      if (this.barber && since > 0.35 && since < 1.4 && dStump < 3.5) this.hurt(70, 'barber chair');
      if (this.kick && this.kickOffset > 0.2 && pl.x < 0.5 && dStump < this.kickOffset + 1.8) this.hurt(45, 'butt kick');
      if (this.phase === 'hung' && !this.widowChecked) {
        this.widowChecked = true;
        if (dStump < 5 && Math.random() < 0.5) this.hurt(35, 'falling limb');
      }
    }
  }
  hurt(amount, cause) {
    this.playerHitBy = cause;
    const ppe = this.opts.ppe ? 0.5 : 1;
    const dmg = Math.round(amount * (cause === 'crushed' ? 1 : ppe));
    this.player.hit = dmg;
    this.addEvent('injury', `You were hit — ${cause}. (−${dmg} health)`);
    this.events.push({ type: 'hurt', amount: dmg, cause });
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
}

function segIntersect(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
