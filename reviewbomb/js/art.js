// Pixel art: store screenshots and capsules for the generated games (8-bit NES-ish
// or 4-bit EGA), reviewer avatars, and the reviewer's room around the monitor.
// AI-made parts are drawn differently on purpose: blurry, airbrushed, smooth
// gradients, garbled logos. A careful reader can spot them in the screenshots.

import { makeRng } from "./gen.js";

export const RAMPS = {
  nes: {
    gray: ["#000000", "#7c7c7c", "#bcbcbc", "#fcfcfc"], blue: ["#0000a8", "#0078f8", "#3cbcfc", "#a4e4fc"],
    green: ["#005800", "#00a800", "#58d854", "#b8f8b8"], brown: ["#503000", "#881400", "#ac7c00", "#fca044"],
    red: ["#a81000", "#e40058", "#f83800", "#f87858"], purple: ["#4428bc", "#6844fc", "#d800cc", "#f878f8"],
    yellow: ["#ac7c00", "#f8b800", "#f8d878", "#fce0a8"], teal: ["#004058", "#008888", "#00e8d8", "#b8f8d8"],
    skin: ["#881400", "#e45c10", "#f0d0b0", "#fce0a8"],
  },
  ega: {
    gray: ["#000000", "#555555", "#aaaaaa", "#ffffff"], blue: ["#000000", "#0000aa", "#5555ff", "#55ffff"],
    green: ["#000000", "#00aa00", "#55ff55", "#ffffff"], brown: ["#000000", "#aa5500", "#ffff55", "#ffffff"],
    red: ["#000000", "#aa0000", "#ff5555", "#ffffff"], purple: ["#000000", "#aa00aa", "#ff55ff", "#ffffff"],
    yellow: ["#aa5500", "#ffff55", "#ffff55", "#ffffff"], teal: ["#000000", "#00aaaa", "#55ffff", "#ffffff"],
    skin: ["#aa5500", "#ff5555", "#ffff55", "#ffffff"],
  },
};
const HUES = ["blue", "green", "red", "purple", "yellow", "teal"];

export function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function dith(c, x, y, w, h, a, b, step = 2) {
  R(c, x, y, w, h, a); c.fillStyle = b;
  for (let j = 0; j < h; j++) for (let i = (j & 1); i < w; i += step) c.fillRect(x + i, y + j, 1, 1);
}
function disc(c, cx, cy, rad, col) {
  c.fillStyle = col;
  for (let y = -rad; y <= rad; y++) { const w = Math.round(Math.sqrt(rad * rad - y * y)); c.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
}

// ---------------------------------------------------------------- 3x5 pixel font

const GLYPH = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 5, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 5, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 1, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ":": [0, 2, 0, 2, 0], "-": [0, 0, 7, 0, 0], "!": [2, 2, 2, 0, 2], "'": [2, 2, 0, 0, 0], ".": [0, 0, 0, 0, 2],
  "/": [1, 1, 2, 4, 4], "?": [6, 1, 2, 0, 2], "&": [2, 5, 2, 5, 3], "♥": [5, 7, 7, 2, 0], x: [0, 5, 2, 5, 0],
};
export function text(c, str, x, y, col, s = 1, shadow) {
  str = String(str).toUpperCase().replace(/X(?=\d)/g, "x");
  let cx = x;
  for (const ch of str) {
    const g = GLYPH[ch];
    if (g) for (let row = 0; row < 5; row++) for (let b = 0; b < 3; b++) if (g[row] & (4 >> b)) {
      if (shadow) R(c, cx + b * s + s, y + row * s + s, s, s, shadow);
      R(c, cx + b * s, y + row * s, s, s, col);
    }
    cx += 4 * s;
  }
  return cx - x;
}
export const textWidth = (str, s = 1) => String(str).length * 4 * s - s;

// ---------------------------------------------------------------- sprites

export function makeSprite(r, w = 8, h = 8, density = 0.5, eyes = true) {
  const g = Array.from({ length: h }, () => Array(w).fill(0));
  const half = Math.ceil(w / 2);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < half; x++) {
    const p = x >= half - 1 ? 0.8 : density;
    if (r() < p) { const v = r() < 0.22 ? 2 : 1; g[y][x] = v; g[y][w - 1 - x] = v; }
  }
  if (eyes) { const ey = 2 + r.int(2), ex = Math.max(1, half - 2); g[ey][ex] = 4; g[ey][w - 1 - ex] = 4; }
  const out = g.map((row) => row.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!g[y][x]) {
    if ((g[y - 1]?.[x]) || (g[y + 1]?.[x]) || g[y][x - 1] || g[y][x + 1]) out[y][x] = 3;
  }
  return out;
}
export function drawSprite(c, spr, x, y, cols, s = 1, flip = false) {
  const h = spr.length, w = spr[0].length;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = spr[j][flip ? w - 1 - i : i];
    if (v) R(c, x + i * s, y + j * s, s, s, cols[v]);
  }
}

// ---------------------------------------------------------------- game scenes (128x72)

function palette(g, r) {
  const P = RAMPS[g.style];
  const hues = r.shuffle(HUES);
  return { P, a: P[hues[0]], b: P[hues[1]], c: P[hues[2]], gray: P.gray };
}

