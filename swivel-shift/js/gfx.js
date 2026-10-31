// Graphics decoders. Everything is kept 8-bit indexed in the Mac system palette (clut 8),
// exactly like the original renders into 8-bit GWorlds. Index 0 (white) is "transparent"
// for encoded faces, matching EncodeRect in the original.

export const CLUT8 = (() => {
  const pal = [];
  for (let i = 0; i < 215; i++)
    pal.push([0xff - 0x33 * Math.floor(i / 36), 0xff - 0x33 * (Math.floor(i / 6) % 6), 0xff - 0x33 * (i % 6)]);
  const ramp = [0xee, 0xdd, 0xbb, 0xaa, 0x88, 0x77, 0x55, 0x44, 0x22, 0x11];
  for (const v of ramp) pal.push([v, 0, 0]);
  for (const v of ramp) pal.push([0, v, 0]);
  for (const v of ramp) pal.push([0, 0, v]);
  for (const v of ramp) pal.push([v, v, v]);
  pal.push([0, 0, 0]);
  return pal;
})();

// RGBA (little-endian Uint32) version for fast framebuffer conversion
export const CLUT8_U32 = new Uint32Array(CLUT8.map(([r, g, b]) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0));

const nearestCache = new Map();
export function nearestIndex(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  let v = nearestCache.get(key);
  if (v !== undefined) return v;
  let best = 0, bd = 1e9;
  for (let i = 0; i < 256; i++) {
    const c = CLUT8[i];
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bd) { bd = d; best = i; if (d === 0) break; }
  }
  nearestCache.set(key, best);
  return best;
}

// Indexed bitmap
export class Bitmap {
  constructor(w, h, pix) { this.w = w; this.h = h; this.pix = pix || new Uint8Array(w * h); }
  sub(x, y, w, h) {
    const b = new Bitmap(w, h);
    for (let j = 0; j < h; j++) {
      const sy = y + j;
      if (sy < 0 || sy >= this.h) continue;
      for (let i = 0; i < w; i++) {
        const sx = x + i;
        if (sx >= 0 && sx < this.w) b.pix[j * w + i] = this.pix[sy * this.w + sx];
      }
    }
    return b;
  }
}

// A "face" (SAT terminology): rect (0,0,h,w), opaque bounds, indexed pixels with 0 = transparent.
export class Face {
  constructor(w, h, pix, bounds) {
    this.w = w; this.h = h; this.pix = pix;
    this.bounds = bounds || [0, 0, h, w]; // top,left,bottom,right of opaque pixels
  }
  static fromBitmap(bm) {
    // EncodeRect: opaque bounds of nonzero pixels (with the original's off-by-one quirks)
    let top = -1, bottom = 0, left = 0x7fff, right = 0;
    for (let y = 0; y < bm.h; y++) {
      let rowAny = false;
      for (let x = 0; x < bm.w; x++) {
        if (bm.pix[y * bm.w + x]) {
          if (!rowAny) { if (x < left) left = x; rowAny = true; }
          if (x > right) right = x;
        }
      }
      if (rowAny) { if (top < 0) top = y; bottom = y; }
    }
    if (top < 0) top = 0;
    const b = [Math.max(0, top - 1), Math.max(0, left - 1), bottom + 1, right + 1];
    return new Face(bm.w, bm.h, bm.pix, b);
  }
}

// ---------------------------------------------------------------- HrSp (encoded face cache)
export function decodeHrSp(d) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const rect = [dv.getInt16(0), dv.getInt16(2), dv.getInt16(4), dv.getInt16(6)];
  const bounds = [dv.getInt16(8), dv.getInt16(10), dv.getInt16(12), dv.getInt16(14)];
  const h = rect[2] - rect[0], w = rect[3] - rect[1];
  const pix = new Uint8Array(Math.max(1, w * h));
  let p = 16, y = -1, x = 0;
  while (p + 4 <= d.length) {
    const word = dv.getUint32(p); p += 4;
    const op = word >>> 24, arg = word & 0xffffff;
    if (op === 0) break;
    if (op === 1) { y++; x = 0; }
    else if (op === 3) x += arg;
    else if (op === 2) {
      if (y >= 0 && y < h) pix.set(d.subarray(p, p + Math.min(arg, w - x)), y * w + x);
      x += arg;
      p += (arg + 3) & ~3;
    } else throw new Error('bad HrSp op ' + op);
  }
  return new Face(w, h, pix, bounds);
}

