// Buttons (9501/9511/9521/9531 wall buttons, 9541 floor plate) and sliding doors (951 / 961).
// A button's record word +6 is its output: 1 while released, 0 while pressed. Its +4 == 1 makes it
// latch once fully pressed. Sliding doors (and wall shooters) watch the record named by their +4
// (negative = inverted): with a positive link the door is open while the button is pressed.

import { G } from '../state.js';
import { w16, setRect, sectRect } from '../../core/util.js';
import { SATNewSprite, SATRand } from '../../core/sat.js';
import { load1EncFaceFromCicn, loadEncFaceSetFromPICT } from '../../core/res.js';
import { PlayerFaces } from '../player.js';
import { S, playRegSound, play3DSound } from '../sound.js';
import { noScaleDrawProc } from '../faces.js';
import { Hooks, register } from '../hooks.js';

const lv = () => G.level;
const recOk = (s) => s.param >= 0 && s.param <= 255;
const recW = (s, off) => lv().w(lv().objOff(s.param) + off);
const is = (o, name) => o.task === Hooks[name];

// ---------------------------------------------------------------- buttons
const B = { wall: [[], [], [], []], floor: [] }; // g_6fbe / g_6fce / g_6fde / g_6fee, g_6ffe

// BUTTONDRAWPROC: record +10 tints the button (a level tint uses info(3), as in the original)
function buttonDrawProc(face, s, blit) {
  const tint = G.level.info(0);
  if (!s) return tint ? blit(1, tint) : blit(0, 0);
  if (tint) return blit(1, G.level.info(3));
  if (s.param >= 0) {
    let t = recW(s, 10);
    if (t) {
      if (t < -1 || t > 15) t = 0;
      return blit(1, t);
    }
  }
  return blit(0, 0);
}

export function initButtonSprite() {
  for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) B.wall[k][i] = load1EncFaceFromCicn(9501 + 10 * k + i, false, 1701 + 10 * k + i);
  B.floor = loadEncFaceSetFromPICT(9541, 5, 24, 24, 5, 0, 0, 1741);
  for (const f of B.floor) if (f) f.drawProc = buttonDrawProc;
}

export function setupButtonSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleButtonSprite;
  s.hit = hitButtonSprite;
  s.tileHit = null;
  s.layer = 1;
  switch (s.kind) {
    case 9501: case 9511: setRect(s.hot, 0, -8, 24, 8); break;
    case 9521: case 9531: setRect(s.hot, -8, 0, 8, 24); break;
    case 9541: setRect(s.hot, 0, 0, 18, 18); break;
  }
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
}

const isFloor = (s) => s.kind >= 9541;

export function handleButtonSprite(s) {
  if (!s.behind) { // first frame: start pressed if the record says so
    s.behind = 1;
    if (recOk(s) && recW(s, 6)) s.dir = 9;
  }
  if (s.f92) return;
  if (s.dir < 8 || !recOk(s) || recW(s, 4) !== 1) s.dir--; // springs back unless latched
  if (s.dir < 0) s.dir = 0; else if (s.dir > 9) s.dir = 9;
  if (s.dir < s.f6e && s.f6e === 5) play3DSound(S(isFloor(s) ? 4705 : 4707), 10, 256, s.v, s.h);
  const wall = { 9501: 0, 9511: 1, 9521: 2, 9531: 3 }[s.kind];
  if (wall !== undefined) s.eface = B.wall[wall][s.dir <= 7 ? s.dir >> 1 : 3];
  else if (s.kind === 9541) s.eface = B.floor[s.dir >> 1];
  if (recOk(s)) lv().setW(lv().objOff(s.param) + 6, s.dir >= 7 ? 0 : 1);
  s.f6e = s.dir;
}

const PRESSERS = ['handlePlantSprite', 'handleRobotSprite', 'handleReversorSprite', 'handleBarrelSprite',
  'handleMailGuySprite', 'handleChairSprite'];

