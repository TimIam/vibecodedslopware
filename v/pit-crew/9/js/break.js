// The Summer Shutdown: a long season's midseason break, between rounds 6 and 7.
// A splash says the break has begun, then one of the minigame scenes below (picked at
// random) runs until the player presses Continue Season. < and > step through the scenes.
//
// A scene module: `export default function make(ctx)` returning
//   { enter(), update(dt, io), draw(T, io), leave?() }
// ctx: { g (the 512x288 2D context), W, H, A (audio.js), done() }
//   done() marks the scene as finished: the Continue Season button starts to pulse.
// io (read it in update; keyboard codes are KeyboardEvent.code, e.g. 'KeyW', 'Space'):
//   io.held(code), io.pressed(code)  true for one update after the key goes down
//   io.mouse: { x, y, down, clicked, released }  in game pixels; clicked and released last one update
// The Continue Season button sits at CONTINUE (below), drawn over every scene and taking its
// own clicks: keep important art and controls out of that corner. Comma and Period are reserved.
import { W, H, rect, ellipse, poly, canvas } from './gfx.js';
import { text } from './font.js';
import { TEAMS } from './data.js';
import { rename } from './banter.js';
import * as A from './audio.js';

export const CONTINUE = { x: 396, y: 4, w: 112, h: 16 };

const SCENES = [
  ['fishing', './minigames/fishing.js'],
  ['arcade', './minigames/arcade.js'],
  ['bar', './minigames/snooker.js'],
  ['jetski', './minigames/jetski.js'],
  ['hiking', './minigames/hiking.js'],
];

// The garage with its shutter down and a note taped to it.
function bakeSplash() {
  const [c, b] = canvas(W, H);
  const tm = TEAMS[0];
  for (let y = 0; y < 120; y++) rect(b, 0, y, W, 1, `rgb(${70 + y},${150 + y * 0.6 | 0},${232})`);
  ellipse(b, 430, 44, 22, 22, '#ffe08a'); ellipse(b, 430, 44, 17, 17, '#fff4c0');
  for (const [x, y, w] of [[90, 30, 70], [230, 52, 50], [330, 22, 44]]) { ellipse(b, x, y, w / 2, 7, '#ffffff'); ellipse(b, x - 8, y - 5, w / 4, 6, '#ffffff'); }
  rect(b, 0, 120, W, H - 120, '#6a6e78');
  for (let y = 124; y < H; y += 5) rect(b, 0, y, W, 1, '#62666f');
  // garage front and shutter
  rect(b, 96, 34, 320, 176, '#d8dce2');
  rect(b, 96, 34, 320, 22, tm.c1); rect(b, 96, 34, 320, 3, tm.c2);
  rect(b, 110, 62, 292, 148, '#3a3e48');
  for (let y = 64; y < 210; y += 6) { rect(b, 112, y, 288, 5, '#8a909a'); rect(b, 112, y, 288, 1, '#a8aeb8'); }
  rect(b, 236, 200, 40, 8, '#2a2c34');
  // the sign taped to the shutter
  rect(b, 196, 104, 120, 44, '#05060a'); rect(b, 198, 106, 116, 40, '#fff6c8');
  poly(b, [[192, 100], [212, 104], [206, 112]], '#d8c88a'); poly(b, [[320, 100], [300, 104], [306, 112]], '#d8c88a');
  return c;
}

export function makeBreak({ g, button, mouse, onContinue }) {
  const held = new Set(), pressed = new Set();
  const m = { x: 0, y: 0, down: false, clicked: false, released: false };
  const io = { held: c => held.has(c), pressed: c => pressed.has(c), mouse: m };
  let phase = 'splash', idx = 0, cur = null, finished = false, t = 0, backdrop = null;
  const made = {};
  const inButton = (x, y) => x >= CONTINUE.x && y >= CONTINUE.y && x < CONTINUE.x + CONTINUE.w && y < CONTINUE.y + CONTINUE.h;

  const loaded = SCENES.map(([id, path]) => import(path).then(mod => { made[id] = mod.default; }).catch(e => console.error('[break]', id, e)));

  function show(i) {
    if (cur && cur.leave) cur.leave();
    idx = (i + SCENES.length) % SCENES.length;
    finished = false;
    held.clear(); pressed.clear();
    const id = SCENES[idx][0];
    if (!made[id]) { cur = null; return; }
    cur = made[id]({ g, W, H, A, done: () => { finished = true; } });
    cur.enter();
  }
  function begin() {
    phase = 'game';
    Promise.all(loaded).then(() => show(Math.floor(Math.random() * SCENES.length)));
  }

  return {
    enter() { phase = 'splash'; t = 0; cur = null; held.clear(); pressed.clear(); A.music('break'); A.setCrowd(0); A.setRain(0); A.duck(false); backdrop = bakeSplash(); },
    // all raw keys come here; only < and > stop the normal key handling
    raw(e, down) {
      const step = e.key === '>' || (e.code === 'Period' && e.shiftKey) ? 1 : e.key === '<' || (e.code === 'Comma' && e.shiftKey) ? -1 : 0;
      if (step) { if (down && phase === 'game' && !e.repeat) show(idx + step); return true; }
      if (down) { if (!e.repeat) { pressed.add(e.code); held.add(e.code); } if (phase === 'splash' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) begin(); }
      else held.delete(e.code);
      return false;
    },
    pointer(x, y) {
      if (phase === 'splash') { begin(); return null; }
      if (inButton(x, y)) return null;
      m.down = true; m.clicked = true;
      return null;
    },
    pointerUp() { if (m.down) { m.down = false; m.released = true; } },
    update(dt) {
      t += dt;
      const p = mouse();
      m.x = p.x; m.y = p.y;
      if (phase === 'game' && cur) cur.update(dt, io);
      pressed.clear();
      m.clicked = false; m.released = false;
    },
    draw() {
      const T = t; // the break keeps its own clock
      if (phase === 'splash') {
        g.drawImage(backdrop, 0, 0);
        text(g, TEAMS[0].short, W / 2, 41, '#ffffff', { align: 'center', scale: 2, shadow: '#05060a' });
        text(g, 'BACK IN', 256, 114, '#2a2410', { align: 'center' });
        text(g, 'TWO WEEKS', 256, 125, '#b02818', { align: 'center', scale: 1 });
        text(g, rename('- Mags'), 306, 136, '#2a2410', { align: 'right' });
        text(g, 'SUMMER SHUTDOWN', W / 2, 222, '#ffd23a', { align: 'center', scale: 3, outline: '#05060a' });
        text(g, 'THE TWO-WEEK MIDSEASON BREAK HAS BEGUN', W / 2, 250, '#ffffff', { align: 'center', outline: '#05060a' });
        return;
      }
      if (cur) cur.draw(T, io);
      else { rect(g, 0, 0, W, H, '#0a0c14'); }
      const pulse = finished && (T * 2.5 % 1) < 0.5;
      button(CONTINUE.x, CONTINUE.y, CONTINUE.w, CONTINUE.h, 'CONTINUE SEASON', onContinue, { hot: pulse, color: finished ? '#ff8a1e' : '#16b3a3' });
    },
    // dev hooks
    get scene() { return cur; },
    jump(id) { phase = 'game'; return Promise.all(loaded).then(() => show(SCENES.findIndex(s => s[0] === id))); },
  };
}
