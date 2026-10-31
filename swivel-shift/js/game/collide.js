// Sprite-vs-sprite collision helpers (seg 2 / seg 3 / seg 6): RectBounce, RectSeparate, DoorSeparate,
// HandleStairsCollision, HandleRampCollision, HandleExplodeRadius, FindDesiredDirectionGeneric,
// plus the Ouch / HaltTalkingSounds voice helpers.
//
// Coordinates: `where` (s.v/s.h) and the 24.8 fixed position (s.fixV/s.fixH) are used exactly as
// the original does; some routines resync `where` from the fixed position first.

import { G } from './state.js';
import { w16, sectRect } from '../core/util.js';
import { SATRand } from '../core/sat.js';
import { load1EncFaceFromCicn } from '../core/res.js';
import { maskFromFace } from './masks.js';
import { rectBounceFake, applyModedImpulse } from './physics.js';
import { S, playRegSound, isPlaying, stopSoundRes, peDistance } from './sound.js';
import { register } from './hooks.js';

const PLAYER_KIND = 0x45;

// RectBounce(s, o, off, bounce, hot): bounce s off o's hot rect (pos based)
export function rectBounce(s, o, off, b, hot) {
  rectBounceFake(s, o.posV, o.posH, o.hot, off, b, hot);
}

// RectSeparate(s, o) -> side index: push s (where) out of o along the axis of least overlap
export function rectSeparate(s, o) {
  const a = [s.hot[0] + s.v, s.hot[1] + s.h, s.hot[2] + s.v, s.hot[3] + s.h];
  const b = [o.hot[0] + o.v, o.hot[1] + o.h, o.hot[2] + o.v, o.hot[3] + o.h];
  const d = [b[0] - a[2], b[2] - a[0], b[3] - a[1], b[1] - a[3]];
  let best = 0, min = Math.abs(d[0]);
  for (let i = 1; i < 4; i++) if (Math.abs(d[i]) < min) { best = i; min = Math.abs(d[i]); }
  if (best < 2) s.v = w16(s.v + d[best]); else s.h = w16(s.h + d[best]);
  return best;
}

// DoorSeparate(s, door): keep s on its side of a closed door
export function doorSeparate(s, o) {
  const cH = s.h + 32, cV = s.v + 32; // note: computed before the resync below, as in the original
  const R = [o.hot[0] + o.v, o.hot[1] + o.h, o.hot[2] + o.v, o.hot[3] + o.h];
  s.h = s.fixH >> 8; s.v = s.fixV >> 8;
  const oh = s.h, ov = s.v;
  const k = o.kind;
  if (k === 901 || k === 903 || k === 911 || k === 913) {
    const mid = o.v + ((o.hot[2] + o.hot[0]) >> 1);
    if (mid > cV) { if (s.v > R[0] - s.hot[2]) s.v = R[0] - s.hot[2]; }
    else if (s.v < R[2] - s.hot[0]) s.v = R[2] - s.hot[0];
  } else if (k === 921 || k === 923 || k === 931 || k === 933) {
    const mid = o.h + ((o.hot[3] + o.hot[1]) >> 1);
    if (mid > cH) { if (s.h > R[1] - s.hot[3]) s.h = R[1] - s.hot[3]; }
    else if (s.h < R[3] - s.hot[1]) s.h = R[3] - s.hot[1];
  }
  if (oh !== s.h) s.fixH = s.h << 8;
  if (ov !== s.v) s.fixV = s.v << 8;
}

// HandleStairsCollision(s, off, hot, stairs): climbing onto stairs from the open side starts the
// stairs ride (f8e = 200, f90 = stairs kind); anything else bounces off.
export function handleStairsCollision(s, off, hot, o) {
  const h = s.posH + off, v = s.posV + off;
  const ride = () => { s.f8e = 200; s.f90 = o.kind; };
  switch (o.kind) {
    case 9901:
      if (v < o.posV + 22 && s.f4e > 0) { if (v > o.posV - 4) { ride(); s.f50 = 0; } return; }
      break;
    case 9902:
      if (v > o.posV + 10 && s.f4e < 0) { if (v < o.posV + 36) { ride(); s.f50 = 0; } return; }
      break;
    case 9903:
      if (h < o.posH + 22 && s.f50 > 0) { if (h > o.posH - 4) { ride(); s.f4e = 0; } return; }
      break;
    case 9904:
      if (h > o.posH + 10 && s.f50 < 0) { if (h < o.posH + 36) { ride(); s.f4e = 0; } return; }
      break;
    default: return;
  }
  rectBounce(s, o, off, G.bounciness, hot);
}

