// Collision masks replacing QuickDraw regions (REGIONBOUNCE / REGIONSEPARATE in seg 6).
// A mask is a bitmap of "solid" pixels in local coordinates with its bounding box.

export class Mask {
  constructor(w, h, bits) {
    this.w = w; this.h = h; this.bits = bits || new Uint8Array(w * h);
    this.updateBBox();
  }
  updateBBox() {
    let t = 1e9, l = 1e9, b = -1e9, r = -1e9;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.bits[y * this.w + x]) { if (y < t) t = y; if (y + 1 > b) b = y + 1; if (x < l) l = x; if (x + 1 > r) r = x + 1; }
    }
    this.empty = b < 0;
    this.bbox = this.empty ? [0, 0, 0, 0] : [t, l, b, r];
  }
}

// cicn mask bits (SATGetFace's region)
export function maskFromCicn(d) {
  if (!d) return null;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const t = dv.getInt16(6), l = dv.getInt16(8), b = dv.getInt16(10), r = dv.getInt16(12);
  const mRowBytes = dv.getUint16(54);
  const h = b - t, w = r - l;
  const m = new Mask(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    m.bits[y * w + x] = (d[82 + y * mRowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
  m.updateBBox();
  return m;
}

// Region of black pixels of an indexed bitmap cell (BitMapToRegion of a 1-bit PICT)
export function maskFromBitmap(bm, x0, y0, w, h) {
  const m = new Mask(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x, sy = y0 + y;
    if (sx < bm.w && sy < bm.h && bm.pix[sy * bm.w + sx] !== 0) m.bits[y * w + x] = 1;
  }
  m.updateBBox();
  return m;
}

// BuildMaskRegion: Threshold255Blit packs pixel i of each byte into bit i (LSB-first), but QuickDraw
// reads bit 7 as the leftmost pixel, so the original's face masks are mirrored within 8-pixel groups.
export function maskFromFace(face) {
  const w = face.w, h = face.h;
  const m = new Mask(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!face.pix[y * w + x]) continue;
    const mx = (x & ~7) | (7 - (x & 7));
    if (mx < w) m.bits[y * w + mx] = 1;
  }
  m.updateBBox();
  return m;
}

// Bounding box of the intersection of mask a at (ah,av) and mask b at (bh,bv), or null.
export function intersectBBox(a, ah, av, b, bh, bv) {
  const t0 = Math.max(av + a.bbox[0], bv + b.bbox[0]), l0 = Math.max(ah + a.bbox[1], bh + b.bbox[1]);
  const b0 = Math.min(av + a.bbox[2], bv + b.bbox[2]), r0 = Math.min(ah + a.bbox[3], bh + b.bbox[3]);
  if (t0 >= b0 || l0 >= r0) return null;
  let t = 1e9, l = 1e9, bb = -1e9, r = -1e9;
  for (let y = t0; y < b0; y++) {
    const ay = y - av, by = y - bv;
    for (let x = l0; x < r0; x++) {
      if (a.bits[ay * a.w + (x - ah)] && b.bits[by * b.w + (x - bh)]) {
        if (y < t) t = y; if (y + 1 > bb) bb = y + 1; if (x < l) l = x; if (x + 1 > r) r = x + 1;
      }
    }
  }
  return bb < 0 ? null : [t, l, bb, r];
}

const half = (x) => (x / 2) | 0;

// REGIONBOUNCE(sprite, cellPt, 40, spriteRgn, tileRgn): if the sprite mask (at where) overlaps the
// tile mask (at cell), push the sprite's `where` out (REGIONSEPARATE) and return true.
export function regionBounce(s, cellV, cellH, spriteMask, tileMask) {
  if (!spriteMask || !tileMask) return false;
  const inter = intersectBBox(spriteMask, s.h, s.v, tileMask, cellH, cellV);
  if (!inter) return false;
  regionSeparate(s, spriteMask, tileMask, cellV, cellH, inter);
  return true;
}

function regionSeparate(s, sm, tm, cellV, cellH, inter) {
  const sb = sm.bbox;
  const sl = s.h + sb[1], sr = s.h + sb[3], st = s.v + sb[0], sbt = s.v + sb[2];
  const dH = half(sl + sr) - half(inter[1] + inter[3]);
  const dV = half(st + sbt) - half(inter[0] + inter[2]);
  const d5 = Math.abs(dH), d4 = Math.abs(dV);
  const d7 = Math.sign(dH);
  let d6 = Math.sign(dV);
  if (d7 === 0 && d6 === 0) d6 = 1;
  let err = 0;
  for (let guard = 0; guard < 512; guard++) {
    if (d5 > d4) {
      s.h += d7; err += d4;
      if (err > d5) { s.v += d6; err -= d5; }
    } else {
      s.v += d6; err += d5;
      if (err > d4) { s.h += d7; err -= d4; }
    }
    if (!intersectBBox(sm, s.h, s.v, tm, cellH, cellV)) break;
  }
}
