// Menus and game flow (seg 1): DrawMainMenu, MainMenu, TrackClickOnCommandButton, NewGame, ContinueGame,
// AskToContinue, AbortGame/ConfirmAbortGameDialog, WarpDialog, CopierSave/DoCopierSaveGame/DoSaveGame,
// Instructions, Credits, Quit.
//
// Saved games (the original's 'HrSG' resource files written through the Standard File dialogs) are
// kept in this browser's localStorage, one entry per save, with the same fields as the hSave record.

import { G, Prefs } from './state.js';
import { SAT, SATKillSprite } from '../core/sat.js';
import { Res, getPicture } from '../core/res.js';
import { copyBits, fillRect, blitFace } from '../core/render.js';
import { Faces } from './faces.js';
import { Port, zoomFor, unzoom } from '../core/qd.js';
import { Input, UIState } from '../core/input.js';
import { actionDown } from './keys.js';
import { nextFrame, waitTicks } from '../core/timing.js';
import { modalDialog } from '../core/dialog.js';
import { Hooks, register, hasHook } from './hooks.js';
import { Game, gameLoop, openWorldLevel } from './game.js';
import { drawGameFrame } from './hud.js';
import { TrackMap } from './world.js';
import { gammaFadeOut, gammaFadeIn } from './flow.js';
import { setMusic, fadeMusic, currentMusic } from './music.js';
import { S, playRegSound, initDynamicSounds } from './sound.js';

const screen = () => Game.display.screen;
const EPISODE1_ID = 0x0b07cf71;
const worldW = (off) => { const d = Res.world && Res.world.get('Hwld', 0); return d ? ((d[off] << 24) >> 16) | d[off + 1] : 0; };
const worldL = (off) => { const d = Res.world.get('Hwld', 0); return ((d[off] << 24) | (d[off + 1] << 16) | (d[off + 2] << 8) | d[off + 3]) >>> 0; };

function killAllSprites() { for (let s = SAT.head; s; ) { const n = s.next; SATKillSprite(s); s = n; } }

// ---------------------------------------------------------------- InitGameGlobals
export function initGameGlobals() {
  G.g46be = G.comfort = 72;
  G.g46ba = G.g46c0 = 72;
  G.g46bc = G.legPower = 72;
  G.curItem = -1;
  G.score = 0; G.dispScore = 0;
  G.ammoStaple = 0; G.ammoBadass = 0; G.ammoShrapnel = 0;
  G.caffeine = 0; G.screenShake = 0; G.playerDead = false; G.g80c2 = 0;
  if (G.save) G.save.copier = false;
  for (const e of G.inventory) { e.id = -1; e.count = 0; }
  G.saved = { comfort: 72, legPower: 72, favor: 72, score: 0, ammo: [0, 0, 0],
    inventory: G.inventory.map((e) => ({ ...e })) };
  G.keepTrackMap = false;
  G.wonGame = false;
  initDynamicSounds();
}

// ---------------------------------------------------------------- saved games
const SAVE_KEY = 'harry.savedGames';
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function loadSaveList() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch (e) { return []; }
}
function storeSaveList(list) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}

// The checkpoint part of hSave (DoSaveGame) and the full snapshot (DoCopierSaveGame)
function checkpointRecord() {
  const c = G.saved;
  return { worldId: worldL(0x100), time: Date.now(), level: G.curLevel, score: c.score, comfort: c.comfort,
    legPower: c.legPower, favor: c.favor, ammo: c.ammo.slice(), inventory: c.inventory.map((e) => ({ ...e })) };
}
function snapshotLevel() {
  const u8 = G.level.u8;
  const records = u8.slice(0x10000, 0x11000);
  for (let i = 0; i < 256; i++) { // stored with the h/v offset removed, as the original does
    const o = i * 16;
    const dv = new DataView(records.buffer);
    dv.setInt16(o + 0xe, dv.getInt16(o + 0xe) - 6);
    dv.setInt16(o + 0xc, dv.getInt16(o + 0xc) - 6);
  }
  return { records: b64(records), custom: b64(u8.slice(0x11000, 0x114c0)), track: b64(TrackMap) };
}

