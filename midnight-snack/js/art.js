// Drawing: the static house layer, furniture, Case, the Portion Controller and its face.

import { W, H, ROOMS, FOOD } from "./map.js";

export const T = 16;

function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const rect = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
function ell(c, col, x, y, rx, ry) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); c.fill(); }
function box(c, x, y, w, h, top, front, fh = 5) { rect(c, front, x, y + h - fh, w, fh); rect(c, top, x, y, w, h - fh); rect(c, "rgba(255,255,255,.12)", x, y, w, 1); }

function floorTile(c, h, x, y) {
  const i = y * W + x, ri = h.room[i], fl = ri >= 0 ? ROOMS[ri].floor : "wood", px = x * T, py = y * T;
  const r = hash(x, y);
  if (fl === "carpet") {
    rect(c, "#373b58", px, py, T, T);
    for (let k = 0; k < 6; k++) rect(c, hash(x, y, k) > 0.5 ? "#3f4466" : "#30344e", px + ((hash(x, y, k + 9) * 15) | 0), py + ((hash(x, y, k + 20) * 15) | 0), 1, 1);
  } else if (fl === "tile") {
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) rect(c, (a + b) % 2 ? "#b9c7cc" : "#d5dfe2", px + a * 8, py + b * 8, 8, 8);
    rect(c, "rgba(0,0,0,.12)", px, py, T, 1); rect(c, "rgba(0,0,0,.12)", px, py, 1, T);
  } else if (fl === "checker") {
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) rect(c, (a + b + x + y) % 2 ? "#6b5c4c" : "#d8d0bf", px + a * 8, py + b * 8, 8, 8);
  } else if (fl === "concrete") {
    rect(c, "#585a5d", px, py, T, T);
    for (let k = 0; k < 8; k++) rect(c, hash(x, y, k) > 0.5 ? "#626467" : "#4f5154", px + ((hash(x, y, k + 9) * 15) | 0), py + ((hash(x, y, k + 20) * 15) | 0), 1, 1);
    if (r < 0.05) ell(c, "rgba(20,20,25,.45)", px + 8, py + 8, 6, 4);
  } else {
    const creak = h.creaky.has(i);
    for (let p = 0; p < 2; p++) {
      const base = creak ? (p ? "#8a6744" : "#94704a") : (hash(x, y, p) > 0.5 ? "#6b4a2f" : "#734f31");
      rect(c, base, px, py + p * 8, T, 8);
      rect(c, "#3b2817", px, py + p * 8 + 7, T, 1);
      const seam = ((hash(x >> 1, y, p) * 16) | 0);
      if ((x + p) % 2 === 0) rect(c, "#3b2817", px + seam, py + p * 8, 1, 7);
      rect(c, "rgba(255,255,255,.05)", px, py + p * 8, T, 1);
    }
    if (creak) { // a cracked, lifted board you can learn to spot
      c.strokeStyle = "#2a1a0e"; c.lineWidth = 1; c.beginPath();
      c.moveTo(px + 3, py + 4); c.lineTo(px + 7, py + 3); c.lineTo(px + 10, py + 5); c.lineTo(px + 13, py + 4); c.stroke();
      rect(c, "#2a1a0e", px + 2, py + 11, 2, 1); rect(c, "#2a1a0e", px + 12, py + 11, 2, 1);
    }
  }
}

const WINDOWS = new Set(["42,0", "43,0", "44,0", "0,17", "0,18"]);

