// The axe is a real rigid body. Your arms are a spring-damper pulling it toward the pose the
// mouse asks for, with limited strength, so it has weight: it lags, carries through, bites,
// sticks, glances off, and bounces back when you hit with the wrong part.
import * as THREE from 'three';

// Local frame: origin at the butt of the handle, +Y up the handle, +X toward the bit, +Z across the blade.
export const HEAD_Y = 0.79;
export const GRIP_LOCAL = new THREE.Vector3(0, 0.1, 0);      // bottom hand: where the arms pull
export const TOP_HAND_LOCAL = new THREE.Vector3(0, 0.31, 0);
export const REACH = 0.64;                                   // chest to bottom hand, arms straight
const K_PEN = 0.00013;    // metres of bite per joule of square, edge-first impact
const K_HOLD = 2600;      // newtons of grip the wood has per metre of bite
const EDGE = [[0.104, 0.708], [0.113, 0.746], [0.1175, 0.79], [0.113, 0.834], [0.104, 0.872]];
const SAMPLES = [
  ...EDGE.map(([x, y]) => ({ p: new THREE.Vector3(x, y, 0), kind: 'edge' })),
  { p: new THREE.Vector3(0.06, HEAD_Y + 0.035, 0), kind: 'cheek' },
  { p: new THREE.Vector3(0.06, HEAD_Y - 0.045, 0), kind: 'cheek' },
  { p: new THREE.Vector3(-0.036, HEAD_Y, 0), kind: 'poll' },
  { p: new THREE.Vector3(0, 0.66, 0), kind: 'handle' }, { p: new THREE.Vector3(0, 0.5, 0), kind: 'handle' },
  { p: new THREE.Vector3(0, 0.34, 0), kind: 'handle' }, { p: new THREE.Vector3(0, 0.18, 0), kind: 'handle' },
];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function massModel() {
  const pts = [[0.03, HEAD_Y, 0, 1.0], [0.09, HEAD_Y, 0, 0.12], [-0.028, HEAD_Y, 0, 0.13]];
  for (let i = 0; i < 8; i++) pts.push([0, 0.04 + i * 0.1, 0, 0.45 / 8]);
  let m = 0; const c = new THREE.Vector3();
  for (const [x, y, z, mm] of pts) { m += mm; c.x += x * mm; c.y += y * mm; c.z += z * mm; }
  c.divideScalar(m);
  let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
  for (const [x, y, z, mm] of pts) {
    const dx = x - c.x, dy = y - c.y, dz = z - c.z, s = 0.4 * mm * 0.025 * 0.025;
    xx += mm * (dy * dy + dz * dz) + s; yy += mm * (dx * dx + dz * dz) + s; zz += mm * (dx * dx + dy * dy) + s;
    xy -= mm * dx * dy; xz -= mm * dx * dz; yz -= mm * dy * dz;
  }
  const I = new THREE.Matrix3().set(xx, xy, xz, xy, yy, yz, xz, yz, zz);
  return { m, com: c, I, Iinv: I.clone().invert() };
}

