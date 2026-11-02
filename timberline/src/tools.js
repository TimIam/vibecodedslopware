// Visual rig: the faller, the chainsaw or axe placed on the active cut, wedges, sawdust/chips.
import * as THREE from 'three';
import { assets } from './assets.js';

const deg = THREE.MathUtils.degToRad;

export class Rig {
  constructor(tree, tool) {
    this.tree = tree; this.tool = tool;
    this.group = new THREE.Group();
    tree.leanGroup.add(this.group);
    this.faller = makeFaller();
    tree.root.add(this.faller);
    if (tool.kind === 'saw') {
      const s = assets.chainsaw();
      this.saw = s.obj; this.bar = s.bar; this.chain = s.chain;
      this.fitBar(tool.bar);
      this.group.add(this.saw);
    } else {
      this.axe = assets.axe();
      this.axePivot = new THREE.Group(); this.axePivot.add(this.axe);
      this.group.add(this.axePivot);
    }
    this.wedgeMeshes = [];
    this.particles = new Chips(tree.spec.sp.sap);
    tree.leanGroup.add(this.particles.points);
    this.swing = 0; this.swingT = 0;
    // axe strike mark: a dot where the bit landed, ringed by an arc that drains until the next swing
    const mr = THREE.MathUtils.clamp(tree.R * 0.4, 0.03, 0.07);
    const markMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide, fog: false });
    this.mark = new THREE.Group();
    this.mark.add(new THREE.Mesh(new THREE.CircleGeometry(mr * 0.35, 16), markMat(0xffffff, 0.9)));
    this.markRing = new THREE.Mesh(new THREE.RingGeometry(mr * 0.68, mr, 32), markMat(0xff6b1a, 0.95));
    this.mark.add(this.markRing);
    this.mark.visible = false; this.markR = mr;
    this.group.add(this.mark);
  }

  // show where the axe landed for the rest of the swing (dur seconds); normal points out of the struck face
  markHit(pos, normal, dur) {
    this.mark.position.copy(pos).addScaledVector(normal, 0.004);
    this.mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.markT = 0; this.markDur = dur;
    this.mark.visible = true;
  }
  updateMark(dt) {
    if (!this.mark.visible) return;
    this.markT += dt;
    const left = 1 - this.markT / this.markDur;
    if (left <= 0) { this.mark.visible = false; return; }
    this.markRing.geometry.dispose();
    this.markRing.geometry = new THREE.RingGeometry(this.markR * 0.68, this.markR, 32, 1, Math.PI / 2, Math.PI * 2 * left);
  }

  // stretch the guide bar (and chain) to the tool's bar length
  fitBar(len) {
    this.saw.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.saw.matrixWorld).invert();
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    for (const n of [this.bar, this.chain]) if (n) { tmp.setFromObject(n).applyMatrix4(inv); box.union(tmp); }
    if (box.isEmpty()) { this.barBox = new THREE.Box3(new THREE.Vector3(0.3, 0, -0.01), new THREE.Vector3(0.8, 0.08, 0.01)); return; }
    const visible = box.max.x - box.min.x;
    const s = len / Math.max(0.1, visible);
    for (const n of [this.bar, this.chain]) if (n) {
      // scale about the bar root (box.min.x) in saw space
      const pivot = box.min.x;
      n.scale.x *= s;
      n.position.x = pivot + (n.position.x - pivot) * s;
    }
    this.barBox = new THREE.Box3(box.min.clone(), new THREE.Vector3(box.min.x + len, box.max.y, box.max.z));
  }

  // place the saw so its bar lies in the cut plane with the cutting edge at the cut front
  placeSaw(kind, cut, frontX, active) {
    const tr = this.tree, h0 = tr.h0, n = cut.notch, Rc = tr.Rc;
    let y, upAxis;
    const xA = Rc - n.target;
    if (kind === 'top') { const a = deg(n.top); y = h0 + (frontX - xA) * Math.tan(a); upAxis = new THREE.Vector3(Math.cos(a), Math.sin(a), 0); }
    else if (kind === 'bottom') { const b = deg(n.bottom); y = h0 - (frontX - xA) * Math.tan(b); upAxis = new THREE.Vector3(Math.cos(b), -Math.sin(b), 0); }
    // a tapered hinge angles the back cut and bore across the stem; the bar follows that line (the strap release stays square)
    const ty = Math.tan((kind === 'back' ? cut.back?.yaw : kind === 'bore' ? cut.bore?.yaw : 0) || 0);
    if (kind === 'back' || kind === 'strap') { y = h0 + (cut.back?.step ?? cut.bore?.step ?? 0); upAxis = new THREE.Vector3(-1, 0, ty).normalize(); }
    else if (kind === 'bore') { y = h0 + (cut.bore?.step ?? 0); upAxis = new THREE.Vector3(1, 0, -ty).normalize(); }
    const xAxis = new THREE.Vector3(ty, 0, 1).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, upAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, upAxis, zAxis);
    this.saw.quaternion.setFromRotationMatrix(m);
    const bb = this.barBox;
    const edgeY = bb.min.y; // lower (cutting) edge of the bar in saw space
    const front = new THREE.Vector3(frontX, y, 0);
    const reach = Math.min(Rc + 0.06, (bb.max.x - bb.min.x) * 0.5);
    const startZ = -(Rc + 0.08);
    // saw origin = front - xAxis*(bb.min.x - startZ...) - up*edgeY
    const o = front.clone().addScaledVector(xAxis, startZ / xAxis.z - bb.min.x).addScaledVector(upAxis, -edgeY + 0.004);
    if (active) o.add(new THREE.Vector3((Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.006));
    this.saw.position.copy(o);
    this.saw.visible = true;
    if (this.chain && active) this.chain.position.y += (Math.random() - 0.5) * 0.0008;
    if (active) {
      const emit = new THREE.Vector3(frontX + (startZ + 0.1) * ty, y, startZ + 0.1);
      this.particles.emit(emit, new THREE.Vector3(0, 0.6, -2.2).add(upAxis.clone().multiplyScalar(-0.4)), 6);
    }
    // the faller stands at the side, leaning in
    this.setFaller(-0.15 - (kind === 'back' || kind === 'strap' ? 0.25 : 0), -(Rc + 0.75), y);
    void reach;
  }

  // axe: swing animation toward the target point; t in 0..1 drives one swing
  placeAxe(target, swingPhase) {
    const tr = this.tree;
    const hands = new THREE.Vector3(target.x - 0.15, Math.max(0.8, target.y + 0.45), -(tr.Rc + 0.65));
    this.axePivot.position.copy(hands);
    const dir = target.clone().sub(hands).normalize();
    const raise = Math.max(0, 1 - swingPhase) * 2.4; // 0 at impact
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const d = dir.clone().applyAxisAngle(side, raise);
    // axe +Y = handle toward head, +X = edge
    const yAxis = d;
    const xAxis = new THREE.Vector3().crossVectors(side, yAxis).normalize().negate();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    this.axePivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    const len = hands.distanceTo(target);
    this.axe.position.set(0, len - 0.78, 0);
    this.setFaller(hands.x - 0.2, hands.z - 0.35, target.y);
  }

  setFaller(x, z, workY) {
    const tr = this.tree;
    const w = tr.root.localToWorld(new THREE.Vector3(x, 0, z));
    const gy = tr.world.height(w.x, w.z) - tr.root.position.y;
    this.faller.position.set(x, gy, z);
    this.faller.rotation.y = Math.PI / 2 - 0.3;
    const crouch = THREE.MathUtils.clamp(1 - (workY - gy) / 1.0, 0, 0.6);
    this.faller.userData.torso.rotation.x = crouch * 0.9;
  }
  hideTool() { if (this.saw) this.saw.visible = false; if (this.axePivot) this.axePivot.visible = false; }

  addWedge(cut, index) {
    const tr = this.tree;
    const w = assets.wedge();
    const y = tr.h0 + (cut.back?.step ?? cut.bore?.step ?? 0);
    w.position.set(-tr.Rc - 0.02, y, (index - 1) * tr.Rc * 0.45);
    w.rotation.set(0, 0, 0);
    this.group.add(w);
    this.wedgeMeshes.push(w);
    return w;
  }
  driveWedges(depth) { for (const w of this.wedgeMeshes) w.position.x = -this.tree.Rc - 0.02 + depth; }

  update(dt) { this.particles.update(dt); this.updateMark(dt); }
  dispose() { this.group.parent?.remove(this.group); this.faller.parent?.remove(this.faller); this.particles.points.parent?.remove(this.particles.points); }
}

