// VIBEARCADE: drop-in 8-bit arcade cabinets for any game on the site. See README.md for embedding.
//
//   import { Arcade } from '/arcade/arcade.js';   (also sets window.VibeArcade for classic scripts)
//   const result = await Arcade.play('fishing');  // full-screen "sit at the machine", resolves on exit
//   const cab = Arcade.create('fishing');         // headless: cab.canvas is a texture, cab.update(dt) runs it
//
// Everything renders to one 256x240 canvas at a fixed 60 Hz. A game is a module exporting
// { id, title, genre, blurb, controls, create(a) } where create returns { update(), draw(g), bot() }.
import { W, H, C, spr, makeGfx } from './gfx.js';
import { sfx, unlockAudio, setAudioMuted } from './audio.js';
import fishing from './games/fishing.js';
import techdebt from './games/techdebt.js';
import unsubscribe from './games/unsubscribe.js';
import doze from './games/doze.js';
import suckitup from './games/suckitup.js';
import guerrilla from './games/guerrilla.js';

export const GAMES = [fishing, techdebt, unsubscribe, doze, suckitup, guerrilla];
const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'back'];
const DEMO_TICKS = 60 * 18, HOME_TICKS = 60 * 9;

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', Space: 'a', KeyJ: 'a', KeyX: 'b', KeyK: 'b', ShiftLeft: 'b', Enter: 'start', Escape: 'back',
};

