// Augmented Treality: build a Christmas tree, then stand it in your living room.
import * as THREE from 'three';
import { View } from './view.js';
import { TreeModel } from './build.js';
import { SPECIES } from './tree.js';
import {
  ORNAMENTS, ORN_COLORS, FINISHES, LIGHT_STYLES, LIGHT_MODES, DENSITY_LABELS, GARLANDS, TOPPERS, STANDS, SKIRTS, TWINKLE, MODE_INDEX,
} from './decor.js';
import { defaultDesign, autoDecorate, addGift, THEMES, FT, loadAll, saveAll, encodeDesign, decodeDesign, clone } from './design.js';
import { arSupport, openQuickLook, openNative, XRSession, isNative } from './ar.js';
import { toGLB, toUSDZ } from './export.js';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};

const store = loadAll();
let design = store.current ? migrate(store.current) : starterDesign();
const undo = [];
let tab = 'tree';
const tool = { type: 'bauble', color: '#b3121f', finish: 'gloss', size: 1, remove: false, theme: 'classic' };
let support = null;
let xr = null;

function starterDesign() {
  const d = defaultDesign();
  autoDecorate(d, 'classic', 1225);
  for (let i = 0; i < 5; i++) addGift(d, 40 + i * 7);
  d.name = 'My tree';
  return d;
}
function migrate(d) { const base = defaultDesign(); return { ...base, ...d, tree: { ...base.tree, ...d.tree }, base: { ...base.base, ...d.base }, lights: { ...base.lights, ...d.lights }, garland: { ...base.garland, ...d.garland } }; }

// ---------------------------------------------------------------- 3D
const view = new View($('#c'));
const model = new TreeModel({ live: true });
view.setModel(model);

function rebuild(reframe = false) {
  model.update(design);
  if (reframe) view.frame(model.totalHeight, model.info.R0, !rebuild.done);
  rebuild.done = true;
  readout();
  persist();
}

let lastFrameKey = '';
function change(fn, { reframe = false, record = true } = {}) {
  if (record) { undo.push(JSON.stringify(design)); if (undo.length > 60) undo.shift(); }
  fn(design);
  const fk = JSON.stringify([design.tree.height, design.tree.width, design.tree.species, design.topper]);
  rebuild(reframe || fk !== lastFrameKey);
  lastFrameKey = fk;
  $('#undo').disabled = !undo.length;
}
lastFrameKey = JSON.stringify([design.tree.height, design.tree.width, design.tree.species, design.topper]);

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { store.current = design; saveAll(store); }, 300);
  prewarm();
}

// Safari only opens Quick Look straight from a tap, so on iPhones the USDZ is built ahead
// of time, a couple of seconds after the last change, and the AR button can open it at once.
let usdz = null, warmTimer = 0;
function prewarm() {
  if (!support?.quicklook || support.webxr || support.native) return;
  clearTimeout(warmTimer);
  const key = JSON.stringify(design);
  if (usdz?.key === key) return;
  warmTimer = setTimeout(async () => {
    try { const { blob } = await toUSDZ(clone(design)); if (JSON.stringify(design) === key) usdz = { key, blob }; } catch (e) { console.warn(e); }
  }, 1800);
}

function ftIn(m) { const inches = Math.round(m / FT * 12); return `${Math.floor(inches / 12)}′${inches % 12 ? (inches % 12) + '″' : ''}`; }
function readout() {
  const H = design.tree.height, total = model.totalHeight, w = model.info.R0 * 2;
  const text = `${ftIn(H)} tree · ${ftIn(total)} to the top of the topper · ${w.toFixed(1)} m wide`;
  $('#readout').textContent = text;
  const r2 = $('#readout2'); if (r2) r2.textContent = text;
}

