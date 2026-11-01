// Movement & collision physics ported from seg 2 (ApplyModedImpulse, EnforceMaxSpeed, WallBounce,
// BGTileBounce, RectBounceFake, HandleHalfPipe, JumpScale ...).
// Sprite velocity: s.f50 = vh, s.f4e = vv (1/256 px per frame). Position fixed: s.fixH / s.fixV (<<8).

import { G } from './state.js';
import { w16, sectRect } from '../core/util.js';
import { SATRand } from '../core/sat.js';
import { regionBounce } from './masks.js';
import { Tiles } from './tiles.js';
import { playRegSound, S } from './sound.js';

// ApplyModedImpulse: 36 directions; constants are the 3-decimal literals of the original source
// (computed exactly with integer thousandths, like SANE's extended precision did).
// [kh, kv] in thousandths; dir 0 = west, 9 = south, 18 = east, 27 = north.
const K = [1000, 985, 940, 866, 766, 643, 500, 342, 174, 0];
export const IMPULSE = [];
for (let d = 0; d < 36; d++) {
  const q = Math.floor(d / 9), i = d % 9;
  let kh, kv;
  if (q === 0) { kh = -K[i]; kv = K[9 - i]; }
  else if (q === 1) { kh = K[9 - i]; kv = K[i]; }
  else if (q === 2) { kh = K[i]; kv = -K[9 - i]; }
  else { kh = -K[9 - i]; kv = -K[i]; }
  IMPULSE.push([kh, kv]);
}
function addScaled(v, k, mag) {
  if (k === 0) return v;
  if (k === 1000) return w16(v + mag);
  if (k === -1000) return w16(v - mag);
  return w16(Math.trunc((v * 1000 + k * mag) / 1000));
}
export function applyModedImpulse(s, dir, mag) {
  if (dir < 0 || dir > 35) return;
  const [kh, kv] = IMPULSE[dir];
  s.f50 = addScaled(s.f50, kh, mag);
  s.f4e = addScaled(s.f4e, kv, mag);
}

export const inverseMode = (d) => (d >= 18 ? d - 18 : d + 18);

// ApproachMode(s, target): rotate s.dir one step toward target the short way round
export function approachMode(s, target) {
  if (target === s.dir) return;
  let d3 = s.dir - target;
  let up = d3 < 0;
  if (Math.abs(d3) > 18) up = !up;
  if (up) s.dir++; else s.dir--;
  if (s.dir > 35) s.dir = 0; else if (s.dir < 0) s.dir = 35;
}

export function enforceMaxSpeed(s, max) {
  if (Math.abs(s.f50) > max) {
    s.f4e = w16(Math.trunc((s.f4e * max) / Math.abs(s.f50)));
    s.f50 = s.f50 > 0 ? max : -max;
  }
  if (Math.abs(s.f4e) > max) {
    s.f50 = w16(Math.trunc((s.f50 * max) / Math.abs(s.f4e)));
    s.f4e = s.f4e > 0 ? max : -max;
  }
}

// -((v*b)>>8) style helpers (WallBounce / BGTileBounce use asr then neg)
const sc = (v, b) => (v * b) >> 8;

// WallBounce(s, kind, cellV, cellH, off, b, hot, spriteMask, flag) -> moved
// `off` is a number, or [offV, offH] for the *2 variants (WallBounce2 etc.) that take a Point.
const offV = (off) => (typeof off === 'number' ? off : off[0]);
const offH = (off) => (typeof off === 'number' ? off : off[1]);

