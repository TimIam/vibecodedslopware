// Harry (the player sprite). Port of seg 3: InitPlayerSprite, SETUPPLAYERSPRITE, HANDLEPLAYERSPRITE,
// HandleKeys, DoScoot, DoKick, DoInch, MoveChair, HandlePlayerGlide, HITPLAYERTILESPRITE, TINTDRAWPROC.

import { G, Prefs } from './state.js';
import { w16, setRect, sectRect } from '../core/util.js';
import { SATRand, SATNewSprite } from '../core/sat.js';
import { actionDown } from './keys.js';
import { Input } from '../core/input.js';
import { load1EncFaceFromCicn, loadEncFaceSetFromPICT, satGetFace } from '../core/res.js';
import { applyModedImpulse, inverseMode, enforceMaxSpeed, wallBounce, bgTileBounce, rectBounceFake,
  handleHalfPipe, jumpScale } from './physics.js';
import { regionBounce, maskFromFace } from './masks.js';
import { Tiles } from './tiles.js';
import { S, playRegSound, play3DSoundPitched, isPlaying, stopSound } from './sound.js';
import { Hooks } from './hooks.js';

export const ITEM = { PAPERS: 11199, STAPLE_GUN: 11299, KEY: 11399, CAFFEINE: 11499, BADASS: 11599,
  VIAL: 11699, SHRAPNEL: 11799, SODA: 11899, SWIVEL_POWER: 11999 };

export const PlayerFaces = {
  slot: null, slotSel: null, items: [], keyA: null, keyB: null, slotEmpty: null,
  harry: [],        // g_81fe: 144 faces (36 dirs x 4 frames), PICT 200 / HrSp 1101
  harryMasks: [],   // BuildMaskRegion for faces 107..143
  kickRects: [],    // g_80ce: per-direction kick rects
};

// InitPlayerKickRects (seg 1): SetRect(left, top, right, bottom) for dirs 0..35
const KICK = [
  [51, 27, 63, 37], [54, 21, 63, 33], [54, 16, 63, 28], [49, 11, 62, 25], [48, 6, 60, 20], [44, 4, 57, 16],
  [41, 1, 53, 13], [36, 0, 48, 10], [31, 0, 42, 8], [27, 0, 37, 6], [21, 0, 32, 7], [16, 0, 28, 9],
  [10, 1, 23, 11], [6, 2, 19, 14], [4, 6, 15, 18], [1, 10, 13, 22], [0, 15, 9, 27], [0, 21, 8, 32],
  [0, 26, 7, 36], [0, 31, 7, 42], [0, 35, 9, 47], [1, 38, 11, 53], [3, 43, 15, 57], [7, 47, 19, 59],
  [11, 51, 22, 63], [15, 53, 27, 63], [21, 55, 32, 63], [26, 55, 36, 63], [31, 56, 42, 63], [35, 54, 47, 63],
  [39, 51, 53, 62], [43, 48, 56, 61], [46, 44, 60, 57], [51, 40, 62, 52], [52, 36, 63, 48], [55, 31, 63, 42],
];

export function initPlayerSprite() {
  PlayerFaces.slot = load1EncFaceFromCicn(10200, 0, 1001);     // g_7054
  PlayerFaces.slotSel = load1EncFaceFromCicn(10232, 0, 1002);  // g_7058
  for (let i = 0; i < 10; i++)
    PlayerFaces.items[i] = i === 9 ? null : load1EncFaceFromCicn(11100 + i * 100 + 0x5c - 0x5c, 0, 1010 + i); // g_7060[i]
  PlayerFaces.keyA = load1EncFaceFromCicn(11301, 0, 1031);     // g_7088 (item 11398)
  PlayerFaces.keyB = load1EncFaceFromCicn(11302, 0, 1032);     // g_708c (item 11397)
  PlayerFaces.satFace = satGetFace(299);                        // g_81ee
  PlayerFaces.slotEmpty = load1EncFaceFromCicn(10300, 0, 1040);// g_705c
  PlayerFaces.harry = loadEncFaceSetFromPICT(200, 144, 64, 64, 12, 107, 143, 1101);
  for (let i = 0; i < 144; i++) {
    const f = PlayerFaces.harry[i];
    if (f) f.drawProc = tintDrawProc;
    if (f && i >= 107 && i <= 143) f.mask = maskFromFace(f);
  }
  for (let d = 0; d < 36; d++) { const [l, t, r, b] = KICK[d]; PlayerFaces.kickRects[d] = [t, l, b, r]; }
}

