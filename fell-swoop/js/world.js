// Scenery: sky, light, ground, the forest around the clearing, and the canvas textures.
import * as THREE from 'three';

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// Draw a shape at every wrapped position so the canvas tiles seamlessly.
function wrapDraw(w, h, x, y, pad, fn) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    if (x + ox < -pad || x + ox > w + pad || y + oy < -pad || y + oy > h + pad) continue;
    fn(x + ox, y + oy);
  }
}

export function barkTexture(rng) {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#4a3427'; g.fillRect(0, 0, W, H);
  // Bark plates: long rough-edged slabs between the fissures.
  for (let i = 0; i < 300; i++) {
    const x = rng() * W, y = rng() * H, w = 8 + rng() * 22, h = 26 + rng() * 80;
    const l = 24 + rng() * 20, s = 16 + rng() * 16, hue = 18 + rng() * 12;
    wrapDraw(W, H, x, y, 120, (px, py) => {
      g.fillStyle = `hsl(${hue},${s}%,${l}%)`;
      g.beginPath(); g.ellipse(px, py, w / 2, h / 2, (rng() - 0.5) * 0.12, 0, Math.PI * 2); g.fill();
      g.fillStyle = `hsla(${hue + 6},${s}%,${l + 10}%,0.45)`;
      g.beginPath(); g.ellipse(px - w * 0.12, py - h * 0.1, w * 0.28, h * 0.32, 0, 0, Math.PI * 2); g.fill();
    });
  }
  // Fissures: dark wandering vertical cracks.
  for (let i = 0; i < 64; i++) {
    let x = rng() * W, y = rng() * H; const len = 60 + rng() * 260, lw = 1 + rng() * 3.2;
    g.strokeStyle = `rgba(18,11,7,${0.55 + rng() * 0.4})`; g.lineWidth = lw;
    const pts = [[x, y]];
    for (let s = 0; s < len; s += 10) { x += (rng() - 0.5) * 7; y += 10; pts.push([x, y]); }
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke();
    }
  }
  // Lichen flecks.
  for (let i = 0; i < 90; i++) {
    const x = rng() * W, y = rng() * H, r = 1 + rng() * 3.5;
    wrapDraw(W, H, x, y, 8, (px, py) => { g.fillStyle = `rgba(${140 + rng() * 40},${150 + rng() * 40},${110 + rng() * 30},0.35)`; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); });
  }
  const map = tex(c, true), bump = tex(c, false);
  return { map, bump };
}

export function plaidTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#9b2226'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(15,10,12,0.62)';
  g.fillRect(0, 40, S, 40); g.fillRect(40, 0, 40, S);
  g.fillStyle = 'rgba(15,10,12,0.35)';
  g.fillRect(0, 100, S, 8); g.fillRect(100, 0, 8, S);
  g.fillStyle = 'rgba(240,210,170,0.18)';
  g.fillRect(0, 18, S, 3); g.fillRect(18, 0, 3, S);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * S, Math.random() * S, 1, 1); }
  const t = tex(c); t.repeat.set(2, 3); return t;
}

function groundTexture(rng) {
  const S = 512, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#4b5f2c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = rng() * S, y = rng() * S, r = 4 + rng() * 26;
    const k = rng();
    const col = k < 0.55 ? `hsla(${70 + rng() * 25},${30 + rng() * 20}%,${22 + rng() * 14}%,0.5)`
      : k < 0.85 ? `hsla(${30 + rng() * 15},${25 + rng() * 15}%,${20 + rng() * 12}%,0.45)`
        : `hsla(${40 + rng() * 10},${30}%,${38 + rng() * 10}%,0.35)`;
    wrapDraw(S, S, x, y, 30, (px, py) => { g.fillStyle = col; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); });
  }
  // Grass strokes and pine needles.
  for (let i = 0; i < 7000; i++) {
    const x = rng() * S, y = rng() * S, a = rng() * Math.PI, l = 3 + rng() * 7;
    g.strokeStyle = rng() < 0.75 ? `hsla(${75 + rng() * 30},${35 + rng() * 25}%,${25 + rng() * 25}%,0.7)` : `hsla(28,40%,${30 + rng() * 15}%,0.6)`;
    g.lineWidth = 1;
    wrapDraw(S, S, x, y, 10, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
  const t = tex(c); t.repeat.set(90, 90); return t;
}

function grassBladeTexture(rng) {
  const W = 64, H = 64, c = canvas(W, H), g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x = 6 + rng() * (W - 12), h = 26 + rng() * 36, lean = (rng() - 0.5) * 18, w = 1.6 + rng() * 2.4;
    g.fillStyle = `hsl(${72 + rng() * 30},${38 + rng() * 22}%,${26 + rng() * 22}%)`;
    g.beginPath(); g.moveTo(x - w, H); g.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h); g.quadraticCurveTo(x + lean * 0.3 + w * 0.4, H - h * 0.55, x + w, H); g.fill();
  }
  const t = tex(c, true, false); return t;
}

