// Where an elbow goes. Two-bone IK leaves the elbow free to swing round the shoulder-to-hand line;
// a fixed pole puts the trailing arm straight through the chest when the axe is out on the other
// side. This tries elbow positions round that circle and keeps the one nearest the preferred pole
// that keeps both bones out of the torso and head, without flipping from one frame to the next.
import * as THREE from 'three';

const N = 24, ARM_R = 0.05;
const _dir = new THREE.Vector3(), _n0 = new THREE.Vector3(), _m0 = new THREE.Vector3(), _n = new THREE.Vector3();
const _E = new THREE.Vector3(), _p = new THREE.Vector3(), _best = new THREE.Vector3(), _q = new THREE.Vector3();

// torso: { c, f, r, u } centre and unit axes (forward, right, up), depth/width half-sizes a, b,
// from y0 to y1 along u; the head a circle of radius hr from y1 to y2.
function inside(p, t) {
  _q.subVectors(p, t.c);
  const y = _q.dot(t.u), x = _q.dot(t.f) - (t.fx || 0), z = _q.dot(t.r);
  if (y < t.y0 || y > t.y2) return 0;
  const e = y < t.y1
    ? Math.hypot(x / (t.a + ARM_R), z / (t.b + ARM_R))
    : Math.hypot(x, z) / (t.hr + ARM_R);
  return Math.max(0, 1 - e);
}
function bonePen(a, b, t, from) {
  let s = 0;
  for (let i = from; i <= 8; i++) s += inside(_p.copy(a).lerp(b, i / 8), t);
  return s;
}

// S shoulder, H hand, L1/L2 bone lengths, pole a preferred direction for the elbow (any length),
// prev the last chosen direction (updated). Writes the elbow into out.
export function pickElbow(S, H, L1, L2, pole, torso, prev, out) {
  _dir.subVectors(H, S); let d = _dir.length(); _dir.divideScalar(d || 1);
  d = THREE.MathUtils.clamp(d, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.999);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _n0.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_n0.lengthSq() < 1e-8) _n0.set(0, -1, 0).addScaledVector(_dir, _dir.y);
  _n0.normalize(); _m0.crossVectors(_dir, _n0);
  const hasPrev = prev.lengthSq() > 0.5;
  let bestCost = Infinity;
  for (let k = 0; k < N; k++) {
    const ang = (k / N) * Math.PI * 2;
    _n.copy(_n0).multiplyScalar(Math.cos(ang)).addScaledVector(_m0, Math.sin(ang));
    _E.copy(S).addScaledVector(_dir, a).addScaledVector(_n, h);
    // The first stretch of the upper arm is in the shoulder; it is allowed to touch.
    const pen = bonePen(S, _E, torso, 3) + bonePen(_E, H, torso, 0);
    const cost = pen * 12 + (1 - Math.cos(ang)) * 0.6 + (hasPrev ? (1 - _n.dot(prev)) * 0.5 : 0);
    if (cost < bestCost) { bestCost = cost; _best.copy(_n); }
  }
  // Ease toward the choice so the elbow travels round rather than jumping.
  if (hasPrev) { prev.lerp(_best, 0.35); prev.addScaledVector(_dir, -prev.dot(_dir)); if (prev.lengthSq() < 1e-6) prev.copy(_best); prev.normalize(); }
  else prev.copy(_best);
  return out.copy(S).addScaledVector(_dir, a).addScaledVector(prev, h);
}