export function setupPlayerSprite(s) {
  Hooks.initSprite(s);
  s.kind = 0x45;
  s.dir = G.playerDir % 35; // original: divsl #35 remainder
  s.f4e = 0; s.f50 = 0;
  s.layer = 10;
  G.oil = 0;
  s.task = handlePlayerSprite;
  s.hit = null;
  s.tileHit = hitPlayerTileSprite;
  s.fixH = s.h << 8;
  s.fixV = s.v << 8;
  s.face = null;
  s.eface = PlayerFaces.harry[s.dir];
  G.tInch = 0; G.tKick = 0; G.tScoot = 0; G.animOff = 0; G.impulse = 0;
  setRect(s.hot, 22, 22, 42, 42);
  if (G.restoreInventory) {
    // (a continued game) copy the inventory, clear it and re-add every item count times
    const saved = G.inventory.map((e) => ({ id: e.id, count: e.count }));
    for (const e of G.inventory) { e.id = -1; e.count = 0; }
    for (let i = 0; i < 12; i++) if (saved[i].id !== -1) for (let k = 0; k < saved[i].count; k++) Hooks.getInvItem(saved[i].id);
    G.restoreInventory = false;
  }
  s.behind = 1;
  G.wavy = false;
  G.comfortDelta = 0;
  G.g70a2 = 0;
}

// --------------------------------------------------------------- per-frame
export function handlePlayerSprite(s) {
  if (s.f92) return;
  if (s.fixH <= 0 || s.fixV <= 0 || s.fixH > 0x100000 || s.fixV > 0x100000) {
    s.fixH = s.h << 8; s.fixV = s.v << 8;
  }
  handleKeys(s);
  G.g70a6 = 0; G.g70be = 0; G.bouncedBG = 0; G.bouncedFG = 0;
  if (G.comfortDelta) { if (!G.caffeine) G.comfort += G.comfortDelta; G.comfortDelta = 0; }
  for (const k of ['tScoot', 'tKick', 'tInch', 'tSwitch', 'tFire', 'tHurt', 'g70a0', 'tSc2', 'firing',
    'caffeine', 'egg1', 'egg2', 'egg3', 'g70a4', 'g70aa']) if (G[k] > 0) G[k]--;
  if (G.g80c2 > 0) {
    if (--G.g80c2 === 0 && SATRand(100) < 30) {
      if (isPlaying(G.talkRef)) stopSound(G.talkRef);
      if (!isPlaying(G.talkRef2)) {
        const r = SATRand(3);
        G.talkRef2 = playRegSound(S([150, 151, 152][r]), 50, 256);
      }
    }
  }
  if (G.inventory[G.curItem] === undefined || G.inventory[G.curItem].id === -1) {
    G.curItem = G.inventory[0].id !== -1 ? 0 : -1;
  }
  setRect(s.hot, 22, 22, 42, 42);
  if (G.g70bf) { G.g70bf = 0; G.kickHit = 0; }
  if (s.f8e > 0) { G.tInch = 0; G.tKick = 0; G.tScoot = 0; G.animOff = 0; G.impulse = 0; }
  moveChair(s);
  handlePlayerGlide(s);
  handleHalfPipe(s, 32, S(209));
  G.kickHit = 0;
  if (s.dir > 35) s.dir = 0; else if (s.dir < 0) s.dir = 35;
  s.eface = PlayerFaces.harry[G.animOff + s.dir];
  jumpScale(s, 32, S(207), S(208), S(4901), true, G.level.info(3));
  if (G.oil > 0 && (Math.abs(s.f50) > 200 || Math.abs(s.f4e) > 200)) {
    G.oil -= 2; if (G.oil < 0) G.oil = 0;
  }
  enforceMaxSpeed(s, 2500);
  G.floorType = 1;
  G.g70ba = s.f50; G.g70b8 = s.f4e;
  s.fixH += s.f50; s.fixV += s.f4e;
  s.h = s.posH = G.playerH = s.fixH >> 8;
  s.v = s.posV = G.playerV = s.fixV >> 8;
  if (G.g70a2 > 0) {
    G.g70a2--;
    s.h = s.posH = G.playerH = (s.fixH >> 8) + SATRand(6) - 3;
    s.v = s.posV = G.playerV = (s.fixV >> 8) + SATRand(6) - 3;
  }
  G.playerDir = s.dir;
  if (!(G.g46be > 0 && G.g46ba > 0) && s.f8e === 0) {
    s.task = Hooks.handlePlayerSpriteDeath;
    s.f74 = 0;
  }
}

