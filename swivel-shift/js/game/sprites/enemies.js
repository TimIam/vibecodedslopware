// Enemies (seg 3). Dart throwers (1011/1021/1031/1041 facing right/left/up/down): while on screen they
// wind up over 20 frames and throw (record +4: 0 = straight dart, 1 = spinning projectile).
// A staple hit stuns them and costs corporate favour.

import { G } from '../state.js';
import { w16, setRect, ptInRect, sectRect } from '../../core/util.js';
import { SATNewSprite, SATRand } from '../../core/sat.js';
import { loadEncFaceSetFromPICT, load1EncFaceFromCicn } from '../../core/res.js';
import { maskFromFace } from '../masks.js';
import { PlayerFaces } from '../player.js';
import { applyModedImpulse, inverseMode, approachMode, enforceMaxSpeed, wallBounce, bgTileBounce, handleHalfPipe,
  jumpScale } from '../physics.js';
import { S, playRegSound, play3DSound, play3DSoundPitched, playingCount } from '../sound.js';
import { Hooks, register } from '../hooks.js';

const is = (o, name) => o.task === Hooks[name];
const mt = (v, k) => w16(Math.trunc(v * k));
const kickRect = (p) => {
  const k = PlayerFaces.kickRects[p.dir];
  return [p.posV + k[0], p.posH + k[1], p.posV + k[2], p.posH + k[3]];
};
const hotRect = (s) => [s.posV + s.hot[0], s.posH + s.hot[1], s.posV + s.hot[2], s.posH + s.hot[3]];
// Accelerate*/Assign*ShotSpeed: push along the sprite's heading (the impulse table, reversed)
export const accelerate = (s, mag) => applyModedImpulse(s, inverseMode(s.dir), mag);
// FindDesired*Direction(s): heading from the sprite (where + 14) towards Harry's centre
export const findDesiredToward = (s) => Hooks.findDesiredDirectionGeneric(s.v + 14, s.h + 14, G.playerV + 32, G.playerH + 32);
const clearRecord = (s) => { if (s.param >= 0 && s.param <= 255) G.level.setB(G.level.objOff(s.param), 0); };
// Enemies that die drop the record's +10 sprite id
function dropLoot(s) {
  if (s.param < 0 || s.param > 255) return;
  const id = G.level.w(G.level.objOff(s.param) + 10);
  if (id) Hooks.generateSprite(s.posH, s.posV, id, -1);
}

const Dart = { faces: [], spin: null }; // g_6de0 (PICT 1011: 4 x 7 frames), g_82a2[0]

const dartIndex = (s) => ((s.kind - 1011) / 10) | 0;

function dartEnemyDrawProc(face, s, blit) {
  const tint = G.level.info(0);
  if (s.layer === 10) blit(1, 1);              // hit flash
  else if (tint) blit(1, tint); else blit(0, 0);
  if (!s.dir || s.param === -1) return;
  if (G.level.w(G.level.objOff(s.param) + 4) !== 1) return;
  // the spinning projectile in hand
  const o = projOffset(s);
  if (!Dart.spin) Dart.spin = load1EncFaceFromCicn(1051, false, 3041);
  if (tint) blit(1, tint, Dart.spin, o.v, o.h); else blit(0, 0, Dart.spin, o.v, o.h);
}

export function initDartEnemySprite() {
  Dart.faces = loadEncFaceSetFromPICT(1011, 28, 32, 32, 7, 0, 0, 2501);
  for (const f of Dart.faces) if (f) f.drawProc = dartEnemyDrawProc;
}

export function setupDartEnemySprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.f74 = 0;
  s.task = handleDartEnemySprite;
  s.hit = hitDartEnemySprite;
  s.tileHit = null;
  setRect(s.hot, 8, 8, 24, 24);
  s.eface = Dart.faces[dartIndex(s) * 7 + s.dir];
  s.layer = 9;
  s.f6e = 0;
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
}

// GetDartEnemyProjOffset: where the projectile sits in the thrower's hand for the current frame
function projOffset(s) {
  let h = 0, v = 0;
  if (!s.dir) return { h: -1, v: -1 };
  const d = s.dir;
  switch (s.kind) {
    case 1011: v = 19; h = [0, 22, 20, 18, 14, 13, 23][d]; if (d === 1) v = 21; break;
    case 1021: v = 4; h = [0, 5, 1, 6, 10, 11, 1][d]; if (d === 1) v = 0; break;
    case 1031: h = 20; v = [0, 2, 3, 6, 10, 11, 1][d]; if (d === 1) h = 22; break;
    case 1041: h = 4; v = [0, 22, 21, 16, 12, 11, 21][d]; if (d === 1) h = 2; break;
  }
  return { h, v };
}

function throwDart(s) {
  const o = projOffset(s);
  const h = s.h + o.h, v = s.v + o.v;
  const type = s.param >= 0 && s.param <= 255 ? G.level.w(G.level.objOff(s.param) + 4) : 0;
  if (type === 0) { SATNewSprite(s.kind + 7, h, v, Hooks.setupEnemyShotSprite); return; }
  if (type !== 1) return;
  const p = SATNewSprite(1051, h, v, Hooks.setupEnemyShotSprite);
  const fast = () => SATRand(600) + 1100, wobble = () => SATRand(500) - 250;
  switch (s.kind) {
    case 1011: p.f50 = fast(); p.f4e = wobble(); break;
    case 1021: p.f50 = -fast(); p.f4e = wobble(); break;
    case 1031: p.f50 = wobble(); p.f4e = -fast(); break;
    case 1041: p.f50 = wobble(); p.f4e = fast(); break;
  }
}

