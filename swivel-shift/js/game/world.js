// Level/world flow from seg 1: SetupLevelSprites, GenerateSprite, the idle-sprite system,
// CheckTileCollisions, CheckPlayerCollision, EraseSprites (sprite lifecycle), FindUpperLeftCorner,
// and the draw pipeline (DrawSpritesBehindTiles / RedrawFGTiles / DrawSpritesAboveTiles).

import { G, Prefs } from './state.js';
import { SAT, SATNewSprite, SATKillSprite, SATSkip, forEachSprite } from '../core/sat.js';
import { Level } from '../core/level.js';
import { even, sectRect, ptInRect } from '../core/util.js';
import { Tiles, loadLevelTilesets, loadTileDefinitions } from './tiles.js';
import { initLevelSounds } from './sound.js';
import { Hooks, register } from './hooks.js';
import { blitFace, fillRect } from '../core/render.js';
import { Res } from '../core/res.js';
import { Input } from '../core/input.js';

// ---------------------------------------------------------------- InitSprite (seg 2)
export function initSprite(s) {
  s.f72 = 0; s.f74 = 0; s.idle = -1; s.f78 = 0; s.f7c = 0; s.face = null; s.eface = null;
  s.f82 = 0; s.f84 = 0; s.f86 = 0; s.f8a = 0; s.behind = 0; s.f8c = 0;
  s.f58 = 256; s.f56 = 256; s.scaleV = 256; s.scaleH = 256;
  s.f90 = 0; s.f8e = 0; s.param = -1; s.f92 = 0; s.f94 = 0; s.f96 = 0; s.f50 = 0; s.f4e = 0;
}
// SpriteCenter: {v, h}
export function spriteCenter(s) {
  return { v: s.posV + ((s.hot[0] + s.hot[2]) >> 1), h: s.posH + ((s.hot[1] + s.hot[3]) >> 1) };
}

// ---------------------------------------------------------------- level loading
export function setLevel(bytes) { G.level = new Level(bytes); }

export function loadLevelPhysics() {
  const lv = G.level;
  if (lv.w(0x12100)) {
    G.scootPower = lv.w(0x12102); G.kickPowerK = lv.w(0x12104); G.frictionA = lv.w(0x12106);
    G.frictionB = lv.w(0x12108); G.bounciness = lv.w(0x1210a);
  } else {
    G.scootPower = 50; G.kickPowerK = 70; G.frictionA = 245; G.frictionB = 252; G.bounciness = 150;
  }
}

export function loadLevelSounds() {
  if (G.level.b(0x12034)) { G.customSounds = true; initLevelSounds(true); }
  else if (G.customSounds) { G.customSounds = false; initLevelSounds(false); }
}

// ---------------------------------------------------------------- props (AddBGProp / AddFGProp)
export const Props = { bg: [], fg: [] }; // {v, h, face}
function addProp(list, v, h, face) { if (list.length < 64) list.push({ v, h, face }); }

// ---------------------------------------------------------------- idle sprites
export const Idle = new Array(255).fill(null).map(() => ({ active: false }));

export function initIdleSprites() {
  for (let i = 0; i < 255; i++) Idle[i] = { active: false, sprite: null, face: null, f8a: 0, kind: -1, dir: 0,
    layer: 0, h: 0, v: 0, param: -1, f72: 0, f74: 0, f7c: 0, hot: [0, 0, 0, 0], f50: 0, f4e: 0, f6e: 0,
    behind: 0, f8c: 0, scaleH: 256, scaleV: 256, f8e: 0, task: null, hit: null, tileHit: null };
}