function headGeometry() {
  const P = [[-0.036, 0.766], [0.0, 0.762], [0.04, 0.756], [0.07, 0.738], [0.094, 0.716], [0.106, 0.7], [0.113, 0.718], [0.1175, 0.75],
    [0.119, 0.79], [0.1175, 0.83], [0.113, 0.862], [0.108, 0.884], [0.09, 0.87], [0.062, 0.851], [0.036, 0.833], [0.0, 0.823], [-0.036, 0.819]];
  const thick = x => x <= 0.03 ? 0.05 : 0.004 + 0.046 * Math.pow(Math.max(0, 1 - (x - 0.03) / 0.089), 1.25);
  const tris = THREE.ShapeUtils.triangulateShape(P.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const pos = [], col = [], dark = new THREE.Color(0x30353a), bright = new THREE.Color(0xd2d8dd), c = new THREE.Color();
  const v = (x, y, z) => { pos.push(x, y, z); c.copy(dark).lerp(bright, smooth(0.086, 0.113, x)); col.push(c.r, c.g, c.b); };
  // Put each triangle down facing the way we want, whatever winding the triangulator chose.
  const face = (A, B, C, nz) => {
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const [b, cc] = (cross > 0) === (nz > 0) ? [B, C] : [C, B];
    for (const p of [A, b, cc]) v(p[0], p[1], nz * thick(p[0]) / 2);
  };
  for (const [a, b, d] of tris) { face(P[a], P[b], P[d], 1); face(P[a], P[b], P[d], -1); }
  const ccw = THREE.ShapeUtils.isClockWise(P.map(([x, y]) => new THREE.Vector2(x, y))) ? -1 : 1;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], t0 = thick(x0) / 2, t1 = thick(x1) / 2;
    if (ccw > 0) { v(x0, y0, t0); v(x0, y0, -t0); v(x1, y1, -t1); v(x0, y0, t0); v(x1, y1, -t1); v(x1, y1, t1); }
    else { v(x0, y0, t0); v(x1, y1, -t1); v(x0, y0, -t0); v(x0, y0, t0); v(x1, y1, t1); v(x1, y1, -t1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function grainTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#b8874f'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${90 + Math.random() * 40},${55 + Math.random() * 25},${25},${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 0.6 + Math.random() * 1.6; let x = Math.random() * 64;
    g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= 256; y += 16) { x += (Math.random() - 0.5) * 2; g.lineTo(x, y); } g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function buildMesh() {
  const group = new THREE.Group();
  const prof = [[0, 0], [0.017, 0.002], [0.0215, 0.018], [0.0205, 0.045], [0.0155, 0.11], [0.0142, 0.35], [0.0148, 0.6], [0.0165, 0.72], [0.0175, 0.8], [0.016, 0.842], [0, 0.846]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const hg = new THREE.LatheGeometry(prof, 14); hg.scale(1.3, 1, 0.82);
  const handle = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ map: grainTexture(), roughness: 0.55 }));
  const head = new THREE.Mesh(headGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.36 }));
  handle.castShadow = head.castShadow = true;
  group.add(handle, head);
  return group;
}

const _r = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _e = new THREE.Vector3(), _al = new THREE.Vector3(), _y = new THREE.Vector3(), _F = new THREE.Vector3(), _T = new THREE.Vector3();
const _Fa = new THREE.Vector3(), _Ta = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _vp = new THREE.Vector3();
const _J = new THREE.Vector3(), _vt = new THREE.Vector3(), _g = new THREE.Vector3(), _d = new THREE.Vector3(), _vh = new THREE.Vector3();
const _bx = new THREE.Vector3(), _zf = new THREE.Vector3(), _ey = new THREE.Vector3(), _pp = new THREE.Vector3(), _sp = new THREE.Vector3();
const _ui = new THREE.Vector3(), _wi = new THREE.Vector3(), _lat = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m4 = new THREE.Matrix4(), _m3a = new THREE.Matrix3(), _m3t = new THREE.Matrix3();

export class Axe {
  constructor(scene) {
    const mm = massModel();
    this.m = mm.m; this.comL = mm.com; this.Il = mm.I; this.IlInv = mm.Iinv;
    this.x = new THREE.Vector3(); this.v = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.w = new THREE.Vector3();
    this.xPrev = new THREE.Vector3(); this.qPrev = new THREE.Quaternion();
    this.Iw = new THREE.Matrix3(); this.IwInv = new THREE.Matrix3(); this.R = new THREE.Matrix3();
    this.samples = SAMPLES.map(s => ({ kind: s.kind, rel: s.p.clone().sub(this.comL), y: s.p.y }));
    this.gripRel = GRIP_LOCAL.clone().sub(this.comL);
    this.topRel = TOP_HAND_LOCAL.clone().sub(this.comL);
    this.headRel = new THREE.Vector3(0.06, HEAD_Y, 0).sub(this.comL);
    this.edgeRel = new THREE.Vector3(0.1175, HEAD_Y, 0).sub(this.comL);
    this.mode = 'held'; this.stuck = null; this.sleep = 0; this.effort = 0;
    this.F = new THREE.Vector3(); this.T = new THREE.Vector3(); this.reachJ = new THREE.Vector3();
    this.events = [];
    this.group = new THREE.Group();
    this.mesh = buildMesh(); this.mesh.position.copy(this.comL).negate();
    this.group.add(this.mesh); scene.add(this.group);
    this.renderX = new THREE.Vector3(); this.renderQ = new THREE.Quaternion();
  }

