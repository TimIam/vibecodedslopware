// Minimal QuickDraw emulation over indexed Bitmaps: ports, pen, colours, lines, rects, text.

import { color2Index } from './render.js';
import { CLUT8 } from '../gfx.js';

// Text rendering: smooth = anti-aliased (blended into the 8-bit palette); false = 1-bit like the original
export const TextOpts = { smooth: true };

export const blackColor = 255, whiteColor = 0;
// Old-style QuickDraw colour constants -> clut8 indices
export function oldColor(c) {
  switch (c) {
    case 33: return 255;          // blackColor
    case 30: return 0;            // whiteColor
    case 205: return color2Index(0xffff, 0, 0);
    case 341: return color2Index(0, 0xffff, 0);
    case 409: return color2Index(0, 0, 0xffff);
    case 273: return color2Index(0, 0xffff, 0xffff);
    case 137: return color2Index(0xffff, 0, 0xffff);
    case 69: return color2Index(0xffff, 0xffff, 0);
    default: return 255;
  }
}

// A port can be zoomed (setZoom): callers keep using the original 640x480 coordinates and the port maps
// them to device pixels, drawing text at the larger size so it stays crisp. Used to enlarge dialogs and
// balloons when the screen is shown small (phones).
export class Port {
  constructor(bm) {
    this.bm = bm; this.fg = 255; this.bg = 0; this.penH = 0; this.penV = 0;
    this.font = 'Helvetica'; this.size = 12; this.face = 0; // face bit 1 = bold
    this.clip = [0, 0, bm.h, bm.w];
    this.z = 1; this.tx = 0; this.ty = 0;
  }
  // device = logical * z + (tx, ty)
  setZoom(zm) { if (zm) { this.z = zm.z; this.tx = zm.tx; this.ty = zm.ty; } return this; }
  X(h) { return Math.round(h * this.z + this.tx); }
  Y(v) { return Math.round(v * this.z + this.ty); }
  devRect(r) { return [this.Y(r[0]), this.X(r[1]), this.Y(r[2]), this.X(r[3])]; }
  // device clip intersected with the bitmap
  devClip() {
    const c = this.devRect(this.clip);
    return [Math.max(0, c[0]), Math.max(0, c[1]), Math.min(this.bm.h, c[2]), Math.min(this.bm.w, c[3])];
  }
  rgbFore(r, g, b) { this.fg = color2Index(r, g, b); }
  foreColor(c) { this.fg = oldColor(c); }
  backColor(c) { this.bg = oldColor(c); }
  moveTo(h, v) { this.penH = h; this.penV = v; }
  // fill device span [x0, x1) on device row y, clipped
  span(y, x0, x1, c, cl) {
    if (y < cl[0] || y >= cl[2]) return;
    x0 = Math.max(x0, cl[1]); x1 = Math.min(x1, cl[3]);
    if (x1 > x0) this.bm.pix.fill(c, y * this.bm.w + x0, y * this.bm.w + x1);
  }
  plot(h, v, c = this.fg) {
    if (this.z === 1 && this.tx === 0 && this.ty === 0) { // (fast path: no allocation)
      const r = this.clip;
      if (v >= r[0] && v < r[2] && h >= r[1] && h < r[3] && v >= 0 && h >= 0 && v < this.bm.h && h < this.bm.w)
        this.bm.pix[v * this.bm.w + h] = c;
      return;
    }
    const cl = this.devClip();
    const y0 = this.Y(v), x0 = this.X(h), y1 = Math.max(y0 + 1, this.Y(v + 1)), x1 = Math.max(x0 + 1, this.X(h + 1));
    for (let y = y0; y < y1; y++) this.span(y, x0, x1, c, cl);
  }
  lineTo(h, v) {
    let x0 = this.penH, y0 = this.penV;
    const dx = Math.abs(h - x0), dy = Math.abs(v - y0), sx = x0 < h ? 1 : -1, sy = y0 < v ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.plot(x0, y0);
      if (x0 === h && y0 === v) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    this.penH = h; this.penV = v;
  }
  paintRect(r, c = this.fg) {
    const d = this.devRect(r), cl = this.devClip();
    for (let y = d[0]; y < d[2]; y++) this.span(y, d[1], d[3], c, cl);
  }
  eraseRect(r) { this.paintRect(r, this.bg); }
  frameRect(r) {
    this.moveTo(r[1], r[0]); this.lineTo(r[3] - 1, r[0]); this.lineTo(r[3] - 1, r[2] - 1);
    this.lineTo(r[1], r[2] - 1); this.lineTo(r[1], r[0]);
  }
  textFont(f) { this.font = FONT_NAMES[f] || 'Helvetica'; }
  textSize(s) { this.size = s || 12; }
  textFace(f) { this.face = f; }
  stringWidth(s) {
    return this.z === 1 ? measure(s, this.font, this.size, this.face) : measure(s, this.font, this.size * this.z, this.face) / this.z;
  }
  drawString(s) {
    const w = drawText(this.bm, s, this.X(this.penH), this.Y(this.penV), this.fg, this.font, this.size * this.z, this.face, this.devClip());
    this.penH += w / this.z;
  }
  // FontInfo-ish metrics for TextEdit layout
  ascent() { return Math.ceil(this.size * 1.05); }
  lineHeight() { return this.size + 3; }
  // TECalText-style word wrap: CR forces a break, otherwise break at the last space that fits
  wrap(s, width) {
    const lines = [];
    for (const para of s.split('\r')) {
      let line = '';
      const words = para.split(/(?<= )/);
      for (const w of words) {
        if (line && this.stringWidth((line + w).trimEnd()) > width) { lines.push(line); line = w; }
        else line += w;
        while (this.stringWidth(line.trimEnd()) > width && line.length > 1) {
          let n = line.length - 1;
          while (n > 1 && this.stringWidth(line.slice(0, n)) > width) n--;
          lines.push(line.slice(0, n)); line = line.slice(n);
        }
      }
      lines.push(line);
    }
    return lines;
  }
  // TETextBox(text, rect, teJustLeft)
  textBox(s, r) {
    const save = this.clip;
    this.clip = [Math.max(r[0], save[0]), Math.max(r[1], save[1]), Math.min(r[2], save[2]), Math.min(r[3], save[3])];
    const lh = this.lineHeight(), asc = this.ascent();
    this.wrap(s, r[3] - r[1]).forEach((ln, i) => { this.moveTo(r[1], r[0] + asc + i * lh); this.drawString(ln.trimEnd()); });
    this.clip = save;
  }
  paintRoundRect(r, ow, oh, c = this.fg) {
    const d = this.devRect(r), cl = this.devClip();
    const rx = (ow * this.z) / 2, ry = (oh * this.z) / 2;
    for (let y = d[0]; y < d[2]; y++) {
      let inset = 0;
      const dy = y < d[0] + ry ? d[0] + ry - y - 0.5 : (y >= d[2] - ry ? y - (d[2] - ry) + 0.5 : 0);
      if (dy > 0) inset = Math.round(rx - rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      this.span(y, d[1] + inset, d[3] - inset, c, cl);
    }
  }
  // Fill a polygon given as [[h, v], ...] (even-odd, pixel centres)
  paintPoly(pts, c = this.fg) {
    const P = pts.map(([h, v]) => [h * this.z + this.tx, v * this.z + this.ty]);
    const cl = this.devClip();
    const vs = P.map((p) => p[1]);
    for (let y = Math.round(Math.min(...vs)); y < Math.round(Math.max(...vs)); y++) {
      const xs = [];
      for (let i = 0; i < P.length; i++) {
        const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y + 0.5 - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) this.span(y, Math.round(xs[k]), Math.round(xs[k + 1]), c, cl);
    }
  }
  // PenPat(gray) + PenMode(patOr) + PaintRect
  paintRectGrayOr(r, c = this.fg) {
    const d = this.devRect(r), cl = this.devClip();
    for (let y = Math.max(d[0], cl[0]); y < Math.min(d[2], cl[2]); y++) {
      for (let x = Math.max(d[1], cl[1]); x < Math.min(d[3], cl[3]); x++) if (((x ^ y) & 1) === 0) this.bm.pix[y * this.bm.w + x] = c;
    }
  }
  // CopyBits (srcCopy) of part of a picture, scaled by the port's zoom
  drawPicture(src, sv, sh, dv, dh, h, w) {
    const d = this.devRect([dv, dh, dv + h, dh + w]), cl = this.devClip();
    const fy = h / (d[2] - d[0] || 1), fx = w / (d[3] - d[1] || 1);
    for (let y = Math.max(d[0], cl[0]); y < Math.min(d[2], cl[2]); y++) {
      const sy = sv + Math.floor((y - d[0]) * fy);
      if (sy < 0 || sy >= src.h) continue;
      for (let x = Math.max(d[1], cl[1]); x < Math.min(d[3], cl[3]); x++) {
        const sx = sh + Math.floor((x - d[1]) * fx);
        if (sx >= 0 && sx < src.w) this.bm.pix[y * this.bm.w + x] = src.pix[sy * src.w + sx];
      }
    }
  }
}

// ---------------------------------------------------------------- UI zoom for small screens
// css = CSS pixels per screen pixel (set by the page layout). zoomFor(area, textSize, fit) picks a zoom
// so text of `textSize` shows at least at its original size, and never below 8pt, as far as the
// enlarged area still fits inside `fit`. Returns {z, tx, ty, dev: the enlarged area on screen}.
export const UIScale = { css: 1 };
const MIN_CSS_PX = 32 / 3; // 8pt
// the zoom that would show `textSize` at its original size (and >= 8pt) at the current screen scale
export function wantedZoom(textSize) {
  const z = Math.max(1, Math.max(textSize, MIN_CSS_PX) / (textSize * UIScale.css));
  return Math.ceil(z * 4) / 4;
}
export function zoomFor(area, textSize, fit = [0, 0, 480, 640]) {
  const h = area[2] - area[0], w = area[3] - area[1];
  const z = Math.max(1, Math.min(wantedZoom(textSize), (fit[2] - fit[0]) / h, (fit[3] - fit[1]) / w));
  if (z === 1) return { z: 1, tx: 0, ty: 0, dev: area.slice() };
  let dt = (area[0] + area[2]) / 2 - (h * z) / 2, dl = (area[1] + area[3]) / 2 - (w * z) / 2;
  dt = Math.round(Math.max(fit[0], Math.min(dt, fit[2] - h * z)));
  dl = Math.round(Math.max(fit[1], Math.min(dl, fit[3] - w * z)));
  return { z, tx: dl - area[1] * z, ty: dt - area[0] * z,
    dev: [dt, dl, Math.min(fit[2], Math.ceil(dt + h * z)), Math.min(fit[3], Math.ceil(dl + w * z))] };
}
// screen point -> the zoomed area's own coordinates
export const unzoom = (pt, zm) => (pt && zm ? { h: (pt.h - zm.tx) / zm.z, v: (pt.v - zm.ty) / zm.z } : pt);

const FONT_NAMES = { 0: 'Chicago', 1: 'Geneva', 2: 'New York', 3: 'Geneva', 4: 'Monaco', 20: 'Times', 21: 'Helvetica', 22: 'Courier' };
// Families come from fonts/fonts.css (Harry* faces); the rest are fallbacks.
const CSS_FONT = {
  Chicago: '"HarryChicago", "ChicagoFLF", "Chicago", "Charcoal", sans-serif',
  Geneva: '"HarryGeneva", Geneva, Verdana, sans-serif',
  'New York': '"New York", Georgia, serif',
  Monaco: 'Monaco, "Courier New", monospace',
  Times: 'Times, "Times New Roman", serif',
  Helvetica: '"HarryHelvetica", Helvetica, Arial, sans-serif',
  Courier: 'Courier, "Courier New", monospace',
};
export const FONT_FACES = ['HarryChicago', 'HarryGeneva', 'HarryHelvetica'];

let tctx = null;
function ctx2d() {
  if (!tctx) { const c = document.createElement('canvas'); c.width = 1024; c.height = 64; tctx = c.getContext('2d', { willReadFrequently: true }); }
  return tctx;
}
function cssFont(font, size, face) {
  return `${face & 2 ? 'italic ' : ''}${face & 1 ? 'bold ' : ''}${size}px ${CSS_FONT[font] || CSS_FONT.Helvetica}`;
}
export function measure(s, font, size, face) {
  const c = ctx2d();
  c.font = cssFont(font, size, face);
  return Math.round(c.measureText(s).width);
}
// Blend cache: (fg, bg, alpha level 0..15) -> palette index
const blendCache = new Map();
function blend(fg, bg, lv) {
  const key = (fg << 12) | (bg << 4) | lv;
  let r = blendCache.get(key);
  if (r === undefined) {
    const a = lv / 15, F = CLUT8[fg], B = CLUT8[bg];
    const mix = (i) => Math.round((F[i] * a + B[i] * (1 - a)) * 257);
    r = color2Index(mix(0), mix(1), mix(2));
    blendCache.set(key, r);
  }
  return r;
}
// Render text with (h, v) = baseline origin. Smooth mode blends the glyph coverage into the
// destination's palette colours; otherwise it is thresholded 1-bit like a Mac bitmap font.
export function drawText(bm, s, h, v, color, font, size, face, clip) {
  if (!s) return 0;
  const c = ctx2d();
  c.font = cssFont(font, size, face);
  const w = Math.min(1024, Math.ceil(c.measureText(s).width) + 2);
  const asc = Math.ceil(size * 1.0), desc = Math.ceil(size * 0.4);
  const hh = asc + desc + 2;
  c.clearRect(0, 0, w, hh);
  c.fillStyle = '#fff';
  c.textBaseline = 'alphabetic';
  c.fillText(s, 0, asc);
  const data = c.getImageData(0, 0, w, hh).data;
  const cl = clip || [0, 0, bm.h, bm.w];
  const smooth = TextOpts.smooth;
  for (let y = 0; y < hh; y++) {
    const yy = v - asc + y;
    if (yy < cl[0] || yy >= cl[2] || yy < 0 || yy >= bm.h) continue;
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (smooth ? a < 20 : a < 110) continue;
      const xx = h + x;
      if (xx < cl[1] || xx >= cl[3] || xx < 0 || xx >= bm.w) continue;
      const i = yy * bm.w + xx;
      bm.pix[i] = !smooth || a > 235 ? color : blend(color, bm.pix[i], (a * 15 / 255) | 0);
    }
  }
  return Math.round(c.measureText(s).width);
}
