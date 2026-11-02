// First-person arms: plaid sleeves rolled to the elbow, bare forearms and leather work gloves
// whose fingers wrap the handle. Two-bone IK from each shoulder to its hand on the handle.
import * as THREE from 'three';

const UPPER = 0.31, FORE = 0.3;
const Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Vector3(), _w = new THREE.Vector3();
const _hy = new THREE.Vector3(), _hx = new THREE.Vector3(), _hz = new THREE.Vector3(), _m4 = new THREE.Matrix4();

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// Skin with faint freckles and hair, and worn leather.
const skinTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#c98f6b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${120 + Math.random() * 40},${60 + Math.random() * 30},40,${Math.random() * 0.14})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(70,40,25,0.22)'; g.lineWidth = 0.6;
  for (let i = 0; i < 260; i++) { const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 2, y + 3 + Math.random() * 3); g.stroke(); }
});
const leatherTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#86593a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const l = Math.random(); g.fillStyle = l < 0.5 ? `rgba(40,22,10,${Math.random() * 0.18})` : `rgba(210,170,120,${Math.random() * 0.1})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  g.strokeStyle = 'rgba(30,15,5,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 8, w * 0.6, y - 8, w, y + Math.random() * 6); g.stroke(); }
});

// A limb segment along +Y from 0 to 1 with a muscle-ish radius profile (scaled to length at runtime).
function limb(profile, seg = 16) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return g;
}

// One gloved hand in its own frame: the handle runs along Y through the origin, the wrist is toward -X.
function gloveGeometry() {
  const parts = [];
  const palm = new THREE.SphereGeometry(1, 16, 12); palm.scale(0.024, 0.047, 0.031); palm.translate(-0.026, 0, 0.004); parts.push(palm);
  const back = new THREE.BoxGeometry(0.02, 0.07, 0.04, 1, 1, 1); back.translate(-0.036, 0, 0.002); parts.push(back);
  // Four fingers curled round the handle, the little finger smallest.
  [[0.031, 0.0185, 0.0098], [0.0105, 0.0195, 0.0105], [-0.0105, 0.0192, 0.0104], [-0.03, 0.0178, 0.0093]].forEach(([y, R, tube]) => {
    const f = new THREE.TorusGeometry(R + tube * 0.55, tube, 8, 16, Math.PI * 1.45);
    f.rotateX(Math.PI / 2); f.rotateY(Math.PI * 0.32); f.translate(0, y, 0); parts.push(f);
    const tip = new THREE.SphereGeometry(tube * 1.02, 8, 6);
    const a = Math.PI * 0.32 + Math.PI * 1.45; // where the curl ends
    tip.translate(Math.cos(a) * (R + tube * 0.55), y, -Math.sin(a) * (R + tube * 0.55)); parts.push(tip);
  });
  // Thumb across the top of the fingers.
  const thumb = new THREE.CapsuleGeometry(0.0105, 0.034, 4, 8); thumb.rotateZ(Math.PI / 2 - 0.35); thumb.translate(-0.006, 0.046, 0.02); parts.push(thumb);
  const geos = parts.map(p => (p.index ? p.toNonIndexed() : p));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

const _s = new THREE.Vector3();
function segDist(p, a, b) {
  _s.subVectors(b, a); const t = Math.max(0, Math.min(1, _s.dot(_e2.subVectors(p, a)) / Math.max(1e-9, _s.lengthSq())));
  return _e2.copy(a).addScaledVector(_s, t).distanceTo(p);
}
const _e2 = new THREE.Vector3();
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.frustumCulled = false; return m; }
function placeBone(m, a, b) {
  _d.subVectors(b, a); const l = _d.length();
  m.position.copy(a); m.quaternion.setFromUnitVectors(Y, _d.divideScalar(l || 1)); m.scale.set(1, l, 1);
}

