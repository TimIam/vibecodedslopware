// The VibeArcade floor: walk around an 8-bit room where every machine plays itself, and sit down at the one you want.
// One 256x240 canvas with a scrolling camera. /arcade/ opens this; other games embed cabinets through arcade.js instead.
import { W, H, C, spr, makeGfx } from './gfx.js';
import { GAMES, create, play, attach } from './arcade.js';
import { sfx } from './audio.js';

const WORLD_W = 416, WORLD_H = 440, WALL_Y = 146;
const SPEED = 1.7, PLAYER_SCALE = 2;
const CAB_W = 84, CAB_H = 124, SCREEN_W = 64, SCREEN_H = 60;
// Back-row machines stand against the wall; the front row is an island you walk around but not behind.
const BACK_FEET = 160, FRONT_FEET = 340, FRONT_DEPTH = 118;
const COLS = [88, 208, 328];
const LOOKS = { fishing: [C.c, C.b], techdebt: [C.l, C.E], unsubscribe: [C.p, C.P], doze: [C.y, C.Y], suckitup: [C.o, C.N], guerrilla: [C.e, C.R] };
const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'back'];
const none = () => Object.fromEntries(BUTTONS.map(b => [b, false]));

/* ---------- the player ---------- */
const TORSO = ['...ooooooo...', '..ooooooooo..', '..tooooooot..', '..tooooooot..', '...ooooooo...'];
const FRONT_HEAD = ['....NNNNN....', '...NNNNNNN...', '...NkttktN...', '...NtttttN...', '....ttttt....'];
const BACK_HEAD = ['....NNNNN....', '...NNNNNNN...', '...NNNNNNN...', '...NNNNNNN...', '....NNNNN....'];
const SIDE_HEAD = ['....NNNNN....', '...NNNNNNN...', '...NNttktt...', '...NNtttt....', '....ttttt....'];
const LEGS = {
  stand: ['...bbb.bbb...', '...bbb.bbb...', '...www.www...'],
  left: ['...bbb.bbb...', '...bbb......', '...www......'],
  right: ['...bbb.bbb...', '.......bbb...', '.......www...'],
};
const frames = head => [LEGS.stand, LEGS.left, LEGS.stand, LEGS.right].map(l => spr([...head, ...TORSO, ...l]));
const WALK = { down: frames(FRONT_HEAD), up: frames(BACK_HEAD), left: frames(SIDE_HEAD), right: frames(SIDE_HEAD) };

function titleLines(title) {
  if (title.length <= 12) return [title];
  const words = title.split(' ');
  let top = words.shift();
  while (words.length && `${top} ${words[0]}`.length <= 12) top += ` ${words.shift()}`;
  return [top, words.join(' ')];
}

class Room {
  constructor(opts = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = makeGfx(this.canvas);
    this.button = opts.touch ? 'A' : 'Z';
    this.held = none(); this.prev = none();
    this.acc = 0; this.tick = 0; this.dead = false; this.busy = false;
    this.player = { x: 208, y: 396, dir: 'up', step: 0 };
    this.moved = false; this.near = null;
    this.bg = this.g.layer(WORLD_W, WORLD_H, s => this.paintRoom(s));
    this.cabinets = GAMES.map((def, i) => {
      const y = i < 3 ? BACK_FEET : FRONT_FEET, x = COLS[i % 3], cab = create(def.id, { attractText: false });
      cab.launch(true);
      return { def, x, y, cab, accent: LOOKS[def.id][0], body: this.g.layer(CAB_W, CAB_H, s => this.paintCabinet(s, def)), depth: i < 3 ? 14 : FRONT_DEPTH };
    });
    this.camera();
    this.render();
  }

  press(button, down = true) { if (button in this.held) this.held[button] = !!down; }
  releaseAll() { for (const b of BUTTONS) this.held[b] = false; }
  destroy() { this.dead = true; }

