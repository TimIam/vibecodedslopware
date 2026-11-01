// Boot: load the original resource files, initialise like main()/InitSprites/InitFaces/InitTiles,
// then hand control to the ported game flow.

import { Display, copyBits, fillRect } from './core/render.js';
import { attachInput } from './core/input.js';
import { onPresent, nextFrame } from './core/timing.js';
import { openResourceFiles, openTitleFile, fetchBytes, getPicture, Res, setWorldFile } from './core/res.js';
import { init3DProgBar, update3DProgBar } from './core/progbar.js';
import { Port, FONT_FACES } from './core/qd.js';
import { setMusic } from './game/music.js';
import { setInstrumentFile } from './game/tuneplayer.js';
import { ResFile } from './rsrc.js';
import { loadA5 } from './core/a5.js';
import { QD } from './core/util.js';
import { G } from './game/state.js';
import { register, Hooks } from './game/hooks.js';
import { initTiles, initTileHotRects, initTileMasks } from './game/tiles.js';
import { initPlayerSprite } from './game/player.js';
import { Game, gameLoop, openWorldLevel } from './game/game.js';
import './game/world.js';
import './game/flow.js';
import './game/collide.js';
import './game/hitplayer.js';
import { initHUD } from './game/hud.js';
import { initFaces } from './game/faces.js';
import { hasHook } from './game/hooks.js';
import './game/sprites/simple.js';
import './game/sprites/door.js';
import './game/sprites/message.js';
import './game/sprites/pushables.js';
import './game/sprites/collider.js';
import './game/sprites/effect.js';
import './game/sprites/enemyshot.js';
import './game/sprites/enemies.js';
import './game/sprites/weapons.js';
import './game/sprites/mechanisms.js';
import './game/sprites/people.js';
import './game/death.js';
import './game/sprites/boss.js';
import './game/ui.js';
import './game/options.js';
import './game/commands.js';

// InitSprites (seg 1): every sprite family loads its faces (order as in the original)
const SPRITE_INITS = ['Player', 'Plant', 'Chair', 'DartEnemy', 'EnemyShot', 'Barrel', 'Bonus', 'Collider',
  'Cooler', 'Door', 'Effect', 'Exit', 'Hazard', 'HeldWeapon', 'Item', 'Plant', 'PlayerShot', 'Ramp', 'CoWorker',
  'MailGuy', 'Message', 'Custom', 'Overhead', 'FirePipe', 'Robot', 'Grate', 'Ghost', 'Blob', 'Scientist',
  'Boulder', 'Turret', 'Reversor', 'Stairs', 'SlidingDoor', 'Button', 'Boss'];
function spriteInits() {
  const missing = [], steps = [];
  for (const n of SPRITE_INITS) {
    const fn = 'init' + n + 'Sprite';
    if (n === 'Player') continue; // initPlayerSprite runs separately (needs PlayerFaces first)
    if (hasHook(fn)) steps.push(() => Hooks[fn]()); else missing.push(n);
  }
  if (missing.length) console.info('Sprite families not ported yet:', [...new Set(missing)].join(', '));
  return steps;
}

const STARTUP_FACES = 1125;

export async function boot(canvas, status) {
  const disp = new Display(canvas);
  Game.display = disp;
  onPresent(() => disp.present());
  attachInput(window, canvas);
  status('Loading…');
  Hooks.loadPrefs();
  Hooks.applyDisplayPrefs();
  // the canvas text renderer needs the web fonts loaded before it draws anything
  const fonts = FONT_FACES.flatMap((f) => [`12px "${f}"`, `bold 12px "${f}"`]).map((f) => document.fonts.load(f).catch(() => {}));
  // main(): the title music, then the startup picture (PICT 128) with the loading bar on it
  fillRect(disp.screen, [0, 0, 480, 640], 255); // (a new screen bitmap is white: index 0)
  await openTitleFile('data/');
  status('');
  setMusic(600);
  await Hooks.gammaFadeOut(8);
  fillRect(disp.screen, [0, 0, 480, 640], 255);
  const title = getPicture(128);
  if (title) copyBits(disp.screen, title, 0, 0, 0, 0, title.h, title.w);
  await Hooks.gammaFadeIn(8);
  // Init3DProgBar(205, 423, 228). The original filled it as the sprite faces loaded (72/65536 each); here
  // the download fills the first half and the faces the second (STARTUP_FACES = what boot loads).
  const port = new Port(disp.screen);
  init3DProgBar(205, 423, 228);
  const files = {};
  let faces = 0;
  const show = () => {
    let got = 0, total = 0;
    for (const [g, t] of Object.values(files)) { got += g; total += t; }
    const dl = total ? got / total : 0;
    update3DProgBar(port, Math.round(dl * 0x8000 + Math.min(0x8000, (faces * 0x8000) / STARTUP_FACES)));
  };
  const track = (name) => (got, total) => { files[name] = [got, total]; show(); };
  // (and Harry's music instruments)
  const [, , , episode, instruments] = await Promise.all([openResourceFiles('data/', track), loadA5('data/'),
    Promise.all(fonts), fetchBytes('data/episode1.rsrc', track('episode1')),
    fetchBytes('data/instruments.rsrc', track('instruments')).catch(() => null)]);
  setWorldFile(new ResFile(episode, 'Episode 1'));
  if (instruments) setInstrumentFile(new ResFile(instruments, 'Harry Instruments'));
  QD.randSeed = (Date.now() / 1000) | 0; // Randomize: randSeed = Time
  // InitSprites / InitFaces / InitTiles / InitTileHotRects, letting the bar show between steps
  Res.onFace = () => { faces++; show(); };
  for (const step of [initTileHotRects, initTiles, initTileMasks, initPlayerSprite, initFaces, ...spriteInits(), initHUD]) {
    step();
    await nextFrame();
  }
  Res.onFace = null;
  update3DProgBar(port, 0x10000);
  await nextFrame();
  return disp;
}

export async function run(startLevel) {
  Hooks.initGameGlobals();
  if (startLevel) await Hooks.newGame(startLevel); // ?level=N (testing)
  await Hooks.mainMenu();
}

export async function playLevel(n) {
  openWorldLevel(n);
  G.curLevel = G.curLevel2 = n;
  const lv = G.level;
  await gameLoop(lv.startH - 32, lv.startV - 32, lv.startDir, false);
}

export { G, Hooks, register, Res };