// ---------------------------------------------------------------- tapping the tree
view.onTap = ndc => {
  if (tab === 'ornaments') {
    if (tool.remove) {
      const hit = view.pick(ndc, model.ornGroup.children)[0];
      if (!hit) return toast('Tap an ornament to take it off.');
      let o = hit.object; while (o.parent !== model.ornGroup) o = o.parent;
      const i = o.userData.index;
      change(d => d.ornaments.splice(i, 1));
      return;
    }
    // Hang on the outline where you tapped, unless an ornament is already right there.
    const hit = view.pick(ndc, [model.envelope], false)[0];
    if (!hit) return toast('Tap on the tree itself.');
    const p = hit.point, info = model.info;
    const f = (p.y - info.yb) / (info.H - info.yb);
    if (f < 0 || f > 0.97) return toast(f < 0 ? 'Too low: that\'s the stand.' : 'Save the very top for the topper.');
    const o = { t: tool.type, c: tool.color, f: tool.finish, y: f, a: Math.atan2(p.z, p.x), d: 0.95, s: tool.size, seed: Math.random() };
    change(d => d.ornaments.push(o));
    navigator.vibrate?.(8);
  } else if (tab === 'gifts') {
    const hit = view.pick(ndc, model.parts.gifts?.children || [])[0];
    if (!hit) return;
    let o = hit.object; while (o.parent !== model.parts.gifts) o = o.parent;
    const i = model.parts.gifts.children.indexOf(o);
    change(d => d.gifts.splice(i, 1));
  }
};

// ---------------------------------------------------------------- panels
const TABS = {
  tree: { label: 'Tree', icon: '🌲', render: treePanel, hint: () => 'Pick a tree. Drag to look around.' },
  lights: { label: 'Lights', icon: '💡', render: lightsPanel, hint: () => 'Tip: dim the room to see them properly.' },
  garland: { label: 'Garland', icon: '✨', render: garlandPanel, hint: () => '' },
  ornaments: { label: 'Ornaments', icon: '🔴', render: ornamentPanel, hint: () => tool.remove ? 'Tap an ornament to take it off.' : `Tap the tree to hang a ${ORNAMENTS[tool.type].label.toLowerCase()}.` },
  topper: { label: 'Topper', icon: '⭐', render: topperPanel, hint: () => '' },
  gifts: { label: 'Gifts', icon: '🎁', render: giftsPanel, hint: () => design.gifts.length ? 'Tap a present to return it.' : 'Nobody has bought you anything yet.' },
};

function renderTabs() {
  const nav = $('#tabs'); nav.replaceChildren();
  for (const [k, t] of Object.entries(TABS)) {
    nav.append(el('button', { class: 'tab' + (k === tab ? ' on' : ''), 'aria-pressed': k === tab, onclick: () => { tab = k; renderTabs(); renderPanel(); } }, el('span', { class: 'ti' }, t.icon), el('span', { class: 'tl' }, t.label)));
  }
}
function renderPanel() {
  const p = $('#panel'); p.replaceChildren(...[TABS[tab].render()].flat());
  hint();
}
function hint() { const h = TABS[tab].hint(); $('#hint').textContent = h; $('#hint').hidden = !h; }

const section = (title, ...kids) => el('div', { class: 'sec' }, title ? el('h3', {}, title) : null, ...kids);
function chips(options, current, onPick, { cls = '', render } = {}) {
  return el('div', { class: 'chips ' + cls }, Object.entries(options).map(([k, v]) =>
    el('button', { class: 'chip' + (k === current ? ' on' : ''), 'aria-pressed': k === current, onclick: () => onPick(k) }, render ? render(k, v) : (typeof v === 'string' ? v : v.label))));
}
function slider({ min, max, step, value, onInput, label }) {
  const out = el('span', { class: 'val' }, label(value));
  const input = el('input', { type: 'range', min, max, step, value });
  let pending = false;
  input.addEventListener('input', () => { out.textContent = label(+input.value); });
  input.addEventListener('change', () => onInput(+input.value));
  // Live-update on drag for cheap changes, but rebuilding a tree on every pixel is too much on a phone.
  input.addEventListener('pointerdown', () => { pending = true; });
  return el('label', { class: 'slider' }, input, out);
}