export function softDotTexture() {
  const S = 64, c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, true, false);
}

// A low-poly pine with vertex colours, used for the background forest.
export function pineGeometry(rng, { height = 1, tiers = 5, radius = 0.22, trunk = 0.025 } = {}) {
  const parts = [];
  const tg = new THREE.CylinderGeometry(trunk * 0.5, trunk, height * 0.5, 5, 1);
  tg.translate(0, height * 0.25, 0); paint(tg, new THREE.Color('#4a3527'));
  parts.push(tg);
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1);
    const r = radius * (1 - f * 0.78) * 0.38, h = height * (0.36 - f * 0.12);
    const y = height * (0.22 + f * 0.62);
    const cg = new THREE.ConeGeometry(r, h, 7, 1, true);
    const p = cg.attributes.position;
    for (let k = 0; k < p.count; k++) {
      if (p.getY(k) < h * 0.4) { const s = 1 + (rng() - 0.5) * 0.3; p.setX(k, p.getX(k) * s); p.setZ(k, p.getZ(k) * s); p.setY(k, p.getY(k) + (rng() - 0.5) * h * 0.12); }
    }
    cg.translate(0, y + h / 2, 0);
    const col = new THREE.Color().setHSL(0.30 + rng() * 0.05, 0.38 + rng() * 0.15, 0.07 + rng() * 0.04 + f * 0.03);
    paint(cg, col);
    parts.push(cg);
  }
  const g = mergeGeoms(parts);
  return g;
}

// A fir branch spray on transparency: a stem with side twigs, needles all along both.
// u runs from the base of the branch (0) to its tip (1).
export function needleTexture(rng) {
  const W = 256, H = 128, c = canvas(W, H), g = c.getContext('2d');
  g.lineCap = 'round';
  const y0 = H / 2, stem = t => y0 + Math.sin(t * Math.PI) * 3;
  const twigs = [];
  for (let x = 10; x < W - 14; x += 8 + rng() * 5) {
    const t = x / W, side = twigs.length % 2 ? -1 : 1, reach = H * 0.44 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 1.0)), 0.7) * (0.78 + rng() * 0.27);
    const ang = 0.6 + rng() * 0.3;
    twigs.push([x, stem(t), x + Math.cos(ang) * reach, stem(t) + side * Math.sin(ang) * reach]);
  }
  // Body first, thick and dark, so the spray stays solid when it is far away and mipmapped.
  g.strokeStyle = 'hsl(118,34%,14%)';
  g.lineWidth = 15; g.beginPath(); g.moveTo(6, stem(0)); g.lineTo(W - 12, stem(1)); g.stroke();
  for (const [ax, ay, bx, by] of twigs) { g.lineWidth = 9 + rng() * 4; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + (bx - ax) * 0.82, ay + (by - ay) * 0.82); g.stroke(); }
  // Then needles over it: a dark layer and a light one, fanning forward off every twig.
  const needles = (x0, y0n, x1, y1, len, light) => {
    const n = Math.max(3, Math.hypot(x1 - x0, y1 - y0n) / 2.2), ang = Math.atan2(y1 - y0n, x1 - x0);
    for (let i = 0; i < n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0n + (y1 - y0n) * t, l = len * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + t * 0.8))) * (0.8 + rng() * 0.4);
      for (const side of [-1, 1]) {
        const d = ang + side * (0.7 + rng() * 0.35);
        g.strokeStyle = light ? `hsl(${88 + rng() * 32},${36 + rng() * 20}%,${34 + rng() * 16}%)` : `hsl(${108 + rng() * 22},${32 + rng() * 14}%,${18 + rng() * 9}%)`;
        g.lineWidth = light ? 1.6 : 2.4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(d) * l, y + Math.sin(d) * l); g.stroke();
      }
    }
  };
  for (const light of [false, true]) {
    needles(3, stem(0), W - 5, stem(1), light ? 8 : 11, light);
    for (const [ax, ay, bx, by] of twigs) needles(ax, ay, bx, by, light ? 7 : 9, light);
  }
  const t = tex(c, true, false); t.anisotropy = 8; return t;
}

