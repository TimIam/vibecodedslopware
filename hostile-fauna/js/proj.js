// Everything that flies: your thorns and spore pods, their bolts and rockets. One instanced mesh draws them all.

import * as THREE from 'three';
import { S, clamp } from './state.js';
import { burst, ring, flash, shake } from './fx.js';
import { sfx } from './audio.js';
import { damageEnemy } from './enemies.js';
import { damagePlayer } from './player.js';
import { damageTarget } from './mission.js';

const MAX = 260, list = [];
let inst = null;
const dummy = new THREE.Object3D(), col = new THREE.Color(), up = new THREE.Vector3(0, 0, 1), dv = new THREE.Vector3();

export function initProj(scene) {
  inst = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAX);
  inst.frustumCulled = false; inst.count = 0; inst.renderOrder = 6;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.setColorAt(0, col.set(0xffffff));
  scene.add(inst);
}
export function clearProj() { list.length = 0; if (inst) inst.count = 0; }

// o: {x,y,z, dx,dy,dz (unit), speed, dmg, owner:'p'|'e', kind, color, size, len, grav, aoe, life, homing}
export function fire(o) {
  if (list.length >= MAX) list.shift();
  list.push({ x: o.x, y: o.y, z: o.z, vx: o.dx * o.speed, vy: o.dy * o.speed, vz: o.dz * o.speed, dmg: o.dmg, owner: o.owner, kind: o.kind || 'bolt', color: o.color ?? 0xffffff, size: o.size ?? 0.12, len: o.len ?? 0.8, grav: o.grav ?? 0, aoe: o.aoe ?? 0, life: o.life ?? 4, homing: o.homing ?? 0, by: o.by || null });
}

export function segSphere(ox, oy, oz, dx, dy, dz, len, cx, cy, cz, r) {
  const fx = ox - cx, fy = oy - cy, fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz, c = fx * fx + fy * fy + fz * fz - r * r;
  if (c < 0) return 0;
  const disc = b * b - c; if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= len ? t : -1;
}

// Nearest enemy or objective prop along a segment. radius fattens the ray (the Chorus is wide).
function firstHit(ox, oy, oz, dx, dy, dz, len, radius = 0) {
  let best = len, hit = null, head = false;
  for (const e of S.enemies) {
    if (e.gone) continue;
    const d = e.def, y = e.pos.y;
    let t = segSphere(ox, oy, oz, dx, dy, dz, best, e.pos.x, y + d.h * 0.32, e.pos.z, d.r + radius);
    const t2 = segSphere(ox, oy, oz, dx, dy, dz, best, e.pos.x, y + d.h * 0.64, e.pos.z, d.r + radius);
    if (t2 >= 0 && (t < 0 || t2 < t)) t = t2;
    let h = false;
    if (d.headR) { const t3 = segSphere(ox, oy, oz, dx, dy, dz, best, e.pos.x, y + d.h * 0.92, e.pos.z, d.headR + radius * 0.5); if (t3 >= 0 && (t < 0 || t3 <= t + 0.25)) { t = t < 0 ? t3 : Math.min(t, t3); h = true; } }
    if (t >= 0 && t < best) { best = t; hit = e; head = h; }
  }
  for (const tg of S.targets) {
    if (tg.dead) continue;
    const t = segSphere(ox, oy, oz, dx, dy, dz, best, tg.x, tg.y + tg.cy, tg.z, tg.r + radius);
    if (t >= 0 && t < best) { best = t; hit = tg; head = false; }
  }
  return hit ? { hit, t: best, head } : null;
}

// The Chorus: everything along the line, through bodies but not through walls.
export function beamHits(ox, oy, oz, dx, dy, dz, max, radius) {
  const wall = S.W.ray(ox, oy, oz, dx, dy, dz, max), out = [];
  for (const e of S.enemies) {
    if (e.gone) continue;
    const t = segSphere(ox, oy, oz, dx, dy, dz, wall, e.pos.x, e.pos.y + e.def.h * 0.5, e.pos.z, e.def.r + radius + e.def.h * 0.2);
    if (t >= 0) out.push({ hit: e, t });
  }
  for (const tg of S.targets) {
    if (tg.dead) continue;
    const t = segSphere(ox, oy, oz, dx, dy, dz, wall, tg.x, tg.y + tg.cy, tg.z, tg.r + radius);
    if (t >= 0) out.push({ hit: tg, t });
  }
  return { wall, out };
}