  emit(e) { this.events.push(e); }
  updateInertia() {
    this.R.setFromMatrix4(_m4.makeRotationFromQuaternion(this.q));
    _m3t.copy(this.R).transpose();
    this.Iw.multiplyMatrices(_m3a.multiplyMatrices(this.R, this.Il), _m3t);
    this.IwInv.multiplyMatrices(_m3a.multiplyMatrices(this.R, this.IlInv), _m3t);
  }
  toWorld(rel, out) { return out.copy(rel).applyQuaternion(this.q).add(this.x); }
  axisW(i, out) { return out.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(this.q); }
  pointVel(p, out) { _r.subVectors(p, this.x); return out.crossVectors(this.w, _r).add(this.v); }
  applyImpulse(J, p) {
    this.v.addScaledVector(J, 1 / this.m);
    _r.subVectors(p, this.x); _t.crossVectors(_r, J).applyMatrix3(this.IwInv); this.w.add(_t);
  }
  effMass(p, n) {
    _r.subVectors(p, this.x); _t.crossVectors(_r, n).applyMatrix3(this.IwInv); _u.crossVectors(_t, _r);
    return 1 / (1 / this.m + n.dot(_u));
  }
  // Rendered pose (the stuck axe flexes a little in the wood) and points on it.
  renderPoint(rel, out) { return out.copy(rel).applyQuaternion(this.renderQ).add(this.renderX); }

  place(com, q) { this.x.copy(com); this.q.copy(q); this.v.set(0, 0, 0); this.w.set(0, 0, 0); this.mode = 'held'; this.stuck = null; this.sync(); }

  // What the arms do to the axe this substep: force at the centre of mass and a couple.
  drive(tgt, Fa, Ta) {
    const wn = tgt.wn, c = 2 * tgt.zeta * wn;
    // tgt.err is how far the axe is from where the mouse wants it, measured around the arc.
    _a.copy(tgt.err).multiplyScalar(wn * wn);
    _a.add(_b.subVectors(tgt.vff, this.v).multiplyScalar(c));
    if (_a.length() > tgt.aMax) _a.setLength(tgt.aMax);
    this.effort = _a.length() / 95;
    // Keeping it on the arc at speed is tension in straight arms, not muscle.
    _r.subVectors(this.x, tgt.chest); const rr = _r.length();
    if (rr > 0.05) { _r.divideScalar(rr); const vr = this.v.dot(_r); _a.addScaledVector(_r, -Math.min(500, Math.max(0, this.v.lengthSq() - vr * vr) / rr)); }
    Fa.copy(_a).multiplyScalar(this.m); Fa.y += 9.81 * this.m * tgt.grav;
    _q.copy(tgt.q).multiply(_qi.copy(this.q).invert());
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const sh = Math.hypot(_q.x, _q.y, _q.z), ang = 2 * Math.atan2(sh, _q.w);
    _e.set(_q.x, _q.y, _q.z).multiplyScalar(sh > 1e-9 ? ang / sh : 2);
    _al.copy(_e).multiplyScalar(wn * wn).add(_b.subVectors(tgt.angVel, this.w).multiplyScalar(c));
    // The wrists roll the blade more slowly than the arms swing it.
    this.axisW(1, _y);
    const roll = _al.dot(_y); _al.addScaledVector(_y, -roll);
    if (_al.length() > tgt.alphaMax) _al.setLength(tgt.alphaMax);
    _al.addScaledVector(_y, Math.max(-tgt.rollMax, Math.min(tgt.rollMax, roll)));
    _t.copy(this.w).applyMatrix3(this.Iw); Ta.crossVectors(this.w, _t);
    Ta.add(_t.copy(_al).applyMatrix3(this.Iw));
    this.F.copy(Fa); this.T.copy(Ta);
  }

