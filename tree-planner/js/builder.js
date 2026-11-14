// Christmas Tree Builder: info panel on the left, 3D tree on the right, top-down view, decor catalog.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SPECIES, ARTIFICIAL, treeById, ORNAMENTS, PALETTE, ORN_SIZES, GARLANDS, TINSELS, LIGHTS, TOPPERS, SKIRTS, PAPERS, BOXES, RIBBONS, BOWS, CARDS, RIBBON_COLORS, THEMES } from './data.js';
import { buildDesign, visibleArc, inArc, wrapPi, WALL_AZ, toOrnCoords, attachGap, nearestBranchPoint, makeOrnament, ornamentPos, sampleCanopy, wallAxes } from './scene.js';
import { newDesign, autoDecorate, randomPresent } from './decorate.js';
import { designs, uid, idb, customCache, paperCache, loadPapers, fileToDataURL, loadImage } from './store.js';
import { paperCanvas } from './textures.js';
import { $, $$, h, ask, toast, select, swatches, confirmDel, esc, fmtLen, inchToCm, cmToInch } from './ui.js';

const DEG = Math.PI / 180;
const colorOf = c => (c && c[0] === '#') ? c : (PALETTE[c] || '#ccc');
const clone = o => JSON.parse(JSON.stringify(o));

export class Builder {
  constructor(root, app) {
    this.app = app; this.root = root;
    this.design = newDesign(); this.ctx = { customs: customCache, papers: paperCache };
    this.tool = 'place'; this.pick = { type: 'ball', color: 'red', finish: 'shiny', size: 'M' };
    this.undoStack = []; this.roomLink = null; this.okFloating = new Set();
    this.leftTab = 'tree';
    this.initDom(); this.init3d(); this.rebuild(); this.renderLeft(); this.loop();
  }