const find = id => GAMES.find(g => g.id === id);
const empty = () => Object.fromEntries(BUTTONS.map(b => [b, false]));

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class Cabinet {
  constructor(id = 'menu', opts = {}) {
    if (id !== 'menu' && !find(id)) throw new Error(`VibeArcade: no game "${id}" (have: ${GAMES.map(g => g.id).join(', ')})`);
    this.id = id; this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = makeGfx(this.canvas);
    this.list = opts.games ? opts.games.map(find).filter(Boolean) : GAMES;
    this.sound = opts.sound ?? false; // headless cabinets stay silent unless asked
    this.storage = opts.storage !== false;
    this.seed = opts.seed;
    this.held = empty(); this.prev = empty();
    this.cur = this.held; this.last = this.prev; // what the running game reads: the player or its bot
    this.acc = 0; this.tick = 0; this.modeT = 0;
    this.score = 0; this.hi = 0;
    this.cursor = 0; this.demoNext = 0;
    this.autoplay = false; // tests: the game's bot plays a real, scoring game
    this.def = id === 'menu' ? null : find(id);
    if (this.def) this.loadHi();
    this.mode = id === 'menu' ? 'menu' : 'title';
    this.game = null; this.shakeN = 0; this.msg = ''; this.isHi = false; this.denied = 0;
    this.render();
  }

  /* host-facing */
  press(button, down = true) { if (button in this.held) this.held[button] = !!down; }
  releaseAll() { for (const b of BUTTONS) this.held[b] = false; }
  update(dt) {
    this.acc = Math.min(this.acc + dt, 0.1);
    let stepped = false;
    while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.step(); stepped = true; }
    if (stepped) this.render();
  }
  start(id) { if (id && find(id)) this.def = find(id); return this.launch(false); }
  destroy() { this.dead = true; }
  get playing() { return this.mode === 'play'; }

  /* internals */
  hiKey() { return `vibearcade.hi.${this.def.id}`; }
  loadHi() { let v = 0; if (this.storage) try { v = +localStorage.getItem(this.hiKey()) || 0; } catch {} this.hi = Math.max(v, this.def.hiScore || 0); }
  saveHi() { if (this.storage) try { localStorage.setItem(this.hiKey(), this.hi); } catch {} }
  home() { return this.id === 'menu' ? 'menu' : 'title'; }
  setMode(m) { this.mode = m; this.modeT = 0; }

  launch(demo) {
    if (!demo && this.opts.onStart?.({ id: this.def.id }) === false) { this.denied = 90; return false; }
    this.loadHi();
    const rnd = mulberry(this.seed ?? ((Math.random() * 2 ** 32) >>> 0));
    this.demo = demo; this.score = 0; this.isHi = false; this.msg = ''; this.shakeN = 0; this.bot = empty();
    const cab = this;
    const api = {
      demo, get t() { return cab.modeT; },
      held: b => !!cab.cur[b], hit: b => !!cab.cur[b] && !cab.last[b],
      rand: () => rnd(), rint: n => Math.floor(rnd() * n), chance: p => rnd() < p, pick: arr => arr[Math.floor(rnd() * arr.length)],
      add: n => { cab.score += n; }, get score() { return cab.score; },
      sfx: name => { if (cab.sound && !cab.demo) sfx(name); },
      shake: n => { cab.shakeN = Math.max(cab.shakeN, n); },
      over: msg => cab.gameOver(msg),
    };
    this.game = this.def.create(api);
    this.setMode(demo ? 'demo' : 'play');
    if (!demo) api.sfx('start');
    return true;
  }

  gameOver(msg = '') {
    if (this.mode !== 'play' && this.mode !== 'demo') return;
    if (this.mode === 'demo') { this.goHome(); return; }
    this.msg = msg;
    this.isHi = this.score > this.hi && this.score > 0;
    if (this.isHi) { this.hi = this.score; this.saveHi(); }
    this.setMode('over');
    if (this.sound) sfx('over');
    this.opts.onGameOver?.({ id: this.def.id, score: this.score, hi: this.hi, isHi: this.isHi, msg });
  }

  goHome() { this.game = null; if (this.id === 'menu') this.def = null; this.setMode(this.home()); }

  leave() {
    if (this.mode === this.home()) { this.opts.onExit?.({ id: this.def?.id ?? 'menu', score: this.score, hi: this.hi }); return; }
    this.goHome();
  }

  startDemo() {
    this.def = this.id === 'menu' ? this.list[this.demoNext++ % this.list.length] : this.def;
    this.launch(true);
  }

  step() {
    if (this.dead) return;
    this.tick++; this.modeT++;
    if (this.denied) this.denied--;
    const h = this.held, p = this.prev;
    const hit = b => h[b] && !p[b];
    const go = hit('a') || hit('start');
    if (hit('back')) { this.leave(); }
    else switch (this.mode) {
      case 'menu': {
        if (hit('up')) { this.cursor = (this.cursor + this.list.length - 1) % this.list.length; this.modeT = 0; this.blip(); }
        if (hit('down')) { this.cursor = (this.cursor + 1) % this.list.length; this.modeT = 0; this.blip(); }
        if (go) { this.def = this.list[this.cursor]; if (!this.launch(false)) this.def = null; }
        else if (this.modeT > HOME_TICKS) this.startDemo();
        break;
      }
      case 'title':
        if (go) this.launch(false);
        else if (this.modeT > HOME_TICKS) this.startDemo();
        break;
      case 'demo':
        if (go) { this.goHome(); if (this.id !== 'menu') this.launch(false); break; }
        this.runGame(true);
        if (this.mode === 'demo' && this.modeT > DEMO_TICKS) this.goHome();
        break;
      case 'play':
        if (hit('start')) { this.setPause(); break; }
        this.runGame(this.autoplay);
        break;
      case 'pause':
        if (hit('start') || hit('a')) this.mode = 'play';
        break;
      case 'over':
        if (this.modeT > 40 && go) this.launch(false);
        break;
    }
    Object.assign(this.prev, this.held);
  }

  setPause() { this.mode = 'pause'; if (this.sound) sfx('blip'); }
  blip() { if (this.sound) sfx('blip'); }

  runGame(useBot) {
    if (useBot) {
      this.botPrev = this.bot; this.bot = { ...empty(), ...(this.game.bot?.() ?? {}) };
      this.cur = this.bot; this.last = this.botPrev;
    } else { this.cur = this.held; this.last = this.prev; }
    this.game.update();
    if (this.shakeN > 0) this.shakeN -= 0.5;
  }

  render() {
    const g = this.g;
    g.reset();
    if (this.mode === 'menu') this.drawMenu(g);
    else if (this.mode === 'title') this.drawTitle(g);
    else {
      if (this.shakeN > 0) g.offset(Math.round((Math.random() - .5) * this.shakeN), Math.round((Math.random() - .5) * this.shakeN));
      this.game.draw(g);
      g.reset();
      this.drawHud(g);
      if (this.mode === 'demo') this.drawDemo(g);
      if (this.mode === 'pause') { g.panel(84, 104, 88, 26); g.center('PAUSED', 113, C.y); }
      if (this.mode === 'over') this.drawOver(g);
    }
  }

  drawHud(g) {
    g.rect(0, 0, W, 10, C.k);
    g.text('SCORE ' + String(this.score).padStart(7, '0'), 2, 1, C.w);
    g.text('HI ' + String(Math.max(this.hi, this.score)).padStart(7, '0'), W - 2 - 10 * 6, 1, C.y);
  }

  drawDemo(g) {
    g.rect(0, 118, W, 24, '#000000b0');
    g.center(this.def.title, 121, C.y);
    if ((this.tick >> 5) & 1) g.center('PRESS START', 131, C.w);
  }

  drawOver(g) {
    const h = this.msg ? 70 : 58;
    g.panel(40, 78, 176, h);
    g.center('GAME OVER', 86, C.r, 2);
    let y = 106;
    if (this.msg) { g.center(this.msg, y, C.G); y += 12; }
    g.center(`SCORE ${this.score}`, y, C.w); y += 11;
    g.center(this.isHi ? 'NEW HIGH SCORE!' : `HI ${this.hi}`, y, this.isHi ? (this.tick & 8 ? C.y : C.o) : C.y);
  }

  drawTitle(g) {
    const d = this.def;
    this.drawBackdrop(g);
    const s = d.title.length > 10 ? 2 : 3;
    g.center(d.title, 48, C.k, s, 1); g.center(d.title, 46, C.y, s);
    g.center(d.genre, 74, C.c);
    g.wrap(d.blurb, 24, 96, 208, C.w);
    d.controls.forEach((c, i) => g.center(c, 142 + i * 11, C.G));
    if (this.denied) g.center('INSERT COIN', 200, C.r);
    else if ((this.tick >> 5) & 1) g.center('PRESS START', 200, C.w);
    if (this.hi) g.center(`HI ${this.hi}`, 216, C.y);
  }

  drawMenu(g) {
    this.drawBackdrop(g);
    g.center('VIBEARCADE', 14, C.k, 3, 1); g.center('VIBEARCADE', 12, C.y, 3);
    g.center(`${this.list.length}-IN-1 CABINET`, 40, C.c);
    this.list.forEach((d, i) => {
      const y = 58 + i * 15, on = i === this.cursor;
      if (on) { g.rect(16, y - 3, 224, 13, C.B); if ((this.tick >> 4) & 1) g.text('>', 20, y, C.y); }
      g.text(d.title, 32, y, on ? C.y : C.w);
      g.textR(d.genre, 234, y, on ? C.c : C.g);
    });
    const d = this.list[this.cursor], top = 58 + this.list.length * 15 + 2;
    g.wrap(d.blurb, 16, top, 224, C.G);
    if (this.denied) g.center('INSERT COIN', 226, C.r);
    else if ((this.tick >> 5) & 1) g.center('PRESS START', 226, C.w);
  }

  drawBackdrop(g) {
    g.clear(C.B);
    for (let y = 0; y < H; y += 16) for (let x = (y >> 4) & 1 ? 0 : 16; x < W; x += 32) g.rect(x, y, 16, 16, '#1e3180');
  }
}

