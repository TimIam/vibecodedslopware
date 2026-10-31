// The boss (2201, seg 3 +0xaaba..0xe574). He stays put and spins (angle B.angle in 8.8, spin speed
// B.spin), firing as he turns; when he lines up with Harry he stops and fires a three-way burst.
// Phase by hit points: 1 (>= 100) boss shots, 2 (>= 50) pulsing + homing vials, 3 flickering, bigger
// pulses and summoning ghosts, faster bursts. Phase changes play a scream (B.transition counts up from -100).

import { G } from '../state.js';
import { setRect, sectRect } from '../../core/util.js';
import { SATNewSprite, SATRand, SAT } from '../../core/sat.js';
import { loadEncFaceSetFromPICT, load1EncFaceFromCicn } from '../../core/res.js';
import { PlayerFaces } from '../player.js';
import { applyModedImpulse, inverseMode, handleHalfPipe, jumpScale } from '../physics.js';
import { S, play3DSound, play3DSoundPitched, isPlaying, stopSoundRes } from '../sound.js';
import { fadeMusic } from '../music.js';
import { findDesiredToward } from './enemies.js';
import { Hooks, register } from '../hooks.js';

// g_eee phase, g_701a transition, g_701e glow counter, g_7010 timer, g_7012 spin, g_7014 angle,
// g_7018 shot cooldown, g_701c blast cooldown, g_eec pulse direction
const B = { faces: [], phase: 1, transition: 0, glow: 0, timer: 0, spin: 0, angle: 0, cooldown: 0, blastCooldown: 0, growing: false };

function bossTintDrawProc(face, s, blit) {
  const scale = s.scaleH !== 256 ? s.scaleH << 5 : 0;
  if (s.f6e < 0) { // hurt: reddened, more so the closer to the next phase
    let d7 = 7;
    if (B.transition >= 0) {
      let hp = s.f72;
      while (hp > 50) hp -= 50;
      d7 = Math.trunc(0.16 * (50 - hp));
      d7 = Math.max(2, Math.min(8, d7)) - 1;
    }
    blit(3, d7 + scale);
    s.f8a = 1;
    return;
  }
  if (B.glow !== 2 && B.glow !== 6 && B.phase === 2) {
    const t = { 0: 7, 1: 6, 3: 8, 4: 9, 5: 8, 7: 6 }[B.glow];
    if (t !== undefined) blit(1, scale + t);
    return;
  }
  if (B.phase === 3) return blit(1, scale + SATRand(15));
  const tint = G.level.info(0);
  return tint ? blit(1, tint + scale) : blit(0, scale);
}

export function initBossSprite() {
  B.faces = loadEncFaceSetFromPICT(2201, 36, 64, 64, 6, 0, 0, 4902);
  for (const f of B.faces) if (f) f.drawProc = bossTintDrawProc;
  load1EncFaceFromCicn(596, true, 4901);   // g_7006 / g_700a (loaded, unused here)
  load1EncFaceFromCicn(2299, true, 4991);
}

export function setupBossSprite(s) {
  if (s.layer === 10) s.f8a = 1;
  Hooks.initSprite(s);
  s.dir = SATRand(35);
  s.task = handleBossSprite;
  s.hit = hitBossSprite;
  s.tileHit = () => {};
  setRect(s.hot, 8, 8, 56, 56);
  s.f26 = 0;
  s.layer = 7;
  s.f4e = 0; s.f50 = 0;
  s.posH = s.h; s.posV = s.v;
  s.fixH = s.h << 8; s.fixV = s.v << 8;
  s.f6e = 4;
  s.f74 = SATRand(90);
  s.f72 = 150;
  s.eface = B.faces[s.dir];
  s.behind = 1;
  B.timer = 0; B.spin = 0; B.angle = 0; B.phase = 1; B.transition = 0;
  s.f74 = 0;
}

const wrapDir = (d) => (d > 35 ? d - 35 : d < 0 ? d + 35 : d);
const shotSpeed = (shot, mag) => applyModedImpulse(shot, inverseMode(shot.dir), mag); // AssignBossShotSpeed
const pitch = () => SATRand(6000) + 62000;

// One aimed projectile: launched along dir+2 to get it clear of the boss, then re-aimed at dir
function aimedShot(s, kind, after) {
  const shot = SATNewSprite(kind, s.posH + 26, s.posV + 26, Hooks.setupEnemyShotSprite);
  shot.dir = s.dir + 2;
  if (shot.dir > 35) shot.dir -= 35;
  if (after) after(shot, 'pre');
  shotSpeed(shot, 1500);
  shot.fixH += 5 * shot.f50; shot.fixV += 5 * shot.f4e;
  shot.dir = s.dir;
  shot.f4e = 0; shot.f50 = 0;
  shotSpeed(shot, 1500);
  if (after) after(shot, 'post');
  return shot;
}