// The between-levels save (Save between levels, on by default here) goes to one slot without asking
const AUTOSAVE = 'Autosave';
async function autoSave(rec) {
  const list = loadSaveList().filter((e) => e.name !== AUTOSAVE);
  list.unshift({ name: AUTOSAVE, ...rec });
  if (!storeSaveList(list)) return false;
  G.lastSave = AUTOSAVE;
  G.haveSave = true;
  return true;
}

// The Standard File list area of the Save dialog: the saves already made (click one to replace it)
function saveListItem(list) {
  const rows = list.slice(0, 6);
  return {
    draw(p, r) {
      p.fg = 255; p.paintRect(r, 0); p.frameRect(r);
      p.textFont(0); p.textSize(12); p.textFace(0);
      if (!rows.length) { p.moveTo(r[1] + 6, r[0] + 16); p.drawString('(no saved games yet)'); return; }
      const save = p.clip;
      p.clip = [r[0] + 1, r[1] + 1, r[2] - 1, r[3] - 1];
      rows.forEach((e, i) => { p.moveTo(r[1] + 6, r[0] + 15 + i * 16); p.drawString(`${e.name} (level ${e.level})`); });
      p.clip = save;
    },
    click(pt, r, edits) {
      const i = Math.floor((pt.v - r[0] - 2) / 16);
      if (rows[i]) edits[7] = rows[i].name;
    },
  };
}

// SaveSG: name the save ("Save as:") and store it
async function saveSG(rec, here = false) {
  const suggested = `Harry level ${rec.level}`;
  const where = here ? `this spot on level ${rec.level}` : `level ${rec.level}`;
  const r = await modalDialog(1001, { screen: screen(), params: [where], edits: { 7: suggested },
    hide: [4, 5, 6], user: { 8: saveListItem(loadSaveList()) } }); // (no Eject / Drive in a browser)
  if (r.item !== 1) return false;
  const name = (r.edits[7] || suggested).trim() || suggested;
  const list = loadSaveList().filter((e) => e.name !== name);
  list.unshift({ name, ...rec });
  if (!storeSaveList(list)) {
    await message('There was a problem saving the game: browser storage is full or unavailable.');
    return false;
  }
  G.lastSave = name; // g_712a
  G.haveSave = true; // g_70cf
  return true;
}

// OpenSG: the last save (when continuing after a death) or a choice from the saved games
async function openSG(name) {
  const list = loadSaveList();
  if (name) {
    const e = list.find((x) => x.name === name);
    if (e) return e;
  }
  if (!list.length) { await message('There are no saved games yet. Use a copying machine, or File > Save Game, during a game to save.'); return null; }
  const choice = await chooseSave(list);
  if (!choice) return null;
  G.lastSave = choice.name;
  G.haveSave = true;
  return choice;
}