function wallTile(c, h, x, y) {
  const px = x * T, py = y * T;
  rect(c, "#1c1622", px, py, T, T);
  rect(c, "#241d2c", px + 1, py + 1, T - 2, 4);
  const below = y + 1 < H ? h.grid[(y + 1) * W + x] : 1;
  if (below !== 1) {
    const ri = h.room[(y + 1) * W + x];
    const col = ri >= 0 ? ROOMS[ri].wall : "#5e4334";
    rect(c, col, px, py + 6, T, 10);
    rect(c, "rgba(255,255,255,.08)", px, py + 6, T, 1);
    for (let k = 0; k < 3; k++) rect(c, "rgba(0,0,0,.08)", px + 2 + k * 5, py + 7, 1, 8);
    rect(c, "#1a1410", px, py + 14, T, 2);
    if (WINDOWS.has(`${x},${y}`)) { rect(c, "#2a2230", px + 2, py + 7, 12, 7); rect(c, "#0b1430", px + 3, py + 8, 10, 5); rect(c, "#1c2a50", px + 3, py + 8, 4, 2); }
    if (x === 19 && y === 0) { rect(c, "#7d8b92", px + 3, py + 7, 10, 7); rect(c, "#b7c6cc", px + 4, py + 8, 8, 5); rect(c, "#dbe6ea", px + 5, py + 8, 2, 2); }
    if (x === 10 && y === 0) { rect(c, "#3a2f20", px + 3, py + 7, 10, 6); rect(c, "#c23a3a", px + 4, py + 8, 8, 4); } // a framed poster
  }
  // side windows on the living-room's outer wall
  if (WINDOWS.has(`${x},${y}`) && x === 0) { rect(c, "#2a2230", px + 9, py + 1, 6, 14); rect(c, "#0b1430", px + 10, py + 2, 4, 12); }
}

