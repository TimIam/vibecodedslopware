// Room Importer: single-photo metrology from known landmark sizes (and US currency when needed),
// a <=500-triangle room model, suggested tree spots drawn on the photo with occlusion, and
// rendered trees placed back into the photo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LANDMARKS, COCO_MAP, CURRENCY, currencySize } from './data.js';
import { buildDesign, WALL_AZ, wrapPi } from './scene.js';
import { newDesign, randomDesign } from './decorate.js';
import { designs, idb, uid, fileToDataURL, loadImage } from './store.js';
import { $, $$, h, ask, toast, select, esc, fmtLen } from './ui.js';
import { refineMask } from './segment.js';

const DEG = Math.PI / 180;
const UNC_LIMIT = 3; // inches: "more than a few inches" of uncertainty asks for currency

export class Room {
  constructor(root, app) {
    this.app = app; this.root = root;
    this.st = null; this.img = null; this.mode = null; this.drag = null; this.sel = null; this.masks = new Map();
    this.initDom();
    idb.get('rooms', 'current').then(async s => { if (s?.photo) { this.st = s; this.img = await loadImage(s.photo); this.ready(); } else this.renderPanel(); }).catch(() => this.renderPanel());
  }
  save() { if (this.st) idb.put('rooms', { ...this.st, id: 'current' }).catch(() => { }); }