export function handleDartEnemySprite(s) {
  if (s.f92) return;
  if (ptInRect(s.posV, s.posH, [G.viewTop - 64, G.viewLeft - 64, G.viewTop + 512, G.viewLeft + 512])) {
    s.f6e++;
    switch (s.f6e) {
      case 1: s.dir = 1; break;
      case 4: s.dir = 2; break;
      case 7: s.dir = 3; break;
      case 10: s.dir = 4; break;
      case 13: s.dir = 5; break;
      case 20:
        s.dir = 6;
        play3DSound(S(300), 10, 256, s.v, s.h);
        throwDart(s);
        break;
      case 22: s.dir = 0; break;
      default:
        if (s.f74 === 0) { if (s.f6e > 45 && SATRand(25) === 2) s.f6e = 0; }
        else s.f74--;
    }
    s.eface = Dart.faces[dartIndex(s) * 7 + s.dir];
  }
  if (s.layer === 10) s.layer = 7;
}

export function hitDartEnemySprite(me, o) {
  if (me.f92 || o.f92) return;
  if (o.task !== Hooks.handlePlayerShotSprite) return;
  o.f92 = 1;
  play3DSound(S(4700), 20, 256, me.v, me.h);
  me.layer = 10;
  G.g46c0 -= 3;
  me.f74 = SATRand(70) + 65;
}

// ---------------------------------------------------------------- blobs (1701 hopper, 1711 homing hopper, 1721 crawler)
// f6e: 4 resting (pulsing), 2 about to launch, 0 sliding. f72 = hit points.
const Blob = { faces: [], mask: null }; // g_7040 (PICT 1701, 24 frames) / g_7044

function blobTintDrawProc(face, s, blit) {
  const scale = s.scaleH !== 256 ? s.scaleH << 5 : 0;
  if (s.layer === 10) { s.layer = 7; blit(1, scale + 8); s.f8a = 1; return; }
  const tint = G.level.info(0);
  if (tint) return blit(1, tint + scale);
  if (s.kind === 1701) return blit(0, scale);
  if (s.kind === 1711) return blit(1, scale + 10);
  if (s.kind > 1711 && s.kind < 1800) return blit(1, scale + 1);
  return undefined;
}

export function initBlobSprite() {
  Blob.faces = loadEncFaceSetFromPICT(1701, 24, 32, 32, 8, 0, 0, 1401);
  for (const f of Blob.faces) if (f) f.drawProc = blobTintDrawProc;
  const m = load1EncFaceFromCicn(598, true, 1451);
  Blob.mask = m ? maskFromFace(m) : null;
}

export function setupBlobSprite(s) {
  if (s.layer === 10) s.f8a = 1;
  Hooks.initSprite(s);
  s.dir = SATRand(35);
  s.task = handleBlobSprite;
  s.hit = hitBlobSprite;
  s.tileHit = hitBlobTileSprite;
  setRect(s.hot, 4, 4, 24, 24);
  s.f26 = 0;
  s.layer = 7;
  s.f4e = 0; s.f50 = 0;
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  s.f6e = 4;
  s.f74 = SATRand(90);
  s.f72 = s.kind === 1711 ? 7 : 5;
  s.eface = Blob.faces[s.dir] || null;
  s.behind = 1;
}

function blobRest(s) { // pulse while resting, then get ready to launch
  if (s.f74 > 0) {
    s.f74--;
    if (s.f74 < 40) s.dir++;
    if (s.f74 < 20) s.dir++;
  } else s.f6e = 2;
}
const fast = (s) => Math.abs(s.f50) > 100 || Math.abs(s.f4e) > 100;

export function handleBlobSprite(s) {
  if (s.f92) return;
  G.g7049 = 0; G.g7048 = 0;
  if (s.f72 > 0) {
    if (s.kind === 1701) {
      if (s.f6e === 4) blobRest(s);
      else if (s.f6e === 2) { s.dir = SATRand(35); accelerate(s, 3200); s.f6e = 0; }
      else if (s.f6e === 0) {
        if (fast(s)) { s.f50 = mt(s.f50, 0.7); s.f4e = mt(s.f4e, 0.7); }
        else { s.f6e = 4; s.f4e = 0; s.f50 = 0; s.f74 = SATRand(60) + 30; }
      }
    } else if (s.kind === 1711) {
      if (s.f6e === 4) blobRest(s);
      else if (s.f6e === 2) {
        s.dir = SATRand(100) > 65 ? SATRand(35) : findDesiredToward(s);
        accelerate(s, 4500);
        s.f6e = 0;
      } else if (s.f6e === 0) {
        if (fast(s)) {
          s.f50 = mt(s.f50, 0.7); s.f4e = mt(s.f4e, 0.7);
          if (SATRand(1000) > 950) s.f6e = 2;
        } else { s.f6e = 4; s.f4e = 0; s.f50 = 0; s.f74 = SATRand(40) + 15; }
      }
    } else if (s.kind === 1721) {
      if (s.f6e === 4) blobRest(s);
      else if (s.f6e === 2) {
        if (s.f74 === 0) s.f74 = 15;
        s.f74--;
        s.dir = SATRand(100) > 92 ? SATRand(35) : findDesiredToward(s);
        accelerate(s, 350);
        if (s.f74 === 1) s.f6e = 0;
      } else if (s.f6e === 0) {
        if (fast(s)) {
          s.f50 = mt(s.f50, 0.7); s.f4e = mt(s.f4e, 0.7);
          if (SATRand(1000) > 970) s.f6e = 2;
        } else { s.f6e = 4; s.f4e = 0; s.f50 = 0; s.f74 = SATRand(60) + 5; }
      }
    }
    enforceMaxSpeed(s, 2000);
    s.fixH += s.f50; s.fixV += s.f4e;
    s.h = s.posH = s.fixH >> 8;
    s.v = s.posV = s.fixV >> 8;
    s.eface = Blob.faces[Math.trunc(s.dir / 2) % 16] || null;
  } else { // dying
    if (s.f74 >= 0) s.f74 = -999;
    s.f74--;
    s.dir = -s.f74 - 1000;
    s.eface = Blob.faces[Math.trunc(s.dir / 4) + 15] || null;
    if (s.dir > 31) {
      s.f92 = 1;
      G.score += s.kind === 1701 ? 500 : s.kind === 1711 ? 1200 : s.kind === 1721 ? 2500 : 0;
      dropLoot(s);
    }
  }
  handleHalfPipe(s, 0x10, S(604));
  if (s.f8e > 0) jumpScale(s, 0x10, S(604), S(604), 0, 0, 0);
}

