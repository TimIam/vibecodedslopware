// Procedural, tileable textures generated on canvas: bark per species, end grain, forest floor.
import * as THREE from 'three';

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// periodic value noise
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a, p) => ((a % p) + p) % p;
  const a = hash(m(xi, px), m(yi, py), s), b = hash(m(xi + 1, px), m(yi, py), s);
  const c = hash(m(xi, px), m(yi + 1, py), s), d = hash(m(xi + 1, px), m(yi + 1, py), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, px, py, oct, s) {
  let f = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) {
    f += amp * vnoise(x, y, px, py, s + o * 17); tot += amp;
    x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
  }
  return f / tot;
}
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Bark style: returns {h: height 0..1, c: [r,g,b]} for (u,v) in [0,1)
const BARK = {
  birch(u, v, W, H) {
    const base = mix(hex('#e9e4d6'), hex('#cfc7b4'), fbm(u * 4, v * 8, 4, 8, 4, 1));
    // horizontal lenticels
    const len = vnoise(u * 10, v * 90, 10, 90, 3);
    let c = base, h = 0.6;
    if (len > 0.78) { c = mix(base, hex('#3a3430'), clamp01((len - 0.78) * 7)); h = 0.4; }
    const scar = fbm(u * 3, v * 5, 3, 5, 4, 9);
    if (scar > 0.66) { c = mix(c, hex('#1f1c1a'), clamp01((scar - 0.66) * 6)); h = 0.25; }
    const peel = fbm(u * 6, v * 30, 6, 30, 3, 5);
    if (peel > 0.62) c = mix(c, hex('#d9b98f'), 0.35);
    return { h: h + peel * 0.1, c };
  },
  aspen(u, v) {
    const base = mix(hex('#c9ccb0'), hex('#aeb39a'), fbm(u * 5, v * 6, 5, 6, 4, 2));
    let c = base, h = 0.6;
    const eye = vnoise(u * 6, v * 9, 6, 9, 11);
    if (eye > 0.8) { c = mix(base, hex('#2b2a26'), clamp01((eye - 0.8) * 6)); h = 0.3; }
    const dark = fbm(u * 2, v * 3, 2, 3, 3, 4);
    c = mix(c, hex('#6f725f'), clamp01((dark - 0.55) * 2));
    return { h, c };
  },
  pine(u, v) {
    const n = fbm(u * 10, v * 14, 10, 14, 4, 3);
    const plate = vnoise(u * 12, v * 18, 12, 18, 7);
    const f = clamp01(Math.abs(plate - 0.5) * 3);
    const c = mix(mix(hex('#3e2f24'), hex('#7b6250'), n), hex('#9c7a5e'), f * 0.4);
    return { h: 0.3 + f * 0.5 + n * 0.2, c };
  },
  ponderosa(u, v) {
    // big cinnamon plates with dark furrows (cellular)
    const s = 6, t = 9;
    let best = 9, second = 9;
    const x = u * s, y = v * t;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = Math.floor(x) + i, cy = Math.floor(y) + j;
      const px = cx + hash(((cx % s) + s) % s, ((cy % t) + t) % t, 21);
      const py = cy + hash(((cx % s) + s) % s, ((cy % t) + t) % t, 33);
      const d = Math.hypot((x - px) * 1.0, (y - py) * 0.75);
      if (d < best) { second = best; best = d; } else if (d < second) second = d;
    }
    const edge = clamp01((second - best) * 3);
    const n = fbm(u * 24, v * 30, 24, 30, 3, 8);
    const plateC = mix(hex('#b0703f'), hex('#d39a63'), n);
    const c = mix(hex('#2a1d16'), plateC, edge);
    return { h: edge * 0.8 + n * 0.2, c };
  },
  spruce(u, v) {
    const n = fbm(u * 14, v * 16, 14, 16, 4, 6);
    const flake = vnoise(u * 20, v * 26, 20, 26, 12);
    const c = mix(mix(hex('#4a4038'), hex('#80705f'), n), hex('#9a7e66'), clamp01(flake - 0.6) * 1.5);
    return { h: 0.35 + n * 0.4 + clamp01(flake - 0.6) * 0.3, c };
  },
  dfir(u, v) {
    const warp = fbm(u * 3, v * 2, 3, 2, 3, 4) * 1.4;
    const r = Math.abs(Math.sin((u * 9 + warp) * Math.PI));
    const ridge = Math.pow(r, 0.6);
    const n = fbm(u * 18, v * 9, 18, 9, 4, 2);
    const cross = vnoise(u * 9, v * 6, 9, 6, 14);
    const furrow = 1 - ridge;
    let c = mix(hex('#5e3a28'), hex('#8a5a3d'), n);
    c = mix(c, hex('#1c120d'), clamp01(furrow * 1.6 - 0.2));
    if (cross > 0.7 && ridge > 0.5) c = mix(c, hex('#2a1a12'), 0.6);
    return { h: ridge * 0.85 + n * 0.15 - (cross > 0.7 ? 0.2 : 0), c };
  },
  cedar(u, v) {
    const warp = fbm(u * 2, v * 1.5, 2, 2, 3, 6) * 2;
    const s = Math.sin((u * 26 + warp) * Math.PI);
    const strand = clamp01(s * 0.5 + 0.5);
    const n = fbm(u * 30, v * 4, 30, 4, 3, 9);
    let c = mix(hex('#5d4033'), hex('#9b7a68'), strand * 0.7 + n * 0.3);
    c = mix(c, hex('#a9a39a'), clamp01(fbm(u * 4, v * 6, 4, 6, 3, 2) - 0.55) * 1.5);
    return { h: strand * 0.7 + n * 0.3, c };
  },
  oak(u, v) {
    const warp = fbm(u * 4, v * 2, 4, 2, 3, 12) * 1.2;
    const r = Math.abs(Math.sin((u * 7 + warp) * Math.PI));
    const ridge = clamp01((r - 0.25) * 1.6);
    const n = fbm(u * 16, v * 10, 16, 10, 4, 5);
    let c = mix(hex('#2f2a25'), hex('#6a645b'), ridge * 0.8 + n * 0.2);
    if (ridge > 0.85) c = mix(c, hex('#8a857b'), 0.5); // "ski tracks"
    return { h: ridge * 0.8 + n * 0.2, c };
  },
  ash(u, v) {
    const w = fbm(u * 3, v * 3, 3, 3, 3, 7) * 0.4;
    const a = Math.abs(Math.sin((u * 8 + v * 5 + w) * Math.PI));
    const b = Math.abs(Math.sin((u * 8 - v * 5 + w) * Math.PI));
    const ridge = clamp01(Math.max(a, b) * 1.3 - 0.4);
    const n = fbm(u * 20, v * 20, 20, 20, 3, 3);
    const c = mix(hex('#3b3833'), hex('#8c877c'), ridge * 0.75 + n * 0.25);
    return { h: ridge * 0.8 + n * 0.2, c };
  },
  maple(u, v) {
    const n = fbm(u * 8, v * 4, 8, 4, 5, 13);
    const p = vnoise(u * 7, v * 5, 7, 5, 17);
    const plate = clamp01(Math.abs(p - 0.5) * 2.5);
    const c = mix(mix(hex('#4a453e'), hex('#8a8478'), n), hex('#a9a395'), plate * 0.35);
    return { h: 0.3 + plate * 0.4 + n * 0.3, c };
  },
};

