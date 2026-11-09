// Ball physics. The ball is the only dynamic body, so this is a small hand-rolled solver: a sphere
// against oriented boxes, vertical cylinders and spheres, some of them kinematic (windmill sails,
// sweepers, geese, lifts). Substeps scale with ball speed so a 40 m/s drive can't tunnel.
import * as THREE from 'three';

export const G = 11;          // a touch more than Earth so the cartoon world feels snappy
export const BALL_R = 0.09;

// roll: rolling resistance as a fraction of g. e: restitution. slide: Coulomb friction on impact.
export const SURF = {
  fairway: { roll: 0.24, e: 0.36, slide: 0.32 },
  tee: { roll: 0.24, e: 0.36, slide: 0.32 },
  green: { roll: 0.1, e: 0.2, slide: 0.32 },
  rough: { roll: 0.65, e: 0.16, slide: 0.6 },
  sand: { roll: 2.4, e: 0.03, slide: 0.95 },
  wood: { roll: 0.11, e: 0.45, slide: 0.25 },
  stone: { roll: 0.15, e: 0.55, slide: 0.3 },
  rock: { roll: 0.2, e: 0.5, slide: 0.35 },
  metal: { roll: 0.08, e: 0.5, slide: 0.15 },
  belt: { roll: 0.25, e: 0.2, slide: 0.5 },
  rubber: { roll: 0.2, e: 0.9, slide: 0.15, kick: 7 },
  mushroom: { roll: 0.2, e: 0.85, slide: 0.12, launch: 13.5 },
  goose: { roll: 0.2, e: 0.6, slide: 0.2, kick: 3 },
  pin: { roll: 0.2, e: 0.25, slide: 0.1 },
};

const _v = new THREE.Vector3(), _l = new THREE.Vector3(), _q = new THREE.Vector3(), _n = new THREE.Vector3();
const _c = new THREE.Vector3(), _vc = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);

