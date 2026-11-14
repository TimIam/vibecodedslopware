// Ornament Designer: pick or sculpt a shape, layer patterns and words, paint straight onto the 3D
// ornament, choose a cap and save it to the Tree Builder's Custom ornaments.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SHAPES, shapeById, buildDesigned, makeXs, spacedProfile, profileWidth, isFlat, TEX_W, TEX_H, FINISHES, CAP_COLORS } from './designmodel.js';
import { PALETTE } from './data.js';
import { rng } from './textures.js';
import { idb, uid, loadCustoms, fileToDataURL, loadImage } from './store.js';
import { $, $$, h, ask, toast, select, swatches, confirmDel, fmtLen } from './ui.js';

const W = TEX_W, H = TEX_H, YEAR = String(new Date().getFullYear());
const clone = o => JSON.parse(JSON.stringify(o));
const FONTS = [['Georgia, serif', 'Classic serif'], ['"Brush Script MT", "Segoe Script", cursive', 'Script'], ['Impact, "Arial Black", sans-serif', 'Bold block'], ['"Segoe UI", system-ui, sans-serif', 'Clean sans'], ['"Courier New", monospace', 'Typewriter']];
const COLORS = ['#c3192b', '#8e0f22', '#d4a640', '#c9ced3', '#1f7a3e', '#16305e', '#2251b8', '#9fd3ff', '#6b2fa8', '#f08ab8', '#ffffff', '#1c1c1c', '#b8683c', '#1d8a8a'];

const LAYERS = {
  gradient: { label: 'Color fade', fields: ['color', 'color2'], d: { color: '#ffffff', color2: '#1f5a36' } },
  band: { label: 'Band', fields: ['color', 'color2', 'y', 'size'], d: { color: '#d4a640', color2: '#ffffff', y: 0.5, size: 0.25 } },
  stripes: { label: 'Stripes across', fields: ['color', 'count'], d: { color: '#ffffff', count: 6 }, range: [2, 20, 1] },
  vstripes: { label: 'Stripes down', fields: ['color', 'count'], d: { color: '#ffffff', count: 8 }, range: [2, 24, 1] },
  spiral: { label: 'Candy spiral', fields: ['color', 'count', 'size'], d: { color: '#ffffff', count: 6, size: 0.5 }, range: [2, 16, 1] },
  zigzag: { label: 'Zigzag', fields: ['color', 'y', 'size', 'count'], d: { color: '#d4a640', y: 0.5, size: 0.3, count: 10 }, range: [4, 30, 1] },
  dots: { label: 'Polka dots', fields: ['color', 'count', 'size'], d: { color: '#ffffff', count: 12, size: 0.4 }, range: [4, 30, 1] },
  snowflakes: { label: 'Snowflakes', fields: ['color', 'count', 'size'], d: { color: '#ffffff', count: 8, size: 0.6 }, range: [3, 20, 1] },
  stars: { label: 'Stars', fields: ['color', 'count', 'size'], d: { color: '#d4a640', count: 8, size: 0.5 }, range: [3, 20, 1] },
  hearts: { label: 'Hearts', fields: ['color', 'count', 'size'], d: { color: '#f08ab8', count: 8, size: 0.5 }, range: [3, 20, 1] },
  glitter: { label: 'Glitter band', fields: ['color', 'y', 'size', 'count'], d: { color: '#ffd86b', y: 0.5, size: 0.3, count: 0.6 }, range: [0.1, 1, 0.05] },
  text: { label: 'Words, name or year', fields: ['text', 'font', 'color', 'color2', 'x', 'y', 'size', 'count'], d: { text: YEAR, font: 0, color: '#ffffff', color2: '#d4a640', x: 0.5, y: 0.5, size: 0.35, count: 1 }, range: [1, 4, 1] },
  image: { label: 'Photo', fields: ['image', 'x', 'y', 'size', 'color'], d: { src: null, x: 0.5, y: 0.5, size: 0.6, frame: true, color: '#d4a640' } },
};
const FIELD_LABEL = { color: 'Color', color2: 'Accent', y: 'Up / down', x: 'Left / right', size: 'Size', count: 'How many' };

const IDEAS = [
  { label: '🍬 Candy cane', r: { shape: 'ball', finish: 'shiny', base: '#ffffff', layers: [{ type: 'spiral', color: '#c3192b', count: 6, size: 0.55 }] } },
  { label: '❄️ Snowy night', r: { shape: 'ball', finish: 'matte', base: '#16305e', layers: [{ type: 'snowflakes', color: '#ffffff', count: 9, size: 0.55 }, { type: 'glitter', color: '#ffffff', y: 0.88, size: 0.22, count: 0.8 }] } },
  { label: '🪞 Mercury finial', r: { shape: 'finial', finish: 'mercury', base: '#c9ced3', layers: [{ type: 'band', color: '#d4a640', color2: '#ffffff', y: 0.38, size: 0.1 }] } },
  { label: '👶 First Christmas', r: { shape: 'ball', finish: 'shiny', base: '#f4b6cb', layers: [{ type: 'stars', color: '#ffffff', count: 10, size: 0.3 }, { type: 'text', text: "Baby's First", font: 1, color: '#ffffff', color2: '#c96f92', y: 0.4, size: 0.2, count: 2 }, { type: 'text', text: 'Christmas ' + YEAR, font: 1, color: '#ffffff', color2: '#c96f92', y: 0.58, size: 0.2, count: 2 }] } },
  { label: '📷 Photo ornament', r: { shape: 'disc', finish: 'satin', base: '#a3121f', layers: [{ type: 'image', src: null, x: 0.5, y: 0.45, size: 0.72, frame: true, color: '#d4a640' }, { type: 'text', text: YEAR, font: 0, color: '#ffffff', color2: '#d4a640', y: 0.9, size: 0.14, count: 1 }], cap: { style: 'classic', color: 'gold' } } },
  { label: '🟢 Retro stripes', r: { shape: 'onion', finish: 'shiny', base: '#1d8a8a', layers: [{ type: 'stripes', color: '#f5f5f2', count: 5 }, { type: 'glitter', color: '#d4a640', y: 0.55, size: 0.12, count: 0.9 }] } },
  { label: '🍪 Gingerbread star', r: { shape: 'star', finish: 'matte', base: '#a8642c', layers: [{ type: 'zigzag', color: '#ffffff', y: 0.55, size: 0.12, count: 14 }, { type: 'dots', color: '#ffffff', count: 8, size: 0.2 }] } },
  { label: '🧦 Name stocking', r: { shape: 'stocking', finish: 'matte', base: '#c3192b', layers: [{ type: 'band', color: '#ffffff', color2: '#ffffff', y: 0.1, size: 0.45 }, { type: 'text', text: 'Name', font: 1, color: '#c3192b', color2: '#ffffff', x: 0.3, y: 0.1, size: 0.16, count: 1 }] } },
];

