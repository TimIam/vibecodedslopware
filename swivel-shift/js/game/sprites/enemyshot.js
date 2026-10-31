// Enemy shots (seg 3 +0x1375a..0x14516). The kind selects the projectile:
//   1018/1028/1038/1048  darts flying left/right/up/down (dart throwers)
//   1051                 spinning projectile;  1101..1299 scientist vials (f7c == 1: homing; explode)
//   1991..1999 / 1900+   misc. animated shots;  2001..2999 robot shots;  2281 / 2291 boss shots
//   9450                 wall shooter bolt;  9610 soda can from a vending machine (turns into an item)

import { G } from '../state.js';
import { setRect } from '../../core/util.js';
import { SATNewSprite } from '../../core/sat.js';
import { load1EncFaceFromCicn, loadEncFaceSetFromPICT, getResource } from '../../core/res.js';
import { maskFromCicn } from '../masks.js';
import { applyModedImpulse, enforceMaxSpeed, wallBounce, bgTileBounce } from '../physics.js';
import { S, playRegSound, play3DSound } from '../sound.js';
import { noScaleDrawProc } from '../faces.js';
import { Hooks, register } from '../hooks.js';

const F = { darts: [], misc: [], spin: [], cans: [], vial: [], vialBoom: [], misc2: [], boss12: [], boss16: [],
  bolt: null, robot: null, mask: null };
const is = (o, name) => o.task === Hooks[name];
const noScale = (f) => { if (f) f.drawProc = noScaleDrawProc; return f; };
const isVial = (k) => k > 1100 && k < 1300;

export function initEnemyShotSprite() {
  for (let i = 0; i < 4; i++) F.darts[i] = noScale(load1EncFaceFromCicn(1018 + 10 * i, false, 3001 + i));
  for (let i = 0; i < 7; i++) F.misc[i] = noScale(load1EncFaceFromCicn(1991 + i, false, 3021 + i));
  for (let i = 0; i < 8; i++) F.spin[i] = noScale(load1EncFaceFromCicn(1051 + i, false, 3041 + i));
  for (let i = 0; i < 8; i++) F.cans[i] = noScale(load1EncFaceFromCicn(9611 + i, false, 3061 + i));
  const set = (pict, w, h, hrsp) => loadEncFaceSetFromPICT(pict, 8, w, h, 8, 0, 0, hrsp).map(noScale);
  F.vial = set(1113, 8, 8, 3081);
  F.vialBoom = set(1115, 16, 16, 3101);
  F.misc2 = set(1903, 8, 8, 3121);
  F.boss12 = set(2271, 12, 12, 5001);
  F.boss16 = set(2281, 16, 16, 4981);
  F.bolt = noScale(load1EncFaceFromCicn(9450, false, 3141));
  F.robot = noScale(load1EncFaceFromCicn(1281, false, 4801));
  F.mask = maskFromCicn(getResource('cicn', 1299));
}

export function setupEnemyShotSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.eface = null;
  s.layer = 11;
  s.f74 = 0; s.f7c = 0;
  s.task = handleEnemyShotSprite;
  s.hit = hitEnemyShotSprite;
  s.tileHit = hitEnemyShotTileSprite;
  s.f78 = 0;
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  setRect(s.hot, 0, 0, 8, 8);
  switch (s.kind) {
    case 1018: s.f50 = 0xd00; s.f4e = 0; break;
    case 1028: s.f50 = -0xd00; s.f4e = 0; break;
    case 1038: s.f50 = 0; s.f4e = -0xd00; break;
    case 1048: s.f50 = 0; s.f4e = 0xd00; break;
    case 2281: setRect(s.hot, 0, 0, 12, 12); break;
    case 2291: setRect(s.hot, 0, 0, 16, 16); break;
    case 9450: setRect(s.hot, 0, 0, 16, 16); s.eface = F.bolt; break;
    case 9610: s.f74 = 45; break;
    default: s.f74 = 8; s.f7c = 12;
  }
  s.behind = 0;
}

function move(s) {
  s.fixH += s.f50; s.fixV += s.f4e;
  s.h = s.posH = s.fixH >> 8;
  s.v = s.posV = s.fixV >> 8;
}

