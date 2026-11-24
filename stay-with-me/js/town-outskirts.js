// What lies beyond the last street: a terrain skirt that stays flat under the town and rises into forested hills
// (with valleys cut for the roads that leave town and for the river), conifers on it (real models near the edge,
// crossed-card impostors further out), and a mountain backdrop drawn at infinity that fades with the weather.
// Tuning: hill height / onset in terrainHeight(), tree spacing in buildOutskirts(), ridge profile in mountains().

import * as THREE from 'three';
import { makeRng, fbm2, smooth, lerp } from './util.js';
import { U } from './gfx.js';
import { MB, pointInPoly, distToSeg } from './town-geo.js';
import { GL } from './town-mat.js';
import { BOUNDS, riverX, riverHW } from './town-layout.js';
import { CUT, cutUV } from './town-atlas.js';

const FLAT = { x0: -1075, x1: 1075, z0: -770, z1: 735 };
const outside = (x, z) => Math.hypot(Math.max(FLAT.x0 - x, 0, x - FLAT.x1), Math.max(FLAT.z0 - z, 0, z - FLAT.z1));

export function makeTerrain(T) {
  const L = T.L, roads = [];
  for (const e of L.edges) { const a = L.nodes[e.a], b = L.nodes[e.b]; if (outside(a.x, a.z) > 0 || outside(b.x, b.z) > 0) roads.push([a.x, a.z, b.x, b.z, e.width / 2]); }
  const roadDist = (x, z) => { let d = 1e9; for (const r of roads) { const q = distToSeg(x, z, r[0], r[1], r[2], r[3]) - r[4]; if (q < d) d = q; } return d; };
  const height = (x, z) => {
    const o = outside(x, z), dr = Math.abs(x - riverX(z)) - riverHW(z);
    let h = -0.08;
    if (o > 0) {
      const t = smooth(15, 760, o), n = fbm2(x / 760 + 31.7, z / 760 + 11.3, 5, 77), n2 = fbm2(x / 190 + 3.1, z / 190 + 8.2, 3, 21);
      let hill = (Math.pow(t, 1.25) * (40 + 330 * n) + t * 26 * (n2 - 0.4)) * smooth(0, 60, o);
      hill *= smooth(6, 150, roadDist(x, z)); hill *= smooth(4, 210, dr);
      h += Math.max(0, hill);
    }
    if (dr < 9) h = Math.min(h, lerp(-3.4, h, smooth(-2, 9, dr)));
    return h;
  };
  return { height, roadDist, outside };
}