function newRecipe(over = {}) {
  const shape = shapeById(over.shape || 'ball');
  const r = { shape: shape.id, profile: clone(shape.profile || SHAPES[0].profile), girth: 1, width: shape.width ?? 1, finish: 'shiny', base: '#c3192b', layers: [], cap: { style: 'classic', color: 'gold' }, heightIn: 3.5, ...clone(over) };
  r.layers = (r.layers || []).map(L => ({ ...LAYERS[L.type].d, ...L, id: uid() }));
  return r;
}

export class Designer {
  constructor(root, app) {
    this.app = app; this.root = root;
    this.recipe = newRecipe(IDEAS[0].r); this.name = ''; this.editingId = null;
    this.mode = 'rotate'; this.brush = { color: '#ffffff', size: 14, kind: 'paint', sym: 1 };
    this.tab = 'shape'; this.undoStack = []; this.images = new Map(); this.painted = false;
    const cv = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    this.layerCv = cv(); this.paint = cv(); this.surface = cv();
    this.tex = new THREE.CanvasTexture(this.surface); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.initDom(); this.init3d(); this.rebuild(); this.renderLeft();
  }

  // ---------------- DOM ----------------
  initDom() {
    this.root.innerHTML = `
      <div class="b-left"><div class="ltabs" role="tablist"></div><div class="lbody"></div></div>
      <div class="b-right">
        <div class="b-bar">
          <div class="tools" role="toolbar" aria-label="Designer tools">
            <button class="tool" data-mode="rotate" title="Drag to turn the ornament">🔄 Rotate</button>
            <button class="tool" data-mode="paint" title="Drag on the ornament to paint">🖌 Paint</button>
          </div>
          <div class="grow"></div>
          <button class="btn" data-act="random">🎲 Surprise me</button>
          <button class="btn" data-act="undo" title="Undo (Ctrl+Z)">↶ Undo</button>
          <button class="btn primary" data-act="save">💾 Save</button>
        </div>
        <div class="view3d"><canvas class="gl" aria-label="3D ornament. Drag to turn it, or switch to Paint and drag on it."></canvas>
          <div class="profile"><div class="tdhead">Shape · drag the dots</div><canvas class="pcv" width="220" height="240" aria-label="Ornament profile editor"></canvas></div>
          <div class="hint"></div>
        </div>
      </div>`;
    this.root.addEventListener('click', e => {
      const m = e.target.closest('[data-mode]')?.dataset.mode; if (m) this.setMode(m);
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'random') this.surprise(); if (a === 'undo') this.undo(); if (a === 'save') { this.tab = 'save'; this.renderLeft(); this.save(false); }
    });
    document.addEventListener('keydown', e => { if (this.app.tab !== 'designer') return; if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.closest('input,textarea')) { e.preventDefault(); this.undo(); } });
    this.initProfileEditor();
  }
  setMode(m) {
    this.mode = m; $$('.tool', this.root).forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('.view3d', this.root).classList.toggle('paint', m === 'paint');
    $('.hint', this.root).textContent = m === 'paint' ? 'Drag on the ornament to paint · drag the background to turn it' : 'Drag to turn · scroll to zoom';
    if (this.controls) this.controls.autoRotate = m === 'rotate' && !this.held;
  }

  // ---------------- 3D ----------------
  init3d() {
    const canvas = $('.gl', this.root);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio)); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    const s = this.scene = new THREE.Scene(); this.bg = new THREE.Color('#1c1916'); s.background = this.bg;
    s.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.7;
    s.add(new THREE.HemisphereLight('#fff4e0', '#2a2018', 0.55));
    const key = new THREE.DirectionalLight('#fff1d6', 1.5); key.position.set(2, 3, 4); s.add(key);
    const rim = new THREE.DirectionalLight('#9fc0ff', 0.7); rim.position.set(-3, 1, -3); s.add(rim);
    this.holder = new THREE.Group(); s.add(this.holder);
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.05, 50); this.cam.position.set(0, -0.35, 3.2);
    this.controls = new OrbitControls(this.cam, canvas); this.controls.target.set(0, -0.55, 0); this.controls.enableDamping = true; this.controls.enablePan = false;
    this.controls.minDistance = 1.2; this.controls.maxDistance = 6; this.controls.autoRotateSpeed = 1.2;
    this.controls.addEventListener('start', () => { this.held = true; this.controls.autoRotate = false; });
    this.ray = new THREE.Raycaster();
    // Paint strokes: capture on the parent so a hit on the ornament never reaches OrbitControls.
    const view = $('.view3d', this.root);
    view.addEventListener('pointerdown', e => {
      if (this.mode !== 'paint' || e.target !== canvas) return;
      const hit = this.hitUV(e); if (!hit) return;
      e.stopPropagation(); e.preventDefault(); canvas.setPointerCapture(e.pointerId);
      this.snapshot(); this.stroke = { last: null }; this.dabTo(hit);
    }, true);
    canvas.addEventListener('pointermove', e => { if (!this.stroke) return; const hit = this.hitUV(e); if (hit) this.dabTo(hit); else this.stroke.last = null; });
    const end = () => { if (this.stroke) { this.stroke = null; this.composite(); } };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    new ResizeObserver(() => this.resize()).observe(view);
    const tick = () => { requestAnimationFrame(tick); if (this.app.tab !== 'designer') return; this.controls.update(); this.renderer.render(this.scene, this.cam); };
    requestAnimationFrame(tick);
    this.setMode('rotate');
  }
  resize() { const v = $('.view3d', this.root), w = v.clientWidth, hh = v.clientHeight; if (!w || !hh) return; this.renderer.setSize(w, hh, false); this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); }
  hitUV(e) {
    const r = e.target.getBoundingClientRect(); this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.cam);
    const hit = this.ray.intersectObject(this.holder, true).find(h => h.object.name === 'body' && h.uv);
    return hit ? { x: hit.uv.x * W, y: (1 - hit.uv.y) * H } : null;
  }

  // ---------------- painting ----------------
  dabTo(p) {
    const last = this.stroke.last, step = Math.max(1, this.brush.size * 0.3);
    if (last && Math.abs(p.x - last.x) < W / 2) { const d = Math.hypot(p.x - last.x, p.y - last.y), n = Math.ceil(d / step); for (let i = 1; i <= n; i++) this.dab(last.x + (p.x - last.x) * i / n, last.y + (p.y - last.y) * i / n); }
    else this.dab(p.x, p.y);
    this.stroke.last = p; this.composite();
  }
  dab(x, y) {
    const g = this.paint.getContext('2d'), b = this.brush, rv = b.size, rh = rv * this.xs(y), flat = isFlat(this.recipe);
    const xsList = [];
    if (flat) { xsList.push(x); if (b.sym >= 2) xsList.push(W - x); }
    else for (let k = 0; k < b.sym; k++) xsList.push((x + k * W / b.sym) % W);
    g.save(); g.globalCompositeOperation = b.kind === 'erase' ? 'destination-out' : 'source-over';
    const R = this._dabRng || (this._dabRng = rng(77));
    for (const px of xsList) for (const sh of flat ? [0] : [-W, 0, W]) {
      const cx = px + sh; if (cx < -rh || cx > W + rh) continue;
      if (b.kind === 'glitter') { for (let i = 0; i < rv * 1.4; i++) { const a = R() * 6.283, d = Math.sqrt(R()); g.fillStyle = R() < 0.25 ? '#ffffff' : b.color; g.globalAlpha = 0.6 + R() * 0.4; g.fillRect(cx + Math.cos(a) * d * rh, y + Math.sin(a) * d * rv, 2 + R() * 2, 2 + R() * 2); } g.globalAlpha = 1; }
      else { g.fillStyle = b.color; g.beginPath(); g.ellipse(cx, y, rh, rv, 0, 0, Math.PI * 2); g.fill(); }
    }
    g.restore(); this.painted = true;
  }

  // ---------------- texture ----------------
  composite() {
    const g = this.surface.getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(this.layerCv, 0, 0); g.drawImage(this.paint, 0, 0);
    this.tex.needsUpdate = true;
  }
  redrawLayers() {
    const g = this.layerCv.getContext('2d'), r = this.recipe; this.xs = makeXs(r);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = r.base; g.fillRect(0, 0, W, H);
    for (const L of r.layers) { g.save(); try { this.drawLayer(g, L); } catch (e) { console.warn(e); } g.restore(); }
    this.composite();
  }
  wrapDraw(cx, halfW, fn) { const flat = isFlat(this.recipe); for (const sh of flat ? [0] : [-W, 0, W]) { const x = cx + sh; if (x + halfW < 0 || x - halfW > W) continue; fn(x); } }
  drawLayer(g, L) {
    const xs = this.xs, flat = isFlat(this.recipe);
    switch (L.type) {
      case 'gradient': { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, L.color); gr.addColorStop(1, L.color2); g.fillStyle = gr; g.fillRect(0, 0, W, H); break; }
      case 'band': { const bh = L.size * H * 0.45, y = L.y * H; g.fillStyle = L.color; g.fillRect(0, y - bh / 2, W, bh); if (L.color2 !== L.color) { const t = Math.max(3, bh * 0.08); g.fillStyle = L.color2; g.fillRect(0, y - bh / 2 - t, W, t); g.fillRect(0, y + bh / 2, W, t); } break; }
      case 'stripes': { const n = Math.round(L.count), sh = H / (2 * n); g.fillStyle = L.color; for (let i = 0; i < n; i++) g.fillRect(0, (i + 0.5) * H / n - sh / 2, W, sh); break; }
      case 'vstripes': { const n = Math.round(L.count); g.fillStyle = L.color; for (let i = 0; i < n; i++) g.fillRect(i * W / n, 0, W / (2 * n), H); break; }
      case 'spiral': { const n = Math.round(L.count), sw = W / (2 * n), tw = L.size * W * 1.5; g.fillStyle = L.color;
        for (let i = 0; i < n; i++) for (let k = -3; k <= 1; k++) { const x = i * W / n + k * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + sw, 0); g.lineTo(x + sw + tw, H); g.lineTo(x + tw, H); g.closePath(); g.fill(); } break; }
      case 'zigzag': { const n = Math.round(L.count), amp = L.size * H * 0.14 + 4; g.strokeStyle = L.color; g.lineWidth = L.size * H * 0.08 + 3; g.lineJoin = 'miter';
        g.beginPath(); for (let i = 0; i <= 2 * n; i++) { const x = i * W / (2 * n), y = L.y * H + (i % 2 ? -amp : amp); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); break; }
      case 'dots': case 'snowflakes': case 'stars': case 'hearts': {
        const n = Math.round(L.count), sx = W / n, rows = Math.max(1, Math.round(H / (sx / Math.max(0.2, xs(H / 2)))));
        let xsMin = Infinity; for (let j = 0; j < rows; j++) xsMin = Math.min(xsMin, xs((j + 0.5) * H / rows));
        const rv = L.size * (H / rows) * 0.42; g.fillStyle = g.strokeStyle = L.color;
        for (let j = 0; j < rows; j++) {
          const yc = (j + 0.5) * H / rows, xr = xs(yc), per = flat ? n : Math.max(1, Math.round(n * xsMin / xr));
          for (let k = 0; k < per; k++) { const cx = (k + (j % 2) * 0.5 + 0.5) * W / per; this.wrapDraw(cx, rv * xr, x => { g.save(); g.translate(x, yc); g.scale(xr, 1); glyph(g, L.type, rv); g.restore(); }); }
        }
        break;
      }
      case 'glitter': { const bh = L.size * H * 0.5, y0 = L.y * H - bh / 2, n = Math.round(L.count * bh * W / 25), R = rng(hash(L.id)), c = new THREE.Color(L.color);
        for (let i = 0; i < n; i++) { const k = R(); g.fillStyle = k < 0.2 ? '#ffffff' : '#' + c.clone().multiplyScalar(0.6 + R() * 0.6).getHexString(); g.fillRect(R() * W, y0 + R() * bh, 2 + R() * 2.5, 2 + R() * 2.5); } break; }
      case 'text': {
        const n = flat ? 1 : Math.round(L.count), px = L.size * H * 0.5, y = L.y * H, xr = xs(y);
        g.font = `bold ${Math.round(px)}px ${FONTS[L.font]?.[0] || FONTS[0][0]}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        const tw = g.measureText(L.text || '').width * xr;
        for (let k = 0; k < n; k++) this.wrapDraw(((k + 0.5) / n + (L.x ?? 0.5) - 0.5) * W, tw / 2, x => { g.save(); g.translate(x, y); g.scale(xr, 1); if (L.color2 && L.color2 !== L.color) { g.strokeStyle = L.color2; g.lineWidth = px * 0.1; g.strokeText(L.text || '', 0, 0); } g.fillStyle = L.color; g.fillText(L.text || '', 0, 0); g.restore(); });
        break;
      }
      case 'image': {
        const img = L.src && this.images.get(L.src); if (!img) break;
        const y = L.y * H, xr = xs(y), hh = L.size * H * 0.9, ww = hh * img.width / img.height * xr;
        this.wrapDraw(L.x * W, ww / 2, x => {
          g.save(); g.beginPath(); g.ellipse(x, y, ww / 2, hh / 2, 0, 0, Math.PI * 2);
          if (L.frame) { g.save(); g.clip(); g.drawImage(img, x - ww / 2, y - hh / 2, ww, hh); g.restore(); g.strokeStyle = L.color; g.lineWidth = hh * 0.06; g.stroke(); }
          else g.drawImage(img, x - ww / 2, y - hh / 2, ww, hh);
          g.restore();
        });
        break;
      }
    }
  }
  async loadLayerImages() {
    for (const L of this.recipe.layers) if (L.type === 'image' && L.src && !this.images.has(L.src)) { try { this.images.set(L.src, await loadImage(L.src)); } catch { } }
  }

  // ---------------- model ----------------
  rebuildMesh() {
    this.holder.traverse(o => { o.geometry?.dispose(); if (o.material && o.material !== this._keepMat) o.material.dispose?.(); });
    this.holder.clear();
    const m = buildDesigned(this.recipe, this.tex);
    const s = 1 / (this.recipe.heightIn || 3.5); m.scale.setScalar(s); this.holder.add(m);
    this.drawProfile();
  }
  rebuild() { this.rebuildMesh(); this.redrawLayers(); }
  snapshot() { this.undoStack.push({ r: JSON.stringify(this.recipe), p: this.paint.getContext('2d').getImageData(0, 0, W, H), painted: this.painted }); if (this.undoStack.length > 25) this.undoStack.shift(); }
  undo() {
    const s = this.undoStack.pop(); if (!s) return toast('Nothing to undo');
    this.recipe = JSON.parse(s.r); this.paint.getContext('2d').putImageData(s.p, 0, 0); this.painted = s.painted; this.rebuild(); this.renderLeft();
  }
  change(fn, { mesh = true, left = true } = {}) { this.snapshot(); fn(this.recipe); if (mesh) this.rebuildMesh(); this.redrawLayers(); if (left) this.renderLeft(); }
  live(fn, { mesh = false } = {}) { fn(this.recipe); if (mesh) this.rebuildMesh(); this.redrawLayers(); }

  // ---------------- profile editor ----------------
  initProfileEditor() {
    const c = $('.pcv', this.root);
    const pos = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; };
    c.addEventListener('pointerdown', e => {
      const p = pos(e), g = this.pgeom, pr = this.recipe.profile; let best = -1, bd = 14;
      pr.forEach(([r, y], i) => { if (i === pr.length - 1) return; for (const sgn of [1, -1]) { const d = Math.hypot(g.cx + sgn * r * this.recipe.girth * g.s - p.x, g.top + y * g.s - p.y); if (d < bd) { bd = d; best = i; } } });
      if (best < 0) return; this.snapshot(); this.pdrag = { i: best, g: { ...g } }; c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      const d = this.pdrag; if (!d) return; const p = pos(e), pr = this.recipe.profile, i = d.i;
      const r = Math.max(0.01, Math.min(0.75, Math.abs(p.x - d.g.cx) / (d.g.s * this.recipe.girth)));
      pr[i][0] = +r.toFixed(3);
      if (i > 0) pr[i][1] = +Math.max(pr[i - 1][1] + 0.01, Math.min(pr[i + 1][1] - 0.01, (p.y - d.g.top) / d.g.s)).toFixed(3);
      this.rebuildMesh();
    });
    const up = () => { if (this.pdrag) { this.pdrag = null; this.redrawLayers(); } };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }
  drawProfile() {
    const box = $('.profile', this.root), c = $('.pcv', this.root), flat = isFlat(this.recipe); box.hidden = flat; if (flat) return;
    const g = c.getContext('2d'), cw = c.width, ch = c.height, gi = this.recipe.girth || 1, pr = this.recipe.profile;
    const maxR = Math.max(...pr.map(p => p[0])) * gi;
    const s = this.pdrag ? this.pdrag.g.s : Math.min(ch - 28, (cw / 2 - 14) / Math.max(0.3, maxR)), cx = cw / 2, top = 14;
    this.pgeom = { s, cx, top };
    g.clearRect(0, 0, cw, ch); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, ch); g.stroke();
    const pts = spacedProfile(pr, 80, gi);
    g.fillStyle = this.recipe.base + '99'; g.strokeStyle = '#ffe397'; g.lineWidth = 1.5; g.beginPath();
    pts.forEach(([r, y], i) => { const X = cx + r * s, Y = top + y * s; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(cx - pts[i][0] * s, top + pts[i][1] * s);
    g.closePath(); g.fill(); g.stroke();
    pr.forEach(([r, y], i) => { if (i === pr.length - 1) return; g.fillStyle = this.pdrag?.i === i ? '#ffffff' : '#ffe397'; g.beginPath(); g.arc(cx + r * gi * s, top + y * s, 5.5, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); });
  }

  // ---------------- left panel ----------------
  renderLeft() {
    const tabs = $('.ltabs', this.root), body = $('.lbody', this.root), st = body.scrollTop; tabs.innerHTML = ''; body.innerHTML = '';
    for (const [id, l] of [['shape', '🔵 Shape'], ['surface', '🎨 Patterns'], ['paint', '🖌 Paint'], ['save', '💾 Save']])
      tabs.append(h('button', { class: 'ltab' + (this.tab === id ? ' on' : ''), role: 'tab', onclick: () => { this.tab = id; if (id === 'paint') this.setMode('paint'); this.renderLeft(); } }, l));
    ({ shape: () => this.leftShape(body), surface: () => this.leftSurface(body), paint: () => this.leftPaint(body), save: () => this.leftSave(body) })[this.tab]();
    if (this._keepScroll) body.scrollTop = st; this._keepScroll = false;
  }
  slider(label, value, min, max, step, set, opts = {}) {
    const out = h('span', { class: 'sv' }, opts.fmt ? opts.fmt(value) : '');
    const inp = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
    inp.addEventListener('pointerdown', () => this.snapshot()); inp.addEventListener('keydown', () => this.snapshot());
    inp.addEventListener('input', () => { this.live(r => set(r, +inp.value), { mesh: opts.mesh }); if (opts.fmt) out.textContent = opts.fmt(+inp.value); });
    return h('label', { class: 'slider' }, h('span', {}, label), inp, out);
  }
  colorIn(value, set, label) {
    const inp = h('input', { type: 'color', value, 'aria-label': label });
    inp.addEventListener('pointerdown', () => this.snapshot()); inp.addEventListener('input', () => this.live(r => set(r, inp.value)));
    return inp;
  }
  leftShape(body) {
    const r = this.recipe, sh = shapeById(r.shape);
    body.append(
      h('h4', { class: 'sub' }, 'Start from an idea'),
      h('div', { class: 'grid-btns' }, IDEAS.map(i => h('button', { class: 'chip', onclick: () => this.applyIdea(i) }, i.label))),
      h('h4', { class: 'sub' }, 'Shape'),
      h('div', { class: 'grid-btns' }, SHAPES.map(s => h('button', { class: 'chip' + (s.id === r.shape ? ' on' : ''), onclick: () => this.change(x => { x.shape = s.id; if (s.profile) x.profile = clone(s.profile); x.width = s.width ?? x.width; x.girth = 1; }) }, s.label))),
      sh.kind === 'lathe'
        ? h('div', {}, h('p', { class: 'muted' }, 'Drag the dots in the shape box (bottom left of the 3D view) to sculpt the outline.'), this.slider('Width', r.girth, 0.4, 1.8, 0.02, (x, v) => { x.girth = v; }, { mesh: true, fmt: v => Math.round(v * 100) + '%' }),
          h('button', { class: 'btn small', onclick: () => this.change(x => { x.profile = clone(sh.profile); x.girth = 1; }) }, '↺ Reset outline'))
        : this.slider('Width', r.width, 0.5, 1.5, 0.02, (x, v) => { x.width = v; }, { mesh: true, fmt: v => Math.round(v * 100) + '%' }),
      h('h4', { class: 'sub' }, 'Size'),
      this.slider('Height', r.heightIn, 1, 8, 0.25, (x, v) => { x.heightIn = v; }, { fmt: v => `${v.toFixed(2)}″ (${(v * 2.54).toFixed(1)} cm)` }),
      h('p', { class: 'muted sizeinfo' }, `About ${fmtLen(r.heightIn)} tall and ${fmtLen(r.heightIn * profileWidth(r))} wide, not counting the cap.`),
      h('h4', { class: 'sub' }, 'Cap & hanger'),
      h('div', { class: 'grid-btns' }, [['classic', 'Classic'], ['crown', 'Fancy crown'], ['none', 'None']].map(([id, l]) => h('button', { class: 'chip' + (r.cap.style === id ? ' on' : ''), onclick: () => this.change(x => { x.cap.style = id; }) }, l))),
      h('div', { class: 'grid-btns' }, Object.entries(CAP_COLORS).map(([id, c]) => h('button', { class: 'chip' + (r.cap.color === id ? ' on' : ''), onclick: () => this.change(x => { x.cap.color = id; }) }, h('span', { class: 'dot', style: { background: c } }), ' ', id))));
  }
  leftSurface(body) {
    const r = this.recipe;
    const add = select([{ value: '', label: '+ Add a pattern…' }, ...Object.entries(LAYERS).map(([id, L]) => ({ value: id, label: L.label }))], '', v => {
      if (!v) return; this.change(x => x.layers.push({ ...clone(LAYERS[v].d), type: v, id: uid() })); if (v === 'image') toast('Choose a photo for the new photo layer');
    });
    body.append(
      h('h4', { class: 'sub' }, 'Glass color'),
      h('div', { class: 'field' }, this.colorIn(r.base, (x, v) => { x.base = v; }, 'Base color')),
      swatches(COLORS, r.base, c => this.change(x => { x.base = c; }, { mesh: false })),
      h('h4', { class: 'sub' }, 'Finish'),
      h('div', { class: 'grid-btns' }, FINISHES.map(([id, l]) => h('button', { class: 'chip' + (r.finish === id ? ' on' : ''), onclick: () => this.change(x => { x.finish = id; }) }, l))),
      h('h4', { class: 'sub' }, `Patterns (${r.layers.length})`),
      h('p', { class: 'muted' }, 'Layers stack from the glass up: later ones sit on top. Paint goes over everything.'),
      add,
      ...r.layers.map((L, i) => this.layerCard(L, i)));
  }
  layerCard(L, i) {
    const def = LAYERS[L.type], r = this.recipe, card = h('div', { class: 'layer' });
    const mv = d => this.change(x => { const j = i + d; if (j < 0 || j >= x.layers.length) return; [x.layers[i], x.layers[j]] = [x.layers[j], x.layers[i]]; }, { mesh: false });
    card.append(h('div', { class: 'lh' }, h('b', {}, def.label), h('span', {},
      h('button', { class: 'btn small', 'aria-label': 'Move down (under)', title: 'Move under', onclick: () => mv(-1) }, '↑'),
      h('button', { class: 'btn small', 'aria-label': 'Move up (on top)', title: 'Move on top', onclick: () => mv(1) }, '↓'),
      h('button', { class: 'btn small danger', 'aria-label': 'Remove pattern', onclick: () => this.change(x => { x.layers = x.layers.filter(y => y.id !== L.id); }, { mesh: false }) }, '✕'))));
    const get = x => x.layers.find(y => y.id === L.id);
    for (const f of def.fields) {
      if (f === 'color' || f === 'color2') card.append(h('div', { class: 'field' }, h('label', {}, FIELD_LABEL[f]), this.colorIn(L[f], (x, v) => { get(x)[f] = v; }, FIELD_LABEL[f]), ...COLORS.slice(0, 7).map(c => h('button', { class: 'sw mini', title: c, 'aria-label': c, style: { background: c }, onclick: () => this.change(x => { get(x)[f] = c; }, { mesh: false }) }))));
      else if (f === 'y' || f === 'x' || f === 'size') card.append(this.slider(FIELD_LABEL[f], L[f], f === 'size' ? 0.05 : 0, 1, 0.01, (x, v) => { get(x)[f] = v; }));
      else if (f === 'count') { const [a, b, s] = def.range; card.append(this.slider(L.type === 'glitter' ? 'Sparkle' : L.type === 'text' ? 'Repeat around' : FIELD_LABEL.count, L.count, a, b, s, (x, v) => { get(x).count = v; }, { fmt: v => s < 1 ? Math.round(v * 100) + '%' : String(v) })); }
      else if (f === 'text') { const t = h('input', { type: 'text', value: L.text, maxlength: 40, placeholder: 'Name, year, message or emoji' }); t.addEventListener('focus', () => this.snapshot()); t.addEventListener('input', () => this.live(x => { get(x).text = t.value; })); card.append(t); }
      else if (f === 'font') card.append(h('div', { class: 'field' }, h('label', {}, 'Font'), select(FONTS.map(([v, l], k) => ({ value: String(k), label: l })), String(L.font), v => this.change(x => { get(x).font = +v; }, { mesh: false }))));
      else if (f === 'image') {
        const fi = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => { const file = e.target.files[0]; if (!file) return; const src = await fileToDataURL(file, 600); this.images.set(src, await loadImage(src)); this.change(x => { get(x).src = src; }, { mesh: false }); } });
        card.append(h('div', { class: 'field' }, L.src ? h('img', { src: L.src, class: 'lthumb', alt: '' }) : h('span', { class: 'muted' }, 'No photo yet'), h('button', { class: 'btn small' + (L.src ? '' : ' primary'), onclick: () => fi.click() }, L.src ? 'Change photo' : '📷 Choose photo'), fi,
          h('label', {}, h('input', { type: 'checkbox', checked: L.frame, onchange: e => this.change(x => { get(x).frame = e.target.checked; }, { mesh: false }) }), ' Round frame')));
      }
    }
    void r; return card;
  }
  leftPaint(body) {
    const b = this.brush;
    body.append(
      h('p', {}, 'Paint mode is on: drag across the ornament to paint. Drag the background to turn it.'),
      h('div', { class: 'grid-btns' }, [['paint', '🖌 Brush'], ['glitter', '✨ Glitter'], ['erase', '🧽 Eraser']].map(([id, l]) => h('button', { class: 'chip' + (b.kind === id ? ' on' : ''), onclick: () => { b.kind = id; this.renderLeft(); } }, l))),
      h('div', { class: 'field' }, h('label', {}, 'Color'), h('input', { type: 'color', value: b.color, oninput: e => { b.color = e.target.value; } })),
      swatches(COLORS, b.color, c => { b.color = c; this.renderLeft(); }),
      h('label', { class: 'slider' }, h('span', {}, 'Brush size'), h('input', { type: 'range', min: 2, max: 60, value: b.size, oninput: e => { b.size = +e.target.value; } }), h('span', {})),
      h('div', { class: 'field' }, h('label', {}, isFlat(this.recipe) ? 'Mirror' : 'Repeat around'), select(isFlat(this.recipe) ? [{ value: '1', label: 'Off' }, { value: '2', label: 'Left/right mirror' }] : [1, 2, 3, 4, 6, 8].map(n => ({ value: String(n), label: n === 1 ? 'Off' : `${n} times` })), String(b.sym), v => { b.sym = +v; })),
      h('button', { class: 'btn small danger', onclick: () => { this.snapshot(); this.paint.getContext('2d').clearRect(0, 0, W, H); this.painted = false; this.composite(); } }, 'Clear all paint'));
  }
  async leftSave(body) {
    const nameIn = h('input', { type: 'text', value: this.name, placeholder: 'Name this ornament', maxlength: 40, oninput: e => { this.name = e.target.value; } });
    body.append(
      h('div', { class: 'field' }, nameIn),
      h('div', { class: 'field' }, h('button', { class: 'btn primary', onclick: () => this.save(false) }, this.editingId ? '💾 Save changes' : '💾 Save to Custom ornaments'),
        this.editingId ? h('button', { class: 'btn', onclick: () => this.save(true) }, 'Save as a copy') : null),
      h('div', { class: 'field' }, h('button', { class: 'btn', onclick: () => this.startNew() }, '✨ New ornament'),
        this.editingId ? h('button', { class: 'btn', onclick: () => this.hang(this.editingId) }, '🎄 Hang it on the tree →') : null),
      h('p', { class: 'muted' }, 'Saved ornaments appear in the Tree Builder under Decor › Custom, at their real size.'));
    const list = (await idb.all('customs').catch(() => [])).filter(c => c.kind === 'designed').sort((a, b) => b.created - a.created);
    body.append(h('h4', { class: 'sub' }, `My designs (${list.length})`));
    if (!list.length) body.append(h('p', { class: 'muted' }, 'Nothing saved yet.'));
    body.append(h('div', { class: 'cards small' }, list.map(c => h('div', { class: 'card' + (c.id === this.editingId ? ' on' : '') }, h('img', { src: c.cutout, alt: c.name }), h('b', {}, c.name), h('div', { class: 'muted' }, fmtLen(c.heightIn)),
      h('div', { class: 'btns' }, h('button', { class: 'btn small', onclick: () => this.edit(c) }, 'Edit'), h('button', { class: 'btn small', title: 'Hang on the tree', onclick: () => this.hang(c.id) }, '🎄'),
        h('button', { class: 'btn small danger', 'aria-label': 'Delete', onclick: async () => { if (!(await confirmDel(c.name))) return; await idb.del('customs', c.id); if (this.editingId === c.id) this.editingId = null; await this.refreshOthers(); this.renderLeft(); toast('Deleted'); } }, '✕'))))));
  }

  // ---------------- actions ----------------
  async applyIdea(idea) {
    this.snapshot(); this.recipe = newRecipe(idea.r); this.paint.getContext('2d').clearRect(0, 0, W, H); this.painted = false; this.editingId = null; this.name = idea.label.replace(/^\S+\s/, '');
    await this.loadLayerImages(); this.rebuild(); this.tab = idea.r.layers.some(l => l.type === 'image') ? 'surface' : this.tab; this.renderLeft();
    if (this.tab === 'surface') toast('Choose a photo for the photo layer');
  }
  startNew() { this.snapshot(); this.recipe = newRecipe(); this.paint.getContext('2d').clearRect(0, 0, W, H); this.painted = false; this.editingId = null; this.name = ''; this.tab = 'shape'; this.rebuild(); this.renderLeft(); }
  surprise() {
    const R = Math.random, pick = a => a[Math.floor(R() * a.length)];
    const shape = R() < 0.8 ? pick(SHAPES.filter(s => s.kind === 'lathe')) : pick(SHAPES.filter(s => s.kind === 'flat'));
    const base = pick(COLORS), accent = pick(['#ffffff', '#d4a640', '#c9ced3', pick(COLORS.filter(c => c !== base))]);
    const types = ['band', 'stripes', 'vstripes', 'spiral', 'zigzag', 'dots', 'snowflakes', 'stars', 'hearts', 'glitter'];
    const layers = []; const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) { const t = pick(types), d = clone(LAYERS[t].d); d.color = i === 0 ? accent : pick([accent, '#ffffff', '#d4a640']); if ('y' in d) d.y = 0.2 + R() * 0.6; if (t === 'glitter') d.color = pick(['#ffd86b', '#ffffff', '#c9ced3']); layers.push({ type: t, ...d }); }
    this.snapshot(); const keepH = this.recipe.heightIn;
    this.recipe = newRecipe({ shape: shape.id, base, finish: pick(['shiny', 'shiny', 'matte', 'satin', 'glitter', 'mercury']), layers, cap: { style: pick(['classic', 'classic', 'crown']), color: pick(['gold', 'silver', 'gold', 'copper']) }, heightIn: keepH });
    if (shape.kind === 'lathe') this.recipe.girth = 0.85 + R() * 0.35;
    this.rebuild(); this.renderLeft();
  }
  async edit(rec) {
    this.recipe = clone(rec.recipe); const paint = this.recipe.paint; delete this.recipe.paint;
    const g = this.paint.getContext('2d'); g.clearRect(0, 0, W, H); this.painted = false;
    if (paint) { try { g.drawImage(await loadImage(paint), 0, 0, W, H); this.painted = true; } catch { } }
    this.editingId = rec.id; this.name = rec.name; this.undoStack = [];
    await this.loadLayerImages(); this.rebuild(); this.tab = 'shape'; this.renderLeft(); toast(`Editing "${rec.name}"`);
  }
  thumbnail() {
    const r = this.renderer, cam = this.cam.clone(), c = r.domElement;
    cam.position.set(0, -0.45, 3.0); cam.lookAt(0, -0.55, 0); cam.aspect = c.width / c.height; cam.updateProjectionMatrix();
    const rot = this.holder.rotation.y; this.holder.rotation.y = 0;
    this.scene.background = null; r.setClearColor(0x000000, 0); r.render(this.scene, cam);
    const S = Math.min(c.width, c.height), out = document.createElement('canvas'); out.width = out.height = 256;
    out.getContext('2d').drawImage(c, (c.width - S) / 2, (c.height - S) / 2, S, S, 0, 0, 256, 256);
    this.scene.background = this.bg; this.holder.rotation.y = rot; r.render(this.scene, this.cam);
    return out.toDataURL('image/png');
  }
  async save(asNew) {
    let name = (this.name || '').trim();
    if (!name) { name = await ask({ title: 'Name this ornament', body: h('div', {}, h('input', { type: 'text', name: 'n', value: 'My ornament', maxlength: 40 })), buttons: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, value: b => $('[name=n]', b).value.trim() || 'My ornament' }] }); if (!name) return; this.name = name; }
    const r = this.recipe, id = (!asNew && this.editingId) || uid();
    const rec = { id, name: asNew && this.editingId ? name + ' (copy)' : name, kind: 'designed', model: 'designed', created: Date.now(),
      recipe: { ...clone(r), paint: this.painted ? this.paint.toDataURL('image/png') : null },
      texture: this.surface.toDataURL('image/jpeg', 0.92), cutout: this.thumbnail(), heightIn: r.heightIn, widthIn: +(r.heightIn * profileWidth(r)).toFixed(2) };
    await idb.put('customs', rec); this.editingId = id; this.name = rec.name;
    await this.refreshOthers(); this.tab = 'save'; this.renderLeft();
    toast(`Saved "${rec.name}" to Custom ornaments`);
  }
  async refreshOthers() { await loadCustoms(); this.app.builder.rebuild(); this.app.builder.renderLeft(); this.app.importer.renderLib(); }
  hang(id) {
    const b = this.app.builder; b.leftTab = 'decor'; b.pick = { type: 'custom', customId: id, color: 'white', finish: 'matte', size: 'M' }; b.setTool('place'); b.renderLeft(); this.app.show('builder');
    toast('Click the tree to hang it');
  }
  onShow() { this.resize(); if (this.tab === 'save') this.renderLeft(); }
}

function glyph(g, type, r) {
  if (type === 'dots') { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); }
  else if (type === 'stars') { g.beginPath(); for (let i = 0; i <= 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.42 : r; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); }
  else if (type === 'hearts') { g.beginPath(); g.moveTo(0, r * 0.9); g.bezierCurveTo(r * 1.3, 0, r * 0.7, -r * 1.05, 0, -r * 0.35); g.bezierCurveTo(-r * 0.7, -r * 1.05, -r * 1.3, 0, 0, r * 0.9); g.fill(); }
  else { g.lineWidth = Math.max(1.5, r * 0.13); g.lineCap = 'round'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a); g.moveTo(0, 0); g.lineTo(c * r, s * r); for (const t of [0.5, 0.75]) { const bx = c * r * t, by = s * r * t, l = r * (t === 0.5 ? 0.3 : 0.2); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + 0.7) * l, by + Math.sin(a + 0.7) * l); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a - 0.7) * l, by + Math.sin(a - 0.7) * l); } } g.stroke(); }
}
function hash(s) { let x = 2166136261; for (const ch of String(s)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; }
