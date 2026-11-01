// Game flow (seg 1): GameLoop and its per-frame work. Menus/intro/outro live in ui.js.

import { G, Prefs } from './state.js';
import { SAT, SATNewSprite, SATSkip } from '../core/sat.js';
import { tickCount, waitUntil, nextFrame } from '../core/timing.js';
import { Res, getPicture, getResource, setWorldFile } from '../core/res.js';
import { copyBits, buildTables } from '../core/render.js';
import { Level } from '../core/level.js';
import { Hooks, register, hasHook } from './hooks.js';
import { HUD, drawGameFrame, updateInventory, initHUD } from './hud.js';
import { setupLevelSprites, handleIdleSprites, checkTileCollisions, checkPlayerCollision, eraseSprites,
  findUpperLeftCorner, drawPlayfield, updateTrackMap } from './world.js';
import { setupPlayerSprite, handlePlayerSprite } from './player.js';
import { updateDynamicSounds } from './sound.js';
import { UIState } from '../core/input.js';

export const Game = { display: null };

// OpenDefaultWorldLevel(level): load Hlvl `level` from the world file into G.level
export function openWorldLevel(n) {
  const d = Res.world.get('Hlvl', n);
  if (!d) throw new Error('Tried to open a level that was not there: ' + n);
  G.level = new Level(d);
}

// HandleSprites: SATSkip + CheckPlayerCollision
function handleSprites() {
  SATSkip();
  if (!G.playerDead) checkPlayerCollision();
}

// GameLoop(startH, startV, startDir, showIntro)
export async function gameLoop(h, v, dir, showIntro) {
  UIState.inGame = true;
  try { await runGameLoop(h, v, dir, showIntro); } finally { UIState.inGame = false; UIState.paused = false; }
}
async function runGameLoop(h, v, dir, showIntro) {
  const disp = Game.display;
  const screen = disp.screen;
  drawGameFrame();
  await Hooks.fadeMusic(false, 4);
  setupLevelSprites();
  G.playerDir = dir;
  const p = SATNewSprite(0, h, v, setupPlayerSprite);
  G.player = p;
  p.dir = dir;
  G.playerH = h - 32; G.playerV = v - 32;
  G.viewLeft = G.scrollLeft = G.viewLeft2 = h - 208;
  G.viewTop = G.scrollTop = G.viewTop2 = v - 208;
  if (hasHook('setupHeldWeaponSprite')) SATNewSprite(0, h, v, Hooks.setupHeldWeaponSprite);
  Hooks.updateMeters(false);
  Hooks.updateText(false);
  updateInventory();
  if (showIntro && G.level.info(6)) {
    await Hooks.gammaFadeIn(8);
    await Hooks.scrollPlot(G.level.info(6), true);
    await Hooks.gammaFadeOut(8);
  }
  await Hooks.introLevel();
  Hooks.setMusic(G.level.music);
  await Hooks.fadeMusic(true, 2);
  G.levelDone = false;
  buildTables();
  findUpperLeftCorner();
  let frames = 0;
  while (!G.levelDone) {
    const start = tickCount();
    handleIdleSprites();
    handleSprites();
    if (G.modal) await Hooks.runModal(); // ShowBalloon & co. (blocking in the original)
    frames++;
    findUpperLeftCorner();
    G.scrollLeft = Math.max(0, Math.min(G.viewLeft, 0xe40));
    G.scrollTop = Math.max(0, Math.min(G.viewTop, 0xe40));
    checkTileCollisions();
    eraseSprites();
    drawPlayfield(screen);
    G.ripplePhase += G.level.w(0x1208c);
    Hooks.updateText(true);
    Hooks.updateMeters(true);
    Hooks.updateAmmo(true);
    await Hooks.checkGameEvents();
    await Hooks.checkGameLoopKeys();
    updateDynamicSounds();
    updateTrackMap();
    G.prevScrollLeft = G.scrollLeft; G.prevScrollTop = G.scrollTop;
    await waitUntil(start + (Prefs.reduceFrameRate ? 4 : 2));
  }
  if (G.comfort <= 0 || G.g46c0 <= 0) await Hooks.endLevelEffect();
}

register({ handlePlayerSprite, gameLoop, openWorldLevel });
