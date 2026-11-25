// Halloran Falls: the drivable town. buildTown() generates everything procedurally from a seed and returns the Town
// object described in the module brief (group, road graph, signals, surface lookup, colliders, places, addresses,
// lamps, parking, spawn, map). Sub-modules: town-layout (street plan + graph), town-mat (materials), town-roads
// (carriageways, sidewalks, river, bridges), town-lots/-buildings (what stands on the blocks; facade relief such as
// sills, cornice brackets, fire escapes and window units goes into near-only 'trim' chunks), town-props (street
// furniture, trees with a near and a far model per region, signals, night lighting), town-outskirts (terrain, forest,
// mountains), town-map (GPS sheet). Draw distances of the fine-detail chunks are in FAR below; tree LOD in update().
//
// Conventions: +X east, +Z south, Y up, roads at y = 0, sidewalks at 0.15. Every `heading` is a yaw in radians with
// forward = (sin h, 0, cos h). Lane i (0 nearest the centre line) for travel along d is the centreline offset to the
// right by median/2 + (i + 0.5) * laneWidth, right = (-d.z, d.x).

import * as THREE from 'three';
import { G } from './gfx.js';
import { makeRng } from './util.js';
import { buildLayout, signalState, BOUNDS } from './town-layout.js';
import { Chunks, SurfGrid, Colliders, SURF_NAME, obb, obbOverlap, pointInPoly } from './town-geo.js';
import { buildMaterials } from './town-mat.js';
import { buildRoads } from './town-roads.js';
import { drawMap } from './town-map.js';
import { initLots, buildLots } from './town-lots.js';
import { buildPlaces } from './town-places.js';
import { buildOutskirts } from './town-outskirts.js';
import { buildStreetscape, buildTrees, buildNightFx } from './town-props.js';
import { SignAtlas, buildCutAtlas, makeSignMaterial, makeCutMaterial } from './town-atlas.js';

const tick = () => new Promise(r => setTimeout(r, 0));

