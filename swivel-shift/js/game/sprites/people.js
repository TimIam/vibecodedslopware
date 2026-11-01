// Office people (seg 3): coworkers (1301..1441, solid obstacles; 1301 fidgets) and the mail guy
// (1601 up / 1611 down / 1621 right / 1631 left: zooms along until a wall, waits, then turns back).

import { G } from '../state.js';
import { setRect, ptInRect } from '../../core/util.js';
import { SATRand, SATNewSprite } from '../../core/sat.js';
import { load1EncFaceFromCicn, load1EncFaceFromPICT, loadEncFaceSetFromPICT } from '../../core/res.js';
import { applyModedImpulse, inverseMode } from '../physics.js';
import { S, playDynamicSound, play3DSound } from '../sound.js';
import { Hooks, register } from '../hooks.js';

const lv = () => G.level;
const is = (o, name) => o.task === Hooks[name];

// SCIENTISTTINTDRAWPROC (shared with the scientists): layer 10 = hit flash; 1200..1300 are tinted 6
export function scientistTintDrawProc(face, s, blit) {
  if (s && s.layer === 10) return blit(1, 1);
  const tint = G.level.info(0);
  if (tint) return blit(1, tint);
  if (s && s.kind >= 1200 && s.kind <= 1300) return blit(1, 6);
  return blit(0, 0);
}

// ---------------------------------------------------------------- coworkers
const CW = []; // g_6de4: 8 groups of 12 faces

export function initCoWorkerSprite() {
  for (let i = 0; i < 11; i++) CW[i] = load1EncFaceFromCicn(1301 + i, false, 2101 + i);
  for (let g = 1; g < 8; g++) CW[12 * g] = load1EncFaceFromCicn(1301 + 20 * g, false, 2301 + g);
  for (const f of CW) if (f) f.drawProc = scientistTintDrawProc;
}

const cwGroup = (s) => ((s.kind - 1301) / 20) | 0;

export function setupCoWorkerSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleCoWorkerSprite;
  s.hit = null;
  s.tileHit = null;
  setRect(s.hot, 2, 2, 40, 40);
  s.eface = CW[cwGroup(s) * 12 + s.dir] || null;
  s.f26 = 0;
  s.layer = 5;
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
}

export function handleCoWorkerSprite(s) {
  if (s.f92) return;
  if (s.kind === 1301) { // fidget now and then
    const d = s.dir;
    if (d === 0) { if (SATRand(15) === 1) s.dir++; }
    else if (d < 12) s.dir++;
    else if (d === 12) { if (SATRand(60) === 1) s.dir++; }
    else if (d <= 31) s.dir++;
    else s.dir = 0;
  }
  s.eface = CW[cwGroup(s) * 12 + ((s.dir / 3) | 0)] || null;
  if (s.layer === 10) s.layer = 5;
}

// ---------------------------------------------------------------- mail guy
const MG = []; // g_6c2e..g_6c3a: PICT 1601/1611/1621/1631

// MAILDRAWPROC: record +10 tints him (a level tint uses info(3), as in the original)
function mailDrawProc(face, s, blit) {
  const tint = G.level.info(0);
  if (!s) return tint ? blit(1, tint) : blit(0, 0);
  if (tint) return blit(1, G.level.info(3));
  if (s.param >= 0) {
    let t = lv().w(lv().objOff(s.param) + 10);
    if (t) {
      if (t < -1 || t > 15) t = 0;
      return blit(1, t);
    }
  }
  return blit(0, 0);
}

export function initMailGuySprite() {
  [1601, 1611, 1621, 1631].forEach((id, i) => {
    MG[i] = load1EncFaceFromPICT(id, false, 3701 + i);
    if (MG[i]) MG[i].drawProc = mailDrawProc;
  });
}

const mgFace = (s) => MG[((s.kind - 1601) / 10) | 0];

export function setupMailGuySprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleMailGuySprite;
  s.hit = hitMailGuySprite;
  s.tileHit = hitMailGuyTileSprite;
  s.eface = mgFace(s);
  if (s.eface) s.hot = s.eface.bounds.slice();
  s.f26 = 0;
  s.layer = 9;
  s.f4e = 0; s.f50 = 0;
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
}

// per heading: [velocity field, speed, reversed kind, sound priority/volume]
const MAIL = {
  1601: ['f4e', -15, 1611, 8, 256], 1611: ['f4e', 15, 1601, 8, 256],
  1621: ['f50', 15, 1631, 8, 256], 1631: ['f50', -15, 1621, 8, 128],
};

export function handleMailGuySprite(s) {
  if (s.f92) return;
  const o = lv().objOff(s.param);
  if (!s.behind) { // first frame: restore the state kept in the level record
    s.f74 = lv().w(o + 4) || 0;
    s.dir = lv().w(o + 6);
    s.behind = 1;
  }
  if (s.f74 > 0) { if (--s.f74 === 0) s.dir++; }
  else if (s.f74 < 0) s.f74++;
  const m = MAIL[s.kind];
  if (m) {
    const [field, speed, back, prio, vol] = m;
    if (s.dir === 0) s[field] = speed;                     // zooming
    else if (s.dir > 40 && SATRand(40) === 1) {            // turn around
      s.kind = back;
      s.dir = 0;
      s[field] = speed;
      s.f74 = -9;
      playDynamicSound(S(400), prio, vol, s.v, s.h, s.f4e, s.f50);
    } else { s.f4e = 0; s.f50 = 0; s.dir++; }             // waiting at a wall
  }
  s.h = (s.h + s.f50) << 16 >> 16;
  s.v = (s.v + s.f4e) << 16 >> 16;
  s.posH = s.h; s.posV = s.v;
  s.eface = mgFace(s);
  lv().setW(o + 4, s.f74);
  lv().setW(o + 6, s.dir);
  lv().setW(o + 2, s.kind);
}