const SCENES = {
  platformer: {
    bg(c, r, k) {
      const sky = r.pick([k.P.blue, k.P.teal, k.P.purple]);
      R(c, 0, 0, 128, 72, sky[2]);
      dith(c, 0, 0, 128, 14, sky[2], sky[3], 4);
      for (let i = 0; i < 4; i++) { const x = r.int(120), y = 4 + r.int(18); R(c, x, y, 12, 3, k.gray[3]); R(c, x + 3, y - 2, 6, 2, k.gray[3]); }
      const hill = r.pick([k.P.green, k.P.teal]);
      for (let x = 0; x < 128; x++) { const h = 14 + Math.round(6 * Math.sin(x / 9 + r() * 0.15) + 4 * Math.sin(x / 23)); R(c, x, 60 - h, 1, h, hill[1]); }
      for (let x = 0; x < 128; x++) { const h = 8 + Math.round(4 * Math.sin(x / 6 + 2)); R(c, x, 60 - h, 1, h, hill[0]); }
    },
    fg(c, r, k, g) {
      const gr = k.P.brown, top = k.P.green;
      for (let x = 0; x < 128; x += 8) { R(c, x, 60, 8, 12, gr[2]); R(c, x, 60, 8, 1, gr[3]); R(c, x + 7, 60, 1, 12, gr[1]); R(c, x, 66, 8, 1, gr[1]); }
      R(c, 0, 59, 128, 2, top[2]);
      for (let p = 0; p < 3; p++) {
        const px = 12 + p * 38 + r.int(10), py = 22 + r.int(22), w = 16 + r.int(3) * 8;
        for (let x = 0; x < w; x += 8) { R(c, px + x, py, 8, 6, gr[3]); R(c, px + x, py + 5, 8, 1, gr[1]); R(c, px + x + 7, py, 1, 6, gr[1]); }
        for (let i = 0; i < 3; i++) { R(c, px + 2 + i * 6, py - 6, 2, 3, k.P.yellow[1]); R(c, px + 2 + i * 6, py - 6, 1, 1, k.P.yellow[3]); }
      }
      const hero = makeSprite(r, 8, 8, 0.55);
      drawSprite(c, hero, 20 + r.int(20), 51, [0, k.a[2], k.a[3], k.gray[0], k.gray[3]]);
      for (let e = 0; e < 2; e++) drawSprite(c, makeSprite(r, 8, 6, 0.6), 60 + e * 30 + r.int(10), 53, [0, k.b[1], k.b[2], k.gray[0], k.gray[3]], 1, true);
      hud(c, k, "SCORE " + String(r.int(99) * 100).padStart(6, "0"), "x" + (1 + r.int(5)));
    },
  },
  shmup: {
    bg(c, r, k) {
      R(c, 0, 0, 128, 72, k.P.blue[0] === "#000000" ? "#000000" : "#000018");
      for (let i = 0; i < 70; i++) R(c, r.int(128), r.int(72), 1, 1, r.pick(k.gray.slice(1)));
      const pl = r.pick([k.a, k.b, k.c]); const px = 16 + r.int(96), py = 10 + r.int(30), rad = 6 + r.int(10);
      disc(c, px, py, rad, pl[1]); disc(c, px - 2, py - 2, rad - 3, pl[2]);
      if (r.chance(0.5)) R(c, px - rad - 5, py, rad * 2 + 11, 1, pl[3]);
    },
    fg(c, r, k) {
      const ship = makeSprite(r, 9, 9, 0.5, false);
      drawSprite(c, ship, 56 + r.int(16), 56, [0, k.a[2], k.a[3], k.gray[0], k.gray[3]]);
      const foe = makeSprite(r, 7, 6, 0.6);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) drawSprite(c, foe, 16 + i * 16 + (row & 1) * 6, 8 + row * 10, [0, k.b[row % 2 + 1], k.b[3], k.gray[0], k.gray[3]]);
      for (let i = 0; i < 10; i++) R(c, 30 + r.int(70), 14 + r.int(40), 1, 3, k.P.yellow[2]);
      for (let i = 0; i < 6; i++) disc(c, 20 + r.int(90), 30 + r.int(20), 1, k.P.red[2]);
      hud(c, k, "1UP " + String(r.int(999) * 100).padStart(6, "0"), "HI 050000");
    },
  },
  rpg: {
    bg(c, r, k) {
      dith(c, 0, 0, 128, 72, k.P.green[1], k.P.green[2], 5);
      const wx = r.int(80);
      for (let y = 0; y < 72; y++) { const w = 18 + Math.round(5 * Math.sin(y / 7)); R(c, wx + Math.round(6 * Math.sin(y / 11)), y, w, 1, k.P.blue[1]); }
      for (let i = 0; i < 12; i++) R(c, wx + r.int(20), r.int(72), 3, 1, k.P.blue[3]);
      let x = r.int(30) + 50;
      for (let y = 0; y < 72; y++) { x += r.int(3) - 1; R(c, x, y, 7, 1, k.P.brown[2]); }
    },
    fg(c, r, k, g) {
      for (let i = 0; i < 9; i++) {
        const tx = r.int(120), ty = r.int(50);
        R(c, tx + 3, ty + 7, 2, 4, k.P.brown[1]); disc(c, tx + 4, ty + 4, 4, k.P.green[0]); disc(c, tx + 4, ty + 3, 3, k.P.green[2]);
      }
      const hx = 8 + r.int(20), hy = 6 + r.int(10), roof = r.pick([k.P.red, k.P.purple, k.P.blue]);
      R(c, hx, hy + 6, 16, 10, k.P.yellow[3]); for (let i = 0; i < 7; i++) R(c, hx - 1 + i, hy + 6 - i, 18 - i * 2, 1, roof[1]);
      R(c, hx + 6, hy + 11, 4, 5, k.P.brown[1]);
      drawSprite(c, makeSprite(r, 7, 8, 0.6), 60, 34, [0, k.a[2], k.a[3], k.gray[0], k.gray[3]]);
      drawSprite(c, makeSprite(r, 7, 8, 0.6), 74, 30, [0, k.b[2], k.b[3], k.gray[0], k.gray[3]], 1, true);
      R(c, 4, 52, 120, 17, k.gray[0]); R(c, 5, 53, 118, 15, k.P.blue[1]); R(c, 6, 54, 116, 13, k.gray[0]);
      text(c, (g.hero + ":").slice(0, 26), 9, 56, k.gray[3]);
      text(c, r.pick(["WELL MET!", "THE BELLS...", "TAKE THIS.", "YOU AGAIN?"]), 9, 62, k.gray[2]);
    },
  },
  farming: {
    bg(c, r, k) {
      dith(c, 0, 0, 128, 72, k.P.green[1], k.P.green[2], 6);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
        const x = 30 + i * 14, y = 18 + j * 12;
        R(c, x, y, 12, 10, k.P.brown[1]); for (let s = 0; s < 3; s++) R(c, x, y + 2 + s * 3, 12, 1, k.P.brown[0] === "#000000" ? k.P.brown[1] : k.P.brown[0]);
      }
    },
    fg(c, r, k) {
      const crops = [k.P.red, k.P.yellow, k.P.purple, k.P.green];
      for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) if (r.chance(0.75)) {
        const x = 30 + i * 14 + 3, y = 18 + j * 12 + 2, cr = r.pick(crops);
        R(c, x + 2, y + 3, 1, 4, k.P.green[2]); R(c, x, y + 2, 5, 1, k.P.green[2]); disc(c, x + 2, y + 1, 1, cr[2]);
      }
      for (let x = 0; x < 128; x += 6) { R(c, x, 66, 2, 6, k.P.brown[3]); } R(c, 0, 68, 128, 1, k.P.brown[3]);
      R(c, 2, 4, 22, 16, k.P.red[1]); for (let i = 0; i < 6; i++) R(c, 2 + i, 4 - i, 22 - i * 2, 1, k.P.red[2]); R(c, 9, 12, 8, 8, k.gray[3]); R(c, 12, 12, 2, 8, k.P.red[1]);
      drawSprite(c, makeSprite(r, 7, 8, 0.6), 100, 40, [0, k.a[2], k.a[3], k.gray[0], k.gray[3]]);
      drawSprite(c, makeSprite(r, 8, 6, 0.6), 108, 58, [0, k.gray[3], k.gray[2], k.gray[0], k.gray[0]], 1, true);
      hud(c, k, "SPR " + (1 + r.int(28)), "G " + r.int(9999));
    },
  },
  racing: {
    bg(c, r, k) {
      const sky = r.pick([k.P.blue, k.P.purple, k.P.red]);
      R(c, 0, 0, 128, 10, sky[0]); R(c, 0, 10, 128, 8, sky[1]); R(c, 0, 18, 128, 10, sky[2]);
      const m = r.pick([k.P.purple, k.P.blue, k.P.brown]);
      for (let x = 0; x < 128; x++) { const h = 4 + Math.abs(((x * 7 + r.int(3)) % 30) - 15) / 2; R(c, x, 28 - h, 1, h, m[1]); }
      dith(c, 0, 28, 128, 44, k.P.green[1], k.P.green[2], 4);
    },
    fg(c, r, k) {
      for (let y = 28; y < 72; y++) {
        const t = (y - 28) / 44, half = 4 + t * 60, cx = 64 + Math.sin(t * 2.4 + 1) * 8 * (1 - t);
        const band = Math.floor((y * y) / 40) & 1;
        R(c, cx - half - 3, y, 3 + t * 3, 1, band ? k.P.red[2] : k.gray[3]);
        R(c, cx + half, y, 3 + t * 3, 1, band ? k.P.red[2] : k.gray[3]);
        R(c, cx - half, y, half * 2, 1, band ? k.gray[1] : k.gray[2]);
        if (band) R(c, cx - t * 2, y, 1 + t * 3, 1, k.gray[3]);
      }
      const car = makeSprite(r, 12, 7, 0.75, false);
      drawSprite(c, car, 52, 58, [0, k.a[1], k.a[2], k.gray[0], k.gray[3]], 2 / 2);
      drawSprite(c, car, 70, 38, [0, k.b[1], k.b[2], k.gray[0], k.gray[3]]);
      hud(c, k, "LAP " + (1 + r.int(3)) + "/3", (90 + r.int(200)) + " KMH");
    },
  },
  puzzle: {
    bg(c, r, k) { const h = r.pick([k.P.purple, k.P.blue, k.P.teal]); dith(c, 0, 0, 128, 72, h[0], h[1], 3); },
    fg(c, r, k) {
      R(c, 38, 2, 52, 68, k.gray[3]); R(c, 40, 4, 48, 64, k.gray[0]);
      const cols = [k.P.red, k.P.yellow, k.P.green, k.P.blue, k.P.purple];
      for (let x = 0; x < 8; x++) {
        const h = 2 + r.int(6);
        for (let y = 0; y < h; y++) { const cc = r.pick(cols); R(c, 40 + x * 6, 62 - y * 6, 6, 6, cc[1]); R(c, 40 + x * 6, 62 - y * 6, 5, 1, cc[3]); R(c, 40 + x * 6, 62 - y * 6, 1, 5, cc[3]); }
      }
      const cc = r.pick(cols); for (let i = 0; i < 3; i++) { R(c, 52 + i * 6, 14, 6, 6, cc[2]); R(c, 52 + i * 6, 14, 5, 1, cc[3]); }
      text(c, "NEXT", 96, 6, k.gray[3]); R(c, 96, 14, 18, 12, k.gray[0]);
      text(c, "LINES", 96, 34, k.gray[3]); text(c, String(r.int(90)), 96, 41, k.P.yellow[2]);
    },
  },
};

