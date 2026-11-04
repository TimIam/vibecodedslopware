// Camelot, the lower ward, noon on the twenty-first of June: a stake, a crowd, and Merlin's brass Toy.
import * as THREE from 'three';
import * as T from './tex.js';
import * as P from './props.js';

const { V, box, cyl, mat, dirYaw, deg } = P;

const SIGNS = [['ARIES', 'the Ram'], ['TAURUS', 'the Bull'], ['GEMINI', 'the Twins'], ['CANCER', 'the Crab'], ['LEO', 'the Lion'], ['VIRGO', 'the Maid'],
  ['LIBRA', 'the Scales'], ['SCORPIO', 'the Scorpion'], ['SAGITTARIUS', 'the Archer'], ['CAPRICORNUS', 'the Goat'], ['AQUARIUS', 'the Waterman'], ['PISCES', 'the Fishes']];
const CANCER = 3;
const SUN_DIR = dirYaw(180, 36);

export function buildCourt(api) {
  const scene = new THREE.Scene();
  const fogDay = new THREE.Fog(0xc8d6e2, 120, 900);
  scene.fog = fogDay;
  const hots = [];
  const hot = (o, cfg) => api.hot(o, cfg, hots);
  const st = api.state;

  // ---- sky, sun, moon ----
  const sky = P.sky({ top: 0x3b78c8, horizon: 0xc4d6e6, bottom: 0x7a8a6a, glowDir: SUN_DIR, glowColor: 0xfff2d0, glowSize: 0.08 });
  scene.add(sky);
  const starsM = P.stars({ count: 1400, seed: 21, size: 2.4 });
  starsM.material.opacity = 0; scene.add(starsM);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshBasicMaterial({ color: 0xfff8e0, fog: false }));
  sunDisc.position.copy(SUN_DIR.clone().multiplyScalar(900)); sunDisc.lookAt(0, 0, 0); scene.add(sunDisc);
  const sunGlow = P.glowSprite(260, 0xfff0c8, 0.85, 'sun'); sunGlow.position.copy(sunDisc.position); scene.add(sunGlow);
  const corona = P.glowSprite(150, 0xdde8ff, 0, 'corona'); corona.position.copy(SUN_DIR.clone().multiplyScalar(890)); scene.add(corona);
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(14.6, 40), new THREE.MeshBasicMaterial({ color: 0x0a0c12, fog: false }));
  scene.add(moonDisc);
  const sunRight = new THREE.Vector3().crossVectors(SUN_DIR, V(0, 1, 0)).normalize();
  const sunUp = new THREE.Vector3().crossVectors(sunRight, SUN_DIR).normalize();
  function placeMoon(k) { // k: 0 = well off to the side, 1 = dead centre
    moonDisc.position.copy(SUN_DIR.clone().multiplyScalar(880)).addScaledVector(sunRight, (1 - k) * 60).addScaledVector(sunUp, (1 - k) * 18);
    moonDisc.lookAt(0, 0, 0);
  }
  placeMoon(0); moonDisc.visible = false;

  const sun = new THREE.DirectionalLight(0xfff0dc, 3.0);
  sun.position.copy(SUN_DIR.clone().multiplyScalar(80));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbcd4f4, 0x6a5a40, 1.0); scene.add(hemi);

  // ---- ground and walls ----
  const flagTex = T.stone({ base: [176, 164, 140], rows: 10, seed: 6, repeat: [9, 9], mortar: [120, 110, 92] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), mat(0xffffff, { map: flagTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const field = new THREE.Mesh(new THREE.CircleGeometry(900, 40), mat(0x6f8a48, { roughness: 1 }));
  field.rotation.x = -Math.PI / 2; field.position.y = -0.05; scene.add(field);
  // distant hills
  {
    const pos = [], n = 90;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, h0 = 18 + T.fbm3(i * 0.2, 1, 1, 3) * 70, h1 = 18 + T.fbm3((i + 1) * 0.2, 1, 1, 3) * 70;
      const R = 650;
      pos.push(Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, 0, Math.sin(a1) * R, Math.cos(a1) * R, h1, Math.sin(a1) * R,
        Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, h1, Math.sin(a1) * R, Math.cos(a0) * R, h0, Math.sin(a0) * R);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6d8466, roughness: 1, side: THREE.DoubleSide })));
  }
  const stoneM = (rx, ry) => mat(0xffffff, { map: (() => { const t = T.stone({ base: [158, 150, 132], rows: 8, seed: 3 }); t.repeat.set(rx, ry); return t; })(), roughness: 0.95 });
  const castle = new THREE.Group(); scene.add(castle);
  const W = 25, WT = 2.5, WH = 10;
  function wall(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const w = new THREE.Mesh(new THREE.BoxGeometry(len, WH, WT), stoneM(len / 4, WH / 4));
    w.position.set((x0 + x1) / 2, WH / 2, (z0 + z1) / 2); w.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    w.castShadow = w.receiveShadow = true; castle.add(w);
    const merl = [], m = new THREE.BoxGeometry(1, 1.2, WT * 0.9);
    for (let s = 0.5; s < len; s += 2) merl.push(P.tm(x0 + (x1 - x0) * s / len, WH + 0.6, z0 + (z1 - z0) * s / len, 1, 1, 1, w.rotation.y));
    const im = P.instanced(m, w.material, merl); im.castShadow = true; castle.add(im);
  }
  wall(-W, -W, W, -W); wall(-W, -W, -W, W); wall(W, -W, W, W);
  wall(-W, W, -2.6, W); wall(2.6, W, W, W);
  // gatehouse arch over the opening
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4, WT + 0.6), stoneM(1.4, 1)); top.position.set(0, 8, W); top.castShadow = true; castle.add(top);
    [-1, 1].forEach(s => { const t = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 14, 16), stoneM(3, 3.5)); t.position.set(s * 4.6, 7, W + 0.4); t.castShadow = true; castle.add(t); });
    const port = new THREE.Group();
    for (let i = -2; i <= 2; i++) port.add(box(0.12, 4, 0.12, P.iron(), i * 1.0, 0, 0));
    for (let j = 0; j < 4; j++) port.add(box(5, 0.12, 0.12, P.iron(), 0, -1.6 + j * 1.0, 0));
    port.position.set(0, 7.6, W + 0.2); castle.add(port);
  }
  // corner towers
  const roofM = mat(0x5a3a30, { roughness: 0.9 });
  [[-W, -W], [-W, W], [W, W]].forEach(([x, z]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.9, 15, 20), stoneM(4, 4)); t.position.set(x, 7.5, z); t.castShadow = true; castle.add(t);
    const r = new THREE.Mesh(new THREE.ConeGeometry(4.3, 6, 20), roofM); r.position.set(x, 18, z); r.castShadow = true; castle.add(r);
  });
  // Merlin's tower, tall, in the north-east corner
  const TW = V(19, 0, -19), TR = 4.4, TH = 24;
  {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(TR, TR + 0.3, TH, 28), stoneM(5, 6)); t.position.set(TW.x, TH / 2, TW.z); t.castShadow = true; castle.add(t);
    const r = new THREE.Mesh(new THREE.ConeGeometry(TR + 0.8, 9, 28), mat(0x2a2a52, { roughness: 0.8 })); r.position.set(TW.x, TH + 4.5, TW.z); r.castShadow = true; castle.add(r);
    const flagPole = cyl(0.06, 0.06, 4, P.iron(), 6, TW.x, TH + 10, TW.z); castle.add(flagPole);
    const pennant = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), mat(0x2a2a52, { side: THREE.DoubleSide })); pennant.position.set(TW.x + 1.2, TH + 11.5, TW.z); castle.add(pennant);
    castle.userData.pennant = pennant;
    // windows: little dark slits, one lit at the top
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + 2.2, h = 6 + i * 3.6; const s = box(0.4, 1.2, 0.3, mat(0x14100c), TW.x + Math.cos(a) * (TR + 0.02), h, TW.z + Math.sin(a) * (TR + 0.02)); s.lookAt(TW.x, h, TW.z); castle.add(s); }
  }
  // banners on the north wall either side of the dais
  [-9, 9, -17, 17].forEach((x, i) => {
    const bt = T.canvas(64, 256, (g, w, h) => {
      g.fillStyle = i % 2 ? '#7a1a1a' : '#1e2e6a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8b24a'; g.fillRect(0, 0, w, 10); g.fillRect(26, 20, 12, h - 60);
      g.beginPath(); g.moveTo(0, h - 30); g.lineTo(w / 2, h); g.lineTo(w, h - 30); g.lineTo(w, h); g.lineTo(0, h); g.fillStyle = '#c8d6e2'; g.globalCompositeOperation = 'destination-out'; g.fill();
    }, { wrap: false });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6.4), mat(0xffffff, { map: bt, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    b.position.set(x, 6.4, -W + WT / 2 + 0.05); castle.add(b);
  });

  // ---- the dais, the king, the crowd ----
  {
    const dais = box(12, 1.0, 5, stoneM(3, 0.4), 0, 0.5, -20.5); dais.castShadow = dais.receiveShadow = true; castle.add(dais);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.05, 5.2), mat(0x7a1a1a)); cloth.position.set(0, 1.03, -20.5); castle.add(cloth);
    [-5.5, 5.5].forEach(x => castle.add(cyl(0.15, 0.15, 5, mat(0xd8b24a, { metalness: 0.6, roughness: 0.4 }), 8, x, 3.5, -18.4)));
    const can = box(12, 0.25, 5.4, mat(0x1e2e6a), 0, 6.0, -20.5); can.castShadow = true; castle.add(can);
    for (let i = 0; i < 24; i++) castle.add(box(0.5, 0.6, 0.06, mat(i % 2 ? 0xd8b24a : 0x1e2e6a), -5.75 + i * 0.5, 5.6, -17.8));
    const throne = new THREE.Group();
    throne.add(box(1.4, 0.6, 1.2, mat(0x5a3418), 0, 0.3, 0), box(1.4, 2.4, 0.2, mat(0x5a3418), 0, 1.2, -0.55));
    throne.position.set(0, 1.05, -21); castle.add(throne);
  }
  // people: a body (tapered cylinder) and a head per person
  const crowd = { bodies: null, heads: null, base: [], kneel: 0 };
  {
    const r = T.rng(44), spots = [];
    const king = { x: 0, z: -20.9, y: 1.05, s: 1.05, c: 0x8a1a1a, king: true };
    spots.push(king);
    [-3.2, -2, 2, 3.2].forEach(x => spots.push({ x, z: -19.4, y: 1.05, s: 1.05, c: 0x8a8e96 }));
    for (let i = 0; i < 140; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (11 + r() * 9), z = side > 0 ? -6 + r() * 21 : -15 + r() * 14;
      spots.push({ x, z, y: 0, s: 0.9 + r() * 0.2, c: [0x6b4a2a, 0x7a2a22, 0x3a5a32, 0x2e3e6a, 0x8a7a5a, 0x5a4a3a, 0xa08860][Math.floor(r() * 7)] });
    }
    for (let i = 0; i < 40; i++) spots.push({ x: -9 + r() * 18, z: -15.5 + r() * 2.5, y: 0, s: 0.9 + r() * 0.2, c: [0x6b4a2a, 0x7a2a22, 0x3a5a32, 0x5a4a3a][Math.floor(r() * 4)] });
    const bg = new THREE.CylinderGeometry(0.22, 0.34, 1.3, 8); bg.translate(0, 0.65, 0);
    const hg = new THREE.SphereGeometry(0.17, 10, 8); hg.translate(0, 1.5, 0);
    crowd.bodies = new THREE.InstancedMesh(bg, mat(0xffffff, { roughness: 0.9 }), spots.length);
    crowd.heads = new THREE.InstancedMesh(hg, mat(0xd8a888, { roughness: 0.8 }), spots.length);
    spots.forEach((s, i) => {
      s.ry = Math.atan2(-s.x, -s.z) + Math.PI + (r() - 0.5) * 0.6;
      if (s.king) s.ry = 0;
      crowd.bodies.setColorAt(i, new THREE.Color(s.c));
      crowd.base.push(s);
    });
    crowd.bodies.castShadow = crowd.heads.castShadow = true;
    castle.add(crowd.bodies, crowd.heads);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.14, 10, 1, true), mat(0xe8c24a, { metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }));
    crown.position.set(king.x, king.y + 1.05 * 1.68, king.z); castle.add(crown);
    // wooden barriers in front of the crowd
    [[-1, -15, -1], [1, -6, 15]].forEach(([s, za, zb]) => {
      const zc = (za + zb) / 2, len = zb - za;
      castle.add(box(0.12, 0.12, len, mat(0x6b4a2a), s * 10.2, 1.0, zc), box(0.12, 0.12, len, mat(0x6b4a2a), s * 10.2, 0.5, zc));
      for (let z = za; z <= zb + 0.01; z += len / 6) castle.add(box(0.15, 1.1, 0.15, mat(0x5a3a20), s * 10.2, 0.55, z));
    });
  }
  function poseCrowd(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    crowd.base.forEach((s, i) => {
      const bob = Math.sin(t * 1.3 + i * 1.7) * 0.02;
      const kneel = s.king ? 0 : crowd.kneel * (0.8 + (i % 5) * 0.05);
      const sy = s.s * (1 - kneel * 0.38);
      q.setFromEuler(new THREE.Euler(kneel * 0.25, s.ry, 0));
      m.compose(V(s.x, s.y + bob, s.z), q, V(s.s, sy, s.s));
      crowd.bodies.setMatrixAt(i, m);
      crowd.heads.setMatrixAt(i, m);
    });
    crowd.bodies.instanceMatrix.needsUpdate = crowd.heads.instanceMatrix.needsUpdate = true;
  }
  poseCrowd(0);

  // ---- the stake ----
  {
    const pole = cyl(0.14, 0.16, 4.2, mat(0x5a3a22), 10, 0, 2.1, 0); pole.castShadow = true; castle.add(pole);
    const sticks = [], r = T.rng(8);
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2, d = 0.3 + r() * 1.1, h = r() * (1.1 - d * 0.6);
      sticks.push(P.tm(Math.cos(a) * d, 0.1 + h, Math.sin(a) * d, 1, 1, 1, r() * 3, Math.PI / 2 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.5));
    }
    const im = P.instanced(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 5), mat(0x6b5a3a, { roughness: 1 }), sticks); im.castShadow = true; castle.add(im);
    const placard = P.signPlane(T.sign({ w: 256, h: 320, bg: '#e3d2a6', color: '#2a2118', size: 26, lh: 1.15, lines: [{ t: 'PROCLAMATION', size: 30 }, '', 'The Stranger', 'called THE BOSS', 'shall be BURNT', 'at NOON', '', { t: 'God save the King', size: 20 }] }), 0.5, { transparent: false });
    placard.position.set(0, 1.75, 0.17); castle.add(placard);
    hot(placard, { nodes: ['k_stake'], click: () => api.ui.doc('proclamation') });
    const pHit = box(0.9, 1.0, 0.4, new THREE.MeshBasicMaterial({ visible: false })); pHit.position.set(0, 1.75, 0.2); castle.add(pHit);
    hot(pHit, { nodes: ['k_stake'], click: () => api.ui.doc('proclamation') });
  }

  // ---- The Boss's workshop (west side) ----
  const SHOP = { x0: -23.7, x1: -15.5, z0: 1.2, z1: 9.0, back: 4.8, front: 3.3 };
  const orrery = new THREE.Group();
  const toy = { e: 0, p: 2, n: 0, de: 0, dp: 2, dn: 0, lever: 0, testing: false };
  if (st.flags.eclipse) Object.assign(toy, { e: CANCER, p: 0, n: 2, de: CANCER, dp: 0, dn: 2 });
  {
    const wood = mat(0xffffff, { map: T.wood({ base: [130, 96, 60], dark: [86, 60, 36], planks: 5, seed: 41 }), roughness: 0.8 });
    const shop = new THREE.Group(); scene.add(shop);
    const { x0, x1, z0, z1, back, front } = SHOP;
    // side walls, roof, posts
    [z0, z1].forEach(z => { const w = box(x1 - x0, front, 0.15, wood, (x0 + x1) / 2, front / 2, z); w.castShadow = true; shop.add(w); });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0 + 1, back - front), 0.15, z1 - z0 + 0.8), mat(0x5a4030, { roughness: 1 }));
    roof.position.set((x0 + x1) / 2 + 0.5, (back + front) / 2 + 0.05, (z0 + z1) / 2); roof.rotation.z = -Math.atan2(back - front, x1 - x0 + 1); roof.castShadow = true; shop.add(roof);
    [z0, z1].forEach(z => shop.add(box(0.2, front, 0.2, wood, x1, front / 2, z)));
    shop.add(box(0.2, 0.2, z1 - z0, wood, x1, front, (z0 + z1) / 2));
    const signT = T.sign({ w: 512, h: 96, bg: '#2a1a0e', color: '#e8c870', size: 40, lines: ['THE BOSS · PATENT OFFICE'] });
    const sign = P.signPlane(signT, 4.4, { transparent: false }); sign.position.set(x1 + 0.12, front + 0.35, (z0 + z1) / 2); sign.rotation.y = Math.PI / 2; shop.add(sign);
    // the workbench along the back (the castle wall)
    const bx = x0 + 0.65;
    shop.add(box(1.0, 0.08, 6.4, wood, bx, 0.95, 5.1));
    [[-0.4, 2.1], [0.4, 2.1], [-0.4, 8.1], [0.4, 8.1]].forEach(([dx, z]) => shop.add(box(0.08, 0.95, 0.08, wood, bx + dx, 0.47, z)));
    // tools and a telephone on the wall, because of course
    const phone = new THREE.Group();
    phone.add(box(0.3, 0.45, 0.12, mat(0x3a2414)), cyl(0.03, 0.03, 0.18, P.iron(), 8, 0.2, 0.05, 0.05));
    const bellL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), P.brass()); bellL.position.set(-0.06, 0.15, 0.07); phone.add(bellL);
    phone.position.set(x0 + 0.08, 1.8, 8.2); phone.rotation.y = Math.PI / 2; shop.add(phone);
    hot(phone, { nodes: ['k_shop'], click: () => { api.A.sfx.bell(1400, 0.06); api.ui.say('You crank the telephone. A faint voice: “Hello-Central? Camelot two-oh… is that you, Boss? They say you’re to be burnt.”', 6); } });
    const lantern = new THREE.PointLight(0xffc890, 6, 10, 2); lantern.position.set(x0 + 2.5, 2.6, 5); shop.add(lantern);
    // the notebook, the newspaper, the scroll
    const nb = box(0.24, 0.03, 0.32, mat(0x2a1a10), bx + 0.05, 1.0, 3.3);
    const nbP = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28), mat(0xffffff, { map: T.paper({ seed: 90, lines: 11 }) })); nbP.rotation.x = -Math.PI / 2; nbP.position.y = 0.017; nb.add(nbP);
    nb.rotation.y = 0.2; shop.add(nb);
    hot(nb, { nodes: ['k_shop', 'k_orrery'], click: () => api.ui.doc('hank') });
    const news = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), mat(0xffffff, { map: T.canvas(256, 340, (g, w, h) => {
      g.fillStyle = '#e6dfca'; g.fillRect(0, 0, w, h); g.fillStyle = '#1e1a14'; g.font = '22px "UnifrakturMaguntia", serif'; g.textAlign = 'center'; g.fillText('Weekly Hosannah', w / 2, 34);
      g.fillRect(14, 44, w - 28, 2); g.font = 'bold 24px "IM Fell English SC", serif'; g.fillText('WIZARD TO BE', w / 2, 80); g.fillText('BURNT', w / 2, 106);
      g.fillStyle = 'rgba(30,26,20,.55)'; for (let y = 124; y < h - 14; y += 9) { g.fillRect(16, y, w / 2 - 22, 3); g.fillRect(w / 2 + 6, y, w / 2 - 22, 3); }
    }, { wrap: false }) }));
    news.rotation.x = -Math.PI / 2; news.rotation.z = Math.PI / 2 - 0.15; news.position.set(bx + 0.05, 1.0, 7.3); shop.add(news);
    hot(news, { nodes: ['k_shop', 'k_orrery'], click: () => api.ui.doc('hosannah') });
    const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), mat(0xffffff, { map: T.paper({ w: 200, h: 300, lines: 9, seed: 15, tint: '#dcc898', title: 'Draco' }) }));
    scroll.position.set(x0 + 0.09, 2.0, 6.5); scroll.rotation.y = Math.PI / 2; shop.add(scroll);
    hot(scroll, { nodes: ['k_shop', 'k_orrery'], click: () => api.ui.doc('merlin') });

    // ---- the Toy ----
    const b = P.brass(), dark = mat(0x3a2a18, { roughness: 0.6 });
    orrery.position.set(bx, 0.99, 5.0);
    shop.add(orrery);
    const zod = T.canvas(1024, 1024, (g, w) => {
      const c = w / 2;
      g.fillStyle = '#b08a3e'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
      g.fillStyle = '#c9a556'; g.beginPath(); g.arc(c, c, c * 0.97, 0, 7); g.fill();
      g.strokeStyle = '#5a4018'; g.lineWidth = 4; [0.97, 0.8, 0.62].forEach(k => { g.beginPath(); g.arc(c, c, c * k, 0, 7); g.stroke(); });
      g.fillStyle = '#3a2810'; g.textAlign = 'center'; g.textBaseline = 'middle';
      SIGNS.forEach(([lat, en], i) => {
        const a0 = (i - 0.5) * Math.PI / 6;
        g.beginPath(); g.moveTo(c + Math.cos(a0) * c * 0.62, c - Math.sin(a0) * c * 0.62); g.lineTo(c + Math.cos(a0) * c * 0.97, c - Math.sin(a0) * c * 0.97); g.stroke();
        const a = i * Math.PI / 6;
        g.save(); g.translate(c + Math.cos(a) * c * 0.885, c - Math.sin(a) * c * 0.885); g.rotate(-a + Math.PI / 2);
        g.font = 'bold 34px "IM Fell English SC", serif'; g.fillText(lat, 0, -6);
        g.restore();
        g.save(); g.translate(c + Math.cos(a) * c * 0.71, c - Math.sin(a) * c * 0.71); g.rotate(-a + Math.PI / 2);
        g.font = 'italic 26px "IM Fell English", serif'; g.fillText(en, 0, 0);
        g.restore();
      });
      g.fillStyle = 'rgba(80,56,20,.25)'; for (let i = 0; i < 4000; i++) g.fillRect(Math.random() * w, Math.random() * w, 1, 1);
    }, { wrap: false });
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.42, 64), mat(0xffffff, { map: zod, roughness: 0.4, metalness: 0.6 }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.06; orrery.add(base);
    orrery.add(cyl(0.43, 0.45, 0.06, dark, 48, 0, 0.03, 0));
    const sunB = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffa020, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3 }));
    sunB.position.y = 0.2; orrery.add(sunB, cyl(0.012, 0.012, 0.14, b, 8, 0, 0.13, 0));
    // earth arm
    const arm = new THREE.Group(); arm.position.y = 0.09; orrery.add(arm);
    const bar = box(0.3, 0.012, 0.025, b, 0.15, 0, 0); arm.add(bar);
    const earthP = new THREE.Group(); earthP.position.set(0.3, 0, 0); arm.add(earthP);
    earthP.add(cyl(0.008, 0.008, 0.11, b, 6, 0, 0.055, 0));
    const earth = new THREE.Mesh(new THREE.SphereGeometry(0.028, 18, 12), mat(0x3a6aa0, { roughness: 0.5 })); earth.position.y = 0.11; earthP.add(earth);
    // phase dial under the earth: eight little moons, "new" toward the sun
    const phaseTex = T.canvas(256, 256, (g, w) => {
      const c = w / 2; g.fillStyle = '#c9a556'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill(); g.strokeStyle = '#5a4018'; g.lineWidth = 3; g.stroke();
      for (let p = 0; p < 8; p++) {
        const a = Math.PI + p * Math.PI / 4, x = c + Math.cos(a) * c * 0.72, y = c - Math.sin(a) * c * 0.72, r = 15;
        g.fillStyle = '#1a140c'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        if (p > 0) {
          g.fillStyle = '#f2e6c0'; g.save(); g.beginPath(); g.arc(x, y, r, 0, 7); g.clip();
          const k = p / 8 * 2; // 0..2
          const lit = p <= 4 ? 1 : -1;
          g.beginPath(); g.arc(x, y, r, -Math.PI / 2, Math.PI / 2, lit < 0); g.ellipse(x, y, Math.abs(Math.cos(k * Math.PI / 2 + (p > 4 ? Math.PI : 0))) * r, r, 0, Math.PI / 2, -Math.PI / 2, (p < 2 || p > 6) ? lit > 0 : lit < 0); g.fill();
          g.restore();
        }
      }
      g.fillStyle = '#3a2810'; g.font = 'bold 22px "IM Fell English SC", serif'; g.textAlign = 'center'; g.fillText('LUNA', c, c + 6);
    }, { wrap: false });
    const phase = new THREE.Mesh(new THREE.CircleGeometry(0.1, 40), mat(0xffffff, { map: phaseTex, metalness: 0.5, roughness: 0.4 }));
    phase.rotation.x = -Math.PI / 2; phase.position.y = 0.012; earthP.add(phase);
    // the moon on its arm, and the tilted ring of her road with the dragon's head and tail
    const moonArm = new THREE.Group(); moonArm.position.y = 0.11; earthP.add(moonArm);
    const moonB = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), mat(0xd8d4c8, { roughness: 0.7 })); moonArm.add(moonB);
    const moonRod = cyl(0.003, 0.003, 0.08, b, 4); moonRod.rotation.z = Math.PI / 2; moonArm.add(moonRod);
    const ringG = new THREE.Group(); ringG.position.y = 0.11; earthP.add(ringG);
    const ringTilt = new THREE.Group(); ringTilt.rotation.x = deg(16); ringG.add(ringTilt);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.004, 6, 64), b); ring.rotation.x = Math.PI / 2; ringTilt.add(ring);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 8), mat(0xb02018, { roughness: 0.5 })); head.position.set(0.08, 0, 0); head.rotation.z = -Math.PI / 2; ringTilt.add(head);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05, 6), mat(0x2a6a2a, { roughness: 0.5 })); tail.position.set(-0.08, 0, 0); tail.rotation.z = -Math.PI / 2; ringTilt.add(tail);
    // knobs along the front edge of the bench, and the handle
    const knobs = [];
    ['ANNUS', 'LUNA', 'DRACO'].forEach((lbl, i) => {
      const k = new THREE.Group();
      const kn = cyl(0.035, 0.04, 0.05, b, 16); kn.rotation.z = Math.PI / 2; k.add(kn);
      const fin = box(0.012, 0.012, 0.06, dark, 0.02, 0.02, 0); k.add(fin);
      k.position.set(bx + 0.53, 0.93, 5.0 + (i - 1) * 0.42); shop.add(k);
      const plate = P.signPlane(T.sign({ w: 256, h: 80, bg: '#c9a556', color: '#3a2810', size: 40, lines: [lbl] }), 0.13, { transparent: false });
      plate.position.set(bx + 0.505, 0.86, 5.0 + (i - 1) * 0.42); plate.rotation.y = Math.PI / 2; shop.add(plate);
      const hit = box(0.12, 0.2, 0.22, new THREE.MeshBasicMaterial({ visible: false }), bx + 0.53, 0.9, 5.0 + (i - 1) * 0.42); shop.add(hit);
      hot(hit, { nodes: ['k_orrery'], click: () => stepKnob(i) });
      knobs.push(k);
    });
    const lever = new THREE.Group();
    lever.add(cyl(0.012, 0.012, 0.32, P.iron(), 8, 0, 0.16, 0));
    const lk = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), mat(0x6a1a12)); lk.position.y = 0.32; lever.add(lk);
    lever.position.set(bx + 0.3, 0.99, 5.0 + 0.5); lever.rotation.x = -0.5; shop.add(lever);
    const lhit = box(0.2, 0.4, 0.2, new THREE.MeshBasicMaterial({ visible: false }), 0, 0.2, 0); lever.add(lhit);
    hot(lever, { nodes: ['k_orrery'], click: () => pullLever() });
    orrery.userData = { arm, earthP, moonArm, ringG, moonB, knobs, lever };
  }
  const O = orrery.userData;
  const stepSizes = [12, 8, 8];
  function stepKnob(i) {
    if (toy.testing || st.flags.eclipse) { if (st.flags.eclipse) api.ui.say('The Toy has done its work. It turns, but nothing up there is listening any more.'); return; }
    api.A.sfx.clack();
    if (i === 0) toy.e = (toy.e + 1) % 12; else if (i === 1) toy.p = (toy.p + 1) % 8; else toy.n = (toy.n + 1) % 8;
    O.knobs[i].userData.spin = (O.knobs[i].userData.spin || 0) + Math.PI * 2 / stepSizes[i];
  }
  const lerpA = (a, b, k) => a + (b - a) * k;
  function poseToy(dt) {
    const k = Math.min(1, dt * 6);
    toy.de = lerpA(toy.de, unwrap(toy.de, toy.e, 12), k);
    toy.dp = lerpA(toy.dp, unwrap(toy.dp, toy.p, 8), k);
    toy.dn = lerpA(toy.dn, unwrap(toy.dn, toy.n, 8), k);
    const ae = toy.de * Math.PI / 6;
    O.arm.rotation.y = ae;
    const phi = Math.PI + toy.dp * Math.PI / 4; // in the arm's frame, toward the sun is +PI
    const nu = toy.dn * Math.PI / 4 - ae;
    const R = 0.08, inc = deg(16);
    O.moonB.position.set(Math.cos(phi) * R, R * Math.sin(phi - nu) * Math.sin(inc), -Math.sin(phi) * R * Math.cos(inc));
    O.moonArm.children[1].position.set(Math.cos(phi) * R / 2, O.moonB.position.y / 2, -Math.sin(phi) * R / 2);
    O.moonArm.children[1].rotation.set(0, phi, Math.PI / 2);
    O.ringG.rotation.y = nu;
    O.knobs.forEach(kn => { kn.rotation.x = lerpA(kn.rotation.x, kn.userData.spin || 0, k); });
    O.lever.rotation.x = -0.5 + toy.lever * 1.0;
  }
  function unwrap(cur, target, n) { let t = target; while (t - cur > n / 2) t -= n; while (cur - t > n / 2) t += n; return t; }

  // ---- the eclipse ----
  const ecl = { k: 0, target: 0, pulse: 0 };
  async function pullLever() {
    if (toy.testing) return;
    if (st.flags.eclipse) { api.ui.say('The handle goes over without a fight. The sky has already done what it was told.'); return; }
    toy.testing = true;
    api.A.sfx.grind();
    for (let i = 0; i <= 10; i++) { toy.lever = i / 10; await api.wait(30); }
    const earthOK = toy.e === CANCER, moonOK = toy.p === 0;
    const sunAbs = (toy.e * 30 + 180) % 360, nodeAbs = toy.n * 45;
    const nodeOK = ((nodeAbs - sunAbs) % 180 + 180) % 180 === 0;
    if (earthOK && moonOK && nodeOK) { await eclipse(); toy.testing = false; return; }
    await api.wait(400);
    if (moonOK && nodeOK) {
      ecl.pulse = 1; api.A.sfx.gasp();
      api.ui.say('The little brass moon slides square across the little brass sun. Outside, the real sun dims for one long breath, and comes back. The crowd mutters. The sky agrees with the Toy, but not on this date.', 8);
    } else if (moonOK) {
      const h = O.moonB.position.y;
      api.ui.say(`The brass moon passes ${h > 0 ? 'above' : 'below'} the brass sun, not across it. Outside, nothing happens at all.`, 6);
    } else {
      api.ui.say('The handle grinds over. The brass moon isn’t anywhere near the brass sun. Somewhere outside, a hen complains.', 6);
    }
    for (let i = 10; i >= 0; i--) { toy.lever = i / 10; await api.wait(40); }
    toy.testing = false;
  }
  async function eclipse() {
    api.setBusy(true);
    st.flags.eclipse = true; api.save();
    api.ui.say('The handle goes over with a deep, satisfied clunk, and the Toy begins to hum.', 4);
    await api.wait(1800);
    await api.fadeTo('k_stake', 180);
    api.setBusy(true);
    await api.look(180, 30, 1.6);
    ecl.target = 1;
    api.ui.say('A bite comes out of the sun.', 4);
    await api.wait(5200);
    api.A.sfx.gasp(); api.A.crowdLevel(0.25);
    api.ui.say('The light goes thin and strange and cold. Every shadow in the ward goes sharp. The crowd goes down on its knees.', 6);
    await api.wait(6000);
    api.ui.say('In the dark, from the top of Merlin’s tower, you hear a bar fall and a door swing open.', 5);
    api.A.sfx.door();
    await api.wait(5000);
    ecl.target = 0;
    await api.wait(3500);
    api.A.sfx.cheer(); api.A.crowdLevel(1);
    api.ui.say('The sun comes back. Camelot decides, at the top of its lungs, that you are the greatest wizard in Britain.', 7);
    await api.wait(2500);
    await api.look(180, 6, 1.4);
    api.setBusy(false);
  }

  // ---- Merlin's tower: the door, the stair, the room at the top ----
  const doorPos = TW.clone().add(V(-1, 0, 1).normalize().multiplyScalar(TR + 0.33));
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorPos.x, 0, doorPos.z); doorPivot.rotation.y = -Math.PI / 4; scene.add(doorPivot);
  const doorHinge = new THREE.Group(); doorHinge.position.set(-0.8, 0, 0); doorPivot.add(doorHinge);
  const door = box(1.6, 2.8, 0.14, mat(0xffffff, { map: T.wood({ base: [96, 62, 36], dark: [56, 34, 18], planks: 5, seed: 71 }) }), 0.8, 1.4, 0.05);
  doorHinge.add(door);
  [0.5, 2.2].forEach(y => doorHinge.add(box(1.5, 0.08, 0.04, P.iron(), 0.8, y, 0.14)));
  const chalk = P.signPlane(T.sign({ w: 256, h: 128, color: 'rgba(240,240,232,.9)', font: '"Gochi Hand", cursive', size: 34, lines: ['MERLIN', 'by appointment'], rotate: -0.05 }), 0.9);
  chalk.position.set(0.8, 1.8, 0.13); doorHinge.add(chalk);
  const dark = box(1.6, 2.8, 0.1, new THREE.MeshBasicMaterial({ color: 0x0a0806 }), 0, 1.4, -0.08); doorPivot.add(dark);
  hot(door, { nodes: ['k_tower'], when: () => !st.flags.eclipse, click: () => { api.A.sfx.creak(); api.ui.doc('merlinDoor'); setTimeout(() => api.ui.say('Barred from the inside. Whatever lets you in, it isn’t knocking.', 4), 50); } });
  function placeDoor() { doorHinge.rotation.y = st.flags.eclipse ? -1.9 : 0; }
  placeDoor();

  // the room at the top, built inside the tower
  const top = new THREE.Group(); scene.add(top);
  const TOPY = 15.0;
  {
    const room = new THREE.Mesh(new THREE.CylinderGeometry(TR - 0.4, TR - 0.4, 3.6, 28, 1, true), mat(0xffffff, { map: (() => { const t = T.stone({ base: [120, 110, 98], rows: 6, seed: 8 }); t.repeat.set(5, 1); return t; })(), side: THREE.BackSide, roughness: 1 }));
    room.position.set(TW.x, TOPY + 1.8, TW.z); top.add(room);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(TR - 0.4, 28), mat(0xffffff, { map: T.wood({ base: [90, 60, 36], dark: [56, 36, 20], planks: 6, seed: 9 }) }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(TW.x, TOPY, TW.z); top.add(floor);
    const ceilT = T.canvas(512, 512, (g, w) => {
      g.fillStyle = '#141a3a'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,236,170,${0.4 + Math.random() * 0.6})`; const x = Math.random() * w, y = Math.random() * w, r = Math.random() * 2.4 + 0.6; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      g.strokeStyle = '#d8b24a'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, w * 0.3, 0, 7); g.stroke();
      g.fillStyle = '#e8c870'; g.beginPath(); g.arc(w / 2, w / 2, 26, 0, 7); g.fill();
    }, { wrap: false });
    const ceil = new THREE.Mesh(new THREE.CircleGeometry(TR - 0.4, 28), mat(0xffffff, { map: ceilT, emissive: 0x222244, emissiveMap: ceilT, emissiveIntensity: 0.6 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(TW.x, TOPY + 3.6, TW.z); top.add(ceil);
    // a window toward the courtyard
    const wdir = V(-1, 0, 1).normalize();
    const winTex = T.canvas(128, 192, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a8ad0'); gr.addColorStop(0.7, '#c8d8e8'); gr.addColorStop(1, '#9aa890');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8a8270'; for (let x = 0; x < w; x += 24) g.fillRect(x, h * 0.78, 14, h * 0.22); g.fillRect(0, h * 0.86, w, h * 0.14);
      g.fillStyle = '#3a3428'; g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h); g.fillRect(w / 2 - 3, 0, 6, h);
    }, { wrap: false });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), new THREE.MeshBasicMaterial({ map: winTex, fog: false }));
    win.position.copy(TW).addScaledVector(wdir, TR - 0.45); win.position.y = TOPY + 1.9; win.lookAt(TW.x, TOPY + 1.9, TW.z); top.add(win);
    const wl = new THREE.PointLight(0xe8f0ff, 8, 9, 1.5); wl.position.copy(win.position).addScaledVector(wdir, -0.6); top.add(wl);
    const candleL = new THREE.PointLight(0xffb070, 3, 6, 2); candleL.position.set(TW.x + 1.2, TOPY + 1.5, TW.z - 1.2); top.add(candleL);
    // lectern with the page, a stuffed owl, a shelf of jars
    const lect = new THREE.Group();
    lect.add(box(0.12, 1.1, 0.12, mat(0x4a2a14), 0, 0.55, 0));
    const lt = box(0.6, 0.05, 0.45, mat(0x4a2a14), 0, 1.15, 0); lt.rotation.x = -0.4; lect.add(lt);
    lect.add(box(0.5, 0.05, 0.4, mat(0x4a2a14), 0, 0.03, 0));
    lect.position.copy(TW).addScaledVector(wdir, -0.3); lect.position.y = TOPY; lect.rotation.y = -Math.PI / 4 + Math.PI; top.add(lect);
    const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.32), mat(0xffffff, { map: T.paper({ seed: 101, lines: 12 }), emissive: 0x222018 }));
    pg.position.set(0, 1.18, 0.0); pg.rotation.x = -Math.PI / 2 + 0.4; lect.add(pg);
    lect.userData.page = pg;
    const lhit = box(0.7, 0.6, 0.6, new THREE.MeshBasicMaterial({ visible: false }), 0, 1.15, 0); lect.add(lhit);
    hot(lect, { nodes: ['k_top'], when: () => !st.pages.court, click: async () => { api.A.sfx.paper(); await api.collect('court', 'pageCourt'); pg.visible = false; } });
    top.userData.page = pg;
    const owl = new THREE.Group();
    const ob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(0x7a6040)); ob.scale.y = 1.4; owl.add(ob);
    const oh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mat(0x7a6040)); oh.position.y = 0.26; owl.add(oh);
    [-0.05, 0.05].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf0c020 })); e.position.set(x, 0.28, 0.1); owl.add(e); });
    const shelf = box(1.6, 0.06, 0.35, mat(0x4a2a14), 0, 0, 0);
    const shelfG = new THREE.Group(); shelfG.add(shelf);
    for (let i = 0; i < 6; i++) { const j = cyl(0.06, 0.06, 0.18 + (i % 3) * 0.05, new THREE.MeshPhysicalMaterial({ color: [0x4a8a5a, 0x8a4a2a, 0x3a4a8a][i % 3], roughness: 0.1, transparent: true, opacity: 0.75 }), 10, -0.65 + i * 0.26, 0.12, 0); shelfG.add(j); }
    owl.position.set(0.5, 0.2, 0); shelfG.add(owl);
    const sdir = V(1, 0, 1).normalize();
    shelfG.position.copy(TW).addScaledVector(sdir, TR - 0.65); shelfG.position.y = TOPY + 1.4; shelfG.lookAt(TW.x, TOPY + 1.4, TW.z); top.add(shelfG);
    // a rug, candles on the lectern, a stack of books, a hanging astrolabe
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), mat(0x5a1e2a, { roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(TW.x, TOPY + 0.01, TW.z); top.add(rug);
    [-0.22, 0.22].forEach(x => { const c = cyl(0.02, 0.022, 0.14, mat(0xe8dcc0), 8, x, 1.25, -0.15); lect.add(c); const f = P.glowSprite(0.18, 0xffb060, 0.9); f.position.set(x, 1.36, -0.15); lect.add(f); });
    for (let i = 0; i < 5; i++) { const bk = box(0.32, 0.07, 0.24, mat([0x5a1e18, 0x1e3a2a, 0x2a2440, 0x6b4a20, 0x3a1a10][i]), 0, 0, 0); bk.position.copy(TW).addScaledVector(V(-1, 0, -1).normalize(), TR - 1.0); bk.position.y = TOPY + 0.035 + i * 0.07; bk.rotation.y = i * 0.4; top.add(bk); }
    const astro = new THREE.Group();
    astro.add(new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.015, 8, 40), P.brass()));
    const a2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 8, 40), P.brass()); a2.rotation.y = Math.PI / 2; astro.add(a2);
    const a3 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.01, 8, 40), P.brass()); a3.rotation.x = Math.PI / 2.6; astro.add(a3);
    astro.position.set(TW.x - 1.3, TOPY + 2.6, TW.z - 0.6); top.add(astro); top.userData.astro = astro;
    hot(owl, { nodes: ['k_top'], click: () => api.ui.say('A stuffed owl. Its glass eyes follow you round the room, which you suspect is the most magic in the place.') });
  }

  // ---- stereoscope home, under the gate ----
  const scope = P.stereoscope();
  scope.position.set(2.6, 1.08, 21.5); scope.rotation.y = deg(-90); scene.add(scope);
  const homeTex = P.stereoCardTexture('THE STUDY AT QUARRY FARM');
  const homeCard = P.stereoCard(homeTex);
  homeCard.position.copy(scope.userData.cardSlot).applyAxisAngle(V(0, 1, 0), deg(-90)).add(scope.position); homeCard.rotation.y = deg(-90); scene.add(homeCard);
  scope.add(box(0.6, 0.6, 0.8, new THREE.MeshBasicMaterial({ visible: false })));
  hot(scope, { nodes: ['k_arrive'], click: () => api.travel('study', { node: 's_scope' }) });

  // shadows on most things
  castle.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  top.traverse(o => { if (o.isMesh) o.receiveShadow = true; });

  // ---- nodes ----
  const towerYaw = 315;
  const nodes = {
    k_arrive: { pos: [0, 1.65, 21], yaw: 0, links: [{ yaw: 0, to: 'k_stake' }] },
    k_stake: {
      pos: [0, 1.65, 3.6], yaw: 0, turn: 45, pitches: { 0: -2, 180: 8 },
      links: [{ yaw: 180, to: 'k_arrive' }, { yaw: 90, to: 'k_shop', arrive: 90 }, { yaw: towerYaw, to: 'k_tower', arrive: towerYaw },
        { yaw: 0, to: 'k_stake', when: () => false, msg: 'The King is watching you from the dais. Better not.' }],
    },
    k_shop: {
      pos: [-18.6, 1.65, 5.0], yaw: 90, amb: 'shop', pitch: -10,
      links: [{ yaw: 90, to: 'k_orrery' }, { yaw: 270, to: 'k_stake', arrive: 270 }],
    },
    k_orrery: { pos: [SHOP.x0 + 1.6, 1.58, 5.0], target: [SHOP.x0 + 0.62, 0.98, 5.0], back: 'k_shop', backYaw: 90, amb: 'shop' },
    k_tower: {
      pos: [13.6, 1.65, -13.6], yaw: towerYaw, turn: 45, pitch: 4,
      links: [{ yaw: towerYaw, to: 'k_top', fade: true, arrive: 135, when: () => st.flags.eclipse, msg: 'The door is barred from the inside.', say: 'Up and up the turning stair.' }, { yaw: 135, to: 'k_stake', arrive: 135 }],
    },
    k_top: {
      pos: [TW.x + 1.2, TOPY + 1.65, TW.z - 1.2], yaw: 135, amb: 'shop', pitch: -12,
      links: [{ yaw: 315, to: 'k_tower', fade: true, arrive: 135, say: 'Down and down the turning stair.' }],
    },
  };

  function applyLight() {
    const k = Math.max(ecl.k, ecl.pulse * 0.55);
    const day = 1 - k * 0.97;
    sun.intensity = 3.0 * day; hemi.intensity = 1.0 * (1 - k * 0.93);
    sky.userData.u.dim.value = 1 - k * 0.93;
    starsM.material.opacity = Math.max(0, (k - 0.75) * 4);
    corona.material.opacity = Math.max(0, (k - 0.85) * 6) * 0.9;
    sunGlow.material.opacity = 0.85 * (1 - Math.min(1, k * 1.15));
    moonDisc.visible = k > 0.001;
    placeMoon(Math.min(1, k * 1.05));
    fogDay.color.setRGB(0.78 * day + 0.03, 0.84 * day + 0.04, 0.89 * day + 0.08);
    crowd.kneel = Math.max(0, (ecl.k - 0.6) * 2.5);
  }
  applyLight();

  function update(dt, t) {
    ecl.k += (ecl.target - ecl.k) * Math.min(1, dt * (ecl.target > ecl.k ? 0.22 : 0.35));
    if (ecl.pulse > 0) ecl.pulse = Math.max(0, ecl.pulse - dt * 0.25);
    applyLight();
    poseCrowd(t);
    poseToy(dt);
    if (castle.userData.pennant) castle.userData.pennant.rotation.y = Math.sin(t * 1.7) * 0.3;
    if (st.flags.eclipse && doorHinge.rotation.y > -1.9) doorHinge.rotation.y = Math.max(-1.9, doorHinge.rotation.y - dt * 0.6);
    top.userData.page.visible = !st.pages.court;
    if (top.userData.astro) top.userData.astro.rotation.y += dt * 0.3;
  }

  return {
    scene, nodes, hots, start: 'k_arrive', amb: 'court', exposure: 1.0,
    snapNode: 'k_arrive', snapYaw: 0, snapPitch: 4,
    update,
    onEnterWorld() { placeDoor(); ecl.k = ecl.target = 0; },
    onSnapshots(worlds) { homeTex.userData.paint(worlds.study.snapCanvas); },
    debug: { toy, ecl, pullLever, stepKnob, crowd },
  };
}
