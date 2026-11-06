// The kitchen line, left to right: cooler, ticket printer and bench, make table and topping cart,
// ovens, and the pass window into the dining room. Everything is built from primitives and
// canvas textures. Also owns the surfaces that loose things land on.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { tileTextures, butcherTexture, steelTextures, floorTexture, brickTexture, checkTexture, labelTexture, canvas, tex, makeRng, roundRect, clamp } from './util.js';
import { TOPPINGS, CART } from './data.js';

export const L = {
  COUNTER: 0.92, BENCH: 0.955, CART: 0.95, DECK: 1.0, PASS: 1.02, SHELF: 0.95, BIN_FLOOR: 0.85,
  WALL: -0.8, FRONT: 0.34,
  stations: [
    { id: 'cooler', x: -4.85, name: 'Cooler' },
    { id: 'prep', x: -2.5, name: 'Tickets & bench' },
    { id: 'make', x: 0.25, name: 'Make table' },
    { id: 'ovens', x: 2.62, name: 'Ovens' },
    { id: 'pass', x: 4.95, name: 'Pass' },
  ],
  cooler: { x0: -5.7, x1: -4.0, front: -0.04, back: -0.8, mid: -4.85 },
  OVEN_X: [2.12, 3.14], OVEN_FACE: -0.5, HINGE_Y: 0.972, DOOR_H: 0.4, MOUTH_HALF: 0.36, MOUTH_TOP: 1.36, DECK_BACK: -1.2,
  pass: { x0: 4.28, x1: 5.72, z0: -1.05, z1: -0.42 },
  trash: { x: -1.32, z: 0.07, r: 0.135 },
  peelHome: { x: -0.62, z: -0.25 }, metalHome: { x: 3.7, z: 0.08 },
  printer: { x: -3.66, z: -0.5 }, rail: { x0: -3.18, x1: -1.72, y: 1.25, z: -0.735 },
  tray: { x: -2.98, z: -0.46 }, coolerTray: { x: -5.3, z: -0.42 },
  bell: { x: 5.6, z: -0.2 },
  cartX: i => 0.44 + (i % 5) * 0.235, cartZ: i => (i < 5 ? 0.0 : -0.38),
  tubSpot: i => ({ x: -4.66 + (i % 5) * 0.13, z: i < 5 ? -0.2 : -0.52 }),
};