// A simple stand-in for the Standard File "Open" dialog
async function chooseSave(list) {
  const box = [80, 120, 400, 520];
  const zm = zoomFor([box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8], 12);
  const p = new Port(screen()).setZoom(zm);
  const dev = zm.dev;
  const saved = screen().sub(dev[1], dev[0], dev[3] - dev[1], dev[2] - dev[0]);
  const shown = list.slice(0, 8);
  let sel = 0, result;
  UIState.modal++;
  const rows = shown.map((e, i) => [box[0] + 40 + i * 30, box[1] + 16, box[0] + 64 + i * 30, box[3] - 16]);
  const openBtn = [box[2] - 40, box[3] - 100, box[2] - 16, box[3] - 16];
  const cancelBtn = [box[2] - 40, box[3] - 196, box[2] - 16, box[3] - 112];
  const draw = () => {
    p.paintRect([box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8], 255);
    p.paintRect([box[0] - 5, box[1] - 5, box[2] + 5, box[3] + 5], 0);
    p.textFont(0); p.textSize(12); p.textFace(0); p.fg = 255;
    p.moveTo(box[1] + 16, box[0] + 24); p.drawString('Continue which saved game?');
    shown.forEach((e, i) => {
      const r = rows[i];
      p.paintRect(r, i === sel ? 255 : 0);
      p.fg = i === sel ? 0 : 255;
      const when = new Date(e.time).toLocaleString();
      p.moveTo(r[1] + 6, r[0] + 17); p.drawString(`${e.name} — level ${e.level}  (${when})`);
    });
    p.fg = 255;
    for (const [r, t] of [[openBtn, 'Open'], [cancelBtn, 'Cancel']]) {
      p.frameRect(r);
      const w = p.stringWidth(t);
      p.moveTo(r[1] + ((r[3] - r[1] - w) >> 1), r[0] + 17); p.drawString(t);
    }
  };
  const inR = (c, r) => c.v >= r[0] && c.v < r[2] && c.h >= r[1] && c.h < r[3];
  Input.flushEvents();
  draw();
  while (result === undefined) {
    await nextFrame();
    let k;
    while ((k = Input.nextKey())) {
      if (k.mac === 0x7e && sel > 0) { sel--; draw(); }
      else if (k.mac === 0x7d && sel < shown.length - 1) { sel++; draw(); }
      else if (k.mac === 0x24 || k.mac === 0x4c) result = shown[sel];
      else if (k.mac === 0x35) result = null;
    }
    let c;
    while ((c = unzoom(Input.nextClick(), zm))) {
      const i = rows.findIndex((r) => inR(c, r));
      if (i >= 0) { sel = i; draw(); }
      else if (inR(c, openBtn)) result = shown[sel];
      else if (inR(c, cancelBtn)) result = null;
    }
  }
  copyBits(screen(), saved, 0, 0, dev[0], dev[1], saved.h, saved.w);
  UIState.modal--;
  Input.flushEvents();
  return result;
}

async function message(text) {
  await modalDialog(200, { screen: screen(), params: [text, ''] });
}

// DoSaveGame: save the last checkpoint (level start or copier). auto: the between-levels save
export async function doSaveGame(auto) {
  Input.flushEvents();
  const rec = { ...(G.save || {}), ...checkpointRecord() };
  rec.copier = !!(G.save && G.save.copier);
  return auto ? autoSave(rec) : saveSG(rec);
}

// DoCopierSaveGame: snapshot everything here and now
export async function doCopierSaveGame() {
  Input.flushEvents();
  G.saved = { comfort: G.comfort, legPower: G.legPower, favor: G.g46c0, score: G.score,
    ammo: [G.ammoStaple, G.ammoBadass, G.ammoShrapnel], inventory: G.inventory.map((e) => ({ ...e })) };
  const p = G.player;
  G.save = { ...checkpointRecord(), copier: true, playerH: G.playerH, playerV: G.playerV, dir: p ? p.dir : 0,
    ...snapshotLevel() };
  return saveSG(G.save, true);
}

// CopierSave: "You found a copying machine!..."
export async function copierSave() {
  const r = await modalDialog(160, { screen: screen() });
  G.g46af = true;
  if (r.item !== 1) return false;
  return doCopierSaveGame();
}

// ---------------------------------------------------------------- AskToContinue / abort / warp
export async function askToContinue() {
  Input.flushEvents();
  if (Prefs.g6194 || !G.haveSave) return false;
  const r = await modalDialog(203, { screen: screen() });
  return r.item === 1;
}

export async function confirmAbortGame() {
  const r = await modalDialog(202, { screen: screen(), params: ['Are you sure you want to abort this game?'] });
  return r.item === 1;
}

async function warpDialog() {
  const r = await modalDialog(400, { screen: screen(), edits: { 2: '1' } });
  return parseInt(r.edits[2], 10) || 1;
}

// ---------------------------------------------------------------- playing
// After a game: back to the menu, or straight into the last save after "Continue"
async function afterGame() {
  if (G.comfort <= 0 || G.g46c0 <= 0) {
    if (await askToContinue()) { await gammaFadeOut(8); G.continueAfterDeath = true; return; }
  }
  G.continueAfterDeath = false;
  await gammaFadeOut(8);
  drawMainMenu();
  if (Prefs.music) { setMusic(600); fadeMusic(true, 2); }
  await gammaFadeIn(8);
}