export async function buildTown(opts = {}) {
  const { seed = 1407, onProgress = () => {} } = opts;
  const t0 = performance.now(), step = async (f, label) => { onProgress(f, label); await tick(); };
  await step(0.02, 'Surveying streets');
  const L = buildLayout();
  const T = {
    L, seed, rng: makeRng(seed), chunks: new Chunks(), colliders: new Colliders(), bridges: [],
    surf: new SurfGrid(BOUNDS.minX - 120, BOUNDS.minZ - 120, BOUNDS.maxX + 120, BOUNDS.maxZ + 120, 0.5),
    places: {}, addresses: [], parking: [], lamps: [], footprints: [], greens: [], lots: [], waters: [], trees: [], mailboxes: [], lampInfo: [], glows: [],
    atlas: new SignAtlas(4096),
  };
  T.surf.d.fill(1);
  await step(0.06, 'Mixing materials');
  const M = T.M = buildMaterials(G.renderer, { texSize: opts.texSize || 1024, aniso: G.q?.aniso || 8 });
  await step(0.15, 'Paving roads');
  buildRoads(T);
  await step(0.3, 'Building blocks');
  initLots(T); buildPlaces(T);
  buildLots(T);
  await step(0.55, 'Street furniture');
  buildStreetscape(T);

  await step(0.9, 'Raising the town');
  const group = new THREE.Group(); group.name = 'HalloranFalls';
  const stats = { tris: 0, meshes: 0 }, small = [];
  let cullT = 0;
  const aniso = G.q?.aniso || 8;
  M.sign = makeSignMaterial(T.atlas.texture(aniso)); M.cut = makeCutMaterial(buildCutAtlas(aniso), M.sh); M.cutBB = makeCutMaterial(M.cut.map, M.sh, true);
  const MAT = { road: M.road, ground: M.ground, decal: M.decal, facade: M.facade, plain: M.plain, trim: M.plain, sign: M.sign, cut: M.cut };
  const FAR = { cut: 520, sign: 520, decal: 520, trim: 190 };       // draw distance of the fine-detail chunk kinds
  for (const c of T.chunks.finish()) {
    const m = new THREE.Mesh(c.geometry, MAT[c.kind]); m.name = c.kind;
    m.receiveShadow = c.kind !== 'sign'; m.castShadow = c.kind === 'facade' || c.kind === 'plain' || c.kind === 'cut' || c.kind === 'trim';
    m.matrixAutoUpdate = false; group.add(m); stats.tris += c.tris; stats.meshes++;
    if (FAR[c.kind]) { const s = c.geometry.boundingSphere; small.push({ m, x: s.center.x, z: s.center.z, r: s.radius, far: FAR[c.kind] }); }
  }
  if (T.waterGeo) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T.waterGeo.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(T.waterGeo.uv, 2)); g.setIndex(T.waterGeo.idx); g.computeVertexNormals();
    const w = new THREE.Mesh(g, M.water); w.receiveShadow = true; w.name = 'river'; group.add(w);
  }
  await step(0.94, 'Planting the hills');
  stats.tris += buildOutskirts(T, M, group);
  stats.tris += buildTrees(T, M, group);
  buildNightFx(T, M, group);
  for (const pond of T.ponds || []) {
    const pos = [], idx = [], n = pond.length; let cx = 0, cz = 0; for (const q of pond) { cx += q[0] / n; cz += q[1] / n; pos.push(q[0], 0.19, q[1]); } pos.push(cx, 0.19, cz);
    for (let i = 0; i < n; i++) { const a = pond[i], b = pond[(i + 1) % n], up = (a[0] - cx) * (b[1] - cz) - (a[1] - cz) * (b[0] - cx) < 0; idx.push(n, up ? i : (i + 1) % n, up ? (i + 1) % n : i); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const pm = new THREE.Mesh(g, M.water); pm.receiveShadow = true; pm.name = 'pond'; group.add(pm);
  }
  // Nothing solid may stand between the kerbs of any road (river walls used to run on under the bridge decks).
  {
    const boxes = L.edges.map(e => { const a = L.nodes[e.a]; return { o: obb(a.x + e.dir.x * e.length / 2, a.z + e.dir.z * e.length / 2, e.width / 2, e.length / 2, Math.atan2(e.dir.x, e.dir.z)), r: Math.hypot(e.width / 2, e.length / 2) }; });
    const juncs = L.nodes.filter(n => n.poly);
    T.prunedColliders = T.colliders.prune(c => {
      const co = obb(c.x, c.z, c.hw, c.hd, c.rot), cr = Math.hypot(c.hw, c.hd);
      for (const b of boxes) { const dx = b.o.x - c.x, dz = b.o.z - c.z, rr = b.r + cr; if (dx * dx + dz * dz < rr * rr && obbOverlap(co, b.o, -0.02)) return true; }
      for (const n of juncs) { if (Math.abs(n.x - c.x) > n.trim + 14 || Math.abs(n.z - c.z) > n.trim + 14) continue; if (pointInPoly(c.x, c.z, n.poly)) return true; }
      return false;
    });
  }
  // the game instances a car on every bay it is given, so hand over a believable share rather than every stall
  if (T.parking.length > 1500) { const pr = makeRng(seed + 99); for (let i = T.parking.length - 1; i > 0; i--) { const j = Math.floor(pr() * (i + 1)), q = T.parking[i]; T.parking[i] = T.parking[j]; T.parking[j] = q; } T.parking.length = 1500; }
  const map = drawMap(L, T);
  await step(1, 'Ready');
  const town = {
    group, bounds: { ...BOUNDS }, nodes: L.nodes, edges: L.edges, streetNames: L.streetNames,
    signal: (nodeId, edgeId, t) => signalState(L.nodes[nodeId], edgeId, t),
    surface: (x, z) => SURF_NAME[T.surf.at(x, z)],
    colliders: T.colliders, places: T.places, addresses: T.addresses, lamps: new Float32Array(T.lamps), parking: T.parking,
    spawn: T.spawn || { x: 0, z: 0, heading: 0 }, map,
    // signals every frame; a few times a second hide the fine-detail chunks (fences, signs, paint) that are far away
    update(dt, t, camPos) {
      T.updateSignals(t);
      if (camPos && (cullT -= dt) <= 0) { cullT = 0.3; for (const s of small) s.m.visible = Math.hypot(s.x - camPos.x, s.z - camPos.z) - s.r < s.far;
        // trees: full crowns near the camera, the light model beyond; shrubs and reeds are not drawn far away
        for (const t of T.treeLods) { const d = Math.hypot(t.x - camPos.x, t.z - camPos.z) - t.r; if (t.small) t.im.visible = d < 330; else if (t.lo) { const g = d < 55 ? t.hi : t.lo; if (t.im.geometry !== g) t.im.geometry = g; } } }
    },
    dispose() { group.traverse(o => { o.geometry?.dispose(); if (o.material && o.material.isShaderMaterial) o.material.dispose(); }); for (const k of ['sign', 'cut']) { M[k].map?.dispose(); M[k].dispose(); } M.cutBB.dispose(); M.dispose(); group.clear(); },
    stats, buildMs: performance.now() - t0, _T: T,
  };
  return town;
}

