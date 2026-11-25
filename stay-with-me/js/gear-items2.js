// Airway and breathing equipment, and the cervical collar: everything worn on the face and neck.
// airway(K, T) returns makers that gear-items.js merges into its own; T is its shared toolbox (cord, plug, ...).
// Sizes in metres; colours follow the real coding (airway sizes, oxygen green).

import * as THREE from 'three';
import { Builder, TR, V3, frame, rbox, box, cyl, sph, torus, plate, disc, lathe, tube, slab, roundRect, ellipse, ribbon, sheet, atlas, C, txt } from './gear-lib.js';

const H = Math.PI / 2, LAT = V3(1, 0, 0), UP = V3(0, 1, 0);
const smooth = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const lerpP = (a, b, t) => a.clone().lerp(b, t);
const O2TINT = 0xc9f0da;

function collarArt(g, w, h) {   // dark print on the shell, transparent ground
  txt(g, 'ADULT', 6, h * 0.24, h * 0.3, { al: 'left', c: '#1b2a44', w: 800, sp: 2 }); txt(g, 'REGULAR', 6, h * 0.58, h * 0.2, { al: 'left', c: '#1b2a44', w: 700, sp: 1 });
  g.fillStyle = '#1b2a44'; for (let i = 0; i < 4; i++) { g.fillRect(w * 0.52 + i * w * 0.115, h * 0.14, w * 0.085, h * 0.2); } g.fillStyle = '#e9e7df'; g.fillRect(w * 0.52 + 2 * w * 0.115 + 3, h * 0.17, w * 0.085 - 6, h * 0.14);
  txt(g, 'NO-NECK  SHORT  REG  TALL', w * 0.52, h * 0.52, h * 0.1, { al: 'left', c: '#1b2a44', w: 700 }); txt(g, 'LATEX FREE · SINGLE PATIENT USE', 6, h * 0.86, h * 0.1, { al: 'left', c: '#1b2a44', w: 600 });
}