export function buildKitchen(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  scene.background = new THREE.Color(0x1b1410);

  const tiles = tileTextures(), steel = steelTextures();
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tiles.map, bumpMap: tiles.bump, bumpScale: 1.2, roughness: 0.22, metalness: 0 }),
    steel: new THREE.MeshStandardMaterial({ map: steel.map, roughnessMap: steel.rough, color: 0xdfe3e8, metalness: 0.85, roughness: 0.42 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.85, roughness: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 1, roughness: 0.12 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1d1d1f, metalness: 0.55, roughness: 0.38 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    butcher: new THREE.MeshStandardMaterial({ map: butcherTexture(), roughness: 0.62 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.85 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f5f2, roughness: 0.45 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 }),
  };
  M.floor.map.repeat.set(10, 4);
  M.tile.map.repeat.set(6, 3); M.tile.bumpMap.repeat.set(6, 3);
  M.brick.map.repeat.set(2, 2);

  const root = new THREE.Group(); scene.add(root);
  const add = (geo, mat, x, y, z, { cast = true, receive = true, parent = root, rx = 0, ry = 0, rz = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, o) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
  const rbox = (w, h, d, r, mat, x, y, z, o) => add(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z, o);
  const surfaces = [];
  const surf = (x0, x1, z0, z1, top, kind, id) => { const s = { x0, x1, z0, z1, top, kind, id }; surfaces.push(s); return s; };

  // Floor and walls -------------------------------------------------------------
  add(new THREE.PlaneGeometry(16, 6), M.floor, 0, 0, -0.4, { rx: -Math.PI / 2, cast: false });
  const wallTile = (x0, x1, y0, y1, z = L.WALL - 0.02) => {
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 0.6, (y0 + uv.getY(i) * (y1 - y0)) / 0.5);
    return add(g, M.tile, (x0 + x1) / 2, (y0 + y1) / 2, z, { cast: false });
  };
  M.tile.map.repeat.set(1, 1); M.tile.bumpMap.repeat.set(1, 1);
  wallTile(-6.6, 1.58, 0, 3.0);
  wallTile(3.72, 4.28, 0, 3.0); wallTile(5.72, 7, 0, 3.0);
  wallTile(4.28, 5.72, 0, 1.0); wallTile(4.28, 5.72, 1.78, 3.0);
  // side walls to close the line off
  box(0.1, 3, 2.2, M.tile, -6.0, 1.5, 0.2, { cast: false });
  box(0.1, 3, 2.2, M.tile, 6.4, 1.5, 0.2, { cast: false });
  // Pass window frame (stainless)
  box(1.5, 0.05, 0.12, M.steel, 5.0, 1.8, L.WALL); box(0.05, 0.82, 0.12, M.steel, 4.27, 1.39, L.WALL); box(0.05, 0.82, 0.12, M.steel, 5.73, 1.39, L.WALL);

  // Base cabinets under every counter, with a steel kick and doors.
  const cabinet = (x0, x1, top, z0 = -0.78, z1 = L.FRONT - 0.02, mat = M.steel) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    box(w - 0.01, top - 0.12, z1 - z0 - 0.04, M.steelDark, cx, 0.08 + (top - 0.12) / 2, (z0 + z1) / 2 - 0.02);
    box(w - 0.04, 0.08, 0.02, M.rubber, cx, 0.04, z1 - 0.08, { cast: false });
    const doors = Math.max(1, Math.round(w / 0.55));
    for (let i = 0; i < doors; i++) {
      const dw = w / doors, dx = x0 + dw * (i + 0.5);
      rbox(dw - 0.03, top - 0.25, 0.02, 0.006, mat, dx, 0.12 + (top - 0.25) / 2 + 0.03, z1 - 0.02);
      box(0.12, 0.016, 0.03, M.chrome, dx, top - 0.16, z1 + 0.005);
    }
  };

  // Cooler ------------------------------------------------------------------------
  const C = L.cooler;
  const cw = C.x1 - C.x0;
  box(cw, 2.05, 0.04, M.steel, C.mid, 1.025, C.back);                     // back
  box(0.05, 2.05, C.front - C.back, M.steel, C.x0 + 0.025, 1.025, (C.front + C.back) / 2);
  box(0.05, 2.05, C.front - C.back, M.steel, C.x1 - 0.025, 1.025, (C.front + C.back) / 2);
  box(cw, 0.12, C.front - C.back, M.steel, C.mid, 1.99, (C.front + C.back) / 2);   // top
  box(cw, 0.12, C.front - C.back, M.steelDark, C.mid, 0.06, (C.front + C.back) / 2);
  box(cw - 0.1, 0.4, 0.02, M.black, C.mid, 2.25, C.front + 0.02, { cast: false });  // grille header
  add(new THREE.PlaneGeometry(0.9, 0.12), new THREE.MeshBasicMaterial({ map: labelTexture('WALK-IN? NO. REACH-IN.', { w: 512, h: 64, bg: '#1d1d1f', fg: '#9fd4ff', font: '700 30px "Segoe UI",sans-serif' }) }), C.mid, 2.25, C.front + 0.035, { cast: false });
  const inner = new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.4 });
  box(cw - 0.12, 1.85, 0.01, inner, C.mid, 1.0, C.back + 0.03, { cast: false });
  // shelves: the reachable one (dough + tubs) and two decorative ones
  box(cw - 0.12, 0.025, 0.72, M.steel, C.mid, L.SHELF - 0.0125, -0.42);
  surf(C.x0 + 0.06, C.x1 - 0.06, -0.78, C.front - 0.01, L.SHELF, 'shelf');
  box(cw - 0.12, 0.02, 0.6, M.steel, C.mid, 1.42, -0.5); box(cw - 0.12, 0.02, 0.6, M.steel, C.mid, 0.5, -0.5);
  surf(C.x0 + 0.06, C.x1 - 0.06, -0.78, -0.2, 1.43, 'shelf2');
  // stuff on the upper shelf: cheese blocks, a tomato can case, milk crate
  const crate = new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.6 });
  box(0.34, 0.26, 0.32, crate, -5.35, 1.56, -0.55);
  for (let i = 0; i < 3; i++) rbox(0.16, 0.08, 0.1, 0.02, new THREE.MeshStandardMaterial({ color: 0xf1e3b0, roughness: 0.5 }), -4.85 + i * 0.18, 1.47, -0.5);
  for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 20), canMat(), -4.38 + (i % 2) * 0.13, 1.51, -0.62 + Math.floor(i / 2) * 0.14);
  for (let i = 0; i < 5; i++) rbox(0.2, 0.12, 0.28, 0.02, new THREE.MeshStandardMaterial({ color: [0xc7d6c5, 0xd8c7b5, 0xd2d6db][i % 3], roughness: 0.7 }), -5.4 + i * 0.27, 0.58, -0.5);
  // cool white light inside
  const coolLight = new THREE.PointLight(0xcfe8ff, 0, 2.2, 1.6); coolLight.position.set(C.mid, 1.7, -0.3); root.add(coolLight);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xdff2ff });
  box(cw - 0.2, 0.015, 0.03, ledMat, C.mid, 1.92, C.front - 0.05, { cast: false });
  // doors: glass in a steel frame, hinged on the outside edges, handles meet in the middle
  const doors = [-1, 1].map(side => {
    const hingeX = side < 0 ? C.x0 + 0.03 : C.x1 - 0.03, dir = side < 0 ? 1 : -1, w = cw / 2 - 0.03;
    const pivot = new THREE.Group(); pivot.position.set(hingeX, 0, C.front + 0.012); root.add(pivot);
    const fr = (ww, hh, x, y) => box(ww, hh, 0.035, M.steel, x, y, 0, { parent: pivot });
    fr(w, 0.07, dir * w / 2, 0.16); fr(w, 0.07, dir * w / 2, 1.9); fr(0.06, 1.8, dir * 0.03, 1.03); fr(0.06, 1.8, dir * (w - 0.03), 1.03);
    add(new THREE.PlaneGeometry(w - 0.1, 1.68), M.glass, dir * w / 2, 1.03, 0.004, { parent: pivot, cast: false, receive: false });
    const gasket = box(w - 0.02, 0.012, 0.012, M.rubber, dir * w / 2, 0.125, -0.012, { parent: pivot, cast: false });
    const handle = add(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 12), M.chrome, dir * (w - 0.07), 1.18, 0.07, { parent: pivot });
    box(0.025, 0.025, 0.06, M.chrome, dir * (w - 0.07), 0.89, 0.04, { parent: pivot }); box(0.025, 0.025, 0.06, M.chrome, dir * (w - 0.07), 1.47, 0.04, { parent: pivot });
    void gasket;
    return { pivot, hinge: new THREE.Vector3(hingeX, 0, C.front + 0.012), dir, w, angle: 0, vel: 0, handleR: w - 0.07, handleOut: 0.07, handle, side };
  });

  cabinet(-6.0, C.x0, L.COUNTER, -0.78, L.FRONT - 0.02);
  // Counter beside the cooler: the printer lives here.
  counterTop(-4.0, -3.3, L.COUNTER);
  surf(-4.0, -3.3, -0.78, L.FRONT, L.COUNTER, 'counter');
  cabinet(-4.0, -3.3, L.COUNTER);

  // Ticket printer --------------------------------------------------------------------
  const P = L.printer;
  const prn = new THREE.Group(); prn.position.set(P.x, L.COUNTER, P.z); root.add(prn);
  rbox(0.2, 0.15, 0.24, 0.02, M.plastic, 0, 0.075, 0, { parent: prn });
  rbox(0.18, 0.03, 0.12, 0.01, new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.35 }), 0, 0.155, -0.05, { parent: prn });
  box(0.12, 0.006, 0.01, M.black, 0, 0.15, 0.065, { parent: prn });
  const led = add(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x55ff77 }), 0.07, 0.11, 0.121, { parent: prn });
  add(new THREE.PlaneGeometry(0.14, 0.03), new THREE.MeshBasicMaterial({ map: labelTexture('ORDERS', { w: 256, h: 56, bg: '#2c2f33', fg: '#d0d4da', font: '700 30px Consolas,monospace' }) }), -0.02, 0.1, 0.1205, { parent: prn, cast: false });

  // Prep bench + ticket rail -------------------------------------------------------------
  const benchTop = rbox(1.7, 0.07, 1.1, 0.012, M.butcher, -2.45, L.BENCH - 0.035, -0.22);
  void benchTop;
  surf(-3.3, -1.6, -0.77, L.FRONT, L.BENCH, 'bench');
  for (const [lx, lz] of [[-3.24, -0.72], [-1.66, -0.72], [-3.24, 0.27], [-1.66, 0.27]]) box(0.05, L.BENCH - 0.07, 0.05, M.steel, lx, (L.BENCH - 0.07) / 2, lz);
  box(1.6, 0.025, 1.0, M.steel, -2.45, 0.22, -0.22);
  // flour bin and sacks under the bench
  add(new THREE.CylinderGeometry(0.2, 0.18, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: 0.6 }), -2.0, 0.48, 0.0);
  for (let i = 0; i < 2; i++) rbox(0.4, 0.18, 0.28, 0.05, new THREE.MeshStandardMaterial({ map: labelTexture('FARINA 00', { w: 256, h: 128, bg: '#e6dccb', fg: '#8a2d1c', font: '800 40px Georgia,serif' }), roughness: 0.95 }), -2.9 + i * 0.05, 0.33 + i * 0.18, -0.15);
  // flour dusting on the bench
  const flour = canvas(256), fx = flour.getContext('2d'), frng = makeRng(31);
  for (let i = 0; i < 900; i++) { const a = frng() * 6.283, r = Math.pow(frng(), 0.6) * 118; fx.fillStyle = `rgba(255,255,255,${frng() * 0.35})`; fx.beginPath(); fx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.8, 1 + frng() * 3, 0, 7); fx.fill(); }
  add(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshStandardMaterial({ map: tex(flour), transparent: true, roughness: 1, depthWrite: false }), -2.3, L.BENCH + 0.001, -0.15, { rx: -Math.PI / 2, cast: false });
  // rail on the wall above the bench
  const R = L.rail;
  box(R.x1 - R.x0 + 0.1, 0.035, 0.05, M.chrome, (R.x0 + R.x1) / 2, R.y, R.z);
  box(R.x1 - R.x0 + 0.1, 0.012, 0.012, M.steelDark, (R.x0 + R.x1) / 2, R.y - 0.02, R.z + 0.022);
  for (const bx of [R.x0 - 0.02, R.x1 + 0.02]) box(0.03, 0.06, 0.06, M.steel, bx, R.y, R.z - 0.03);
  // wall shelf with tins and bottles
  box(1.7, 0.03, 0.22, M.steel, -2.45, 1.72, -0.69);
  for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.055, 0.055, 0.15, 20), canMat(i), -3.15 + i * 0.13, 1.81, -0.68);
  for (let i = 0; i < 3; i++) {
    const b = add(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 16), new THREE.MeshStandardMaterial({ color: [0x6b7d1e, 0x3a5a1c, 0x8a6a1a][i], roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }), -2.15 + i * 0.12, 1.86, -0.68);
    add(new THREE.CylinderGeometry(0.012, 0.03, 0.06, 12), b.material, 0, 0.15, 0, { parent: b });
  }
  for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc7261c, roughness: 0.35 }), -1.75 + (i % 2) * 0.09 - 0.05, 1.78 + Math.floor(i / 2) * 0.07, -0.66 + (i % 2) * 0.03);

  // Make table with the trash chute -------------------------------------------------------
  const T = L.trash;
  {
    const sh = new THREE.Shape(); sh.moveTo(-1.6, -0.78); sh.lineTo(0.3, -0.78); sh.lineTo(0.3, L.FRONT); sh.lineTo(-1.6, L.FRONT); sh.closePath();
    const hole = new THREE.Path(); hole.absarc(T.x, -T.z, T.r, 0, Math.PI * 2, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 32 });
    g.rotateX(-Math.PI / 2); g.translate(0, L.COUNTER - 0.04, 0);
    // uv: planar
    const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.6, p.getZ(i) * 0.6);
    add(g, M.steel, 0, 0, 0);
    // backsplash
    box(1.9, 0.12, 0.02, M.steel, -0.65, L.COUNTER + 0.06, -0.77);
    // chute ring + dark throat + label
    add(new THREE.TorusGeometry(T.r, 0.008, 8, 40), M.steelDark, T.x, L.COUNTER, T.z, { rx: Math.PI / 2 });
    add(new THREE.CylinderGeometry(T.r, T.r * 0.9, 0.5, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, side: THREE.BackSide, roughness: 1 }), T.x, L.COUNTER - 0.25, T.z, { cast: false });
    add(new THREE.CircleGeometry(T.r, 32), new THREE.MeshBasicMaterial({ color: 0x050505 }), T.x, L.COUNTER - 0.3, T.z, { rx: -Math.PI / 2, cast: false });
    add(new THREE.PlaneGeometry(0.13, 0.035), new THREE.MeshBasicMaterial({ map: labelTexture('TRASH', { w: 192, h: 52, bg: '#c33', fg: '#fff', font: '800 34px "Segoe UI",sans-serif' }) }), T.x, L.COUNTER + 0.001, T.z + T.r + 0.04, { rx: -Math.PI / 2, cast: false });
  }
  surf(-1.6, 0.3, -0.78, L.FRONT, L.COUNTER, 'counter');
  cabinet(-1.6, 0.3, L.COUNTER);
  // peel home mark: a stencilled outline
  {
    const c = canvas(256), x = c.getContext('2d');
    x.strokeStyle = 'rgba(40,40,40,0.35)'; x.setLineDash([12, 10]); x.lineWidth = 5; roundRect(x, 16, 16, 224, 224, 40); x.stroke();
    x.setLineDash([]); x.fillStyle = 'rgba(40,40,40,0.35)'; x.font = '700 26px "Segoe UI",sans-serif'; x.textAlign = 'center'; x.fillText('PEEL', 128, 136);
    add(new THREE.PlaneGeometry(0.44, 0.44), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false }), L.peelHome.x, L.COUNTER + 0.001, L.peelHome.z, { rx: -Math.PI / 2, cast: false, receive: false });
  }

  // Topping cart ---------------------------------------------------------------------------
  const cart = new THREE.Group(); root.add(cart);
  const cx0 = 0.32, cx1 = 1.54, cz0 = -0.6, cz1 = 0.22, ccx = (cx0 + cx1) / 2, ccz = (cz0 + cz1) / 2;
  // frame with a lip around the bin well
  box(cx1 - cx0, 0.03, 0.05, M.steel, ccx, L.CART - 0.015, cz1 - 0.025, { parent: cart });
  box(cx1 - cx0, 0.03, 0.05, M.steel, ccx, L.CART - 0.015, cz0 + 0.025, { parent: cart });
  box(0.04, 0.03, cz1 - cz0, M.steel, cx0 + 0.02, L.CART - 0.015, ccz, { parent: cart });
  box(0.04, 0.03, cz1 - cz0, M.steel, cx1 - 0.02, L.CART - 0.015, ccz, { parent: cart });
  box(cx1 - cx0, 0.02, 0.025, M.steel, ccx, L.CART - 0.01, -0.19, { parent: cart });
  box(cx1 - cx0 - 0.02, 0.12, cz1 - cz0 - 0.02, M.steelDark, ccx, L.CART - 0.12, ccz, { parent: cart });
  box(cx1 - cx0, 0.025, cz1 - cz0, M.steel, ccx, 0.3, ccz, { parent: cart });
  for (const [lx, lz] of [[cx0 + 0.03, cz0 + 0.03], [cx1 - 0.03, cz0 + 0.03], [cx0 + 0.03, cz1 - 0.03], [cx1 - 0.03, cz1 - 0.03]]) {
    box(0.03, L.CART - 0.2, 0.03, M.steel, lx, (L.CART - 0.2) / 2 + 0.1, lz, { parent: cart });
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 16), M.rubber, lx, 0.05, lz, { parent: cart, rz: Math.PI / 2 });
  }
  // push handle at the front
  add(new THREE.CylinderGeometry(0.014, 0.014, cx1 - cx0 - 0.1, 12), M.chrome, ccx, L.CART + 0.02, cz1 + 0.06, { parent: cart, rz: Math.PI / 2 });
  for (const hx of [cx0 + 0.06, cx1 - 0.06]) box(0.02, 0.05, 0.08, M.chrome, hx, L.CART, cz1 + 0.03, { parent: cart });
  // stock crates on the bottom shelf
  rbox(0.4, 0.16, 0.3, 0.02, new THREE.MeshStandardMaterial({ color: 0xc7261c, roughness: 0.6 }), 0.62, 0.4, -0.2, { parent: cart });
  rbox(0.3, 0.2, 0.3, 0.02, new THREE.MeshStandardMaterial({ map: labelTexture('POMODORI', { w: 256, h: 128, bg: '#c9b48a', fg: '#7a1f12', font: '800 40px Georgia,serif' }), roughness: 0.9 }), 1.15, 0.42, -0.2, { parent: cart });
  surf(cx0, cx1, cz0, cz1, L.CART, 'cart');
  const bins = CART.map((id, i) => {
    const x = L.cartX(i), z = L.cartZ(i), bw = 0.215, bd = 0.33, depth = 0.1;
    const g = new THREE.Group(); g.position.set(x, L.BIN_FLOOR, z); cart.add(g);
    box(bw, 0.004, bd, M.steelDark, 0, 0.002, 0, { parent: g, cast: false });
    box(bw, depth, 0.006, M.steel, 0, depth / 2, bd / 2, { parent: g }); box(bw, depth, 0.006, M.steel, 0, depth / 2, -bd / 2, { parent: g });
    box(0.006, depth, bd, M.steel, bw / 2, depth / 2, 0, { parent: g }); box(0.006, depth, bd, M.steel, -bw / 2, depth / 2, 0, { parent: g });
    const fillMat = new THREE.MeshStandardMaterial({ map: fillTexture(id), roughness: id === 'sauce' ? 0.18 : 0.75 });
    const fill = box(bw - 0.012, 1, bd - 0.012, fillMat, 0, 0.05, 0, { parent: g, cast: false });
    // label on the lip facing you
    const lbl = add(new THREE.PlaneGeometry(0.15, 0.03), new THREE.MeshBasicMaterial({ map: labelTexture(TOPPINGS[id].short, { w: 256, h: 52, bg: '#f7f2e6', fg: '#1d1d1d', font: '800 32px "Segoe UI",sans-serif', border: TOPPINGS[id].color }) }), 0, depth + 0.002, bd / 2 + 0.014, { parent: g, rx: -Math.PI / 2, cast: false });
    void lbl;
    surf(x - bw / 2, x + bw / 2, z - bd / 2, z + bd / 2, L.BIN_FLOOR + 0.06, 'bin', i);
    return { id, i, x, z, w: bw, d: bd, group: g, fill, servings: 8, max: 8, setFill() { const f = clamp(this.servings / this.max, 0, 1); const hh = 0.004 + 0.075 * f; this.fill.scale.y = hh; this.fill.position.y = hh / 2 + 0.004; this.fill.visible = this.servings > 0; } };
  });
  bins.forEach(b => b.setFill());

  // Ovens -------------------------------------------------------------------------------
  const ovenFaceZ = L.OVEN_FACE;
  // brick surround across both ovens
  // only around the oven fronts: a solid slab here would wall off the oven mouths
  for (const [x0, x1] of [[1.56, 1.64], [2.6, 2.66], [3.62, 3.74]]) box(x1 - x0, 2.2, 0.06, M.brick, (x0 + x1) / 2, 1.1, ovenFaceZ - 0.03);
  box(2.18, 0.3, 0.06, M.brick, 2.65, 2.05, ovenFaceZ - 0.03);
  box(2.14, 0.06, 0.32, M.brick, 2.65, 2.2, ovenFaceZ - 0.15);
  // hood
  rbox(2.3, 0.4, 0.75, 0.02, M.steel, 2.65, 2.42, -0.48);
  box(2.2, 0.03, 0.7, M.steelDark, 2.65, 2.21, -0.46, { cast: false });
  // ledge counter in front of the ovens
  counterTop(1.54, 3.76, L.COUNTER, -0.5);
  surf(1.54, 3.76, -0.5, L.FRONT, L.COUNTER, 'counter');
  cabinet(1.54, 3.76, L.COUNTER, -0.5);
  const ovens = L.OVEN_X.map((ox, i) => {
    const g = new THREE.Group(); g.position.set(ox, 0, 0); root.add(g);
    const W = 0.98, mouthB = L.DECK, mouthT = L.MOUTH_TOP, mh = L.MOUTH_HALF;
    // black enamel front with a mouth cut out
    box(W, 0.9 - 0.0, 0.05, M.black, 0, 0.45 + 0.08, ovenFaceZ + 0.025, { parent: g });         // below mouth (cabinet face)
    box(W, 0.55, 0.05, M.black, 0, mouthT + 0.275, ovenFaceZ + 0.025, { parent: g });          // above
    box(W / 2 - mh, mouthT - 0.98, 0.05, M.black, -(mh + (W / 2 - mh) / 2), (mouthT + 0.98) / 2, ovenFaceZ + 0.025, { parent: g });
    box(W / 2 - mh, mouthT - 0.98, 0.05, M.black, (mh + (W / 2 - mh) / 2), (mouthT + 0.98) / 2, ovenFaceZ + 0.025, { parent: g });
    box(W + 0.02, 0.03, 0.07, M.chrome, 0, 1.78, ovenFaceZ + 0.03, { parent: g });
    // name plate + gauge
    add(new THREE.PlaneGeometry(0.3, 0.06), new THREE.MeshBasicMaterial({ map: labelTexture(`DECK ${i + 1}`, { w: 256, h: 52, bg: '#1d1d1f', fg: '#e6c27a', font: '800 30px Georgia,serif' }) }), -0.18, 1.62, ovenFaceZ + 0.052, { parent: g, cast: false });
    const gauge = new THREE.Group(); gauge.position.set(0.24, 1.5, ovenFaceZ + 0.055); g.add(gauge);
    add(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 32), M.chrome, 0, 0, 0, { parent: gauge, rx: Math.PI / 2 });
    add(new THREE.CircleGeometry(0.074, 32), new THREE.MeshBasicMaterial({ map: gaugeTexture() }), 0, 0, 0.011, { parent: gauge, cast: false });
    const needle = new THREE.Group(); needle.position.z = 0.014; gauge.add(needle);
    box(0.006, 0.062, 0.003, new THREE.MeshBasicMaterial({ color: 0xd22 }), 0, 0.026, 0, { parent: needle, cast: false });
    // interior: stone deck, glowing back
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3e, roughness: 0.95, emissive: 0x2a0d00, emissiveIntensity: 0.5 });
    box(mh * 2 + 0.04, 0.03, 0.75, deckMat, 0, mouthB - 0.015, -0.87, { parent: g, cast: false });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff5a10, emissiveIntensity: 0.7, roughness: 1 });
    box(mh * 2 + 0.04, mouthT - mouthB + 0.02, 0.02, glowMat, 0, (mouthB + mouthT) / 2, L.DECK_BACK - 0.03, { parent: g, cast: false });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x241510, emissive: 0x6a1d04, emissiveIntensity: 0.6, roughness: 1 });
    box(0.02, mouthT - mouthB, 0.72, sideMat, -mh - 0.01, (mouthB + mouthT) / 2, -0.86, { parent: g, cast: false });
    box(0.02, mouthT - mouthB, 0.72, sideMat, mh + 0.01, (mouthB + mouthT) / 2, -0.86, { parent: g, cast: false });
    box(mh * 2, 0.02, 0.72, sideMat, 0, mouthT + 0.01, -0.86, { parent: g, cast: false });
    // flame strip along the back of the deck
    const flame = box(mh * 2 - 0.04, 0.012, 0.02, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9 }), 0, mouthB + 0.008, L.DECK_BACK + 0.02, { parent: g, cast: false });
    surf(ox - mh, ox + mh, L.DECK_BACK, ovenFaceZ, L.DECK, 'deck', i);
    // door on a bottom hinge
    const pivot = new THREE.Group(); pivot.position.set(ox, L.HINGE_Y, ovenFaceZ + 0.04); root.add(pivot);
    const dh = L.DOOR_H;
    // a frame round a big glass window, so you can watch the pie brown with the door shut
    const dw = mh * 2 + 0.06, ww = 0.56, wh = 0.2, wy = dh * 0.47, bar = (w, h, x, y) => box(w, h, 0.035, M.black, x, y, 0, { parent: pivot });
    bar(dw, wy - wh / 2, 0, (wy - wh / 2) / 2); bar(dw, dh - wy - wh / 2, 0, (dh + wy + wh / 2) / 2);
    bar((dw - ww) / 2, wh, -(ww + dw) / 4, wy); bar((dw - ww) / 2, wh, (ww + dw) / 4, wy);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x3a2416, emissive: 0xff6a1a, emissiveIntensity: 0.05, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false });
    add(new THREE.PlaneGeometry(ww, wh), winMat, 0, wy, 0.0, { parent: pivot, cast: false, receive: false });
    for (const [w, h, x, y] of [[ww + 0.02, 0.012, 0, wy + wh / 2], [ww + 0.02, 0.012, 0, wy - wh / 2], [0.012, wh, ww / 2, wy], [0.012, wh, -ww / 2, wy]]) box(w, h, 0.04, M.chrome, x, y, 0.002, { parent: pivot, cast: false });
    const handle = add(new THREE.CylinderGeometry(0.014, 0.014, 0.6, 12), M.chrome, 0, dh - 0.03, 0.07, { parent: pivot, rz: Math.PI / 2 });
    for (const hx of [-0.28, 0.28]) box(0.022, 0.022, 0.06, M.chrome, hx, dh - 0.03, 0.04, { parent: pivot });
    // warm white light inside so the crust colour reads true
    const inLight = new THREE.PointLight(0xfff0dc, 0, 1.0, 1.4); inLight.position.set(ox, mouthT - 0.05, -0.78); root.add(inLight);
    const light = new THREE.PointLight(0xff7a2a, 0, 1.6, 1.8); light.position.set(ox, 1.12, -0.42); root.add(light);
    // "out of order" tape across oven 2 until it is fixed
    let tape = null;
    if (i === 1) {
      tape = new THREE.Group(); tape.position.set(ox, 1.2, ovenFaceZ + 0.1); root.add(tape);
      const tm = new THREE.MeshStandardMaterial({ map: tapeTexture(), roughness: 0.7, transparent: true });
      for (const a of [-0.32, 0.32]) add(new THREE.PlaneGeometry(0.95, 0.07), tm, 0, 0, a > 0 ? 0.002 : 0, { parent: tape, rz: a, cast: false });
      add(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshStandardMaterial({ map: labelTexture('OUT OF ORDER', { w: 256, h: 150, bg: '#fffbe8', fg: '#b01c10', font: '800 30px "Segoe UI",sans-serif', border: '#b01c10' }) }), 0, 0.2, 0.004, { parent: tape, cast: false });
    }
    return { i, x: ox, group: g, pivot, handle, angle: 0, vel: 0, temp: 1, glowMat, sideMat, winMat, deckMat, flame, light, inLight, needle, tape, locked: i === 1, openFor: 0 };
  });

  // Pass window ----------------------------------------------------------------------------
  const PS = L.pass;
  counterTop(3.76, 6.0, L.COUNTER, -0.42);
  surf(3.76, 6.0, -0.42, L.FRONT, L.COUNTER, 'counter');
  cabinet(3.76, 6.0, L.COUNTER, -0.42);
  box(PS.x1 - PS.x0 + 0.04, 0.03, PS.z1 - PS.z0 + 0.02, M.steel, (PS.x0 + PS.x1) / 2, L.PASS - 0.015, (PS.z0 + PS.z1) / 2);
  surf(PS.x0, PS.x1, PS.z0, PS.z1, L.PASS, 'pass');
  // heat lamp: housing with glowing elements, and a strip of red light
  rbox(1.42, 0.07, 0.24, 0.015, M.steel, 5.0, 1.66, -0.72);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff4a1a });
  for (let i = 0; i < 4; i++) box(0.28, 0.012, 0.03, lampMat, 4.55 + i * 0.3, 1.62, -0.72, { cast: false });
  const lampLight = new THREE.SpotLight(0xff5a28, 3.5, 1.6, 0.9, 0.6, 1.4); lampLight.position.set(5.0, 1.6, -0.72); lampLight.target.position.set(5.0, 1.0, -0.72); root.add(lampLight, lampLight.target);
  // bell
  const bellG = new THREE.Group(); bellG.position.set(L.bell.x, L.COUNTER, L.bell.z); root.add(bellG);
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.012, 24), M.black, 0, 0.006, 0, { parent: bellG });
  const dome = add(new THREE.SphereGeometry(0.042, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.brass, 0, 0.014, 0, { parent: bellG });
  add(new THREE.CylinderGeometry(0.006, 0.008, 0.02, 10), M.chrome, 0, 0.065, 0, { parent: bellG });
  add(new THREE.SphereGeometry(0.01, 10, 8), M.chrome, 0, 0.078, 0, { parent: bellG });
  // ticket spike for the paid ones (decoration)
  add(new THREE.CylinderGeometry(0.002, 0.003, 0.14, 6), M.chrome, 5.82, L.COUNTER + 0.07, -0.25);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16), M.black, 5.82, L.COUNTER + 0.005, -0.25);
  // stacked pizza boxes on the counter end
  for (let i = 0; i < 6; i++) rbox(0.38, 0.045, 0.38, 0.004, new THREE.MeshStandardMaterial({ map: i === 5 ? boxTopTexture() : null, color: i === 5 ? 0xffffff : 0xc9a272, roughness: 0.9 }), 4.0, L.COUNTER + 0.023 + i * 0.046, 0.05 + (i % 2) * 0.006, { ry: (i % 3) * 0.03 });

  // Dining room through the pass ---------------------------------------------------------------
  const dine = new THREE.Group(); root.add(dine);
  const woodFloor = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.6 });
  add(new THREE.PlaneGeometry(5, 4.5), woodFloor, 5.0, 0.001, -3.2, { rx: -Math.PI / 2, parent: dine, cast: false });
  add(new THREE.PlaneGeometry(5, 3), new THREE.MeshStandardMaterial({ color: 0x6e2b22, roughness: 0.9 }), 5.0, 1.5, -5.2, { parent: dine, cast: false });
  add(new THREE.PlaneGeometry(4.5, 3), new THREE.MeshStandardMaterial({ color: 0x5e2620, roughness: 0.9 }), 2.6, 1.5, -3.2, { parent: dine, ry: Math.PI / 2, cast: false });
  add(new THREE.PlaneGeometry(4.5, 3), new THREE.MeshStandardMaterial({ color: 0x5e2620, roughness: 0.9 }), 7.4, 1.5, -3.2, { parent: dine, ry: -Math.PI / 2, cast: false });
  add(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshBasicMaterial({ map: labelTexture('Peel Out', { w: 512, h: 150, bg: null, fg: '#ffd7a8', font: 'italic 800 96px Georgia,serif', glow: '#ff6a2a' }), transparent: true }), 5.0, 2.0, -5.18, { parent: dine, cast: false });
  const cloth = new THREE.MeshStandardMaterial({ map: checkTexture(), roughness: 0.9 });
  const chairM = new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.7 });
  for (const [tx, tz] of [[4.1, -2.6], [5.9, -2.8], [5.0, -4.2], [3.4, -4.0], [6.6, -4.3]]) {
    add(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 24), cloth, tx, 0.42, tz, { parent: dine });
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xff9a3a, emissiveIntensity: 1.2 }), tx, 0.78, tz, { parent: dine, cast: false });
    for (const a of [0, 2.1, 4.2]) box(0.32, 0.5, 0.32, chairM, tx + Math.cos(a) * 0.62, 0.25, tz + Math.sin(a) * 0.62, { parent: dine });
  }
  // string lights
  const bulbM = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (let i = 0; i < 18; i++) { const t = i / 17; add(new THREE.SphereGeometry(0.025, 8, 6), bulbM, 2.8 + t * 4.4, 2.5 - Math.sin(t * Math.PI) * 0.25, -1.6 - Math.sin(t * 6.283) * 0.15, { parent: dine, cast: false }); }
  const dineLight = new THREE.PointLight(0xff9a50, 6, 7, 1.4); dineLight.position.set(5.0, 2.3, -3.0); dine.add(dineLight);

  // Lights -------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x4a3426, 0.65); root.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2de, 1.35);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.0, right: 2.0, top: 2.0, bottom: -2.0, near: 0.5, far: 8 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  root.add(key, key.target);
  // a warm fill from the ceiling fixtures above each station
  const fills = [-2.5, 0.3, 4.9].map(x => { const p = new THREE.PointLight(0xffe2bc, 4, 3.6, 1.5); p.position.set(x, 2.6, 0.0); root.add(p); return p; });
  // ceiling fixtures you can glimpse at the top of the view
  for (const x of [-4.8, -2.5, 0.3, 4.9]) {
    rbox(0.9, 0.05, 0.16, 0.02, M.steel, x, 2.85, -0.1, { cast: false });
    box(0.84, 0.01, 0.12, new THREE.MeshBasicMaterial({ color: 0xfff4e2 }), x, 2.82, -0.1, { cast: false });
  }

  function counterTop(x0, x1, top, z0 = -0.78) {
    const g = new THREE.BoxGeometry(x1 - x0, 0.04, L.FRONT - z0);
    const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + (x0 + x1) / 2) * 0.6, p.getZ(i) * 0.6 + p.getY(i));
    add(g, M.steel, (x0 + x1) / 2, top - 0.02, (z0 + L.FRONT) / 2);
    if (z0 < -0.7) box(x1 - x0, 0.12, 0.02, M.steel, (x0 + x1) / 2, top + 0.06, z0 + 0.01);
  }

  const kitchen = {
    root, M, surfaces, ovens, doors, bins, bell: { group: bellG, dome, x: L.bell.x, z: L.bell.z, ring: 0 }, printer: { group: prn, led },
    lights: { key, hemi, coolLight, lampLight, fills, dineLight }, ledMat,
    // Highest surface under (x, z) that is at or below y.
    topAt(x, z, y = 9) {
      let best = 0, kind = 'floor', s0 = null;
      const inBin = bins.some(b => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
      for (const s of surfaces) {
        if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1 || s.top > y + 0.03) continue;
        if (inBin && s.kind === 'cart') continue;
        if (s.kind === 'deck' && ovens[s.id].locked) continue;
        if (s.top > best) { best = s.top; kind = s.kind; s0 = s; }
      }
      const tr = L.trash;
      if (Math.hypot(x - tr.x, z - tr.z) < tr.r - 0.01 && best <= L.COUNTER + 0.001) return { top: 0.5, kind: 'trash', s: null };
      return { top: best, kind, s: s0 };
    },
    update(dt, camX, t) {
      key.position.set(camX + 0.6, 3.8, 1.9); key.target.position.set(camX, 0.9, -0.3); key.target.updateMatrixWorld();
      for (const o of ovens) {
        const glow = o.locked ? 0.05 : o.temp;
        const flick = 0.92 + Math.sin(t * 13 + o.i * 3) * 0.05 + Math.sin(t * 31 + o.i) * 0.03;
        o.glowMat.emissiveIntensity = 0.25 + glow * 1.1 * flick;
        o.sideMat.emissiveIntensity = 0.15 + glow * 0.6;
        o.deckMat.emissiveIntensity = 0.2 + glow * 0.5;
        o.flame.material.opacity = o.locked ? 0 : clamp(glow, 0, 1) * flick;
        o.winMat.emissiveIntensity = 0.03 + glow * 0.1 * flick;
        o.inLight.intensity = o.locked ? 0 : (0.12 + glow * 0.38) * flick;
        const open = Math.sin(o.angle);
        o.light.intensity = o.locked ? 0 : (0.2 + open * 1.1) * glow * flick;
        o.needle.rotation.z = 2.1 - clamp(glow, 0, 1.15) * 3.7;
      }
      const coolerOpen = Math.max(doors[0].angle, doors[1].angle);
      coolLight.intensity = clamp(coolerOpen * 3, 0, 2.2);
    },
  };
  return kitchen;
}

