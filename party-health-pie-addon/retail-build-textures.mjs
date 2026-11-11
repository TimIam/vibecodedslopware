// Bakes every texture Party Health Pie uses into PartyHealthPie/Textures as uncompressed 32-bit TGA.
//
//   node party-health-pie/tools/build-textures.mjs
//
// Why sprite sheets: on Classic Forever a party member's health is a "secret" number. Lua cannot do
// arithmetic on it, so a wedge cannot be resized from it. Texture:SetSpriteSheetCell does accept a
// secret, so each band is pre-drawn at 64 fill levels and a curve picks the cell. The sheets are
// concentric (rotationally symmetric), and one sector mask per wedge cuts them to shape.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'PartyHealthPie', 'Textures');
mkdirSync(OUT, { recursive: true });

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// w*h RGBA, row 0 at the top of the image. Written bottom-up, the TGA default.
function writeTga(name, w, h, rgba) {
  const header = Buffer.alloc(18);
  header[2] = 2; // uncompressed true-colour
  header.writeUInt16LE(w, 12);
  header.writeUInt16LE(h, 14);
  header[16] = 32;
  header[17] = 8; // 8 alpha bits, bottom-left origin
  const body = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = y * w * 4;
    const dst = (h - 1 - y) * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      body[dst + x] = rgba[src + x + 2]; // B
      body[dst + x + 1] = rgba[src + x + 1]; // G
      body[dst + x + 2] = rgba[src + x]; // R
      body[dst + x + 3] = rgba[src + x + 3]; // A
    }
  }
  writeFileSync(join(OUT, `${name}.tga`), Buffer.concat([header, body]));
}

function paint(name, w, h, fn) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fn(x + 0.5, y + 0.5);
      const i = (y * w + x) * 4;
      rgba[i] = r * 255 + 0.5;
      rgba[i + 1] = g * 255 + 0.5;
      rgba[i + 2] = b * 255 + 0.5;
      rgba[i + 3] = a * 255 + 0.5;
    }
  }
  writeTga(name, w, h, rgba);
}

// ---- Sprite sheets: 8x8 cells, row-major from the top left, cell i drawn at level i/63. ----
const GRID = 8;
const LEVELS = GRID * GRID;
export const CELL_PAD = 2;

function sheet(name, cell, band) {
  const size = cell * GRID;
  const rho = cell / 2 - CELL_PAD; // the disk's radius inside a cell, in texels
  paint(name, size, size, (x, y) => {
    const col = Math.floor(x / cell);
    const row = Math.floor(y / cell);
    const level = (row * GRID + col) / (LEVELS - 1);
    const [inner, outer] = band(level);
    if (outer <= inner) return [1, 1, 1, 0];
    const dist = Math.hypot(x - (col + 0.5) * cell, y - (row + 0.5) * cell);
    const a = clamp01(outer * rho - dist + 0.5) * (inner > 0 ? clamp01(dist - inner * rho + 0.5) : 1);
    return [1, 1, 1, a];
  });
}

const RESOURCE_SHARE = 2 / 5; // keep in step with Pie.lua
sheet('sheet_health', 128, (l) => [RESOURCE_SHARE, RESOURCE_SHARE + (1 - RESOURCE_SHARE) * l]); // health above the resource band
sheet('sheet_health_full', 128, (l) => [0, l]); // health filling the wedge, resource display off
sheet('sheet_resource', 64, (l) => [1 - l, 1]); // the disk here is only the pie's resource band

// ---- Sector masks: one for each wedge position and shape. Angles run clockwise from 12 o'clock. ----
function sectorMask(name, start, end) {
  const size = 256;
  const c = size / 2;
  const mid = (start + end) / 2;
  const half = (end - start) / 2;
  paint(name, size, size, (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const off = Math.abs(((deg - mid + 540) % 360) - 180);
    const v = clamp01(((half - off) * Math.PI * Math.hypot(dx, dy)) / 180 + 0.5);
    return [v, v, v, v];
  });
}

const WEDGE = 72;
const PET_ARC = WEDGE * 0.33; // keep in step with PET_SHARE in Pie.lua
for (let slot = 1; slot <= 5; slot++) {
  const start = (slot - 1) * WEDGE - WEDGE / 2;
  sectorMask(`mask_full_${slot}`, start, start + WEDGE);
  sectorMask(`mask_class_${slot}`, start, start + WEDGE - PET_ARC);
  sectorMask(`mask_pet_${slot}`, start + WEDGE - PET_ARC, start + WEDGE);
}

// ---- Round parts. ----
const S = 512;
const C = S / 2;

// Black disk, white everywhere else. Sized at runtime so the hole leaves a ring of exact pixel width.
paint('mask_hole', S, S, (x, y) => {
  const v = clamp01(Math.hypot(x - C, y - C) - S / 4 + 0.5);
  return [v, v, v, v];
});

// The shield band's inner edge. Its hole is small enough that, even at the smallest hole the band
// needs, the mask still reaches past the rim. Keep in step with SHIELD_HOLE in Pie.lua.
paint('mask_hole_shield', S, S, (x, y) => {
  const v = clamp01(Math.hypot(x - C, y - C) - (S / 2) * 0.38 + 0.5);
  return [v, v, v, v];
});

