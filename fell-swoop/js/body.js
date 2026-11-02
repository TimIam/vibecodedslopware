// The lumberjack's body for the third-person camera: boots, jeans, plaid shirt, beard, beanie.
// The arms are drawn by arms.js from the shoulders this body puts them on.
import * as THREE from 'three';

function m(geo, mat) { const o = new THREE.Mesh(geo, mat); o.castShadow = true; o.receiveShadow = true; return o; }

export class Lumberjack {
  constructor(scene, plaid) {
    const shirt = new THREE.MeshStandardMaterial({ map: plaid, roughness: 0.95 });
    const denim = new THREE.MeshStandardMaterial({ color: 0x3c4d6b, roughness: 0.9 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98f6b, roughness: 0.65 });
    const beard = new THREE.MeshStandardMaterial({ color: 0x6e3c22, roughness: 1 });
    const hat = new THREE.MeshStandardMaterial({ color: 0xc4562d, roughness: 0.95 });
    const belt = new THREE.MeshStandardMaterial({ color: 0x2c1c12, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.5 });
    this.root = new THREE.Group(); scene.add(this.root);
    this.torso = new THREE.Group(); this.torso.position.y = 0.95; this.root.add(this.torso);
    // Torso: a squashed capsule, a little barrel-chested.
    const chest = new THREE.CapsuleGeometry(0.17, 0.3, 6, 16); chest.scale(1.12, 1, 0.72); chest.translate(0, 0.25, 0);
    this.torso.add(m(chest, shirt));
    const beltG = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 20); beltG.scale(1, 1, 0.7); beltG.translate(0, 0.02, 0);
    this.torso.add(m(beltG, belt));
    for (const s of [-1, 1]) { const sh = m(new THREE.SphereGeometry(0.06, 12, 10), shirt); sh.position.set(s * 0.19, 0.44, -0.07 + 0.07); this.torso.add(sh); }
    // Head.
    const head = new THREE.Group(); head.position.set(0, 0.68, 0.0); this.torso.add(head); this.head = head;
    const neck = m(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skin); neck.position.y = -0.08; head.add(neck);
    const skull = m(new THREE.SphereGeometry(0.105, 18, 14), skin); skull.scale.set(0.95, 1.08, 1); head.add(skull);
    const nose = m(new THREE.SphereGeometry(0.022, 8, 6), skin); nose.position.set(0, -0.005, -0.1); head.add(nose);
    for (const s of [-1, 1]) { const e = m(new THREE.SphereGeometry(0.011, 6, 5), dark); e.position.set(s * 0.038, 0.025, -0.092); head.add(e); }
    const bG = new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55); bG.scale(1, 1.15, 0.9);
    const bd = m(bG, beard); bd.position.set(0, -0.02, -0.025); head.add(bd);
    const capG = new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5); capG.scale(1, 1.15, 1);
    const cap = m(capG, hat); cap.position.y = 0.025; head.add(cap);
    const brim = m(new THREE.TorusGeometry(0.106, 0.022, 8, 20), hat); brim.rotation.x = Math.PI / 2; brim.position.y = 0.035; head.add(brim);
    const pom = m(new THREE.SphereGeometry(0.03, 8, 6), hat); pom.position.y = 0.16; head.add(pom);
    // Legs swing from the hips.
    this.legs = [-1, 1].map(s => {
      const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.95, 0); this.root.add(hip);
      const leg = m(new THREE.CapsuleGeometry(0.068, 0.72, 4, 12), denim); leg.position.y = -0.43; hip.add(leg);
      const bt = m(new THREE.BoxGeometry(0.13, 0.11, 0.25), boot); bt.position.set(0, -0.88, -0.04); hip.add(bt);
      return hip;
    });
  }

  // pos: feet; yaw: facing; twist: torso twist; walk: stride phase; moving: 0..1; dead: lie down.
  update(pos, yaw, twist, sway, walk, moving, dead, dt) {
    this.root.position.copy(pos).add(sway);
    this.root.rotation.set(0, yaw, 0);
    this.torso.rotation.set(0, twist * 1.4, 0);
    this.legs.forEach((hip, i) => { hip.rotation.x = Math.sin(walk + i * Math.PI) * 0.45 * moving; });
    this.fall = dead ? Math.min(1, (this.fall || 0) + dt * 2.2) : 0;
    if (this.fall) { this.root.rotation.x = -this.fall * Math.PI / 2 * 0.98; this.root.position.y += 0.1 * this.fall; }
  }
  setVisible(v) { this.root.visible = v; }
}