  step(h, tgt, env) {
    this.updateInertia();
    if (this.mode === 'stuck') { this.stepStuck(h, tgt); return; }
    if (this.mode === 'free' && this.sleep > 0.4) { this.F.set(0, 0, 0); this.T.set(0, 0, 0); return; }
    this.xPrev.copy(this.x); this.qPrev.copy(this.q);
    _F.set(0, -9.81 * this.m, 0); _T.set(0, 0, 0);
    if (this.mode === 'held') { this.drive(tgt, _Fa, _Ta); _F.add(_Fa); _T.add(_Ta); }
    else { this.F.set(0, 0, 0); this.T.set(0, 0, 0); }
    this.v.addScaledVector(_F, h / this.m);
    _t.copy(this.w).applyMatrix3(this.Iw); _u.crossVectors(this.w, _t);
    this.w.addScaledVector(_t.subVectors(_T, _u).applyMatrix3(this.IwInv), h);
    this.v.multiplyScalar(1 - 0.25 * h); this.w.multiplyScalar(1 - 0.5 * h);
    this.x.addScaledVector(this.v, h);
    _q2.set(this.w.x * h * 0.5, this.w.y * h * 0.5, this.w.z * h * 0.5, 0).multiply(this.q);
    this.q.set(this.q.x + _q2.x, this.q.y + _q2.y, this.q.z + _q2.z, this.q.w + _q2.w).normalize();
    this.updateInertia();
    if (this.mode === 'held') this.reach(tgt);
    this.collide(h, tgt, env);
    if (this.mode === 'free') this.sleep = (this.v.lengthSq() < 0.01 && this.w.lengthSq() < 0.05 && this.x.y < 0.2) ? this.sleep + h : 0;
  }

  // Arms are bones: once they are straight the hands cannot be pulled any further from the chest.
  reach(tgt) {
    const G = this.toWorld(this.gripRel, _g);
    _d.subVectors(G, tgt.chest); const dist = _d.length();
    if (dist <= REACH) return;
    _d.divideScalar(dist);
    this.x.addScaledVector(_d, -(dist - REACH)); G.addScaledVector(_d, -(dist - REACH));
    const vg = this.pointVel(G, _vp).dot(_d);
    if (vg > 0) {
      _J.copy(_d).multiplyScalar(-vg * this.effMass(G, _d));
      this.applyImpulse(_J, G); this.reachJ.sub(_J);
    }
  }

  // Every sample point is checked against the ground, standing wood and fallen logs, a few passes
  // per substep, so pushing one point out of the wood can't leave another one in it unnoticed.
  collide(h, tgt, env) {
    for (let pass = 0; pass < 3; pass++) {
      let hit = false;
      for (const s of this.samples) {
        const p = this.toWorld(s.rel, _p);
        if (p.y < 0) { this.groundContact(s, p, tgt); if (this.mode === 'stuck') return; hit = true; continue; }
        const prev = _pp.copy(s.rel).applyQuaternion(this.qPrev).add(this.xPrev);
        for (const tree of env.trees) {
          let inside = tree.solidAt(p.x, p.y, p.z);
          if (!inside && pass === 0) {
            // A fast point can hop over thin wood in one substep: look halfway along its move too.
            _sp.lerpVectors(prev, p, 0.5);
            if (tree.solidAt(_sp.x, _sp.y, _sp.z)) { this.x.add(_tmp.subVectors(_sp, p)); p.copy(_sp); inside = true; }
          }
          if (inside) {
            this.woodContact(s, p, prev, tree, tgt);
            if (this.mode === 'stuck') return;
            hit = true; break;
          }
          if (tree.state !== 'standing') {
            const pen = tree.logContact(p, _n);
            if (pen > 0) { this.x.addScaledVector(_n, pen); this.hitSurface(s, p, _n, null, tgt, 0.2, pass === 0); hit = true; break; }
          }
        }
      }
      if (!hit) break;
    }
  }

  woodContact(s, p, prev, tree, tgt) {
    const n = tree.normalAt(p.x, p.y, p.z, _n);
    const vp = this.pointVel(p, _vp);
    const fresh = !tree.solidAt(prev.x, prev.y, prev.z);
    if (fresh && s.kind === 'edge' && this.mode === 'held' && vp.dot(this.axisW(0, _bx)) > 1.2 && this.chop(p, vp, n, tree, tgt, s)) return;
    // Push it straight back out of the wood along the surface normal, then take away the speed into it.
    let d = 0;
    while (d < 0.05 && tree.solidAt(p.x + n.x * d, p.y + n.y * d, p.z + n.z * d)) d += 0.003;
    this.x.addScaledVector(n, d + 0.001); p.addScaledVector(n, d + 0.001);
    this.hitSurface(s, p, n, tree, tgt, s.kind === 'handle' ? 0.3 : 0.2, fresh);
  }

  // Is any part of the axe inside this tree's wood (or, with no tree, under the ground)?
  embedded(tree) {
    for (const s of this.samples) {
      const p = this.toWorld(s.rel, _p);
      if (tree ? tree.solidAt(p.x, p.y, p.z) : p.y < 0) return true;
    }
    return false;
  }