// ------------------------------------------------------------------------------------------
function canMat(i = 0) {
  const c = canvas(256, 128), x = c.getContext('2d');
  const col = ['#c4281d', '#2d6b3a', '#d8b23a', '#c4281d', '#264f8a', '#7a2a1f'][i % 6];
  x.fillStyle = col; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#f7efdc'; x.fillRect(0, 34, 256, 60);
  x.fillStyle = col; x.font = '800 30px Georgia,serif'; x.textAlign = 'center'; x.fillText(['POMODORO', 'BASILICO', 'OLIO', 'SAN MARZ.', 'SALE', 'PEPE'][i % 6], 128, 76);
  const m = new THREE.MeshStandardMaterial({ map: tex(c), metalness: 0.45, roughness: 0.4 });
  return m;
}

function gaugeTexture() {
  const c = canvas(256), x = c.getContext('2d');
  x.fillStyle = '#f7f1e3'; x.beginPath(); x.arc(128, 128, 126, 0, 7); x.fill();
  // a band: blue (cold) to green (ready) to red
  const seg = (a0, a1, col) => { x.strokeStyle = col; x.lineWidth = 20; x.beginPath(); x.arc(128, 128, 96, a0, a1); x.stroke(); };
  // the needle sweeps from 2.1 rad (cold) through -1.6; map to canvas angles
  const A = v => -Math.PI / 2 - (2.1 - v * 3.7);
  seg(A(0), A(0.6), '#5b8fd6'); seg(A(0.6), A(0.85), '#e0b13a'); seg(A(0.85), A(1.15), '#46a24e');
  x.fillStyle = '#222'; x.font = '700 30px Georgia,serif'; x.textAlign = 'center'; x.fillText('°F', 128, 190);
  x.font = '700 22px Georgia,serif'; x.fillText('650', 200, 140); x.fillText('300', 60, 200);
  x.fillStyle = '#333'; x.beginPath(); x.arc(128, 128, 10, 0, 7); x.fill();
  return tex(c);
}

