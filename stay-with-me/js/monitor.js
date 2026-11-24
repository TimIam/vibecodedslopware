// Stay With Me: the patient monitor / defibrillator screen. Pure Canvas 2D, no three.js, no imports.
//
//   BeatGen   schedules heartbeats from a rhythm description and synthesises the ECG as a vectorcardiogram: every
//             wave (P, the QRS pieces, ST, T) is a Gaussian with a 3D heart vector, and each of the 12 leads is a
//             projection of that vector. Reciprocal changes, R-wave progression and axis therefore come out of the
//             geometry instead of being painted per lead. Shared with the pulse you palpate and the heart sounds.
//   Monitor   the sweep display (erase bar, incremental drawing), numerics, alarms, defib bar and soft keys.
//   print12   12-lead printout on pink paper; strip() a static rhythm strip.
//
// Where things are tuned:
//   QRS{}         QRS / ventricular morphologies as vector waves [centre s, width s, x, y, z] (x = patient's left,
//                 y = feet, z = anterior, mV). LC{} holds the lead vectors (precordial gain folded in).
//   buildBeat()   intervals vs rate (PR, QT by Bazett), P and T shape, ST segment shapes (stK).
//   BeatGen._plan*  rhythm timing: sinus arrhythmia, ectopy and compensatory pauses, AV blocks, AF irregularity.
//   BeatGen._sample continuous parts: VF, torsades, fibrillatory and flutter waves, wander, muscle and CPR artefact.
//   PAT{}         the 12-lead patterns (morph objects fed to buildBeat) and their machine interpretation text.
//   Monitor._layout / COL / LIMITS   screen layout, colours and alarm limits.
//
// Who drives what: call beatGen.update(dt, v) once per frame, then monitor.update(dt, v). The monitor never advances
// a generator that somebody else updated since its last frame (it watches beatGen.ticks); only when nobody did does
// it advance it itself, so a lone Monitor also just works. Pass { drive: false } to forbid even that.
// Conventions for the vitals view: v.breathPhase (optional) is 0 at the start of inspiration; v.bgl is shown as
// given, in the unit named by v.units ('mmol' one decimal, 'mgdl' whole number). The screen never says whether a
// pacer captures: capture only changes the trace, as on a real device. Test page: ../monitor-test.html.

const TAU = Math.PI * 2, { sin, cos, exp, sqrt, min, max, floor, round, ceil, hypot } = Math;
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function mkRng(seed) {
  let s = seed >>> 0;
  const f = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.r = (a, b) => a + (b - a) * f();
  f.n = () => (f() + f() + f() + f() - 2) * 1.732;      // roughly N(0,1)
  return f;
}
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// ---------------------------------------------------------------------------------------------------------------
// Leads and morphology
// ---------------------------------------------------------------------------------------------------------------

export const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
// Lead = dot(heart vector, LC[lead]). Limb leads obey Einthoven exactly (III = II - I, aVR = -(I + II) / 2 ...).
const LC = {
  I: [1, 0, 0], II: [.5, .866, 0], III: [-.5, .866, 0], aVR: [-.75, -.433, 0], aVL: [.75, -.433, 0], aVF: [0, .866, 0],
  V1: [-.42, 0, .91], V2: [-.10, 0, 1.5], V3: [.39, .15, 1.44], V4: [1.25, .30, 1.45], V5: [1.35, .16, .72], V6: [1.05, .05, 0],
};

const TN = [.20, .22, .22];                         // normal T vector
const PA = [.03, .07, .04], PB = [.065, .06, -.025]; // right then left atrial halves of the P wave

// QRS sets: w = [centre, width, x, y, z] from QRS onset; dur = QRS duration; fid = R-wave fiducial; t / st = the
// secondary repolarisation that belongs to the conduction pattern (discordant in bundle branch block and ectopy).
const QRS = {
  n: { dur: .088, fid: .040, w: [[.012, .0065, -.12, -.02, .22], [.034, .0095, .50, .68, .22], [.046, .0105, .56, .50, -.70], [.066, .008, -.20, -.10, -.14]] },
  lbbb: { dur: .150, fid: .060, w: [[.016, .010, .08, .04, .10], [.052, .021, .70, .20, -.85], [.104, .023, .66, .10, -.60]], t: [-.26, -.06, .34], st: [-.12, -.02, .20], sh: 1 },
  rbbb: { dur: .136, fid: .040, w: [[.012, .0065, -.12, -.02, .22], [.034, .0095, .50, .68, .22], [.046, .0105, .56, .50, -.55], [.084, .024, -.45, 0, .70]], t: [.26, .22, -.07] },
  lvh: { dur: .098, fid: .044, w: [[.012, .0065, -.10, -.02, .20], [.036, .011, .95, .70, .25], [.050, .012, 1.15, .45, -1.55], [.072, .008, -.15, -.05, -.12]], t: [-.26, -.08, .22], st: [-.14, -.04, .16], sh: 3 },
  wpw: { dur: .124, fid: .074, w: [[.026, .019, .20, .26, .12], [.068, .0095, .50, .68, .22], [.080, .0105, .56, .50, -.70], [.100, .008, -.20, -.10, -.14]], t: [.08, .06, .12], st: [-.04, -.06, -.03], sh: 0 },
  ivcd: { dur: .16, fid: .062, w: [[.020, .011, -.12, -.02, .22], [.056, .019, .50, .68, .22], [.080, .021, .56, .50, -.70], [.126, .024, -.32, -.42, -.10]] },
  // ventricular origins
  vt: { dur: .19, fid: .075, w: [[.055, .027, -.90, 1.90, .64], [.112, .030, -.60, 1.20, .43]], t: [.52, -1.0, -.38] },
  pvc: { dur: .16, fid: .06, w: [[.012, .008, -.05, -.10, .08], [.050, .024, .25, 1.30, -.55], [.098, .026, .20, .70, -.50]], t: [-.20, -.55, .36] },
  pvc2: { dur: .16, fid: .06, w: [[.050, .025, -.50, -.95, .60], [.100, .028, -.30, -.60, .40]], t: [.25, .50, -.30] },
  esc: { dur: .155, fid: .065, w: [[.020, .012, .10, .15, .05], [.060, .024, .55, .85, -.60], [.112, .024, .40, .45, -.50]], t: [-.25, -.42, .30] },
  ago: { dur: .30, fid: .09, w: [[.080, .042, .20, .50, -.20], [.185, .055, -.12, -.36, .20]], t: [.05, .14, -.06] },
  pace: { dur: .17, fid: .065, w: [[.052, .024, .65, -1.10, -.55], [.106, .027, .45, -.75, -.45]], t: [-.30, .55, .35] },
};

// ST segment weight at time d after QRS onset: rises at the J point, runs into the T wave, fades as T ends.
// sh 0 flat, 1 concave (scooped up into T), 2 convex (dome), 3 downsloping.
function stK(d, s) {
  if (d < s.tJ - .02 || d > s.tT + .1) return 0;
  let k = sstep(s.tJ - .012, s.tJ + .012, d) * (1 - sstep(s.tT - .02, s.tT + .075, d));
  const u = clamp((d - s.tJ) / (s.tT - s.tJ));
  if (s.sh === 1) k *= .42 + .58 * u * u; else if (s.sh === 2) k *= 1 + .22 * sin(u * Math.PI); else if (s.sh === 3) k *= .55 + .6 * u;
  return k;
}

// One beat as a list of vector waves [c, wl, wr, x, y, z, group] (group 0 P, 1 QRS, 2 T), times from QRS onset.
// kind 'N' supraventricular (uses the morph M), 'V' ventricular, 'P' paced. o: { q, amp, qs, noP, retro, pOnly, pr }.
function buildBeat(kind, M, rr, r, o = {}) {
  const vent = kind !== 'N', Q = QRS[o.q || (vent ? 'vt' : M.q || 'n')];
  const qs = (vent ? 1 : M.qs || 1) * (o.qs || 1), amp = (o.amp ?? 1) * (vent ? 1 : M.amp ?? 1) * (1 + .025 * r.n());
  const b = { t0: 0, type: kind, cb: kind, w: [], fid: Q.fid * qs, a: -.02, z: .5, st: null, prs: null, spike: null, lw: null, lst: null, pr: .16, dur: 0, qt: 0, fired: false, np: false, hasP: false, pOnly: !!o.pOnly };
  const W = b.w, hr = 60 / rr;
  if (!o.pOnly) {
    for (const w of Q.w) W.push([w[0] * qs, w[1] * qs, w[1] * qs, w[2] * amp, w[3] * amp, w[4] * amp, 1]);
    if (!vent && M.qx) for (const w of M.qx) W.push([w[0], w[1], w[1], w[2] * amp, w[3] * amp, w[4] * amp, 1]);
    const dur = b.dur = Q.dur * qs + (vent ? 0 : M.durAdd || 0);
    let tp, wl, wr, tv;
    if (vent) {          // broad discordant T hard on the heels of the QRS
      const k = sqrt(clamp(rr / .8, .32, 1.7)); tp = dur + .14 * k; wl = .07 * k; wr = .05 * k; b.qt = tp + 2.5 * wr;
      tv = Q.t.map(a => a * amp);
    } else {             // QT follows the rate (Bazett) and stretches with a wide QRS
      const qt = b.qt = (M.qtc || .405) * sqrt(clamp(rr, .22, 1.8)) + max(0, dur - .09), ts = qt / .4;
      wl = .062 * ts * (M.twl || 1); wr = .034 * ts * (M.twr || 1); tp = qt - 2.5 * wr;
      const k = (M.ta ?? 1) * (1 + .04 * r.n()); tv = (M.t || Q.t || TN).map(a => a * k);
    }
    W.push([tp, wl, wr, tv[0], tv[1], tv[2], 2]);
    const sv = vent ? Q.st : (M.st || Q.st);
    const pl = !vent && M.lead;
    if (sv || pl) b.st = { tJ: dur, tT: tp, sh: (vent ? Q.sh : M.stShape ?? Q.sh) || 0, x: sv ? sv[0] : 0, y: sv ? sv[1] : 0, z: sv ? sv[2] : 0 };
    if (!vent && M.j) W.push([dur + M.j[4], M.j[3], M.j[3] * 1.5, M.j[0], M.j[1], M.j[2], 1]);       // J / Osborn wave
    if (pl) {            // per-lead extras that a single dipole cannot express
      b.lw = {}; b.lst = {};
      for (const L in pl) { const e = pl[L]; if (e.st) b.lst[L] = e.st; const a = b.lw[L] = []; if (e.t) a.push([tp, wl, wr, e.t]); if (e.w) for (const w of e.w) a.push([w[0], w[1], w[1], w[2] * amp]); }
    }
    if (kind === 'P') b.spike = [-.014, o.spike ?? 1.1];
    if (o.retro != null) { const ps = (M.p ?? 1) * .9; W.push([o.retro, .02, .02, -.02 * ps, -.11 * ps, .02 * ps, 0]); }
  }
  if (!vent && !o.noP && (M.p ?? 1) > 0) {
    const pr = b.pr = o.pr ?? (M.pr || .16) * clamp(1 - (hr - 60) * .0022, .72, 1.1), ps = (M.p ?? 1) * (1 + .05 * r.n()), pw = clamp(.78 + .22 * rr, .78, 1.05);
    W.push([-pr + .030 * pw, .017 * pw, .017 * pw, PA[0] * ps, PA[1] * ps, PA[2] * ps, 0], [-pr + .058 * pw, .020 * pw, .020 * pw, PB[0] * ps, PB[1] * ps, PB[2] * ps, 0]);
    b.hasP = true;
    if (M.prv && !o.pOnly) b.prs = { a: -pr + .085, b: -.006, x: M.prv[0], y: M.prv[1], z: M.prv[2] };
  }
  let a = 0, z = 0; for (const w of W) { a = min(a, w[0] - 3.6 * w[1]); z = max(z, w[0] + 3.6 * w[2]); }
  b.a = a - .02; b.z = z + .1;
  // frontal axes of P, QRS and T for the printout header
  b.ax = [0, 1, 2].map(g => { let x = 0, y = 0; for (const w of W) if (w[6] === g) { const k = w[1] + w[2]; x += w[3] * k; y += w[4] * k; } return hypot(x, y) < 1e-5 ? null : round(Math.atan2(y, x) * 180 / Math.PI); });
  return b;
}

