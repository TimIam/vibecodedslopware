// McDougal's Cave: a maze of passages lit by the candle you carry. The flame shows where the air comes from.
import * as THREE from 'three';
import * as T from './tex.js';
import * as P from './props.js';

const { V, box, cyl, mat, dirYaw, deg } = P;

// Floor points of each chamber. j* are forks, d* dead ends, T the treasure room, X the crack, B the far hole.
const N = {
  M: [0, 0, 0], j1: [0, 0, -16], j2: [16, -0.5, -16], j3: [16, -1, -34], j4: [0, -1.5, -38],
  T: [-16, -2.5, -40], X: [-18, -2.2, -53], B: [-18, -2.3, -61], E: [0, 0.4, 10],
  d1: [-13, 0.2, -18], d2: [-4, 0.3, -27], d3: [29, -0.5, -15], d4: [17, 0, -4],
  d5: [17, -1, -47], d6: [29, -1, -35], d7: [-1, -1.5, -50],
};
const EDGES = [['M', 'E'], ['M', 'j1'], ['j1', 'd1'], ['j1', 'd2'], ['j1', 'j2'], ['j2', 'd3'], ['j2', 'd4'], ['j2', 'j3'],
  ['j3', 'd5'], ['j3', 'd6'], ['j3', 'j4'], ['j4', 'd7'], ['j4', 'T'], ['T', 'X'], ['X', 'B']];
// The way the air comes in from the far hole, at each place the candle should tell you something.
const SOURCE = { M: 'j1', j1: 'j2', j2: 'j3', j3: 'j4', j4: 'T', T: 'X', X: 'B' };
const CLIFF_Z = -58;
const INSCRIBE = {
  M: ['TOM SAWYER', 'HUCK FINN 1845'],
  d1: ["ALADDIN'S", 'PALACE'], d2: ['THE DRAWING', 'ROOM'], d3: ['JOE HARPER', 'WAS HERE'], d4: ['THE', 'CATHEDRAL'],
  d5: ['SID SAWYER', 'IS A TATTLE'], d6: ['BEN ROGERS', '1844'], d7: ['BECKY', 'THATCHER'],
};

const chambers = Object.entries(N).filter(([k]) => k !== 'E' && k !== 'B').map(([k, [x, y, z]]) => {
  const big = k === 'T', dead = k[0] === 'd', mouth = k === 'M';
  const rx = big ? 6.5 : dead ? 2.7 : mouth ? 4.2 : 3.8, ry = big ? 3.8 : dead ? 2.3 : 2.6;
  return { k, x, y, z, rx, ry, rz: rx, cy: y + 1.4, floor: y };
});
const tubes = EDGES.map(([a, b]) => {
  const [ax, ay, az] = N[a], [bx, by, bz] = N[b];
  return { ax, ay: ay + 1.35, az, bx, by: by + 1.35, bz, fa: ay, fb: by, r: a === 'X' || b === 'X' ? 1.25 : 1.6 };
});

