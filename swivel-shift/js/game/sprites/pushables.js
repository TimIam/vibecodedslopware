// Pushable office furniture (seg 3): plants (601) and water coolers (500/501).
// Harry shoves them by touching (REGIONBOUNCE against their round masks) or kicks them; they glide
// with floor friction, ride half pipes, bounce off walls and knock into each other.

import { G } from '../state.js';
import { w16, setRect, sectRect } from '../../core/util.js';
import { SATRand } from '../../core/sat.js';
import { load1EncFaceFromCicn, loadEncFaceSetFromPICT, satGetFace, getResource } from '../../core/res.js';
import { maskFromCicn, maskFromFace, regionBounce } from '../masks.js';
import { Tiles } from '../tiles.js';
import { PlayerFaces } from '../player.js';
import { handleGlide, handleHalfPipe, jumpScale, wallBounce, bgTileBounce, applyModedImpulse,
  inverseMode, rectBounceFake } from '../physics.js';
import { S, playRegSound, play3DSound, play3DSoundPitched, isPlaying, peDistance } from '../sound.js';
import { userTintDrawProc } from '../faces.js';
import { Hooks, register } from '../hooks.js';

const mt = (v, k) => w16(Math.trunc(v * k));
const is = (o, name) => o.task === Hooks[name];
const center = (s) => Hooks.spriteCenter(s);
const kickRect = (p) => {
  const k = PlayerFaces.kickRects[p.dir];
  return [p.posV + k[0], p.posH + k[1], p.posV + k[2], p.posH + k[3]];
};
const hotRect = (s) => [s.posV + s.hot[0], s.posH + s.hot[1], s.posV + s.hot[2], s.posH + s.hot[3]];
const syncWhere = (s) => { s.h = s.posH = s.fixH >> 8; s.v = s.posV = s.fixV >> 8; };
const tintable = (f) => { if (f) f.drawProc = userTintDrawProc; return f; };
const clearRecord = (s) => { if (s.param >= 0 && s.param <= 255) G.level.setB(G.level.objOff(s.param), 0); };

// Shared round collision masks: SATGetFace(598).mask (g_81f2, barrels & coolers) and
// SATGetFace(599).mask (g_81f6 plants, g_81fa chairs)
export const PushMasks = { round598: null, round599: null };
function masks() {
  if (!PushMasks.round598) {
    PushMasks.round598 = maskFromCicn(getResource('cicn', 598));
    PushMasks.round599 = maskFromCicn(getResource('cicn', 599));
  }
  return PushMasks;
}

// The mail guy explodes when hit by a pushed object (same code in every pushable's hit proc)
function mailGuyCrash(me, o) {
  me.f92 = 1; o.f92 = 1;
  playRegSound(S(602), 20, 171);
  playRegSound(S(401), 30, 256);
  Hooks.easyExplosion(o.posH, o.posV, o.f50, o.f4e, 1, 4);
  Hooks.easyExplosion(o.posH, o.posV, mt(o.f50, 0.5), mt(o.f4e, 0.5), 0, 0);
  Hooks.easyExplosion(me.posH - 20, me.posV - 20, Math.trunc(me.f50 / 256), Math.trunc(me.f4e / 256), 0, -4);
  clearRecord(me); clearRecord(o);
  G.score += 5000;
}

// ---------------------------------------------------------------- plants (601)
const PlantFaces = []; // g_8202..g_820e: cicn 601..604

export function initPlantSprite() {
  for (let i = 0; i < 4; i++) PlantFaces[i] = tintable(load1EncFaceFromCicn(601 + i, false, 3901 + i));
  masks();
}

export function setupPlantSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0; s.f4e = 0; s.f50 = 0;
  s.layer = 8;
  s.task = handlePlantSprite;
  s.hit = hitPlantSprite;
  s.tileHit = hitPlantTileSprite;
  setRect(s.hot, 8, 8, 28, 28);
  s.eface = PlantFaces[0];
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.posH << 8; s.fixV = s.posV << 8;
}