/* ---------- ways of putting a cabinet in a page ---------- */

// Headless: you draw cab.canvas (drawImage, THREE.CanvasTexture) and call cab.update(dt). Runs its attract loop until played.
export function create(id, opts) { return new Cabinet(id, opts); }

function bindKeys(cab) {
  const editing = e => e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '');
  const down = e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code) || editing(e)) return;
    unlockAudio();
    const b = KEYMAP[e.code];
    if (b) cab.press(b, true);
    e.preventDefault();
    e.stopImmediatePropagation(); // the host must not walk the player around while they're at the machine
  };
  // keyup is deliberately left to reach the host: a key held on sitting down must still release there
  const up = e => { const b = KEYMAP[e.code]; if (b) cab.press(b, false); };
  const blur = () => cab.releaseAll();
  addEventListener('keydown', down, true);
  addEventListener('keyup', up, true);
  addEventListener('blur', blur);
  return () => { removeEventListener('keydown', down, true); removeEventListener('keyup', up, true); removeEventListener('blur', blur); };
}

function touchPad(cab, root) {
  const css = 'position:absolute;display:grid;place-items:center;border:2px solid #fff6;border-radius:12px;background:#0005;color:#fffc;font:bold 14px monospace;touch-action:none;user-select:none;-webkit-user-select:none';
  const key = (label, button, style) => {
    const k = document.createElement('div');
    k.textContent = label; k.style.cssText = `${css};${style}`;
    const set = v => e => { e.preventDefault(); unlockAudio(); cab.press(button, v); k.style.background = v ? '#fff5' : '#0005'; };
    k.addEventListener('pointerdown', set(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) k.addEventListener(ev, set(false));
    root.appendChild(k);
  };
  const s = 'width:52px;height:52px';
  key('▲', 'up', `${s};left:62px;bottom:122px`); key('▼', 'down', `${s};left:62px;bottom:18px`);
  key('◀', 'left', `${s};left:10px;bottom:70px`); key('▶', 'right', `${s};left:114px;bottom:70px`);
  key('A', 'a', 'width:68px;height:68px;right:14px;bottom:70px;border-radius:50%');
  key('B', 'b', 'width:56px;height:56px;right:92px;bottom:20px;border-radius:50%');
  key('START', 'start', 'width:76px;height:30px;left:calc(50% - 38px);bottom:8px;font-size:11px');
}

// Live inside an element of yours. Takes the keyboard until cab.destroy().
export function mount(el, id, opts = {}) {
  const cab = new Cabinet(id, { sound: true, ...opts });
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  cab.canvas.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;image-rendering:pixelated;image-rendering:crisp-edges';
  el.appendChild(cab.canvas);
  const unkey = opts.keys === false ? null : bindKeys(cab);
  const pad = document.createElement('div');
  pad.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  if (opts.touch ?? matchMedia('(pointer:coarse)').matches) {
    touchPad(cab, pad);
    for (const k of pad.children) k.style.pointerEvents = 'auto';
    el.appendChild(pad);
  }
  let last = performance.now();
  const frame = now => {
    if (cab.dead) return;
    cab.update(Math.min((now - last) / 1000, 0.1)); last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const destroy = cab.destroy.bind(cab);
  cab.destroy = () => { destroy(); unkey?.(); cab.canvas.remove(); pad.remove(); };
  return cab;
}

// One line for "player walked up and pressed E". Resolves with { id, score, hi, best } when they leave.
export function play(id = 'menu', opts = {}) {
  return new Promise(resolve => {
    document.exitPointerLock?.();
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#000d;font:bold 13px/1 monospace;color:#b9b9c4';
    const frame = document.createElement('div');
    frame.style.cssText = 'position:relative;width:min(92vw,calc(92vh * 1.0667));aspect-ratio:256/240;background:#000;border:10px solid #23232e;border-radius:14px;box-shadow:0 0 0 2px #4a4a58,0 20px 70px #000;overflow:hidden';
    const lines = document.createElement('div');
    lines.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;background:repeating-linear-gradient(#0000 0 2px,#0003 2px 4px)';
    const close = document.createElement('button');
    close.textContent = '✕ ESC';
    close.style.cssText = 'position:fixed;top:12px;right:12px;padding:8px 12px;font:inherit;color:inherit;background:#23232e;border:1px solid #4a4a58;border-radius:8px;cursor:pointer';
    frame.appendChild(lines); root.append(frame, close); document.body.appendChild(root);
    let best = 0;
    const finish = () => {
      const r = { id: cab.def?.id ?? id, score: cab.score, hi: cab.hi, best };
      cab.destroy(); root.remove(); resolve(r);
    };
    const cab = mount(frame, id, {
      ...opts, onExit: finish,
      onGameOver: o => { best = Math.max(best, o.score); opts.onGameOver?.(o); },
    });
    close.onclick = finish;
  });
}

export { W, H, C, spr };
export const Arcade = { GAMES, create, mount, play, W, H };
globalThis.VibeArcade = Arcade;
