// The Summer Shutdown: a long season's midseason break, between rounds 6 and 7.
// A splash says the break has begun, then one of the minigame scenes below (picked at
// random) runs until the player presses Continue Season. < and > step through the scenes.
//
// A scene module: `export default function make(ctx)` returning
//   { enter(), update(dt, io), draw(T, io), leave?() }
// ctx: { g (the 512x288 2D context), W, H, A (audio.js), done(), data (whatever the host hands over) }
//   done() marks the scene as finished: the Continue Season button starts to pulse.
// io (read it in update; keyboard codes are KeyboardEvent.code, e.g. 'KeyW', 'Space'):
//   io.held(code), io.pressed(code)  true for one update after the key goes down
//   io.mouse: { x, y, down, clicked, released }  in game pixels; clicked and released last one update
// The Continue Season button sits at CONTINUE (below), drawn over every scene and taking its
// own clicks: keep important art and controls out of that corner. Comma and Period are reserved.
import { W, H, rect, ellipse, poly, canvas, mix, dith } from './gfx.js';
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
  ['laurels', './minigames/laurels.js', 'postseason'], // not part of the shutdown: only on its own host
];

// Team HQ in the Scottish hills: the garage with its shutter down and a note taped to it,
// the office block next door, and the moor going off behind them.
function bakeSplash() {
  const [c, b] = canvas(W, H);
  const tm = TEAMS[0];
  // a Highland sky: mostly cloud, with the odd bright gap
  for (let y = 0; y < 120; y++) rect(b, 0, y, W, 1, mix('#6f8fb8', '#dfe6e6', Math.min(1, y / 70)));
  ellipse(b, 462, 22, 13, 13, '#f8f0cc');
  for (const [x, y, w] of [[60, 16, 96], [196, 26, 74], [330, 12, 110], [486, 36, 70], [128, 38, 60]]) {
    ellipse(b, x, y + 2, w / 2, 7, '#b4bcc8'); ellipse(b, x - w * 0.14, y - 3, w / 3.4, 7, '#eceff2'); ellipse(b, x + w * 0.16, y - 1, w / 4, 6, '#f6f7f8'); ellipse(b, x, y, w / 2.6, 5, '#f2f3f5');
  }
  // three ridges: far munros in the haze, purple heather, then the near moor
  const far = x => 42 + 12 * Math.sin(x * 0.017 + 1) + 7 * Math.sin(x * 0.041 + 0.3) + 2.5 * Math.sin(x * 0.11);
  const mid = x => 66 + 9 * Math.sin(x * 0.012 + 2.4) + 6 * Math.sin(x * 0.037) + 1.5 * Math.sin(x * 0.13);
  const near = x => 104 + 6 * Math.sin(x * 0.02 + 0.5) + 3 * Math.sin(x * 0.06 + 1);
  for (let x = 0; x < W; x++) {
    const y = Math.round(far(x));
    rect(b, x, y, 1, 120 - y, Math.sin(x * 0.041 + 0.3) > 0.2 ? '#7f93b0' : '#8ea1bb');
  }
  for (let y = 50; y < 120; y++) for (let x = 0; x < W; x++) if (y >= mid(x)) {
    const n = Math.sin(x * 0.09 + y * 0.31) + Math.sin(x * 0.033 - y * 0.14);
    rect(b, x, y, 1, 1, n > 0.7 ? '#8a629e' : n > -0.3 ? (dith(x, y, 0.5) ? '#6f5a88' : '#785f92') : '#5d5a70');
  }
  // the loch, between the heather and the moor
  rect(b, 0, 92, W, 16, '#b4c8d6');
  for (let i = 0; i < 46; i++) rect(b, (i * 71) % W, 93 + (i * 13) % 14, 8 + (i % 5) * 4, 1, i % 3 ? '#cddce4' : '#9ab4c6');
  for (let y = 90; y < 178; y++) for (let x = 0; x < W; x++) if (y >= near(x)) {
    const n = Math.sin(x * 0.13 + y * 0.4) + Math.sin(x * 0.05 - y * 0.2);
    rect(b, x, y, 1, 1, n > 0.8 ? '#6f8a4c' : n > -0.4 ? (dith(x, y, 0.4) ? '#5d7a44' : '#54703e') : '#4a6238');
  }
  // gorse, a dry-stone wall, sheep
  for (let i = 0; i < 110; i++) { const x = (i * 83) % W, y = near(x) + 6 + (i * 37) % 62; rect(b, x, y, 3, 2, '#3f5a30'); if (i % 2) rect(b, x + 1, y, 1, 1, '#e8c83a'); }
  for (let x = 0; x < W; x += 2) { const y = Math.round(near(x) + 22 + Math.sin(x * 0.03) * 4); rect(b, x, y, 2, 2, x % 6 ? '#8a8a84' : '#a8a8a0'); rect(b, x, y + 2, 2, 1, '#4a4a44'); }
  for (const [x, dy] of [[452, 10], [468, 38], [480, 14], [494, 44], [6, 14], [502, 22]]) { const y = near(x) + dy; rect(b, x, y, 5, 3, '#ecece4'); rect(b, x + 5, y, 2, 2, '#26242a'); rect(b, x + 1, y + 3, 1, 1, '#26242a'); rect(b, x + 3, y + 3, 1, 1, '#26242a'); }
  // Scots pines, flat-topped, standing behind the buildings
  const pine = (x, base, h) => {
    rect(b, x - 1, base - h, 3, h, '#6a4228'); rect(b, x - 1, base - h, 1, h, '#a0663a');
    for (const [dx, dy, r] of [[-7, 0, 11], [6, 3, 10], [0, -5, 12], [-12, 7, 7], [11, 9, 7]]) { ellipse(b, x + dx, base - h + dy, r, r * 0.5, '#1f3a2a'); ellipse(b, x + dx - 1, base - h + dy - 1, r * 0.7, r * 0.3, '#2f5238'); }
  };
  pine(269, 170, 112); pine(470, 176, 96); pine(498, 176, 70);
  // the apron
  rect(b, 0, 176, W, H - 176, '#6a6e78');
  for (let y = 180; y < H; y += 5) rect(b, 0, y, W, 1, '#62666f');
  // garage front and shutter
  rect(b, 16, 92, 246, 118, '#d8dce2');
  rect(b, 16, 92, 246, 22, tm.c1); rect(b, 16, 92, 246, 3, tm.c2);
  rect(b, 28, 118, 222, 92, '#3a3e48');
  for (let y = 120; y < 210; y += 6) { rect(b, 30, y, 218, 5, '#8a909a'); rect(b, 30, y, 218, 1, '#a8aeb8'); }
  rect(b, 119, 201, 40, 7, '#2a2c34');
  // the sign taped to the shutter
  rect(b, 79, 138, 120, 44, '#05060a'); rect(b, 81, 140, 116, 40, '#fff6c8');
  poly(b, [[75, 134], [95, 138], [89, 146]], '#d8c88a'); poly(b, [[203, 134], [183, 138], [189, 146]], '#d8c88a');
  // a covered link to the office
  rect(b, 262, 142, 16, 68, '#b4b9c2'); rect(b, 262, 142, 16, 2, '#dfe2e8'); rect(b, 264, 150, 12, 14, '#4a6a88'); rect(b, 264, 150, 12, 3, '#7a9ab8');
  // the office block: glass floors over a front door shut for the fortnight, one light left on
  const ox = 278, ow = 170;
  rect(b, ox, 66, ow, 144, '#aeb4be'); rect(b, ox, 66, ow, 3, '#e4e7ec'); rect(b, ox + ow - 2, 66, 2, 144, '#8a909a');
  rect(b, ox, 71, ow, 15, tm.c1); rect(b, ox, 71, ow, 2, tm.c2);
  text(b, tm.short + ' HQ', ox + ow / 2, 76, '#ffffff', { align: 'center', shadow: '#05060a' });
  const lit = new Set(['1:5', '0:2']);
  for (let f = 0; f < 2; f++) for (let i = 0; i < 7; i++) {
    const x = ox + 8 + i * 22, y = 92 + f * 32, on = lit.has(f + ':' + i);
    rect(b, x - 1, y - 1, 21, 28, '#5c626c');
    rect(b, x, y, 19, 26, on ? '#ffd98a' : '#4a6a88');
    rect(b, x, y, 19, on ? 4 : 9, on ? '#c8a860' : '#7a9ab8');
    if (!on) for (let k = 0; k < 19; k++) if ((k + i * 3) % 7 < 2) rect(b, x + k, y + 11 + (k % 4), 1, 14 - (k % 4), '#567a98');
  }
  for (const x0 of [ox + 8, ox + 30, ox + 118, ox + 140]) { rect(b, x0 - 1, 159, 21, 37, '#5c626c'); rect(b, x0, 160, 19, 35, '#3e5a76'); rect(b, x0, 160, 19, 7, '#6a8aa8'); }
  const dx = ox + ow / 2 - 20;
  rect(b, dx, 164, 40, 46, '#23303e'); rect(b, dx + 19, 164, 2, 46, '#8a909a'); rect(b, dx + 2, 166, 15, 5, '#4a6a88'); rect(b, dx + 23, 166, 15, 5, '#4a6a88');
  rect(b, dx - 8, 158, 56, 5, tm.c1); rect(b, dx - 8, 158, 56, 1, tm.c2); rect(b, dx - 5, 163, 2, 47, '#8a909a'); rect(b, dx + 43, 163, 2, 47, '#8a909a');
  rect(b, dx + 24, 180, 13, 8, '#fff6c8'); rect(b, dx + 26, 183, 9, 1, '#b02818');
  for (const x of [dx - 12, dx + 52]) { rect(b, x - 5, 200, 10, 10, '#6a4a30'); rect(b, x - 5, 200, 10, 1, '#8a6a48'); ellipse(b, x, 196, 7, 7, '#2f5238'); ellipse(b, x - 1, 194, 4, 4, '#44703f'); }
  // the roof: plant room, dish and a saltire
  rect(b, ox + 22, 56, 44, 10, '#8a909a'); rect(b, ox + 22, 56, 44, 1, '#b4b9c2'); for (let x = ox + 26; x < ox + 64; x += 5) rect(b, x, 59, 3, 5, '#6a707a');
  ellipse(b, ox + 92, 60, 6, 4, '#dfe2e8'); rect(b, ox + 91, 62, 2, 4, '#8a909a');
  const fx = ox + ow - 10;
  rect(b, fx, 28, 2, 38, '#c8ccd4');
  rect(b, fx - 18, 29, 18, 12, '#1a55a8');
  for (let i = 0; i < 18; i++) { const y = Math.round(i * 11 / 17); rect(b, fx - 18 + i, 29 + y, 2, 2, '#ffffff'); rect(b, fx - 18 + i, 40 - y, 2, 2, '#ffffff'); }
  return c;
}