export function hitButtonSprite(me, o) {
  if (me.f92 || o.f92) return;
  if ((is(o, 'handlePlayerSprite') && o.hot[1] !== 0) || PRESSERS.some((n) => is(o, n))) {
    if (me.dir === 0) play3DSound(S(isFloor(me) ? 4704 : 4706), 10, 256, me.v, me.h);
    me.dir += 2;
  } else if (is(o, 'handleEnemyShotSprite') || is(o, 'handlePlayerShotSprite')) {
    if (!isFloor(me)) { play3DSound(S(4706), 10, 256, me.v, me.h); me.dir = 9; }
  } else if (is(o, 'handlePlayerSprite') && !isFloor(me)) { // a kick
    const k = PlayerFaces.kickRects[o.dir];
    const kr = [o.posV + k[0], o.posH + k[1], o.posV + k[2], o.posH + k[3]];
    const mr = [me.posV + me.hot[0], me.posH + me.hot[1], me.posV + me.hot[2], me.posH + me.hot[3]];
    if (sectRect(kr, mr)) { play3DSound(S(4706), 10, 256, me.posV, me.posH); me.dir += 10; }
  }
}

// ---------------------------------------------------------------- sliding doors
const SD = { h: [], v: [] }; // g_6b88 (48x16) / g_6b8c (16x44)

export function initSlidingDoorSprite() {
  SD.h = loadEncFaceSetFromPICT(851, 8, 48, 16, 8, 0, 0, 4401);
  SD.v = loadEncFaceSetFromPICT(861, 8, 16, 44, 1, 0, 0, 4451);
  for (const f of [...SD.h, ...SD.v]) if (f) f.drawProc = noScaleDrawProc;
}

const closedRect = (s) => (s.kind === 951 ? setRect(s.hot, 0, 0, 32, 6) : setRect(s.hot, 0, 0, 6, 32));

export function setupSlidingDoorSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleSlidingDoorSprite;
  s.hit = () => {};
  s.tileHit = null;
  s.layer = 5;
  if (s.kind === 951 || s.kind === 961) closedRect(s);
  s.posH = s.h; s.posV = s.v;
  s.behind = 1;
}

// dir 0 = closed .. 14 = open
export function handleSlidingDoorSprite(s) {
  if (s.f92 || !recOk(s)) return;
  const link = recW(s, 4);
  const linked = lv().w(lv().objOff(Math.abs(link)) + 6);
  const closing = link >= 0 ? linked !== 0 : linked === 0;
  if (closing) {
    if (s.dir > 0) {
      if (s.dir === 14) play3DSound(S(4709), 10, 256, s.v, s.h);
      s.dir--;
    }
  } else if (s.dir < 14) {
    if (s.dir === 0) play3DSound(S(4708), 10, 256, s.v, s.h);
    s.dir++;
  }
  if (s.kind === 951) s.eface = SD.h[s.dir >> 1];
  else if (s.kind === 961) s.eface = SD.v[s.dir >> 1];
  else return;
  if (s.dir < 8) closedRect(s); else setRect(s.hot, 0, 0, 0, 0);
}

// ---------------------------------------------------------------- grates (3900/3905 breakable, 3910/3915 retracting)
// f72: hit points; for retracting grates it runs from -100 down to -230 (blinking out, open, blinking back).
const Gr = { h: null, v: null }; // g_6d94 / g_6d98

function grateTintDrawProc(face, s, blit) {
  if (s.layer === 10 && s.kind < 3910) { s.layer = 9; return blit(1, 4); }
  return s.kind < 3910 ? blit(0, 0) : blit(1, 1);
}

export function initGrateSprite() {
  Gr.h = load1EncFaceFromCicn(3900, false, 3401);
  Gr.v = load1EncFaceFromCicn(3905, false, 3402);
  load1EncFaceFromCicn(3900, false, 3403); // (g_6d9c / g_6da0 are loaded but never used)
  load1EncFaceFromCicn(3905, false, 3404);
  for (const f of [Gr.h, Gr.v]) if (f) f.drawProc = grateTintDrawProc;
}

const horizontal = (s) => s.kind === 3900 || s.kind === 3910;

