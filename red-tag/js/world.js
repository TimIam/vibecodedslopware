// The park scene: sky, sun, terrain, paths, lagoon, decor, crowd, ride targets and inspection markers.
import * as THREE from 'three';
import { loadParts, part, batchAdd, batchBuild, batchReset, grassTex, asphaltTex, tileTex, signTex, faceMat, markerTex, PARTS } from './kit.js';
import { buildTarget } from './rides.js';
import { makeRng } from './rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const SHIRTS = ['#e8453c', '#3c7de8', '#f2c230', '#35b36b', '#f4f4f4', '#ff7ab6', '#8a5cf0', '#ff9a3c', '#2ac0c9', '#2a2a2a', '#c9e04a', '#d0d6e0'];
const PANTS = ['#3a4f7a', '#2c3550', '#bfa982', '#404040', '#6b4f3a', '#1f2a40', '#7a8aa0'];
const SKIN = ['#f1c7a5', '#e0ac85', '#c68b62', '#9c6643', '#6e4429', '#f5d6bd'];
const HAIR = ['#2a1d12', '#4a3020', '#c9a055', '#151515', '#7a5a3a', '#b8b0a0', '#8a3a1a'];

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.park = null;
    this.targets = [];
    this.markers = [];
    this.focusId = null;
  }

  async init() {
    await loadParts('assets/parts.glb');
    const sc = this.scene;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(215));
    // sky dome: hand-tuned gradient with a sun disc (linear HDR, tone mapped by the output pass)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sun: { value: this.sunDir }, top: { value: new THREE.Color('#2f6fc4') }, mid: { value: new THREE.Color('#7fb2e6') },
        hor: { value: new THREE.Color('#dfe9ee') }, gnd: { value: new THREE.Color('#9fb0a0') } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 sun, top, mid, hor, gnd; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 c = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0, 0.18, h)), top, smoothstep(0.15, 0.9, h)) : mix(hor, gnd, smoothstep(0.0, 0.08, -h));
          float s = max(dot(d, normalize(sun)), 0.0);
          c += vec3(1.0, 0.85, 0.6) * (pow(s, 6.0) * 0.25 + pow(s, 64.0) * 0.6) + vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 30.0;
          gl_FragColor = vec4(c * 1.35, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), skyMat); sky.frustumCulled = false; sky.renderOrder = -1; sc.add(sky);
    this.sky = sky;
    // environment from a painted equirect of the same sky
    const ec = document.createElement('canvas'); ec.width = 512; ec.height = 256; const eg = ec.getContext('2d');
    const grd = eg.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#3f78c4'); grd.addColorStop(0.32, '#8dbbe8'); grd.addColorStop(0.49, '#e4ecef'); grd.addColorStop(0.52, '#8f9c80'); grd.addColorStop(1, '#4a5a38');
    eg.fillStyle = grd; eg.fillRect(0, 0, 512, 256);
    const su = 512 * (0.5 + Math.atan2(this.sunDir.x, -this.sunDir.z) / (2 * Math.PI)), sv = 256 * (0.5 - Math.asin(this.sunDir.y) / Math.PI);
    const sg = eg.createRadialGradient(su, sv, 0, su, sv, 60); sg.addColorStop(0, 'rgba(255,248,225,1)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    eg.fillStyle = sg; eg.fillRect(0, 0, 512, 256);
    const et = new THREE.CanvasTexture(ec); et.mapping = THREE.EquirectangularReflectionMapping; et.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(this.renderer);
    sc.environment = pm.fromEquirectangular(et).texture;
    sc.environmentIntensity = 0.9;
    sc.fog = new THREE.Fog('#c9d8e4', 260, 1100);

    const sun = new THREE.DirectionalLight('#fff1dc', 3.0);
    sun.position.copy(this.sunDir).multiplyScalar(200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.04;
    const cam = sun.shadow.camera; cam.near = 10; cam.far = 600;
    sc.add(sun, sun.target);
    this.sun = sun;
    sc.add(new THREE.HemisphereLight('#cfe3ff', '#5a6b3a', 0.45));
    this.setShadowFocus(V(0, 0, 0), 150);

    // ground + horizon
    const gt = grassTex(); gt.repeat.set(140, 140);
    const gmat = new THREE.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0, color: '#d6e6c4', vertexColors: true });
    const gg = new THREE.PlaneGeometry(1400, 1400, 220, 220), gp = gg.attributes.position, gc = [];
    // large-scale colour variation (mown patches, dry spots) so the lawn isn't one flat green
    const vn = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
    const sm = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return (vn(xi, yi) * (1 - u) + vn(xi + 1, yi) * u) * (1 - v) + (vn(xi, yi + 1) * (1 - u) + vn(xi + 1, yi + 1) * u) * v; };
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), y = gp.getY(i);
      const n = sm(x / 60, y / 60) * 0.6 + sm(x / 17, y / 17) * 0.3 + sm(x / 6, y / 6) * 0.1;
      const dry = Math.max(0, sm(x / 90 + 7, y / 90 + 3) - 0.6) * 1.6;
      gc.push(0.78 + n * 0.32 + dry * 0.35, 0.82 + n * 0.28 + dry * 0.12, 0.74 + n * 0.22 - dry * 0.1);
    }
    gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    const g = new THREE.Mesh(gg, gmat); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; sc.add(g);
    const hills = new THREE.Group();
    const hmat = new THREE.MeshStandardMaterial({ color: '#5f7e4c', roughness: 1, flatShading: true });
    const hr = makeRng(77);
    for (let i = 0; i < 46; i++) {
      const a = TAU * i / 46 + hr.range(-0.04, 0.04), r = hr.range(520, 640);
      const h = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), hmat);
      h.position.set(Math.cos(a) * r, -12, Math.sin(a) * r); h.scale.set(hr.range(60, 120), hr.range(30, 70), hr.range(50, 90));
      hills.add(h);
    }
    sc.add(hills);
    this.root = new THREE.Group(); sc.add(this.root);
    this.inspector = part('inspector'); sc.add(this.inspector);
    this.inspector.traverse(m => { if (m.isMesh && m.material.name === 'pants') { m.material = m.material.clone(); m.material.color.set('#2c3550'); } });
  }

  setShadowFocus(c, r) {
    const s = this.sun, cam = s.shadow.camera;
    s.target.position.copy(c); s.position.copy(c).addScaledVector(this.sunDir, 260);
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.updateProjectionMatrix();
    s.target.updateMatrixWorld();
  }

  clear() {
    this.root.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    this.scene.remove(this.root);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.targets = []; this.markers = []; this.crowd = null;
  }

  build(park) {
    this.clear();
    batchReset();
    this.park = park;
    const R = park.ringR, root = this.root, rng = makeRng(park.seed * 13 + park.day);
    const asph = asphaltTex();
    const pathMat = (rep) => { const t = asph.clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); };
    // ring path
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 3.6, R + 3.6, 160, 1), pathMat([R / 2.2, R / 2.2]));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.receiveShadow = true; root.add(ring);
    const curb = new THREE.MeshStandardMaterial({ color: '#cfc8bb', roughness: 0.85 });
    for (const rr of [R - 3.7, R + 3.7]) { const c = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.12, 6, 200), curb); c.rotation.x = -Math.PI / 2; c.position.y = 0.06; c.receiveShadow = true; root.add(c); }
    // lagoon in the middle
    const lr = R - 13;
    const water = new THREE.Mesh(new THREE.CircleGeometry(lr, 96), new THREE.MeshStandardMaterial({ color: '#2f7a96', roughness: 0.06, metalness: 0.15, envMapIntensity: 1.4 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.05; root.add(water);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(lr, 0.45, 8, 160), new THREE.MeshStandardMaterial({ color: '#bdb5a6', roughness: 0.9 }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.1; rim.castShadow = rim.receiveShadow = true; root.add(rim);
    this.water = water;
    // fountain jets
    const jetMat = new THREE.MeshStandardMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.55, roughness: 0.1, emissive: '#bfe6ff', emissiveIntensity: 0.15 });
    this.jets = [];
    for (let i = 0; i < 7; i++) {
      const a = TAU * i / 7, j = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 10, 1, true), jetMat);
      j.position.set(i === 0 ? 0 : Math.cos(a) * 3, 0, i === 0 ? 0 : Math.sin(a) * 3); j.userData.h = i === 0 ? 9 : 4; root.add(j); this.jets.push(j);
    }

    // entrance + plaza
    const ez = park.entrance.z;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(17, 64), (() => { const t = tileTex(); t.repeat.set(9, 9); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); })());
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.035, ez - 10); plaza.receiveShadow = true; root.add(plaza);
    this.path(0, R, 0, ez - 10, 9, pathMat);
    this.path(0, ez - 10, 0, ez + 60, 12, pathMat);
    const arch = part('entrance', { a: '#c8322a', b: '#f2c230' }); arch.position.set(0, 0, ez); root.add(arch);
    const af = part('entrance_face'); af.position.copy(arch.position);
    af.traverse(m => { if (m.isMesh) m.material = faceMat(signTex(park.name.toUpperCase(), { bg: '#1c2f5a', border: '#ffd34a', sub: `Est. ${1950 + (park.seed % 60)} · Fun guaranteed*` })); });
    root.add(af);
    for (const sx of [-1, 1]) { const rs = part('restroom'); rs.position.set(sx * 21, 0, ez - 12); rs.rotation.y = -sx * Math.PI / 2; root.add(rs); }

    // targets
    for (const tg of park.targets) {
      const r = buildTarget(tg);
      root.add(r.group);
      r.tg = tg;
      r.setMode('run');
      this.targets.push(r);
      // spur path from the ring to the ride front
      const front = r.group.localToWorld(V(0, 0, r.front + 3));
      if (tg.type === 'coaster') {
        this.path(tg.spur.x0, tg.spur.z0, front.x, front.z, 5, pathMat);
      } else this.path(tg.spur.x0, tg.spur.z0, front.x, front.z, 5, pathMat);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), pathMat([2, 2]));
      pad.rotation.x = -Math.PI / 2; pad.position.set(front.x, 0.032, front.z); pad.receiveShadow = true; root.add(pad);
      r.door = V(front.x, 0, front.z);
      r.ringPt = V(tg.spur.x0, 0, tg.spur.z0);
      // queue posts
      const dir = V(tg.spur.x0 - front.x, 0, tg.spur.z0 - front.z).normalize(), side = V(-dir.z, 0, dir.x);
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { const p = front.clone().addScaledVector(dir, 2 + k * 1.4).addScaledVector(side, s * 0.9); batchAdd('queue_post', p.x, 0, p.z); }
    }
    this.decor(park, rng);
    batchBuild(root, { cs_tie: { b: park.targets.find(t => t.type === 'coaster')?.colors.b } });
    this.buildCrowd(park, rng);
    this.buildMarkers();
    this.inspector.position.set(0, 0, ez - 6);
    this.inspector.rotation.y = Math.PI;
  }

  path(x0, z0, x1, z1, w, pathMat) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.5) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), pathMat([w / 4, L / 4]));
    m.rotation.set(-Math.PI / 2, 0, Math.atan2(x1 - x0, z1 - z0) + Math.PI);
    m.position.set((x0 + x1) / 2, 0.031, (z0 + z1) / 2); m.receiveShadow = true;
    this.root.add(m);
    (this.paths ||= []).push([x0, z0, x1, z1, w]);
  }

  decor(park, rng) {
    const R = park.ringR;
    const blockers = [];
    for (const r of this.targets) {
      const tg = r.tg;
      if (tg.type === 'coaster') {
        const c = tg.coaster;
        for (let i = 0; i < c.N; i += 8) blockers.push([c.pos[i][0] + tg.x, c.pos[i][2] + tg.z, 6.5]);
        const sp = c.pos[c.iStop]; blockers.push([sp[0] + tg.x, sp[2] + tg.z + 3, 14]);
      } else blockers.push([tg.x, tg.z, r.size * 0.5 + 4]);
    }
    const segs = this.paths || [];
    const segDist = (x, z) => Math.min(...segs.map(([x0, z0, x1, z1, w]) => {
      const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - x0 - dx * t, z - z0 - dz * t) - w / 2;
    }));
    const ez = park.entrance.z;
    const free = (x, z, pad = 1.5) => {
      const r = Math.hypot(x, z);
      if (Math.abs(r - R) < 5 + pad) return false;
      if (r < R - 12 + 1.5) return false;
      if (Math.hypot(x, z - (ez - 10)) < 19) return false;
      if (Math.abs(x) < 26 && z > ez - 20 && z < ez + 6) return false;
      if (segDist(x, z) < 2.5 + pad) return false;
      return blockers.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + pad);
    };
    // park extent
    let ext = R + 40;
    for (const r of this.targets) ext = Math.max(ext, Math.hypot(r.tg.x, r.tg.z) + (r.tg.type === 'coaster' ? r.tg.coaster.params.a * 0.9 : r.size));
    ext = Math.max(ext, ez + 6);
    this.extent = ext;
    let placed = 0;
    for (let k = 0; k < 2600 && placed < 260; k++) {
      const a = rng.range(0, TAU), r = Math.sqrt(rng()) * ext;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!free(x, z)) continue;
      const kind = rng.weighted([['tree_a', 0.5], ['tree_b', 0.25], ['bush', 0.25]]);
      batchAdd(kind, x, 0, z, rng.range(0, TAU), rng.range(0.8, 1.3));
      placed++;
    }
    // inner lawn ring of trees between lagoon and path
    for (let i = 0; i < 26; i++) {
      const a = TAU * (i + 0.5) / 26, r = R - 8.5;
      if (Math.abs(a - Math.PI / 2) < 0.18) continue;
      batchAdd(i % 3 ? 'tree_a' : 'bush', Math.cos(a) * r, 0, Math.sin(a) * r, rng.range(0, TAU), rng.range(0.7, 1.0));
    }
    // perimeter fence + tree line
    const fr = ext + 10, n = Math.round(TAU * fr);
    for (let i = 0; i < n; i++) {
      const a = TAU * i / n, x = Math.cos(a) * fr, z = Math.sin(a) * fr;
      if (Math.abs(x) < 7 && z > 0) continue;
      batchAdd('fence', x, 0, z, -a - Math.PI / 2, 1);
    }
    for (let i = 0; i < 180; i++) {
      const a = rng.range(0, TAU), r = fr + rng.range(4, 40), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 10 && z > 0) continue;
      batchAdd(rng.chance(0.6) ? 'tree_b' : 'tree_a', x, 0, z, rng.range(0, TAU), rng.range(1.0, 1.6));
    }
    // lamps, benches, bins along the ring
    const nl = Math.round(TAU * R / 16);
    for (let i = 0; i < nl; i++) {
      const a = TAU * (i + 0.25) / nl, side = i % 2 ? 1 : -1, rr = R + side * 4.4;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (segDist(x, z) < 1 && segs.some(s => Math.hypot(s[0] - x, s[1] - z) < 8)) continue;
      batchAdd('lamp', x, 0, z, 0);
      const a2 = a + 0.5 * TAU / nl, rb = R + side * 4.5, bx = Math.cos(a2) * rb, bz = Math.sin(a2) * rb;
      if (!segs.some(s => Math.hypot(s[0] - bx, s[1] - bz) < 7)) batchAdd(i % 3 ? 'bench' : 'trash', bx, 0, bz, -a2 + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
  }

  buildCrowd(park, rng) {
    const R = park.ringR, N = 240 + park.targets.length * 12;
    const src = [['peep_legs', 'pants'], ['peep_body', 'shirt'], ['peep_head', 'skin'], ['peep_head', 'hair']];
    const meshes = src.map(([name, matName]) => {
      let mesh = null; PARTS[name].traverse(m => { if (m.isMesh && m.material.name === matName) mesh = m; });
      const mat = mesh.material.clone(); mat.color.set('#ffffff');
      const im = new THREE.InstancedMesh(mesh.geometry, mat, N); im.castShadow = true; im.receiveShadow = false;
      im.frustumCulled = false; this.root.add(im); return im;
    });
    const agents = [];
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = { kind: 'ring', th: rng.range(0, TAU), r: R + rng.range(-2.8, 2.8), v: rng.range(0.9, 1.5) * (rng.chance(0.5) ? 1 : -1), ph: rng.range(0, TAU), s: rng.range(0.85, 1.08), x: 0, z: 0, yaw: 0 };
      const q = rng();
      if (q < 0.28 && this.targets.length) {
        const t = rng.pick(this.targets); const k = rng.int(0, 9);
        const dir = t.ringPt.clone().sub(t.door).normalize();
        const p = t.door.clone().addScaledVector(dir, 2 + k * 0.75);
        Object.assign(a, { kind: 'queue', x: p.x + rng.range(-0.25, 0.25), z: p.z, yaw: Math.atan2(-dir.x, -dir.z) });
      } else if (q < 0.4) {
        const ez = park.entrance.z; const ang = rng.range(0, TAU), rr = rng.range(3, 15);
        Object.assign(a, { kind: 'mill', x: Math.cos(ang) * rr, z: ez - 10 + Math.sin(ang) * rr, yaw: rng.range(0, TAU), v: rng.range(0.4, 0.8) });
      } else if (q < 0.5) {
        const ez = park.entrance.z;
        Object.assign(a, { kind: 'entry', x: rng.range(-3, 3), z: rng.range(R + 4, ez + 40), v: rng.range(1, 1.4) * (rng.chance(0.6) ? -1 : 1), yaw: 0 });
      }
      agents.push(a);
      meshes[0].setColorAt(i, col.set(rng.pick(PANTS)));
      meshes[1].setColorAt(i, col.set(rng.pick(SHIRTS)));
      meshes[2].setColorAt(i, col.set(rng.pick(SKIN)));
      meshes[3].setColorAt(i, col.set(rng.pick(HAIR)));
    }
    this.crowd = { agents, meshes };
    this.updateCrowd(0);
  }

  updateCrowd(dt) {
    if (!this.crowd) return;
    const { agents, meshes } = this.crowd, R = this.park.ringR, ez = this.park.entrance.z;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = V(0, 1, 0);
    agents.forEach((a, i) => {
      a.ph += dt * Math.abs(a.v) * 5.5;
      let bob = Math.abs(Math.sin(a.ph)) * 0.05;
      if (a.kind === 'ring') {
        a.th += a.v / a.r * dt;
        a.x = Math.cos(a.th) * a.r; a.z = Math.sin(a.th) * a.r;
        a.yaw = Math.atan2(-Math.sin(a.th) * Math.sign(a.v), Math.cos(a.th) * Math.sign(a.v));
      } else if (a.kind === 'entry') {
        a.z += a.v * dt; if (a.z < R + 4) a.z = ez + 40; if (a.z > ez + 40) a.z = R + 4;
        a.yaw = a.v > 0 ? 0 : Math.PI;
      } else if (a.kind === 'mill') {
        a.x += Math.sin(a.yaw) * a.v * dt; a.z += Math.cos(a.yaw) * a.v * dt;
        if (Math.hypot(a.x, a.z - (ez - 10)) > 15) a.yaw += Math.PI * 0.8;
        if (Math.random() < dt * 0.2) a.yaw += (Math.random() - 0.5) * 2;
      } else bob = Math.abs(Math.sin(a.ph * 0.08)) * 0.015;
      q.setFromAxisAngle(Y, a.yaw);
      m.compose(p.set(a.x, bob, a.z), q, s.setScalar(a.s));
      for (const im of meshes) im.setMatrixAt(i, m);
    });
    for (const im of meshes) im.instanceMatrix.needsUpdate = true;
  }

  buildMarkers() {
    for (const r of this.targets) {
      let n = 0;
      for (const f of r.tg.findings) {
        if (f.group !== 'point') continue;
        n++;
        const obj = r.anchors[f.id];
        if (!obj) { console.warn('no anchor for', f.id, f.label); continue; }
        const mat = new THREE.SpriteMaterial({ map: markerTex('new', String(n)), depthTest: false, transparent: true, sizeAttenuation: true });
        const sp = new THREE.Sprite(mat); sp.scale.setScalar(0.9); sp.renderOrder = 10; sp.visible = false;
        sp.userData = { fid: f.id, target: r, obj, n, state: 'new' };
        this.scene.add(sp); this.markers.push(sp);
        f.n = n;
      }
    }
  }

  markerState(fid, state) {
    const sp = this.markers.find(m => m.userData.fid === fid);
    if (!sp || sp.userData.state === state) return;
    sp.userData.state = state;
    sp.material.map.dispose(); sp.material.map = markerTex(state, String(sp.userData.n)); sp.material.needsUpdate = true;
  }

  update(dt, cam, t) {
    for (const r of this.targets) r.update(dt * (r.speedMul || 1));
    this.updateCrowd(dt);
    for (const j of this.jets) { const h = j.userData.h * (0.85 + 0.15 * Math.sin(t * 3 + j.position.x)); j.scale.set(1, h, 1); j.position.y = h / 2 + 0.05; }
    const camPos = cam.position;
    for (const sp of this.markers) {
      const on = sp.userData.target.tg.id === this.focusId;
      sp.visible = on && !this.hideMarkers;
      if (!on) continue;
      sp.userData.obj.getWorldPosition(sp.position);
      const d = camPos.distanceTo(sp.position);
      const k = (sp.userData.hover ? 1.35 : 1) * Math.max(0.35, Math.min(2.2, d * 0.03));
      sp.scale.setScalar(k);
    }
  }
}