export function wallBounce(s, kind, cellV, cellH, off, b, hot, spriteMask, flag) {
  if (kind < 0 || kind >= 56) return false;
  let moved = false, d4 = 3, d5 = kind;
  const cH = cellH + 16, cV = cellV + 16;
  let lh = s.posH + offH(off), lv = s.posV + offV(off); // computed before any separation
  const bH = () => { s.f50 = w16(-sc(s.f50, b)); s.f4e = w16(sc(s.f4e, b)); };
  const bV = () => { s.f50 = w16(sc(s.f50, b)); s.f4e = w16(-sc(s.f4e, b)); };
  const hotAbs = [s.posV + hot[0], s.posH + hot[1], s.posV + hot[2], s.posH + hot[3]];
  const touch = (l, t, r, bt) => sectRect(hotAbs, [t, l, bt, r]);
  let corner = false;

  const quarter = (cornerD5, hRef, vRef, hSign, vSign) => {
    // generic body of cases 4..7
    if (!regionBounce(s, cellV, cellH, spriteMask, Tiles.masks[kind])) return null;
    s.posH = s.h; s.posV = s.v;
    moved = true;
    const dd4 = hSign > 0 ? hRef - lh : lh - hRef;  // horizontal distance
    const dd5 = vSign > 0 ? vRef - lv : lv - vRef;
    return [dd4, dd5];
  };

  switch (kind) {
    case 0:
      if (s.f50 < 0 && flag) bH();
      s.posH = cH - hot[1]; moved = true; break;
    case 1:
      if (s.f4e < 0) bV();
      s.posV = cV - hot[0]; moved = true; break;
    case 2:
      if (s.f50 > 0) bH();
      s.posH = cH - hot[3]; moved = true; break;
    case 3:
      if (s.f4e > 0) bV();
      s.posV = cV - hot[2]; moved = true; break;
    case 4: { // bottom-left quarter
      const r = quarter(12, cellH, cellV + 32, -1, +1); if (!r) return false;
      const [a, c] = r;
      if (a > c) {
        if (c > 8 && s.f50 < 0) { d4 = 3; d5 = 12; corner = true; break; }
        if (s.f50 < 0) bH();
        s.posH = cH - hot[1];
      } else {
        if (a > 8 && s.f4e > 0) { d4 = 3; d5 = 12; corner = true; break; }
        if (s.f4e > 0) bV();
        s.posV = cV - hot[2];
      }
      break;
    }
    case 5: { // top-left quarter
      const r = quarter(13, cellH, cellV, -1, -1); if (!r) return false;
      const [a, c] = r;
      if (a > c) {
        if (c > 8 && s.f50 < 0) { d4 = 3; d5 = 13; corner = true; break; }
        if (s.f50 < 0) bH();
        s.posH = cH - hot[1];
      } else {
        if (a > 8 && s.f4e < 0) { d4 = 3; d5 = 13; corner = true; break; }
        if (s.f4e < 0) bV();
        s.posV = cV - hot[0];
      }
      break;
    }
    case 6: { // top-right quarter
      const r = quarter(14, cellH + 32, cellV, +1, -1); if (!r) return false;
      const [a, c] = r;
      if (a > c) {
        if (c > 8 && s.f50 > 0) { d4 = 3; d5 = 14; corner = true; break; }
        if (s.f50 > 0) bH();
        s.posH = cH - hot[3];
      } else {
        if (a > 8 && s.f4e < 0) { d4 = 3; d5 = 14; corner = true; break; }
        if (s.f4e < 0) bV();
        s.posV = cV - hot[0];
      }
      break;
    }
    case 7: { // bottom-right quarter
      const r = quarter(15, cellH + 32, cellV + 32, +1, +1); if (!r) return false;
      const [a, c] = r;
      if (a > c) {
        if (c > 8 && s.f50 > 0) { d4 = 3; d5 = 15; corner = true; break; }
        if (s.f50 > 0) bH();
        s.posH = cH - hot[3];
      } else {
        if (a > 8 && s.f4e > 0) { d4 = 3; d5 = 15; corner = true; break; }
        if (s.f4e > 0) bV();
        s.posV = cV - hot[2];
      }
      break;
    }
    case 10: { // left + bottom halves (L)
      if (!touch(cellH, cellV, cellH + 16, cellV + 32) && !touch(cellH, cellV + 16, cellH + 32, cellV + 32)) break;
      lh = s.posH + offH(off); lv = s.posV + offV(off);
      const a = lh - cellH, c = cellV + 32 - lv;
      if (a < c) { if (s.f50 < 0) bH(); s.posH = cH - hot[1]; }
      else { if (s.f4e > 0) bV(); s.posV = cV - hot[2]; }
      if (s.posH < cH - hot[1]) s.posH = cH - hot[1];
      if (s.posV > cV - hot[2]) s.posV = cV - hot[2];
      moved = true; break;
    }
    case 11: { // top + left halves
      if (!touch(cellH, cellV, cellH + 32, cellV + 16) && !touch(cellH, cellV, cellH + 16, cellV + 32)) break;
      lh = s.posH + offH(off); lv = s.posV + offV(off);
      const a = lh - cellH, c = lv - cellV;
      if (a < c) { if (s.f50 < 0) bH(); s.posH = cH - hot[1]; }
      else { if (s.f4e < 0) bV(); s.posV = cV - hot[0]; }
      if (s.posH < cH - hot[1]) s.posH = cH - hot[1];
      if (s.posV < cV - hot[0]) s.posV = cV - hot[0];
      moved = true; break;
    }
    case 8: { // top + right halves
      if (!touch(cellH, cellV, cellH + 32, cellV + 16) && !touch(cellH + 16, cellV, cellH + 32, cellV + 32)) break;
      lh = s.posH + offH(off); lv = s.posV + offV(off);
      const a = cellH + 32 - lh, c = lv - cellV;
      if (a < c) { if (s.f50 > 0) bH(); s.posH = cH - hot[3]; }
      else { if (s.f4e < 0) bV(); s.posV = cV - hot[0]; }
      if (s.posH > cH - hot[3]) s.posH = cH - hot[3];
      if (s.posV < cV - hot[0]) s.posV = cV - hot[0];
      moved = true; break;
    }
    case 9: { // bottom + right halves
      if (!touch(cellH, cellV + 16, cellH + 32, cellV + 32) && !touch(cellH + 16, cellV, cellH + 32, cellV + 32)) break;
      lh = s.posH + offH(off); lv = s.posV + offV(off);
      const a = cellH + 32 - lh, c = cellV + 32 - lv;
      if (a < c) { if (s.f50 > 0) bH(); s.posH = cH - hot[3]; }
      else { if (s.f4e > 0) bV(); s.posV = cV - hot[2]; }
      if (s.posH > cH - hot[3]) s.posH = cH - hot[3];
      if (s.posV > cV - hot[2]) s.posV = cV - hot[2];
      moved = true; break;
    }
    default: {
      if (kind < 12 || kind >= 32) break;
      s.h = s.posH; s.v = s.posV;
      if (!regionBounce(s, cellV, cellH, spriteMask, Tiles.masks[kind])) break;
      s.posH = s.h; s.posV = s.v;
      lh = s.posH + offH(off); lv = s.posV + offV(off);
      moved = true;
      corner = true;
      const L = lh < cH, U = lv < cV;
      switch (kind) {
        case 16: if (L) d4 = 2; else { d4 = 3; d5 = 12; } break;
        case 17: if (U) d4 = 1; else { d4 = 3; d5 = 13; } break;
        case 18: if (L) { d4 = 3; d5 = 14; } else d4 = 2; break;
        case 19: if (U) { d4 = 3; d5 = 15; } else d4 = 1; break;
        case 20: if (U) { d4 = 3; d5 = 12; } else d4 = 1; break;
        case 21: if (L) d4 = 2; else { d4 = 3; d5 = 13; } break;
        case 22: d4 = U ? 1 : 3; d5 = 14; break;
        case 23: if (L) { d4 = 3; d5 = 15; } else d4 = 2; break;
        case 24: if (L) { d4 = 3; d5 = 12; } else d4 = 2; break;
        case 25: if (U) d4 = 1; else { d4 = 3; d5 = 13; } break;
        case 26: if (L) d4 = 2; else { d4 = 3; d5 = 14; } break;
        case 27: if (U) d4 = 1; else { d4 = 3; d5 = 15; } break;
        case 28: if (U) d4 = 1; else { d4 = 3; d5 = 12; } break;
        case 29: if (L) { d4 = 3; d5 = 13; } else d4 = 2; break;
        case 30: if (U) { d4 = 3; d5 = 14; } else d4 = 1; break;
        case 31: if (L) d4 = 2; else { d4 = 3; d5 = 15; } break;
        default: break; // 12..15: diagonal, d4 = 3, d5 = kind
      }
    }
  }
  if (corner) {
    if (d4 === 1) { s.f50 = w16(-sc(s.f50, b)); s.f4e = w16(sc(s.f4e, b)); }
    else if (d4 === 2) { s.f50 = w16(sc(s.f50, b)); s.f4e = w16(-sc(s.f4e, b)); }
    else if (d4 === 3) {
      if (d5 >= 12 && d5 <= 15) {
        if (d5 === 13 || d5 === 15) { const t = s.f4e; s.f4e = s.f50; s.f50 = t; }
        else { const t = s.f4e; s.f4e = w16(-s.f50); s.f50 = w16(-t); }
      }
      s.f50 = w16(-sc(s.f50, b));
      s.f4e = w16(-sc(s.f4e, b));
    }
  }
  if (moved) { s.fixH = s.posH << 8; s.fixV = s.posV << 8; }
  return moved;
}

