// Circulation and trauma equipment (binder, tourniquets, cannulas and lines, the fluid bag, seals, dressings, the
// traction splint) and the small things that get used and put down by the bag (glucometer, pen torch, syringes).
// circulation(K, T) returns makers that gear-items.js merges into its own; T is its shared toolbox.

import * as THREE from 'three';
import { Builder, TR, V3, frame, rbox, box, cyl, sph, torus, plate, disc, lathe, tube, ribbon, sheet, atlas, C, txt, rr, circ, HAND } from './gear-lib.js';

const H = Math.PI / 2, LAT = V3(1, 0, 0), UP = V3(0, 1, 0);
const GAUGE = { 14: 0xe3691b, 16: 0x8b9096, 17: 0xe8e8e3, 18: 0x2e8a4a, 20: 0xd9638f, 22: 0x2a62b8, 24: 0xe8c22e };
const lerpP = (a, b, t) => a.clone().lerp(b, t);
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
// ISO 26825 user-applied syringe label colours by drug class
const DRUG_CLASS = [[/epi|adren|norepi|noradr/, '#c9a6dc', '#111'], [/morph|fentan|hydromorph|opio/, '#8fc6ea', '#111'], [/midaz|diaz|loraz/, '#f0a04a', '#111'], [/ketam|etomid|propof/, '#f4e04a', '#111'], [/atrop|glyco/, '#9bd08a', '#111'], [/nalox|flumaz/, '#ffffff', '#1c5fa8'], [/amio|lido|adenos/, '#e9e9e4', '#111'], [/succ|rocur|vecur/, '#f0564a', '#111'], [/ondans|metoclo|droper/, '#f3c0a4', '#111']];

function salineArt(g, w, h) {   // blue print on clear PVC
  const c = '#1c4f9c'; txt(g, '1000 mL', w / 2, h * 0.07, h * 0.06, { c, w: 800 }); txt(g, '0.9% Sodium Chloride', w / 2, h * 0.16, h * 0.058, { c, w: 800 }); txt(g, 'Injection USP', w / 2, h * 0.225, h * 0.05, { c, w: 700 });
  for (const [i, s] of ['Each 100 mL contains 900 mg Sodium Chloride USP', 'pH 5.0 (4.5 to 7.0)  mEq/L  Sodium 154  Chloride 154', 'Osmolarity 308 mOsmol/L (calc)  Sterile  Nonpyrogenic', 'Single dose container  Do not use unless solution is clear', 'Rx only   Store at room temperature'].entries()) txt(g, s, w / 2, h * (0.3 + i * 0.038), h * 0.026, { c, w: 600 });
  for (let i = 1; i <= 9; i++) { const y = h * (0.1 + i * 0.086); g.fillStyle = c; g.fillRect(w * 0.9, y, w * 0.08, 2); txt(g, String(i), w * 0.86, y, h * 0.036, { c, al: 'right' }); g.fillRect(w * 0.94, y - h * 0.043, w * 0.04, 1.2); }
  txt(g, 'NDC 0338-0049-04', w * 0.06, h * 0.56, h * 0.028, { c, al: 'left', w: 600 }); txt(g, 'LOT P417352   EXP 09/27', w * 0.06, h * 0.6, h * 0.028, { c, al: 'left', w: 600 });
  for (let i = 0; i < 34; i++) { g.fillStyle = c; g.fillRect(w * 0.06 + i * 3.4, h * 0.64, i * 7 % 3 ? 2.2 : 1, h * 0.05); }
  rr(g, w * 0.06, h * 0.74, w * 0.6, h * 0.1, 4, 'rgba(255,255,255,0.85)', c, 1.5); txt(g, 'MEDICATION ADDED:', w * 0.08, h * 0.765, h * 0.024, { c, al: 'left' });
}
function sealArt(vented) {
  return (g, w) => { const c = w / 2; g.strokeStyle = 'rgba(190,40,30,0.85)'; g.lineWidth = w * 0.012; g.beginPath(); g.arc(c, c, w * 0.455, 0, 7); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = w * 0.05; g.beginPath(); g.arc(c, c, w * 0.415, 0, 7); g.stroke();
    g.save(); g.translate(c, c); const s = vented ? ' VENTED CHEST SEAL · PLACE VENT OVER WOUND ·' : ' OCCLUSIVE CHEST SEAL · NON-VENTED · WIPE SKIN DRY ·'; g.font = `700 ${w * 0.05}px Arial`; g.fillStyle = 'rgba(170,30,22,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < s.length; i++) { g.save(); g.rotate(i / s.length * Math.PI * 2); g.fillText(s[i], 0, -w * 0.36); g.restore(); }
    if (vented) for (let i = 0; i < 3; i++) { g.rotate(Math.PI * 2 / 3); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(-w * 0.018, -w * 0.3, w * 0.036, w * 0.2); g.fillStyle = 'rgba(170,30,22,0.9)'; g.beginPath(); g.moveTo(0, -w * 0.31); g.lineTo(-w * 0.03, -w * 0.26); g.lineTo(w * 0.03, -w * 0.26); g.fill(); }
    g.restore(); };
}
function incisionArt(g, w, h) {
  const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.5); gr.addColorStop(0, 'rgba(150,84,20,0.5)'); gr.addColorStop(0.7, 'rgba(160,96,30,0.28)'); gr.addColorStop(1, 'rgba(160,96,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,8,10,0.55)'; g.lineWidth = h * 0.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(w * 0.25, h * 0.5); g.lineTo(w * 0.75, h * 0.5); g.stroke();
  g.strokeStyle = 'rgba(52,2,4,0.96)'; g.lineWidth = h * 0.085; g.beginPath(); g.moveTo(w * 0.24, h * 0.5); g.quadraticCurveTo(w * 0.5, h * 0.46, w * 0.76, h * 0.5); g.stroke();
  g.strokeStyle = 'rgba(110,6,8,0.8)'; g.lineWidth = h * 0.05; g.beginPath(); g.moveTo(w * 0.6, h * 0.52); g.quadraticCurveTo(w * 0.66, h * 0.8, w * 0.62, h * 0.98); g.stroke();
}

