// Ornament Importer: photo -> background removed -> sized from US currency -> simple 3D model.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CURRENCY, currencySize } from './data.js';
import { removeBackground, distanceField } from './segment.js';
import { buildCustomMesh } from './custommodel.js';
import { idb, uid, fileToDataURL, loadImage, loadCustoms, customCache } from './store.js';
import { $, $$, h, ask, toast, select, confirmDel, esc, fmtLen } from './ui.js';

// Each "No, try again" moves to the next combination of segmentation and model.
const ATTEMPTS = [
  { method: 'lab', thresh: 1, keepHoles: false, model: 'auto', note: 'colour difference from the background' },
  { method: 'chroma', thresh: 1, keepHoles: false, model: 'alt', note: 'ignoring shadows (hue only)' },
  { method: 'gmm', thresh: 1, keepHoles: true, model: 'lathe', note: 'learned ornament vs background colours, round model' },
  { method: 'edge', thresh: 1, keepHoles: true, model: 'inflate', note: 'edges plus colour, puffy model' },
  { method: 'lab', thresh: 1.4, keepHoles: false, model: 'flat', note: 'stricter cut, flat model' },
  { method: 'chroma', thresh: 0.7, keepHoles: false, model: 'lathe', note: 'looser cut, round model' },
];
const PROC = 560;

