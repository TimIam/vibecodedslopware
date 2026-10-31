// Tiles: tilesets (InitTiles/LoadBGTileset/LoadFGTileset/LoadLevelTilesets), tile kinds
// (LoadTileDefinitions/Lookup*TileKind), hot rects (InitTileHotRects) and collision masks.

import { G } from './state.js';
import { loadEncFaceSetFromPICT, getPicture, getResource, setResWorldFile, restoreResWorldFile, satGetFace } from '../core/res.js';
import { maskFromBitmap, maskFromCicn, maskFromFace } from './masks.js';

export const Tiles = {
  bgFaces: [], fgFaces: [],     // g_7e0e / g_7e12
  bgPict: -1, fgPict: -1,       // g_13c16 / g_13c18 (currently loaded level tileset ids)
  bgKinds: new Int16Array(96),  // g_7e2a
  fgKinds: new Int16Array(24),  // g_7eea (for FG tiles 32..55)
  fgRects: [],                  // g_790e: {hot:[t,l,b,r], redraw:[t,l,b,r]}
  bgRects: [],                  // g_748e: rect
  masks: [],                    // g_7e16: tile collision masks (PICT 160 cells), index = FG kind 0..31
  bgMask: null,                 // g_7e1a (cicn 290)
  harryMask: null,              // g_81ee (cicn 299)

  lookupBGKind(v) { return v >= 0 && v < 96 ? this.bgKinds[v] : v; },
  lookupFGKind(v) { return v >= 32 && v < 56 ? this.fgKinds[v - 32] : v; },
};

const R = (l, t, r, b) => [t, l, b, r]; // SetRect argument order -> [t,l,b,r]

export function initTileHotRects() {
  const halves = [R(0, 0, 16, 32), R(0, 0, 32, 16), R(16, 0, 32, 32), R(0, 16, 32, 32),
    R(0, 16, 16, 32), R(0, 0, 16, 16), R(16, 0, 32, 16), R(16, 16, 32, 32)];
  for (let k = 0; k < 64; k++) {
    let hot;
    if (k < 8) hot = halves[k];
    else if (k === 50) hot = R(0, 0, 32, 32);
    else if (k === 51) hot = R(4, 4, 28, 28);
    else if (k === 52) hot = R(8, 8, 24, 24);
    else if (k === 53) hot = R(12, 12, 20, 20);
    else hot = R(0, 0, 32, 32);
    Tiles.fgRects[k] = { hot, redraw: k < 8 ? halves[k] : R(0, 0, 32, 32) };
  }
  for (let k = 0; k < 96; k++) Tiles.bgRects[k] = (k >= 3 && k <= 5) ? R(6, 6, 26, 26) : R(2, 2, 30, 30);
}

export function initTiles() {
  Tiles.bgFaces = loadEncFaceSetFromPICT(180, 96, 32, 32, 8, 0, 0, 0);
  Tiles.fgFaces = loadEncFaceSetFromPICT(181, 64, 32, 32, 8, 0, 0, 0);
  Tiles.bgPict = 180; Tiles.fgPict = 181;
}

// InitFaces: LOAD2DFACEARRAY(PICT 160, 32 cells of 32x32, 8 cols) -> masks; SATGetFace(290/299)
export function initTileMasks() {
  const bm = getPicture(160);
  for (let i = 0; i < 32; i++) Tiles.masks[i] = bm ? maskFromBitmap(bm, (i % 8) * 32, ((i / 8) | 0) * 32, 32, 32) : null;
  Tiles.bgMask = maskFromCicn(getResource('cicn', 290));
  Tiles.harryMask = maskFromCicn(getResource('cicn', 299));
}

export function loadLevelTilesets() {
  const lv = G.level;
  const want = (id, def) => (id ? id : def);
  if (lv.bgTileset !== Tiles.bgLevelId) {
    Tiles.bgLevelId = lv.bgTileset;
    if (lv.bgTileset) { setResWorldFile(); Tiles.bgFaces = loadEncFaceSetFromPICT(want(lv.bgTileset, 180), 96, 32, 32, 8, 0, 0, 0); restoreResWorldFile(); }
    else Tiles.bgFaces = loadEncFaceSetFromPICT(180, 96, 32, 32, 8, 0, 0, 0);
  }
  if (lv.fgTileset !== Tiles.fgLevelId) {
    Tiles.fgLevelId = lv.fgTileset;
    if (lv.fgTileset) { setResWorldFile(); Tiles.fgFaces = loadEncFaceSetFromPICT(want(lv.fgTileset, 181), 64, 32, 32, 8, 0, 0, 0); restoreResWorldFile(); }
    else Tiles.fgFaces = loadEncFaceSetFromPICT(181, 64, 32, 32, 8, 0, 0, 0);
  }
}

// LoadTileDefinitions: BG kinds are 4-bit packed at level+0x12094, FG kinds 8-bit at +0x120c4
// (each nibble/byte stored with a -1 bias for FG; Unstuff16BitInto8Bits subtracts 1)
export function loadTileDefinitions() {
  const lv = G.level;
  for (let i = 0; i < 96; i += 4) {
    const w = lv.uw(0x12074 + ((i >> 2) + 0x10) * 2);
    Tiles.bgKinds[i] = w >> 12;
    Tiles.bgKinds[i + 1] = (w >> 8) & 15;
    Tiles.bgKinds[i + 2] = (w >> 4) & 15;
    Tiles.bgKinds[i + 3] = w & 15;
  }
  for (let i = 0; i < 24; i += 2) {
    const w = lv.uw(0x12074 + ((i >> 1) + 0x28) * 2);
    Tiles.fgKinds[i] = (w >> 8) - 1;
    Tiles.fgKinds[i + 1] = (w & 255) - 1;
  }
}

export { maskFromFace, satGetFace };