function treePanel() {
  const t = design.tree;
  return [
    section('Kind of tree', el('div', { class: 'species' }, Object.entries(SPECIES).map(([k, sp]) =>
      el('button', { class: 'sp' + (k === t.species ? ' on' : ''), onclick: () => { change(d => d.tree.species = k); renderPanel(); } },
        el('span', { class: 'sw sw-' + k }), el('b', {}, sp.label), el('small', {}, sp.note))))),
    section('Height', slider({ min: 3, max: 12, step: 0.5, value: Math.round(t.height / FT * 2) / 2, label: v => `${v} ft (${(v * FT).toFixed(2)} m)`, onInput: v => change(d => d.tree.height = v * FT) }),
      el('p', { class: 'muted small', id: 'readout2' }, $('#readout').textContent)),
    section('Shape',
      el('div', { class: 'row2' },
        el('div', {}, el('small', {}, 'Width'), slider({ min: 0.75, max: 1.3, step: 0.05, value: t.width, label: v => v < 0.9 ? 'Slim' : v > 1.12 ? 'Wide' : 'Standard', onInput: v => change(d => d.tree.width = v) })),
        el('div', {}, el('small', {}, 'Fullness'), slider({ min: 0.5, max: 1.5, step: 0.1, value: t.fullness, label: v => v < 0.8 ? 'Sparse' : v > 1.2 ? 'Bushy' : 'Full', onInput: v => change(d => d.tree.fullness = v) }))),
      el('button', { class: 'btn', onclick: () => change(d => d.tree.seed = (d.tree.seed % 999) + 1) }, '🎲 Pick a different one off the lot')),
    section('Stand', chips(STANDS, design.base.stand, k => { change(d => d.base.stand = k); renderPanel(); })),
    section('Tree skirt', chips(SKIRTS, design.base.skirt, k => { change(d => d.base.skirt = k); renderPanel(); })),
  ];
}

function lightsPanel() {
  const L = design.lights;
  const dens = [0.5, 1, 2, 3.2];
  const di = dens.reduce((b, v, i) => Math.abs(v - L.density) < Math.abs(dens[b] - L.density) ? i : b, 0);
  return [
    section('String', chips(LIGHT_STYLES, L.style, k => { change(d => d.lights.style = k); renderPanel(); }, {
      render: (k, v) => [el('span', { class: 'dots' }, v.colors.slice(0, 4).map(c => el('i', { style: `background:${c};box-shadow:0 0 6px ${c}` }))), v.label],
    })),
    L.style === 'none' ? null : section('How many', slider({ min: 0, max: 3, step: 1, value: di, label: v => `${DENSITY_LABELS[v]} · ${Math.round((LIGHT_STYLES[L.style].bulb === 'c9' ? 14 : 100) * dens[v] * design.tree.height / FT)} bulbs`, onInput: v => change(d => d.lights.density = dens[v]) })),
    L.style === 'none' ? null : section('Mode', chips(LIGHT_MODES, L.mode, k => { change(d => d.lights.mode = k, { record: false }); renderPanel(); })),
    section('Room', el('button', { class: 'btn' + (view.dim ? ' on' : ''), onclick: () => { view.setDim(!view.dim); $('#dim').classList.toggle('on', view.dim); renderPanel(); } }, view.dim ? '💡 Turn the room lights back on' : '🌙 Turn off the big light')),
  ];
}

function garlandPanel() {
  const G = design.garland;
  return [
    section('Garland', chips(GARLANDS, G.style, k => { change(d => d.garland.style = k); renderPanel(); })),
    G.style === 'none' ? null : section('Times round the tree', slider({ min: 2, max: 7, step: 1, value: G.wraps, label: v => `${v} wraps`, onInput: v => change(d => d.garland.wraps = v) })),
  ];
}