  update(dt) {
    if (this.busy) return;
    this.acc = Math.min(this.acc + dt, 0.1);
    let stepped = false;
    while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.step(); stepped = true; }
    for (const c of this.cabinets) {
      c.cab.update(dt);
      if (c.cab.mode !== 'demo') { c.cab.launch(true); c.cab.render(); } // the demo ended: straight into another
    }
    if (stepped) this.render();
  }

  step() {
    if (this.busy) return;
    this.tick++;
    const h = this.held, p = this.player;
    const hit = b => h[b] && !this.prev[b];
    let dx = (h.right ? 1 : 0) - (h.left ? 1 : 0), dy = (h.down ? 1 : 0) - (h.up ? 1 : 0);
    if (dx || dy) {
      const k = SPEED / Math.hypot(dx, dy);
      this.walk(dx * k, 0); this.walk(0, dy * k);
      p.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
      p.step += 0.14;
      this.moved = true;
    } else p.step = 0;
    this.camera();
    const near = this.cabinets.find(c => Math.abs(p.x - c.x) < 38 && p.y >= c.y && p.y < c.y + 24) ?? null;
    if (near && near !== this.near) sfx('blip');
    this.near = near;
    const sit = near && (hit('a') || hit('start'));
    Object.assign(this.prev, h);
    if (sit) this.sit(near);
  }

  walk(dx, dy) {
    const p = this.player, nx = p.x + dx, ny = p.y + dy;
    if (nx < 26 || nx > WORLD_W - 26 || ny < BACK_FEET + 2 || ny > WORLD_H - 34) return;
    for (const c of this.cabinets) if (Math.abs(nx - c.x) < CAB_W / 2 + 6 && ny > c.y - c.depth && ny < c.y + 1) return;
    p.x = nx; p.y = ny;
  }

  camera() {
    const clamp = (v, hi) => Math.max(0, Math.min(hi, Math.round(v)));
    this.camX = clamp(this.player.x - W / 2, WORLD_W - W);
    this.camY = clamp(this.player.y - 20 - H / 2, WORLD_H - H);
  }

  async sit(c) {
    this.busy = true;
    this.releaseAll(); this.keysOff();
    await play(c.def.id);
    c.cab.loadTop(); // the score the player just set belongs on this machine's sign
    this.releaseAll(); Object.assign(this.prev, none());
    this.keysOn();
    this.busy = false;
  }

  /* ---------- drawing ---------- */

  paintRoom(s) {
    let seed = 7;
    const r = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    s.rect(0, 0, WORLD_W, WORLD_H, '#141230');
    // carpet: dark with scattered neon scraps
    const scraps = [C.m, C.c, C.y, C.l, C.o];
    for (let i = 0; i < 420; i++) {
      const x = r(WORLD_W), y = WALL_Y + r(WORLD_H - WALL_Y), col = scraps[r(5)], kind = r(3);
      if (kind === 0) s.rect(x, y, 4, 1, col);
      else if (kind === 1) { s.rect(x, y, 1, 3, col); s.rect(x, y + 3, 3, 1, col); }
      else { s.rect(x, y, 2, 2, col); }
    }
    // back wall
    s.rect(0, 0, WORLD_W, WALL_Y, '#241c52');
    for (let y = 8; y < WALL_Y; y += 16) s.rect(0, y, WORLD_W, 1, '#2e2466');
    s.rect(0, WALL_Y - 8, WORLD_W, 8, C.P);
    s.rect(0, WALL_Y, WORLD_W, 2, C.k);
    // neon sign
    s.rect(WORLD_W / 2 - 74, 6, 148, 26, C.k);
    s.box(WORLD_W / 2 - 74, 6, 148, 26, C.m);
    s.box(WORLD_W / 2 - 72, 8, 144, 22, C.c);
    s.text('VIBEARCADE', WORLD_W / 2 - 59, 11, C.y, 2);
    // side and front walls, the way in
    s.rect(0, WALL_Y, 16, WORLD_H - WALL_Y, '#241c52');
    s.rect(WORLD_W - 16, WALL_Y, 16, WORLD_H - WALL_Y, '#241c52');
    s.rect(0, WORLD_H - 22, WORLD_W, 22, '#241c52');
    s.rect(WORLD_W / 2 - 26, WORLD_H - 24, 52, 24, C.N);
    s.rect(WORLD_W / 2 - 22, WORLD_H - 20, 44, 20, '#d8f0f8');
    s.rect(WORLD_W / 2, WORLD_H - 20, 1, 20, C.N);
    s.rect(WORLD_W / 2 - 30, WORLD_H - 36, 60, 12, C.K);
  }

  paintCabinet(s, def) {
    const [accent, body] = LOOKS[def.id], w = CAB_W, h = CAB_H;
    s.rect(0, 0, w, h, body);
    s.rect(0, 0, 4, h, C.k); s.rect(w - 4, 0, 4, h, C.k); // side panels
    s.rect(4, 0, w - 8, 24, accent);
    s.rect(4, 22, w - 8, 2, C.k);
    const lines = titleLines(def.title);
    lines.forEach((t, i) => s.text(t, ((w - s.width(t)) >> 1), lines.length > 1 ? 3 + i * 9 : 8, C.k));
    s.rect(6, 25, w - 12, 68, C.K);       // bezel
    s.rect(6, 94, w - 12, 13, C.G);       // control panel
    s.rect(6, 106, w - 12, 1, C.k);
    s.rect(20, 95, 2, 7, C.k); s.rect(18, 93, 6, 4, C.r); // stick
    s.rect(52, 97, 5, 5, C.r); s.rect(61, 97, 5, 5, C.y); // buttons
    s.rect(30, 110, 24, 12, C.k);         // coin door
    s.rect(35, 113, 3, 6, C.y); s.rect(46, 113, 3, 6, C.y);
  }

  drawCabinet(g, c) {
    const x = c.x - CAB_W / 2, y = c.y - CAB_H, lit = c === this.near;
    g.rect(c.x - 34, c.y, 68, 10, `${c.accent}${lit ? '60' : (this.tick >> 3) & 1 ? '26' : '20'}`); // the screen's glow on the carpet
    g.spr(c.body, x, y);
    g.c.imageSmoothingEnabled = true; // downscaled 4:1, nearest-neighbour turns a game into noise
    g.c.imageSmoothingQuality = 'high';
    g.c.drawImage(c.cab.canvas, c.x - SCREEN_W / 2, y + 29, SCREEN_W, SCREEN_H);
    g.c.imageSmoothingEnabled = false;
    if (lit && this.tick & 16) g.box(x - 2, y - 2, CAB_W + 4, CAB_H + 4, C.y);
  }

  drawPlayer(g) {
    const p = this.player, set = WALK[p.dir], s = set[Math.floor(p.step) % set.length];
    g.spr(s, p.x - s.w, p.y - s.h * PLAYER_SCALE, p.dir === 'left', PLAYER_SCALE);
  }

  render() {
    const g = this.g;
    g.reset();
    g.offset(-this.camX, -this.camY);
    g.spr(this.bg, 0, 0);
    const pieces = [...this.cabinets.map(c => ({ y: c.y, draw: () => this.drawCabinet(g, c) })), { y: this.player.y + 1, draw: () => this.drawPlayer(g) }];
    pieces.sort((a, b) => a.y - b.y).forEach(p => p.draw());
    g.reset();
    this.drawHint(g);
  }

  drawHint(g) {
    if (this.near) {
      const c = this.near, best = c.cab.top[0];
      g.rect(0, H - 24, W, 24, '#0b0b12e0');
      g.center(`${this.button} PLAY ${c.def.title}`, H - 21, C.y);
      g.center(best ? `BEST ${best.n} ${best.s}` : c.def.genre, H - 11, C.c);
    } else if (!this.moved) {
      g.rect(0, H - 14, W, 14, '#0b0b12e0');
      g.center('WALK UP TO A MACHINE', H - 11, C.w);
    }
  }
}

// Takes over an element of yours and the keyboard, like Arcade.mount.
export function mountRoom(el, opts = {}) {
  const touch = opts.touch ?? matchMedia('(pointer:coarse)').matches;
  return attach(el, new Room({ touch }), { ...opts, touch });
}