  initDom() {
    this.root.innerHTML = `
      <div class="r-stage"><div class="stagebox">
        <div class="empty">
          <h2>Start with a photo of your room</h2>
          <p>Stand where you'd normally see the tree from and hold the phone level. Get some floor and at least one wall in the shot, plus anything with a standard size: a door, a couch, a light switch.</p>
          <div class="btns"><label class="btn primary">📷 Take a photo<input type="file" accept="image/*" capture="environment" hidden data-in="photo"></label>
          <label class="btn">🖼 Choose a photo<input type="file" accept="image/*" hidden data-in="photo"></label>
          <button class="btn" data-act="sample">Try a sample room</button></div>
        </div>
        <div class="layers" hidden><canvas class="photo"></canvas><canvas class="gl"></canvas><canvas class="ov" tabindex="0" aria-label="Room photo with measurement handles"></canvas></div>
      </div><div class="r-model"><div class="mhead">3D model <span class="tris"></span></div><canvas class="model3d"></canvas></div></div>
      <div class="r-panel"></div>`;
    this.root.addEventListener('change', async e => {
      if (e.target.dataset.in !== 'photo') return; const f = e.target.files[0]; if (!f) return;
      const keep = e.target.dataset.keep === '1'; e.target.value = '';
      await this.loadPhoto(await fileToDataURL(f, 1600), keep);
    });
    this.root.addEventListener('click', e => { if (e.target.closest('[data-act=sample]')) this.loadSample(); });
    const ov = $('.ov', this.root);
    ov.addEventListener('pointerdown', e => this.pdown(e)); ov.addEventListener('pointermove', e => this.pmove(e)); ov.addEventListener('pointerup', e => this.pup(e));
    ov.addEventListener('keydown', e => { if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel?.lm) { this.removeLm(this.sel.lm.id); } });
    new ResizeObserver(() => this.layout()).observe($('.stagebox', this.root));
  }

  async loadPhoto(src, keepMarks = false) {
    const img = await loadImage(src);
    const old = this.st;
    this.img = img; this.masks.clear();
    const W = img.width, H = img.height;
    if (keepMarks && old) { // retake with currency: keep marks, rescale to the new size
      const sx = W / old.W, sy = H / old.H, P = p => p && ({ x: p.x * sx, y: p.y * sy });
      this.st = { ...old, photo: src, W, H, horizon: old.horizon * sy, floor: old.floor.map(P), ceiling: P(old.ceiling), landmarks: old.landmarks.map(l => ({ ...l, box: [l.box[0] * sx, l.box[1] * sy, l.box[2] * sx, l.box[3] * sy], floor: P(l.floor) })), assigned: {} };
      this.ready(); toast('New photo loaded. Now mark the currency.'); return;
    }
    this.st = { photo: src, W, H, hfov: 69, horizon: H * 0.45, floor: [{ x: W * 0.02, y: H * 0.98 }, { x: W * 0.98, y: H * 0.98 }, { x: W * 0.8, y: H * 0.66 }, { x: W * 0.2, y: H * 0.66 }],
      ceiling: null, landmarks: [], currency: null, sideWalls: { left: 'auto', right: 'auto', back: true }, assigned: {}, detect: 'pending' };
    this.guessFloorFromImage();
    this.st.horizon = Math.min(H * 0.5, this.st.floor[2].y - H * 0.06); // a level phone puts eye level mid-frame
    this.ready();
    this.detect();
  }
  async loadSample() {
    const { src, marks } = sampleRoom(); await this.loadPhoto(src, false);
    Object.assign(this.st, { floor: marks.floor, horizon: marks.horizon, sideWalls: { left: true, right: true, back: true } });
    this.st.landmarks.push(...marks.landmarks); this.solve(); this.renderPanel();
    toast('Sample room loaded with a door, doorknob, switch and couch marked. There is a $1 bill on the floor too.', 5000);
  }

  ready() {
    $('.empty', this.root).hidden = true; $('.layers', this.root).hidden = false;
    const { W, H } = this.st;
    for (const c of $$('.layers canvas', this.root)) { if (!c.classList.contains('gl')) { c.width = W; c.height = H; } }
    $('.photo', this.root).getContext('2d').drawImage(this.img, 0, 0, W, H);
    this.imageData = $('.photo', this.root).getContext('2d').getImageData(0, 0, W, H);
    this.init3d(); this.layout(); this.solve(); this.renderPanel();
  }
  layout() {
    if (!this.st) return;
    const box = $('.stagebox', this.root), L = $('.layers', this.root);
    const maxW = box.clientWidth, maxH = Math.max(240, box.clientHeight || window.innerHeight * 0.6);
    const s = Math.min(maxW / this.st.W, maxH / this.st.H);
    L.style.width = Math.round(this.st.W * s) + 'px'; L.style.height = Math.round(this.st.H * s) + 'px';
    if (this.gl) { this.gl.setSize(Math.round(this.st.W * s), Math.round(this.st.H * s), false); this.renderTrees(); }
  }

  // ---------------- auto-detection ----------------
  async detect() {
    this.st.detect = 'running'; this.renderPanel();
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
      this.detector = this.detector || await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
      const preds = await this.detector.detect(this.img, 20, 0.45);
      let n = 0;
      for (const p of preds) {
        const type = COCO_MAP[p.class]; if (!type) continue;
        const [x, y, w, hh] = p.bbox;
        if (this.st.landmarks.some(l => iou(l.box, [x, y, x + w, y + hh]) > 0.5)) continue;
        this.st.landmarks.push({ id: uid(), type, box: [x, y, x + w, y + hh], floor: null, auto: true, score: p.score }); n++;
      }
      this.st.detect = `found ${n}`;
      if (n) this.refineFloorFromFurniture();
    } catch (err) { console.warn(err); this.st.detect = 'unavailable'; }
    this.solve(); this.renderPanel();
  }
  // Floor edge guess: furniture bottoms sit on the floor, so the floor's back edge must be above them.
  refineFloorFromFurniture() {
    const bottoms = this.st.landmarks.filter(l => LANDMARKS[l.type].block && !LANDMARKS[l.type].floorHandle).map(l => l.box[3]);
    if (!bottoms.length) return;
    const top = Math.min(...bottoms) - this.st.H * 0.03;
    const f = this.st.floor; if (f[2].y > top) { f[2].y = f[3].y = Math.max(this.st.horizon + this.st.H * 0.05, top); }
  }
  // Rough floor/wall boundary from the photo: strongest horizontal edge row in the lower half.
  guessFloorFromImage() {
    const { W, H } = this.st, c = document.createElement('canvas'), s = 200 / W; c.width = 200; c.height = Math.round(H * s);
    const g = c.getContext('2d'); g.drawImage(this.img, 0, 0, c.width, c.height); const d = g.getImageData(0, 0, c.width, c.height).data;
    const lum = (x, y) => { const i = (y * c.width + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
    let best = -1, by = 0;
    for (let y = Math.round(c.height * 0.45); y < c.height * 0.85; y++) { let e = 0; for (let x = 20; x < 180; x++) e += Math.abs(lum(x, y + 1) - lum(x, y - 1)); e *= 1 - Math.abs(y / c.height - 0.62); if (e > best) { best = e; by = y; } }
    const yb = by / s; const f = this.st.floor; f[2].y = f[3].y = yb; f[3].x = W * 0.18; f[2].x = W * 0.82;
  }

  // ---------------- camera model ----------------
  cam() {
    const { W, H, hfov, horizon } = this.st; const f = (W / 2) / Math.tan(hfov * DEG / 2);
    return { f, cx: W / 2, cy: H / 2, th: Math.atan((H / 2 - horizon) / f) };
  }
  ray(x, y, c = this.cam()) {
    const dx = (x - c.cx) / c.f, dy = -(y - c.cy) / c.f, dz = -1, ct = Math.cos(c.th), s = Math.sin(c.th);
    return { x: dx, y: dy * ct + dz * s, z: -dy * s + dz * ct };
  }
  floorPt(x, y, h = 1, c) { const d = this.ray(x, y, c); if (d.y >= -1e-4) return null; const t = h / -d.y; return { x: t * d.x, z: t * d.z }; }
  heightAt(x, y, P, h = 1, c) { const d = this.ray(x, y, c); const t = (d.x * P.x + d.z * P.z) / (d.x * d.x + d.z * d.z); return h + t * d.y; }
  project(p, c = this.cam(), h = this.camH) { // world (x, y, z) -> image px
    const v = { x: p.x, y: p.y - h, z: p.z }, ct = Math.cos(c.th), s = Math.sin(c.th);
    const y1 = v.y * ct - v.z * s, z1 = v.y * s + v.z * ct; // inverse of ray rotation
    if (z1 >= -1) return null; return { x: c.cx + c.f * v.x / -z1, y: c.cy - c.f * y1 / -z1 };
  }
  autoHorizon(quiet) {
    const [a, b, c, d] = this.st.floor; // left edge a->d, right edge b->c
    const den = (a.x - d.x) * (b.y - c.y) - (a.y - d.y) * (b.x - c.x);
    if (Math.abs(den) < 1e-6) { if (!quiet) toast('Floor edges are parallel; drag the horizon line instead'); return; }
    const t = ((a.x - b.x) * (b.y - c.y) - (a.y - b.y) * (b.x - c.x)) / den, y = a.y + t * (d.y - a.y);
    const min = this.st.H * 0.05, max = Math.min(c.y, d.y) - this.st.H * 0.04;
    this.st.horizon = Math.max(min, Math.min(max, y));
  }

  // ---------------- scale solve ----------------
  solve() {
    const st = this.st, c = this.cam(), ests = [];
    for (const l of st.landmarks) {
      const L = LANDMARKS[l.type], [x0, y0, x1, y1] = l.box, mx = (x0 + x1) / 2;
      const fp = l.floor || { x: mx, y: y1 };
      const P = this.floorPt(fp.x, fp.y, 1, c); if (!P) { l.est = null; continue; }
      let H1, px;
      if (L.kind === 'elev') { H1 = this.heightAt(mx, (y0 + y1) / 2, P, 1, c); px = fp.y - (y0 + y1) / 2; }
      else {
        let Pt = P; const back = (L.topBack || 0) * (L.depth || 0) / (this.camH || 54);
        if (back && L.H < (this.camH || 54)) { const d = Math.hypot(P.x, P.z); Pt = { x: P.x * (1 + back / d), z: P.z * (1 + back / d) }; }
        H1 = this.heightAt(mx, y0, Pt, 1, c) - (l.floor ? this.heightAt(mx, y1, P, 1, c) : 0); px = y1 - y0;
      }
      if (!(H1 > 0.005) || px < 4) { l.est = null; continue; }
      const hEst = L.H / H1, sd = hEst * Math.hypot(L.sd / L.H, 2 / px);
      l.est = { h: hEst, sd, P }; ests.push({ h: hEst, sd, w: 1 / (sd * sd), name: L.label });
    }
    let cur = null;
    if (st.currency?.pts?.length && st.currency.denom) {
      const cs = currencySize(st.currency.denom), F = st.currency.pts.map(p => this.floorPt(p.x, p.y, 1, c));
      if (F.every(Boolean)) {
        let hEst, px;
        if (cs.kind === 'bill') { const d = (a, b) => Math.hypot(F[a].x - F[b].x, F[a].z - F[b].z); const s01 = (d(0, 1) + d(2, 3)) / 2, s12 = (d(1, 2) + d(3, 0)) / 2; const long = Math.max(s01, s12), short = Math.min(s01, s12); hEst = (cs.long / long + cs.short / short) / 2; const q = st.currency.pts, pl = (a, b) => Math.hypot(q[a].x - q[b].x, q[a].y - q[b].y); px = Math.max((pl(0, 1) + pl(2, 3)) / 2, (pl(1, 2) + pl(3, 0)) / 2); }
        else { hEst = cs.d / Math.hypot(F[0].x - F[1].x, F[0].z - F[1].z); px = Math.hypot(st.currency.pts[0].x - st.currency.pts[1].x, st.currency.pts[0].y - st.currency.pts[1].y); }
        const sd = hEst * Math.max(0.01, 1.5 / Math.max(8, px));
        cur = { h: hEst, sd, w: 1 / (sd * sd), name: CURRENCY.bills.concat(CURRENCY.coins).find(x => x.id === st.currency.denom)?.label };
        ests.push(cur);
      }
    }
    let h = 54, sd = 12, n = ests.length;
    if (n) {
      const W = ests.reduce((a, e) => a + e.w, 0); h = ests.reduce((a, e) => a + e.h * e.w, 0) / W; sd = Math.sqrt(1 / W);
      if (n > 1) { const chi = ests.reduce((a, e) => a + e.w * (e.h - h) ** 2, 0) / (n - 1); sd *= Math.max(1, Math.sqrt(chi)); }
    }
    this.camH = h; this.camSd = sd; this.ests = ests; this.curEst = cur;
    this.buildModel(); this.suggest();
    // uncertainty across the visible room
    const ext = this.model ? Math.max(this.model.width, this.model.depth) : 150;
    this.unc = ext * sd / h;
    this.drawOverlay(); this.renderModel3d(); this.renderTrees(); this.save();
  }

  // ---------------- room model (<= 500 triangles) ----------------
  buildModel() {
    const st = this.st, h = this.camH, c = this.cam();
    const F = st.floor.map(p => this.floorPt(p.x, Math.max(p.y, st.horizon + 2), h, c) || { x: 0, z: -100 });
    let ceil = 96;
    if (st.ceiling) { const v = this.heightAt(st.ceiling.x, st.ceiling.y, F[3], h, c); if (v > 60 && v < 240) ceil = v; }
    const tris = [], boxes = [], walls = [];
    const quad = (a, b, cc, d) => { tris.push([a, b, cc], [a, cc, d]); };
    const P3 = (p, y) => new THREE.Vector3(p.x, y, p.z);
    quad(P3(F[0], 0), P3(F[1], 0), P3(F[2], 0), P3(F[3], 0));
    const wallDefs = [['back', F[3], F[2]], ['left', F[0], F[3]], ['right', F[2], F[1]]];
    for (const [name, a, b] of wallDefs) {
      if (!this.hasWall(name)) continue;
      quad(P3(a, 0), P3(b, 0), P3(b, ceil), P3(a, ceil));
      // inward normal = toward the room centroid
      const cx = (F[0].x + F[1].x + F[2].x + F[3].x) / 4, cz = (F[0].z + F[1].z + F[2].z + F[3].z) / 4;
      let nx = -(b.z - a.z), nz = b.x - a.x; const L = Math.hypot(nx, nz); nx /= L; nz /= L;
      if ((cx - a.x) * nx + (cz - a.z) * nz < 0) { nx = -nx; nz = -nz; }
      walls.push({ name, a, b, n: { x: nx, z: nz } });
    }
    for (const l of st.landmarks) {
      const L = LANDMARKS[l.type]; if (!L.depth || L.kind !== 'object' || L.floorHandle || boxes.length >= 38) continue;
      const [x0, y0, x1, y1] = l.box;
      const A = this.floorPt(x0, y1, h, c), B = this.floorPt(x1, y1, h, c); if (!A || !B) continue;
      const mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, dl = Math.hypot(mid.x, mid.z), dir = { x: mid.x / dl, z: mid.z / dl };
      const ht = this.heightAt((x0 + x1) / 2, y0, mid, h, c);
      const D = L.depth, Cc = { x: B.x + dir.x * D, z: B.z + dir.z * D }, Dd = { x: A.x + dir.x * D, z: A.z + dir.z * D };
      const H = Math.max(2, Math.min(ceil, ht || L.H));
      const pts = [A, B, Cc, Dd];
      const v = (p, y) => P3(p, y);
      quad(v(A, H), v(B, H), v(Cc, H), v(Dd, H));
      for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4]; quad(v(p, 0), v(q, 0), v(q, H), v(p, H)); }
      quad(v(A, 0), v(Dd, 0), v(Cc, 0), v(B, 0));
      boxes.push({ lm: l, pts, H, type: l.type, door: l.type === 'door' });
    }
    const xs = F.map(p => p.x), zs = F.map(p => p.z);
    this.model = { F, ceil, tris, boxes, walls, width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) };
  }

  // A side wall counts when ticked, or (by default) when that floor edge isn't just the photo's border.
  hasWall(name) {
    const v = this.st.sideWalls[name]; if (v !== 'auto') return !!v;
    const [a, b] = name === 'left' ? [this.st.floor[0], this.st.floor[3]] : [this.st.floor[1], this.st.floor[2]], W = this.st.W;
    return [a, b].every(p => p.x > W * 0.03 && p.x < W * 0.97);
  }
  // ---------------- tree spot suggestions ----------------
  suggest() {
    const m = this.model, st = this.st; if (!m) return;
    const H = Math.max(48, Math.min(90, Math.round((m.ceil - 12) / 6) * 6)), r = H * 0.29;
    const inside = (p) => { let s = 0; for (let i = 0; i < 4; i++) { const a = m.F[i], b = m.F[(i + 1) % 4]; const cr = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x); s += Math.sign(cr); } return Math.abs(s) === 4; };
    const edgeDist = (p, a, b) => { const ab = { x: b.x - a.x, z: b.z - a.z }, t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / (ab.x ** 2 + ab.z ** 2))); return Math.hypot(p.x - a.x - ab.x * t, p.z - a.z - ab.z * t); };
    const polyDist = (p, pts) => { if (insidePoly(p, pts)) return 0; let d = Infinity; for (let i = 0; i < pts.length; i++) d = Math.min(d, edgeDist(p, pts[i], pts[(i + 1) % pts.length])); return d; };
    const outlets = st.landmarks.filter(l => LANDMARKS[l.type].outlet && l.est).map(l => l.est.P), windows = st.landmarks.filter(l => LANDMARKS[l.type].window);
    const xs = m.F.map(p => p.x), zs = m.F.map(p => p.z), cands = [];
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 4) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 4) {
      const p = { x, z }; if (!inside(p)) continue;
      const wd = m.walls.map(w => ({ w, d: edgeDist(p, w.a, w.b) }));
      if (wd.some(o => o.d < r * 0.92)) continue;
      // keep clear of the photo's open edges (no wall there = the room continues)
      if (edgeDist(p, m.F[0], m.F[1]) < r + 18) continue;
      if (!this.hasWall('left') && edgeDist(p, m.F[0], m.F[3]) < r) continue;
      if (!this.hasWall('right') && edgeDist(p, m.F[1], m.F[2]) < r) continue;
      if (m.boxes.some(b => polyDist(p, b.door ? doorZone(b) : b.pts) < r + (b.door ? 0 : 6))) continue;
      if (Math.hypot(x, z) < 70) continue; // not right in front of the camera
      const base = this.project({ x, y: 0, z }), top = this.project({ x, y: H, z });
      if (!base || !top || base.x < st.W * 0.04 || base.x > st.W * 0.96 || base.y > st.H * 1.02 || top.y < -st.H * 0.05) continue;
      const near = wd.filter(o => o.d < r + 14);
      let score = near.length >= 2 ? 3 : near.length === 1 ? 1.6 : 0;
      score -= Math.min(...wd.map(o => o.d), 999) / 120;
      if (outlets.some(o => Math.hypot(o.x - x, o.z - z) < 84)) score += 0.8;
      if (windows.some(wl => { const P = this.floorPt((wl.box[0] + wl.box[2]) / 2, wl.floor?.y ?? wl.box[3], this.camH); return P && Math.hypot(P.x - x, P.z - z) < 60; })) score += 0.7;
      score += Math.min(1, Math.hypot(x, z) / 400);
      cands.push({ x, z, score, walls: near.map(o => o.w) });
    }
    cands.sort((a, b) => b.score - a.score);
    const picks = [];
    for (const cnd of cands) { if (picks.length >= 3) break; if (picks.some(p => Math.hypot(p.x - cnd.x, p.z - cnd.z) < 2 * r + 12)) continue; picks.push(cnd); }
    const prev = this.locs || [];
    this.locs = picks.map((p, i) => {
      const walls = [...new Set(p.walls.map(w => nearestWall(Math.atan2(-w.n.x, -w.n.z))))].slice(0, 2);
      const label = 'ABC'[i], old = prev.find(o => o.label === label);
      return { id: label, label, x: p.x, z: p.z, r, height: H, walls, kind: walls.length === 2 ? 'corner' : walls.length ? 'wall' : 'middle', color: old?.color };
    });
  }

  // ---------------- overlay drawing ----------------
  drawOverlay() {
    const c = $('.ov', this.root); if (!c || !this.st) return;
    const g = c.getContext('2d'), st = this.st, k = st.W / 900; g.clearRect(0, 0, st.W, st.H);
    g.lineWidth = 2 * k;
    // tree outlines (with occlusion)
    for (const L of this.locs || []) if (!st.assigned[L.id]) this.drawOutline(g, L, k);
    if (this.hideMarks) return;
    // horizon
    g.setLineDash([10 * k, 8 * k]); g.strokeStyle = 'rgba(255,227,151,0.8)'; g.beginPath(); g.moveTo(0, st.horizon); g.lineTo(st.W, st.horizon); g.stroke(); g.setLineDash([]);
    label(g, 'horizon (eye level) · drag', 8 * k, st.horizon - 6 * k, k, '#ffe397');
    // floor quad
    g.strokeStyle = '#6fe3ff'; g.fillStyle = 'rgba(111,227,255,0.08)'; g.beginPath(); st.floor.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.fill(); g.stroke();
    st.floor.forEach((p, i) => handle(g, p, k, '#6fe3ff', ['near L', 'near R', 'far R', 'far L'][i]));
    if (st.ceiling) { g.strokeStyle = '#ff9df0'; g.setLineDash([6 * k, 6 * k]); g.beginPath(); g.moveTo(st.floor[3].x, st.floor[3].y); g.lineTo(st.ceiling.x, st.ceiling.y); g.stroke(); g.setLineDash([]); handle(g, st.ceiling, k, '#ff9df0', 'ceiling'); }
    // landmarks
    for (const l of st.landmarks) {
      const L = LANDMARKS[l.type], [x0, y0, x1, y1] = l.box, on = this.sel?.lm === l;
      g.strokeStyle = L.color; g.lineWidth = (on ? 3.5 : 2) * k; g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.lineWidth = 2 * k;
      const txt = `${L.label}${l.est ? ` → cam ${l.est.h.toFixed(0)}″` : ''}${l.auto ? ' (auto)' : ''}`;
      label(g, txt, x0 + 3 * k, y0 - 5 * k, k, L.color);
      handle(g, { x: x0, y: y0 }, k * 0.8, L.color); handle(g, { x: x1, y: y1 }, k * 0.8, L.color);
      if (L.kind === 'elev' || L.floorHandle || l.floor) { const f = l.floor || { x: (x0 + x1) / 2, y: y1 }; g.setLineDash([4 * k, 4 * k]); g.beginPath(); g.moveTo((x0 + x1) / 2, (y0 + y1) / 2); g.lineTo(f.x, f.y); g.stroke(); g.setLineDash([]); handle(g, f, k * 0.9, L.color, 'floor'); }
    }
    // currency
    const cu = st.currency;
    if (cu?.pts?.length) { g.strokeStyle = '#7dff8a'; g.lineWidth = 2.5 * k; g.beginPath(); cu.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); if (cu.pts.length > 2) g.closePath(); g.stroke(); cu.pts.forEach(p => handle(g, p, k * 0.8, '#7dff8a')); label(g, '$ ' + (CURRENCY.bills.concat(CURRENCY.coins).find(x => x.id === cu.denom)?.label || 'currency'), cu.pts[0].x, cu.pts[0].y - 8 * k, k, '#7dff8a'); }
  }
  drawOutline(g, L, k) {
    const st = this.st, pts = [], ring = 28;
    for (let i = 0; i < ring; i++) { const a = i / ring * Math.PI * 2; for (const y of [3, L.height * 0.08]) { const p = this.project({ x: L.x + Math.sin(a) * L.r * (y < 5 ? 1.05 : 1), y, z: L.z + Math.cos(a) * L.r }); if (p) pts.push(p); } }
    const apex = this.project({ x: L.x, y: L.height, z: L.z }); if (!apex) return; pts.push(apex);
    const hull = convexHull(pts); if (hull.length < 3) return;
    // pick white or pine green, whichever contrasts more with what's under the outline
    if (!L.color) L.color = pickContrast(this.imageData, hull);
    const off = this.off || (this.off = document.createElement('canvas')); off.width = st.W; off.height = st.H;
    const o = off.getContext('2d'); o.clearRect(0, 0, st.W, st.H); o.lineJoin = 'round';
    o.strokeStyle = L.color; o.lineWidth = 4.5 * k; o.shadowColor = L.color === '#ffffff' ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.45)'; o.shadowBlur = 4 * k;
    o.beginPath(); hull.forEach((p, i) => i ? o.lineTo(p.x, p.y) : o.moveTo(p.x, p.y)); o.closePath(); o.stroke();
    o.fillStyle = L.color === '#ffffff' ? 'rgba(255,255,255,0.10)' : 'rgba(30,107,53,0.16)'; o.fill();
    // base ellipse on the floor
    o.setLineDash([8 * k, 6 * k]); o.lineWidth = 2.5 * k; o.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, p = this.project({ x: L.x + Math.sin(a) * L.r, y: 0.5, z: L.z + Math.cos(a) * L.r }); if (p) i ? o.lineTo(p.x, p.y) : o.moveTo(p.x, p.y); }
    o.stroke(); o.setLineDash([]); o.shadowBlur = 0;
    o.font = `bold ${Math.round(30 * k)}px system-ui,sans-serif`; o.fillStyle = L.color; o.textAlign = 'center'; o.fillText(L.label, apex.x, apex.y - 10 * k);
    // occlusion: cut out furniture that stands in front of the tree, using a refined mask
    const depthTree = -L.z - L.r * 0.4;
    o.globalCompositeOperation = 'destination-out';
    for (const l of st.landmarks) {
      const D = LANDMARKS[l.type]; if (!D.occl || !l.est) continue;
      const P = this.floorPt((l.box[0] + l.box[2]) / 2, l.box[3], this.camH); if (!P || -P.z >= depthTree) continue;
      const key = l.id + l.box.map(Math.round).join(','); let m = this.masks.get(key);
      if (!m) { m = refineMask(this.imageData, l.box); this.masks.set(key, m); }
      o.drawImage(m.canvas, m.x, m.y);
    }
    o.globalCompositeOperation = 'source-over';
    g.drawImage(off, 0, 0);
  }

  // ---------------- pointer editing ----------------
  toImg(e) { const c = $('.ov', this.root), r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.st.W / r.width, y: (e.clientY - r.top) * this.st.H / r.height }; }
  hit(p) {
    const st = this.st, R = st.W / 900 * 16;
    const near = q => q && Math.hypot(q.x - p.x, q.y - p.y) < R;
    if (st.currency?.pts) for (let i = 0; i < st.currency.pts.length; i++) if (near(st.currency.pts[i])) return { cur: i };
    for (const l of st.landmarks) {
      const [x0, y0, x1, y1] = l.box, L = LANDMARKS[l.type];
      if (near({ x: x0, y: y0 })) return { lm: l, corner: 0 }; if (near({ x: x1, y: y1 })) return { lm: l, corner: 1 };
      if ((L.kind === 'elev' || L.floorHandle || l.floor) && near(l.floor || { x: (x0 + x1) / 2, y: y1 })) return { lm: l, floorH: true };
    }
    for (let i = 0; i < 4; i++) if (near(st.floor[i])) return { floor: i };
    if (st.ceiling && near(st.ceiling)) return { ceiling: true };
    for (const L of this.locs || []) { const b = this.project({ x: L.x, y: L.height * 0.4, z: L.z }), t = this.project({ x: L.x, y: L.height, z: L.z }), f = this.project({ x: L.x + L.r, y: 0, z: L.z }); if (b && t && f && Math.abs(p.x - b.x) < Math.abs(f.x - b.x) + R && p.y > t.y && p.y < this.project({ x: L.x, y: 0, z: L.z }).y) return { loc: L }; }
    for (const l of [...st.landmarks].reverse()) { const [x0, y0, x1, y1] = l.box; if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) return { lm: l, move: true, start: { ...p }, box0: [...l.box] }; }
    if (Math.abs(p.y - st.horizon) < R * 0.8) return { horizon: true };
    return null;
  }
  pdown(e) {
    if (!this.st) return; const p = this.toImg(e); $('.ov', this.root).setPointerCapture(e.pointerId);
    if (this.mode?.kind === 'add') { const lm = { id: uid(), type: this.mode.type, box: [p.x, p.y, p.x + 2, p.y + 2], floor: null }; this.st.landmarks.push(lm); this.drag = { lm, corner: 1, creating: true }; this.sel = { lm }; return; }
    if (this.mode?.kind === 'bill') { const w = this.st.W * 0.07, hh = w * 0.3; this.st.currency = { kind: 'bill', denom: this.mode.denom, pts: [{ x: p.x - w, y: p.y - hh }, { x: p.x + w, y: p.y - hh }, { x: p.x + w, y: p.y + hh }, { x: p.x - w, y: p.y + hh }] }; this.mode = null; this.solve(); this.renderPanel(); toast('Drag the four green corners onto the corners of the bill'); return; }
    if (this.mode?.kind === 'coin') { const w = this.st.W * 0.012; this.st.currency = { kind: 'coin', denom: this.mode.denom, pts: [{ x: p.x - w, y: p.y }, { x: p.x + w, y: p.y }] }; this.mode = null; this.solve(); this.renderPanel(); toast('Drag the two green dots to the left and right edges of the coin'); return; }
    if (this.mode?.kind === 'ceiling') { this.st.ceiling = p; this.mode = null; this.solve(); this.renderPanel(); return; }
    this.drag = this.hit(p); this.sel = this.drag?.lm ? { lm: this.drag.lm } : null;
    if (this.drag?.loc) { const L = this.drag.loc; this.drag = null; this.chooseForLocation(L); }
    this.drawOverlay();
  }
  pmove(e) {
    if (!this.st) return; const p = this.toImg(e), d = this.drag;
    if (!d) { const hv = this.hit(p); $('.ov', this.root).style.cursor = this.mode ? 'crosshair' : hv?.loc ? 'pointer' : hv?.move ? 'move' : hv ? 'grab' : 'default'; return; }
    const st = this.st;
    if (d.floor != null) Object.assign(st.floor[d.floor], p);
    else if (d.ceiling) st.ceiling = p;
    else if (d.horizon) st.horizon = Math.max(2, Math.min(st.H - 2, p.y));
    else if (d.cur != null) Object.assign(st.currency.pts[d.cur], p);
    else if (d.lm) {
      const b = d.lm.box;
      if (d.move) { const dx = p.x - d.start.x, dy = p.y - d.start.y; d.lm.box = [d.box0[0] + dx, d.box0[1] + dy, d.box0[2] + dx, d.box0[3] + dy]; }
      else if (d.floorH) d.lm.floor = p;
      else if (d.corner === 0) { b[0] = p.x; b[1] = p.y; } else { b[2] = p.x; b[3] = p.y; }
      d.lm.auto = false;
    }
    this.solveSoon();
  }
  pup() {
    const d = this.drag; this.drag = null;
    if (d?.lm) { const b = d.lm.box; d.lm.box = [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])]; if (d.creating) { this.mode = null; if (b[2] - b[0] < 4 && b[3] - b[1] < 4) { const s = this.st.W * 0.05; d.lm.box = [b[0] - s / 2, b[1] - s, b[0] + s / 2, b[1] + s]; } const L = LANDMARKS[d.lm.type]; if (L.kind === 'elev' || L.floorHandle) { const bx = d.lm.box; d.lm.floor = { x: (bx[0] + bx[2]) / 2, y: Math.min(this.st.H - 2, bx[3] + (L.kind === 'elev' ? this.st.H * 0.25 : this.st.H * 0.3)) }; toast('Drag the dashed "floor" handle to the floor directly below it'); } } }
    if (d) { this.solve(); this.renderPanel(); }
  }
  solveSoon() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.solve(); }); }
  removeLm(id) { this.st.landmarks = this.st.landmarks.filter(l => l.id !== id); this.sel = null; this.solve(); this.renderPanel(); }

  // ---------------- currency flow ----------------
  async askCurrency() {
    const opts = [...CURRENCY.bills.map(b => ({ value: b.id, label: b.label })), ...CURRENCY.coins.map(c => ({ value: c.id, label: c.label }))];
    const body = h('div', {}, h('p', {}, 'Lay a bill or coin flat on the floor somewhere in view, ideally near where the tree might go, then retake the photo from the same spot. Your marks are kept.'),
      h('p', { class: 'muted' }, 'Every US bill is the same size (6.14 × 2.61 in), but tell us which one anyway; coins differ.'),
      h('label', { class: 'row' }, 'What did you place? ', select(opts, 'b1', () => { }, { name: 'denom' })));
    const v = await ask({ title: 'Add US currency for scale', body, buttons: [{ label: 'Cancel', value: null }, { label: '📷 Retake photo', value: b => ({ denom: $('[name=denom]', b).value, retake: true }) }, { label: "It's already in the photo", primary: true, value: b => ({ denom: $('[name=denom]', b).value }) }] });
    if (!v) return;
    this.pendingDenom = v.denom;
    const kind = v.denom[0] === 'b' ? 'bill' : 'coin';
    if (v.retake) { const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', 'data-in': 'photo', 'data-keep': '1', hidden: true }); this.root.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000); }
    this.mode = { kind, denom: v.denom }; this.renderPanel();
    toast(kind === 'bill' ? 'Tap the middle of the bill in the photo' : 'Tap the coin in the photo');
  }

  // ---------------- tree placement ----------------
  async chooseForLocation(L) {
    const saved = designs.list();
    const body = h('div', {}, h('p', {}, `Spot ${L.label}: ${L.kind === 'corner' ? 'in a corner' : L.kind === 'wall' ? 'against a wall' : 'out in the room'}, room for a tree up to ${fmtLen(L.height)} tall and ${fmtLen(L.r * 2)} wide.`),
      saved.length ? h('label', { class: 'row' }, 'Saved idea ', select(saved.map(s => ({ value: s.id, label: s.name || 'Untitled' })), saved[0].id, () => { }, { name: 'saved' })) : h('p', { class: 'muted' }, 'No saved tree ideas yet.'));
    const v = await ask({ title: `Tree for spot ${L.label}`, body, buttons: [{ label: 'Cancel', value: null }, { label: '🌲 Bare tree', value: 'bare' }, { label: '🎲 Random tree', value: 'random' }, ...(saved.length ? [{ label: 'Use saved idea', value: b => 'saved:' + $('[name=saved]', b).value }] : []), ...(this.st.assigned[L.id] ? [{ label: 'Remove tree', value: 'remove', danger: true }] : [])] });
    if (!v) return;
    if (v === 'remove') { delete this.st.assigned[L.id]; this.solve(); return; }
    let d;
    if (v === 'bare') d = newDesign({ walls: L.walls, height: L.height, name: `Spot ${L.label}` });
    else if (v === 'random') d = randomDesign({ walls: L.walls, maxHeight: L.height });
    else { const s = designs.get(v.slice(6)); d = { ...JSON.parse(JSON.stringify(s)), walls: L.walls }; }
    this.st.assigned[L.id] = d; this.save();
    this.app.builder.setDesign(d, { locId: L.id, label: L.label });
    this.app.show('builder');
    toast(L.walls.length ? `Walls guessed from your room: ${L.walls.join(' + ')}` : 'Open floor: no walls near this spot');
  }
  placeDesign(locId, design) { if (!this.st) return; this.st.assigned[locId] = design; this.save(); this.app.show('room'); this.solve(); this.renderPanel(); }

  // ---------------- 3D: trees rendered into the photo ----------------
  init3d() {
    if (this.gl) return;
    const c = $('.layers .gl', this.root);
    this.gl = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.gl.setPixelRatio(Math.min(2, devicePixelRatio)); this.gl.outputColorSpace = THREE.SRGBColorSpace; this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.environment = new THREE.PMREMGenerator(this.gl).fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.5;
    this.scene.add(new THREE.HemisphereLight('#fff4e0', '#3a2a1a', 1.2)); const k = new THREE.DirectionalLight('#fff', 1.3); k.position.set(50, 200, 80); this.scene.add(k);
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
    this.treeGroup = new THREE.Group(); this.scene.add(this.treeGroup);
    this.occl = new THREE.Group(); this.scene.add(this.occl);
    const tick = t => { requestAnimationFrame(tick); if (this.app.tab !== 'room' || !this.builtTrees?.length) return; this.builtTrees.forEach(b => b.update(t / 1000)); this.gl.render(this.scene, this.camera); };
    requestAnimationFrame(tick);
    // model preview
    const mc = $('.model3d', this.root);
    this.mr = new THREE.WebGLRenderer({ canvas: mc, antialias: true }); this.mr.setPixelRatio(Math.min(2, devicePixelRatio));
    this.ms = new THREE.Scene(); this.ms.background = new THREE.Color('#15130f');
    this.ms.add(new THREE.HemisphereLight('#fff', '#334', 1.4)); const dl = new THREE.DirectionalLight('#fff', 1); dl.position.set(100, 300, 200); this.ms.add(dl);
    this.mc = new THREE.PerspectiveCamera(45, 1, 1, 5000); this.mc.position.set(0, 300, 180);
    this.orbit = new OrbitControls(this.mc, mc); this.orbit.enableDamping = true; this.orbit.addEventListener('start', () => { this.userOrbit = true; });
    const mt = () => { requestAnimationFrame(mt); if (this.app.tab !== 'room') return; this.orbit.update(); const w = mc.clientWidth, hh = mc.clientHeight; if (w && (mc.width !== Math.round(w * this.mr.getPixelRatio()))) { this.mr.setSize(w, hh, false); this.mc.aspect = w / hh; this.mc.updateProjectionMatrix(); } this.mr.render(this.ms, this.mc); };
    requestAnimationFrame(mt);
  }
  renderModel3d() {
    if (!this.ms || !this.model) return;
    if (this.mgroup) this.ms.remove(this.mgroup);
    const g = this.mgroup = new THREE.Group(), m = this.model;
    const pos = []; for (const t of m.tris) for (const v of t) pos.push(v.x, v.y, v.z);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cbbfa9', roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: 1 })));
    g.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: '#4a4237' })));
    for (const L of this.locs || []) { const cone = new THREE.Mesh(new THREE.ConeGeometry(L.r, L.height, 12), new THREE.MeshStandardMaterial({ color: this.st.assigned[L.id] ? '#3fa35a' : '#2f6b3f', transparent: true, opacity: 0.8 })); cone.position.set(L.x, L.height / 2, L.z); g.add(cone); }
    const cam = new THREE.Mesh(new THREE.ConeGeometry(6, 14, 4), new THREE.MeshBasicMaterial({ color: '#ffe397' })); cam.rotation.x = Math.PI / 2; cam.position.set(0, this.camH, 0); g.add(cam);
    this.ms.add(g);
    const cz = (Math.min(...m.F.map(p => p.z)) + Math.max(...m.F.map(p => p.z))) / 2;
    if (!this.userOrbit) { this.orbit.target.set(0, 30, cz); this.mc.position.set(-m.width * 0.35, Math.max(m.width, m.depth) * 0.9, cz + m.depth * 1.3 + 60); }
    $('.tris', this.root).textContent = `${m.tris.length} / 500 triangles`;
  }
  renderTrees() {
    if (!this.gl || !this.st) return;
    this.builtTrees?.forEach(b => { this.treeGroup.remove(b.root); b.dispose(); }); this.builtTrees = [];
    this.occl.clear();
    const assigned = Object.entries(this.st.assigned || {});
    $('.layers .gl', this.root).style.visibility = assigned.length ? 'visible' : 'hidden';
    if (!assigned.length) return;
    const c = this.cam(), cnv = $('.layers .gl', this.root);
    this.camera.fov = 2 * Math.atan((this.st.H / 2) / c.f) / DEG; this.camera.aspect = this.st.W / this.st.H; this.camera.near = 5; this.camera.updateProjectionMatrix();
    this.camera.position.set(0, this.camH, 0); this.camera.rotation.set(-c.th, 0, 0, 'YXZ');
    for (const [id, d] of assigned) {
      const L = (this.locs || []).find(l => l.id === id); if (!L) continue;
      const b = buildDesign(d, this.app.builder.ctx); b.root.position.set(L.x, 0, L.z); this.treeGroup.add(b.root); this.builtTrees.push(b);
    }
    // furniture in front hides the tree: depth-only boxes
    const dm = new THREE.MeshBasicMaterial({ colorWrite: false });
    for (const b of this.model?.boxes || []) { if (!LANDMARKS[b.type].occl) continue; const pos = []; const v = (p, y) => pos.push(p.x, y, p.z); const [A, B, C, D] = b.pts; const quads = [[A, B, C, D, 'top'], [A, B], [B, C], [C, D], [D, A]];
      for (const q of quads) { if (q.length === 5) { v(A, b.H); v(B, b.H); v(C, b.H); v(A, b.H); v(C, b.H); v(D, b.H); } else { const [p, r] = q; v(p, 0); v(r, 0); v(r, b.H); v(p, 0); v(r, b.H); v(p, b.H); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); const m = new THREE.Mesh(geo, dm); m.material.side = THREE.DoubleSide; m.renderOrder = -1; this.occl.add(m); }
    this.gl.setSize(cnv.parentElement.clientWidth, cnv.parentElement.clientHeight, false);
    this.gl.render(this.scene, this.camera);
  }

  // ---------------- side panel ----------------
  renderPanel() {
    const p = $('.r-panel', this.root); p.innerHTML = '';
    if (!this.st) { p.append(h('div', { class: 'info' }, h('h2', {}, '🏠 Room Importer'), h('p', {}, 'Take or choose a photo of the room. The planner finds furniture, lets you mark doors, doorknobs, switches, lamps and bulbs, works out the room\'s real size from them, builds a simple 3D model and suggests where a tree fits.'))); return; }
    const st = this.st, sec = (t, ...k) => h('div', { class: 'sec flat' }, h('h4', {}, t), ...k);
    const unc = this.unc;
    p.append(sec('1 · Photo',
      h('div', { class: 'field' }, h('label', { class: 'btn small' }, '📷 New photo', h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'data-in': 'photo' })),
        h('label', { class: 'btn small' }, '🔁 Retake, keep marks', h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'data-in': 'photo', 'data-keep': '1' })),
        h('button', { class: 'btn small', onclick: () => { this.hideMarks = !this.hideMarks; this.drawOverlay(); this.renderPanel(); } }, this.hideMarks ? 'Show marks' : 'Hide marks')),
      h('div', { class: 'muted' }, st.detect === 'running' ? '⏳ Looking for furniture…' : st.detect === 'unavailable' ? 'Automatic furniture detection could not load; mark things by hand.' : st.detect?.startsWith('found') ? `Auto-detect ${st.detect} piece(s) of furniture. Fix any boxes that are off.` : '')));
    const lmList = h('div', { class: 'lmlist' }, st.landmarks.map(l => h('div', { class: 'lm' + (this.sel?.lm === l ? ' on' : '') },
      select(Object.entries(LANDMARKS).map(([k, v]) => ({ value: k, label: v.label })), l.type, v => { l.type = v; l.auto = false; this.solve(); this.renderPanel(); }),
      h('span', { class: 'muted' }, l.est ? `±${(l.est.sd).toFixed(1)}″` : 'not measured'),
      h('button', { class: 'btn small danger', 'aria-label': 'Remove', onclick: () => this.removeLm(l.id) }, '✕'))));
    const addSel = select([{ value: '', label: '+ Add landmark…' }, ...Object.entries(LANDMARKS).map(([k, v]) => ({ value: k, label: v.label }))], '', v => { if (!v) return; this.mode = { kind: 'add', type: v }; toast(`Drag a box around the ${LANDMARKS[v].label.toLowerCase()} in the photo`); this.renderPanel(); });
    p.append(sec('2 · Landmarks', h('p', { class: 'muted' }, 'Known sizes set the scale. Boxes should go from the floor (or the thing\'s bottom) to its top. Doorknobs, switches and outlets: box the item and drag its "floor" handle straight down to the floor.'), lmList, addSel));
    p.append(sec('3 · Floor, horizon & walls', h('p', { class: 'muted' }, 'Drag the blue corners to where the floor meets the walls. The yellow horizon is eye level; level the phone for best results.'),
      h('div', { class: 'field' }, h('button', { class: 'btn small', onclick: () => { this.autoHorizon(false); this.solve(); } }, 'Horizon from floor edges'), h('button', { class: 'btn small', onclick: () => { this.mode = { kind: 'ceiling' }; toast('Tap where the far-left wall meets the ceiling'); } }, st.ceiling ? 'Re-mark ceiling' : 'Mark ceiling')),
      h('div', { class: 'checks' }, ['left', 'back', 'right'].map(w => h('label', {}, h('input', { type: 'checkbox', checked: this.hasWall(w), onchange: e => { st.sideWalls[w] = e.target.checked; this.solve(); this.renderPanel(); } }), ` ${w} wall`))),
      h('label', { class: 'row' }, 'Lens (horizontal field of view) ', h('input', { type: 'range', min: 40, max: 110, value: st.hfov, oninput: e => { st.hfov = +e.target.value; this.solve(); }, onchange: () => this.renderPanel() }), ` ${st.hfov}°`)));
    const m = this.model;
    const scale = h('div', { class: 'scale' + (unc > UNC_LIMIT ? ' warn' : ' ok') },
      h('div', {}, `Camera height ${this.camH.toFixed(0)}″ ±${this.camSd.toFixed(1)}″ from ${this.ests.length ? this.ests.map(e => e.name).join(', ') : 'a guess (nothing measured yet)'}`),
      m ? h('div', {}, `Visible floor ≈ ${fmtLen(m.width)} wide × ${fmtLen(m.depth)} deep · ceiling ${fmtLen(m.ceil)}${st.ceiling ? '' : ' (assumed)'}`) : null,
      h('div', { class: 'big' }, unc > UNC_LIMIT ? `Uncertain by about ±${unc.toFixed(0)}″` : `Good to about ±${Math.max(0.5, unc).toFixed(1)}″`));
    const curBtns = h('div', { class: 'field' });
    if (unc > UNC_LIMIT || st.currency) {
      if (!st.currency) scale.append(h('p', {}, '💵 That\'s more than a few inches. Place US currency on the floor in view so the planner can measure it.'));
      curBtns.append(h('button', { class: 'btn ' + (st.currency ? 'small' : 'primary'), onclick: () => this.askCurrency() }, st.currency ? 'Change currency' : '💵 Add currency for scale'));
      if (st.currency) curBtns.append(h('button', { class: 'btn small danger', onclick: () => { st.currency = null; this.solve(); this.renderPanel(); } }, 'Remove currency'));
      if (this.mode?.kind === 'bill' || this.mode?.kind === 'coin') curBtns.append(h('span', { class: 'muted' }, ` Tap the ${this.mode.kind} in the photo.`));
    }
    p.append(sec('4 · Scale', scale, curBtns));
    const locs = this.locs || [];
    p.append(sec('5 · Tree spots',
      locs.length ? h('p', { class: 'muted' }, 'Tap a spot (in the list or on the photo) to put a tree there.') : h('p', { class: 'muted' }, 'No spot fits yet. Check the floor corners and walls, or the photo may not show enough floor.'),
      ...locs.map(L => h('button', { class: 'spot', onclick: () => this.chooseForLocation(L) }, h('b', { style: { color: L.color === '#ffffff' ? '#fff' : '#5fd17e' } }, L.label), ` ${L.kind === 'corner' ? 'Corner' : L.kind === 'wall' ? 'Against a wall' : 'Open floor'} · up to ${fmtLen(L.height)} · ${st.assigned[L.id] ? '🎄 ' + (st.assigned[L.id].name || 'tree placed') : 'empty'}`)),
      Object.keys(st.assigned).length ? h('button', { class: 'btn small', onclick: () => this.snapshotPng() }, '⬇ Save picture') : null));
  }
  snapshotPng() {
    const c = document.createElement('canvas'); c.width = this.st.W; c.height = this.st.H; const g = c.getContext('2d');
    g.drawImage(this.img, 0, 0, c.width, c.height); this.gl.render(this.scene, this.camera); g.drawImage($('.layers .gl', this.root), 0, 0, c.width, c.height);
    const a = h('a', { href: c.toDataURL('image/jpeg', 0.92), download: 'tree-in-room.jpg' }); a.click();
  }
}

