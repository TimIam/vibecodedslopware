// VIBE CODED SLOPWARE: the studio splash. No assets, no dependencies.
//
// Opt-in, one game at a time. Put it before the game's own scripts so it covers the first frame:
//   <script src="/splash.js"></script>                 plays on load
//   <script src="/splash.js" data-manual></script>     waits for SlopwareSplash.play()
//   <script src="/splash.js" data-always></script>     plays on every load, not once per tab
//   await SlopwareSplash.ready                         resolves when it is gone
//
// It plays once per tab per page, any key or tap skips it, and input never
// reaches the game underneath while it is up. It stays out of the way of
// headless test bots (navigator.webdriver), iframes, the home page and the shop.
//   ?splash=1     force it        ?splash=0     suppress it
//   ?splash=2.5   freeze at 2.5s, for screenshots
//
// Built like a SNES frame: an indexed framebuffer, an RGB555 palette, 16-step
// brightness, palette cycling, a Mode 7 floor, mosaic and an iris wipe.
(function () {
  'use strict';
  if (window.SlopwareSplash) return;

  const BASE_W = 320, BASE_H = 180;
  // Seconds. Scene time is a pure function of t, so any moment can be rendered.
  const T = { fadeIn: 0.45, vibe: 0.3, pour: 0.95, hit: 1.18, fillDur: 0.42, pourEnd: 1.75, pop: 1.85, shades: 2.3, land: 2.55, shine: 2.6, type: 2.7, exit: 4.0 };
  const EXIT = { mosaic: 0.22, iris: 0.32 }, SKIP = { mosaic: 0.1, iris: 0.2 };
  const WATCHDOG_MS = 12000;
  const STILL_HOLD = 1.5, STILL_FADE = 0.3, STILL_SCENE = 3.4;
  const TAGLINES = [
    '100% HAND-PROMPTED',
    'NO REFUNDS. ONLY VIBES.',
    'IT WORKED WHEN I PROMPTED IT',
    'TESTED ON AT LEAST ONE COMPUTER',
    'SHIPPED WITHOUT READING THE DIFF',
    'PART OF A BALANCED SLOP DIET',
  ];

  // ---- palette (5 bits per channel, like the real thing) -------------------
  const PAL = [[0, 0, 0]];
  const parse = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const add = rgb => { PAL.push(rgb.map(c => Math.round(c) >> 3)); return PAL.length - 1; };
  const color = hex => add(parse(hex));
  function ramp(stops, n) {
    const rgb = stops.map(parse), out = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) * (rgb.length - 1), a = Math.min(Math.floor(f), rgb.length - 2), k = f - a;
      out.push(add(rgb[a].map((c, j) => c + (rgb[a + 1][j] - c) * k)));
    }
    return out;
  }
  const SKY = ramp(['#0b0630', '#2a0f66', '#6a1a8c', '#c42a7c', '#ff6a4a', '#ffb45e'], 28);
  const SUN = ramp(['#fff6a8', '#ffd24a', '#ff8a3a', '#ff3f7f', '#c0207a'], 14);
  const FLOOR_A = ramp(['#ff9a6a', '#7a1f8f', '#2a0f5e', '#160838'], 10);
  const FLOOR_B = ramp(['#ff9a6a', '#b0259a', '#5a1a96', '#2c1070'], 10);
  const GOO = ramp(['#06281e', '#0e5238', '#1c8a3c', '#44c23a', '#8cec48', '#d8ff86', '#f4ffd0', '#ffffff'], 8);
  const CHROME_TOP = ramp(['#ffffff', '#9fe6ff', '#2f80e8', '#101a6a'], 11);
  const CHROME_BOT = ramp(['#ff4aa8', '#ffb0d8', '#ffffff'], 10);
  const STAR = ramp(['#4a4a8a', '#ffffff'], 4);
  const RIDGE_FAR = color('#3c1670'), RIDGE_NEAR = color('#1e0b46');
  const OUT = color('#100728'), WHITE = color('#ffffff'), LENS = color('#2c2c4c'), TEXT = color('#fff0c0');
  // Reserved block the slime shimmer rotates through each frame.
  const CYCLE_RGB = ['#33b83c', '#3ec43c', '#4fd23c', '#5fdc3a', '#6fe63e', '#5fdc3a', '#4fd23c', '#3ec43c'].map(parse);
  const CYCLE = CYCLE_RGB.map(add);

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function rng(seed) {
    return () => {
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
  const easeOutBack = p => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
  function bounce(p) {
    const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
    return n * (p -= 2.625 / d) * p + 0.984375;
  }

  // ---- letters --------------------------------------------------------------
  const BIG = {
    S: ['.#####.', '#######', '##.....', '######.', '.######', '.....##', '.....##', '#######', '.#####.'],
    L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######', '#######'],
    O: ['.#####.', '#######', '##...##', '##...##', '##...##', '##...##', '##...##', '#######', '.#####.'],
    P: ['######.', '#######', '##...##', '##...##', '#######', '######.', '##.....', '##.....', '##.....'],
    W: ['##...##', '##...##', '##...##', '##.#.##', '##.#.##', '#######', '###.###', '##...##', '#.....#'],
    A: ['.#####.', '#######', '##...##', '##...##', '#######', '#######', '##...##', '##...##', '##...##'],
    R: ['######.', '#######', '##...##', '##...##', '######.', '#####..', '##.###.', '##..###', '##...##'],
    E: ['#######', '#######', '##.....', '##.....', '#####..', '#####..', '##.....', '#######', '#######'],
  };
  // 5x7 font, one hex pair per row.
  const FONT = {
    A: '0e11111f111111', B: '1e11111e11111e', C: '0e11101010110e', D: '1e11111111111e', E: '1f10101e10101f',
    F: '1f10101e101010', G: '0e11101711110f', H: '1111111f111111', I: '0e04040404040e', J: '0702020202120c',
    K: '11121418141211', L: '1010101010101f', M: '111b1515111111', N: '11191513111111', O: '0e11111111110e',
    P: '1e11111e101010', Q: '0e11111115120d', R: '1e11111e141211', S: '0f10100e01011e', T: '1f040404040404',
    U: '1111111111110e', V: '11111111110a04', W: '11111115151b11', X: '11110a040a1111', Y: '11110a04040404',
    Z: '1f01020408101f', 0: '0e11131519110e', 1: '040c040404040e', 2: '0e11010204081f', 3: '1f02040201110e',
    4: '02060a121f0202', 5: '1f101e0101110e', 6: '0608101e11110e', 7: '1f010204080808', 8: '0e11110e11110e',
    9: '0e11110f01020c', '%': '18190204081303', '-': '0000001f000000', '.': '00000000000c0c', ',': '000000000c0408',
    '!': '04040404040004', "'": '04040800000000',
  };
  const glyph = ch => {
    const hex = FONT[ch];
    return hex ? Array.from({ length: 7 }, (_, r) => parseInt(hex.substr(r * 2, 2), 16)) : null;
  };

  const newSprite = (w, h) => ({ w, h, d: new Uint8Array(w * h) });
  function grow(s, diagonal) {
    const { w, h, d } = s, next = d.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[y * w + x]) continue;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy || (!diagonal && dx && dy)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && d[ny * w + nx]) { hit = true; break; }
      }
      if (hit) next[y * w + x] = OUT;
    }
    d.set(next);
  }
  function depth(s, rows) {
    const { w, h, d } = s;
    for (let r = 0; r < rows; r++) for (let y = h - 1; y > 0; y--) for (let x = 0; x < w; x++) {
      if (!d[y * w + x] && d[(y - 1) * w + x]) d[y * w + x] = OUT;
    }
  }

  const GOO_PAD = 4;
  // Rounded by blur-and-threshold, which gives letters a molten, poured look.
  function gooLetter(rows, rand) {
    const sc = 4, w = 7 * sc + GOO_PAD * 2, h = 9 * sc + GOO_PAD * 2;
    let a = new Float32Array(w * h);
    rows.forEach((row, cy) => [...row].forEach((c, cx) => {
      if (c !== '#') return;
      for (let y = 0; y < sc; y++) for (let x = 0; x < sc; x++) a[(GOO_PAD + cy * sc + y) * w + GOO_PAD + cx * sc + x] = 1;
    }));
    for (let pass = 0; pass < 2; pass++) {
      const b = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) { sum += a[ny * w + nx]; n++; }
        }
        b[y * w + x] = sum / n;
      }
      a = b;
    }
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[y * w + x] > 0.5;
    const run = (x, y, dx, dy) => { let n = 0; while (n < 9 && solid(x + dx * (n + 1), y + dy * (n + 1))) n++; return n; };
    const s = newSprite(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      const up = run(x, y, 0, -1), down = run(x, y, 0, 1), left = run(x, y, -1, 0), right = run(x, y, 1, 0);
      let v = CYCLE[(x + y * 2 + (x * 7 + y * 3) % 3 >> 2) & 7];
      if (right <= 1 && down > 2) v = GOO[2];
      if (left <= 1 && up > 2) v = GOO[5];
      if (up === 2) v = GOO[5]; else if (up <= 1) v = GOO[6];
      if (down <= 1) v = GOO[1]; else if (down <= 3) v = GOO[2];
      if ((up === 3 || up === 4) && left >= 2 && left <= 8 && down > 4) v = WHITE;
      s.d[y * w + x] = v;
    }
    grow(s, true); grow(s, false); depth(s, 2);
    // Ragged top edge of the pour, per column, for the fill reveal.
    const p1 = rand() * 6, p2 = rand() * 6;
    s.front = Float32Array.from({ length: w }, (_, x) => 0.5 + 0.3 * Math.sin(x * 0.4 + p1) + 0.2 * Math.sin(x * 1.1 + p2));
    // Columns that reach the baseline can grow drips.
    s.bases = [];
    for (let x = GOO_PAD + 2; x < w - GOO_PAD - 2; x++) {
      let yb = -1;
      for (let y = h - 1; y >= 0; y--) if (solid(x, y)) { yb = y; break; }
      if (yb >= h - GOO_PAD - 3) s.bases.push({ x, y: yb });
    }
    return s;
  }

  const CHROME_PAD = 3;
  function chromeLetter(ch) {
    const g = glyph(ch), sc = 3, iw = 5 * sc + 1, ih = 7 * sc;
    const s = newSprite(iw + CHROME_PAD * 2, ih + CHROME_PAD * 2);
    for (let y = 0; y < ih; y++) {
      const bits = g[y / sc | 0];
      for (let x = 0; x < iw; x++) {
        const on = c => c >= 0 && c < 5 && bits >> (4 - c) & 1;
        if (!on(x / sc | 0) && !on((x - 1) / sc | 0)) continue;
        const v = y <= 10 ? CHROME_TOP[y] : CHROME_BOT[y - 11];
        s.d[(y + CHROME_PAD) * s.w + x + CHROME_PAD] = v;
      }
    }
    grow(s, true); depth(s, 1);
    return s;
  }

  // Built on first play, so pages that never show the splash pay nothing.
  let art = null;
  function buildArt() {
    if (art) return art;
    const rand = rng(0x51095);
    const slop = [...'SLOPWARE'].map((ch, i) => {
      const s = gooLetter(BIG[ch], rand);
      const n = s.bases.length, drips = [];
      for (let k = 0; k < 2 && n; k++) {
        const b = s.bases[(n * (k + rand()) / 2 | 0) % n];
        drips.push({ x: b.x, y: b.y, len: 7 + rand() * 14, w: rand() < 0.5 ? 2 : 3, ph: rand() * 6, period: 1 + rand() * 0.8, off: rand(), land: 8 + rand() * 18 });
      }
      return { s, x: -126 + i * 32 - GOO_PAD, i, drips };
    });
    const vibe = [];
    let px = -90, gapX = 0;
    for (const ch of 'VIBE CODED') {
      if (ch === ' ') { gapX = px + 4; px += 12; continue; }
      vibe.push({ s: chromeLetter(ch), x: px - CHROME_PAD });
      px += 19;
    }
    const specks = Array.from({ length: 36 }, () => ({ vx: (rand() - 0.5) * 210, vy: -30 - rand() * 130, size: 1 + (rand() * 3 | 0), c: GOO[3 + (rand() * 3 | 0)] }));
    const stars = Array.from({ length: 44 }, () => ({ x: rand(), y: rand(), ph: rand() * 6, sp: 1 + rand() * 4 }));
    const shades = newSprite(26, 6);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 26; x++) {
      const lens = (x < 11 || x > 14) && (y < 4 || (y === 4 && x > 1 && x < 24 && x !== 10 && x !== 15) || (y === 5 && x > 2 && x < 9) || (y === 5 && x > 16 && x < 23));
      const bridge = x >= 11 && x <= 14 && y <= 1;
      if (!lens && !bridge) continue;
      const edge = y === 0 || bridge || x === 0 || x === 25 || x === 10 || x === 15 || y === 5 || (y === 4 && (x < 3 || x > 22 || x === 9 || x === 16));
      shades.d[y * shades.w + x] = edge ? OUT : LENS;
    }
    art = { slop, vibe, gapX, specks, stars, shades };
    return art;
  }

  // ---- renderer -------------------------------------------------------------
  let W = BASE_W, H = BASE_H, fb = new Uint8Array(W * H), cx = 160, oy = 0, horizon = 112, wordY = 54;
  const plot = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) fb[y * W + x] = v; };
  function hline(x, y, n, v) {
    if (y < 0 || y >= H) return;
    const a = Math.max(0, x), b = Math.min(W, x + n);
    if (b > a) fb.fill(v, y * W + a, y * W + b);
  }
  function stamp(s, x, y) {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const v = s.d[j * s.w + i];
      if (v) plot(x + i, y + j, v);
    }
  }

  function drawSky() {
    const top = SKY.length - 1;
    for (let y = 0; y < horizon && y < H; y++) {
      const f = y / horizon * top, b = Math.floor(f), frac = (f - b) * 16;
      for (let x = 0; x < W; x++) fb[y * W + x] = SKY[Math.min(top, b + (frac > BAYER[(y & 3) << 2 | x & 3] ? 1 : 0))];
    }
  }
  function drawStars(t) {
    for (const s of art.stars) {
      const v = STAR[(Math.sin(t * s.sp + s.ph) * 1.5 + 1.5) | 0];
      plot(s.x * W | 0, s.y * horizon * 0.55 | 0, v);
    }
  }
  function drawSun(t) {
    const R = 46, cy = (horizon - 18 + (1 - easeOutCubic(clamp(t / 1.1, 0, 1))) * 70) | 0;
    for (let y = cy - R; y <= cy + R && y < horizon; y++) {
      const dy = y - cy;
      if (dy > -4 && (dy + 4) % 8 < (dy + 4) / 11) continue; // the slats get fatter toward the horizon
      const dx = Math.sqrt(R * R - dy * dy) | 0;
      hline(cx - dx, y, dx * 2 + 1, SUN[clamp((dy + R) / (2 * R) * SUN.length | 0, 0, SUN.length - 1)]);
    }
  }
  function drawRidges(t) {
    for (let x = 0; x < W; x++) {
      const far = 10 + 6 * Math.sin((x + t * 6) * 0.035) + 3 * Math.sin((x + t * 6) * 0.11);
      const near = 5 + 4 * Math.sin((x + t * 14) * 0.06 + 2) + 2 * Math.sin((x + t * 14) * 0.17);
      for (let y = horizon - (far | 0); y < horizon; y++) plot(x, y, RIDGE_FAR);
      for (let y = horizon - (near | 0); y < horizon; y++) plot(x, y, RIDGE_NEAR);
    }
  }
  // Mode 7: one perspective divide per scanline, a checkerboard, and fog.
  function drawFloor(t) {
    const span = Math.max(1, H - horizon), scroll = t * 220 | 0;
    for (let y = Math.max(0, horizon); y < H; y++) {
      const d = y - horizon + 1, z = 1600 / d;
      const fog = Math.min(9, 9 * Math.pow(d / span, 0.7) | 0);
      const a = FLOOR_A[fog], b = FLOOR_B[fog], rowZ = (z + scroll) >> 5, off = y * W;
      for (let x = 0; x < W; x++) fb[off + x] = ((((x - cx) * z / 64) >> 4) ^ rowZ) & 1 ? a : b;
    }
  }
  function drawVibe(t) {
    art.vibe.forEach((l, i) => {
      const p = (t - T.vibe - i * 0.05) / 0.4;
      if (p <= 0) return;
      const rest = oy + 19, wave = p >= 1 ? Math.round(Math.sin(t * 5 - i * 0.6) * 1.5) : 0;
      const y = p < 1 ? -30 + (rest + 30) * bounce(p) | 0 : rest + wave;
      stamp(l.s, cx + l.x, y);
    });
  }
  function drawPour(t) {
    if (t < T.pour || t > T.pourEnd + 0.2) return;
    const x = cx + art.gapX, bottom = wordY + 6;
    const head = bottom * Math.pow(clamp((t - T.pour) / (T.hit - T.pour), 0, 1), 2) | 0;
    const tail = t > T.pourEnd ? bottom * Math.pow((t - T.pourEnd) / 0.2, 2) | 0 : 0;
    for (let y = tail; y < head; y++) {
      const w = 2 + (Math.sin(y * 0.25 - t * 30) > 0.3 ? 1 : 0) + (y > head - 6 ? 1 : 0);
      hline(x - w - 1, y, w * 2 + 3, OUT);
      hline(x - w, y, w * 2 + 1, GOO[3]);
      hline(x - w, y, 2, GOO[5]);
      hline(x + w - 1, y, 2, GOO[2]);
    }
  }
  function drawDrips(t) {
    for (const l of art.slop) {
      const born = T.hit + Math.abs(l.i - 3.5) * 0.05 + T.fillDur;
      if (t < born) continue;
      for (const d of l.drips) {
        const x = cx + l.x + d.x, y0 = wordY - GOO_PAD + d.y;
        const len = (d.len * clamp((t - born) / 0.7, 0, 1) + Math.sin(t * 2 + d.ph) * 1.2) | 0;
        for (let k = -3; k <= len + 1; k++) {
          if (k > len) { hline(x, y0 + k, d.w, OUT); continue; }
          const fat = k < 2 ? 2 - (k >> 1) : k >= len - 1 ? 1 : 0, half = Math.min(fat, 3);
          if (k >= 0) hline(x - 1 - half, y0 + k, d.w + 2 + half * 2, OUT);
          hline(x - half, y0 + k, d.w + half * 2, GOO[3]);
          plot(x - half, y0 + k, GOO[5]);
          plot(x + d.w - 1 + half, y0 + k, GOO[2]);
        }
        // A droplet lets go every so often and lands on the floor.
        const age = (t - born) / d.period + d.off, k = age % 1;
        if (age < 1 || t - born < 0.8) continue;
        const fall = k * d.period, tip = y0 + len + 3, floor = horizon + d.land, y = tip + 260 * fall * fall;
        if (y < floor) { plot(x, y | 0, GOO[4]); plot(x, (y | 0) + 1, GOO[5]); plot(x + 1, (y | 0) + 1, GOO[3]); }
        else if (y < floor + 45) { const r = (y - floor) / 15 + 1 | 0; plot(x - r, floor | 0, GOO[4]); plot(x + r, floor | 0, GOO[4]); }
      }
    }
  }
  function drawSlopware(t) {
    const sweep = clamp((t - T.shine) / 0.5, -1, 1);
    const band = t >= T.shine && t < T.shine + 0.5 ? -20 + sweep * 320 : null;
    for (const l of art.slop) {
      const p = (t - T.hit - Math.abs(l.i - 3.5) * 0.05) / T.fillDur;
      if (p <= 0) continue;
      const s = l.s, ox = cx + l.x, oy2 = wordY - GOO_PAD;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        let v = s.d[y * s.w + x];
        if (!v) continue;
        if (p < 1) {
          const f = p * (s.h + 16) - 16 + s.front[x] * 16;
          if (y > f) continue;
          if (y > f - 2) { if (v === OUT) continue; v = GOO[6]; }
        }
        if (band !== null && v !== OUT) {
          const lane = (ox + x - cx + 160) - y * 0.5 - band;
          if (lane > -3 && lane < 3) v = WHITE; else if (lane > -7 && lane < 7) v = GOO[6];
        }
        plot(ox + x, oy2 + y, v);
      }
    }
  }
  function drawSpecks(t) {
    const dt = t - T.hit;
    if (dt < 0 || dt > 0.95) return;
    const x0 = cx + art.gapX;
    for (const p of art.specks) {
      const x = x0 + p.vx * dt | 0, y = wordY + p.vy * dt + 300 * dt * dt | 0;
      if (y > horizon + 40) continue;
      for (let j = 0; j < p.size; j++) hline(x, y + j, p.size, p.c);
    }
  }
  function drawBlob(t) {
    if (t < T.pop) return;
    const p = clamp((t - T.pop) / 0.4, 0, 1), scale = easeOutBack(p);
    const beat = p >= 1 ? 0.08 * Math.sin(t * Math.PI * 4) : 0;
    const halfW = Math.round(22 * scale * (1 - beat)), h = Math.round(38 * scale * (1 + beat));
    const base = oy + 166;
    if (halfW < 2 || h < 2) return;
    // Soft contact shadow, 16-bit style: a dithered ellipse rather than alpha.
    for (let r = 0; r < 5; r++) {
      const dx = Math.round((halfW + 6) * Math.sqrt(1 - r * r / 25));
      for (let x = -dx; x <= dx; x++) if ((x + r) & 1) plot(cx + x, base + r - 2, OUT);
    }
    const shape = v => v < 0.18 ? 1 + (0.18 - v) * 1.1 : Math.pow(Math.max(0, 1 - Math.pow((v - 0.18) / 0.82, 2.4)), 1 / 2.2);
    const rowW = dy => Math.round(halfW * shape((dy + 0.5) / h));
    for (let dy = 0; dy < h; dy++) hline(cx - rowW(dy) - 1, base - dy, rowW(dy) * 2 + 3, OUT);
    hline(cx - rowW(0), base + 1, rowW(0) * 2 + 1, OUT);
    hline(cx - rowW(h - 1), base - h, rowW(h - 1) * 2 + 1, OUT);
    for (let dy = 0; dy < h; dy++) {
      const v = dy / (h - 1), hw = rowW(dy);
      for (let x = -hw; x <= hw; x++) {
        const nx = x / halfW, y = base - dy;
        let level = 7 * (0.5 - nx * 0.22 + (v * 2 - 1) * 0.3) + (BAYER[(y & 3) << 2 | x & 3] / 16 - 0.5) * 0.9;
        level = clamp(level | 0, 1, 5);
        plot(cx + x, y, GOO[level]);
      }
    }
    // Wet highlight.
    const hy = base - Math.round(h * 0.82);
    hline(cx - Math.round(halfW * 0.55), hy, 7, WHITE);
    hline(cx - Math.round(halfW * 0.62), hy + 1, 3, GOO[6]);
    const face = base - Math.round(h * 0.6);
    // Smile.
    hline(cx - 4, face + 10, 8, OUT);
    plot(cx - 5, face + 9, OUT); plot(cx + 4, face + 9, OUT);
    const landed = t >= T.land;
    if (!landed) {
      const blink = Math.sin(t * 9) > 0.92;
      for (const sx of [-9, 5]) {
        if (blink) { hline(cx + sx, face + 3, 5, OUT); continue; }
        for (let y = 0; y < 6; y++) hline(cx + sx, face + y, 5, WHITE);
        for (let y = 2; y < 5; y++) hline(cx + sx + 1, face + y, 2, OUT);
      }
    }
    if (t >= T.shades) {
      const q = clamp((t - T.shades) / (T.land - T.shades), 0, 1);
      const y = landed ? face : Math.round(face - 80 + 80 * q * q);
      stamp(art.shades, cx - 13, y);
      if (landed) {
        const g = (t - T.shine) / 0.35;
        const gx = g >= 0 && g <= 1 ? (g * 7 | 0) : -1;
        if (gx >= 0) for (const lx of [2, 17]) {
          plot(cx - 13 + lx + gx, y + 1, WHITE); plot(cx - 13 + lx + gx - 1, y + 2, WHITE); plot(cx - 13 + lx + gx - 2, y + 3, WHITE);
        }
      }
    }
  }
  function drawSparkles(t) {
    const spots = [[-124, 1], [-31, 2], [32, 34], [68, 0], [125, 31]];
    spots.forEach(([dx, dy], i) => {
      const p = (t - T.shine - 0.15 - i * 0.1) / 0.45;
      if (p <= 0 || p >= 1) return;
      const r = Math.sin(p * Math.PI) * 6 | 0, x = cx + dx, y = wordY + dy;
      for (let k = -r; k <= r; k++) { plot(x + k, y, WHITE); plot(x, y + k, WHITE); }
      if (r > 3) for (const a of [-1, 1]) for (const b of [-1, 1]) plot(x + a, y + b, WHITE);
    });
  }
  function drawTagline(t, tagline) {
    const n = Math.min(tagline.length, (t - T.type) / 0.02 | 0);
    if (n <= 0) return;
    let x = cx - (tagline.length * 6 - 1 >> 1);
    const y = oy + 171;
    for (let i = 0; i < n; i++, x += 6) {
      const g = glyph(tagline[i]);
      if (!g) continue;
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (g[r] >> (4 - c) & 1) { plot(x + c + 1, y + r + 1, OUT); }
      }
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (g[r] >> (4 - c) & 1) plot(x + c, y + r, TEXT);
      }
    }
    if (n < tagline.length) for (let r = 0; r < 7; r++) hline(x, y + r, 5, WHITE);
  }

  function drawScene(t, tagline) {
    drawSky(); drawStars(t); drawSun(t); drawRidges(t); drawFloor(t);
    drawVibe(t); drawPour(t); drawSlopware(t); drawDrips(t); drawSpecks(t);
    drawBlob(t); drawSparkles(t); drawTagline(t, tagline);
  }

  // ---- the overlay ----------------------------------------------------------
  let session = null;

  const CAPTURED = ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchend', 'wheel'];
  const SKIPS = new Set(['keydown', 'pointerdown', 'touchstart']);

  function play(opts) {
    if (session) return session.promise;
    opts = opts || {};
    buildArt();
    const root = document.createElement('div');
    root.id = 'slopware-splash';
    root.setAttribute('aria-label', 'Vibe Coded Slopware');
    root.setAttribute('role', 'img');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;overflow:hidden;cursor:none;touch-action:none';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated';
    root.appendChild(canvas);
    document.documentElement.appendChild(root);
    const ctx = canvas.getContext('2d');

    let image = null, lut = new Uint32Array(PAL.length), lutKey = -1;
    function resize() {
      const vw = window.innerWidth || BASE_W, vh = window.innerHeight || BASE_H;
      let s = Math.min(vw / BASE_W, vh / BASE_H);
      if (s >= 1) s = Math.floor(s);
      W = Math.ceil(vw / s); H = Math.ceil(vh / s);
      canvas.width = W; canvas.height = H;
      canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
      fb = new Uint8Array(W * H);
      image = ctx.createImageData(W, H);
      cx = W >> 1; oy = (H - BASE_H) >> 1; horizon = oy + 112; wordY = oy + 54;
    }
    resize();
    window.addEventListener('resize', resize);

    const tagline = opts.tagline || TAGLINES[Math.random() * TAGLINES.length | 0];
    const still = !!opts.still;
    let clock = opts.at != null ? opts.at : 0, frozen = opts.at != null, last = performance.now(), raf = 0;
    let exitAt = still ? STILL_HOLD : T.exit, durations = EXIT, ended = false;
    const end = () => exitAt + (still ? STILL_FADE : durations.mosaic + durations.iris);
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    const audio = !frozen && !still ? jingle(() => clock) : null;

    function present(t) {
      const out = new Uint32Array(image.data.buffer);
      const since = t - exitAt;
      let level = 15, mosaic = 1, iris = -1, shake = 0;
      if (still) {
        level = t < 0.2 ? clamp(t / 0.2 * 15 | 0, 0, 15) : since > 0 ? clamp((1 - since / STILL_FADE) * 15 | 0, 0, 15) : 15;
      } else {
        if (t < T.fadeIn) level = clamp(t / T.fadeIn * 15 | 0, 0, 15);
        const dt = t - T.hit;
        if (dt >= 0 && dt < 0.28 && !frozen) shake = Math.round(Math.sin(dt * 55) * 3 * (1 - dt / 0.28));
        if (since > 0) {
          mosaic = 1 + (clamp(since / durations.mosaic, 0, 1) * 9 | 0);
          if (since > durations.mosaic) iris = (since - durations.mosaic) / durations.iris * Math.hypot(W, H) * 0.55;
        }
      }
      const key = level * 8 + (t * 10 & 7);
      if (key !== lutKey) {
        lutKey = key;
        const step = t * 10 & 7;
        CYCLE.forEach((idx, i) => { PAL[idx] = CYCLE_RGB[(i + step) & 7].map(c => c >> 3); });
        PAL.forEach((c, i) => {
          const f = v => { const s = (v * level / 15) | 0; return s << 3 | s >> 2; };
          lut[i] = (255 << 24 | f(c[2]) << 16 | f(c[1]) << 8 | f(c[0])) >>> 0;
        });
      }
      const midX = W / 2, midY = H / 2, r2 = iris * iris;
      if (iris >= 0) root.style.background = 'transparent';
      for (let y = 0; y < H; y++) {
        let sy = clamp(y + shake, 0, H - 1);
        if (mosaic > 1) sy -= sy % mosaic;
        const src = sy * W, dst = y * W;
        if (iris < 0 && mosaic === 1) { for (let x = 0; x < W; x++) out[dst + x] = lut[fb[src + x]]; continue; }
        for (let x = 0; x < W; x++) {
          const hole = iris >= 0 && (x - midX) * (x - midX) + (y - midY) * (y - midY) < r2;
          out[dst + x] = hole ? 0 : lut[fb[src + x - x % mosaic]];
        }
      }
      ctx.putImageData(image, 0, 0);
    }

    function renderAt(t) {
      drawScene(still ? STILL_SCENE : Math.min(t, exitAt), tagline);
      present(t);
    }

    function skip() {
      if (ended || clock >= exitAt) return;
      if (frozen) { finish(); return; }
      durations = SKIP;
      exitAt = clock;
      if (audio) audio.stop();
      setTimeout(finish, (SKIP.mosaic + SKIP.iris) * 1000 + 150);
    }
    function finish() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
      window.removeEventListener('resize', resize);
      CAPTURED.forEach(type => window.removeEventListener(type, guard, true));
      if (audio) audio.stop();
      root.remove();
      session = null;
      resolve();
    }
    // Anything pressed during the splash belongs to the splash. Browser
    // shortcuts (reload, devtools, tab switching) still go through.
    function guard(e) {
      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key))) return;
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
      if (SKIPS.has(e.type)) skip();
    }
    CAPTURED.forEach(type => window.addEventListener(type, guard, { capture: true, passive: false }));

    function frame(now) {
      if (ended) return;
      try {
        // Clamped so a tab that was in the background resumes instead of jumping to the end.
        const dt = Math.min(0.5, (now - last) / 1000);
        last = now;
        if (!frozen) clock += dt;
        if (!frozen && clock >= end()) { finish(); return; }
        renderAt(clock);
        raf = requestAnimationFrame(frame);
      } catch (err) {
        // A splash must never be the reason a game doesn't start.
        console.warn('[splash]', err);
        finish();
      }
    }
    renderAt(clock);
    raf = requestAnimationFrame(frame);
    // If frames ever stall on a page that claims to be visible, get out of the way.
    let watchdog = 0;
    (function arm() {
      watchdog = setTimeout(() => {
        if (frozen || document.visibilityState === 'hidden') arm(); else finish();
      }, WATCHDOG_MS);
    })();

    session = { promise, skip, seek(t) { frozen = true; clock = t; renderAt(t); } };
    return promise;
  }

  // ---- the jingle -----------------------------------------------------------
  // Plays only if the browser allows audio already (say, clicking through from
  // the home page). A splash shouldn't beg for a gesture.
  function jingle(getClock) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ac;
    try { ac = new AC(); } catch (e) { return null; }
    const master = ac.createGain();
    master.gain.value = 0.13;
    const echo = ac.createDelay(0.5), fb2 = ac.createGain(), wet = ac.createGain();
    echo.delayTime.value = 0.14; fb2.gain.value = 0.38; wet.gain.value = 0.5;
    master.connect(ac.destination); master.connect(echo); echo.connect(fb2); fb2.connect(echo); echo.connect(wet); wet.connect(ac.destination);
    let dead = false;
    function note(at, freq, len, type, vol) {
      const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + Math.max(0, at - getClock());
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + len + 0.02);
    }
    function splat(at) {
      const n = ac.sampleRate * 0.2 | 0, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), t0 = ac.currentTime + Math.max(0, at - getClock());
      f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t0); f.frequency.exponentialRampToValueAtTime(180, t0 + 0.18);
      src.buffer = buf; src.connect(f); f.connect(master); src.start(t0);
    }
    function schedule() {
      if (dead || ac.state !== 'running') return;
      splat(T.hit);
      const mel = [262, 330, 392, 523, 659];
      mel.forEach((f, i) => note(T.hit + 0.1 + i * 0.09, f, 0.16, 'square', 0.3));
      note(T.pop, 196, 0.12, 'triangle', 0.5);
      note(T.pop + 0.07, 392, 0.14, 'triangle', 0.5);
      note(T.land, 98, 0.1, 'square', 0.4);
      [523, 659, 784, 1047].forEach(f => note(T.shine, f, 1.1, 'triangle', 0.3));
      [524.5, 660.5].forEach(f => note(T.shine, f, 1.1, 'sine', 0.25));
    }
    if (ac.state === 'running') schedule(); else ac.resume().then(schedule, () => {});
    return {
      stop() {
        if (dead) return;
        dead = true;
        try { master.gain.setTargetAtTime(0, ac.currentTime, 0.02); wet.gain.setTargetAtTime(0, ac.currentTime, 0.02); } catch (e) { /* closing anyway */ }
        setTimeout(() => ac.close().catch(() => {}), 200);
      },
    };
  }

  // ---- auto-play ------------------------------------------------------------
  const script = document.currentScript;
  const param = new URLSearchParams(location.search).get('splash');
  const storageKey = 'slopware-splash:' + location.pathname;

  function seen() {
    try { return sessionStorage.getItem(storageKey) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { sessionStorage.setItem(storageKey, '1'); } catch (e) { /* private mode: replays, fine */ }
  }
  function shouldAutoPlay() {
    if (script && script.hasAttribute('data-manual')) return false;
    if (param === '0') return false;
    if (param !== null) return true;
    if (navigator.webdriver) return false;
    if (window.top !== window) return false;
    if (location.pathname === '/' || location.pathname === '/shop/' || location.pathname === '/shop') return false;
    return !!(script && script.hasAttribute('data-always')) || !seen();
  }

  const freezeAt = param !== null && param !== '' && param !== '1' && param !== '0' && !isNaN(+param) ? +param : null;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready = Promise.resolve();
  if (shouldAutoPlay()) {
    markSeen();
    ready = play({ at: freezeAt == null ? undefined : freezeAt, still: reduced && freezeAt == null });
  }

  window.SlopwareSplash = {
    get ready() { return ready; },
    play(opts) { ready = play(opts); return ready; },
    skip() { if (session) session.skip(); },
    seek(t) { if (session) session.seek(t); },
    get playing() { return !!session; },
  };
})();
