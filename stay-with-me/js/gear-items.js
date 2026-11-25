// One maker per piece of equipment that goes on (or next to) the patient. Each returns a Group built in the patient's
// own frame from the fitting tools gear.js hands over in K (snap / patch / sleeve / rope, the monitor's ports, the
// head frame). A maker may return null when the anchors it needs are missing: the caller copes.
//
// This file holds the shared toolbox and the monitoring leads; gear-items2.js has the airway, breathing and collar,
// gear-items3.js circulation, trauma and the small things put down by the bag.
//
// Where things are tuned: sizes are real ones in metres next to each part; colours follow the real coding
// (AHA lead colours, cannula hub colour by gauge, airway sizes, oxygen green, ISO syringe label colours).

import * as THREE from 'three';
import { airway } from './gear-items2.js';
import { circulation } from './gear-items3.js';
import { Builder, TR, V3, frame, rbox, box, cyl, plate, disc, tube, slab, roundRect, sheet, atlas, lit, C, txt, rr, circ, grime, HAND } from './gear-lib.js';

const H = Math.PI / 2, LAT = V3(1, 0, 0), UP = V3(0, 1, 0);
let LED_RED = null;
const lerpP = (a, b, t) => a.clone().lerp(b, t);

// ---------------------------------------------------------------- print

function padArt(which) {
  return (g, w0, h0) => { g.scale(w0 / 300, h0 / 405); const w = 300, h = 405;
    g.fillStyle = '#f3f2ec'; g.fillRect(0, 0, w, h); rr(g, 8, 8, w - 16, h - 16, 26, null, '#c9cdd2', 2);
    g.fillStyle = '#c62a1c'; g.fillRect(8, 8, w - 16, 44); txt(g, 'ADULT', w / 2, 31, 30, { c: '#fff', sp: 4, w: 800 });
    // torso with both sites; this pad's site is solid
    const cx = w / 2, cy = h * 0.47; g.strokeStyle = '#30343a'; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath(); g.ellipse(cx, cy - 92, 26, 31, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(cx - 16, cy - 62); g.lineTo(cx - 78, cy - 44); g.lineTo(cx - 96, cy + 70); g.moveTo(cx + 16, cy - 62); g.lineTo(cx + 78, cy - 44); g.lineTo(cx + 96, cy + 70); g.moveTo(cx - 58, cy - 20); g.lineTo(cx - 52, cy + 96); g.lineTo(cx + 52, cy + 96); g.lineTo(cx + 58, cy - 20); g.stroke();
    const site = (x, y, on) => { rr(g, x, y, 40, 52, 8, on ? '#c62a1c' : null, '#c62a1c', 3); };
    site(cx - 52, cy - 44, which === 'A'); site(cx + 20, cy + 14, which === 'B');
    txt(g, which === 'A' ? 'STERNUM' : 'APEX', w / 2, h * 0.79, 24, { c: '#1b1d20', w: 800, sp: 2 }); txt(g, which === 'A' ? 'right upper chest, below the collar bone' : 'left side, below the armpit', w / 2, h * 0.845, 12.5, { c: '#3a3d41', w: 600 });
    txt(g, '1 PEEL   2 PLACE   3 PRESS', w / 2, h * 0.9, 13, { c: '#c62a1c', sp: 1 }); txt(g, 'LOT 24F0917  EXP 2027-08  NOT FOR MRI', w / 2, h * 0.945, 9.5, { c: '#555', w: 600 });
    grime(g, w, h, which === 'A' ? 3 : 4, 0.5);
  };
}
function ecgArt(g, w) { g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, w, w); circ(g, w / 2, w / 2, w * 0.33, '#e3eef6', '#9fbdd3', 2); circ(g, w / 2, w / 2, w * 0.15, '#cfd3d6', '#8b9096', 1.5); txt(g, 'Ag/AgCl · ADULT', w / 2, w * 0.9, w * 0.085, { c: '#6b7a86', w: 600 }); }
function spo2Art(g, w, h) { g.fillStyle = '#e3e6e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a62b8'; g.fillRect(0, h * 0.72, w, h * 0.28); txt(g, 'SpO₂', w / 2, h * 0.3, h * 0.36, { c: '#1d2c44', w: 800 }); txt(g, 'ADULT > 40 kg', w / 2, h * 0.56, h * 0.13, { c: '#3a3d41', w: 600 }); txt(g, '☝', w / 2, h * 0.86, h * 0.2, { c: '#fff' }); }
function cuffArt(g, w, h) {      // white print on the cuff fabric, transparent ground
  txt(g, 'ADULT', w * 0.04, h * 0.2, h * 0.2, { al: 'left', w: 800, sp: 2 }); txt(g, '27 – 35 cm', w * 0.04, h * 0.42, h * 0.13, { al: 'left', w: 600 });
  g.fillStyle = '#fff'; g.fillRect(w * 0.04, h * 0.6, w * 0.62, h * 0.035); for (let i = 0; i <= 8; i++) g.fillRect(w * 0.04 + i * w * 0.0775 - 1, h * 0.56, 2.5, h * 0.11); txt(g, 'RANGE', w * 0.04, h * 0.8, h * 0.1, { al: 'left', w: 600, sp: 1 });
  txt(g, 'ARTERY', w * 0.84, h * 0.2, h * 0.13, { w: 800, sp: 1 }); g.beginPath(); g.moveTo(w * 0.8, h * 0.36); g.lineTo(w * 0.88, h * 0.36); g.lineTo(w * 0.84, h * 0.56); g.fill(); g.fillRect(w * 0.837, h * 0.56, w * 0.006, h * 0.4); txt(g, 'INDEX', w * 0.84, h * 0.9, h * 0.085, { w: 600, c: 'rgba(255,255,255,0)' });
}
function yokeArt(g, w, h) { g.fillStyle = '#2b2e33'; g.fillRect(0, 0, w, h); txt(g, 'ECG 4-LEAD', w / 2, h * 0.3, h * 0.2, { c: '#dfe3e6', sp: 1 }); const cs = ['#f2f2ee', '#16171a', '#2f8f4a', '#b3261c'], ns = ['RA', 'LA', 'RL', 'LL']; for (let i = 0; i < 4; i++) { circ(g, w * (0.14 + i * 0.24), h * 0.68, h * 0.11, cs[i], '#9aa0a6', 1); txt(g, ns[i], w * (0.14 + i * 0.24), h * 0.92, h * 0.11, { c: '#aeb5bb' }); } }

