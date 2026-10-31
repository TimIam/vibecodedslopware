// Static sprite types (seg 3): items, exits, stairs, desks, hazards, custom/overhead.
// Their behaviour on contact lives in HITPLAYERSPRITE (hitplayer.js); their own hit procs are no-ops.

import { G } from '../state.js';
import { setRect } from '../../core/util.js';
import { load1EncFaceFromCicn, loadEncFaceSetFromPICT } from '../../core/res.js';
import { Faces, userTintDrawProc } from '../faces.js';
import { Hooks, register } from '../hooks.js';

const noHit = () => {};
const tintable = (f) => { if (f) f.drawProc = userTintDrawProc; return f; };

// ---------------------------------------------------------------- items (11199 + 100*n)
const ItemFaces = { byIndex: [], k11398: null, k11397: null, anim: [] }; // g_6c3e / g_6c66 / g_6c6a / g_6c6e

export function initItemSprite() {
  for (let i = 0; i < 10; i++) {
    ItemFaces.byIndex[i] = null;
    if (i === 5 || i === 9) continue;
    ItemFaces.byIndex[i] = tintable(load1EncFaceFromCicn(11199 + 100 * i, false, 3601 + i));
  }
  ItemFaces.k11398 = tintable(load1EncFaceFromCicn(11398, false, 3651));
  ItemFaces.k11397 = tintable(load1EncFaceFromCicn(11397, false, 3652));
  ItemFaces.anim = loadEncFaceSetFromPICT(11600, 8, 16, 16, 8, 0, 0, 3661);
  for (const f of ItemFaces.anim) tintable(f);
}

export function setupItemSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleItemSprite;
  s.hit = hitItemSprite;
  s.tileHit = null;
  setRect(s.hot, -6, -6, 20, 20);
  if (s.kind === 11699) s.eface = null; // animated (HANDLE picks the frame)
  else if (s.kind === 11398) s.eface = ItemFaces.k11398;
  else if (s.kind === 11397) s.eface = ItemFaces.k11397;
  else s.eface = ItemFaces.byIndex[((s.kind - 11199) / 100) | 0] || null;
  s.f26 = 0;
  s.layer = 7;
  s.f6e = 0;
  s.posH = s.h; s.posV = s.v;
  s.behind = 1;
}

export function handleItemSprite(s) {
  if (s.f92 || s.kind !== 11699) return;
  if (++s.dir > 15) s.dir = 0;
  s.eface = ItemFaces.anim[s.dir >> 1];
}
export const hitItemSprite = noHit;

// ---------------------------------------------------------------- exits (9991..9994)
const ExitFaces = []; // g_6db0..g_6dbc

export function initExitSprite() {
  for (let i = 0; i < 4; i++) ExitFaces[i] = load1EncFaceFromCicn(9991 + i, false, 3201 + i);
}

export function setupExitSprite(s) {
  Hooks.initSprite(s);
  s.f74 = 0; s.dir = 0;
  s.task = handleExitSprite;
  s.hit = hitExitSprite;
  s.tileHit = null;
  setRect(s.hot, 0, 0, 64, 64);
  switch (s.kind) {
    case 9991: s.eface = ExitFaces[0]; setRect(s.hot, 0, 96, 64, 100); break;  // bottom edge
    case 9992: s.eface = ExitFaces[1]; setRect(s.hot, 0, -40, 64, -32); break; // top edge
    case 9993: s.eface = ExitFaces[2]; setRect(s.hot, 40, 0, 100, 64); break;  // right edge
    case 9994: s.eface = ExitFaces[3]; setRect(s.hot, -32, 0, 0, 64); break;   // left edge
    default: s.eface = null; setRect(s.hot, 0, 0, 32, 32);
  }
  s.layer = 1;
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
}
export function handleExitSprite(s) {}

// Touching an exit ends the level: the record's word +4 names the next level (0 = the next one).
export function hitExitSprite(me, other) {
  if (me.f92 || other.f92) return;
  if (other.task !== Hooks.handlePlayerSprite || me.f74) return;
  G.g46c6 = G.curLevel;
  const next = G.level.w(G.level.objOff(me.param) + 4);
  G.curLevel = next ? next : G.curLevel + 1;
  me.f74 = 0x45;
}