// Sum every active beat into o = [x, y, z, common]. The hot loop of the module.
function evalEvents(ev, t, o) {
  for (let i = 0; i < ev.length; i++) {
    const b = ev[i], d = t - b.t0;
    if (d < b.a || d > b.z) continue;
    const ws = b.w;
    for (let j = 0; j < ws.length; j++) {
      const w = ws[j], dd = d - w[0], u = dd / (dd < 0 ? w[1] : w[2]);
      if (u > -3.6 && u < 3.6) { const g = exp(-.5 * u * u); o[0] += g * w[3]; o[1] += g * w[4]; o[2] += g * w[5]; }
    }
    if (b.st) { const k = stK(d, b.st); if (k) { o[0] += k * b.st.x; o[1] += k * b.st.y; o[2] += k * b.st.z; } }
    if (b.prs) { const p = b.prs, k = sstep(p.a - .02, p.a + .012, d) * (1 - sstep(p.b - .012, p.b, d)); if (k) { o[0] += k * p.x; o[1] += k * p.y; o[2] += k * p.z; } }
    if (b.spike) { const u = (d - b.spike[0]) / .002; if (u > -3 && u < 16) o[3] += b.spike[1] * (exp(-.5 * u * u) - (u > 1 ? .2 * exp(-(u - 1) / 5) : 0)); }
  }
}
function evalLead(ev, t, L) {
  let s = 0;
  for (let i = 0; i < ev.length; i++) {
    const b = ev[i], d = t - b.t0;
    if (!b.lw || d < b.a || d > b.z) continue;
    const ws = b.lw[L]; if (ws) for (let j = 0; j < ws.length; j++) { const w = ws[j], dd = d - w[0], u = dd / (dd < 0 ? w[1] : w[2]); if (u > -3.6 && u < 3.6) s += w[3] * exp(-.5 * u * u); }
    const k = b.lst[L]; if (k) s += k * stK(d, b.st);
  }
  return s;
}

// Fold the monitor-level modifier flags of the vitals view into a morph object.
function liveMorph(base, v, lead) {
  const M = { ...(base || {}) }, Q = QRS[M.q || 'n'];
  let t = M.t || Q.t || TN;
  if (v.st) {
    const c = LC[lead] || LC.II, k = v.st * .1 / (c[0] * c[0] + c[1] * c[1] + c[2] * c[2]), sv = [c[0] * k, c[1] * k, c[2] * k];
    M.st = M.st ? M.st.map((a, i) => a + sv[i]) : sv; M.stShape = v.st > 0 ? 2 : 3;
    if (v.st > 0) t = t.map((a, i) => a + sv[i] * .6);
  }
  if (v.tInv) t = t.map(a => -a * .8);
  if (v.peakedT) { t = t.map(a => a * 2.5); M.twl = .5; M.twr = .8; }
  if (v.wideQRS) { if (M.q) M.qs = (M.qs || 1) * 1.3; else M.q = 'ivcd'; }
  if (v.longQT) { M.qtc = .6; M.twl = (M.twl || 1) * 1.25; }
  if (v.lowVoltage) { M.amp = (M.amp ?? 1) * .36; M.p = (M.p ?? 1) * .6; t = t.map(a => a * .5); }
  M.t = t;
  return M;
}

// rhythm -> [planner, default rate when v.hr is missing]
const RH = {
  sinus: ['sinus', 75], afib: ['af', 110], aflutter: ['fl', 150], svt: ['reg', 190], vt: ['reg', 180], vtPulseless: ['reg', 190], torsades: ['none', 230],
  vf: ['none', 0], vfFine: ['none', 0], asystole: ['asys', 0], pea: ['pea', 50], chb: ['chb', 36], mobitz2: ['m2', 52], wenckebach: ['wb', 58],
  junctional: ['reg', 46], idioventricular: ['reg', 34], agonal: ['reg', 14], paced: ['reg', 70],
};
export const RHYTHMS = Object.keys(RH);

// ---------------------------------------------------------------------------------------------------------------
// BeatGen
// ---------------------------------------------------------------------------------------------------------------

export class BeatGen {
  // opts: { seed (omit for a live, different-every-time trace), lead ('II'), morph (a PAT morph, used by print12) }
  constructor(opts = {}) {
    this.seed = opts.seed ?? (Math.random() * 4294967296) >>> 0;
    this.fs = 500; this.lead = opts.lead || 'II'; this.morph = opts.morph || null; this.onBeat = null;
    this.buf = new Float32Array(8192);        // ring of monitored-lead samples at fs; sample i lives at buf[i & 8191]
    this.ticks = 0;                           // update() calls so far; a Monitor uses it to tell whether someone else drives us
    this.reset();
  }
  reset() {
    const r = this.rng = mkRng(this.seed); this.nz = mkRng(this.seed ^ 0x5bd1e995);
    this.time = 0; this.n = 0; this.acc = 0; this.ev = []; this.beats = []; this.beatN = 0; this.spikes = []; this.spikeN = 0; this.lastBeatT = -10; this.lastRR = 1;
    this.rh = null; this.aNext = 0; this.vNext = 0; this.sNext = 0; this.lastQ = -10; this.cyc = 0; this.cycN = 0; this.altF = false;
    this.resp = r(); this.vfA = 0; this.afA = 0; this.flA = 0; this.tdA = 0; this.cpA = 0; this.arS = 0; this.cpP = 0; this.cpK = 1; this.cpT = 1;
    this.flBase = 0; this.flT = .2; this.flK = 0; this.flErr = 0; this.tdP = 0; this.tdTh = r() * TAU; this.asysT = 0; this.jRetro = r() < .5 ? -.085 : .09;
    this.vfO = []; for (let i = 0; i < 5; i++) this.vfO.push({ p: r() * TAU, f: r.r(3.4, 7.6), l: r() * TAU, lf: r.r(.15, 1.1), px: r() * TAU, pz: r() * TAU });
    this.afO = []; for (let i = 0; i < 3; i++) this.afO.push({ p: r() * TAU, f: r.r(5, 8), l: r() * TAU, lf: r.r(.2, .6) });
    this.lp = [0, 0, 0]; this.mu = [0, 0, 0]; this.wp = [r() * TAU, r() * TAU, r() * TAU];
    this.shk = 0; this.shocks = null; this.cur = [0, 0, 0, 0]; this._mk = ''; this._M = null; this.meas = null; this.v = {};
  }

  get lastBeatAge() { return this.time - this.lastBeatT; }
  get phase() { return clamp(this.lastBeatAge / max(.2, this.lastRR)); }
  // Instantaneous value in mV for any of the 12 leads (default: the monitored lead).
  ecgAt(lead = this.lead) { const c = LC[lead] || LC.II, o = this.cur; return o[0] * c[0] + o[1] * c[1] + o[2] * c[2] + o[3] + evalLead(this.ev, this.time, lead); }

  update(dt, v) {
    this.ticks++;
    this.acc += clamp(dt, 0, .25);
    const h = 1 / this.fs;
    while (this.acc >= h) { this.acc -= h; this._step(v || {}); }
  }

  _rhythm(v) {
    const d = v.defib;
    if (v.paced || (d && d.mode === 'pacer' && d.capture && d.paceMa > 0 && v.rhythm !== 'vf' && v.rhythm !== 'vfFine')) return 'paced';
    return RH[v.rhythm] ? v.rhythm : 'sinus';
  }
  _hr(v, rh) { const d = v.defib; let hr = v.hr > 0 ? v.hr : RH[rh][1]; if (rh === 'paced' && d && d.paceRate && !(v.hr > 0)) hr = d.paceRate; return clamp(hr || 60, 6, 300); }