// only: scene ids this host offers. splash: show the shutdown splash first. label and song dress the host.
// reserved: key codes the scene wants for itself (kept away from the full screen and mute bindings).
export function makeBreak({ g, button, mouse, onContinue, only, splash = true, label = 'CONTINUE SEASON', song = 'break', reserved = [], data }) {
  const list = SCENES.filter(s => only ? only.includes(s[0]) : !s[2]);
  const held = new Set(), pressed = new Set();
  const m = { x: 0, y: 0, down: false, clicked: false, released: false };
  const io = { held: c => held.has(c), pressed: c => pressed.has(c), mouse: m };
  let phase = 'splash', idx = 0, cur = null, finished = false, t = 0, backdrop = null;
  const made = {};
  const inButton = (x, y) => x >= CONTINUE.x && y >= CONTINUE.y && x < CONTINUE.x + CONTINUE.w && y < CONTINUE.y + CONTINUE.h;

  const loaded = list.map(([id, path]) => import(path).then(mod => { made[id] = mod.default; }).catch(e => console.error('[break]', id, e)));

  function show(i) {
    if (cur && cur.leave) cur.leave();
    idx = (i + list.length) % list.length;
    finished = false;
    held.clear(); pressed.clear();
    const id = list[idx][0];
    if (!made[id]) { cur = null; return; }
    cur = made[id]({ g, W, H, A, done: () => { finished = true; }, data: typeof data === 'function' ? data() : data });
    cur.enter();
  }
  function begin() {
    phase = 'game';
    Promise.all(loaded).then(() => show(Math.floor(Math.random() * list.length)));
  }

  return {
    enter() { phase = 'splash'; t = 0; cur = null; held.clear(); pressed.clear(); A.music(song); A.setCrowd(0); A.setRain(0); A.duck(false); if (splash) backdrop = bakeSplash(); else begin(); },
    // all raw keys come here; only < and > stop the normal key handling
    raw(e, down) {
      const step = list.length < 2 || e.ctrlKey ? 0 : e.key === '>' || (e.code === 'Period' && e.shiftKey) ? 1 : e.key === '<' || (e.code === 'Comma' && e.shiftKey) ? -1 : 0;
      if (step) { if (down && phase === 'game' && !e.repeat) show(idx + step); return true; }
      if (down) { if (!e.repeat) { pressed.add(e.code); held.add(e.code); } if (phase === 'splash' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) begin(); }
      else held.delete(e.code);
      return reserved.includes(e.code);
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
        text(g, TEAMS[0].short, 139, 99, '#ffffff', { align: 'center', scale: 2, shadow: '#05060a' });
        text(g, 'BACK IN', 139, 148, '#2a2410', { align: 'center' });
        text(g, 'TWO WEEKS', 139, 159, '#b02818', { align: 'center', scale: 1 });
        text(g, rename('- Mags'), 189, 170, '#2a2410', { align: 'right' });
        text(g, 'SUMMER SHUTDOWN', W / 2, 222, '#ffd23a', { align: 'center', scale: 3, outline: '#05060a' });
        text(g, 'THE TWO-WEEK MIDSEASON BREAK HAS BEGUN', W / 2, 250, '#ffffff', { align: 'center', outline: '#05060a' });
        return;
      }
      if (cur) cur.draw(T, io);
      else { rect(g, 0, 0, W, H, '#0a0c14'); }
      const pulse = finished && (T * 2.5 % 1) < 0.5;
      button(CONTINUE.x, CONTINUE.y, CONTINUE.w, CONTINUE.h, label, onContinue, { hot: pulse, color: finished ? '#ff8a1e' : '#16b3a3' });
    },
    // dev hooks
    get scene() { return cur; },
    jump(id) { phase = 'game'; return Promise.all(loaded).then(() => show(list.findIndex(s => s[0] === id))); },
  };
}
