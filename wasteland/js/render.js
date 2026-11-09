// Isometric renderer. Draws into a low-resolution buffer at one world pixel per pixel,
// then scales it up so the pixel art stays chunky. The view can be turned in 90 degree steps.
import { N, T, F, B, PLOT_COLOR } from './data.js';
import { I, inb, fbm, FOLD_TIME } from './world.js';
import { buildingSprite, featureSpriteCached, msvSprite, MSV_SIZE, vehicleSprite, VEH, VEH_COLOURS, bridgeSprite, crateSprite, hash, canvas, pk, sh, hex } from './art.js';

const CH = 16, CW = CH * 32, CHH = CH * 16;
export const ZOOMS = [1, 1.5, 2, 3, 4];

export class Renderer {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.buf = canvas(16, 16); this.bx = this.buf.getContext('2d');
    this.up = canvas(16, 16);
    this.cam = { x: 0, y: 0, z: 2 };
    this.rot = 0;
    this.chunks = [new Map(), new Map(), new Map(), new Map()];
    this.smoke = []; this.cars = new Map();
    this.grid = false; this.t = 0;
    this.tints = {};
    for (const [k, c, a] of [['ok', [90, 220, 110], 150], ['bad', [230, 70, 60], 150], ['sel', [250, 220, 90], 110], ['clr', [250, 190, 60], 120], ['road', [180, 200, 230], 120], ['dim', [0, 0, 0], 90]]) this.tints[k] = this.diamond(c, a);
    this.plotT = {};
    for (const k in PLOT_COLOR) this.plotT[k] = this.diamond(hex(PLOT_COLOR[k]), 255, true);
    this.ui = { hover: null, ghost: null, sel: null, drag: null, roadPath: null, showOwn: false, msvTarget: null, sid: 0, plots: false, rallyFrom: null };
  }
  diamond(c, a, solid = false) {
    const cv = canvas(32, 16), x = cv.getContext('2d'), id = x.createImageData(32, 16), u = new Uint32Array(id.data.buffer);
    for (let y = 0; y < 16; y++) for (let X = 0; X < 32; X++) {
      if (Math.abs(X + 0.5 - 16) / 16 + Math.abs(y + 0.5 - 8) / 8 >= 1) continue;
      if (solid || (X + y) % 2 === 0) u[y * 32 + X] = pk(c[0], c[1], c[2], a);
    }
    x.putImageData(id, 0, 0);
    return cv;
  }
  // ---------- the turning of the view ----------
  // world (continuous) -> view
  vx(x, y) { return this.rot === 0 ? x : this.rot === 1 ? N - y : this.rot === 2 ? N - x : y; }
  vy(x, y) { return this.rot === 0 ? y : this.rot === 1 ? x : this.rot === 2 ? N - y : N - x; }
  // view -> world
  wx(X, Y) { return this.rot === 0 ? X : this.rot === 1 ? Y : this.rot === 2 ? N - X : N - Y; }
  wy(X, Y) { return this.rot === 0 ? Y : this.rot === 1 ? N - X : this.rot === 2 ? N - Y : X; }
  // a world rectangle as [view x, view y, view w, view d]
  vrect(x, y, w, d) {
    switch (this.rot) {
      case 1: return [N - y - d, x, d, w];
      case 2: return [N - x - w, N - y - d, w, d];
      case 3: return [y, N - x - w, d, w];
      default: return [x, y, w, d];
    }
  }
  // a step in view space as a step in the world
  wd(dX, dY) {
    switch (this.rot) {
      case 1: return [dY, -dX];
      case 2: return [-dX, -dY];
      case 3: return [-dY, dX];
      default: return [dX, dY];
    }
  }
  turn(dir) {
    const vX = (this.cam.x / 16 + this.cam.y / 8) / 2, vY = (this.cam.y / 8 - this.cam.x / 16) / 2;
    const gx = this.wx(vX, vY), gy = this.wy(vX, vY);
    this.rot = (this.rot + dir + 4) % 4;
    this.centerOn(gx, gy);
    this.bigBudget = true;
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.floor(this.cv.clientWidth * dpr), Hh = Math.floor(this.cv.clientHeight * dpr);
    if (this.cv.width !== W || this.cv.height !== Hh) { this.cv.width = W; this.cv.height = Hh; }
    this.scale = Math.max(1, Math.round(this.cam.z * dpr * 2) / 2);
    const bw = Math.ceil(W / this.scale), bh = Math.ceil(Hh / this.scale);
    if (this.buf.width !== bw || this.buf.height !== bh) { this.buf.width = bw; this.buf.height = bh; }
    this.left = Math.round(this.cam.x - bw / 2); this.top = Math.round(this.cam.y - bh / 2);
  }
  // screen (css px) -> world grid (float)
  toGrid(px, py) {
    const dpr = window.devicePixelRatio || 1;
    const X = (px * dpr) / this.scale + this.left, Y = (py * dpr) / this.scale + this.top;
    const vX = (X / 16 + Y / 8) / 2, vY = (Y / 8 - X / 16) / 2;
    return [this.wx(vX, vY), this.wy(vX, vY), X, Y];
  }
  centerOn(gx, gy) { const X = this.vx(gx, gy), Y = this.vy(gx, gy); this.cam.x = (X - Y) * 16; this.cam.y = (X + Y) * 8; }

  // ---------- ground ----------
  conn(G, x, y, dx, dy) {
    const X = x + dx, Y = y + dy;
    if (!inb(X, Y)) return false;
    const j = I(X, Y);
    if (!G.road[j]) return false;
    const b = G.bridge[j];
    return !b || b === (dx ? 1 : 2);
  }
  roadPx(G, x, y, u, v, rd, i, hh) {
    const br = G.bridge[i], w = 0.3;
    const ex = br ? br === 1 : this.conn(G, x, y, 1, 0), wx = br ? br === 1 : this.conn(G, x, y, -1, 0);
    const sy = br ? br === 2 : this.conn(G, x, y, 0, 1), ny = br ? br === 2 : this.conn(G, x, y, 0, -1);
    const hasX = ex || wx, hasY = sy || ny;
    const inX = Math.abs(v - 0.5) < w && ((u >= 0.5 && ex) || (u <= 0.5 && wx));
    const inY = Math.abs(u - 0.5) < w && ((v >= 0.5 && sy) || (v <= 0.5 && ny));
    const inC = Math.abs(u - 0.5) < w && Math.abs(v - 0.5) < w;
    if (br) { // the shadow of the deck on the water beside it
      const off = br === 1 ? Math.abs(v - 0.5) : Math.abs(u - 0.5);
      if (off >= w && off < w + 0.07) return sh([24, 40, 48], 0.9 + hh * 0.1);
    }
    if (!(inX || inY || inC)) return null;
    // which way the surface runs here: straight pieces run along their axis, and only a real junction is unmarked
    let along = -1, across = 0.5;
    if (hasX && hasY) { if (!inC) { if (inX) { along = u; across = v; } else { along = v; across = u; } } }
    else if (hasX) { along = u; across = v; }
    else if (hasY) { along = v; across = u; }
    if (br) {
      const a2 = along >= 0 ? along : 0, plank = Math.floor(a2 * 8) % 2 === 0;
      if (rd === 1) return sh(hash(Math.floor(a2 * 8), x + y, 3) < 0.5 ? [132, 92, 60] : [112, 112, 104], (plank ? 1 : 0.86) * (0.92 + hh * 0.12));
      if (rd === 2) return sh([146, 112, 72], (plank ? 1 : 0.8) * (0.92 + hh * 0.1));
      if (Math.abs(across - 0.5) < 0.035 && Math.floor(a2 * 4) % 2 === 0) return pk(214, 186, 70);
      return sh([150, 150, 148], 0.92 + hh * 0.1);
    }
    if (rd === 1) {
      const a = Math.abs(across - 0.5);
      return sh([142, 118, 84], 0.9 + hh * 0.14 + (along < 0 ? 0 : a < 0.08 ? 0.06 : Math.abs(a - 0.18) < 0.05 ? -0.1 : 0));
    }
    if (rd === 2) return sh([138, 134, 124], 0.88 + hh * 0.2);
    let c = sh([58, 58, 60], 0.94 + hh * 0.08);
    if (along >= 0) {
      if (Math.abs(across - 0.5) < 0.035 && Math.floor(along * 4) % 2 === 0) c = pk(214, 186, 70);
      if (Math.abs(Math.abs(across - 0.5) - w + 0.03) < 0.03) c = pk(170, 170, 166);
    }
    return c;
  }
  groundPx(G, x, y, u, v, X, Y) {
    const i = I(x, y);
    if (!G.fog[i]) {
      let near = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (inb(xx, yy) && G.fog[I(xx, yy)]) { near = true; break; } }
      if (!near || (X + Y) % 2) return pk(12 + (hash(X >> 2, Y >> 2, 5) * 6 | 0), 11, 10);
    }
    const t = G.terr[i], hh = hash(X, Y, 1);
    let c;
    if (t === T.WATER) {
      let edge = 1;
      for (const [dx, dy, d] of [[1, 0, 1 - u], [-1, 0, u], [0, 1, 1 - v], [0, -1, v]]) { const xx = x + dx, yy = y + dy; if (inb(xx, yy) && G.terr[I(xx, yy)] !== T.WATER) edge = Math.min(edge, d); }
      if (edge < 0.09) c = pk(150, 160, 140);
      else if (edge < 0.25) c = sh([62, 98, 108], 0.95 + hh * 0.1);
      else c = sh([44, 74, 87], 0.93 + hh * 0.1 + (hash(X >> 1, Y, 4) < 0.012 ? 0.6 : 0));
    } else if (t === T.TOXIC) {
      // oily sludge: dark swirls, a sickly sheen and the odd bright bubble
      const sw = fbm((x + u) * 4, (y + v) * 4, 31);
      c = hh < 0.02 ? pk(214, 246, 90) : sw > 0.66 ? sh([118, 128, 46], 0.92 + hh * 0.1) : sw < 0.36 ? sh([46, 44, 26], 0.9 + hh * 0.1) : sh([74, 72, 34], 0.86 + hh * 0.14);
      let shore = 1;
      for (const [dx, dy, d] of [[1, 0, 1 - u], [-1, 0, u], [0, 1, 1 - v], [0, -1, v]]) { const xx = x + dx, yy = y + dy; if (inb(xx, yy) && G.terr[I(xx, yy)] !== T.TOXIC) shore = Math.min(shore, d); }
      if (shore < 0.1) c = sh([92, 84, 52], 0.9 + hh * 0.1);
    } else if (t === T.ASPHALT) {
      c = sh([72, 70, 66], 0.92 + hh * 0.12);
      if (hash(X >> 1, Y, 3) < 0.035) c = pk(46, 44, 42);
      if (hash(x, y, 6) < 0.3 && hash(X >> 2, Y >> 1, 8) < 0.15) c = sh([96, 90, 72], 0.9 + hh * 0.1);
    } else {
      // soft relief: shade by the slope of a height noise, lit from the upper left
      const gx = x + u, gy = y + v, e = fbm(gx * 1.6, gy * 1.6, 41);
      const lit = 1 + (e - fbm(gx * 1.6 + 0.12, gy * 1.6 + 0.12, 41)) * 2.4;
      if (t === T.SAND) {
        const rip = Math.sin((X * 0.5 + Y) * 0.7 + fbm(gx, gy, 5) * 12);
        c = sh([180, 154, 106], lit * (0.93 + hh * 0.08 + (rip > 0.8 ? 0.06 : rip < -0.85 ? -0.07 : 0)));
        if (hash(X >> 1, Y, 23) < 0.004) c = pk(120, 112, 66);
      } else {
        // dirt drifts between ochre, red clay and ash grey across the map
        const m = fbm(gx, gy, 99), k = fbm(gx * 0.5, gy * 0.5, 77);
        const base = k > 0.62 ? [126, 92, 62] : k < 0.34 ? [114, 100, 78] : m > 0.55 ? [120, 98, 68] : [110, 88, 60];
        c = sh(base, lit * (0.93 + hh * 0.1));
        const tuft = hash(X >> 1, Y, 21);
        if (tuft < 0.006) c = sh([102, 104, 54], 0.9 + hh * 0.3);
        else if (tuft < 0.009) c = sh([128, 122, 64], 1);
        else if (hash(X, Y, 9) < 0.008) c = pk(156, 142, 114);
        else if (hash(X, Y, 10) < 0.006) c = pk(70, 56, 40);
      }
    }
    if (G.feat[i] === F.CRATER) {
      const r = Math.hypot(u - 0.5, (v - 0.5));
      if (r < 0.26) c = sh([70, 56, 40], 0.9 + hh * 0.15);
      else if (r < 0.36) c = sh([140, 118, 86], 0.95 + hh * 0.1);
    }
    const rd = G.road[i];
    if (rd) { const q = this.roadPx(G, x, y, u, v, rd, i, hh); if (q != null) c = q; }
    if (this.grid && (u < 0.04 || v < 0.04)) c = sh([(c & 255), (c >> 8) & 255, (c >> 16) & 255], 0.85);
    return c;
  }
  chunk(G, cx, cy) {
    const map = this.chunks[this.rot], key = cy * 100 + cx;
    let ch = map.get(key);
    if (ch && !ch.dirty) return ch;
    if (this.budget <= 0) return ch || null;
    this.budget--;
    if (!ch) { ch = { c: canvas(CW, CHH), dirty: false }; map.set(key, ch); }
    const x0 = cx * CH, y0 = cy * CH, [VX, VY] = this.vrect(x0, y0, CH, CH), L = (VX - VY - CH) * 16, Tt = (VX + VY) * 8;
    const ctx = ch.c.getContext('2d'), id = ctx.createImageData(CW, CHH), out = new Uint32Array(id.data.buffer);
    for (let py = 0; py < CHH; py++) for (let px = 0; px < CW; px++) {
      const X = L + px, Y = Tt + py, vX = ((X + 0.5) / 16 + (Y + 0.5) / 8) / 2, vY = ((Y + 0.5) / 8 - (X + 0.5) / 16) / 2;
      const gx = this.wx(vX, vY), gy = this.wy(vX, vY), tx = Math.floor(gx), ty = Math.floor(gy);
      if (tx < x0 || ty < y0 || tx >= x0 + CH || ty >= y0 + CH || tx >= N || ty >= N) continue;
      out[py * CW + px] = this.groundPx(G, tx, ty, gx - tx, gy - ty, X, Y);
    }
    ctx.putImageData(id, 0, 0);
    ch.dirty = false;
    return ch;
  }
  invalidateAll() { for (const m of this.chunks) for (const ch of m.values()) ch.dirty = true; }
  reset() { for (const m of this.chunks) m.clear(); this.smoke = []; this.cars.clear(); }

  // ---------- frame ----------
  draw(G, dt, info) {
    this.t += dt;
    for (const k of G.dirty) for (const m of this.chunks) { const ch = m.get(k); if (ch) ch.dirty = true; }
    G.dirty.clear();
    this.resize();
    const b = this.bx, bw = this.buf.width, bh = this.buf.height, L = this.left, Tp = this.top, rot = this.rot;
    b.imageSmoothingEnabled = false;
    b.fillStyle = '#0c0b0a'; b.fillRect(0, 0, bw, bh);
    this.budget = this.bigBudget ? 999 : 2; this.bigBudget = false;
    const nc = Math.ceil(N / CH);
    for (let cy = 0; cy < nc; cy++) for (let cx = 0; cx < nc; cx++) {
      const [VX, VY] = this.vrect(cx * CH, cy * CH, CH, CH), cl = (VX - VY - CH) * 16 - L, ct = (VX + VY) * 8 - Tp;
      if (cl > bw || ct > bh || cl + CW < 0 || ct + CHH < 0) continue;
      const ch = this.chunk(G, cx, cy);
      if (ch) b.drawImage(ch.c, cl, ct);
    }
    const ui = this.ui;
    if (ui.plots) for (const bd of G.buildings) {
      if (bd.dead) continue;
      const k = this.plotT[B[bd.type].cat];
      for (let y = bd.y; y < bd.y + bd.d; y++) for (let x = bd.x; x < bd.x + bd.w; x++) this.tileImg(x, y, k);
    }
    if (ui.showOwn) this.drawOwn(G);
    if (ui.drag && ui.drag.kind === 'clear') {
      const [x0, y0, x1, y1] = ui.drag.rect;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (inb(x, y) && G.feat[I(x, y)]) this.tile(x, y, ui.drag.cancel ? 'bad' : 'clr');
    }
    if (ui.roadPath) for (const [x, y, ok] of ui.roadPath) this.tile(x, y, ok ? 'road' : 'bad');
    if (ui.ghost) { const g = ui.ghost; for (let y = g.y; y < g.y + g.d; y++) for (let x = g.x; x < g.x + g.w; x++) if (inb(x, y)) this.tile(x, y, g.ok ? 'ok' : 'bad'); }
    for (const f of G.fx) if (f.k === 'blood') {
      const [sx, sy] = this.sp(f.x, f.y), a = 1 - (G.t - f.t) / f.d;
      b.globalAlpha = Math.max(0, a);
      b.fillStyle = f.c ? '#5a7a2a' : '#7a1a14';
      b.fillRect(sx - 1, sy - 1, 2, 1); b.fillRect(sx, sy, 1, 1);
      b.globalAlpha = 1;
    }
    // objects, depth sorted
    const objs = [];
    const cs = [this.rawGrid(0, 0), this.rawGrid(bw, 0), this.rawGrid(0, bh + 70), this.rawGrid(bw, bh + 70)];
    const minx = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0]))) - 1), maxx = Math.min(N - 1, Math.ceil(Math.max(...cs.map((c) => c[0]))) + 1);
    const miny = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1]))) - 1), maxy = Math.min(N - 1, Math.ceil(Math.max(...cs.map((c) => c[1]))) + 1);
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const i = I(x, y), f = G.feat[i];
      if (!G.fog[i]) continue;
      const VX = rot === 0 ? x : rot === 1 ? N - 1 - y : rot === 2 ? N - 1 - x : y, VY = rot === 0 ? y : rot === 1 ? x : rot === 2 ? N - 1 - y : N - 1 - x;
      const sx = (VX - VY) * 16 - L, sy = (VX + VY) * 8 - Tp;
      if (sx < -40 || sx > bw + 40 || sy < -20 || sy > bh + 70) continue;
      if (G.bridge[i]) { objs.push({ d: VX + VY + 1, o: 0, sp: bridgeSprite(G.bridge[i], G.road[i] - 1, rot), sx, sy }); continue; }
      if (G.terr[i] === T.WATER) { // glints on the water
        const ph = (hash(x, y, 3) * 7 + this.t * 0.45) % 1;
        if (ph < 0.08) { b.fillStyle = ph < 0.04 ? '#d8eef0' : '#8fb8c0'; b.fillRect(sx + (hash(x, y, 4) * 20 | 0) - 10, sy + 5 + (hash(x, y, 5) * 6 | 0), ph < 0.04 ? 2 : 1, 1); }
        continue;
      }
      if (!f || f === F.CRATER || G.bld[i] >= 0) continue;
      objs.push({ d: VX + VY + 1, o: 0, sp: featureSpriteCached(f, G.fv[i], rot), sx, sy });
    }
    for (const bd of G.buildings) {
      if (bd.dead) continue;
      const [VX, VY, VW, VD] = this.vrect(bd.x, bd.y, bd.w, bd.d);
      const sx = (VX - VY) * 16 - L, sy = (VX + VY) * 8 - Tp;
      if (bd.move && bd.move.ph === 'travel') {
        const m = bd.move, k = Math.floor(m.pos), a = m.path[k], c = m.path[Math.min(k + 1, m.path.length - 1)], f = m.pos - k;
        const ax = (a % N) + 0.5, ay = ((a / N) | 0) + 0.5, cx = (c % N) + 0.5, cy = ((c / N) | 0) + 0.5, x = ax + (cx - ax) * f, y = ay + (cy - ay) * f;
        objs.push({ d: this.vx(x, y) + this.vy(x, y), o: 5, kind: m.truck ? 'troop' : 'cart', col: 0, x, y, k: this.dirIdx(cx - ax, cy - ay) });
      }
      if (sx < -220 || sx > bw + 220 || sy < -80 || sy > bh + 160) continue;
      if (!ui.plots) objs.push({ d: VX + VW / 2 + VY + VD / 2, o: 1, b: bd, sx, sy });
      else this.outline(bd.x, bd.y, bd.w, bd.d, 'rgba(20,18,14,0.75)');
    }
    for (const u of G.units) {
      if (u.hidden) continue;
      if (u.kind === 'civ') { const bi = G.bld[I(Math.floor(u.x), Math.floor(u.y))]; if (bi >= 0 && B[G.buildings[bi].type].walk !== true) continue; } // indoors
      const [sx, sy] = this.sp(u.x, u.y);
      if (sx < -4 || sx > bw + 4 || sy < -4 || sy > bh + 8) continue;
      objs.push({ d: this.vx(u.x, u.y) + this.vy(u.x, u.y), o: 2, u, sx, sy });
    }
    for (const dr of G.drops) { const [sx, sy] = this.sp(dr.x, dr.y); if (sx > -10 && sy > -10 && sx < bw + 10 && sy < bh + 10) objs.push({ d: this.vx(dr.x, dr.y) + this.vy(dr.x, dr.y), o: 6, sx, sy }); }
    for (const c of G.convoys) {
      const k = Math.floor(c.pos), a = c.path[k], nb = c.path[Math.min(k + 1, c.path.length - 1)], f = c.pos - k;
      const ax = (a % N) + 0.5, ay = ((a / N) | 0) + 0.5, bx2 = (nb % N) + 0.5, by2 = ((nb / N) | 0) + 0.5;
      const x = ax + (bx2 - ax) * f, y = ay + (by2 - ay) * f;
      c._x = x; c._y = y;
      objs.push({ d: this.vx(x, y) + this.vy(x, y) + 0.6, o: 3, x, y, k: this.dirIdx(bx2 - ax, by2 - ay) });
      if (Math.random() < dt * 20) this.addSmoke(x, y, { z: 2, d: 1.2, dust: 1 });
    }
    this.carsTick(G, dt, objs);
    objs.sort((p, q) => p.d - q.d || p.o - q.o);
    const taskOf = new Map();
    for (const t of G.tasks) if (!t.dead && (t.kind === 'build' || t.kind === 'reno')) taskOf.set(t.bid, t);
    for (const ob of objs) {
      if (ob.o === 0) { if (ob.sp) b.drawImage(ob.sp.c, ob.sx - ob.sp.ax, ob.sy - ob.sp.ay); }
      else if (ob.o === 1) this.drawBuilding(G, ob.b, ob.sx, ob.sy, taskOf.get(ob.b.id), info);
      else if (ob.o === 2) this.drawUnit(G, ob.u, ob.sx, ob.sy);
      else if (ob.o === 3) this.drawCentered(msvSprite((ob.k + rot) & 3), ob.x, ob.y, MSV_SIZE, (ob.k + rot) & 1, Math.floor(this.t * 8) % 2);
      else if (ob.o === 4 || ob.o === 5) { const r = (ob.k + rot) & 3; this.drawCentered(vehicleSprite(ob.kind, ob.col, r), ob.x, ob.y, VEH[ob.kind], r & 1, 0); }
      else if (ob.o === 6) { const s = crateSprite(); b.drawImage(s.c, ob.sx - s.ax - 3, ob.sy - s.ay - 3); if (Math.floor(this.t * 3) % 3 === 0) { b.fillStyle = '#fff6c8'; b.fillRect(ob.sx, ob.sy - 8, 1, 1); } }
    }
    for (const t of G.tasks) if (t.kind === 'clear' && !t.dead) {
      const [sx, sy] = this.sp(t.x + 0.5, t.y + 0.5);
      if (sx < 0 || sy < 0 || sx > bw || sy > bh) continue;
      const blink = Math.floor(this.t * 2 + t.id) % 2;
      b.fillStyle = t.n ? '#ffe36a' : blink ? '#f0a030' : '#a86a20';
      b.fillRect(sx, sy - 14, 1, 5); b.fillRect(sx + 1, sy - 14, 2, 2);
    }
    for (const s of G.settlements) if (s.rally) this.rallyFlag(s.rally.x + 0.5, s.rally.y + 0.5);
    // smoke and dust
    this.smoke = this.smoke.filter((p) => (p.t += dt) < p.d);
    for (const p of this.smoke) {
      const a = 1 - p.t / p.d;
      b.globalAlpha = a * (p.dust ? 0.6 : 0.5);
      const r = p.dust ? 1 + (p.t * 2 | 0) : 1 + Math.min(3, (p.t * 1.3) | 0);
      const px = Math.round(p.X - L + p.t * p.t * 1.6 - r / 2), py = Math.round(p.Y - Tp - p.z - p.t * (p.dust ? 2 : 7) - r / 2);
      b.fillStyle = p.dust ? '#a08a66' : p.t < 0.3 && p.fire ? '#e0a050' : p.t < 0.6 ? '#6e6a64' : '#9a958c';
      b.fillRect(px, py, r, r);
      if (!p.dust && r > 1) { b.fillStyle = '#b8b3a8'; b.fillRect(px, py, r - 1, 1); }
    }
    b.globalAlpha = 1;
    for (const f of G.fx) {
      if (f.k === 'shot') { const [ax, ay] = this.sp(f.x, f.y), [bx2, by2] = this.sp(f.x2, f.y2); this.pline(ax, ay - (f.z || 2), bx2, by2 - 2, f.c ? '#ff8a50' : '#fff2a0'); }
      else if (f.k === 'hit') { const [sx, sy] = this.sp(f.x, f.y); b.fillStyle = '#ffffff'; b.fillRect(sx - 1, sy - 3, 3, 1); }
      else if (f.k === 'dust' && !f.seen) { f.seen = 1; for (let k = 0; k < 5; k++) this.addSmoke(f.x + (Math.random() - 0.5) * 0.6, f.y + (Math.random() - 0.5) * 0.6, { z: 1, d: 0.9, dust: 1 }); }
    }
    // selection, hover and range rings
    if (ui.sel != null) {
      const s = G.buildings[ui.sel];
      if (s && !s.dead) { this.outline(s.x, s.y, s.w, s.d, '#ffe36a'); if (s.type === 'guard') this.ring(s.x + 0.5, s.y + 0.5, B.guard.snipe, '#e8483a'); }
    }
    if (ui.hover && !ui.ghost && !ui.roadPath) this.outline(ui.hover[0], ui.hover[1], 1, 1, 'rgba(255,255,255,0.8)');
    if (ui.ghost) {
      const g = ui.ghost, s = buildingSprite(g.type === 'camp' ? { type: 'camp', era: 0, siding: false, hue: 0 } : { type: g.type, era: g.era, siding: g.siding, hue: 0 }, rot, 0);
      const [VX, VY] = this.vrect(g.x, g.y, g.w, g.d), sx = (VX - VY) * 16 - L, sy = (VX + VY) * 8 - Tp;
      b.globalAlpha = 0.55; b.drawImage(s.c, sx - s.ax, sy - s.ay); b.globalAlpha = 1;
      if (g.type === 'guard') this.ring(g.x + 0.5, g.y + 0.5, B.guard.snipe, '#e8483a');
    }
    if (ui.msvTarget) {
      const m = ui.msvTarget;
      this.outline(m.x, m.y, 2, 2, m.ok ? '#7dff8a' : '#ff6a5a');
      this.ring(m.x + 1, m.y + 1, 30, m.ok ? '#7dff8a' : '#ff6a5a');
    }
    if (ui.rallyFrom) { this.ring(ui.rallyFrom[0], ui.rallyFrom[1], 25, '#6aa0d8'); if (ui.hover) this.rallyFlag(ui.hover[0] + 0.5, ui.hover[1] + 0.5); }
    this.threatMarkers(G);
    // blit: whole-number scales are nearest-neighbour; in-between ones go up to the next whole size first so pixels stay even
    const ctx = this.ctx, sc = this.scale;
    if (Number.isInteger(sc)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(this.buf, 0, 0, bw * sc, bh * sc); }
    else {
      const k = Math.ceil(sc), up = this.up;
      if (up.width !== bw * k || up.height !== bh * k) { up.width = bw * k; up.height = bh * k; }
      const ux = up.getContext('2d');
      ux.imageSmoothingEnabled = false; ux.drawImage(this.buf, 0, 0, bw * k, bh * k);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(up, 0, 0, bw * sc, bh * sc);
    }
  }
  rawGrid(bx, by) { const X = bx + this.left, Y = by + this.top, vX = (X / 16 + Y / 8) / 2, vY = (Y / 8 - X / 16) / 2; return [this.wx(vX, vY), this.wy(vX, vY)]; }
  iso(gx, gy) { const X = this.vx(gx, gy), Y = this.vy(gx, gy); return [(X - Y) * 16, (X + Y) * 8]; }
  sp(gx, gy) { const [X, Y] = this.iso(gx, gy); return [Math.round(X - this.left), Math.round(Y - this.top)]; }
  dirIdx(dx, dy) { return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3); }
  addSmoke(gx, gy, o) { const [X, Y] = this.iso(gx, gy); this.smoke.push({ X, Y, z: 0, t: 0, ...o }); }
  drawCentered(s, x, y, size, swap, lift) {
    const vw = swap ? size[1] : size[0], vd = swap ? size[0] : size[1], X = this.vx(x, y) - vw / 2, Y = this.vy(x, y) - vd / 2;
    this.bx.drawImage(s.c, Math.round((X - Y) * 16 - this.left) - s.ax, Math.round((X + Y) * 8 - this.top) - s.ay - lift);
  }
  tileOrigin(x, y) { const [X, Y] = this.vrect(x, y, 1, 1); return [(X - Y) * 16 - this.left, (X + Y) * 8 - this.top]; }
  tile(x, y, k) { this.tileImg(x, y, this.tints[k]); }
  tileImg(x, y, img) { const [sx, sy] = this.tileOrigin(x, y); this.bx.drawImage(img, sx - 16, sy); }
  pline(x0, y0, x1, y1, col) {
    const b = this.bx; b.fillStyle = col;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, n = 0;
    for (;;) { b.fillRect(x0, y0, 1, 1); if ((x0 === x1 && y0 === y1) || n++ > 600) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  outline(x, y, w, d, col) {
    const [X, Y, W, D] = this.vrect(x, y, w, d), L = this.left, Tt = this.top;
    const p = (a, c) => [Math.round((a - c) * 16 - L), Math.round((a + c) * 8 - Tt)];
    const a = p(X, Y), bb = p(X + W, Y), c = p(X + W, Y + D), e = p(X, Y + D);
    this.pline(a[0], a[1], bb[0] - 1, bb[1], col); this.pline(bb[0] - 1, bb[1], c[0], c[1] - 1, col);
    this.pline(c[0] - 1, c[1] - 1, e[0], e[1], col); this.pline(e[0], e[1], a[0] - 1, a[1], col);
  }
  // a circle on the ground, r squares out from its centre
  ring(gx, gy, r, col) {
    const b = this.bx; b.fillStyle = col;
    const n = Math.round(r * 90);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, [sx, sy] = this.sp(gx + Math.cos(a) * r, gy + Math.sin(a) * r); b.fillRect(sx, sy, 1, 1); }
  }
  rallyFlag(gx, gy) {
    const b = this.bx, [sx, sy] = this.sp(gx, gy);
    b.fillStyle = '#d8d8d0'; b.fillRect(sx, sy - 12, 1, 12);
    b.fillStyle = '#3e6a8e'; b.fillRect(sx + 1, sy - 12, 6, 4);
    b.fillStyle = '#7fb0d8'; b.fillRect(sx + 1, sy - 12, 6, 1);
    b.fillStyle = 'rgba(20,14,8,0.45)'; b.fillRect(sx + 1, sy, 3, 1);
  }
  drawOwn(G) {
    const b = this.bx;
    b.fillStyle = 'rgba(255,230,120,0.75)';
    const nb = [this.wd(0, -1), this.wd(-1, 0), this.wd(1, 0), this.wd(0, 1)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const o = G.own[I(x, y)];
      if (o < 0) continue;
      const [sx, sy] = this.tileOrigin(x, y);
      if (sx < -20 || sy < -20 || sx > this.buf.width + 20 || sy > this.buf.height + 20) continue;
      const ed = (k) => { const xx = x + nb[k][0], yy = y + nb[k][1]; return !inb(xx, yy) || G.own[I(xx, yy)] !== o; };
      if (ed(0)) for (let k = 0; k < 16; k += 2) b.fillRect(sx + k, sy + (k >> 1), 1, 1);
      if (ed(1)) for (let k = 0; k < 16; k += 2) b.fillRect(sx - k - 1, sy + (k >> 1), 1, 1);
      if (ed(2)) for (let k = 0; k < 16; k += 2) b.fillRect(sx + 15 - k, sy + 8 + (k >> 1), 1, 1);
      if (ed(3)) for (let k = 0; k < 16; k += 2) b.fillRect(sx - 16 + k, sy + 8 + (k >> 1), 1, 1);
    }
  }
  foldFrame(bd) {
    const m = bd.move;
    if (!m) return 0;
    if (m.ph === 'travel') return 5;
    const k = Math.round(Math.min(1, m.t / FOLD_TIME) * 5);
    return m.ph === 'fold' ? k : 5 - k;
  }
  spriteOf(bd) { return bd.type === 'camp' ? buildingSprite({ type: 'camp', era: 0, siding: false, hue: bd.hue }, this.rot, this.foldFrame(bd) / 5) : buildingSprite(bd, this.rot, 0); }
  drawBuilding(G, bd, sx, sy, task, info) {
    const b = this.bx;
    if (bd.move && bd.move.ph === 'travel') { this.outline(bd.x, bd.y, bd.w, bd.d, '#c8a86a'); return; }
    const s = this.spriteOf(bd), x = sx - s.ax, y = sy - s.ay;
    if (!bd.built) {
      const p = task ? Math.min(1, task.prog / task.need) : 0;
      // stakes and string around the plot, then the building rising out of its scaffold
      this.outline(bd.x, bd.y, bd.w, bd.d, '#c8a86a');
      const vis = Math.max(1, Math.round(s.h * (0.08 + 0.92 * p)));
      if (p > 0) b.drawImage(s.c, 0, s.h - vis, s.w, vis, x, y + s.h - vis, s.w, vis);
      this.scaffold(bd, Math.round((s.ay - 4) * p) + 4);
      return;
    }
    b.drawImage(s.c, x, y);
    if (task) this.scaffold(bd, s.ay - 2);
    const def = B[bd.type], active = bd.eff > 0.05;
    if (s.smoke.length && active && Math.random() < 0.06 * (1 + bd.eff)) {
      const [ex, ey] = s.smoke[Math.floor(Math.random() * s.smoke.length)];
      this.smoke.push({ X: sx + ex + this.left, Y: sy + ey + this.top, z: 0, t: 0, d: 2.6 + Math.random(), fire: bd.type === 'refinery' });
    }
    if (bd.type === 'windmill' && s.extra.hub) {
      const [hx, hy] = s.extra.hub, cx = sx + hx, cy = sy + hy, a0 = this.t * 2.4 + bd.id;
      for (let k = 0; k < 3; k++) { const a = a0 + (k * Math.PI * 2) / 3; this.pline(cx, cy, cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, '#ecece6'); }
      b.fillStyle = '#9a9a96'; b.fillRect(cx, cy, 1, 1);
    }
    if (def.jobs && bd.workers === 0 && (bd.maxJobs == null || bd.maxJobs > 0) && info.flags && Math.floor(this.t * 1.5) % 2) { b.fillStyle = '#e8483a'; b.fillRect(sx - 1, sy - s.ay - 6, 2, 3); b.fillRect(sx - 1, sy - s.ay - 2, 2, 1); }
    if (bd.msv && bd.msv.ready) this.drawCentered(msvSprite(this.rot), bd.x + 2.8, bd.y + 3.9, MSV_SIZE, this.rot & 1, 0);
  }
  scaffold(bd, h) {
    const b = this.bx, [X, Y, W, D] = this.vrect(bd.x, bd.y, bd.w, bd.d), L = this.left, Tt = this.top;
    const p = (a, c) => [Math.round((a - c) * 16 - L), Math.round((a + c) * 8 - Tt)];
    for (const [a, c] of [[X, Y + D], [X + W, Y + D], [X + W, Y], [X + W / 2, Y + D]]) { const [sx, sy] = p(a, c); b.fillStyle = '#b08a50'; b.fillRect(sx, sy - h, 1, h); }
    const a = p(X, Y + D), c = p(X + W, Y + D), e = p(X + W, Y);
    for (let z = 6; z < h; z += 7) { this.pline(a[0], a[1] - z, c[0], c[1] - z, '#8a6a3a'); this.pline(c[0], c[1] - z, e[0], e[1] - z, '#7a5a30'); }
  }
  drawUnit(G, u, sx, sy) {
    const b = this.bx, ph = Math.floor((u.walk || 0) * 4) % 2, moving = !!u.path;
    const r = this.rot, fx = r === 0 ? u.fx : r === 1 ? -u.fy : r === 2 ? -u.fx : u.fy, fy = r === 0 ? u.fy : r === 1 ? u.fx : r === 2 ? -u.fy : -u.fx, gun = fx - fy >= 0 ? 1 : -1;
    b.fillStyle = 'rgba(20,14,8,0.45)'; b.fillRect(sx, sy, u.kind === 'mutant' ? 3 : 2, 1); // a speck of shadow
    const SHIRT = ['#b55a3a', '#5f7f9a', '#8a8a4a', '#a07a5a', '#7a5a8a', '#4f8a6a', '#c0a060', '#9a4a5a'];
    if (u.kind === 'civ') {
      b.fillStyle = '#3b3530'; b.fillRect(sx + (moving && ph ? 1 : 0), sy - 1, 1, 1);
      b.fillStyle = SHIRT[u.col]; b.fillRect(sx, sy - 2, 1, 1);
      b.fillStyle = '#e0b48c'; b.fillRect(sx, sy - 3, 1, 1);
      if (u.st === 'working' && ph) { b.fillStyle = '#c8c0b0'; b.fillRect(sx + 1, sy - 3, 1, 1); }
      if (u.st === 'flee' && Math.floor(this.t * 6) % 2) { b.fillStyle = '#ffffff'; b.fillRect(sx, sy - 5, 1, 1); }
    } else if (u.kind === 'sec') {
      b.fillStyle = '#2b2a28'; b.fillRect(sx + (moving && ph ? 1 : 0), sy - 1, 1, 1);
      b.fillStyle = '#3e6a8e'; b.fillRect(sx, sy - 2, 1, 1);
      b.fillStyle = '#2f3a2f'; b.fillRect(sx, sy - 3, 1, 1);
      b.fillStyle = '#1a1a1a'; b.fillRect(sx + gun, sy - 2, 1, 1);
      if (u.hp < u.max) this.hp(sx, sy - 5, u.hp / u.max, '#5ad06a');
    } else if (u.kind === 'raider') {
      b.fillStyle = '#2b2a28'; b.fillRect(sx + (moving && ph ? 1 : 0), sy - 1, 1, 1);
      b.fillStyle = '#8e2b20'; b.fillRect(sx, sy - 2, 1, 1);
      b.fillStyle = '#151312'; b.fillRect(sx, sy - 3, 1, 1);
      b.fillStyle = '#1a1a1a'; b.fillRect(sx + gun, sy - 2, 1, 1);
      if (u.loot) { b.fillStyle = '#c8a050'; b.fillRect(sx - 1, sy - 3, 1, 1); }
      if (u.hp < u.max) this.hp(sx, sy - 5, u.hp / u.max, '#e8483a');
    } else {
      const wob = Math.floor(this.t * 3 + u.id) % 2;
      b.fillStyle = '#4a5a30'; b.fillRect(sx - (moving && ph ? 1 : 0), sy - 1, 2, 1);
      b.fillStyle = '#7f9f45'; b.fillRect(sx, sy - 2, 2, 1);
      b.fillStyle = '#a8c060'; b.fillRect(sx + wob, sy - 3, 1, 1);
      if (u.hp < u.max) this.hp(sx, sy - 5, u.hp / u.max, '#e8483a');
    }
  }
  hp(sx, sy, f, col) { const b = this.bx; b.fillStyle = '#1a1a1a'; b.fillRect(sx - 1, sy, 4, 1); b.fillStyle = col; b.fillRect(sx - 1, sy, Math.max(1, Math.round(4 * f)), 1); }
  carsTick(G, dt, objs) {
    // electric cars and trucks that wander the road network near each EV plant (visual only)
    for (const bd of G.buildings) {
      if (bd.dead || !bd.built || bd.type !== 'evplant') continue;
      let list = this.cars.get(bd.id);
      if (!list) { list = []; this.cars.set(bd.id, list); }
      const want = Math.min(8, 2 + Math.floor(bd.eff * 6));
      if (list.length < want && Math.random() < dt * 0.3) {
        // start on a road tile within reach of the plant
        for (let x = bd.x - 3; x < bd.x + bd.w + 3 && list.length < want; x++) for (let y = bd.y - 3; y < bd.y + bd.d + 3 && list.length < want; y++) {
          if (inb(x, y) && G.road[I(x, y)] && Math.random() < 0.2) list.push({ x, y, px: x, py: y, f: 0, kind: Math.random() < 0.3 ? 'truck' : 'car', col: (Math.random() * VEH_COLOURS) | 0, spd: 1.5 + Math.random() * 0.8 });
        }
      }
      for (const c of list) {
        c.f += dt * c.spd;
        if (c.f >= 1) {
          c.f = 0; c.px = c.x; c.py = c.y;
          const here = G.bridge[I(c.x, c.y)];
          const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => this.conn(G, c.x, c.y, dx, dy) && (!here || here === (dx ? 1 : 2))).map(([dx, dy]) => [c.x + dx, c.y + dy]);
          const fwd = opts.filter(([x, y]) => !(x === c.lx && y === c.ly));
          const go = (fwd.length ? fwd : opts)[(Math.random() * (fwd.length || opts.length)) | 0];
          c.lx = c.x; c.ly = c.y;
          if (go) { c.x = go[0]; c.y = go[1]; }
        }
        const dx = c.x - c.px, dy = c.y - c.py, gx = c.px + dx * c.f + 0.5 - dy * 0.15, gy = c.py + dy * c.f + 0.5 + dx * 0.15;
        if (dx || dy) c.k = this.dirIdx(dx, dy);
        objs.push({ d: this.vx(gx, gy) + this.vy(gx, gy), o: 4, kind: c.kind, col: c.col, x: gx, y: gy, k: c.k || 0 });
      }
    }
  }
  threatMarkers(G) {
    const b = this.bx, bw = this.buf.width, bh = this.buf.height;
    if (Math.floor(this.t * 2) % 2) return;
    for (const u of G.units) {
      if (u.kind !== 'mutant' && u.kind !== 'raider') continue;
      if (!G.fog[I(Math.floor(u.x), Math.floor(u.y))]) continue;
      const [sx, sy] = this.sp(u.x, u.y);
      if (sx >= 0 && sy >= 0 && sx < bw && sy < bh) continue;
      const cx = bw / 2, cy = bh / 2, dx = sx - cx, dy = sy - cy, k = Math.min((bw / 2 - 6) / Math.abs(dx || 1), (bh / 2 - 6) / Math.abs(dy || 1));
      b.fillStyle = u.kind === 'raider' ? '#ff4a3a' : '#a8d040';
      b.fillRect(Math.round(cx + dx * k) - 1, Math.round(cy + dy * k) - 1, 3, 3);
    }
  }
  // building under the cursor, by sprite pixel
  pick(G, px, py) {
    const [, , X, Y] = this.toGrid(px, py);
    let best = null, bd = -1e9;
    for (const bb of G.buildings) {
      if (bb.dead) continue;
      const [VX, VY, VW, VD] = this.vrect(bb.x, bb.y, bb.w, bb.d);
      if (this.ui.plots) { // in plot view the plot is the building
        const vX = (X / 16 + Y / 8) / 2, vY = (Y / 8 - X / 16) / 2;
        if (vX >= VX && vX < VX + VW && vY >= VY && vY < VY + VD) return bb;
        continue;
      }
      if (bb.move && bb.move.ph === 'travel') continue;
      const s = this.spriteOf(bb), x = Math.floor(X - ((VX - VY) * 16 - s.ax)), y = Math.floor(Y - ((VX + VY) * 8 - s.ay));
      if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
      if (!s.mask) s.mask = s.c.getContext('2d').getImageData(0, 0, s.w, s.h).data;
      if (s.mask[(y * s.w + x) * 4 + 3] < 200) continue; // not the translucent shadow
      const depth = VX + VW / 2 + VY + VD / 2;
      if (depth > bd) { bd = depth; best = bb; }
    }
    return best;
  }
}

