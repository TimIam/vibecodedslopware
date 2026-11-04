// The hub: the eight-sided study on the hill at Quarry Farm, at night, with the comet up.
import * as THREE from 'three';
import * as T from './tex.js';
import * as P from './props.js';
import { LAST_LINE } from './text.js';

const { V, box, cyl, mat, dirYaw, deg } = P;

export function buildStudy(api) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0e18, 0.0035);
  const hots = [];
  const hot = (o, cfg) => api.hot(o, cfg, hots);
  const st = api.state;

  // ---- sky and the valley ----
  const cometDir = dirYaw(166, 13);
  scene.add(P.sky({ top: 0x03060f, horizon: 0x16203a, bottom: 0x05060a, glowDir: cometDir, glowColor: 0x1d2a48, glowSize: 0.35 }));
  scene.add(P.stars({ count: 2600, seed: 4 }));
  const comet = P.comet(420);
  const nucleus = P.glowSprite(60, 0xdfe8ff, 0.9, 'cool'); nucleus.position.copy(cometDir.clone().multiplyScalar(1190)); scene.add(nucleus);
  comet.position.copy(cometDir.clone().multiplyScalar(1200));
  comet.lookAt(0, 0, 0); comet.rotateZ(deg(28));
  scene.add(comet);
  const moon = P.glowSprite(90, 0xcfd8ff, 0.35, 'moon');
  moon.position.copy(dirYaw(-120, 30).multiplyScalar(1300));
  scene.add(moon);

  scene.add(new THREE.HemisphereLight(0x4a5c90, 0x0c0a08, 0.8));
  const moonL = new THREE.DirectionalLight(0x8ea4d8, 0.35);
  moonL.position.copy(dirYaw(-120, 35).multiplyScalar(50));
  scene.add(moonL);

  const grassTex = T.canvas(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % w, y = Math.floor(i / 4 / w), n = T.fbm3(x / 30, y / 30, 2, 4) * 0.7 + Math.random() * 0.3; d[i] = 30 * n + 12; d[i + 1] = 48 * n + 18; d[i + 2] = 22 * n + 8; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, { repeat: [30, 30] });
  const hill = new THREE.Mesh(new THREE.CircleGeometry(60, 48), mat(0xffffff, { map: grassTex, roughness: 1 }));
  hill.rotation.x = -Math.PI / 2; hill.position.y = -0.02; scene.add(hill);
  // falling-away hillside and the valley floor with town lights
  const slope = new THREE.Mesh(new THREE.CylinderGeometry(60, 260, 40, 48, 1, true), mat(0x0e140c, { roughness: 1, side: THREE.BackSide }));
  slope.position.y = -20; slope.material.side = THREE.FrontSide; scene.add(slope);
  const valley = new THREE.Mesh(new THREE.CircleGeometry(1400, 48), mat(0x070a07, { roughness: 1 }));
  valley.rotation.x = -Math.PI / 2; valley.position.y = -40; scene.add(valley);
  {
    const r = T.rng(77), pos = [];
    for (let i = 0; i < 260; i++) {
      const a = deg(120 + r() * 120), d = 350 + Math.pow(r(), 0.6) * 650;
      pos.push(-Math.sin(a) * d, -39.5, -Math.cos(a) * d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffc070, size: 2.2, sizeAttenuation: false, map: T.glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    // the river through the valley, a faint ribbon of sky
    const riv = new THREE.Mesh(new THREE.PlaneGeometry(2600, 30), mat(0x1a2440, { roughness: 0.2, metalness: 0.4 }));
    riv.rotation.x = -Math.PI / 2; riv.rotation.z = 0.25; riv.position.set(0, -39.6, 600); scene.add(riv);
  }
  // far hills: a jagged ring
  {
    const pts = [], r = T.rng(5), n = 120;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, h = 40 + T.fbm3(i * 0.15, 0, 3, 3) * 120;
      pts.push([Math.cos(a) * 1300, Math.sin(a) * 1300, h]);
    }
    const pos = [];
    for (let i = 0; i < n; i++) {
      const [x0, z0, h0] = pts[i], [x1, z1, h1] = pts[i + 1];
      pos.push(x0, -40, z0, x1, -40, z1, x1, h1 - 40, z1, x0, -40, z0, x1, h1 - 40, z1, x0, h0 - 40, z0);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ color: 0x0a0f1a, side: THREE.DoubleSide, fog: false });
    scene.add(new THREE.Mesh(g, m));
    void r;
  }
  // trees around the hilltop (dark silhouettes)
  {
    const r = T.rng(31), mats = [], trunks = [];
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = 14 + r() * 40, h = 7 + r() * 9;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > 0 && Math.abs(x) < z * 1.4) continue; // keep the view south open
      mats.push(P.tm(x, h * 0.62, z, h * 0.32, h * 0.5, h * 0.32, r() * 6));
      trunks.push(P.tm(x, h * 0.2, z, 1, h * 0.4, 1));
    }
    scene.add(P.instanced(new THREE.IcosahedronGeometry(1, 1), mat(0x0d150e, { roughness: 1, flatShading: true }), mats));
    scene.add(P.instanced(new THREE.CylinderGeometry(0.18, 0.28, 1, 6), mat(0x1a120c), trunks));
  }

  // ---- the octagon ----
  const A = 2.9, R = A / Math.cos(deg(22.5)), S = 2 * A * Math.tan(deg(22.5)), H = 3.0, TH = 0.14;
  const wallTex = T.wallpaper({ bg: '#4c2e26', stripe: '#573629', motif: '#b8935c' });
  wallTex.repeat.set(1, 1);
  const wainTex = T.wood({ base: [96, 58, 32], dark: [58, 32, 16], planks: 3, seed: 8, seams: true });
  const sidingTex = T.siding({ color: [74, 82, 66] });
  const trim = mat(0x3a2414, { roughness: 0.6 });
  const wallMat = mat(0xffffff, { map: wallTex, roughness: 0.92 });
  const wainMat = mat(0xffffff, { map: wainTex, roughness: 0.55 });
  const outMat = mat(0xffffff, { map: sidingTex, roughness: 0.95 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb4d0, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false });
  const room = new THREE.Group(); scene.add(room);

  // A wall piece: a thin box spanning [x0,x1]x[y0,y1] in wall coordinates; inner face papered or panelled.
  function piece(wg, x0, x1, y0, y1) {
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0.001 || h <= 0.001) return;
    const g = new THREE.BoxGeometry(w, h, TH); g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    T.planarUV(g, 1 / 1.1, 'xy', [5, 0]);
    const lowerM = y1 <= 0.95 ? wainMat : wallMat;
    const me = new THREE.Mesh(g, [trim, trim, trim, trim, lowerM, outMat]);
    wg.add(me);
  }
  function wall(i, kind) {
    const yaw = i * 45, wg = new THREE.Group();
    const c = dirYaw(yaw).multiplyScalar(A + TH / 2);
    wg.position.set(c.x, 0, c.z); wg.rotation.y = deg(yaw);
    const L = -S / 2 - 0.08, Rr = S / 2 + 0.08;
    if (kind === 'window') {
      const wx = 0.55, y0 = 0.95, y1 = 2.45;
      piece(wg, L, -wx, 0.95, H); piece(wg, wx, Rr, 0.95, H); piece(wg, -wx, wx, y1, H); piece(wg, L, Rr, 0, 0.95);
      // sash, mullions, sill
      const fr = mat(0xe8e0cc, { roughness: 0.6 });
      wg.add(box(wx * 2 + 0.1, 0.06, 0.24, fr, 0, y0 - 0.02, 0.05));
      wg.add(box(wx * 2, 0.05, 0.05, fr, 0, (y0 + y1) / 2, 0), box(0.04, y1 - y0, 0.05, fr, 0, (y0 + y1) / 2, 0));
      wg.add(box(0.05, y1 - y0, 0.07, fr, -wx, (y0 + y1) / 2, 0), box(0.05, y1 - y0, 0.07, fr, wx, (y0 + y1) / 2, 0), box(wx * 2, 0.05, 0.07, fr, 0, y1, 0));
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(wx * 2, y1 - y0), glassMat); gl.position.set(0, (y0 + y1) / 2, 0); wg.add(gl);
    } else if (kind === 'door') {
      const dw = 0.5, dh = 2.2;
      piece(wg, L, -dw, 0, H); piece(wg, dw, Rr, 0, H); piece(wg, -dw, dw, dh, H);
      const dm = mat(0xffffff, { map: T.wood({ base: [110, 66, 34], dark: [70, 40, 20], planks: 4, seed: 12 }), roughness: 0.5 });
      const door = box(dw * 2 - 0.02, dh - 0.01, 0.05, dm, 0, dh / 2, 0.02);
      wg.add(door);
      [0.55, 1.6].forEach(y => wg.add(box(0.78, 0.6, 0.02, trim, 0, y, 0.055)));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), P.brass()); knob.position.set(0.38, 1.0, 0.08); wg.add(knob);
      wg.userData.door = door;
    } else {
      piece(wg, L, Rr, 0, 0.95); piece(wg, L, Rr, 0.95, H);
    }
    // chair rail and crown
    wg.add(box(S + 0.12, 0.05, 0.05, trim, 0, 0.95, 0.09), box(S + 0.12, 0.12, 0.08, trim, 0, H - 0.06, 0.1));
    room.add(wg);
    return wg;
  }
  const kinds = ['fire', 'shelf', 'window', 'window', 'door', 'window', 'window', 'window'];
  const walls = kinds.map((k, i) => wall(i, k));

  // floor and ceiling
  const floorTex = T.wood({ base: [118, 76, 44], dark: [66, 40, 22], planks: 5, seed: 2 });
  floorTex.repeat.set(2.5, 1.3);
  const oct = [];
  for (let k = 0; k < 8; k++) { const d = dirYaw(22.5 + k * 45).multiplyScalar(R + 0.15); oct.push(new THREE.Vector2(d.x, -d.z)); }
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(oct)), mat(0xffffff, { map: floorTex, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.001; room.add(floor);
  const ceilTex = T.wood({ base: [130, 96, 62], dark: [90, 62, 38], planks: 8, seed: 21 });
  const ceil = new THREE.Mesh(new THREE.ConeGeometry(R + 0.12, 2.0, 8, 1, true, Math.PI / 8), mat(0xffffff, { map: ceilTex, roughness: 0.8, side: THREE.BackSide }));
  ceil.position.y = H + 1.0; room.add(ceil);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 0.45, 2.3, 8, 1, false, Math.PI / 8), mat(0xffffff, { map: T.shingles({ repeat: [6, 3] }), roughness: 1 }));
  roof.position.y = H + 1.15; room.add(roof);
  const finial = P.lathe([[0.001, 0], [0.08, 0], [0.05, 0.2], [0.07, 0.3], [0.001, 0.55]], trim); finial.position.y = H + 2.25; room.add(finial);
  // stone footing and porch steps outside the door
  const stoneTex = T.stone({ base: [100, 96, 88], rows: 6, seed: 4, repeat: [2, 0.5] });
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.4, 0.4, 8, 1, false, Math.PI / 8), mat(0xffffff, { map: stoneTex }));
  foot.position.y = -0.19; room.add(foot);
  [0, 1].forEach(s => room.add(box(1.6, 0.18, 0.4, mat(0xffffff, { map: stoneTex }), 0, -0.1 - s * 0.18, A + 0.35 + s * 0.38)));

  // ---- fireplace wall ----
  {
    const brickM = mat(0xffffff, { map: T.brick({ repeat: [2, 2] }), roughness: 0.9 });
    const fp = new THREE.Group();
    fp.add(box(1.5, 1.15, 0.35, brickM, 0, 0.575, 0));
    fp.add(box(0.8, 0.75, 0.36, mat(0x0a0706, { roughness: 1 }), 0, 0.4, 0.01));
    fp.add(box(1.75, 0.08, 0.45, mat(0x2d1b10, { roughness: 0.4 }), 0, 1.19, 0.03));
    fp.add(box(1.5, 1.8, 0.25, brickM, 0, 2.1, -0.05));
    fp.add(box(0.95, 0.04, 0.4, mat(0x5a2a1c), 0, 0.02, 0.32)); // hearth rug of brick
    // andirons and a couple of cold logs
    [-0.22, 0.22].forEach(x => fp.add(cyl(0.015, 0.02, 0.22, P.iron(), 8, x, 0.11, 0.05)));
    const log = cyl(0.06, 0.06, 0.6, mat(0x2b1a10), 10, 0, 0.12, 0.02); log.rotation.z = Math.PI / 2; fp.add(log);
    // mantel clock
    const clock = new THREE.Group();
    clock.add(box(0.26, 0.3, 0.12, mat(0x2a160c, { roughness: 0.35 })));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), new THREE.MeshStandardMaterial({ map: T.canvas(128, 128, (g) => {
      g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#222'; g.font = '16px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; g.fillText(['I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i - 1], 64 + Math.sin(a) * 48, 64 - Math.cos(a) * 48); }
      g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 22, 64 - 18); g.moveTo(64, 64); g.lineTo(64 - 4, 64 - 40); g.stroke();
    }, { wrap: false }) }));
    face.position.set(0, 0.03, 0.061); clock.add(face);
    clock.position.set(0.45, 1.38, 0.05); fp.add(clock);
    // a framed photograph on the mantel
    const ph = box(0.22, 0.28, 0.02, trim, -0.45, 1.37, 0.0); ph.rotation.x = -0.15; fp.add(ph);
    const phImg = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.22), mat(0x8a7350)); phImg.position.set(-0.45, 1.375, 0.013); phImg.rotation.x = -0.15; fp.add(phImg);
    const c = dirYaw(0).multiplyScalar(A - 0.18);
    fp.position.set(c.x, 0, c.z);
    room.add(fp);
  }

  // ---- bookcase on wall 1 ----
  {
    const bc = new THREE.Group(), w = mat(0x3a2414, { roughness: 0.55 });
    bc.add(box(1.7, 1.9, 0.04, w, 0, 0.95, -0.15));
    [-0.84, 0.84].forEach(x => bc.add(box(0.04, 1.9, 0.34, w, x, 0.95, 0)));
    [0.03, 0.5, 0.95, 1.4, 1.88].forEach(y => bc.add(box(1.7, 0.035, 0.34, w, 0, y, 0)));
    const r = T.rng(8), cols = [0x5a1e18, 0x1e3a2a, 0x2a2440, 0x6b4a20, 0x3a1a10, 0x50402a, 0x1d2d3d];
    for (const y of [0.05, 0.52, 0.97, 1.42]) {
      let x = -0.8;
      while (x < 0.78) {
        const bw = 0.03 + r() * 0.035, bh = 0.24 + r() * 0.14;
        if (x + bw > 0.8) break;
        const b = box(bw, bh, 0.22 + r() * 0.06, mat(cols[Math.floor(r() * cols.length)], { roughness: 0.7 }), x + bw / 2, y + bh / 2, 0.02);
        if (r() < 0.08) b.rotation.z = 0.2;
        bc.add(b); x += bw + 0.003;
      }
    }
    const c = dirYaw(45).multiplyScalar(A - 0.18);
    bc.position.set(c.x, 0, c.z); bc.rotation.y = deg(45);
    room.add(bc);
    const hit = box(1.7, 1.9, 0.4, new THREE.MeshBasicMaterial({ visible: false }), 0, 0.95, 0);
    bc.add(hit);
    hot(hit, { nodes: ['s_center'], click: () => api.ui.doc('shelf') });
  }

  // ---- rug, desk, chair ----
  {
    const rugTex = T.canvas(256, 256, (g, w) => {
      g.fillStyle = '#5a1f1a'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#c69a52'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, w - 28);
      g.strokeStyle = '#1f2c3a'; g.lineWidth = 10; g.strokeRect(30, 30, w - 60, w - 60);
      g.fillStyle = '#8a3a24';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { g.save(); g.translate(58 + i * 28, 58 + j * 28); g.rotate(Math.PI / 4); g.fillRect(-7, -7, 14, 14); g.restore(); }
      const img = g.getImageData(0, 0, w, w), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(img, 0, 0);
    }, { wrap: false });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), mat(0xffffff, { map: rugTex, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.006, -0.1); room.add(rug);
  }
  const desk = new THREE.Group();
  const deskTop = 0.76;
  {
    const dw = mat(0xffffff, { map: T.wood({ base: [104, 62, 32], dark: [60, 34, 16], planks: 1, seed: 33, seams: false }), roughness: 0.45 });
    desk.add(box(1.4, 0.05, 0.75, dw, 0, deskTop - 0.025, 0));
    desk.add(box(1.3, 0.12, 0.65, dw, 0, deskTop - 0.11, 0));
    [[-0.64, -0.32], [0.64, -0.32], [-0.64, 0.32], [0.64, 0.32]].forEach(([x, z]) => desk.add(cyl(0.03, 0.025, deskTop - 0.05, dw, 10, x, (deskTop - 0.05) / 2, z)));
    // baize writing surface
    desk.add(box(0.9, 0.004, 0.45, mat(0x1e3b26, { roughness: 1 }), 0, deskTop + 0.002, 0.05));
    // chair on the far side
    const ch = new THREE.Group();
    ch.add(box(0.46, 0.05, 0.44, dw, 0, 0.46, 0));
    [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]].forEach(([x, z]) => ch.add(cyl(0.02, 0.018, 0.46, dw, 8, x, 0.23, z)));
    ch.add(box(0.44, 0.5, 0.04, dw, 0, 0.75, -0.2));
    ch.position.set(0.1, 0, -0.65); ch.rotation.y = 0.15;
    desk.add(ch);
    desk.position.set(0, 0, -0.95);
    room.add(desk);
  }
  const deskY = deskTop;
  const lampObj = P.lamp({ intensity: 7, distance: 10 });
  lampObj.group.position.set(0.5, deskY, -1.15);
  room.add(lampObj.group);
  // a second, dimmer candle on the mantel so the room isn't one-sided
  const fill = new THREE.PointLight(0xff9a50, 0.6, 6, 2); fill.position.set(0, 1.6, -1.6); room.add(fill);

  // ink, pipe, a stack of manuscript, the Remington
  {
    const ink = cyl(0.025, 0.03, 0.05, new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.1 }), 12, -0.15, deskY + 0.025, -1.25); room.add(ink);
    const pen = cyl(0.004, 0.004, 0.16, mat(0x111111), 6, -0.12, deskY + 0.08, -1.25); pen.rotation.z = 0.4; room.add(pen);
    const pipe = new THREE.Group();
    pipe.add(cyl(0.022, 0.018, 0.05, mat(0x6b3d1a, { roughness: 0.5 }), 10, 0, 0.025, 0));
    const stem = cyl(0.005, 0.006, 0.14, mat(0x1a120a), 6, 0.07, 0.01, 0); stem.rotation.z = Math.PI / 2 - 0.15; pipe.add(stem);
    pipe.position.set(0.35, deskY, -0.78); pipe.rotation.y = 0.6; room.add(pipe);
    for (let i = 0; i < 9; i++) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), mat(0xe9dfc6, { roughness: 1, side: THREE.DoubleSide })); sh.rotation.x = -Math.PI / 2; sh.rotation.z = (Math.random() - 0.5) * 0.15; sh.position.set(-0.5, deskY + 0.004 + i * 0.002, -1.12); room.add(sh); }
  }
  const tw = typewriter();
  tw.position.set(-0.12, deskY, -1.0);
  room.add(tw);
  // the final sheet rolled in the typewriter
  const twSheetTex = T.paper({ w: 256, h: 320, lines: 0, seed: 99 });
  const twSheet = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), mat(0xffffff, { map: twSheetTex, roughness: 1, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: twSheetTex, emissiveIntensity: 0.28 }));
  twSheet.position.set(-0.12, deskY + 0.3, -1.13); twSheet.rotation.x = -0.25; room.add(twSheet);

  // the letter
  const letterTex = T.paper({ w: 256, h: 330, lines: 13, seed: 3, ink: 'rgba(30,25,60,.7)' });
  const letter = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), mat(0xffffff, { map: letterTex, roughness: 1 }));
  letter.rotation.x = -Math.PI / 2; letter.rotation.z = -0.12; letter.position.set(0.16, deskY + 0.006, -0.77); room.add(letter);
  hot(letter, { nodes: ['s_center', 's_desk'], click: () => api.ui.doc('letter') });

  // the three returned pages, laid by the machine
  const pageMeshes = {};
  ['river', 'cave', 'court'].forEach((k, i) => {
    const t = T.paper({ w: 256, h: 330, lines: 12, seed: 40 + i, ink: 'rgba(20,20,20,.75)' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), mat(0xffffff, { map: t, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = 0.1 - i * 0.08;
    m.position.set(-0.5 + i * 0.012, deskY + 0.03 + i * 0.003, -0.78 + i * 0.01);
    room.add(m); pageMeshes[k] = m;
    hot(m, { nodes: ['s_desk'], click: () => api.ui.doc({ river: 'pageRiver', cave: 'pageCave', court: 'pageCourt' }[k]) });
  });
  hot(tw, {
    nodes: ['s_desk'], click: () => {
      const n = api.pageCount();
      if (st.flags.done) { api.ui.say('The chapter is finished. The machine has said all it means to.'); return; }
      if (n < 3) { api.ui.say(n ? `The machine waits. ${3 - n} page${3 - n > 1 ? 's' : ''} still missing.` : 'A Remington. A clean sheet is rolled in. The keys won’t move for you yet.'); api.A.sfx.click(); return; }
      finale();
    },
  });

  // ---- the stereoscope and its views ----
  // A parlour stereoscope on its own pedestal, hood toward the room, and a little table of views beside it.
  const SY = -45;
  const scope = P.stereoscope();
  const scopePos = dirYaw(SY).multiplyScalar(2.0);
  scope.position.set(scopePos.x, 1.08, scopePos.z);
  scope.rotation.y = deg(SY);
  room.add(scope);
  const scopeHit = box(0.3, 0.2, 0.42, new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0);
  scope.add(scopeHit);
  const side = dirYaw(SY - 90), toward = dirYaw(SY).multiplyScalar(-1);
  const tablePos = scopePos.clone().add(side.clone().multiplyScalar(0.6)).add(toward.clone().multiplyScalar(0.05));
  {
    const w = mat(0x4a2a14, { roughness: 0.5 });
    const tb = new THREE.Group();
    tb.add(cyl(0.34, 0.34, 0.035, w, 28, 0, 0.78, 0));
    tb.add(P.lathe([[0.001, 0], [0.22, 0], [0.22, 0.03], [0.05, 0.08], [0.035, 0.4], [0.05, 0.76], [0.001, 0.77]], w));
    tb.position.set(tablePos.x, 0, tablePos.z);
    room.add(tb);
  }
  const scopeLabel = P.signPlane(T.sign({ w: 256, h: 96, bg: '#d8c69c', color: '#3a2a18', size: 20, lines: ['PATENT', 'STEREOSCOPE'] }), 0.11, { transparent: false });
  scopeLabel.rotation.order = 'YXZ'; scopeLabel.rotation.set(-Math.PI / 2, deg(SY + 15), 0);
  scopeLabel.position.copy(tablePos).add(toward.clone().multiplyScalar(0.22)).add(side.clone().multiplyScalar(-0.12)); scopeLabel.position.y = 0.8;
  room.add(scopeLabel);
  hot(scopeLabel, { nodes: ['s_scope'], click: () => api.ui.doc('scopeCard') });

  const scopeMid = scopePos.clone().lerp(tablePos, 0.5).setY(0.92);
  const VIEWS = [
    { id: 'river', title: 'THE RIVER · HAT ISLAND CROSSING' },
    { id: 'cave', title: "McDOUGAL'S CAVE" },
    { id: 'court', title: 'CAMELOT · THE LOWER WARD' },
  ];
  const cards = {};
  VIEWS.forEach((v, i) => {
    const tex = P.stereoCardTexture(v.title);
    const c = P.stereoCard(tex);
    c.userData.tex = tex;
    room.add(c);
    cards[v.id] = c;
    c.scale.setScalar(1.45);
    hot(c, { nodes: ['s_scope'], click: () => insertCard(v.id), label: () => (st.card === v.id ? 'Take out: ' : '') + titleCase(v.title) });
  });
  function cardHome(id, i) {
    // lying face up on the table in a row
    const c = cards[id];
    const p = tablePos.clone().add(side.clone().multiplyScalar((i - 1) * 0.215)).add(toward.clone().multiplyScalar(-0.02 + Math.abs(i - 1) * 0.05));
    c.position.set(p.x, 0.8 + i * 0.0005, p.z);
    c.rotation.order = 'YXZ';
    c.rotation.set(-Math.PI / 2, deg(SY) - (i - 1) * 0.12, 0);
    c.scale.setScalar(1.45);
  }
  function cardInScope(id) {
    const c = cards[id];
    const slot = scope.localToWorld(scope.userData.cardSlot.clone());
    c.position.copy(slot);
    c.rotation.order = 'YXZ';
    c.rotation.set(0, scope.rotation.y, 0);
    c.scale.setScalar(1);
  }
  function placeCards() {
    scope.updateMatrixWorld(true);
    VIEWS.forEach((v, i) => { if (st.card === v.id) cardInScope(v.id); else cardHome(v.id, i); });
  }
  placeCards();
  function insertCard(id) {
    api.A.sfx.click();
    st.card = st.card === id ? null : id; api.save();
    placeCards();
    if (st.card) api.ui.say(`The view slips into the holder: ${titleCase(VIEWS.find(v => v.id === id).title)}.`, 3);
  }
  hot(scopeHit, {
    nodes: ['s_scope'], label: () => st.card ? 'Look into the stereoscope' : 'The stereoscope (empty)', click: () => {
      if (!st.card) { api.ui.say('You put your eyes to the hood. Nothing in the holder but the wall.'); return; }
      api.travel(st.card);
    },
  });

  // ---- Bambino ----
  const cat = makeCat();
  const catSpots = { rug: [[-1.15, 0.0, -0.9], 0.6], desk: [[0.3, deskY, -0.95], -0.4] };
  function placeCat() { const [p, r] = st.flags.done ? catSpots.desk : catSpots.rug; cat.position.set(...p); cat.rotation.y = r; }
  placeCat();
  room.add(cat);
  let purrs = 0;
  hot(cat, {
    nodes: ['s_center', 's_desk'], click: () => {
      purrs++;
      if (purrs % 3 === 1) { api.A.sfx.purr(); api.ui.say('Bambino. She opens one eye, decides you are acceptable, and purrs.'); }
      else if (purrs % 3 === 2) { api.A.sfx.meow(); api.ui.say('She would like you to know she does not belong to anybody.'); }
      else { api.A.sfx.purr(); api.ui.say('The purring continues, the way a steamboat engine continues.'); }
    },
  });

  // door
  const door = walls[4].userData.door;
  hot(door, { nodes: ['s_center'], click: () => api.goTo('s_porch', 180) });

  // ---- nodes ----
  const nodes = {
    s_center: {
      pos: [0, 1.6, 0.85], yaw: 0, turn: 45, amb: 'study',
      pitches: { 0: -16, 45: -10, 315: -12 },
      links: [
        { yaw: 0, to: 's_desk' },
        { yaw: 315, to: 's_scope' },
        { yaw: 180, to: 's_porch', arrive: 180 },
      ],
    },
    s_desk: { pos: [0.0, 1.32, -0.25], target: [-0.1, deskY, -1.05], back: 's_center', backYaw: 0, amb: 'study' },
    s_scope: { pos: scopeMid.clone().add(toward.clone().multiplyScalar(0.8)).setY(1.42), target: scopeMid, back: 's_center', backYaw: 315, amb: 'study' },
    s_porch: {
      pos: [0, 1.62, A + 1.9], yaw: 180, amb: 'porch',
      pitches: { 180: 4 },
      links: [{ yaw: 0, to: 's_center', arrive: 0 }],
    },
  };

  // ---- the ending ----
  async function finale() {
    api.setBusy(true);
    st.flags.done = true; api.save();
    const g = twSheetTex.image.getContext('2d');
    g.fillStyle = '#1a1612'; g.font = '15px "Courier New", monospace';
    const words = LAST_LINE.split(' ');
    const lines = []; let ln = '';
    for (const w of words) { if ((ln + ' ' + w).length > 26) { lines.push(ln); ln = w; } else ln = ln ? ln + ' ' + w : w; }
    lines.push(ln);
    let shown = '';
    api.ui.say('', 0.1);
    for (let i = 0; i < lines.length; i++) {
      for (let j = 0; j < lines[i].length; j++) {
        g.fillText(lines[i][j], 24 + j * 8.6, 60 + i * 22);
        twSheetTex.needsUpdate = true;
        api.A.sfx.type();
        shown += lines[i][j];
        await api.wait(55 + Math.random() * 60);
      }
      api.A.sfx.ding();
      shown += ' ';
      await api.wait(260);
    }
    api.ui.say(`“${LAST_LINE}”`, 9);
    await api.wait(2400);
    await api.goTo('s_center', 180, { dur: 1.6 });
    await api.goTo('s_porch', 180, { dur: 2.0 });
    await api.look(166, 9, 2.5);
    cometFlare = 1;
    api.A.sfx.chime();
    await api.wait(3800);
    lampObj.base = 0; // the lamp goes out
    placeCat();
    api.ending();
  }
  let cometFlare = 0;

  function update(dt, t) {
    P.flicker(lampObj, t, 0.06);
    if (cometFlare > 0) { cometFlare = Math.min(4, cometFlare + dt * 0.8); comet.scale.setScalar(1 + cometFlare * 0.35); comet.material.opacity = Math.min(1, 0.6 + cometFlare); }
    for (const k of ['river', 'cave', 'court']) pageMeshes[k].visible = !!st.pages[k];
    twSheet.visible = true;
  }
  function onSnapshots(worlds) {
    VIEWS.forEach(v => cards[v.id].userData.tex.userData.paint(worlds[v.id].snapCanvas));
  }

  return {
    scene, nodes, hots, start: 's_center', amb: 'study', update, onSnapshots,
    snapNode: 's_center', snapYaw: 0, snapPitch: -8,
    onEnterWorld() { placeCards(); placeCat(); },
  };
}

function typewriter() {
  // A Remington-ish: black frame, banks of keys, a platen roller on top.
  const g = new THREE.Group();
  const black = P.mat(0x111111, { roughness: 0.35, metalness: 0.4 }), nickel = P.mat(0xc8c8c0, { roughness: 0.25, metalness: 0.9 });
  const body = P.box(0.32, 0.1, 0.24, black, 0, 0.06, 0); g.add(body);
  const top = P.box(0.3, 0.08, 0.12, black, 0, 0.15, -0.06); g.add(top);
  const keys = new THREE.Group();
  for (let row = 0; row < 4; row++) for (let i = 0; i < 10 - (row === 3 ? 2 : 0); i++) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 10), P.mat(0xe8e0cc, { roughness: 0.4 }));
    k.position.set(-0.12 + i * 0.027 + row * 0.006, 0.11 + row * 0.012, 0.1 - row * 0.024); keys.add(k);
  }
  g.add(keys);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 16), black); plat.rotation.z = Math.PI / 2; plat.position.set(0, 0.2, -0.1); g.add(plat);
  [-0.19, 0.19].forEach(x => { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), nickel); k.rotation.z = Math.PI / 2; k.position.set(x, 0.2, -0.1); g.add(k); });
  const lever = P.box(0.12, 0.008, 0.008, nickel, -0.22, 0.22, -0.08); lever.rotation.z = 0.4; g.add(lever);
  g.add(P.box(0.3, 0.02, 0.02, nickel, 0, 0.12, 0.13));
  return g;
}

function makeCat() {
  const g = new THREE.Group();
  const fur = P.mat(0x0d0c0c, { roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), fur); body.scale.set(1, 0.62, 1.35); body.position.y = 0.1; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), fur); head.position.set(0, 0.15, 0.2); g.add(head);
  [-1, 1].forEach(s => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 4), fur); ear.position.set(s * 0.04, 0.22, 0.19); ear.rotation.z = -s * 0.25; g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0x8fb04a })); eye.scale.y = 0.35; eye.position.set(s * 0.028, 0.16, 0.268); g.add(eye);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), fur); paw.scale.z = 1.6; paw.position.set(s * 0.06, 0.03, 0.2); g.add(paw);
  });
  const curve = new THREE.CatmullRomCurve3([P.V(0.08, 0.05, -0.18), P.V(0.18, 0.03, -0.05), P.V(0.17, 0.025, 0.12), P.V(0.08, 0.02, 0.2)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.022, 8, false), fur));
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.55), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.12; g.add(hit);
  return g;
}

function titleCase(s) {
  return s.toLowerCase().split(' ').map(w => (w === 'mcdougal\'s' ? 'McDougal\'s' : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}