function hud(c, k, left, right) {
  text(c, left, 3, 3, k.gray[3], 1, k.gray[0]);
  text(c, right, 125 - textWidth(right), 3, k.gray[3], 1, k.gray[0]);
}

// The tell for AI art: smear the background into an airbrushed blur with glow blobs.
function aiSmear(ctx, src, W, H, r, strength = 1) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.filter = `blur(${Math.round(5 * strength)}px) saturate(1.7) contrast(1.1)`;
  ctx.drawImage(src, -12, -12, W + 24, H + 24);
  ctx.filter = "none";
  for (let i = 0; i < 5; i++) {
    const x = r() * W, y = r() * H * 0.7, rad = W * (0.15 + r() * 0.3);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const hue = Math.floor(r() * 360);
    gr.addColorStop(0, `hsla(${hue},90%,75%,.45)`); gr.addColorStop(1, `hsla(${hue},90%,60%,0)`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  // melty swirls
  ctx.globalAlpha = 0.25; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); const x = r() * W, y = r() * H; ctx.ellipse(x, y, 20 + r() * 40, 6 + r() * 12, r() * 3, 0, 4); ctx.stroke(); }
  ctx.restore();
}

export const SHOT_W = 512, SHOT_H = 288;

// idx 0 = intro shot. bgart placeholders show up in the later shots (the "chapter").
export function renderShot(g, idx) {
  const r = makeRng(g.paletteSeed + idx * 7919);
  const k = palette(g, makeRng(g.paletteSeed));
  const scene = SCENES[g.genre];
  const bg = canvas(128, 72), fg = canvas(128, 72);
  scene.bg(bg.getContext("2d"), r, k, g);
  scene.fg(fg.getContext("2d"), r, k, g);
  const out = canvas(SHOT_W, SHOT_H), o = out.getContext("2d");
  const aiBg = g.slop || (g.cats.includes("bgart") && idx > 0);
  if (aiBg) aiSmear(o, bg, SHOT_W, SHOT_H, r, g.slop ? 1.3 : 1);
  else { o.imageSmoothingEnabled = false; o.drawImage(bg, 0, 0, SHOT_W, SHOT_H); }
  if (g.slop) {
    o.imageSmoothingEnabled = true;
    o.globalAlpha = 0.35; o.drawImage(fg, 3, 2, SHOT_W, SHOT_H); o.globalAlpha = 1;
    o.drawImage(fg, 0, 0, SHOT_W, SHOT_H);
  } else { o.imageSmoothingEnabled = false; o.drawImage(fg, 0, 0, SHOT_W, SHOT_H); }
  return out;
}