// Branches for a conifer: drooping spray cards in whorls up a stem from y0 to y0 + span,
// radius R(f) at fraction f of the way up. Normals point out from the stem, so the
// crown is lit like a rounded mass rather than as flat cards.
export function frondGeometry(rng, { y0, span, R, whorls, per, segs = 4, light = 0.42, hue = 0.25 }) {
  const parts = [], col = new THREE.Color(), base = new THREE.PlaneGeometry(1, 1, segs, 1);
  base.rotateX(-Math.PI / 2); base.translate(0.5, 0, 0);
  for (let w = 0; w < whorls; w++) {
    const f = (w + rng() * 0.5) / whorls, rad = R(f), y = y0 + f * span, n = Math.max(3, Math.round(per * (0.55 + 0.45 * rad / R(0))));
    const spin = rng() * 6.28;
    for (let i = 0; i < n; i++) {
      const g = base.clone(), L = rad * (1.0 + rng() * 0.3), Wd = L * (0.55 + rng() * 0.18);
      const droop = (0.18 + rng() * 0.2) * (1 - f * 0.4), tilt = 0.12 + rng() * 0.22 + f * 0.1;
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), z = p.getZ(k);
        p.setXYZ(k, x * L, -droop * x * x * L + Math.abs(z) * 0.12 * L * x, z * Wd * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, x * 1.15 + 0.12))));
      }
      g.rotateZ(-tilt); g.rotateX((rng() - 0.5) * 0.5); g.rotateY(spin + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.4);
      g.translate(0, y, 0);
      const nr = new Float32Array(p.count * 3), cl = new Float32Array(p.count * 3);
      col.setHSL(hue + rng() * 0.06, 0.3 + rng() * 0.18, light + rng() * 0.1 + f * 0.04);
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), yy = p.getY(k) - y + rad * 0.35, z = p.getZ(k), l = Math.hypot(x, yy, z) || 1;
        nr[k * 3] = x / l; nr[k * 3 + 1] = yy / l; nr[k * 3 + 2] = z / l;
        const shade = 0.55 + 0.45 * Math.min(1, Math.hypot(x, z) / L);  // darker in toward the stem
        cl[k * 3] = col.r * shade; cl[k * 3 + 1] = col.g * shade; cl[k * 3 + 2] = col.b * shade;
      }
      g.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      parts.push(g);
    }
  }
  return mergeGeoms(parts, true);
}
export function frondMaterial(map) {
  return new THREE.MeshStandardMaterial({ map, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.88 });
}