export async function devDemo(ctx) {
  const { scene, camera, controls, params } = ctx;
  const town = await buildTown({ seed: Number(params.get('seed')) || 1407, onProgress: (f, l) => console.log('[town]', f.toFixed(2), l) });
  window.__town = town; scene.add(town.group);
  camera.near = 0.3; camera.far = 9000; camera.updateProjectionMatrix();
  if (params.get('map')) {
    const c = town.map.canvas, m = town.map; c.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:5'; document.body.appendChild(c);
    window.__mapView = (x, z, zoom) => { const k = zoom; c.style.cssText = `position:fixed;z-index:5;transform-origin:0 0;left:0;top:0;width:${c.width}px;height:${c.height}px;transform:translate(${innerWidth / 2 - (x - m.minX) * m.scale * k}px,${innerHeight / 2 - (z - m.minZ) * m.scale * k}px) scale(${k})`; };
  }
  // ?at=<placeId> or ?x=&z= puts the camera at driver height looking along the nearest street
  let x = Number(params.get('x')) || 0, z = Number(params.get('z')) || 0, h = Number(params.get('h')) || 0;
  const at = params.get('at'); if (at && town.places[at]) { const p = town.places[at]; x = p.stop.x; z = p.stop.z; h = p.stop.heading; }
  else if (!params.get('x') && town.spawn) { x = town.spawn.x; z = town.spawn.z; h = town.spawn.heading; }
  camera.position.set(x - Math.sin(h) * 8, 3.2, z - Math.cos(h) * 8); controls.target.set(x + Math.sin(h) * 20, 1.5, z + Math.cos(h) * 20); controls.update();
  // real-pass draw statistics for the current view (main + shadow + AO passes)
  window.__townStats = () => {
    const r = G.renderer, i = r.info; i.autoReset = false; i.reset(); window.__dev.step(0); const out = { calls: i.render.calls, tris: i.render.triangles, build: Math.round(town.buildMs), total: town.stats }; i.autoReset = true;
    let vis = 0, vt = 0; const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    town.group.traverse(o => { if (o.isMesh && o.visible && (!o.frustumCulled || fr.intersectsObject(o))) { vis++; const g = o.geometry; vt += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    out.viewMeshes = vis; out.viewTris = Math.round(vt); return out;
  };
  // scripted views of a named place: 'chase' (behind the pull-up point), 'driver', 'walk' (at the patient spot), 'over'
  window.__view = (id, mode = 'chase', env) => {
    const p = town.places[id]; if (!p) return 'no place ' + id; if (env) window.__dev.env(env);
    const s = p.stop, fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    if (mode === 'driver') window.__dev.cam(s.x, 1.8, s.z, s.x + fx * 30, 1.6, s.z + fz * 30, 62);
    else if (mode === 'walk') { const dx = p.x - p.spot.x, dz = p.z - p.spot.z, l = Math.hypot(dx, dz) || 1; window.__dev.cam(p.spot.x - dx / l * 9, 1.75, p.spot.z - dz / l * 9, p.x, 3.5, p.z, 60); }
    else if (mode === 'over') window.__dev.cam(p.x + 70, 80, p.z + 90, p.x, 0, p.z, 50);
    else if (mode === 'side') window.__dev.cam(s.x - fx * 10 + fz * 3, 2.6, s.z - fz * 10 - fx * 3, p.x, 4, p.z, 58);
    else window.__dev.cam(s.x - fx * 9, 4, s.z - fz * 9, s.x + fx * 25, 2, s.z + fz * 25, 55);
    return window.__dev.error;
  };
  let tt = 0;
  return (dt, t) => { tt += dt; town.update(dt, tt, camera.position); };
}