export class Chips {
  constructor(color) {
    this.max = 900;
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ color: new THREE.Color(color), size: 0.018, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.i = 0;
  }
  emit(p, v, n, spread = 0.8) {
    for (let k = 0; k < n; k++) {
      const i = this.i++ % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = v.x + (Math.random() - 0.5) * spread; this.vel[i * 3 + 1] = v.y + (Math.random() - 0.3) * spread; this.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
      this.life[i] = 0.6 + Math.random() * 0.8;
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt * 0.6;
      for (let a = 0; a < 3; a++) { this.vel[i * 3 + a] *= 0.985; this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; }
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0; }
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// A simple faller figure: hi-vis shirt, hard hat, chaps.
export function makeFaller() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: 0.8 });
  const vis = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
  const chaps = new THREE.MeshStandardMaterial({ color: 0x2d3640, roughness: 0.85 });
  const hat = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.4 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9 });
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.7, 4, 8);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, chaps); leg.position.set(0, 0.48, s * 0.11); g.add(leg);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.11), boot); b.position.set(0.05, 0.05, s * 0.11); g.add(b);
  }
  const torso = new THREE.Group(); torso.position.y = 0.92; g.add(torso);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), vis); body.position.y = 0.3; torso.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), skin); head.position.y = 0.72; torso.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat); helmet.position.y = 0.75; torso.add(helmet);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 18), hat); brim.position.y = 0.75; torso.add(brim);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.2), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.5 })); visor.position.set(0.13, 0.7, 0); torso.add(visor);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 4, 8), vis);
    arm.position.set(0.2, 0.38, s * 0.22); arm.rotation.z = -1.1; torso.add(arm);
  }
  g.userData.torso = torso;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
