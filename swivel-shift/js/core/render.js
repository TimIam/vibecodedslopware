// 8-bit indexed renderer reproducing Harry's custom blitters (BLITENCFACE family) and the
// palette-effect tables built by BuildTintTable / BuildTranslucTable / BuildPosterizationTable /
// BuildReddenTable.

import { CLUT8, CLUT8_U32, Bitmap } from '../gfx.js';
import { SATRand } from './sat.js';

export const SCREEN_W = 640, SCREEN_H = 480;

// ---------------------------------------------------------------- Color2Index emulation
// QuickDraw maps RGB to an index through a 4-bit-per-channel inverse table.
const itable = new Uint8Array(4096);
(function buildITable() {
  for (let r = 0; r < 16; r++) for (let g = 0; g < 16; g++) for (let b = 0; b < 16; b++) {
    const R = r * 17, Gc = g * 17, B = b * 17;
    let best = 0, bd = 1e9;
    for (let i = 0; i < 256; i++) {
      const c = CLUT8[i];
      const d = (c[0] - R) ** 2 + (c[1] - Gc) ** 2 + (c[2] - B) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    itable[(r << 8) | (g << 4) | b] = best;
  }
})();
// r,g,b are 16-bit QuickDraw components (0..65535)
export function color2Index(r, g, b) {
  const c = (x) => (x < 0 ? 0 : x > 0xffff ? 0xffff : x) >>> 12;
  return itable[(c(r) << 8) | (c(g) << 4) | c(b)];
}
const comp16 = (i) => [CLUT8[i][0] * 257, CLUT8[i][1] * 257, CLUT8[i][2] * 257];
const tdiv = (a, b) => (a / b) | 0;

// ---------------------------------------------------------------- effect tables
export const tint = [];      // g_8482: 16 x 256
export const transluc = [];  // g_a482: 16 x 256 (indexed by posterized src level, then dst color)
export const posterize = new Uint8Array(256); // g_f482
export const redden = [];    // g_c482: 8 x 256
export const glow = [];      // g_d482: 16 x 256

export function buildTables() {
  for (let t = 0; t < 16; t++) { const a = new Uint8Array(256); for (let i = 0; i < 256; i++) a[i] = i; tint.push(a); }
  const cap = (x) => (x > 0xffff ? 0xffff : x);
  for (let i = 0; i < 255; i++) {
    const [r, g, b] = comp16(i);
    const avg = tdiv(r + g + b, 3);
    tint[1][i] = color2Index(cap(avg + 10000), 0, 0);
    tint[2][i] = color2Index(cap(avg + 10000), cap(avg + 10000), 0);
    tint[3][i] = color2Index(0, 0, avg);
    tint[4][i] = color2Index(0, avg, 0xffff);
    const l = cap(avg + 0x3e80);
    tint[5][i] = color2Index(l, l, l);
    tint[6][i] = color2Index(r >>> 1, g >>> 1, b >>> 1);
    tint[7][i] = color2Index(r >>> 2, g >>> 2, b >>> 2);
    tint[8][i] = color2Index(cap(Math.trunc(r * 1.5)), cap(Math.trunc(g * 1.5)), cap(Math.trunc(b * 1.5)));
    tint[9][i] = color2Index(cap(Math.trunc(r * 2.5)), cap(Math.trunc(g * 2.5)), cap(Math.trunc(b * 2.5)));
    tint[10][i] = color2Index(SATRand(5000), avg, SATRand(5000));
    tint[11][i] = color2Index(avg, avg, avg);
    tint[12][i] = color2Index(0xffff, avg, 0);
  }
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = comp16(i);
    const avg = tdiv(r + g + b, 3);
    tint[13][i] = color2Index(r, (g + 0xffff) >> 1, (b + 0xffff) >> 1);
    tint[14][i] = color2Index(((avg >> 1) + avg) >> 1, ((avg >> 2) + (avg >> 1)) >> 1, 0);
  }
  // BuildTranslucTable
  for (let lv = 0; lv < 16; lv++) {
    const a = new Uint8Array(256);
    const add = tdiv(lv << 12, 2);
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = comp16(i);
      const R = Math.min(r + add, 0xffff), Gc = Math.min(g + add, 0xffff), B = Math.min(b + add, 0xffff);
      const y = tdiv(R + Gc + B, 3);
      a[i] = color2Index(y, y, y);
    }
    transluc.push(a);
  }
  // BuildPosterizationTable
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = comp16(i);
    let v = tdiv(r + g + b, 3) >> 12;
    posterize[i] = v > 15 ? 15 : v < 0 ? 0 : v;
  }
  // BuildReddenTable
  for (let lv = 0; lv < 8; lv++) {
    const a = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = comp16(i);
      const avg = tdiv(r + g + b, 3);
      const tr = tdiv(avg + 0xffff, 2);
      a[i] = color2Index(tdiv(r * (7 - lv), 8) + tdiv(tr * (lv + 1), 8), tdiv(g * (7 - lv), 8), tdiv(b * (7 - lv), 8));
    }
    a[255] = 255;
    redden.push(a);
  }
  for (let lv = 0; lv < 16; lv++) {
    const a = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = comp16(i);
      const avg = tdiv(r + g + b, 3);
      const tr = tdiv(avg + 0xffff, 2), tg = tr, tb = tdiv(avg + 0xffff, 4);
      a[i] = color2Index(tdiv(r * (15 - lv), 16) + tdiv(tr * (lv + 1), 16),
        tdiv(g * (15 - lv), 16) + tdiv(tg * (lv + 1), 16),
        tdiv(b * (15 - lv), 16) + tdiv(tb * (lv + 1), 16));
    }
    a[255] = 255;
    glow.push(a);
  }
}

