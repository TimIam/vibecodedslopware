// Harry's weapons (seg 3): the held weapon sprite (+FindHeldWeaponPos, WEAPONTINTDRAWPROC, MakeNewShot,
// AssignShotSpeed) and player shots. Shot kinds: 0 staple, 1 heavy staple, 4 thrown soda,
// 10 the "big Harry" swivel-power shot. G.shotType selects the spread pattern MakeNewShot fires.

import { G } from '../state.js';
import { setRect, sectRect } from '../../core/util.js';
import { SATNewSprite, SATRand } from '../../core/sat.js';
import { load1EncFaceFromCicn } from '../../core/res.js';
import { maskFromFace } from '../masks.js';
import { PlayerFaces } from '../player.js';
import { Tiles } from '../tiles.js';
import { findScaledPosAndBounds } from '../world.js';
import { applyModedImpulse, inverseMode, wallBounce } from '../physics.js';
import { S, playRegSound, play3DSound, play3DSoundPitched } from '../sound.js';
import { noScaleDrawProc } from '../faces.js';
import { Hooks, register } from '../hooks.js';

const ITEM_STAPLER = 11299, ITEM_SWIVEL = 11599, ITEM_SODA_GUN = 11799;
const W = { held: [], staples: [], heavy: [], cans: null, shotMask: null, type: 0 }; // g_6c72 / g_6bd4 / g_6bf4 / g_6d92
const is = (o, name) => o.task === Hooks[name];
const curItemId = () => (G.curItem >= 0 && G.inventory[G.curItem] ? G.inventory[G.curItem].id : -1);

// ---------------------------------------------------------------- held weapon
function weaponTintDrawProc(face, s, blit) {
  const p = G.player;
  const scale = p && p.scaleH !== 256 ? p.scaleH << 5 : 0;
  if (W.type === 0) return blit(0, scale);
  if (W.type === 2) return blit(1, scale + 4);
  if (G.charge > 6) {
    const c = G.charge - 7;
    if (c <= 59) return blit(1, scale + ((c & 1) ? 8 : 12)); // flashing while charged
    blit(1, scale + 12);
    G.charge = 61;
    return undefined;
  }
  return blit(1, scale + 12);
}

export function initHeldWeaponSprite() {
  for (let i = 0; i < 36; i++) {
    W.held[i] = load1EncFaceFromCicn(11201 + i, false, 3501 + i);
    if (W.held[i]) W.held[i].drawProc = weaponTintDrawProc;
  }
  for (let i = 0; i < 36; i++) {
    W.held[36 + i] = load1EncFaceFromCicn(11251 + i, false, 3551 + i);
    if (W.held[36 + i]) W.held[36 + i].drawProc = weaponTintDrawProc;
  }
}

// FindHeldWeaponPos: the weapon sits at a per-direction point of Harry's (possibly scaled) face
const HELD_POS = [ // [h, v] for directions 0..35
  [39, 40], [41, 38], [42, 37], [43, 35], [43, 33], [43, 31], [43, 29], [42, 28], [41, 25],
  [40, 24], [39, 22], [37, 21], [35, 20], [33, 20], [31, 20], [30, 20], [27, 20], [24, 21],
  [24, 23], [22, 24], [21, 26], [20, 27], [20, 30], [20, 32], [20, 33], [20, 36], [21, 38],
  [22, 39], [24, 41], [26, 42], [27, 43], [30, 43], [31, 43], [34, 43], [35, 43], [37, 42],
];
function findHeldWeaponPos(s) {
  const p = G.player;
  let bv = p.posV, bh = p.posH;
  if (p.scaleH !== 256) {
    const sp = findScaledPosAndBounds(p.posV, p.posH, p.eface, p.scaleH, p.scaleH);
    bv = sp.v; bh = sp.h;
  }
  const [oh, ov] = HELD_POS[G.playerDir] || [0, 0];
  s.h = bh + ((oh * p.scaleH) >> 8) - 6;
  s.v = bv + ((ov * p.scaleV) >> 8) - 6;
}