// --------------------------------------------------------------- input
const K = (code) => Input.isPressed(code);

function inv(i) { return G.inventory[i] || { id: -1, count: 0 }; }
const curItemId = () => inv(G.curItem).id;
function selectWeaponById(id) {
  let slot = -1;
  for (let i = 0; i < 12; i++) if (G.inventory[i].id === id) slot = i;
  if (slot === -1 || slot === G.curItem) return;
  playRegSound(S(4801), 100, 256);
  Hooks.switchInvItem(slot);
  G.tSwitch = 5;
  G.charge = 0;
}

export function handleKeys(s) {
  if (G.cheats) {
    if (K(0x7a)) G.comfort = 0x90;                                  // F1
    if (K(0x78)) { Hooks.getInvItem(ITEM.STAPLE_GUN); G.ammoStaple = 100; } // F2
    if (K(0x6f)) G.comfort = 0;                                     // F12
    if (K(0x18) && s.f96 === 0) {                                   // '='
      playRegSound(S(602), 100, 256);
      const v = s.posV - 32 + SATRand(0x80);
      const h = s.posH - 32 + SATRand(0x80);
      Hooks.easyExplosion(h, v, 0, 0, 0, 0);
    }
    if (K(0x69)) Hooks.getInvItem(ITEM.SODA);                       // F13
    if (K(0x76)) Hooks.getInvItem(11397);                           // F4
    if (K(0x63)) Hooks.getInvItem(ITEM.CAFFEINE);                   // F3
  }
  if (K(0x38) && K(0x74) && K(0x18)) {                              // Shift+PageUp+'=': big Harry
    if (!isPlaying(G.caffeineRef)) {
      if (s.scaleH === 256) {
        G.caffeineRef = play3DSoundPitched(S(241), 100, 256, s.posV, s.posH, 0xc350);
        s.scaleV = 512; s.scaleH = 512;
      } else { s.scaleV = 256; s.scaleH = 256; }
    }
  }
  if (actionDown('rotLeft')) s.dir++;
  if (actionDown('rotRight')) s.dir--;
  if (actionDown('switchItem')) {
    if (G.tSwitch === 0) {
      playRegSound(S(4801), 100, 256);
      Hooks.switchInvItem(-1);
      G.tSwitch = 5;
      G.charge = 0;
    }
  } else if (K(0x12)) selectWeaponById(ITEM.STAPLE_GUN);
  else if (K(0x13)) selectWeaponById(ITEM.BADASS);
  else if (K(0x14)) selectWeaponById(ITEM.SHRAPNEL);
  else if (K(0x15)) selectWeaponById(ITEM.SWIVEL_POWER);

  if (actionDown('fire')) {
    const id = curItemId();
    if (G.tFire === 0 && id === ITEM.STAPLE_GUN) {
      if (G.ammoStaple > 0) {
        G.ammoStaple--;
        play3DSoundPitched(S(230), 100, 256, s.posV, s.posH, SATRand(6000) + 0xf230);
        G.firing = 3;
        G.shotType = 0;
      } else playRegSound(S(239), 100, 256);
      G.tFire = 10;
    } else if (G.tFire === 0 && id === ITEM.BADASS) {
      if (G.charge === 0) { stopSound(G.chargeRef); G.chargeRef = playRegSound(S(231), 100, 256); }
      G.charge++;
    } else if (G.tFire === 0 && id === ITEM.SHRAPNEL) {
      G.charge++;
    } else if (G.tFire === 0 && id === ITEM.SWIVEL_POWER) {
      if (G.charge === 0) { stopSound(G.chargeRef); G.chargeRef = playRegSound(S(237), 100, 256); }
      G.charge++;
    } else if (G.tFire === 0 && id === ITEM.CAFFEINE) {
      if (G.tSc2 === 0) {
        playRegSound(S(241), 100, 256);
        Hooks.removeInvItem(G.curItem);
        G.caffeine = 270; G.tFire = 10; G.tSc2 = 8;
      }
    } else if (id === ITEM.VIAL) {
      if (G.tSc2 === 0) {
        Hooks.easyExplosion(s.h, s.v, 0, 0, -1, 0);
        const r = SATRand(6);
        const coffee = () => {
          if (!isPlaying(G.talkRef) && !isPlaying(G.talkRef2)) G.talkRef = playRegSound(S(210), 100, 256);
        };
        if (r === 0) { coffee(); G.caffeine = 270; G.tFire = 10; }
        else if (r === 1) { coffee(); G.comfort = 100; }
        else if (r === 2) { playRegSound(S(210), 100, 256); playRegSound(S(224), 100, 256); G.comfortDelta -= 15; }
        else if (r === 3) { coffee(); G.comfort = 100; }
        else if (r === 4) { coffee(); G.ammoShrapnel = 100; G.ammoBadass = 100; G.ammoStaple = 100; }
        else if (r === 5) { coffee(); G.ammoStaple -= 25; G.ammoBadass -= 25; G.ammoShrapnel -= 25; }
        Hooks.removeInvItem(G.curItem);
        G.tSc2 = 10;
      }
    } else if (G.tFire === 0 && id === ITEM.SODA) {
      if (G.tSc2 === 0) {
        playRegSound(S(300), 100, 256);
        Hooks.removeInvItem(G.curItem);
        G.tFire = 10; G.firing = 3; G.shotType = 4; G.tSc2 = 6;
      }
    }
  } else if (G.charge > 0) {
    const id = curItemId();
    if (id === ITEM.BADASS) {
      stopSound(G.chargeRef);
      if (G.ammoBadass > 0) {
        if (G.charge < 34) {
          playRegSound(S(232), 100, 256); G.shotType = 1; G.ammoBadass -= 2;
        } else {
          playRegSound(S(233), 100, 256); G.shotType = 2; G.ammoBadass -= 6;
        }
        if (G.ammoBadass < 0) G.ammoBadass = 0;
        G.firing = 3;
      } else if (G.charge < 34) {
        playRegSound(S(239), 100, 256);
      } else {
        playRegSound(S(233), 100, 256); G.shotType = 2; G.firing = 3;
      }
      G.tFire = 4; G.charge = 0;
    } else if (id === ITEM.SHRAPNEL) {
      if (G.ammoShrapnel > 0) {
        playRegSound(S(252), 100, 256);
        if (G.charge < 8) { G.shotType = 0; G.ammoShrapnel -= 1; }
        else if (G.charge < 16) { G.shotType = 5; G.ammoShrapnel -= SATRand(100) < 50 ? 1 : 2; }
        else if (G.charge < 24) { G.shotType = 6; G.ammoShrapnel -= 2; }
        else { G.shotType = 7; G.ammoShrapnel -= SATRand(100) < 50 ? 2 : 3; }
        if (G.ammoShrapnel < 0) G.ammoShrapnel = 0;
        G.firing = 3;
      } else playRegSound(S(239), 100, 256);
      G.tFire = 4; G.charge = 0;
    } else if (G.charge > 20) {
      if (G.comfort >= 10) {
        G.comfort -= 2;
        playRegSound(S(238), 100, 256);
        G.charge = 10;
        const shot = SATNewSprite(10, s.posH, s.posV, Hooks.setupPlayerShotSprite);
        shot.dir = s.dir;
        applyModedImpulse(shot, inverseMode(s.dir), 2000);
      } else {
        playRegSound(S(224), 100, 256);
        G.charge = 10;
      }
    } else G.charge = 0;
  }
  // typed easter eggs: "parghz", "ben", "wavygravy"
  if (K(0x23) && G.egg1 === 0) { G.egg1 = 200; G.egg1s = 1; }
  if (K(0x0b) && G.egg2 === 0) { G.egg2 = 200; G.egg2s = 1; }
  if (K(0x0d) && G.egg3 === 0) { G.egg3 = 250; G.egg3s = 1; }
  if (G.egg1 > 0) {
    const seq = [null, 0x00, 0x0f, 0x05, 0x04, 0x06];
    if (G.egg1s >= 1 && G.egg1s <= 5) { if (K(seq[G.egg1s])) G.egg1s++; }
    else if (G.egg1s === 6) { Hooks.showBalloon(null, Hooks.randomQuote(SATRand(52)), 2); G.egg1s = 0; G.egg1 = 0; }
  }
  if (G.egg2 > 0) {
    const seq = [null, 0x0e, 0x2d];
    if (G.egg2s >= 1 && G.egg2s <= 2) { if (K(seq[G.egg2s])) G.egg2s++; }
    else if (G.egg2s === 3) { Hooks.showBalloon(null, Hooks.benQuote(), 2); G.egg2s = 0; G.egg2 = 0; }
  }
  if (G.egg3 > 0) {
    const seq = [null, 0x00, 0x09, 0x10, 0x05, 0x0f, 0x00, 0x09, 0x10];
    if (G.egg3s >= 1 && G.egg3s <= 8) { if (K(seq[G.egg3s])) G.egg3s++; }
    else if (G.egg3s === 9) {
      G.wavy = !G.wavy;
      G.ripplePhase = 0;
      const lv = G.level;
      if (G.wavy) { lv.setW(0x12088, 100); lv.setW(0x1208a, 16); lv.setW(0x1208c, 0x300); }
      else { lv.setW(0x12088, 0); lv.setW(0x1208a, 0); lv.setW(0x1208c, 0); }
      G.egg3s = 0; G.egg3 = 0;
    }
  }
  const idle = G.tScoot === 0 && G.tKick === 0 && G.tInch === 0;
  if (actionDown('kick') && idle) G.tKick = 21;
  if (s.f8e <= 0) {
    if (actionDown('scoot') && G.tScoot === 0 && G.tKick === 0 && G.tInch === 0) G.tScoot = 21;
    if (actionDown('inch') && G.tScoot === 0 && G.tKick === 0 && G.tInch === 0) G.tInch = 17;
  }
}

