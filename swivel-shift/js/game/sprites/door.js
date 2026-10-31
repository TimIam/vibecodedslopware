// Doors (seg 3 +0x12c0e..): kinds 901/911/921/931 closed, 903/913/923/933 locked (need a key whose
// colour is the record's word +4), 902/912/922/932 open. HITPLAYERSPRITE opens them by setting dir = 1;
// HANDLEDOORSPRITE then animates 9 frames and turns the kind into the open one.

import { G } from '../state.js';
import { setRect } from '../../core/util.js';
import { loadEncFaceSetFromPICT } from '../../core/res.js';
import { Hooks, register } from '../hooks.js';

let DoorFaces = []; // g_6ddc: PICT 801, 36 faces of 64x64 (4 orientations x 9 frames)

const LOCKED = [903, 913, 923, 933];
const OPEN = [902, 912, 922, 932];

// DOORTINTDRAWPROC: locked doors show their key colour
function doorTintDrawProc(face, s, blit) {
  if (s && LOCKED.includes(s.kind)) {
    if (s.param === -1) return blit(1, 4);
    switch (G.level.w(G.level.objOff(s.param) + 4)) {
      case 0: return blit(1, 4);
      case 1: return blit(1, 2);
      case 2: return blit(1, 10);
    }
    return undefined; // other values: not drawn
  }
  const tint = G.level.info(0);
  return tint ? blit(1, tint) : blit(0, 0);
}

export function initDoorSprite() {
  DoorFaces = loadEncFaceSetFromPICT(801, 36, 64, 64, 9, 0, 0, 2601);
  for (const f of DoorFaces) if (f) f.drawProc = doorTintDrawProc;
}

// group: 0 = 90x, 1 = 91x, 2 = 92x, 3 = 93x (or -1)
const group = (k) => {
  const d = k - 901;
  if (d < 0 || d > 32 || d % 10 > 2) return -1;
  return (d / 10) | 0;
};

export function setupDoorSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleDoorSprite;
  s.hit = hitDoorSprite;
  s.tileHit = null;
  s.layer = 5;
  if (OPEN.includes(s.kind)) s.dir = 16;
  switch (group(s.kind)) {
    case 0: setRect(s.hot, 15, 34, 46, 37); break;
    case 1: setRect(s.hot, 16, 15, 47, 18); break;
    case 2: setRect(s.hot, 33, 3, 36, 34); break;
    case 3: setRect(s.hot, 4, 1, 7, 32); break;
  }
  const g = group(s.kind);
  if (g >= 0) s.eface = OPEN.includes(s.kind) ? DoorFaces[g * 9 + 8] : DoorFaces[g * 9 + s.dir];
  s.posH = s.h; s.posV = s.v;
  s.behind = 1;
}

export function handleDoorSprite(s) {
  if (s.f92) return;
  if (!s.hit) setRect(s.hot, 0, 0, 0, 0);
  const g = group(s.kind);
  if (g >= 0) s.eface = DoorFaces[g * 9 + ((s.dir / 2) | 0)];
  if (s.dir > 0 && s.dir < 17) {
    s.dir++;
    if (s.kind === 901 || s.kind === 903) s.kind = 902;
    else if (s.kind === 911 || s.kind === 913) s.kind = 912;
    else if (s.kind === 921 || s.kind === 923) s.kind = 922;
    else if (s.kind === 931 || s.kind === 933) s.kind = 932;
    if (s.param >= 0 && s.param <= 255) G.level.setW(G.level.objOff(s.param) + 2, s.kind);
  }
}

// Shots stop at closed doors
export function hitDoorSprite(me, other) {
  if (me.f92 || other.f92) return;
  if (other.task !== Hooks.handleEnemyShotSprite && other.task !== Hooks.handlePlayerShotSprite) return;
  if (OPEN.includes(me.kind)) return;
  other.f92 = 1;
}

register({ initDoorSprite, setupDoorSprite, handleDoorSprite });