export function setupHeldWeaponSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleHeldWeaponSprite;
  s.tileHit = null;
  s.layer = 11;
  setRect(s.hot, -4, -4, 16, 16);
  s.eface = W.held[G.playerDir];
  findHeldWeaponPos(s);
  s.f26 = 0;
}

export function handleHeldWeaponSprite(s) {
  if (s.f92) return;
  findHeldWeaponPos(s);
  s.posH = s.h; s.posV = s.v;
  const id = curItemId();
  const frame = (G.firing > 0 ? 36 : 0) + G.playerDir;
  if (id === ITEM_STAPLER) { W.type = 0; s.eface = W.held[frame]; }
  else if (id === ITEM_SWIVEL) { W.type = 1; s.eface = W.held[frame]; }
  else if (id === ITEM_SODA_GUN) { W.type = 2; s.eface = W.held[frame]; }
  else s.eface = null;
  if (G.firing > 1) makeNewShot(s);
  if (G.charge > 0) s.f8a = 1;
  s.behind = 1;
}

// AssignShotSpeed: 2200 units straight out of the barrel (the impulse table, reversed)
function assignShotSpeed(shot) { applyModedImpulse(shot, inverseMode(G.playerDir), 2200); }

function spawn(kind, h, v, jitter) {
  const shot = SATNewSprite(kind, h, v, setupPlayerShotSprite);
  shot.f50 = 0; shot.f4e = 0;
  assignShotSpeed(shot);
  if (jitter) {
    shot.f50 = (shot.f50 + SATRand(jitter * 2) - jitter) << 16 >> 16;
    shot.f4e = (shot.f4e + SATRand(jitter * 2) - jitter) << 16 >> 16;
  }
  return shot;
}

// MakeNewShot(heldWeapon)
function makeNewShot(w) {
  const t = G.shotType, h = w.h + 2, v = w.v + 2;
  if (t === 0 || t === 1 || t === 4) {
    spawn(t, h, v, t === 1 ? 512 : 0);
  } else if (t >= 5 && t <= 7) { // 2, 3 or 4 staples in a spread
    for (let i = 0; i < t - 3; i++) {
      const sh = h + SATRand(4), sv = v - SATRand(4);
      spawn(0, sh, sv, 256);
    }
  } else if (t === 2) {
    if (G.ammoBadass > 0) {
      const sgn = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
      for (const [a, b] of sgn) {
        const sh = h + a * SATRand(4), sv = v + b * SATRand(4);
        spawn(1, sh, sv, 256);
      }
    } else {
      Hooks.easyExplosion(w.posH - 26, w.posV - 26, 0, 0, 12, 2);
      playRegSound(S(602), 100, 256);
      playRegSound(S(239), 100, 256);
    }
  }
}

// ---------------------------------------------------------------- player shots
export function initPlayerShotSprite() {
  for (let i = 0; i < 7; i++) {
    W.staples[i] = load1EncFaceFromCicn(1291 + i, false, 4001 + i);
    if (W.staples[i]) W.staples[i].drawProc = noScaleDrawProc;
  }
  for (let i = 0; i < 7; i++) {
    W.heavy[i] = load1EncFaceFromCicn(1981 + i, false, 4011 + i);
    if (W.heavy[i]) W.heavy[i].drawProc = noScaleDrawProc;
  }
  const mf = load1EncFaceFromCicn(1299, true, 4021);
  W.shotMask = mf ? maskFromFace(mf) : null;
}

export function setupPlayerShotSprite(s) {
  Hooks.initSprite(s);
  s.f4e = 0; s.f50 = 0;
  s.f26 = 0;
  s.dir = 0;
  s.layer = 11;
  s.task = handlePlayerShotSprite;
  s.hit = hitPlayerShotSprite;
  s.tileHit = hitPlayerShotTileSprite;
  s.f74 = 3;
  if (s.kind < 10) setRect(s.hot, -2, -2, 10, 10);
  else setRect(s.hot, 27, 27, 37, 37);
  s.eface = null;
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  s.behind = 1;
}