export function buildOutskirts(T, M, group) {
  const L = T.L, ter = T.terrain = makeTerrain(T), rng = makeRng(T.seed * 13 + 1);
  // --- terrain mesh on a grid that is fine near town and stretches outwards
  const axis = (lo, hi, reach) => { const a = []; for (let v = lo; v <= hi; v += 13) a.push(v); let st = 13, v = hi; while (v < reach) { st *= 1.16; v += st; a.push(v); } st = 13; v = lo; while (v > -reach) { st *= 1.16; v -= st; a.unshift(v); } return a; };
  const xs = axis(-1260, 1260, 3900), zs = axis(-960, 960, 3500), nx = xs.length, nz = zs.length;
  const inBlock = (x, z) => { if (x < -1045 || x > 1045 || z < -735 || z > 700) return false; for (const b of L.blocks) { const bb = b.bb; if (x < bb.x0 - 6 || x > bb.x1 + 6 || z < bb.z0 - 6 || z > bb.z1 + 6) continue; if (pointInPoly(x, z, b.outer)) return true; } return false; };
  const hs = new Float32Array(nx * nz), flag = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { hs[j * nx + i] = ter.height(xs[i], zs[j]); flag[j * nx + i] = inBlock(xs[i], zs[j]) ? 1 : 0; }
  const mb = new MB(false); mb.lay(GL.grass);
  const vid = new Int32Array(nx * nz).fill(-1);
  const vert = (i, j) => {
    const k = j * nx + i; if (vid[k] >= 0) return vid[k];
    const x = xs[i], z = zs[j], h = hs[k], hx = hs[j * nx + Math.min(nx - 1, i + 1)] - hs[j * nx + Math.max(0, i - 1)], hz = hs[Math.min(nz - 1, j + 1) * nx + i] - hs[Math.max(0, j - 1) * nx + i];
    const dx = xs[Math.min(nx - 1, i + 1)] - xs[Math.max(0, i - 1)], dz = zs[Math.min(nz - 1, j + 1)] - zs[Math.max(0, j - 1)];
    let nxn = -hx / dx, nzn = -hz / dz, l = Math.hypot(nxn, 1, nzn);
    const o = ter.outside(x, z), far = smooth(25, 170, o), wild = fbm2(x / 90, z / 90, 3, 5);
    // lawn green near town, darker and bluer under the forest
    const r = lerp(lerp(206, 232, wild), 112, far), g = lerp(lerp(222, 240, wild), 122, far), b = lerp(lerp(182, 214, wild), 132, far);
    mb.col(r, g, b); return vid[k] = mb.v(x, h, z, nxn / l, 1 / l, nzn / l, x, z);
  };
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    if (flag[j * nx + i] && flag[j * nx + i + 1] && flag[(j + 1) * nx + i] && flag[(j + 1) * nx + i + 1]) continue;
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1); mb.tri(a, c, b); mb.tri(a, d, c);
  }
  const tg = mb.geometry(), tm = new THREE.Mesh(tg, M.ground); tm.receiveShadow = true; tm.name = 'terrain'; tm.matrixAutoUpdate = false; group.add(tm);
  let tris = tg.index.count / 3;

  // --- forest
  const noTree = (x, z) => Math.abs(x - riverX(z)) < riverHW(z) + 7 || ter.roadDist(x, z) < 7 || T.surf.at(x, z) > 1;
  const imp = [];
  const scatter = (step, o0, o1, f) => {
    for (let z = -2700; z <= 2700; z += step) for (let x = -3000; x <= 3000; x += step) {
      const px = x + rng.r(-0.75, 0.75) * step, pz = z + rng.r(-0.75, 0.75) * step, o = ter.outside(px, pz);
      if (o < o0 || o >= o1) continue; f(px, pz, o);
    }
  };
  // inside the town rectangle but outside every street: meadow with stands of trees (north-east flats, river margins)
  for (let z = FLAT.z0 + 8; z < FLAT.z1; z += 13) for (let x = FLAT.x0 + 8; x < FLAT.x1; x += 13) {
    const px = x + rng.r(-5, 5), pz = z + rng.r(-5, 5); if (T.surf.at(px, pz) !== 1 || inBlock(px, pz) || noTree(px, pz)) continue;
    if (fbm2(px / 120, pz / 120, 3, 9) < 0.5 && rng.chance(0.85)) continue;
    const near = [[2, 0], [-2, 0], [0, 2], [0, -2], [5, 5], [-5, -5]].every(q => T.surf.at(px + q[0], pz + q[1]) === 1); if (!near) continue;
    T.trees.push({ x: px, z: pz, y: ter.height(px, pz), kind: rng.chance(0.25) ? rng.pick(['alder', 'maple', 'birch']) : 'pine', s: rng.r(0.8, 1.35) });
  }
  scatter(13, 0.01, 75, (x, z) => { if (noTree(x, z) || (fbm2(x / 150, z / 150, 3, 9) < 0.36 && rng.chance(0.8))) return; T.trees.push({ x, z, y: ter.height(x, z) - 0.2, kind: rng.chance(0.12) ? 'alder' : 'pine', s: rng.r(0.85, 1.5), noCollide: Math.abs(x) > BOUNDS.maxX + 25 || Math.abs(z) > BOUNDS.maxZ + 25 }); });
  for (const r of L.edges) { const a = L.nodes[r.a], b = L.nodes[r.b]; if (ter.outside(a.x, a.z) <= 60 && ter.outside(b.x, b.z) <= 60) continue; for (let s = 0; s < r.length; s += 14) for (const sd of [-1, 1]) { const off = r.width / 2 + rng.r(7, 26), x = a.x + r.dir.x * s - r.dir.z * sd * off, z = a.z + r.dir.z * s + r.dir.x * sd * off; if (ter.outside(x, z) < 75 || noTree(x, z)) continue; T.trees.push({ x, z, y: ter.height(x, z) - 0.2, kind: 'pine', s: rng.r(0.9, 1.5), noCollide: true }); } }
  // far forest: camera-facing conifer billboards, dense enough that the hills read as one dark canopy with a ragged
  // treeline, thinning and growing with distance. Occasional giants and gaps keep the silhouette from being regular.
  const big = () => rng.chance(0.08) ? 1.45 : rng.chance(0.25) ? 0.72 : 1, gap = (x, z) => fbm2(x / 210 + 5, z / 210 + 9, 3, 55) < 0.3 && rng.chance(0.75);
  scatter(10, 75, 420, (x, z, o) => { if (!noTree(x, z) && !gap(x, z)) imp.push([x, z, rng.r(17, 27) * big(), o]); });
  scatter(15.5, 420, 950, (x, z, o) => { if (!noTree(x, z) && !gap(x, z)) imp.push([x, z, rng.r(24, 36) * big(), o]); });
  scatter(26, 950, 1700, (x, z, o) => { if (!noTree(x, z)) imp.push([x, z, rng.r(36, 52) * big(), o]); });
  const ig = v => { const m = new MB(false), uv = cutUV(v ? CUT.impB : CUT.impA); m.col(205, 215, 205).lay(200); const P = (x, y) => m.v(x, y, 0, 0, 1, 0, uv.u0 + (uv.u1 - uv.u0) * (0.5 + x / 0.5), uv.v0 + (uv.v1 - uv.v0) * y), q = [P(-0.22, 0), P(0.22, 0), P(0.19, 0.22), P(0.02, 1), P(-0.02, 1), P(-0.19, 0.22)]; m.tri(q[0], q[1], q[2]); m.tri(q[0], q[2], q[5]); m.tri(q[5], q[2], q[3]); m.tri(q[5], q[3], q[4]); return m.geometry(); };
  const geos = [ig(0), ig(1)], buckets = new Map();
  for (const t of imp) { const sec = Math.floor((Math.atan2(t[1], t[0]) + Math.PI) / (Math.PI * 2) * 12) % 12, v = rng.chance(0.5) ? 0 : 1, k = sec * 2 + v; let b = buckets.get(k); if (!b) buckets.set(k, b = { v, list: [] }); b.list.push(t); }
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  for (const b of buckets.values()) {
    const im = new THREE.InstancedMesh(geos[b.v], M.cutBB, b.list.length); im.name = 'forest';
    b.list.forEach((t, i) => { pos.set(t[0], ter.height(t[0], t[1]) - 0.8, t[1]); sc.set(t[2], t[2] * rng.r(0.9, 1.15), t[2]); mtx.compose(pos, q, sc); im.setMatrixAt(i, mtx); const k = rng.r(0.55, 0.95); col.setRGB(k * rng.r(0.82, 1.0), k, k * rng.r(0.8, 1.02)); im.setColorAt(i, col); });
    im.castShadow = false; im.receiveShadow = false; im.computeBoundingSphere(); im.matrixAutoUpdate = false; group.add(im); tris += 4 * b.list.length;
  }
  group.add(mountains());
  T.outStats = { impostors: imp.length, terrainTris: tg.index.count / 3 };
  return tris;
}

