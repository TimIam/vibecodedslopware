// The 8-bit "hardware": one palette, string-art sprites, a 5x7 font, and a particle helper every game shares.
export const W = 256, H = 240;

export const C = {
  k: '#0b0b12', K: '#34343f', g: '#7b7b88', G: '#b9b9c4', w: '#f6f6ee',
  r: '#d6322c', R: '#7e1d26', o: '#f0812c', y: '#f8d848', Y: '#b88a1e',
  n: '#9a5a2c', N: '#55301e', t: '#ecb98c',
  e: '#3aa84a', E: '#1c5a38', l: '#9ce04c',
  b: '#2c5fd0', B: '#1a2a6c', c: '#4cc8e8', s: '#9ad8f8',
  p: '#f08cb8', P: '#6a35a8', m: '#d040b0',
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// A sprite is an array of strings, one palette letter per pixel, '.' transparent. Canvases are built on first draw.
export function spr(rows) {
  const w = Math.max(...rows.map(r => r.length));
  return { rows, w, h: rows.length, img: null, flipped: null };
}

function bake(s) {
  const c = canvas(s.w, s.h), x = c.getContext('2d');
  s.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = C[row[i]];
      if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
    }
  });
  s.img = c;
  const f = canvas(s.w, s.h), fx = f.getContext('2d');
  fx.translate(s.w, 0); fx.scale(-1, 1); fx.drawImage(c, 0, 0);
  s.flipped = f;
}

export function recolor(s, map) { return spr(s.rows.map(r => r.replace(/./g, ch => map[ch] ?? ch))); }

// quarter turns clockwise
export function turn(s, n = 1) {
  let rows = s.rows.map(r => r.padEnd(s.w, '.'));
  for (let k = 0; k < (n & 3); k++) {
    const h = rows.length, w = rows[0].length, out = [];
    for (let x = 0; x < w; x++) { let line = ''; for (let y = h - 1; y >= 0; y--) line += rows[y][x]; out.push(line); }
    rows = out;
  }
  return spr(rows);
}

// classic 5x7 column font, ASCII 32..90
const FONT = [
  '0000000000', '00005F0000', '0007000700', '147F147F14', '242A7F2A12', '2313086462', '3649552250', '0005030000',
  '001C224100', '0041221C00', '14083E0814', '08083E0808', '0050300000', '0808080808', '0060600000', '2010080402',
  '3E5149453E', '00427F4000', '4261514946', '2141454B31', '1814127F10', '2745454539', '3C4A494930', '0171090503',
  '3649494936', '064949291E', '0036360000', '0056360000', '0814224100', '1414141414', '0041221408', '0201510906',
  '324979413E', '7E1111117E', '7F49494936', '3E41414122', '7F4141221C', '7F49494941', '7F09090901', '3E4149497A',
  '7F0808087F', '00417F4100', '2040413F01', '7F08142241', '7F40404040', '7F020C027F', '7F0408107F', '3E4141413E',
  '7F09090906', '3E4151215E', '7F09192946', '4649494931', '01017F0101', '3F4040403F', '1F2040201F', '3F4038403F',
  '6314081463', '0708700807', '6151494543',
].join('');

const GLYPH_W = 6, GLYPH_H = 8;
const atlases = new Map();
function atlas(col) {
  let a = atlases.get(col);
  if (a) return a;
  a = canvas(59 * GLYPH_W, GLYPH_H);
  const x = a.getContext('2d');
  x.fillStyle = col;
  for (let g = 0; g < 59; g++) for (let i = 0; i < 5; i++) {
    const bits = parseInt(FONT.substr(g * 10 + i * 2, 2), 16);
    for (let j = 0; j < 7; j++) if (bits & (1 << j)) x.fillRect(g * GLYPH_W + i, j, 1, 1);
  }
  atlases.set(col, a);
  return a;
}