export function explode(x, y, z, r, dmg, owner, o = {}) {
  const color = o.color ?? (owner === 'p' ? 0x8dffb0 : 0xffa040);
  ring(x, Math.max(y - 0.5, S.W.height(x, z)), z, 0.5, r, color, 0.45);
  burst(x, y, z, { n: 46, color, speed: r * 2.6, size: 0.55, life: 0.7, g: 3 });
  ring(x, Math.max(y - 0.5, S.W.height(x, z)), z, 0.2, r * 0.6, 0xffffff, 0.25);
  if (owner === 'p') burst(x, y + 0.5, z, { n: 30, color: 0x8dffb0, speed: r * 0.9, up: 1.2, size: 0.3, life: 2.2, drag: 2.2, g: -0.4 });   // spores hang in the air a while
  else burst(x, y + 0.5, z, { n: 14, color: 0x6a6258, speed: 3, up: 3, size: 1.2, life: 1.4, drag: 1.5 });
  flash(x, y + 1, z, color, 120, 0.3);
  sfx('boom');
  const P = S.P, dp = Math.hypot(P.pos.x - x, P.pos.y + 1.3 - y, P.pos.z - z);
  shake(clamp(1.2 - dp / 25, 0, 0.8));
  if (owner === 'p') {
    for (const e of [...S.enemies]) {
      if (e.gone) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.y + e.def.h * 0.5 - y, e.pos.z - z) - e.def.r;
      if (d < r) damageEnemy(e, dmg * (1 - 0.6 * clamp(d / r, 0, 1)), { kind: o.kind || 'spore', dx: e.pos.x - x, dz: e.pos.z - z, push: 5 });
    }
    for (const tg of [...S.targets]) { if (tg.dead) continue; const d = Math.hypot(tg.x - x, tg.y + tg.cy - y, tg.z - z) - tg.r; if (d < r) damageTarget(tg, dmg * (1 - 0.5 * clamp(d / r, 0, 1)), { kind: 'spore' }); }
  } else if (dp < r + 0.8) {
    damagePlayer(dmg * (1 - 0.6 * clamp(dp / r, 0, 1)), x, z, { push: 7, by: o.by });
  }
}

export function updateProj(dt) {
  const W = S.W, P = S.P;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.homing && P.alive) {   // rockets lean toward you, slowly enough to sidestep
      const sp = Math.hypot(p.vx, p.vy, p.vz); dv.set(P.pos.x - p.x, P.pos.y + 1.2 - p.y, P.pos.z - p.z).normalize();
      p.vx += dv.x * p.homing * dt; p.vy += dv.y * p.homing * dt; p.vz += dv.z * p.homing * dt;
      const s2 = Math.hypot(p.vx, p.vy, p.vz); p.vx *= sp / s2; p.vy *= sp / s2; p.vz *= sp / s2;
      if (Math.random() < 0.6) burst(p.x, p.y, p.z, { n: 1, color: 0xffb060, speed: 0.4, size: 0.4, life: 0.4 });
    }
    p.vy -= p.grav * dt;
    if (p.kind === 'thorn') burst(p.x, p.y, p.z, { n: 1, color: 0x7ffff0, speed: 0.3, size: 0.2, life: 0.16, drag: 0 });
    else if (p.kind === 'spore') burst(p.x, p.y, p.z, { n: 2, color: 0x8dffb0, speed: 0.8, size: 0.34, life: 0.5, drag: 0.5 });
    const sp = Math.hypot(p.vx, p.vy, p.vz), len = sp * dt, dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp;
    let t = W.ray(p.x, p.y, p.z, dx, dy, dz, len), ent = null, head = false, hitPlayer = false;
    if (p.owner === 'p') { const h = firstHit(p.x, p.y, p.z, dx, dy, dz, t); if (h) { t = h.t; ent = h.hit; head = h.head; } }
    else if (P.alive && !(P.ghost > 0)) { const tp = segSphere(p.x, p.y, p.z, dx, dy, dz, t, P.pos.x, P.pos.y + 1.3, P.pos.z, 0.78); if (tp >= 0) { t = tp; hitPlayer = true; } }
    if (t < len || p.life <= 0) {
      const hx = p.x + dx * t, hy = p.y + dy * t, hz = p.z + dz * t;
      if (p.aoe) explode(hx, hy, hz, p.aoe, p.dmg, p.owner, { kind: p.kind, by: p.by });
      else if (ent) {
        if (ent.isTarget) damageTarget(ent, p.dmg, { kind: p.kind, x: hx, y: hy, z: hz });
        else damageEnemy(ent, p.dmg * (head ? 1.6 : 1), { kind: p.kind, dx, dz, head, x: hx, y: hy, z: hz, push: 1.2 });
      } else if (hitPlayer) damagePlayer(p.dmg, p.x - dx * 5, p.z - dz * 5, { by: p.by });
      else if (p.life > 0) burst(hx, hy, hz, { n: 4, color: p.color, speed: 2.5, size: 0.2, life: 0.25 });
      list.splice(i, 1); continue;
    }
    p.x += dx * len; p.y += dy * len; p.z += dz * len;
  }
  const n = Math.min(list.length, MAX);
  for (let i = 0; i < n; i++) {
    const p = list[i];
    dummy.position.set(p.x, p.y, p.z);
    dv.set(p.vx, p.vy, p.vz).normalize(); dummy.quaternion.setFromUnitVectors(up, dv);
    dummy.scale.set(p.size, p.size, p.len); dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix); inst.setColorAt(i, col.set(p.color).multiplyScalar(1.8));
  }
  inst.count = n; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
}
