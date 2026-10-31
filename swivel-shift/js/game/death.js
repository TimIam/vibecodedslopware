// HANDLEPLAYERSPRITEDEATH (seg 3 +0x16ea): Harry spins faster and faster, screams (out of comfort) or is
// fired (out of corporate favour), and explodes in a ring of fire. f74 counts frames; at 110 the
// level ends with G.playerDead set.

import { G } from './state.js';
import { SATNewSprite } from '../core/sat.js';
import { PlayerFaces } from './player.js';
import { S, playRegSound } from './sound.js';
import { fadeMusic } from './music.js';
import { Hooks, register } from './hooks.js';

export function handlePlayerSpriteDeath(s) {
  const ch = s.posH + 32, cv = s.posV + 32;
  G.shotType = 0;
  G.firing = 0;
  const t = s.f74;
  if (t === 0) {
    Hooks.queueModal(() => fadeMusic(false, 1)); // (blocks for 24 ticks in the original)
    s.hit = null;
    s.tileHit = null;
    G.curItem = -1;
  } else if (t < 18) s.dir -= 2;
  else if (t === 18) {
    s.dir -= 2;
    if (G.g46be <= 0) playRegSound(S(4901), 100, 256);       // scream
    else if (G.g46ba <= 0) playRegSound(S(4900), 100, 256);  // "you're fired!"
  } else if (t < 31) s.dir -= 3;
  else if (t < 45) s.dir -= 4;
  else if (t === 45) {
    s.dir -= 4;
    Hooks.easyExplosion(s.posH, s.posV, 0, 0, 0, 4);
    const flame = (kind, h, v) => {
      const f = SATNewSprite(kind, h, v, Hooks.setupEffectSprite);
      f.f6e = 3; f.f7c = kind; f.behind = 1;
    };
    flame(4204, ch - 64, cv - 12);
    flame(4203, ch, cv - 12);
    flame(4201, ch - 12, cv - 64);
    flame(4202, ch - 12, cv);
    for (const [dh, dv] of [[-16, -16], [16, -16], [16, 16], [-16, 16]]) {
      const e = Hooks.easyExplosion(s.posH + dh, s.posV + dv, 0, 0, 0, 0);
      if (e) e.behind = 1;
    }
    playRegSound(S(602), 100, 256);
    G.screenShake = 36;
  } else if (t < 52) s.dir -= 5;
  else if (t === 110) {
    G.playerDead = true;
    s.f92 = 1;
  }
  if (s.dir > 35) s.dir -= 35; else if (s.dir < 0) s.dir += 35;
  s.eface = t < 52 ? PlayerFaces.harry[s.dir] : null;
  s.f74++;
}

register({ handlePlayerSpriteDeath });