// ---------------- helpers ----------------
function nearestWall(az) { let best = 'back', bd = 9; for (const [w, a] of Object.entries(WALL_AZ)) { const d = Math.abs(wrapPi(az - a)); if (d < bd) { bd = d; best = w; } } return best; }
function doorZone(b) { // 40" of clearance in front of a door
  const [A, B] = b.pts, dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1; let nx = -dz / L, nz = dx / L; if (nx * -A.x + nz * -A.z < 0) { nx = -nx; nz = -nz; }
  return [A, B, { x: B.x + nx * 40, z: B.z + nz * 40 }, { x: A.x + nx * 40, z: A.z + nz * 40 }];
}
function insidePoly(p, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; }
function iou(a, b) { const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[2], b[2]), y1 = Math.min(a[3], b[3]); const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0); const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; }
function convexHull(pts) {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const lumin = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
function pickContrast(img, hull) {
  const W = lumin(255, 255, 255), G = lumin(30, 107, 53); let sw = 0, sg = 0, n = 0;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; for (let t = 0; t < 1; t += 0.1) { const x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t); if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue; const k = (y * img.width + x) * 4, L = lumin(img.data[k], img.data[k + 1], img.data[k + 2]); sw += contrast(W, L); sg += contrast(G, L); n++; } }
  return !n || sw >= sg ? '#ffffff' : '#1e6b35';
}
function handle(g, p, k, col, txt) { g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 1.5 * k; g.beginPath(); g.arc(p.x, p.y, 7 * k, 0, 7); g.fill(); g.stroke(); if (txt) label(g, txt, p.x + 10 * k, p.y + 4 * k, k, col); }
function label(g, t, x, y, k, col) { g.font = `${Math.round(14 * k)}px system-ui,sans-serif`; g.textAlign = 'left'; const w = g.measureText(t).width; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 3 * k, y - 13 * k, w + 6 * k, 17 * k); g.fillStyle = col; g.fillText(t, x, y); }
const scripts = {};
function loadScript(src) { return scripts[src] || (scripts[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); })); }