export function handlePlantSprite(s) {
  if (s.f92) return;
  G.g6c18 = 0;
  // rustle animation after a bump
  switch (s.dir) {
    case 1: case 2: s.eface = PlantFaces[1]; s.dir++; break;
    case 3: case 4: s.eface = PlantFaces[2]; s.dir++; break;
    case 5: s.eface = PlantFaces[3]; s.dir++; break;
    case 6: s.eface = PlantFaces[3]; s.dir = 0; break;
    default: s.eface = PlantFaces[0];
  }
  handleGlide(s, 0x12);
  handleHalfPipe(s, 0x12, S(1101));
  jumpScale(s, 0x12, S(1101), S(1101), 0, 0, 0);
  s.fixH += s.f50; s.fixV += s.f4e;
  syncWhere(s);
  s.behind = 1;
}

export function hitPlantTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG === 1) wallBounce(s, kind, cellV, cellH, 0x12, G.bounciness, s.hot, masks().round599, true);
  else if (s.f8e === 0 && kind === 1) bgTileBounce(s, kind, cellV, cellH, 0x12, G.bounciness, s.hot, masks().round599, true);
}

function rustle() { if (!isPlaying(S(1100))) playRegSound(S(1100), 10, 256); }

export function hitPlantSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (me.f8e > 0 || o.f8e > 0) return;
  const M = masks();
  if (is(o, 'handleEffectSprite')) {
    if (o.hot[1] || o.hot[0] || o.hot[2] || o.hot[3]) {
      Hooks.handleExplodeRadius(me, 0x12, o);
      me.f72--;
      me.layer = 10;
    }
  } else if (is(o, 'handlePlayerSprite')) {
    if (o.hot[1] !== 0) {
      if (regionBounce(o, me.posV, me.posH, Tiles.harryMask, M.round599)) {
        me.dir = 1;
        o.posH = o.h; o.posV = o.v;
        o.fixH = o.posH << 8; o.fixV = o.posV << 8;
        me.fixH = me.posH << 8; me.fixV = me.posV << 8;
        rustle();
        me.f50 = mt(o.f50, 0.6); me.f4e = mt(o.f4e, 0.6);
        o.f50 = mt(o.f50, -0.3); o.f4e = mt(o.f4e, -0.3);
      }
    } else if (sectRect(kickRect(o), hotRect(me))) {
      me.dir = 1;
      const c = center(me);
      play3DSound(S(1101), 15, 256, c.v, c.h);
      applyModedImpulse(me, inverseMode(o.dir), (26 * G.kickPowerK) >> 1);
      G.kickHit = 0x80;
    }
  } else if (is(o, 'handleMailGuySprite')) {
    mailGuyCrash(me, o);
  }
  furnitureCollision(me, o, 0x12, M.round599, rustle);
  if (is(o, 'handlePlayerShotSprite') || is(o, 'handleEnemyShotSprite')) {
    if (o.kind === 9610) return;
    o.f92 = 1;
    const c = center(me);
    play3DSound(S(1101), 15, 256, c.v, c.h);
    me.dir = 1;
    if (o.kind === 9450) { me.f50 = w16(me.f50 + (o.f50 >> 2)); me.f4e = w16(me.f4e + (o.f4e >> 2)); }
  }
}