export class Importer {
  constructor(root, app) {
    this.app = app; this.root = root; this.cur = null;
    root.innerHTML = `
      <div class="i-main">
        <div class="i-stage">
          <div class="i-pane"><div class="pt">Photo</div><canvas class="src"></canvas><div class="i-empty">
            <h2>Photograph an ornament</h2>
            <ol><li>Lay it on a <b>solid background</b>: a blank sheet of paper, a solid-color sheet, or even a solid-color t-shirt.</li>
            <li><b>For best sizing results, place US currency on the background near the ornament.</b> A bill or a coin, not touching it.</li>
            <li>Shoot from straight above, in even light.</li></ol>
            <div class="btns"><label class="btn primary">📷 Take a photo<input type="file" accept="image/*" capture="environment" hidden data-in="orn"></label><label class="btn">🖼 Choose a photo<input type="file" accept="image/*" hidden data-in="orn"></label><button class="btn" data-act="sample">Try a sample</button></div>
          </div></div>
          <div class="i-pane"><div class="pt">Cut out</div><canvas class="cut"></canvas></div>
          <div class="i-pane"><div class="pt">3D model</div><canvas class="prev"></canvas></div>
        </div>
        <div class="i-ask"></div>
      </div>
      <div class="i-lib"></div>`;
    root.addEventListener('change', async e => { if (e.target.dataset.in !== 'orn') return; const f = e.target.files[0]; e.target.value = ''; if (!f) return; const src = await fileToDataURL(f, 1600); this.newSource(src); });
    root.addEventListener('click', e => { if (e.target.closest('[data-act=sample]')) this.newSource(sampleOrnament()); });
    this.init3d(); this.renderLib();
  }
  init3d() {
    const c = $('.prev', this.root);
    this.r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(2, devicePixelRatio)); this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.s = new THREE.Scene(); this.s.environment = new THREE.PMREMGenerator(this.r).fromScene(new RoomEnvironment(), 0.04).texture; this.s.environmentIntensity = 0.6;
    this.s.add(new THREE.HemisphereLight('#fff', '#443', 1.3)); const d = new THREE.DirectionalLight('#fff', 1.2); d.position.set(3, 5, 6); this.s.add(d);
    this.cam = new THREE.PerspectiveCamera(35, 1, 0.1, 200); this.holder = new THREE.Group(); this.s.add(this.holder);
    const tick = t => { requestAnimationFrame(tick); if (this.app.tab !== 'ornaments') return; const w = c.clientWidth, hh = c.clientHeight; if (w && c.width !== Math.round(w * this.r.getPixelRatio())) { this.r.setSize(w, hh, false); this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); } this.holder.rotation.y = t / 1400; this.r.render(this.s, this.cam); };
    requestAnimationFrame(tick);
  }

  async newSource(src) {
    const id = uid(); await idb.put('sources', { id, src, created: Date.now() });
    this.renderLib(); this.start(id, src);
  }
  async start(sourceId, src) {
    const img = await loadImage(src);
    const s = Math.min(1, PROC / Math.max(img.width, img.height)), w = Math.round(img.width * s), hh = Math.round(img.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, hh);
    this.cur = { sourceId, img, w, h: hh, data: g.getImageData(0, 0, w, hh), canvas: c, attempt: 0, denom: undefined, manualSize: null };
    $('.i-empty', this.root).hidden = true;
    const sc = $('.src', this.root); sc.width = w; sc.height = hh; sc.getContext('2d').drawImage(c, 0, 0);
    this.run();
  }
  async run() {
    const cur = this.cur, A = ATTEMPTS[cur.attempt % ATTEMPTS.length];
    this.say(h('p', {}, `⏳ Removing the background (attempt ${cur.attempt + 1}: ${A.note})…`));
    await new Promise(r => setTimeout(r, 30));
    const seg = removeBackground(cur.data, A);
    if (!seg.orn) { this.say(h('p', {}, "Couldn't find the ornament. Try a plainer background, more light, or another attempt."), this.btns(true)); return; }
    cur.seg = seg;
    // currency: ask once what was placed
    if (cur.denom === undefined) {
      if (seg.currency) {
        const what = seg.currency.kind === 'bill' ? 'a bill' : 'a coin';
        cur.denom = await this.askDenom(`I found something that looks like ${what} next to the ornament. What did you place?`, seg.currency.kind);
      } else {
        cur.denom = null;
        toast('For best sizing results, place US currency on the background near the ornament.', 4200);
      }
    }
    this.highlightCurrency(seg);
    const asset = this.makeAsset(seg, A);
    cur.asset = asset;
    this.showCut(asset); this.showModel(asset);
    const sizeNote = asset.sizedBy === 'currency' ? `Sized from the ${asset.sizeLabel}: about ${fmtLen(asset.heightIn)} tall × ${fmtLen(asset.widthIn)} wide.` : `No currency to measure against, so the size is a guess (${fmtLen(asset.heightIn)} tall). Set it below, or retake the photo with a bill or coin beside the ornament.`;
    const sizeIn = h('input', { type: 'number', min: 0.5, max: 24, step: 0.1, value: asset.heightIn.toFixed(1), class: 'num', onchange: e => { cur.manualSize = +e.target.value; this.run(); } });
    this.say(h('p', {}, `Model: ${asset.model === 'lathe' ? 'round (turned around its axis)' : asset.model === 'inflate' ? 'puffy cut-out' : 'flat cut-out'} · ${sizeNote}`),
      asset.sizedBy !== 'currency' ? h('div', { class: 'field' }, h('label', {}, 'Height in inches'), sizeIn, seg.currency || cur.denom === null ? h('button', { class: 'btn small', onclick: async () => { cur.denom = await this.askDenom('What US currency is in the photo?', seg.currency?.kind); this.run(); } }, '💵 I did place currency') : null) : null,
      h('p', { class: 'q' }, 'Does this look right?'), this.btns(false));
  }
  async askDenom(msg, kind) {
    const opts = [...CURRENCY.bills.map(b => ({ value: b.id, label: b.label })), ...CURRENCY.coins.map(c => ({ value: c.id, label: c.label })), { value: '', label: "That's not currency" }];
    return ask({ title: 'Currency for scale', body: h('div', {}, h('p', {}, msg), h('label', { class: 'row' }, 'Placed: ', select(opts, kind === 'coin' ? 'quarter' : 'b1', () => { }, { name: 'd' }))), buttons: [{ label: 'OK', primary: true, value: b => $('[name=d]', b).value || null }], dismiss: null });
  }
  btns(failed) {
    return h('div', { class: 'field' },
      !failed ? h('button', { class: 'btn primary', onclick: () => this.accept() }, '✅ Yes, save it') : null,
      h('button', { class: 'btn', onclick: () => { this.cur.attempt++; this.run(); } }, '🔁 No, try a different way'),
      h('button', { class: 'btn', onclick: () => this.cancel() }, 'Cancel'));
  }
  say(...nodes) { const a = $('.i-ask', this.root); a.innerHTML = ''; a.append(...nodes.filter(Boolean)); }
  cancel() { this.cur = null; this.say(h('p', { class: 'muted' }, 'Cancelled. The photo is kept under "Source photos" until you delete it.')); this.holder.clear(); $('.cut', this.root).getContext('2d').clearRect(0, 0, 9999, 9999); $('.i-empty', this.root).hidden = false; }

  makeAsset(seg, A) {
    const { w, mask, orn } = seg, cur = this.cur;
    const bx0 = orn.x0, by0 = orn.y0, bw = orn.x1 - orn.x0 + 1, bh = orn.y1 - orn.y0 + 1;
    // pixels per inch from currency
    let ppi = null, sizeLabel = '';
    const cs = currencySize(cur.denom);
    if (cs && seg.currency) {
      if (cs.kind === 'bill' && seg.currency.kind === 'bill') ppi = (seg.currency.longPx / cs.long + seg.currency.shortPx / cs.short) / 2;
      else if (cs.kind === 'coin' && seg.currency.kind === 'coin') ppi = seg.currency.diamPx / cs.d;
      else if (cs.kind === 'coin') ppi = Math.sqrt(seg.currency.comp.area / Math.PI) * 2 / cs.d;
      else ppi = Math.sqrt(seg.currency.comp.area / (cs.long * cs.short));
      sizeLabel = (CURRENCY.bills.concat(CURRENCY.coins).find(x => x.id === cur.denom)?.label || 'currency').toLowerCase();
    }
    let heightIn, widthIn, sizedBy;
    if (cur.manualSize) { heightIn = cur.manualSize; widthIn = heightIn * bw / bh; sizedBy = 'manual'; }
    else if (ppi) { heightIn = bh / ppi; widthIn = bw / ppi; sizedBy = 'currency'; }
    else { heightIn = 3.5 * bh / Math.max(bw, bh); widthIn = 3.5 * bw / Math.max(bw, bh); sizedBy = 'guess'; }
    // symmetry -> model choice
    let inter = 0, uni = 0; const ax = orn.cx;
    for (let y = orn.y0; y <= orn.y1; y++) for (let x = orn.x0; x <= orn.x1; x++) { const a = mask[y * w + x], mx = Math.round(2 * ax - x), b = mx >= 0 && mx < w ? mask[y * w + mx] : 0; if (a && b) inter++; if (a || b) uni++; }
    const sym = inter / Math.max(1, uni);
    let model = A.model;
    const auto = sym > 0.82 ? 'lathe' : 'inflate';
    if (model === 'auto') model = auto; else if (model === 'alt') model = auto === 'lathe' ? 'inflate' : 'lathe';
    // lathe profile
    const rows = 48, profile = [];
    for (let i = 0; i < rows; i++) { const y = Math.min(orn.y1, Math.round(by0 + (i + 0.5) / rows * bh)); let l = -1, r = -1; for (let x = orn.x0; x <= orn.x1; x++) if (mask[y * w + x]) { if (l < 0) l = x; r = x; } profile.push(l < 0 ? 0.02 : Math.max(0.02, (r - l + 1) / bw)); }
    // cut-out texture (feathered alpha) and inflate field
    const pad = 2, cw = bw + pad * 2, ch = bh + pad * 2, cc = document.createElement('canvas'); cc.width = cw; cc.height = ch;
    const g = cc.getContext('2d'), out = g.createImageData(cw, ch), src = cur.data.data;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const sx = bx0 - pad + x, sy = by0 - pad + y, o = (y * cw + x) * 4; if (sx < 0 || sy < 0 || sx >= w || sy >= seg.h) continue;
      let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = sx + dx, yy = sy + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < seg.h && mask[yy * w + xx]) a++; }
      const i = (sy * w + sx) * 4; out.data[o] = src[i]; out.data[o + 1] = src[i + 1]; out.data[o + 2] = src[i + 2]; out.data[o + 3] = Math.round(a / 9 * 255);
    }
    g.putImageData(out, 0, 0);
    let field = null;
    if (model === 'inflate') {
      const local = new Uint8Array(bw * bh); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) local[y * bw + x] = mask[(by0 + y) * w + bx0 + x];
      const df = distanceField(local, bw, bh), G = 40, data = [];
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) data.push(+df[Math.min(bh - 1, Math.round(j / (G - 1) * (bh - 1))) * bw + Math.min(bw - 1, Math.round(i / (G - 1) * (bw - 1)))].toFixed(3));
      field = { w: G, h: G, data };
    }
    return { model, heightIn, widthIn, profile, field, cutoutCanvas: cc, cutout: cc.toDataURL('image/png'), sizedBy, sizeLabel, sym, attempt: cur.attempt };
  }
  highlightCurrency(seg) {
    const c = $('.src', this.root), g = c.getContext('2d'); g.drawImage(this.cur.canvas, 0, 0);
    g.lineWidth = 3; g.strokeStyle = '#5fd17e'; const o = seg.orn; g.strokeRect(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0);
    if (seg.currency) { const k = seg.currency.comp; g.strokeStyle = '#ffe397'; g.strokeRect(k.x0, k.y0, k.x1 - k.x0, k.y1 - k.y0); g.fillStyle = '#ffe397'; g.font = 'bold 16px system-ui'; g.fillText(seg.currency.kind === 'bill' ? '$ bill' : '¢ coin', k.x0, k.y0 - 6); }
  }
  showCut(asset) {
    const c = $('.cut', this.root), cc = asset.cutoutCanvas; c.width = cc.width; c.height = cc.height; const g = c.getContext('2d');
    for (let y = 0; y < c.height; y += 12) for (let x = 0; x < c.width; x += 12) { g.fillStyle = ((x + y) / 12) % 2 ? '#2a2622' : '#3a3530'; g.fillRect(x, y, 12, 12); }
    g.drawImage(cc, 0, 0);
  }
  showModel(asset) {
    const a = { ...asset, _img: asset.cutoutCanvas }; this.holder.clear();
    const m = buildCustomMesh(a); const s = 1 / Math.max(asset.heightIn, asset.widthIn); m.scale.setScalar(s * 2); m.position.y = 1;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), new THREE.MeshStandardMaterial({ color: '#c9a548', metalness: 1, roughness: 0.3 })); cap.position.y = 1.03;
    this.holder.add(m, cap); this.cam.position.set(0, 0.2, 4.6); this.cam.lookAt(0, 0, 0);
  }
  async accept() {
    const a = this.cur.asset; if (!a) return;
    const name = await ask({ title: 'Name this ornament', body: h('div', {}, h('input', { type: 'text', name: 'n', value: `My ornament ${customCache.size + 1}`, maxlength: 40 })), buttons: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, value: b => $('[name=n]', b).value.trim() || 'My ornament' }] });
    if (!name) return;
    const rec = { id: uid(), name, created: Date.now(), model: a.model, heightIn: +a.heightIn.toFixed(2), widthIn: +a.widthIn.toFixed(2), profile: a.profile, field: a.field, cutout: a.cutout, sourceId: this.cur.sourceId };
    await idb.put('customs', rec); await loadCustoms();
    toast(`Saved "${name}" to the Builder's Custom ornaments`);
    this.say(h('p', {}, `✅ "${esc(name)}" is in the Tree Builder under Decor › Custom.`), h('div', { class: 'field' }, h('button', { class: 'btn primary', onclick: () => { this.app.builder.leftTab = 'decor'; this.app.builder.pick = { type: 'custom', customId: rec.id, color: 'white', finish: 'matte', size: 'M' }; this.app.builder.renderLeft(); this.app.show('builder'); } }, 'Hang it on the tree →'), h('label', { class: 'btn' }, '📷 Another ornament', h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'data-in': 'orn' }))));
    this.renderLib(); this.app.builder.renderLeft();
  }
  async renderLib() {
    const lib = $('.i-lib', this.root); lib.innerHTML = '';
    const customs = await idb.all('customs').catch(() => []), sources = await idb.all('sources').catch(() => []);
    lib.append(h('h3', {}, `Custom ornaments (${customs.length})`));
    if (!customs.length) lib.append(h('p', { class: 'muted' }, 'Ornaments you save appear here and in the Builder.'));
    lib.append(h('div', { class: 'cards' }, customs.sort((a, b) => b.created - a.created).map(c => h('div', { class: 'card' }, h('img', { src: c.cutout, alt: c.name }), h('div', {}, h('b', {}, c.name), h('div', { class: 'muted' }, `${fmtLen(c.heightIn)} · ${c.model}`)),
      h('button', { class: 'btn small danger', onclick: async () => { if (!(await confirmDel(c.name))) return; await idb.del('customs', c.id); await loadCustoms(); this.app.builder.rebuild(); this.app.builder.renderLeft(); this.renderLib(); toast('Deleted'); } }, 'Delete')))));
    lib.append(h('h3', {}, `Source photos (${sources.length})`), h('p', { class: 'muted' }, 'Kept until you delete them, so you can process them again.'));
    lib.append(h('div', { class: 'cards' }, sources.sort((a, b) => b.created - a.created).map(s => h('div', { class: 'card' }, h('img', { src: s.src, alt: 'Source photo' }), h('div', { class: 'muted' }, new Date(s.created).toLocaleString()),
      h('div', { class: 'btns' }, h('button', { class: 'btn small', onclick: () => this.start(s.id, s.src) }, 'Process'), h('button', { class: 'btn small danger', onclick: async () => { if (!(await confirmDel('this source photo'))) return; await idb.del('sources', s.id); this.renderLib(); toast('Photo deleted'); } }, 'Delete'))))));
  }
}