  // ---------------- DOM ----------------
  initDom() {
    this.root.innerHTML = `
      <div class="b-left"><div class="ltabs" role="tablist"></div><div class="lbody"></div></div>
      <div class="b-right">
        <div class="b-bar">
          <div class="tools" role="toolbar" aria-label="Decorating tools"></div>
          <div class="grow"></div>
          <button class="btn" data-act="auto">✨ Decorate for me</button>
          <button class="btn" data-act="check">🔍 Check decor</button>
          <button class="btn" data-act="undo" title="Undo (Ctrl+Z)">↶ Undo</button>
        </div>
        <div class="b-room-link" hidden></div>
        <div class="view3d"><canvas class="gl" aria-label="3D tree. Drag sideways to rotate, click to decorate."></canvas>
          <div class="rotbox"><label>Rotate <input type="range" class="rot" min="-180" max="180" step="1"></label><span class="rotnote"></span></div>
          <div class="topdown"><div class="tdhead">Top-down · tap walls near the tree</div><canvas class="td" width="240" height="240" aria-label="Top-down view"></canvas></div>
          <div class="floatbar" hidden></div>
          <div class="hint">Drag sideways to turn the tree · scroll to zoom · click to use the tool</div>
        </div>
      </div>`;
    const tools = $('.tools', this.root);
    for (const [id, label, tip] of [['place', '📍 Place on branch', 'Click a branch to hang the selected decoration'], ['free', '🎈 Free place', 'Place anywhere, even in the air'], ['select', '👆 Select', 'Click a decoration to inspect it'], ['erase', '🧽 Erase', 'Click a decoration to remove it']])
      tools.append(h('button', { class: 'tool', 'data-tool': id, title: tip, onclick: () => this.setTool(id) }, label));
    this.setTool('place');
    this.root.addEventListener('click', e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'auto') this.autoDialog(); if (a === 'check') this.sanityCheck(true); if (a === 'undo') this.undo(); });
    document.addEventListener('keydown', e => { if (this.app.tab !== 'builder') return; if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.closest('input,textarea')) { e.preventDefault(); this.undo(); } });
    const rot = $('.rot', this.root);
    rot.addEventListener('input', () => this.setRotation(+rot.value * DEG));
    const td = $('.td', this.root); td.addEventListener('click', e => this.topdownClick(e));
  }
  setTool(t) { this.tool = t; $$('.tool', this.root).forEach(b => b.classList.toggle('on', b.dataset.tool === t)); }

  // ---------------- 3D ----------------
  init3d() {
    const canvas = $('.gl', this.root);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio)); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color('#1a1714');
    const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.55;
    s.add(new THREE.HemisphereLight('#fff4e0', '#2a2018', 1.1));
    const key = new THREE.DirectionalLight('#fff1d6', 1.6); key.position.set(60, 140, 120); s.add(key);
    const fill = new THREE.DirectionalLight('#a9c4ff', 0.5); fill.position.set(-100, 60, -40); s.add(fill);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.7 })); floor.rotation.x = -Math.PI / 2; s.add(floor);
    this.spin = new THREE.Group(); s.add(this.spin);
    this.walls = new THREE.Group(); this.spin.add(this.walls);
    this.outlines = new THREE.Group(); this.spin.add(this.outlines);
    this.cam = new THREE.PerspectiveCamera(35, 1, 1, 3000); this.camDist = 1;
    this.ray = new THREE.Raycaster();
    // pointer: drag rotates, click acts
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, rot: this.design.rotation * DEG, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - down.x; if (Math.abs(dx) > 6) down.moved = true; if (down.moved) this.setRotation(down.rot - dx * 0.008); });
    canvas.addEventListener('pointerup', e => { if (down && !down.moved) this.click3d(e); down = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.camDist = Math.min(2.2, Math.max(0.35, this.camDist * (1 + Math.sign(e.deltaY) * 0.1))); this.placeCamera(); }, { passive: false });
    new ResizeObserver(() => this.resize()).observe($('.view3d', this.root));
  }
  resize() { const v = $('.view3d', this.root), w = v.clientWidth, hh = v.clientHeight; if (!w || !hh) return; this.renderer.setSize(w, hh, false); this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); this.placeCamera(); }
  placeCamera() {
    const H = this.design.height, fit = (H * 1.4) / (2 * Math.tan(this.cam.fov * DEG / 2)) / Math.min(1, this.cam.aspect * 1.1);
    const d = fit * this.camDist, ty = H * 0.45;
    this.cam.position.set(0, ty + H * 0.1, d); this.cam.lookAt(0, ty, 0);
  }
  loop() {
    const tick = (t) => { requestAnimationFrame(tick); if (this.app.tab !== 'builder') return; this.built?.update(t / 1000); this.renderer.render(this.scene, this.cam); };
    requestAnimationFrame(tick);
  }

  // ---------------- design lifecycle ----------------
  setDesign(d, link = null) {
    this.design = clone(d); this.roomLink = link; this.undoStack = []; this.okFloating = new Set();
    this.rebuild(); this.renderLeft(); this.renderRoomLink();
  }
  snapshot() { this.undoStack.push(JSON.stringify(this.design)); if (this.undoStack.length > 60) this.undoStack.shift(); }
  undo() { const s = this.undoStack.pop(); if (!s) return toast('Nothing to undo'); this.design = JSON.parse(s); this.rebuild(); this.renderLeft(); }
  change(fn, { rebuild = true, left = true } = {}) { this.snapshot(); fn(this.design); if (rebuild) this.rebuild(); if (left) this.renderLeft(); }

  rebuild() {
    if (this.built) { this.spin.remove(this.built.root); this.built.dispose(); }
    this.built = buildDesign(this.design, this.ctx);
    this.spin.add(this.built.root);
    this.buildWalls(); this.clampRotation(); this.placeCamera(); this.resize();
    this.sanityCheck(false);
    this.drawTopdown();
  }
  buildWalls() {
    this.walls.clear();
    const D = this.built.wallLimit, H = this.design.height + 14;
    const mat = new THREE.MeshStandardMaterial({ color: '#8f8574', roughness: 0.9, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    for (const w of this.design.walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(D * 2.6, H), mat); m.position.y = H / 2;
      const az = WALL_AZ[w]; m.position.x = Math.sin(az) * D; m.position.z = Math.cos(az) * D; m.rotation.y = az; this.walls.add(m);
    }
  }
  setRotation(phi) {
    this.design.rotation = phi / DEG; this.clampRotation();
    $('.rot', this.root).value = Math.round(wrapPi(this.design.rotation * DEG) / DEG);
    this.drawTopdown();
  }
  clampRotation() {
    const arc = visibleArc(this.design.walls); let phi = this.design.rotation * DEG;
    const note = $('.rotnote', this.root), rot = $('.rot', this.root);
    if (arc.half < Math.PI) {
      const d = wrapPi(phi - arc.center); phi = arc.center + Math.max(-arc.half, Math.min(arc.half, d));
      note.textContent = this.design.walls.length === 2 ? 'Corner: limited to the open 180°' : 'Wall: back 90° is off-limits';
      rot.min = Math.round((arc.center - arc.half) / DEG); rot.max = Math.round((arc.center + arc.half) / DEG);
    } else { note.textContent = ''; rot.min = -180; rot.max = 180; }
    this.design.rotation = phi / DEG; this.spin.rotation.y = -phi;
    rot.value = Math.round((arc.half < Math.PI ? arc.center + wrapPi(phi - arc.center) : wrapPi(phi)) / DEG);
  }

  // ---------------- interaction ----------------
  ndc(e) { const r = e.target.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  ornAt(e) {
    this.ray.setFromCamera(this.ndc(e), this.cam);
    const hit = this.ray.intersectObjects(this.built.ornGroup.children, true)[0];
    let o = hit?.object; while (o && !o.userData.ornament) o = o.parent; return o?.userData.ornament || null;
  }
  click3d(e) {
    const local = p => this.built.root.worldToLocal(p.clone());
    if (this.tool === 'erase' || this.tool === 'select') {
      const o = this.ornAt(e); if (!o) return;
      if (this.tool === 'erase') return this.change(d => { d.ornaments = d.ornaments.filter(x => x.id !== o.id); });
      return this.inspect(o);
    }
    if (!this.pick) return toast('Pick a decoration on the left first');
    this.ray.setFromCamera(this.ndc(e), this.cam);
    let p;
    if (this.tool === 'place') {
      const hit = this.ray.intersectObjects(this.built.raycast, false)[0];
      if (!hit) return toast('Missed the tree. Use Free place to put something in the air.');
      p = local(hit.point);
      const R = this.built.shape.R(p.y), rr = Math.hypot(p.x, p.z);
      if (rr < R * 1.05) { const k = Math.min(R * 1.0, rr + 0.6) / Math.max(0.01, rr); p.x *= k; p.z *= k; } // sit on the outside of the needles
    } else {
      const n = this.cam.getWorldDirection(new THREE.Vector3()).negate(), plane = new THREE.Plane(n, 0);
      const pt = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(plane, pt)) return; p = local(pt);
    }
    const o = { id: uid(), ...this.pick, manual: true, spin: Math.random() * 6.28 };
    if (this.tool === 'free') o.free = { x: p.x, y: p.y, z: p.z }; else Object.assign(o, toOrnCoords(p, this.built.shape));
    this.snapshot(); this.design.ornaments.push(o);
    const obj = makeOrnament(o, this.ctx); obj.position.copy(ornamentPos(o, this.built.shape)); obj.rotation.y = Math.atan2(obj.position.x, obj.position.z) + o.spin;
    this.built.ornGroup.add(obj); this.built.ornObjs.set(o.id, obj);
    this.sanityCheck(false, o.id); this.drawTopdown(); this.renderCount();
  }
  async inspect(o) {
    const gap = attachGap(o, this.built).gap;
    const v = await ask({ title: `${o.type === 'custom' ? (customCache.get(o.customId)?.name || 'Custom') : (ORNAMENTS.find(x => x.id === o.type)?.label || o.type)}`, body: `<p>${o.color} · ${o.finish} · size ${o.size}</p><p>${gap > 2 ? `⚠️ About ${gap.toFixed(1)}″ from the nearest branch.` : '✅ Hanging on a branch.'}</p>`,
      buttons: [{ label: 'Close', value: null }, { label: 'Snap to branch', value: 'snap' }, { label: 'Remove', value: 'del', danger: true }] });
    if (v === 'del') this.change(d => { d.ornaments = d.ornaments.filter(x => x.id !== o.id); });
    if (v === 'snap') this.snap([o.id]);
  }

  // ---------------- sanity check: decor must touch a branch ----------------
  sanityCheck(explicit, onlyId = null) {
    this.outlines.clear();
    if (!this.built) return;
    const floating = [];
    for (const o of this.design.ornaments) {
      if (o.type === 'bird' && !o.free) continue;
      const { gap } = attachGap(o, this.built);
      if (gap > 2 && !this.okFloating.has(o.id)) floating.push({ o, gap });
    }
    const red = new THREE.MeshBasicMaterial({ color: '#ff2020', side: THREE.BackSide, depthTest: true });
    this.spin.updateMatrixWorld(true);
    for (const { o } of floating) {
      const obj = this.built.ornObjs.get(o.id); if (!obj) continue;
      const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3()); const sz = box.getSize(new THREE.Vector3());
      // Box3 is in world space; outlines live in the same (rotated) frame as the tree.
      this.built.root.worldToLocal(c);
      const o2 = obj.clone(true); o2.traverse(m => { if (m.isMesh) m.material = red; });
      const wrap = new THREE.Group(); wrap.position.copy(c); wrap.scale.setScalar(1.2); o2.position.sub(c); wrap.add(o2); this.outlines.add(wrap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(sz.x, sz.y) * 0.75, 0.12, 6, 32), new THREE.MeshBasicMaterial({ color: '#ff2020' })); ring.position.copy(c); ring.lookAt(c.clone().add(new THREE.Vector3(c.x, 0, c.z).normalize())); this.outlines.add(ring);
      ring.userData.pulse = true;
    }
    this.floating = floating;
    const bar = $('.floatbar', this.root);
    if (!floating.length) { bar.hidden = true; if (explicit) toast('✅ Every decoration is hanging on a branch.'); return; }
    if (!explicit && onlyId && !floating.some(f => f.o.id === onlyId) && bar.hidden) return;
    bar.hidden = false;
    bar.innerHTML = '';
    bar.append(h('span', {}, `⚠️ ${floating.length === 1 ? 'This decoration doesn\'t seem' : floating.length + ' decorations don\'t seem'} to be on a branch (outlined in red). Does this look okay?`),
      h('button', { class: 'btn', onclick: () => { floating.forEach(f => this.okFloating.add(f.o.id)); this.sanityCheck(false); } }, 'Looks okay'),
      h('button', { class: 'btn primary', onclick: () => this.snap(floating.map(f => f.o.id)) }, 'Move onto branches'),
      h('button', { class: 'btn danger', onclick: () => { const ids = new Set(floating.map(f => f.o.id)); this.change(d => { d.ornaments = d.ornaments.filter(o => !ids.has(o.id)); }); } }, 'Remove'));
  }
  snap(ids) {
    this.change(d => {
      for (const o of d.ornaments) if (ids.includes(o.id)) {
        const p = ornamentPos(o, this.built.shape), bp = nearestBranchPoint(p, this.built);
        const out = new THREE.Vector3(bp.x, 0, bp.z).normalize().multiplyScalar(0.8); bp.add(out); bp.y -= 0.2;
        delete o.free; Object.assign(o, toOrnCoords(bp, this.built.shape));
      }
    });
  }

  // ---------------- top-down view ----------------
  tdGeom() { const c = $('.td', this.root), W = c.width, D = this.built.wallLimit, s = (W * 0.5 - 26) / (D + 6); return { c, W, D, s, cx: W / 2, cy: W / 2 }; }
  wallRects() { const { D, s, cx, cy, W } = this.tdGeom(), t = 14, L = (D + 4) * s * 2; return { back: [cx - L / 2, cy - D * s - t, L, t], front: [cx - L / 2, cy + D * s, L, t], left: [cx - D * s - t, cy - L / 2, t, L], right: [cx + D * s, cy - L / 2, t, L] }; }
  drawTopdown() {
    if (!this.built) return;
    const { c, W, s, cx, cy } = this.tdGeom(), g = c.getContext('2d');
    g.clearRect(0, 0, W, W); g.fillStyle = '#14120f'; g.fillRect(0, 0, W, W);
    const P = (x, z) => [cx + x * s, cy + z * s];
    // walls
    for (const [w, [x, y, ww, hh]] of Object.entries(this.wallRects())) {
      const on = this.design.walls.includes(w);
      g.fillStyle = on ? '#d8cbb6' : 'rgba(216,203,182,0.06)'; g.fillRect(x, y, ww, hh);
      g.strokeStyle = on ? '#fff' : 'rgba(216,203,182,0.55)'; g.setLineDash(on ? [] : [4, 3]); g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1); g.setLineDash([]);
    }
    // hidden arc shading
    const arc = visibleArc(this.design.walls);
    if (arc.hidden) { g.fillStyle = 'rgba(255,80,80,0.12)'; g.beginPath(); g.moveTo(cx, cy); const R = this.built.shape.Rb * s * 1.1; for (let a = -arc.hidden.half; a <= arc.hidden.half + 1e-6; a += 0.05) { const az = arc.hidden.center + a; g.lineTo(cx + Math.sin(az) * R, cy + Math.cos(az) * R); } g.fill(); }
    // skirt + crown
    if (this.built.skirtR) { g.fillStyle = colorOf(this.design.skirt.color) + '66'; g.beginPath(); g.arc(cx, cy, this.built.skirtR * s, 0, 7); g.fill(); }
    g.strokeStyle = '#3f8f55'; g.fillStyle = 'rgba(47,93,58,0.55)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, this.built.shape.Rb * s, 0, 7); g.fill(); g.stroke();
    for (const r of [0.66, 0.33]) { g.strokeStyle = 'rgba(80,160,100,0.35)'; g.beginPath(); g.arc(cx, cy, this.built.shape.Rb * s * r, 0, 7); g.stroke(); }
    // presents
    for (const p of this.design.presents) { g.save(); g.translate(...P(p.x || 0, p.z || 0)); g.rotate(-(p.rot || 0)); g.fillStyle = (p.paper.c1 || '#a33'); g.strokeStyle = p.ribbon?.color || '#fff'; g.fillRect(-p.w * s / 2, -p.d * s / 2, p.w * s, p.d * s); g.strokeRect(-p.w * s / 2, -p.d * s / 2, p.w * s, p.d * s); g.restore(); }
    // ornaments
    const flo = new Set((this.floating || []).map(f => f.o.id));
    for (const o of this.design.ornaments) { const p = ornamentPos(o, this.built.shape); const [x, y] = P(p.x, p.z); g.fillStyle = o.type === 'custom' ? '#fff' : colorOf(o.color); g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); if (flo.has(o.id)) { g.strokeStyle = '#ff2020'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke(); } }
    // topper
    if (this.design.topper) { g.fillStyle = colorOf(this.design.topper.color); g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillText('★', cx, cy + 5); }
    // viewer
    const phi = this.design.rotation * DEG, vx = cx + Math.sin(phi) * (W * 0.47), vy = cy + Math.cos(phi) * (W * 0.47);
    g.fillStyle = 'rgba(255,227,151,0.18)'; g.beginPath(); g.moveTo(vx, vy); g.lineTo(cx + Math.sin(phi + 0.35) * 30, cy + Math.cos(phi + 0.35) * 30); g.lineTo(cx + Math.sin(phi - 0.35) * 30, cy + Math.cos(phi - 0.35) * 30); g.fill();
    g.fillStyle = '#ffe397'; g.beginPath(); g.arc(vx, vy, 5, 0, 7); g.fill(); g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText('you', vx, vy - 8);
  }
  topdownClick(e) {
    const c = e.target, r = c.getBoundingClientRect(), x = (e.clientX - r.left) * c.width / r.width, y = (e.clientY - r.top) * c.height / r.height;
    for (const [w, [rx, ry, rw, rh]] of Object.entries(this.wallRects())) {
      if (x >= rx - 4 && x <= rx + rw + 4 && y >= ry - 4 && y <= ry + rh + 4) return this.toggleWall(w);
    }
  }
  toggleWall(w) {
    const opp = { back: 'front', front: 'back', left: 'right', right: 'left' };
    this.change(d => {
      if (d.walls.includes(w)) d.walls = d.walls.filter(x => x !== w);
      else { d.walls = d.walls.filter(x => x !== opp[w]); d.walls.push(w); if (d.walls.length > 2) d.walls.shift(); }
    });
    toast(this.design.walls.length === 2 ? 'Corner: rotation limited to 180°' : this.design.walls.length ? 'Against a wall: the back 90° is off-limits' : 'Middle of the room: free rotation');
  }

  // ---------------- auto-decorate ----------------
  async autoDialog() {
    const guess = this.design.walls.length === 2 ? 'corner' : this.design.walls.length === 1 ? 'wall' : 'middle';
    const body = h('div', {},
      h('p', {}, 'Where will the tree stand? Only the parts people can see get decorated.'),
      h('div', { class: 'radios' }, ...[['corner', '📐 In a corner'], ['wall', '🧱 Against a wall'], ['middle', '⭕ Middle of the room']].map(([v, l]) => h('label', {}, h('input', { type: 'radio', name: 'loc', value: v, checked: v === guess }), ' ', l))),
      h('label', { class: 'row' }, 'Theme ', select(THEMES.map(t => ({ value: t.id, label: t.label })), 'classic', () => { }, { name: 'theme' })),
      h('label', { class: 'row' }, 'Ornament density ', h('input', { type: 'range', name: 'density', min: 0.4, max: 1.8, step: 0.1, value: 1 })),
      h('div', { class: 'checks' }, ...[['ornaments', 'Ornaments'], ['lights', 'Lights'], ['garland', 'Garland'], ['tinsel', 'Tinsel'], ['topper', 'Topper'], ['skirt', 'Skirt'], ['presents', 'Presents'], ['customs', 'My custom ornaments']].map(([k, l]) => h('label', {}, h('input', { type: 'checkbox', name: k, checked: k !== 'customs' || customCache.size > 0 }), ' ', l))));
    const v = await ask({ title: 'Decorate for me', body, buttons: [{ label: 'Cancel', value: null }, { label: 'Decorate', primary: true, value: box => ({ location: $('input[name=loc]:checked', box).value, theme: $('[name=theme]', box).value, density: +$('[name=density]', box).value, include: Object.fromEntries($$('.checks input', box).map(i => [i.name, i.checked])) }) }] });
    if (!v) return;
    this.change(d => { autoDecorate(d, v, this.ctx); this.okFloating.clear(); });
    toast(v.location === 'middle' ? 'Decorated all the way around' : 'Decorated the visible side only');
  }

  // ---------------- left panel ----------------
  renderRoomLink() {
    const el = $('.b-room-link', this.root);
    if (!this.roomLink) { el.hidden = true; return; }
    el.hidden = false; el.innerHTML = '';
    el.append(h('span', {}, `🏠 Designing for spot ${this.roomLink.label} in your room · walls guessed from the room model`),
      h('button', { class: 'btn primary', onclick: () => this.app.room.placeDesign(this.roomLink.locId, clone(this.design)) }, 'Show in room →'));
  }
  renderCount() { const c = $('.ocount', this.root); if (c) c.textContent = `${this.design.ornaments.length} ornaments placed`; }
  renderLeft() {
    const tabs = $('.ltabs', this.root), body = $('.lbody', this.root);
    tabs.innerHTML = ''; body.innerHTML = '';
    for (const [id, l] of [['tree', '🌲 Tree'], ['decor', '🎀 Decor'], ['gifts', '🎁 Presents'], ['saved', '💾 Saved']])
      tabs.append(h('button', { class: 'ltab' + (this.leftTab === id ? ' on' : ''), role: 'tab', onclick: () => { this.leftTab = id; this.renderLeft(); } }, l));
    ({ tree: () => this.leftTree(body), decor: () => this.leftDecor(body), gifts: () => this.leftGifts(body), saved: () => this.leftSaved(body) })[this.leftTab]();
  }
  leftTree(body) {
    const d = this.design, sp = treeById(d.species);
    const opt = list => list.map(t => ({ value: t.id, label: t.name }));
    const sel = h('select', { 'aria-label': 'Tree species' }, h('optgroup', { label: 'Real trees' }, opt(SPECIES).map(o => h('option', { value: o.value, selected: o.value === d.species }, o.label))), h('optgroup', { label: 'Artificial trees' }, opt(ARTIFICIAL).map(o => h('option', { value: o.value, selected: o.value === d.species }, o.label))));
    sel.addEventListener('change', () => this.change(x => { x.species = sel.value; }));
    const units = d.units || 'in';
    const hv = units === 'cm' ? Math.round(inchToCm(d.height)) : d.height;
    const hin = h('input', { type: 'number', min: units === 'cm' ? 60 : 24, max: units === 'cm' ? 370 : 144, step: 1, value: hv, 'aria-label': 'Tree height' });
    hin.addEventListener('change', () => { let v = +hin.value; if (units === 'cm') v = cmToInch(v); v = Math.max(24, Math.min(144, v)); this.change(x => { x.height = Math.round(v * 10) / 10; }); });
    const usel = select([{ value: 'in', label: 'inches' }, { value: 'cm', label: 'cm' }], units, v => { d.units = v; this.renderLeft(); });
    const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
    body.append(
      h('div', { class: 'field' }, h('label', {}, 'Tree'), sel, h('button', { class: 'btn small', title: 'New random branch layout', onclick: () => this.change(x => { x.seed = Math.floor(Math.random() * 1e6) + 1; }) }, '🎲 Reshape')),
      h('div', { class: 'field' }, h('label', {}, 'Height'), hin, usel, h('span', { class: 'muted' }, fmtLen(d.height, units === 'cm' ? 'in' : 'cm'))),
      h('div', { class: 'info' },
        h('h2', {}, sp.name), sp.latin ? h('div', { class: 'latin' }, sp.latin) : null,
        h('p', {}, sp.about),
        sp.retention ? h('div', { class: 'ratings' }, h('div', {}, 'Needle retention ', h('b', { class: 'stars' }, stars(sp.retention))), h('div', {}, 'Fragrance ', h('b', { class: 'stars' }, stars(sp.scent))), h('div', {}, 'Branch strength ', h('b', { class: 'stars' }, stars(sp.strength)))) : h('div', { class: 'ratings' }, h('div', {}, 'Branch strength ', h('b', { class: 'stars' }, stars(sp.strength)))),
        h('h4', {}, 'How long it lasts'), h('p', {}, sp.last),
        h('h4', {}, 'Care'), h('ul', {}, sp.care.map(c => h('li', {}, c))),
        h('h4', {}, sp.artificial ? 'How to tell' : 'How to identify it'), h('ul', {}, sp.id_tips.map(c => h('li', {}, c))),
        !sp.artificial ? h('p', { class: 'muted' }, 'All real trees: a stand should hold about 1 quart of water per inch of trunk diameter. Plain tap water is all it needs.') : null));
  }
  leftDecor(body) {
    const d = this.design, sec = (title, open, ...kids) => h('details', { class: 'sec', open: open || null }, h('summary', {}, title), h('div', { class: 'secb' }, ...kids));
    const p = this.pick || {};
    const pickRow = () => {
      const def = ORNAMENTS.find(o => o.id === p.type);
      return h('div', {},
        h('div', { class: 'grid-btns' }, ORNAMENTS.map(o => h('button', { class: 'chip' + (p.type === o.id ? ' on' : ''), onclick: () => { this.pick = { type: o.id, color: o.colors.includes(p.color) ? p.color : o.colors[0], finish: o.finishes.includes(p.finish) ? p.finish : o.finishes[0], size: p.size || 'M' }; this.setTool('place'); this.renderLeft(); } }, o.label))),
        def ? h('div', {}, swatches(def.colors, p.color, c => { this.pick.color = c; }, c => PALETTE[c]),
          h('div', { class: 'field' }, h('label', {}, 'Finish'), select(def.finishes.map(f => ({ value: f, label: f })), p.finish, v => this.pick.finish = v), h('label', {}, 'Size'), select(Object.keys(ORN_SIZES).map(k => ({ value: k, label: `${k} (${ORN_SIZES[k]}″)` })), p.size, v => this.pick.size = v))) : null,
        h('div', { class: 'field' }, h('button', { class: 'btn', onclick: () => this.setTool('place') }, '📍 Click the tree to hang'),
          h('button', { class: 'btn', onclick: () => this.autoPlace(12) }, '✨ Auto-place 12'),
          h('button', { class: 'btn danger small', onclick: () => this.change(x => { x.ornaments = []; }) }, 'Clear all')),
        h('div', { class: 'muted ocount' }, `${d.ornaments.length} ornaments placed`));
    };
    const strandList = kind => h('div', { class: 'strands' }, d.strands.filter(s => s.kind === kind).map(s => h('div', { class: 'strand' }, h('span', {}, kind === 'lights' ? `${LIGHTS.bulbs.find(b => b.id === s.style)?.label} · ${LIGHTS.colors.find(c => c.id === s.color)?.label} · ${LIGHTS.modes.find(m => m.id === s.mode)?.label}` : kind === 'garland' ? `${GARLANDS.find(g => g.id === s.style)?.label} · ${s.color}` : `${s.color} tinsel`),
      kind === 'lights' ? select(LIGHTS.modes, s.mode, v => this.change(x => { x.strands.find(y => y.id === s.id).mode = v; }, { left: false })) : null,
      h('button', { class: 'btn small danger', 'aria-label': 'Remove', onclick: () => this.change(x => { x.strands = x.strands.filter(y => y.id !== s.id); }) }, '✕'))));
    const g = this._g || (this._g = { style: 'beads', color: 'gold', wraps: 4 }), l = this._l || (this._l = { style: 'mini', color: 'multi', mode: 'steady', wraps: 8 }), t = this._t || (this._t = { color: 'silver', amount: 0.6 });
    const tp = this._tp || (this._tp = { type: 'star', color: 'gold' }), sk = this._sk || (this._sk = { style: 'velvet', color: '#a3121f', color2: '#f7f7f2' });
    const customs = [...customCache.values()];
    body.append(
      sec('🔴 Ornaments', true, pickRow()),
      sec('✨ Lights', false,
        h('div', { class: 'field' }, h('label', {}, 'Bulbs'), select(LIGHTS.bulbs, l.style, v => l.style = v), h('label', {}, 'Color'), select(LIGHTS.colors, l.color, v => l.color = v)),
        h('div', { class: 'field' }, h('label', {}, 'Effect'), select(LIGHTS.modes, l.mode, v => l.mode = v), h('label', {}, 'Wraps'), h('input', { type: 'number', min: 2, max: 20, value: l.wraps, onchange: e => l.wraps = +e.target.value })),
        h('button', { class: 'btn', onclick: () => this.change(x => x.strands.push({ id: uid(), kind: 'lights', ...l, seed: Math.floor(Math.random() * 1e5) })) }, '+ Add string of lights'), strandList('lights')),
      sec('〰️ Garland', false,
        h('div', { class: 'field' }, h('label', {}, 'Style'), select(GARLANDS, g.style, v => { g.style = v; g.color = GARLANDS.find(x => x.id === v).colors[0]; this.renderLeft(); }), h('label', {}, 'Swags'), h('input', { type: 'number', min: 1, max: 10, value: g.wraps, onchange: e => g.wraps = +e.target.value })),
        swatches(GARLANDS.find(x => x.id === g.style).colors, g.color, c => g.color = c, c => c === 'plaid' ? 'repeating-linear-gradient(45deg,#a8141f 0 6px,#0c3a1e 6px 12px)' : PALETTE[c]),
        h('button', { class: 'btn', onclick: () => this.change(x => x.strands.push({ id: uid(), kind: 'garland', ...g, seed: Math.floor(Math.random() * 1e5) })) }, '+ Add garland'), strandList('garland')),
      sec('🌟 Tinsel', false,
        swatches(TINSELS, t.color, c => t.color = c, c => c === 'rainbow' ? 'linear-gradient(90deg,red,orange,yellow,green,blue,violet)' : c === 'holo' ? 'linear-gradient(90deg,#9ff,#f9f,#ff9)' : PALETTE[c]),
        h('div', { class: 'field' }, h('label', {}, 'Amount'), h('input', { type: 'range', min: 0.2, max: 1.5, step: 0.1, value: t.amount, oninput: e => t.amount = +e.target.value })),
        h('button', { class: 'btn', onclick: () => this.change(x => x.strands.push({ id: uid(), kind: 'tinsel', ...t, seed: Math.floor(Math.random() * 1e5) })) }, '+ Add tinsel'), strandList('tinsel')),
      sec('❄️ Flocking', false, h('div', { class: 'radios' }, ['None', 'Light', 'Medium', 'Heavy'].map((lab, i) => h('label', {}, h('input', { type: 'radio', name: 'flock', checked: (d.flock || 0) === i, onchange: () => this.change(x => { x.flock = i; }) }), ' ', lab)))),
      sec('⭐ Tree topper', false,
        h('div', { class: 'grid-btns' }, TOPPERS.map(o => h('button', { class: 'chip' + (d.topper?.type === o.id ? ' on' : ''), onclick: () => { tp.type = o.id; tp.color = o.colors[0]; this.change(x => { x.topper = { ...tp }; }); } }, o.label)), h('button', { class: 'chip' + (!d.topper ? ' on' : ''), onclick: () => this.change(x => { x.topper = null; }) }, 'None')),
        d.topper ? swatches(TOPPERS.find(o => o.id === d.topper.type).colors, d.topper.color, c => this.change(x => { x.topper.color = c; }), c => c === 'plaid' ? 'repeating-linear-gradient(45deg,#a8141f 0 6px,#0c3a1e 6px 12px)' : PALETTE[c]) : null),
      sec('🟥 Tree skirt', false,
        h('div', { class: 'grid-btns' }, SKIRTS.map(o => h('button', { class: 'chip' + (d.skirt?.style === o.id ? ' on' : ''), onclick: () => { sk.style = o.id; this.change(x => { x.skirt = { ...sk, ...(x.skirt ? { color: x.skirt.color, color2: x.skirt.color2 } : {}), style: o.id }; }); } }, o.label)), h('button', { class: 'chip' + (!d.skirt ? ' on' : ''), onclick: () => this.change(x => { x.skirt = null; }) }, 'None')),
        d.skirt ? h('div', { class: 'field' }, h('label', {}, 'Color'), h('input', { type: 'color', value: d.skirt.color, onchange: e => this.change(x => { x.skirt.color = e.target.value; }) }), h('label', {}, 'Trim / accent'), h('input', { type: 'color', value: d.skirt.color2 || '#f7f7f2', onchange: e => this.change(x => { x.skirt.color2 = e.target.value; }) })) : null),
      sec('📷 Custom', customs.length > 0,
        customs.length ? h('div', { class: 'grid-btns' }, customs.map(a => h('button', { class: 'chip thumb' + (p.type === 'custom' && p.customId === a.id ? ' on' : ''), onclick: () => { this.pick = { type: 'custom', customId: a.id, color: 'white', finish: 'matte', size: 'M' }; this.setTool('place'); this.renderLeft(); } }, h('img', { src: a.cutout, alt: '' }), a.name))) : h('p', { class: 'muted' }, 'No custom ornaments yet.'),
        h('button', { class: 'btn', onclick: () => this.app.show('ornaments') }, '📷 Import my own ornaments')));
  }
  autoPlace(n) {
    if (!this.pick) return;
    const pts = sampleCanopy(this.built, n, visibleArc(this.design.walls), Math.floor(Math.random() * 1e6), 3);
    this.change(d => { for (const p of pts) d.ornaments.push({ id: uid(), ...this.pick, ...toOrnCoords(p, this.built.shape), spin: Math.random() * 6.28 }); });
  }

  // ---------------- presents ----------------
  leftGifts(body) {
    const d = this.design;
    if (this.giftSel && !d.presents.find(p => p.id === this.giftSel)) this.giftSel = null;
    const cur = d.presents.find(p => p.id === this.giftSel) || d.presents[0];
    const edit = fn => this.change(x => { const p = x.presents.find(q => q.id === cur.id); fn(p); p.x = null; });
    body.append(h('div', { class: 'field' },
      h('button', { class: 'btn', onclick: () => { const p = randomPresent(); this.giftSel = p.id; this.change(x => x.presents.push(p)); } }, '+ Add present'),
      h('button', { class: 'btn', onclick: () => this.change(x => { x.presents = x.presents.map(() => randomPresent()); }) }, '🎲 Randomize all'),
      d.presents.length ? h('button', { class: 'btn danger small', onclick: () => this.change(x => { x.presents = []; }) }, 'Remove all') : null));
    if (!d.presents.length) { body.append(h('p', { class: 'muted' }, 'No presents yet. Add one, or use "Decorate for me".')); return; }
    body.append(h('div', { class: 'giftlist' }, d.presents.map((p, i) => h('button', { class: 'chip' + (p.id === cur.id ? ' on' : ''), onclick: () => { this.giftSel = p.id; this.renderLeft(); } }, `🎁 ${i + 1}`))));
    const sec = (title, open, ...kids) => h('details', { class: 'sec', open: open || null }, h('summary', {}, title), h('div', { class: 'secb' }, ...kids));
    const paperThumb = (pp) => { const c = paperCanvas(pp.id, pp.c1, pp.c2); return c.toDataURL('image/jpeg', 0.6); };
    this._pthumbs = this._pthumbs || Object.fromEntries(PAPERS.map(pp => [pp.id, paperThumb(pp)]));
    const customPapers = [...paperCache.entries()];
    const fileIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; const src = await fileToDataURL(f, 1024); const id = uid(); await idb.put('papers', { id, src }); paperCache.set(id, await loadImage(src)); edit(p => { p.paper = { style: 'custom', imgId: id, c1: '#888', c2: '#888' }; }); toast('Wrapping paper added'); } });
    body.append(
      sec('📦 Box size', true, h('div', { class: 'grid-btns' }, BOXES.map(b => h('button', { class: 'chip' + (cur.box === b.id ? ' on' : ''), onclick: () => edit(p => Object.assign(p, { box: b.id, w: b.w, d: b.d, h: b.h })) }, `${b.label} ${b.w}×${b.d}×${b.h}″`)), h('button', { class: 'chip', onclick: () => { const b = BOXES[Math.floor(Math.random() * BOXES.length)]; edit(p => Object.assign(p, { box: b.id, w: b.w, d: b.d, h: b.h })); } }, '🎲 Random')),
        h('div', { class: 'field' }, ...['w', 'd', 'h'].map(k => [h('label', {}, { w: 'W', d: 'D', h: 'H' }[k]), h('input', { type: 'number', min: 1, max: 48, step: 0.5, value: cur[k], class: 'num', onchange: e => edit(p => { p[k] = +e.target.value; p.box = 'custom'; }) })]).flat())),
      sec('🧻 Wrapping paper', true,
        h('div', { class: 'papers' }, PAPERS.map(pp => h('button', { class: 'paper' + (cur.paper.style === pp.id ? ' on' : ''), title: pp.label, onclick: () => edit(p => { p.paper = { style: pp.id, c1: pp.c1, c2: pp.c2 }; }) }, h('img', { src: this._pthumbs[pp.id], alt: '' }), h('span', {}, pp.label))),
          customPapers.map(([id, img]) => h('button', { class: 'paper' + (cur.paper.imgId === id ? ' on' : ''), onclick: () => edit(p => { p.paper = { style: 'custom', imgId: id, c1: '#888', c2: '#888' }; }) }, h('img', { src: img.src, alt: '' }), h('span', {}, 'My paper')))),
        cur.paper.style !== 'custom' ? h('div', { class: 'field' }, h('label', {}, 'Colors'), h('input', { type: 'color', value: cur.paper.c1, onchange: e => edit(p => { p.paper.c1 = e.target.value; }) }), h('input', { type: 'color', value: cur.paper.c2, onchange: e => edit(p => { p.paper.c2 = e.target.value; }) })) : null,
        h('button', { class: 'btn', onclick: () => fileIn.click() }, '📷 Photo of my wrapping paper'), fileIn),
      sec('🎀 Ribbon & bow', false,
        h('div', { class: 'field' }, h('label', {}, 'Ribbon'), select(RIBBONS, cur.ribbon?.style || 'none', v => edit(p => { p.ribbon = { ...(p.ribbon || {}), style: v }; }))),
        swatches(RIBBON_COLORS, cur.ribbon?.color, c => edit(p => { p.ribbon = { ...(p.ribbon || { style: 'cross' }), color: c }; })),
        h('div', { class: 'field' }, h('label', {}, 'Bow'), select(BOWS, cur.bow?.style || 'none', v => edit(p => { p.bow = { ...(p.bow || {}), style: v }; }))),
        swatches(RIBBON_COLORS, cur.bow?.color, c => edit(p => { p.bow = { ...(p.bow || { style: 'loopy' }), color: c }; }))),
      sec('✉️ Cards & tags', false,
        h('div', { class: 'field' }, h('label', {}, 'Card'), select(CARDS, cur.card?.type || 'none', v => edit(p => { p.card = { color: '#f5f0e0', to: '', from: '', ...(p.card || {}), type: v }; })), h('label', {}, 'Color'), h('input', { type: 'color', value: cur.card?.color || '#f5f0e0', onchange: e => edit(p => { p.card = { type: 'tag', ...(p.card || {}), color: e.target.value }; }) })),
        h('div', { class: 'field' }, h('label', {}, 'To'), h('input', { type: 'text', maxlength: 16, value: cur.card?.to || '', onchange: e => edit(p => { p.card = { type: 'tag', color: '#f5f0e0', ...(p.card || {}), to: e.target.value }; }) }), h('label', {}, 'From'), h('input', { type: 'text', maxlength: 16, value: cur.card?.from || '', onchange: e => edit(p => { p.card = { type: 'tag', color: '#f5f0e0', ...(p.card || {}), from: e.target.value }; }) }))),
      h('button', { class: 'btn danger small', onclick: () => this.change(x => { x.presents = x.presents.filter(p => p.id !== cur.id); }) }, 'Remove this present'));
  }

  // ---------------- saved ideas ----------------
  leftSaved(body) {
    const name = h('input', { type: 'text', placeholder: 'Name this tree idea', value: this.design.name || '', maxlength: 60 });
    body.append(h('div', { class: 'field' }, name, h('button', { class: 'btn primary', onclick: () => this.save(name.value) }, '💾 Save')),
      h('div', { class: 'field' }, h('button', { class: 'btn', onclick: () => this.setDesign(newDesign({ walls: this.design.walls, height: this.design.height }), this.roomLink) }, '🌲 New bare tree')));
    const list = designs.list();
    if (!list.length) body.append(h('p', { class: 'muted' }, 'Saved tree ideas appear here.'));
    for (const s of list) body.append(h('div', { class: 'saved' },
      h('div', {}, h('b', {}, s.name || 'Untitled'), h('div', { class: 'muted' }, `${treeById(s.species).name} · ${fmtLen(s.height, s.units)} · ${s.ornaments.length} ornaments · ${new Date(s.saved).toLocaleDateString()}`)),
      h('div', { class: 'btns' }, h('button', { class: 'btn small', onclick: () => { this.setDesign(s, this.roomLink); toast(`Loaded "${s.name}"`); } }, 'Open'),
        h('button', { class: 'btn small', onclick: () => { const n = prompt('Rename tree idea', s.name); if (n) { designs.save({ ...s, name: n }); this.renderLeft(); } } }, 'Rename'),
        h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDel(s.name || 'this tree idea')) { designs.remove(s.id); this.renderLeft(); } } }, 'Delete'))));
  }
  save(name) {
    name = (name || '').trim(); if (!name) return toast('Give it a name first');
    const existing = designs.list().find(x => x.name === name && x.id !== this.design.id);
    if (existing && !confirm(`Replace the saved idea "${name}"?`)) return;
    if (existing) designs.remove(existing.id);
    this.design.name = name; designs.save(clone(this.design)); toast(`Saved "${name}"`); this.renderLeft();
  }
}