export function makeGfx(cnv) {
  const c = cnv.getContext('2d', { alpha: false });
  c.imageSmoothingEnabled = false;
  const g = {
    c,
    reset() { c.setTransform(1, 0, 0, 1, 0, 0); },
    offset(x, y) { c.setTransform(1, 0, 0, 1, x, y); },
    clear(col) { c.fillStyle = col; c.fillRect(0, 0, W, H); },
    rect(x, y, w, h, col) { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); },
    box(x, y, w, h, col) { g.rect(x, y, w, 1, col); g.rect(x, y + h - 1, w, 1, col); g.rect(x, y, 1, h, col); g.rect(x + w - 1, y, 1, h, col); },
    panel(x, y, w, h) { g.rect(x, y, w, h, C.k); g.box(x, y, w, h, C.G); g.box(x + 2, y + 2, w - 4, h - 4, C.K); },
    line(x0, y0, x1, y1, col) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      c.fillStyle = col;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        c.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e = 2 * err;
        if (e >= dy) { err += dy; x0 += sx; }
        if (e <= dx) { err += dx; y0 += sy; }
      }
    },
    spr(s, x, y, flip = false, scale = 1) {
      if (!s.img) bake(s);
      c.drawImage(flip ? s.flipped : s.img, x | 0, y | 0, s.w * scale, s.h * scale);
    },
    text(str, x, y, col = C.w, scale = 1) {
      str = String(str).toUpperCase();
      const a = atlas(col);
      x |= 0; y |= 0;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i) - 32;
        if (code > 0 && code < 59) c.drawImage(a, code * GLYPH_W, 0, GLYPH_W, GLYPH_H, x, y, GLYPH_W * scale, GLYPH_H * scale);
        x += GLYPH_W * scale;
      }
    },
    width: (str, scale = 1) => String(str).length * GLYPH_W * scale - scale,
    center(str, y, col, scale = 1, drop = 0) { g.text(str, ((W - g.width(str, scale)) >> 1) + drop, y, col, scale); },
    textR(str, right, y, col, scale = 1) { g.text(str, right - g.width(str, scale), y, col, scale); },
    wrap(str, x, y, w, col, lh = 10) {
      let line = '';
      for (const word of str.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (g.width(next) > w) { g.text(line, x, y, col); y += lh; line = word; } else line = next;
      }
      if (line) g.text(line, x, y, col);
      return y + lh;
    },
    // an offscreen 1:1 layer for scenery that never changes
    layer(w, h, paint) {
      const lc = canvas(w, h), sub = makeGfx(lc);
      paint(sub);
      return { w, h, img: lc, flipped: lc };
    },
  };
  return g;
}

// sparks and floating score text; call update() once a tick and draw(g) once a frame
export function particles(a) {
  const ps = [], pops = [];
  return {
    burst(x, y, cols, n = 10, speed = 1.6, life = 26, gravity = 0.05) {
      for (let i = 0; i < n; i++) {
        const ang = a.rand() * Math.PI * 2, v = speed * (0.3 + a.rand());
        ps.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, l: life * (0.5 + a.rand() * 0.5), col: Array.isArray(cols) ? a.pick(cols) : cols, g: gravity });
      }
      if (ps.length > 400) ps.splice(0, ps.length - 400);
    },
    pop(text, x, y, col = C.w, life = 40) { pops.push({ text: String(text), x, y, l: life, col }); },
    update() {
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; p.x += p.vx; p.y += p.vy; p.vy += p.g;
        if (--p.l <= 0) ps.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) { pops[i].y -= 0.4; if (--pops[i].l <= 0) pops.splice(i, 1); }
    },
    draw(g, ox = 0, oy = 0) {
      for (const p of ps) g.rect(p.x - ox, p.y - oy, 2, 2, p.col);
      for (const p of pops) g.text(p.text, Math.max(2, Math.min(W - g.width(p.text) - 2, p.x - ox - (g.width(p.text) >> 1))), p.y - oy, p.col);
    },
    clear() { ps.length = 0; pops.length = 0; },
  };
}