// A drawn test photo: red glass ball on white paper with a $1 bill beside it.
function sampleOrnament() {
  const W = 1200, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#f4f2ee'); bg.addColorStop(1, '#e4e1da'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const ppi = 70; // the ball is 3.2 in across
  const bx = 430, by = 470, R = 1.6 * ppi;
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(bx + 14, by + 18, R * 1.02, R * 0.98, 0, 0, 7); g.fill();
  const rg = g.createRadialGradient(bx - R * 0.35, by - R * 0.4, R * 0.08, bx, by, R); rg.addColorStop(0, '#ff9aa4'); rg.addColorStop(0.25, '#d61f33'); rg.addColorStop(1, '#5e0712'); g.fillStyle = rg; g.beginPath(); g.arc(bx, by, R, 0, 7); g.fill();
  g.fillStyle = '#c9a548'; g.fillRect(bx - 0.28 * ppi, by - R - 0.35 * ppi, 0.56 * ppi, 0.4 * ppi); g.strokeStyle = '#999'; g.lineWidth = 4; g.beginPath(); g.arc(bx, by - R - 0.45 * ppi, 0.15 * ppi, 0, 7); g.stroke();
  // bill 6.14 x 2.61 in
  const bw = 6.14 * ppi, bh = 2.61 * ppi, x0 = 700, y0 = 560;
  g.fillStyle = '#c9d2b8'; g.fillRect(x0, y0, bw, bh); g.strokeStyle = '#6f7d5c'; g.lineWidth = 6; g.strokeRect(x0 + 10, y0 + 10, bw - 20, bh - 20);
  g.fillStyle = '#7d8a6a'; g.beginPath(); g.ellipse(x0 + bw / 2, y0 + bh / 2, 46, 58, 0, 0, 7); g.fill(); g.font = 'bold 40px serif'; g.fillText('1', x0 + 24, y0 + 52); g.fillText('1', x0 + bw - 46, y0 + bh - 24);
  return c.toDataURL('image/jpeg', 0.92);
}
