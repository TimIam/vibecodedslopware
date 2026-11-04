// The river: a sidewheel packet at night above the Hat Island crossing. You steer her yourself.
import * as THREE from 'three';
import * as T from './tex.js';
import * as P from './props.js';

const { V, box, cyl, mat, dirYaw, deg } = P;

// Channel centreline (world XZ). Leg A hugs the larboard shore; leg B crosses to the woodyard light.
const CH = [[-140, 400], [-140, -250], [160, -666], [176, -697]];
const START = { x: -140, z: -30, yaw: 0 };
const LAMP = V(186, 6, -702);
const BOW = 35;
const SPEED = 8.5;
const leftX = z => -205 + 40 * Math.exp(-(((z + 250) / 70) ** 2));
const rightX = z => 206 - 24 * Math.exp(-(((z + 700) / 90) ** 2));

function distToChannel(x, z) {
  let best = 1e9;
  for (let i = 0; i < CH.length - 1; i++) {
    const [ax, az] = CH[i], [bx, bz] = CH[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
export const depthAt = (x, z) => Math.max(0.6, 3.35 - Math.max(0, distToChannel(x, z) - 12) * 0.052);

function call(d) {
  if (d >= 3.15) return 'M-a-r-k three!';
  if (d >= 2.85) return 'Quarter less three!';
  if (d >= 2.6) return 'Half twain!';
  if (d >= 2.35) return 'Quarter twain!';
  if (d >= 2.05) return 'M-a-r-k twain!';
  return 'Quarter less twain!';
}

export function buildRiver(api) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1424, 0.0016);
  const hots = [];
  const hot = (o, cfg) => api.hot(o, cfg, hots);
  const st = api.state;

  // ---- sky, moon, water ----
  const moonDir = dirYaw(-58, 22);
  const skyM = P.sky({ top: 0x050b1e, horizon: 0x2c3f66, bottom: 0x05080e, glowDir: moonDir, glowColor: 0x3a5080, glowSize: 0.35 });
  const starsM = P.stars({ count: 2200, seed: 9 });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
  moon.position.copy(moonDir.clone().multiplyScalar(1300)); moon.lookAt(0, 0, 0);
  const moonGlow = P.glowSprite(240, 0x9fb2e8, 0.5, 'moon'); moonGlow.position.copy(moon.position);
  scene.add(skyM, starsM, moon, moonGlow);
  // Water reflects the sky: bake an environment from the sky alone.
  const skyScene = new THREE.Scene(); skyScene.add(skyM.clone(), moon.clone(), moonGlow.clone());
  const pm = new THREE.PMREMGenerator(api.renderer);
  const env = pm.fromScene(skyScene, 0.02, 1, 4000).texture;
  const wn = T.waterNormal(); wn.repeat.set(300, 300);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({
    color: 0x060c18, roughness: 0.2, metalness: 0.1, normalMap: wn, normalScale: new THREE.Vector2(0.18, 0.18), envMap: env, envMapIntensity: 1.0,
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -400);
  scene.add(water);

  scene.add(new THREE.HemisphereLight(0x4a5e94, 0x0a0c12, 1.1));
  const moonL = new THREE.DirectionalLight(0xa8b8e8, 0.55); moonL.position.copy(moonDir.clone().multiplyScalar(100)); scene.add(moonL);

  // ---- the banks ----
  const landM = mat(0x0d120c, { roughness: 1 }), mudM = mat(0x1a1610, { roughness: 1 });
  function bank(fx, side) {
    const pts = [];
    for (let z = 600; z >= -1600; z -= 10) pts.push([fx(z), z]);
    const sh = new THREE.Shape();
    const far = side * 900;
    sh.moveTo(pts[0][0] + far, -pts[0][1]);
    pts.forEach(([x, z]) => sh.lineTo(x, -z));
    sh.lineTo(pts[pts.length - 1][0] + far, -pts[pts.length - 1][1]);
    const land = new THREE.Mesh(new THREE.ShapeGeometry(sh), landM);
    land.rotation.x = -Math.PI / 2; land.position.y = 1.2; scene.add(land);
    // the cut bank face
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      pos.push(x0, -0.5, z0, x1, -0.5, z1, x1, 1.2, z1, x0, -0.5, z0, x1, 1.2, z1, x0, 1.2, z0);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1a1610, roughness: 1, side: THREE.DoubleSide })));
  }
  bank(leftX, -1); bank(rightX, 1);
  void mudM;

  // trees along both banks, kept clear of the cottonwood and the woodyard
  const COTTON = V(-178, 1.2, -250);
  {
    const r = T.rng(17), crowns = [], trunks = [], crownG = new THREE.IcosahedronGeometry(1, 1);
    const add = (x, z, h, w) => {
      crowns.push(P.tm(x, 1.2 + h * 0.62, z, w, h * 0.42, w, r() * 6));
      trunks.push(P.tm(x, 1.2 + h * 0.25, z, 1, h * 0.5, 1));
    };
    for (let z = 560; z > -1580; z -= 5) {
      for (const side of [-1, 1]) {
        const bx = side < 0 ? leftX(z) : rightX(z);
        for (let k = 0; k < 2; k++) {
          const x = bx + side * (4 + r() * 50), zz = z + r() * 5;
          if (Math.hypot(x - COTTON.x, zz - COTTON.z) < 34) continue;
          if (side > 0 && Math.abs(zz + 700) < 26 && x < 215) continue;
          add(x, zz, 10 + r() * 12, 3 + r() * 3.5);
        }
      }
    }
    // Hat Island, a low towhead of willows mid-river below the crossing
    const isl = new THREE.Mesh(new THREE.CircleGeometry(1, 40), landM);
    isl.rotation.x = -Math.PI / 2; isl.scale.set(80, 26, 1); isl.position.set(120, 0.7, -360); isl.rotation.z = 0.3; scene.add(isl);
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      const lx = Math.cos(a) * 74 * d, lz = Math.sin(a) * 22 * d;
      const c = Math.cos(-0.3), s = Math.sin(-0.3);
      const x = 120 + lx * c - lz * s, z = -360 + lx * s + lz * c;
      crowns.push(P.tm(x, 0.7 + 4, z, 3 + r() * 2, 3.5 + r() * 2.5, 3 + r() * 2, r() * 6));
    }
    const treeM = mat(0x0a100b, { roughness: 1, flatShading: true });
    scene.add(P.instanced(crownG, treeM, crowns));
    scene.add(P.instanced(new THREE.CylinderGeometry(0.3, 0.5, 1, 6), mat(0x120d09), trunks));
    // the big cottonwood on the point: tall, wide and lonely
    const ct = new THREE.Group();
    const trunk = cyl(0.9, 1.6, 22, mat(0x15100b), 8, 0, 11, 0); ct.add(trunk);
    [[0, 30, 0, 9], [-6, 26, 3, 7], [6, 27, -2, 7.5], [2, 34, 2, 6], [-3, 22, -5, 6], [5, 22, 5, 6]].forEach(([x, y, z, s]) => {
      const c = new THREE.Mesh(crownG, treeM); c.position.set(x, y, z); c.scale.set(s, s * 0.75, s); ct.add(c);
    });
    ct.position.copy(COTTON); scene.add(ct);
  }

  // ---- the woodyard ----
  const yard = new THREE.Group(); scene.add(yard);
  const lampPost = cyl(0.12, 0.15, 6, mat(0x2a1e14), 6, LAMP.x, 3, LAMP.z); yard.add(lampPost);
  const lantern = box(0.5, 0.7, 0.5, new THREE.MeshBasicMaterial({ color: 0xffd090 }), LAMP.x, LAMP.y, LAMP.z); yard.add(lantern);
  const lampGlow = P.glowSprite(30, 0xffb060, 0.95); lampGlow.position.copy(LAMP); yard.add(lampGlow);
  const lampL = new THREE.PointLight(0xffa850, 60, 90, 1.5); lampL.position.copy(LAMP); yard.add(lampL);
  {
    const logM = mat(0x2e2016, { roughness: 1 });
    const endM = mat(0xffffff, { roughness: 1, map: T.canvas(128, 64, (g, w, h) => {
      g.fillStyle = '#1e140c'; g.fillRect(0, 0, w, h);
      const r = T.rng(4);
      for (let y = 6; y < h; y += 11) for (let x = 6 + (y % 2) * 5; x < w; x += 11) {
        const rad = 4 + r() * 1.5; g.fillStyle = `rgb(${120 + r() * 30},${90 + r() * 20},${58})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
        g.strokeStyle = 'rgba(60,40,20,.6)'; g.beginPath(); g.arc(x, y, rad * 0.5, 0, 7); g.stroke();
      }
    }, { wrap: false }) });
    for (let i = 0; i < 6; i++) {
      const pile = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 5), [endM, endM, logM, logM, logM, logM]);
      pile.position.set(196 + (i % 3) * 6, 2.3, -688 - Math.floor(i / 3) * 14 - (i % 2) * 3);
      yard.add(pile);
    }
    const shack = new THREE.Group();
    shack.add(box(6, 3.4, 4.5, mat(0x2a2016, { roughness: 1 }), 0, 1.7, 0));
    const roof = box(7, 0.25, 5.5, mat(0x1c1610), 0, 3.55, 0); roof.rotation.z = 0.12; shack.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({ color: 0xffb860 })); win.position.set(-3.01, 1.9, 0); win.rotation.y = -Math.PI / 2; shack.add(win);
    shack.position.set(205, 1.2, -712); yard.add(shack);
  }

  // Reflection streaks on the water toward the viewer (lamp and moon).
  const streakTex = T.canvas(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, fx = 1 - Math.abs(x / w - 0.5) * 2, br = (Math.sin(y * 0.9) * 0.5 + 0.5) * 0.6 + 0.4; d[i + 3] *= fx * fx * br; }
    g.putImageData(img, 0, 0);
  }, { wrap: false });
  const streak = (color, w, len) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ map: streakTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.geometry.rotateX(-Math.PI / 2); m.geometry.translate(0, 0, len / 2); scene.add(m); return m;
  };
  const lampStreak = streak(0xffa860, 5, 120);
  const moonStreak = streak(0x8b9ccc, 40, 900);

  // ---- the boat ----
  const boat = new THREE.Group(); boat.rotation.order = 'YXZ';
  scene.add(boat);
  const white = mat(0xe6e2d6, { roughness: 0.7 }), deckM = mat(0xffffff, { map: T.wood({ base: [120, 98, 72], dark: [84, 64, 44], planks: 8, seed: 6, repeat: [4, 12] }), roughness: 0.85 });
  const darkM = mat(0x161412, { roughness: 0.7 }), redM = mat(0x5a1c14, { roughness: 0.8 });
  {
    const outline = [[-6, 35], [6, 35], [6.2, -12], [5, -26], [2.6, -33], [0, -35.5], [-2.6, -33], [-5, -26], [-6.2, -12]];
    const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: false }), [deckM, darkM]);
    hull.rotation.x = -Math.PI / 2; hull.position.y = -1.4; boat.add(hull);
    T.planarUV(hull.geometry, 0.12, 'xy');
    // guards and the main deck overhang around the paddle boxes
    boat.add(box(21, 0.3, 34, deckM, 0, 1.08, 6));
    // boiler deck floor, posts, cabin
    const bd = box(19, 0.3, 56, white, 0, 4.6, 3); boat.add(bd);
    {
      const post = new THREE.CylinderGeometry(0.1, 0.1, 3.4, 6), ms = [];
      for (let z = -24; z <= 30; z += 3) for (const x of [-9.3, 9.3]) ms.push(P.tm(x, 2.9, z));
      for (let z = -20; z <= 30; z += 3) for (const x of [-4.5, 4.5]) ms.push(P.tm(x, 2.9, z));
      boat.add(P.instanced(post, white, ms));
      // promenade railing on the boiler deck and the hurricane deck
      const rail = [], baluster = new THREE.BoxGeometry(0.05, 0.9, 0.05);
      for (let z = -24; z <= 30; z += 0.6) for (const x of [-9.4, 9.4]) rail.push(P.tm(x, 5.2, z));
      for (let z = -22; z <= 26; z += 0.6) for (const x of [-6.9, 6.9]) rail.push(P.tm(x, 8.3, z));
      boat.add(P.instanced(baluster, white, rail));
      [-9.4, 9.4].forEach(x => boat.add(box(0.12, 0.08, 55, white, x, 5.68, 3)));
      [-6.9, 6.9].forEach(x => boat.add(box(0.1, 0.08, 49, white, x, 8.78, 2)));
    }
    // cabin with lit windows
    const winTex = (len, rows = 1) => T.canvas(1024, 128 * rows, (g, w, h) => {
      g.fillStyle = '#e6e2d6'; g.fillRect(0, 0, w, h);
      const n = Math.round(len / 1.6);
      for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
        const lit = Math.random() < 0.7, x = (i + 0.25) * w / n, y = r * 128 + 26;
        g.fillStyle = lit ? '#ffc271' : '#2b2a28'; g.fillRect(x, y, w / n * 0.5, 70);
        g.strokeStyle = '#8a7a60'; g.lineWidth = 3; g.strokeRect(x, y, w / n * 0.5, 70);
      }
    }, { wrap: false });
    const cabTex = winTex(46);
    const cabSide = mat(0xffffff, { map: cabTex, emissive: 0xffffff, emissiveMap: cabTex, emissiveIntensity: 0.0, roughness: 0.7 });
    cabSide.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = texture2D(emissiveMap, vEmissiveMapUv).rgb * step(0.6, texture2D(emissiveMap, vEmissiveMapUv).r - texture2D(emissiveMap, vEmissiveMapUv).b) * 1.4;'); };
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3, 46), [cabSide, cabSide, white, white, white, white]);
    cabin.position.set(0, 6.25, 4);
    // rotate side UVs so the window strip runs along the boat
    boat.add(cabin);
    const hd = box(14, 0.22, 50, white, 0, 7.85, 2); boat.add(hd);
    // texas
    const texTex = winTex(16);
    const texSide = cabSide.clone(); texSide.map = texTex; texSide.emissiveMap = texTex; texSide.onBeforeCompile = cabSide.onBeforeCompile;
    const texas = new THREE.Mesh(new THREE.BoxGeometry(7, 2.3, 18), [texSide, texSide, white, white, white, white]);
    texas.position.set(0, 9.1, 1); boat.add(texas);
    boat.add(box(8, 0.18, 19, white, 0, 10.3, 1));
    // paddle boxes with the name
    const nameTex = T.canvas(512, 256, (g, w, h) => {
      g.fillStyle = '#e6e2d6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8a2a1a'; g.lineWidth = 6;
      for (let i = 0; i < 13; i++) { const a = Math.PI + i / 12 * Math.PI; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2 + Math.cos(a) * 240, h + Math.sin(a) * 240); g.stroke(); }
      g.fillStyle = '#e6e2d6'; g.beginPath(); g.arc(w / 2, h, 80, Math.PI, 0); g.fill();
      g.fillStyle = '#1c1c3a'; g.font = 'bold 44px "IM Fell English SC", Georgia, serif'; g.textAlign = 'center'; g.fillText('PAUL JONES', w / 2, 60);
    }, { wrap: false });
    nameTex.repeat.set(1, 2); nameTex.offset.set(0, -1);
    [-1, 1].forEach(s => {
      const pb = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 3, 28, 1, false, 0, Math.PI), white);
      pb.rotation.z = Math.PI / 2; pb.rotation.y = s < 0 ? Math.PI : 0; pb.position.set(s * 10.6, 1.1, 6);
      boat.add(pb);
      const face = new THREE.Mesh(new THREE.CircleGeometry(5.6, 28, 0, Math.PI), mat(0xffffff, { map: nameTex }));
      face.position.set(s * 12.12, 1.1, 6); face.rotation.y = s * Math.PI / 2; boat.add(face);
    });
    // boilers with glowing furnace doors, cordwood
    [-2.2, 2.2].forEach(x => {
      const b = cyl(1.1, 1.1, 16, darkM, 14, x, 2.4, -14); b.rotation.x = Math.PI / 2; boat.add(b);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ color: 0xff7a2a })); door.position.set(x, 1.9, -22.05); door.rotation.y = Math.PI; boat.add(door);
      const d2 = door.clone(); d2.rotation.y = 0; d2.position.z = -22.1; boat.add(d2);
    });
    const furnace = new THREE.PointLight(0xff7a30, 40, 22, 1.8); furnace.position.set(0, 2.2, -24); boat.add(furnace);
    for (let i = 0; i < 4; i++) boat.add(box(3.5, 1.4, 1.2, mat(0x3b2a1a), (i % 2 ? 1 : -1) * 6, 1.9, -6 + Math.floor(i / 2) * 3));
    // chimneys with feathered crowns
    [-4.6, 4.6].forEach(x => {
      boat.add(cyl(0.85, 0.85, 19, darkM, 16, x, 17.2, -14));
      const crown = P.lathe([[0.85, 0], [1.05, 0.6], [1.5, 1.6], [1.55, 1.8], [0.85, 1.8]], darkM, 16);
      crown.position.set(x, 26.7, -14); boat.add(crown);
    });
    boat.add(box(9.8, 0.25, 0.25, darkM, 0, 22, -14));
    // the big bell between the chimneys
    const bell = P.lathe([[0.001, 0.9], [0.25, 0.88], [0.32, 0.6], [0.45, 0.15], [0.55, 0]], P.brass(), 20);
    bell.position.set(0, 8.5, -12); boat.add(bell);
    boat.add(box(1.6, 0.12, 0.12, darkM, 0, 9.5, -12), cyl(0.06, 0.06, 1.6, darkM, 6, -0.75, 8.7, -12), cyl(0.06, 0.06, 1.6, darkM, 6, 0.75, 8.7, -12));
    // jackstaff at the bow
    boat.add(cyl(0.07, 0.1, 8.6, white, 8, 0, 5.4, -34.6));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), P.brass()); knob.position.set(0, 9.8, -34.6); boat.add(knob);
    // a pair of hanging lanterns on the boiler deck
    [[-9.2, 4.0, -18], [9.2, 4.0, -18], [-9.2, 4.0, 20], [9.2, 4.0, 20]].forEach(p => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 })); l.position.set(...p); boat.add(l);
      const gs = P.glowSprite(2.2, 0xffb060, 0.7); gs.position.set(...p); boat.add(gs);
    });
  }

  // ---- pilothouse ----
  const PH = { z0: -8, z1: -3.6, y0: 10.4 };
  const pilothouse = new THREE.Group(); boat.add(pilothouse);
  const wheel = new THREE.Group();
  {
    const wood = mat(0x5a3418, { roughness: 0.5 }), wd = mat(0x6b4020, { roughness: 0.45 });
    const { z0, z1, y0 } = PH, w = 2.2, h = 2.7;
    pilothouse.add(box(w * 2 + 0.2, 0.12, z1 - z0 + 0.2, mat(0xffffff, { map: T.wood({ base: [110, 80, 52], dark: [70, 48, 30], planks: 6, seed: 14 }) }), 0, y0, (z0 + z1) / 2));
    // lower walls and corner posts; big open window frames above
    const lowH = 0.85;
    pilothouse.add(box(w * 2, lowH, 0.08, white, 0, y0 + lowH / 2, z0), box(0.08, lowH, z1 - z0, white, -w, y0 + lowH / 2, (z0 + z1) / 2), box(0.08, lowH, z1 - z0, white, w, y0 + lowH / 2, (z0 + z1) / 2));
    pilothouse.add(box(w * 2, h, 0.08, white, 0, y0 + h / 2, z1));
    [[-w, z0], [w, z0], [-w, z1], [w, z1]].forEach(([x, z]) => pilothouse.add(box(0.12, h, 0.12, white, x, y0 + h / 2, z)));
    [-w, w].forEach(x => pilothouse.add(box(0.08, 0.08, z1 - z0, white, x, y0 + h - 0.15, (z0 + z1) / 2), box(0.08, 0.08, z1 - z0, white, x, y0 + lowH, (z0 + z1) / 2)));
    pilothouse.add(box(w * 2, 0.08, 0.08, white, 0, y0 + h - 0.15, z0), box(w * 2, 0.06, 0.06, white, 0, y0 + lowH, z0));
    // roof with fringe and a little gilded ornament
    pilothouse.add(box(w * 2 + 0.9, 0.16, z1 - z0 + 0.9, white, 0, y0 + h + 0.05, (z0 + z1) / 2));
    const orn = P.lathe([[0.001, 0], [0.35, 0], [0.2, 0.3], [0.25, 0.5], [0.001, 0.9]], P.brass(), 12); orn.position.set(0, y0 + h + 0.12, (z0 + z1) / 2); pilothouse.add(orn);
    for (let i = -10; i <= 10; i++) pilothouse.add(box(0.06, 0.22, 0.04, white, i * 0.24, y0 + h - 0.12, z0 - 0.44));
    // the door in the back wall, with a lantern hung beside it
    pilothouse.add(box(0.9, 2.0, 0.04, wd, 0, y0 + 1.0, z1 + 0.05));
    const dl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 })); dl.position.set(0.8, y0 + 2.0, z1 + 0.25); pilothouse.add(dl);
    const dg = P.glowSprite(1.4, 0xffb060, 0.8); dg.position.copy(dl.position); pilothouse.add(dg);
    const dlL = new THREE.PointLight(0xffb060, 3, 9, 2); dlL.position.set(0.8, y0 + 1.9, z1 + 0.5); pilothouse.add(dlL);
    // rails round the texas roof
    [-3.9, 3.9].forEach(x => pilothouse.add(box(0.06, 0.06, 18, white, x, y0 + 0.85, 1)));
    for (let z = -7.5; z <= 9.5; z += 1.0) [-3.9, 3.9].forEach(x => pilothouse.add(box(0.05, 0.85, 0.05, white, x, y0 + 0.42, z)));
    // lazy bench along the larboard side, the stove, the speaking tube
    pilothouse.add(box(0.6, 0.45, 3.4, wd, -1.8, y0 + 0.22, (z0 + z1) / 2 + 0.2));
    pilothouse.add(box(0.7, 0.06, 3.6, mat(0x6a2a1e, { roughness: 1 }), -1.8, y0 + 0.47, (z0 + z1) / 2 + 0.2));
    const stove = cyl(0.22, 0.25, 0.7, darkM, 12, 1.6, y0 + 0.35, z1 - 0.5); pilothouse.add(stove);
    const tube = new THREE.Group();
    const tp = cyl(0.04, 0.04, 1.3, P.brass(), 10, 0, 0.65, 0); tube.add(tp);
    const mouth = P.lathe([[0.04, 0], [0.09, 0.1], [0.1, 0.12]], P.brass(), 14); mouth.position.y = 1.3; tube.add(mouth);
    tube.position.set(1.55, y0, z0 + 0.5); pilothouse.add(tube);
    hot(tube, { nodes: ['r_pilot'], click: () => { api.A.sfx.creak(); api.ui.say(st.flags.riverDocked ? 'Down the tube: “She’s tied up, cub. Go stretch your legs.”' : 'You blow down the speaking tube. From the engine room, far below: “Ready when you are, cub. Ring when you want her.”'); } });
    // the wheel: half of it through a slot in the floor
    const rimR = 1.25;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.07, 8, 48), wood); wheel.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.09, 8, 24), wood); wheel.add(rim2);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const sp = cyl(0.035, 0.035, rimR * 2 * 0.5, wood, 6); sp.position.set(Math.cos(a) * rimR * 0.5, Math.sin(a) * rimR * 0.5, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
      const hd = cyl(0.04, 0.05, 0.35, wd, 8); hd.position.set(Math.cos(a) * (rimR + 0.17), Math.sin(a) * (rimR + 0.17), 0); hd.rotation.z = a - Math.PI / 2; wheel.add(hd);
    }
    const hub = cyl(0.14, 0.14, 0.3, P.brass(), 14); hub.rotation.x = Math.PI / 2; wheel.add(hub);
    wheel.position.set(0, y0 - 0.3, -6.8);
    pilothouse.add(wheel);
    // the bell rope
    const rope = new THREE.Group();
    rope.add(cyl(0.015, 0.015, 1.1, mat(0xb8a27a), 6, 0, -0.55, 0));
    const grip = cyl(0.03, 0.03, 0.18, mat(0x5a3418), 8, 0, -1.15, 0); rope.add(grip);
    rope.position.set(1.35, y0 + h, -6.2); pilothouse.add(rope);
    const ropeHit = box(0.35, 1.3, 0.35, new THREE.MeshBasicMaterial({ visible: false }), 0, -0.6, 0); rope.add(ropeHit);
    hot(rope, { nodes: ['r_pilot'], click: ringBell });
    // the notebook on the lazy bench
    const nb = new THREE.Group();
    nb.add(box(0.2, 0.025, 0.28, mat(0x2a1a10, { roughness: 0.8 })));
    const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.25), mat(0xffffff, { map: T.paper({ lines: 10, seed: 22 }) })); pg.rotation.x = -Math.PI / 2; pg.position.y = 0.014; nb.add(pg);
    nb.position.set(-1.75, y0 + 0.52, -4.5); nb.rotation.y = 0.3; pilothouse.add(nb);
    const nbHit = box(0.5, 0.3, 0.5, new THREE.MeshBasicMaterial({ visible: false })); nb.add(nbHit);
    hot(nb, { nodes: ['r_pilot'], click: () => api.ui.doc('bixby') });
    hot(wheel, { nodes: ['r_pilot'], when: () => mode !== 'cross', click: () => api.ui.say(st.flags.riverDocked ? 'She’s tied up. The wheel turns idle.' : 'The wheel is taller than you are. She’s lying still in the stream; she won’t answer the helm till the wheels are turning. One tap of the bell to go ahead.') });
    // a dim lantern turned low, so you can see without spoiling your night eyes
    const pl = new THREE.PointLight(0xffb070, 0.35, 5, 2); pl.position.set(1.2, y0 + 2.3, z1 - 0.4); pilothouse.add(pl);
  }

  // ---- forecastle: the leadsman's slate ----
  const slate = new THREE.Group();
  {
    slate.add(box(0.75, 0.55, 0.04, mat(0x5a3a20)));
    const s = P.signPlane(T.sign({ w: 512, h: 384, bg: '#2c3330', color: '#e8ece0', font: '"Gochi Hand", cursive', size: 34, lh: 1.1, lines: ['MARK THREE . . . 18', 'QR LESS THREE . . 16½', 'HALF TWAIN . . . 15', 'QR TWAIN . . . 13½', 'MARK TWAIN . . . 12', 'QR LESS TWAIN . 10½'] }), 0.66, { transparent: false });
    s.position.z = 0.025; slate.add(s);
    slate.add(cyl(0.05, 0.05, 1.6, mat(0x3a2414), 6, 0, -0.9, -0.03));
    slate.position.set(-1.8, 2.75, -30.2); slate.rotation.y = deg(30);
    boat.add(slate);
    hot(slate, { nodes: ['r_bow'], click: () => api.ui.doc('leads') });
  }

  // ---- stereoscope home, on the texas roof ----
  const scope = P.stereoscope();
  scope.position.set(2.4, 10.4 + 1.08, 5.4); scope.rotation.y = deg(-90);
  boat.add(scope);
  const homeTex = P.stereoCardTexture('THE STUDY AT QUARRY FARM');
  const homeCard = P.stereoCard(homeTex);
  homeCard.position.copy(scope.userData.cardSlot).applyMatrix4(new THREE.Matrix4().makeRotationY(deg(-90))).add(scope.position);
  homeCard.rotation.y = deg(-90); boat.add(homeCard);
  const scopeHit = box(0.6, 0.6, 0.8, new THREE.MeshBasicMaterial({ visible: false })); scope.add(scopeHit);
  hot(scope, { nodes: ['r_deck'], click: () => api.travel('study', { node: 's_scope' }) });

  // ---- the page, nailed to a post at the landing ----
  const dockYaw = Math.atan2(-0.97, 0.243);
  const dockDir = V(-Math.sin(dockYaw), 0, -Math.cos(dockYaw));
  const bowPt = V(176, 0, -697);
  const dockPos = bowPt.clone().sub(dockDir.clone().multiplyScalar(BOW));
  const dockRight = V(Math.cos(dockYaw), 0, -Math.sin(dockYaw));
  const postPt = bowPt.clone().add(dockDir.clone().multiplyScalar(7)).add(dockRight.clone().multiplyScalar(2.5));
  const post = cyl(0.18, 0.2, 2.6, mat(0x3a2a1a), 8, postPt.x, 1.2 + 1.3, postPt.z); scene.add(post);
  const pageTex = T.paper({ lines: 11, seed: 61 });
  const page = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), mat(0xffffff, { map: pageTex, emissive: 0xffffff, emissiveMap: pageTex, emissiveIntensity: 0.45 }));
  page.position.copy(postPt).add(dockDir.clone().multiplyScalar(-0.21)); page.position.y = 1.2 + 1.7;
  page.rotation.y = dockYaw; scene.add(page);
  const pageHit = box(1, 1.2, 0.4, new THREE.MeshBasicMaterial({ visible: false })); pageHit.position.copy(page.position); pageHit.rotation.y = dockYaw; scene.add(pageHit);
  hot(pageHit, { nodes: ['r_shore', 'r_bow'], when: () => st.flags.riverDocked && !st.pages.river, click: () => { api.A.sfx.paper(); api.collect('river', 'pageRiver'); } });

  // ---- chimney smoke and sparks ----
  const smoke = [];
  const smokeTex = T.glow('rgba(160,160,170,.55)', 'rgba(120,120,130,.18)');
  for (let i = 0; i < 36; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x6a6a74, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData = { t: Math.random() * 6, x: i % 2 ? 4.6 : -4.6 };
    boat.add(s); smoke.push(s);
  }
  const sparks = [];
  for (let i = 0; i < 14; i++) {
    const s = P.glowSprite(0.5, 0xff9a40, 0.9);
    s.userData = { t: Math.random() * 2, x: i % 2 ? 4.6 : -4.6, vx: 0, vz: 0 };
    boat.add(s); sparks.push(s);
  }

  // ---- crossing state ----
  let mode = 'idle', speed = 0, wheelPos = 0, steer = 0, keySteer = 0, callT = 2, groundT = 0, dockT = 0, lastCall = '';
  const pose = { x: START.x, z: START.z, yaw: START.yaw };
  let dockFrom = null;
  function setPose() {
    boat.position.set(pose.x, 0, pose.z);
    boat.rotation.y = pose.yaw;
  }
  function placeBoat() {
    if (st.flags.riverDocked) { pose.x = dockPos.x; pose.z = dockPos.z; pose.yaw = dockYaw; }
    else { pose.x = START.x; pose.z = START.z; pose.yaw = START.yaw; }
    mode = 'idle'; speed = 0; wheelPos = 0; steer = 0; keySteer = 0;
    setPose();
  }
  placeBoat();

  function ringBell() {
    api.A.sfx.bell(560, 0.22);
    if (st.flags.riverDocked) { api.ui.say('The bell rings out over the woodyard. Nobody answers; she’s tied up.'); return; }
    if (mode === 'idle') {
      mode = 'cross'; callT = 3.5; lastCall = '';
      api.ui.say('One bell. Far below, the engines take hold and the great wheels begin to turn. Hold left or right on the wheel to steer.', 6);
    } else if (mode === 'cross') {
      api.ui.say('Two bells: stop her. She drifts back up to where you began.', 4);
      reset();
    }
  }
  async function reset() {
    mode = 'reset';
    api.setBusy(true);
    document.querySelector('#fade').classList.add('on');
    await api.wait(900);
    placeBoat();
    api.view.yaw = 0;
    await api.wait(400);
    document.querySelector('#fade').classList.remove('on');
    api.setBusy(false);
  }

  function update(dt, t) {
    wn.offset.x += dt * 0.004; wn.offset.y -= dt * 0.012;
    // reflections point at the camera
    const cam = api.camera.getWorldPosition(V(0, 0, 0));
    const pointAt = (m, src) => { m.position.set(src.x, 0.05, src.z); m.rotation.y = Math.atan2(cam.x - src.x, cam.z - src.z); };
    pointAt(lampStreak, LAMP);
    const mp = cam.clone().add(V(moonDir.x, 0, moonDir.z).normalize().multiplyScalar(1100));
    pointAt(moonStreak, mp);
    lampGlow.material.opacity = 0.85 + Math.sin(t * 7) * 0.05 + Math.sin(t * 13) * 0.04;

    // smoke from the chimneys drifts aft
    for (const s of smoke) {
      const u = s.userData; u.t += dt * (0.5 + speed * 0.05);
      const k = (u.t % 6) / 6;
      s.position.set(u.x + Math.sin(u.t * 0.7) * 0.6, 28 + k * 18, -14 + k * (12 + speed * 3));
      s.scale.setScalar(2.5 + k * 9);
      s.material.opacity = 0.25 * Math.sin(k * Math.PI);
    }
    for (const s of sparks) {
      const u = s.userData; u.t += dt;
      const k = (u.t % 2.2) / 2.2;
      if (k < dt / 2.2) { u.vx = (Math.random() - 0.5) * 2; u.vz = Math.random() * 2; }
      s.position.set(u.x + u.vx * k * 2, 28 + k * 9, -14 + k * (3 + speed) + u.vz * k);
      s.material.opacity = (1 - k) * (0.5 + Math.random() * 0.5);
    }

    if (mode === 'cross') {
      speed = Math.min(SPEED, speed + dt * 1.4);
      const input = steer || keySteer;
      if (input) wheelPos = Math.max(-1, Math.min(1, wheelPos + input * dt * 1.3));
      else wheelPos += (0 - wheelPos) * Math.min(1, dt * 1.2);
      pose.yaw += wheelPos * 0.16 * (speed / SPEED) * dt;
      const f = V(-Math.sin(pose.yaw), 0, -Math.cos(pose.yaw));
      pose.x += f.x * speed * dt; pose.z += f.z * speed * dt;
      // the set of the current on the crossing pushes her down toward the bar
      if (pose.z < -240 && pose.z > -680) { pose.x += -0.811 * 1.0 * dt; pose.z += -0.585 * 1.0 * dt; }
      boat.rotation.z = -wheelPos * 0.015 * (speed / SPEED);
      setPose();
      api.A.riverEngine(speed / SPEED);
      const bx = pose.x + f.x * 25, bz = pose.z + f.z * 25;
      const depth = Math.min(depthAt(pose.x, pose.z), depthAt(bx, bz));
      callT -= dt;
      if (callT <= 0) {
        const c = call(depth);
        api.ui.say(`<span style="font-style:normal">The leadsman, from the forecastle: </span>“${c}”`, 2.6);
        api.A.speak(c.replace(/M-a-r-k/, 'Maaark').replace('!', ''), { rate: 0.7, pitch: 0.55 });
        lastCall = c;
        callT = depth < 2.3 ? 2.4 : 3.4;
      }
      if (depth < 1.6) aground();
      // near the landing: the mate takes over and puts her nose on the bank
      const bow = V(pose.x + f.x * BOW, 0, pose.z + f.z * BOW);
      if (bow.distanceTo(V(bowPt.x, 0, bowPt.z)) < 70) startDock();
    } else if (mode === 'aground') {
      groundT += dt;
      speed = Math.max(0, speed - dt * 6);
      api.A.riverEngine(0);
      if (groundT > 3.2) { mode = 'resetting'; reset(); }
    } else if (mode === 'dock') {
      dockT += dt / 8;
      const k = dockT < 1 ? 1 - Math.pow(1 - dockT, 3) : 1;
      pose.x = dockFrom.x + (dockPos.x - dockFrom.x) * k;
      pose.z = dockFrom.z + (dockPos.z - dockFrom.z) * k;
      pose.yaw = dockFrom.yaw + (dockYaw - dockFrom.yaw) * k;
      boat.rotation.z *= 0.95;
      setPose();
      api.A.riverEngine(Math.max(0, 1 - dockT * 1.4));
      if (dockT >= 1) {
        mode = 'idle'; st.flags.riverDocked = true; api.save();
        api.A.riverEngine(0);
        api.ui.say('From below, the mate: “Line’s fast!” Something white is nailed to a post on the bank, under the lamp.', 7);
      }
    }
    // the wheel turns with the helm
    wheel.rotation.z = wheelPos * 2.4;
  }

  function aground() {
    mode = 'aground'; groundT = 0;
    api.A.sfx.thud(); api.shake = 1.2;
    api.A.speak('Quarter less twain... she\'s on the bar!', { rate: 0.85, pitch: 0.55 });
    api.ui.say('A long, grinding shudder runs through her. She’s hard aground on the bar.', 4);
  }
  function startDock() {
    mode = 'dock'; dockT = 0;
    dockFrom = { x: pose.x, z: pose.z, yaw: pose.yaw };
    let dy = dockYaw - pose.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    dockFrom.yaw = dockYaw - dy;
    steer = keySteer = 0;
    api.A.sfx.whistle(2.8);
    api.ui.say('You put her nose toward the light. Three long blasts on the whistle, and the mate comes forward with the line.', 6);
  }

  const nodes = {
    r_deck: {
      pos: [0, 12.0, 5.4], yaw: 0, amb: 'river', pitch: 4,
      links: [
        { yaw: 0, to: 'r_pilot' },
        { yaw: 90, to: 'r_bow', fade: true, arrive: 0, say: 'Down the companionway, along the boiler deck, down again to the forecastle.' },
      ],
    },
    r_pilot: {
      pos: [0, 12.1, -4.6], yaw: 0, amb: 'river', pitch: -3,
      pitches: { 90: -20, 270: -10 },
      links: [{ yaw: 180, to: 'r_deck', when: () => mode !== 'cross' && mode !== 'dock', msg: 'Not while she’s under way. A pilot doesn’t leave the wheel.' }],
    },
    r_bow: {
      pos: [0, 3.0, -27.5], yaw: 0, amb: 'river', pitch: -2,
      links: [
        { yaw: 0, to: 'r_shore', when: () => st.flags.riverDocked, msg: 'Nothing ahead but the river and the jackstaff.' },
        { yaw: 180, to: 'r_deck', fade: true, arrive: 0 },
      ],
    },
    r_shore: {
      pos: [1.3, 2.85, -39.6], yaw: 0, amb: 'river', pitch: -6,
      links: [{ yaw: 180, to: 'r_bow', arrive: 0 }],
    },
  };

  return {
    scene, nodes, hots, start: 'r_deck', amb: 'river', anchor: boat, exposure: 1.5,
    snapNode: 'r_pilot', snapYaw: 0, snapPitch: -2,
    update,
    onEnterWorld() { placeBoat(); },
    onSnapshots(worlds) { homeTex.userData.paint(worlds.study.snapCanvas); },
    onLeaveWorld() { api.A.riverEngine(0); mode = 'idle'; },
    pointerAction(mx, my) {
      if (mode !== 'cross' || api.node !== 'r_pilot' || my < 0.35 || mx < 0.14 || mx > 0.86) return null;
      return { cursor: mx < 0.5 ? 'left' : 'right' };
    },
    pointer(type, mx, my) {
      if (mode !== 'cross' || api.node !== 'r_pilot') { steer = 0; return false; }
      if (type === 'down' && my >= 0.35 && mx >= 0.14 && mx <= 0.86) { steer = mx < 0.5 ? 1 : -1; return true; }
      if (type === 'up') steer = 0;
      return false;
    },
    key(e, down) {
      if (mode !== 'cross') return false;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') { keySteer = down ? 1 : (keySteer === 1 ? 0 : keySteer); return true; }
      if (k === 'd' || k === 'arrowright') { keySteer = down ? -1 : (keySteer === -1 ? 0 : keySteer); return true; }
      return false;
    },
    debug: { depthAt, get mode() { return mode; }, get pose() { return pose; }, set steer(v) { keySteer = v; }, ringBell, cotton: COTTON },
  };
}