// --------------------------------------------------------------- actions
function doScoot(s, p) {
  const t = G.tScoot;
  if (t <= 0 || t > 20) return;
  switch (t) {
    case 20: case 19: case 18: G.animOff = 36; break;
    case 17:
      G.animOff = 36;
      G.impulse = p;
      if (G.oil > 0) playRegSound(S(215), 20, G.oil >> 1);
      if (G.floorType === 1) playRegSound(S(200), 10, 128 - (G.oil >> 1));
      else if (G.floorType === 2) playRegSound(S(202), 10, 128 - (G.oil >> 1));
      else if (G.floorType === 3) playRegSound(S(201), 10, 128 - (G.oil >> 1));
      break;
    case 16: G.animOff = 0; G.impulse = p * 2; break;
    case 15: G.impulse = 3 * p; break;
    case 14: G.impulse = p << 2; break;
    case 13: G.animOff = 72; G.impulse = p << 2; break;
    case 12: G.impulse = p << 2; break;
    case 11: G.impulse = 3 * p; break;
    case 10: G.animOff = 108; G.impulse = p * 2; break;
    case 9: G.impulse = p + (p >> 1); break;
    case 8: G.impulse = p; break;
    case 7: G.impulse = p >> 1; break;
    case 6: G.animOff = 72; G.impulse = 0; break;
    case 5: G.impulse = 0; break;
    case 3: G.animOff = 0; break;
  }
  G.impulse = w16(G.impulse);
}