export async function newGame(startLevel) {
  Input.flushEvents();
  killAllSprites();
  initGameGlobals();
  G.haveSave = false;
  G.defaultWorld = true;
  let level = 1;
  if (startLevel) level = startLevel;
  else if (Input.isPressed(0x3a)) { // Option-click: warp (developer mode only)
    if (G.cheats) level = await warpDialog();
    else await message('Harry sez:\rNo more cheating!');
  } else if (G.cheats) level = worldW(0x1c4) || 1;
  try { openWorldLevel(level); } catch (e) { await message('An unexpected error occurred -- the level could not be loaded from the world file!'); return; }
  // (the original then resets the level counter to the world's first level, even after a warp)
  G.curLevel = G.curLevel2 = startLevel ? level : (worldW(0x1c4) || 1);
  await gammaFadeOut(8);
  drawGameFrame();
  const lv = G.level;
  await gameLoop(lv.startH - 32, lv.startV - 32, lv.startDir, true);
  await afterGame();
}

export async function continueGame(name) {
  Input.flushEvents();
  initGameGlobals();
  const sv = await openSG(name);
  if (!sv) return;
  killAllSprites();
  G.save = { ...sv };
  G.defaultWorld = sv.worldId === EPISODE1_ID;
  G.curLevel = G.curLevel2 = sv.level;
  G.comfort = G.g46be = sv.comfort;
  G.score = G.dispScore = sv.score;
  G.g46c0 = G.g46ba = sv.favor;
  G.legPower = G.g46bc = sv.legPower;
  [G.ammoStaple, G.ammoBadass, G.ammoShrapnel] = sv.ammo;
  sv.inventory.forEach((e, i) => { G.inventory[i].id = e.id; G.inventory[i].count = e.count; });
  G.saved = { comfort: sv.comfort, legPower: sv.legPower, favor: sv.favor, score: sv.score, ammo: sv.ammo.slice(),
    inventory: sv.inventory.map((e) => ({ ...e })) };
  G.restoreInventory = true; // g_7f1e
  if (!G.defaultWorld) { await message('This saved game belongs to a different world.'); return; }
  try { openWorldLevel(G.curLevel); } catch (e) { await message('An unexpected error occurred -- the level could not be loaded from the world file!'); return; }
  if (sv.copier) {
    G.keepTrackMap = true; // g_13c27
    TrackMap.set(unb64(sv.track));
    const records = unb64(sv.records), u8 = G.level.u8;
    u8.set(records, 0x10000);
    for (let i = 0; i < 256; i++) {
      const o = 0x10000 + i * 16;
      G.level.setW(o + 0xe, G.level.w(o + 0xe) + 6);
      G.level.setW(o + 0xc, G.level.w(o + 0xc) + 6);
    }
    u8.set(unb64(sv.custom), 0x11000);
  }
  await gammaFadeOut(8);
  drawGameFrame();
  if (sv.copier) await gameLoop(sv.playerH, sv.playerV, sv.dir, false);
  else {
    const lv = G.level;
    await gameLoop(lv.startH - 32, lv.startV - 32, lv.startDir, true);
  }
  await afterGame();
}

