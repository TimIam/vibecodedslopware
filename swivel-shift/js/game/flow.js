// Level flow (seg 1): CheckGameEvents, UpLevel, IntroLevel, EndLevelEffect, ScrollPlot, Win,
// GammaFadeOut/In, Pause, CheckGameLoopKeys.

import { G, Prefs } from './state.js';
import { SATNewSprite, SAT, SATKillSprite } from '../core/sat.js';
import { tickCount, waitUntil, waitTicks } from '../core/timing.js';
import { Res, getPicture, setResWorldFile, restoreResWorldFile, pstr } from '../core/res.js';
import { copyBits, fillRect } from '../core/render.js';
import { Port } from '../core/qd.js';
import { Input, UIState } from '../core/input.js';
import { actionDown } from './keys.js';
import { Hooks, register, hasHook } from './hooks.js';
import { Game, openWorldLevel } from './game.js';
import { setupLevelSprites, findUpperLeftCorner, Idle } from './world.js';
import { setupPlayerSprite } from './player.js';
import { updateText, updateMeters, updateInventory, copyStatRect, HUD } from './hud.js';
import { setMusic, fadeMusic } from './music.js';
import { S, playRegSound, stopAllSounds } from './sound.js';

const PLAYFIELD = [16, 16, 464, 464];
const screen = () => Game.display.screen;

// ---------------------------------------------------------------- gamma fades
let faded = false;
export async function gammaFadeOut(n) {
  if (faded) return;
  const step = Math.max(1, ((256 / n) | 0) >> 1);
  for (let d4 = 0; d4 <= 256; d4 += step) { Game.display.gamma = 1 - d4 / 256; await waitTicks(1); }
  Game.display.gamma = 0;
  faded = true;
}
export async function gammaFadeIn(n) {
  if (!faded) return;
  const step = Math.max(1, (256 / n) | 0);
  for (let d4 = 0; d4 <= 256; d4 += step) { Game.display.gamma = d4 / 256; await waitTicks(1); }
  Game.display.gamma = 1;
  faded = false;
}

function clearPlayfield() { fillRect(screen(), PLAYFIELD, 255); }

// ---------------------------------------------------------------- IntroLevel
export async function introLevel() {
  await gammaFadeOut(8);
  clearPlayfield();
  let drawn = false;
  const id = G.level.info(8);
  if (id) {
    setResWorldFile();
    const pic = getPicture(id);
    restoreResWorldFile();
    if (pic) {
      const h = 16 + ((448 - pic.w) >> 1), v = (448 - pic.h) >> 1;
      copyBits(screen(), pic, 0, 0, v, h, pic.h, pic.w);
      drawn = true;
    }
  }
  if (!drawn) {
    const p = new Port(screen());
    const name = pstr(G.level.u8, 0x114c0);
    p.textFont(21); p.textFace(1); p.textSize(27);
    p.rgbFore(64000, 32000, 0);
    const w = p.stringWidth(name);
    const x = (((448 - w) / 2) | 0) + 16;
    p.moveTo(x, 249); p.drawString(name);
    p.rgbFore(24000, 24000, 24000);
    p.moveTo(x, 221); p.lineTo(x + w, 221);
    p.moveTo(x, 222); p.lineTo(x + w, 222);
    p.rgbFore(40000, 40000, 40000);
    p.textFace(0); p.textSize(11);
    p.moveTo(203, 215); p.drawString('L  E  V  E  L');
    p.moveTo(271, 215); p.drawString(String(G.level.w(0x12032)));
  }
  await gammaFadeIn(8);
  if (Res.world.get('Hwld', 0) && worldW(0x1c4) !== G.curLevel) fadeMusic(false, 2);
  await waitTicks(60);
}

const worldW = (off) => {
  const d = Res.world.get('Hwld', 0);
  return d ? ((d[off] << 8 | d[off + 1]) << 16) >> 16 : 0;
};