const GARBLE = { A: "ΛA4", E: "ΣE3", O: "Ø0Q", S: "Ƨ5", R: "ЯR", N: "ИN", I: "1lI", T: "ТT7", G: "6G", B: "8ß", K: "KƘ", U: "ƱU", M: "MΜ" };
function garble(s, r) {
  return s.replace(/[A-Za-z]/g, (ch) => {
    const up = ch.toUpperCase();
    if (r() < 0.22 && GARBLE[up]) return r.pick(GARBLE[up]);
    if (r() < 0.05) return ch + ch;
    return ch;
  });
}

export const CAP_W = 460, CAP_H = 215;
export function renderCapsule(g) {
  const r = makeRng(g.paletteSeed + 31337);
  const k = palette(g, makeRng(g.paletteSeed));
  const scene = SCENES[g.genre];
  const bg = canvas(128, 72);
  scene.bg(bg.getContext("2d"), makeRng(g.paletteSeed + 5), k, g);
  const out = canvas(CAP_W, CAP_H), o = out.getContext("2d");
  const ai = g.slop || g.cats.includes("capsule");
  const hero = makeSprite(makeRng(g.paletteSeed + 11), 8, 8, 0.55);
  const heroCols = [0, k.a[2], k.a[3], k.gray[0], k.gray[3]];
  const sp = canvas(8, 8); drawSprite(sp.getContext("2d"), hero, 0, 0, heroCols);
  if (ai) {
    aiSmear(o, bg, CAP_W, CAP_H, r, 1.4);
    o.imageSmoothingEnabled = true;
    o.save(); o.shadowColor = "rgba(255,220,160,.9)"; o.shadowBlur = 30;
    o.drawImage(sp, 18, 30, 170, 170); o.restore();
    // lens flare
    const fx = CAP_W * 0.72, fy = 40, gr = o.createRadialGradient(fx, fy, 0, fx, fy, 120);
    gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.1, "rgba(255,240,200,.5)"); gr.addColorStop(1, "rgba(255,200,150,0)");
    o.fillStyle = gr; o.fillRect(0, 0, CAP_W, CAP_H);
    const title = garble(g.title, r);
    let size = 44; o.font = `italic 900 ${size}px Georgia, serif`;
    while (o.measureText(title).width > 250 && size > 18) { size -= 2; o.font = `italic 900 ${size}px Georgia, serif`; }
    const words = title.split(" "); const lines = [];
    let cur = "";
    for (const w of words) { if (o.measureText(cur + " " + w).width > 250 && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
    lines.push(cur);
    const tg = o.createLinearGradient(0, 40, 0, 170); tg.addColorStop(0, "#fff6c8"); tg.addColorStop(0.5, "#f5b23a"); tg.addColorStop(1, "#9a3b10");
    lines.slice(0, 3).forEach((ln, i) => {
      const y = 70 + i * (size + 4);
      o.lineWidth = 5; o.strokeStyle = "#2a0d00"; o.strokeText(ln, 196, y);
      o.fillStyle = tg; o.fillText(ln, 196, y);
    });
  } else {
    const small = canvas(115, 54), s = small.getContext("2d");
    s.imageSmoothingEnabled = false; s.drawImage(bg, 0, 4, 128, 60, 0, 0, 115, 54);
    s.fillStyle = "rgba(0,0,0,.35)"; s.fillRect(0, 0, 115, 54);
    drawSprite(s, hero, 6, 18, heroCols, 4);
    const words = g.title.toUpperCase().split(" ");
    const lines = []; let cur = "";
    for (const w of words) { if (textWidth(cur + " " + w, 2) > 66 && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
    lines.push(cur);
    const big = lines.length <= 2 && lines.every((l) => textWidth(l, 2) <= 70);
    const sc = big ? 2 : 1;
    lines.slice(0, 4).forEach((ln, i) => text(s, ln, 44, 8 + i * (sc * 6 + 2), k.P.yellow[2], sc, k.gray[0]));
    text(s, g.dev.toUpperCase().slice(0, 16), 44, 46, k.gray[2]);
    o.imageSmoothingEnabled = false; o.drawImage(small, 0, 0, CAP_W, CAP_H);
  }
  return out;
}

// ---------------------------------------------------------------- avatars (16x16)

const SKIN = ["#f6d3b3", "#e8b48a", "#c98d5e", "#9c6640", "#6e4529", "#4a2e1c"];
const HAIR = ["#1d1410", "#4b2e1a", "#8a5a2b", "#d9a441", "#c44a2a", "#e8e0d0", "#6a3cbf", "#2fa58c", "#e45c9c"];
export function renderAvatar(seed, personaKey) {
  const r = makeRng(seed);
  const c = canvas(16, 16), x = c.getContext("2d");
  const bgc = r.pick(["#28344a", "#3a2a48", "#2a4038", "#4a3022", "#203848", "#442236"]);
  R(x, 0, 0, 16, 16, bgc);
  const skin = r.pick(SKIN), hair = r.pick(HAIR), shirt = r.pick(["#c0392b", "#2c7be5", "#27ae60", "#8e44ad", "#222", "#e67e22", "#7f8c8d"]);
  R(x, 2, 13, 12, 3, shirt); R(x, 6, 11, 4, 2, skin);
  R(x, 4, 3, 8, 9, skin); R(x, 3, 5, 1, 4, skin); R(x, 12, 5, 1, 4, skin);
  const style = r.int(5);
  if (style === 0) { R(x, 4, 2, 8, 2, hair); R(x, 3, 3, 1, 3, hair); R(x, 12, 3, 1, 3, hair); }
  else if (style === 1) { R(x, 3, 1, 10, 3, hair); R(x, 3, 3, 2, 9, hair); R(x, 11, 3, 2, 9, hair); }
  else if (style === 2) { R(x, 5, 1, 6, 2, hair); R(x, 7, 0, 2, 1, hair); }
  else if (style === 3) { R(x, 3, 1, 10, 3, r.pick(["#c0392b", "#2c3e50", "#16a085", "#f1c40f"])); R(x, 2, 3, 12, 1, "#111"); }
  else { R(x, 4, 2, 8, 1, hair); }
  // eyebrows angled in, everyone is a little mad
  R(x, 5, 5, 2, 1, "#2a1a10"); R(x, 9, 5, 2, 1, "#2a1a10"); R(x, 6, 6, 1, 1, "#2a1a10"); R(x, 9, 6, 1, 1, "#2a1a10");
  R(x, 6, 7, 1, 1, "#111"); R(x, 9, 7, 1, 1, "#111");
  if (r.chance(0.4)) { R(x, 5, 7, 3, 1, "rgba(0,0,0,.0)"); x.strokeStyle = "#111"; R(x, 4, 6, 4, 1, "#111"); R(x, 8, 6, 4, 1, "#111"); R(x, 4, 7, 1, 1, "#111"); R(x, 11, 7, 1, 1, "#111"); }
  if (r.chance(0.5)) { R(x, 6, 10, 4, 1, "#5a2a20"); R(x, 6, 9, 1, 1, "#5a2a20"); R(x, 9, 9, 1, 1, "#5a2a20"); }
  else { R(x, 6, 10, 4, 1, "#5a2a20"); }
  if (personaKey === "chip" || personaKey === "vo" || r.chance(0.2)) { R(x, 2, 4, 1, 6, "#222"); R(x, 13, 4, 1, 6, "#222"); R(x, 3, 1, 10, 1, "#222"); R(x, 1, 6, 2, 3, "#444"); R(x, 13, 6, 2, 3, "#444"); }
  if (personaKey === "rage") { R(x, 4, 3, 1, 1, "#ff3b3b"); R(x, 11, 3, 1, 1, "#ff3b3b"); }
  return c;
}

// ---------------------------------------------------------------- the room (320x180)

export const ROOM_W = 320, ROOM_H = 180;
export const SCREEN = { x: 40, y: 12, w: 240, h: 122 };

const WALLS = [
  ["#1b1f33", "#232842"], ["#d8cbb0", "#cbbd9f"], ["#e9b8c4", "#dca7b5"], ["#5a3d28", "#4d3322"],
  ["#7a7d80", "#6e7174"], ["#3e5a46", "#344d3c"], ["#2a2140", "#33284d"], ["#6d8fa8", "#5f8099"],
];
const DESKS = [["#7a4e2d", "#5c391f"], ["#e8e6e1", "#c9c6bf"], ["#1d1d22", "#111114"], ["#a8c4c8", "#86a3a7"], ["#9a6a3a", "#7a5028"]];

export function makeRoom(seed, personaKey, posters) {
  const r = makeRng(seed);
  const c = canvas(ROOM_W, ROOM_H), x = c.getContext("2d");
  const wall = r.pick(WALLS), desk = r.pick(DESKS);
  const night = r.chance(0.55);
  const led = r.pick(["#ff2bd6", "#26e0ff", "#7cff4f", "#ffb020", "#9a5cff", null, null]);
  const anim = [];

  // wall + pattern
  R(x, 0, 0, ROOM_W, ROOM_H, wall[0]);
  const pat = r.int(5);
  if (pat === 0) for (let i = 0; i < ROOM_W; i += 10) R(x, i, 0, 5, 146, wall[1]);
  if (pat === 1) for (let j = 4; j < 146; j += 8) for (let i = (j / 8 & 1) * 4; i < ROOM_W; i += 8) R(x, i, j, 1, 1, wall[1]);
  if (pat === 2) for (let i = 0; i < ROOM_W; i += 14) { R(x, i, 0, 1, 146, wall[1]); R(x, i + 6, 0, 1, 146, wall[1]); }
  if (pat === 3) for (let j = 0; j < 146; j += 6) for (let i = (j / 6 & 1) * 6; i < ROOM_W; i += 12) { R(x, i, j, 11, 5, wall[1]); }
  if (night) { x.fillStyle = "rgba(0,0,20,.35)"; x.fillRect(0, 0, ROOM_W, 146); }
  if (led) {
    const g = x.createRadialGradient(160, 70, 40, 160, 70, 175);
    g.addColorStop(0, led + "aa"); g.addColorStop(1, led + "00");
    x.fillStyle = g; x.fillRect(0, 0, ROOM_W, 146);
  }

  // side furniture: window or poster on each side, shelf, plant
  const sides = r.shuffle(["window", "poster", "shelf", "poster2"]);
  const side = (sx, kind, i) => {
    if (kind === "window") {
      const wx = sx + 2, wy = 18, w = 32, h = 44;
      R(x, wx - 2, wy - 2, w + 4, h + 4, "#e9e4d8");
      const sky = night ? "#0b1030" : r.pick(["#7fc8ff", "#ffb07a", "#9fd6ff"]);
      R(x, wx, wy, w, h, sky);
      if (night) { for (let s = 0; s < 10; s++) R(x, wx + r.int(w), wy + r.int(h / 2), 1, 1, "#fff"); disc(x, wx + 8 + r.int(16), wy + 8, 3, "#f4f0c8"); }
      else { R(x, wx + 4, wy + 10, 10, 3, "#fff"); R(x, wx + 18, wy + 18, 8, 2, "#fff"); }
      for (let b = 0; b < 4; b++) { const bh = 10 + r.int(16); R(x, wx + b * 8, wy + h - bh, 7, bh, night ? "#141a36" : "#5d7a96"); if (night) for (let l = 0; l < 4; l++) R(x, wx + b * 8 + 1 + r.int(5), wy + h - bh + 2 + r.int(bh - 3), 1, 1, "#ffd76a"); }
      R(x, wx + w / 2 - 1, wy, 2, h, "#e9e4d8"); R(x, wx, wy + h / 2 - 1, w, 2, "#e9e4d8");
      const rain = !night && r.chance(0.3) || night && r.chance(0.35);
      if (rain) anim.push((ctx, t) => { ctx.fillStyle = "rgba(200,220,255,.6)"; for (let i = 0; i < 14; i++) { const rx = wx + ((i * 7 + t * 0.02 * (i % 3 + 2)) % w), ry = wy + ((i * 13 + t * 0.09) % h); ctx.fillRect(rx | 0, ry | 0, 1, 3); } });
    } else if (kind === "poster" || kind === "poster2") {
      const src = posters[i % posters.length];
      const px = sx + 3 + r.int(3), py = 14 + r.int(30), pw = 30, ph = 40;
      R(x, px - 1, py - 1, pw + 2, ph + 2, "#111");
      if (personaKey === "pixel" && kind === "poster") {
        R(x, px, py, pw, ph, "#d22"); const heart = [[0, 1, 1, 0, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1, 0], [0, 0, 1, 1, 1, 0, 0], [0, 0, 0, 1, 0, 0, 0]];
        heart.forEach((row, j) => row.forEach((v, k2) => v && R(x, px + 4 + k2 * 3, py + 6 + j * 3, 3, 3, "#fff")));
        text(x, "PIXELS", px + 4, py + 30, "#fff");
        text(x, "4EVA", px + 7, py + 34, "#fff");
      } else if (src) {
        x.imageSmoothingEnabled = false; x.drawImage(src, src.width * 0.05, 0, src.width * 0.45, src.height, px, py, pw, ph);
      } else R(x, px, py, pw, ph, "#445");
      R(x, px + pw / 2 - 1, py - 2, 2, 2, "#ddd");
    } else if (kind === "shelf") {
      const y = 70 + r.int(12);
      R(x, sx + 1, y, 36, 2, desk[1]); R(x, sx + 3, y + 2, 2, 3, desk[1]); R(x, sx + 33, y + 2, 2, 3, desk[1]);
      let bx = sx + 3;
      while (bx < sx + 33) {
        if (r.chance(0.6)) { const h = 6 + r.int(5), w = 2 + r.int(2); R(x, bx, y - h, w, h, r.pick(["#a33", "#36a", "#3a6", "#cb3", "#639", "#ddd"])); bx += w + 1; }
        else { const fig = makeSprite(r, 6, 6, 0.6); drawSprite(x, fig, bx, y - 6, [0, r.pick(HAIR), "#fff", "#111", "#fff"]); bx += 7; }
      }
    }
  };
  side(1, sides[0], 0); side(282, sides[1], 1);
  if (personaKey === "flags") {
    const fl = [["#002395", "#fff", "#ed2939"], ["#000", "#d00", "#ffce00"], ["#009c3b", "#ffdf00", "#002776"], ["#bc002d", "#fff", "#fff"]];
    fl.forEach((f, i) => { const fx = (i < 2 ? 4 : 285) + (i % 2) * 16, fy = 92; R(x, fx, fy, 12, 2, f[0]); R(x, fx, fy + 2, 12, 2, f[1]); R(x, fx, fy + 4, 12, 2, f[2]); R(x, fx - 1, fy, 1, 10, "#888"); });
  }
  if (personaKey === "lore" || personaKey === "pixel" || r.chance(0.5)) {
    // tall bookcase edge
    const bx = r.chance(0.5) ? 0 : 306;
    R(x, bx, 96, 14, 50, desk[1]);
    for (let s = 0; s < 3; s++) { R(x, bx, 96 + s * 16, 14, 2, desk[0]); for (let b = 0; b < 4; b++) R(x, bx + 1 + b * 3, 99 + s * 16, 2, 13, r.pick(["#a33", "#36a", "#3a6", "#cb3", "#639", "#ddd", "#555"])); }
  }

  // desk
  R(x, 0, 146, ROOM_W, 34, desk[0]); R(x, 0, 146, ROOM_W, 2, desk[1]);
  for (let i = 0; i < ROOM_W; i += 37) R(x, i + r.int(20), 150 + r.int(28), 10 + r.int(20), 1, desk[1]);
  const mat = r.chance(0.6) ? r.pick(["#141418", "#2b1d3a", "#14333a", "#3a1414"]) : null;
  if (mat) R(x, 96, 150, 160, 24, mat);

  // monitor
  const mtype = r.pick(["thin", "office", "crt", "gamer"]);
  const S = SCREEN;
  const bez = { thin: ["#0d0d0f", 3], office: ["#3a3c40", 5], crt: ["#d8cfb8", 9], gamer: ["#111", 4] }[mtype];
  if (mtype === "crt") R(x, S.x + 12, S.y - 6, S.w - 24, S.h + 18, "#bfb59c");
  R(x, S.x - bez[1], S.y - bez[1], S.w + bez[1] * 2, S.h + bez[1] * 2 + (mtype === "office" || mtype === "crt" ? 5 : 0), bez[0]);
  if (mtype === "gamer") { R(x, S.x + S.w / 2 - 10, S.y + S.h + 2, 20, 2, "#e1251b"); R(x, S.x - 4, S.y - 4, 10, 1, "#e1251b"); R(x, S.x + S.w - 6, S.y - 4, 10, 1, "#e1251b"); }
  const brand = r.pick(["LUMEX", "PIXTRON", "VIEWMAX", "OKTAVIA", "GLOWBOX"]);
  if (mtype === "office" || mtype === "crt") text(x, brand, S.x + S.w / 2 - textWidth(brand) / 2, S.y + S.h + bez[1] - 1, mtype === "crt" ? "#8a826c" : "#7a7c80");
  const neckY = S.y + S.h + bez[1] + (mtype === "office" || mtype === "crt" ? 5 : 0);
  if (mtype !== "crt") { R(x, 152, neckY, 16, 146 - neckY + 2, bez[0]); R(x, 136, 145, 48, 4, bez[0]); }
  else R(x, 120, neckY, 80, 146 - neckY + 2, "#bfb59c");
  // webcam
  const camY = S.y - bez[1] - 4;
  R(x, 155, camY, 10, 4, "#1a1a1a"); R(x, 159, camY + 1, 2, 2, "#3a4a6a");
  anim.push((ctx, t) => { if ((t / 900 | 0) % 3 !== 0) R(ctx, 163, camY + 1, 1, 1, "#ff3030"); });
  // sticky notes on bezel
  if (r.chance(0.65)) {
    const notes = r.shuffle(["NO AI", "TOUCH GRASS", "BE NICE?", "READ IT", "HYDRATE", "1 STAR", "SLOP!!", "CALL MOM"]);
    const n = 1 + r.int(2);
    for (let i = 0; i < n; i++) {
      const nx = i === 0 ? S.x + S.w - 2 : S.x - 26, ny = S.y + 50 + i * 30;
      R(x, nx, ny, 26, 16, r.pick(["#ffef7a", "#ff9ec8", "#9be7ff", "#b7ff9e"]));
      const words = notes[i].split(" ");
      words.forEach((w, j) => text(x, w, nx + 2, ny + 2 + j * 6, "#333"));
    }
  }

  // speakers or not
  if (r.chance(0.5)) for (const sx of [14, 284]) { R(x, sx + 6, 112, 18, 34, "#1c1c1f"); disc(x, sx + 15, 122, 5, "#2e2e33"); disc(x, sx + 15, 122, 2, "#111"); disc(x, sx + 15, 137, 3, "#2e2e33"); }

  // keyboard
  const kx = 108, ky = 154, kw = 104, kh = 15;
  const kbCase = r.pick(["#151518", "#d9d4c6", "#2b2b30", "#f1efe9"]);
  R(x, kx, ky, kw, kh, kbCase);
  const rgb = r.chance(0.55);
  const keyCol = kbCase === "#d9d4c6" || kbCase === "#f1efe9" ? "#bab3a2" : "#3a3a42";
  for (let row = 0; row < 4; row++) for (let k = 0; k < 16; k++) R(x, kx + 3 + k * 6 + (row & 1) * 2, ky + 2 + row * 3, 4, 2, keyCol);
  if (rgb) anim.push((ctx, t) => {
    for (let row = 0; row < 4; row++) for (let k = 0; k < 16; k++) {
      ctx.fillStyle = `hsla(${(k * 22 + t * 0.12) % 360},100%,60%,.85)`;
      ctx.fillRect(kx + 3 + k * 6 + (row & 1) * 2, ky + 2 + row * 3 + 1, 4, 1);
    }
  });
  // mouse
  R(x, 230, 157, 8, 11, kbCase); R(x, 233, 157, 1, 4, "#555");
  if (rgb) anim.push((ctx, t) => { ctx.fillStyle = `hsl(${(t * 0.12) % 360},100%,60%)`; ctx.fillRect(230, 167, 8, 1); });

  // desk clutter in two zones
  const left = [8, 30, 56, 78], right = [246, 268, 292];
  const items = r.shuffle(["mug", "can", "can", "pizza", "plant", "controller", "phone", "lamp", "headphones", "figure"]);
  const zones = r.shuffle(left).slice(0, 2 + r.int(2)).concat(r.shuffle(right).slice(0, 1 + r.int(2)));
  if (personaKey === "cans") zones.push(60);
  zones.forEach((zx, i) => drawItem(x, anim, r, personaKey === "cans" && i === zones.length - 1 ? "canpile" : items[i % items.length], zx, desk));
  // persona prop
  if (personaKey === "synth") { R(x, 6, 160, 60, 14, "#2a2a2e"); for (let k = 0; k < 14; k++) R(x, 8 + k * 4, 166, 3, 7, "#f2f2f2"); for (let k = 0; k < 14; k++) if ([1, 2, 4, 5, 6].includes(k % 7)) R(x, 10 + k * 4, 166, 2, 4, "#111"); R(x, 10, 162, 3, 2, "#e33"); R(x, 16, 162, 3, 2, "#3e3"); }
  if (personaKey === "duck") { R(x, 252, 140, 10, 7, "#ffd21f"); R(x, 258, 136, 6, 6, "#ffd21f"); R(x, 263, 138, 3, 2, "#ff8a1f"); R(x, 261, 137, 1, 1, "#111"); }
  if (personaKey === "mic") { R(x, 300, 30, 2, 70, "#333"); R(x, 270, 30, 32, 2, "#333"); R(x, 266, 30, 8, 14, "#555"); R(x, 267, 31, 6, 12, "#777"); for (let j = 0; j < 5; j++) R(x, 267, 33 + j * 2, 6, 1, "#555"); }
  if (personaKey === "books") { for (let b = 0; b < 4; b++) R(x, 60 + b, 140 - b * 4, 26, 4, r.pick(["#7a2e2e", "#2e4a7a", "#2e7a4a", "#7a6a2e"])); }

  // cat sometimes
  if (r.chance(0.4)) {
    const cx2 = r.chance(0.5) ? 286 : 10, cy = 132, fur = r.pick(["#222", "#e08a3c", "#888", "#f2f2f2", "#6b4a2b"]);
    R(x, cx2, cy, 16, 12, fur); R(x, cx2 + 2, cy - 6, 10, 7, fur); R(x, cx2 + 2, cy - 8, 2, 2, fur); R(x, cx2 + 10, cy - 8, 2, 2, fur);
    anim.push((ctx, t) => {
      const blink = (t / 3700 | 0) % 5 === 0 && (t % 3700) < 160;
      R(ctx, cx2 + 4, cy - 4, 2, blink ? 1 : 2, "#9be36a"); R(ctx, cx2 + 8, cy - 4, 2, blink ? 1 : 2, "#9be36a");
      const sw = Math.round(Math.sin(t / 400) * 3);
      R(ctx, cx2 + 15, cy + 6, 3, 2, fur); R(ctx, cx2 + 17 + sw, cy + 2, 2, 5, fur);
    });
  }

  if (night) { x.fillStyle = "rgba(10,10,40,.18)"; x.fillRect(0, 146, ROOM_W, 34); }
  // monitor glow onto desk
  const glow = x.createLinearGradient(0, 146, 0, 180); glow.addColorStop(0, "rgba(150,190,255,.18)"); glow.addColorStop(1, "rgba(150,190,255,0)");
  x.fillStyle = glow; x.fillRect(40, 146, 240, 34);

  return { canvas: c, anim, night, led, mtype };
}

function drawItem(x, anim, r, kind, zx, desk) {
  const base = 160 + r.int(8);
  if (kind === "mug") {
    const col = r.pick(["#e9e4d8", "#c0392b", "#2c7be5", "#333"]);
    R(x, zx, base - 10, 10, 11, col); R(x, zx + 10, base - 8, 3, 6, col); R(x, zx + 1, base - 10, 8, 2, "#3b2416");
    anim.push((ctx, t) => { ctx.fillStyle = "rgba(255,255,255,.35)"; for (let i = 0; i < 3; i++) { const p = ((t / 60 + i * 8) % 24); ctx.fillRect(zx + 3 + Math.round(Math.sin((t / 300) + i) * 2), base - 12 - p, 1, 2); } });
  } else if (kind === "can" || kind === "canpile") {
    const n = kind === "canpile" ? 6 : 1 + r.int(2);
    const col = r.pick(["#1fd655", "#e8e8e8", "#ff4b2b", "#1a1a1a", "#7a3cff"]);
    const pos = kind === "canpile" ? [[0, 0], [6, 0], [12, 0], [3, -9], [9, -9], [6, -18]] : [[0, 0], [8, 2]];
    for (let i = 0; i < n; i++) { const [dx, dy] = pos[i]; R(x, zx + dx, base - 9 + dy, 5, 9, col); R(x, zx + dx, base - 9 + dy, 5, 1, "#bbb"); R(x, zx + dx + 1, base - 6 + dy, 3, 2, "#111"); }
  } else if (kind === "pizza") {
    R(x, zx - 4, base - 4, 26, 5, "#d6b27a"); R(x, zx - 4, base - 4, 26, 1, "#b8925a"); text(x, "PIZZA", zx, base - 3, "#a33");
  } else if (kind === "plant") {
    R(x, zx, base - 7, 10, 8, r.pick(["#b5651d", "#ddd", "#3a6"]));
    const dead = r.chance(0.3);
    for (let i = 0; i < 6; i++) { const lx = zx + 1 + r.int(8), lh = 4 + r.int(9); R(x, lx, base - 7 - lh, 1, lh, dead ? "#8a6a2b" : "#2e9e48"); R(x, lx - 1, base - 7 - lh, 3, 2, dead ? "#a07a30" : "#4ccf62"); }
  } else if (kind === "controller") {
    const col = r.pick(["#222", "#eee", "#5b3cc4"]);
    R(x, zx, base - 5, 18, 6, col); R(x, zx - 2, base - 3, 4, 5, col); R(x, zx + 16, base - 3, 4, 5, col);
    R(x, zx + 3, base - 3, 3, 1, "#888"); R(x, zx + 4, base - 4, 1, 3, "#888"); R(x, zx + 13, base - 4, 1, 1, "#e33"); R(x, zx + 15, base - 3, 1, 1, "#3c3");
  } else if (kind === "phone") {
    R(x, zx, base - 2, 8, 3, "#111"); anim.push((ctx, t) => { if ((t / 5200 | 0) % 4 === 1) R(ctx, zx + 1, base - 2, 6, 1, "#7fd0ff"); });
  } else if (kind === "lamp") {
    R(x, zx + 4, base - 2, 8, 3, "#333"); R(x, zx + 7, base - 22, 2, 20, "#333"); R(x, zx + 2, base - 28, 14, 7, r.pick(["#c0392b", "#2c3e50", "#d4a017"]));
    const g = x.createRadialGradient(zx + 9, base - 18, 2, zx + 9, base - 10, 30); g.addColorStop(0, "rgba(255,230,160,.4)"); g.addColorStop(1, "rgba(255,230,160,0)");
    x.fillStyle = g; x.fillRect(zx - 22, base - 30, 62, 40);
  } else if (kind === "headphones") {
    R(x, zx, base - 12, 3, 9, "#222"); R(x, zx + 13, base - 12, 3, 9, "#222"); R(x, zx + 1, base - 15, 14, 2, "#333"); R(x, zx + 1, base - 14, 1, 2, "#333"); R(x, zx + 14, base - 14, 1, 2, "#333");
  } else if (kind === "figure") {
    const fig = makeSprite(r, 7, 9, 0.6);
    drawSprite(x, fig, zx, base - 11, [0, r.pick(HAIR), "#fff", "#111", "#fff"]); R(x, zx - 1, base - 2, 9, 2, "#222");
  }
}