// Pushable vs furniture / doors / colliders / ramps / stairs (shared tail of the hit procs).
// myMask: the pushable's round mask; exchange: whether velocities are traded with other pushables.
function furnitureCollision(me, o, off, myMask, bumpSound) {
  const M = masks();
  const furniture = ['handleCoolerSprite', 'handleBarrelSprite', 'handleDeskSprite', 'handleChairSprite',
    'handlePlantSprite', 'handleRobotSprite'].some((n) => is(o, n));
  if (furniture) {
    let hit = true;
    if ((me.fixH >> 8) === (o.fixH >> 8) && (me.fixV >> 8) === (o.fixV >> 8)) {
      me.fixH -= SATRand(0x300) + 0x100;
      me.fixV -= SATRand(0x300) + 0x100;
      o.fixH += SATRand(0x300) + 0x100;
      o.fixV += SATRand(0x300) + 0x100;
    }
    syncWhere(me); syncWhere(o);
    if (is(o, 'handleDeskSprite')) {
      me.fixH -= me.f50; me.fixV -= me.f4e;
    } else if (is(o, 'handleBarrelSprite') || is(o, 'handleCoolerSprite')) {
      hit = regionBounce(me, o.posV, o.posH, myMask, M.round598);
    } else if (is(o, 'handlePlantSprite') || is(o, 'handleRobotSprite')) {
      hit = regionBounce(me, o.posV, o.posH, myMask, M.round599);
    } else if (is(o, 'handleChairSprite')) {
      hit = regionBounce(me, o.posV, o.posH, myMask, M.round599);
    }
    if (hit) {
      me.fixH = me.h << 8; me.fixV = me.v << 8;
      bumpSound();
      if (is(o, 'handleRobotSprite')) {
        me.f50 = w16(me.f50 + (o.f50 >> 1)); me.f4e = w16(me.f4e + (o.f4e >> 1));
      } else if (is(o, 'handleBarrelSprite') || is(o, 'handlePlantSprite') || is(o, 'handleChairSprite')) {
        o.f50 = mt(o.f50 + 0.4 * me.f50, 1); o.f4e = mt(o.f4e + 0.4 * me.f4e, 1);
        me.f50 = mt(me.f50 + 0.4 * o.f50, 1); me.f4e = mt(me.f4e + 0.4 * o.f4e, 1);
        me.f50 = mt(me.f50, -0.4); me.f4e = mt(me.f4e, -0.4);
        o.f50 = mt(o.f50, -0.4); o.f4e = mt(o.f4e, -0.4);
      } else {
        me.f50 = mt(me.f50, -0.4); me.f4e = mt(me.f4e, -0.4);
      }
    }
  } else if (is(o, 'handleGrateSprite')) {
    Hooks.grateBounce(me, o, off, G.bounciness, me.hot);
  }
  if ((is(o, 'handleDoorSprite') || is(o, 'handleSlidingDoorSprite')) && ![902, 912, 922, 932].includes(o.kind)) {
    Hooks.rectBounce(me, o, off, G.bounciness, me.hot);
  }
  if (is(o, 'handleColliderSprite') || is(o, 'handleCoWorkerSprite')) Hooks.rectBounce(me, o, off, G.bounciness, me.hot);
  if (is(o, 'handleRampSprite')) Hooks.handleRampCollision(me, off, me.hot, o, S(1101));
  if (is(o, 'handleStairsSprite')) Hooks.handleStairsCollision(me, off, me.hot, o);
}

// Velocity trade between two pushables (both then bounce back at 40%)
function tradeVelocity(me, o) {
  o.f50 = mt(o.f50 + 0.4 * me.f50, 1); o.f4e = mt(o.f4e + 0.4 * me.f4e, 1);
  me.f50 = mt(me.f50 + 0.4 * o.f50, 1); me.f4e = mt(me.f4e + 0.4 * o.f4e, 1);
  me.f50 = mt(me.f50, -0.4); me.f4e = mt(me.f4e, -0.4);
  o.f50 = mt(o.f50, -0.4); o.f4e = mt(o.f4e, -0.4);
}
// Touching Harry: the object takes 60% of his speed, he bounces back with 30%
function shoveFromPlayer(me, o) {
  me.f50 = mt(o.f50, 0.6); me.f4e = mt(o.f4e, 0.6);
  o.f50 = mt(o.f50, -0.3); o.f4e = mt(o.f4e, -0.3);
}
// Grates, doors, colliders, coworkers (and optionally ramps/stairs): the common tail of the hit procs
function staticObstacles(me, o, off, rampSnd, rampsDone) {
  if (is(o, 'handleGrateSprite')) Hooks.grateBounce(me, o, off, G.bounciness, me.hot);
  if ((is(o, 'handleDoorSprite') || is(o, 'handleSlidingDoorSprite')) && ![902, 912, 922, 932].includes(o.kind)) {
    Hooks.rectBounce(me, o, off, G.bounciness, me.hot);
  }
  if (is(o, 'handleColliderSprite') || is(o, 'handleCoWorkerSprite')) Hooks.rectBounce(me, o, off, G.bounciness, me.hot);
  if (!rampsDone) {
    if (is(o, 'handleRampSprite')) Hooks.handleRampCollision(me, off, me.hot, o, rampSnd);
    if (is(o, 'handleStairsSprite')) Hooks.handleStairsCollision(me, off, me.hot, o);
  }
}