// Two jagged ridgelines on a cylinder, drawn at the far plane like the sky so the game's far clip does not matter.
function mountains() {
  const N = 220, pos = [], dat = [], idx = [];
  for (let layer = 0; layer < 2; layer++) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, n = fbm2(i / N * 9, layer * 5.3, 5, 31 + layer * 7, 9), n2 = fbm2(i / N * 40, 2.2 + layer, 3, 5, 40);
      const top = layer ? 0.085 + 0.15 * n + 0.03 * n2 : 0.05 + 0.085 * n + 0.02 * n2;      // tangent of elevation angle
      const x = Math.cos(a), z = Math.sin(a);
      pos.push(x, -0.02, z, x, top, z); dat.push(layer, 0, layer, top);
    }
    for (let i = 0; i < N; i++) { const p = base + i * 2; idx.push(p, p + 1, p + 3, p, p + 3, p + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDat', new THREE.Float32BufferAttribute(dat, 2)); g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uFogC: { value: new THREE.Color() }, uVis: { value: 0.5 }, uNight: U.uNight }, side: THREE.DoubleSide, depthWrite: false, fog: false,
    vertexShader: 'attribute vec2 aDat; varying vec2 vD; varying vec3 vP; void main(){ vD=aDat; vP=position; vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0); gl_Position=p.xyww; }',
    fragmentShader: `uniform vec3 uFogC; uniform float uVis,uNight; varying vec2 vD; varying vec3 vP;
      void main(){ float lay=vD.x, h=vP.y; vec3 rock=mix(vec3(0.10,0.13,0.15),vec3(0.16,0.19,0.23),lay); vec3 snow=vec3(0.75,0.8,0.86);
        float snowLine=mix(0.125,0.15,lay); float sn=smoothstep(snowLine,snowLine+0.05,h-0.014*abs(sin(vP.x*37.0)+sin(vP.z*53.0)+sin((vP.x+vP.z)*91.0)));
        vec3 c=mix(rock,snow,sn*lay); c=mix(c,vec3(0.07,0.11,0.09),(1.0-lay)*0.6);
        float v=pow(max(uVis,0.0),0.7)*mix(0.8,0.55,lay)*(0.25+0.75*smoothstep(0.0,max(vD.y,0.02),h)); gl_FragColor=vec4(mix(uFogC,c*mix(1.1,0.04,uNight),v),1.0); }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -999; mesh.name = 'mountains';
  mesh.onBeforeRender = (r, scene) => { const f = scene.fog; if (f) { m.uniforms.uFogC.value.copy(f.color); const k = f.density * 1300; m.uniforms.uVis.value = Math.exp(-k * k); } };
  return mesh;
}