export class Arms {
  constructor(scene, plaid) {
    const sleeve = new THREE.MeshStandardMaterial({ map: plaid, roughness: 0.95 });
    const rolled = new THREE.MeshStandardMaterial({ map: plaid, roughness: 0.95, color: 0xcfc4c4 });
    const skin = new THREE.MeshStandardMaterial({ map: skinTex(), roughness: 0.62 });
    const leather = new THREE.MeshStandardMaterial({ map: leatherTex(), roughness: 0.7 });
    const cuffLeather = new THREE.MeshStandardMaterial({ map: leatherTex(), roughness: 0.75, color: 0xb8a088, side: THREE.DoubleSide });
    const upperG = limb([[0, 0], [0.03, 0.015], [0.044, 0.04], [0.05, 0.12], [0.053, 0.38], [0.049, 0.7], [0.045, 0.94], [0.036, 0.98], [0, 1]]);
    const foreG = limb([[0, 0], [0.028, 0.02], [0.039, 0.06], [0.042, 0.12], [0.041, 0.35], [0.035, 0.7], [0.03, 0.95], [0.022, 0.99], [0, 1]]);
    const elbowG = new THREE.SphereGeometry(0.044, 14, 10);
    const rollG = new THREE.TorusGeometry(0.046, 0.017, 10, 20); rollG.rotateX(Math.PI / 2);
    const roll2G = new THREE.TorusGeometry(0.044, 0.013, 8, 20); roll2G.rotateX(Math.PI / 2);
    const cuffG = new THREE.CylinderGeometry(0.036, 0.046, 0.06, 16, 1, true); cuffG.translate(0, 0.03, 0);
    const gloveG = gloveGeometry();
    this.shown = true;
    this.sides = [0, 1].map(() => {
      const s = {
        upper: mesh(upperG, sleeve), elbow: mesh(elbowG, sleeve), roll: mesh(rollG, rolled), roll2: mesh(roll2G, rolled),
        fore: mesh(foreG, skin), cuff: mesh(cuffG, cuffLeather), hand: mesh(gloveG, leather), elbowPos: new THREE.Vector3(),
      };
      for (const k of Arms.PARTS) scene.add(s[k]);
      return s;
    });
  }

  // shoulders and hands are world points; pole hints which way each elbow bends.
  update(shoulders, hands, poles, axeQ, eye = null) {
    _hy.set(0, 1, 0).applyQuaternion(axeQ);
    this.sides.forEach((s, i) => {
      const S = shoulders[i], H = hands[i];
      _d.subVectors(H, S); let dist = _d.length(); _d.divideScalar(dist || 1);
      dist = Math.min(Math.max(dist, 0.08), UPPER + FORE - 0.002);
      const ca = (UPPER * UPPER + dist * dist - FORE * FORE) / (2 * UPPER * dist), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
      _p.copy(poles[i]).addScaledVector(_d, -poles[i].dot(_d)).normalize();
      s.elbowPos.copy(S).addScaledVector(_d, UPPER * ca).addScaledVector(_p, UPPER * sa);
      placeBone(s.upper, S, s.elbowPos);
      s.elbow.position.copy(s.elbowPos);
      // Forearm runs to the wrist, which sits just behind the fist.
      _e.subVectors(H, s.elbowPos).normalize();
      // The hand's frame: handle along Y, wrist toward -X.
      _hx.copy(_e).addScaledVector(_hy, -_e.dot(_hy));
      if (_hx.lengthSq() < 1e-6) _hx.set(1, 0, 0).applyQuaternion(axeQ);
      _hx.normalize(); _hz.crossVectors(_hx, _hy);
      _m4.makeBasis(_hx, _hy, _hz); s.hand.quaternion.setFromRotationMatrix(_m4);
      s.hand.position.copy(H);
      const wrist = _w.copy(H).addScaledVector(_hx, -0.05);
      placeBone(s.fore, s.elbowPos, wrist);
      // Sleeve rolled up just below the elbow, glove cuff flaring over the wrist.
      _m.subVectors(wrist, s.elbowPos).normalize();
      s.roll.position.copy(s.elbowPos).addScaledVector(_m, 0.035); s.roll.quaternion.setFromUnitVectors(Y, _m);
      s.roll2.position.copy(s.elbowPos).addScaledVector(_m, 0.062); s.roll2.quaternion.setFromUnitVectors(Y, _m);
      s.cuff.position.copy(wrist).addScaledVector(_m, -0.035); s.cuff.quaternion.setFromUnitVectors(Y, _m);
      // Raising the axe brings the elbows past your face: drop whatever would fill the screen.
      if (eye) {
        const nearUpper = segDist(eye, S, s.elbowPos) < 0.25 && s.elbowPos.y > eye.y - 0.32, nearFore = segDist(eye, s.elbowPos, wrist) < 0.14;
        s.upper.visible = s.elbow.visible = s.roll.visible = s.roll2.visible = this.shown && !nearUpper && !nearFore;
        s.fore.visible = s.cuff.visible = this.shown && !nearFore;
      }
    });
  }

  setVisible(v) { this.shown = v; for (const s of this.sides) for (const k of Arms.PARTS) s[k].visible = v; }
}
Arms.PARTS = ['upper', 'elbow', 'roll', 'roll2', 'fore', 'cuff', 'hand'];