// AddIdleSprite(kind, h, v, param, face, setup)
export function addIdleSprite(kind, h, v, param, face, setup) {
  let slot = -1;
  for (let i = 0; i < 255; i++) if (!Idle[i].active) { slot = i; break; }
  if (slot === -1) { console.warn('AddIdleSprite: no room'); return; }
  const s = SATNewSprite(kind, h, v, setup);
  if (!s) return;
  Idle[slot].active = true;
  Idle[slot].sprite = s;
  activeToIdleSprite(slot, false);
  Idle[slot].kind = kind;
  Idle[slot].h = h;
  Idle[slot].v = v;
  Idle[slot].param = param;
  Idle[slot].face = face || s.eface;
  SATKillSprite(s);
}

export function activeToIdleSprite(i) {
  const e = Idle[i], s = e.sprite;
  e.face = s.eface; e.f8a = s.f8a; e.f7c = s.f7c; e.kind = s.kind; e.dir = s.dir; e.layer = s.layer;
  e.h = s.posH; e.v = s.posV; e.param = s.param; e.f72 = s.f72; e.f74 = s.f74;
  e.hot = s.hot.slice(); e.f50 = s.f50; e.f4e = s.f4e; e.f6e = s.f6e; e.behind = s.behind; e.f8c = s.f8c;
  e.scaleH = s.scaleH; e.scaleV = s.scaleV; e.f8e = s.f8e; e.task = s.task; e.hit = s.hit; e.tileHit = s.tileHit;
  e.extra = s.extra;
  s.task = null;
  s.f92 = 0;
  e.sprite = null;
}

export function idleToActiveSprite(i) {
  const e = Idle[i];
  const s = SATNewSprite(e.kind, e.h, e.v, null);
  e.sprite = s;
  s.face = null; s.f86 = 0; s.f8a = 1;
  s.eface = e.face; s.f7c = e.f7c; s.f82 = -1; s.f84 = -1;
  s.kind = e.kind; s.dir = e.dir; s.layer = e.layer; s.posH = e.h; s.posV = e.v; s.param = e.param;
  s.f72 = e.f72; s.f74 = e.f74; s.hot = e.hot.slice(); s.f50 = e.f50; s.f4e = e.f4e; s.f6e = e.f6e;
  s.behind = e.behind; s.f8c = e.f8c; s.scaleH = e.scaleH; s.scaleV = e.scaleV; s.f8e = e.f8e;
  s.task = e.task; s.hit = e.hit; s.tileHit = e.tileHit; s.extra = e.extra;
  s.fixH = s.posH << 8; s.fixV = s.posV << 8;
  s.f92 = 0;
  s.idle = i;
}

export function handleIdleSprites() {
  const view = [G.viewTop, G.viewLeft, G.viewTop + 448, G.viewLeft + 448];
  const cx = G.viewLeft + 224, cy = G.viewTop + 224;
  for (let i = 0; i < 255; i++) {
    const e = Idle[i];
    if (!e.active) continue;
    const dx = Math.abs(cx - e.h - 24), dy = Math.abs(cy - e.v - 24);
    if (!e.sprite) {
      if (dx < 348 && dy < 348) idleToActiveSprite(i);
    } else if (dx > 348 || dy > 348) {
      const s = e.sprite;
      const r = [s.posV + s.hot[0], s.posH + s.hot[1], s.posV + s.hot[2], s.posH + s.hot[3]];
      if (!sectRect(view, r)) activeToIdleSprite(i);
    }
  }
}

// ---------------------------------------------------------------- SetupLevelSprites / GenerateSprite
export function setupLevelSprites() {
  for (let s = SAT.head; s; ) { const n = s.next; SATKillSprite(s); s = n; }
  initIdleSprites();
  loadLevelTilesets();
  loadTileDefinitions();
  G.redrawAll = true;
  if (!G.keepTrackMap) initTrackMap(); else G.keepTrackMap = false;
  loadLevelPhysics();
  loadLevelSounds();
  Props.bg.length = 0; Props.fg.length = 0;
  const lv = G.level;
  for (let i = 0; i < 256; i++) {
    const o = lv.objOff(i);
    if (!lv.b(o)) continue;
    const h = lv.w(o + 0xe) - 6, v = lv.w(o + 0xc) - 6;
    const id = lv.w(o + 2);
    if (id) generateSprite(h, v, id, i);
  }
}