// BGTileBounce(s, kind, cellV, cellH, off, b, hot, spriteMask, flag) -> bounced.
// With a Point offset this is BGTileBounce2, whose corner test only checks one FG kind per side.
export function bgTileBounce(s, kind, cellV, cellH, off, b, hot, spriteMask, flag) {
  const v2 = typeof off !== 'number';
  const loc2 = cellH + 16, loc4 = cellV + 16;
  if (!regionBounce(s, cellV, cellH, spriteMask, Tiles.bgMask)) return false;
  const lh = s.posH + offH(off), lv = s.posV + offV(off);
  const d3 = Math.abs(loc2 - lh), dd4 = Math.abs(loc4 - lv);
  let d4;
  if (d3 > dd4) {
    s.f50 = w16(-sc(s.f50, b)); s.f4e = w16(sc(s.f4e, b));
    d4 = lh > loc2 ? 1 : 2;
  } else {
    s.f50 = w16(sc(s.f50, b)); s.f4e = w16(sc(s.f4e, b));
    d4 = lv > loc4 ? 4 : 3;
  }
  const col = cellH >> 5, row = cellV >> 5;
  const fk = (c, r) => Tiles.lookupFGKind(G.level.fg(c, r));
  if (d4 === 1) { const k = fk(col + 1, row); if (k === 2 || (!v2 && (k === 7 || k === 6))) d4 = lv > loc4 ? 4 : 3; }
  else if (d4 === 2) { const k = fk(col - 1, row); if (k === 0 || (!v2 && (k === 4 || k === 5))) d4 = lv > loc4 ? 4 : 3; }
  else if (d4 === 3) { const k = fk(col, row - 1); if (k === 1 || (!v2 && (k === 6 || k === 5))) d4 = lh > loc2 ? 1 : 2; }
  else if (d4 === 4) { const k = fk(col, row + 1); if (k === 3 || (!v2 && (k === 7 || k === 4))) d4 = lh > loc2 ? 1 : 2; }
  switch (d4) {
    case 1:
      if (flag) { s.f50 = w16(sc(s.f50, b)); s.f4e = w16(sc(s.f4e, b)); if (s.f50 < 0) s.f50 = -s.f50; }
      if (s.posH < loc2 + 14 - hot[1]) s.posH = loc2 + 14 - hot[1];
      break;
    case 2:
      if (flag) { s.f50 = w16(sc(s.f50, b)); s.f4e = w16(sc(s.f4e, b)); if (s.f50 > 0) s.f50 = -s.f50; }
      if (s.posH > loc2 - 14 - hot[3]) s.posH = loc2 - 14 - hot[3];
      break;
    case 4:
      if (flag) { s.f50 = w16(sc(s.f50, b)); s.f4e = w16(-sc(s.f4e, b)); if (s.f4e < 0) s.f4e = -s.f4e; }
      if (s.posV < loc4 + 14 - hot[0]) s.posV = loc4 + 14 - hot[0];
      break;
    case 3:
      if (flag) { s.f50 = w16(sc(s.f50, b)); s.f4e = w16(sc(s.f4e, b)); if (s.f4e > 0) s.f4e = -s.f4e; }
      if (s.posV > loc4 - 14 - hot[2]) s.posV = loc4 - 14 - hot[2];
      break;
  }
  s.fixH = s.posH << 8; s.fixV = s.posV << 8;
  return true;
}