// ---------------------------------------------------------------- barrels (550): explosive
// dir: 1 intact; 2..18 fuse burning (flashing); 19 explodes; 20+ gone. f74 counts bumps from other barrels.
const Barrel = { face: null, lit: null }; // g_704a / g_704e

export function initBarrelSprite() {
  Barrel.face = tintable(load1EncFaceFromCicn(550, true, 1301));
  Barrel.lit = tintable(load1EncFaceFromCicn(551, true, 1302));
  masks();
}

export function setupBarrelSprite(s) {
  Hooks.initSprite(s);
  s.dir = 1;
  s.layer = 6;
  s.task = handleBarrelSprite;
  s.hit = hitBarrelSprite;
  s.tileHit = hitBarrelTileSprite;
  s.f4e = 0; s.f50 = 0;
  setRect(s.hot, 0, 0, 24, 24);
  s.eface = Barrel.face;
  s.f26 = 0;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  s.behind = 1;
}

const div256 = (x) => Math.trunc(x / 256);

export function handleBarrelSprite(s) {
  if (s.f92) return;
  G.g7052 = 0;
  if (s.f74 > 0) s.f74--;
  const d = s.dir;
  if (d >= 2 && d <= 18) {
    if (d & 1) { s.eface = Barrel.face; s.dir++; clearRecord(s); }
    else { s.eface = Barrel.lit; s.dir++; }
  } else if (d === 19) {
    G.screenShake = 32;
    const vh = div256(s.f50), vv = div256(s.f4e);
    Hooks.easyExplosion(s.h - 20, s.v - 20, vh, vv, 0, 0);
    Hooks.easyExplosion(s.h - 20, s.v, vh, vv, 0, -3);
    Hooks.easyExplosion(s.h - 20, s.v - 36, vh, vv, 0, -8);
    Hooks.easyExplosion(s.h, s.v - 20, vh, vv, 0, -5);
    s.dir++;
  } else if ((d >= 20 && d <= 21) || (d >= 23 && d <= 29)) {
    s.eface = Barrel.lit; s.dir++; s.f92 = 1;
  } else if (d === 30) {
    s.f92 = 1;
  } else s.eface = Barrel.face;
  handleGlide(s, 0xc);
  handleHalfPipe(s, 0xc, null);
  jumpScale(s, 0xc, S(800), S(800), 0, 0, 0);
  s.fixH += s.f50; s.fixV += s.f4e;
  syncWhere(s);
}

export function hitBarrelTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG === 1) wallBounce(s, kind, cellV, cellH, 0xc, G.bounciness, s.hot, masks().round598, true);
  else if (s.f8e === 0 && kind === 1) bgTileBounce(s, kind, cellV, cellH, 0xc, G.bounciness, s.hot, masks().round598, true);
}

function clunk() { if (!isPlaying(S(800))) playRegSound(S(800), 10, 256); }
function ignite(me) { if (me.dir === 1) { playRegSound(S(801), 20, 256); me.dir++; } }