function doKick(s, p) {
  const t = G.tKick;
  if (t <= 0 || t < 4 || t > 20) return;
  switch (t) {
    case 20: G.animOff = 72; G.tKick = 16; break;
    case 18: G.animOff = 72; break;
    case 15: G.animOff = 72; break;
    case 14: G.animOff = 108; setRect(s.hot, 0, 0, 64, 64); break;
    case 13:
      if (G.kickHit) {
        G.kickPower = G.kickHit;
        G.impulse = w16((10 * p * G.kickHit) >> 8);
        playRegSound(S(203), 10, 256);
      } else { G.tKick = 11; G.impulse = 50; }
      break;
    case 12: G.impulse = w16((9 * p * G.kickPower) >> 8); break;
    case 11: G.impulse = w16((7 * p * G.kickPower) >> 8); break;
    case 10: G.animOff = 72; break;
    case 8: G.animOff = 0; G.impulse = 0; break;
    case 7: G.impulse = 0; break;
    case 6: G.animOff = 36; break;
    case 4: G.animOff = 0; break;
  }
}

function doInch(s, p) {
  const t = G.tInch;
  if (t <= 0 || t > 16) return;
  switch (t) {
    case 16: G.animOff = 72; G.impulse = -(p >> 1); break;
    case 15: G.impulse = -p; break;
    case 14: G.animOff = 72; G.impulse = -(p + (p >> 1)); break;
    case 13: G.impulse = -2 * p; break;
    case 12: G.impulse = -2 * p; break;
    case 11: G.impulse = -(p + (p >> 1)); G.animOff = 0; break;
    case 10: G.impulse = -p; break;
    case 9: G.impulse = -(p >> 1); break;
    case 8: G.impulse = p * 2; G.animOff = 36; break;
    case 5: case 4: case 3: G.impulse = 0; G.animOff = 0; break;
  }
  G.impulse = w16(G.impulse);
}