export class Collider {
  // kind: 'box' (half: Vector3) | 'cyl' (vertical, r, hh) | 'sph' (r)
  constructor(kind, o = {}) {
    this.kind = kind;
    this.pos = o.pos ? o.pos.clone() : new THREE.Vector3();
    this.quat = o.quat ? o.quat.clone() : new THREE.Quaternion();
    this.half = o.half ? o.half.clone() : new THREE.Vector3(0.5, 0.5, 0.5);
    this.r = o.r ?? 0.5; this.hh = o.hh ?? 0.5;
    this.surf = o.surf || 'fairway';
    this.tag = o.tag || null;
    this.belt = o.belt || null;          // world velocity of a conveyor surface
    this.motion = o.motion || null;      // (t, collider) => sets pos/quat
    this.hole = o.hole ?? -1;
    this.enabled = true;
    this.mat = new THREE.Matrix4(); this.inv = new THREE.Matrix4();
    this.prevInv = new THREE.Matrix4(); this.delta = new THREE.Matrix4(); this.h = 1 / 240;
    this.aabb = new THREE.Box3();
    this.update();
    this.prevInv.copy(this.inv);
  }
  update() {
    this.mat.compose(this.pos, this.quat, ONE);
    this.inv.copy(this.mat).invert();
    if (this.kind === 'box') {
      const e = new THREE.Matrix3().setFromMatrix4(this.mat).elements, h = this.half;
      const ex = Math.abs(e[0]) * h.x + Math.abs(e[3]) * h.y + Math.abs(e[6]) * h.z;
      const ey = Math.abs(e[1]) * h.x + Math.abs(e[4]) * h.y + Math.abs(e[7]) * h.z;
      const ez = Math.abs(e[2]) * h.x + Math.abs(e[5]) * h.y + Math.abs(e[8]) * h.z;
      this.aabb.min.set(this.pos.x - ex, this.pos.y - ey, this.pos.z - ez);
      this.aabb.max.set(this.pos.x + ex, this.pos.y + ey, this.pos.z + ez);
    } else if (this.kind === 'cyl') {
      this.aabb.min.set(this.pos.x - this.r, this.pos.y - this.hh, this.pos.z - this.r);
      this.aabb.max.set(this.pos.x + this.r, this.pos.y + this.hh, this.pos.z + this.r);
    } else {
      this.aabb.min.set(this.pos.x - this.r, this.pos.y - this.r, this.pos.z - this.r);
      this.aabb.max.set(this.pos.x + this.r, this.pos.y + this.r, this.pos.z + this.r);
    }
  }
  step(t, h) {
    this.prevInv.copy(this.inv);
    this.motion(t, this);
    this.update();
    this.h = h;
    this.delta.multiplyMatrices(this.mat, this.prevInv);
  }
  // Velocity of the collider's surface at world point p.
  pointVel(p, out) {
    out.set(0, 0, 0);
    if (this.motion) out.copy(p).applyMatrix4(this.delta).sub(p).divideScalar(this.h);
    if (this.belt) out.add(this.belt);
    return out;
  }
  // Closest-feature contact with a sphere. Returns depth (>0) and writes normal + contact point.
  contact(p, R, nOut, cOut) {
    if (this.kind === 'box') {
      _l.copy(p).applyMatrix4(this.inv);
      const h = this.half;
      _q.set(THREE.MathUtils.clamp(_l.x, -h.x, h.x), THREE.MathUtils.clamp(_l.y, -h.y, h.y), THREE.MathUtils.clamp(_l.z, -h.z, h.z));
      _n.subVectors(_l, _q);
      let d = _n.length(), depth;
      if (d > R) return 0;
      if (d > 1e-7) { _n.divideScalar(d); depth = R - d; }
      else {
        const px = h.x - Math.abs(_l.x), py = h.y - Math.abs(_l.y), pz = h.z - Math.abs(_l.z);
        if (py <= px && py <= pz) { _n.set(0, Math.sign(_l.y) || 1, 0); depth = py + R; }
        else if (px <= pz) { _n.set(Math.sign(_l.x) || 1, 0, 0); depth = px + R; }
        else { _n.set(0, 0, Math.sign(_l.z) || 1); depth = pz + R; }
      }
      nOut.copy(_n).applyQuaternion(this.quat);
      cOut.copy(_q).applyMatrix4(this.mat);
      return depth;
    }
    if (this.kind === 'cyl') {
      _l.subVectors(p, this.pos);
      const rad = Math.hypot(_l.x, _l.z);
      const cy = THREE.MathUtils.clamp(_l.y, -this.hh, this.hh);
      const cr = Math.min(rad, this.r);
      const sx = rad > 1e-7 ? _l.x / rad : 1, sz = rad > 1e-7 ? _l.z / rad : 0;
      _q.set(sx * cr, cy, sz * cr);
      _n.subVectors(_l, _q);
      let d = _n.length(), depth;
      if (d > R) return 0;
      if (d > 1e-7) { _n.divideScalar(d); depth = R - d; }
      else {
        const pTop = this.hh - Math.abs(_l.y), pSide = this.r - rad;
        if (pTop < pSide) { _n.set(0, Math.sign(_l.y) || 1, 0); depth = pTop + R; }
        else { _n.set(sx, 0, sz); depth = pSide + R; }
      }
      nOut.copy(_n); cOut.copy(_q).add(this.pos);
      return depth;
    }
    _n.subVectors(p, this.pos);
    const d = _n.length();
    if (d > R + this.r) return 0;
    if (d > 1e-7) _n.divideScalar(d); else _n.set(0, 1, 0);
    nOut.copy(_n); cOut.copy(this.pos).addScaledVector(_n, this.r);
    return R + this.r - d;
  }
  // Ray hit distance (ray origin o, unit dir d), or Infinity.
  ray(o, d, maxT = 1e9) {
    if (this.kind === 'box') {
      _l.copy(o).applyMatrix4(this.inv);
      _t.copy(d).applyQuaternion(_qi.copy(this.quat).invert());
      let t0 = 0, t1 = maxT;
      for (const a of ['x', 'y', 'z']) {
        const h = this.half[a];
        if (Math.abs(_t[a]) < 1e-9) { if (Math.abs(_l[a]) > h) return Infinity; continue; }
        let ta = (-h - _l[a]) / _t[a], tb = (h - _l[a]) / _t[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) return Infinity;
      }
      return t0;
    }
    if (this.kind === 'cyl' && Math.abs(d.y) > 0.99) {
      const dx = o.x - this.pos.x, dz = o.z - this.pos.z;
      if (dx * dx + dz * dz > this.r * this.r) return Infinity;
      const top = this.pos.y + this.hh * Math.sign(-d.y);
      const t = (top - o.y) / d.y;
      return t >= 0 && t <= maxT ? t : Infinity;
    }
    return Infinity;
  }
}
const _qi = new THREE.Quaternion();