export function hitBarrelSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (me.f8e > 0 || o.f8e > 0) return;
  const M = masks();
  if (is(o, 'handlePlayerSprite')) {
    if (o.hot[1] !== 0) {
      if (regionBounce(o, me.posV, me.posH, Tiles.harryMask, M.round598)) {
        o.fixH = o.h << 8; o.fixV = o.v << 8;
        clunk();
        shoveFromPlayer(me, o);
        if (G.caffeine > 0) ignite(me); // a caffeinated shove lights the fuse
      }
    } else if (sectRect(kickRect(o), hotRect(me))) {
      applyModedImpulse(me, inverseMode(o.dir), (26 * G.kickPowerK) >> 1);
      G.kickHit = 0x80;
      if (SATRand(100) < 50 && me.dir === 1) {
        play3DSoundPitched(S(801), 20, 256, me.posV, me.posH, SATRand(6000) + 62000);
        me.dir++;
      } else clunk();
    }
  } else if (is(o, 'handleMailGuySprite')) {
    mailGuyCrash(me, o);
  }
  if (is(o, 'handleBarrelSprite')) {
    me.f74 += 8;
    if (me.f74 > 25) ignite(me);
    me.h = me.posH; me.v = me.posV;
    o.h = o.posH; o.v = o.posV;
    if (regionBounce(o, me.posV, me.posH, M.round598, M.round598)) {
      o.fixH = o.h << 8; o.fixV = o.v << 8;
      me.fixH = me.h << 8; me.fixV = me.v << 8;
      clunk();
      me.f50 = mt(me.f50, -0.4); me.f4e = mt(me.f4e, -0.4);
      o.f50 = mt(o.f50, -0.4); o.f4e = mt(o.f4e, -0.4);
      me.f50 = w16(me.f50 + o.f50); me.f4e = w16(me.f4e + o.f4e);
      o.f50 = w16(o.f50 + me.f50); o.f4e = w16(o.f4e + me.f4e);
    }
  }
  if (is(o, 'handleRampSprite')) Hooks.handleRampCollision(me, 0xc, me.hot, o, null);
  if (is(o, 'handleStairsSprite')) Hooks.handleStairsCollision(me, 0xc, me.hot, o);
  if (['handleCoolerSprite', 'handlePlantSprite', 'handleChairSprite', 'handleDeskSprite'].some((n) => is(o, n))) {
    let hit = true;
    if (is(o, 'handleCoolerSprite')) hit = regionBounce(me, o.posV, o.posH, M.round598, M.round598);
    else if (is(o, 'handlePlantSprite') || is(o, 'handleChairSprite')) hit = regionBounce(me, o.posV, o.posH, M.round598, M.round599);
    else { me.fixH -= me.f50; me.fixV -= me.f4e; }
    if (hit) {
      me.fixH = me.h << 8; me.fixV = me.v << 8;
      clunk();
      if (is(o, 'handlePlantSprite') || is(o, 'handleChairSprite')) tradeVelocity(me, o);
      else { me.f50 = mt(me.f50, -0.4); me.f4e = mt(me.f4e, -0.4); }
    }
  }
  staticObstacles(me, o, 0xc, null, true);
  if ((is(o, 'handlePlayerShotSprite') || is(o, 'handleEnemyShotSprite') || is(o, 'handleEffectSprite')) && o.kind !== 9610) {
    if (!is(o, 'handleEffectSprite')) o.f92 = 1;
    else Hooks.handleExplodeRadius(me, 0x12, o);
    ignite(me);
    if (o.kind === 9450) { me.f50 = w16(me.f50 + (o.f50 >> 2)); me.f4e = w16(me.f4e + (o.f4e >> 2)); }
  }
  if (is(o, 'handleEffectSprite') && o.kind >= 4200) { // a fire-pipe flame
    o.f6e = 3;
    ignite(me);
  }
}

// ---------------------------------------------------------------- swivel chairs (560): spin when bumped
const Chair = { faces: [] }; // g_6fba: PICT 560, 36 angles

export function initChairSprite() {
  Chair.faces = loadEncFaceSetFromPICT(560, 36, 32, 32, 6, 0, 0, 1801).map(tintable);
  masks();
}

export function setupChairSprite(s) {
  Hooks.initSprite(s);
  s.dir = SATRand(35);
  s.f6e = s.dir << 8; // angle (8.8)
  s.f74 = 0;          // spin speed
  s.f4e = 0; s.f50 = 0;
  s.layer = 7;
  s.task = handleChairSprite;
  s.hit = hitChairSprite;
  s.tileHit = hitChairTileSprite;
  setRect(s.hot, 8, 8, 28, 28);
  s.eface = Chair.faces[0];
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.posH << 8; s.fixV = s.posV << 8;
}