export function circulation(K, T) {
  const { A, at, snap, patch, sleeve, rope, tangents, rides, attach } = K, { cord, arc, clock, tapeLabel, headward, monSide } = T, AT = atlas();
  const tape = (b, c, n, toward, w, h, lift = 0.0022) => b.add(patch(c, n, toward, w, h, { lift, cols: Math.max(3, Math.round(w / 0.012) + 1), rows: Math.max(2, Math.round(h / 0.012) + 1) }).geo(), 'fuzz', { c: 0xf3efe5, r: 0.82, s: 3 });
  // where used things are put down: a clear bit of floor by the bag, in the kit's frame
  const spot = (() => { const m = K.mon.group.position; for (const [x, z] of [[0.56, 0.16], [0.1, 0.44], [0.62, -0.22], [-0.2, -0.6]]) { if (Math.hypot(x - m.x, z - m.z) < 0.45) continue; if (K.sdf(K.kitPt(K.kit, V3(x, 0.05, z))) < 0.14) continue; return V3(x, 0, z); } return V3(0.56, 0, 0.16); })();
  const onFloor = b => { const g = b.build(); g.position.copy(spot); K.kit.add(g); return g; };

  return {
    binder() {
      const a = A.pelvisL, c = A.pelvisR; if (!a || !c) return null;
      const lat = a.pos.clone().sub(c.pos).normalize(), w = a.pos.distanceTo(c.pos), ax = A.umbilicus && A.groinL ? lerpP(A.groinL.pos, (A.groinR || A.groinL).pos, 0.5).sub(A.umbilicus.pos) : V3(0, 0, 1); ax.addScaledVector(lat, -ax.dot(lat)).normalize();
      const cen = lerpP(a.pos, c.pos, 0.5).addScaledVector(ax, 0.06), b = new Builder();
      const s = sleeve(cen.clone().addScaledVector(ax, -0.05), cen.clone().addScaledVector(ax, 0.05), { at: 0.5, w: 0.14, rows: 4, n: 40, r: w * 0.5, rMax: w * 0.8, off: 0.018, spread: 1.4, smooth: 4 });
      b.add(s.geo(0.005), 'fuzz', { c: C.orange, r: 0.85, uv: [s.circ * 0.6, 0.09] });
      const aF = s.angleOf(new THREE.Vector3().crossVectors(ax, lat));
      b.add(arc(s, aF - 0.3, aF + 0.3, 0.32, 0.68, 0.0032, 20, 2), 'web', { c: 0x131415, r: 0.7, uv: [s.circ * 0.6, 1] });
      for (const e of [0.03, 0.97]) b.add(arc(s, 0, 1, e - 0.02, e + 0.02, 0.0015, 41, 2), 'web', { c: 0x1a1b1d, r: 0.75, uv: [s.circ, 1] });
      // buckle with its pull handle, and the print
      const q = s.point(aF + 0.03, 0.5, 0.0065); b.push(frame(q.p, q.n, ax)); b.add(rbox(0.075, 0.058, 0.011, 0.005, 3), 'hard', { c: 0x17181a, r: 0.55 }); b.add(rbox(0.05, 0.03, 0.004, 0.002), 'hard', { m: TR(0, 0, 0.007), c: 0x24262a, r: 0.6 }); b.add(torus(0.016, 0.004, 14, 6), 'hard', { m: TR(-0.058, 0, 0.002), c: C.orange, r: 0.6 }); b.pop();
      b.add(arc(s, aF - 0.07, aF - 0.3, 0.3, 0.04, 0.0014, 12, 3), 'decal', { uv: { rect: AT.add('binderPrint', 330, 100, (g, ww, hh) => { txt(g, 'PELVIC BINDER', 4, hh * 0.3, hh * 0.34, { al: 'left', c: '#141518', w: 800, sp: 2 }); txt(g, 'CENTRE OVER GREATER TROCHANTERS', 4, hh * 0.62, hh * 0.14, { al: 'left', c: '#141518', w: 700 }); txt(g, 'TIME ON:', 4, hh * 0.86, hh * 0.15, { al: 'left', c: '#141518', w: 700 }); txt(g, clock(0), ww * 0.38, hh * 0.84, hh * 0.24, { al: 'left', c: '#101116', f: HAND }); }) }, r: 0.7 });
      return b.build();
    },
    tq(limb, t) {
      const leg = limb.startsWith('leg'), S = limb.slice(-1), a1 = A[(leg ? 'groin' : 'deltoid') + S], a2 = A[(leg ? 'thigh' : 'acf') + S]; if (!a1 || !a2) return null;
      const rg = leg ? 0.07 : 0.042, s = sleeve(a1.pos.clone().addScaledVector(a1.normal, -rg), a2.pos.clone().addScaledVector(a2.normal, -rg), { at: leg ? 0.62 : 0.3, w: 0.038, rows: 2, n: 28, r: rg, off: 0.003, spread: 1.25 }), b = new Builder();
      b.add(s.geo(0.003), 'web', { c: 0x131415, r: 0.7, uv: [s.circ, 1] });
      const aW = s.angleOf(a2.normal); b.add(arc(s, aW + 0.07, aW + 0.24, 0.06, 0.94, 0.0045, 8, 2), 'web', { c: 0x18191b, r: 0.7, uv: [s.circ * 0.2, 1] }); b.add(arc(s, aW + 0.235, aW + 0.26, 0.06, 0.94, 0.0052, 3, 2), 'hard', { c: 0xb1241b, r: 0.6 });
      const q = s.point(aW, 0.5, 0.0055); b.push(frame(q.p, q.n, s.axis));
      b.add(rbox(0.058, 0.04, 0.004, 0.002), 'hard', { c: 0x17181a, r: 0.65 });
      b.push(TR(-0.004, 0, 0.009, 0, 0, 0.22)); b.add(cyl(0.0056, 0.0056, 0.112, 12), 'hard', { m: TR(0, 0, 0, 0, 0, H), c: 0x101112, r: 0.55 }); for (const e of [-1, 1]) for (let i = 0; i < 3; i++) b.add(cyl(0.0064, 0.0064, 0.003, 12), 'hard', { m: TR(e * (0.04 + i * 0.006), 0, 0, 0, 0, H), c: 0x17181a, r: 0.7 }); b.pop();
      // windlass clip and the white time strap across it
      for (const e of [-1, 1]) b.add(rbox(0.014, 0.0035, 0.016, 0.0015), 'hard', { m: TR(0.034, e * 0.012 + 0.008, 0.01), c: 0x17181a, r: 0.6 });
      b.add(plate(0.028, 0.03), 'label', { m: TR(0.034, 0.008, 0.0185), uv: { rect: tapeLabel('tq' + clock(t), 'T ' + clock(t), 150, 160) }, r: 0.8 });
      b.pop(); return b.build();
    },
    iv(site, gauge, t) {
      const a = at(site); if (!a) return null; const S = site.slice(-1), sh = A['deltoid' + S], col = GAUGE[gauge] || GAUGE[18], b = new Builder();
      const tg = tangents(a.n, sh ? sh.pos.clone().sub(a.p) : V3(0, 0, -1)), v = tg.v, u = tg.u;
      // cannula lying in the vein: hub, wings, injection port, flash chamber, luer lock
      const F = frame(a.p.clone().addScaledVector(a.n, 0.0048).addScaledVector(v, -0.004), v.clone().addScaledVector(a.n, -0.12).normalize(), a.n); b.push(F);
      b.add(cyl(0.0008, 0.0008, 0.016, 6), 'tubing', { m: TR(0, -0.001, 0.014, H, 0, 0), c: 0xe6eef2, a: 0.7, r: 0.2 });
      b.add(cyl(0.0026, 0.0038, 0.015, 12), 'hard', { m: TR(0, 0, 0, H, 0, 0), c: col, r: 0.4 }); b.add(rbox(0.027, 0.0013, 0.0095, 0.0005), 'hard', { m: TR(0, -0.0022, -0.001), c: col, r: 0.45 });
      b.add(cyl(0.0029, 0.0029, 0.0065, 10), 'hard', { m: TR(0, 0.0052, -0.003), c: col, r: 0.4 }); b.add(rbox(0.008, 0.0016, 0.0065, 0.0006), 'hard', { m: TR(0.001, 0.0088, -0.003), c: col, r: 0.4 });
      b.add(cyl(0.0034, 0.0034, 0.012, 12), 'tubing', { m: TR(0, 0, -0.0135, H, 0, 0), c: 0xf2f6f8, a: 0.5, r: 0.1 }); b.add(cyl(0.0046, 0.0046, 0.006, 12), 'hard', { m: TR(0, 0, -0.022, H, 0, 0), c: 0xe9ecee, r: 0.45 });
      b.pop();
      // clear film dressing with its written label, a tape across the wings
      { const P = patch(a.p.clone().addScaledVector(v, 0.004), a.n, v, 0.058, 0.07, { lift: 0.0016, cols: 7, rows: 8, corner: 0.01 }); b.add(P.geo(), 'film', { c: 0xffffff, a: 0.12, r: 0.06 }); const rim = [], rn = []; const add = (r, c) => { rim.push(P.grid[r * P.cols + c]); rn.push(P.nors[r * P.cols + c]); }; for (let c = 0; c < P.cols; c++) add(0, c); for (let r = 1; r < P.rows; r++) add(r, P.cols - 1); for (let c = P.cols - 2; c >= 0; c--) add(P.rows - 1, c); for (let r = P.rows - 2; r > 0; r--) add(r, 0); b.add(ribbon(rim, rn, 0.0028, 0.0005, true), 'film', { c: 0xffffff, a: 0.32, r: 0.2 }); }
      b.add(patch(a.p.clone().addScaledVector(v, 0.043), a.n, v, 0.052, 0.014, { lift: 0.0022, cols: 5, rows: 2 }).geo(), 'label', { uv: { rect: tapeLabel(`iv${gauge}_${clock(t)}`, `${gauge}G  ${clock(t)}  RK`) }, r: 0.8 });
      tape(b, a.p.clone().addScaledVector(v, -0.02), a.n, v, 0.05, 0.012, 0.0032);
      // short extension looped back along the forearm, taped down, ending in a needle-free connector
      const s0 = V3(0, 0, -0.025).applyMatrix4(F), e = snap(a.p.clone().addScaledVector(v, -0.105).addScaledVector(u, 0.012), a.n, 0.0045), dv = v.clone().negate();
      const pts = rope(s0, e.p, { r: 0.0013, da: dv, slack: 1.06, it: 30, n: 8 }); cord(b, pts, 0.0013, 0xeaf3f8, { mat: 'tubing', a: 0.5, rough: 0.1, rs: 6 });
      const EF = frame(e.p, dv.clone().addScaledVector(e.n, -dv.dot(e.n)).normalize(), e.n); b.push(EF); b.add(cyl(0.0036, 0.0036, 0.016, 10), 'hard', { m: TR(0, 0, 0.008, H, 0, 0), c: 0x2a8fd0, r: 0.4 }); b.add(cyl(0.0042, 0.0042, 0.004, 10), 'tubing', { m: TR(0, 0, 0.018, H, 0, 0), c: 0xffffff, a: 0.6, r: 0.1 }); b.add(rbox(0.0085, 0.005, 0.013, 0.0015), 'hard', { m: TR(0, 0.0005, -0.03), c: 0x2a62b8, r: 0.5 }); b.pop();
      tape(b, lerpP(a.p, e.p, 0.62), a.n, v, 0.044, 0.012, 0.003);
      attach['iv' + site] = { p: V3(0, 0, 0.021).applyMatrix4(EF), d: V3(0, 0, 1).transformDirection(EF) }; return b.build();
    },
    io(site) {
      const a = at(site); if (!a) return null; const S = site.slice(-1), kn = A['knee' + S], an = A['ankle' + S], b = new Builder();
      const tg = tangents(a.n, an && kn ? an.pos.clone().sub(kn.pos) : V3(0, 0, 1)), v = tg.v, F = frame(a.p, a.n, v);
      // stabiliser dressing, the needle set's hub, a right-angle extension set
      b.add(patch(a.p, a.n, v, 0.062, 0.062, { round: true, lift: 0.0014, cols: 7, rows: 7 }).geo(), 'fuzz', { c: 0xf3efe5, r: 0.82, s: 3 });
      b.push(F);
      b.add(lathe([[0.019, 0.0015], [0.018, 0.004], [0.011, 0.0085], [0.0075, 0.0095], [0.0075, 0.0075], [0.0105, 0.0065], [0.016, 0.003], [0.017, 0.0015]], 20), 'tubing', { m: TR(0, 0, 0, H, 0, 0), c: 0xeef4f7, a: 0.5, r: 0.12 });
      b.add(cyl(0.0009, 0.0009, 0.01, 6), 'hard', { m: TR(0, 0, 0.005, H, 0, 0), c: C.steel, r: 0.25, mt: 1 });
      b.add(cyl(0.0058, 0.0064, 0.011, 14), 'hard', { m: TR(0, 0, 0.0135, H, 0, 0), c: 0x2f6bbf, r: 0.4 }); for (let i = 0; i < 8; i++) b.add(box(0.0012, 0.0012, 0.009), 'hard', { m: TR(Math.cos(i * 0.785) * 0.0063, Math.sin(i * 0.785) * 0.0063, 0.0135), c: 0x2759a0, r: 0.5 });
      b.add(cyl(0.0034, 0.0044, 0.006, 10), 'hard', { m: TR(0, 0, 0.022, H, 0, 0), c: 0xe9ecee, r: 0.45 });
      b.add(tube([V3(0, 0, 0.024), V3(0, 0, 0.029), V3(0, 0.004, 0.0325), V3(0, 0.012, 0.033)], 0.0026, 7, 8), 'tubing', { c: 0xf2f6f8, a: 0.55, r: 0.1 });
      b.pop();
      const s0 = V3(0, 0.012, 0.033).applyMatrix4(F), e = a.p.clone().addScaledVector(v, 0.15); e.x += Math.sign(a.n.x || 1) * 0.075; e.y = K.floorAt(e) + 0.0045; for (let i = 0; i < 8 && K.sdf(e) < 0.012; i++) e.y += 0.01;
      const pts = rope(s0, e, { r: 0.0014, da: v, slack: 1.12, it: 45 }); cord(b, pts, 0.0014, 0xeaf3f8, { mat: 'tubing', a: 0.5, rough: 0.1, rs: 6 });
      const dE = e.clone().sub(pts[pts.length - 2]).setY(0).normalize(), EF = frame(e, dE.lengthSq() ? dE : v, UP); b.push(EF); b.add(cyl(0.0036, 0.0036, 0.016, 10), 'hard', { m: TR(0, 0, 0.008, H, 0, 0), c: 0x2a8fd0, r: 0.4 }); b.add(rbox(0.009, 0.0055, 0.014, 0.0015), 'hard', { m: TR(0, 0.0006, -0.04), c: 0xe9ecee, r: 0.5 }); b.pop();
      attach['io|' + site] = { p: V3(0, 0, 0.018).applyMatrix4(EF), d: V3(0, 0, 1).transformDirection(EF) }; return b.build();
    },
    seal(S, vented) {
      const a = at('ics5' + S); if (!a) return null; const hw = headward(), c = snap(a.p.clone().addScaledVector(hw, -0.035), a.n, 0, 0.05), b = new Builder();
      const P = patch(c.p, c.n, hw, 0.152, 0.152, { round: true, lift: 0.0016, cols: 11, rows: 11, reach: 0.035 });
      b.add(P.geo(), 'film', { c: 0xfbfdff, a: 0.11, r: 0.05 }); b.add(P.geo(), 'decal', { uv: { rect: AT.add(vented ? 'sealV' : 'sealN', 256, 256, sealArt(vented)) }, r: 0.3 });
      const tb = snap(c.p.clone().addScaledVector(P.u, 0.082), c.n, 0.003, 0.04); b.add(rbox(0.026, 0.016, 0.0012, 0.0005), 'hard', { m: frame(tb.p, tb.n, P.v), c: 0xc62a1c, r: 0.5 });
      if (vented) { b.push(frame(c.p.clone().addScaledVector(c.n, 0.0022), c.n, hw)); b.add(cyl(0.0145, 0.0155, 0.002, 20), 'hard', { m: TR(0, 0, 0.001, H, 0, 0), c: 0xecebe5, r: 0.5 }); b.add(sph(0.0115, 16, 8, 0, Math.PI * 2, 0, H), 'tubing', { m: TR(0, 0, 0.002, H, 0, 0, 1, 0.62, 1), c: 0xf4f8fa, a: 0.45, r: 0.1 }); b.add(cyl(0.0062, 0.0062, 0.0016, 14), 'hard', { m: TR(0, 0, 0.0045, H, 0, 0), c: C.orange, r: 0.5 }); b.pop(); }
      return rides(b.build(), c.p, c.n);
    },
    decomp(S) {
      const a = at('ics5' + S); if (!a) return null; const b = new Builder(), hw = headward();
      tape(b, a.p, a.n, hw.clone().add(tangents(a.n, hw).u), 0.042, 0.011, 0.0024); tape(b, a.p, a.n, hw.clone().sub(tangents(a.n, hw).u), 0.042, 0.011, 0.0028);
      b.push(frame(a.p, a.n, hw));
      b.add(cyl(0.0012, 0.0012, 0.012, 8), 'tubing', { m: TR(0, 0, 0.006, H, 0, 0), c: 0xf0c9a0, a: 0.8, r: 0.2 });
      b.add(cyl(0.0052, 0.0032, 0.021, 12), 'tubing', { m: TR(0, 0, 0.0215, H, 0, 0), c: 0xe3691b, a: 0.78, r: 0.15 }); b.add(rbox(0.013, 0.0032, 0.0022, 0.0008), 'hard', { m: TR(0, 0, 0.0125), c: 0xe3691b, r: 0.4 }); b.add(torus(0.0052, 0.0009, 12, 5), 'hard', { m: TR(0, 0, 0.032), c: 0xe3691b, r: 0.4 });
      b.pop(); return rides(b.build(), a.p, a.n);
    },
    thoracostomy(S) {
      const a = at('ics5' + S); if (!a) return null; const b = new Builder(), hw = headward(), c = snap(a.p.clone().addScaledVector(hw, 0.028), a.n, 0, 0.05);
      b.add(patch(c.p, c.n, hw, 0.085, 0.06, { lift: 0.001, cols: 7, rows: 5, reach: 0.035 }).geo(), 'decal', { uv: { rect: AT.add('incision', 170, 120, incisionArt) }, r: 0.3 });
      return rides(b.build(), c.p, c.n);
    },
    dressing(id, kind) {
      const map = { backStab: ['backLower', 'tape'], scalp: ['forehead', 'head'], femR: ['thighR', 'limb', 'groinR', 'kneeR'], fem: ['groinL', 'tape'], brach: ['acfL', 'tape'], carotid: ['carotidL', 'tape'], jug: ['carotidR', 'tape'], thyroid: ['neckFront', 'tape'] }[id]; if (!map) return null;
      const a = at(map[0]); if (!a) return null; const b = new Builder(), hw = headward(), pressure = kind !== 'pack', wrapC = pressure ? 0x8d927b : 0xe9e3d0;
      const P = patch(a.p, a.n, hw, 0.1, 0.1, { lift: 0.0045, cols: 8, rows: 8, corner: 0.014 });
      b.add(P.geo(0.004), 'gauze', { c: 0xf2f0e8, r: 0.9, uv: [0.4, 0.4] });
      b.add(patch(a.p, a.n, hw, 0.075, 0.075, { lift: 0.0052, cols: 6, rows: 6, reach: 0.04 }).geo(), 'decal', { uv: { rect: T.blood(id.length, true) }, r: 0.6 });
      if (map[1] === 'head' && K.head) { const Hd = K.head, z = a.p.clone().sub(Hd.c).dot(Hd.up), cc = Hd.c.clone().addScaledVector(Hd.up, z), s = sleeve(cc.clone().addScaledVector(Hd.up, -0.02), cc.clone().addScaledVector(Hd.up, 0.02), { at: 0.5, w: 0.07, rows: 3, n: 32, r: 0.085, rMax: 0.13, off: 0.013, spread: 1.3 });
        b.add(s.geo(0.002), 'gauze', { c: wrapC, r: 0.9, uv: [s.circ * 4, 0.28] }); }
      else if (map[1] === 'limb' && A[map[2]] && A[map[3]]) { const p1 = A[map[2]], p2 = A[map[3]], rg = 0.07, c1 = p1.pos.clone().addScaledVector(p1.normal, -rg), c2 = p2.pos.clone().addScaledVector(p2.normal, -rg), ax = c2.clone().sub(c1), tt = clamp(a.p.clone().sub(c1).dot(ax) / ax.lengthSq(), 0.1, 0.9);
        const s = sleeve(c1, c2, { at: tt, w: 0.12, rows: 4, n: 32, r: rg, off: 0.0058, spread: 1.3 }); b.add(s.geo(0.002), 'gauze', { c: wrapC, r: 0.9, uv: [s.circ * 4, 0.48] });
        if (pressure) { const q = s.point(s.angleOf(a.n), 0.5, 0.003); b.add(rbox(0.05, 0.02, 0.007, 0.003), 'hard', { m: frame(q.p, q.n, s.axis), c: 0xe9e6dc, r: 0.5 }); } }
      else for (const [du, dv, w, h] of [[0, 0.05, 0.13, 0.016], [0, -0.05, 0.13, 0.016], [0.05, 0, 0.016, 0.13], [-0.05, 0, 0.016, 0.13]]) tape(b, a.p.clone().addScaledVector(P.u, du).addScaledVector(P.v, dv), a.n, hw, w, h, 0.0062);
      return b.build();
    },
    splint(where, traction) {
      const S = where.slice(-1), sg = S === 'L' ? 1 : -1, hip = A['thighLat' + S], an = A['ankle' + S], kn = A['knee' + S], gr = A['groin' + S], th = A['thigh' + S]; if (!hip || !an || !kn || !gr || !th) return null;
      const b = new Builder(), p1 = hip.pos.clone().addScaledVector(hip.normal, 0.02), p2 = an.pos.clone().addScaledVector(LAT, sg * 0.05); p2.y = Math.max(K.floorAt(p2) + 0.014, an.pos.y - 0.04);
      const d = p2.clone().sub(p1).normalize(), start = p1.clone().addScaledVector(d, -0.13), end = p2.clone().addScaledVector(d, 0.2); for (const q of [start, end]) q.y = Math.max(q.y, K.floorAt(q) + 0.014);
      const len = start.distanceTo(end), PF = frame(start, end.clone().sub(start).normalize(), UP);
      // sectioned aluminium pole with a dart at the foot end
      b.push(PF); b.add(cyl(0.0085, 0.0085, len, 12), 'hard', { m: TR(0, 0, len / 2, H, 0, 0), c: 0xb9bdc2, r: 0.33, mt: 0.92 }); for (const f of [0, 0.34, 0.67, 1]) b.add(cyl(0.0102, 0.0102, 0.028, 12), 'hard', { m: TR(0, 0, clamp(f * len, 0.014, len - 0.014), H, 0, 0), c: 0x17181a, r: 0.6 });
      b.add(rbox(0.03, 0.03, 0.04, 0.006), 'hard', { m: TR(0, 0.004, len - 0.03), c: 0x17181a, r: 0.6 }); b.pop();
      const strap = (a1, a2, t, w, col, rg, mat = 'web') => { const s = sleeve(a1.pos.clone().addScaledVector(a1.normal, -rg), a2.pos.clone().addScaledVector(a2.normal, -rg), { at: t, w, rows: 2, n: 26, r: rg, off: 0.004, spread: 1.3 }); b.add(s.geo(0.0025), mat, { c: col, r: 0.75, uv: [s.circ * (mat === 'web' ? 1 : 0.6), 1] });
        const q = s.point(s.angleOf(LAT.clone().multiplyScalar(sg)), 0.5, 0.003); b.add(rbox(0.03, w * 0.9, 0.012, 0.004), 'hard', { m: frame(q.p, q.n, s.axis), c: 0x17181a, r: 0.6 }); return s; };
      strap(gr, th, 0.18, 0.055, 0x131415, 0.075, 'fuzz'); strap(gr, th, 0.72, 0.05, 0xb1241b, 0.07); strap(kn, an, 0.12, 0.05, 0xe0b81f, 0.05); strap(kn, an, 0.55, 0.05, 0x2e8a4a, 0.045);
      const hitch = strap(kn, an, 0.97, 0.05, 0x131415, 0.04, 'fuzz');
      if (traction) { const from = hitch.c.clone().addScaledVector(hitch.axis, 0.03).addScaledVector(LAT, sg * 0.03), to = V3(0, 0, len - 0.03).applyMatrix4(PF); b.add(ribbon([from, lerpP(from, to, 0.5), to], UP, 0.025, 0.002), 'web', { c: 0xb1241b, r: 0.7 }); }
      return b.build();
    },
    fluid(line, pressure) {
      const to = attach[line]; if (!to) return null;
      const hook = K.kitPt(K.bag.group, K.bag.lidHook), out = K.kitDir(K.bag.group, V3(0, 0, -1)).setY(0).normalize(), F = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(UP, out), UP, out).setPosition(hook), g = new THREE.Group(), b = new Builder();
      b.push(F);
      b.add(torus(0.013, 0.0019, 16, 6), 'hard', { m: TR(0, -0.014, 0, 0, 0, 0, 0.75, 1.25, 1), c: C.steel, r: 0.25, mt: 1 });
      b.add(rbox(0.036, 0.024, 0.0016, 0.004), 'clear', { m: TR(0, -0.042, 0), c: 0xeef6fb, a: 0.22, r: 0.08 });
      b.add(rbox(0.126, 0.226, 0.038, 0.018, 3), 'clear', { m: TR(0, -0.165, 0), c: 0xeef6fb, a: 0.09, r: 0.07 });
      b.add(plate(0.105, 0.19), 'decal', { m: TR(0, -0.158, 0.0195), uv: { rect: AT.add('saline', 280, 504, salineArt) }, r: 0.3 });
      b.add(cyl(0.0052, 0.0052, 0.022, 10), 'tubing', { m: TR(-0.022, -0.288, 0), c: 0xeef6fb, a: 0.4, r: 0.1 }); b.add(cyl(0.0058, 0.0058, 0.02, 10), 'hard', { m: TR(0.026, -0.286, 0), c: 0x2a62b8, r: 0.45 });
      // spike, drip chamber with its pool, the line and roller clamp
      b.add(cyl(0.0042, 0.0034, 0.02, 10), 'hard', { m: TR(-0.022, -0.305, 0), c: 0xe9ecee, r: 0.45 }); b.add(cyl(0.0092, 0.0092, 0.052, 14), 'tubing', { m: TR(-0.022, -0.34, 0), c: 0xf4f9fc, a: 0.22, r: 0.07 }); b.add(cyl(0.0082, 0.0082, 0.021, 14), 'tubing', { m: TR(-0.022, -0.355, 0), c: 0xbcdaf0, a: 0.5, r: 0.06 }); b.add(cyl(0.0035, 0.0092, 0.008, 12), 'hard', { m: TR(-0.022, -0.37, 0), c: 0xe9ecee, r: 0.45 });
      if (pressure) { // pressure infusor: backing bladder, net front, bulb and gauge
        b.add(rbox(0.142, 0.24, 0.012, 0.006), 'fabric', { m: TR(0, -0.165, -0.024), c: 0x1d2c44, r: 0.9 });
        for (let i = 0; i < 9; i++) b.add(box(0.132, 0.0016, 0.0008), 'fuzz', { m: TR(0, -0.064 - i * 0.0252, 0.0202), c: 0xd9d9d0, r: 0.9 }); for (let i = 0; i < 6; i++) b.add(box(0.0016, 0.226, 0.0008), 'fuzz', { m: TR(-0.06 + i * 0.024, -0.165, 0.0206), c: 0xd9d9d0, r: 0.9 }); for (const y of [-0.054, -0.276]) b.add(box(0.136, 0.007, 0.0012), 'fabric', { m: TR(0, y, 0.0204), c: 0x1d2c44, r: 0.9 });
        b.add(tube([V3(0.066, -0.1, -0.022), V3(0.088, -0.13, -0.01), V3(0.09, -0.19, 0), V3(0.086, -0.225, 0.004)], 0.0026, 6, 10), 'hard', { c: 0x2b2e32, r: 0.6 });
        b.add(sph(1, 14, 10), 'hard', { m: TR(0.086, -0.25, 0.004, 0, 0, 0, 0.021, 0.032, 0.021), c: 0x5d6268, r: 0.8 }); b.add(cyl(0.013, 0.013, 0.012, 16), 'hard', { m: TR(0.09, -0.135, 0.004, H, 0, 0), c: 0x17181a, r: 0.5 }); b.add(disc(0.0118, 16), 'label', { m: TR(0.09, -0.135, 0.0102), uv: { rect: AT.rect('gauge') }, r: 0.5 }); }
      b.pop();
      const s0 = V3(-0.022, -0.374, 0).applyMatrix4(F), pts = rope(s0, to.p, { r: 0.0017, da: V3(0, -1, 0), db: to.d, slack: 1.28 }); cord(b, pts, 0.0017, 0xeaf3f8, { mat: 'tubing', a: 0.45, rough: 0.08, rs: 6 });
      { const i = Math.min(5, pts.length - 2), dd = pts[i + 1].clone().sub(pts[i]).normalize(); b.push(frame(pts[i], dd, out)); b.add(rbox(0.014, 0.011, 0.034, 0.003), 'hard', { c: 0xe9ecee, r: 0.5 }); b.add(cyl(0.0058, 0.0058, 0.008, 12), 'hard', { m: TR(0, 0.004, 0.004, 0, 0, H), c: 0x2a62b8, r: 0.5 }); b.pop(); }
      b.build({ into: g });
      // the fluid itself: its level follows what is left in the bag
      const fb = new Builder(); fb.add(rbox(0.117, 0.212, 0.03, 0.014, 3), 'tubing', { m: TR(0, 0.106, 0), c: 0xcfe6f7, a: 0.3, r: 0.04 }); const fluid = fb.build(); fluid.applyMatrix4(F.clone().multiply(TR(0, -0.272, 0))); g.add(fluid);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), K.dropMat || (K.dropMat = new THREE.MeshStandardMaterial({ color: 0xd8ecf8, roughness: 0.05, transparent: true, opacity: 0.85 }))); drop.userData.noAO = true; g.add(drop);
      let level = 1, ph = 0; const d0 = V3(-0.022, -0.318, 0).applyMatrix4(F);
      g.userData.tick = (dt, time, p, breath, f, fmax) => { if (f) level = clamp(f.left / Math.max(fmax, 1)); fluid.scale.y = 0.05 + 0.95 * level; ph = (ph + dt * (f ? (f.pressure ? 5 : 2.2) : 0)) % 1; drop.visible = !!f; drop.position.copy(d0); drop.position.y -= ph * ph * 0.028; };
      g.userData.tick(0, 0, null, 0, null, 1); return g;
    },
    // ------------------------------------------------------------ used and put down by the bag
    glucometer(val) {
      const b = new Builder(), text = val < 20 ? 'LO' : val > 500 ? 'HI' : String(val);
      b.push(TR(-0.07, 0, 0.0, 0, 0.5, 0));
      b.add(rbox(0.054, 0.015, 0.094, 0.007, 3), 'hard', { m: TR(0, 0.0075, 0), c: 0x23406b, r: 0.45 }); b.add(rbox(0.046, 0.002, 0.046, 0.003), 'hard', { m: TR(0, 0.0152, -0.014), c: 0x0c0d0f, r: 0.25 });
      b.add(plate(0.04, 0.03), 'label', { m: TR(0, 0.0164, -0.014, -H, 0, 0), uv: { rect: AT.dyn('bgl', 3, text, 160, 120, (g, w, h) => { g.fillStyle = '#b9c7b0'; g.fillRect(0, 0, w, h); txt(g, text, w * 0.62, h * 0.52, h * 0.62, { c: '#1a2118', w: 800, al: 'center' }); txt(g, 'mg/dL', w * 0.96, h * 0.86, h * 0.14, { c: '#1a2118', al: 'right' }); txt(g, clock(0).slice(0, 2) + ':' + clock(0).slice(2), w * 0.04, h * 0.14, h * 0.14, { c: '#1a2118', al: 'left' }); }) }, r: 0.3 });
      for (const x of [-0.012, 0.012]) b.add(cyl(0.006, 0.006, 0.002, 12), 'hard', { m: TR(x, 0.0155, 0.028), c: 0xd9dcdf, r: 0.5 });
      b.add(rbox(0.0062, 0.0008, 0.034, 0.0003), 'hard', { m: TR(0, 0.009, -0.06), c: 0xf2f2ee, r: 0.5 }); b.add(rbox(0.004, 0.001, 0.005, 0.0003), 'hard', { m: TR(0, 0.0092, -0.074), c: 0x8c1512, r: 0.4 });
      b.pop();
      b.add(cyl(0.0045, 0.0045, 0.036, 10), 'hard', { m: TR(-0.02, 0.0045, 0.075, 0, 0.4, H), c: 0x3d8fd4, r: 0.45 }); b.add(cyl(0.0048, 0.0048, 0.008, 10), 'hard', { m: TR(-0.036, 0.0048, 0.068, 0, 0.4, H), c: 0xe9ecee, r: 0.45 });
      b.add(rbox(0.05, 0.0012, 0.05, 0.0005), 'hard', { m: TR(-0.12, 0.001, 0.07, 0, 0.3, 0), c: 0xf4f4f0, r: 0.6 }); b.add(rbox(0.036, 0.0013, 0.014, 0.0003), 'hard', { m: TR(-0.12, 0.0011, 0.07, 0, 0.3, 0), c: 0x2a62b8, r: 0.6 });
      return onFloor(b);
    },
    torch() {
      const b = new Builder(); b.push(TR(0.035, 0.0062, 0.085, 0, -0.5, H));
      b.add(cyl(0.006, 0.006, 0.105, 14), 'hard', { c: 0xeeeeea, r: 0.4 }); b.add(cyl(0.0064, 0.0052, 0.016, 14), 'hard', { m: TR(0, 0.06, 0), c: 0x17181a, r: 0.5 }); b.add(cyl(0.0062, 0.0062, 0.01, 14), 'hard', { m: TR(0, -0.056, 0), c: 0x2a62b8, r: 0.5 });
      b.add(rbox(0.004, 0.05, 0.0012, 0.0005), 'hard', { m: TR(0, -0.03, 0.0068), c: C.steel, r: 0.25, mt: 1 });
      b.add(cyl(0.00615, 0.00615, 0.06, 12, true, 0, 2.2), 'label', { m: TR(0, 0.012, 0, 0, 2.2, 0), uv: { rect: AT.add('torch', 60, 200, (g, w, h) => { g.fillStyle = '#eeeeea'; g.fillRect(0, 0, w, h); for (let i = 0; i < 7; i++) { circ(g, w / 2, 18 + i * 24, 2.5 + i * 1.4, '#111'); } g.save(); g.translate(w * 0.86, h / 2); g.rotate(H); txt(g, 'PUPIL GAUGE mm', 0, 0, 9, { c: '#111' }); g.restore(); }) }, r: 0.4 });
      b.pop(); return onFloor(b);
    },
    syringes(list) {
      const b = new Builder(); let k = 0;
      for (const d of list) { if (!/^(IV|IO|IM|IN|INF)$/.test(d.route || 'IV')) continue; const name = String(d.name || 'drug'), cls = DRUG_CLASS.find(c => c[0].test(name.toLowerCase())) || [0, '#ffffff', '#111'];
        b.push(TR(0.01 + (k % 2) * 0.012, 0.0086, -0.03 - k * 0.026, 0, 0.2 + (k * 37 % 7) * 0.09 - 0.3, H));
        b.add(cyl(0.0082, 0.0082, 0.074, 14), 'tubing', { c: 0xf0f6f9, a: 0.3, r: 0.08 }); b.add(cyl(0.0088, 0.0088, 0.002, 14), 'tubing', { m: TR(0, -0.037, 0, 0, 0, 0, 1.5, 1, 1), c: 0xf0f6f9, a: 0.5, r: 0.08 });
        b.add(cyl(0.0074, 0.0074, 0.007, 12), 'hard', { m: TR(0, 0.028, 0), c: 0x17181a, r: 0.6 }); b.add(cyl(0.0034, 0.0034, 0.07, 8), 'hard', { m: TR(0, -0.008, 0), c: 0xe9ecee, r: 0.5 }); b.add(cyl(0.008, 0.008, 0.002, 12), 'hard', { m: TR(0, -0.044, 0), c: 0xe9ecee, r: 0.5 });
        b.add(cyl(0.0022, 0.0034, 0.01, 8), 'hard', { m: TR(0, 0.042, 0), c: 0xe9ecee, r: 0.45 });
        b.add(cyl(0.0084, 0.0084, 0.04, 12, true, 0, 2.6), 'label', { m: TR(0, 0.004, 0, 0, 0.3, 0), uv: { rect: AT.dyn('drug', 10, name + d.amt + d.route, 100, 180, (g, w, h) => { g.fillStyle = cls[1]; g.fillRect(0, 0, w, h); if (/nalox|flumaz/.test(name)) { g.strokeStyle = '#1c5fa8'; g.lineWidth = 7; for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h * 0.5, h); g.stroke(); } g.fillStyle = '#fff'; g.fillRect(w * 0.2, 0, w * 0.6, h); }
          g.save(); g.translate(w / 2, h / 2); g.rotate(-H); txt(g, name.slice(0, 12).toUpperCase(), 0, -8, 17, { c: cls[2], w: 800 }); txt(g, `${d.amt ?? ''} ${d.route || ''}`.trim(), 0, 14, 13, { c: cls[2], f: HAND }); g.restore(); }) }, r: 0.6 });
        b.pop(); if (++k >= 6) break; }
      if (!k) return null; return onFloor(b);
    },
    padWrapper() {
      const b = new Builder(), grid = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) grid.push(V3((c / 4 - 0.5) * 0.2, 0.004 + 0.003 * (1 + Math.sin(c * 1.3 + r)) + (c === 4 ? 0.014 * (r / 3) : 0), (r / 3 - 0.5) * 0.125));
      b.add(sheet(grid, 4, 5), 'label', { m: TR(0.08, 0, 0.2, 0, -0.5, 0), uv: { rect: AT.rect('padPouch') }, r: 0.3 });
      return onFloor(b);
    },
  };
}