// ---------------------------------------------------------------- stairs (9901..9904, also 922/923/932/933)
const StairsFaces = []; // g_6b78..g_6b84

export function initStairsSprite() {
  for (let i = 0; i < 4; i++) StairsFaces[i] = load1EncFaceFromCicn(9901 + i, false, 4501 + i);
}

export function setupStairsSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleStairsSprite;
  s.hit = noHit;
  s.tileHit = null;
  s.layer = 1;
  setRect(s.hot, 0, 0, 32, 32);
  switch (s.kind) {
    case 9901: s.eface = StairsFaces[0]; break;
    case 9902: s.eface = StairsFaces[1]; break;
    case 922: case 923: case 9903: s.eface = StairsFaces[2]; break;
    case 932: case 933: case 9904: s.eface = StairsFaces[3]; break;
  }
  s.posH = s.h; s.posV = s.v;
  s.behind = 1;
}
export function handleStairsSprite(s) {}

// ---------------------------------------------------------------- desks (301..309 wide, 310..319 tall)
export function setupDeskSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleDeskSprite;
  s.hit = noHit;
  s.tileHit = null;
  s.layer = 1;
  if (s.kind < 310) { setRect(s.hot, 0, 0, 64, 32); s.eface = Faces.deskH[s.kind - 301] || null; }
  else { setRect(s.hot, 0, 0, 32, 64); s.eface = Faces.deskV[s.kind - 311] || null; }
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
}
export function handleDeskSprite(s) {}

// ---------------------------------------------------------------- hazards (3001)
export function setupHazardSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleHazardSprite;
  s.hit = noHit;
  s.tileHit = null;
  setRect(s.hot, 8, 8, 24, 24);
  s.face = null; s.f26 = 0;
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
}
export function handleHazardSprite(s) {}

// ---------------------------------------------------------------- bonuses (700..703, 711..713)
const BonusFaces = {}; // g_7024.. by kind

export function initBonusSprite() {
  [[700, 1501], [701, 1502], [702, 1503], [703, 1504], [711, 1505], [712, 1506], [713, 1507]]
    .forEach(([id, hr]) => { BonusFaces[id] = tintable(load1EncFaceFromCicn(id, false, hr)); });
}

export function setupBonusSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleBonusSprite;
  s.hit = noHit;
  s.tileHit = null;
  s.layer = 1;
  setRect(s.hot, -6, -6, 22, 22);
  switch (s.kind) {
    case 700: case 701: s.eface = BonusFaces[700]; break;
    case 702: s.eface = BonusFaces[702]; setRect(s.hot, -6, -6, 36, 36); break;
    case 703: s.eface = BonusFaces[703]; break;
    case 711: case 712: case 713: setRect(s.hot, -10, -10, 26, 26); s.eface = BonusFaces[s.kind]; break;
  }
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.posH << 8; s.fixV = s.posV << 8;
  s.behind = 1;
}

// 700/701 blink between two faces
export function handleBonusSprite(s) {
  if (s.f92 || (s.kind !== 700 && s.kind !== 701)) return;
  if (s.dir === 0) { s.dir = 1; s.eface = BonusFaces[701]; }
  else { s.dir = 0; s.eface = BonusFaces[700]; }
}

// ---------------------------------------------------------------- custom sprites
export function handleCustomSprite(s) {
  if (!s.f92) s.layer = s.kind;
}

// InitHazardSprite / InitCustomSprite / InitOverheadSprite / InitFirePipeSprite / InitReversorSprite are empty
const nothing = () => {};
register({ initHazardSprite: nothing, initCustomSprite: nothing, initOverheadSprite: nothing,
  initFirePipeSprite: nothing, initReversorSprite: nothing });

register({
  initItemSprite, setupItemSprite, handleItemSprite,
  initExitSprite, setupExitSprite, handleExitSprite,
  initStairsSprite, setupStairsSprite, handleStairsSprite,
  setupDeskSprite, handleDeskSprite,
  initBonusSprite, setupBonusSprite, handleBonusSprite,
  setupHazardSprite, handleHazardSprite,
  handleCustomSprite,
});