// ---------------------------------------------------------------- ShowMap (map key)
// A 112x112-cell window of the level at 4 px per cell: unexplored cells black, FG walls as mini tiles
// (PICT 170), solid FG black. The window is the middle of the level unless Harry is near an edge.
export async function showMap() {
  const scr = screen();
  const p = new Port(scr);
  p.rgbFore(0x451e, 0x451e, 0x451e);
  p.paintRect([16, 16, 464, 464]);
  const ph = G.playerH, pv = G.playerV;
  let oc = 8, or = 8;
  if (!(pv >= 0x500 && pv < 0xb40 && ph >= 0x500 && ph < 0xb40)) {
    oc = ph < 0x800 ? 0 : 16;
    or = pv < 0x800 ? 0 : 16;
  }
  const lv = G.level;
  for (let col = oc; col < oc + 112; col++) {
    for (let row = or; row < or + 112; row++) {
      const fg = lv.fg(col, row);
      const x = (col - oc) * 4 + 16, y = (row - or) * 4 + 16;
      if (!TrackMap[col * 128 + row]) { fillRect(scr, [y, x, y + 4, x + 4], 255); continue; }
      if (fg < 0 || (fg > 31 && fg < 56)) continue;
      if (fg >= 56) fillRect(scr, [y, x, y + 4, x + 4], 255);
      else if (Faces.particles[fg]) blitFace(scr, Faces.particles[fg], y, x, [16, 16, 464, 464], 0, 0);
    }
  }
  const mh = Math.trunc((ph + 32) / 8) - oc * 4, mv = Math.trunc((pv + 32) / 8) - or * 4;
  if (Faces.f720) blitFace(scr, Faces.f720, mv, mh, [16, 16, 464, 464], 0, 0);
  let debounce = 6;
  for (;;) {
    await waitTicks(2);
    if (debounce === 0 && (actionDown('map') || Input.nextClick())) break;
    if (debounce > 0) { debounce--; Input.flushEvents(); }
  }
  while (actionDown('map')) await nextFrame();
  Input.flushEvents();
}

// ---------------------------------------------------------------- main menu
const BUTTONS = [ // [left, top, right, bottom] (TrackClickOnCommandButton)
  [492, 44, 603, 70], [492, 75, 603, 101], [492, 106, 603, 132],
  [492, 137, 603, 163], [492, 168, 603, 195], [492, 200, 603, 226],
];
const inButton = (pt, b) => pt.h >= b[0] && pt.h < b[2] && pt.v >= b[1] && pt.v < b[3];

function drawPict(id, left, top) {
  const pic = getPicture(id);
  if (pic) copyBits(screen(), pic, 0, 0, top, left, pic.h, pic.w);
}

export function drawMainMenu() {
  killAllSprites();
  const scr = screen();
  fillRect(scr, [0, 0, 480, 640], 255);
  drawPict(130, 0, 0);
  // licence line (registration is moot now: Ambrosia's DecoderRing made Harry free)
  const text = 'This copy of Harry is licensed to: ' + (Prefs.playerName || 'Harry Fan');
  const p = new Port(scr);
  p.textFont(21); p.textFace(1); p.textSize(9);
  const w = p.stringWidth(text);
  const x = ((422 - w) >> 1) + 22;
  p.rgbFore(0, 0, 0); p.moveTo(x, 467); p.drawString(text);
  p.rgbFore(0x4444, 0x4444, 0x4444); p.moveTo(x + 2, 469); p.drawString(text);
  p.rgbFore(0xffff, 0xffff, 0xffff); p.moveTo(x + 1, 468); p.drawString(text);
  if (G.cheats) {
    p.textSize(36); p.foreColor(205);
    p.moveTo(64, 64); p.drawString('CHEAT MODE ENABLED');
  }
}

// TrackClickOnCommandButton(button, fromMouse): pressed art is PICT 4900+n, released 4910+n
async function trackButton(n, fromMouse) {
  const b = BUTTONS[n - 1];
  let inside = true;
  drawPict(4900 + n, b[0], b[1]);
  playRegSound(S(4803), 10, 85);
  if (fromMouse) {
    while (Input.mouseDown) {
      await nextFrame();
      const m = Input.mouse;
      const now = !m || inButton(m, b);
      if (now !== inside) {
        inside = now;
        drawPict(now ? 4900 + n : 4910 + n, b[0], b[1]);
        playRegSound(S(now ? 4803 : 4804), 10, 85);
      }
    }
  } else await waitTicks(10);
  if (inside) { drawPict(4910 + n, b[0], b[1]); playRegSound(S(4804), 10, 85); }
  return inside;
}

export async function instructions() {
  Input.flushEvents();
  drawPict(132, 32, 41);
}