export function hitMailGuySprite(me, o) {
  if (me.f92 || o.f92) return;
  if (is(o, 'handleRobotSprite') || is(o, 'handleBlobSprite')) o.f72 = 0; // runs them over
  if (is(o, 'handleEnemyShotSprite') || is(o, 'handlePlayerShotSprite')) o.f92 = 1;
}

// The FG tile kinds that stop him, per heading
const STOPS = {
  1601: [1, 5, 6, 8, 11, 13, 14, 18, 21, 26, 29],
  1611: [3, 4, 7, 9, 10, 12, 15, 16, 23, 24, 31],
  1621: [2, 6, 7, 8, 9, 14, 15, 19, 22, 27, 30],
  1631: [0, 5, 4, 10, 11, 13, 12, 17, 20, 25, 28],
};

export function hitMailGuyTileSprite(s, cellV, cellH, kind, isFG) {
  if (isFG !== 1 || s.f74 !== 0 || s.dir !== 0) return;
  if ((STOPS[s.kind] || []).includes(kind)) s.f74 = 6;
}

// ---------------------------------------------------------------- scientists (1111/1121/1131/1141 facing right/left/
// up/down; 12x1 are the faster, tinted variety): wait until Harry is in their arc, wind up and lob a vial.
const Sci = { faces: [] }; // g_6b90: PICT 1111, 4 x 8 frames

export function initScientistSprite() {
  Sci.faces = loadEncFaceSetFromPICT(1111, 32, 32, 32, 8, 0, 0, 4301);
  for (const f of Sci.faces) if (f) f.drawProc = scientistTintDrawProc;
}

export function setupScientistSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.f74 = 0;
  s.task = handleScientistSprite;
  s.hit = hitScientistSprite;
  s.tileHit = null;
  setRect(s.hot, 8, 8, 24, 24);
  s.eface = null;
  s.layer = 9;
  s.f6e = 0;
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
}

const sciBase = (s) => (s.kind < 1200 ? s.kind : s.kind - 100);
const SCI = { // can see Harry, vial spawn offset [h, v], face group
  1111: [(d) => d <= 4 || d >= 31, [22, 20], 0],
  1121: [(d) => d >= 15 && d <= 21, [4, 4], 8],
  1131: [(d) => d >= 6 && d <= 12, [20, 2], 16],
  1141: [(d) => d >= 24 && d <= 30, [5, 19], 24],
};

export function handleScientistSprite(s) {
  if (s.f92) return;
  const cfg = SCI[sciBase(s)];
  if (ptInRect(s.posV, s.posH, [G.viewTop - 64, G.viewLeft - 64, G.viewTop + 512, G.viewLeft + 512])) {
    const f = s.f6e;
    if (f === 0) {
      s.dir = 1;
      const d = Hooks.findDesiredDirectionGeneric(s.v + 14, s.h + 14, G.playerV + 32, G.playerH + 32);
      if (cfg && cfg[0](d)) { s.f6e++; s.f50 = d; } // remember the aim
    } else if (f <= 2) s.f6e++;
    else if (f <= 5) { s.dir = 2; s.f6e++; }
    else if (f <= 8) { s.dir = 3; s.f6e++; }
    else if (f === 9) {
      s.dir = 4;
      play3DSound(S(300), 10, 256, s.v, s.h);
      if (cfg) {
        const vial = SATNewSprite(s.kind, s.h + cfg[1][0], s.v + cfg[1][1], Hooks.setupEnemyShotSprite);
        vial.f4e = 0; vial.f50 = 0;
        vial.dir = s.f50;
        applyModedImpulse(vial, inverseMode(vial.dir), s.kind < 1200 ? 1200 : 1800); // AssignScientistShotSpeed
        vial.f74 = 0;
        vial.dir = 0;
      }
      s.f6e++;
    } else if (f <= 11) { s.dir = 4; s.f6e++; }
    else if (f <= 14) { s.dir = 5; s.f6e++; }
    else if (f <= 17) { s.dir = 6; s.f6e++; }
    else if (f <= 20) { s.dir = 7; s.f6e++; }
    else if (s.f74 === 0) {
      if (s.kind < 1200) { if (s.f6e > 45 && SATRand(25) === 2) s.f6e = 0; else s.f6e++; }
      else if (s.f6e > 15 && SATRand(15) === 2) s.f6e = 0; else s.f6e++;
    } else s.f74--;
  }
  if (s.layer === 10) s.layer = 7;
  s.eface = cfg && s.dir >= 0 && s.dir <= 7 ? Sci.faces[cfg[2] + s.dir] : null;
}

export function hitScientistSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (o.task !== Hooks.handlePlayerShotSprite) return;
  o.f92 = 1;
  play3DSound(S(4700), 20, 256, me.v, me.h);
  me.layer = 10;
  G.g46c0 -= 3;
  me.f74 = SATRand(70) + 65;
}

register({ initScientistSprite, setupScientistSprite, handleScientistSprite,
  initCoWorkerSprite, setupCoWorkerSprite, handleCoWorkerSprite,
  initMailGuySprite, setupMailGuySprite, handleMailGuySprite, scientistTintDrawProc });