// RectBounceFake(s, ptV, ptH, rect, off, b, hot): bounce off rect (offset by pt); uses (-(v*b))>>8.
export function rectBounceFake(s, ptV, ptH, rect, off, b, hot) {
  const R = [rect[0] + ptV, rect[1] + ptH, rect[2] + ptV, rect[3] + ptH];
  const H = [s.posV + hot[0], s.posH + hot[1], s.posV + hot[2], s.posH + hot[3]];
  if (!sectRect(H, R)) return;
  const l2 = s.posH + offH(off), l4 = s.posV + offV(off);
  const c6 = rect[1] + ptH + ((rect[3] - rect[1]) >> 1);
  const c8 = rect[0] + ptV + ((rect[2] - rect[0]) >> 1);
  const oh = s.posH, ov = s.posV;
  const nH = () => { s.f50 = w16((-(s.f50 * b)) >> 8); s.f4e = w16((s.f4e * b) >> 8); };
  const nV = () => { s.f50 = w16((s.f50 * b) >> 8); s.f4e = w16((-(s.f4e * b)) >> 8); };
  if (l2 < c6) {
    if (l4 < c8) {
      if (c6 - l2 > c8 - l4) { if (s.f50 > 0) nH(); s.posH = R[1] - hot[3]; }
      else { if (s.f4e > 0) nV(); s.posV = R[0] - hot[2]; }
    } else {
      if (c6 - l2 > l4 - c8) { if (s.f50 > 0) nH(); s.posH = R[1] - hot[3]; }
      else { if (s.f4e < 0) nV(); s.posV = R[2] - hot[0]; }
    }
  } else {
    if (l4 < c8) {
      if (l2 - c6 > c8 - l4) { if (s.f50 < 0) nH(); s.posH = R[3] - hot[1]; }
      else { if (s.f4e > 0) nV(); s.posV = R[0] - hot[2]; }
    } else {
      if (l2 - c6 > l4 - c8) { if (s.f50 < 0) nH(); s.posH = R[3] - hot[1]; }
      else { if (s.f4e < 0) nV(); s.posV = R[2] - hot[0]; }
    }
  }
  if (oh !== s.posH) s.fixH = s.posH << 8;
  if (ov !== s.posV) s.fixV = s.posV << 8;
}

