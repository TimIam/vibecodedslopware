// Small helpers that reproduce 68k / CodeWarrior arithmetic idioms.

// Truncating integer division (C semantics, like DIVS)
export const idiv = (a, b) => (a / b) | 0;
// Remainder with the sign of the dividend (DIVSL remainder)
export const irem = (a, b) => a % b;
// "(x/2)*2" idiom: truncate toward zero to an even number
export const even = (x) => ((x / 2) | 0) * 2;
// Arithmetic shift right (works for negatives like ASR)
export const asr = (x, n) => x >> n;
// Wrap to signed 16-bit (word arithmetic)
export const w16 = (x) => ((x & 0xffff) ^ 0x8000) - 0x8000;
// Wrap to signed 8-bit
export const w8 = (x) => ((x & 0xff) ^ 0x80) - 0x80;
// Signed 32-bit
export const w32 = (x) => x | 0;
export const abs = Math.abs;

// QuickDraw rects are [top, left, bottom, right]
export const rect = (t = 0, l = 0, b = 0, r = 0) => [t, l, b, r];
// SetRect(r, left, top, right, bottom)
export function setRect(r, left, top, right, bottom) { r[0] = top; r[1] = left; r[2] = bottom; r[3] = right; return r; }
export function offsetRect(r, dh, dv) { r[0] += dv; r[2] += dv; r[1] += dh; r[3] += dh; return r; }
export function insetRect(r, dh, dv) { r[0] += dv; r[2] -= dv; r[1] += dh; r[3] -= dh; return r; }
// SectRect: returns true if a and b intersect; writes intersection into out (if given)
export function sectRect(a, b, out) {
  const t = Math.max(a[0], b[0]), l = Math.max(a[1], b[1]);
  const bt = Math.min(a[2], b[2]), rt = Math.min(a[3], b[3]);
  const ok = t < bt && l < rt;
  if (out) { if (ok) { out[0] = t; out[1] = l; out[2] = bt; out[3] = rt; } else { out[0] = out[1] = out[2] = out[3] = 0; } }
  return ok;
}
// SAT's MYSECTRECT (no output)
export const rectsTouch = (a, b) => a[1] < b[3] && b[1] < a[3] && a[0] < b[2] && b[0] < a[2];
export function unionRect(a, b, out) {
  out[0] = Math.min(a[0], b[0]); out[1] = Math.min(a[1], b[1]);
  out[2] = Math.max(a[2], b[2]); out[3] = Math.max(a[3], b[3]);
  return out;
}
// PtInRect(pt{v,h}, r)
export const ptInRect = (v, h, r) => v >= r[0] && v < r[2] && h >= r[1] && h < r[3];
export const emptyRect = (r) => r[0] >= r[2] || r[1] >= r[3];

// Mac Toolbox Random(): Park-Miller "minimal standard" on randSeed, returns signed 16-bit
export const QD = { randSeed: 1 };
export function Random() {
  let seed = QD.randSeed >>> 0;
  // 16807 * seed mod (2^31-1)
  let hi = Math.floor(seed / 127773), lo = seed % 127773;
  let t = 16807 * lo - 2836 * hi;
  if (t <= 0) t += 0x7fffffff;
  QD.randSeed = t;
  let r = t & 0xffff;
  if (r === 0x8000) r = 0;
  return w16(r);
}