// HandleRampCollision(s, off, hot, ramp, crashSnd). Ramps 9701/9702 run vertically (enter from the
// bottom / top), 9703/9704 horizontally (enter from the left / right).
export function handleRampCollision(s, off, hot, o, snd) {
  if (s.f94 > 0) return;
  const l12 = (s.fixH >> 8) + off, l14 = (s.fixV >> 8) + off;
  s.h = s.fixH >> 8; s.v = s.fixV >> 8;
  o.h = o.fixH >> 8; o.v = o.fixV >> 8;
  const oL = o.h + o.hot[1], oR = o.h + o.hot[3], oT = o.v + o.hot[0], oB = o.v + o.hot[2];
  const sL = s.h + hot[1], sR = s.h + hot[3], sT = s.v + hot[0], sB = s.v + hot[2];
  const b = G.bounciness;
  const reflect = (x) => w16(-((x * b) >> 9));
  const push = s.kind !== PLAYER_KIND ? 15 : 30;
  const crash = () => { playRegSound(snd, 100, 256); s.f8e = 1; };
  const setV = () => { s.fixV = s.v << 8; };
  const setH = () => { s.fixH = s.h << 8; };
  let side = false;

  if (o.kind === 9701 || o.kind === 9702) {
    const mid = (oR + oL) >> 1;
    if (l12 < mid && s.f50 > 0 && l12 < mid - 8) side = true;
    if (l12 >= mid && s.f50 < 0 && l12 >= mid + 8) side = true;
    if (o.kind === 9701) {
      if (side && sT > oB - 13) side = false;
      if (!side) {
        if (sB <= oT + 15) {
          if (s.f4e < 0) {
            if (s.f4e < -450) crash();
            else { s.f4e = 0; s.v = w16(s.v + (oT + 16) - sB); setV(); }
          } else if (sB <= oT + 6) {
            s.v = w16(s.v - (oT - sB + 1)); setV();
            s.f4e = reflect(s.f4e); s.f94 = 3;
          }
        } else {
          if (l12 < mid) { s.h++; setH(); s.f50 = Math.trunc(s.f50 / 2); }
          else if (l12 > mid) { s.h--; setH(); s.f50 = Math.trunc(s.f50 / 2); }
          s.f4e = w16(s.f4e + push);
        }
      }
    } else {
      if (side && sB < oT + 13) side = false;
      if (!side) {
        if (sT >= oB - 15) {
          if (s.f4e > 0) {
            if (s.f4e > 450) crash();
            else { s.f4e = 0; s.v = w16(s.v - (sT - (oB - 16))); setV(); }
          } else if (sT >= oB - 6) {
            s.v = w16(s.v + (oB - sT + 1)); setV();
            s.f4e = reflect(s.f4e); s.f94 = 3;
          }
        } else {
          if (l12 < mid) { s.h++; setH(); s.f50 = Math.trunc(s.f50 / 2); }
          else if (l12 > mid) { s.h--; setH(); s.f50 = Math.trunc(s.f50 / 2); }
          s.f4e = w16(s.f4e - push);
        }
      }
    }
    if (side) {
      if (s.f50 > 0) s.h = w16(s.h - (sR - oL + 1));
      else if (s.f50 < 0) s.h = w16(s.h + (oR - sL + 1));
      setH();
      o.f50 = w16(o.f50 + (s.f50 >> 1));
      s.f50 = reflect(s.f50); s.f94 = 3;
    }
    return;
  }

  if (o.kind === 9703 || o.kind === 9704) {
    const mid = (oB + oT) >> 1;
    if (l14 < mid && s.f4e > 0 && l14 < mid - 8) side = true;
    if (l14 >= mid && s.f4e < 0 && l14 >= mid + 8) side = true;
    if (side && sL > oR - 13) side = false; // (same test for both directions in the original)
    if (!side) {
      const nudge = () => {
        if (l14 < mid) { s.v++; setV(); s.f4e = Math.trunc(s.f4e / 2); }
        else if (l14 > mid) { s.v--; setV(); s.f4e = Math.trunc(s.f4e / 2); }
      };
      if (o.kind === 9703) {
        if (sR <= oL + 15) {
          if (s.f50 < 0) {
            if (s.f50 < -450) crash();
            else { s.f50 = 0; s.h = w16(s.h + (oL + 16) - sR); setH(); }
          } else if (sR <= oL + 6) {
            s.fixH -= (oL - sR + 1) << 8; // where.h is not updated here
            s.f50 = reflect(s.f50); s.f94 = 3;
          }
        } else { nudge(); s.f50 = w16(s.f50 + push); }
      } else {
        if (sL >= oR - 15) {
          if (s.f50 > 0) {
            if (s.f50 > 450) crash();
            else { s.f50 = 0; s.h = w16(s.h - (sL - (oR - 16))); setH(); }
          } else if (sL >= oR - 6) {
            s.h = w16(s.h + (oR - sL + 1)); // fixH is not updated here
            s.f50 = reflect(s.f50); s.f94 = 3;
          }
        } else { nudge(); s.f50 = w16(s.f50 - push); }
      }
    }
    if (side) {
      if (s.f4e > 0) s.v = w16(s.v - (sB - oT + 1));
      else if (s.f4e < 0) s.v = w16(s.v + (oB - sT + 1));
      setV();
      o.f4e = w16(o.f4e + (s.f4e >> 1));
      s.f4e = reflect(s.f4e); s.f94 = 3;
    }
  }
}