function tapeTexture() {
  const c = canvas(512, 40), x = c.getContext('2d');
  x.fillStyle = '#f2c61f'; x.fillRect(0, 0, 512, 40);
  x.fillStyle = '#1b1b1b'; for (let i = -2; i < 26; i++) { x.beginPath(); x.moveTo(i * 24, 40); x.lineTo(i * 24 + 12, 40); x.lineTo(i * 24 + 32, 0); x.lineTo(i * 24 + 20, 0); x.fill(); }
  return tex(c);
}

function boxTopTexture() {
  const c = canvas(256), x = c.getContext('2d');
  x.fillStyle = '#d2ad7c'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#a3261b'; x.lineWidth = 8; x.beginPath(); x.arc(128, 128, 80, 0, 7); x.stroke();
  x.fillStyle = '#a3261b'; x.font = 'italic 800 46px Georgia,serif'; x.textAlign = 'center'; x.fillText('Peel', 128, 120); x.fillText('Out', 128, 166);
  return tex(c);
}

// What each bin looks like from above.
function fillTexture(id) {
  const c = canvas(128, 192), x = c.getContext('2d'), rng = makeRng(id.length * 97 + id.charCodeAt(0));
  const T = TOPPINGS[id];
  const base = { sauce: '#9e1d12', cheese: '#efe4c4', pepperoni: '#7a2015', sausage: '#5a3220', mushroom: '#a88f6c', pepper: '#2c5c1f', onion: '#e8d9e6', olive: '#1a1714', pineapple: '#d9a92c', basil: '#2a5a28' }[id];
  x.fillStyle = base; x.fillRect(0, 0, 128, 192);
  const n = { sauce: 0, cheese: 900, pepperoni: 40, sausage: 220, mushroom: 60, pepper: 90, onion: 80, olive: 120, pineapple: 80, basil: 45 }[id];
  for (let i = 0; i < n; i++) {
    const px = rng() * 128, py = rng() * 192, a = rng() * 6.28;
    x.save(); x.translate(px, py); x.rotate(a);
    switch (id) {
      case 'cheese': x.fillStyle = `hsl(48,${55 + rng() * 25}%,${82 + rng() * 12}%)`; x.fillRect(-6, -1.2, 12, 2.4); break;
      case 'pepperoni': x.fillStyle = '#b4301f'; x.beginPath(); x.arc(0, 0, 13, 0, 7); x.fill(); x.fillStyle = 'rgba(255,220,200,0.35)'; for (let k = 0; k < 6; k++) { x.beginPath(); x.arc((rng() - 0.5) * 16, (rng() - 0.5) * 16, 1.5, 0, 7); x.fill(); } x.strokeStyle = '#6a1a10'; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, 13, 0, 7); x.stroke(); break;
      case 'sausage': x.fillStyle = `hsl(20,${35 + rng() * 15}%,${28 + rng() * 14}%)`; x.beginPath(); x.arc(0, 0, 3 + rng() * 3, 0, 7); x.fill(); break;
      case 'mushroom': x.fillStyle = '#e6d6b8'; x.beginPath(); x.ellipse(0, -3, 10, 6, 0, Math.PI, 0); x.fill(); x.fillRect(-3, -3, 6, 9); x.strokeStyle = '#7d6040'; x.lineWidth = 1.2; x.beginPath(); x.ellipse(0, -3, 10, 6, 0, Math.PI, 0); x.stroke(); break;
      case 'pepper': x.strokeStyle = '#4ea33a'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 9, 0, 2.6); x.stroke(); break;
      case 'onion': x.strokeStyle = '#a34a8a'; x.lineWidth = 2.5; x.beginPath(); x.arc(0, 0, 9, 0, 2.8); x.stroke(); break;
      case 'olive': x.strokeStyle = '#2f2a24'; x.lineWidth = 3.5; x.beginPath(); x.arc(0, 0, 5, 0, 7); x.stroke(); break;
      case 'pineapple': x.fillStyle = `hsl(46,85%,${55 + rng() * 15}%)`; x.fillRect(-6, -5, 12, 10); break;
      case 'basil': x.fillStyle = `hsl(115,${45 + rng() * 15}%,${28 + rng() * 10}%)`; x.beginPath(); x.ellipse(0, 0, 14, 7, 0, 0, 7); x.fill(); x.strokeStyle = 'rgba(200,255,200,0.3)'; x.beginPath(); x.moveTo(-12, 0); x.lineTo(12, 0); x.stroke(); break;
    }
    x.restore();
  }
  if (id === 'sauce') { for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(255,${120 + rng() * 60},${90 + rng() * 40},${0.08 + rng() * 0.1})`; x.beginPath(); x.ellipse(rng() * 128, rng() * 192, 10 + rng() * 20, 4 + rng() * 6, rng() * 3, 0, 7); x.fill(); } }
  void T;
  return tex(c);
}