// HandleHalfPipe(s, off, jumpSnd)
export function handleHalfPipe(s, off, jumpSnd) {
  let d5 = 0x90, d6 = 0x30;
  const l2 = (s.fixH >> 8) + off, l4 = (s.fixV >> 8) + off;
  const col = l2 >> 5, row = l4 >> 5;
  const ca = (col << 5) + 16, cc = (row << 5) + 16;
  const k = Tiles.lookupBGKind(G.level.bg(col, row));
  if (s.f8e !== 0 && (s.f8e <= 23 || s.f8e >= 200)) {
    s.f98 = col; s.f9a = row; s.f9c = k; return;
  }
  let jump = false;
  if (k >= 8) {
    let d4 = k >= 12 ? cc - l4 : ca - l2;
    if (s !== G.player) { d5 = 0x60; d6 = 0x20; d4 += d4; } else d4 *= 3;
    switch (k - 8) {
      case 0: s.f50 = w16(s.f50 + d5 + d4); break;
      case 1: s.f50 = w16(s.f50 + d6 + d4); break;
      case 2: s.f50 = w16(s.f50 - (d6 - d4)); break;
      case 3: s.f50 = w16(s.f50 - (d5 - d4)); break;
      case 4: s.f4e = w16(s.f4e + d5 + d4); break;
      case 5: s.f4e = w16(s.f4e + d6 + d4); break;
      case 6: s.f4e = w16(s.f4e - (d6 - d4)); break;
      case 7: s.f4e = w16(s.f4e - (d5 - d4)); break;
    }
  }
  const prev = s.f9c;
  if (prev >= 8 && prev <= 15) {
    if (prev === 8) { if (k !== 8 && s.f50 < 0) jump = true; }
    else if (prev === 11) { if (k !== 11 && s.f50 > 0) jump = true; }
    else if (prev === 12) { if (k !== 12 && s.f4e < 0) jump = true; }
    else if (prev === 15) { if (k !== 15 && s.f4e > 0) jump = true; }
  } else {
    let lip = (k === 8 && l2 < ca && s.f50 > 0) || (k === 11 && l2 > ca && s.f50 < 0) ||
      (k === 15 && l4 > cc && s.f4e < 0) || (k === 12 && l4 < cc && s.f4e > 0);
    if (lip) {
      s.f8e = 0xd7;
      if (k === 8) s.f90 = 0x26af; else if (k === 11) s.f90 = 0x26b0;
      else if (k === 15) s.f90 = 0x26ae; else if (k === 12) s.f90 = 0x26ad;
    }
  }
  if (jump) { s.f8e = 1; playRegSound(jumpSnd, 100, 256); }
  s.f98 = col; s.f9a = row; s.f9c = k;
}