function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// Signed distance: negative in air.
function sdf(x, y, z) {
  let d = 1e9, floor = 0, best = 1e9;
  for (const c of chambers) {
    const dx = (x - c.x) / c.rx, dy = (y - c.cy) / c.ry, dz = (z - c.z) / c.rz;
    const di = (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * Math.min(c.rx, c.ry);
    if (di < best) { best = di; floor = c.floor; }
    d = smin(d, di, 2.0);
  }
  for (const t of tubes) {
    const abx = t.bx - t.ax, aby = t.by - t.ay, abz = t.bz - t.az;
    const l2 = abx * abx + aby * aby + abz * abz;
    const s = Math.max(0, Math.min(1, ((x - t.ax) * abx + (y - t.ay) * aby + (z - t.az) * abz) / l2));
    const px = x - (t.ax + abx * s), py = (y - (t.ay + aby * s)) / 1.12, pz = z - (t.az + abz * s);
    const di = Math.sqrt(px * px + py * py + pz * pz) - t.r;
    if (di < best) { best = di; floor = t.fa + (t.fb - t.fa) * s; }
    d = smin(d, di, 1.6);
  }
  if (Math.abs(d) < 3.5) d += (T.fbm3(x * 0.26, y * 0.3, z * 0.26, 3) - 0.5) * 2.4 + (T.noise3(x * 1.3, y * 1.6, z * 1.3) - 0.5) * 0.7;
  // flat-ish floor
  d = Math.max(d, floor - y + (T.noise3(x * 0.7, 3.3, z * 0.7) - 0.5) * 0.25);
  // the open air beyond the bluff
  const cliff = z - (CLIFF_Z + (T.fbm3(x * 0.15, y * 0.15, 9, 3) - 0.5) * 3);
  return Math.min(d, cliff);
}

// Naive surface nets over a regular grid.
function surfaceNets(f, min, max, cell) {
  const n = [0, 1, 2].map(a => Math.ceil((max[a] - min[a]) / cell) + 1);
  const [nx, ny, nz] = n;
  const F = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    F[i + nx * (j + ny * k)] = f(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
  }
  const cx = nx - 1, cy = ny - 1;
  const vi = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { const [a, b, d] = corner[c]; v[c] = F[(i + a) + nx * ((j + b) + ny * (k + d))]; if (v[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [e0, e1] of edges) {
      const a = v[e0], b = v[e1];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b), p0 = corner[e0], p1 = corner[e1];
      sx += p0[0] + (p1[0] - p0[0]) * t; sy += p0[1] + (p1[1] - p0[1]) * t; sz += p0[2] + (p1[2] - p0[2]) * t; cnt++;
    }
    vi[i + cx * (j + cy * k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / cnt) * cell, min[1] + (j + sy / cnt) * cell, min[2] + (k + sz / cnt) * cell);
  }
  const idx = [];
  const fs = [1, nx, nx * ny], cs = [1, cx, cx * cy], cn = [cx, cy, nz - 1];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, w = (d + 2) % 3;
    const p = [0, 0, 0];
    for (p[2] = 0; p[2] < nz; p[2]++) for (p[1] = 0; p[1] < ny; p[1]++) for (p[0] = 0; p[0] < nx; p[0]++) {
      if (p[d] >= cn[d] || p[u] < 1 || p[w] < 1 || p[u] >= cn[u] || p[w] >= cn[w]) continue;
      const fi = p[0] + p[1] * fs[1] + p[2] * fs[2];
      const a = F[fi], b = F[fi + fs[d]];
      if ((a < 0) === (b < 0)) continue;
      const ci = p[0] + p[1] * cs[1] + p[2] * cs[2];
      const c0 = vi[ci], c1 = vi[ci - cs[u]], c2 = vi[ci - cs[u] - cs[w]], c3 = vi[ci - cs[w]];
      if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
      if (a < 0) idx.push(c0, c1, c2, c0, c2, c3); else idx.push(c0, c2, c1, c0, c3, c2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCave(api) {
  const scene = new THREE.Scene();
  const caveFog = new THREE.FogExp2(0x000000, 0.075);
  const dayFog = new THREE.FogExp2(0xc9d8e6, 0.0009);
  scene.fog = caveFog;
  scene.background = new THREE.Color(0x000000);
  const hots = [];
  const hot = (o, cfg) => api.hot(o, cfg, hots);
  const st = api.state;

  // ---- the rock ----
  const geo = surfaceNets(sdf, [-27, -6, -63], [37, 6.5, 9.2], 0.45);
  {
    const p = geo.attributes.position, nr = geo.attributes.normal, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nr.getY(i);
      const n = T.fbm3(x * 0.4, y * 0.4, z * 0.4, 3), band = 0.5 + 0.5 * Math.sin(y * 7 + n * 6);
      let r = 0.5 + n * 0.25, g = 0.45 + n * 0.22, b = 0.38 + n * 0.18;
      r += band * 0.06; g += band * 0.03;
      if (T.noise3(x * 0.3, y * 2.5, z * 0.3) > 0.68) { r += 0.12; g += 0.06; } // flowstone
      if (ny > 0.55) { const k = Math.min(1, (ny - 0.55) * 3); r = r * (1 - k) + 0.32 * k; g = g * (1 - k) + 0.26 * k; b = b * (1 - k) + 0.2 * k; }
      if (z < CLIFF_Z + 1.5) { r *= 1.1; g *= 1.08; b *= 1.02; }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const rockM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide, flatShading: true });
  const rock = new THREE.Mesh(geo, rockM);
  scene.add(rock);

  // stalactites and stalagmites in the chambers
  {
    const r = T.rng(12), down = [], up = [];
    for (const c of chambers) {
      const count = c.k === 'T' ? 40 : c.k[0] === 'd' ? 6 : 12;
      for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * c.rx * 0.8;
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        let y = c.floor + 1.6;
        if (sdf(x, y, z) > 0) continue;
        while (y < c.floor + 8 && sdf(x, y, z) < 0) y += 0.1;
        const len = 0.25 + Math.pow(r(), 2) * 1.4, w = 0.04 + len * 0.06;
        if (y - len > c.floor + 2.1) down.push(P.tm(x, y - len / 2 + 0.15, z, w, len + 0.3, w, 0, Math.PI));
        if (r() < 0.45) {
          let fy = c.floor + 1.0; while (fy > c.floor - 2 && sdf(x, fy, z) < 0) fy -= 0.08;
          const h = 0.2 + r() * (c.k === 'T' ? 1.0 : 0.7);
          if (Math.hypot(x - c.x, z - c.z) > (c.k === 'T' ? 4.8 : 2.4) && c.k !== 'M') up.push(P.tm(x + 0.3, fy + h / 2, z + 0.2, w * 1.6, h, w * 1.6));
        }
      }
    }
    const cone = new THREE.ConeGeometry(1, 1, 7);
    const sm = mat(0x9a8a72, { roughness: 0.55 });
    scene.add(P.instanced(cone, sm, down), P.instanced(cone, sm, up));
  }

  // ---- smoke writing on the walls ----
  function wallHit(from, dir, max = 12) {
    const p = from.clone();
    for (let s = 0; s < max; s += 0.08) { p.copy(from).addScaledVector(dir, s); if (sdf(p.x, p.y, p.z) > 0) return p; }
    return null;
  }
  function inscribe(node, yawDir, lines, { y = 1.9, size = 1.6, rot = -0.06 } = {}) {
    const [nx, ny, nz] = N[node];
    const from = V(nx, ny + y, nz), dir = dirYaw(yawDir);
    const hit = wallHit(from, dir);
    if (!hit) return;
    const tex = T.sign({ w: 512, h: 256, color: 'rgba(14,10,6,.86)', font: '"Gochi Hand", cursive', size: 70, lh: 1.05, lines, blur: 1.2, rotate: rot });
    const pl = P.signPlane(tex, size);
    pl.position.copy(hit).addScaledVector(dir, -0.25);
    pl.lookAt(from);
    pl.material.depthWrite = false; pl.material.polygonOffset = true; pl.material.polygonOffsetFactor = -4;
    scene.add(pl);
  }

  // ---- nodes ----
  const yawTo = (a, b) => {
    const [ax, , az] = N[a], [bx, , bz] = N[b];
    const y = THREE.MathUtils.radToDeg(Math.atan2(-(bx - ax), -(bz - az)));
    return ((Math.round(y / 90) * 90) % 360 + 360) % 360;
  };
  const nodes = {};
  const id = k => (k === 'B' ? 'c_bluff' : 'c_' + k);
  for (const [k, [x, y, z]] of Object.entries(N)) {
    if (k === 'E') continue;
    nodes[id(k)] = { pos: [x, y + 1.6, z], yaw: 0, amb: k === 'B' ? 'bluff' : 'cave', links: [] };
  }
  nodes.c_M.pos = [0, 1.6, 1.6];
  nodes.c_bluff.pos = [-18, -2.3 + 1.6, CLIFF_Z + 0.9];
  for (const [a, b] of EDGES) {
    if (a === 'E' || b === 'E') continue;
    nodes[id(a)].links.push({ yaw: yawTo(a, b), to: id(b) });
    nodes[id(b)].links.push({ yaw: yawTo(b, a), to: id(a) });
  }
  // dead ends face their wall on arrival; write names there
  for (const [a, b] of EDGES) if (b[0] === 'd') { nodes[id(b)].yaw = yawTo(a, b); inscribe(b, yawTo(a, b), INSCRIBE[b]); }
  inscribe('M', 90, INSCRIBE.M, { size: 1.8 });
  nodes.c_M.links.push({ yaw: 180, to: 'c_M', when: () => false, msg: 'Daylight, and the river under the bluff. You came for the page.' });
  nodes.c_bluff.yaw = 0; nodes.c_bluff.pitch = -8;
  nodes.c_T.pitches = { 90: -16 };

  // ---- the mouth: daylight in the opening and a stereoscope just inside ----
  const dayTex = T.canvas(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#f4f8ff'); gr.addColorStop(0.55, '#d8e6ef'); gr.addColorStop(0.62, '#8aa070'); gr.addColorStop(1, '#4a6038');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { wrap: false });
  const day = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), new THREE.MeshBasicMaterial({ map: dayTex, fog: false }));
  day.position.set(0, 2, 8.9); day.rotation.y = Math.PI; scene.add(day);
  const spill = new THREE.PointLight(0xc8d8ff, 9, 22, 1.6); spill.position.set(0, 2.4, 6); scene.add(spill);

  const scope = P.stereoscope();
  scope.position.set(2.0, 1.08 + 0.02, 1.8); scope.rotation.y = deg(-90);
  scene.add(scope);
  const homeTex = P.stereoCardTexture('THE STUDY AT QUARRY FARM');
  const homeCard = P.stereoCard(homeTex);
  homeCard.position.copy(scope.userData.cardSlot).applyAxisAngle(V(0, 1, 0), deg(-90)).add(scope.position); homeCard.rotation.y = deg(-90); scene.add(homeCard);
  scope.add(box(0.6, 0.6, 0.8, new THREE.MeshBasicMaterial({ visible: false })));
  hot(scope, { nodes: ['c_M'], click: () => api.travel('study', { node: 's_scope' }) });

  // Tom's note, tucked in a crack by the entrance
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), mat(0xffffff, { map: T.paper({ w: 256, h: 190, lines: 6, seed: 70, tint: '#cdb98d' }), roughness: 1, emissive: 0x221a10 }));
  {
    const hit = wallHit(V(0, 1.4, 1.6), dirYaw(35)) || V(-1.5, 1.4, 0);
    note.position.copy(hit).addScaledVector(dirYaw(35), -0.12); note.lookAt(0, 1.6, 1.6); note.rotateZ(0.2);
    scene.add(note);
    const nh = box(0.5, 0.4, 0.2, new THREE.MeshBasicMaterial({ visible: false })); note.add(nh);
  }
  hot(note, { nodes: ['c_M'], click: () => api.ui.doc('tom') });

  // ---- the treasure room: a rock with a cross smoked on it ----
  const [tx, ty, tz] = N.T;
  const boulderPos = V(tx - 3.8, ty, tz - 0.4);
  const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 3), mat(0x8a7a64, { roughness: 0.9 }));
  {
    const p = boulder.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = V(p.getX(i), p.getY(i), p.getZ(i)); v.multiplyScalar(0.85 + T.noise3(v.x * 1.4, v.y * 1.4, v.z * 1.4) * 0.35); p.setXYZ(i, v.x, v.y, v.z); }
    boulder.geometry.computeVertexNormals();
    boulder.scale.set(1.1, 0.8, 1.0);
    boulder.position.copy(boulderPos).add(V(0, 0.75, 0));
    scene.add(boulder);
    const cross = P.signPlane(T.canvas(256, 256, (g) => {
      g.strokeStyle = 'rgba(12,9,6,.88)'; g.lineCap = 'round'; g.filter = 'blur(3px)';
      g.lineWidth = 26; g.beginPath(); g.moveTo(128, 30); g.lineTo(124, 228); g.moveTo(52, 92); g.lineTo(204, 88); g.stroke();
      g.lineWidth = 46; g.globalAlpha = 0.25; g.stroke();
    }, { wrap: false }), 0.8);
    boulder.updateMatrixWorld();
    const rc = new THREE.Raycaster(boulder.position.clone().add(V(4, 0.35, 0.05)), V(-1, 0, 0));
    const bh = rc.intersectObject(boulder)[0];
    cross.position.copy(bh ? bh.point : boulder.position.clone().add(V(1.3, 0.35, 0))).add(V(0.06, 0, 0)); cross.rotation.y = Math.PI / 2;
    cross.material.depthWrite = false; cross.material.polygonOffset = true; cross.material.polygonOffsetFactor = -4;
    scene.add(cross);
  }
  // the box, buried in front of the rock until you dig
  const chest = new THREE.Group();
  const iron = P.iron(), oak = mat(0x4a3018, { roughness: 0.8 });
  chest.add(box(0.6, 0.32, 0.4, oak, 0, 0.16, 0));
  [-0.22, 0.22].forEach(x => chest.add(box(0.05, 0.34, 0.42, iron, x, 0.16, 0)));
  const lid = new THREE.Group();
  lid.add(box(0.6, 0.1, 0.4, oak, 0, 0.05, 0.2), box(0.05, 0.11, 0.42, iron, -0.22, 0.05, 0.2), box(0.05, 0.11, 0.42, iron, 0.22, 0.05, 0.2));
  lid.position.set(0, 0.32, -0.2); chest.add(lid);
  const gold = new THREE.Group();
  for (let i = 0; i < 40; i++) { const c = cyl(0.025, 0.025, 0.006, P.mat(0xd8b040, { metalness: 1, roughness: 0.3 }), 10, (Math.random() - 0.5) * 0.48, 0.26 + Math.random() * 0.04, (Math.random() - 0.5) * 0.3); c.rotation.set(Math.random(), Math.random(), Math.random()); gold.add(c); }
  chest.add(gold);
  const chestPage = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), mat(0xffffff, { map: T.paper({ seed: 81, lines: 12 }), emissive: 0x332a1a }));
  chestPage.rotation.x = -Math.PI / 2; chestPage.rotation.z = 0.2; chestPage.position.set(0.05, 0.31, 0); chest.add(chestPage);
  chest.position.copy(boulderPos).add(V(1.65, 0, 0.1)); chest.rotation.y = Math.PI / 2;
  scene.add(chest);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), mat(0x1a120b, { roughness: 1 }));
  hole.rotation.x = -Math.PI / 2; hole.position.copy(chest.position).add(V(0, 0.02, 0)); scene.add(hole);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3a2a1a, { roughness: 1 }));
  mound.scale.set(1.2, 0.45, 0.9); mound.position.copy(chest.position).add(V(0.4, 0, 0.9)); scene.add(mound);
  function placeChest() {
    const dug = !!st.flags.caveDug;
    hole.visible = mound.visible = dug;
    chest.position.y = boulderPos.y + (dug ? -0.12 : -0.9);
    chest.visible = dug;
    lid.rotation.x = st.flags.caveOpen ? -1.9 : 0;
    gold.visible = !!st.flags.caveOpen;
    chestPage.visible = !!st.flags.caveOpen && !st.pages.cave;
  }
  placeChest();
  const boulderHit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  boulderHit.position.copy(boulder.position).add(V(0.6, -0.3, 0)); scene.add(boulderHit);
  hot(boulderHit, {
    nodes: ['c_T'], when: () => !st.flags.caveDug, click: async () => {
      api.setBusy(true);
      api.ui.say('“Under the cross.” You scrape at the floor in front of the rock with your hands, then with a flat stone…', 5);
      for (let i = 0; i < 6; i++) { api.A.sfx.dig(); api.shake = 0.25; await api.wait(420); }
      st.flags.caveDug = true; api.save(); placeChest();
      api.A.sfx.chest();
      api.ui.say('Something hard and square. An iron-bound box, not very big.', 4);
      api.setBusy(false);
    },
  });
  hot(chest, {
    nodes: ['c_T'], when: () => st.flags.caveDug && (!st.flags.caveOpen || !st.pages.cave), click: async () => {
      if (!st.flags.caveOpen) {
        st.flags.caveOpen = true; api.save(); placeChest();
        api.A.sfx.chest(); api.A.sfx.coins();
        api.ui.say('Gold coin, more than a boy could count in an afternoon. And lying on top of it, a folded page.', 5);
        return;
      }
      api.A.sfx.paper();
      await api.collect('cave', 'pageCave');
      placeChest();
    },
  });

  // ---- the far hole: daylight, the river below, a stereoscope home ----
  const outside = new THREE.Group(); scene.add(outside);
  const skyDay = P.sky({ top: 0x3a70b8, horizon: 0xb8cad8, bottom: 0x5a6a58, glowDir: dirYaw(-30, 32), glowColor: 0xffe8c0, glowSize: 0.06 });
  scene.add(skyDay);
  {
    const river = new THREE.Mesh(new THREE.PlaneGeometry(6000, 900), mat(0x4f6f7c, { roughness: 0.3, metalness: 0.2 }));
    river.rotation.x = -Math.PI / 2; river.position.set(0, -62, -420); outside.add(river);
    const farShore = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000), mat(0x6a7a4a, { roughness: 1 }));
    farShore.rotation.x = -Math.PI / 2; farShore.position.set(0, -61, -2370); outside.add(farShore);
    const r = T.rng(5), trees = [];
    for (let i = 0; i < 700; i++) {
      const x = (r() - 0.5) * 3000, z = -880 - r() * 600, h = 10 + r() * 14;
      trees.push(P.tm(x, -61 + h * 0.6, z, h * 0.35, h * 0.55, h * 0.35, r() * 6));
    }
    outside.add(P.instanced(new THREE.IcosahedronGeometry(1, 1), mat(0x3e5a2c, { roughness: 1, flatShading: true }), trees));
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(600, 60), mat(0x8a7c66, { roughness: 1 }));
    skirt.position.set(0, -35, CLIFF_Z + 1.2); outside.add(skirt);
    // a steamboat far off on the river, for company
    const sb = new THREE.Group();
    sb.add(box(14, 1.2, 3, mat(0xeeeeee), 0, 0.6, 0), box(10, 1.4, 2.4, mat(0xeeeeee), 0, 1.8, 0), cyl(0.25, 0.25, 5, mat(0x111111), 8, -2, 4, 0), cyl(0.25, 0.25, 5, mat(0x111111), 8, -2, 4, 0.9));
    sb.position.set(-260, -62, -420); sb.rotation.y = 0.1; outside.add(sb);
    outside.userData.sb = sb;
  }
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.copy(dirYaw(-20, 35).multiplyScalar(100));
  const skyFill = new THREE.HemisphereLight(0xbdd4f0, 0x5a4a38, 0.9);
  scene.add(sun, skyFill);
  const scope2 = P.stereoscope();
  scope2.position.set(-16.1, -2.2 + 1.08 + 0.05, -53.4); scope2.rotation.y = deg(-90);
  scene.add(scope2);
  const homeCard2 = P.stereoCard(homeTex);
  homeCard2.position.copy(scope2.userData.cardSlot).applyAxisAngle(V(0, 1, 0), deg(-90)).add(scope2.position); homeCard2.rotation.y = deg(-90); scene.add(homeCard2);
  scope2.add(box(0.6, 0.6, 0.8, new THREE.MeshBasicMaterial({ visible: false })));
  hot(scope2, { nodes: ['c_X'], click: () => api.travel('study', { node: 's_scope' }) });

  let daylight = false;
  function setDay(on) {
    daylight = on;
    scene.fog = on ? dayFog : caveFog;
    outside.visible = true; skyDay.visible = true;
    sun.visible = skyFill.visible = on;
    candle.visible = !on; candleL.visible = !on;
  }
  nodes.c_bluff.onEnter = () => { setDay(true); api.ui.say(st.pages.cave ? 'The far hole, five miles down the river. Sunlight, and the Mississippi going about its business.' : 'Daylight! The far hole, high on a bluff over the river. You pinch out the candle.', 6); };
  nodes.c_bluff.onLeave = () => setDay(false);
  nodes.c_X.onEnter = () => { if (!st.flags.caveX) { st.flags.caveX = true; api.save(); api.ui.say('A crack in the rock, and grey daylight at the end of it. Someone has set a stereoscope on a ledge here, as if they expected you.', 6); } };

  // ---- the candle you carry ----
  const candle = new THREE.Group();
  {
    const tin = mat(0x777068, { metalness: 0.8, roughness: 0.4 });
    candle.add(cyl(0.045, 0.05, 0.008, tin, 18, 0, -0.05, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12), tin); ring.position.set(0.05, -0.045, 0); ring.rotation.y = Math.PI / 2; candle.add(ring);
    candle.add(cyl(0.011, 0.012, 0.09, mat(0xe8dcc0, { roughness: 0.6, emissive: 0x3a2a10 }), 12, 0, 0, 0));
    candle.add(cyl(0.0015, 0.0015, 0.008, mat(0x111111), 4, 0, 0.049, 0));
  }
  const flameGeo = new THREE.PlaneGeometry(0.026, 0.06); flameGeo.translate(0, 0.03, 0);
  const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ map: T.flame(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  flame.position.set(0, 0.05, 0); candle.add(flame);
  const halo = P.glowSprite(0.16, 0xffb060, 0.55); halo.position.set(0, 0.075, 0); candle.add(halo);
  candle.position.set(0.21, -0.25, -0.48);
  const candleL = new THREE.PointLight(0xffa860, 4.5, 13, 2);
  candleL.position.set(0.18, -0.05, -0.4);
  const fl = { lean: 0, gut: 0, tall: 0 };

  function update(dt, t) {
    // where is the air coming from, relative to the way we face?
    const nid = api.node, key = nid === 'c_bluff' ? 'B' : nid.slice(2);
    let tl = 0, tg = 0, tt = 0;
    if (SOURCE[key] && !api.busy) {
      const [ax, , az] = N[key], [bx, , bz] = N[SOURCE[key]];
      const src = V(bx - ax, 0, bz - az).normalize();
      const flow = src.clone().negate();
      const yaw = deg(api.view.yaw);
      const f = V(-Math.sin(yaw), 0, -Math.cos(yaw)), r = V(Math.cos(yaw), 0, -Math.sin(yaw));
      tl = flow.dot(r); const fw = flow.dot(f);
      tg = Math.max(0, -fw); tt = Math.max(0, fw);
    }
    const k = Math.min(1, dt * 3);
    fl.lean += (tl - fl.lean) * k; fl.gut += (tg - fl.gut) * k; fl.tall += (tt - fl.tall) * k;
    const jitter = Math.sin(t * 31) * 0.5 + Math.sin(t * 47 + 1) * 0.5;
    const g = fl.gut * fl.gut;
    flame.rotation.z = -fl.lean * 0.9 + jitter * (0.05 + g * 0.35) + Math.sin(t * 2.3) * 0.03;
    const sput = g * (0.5 + 0.5 * Math.sin(t * 19) * Math.sin(t * 7.3));
    flame.scale.set(1 + g * 1.1 + jitter * g * 0.35, 1 + fl.tall * 0.5 - g * 0.6 - sput * 0.15 + Math.sin(t * 13) * 0.04, 1);
    candleL.intensity = 4.5 * (1 - g * 0.4 - sput * 0.25 + jitter * (0.04 + g * 0.3));
    halo.material.opacity = 0.5 - g * 0.2 + jitter * g * 0.1;
    if (daylight && outside.userData.sb) outside.userData.sb.position.x += dt * 1.2;
  }

  setDay(false);

  return {
    scene, nodes, hots, start: 'c_M', amb: 'cave', fov: 62,
    snapNode: 'c_M', snapYaw: 0, snapPitch: 0,
    update,
    onEnterWorld() {
      api.camera.add(candle); api.camera.add(candleL);
      setDay(api.node === 'c_bluff');
      placeChest();
    },
    onLeaveWorld() { api.camera.remove(candle); api.camera.remove(candleL); },
    beforeSnap() { api.camera.add(candleL); setDay(false); },
    afterSnap() { api.camera.remove(candleL); },
    onSnapshots(worlds) { homeTex.userData.paint(worlds.study.snapCanvas); },
    debug: { sdf, N, fl },
  };
}
