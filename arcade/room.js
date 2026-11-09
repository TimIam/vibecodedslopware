// The VibeArcade floor: one 8-bit room with every machine on the back wall, each playing itself. Walk up to one and sit down.
// /arcade/ opens this; other games embed cabinets through arcade.js instead.
import { W, H, C, spr, makeGfx } from './gfx.js';
import { GAMES, create, play, attach } from './arcade.js';
import { sfx } from './audio.js';

const WALL_Y = 92, FEET_Y = 104;           // the machines stand on the floor just in front of the wall
const CAB_W = 38, CAB_H = 56, CAB_STEP = 42, SCREEN_W = 30, SCREEN_H = 28;
const SPEED = 1.3;
const LOOKS = {
  fishing: [C.c, C.b, 'BASS'], techdebt: [C.l, C.E, 'DEBT'], unsubscribe: [C.p, C.P, 'UNSUB'],
  doze: [C.y, C.Y, 'DOZE'], suckitup: [C.o, C.N, 'SUCK'], guerrilla: [C.e, C.R, 'MKTG'],
};
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

class Room {
  constructor(opts = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = makeGfx(this.canvas);
    this.button = opts.touch ? 'A' : 'Z';
    this.held = none(); this.prev = none();
    this.acc = 0; this.tick = 0; this.dead = false; this.busy = false;
    this.player = { x: W / 2, y: H - 20, dir: 'up', step: 0 };
    this.moved = false; this.near = null;
    this.bg = this.g.layer(W, H, s => this.paintRoom(s));
    this.cabinets = GAMES.map((def, i) => {
      const cab = create(def.id, { attractText: false });
      cab.launch(true);
      return { def, x: (W - CAB_STEP * (GAMES.length - 1)) / 2 + i * CAB_STEP, y: FEET_Y, cab, accent: LOOKS[def.id][0], body: this.g.layer(CAB_W, CAB_H, s => this.paintCabinet(s, def)) };
    });
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
    const dx = (h.right ? 1 : 0) - (h.left ? 1 : 0), dy = (h.down ? 1 : 0) - (h.up ? 1 : 0);
    if (dx || dy) {
      const k = SPEED / Math.hypot(dx, dy);
      p.x = Math.max(12, Math.min(W - 12, p.x + dx * k));
      p.y = Math.max(FEET_Y + 2, Math.min(H - 18, p.y + dy * k));
      p.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
      p.step += 0.14;
      this.moved = true;
    } else p.step = 0;
    const near = p.y < FEET_Y + 16 ? this.cabinets.find(c => Math.abs(p.x - c.x) <= CAB_STEP / 2) ?? null : null;
    if (near && near !== this.near) sfx('blip');
    this.near = near;
    const sit = near && (hit('a') || hit('start'));
    Object.assign(this.prev, h);
    if (sit) this.sit(near);
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
    const r = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
    s.rect(0, 0, W, H, '#141230');
    // carpet: dark with scattered neon scraps
    const scraps = [C.m, C.c, C.y, C.l, C.o];
    for (let i = 0; i < 150; i++) {
      const x = r(W), y = WALL_Y + r(H - WALL_Y), col = scraps[r(5)], kind = r(3);
      if (kind === 0) s.rect(x, y, 3, 1, col);
      else if (kind === 1) { s.rect(x, y, 1, 2, col); s.rect(x, y + 2, 2, 1, col); }
      else s.rect(x, y, 1, 1, col);
    }
    // back wall
    s.rect(0, 0, W, WALL_Y, '#241c52');
    for (let y = 8; y < WALL_Y; y += 16) s.rect(0, y, W, 1, '#2e2466');
    s.rect(0, WALL_Y - 5, W, 5, C.P);
    s.rect(0, WALL_Y, W, 1, C.k);
    // neon sign
    const signW = 196, signX = (W - signW) >> 1;
    s.rect(signX, 6, signW, 34, C.k);
    s.box(signX, 6, signW, 34, C.m);
    s.box(signX + 2, 8, signW - 4, 30, C.c);
    s.center('VIBEARCADE', 13, C.y, 3);
    // the way in
    s.rect(0, H - 12, W, 12, '#241c52');
    s.rect((W >> 1) - 20, H - 14, 40, 14, C.N);
    s.rect((W >> 1) - 17, H - 11, 34, 11, '#d8f0f8');
    s.rect(W >> 1, H - 11, 1, 11, C.N);
  }

  paintCabinet(s, def) {
    const [accent, body, label] = LOOKS[def.id], w = CAB_W, h = CAB_H;
    s.rect(0, 0, w, h, body);
    s.rect(0, 0, 1, h, C.k); s.rect(w - 1, 0, 1, h, C.k); // side panels
    s.rect(1, 0, w - 2, 11, accent);
    s.rect(1, 11, w - 2, 1, C.k);
    s.text(label, (w - s.width(label)) >> 1, 2, C.k);
    s.rect(2, 12, w - 4, 32, C.K);        // bezel
    s.rect(2, 45, w - 4, 5, C.G);         // control panel
    s.rect(9, 44, 3, 3, C.r);             // stick
    s.rect(25, 46, 2, 2, C.r); s.rect(29, 46, 2, 2, C.y); // buttons
    s.rect(14, 51, 10, 4, C.k);           // coin door
    s.rect(17, 52, 1, 2, C.y); s.rect(20, 52, 1, 2, C.y);
  }

  drawCabinet(g, c) {
    const x = c.x - CAB_W / 2, y = c.y - CAB_H, lit = c === this.near;
    g.rect(c.x - 16, c.y, 32, 5, `${c.accent}${lit ? '60' : (this.tick >> 3) & 1 ? '26' : '20'}`); // the screen's glow on the carpet
    g.spr(c.body, x, y);
    g.c.imageSmoothingEnabled = true; // shrunk 8:1, nearest-neighbour turns a game into noise
    g.c.imageSmoothingQuality = 'high';
    g.c.drawImage(c.cab.canvas, c.x - SCREEN_W / 2, y + 14, SCREEN_W, SCREEN_H);
    g.c.imageSmoothingEnabled = false;
    if (lit && this.tick & 16) g.box(x - 1, y - 1, CAB_W + 2, CAB_H + 2, C.y);
  }

  drawPlayer(g) {
    const p = this.player, set = WALK[p.dir], s = set[Math.floor(p.step) % set.length];
    g.spr(s, p.x - (s.w >> 1), p.y - s.h, p.dir === 'left');
  }

  render() {
    const g = this.g;
    g.reset();
    g.spr(this.bg, 0, 0);
    for (const c of this.cabinets) this.drawCabinet(g, c);
    this.drawPlayer(g); // always in front: the floor stops at the machines
    this.drawHint(g);
  }

  drawHint(g) {
    if (this.near) {
      const c = this.near, best = c.cab.top[0];
      g.rect(0, 140, W, 24, '#0b0b12e0');
      g.center(`${this.button} PLAY ${c.def.title}`, 143, C.y);
      g.center(best ? `BEST ${best.n} ${best.s}` : c.def.genre, 153, C.c);
    } else if (!this.moved) {
      g.center('WALK UP TO A MACHINE', 161, C.k, 1, 1);
      g.center('WALK UP TO A MACHINE', 160, C.w);
    }
  }
}

// Takes over an element of yours and the keyboard, like Arcade.mount.
export function mountRoom(el, opts = {}) {
  const touch = opts.touch ?? matchMedia('(pointer:coarse)').matches;
  return attach(el, new Room({ touch }), { ...opts, touch });
}