const BLOB_BLOCKERS = ['handleDoorSprite', 'handlePlantSprite', 'handleBarrelSprite', 'handleCoolerSprite',
  'handleGrateSprite', 'handleBoulderSprite', 'handleSlidingDoorSprite', 'handleChairSprite',
  'handleCoWorkerSprite', 'handleColliderSprite'];
function blobRecoil(s) {
  s.fixH -= s.f50; s.fixV -= s.f4e;
  s.f50 = mt(s.f50, -1.1); s.f4e = mt(s.f4e, -1.1);
  s.f6e = 0;
}

export function hitBlobSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (is(o, 'handleEffectSprite')) {
    if (o.hot[1] || o.hot[0] || o.hot[2] || o.hot[3]) {
      Hooks.handleExplodeRadius(me, 0x10, o);
      me.f72--;
      me.layer = 10;
    }
  } else if (BLOB_BLOCKERS.some((n) => is(o, n))) {
    blobRecoil(me);
  } else if (is(o, 'handlePlayerSprite') && o.hot[1] === 0 && sectRect(kickRect(o), hotRect(me))) {
    const c = Hooks.spriteCenter(me);
    play3DSound(S(600), 15, 256, c.v, c.h);
    me.f72--;
    me.layer = 10;
    applyModedImpulse(me, inverseMode(o.dir), (26 * G.kickPowerK) >> 2);
    G.kickHit = 0x40;
  }
}

export function hitBlobTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG === 1) {
    if (G.g7048) return;
    if (wallBounce(s, kind, cellV, cellH, 0x10, 0xff, s.hot, Blob.mask, !G.g7048)) { G.g7048 = 1; s.f6e = 0; }
  } else if (s.f8e === 0 && kind === 1 && !G.g7049) {
    G.g7049 = 1;
    blobRecoil(s);
  }
}

// ---------------------------------------------------------------- robots
// 1801 chaser, 1811 stationary turning gunner, 1821 chaser (kinds 1802..1820 fold into 1811/1821 with
// extra hit points), 2001/2011/2021 machine-gun robots. f7c is the state, f72 the hit points.
// Reversors (1851/1852/1861/1862) share ROBOTTINTDRAWPROC.
const Robot = { faces: [], mg: [], mask: null }; // g_828a (PICT 212) / g_6b96 (PICT 2001, 2 x 36) / g_828e

export function robotTintDrawProc(face, s, blit) {
  const scale = s.scaleH !== 256 ? s.scaleH << 5 : 0;
  if (s.layer === 10) { s.layer = 7; return blit(1, scale + 4); }
  const tint = G.level.info(0);
  if (tint) return blit(1, tint + scale);
  switch (s.kind) {
    case 1801: return blit(0, scale);
    case 1811: return blit(1, scale + 2);
    case 1851: case 1852: return blit(1, scale + 4);
    case 1861: case 1862: return blit(1, scale + 10);
  }
  if (s.kind > 1811 && s.kind < 1900) return blit(1, scale + 1);
  return undefined;
}

function mgTintDrawProc(face, s, blit) {
  const scale = s.scaleH !== 256 ? s.scaleH << 5 : 0;
  if (s.layer === 10) { s.layer = 7; return blit(1, scale + 4); }
  if (s.kind === 2011) return blit(1, scale + 1);
  if (s.kind === 2021) return blit(1, scale + 4);
  return blit(1, scale);
}

export function initRobotSprite() {
  Robot.faces = loadEncFaceSetFromPICT(212, 36, 32, 32, 6, 0, 0, 4201);
  for (const f of Robot.faces) if (f) f.drawProc = robotTintDrawProc;
  Robot.mg = loadEncFaceSetFromPICT(2001, 72, 40, 40, 8, 0, 0, 4701);
  for (const f of Robot.mg) if (f) f.drawProc = mgTintDrawProc;
  const m = load1EncFaceFromCicn(598, true, 4251);
  Robot.mask = m ? maskFromFace(m) : null;
}