export function handleChairSprite(s) {
  if (s.f92) return;
  G.g6fb8 = 0;
  s.f6e += s.f74;
  s.f74 = mt(s.f74, 0.9);
  while (s.f6e >= 0x2400) s.f6e -= 0x2400;
  while (s.f6e < 0) s.f6e += 0x2400;
  s.dir = Math.max(0, Math.min(35, s.f6e >> 8));
  s.eface = Chair.faces[s.dir];
  handleGlide(s, 0x12);
  handleHalfPipe(s, 0x12, S(258));
  jumpScale(s, 0x12, S(257), S(257), 0, 0, 0);
  s.fixH += s.f50; s.fixV += s.f4e;
  syncWhere(s);
  s.behind = 1;
}

export function hitChairTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG === 1) wallBounce(s, kind, cellV, cellH, 0x12, G.bounciness, s.hot, masks().round599, true);
  else if (s.f8e === 0 && kind === 1) bgTileBounce(s, kind, cellV, cellH, 0x12, G.bounciness, s.hot, masks().round599, true);
}

function squeak() { if (!isPlaying(S(258))) playRegSound(S(258), 10, 171); }
// Spin from an off-centre push: the push direction relative to the direction towards the chair
function spinDelta(fromV, fromH, toV, toH, pushV, pushH) {
  const d3 = Hooks.findDesiredDirectionGeneric(fromV, fromH, toV, toH);
  const d4 = Hooks.findDesiredDirectionGeneric(fromV, fromH, pushV, pushH);
  const diff = d4 - d3;
  return Math.abs(diff) <= 18 ? diff : d4 + 36 - d3;
}

export function hitChairSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (me.f8e > 0 || o.f8e > 0) return;
  const M = masks();
  if (is(o, 'handleEffectSprite')) {
    if (o.hot[1] || o.hot[0] || o.hot[2] || o.hot[3]) Hooks.handleExplodeRadius(me, 0x12, o);
  } else if (is(o, 'handlePlayerSprite')) {
    if (o.hot[1] !== 0) {
      if (regionBounce(o, me.posV, me.posH, Tiles.harryMask, M.round599)) {
        me.dir = 1;
        o.posH = o.h; o.posV = o.v;
        o.fixH = o.posH << 8; o.fixV = o.posV << 8;
        me.fixH = me.posH << 8; me.fixV = me.posV << 8;
        squeak();
        shoveFromPlayer(me, o);
        const cV = o.v + 32, cH = o.h + 32;
        const d6 = spinDelta(cV, cH, me.v + 16, me.h + 16, cV + o.f4e, cH + o.f50);
        const d5 = peDistance(o.f4e, o.f50) >> 5;
        me.f74 = w16(me.f74 + d6 * d5);
      }
    } else if (sectRect(kickRect(o), hotRect(me))) {
      const c = center(me);
      play3DSound(S(257), 15, 256, c.v, c.h);
      const oldH = me.f50, oldV = me.f4e;
      me.f4e = 0; me.f50 = 0;
      applyModedImpulse(me, inverseMode(o.dir), (26 * G.kickPowerK) >> 1);
      G.kickHit = 0x80;
      const cV = o.v + 32, cH = o.h + 32;
      let d5 = spinDelta(cV, cH, me.v + 16, me.h + 16, cV + me.f4e, cH + me.f50);
      d5 = Math.max(-9, Math.min(9, d5));
      const d6 = peDistance(me.f4e, me.f50) >> 3;
      me.f74 = w16(me.f74 - d5 * d6);
      me.f50 = w16(me.f50 + oldH); me.f4e = w16(me.f4e + oldV);
    }
  } else if (is(o, 'handleMailGuySprite')) {
    mailGuyCrash(me, o);
  }
  if (['handleCoolerSprite', 'handleBarrelSprite', 'handleDeskSprite', 'handleChairSprite'].some((n) => is(o, n))) {
    let hit = true;
    if (is(o, 'handleBarrelSprite') || is(o, 'handleCoolerSprite')) hit = regionBounce(me, o.posV, o.posH, M.round599, M.round598);
    else if (is(o, 'handleChairSprite')) hit = regionBounce(me, o.posV, o.posH, M.round599, M.round599);
    else { me.fixH -= me.f50; me.fixV -= me.f4e; }
    if (hit) {
      me.fixH = me.h << 8; me.fixV = me.v << 8;
      squeak();
      if (is(o, 'handleBarrelSprite') || is(o, 'handleChairSprite')) tradeVelocity(me, o);
      else { me.f50 = mt(me.f50, -0.4); me.f4e = mt(me.f4e, -0.4); }
    }
  }
  staticObstacles(me, o, 0x12, null, false);
  if (is(o, 'handlePlayerShotSprite') || is(o, 'handleEnemyShotSprite')) {
    o.f92 = 1;
    const c = center(me);
    play3DSound(S(258), 15, 171, c.v, c.h);
    me.dir = 1;
    if (o.kind === 9450) { me.f50 = w16(me.f50 + (o.f50 >> 2)); me.f4e = w16(me.f4e + (o.f4e >> 2)); }
  }
}