function ornamentPanel() {
  const spec = ORNAMENTS[tool.type];
  return [
    section(null, el('div', { class: 'seg' },
      el('button', { class: !tool.remove ? 'on' : '', onclick: () => { tool.remove = false; renderPanel(); } }, '➕ Hang'),
      el('button', { class: tool.remove ? 'on' : '', onclick: () => { tool.remove = true; renderPanel(); } }, '✋ Take off'),
      el('span', { class: 'count' }, `${design.ornaments.length} on the tree`))),
    tool.remove ? null : section('Ornament', chips(ORNAMENTS, tool.type, k => { tool.type = k; renderPanel(); }, { cls: 'icons', render: (k, v) => [el('span', { class: 'ic' }, v.icon), v.label] })),
    tool.remove || !spec.colors ? null : section('Colour', el('div', { class: 'swatches' }, ORN_COLORS.map(([c, name]) =>
      el('button', { class: 'swatch' + (c === tool.color ? ' on' : ''), title: name, 'aria-label': name, style: `background:${c}`, onclick: () => { tool.color = c; renderPanel(); } })))),
    tool.remove || !spec.finishes ? null : section('Finish', chips(FINISHES, tool.finish, k => { tool.finish = k; renderPanel(); })),
    tool.remove ? null : section('Size', chips({ 0.75: 'Small', 1: 'Medium', 1.35: 'Large' }, String(tool.size), k => { tool.size = +k; renderPanel(); })),
    section('Decorate for me', chips(THEMES, tool.theme, k => { tool.theme = k; renderPanel(); }),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: () => change(d => autoDecorate(d, tool.theme)) }, '✨ Decorate it'),
        el('button', { class: 'btn', onclick: () => change(d => d.ornaments = []) }, '🧹 Take everything off'))),
  ];
}

function topperPanel() {
  return [section('On top', chips(TOPPERS, design.topper, k => { change(d => d.topper = k); renderPanel(); }, { cls: 'icons', render: (k, v) => [el('span', { class: 'ic' }, v.icon), v.label] }))];
}

function giftsPanel() {
  return [section(`${design.gifts.length} present${design.gifts.length === 1 ? '' : 's'}`,
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', onclick: () => { change(d => addGift(d)); renderPanel(); } }, '🎁 Add a present'),
      el('button', { class: 'btn', onclick: () => { change(d => { const n = d.gifts.length || 5; d.gifts = []; for (let i = 0; i < n; i++) addGift(d, Math.random() * 1e5 | 0); }); renderPanel(); } }, '🔀 Rewrap'),
      el('button', { class: 'btn', onclick: () => { change(d => d.gifts = []); renderPanel(); } }, '🗑 Return them all')))];
}