  _step(v) {
    this.v = v;
    const t = this.time += 1 / this.fs, rh = this._rhythm(v), ev = this.ev;
    const key = rh + (rh === 'pea' ? v.peaLook : '');
    if (key !== this.rh) this._switch(key, rh, v);
    this.resp = (v.breathPhase != null ? v.breathPhase : this.resp + (v.rr > 0 ? v.rr : 14) / 60 / this.fs) % 1;
    const sh = v.defib ? v.defib.shocks | 0 : 0;
    if (this.shocks != null && sh > this.shocks) this.shk = -6;      // a shock drives the amplifier to the rail for a moment
    this.shocks = sh;
    this._plan(v, rh);
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (!e.fired && !e.pOnly && t >= e.t0 + e.fid) { e.fired = true; this._fire(e.t0 + e.fid, e.cb, e.type !== 'N', e.np, v); }
      if (e.spike && !e.spk && t >= e.t0 + e.spike[0]) { e.spk = true; this.spikes.push(e.t0 + e.spike[0]); if (this.spikes.length > 16) this.spikes.shift(); this.spikeN++; }
    }
    if ((this.n & 63) === 0 && ev.length && ev[0].t0 + ev[0].z < t) this.ev = this.ev.filter(e => e.t0 + e.z >= t);
    this._sample(v, rh);
    const c = LC[this.lead] || LC.II, o = this.cur;
    this.buf[this.n & 8191] = o[0] * c[0] + o[1] * c[1] + o[2] * c[2] + o[3] + evalLead(this.ev, t, this.lead);
    this.n++;
  }

  _fire(t, type, vent, np, v) {
    const rr = min(9.99, t - this.lastBeatT), perfused = v.pulse !== false && !np;
    const beat = { t, type, perfused, rr, fill: perfused ? clamp(.3 + (rr - .28) * 1.7, .22, 1) * (vent ? .75 : 1) : 0 };
    this.beats.push(beat); if (this.beats.length > 48) this.beats.shift();
    this.beatN++; this.lastBeatT = t; this.lastRR = rr;
    if (this.onBeat) this.onBeat(beat);
  }

  _add(b, tQ, cb) { b.t0 = tQ; b.cb = cb; this.ev.push(b); if (!b.pOnly) { this.lastQ = tQ; if (b.type === 'N') this.meas = b; } return b; }

  _switch(key, rh, v) {
    const t = this.time, r = this.rng, prev = this.rh, quiet = !prev || /^(vf|asys|tors)/.test(prev);
    this.ev = this.ev.filter(e => e.t0 + e.a <= t);              // beats already under way run to completion
    const rr = 60 / this._hr(v, rh), gap = prev ? clamp(rr * r.r(.55, .95), .25, 1.3) * (quiet ? 1.5 : 1) : r.r(.1, .4);
    this.aNext = this.vNext = max(t + gap, this.lastQ + .32);
    this.cyc = 0; this.flErr = 0; this.asysT = 0;
    if (rh === 'aflutter') { this.flT = v.hr > 152 ? 30 / v.hr : .2; this.flBase = this.vNext - .62 * this.flT; this.flK = 0; }
    this.rh = key;
  }

  _mor(v) {
    const k = `${v.st || 0}|${+!!v.tInv}${+!!v.peakedT}${+!!v.wideQRS}${+!!v.longQT}${+!!v.lowVoltage}|${this.lead}`;
    if (k !== this._mk) { this._mk = k; this._M = liveMorph(this.morph, v, this.lead); }
    return this._M;
  }

  _plan(v, rh) {
    const t = this.time, L = .62, r = this.rng, M = this._mor(v), hr = this._hr(v, rh), rr0 = 60 / hr, d = v.defib;
    switch (RH[rh][0]) {
      case 'sinus': while (this.aNext - t < L) this._pSinus(v, M, hr); break;
      case 'pea':
        if (v.peaLook === 'wide') while (this.vNext - t < L) { this._add(buildBeat('V', M, rr0, r, { q: 'esc', amp: .7, qs: 1.12 }), this.vNext, 'V'); this.vNext += rr0 * (1 + .02 * r.n()); }
        else if (v.peaLook === 'brady') while (this.aNext - t < L) this._pSinus(v, { ...M, p: (M.p ?? 1) * .55, qs: (M.qs || 1) * 1.18, amp: (M.amp ?? 1) * .8 }, hr, .3);
        else while (this.aNext - t < L) this._pSinus(v, M, hr);
        break;
      case 'af':            // irregularly irregular: every RR drawn independently, no P
        while (this.vNext - t < L) {
          this._add(buildBeat('N', M, rr0, r, { noP: true, amp: 1 + .06 * r.n() }), this.vNext, 'A');
          let rr = max(.26, rr0 * clamp(1 + .27 * r.n(), .5, 1.9));
          if (v.pvc > 0 && r() < v.pvc) { const pv = buildBeat('V', M, rr0, r, { q: 'pvc' }); pv.np = true; this._add(pv, this.vNext + r.r(.38, .5), 'V'); rr = max(rr, .95); }
          this.vNext += rr;
        }
        break;
      case 'fl': {          // QRS locked to the flutter waves, 2:1 to 4:1 (variable when the rate falls between)
        while (this.vNext - t < L) {
          this._add(buildBeat('N', { ...M, ta: (M.ta ?? 1) * .55 }, rr0, r, { noP: true }), this.vNext, 'A');
          const want = clamp(rr0 / this.flT, 2, 6) + this.flErr, N = clamp(round(want + .18 * r.n()), 2, 6);
          this.flErr = want - N; this.flK += N; this.vNext = this.flBase + (this.flK + .62) * this.flT;
        }
        break;
      }
      case 'reg':
        while (this.vNext - t < L) {
          let b, cb = 'V', jit = .012;
          if (rh === 'svt') { b = buildBeat('N', { ...M, st: M.st || [-.03, -.07, -.03], ta: (M.ta ?? 1) * .85 }, rr0, r, { noP: true, retro: .078 }); cb = 'A'; jit = .004; }
          else if (rh === 'junctional') { b = buildBeat('N', M, rr0, r, { noP: true, retro: this.jRetro }); cb = 'A'; }
          else if (rh === 'idioventricular') { b = buildBeat('V', M, rr0, r, { q: 'esc' }); jit = .02; }
          else if (rh === 'agonal') { b = buildBeat('V', M, rr0, r, { q: 'ago', amp: r.r(.45, 1.1), qs: r.r(.85, 1.5) }); jit = .22; }
          else if (rh === 'paced') { b = buildBeat('P', M, rr0, r, { q: 'pace', spike: M.spike }); cb = 'P'; jit = 0; }
          else b = buildBeat('V', M, rr0, r, { q: 'vt' });
          this._add(b, this.vNext, cb);
          this.vNext += max(.2, rr0 * (1 + jit * r.n()));
        }
        if (rh === 'vt' || rh === 'vtPulseless') while (this.aNext - t < L) { this._add(buildBeat('N', M, .85, r, { pOnly: true }), this.aNext + .16, 'N'); this.aNext += .85 * (1 + .03 * r.n()); }   // AV dissociation
        break;
      case 'chb': {         // atria and ventricles each keep their own clock
        while (this.aNext - t < L) { const pr = 60 / 82 * (1 + .03 * sin(TAU * this.resp) + .012 * r.n()); this._add(buildBeat('N', M, pr, r, { pOnly: true }), this.aNext + .16, 'N'); this.aNext += pr; }
        const er = 60 / clamp(hr, 20, 55);
        while (this.vNext - t < L) { this._add(buildBeat('V', M, er, r, { q: 'esc' }), this.vNext, 'V'); this.vNext += er * (1 + .012 * r.n()); }
        break;
      }
      case 'm2': {          // constant PR, sudden dropped beats
        const ar = 60 / clamp(hr / .72, 44, 115);
        while (this.aNext - t < L) {
          if (this.cyc <= 0) this.cyc = r() < .12 ? 2 : r() < .5 ? 3 : r() < .75 ? 4 : 5;
          const drop = --this.cyc === 0, b = buildBeat('N', { ...M, q: M.q || 'rbbb' }, ar, r, { pOnly: drop, pr: .2 });
          this._add(b, this.aNext + .2, 'N'); this.aNext += ar * (1 + .012 * r.n());
        }
        break;
      }
      case 'wb': {          // PR stretches by shrinking increments until a beat drops
        const INC = [0, .075, .12, .15, .17], ar = 60 / clamp(hr * 4 / 3, 44, 125);
        while (this.aNext - t < L) {
          if (this.cyc <= 0) { this.cycN = this.cyc = r() < .3 ? 3 : r() < .75 ? 4 : 5; }
          const i = this.cycN - this.cyc, drop = --this.cyc === 0, pr = .17 + INC[i];
          this._add(buildBeat('N', M, ar, r, { pOnly: drop, pr }), this.aNext + pr, 'N'); this.aNext += ar * (1 + .01 * r.n());
        }
        break;
      }
      case 'asys':          // ventricular standstill: a few lonely P waves early on, then nothing
        this.asysT += 1 / this.fs;
        while (this.aNext - t < L) { if (r() < .75 * exp(-this.asysT / 14)) this._add(buildBeat('N', { ...M, p: .8 }, 1.2, r, { pOnly: true }), this.aNext + .16, 'N'); this.aNext += r.r(1.1, 3.2); }
        break;
    }
    // an external pacer that is firing without capture marches its spikes through whatever rhythm is there
    if (d && d.mode === 'pacer' && d.paceMa > 0 && rh !== 'paced') {
      if (this.sNext < t - 2) this.sNext = t + .3;
      while (this.sNext - t < .1) { this.ev.push({ t0: this.sNext, type: 'S', w: [], fid: 0, a: -.02, z: .06, spike: [0, .9], pOnly: true, fired: true }); this.sNext += 60 / clamp(d.paceRate || 70, 30, 180); }
    }
  }

  _pSinus(v, M, hr, rsaK = 1) {
    const r = this.rng, rr0 = 60 / hr, tP = this.aNext;
    const rsa = rsaK * .045 * clamp(rr0 / .9, .15, 1.2) * sin(TAU * (this.resp + (tP - this.time) * (v.rr > 0 ? v.rr : 14) / 60));
    const rr = rr0 * (1 + rsa + .012 * r.n());
    const alt = v.alternans ? ((this.altF = !this.altF) ? 1 : .52) : 1;
    const b = buildBeat('N', M, rr0, r, { amp: alt });
    this._add(b, tP + b.pr, 'N');
    let next = tP + rr;
    const f = clamp(v.pvc || 0, 0, .9);
    if (f > 0 && r() < min(1, f / (1 - f))) {      // ectopic after this beat; the sinus node keeps time underneath
      let tV = b.t0 + clamp(rr0 * r.r(.5, .64), .34, .72), last = b.t0, n = 0;
      do {
        const pv = buildBeat('V', M, max(.5, rr0), r, { q: f > .12 && r() < .12 ? 'pvc2' : 'pvc' }); pv.np = tV - last < .5;
        this._add(pv, tV, 'V'); last = tV; tV += r.r(.4, .5); n++;
      } while (n < 4 && r() < (f > .5 ? (2 * f - 1) / f : f * .25));
      while (next + b.pr < last + .6) next += rr;   // blocked sinus beats: the full compensatory pause
    }
    this.aNext = next;
  }

  _sample(v, rh) {
    const t = this.time, dt = 1 / this.fs, o = this.cur, nz = this.nz;
    o[0] = o[1] = o[2] = o[3] = 0;
    evalEvents(this.ev, t, o);

    // ventricular fibrillation: drifting band-limited chaos; 'vfFine' lets the amplitude sink slowly
    const isVF = rh === 'vf' || rh === 'vfFine', tg = isVF ? (rh === 'vfFine' ? .2 : 1.1) : 0;
    this.vfA += (tg - this.vfA) * dt / (!isVF ? .06 : tg < this.vfA ? 9 : .3);
    if (this.vfA > .003) {
      let x = 0, y = 0, z = 0; const fk = .66 + .34 * clamp(this.vfA / 1.1);
      for (let i = 0; i < 5; i++) {
        const q = this.vfO[i]; q.f = nz() < .0016 ? 3.2 + 4.8 * nz() : clamp(q.f + (nz() - .5) * .4, 3.2, 8); q.p += TAU * q.f * fk * dt; q.l += TAU * q.lf * dt;
        const a = .5 + .5 * sin(q.l); x += a * sin(q.p + q.px); y += a * sin(q.p); z += a * sin(q.p + q.pz);
      }
      const e = this.vfA * .48 * (.72 + .28 * sin(TAU * .17 * t + 1) * sin(TAU * .41 * t));
      o[0] += x * e * .7; o[1] += y * e; o[2] += z * e * .9;
    }
    // torsades: a fast ventricular wave whose axis rotates, so every lead swells, shrinks and flips
    this.tdA += ((rh === 'torsades' ? 1 : 0) - this.tdA) * dt / .2;
    if (this.tdA > .003) {
      const p0 = this.tdP; this.tdP += this._hr(v, 'torsades') / 60 * dt; this.tdTh += TAU * dt / (2.7 + .5 * sin(TAU * .09 * t));
      if (floor(this.tdP) !== floor(p0) && rh === 'torsades') this._fire(t, 'V', true, true, v);
      const a = TAU * this.tdP, w = (sin(a) + .22 * sin(2 * a + .5)) * 1.15 * this.tdA * (.85 + .15 * sin(TAU * .23 * t));
      o[0] += w * cos(this.tdTh) * .8; o[1] += w * sin(this.tdTh); o[2] += w * cos(this.tdTh + 1) * .6;
    }
    // atrial fibrillation: fine f waves instead of P waves
    this.afA += ((rh === 'afib' ? 1 : 0) - this.afA) * dt / .3;
    if (this.afA > .003) {
      let s = 0, s2 = 0;
      for (let i = 0; i < 3; i++) { const q = this.afO[i]; q.f = clamp(q.f + (nz() - .5) * .3, 4.6, 8.5); q.p += TAU * q.f * dt; q.l += TAU * q.lf * dt; const a = .55 + .45 * sin(q.l); s += a * sin(q.p); s2 += a * sin(q.p + 1.9); }
      o[0] += s2 * .012 * this.afA; o[1] += s * .03 * this.afA; o[2] += s2 * .034 * this.afA;
    }
    // atrial flutter: sawtooth F waves at ~300/min, slow descent and brisk upstroke in the inferior leads
    this.flA += ((rh === 'aflutter' ? 1 : 0) - this.flA) * dt / .25;
    if (this.flA > .003) {
      const a = TAU * (t - this.flBase) / this.flT, s = sin(a) + sin(2 * a) / 2 + sin(3 * a) / 3 + sin(4 * a) / 4;
      o[0] += s * .012 * this.flA; o[1] += s * .135 * this.flA; o[2] -= s * .05 * this.flA;
    }
    // baseline: breathing sway always; wander and muscle tremor with movement
    const ar = this.arS += (clamp(v.artefact || 0) - this.arS) * dt / .3, wp = this.wp;
    const sway = .016 * sin(TAU * this.resp) + .01 * sin(TAU * .071 * t + wp[0]);
    o[0] += sway * .6; o[1] += sway; o[2] += sway * .8;
    if (ar > .002) {
      const burst = .35 + .65 * (.5 + .5 * sin(TAU * .23 * t + wp[1]) * sin(TAU * .61 * t + wp[2]));
      for (let i = 0; i < 3; i++) {
        this.lp[i] += (nz.n() - this.lp[i]) * dt * 7.5;           // ~1.2 Hz electrode wander
        this.mu[i] = .45 * this.mu[i] + nz.n();                   // muscle tremor
        o[i] += ar * (3.2 * this.lp[i] + .16 * sin(TAU * (.29 + .07 * i) * t + wp[i]) + .1 * sin(TAU * 1.07 * t + wp[i] * 2) + .05 * this.mu[i] * burst);
      }
    }
    // chest compressions: big slow swings that bury the rhythm (hence the pause for a rhythm check)
    this.cpA += ((v.cpr ? 1 : 0) - this.cpA) * dt / .12;
    if (this.cpA > .003) {
      const p0 = this.cpP; this.cpP += (v.cprRate || 110) / 60 * dt;
      if (floor(this.cpP) !== floor(p0)) this.cpT = this.rng.r(.72, 1.18);
      this.cpK += (this.cpT - this.cpK) * dt / .1;
      const a = TAU * this.cpP, c = -(sin(a) + .45 * sin(2 * a + .9) + .18 * sin(3 * a + 2.1)) * 1.05 * this.cpK * this.cpA;
      o[0] += c * .35; o[1] += c * .9; o[2] += c * .6;
    }
    if (this.shk) { o[3] += this.shk; this.shk *= 1 - dt / .28; if (this.shk > -.004) this.shk = 0; }
    o[3] += .004 * nz.n();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 12-lead patterns
// ---------------------------------------------------------------------------------------------------------------

const QINF = [[.016, .009, 0, -.16, 0]];            // inferior Q waves
const PAT = {
  normal: { label: 'Normal sinus rhythm', hr: 72, m: {}, interp: ['Sinus rhythm', 'Normal ECG'] },
  sinusTach: { label: 'Sinus tachycardia', hr: 128, m: {}, interp: ['Sinus tachycardia', 'Otherwise normal ECG'] },
  sinusBrady: { label: 'Sinus bradycardia', hr: 46, m: {}, interp: ['Sinus bradycardia', 'Otherwise normal ECG'] },
  inferiorSTEMI: { label: 'Inferior STEMI', hr: 64, m: { st: [-.08, .30, -.06], stShape: 2, t: [.14, .40, .20], qx: QINF },
    interp: ['Sinus rhythm', 'ST elevation II, III, aVF; reciprocal depression I, aVL', 'Consider inferior injury or acute infarct', '*** ACUTE MI SUSPECTED ***'] },
  inferiorRV: { label: 'Inferior STEMI with right ventricular involvement', hr: 58, m: { st: [-.14, .30, .04], stShape: 2, t: [.10, .40, .20], qx: QINF, lead: { V1: { st: .12 }, V2: { st: -.04 } } },
    interp: ['Sinus bradycardia', 'ST elevation II, III, aVF (III > II) and V1', 'Consider right ventricular involvement: record V4R', '*** ACUTE MI SUSPECTED ***'] },
  anteriorSTEMI: { label: 'Anterior STEMI', hr: 88, m: { st: [.04, -.08, .34], stShape: 2, t: [.18, .10, .55], qx: [[.030, .012, 0, 0, -.42]] },
    interp: ['Sinus rhythm', 'ST elevation V1-V4 with Q waves', 'Consider anterior injury or acute infarct', '*** ACUTE MI SUSPECTED ***'] },
  anterolateralSTEMI: { label: 'Anterolateral STEMI', hr: 94, m: { st: [.22, -.10, .28], stShape: 2, t: [.34, .08, .48], qx: [[.030, .012, -.05, 0, -.36]] },
    interp: ['Sinus rhythm', 'ST elevation V2-V6, I, aVL; reciprocal depression III, aVF', 'Consider anterolateral injury or acute infarct', '*** ACUTE MI SUSPECTED ***'] },
  lateralSTEMI: { label: 'Lateral STEMI', hr: 82, m: { st: [.22, -.12, .03], stShape: 2, t: [.36, .12, .26] },
    interp: ['Sinus rhythm', 'ST elevation I, aVL, V5, V6; reciprocal depression III, aVF', 'Consider lateral injury or acute infarct', '*** ACUTE MI SUSPECTED ***'] },
  posteriorMI: { label: 'Posterior MI', hr: 76, m: { st: [.03, .06, -.26], stShape: 0, t: [.16, .22, .44], lead: { V1: { w: [[.036, .011, .40], [.048, .011, .35]] }, V2: { w: [[.036, .011, .60], [.048, .011, .30]] }, V3: { w: [[.036, .011, .30]] } } },
    interp: ['Sinus rhythm', 'ST depression V1-V3 with tall R waves and upright T', 'Consider posterior infarct: record V7-V9', 'Abnormal ECG'] },
  nstemi: { label: 'NSTEMI / diffuse subendocardial ischaemia', hr: 96, m: { st: [-.15, -.12, -.10], stShape: 0, t: [.02, .05, .08] },
    interp: ['Sinus rhythm', 'Widespread ST depression with ST elevation aVR', 'Consider subendocardial ischaemia', 'Abnormal ECG'] },
  afibRVR: { label: 'Atrial fibrillation, rapid ventricular response', rhythm: 'afib', hr: 144, m: { st: [-.05, -.05, -.03] },
    interp: ['Atrial fibrillation with rapid ventricular response', 'Nonspecific ST abnormality', 'Abnormal ECG'] },
  svt: { label: 'Supraventricular tachycardia', rhythm: 'svt', hr: 188, m: {}, interp: ['Supraventricular tachycardia', 'Narrow complex, regular, no P waves seen', 'Abnormal ECG'] },
  vt: { label: 'Ventricular tachycardia', rhythm: 'vt', hr: 176, m: {}, interp: ['Wide complex tachycardia', 'Consider ventricular tachycardia', 'Abnormal ECG'] },
  lbbb: { label: 'Left bundle branch block', hr: 76, m: { q: 'lbbb' }, interp: ['Sinus rhythm', 'Left bundle branch block', 'Abnormal ECG'] },
  rbbb: { label: 'Right bundle branch block', hr: 74, m: { q: 'rbbb' }, interp: ['Sinus rhythm', 'Right bundle branch block', 'Abnormal ECG'] },
  hyperkalaemia: { label: 'Hyperkalaemia', hr: 56, m: { q: 'ivcd', p: .22, pr: .215, t: [.4, .45, .6], twl: .5, twr: .8 },
    interp: ['Sinus bradycardia with first degree AV block', 'Nonspecific intraventricular conduction delay', 'Tall peaked T waves: consider hyperkalaemia', 'Abnormal ECG'] },
  pericarditis: { label: 'Acute pericarditis', hr: 102, m: { st: [.14, .13, .06], stShape: 1, prv: [-.07, -.07, -.02], t: [.2, .22, .26] },
    interp: ['Sinus tachycardia', 'Widespread ST elevation with PR depression', 'Consider pericarditis', 'Abnormal ECG'] },
  pe: { label: 'Pulmonary embolism (S1Q3T3, right heart strain)', hr: 118, m: { qx: [[.014, .008, .14, -.22, 0], [.072, .012, -.42, .10, .14]], t: [.22, .02, -.14] },
    interp: ['Sinus tachycardia', 'S1 Q3 T3 pattern, T inversion V1-V3', 'Consider right ventricular strain', 'Abnormal ECG'] },
  lvh: { label: 'Left ventricular hypertrophy with strain', hr: 78, m: { q: 'lvh' }, interp: ['Sinus rhythm', 'Left ventricular hypertrophy with repolarisation abnormality', 'Abnormal ECG'] },
  wpw: { label: 'Wolff-Parkinson-White', hr: 70, m: { q: 'wpw', pr: .09 }, interp: ['Sinus rhythm', 'Short PR with delta wave: ventricular pre-excitation (WPW)', 'Abnormal ECG'] },
  chb: { label: 'Complete heart block', rhythm: 'chb', hr: 36, m: {}, interp: ['Complete AV block with ventricular escape rhythm', 'AV dissociation', 'Abnormal ECG'] },
  longQT: { label: 'Long QT', hr: 62, m: { qtc: .6, twl: 1.25 }, interp: ['Sinus rhythm', 'Prolonged QT interval', 'Abnormal ECG'] },
  earlyRepol: { label: 'Benign early repolarisation', hr: 58, m: { st: [.06, .07, .16], stShape: 1, t: [.22, .26, .36], j: [.05, .06, .12, .008, .006] },
    interp: ['Sinus bradycardia', 'ST elevation, probably early repolarisation', 'Borderline ECG'] },
  tca: { label: 'Tricyclic (sodium channel blocker) overdose', hr: 126, m: { q: 'ivcd', qx: [[.132, .022, -.14, -.10, .12]], qtc: .47 },
    interp: ['Sinus tachycardia', 'Wide QRS with terminal R wave in aVR, prolonged QT', 'Consider sodium channel blockade', 'Abnormal ECG'] },
  hypothermia: { label: 'Hypothermia (Osborn waves)', hr: 41, m: { j: [.16, .22, .30, .02, .018], qs: 1.15, qtc: .52, pr: .21, p: .7 }, v: { artefact: .22 },
    interp: ['Marked sinus bradycardia', 'J (Osborn) waves, prolonged QT: consider hypothermia', 'Abnormal ECG'] },
  paced: { label: 'Ventricular paced rhythm', rhythm: 'paced', hr: 70, m: { spike: .55 }, interp: ['Ventricular paced rhythm', 'No further analysis attempted'] },
};
const RH_TXT = { sinus: 'Sinus rhythm', afib: 'Atrial fibrillation', aflutter: 'Atrial flutter', svt: 'Supraventricular tachycardia', vt: 'Wide complex tachycardia', vtPulseless: 'Wide complex tachycardia',
  torsades: 'Polymorphic ventricular tachycardia', vf: 'Ventricular fibrillation', vfFine: 'Ventricular fibrillation', asystole: 'No QRS complexes detected', pea: 'Sinus rhythm', chb: 'Complete AV block',
  mobitz2: 'Second degree AV block, Mobitz II', wenckebach: 'Second degree AV block, Mobitz I (Wenckebach)', junctional: 'Junctional rhythm', idioventricular: 'Idioventricular rhythm', agonal: 'Agonal rhythm', paced: 'Ventricular paced rhythm' };
const patOf = id => PAT[id] || (RH[id] ? { label: RH_TXT[id], rhythm: id, hr: RH[id][1], m: {}, interp: [RH_TXT[id], 'Abnormal ECG'] } : PAT.normal);
export const PATTERNS = Object.keys(PAT);
export const PATTERN_INFO = Object.fromEntries(PATTERNS.map(k => [k, { label: PAT[k].label, rhythm: PAT[k].rhythm || 'sinus', hr: PAT[k].hr, interp: PAT[k].interp, morph: PAT[k].m }]));

// ---------------------------------------------------------------------------------------------------------------
// Paper output
// ---------------------------------------------------------------------------------------------------------------

const FONT = (px, w = 700) => `${w} ${px}px Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif`;
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function paperGrid(g, x, y, w, h, mm) {
  g.fillStyle = '#fff5f2'; g.fillRect(x, y, w, h);
  g.lineWidth = 1;
  for (const major of [false, true]) {
    g.strokeStyle = major ? 'rgba(224,96,96,.58)' : 'rgba(238,134,134,.27)'; g.beginPath();
    for (let i = 0; i * mm <= w + .01; i++) if (!(i % 5) === major) { const X = round(x + i * mm) + .5; g.moveTo(X, y); g.lineTo(X, y + h); }
    for (let i = 0; i * mm <= h + .01; i++) if (!(i % 5) === major) { const Y = round(y + i * mm) + .5; g.moveTo(x, Y); g.lineTo(x + w, Y); }
    g.stroke();
  }
}
function traceInk(g, S, i0, i1, x0, dx, base, pxmv) {
  g.beginPath();
  for (let i = i0; i < i1; i++) { const X = x0 + (i - i0) * dx, Y = base - S[i] * pxmv; if (i === i0) g.moveTo(X, Y); else g.lineTo(X, Y); }
  g.strokeStyle = '#15151b'; g.lineWidth = 1.35; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
}
function calPulse(g, x, base, mm) {
  g.beginPath(); g.moveTo(x, base); g.lineTo(x + mm, base); g.lineTo(x + mm, base - 10 * mm); g.lineTo(x + 6 * mm, base - 10 * mm); g.lineTo(x + 6 * mm, base); g.lineTo(x + 7 * mm, base);
  g.strokeStyle = '#15151b'; g.lineWidth = 1.35; g.lineJoin = 'miter'; g.stroke();
}
const ms = s => round(s * 500) * 2;

// 12-lead ECG, 25 mm/s, 10 mm/mV, 3x4 + lead II rhythm strip. pattern: a PATTERNS id (or any rhythm id for a plain
// rhythm). opts { hr, interpret, name, age, sex, time (string), id, seed, v (extra vitals-view fields, e.g. pvc) }.
export function print12(pattern, opts = {}) {
  const P = patOf(pattern), fs = 500, mm = 5, Wd = 1400, Hd = 900, n = fs * 10;
  const cv = mkCanvas(Wd, Hd), g = cv.getContext('2d');
  const bg = new BeatGen({ seed: opts.seed ?? 977 + hashStr(pattern), morph: P.m });
  const v = { ecg: true, rhythm: P.rhythm || 'sinus', hr: opts.hr || P.hr, pulse: true, artefact: .03, rr: 15, ...P.v, ...opts.v };
  for (let i = 0; i < fs * 4; i++) bg._step(v);
  const S = LEADS.map(() => new Float32Array(n)), t0 = bg.time;
  for (let i = 0; i < n; i++) { bg._step(v); for (let l = 0; l < 12; l++) S[l][i] = bg.ecgAt(LEADS[l]); }

  // measurements for the header
  const B = bg.beats.filter(b => b.t > t0), rate = B.length > 1 ? round(60 * (B.length - 1) / (B[B.length - 1].t - B[0].t)) : 0;
  const rh = v.rhythm, m = bg.meas, sinusLike = !P.rhythm || /^(sinus|pea|wenckebach|mobitz2)$/.test(rh), vent = /^(vt|vtPulseless|paced|chb|idioventricular|agonal)$/.test(rh), none = /^(vf|vfFine|asystole|torsades)$/.test(rh);
  const ve = QRS[/^vt/.test(rh) ? 'vt' : rh === 'paced' ? 'pace' : rh === 'agonal' ? 'ago' : 'esc'], rrM = rate ? 60 / rate : 1;
  const qrsd = vent ? ve.dur : m ? m.dur : .09, qt = vent ? ve.dur + .14 * sqrt(clamp(rrM / .8, .32, 1.7)) + .12 : m ? m.qt : .4;
  const ax = m && !vent ? m.ax : [null, null, null];
  const rows = [['Vent. rate', rate ? rate + ' bpm' : '*'], ['PR interval', sinusLike && m && !/^(wen|mob)/.test(rh) ? ms(m.pr) + ' ms' : '*'], ['QRS duration', none ? '*' : ms(qrsd) + ' ms'],
    ['QT/QTc', none || /^vt/.test(rh) ? '*' : ms(qt) + '/' + ms(qt / sqrt(rrM)) + ' ms'], ['P-R-T axes', (sinusLike && ax[0] != null ? ax[0] : '*') + '  ' + (ax[1] ?? '*') + '  ' + (ax[2] ?? '*')]];

  // sheet
  const x0 = 104, top = 122, gridH = 740, segW = 62.5 * mm;
  g.fillStyle = '#fbf7f4'; g.fillRect(0, 0, Wd, Hd);
  paperGrid(g, 20, top, Wd - 40, gridH, mm);
  g.fillStyle = '#16161c'; g.textBaseline = 'alphabetic';
  g.font = FONT(19); g.fillText((opts.name || 'UNKNOWN, PATIENT').toUpperCase(), 28, 34);
  g.font = FONT(14, 400);
  g.fillText(`Age: ${opts.age ?? '--'}    Sex: ${opts.sex || '-'}`, 28, 56);
  g.fillText(`ID: ${opts.id || 'KC-' + String(100000 + hashStr(pattern + (opts.name || '')) % 899999)}`, 28, 76);
  g.fillText(`12-Lead 1     ${opts.time || ''}`, 28, 96);
  rows.forEach((r, i) => { g.font = FONT(14, 400); g.fillText(r[0], 330, 34 + i * 19); g.font = FONT(14); g.fillText(r[1], 448, 34 + i * 19); });
  if (opts.interpret) {
    P.interp.forEach((s, i) => { g.font = FONT(s[0] === '*' ? 16 : 14, s[0] === '*' ? 700 : 400); g.fillText(s, 640, 34 + i * 20); });
    g.font = FONT(12, 400); g.fillStyle = '#555'; g.fillText('Unconfirmed computer interpretation. Clinical correlation required.', 640, 34 + P.interp.length * 20 + 2); g.fillStyle = '#16161c';
  } else { g.font = FONT(13, 400); g.fillStyle = '#666'; g.fillText('Interpretation: OFF', 640, 34); g.fillStyle = '#16161c'; }
  g.textAlign = 'right'; g.font = FONT(13); g.fillText('KETTER COUNTY EMS', Wd - 28, 34); g.font = FONT(13, 400); g.fillText('MEDIC 14', Wd - 28, 54); g.fillText('x1.0   0.05-150 Hz   25 mm/s   10 mm/mV', Wd - 28, 96); g.textAlign = 'left';

  const grid = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']], dx = 25 * mm / fs, pxmv = 10 * mm;
  g.save(); g.beginPath(); g.rect(20, top, Wd - 40, gridH); g.clip();
  for (let r = 0; r < 4; r++) {
    const base = top + 105 + r * 180 + (r === 3 ? 5 : 0);
    calPulse(g, x0 - 9 * mm, base, mm);
    if (r === 3) { traceInk(g, S[1], 0, n, x0, dx, base, pxmv); g.font = FONT(15); g.fillText('II', x0 + 6, base - 58); continue; }
    for (let c = 0; c < 4; c++) {
      const L = grid[r][c], xs = x0 + c * segW, i0 = c * n / 4;
      traceInk(g, S[LEADS.indexOf(L)], i0, i0 + n / 4, xs, dx, base, pxmv);
      g.font = FONT(15); g.fillStyle = '#16161c'; g.fillText(L, xs + 6, base - 58);
      if (c) g.fillRect(round(xs) - 1, base - 15, 1.5, 30);
    }
  }
  g.restore();
  g.font = FONT(12, 400); g.fillStyle = '#444'; g.fillText('25 mm/s   10 mm/mV   0.05-150 Hz', 28, Hd - 14);
  g.textAlign = 'right'; g.fillText('Unit M14  ·  S/N 4471902  ·  Halloran Falls, Ketter County', Wd - 28, Hd - 14); g.textAlign = 'left';
  return cv;
}

// Static rhythm strip. opts { hr, seconds, w, h, paper (default true; false = green on black), lead, seed, label,
// pattern (a PATTERNS id to borrow its morphology), v (extra vitals-view fields such as pvc, st, cpr, artefact) }.
export function strip(rhythm, opts = {}) {
  const fs = 500, paper = opts.paper !== false, h = opts.h || 190, mm = opts.mm || 4.2, lead = opts.lead || 'II';
  const w = opts.w || round((opts.seconds || 8) * 25 * mm), n = ceil(w / (25 * mm) * fs);
  const P = opts.pattern ? PAT[opts.pattern] : null;
  const bg = new BeatGen({ seed: opts.seed ?? 31 + hashStr(rhythm), lead, morph: P ? P.m : null });
  const v = { ecg: true, rhythm, hr: opts.hr, pulse: true, rr: 15, ...(P ? P.v : null), ...opts.v };
  for (let i = 0; i < fs * 4; i++) bg._step(v);
  const S = new Float32Array(n); for (let i = 0; i < n; i++) { bg._step(v); S[i] = bg.ecgAt(lead); }
  const cv = mkCanvas(w, h), g = cv.getContext('2d'), base = round(h * .6), pxmv = 10 * mm, dx = 25 * mm / fs;
  if (paper) { paperGrid(g, 0, 0, w, h, mm); traceInk(g, S, 0, n, 0, dx, base, pxmv); }
  else {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(110,140,125,.5)';
    for (let x = 0; x < w; x += 5 * mm) for (let y = base % (5 * mm); y < h; y += 5 * mm) g.fillRect(round(x), round(y), 1, 1);
    g.beginPath(); for (let i = 0; i < n; i++) { const X = i * dx, Y = base - S[i] * pxmv; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.lineJoin = 'round'; g.strokeStyle = COL.ecg; g.globalAlpha = .2; g.lineWidth = 4.5; g.stroke(); g.globalAlpha = 1; g.lineWidth = 1.5; g.stroke();
  }
  const label = opts.label ?? `${lead}   25 mm/s   10 mm/mV`;
  if (label) { g.font = FONT(12); g.fillStyle = paper ? '#33333a' : '#9fb3a8'; g.textAlign = 'left'; g.fillText(label, 8, 16); }
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------------------------------------------

const COL = { ecg: '#4dff78', spo2: '#3fd9ff', co2: '#ffe24d', nibp: '#f2f3f5', temp: '#ffa64d', bgl: '#c9a8ff', red: '#ee2a1e', amber: '#ffcf24', dim: '#7c8591', dim2: '#4b525c', bar: '#12151a', line: '#262b33', white: '#f4f6f8' };
export const LIMITS = { hrHi: 150, hrLo: 50, spo2Lo: 90, co2Hi: 50, co2Lo: 25, rrHi: 30, rrLo: 8, sysHi: 180, sysLo: 90 };
const MODES = { monitor: ['MONITOR', '#1d6b5a'], manual: ['MANUAL DEFIB', '#b3261e'], aed: ['AED', '#1c7a36'], pacer: ['PACER', '#1b5fae'] };
const KEYS = {
  monitor: [['lead', 'LEAD'], ['nibp', 'NIBP'], ['12lead', '12-LEAD'], ['freeze', 'FREEZE'], ['silence', 'ALARM PAUSE']],
  manual: [['energyDown', 'ENERGY -'], ['energyUp', 'ENERGY +'], ['charge', 'CHARGE'], ['shock', 'SHOCK'], ['sync', 'SYNC'], ['disarm', 'DISARM']],
  aed: [['analyse', 'ANALYSE'], ['shock', 'SHOCK'], ['freeze', 'FREEZE'], ['silence', 'ALARM PAUSE']],
  pacer: [['rateDown', 'RATE -'], ['rateUp', 'RATE +'], ['maDown', 'mA -'], ['maUp', 'mA +'], ['pacePause', 'PAUSE'], ['silence', 'ALARM PAUSE']],
};
const LEAD_CYCLE = ['II', 'III', 'aVR', 'aVL', 'aVF', 'I'];
const mmss = s => { s = max(0, floor(s)); return floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
// arterial pulse at the finger: brisk systolic upstroke, dicrotic notch and wave, slow diastolic run-off
const pulseWave = u => { const a = u / .11; return a * a * exp(2 * (1 - a)) + .24 * exp(-.5 * ((u - .38) / .055) ** 2) + .78 * (1 - exp(-u / .07)) * exp(-u / .42); };

// Capnogram as a fraction of end-tidal CO2. ph: 0 = start of inspiration, expiration from ~0.36.
function capno(ph, shape) {
  if (shape === 'flat') return 0;
  if (ph < .045) return 1 - sstep(0, .045, ph);              // phase 0: inspiratory downstroke
  if (ph < .39) return 0;                                    // inspiration, then dead-space gas (phase I)
  const u = (ph - .39) / .61;
  if (shape === 'sharkfin') return (1 - exp(-3.1 * u)) / (1 - exp(-3.1));       // obstructed: no plateau
  let k = sstep(0, .15, u) * (.9 + .1 * u);                  // phase II upstroke, gently rising plateau (III)
  if (shape === 'curare') k *= 1 - .3 * exp(-.5 * ((u - .62) / .045) ** 2);     // cleft: patient breathing against the vent
  return k;
}

export class Monitor {
  // canvas: CSS-sized by the page (or an off-DOM canvas, whose width/height are then used as is).
  // opts: { softKeys: true }  set false to hide the on-screen soft-key row.
  //       { drive: 'auto' }   'auto' advances beatGen only on frames where nobody else called beatGen.update();
  //                           false never touches it (the game owns it), true always does.
  constructor(canvas, beatGen, opts = {}) {
    this.c = canvas; this.g = canvas.getContext('2d', { alpha: false });
    this.bg = beatGen || new BeatGen();
    this.opts = { softKeys: true, drive: 'auto', ...opts };
    this.limits = { ...LIMITS };
    this.stats = { ms: 0, frames: 0 };
    this.reset();
  }

  reset() {
    this._t = 0; this._sil = 0; this.frozen = false; this._n = this.bg.n; this._tick = -1; this._beatSeen = this.bg.beatN;
    this._hr = null; this._pr = null; this._blink = 0; this._al = { lvl: 0, text: '', list: [] }; this._apnea = 0;
    this._spikeSeen = this.bg.spikeN; this._keys = []; this._keyId = null; this._keyT = 0; this._plo = 0; this._phi = .4; this._bp = 0; this._bpPrev = null; this._cprPh = 0;
    this._cuff = 0; this._srch = 0; this._k = {}; this._marks = []; this._lw = 0; this._lh = 0; this._v = {}; this._dt = 0; this._hrRaw = this._prRaw = null;
  }

  // ---- public state ----
  get alarmLevel() { return ['none', 'advisory', 'critical'][this._al.lvl]; }             // what the limits say
  get alarm() { return this._sil > 0 || this._v.muted ? 'none' : this.alarmLevel; }       // what should be sounding
  get alarmText() { return this._al.text; }
  get silenced() { return this._sil > 0; }
  get hr() { return this._hr; }
  get lead() { return this.bg.lead; }
  set lead(L) { if (LC[L]) { this.bg.lead = L; } }
  silence(seconds = 120) { this._sil = max(0, seconds); }
  freeze(on) { this.frozen = !!on; }
  // Click (CSS px relative to the canvas) -> soft-key id or null.
  hit(x, y) { for (const k of this._keys) if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) { this._keyId = k.id; this._keyT = .18; return k.id; } return null; }
  // Soft keys the screen can serve by itself. Returns true when consumed; everything else is the game's to act on.
  handle(id) {
    if (id === 'freeze') this.freeze(!this.frozen); else if (id === 'silence') this.silence(this._sil > 0 ? 0 : 120);
    else if (id === 'lead') this.lead = LEAD_CYCLE[(LEAD_CYCLE.indexOf(this.lead) + 1) % LEAD_CYCLE.length]; else return false;
    return true;
  }

  // ---- layout ----
  _layout() {
    const c = this.c, inDom = c.clientWidth > 0, W = inDom ? c.clientWidth : c.width, H = inDom ? c.clientHeight : c.height;
    const dpr = inDom ? min(globalThis.devicePixelRatio || 1, 3) : 1;
    if (W === this._lw && H === this._lh && dpr === this.dpr) return false;
    if (inDom) {
      const w = round(W * dpr), h = round(H * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; if (c.clientWidth !== W) { c.style.width = W + 'px'; c.style.height = H + 'px'; } }
    }
    this._lw = this.W = W; this._lh = this.H = H; this.dpr = dpr;
    const s = this.s = min(W / 520, H / 340), px = this._px = a => round(a * dpr) / dpr;
    const top = px(22 * s), keys = this.opts.softKeys ? px(23 * s) : 0, bar = px(36 * s), midH = H - top - bar - keys, nx = px(W * .7), lab = px(13 * s);
    const hE = px(midH * .45), hP = px(midH * .245), hC = midH - hE - hP;
    const ch = (y, h, col) => ({ x: 0, y, w: nx, h, ty: y + lab, th: h - lab - px(2), col });
    const R = this.R = { top: { x: 0, y: 0, w: W, h: top }, ecg: ch(top, hE, COL.ecg), pl: ch(top + hE, hP, COL.spo2), co: ch(top + hE + hP, hC, COL.co2),
      bar: { x: 0, y: top + midH, w: W, h: bar }, keys: { x: 0, y: H - keys, w: W, h: keys }, t: [] };
    let y = top; [.275, .22, .22, .175, .11].forEach((f, i) => { const h = i === 4 ? top + midH - y : px(midH * f); R.t.push({ x: nx, y, w: W - nx, h }); y += h; });
    // sweep: ECG and pleth at 25 mm/s with ~2.9 px per mm at the 520 px reference size (about five seconds across),
    // the capnogram at 12.5 mm/s so a couple of breaths fit. Each channel keeps one y per stored point.
    const fs = this.bg.fs, pxmm = this.pxmm = 2.9 * W / 520;
    const sw = (key, r, mmps, every) => { const dx = mmps * pxmm / fs * every, N = ceil(nx / dx); return { key, r, dx, N, every, Y: new Float32Array(N).fill(NaN), di: 0, mg: ceil(6 / dx) }; };
    this.ch = [sw('ecg', R.ecg, 25, 1), sw('pl', R.pl, 25, 4), sw('co', R.co, 12.5, 4)];
    this.pxmv = min(10 * pxmm, R.ecg.th / 3.3); this.base = R.ecg.ty + R.ecg.th * .6;
    this._marks = []; this._k = {}; this._co2Top = 60;
    const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.fillStyle = COL.line; const o = 1 / dpr;
    g.fillRect(nx - o, top, o, midH); for (const k of ['pl', 'co']) g.fillRect(0, R[k].y - o, nx, o); for (let i = 1; i < 5; i++) g.fillRect(nx, R.t[i].y - o, W - nx, o);
    return true;
  }

  // ---- sweep ----
  _grid(key, ch, xa, xb) {
    const g = this.g, o = 1 / this.dpr, px = this._px;
    if (key === 'ecg') {
      const st = 5 * this.pxmm, sy = this.pxmv / 2; g.fillStyle = 'rgba(120,150,135,.42)';
      for (let i = ceil(xa / st); i * st < xb; i++) for (let j = ceil((ch.ty - this.base) / sy); this.base + j * sy < ch.ty + ch.th; j++) g.fillRect(px(i * st), px(this.base + j * sy), o, o);
      if (xa < 5 * this.s) { g.fillStyle = COL.ecg; g.globalAlpha = .6; g.fillRect(px(2 * this.s), this.base - this.pxmv, px(1.5 * this.s), this.pxmv); g.globalAlpha = 1; }      // 1 mV bar
    } else if (key === 'co') {
      g.fillStyle = 'rgba(160,150,90,.5)'; const y40 = px(ch.ty + ch.th - 1 - 40 / this._co2Top * (ch.th - 3)), st = 4 * this.s;
      for (let i = ceil(xa / st); i * st < xb; i++) g.fillRect(px(i * st), y40, o, o);
    }
  }
  // Repaint slots s0..s1 of one channel and push its erase bar on. A margin behind the new points is repainted too,
  // clipped, from the same polyline: the result is pixel-identical to stroking the whole trace, so the glow never
  // stacks up at the joins, yet only a sliver of canvas is touched per frame.
  _seg(c, s0, s1) {
    const g = this.g, ch = c.r, dx = c.dx, dpr = this.dpr, Y = c.Y, a = max(0, s0 - c.mg), a2 = max(0, a - c.mg);
    const xa = floor(a * dx * dpr) / dpr, xb = min(ch.w - 1 / dpr, ceil(s1 * dx * dpr) / dpr), k = max(1, this.s) ** .7, ew = 12 * this.s;
    g.save(); g.beginPath(); g.rect(xa, ch.ty, xb - xa, ch.th); g.clip();
    g.fillStyle = '#000'; g.fillRect(xa, ch.ty, xb - xa, ch.th);
    this._grid(c.key, ch, xa, xb);
    g.beginPath(); let pen = false;
    for (let i = a2; i <= s1; i++) { const y = Y[i]; if (y !== y) { pen = false; continue; } if (pen) g.lineTo(i * dx, y); else { g.moveTo(i * dx, y); pen = true; } }
    g.lineJoin = 'round'; g.strokeStyle = ch.col; g.globalAlpha = .2; g.lineWidth = 4.4 * k; g.stroke(); g.globalAlpha = 1; g.lineWidth = 1.45 * k; g.stroke();
    if (c.key === 'ecg') for (const m of this._marks) {          // sync markers ride above the R waves; pacer spikes get a drawn marker
      const sl = m.di % c.N; if (m.di <= c.di - c.N || sl < a2 || sl > s1 + c.mg) continue;
      const x = sl * dx, y = ch.ty + 1.5 * this.s, q = 3.2 * this.s;
      if (m.s) { const w = max(1 / dpr, 1.3 * k); g.fillStyle = '#eafff0'; g.fillRect(x - w / 2, this.base - .95 * this.pxmv, w, 1.1 * this.pxmv); continue; }
      g.fillStyle = COL.white; g.beginPath(); g.moveTo(x - q, y); g.lineTo(x + q, y); g.lineTo(x, y + q * 1.5); g.closePath(); g.fill();
    }
    g.restore();
    g.fillStyle = '#000'; const er = min(ew, ch.w - 1 / dpr - xb); if (er > 0) g.fillRect(xb, ch.ty, er, ch.th); if (er < ew) g.fillRect(0, ch.ty, ew - max(er, 0), ch.th);
  }

  // ---- per-frame ----
  update(dt, v) {
    const T0 = performance.now(), bg = this.bg, fs = bg.fs; v = v || {}; this._v = v;
    dt = this._dt = clamp(dt, 0, .25); this._t += dt; if (this._sil > 0) this._sil = max(0, this._sil - dt); if (this._keyT > 0) this._keyT -= dt;
    const fresh = this._layout();
    const drive = this.opts.drive;                               // drive the generator only when nobody else does
    if (dt > 0 && drive && (drive === true || bg.ticks === this._tick)) bg.update(dt, v);
    this._tick = bg.ticks;
    const R = this.R, d = v.defib || {};

    // new beats: rate counters, sync marks
    let nb = bg.beatN - this._beatSeen; this._beatSeen = bg.beatN;
    if (nb < 0 || nb > bg.beats.length) nb = 0;
    if (bg.n < this._n) this._n = bg.n;
    let from = this._n; if (bg.n - from > fs * .6) from = bg.n - (fs >> 2);
    const [cE, cP, cC] = this.ch, d0 = [cE.di, cP.di, cC.di];
    for (let i = bg.beats.length - nb; i < bg.beats.length; i++) {
      const b = bg.beats[i]; this._blink = .14;
      if (d.sync && v.ecg && !this.frozen) this._marks.push({ di: cE.di + clamp(round(b.t * fs) - 1 - from, 0, bg.n - from) });
    }
    let ns = bg.spikeN - this._spikeSeen; this._spikeSeen = bg.spikeN; if (ns < 0 || ns > bg.spikes.length) ns = 0;
    if (v.ecg && !this.frozen) for (let i = bg.spikes.length - ns; i < bg.spikes.length; i++) this._marks.push({ di: cE.di + clamp(round(bg.spikes[i] * fs) - 1 - from, 0, bg.n - from), s: 1 });
    if (this._marks.length && this._marks[0].di < cE.di - cE.N) this._marks = this._marks.filter(m => m.di >= cE.di - cE.N);
    if (nb || fresh) this._rates(bg);
    this._blink -= dt;

    // samples -> sweep
    const cnt = bg.n - from, perf = v.perf ?? 0;
    const pOn = !!v.spo2On, searching = pOn && (perf < .08), cOn = !!v.capOn, pl = R.pl, co = R.co;
    const pA = clamp(.1 + perf * 1.05) * (pl.th - 4), pBot = pl.ty + pl.th - 2, cBot = co.ty + co.th - 1, cK = (co.th - 3) / this._co2Top, eMin = R.ecg.ty + 1, eMax = R.ecg.ty + R.ecg.th - 1;
    let ph0 = this._bp, dph = (v.rr > 0 ? v.rr : 0) / 60 / fs;
    if (v.breathPhase != null && cnt > 0) { ph0 = this._bpPrev ?? v.breathPhase; let q = v.breathPhase - ph0; if (q < -.5) q += 1; dph = q > 0 && q < .5 ? q / cnt : 0; this._bpPrev = v.breathPhase; }
    const ripple = v.cpr ? 1 : 0, cprHz = (v.cprRate || 110) / 60;
    if (!this.frozen) for (let k = 0; k < cnt; k++) {
      const i = from + k, t = (i + 1) / fs;
      // ECG: dashed flat line while the electrodes are off
      cE.Y[cE.di++ % cE.N] = v.ecg ? clamp(this.base - bg.buf[i & 8191] * this.pxmv, eMin, eMax) : (cE.di >> 5) & 1 ? this.base : NaN;
      this._cprPh = (this._cprPh + cprHz / fs) % 1;
      if (i & 3) continue;
      // pleth: every perfused beat launches an arterial pulse a fifth of a second later
      let p = NaN;
      if (pOn) {
        let s = 0; const B = bg.beats;
        for (let j = B.length - 1; j >= 0 && j >= B.length - 7; j--) { const b = B[j], u = t - b.t - .19; if (u > 2.4) break; if (u > 0 && b.perfused) s += b.fill * pulseWave(u); }
        if (ripple) s += .1 + .1 * sin(TAU * this._cprPh);
        if (s < this._plo) this._plo = s; else this._plo += (s - this._plo) * .006;           // auto-scale like the real thing
        if (s > this._phi) this._phi = s; else this._phi += (max(s, this._plo + .35) - this._phi) * .005;
        let o = (s - this._plo) / max(.35, this._phi - this._plo);
        if (searching) { this._srch += (bg.nz.n() - this._srch) * .05; o = .2 + this._srch * .9 + .025 * bg.nz.n(); }
        p = pBot - clamp(o, 0, 1) * (searching ? .5 * (pl.th - 4) : pA);
      }
      cP.Y[cP.di++ % cP.N] = p;
      // capnogram
      let c = NaN;
      if (cOn) {
        const ph = (ph0 + dph * (k + 1)) % 1; let mm = (v.etco2 || 0) * capno(ph, dph > 0 ? v.capShape || 'normal' : 'flat');
        if (ripple && v.capShape !== 'normal') mm += (v.capShape === 'flat' ? .5 : 1.1) * (.5 + .5 * sin(TAU * this._cprPh));  // compressions push a little gas
        c = cBot - clamp(mm, 0, this._co2Top) * cK;
      }
      cC.Y[cC.di++ % cC.N] = c;
    }
    if (v.breathPhase == null) this._bp = (ph0 + dph * cnt) % 1;
    this._n = bg.n;
    this.ch.forEach((c, j) => { for (let a = d0[j]; a < c.di;) { const sl = a % c.N, m = min(c.di - a, c.N - sl); this._seg(c, sl, sl + m - 1); a += m; } });

    // alarms and text (each block repaints only when its content changes)
    this._alarms(v, dt);
    this._labels(v, d); this._tiles(v, d); this._top(v, d); this._bar(v, d); this._softKeys(v, d);
    const m = performance.now() - T0; this.stats.ms += (m - this.stats.ms) * .05; this.stats.frames++;
  }

  _rates(bg) {
    // Mean of the last few beat-to-beat intervals (a[0] newest). A long pause (adenosine, post-shock) starts a new
    // episode: beats from before it are forgotten, and the pause itself is not averaged in, so the number recovers
    // within two beats. Bigeminy, compensatory pauses and dropped beats (under 2.3x) still average normally.
    const B = bg.beats, t = bg.time, rate = a => {
      if (!a.length) return null;
      let k = 1; while (k < a.length && !(a[k] > a[0] * 2.5 && a[k] > 2.2)) k++;
      const med = a.slice(0, k).sort((x, y) => x - y)[k >> 1]; let s = 0, n = 0;
      if (a[0] > med * 2.3 && a[0] > 2.2) return 60 / a[0];     // first beat after the pause
      for (let i = 0; i < k; i++) if (a[i] <= med * 2.3) { s += a[i]; n++; }
      return 60 * n / s;
    };
    const rr = [], pp = []; let lastP = null;
    for (let i = B.length - 1; i > 0 && rr.length < 8 && t - B[i].t < 10; i--) rr.push(B[i].rr);
    for (let i = B.length - 1; i >= 0 && pp.length < 8 && t - B[i].t < 10; i--) if (B[i].perfused) { if (lastP != null) pp.push(lastP - B[i].t); lastP = B[i].t; }
    this._hrRaw = rate(rr); this._prRaw = rate(pp);
  }

  _alarms(v, dt) {
    const L = this.limits, A = [], bg = this.bg, rh = v.rhythm, age = bg.lastBeatAge;
    // displayed heart rate: counted from detected beats, like the real device
    let hr = null;
    if (v.ecg) {
      if (rh === 'vf' || rh === 'vfFine') hr = null;
      else if (age > 5) hr = 0; else if (this._hrRaw != null) hr = round(age > max(1.6, 150 / this._hrRaw) ? min(this._hrRaw, 60 / age) : this._hrRaw);
    }
    this._hr = hr; this._pr = v.spo2On && (v.perf ?? 0) >= .08 && this._prRaw != null && bg.time - (bg.beats.length ? bg.beats[bg.beats.length - 1].t : -9) < 6 ? round(this._prRaw) : null;
    if (!v.ecg) A.push([1, 'ECG LEADS OFF', 0]);
    else if (/^(vf|vfFine|vt|vtPulseless|torsades)$/.test(rh)) A.push([2, 'VF/VT', 0]);
    else if ((rh === 'asystole' && age > 3.5) || (hr === 0 && !v.cpr)) A.push([2, 'ASYSTOLE', 0]);
    else if (hr != null && !v.cpr) { if (hr > L.hrHi) A.push([hr > L.hrHi + 30 ? 2 : 1, 'HR HIGH ' + hr, 0]); else if (hr < L.hrLo) A.push([hr < L.hrLo - 12 ? 2 : 1, 'HR LOW ' + hr, 0]); }
    if (v.spo2On) {
      if ((v.perf ?? 0) < .08 || v.spo2 == null) A.push(v.pulse === false && v.ecg && !v.cpr ? [2, 'CHECK PATIENT', 1] : [1, 'SpO2 CHECK SENSOR', 1]);
      else if (v.spo2 < L.spo2Lo) A.push([v.spo2 < L.spo2Lo - 5 ? 2 : 1, 'SpO2 LOW ' + round(v.spo2), 1]);
    }
    if (v.capOn) {
      const apn = !(v.rr > 0) || v.capShape === 'flat'; this._apnea = apn ? this._apnea + dt : 0;
      if (apn) { if (this._apnea > 15) A.push([2, 'APNEA', 2]); }
      else if (v.etco2 > L.co2Hi) A.push([1, 'EtCO2 HIGH ' + round(v.etco2), 2]); else if (v.etco2 < L.co2Lo && !v.cpr) A.push([1, 'EtCO2 LOW ' + round(v.etco2), 2]);
      else if (v.rr > L.rrHi) A.push([1, 'RR HIGH ' + round(v.rr), 2]); else if (v.rr < L.rrLo) A.push([1, 'RR LOW ' + round(v.rr), 2]);
    } else this._apnea = 0;
    if (v.nibp && !v.nibpCycling) { const s = v.nibp.sys; if (s < L.sysLo) A.push([s < L.sysLo - 15 ? 2 : 1, 'NIBP SYS LOW ' + round(s), 3]); else if (s > L.sysHi) A.push([1, 'NIBP SYS HIGH ' + round(s), 3]); }
    A.sort((a, b) => b[0] - a[0]);
    const al = this._al; al.list = A; al.lvl = A.length ? A[0][0] : 0; al.text = A.length ? A[0][1] : '';
    al.tile = [0, 0, 0, 0]; for (const a of A) al.tile[a[2]] = max(al.tile[a[2]], a[0]);
    al.f2 = floor(this._t * 4) & 1; al.f1 = floor(this._t * 2) & 1;
  }

  _txt(s, x, y, px, col, al = 'left', w = 700) { const g = this.g; g.font = FONT(px, w); g.fillStyle = col; g.textAlign = al; g.fillText(s, x, y); }
  _dirty(id, key) { if (this._k[id] === key) return false; this._k[id] = key; return true; }

  _labels(v, d) {
    const s = this.s, R = this.R, g = this.g;
    const lab = (id, ch, name, note, noteCol, right) => {
      if (!this._dirty(id, name + note + right)) return;
      g.fillStyle = '#000'; g.fillRect(0, ch.y, ch.w - 1, ch.ty - ch.y);
      this._txt(name, 5 * s, ch.y + 10.5 * s, 10 * s, ch.col);
      if (note) this._txt(note, 5 * s + g.measureText(name).width + 10 * s, ch.y + 10.5 * s, 9.5 * s, noteCol || COL.dim, 'left', 700);
      if (right) this._txt(right, ch.w - 6 * s, ch.y + 10.5 * s, 8.5 * s, COL.dim, 'right', 400);
    };
    const pacing = d.mode === 'pacer' && d.paceMa > 0;
    lab('le', R.ecg, this.lead, !v.ecg ? 'LEADS OFF' : this.frozen ? 'FROZEN' : v.cpr ? 'CPR ARTEFACT' : d.sync ? 'SYNC' : pacing ? 'PACING' : '', !v.ecg || this.frozen ? COL.amber : v.cpr ? COL.dim : COL.white, 'x1.0   25 mm/s');
    lab('lp', R.pl, 'SpO2', !v.spo2On ? 'SENSOR OFF' : (v.perf ?? 0) < .08 ? 'SEARCHING FOR PULSE' : '', COL.dim, 'PLETH');
    lab('lc', R.co, 'CO2', !v.capOn ? 'NO SENSOR' : '', COL.dim, '0-' + this._co2Top + ' mmHg   12.5 mm/s');
  }

  // One numeric tile. o: { id, r, label, unit, col, val, lvl, big, lim, sub: [[text, col]], draw }
  _tile(o) {
    const g = this.g, s = this.s, r = o.r, al = this._al, on = o.lvl && (o.lvl === 2 ? al.f2 : al.f1);
    if (!this._dirty(o.id, [o.val, o.lvl, on, o.unit, o.lim, o.sub, o.extra].join('|'))) return;
    const bgc = on ? (o.lvl === 2 ? COL.red : COL.amber) : '#000', fg = on ? (o.lvl === 2 ? '#fff' : '#000') : o.col, dim = on ? fg : COL.dim, e = 1 / this.dpr;
    g.fillStyle = bgc; g.fillRect(r.x, r.y, r.w, r.h - e);
    this._txt(o.label, r.x + 6 * s, r.y + 13 * s, 11 * s, fg);
    this._txt(o.unit, r.x + 6 * s + g.measureText(o.label).width + 4 * s, r.y + 13 * s, 8 * s, dim, 'left', 400);
    if (o.lim) { this._txt(o.lim[0], r.x + 6 * s, r.y + r.h - 17 * s, 8 * s, dim, 'left', 400); this._txt(o.lim[1], r.x + 6 * s, r.y + r.h - 7 * s, 8 * s, dim, 'left', 400); }
    const big = min(o.big * s, r.h * .8) * (o.val[0] === '-' ? .72 : 1);
    this._txt(o.val, r.x + r.w - 7 * s, r.y + r.h - max(6 * s, (r.h - big * .72) * .36), big, fg, 'right');
    if (o.draw) o.draw(fg, dim);
  }

  _tiles(v, d) {
    const s = this.s, R = this.R.t, al = this._al, L = this.limits, g = this.g;
    // HR
    const beat = this._blink > 0;
    this._tile({ id: 'hr', r: R[0], label: 'HR', unit: 'bpm', col: COL.ecg, val: this._hr == null ? '---' : String(this._hr), lvl: al.tile[0], big: 52, lim: [L.hrHi, L.hrLo], extra: beat,
      draw: fg => { if (beat && v.ecg) { const x = R[0].x + 50 * s, y = R[0].y + 6 * s, q = 3.4 * s; g.fillStyle = fg; g.beginPath(); g.moveTo(x, y + q * 2.3); g.bezierCurveTo(x - q * 2.6, y + q * .4, x - q * .9, y - q, x, y + q * .5); g.bezierCurveTo(x + q * .9, y - q, x + q * 2.6, y + q * .4, x, y + q * 2.3); g.fill(); } } });
    // SpO2 with pulse rate
    const sp = v.spo2On && v.spo2 != null && (v.perf ?? 0) >= .08 ? String(round(v.spo2)) : '---', r1 = R[1];
    this._tile({ id: 'sp', r: r1, label: 'SpO2', unit: '%', col: COL.spo2, val: sp, lvl: al.tile[1], big: 42, lim: ['', L.spo2Lo], sub: this._pr, extra: v.spo2On ? round((v.perf ?? 0) * 8) : -1,
      draw: (fg, dim) => {
        this._txt('PR', r1.x + 44 * s, r1.y + r1.h - 7 * s, 8 * s, dim, 'left', 400); this._txt(this._pr == null ? '---' : String(this._pr), r1.x + 58 * s, r1.y + r1.h - 7 * s, 12 * s, fg);
        if (v.spo2On) { const n = round(clamp(v.perf ?? 0) * 8), bx = r1.x + 30 * s; for (let i = 0; i < 8; i++) { g.fillStyle = i < n ? fg : COL.dim2; g.fillRect(bx, r1.y + r1.h - (9 + i * 3.2) * s, 5 * s, 2.2 * s); } }
      } });
    // EtCO2 with respiratory rate
    const apn = v.capOn && (!(v.rr > 0) || v.capShape === 'flat'), r2 = R[2];
    this._tile({ id: 'co', r: r2, label: 'EtCO2', unit: 'mmHg', col: COL.co2, val: !v.capOn ? '---' : apn ? '0' : String(round(v.etco2 || 0)), lvl: al.tile[2], big: 42, lim: [L.co2Hi, L.co2Lo], sub: v.capOn ? round(v.rr || 0) : '-',
      draw: (fg, dim) => { this._txt('RR', r2.x + 30 * s, r2.y + r2.h - 7 * s, 8 * s, dim, 'left', 400); this._txt(!v.capOn ? '---' : apn ? '0' : String(round(v.rr || 0)), r2.x + 45 * s, r2.y + r2.h - 7 * s, 13 * s, fg); } });
    // NIBP
    const nb = v.nibp, r3 = R[3]; let val = '---/---', sub = '';
    if (v.nibpCycling) { this._cuff = min(this._cuff + 28 * this._dt, 400); const c = this._cuff; val = String(round(c < 165 ? c : max(40, 165 - (c - 165) * .55))); sub = 'CUFF mmHg'; }
    else { this._cuff = 0; if (nb) { val = round(nb.sys) + '/' + round(nb.dia); sub = '(' + round(nb.dia + (nb.sys - nb.dia) / 3) + ')  ' + (nb.age < 60 ? '<1 min' : floor(nb.age / 60) + ' min'); } }
    this._tile({ id: 'nb', r: r3, label: 'NIBP', unit: 'mmHg', col: COL.nibp, val, lvl: al.tile[3], big: 27, sub,
      draw: (fg, dim) => { if (sub) this._txt(sub, r3.x + 6 * s, r3.y + r3.h - 6 * s, 8.5 * s, v.nibpCycling ? COL.amber : dim, 'left', v.nibpCycling ? 700 : 400); } });
    // temperature and glucose
    const r4 = R[4], tp = v.temp != null ? v.temp.toFixed(1) : '--.-', mg = v.units === 'mgdl', gl = v.bgl != null ? (mg ? String(round(v.bgl)) : v.bgl.toFixed(1)) : '--';
    if (this._dirty('aux', tp + gl + mg)) {
      const e = 1 / this.dpr, h = r4.w / 2; g.fillStyle = '#000'; g.fillRect(r4.x, r4.y, r4.w, r4.h); g.fillStyle = COL.line; g.fillRect(r4.x + h, r4.y, e, r4.h);
      const y = r4.y + r4.h - 6 * s;
      this._txt('TEMP', r4.x + 5 * s, r4.y + 10 * s, 7.5 * s, COL.temp); this._txt('°C', r4.x + h - 5 * s, r4.y + 10 * s, 7.5 * s, COL.dim, 'right', 400); this._txt(tp, r4.x + h - 5 * s, y, 14 * s, COL.temp, 'right');
      this._txt('GLU', r4.x + h + 5 * s, r4.y + 10 * s, 7.5 * s, COL.bgl); this._txt(mg ? 'mg/dL' : 'mmol/L', r4.x + r4.w - 5 * s, r4.y + 10 * s, 7.5 * s, COL.dim, 'right', 400); this._txt(gl, r4.x + r4.w - 5 * s, y, 14 * s, COL.bgl, 'right');
    }
  }

  _top(v, d) {
    const g = this.g, s = this.s, r = this.R.top, W = this.W, al = this._al, mode = MODES[d.mode] ? d.mode : 'monitor', on = al.lvl === 2 ? al.f2 : al.f1, sil = ceil(this._sil);
    if (!this._dirty('top', [mode, al.text, al.lvl, on, al.list.length, sil, floor(v.clock || 0), !!v.muted].join('|'))) return;
    g.fillStyle = COL.bar; g.fillRect(0, 0, W, r.h); g.fillStyle = COL.line; g.fillRect(0, r.h - 1 / this.dpr, W, 1 / this.dpr);
    const M = MODES[mode], by = 3.5 * s, bh = r.h - 7 * s, ty = r.h * .5 + 3.6 * s;
    g.font = FONT(9.5 * s); const bw = g.measureText(M[0]).width + 14 * s;
    g.fillStyle = M[1]; g.beginPath(); g.roundRect(4 * s, by, bw, bh, 2.5 * s); g.fill();
    this._txt(M[0], 4 * s + bw / 2, ty, 9.5 * s, '#fff', 'center');
    this._txt('ADULT', 4 * s + bw + 8 * s, ty, 8.5 * s, COL.dim, 'left', 400);
    // alarm banner
    if (al.lvl) {
      const bx = W * .29, w = W * .4, crit = al.lvl === 2;
      g.fillStyle = crit ? (on ? COL.red : '#5e120d') : (on ? COL.amber : '#6a5505'); g.beginPath(); g.roundRect(bx, by - s, w, bh + 2 * s, 2.5 * s); g.fill();
      this._txt(al.text + (al.list.length > 1 ? '   +' + (al.list.length - 1) : ''), bx + w / 2, ty + .4 * s, 11 * s, crit ? '#fff' : on ? '#000' : '#ffe9a0', 'center');
    }
    // bell, clock, batteries
    let x = W - 6 * s;
    for (let i = 0; i < 2; i++) { const bw2 = 17 * s, bh2 = 8 * s, y = r.h / 2 - bh2 / 2, lv = i ? .92 : clamp(.78 - (v.clock || 0) / 9000, .2, 1); x -= bw2 + 2 * s;
      g.strokeStyle = COL.dim; g.lineWidth = s; g.strokeRect(x, y, bw2, bh2); g.fillStyle = COL.dim; g.fillRect(x + bw2, y + 2 * s, 1.6 * s, bh2 - 4 * s); g.fillStyle = '#7ddc8a'; g.fillRect(x + 1.5 * s, y + 1.5 * s, (bw2 - 3 * s) * lv, bh2 - 3 * s); x -= 3 * s; }
    x -= 4 * s; this._txt(mmss(v.clock || 0), x, ty, 11 * s, COL.white, 'right'); x -= g.measureText(mmss(v.clock || 0)).width + 12 * s;
    const off = sil > 0 || v.muted, cx = x, cy = r.h / 2 - .5 * s, q = 4.2 * s;
    g.fillStyle = g.strokeStyle = off ? COL.amber : COL.dim; g.beginPath(); g.moveTo(cx - q, cy + q * .8); g.quadraticCurveTo(cx - q * .7, cy - q * 1.5, cx, cy - q * 1.5); g.quadraticCurveTo(cx + q * .7, cy - q * 1.5, cx + q, cy + q * .8); g.closePath(); g.fill();
    g.beginPath(); g.arc(cx, cy + q * 1.15, q * .32, 0, TAU); g.fill();
    if (off) { g.lineWidth = 1.4 * s; g.beginPath(); g.moveTo(cx - q * 1.3, cy - q * 1.4); g.lineTo(cx + q * 1.3, cy + q * 1.4); g.stroke(); if (sil > 0) this._txt(mmss(sil), cx - q * 1.8, ty, 9 * s, COL.amber, 'right'); }
  }

  _bar(v, d) {
    const g = this.g, s = this.s, r = this.R.bar, W = this.W, mode = MODES[d.mode] ? d.mode : 'monitor', f = floor(this._t * 4) & 1;
    const charging = !d.charged && d.charge > 0 && d.charge < 1, J = round(d.energy ?? 200), cpr = v.cprClock != null ? floor(v.cprClock) : -1;
    let msg = d.msg || '';
    if (!msg) msg = d.charged ? `${J}J READY - STAND CLEAR - PUSH SHOCK` : charging ? `CHARGING ${J}J` : mode === 'pacer' ? (d.paceMa > 0 ? 'PACING' : 'PACER STANDBY - SET RATE AND CURRENT') : mode === 'aed' ? 'ATTACH PADS - PRESS ANALYSE' : mode === 'manual' ? 'SELECT ENERGY - CHARGE' : '';
    if (!this._dirty('bar', [mode, J, round((d.charge || 0) * 48), !!d.charged, d.charged ? f : 0, !!d.sync, d.shocks, d.paceRate, d.paceMa, msg, cpr].join('|'))) return;
    const e = 1 / this.dpr, armed = d.charged, hot = armed && f, y0 = r.y, mid = y0 + r.h / 2;
    g.fillStyle = COL.bar; g.fillRect(0, y0, W, r.h); g.fillStyle = COL.line; g.fillRect(0, y0, W, e);
    // left block: energy, or pacer settings
    const lw = 96 * s;
    if (mode === 'pacer') {
      this._txt('PACER', 6 * s, y0 + 12 * s, 8.5 * s, '#6fb2ff');
      this._txt(String(round(d.paceRate || 70)), 6 * s, y0 + r.h - 6 * s, 17 * s, COL.white); let x = 6 * s + g.measureText(String(round(d.paceRate || 70))).width;
      this._txt('ppm', x + 2 * s, y0 + r.h - 6 * s, 8 * s, COL.dim, 'left', 400); x = 58 * s;
      this._txt(String(round(d.paceMa || 0)), x, y0 + r.h - 6 * s, 17 * s, d.paceMa > 0 ? COL.white : COL.dim); x += g.measureText(String(round(d.paceMa || 0))).width;
      this._txt('mA', x + 2 * s, y0 + r.h - 6 * s, 8 * s, COL.dim, 'left', 400);
    } else {
      if (armed) { g.fillStyle = hot ? COL.red : '#5e120d'; g.fillRect(0, y0 + e, lw, r.h - e); }
      const lit = mode !== 'monitor', c1 = armed ? '#fff' : lit ? COL.white : COL.dim;
      this._txt(armed ? 'CHARGED' : charging ? 'CHARGING' : 'ENERGY', 6 * s, y0 + 11.5 * s, 8 * s, armed ? '#fff' : charging ? COL.amber : COL.dim);
      this._txt(String(J), 6 * s, y0 + r.h - 5.5 * s, 20 * s, c1); const x = 6 * s + g.measureText(String(J)).width;
      this._txt('J', x + 2 * s, y0 + r.h - 5.5 * s, 11 * s, c1, 'left', 400);
      if (d.sync) { g.fillStyle = COL.white; g.beginPath(); g.roundRect(60 * s, y0 + 16 * s, 31 * s, 14 * s, 2 * s); g.fill(); this._txt('SYNC', 75.5 * s, y0 + 26.5 * s, 9 * s, '#000', 'center'); }
    }
    g.fillStyle = COL.line; g.fillRect(lw, y0, e, r.h);
    // centre: message over the charge bar
    const rw = 104 * s, cx0 = lw + 8 * s, cw = W - lw - rw - 16 * s, danger = /shock|clear|charg|analy/i.test(msg);
    if (msg) { let px = 12.5 * s; g.font = FONT(px); const tw = g.measureText(msg).width; if (tw > cw) px *= cw / tw; this._txt(msg, cx0 + cw / 2, y0 + 15 * s, px, armed ? (hot ? '#fff' : '#ff8d84') : danger ? COL.amber : COL.white, 'center'); }
    if (mode === 'manual' || mode === 'aed' || d.charge > 0) {
      const n = 24, gap = 1.5 * s, sw = (cw - gap * (n - 1)) / n, lit = round(clamp(armed ? 1 : d.charge || 0) * n);
      for (let i = 0; i < n; i++) { g.fillStyle = i < lit ? (armed ? COL.red : COL.amber) : '#262a31'; g.fillRect(cx0 + i * (sw + gap), y0 + r.h - 12 * s, sw, 6.5 * s); }
    }
    // right: shocks and the CPR cycle clock
    g.fillStyle = COL.line; g.fillRect(W - rw, y0, e, r.h);
    this._txt('SHOCKS', W - rw + 7 * s, y0 + 11.5 * s, 8 * s, COL.dim); this._txt(String(d.shocks || 0), W - rw + 7 * s, y0 + r.h - 6 * s, 17 * s, COL.white);
    this._txt('CPR', W - 50 * s, y0 + 11.5 * s, 8 * s, cpr >= 0 ? COL.co2 : COL.dim);
    this._txt(cpr >= 0 ? mmss(cpr) : '-:--', W - 6 * s, y0 + r.h - 6 * s, 17 * s, cpr >= 120 ? COL.amber : cpr >= 0 ? COL.white : COL.dim2, 'right');
  }

  _softKeys(v, d) {
    const r = this.R.keys; if (!r.h) return;
    const g = this.g, s = this.s, W = this.W, mode = MODES[d.mode] ? d.mode : 'monitor', f = floor(this._t * 4) & 1, press = this._keyT > 0 ? this._keyId : '';
    if (!this._dirty('keys', [mode, d.charged ? f : 2, press, !!d.sync, this.frozen, this._sil > 0].join('|'))) return;
    const keys = KEYS[mode], n = keys.length, gap = 3 * s, kw = (W - gap * (n + 1)) / n;
    g.fillStyle = '#0a0c0f'; g.fillRect(0, r.y, W, r.h);
    this._keys = keys.map(([id, label], i) => {
      const k = { id, x: gap + i * (kw + gap), y: r.y + 3 * s, w: kw, h: r.h - 6 * s };
      const live = (id === 'sync' && d.sync) || (id === 'freeze' && this.frozen) || (id === 'silence' && this._sil > 0), fire = id === 'shock' && d.charged;
      g.fillStyle = id === press ? '#5a6370' : fire ? (f ? COL.red : '#6b1610') : live ? '#3c4553' : '#1c2027';
      g.beginPath(); g.roundRect(k.x, k.y, k.w, k.h, 3 * s); g.fill(); g.strokeStyle = fire ? '#ff7a70' : '#3a414c'; g.lineWidth = 1 / this.dpr; g.stroke();
      this._txt(label, k.x + k.w / 2, k.y + k.h / 2 + 3.2 * s, 8.8 * s, fire || live || id === press ? '#fff' : '#c3cad3', 'center');
      return k;
    });
  }
}