function furniture(c, f) {
  const x = f.x * T, y = f.y * T, w = f.w * T, h = f.h * T;
  switch (f.k) {
    case "bed":
      box(c, x, y, w, h, "#5b3a22", "#3c2614", 4);
      rect(c, "#2f5d8a", x + 2, y + 14, w - 4, h - 20);
      rect(c, "#3b6fa1", x + 2, y + 14, w - 4, 3);
      rect(c, "#e8e8e8", x + 6, y + 3, w - 12, 9);
      rect(c, "#cfcfcf", x + 6, y + 10, w - 12, 2);
      break;
    case "desk":
      box(c, x, y - 4, w, h + 4, "#26262c", "#17171b", 5);
      rect(c, "#0d0d10", x + 12, y - 12, 26, 13); rect(c, "#6a4cff", x + 14, y - 10, 22, 9);
      rect(c, "#9f8cff", x + 15, y - 9, 7, 2);
      rect(c, "#0d0d10", x + 42, y - 9, 14, 10); rect(c, "#1fd1a5", x + 44, y - 7, 10, 6);
      for (let k = 0; k < 8; k++) rect(c, `hsl(${k * 45},90%,60%)`, x + 14 + k * 3, y + 4, 3, 2);
      // gaming chair (you can walk through it, it has accepted its fate)
      rect(c, "#111", x + 18, y + 18, 18, 14); rect(c, "#c2272d", x + 22, y + 19, 3, 12); rect(c, "#c2272d", x + 29, y + 19, 3, 12);
      rect(c, "#222", x + 16, y + 30, 22, 4);
      break;
    case "dresser": box(c, x, y - 6, w, h + 6, "#6b4a30", "#4a321f", 8); rect(c, "#c9a46b", x + 8, y + 3, 4, 1); rect(c, "#c9a46b", x + 20, y + 3, 4, 1); break;
    case "tub":
      ell(c, "#e6eef0", x + w / 2, y + h / 2, w / 2, h / 2); ell(c, "#a9c4cc", x + w / 2, y + h / 2 + 1, w / 2 - 4, h / 2 - 5);
      rect(c, "#5a8fd0", x, y + h - 3, w, 2); for (let k = 0; k < w; k += 4) rect(c, "#4677b5", x + k, y + h - 3, 2, 3);
      break;
    case "toilet": ell(c, "#e9eef0", x + 8, y + 9, 6, 6); rect(c, "#d9e1e4", x + 3, y - 2, 10, 5); ell(c, "#bccbd0", x + 8, y + 9, 3.5, 3.5); break;
    case "sink": box(c, x + 1, y, 14, 14, "#e9eef0", "#c7d2d6", 4); ell(c, "#a9bcc2", x + 8, y + 5, 4, 3); break;
    case "counter": case "island": case "cabinet": {
      const top = f.k === "cabinet" ? "#8a6a48" : "#c9c2b5", front = f.k === "cabinet" ? "#5a3f28" : "#7b5a3a";
      box(c, x, y - (f.k === "island" ? 0 : 4), w, h + (f.k === "island" ? 0 : 4), top, front, 6);
      for (let k = 6; k < w; k += 16) rect(c, "rgba(0,0,0,.25)", x + k, y + h - 6, 1, 6);
      if (f.k === "counter" && f.x === 23) { rect(c, "#333", x + 30, y - 3, 14, 9); rect(c, "#1a1a1a", x + 32, y - 1, 8, 5); rect(c, "#3f3", x + 41, y + 1, 2, 1); } // microwave
      break;
    }
    case "stove":
      box(c, x, y - 4, w, h + 4, "#2a2a2e", "#d8d8d8", 6);
      [[7, 1], [23, 1]].forEach(([a, b]) => { ell(c, "#444", x + a, y + b, 4, 3); ell(c, "#2a2a2e", x + a, y + b, 2, 1.5); });
      break;
    case "fridge":
      rect(c, "#9aa3aa", x, y - 12, w, h + 12);
      rect(c, "#dfe4e8", x + 1, y - 11, w - 2, h + 10);
      rect(c, "#b8c0c6", x + 1, y - 2, w - 2, 1);
      rect(c, "#8a939a", x + w / 2 - 1, y - 9, 2, 6); rect(c, "#8a939a", x + w / 2 - 1, y + 1, 2, 8);
      rect(c, "#ffd93b", x + 6, y - 8, 4, 4); rect(c, "#ff6b8b", x + 22, y + 2, 4, 3); // magnets
      break;
    case "trash": rect(c, "#5d6166", x + 3, y + 2, 10, 13); rect(c, "#7b8086", x + 2, y + 1, 12, 3); break;
    case "couch":
      rect(c, "#5c2222", x - 2, y - 8, w + 4, h + 8);
      rect(c, "#7a2e2e", x, y - 4, w, h + 2);
      for (let k = 0; k < 3; k++) rect(c, "#8f3a3a", x + 4 + k * ((w - 8) / 3), y - 3, (w - 8) / 3 - 2, h);
      rect(c, "#4a1a1a", x - 2, y + h - 2, w + 4, 3);
      break;
    case "tv": rect(c, "#222", x + 6, y + 10, w - 12, 5); rect(c, "#0b0b0e", x, y - 6, w, 16); break;
    case "coffee": box(c, x, y, w, h, "#7a5536", "#4e3420", 5); break;
    case "fort": {
      const cols = ["#c0504d", "#4f81bd", "#f2c14e", "#7aa65a"];
      for (let k = 0; k < 4; k++) { c.fillStyle = cols[k]; c.beginPath(); c.moveTo(x + k * w / 4, y + h); c.lineTo(x + w / 2, y - 4); c.lineTo(x + (k + 1) * w / 4, y + h); c.fill(); }
      c.fillStyle = "#120d0d"; c.beginPath(); c.moveTo(x + w / 2 - 7, y + h); c.lineTo(x + w / 2, y + h - 18); c.lineTo(x + w / 2 + 7, y + h); c.fill();
      break;
    }
    case "lamp": ell(c, "rgba(0,0,0,.3)", x + 8, y + 14, 5, 2); rect(c, "#555", x + 7, y - 2, 2, 15); c.fillStyle = "#d9c38a"; c.beginPath(); c.moveTo(x + 3, y + 2); c.lineTo(x + 13, y + 2); c.lineTo(x + 11, y - 6); c.lineTo(x + 5, y - 6); c.fill(); break;
    case "table":
      for (let k = 0; k < 3; k++) { rect(c, "#4e3420", x + 10 + k * 30, y - 7, 10, 7); rect(c, "#4e3420", x + 10 + k * 30, y + h, 10, 7); }
      box(c, x, y, w, h, "#8a5e3a", "#5a3c24", 6);
      rect(c, "rgba(255,255,255,.07)", x + 4, y + 4, w - 8, 2);
      break;
    case "china": box(c, x, y - 10, w, h + 10, "#4a3020", "#36220f", 6); for (let k = 0; k < 4; k++) ell(c, "#d8e2ea", x + 7 + k * 11, y - 4, 4, 4); break;
    case "shelf":
      box(c, x, y - 8, w, h + 8, "#7a5a3a", "#523a22", 7);
      for (let k = 2; k < w - 4; k += 7) rect(c, ["#c44", "#4a7", "#dc4", "#58c", "#c84"][((k / 7) | 0) % 5], x + k, y - 6, 5, 6);
      break;
    case "car":
      ell(c, "rgba(0,0,0,.35)", x + w / 2, y + h / 2 + 3, w / 2, h / 2 - 2);
      [[4, 10], [w - 10, 10], [4, h - 18], [w - 10, h - 18]].forEach(([a, b]) => rect(c, "#111", x + a, y + b, 6, 9));
      rect(c, "#2c4f7c", x + 6, y + 2, w - 12, h - 4); rect(c, "#3a6294", x + 8, y + 4, w - 16, 10);
      rect(c, "#0d1a2a", x + 10, y + 16, w - 20, 10); rect(c, "#0d1a2a", x + 10, y + h - 20, w - 20, 8);
      rect(c, "#ffe08a", x + 8, y + 2, 6, 2); rect(c, "#ffe08a", x + w - 14, y + 2, 6, 2);
      break;
    case "workbench": box(c, x, y - 4, w, h + 4, "#6a6a6a", "#444", 6); rect(c, "#c33", x + 8, y - 2, 12, 3); rect(c, "#999", x + 30, y - 3, 3, 6); rect(c, "#aaa", x + 40, y - 1, 12, 2); break;
    case "freezer": box(c, x, y - 4, w, h + 4, "#e8eef0", "#c2ccd0", 7); rect(c, "#9aa6ab", x + 2, y + 4, w - 4, 1); rect(c, "#6a767b", x + w / 2 - 4, y + 5, 8, 2); break;
    case "sodafridge": box(c, x, y - 8, w, h + 8, "#b22222", "#7d1717", 5); rect(c, "#3a1010", x + 3, y - 6, 10, 9); break;
  }
}