  hitSurface(s, p, n, tree, tgt, rest, report = true) {
    const vp = this.pointVel(p, _vp), vn = vp.dot(n);
    if (vn >= 0) return;
    const me = this.effMass(p, n);
    if (report && vn < -1.5) this.emit({ type: s.kind === 'edge' ? 'glance' : s.kind, energy: 0.5 * me * vn * vn, speed: -vn, tree, point: p.clone(), normal: n.clone() });
    _J.copy(n).multiplyScalar(-(1 + rest) * vn * me);
    _vt.copy(vp).addScaledVector(n, -vn); const vt = _vt.length();
    if (vt > 1e-4) { _vt.divideScalar(vt); _J.addScaledVector(_vt, -Math.min(0.35 * _J.length(), vt * this.effMass(p, _vt))); }
    this.applyImpulse(_J, p);
  }

  // The edge met wood fast enough to matter. Returns true if the axe bit in and stuck.
  chop(p, vp, n, tree, tgt, s) {
    const speed = vp.length();
    _vh.copy(vp).divideScalar(speed);
    const b = this.axisW(0, _bx), zf = this.axisW(2, _zf), ey = this.axisW(1, _ey);
    // Near the bark the bit has to point into the trunk; deep in a notch the notch steers it.
    const rho = Math.hypot(p.x - tree.x, p.z - tree.z), deep = rho < 0.75 * tree.radiusAt(p.y);
    const align = _vh.dot(b), into = deep ? 1 : -b.dot(n), flat = Math.abs(_vh.dot(zf)), speedIn = Math.max(0, vp.dot(b));
    const E = 0.5 * (this.effMass(p, b) + 0.5 * tgt.strength) * speedIn * speedIn;
    // A shallow entry (straight down an upright trunk) still bites, just not as deep.
    const q = smooth(0.42, 0.88, align) * smooth(-0.05, 0.32, into);
    const depth = Math.min(0.06, K_PEN * E * q);
    const info = { type: 'glance', energy: E, speed, speedIn, depth: 0, quality: q, align, tree, point: p.clone(), normal: n.clone() };
    if (q < 0.22) { info.type = flat > 0.55 ? 'flat' : 'glance'; this.emit(info); return false; }
    // Where exactly the edge met the wood: bisect between last substep and this one.
    const prev = _pp.copy(s.rel).applyQuaternion(this.qPrev).add(this.xPrev);
    let hi = 1;
    if (!tree.solidAt(prev.x, prev.y, prev.z)) {
      let lo = 0;
      for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; _sp.lerpVectors(prev, p, m); if (tree.solidAt(_sp.x, _sp.y, _sp.z)) hi = m; else lo = m; }
    } else hi = 0;
    const surf = new THREE.Vector3().lerpVectors(prev, p, hi);
    _ui.copy(b).add(_vh).normalize(); _ui.addScaledVector(ey, -_ui.dot(ey)).normalize(); _wi.crossVectors(ey, _ui);
    info.surf = surf; info.u = _ui.clone();
    if (depth < 0.005) {
      if (depth > 0.002) tree.carve(surf, ey, _ui, _wi, depth, s.y);
      info.type = 'tap'; info.depth = depth; this.emit(info); return false;
    }
    const removed = tree.carve(surf, ey, _ui, _wi, depth, s.y);
    info.depth = depth; info.removed = removed;
    if (!removed) { info.type = 'nowood'; this.emit(info); return false; }
    info.type = 'bite';
    // Bury the edge point `depth` into the cut and freeze it there.
    this.x.add(_tmp.copy(surf).addScaledVector(_ui, depth * 0.85).sub(p));
    this.v.set(0, 0, 0); this.w.set(0, 0, 0);
    this.mode = 'stuck';
    this.stuck = { tree, depth, hold: K_HOLD * depth * (0.6 + 0.6 * q), hold0: 0, u: _ui.clone(), e: ey.clone(), wv: _wi.clone(), wsgn: 0, t: 0, x: this.x.clone(), q: this.q.clone(), strain: 0, bite: surf.clone(), flex: 0, flex2: 0 };
    this.stuck.hold0 = this.stuck.hold;
    this.emit(info);
    return true;
  }

  groundContact(s, p, tgt) {
    _n.set(0, 1, 0);
    const vp = this.pointVel(p, _vp), vn = vp.y;
    if (s.kind === 'edge' && this.mode === 'held' && vn < -3.5) {
      const b = this.axisW(0, _bx);
      if (vp.dot(b) / vp.length() > 0.7) {
        const E = 0.5 * this.effMass(p, _n) * vn * vn, depth = Math.min(0.05, 0.00018 * E);
        this.x.y += -depth - p.y; this.v.set(0, 0, 0); this.w.set(0, 0, 0); this.mode = 'stuck';
        this.stuck = { tree: null, depth, hold: 1600 * depth + 25, u: b.clone(), e: this.axisW(1, _ey).clone(), wv: this.axisW(2, _zf).clone(), wsgn: 0, t: 0, x: this.x.clone(), q: this.q.clone(), strain: 0, bite: p.clone(), flex: 0, flex2: 0 };
        this.stuck.hold0 = this.stuck.hold;
        this.emit({ type: 'dirt', energy: E, stuck: true, point: p.clone() });
        return;
      }
    }
    this.x.y -= p.y;
    if (this.mode === 'free') {
      this.hitSurface(s, p, _n, null, tgt, 0.2, false);
      if (vn < -2) this.emit({ type: 'clatter', energy: 0.5 * this.m * vn * vn, point: p.clone() });
      return;
    }
    this.hitSurface(s, p, _n, null, tgt, 0.12, false);
    if (vn < -2) this.emit({ type: 'dirt', energy: 0.5 * this.effMass(p, _n) * vn * vn, stuck: false, point: p.clone() });
  }

  // Stuck in the wood (or dirt): it stays put until your arms win.
  stepStuck(h, tgt) {
    const st = this.stuck; st.t += h;
    this.x.copy(st.x); this.q.copy(st.q); this.v.set(0, 0, 0); this.w.set(0, 0, 0);
    this.drive(tgt, _Fa, _Ta);
    const along = _Fa.dot(st.u), pull = Math.max(0, -along);
    _lat.copy(_Fa).addScaledVector(st.u, -along);
    const side = _Fa.dot(st.wv);
    const effort = pull + 0.45 * _lat.length() + 2 * _Ta.length();
    // Rocking it side to side works the bite loose.
    if (Math.abs(side) > 28 && Math.sign(side) !== st.wsgn) {
      if (st.wsgn !== 0) { st.hold *= 0.84; this.emit({ type: 'wiggle' }); }
      st.wsgn = Math.sign(side);
    }
    // Any steady pull works it loose in the end; tensing just gets it out sooner.
    if (effort > 0.2 * st.hold) st.hold -= effort * h * 0.9;
    st.strain = Math.min(1.5, effort / Math.max(1, st.hold));
    st.flex += (Math.max(-1, Math.min(1, side / 220)) * 0.045 - st.flex) * Math.min(1, h * 30);
    st.flex2 += (Math.max(-1, Math.min(1, _lat.dot(st.e) / 260)) * 0.035 - st.flex2) * Math.min(1, h * 30);
    if (effort > st.hold) this.release(Math.min(3.5, 0.8 + (effort - st.hold) / 120), true);
    else if (st.tree && st.tree.state !== 'standing' && st.bite.y >= st.tree.breakH) this.release(2.5, false);
  }

  release(speed, yank) {
    const st = this.stuck; if (!st) return;
    this.mode = 'held'; this.stuck = null;
    // Slide it back out along the bite until no part of the head is left in the wood.
    this.x.addScaledVector(st.u, -0.004);
    for (let i = 0; i < 20 && this.embedded(st.tree); i++) this.x.addScaledVector(st.u, -0.005);
    this.v.copy(st.u).multiplyScalar(-speed); this.w.set(0, 0, 0);
    if (yank) this.emit({ type: 'yank', tree: st.tree, depth: st.depth });
  }

  drop() {
    if (this.stuck) this.release(0.5, false);
    this.mode = 'free'; this.sleep = 0;
    this.emit({ type: 'dropped' });
  }

  sync() {
    if (this.mode === 'stuck') {
      const st = this.stuck;
      _q2.setFromAxisAngle(st.e, st.flex).multiply(_q.setFromAxisAngle(st.wv, st.flex2));
      this.renderQ.copy(_q2).multiply(this.q);
      this.renderX.copy(this.x).sub(st.bite).applyQuaternion(_q2).add(st.bite);
    } else { this.renderQ.copy(this.q); this.renderX.copy(this.x); }
    this.group.position.copy(this.renderX); this.group.quaternion.copy(this.renderQ);
  }
}
