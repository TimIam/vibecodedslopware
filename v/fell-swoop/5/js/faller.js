// The faller from Timberline (timberline/src/faller.js and assets/models/faller.glb, copied here so the
// two games can change independently): a Blender-built jointed figure posed in code. Arms reach the
// axe handle with two-bone IK; legs and spine take a chopping stance or walk.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

export class Faller {
  constructor(model) {
    this.root = new THREE.Group();
    this.model = model;
    this.root.add(model);
    const get = (n) => model.getObjectByName(n);
    this.j = {
      pelvis: get('pelvis'), spine: get('spine'), chest: get('chest'), head: get('neck_head'),
      uaR: get('upperarm_R'), faR: get('forearm_R'), hR: get('hand_R'), gR: get('grip_R'),
      uaL: get('upperarm_L'), faL: get('forearm_L'), hL: get('hand_L'), gL: get('grip_L'),
      thR: get('thigh_R'), shR: get('shin_R'), ftR: get('foot_R'),
      thL: get('thigh_L'), shL: get('shin_L'), ftL: get('foot_L'),
    };
    this.ok = Object.values(this.j).every(Boolean);
    this.pelvisY = this.j.pelvis?.position.y ?? 0.98;
    // leg segment lengths from the rest pose
    const len = (a, b) => (a && b ? a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3())) : 0.45);
    model.updateMatrixWorld(true);
    this.thighLen = len(this.j.thR, this.j.shR); this.shinLen = len(this.j.shR, this.j.ftR);
    this.walkPhase = 0; this.t = 0;
    this.last = new THREE.Vector3(); this.speed = 0;
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // reset every joint to the rest pose
  rest() { for (const k in this.j) this.j[k]?.quaternion.identity(); this.j.pelvis.position.y = this.pelvisY; }

  // Stance for working at height workY (in the faller's ground frame): stand, crouch, or kneel on the right knee.
  stance(workY, lean = 0) {
    const j = this.j, T = this.thighLen, S = this.shinLen;
    if (workY < 0.62) { // kneel: right knee down, left foot planted forward
      const drop = this.pelvisY - (S * 0.98 + 0.1);
      j.pelvis.position.y = this.pelvisY - drop;
      j.thR.rotation.set(0, 0, 0.15); j.shR.rotation.set(0, 0, -1.62); j.ftR.rotation.set(0, 0, 0.6);
      j.thL.rotation.set(0, 0, 1.35); j.shL.rotation.set(0, 0, -1.3); j.ftL.rotation.set(0, 0, -0.05);
      j.spine.rotation.set(0, 0, -0.35 - lean); j.chest.rotation.set(0, 0, -0.18);
    } else {
      const crouch = THREE.MathUtils.clamp((1.15 - workY) / 0.55, 0, 1); // 0 standing … 1 deep crouch
      const knee = crouch * 1.25, hip = crouch * 0.95;
      j.thR.rotation.set(0, 0, hip); j.shR.rotation.set(0, 0, -knee); j.ftR.rotation.set(0, 0, knee - hip);
      j.thL.rotation.set(0, 0, hip + 0.18); j.shL.rotation.set(0, 0, -knee); j.ftL.rotation.set(0, 0, knee - hip - 0.18);
      // pelvis drops by how much the bent legs shorten
      const h = T * Math.cos(hip) + S * Math.cos(hip - knee);
      j.pelvis.position.y = this.pelvisY - ((T + S) - h);
      j.spine.rotation.set(0, 0, -0.15 - crouch * 0.4 - lean); j.chest.rotation.set(0, 0, -crouch * 0.2);
    }
  }

  // Chopping stance: feet a shoulder-width apart, knees bent just enough to bring the shoulders to height
  // shoulderH, the trunk turned (twist, + = toward the left) and bent forward (bend, radians).
  chopStance(shoulderH, twist, bend) {
    const j = this.j, T = this.thighLen, S = this.shinLen, rest = this.pelvisY + 0.475;
    const torsoDrop = 0.475 * (1 - Math.cos(bend + 0.1));
    const legDrop = (c) => (T + S) - (T * Math.cos(c * 0.95) + S * Math.cos(c * 0.95 - c * 1.25));
    let crouch = 0; // the crouch whose leg shortening makes up the rest of the height difference
    for (let i = 0; i < 14; i++) crouch = THREE.MathUtils.clamp(crouch + (rest - legDrop(crouch) - torsoDrop - shoulderH) * 1.6, 0, 1);
    const hip = crouch * 0.95, knee = crouch * 1.25;
    j.pelvis.position.y = this.pelvisY - legDrop(crouch);
    j.thR.rotation.set(-0.13, 0, hip - 0.12); j.shR.rotation.set(0, 0, -knee); j.ftR.rotation.set(0.1, 0, knee - hip + 0.12);
    j.thL.rotation.set(0.13, 0, hip + 0.22); j.shL.rotation.set(0, 0, -knee); j.ftL.rotation.set(-0.1, 0, knee - hip - 0.22);
    j.pelvis.rotation.set(0, twist * 0.35, 0);
    j.spine.rotation.set(0, twist * 0.4, -bend); j.chest.rotation.set(0, twist * 0.35, -0.1);
  }
  shoulders() { return this.j.uaR.getWorldPosition(new THREE.Vector3()).add(this.j.uaL.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5); }

  // Two-bone IK: put the grip marker of one hand on a world-space target, elbow toward a pole point.
  reach(side, target, pole) {
    const j = this.j, ua = j['ua' + side], fa = j['fa' + side], g = j['g' + side];
    ua.quaternion.identity(); fa.quaternion.identity();
    ua.updateMatrixWorld(true);
    const S = ua.getWorldPosition(new THREE.Vector3()), E0 = fa.getWorldPosition(new THREE.Vector3()), G0 = g.getWorldPosition(new THREE.Vector3());
    const L1 = S.distanceTo(E0), L2 = E0.distanceTo(G0);
    const toT = _v.subVectors(target, S); let d = toT.length();
    d = THREE.MathUtils.clamp(d, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.999);
    const dir = toT.normalize().clone();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const n = _w.subVectors(pole, S); n.addScaledVector(dir, -n.dot(dir));
    if (n.lengthSq() < 1e-8) n.set(0, -1, 0);
    n.normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(n, h);
    // upper arm: rotate rest elbow direction onto the solved one (world), expressed in the parent frame
    const pq = ua.parent.getWorldQuaternion(new THREE.Quaternion());
    _q.setFromUnitVectors(E0.sub(S).normalize(), E.clone().sub(S).normalize());
    ua.quaternion.copy(pq).invert().multiply(_q).multiply(pq);
    ua.updateMatrixWorld(true);
    // forearm: rotate the current elbow→grip direction onto elbow→target
    const G1 = g.getWorldPosition(new THREE.Vector3()), Ew = fa.getWorldPosition(new THREE.Vector3());
    const fq = fa.parent.getWorldQuaternion(new THREE.Quaternion());
    const tgt = S.clone().addScaledVector(dir, d);
    _q2.setFromUnitVectors(G1.sub(Ew).normalize(), tgt.sub(Ew).normalize());
    fa.quaternion.copy(fq).invert().multiply(_q2).multiply(fq);
    fa.updateMatrixWorld(true);
  }

  // turn the head toward a world point (yaw and pitch, limited)
  look(point) {
    const hd = this.j.head; if (!hd) return;
    hd.quaternion.identity(); hd.updateMatrixWorld(true);
    const p = hd.worldToLocal(point.clone());
    const yaw = THREE.MathUtils.clamp(Math.atan2(-p.z, p.x), -0.9, 0.9), pitch = THREE.MathUtils.clamp(Math.atan2(p.y, Math.hypot(p.x, p.z)), -0.7, 0.5);
    hd.rotation.set(0, yaw, pitch, 'YZX');
  }

  // relaxed arms (no tool), with a little swing when walking
  armsFree(swing = 0) {
    const j = this.j;
    j.uaR.rotation.set(0.12, 0, swing * 0.5 + 0.05); j.faR.rotation.set(0, 0, 0.25 + Math.max(0, swing) * 0.3);
    j.uaL.rotation.set(-0.12, 0, -swing * 0.5 + 0.05); j.faL.rotation.set(0, 0, 0.25 + Math.max(0, -swing) * 0.3);
  }

  walk(dt) {
    const j = this.j, s = Math.min(1, this.speed / 1.6);
    this.walkPhase += dt * (4 + this.speed * 3.2);
    const p = this.walkPhase, a = 0.55 * s;
    j.thR.rotation.set(0, 0, Math.sin(p) * a); j.shR.rotation.set(0, 0, -Math.max(0, Math.sin(p + 1.4)) * 1.0 * s); j.ftR.rotation.set(0, 0, 0);
    j.thL.rotation.set(0, 0, -Math.sin(p) * a); j.shL.rotation.set(0, 0, -Math.max(0, -Math.sin(p + 1.4)) * 1.0 * s); j.ftL.rotation.set(0, 0, 0);
    j.pelvis.position.y = this.pelvisY - 0.03 * s + Math.abs(Math.cos(p)) * 0.025 * s;
    j.spine.rotation.set(0, Math.sin(p) * 0.08 * s, -0.08 - 0.12 * s); j.chest.rotation.set(0, 0, 0);
    this.armsFree(-Math.sin(p) * s);
  }

  // per-frame bookkeeping: speed from how far the root moved, breathing
  tick(dt) {
    this.t += dt;
    const pos = this.root.position;
    if (dt > 0) this.speed += ((pos.distanceTo(this.last) / dt) - this.speed) * Math.min(1, dt * 8);
    this.last.copy(pos);
    if (this.j.chest) this.j.chest.scale.setScalar(1 + Math.sin(this.t * 1.7) * 0.006);
  }
}

