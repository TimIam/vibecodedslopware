// Terrain, sky, lighting, stand generation, background forest, hazards.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SPECIES } from './data.js';
import { groundTextures, rockMaterial, barkMaterial } from './textures.js';
import { assets } from './assets.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;

// Shared wind clock for foliage sway: x = time, y = amplitude in model units (set by the game each frame).
// overall bark tone per bark style, used to tint the crown models' branches to match their trunks
export const BARK_TONE = { birch: 0xd9d4c8, aspen: 0xb9bca8, pine: 0x6e4c38, spruce: 0x5c4b3f, ponderosa: 0x8a5b3c, dfir: 0x5b4231, cedar: 0x7c4b36, oak: 0x4b3b2d, ash: 0x77746b, maple: 0x6a6258 };
export const wind = { value: new THREE.Vector2(0, 0.01) };
// sun shadow map resolution; the game's auto-quality may lower it
export const shadowRes = { value: 4096 };
// A clone of a material whose vertices sway with height (local y from 0 at the base up), phased per instance.
function swaying(mat, power, amp) {
  const key = `_sway${power}_${amp}`;
  if (mat.userData[key]) return mat.userData[key];
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform vec2 uWind;\n' + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wp = instanceMatrix[3].xz;
      #else
        vec2 wp = vec2(0.0);
      #endif
      float ph = wp.x * 0.37 + wp.y * 0.23;
      float hgt = pow(clamp(position.y, 0.0, 1.0), ${power.toFixed(2)}) * uWind.y * ${amp.toFixed(2)};
      transformed.x += (sin(uWind.x * 1.1 + ph) * 0.7 + sin(uWind.x * 2.9 + ph * 1.7) * 0.3) * hgt;
      transformed.z += cos(uWind.x * 0.8 + ph * 1.3) * 0.6 * hgt;`);
  };
  m.customProgramCacheKey = () => key;
  mat.userData[key] = m;
  return m;
}

function makeNoise(seed) {
  const r = rng(seed), perm = new Uint8Array(512), grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; grad[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const v = (x, y) => grad[perm[(x & 255) + perm[y & 255]]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    return lerp(lerp(v(xi, yi), v(xi + 1, yi), u), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), u), w);
  };
}

export class World {
  constructor(scene, renderer, loc, seed) {
    this.scene = scene; this.loc = loc; this.seed = seed;
    this.group = new THREE.Group(); scene.add(this.group);
    this.ownTextures = [];
    this.r = rng(seed);
    const n = makeNoise(seed);
    const slope = Math.tan(THREE.MathUtils.degToRad(loc.slope));
    const rough = loc.rough;
    const benches = loc.slope > 20;
    this.height = (x, z) => {
      let h = -slope * x;
      h += rough * (n(x * 0.035, z * 0.035) * 3.0 + n(x * 0.12, z * 0.12) * 0.8 + n(x * 0.5, z * 0.5) * 0.12);
      if (benches) h += Math.sin(x * 0.11 + n(z * 0.02, 3) * 2) * 1.6; // terraced benches
      return h;
    };
    this.normalAt = (x, z) => {
      const e = 0.4;
      const v = new THREE.Vector3(this.height(x - e, z) - this.height(x + e, z), 2 * e, this.height(x, z - e) - this.height(x, z + e));
      return v.normalize();
    };
    this.buildSky(renderer);
    this.buildTerrain();
    this.rocks = [];
    this.standing = []; // collision trees: {x,z,r,h,crownR,crownBase,sp,model?}
    this.hazards = [];
  }

  buildSky(renderer) {
    const loc = this.loc, s = loc.sky;
    const sky = new Sky(); sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = s.turbidity; u.rayleigh.value = s.rayleigh; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - s.elevation), THREE.MathUtils.degToRad(140));
    u.sunPosition.value.copy(sun);
    this.group.add(sky);
    this.sunDir = sun.clone();

    // image-based ambient from the sky
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(4000);
    Object.assign(sky2.material.uniforms.sunPosition.value, sun);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
    skyScene.add(sky2);
    this.envMap = pmrem.fromScene(skyScene, 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();

    this.scene.fog = new THREE.FogExp2(loc.fog, loc.density);
    const sunLight = new THREE.DirectionalLight(0xffe4c0, 3.1);
    sunLight.position.copy(sun).multiplyScalar(80);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.setScalar(shadowRes.value);
    const c = sunLight.shadow.camera; c.left = -40; c.right = 40; c.top = 40; c.bottom = -40; c.near = 1; c.far = 260;
    sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.04; sunLight.shadow.radius = 2.5; sunLight.shadow.blurSamples = 12;
    this.group.add(sunLight); this.group.add(sunLight.target);
    this.sun = sunLight;
    const hemi = new THREE.HemisphereLight(new THREE.Color(loc.fog).lerp(new THREE.Color(0xd8e8ff), 0.5), 0x5a4a30, 0.45);
    this.group.add(hemi);
  }
  focus(x, z) {
    const y = this.height(x, z);
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x, y, z).addScaledVector(this.sunDir, 90);
  }

  buildTerrain() {
    const size = 280, seg = 220;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.height(x, z);
      pos.setY(i, y);
      uv.setXY(i, x / 3.2, z / 3.2);
      const shade = 0.82 + 0.18 * Math.max(-1, Math.min(1, (y + 0.10 * x * Math.tan(THREE.MathUtils.degToRad(this.loc.slope))) * 0.15 + 0.4));
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const { map, normal } = groundTextures(this.loc.ground);
    const mat = new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.terrain = mesh;
  }

  // Generate stand: job trees (marked) near the middle, neighbours that can hang trees up, background ring.
  generateStand(jobCount, opts = {}) {
    const loc = this.loc, r = this.r;
    const pts = [];
    const minSpacing = Math.max(3.2, loc.dbh[1] * 7);
    const tryPlace = (rad0, rad1, spacing, tries) => {
      for (let t = 0; t < tries; t++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(lerp(rad0 * rad0, rad1 * rad1, r()));
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (pts.every((p) => Math.hypot(p.x - x, p.z - z) > spacing)) { const p = { x, z }; pts.push(p); return p; }
      }
      return null;
    };
    const jobs = [];
    const rows = opts.rows;
    if (rows) {
      // plantation rows along z
      for (let ix = -6; ix <= 6; ix++) for (let iz = -10; iz <= 10; iz++) {
        const x = ix * 3.4 + (r() - 0.5) * 0.6, z = iz * 3.0 + (r() - 0.5) * 0.6;
        if (Math.hypot(x, z + 8) < 7) continue; // landing for the machine
        pts.push({ x, z, job: true });
      }
      for (const p of pts) jobs.push(this.makeTreeSpec(p.x, p.z, true));
    } else {
      for (let i = 0; i < jobCount; i++) {
        const p = tryPlace(4 + i * 2.5, 9 + i * 4, Math.max(8, loc.dbh[1] * 14), 300);
        if (p) jobs.push(this.makeTreeSpec(p.x, p.z, true));
      }
      const leaveN = Math.round(22 + 40 / Math.max(1, loc.dbh[1] * 4));
      for (let i = 0; i < leaveN; i++) {
        const p = tryPlace(5, 48, minSpacing, 80);
        if (p) this.standing.push(this.makeTreeSpec(p.x, p.z, false));
      }
    }
    this.standing.push(...jobs);
    this.jobs = jobs;
    return jobs;
  }

  makeTreeSpec(x, z, job) {
    const loc = this.loc, r = this.r;
    const spKey = loc.species[Math.floor(r() * loc.species.length)];
    const sp = SPECIES[spKey];
    const dbh = job ? lerp(loc.dbh[0], loc.dbh[1], Math.pow(r(), 1.2)) : lerp(loc.dbh[0], loc.dbh[1] * 1.1, r());
    const dcm = dbh * 100;
    const h = 1.37 + (sp.hMax - 1.37) * (1 - Math.exp(-dcm / (28 + sp.hMax * 0.6))) * lerp(0.85, 1.08, r());
    const leanDeg = lerp(loc.lean[0], loc.lean[1], Math.pow(r(), 1.4));
    // lean tends downhill on slopes
    const downhill = 0;
    const leanAz = loc.slope > 8 && r() < 0.6 ? downhill + (r() - 0.5) * 1.6 : r() * Math.PI * 2;
    const crownLen = h * sp.crownRatio * lerp(0.85, 1.15, r());
    const crownR = sp.crown === 'conifer' ? crownLen * 0.22 * sp.crownWidth : crownLen * 0.42 * sp.crownWidth;
    const heavyAz = leanAz + (r() - 0.5) * 1.4;
    return {
      x, z, y: this.height(x, z), spKey, sp, dbh, h, job,
      lean: { deg: leanDeg, az: leanAz },
      crownLen, crownR, crownBase: h - crownLen,
      crownOffset: { m: lerp(0, crownR * 0.35, r()), az: heavyAz },
      rot: r() > 0.8 && sp.crown === 'broadleaf' ? lerp(0.1, 0.35, r()) : 0, // hollow-core fraction
      breakAt: lerp(0.45, 0.7, r()),
      seed: Math.floor(r() * 1e9),
    };
  }

  // Lightweight standing trees (no CSG): instanced crowns + trunks.
  buildLeaveTrees(exclude = []) {
    const specs = this.standing.filter((s) => !exclude.includes(s));
    const r = this.r;
    // background ring (non-colliding)
    const bg = [];
    for (let i = 0; i < 520; i++) {
      const a = r() * Math.PI * 2, d = lerp(50, 135, Math.sqrt(r()));
      bg.push(this.makeTreeSpec(Math.cos(a) * d, Math.sin(a) * d, false));
    }
    const all = specs.concat(bg);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
    // trunks: one instanced tapered cylinder per bark style
    const byBark = {};
    for (const s of all) (byBark[s.sp.bark] ||= []).push(s);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 1, 1, 10, 1, true); trunkGeo.translate(0, 0.5, 0);
    for (const [bark, list] of Object.entries(byBark)) {
      const mat = barkMaterial(bark).clone(); mat.map = mat.map.clone(); mat.map.repeat.set(1, 6); mat.normalMap = mat.normalMap.clone(); mat.normalMap.repeat.set(1, 6);
      this.ownTextures.push(mat.map, mat.normalMap);
      const im = new THREE.InstancedMesh(trunkGeo, mat, list.length);
      list.forEach((s, i) => {
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(s.lean.az), 0, -Math.cos(s.lean.az)), THREE.MathUtils.degToRad(s.lean.deg) * 0.5);
        const topH = s.sp.crown === 'conifer' ? s.h : s.crownBase + s.crownLen * 0.35;
        m.compose(p.set(s.x, s.y - 0.2, s.z), tilt, sc.set(s.dbh / 2 * 1.15, topH + 0.2, s.dbh / 2 * 1.15));
        im.setMatrixAt(i, m);
        const v = 0.85 + ((s.seed >> 3) % 100) / 100 * 0.3;
        im.setColorAt(i, tint.setRGB(v, v, v));
        (s._inst ||= []).push([im, i]);
      });
      im.castShadow = true; im.receiveShadow = true;
      this.group.add(im);
    }
    // crowns: the stand at full detail with shadows; the background ring (out past the shadow camera, in the haze)
    // at low detail without them, split into sectors so the ones behind the camera get frustum-culled
    const SECTORS = 8, sector = (s) => Math.floor((Math.atan2(s.z, s.x) / (Math.PI * 2) + 0.5) * SECTORS) % SECTORS;
    const crownSets = [];
    for (const kind of ['conifer', 'broadleaf']) {
      crownSets.push({ kind, list: specs.filter((s) => s.sp.crown === kind), far: false });
      for (let k = 0; k < SECTORS; k++) crownSets.push({ kind, list: bg.filter((s) => s.sp.crown === kind && sector(s) === k), far: true });
    }
    for (const { kind, list, far } of crownSets) {
      if (!list.length) continue;
      const parts = far ? assets.crownPartsFar(kind) : assets.crownParts(kind);
      for (const part of parts) {
        const branch = /bark|branch|wood/i.test(part.material.name || "");
        const baseCol = part.material.color || new THREE.Color(1, 1, 1);
        const im = new THREE.InstancedMesh(part.geometry, swaying(part.material, 2, 1), list.length);
        list.forEach((s, i) => {
          const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(s.lean.az), 0, -Math.cos(s.lean.az)), THREE.MathUtils.degToRad(s.lean.deg) * 0.5);
          const yaw = new THREE.Quaternion().setFromAxisAngle(up, (s.seed % 628) / 100);
          const base = new THREE.Vector3(0, s.crownBase, 0).applyQuaternion(tilt);
          const wscale = s.crownR / (kind === 'conifer' ? 0.22 : 0.375);
          m.compose(p.set(s.x + base.x, s.y + base.y, s.z + base.z), tilt.clone().multiply(yaw), sc.set(wscale, s.crownLen, wscale));
          m.multiply(part.matrix);
          im.setMatrixAt(i, m);
          // per-tree colour: lightness and a warm/cool shift so the stand doesn't look cloned
          const u = ((s.seed % 997) / 997), w = (((s.seed >> 5) % 89) / 89 - 0.5) * 0.16, l = 0.78 + u * 0.36;
          if (branch) {
            const b = tint.set(BARK_TONE[s.sp.bark] ?? 0x5a4a3c);
            im.setColorAt(i, tint.setRGB(b.r / Math.max(0.02, baseCol.r), b.g / Math.max(0.02, baseCol.g), b.b / Math.max(0.02, baseCol.b)));
          } else im.setColorAt(i, tint.setRGB(l * (1 + w), l * (1 + w * 0.3), l * (1 - w)));
          (s._inst ||= []).push([im, i]);
        });
        im.castShadow = im.receiveShadow = !far;
        this.group.add(im);
      }
    }
  }

  scatterGround() {
    const r = this.r;
    // rocks
    const rockParts = assets.rockParts();
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = lerp(3, 70, Math.sqrt(r()));
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.standing.some((s) => Math.hypot(s.x - x, s.z - z) < 1.5)) continue;
      const part = rockParts[i % rockParts.length];
      const mesh = new THREE.Mesh(part.geometry, part.material);
      const s = lerp(0.3, 1.4, Math.pow(r(), 2));
      mesh.scale.set(s * lerp(0.8, 1.3, r()), s * lerp(0.6, 1), s * lerp(0.8, 1.3, r()));
      mesh.position.set(x, this.height(x, z) - 0.15 * s, z);
      mesh.rotation.y = r() * 6.28;
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.rocks.push({ x, z, r: s * 0.6, h: s * 0.8 });
    }
    // fallen logs (old windfall)
    const logMat = barkMaterial(this.loc.species.map((k) => SPECIES[k].bark)[0]);
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d = lerp(8, 60, r()), len = lerp(3, 9, r()), rad = lerp(0.12, 0.3, r());
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const geo = new THREE.CylinderGeometry(rad * 0.8, rad, len, 10); geo.rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, logMat);
      mesh.position.set(x, this.height(x, z) + rad * 0.6, z); mesh.rotation.y = r() * 6.28;
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.rocks.push({ x, z, r: len * 0.4, h: rad * 2, log: true });
    }
    // grass / fern cards
    const tex = grassTexture();
    this.ownTextures.push(tex);
    const mat = swaying(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xb8c4a0 }), 1.5, 9);
    const g1 = new THREE.PlaneGeometry(1, 0.7); g1.translate(0, 0.35, 0);
    const g2 = g1.clone().rotateY(Math.PI / 2);
    const g3 = g1.clone().rotateY(Math.PI / 4);
    const merged = mergeGeos([g1, g2, g3]);
    const count = 2600;
    const im = new THREE.InstancedMesh(merged, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), gc = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = lerp(1, 80, Math.sqrt(r()));
      const x = Math.cos(a) * d, z = Math.sin(a) * d, k = lerp(0.5, 1.4, r());
      m.compose(p.set(x, this.height(x, z) - 0.03, z), q.setFromAxisAngle(up, r() * 6.28), s.set(k, k * lerp(0.6, 1.3, r()), k));
      im.setMatrixAt(i, m);
      const gl = lerp(0.7, 1.15, r()), gw = (r() - 0.5) * 0.25;
      im.setColorAt(i, gc.setRGB(gl * (1 + gw), gl, gl * (1 - gw)));
    }
    im.receiveShadow = true;
    this.group.add(im);
  }

  addHazards(list, jobs) {
    const r = this.r;
    for (const kind of list) {
      if (kind === 'cabin') {
        // place near a job tree, off to one side
        const t = jobs[0];
        const a = (r() - 0.5) * 1.2 + Math.PI * 0.5;
        const d = t.h * 0.85;
        const cx = t.x + Math.cos(a) * d, cz = t.z + Math.sin(a) * d;
        const g = new THREE.Group();
        const wall = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 });
        const roof = new THREE.MeshStandardMaterial({ color: 0x3a3e40, roughness: 0.7, metalness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), wall); body.position.y = 1.5;
        const rf = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4.3, 2.2, 4, 1), roof); rf.rotation.y = Math.PI / 4; rf.scale.set(1.05, 1, 0.85); rf.position.y = 4.1;
        const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x2c1e14 })); door.position.set(0, 1, 2.52);
        const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2, 0.6), new THREE.MeshStandardMaterial({ color: 0x7a6e66 })); chim.position.set(1.8, 4.4, 0);
        g.add(body, rf, door, chim);
        g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
        g.position.set(cx, this.height(cx, cz), cz); g.rotation.y = -a;
        this.group.add(g);
        this.hazards.push({ kind, name: 'the cabin', x: cx, z: cz, r: 3.6, h: 5, fine: 2500 });
        this.standing = this.standing.filter((s) => s.job || Math.hypot(s.x - cx, s.z - cz) > 5);
      }
      if (kind === 'fence') {
        const t = jobs[Math.min(1, jobs.length - 1)];
        const a = r() * Math.PI * 2;
        const ox = t.x + Math.cos(a) * t.h * 0.7, oz = t.z + Math.sin(a) * t.h * 0.7;
        const dir = new THREE.Vector2(-Math.sin(a), Math.cos(a));
        const postMat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1 });
        const pts = [];
        for (let i = -6; i <= 6; i++) {
          const x = ox + dir.x * i * 2.5, z = oz + dir.y * i * 2.5;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 6), postMat);
          post.position.set(x, this.height(x, z) + 0.6, z); post.castShadow = true;
          this.group.add(post); pts.push(post.position.clone());
        }
        const wireMat = new THREE.LineBasicMaterial({ color: 0x555555 });
        for (const h of [0.35, 0.75, 1.1]) {
          const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => p.clone().setY(p.y - 0.6 + h)));
          this.group.add(new THREE.Line(g, wireMat));
        }
        this.hazards.push({ kind, name: 'the fence', line: [pts[0], pts[pts.length - 1]], h: 1.2, fine: 300 });
      }
      if (kind === 'powerline') {
        const t = jobs[0];
        const a = r() * Math.PI * 2;
        const d = t.h * 0.8;
        const ox = t.x + Math.cos(a) * d, oz = t.z + Math.sin(a) * d;
        const dir = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
        const tops = [];
        for (let i = -2; i <= 2; i++) {
          const x = ox + dir.x * i * 40, z = oz + dir.z * i * 40;
          const y = this.height(x, z);
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 11, 8), poleMat);
          pole.position.set(x, y + 5.5, z); pole.castShadow = true;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), poleMat);
          arm.position.set(x, y + 10.4, z); arm.rotation.y = -a;
          this.group.add(pole, arm);
          tops.push(new THREE.Vector3(x, y + 10.5, z));
        }
        const wireMat = new THREE.LineBasicMaterial({ color: 0x222222 });
        for (const off of [-0.9, 0, 0.9]) {
          const pts = [];
          const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(off);
          for (let i = 0; i < tops.length - 1; i++) for (let k = 0; k <= 12; k++) {
            const tt = k / 12, p = tops[i].clone().lerp(tops[i + 1], tt).add(side);
            p.y -= Math.sin(tt * Math.PI) * 1.4;
            pts.push(p);
          }
          this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
        }
        this.hazards.push({ kind, name: 'the power line', line: [tops[0], tops[tops.length - 1]], h: 9.0, fine: 6000 });
        this.standing = this.standing.filter((s) => s.job || distToSeg2(s.x, s.z, tops[0], tops[tops.length - 1]) > 4);
      }
    }
  }

  hideTree(s) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [im, i] of s._inst || []) { im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; }
  }

  // Free what this world put on the GPU: its geometry (not the shared model meshes), its own textures,
  // the sky environment map and the 4096² shadow map, which would otherwise pile up job after job.
  dispose() {
    this.scene.remove(this.group);
    disposeGeometry(this.group);
    for (const t of this.ownTextures) t.dispose();
    this.sun.shadow.dispose();
    this.envMap.dispose();
    this.scene.environment = null;
  }
}

export function disposeGeometry(root) {
  root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
}

export function distToSeg2(x, z, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}

function grassTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 46; i++) {
    const x = 10 + Math.random() * 108, h = 50 + Math.random() * 74, lean = (Math.random() - 0.5) * 40;
    const shade = 70 + Math.random() * 70;
    g.strokeStyle = `rgb(${shade * 0.7 | 0},${shade | 0},${shade * 0.45 | 0})`;
    g.lineWidth = 1.5 + Math.random() * 2.5;
    g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h); g.stroke();
  }
  // a few fern fronds
  for (let f = 0; f < 3; f++) {
    const x0 = 20 + Math.random() * 88;
    g.strokeStyle = 'rgb(70,110,45)'; g.lineWidth = 1.5;
    for (let k = 0; k < 14; k++) {
      const y = 126 - k * 7, w = 18 - k;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 - w, y - 5); g.moveTo(x0, y); g.lineTo(x0 + w, y - 5); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mergeGeos(geos) {
  let total = 0; for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const idx = []; let off = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uv.set(g.attributes.uv.array, off * 2);
    if (g.index) for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (idx.length) out.setIndex(idx);
  return out;
}