// GenerateSprite(a = h (rec+0xe - 6), b = v (rec+0xc - 6), id, index)
export function generateSprite(a, b, id, idx) {
  const K = Hooks;
  const ev = (x) => even(x);
  if (id > 300 && id < 320) { SATNewSprite(id, a, b, K.setupDeskSprite); return; }
  if (id >= 500 && id < 605) {
    const setup = { 500: K.setupCoolerSprite, 501: K.setupCoolerSprite, 550: K.setupBarrelSprite,
      560: K.setupChairSprite, 601: K.setupPlantSprite }[id];
    if (setup) addIdleSprite(id, ev(a), ev(b), idx, null, setup);
    return;
  }
  if (id >= 700 && id < 800) { addIdleSprite(id, a, b, idx, null, K.setupBonusSprite); return; }
  if (id >= 900 && id < 950) { addIdleSprite(id, ev(a), ev(b), idx, null, K.setupDoorSprite); return; }
  if (id >= 950 && id < 1000) { addIdleSprite(id, ev(a), ev(b) + (id === 951 ? 1 : 0), idx, null, K.setupSlidingDoorSprite); return; }
  if (id >= 1000 && id < 1050) {
    const pv = a, ph = b;
    const prop = { 1019: 'dartboardL', 1029: 'dartboardR', 1039: 'dartboardD', 1049: 'dartboardD2' }[id];
    if (prop) { addProp(Props.bg, ph, pv, K.propFace(id)); return; }
    addIdleSprite(id, a, b, idx, null, K.setupDartEnemySprite); return;
  }
  if (id >= 1100 && id < 1300) { addIdleSprite(id, a, b, idx, null, K.setupScientistSprite); return; }
  if (id >= 1300 && id < 1450) { addIdleSprite(id, ev(a) + 1, ev(b), idx, null, K.setupCoWorkerSprite); return; }
  if (id >= 1600 && id < 1700) {
    if ([1601, 1611, 1621, 1631].includes(id)) { const s = SATNewSprite(id, a, b, K.setupMailGuySprite); s.param = idx; return; }
    if ([1609, 1619, 1629, 1639].includes(id)) { addProp(Props.fg, b, a, K.propFace(id)); return; }
    return;
  }
  if (id >= 1700 && id < 1800) { addIdleSprite(id, a, b, idx, null, K.setupBlobSprite); return; }
  if (id >= 1800 && id < 1850) { addIdleSprite(id, a, b, idx, null, K.setupRobotSprite); return; }
  if (id >= 1850 && id < 1900) { const s = SATNewSprite(id, a, b, K.setupReversorSprite); s.param = idx; return; }
  if (id >= 1900 && id < 2000) { addIdleSprite(id, a, b, idx, null, K.setupTurretSprite); return; }
  if (id >= 2000 && id < 2100) { addIdleSprite(id, a, b, idx, null, K.setupRobotSprite); return; }
  if (id >= 2200 && id < 2300) { addIdleSprite(id, a, b, idx, null, K.setupBossSprite); return; }
  if (id >= 2301 && id <= 2304) { const s = SATNewSprite(id, a, b, K.setupColliderSprite); s.param = idx; return; }
  if (id >= 3000 && id < 3002) {
    if (id === 3001) addIdleSprite(id, ev(a), ev(b), idx, K.hazardFace(), K.setupHazardSprite);
    return;
  }
  if (id === 3100 || id === 3101 || id === 9300 || id === 9200 || id === 9199) {
    addIdleSprite(id, a, b, idx, null, K.setupColliderSprite); return;
  }
  if (id >= 3900 && id < 4000) {
    const extra = (id === 3905 || id === 3915) ? 1 : 0;
    addIdleSprite(id, ev(a), ev(b) + extra - 1, idx, null, K.setupGrateSprite); return;
  }
  if (id >= 4200 && id < 4300) {
    if (id >= 4201 && id <= 4204) addIdleSprite(id, ev(a), ev(b), idx, K.firePipeFace(id), K.setupFirePipeSprite);
    return;
  }
  if (id >= 5000 && id < 6000) { addIdleSprite(id, a, b, idx, null, K.setupGhostSprite); return; }
  if (id >= 6000 && id < 6100) { const s = SATNewSprite(id, a, b, K.setupBoulderSprite); s.param = idx; return; }
  if (id >= 9900 && id < 9910) { addIdleSprite(id, a, b, idx, null, K.setupStairsSprite); return; }
  if (id >= 9500 && id < 9600) { addIdleSprite(id, a, b, idx, null, K.setupButtonSprite); return; }
  if (id >= 9700 && id < 9800) { addIdleSprite(id, a, b, idx, null, K.setupRampSprite); return; }
  if (id === 9600 || id === 9800 || (id > 9400 && id < 9500)) {
    addIdleSprite(id, a, b, idx, null, K.setupColliderSprite); return;
  }
  if (id >= 9990 && id < 10000) { addIdleSprite(id, a, b, idx, null, K.setupExitSprite); return; }
  if (id > 11000 && id < 20000) { addIdleSprite(id, a, b, idx, null, K.setupItemSprite); return; }
  if (id >= 21000) { addIdleSprite(id, a, b, idx, null, K.setupMessageSprite); return; }
}

