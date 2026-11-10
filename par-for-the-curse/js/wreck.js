// Things you can wreck, and how they mend. Bushes and flowers get tousled or flattened and pop back up.
// Trees shake and drop leaves when the trunk is hit; their foliage tears away and regrows in an instant.
// Rocks chip, and a rock hit hard enough times crumbles to rubble and reassembles. The turf takes divots
// that throw clods and close up again. Nothing here is ever lost for good.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const NCHUNK = 200, NDIVOT = 28;
const COLORS = {
  leaf: ['#5cc94a', '#3fae45', '#7ad65f'], pine: ['#2f8f4e', '#3aa35c', '#256f3d'], petal: ['#ff8fb1', '#ffd23f', '#ffffff', '#b58cff', '#5cc94a'],
  rock: ['#9aa0aa', '#7d838d', '#b8bcc4'], soil: ['#6b4a2b', '#7a5434', '#5a3d22'], turf: ['#5fc04a', '#4aa83a'],
};
export const WRECK = { plantHold: 1.1, regrow: 0.7, rockBreak: 3, rockMend: 5, divotLife: 7 };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), _a = V(), _b = V(), _c = new THREE.Color();

export class Wreck {
  // things: from Course.things. hooks: { sound(name, vol, p), dust(p, n, s), sparks(p, n), blocked(p, r) }.
  constructor(scene, things, hooks) {
    this.hooks = hooks; this.t = 0;
    this.things = things; this.active = new Set();
    for (let i = 0; i < things.length; i++) this.prepare(things[i], i);
    // Debris: one instanced box, tinted and stretched into clods, shards and leaves.
    this.chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), NCHUNK);
    this.chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.chunks.frustumCulled = false; this.chunks.castShadow = true; this.chunks.raycast = () => {};
    this.ch = Array.from({ length: NCHUNK }, () => ({ life: 0, p: V(), v: V(), r: V(), w: V(), s: V(), max: 1, floor: 0, leaf: false, shown: false }));
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < NCHUNK; i++) { this.chunks.setMatrixAt(i, _m); this.chunks.setColorAt(i, _c.set('#ffffff')); }
    this.nextChunk = 0; scene.add(this.chunks);
    // Divots: a scar of bare soil lying on the turf.
    const soil = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
    this.divots = Array.from({ length: NDIVOT }, () => {
      const g = new THREE.Group();
      const mk = (color, k, lift) => { const m = new THREE.Mesh(soil, new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.scale.set(k, 1, k); m.position.y = lift; m.raycast = () => {}; g.add(m); };
      mk('#6b4a2b', 1, 0); mk('#4b3320', 0.62, 0.003);
      g.visible = false; scene.add(g);
      return { g, age: 0, life: 0, len: 1, wid: 1 };
    });
    this.nextDivot = 0;
  }
  prepare(th, i) {
    const o = th.obj; o.updateWorldMatrix(true, true);
    th.i = i; th.p = o.getWorldPosition(V()); th.baseQ = o.quaternion.clone(); th.baseS = o.scale.x;
    th.parentInv = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    th.dir = V(1, 0, 0); th.axis = V(0, 0, 1);
    Object.assign(th, { flat: 0, flatTo: 0, hold: 0, shake: 0, boing: 0, torn: 0, dmg: 0, gone: 0, hitT: -9, brushT: -9 });
    const s = th.s, z = th.zones = [];
    if (th.kind === 'bush') z.push({ zone: 'plant', c: th.p.clone().add(V(0, 0.42 * s, 0)), r: 0.7 * s });
    else if (th.kind === 'flowers') z.push({ zone: 'plant', c: th.p.clone().add(V(0, 0.18 * s, 0)), r: 0.42 * s });
    else if (th.kind === 'tree') {
      for (const y of [0.35, 0.85, 1.35]) z.push({ zone: 'trunk', c: th.p.clone().add(V(0, y, 0)), r: (th.trunk || 0.35) * s + 0.05 });
      for (const [c, r] of th.fol) z.push({ zone: 'foliage', c, r });
      // The leafy parts of the model: everything that is not trunk.
      th.leaves = o.children.filter(ch => { let leafy = false; ch.traverse(m => { if (m.isMesh && !m.userData.isOutline && !/trunk|bark|wood|stem/i.test(m.material.name || '')) leafy = true; }); return leafy; });
      th.leafS = th.leaves.map(l => l.scale.clone());
      th.crown = th.fol.length ? th.fol[0][0] : th.p.clone().add(V(0, 3 * s, 0));
      th.pine = /pine/.test(th.name);
    } else if (th.kind === 'rock') {
      const box = new THREE.Box3().setFromObject(o), size = box.getSize(V());
      th.c = box.getCenter(V()); th.r = Math.min(size.x, size.z) * 0.5;
      // Rocks stand taller than a golfer: a stack of spheres from the turf up, so a low swing still finds stone.
      for (let y = box.min.y + th.r * 0.6; y < box.max.y - th.r * 0.3 || !z.length; y += th.r * 0.8) z.push({ zone: 'rock', c: V(th.c.x, y, th.c.z), r: th.r * 0.9 });
    }
    th.reach = Math.max(0.1, ...z.map(k => Math.hypot(k.c.x - th.p.x, k.c.z - th.p.z) + k.r));
  }
  // Things whose hit zones could be within r of p (flat distance, and not on another level of the mountain).
  near(p, r, out = []) {
    out.length = 0;
    for (const th of this.things) {
      const dx = th.p.x - p.x, dz = th.p.z - p.z, d = r + th.reach;
      if (dx * dx + dz * dz < d * d && Math.abs(th.p.y - p.y) < 9) out.push(th);
    }
    return out;
  }
  setDir(th, dir) {
    th.dir.copy(dir).setY(0); if (th.dir.lengthSq() < 1e-6) th.dir.set(1, 0, 0);
    th.dir.normalize().applyQuaternion(th.parentInv);
    th.axis.crossVectors(UP, th.dir).normalize();
  }
  // Something struck thing i in one of its zones. dir: the way it was travelling (world). power 0..1.
  hit(i, zone, dir, power, at) {
    const th = this.things[i]; if (!th) return;
    power = clamp(power, 0.1, 1);
    const Z = th.zones.find(k => k.zone === zone) || th.zones[0]; if (!Z) return;
    at = at || Z.c; th.hitT = this.t; this.active.add(th);
    const H = this.hooks;
    if (th.kind === 'bush' || th.kind === 'flowers') {
      if (power < 0.3) th.shake = Math.max(th.shake, 0.7);
      else { th.flatTo = Math.min(1, 0.45 + power * 0.6); th.hold = WRECK.plantHold * (0.7 + power * 0.6); this.setDir(th, dir); }
      this.burst(at, th.kind === 'flowers' ? COLORS.petal : COLORS.leaf, 6 + power * 16, dir, 1.5 + power * 3, 'leaf', th.p.y);
      H.sound('rustle', 0.4 + power * 0.5, at);
    } else if (th.kind === 'tree') {
      const cols = th.pine ? COLORS.pine : COLORS.leaf;
      this.setDir(th, dir);
      if (zone === 'trunk') {
        th.shake = Math.max(th.shake, 0.5 + power);
        th.torn = Math.min(1, th.torn + 0.15 + power * 0.3); th.hold = WRECK.regrow;      // a good thump strips the canopy too
        for (let k = 0; k < 3; k++) this.burst(_a.copy(th.crown).add(_b.set(Math.random() - 0.5, Math.random() * 0.4 - 0.6, Math.random() - 0.5).multiplyScalar(2.6 * th.s)), cols, 3 + power * 5, null, 0.6, 'leaf', th.p.y);
        H.sound('wood', 0.5 + power * 0.5, at); H.sound('rustle', 0.5, th.crown);
      } else {
        th.torn = Math.min(1, th.torn + 0.3 + power * 0.4); th.hold = WRECK.regrow; th.shake = Math.max(th.shake, 0.35);
        this.burst(at, cols, 14 + power * 26, dir, 2 + power * 4, 'leaf', th.p.y);
        H.sound('rustle', 0.6 + power * 0.4, at);
      }
    } else if (th.kind === 'rock' && !th.gone) {
      th.dmg += 0.5 + power; th.shake = Math.max(th.shake, 0.5 + power * 0.5);
      this.burst(at, COLORS.rock, 4 + power * 9, dir, 2 + power * 4, 'shard', th.p.y);
      H.sparks(at, 8 + power * 10); H.sound('rock', 0.5 + power * 0.5, at);
      if (th.dmg >= WRECK.rockBreak) {
        th.gone = WRECK.rockMend; th.dmg = 0; th.obj.visible = false; if (th.col) th.col.enabled = false;
        for (let k = 0; k < 4; k++) this.burst(_a.copy(th.c).add(_b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(th.r)), COLORS.rock, 7, dir, 3 + power * 3, 'rubble', th.p.y);
        H.dust(th.c, 22, 1.4); H.sound('crumble', 1, th.c);
      }
    }
  }
  // Brushed past on foot: a rustle and a wobble, nothing more.
  brush(th) {
    if (this.t - th.brushT < 0.6 || th.flatTo > 0) return;
    th.brushT = this.t; th.shake = Math.max(th.shake, 0.6); this.active.add(th);
    this.hooks.sound('rustle', 0.25, th.p);
  }
  burst(at, colors, n, dir, speed, type, floor) {
    for (let k = 0; k < n; k++) {
      const c = this.ch[this.nextChunk]; c.i = this.nextChunk; this.nextChunk = (this.nextChunk + 1) % NCHUNK;
      c.p.copy(at).add(_b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(type === 'leaf' ? 0.5 : 0.15));
      c.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.25, Math.random() - 0.5).multiplyScalar(speed * (0.5 + Math.random()));
      if (dir) c.v.addScaledVector(dir, speed * (0.3 + Math.random() * 0.7));
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); c.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(type === 'leaf' ? 9 : 16);
      const u = Math.random();
      if (type === 'leaf') c.s.set(0.07 + u * 0.06, 0.012, 0.045 + u * 0.04);
      else if (type === 'clod') c.s.set(0.05 + u * 0.07, 0.035 + u * 0.04, 0.05 + u * 0.06);
      else if (type === 'rubble') c.s.set(0.12 + u * 0.16, 0.1 + u * 0.12, 0.12 + u * 0.14);
      else c.s.set(0.04 + u * 0.07, 0.03 + u * 0.05, 0.04 + u * 0.06);
      c.leaf = type === 'leaf'; c.floor = floor + c.s.y * 0.5;
      c.max = c.life = type === 'leaf' ? 1.1 + Math.random() * 0.9 : type === 'rubble' ? 2.6 + Math.random() : 1.4 + Math.random() * 0.8;
      this.chunks.setColorAt(c.i, _c.set(colors[(Math.random() * colors.length) | 0]));
    }
    this.chunks.instanceColor.needsUpdate = true;
  }
  // A divot at p (on the turf), torn the way dir points. Clods fly; the scar mends itself.
  divot(p, dir, power, clods = true) {
    power = clamp(power, 0.15, 1.2);
    const d = this.divots[this.nextDivot]; this.nextDivot = (this.nextDivot + 1) % NDIVOT;
    d.age = 0; d.life = WRECK.divotLife; d.len = 0.1 + power * 0.2; d.wid = 0.06 + power * 0.07;
    d.g.position.copy(p); d.g.position.y += 0.012;
    d.g.rotation.set(0, Math.atan2(-dir.z, dir.x), 0); d.g.visible = true;
    if (clods) {
      this.burst(p, COLORS.soil, 3 + power * 5, dir, 1.6 + power * 2.4, 'clod', p.y);
      this.burst(p, COLORS.turf, 2 + power * 3, dir, 1.6 + power * 2.4, 'clod', p.y);
    }
  }
  update(dt, t) {
    this.t = t;
    for (const th of this.active) {
      th.shake *= Math.exp(-dt * 5); th.boing *= Math.exp(-dt * 6);
      const wob = Math.sin((t - th.hitT) * 24) * th.boing, o = th.obj, S = th.baseS;
      if (th.kind === 'bush' || th.kind === 'flowers') {
        if (th.flatTo > 0) {
          th.flat += (th.flatTo - th.flat) * Math.min(1, dt * 30); th.hold -= dt;
          if (th.hold <= 0) { th.flatTo = 0; th.flat = 0; th.boing = 1; th.hitT = t; this.hooks.sound('pop', 0.6, th.p); }      // up it pops
        }
        const xz = 1 + 0.45 * th.flat - 0.14 * wob;
        o.scale.set(S * xz, S * (1 - 0.78 * th.flat + 0.32 * wob), S * xz);
        o.quaternion.copy(_q.setFromAxisAngle(th.axis, th.flat * 0.5 + th.shake * 0.16 * Math.sin(t * 31))).multiply(th.baseQ);
      } else if (th.kind === 'tree') {
        if (th.torn > 0) { th.hold -= dt; if (th.hold <= 0) { th.torn = 0; th.boing = 1; th.hitT = t; this.hooks.sound('pop', 0.7, th.crown); this.burst(th.crown, th.pine ? COLORS.pine : COLORS.leaf, 10, null, 2.2, 'leaf', th.p.y); } }
        const k = 1 - 0.62 * th.torn + 0.2 * wob;
        th.leaves.forEach((l, n) => l.scale.copy(th.leafS[n]).multiplyScalar(k));
        o.quaternion.copy(_q.setFromAxisAngle(th.axis, th.shake * 0.045 * Math.sin(t * 27))).multiply(th.baseQ);
      } else {
        if (th.gone > 0) {
          th.gone -= dt;
          if (th.gone <= 0) {
            if (this.hooks.blocked(th.c, th.r + 0.5)) th.gone = 0.5;      // not on top of somebody
            else { th.gone = 0; o.visible = true; if (th.col) th.col.enabled = true; th.boing = 1; th.hitT = t; this.hooks.dust(th.c, 14, 1); this.hooks.sound('pop', 0.8, th.c); }
          }
        } else th.dmg = Math.max(0, th.dmg - dt * 0.2);
        const k = 1 + 0.05 * th.shake * Math.sin(t * 43) + 0.22 * wob;
        o.scale.setScalar(S * k);
      }
      if (th.shake < 0.01 && th.boing < 0.01 && !th.flatTo && !th.torn && !th.gone && !th.dmg) {
        o.scale.setScalar(S); o.quaternion.copy(th.baseQ);
        if (th.leaves) th.leaves.forEach((l, n) => l.scale.copy(th.leafS[n]));
        this.active.delete(th);
      }
    }
    let dirty = false;
    for (const c of this.ch) {
      if (c.life <= 0) { if (c.shown) { c.shown = false; _m.makeScale(0, 0, 0); this.chunks.setMatrixAt(c.i, _m); dirty = true; } continue; }
      c.life -= dt; c.shown = true; dirty = true;
      if (c.leaf) { c.v.multiplyScalar(Math.exp(-dt * 2.6)); c.v.y -= 2.4 * dt; c.v.x += Math.sin(t * 7 + c.i) * 1.5 * dt; c.v.z += Math.cos(t * 6 + c.i * 2) * 1.5 * dt; }
      else c.v.y -= 11 * dt;
      c.p.addScaledVector(c.v, dt); c.r.addScaledVector(c.w, dt);
      if (c.p.y < c.floor) { c.p.y = c.floor; if (c.v.y < -1 && !c.leaf) { c.v.y *= -0.3; c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.5); } else { c.v.set(0, 0, 0); c.w.set(0, 0, 0); } }
      const k = Math.min(1, c.life / 0.3);
      _m.compose(c.p, _q2.setFromEuler(_e.set(c.r.x, c.r.y, c.r.z)), _a.copy(c.s).multiplyScalar(k));
      this.chunks.setMatrixAt(c.i, _m);
    }
    if (dirty) this.chunks.instanceMatrix.needsUpdate = true;
    for (const d of this.divots) {
      if (!d.g.visible) continue;
      d.age += dt;
      const left = d.life - d.age, k = Math.min(1, d.age / 0.07) * clamp(left / 0.6, 0, 1);
      if (left <= 0) { d.g.visible = false; this.burst(d.g.position, COLORS.turf, 4, null, 0.9, 'leaf', d.g.position.y); continue; }      // grown over
      d.g.scale.set(d.len * k, 1, d.wid * k);
    }
  }
}