// A rendered sample room (so the tool can be tried without a photo). It is drawn through a real
// pinhole camera (54" high, level, 69° lens) so every size in it is consistent: an 80" door with
// its knob at 36", a 34" couch, a switch, an outlet, a floor lamp and a $1 bill on the floor.
// It returns the marks a user would place, minus the bill (left for the currency flow).
function sampleRoom() {
  const W = 1400, H = 1050, f = (W / 2) / Math.tan(34.5 * DEG), h = 54, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const P = (x, y, z) => [W / 2 + f * x / -z, H / 2 - f * (y - h) / -z];
  const poly = (pts, fill, stroke) => { g.beginPath(); pts.forEach(([x, y, z], i) => { const [u, v] = P(x, y, z); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); } };
  const bbox = pts => { const q = pts.map(p => P(...p)); return [Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))]; };
  const L = -80, R = 110, B = -220, N = -30, C = 96;
  g.fillStyle = '#f1ede4'; g.fillRect(0, 0, W, H);
  poly([[L, C, N], [R, C, N], [R, C, B], [L, C, B]], '#f3efe7');
  poly([[L, 0, B], [R, 0, B], [R, C, B], [L, C, B]], '#d9cdb5');
  poly([[L, 0, B], [L, C, B], [L, C, N], [L, 0, N]], '#c6b99f');
  poly([[R, 0, B], [R, C, B], [R, C, N], [R, 0, N]], '#cfc2a8');
  poly([[L, 0, N], [R, 0, N], [R, 0, B], [L, 0, B]], '#7c5638');
  g.save(); g.beginPath(); [[L, 0, N], [R, 0, N], [R, 0, B], [L, 0, B]].forEach((p, i) => { const [u, v] = P(...p); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.clip();
  g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 2; for (let x = L; x <= R; x += 5) { g.beginPath(); g.moveTo(...P(x, 0, B)); g.lineTo(...P(x, 0, N)); g.stroke(); } g.restore();
  for (const [a, b] of [[[L, 0, B], [R, 0, B]], [[L, 0, B], [L, 0, N]], [[R, 0, B], [R, 0, N]]]) poly([a, b, [b[0], 4, b[2]], [a[0], 4, a[2]]], '#f6f2ea');
  // window, door, knob, switch, outlet on the back wall
  poly([[-62, 36, B], [-18, 36, B], [-18, 84, B], [-62, 84, B]], '#9ec9e8', '#f7f3ea');
  g.strokeStyle = '#f7f3ea'; g.lineWidth = 6; g.beginPath(); g.moveTo(...P(-40, 36, B)); g.lineTo(...P(-40, 84, B)); g.moveTo(...P(-62, 60, B)); g.lineTo(...P(-18, 60, B)); g.stroke();
  poly([[20, 0, B], [56, 0, B], [56, 80, B], [20, 80, B]], '#f8f5ee', '#bdb3a0');
  poly([[24, 44, B], [52, 44, B], [52, 76, B], [24, 76, B]], null, '#cfc6b4'); poly([[24, 6, B], [52, 6, B], [52, 38, B], [24, 38, B]], null, '#cfc6b4');
  const [kx, ky] = P(52, 36, B); g.fillStyle = '#c9a548'; g.beginPath(); g.arc(kx, ky, 6, 0, 7); g.fill();
  poly([[64, 46, B], [67, 46, B], [67, 51, B], [64, 51, B]], '#fbfbf7', '#bbb');
  poly([[-41, 12.5, B], [-38.6, 12.5, B], [-38.6, 16.5, B], [-41, 16.5, B]], '#fbfbf7', '#bbb');
  // floor lamp in the back-right corner
  poly([[86, 0, -200], [96, 0, -200], [96, 1.5, -200], [86, 1.5, -200]], '#2b2b2b');
  poly([[90.5, 0, -200], [91.5, 0, -200], [91.5, 52, -200], [90.5, 52, -200]], '#333');
  poly([[84, 52, -200], [98, 52, -200], [95, 62, -200], [87, 62, -200]], '#f2e3b8');
  // $1 bill on the floor
  poly([[0, 0.05, -136], [6.14, 0.05, -136], [6.14, 0.05, -133.39], [0, 0.05, -133.39]], '#c3cdb2', '#76845f');
  // couch: seat, back, arms
  const cx0 = -60, cx1 = 20, cz0 = -150, cz1 = -116;
  poly([[cx0, 20, cz1], [cx1, 20, cz1], [cx1, 20, cz0], [cx0, 20, cz0]], '#56708d');
  poly([[cx0, 20, cz0 + 9], [cx1, 20, cz0 + 9], [cx1, 34, cz0 + 9], [cx0, 34, cz0 + 9]], '#4a627d');
  poly([[cx0, 34, cz0 + 9], [cx1, 34, cz0 + 9], [cx1, 34, cz0], [cx0, 34, cz0]], '#5a7594');
  poly([[cx0, 0, cz1], [cx1, 0, cz1], [cx1, 20, cz1], [cx0, 20, cz1]], '#41566e');
  for (const ax of [[cx0, cx0 + 7], [cx1 - 7, cx1]]) { poly([[ax[0], 26, cz1], [ax[1], 26, cz1], [ax[1], 26, cz0], [ax[0], 26, cz0]], '#4f6782'); poly([[ax[0], 0, cz1], [ax[1], 0, cz1], [ax[1], 26, cz1], [ax[0], 26, cz1]], '#3a4c61'); }
  const fl = (x, z) => { const [u, v] = P(x, 0, z); return { x: u, y: v }; };
  const nearZ = -(f * h / (H / 2)) * 1.0; // floor depth at the bottom edge of the photo
  const leftZ = -(f * -L / (W / 2)), rightZ = -(f * R / (W / 2));
  const marks = {
    floor: [fl(L, Math.min(leftZ, nearZ)), fl(R, Math.min(rightZ, nearZ)), fl(R, B), fl(L, B)],
    horizon: H / 2,
    landmarks: [
      { id: uid(), type: 'door', box: bbox([[20, 0, B], [56, 80, B]]), floor: null },
      { id: uid(), type: 'doorknob', box: [kx - 7, ky - 7, kx + 7, ky + 7], floor: fl(52, B) },
      { id: uid(), type: 'switch', box: bbox([[64, 46, B], [67, 51, B]]), floor: fl(65.5, B) },
      { id: uid(), type: 'couch', box: bbox([[cx0, 0, cz1], [cx1, 0, cz1], [cx0, 34, cz0], [cx1, 34, cz0]]), floor: null },
    ],
  };
  marks.floor = marks.floor.map(p => ({ x: Math.max(0, Math.min(W, p.x)), y: Math.min(H, p.y) }));
  return { src: c.toDataURL('image/jpeg', 0.92), marks };
}
