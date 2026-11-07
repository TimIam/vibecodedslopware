// Isometric renderer. Draws into a low-resolution buffer at one world pixel per pixel,
// then scales it up by an integer so the pixel art stays chunky.
import { N, T, F, B, DAY } from './data.js';
import { I, inb, fbm } from './world.js';
import { buildingSprite, featureSpriteCached, msvSprite, hash, canvas, pk, sh, hex } from './art.js';

const CH = 16, CW = CH * 32, CHH = CH * 16;

export class Renderer {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.buf = canvas(16, 16); this.bx = this.buf.getContext('2d');
    this.cam = { x: 0, y: 0, z: 2 };
    this.chunks = new Map();
    this.smoke = []; this.cars = new Map(); this.decals = [];
    this.grid = false; this.t = 0;
    this.msv = [msvSprite(0), msvSprite(1)];
    this.tints = {};
    for (const [k, c, a] of [['ok', [90, 220, 110], 150], ['bad', [230, 70, 60], 150], ['sel', [250, 220, 90], 110], ['clr', [250, 190, 60], 120], ['road', [180, 200, 230], 120], ['dim', [0, 0, 0], 90]]) this.tints[k] = this.diamond(c, a);
    this.ui = { hover: null, ghost: null, sel: null, drag: null, roadPath: null, showOwn: false, msvTarget: null, sid: 0 };
  }
  diamond(c, a) {
    const cv = canvas(32, 16), x = cv.getContext('2d'), id = x.createImageData(32, 16), u = new Uint32Array(id.data.buffer);
    for (let y = 0; y < 16; y++) for (let X = 0; X < 32; X++) {
      if (Math.abs(X + 0.5 - 16) / 16 + Math.abs(y + 0.5 - 8) / 8 >= 1) continue;
      if ((X + y) % 2 === 0) u[y * 32 + X] = pk(c[0], c[1], c[2], a);
    }
    x.putImageData(id, 0, 0);
    return cv;
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.floor(this.cv.clientWidth * dpr), Hh = Math.floor(this.cv.clientHeight * dpr);
    if (this.cv.width !== W || this.cv.height !== Hh) { this.cv.width = W; this.cv.height = Hh; }
    this.scale = Math.max(1, Math.round(this.cam.z * dpr));
    const bw = Math.ceil(W / this.scale), bh = Math.ceil(Hh / this.scale);
    if (this.buf.width !== bw || this.buf.height !== bh) { this.buf.width = bw; this.buf.height = bh; }
    this.left = Math.round(this.cam.x - bw / 2); this.top = Math.round(this.cam.y - bh / 2);
  }
  // screen (css px) -> world grid (float)
  toGrid(px, py) {
    const dpr = window.devicePixelRatio || 1;
    const X = (px * dpr) / this.scale + this.left, Y = (py * dpr) / this.scale + this.top;
    return [(X / 16 + Y / 8) / 2, (Y / 8 - X / 16) / 2, X, Y];
  }
  centerOn(gx, gy) { this.cam.x = (gx - gy) * 16; this.cam.y = (gx + gy) * 8; }

  // ---------- ground ----------
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
    if (rd) {
      const m = (xx, yy) => inb(xx, yy) && (G.road[I(xx, yy)] || (G.bld[I(xx, yy)] >= 0 && G.buildings[G.bld[I(xx, yy)]].type !== 'park'));
      const ex = m(x + 1, y), wx = m(x - 1, y), sy = m(x, y + 1), ny = m(x, y - 1), w = 0.3;
      const onX = Math.abs(v - 0.5) < w && ((u >= 0.5 && ex) || (u <= 0.5 && wx) || Math.abs(u - 0.5) < w);
      const onY = Math.abs(u - 0.5) < w && ((v >= 0.5 && sy) || (v <= 0.5 && ny) || Math.abs(v - 0.5) < w);
      if (onX || onY || (!ex && !wx && !sy && !ny && Math.abs(u - 0.5) < w + 0.05 && Math.abs(v - 0.5) < w + 0.05)) {
        if (rd === 1) c = sh([142, 118, 84], 0.9 + hh * 0.14 + (Math.abs((onX ? v : u) - 0.5) < 0.08 ? 0.06 : 0) + (Math.abs(Math.abs((onX ? v : u) - 0.5) - 0.18) < 0.05 ? -0.1 : 0));
        else if (rd === 2) c = sh([138, 134, 124], 0.88 + hh * 0.2);
        else {
          c = sh([58, 58, 60], 0.94 + hh * 0.08);
          const along = onX && !onY ? u : !onX && onY ? v : -1, across = onX && !onY ? v : u;
          if (along >= 0 && Math.abs(across - 0.5) < 0.035 && Math.floor(along * 4) % 2 === 0) c = pk(214, 186, 70);
          if (Math.abs(Math.abs(across - 0.5) - w + 0.03) < 0.03 && along >= 0) c = pk(170, 170, 166);
        }
      }
    }
    if (this.grid && (u < 0.04 || v < 0.04)) c = sh([(c & 255), (c >> 8) & 255, (c >> 16) & 255], 0.85);
    return c;
  }
  chunk(G, cx, cy) {
    const key = cy * 100 + cx;
    let ch = this.chunks.get(key);
    if (ch && !ch.dirty) return ch;
    if (this.budget <= 0) return ch || null;
    this.budget--;
    if (!ch) { ch = { c: canvas(CW, CHH), dirty: false }; this.chunks.set(key, ch); }
    const x0 = cx * CH, y0 = cy * CH, L = (x0 - y0 - CH) * 16, Tt = (x0 + y0) * 8;
    const ctx = ch.c.getContext('2d'), id = ctx.createImageData(CW, CHH), out = new Uint32Array(id.data.buffer);
    for (let py = 0; py < CHH; py++) for (let px = 0; px < CW; px++) {
      const X = L + px, Y = Tt + py, gx = ((X + 0.5) / 16 + (Y + 0.5) / 8) / 2, gy = ((Y + 0.5) / 8 - (X + 0.5) / 16) / 2;
      const tx = Math.floor(gx), ty = Math.floor(gy);
      if (tx < x0 || ty < y0 || tx >= x0 + CH || ty >= y0 + CH || tx >= N || ty >= N) continue;
      out[py * CW + px] = this.groundPx(G, tx, ty, gx - tx, gy - ty, X, Y);
    }
    ctx.putImageData(id, 0, 0);
    ch.dirty = false; ch.L = L; ch.T = Tt;
    return ch;
  }
  invalidateAll() { for (const ch of this.chunks.values()) ch.dirty = true; }

  // ---------- frame ----------
  draw(G, dt, info) {
    this.t += dt;
    for (const k of G.dirty) { const ch = this.chunks.get(k); if (ch) ch.dirty = true; }
    G.dirty.clear();
    this.resize();
    const b = this.bx, bw = this.buf.width, bh = this.buf.height, L = this.left, Tp = this.top;
    b.imageSmoothingEnabled = false;
    b.fillStyle = '#0c0b0a'; b.fillRect(0, 0, bw, bh);
    // ground chunks in view
    this.budget = this.bigBudget ? 999 : 2; this.bigBudget = false;
    const ncx = Math.ceil(N / CH);
    for (let cy = 0; cy < ncx; cy++) for (let cx = 0; cx < ncx; cx++) {
      const x0 = cx * CH, y0 = cy * CH, cl = (x0 - y0 - CH) * 16 - L, ct = (x0 + y0) * 8 - Tp;
      if (cl > bw || ct > bh || cl + CW < 0 || ct + CHH < 0) continue;
      const ch = this.chunk(G, cx, cy);
      if (ch) b.drawImage(ch.c, cl, ct);
    }
    const ui = this.ui;
    // territory edges and tile tints (under objects)
    if (ui.showOwn) this.drawOwn(G);
    if (ui.drag && ui.drag.kind === 'clear') {
      const [x0, y0, x1, y1] = ui.drag.rect;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (inb(x, y) && G.feat[I(x, y)]) this.tile(x, y, ui.drag.cancel ? 'bad' : 'clr');
    }
    if (ui.roadPath) for (const [x, y, ok] of ui.roadPath) this.tile(x, y, ok ? 'road' : 'bad');
    if (ui.ghost) { const g = ui.ghost; for (let y = g.y; y < g.y + g.d; y++) for (let x = g.x; x < g.x + g.w; x++) this.tile(x, y, g.ok ? 'ok' : 'bad'); }
    // decals: blood
    for (const f of G.fx) if (f.k === 'blood') {
      const [sx, sy] = this.sp(f.x, f.y), a = 1 - (G.t - f.t) / f.d;
      b.globalAlpha = Math.max(0, a);
      b.fillStyle = f.c ? '#5a7a2a' : '#7a1a14';
      b.fillRect(sx - 1, sy - 1, 2, 1); b.fillRect(sx, sy, 1, 1);
      b.globalAlpha = 1;
    }
    // objects, depth sorted
    const objs = [];
    const g0 = this.toGridRaw(0, 0), g1 = this.toGridRaw(bw, 0), g2 = this.toGridRaw(0, bh + 70), g3 = this.toGridRaw(bw, bh + 70);
    const minx = Math.max(0, Math.floor(Math.min(g0[0], g1[0], g2[0], g3[0])) - 1), maxx = Math.min(N - 1, Math.ceil(Math.max(g0[0], g1[0], g2[0], g3[0])) + 1);
    const miny = Math.max(0, Math.floor(Math.min(g0[1], g1[1], g2[1], g3[1])) - 1), maxy = Math.min(N - 1, Math.ceil(Math.max(g0[1], g1[1], g2[1], g3[1])) + 1);
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const i = I(x, y), f = G.feat[i];
      if (G.terr[i] === T.WATER && G.fog[i]) { // glints on the water
        const ph = (hash(x, y, 3) * 7 + this.t * 0.45) % 1;
        if (ph < 0.08) { const gx = (x - y) * 16 - L + (hash(x, y, 4) * 20 | 0) - 10, gy = (x + y) * 8 - Tp + 5 + (hash(x, y, 5) * 6 | 0); b.fillStyle = ph < 0.04 ? '#d8eef0' : '#8fb8c0'; b.fillRect(gx, gy, ph < 0.04 ? 2 : 1, 1); }
        continue;
      }
      if (!f || f === F.CRATER || !G.fog[i] || G.bld[i] >= 0) continue;
      const sx = (x - y) * 16 - L, sy = (x + y) * 8 - Tp;
      if (sx < -40 || sx > bw + 40 || sy < -20 || sy > bh + 70) continue;
      objs.push({ d: x + y + 1, o: 0, f, fv: G.fv[i], sx, sy, x, y });
    }
    for (const bd of G.buildings) {
      if (bd.dead) continue;
      const sx = (bd.x - bd.y) * 16 - L, sy = (bd.x + bd.y) * 8 - Tp;
      if (sx < -140 || sx > bw + 140 || sy < -40 || sy > bh + 120) continue;
      objs.push({ d: bd.x + bd.w / 2 + bd.y + bd.d / 2, o: 1, b: bd, sx, sy });
    }
    for (const u of G.units) {
      if (u.hidden) continue;
      const [sx, sy] = this.sp(u.x, u.y);
      if (sx < -4 || sx > bw + 4 || sy < -4 || sy > bh + 8) continue;
      objs.push({ d: u.x + u.y, o: 2, u, sx, sy });
    }
    for (const c of G.convoys) {
      const k = Math.floor(c.pos), a = c.path[k], nb = c.path[Math.min(k + 1, c.path.length - 1)], f = c.pos - k;
      const ax = (a % N) + 0.5, ay = ((a / N) | 0) + 0.5, bx2 = (nb % N) + 0.5, by2 = ((nb / N) | 0) + 0.5;
      const x = ax + (bx2 - ax) * f, y = ay + (by2 - ay) * f;
      const axis = Math.abs(bx2 - ax) >= Math.abs(by2 - ay) ? 0 : 1;
      c._x = x; c._y = y;
      objs.push({ d: x + y + 0.6, o: 3, c, x, y, axis });
      if (Math.random() < dt * 20) this.smoke.push({ x, y, z: 2, t: 0, d: 1.2, dust: 1 });
    }
    this.carsTick(G, dt, objs);
    objs.sort((p, q) => p.d - q.d || p.o - q.o);
    const taskOf = new Map();
    for (const t of G.tasks) if (!t.dead && (t.kind === 'build' || t.kind === 'reno')) taskOf.set(t.bid, t);
    for (const ob of objs) {
      if (ob.o === 0) { const s = featureSpriteCached(ob.f, ob.fv); if (s) b.drawImage(s.c, ob.sx - s.ax, ob.sy - s.ay); }
      else if (ob.o === 1) this.drawBuilding(G, ob.b, ob.sx, ob.sy, taskOf.get(ob.b.id), info);
      else if (ob.o === 2) this.drawUnit(G, ob.u, ob.sx, ob.sy);
      else if (ob.o === 3) {
        const s = this.msv[ob.axis], w = ob.axis ? 0.6 : 1.4, d = ob.axis ? 1.4 : 0.6;
        const [sx, sy] = this.sp(ob.x - w / 2, ob.y - d / 2);
        b.drawImage(s.c, sx - s.ax, sy - s.ay - (Math.floor(this.t * 8) % 2));
      } else if (ob.o === 4) {
        b.fillStyle = ob.col; b.fillRect(ob.sx - 1, ob.sy - 2, 3, 2);
        b.fillStyle = '#1e2a33'; b.fillRect(ob.sx + (ob.dir > 0 ? 1 : -1), ob.sy - 2, 1, 1);
      }
    }
    // queued clearing markers
    for (const t of G.tasks) if (t.kind === 'clear' && !t.dead) {
      const [sx, sy] = this.sp(t.x + 0.5, t.y + 0.5);
      if (sx < 0 || sy < 0 || sx > bw || sy > bh) continue;
      const blink = Math.floor(this.t * 2 + t.id) % 2;
      b.fillStyle = t.n ? '#ffe36a' : blink ? '#f0a030' : '#a86a20';
      b.fillRect(sx, sy - 14, 1, 5); b.fillRect(sx + 1, sy - 14, 2, 2);
    }
    // smoke and dust
    this.smoke = this.smoke.filter((p) => (p.t += dt) < p.d);
    for (const p of this.smoke) {
      const [sx, sy] = this.sp(p.x, p.y), a = 1 - p.t / p.d;
      b.globalAlpha = a * (p.dust ? 0.6 : 0.5);
      const r = p.dust ? 1 + (p.t * 2 | 0) : 1 + Math.min(3, (p.t * 1.3) | 0);
      const px = Math.round(sx + (p.sx || 0) + p.t * p.t * 1.6 - r / 2), py = Math.round(sy - p.z - p.t * (p.dust ? 2 : 7) - r / 2);
      b.fillStyle = p.dust ? '#a08a66' : p.t < 0.3 && p.fire ? '#e0a050' : p.t < 0.6 ? '#6e6a64' : '#9a958c';
      b.fillRect(px, py, r, r);
      if (!p.dust && r > 1) { b.fillStyle = '#b8b3a8'; b.fillRect(px, py, r - 1, 1); }
    }
    b.globalAlpha = 1;
    // combat effects
    for (const f of G.fx) {
      if (f.k === 'shot') { const [ax, ay] = this.sp(f.x, f.y), [bx2, by2] = this.sp(f.x2, f.y2); this.pline(ax, ay - 2, bx2, by2 - 2, f.c ? '#ff8a50' : '#fff2a0'); }
      else if (f.k === 'hit') { const [sx, sy] = this.sp(f.x, f.y); b.fillStyle = '#ffffff'; b.fillRect(sx - 1, sy - 3, 3, 1); }
      else if (f.k === 'dust' && !f.seen) { f.seen = 1; for (let k = 0; k < 5; k++) this.smoke.push({ x: f.x + (Math.random() - 0.5) * 0.6, y: f.y + (Math.random() - 0.5) * 0.6, z: 1, t: 0, d: 0.9, dust: 1 }); }
    }
    // selection and hover outlines
    if (ui.sel != null) { const s = G.buildings[ui.sel]; if (s && !s.dead) this.outline(s.x, s.y, s.w, s.d, '#ffe36a'); }
    if (ui.hover && !ui.ghost && !ui.roadPath) this.outline(ui.hover[0], ui.hover[1], 1, 1, 'rgba(255,255,255,0.8)');
    if (ui.ghost) {
      const g = ui.ghost, s = buildingSprite({ type: g.type, era: g.era, siding: g.siding, hue: 0 });
      const sx = (g.x - g.y) * 16 - L, sy = (g.x + g.y) * 8 - Tp;
      b.globalAlpha = 0.55; b.drawImage(s.c, sx - s.ax, sy - s.ay); b.globalAlpha = 1;
    }
    if (ui.msvTarget) {
      const m = ui.msvTarget;
      this.outline(m.x, m.y, 2, 2, m.ok ? '#7dff8a' : '#ff6a5a');
      const [sx, sy] = this.sp(m.x + 1, m.y + 1);
      b.strokeStyle = m.ok ? 'rgba(125,255,138,0.5)' : 'rgba(255,106,90,0.4)';
      b.beginPath(); b.ellipse(sx, sy, 30 * 22.6 / 1.4, 30 * 11.3 / 1.4, 0, 0, Math.PI * 2); b.stroke();
    }
    // offscreen threat markers for the town in view
    this.threatMarkers(G);
    // blit
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, bw * this.scale, bh * this.scale);
  }
  toGridRaw(bx, by) { const X = bx + this.left, Y = by + this.top; return [(X / 16 + Y / 8) / 2, (Y / 8 - X / 16) / 2]; }
  sp(gx, gy) { return [Math.round((gx - gy) * 16 - this.left), Math.round((gx + gy) * 8 - this.top)]; }
  tile(x, y, k) { this.bx.drawImage(this.tints[k], (x - y) * 16 - 16 - this.left, (x + y) * 8 - this.top); }
  pline(x0, y0, x1, y1, col) {
    const b = this.bx; b.fillStyle = col;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, n = 0;
    for (;;) { b.fillRect(x0, y0, 1, 1); if ((x0 === x1 && y0 === y1) || n++ > 400) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  outline(x, y, w, d, col) {
    const p = (gx, gy) => this.sp(gx, gy);
    const a = p(x, y), bb = p(x + w, y), c = p(x + w, y + d), e = p(x, y + d);
    this.pline(a[0], a[1], bb[0] - 1, bb[1], col); this.pline(bb[0] - 1, bb[1], c[0], c[1] - 1, col);
    this.pline(c[0] - 1, c[1] - 1, e[0], e[1], col); this.pline(e[0], e[1], a[0] - 1, a[1], col);
  }
  drawOwn(G) {
    const b = this.bx, sid = this.ui.sid;
    b.fillStyle = 'rgba(255,230,120,0.75)';
    const [x0, y0] = this.toGridRaw(0, 0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const o = G.own[I(x, y)];
      if (o < 0) continue;
      const sx = (x - y) * 16 - this.left, sy = (x + y) * 8 - this.top;
      if (sx < -20 || sy < -20 || sx > this.buf.width + 20 || sy > this.buf.height + 20) continue;
      const ed = (xx, yy) => !inb(xx, yy) || G.own[I(xx, yy)] !== o;
      // NW edge (-x), NE edge (-y), SE edge (+x), SW edge (+y)
      if (ed(x, y - 1)) for (let k = 0; k < 16; k += 2) b.fillRect(sx + k, sy + (k >> 1), 1, 1);
      if (ed(x - 1, y)) for (let k = 0; k < 16; k += 2) b.fillRect(sx - k - 1, sy + (k >> 1), 1, 1);
      if (ed(x + 1, y)) for (let k = 0; k < 16; k += 2) b.fillRect(sx + 15 - k, sy + 8 + (k >> 1), 1, 1);
      if (ed(x, y + 1)) for (let k = 0; k < 16; k += 2) b.fillRect(sx - 16 + k, sy + 8 + (k >> 1), 1, 1);
    }
    void x0; void y0; void sid;
  }
  drawBuilding(G, bd, sx, sy, task, info) {
    const b = this.bx, s = buildingSprite(bd);
    const x = sx - s.ax, y = sy - s.ay;
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
    const def = B[bd.type];
    const active = bd.eff > 0.05;
    if (s.smoke.length && active && Math.random() < 0.06 * (1 + bd.eff)) {
      const [ex, ey] = s.smoke[Math.floor(Math.random() * s.smoke.length)];
      // convert sprite-local pixel back into grid space for the particle
      const X = sx + ex + this.left, Y = sy + ey + this.top;
      const gx = (X / 16 + Y / 8) / 2, gy = (Y / 8 - X / 16) / 2;
      this.smoke.push({ x: gx, y: gy, z: 0, t: 0, d: 2.6 + Math.random(), fire: bd.type === 'refinery' });
    }
    if (bd.type === 'windmill' && s.extra.hub) {
      const [hx, hy] = s.extra.hub, cx = sx + hx, cy = sy + hy, a0 = this.t * (active || true ? 2.4 : 0) + bd.id;
      for (let k = 0; k < 3; k++) { const a = a0 + (k * Math.PI * 2) / 3; this.pline(cx, cy, cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, '#ecece6'); }
      b.fillStyle = '#9a9a96'; b.fillRect(cx, cy, 1, 1);
    }
    if (def.jobs && bd.workers === 0 && info.flags) { // unstaffed: a little red mark
      if (Math.floor(this.t * 1.5) % 2) { b.fillStyle = '#e8483a'; b.fillRect(sx - 1, sy - s.ay - 6, 2, 3); b.fillRect(sx - 1, sy - s.ay - 2, 2, 1); }
    }
    if (bd.msv && bd.msv.ready) { const ms = this.msv[0]; const [px, py] = this.sp(bd.x + bd.w + 0.1, bd.y + 0.6); b.drawImage(ms.c, px - ms.ax, py - ms.ay); }
  }
  scaffold(bd, h) {
    const col = '#b08a50', b = this.bx;
    for (const [gx, gy] of [[bd.x, bd.y + bd.d], [bd.x + bd.w, bd.y + bd.d], [bd.x + bd.w, bd.y], [bd.x + bd.w / 2, bd.y + bd.d]]) {
      const [sx, sy] = this.sp(gx, gy);
      b.fillStyle = col; b.fillRect(sx, sy - h, 1, h);
    }
    for (let z = 6; z < h; z += 7) {
      const a = this.sp(bd.x, bd.y + bd.d), c = this.sp(bd.x + bd.w, bd.y + bd.d), e = this.sp(bd.x + bd.w, bd.y);
      this.pline(a[0], a[1] - z, c[0], c[1] - z, '#8a6a3a'); this.pline(c[0], c[1] - z, e[0], e[1] - z, '#7a5a30');
    }
  }
  drawUnit(G, u, sx, sy) {
    const b = this.bx, ph = Math.floor((u.walk || 0) * 4) % 2;
    const moving = !!u.path;
    b.fillStyle = 'rgba(20,14,8,0.45)'; b.fillRect(sx, sy, u.kind === 'mutant' ? 3 : 2, 1); // a speck of shadow
    const SHIRT = ['#b55a3a', '#5f7f9a', '#8a8a4a', '#a07a5a', '#7a5a8a', '#4f8a6a', '#c0a060', '#9a4a5a'];
    if (u.kind === 'civ') {
      b.fillStyle = '#3b3530'; b.fillRect(sx + (moving && ph ? 1 : 0), sy - 1, 1, 1);
      b.fillStyle = SHIRT[u.col]; b.fillRect(sx, sy - 2, 1, 1);
      b.fillStyle = '#e0b48c'; b.fillRect(sx, sy - 3, 1, 1);
      if (u.st === 'working' && ph) { b.fillStyle = '#c8c0b0'; b.fillRect(sx + 1, sy - 3, 1, 1); }
      if (u.st === 'flee') { b.fillStyle = '#ffffff'; if (Math.floor(this.t * 6) % 2) b.fillRect(sx, sy - 5, 1, 1); }
    } else if (u.kind === 'sec') {
      b.fillStyle = '#2b2a28'; b.fillRect(sx + (moving && ph ? 1 : 0), sy - 1, 1, 1);
      b.fillStyle = '#3e6a8e'; b.fillRect(sx, sy - 2, 1, 1);
      b.fillStyle = '#2f3a2f'; b.fillRect(sx, sy - 3, 1, 1);
      b.fillStyle = '#1a1a1a'; b.fillRect(sx + (u.fx - u.fy >= 0 ? 1 : -1), sy - 2, 1, 1);
      if (u.hp < u.max) this.hp(sx, sy - 5, u.hp / u.max, '#5ad06a');
    } else if (u.kind === 'raider') {
      b.fillStyle = '#2b2a28'; b.fillRect(sx + (moving && ph ? 1 : 0), sy - 1, 1, 1);
      b.fillStyle = '#8e2b20'; b.fillRect(sx, sy - 2, 1, 1);
      b.fillStyle = '#151312'; b.fillRect(sx, sy - 3, 1, 1);
      b.fillStyle = '#1a1a1a'; b.fillRect(sx + (u.fx - u.fy >= 0 ? 1 : -1), sy - 2, 1, 1);
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
    // little EVs that wander the road network near each EV plant (visual only)
    const COLS = ['#7fc4c0', '#f0cf6a', '#ef9a83', '#a99ad6', '#9fd38c', '#86b6e8', '#e8e4da'];
    for (const bd of G.buildings) {
      if (bd.dead || !bd.built || bd.type !== 'evplant') continue;
      let list = this.cars.get(bd.id);
      if (!list) { list = []; this.cars.set(bd.id, list); }
      const want = Math.min(8, 2 + Math.floor(bd.eff * 6));
      if (list.length < want && Math.random() < dt * 0.3) {
        // start on a road tile next to the plant
        for (let x = bd.x - 1; x <= bd.x + bd.w; x++) for (let y = bd.y - 1; y <= bd.y + bd.d; y++) {
          if (inb(x, y) && G.road[I(x, y)] && list.length < want && Math.random() < 0.3) list.push({ x, y, px: x, py: y, f: 0, col: COLS[(Math.random() * COLS.length) | 0], spd: 1.6 + Math.random() });
        }
      }
      for (const c of list) {
        c.f += dt * c.spd;
        if (c.f >= 1) {
          c.f = 0; c.px = c.x; c.py = c.y;
          const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [c.x + dx, c.y + dy]).filter(([x, y]) => inb(x, y) && G.road[I(x, y)]);
          const fwd = opts.filter(([x, y]) => !(x === c.lx && y === c.ly));
          const pick2 = (fwd.length ? fwd : opts)[(Math.random() * (fwd.length || opts.length)) | 0];
          c.lx = c.x; c.ly = c.y;
          if (pick2) { c.x = pick2[0]; c.y = pick2[1]; }
        }
        const gx = c.px + (c.x - c.px) * c.f + 0.5, gy = c.py + (c.y - c.py) * c.f + 0.5;
        const [sx, sy] = this.sp(gx + 0.12, gy - 0.12);
        objs.push({ d: gx + gy, o: 4, sx, sy, col: c.col, dir: (c.x - c.px) - (c.y - c.py) });
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
      const mx = Math.round(cx + dx * k), my = Math.round(cy + dy * k);
      b.fillStyle = u.kind === 'raider' ? '#ff4a3a' : '#a8d040';
      b.fillRect(mx - 1, my - 1, 3, 3);
    }
  }
  // building under the cursor, by sprite pixel
  pick(G, px, py) {
    const [, , X, Y] = this.toGrid(px, py);
    let best = null, bd = -1e9;
    for (const bb of G.buildings) {
      if (bb.dead) continue;
      const s = buildingSprite(bb), x = Math.floor(X - ((bb.x - bb.y) * 16 - s.ax)), y = Math.floor(Y - ((bb.x + bb.y) * 8 - s.ay));
      if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
      if (!s.mask) s.mask = s.c.getContext('2d').getImageData(0, 0, s.w, s.h).data;
      if (s.mask[(y * s.w + x) * 4 + 3] < 200) continue; // not the translucent shadow
      const depth = bb.x + bb.w / 2 + bb.y + bb.d / 2;
      if (depth > bd) { bd = depth; best = bb; }
    }
    return best;
  }
}

// ---------- minimap ----------
export function drawMinimap(G, mm, R, sid) {
  const ctx = mm.getContext('2d'), W = mm.width, Hh = mm.height;
  if (!mm._img || mm._t < G.t - 1.5 || mm._v !== G.bver) {
    const id = ctx.createImageData(W, Hh), u = new Uint32Array(id.data.buffer);
    const CAT = { housing: [200, 170, 120], food: [110, 170, 70], industry: [190, 130, 70], power: [230, 210, 80], civic: [120, 170, 220], retail: [230, 120, 160], defense: [80, 110, 160], transport: [200, 200, 210] };
    for (let my = 0; my < Hh; my++) for (let mx = 0; mx < W; mx++) {
      const gx = Math.floor((2 * my * (128 / Hh) + mx * (256 / W) - N) / 2), gy = Math.floor((2 * my * (128 / Hh) - mx * (256 / W) + N) / 2);
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
    mm._img = id; mm._t = G.t; mm._v = G.bver;
  }
  ctx.putImageData(mm._img, 0, 0);
  const sx = W / 256, sy = Hh / 128;
  for (const un of G.units) {
    const hostile = un.kind === 'mutant' || un.kind === 'raider';
    if (!hostile || !G.fog[I(Math.floor(un.x), Math.floor(un.y))]) continue;
    ctx.fillStyle = un.kind === 'raider' ? '#ff4030' : '#b0e040';
    ctx.fillRect(Math.round((un.x - un.y + N) * sx) - 1, Math.round(((un.x + un.y) / 2) * sy) - 1, 2, 2);
  }
  for (const c of G.convoys) if (c._x != null) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round((c._x - c._y + N) * sx) - 1, Math.round(((c._x + c._y) / 2) * sy) - 1, 3, 3); }
  // the view
  const bw = R.buf.width, bh = R.buf.height;
  ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = 1;
  ctx.strokeRect(Math.round((R.left / 16 + N) * sx) + 0.5, Math.round((R.top / 16) * sy) + 0.5, Math.round((bw / 16) * sx), Math.round((bh / 16) * sy));
  void sid; void DAY; void hex;
}