export function paint(geo, color) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// Minimal merge for non-indexed or indexed geometries with position/normal/color (and uv if asked).
export function mergeGeoms(list, withUv = false) {
  const geos = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = withUv ? new Float32Array(n * 2) : null;
  let o = 0;
  for (const g of geos) {
    if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export function buildWorld(scene, renderer) {
  const rng = makeRng(20261102);
  const world = {};

  // Sky dome: a vertical gradient with a warm glow toward the sun.
  const sunDir = new THREE.Vector3(-0.55, 0.52, -0.66).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 top = vec3(0.30,0.50,0.74), mid = vec3(0.66,0.78,0.86), hor = vec3(0.93,0.86,0.74);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.8, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0,0.78,0.5) * (pow(s, 12.0) * 0.35 + pow(s, 600.0) * 2.0);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
  sky.renderOrder = -1; sky.frustumCulled = false;
  scene.add(sky);
  world.sky = sky;

  scene.fog = new THREE.Fog(0xb7c6c4, 30, 150);

  const hemi = new THREE.HemisphereLight(0xc7dcef, 0x4d4a2c, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2.5;
  scene.add(sun); scene.add(sun.target);
  world.sun = sun; world.sunDir = sunDir;
  world.follow = (p) => { sun.position.copy(p).addScaledVector(sunDir, 50); sun.target.position.copy(p); };

  // Ground: one big textured plane with large-scale colour variation baked into vertex colours.
  const gg = new THREE.PlaneGeometry(700, 700, 140, 140); gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position, gc = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    const n = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 - x * 0.05) * 0.5;
    const k = 0.86 + n * 0.12;
    gc[i * 3] = k * (1.0 + n * 0.05); gc[i * 3 + 1] = k; gc[i * 3 + 2] = k * 0.92;
    const d = Math.hypot(x, z); if (d > 40) gp.setY(i, Math.sin(x * 0.05) * Math.cos(z * 0.04) * Math.min(1, (d - 40) / 60) * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(gc, 3)); gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: groundTexture(rng), vertexColors: true, roughness: 0.97 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // The forest around the clearing.
  const pine = pineGeometry(rng, { height: 1, tiers: 6, radius: 0.2, trunk: 0.02 });
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const N = 520, inst = new THREE.InstancedMesh(pine, pineMat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let placed = 0;
  for (let tries = 0; placed < N && tries < 6000; tries++) {
    const a = rng() * Math.PI * 2, d = 21 + Math.pow(rng(), 0.7) * 120;
    p.set(Math.cos(a) * d, -0.1, Math.sin(a) * d);
    const h = 13 + rng() * 15 + Math.min(10, d * 0.05);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
    s.set(h * (0.85 + rng() * 0.35), h, h * (0.85 + rng() * 0.35));
    m.compose(p, q, s); inst.setMatrixAt(placed++, m);
  }
  inst.count = placed; inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
  // Branch sprays on the same trees, so the forest wall reads as needles rather than cones.
  world.needles = needleTexture(rng);
  world.frondMat = frondMaterial(world.needles);
  const fr = frondGeometry(rng, { y0: 0.22, span: 0.72, R: f => 0.21 * (1 - f * 0.82) + 0.025, whorls: 10, per: 10, segs: 2 });
  const fInst = new THREE.InstancedMesh(fr, world.frondMat, placed);
  for (let i = 0; i < placed; i++) { inst.getMatrixAt(i, m); fInst.setMatrixAt(i, m); }
  fInst.castShadow = true; fInst.receiveShadow = true;
  scene.add(fInst);

  // Grass tufts: crossed alpha-tested quads scattered around the clearing.
  const blade = grassBladeTexture(rng);
  const tuft = new THREE.PlaneGeometry(0.5, 0.42); tuft.translate(0, 0.21, 0);
  const tuft2 = tuft.clone(); tuft2.rotateY(Math.PI / 2);
  const tg = mergeTufts(tuft, tuft2);
  const grassMat = new THREE.MeshStandardMaterial({ map: blade, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
  const GN = 2600, grass = new THREE.InstancedMesh(tg, grassMat, GN);
  for (let i = 0; i < GN; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 30;
    p.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
    const k = 0.6 + rng() * 0.9; s.set(k, k * (0.7 + rng() * 0.6), k);
    m.compose(p, q, s); grass.setMatrixAt(i, m);
  }
  grass.receiveShadow = true;
  scene.add(grass);
  world.grass = grass;

  // Rocks and a few dead branches.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c7a72, roughness: 0.92, flatShading: true });
  for (let i = 0; i < 22; i++) {
    const g = new THREE.DodecahedronGeometry(0.2 + rng() * 0.5, 0);
    const pp = g.attributes.position; for (let k = 0; k < pp.count; k++) pp.setXYZ(k, pp.getX(k) * (0.8 + rng() * 0.5), pp.getY(k) * (0.5 + rng() * 0.3), pp.getZ(k) * (0.8 + rng() * 0.5));
    g.computeVertexNormals();
    const r = new THREE.Mesh(g, rockMat);
    const a = rng() * Math.PI * 2, d = 9 + rng() * 22;
    r.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d); r.rotation.y = rng() * 6;
    r.castShadow = r.receiveShadow = true; scene.add(r);
  }
  const stickMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 });
  for (let i = 0; i < 26; i++) {
    const l = 0.6 + rng() * 1.6, g = new THREE.CylinderGeometry(0.018, 0.03, l, 5); g.rotateZ(Math.PI / 2);
    const st = new THREE.Mesh(g, stickMat);
    const a = rng() * Math.PI * 2, d = 3 + rng() * 24;
    st.position.set(Math.cos(a) * d, 0.025, Math.sin(a) * d); st.rotation.y = rng() * 6;
    st.castShadow = true; scene.add(st);
  }
  return world;
}

function mergeTufts(a, b) {
  const g = new THREE.BufferGeometry();
  const pa = a.attributes.position.array, pb = b.attributes.position.array;
  const pos = new Float32Array(pa.length + pb.length); pos.set(pa); pos.set(pb, pa.length);
  const ua = a.attributes.uv.array, ub = b.attributes.uv.array;
  const uv = new Float32Array(ua.length + ub.length); uv.set(ua); uv.set(ub, ua.length);
  const nor = new Float32Array(pos.length); for (let i = 0; i < nor.length; i += 3) nor[i + 1] = 1; // lit like the ground
  const ia = Array.from(a.index.array), ib = Array.from(b.index.array).map(i => i + a.attributes.position.count);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex([...ia, ...ib]);
  return g;
}