// ---------------------------------------------------------------- blitting
// dst: Bitmap; clip: [t,l,b,r] in dst coordinates
export function blitFace(dst, face, dv, dh, clip, mode = 0, param = 0) {
  if (!face) return;
  if (param >= 32) {
    const scale = param >> 5, lvl = param & 31;
    blitScaled(dst, face, dv, dh, clip, scale, lvl ? mode : 0, lvl);
    return;
  }
  if (mode === 1 && param === -1) mode = 2;
  const t0 = Math.max(clip[0], dv, 0), l0 = Math.max(clip[1], dh, 0);
  const b0 = Math.min(clip[2], dv + face.h, dst.h), r0 = Math.min(clip[3], dh + face.w, dst.w);
  if (t0 >= b0 || l0 >= r0) return;
  const src = face.pix, fw = face.w, dp = dst.pix, dw = dst.w;
  const table = mode === 1 ? tint[param & 15] : mode === 3 ? redden[param & 7] : mode === 4 ? glow[param & 15] : null;
  for (let y = t0; y < b0; y++) {
    let si = (y - dv) * fw + (l0 - dh), di = y * dw + l0;
    for (let x = l0; x < r0; x++, si++, di++) {
      const c = src[si];
      if (!c) continue;
      if (mode === 0) dp[di] = c;
      else if (mode === 2) dp[di] = transluc[posterize[c]][dp[di]];
      else if (table) dp[di] = table[c];
    }
  }
}