// ---------------------------------------------------------------- water coolers (500/501)
const Cooler = { face: null, maskFace: null, mask: null }; // g_6f64 / g_6f68

export function initCoolerSprite() {
  Cooler.face = tintable(load1EncFaceFromCicn(500, false, 2001));
  Cooler.maskFace = load1EncFaceFromCicn(598, true, 2002);
  Cooler.mask = Cooler.maskFace ? maskFromFace(Cooler.maskFace) : null;
}

export function setupCoolerSprite(s) {
  Hooks.initSprite(s);
  s.dir = 1;
  s.layer = 8;
  s.task = handleCoolerSprite;
  s.hit = hitCoolerSprite;
  s.tileHit = null;
  s.f4e = 0; s.f50 = 0;
  setRect(s.hot, 0, 0, 24, 24);
  s.eface = Cooler.face;
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.posH << 8; s.fixV = s.posV << 8;
  s.behind = 1;
}

// dir counts hits: 1..3 intact, 4 explodes, 5..9 burning out, 10 gone
export function handleCoolerSprite(s) {
  if (s.f92) return;
  if (s.dir === 4) {
    let kind = 5;
    if (s.param >= 0 && s.param <= 255) kind = G.level.w(G.level.objOff(s.param) + 6) || 5;
    Hooks.easyExplosion(s.h - 20, s.v - 20, 0, 0, kind, 0);
    s.dir++;
    clearRecord(s);
  } else if (s.dir >= 5 && s.dir <= 9) s.dir++;
  else if (s.dir === 10) s.f92 = 1;
  else s.eface = Cooler.face;
}

export function hitCoolerSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (o.f8e > 0) return;
  if (is(o, 'handlePlayerSprite')) {
    if (o.hot[1] !== 0) {
      o.h = o.posH; o.v = o.posV;
      if (regionBounce(o, me.posV, me.posH, Tiles.harryMask, Cooler.mask)) {
        o.posH = o.h; o.posV = o.v;
        o.fixH = o.posH << 8; o.fixV = o.posV << 8;
        playRegSound(S(501), 10, 256);
        o.f50 = mt(o.f50, -0.6); o.f4e = mt(o.f4e, -0.6);
        G.kickHit = 256;
      }
    } else if (sectRect(kickRect(o), hotRect(me))) {
      const c = center(me);
      play3DSound(S(501), 15, 256, c.v, c.h);
      G.kickHit = 0xc0;
    }
  }
  if ((is(o, 'handlePlayerShotSprite') || is(o, 'handleEnemyShotSprite') || is(o, 'handleEffectSprite')) && o.kind !== 9610) {
    if (!is(o, 'handleEffectSprite')) o.f92 = 1;
    if (me.dir < 3) { playRegSound(S(502), 10, 256); me.dir++; }
    else if (me.dir === 3) { playRegSound(S(500), 20, 256); me.dir++; }
  }
}

