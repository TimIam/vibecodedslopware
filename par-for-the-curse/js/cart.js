// The golf cart, plus the wall-sliding the walking golfer shares with it. Arcade handling: it follows
// the ground under its centre, climbs slowly up steep paths, and if the ground drops away it keeps
// its speed and flies.
import * as THREE from 'three';
import { make } from './assets.js';
import { G as GRAV, SURF, ACTOR, Collider } from './physics.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _n = V(), _c = V(), _h = V(), _v = V();
export const CART = { accel: 7.5, brake: 18, reverse: 5, max: 14, coast: 2.2, step: 0.55, empty: 6 };   // empty: how hard a cart with nobody in it slows to a stop
export const SEAT = V(0.28, 0.69, 0.05);
const NOT_FOR_BODIES = new Set(['pin', 'road', 'cliff', 'cartbody', 'post']);

// Push a body out of anything its sample spheres touch, horizontally. Things lower than stepH above
// the feet are ignored, because the ground check simply steps up onto them.
export function collideBody(world, pos, offsets, R, stepH, onHit) {
  for (const o of offsets) {
    _p.copy(pos).add(o);
    for (const c of world.cols) {
      // The drawn-shape colliders are for the ball; only the windmill stops a body.
      if (!c.enabled || c.soft || (c.kind === 'mesh' && c.tag !== 'building') || NOT_FOR_BODIES.has(c.tag)) continue;
      const a = c.aabb;
      if (a.max.y < pos.y + stepH) continue;
      if (_p.x + R < a.min.x || _p.x - R > a.max.x || _p.y + R < a.min.y || _p.y - R > a.max.y || _p.z + R < a.min.z || _p.z - R > a.max.z) continue;
      const depth = c.contact(_p, R, _n, _c);
      if (depth <= 0 || _n.y > 0.55 || _c.y < pos.y + stepH) continue;
      // Clipping the top edge of a ledge at the end of a ramp is rolling over it, not hitting a wall.
      if (_n.y > 0.15 && _c.y < pos.y + 0.95) continue;
      if (_n.y < -0.5) { if (onHit) onHit(null, depth, c, _n); continue; }
      _h.set(_n.x, 0, _n.z); const l = _h.length();
      if (l < 0.2) continue;
      _h.divideScalar(l);
      pos.addScaledVector(_h, depth); _p.addScaledVector(_h, depth);
      if (onHit) onHit(_h, depth, c, _n);
    }
  }
}