export function makers(K) {
  const { A, at, snap, patch, sleeve, rope, port, head, rides, attach, tangents } = K, AT = atlas();
  LED_RED = LED_RED || lit(0xff2412, 5);
  const headward = () => A.sternalNotch && A.xiphoid ? A.sternalNotch.pos.clone().sub(A.xiphoid.pos).normalize() : V3(0, 0, -1);
  const monSide = () => { try { return port('ecg').p.x >= (A.sternumCPR?.pos.x ?? 0) ? 1 : -1; } catch { return 1; } };
  // a round cable or tube through points
  const cord = (b, pts, r, c, o = {}) => b.add(tube(pts, r, o.rs || 6, Math.max(8, Math.round(pts.length * 2.2))), o.mat || 'hard', { c, r: o.rough ?? 0.5, a: o.a ?? 1, uv: [12, 1] });
  // the connector at the monitor end of a cable; returns where the cable enters it
  const plug = (b, name, c, round) => { const pt = port(name); b.push(frame(pt.p, pt.d));
    if (round) { b.add(cyl(0.0105, 0.0105, 0.024, 16), 'hard', { m: TR(0, 0, 0.01, H, 0, 0), c, r: 0.5, mt: name === 'nibp' ? 0.9 : 0 }); b.add(cyl(0.0045, 0.0085, 0.02, 12), 'hard', { m: TR(0, 0, 0.032, H, 0, 0), c: 0x34373b, r: 0.8 }); }
    else { b.add(rbox(0.026, 0.016, 0.026, 0.003), 'hard', { m: TR(0, 0, 0.012), c, r: 0.5 }); b.add(cyl(0.0035, 0.0065, 0.018, 10), 'hard', { m: TR(0, 0, 0.033, H, 0, 0), c: 0x34373b, r: 0.8 }); }
    b.pop(); return { p: pt.p.clone().addScaledVector(pt.d, 0.042), d: pt.d }; };
  const oxygenEnd = b => { const o = K.oxy, p = K.kitPt(o.group, o.outlet.p), d = K.kitDir(o.group, o.outlet.d); b.push(frame(p, d)); b.add(cyl(0.0042, 0.0048, 0.018, 10), 'hard', { m: TR(0, 0, -0.004, H, 0, 0), c: C.o2green, r: 0.5 }); b.pop(); return { p: p.addScaledVector(d, 0.006), d }; };
  // part of a sleeve as its own sheet: angle fractions a0..a1, width fractions t0..t1
  const arc = (s, a0, a1, t0, t1, lift, cols = 12, rows = 3) => { const grid = []; for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) grid.push(s.point(a0 + (a1 - a0) * k / (cols - 1), t0 + (t1 - t0) * r / (rows - 1), lift).p); return sheet(grid, rows, cols); };
  // a point beside the patient on the ground (or what they lie on), on the given side, level with an anchor
  const beside = (ref, side, out = 0.36, r = 0.012) => { const p = ref.clone(); p.x += side * out; for (let i = 0; i < 12 && K.sdf(p) < 0.05; i++) p.x += side * 0.03; p.y = K.floorAt(p) + r; return p; };
  const clock = t => { const m = (K.night() ? 2 * 60 + 12 : 14 * 60 + 26) + Math.floor((t || 0) / 60); return String(Math.floor(m / 60) % 24).padStart(2, '0') + String(m % 60).padStart(2, '0'); };
  const tapeLabel = (key, text, w = 220, h = 56) => AT.dyn('tape' + w, 8, key, w, h, (g, ww, hh) => { g.fillStyle = '#efeadb'; g.fillRect(0, 0, ww, hh); for (let i = 0; i < ww; i += 2) { g.fillStyle = 'rgba(120,110,90,0.07)'; g.fillRect(i, 0, 1, hh); } txt(g, text, ww / 2, hh / 2 + 2, hh * 0.62, { c: '#17181d', f: HAND, rot: -0.025 }); });

  const make = {
    // ------------------------------------------------------------ monitoring
    spo2() {
      const f = A.fingerL, hnd = A.handL; if (!f && !hnd) return null;
      const d = f ? f.normal.clone().normalize() : tangents(hnd.normal, V3(0, 0, 1)).v, up = (hnd ? hnd.normal.clone() : UP.clone()); up.addScaledVector(d, -up.dot(d)); if (up.lengthSq() < 1e-6) up.set(0, 1, 0); up.normalize();
      const c = f ? f.pos.clone().addScaledVector(d, -0.019) : hnd.pos.clone().addScaledVector(hnd.normal, 0.012), b = new Builder(), F = frame(c, d, up);
      b.push(F);
      for (const s of [1, -1]) { b.add(rbox(0.022, 0.0075, 0.052, 0.0034, 3), 'hard', { m: TR(0, s * 0.0112, -0.003), c: 0xdfe2e4, r: 0.42 }); b.add(rbox(0.018, 0.0034, 0.034, 0.0015), 'fuzz', { m: TR(0, s * 0.0068, 0.004), c: 0x7d848b, r: 0.9, s: 2 });
        b.add(rbox(0.02, 0.0045, 0.02, 0.002), 'hard', { m: TR(0, s * 0.0155, -0.037, s * 0.42, 0, 0), c: 0x4b5158, r: 0.6 }); }
      b.add(rbox(0.0225, 0.021, 0.011, 0.004), 'hard', { m: TR(0, 0, -0.029), c: 0x4b5158, r: 0.6 }); b.add(cyl(0.0024, 0.0024, 0.0245, 10), 'hard', { m: TR(0, 0, -0.029, 0, 0, H), c: C.steel, r: 0.25, mt: 1 });
      b.add(plate(0.017, 0.026), 'label', { m: TR(0, 0.0151, 0.004, -H, 0, 0), uv: { rect: AT.add('spo2', 102, 156, spo2Art) }, r: 0.45 });
      b.add(cyl(0.0021, 0.0034, 0.014, 8), 'hard', { m: TR(0, 0.0112, -0.036, -H, 0, 0), c: 0x6c7379, r: 0.7 });
      b.pop();
      const start = V3(0, 0.0112, -0.044).applyMatrix4(F), end = plug(b, 'spo2', C.blue, false);
      cord(b, rope(start, end.p, { r: 0.0017, da: d.clone().negate(), db: end.d, slack: 1.25 }), 0.0017, 0x8b939c);
      const g = b.build(), led = new THREE.Mesh(box(0.008, 0.0025, 0.008), LED_RED); led.position.copy(V3(0, 0.0052, 0.008).applyMatrix4(F)); led.quaternion.setFromRotationMatrix(F); g.add(led); return g;
    },
    ecg() {
      const b = new Builder(), side = monSide(), sup = K.supine, hw = headward();
      // the yoke where the four leads join the trunk cable: on the belly when lying, in the lap when sitting
      let yk = null; const ep = A.xiphoid, um = A.umbilicus, th = A['thigh' + (side > 0 ? 'L' : 'R')];
      if (sup && ep && um) yk = snap(lerpP(ep.pos, um.pos, 0.55).addScaledVector(LAT, side * 0.07), um.normal, 0.0075); else if (th) yk = { p: th.pos.clone().addScaledVector(th.normal, 0.0075), n: th.normal.clone() };
      const end = plug(b, 'ecg', C.green, true), toMon = end.p.clone().sub(yk ? yk.p : end.p);
      let YF = null; if (yk) { const t = tangents(yk.n, toMon.lengthSq() > 1e-6 ? toMon : LAT); YF = new THREE.Matrix4().makeBasis(t.u, t.v, yk.n).setPosition(yk.p);
        b.push(YF); b.add(rbox(0.032, 0.052, 0.013, 0.005, 3), 'hard', { c: 0x2c2f33, r: 0.6 }); b.add(plate(0.027, 0.04), 'label', { m: TR(0, 0.002, 0.0067), uv: { rect: AT.add('yoke', 108, 160, (g, w, h) => { g.save(); g.translate(0, h); g.rotate(-H); yokeArt(g, h, w); g.restore(); }) }, r: 0.55 });
        b.add(cyl(0.0032, 0.0052, 0.016, 10), 'hard', { m: TR(0, 0.033, 0), c: 0x3b3e42, r: 0.8 }); b.pop(); }
      [['deltoidR', 0xf2f2ee], ['deltoidL', 0x16171a], ['pelvisR', 0x2f8f4a], ['pelvisL', 0xb3261c]].forEach(([n, col], i) => {
        const a = at(n, 0.0008); if (!a) return;
        const toY = yk ? yk.p.clone().sub(a.p) : hw.clone().negate(), t = tangents(a.n, toY), F = new THREE.Matrix4().makeBasis(t.u, t.v, a.n).setPosition(a.p);
        b.push(F);
        b.add(slab(roundRect(0.04, 0.04, 0.011, 4), 0.0018, 0.0004), 'fuzz', { m: TR(0, 0, 0.0009), c: 0xf1f0ea, r: 0.85, s: 2 }); b.add(slab(roundRect(0.014, 0.012, 0.004, 3), 0.0012, 0.0003), 'fuzz', { m: TR(0.021, -0.012, 0.0007), c: 0xf1f0ea, r: 0.85 });
        b.add(disc(0.0185, 20), 'label', { m: TR(0, 0, 0.002), uv: { rect: AT.add('ecgPad', 96, 96, ecgArt) }, r: 0.6 });
        b.add(cyl(0.0042, 0.0048, 0.0035, 12), 'hard', { m: TR(0, 0, 0.0036, H, 0, 0), c: C.steel, r: 0.25, mt: 1 });
        // the snap-on lead clip in its AHA colour
        b.add(rbox(0.0135, 0.021, 0.0062, 0.0024, 3), 'hard', { m: TR(0, 0.004, 0.0072), c: col, r: 0.45 }); b.add(cyl(0.0052, 0.0052, 0.0066, 12), 'hard', { m: TR(0, 0, 0.0074, H, 0, 0), c: col, r: 0.45 });
        b.add(cyl(0.0014, 0.0026, 0.01, 8), 'hard', { m: TR(0, 0.019, 0.0072), c: 0x9aa0a6, r: 0.7 });
        b.pop();
        const s = V3(0, 0.024, 0.0072).applyMatrix4(F);
        if (YF) { const e = V3(-0.0105 + i * 0.007, -0.027, 0.001).applyMatrix4(YF), dy = V3(0, -1, 0).transformDirection(YF); cord(b, rope(s, e, { r: 0.0011, da: t.v, db: dy, slack: 1.1, it: 45, side: i % 2 ? 1 : -1 }), 0.0012, 0x5a5f65, { rs: 5 }); }
      });
      if (YF) { const s = V3(0, 0.042, 0).applyMatrix4(YF); cord(b, rope(s, end.p, { r: 0.0026, da: V3(0, 1, 0).transformDirection(YF), db: end.d, slack: 1.2 }), 0.0026, 0x3a3d41); }
      return b.build();
    },
    pads() {
      const g = new THREE.Group(), b = new Builder(), side = monSide(), hw = headward();
      const ref = (A.sternumCPR || A.xiphoid || A.ics2R || A.ics5L)?.pos; if (!ref) return null;
      const cn = beside(ref.clone().addScaledVector(hw, -0.12), side, 0.4), end = plug(b, 'therapy', 0x8d9298, true);
      // the pad cable's connector, lying beside the patient, with the therapy cable on to the monitor
      const dirM = end.p.clone().sub(cn).setY(0).normalize(), CF = frame(cn, dirM, UP);
      b.push(CF); b.add(rbox(0.03, 0.018, 0.058, 0.006, 3), 'hard', { c: 0x8d9298, r: 0.55 }); b.add(rbox(0.031, 0.019, 0.008, 0.003), 'hard', { m: TR(0, 0, -0.012), c: C.orange, r: 0.55 }); b.add(cyl(0.0048, 0.0075, 0.018, 10), 'hard', { m: TR(0, 0, 0.037, H, 0, 0), c: 0x4a4e54, r: 0.8 }); b.pop();
      cord(b, rope(V3(0, 0, 0.046).applyMatrix4(CF), end.p, { r: 0.0042, da: dirM, db: end.d, slack: 1.18 }), 0.0042, 0x4a4e54, { rs: 7 });
      [['ics2R', 'A'], ['ics5L', 'B']].forEach(([n, art], i) => {
        const a = at(n); if (!a) return;
        const pb = new Builder(), P = patch(a.p, a.n, hw, 0.1, 0.135, { lift: 0.0026, cols: 9, rows: 11, corner: 0.024 });
        pb.add(P.geo(0.0026), 'label', { uv: { rect: AT.add('pad' + art, 260, 351, padArt(art)) }, r: 0.72 });
        // moulded lead exit at the edge nearest the connector, and the lead itself
        const towardC = cn.clone().sub(a.p), ex = Math.abs(towardC.dot(P.u)) > Math.abs(towardC.dot(P.v)) ? { d: P.u.clone().multiplyScalar(Math.sign(towardC.dot(P.u))), half: 0.05 } : { d: P.v.clone().multiplyScalar(Math.sign(towardC.dot(P.v))), half: 0.0675 };
        const e = snap(a.p.clone().addScaledVector(ex.d, ex.half - 0.012), a.n, 0.0052), EF = frame(e.p, ex.d.clone().addScaledVector(e.n, -ex.d.dot(e.n)).normalize(), e.n);
        pb.push(EF); pb.add(rbox(0.02, 0.0055, 0.024, 0.0024, 3), 'hard', { c: 0xe4e4df, r: 0.5 }); pb.add(cyl(0.0022, 0.0036, 0.012, 8), 'hard', { m: TR(0, 0, 0.017, H, 0, 0), c: 0xbfc3c6, r: 0.7 }); pb.pop();
        g.add(rides(pb.build(), a.p, a.n));
        cord(b, rope(V3(0, 0, 0.022).applyMatrix4(EF), V3((i ? 0.008 : -0.008), 0, -0.03).applyMatrix4(CF), { r: 0.002, da: V3(0, 0, 1).transformDirection(EF), db: dirM.clone().negate(), slack: 1.14, side: i ? 1 : -1 }), 0.002, 0xdcdcd6);
      });
      b.build({ into: g }); return g;
    },
    cuff() {
      const d = A.deltoidL, e = A.acfL; if (!d || !e) return null;
      const rg = 0.045, s = sleeve(d.pos.clone().addScaledVector(d.normal, -rg), e.pos.clone().addScaledVector(e.normal, -rg), { at: 0.56, w: 0.128, off: 0.0045, r: rg, rows: 4, n: 30, spread: 1.25 }), b = new Builder();
      b.add(s.geo(0.0045), 'fabric', { c: C.navy, r: 0.88, uv: [s.circ * 4, 0.128 * 4] });
      const aA = s.angleOf(e.normal);
      b.add(arc(s, aA + 0.2, aA + 0.52, 0.02, 0.98, 0.0022, 12, 3), 'fuzz', { c: 0x16212f, r: 0.95, uv: [1.2, 1.4] });            // overlapping hook-and-loop flap
      b.add(arc(s, aA + 0.2, aA + 0.215, 0, 1, 0.003, 3, 3), 'fabric', { c: 0x0f1620, r: 0.9 });
      b.add(arc(s, aA - 0.2, aA + 0.14, 0.1, 0.9, 0.0012, 12, 3), 'decal', { uv: { rect: AT.add('cuffPrint', 330, 190, cuffArt) }, r: 0.75 });
      // hose out of the cuff toward the elbow
      const hp = s.point(aA - 0.12, 0.96, 0.005), HF = frame(hp.p, s.axis, hp.n);
      b.push(HF); b.add(rbox(0.016, 0.006, 0.02, 0.002), 'hard', { c: 0x2f3236, r: 0.7 }); b.add(cyl(0.0034, 0.0046, 0.014, 10), 'hard', { m: TR(0, 0.001, 0.016, H, 0, 0), c: 0x2f3236, r: 0.7 }); b.pop();
      const end = plug(b, 'nibp', 0xb9bdc2, true);
      cord(b, rope(V3(0, 0.001, 0.024).applyMatrix4(HF), end.p, { r: 0.0035, da: s.axis, db: end.d, slack: 1.2 }), 0.0035, 0x2b2e32, { rs: 7, rough: 0.6 });
      return b.build();
    },
    cap() {
      const n = A.nose; if (!n) return null;
      const b = new Builder(), side = monSide(), Hd = head, fwd = Hd ? Hd.fwd : n.normal, up = Hd ? Hd.up : V3(0, 0, -1), lat = Hd ? Hd.lat : LAT;
      const c = n.pos.clone().addScaledVector(up, -0.013).addScaledVector(fwd, -0.004), F = new THREE.Matrix4().makeBasis(lat, up, fwd).setPosition(c);
      b.push(F); b.add(rbox(0.024, 0.0055, 0.0055, 0.0022), 'tubing', { c: 0xfff1b8, a: 0.5, r: 0.15 });
      for (const s of [-1, 1]) b.add(cyl(0.0018, 0.0022, 0.008, 8), 'tubing', { m: TR(s * 0.0065, 0.005, -0.001), c: 0xfff1b8, a: 0.5, r: 0.15 });
      b.add(rbox(0.014, 0.012, 0.002, 0.001), 'tubing', { m: TR(0, -0.008, 0.002, 0.5, 0, 0), c: 0xfff1b8, a: 0.4, r: 0.15 }); b.pop();
      const pts = [c.clone().addScaledVector(lat, side * 0.012)]; const ear = A[side > 0 ? 'earL' : 'earR'];
      if (Hd && ear) { pts.push(Hd.radial(c.clone().addScaledVector(lat, side * 0.04), 0.002).p, Hd.radial(lerpP(c, ear.pos, 0.65).addScaledVector(up, 0.012), 0.002).p, ear.pos.clone().addScaledVector(lat, -side * 0.01).addScaledVector(up, 0.03), ear.pos.clone().addScaledVector(lat, -side * 0.008).addScaledVector(fwd, -0.022).addScaledVector(up, 0.004), ear.pos.clone().addScaledVector(fwd, -0.018).addScaledVector(up, -0.035)); cord(b, pts.map((q, i) => i && i < 3 ? q : q), 0.0013, 0xf5e6a0, { mat: 'tubing', a: 0.5, rough: 0.4 }); }
      const end = plug(b, 'co2', 0xe3b81f, false), last = pts[pts.length - 1];
      cord(b, rope(last, end.p, { r: 0.0013, db: end.d, slack: 1.25 }), 0.0013, 0xf5e6a0, { mat: 'tubing', a: 0.5, rough: 0.4, rs: 5 });
      return b.build();
    },
  };
  const bloodRect = (seed = 1, soak = false) => AT.add('blood' + seed + (soak ? 's' : ''), 128, 128, bloodArt(seed, soak));
  const T = { cord, plug, oxygenEnd, arc, beside, clock, tapeLabel, headward, monSide, blood: bloodRect };
  return Object.assign(make, airway(K, T), circulation(K, T));
}
function bloodArt(seed, soak) {
  return (g, w) => { const c = w / 2; for (let i = 0; i < 26; i++) { const a = i * 2.399 + seed, r = w * (0.02 + 0.3 * ((i * 37 + seed * 11) % 17) / 17) * (soak ? 0.8 : 1), s = w * (0.05 + 0.16 * ((i * 13 + seed * 5) % 11) / 11), x = c + Math.cos(a) * r, y = c + Math.sin(a) * r; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, soak ? 'rgba(120,8,10,0.75)' : 'rgba(110,6,8,0.8)'); gr.addColorStop(0.6, soak ? 'rgba(140,14,14,0.45)' : 'rgba(120,10,10,0.5)'); gr.addColorStop(1, 'rgba(120,10,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); } };
}