// Scaled blit (BLITENCFACESCALE*): scale is 8.8 fixed (256 = 1.0); image is centred like
// FindScaledPosAndBounds (position passed in is already the scaled top-left).
export function blitScaled(dst, face, dv, dh, clip, scale, mode, lvl) {
  const sw = Math.max(1, (face.w * scale) >> 8), sh = Math.max(1, (face.h * scale) >> 8);
  const t0 = Math.max(clip[0], dv, 0), l0 = Math.max(clip[1], dh, 0);
  const b0 = Math.min(clip[2], dv + sh, dst.h), r0 = Math.min(clip[3], dh + sw, dst.w);
  if (t0 >= b0 || l0 >= r0) return;
  const table = mode === 1 ? tint[lvl & 15] : mode === 3 ? redden[lvl & 7] : mode === 4 ? glow[lvl & 15] : null;
  const src = face.pix, fw = face.w, dp = dst.pix, dw = dst.w;
  for (let y = t0; y < b0; y++) {
    const sy = (((y - dv) << 8) / scale) | 0;
    if (sy >= face.h) continue;
    for (let x = l0; x < r0; x++) {
      const sx = (((x - dh) << 8) / scale) | 0;
      if (sx >= fw) continue;
      const c = src[sy * fw + sx];
      if (!c) continue;
      const di = y * dw + x;
      if (!mode) dp[di] = c;
      else if (mode === 2) dp[di] = transluc[posterize[c]][dp[di]];
      else if (table) dp[di] = table[c];
    }
  }
}

// Copy an opaque bitmap (CopyBits srcCopy)
export function copyBits(dst, src, sv, sh, dv, dh, h, w) {
  for (let y = 0; y < h; y++) {
    const yy = dv + y, sy = sv + y;
    if (yy < 0 || yy >= dst.h || sy < 0 || sy >= src.h) continue;
    for (let x = 0; x < w; x++) {
      const xx = dh + x, sx = sh + x;
      if (xx < 0 || xx >= dst.w || sx < 0 || sx >= src.w) continue;
      dst.pix[yy * dst.w + xx] = src.pix[sy * src.w + sx];
    }
  }
}

export function fillRect(dst, r, color) {
  const t = Math.max(0, r[0]), l = Math.max(0, r[1]), b = Math.min(dst.h, r[2]), rt = Math.min(dst.w, r[3]);
  for (let y = t; y < b; y++) dst.pix.fill(color, y * dst.w + l, y * dst.w + rt);
}

// ---------------------------------------------------------------- presentation
// The 640x480 frame is converted to RGBA in an offscreen canvas. The visible canvas is either the same
// size (scaled by CSS, nearest or bilinear) or an integer multiple of it filled with nearest-neighbour
// pixels, which the browser then scales the rest of the way smoothly ("sharp bilinear").
export class Display {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = SCREEN_W; canvas.height = SCREEN_H;
    this.ctx = canvas.getContext('2d');
    this.src = document.createElement('canvas');
    this.src.width = SCREEN_W; this.src.height = SCREEN_H;
    this.sctx = this.src.getContext('2d');
    this.img = this.sctx.createImageData(SCREEN_W, SCREEN_H);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.screen = new Bitmap(SCREEN_W, SCREEN_H);
    this.gamma = 1; // 0..1 fade level
    this.palette = CLUT8_U32;
  }
  present() {
    const pix = this.screen.pix, out = this.u32, n = pix.length;
    if (this.gamma >= 1) {
      const pal = this.palette;
      for (let i = 0; i < n; i++) out[i] = pal[pix[i]];
    } else {
      const g = Math.max(0, this.gamma);
      const pal = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        const [r, gg, b] = CLUT8[i];
        pal[i] = (0xff000000 | ((b * g) << 16) | ((gg * g) << 8) | (r * g)) >>> 0;
      }
      for (let i = 0; i < n; i++) out[i] = pal[pix[i]];
    }
    if (this.canvas.width === SCREEN_W) this.ctx.putImageData(this.img, 0, 0);
    else {
      this.sctx.putImageData(this.img, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(this.src, 0, 0, this.canvas.width, this.canvas.height);
    }
  }
  // backing store = k x 640x480 (k = 1 for plain CSS scaling)
  setBackingScale(k) {
    k = Math.max(1, Math.min(8, k | 0));
    if (this.canvas.width === SCREEN_W * k) return;
    this.canvas.width = SCREEN_W * k; this.canvas.height = SCREEN_H * k;
    this.ctx = this.canvas.getContext('2d');
    this.present();
  }
}