function moveChair(s) {
  let p = G.scootPower;
  if (G.caffeine > 0) p = Math.trunc(p * 2.5);
  if (G.oil > 0) p = (p * (256 - G.oil)) >> 8;
  if (s.f8e < 23) {
    doScoot(s, p);
    doKick(s, G.kickPowerK);
    doInch(s, p);
    applyModedImpulse(s, s.dir, G.impulse);
  } else {
    G.tInch = 0; G.tKick = 0; G.tScoot = 0; G.animOff = 0;
  }
}

function handlePlayerGlide(s) {
  if (s.f8e !== 0 && (s.f8e <= 23 || s.f8e >= 200)) return;
  const fr = (base) => {
    let d3 = G.oil <= 0 ? base : base + (((256 - base) * G.oil) >> 8);
    if (G.g70ae >= 88) d3 = (d3 + 256) >> 1;
    if (Math.abs(s.f50) > 24) s.f50 = w16((s.f50 * d3) >> 8); else if (G.g70ae < 88) s.f50 = 0;
    if (Math.abs(s.f4e) > 24) s.f4e = w16((s.f4e * d3) >> 8); else if (G.g70ae < 88) s.f4e = 0;
    G.legPower = (base - 230) * 5;
    if (G.legPower < 8) G.legPower = 8;
  };
  switch (G.floorType) {
    case 1: fr(G.frictionA); break;
    case 2: s.f50 = w16((s.f50 * 236) >> 8); s.f4e = w16((s.f4e * 236) >> 8); break;
    case 3: fr(G.frictionB); break;
  }
}