export function handleEnemyShotSprite(s) {
  if (s.f92) return;
  if (s.f7c > 0) s.f7c--;
  // a shot that has slowed to a crawl fizzles out
  if (Math.abs(s.f50) < 300 && Math.abs(s.f4e) < 300) { if (++s.f78 > 35) s.f92 = 1; }
  else if (s.f78 > 0) s.f78--;
  const k = s.kind;
  if (k === 1018 || k === 1028 || k === 1038 || k === 1048) {
    move(s);
    s.eface = F.darts[((k - 1018) / 10) | 0];
  } else if (k === 1051) {
    if (++s.dir > 14) s.dir = 0;
    move(s);
    s.eface = F.spin[s.dir >> 1];
  } else if (k === 2291) {
    if (++s.dir > 14) s.dir = 0;
    move(s);
    s.eface = F.boss16[s.dir >> 1];
  } else if (k === 2281) {
    if (++s.dir > 14) s.dir = 0;
    move(s);
    s.eface = F.boss12[s.dir >> 1];
  } else if (k >= 2001 && k < 3000) {
    if (s.f74 > 0) s.f74--;
    s.eface = F.robot;
    move(s);
  } else if (k === 9450) {
    move(s);
    s.eface = F.bolt;
  } else if (k === 9610) {
    s.f74--;
    if (++s.dir > 7) s.dir = 0;
    s.eface = F.cans[s.dir];
    move(s);
    if (s.f74 < 20) {
      s.f50 = (s.f50 * 235) >> 8;
      s.f4e = (s.f4e * 235) >> 8;
      if (s.f74 === 0) {
        s.f92 = 1;
        SATNewSprite(11899, s.posH - 4, s.posV - 4, Hooks.setupItemSprite); // the can lands as a soda
      }
    }
  } else if (isVial(k)) {
    if (s.f74 === 0) {
      if (++s.dir > 7) s.dir = 0;
      else if (s.dir < 0) s.dir = 0;
      s.eface = F.vial[s.dir];
      s.fixH += s.f50; s.fixV += s.f4e;
      if (s.f7c === 1) { // homing
        const me = Hooks.spriteCenter(s), pc = Hooks.spriteCenter(G.player);
        applyModedImpulse(s, Hooks.findDesiredDirectionGeneric(pc.v, pc.h, me.v, me.h), 50);
        enforceMaxSpeed(s, 1200);
        if (++s.f6e > 100) s.f74 = -16;
      }
      s.h = s.posH = s.fixH >> 8;
      s.v = s.posV = s.fixV >> 8;
    } else { // bursting
      s.hit = null;
      if (s.f74 === -16) {
        s.posH -= 4; s.posV -= 4;
        play3DSound(S(4703), 20, 256, s.v, s.h);
      }
      s.eface = F.vialBoom[8 - Math.trunc(-s.f74 / 2)];
      if (++s.f74 === -2) s.f92 = 1;
    }
  } else {
    s.f74--;
    if (++s.dir >= 7) s.dir = 0;
    s.eface = k < 1900 ? F.misc[s.dir] : F.misc2[s.dir];
    move(s);
  }
  if (s.posH > 0x1000 || s.posH < 0 || s.posV < 0 || s.posV > 0x1000) s.f92 = 1;
}

export function hitEnemyShotSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (me.kind === 9610) {
    if (['handleColliderSprite', 'handleCoolerSprite', 'handlePlantSprite', 'handleBarrelSprite',
      'handleGrateSprite', 'handleChairSprite'].some((n) => is(o, n))) Hooks.rectBounce(me, o, 4, 255, me.hot);
    return;
  }
  if (is(o, 'handleRobotSprite')) {
    if (me.kind > 2000 && o.kind > 2000) return;
    if (me.f7c !== 0) return;
    o.layer = 10;
    o.f72--;
    o.f6e = 0;
    playRegSound(S(600), 15, 256);
    if (o.f72 > 0) Hooks.easyExplosion(o.h - 20, o.v - 20, 0, 0, -1, 0);
    me.f92 = 1;
  } else if (is(o, 'handleColliderSprite') || is(o, 'handleSlidingDoorSprite')) {
    if (is(o, 'handleColliderSprite') && o.kind > 9400 && o.kind < 9500 && me.kind === 9450) return;
    play3DSound(S(4701), 20, 256, me.posV, me.posH);
    me.f92 = 1;
  } else if (is(o, 'handleGrateSprite') && o.f72 > 0) {
    o.f72--;
    o.f8a = 1;
    play3DSound(S(4702), 20, 256, me.posV, me.posH);
    o.layer = 10;
    me.f92 = 1;
  } else if (is(o, 'handleEnemyShotSprite') || is(o, 'handlePlayerShotSprite')) {
    if (isVial(me.kind)) {
      me.f74 = -16;
      if (isVial(o.kind)) o.f74 = -16; else o.f92 = 1;
    }
  }
}

export function hitEnemyShotTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG === 1) {
    const hit = kind >= 56 ? true : wallBounce(s, kind, cellV, cellH, 4, 255, s.hot, F.mask, true);
    if (!hit) return;
    if (isVial(s.kind) && s.f74 === 0) s.f74 = -16;
    else if (s.kind !== 9610) s.f92 = 1; // (the original's impact sound test can never pass)
  } else if (s.kind === 9610 && kind === 1) {
    bgTileBounce(s, 1, cellV, cellH, 4, 240, s.hot, F.mask, true);
  }
}

export const sodaCanFace = (i) => F.cans[i];

register({ sodaCanFace, initEnemyShotSprite, setupEnemyShotSprite, handleEnemyShotSprite });