export function setupGrateSprite(s) {
  Hooks.initSprite(s);
  s.f4e = 0; s.f50 = 0;
  s.dir = 0;
  s.task = handleGrateSprite;
  s.hit = hitGrateSprite;
  s.tileHit = null;
  s.layer = 8;
  if (horizontal(s)) setRect(s.hot, -8, 0, 72, 6); else setRect(s.hot, 0, -8, 6, 72);
  if (horizontal(s)) s.eface = Gr.h; else if (s.kind === 3905 || s.kind === 3915) s.eface = Gr.v;
  s.f72 = s.kind < 3910 ? 20 : 4;
  s.f26 = 0;
  s.behind = 0;
  s.posH = s.h; s.posV = s.v;
}

export function handleGrateSprite(s) {
  if (s.f92) return;
  if (s.f72 <= 0) {
    let ch, cv, ah, av, bh, bv; // centre and the two ends
    if (horizontal(s)) { ch = s.posH; cv = s.posV - 29; ah = ch - 16; bh = ch + 16; av = bv = cv; }
    else { ch = s.posH - 29; cv = s.posV; av = cv - 16; bv = cv + 16; ah = bh = ch; }
    if (s.kind < 3910) { // shattered
      s.f92 = 1;
      Hooks.easyExplosion(ah, av, 0, 0, 0, 0);
      Hooks.easyExplosion(bh, bv, 0, 0, 0, 0);
      Hooks.easyExplosion(ch, cv, 0, 0, 0, 4);
      playRegSound(S(602), 20, 256);
      G.score += 600;
    } else {
      if (s.f72 > -100) { playRegSound(S(1200), 15, 256); s.f72 = -100; }
      s.f72--;
      const face = s.kind === 3910 ? Gr.h : s.kind === 3915 ? Gr.v : s.eface;
      if (s.f72 >= -130 && s.f72 <= -100) s.eface = (s.f72 + 130) & 1 ? face : null;   // blinking out
      if (s.f72 < -200 && s.f72 >= -230) s.eface = (s.f72 + 230) & 1 ? face : null;     // blinking back
      if (s.f72 < -230) { s.eface = face; s.f72 = 4; }
    }
  }
  if (s.layer === 9) { s.layer = 8; s.f8a = 1; }
  s.posH = s.h = w16(s.posH + s.f50);
  s.posV = s.v = w16(s.posV + s.f4e);
}

export function hitGrateSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (o.task === Hooks.handleEffectSprite && o.f74 !== 0) {
    if (me.f72 > 0) { me.f72--; me.layer = 10; }
  } else if (o.task === Hooks.handlePlayerSprite && me.f72 < -200) {
    me.f72 = SATRand(2) === 1 ? -226 : -227; // can't close on Harry
  }
}

// ---------------------------------------------------------------- fire pipes (4201 up, 4202 down, 4203 right, 4204 left)
export function setupFirePipeSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleFirePipeSprite;
  s.hit = () => {};
  s.tileHit = null;
  s.layer = 0;
  s.f26 = 0;
  s.f6e = SATRand(100);
  s.posH = s.h; s.posV = s.v;
  s.behind = 1;
}

const FLAME_AT = { 4201: [-3, -49], 4202: [-4, 16], 4203: [16, -2], 4204: [-49, -2] }; // [h, v]

export function handleFirePipeSprite(s) {
  if (s.f92) return;
  if (++s.f6e <= 90 || SATRand(40) !== 1) return;
  const [dh, dv] = FLAME_AT[s.kind] || [0, 0];
  const flame = SATNewSprite(s.kind, s.posH + dh, s.posV + dv, Hooks.setupEffectSprite);
  flame.kind = s.param >= 0 && s.param <= 255 ? G.level.w(G.level.objOff(s.param) + 6) : 0; // flame tint
  flame.f7c = s.kind;
  s.f6e = 0;
  play3DSound(S(700), 8, 256, s.posV, s.posH);
}

register({ initGrateSprite, setupGrateSprite, handleGrateSprite, setupFirePipeSprite, handleFirePipeSprite,
  initButtonSprite, setupButtonSprite, handleButtonSprite,
  initSlidingDoorSprite, setupSlidingDoorSprite, handleSlidingDoorSprite });