export function setupRobotSprite(s) {
  let hp = 3;
  Hooks.initSprite(s);
  s.f74 = 25;
  s.dir = findDesiredToward(s);
  s.task = handleRobotSprite;
  s.hit = hitRobotSprite;
  s.tileHit = hitRobotTileSprite;
  setRect(s.hot, 4, 4, 24, 24);
  s.f26 = 0;
  s.layer = 7;
  s.f4e = 0; s.f50 = 0;
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  if (s.kind >= 2001) {
    s.eface = Robot.mg[s.dir];
    hp = s.kind === 2001 ? 8 : s.kind === 2011 ? 12 : s.kind === 2021 ? 15 : 3;
    s.f7c = 4;
    setRect(s.hot, 4, 4, 36, 36);
  } else if (s.kind > 1811) {
    s.eface = Robot.faces[s.dir];
    hp = s.kind - 1814;
    s.kind = 1821;
    s.f7c = 1;
  } else if (s.kind > 1801) {
    s.eface = Robot.faces[s.dir];
    hp = s.kind - 1808;
    s.kind = 1811;
    s.f7c = 4;
  } else {
    s.eface = Robot.faces[s.dir];
    s.f7c = 1;
    s.f4e = 0; s.f50 = 0;
  }
  s.f72 = hp;
  s.behind = 1;
}

const robotTooFar = (s) => Math.abs(G.playerH - s.posH) > 500 || Math.abs(G.playerV - s.posV) > 500;

function randomRobotShot(s) {
  if (SATRand(s.kind > 1801 ? 35 : 60) !== 1) return;
  const shot = SATNewSprite(s.kind, s.h + 7, s.v + 8, Hooks.setupEnemyShotSprite);
  shot.f50 = s.f50; shot.f4e = s.f4e; shot.dir = s.dir;
  applyModedImpulse(shot, inverseMode(shot.dir), 1500); // AssignRobotShotSpeed
  play3DSound(S(601), 15, 256, s.posV, s.posH);
}

function randomMGShot(s) {
  if (SATRand(100) < 40) return;
  const shot = SATNewSprite(s.kind, s.posH + 16, s.posV + 16, Hooks.setupEnemyShotSprite);
  shot.dir = s.dir + (SATRand(100) < 50 ? 2 : -2);
  if (shot.dir > 35) shot.dir -= 35; else if (shot.dir < 0) shot.dir += 35;
  shot.f4e = 0; shot.f50 = 0;
  applyModedImpulse(shot, inverseMode(shot.dir), 1500);
  shot.fixH += 3 * shot.f50; shot.fixV += 3 * shot.f4e;  // start a little way out of the barrel
  shot.f50 = s.f50; shot.f4e = s.f4e; shot.dir = s.dir;
  if (SATRand(100) < 10) shot.dir++;
  else if (SATRand(100) < 20) shot.dir--;
  applyModedImpulse(shot, inverseMode(shot.dir), 1500);
  shot.posH = shot.h = shot.fixH >> 8;
  shot.posV = shot.v = shot.fixV >> 8;
  if (playingCount(S(606)) < 2) play3DSoundPitched(S(606), 15, 256, s.posV, s.posH, SATRand(6000) + 62000);
}

function robotExplode(s, d, vh, vv) {
  s.f92 = 1;
  Hooks.easyExplosion(s.h - d, s.v - d, vh, vv, 0, 0);
  play3DSound(S(602), 20, 171, s.v, s.h);
  G.g80c2 = 20;
  dropLoot(s);
}
const within = (a, b, n) => Math.abs(a - b) < n || Math.abs(a + 36 - b) < n || Math.abs(a - 36 - b) < n;

