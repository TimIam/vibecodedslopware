// First-person controller on a Rapier character controller, plus the three tools.
import * as THREE from 'three';
import { PLAYER, TOOLS } from './config.js';

export class Player {
  constructor(G, camera) {
    this.G = G; this.cam = camera; const { R, phys } = G;
    this.yaw = Math.PI / 2; this.pitch = 0; this.keys = {}; this.vy = 0; this.grounded = false;
    this.body = phys.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(10.5, 0.9, 4.5));
    this.col = phys.createCollider(R.ColliderDesc.capsule(PLAYER.height / 2 - PLAYER.radius, PLAYER.radius).setFriction(0), this.body);
    G.ents.set(this.col.handle, { kind: 'player' });
    this.cc = phys.createCharacterController(0.02);
    this.cc.enableAutostep(0.35, 0.2, true); this.cc.enableSnapToGround(0.3); this.cc.setApplyImpulsesToDynamicBodies(true); this.cc.setCharacterMass(85);
    this.cc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.tool = 'hammer'; this.cooldown = 0; this.swing = 0; this.pendingHit = null; this.carrying = null; this.pushing = false; this.bob = 0; this.lmb = false;
    this.viewmodel = this.buildViewmodel(); camera.add(this.viewmodel);
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.locked = false;
    this.bind();
  }
  pos() { const t = this.body.translation(); return new THREE.Vector3(t.x, t.y, t.z); }
  bind() {
    addEventListener('keydown', e => { this.keys[e.code] = true; if (e.code === 'Digit1') this.setTool('hammer'); if (e.code === 'Digit2') this.setTool('axe'); if (e.code === 'Digit3') this.setTool('hands'); if (e.code === 'KeyE') this.interact(); if (e.code === 'Tab') { e.preventDefault(); document.getElementById('objectives').classList.toggle('show'); } });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('mousemove', e => { if (!this.locked) return; this.yaw -= e.movementX * 0.0022; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0022)); });
    addEventListener('mousedown', e => { if (!this.locked || e.target !== this.G.renderer.domElement) return; if (e.button === 0) { this.lmb = true; this.primary(); } if (e.button === 2) this.setTool(this.tool === 'hammer' ? 'axe' : this.tool === 'axe' ? 'hands' : 'hammer'); });
    addEventListener('mouseup', e => { if (e.button === 0) this.lmb = false; });
    addEventListener('wheel', e => { if (!this.locked) return; const order = ['hammer', 'axe', 'hands']; this.setTool(order[(order.indexOf(this.tool) + (e.deltaY > 0 ? 1 : 2)) % 3]); });
    addEventListener('contextmenu', e => e.preventDefault());
  }
  setTool(t) {
    if (this.carrying) this.drop();
    this.tool = t; this.G.audio.click();
    const hints = { hammer: 'LMB swing · doors, servers, panels, anchors', axe: 'LMB chop · cables, fibre, glass', hands: 'E grab a loose server · LMB throw, or hold on a rack to push' };
    this.G.hud.tool(TOOLS[t].name, hints[t]);
    for (const k in this.vm) this.vm[k].visible = k === t;
  }
  buildViewmodel() {
    const g = new THREE.Group(); this.vm = {};
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.35 }), wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }), red = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.5 });
    const hammer = new THREE.Group(); const h1 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.9, 10), wood); h1.position.y = -0.3; hammer.add(h1);
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.2), steel); h2.position.y = 0.15; hammer.add(h2); g.add(hammer); this.vm.hammer = hammer;
    const axe = new THREE.Group(); const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.85, 10), wood); a1.position.y = -0.28; axe.add(a1);
    const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.02), red); a2.position.set(0.05, 0.15, 0); axe.add(a2); const a3 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), steel); a3.position.set(-0.06, 0.15, 0); axe.add(a3); g.add(axe); this.vm.axe = axe;
    const hands = new THREE.Group(); const skin = new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: 0.9 });
    for (const s of [-1, 1]) { const hm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.16), skin); hm.position.set(s * 0.18, -0.02, 0.05); hands.add(hm); const sl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.15), new THREE.MeshStandardMaterial({ color: 0x2d3e7a, roughness: 0.9 })); sl.position.set(s * 0.18, -0.02, 0.2); hands.add(sl); }
    g.add(hands); this.vm.hands = hands;
    g.position.set(0.32, -0.32, -0.55); g.rotation.set(0.1, -0.35, 0.15);
    for (const k in this.vm) this.vm[k].visible = k === 'hammer';
    this.setTool('hammer');
    return g;
  }
  aim(range) {
    const o = this.cam.getWorldPosition(new THREE.Vector3()), d = this.cam.getWorldDirection(new THREE.Vector3());
    this.ray.origin = { x: o.x, y: o.y, z: o.z }; this.ray.dir = { x: d.x, y: d.y, z: d.z };
    const hit = this.G.phys.castRayAndGetNormal(this.ray, range, true, undefined, undefined, this.col, this.body);
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi; const p = o.clone().addScaledVector(d, toi);
    return { ent: this.G.ents.get(hit.collider.handle), point: p, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z), dir: d, dist: toi, collider: hit.collider };
  }
  primary() {
    if (this.G.systems.over) return;
    const t = TOOLS[this.tool];
    if (this.tool === 'hands') { if (this.carrying) this.throw(); return; }
    if (this.cooldown > 0) return;
    this.cooldown = t.cooldown; this.swing = 1; this.G.audio.swing();
    this.pendingHit = t.swing;
  }
  resolveHit() {
    const t = TOOLS[this.tool]; const a = this.aim(t.range);
    if (!a || !a.ent) return;
    this.G.world.hit(a.ent, a.point, a.normal, a.dir, t);
  }
  interact() {
    if (!this.locked || this.G.systems.over) return;
    if (this.carrying) { this.drop(); return; }
    const a = this.aim(3.0); if (!a || !a.ent) return;
    this.G.world.interact(a.ent, a.point);
  }
  pickUp(item) { this.carrying = item; item.body.setBodyType(this.G.R.RigidBodyType.KinematicPositionBased, true); this.G.hud.log(`Carrying a ${item.label} (${item.mass} kg).`); }
  drop() { const it = this.carrying; if (!it) return; this.carrying = null; it.body.setBodyType(this.G.R.RigidBodyType.Dynamic, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
  throw() {
    const it = this.carrying; const d = this.cam.getWorldDirection(new THREE.Vector3()); this.drop();
    it.body.setLinvel({ x: d.x * 11, y: d.y * 11 + 1.5, z: d.z * 11 }, true); it.body.setAngvel({ x: 3, y: 1, z: 2 }, true); this.G.audio.swing();
  }
  update(dt) {
    const { R } = this.G;
    // movement
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), r = new THREE.Vector3(-f.z, 0, f.x);
    const mv = new THREE.Vector3();
    if (this.locked && !this.G.systems.over) {
      if (this.keys.KeyW) mv.add(f); if (this.keys.KeyS) mv.sub(f); if (this.keys.KeyD) mv.add(r); if (this.keys.KeyA) mv.sub(r);
    }
    if (this.locked) { // keyboard look (also the fallback when pointer lock is blocked)
      if (this.keys.ArrowLeft) this.yaw += 1.8 * dt; if (this.keys.ArrowRight) this.yaw -= 1.8 * dt;
      if (this.keys.ArrowUp) this.pitch = Math.min(1.5, this.pitch + 1.2 * dt); if (this.keys.ArrowDown) this.pitch = Math.max(-1.5, this.pitch - 1.2 * dt);
    }
    const speed = this.keys.ShiftLeft ? PLAYER.sprint : PLAYER.walk;
    if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(speed * dt);
    if (this.grounded && this.keys.Space && this.locked) { this.vy = PLAYER.jump; this.grounded = false; }
    this.vy -= 9.81 * dt; if (this.vy < -20) this.vy = -20;
    mv.y = this.vy * dt;
    this.cc.computeColliderMovement(this.col, { x: mv.x, y: mv.y, z: mv.z });
    const m = this.cc.computedMovement(); this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = -0.5;
    if (!this.grounded && Math.abs(m.y) < 1e-5 && this.vy > 0) this.vy = 0; // bumped head
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    // camera
    const moving = mv.x * mv.x + mv.z * mv.z > 1e-8 && this.grounded; this.bob += dt * (moving ? (this.keys.ShiftLeft ? 13 : 9) : 0);
    this.cam.position.set(t.x + m.x, t.y + m.y - PLAYER.height / 2 + PLAYER.eye + (moving ? Math.sin(this.bob) * 0.025 : 0), t.z + m.z);
    this.cam.rotation.set(0, 0, 0, 'YXZ'); this.cam.rotation.y = this.yaw; this.cam.rotation.x = this.pitch;
    // tool swing animation + deferred hit
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.pendingHit !== null) { this.pendingHit -= dt; if (this.pendingHit <= 0) { this.pendingHit = null; this.resolveHit(); } }
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 2.4);
    const s = Math.sin(this.swing * Math.PI);
    this.viewmodel.rotation.set(0.1 - s * 1.4, -0.35 + s * 0.3, 0.15 + s * 0.4); this.viewmodel.position.set(0.32 - s * 0.15, -0.32 + s * 0.05, -0.55 - s * 0.1);
    // carrying
    if (this.carrying) {
      if (this.carrying.frozen) { this.carrying = null; }
      else { const d = this.cam.getWorldDirection(new THREE.Vector3()); const p = this.cam.getWorldPosition(new THREE.Vector3()).addScaledVector(d, 0.9); p.y -= 0.25;
        this.carrying.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z }); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0)); this.carrying.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); }
    }
    // pushing with hands
    this.pushing = false;
    if (this.tool === 'hands' && this.lmb && this.locked && !this.carrying) {
      let a = this.aim(TOOLS.hands.range);
      if (a?.ent?.kind === 'loose') { // reach past debris lying against the cabinet
        const o = this.cam.getWorldPosition(new THREE.Vector3()), d = a.dir;
        this.ray.origin = { x: a.point.x + d.x * 0.03, y: a.point.y + d.y * 0.03, z: a.point.z + d.z * 0.03 }; this.ray.dir = { x: d.x, y: d.y, z: d.z };
        const h2 = this.G.phys.castRayAndGetNormal(this.ray, TOOLS.hands.range - a.dist, true, undefined, undefined, a.collider, a.collider.parent());
        if (h2 && this.G.ents.get(h2.collider.handle)?.kind === 'rack') { const toi = h2.timeOfImpact ?? h2.toi; a = { ent: this.G.ents.get(h2.collider.handle), point: new THREE.Vector3(this.ray.origin.x, this.ray.origin.y, this.ray.origin.z).addScaledVector(d, toi), dir: d, dist: a.dist + toi }; }
      }
      if (a?.ent?.kind === 'rack') {
        if (a.ent.bolted) this.G.hud.prompt('Bolted down. Shear the anchors with the sledgehammer first.');
        else { a.ent.body.applyImpulseAtPoint({ x: a.dir.x * 2800 * dt, y: 0, z: a.dir.z * 2800 * dt }, a.point, true); this.pushing = true; a.ent.dirty = true; }
      } else if (a?.ent?.kind === 'loose') a.ent.body.applyImpulseAtPoint({ x: a.dir.x * 400 * dt, y: 0, z: a.dir.z * 400 * dt }, a.point, true);
    }
    // prompt
    if (!this.pushing) { const a = this.aim(3.0); this.G.hud.prompt(a?.ent ? this.G.world.promptFor(a.ent, a.point) : ''); }
    else this.G.hud.prompt('Pushing…');
  }
}