export function airway(K, T) {
  const { A, at, snap, sleeve, rope, head, rides, attach } = K, { cord, plug, oxygenEnd, monSide } = T, AT = atlas();
  const fwdOf = () => head ? head.fwd : (A.mouth || A.nose).normal, upOf = () => head ? head.up : V3(0, 0, -1), latOf = () => head ? head.lat : LAT;
  const o2Tube = (b, start, da, o = {}) => { const e = oxygenEnd(b); cord(b, rope(start, e.p, { r: 0.0027, da, db: e.d, slack: o.slack ?? 1.22, side: o.side }), 0.0027, O2TINT, { mat: 'tubing', a: 0.42, rough: 0.12, rs: 7 }); };

  // a soft mask shell from a rim snapped onto the face to a hub in front of the nose
  const shell = o => {
    const fwd = fwdOf(), up = upOf(), lat = latOf(), n = o.cols || 22, rows = o.rows || 6, c = lerpP(o.top, o.bottom, 0.5), hh = o.top.distanceTo(o.bottom) / 2, rim = [], hub = [], grid = [];
    for (let k = 0; k < n; k++) { const phi = k / n * Math.PI * 2, y = Math.cos(phi) * hh, hw = o.wMouth + (o.wBridge - o.wMouth) * smooth((y / hh + 0.35) / 1.2);
      rim.push(snap(c.clone().addScaledVector(lat, Math.sin(phi) * hw).addScaledVector(up, y), fwd, o.lift ?? 0.003, 0.07).p); hub.push(o.hub.clone().addScaledVector(lat, Math.sin(phi) * o.hubR).addScaledVector(up, Math.cos(phi) * o.hubR)); }
    for (let r = 0; r < rows; r++) { const t = r / (rows - 1), e = Math.pow(t, 0.8); for (let k = 0; k <= n; k++) grid.push(lerpP(rim[k % n], hub[k % n], e).addScaledVector(fwd, (o.bulge ?? 0.012) * Math.sin(Math.PI * t))); }
    return { rim, hub, grid, rows, cols: n + 1, n, at: (k, r) => grid[r * (n + 1) + ((k % n) + n) % n], geo: () => sheet(grid, rows, n + 1) };
  };
  // elastic round the head from the sides of a mask
  const headStrap = (b, from, c, w, col) => { if (!head) return; for (const s of [-1, 1]) { const ear = A[s > 0 ? 'earL' : 'earR']; if (!ear) continue; const P = [{ p: from[s > 0 ? 0 : 1], n: head.lat.clone().multiplyScalar(s) }];
      for (const q of [ear.pos.clone().addScaledVector(head.up, -0.03).addScaledVector(head.fwd, 0.03), ear.pos.clone().addScaledVector(head.up, -0.028).addScaledVector(head.fwd, -0.035).addScaledVector(head.lat, -s * 0.01), head.c.clone().addScaledVector(head.fwd, -0.09).addScaledVector(head.lat, s * 0.06).addScaledVector(head.up, -0.01)]) { const r = head.radial(q, 0.0025); if (r.p.y < K.floorAt(r.p) + 0.003) r.p.y = K.floorAt(r.p) + 0.003; P.push(r); }
      const pts = new THREE.CatmullRomCurve3(P.map(q => q.p)).getSpacedPoints(18).map((q, i) => { if (i < 1) return q; const r = head.radial(q, 0.0035).p; if (r.y < K.floorAt(r) + 0.003) r.y = K.floorAt(r) + 0.003; return r; }), nors = pts.map(q => q.clone().sub(head.c).normalize()); b.add(ribbon(pts, nors, w, 0.0012), 'fuzz', { c: col, r: 0.9, s: 3 }); } };

  return {
    opa() {
      const m = A.mouth; if (!m) return null; const b = new Builder(), fwd = fwdOf(), up = upOf();
      b.push(frame(m.pos.clone().addScaledVector(fwd, 0.0045), fwd, up));
      b.add(slab(ellipse(0.0175, 0.0098, 22), 0.0032, 0.0009, [ellipse(0.0072, 0.0036, 14)]), 'hard', { c: 0xf0efe8, r: 0.38 });
      b.add(slab(ellipse(0.0108, 0.0066, 18), 0.018, 0.0008, [ellipse(0.0072, 0.0036, 14)]), 'hard', { m: TR(0, 0, -0.0095), c: C.green, r: 0.42 });
      b.add(plate(0.013, 0.0065), 'hard', { m: TR(0, 0, -0.012), c: 0x050505, r: 1 });
      b.pop(); return b.build();
    },
    npa() {
      const n = A.nose; if (!n) return null; const b = new Builder(), fwd = fwdOf(), up = upOf(), lat = latOf();
      const o = up.clone().multiplyScalar(-0.78).addScaledVector(fwd, 0.62).normalize(), p = n.pos.clone().addScaledVector(lat, -0.0088).addScaledVector(up, -0.0125).addScaledVector(fwd, -0.0065).addScaledVector(o, 0.003);
      b.push(frame(p, o, fwd)); b.push(TR(0, 0, 0, H, 0, 0));
      b.add(lathe([[0.0027, -0.012], [0.0038, -0.012], [0.0039, 0.0005], [0.0052, 0.0032], [0.0082, 0.0052], [0.0088, 0.006], [0.0084, 0.0068], [0.0055, 0.0064], [0.0029, 0.0045], [0.0027, -0.012]], 18), 'hard', { c: 0x5fa89a, r: 0.42 });
      b.pop(); b.pop(); return b.build();
    },
    igel() {
      const m = A.mouth; if (!m) return null; const b = new Builder(), fwd = fwdOf(), up = upOf(), ax = fwd.clone().addScaledVector(up, -0.22).normalize(), w = (K.human.spec?.bmi || 24) * (K.human.spec?.heightM || 1.75) ** 2, size = w > 92 ? [C.orange, '5'] : w < 50 ? [C.yellow, '3'] : [C.green, '4'];
      const F = frame(m.pos.clone().addScaledVector(fwd, -0.006), ax, up); b.push(F);
      // bite block / buccal stabiliser, the coloured size band with its strap hook, the 15 mm connector
      b.add(slab(ellipse(0.0135, 0.0092, 20), 0.046, 0.0012, [ellipse(0.0066, 0.0055, 12)]), 'tubing', { m: TR(0, 0, 0.014), c: 0xf3f1e8, a: 0.82, r: 0.3 });
      b.add(slab(ellipse(0.0152, 0.0108, 20), 0.007, 0.001, [ellipse(0.012, 0.008, 14)]), 'hard', { m: TR(0, 0, 0.031), c: size[0], r: 0.45 });
      for (const s of [-1, 1]) b.add(torus(0.0034, 0.0011, 10, 5), 'hard', { m: TR(s * 0.0178, 0, 0.031, H, 0, 0), c: size[0], r: 0.45 });
      b.add(cyl(0.011, 0.0118, 0.0035, 20), 'hard', { m: TR(0, 0, 0.039, H, 0, 0), c: 0xecebe4, r: 0.4 }); b.add(cyl(0.0075, 0.0078, 0.02, 18), 'hard', { m: TR(0, 0, 0.05, H, 0, 0), c: 0xecebe4, r: 0.38 });
      b.add(disc(0.0058, 14), 'hard', { m: TR(0, 0, 0.0602), c: 0x070707, r: 1 }); b.add(cyl(0.0016, 0.0016, 0.004, 8), 'hard', { m: TR(0.0118, -0.003, 0.03, 0, 0, H), c: 0x111111, r: 1 });
      b.pop();
      // support strap from the hooks across the cheeks
      if (head) for (const s of [-1, 1]) { const a0 = V3(s * 0.0185, 0, 0.031).applyMatrix4(F), ear = A[s > 0 ? 'earL' : 'earR']; if (!ear) continue; const P = [a0, head.radial(m.pos.clone().addScaledVector(head.lat, s * 0.045).addScaledVector(up, -0.004), 0.0022).p, head.radial(lerpP(m.pos, ear.pos, 0.7).addScaledVector(up, -0.03), 0.0022).p, head.radial(ear.pos.clone().addScaledVector(up, -0.05).addScaledVector(fwd, -0.03), 0.0022).p];
        for (const q of P) if (q.y < K.floorAt(q) + 0.003) q.y = K.floorAt(q) + 0.003;
        const pts = new THREE.CatmullRomCurve3(P).getSpacedPoints(16).map((q, i) => { if (i < 1) return q; const r = head.radial(q, 0.0035).p; if (r.y < K.floorAt(r) + 0.003) r.y = K.floorAt(r) + 0.003; return r; }); b.add(ribbon(pts, pts.map(q => q.clone().sub(head.c).normalize()), 0.012, 0.0013), 'fuzz', { c: 0xe9e6da, r: 0.9, s: 3 }); }
      attach.igel = { p: V3(0, 0, 0.0605).applyMatrix4(F), d: ax }; return b.build();
    },
    cric() {
      const a = at('neckFront'); if (!a) return null; const b = new Builder(), hw = T.headward(), F = frame(a.p, a.n, hw);
      // a smear of blood round the stoma, the flange on its tie, the tube and connector, the pilot balloon
      const pch = K.patch(a.p, a.n, hw, 0.05, 0.045, { lift: 0.0009, cols: 5, rows: 5 }); b.add(pch.geo(), 'decal', { uv: { rect: T.blood() }, r: 0.35 });
      b.push(F);
      b.add(slab(roundRect(0.056, 0.017, 0.007, 4), 0.0022, 0.0006), 'hard', { m: TR(0, 0, 0.0035), c: 0xeceae2, r: 0.5 });
      b.add(cyl(0.0058, 0.0062, 0.012, 14), 'tubing', { m: TR(0, 0, 0.009, H, 0, 0), c: 0xe9f1f4, a: 0.6, r: 0.15 }); b.add(cyl(0.0105, 0.011, 0.003, 18), 'hard', { m: TR(0, 0, 0.016, H, 0, 0), c: 0x2f6bbf, r: 0.4 }); b.add(cyl(0.0075, 0.0078, 0.018, 16), 'hard', { m: TR(0, 0, 0.0265, H, 0, 0), c: 0x2f6bbf, r: 0.4 });
      b.add(disc(0.0058, 14), 'hard', { m: TR(0, 0, 0.0357), c: 0x070707, r: 1 });
      b.pop();
      const s = sleeve(a.p.clone().addScaledVector(a.n, -0.055).addScaledVector(hw, -0.01), a.p.clone().addScaledVector(a.n, -0.055).addScaledVector(hw, 0.01), { at: 0.5, w: 0.011, rows: 2, n: 28, r: 0.058, off: 0.0025, spread: 1.25 });
      const a0 = s.angleOf(a.n); b.add(T.arc(s, a0 + 0.085, a0 + 0.915, 0, 1, 0, 26, 2), 'gauze', { c: 0xf1eee4, r: 0.9 });
      const side = monSide(), ps = V3(side * 0.004, 0, 0.012).applyMatrix4(F), pe = snap(a.p.clone().addScaledVector(LAT, side * 0.05).addScaledVector(hw, -0.05), a.n, 0.006, 0.08);
      cord(b, rope(ps, pe.p, { r: 0.0009, slack: 1.15, it: 40 }), 0.0009, 0xe6eef2, { mat: 'tubing', a: 0.6, rs: 5 });
      b.add(sph(0.0065, 10, 8), 'tubing', { m: TR(pe.p.x, pe.p.y, pe.p.z, 0, 0, 0, 1.5, 0.75, 1), c: 0x5b9bd8, a: 0.6, r: 0.2 });
      attach.cric = { p: V3(0, 0, 0.036).applyMatrix4(F), d: a.n.clone() }; return b.build();
    },
    nc() {
      const n = A.nose, b = new Builder(); if (!n) return null;
      if (!head || !A.chin) { b.add(torus(0.075, 0.0025, 30, 6, Math.PI * 1.1), 'tubing', { m: frame(n.pos.clone().addScaledVector(n.normal, -0.05), n.normal).multiply(TR(0, 0, 0, H, 0, 0)), c: O2TINT, a: 0.45, r: 0.12 }); return b.build(); }
      const { fwd, up, lat } = head, ch = A.chin.pos, c = n.pos.clone().addScaledVector(up, -0.0135).addScaledVector(fwd, -0.005), F = new THREE.Matrix4().makeBasis(lat, up, fwd).setPosition(c);
      b.push(F); b.add(rbox(0.03, 0.0062, 0.0062, 0.0028), 'tubing', { c: O2TINT, a: 0.5, r: 0.12 }); for (const s of [-1, 1]) b.add(cyl(0.0019, 0.0026, 0.009, 8), 'tubing', { m: TR(s * 0.007, 0.006, -0.0012, -0.25, 0, 0), c: O2TINT, a: 0.5, r: 0.12 }); b.pop();
      const bolo = ch.clone().addScaledVector(up, -0.055).addScaledVector(fwd, -0.03);
      for (const s of [-1, 1]) { const ear = A[s > 0 ? 'earL' : 'earR'].pos;
        const P = [c.clone().addScaledVector(lat, s * 0.014), head.radial(c.clone().addScaledVector(lat, s * 0.04).addScaledVector(up, 0.002), 0.003).p, head.radial(lerpP(c, ear, 0.62).addScaledVector(up, 0.014), 0.003).p, ear.clone().addScaledVector(lat, -s * 0.011).addScaledVector(up, 0.031).addScaledVector(fwd, 0.004), ear.clone().addScaledVector(lat, -s * 0.009).addScaledVector(fwd, -0.024).addScaledVector(up, 0.006), ear.clone().addScaledVector(lat, -s * 0.004).addScaledVector(fwd, -0.014).addScaledVector(up, -0.04), ch.clone().addScaledVector(lat, s * 0.03).addScaledVector(up, -0.03).addScaledVector(fwd, -0.03), bolo.clone().addScaledVector(lat, s * 0.002)];
        for (const q of P) if (q.y < K.floorAt(q) + 0.004) q.y = K.floorAt(q) + 0.004;
        cord(b, P, 0.0021, O2TINT, { mat: 'tubing', a: 0.45, rough: 0.12, rs: 6 }); }
      b.add(rbox(0.008, 0.008, 0.008, 0.002), 'tubing', { m: TR(bolo.x, bolo.y, bolo.z), c: O2TINT, a: 0.7, r: 0.15 });
      o2Tube(b, bolo, up.clone().negate(), { slack: 1.2 }); return b.build();
    },
    // non-rebreather mask with its reservoir, or (neb) the same mask on a nebuliser chamber
    nrb(neb) {
      const n = A.nose, m = A.mouth; if (!n || !m) return null; const g = new THREE.Group(), b = new Builder(), fwd = fwdOf(), up = upOf(), lat = latOf(), side = monSide();
      const top = n.pos.clone().addScaledVector(up, 0.036), bot = A.chin ? lerpP(m.pos, A.chin.pos, 0.85) : m.pos.clone().addScaledVector(up, -0.03), hubC = n.pos.clone().addScaledVector(fwd, 0.024).addScaledVector(up, -0.024);
      const S = shell({ top, bottom: bot, wMouth: 0.041, wBridge: 0.015, hub: hubC, hubR: 0.0125, bulge: 0.012 });
      b.add(S.geo(), 'clear', { c: 0xe9f6f1, a: 0.13, r: 0.14 }); b.add(tube(S.rim, 0.0019, 5, S.n * 2, true), 'tubing', { c: 0xe9f6f1, a: 0.38, r: 0.15 });
      // malleable nose strip, side exhalation valves, elastic
      { const pts = [-2, -1, 0, 1, 2].map(i => S.at(i, 1).clone().addScaledVector(fwd, 0.0012)); b.add(ribbon(pts, fwd, 0.007, 0.0008), 'hard', { c: C.alu, r: 0.35, mt: 0.9 }); }
      for (const s of [-1, 1]) { const k = Math.round(S.n * (s > 0 ? 0.27 : 0.73)), p = S.at(k, 3), nn = p.clone().sub(lerpP(top, bot, 0.5)).addScaledVector(fwd, 0.02).normalize(); b.push(frame(p, nn, up)); b.add(torus(0.0105, 0.0016, 16, 5), 'tubing', { c: 0xe9f6f1, a: 0.6, r: 0.15 }); b.add(disc(0.0098, 16), 'hard', { m: TR(0, 0, 0.0012), c: 0xf1f0ea, r: 0.5 }); for (let i = 0; i < 5; i++) b.add(disc(0.0013, 6), 'hard', { m: TR(Math.cos(i * 1.257) * 0.0055, Math.sin(i * 1.257) * 0.0055, 0.0015), c: 0x9aa0a6, r: 0.6 }); b.pop(); }
      headStrap(b, [S.at(Math.round(S.n * 0.25), 0), S.at(Math.round(S.n * 0.75), 0)], hubC, 0.006, 0xe7efe9);
      // hub and valve body
      const HF = frame(hubC, fwd, up); b.push(HF);
      b.add(cyl(0.0125, 0.013, 0.014, 18, true), 'tubing', { m: TR(0, 0, 0.004, H, 0, 0), c: 0xe9f6f1, a: 0.4, r: 0.12 });
      b.add(cyl(0.0112, 0.0112, 0.04, 18), 'tubing', { m: TR(0, -0.014, 0.012), c: 0xe9f6f1, a: 0.32, r: 0.12 }); b.add(cyl(0.0098, 0.0098, 0.0025, 16), 'hard', { m: TR(0, -0.02, 0.012), c: neb ? 0xe9e9e4 : C.orange, r: 0.5 });
      b.add(cyl(0.0032, 0.0038, 0.014, 10), 'hard', { m: TR(side * 0.016, -0.026, 0.012, 0, 0, H), c: C.o2green, r: 0.5 });
      b.pop();
      const neck = V3(0, -0.036, 0.012).applyMatrix4(HF), nip = V3(side * 0.024, -0.026, 0.012).applyMatrix4(HF);
      if (neb) { // nebuliser chamber on the mask's port, oxygen into its base
        const d = up.clone().negate().addScaledVector(fwd, 0.25).normalize(), NF = frame(neck, d, fwd); b.push(NF); b.push(TR(0, 0, 0, H, 0, 0));
        b.add(lathe([[0.009, 0], [0.011, 0.004], [0.0215, 0.012], [0.0225, 0.03], [0.021, 0.046], [0.008, 0.058], [0.004, 0.062]], 18), 'clear', { c: 0xeef6f8, a: 0.2, r: 0.1 });
        b.add(lathe([[0.019, 0.034], [0.0195, 0.045], [0.0075, 0.057], [0, 0.057]], 16), 'tubing', { c: 0xd3e6ee, a: 0.5, r: 0.08 }); b.add(cyl(0.0232, 0.0232, 0.006, 20), 'hard', { m: TR(0, 0.013, 0), c: 0xe9ecec, r: 0.45 }); b.add(cyl(0.0034, 0.0042, 0.012, 10), 'hard', { m: TR(0, 0.067, 0), c: C.o2green, r: 0.5 });
        b.pop(); b.pop(); o2Tube(b, V3(0, 0, 0.074).applyMatrix4(NF), d);
      } else {
        o2Tube(b, nip, lat.clone().multiplyScalar(side));
        // reservoir bag lying on the upper chest (it rides the chest wall)
        const sn = A.sternalNotch, st = A.sternumCPR;
        if (sn && st) { const rc = snap(lerpP(sn.pos, st.pos, 0.6), st.normal, 0.015), along = rc.p.clone().sub(neck); along.addScaledVector(rc.n, -along.dot(rc.n)).normalize(); const rb = new Builder(), RF = frame(rc.p, rc.n, along);
          rb.push(RF); rb.add(sph(1, 20, 12), 'clear', { m: TR(0, 0.012, 0, 0, 0, 0, 0.052, 0.098, 0.013), c: 0xf2f8fb, a: 0.12, r: 0.16 }); rb.add(ribbon([V3(-0.05, 0.012, 0), V3(-0.036, 0.085, 0), V3(0, 0.111, 0), V3(0.036, 0.085, 0), V3(0.05, 0.012, 0), V3(0.036, -0.062, 0), V3(0, -0.087, 0), V3(-0.036, -0.062, 0)], V3(0, 0, 1), 0.004, 0.0006, true), 'tubing', { c: 0xf2f8fb, a: 0.3, r: 0.2 }); rb.pop();
          const top2 = V3(0, -0.082, 0.002).applyMatrix4(RF); rb.add(tube([neck, lerpP(neck, top2, 0.5).addScaledVector(rc.n, 0.004), top2], 0.0095, 8, 8), 'clear', { c: 0xf2f8fb, a: 0.16, r: 0.16 });
          g.add(rides(rb.build(), rc.p, rc.n)); }
      }
      b.build({ into: g }); return g;
    },
    bvm(adj, o2, capno) {
      const g = new THREE.Group(), b = new Builder(), fwd = fwdOf(), up = upOf();
      let conn = adj === 'igel' ? attach.igel : adj === 'cric' ? attach.cric : null;
      if (!conn) { const n = A.nose, m = A.mouth; if (!n || !m) return null;
        const top = n.pos.clone().addScaledVector(up, 0.03), bot = A.chin ? lerpP(m.pos, A.chin.pos, 1.0) : m.pos.clone().addScaledVector(up, -0.035), hubC = n.pos.clone().addScaledVector(fwd, 0.03).addScaledVector(up, -0.024);
        const S = shell({ top, bottom: bot, wMouth: 0.044, wBridge: 0.019, hub: hubC, hubR: 0.0125, bulge: 0.016, lift: 0.009 });
        b.add(S.geo(), 'clear', { c: 0xeaf3f7, a: 0.16, r: 0.1 }); b.add(tube(S.rim.map(p => p.clone().addScaledVector(fwd, -0.003)), 0.0075, 7, S.n * 2, true), 'tubing', { c: 0xcfe2ef, a: 0.4, r: 0.18 });
        b.add(cyl(0.0125, 0.013, 0.016, 18), 'tubing', { m: frame(hubC.clone().addScaledVector(fwd, 0.006), fwd).multiply(TR(0, 0, 0, H, 0, 0)), c: 0xeaf3f7, a: 0.42, r: 0.12 });
        conn = { p: hubC.clone().addScaledVector(fwd, 0.014), d: fwd.clone() }; }
      // patient valve as an elbow off the connector; the bag runs off toward the top of the head and upward
      const d = conn.d.clone().normalize(), bd = up.clone().multiplyScalar(0.86).addScaledVector(UP, 0.42).addScaledVector(d, 0.12).normalize(), vc = conn.p.clone().addScaledVector(d, capno ? 0.052 : 0.03), F = frame(vc, bd, d), side = monSide();
      b.add(cyl(0.011, 0.011, vc.distanceTo(conn.p), 16), 'tubing', { m: frame(lerpP(conn.p, vc, 0.5), d).multiply(TR(0, 0, 0, H, 0, 0)), c: 0xeaf3f7, a: 0.4, r: 0.12 });
      if (capno) { const cf = frame(conn.p.clone().addScaledVector(d, 0.016), d, bd); b.push(cf); b.add(rbox(0.026, 0.02, 0.016, 0.004), 'tubing', { c: 0xfff1b8, a: 0.55, r: 0.15 }); b.add(cyl(0.0022, 0.0028, 0.01, 8), 'hard', { m: TR(side * 0.016, 0, 0, 0, 0, H), c: 0xe3b81f, r: 0.5 }); b.pop();
        const e = plug(b, 'co2', 0xe3b81f, false); cord(b, rope(V3(side * 0.022, 0, 0).applyMatrix4(cf), e.p, { r: 0.0013, da: V3(side, 0, 0).transformDirection(cf), db: e.d, slack: 1.25 }), 0.0013, 0xf5e6a0, { mat: 'tubing', a: 0.5, rough: 0.4, rs: 5 }); }
      b.push(F);
      b.add(cyl(0.0185, 0.0185, 0.042, 20), 'tubing', { m: TR(0, 0, 0.002, H, 0, 0), c: 0xeaf3f7, a: 0.3, r: 0.1 }); b.add(cyl(0.004, 0.0135, 0.02, 14), 'hard', { m: TR(0, 0, -0.002, -H, 0, 0), c: 0xf0c020, r: 0.5 });
      b.add(cyl(0.0195, 0.0195, 0.007, 20), 'hard', { m: TR(0, 0, -0.021, H, 0, 0), c: 0xe9ecee, r: 0.45 }); b.add(cyl(0.0165, 0.0185, 0.012, 20), 'hard', { m: TR(0, 0, 0.029, H, 0, 0), c: 0xe9ecee, r: 0.45 });
      // tail: intake valve, oxygen nipple, reservoir hanging off the end
      b.add(cyl(0.0235, 0.021, 0.024, 20), 'hard', { m: TR(0, 0, 0.214, H, 0, 0), c: 0xe9ecee, r: 0.45 }); b.add(cyl(0.0242, 0.0242, 0.005, 20), 'hard', { m: TR(0, 0, 0.205, H, 0, 0), c: 0x2f6bbf, r: 0.45 });
      b.add(cyl(0.0032, 0.004, 0.014, 10), 'hard', { m: TR(side * 0.028, 0, 0.216, 0, 0, H), c: o2 ? C.o2green : 0xe9ecee, r: 0.5 });
      b.pop();
      const tail = V3(0, 0, 0.226).applyMatrix4(F), rd = bd.clone().multiplyScalar(0.5).addScaledVector(UP, -0.86).normalize(), RF = frame(tail, rd, d);
      b.push(RF); b.add(cyl(0.012, 0.012, 0.02, 14), 'tubing', { m: TR(0, 0, 0.008, H, 0, 0), c: 0xeaf3f7, a: 0.35, r: 0.12 }); b.add(sph(1, 18, 12), 'clear', { m: TR(0, 0, 0.088, 0, 0, 0, 0.034, 0.02, 0.075), c: 0xf2f8fb, a: 0.07, r: 0.2 }); b.pop();
      if (o2) o2Tube(b, V3(side * 0.036, 0, 0.216).applyMatrix4(F), V3(side, 0, 0).transformDirection(F), { slack: 1.2 });
      b.build({ into: g });
      // the bag itself: a separate mesh so that it can be squeezed
      const bb = new Builder(), prof = []; for (let i = 0; i <= 18; i++) { const t = i / 18, r = 0.0165 + 0.037 * Math.pow(Math.sin(Math.PI * t), 0.62); prof.push([r * (1 + 0.03 * Math.cos(t * Math.PI * 14) * Math.sin(Math.PI * t)), 0.035 + t * 0.17]); }
      bb.add(lathe(prof, 26), 'film', { m: TR(0, 0, 0, H, 0, 0), c: 0x79b2e2, a: 0.5, r: 0.3 });
      bb.add(cyl(0.0538, 0.0538, 0.03, 20, true, -0.9, 1.8), 'decal', { m: TR(0, 0, 0.12, H, 0, 0), uv: { rect: AT.add('bvmPrint', 220, 60, (g, w, h) => { txt(g, 'ADULT 1500 mL', w / 2, h * 0.32, h * 0.38, { c: '#1d3f66', w: 800, sp: 1 }); txt(g, 'SINGLE PATIENT USE · 40 cmH₂O', w / 2, h * 0.74, h * 0.2, { c: '#1d3f66', w: 700 }); }) }, r: 0.3 });
      const bag = bb.build(); bag.name = 'bag'; bag.applyMatrix4(F); g.add(bag);
      g.userData.tick = (dt, t, p, breath) => { const s = Math.max(0, Math.min(1, breath || 0)); bag.scale.set(1 - 0.5 * s, 1 - 0.14 * s, 1); };
      return g;
    },
    collar() {
      const sn = A.sternalNotch, ch = A.chin, nf = A.neckFront, cl = A.carotidL, cr = A.carotidR; if (!sn || !ch || !nf) return null;
      const lat = cl && cr ? cl.pos.clone().sub(cr.pos).normalize() : LAT.clone(), fwd = nf.normal.clone().addScaledVector(lat, -nf.normal.dot(lat)).normalize(), up = new THREE.Vector3().crossVectors(fwd, lat).normalize();
      const c0 = nf.pos.clone().addScaledVector(fwd, -0.056), s = sleeve(c0.clone().addScaledVector(up, -0.01), c0.clone().addScaledVector(up, 0.01), { at: 0.5, w: 0.012, rows: 2, n: 32, r: 0.06, rMax: 0.1, off: 0, spread: 1.22 });
      const c = s.c, n = s.n, rr = s.radii[0], a0 = s.angleOf(fwd), b = new Builder();
      const rAt = phi => { const k = ((a0 + phi / (Math.PI * 2)) % 1 + 1) % 1 * n, k0 = Math.floor(k) % n, f = k - Math.floor(k); return rr[k0] * (1 - f) + rr[(k0 + 1) % n] * f; };
      const zLo = sn.pos.clone().sub(c).dot(up) + 0.006, zHi = Math.max(zLo + 0.06, ch.pos.clone().sub(c).dot(up) - 0.004), chinR = Math.min(0.06, Math.max(0, ch.pos.clone().sub(c).dot(fwd) - rAt(0) - 0.012));
      const dirAt = phi => { const a = a0 * Math.PI * 2 + phi; return s.e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(s.e2, Math.sin(a)); };
      // the shell as a function of angle from the front (phi) and height (v: 0 lower edge .. 1 upper edge)
      const P = (phi, v, pad) => { const cp = Math.cos(phi), back = (1 - cp) / 2, sd = Math.sin(phi) ** 2, lo = zLo + 0.012 * sd + 0.004 * back, hi = zHi - 0.016 * sd + 0.02 * back, z = lo + (hi - lo) * v;
        const front = Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(phi > Math.PI ? phi - 2 * Math.PI : phi) * 1.5))), r = rAt(phi) + pad + 0.016 * (1 - v) * (1 - v) * (0.4 + 0.6 * (1 - back)) + chinR * front * front * v * v * v + 0.004 * back;
        const d = dirAt(phi), p = c.clone().addScaledVector(up, z).addScaledVector(d, r); if (p.y < K.floorAt(p) + 0.003) p.y = K.floorAt(p) + 0.003; return { p, n: d }; };
      const band = (p0, p1, v0, v1, pad, cols, rows, thick) => { const grid = [], nors = []; for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const q = P(p0 + (p1 - p0) * k / (cols - 1), v0 + (v1 - v0) * r / (rows - 1), pad); grid.push(q.p); nors.push(q.n); } return sheet(grid, rows, cols, thick, nors); };
      const TAU = Math.PI * 2, hole = 0.42, shellC = 0xe9e6dc;
      // rigid shell in three pieces round the tracheal opening; the foam liner shows above and below it
      b.add(band(0, TAU, 0, 0.26, 0.009, 41, 3, 0.004), 'hard', { c: shellC, r: 0.55 }); b.add(band(0, TAU, 0.72, 1, 0.009, 41, 3, 0.004), 'hard', { c: shellC, r: 0.55 }); b.add(band(hole, TAU - hole, 0.26, 0.72, 0.009, 37, 4, 0.004), 'hard', { c: shellC, r: 0.55 });
      b.add(band(0, TAU, -0.07, 0.27, 0.0045, 41, 3, 0.005), 'fuzz', { c: 0xcfd9e6, r: 0.95, s: 2 }); b.add(band(0, TAU, 0.71, 1.07, 0.0045, 41, 3, 0.005), 'fuzz', { c: 0xcfd9e6, r: 0.95, s: 2 }); b.add(band(hole + 0.02, TAU - hole - 0.02, 0.27, 0.71, 0.0045, 37, 3, 0.004), 'fuzz', { c: 0xcfd9e6, r: 0.95, s: 2 });
      // hook-and-loop strap round the back, its pull tabs, sizing lock buttons, print
      b.add(band(1.25, TAU - 1.25, 0.34, 0.66, 0.0118, 30, 2, 0.0015), 'fuzz', { c: 0x2a5fae, r: 0.95, s: 3 });
      for (const sg of [1, -1]) { b.add(band(sg * 0.95, sg * 1.3, 0.3, 0.7, 0.0128, 5, 2, 0.002), 'fuzz', { c: 0x16233a, r: 0.95, s: 3 }); const q = P(sg * 0.62, 0.5, 0.0105); b.push(frame(q.p, q.n, up)); b.add(cyl(0.006, 0.0066, 0.004, 12), 'hard', { m: TR(0, 0, 0.0012, H, 0, 0), c: 0x15171a, r: 0.6 }); b.add(rbox(0.004, 0.03, 0.002, 0.001), 'hard', { m: TR(0.012, 0, 0.0006), c: 0x15171a, r: 0.6 }); b.pop(); }
      b.add(band(0.46, 1.2, 0.03, 0.235, 0.0102, 8, 3, 0), 'decal', { uv: { rect: AT.add('collarPrint', 300, 110, collarArt) }, r: 0.6 });
      return b.build();
    },
  };
}