// ---------------------------------------------------------------- PICT
function unpackBits(d, p, n, out) {
  const end = p + n;
  while (p < end) {
    const c = d[p++];
    if (c < 128) { for (let i = 0; i <= c; i++) out.push(d[p++]); }
    else if (c > 128) { const v = d[p++]; for (let i = 0; i < 257 - c; i++) out.push(v); }
  }
}
function unpackWords(d, p, n, out) {
  const end = p + n;
  while (p < end) {
    const c = d[p++];
    if (c < 128) { for (let i = 0; i < 2 * (c + 1); i++) out.push(d[p++]); }
    else if (c > 128) { const a = d[p++], b = d[p++]; for (let i = 0; i < 257 - c; i++) out.push(a, b); }
  }
}

function readCtab(dv, p) {
  const flags = dv.getUint16(p + 4), size = dv.getUint16(p + 6);
  p += 8;
  const map = new Uint8Array(256);
  for (let i = 0; i <= size; i++) {
    const val = dv.getUint16(p), r = dv.getUint16(p + 2) >> 8, g = dv.getUint16(p + 4) >> 8, b = dv.getUint16(p + 6) >> 8;
    p += 8;
    const idx = (flags & 0x8000) ? i : val;
    if (idx < 256) map[idx] = nearestIndex(r, g, b);
  }
  return [map, p];
}

// Decode a PICT resource into an indexed Bitmap the size of its frame (white background).
export function decodePICT(d) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let p = 2;
  const top = dv.getInt16(p), left = dv.getInt16(p + 2), bottom = dv.getInt16(p + 4), right = dv.getInt16(p + 6);
  p += 8;
  const W = right - left, H = bottom - top;
  const out = new Bitmap(W, H);
  let v2 = false;
  if (d[p] === 0x11 && d[p + 1] === 0x01) p += 2;
  else if (dv.getUint32(p) === 0x001102ff) { v2 = true; p += 4; }
  else throw new Error('unknown PICT version');

  const region = () => { const n = dv.getUint16(p); p += n; };
  const bits = (op) => {
    const direct = op === 0x9a || op === 0x9b;
    if (direct) p += 4;
    let rowBytes = dv.getUint16(p);
    const isPix = !!(rowBytes & 0x8000);
    rowBytes &= 0x3fff;
    const bt = dv.getInt16(p + 2), bl = dv.getInt16(p + 4), bb = dv.getInt16(p + 6), br = dv.getInt16(p + 8);
    p += 10;
    let map = null, pixelSize = 1, cmpCount = 1, packType = 0;
    if (isPix) {
      packType = dv.getUint16(p + 2);
      pixelSize = dv.getUint16(p + 18);
      cmpCount = dv.getUint16(p + 20);
      p += 36;
      if (!direct) [map, p] = readCtab(dv, p);
    } else {
      map = new Uint8Array(256); map[0] = 0; map[1] = 255;
    }
    const st = dv.getInt16(p), sl = dv.getInt16(p + 2), sb = dv.getInt16(p + 4), sr = dv.getInt16(p + 6);
    const dt = dv.getInt16(p + 8), dl = dv.getInt16(p + 10);
    p += 18;
    if (op === 0x91 || op === 0x99 || op === 0x9b) region();
    const bw = br - bl, bh = bb - bt;
    for (let y = 0; y < bh; y++) {
      let row;
      if (rowBytes < 8 || packType === 1) { row = d.subarray(p, p + rowBytes); p += rowBytes; }
      else {
        let n;
        if (rowBytes > 250) { n = dv.getUint16(p); p += 2; } else n = d[p++];
        const a = [];
        if (pixelSize === 16 && direct) unpackWords(d, p, n, a); else unpackBits(d, p, n, a);
        row = a;
        p += n;
      }
      const sy = bt + y;
      if (sy < st || sy >= sb) continue;
      const oy = dt + (sy - st) - top;
      if (oy < 0 || oy >= H) continue;
      for (let x = 0; x < bw; x++) {
        const sx = bl + x;
        if (sx < sl || sx >= sr) continue;
        const ox = dl + (sx - sl) - left;
        if (ox < 0 || ox >= W) continue;
        let c;
        if (direct && pixelSize === 32) {
          c = cmpCount >= 3
            ? nearestIndex(row[x + (cmpCount - 3) * bw], row[x + (cmpCount - 2) * bw], row[x + (cmpCount - 1) * bw])
            : nearestIndex(row[4 * x + 1], row[4 * x + 2], row[4 * x + 3]);
        } else if (direct && pixelSize === 16) {
          const v = (row[2 * x] << 8) | row[2 * x + 1];
          c = nearestIndex(((v >> 10) & 31) * 255 / 31 | 0, ((v >> 5) & 31) * 255 / 31 | 0, (v & 31) * 255 / 31 | 0);
        } else {
          const bp = x * pixelSize;
          const byte = row[bp >> 3] || 0;
          c = map[(byte >> (8 - pixelSize - (bp & 7))) & ((1 << pixelSize) - 1)];
        }
        out.pix[oy * W + ox] = c;
      }
    }
  };

  while (p < d.length) {
    let op;
    if (v2) { p += p & 1; op = dv.getUint16(p); p += 2; } else op = d[p++];
    if (op === 0xff) break;
    switch (op) {
      case 0x00: case 0x1e: break;
      case 0x0c00: p += 24; break;
      case 0x01: region(); break;
      case 0x11: case 0x04: p += 1; break;
      case 0x1a: case 0x1b: case 0x1d: case 0x1f: case 0x22: p += 6; break;
      case 0x03: case 0x05: case 0x08: case 0x0d: case 0x15: case 0x16: case 0x23: case 0xa0: p += 2; break;
      case 0x06: case 0x07: case 0x0b: case 0x0c: case 0x0e: case 0x0f: case 0x21: p += 4; break;
      case 0x02: case 0x09: case 0x0a: case 0x10: case 0x20:
      case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: p += 8; break;
      case 0x90: case 0x91: case 0x98: case 0x99: case 0x9a: case 0x9b: bits(op); break;
      case 0xa1: p += 2; p += 2 + dv.getUint16(p); break;
      case 0x28: p += 4; p += 1 + d[p]; break;
      case 0x29: case 0x2a: p += 1; p += 1 + d[p]; break;
      case 0x2b: p += 2; p += 1 + d[p]; break;
      case 0x2c: case 0x2e: p += 2 + dv.getUint16(p); break;
      default:
        if ((op >= 0x70 && op <= 0x74) || (op >= 0x80 && op <= 0x84)) region();
        else if (op >= 0x8100) p += 4 + dv.getUint32(p);
        else if (op >= 0x0100 && op <= 0x7fff) p += (op >> 8) * 2;
        else if (op >= 0x38 && op <= 0x3c) { /* no data */ }
        else throw new Error('unhandled PICT opcode ' + op.toString(16));
    }
  }
  return out;
}