export function handlePlayerShotSprite(s) {
  if (s.f92) return;
  if (s.f74 > 0 && --s.f74 === 0) s.behind = 0;
  if (s.kind < 10) {
    if (++s.dir > 6) s.dir = 0;
    if (s.kind === 1) s.eface = W.heavy[s.dir];
    else if (s.kind === 0) s.eface = W.staples[s.dir];
    else if (s.kind === 4) s.eface = Hooks.sodaCanFace(s.dir);
  } else {
    s.dir += 2;
    if (s.dir > 35) s.dir = 0;
    s.eface = PlayerFaces.harry[s.dir];
  }
  s.fixH += s.f50; s.fixV += s.f4e;
  s.posH = s.h = s.fixH >> 8;
  s.posV = s.v = s.fixV >> 8;
}

function sodaBlast(s) {
  playRegSound(S(500), 20, 256);
  Hooks.easyExplosion(s.h - 28, s.v - 28, 0, 0, 14, 0);
}

export function hitPlayerShotSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (is(o, 'handleRobotSprite')) {
    o.layer = 10;
    o.f72--;
    o.f6e = 0;
    playRegSound(S(600), 15, 256);
    if (o.f72 > 0) {
      const d = o.kind < 2001 ? 20 : 12;
      Hooks.easyExplosion(o.h - d, o.v - d, 0, 0, -1, 0);
    }
    me.f92 = 1;
  }
  if (is(o, 'handleBlobSprite')) {
    if (o.f72 > 0) {
      o.layer = 10;
      o.f72--;
      o.f6e = 0;
      playRegSound(S(604), 15, 256);
      if (o.f72 === 0) playRegSound(S(603), 15, 256);
      me.f92 = 1;
    }
  } else if (is(o, 'handleColliderSprite') || is(o, 'handleSlidingDoorSprite')) {
    play3DSound(S(4700), 20, 256, me.posV, me.posH);
    me.f92 = 1;
  } else if (is(o, 'handleCoWorkerSprite') || is(o, 'handleScientistSprite') || is(o, 'handleDartEnemySprite')) {
    me.f92 = 1;
    G.g46c0 -= 2;
    if (SATRand(100) < 50) {
      const id = [253, 254, 255, 256][SATRand(4)];
      play3DSound(S(id), 20, 256, me.posV, me.posH);
    }
    o.layer = 10;
    o.f8a = 1;
  }
  if (is(o, 'handleGrateSprite') && o.f72 > 0) {
    o.f72--;
    o.f8a = 1;
    o.layer = 10;
    let rate = SATRand(12000) + 40000;
    rate += o.kind < 3910 ? (20 - o.f72) * 1800 : (4 - o.f72) * 8000;
    play3DSoundPitched(S(4702), 15, 256, me.posV, me.posH, rate);
    me.f92 = 1;
  }
  if (me.kind === 4 && !is(o, 'handlePlayerSprite') && !is(o, 'handleHeldWeaponSprite') && !is(o, 'handleEffectSprite')) {
    me.f92 = 1;
    sodaBlast(me);
  }
}

export function hitPlayerShotTileSprite(s, cellV, cellH, kind, isFG) {
  s.behind = 1;
  // (the original builds the shot's rect with posV for its right edge)
  const shotR = [s.posV + 4, s.posH + 4, s.posV + 6, s.posV + 6];
  const fr = Tiles.fgRects[kind] ? Tiles.fgRects[kind].hot : [0, 0, 32, 32];
  const tileR = [cellV + fr[0], cellH + fr[1], cellV + fr[2], cellH + fr[3]];
  if (isFG === 1 && kind < 56 && !sectRect(shotR, tileR)) return;
  if (isFG !== 1 || s.f74 > 0) return;
  if (kind < 56 && !wallBounce(s, kind, cellV, cellH, 4, 1, s.hot, W.shotMask, false)) return;
  s.f92 = 1;
  if (s.kind === 4) sodaBlast(s);
  else play3DSound(S(4700), 20, 256, s.v, s.h);
}

register({ initHeldWeaponSprite, setupHeldWeaponSprite, handleHeldWeaponSprite,
  initPlayerShotSprite, setupPlayerShotSprite, handlePlayerShotSprite });