// ---------------------------------------------------------------- EndLevelEffect (square wipe)
export async function endLevelEffect() {
  const p = new Port(screen());
  p.foreColor(33);
  const a = Array.from({ length: 14 }, () => new Int16Array(14)); // a[col][row]
  for (let r = 0; r < 7; r++) for (let c = 0; c < 14; c++) a[c][r] = -14 * r - c;
  let d6 = 0;
  for (let r = 13; r > 6; r--) for (let c = 13; c >= 0; c--) a[c][r] = d6--;
  let done = false;
  while (!done) {
    const t = tickCount();
    for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) if (a[c][r] < 17) a[c][r]++;
    for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) {
      const v = a[c][r];
      if (v <= 0 || v > 16) continue;
      const cx = (c << 5) + 32, cy = (r << 5) + 32;
      p.frameRect([cy - v, cx - v, cy + v, cx + v]);
    }
    done = true;
    for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) if (a[c][r] !== 17) done = false;
    await waitUntil(t + 1);
  }
}

// ---------------------------------------------------------------- ScrollPlot
export async function scrollPlot(pictId, withMusic) {
  setResWorldFile();
  const pic = getPicture(pictId);
  restoreResWorldFile();
  if (!pic) { clearPlayfield(); return; }
  const d5 = pic.h;
  if (withMusic && worldW(0x144)) {
    G.musicBeforeScroll = G.curMusic;
    await fadeMusic(false, 2);
    setMusic(worldW(0x144));
    G.curMusic = worldW(0x144);
    await fadeMusic(true, 2);
  }
  let srcTop = -448, srcBottom = 0;
  let skipCountdown = 8;
  Input.flushEvents();
  for (let d6 = 0; d6 <= d5 + 448; d6++) {
    const t = tickCount();
    srcTop++; srcBottom++;
    let st = srcTop, sb = srcBottom, dt = 16, db = 464;
    if (st < 0) { dt += -st; st = 0; }
    if (sb > d5) { db -= sb - d5; sb = d5; }
    if (sb > st) copyBits(screen(), pic, st, 0, dt, 40, sb - st, 400);
    if (skipCountdown > 0) skipCountdown--;
    if ((Input.mouseDown || Input.anyKeyDown() || Input.nextClick()) && skipCountdown === 0) break;
    await waitUntil(t + 4);
  }
  if (withMusic && worldW(0x144)) await fadeMusic(false, 2);
  clearPlayfield();
}

// ---------------------------------------------------------------- Win
export async function win() {
  if (worldW(0x14c)) { await fadeMusic(false, 6); setMusic(worldW(0x14c)); await fadeMusic(true, 6); }
  if (worldW(0x146)) await scrollPlot(worldW(0x146), false);
  await gammaFadeOut(75);
  if (worldW(0x148)) {
    fillRect(screen(), [0, 0, 480, 640], 255);
    setResWorldFile();
    const pic = getPicture(worldW(0x148));
    restoreResWorldFile();
    if (pic) copyBits(screen(), pic, 0, 0, (480 - pic.h) >> 1, (640 - pic.w) >> 1, pic.h, pic.w);
    await gammaFadeIn(75);
    await waitTicks(60 * worldW(0x14a));
    await fadeMusic(false, 6);
    await gammaFadeOut(75);
  }
}