export function handleRobotSprite(s) {
  if (s.f92) return;
  if (s.f74 > 0) s.f74--;
  G.g6b95 = 0; G.g6b94 = 0;
  if (s.kind < 2001) {
    if (!robotTooFar(s)) {
      if (s.f72 <= 0) {
        s.f7c = 3;
        clearRecord(s);
        G.score += Math.trunc((s.kind - 1791) / 10) * 1250;
      }
      switch (s.f7c) {
        case 4: s.dir = findDesiredToward(s); randomRobotShot(s); break;
        case 1: { // turn towards Harry, then charge
          const d = findDesiredToward(s);
          if (within(d, s.dir, 1)) s.f7c = 2;
          else {
            if (d > s.dir && d - s.dir < 18) s.dir++; else s.dir--;
            if (s.dir > 35) s.dir = 0; else if (s.dir < 0) s.dir = 35;
            randomRobotShot(s);
          }
          break;
        }
        case 0:
          if (Math.abs(s.f50) > 100 || Math.abs(s.f4e) > 100) {
            s.f50 = mt(s.f50, 0.7); s.f4e = mt(s.f4e, 0.7);
            randomRobotShot(s);
          } else { s.f7c = 1; s.f4e = 0; s.f50 = 0; }
          break;
        case 2: { // charging
          const d = findDesiredToward(s);
          if (within(d, s.dir, 4)) {
            s.f7c = 2;
            if (Math.abs(s.f50) < 150 || Math.abs(s.f4e) < 150) applyModedImpulse(s, inverseMode(s.dir), 20);
            randomRobotShot(s);
          } else s.f7c = 0;
          break;
        }
        case 3: robotExplode(s, 20, Math.trunc(s.f50 / 256), Math.trunc(s.f4e / 256)); break;
        case 5: if (s.f74 === 0) s.f7c = 0; break;
      }
      if (s.kind === 1811) { s.f4e = 0; s.f50 = 0; }
      else {
        s.fixH += s.f50; s.fixV += s.f4e;
        s.h = s.posH = s.fixH >> 8;
        s.v = s.posV = s.fixV >> 8;
      }
      s.f8a = 1;
      s.eface = Robot.faces[s.dir];
    }
  } else {
    let firing = false;
    if (s.f72 <= 0) {
      s.f7c = 3;
      clearRecord(s);
      G.score += s.kind === 2001 ? 2000 : s.kind === 2011 ? 2500 : s.kind === 2021 ? 3000 : 0;
    }
    if (!robotTooFar(s)) {
      switch (s.f7c) {
        case 4: {
          const d = findDesiredToward(s);
          approachMode(s, d);
          if (d === s.dir) { s.f7c = 6; s.f6e = SATRand(70) + 25; }
          s.f4e = 0; s.f50 = 0;
          s.eface = Robot.mg[s.dir];
          break;
        }
        case 6:
          if (SATRand(50) < 20 && s.f6e > 20) {
            randomMGShot(s);
            s.eface = Robot.mg[s.dir + 36];
            firing = true;
          } else s.eface = Robot.mg[s.dir];
          if (--s.f6e <= 0) s.f7c = 4;
          break;
        case 3: robotExplode(s, 12, s.f50 >> 8, s.f4e >> 8); break;
        default: s.f7c = 4;
      }
      s.fixH += s.f50; s.fixV += s.f4e;
      s.h = s.posH = s.fixH >> 8;
      s.v = s.posV = s.fixV >> 8;
      if (firing) { s.posH += 2 - SATRand(5); s.posV += 2 - SATRand(5); } // recoil shake
      s.f8a = 1;
    }
  }
  handleHalfPipe(s, 0xc, null);
  jumpScale(s, 0xc, S(600), S(600), 0, 0, 0);
}

function robotRecoil(s) {
  s.fixH -= s.f50; s.fixV -= s.f4e;
  s.f50 = mt(s.f50, -1.4); s.f4e = mt(s.f4e, -1.4);
  if (s.f7c === 2) s.f7c = 0;
}
const ROBOT_BLOCKERS = ['handlePlantSprite', 'handleCoolerSprite', 'handleDeskSprite', 'handleColliderSprite',
  'handleCoWorkerSprite', 'handleGrateSprite', 'handleChairSprite'];

export function hitRobotSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (is(o, 'handleBarrelSprite')) {
    if (o.dir === 1) { play3DSound(S(801), 20, 256, o.posV, o.posH); o.dir++; }
    me.f50 = mt(me.f50, -1.4); me.f4e = mt(me.f4e, -1.4);
    if (me.f7c === 2) me.f7c = 0;
  } else if (is(o, 'handleEffectSprite')) {
    if (me.f74 === 0 && (o.hot[1] || o.hot[0] || o.hot[2] || o.hot[3])) {
      Hooks.handleExplodeRadius(me, 0xc, o);
      me.layer = 10;
      if (SATRand(100) < 30) me.f72--;
    }
  } else if (is(o, 'handleRampSprite')) {
    Hooks.handleRampCollision(me, 0xc, me.hot, o, S(600));
  } else if (is(o, 'handleStairsSprite')) {
    Hooks.handleStairsCollision(me, 0xc, me.hot, o);
  } else if (ROBOT_BLOCKERS.some((n) => is(o, n))
      || (is(o, 'handleDoorSprite') && ![902, 912, 922, 932].includes(o.kind))
      || is(o, 'handleSlidingDoorSprite')) {
    robotRecoil(me);
  } else if (is(o, 'handlePlayerSprite')) {
    if (o.hot[1] !== 0) {
      robotRecoil(me);
      if (G.caffeine > 0) { me.f72--; me.layer = 10; }
    } else if (sectRect(kickRect(o), hotRect(me))) {
      const c = Hooks.spriteCenter(me);
      play3DSound(S(600), 15, 256, c.v, c.h);
      me.f72--;
      me.layer = 10;
      applyModedImpulse(me, inverseMode(o.dir), (26 * G.kickPowerK) >> 1);
      G.kickHit = 0x80;
      me.f7c = 5;
      me.f74 = 10;
    }
  }
}

export function hitRobotTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG === 1) {
    if (G.g6b94) return;
    if (wallBounce(s, kind, cellV, cellH, 0xc, 256, s.hot, Robot.mask, !G.g6b94)) { G.g6b94 = 1; s.f7c = 0; }
  } else if (s.f8e === 0 && kind === 1 && !G.g6b95) {
    G.g6b95 = 1;
    bgTileBounce(s, 1, cellV, cellH, 0xc, 254, s.hot, Robot.mask, true);
  }
}