export function drawStatic(h) {
  const cv = document.createElement("canvas");
  cv.width = W * T * 2; cv.height = H * T * 2;
  const c = cv.getContext("2d");
  c.scale(2, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = h.grid[y * W + x];
    if (g === 1) wallTile(c, h, x, y); else floorTile(c, h, x, y);
  }
  // furniture shadows, then furniture back to front
  for (const f of h.furn) rect(c, "rgba(0,0,0,.25)", f.x * T + 2, f.y * T + f.h * T - 2, f.w * T, 4);
  [...h.furn].sort((a, b) => (a.y + a.h) - (b.y + b.h)).forEach(f => furniture(c, f));
  // rugs / doormats
  rect(c, "rgba(120,40,40,.35)", 4 * T, 15 * T, 6 * T, 3 * T);
  return cv;
}

// things that change: open doors, TV static, items on the furniture
export function drawDynamic(c, h, s) {
  const fr = h.furn.find(f => f.k === "fridge");
  if (s.fridgeOpen > 0) {
    const x = fr.x * T, y = fr.y * T;
    rect(c, "#fff8df", x + 2, y - 10, fr.w * T - 4, 24);
    for (let k = 0; k < 3; k++) rect(c, "#c8c2a8", x + 2, y - 4 + k * 6, fr.w * T - 4, 1);
    rect(c, "#cfd5da", x - 12, y - 10, 12, 26); rect(c, "#aab2b8", x - 12, y - 10, 2, 26); // the door swung open
    rect(c, "#cfd5da", x + fr.w * T, y - 10, 12, 26);
  }
  const fz = h.furn.find(f => f.k === "freezer");
  if (s.freezerOpen > 0) { const x = fz.x * T, y = fz.y * T; rect(c, "#e8f6ff", x + 2, y - 2, fz.w * T - 4, 10); rect(c, "#c2ccd0", x, y - 16, fz.w * T, 12); }
  // TV
  const tv = h.furn.find(f => f.k === "tv");
  const tx = tv.x * T + 2, ty = tv.y * T - 4;
  for (let k = 0; k < 18; k++) rect(c, Math.random() > 0.5 ? "#8fb5ff" : "#4b6db5", tx + Math.random() * (tv.w * T - 6), ty + Math.random() * 11, 3, 1);
  c.globalAlpha = 0.35; rect(c, "#6f97ff", tx, ty, tv.w * T - 4, 12); c.globalAlpha = 1;
  // food you can see (the fridge and freezer keep theirs a secret)
  c.font = "11px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  for (const f of h.furn) {
    if (!f.items.length || f.k === "fridge" || f.k === "freezer") continue;
    const n = Math.max(f.cap, f.items.length), step = f.w * T / n;
    f.items.forEach((id, i) => c.fillText(FOOD[id].e, f.x * T + step * (i + 0.5), f.y * T + Math.min(6, f.h * T / 2) - (f.k === "shelf" ? 4 : 0)));
  }
}