const cache = new Map();

function canvasPair(W, H, fn) {
  const cc = document.createElement('canvas'), nc = document.createElement('canvas');
  cc.width = nc.width = W; cc.height = nc.height = H;
  const cctx = cc.getContext('2d'), nctx = nc.getContext('2d');
  const cimg = cctx.createImageData(W, H), nimg = nctx.createImageData(W, H);
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = fn(x / W, y / H, W, H), i = y * W + x;
    hgt[i] = r.h;
    cimg.data[i * 4] = r.c[0]; cimg.data[i * 4 + 1] = r.c[1]; cimg.data[i * 4 + 2] = r.c[2]; cimg.data[i * 4 + 3] = 255;
  }
  const strength = 3.0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = hgt[y * W + ((x - 1 + W) % W)], r = hgt[y * W + ((x + 1) % W)];
    const t = hgt[((y - 1 + H) % H) * W + x], b = hgt[((y + 1) % H) * W + x];
    let nx = (l - r) * strength, ny = (t - b) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * W + x) * 4;
    nimg.data[i] = (nx * 0.5 + 0.5) * 255; nimg.data[i + 1] = (ny * 0.5 + 0.5) * 255; nimg.data[i + 2] = (nz * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0); nctx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(cc), normal = new THREE.CanvasTexture(nc);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, normal };
}