// Three-way burst: the first shot is launched at dir-2 and its advanced position seeds the other two
function burst(s, speedMul, clearLastDir) {
  const first = SATNewSprite(2291, s.posH + 26, s.posV + 26, Hooks.setupEnemyShotSprite);
  first.dir = s.dir - 2;
  if (first.dir < 0) first.dir += 35;
  shotSpeed(first, 1500);
  first.fixH += 5 * first.f50; first.fixV += 5 * first.f4e;
  const h = first.fixH >> 8, v = first.fixV >> 8;
  first.dir = s.dir;
  first.f4e = 0; first.f50 = 0;
  shotSpeed(first, 1500);
  const mul = (shot) => { if (speedMul !== 1) { shot.f50 = (shot.f50 * speedMul) << 16 >> 16; shot.f4e = (shot.f4e * speedMul) << 16 >> 16; } };
  mul(first);
  const second = SATNewSprite(2291, h, v, Hooks.setupEnemyShotSprite);
  second.dir = s.dir + 2;
  if (second.dir > 35) second.dir -= 35;
  second.f4e = 0; second.f50 = 0;
  shotSpeed(second, 1500);
  mul(second);
  const third = SATNewSprite(2291, h, v, Hooks.setupEnemyShotSprite);
  third.dir = s.dir - 2;
  if (third.dir < 0) third.dir += 35;
  third.f4e = 0; third.f50 = 0;
  shotSpeed(third, 1500);
  mul(third);
  if (clearLastDir) third.dir = 0;
  play3DSoundPitched(S(1002), 100, 256, s.posV, s.posH, pitch());
}

function spinUpDown() {
  if (B.spin === 0) return;
  if (B.spin > 0) {
    if (B.timer < 60 && B.spin < 600) B.spin += 12;
    else if (B.timer > 100 && B.spin > 256) { B.spin -= 12; if (B.spin < 256) B.spin = 256; }
  } else if (B.timer < 60 && B.spin > -600) B.spin -= 12;
  else if (B.timer > 100 && B.spin < -256) { B.spin += 12; if (B.spin > -256) B.spin = -256; }
}

function pulse(s, step, max) {
  if (B.growing) { s.scaleH += step; s.scaleV += step; if (s.scaleH > max) B.growing = false; }
  else { s.scaleH -= step; s.scaleV -= step; if (s.scaleH < 256) B.growing = true; }
  if (G.viewLeft + 224 - s.posH > 200) { s.scaleV = 256; s.scaleH = 256; }
}

function startSpinning() {
  if (B.timer === 0) { if (SATRand(100) < 50) B.spin--; else B.spin++; }
  B.timer++;
}

function turnTail(s) {
  B.angle += B.spin;
  while (B.angle >= 0x2400) B.angle -= 0x2400;
  while (B.angle < 0) B.angle += 0x2400;
  s.dir = Math.max(0, Math.min(35, B.angle >> 8));
  s.eface = B.faces[s.dir];
  s.fixH += s.f50; s.fixV += s.f4e;
  s.h = s.posH = s.fixH >> 8;
  s.v = s.posV = s.fixV >> 8;
}

export function handleBossSprite(s) {
  const oldPhase = B.phase;
  if (s.f92) return;
  G.g700f = 0; G.g700e = 0;
  handleHalfPipe(s, 0x10, null);
  if (s.f8e > 0) jumpScale(s, 0x10, null, null, 0, 0, 0);
  s.f6e++;
  const r = (s.f72 + 2) % 51;
  if (r < s.f6e) { if (r < 45) s.f6e = -2; s.f8a = 1; }
  s.f4e = 0; s.f50 = 0;
  if (B.blastCooldown > 0) B.blastCooldown--;
  if (s.f72 < 0) { s.task = handleBossSpriteDeath; s.f74 = 0; return; }
  B.phase = s.f72 < 50 ? 3 : s.f72 < 100 ? 2 : 1;
  if (oldPhase !== B.phase) B.transition = -100;
  B.glow = (B.glow + 1) % 8;
  if (B.transition < 0) {
    s.dir = wrapDir(s.dir + 2);
    if (B.transition === -98) play3DSoundPitched(S(4901), 100, 256, s.posV, s.posH, 0x7d00);
    B.transition++;
    G.screenShake = (B.transition & 1) + 16;
    s.f6e = -1;
  } else if (B.phase === 1) {
    startSpinning();
    if (Math.abs(B.spin) > 200 && B.cooldown === 0) {
      aimedShot(s, 2281);
      B.cooldown = SATRand(5) + 6;
      play3DSoundPitched(S(300), 100, 256, s.posV, s.posH, pitch());
    }
    if (B.cooldown > 0) B.cooldown--;
    spinUpDown();
    if (B.timer > 120 && findDesiredToward(s) === s.dir) { B.spin = 0; B.timer = -50; }
    if (B.timer === -45 || B.timer === -30 || B.timer === -15) burst(s, 1, true);
  } else if (B.phase === 2) {
    pulse(s, 4, 304);
    startSpinning();
    if (Math.abs(B.spin) > 200 && B.cooldown === 0) {
      aimedShot(s, 1211, (shot, when) => {
        if (when === 'pre') shot.f7c = 1;        // homing vial
        else { shot.f74 = 0; shot.dir = 0; }
      });
      B.cooldown = SATRand(25) + 30;
      play3DSoundPitched(S(300), 100, 256, s.posV, s.posH, pitch());
    }
    if (B.cooldown > 0) B.cooldown--;
    spinUpDown();
    if (B.timer < 0) { s.dir = findDesiredToward(s); B.angle = s.dir << 8; B.spin = 0; }
    if (B.timer > 120 && findDesiredToward(s) === s.dir) { B.spin = 0; B.timer = -50; }
    if ([-45, -35, -25, -15].includes(B.timer)) burst(s, 1, false);
  } else if (B.phase === 3) {
    pulse(s, 12, 448);
    startSpinning();
    if (Math.abs(B.spin) > 200 && B.cooldown === 0) {
      const ghost = SATNewSprite(5011, s.posH + 12, s.posV + 12, Hooks.setupGhostSprite);
      ghost.dir = s.dir;
      ghost.f72 = 0;
      B.cooldown = SATRand(25) + 30;
      play3DSoundPitched(S(300), 100, 256, s.posV, s.posH, pitch());
    }
    if (B.cooldown > 0) B.cooldown--;
    spinUpDown();
    if (B.timer < 0) { s.dir = findDesiredToward(s); B.angle = s.dir << 8; B.spin = 0; }
    if (B.timer > 120 && findDesiredToward(s) === s.dir) { B.spin = 0; B.timer = -50; }
    if ([-45, -35, -25, -15, -5].includes(B.timer)) burst(s, 2, false);
  }
  turnTail(s);
}

