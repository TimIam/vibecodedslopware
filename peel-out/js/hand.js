// A right hand with jointed fingers, plus the forearm and chef's sleeve back to an off-screen shoulder.
// Local frame: palm faces -y, fingers point -z, thumb on the -x side.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lerp } from './util.js';

const FINGERS = [
  { x: -0.03, len: [0.044, 0.027, 0.021], r: 0.0098 },
  { x: -0.0095, len: [0.048, 0.03, 0.022], r: 0.0102 },
  { x: 0.0115, len: [0.045, 0.028, 0.021], r: 0.0098 },
  { x: 0.031, len: [0.036, 0.022, 0.018], r: 0.0088 },
];
export const POSES = {
  open:  { curl: 0.28, thumb: 0.15, spread: 0.08 },
  relax: { curl: 0.5, thumb: 0.35, spread: 0.04 },
  grip:  { curl: 1.3, thumb: 1.0, spread: 0.0 },
  fist:  { curl: 1.75, thumb: 1.25, spread: 0.0 },
  flat:  { curl: 0.04, thumb: 0.1, spread: 0.12 },
  pinch: { curl: 0.95, thumb: 1.1, spread: 0.02 },
  toss:  { curl: 1.6, thumb: 1.2, spread: 0.0 },
};

const Z = new THREE.Vector3(0, 0, -1), Y = new THREE.Vector3(0, 1, 0);

export class Hand {
  constructor(scene, { skin = 0xe2b08c, glove = null, arm = true } = {}) {
    const mat = new THREE.MeshStandardMaterial({ color: glove ?? skin, roughness: glove ? 0.35 : 0.62, metalness: 0 });
    if (!glove) { mat.color.offsetHSL(0, -0.05, 0); }
    this.mat = mat;
    this.group = new THREE.Group(); scene.add(this.group);
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.028, 0.096, 3, 0.012), mat);
    palm.castShadow = true; this.group.add(palm);
    // a little knuckle ridge
    const knuck = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.06, 4, 8), mat); knuck.rotation.z = Math.PI / 2; knuck.position.set(0, 0.002, -0.042); knuck.castShadow = true; this.group.add(knuck);
    this.fingers = FINGERS.map(f => {
      const joints = [];
      let parent = this.group;
      f.len.forEach((l, k) => {
        const j = new THREE.Group();
        j.position.set(k === 0 ? f.x : 0, k === 0 ? 0.0 : 0, k === 0 ? -0.046 : -f.len[k - 1]);
        parent.add(j);
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(f.r * (1 - k * 0.08), Math.max(0.001, l - f.r * 1.4), 4, 8), mat);
        seg.rotation.x = Math.PI / 2; seg.position.z = -l / 2; seg.castShadow = true; j.add(seg);
        joints.push(j); parent = j;
      });
      return { joints, x: f.x };
    });
    // thumb: rooted under the index side, angled forward and in
    const t0 = new THREE.Group(); t0.position.set(-0.04, -0.006, 0.012); t0.rotation.set(0, 0.75, 0); this.group.add(t0);
    const t1 = new THREE.Group(); t1.position.z = -0.038; t0.add(t1);
    const t2 = new THREE.Group(); t2.position.z = -0.03; t1.add(t2);
    const tg = (p, l, r) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l - r * 1.4, 4, 8), mat); m.rotation.x = Math.PI / 2; m.position.z = -l / 2; m.castShadow = true; p.add(m); };
    tg(t0, 0.04, 0.0125); tg(t1, 0.032, 0.0112); tg(t2, 0.026, 0.0102);
    this.thumb = [t0, t1, t2];
    this.pose = { ...POSES.open };
    this.arm = null;
    if (arm) {
      const skinM = mat;
      const sleeve = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.85 });
      const cuffM = new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.9 });
      const mk = (g, m) => { const x = new THREE.Mesh(g, m); x.castShadow = true; x.frustumCulled = false; scene.add(x); return x; };
      this.arm = {
        wrist: mk(new THREE.CylinderGeometry(0.024, 0.027, 1, 14), skinM),
        fore: mk(new THREE.CylinderGeometry(0.03, 0.036, 1, 14), skinM),
        roll: mk(new THREE.TorusGeometry(0.043, 0.014, 8, 18), cuffM),
        upper: mk(new THREE.CylinderGeometry(0.046, 0.054, 1, 14), sleeve),
        elbow: mk(new THREE.SphereGeometry(0.046, 12, 10), sleeve),
        elbowPos: new THREE.Vector3(),
      };
    }
  }

  setPose(name, k = 1) {
    const p = POSES[name] || POSES.open;
    this.pose.curl = lerp(this.pose.curl, p.curl, k); this.pose.thumb = lerp(this.pose.thumb, p.thumb, k); this.pose.spread = lerp(this.pose.spread, p.spread, k);
    this.fingers.forEach((f, i) => {
      const c = this.pose.curl;
      f.joints[0].rotation.x = -c * 0.85; f.joints[1].rotation.x = -c * 1.0; f.joints[2].rotation.x = -c * 0.75;
      f.joints[0].rotation.y = (i - 1.5) * -this.pose.spread;
    });
    const t = this.pose.thumb;
    this.thumb[0].rotation.set(-t * 0.35, 0.75 - t * 0.45, -t * 0.25);
    this.thumb[1].rotation.x = -t * 0.55; this.thumb[2].rotation.x = -t * 0.7;
  }

  place(pos, quat) { this.group.position.copy(pos); this.group.quaternion.copy(quat); }

  // Forearm of fixed length from the wrist back toward the shoulder (near the camera); the sleeve runs the rest of the way off-screen.
  updateArm(shoulder) {
    if (!this.arm) return;
    const A = this.arm;
    const wrist = _w.set(0, 0.002, 0.06).applyQuaternion(this.group.quaternion).add(this.group.position);
    _d.subVectors(shoulder, wrist).normalize();
    A.elbowPos.copy(wrist).addScaledVector(_d, 0.3); A.elbowPos.y -= 0.04;
    _e.subVectors(wrist, A.elbowPos).normalize();
    bone(A.fore, A.elbowPos, _w2.copy(wrist).addScaledVector(_e, -0.035));
    bone(A.wrist, _w3.copy(wrist).addScaledVector(_e, -0.05), wrist);
    const cuff = _m.copy(A.elbowPos).addScaledVector(_e, 0.1);
    A.roll.position.copy(cuff); A.roll.quaternion.setFromUnitVectors(_zz.set(0, 0, 1), _e);
    bone(A.upper, shoulder, cuff);
    A.elbow.position.copy(cuff); A.elbow.scale.setScalar(0.95);
  }

  setVisible(v) { this.group.visible = v; if (this.arm) for (const k of ['wrist', 'fore', 'roll', 'upper', 'elbow']) this.arm[k].visible = v; }
}

const _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Vector3(), _zz = new THREE.Vector3();
function bone(mesh, a, b) {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  _d2.subVectors(b, a); const l = _d2.length();
  mesh.quaternion.setFromUnitVectors(Y, _d2.divideScalar(l || 1)); mesh.scale.set(1, l, 1);
}
const _d2 = new THREE.Vector3();
void Z;
