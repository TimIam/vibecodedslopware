// The startup loading bar (Init3DProgBar / Update3DProgBar, seg 2): a blue, cylinder-shaded bar with a grey
// drop shadow, drawn over the title picture (PICT 128) at (205, 423), 228 wide. The original grew it as the
// sprite faces loaded: every Load1EncFace* / LoadEncFaceSetFromPICT face added 72/65536.

// SetColorPerc(color, r%, g%, b%)
const pct = (r, g, b) => [r, g, b].map((p) => Math.trunc((p * 0xffff) / 100));
const C = {
  black: pct(0, 0, 0),          // g_7286
  c728c: pct(0, 0, 55),
  c7292: pct(19, 19, 61),
  c7298: pct(39, 39, 81),
  c729e: pct(61, 61, 100),
  c72a4: pct(81, 81, 100),
  white: pct(100, 100, 100),    // g_72aa
  c72b0: pct(32, 32, 32),       // shadow
  c72b6: pct(55, 55, 55),
  c72bc: pct(40, 40, 80),       // stub (bar shorter than 9 pixels)
};
// column at h+1 and the rows of the body, top to bottom (the cylinder shading)
const EDGE = [C.c729e, C.c72a4, C.white, C.white, C.white, C.c72a4, C.c729e, C.c7298, C.c7292];
const BODY = [C.c7298, C.c729e, C.c72a4, C.white, C.c72a4, C.c729e, C.c7298, C.c7292, C.c728c];

const Bar = { h: 0, v: 0, w: 0, len: 0, frac: 0 }; // g_45fe, g_45fc, g_45fa, g_45f8, g_80c6

export function init3DProgBar(h, v, w) { Object.assign(Bar, { h, v, w, len: 0, frac: 0 }); }
export const progBarFraction = () => Bar.frac;

// frac: 16.16 (0x10000 = full). Small steps (under 3 pixels) wait until there is more to draw.
export function update3DProgBar(port, frac) {
  if (frac > 0x10000) frac = 0x10000;
  Bar.frac = frac;
  const { h, v, w } = Bar;
  const len = Math.trunc((w * frac) / 0x10000);
  if (len === Bar.len) return;
  if (Math.abs(len - Bar.len) + 5 < 8 && frac < 0xe290) return;
  Bar.len = len;
  const line = (c, x0, y0, x1, y1) => { port.rgbFore(...c); port.moveTo(x0, y0); port.lineTo(x1, y1); };
  if (len > 8) {
    line(C.c7298, h, v, h, v + 9);
    EDGE.forEach((c, i) => line(c, h + 1, v + i, h + 1, v + i));
    BODY.forEach((c, i) => line(c, h + 2, v + i, h + 2 + len - 4, v + i));
    const x = h + len - 2; // rounded right end
    line(C.c7298, x, v, x, v);
    line(C.c7292, x, v + 1, x, v + 7);
    line(C.c728c, x, v + 8, x, v + 8);
    line(C.c728c, x + 1, v, x + 1, v + 8);
  } else {
    port.rgbFore(...C.c72bc);
    port.paintRect([v, h, v + 9, h + len + 1]);
  }
  line(C.black, h + len, v, h + len, v + 8);
  if (w - len > 2) line(C.c72b0, h + len + 1, v, h + len + 1, v + 8);
  if (w - len > 3) line(C.c72b6, h + len + 2, v, h + len + 2, v + 8);
}