export function barkMaterial(style) {
  const key = 'bark:' + style;
  if (!cache.has(key)) {
    const { map, normal } = canvasPair(256, 256, BARK[style] || BARK.pine);
    cache.set(key, new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.95, metalness: 0 }));
  }
  return cache.get(key);
}

// End grain: concentric rings centered at uv (0.5,0.5); r=0.5 is the bark edge.
export function endGrainMaterial(sp, rot = 0) {
  const key = 'end:' + sp.name + ':' + rot;
  if (!cache.has(key)) {
    const heart = hex(sp.heart), sap = hex(sp.sap), barkC = hex('#3a2a20');
    const { map, normal } = canvasPair(256, 256, (u, v) => {
      const dx = u - 0.5, dy = v - 0.5;
      const wob = (fbm(u * 6, v * 6, 6, 6, 3, 31) - 0.5) * 0.02;
      const r = Math.hypot(dx, dy) * 2 + wob;
      if (r > 1.0) return { h: 0.2, c: barkC };
      if (r > 0.95) return { h: 0.3, c: mix(barkC, hex('#6a4a35'), 0.4) };
      const rings = 38;
      const ring = r * rings;
      const fr = ring - Math.floor(ring);
      const late = clamp01((fr - 0.72) * 5);
      let c = r < 0.72 ? heart : mix(heart, sap, clamp01((r - 0.72) * 8));
      c = mix(c, mix(c, [60, 40, 25], 0.5), late * 0.45);
      const saw = fbm(u * 60, v * 4, 60, 4, 2, 41) * 0.08; // saw-chain marks
      c = mix(c, [255, 245, 220], saw);
      if (r < 0.03) c = mix(c, [70, 45, 30], 0.6);
      return { h: 0.5 - late * 0.1 + saw, c };
    });
    cache.set(key, new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.85 }));
  }
  return cache.get(key);
}

export function groundTextures(colors) {
  const key = 'ground:' + colors.join();
  if (!cache.has(key)) {
    const [a, b, c] = colors.map(hex);
    const tex = canvasPair(512, 512, (u, v) => {
      const n = fbm(u * 8, v * 8, 8, 8, 5, 3);
      const m = fbm(u * 3, v * 3, 3, 3, 4, 7);
      const twig = false;
      const leaf = vnoise(u * 60, v * 60, 60, 60, 9);
      let col = mix(a, b, n);
      col = mix(col, c, clamp01((m - 0.5) * 2.5));
      const fine = fbm(u * 64, v * 64, 64, 64, 3, 11);
      col = mix(col, [118, 86, 52], clamp01((leaf - 0.72) * 2.5) * 0.45);
      col = mix(col, [40, 34, 22], clamp01((0.4 - fine) * 2) * 0.35);
      if (twig) col = mix(col, [96, 72, 50], 0.6);
      return { h: n * 0.25 + fine * 0.2 + (twig ? 0.3 : 0), c: col };
    });
    cache.set(key, tex);
  }
  return cache.get(key);
}

export function rockMaterial() {
  if (!cache.has('rock')) {
    const { map, normal } = canvasPair(256, 256, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 6, 5, 77);
      const moss = fbm(u * 3, v * 3, 3, 3, 4, 78);
      let c = mix(hex('#6e6c66'), hex('#a19d94'), n);
      if (moss > 0.55) c = mix(c, hex('#4c6030'), clamp01((moss - 0.55) * 4));
      return { h: n, c };
    });
    cache.set('rock', new THREE.MeshStandardMaterial({ map, normalMap: normal, roughness: 0.9 }));
  }
  return cache.get('rock');
}