export class Cart {
  constructor(scene, spot) {
    this.mesh = make('golf_cart', { outline: 0.03 });
    this.mesh.rotation.order = 'YXZ'; this.mesh.scale.setScalar(ACTOR);
    this.mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.raycast = () => {}; } });
    scene.add(this.mesh);
    this.home = { p: spot.p.clone(), yaw: spot.yaw };
    this.pos = V(); this.carry = V(); this.offsets = [V(), V()];
    this.reset();
  }
  reset() {
    this.pos.copy(this.home.p); this.yaw = this.home.yaw;
    this.speed = 0; this.vy = 0; this.rise = 0; this.grounded = true; this.pitch = 0; this.roll = 0; this.carry.set(0, 0, 0);
    this.sync();
  }
  // While parked the cart is something a ball can hit. It is switched off while moving, so nobody can
  // bulldoze their ball up the mountain for free.
  addCollider(world) {
    // The box starts above the wheels: a ball can sit under the chassis without being crushed into the turf.
    const up = V(0, 1.18 * ACTOR, 0), H = V();
    world.add(new Collider('box', {
      half: V(0.68 * ACTOR, 0.86 * ACTOR, 1.31 * ACTOR), surf: 'metal', tag: 'cartbody', offCourse: true,
      motion: (t, c) => {
        c.enabled = Math.abs(this.speed) < 0.2;
        c.pos.copy(this.pos).add(up).addScaledVector(this.heading(H), -0.064 * ACTOR);
        c.quat.copy(this.mesh.quaternion);
      },
    }));
  }
  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(-this.pitch, this.yaw, this.roll);
    this.mesh.updateMatrixWorld(true);
  }
  heading(out = V()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  // Tilt to the ground under the four corners.
  sample(world, dt) {
    const H = this.heading(), L = V(H.z, 0, -H.x), y = this.pos.y;
    const at = (f, s) => { const g = world.groundAt(this.pos.x + H.x * f + L.x * s, y + 1.2, this.pos.z + H.z * f + L.z * s, 2.6); return g ? g.y : y; };
    let pitch = this.grounded ? Math.atan2(at(0.53, 0) - at(-0.53, 0), 1.06) : THREE.MathUtils.clamp(Math.atan2(this.vy, Math.max(4, Math.abs(this.speed))), -0.7, 0.7);
    const roll = this.grounded ? Math.atan2(at(0, 0.34) - at(0, -0.34), 0.68) : 0;
    pitch = THREE.MathUtils.clamp(pitch, -0.8, 0.8);
    const k = 1 - Math.exp(-dt * 12);
    this.pitch += (pitch - this.pitch) * k; this.roll += (THREE.MathUtils.clamp(roll, -0.5, 0.5) - this.roll) * k;
  }
  update(dt, input, world, ev = {}) {
    const n = 3, h = dt / n, H = V();
    this.sample(world, dt);
    for (let i = 0; i < n; i++) {
      this.heading(H);
      if (this.grounded) {
        let a = 0;
        if (input.brake) a = -Math.sign(this.speed) * Math.min(CART.brake, Math.abs(this.speed) / h);
        else if (input.throttle > 0) a = this.speed < 0 ? CART.brake : CART.accel;
        else if (input.throttle < 0) a = this.speed > 0 ? -CART.brake : -CART.accel;
        else a = -Math.sign(this.speed) * Math.min(input.coast ?? CART.coast, Math.abs(this.speed) / h);
        const surf = SURF[this.surf] || SURF.fairway;
        this.speed += (a - GRAV * Math.sin(this.pitch)) * h;
        if (surf === SURF.sand) this.speed *= Math.exp(-h * 2.2); else if (surf === SURF.rough) this.speed *= Math.exp(-h * 0.5);
        this.speed = THREE.MathUtils.clamp(this.speed, -CART.reverse, CART.max);
        this.yaw += input.steer * THREE.MathUtils.clamp(this.speed / 2, -1, 1) * 2.3 * h;
      } else this.yaw += input.steer * 0.35 * h;
      const ox = this.pos.x, oz = this.pos.z, oy = this.pos.y;
      this.heading(H);
      this.pos.addScaledVector(H, this.speed * h).addScaledVector(this.carry, h);
      this.offsets[0].set(H.x * 0.46, 0.6, H.z * 0.46); this.offsets[1].set(-H.x * 0.46, 0.6, -H.z * 0.46);
      collideBody(world, this.pos, this.offsets, 0.36, 0.4, (nh, d, c) => {
        if (!nh) return;
        const into = H.dot(nh) * this.speed;
        if (into < 0) {
          if (ev.hit && Math.abs(into) > 3) ev.hit(Math.abs(into), c);
          this.speed *= Math.abs(H.dot(nh)) > 0.5 ? -0.3 : 0.9;
        }
      });
      const reach = this.grounded ? 0.32 : Math.max(0.05, -this.vy * h + 0.05);
      const g = world.groundAt(this.pos.x, this.pos.y + 0.7, this.pos.z, 0.7 + reach, true);
      if (g && g.y > this.pos.y + CART.step) {
        this.pos.x = ox; this.pos.z = oz; this.speed *= -0.3;
        if (ev.hit) ev.hit(3, g.col);
        continue;
      }
      if (this.grounded) {
        // A sudden drop means the road has ended (the ray has slipped off the slab's edge): take off.
        if (g && g.y > oy - 0.1) {
          this.rise += (THREE.MathUtils.clamp((g.y - oy) / h, -Math.abs(this.speed), Math.abs(this.speed)) - this.rise) * 0.4;
          this.pos.y = g.y; this.surf = g.col.surf;
          g.col.pointVel(this.pos, this.carry);
        } else { this.grounded = false; this.vy = Math.max(this.rise, -3); }
      } else {
        this.vy -= GRAV * h; this.pos.y += this.vy * h;
        if (g && this.vy <= 0 && this.pos.y <= g.y + 0.02) {
          if (ev.land) ev.land(-this.vy);
          this.pos.y = g.y; this.grounded = true; this.rise = 0; this.vy = 0; this.surf = g.col.surf;
          this.carry.set(0, 0, 0);
        }
      }
    }
    this.sync();
  }
  // Nobody at the wheel: it carries on under its own momentum, flies, lands and coasts to a stop. Once it
  // has stopped on solid ground it stays parked, even on a ramp. On a moving platform it rides along.
  idle(dt, world, ev) {
    if (this.grounded && Math.abs(this.speed) < 0.25) {
      const g = world.groundAt(this.pos.x, this.pos.y + 0.7, this.pos.z, 1.1, true);
      if (g && !g.col.motion && Math.abs(g.y - this.pos.y) < 0.05) { this.speed = 0; this.carry.set(0, 0, 0); return; }
    }
    this.update(dt, { throttle: 0, steer: 0, brake: false, coast: CART.empty }, world, ev);
  }
  seat(out = V()) { return out.copy(SEAT).applyMatrix4(this.mesh.matrixWorld); }
}