// ---------------------------------------------------------------- reversors (1851/1861 horizontal, 1852/1862 vertical)
// Spinning bumpers that bounce back and forth; a shot that hits one flips their axis of travel.
export function setupReversorSprite(s) {
  Hooks.initSprite(s);
  s.f74 = 25;
  s.dir = 0;
  s.task = handleReversorSprite;
  s.hit = hitReversorSprite;
  s.tileHit = hitReversorTileSprite;
  setRect(s.hot, 4, 4, 24, 24);
  s.f26 = 0;
  s.layer = 7;
  s.f4e = 0; s.f50 = 0;
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  switch (s.kind) {
    case 1851: s.f50 = 1000; break;
    case 1852: s.f4e = 1000; break;
    case 1861: s.f50 = 1500; break;
    case 1862: s.f4e = 1500; break;
  }
  s.f72 = 0; // (left uninitialised in the original)
  s.eface = Robot.faces[s.dir];
  s.behind = 1;
}

export function handleReversorSprite(s) {
  if (s.f92) return;
  if (++s.dir > 35) s.dir = 0; else if (s.dir < 0) s.dir = 35;
  G.g6b9b = 0; G.g6b9a = 0;
  s.eface = Robot.faces[s.dir];
  s.fixH += s.f50; s.fixV += s.f4e;
  s.posH = s.h = s.fixH >> 8;
  s.posV = s.v = s.fixV >> 8;
  handleHalfPipe(s, 0xc, null);
  jumpScale(s, 0xc, S(600), S(600), 0, 0, 0);
}

const REVERSOR_BLOCKERS = ['handlePlantSprite', 'handleCoolerSprite', 'handleDeskSprite', 'handleGrateSprite',
  'handleChairSprite', 'handleReversorSprite', 'handleCoWorkerSprite', 'handleColliderSprite', 'handleSlidingDoorSprite'];

export function hitReversorSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (is(o, 'handleBarrelSprite')) {
    play3DSound(S(801), 20, 256, o.posV, o.posH);
    o.dir++;
    me.f50 = w16(-me.f50); me.f4e = w16(-me.f4e);
  } else if (is(o, 'handleRampSprite')) {
    Hooks.handleRampCollision(me, 0xc, me.hot, o, S(600));
  } else if (is(o, 'handleStairsSprite')) {
    Hooks.handleStairsCollision(me, 0xc, me.hot, o);
  } else if (REVERSOR_BLOCKERS.some((n) => is(o, n)) || (is(o, 'handleDoorSprite') && ![902, 912, 922, 932].includes(o.kind))) {
    me.fixH -= me.f50; me.fixV -= me.f4e;
    me.f50 = w16(-me.f50); me.f4e = w16(-me.f4e);
  } else if (is(o, 'handlePlayerShotSprite') || is(o, 'handleEnemyShotSprite')) {
    o.fixH -= o.f50; o.fixV -= o.f4e;
    o.f50 = w16(-o.f50); o.f4e = w16(-o.f4e);
    const c = Hooks.spriteCenter(me);
    play3DSound(S(605), 10, 256, c.v, c.h);
    if (Math.abs(me.f50) > Math.abs(me.f4e)) { me.f4e = me.f50; me.f50 = 0; }
    else { me.f50 = me.f4e; me.f4e = 0; }
  }
}

export function hitReversorTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG === 1) {
    if (G.g6b9a) return;
    if (wallBounce(s, kind, cellV, cellH, 0x10, 256, s.hot, Robot.mask, !G.g6b9a)) { G.g6b9a = 1; s.f6e = 0; }
  } else if (s.f8e === 0 && kind === 1 && !G.g6b9b) {
    G.g6b9b = 1;
    bgTileBounce(s, 1, cellV, cellH, 0x10, 256, s.hot, Robot.mask, true);
  }
}

// ---------------------------------------------------------------- wall turrets (19x1..19x4, x = 0/1/2 toughness)
// The last digit is the facing (1 down, 2 up, 3 left, 4 right); a turret tracks Harry within its arc.
const Turret = { faces: [] }; // g_6b74: PICT 1901, 32 faces 24x24

function turretTintDrawProc(face, s, blit) {
  if (s.layer === 10) { s.layer = 7; return blit(1, 4); }
  const tint = G.level.info(0);
  if (tint) return blit(1, tint);
  if (s.kind < 1910) return blit(0, 0);
  if (s.kind < 1920) return blit(1, 8);
  return blit(1, 12);
}

export function initTurretSprite() {
  Turret.faces = loadEncFaceSetFromPICT(1901, 32, 24, 24, 8, 0, 0, 4601);
  for (const f of Turret.faces) if (f) f.drawProc = turretTintDrawProc;
}

const facing = (s) => { const d = s.kind - 1901; return d >= 0 && d <= 23 && d % 10 <= 3 ? (d % 10) + 1 : 0; };

export function setupTurretSprite(s) {
  Hooks.initSprite(s);
  s.f74 = 25;
  s.dir = [0, 10, 30, 18, 0][facing(s)];
  s.task = handleTurretSprite;
  s.hit = hitTurretSprite;
  s.tileHit = null;
  setRect(s.hot, 4, 4, 20, 20);
  s.f26 = 0;
  s.layer = 7;
  s.f4e = 0; s.f50 = 0;
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  s.f6e = 1;
  s.f72 = s.kind < 1910 ? 25 : s.kind < 1920 ? 40 : 50;
  s.eface = null;
  s.behind = 1;
}

function randomTurretShot(s) {
  if (SATRand(s.kind >= 1910 && s.kind < 1920 ? 35 : 60) !== 1) return;
  const shot = SATNewSprite(s.kind, s.h + 7, s.v + 8, Hooks.setupEnemyShotSprite);
  shot.f50 = s.f50; shot.f4e = s.f4e; shot.dir = s.dir;
  applyModedImpulse(shot, inverseMode(shot.dir), 1500); // AssignTurretShotSpeed
  play3DSound(S(601), 15, 256, s.posV, s.posH);
}

