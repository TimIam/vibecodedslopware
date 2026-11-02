// First-person arms: plaid sleeves and work gloves, two-bone IK from each shoulder to its hand on the handle.
import * as THREE from 'three';

const UPPER = 0.31, FORE = 0.3;
const Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Vector3(), _w = new THREE.Vector3();

function bone(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.frustumCulled = false; return m; }
function placeBone(mesh, a, b) {
  _m.addVectors(a, b).multiplyScalar(0.5); mesh.position.copy(_m);
  _d.subVectors(b, a); const l = _d.length();
  mesh.quaternion.setFromUnitVectors(Y, _d.divideScalar(l || 1)); mesh.scale.set(1, l, 1);
}

export class Arms {
  constructor(scene, plaid) {
    const sleeve = new THREE.MeshStandardMaterial({ map: plaid, roughness: 0.95 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x7b5232, roughness: 0.78 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.85 });
    const up = new THREE.CylinderGeometry(0.041, 0.046, 1, 12, 1, true);
    const fo = new THREE.CylinderGeometry(0.033, 0.04, 1, 12, 1, true);
    const fist = new THREE.SphereGeometry(1, 14, 10);
    const elbow = new THREE.SphereGeometry(0.041, 10, 8);
    const cuffG = new THREE.CylinderGeometry(0.037, 0.037, 0.05, 12);
    this.sides = [0, 1].map(() => {
      const s = { upper: bone(up, sleeve), fore: bone(fo, sleeve), elbow: bone(elbow, sleeve), hand: bone(fist, glove), cuff: bone(cuffG, cuff), elbowPos: new THREE.Vector3() };
      s.hand.scale.set(0.044, 0.052, 0.04);
      for (const k of ['upper', 'fore', 'elbow', 'hand', 'cuff']) scene.add(s[k]);
      return s;
    });
  }

  // shoulders and hands are world points; pole hints which way each elbow bends.
  update(shoulders, hands, poles, axeQ) {
    this.sides.forEach((s, i) => {
      const S = shoulders[i], H = hands[i];
      _d.subVectors(H, S); let dist = _d.length(); _d.divideScalar(dist || 1);
      dist = Math.min(Math.max(dist, 0.08), UPPER + FORE - 0.002);
      const ca = (UPPER * UPPER + dist * dist - FORE * FORE) / (2 * UPPER * dist), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
      _p.copy(poles[i]).addScaledVector(_d, -poles[i].dot(_d)).normalize();
      s.elbowPos.copy(S).addScaledVector(_d, UPPER * ca).addScaledVector(_p, UPPER * sa);
      placeBone(s.upper, S, s.elbowPos);
      // Forearm ends at the wrist, a little short of the fist.
      _e.subVectors(H, s.elbowPos); const fl = _e.length(); _e.divideScalar(fl || 1);
      const wrist = _w.copy(H).addScaledVector(_e, -0.045);
      placeBone(s.fore, s.elbowPos, wrist);
      s.cuff.position.copy(wrist).addScaledVector(_e, -0.02); s.cuff.quaternion.setFromUnitVectors(Y, _e);
      s.elbow.position.copy(s.elbowPos);
      s.hand.position.copy(H); s.hand.quaternion.copy(axeQ);
    });
  }

  setVisible(v) { for (const s of this.sides) for (const k of ['upper', 'fore', 'elbow', 'hand', 'cuff']) s[k].visible = v; }
}