// ---------- minimap ----------
export function drawMinimap(G, mm, R) {
  const ctx = mm.getContext('2d'), W = mm.width, Hh = mm.height;
  if (!mm._img || mm._t < G.t - 1.5 || mm._v !== G.bver || mm._r !== R.rot) {
    const id = ctx.createImageData(W, Hh), u = new Uint32Array(id.data.buffer);
    const CAT = { housing: [200, 170, 120], food: [110, 170, 70], industry: [190, 130, 70], power: [230, 210, 80], civic: [120, 170, 220], retail: [230, 120, 160], defense: [80, 110, 160], transport: [200, 200, 210] };
    for (let my = 0; my < Hh; my++) for (let mx = 0; mx < W; mx++) {
      const vX = (2 * my * (128 / Hh) + mx * (256 / W) - N) / 2, vY = (2 * my * (128 / Hh) - mx * (256 / W) + N) / 2;
      const gx = Math.floor(R.wx(vX, vY)), gy = Math.floor(R.wy(vX, vY));
      if (!inb(gx, gy)) continue;
      const i = I(gx, gy);
      if (!G.fog[i]) { u[my * W + mx] = pk(16, 15, 14); continue; }
      let c;
      const bi = G.bld[i];
      if (bi >= 0) { const cc = CAT[B[G.buildings[bi].type].cat] || [220, 220, 220]; c = pk(cc[0], cc[1], cc[2]); }
      else if (G.road[i]) c = pk(170, 168, 160);
      else {
        const t = G.terr[i];
        c = t === T.WATER ? pk(46, 80, 96) : t === T.TOXIC ? pk(96, 130, 30) : t === T.ASPHALT ? pk(74, 72, 68) : t === T.SAND ? pk(160, 138, 96) : pk(104, 84, 58);
        const f = G.feat[i];
        if (f === F.RUIN) c = pk(130, 126, 118); else if (f === F.TREE) c = pk(70, 58, 44); else if (f) c = pk(124, 104, 78);
      }
      u[my * W + mx] = c;
    }
    mm._img = id; mm._t = G.t; mm._v = G.bver; mm._r = R.rot;
  }
  ctx.putImageData(mm._img, 0, 0);
  const sx = W / 256, sy = Hh / 128;
  const dot = (x, y, s, col) => { const X = R.vx(x, y), Y = R.vy(x, y); ctx.fillStyle = col; ctx.fillRect(Math.round((X - Y + N) * sx) - 1, Math.round(((X + Y) / 2) * sy) - 1, s, s); };
  for (const un of G.units) {
    if ((un.kind !== 'mutant' && un.kind !== 'raider') || !G.fog[I(Math.floor(un.x), Math.floor(un.y))]) continue;
    dot(un.x, un.y, 2, un.kind === 'raider' ? '#ff4030' : '#b0e040');
  }
  for (const c of G.convoys) if (c._x != null) dot(c._x, c._y, 3, '#ffffff');
  const bw = R.buf.width, bh = R.buf.height;
  ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = 1;
  ctx.strokeRect(Math.round((R.left / 16 + N) * sx) + 0.5, Math.round((R.top / 16) * sy) + 0.5, Math.round((bw / 16) * sx), Math.round((bh / 16) * sy));
}