// DOABOUTDIALOG(4803, 600): the credits PICT 4803 scrolls up (1 px per 3 ticks) through a window in
// the dialog's background PICT 4804 until the dialog is clicked.
export async function credits() {
  Input.flushEvents();
  const scr = screen();
  const [t, l, b, r] = [76, 122, 361, 322];
  const zm = zoomFor([t - 8, l - 8, b + 8, r + 8], 9); // (the credits are 9-10pt text in the pictures)
  const dev = zm.dev;
  const saved = scr.sub(dev[1], dev[0], dev[3] - dev[1], dev[2] - dev[0]);
  const p = new Port(scr).setZoom(zm);
  p.paintRect([t - 8, l - 8, b + 8, r + 8], 255);
  p.paintRect([t - 7, l - 7, b + 7, r + 7], 0);
  p.paintRect([t - 6, l - 6, b + 6, r + 6], 255);
  p.paintRect([t - 3, l - 3, b + 3, r + 3], 0);
  const back = getPicture(4804);
  if (back) p.drawPicture(back, 0, 0, t, l, back.h, back.w);
  const pic = getPicture(4803);
  const win = [t + 120, l + 34, t + 270, l + 170];
  let n = 0;
  for (let done = false; !done;) {
    p.paintRect(win, 0);
    if (pic) {
      const top = win[2] - n; // picture top, moving up
      const st = Math.max(0, win[0] - top), dt = Math.max(win[0], top);
      const h = Math.min(pic.h - st, win[2] - dt);
      if (h > 0) p.drawPicture(pic, st, 0, dt, win[1], h, Math.min(pic.w, win[3] - win[1]));
    }
    if (++n >= 150 + (pic ? pic.h : 0)) n = 0;
    await waitTicks(3);
    const c = unzoom(Input.nextClick(), zm);
    if (c && c.v >= t && c.v < b && c.h >= l && c.h < r) done = true;
    if (Input.nextKey()) done = true;
  }
  copyBits(scr, saved, 0, 0, dev[0], dev[1], saved.h, saved.w);
  Input.flushEvents();
}

export async function quit() {
  await fadeMusic(false, 1);
  await gammaFadeOut(8);
  G.quit = true;
}

export async function mainMenu() {
  let eggCooldown = 0;
  await gammaFadeOut(8);
  drawMainMenu();
  await gammaFadeIn(8);
  if (currentMusic() !== 600) setMusic(600);
  while (!G.quit) {
    await nextFrame();
    await Hooks.runCommands('menu');
    if (G.quit) break;
    let c;
    while ((c = Input.nextClick())) {
      const n = BUTTONS.findIndex((b) => inButton(c, b)) + 1;
      if (n && await trackButton(n, true)) await menuAction(n);
    }
    let k;
    while ((k = Input.nextKey())) {
      const n = { 0x2d: 1, 0x1f: 2, 0x0f: 2, 0x22: 3, 0x23: 4, 0x08: 5, 0x0c: 6 }[k.mac];
      if (n) { await trackButton(n, false); await menuAction(n); }
      else if (k.mac === 0x07 && !eggCooldown) {
        eggCooldown = 30;
        playRegSound(S(206), 10, 256);
        await message('But Mr. Horrible says, “I don’t mind, the thing that bothers me is — someone keeps moving my chair.”');
      }
    }
    if (G.continueAfterDeath) await continueGame(G.lastSave);
    if (eggCooldown > 0) eggCooldown--;
  }
}

async function menuAction(n) {
  switch (n) {
    case 1: await newGame(); break;
    case 2: await continueGame(null); break;
    case 3: await instructions(); break;
    case 4: if (hasHook('options')) await Hooks.options(); break;
    case 5: await credits(); break;
    case 6: await quit(); break;
  }
  Input.flushEvents();
}

register({ showMap, copierSave, doSaveGame, doCopierSaveGame, askToContinue, confirmAbortGame, newGame, continueGame,
  mainMenu, drawMainMenu, initGameGlobals, credits, instructions, quit });