// ---------------------------------------------------------------- cicn
// Decode a cicn the way Load1EncFaceFromCicn does: EraseRect (white) + PlotCIcon, then encode.
export function decodeCicnBitmap(d) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const pmRowBytes = dv.getUint16(4) & 0x3fff;
  const t = dv.getInt16(6), l = dv.getInt16(8), b = dv.getInt16(10), r = dv.getInt16(12);
  const pixelSize = dv.getUint16(32);
  const mRowBytes = dv.getUint16(54), bRowBytes = dv.getUint16(68);
  const h = b - t, w = r - l;
  let p = 82;
  const mask = d.subarray(p, p + mRowBytes * h); p += mRowBytes * h;
  p += bRowBytes * h;
  let map;
  [map, p] = readCtab(dv, p);
  const pix = d.subarray(p, p + pmRowBytes * h);
  const bm = new Bitmap(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = mRowBytes ? (mask[y * mRowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 : 1;
    if (!m) continue;
    const bp = x * pixelSize;
    const byte = pix[y * pmRowBytes + (bp >> 3)];
    bm.pix[y * w + x] = map[(byte >> (8 - pixelSize - (bp & 7))) & ((1 << pixelSize) - 1)];
  }
  return bm;
}

// Convert an indexed bitmap/face to an HTML canvas (for debugging / UI)
export function toCanvas(bm, transparent0 = false) {
  const c = document.createElement('canvas');
  c.width = bm.w; c.height = bm.h;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(bm.w, bm.h);
  const u32 = new Uint32Array(id.data.buffer);
  for (let i = 0; i < bm.w * bm.h; i++) {
    const v = bm.pix[i];
    u32[i] = transparent0 && v === 0 ? 0 : CLUT8_U32[v];
  }
  ctx.putImageData(id, 0, 0);
  return c;
}
