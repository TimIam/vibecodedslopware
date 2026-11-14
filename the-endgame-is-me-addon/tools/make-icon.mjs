// The minimap button's picture: a warlock in pixels, 20 by 20, in the top left of a 32 by 32 TGA (art/minimap.tga).
// The button shows that 20 by 20 corner at 20 by 20, so a pixel of the art is a whole number of screen pixels.
//   node tools/make-icon.mjs          writes art/minimap.tga and build/minimap.ppm (the art eight times over, to look at)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PAL = {
  '.': null,
  d: '#2a1846',   // the robe's outline and folds
  p: '#6a3fa0',   // the robe
  P: '#9468d0',   // where the light catches it
  s: '#120c1c',   // the dark inside the hood
  g: '#8dff5e',   // eyes
  G: '#d6ffa0',   // the heart of the flame
  f: '#5fd83e',   // fel fire
  F: '#2b8f2c',   // its edge
  y: '#d8b45c',   // a gold clasp and hem
  h: '#d9b38c',   // a hand
};
const ART = [
  '....................',
  '.......dPPPd........',
  '......dPPPPPd.......',
  '.....dPPpppPPd......',
  '.....dPpssspPd......',
  '....dPpsssssPPd.....',
  '....dPsgssgspPd..G..',
  '....dPsssssspPd.GfG.',
  '....dPpsssspPd..GfG.',
  '.....dPpsspPPd.FffF.',
  '.....dPPppPPd..FffF.',
  '....dpPPyyPPpd..FF..',
  '...dppPPyyPPppd.hh..',
  '...dpppPPPPpppdphh..',
  '..dppppPPPPpppppd...',
  '..dpppppPPpppppdd...',
  '..dppppppppppppd....',
  '..dpppppyypppppd....',
  '..dddppppppppddd....',
  '....dddddddddd......',
];
if (ART.length !== 20 || ART.some(r => r.length !== 20)) throw new Error('the art must be 20 rows of 20: ' + ART.map(r => r.length).join(' '));
const rgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const at = (x, y) => { const c = x < 20 && y < 20 ? PAL[ART[y][x]] : null; if (c === undefined) throw new Error('no colour for ' + ART[y][x]); return c && rgb(c); };

const S = 32;
const tga = Buffer.alloc(18 + S * S * 4);
tga[2] = 2; tga.writeUInt16LE(S, 12); tga.writeUInt16LE(S, 14); tga[16] = 32; tga[17] = 8;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const c = at(x, y), o = 18 + ((S - 1 - y) * S + x) * 4;   // bottom row first
  if (c) { tga[o] = c[2]; tga[o + 1] = c[1]; tga[o + 2] = c[0]; tga[o + 3] = 255; }
}
fs.mkdirSync(path.join(root, 'art'), { recursive: true });
fs.writeFileSync(path.join(root, 'art', 'minimap.tga'), tga);

// to look at: the art eight times over on the minimap's dark disc
const K = 8, W = 20 * K, body = Buffer.alloc(W * W * 3);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const c = at(Math.floor(x / K), Math.floor(y / K)) || [24, 22, 30];
  body.set(c, (y * W + x) * 3);
}
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'minimap.ppm'), Buffer.concat([Buffer.from(`P6\n${W} ${W}\n255\n`), body]));
console.log('wrote art/minimap.tga (32x32, the art in its top left 20x20) and build/minimap.ppm');