export function handleTurretSprite(s) {
  if (s.f92) return;
  if (s.f74 > 0) s.f74--;
  const d = findDesiredToward(s);
  switch (facing(s)) {
    case 1: if (d >= 5 && d <= 12) s.dir = d; break;
    case 2: if (d >= 23 && d <= 30) s.dir = d; break;
    case 3: if (d >= 14 && d <= 21) s.dir = d; break;
    case 4: if (d <= 3 || d >= 32) s.dir = d; break;
  }
  if (d === s.dir) randomTurretShot(s);
  if (s.f72 <= 0) {
    s.f92 = 1;
    Hooks.easyExplosion(s.h - 20, s.v - 20, Math.trunc(s.f50 / 256), Math.trunc(s.f4e / 256), 0, 0);
    play3DSound(S(602), 20, 256, s.v, s.h);
    dropLoot(s);
    G.score += s.kind < 1910 ? 1000 : s.kind < 1920 ? 1500 : 2000;
  }
  switch (facing(s)) {
    case 1: s.eface = Turret.faces[s.dir - 5]; break;
    case 2: s.eface = Turret.faces[s.dir - 15]; break;
    case 3: s.eface = Turret.faces[s.dir + 2]; break;
    case 4: s.eface = Turret.faces[s.dir <= 3 ? s.dir + 28 : s.dir - 8]; break;
  }
}

export function hitTurretSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (is(o, 'handlePlayerShotSprite')) {
    play3DSound(S(600), 20, 256, o.posV, o.posH);
    me.f72 -= 5;
    o.f92 = 1;
  } else if (is(o, 'handleEffectSprite') && me.f74 === 0 && (o.hot[1] || o.hot[0] || o.hot[2] || o.hot[3])) {
    me.f72--;
    me.layer = 10;
  }
}

// ---------------------------------------------------------------- ghosts (5001 / 5011): drift through walls towards
// Harry; a staple makes them blink out and reappear elsewhere on screen. f6e: 2 chasing, 1 blinking, 3 dying.
const Ghost = { faces: [] }; // g_6daa: PICT 224, 36 faces 40x40

function ghostTintDrawProc(face, s, blit) {
  const tint = G.level.info(0);
  if (tint) return blit(1, tint);
  return s && s.kind === 5001 ? blit(0, 0) : blit(1, 1);
}

export function initGhostSprite() {
  Ghost.faces = loadEncFaceSetFromPICT(224, 36, 40, 40, 18, 0, 0, 3301);
  for (const f of Ghost.faces) if (f) f.drawProc = ghostTintDrawProc;
}

export function setupGhostSprite(s) {
  Hooks.initSprite(s);
  s.dir = findDesiredToward(s);
  s.task = handleGhostSprite;
  s.hit = hitGhostSprite;
  s.tileHit = null;
  setRect(s.hot, 0, 0, 40, 40);
  s.f26 = 0;
  s.layer = 20;
  s.f4e = 0; s.f50 = 0;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  s.f6e = 2;
  s.f72 = s.kind === 5001 ? 3 : 5;
  s.eface = Ghost.faces[s.dir];
  s.f74 = 0;
  s.behind = 1;
}

export function handleGhostSprite(s) {
  if (s.f92) return;
  G.g6dae = 0;
  approachMode(s, findDesiredToward(s));
  if (s.dir > 35) s.dir = 0; else if (s.dir < 0) s.dir = 35;
  s.f8a = 1;
  s.eface = Ghost.faces[s.dir];
  if (s.f72 < 0) s.f6e = 3;
  if (s.f6e === 2) {
    s.f4e = 0; s.f50 = 0;                                           // AccelerateGhost: constant speed
    applyModedImpulse(s, inverseMode(s.dir), s.kind > 5001 ? 768 : 384);
  } else if (s.f6e === 1) {
    s.f4e = 0; s.f50 = 0;
    s.f74--;
    if (s.f74 > 30) {
      if (s.f74 >= 31 && s.f74 <= 59 && (s.f74 - 31) % 2 === 0) s.eface = null;
    } else if (s.f74 === 30) { // reappear somewhere on screen, away from Harry
      s.eface = null;
      const away = [G.playerV - 32, G.playerH - 32, G.playerV + 96, G.playerH + 96];
      for (let tries = 0; tries < 1000; tries++) {
        s.h = G.viewLeft + SATRand(408);
        s.v = G.viewTop + SATRand(408);
        if (!sectRect([s.v, s.h, s.v + 40, s.h + 40], away)) break;
      }
      s.fixH = s.h << 8; s.fixV = s.v << 8;
    } else if (s.f74 > 0) {
      if (s.f74 & 1) s.eface = null;
    } else s.f6e = 2;
  } else if (s.f6e === 3) {
    const boom = Hooks.easyExplosion(s.posH - 12, s.posV - 12, 0, 0, s.kind === 5001 ? 10 : 1, 4);
    if (boom) boom.f74 = 0;
    G.score += (s.kind > 5001 ? 2 : 1) * 2000;
    s.f92 = 1;
  }
  if (SATRand(1000) === 69) playRegSound(S(850), 9, 256); // "join us..."
  s.fixH += s.f50; s.fixV += s.f4e;
  s.h = s.posH = s.fixH >> 8;
  s.v = s.posV = s.fixV >> 8;
}