// ---------------------------------------------------------------- track map (InitTrackMap/UpdateTrackMap)
export const TrackMap = new Uint8Array(128 * 128);
export function initTrackMap() { TrackMap.fill(0); G.trackCol = -999; G.trackRow = -999; }
export function updateTrackMap() {
  const c = (G.playerH + 32) >> 5, r = (G.playerV + 32) >> 5;
  if (c === G.trackCol && r === G.trackRow) return;
  for (let x = c - 7; x < c + 7; x++) for (let y = r - 7; y < r + 7; y++)
    if (x >= 0 && x < 128 && y >= 0 && y < 128) TrackMap[x * 128 + y] = 1;
  G.trackCol = c; G.trackRow = r;
}

// ---------------------------------------------------------------- CheckTileCollisions
export const FGRedraw = []; // {v, h, rect:[t,l,b,r]}  (g_fa80 / g_f760, max 100)

export function checkTileCollisions() {
  FGRedraw.length = 0;
  const view = [G.viewTop, G.viewLeft, G.viewTop + 448, G.viewLeft + 448];
  const lv = G.level;
  const OFF = [[0, 0], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (let s = SAT.head; s; s = s.next) {
    if (!s.tileHit && s.behind !== 1) continue;
    if (!s.eface) continue;
    const hot = [s.posV + s.hot[0], s.posH + s.hot[1], s.posV + s.hot[2], s.posH + s.hot[3]];
    const f = s.eface;
    let fb;
    if (s.scaleH === 256 && s.scaleV === 256) {
      fb = [s.posV + f.bounds[0], s.posH + f.bounds[1], s.posV + f.bounds[2], s.posH + f.bounds[3]];
    } else {
      const sp = findScaledPosAndBounds(s.posV, s.posH, f, s.scaleH, s.scaleV);
      fb = [f.bounds[0] + sp.v, f.bounds[1] + sp.h, f.bounds[2] + sp.v, f.bounds[3] + sp.h];
    }
    const cx = s.posH + ((f.w - 0) >> 1), cy = s.posV + ((f.h - 0) >> 1);
    const col = cx >> 5, row = cy >> 5;
    if (s.tileHit) {
      for (const [dc, dr] of OFF) {
        const c = col + dc, r = row + dr;
        const cellH = c << 5, cellV = r << 5;
        const fk = Tiles.lookupFGKind(lv.fg(c, r));
        const bk = Tiles.lookupBGKind(lv.bg(c, r));
        if (fk !== -1 && Tiles.fgRects[fk]) {
          const hr = Tiles.fgRects[fk].hot;
          if (sectRect(hot, [cellV + hr[0], cellH + hr[1], cellV + hr[2], cellH + hr[3]])) s.tileHit(s, cellV, cellH, fk, 1);
        }
        if (bk !== 0 && Tiles.bgRects[bk]) {
          const br = Tiles.bgRects[bk];
          if (sectRect(hot, [cellV + br[0], cellH + br[1], cellV + br[2], cellH + br[3]])) s.tileHit(s, cellV, cellH, bk, 0);
        }
      }
    }
    if (s.behind && sectRect(fb, view)) {
      for (const [dc, dr] of OFF) {
        const c = col + dc, r = row + dr;
        const fk = Tiles.lookupFGKind(lv.fg(c, r));
        if (fk === -1 || !Tiles.fgRects[fk]) continue;
        const cellH = c << 5, cellV = r << 5;
        const rr = Tiles.fgRects[fk].redraw;
        const out = [0, 0, 0, 0];
        if (sectRect(fb, [cellV + rr[0], cellH + rr[1], cellV + rr[2], cellH + rr[3]], out) && FGRedraw.length < 100)
          FGRedraw.push({ v: cellV, h: cellH, rect: out });
      }
    }
  }
}

// FindScaledPosAndBounds(pos, face, scaleH, scaleV) -> scaled top-left
export function findScaledPosAndBounds(v, h, face, sh, sv) {
  const w = face.w, hh = face.h;
  const nw = (w * sh) >> 8, nh = (hh * sv) >> 8;
  return { v: v + ((hh - nh) >> 1), h: h + ((w - nw) >> 1), w: nw, hgt: nh };
}

// ---------------------------------------------------------------- CheckPlayerCollision
export function checkPlayerCollision() {
  let p = null;
  for (let s = SAT.head; s; s = s.next) if (s.task === Hooks.handlePlayerSprite) { p = s; break; }
  if (!p) return;
  const pr = [p.posV + p.hot[0], p.posH + p.hot[1], p.posV + p.hot[2], p.posH + p.hot[3]];
  for (let s = SAT.head; s; s = s.next) {
    if (s.task === Hooks.handlePlayerSprite || !s.task || s === p) continue;
    const r = [s.posV + s.hot[0], s.posH + s.hot[1], s.posV + s.hot[2], s.posH + s.hot[3]];
    if (sectRect(pr, r)) Hooks.hitPlayerSprite(p, s);
  }
}

// ---------------------------------------------------------------- EraseSprites (lifecycle part)
export function eraseSprites() {
  const lv = G.level;
  for (let s = SAT.head; s; ) {
    const next = s.next;
    if (!s.task || s.f92) {
      if (s.f92) {
        if (s.param >= 0 && s.param <= 255) lv.setB(lv.objOff(s.param), 0);
        if (s.idle >= 0 && s.idle <= 255) Idle[s.idle].active = false;
      }
      SATKillSprite(s);
    } else {
      s.f8a = 0; s.f4a = 0;
      s.f86 = s.eface; s.f84 = s.posH; s.f82 = s.posV; s.f56 = s.scaleH; s.f58 = s.scaleV;
      if (s.f94) s.f94--;
      if (s.f96) s.f96--;
      if (s.param >= 0 && s.param <= 255) {
        const o = lv.objOff(s.param);
        lv.setW(o + 2, s.kind);
        lv.setW(o + 0xe, s.posH + 6);
        lv.setW(o + 0xc, s.posV + 6);
      }
    }
    s = next;
  }
}

// ---------------------------------------------------------------- camera (FindUpperLeftCorner)
export function findUpperLeftCorner() {
  const ph = G.playerH + 32, pv = G.playerV + 32;
  const cx = G.viewLeft + 224, cy = G.viewTop + 224;
  const mode = Prefs.scrollMode;
  const step = (diff) => { let d = diff >> 4; if (d < 1) d = 1; return d; };
  if (mode < 3) {
    const th = G.playerH - 208, tv = G.playerV - 208;
    if (G.viewLeft2 < th) G.viewLeft2 += step(th - G.viewLeft2); else if (G.viewLeft2 > th) G.viewLeft2 -= step(G.viewLeft2 - th);
    if (G.viewTop2 < tv) G.viewTop2 += step(tv - G.viewTop2); else if (G.viewTop2 > tv) G.viewTop2 -= step(G.viewTop2 - tv);
    if (mode === 1) { G.viewLeft = G.viewLeft2; G.viewTop = G.viewTop2; }
    else if (mode === 2) {
      G.viewLeft = G.viewLeft2 - (G.viewLeft2 - th) * 2;
      G.viewTop = G.viewTop2 - (G.viewTop2 - tv) * 2;
    }
  } else {
    if (G.scrollStepCount === 0) {
      if (G.scrollCooldown > 0) G.scrollCooldown--;
      const dx = Math.abs(ph - cx), dy = Math.abs(pv - cy);
      const kick = () => { G.scrollStepCount = mode === 3 ? 12 : 6; };
      if (dx > 0x90) {
        kick();
        if (dy > 0x48) G.scrollDir = ph - cx > 0 ? (pv - cy > 0 ? 5 : 6) : (pv - cy > 0 ? 7 : 8);
        else G.scrollDir = ph - cx > 0 ? 1 : 2;
      } else if (dy > 0x90) {
        kick();
        if (dx > 0x48) G.scrollDir = pv - cy > 0 ? (ph - cx > 0 ? 5 : 7) : (ph - cx > 0 ? 6 : 8);
        else G.scrollDir = pv - cy > 0 ? 3 : 4;
      }
    } else {
      let d3;
      if (mode === 3) { d3 = 16; if (G.scrollStepCount === 12 || G.scrollStepCount === 1) d3 >>= 1; }
      else { d3 = 32; if (G.scrollStepCount === 6 || G.scrollStepCount === 1) d3 >>= 1; }
      G.scrollCooldown = 2;
      G.scrollStepCount--;
      switch (G.scrollDir) {
        case 1: G.viewLeft += d3; break;
        case 2: G.viewLeft -= d3; break;
        case 3: G.viewTop += d3; break;
        case 4: G.viewTop -= d3; break;
        case 5: G.viewTop += d3; G.viewLeft += d3; break;
        case 6: G.viewTop -= d3; G.viewLeft += d3; break;
        case 7: G.viewTop += d3; G.viewLeft -= d3; break;
        case 8: G.viewTop -= d3; G.viewLeft -= d3; break;
      }
      if (G.scrollStepCount === 0 && mode === 4) G.redrawAll = true;
    }
  }
  if (Prefs.interlace) G.viewTop = (G.viewTop >> 1) * 2;
  if (G.screenShake > 0) {
    if (mode < 3) {
      if (G.screenShake & 1) G.viewLeft -= G.screenShake >> 1; else G.viewLeft += G.screenShake >> 1;
    }
    G.screenShake--;
  }
  // hard limits: keep the player at least 60px inside the view
  if (ph < cx - 196) G.viewLeft += (cx - 196) - ph;
  if (ph > cx + 196) G.viewLeft -= ph - (cx + 196);
  if (pv < cy - 196) G.viewTop += (cy - 196) - pv;
  if (pv > cy + 196) G.viewTop -= pv - (cy + 196);
  if (G.viewLeft < 0) G.viewLeft = 0; else if (G.viewLeft > 0xe40) G.viewLeft = 0xe40;
  if (G.viewTop < 0) G.viewTop = 0; else if (G.viewTop > 0xe40) G.viewTop = 0xe40;
}

// ---------------------------------------------------------------- drawing
export const PLAY = [16, 16, 464, 464]; // playfield rect on screen [t,l,b,r]

function drawTileLayer(dst) {
  const lv = G.level;
  const c0 = G.viewLeft >> 5, r0 = G.viewTop >> 5;
  for (let c = c0; c <= c0 + 14; c++) for (let r = r0; r <= r0 + 14; r++) {
    if (c < 0 || c >= 128 || r < 0 || r >= 128) continue;
    const x = 16 + (c << 5) - G.viewLeft, y = 16 + (r << 5) - G.viewTop;
    const fg = lv.fg(c, r), bg = lv.bg(c, r);
    if (fg < 56) blitFace(dst, Tiles.bgFaces[bg], y, x, PLAY);
    if (fg >= 0) blitFace(dst, Tiles.fgFaces[fg], y, x, PLAY);
  }
}

// WRAPDRAWSPRITE equivalent: draw face for sprite at world (v,h) with the face's draw proc
export function drawSpriteFace(dst, face, s, v, h, clip = PLAY) {
  if (!face) return;
  const y = 16 + v - G.viewTop, x = 16 + h - G.viewLeft;
  // blit(mode, param[, otherFace, dv, dh]): draw this face (or another one offset within the sprite)
  const blit = (mode, param, f = face, dv = 0, dh = 0) => {
    if (param >= 32) {
      const sp = findScaledPosAndBounds(v, h, f, param >> 5, param >> 5);
      blitFace(dst, f, 16 + sp.v + dv - G.viewTop, 16 + sp.h + dh - G.viewLeft, clip, mode, param);
    } else blitFace(dst, f, y + dv, x + dh, clip, mode, param);
  };
  if (face.drawProc) face.drawProc(face, s, blit);
  else if (s && (s.scaleH !== 256 || s.scaleV !== 256)) blit(0, s.scaleH << 5);
  else blit(0, 0);
}

export function drawPlayfield(dst) {
  drawTileLayer(dst);
  const view = [G.viewTop - 64, G.viewLeft - 64, G.viewTop + 512, G.viewLeft + 512];
  for (const p of Props.bg) if (ptInRect(p.v, p.h, view)) drawSpriteFace(dst, p.face, null, p.v, p.h);
  for (let s = SAT.head; s; s = s.next) {
    if (!s.task || !s.eface || !s.behind) continue;
    if (!ptInRect(s.posV, s.posH, view)) continue;
    drawSpriteFace(dst, s.eface, s, s.posV, s.posH);
  }
  for (const p of Props.fg) if (ptInRect(p.v, p.h, view)) drawSpriteFace(dst, p.face, null, p.v, p.h);
  // RedrawFGTiles: re-cover sprites with the FG tile parts that stand above them
  for (const r of FGRedraw) {
    const fg = G.level.fg(r.h >> 5, r.v >> 5);
    if (fg <= -1) continue;
    const clip = [16 + r.rect[0] - G.viewTop, 16 + r.rect[1] - G.viewLeft, 16 + r.rect[2] - G.viewTop, 16 + r.rect[3] - G.viewLeft];
    const c2 = [Math.max(clip[0], PLAY[0]), Math.max(clip[1], PLAY[1]), Math.min(clip[2], PLAY[2]), Math.min(clip[3], PLAY[3])];
    blitFace(dst, Tiles.fgFaces[fg], 16 + r.v - G.viewTop, 16 + r.h - G.viewLeft, c2);
  }
  for (let s = SAT.head; s; s = s.next) {
    if (!s.task || !s.eface || s.behind) continue;
    if (!ptInRect(s.posV, s.posH, view)) continue;
    drawSpriteFace(dst, s.eface, s, s.posV, s.posH);
  }
}

register({ initSprite, spriteCenter, addIdleSprite, generateSprite });