export class World {
  constructor() {
    this.cols = []; this.movers = []; this.zones = []; this.t = 0;
    this.onContact = null; // (collider, normalSpeed, point) for sounds and special triggers
  }
  add(c) { this.cols.push(c); if (c.motion) this.movers.push(c); return c; }
  // First collider hit straight down from (x, y, z). Returns {y, col} or null.
  groundAt(x, y, z, maxDrop = 200) {
    _c.set(x, y, z); _v.set(0, -1, 0);
    let best = Infinity, col = null;
    for (const c of this.cols) {
      if (!c.enabled || c.tag === 'pin') continue;
      const a = c.aabb;
      if (x < a.min.x || x > a.max.x || z < a.min.z || z > a.max.z || a.min.y > y) continue;
      const t = c.ray(_c, _v, maxDrop);
      if (t < best) { best = t; col = c; }
    }
    return col ? { y: y - best, col } : null;
  }
  advance(t, h) { for (const m of this.movers) m.step(t, h); }

  // Integrate the ball for dt seconds. ball: {p, v, spin, ...}. Fills ball.ground with the latest support.
  stepBall(ball, dt, extra) {
    const speed = ball.v.length();
    const n = Math.min(60, Math.max(4, Math.ceil(speed * dt / (BALL_R * 0.5))));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.t += h;
      this.advance(this.t, h);
      if (ball.frozen) continue;
      if (extra) extra(ball, h);
      ball.v.y -= G * h;
      // Hook/slice: sideways push while the ball is in the air.
      if (!ball.grounded && ball.spin) {
        _t.set(-ball.v.z, 0, ball.v.x); const l = _t.length();
        if (l > 1) ball.v.addScaledVector(_t, ball.spin * h / l * Math.min(1, l / 20));
        ball.spin *= Math.exp(-h * 0.25);
      }
      ball.p.addScaledVector(ball.v, h);
      this.collide(ball, h);
    }
  }
  collide(ball, h) {
    const p = ball.p, R = BALL_R;
    let grounded = false, gN = null, gCol = null;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (const c of this.cols) {
        if (!c.enabled) continue;
        const a = c.aabb;
        if (p.x + R < a.min.x || p.x - R > a.max.x || p.y + R < a.min.y || p.y - R > a.max.y || p.z + R < a.min.z || p.z - R > a.max.z) continue;
        const depth = c.contact(p, R, _n, _c);
        if (depth <= 0) continue;
        any = true;
        p.addScaledVector(_n, depth);
        c.pointVel(_c, _vc);
        _v.subVectors(ball.v, _vc);
        const vn = _v.dot(_n);
        const s = SURF[c.surf] || SURF.fairway;
        if (vn < 0) {
          let target; // new normal speed (positive, away from surface)
          if (s.launch && _n.y > 0.5) target = Math.max(-vn * s.e, s.launch);
          else if (s.kick) target = -vn * s.e + s.kick;
          else target = -vn < 1.1 ? 0 : -vn * s.e;
          // Friction on impact: lose tangential speed, at most 2/7 of it (the ball spins up instead).
          _t.copy(_v).addScaledVector(_n, -vn);
          const vt = _t.length();
          if (vt > 1e-6 && -vn > 0.8) {
            const drop = Math.min(vt * 0.2857, s.slide * (-vn + target) * 0.6);
            _t.multiplyScalar(1 - drop / vt);
          }
          _v.copy(_t).addScaledVector(_n, target);
          ball.v.addVectors(_v, _vc);
          if (this.onContact) this.onContact(c, -vn, _c, _n);
        }
        if (_n.y > 0.55 && (!gN || _n.y > gN.y)) { grounded = true; gN = (gN || new THREE.Vector3()).copy(_n); gCol = c; ball.gVel.copy(_vc); }
      }
      if (!any) break;
    }
    ball.grounded = grounded;
    if (grounded) {
      ball.lastGround = gCol; ball.gN.copy(gN);
      ball.airT = 0;
      // Rolling resistance relative to the surface under the ball (so lifts and belts carry it).
      const surf = ball.surfOverride || gCol.surf;
      const s = SURF[surf] || SURF.fairway;
      _v.subVectors(ball.v, ball.gVel);
      const vn = _v.dot(gN);
      _t.copy(_v).addScaledVector(gN, -vn);
      const vt = _t.length();
      const slope = Math.sqrt(Math.max(0, 1 - gN.y * gN.y)); // sin of the slope angle
      const decel = s.roll * G * h;
      if (vt <= decel) {
        // Stick if the slope can't overcome rolling resistance; otherwise let gravity keep it creeping.
        if (slope < s.roll * 1.15) _t.set(0, 0, 0); else _t.multiplyScalar(0.5);
      } else _t.multiplyScalar(1 - decel / vt);
      ball.v.copy(ball.gVel).add(_t).addScaledVector(gN, Math.max(0, vn));
      if (slope < s.roll * 1.15 && _t.lengthSq() < 1e-6) ball.v.copy(ball.gVel);
    } else ball.airT += h;
  }
}
