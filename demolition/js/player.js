// First-person controller on a Rapier character controller, plus the three tools.
import * as THREE from 'three';
import { PLAYER, TOOLS } from './config.js';

const VM_LAYER = 1; // the viewmodel lives on its own layer and is drawn after the frame by vmCamera, so it never clips into walls
const GROUPS = 0x0001FFFB; // membership bit 1, collides with everything except bit 3 (loose debris)
const CROUCH = { half: 0.3, eye: 1.0, speed: 0.55, jump: 0.7 };
const STAND_HALF = PLAYER.height / 2 - PLAYER.radius;

const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
const E = {
  out: t => 1 - (1 - t) * (1 - t), out3: t => 1 - (1 - t) ** 3,
  inOut: t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t),
  inP: p => t => t ** p,
};

// Keyframe poses of the tool rig in viewmodel space (x right, y up, -z forward). The tool's handle runs along its local +Y from
// the butt (origin). r = Euler 'YZX': r[0] swings the handle in its plane (0 upright, negative = head forward/down,
// positive = head back over the shoulder), r[2] tilts the swing plane sideways, r[1] yaws it. w = twist of the whole body
// (viewmodel root) and slide = how far up the handle the leading hand sits.
const P = (p, r, slide, w = [0, 0, 0], roll = 0) => ({ p, r, slide, w, roll });
const POSES = {
  hammer: {
    rest:    P([0.10, -0.43, -0.42], [-0.55, 0.15, -0.62], 0.33),
    windup:  P([0.12, -0.24, -0.42], [0.35, 0.15, -0.40], 0.46, [0.04, -0.10, -0.07]),
    contact: P([0.12, -0.42, -0.24], [-1.02, -0.10, 0.30], 0.14, [-0.03, 0.05, 0.04]),
    recoil:  P([0.12, -0.39, -0.23], [-0.86, -0.10, 0.30], 0.15, [0.02, 0.03, 0.02]),
    whiff:   P([0.07, -0.48, -0.27], [-1.50, -0.12, 0.34], 0.12, [-0.06, 0.08, 0.06]),
  },
  axe: { // faster, flatter diagonal chop; roll turns the bit so its profile shows at rest
    rest:    P([0.12, -0.46, -0.40], [-0.70, 0.20, -0.50], 0.34, [0, 0, 0], 1.3),
    windup:  P([0.15, -0.25, -0.42], [0.30, 0.20, -0.75], 0.46, [0.03, -0.10, -0.07], 0.25),
    contact: P([-0.12, -0.37, -0.26], [-1.05, 0.08, -0.42], 0.24, [-0.02, 0.05, 0.04], 0.5),
    recoil:  P([-0.10, -0.34, -0.26], [-0.90, 0.08, -0.42], 0.25, [0.01, 0.03, 0.02], 0.5),
    whiff:   P([-0.18, -0.44, -0.28], [-1.55, 0.04, -0.50], 0.22, [-0.04, 0.08, 0.05], 0.5),
  },
};
// seconds; windup + strike always equals TOOLS[tool].swing so the head arrives as resolveHit() fires
const TIMING = {
  hammer: { windup: 0.42, impact: 0.11, whiff: 0.17, recover: 0.36, kick: 1.0 },
  axe:    { windup: 0.38, impact: 0.08, whiff: 0.12, recover: 0.24, kick: 0.6 },
};
// open-hand poses for the 'hands' tool (left hand; the right is mirrored). Euler XYZ.
const HANDS = {
  idle:  { p: [-0.20, -0.21, -0.42], r: [0.35, 0.25, 0.55] },
  push:  { p: [-0.16, -0.15, -0.46], r: [1.40, 0.18, 0.10] },
  carry: { p: [-0.25, -0.24, -0.62], r: [0.15, 0.10, 1.25] },
};
const SHOULDER = { L: new THREE.Vector3(-0.24, -0.48, 0.2), R: new THREE.Vector3(0.24, -0.48, 0.2) };