// ---------------------------------------------------------------- ramps (9701..9704)
// 9701/9702 run vertically, 9703/9704 horizontally. A record word +6 != 0 makes the ramp movable
// (it then glides, bounces off walls and other ramps, and uses the 9711.. faces).
const Ramp = { faces: [], moving: [], masks: [] }; // g_6b9c.. / g_6bac.. / g_6bbc..
const RAMP_HOT = { 9701: [0, 8, 24, 60], 9702: [0, 0, 24, 52], 9703: [8, 0, 60, 24], 9704: [0, 0, 52, 24] }; // l,t,r,b
const RAMP_OFF = { 9701: [34, 12], 9702: [26, 12], 9703: [12, 34], 9704: [12, 26] };                         // v,h
const rampHot = (s, k) => { const r = RAMP_HOT[k]; if (r) setRect(s.hot, r[0], r[1], r[2], r[3]); };

export function initRampSprite() {
  for (let i = 0; i < 4; i++) Ramp.faces[i] = tintable(load1EncFaceFromCicn(9701 + i, false, 4101 + i));
  // (the original re-tints the static faces here, so the moving ones stay untinted)
  for (let i = 0; i < 4; i++) Ramp.moving[i] = load1EncFaceFromCicn(9711 + i, false, 4105 + i);
  for (let i = 0; i < 4; i++) Ramp.masks[i] = maskFromCicn(getResource('cicn', 571 + i));
}

export function setupRampSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleRampSprite;
  s.hit = hitRampSprite;
  s.tileHit = hitRampTileSprite;
  if (RAMP_HOT[s.kind]) { s.eface = Ramp.faces[s.kind - 9701]; rampHot(s, s.kind); }
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  s.layer = 1;
  s.f4e = 0; s.f50 = 0;
  s.behind = 1;
}

export function handleRampSprite(s) {
  if (s.f92) return;
  if (s.param >= 0 && s.param <= 255 && G.level.w(G.level.objOff(s.param) + 6)) {
    s.fixH += s.f50; s.fixV += s.f4e;
    syncWhere(s);
    if (RAMP_HOT[s.kind]) { s.eface = Ramp.moving[s.kind - 9701]; rampHot(s, s.kind); }
  }
  handleGlide(s, 0x14);
}

export function hitRampSprite(me, o) {
  if (me.f92 || o.f92) return;
  rampHot(me, me.kind);
  const off = RAMP_OFF[me.kind] || [0, 0];
  if (o.task !== handleRampSprite) return;
  let pv = o.posV, ph = o.posH;
  const oo = RAMP_OFF[o.kind];
  if (oo) { pv += oo[0]; ph += oo[1]; rampHot(me, o.kind); } // (resets *my* hot rect by the other's kind)
  rectBounceFake(me, pv, ph, o.hot, off, G.bounciness, me.hot);
}

export function hitRampTileSprite(s, cellV, cellH, kind, isFG) {
  const i = s.kind - 9701;
  const mask = i >= 0 && i < 4 ? Ramp.masks[i] : null;
  if (i >= 0 && i < 4) rampHot(s, s.kind);
  const off = RAMP_OFF[s.kind] || [0, 0];
  if (isFG === 1) {
    if (kind < 56 && s.eface && mask) wallBounce(s, kind, cellV, cellH, off, G.bounciness, s.hot, mask, true);
  } else if (kind === 1) {
    bgTileBounce(s, 1, cellV, cellH, off, G.bounciness, s.hot, mask, true);
  }
}

register({
  initBarrelSprite, setupBarrelSprite, handleBarrelSprite,
  initChairSprite, setupChairSprite, handleChairSprite,
  initRampSprite, setupRampSprite, handleRampSprite,
  initPlantSprite, setupPlantSprite, handlePlantSprite,
  initCoolerSprite, setupCoolerSprite, handleCoolerSprite,
});