// HITPLAYERTILESPRITE(s, cellV, cellH, kind, isFG)
export function hitPlayerTileSprite(s, cellV, cellH, kind, isFG) {
  if (G.cheats && Input.isPressed(0x32)) return; // '`' = walk through walls
  const hot = [22, 22, 42, 42];
  const kicking = s.hot[1] === 0;
  if (isFG) {
    if (kicking) {
      const kr = PlayerFaces.kickRects[s.dir];
      const leg = [s.posV + kr[0], s.posH + kr[1], s.posV + kr[2], s.posH + kr[3]];
      const fr = Tiles.fgRects[kind];
      const tr = fr ? [cellV + fr.hot[0], cellH + fr.hot[1], cellV + fr.hot[2], cellH + fr.hot[3]] : null;
      if (tr && sectRect(leg, tr)) {
        if (kind >= 55 || !s.eface) return;
        const tm = Tiles.masks[kind];
        if (!tm) return;
        const oh = s.posH, ov = s.posV;
        if (regionBounce(s, cellV, cellH, s.eface.mask, tm)) {
          G.kickHit = 256;
          s.posH = s.h = oh; s.posV = s.v = ov;
        }
      }
      return;
    }
    if (kind < 32) {
      if (wallBounce(s, kind, cellV, cellH, 32, G.bounciness, hot, Tiles.harryMask, !G.bouncedFG)) G.bouncedFG = 1;
    } else if (kind < 56) {
      const br = Tiles.bgRects[kind];
      const pv = cellV + br[0], ph = cellH + br[1];
      rectBounceFake(s, pv, ph, br, 32, G.bounciness, hot);
      G.bouncedFG = 1;
    }
    return;
  }
  // BG kinds
  if (s.f8e !== 0) return;
  if (kind === 2) { G.floorType = 3; return; }
  if (kind === 1 && !G.bouncedBG) {
    if (kicking) {
      const kr = PlayerFaces.kickRects[s.dir];
      const leg = [s.posV + kr[0], s.posH + kr[1], s.posV + kr[2], s.posH + kr[3]];
      const br = Tiles.bgRects[kind];
      const tr = [cellV + br[0], cellH + br[1], cellV + br[2], cellH + br[3]];
      if (sectRect(leg, tr) && s.eface && Tiles.bgMask) {
        const oh = s.posH, ov = s.posV;
        if (regionBounce(s, cellV, cellH, s.eface.mask, Tiles.bgMask)) {
          G.kickHit = 256;
          s.posH = s.h = oh; s.posV = s.v = ov;
        }
      }
    } else {
      G.bouncedBG = bgTileBounce(s, kind, cellV, cellH, 32, G.bounciness, hot, Tiles.harryMask, !G.bouncedBG) ? 1 : 0;
    }
    return;
  }
  if (kind === 3) {
    if (G.tHurt === 0 && !kicking) { G.comfortDelta -= 7; G.tHurt = 15; Hooks.ouch(); }
  } else if (kind === 4) {
    if (G.tHurt === 0 && !kicking) { G.comfortDelta -= 12; G.tHurt = 15; Hooks.ouch(); }
  } else if (kind === 5) {
    G.comfortDelta += 1;
  } else if (kind === 6) {
    if (!kicking) {
      if (G.oil <= 170 && !isPlaying(G.oilRef)) G.oilRef = play3DSoundPitched(S(215), 20, 256, s.posV, s.posH, 0xd6d8);
      if (G.oil < 200) { G.oil += 25; if (G.oil > 200) G.oil = 200; }
    }
  }
}

// TINTDRAWPROC: choose the blit mode for Harry's face
export function tintDrawProc(face, s, blit) {
  let scale = 0;
  if (s.scaleH !== 256) scale = s.scaleH << 5;
  if (s.kind === 10) return blit(2, scale);
  if (G.caffeine > 0) return blit(1, scale + SATRand(10) + 1);
  if (G.charge > 0 && curItemId() === ITEM.SWIVEL_POWER) {
    let d3 = G.charge >> 1;
    if (d3 > 15) d3 = [15, 14, 13, 12, 13, 14][d3 % 6];
    s.f8a = 1;
    return blit(4, d3 + scale);
  }
  if (G.comfort >= G.g46be) {
    const t = G.level.info(0);
    return t === 0 ? blit(0, scale) : blit(1, t + scale);
  }
  let d3 = G.g46be - G.comfort;
  if (d3 > 8) d3 = 8;
  s.f8a = 1;
  return blit(3, d3 - 1 + scale);
}