function canvasTex(w, h, draw, srgb = true, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4; return t;
}
function grain(x, w, h, base, dark) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    const px = Math.random() * w; x.strokeStyle = `rgba(${dark},${0.08 + Math.random() * 0.3})`; x.lineWidth = 0.4 + Math.random() * 1.6;
    x.beginPath(); x.moveTo(px, 0); for (let y = 0; y <= h; y += 16) x.lineTo(px + Math.sin(y * 0.02 + i) * 1.5 + (Math.random() - 0.5) * 0.6, y); x.stroke();
  }
}
function forged(x, w, h) { // worn steel: mottled scale plus a few bright scratches
  x.fillStyle = '#8a8d90'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const g = 100 + Math.random() * 70 | 0; x.fillStyle = `rgba(${g},${g},${g + 4},0.35)`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(200,203,206,${0.2 + Math.random() * 0.4})`; x.lineWidth = 0.5; x.beginPath(); const sx = Math.random() * w, sy = Math.random() * h; x.moveTo(sx, sy); x.lineTo(sx + (Math.random() - 0.5) * 30, sy + (Math.random() - 0.5) * 30); x.stroke(); }
}
// oval lathe along +Y: profile [[r, y], ...], scaled in X/Z for an oval section
function lathe(profile, seg, sx, sz, mat) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.scale(sx, 1, sz); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
// hickory handle radius along its length (shared by the handle and the rubber grip that wraps it)
const handleR = y => y < 0.012 ? 0.017 + y * 0.2 : y < 0.04 ? 0.0195 - (y - 0.012) * 0.035 : y < 0.12 ? 0.0185 - (y - 0.04) * 0.025 : y < 0.78 ? 0.0165 - (y - 0.12) * 0.0028 : 0.0147 + (y - 0.78) * 0.035;

export class Player {
  constructor(G, camera) {
    this.G = G; this.cam = camera; const { R, phys } = G;
    this.yaw = Math.PI / 2; this.pitch = 0; this.keys = {}; this.vy = 0; this.grounded = false;
    this.body = phys.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(10.5, 0.9, 4.5));
    this.col = phys.createCollider(R.ColliderDesc.capsule(STAND_HALF, PLAYER.radius).setFriction(0), this.body);
    this.col.setCollisionGroups(GROUPS);
    G.ents.set(this.col.handle, { kind: 'player' });
    this.cc = phys.createCharacterController(0.02);
    this.cc.enableAutostep(0.35, 0.2, true); this.cc.enableSnapToGround(0.3); this.cc.setApplyImpulsesToDynamicBodies(true); this.cc.setCharacterMass(85);
    this.cc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.tool = 'hammer'; this.cooldown = 0; this.pendingHit = null; this.carrying = null; this.pushing = false; this.bob = 0; this.lmb = false;
    this.crouched = false; this.eyeH = PLAYER.eye;
    // viewmodel animation state
    this.kick = new THREE.Vector3(); this.kickVel = new THREE.Vector3(); this.time = 0;
    this.vmShown = 'hammer'; this.switchP = 0; this.moveAmt = 0; this.sprintAmt = 0; this.lag = new THREE.Vector2(); this.lastLook = new THREE.Vector2(this.yaw, this.pitch);
    this.pushW = 0; this.carryW = 0; this.jab = 0;
    this.anim = { state: 'idle', t: 0, dur: 1, from: null, to: null };
    this.poses = { POSES, TIMING, HANDS, SHOULDER }; // live-tunable from the console
    this.viewmodel = this.buildViewmodel(); camera.add(this.viewmodel);
    this.vmCamera = new THREE.PerspectiveCamera(60, camera.aspect, 0.01, 10); this.vmCamera.layers.set(VM_LAYER);
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
    // the viewmodel lowers the old tool and raises the new one in update()
  }

  // ------------------------------------------------------------------ viewmodel construction
  buildViewmodel() {
    const root = new THREE.Group(); this.vm = {}; this.vmRoot = root;
    const sway = new THREE.Group(); root.add(sway); this.vmSway = sway;
    const M = this.vmMats = {
      steel: new THREE.MeshStandardMaterial({ color: 0xbfc2c5, map: canvasTex(128, 128, forged, true, 6), roughnessMap: canvasTex(128, 128, forged, false, 6), roughness: 0.62, metalness: 0.7 }),
      face: new THREE.MeshStandardMaterial({ color: 0x6d7174, roughness: 0.34, metalness: 0.78 }),
      edge: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.26, metalness: 0.9 }),
      wedge: new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.5, metalness: 0.75 }),
      wood: new THREE.MeshStandardMaterial({ map: canvasTex(64, 256, (x, w, h) => grain(x, w, h, '#c9ab84', '96,66,36')), roughness: 0.72 }),
      woodVarnish: new THREE.MeshStandardMaterial({ map: canvasTex(64, 256, (x, w, h) => grain(x, w, h, '#cfa978', '98,62,30')), roughness: 0.42 }),
      endGrain: new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.85 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.88 }),
      paint: new THREE.MeshStandardMaterial({ color: 0xa3141a, roughness: 0.36, metalness: 0.15 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x2d2c2a, roughness: 0.92 }),
      knuckle: new THREE.MeshStandardMaterial({ color: 0x3c3a36, roughness: 0.8 }),
      cuff: new THREE.MeshStandardMaterial({ color: 0x7c6038, roughness: 0.85 }),
      sleeve: new THREE.MeshStandardMaterial({ color: 0x2d3e7a, roughness: 0.92 }),
    };
    this.vm.hammer = this.buildHammer(M); this.vm.axe = this.buildAxe(M);
    const rig = new THREE.Group(); sway.add(rig); this.vmRig = rig;
    rig.add(this.vm.hammer); rig.add(this.vm.axe);
    // open hands for the 'hands' tool
    const hands = new THREE.Group(); sway.add(hands); this.vm.hands = hands;
    this.openHands = [-1, 1].map(s => { const h = this.buildOpenHand(M, s); hands.add(h); return h; });
    // arms (glove fist + cuff + sleeve) are placed every frame from the grip anchors toward the shoulders
    this.arms = { L: this.buildArm(M, -1), R: this.buildArm(M, 1) }; root.add(this.arms.L); root.add(this.arms.R);
    root.traverse(o => { o.layers.set(VM_LAYER); if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
    this.cur = this.clonePose(POSES.hammer.rest);
    for (const k in this.vm) this.vm[k].visible = k === 'hammer';
    this.setTool('hammer');
    return root;
  }
  buildHammer(M) {
    const g = new THREE.Group();
    // 0.9 m hickory handle: oval, swelled at the butt, tapering toward the head and flaring into the eye
    const prof = [[0, 0]]; for (const y of [0.002, 0.012, 0.04, 0.12, 0.3, 0.5, 0.7, 0.78, 0.82, 0.86, 0.9]) prof.push([handleR(y), y]); prof.push([0, 0.902]);
    g.add(lathe(prof, 14, 0.86, 1.18, M.wood));
    // ribbed rubber grip over the bottom 0.26 m
    const gp = [[0, -0.003], [0.019, -0.003]]; for (let i = 0; i <= 22; i++) { const y = 0.004 + i * 0.0118; gp.push([handleR(y) + 0.0034 + (i % 2 ? 0.0012 : 0) + (i < 2 ? 0.002 : 0), y]); } gp.push([handleR(0.27) + 0.001, 0.272]);
    g.add(lathe(gp, 14, 0.86, 1.18, M.rubber));
    // forged double-faced head, 0.19 m long, chamfered square section, long axis along Z (faces strike toward -Z)
    const s = 0.024, c = 0.008, sh = new THREE.Shape();
    sh.moveTo(-s + c, -s); sh.lineTo(s - c, -s); sh.lineTo(s, -s + c); sh.lineTo(s, s - c); sh.lineTo(s - c, s); sh.lineTo(-s + c, s); sh.lineTo(-s, s - c); sh.lineTo(-s, -s + c); sh.closePath();
    const L = 0.172, hg = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.0055, bevelSegments: 2, curveSegments: 1 });
    hg.translate(0, 0, -L / 2); hg.computeVertexNormals();
    const headY = 0.871, head = new THREE.Group(); head.position.y = headY; g.add(head);
    head.add(new THREE.Mesh(hg, M.steel));
    // slightly crowned striking faces
    for (const z of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 3, 0, Math.PI * 2, 0, 0.34), M.face);
      cap.rotation.x = z * Math.PI / 2; cap.position.z = z * (L / 2 + 0.009 - 0.07 * Math.cos(0.34)); head.add(cap);
    }
    // a raised boss round the eye on both cheeks
    for (const x of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.006, 14), M.steel); b.rotation.z = Math.PI / 2; b.scale.set(1, 1, 1.25); b.position.x = x * (s + 0.0055 + 0.002); head.add(b); }
    // the eye: end grain flush with the top, a steel wedge and a round pin wedge driven across it
    const eg = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0158, 0.002, 14), M.endGrain); eg.scale.set(0.86, 1, 1.18); eg.position.y = 0.9025; g.add(eg);
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.004, 0.034), M.wedge); w1.position.y = 0.9035; w1.rotation.y = 0.12; g.add(w1);
    const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 8), M.wedge); w2.position.set(0.006, 0.9035, 0.002); g.add(w2);
    // the boss also on the underside where the handle enters
    const nb = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.006, 14), M.steel); nb.scale.set(1.15, 1, 1.3); nb.position.y = headY - s - 0.0055 - 0.003; g.add(nb);
    this.addGrips(g, 0.07);
    return g;
  }
  buildAxe(M) {
    const g = new THREE.Group();
    // varnished hickory with a fawn's-foot butt that flares and kicks toward the bit side
    const prof = [[0, 0], [0.019, 0.002], [0.0225, 0.014], [0.021, 0.032], [0.0175, 0.06], [0.0155, 0.11], [0.0146, 0.4], [0.0142, 0.72], [0.0152, 0.8], [0.0162, 0.85], [0.0165, 0.9], [0, 0.902]];
    const hm = lathe(prof, 14, 0.82, 1.2, M.woodVarnish); const pa = hm.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y < 0.08) { const k = 0.08 - y; let z = pa.getZ(i); if (z < 0) z *= 1 + k * 7; pa.setZ(i, z - k * k * 2.2); } }
    hm.geometry.computeVertexNormals(); g.add(hm);
    // head outline in (forward, up); extruded through its thickness and tapered to an edge and a pick point
    const top = { a: [-0.03, 0.042], c: [0.06, 0.036], b: [0.134, 0.074] }, bot = { a: [0.03, -0.042], c: [0.07, -0.034], b: [0.126, -0.098] };
    const edge = { a: [0.134, 0.074], c: [0.172, -0.012], b: [0.126, -0.098] };
    const sh = new THREE.Shape(); sh.moveTo(...top.a); sh.quadraticCurveTo(...top.c, ...top.b); sh.quadraticCurveTo(...edge.c, ...edge.b);
    sh.quadraticCurveTo(...bot.c, ...bot.a); sh.lineTo(-0.03, -0.042); sh.quadraticCurveTo(-0.095, -0.022, -0.178, -0.036); sh.quadraticCurveTo(-0.1, 0.018, -0.03, 0.042);
    const T = 0.034, taper = x => x > 0.03 ? 1 - 0.88 * E.out(clamp01((x - 0.03) / 0.12)) : x < -0.03 ? 1 - 0.72 * clamp01((-x - 0.03) / 0.15) : 1;
    const build = (shape, mat, grow) => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 1, curveSegments: 10 });
      geo.translate(0, 0, -T / 2); const a = geo.attributes.position;
      for (let i = 0; i < a.count; i++) { const z = a.getZ(i); a.setZ(i, z * taper(a.getX(i)) + Math.sign(z) * grow); }
      geo.rotateY(Math.PI / 2); geo.computeVertexNormals(); return new THREE.Mesh(geo, mat);
    };
    const head = new THREE.Group(); head.position.y = 0.86; g.add(head);
    head.add(build(sh, M.paint, 0));
    // ground steel edge: a band 22 mm deep following the bit
    const q = (o, t) => [(1 - t) ** 2 * o.a[0] + 2 * (1 - t) * t * o.c[0] + t * t * o.b[0], (1 - t) ** 2 * o.a[1] + 2 * (1 - t) * t * o.c[1] + t * t * o.b[1]];
    const yAt = (o, x) => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (q(o, m)[0] < x) lo = m; else hi = m; } return q(o, lo)[1]; };
    const band = 0.022, es = new THREE.Shape(), pts = []; for (let i = 0; i <= 12; i++) pts.push(q(edge, i / 12));
    es.moveTo(...pts[0]); for (const p of pts.slice(1)) es.lineTo(...p);
    es.lineTo(bot.b[0] - band, yAt(bot, bot.b[0] - band) + 0.001);
    for (let i = 11; i >= 1; i--) { const p = q(edge, i / 12); es.lineTo(p[0] - band, p[1]); }
    es.lineTo(top.b[0] - band, yAt(top, top.b[0] - band) - 0.001); es.closePath();
    head.add(build(es, M.edge, 0.0005));
    // ground point on the pick
    const ps = new THREE.Shape(); ps.moveTo(-0.178, -0.036); ps.lineTo(-0.15, -0.012); ps.lineTo(-0.148, -0.034); ps.closePath();
    head.add(build(ps, M.edge, 0.0004));
    // eye: end grain and wedge
    const eg = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0158, 0.002, 14), M.endGrain); eg.scale.set(0.82, 1, 1.2); eg.position.y = 0.9025; g.add(eg);
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.032), M.wedge); w1.position.y = 0.9035; g.add(w1);
    this.addGrips(g, 0.075);
    return g;
  }
  addGrips(g, buttY) { // where the two fists sit on the handle; the lead hand slides along it during the swing
    const back = new THREE.Object3D(); back.position.y = buttY; g.add(back);
    const front = new THREE.Object3D(); front.position.y = 0.4; g.add(front);
    g.userData.grips = { back, front };
  }
  // a gloved arm: fist (fingers wrapped round the handle) + back of hand + leather cuff + jacket sleeve.
  // Local frame: origin on the handle axis, +Y along the handle, +Z toward the shoulder, the back of the hand on +X*side.
  buildArm(M, side) {
    const arm = new THREE.Group(), fist = new THREE.Group(); arm.add(fist); arm.userData.fist = fist;
    if (side < 0) fist.rotation.z = Math.PI; // mirror by turning round the forearm axis
    const ring = 0.0285;
    [-0.034, -0.0115, 0.0115, 0.034].forEach((y, i) => {
      const f = new THREE.Mesh(new THREE.TorusGeometry(ring, 0.0118 - i * 0.0006, 6, 12, Math.PI * 1.45), M.glove);
      f.rotation.set(-Math.PI / 2, 0, 0); const wrap = new THREE.Group(); wrap.add(f); wrap.rotation.y = -Math.PI * 0.2; wrap.position.y = y * 1.02; fist.add(wrap);
    });
    const kn = new THREE.Mesh(new THREE.CapsuleGeometry(0.0145, 0.062, 3, 8), M.knuckle); kn.position.set(0.03, 0, -0.004); fist.add(kn);
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.05, 3, 10), M.glove); back.rotation.x = Math.PI / 2; back.scale.set(0.75, 1, 1.7); back.position.set(0.016, 0, 0.045); fist.add(back);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.036, 3, 8), M.glove); thumb.position.set(-0.024, 0.044, 0.006); thumb.rotation.set(0.3, 0, 1.25); fist.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.041, 0.075, 14, 1, true), M.cuff); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.11; arm.add(cuff);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.05, 0.55, 12), M.sleeve); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.135 + 0.275; arm.add(sleeve);
    return arm;
  }
  // open gloved hand: palm faces -Y, fingers point -Z, thumb on the inside; wrist anchor at the heel of the palm
  buildOpenHand(M, side) {
    const h = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.05, 3, 10), M.glove); palm.rotation.x = Math.PI / 2; palm.scale.set(2.0, 1, 0.62); h.add(palm);
    [[-0.028, 0.05], [-0.0095, 0.058], [0.0095, 0.055], [0.028, 0.044]].forEach(([x, l], i) => {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, l, 3, 8), M.glove); f.rotation.x = Math.PI / 2 - 0.25; f.position.set(x * -side, -0.006, -0.045 - l / 2); h.add(f);
    });
    const k = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.06, 3, 8), M.knuckle); k.rotation.z = Math.PI / 2; k.position.set(0, 0.006, -0.038); h.add(k);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.042, 3, 8), M.glove); th.position.set(-side * 0.045, -0.008, -0.012); th.rotation.set(Math.PI / 2, 0, -side * 0.7); h.add(th);
    const wrist = new THREE.Object3D(); wrist.position.z = 0.045; h.add(wrist); h.userData.wrist = wrist; h.userData.side = side;
    return h;
  }
  clonePose(p) { return { p: [...p.p], r: [...p.r], w: [...p.w], slide: p.slide, roll: p.roll || 0 }; }
  lerpPose(out, a, b, kp, kr = kp) {
    for (let i = 0; i < 3; i++) { out.p[i] = a.p[i] + (b.p[i] - a.p[i]) * kp; out.r[i] = a.r[i] + (b.r[i] - a.r[i]) * kr; out.w[i] = a.w[i] + (b.w[i] - a.w[i]) * kp; }
    out.slide = a.slide + (b.slide - a.slide) * kp; out.roll = (a.roll || 0) + ((b.roll || 0) - (a.roll || 0)) * kr; return out;
  }
  go(state, dur, to) { const a = this.anim; a.state = state; a.t = 0; a.dur = dur; a.from = this.clonePose(this.cur); a.to = to; }
  onImpact() { // the head landed on something
    const k = TIMING[this.vmShown]; if (!k || this.vmShown !== this.tool) return;
    const ps = POSES[this.vmShown]; this.cur = this.clonePose(ps.contact); this.go('impact', k.impact, ps.recoil);
    this.kickVel.x += 1.7 * k.kick; this.kickVel.z += (Math.random() < 0.5 ? -1 : 1) * 0.7 * k.kick; this.kickVel.y += 0.25 * k.kick;
  }
  onWhiff() { // nothing there: the head carries on through
    const k = TIMING[this.vmShown]; if (!k || this.vmShown !== this.tool) return;
    this.go('whiff', k.whiff, POSES[this.vmShown].whiff); this.kickVel.x -= 0.35 * k.kick;
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
    this.cooldown = t.cooldown; this.G.audio.swing();
    this.pendingHit = t.swing;
    if (this.vmShown === this.tool) { this.go('windup', t.swing * TIMING[this.tool].windup, POSES[this.tool].windup); this.kickVel.x += 0.12; }
  }
  resolveHit() {
    const t = TOOLS[this.tool]; const a = this.aim(t.range);
    if (!a || !a.ent) { this.onWhiff(); return; }
    if (this.G.world.hit(a.ent, a.point, a.normal, a.dir, t) === true) this.onImpact(); else this.onWhiff();
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
    this.jab = 1;
  }
  // crouch: shrink the capsule and drop its centre so the feet stay put; stand only with headroom
  setCrouch(on) {
    if (on === this.crouched) return;
    this.col.setHalfHeight(on ? CROUCH.half : STAND_HALF);
    const t = this.body.translation(), dy = on ? -(STAND_HALF - CROUCH.half) : STAND_HALF - CROUCH.half;
    this.body.setTranslation({ x: t.x, y: t.y + dy, z: t.z }, true);
    this.G.phys.propagateModifiedBodyPositionsToColliders?.();
    this.crouched = on;
  }
  headroom() {
    const t = this.body.translation(), need = (STAND_HALF - CROUCH.half) + STAND_HALF + PLAYER.radius + 0.02; // crouched centre to standing top
    for (const [ox, oz] of [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
      this.ray.origin = { x: t.x + ox, y: t.y, z: t.z + oz }; this.ray.dir = { x: 0, y: 1, z: 0 };
      if (this.G.phys.castRay(this.ray, need, true, undefined, GROUPS, this.col, this.body)) return false;
    }
    return true;
  }
  update(dt) {
    const { R } = this.G;
    // crouch
    const wantCrouch = this.locked && !this.G.systems.over && (this.keys.ControlLeft || this.keys.ControlRight || this.keys.KeyC);
    if (wantCrouch && !this.crouched) this.setCrouch(true);
    else if (!wantCrouch && this.crouched && this.headroom()) this.setCrouch(false);
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
    const sprint = this.keys.ShiftLeft && !this.crouched;
    const speed = this.crouched ? PLAYER.walk * CROUCH.speed : sprint ? PLAYER.sprint : PLAYER.walk;
    if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(speed * dt);
    if (this.grounded && this.keys.Space && this.locked) { this.vy = PLAYER.jump * (this.crouched ? CROUCH.jump : 1); this.grounded = false; }
    this.vy -= 9.81 * dt; if (this.vy < -20) this.vy = -20;
    mv.y = this.vy * dt;
    this.cc.computeColliderMovement(this.col, { x: mv.x, y: mv.y, z: mv.z }, undefined, GROUPS);
    const m = this.cc.computedMovement(); this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = -0.5;
    if (!this.grounded && Math.abs(m.y) < 1e-5 && this.vy > 0) this.vy = 0; // bumped head
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    // camera (eye height eases between standing and crouched; feet = centre - half the current capsule)
    const moving = mv.x * mv.x + mv.z * mv.z > 1e-8 && this.grounded; this.bob += dt * (moving ? (sprint ? 13 : this.crouched ? 7 : 9) : 0);
    this.eyeH += ((this.crouched ? CROUCH.eye : PLAYER.eye) - this.eyeH) * Math.min(1, dt / 0.05);
    const feet = t.y + m.y - ((this.crouched ? CROUCH.half : STAND_HALF) + PLAYER.radius);
    this.cam.position.set(t.x + m.x, feet + this.eyeH + (moving ? Math.sin(this.bob) * (this.crouched ? 0.015 : 0.025) : 0), t.z + m.z);
    // impact kick: a damped spring added on top of the mouse look
    this.kickVel.addScaledVector(this.kick, -300 * dt).multiplyScalar(Math.exp(-24 * dt)); this.kick.addScaledVector(this.kickVel, dt);
    this.cam.rotation.set(0, 0, 0, 'YXZ'); this.cam.rotation.y = this.yaw + this.kick.y; this.cam.rotation.x = this.pitch + this.kick.x; this.cam.rotation.z = this.kick.z;
    // deferred hit, then the viewmodel
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.pendingHit !== null) { this.pendingHit -= dt; if (this.pendingHit <= 1e-6) { this.pendingHit = null; this.resolveHit(); } }
    this.animate(dt, moving, sprint);
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
        if (a.ent.bolted) { this.pushing = true; this.pushHint = 'Bolted down. Shear the anchors with the sledgehammer first.'; }
        else { a.ent.body.applyImpulseAtPoint({ x: a.dir.x * 2800 * dt, y: 0, z: a.dir.z * 2800 * dt }, a.point, true); this.pushing = true; this.pushHint = 'Pushing… (this shove is the one superhuman thing in here)'; a.ent.dirty = true; }
      } else if (a?.ent?.kind === 'loose') a.ent.body.applyImpulseAtPoint({ x: a.dir.x * 400 * dt, y: 0, z: a.dir.z * 400 * dt }, a.point, true);
    }
    // prompt
    if (!this.pushing) { const a = this.aim(3.0); this.G.hud.prompt(a?.ent ? this.G.world.promptFor(a.ent, a.point) : ''); }
    else this.G.hud.prompt(this.pushHint);
  }

  // ------------------------------------------------------------------ viewmodel animation
  // States: idle -> windup (ease-out raise over the right shoulder, body twists right) -> strike (ease-in arc, the head leads
  // the hands) -> contact (held until resolveHit) -> impact (jolt back off the target + shudder + camera kick) or whiff
  // (follow-through past the target) -> recover (ease back to rest) -> idle. Switching tools lowers and raises the viewmodel.
  animate(dt, moving, sprint) {
    this.time += dt;
    const sway = this.vmSway, rig = this.vmRig, a = this.anim;
    // tool switch: lower the shown tool, swap, raise the new one
    if (this.vmShown !== this.tool) {
      this.switchP = Math.min(1, this.switchP + dt / 0.13);
      if (this.switchP >= 1) { this.vmShown = this.tool; for (const k in this.vm) this.vm[k].visible = k === this.tool; a.state = 'idle'; if (POSES[this.tool]) this.cur = this.clonePose(POSES[this.tool].rest); }
    } else this.switchP = Math.max(0, this.switchP - dt / 0.2);
    const tool = this.vmShown, ps = POSES[tool], tm = TIMING[tool];
    if (ps) {
      a.t += dt;
      // advance; a finished state hands its leftover time to the next one so windup + strike lands exactly on TOOLS.swing
      const next = (state, dur, to) => { const over = a.t - a.dur; this.go(state, dur, to); a.t = over; return true; };
      for (let guard = 0; guard < 4; guard++) {
        const k = clamp01(a.t / a.dur); let moved = false;
        switch (a.state) {
          case 'idle': this.cur = this.clonePose(ps.rest); break;
          case 'windup': this.lerpPose(this.cur, a.from, a.to, E.out(k), E.out3(k)); if (k >= 1) moved = next('strike', TOOLS[tool].swing * (1 - tm.windup), ps.contact); break;
          case 'strike': {
            // ease-in: slow out of the windup, fastest at the target; rotation runs ahead of the hands so the head leads
            this.lerpPose(this.cur, a.from, a.to, E.inP(2.4)(k), E.inP(1.7)(k));
            this.cur.p[2] -= Math.sin(k * Math.PI) * 0.07; this.cur.p[1] += Math.sin(k * Math.PI) * 0.03;
            if (k >= 1) moved = next('contact', 0.06, ps.contact);
            break;
          }
          case 'contact': this.cur = this.clonePose(ps.contact); if (k >= 1) this.onWhiff(); break; // safety net if no resolve arrives
          case 'impact': {
            this.lerpPose(this.cur, a.from, a.to, E.out3(k));
            const sh = (1 - k) * (1 - k); this.cur.r[2] += Math.sin(k * 42) * 0.035 * sh; this.cur.r[0] += Math.sin(k * 31 + 1) * 0.025 * sh; // steel ringing through the handle
            if (k >= 1) moved = next('recover', tm.recover, ps.rest);
            break;
          }
          case 'whiff': this.lerpPose(this.cur, a.from, a.to, E.out(k)); if (k >= 1) moved = next('recover', tm.recover * 1.15, ps.rest); break;
          case 'recover': this.lerpPose(this.cur, a.from, a.to, E.inOut(k)); if (k >= 1) a.state = 'idle'; break;
        }
        if (!moved) break;
      }
      const c = this.cur;
      rig.position.set(c.p[0], c.p[1], c.p[2]); rig.rotation.set(c.r[0], c.r[1], c.r[2], 'YZX');
      const grips = this.vm[tool].userData.grips; grips.front.position.y = c.slide; this.vm[tool].rotation.y = c.roll;
    }
    // body: breathing, walk bob (figure-eight), sprint carry, crouch, look lag, swing twist, switch lower
    const swinging = ps && a.state !== 'idle';
    this.moveAmt += ((moving ? 1 : 0) - this.moveAmt) * Math.min(1, dt * 8);
    this.sprintAmt += ((moving && sprint && !swinging ? 1 : 0) - this.sprintAmt) * Math.min(1, dt * 6);
    const dy = this.yaw - this.lastLook.x, dp = this.pitch - this.lastLook.y; this.lastLook.set(this.yaw, this.pitch);
    this.lag.x += (Math.max(-0.06, Math.min(0.06, dy * 2.2)) - this.lag.x) * Math.min(1, dt * 10);
    this.lag.y += (Math.max(-0.06, Math.min(0.06, dp * 2.2)) - this.lag.y) * Math.min(1, dt * 10);
    const br = Math.sin(this.time * 1.7), br2 = Math.sin(this.time * 0.9 + 1), mA = this.moveAmt * (1 - (swinging ? 0.6 : 0)) * (1 + this.sprintAmt * 0.8);
    const bx = Math.cos(this.bob * 0.5) * 0.011 * mA, by = -Math.abs(Math.sin(this.bob * 0.5)) * 0.012 * mA;
    const crouch = clamp01((PLAYER.eye - this.eyeH) / (PLAYER.eye - CROUCH.eye)), sw = this.switchP * this.switchP * (3 - 2 * this.switchP);
    const w = ps ? this.cur.w : [0, 0, 0];
    sway.position.set(bx - this.lag.x * 0.12 + br2 * 0.002, by + br * 0.0035 - this.lag.y * 0.08 - 0.05 * this.sprintAmt - 0.035 * crouch - 0.32 * sw, 0.03 * this.sprintAmt);
    sway.rotation.set(w[0] + br * 0.006 + this.lag.y * 0.6 - 0.22 * this.sprintAmt + 0.5 * sw + by * 0.6, w[1] + this.lag.x * 0.7 + 0.18 * this.sprintAmt, w[2] + bx * 0.8 + this.lag.x * 0.5 + 0.06 * crouch + 0.1 * this.sprintAmt);
    if (tool === 'hands') this.animateHands(dt);
    this.placeArms(tool);
  }
  animateHands(dt) {
    const push = this.pushing || (this.lmb && !this.carrying);
    this.pushW += ((push ? 1 : 0) - this.pushW) * Math.min(1, dt * 9);
    this.carryW += ((this.carrying ? 1 : 0) - this.carryW) * Math.min(1, dt * 9);
    this.jab = Math.max(0, this.jab - dt * 4);
    const effort = this.pushing ? 1 : 0, jab = Math.sin(Math.min(1, (1 - this.jab) * 1.2) * Math.PI) * (this.jab > 0 ? 1 : 0);
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler();
    for (const h of this.openHands) {
      const s = h.userData.side;
      const blend = (key, out) => { const v = HANDS[key]; out.p = [v.p[0] * (s < 0 ? 1 : -1), v.p[1], v.p[2]]; out.r = [v.r[0], v.r[1] * (s < 0 ? 1 : -1), v.r[2] * (s < 0 ? 1 : -1)]; return out; };
      const I = blend('idle', {}), Pu = blend('push', {}), C = blend('carry', {});
      const pos = new THREE.Vector3(...I.p).lerp(new THREE.Vector3(...Pu.p), this.pushW).lerp(new THREE.Vector3(...C.p), this.carryW);
      q.setFromEuler(e.set(...I.r)); q.slerp(q2.setFromEuler(e.set(...Pu.r)), this.pushW); q.slerp(q2.setFromEuler(e.set(...C.r)), this.carryW);
      pos.z -= jab * 0.16; pos.y += jab * 0.04;
      pos.x += Math.sin(this.time * 23 + s) * 0.002 * effort; pos.y += Math.sin(this.time * 19 + s * 2) * 0.002 * effort; pos.z += 0.03 * effort; // straining against the cabinet
      pos.y += Math.sin(this.time * 1.7 + s * 0.6) * 0.003 * (1 - this.pushW);
      h.position.copy(pos); h.quaternion.copy(q);
    }
  }
  // put each arm at its grip anchor and aim the forearm at the shoulder (bent away from the handle axis)
  placeArms(tool) {
    const root = this.vmRoot; root.updateMatrixWorld(true);
    const v = new THREE.Vector3(), ax = new THREE.Vector3(), d = new THREE.Vector3(), x = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), qi = new THREE.Quaternion();
    root.getWorldQuaternion(qi).invert();
    const place = (arm, anchor, axisLocal, shoulder, fist, perp) => {
      anchor.getWorldPosition(v); root.worldToLocal(v);
      anchor.getWorldQuaternion(q); q.premultiply(qi); ax.copy(axisLocal).applyQuaternion(q).normalize();
      d.subVectors(shoulder, v).normalize(); d.addScaledVector(ax, -perp * d.dot(ax)).normalize();
      ax.addScaledVector(d, -ax.dot(d)).normalize(); x.crossVectors(ax, d);
      m.makeBasis(x, ax, d); arm.position.copy(v); arm.quaternion.setFromRotationMatrix(m); arm.userData.fist.visible = fist;
    };
    const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
    if (tool === 'hands') {
      for (const h of this.openHands) place(h.userData.side < 0 ? this.arms.L : this.arms.R, h.userData.wrist, X, h.userData.side < 0 ? SHOULDER.L : SHOULDER.R, false, 0);
    } else {
      const g = this.vm[tool].userData.grips;
      place(this.arms.L, g.back, Y, SHOULDER.L, true, 0.35); place(this.arms.R, g.front, Y, SHOULDER.R, true, 0.35);
    }
  }
  // Called by main.js after the composer: draw only the viewmodel on top of the finished frame with its own camera.
  renderViewmodel(renderer, scene) {
    const vc = this.vmCamera, c = this.cam;
    c.getWorldPosition(vc.position); c.getWorldQuaternion(vc.quaternion);
    if (vc.aspect !== c.aspect) { vc.aspect = c.aspect; vc.updateProjectionMatrix(); }
    if (!(this._lightScan-- > 0)) { this._lightScan = 120; scene.traverse(o => { if (o.isLight) o.layers.enable(VM_LAYER); }); } // keep the hall's lights lighting it
    const bg = scene.background, ac = renderer.autoClear, su = renderer.shadowMap.autoUpdate;
    scene.background = null; renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(null); renderer.clearDepth(); renderer.render(scene, vc);
    scene.background = bg; renderer.autoClear = ac; renderer.shadowMap.autoUpdate = su;
  }
}