export function hitGhostSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (o.task !== Hooks.handlePlayerShotSprite || me.f74 !== 0) return;
  if (me.f72 <= 0) {
    me.f6e = 3;
    clearRecord(me);
    G.score += 3000;
    playRegSound(S(851), 15, 256);
    o.f92 = 1;
  } else {
    me.f6e = 1;
    playRegSound(S(852), 9, 256);
    o.f92 = 1;
    me.f72--;
    me.f74 = 60;
  }
}

// ---------------------------------------------------------------- boulders (6001/6011 up, 6002/6012 down,
// 6003/6013 left, 6004/6014 right; 60x1 are faster): roll until a wall, wait, then reappear at the start.
const Boulder = { faces: [] }; // g_7020: PICT 6001, 12 faces 64x64

export function initBoulderSprite() {
  Boulder.faces = loadEncFaceSetFromPICT(6001, 12, 64, 64, 6, 0, 0, 1601);
}

const BOULDER = { // axis, sign
  6001: ['v', -1], 6011: ['v', -1], 6002: ['v', 1], 6012: ['v', 1],
  6003: ['h', -1], 6013: ['h', -1], 6004: ['h', 1], 6014: ['h', 1],
};

export function setupBoulderSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.f6e = 0;
  s.task = handleBoulderSprite;
  s.hit = hitBoulderSprite;
  s.tileHit = hitBoulderTileSprite;
  s.eface = null;
  setRect(s.hot, 16, 16, 48, 48);
  s.f26 = 0;
  s.layer = 200;
  s.f4e = 0; s.f50 = 0;
  s.posH = s.h; s.posV = s.v;
  const b = BOULDER[s.kind];
  s.f72 = b && b[0] === 'v' ? s.v : s.h; // start coordinate along the rolling axis
  s.f74 = 0;
  s.behind = 0;
}

export function handleBoulderSprite(s) {
  if (s.f92) return;
  const lv = G.level, o = lv.objOff(s.param);
  const b = BOULDER[s.kind];
  if (!s.behind) { // first frame: restore state kept in the level record
    s.f74 = lv.w(o + 4) || 0;
    if (!lv.w(o + 8)) lv.setW(o + 8, s.f72);
    else {
      s.f72 = lv.w(o + 8);
      if (b && b[0] === 'v') s.v = s.f72; else s.h = s.f72;
    }
    s.dir = lv.w(o + 6);
    s.behind = 1;
  }
  if (s.f74 > 0 && --s.f74 === 0) s.dir++;
  if (b) {
    const [axis, sign] = b;
    const field = axis === 'v' ? 'f4e' : 'f50';
    if (s.dir === 0) s[field] = sign * (s.kind < 6010 ? 8 : 12);
    else if (s.dir > 3 && SATRand(5) === 1) {
      s[axis] = s.f72;
      s.dir = 0;
      play3DSoundPitched(S(402), 15, 256, s.posV, s.posH, SATRand(6000) + 62000);
    } else { s.f4e = 0; s.f50 = 0; s.dir++; }
  }
  s.h = w16(s.h + s.f50);
  s.v = w16(s.v + s.f4e);
  s.posH = s.h; s.posV = s.v;
  lv.setW(o + 4, s.f74);
  lv.setW(o + 6, s.dir);
  lv.setW(o + 2, s.kind);
  if (++s.f6e > 5) s.f6e = 0;
  switch (s.kind) {
    case 6001: case 6011: s.eface = Boulder.faces[s.f6e]; break;
    case 6002: case 6012: s.eface = Boulder.faces[5 - s.f6e]; break;
    case 6003: case 6013: s.eface = Boulder.faces[s.f6e + 6]; break;
    case 6004: case 6014: s.eface = Boulder.faces[11 - s.f6e]; break;
  }
}

export function hitBoulderSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (is(o, 'handleRobotSprite') || is(o, 'handleBlobSprite')) o.f72 = 0; // crushed
}

// FG tile kinds that stop a boulder, per direction (the same sets the mail guy uses)
const BOULDER_STOPS = {
  v_1: [1, 5, 6, 8, 11, 13, 14, 18, 21, 26, 29], v1: [3, 4, 7, 9, 10, 12, 15, 16, 23, 24, 31],
  h_1: [0, 5, 4, 10, 11, 13, 12, 17, 20, 25, 28], h1: [2, 6, 7, 8, 9, 14, 15, 19, 22, 27, 30],
};

export function hitBoulderTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG !== 1 || s.f74 !== 0 || s.dir !== 0) return;
  const b = BOULDER[s.kind];
  if (!b) return;
  if (BOULDER_STOPS[b[0] + (b[1] < 0 ? '_1' : '1')].includes(kind)) s.f74 = 12;
}

register({ initBoulderSprite, setupBoulderSprite, handleBoulderSprite,
  initGhostSprite, setupGhostSprite, handleGhostSprite,
  setupReversorSprite, handleReversorSprite, initTurretSprite, setupTurretSprite, handleTurretSprite,
  initRobotSprite, setupRobotSprite, handleRobotSprite, robotTintDrawProc,
  initDartEnemySprite, setupDartEnemySprite, handleDartEnemySprite,
  initBlobSprite, setupBlobSprite, handleBlobSprite });
