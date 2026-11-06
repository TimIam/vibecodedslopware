// Visual rig: the faller, the chainsaw or axe placed on the active cut, wedges, sawdust/chips.
import * as THREE from 'three';
import { assets } from './assets.js';
import { Faller, makeCapsuleFaller } from './faller.js';

// grip points in each tool's own model space (see the handle geometry in tools/blender/build_assets.py)
const SAW_REAR_GRIP = new THREE.Vector3(-0.05, -0.004, 0.0);
const SAW_FRONT_GRIP = new THREE.Vector3(0.21, 0.05, -0.12);
const AXE_GRIPS = [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 0.24, 0)];

const deg = THREE.MathUtils.degToRad;

export class Rig {
  constructor(tree, tool) {
    this.tree = tree; this.tool = tool;
    this.group = new THREE.Group();
    tree.leanGroup.add(this.group);
    const model = assets.faller();
    this.fig = model ? new Faller(model) : null;
    if (this.fig && !this.fig.ok) this.fig = null;
    this.faller = this.fig ? this.fig.root : makeCapsuleFaller();
    tree.root.add(this.faller);
    this.mode = 'idle'; this.dt = 1 / 60;
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
    // the faller stands behind the rear handle and holds both handles
    this.saw.updateMatrixWorld(true);
    const rear = this.saw.localToWorld(SAW_REAR_GRIP.clone()), fore = this.saw.localToWorld(SAW_FRONT_GRIP.clone());
    const rl = tr.root.worldToLocal(rear.clone());
    this.workAt(rl, rear, fore, tr.leanGroup.localToWorld(new THREE.Vector3(frontX, y, 0)));
    void reach;
  }

  // axe: swing animation toward the target point; t in 0..1 drives one swing
  placeAxe(target, swingPhase) {
    const tr = this.tree;
    // the swing turns about the shoulders, so the hands travel overhead and down with the axe
    const shoulder = new THREE.Vector3(target.x - 0.12, Math.max(1.15, target.y + 0.95), -(tr.Rc + 0.72));
    this.axePivot.position.copy(shoulder);
    this.axePivot.visible = true;
    const dir = target.clone().sub(shoulder).normalize();
    const raise = Math.max(0, 1 - swingPhase) * 2.3; // 0 at impact
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const d = dir.clone().applyAxisAngle(side, raise);
    // axe +Y = handle toward head, +X = edge
    const yAxis = d;
    const xAxis = new THREE.Vector3().crossVectors(side, yAxis).normalize().negate();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    this.axePivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    const len = shoulder.distanceTo(target);
    this.axe.position.set(0, len - 0.86, 0); // head (0.86 up the handle) on the target at impact
    this.axe.updateMatrixWorld(true);
    const g0 = this.axe.localToWorld(AXE_GRIPS[0].clone()), g1 = this.axe.localToWorld(AXE_GRIPS[1].clone());
    this.workAt(tr.root.worldToLocal(g0.clone()), g0, g1, this.group.localToWorld(target.clone()), true);
  }

  // Stand the faller so the right-hand grip is in front of them, then pose: stance from grip height, IK onto both grips.
  workAt(gripLocal, rightW, leftW, lookW, axe = false) {
    const tr = this.tree;
    if (!this.fig) { this.setFaller(gripLocal.x - 0.3, gripLocal.z - 0.35, gripLocal.y); return; }
    // face the trunk from the grip; stand back from it and a little to its left (the grip is in the right hand)
    const fx = -gripLocal.x, fz = -gripLocal.z, fl = Math.hypot(fx, fz) || 1;
    const f = { x: fx / fl, z: fz / fl }, right = { x: -f.z, z: f.x };
    const back = axe ? 0.62 : 0.4, side = axe ? 0.05 : 0.17;
    const x = gripLocal.x - f.x * back - right.x * side, z = gripLocal.z - f.z * back - right.z * side;
    this.place(x, z, Math.atan2(-f.z, f.x));
    const gy = this.faller.position.y;
    const workY = gripLocal.y - gy;
    this.mode = 'work';
    const fig = this.fig;
    fig.rest();
    fig.stance(workY, THREE.MathUtils.clamp((0.95 - workY) * 0.7, 0, 0.55));
    this.faller.updateMatrixWorld(true);
    const q = this.faller.getWorldQuaternion(new THREE.Quaternion());
    const R = new THREE.Vector3(0, 0, 1).applyQuaternion(q), F = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const sh = fig.j.chest.getWorldPosition(new THREE.Vector3());
    fig.reach('R', rightW, sh.clone().addScaledVector(R, 0.6).addScaledVector(F, -0.3).add(new THREE.Vector3(0, -0.5, 0)));
    fig.reach('L', leftW, sh.clone().addScaledVector(R, -0.6).addScaledVector(F, -0.1).add(new THREE.Vector3(0, -0.6, 0)));
    fig.look(lookW);
    void tr;
  }

  // position on the ground (tree-root frame) with a yaw
  place(x, z, yaw) {
    const tr = this.tree;
    const w = tr.root.localToWorld(new THREE.Vector3(x, 0, z));
    const gy = tr.world.height(w.x, w.z) - tr.root.position.y;
    this.faller.position.set(x, gy, z);
    this.faller.rotation.y = yaw;
  }

  // idle (standing by, facing the trunk) or walking (retreat: face the way they're moving)
  setFaller(x, z, workY, mode = 'idle') {
    const prev = this.faller.position.clone();
    const moving = mode === 'walk' && Math.hypot(x - prev.x, z - prev.z) > 1e-4;
    const yaw = moving ? Math.atan2(-(z - prev.z), x - prev.x) : mode === 'walk' ? this.faller.rotation.y : Math.atan2(z, -x);
    this.place(x, z, yaw);
    this.mode = mode;
    if (!this.fig) return;
    this.fig.rest();
    if (mode === 'walk') this.fig.walk(this.dt);
    else { this.fig.stance(1.6); this.fig.armsFree(0); }
    void workY;
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

  update(dt) { this.dt = dt; this.particles.update(dt); this.updateMark(dt); this.fig?.tick(dt); }
  dispose() { this.group.parent?.remove(this.group); this.faller.parent?.remove(this.faller); this.particles.points.parent?.remove(this.particles.points); }
}

// soft round sprite shared by all particle systems
let dotTex = null;
function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}

export class Chips {
  constructor(color) {
    this.max = 900;
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.base = new THREE.Color(color);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.026, sizeAttenuation: true, map: softDot(), vertexColors: true, transparent: true, alphaTest: 0.08, depthWrite: false }));
    this.points.frustumCulled = false;
    this.i = 0;
  }
  emit(p, v, n, spread = 0.8) {
    for (let k = 0; k < n; k++) {
      const i = this.i++ % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const shade = 0.75 + Math.random() * 0.4; // fresh chips and darker bark flecks
      this.col[i * 3] = this.base.r * shade; this.col[i * 3 + 1] = this.base.g * shade; this.col[i * 3 + 2] = this.base.b * shade * (0.9 + Math.random() * 0.1);
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
    this.geo.attributes.color.needsUpdate = true;
  }
}