// The incoming-heal band's outer edge: a round mask sized at runtime. Keep in step with HEAL_MASK_FILL.
paint('mask_disk', S, S, (x, y) => {
  const v = clamp01(254 - Math.hypot(x - C, y - C) + 0.5);
  return [v, v, v, v];
});

// The health band alone, so a heal band never paints over the resource band.
paint('ring_health', 256, 256, (x, y) => {
  const dist = Math.hypot(x - 128, y - 128);
  return [1, 1, 1, clamp01(126 - dist + 0.5) * clamp01(dist - 126 * RESOURCE_SHARE + 0.5)];
});

paint('disk', 256, 256, (x, y) => [1, 1, 1, clamp01(126 - Math.hypot(x - 128, y - 128) + 0.5)]);

// Greyscale with moving highlights, tinted by the chosen metal, so the rim reads as polished.
paint('metal_disk', S, S, (x, y) => {
  const dx = x - C;
  const dy = y - C;
  const theta = Math.atan2(dx, -dy);
  const shine = Math.abs(Math.cos(theta * 2 + 0.6)) ** 3;
  const glint = Math.abs(Math.cos(theta * 5 - 0.4)) ** 12;
  const v = clamp01(0.55 + 0.33 * shine + 0.12 * glint);
  return [v, v, v, clamp01(254 - Math.hypot(dx, dy) + 0.5)];
});

// ---- Role symbols: signed distances in a -1..1 square, y up, negative inside. ----
function boxDist(x, y, cx, cy, halfW, halfH) {
  const dx = Math.abs(x - cx) - halfW;
  const dy = Math.abs(y - cy) - halfH;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

function polygonDist(points, x, y) {
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[j];
    const ex = bx - ax;
    const ey = by - ay;
    const t = clamp01(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey));
    best = Math.min(best, Math.hypot(x - ax - ex * t, y - ay - ey * t));
    if (ay > y !== by > y && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
  }
  return inside ? -best : best;
}

const SHIELD = [[0, 0.86]];
for (let i = 0; i <= 16; i++) {
  const t = i / 16;
  SHIELD.push([0.8 * Math.cos((t * Math.PI) / 2) ** 0.55, 0.68 - 1.54 * t ** 1.5]);
}
for (let i = 15; i >= 0; i--) SHIELD.push([-SHIELD[i + 2][0], SHIELD[i + 2][1]]);

const BLADE = [[-0.15, -0.3], [-0.15, 0.62], [0, 0.9], [0.15, 0.62], [0.15, -0.3]];
const SWORD_SCALE = 1.25;
function swordDist(x, y) {
  const along = (x + y) / Math.SQRT2 / SWORD_SCALE;
  const across = (x - y) / Math.SQRT2 / SWORD_SCALE;
  const d = Math.min(
    polygonDist(BLADE, across, along),
    boxDist(across, along, 0, -0.33, 0.38, 0.08),
    boxDist(across, along, 0, -0.55, 0.07, 0.2),
    Math.hypot(across, along + 0.78) - 0.13,
  );
  return d * SWORD_SCALE;
}

const ROLE_OUTLINE = 0.15;
function roleSymbol(name, color, dist) {
  const size = 64;
  const aa = 2 / size;
  paint(name, size, size, (px, py) => {
    const x = (px / size) * 2 - 1;
    const y = 1 - (py / size) * 2;
    const d = dist(x, y);
    const a = clamp01((ROLE_OUTLINE - d) / aa + 0.5);
    const fill = clamp01(-d / aa + 0.5) * (0.82 + 0.3 * clamp01((y + 1) / 2));
    return [clamp01(color[0] * fill), clamp01(color[1] * fill), clamp01(color[2] * fill), a];
  });
}

roleSymbol('role_tank', [0.28, 0.62, 1], (x, y) => polygonDist(SHIELD, x, y));
roleSymbol('role_healer', [0.2, 0.86, 0.32], (x, y) =>
  Math.min(boxDist(x, y, 0, 0, 0.22, 0.68), boxDist(x, y, 0, 0, 0.68, 0.22)) - 0.05);
roleSymbol('role_dps', [1, 0.3, 0.22], swordDist);

// The same shapes with a white fill, tinted at runtime to the color of a debuff.
const WHITE = [1, 1, 1];
roleSymbol('role_tank_w', WHITE, (x, y) => polygonDist(SHIELD, x, y));
roleSymbol('role_healer_w', WHITE, (x, y) =>
  Math.min(boxDist(x, y, 0, 0, 0.22, 0.68), boxDist(x, y, 0, 0, 0.68, 0.22)) - 0.05);
roleSymbol('role_dps_w', WHITE, swordDist);

// A soft halo behind the symbol. Normal blending, because additive light vanishes on a white priest wedge.
paint('role_glow', 128, 128, (x, y) => {
  const d = Math.hypot(x - 64, y - 64) / 62;
  return [1, 1, 1, clamp01(1 - d) ** 1.4];
});

console.log('textures written to', OUT);