export function handleBossSpriteDeath(s) {
  const toward = (v) => (v < 384 ? v + 12 : v > 384 ? v - 12 : v);
  s.scaleH = toward(s.scaleH); s.scaleV = toward(s.scaleV);
  const t = s.f74;
  const boom = () => {
    const v = s.posV - 32 + SATRand(64);
    const h = s.posH - 32 + SATRand(64);
    Hooks.easyExplosion(h, v, 0, 0, 0, 0);
  };
  if (t === 0) {
    for (let o = SAT.head; o; o = o.next) if (o.task === Hooks.handleGhostSprite) o.f72 = -5;
    G.score += 10000;
    Hooks.queueModal(() => fadeMusic(false, 1));
    s.hit = null;
    s.tileHit = null;
    B.spin = 800;
    play3DSoundPitched(S(4901), 100, 256, s.posV, s.posH, 0x84d0);
  } else if (t === 8) play3DSoundPitched(S(4901), 100, 256, s.posV, s.posH, 0x9c40);
  else if (t === 16) play3DSoundPitched(S(4901), 100, 256, s.posV, s.posH, 0x5dc0);
  else if ([50, 54, 58, 66, 70, 74, 78, 80, 84, 88, 92, 96].includes(t)) {
    stopSoundRes(S(602));
    play3DSoundPitched(S(602), 100, 256, s.posV, s.posH, 0xc350);
    boom();
  } else if (t === 114) {
    play3DSoundPitched(S(602), 100, 256, s.posV, s.posH, 0x5dc0);
    for (const d of [-2, 2]) {
      const e = SATNewSprite(0, s.posH + d, s.posV + d, Hooks.setupEffectSprite);
      e.dir = 0; e.layer = 500; e.scaleV = 512; e.scaleH = 512;
    }
    boom(); boom(); boom();
    G.screenShake = 48;
  } else if (t > 120) s.f92 = 1;
  s.f74++;
  turnTail(s);
}

export function hitBossSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (o.task === Hooks.handleEffectSprite) {
    if ((o.hot[1] || o.hot[0] || o.hot[2] || o.hot[3]) && B.blastCooldown === 0) {
      me.f72 -= 6;
      B.blastCooldown = 30;
    }
  } else if (o.task === Hooks.handlePlayerShotSprite) {
    o.f92 = 1;
    me.f72--;
    me.f6e = -1;
    me.f8a = 1;
    if (me.f72 % 8 === 1 && !isPlaying(S(1000)) && !isPlaying(S(1001))) {
      const c = Hooks.spriteCenter(me);
      play3DSound(S(SATRand(100) < 50 ? 1000 : 1001), 15, 256, c.v, c.h);
    }
  } else if (o.task === Hooks.handlePlayerSprite && o.hot[1] === 0) {
    const k = PlayerFaces.kickRects[o.dir];
    const kr = [o.posV + k[0], o.posH + k[1], o.posV + k[2], o.posH + k[3]];
    const mr = [me.posV + me.hot[0], me.posH + me.hot[1], me.posV + me.hot[2], me.posH + me.hot[3]];
    if (sectRect(kr, mr)) {
      const c = Hooks.spriteCenter(me);
      play3DSound(S(600), 15, 256, c.v, c.h);
      me.f72--;
      me.layer = 10;
      G.kickHit = 0x40;
    }
  }
}

register({ initBossSprite, setupBossSprite, handleBossSprite, handleBossSpriteDeath });