// FindDesiredDirectionGeneric(fromV, fromH, toV, toH) -> 0..35: the angle from `from` to `to`,
// counter-clockwise from east in 10 degree steps (a tangent ladder; in IMPULSE terms, where 0 is
// west, it points away from `to`).
const TAN = [0.0875, 0.2675, 0.4663, 0.7002, 1.0, 1.4281, 2.1445, 3.7320, 11.43];
const TAN_NEG = [-11.43, -3.7320, -2.1445, -1.4281, -1.0, -0.7002, -0.4663, -0.2679, -0.0875];
const f32 = Math.fround;
export function findDesiredDirectionGeneric(fromV, fromH, toV, toH) {
  if (toH === fromH) toH++;
  if (toV === fromV) toV++;
  const dx = f32(toH - fromH), dy = f32(fromV - toV);
  const t = f32(dy / dx);
  const ladder = (base) => {
    const th = t >= 0 ? TAN : TAN_NEG;
    for (let i = 0; i < 9; i++) if (t < th[i]) return base + i;
    return base + 9;
  };
  if (dy > 0) return dx > 0 ? ladder(0) : ladder(9);
  if (dx < 0) return ladder(18);
  const d = ladder(27);
  return d === 36 ? 0 : d;
}

// HandleExplodeRadius(s, off, explosion): push s away from an explosion within 32 px
export function handleExplodeRadius(s, off, o) {
  if (o.f7c >= 0x1068 || s.f96 > 0) return;
  s.f96 = 30;
  const h = s.posH + off, v = s.posV + off;
  const eh = o.posH + 32, ev = o.posV + 32;
  const dist = peDistance(v - ev, h - eh);
  if (dist >= 32) return;
  const mag = Math.min(32 - dist, 16);
  applyModedImpulse(s, findDesiredDirectionGeneric(v, h, ev, eh), w16(mag << 7));
}

// VBounce / HBounce / GrateBounce(s, grate, off, bounce, hot): bounce off a grate's hot rect on one axis
function axisBounce(s, o, off, b, hot, vertical) {
  const R = [o.posV + o.hot[0], o.posH + o.hot[1], o.posV + o.hot[2], o.posH + o.hot[3]];
  const H = [s.posV + hot[0], s.posH + hot[1], s.posV + hot[2], s.posH + hot[3]];
  if (!sectRect(H, R)) return;
  const oh = s.posH, ov = s.posV;
  if (vertical) {
    const scale = () => { s.f50 = w16((s.f50 * b) >> 8); s.f4e = w16((-(s.f4e * b)) >> 8); };
    const cV = o.hot[0] + o.posV + ((o.hot[2] - o.hot[0]) >> 1);
    if (s.posV + off < cV) { if (s.f4e > 0) scale(); s.posV = R[0] - hot[2]; }
    else { if (s.f4e < 0) scale(); s.posV = R[2] - hot[0]; }
  } else {
    const scale = () => { s.f50 = w16((-(s.f50 * b)) >> 8); s.f4e = w16((s.f4e * b) >> 8); };
    const cH = o.hot[1] + o.posH + ((o.hot[3] - o.hot[1]) >> 1);
    if (s.posH + off < cH) { if (s.f50 > 0) scale(); s.posH = R[1] - hot[3]; }
    else { if (s.f50 < 0) scale(); s.posH = R[3] - hot[1]; }
  }
  if (oh !== s.posH) s.fixH = s.posH << 8;
  if (ov !== s.posV) s.fixV = s.posV << 8;
}
export const vBounce = (s, o, off, b, hot) => axisBounce(s, o, off, b, hot, true);
export const hBounce = (s, o, off, b, hot) => axisBounce(s, o, off, b, hot, false);
export function grateBounce(s, o, off, b, hot) {
  if (o.kind === 3900 || o.kind === 3910) vBounce(s, o, off, b, hot);
  else hBounce(s, o, off, b, hot);
}

// HaltTalkingSounds / Ouch
const TALK = [220, 225, 226, 223, 224, 150, 151, 152, 210, 211, 212, 218, 219];
export function haltTalkingSounds() { for (const id of TALK) stopSoundRes(S(id)); }

export function ouch() {
  haltTalkingSounds();
  if (isPlaying(G.talkRef) || isPlaying(G.talkRef2) || G.caffeine) return;
  const r = SATRand(100);
  G.talkRef = playRegSound(S(r < 43 ? 220 : r < 86 ? 225 : 226), 10, 256);
}

// Desk collision masks (g_8262 / g_8266: cicn 300 / 310)
const deskMasks = [];
export function deskMask(i) {
  if (!deskMasks[i]) deskMasks[i] = maskFromFace(load1EncFaceFromCicn(i ? 310 : 300, true, i ? 6022 : 6021));
  return deskMasks[i];
}

register({ rectBounce, rectSeparate, doorSeparate, handleStairsCollision, handleRampCollision,
  findDesiredDirectionGeneric, handleExplodeRadius, haltTalkingSounds, ouch, deskMask,
  vBounce, hBounce, grateBounce });