// ---------------------------------------------------------------- toolbar
$('#undo').addEventListener('click', () => {
  if (!undo.length) return;
  design = JSON.parse(undo.pop());
  rebuild(true);
  renderPanel();
  $('#undo').disabled = !undo.length;
});
$('#dim').addEventListener('click', () => { view.setDim(!view.dim); $('#dim').classList.toggle('on', view.dim); if (tab === 'lights') renderPanel(); });
$('#photo').addEventListener('click', async () => {
  const blob = await view.snapshot();
  const file = new File([blob], `${slug(design.name)}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: design.name }); return; } catch {} }
  download(blob, file.name);
});
$('#menu').addEventListener('click', openTrees);

const slug = s => (s || 'tree').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tree';
function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.remove('show'); }, 2200);
}

// ---------------------------------------------------------------- my trees, sharing
function modal(title, ...body) {
  const m = $('#modal');
  m.replaceChildren(el('div', { class: 'card' }, el('div', { class: 'mh' }, el('h2', {}, title), el('button', { class: 'x', 'aria-label': 'Close', onclick: closeModal }, '✕')), ...body));
  m.hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function openTrees() {
  const name = el('input', { type: 'text', value: design.name, maxlength: 40, 'aria-label': 'Tree name' });
  name.addEventListener('change', () => { design.name = name.value.trim() || 'My tree'; persist(); });
  const list = el('div', { class: 'saved' });
  const draw = () => {
    list.replaceChildren(...(store.saved.length ? store.saved.map((s, i) => el('div', { class: 'item' },
      el('div', {}, el('b', {}, s.design.name), el('small', {}, `${ftIn(s.design.tree.height)} ${SPECIES[s.design.tree.species]?.label || ''} · ${s.design.ornaments.length} ornaments · ${new Date(s.at).toLocaleDateString()}`)),
      el('button', { class: 'btn', onclick: () => { undo.push(JSON.stringify(design)); design = migrate(clone(s.design)); rebuild(true); renderPanel(); closeModal(); } }, 'Open'),
      el('button', { class: 'btn ghost', 'aria-label': 'Delete', onclick: () => { if (confirm(`Throw out "${s.design.name}"?`)) { store.saved.splice(i, 1); saveAll(store); draw(); } } }, '🗑'),
    )) : [el('p', { class: 'muted' }, 'Trees you save show up here.')]));
  };
  draw();
  modal('My trees',
    el('div', { class: 'sec' }, el('h3', {}, 'This tree'), name,
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: () => { design.name = name.value.trim() || 'My tree'; store.saved.unshift({ at: Date.now(), design: clone(design) }); saveAll(store); draw(); toast('Saved.'); } }, '💾 Save a copy'),
        el('button', { class: 'btn', onclick: () => share() }, '🔗 Share'),
        el('button', { class: 'btn', onclick: () => { undo.push(JSON.stringify(design)); design = defaultDesign(); design.ornaments = []; design.gifts = []; rebuild(true); renderPanel(); closeModal(); } }, '🌱 Start a bare tree'))),
    el('div', { class: 'sec' }, el('h3', {}, 'Saved'), list),
    el('div', { class: 'sec' }, el('h3', {}, '3D files'), el('p', { class: 'muted' }, 'For Blender, game engines, or anything that opens glTF or USDZ.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onclick: async e => { e.target.disabled = true; const { blob } = await toGLB(design); download(blob, slug(design.name) + '.glb'); e.target.disabled = false; } }, '⬇ GLB'),
        el('button', { class: 'btn', onclick: async e => { e.target.disabled = true; const { blob } = await toUSDZ(design); download(blob, slug(design.name) + '.usdz'); e.target.disabled = false; } }, '⬇ USDZ'))),
  );
}

async function shareUrl() {
  const code = await encodeDesign(design);
  const base = isNative() ? 'https://vibecodedslopware.com/augmented-treality/' : location.origin + location.pathname;
  return `${base}#d=${code}`;
}
async function share() {
  const url = await shareUrl();
  if (navigator.share) { try { await navigator.share({ title: design.name, text: 'Look at my Christmas tree. You can stand it in your living room.', url }); return; } catch {} }
  try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { prompt('Copy this link:', url); }
}

// ---------------------------------------------------------------- AR
$('#ar').addEventListener('click', goAR);

async function goAR() {
  const btn = $('#ar');
  support ??= await arSupport();
  btn.disabled = true;
  const busy = msg => { $('#busy').hidden = false; $('#busy p').textContent = msg; };
  const done = () => { $('#busy').hidden = true; btn.disabled = false; };
  try {
    if (support.native) { await openNative(clone(design), { onProgress: busy }); }
    else if (support.webxr) {
      xr = new XRSession(view, model, design, $('#ar-overlay'), {
        onStatus: text => { $('#ar-status').textContent = text; $('#ar-status').hidden = !text; },
        onPlaced: () => { $('#ar-tools').hidden = false; },
        onStart: () => { $('#ar-tools').hidden = true; $('#ar-size').textContent = 'Real size'; done(); },
        onEnd: () => { xr = null; TWINKLE.mode.value = MODE_INDEX[design.lights.mode]; renderPanel(); },
      });
      await xr.start();
    } else if (support.quicklook) { await openQuickLook(clone(design), { onProgress: busy, blob: usdz?.key === JSON.stringify(design) ? usdz.blob : null }); }
    else { done(); return phoneModal(); }
  } catch (e) {
    console.error(e);
    toast(support.android ? 'AR didn\'t start. It needs Chrome and Google Play Services for AR.' : 'AR didn\'t start: ' + (e.message || e));
  }
  done();
}

// No AR here: offer the design on a phone by QR code, plus the files.
async function phoneModal() {
  const url = await shareUrl();
  const qrBox = el('div', { class: 'qr' }, el('p', { class: 'muted' }, 'Making a QR code…'));
  modal('See it in your room',
    el('p', {}, support.android
      ? 'This phone can\'t start AR in the browser. Install Google Play Services for AR and open this page in Chrome, or get the Augmented Treality app.'
      : support.ios ? 'Open this page in Safari to stand the tree in your room.' : 'AR needs a phone. Scan this with an iPhone or an Android phone and your tree comes with you.'),
    qrBox,
    el('div', { class: 'row' }, el('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { prompt('Copy this link:', url); } } }, '🔗 Copy link')));
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js');
    const q = window.qrcode(0, 'L'); q.addData(url); q.make();
    qrBox.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch { qrBox.replaceChildren(el('p', { class: 'muted' }, 'Couldn\'t draw the QR code. Use the link instead.')); }
}
function loadScript(src) {
  return new Promise((res, rej) => { if ([...document.scripts].some(s => s.src === src)) return res(); const s = el('script', { src }); s.onload = res; s.onerror = rej; document.head.append(s); });
}

$('#ar-done').addEventListener('click', () => xr?.end());
$('#ar-move').addEventListener('click', () => { xr?.move(); $('#ar-tools').hidden = true; });
$('#ar-size').addEventListener('click', () => { if (!xr) return; const mini = xr.scaleMode === 1; xr.setScale(mini ? 0.2 : 1); $('#ar-size').textContent = mini ? 'Tabletop' : 'Real size'; });
$('#ar-lights').addEventListener('click', () => { if (xr) $('#ar-lights').textContent = '💡 ' + xr.cycleLights(); });
$('#ar-snow').addEventListener('click', () => { if (xr) $('#ar-snow').classList.toggle('on', xr.toggleSnow()); });
for (const [id, dir] of [['#ar-rl', 1], ['#ar-rr', -1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', () => xr?.setSpin(dir));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => xr?.setSpin(0));
}

// ---------------------------------------------------------------- boot
async function boot() {
  rebuild(true);
  view.start();
  const m = location.hash.match(/d=([\w-]+)/);
  if (m) {
    const d = await decodeDesign(m[1]);
    if (d) { undo.push(JSON.stringify(design)); design = migrate(d); rebuild(true); toast(`Opened "${design.name}".`); history.replaceState(null, '', location.pathname); }
  }
  renderTabs(); renderPanel();
  $('#undo').disabled = true;
  support = await arSupport();
  prewarm();
  const label = support.native ? 'See it in your room' : support.webxr || support.quicklook ? 'See it in your room' : 'Put it in your room';
  $('#ar .l').textContent = label;
  if (support.native) $('#title small').textContent = support.native === 'ios' ? 'Stands it in your room with AR Quick Look.' : 'Stands it in your room with ARCore.';
  $('#start').addEventListener('click', () => { $('#title').classList.add('gone'); setTimeout(() => $('#title').remove(), 700); });
  document.body.classList.add('ready');
}
boot();

// Headless test hooks (localhost only, like the other games).
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || isNative()) {
  window.__at = {
    get design() { return design; }, set design(d) { design = migrate(d); rebuild(true); renderPanel(); },
    model, view, change, toGLB, toUSDZ, autoDecorate, addGift, defaultDesign, encodeDesign, decodeDesign, THREE,
    tab: k => { tab = k; renderTabs(); renderPanel(); },
    tap: (x, y) => view.onTap(new THREE.Vector2(x, y)),
    ready: true,
  };
}