const EMOJI_FONT = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";

export function drawCase(c, px, py, o) {
  const bob = o.moving ? Math.abs(Math.sin(o.walk * Math.PI)) * 1.6 : Math.sin(o.t * 2) * 0.4;
  const sq = o.sneak ? 0.88 : 1;
  ell(c, "rgba(0,0,0,.35)", px, py, 13, 4);
  const lf = o.moving ? Math.sin(o.walk * Math.PI) * 2 : 0;
  rect(c, "#1d1f27", px - 8, py - 6 + lf, 6, 6); rect(c, "#1d1f27", px + 2, py - 6 - lf, 6, 6);
  c.save(); c.translate(px, py - 4); c.scale(1, sq); c.translate(-px, -(py - 4));
  const by = py - 13 - bob;
  ell(c, "#2a2e3b", px - 13, by + 1, 4, 6); ell(c, "#2a2e3b", px + 13, by + 1, 4, 6); // arms
  ell(c, "#323748", px, by, 13, 11);
  ell(c, "#3b4156", px, by + 2, 9, 7);
  if (o.face.y >= 0) { rect(c, "#e8e8e8", px - 3, by - 8, 1, 5); rect(c, "#e8e8e8", px + 2, by - 8, 1, 5); rect(c, "#2a2e3b", px - 6, by + 4, 12, 1); }
  const hy = py - 28 - bob, fx = o.face.x * 2;
  ell(c, "#e2b48c", px, hy, 7.5, 7);
  if (o.face.y < -0.3) {
    ell(c, "#2a1d14", px, hy - 1, 7.5, 6.5);
  } else {
    ell(c, "#2a1d14", px, hy - 5, 7.5, 3.5);
    ell(c, "#3a2a1c", px + fx * 0.5, hy + 4, 5.5, 3.2); // beard
    ell(c, "#e2b48c", px + fx * 0.5, hy + 2, 3, 1.4);
    const ey = hy - 1;
    if (o.scared) { ell(c, "#fff", px - 3 + fx, ey, 2, 2.4); ell(c, "#fff", px + 3 + fx, ey, 2, 2.4); rect(c, "#111", px - 3 + fx, ey, 1, 1); rect(c, "#111", px + 3 + fx, ey, 1, 1); }
    else { rect(c, "#111", px - 3 + fx, ey - 1, 2, 2); rect(c, "#111", px + 2 + fx, ey - 1, 2, 2); }
  }
  c.strokeStyle = "#111"; c.lineWidth = 2; c.beginPath(); c.arc(px, hy - 1, 8.5, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
  rect(c, "#c2272d", px - 10, hy - 3, 3, 6); rect(c, "#c2272d", px + 7, hy - 3, 3, 6);
  c.restore();
  if (o.carry.length) {
    c.font = `11px ${EMOJI_FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
    o.carry.forEach((e, i) => c.fillText(e, px + Math.sin(o.t * 4 + i) * 0.25 * i, py - 40 - bob - i * 8));
  }
}

export function drawMonster(c, px, py, o) {
  const jx = o.state === "chase" ? (Math.random() - 0.5) * 1.5 : 0;
  const sway = Math.sin(o.t * 1.7) * 1.2;
  px += jx;
  ell(c, "rgba(0,0,0,.4)", px, py, 7, 2.5);
  const lf = o.moving ? Math.sin(o.walk * Math.PI) * 2 : 0;
  rect(c, "#15151a", px - 3, py - 20 + lf, 2, 20 - lf); rect(c, "#15151a", px + 1, py - 20 - lf, 2, 20 + lf);
  rect(c, "#0a0a0c", px - 4, py - 1, 3, 1); rect(c, "#0a0a0c", px + 1, py - 1, 3, 1);
  const top = py - 46;
  rect(c, "#26262e", px - 5 + sway * 0.3, top + 8, 10, 20);
  rect(c, "#e8e3d6", px - 1 + sway * 0.3, top + 8, 2, 6); // shirt
  rect(c, "#8a1c1c", px - 0.5 + sway * 0.3, top + 9, 1, 6); // tie
  // long arms to the knees, clipboard in one hand
  rect(c, "#26262e", px - 8 + sway * 0.3, top + 9, 2, 22); rect(c, "#26262e", px + 6 + sway * 0.3, top + 9, 2, 22);
  rect(c, "#d9d4c7", px - 9 + sway * 0.3, top + 30, 3, 4); rect(c, "#d9d4c7", px + 6 + sway * 0.3, top + 30, 3, 4);
  rect(c, "#7a5a32", px + 7 + sway * 0.3, top + 24, 7, 9); rect(c, "#f3f0e6", px + 8 + sway * 0.3, top + 25, 5, 7);
  // tape measure around the neck
  rect(c, "#f2c230", px - 5 + sway * 0.3, top + 8, 10, 2); rect(c, "#f2c230", px - 5 + sway * 0.3, top + 9, 2, 12); rect(c, "#f2c230", px + 3 + sway * 0.3, top + 9, 2, 9);
  const hx = px + sway, hy = top + 1;
  ell(c, "#d9d4c7", hx, hy, 5.5, 8);
  if (o.face.y > -0.3) {
    ell(c, "#050505", hx - 2.4, hy - 1, 1.8, 2.6); ell(c, "#050505", hx + 2.4, hy - 1, 1.8, 2.6);
    rect(c, o.state === "chase" ? "#ff3b3b" : "#ffffff", hx - 2.6, hy - 1, 1, 1); rect(c, o.state === "chase" ? "#ff3b3b" : "#ffffff", hx + 2.2, hy - 1, 1, 1);
    if (o.state === "chase") { ell(c, "#050505", hx, hy + 4.5, 3, 2); rect(c, "#eee", hx - 2, hy + 3.4, 4, 0.8); } else rect(c, "#3a3630", hx - 2, hy + 4, 4, 0.8);
  }
  if (o.stun > 0) {
    c.globalAlpha = 0.45; ell(c, "#6fd14a", hx, hy + 14, 12, 22); c.globalAlpha = 1;
    c.font = `9px ${EMOJI_FONT}`; c.textAlign = "center";
    for (let k = 0; k < 3; k++) { const a = o.t * 4 + k * 2.1; c.fillText("💫", hx + Math.cos(a) * 8, hy - 9 + Math.sin(a) * 3); }
  }
}

export function drawEyes(c, px, py, t, red) {
  const top = py - 47 + Math.sin(t * 1.7) * 0.3, hx = px + Math.sin(t * 1.7) * 1.2;
  c.save(); c.shadowColor = red ? "#ff2020" : "#ffffff"; c.shadowBlur = 6;
  const blink = Math.sin(t * 0.7) > 0.97 ? 0.2 : 1;
  rect(c, red ? "#ff4040" : "#f4f4f4", hx - 3, top, 1.5, 1.5 * blink); rect(c, red ? "#ff4040" : "#f4f4f4", hx + 2, top, 1.5, 1.5 * blink);
  c.restore();
}

// The face. Used full-screen for the real thing and small for the fake-outs.
export function drawFace(c, cx, cy, s, t, open = 1) {
  c.save(); c.translate(cx, cy); c.scale(s, s);
  const g = c.createRadialGradient(0, -30, 20, 0, 0, 230);
  g.addColorStop(0, "#f1ebde"); g.addColorStop(0.65, "#b8b1a2"); g.addColorStop(1, "#2a2620");
  c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 165, 215, 0, 0, Math.PI * 2); c.fill();
  // cracks
  c.strokeStyle = "rgba(60,40,30,.5)"; c.lineWidth = 2; c.beginPath();
  c.moveTo(-120, -90); c.lineTo(-90, -60); c.lineTo(-100, -20); c.moveTo(110, -120); c.lineTo(80, -95); c.lineTo(95, -60); c.moveTo(40, 160); c.lineTo(60, 130); c.stroke();
  // nutrition label stuck to the forehead
  c.save(); c.rotate(-0.06);
  c.fillStyle = "#fbfbf6"; c.fillRect(-62, -182, 124, 70);
  c.strokeStyle = "#111"; c.lineWidth = 3; c.strokeRect(-62, -182, 124, 70);
  c.fillStyle = "#111"; c.font = "900 17px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "top";
  c.fillText("Nutrition Facts", 0, -177); c.fillRect(-56, -157, 112, 4);
  c.font = "bold 12px Arial, sans-serif"; c.fillText("Serving size: NONE", 0, -150); c.fillText("Calories allowed: 0", 0, -134);
  c.restore();
  // eye sockets
  for (const sx of [-1, 1]) {
    c.fillStyle = "#050303"; c.beginPath(); c.ellipse(sx * 62, -35, 44, 56, sx * 0.18, 0, Math.PI * 2); c.fill();
    c.save(); c.shadowColor = "#ff1d1d"; c.shadowBlur = 25; c.fillStyle = "#fff4f0";
    c.beginPath(); c.arc(sx * 58 + Math.sin(t * 30) * 2, -32, 6, 0, Math.PI * 2); c.fill(); c.restore();
  }
  c.fillStyle = "#1a1310"; c.beginPath(); c.ellipse(-10, 40, 6, 10, 0.3, 0, Math.PI * 2); c.ellipse(10, 40, 6, 10, -0.3, 0, Math.PI * 2); c.fill();
  // mouth
  const my = 112, mrx = 100, mry = 62 * open;
  c.fillStyle = "#0a0505"; c.beginPath(); c.ellipse(0, my, mrx, mry, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#3a0a0a"; c.beginPath(); c.ellipse(0, my + mry * 0.4, mrx * 0.5, mry * 0.35, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#eee6cf";
  for (let k = -6; k <= 6; k++) {
    const ax = k * 15, top = my - Math.sqrt(Math.max(0, 1 - (ax / mrx) ** 2)) * mry, bot = my + Math.sqrt(Math.max(0, 1 - (ax / mrx) ** 2)) * mry;
    c.beginPath(); c.moveTo(ax - 7, top - 2); c.lineTo(ax + 7, top - 2); c.lineTo(ax, top + 22 * open); c.fill();
    c.beginPath(); c.moveTo(ax - 7, bot + 2); c.lineTo(ax + 7, bot + 2); c.lineTo(ax, bot - 20 * open); c.fill();
  }
  // tape measure around the neck
  c.fillStyle = "#f2c230"; c.fillRect(-130, 195, 260, 26);
  c.fillStyle = "#111"; for (let k = -125; k < 130; k += 10) c.fillRect(k, 195, 2, k % 50 === 5 ? 12 : 7);
  c.restore();
}