// ---------------------------------------------------------------- UpLevel
export async function upLevel() {
  playRegSound(S(4800), 10, 256);
  await endLevelEffect();
  // drop keys
  let again = true;
  while (again) {
    again = false;
    for (let i = 0; i < 12; i++) {
      const id = G.inventory[i].id;
      if ((id === 11397 || id === 11398 || id === 11399) && G.inventory[i].count > 0) {
        Hooks.switchInvItem(i); Hooks.removeInvItem(i); again = true;
      }
    }
  }
  if (G.curLevel > worldW(0x1c6)) { await win(); G.levelDone = true; G.wonGame = true; return; }
  if (G.level.info(5)) await scrollPlot(G.level.info(5), true);
  if (G.curLevel === -255) G.curLevel = G.g46c6 + 1;
  // (registration check for levels >= 6 removed: Ambrosia's DecoderRing made licenses free)
  G.score += (G.curLevel - 1) * 5000;
  G.dispScore = G.score;
  updateText(false);
  G.saved = { comfort: G.comfort, legPower: G.legPower, favor: G.g46c0, score: G.score,
    ammo: [G.ammoStaple, G.ammoBadass, G.ammoShrapnel], inventory: G.inventory.map((e) => ({ ...e })) };
  if (G.save) G.save.copier = false; // the checkpoint is now the start of this level
  if (Prefs.g6173 && hasHook('doSaveGame')) await Hooks.doSaveGame(true);
  clearPlayfield();
  for (let s = SAT.head; s; ) { const n = s.next; SATKillSprite(s); s = n; }
  openWorldLevel(G.curLevel);
  await introLevel();
  const lv = G.level;
  G.playerH = lv.startH - 32; G.playerV = lv.startV - 32;
  G.viewLeft = G.viewLeft2 = lv.startH - 240;
  G.viewTop = G.viewTop2 = lv.startV - 240;
  updateText(false);
  if (lv.info(6)) { clearPlayfield(); await scrollPlot(lv.info(6), true); }
  setupLevelSprites();
  G.playerDir = G.player ? G.player.dir : 0;
  const p = SATNewSprite(0, lv.startH - 32, lv.startV - 32, setupPlayerSprite);
  G.player = p;
  p.dir = lv.startDir;
  if (hasHook('setupHeldWeaponSprite')) SATNewSprite(0, lv.startH, lv.startV, Hooks.setupHeldWeaponSprite);
  setMusic(lv.music); G.curMusic = lv.music;
  fadeMusic(true, 2);
  clearPlayfield();
  findUpperLeftCorner();
}

// ---------------------------------------------------------------- CheckGameEvents
export async function checkGameEvents() {
  if (G.curLevel2 !== G.curLevel) await upLevel();
  if (G.playerDead) G.levelDone = true;
  G.curLevel2 = G.curLevel;
}

// ---------------------------------------------------------------- Pause (caps lock) / keys
// Pause: the "Paused" picture (PICT 4921) in the middle of the playfield until Caps Lock is released
// (or the touch Pause button / a tap on the screen). The original showed the menu bar while paused,
// so menu commands still run.
export async function pause() {
  stopAllSounds();
  playRegSound(S(198), 100, 256);
  UIState.paused = true;
  Input.flushEvents();
  const draw = () => {
    const pic = getPicture(4921);
    if (pic) copyBits(screen(), pic, 0, 0, 192, 128, Math.min(pic.h, 96), Math.min(pic.w, 225));
  };
  draw();
  while (Input.capsLock && !G.levelDone) {
    await waitTicks(2);
    if (Input.nextClick()) Input.capsLock = false;
    await Hooks.runCommands('game');
    if (Input.capsLock) draw();
  }
  UIState.paused = false;
  Input.flushEvents();
  G.gf686 = true; G.g46af = true;
}

export async function checkGameLoopKeys() {
  await Hooks.runCommands('game');
  // F11 (developer): next level
  if (Input.isPressed(0x67) && G.cheats) G.curLevel++;
  if (Input.capsLock && !(G.pauseCooldown > 0)) await pause();
  if (G.mapCooldown > 0) G.mapCooldown--;
  if (actionDown('map') && !(G.mapCooldown > 0) && hasHook('showMap')) { await Hooks.showMap(); G.mapCooldown = 6; }
  if (Input.isPressed(0x35) && hasHook('confirmAbortGame')) {
    if (await Hooks.confirmAbortGame()) G.levelDone = true;
  }
}

register({ introLevel, endLevelEffect, scrollPlot, win, upLevel, checkGameEvents, checkGameLoopKeys,
  gammaFadeOut, gammaFadeIn, setMusic, fadeMusic, pause });
