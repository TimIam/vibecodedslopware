// Effect sprites (seg 3 +0x131f6..): explosions and fire-pipe flames, plus EasyExplosion (seg 2).
// An explosion's kind doubles as its tint (-1 = translucent puff, 5 = tint 4); a negative dir delays
// its start. Kinds >= 4200 (with f7c >= 4200) are fire-pipe flames.

import { G } from '../state.js';
import { setRect } from '../../core/util.js';
import { SATNewSprite } from '../../core/sat.js';
import { loadEncFaceSetFromPICT } from '../../core/res.js';
import { Hooks, register } from '../hooks.js';

const E = { boom: [], flameV: [], flameH: [] }; // g_6dd0 (13 x 64x64) / g_6dd4 (24x64) / g_6dd8 (64x24)

function effectTintDrawProc(face, s, blit) {
  const scale = s && s.scaleH !== 256 ? s.scaleH << 5 : 0;
  const tint = G.level.info(0);
  if (tint) return s && s.kind === -1 ? blit(2, scale) : blit(1, tint + scale);
  if (s && s.kind !== 0 && s.f7c < 4200) {
    if (s.kind === -1) return blit(2, scale);
    if (s.kind === 5) return blit(1, scale + 4);
    return blit(1, s.kind + scale);
  }
  return blit(0, scale);
}

export function initEffectSprite() {
  const tint = (fs) => { for (const f of fs) if (f) f.drawProc = effectTintDrawProc; return fs; };
  E.boom = tint(loadEncFaceSetFromPICT(210, 13, 64, 64, 13, 0, 0, 2701));
  E.flameH = tint(loadEncFaceSetFromPICT(216, 32, 64, 24, 1, 0, 0, 2801));
  E.flameV = tint(loadEncFaceSetFromPICT(214, 32, 24, 64, 8, 0, 0, 2901));
}

const flameFace = (kind, dir) => (kind >= 4203
  ? E.flameH[(kind === 4204 ? 16 : 0) + (dir >> 1)]
  : E.flameV[(kind === 4202 ? 16 : 0) + (dir >> 1)]);

export function setupEffectSprite(s) {
  Hooks.initSprite(s);
  s.task = handleEffectSprite;
  s.hit = null;
  s.tileHit = null;
  s.layer = 20;
  s.eface = null;
  s.f6e = 0;
  s.dir = 0;
  s.f74 = 10;
  s.f4e = 0; s.f50 = 0;
  setRect(s.hot, 0, 0, 0, 0);
  if (s.kind >= 4200) {
    s.layer = 0;
    s.behind = 1;
    s.eface = flameFace(s.kind, s.dir);
    switch (s.kind) {
      case 4201: setRect(s.hot, 3, 8, 22, 64); break;
      case 4202: setRect(s.hot, 3, 0, 22, 56); break;
      case 4203: setRect(s.hot, 0, 3, 56, 22); break;
      case 4204: setRect(s.hot, 8, 3, 64, 22); break;
    }
  } else {
    s.behind = 0;
    if (s.dir >= 0) s.eface = E.boom[s.dir];
    if (s.kind > -1) setRect(s.hot, 4, 4, 60, 60);
  }
  s.posH = s.h; s.posV = s.v;
}

export function handleEffectSprite(s) {
  if (s.f92) return;
  if (s.f7c < 4200) {
    s.eface = s.dir >= 0 && s.dir < 26 ? E.boom[(s.dir / 2) | 0] : null;
    if (++s.dir >= 27) s.f92 = 1;
    s.h = s.posH = (s.h + s.f50) << 16 >> 16;
    s.v = s.posV = (s.v + s.f4e) << 16 >> 16;
    return;
  }
  s.dir++;
  if (s.dir === 24) {
    s.f6e++;
    s.dir = s.f6e >= 3 ? 25 : 7;
  } else if (s.dir >= 29) s.f92 = 1;
  s.eface = flameFace(s.f7c, s.dir);
}

// EasyExplosion(h, v, vh, vv, kind, delay) -> sprite
export function easyExplosion(h, v, vh, vv, kind, dir) {
  const s = SATNewSprite(kind, h, v, setupEffectSprite);
  if (s) { s.f50 = vh; s.f4e = vv; s.dir = dir; s.kind = kind; }
  return s;
}

register({ initEffectSprite, setupEffectSprite, handleEffectSprite, easyExplosion });