// JumpScale(s, off, hitSnd, slamSnd, fallSnd, isPlayer, comfortAfterFall)
const ARC = [0, 16, 24, 32, 40, 48, 56, 64, 69, 75, 80, 80, 75, 69, 64, 59, 53, 48, 40, 32, 24, 16, 8];
export function jumpScale(s, off, hitSnd, slamSnd, fallSnd, isPlayer, fallComfort) {
  const k = Tiles.lookupBGKind(G.level.bg((s.posH + off) >> 5, (s.posV + off) >> 5));
  if (s.f8e === 0 && k === 7) s.f8e = 1000;
  if (s.f8e === 0) return;
  let d3 = 0;
  if (s.f8e < 200) {
    const f = s.f8e;
    if (f >= 1 && f <= 22) d3 = ARC[f];
    else if (f === 23) { d3 = 0; if (k !== 7) playRegSound(hitSnd, 100, 256); else s.f8e = 999; }
    else if (f >= 24 && f <= 28) d3 = [8, 16, 24, 32, 24][f - 24];
    else if (f === 29) { d3 = 16; if (k !== 7) playRegSound(slamSnd, 100, 256); else { d3 = 0; s.f8e = 999; } }
    else if (f >= 30 && f <= 34) d3 = [8, 0, 8, 16, 8][f - 30];
    else if (f === 35) { d3 = 0; s.f8e = -1; }
  } else if (s.f8e < 300) {
    switch (s.f90) {
      case 0x26ad: if (s.f4e < 0x200) s.f4e = 0x200; break;
      case 0x26ae: if (s.f4e > -0x200) s.f4e = -0x200; break;
      case 0x26af: if (s.f50 < 0x200) s.f50 = 0x200; break;
      case 0x26b0: if (s.f4e > -0x200) s.f50 = -0x200; break; // (original tests vv here)
    }
    switch (s.f8e % 4) {
      case 0: d3 = 0; playRegSound(hitSnd, 100, 256); break;
      case 1: d3 = 16; break;
      case 2: d3 = 32; break;
      case 3: d3 = 16; break;
    }
    if (s.f8e > 0xdc) { d3 = 0; s.f8e = -1; playRegSound(slamSnd, 100, 256); }
  } else if (s.f8e >= 1000) {
    if (s.f8e === 1000) { playRegSound(fallSnd, 100, 256); d3 = -6; }
    else if (s.f8e < 0x406) {
      d3 = (1000 - s.f8e) * 6;
      s.f50 = w16(Math.trunc(s.f50 * 0.8));
      s.f4e = w16(Math.trunc(s.f4e * 0.8));
      if (isPlayer) { s.dir++; if (s.dir > 35) s.dir -= 36; }
    } else if (s.f8e === 0x406) {
      s.fixH = (G.level.info(1) - off + (SATRand(7) - 3)) << 8;
      s.fixV = (G.level.info(2) - off + (SATRand(7) - 3)) << 8;
      s.h = s.posH = s.fixH >> 8;
      s.v = s.posV = s.fixV >> 8;
      d3 = 200;
      if (isPlayer) {
        G.fadeOut = true; // GammaFadeOut(8)
        G.viewLeft = G.viewLeft2 = s.posH - 208;
        G.viewTop = G.viewTop2 = s.posV - 208;
      }
    } else if (s.f8e <= 0x415) {
      if (s.f8e === 0x407 && isPlayer) { G.redrawAll = true; }
      if (s.f8e === 0x408 && isPlayer) G.fadeIn = true; // GammaFadeIn(8)
      s.f4e = 0; s.f50 = 0;
      d3 = ((0x415 - s.f8e) << 3) + 0x50;
      if (s.f8e === 0x415) {
        s.f8e = 10;
        if (isPlayer) { G.comfort += fallComfort; playRegSound(S(224), 100, 256); }
      }
      if (isPlayer) {
        if (s.f8e < 0x40e || (s.f8e & 1)) s.dir++;
        if (s.dir > 35) s.dir -= 36;
      }
    }
  }
  s.f8e++;
  s.scaleH = s.scaleV = d3 + 256;
}

// HandleGlide(s, off): floor friction for pushed objects (kind 2 floor = frictionB, else frictionA;
// halved while riding a half pipe, f9c >= 88). Slow speeds stop dead.
export function handleGlide(s, off) {
  if (s.f8e !== 0 && (s.f8e <= 23 || s.f8e >= 200)) return;
  const col = ((s.fixH >> 8) + off) >> 5, row = ((s.fixV >> 8) + off) >> 5;
  const k = Tiles.lookupBGKind(G.level.bg(col, row));
  let f = k === 2 ? G.frictionB : G.frictionA;
  if (s.f9c >= 88) f = (f + 256) >> 1;
  if (Math.abs(s.f50) > 24) s.f50 = w16((s.f50 * f) >> 8);
  else if (s.f9c < 88) s.f50 = 0;
  if (Math.abs(s.f4e) > 24) s.f4e = w16((s.f4e * f) >> 8);
  else if (s.f9c < 88) s.f4e = 0;
}
