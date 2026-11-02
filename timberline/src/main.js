import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Brush, Evaluator, INTERSECTION } from 'three-bvh-csg';
import { SPECIES, LOCATIONS, TOOLS, NOTCH_PRESETS } from './data.js';
import { World, wind } from './world.js';
import { TreeModel } from './tree.js';
import { Felling } from './physics.js';
import { Rig, Chips } from './tools.js';
import { assets } from './assets.js';
import { HarvesterMode } from './harvester.js';
import * as sfx from './audio.js';
import { createPost } from './post.js';

const $ = (id) => document.getElementById(id);
const deg = THREE.MathUtils.degToRad, rad2deg = THREE.MathUtils.radToDeg;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const cm = (m) => (m * 100).toFixed(1);
const money = (v) => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US');

// ---------------- renderer ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 3000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.53; controls.minDistance = 0.6; controls.maxDistance = 220;
let post = null, pixelRatio = Math.min(window.devicePixelRatio, 1.5);
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  post?.setSize(w, h, pixelRatio);
}
window.addEventListener('resize', resize);

// ---------------- save ----------------
const SAVE_KEY = 'timberline.v1';
const fresh = () => ({ cash: 0, health: 100, owned: ['axe'], equipped: 'axe', stats: { felled: 0, jobs: 0, earned: 0, injuries: 0, accSum: 0, accN: 0, best: null } });
let save = (() => { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.owned) return Object.assign(fresh(), s); } catch {} return fresh(); })();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} };

// ---------------- game state ----------------
const G = { mode: 'menu', step: null, holding: false, activeCut: 'top', time: 0 };
let world = null, job = null, harvester = null;
const evaluator = new Evaluator(); evaluator.attributes = ['position', 'uv', 'normal']; evaluator.useGroups = true;

// ---------------- camera tween ----------------
let tween = null, shake = 0;
function camToWorld(pos, target, dur = 1.1) {
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, t: 0, dur };
}
function camTo(name) {
  const tr = G.tree; if (!tr) return;
  tr.root.updateMatrixWorld(true);
  const H = tr.H, R = tr.Rc, h0 = tr.h0;
  const L = (x, y, z) => tr.root.localToWorld(new THREE.Vector3(x, y, z));
  let p, t;
  if (name === 'sizeup') { p = L(-Math.max(7, H * 0.42), Math.max(4, H * 0.32), -Math.max(6, H * 0.42)); t = L(H * 0.15, H * 0.3, 0); }
  if (name === 'sight') { p = L(-3.5, 1.7, 0.2); t = L(H, 1.5, 0); }
  // cutting cameras look from across the trunk so the faller (who works from -z) is in view, not in the way
  if (name === 'cut') { p = L(R * 1.6 + 0.9, h0 + 0.55 + R * 0.8, R * 2.4 + 1.5); t = L(0, h0 + 0.05, 0); }
  if (name === 'back') { p = L(-(R * 1.8 + 1.2), h0 + 0.6 + R * 0.8, R * 2.4 + 1.3); t = L(0, h0 + 0.05, 0); }
  if (name === 'fall') {
    // watch from whichever side is clearer of buildings and standing trees
    const cands = [-1, 1].map((sd) => L(H * 0.32, Math.max(3, H * 0.22), sd * H * 0.95));
    const clutter = (q) => world.hazards.reduce((a, h) => a + (h.x != null && Math.hypot(h.x - q.x, h.z - q.z) < 8 ? 10 : 0), 0) + world.standing.filter((s) => Math.hypot(s.x - q.x, s.z - q.z) < 3).length;
    p = clutter(cands[0]) <= clutter(cands[1]) ? cands[0] : cands[1]; t = L(H * 0.5, H * 0.12, 0);
  }
  const gy = world.height(p.x, p.z) + 0.8; if (p.y < gy) p.y = gy;
  camToWorld(p, t, name === 'fall' ? 1.8 : 1.1);
}

// ---------------- UI helpers ----------------
function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast glass ' + kind; el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3900);
  setTimeout(() => el.remove(), 4250);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
let bannerTimer = 0;
function banner(text, small, ms = 1800) {
  const b = $('banner'); b.innerHTML = text + (small ? `<small>${small}</small>` : ''); b.hidden = false;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => (b.hidden = true), ms);
}
function show(id, on) { $(id).hidden = !on; }
function updateWallet() {
  $('cashV').textContent = money(save.cash);
  $('hpV').textContent = Math.max(0, Math.round(save.health));
  $('hpBar').style.width = clamp(save.health, 0, 100) + '%';
  $('hpBar').style.background = save.health > 60 ? 'var(--ok)' : save.health > 30 ? 'var(--warn)' : 'var(--bad)';
}
function slider(id, label, min, max, step, value, fmt, disabled = false) {
  return `<div class="slider"><div class="top"><label class="lbl" for="${id}">${label}</label><span class="val" id="${id}-v">${fmt(value)}</span></div>
  <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="--p:${((value - min) / (max - min)) * 100}%" ${disabled ? 'disabled' : ''}></div>`;
}
function bindSlider(id, fmt, fn) {
  const el = $(id); if (!el) return;
  el.addEventListener('input', () => { const v = parseFloat(el.value); el.style.setProperty('--p', ((v - el.min) / (el.max - el.min)) * 100 + '%'); $(id + '-v').textContent = fmt(v); fn(v); });
}

// inline line icons (24×24, stroked)
const ICON = {
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2m1-5 2 2m1-5 2 2"/>',
  height: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  lean: '<path d="M6 21 15 4"/><path d="M4 21h8"/>',
  weight: '<path d="M6 9h12l2 12H4z"/><circle cx="12" cy="6" r="2.5"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3"/>',
  tool: '<path d="m14 7 3-3 3 3-3 3"/><path d="M15.5 8.5 4 20"/>',
  axe: '<path d="M14 4c3 0 6 3 6 6l-5 1-2-2z"/><path d="M13 9 3 21"/>',
  saw: '<rect x="3" y="9" width="8" height="7" rx="2"/><path d="M11 11h9a1.5 1.5 0 0 1 0 3h-9"/><path d="M5 9V7h4"/>',
  wedge: '<path d="M4 18 20 9v9z"/><path d="M8 18v-2"/>',
  ppe: '<path d="M4 15a8 8 0 0 1 16 0z"/><path d="M2 15h20M12 7V4"/>',
  machine: '<rect x="2" y="12" width="12" height="5" rx="1"/><circle cx="5" cy="19" r="2"/><circle cx="11" cy="19" r="2"/><path d="M14 13h3l3-7M20 6l2 2"/><path d="M5 12V8h5v4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  tree: '<path d="M12 2 5 12h4l-3 5h12l-3-5h4z"/><path d="M12 17v5"/>',
};
const icon = (k, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${ICON[k]}</svg>`;
const stepper = (n) => `<div class="stepper">${[1, 2, 3].map((i) => `<div class="${i < n ? 'done' : i === n ? 'now' : ''}"></div>`).join('')}</div>
  <div class="stepper-labels">${['Size up', 'Face cut', 'Back cut'].map((t, i) => `<span class="${i + 1 === n ? 'now' : ''}" style="font-family:var(--f-display);font-weight:600;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:${i + 1 === n ? 'var(--bone)' : 'var(--mute)'}">${t}</span>`).join('')}</div>`;

// A small landscape for each contract card, drawn from the location's own colours.
function locArt(l) {
  let seed = [...l.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fog = l.fog, g = l.ground, conifer = l.species.some((k) => SPECIES[k].crown === 'conifer'), broad = l.species.some((k) => SPECIES[k].crown === 'broadleaf');
  const tilt = l.slope * 1.4;
  const ridge = (y0, amp, n) => { let d = `M0 ${y0}`; for (let i = 0; i <= n; i++) { const x = (i / n) * 320; d += ` L${x.toFixed(1)} ${(y0 + (rnd() - 0.5) * amp - (x / 320) * tilt).toFixed(1)}`; } return d + ' L320 120 L0 120 Z'; };
  const trees = (y0, count, scale, color) => {
    let out = '';
    for (let i = 0; i < count; i++) {
      const x = rnd() * 320, y = y0 - (x / 320) * tilt + rnd() * 8, h = (16 + rnd() * 18) * scale;
      const cone = conifer && (!broad || rnd() < 0.6);
      out += cone ? `<path d="M${x.toFixed(1)} ${(y - h).toFixed(1)} L${(x - h * 0.28).toFixed(1)} ${y.toFixed(1)} L${(x + h * 0.28).toFixed(1)} ${y.toFixed(1)}Z" fill="${color}"/>`
        : `<rect x="${(x - 0.8 * scale).toFixed(1)}" y="${(y - h * 0.55).toFixed(1)}" width="${(1.6 * scale).toFixed(1)}" height="${(h * 0.55).toFixed(1)}" fill="${color}"/><circle cx="${x.toFixed(1)}" cy="${(y - h * 0.62).toFixed(1)}" r="${(h * 0.3).toFixed(1)}" fill="${color}"/>`;
    }
    return out;
  };
  const extra = l.hazards.includes('powerline') ? `<path d="M0 46 Q160 60 320 40" stroke="#1a1f1c" stroke-width="0.8" fill="none" opacity="0.7"/><rect x="226" y="40" width="2" height="40" fill="#2a2a24"/>`
    : l.hazards.includes('cabin') ? `<path d="M232 78 l14 -10 l14 10 v12 h-28z" fill="#3a2a1e"/><rect x="249" y="82" width="5" height="8" fill="#ffb347" opacity="0.8"/>`
    : l.tier === 'harvester' ? `<rect x="210" y="84" width="34" height="9" rx="2" fill="#e8a020"/><circle cx="216" cy="95" r="3.5" fill="#222"/><circle cx="238" cy="95" r="3.5" fill="#222"/><path d="M240 84 L262 66 L270 70" stroke="#e8a020" stroke-width="2.5" fill="none"/>` : '';
  return `<svg viewBox="0 0 320 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="sk-${l.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fog}" stop-opacity="0.55"/><stop offset="1" stop-color="${fog}"/></linearGradient>
    <radialGradient id="sn-${l.id}" cx="0.78" cy="0.22" r="0.5"><stop offset="0" stop-color="#fff6e0" stop-opacity="0.9"/><stop offset="1" stop-color="#fff6e0" stop-opacity="0"/></radialGradient></defs>
    <rect width="320" height="112" fill="#6f8f9c"/><rect width="320" height="112" fill="url(#sk-${l.id})"/><rect width="320" height="112" fill="url(#sn-${l.id})"/>
    <path d="${ridge(58, 22, 9)}" fill="${g[2]}" opacity="0.35"/>
    ${trees(70, 26, 0.6, g[2] + '99')}
    <path d="${ridge(80, 12, 7)}" fill="${g[1]}" opacity="0.8"/>
    ${trees(88, 16, 1, '#1e2a1e')}${extra}
    <path d="${ridge(98, 6, 6)}" fill="${g[0]}"/>
    ${trees(118, 5, 1.8, '#121a13')}
    <rect width="320" height="112" fill="url(#sk-${l.id})" opacity="0.12"/>
  </svg>`;
}
const difficulty = (l) => clamp(Math.round(l.slope / 9 + l.dbh[1] * 2.2 + l.lean[1] / 7 + l.hazards.length * 0.6), 1, 5);

// ---------------- menu ----------------
const tierOk = (loc) => {
  const t = TOOLS[save.equipped];
  if (loc.tier === 'axe') return true;
  if (loc.tier === 'saw') return t.kind === 'saw';
  if (loc.tier === 'bigsaw') return save.equipped === 'sawBig';
  if (loc.tier === 'harvester') return save.owned.includes('harvester');
};
const tierText = { axe: 'Any cutting tool', saw: 'Chainsaw required', bigsaw: 'Falling Saw 92cc required', harvester: 'Harvester required' };
let menuTab = 'contracts';
function renderMenu() {
  const s = save.stats;
  $('stats').innerHTML = [
    ['Cash', money(save.cash)], ['Health', Math.round(save.health)], ['Trees down', s.felled],
    ['Mean lay error', s.accN ? (s.accSum / s.accN).toFixed(1) + '°' : '—'], ['Injuries', s.injuries], ['Equipped', TOOLS[save.equipped].name],
  ].map(([k, v], i) => `<div><div class="lbl">${k}</div><div class="v${i === 0 ? ' cash' : ''}">${v}</div></div>`).join('');
  for (const t of ['contracts', 'gear', 'notes']) $('tab-' + t).setAttribute('aria-selected', String(menuTab === t));
  const body = $('tabbody');
  if (menuTab === 'contracts') {
    body.innerHTML = `<div class="cards">${LOCATIONS.map((l) => {
      const ok = tierOk(l);
      const sp = [...new Set(l.species)].map((k) => SPECIES[k].name).join(', ');
      const d = difficulty(l);
      return `<div class="card${ok ? '' : ' locked'}" style="animation-delay:${LOCATIONS.indexOf(l) * 60}ms"><div class="art">${locArt(l)}<span class="badge">${icon(l.tier === 'axe' ? 'axe' : l.tier === 'harvester' ? 'machine' : 'saw')}${l.tier === 'axe' ? 'Axe work' : l.tier === 'harvester' ? 'Machine' : 'Chainsaw'}</span><span class="pay">${money(l.basePay)}/tree</span></div>
      <div class="region">${l.region}<span class="diff" title="Difficulty ${d} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= d ? 'on' : ''}"></i>`).join('')}</span></div><h4>${l.name}</h4><p>${l.blurb}</p>
      <div class="specs"><span>Slope <b>${l.slope}°</b></span><span>DBH <b>${Math.round(l.dbh[0] * 100)}–${Math.round(l.dbh[1] * 100)} cm</b></span><span>Trees <b>${l.trees}</b></span></div>
      <div class="species">${sp}</div>
      ${ok ? `<button class="go" data-loc="${l.id}">Take contract →</button>` : `<div class="req">${icon('lock')}${tierText[l.tier]}</div><button class="go ghost" disabled>Locked</button>`}</div>`;
    }).join('')}</div>
    <div class="controls-hint"><span><kbd>Space</kbd> cut / swing</span><span><kbd>E</kbd> wedge</span><span><kbd>R</kbd> retreat</span><span><kbd>Drag</kbd> orbit camera</span><span><kbd>Scroll</kbd> zoom</span></div>`;
    body.querySelectorAll('[data-loc]').forEach((b) => b.addEventListener('click', () => { sfx.initAudio(); sfx.tick(); fadeThen(() => startJob(LOCATIONS.find((l) => l.id === b.dataset.loc))); }));
  } else if (menuTab === 'gear') {
    body.innerHTML = `<div class="cards">${Object.entries(TOOLS).map(([k, t]) => {
      const own = save.owned.includes(k);
      const equipable = t.kind === 'axe' || t.kind === 'saw';
      let btn;
      if (!own) btn = `<button class="go" data-buy="${k}" ${save.cash < t.price ? 'disabled' : ''}>Buy · ${money(t.price)}</button>`;
      else if (equipable) btn = save.equipped === k ? `<button class="go ghost" disabled>Equipped</button>` : `<button class="go ghost" data-eq="${k}">Equip</button>`;
      else btn = `<button class="go ghost" disabled>Owned</button>`;
      const ic = t.kind === 'machine' ? 'machine' : t.kind === 'saw' ? 'saw' : t.kind === 'axe' ? 'axe' : k === 'wedges' ? 'wedge' : 'ppe';
      return `<div class="card${own ? ' owned' : ''}"><div class="icon-art">${icon(ic, '')}</div><div class="region">${t.kind === 'machine' ? 'Machine' : t.kind === 'gear' ? 'Gear' : t.kind === 'saw' ? 'Chainsaw' : 'Axe'}${own ? ' · owned' : ''}</div><h4>${t.name}</h4><p>${t.desc}</p>${btn}</div>`;
    }).join('')}</div>
    <p class="note" style="margin-top:14px;color:var(--bone-dim)">Health recovers 15 points per contract. Reset career: <button class="chip" id="resetBtn" type="button">Start over</button></p>`;
    body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const t = TOOLS[b.dataset.buy]; if (save.cash < t.price) return;
      save.cash -= t.price; save.owned.push(b.dataset.buy);
      if (t.kind === 'saw' || t.kind === 'axe') save.equipped = b.dataset.buy;
      persist(); sfx.cash(); renderMenu();
    }));
    body.querySelectorAll('[data-eq]').forEach((b) => b.addEventListener('click', () => { save.equipped = b.dataset.eq; persist(); renderMenu(); }));
    $('resetBtn').addEventListener('click', (e) => {
      if (e.target.dataset.armed) { save = fresh(); persist(); renderMenu(); return; }
      e.target.dataset.armed = '1'; e.target.textContent = 'Click again to erase everything';
    });
  } else {
    body.innerHTML = `<div class="notes">${FIELD_NOTES.map(([h, p]) => `<section><h5>${h}</h5><p>${p}</p></section>`).join('')}</div>`;
  }
}
for (const t of ['contracts', 'gear', 'notes']) $('tab-' + t).addEventListener('click', () => { if (menuTab !== t) sfx.tick(); menuTab = t; renderMenu(); });
// fade to black, run the (possibly slow) scene change, fade back in
function fadeThen(fn) {
  $('fade').classList.add('on');
  setTimeout(() => { try { fn(); } finally { requestAnimationFrame(() => $('fade').classList.remove('on')); } }, 360);
}

const FIELD_NOTES = [
  ['Size up first', 'Read lean (sight it from two directions), crown weight, wind, dead tops and neighbouring crowns. Pick a lay that hits a gap, then clear two escape routes at 45° behind the stump.'],
  ['The face cut', 'The notch sets direction. Its apex line is the hinge front, perpendicular to the lay. Cut 1/5 to 1/3 of the diameter deep. Both cuts must meet exactly at the apex — stop the saw on the line.'],
  ['Open face', 'A 70–90° opening keeps the hinge working until the tree is nearly on the ground. Back cut goes in level with the apex. The modern default.'],
  ['Conventional & Humboldt', '45° notches close at 45°: the hinge snaps mid-fall and the butt can jump. A step (back cut 2–5 cm above the apex) stops it coming back at you. Humboldt flips the angle into the stump so the butt can\'t slide off downhill.'],
  ['The hinge', 'Leave it about 10% of the diameter thick and 80% wide. Thicker holds the tree back; thinner tears early and loses control. Never cut it — once the hinge is gone, gravity chooses the direction.'],
  ['Tapered hinge', 'Leave one end thicker and the tree swings toward the thick side as it falls. Used to pull a tree a few degrees against side lean.'],
  ['Dutchman', 'When the two face cuts overshoot or don\'t meet, the notch closes almost immediately. The hinge breaks early, fibres pull, and the tree can turn or split.'],
  ['Barber chair', 'A heavy forward leaner cut slowly from the back tears vertically before the hinge sets — a slab of the stem whips up and back. Ash and oak are notorious. Bore-cut leaners: plunge behind the hinge, leave a strap at the back, then release the strap.'],
  ['Wedges', 'On back-leaners the kerf closes and pinches the bar. Set wedges in the back cut early and drive them to lift the tree past vertical.'],
  ['Hang-ups', 'A tree lodged in another is the deadliest thing in the woods. Never work under it, never fell another tree into it. Choose gaps.'],
  ['Slopes', 'Downhill falls are long and fast — tops shatter, stems break across benches and rocks. Fall to the contour or to a bench where you can.'],
];

// ---------------- jobs ----------------
function clearWorld() {
  harvester?.dispose(); harvester = null;
  if (job) for (const t of job.trees) t.dispose();
  cleanupTree();
  world?.dispose(); world = null; job = null;
}

function startJob(loc) {
  clearWorld();
  const seed = (Math.random() * 1e9) | 0;
  world = new World(scene, renderer, loc, seed);
  G.mode = 'job';
  show('menu', false);
  show('hud', true); show('wallet', true);
  updateWallet();
  if (loc.tier === 'harvester') {
    const jobs = world.generateStand(0, { rows: true });
    world.scatterGround();
    job = { loc, trees: [], results: [] };
    harvester = new HarvesterMode({ scene, world, camera, controls, renderer, specs: jobs, ui: { toast, banner, panel: $('panel'), jobcard: $('jobcard') }, onDone: (r) => endHarvest(r) });
    G.mode = 'harvest';
    show('panel', true); show('plan', false); show('actionbar', false);
    return;
  }
  const jobs = world.generateStand(loc.trees);
  world.addHazards(loc.hazards, jobs);
  world.scatterGround();
  world.buildLeaveTrees(jobs);
  const toolKey = save.equipped;
  const r = Math.random();
  job = {
    loc, tool: TOOLS[toolKey], toolKey,
    wind: { speed: lerp(loc.wind[0], loc.wind[1], r * r), az: Math.random() * Math.PI * 2 },
    trees: jobs.map((s) => new TreeModel(s, world)),
    results: [], done: new Set(),
  };
  sfx.setWind(job.wind.speed);
  G.mode = 'fell';
  selectTree(0);
}

function cleanupTree() {
  G.rig?.dispose(); G.rig = null;
  G.guides?.parent?.remove(G.guides); G.guides = null;
  G.preview?.parent?.remove(G.preview); G.preview = null;
  sfx.sawStop();
  G.felling = null; G.tree = null;
  clearTimeout(G.resultTimer);
}

function selectTree(i) {
  cleanupTree();
  G.treeIdx = i;
  const tree = job.trees[i];
  G.tree = tree;
  const f = new Felling(tree, world, { tool: job.tool, wind: job.wind, ppe: save.owned.includes('ppe') });
  G.felling = f;
  G.rig = new Rig(tree, job.tool); G.rig.hideTool();
  G.rig.setFaller(-tree.Rc - 1.5, -(tree.Rc + 1.2), 1);
  world.focus(tree.spec.x, tree.spec.z);
  const D = tree.R * 2;
  if (job.tool.kind === 'axe') Object.assign(f.cut.notch, { type: 'axe', top: 45, bottom: 30, target: D * 0.3 });
  else applyPreset('open');
  f.cut.back.step = job.tool.kind === 'axe' ? 0.03 : 0;
  G.step = 'sizeup'; G.activeCut = 'top'; G.cutStarted = false; G.csgDirty = true; G.csgT = 0;
  G.creakT = 1; G.retreatWarned = false; G.blockMsg = 0;
  buildGuides();
  camTo('sizeup');
  renderPanel(); renderJobCard();
  show('panel', true); show('plan', true); show('actionbar', false); show('meter', false);
}

function applyPreset(key) {
  const p = NOTCH_PRESETS[key], c = G.felling.cut;
  Object.assign(c.notch, { type: key, top: p.top, bottom: p.bottom, target: G.tree.R * 2 * (key === 'open' ? 0.25 : 0.3) });
  c.back.step = p.step;
}

function renderJobCard() {
  const tr = G.tree, s = tr.spec, f = G.felling;
  const leanRel = rad2deg(wrap(s.lean.az - tr.aim));
  const done = job.done.size;
  $('jobcard').innerHTML = `<div class="lbl">${job.loc.name} · tree ${done + 1 > job.trees.length ? job.trees.length : done + 1} of ${job.trees.length}</div>
    <h2>${s.sp.name}</h2><div class="sub"><i>${s.sp.sci}</i></div>
    <div class="facts">
      <span>${icon('ruler')}DBH</span><span>${cm(s.dbh)} cm</span>
      <span>${icon('height')}Height</span><span>${s.h.toFixed(1)} m</span>
      <span>${icon('lean')}Lean</span><span>${s.lean.deg.toFixed(1)}° · ${Math.abs(leanRel).toFixed(0)}° ${leanRel >= 0 ? 'right' : 'left'} of lay</span>
      <span>${icon('weight')}Weight</span><span>${(tr.mass / 1000).toFixed(1)} t</span>
      <span>${icon('wind')}Wind</span><span>${f.wind.speed.toFixed(1)} m/s</span>
      <span>${icon(job.tool.kind === 'axe' ? 'axe' : 'saw')}Tool</span><span>${job.tool.name}</span>
    </div>`;
}

// ---------------- guides (lay line, escape routes, lean arrow, cut planes) ----------------
function ribbon(points, width, color, opacity = 0.9) {
  const pos = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const d = new THREE.Vector3().subVectors(b, a); d.y = 0; d.normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(width / 2);
    const a1 = a.clone().add(n), a2 = a.clone().sub(n), b1 = b.clone().add(n), b2 = b.clone().sub(n);
    pos.push(...a1.toArray(), ...a2.toArray(), ...b1.toArray(), ...a2.toArray(), ...b2.toArray(), ...b1.toArray());
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false }));
}
function groundPath(x0, z0, az, from, to, step = 0.5, lift = 0.07) {
  const pts = [];
  for (let d = from; d <= to + 1e-6; d += step) { const x = x0 + Math.cos(az) * d, z = z0 + Math.sin(az) * d; pts.push(new THREE.Vector3(x, world.height(x, z) + lift, z)); }
  return pts;
}
function arrowHead(x0, z0, az, d, size, color) {
  const tip = new THREE.Vector3(x0 + Math.cos(az) * (d + size), 0, z0 + Math.sin(az) * (d + size));
  const l = new THREE.Vector3(x0 + Math.cos(az) * d + Math.cos(az + 1.57) * size * 0.6, 0, z0 + Math.sin(az) * d + Math.sin(az + 1.57) * size * 0.6);
  const r = new THREE.Vector3(x0 + Math.cos(az) * d + Math.cos(az - 1.57) * size * 0.6, 0, z0 + Math.sin(az) * d + Math.sin(az - 1.57) * size * 0.6);
  for (const p of [tip, l, r]) p.y = world.height(p.x, p.z) + 0.08;
  const g = new THREE.BufferGeometry().setFromPoints([tip, l, r]);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false, transparent: true, fog: false }));
}
function buildGuides() {
  G.guides?.parent?.remove(G.guides);
  const tr = G.tree, s = tr.spec, g = new THREE.Group();
  const az = tr.aim;
  g.add(ribbon(groundPath(s.x, s.z, az, tr.Rc + 0.4, tr.H - 1, 0.6), 0.16, 0xff6b1a));
  g.add(arrowHead(s.x, s.z, az, tr.H - 1, 1.2, 0xff6b1a));
  for (const side of [-1, 1]) {
    const eaz = az + Math.PI + side * Math.PI / 4;
    g.add(ribbon(groundPath(s.x, s.z, eaz, tr.Rc + 1, 7, 0.5), 0.12, 0x8fd16a, 0.85));
    g.add(arrowHead(s.x, s.z, eaz, 7, 0.6, 0x8fd16a));
  }
  if (s.lean.deg > 0.5) {
    g.add(ribbon(groundPath(s.x, s.z, s.lean.az, tr.Rc + 0.2, tr.Rc + 0.4 + s.lean.deg * 0.35, 0.3, 0.09), 0.1, 0xff4433));
    g.add(arrowHead(s.x, s.z, s.lean.az, tr.Rc + 0.4 + s.lean.deg * 0.35, 0.35, 0xff4433));
  }
  world.group.add(g); G.guides = g;
}
function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  return g;
}
const previewMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
const previewMat2 = new THREE.MeshBasicMaterial({ color: 0x8fd16a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
function buildPreview() {
  G.preview?.parent?.remove(G.preview);
  if (!['notch', 'back'].includes(G.step)) return;
  const tr = G.tree, c = G.felling.cut, n = c.notch, Rc = tr.Rc, h0 = tr.h0, Z = Rc + 0.08;
  const xA = Rc - n.target, X = Rc + 0.12;
  const g = new THREE.Group();
  if (G.step === 'notch') {
    const ta = Math.tan(deg(n.top)), tb = Math.tan(deg(n.bottom));
    g.add(new THREE.Mesh(quad([xA, h0, -Z], [X, h0 + (X - xA) * ta, -Z], [X, h0 + (X - xA) * ta, Z], [xA, h0, Z]), previewMat));
    g.add(new THREE.Mesh(quad([xA, h0, -Z], [X, h0 - (X - xA) * tb, -Z], [X, h0 - (X - xA) * tb, Z], [xA, h0, Z]), previewMat));
  } else {
    const plan = c.method === 'bore' ? c.hingePlan : G.tree.R * 2 * 0.1;
    const y = h0 + (c.method === 'bore' ? (c.bore?.step ?? c.back.step) : c.back.step);
    const ty = Math.tan(c.back.yaw);
    const xe = (z) => xA - plan + z * ty;
    g.add(new THREE.Mesh(quad([-Rc - 0.12, y, -Z], [xe(-Z), y, -Z], [xe(Z), y, Z], [-Rc - 0.12, y, Z]), previewMat2));
  }
  tr.leanGroup.add(g); G.preview = g;
}

// ---------------- panel ----------------
function renderPanel() {
  const p = $('panel'), tr = G.tree, f = G.felling, c = f.cut, tool = job.tool, D = tr.R * 2;
  const s = tr.spec;
  if (G.step === 'sizeup') {
    const leanRel = rad2deg(wrap(tr.aim - s.lean.az));
    const heavy = s.crownOffset.m / Math.max(0.01, s.crownR);
    const others = job.trees.map((t, i) => ({ t, i })).filter(({ i }) => !job.done.has(i));
    p.innerHTML = `${stepper(1)}<h3>Size up</h3>
      <p>${s.lean.deg < 1.5 ? 'Stands nearly plumb.' : `Leans <b>${s.lean.deg.toFixed(1)}°</b>.`} ${heavy > 0.18 ? 'Crown is noticeably heavier on one side.' : 'Crown is fairly balanced.'} ${s.rot ? '<b>A conk low on the stem — expect hollow heartwood.</b>' : ''} ${tr.H > 45 ? 'It\'s a big one: every degree of lay error is metres at the top.' : ''}</p>
      <p class="note">Orange: your lay. Green: escape routes. Red: lean. Look for gaps between neighbouring crowns — a hang-up costs money and nerve.${world.hazards.length ? ' Keep it off ' + world.hazards.map((h) => h.name).join(' and ') + '.' : ''}</p>
      ${slider('aim', 'Lay relative to lean', -180, 180, 1, Math.round(leanRel), (v) => `${v > 0 ? '+' : ''}${v}°`)}
      <div class="row">
        <button class="chip" id="withLean" type="button">With the lean</button>
        <button class="chip" id="pickLay" type="button" aria-pressed="${!!G.picking}">Pick on ground</button>
        <button class="chip" id="sight" type="button">Sight the lay</button>
        <button class="chip" id="overview" type="button">Overview</button>
      </div>
      ${others.length > 1 ? `<div class="lbl" style="margin-top:12px">Marked trees</div><div class="treelist">${others.map(({ t, i }) => `<button type="button" data-tree="${i}" aria-current="${i === G.treeIdx}"><span>${t.spec.sp.name}</span><span class="mono">${cm(t.spec.dbh)} cm · ${t.spec.h.toFixed(0)} m</span></button>`).join('')}</div>` : ''}
      <button class="go" id="next" type="button">Cut the face →</button>`;
    bindSlider('aim', (v) => `${v > 0 ? '+' : ''}${v}°`, (v) => { tr.setAim(s.lean.az + deg(v)); buildGuides(); renderJobCard(); });
    $('withLean').onclick = () => { tr.setAim(s.lean.az); buildGuides(); renderPanel(); renderJobCard(); };
    $('pickLay').onclick = () => { G.picking = !G.picking; renderPanel(); if (G.picking) toast('Click the ground where you want the top to land.'); };
    $('sight').onclick = () => camTo('sight');
    $('overview').onclick = () => camTo('sizeup');
    p.querySelectorAll('[data-tree]').forEach((b) => b.addEventListener('click', () => selectTree(+b.dataset.tree)));
    $('next').onclick = () => { G.picking = false; G.step = 'notch'; camTo('cut'); renderPanel(); buildPreview(); showAction(); };
  } else if (G.step === 'notch') {
    const n = c.notch, locked = G.cutStarted;
    const axe = tool.kind === 'axe';
    const opening = n.top + n.bottom;
    const over = Math.max(n.dTop, n.dBot) - n.target;
    const status = n.removed ? (over > 0.015 ? `<span class="state-bad">Overcut ${cm(over)} cm — Dutchman. The notch will close early.</span>` : '<span class="state-ok">Cuts met. Face removed cleanly.</span>')
      : (n.dTop > 0 || n.dBot > 0) ? '<span class="state-warn">Cuts don\'t meet yet — the face piece is still attached.</span>' : '<span class="note">Stop each cut on the orange mark.</span>';
    const gauge = (label, d, active) => {
      const max = n.target * 1.6;
      return `<div class="gauge"><div class="slider top" style="display:flex;justify-content:space-between"><span class="lbl" style="${active ? 'color:var(--hivis)' : ''}">${label}</span><span class="val mono">${cm(d)} / ${cm(n.target)} cm</span></div>
        <div class="track"><div class="fill" style="width:${clamp(d / max, 0, 1) * 100}%;${d > n.target + 0.015 ? 'background:var(--bad)' : ''}"></div><div class="tgt" style="left:${(1 / 1.6) * 100}%"></div></div></div>`;
    };
    p.innerHTML = `${stepper(2)}<h3>Face cut</h3>
      ${axe ? '<p class="note">Chop a V notch: alternate down-strokes and up-strokes. Time each swing on the meter — sloppy swings make the two faces miss each other.</p>' : `
      <div class="row">${Object.entries(NOTCH_PRESETS).map(([k, v]) => `<button class="chip" data-preset="${k}" aria-pressed="${n.type === k}" ${locked ? 'disabled' : ''}>${v.name}</button>`).join('')}</div>
      <p class="note">${NOTCH_PRESETS[n.type]?.note || 'Custom notch.'}</p>`}
      ${slider('top', 'Top cut angle', 0, 80, 1, n.top, (v) => v + '°', locked)}
      ${slider('bot', 'Bottom cut angle', 0, 60, 1, n.bottom, (v) => v + '°', locked)}
      ${slider('depth', 'Notch depth', 15, 45, 1, Math.round((n.target / D) * 100), (v) => `${v}% · ${cm(D * v / 100)} cm`, locked)}
      <div class="readout"><div><div class="lbl">Opening</div><div class="v ${opening >= 70 ? 'state-ok' : opening >= 44 ? 'state-warn' : 'state-bad'}">${opening}°</div></div><div><div class="lbl">Hinge width at apex</div><div class="v">${cm(2 * Math.sqrt(Math.max(0, tr.Rc ** 2 - (tr.Rc - n.target) ** 2)))} cm</div></div></div>
      ${axe ? gauge('Notch depth', Math.min(n.dTop, n.dBot), true) : `
      <div class="row"><button class="chip" data-cut="top" aria-pressed="${G.activeCut === 'top'}">Top cut</button><button class="chip" data-cut="bottom" aria-pressed="${G.activeCut === 'bottom'}">Bottom cut</button></div>
      ${gauge('Top cut', n.dTop, G.activeCut === 'top')}${gauge('Bottom cut', n.dBot, G.activeCut === 'bottom')}`}
      <p id="notchStatus">${status}</p>
      <button class="go ${n.removed ? '' : 'ghost'}" id="next" type="button" ${n.dTop + n.dBot > 0 ? '' : 'disabled'}>${n.removed ? 'Back cut →' : 'Back cut anyway →'}</button>`;
    p.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { applyPreset(b.dataset.preset); renderPanel(); buildPreview(); }));
    p.querySelectorAll('[data-cut]').forEach((b) => b.addEventListener('click', () => { G.activeCut = b.dataset.cut; renderPanel(); }));
    bindSlider('top', (v) => v + '°', (v) => { n.top = v; n.type = 'custom'; buildPreview(); });
    bindSlider('bot', (v) => v + '°', (v) => { n.bottom = v; n.type = 'custom'; buildPreview(); });
    bindSlider('depth', (v) => `${v}% · ${cm(D * v / 100)} cm`, (v) => { n.target = D * v / 100; buildPreview(); });
    $('next').onclick = () => {
      if (n.top + n.bottom < 12) { toast('Open the notch wider — at least 12°.', 'bad'); return; }
      G.step = 'back'; G.activeCut = c.method === 'bore' ? 'bore' : 'back'; G.cutStarted = false;
      if (axe) c.back.step = 0.03;
      camTo('back');
      renderPanel(); buildPreview(); showAction();
    };
  } else if (G.step === 'back') {
    const st = f.lastStats || f.stats();
    const locked = G.cutStarted;
    const T = st.hingeT, W = st.hingeW;
    const tState = T / D > 0.07 && T / D < 0.14 ? 'state-ok' : T / D > 0.04 ? 'state-warn' : 'state-bad';
    const load = f.load ?? 0;
    const bore = c.method === 'bore';
    const M = f.driving();
    const backLean = M.x < 0;
    p.innerHTML = `${stepper(3)}<h3>${tool.kind === 'axe' ? 'Back chop' : 'Back cut'}</h3>
      ${tool.kind === 'axe' ? '' : `<div class="row"><button class="chip" data-method="standard" aria-pressed="${!bore}" ${locked ? 'disabled' : ''}>Standard</button><button class="chip" data-method="bore" aria-pressed="${bore}" ${locked || !tool.bore ? 'disabled' : ''}>Bore cut${tool.bore ? '' : ' (pro saw)'}</button></div>`}
      <p class="note">${bore ? 'Plunge behind the hinge to set its thickness exactly, sweep back leaving a strap of holding wood, then release the strap from behind. The tree goes when the strap does — no barber chair.' : 'Cut toward the notch, level with ' + (c.notch.type === 'open' ? 'the apex.' : 'or a little above the apex (the step).') + ' Watch the hinge gauge and stop — let the tree go on its own.'}${backLean ? ' <b>Back-leaner:</b> set wedges before the kerf closes.' : ''}</p>
      ${slider('step', 'Back cut height vs apex', -3, 10, 0.5, +(c.back.step * 100).toFixed(1), (v) => `${v > 0 ? '+' : ''}${v} cm`, locked)}
      ${slider('yaw', 'Hinge taper', -8, 8, 0.5, +rad2deg(c.back.yaw).toFixed(1), (v) => (v === 0 ? 'parallel' : `${Math.abs(v)}° · thick ${v > 0 ? 'left' : 'right'}`), locked)}
      ${bore ? slider('plan', 'Planned hinge', 5, 20, 0.5, +((c.hingePlan / D) * 100).toFixed(1), (v) => `${v}% · ${cm(D * v / 100)} cm`, locked) : ''}
      <div class="readout">
        <div><div class="lbl">Hinge thickness</div><div class="v ${tState}" id="rT">${cm(T)} cm · ${Math.round((T / D) * 100)}%</div></div>
        <div><div class="lbl">Hinge width</div><div class="v" id="rW">${cm(W)} cm · ${Math.round((W / D) * 100)}%</div></div>
        <div><div class="lbl">Holding wood load</div><div class="v ${load > 0.8 ? 'state-bad' : load > 0.5 ? 'state-warn' : ''}" id="rL">${load < 0 ? 'back-leaning' : Math.round(load * 100) + '%'}</div></div>
        <div><div class="lbl">Wedges</div><div class="v" id="rWd">${save.owned.includes('wedges') ? `${f.wedges}/3 · ${cm(f.wedgeLift)} cm` : 'none owned'}</div></div>
      </div>
      ${bore ? `<div class="row"><button class="chip" data-cut="bore" aria-pressed="${G.activeCut === 'bore'}">1 · Plunge &amp; sweep</button><button class="chip" data-cut="strap" aria-pressed="${G.activeCut === 'strap'}" ${(c.bore?.progress || 0) >= 1 ? '' : 'disabled'}>2 · Release strap</button></div>` : ''}
      <p class="note">Target ${cm(D * 0.1)} cm (10% of DBH). Hold <b>Space</b> or the button to cut, <b>E</b> to drive a wedge, <b>R</b> to walk out.</p>`;
    p.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', () => { c.method = b.dataset.method; G.activeCut = c.method === 'bore' ? 'bore' : 'back'; renderPanel(); buildPreview(); }));
    p.querySelectorAll('[data-cut]').forEach((b) => b.addEventListener('click', () => { G.activeCut = b.dataset.cut; renderPanel(); }));
    bindSlider('step', (v) => `${v > 0 ? '+' : ''}${v} cm`, (v) => { c.back.step = v / 100; buildPreview(); });
    bindSlider('yaw', (v) => (v === 0 ? 'parallel' : `${Math.abs(v)}° · thick ${v > 0 ? 'left' : 'right'}`), (v) => { c.back.yaw = deg(v); buildPreview(); });
    bindSlider('plan', (v) => `${v}% · ${cm(D * v / 100)} cm`, (v) => { c.hingePlan = D * v / 100; buildPreview(); });
  } else if (G.step === 'falling') {
    p.innerHTML = `<div class="stepno">${icon('tree')}Timber</div><h3>Falling</h3><p>Walk your escape route — get at least 5 m back and to the side. Watch the butt and the top.</p><div id="fallLog"></div>`;
  }
}
function refreshBackReadout() {
  if (G.step !== 'back') return;
  const f = G.felling, st = f.lastStats; if (!st || !$('rT')) return;
  const D = G.tree.R * 2, T = st.hingeT;
  $('rT').textContent = `${cm(T)} cm · ${Math.round((T / D) * 100)}%`;
  $('rT').className = 'v ' + (T / D > 0.07 && T / D < 0.14 ? 'state-ok' : T / D > 0.04 ? 'state-warn' : 'state-bad');
  $('rW').textContent = `${cm(st.hingeW)} cm · ${Math.round((st.hingeW / D) * 100)}%`;
  const L = f.load;
  $('rL').textContent = L < 0 ? (f.pinched ? 'PINCHED' : 'back-leaning') : Math.round(L * 100) + '%';
  $('rL').className = 'v ' + (f.pinched ? 'state-bad' : L > 0.8 ? 'state-bad' : L > 0.5 ? 'state-warn' : '');
  if ($('rWd')) $('rWd').textContent = save.owned.includes('wedges') ? `${f.wedges}/3 · ${cm(f.wedgeLift)} cm` : 'none owned';
}

function showAction() {
  const axe = job.tool.kind === 'axe';
  show('actionbar', true);
  $('hold').innerHTML = axe ? 'Swing <kbd>Space</kbd>' : 'Hold to cut <kbd>Space</kbd>';
  $('hold').disabled = false;
  show('meter', axe);
  $('wedgeBtn').hidden = !(G.step === 'back' && save.owned.includes('wedges'));
  $('retreat').classList.remove('urgent');
  if (axe) { const sw = $('meter').querySelector('.sweet'); sw.style.left = (50 - job.tool.sweet * 50) + '%'; sw.style.width = job.tool.sweet * 100 + '%'; }
}

// ---------------- input ----------------
const holdBtn = $('hold');
const startHold = (e) => { e?.preventDefault(); sfx.initAudio(); if (job?.tool?.kind === 'axe') swingAxe(); else { G.holding = true; holdBtn.classList.add('active'); } };
const endHold = () => { G.holding = false; holdBtn.classList.remove('active'); };
holdBtn.addEventListener('pointerdown', startHold);
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) holdBtn.addEventListener(ev, endHold);
$('retreat').addEventListener('click', () => doRetreat());
$('wedgeBtn').addEventListener('click', () => driveWedge());
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.code !== 'Space') return;
  if (G.mode === 'harvest') { harvester?.key(e, true); return; }
  if (G.mode !== 'fell') return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && ['notch', 'back'].includes(G.step)) startHold(); }
  if (e.code === 'KeyR') doRetreat();
  if (e.code === 'KeyE') driveWedge();
});
window.addEventListener('keyup', (e) => {
  if (G.mode === 'harvest') { harvester?.key(e, false); return; }
  if (e.code === 'Space') endHold();
});
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  G.downAt = [e.clientX, e.clientY];
});
canvas.addEventListener('pointerup', (e) => {
  if (!G.downAt || Math.hypot(e.clientX - G.downAt[0], e.clientY - G.downAt[1]) > 6) return;
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  if (G.mode === 'harvest') { harvester?.click(raycaster); return; }
  if (G.mode === 'fell' && G.step === 'sizeup' && G.picking && world) {
    const hit = raycaster.intersectObject(world.terrain)[0];
    if (hit) {
      const s = G.tree.spec;
      G.tree.setAim(Math.atan2(hit.point.z - s.z, hit.point.x - s.x));
      G.picking = false; buildGuides(); renderPanel(); renderJobCard();
    }
  }
});

function doRetreat() {
  if (G.mode !== 'fell' || !G.felling || !['back', 'falling'].includes(G.step)) return;
  if (G.felling.player.retreating) return;
  endHold();
  G.felling.retreat();
  G.rig.hideTool(); sfx.sawStop();
  $('retreat').classList.remove('urgent');
  if (G.step === 'back') toast('You stepped out of the cut.');
}
function driveWedge() {
  const f = G.felling;
  if (!f || G.step !== 'back' || !save.owned.includes('wedges')) return;
  const prog = f.cut.method === 'bore' ? (f.cut.bore?.strapCut || 0) + 0.25 : f.cut.back.progress;
  if (prog < Math.min(0.12, G.tree.Rc * 0.6)) { toast('The back cut isn\'t deep enough to set a wedge yet.'); return; }
  if (f.wedges < 3 && f.wedgeLift >= f.wedges * 0.012) { f.wedges++; G.rig.addWedge(f.cut, f.wedges - 1); }
  const maxLift = f.wedges * 0.022;
  const hard = f.pinched ? 0.6 : 1;
  f.wedgeLift = Math.min(maxLift, f.wedgeLift + 0.0045 * hard);
  G.rig.driveWedges(Math.min(0.14, f.wedgeLift * 5));
  sfx.clank();
  f.checkRelease();
  if (f.phase !== 'standing') onRelease(); else refreshBackReadout();
}

// ---------------- cutting ----------------
function speedFactor() { return 1 + G.tree.R * 2 * 1.5; }

function handleSaw(dt) {
  const f = G.felling, c = f.cut, tr = G.tree, Rc = tr.Rc, kind = G.activeCut;
  const active = G.holding && !f.player.retreating;
  let frontX = 0;
  const n = c.notch;
  if (kind === 'top' || kind === 'bottom') {
    const key = kind === 'top' ? 'dTop' : 'dBot';
    if (active) {
      const x = Rc - n[key], chord = f.chordAtX(x);
      if (chord > f.maxCutChord()) blocked('Your bar can\'t reach across here.');
      else n[key] = Math.min(Rc * 1.9, n[key] + f.cutRate(chord) * speedFactor() * dt);
      G.cutStarted = true; G.csgDirty = true;
      if (!n.removed && n.dTop >= n.target - 0.006 && n.dBot >= n.target - 0.006) dropFace();
    }
    frontX = Rc - n[key];
  } else if (kind === 'back') {
    if (active) {
      const x = -Rc + c.back.progress, chord = f.chordAtX(x);
      if (f.pinched) blocked('Bar pinched — the kerf closed. Drive wedges (E).');
      else if (chord > f.maxCutChord()) blocked('Your bar can\'t reach across here.');
      else c.back.progress = Math.min(Rc * 2.05, c.back.progress + f.cutRate(chord) * speedFactor() * dt);
      G.cutStarted = true; G.csgDirty = true;
    }
    frontX = -Rc + c.back.progress;
  } else if (kind === 'bore' || kind === 'strap') {
    if (!c.bore) {
      const xA = Rc - n.target;
      c.bore = { step: c.back.step, yaw: c.back.yaw, hingeBack: xA - c.hingePlan, strap: Math.max(0.03, tr.R * 2 * 0.15), progress: 0, strapCut: 0 };
    }
    const b = c.bore;
    if (active) {
      G.cutStarted = true; G.csgDirty = true;
      if (kind === 'bore') {
        const len = b.hingeBack - (-Rc + b.strap);
        const avgChord = f.chordAtX(b.hingeBack - len / 2);
        b.progress = Math.min(1, b.progress + (f.cutRate(avgChord) * speedFactor() * dt) / Math.max(0.02, len));
        if (b.progress >= 1 && G.activeCut === 'bore') { G.activeCut = 'strap'; renderPanel(); toast('Hinge set. Now release the strap from behind.'); }
      } else {
        if (f.pinched) blocked('Bar pinched — drive wedges (E).');
        else b.strapCut = Math.min(b.strap + 0.01, b.strapCut + f.cutRate(f.chordAtX(-Rc + b.strapCut)) * speedFactor() * dt * 0.8);
      }
    }
    if (kind === 'bore') frontX = b.hingeBack - (b.hingeBack - (-Rc + b.strap)) * b.progress;
    else frontX = -Rc + b.strapCut;
  }
  sfx.sawSet(active ? (f.pinched ? 0.35 : 0.95) : 0.18, active ? 1 : 0);
  if (active && !f.pinched) shake = Math.max(shake, 0.22); // bar vibration
  G.rig.placeSaw(kind, c, frontX, active && !f.pinched);
  if (active && ['back', 'bore', 'strap'].includes(kind)) { f.checkRelease(); if (f.phase !== 'standing') onRelease(); }
}
function blocked(msg) { if (G.time - G.blockMsg > 2.5) { toast(msg, 'bad'); G.blockMsg = G.time; } }

let swingState = null;
function swingAxe() {
  if (!['notch', 'back'].includes(G.step) || swingState || G.felling.player.retreating) return;
  const p = G.meterPos;
  const off = Math.abs(p - 0.5), sweet = job.tool.sweet / 2;
  const q = off <= sweet ? 1 : Math.max(0.15, 1 - (off - sweet) * 2.4);
  // face notch: alternate down-strokes into the top face and up-strokes into the bottom face
  swingState = { t: 0, q, hit: false, face: (G.chopN = (G.chopN || 0) + 1) % 2 ? 'top' : 'bot' };
  sfx.swish();
}
function handleAxe(dt) {
  const f = G.felling, c = f.cut, tr = G.tree, Rc = tr.Rc, n = c.notch;
  G.meterPos = 0.5 + 0.5 * Math.sin(G.time * 3.4);
  $('meter').querySelector('.needle').style.left = `calc(${G.meterPos * 100}% - 1px)`;
  // where the bit lands on a face of the chopped V: halfway between the bark and where the faces meet
  const onFace = (face) => {
    const v = tr.axeNotch(n), x = (Rc + v.xi) / 2;
    const nrm = face === 'top' ? new THREE.Vector3(v.ta, -1, 0) : new THREE.Vector3(v.tb, 1, 0);
    return { p: new THREE.Vector3(x, face === 'top' ? v.top(x) : v.bot(x), 0), n: nrm.normalize() };
  };
  const nextFace = swingState ? swingState.face : ((G.chopN || 0) + 1) % 2 ? 'top' : 'bot';
  const target = G.step === 'notch'
    ? onFace(nextFace).p
    : new THREE.Vector3(-Rc + c.back.progress * 0.5, tr.h0 + c.back.step + 0.01, 0);
  let phase = 1;
  if (swingState) {
    swingState.t += dt;
    phase = swingState.t < 0.28 ? swingState.t / 0.28 : swingState.t < 0.42 ? 1 : 1 - (swingState.t - 0.42) / 0.3;
    if (!swingState.hit && swingState.t >= 0.28) {
      swingState.hit = true;
      const q = swingState.q;
      const chord = G.step === 'notch' ? f.chordAtX(Rc - Math.min(n.dTop, n.dBot)) : f.chordAtX(-Rc + c.back.progress);
      const D = tr.R * 2;
      const bite = D * (G.step === 'notch' ? 0.035 : 0.03) * job.tool.power * q / f.sp.hardness * (0.85 + Math.random() * 0.3);
      G.cutStarted = true; G.csgDirty = true;
      sfx.chop(0.5 + q * 0.5);
      G.hitstop = 0.035 + q * 0.035; kick(0.18 + q * 0.17);
      G.rig.particles.emit(target, new THREE.Vector3(0.4, 1.2, -1.6), 10 + q * 10, 1.4);
      if (G.step === 'notch') {
        // each stroke deepens one face (twice the bite, so the notch grows at the same pace); sloppy swings over- or under-cut it
        const key = swingState.face === 'top' ? 'dTop' : 'dBot';
        n[key] = Math.min(Rc * 1.9, Math.max(0, n[key] + bite * 2 + (1 - q) * bite * 0.9 * (Math.random() * 2 - 0.6)));
        const hit = onFace(swingState.face);
        G.rig.markHit(hit.p, hit.n, 0.72 - 0.28);
        if (q < 0.6) toast('Glancing blow.', '');
        if (!n.removed && n.dTop >= n.target - 0.01 && n.dBot >= n.target - 0.01) dropFace();
        renderPanel();
      } else {
        c.back.progress = Math.min(Rc * 2.05, c.back.progress + bite);
        // mark where the bit landed on the notch floor (the face the back camera sees) until the next swing
        const p = c.back.progress, inFloor = p > 0.03;
        // keep the mark's back edge on the floor where it can (the front edge may tuck under the uncut wood)
        const xm = -Rc + Math.min(p - 0.005, Math.max(p * 0.5, G.rig.markR));
        G.rig.markHit(new THREE.Vector3(inFloor ? xm : -Rc,tr.h0 + c.back.step + (inFloor ? -0.002 : 0.012), 0), new THREE.Vector3(inFloor ? 0 : -1, inFloor ? 1 : 0, 0), 0.72 - 0.28);
        f.checkRelease();
        if (f.phase !== 'standing') onRelease();
      }
    }
    if (swingState.t > 0.72) swingState = null;
  }
  if (G.step === 'notch' || G.step === 'back') G.rig.placeAxe(target, phase);
}

// The notch piece falls out (CSG intersection gives the real chunk with bark and end grain)
function dropFace() {
  const f = G.felling, tr = G.tree, n = f.cut.notch;
  n.removed = true;
  G.csgDirty = true;
  if (job.tool.kind === 'axe') G.rig.particles.emit(new THREE.Vector3(tr.Rc, tr.h0, 0), new THREE.Vector3(1.2, 1.4, 0), 40, 1.8);
  else try {
    const R = tr.Rc + 0.25, h0 = tr.h0, xA = tr.Rc - n.target;
    const ta = Math.tan(deg(n.top)), tb = Math.tan(deg(n.bottom));
    const wedge = new Brush(tr.prismXY([[xA, h0], [R, h0 - (R - xA) * tb], [R, h0 + (R - xA) * ta]], tr.Rc + 0.3), tr.endMat);
    const butt = new Brush(tr.buttGeo, tr.bark);
    wedge.updateMatrixWorld(); butt.updateMatrixWorld();
    const chunk = evaluator.evaluate(butt, wedge, INTERSECTION);
    const m = new THREE.Mesh(chunk.geometry, chunk.material); m.castShadow = true;
    tr.leanGroup.add(m);
    G.faceChunk = { mesh: m, v: new THREE.Vector3(0.6, 0.2, 0), w: 1.5, t: 0 };
  } catch (e) { console.warn(e); }
  sfx.crack(0.35); kick(0.25);
  toast('Face is out.', 'ok');
  renderPanel();
}

// ---------------- release & fall ----------------
function onRelease() {
  if (G.step === 'falling') return;
  const f = G.felling, tr = G.tree;
  endHold();
  G.step = 'falling';
  sfx.crack(1); sfx.rush(3); kick(0.4, 1.5);
  if (job.tool.kind === 'saw') { sfx.sawSet(0.15, 0); setTimeout(() => sfx.sawStop(), 600); }
  if (f.barber) {
    tr.barberChair(f.cut);
    tr.fallPivot.userData.x0 = tr.fallPivot.position.x;
    f.kick = { left: 0.8 + tr.R, speed: 5 }; f.kickOffset = 0;
    kick(0.9, 3);
  } else {
    tr.split(f.cut);
  }
  G.preview?.parent?.remove(G.preview); G.preview = null;
  banner('TIMBER!', f.player.retreating ? 'Keep walking' : 'Retreat — press R', 2200);
  if (!f.player.retreating) $('retreat').classList.add('urgent');
  $('hold').disabled = true; show('meter', false); $('wedgeBtn').hidden = true;
  G.releaseAt = G.time;
  setTimeout(() => { if (G.step === 'falling') camTo('fall'); }, 900);
  renderPanel();
}

function handleFellingEvents() {
  const f = G.felling;
  for (const e of f.drainEvents()) {
    switch (e.type) {
      case 'gust': if (G.step !== 'falling') toast('Gust coming through the crowns.', ''); break;
      case 'hingeBreak': sfx.crack(0.7); break;
      case 'land':
        sfx.impact(clamp(G.tree.mass / 2500, 0.4, 1.6)); kick(clamp(G.tree.mass / 3000, 0.35, 1.1), clamp(G.tree.mass / 800, 1.5, 5));
        dust(G.felling.tipPos, 60); dust(G.tree.stemPoint(G.tree.H * 0.5), 40);
        G.resultTimer = setTimeout(finishTree, 2600);
        break;
      case 'hung': sfx.crack(0.8); G.resultTimer = setTimeout(finishTree, 3000); break;
      case 'brush': sfx.crack(0.4); break;
      case 'zap': sfx.zap(); flash(0x99ccff); screenFlash.set(0.7, 0.85, 1, 0.6); kick(0.5); break;
      case 'hurt': sfx.alarm(); flash(0xff2200); screenFlash.set(0.55, 0.02, 0, 0.7); kick(0.7); save.health -= e.amount; save.stats.injuries++; updateWallet(); break;
      case 'release': break;
      default:
        if (e.text) toast(e.text, ['side', 'kick', 'dutchman', 'barberchair', 'break', 'nohinge', 'backward', 'cabin', 'fence', 'powerline', 'injury', 'hangup', 'brushed'].includes(e.type) ? 'bad' : '');
    }
  }
}

const flashLight = new THREE.PointLight(0xffffff, 0, 30);
scene.add(flashLight);
function flash(color) {
  flashLight.color.set(color); flashLight.intensity = 400;
  if (G.tree) flashLight.position.copy(G.tree.stemPoint(G.tree.h0 + 2));
}
let dustFx = null;
function dust(pos, n) {
  if (!pos) return;
  if (!dustFx) { dustFx = new Chips('#8a7a60'); dustFx.points.material.size = 0.09; dustFx.points.material.transparent = true; dustFx.points.material.opacity = 0.7; scene.add(dustFx.points); }
  dustFx.emit(pos, new THREE.Vector3(0, 1.6, 0), n, 3);
}

// ---------------- results ----------------
function finishTree() {
  const f = G.felling, tr = G.tree, loc = job.loc, D = tr.R * 2;
  const ev = f.result.events, has = (t) => ev.some((e) => e.type === t);
  const landed = f.phase === 'landed';
  const rs = f.releaseStats || { hingeT: 0, hingeW: 0 };
  const why = [];
  let pay = 0;
  const lines = [];
  // contract base
  const clean = landed && !has('hangup');
  if (clean) { pay += loc.basePay; lines.push(['Tree on the ground', loc.basePay]); }
  else lines.push(['Tree hung up — no completion pay', 0]);
  // accuracy
  const err = landed ? Math.abs(f.layError) : 90;
  const accBonus = landed ? Math.round(loc.basePay * clamp(1 - err / 25, 0, 1)) : 0;
  if (landed) { lines.push([`Lay accuracy (${err.toFixed(1)}° off)`, accBonus]); pay += accBonus; }
  // timber
  let grade = 1;
  if (f.barber) grade -= 0.5;
  if (f.broke) grade -= 0.35;
  if (f.dutchman) grade -= 0.1;
  if (has('hangup')) grade -= 0.5;
  if (tr.spec.rot) grade -= 0.3;
  grade = clamp(grade, 0.05, 1);
  const timber = Math.round(tr.merchVolume * tr.spec.sp.price * grade * 0.4);
  lines.push([`Timber share · ${tr.merchVolume.toFixed(2)} m³ × ${money(tr.spec.sp.price)} × grade ${grade.toFixed(2)}`, timber]);
  pay += timber;
  // penalties
  const fines = [];
  for (const hz of world.hazards) if (has(hz.kind)) fines.push([`Damage to ${hz.name}`, -hz.fine]);
  const brushed = ev.filter((e) => e.type === 'brushed').length;
  if (brushed) fines.push([`Damaged leave trees ×${brushed}`, -60 * brushed]);
  if (has('hangup')) fines.push(['Skidder to pull the hang-up down', -150]);
  for (const l of fines) { lines.push(l); pay += l[1]; }

  // explanation
  const T = rs.hingeT, tr10 = T / D;
  if (has('nohinge')) why.push(['bad', 'The hinge was cut through. Nothing steered the tree, so it went where its weight wanted.']);
  else if (tr10 < 0.05) why.push(['warn', `Hinge was thin at release (${cm(T)} cm, ${Math.round(tr10 * 100)}% of DBH). It tore early and lost directional control.`]);
  else if (tr10 > 0.17) why.push(['warn', `Tree went while the hinge was still ${cm(T)} cm (${Math.round(tr10 * 100)}% of DBH) — the lean pulled it over before the hinge was set.${f.cut.method === 'standard' && tr.leanLocal.x > deg(3) ? ' On a forward leaner, a bore cut sets the hinge first.' : ''}`]);
  else if (f.releaseStats) why.push(['ok', `Hinge ${cm(T)} cm thick (${Math.round(tr10 * 100)}% of DBH), ${Math.round((rs.hingeW / D) * 100)}% wide. Textbook.`]);
  const opening = f.cut.notch.top + f.cut.notch.bottom;
  if (f.dutchman) why.push(['bad', f.dutchman === 'overcut' ? 'Your face cuts crossed past the apex (a Dutchman). The notch shut within a few degrees and snapped the hinge.' : 'The face cuts never met, so the notch couldn\'t close properly.']);
  else if (opening < 44 && f.breakAngle) why.push(['warn', `A ${opening}° notch closes early — the hinge broke at ${Math.round(rad2deg(f.breakAngle || 0))}° of fall.`]);
  else if (opening >= 70 && !f.barber && f.breakAngle) why.push(['ok', `Open face (${opening}°) kept the hinge working until ${Math.round(rad2deg(f.breakAngle || 0))}° of fall.`]);
  if (f.barber) why.push(['bad', 'Barber chair. A heavy forward lean with a slow standard back cut lets the holding wood split up the stem. Bore cut leaners and release the strap last.']);
  if (has('kick')) why.push(['warn', 'The face closed hard and kicked the butt back. A step in the back cut, or a Humboldt on slopes, keeps the butt on the stump.']);
  if (f.broke) why.push(['warn', `The stem broke on impact (top hit at ${f.impactSpeed.toFixed(0)} m/s). Fall uphill or onto a bench, and avoid rocks and old logs.`]);
  if (has('hangup')) why.push(['bad', 'Hung up in a neighbour. Pick lays through gaps between crowns.']);
  if (Math.abs(f.layError || 0) > 8 && landed && !has('nohinge')) why.push(['warn', `Off by ${err.toFixed(0)}°. Side lean and wind push the tree once the hinge lets go; a tapered hinge (thicker on the side you want) pulls it back.`]);
  const retreatDelay = f.retreatTime != null && f.releaseTime != null ? f.retreatTime - f.releaseTime : null;
  if (!f.player.retreating) why.push(['bad', 'You never walked out. Leave the stump on your escape route the moment the tree starts to go.']);
  else if (retreatDelay != null && retreatDelay > 2) why.push(['warn', `You took ${retreatDelay.toFixed(1)} s to start your retreat.`]);
  else if (!f.playerHitBy) why.push(['ok', 'Good retreat down the escape route.']);
  else why.push(['warn', 'You were moving, but not far enough, fast enough. Start walking the moment the tree commits.']);
  if (f.playerHitBy) why.unshift(['bad', `Injury: ${f.playerHitBy}.`]);

  // grade letter
  let score = 100 - err * 1.6 - (f.dutchman ? 15 : 0) - (f.barber ? 35 : 0) - (has('hangup') ? 40 : 0) - (f.broke ? 15 : 0) - fines.length * 15 - (f.playerHitBy ? 40 : 0) - (!f.player.retreating ? 15 : 0);
  if (f.releaseStats && (tr10 < 0.05 || tr10 > 0.17)) score -= 10;
  const letter = score >= 90 ? 'A' : score >= 78 ? 'B' : score >= 62 ? 'C' : score >= 45 ? 'D' : 'F';

  save.cash += pay;
  save.stats.felled++; save.stats.earned += Math.max(0, pay);
  if (landed) { save.stats.accSum += err; save.stats.accN++; }
  job.done.add(G.treeIdx);
  tr.spec.felled = true;
  job.results.push({ pay, letter, err });
  persist(); updateWallet();
  if (pay > 0) sfx.cash();

  const dead = save.health <= 0;
  const remaining = job.trees.map((t, i) => i).filter((i) => !job.done.has(i));
  const delay = (i) => `style="animation-delay:${0.25 + i * 0.06}s"`;
  $('modalCard').innerHTML = `<div class="result-head"><div class="grade g-${letter}">${letter}</div><div><div class="lbl">${tr.spec.sp.name} · ${cm(D)} cm DBH · ${tr.H.toFixed(0)} m</div>
    <h2>${f.playerHitBy ? 'Injured' : has('hangup') ? 'Hung up' : f.barber ? 'Barber chair' : err < 5 ? 'On the stake' : err < 15 ? 'Down' : 'Down, but wide'}</h2></div></div>
    <table class="ledger">${lines.map(([k, v], i) => `<tr class="${v < 0 ? 'neg' : ''}" ${delay(i)}><td>${k}</td><td>${money(v)}</td></tr>`).join('')}
    <tr class="total" ${delay(lines.length)}><td>Paid</td><td id="paidV">${money(0)}</td></tr></table>
    <div class="lbl">What happened</div>
    <ul class="why">${why.map(([k, t], i) => `<li class="${k}" ${delay(lines.length + 1 + i)}>${t}</li>`).join('')}</ul>
    ${dead ? `<p class="state-bad">You're going to the hospital. Medical bills take ${money(Math.max(200, save.cash * 0.3))}.</p>` : ''}
    <div class="btn-row">${!dead && remaining.length ? '<button class="go ghost" id="mLook" type="button">Look around</button>' : ''}
    <button class="go" id="mNext" type="button">${dead ? 'Back to camp' : remaining.length ? 'Next tree →' : 'Finish contract'}</button></div>`;
  show('modal', true); show('actionbar', false);
  countUp($('paidV'), pay, 900, 450 + lines.length * 60);
  $('mNext').onclick = () => {
    show('modal', false);
    if (dead) { save.cash -= Math.max(200, save.cash * 0.3); save.health = 60; persist(); endJob(true); return; }
    if (remaining.length) selectTree(remaining[0]); else fadeThen(() => endJob());
  };
  $('mLook')?.addEventListener('click', () => {
    show('modal', false);
    const p = $('panel'); p.innerHTML = '<div class="stepno">Inspect</div><h3>Look around</h3><p>Orbit with the mouse to inspect the stump and the lay.</p><button class="go" id="mBack" type="button">Next tree →</button>';
    $('mBack').onclick = () => selectTree(remaining[0]);
  });
}

// animate a money figure from 0 to v
function countUp(el, v, ms, wait = 0) {
  const t0 = performance.now() + wait;
  const step = (now) => { const k = clamp((now - t0) / ms, 0, 1), e = 1 - Math.pow(1 - k, 3); el.textContent = money(v * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => (el.textContent = money(v)), wait + ms + 50); // in case frames are throttled
}

function endJob(hospital = false) {
  const res = job.results;
  const total = res.reduce((a, r) => a + r.pay, 0);
  save.stats.jobs++;
  save.health = Math.min(100, save.health + 15);
  persist();
  clearWorld();
  toMenu();
  if (!hospital && res.length) toast(`Contract closed: ${res.length} trees, ${money(total)} paid.`, 'ok');
}
function endHarvest(r) {
  save.cash += r.pay; save.stats.felled += r.trees; save.stats.earned += r.pay; save.stats.jobs++;
  persist(); clearWorld(); toMenu();
  toast(`Shift over: ${r.trees} stems, ${r.logs} logs, ${money(r.pay)}.`, 'ok');
}

$('menuBtn').addEventListener('click', () => {
  if (G.mode === 'menu') return;
  $('modalCard').innerHTML = `<div class="lbl">Camp</div><h2>Leave the contract?</h2><p>Trees already down stay paid. The rest go to another crew.</p>
    <div class="btn-row"><button class="go ghost" id="lNo" type="button">Keep working</button><button class="go" id="lYes" type="button">Back to camp</button></div>`;
  show('modal', true);
  $('lYes').onclick = () => { show('modal', false); fadeThen(() => { if (G.mode === 'harvest') harvester.finish(); else endJob(); }); };
  $('lNo').onclick = () => show('modal', false);
});

// ---------------- plan view ----------------
const planC = $('planC'), pctx = planC.getContext('2d');
function drawPlan() {
  const f = G.felling, tr = G.tree; if (!f) return;
  const c = f.cut, n = c.notch, Rc = tr.Rc, D = tr.R * 2;
  const W = planC.width, H = planC.height;
  pctx.clearRect(0, 0, W, H);
  // ---- top view
  const cx = 160, cy = 170, s = 128 / Rc;
  const P = (x, z) => [cx + z * s, cy - x * s];
  pctx.save();
  const sp = tr.spec.sp, grd = pctx.createRadialGradient(cx, cy, 0, cx, cy, Rc * s);
  grd.addColorStop(0, sp.heart); grd.addColorStop(0.62, sp.heart); grd.addColorStop(0.74, sp.sap); grd.addColorStop(1, sp.sap);
  pctx.beginPath(); pctx.arc(cx, cy, Rc * s, 0, Math.PI * 2); pctx.fillStyle = grd; pctx.fill();
  pctx.clip();
  pctx.strokeStyle = 'rgba(70,40,18,0.2)'; pctx.lineWidth = 1;
  for (let r = 0.08; r < 1; r += 0.08) { pctx.beginPath(); pctx.arc(cx, cy, Rc * s * r, 0, Math.PI * 2); pctx.stroke(); }
  const xA = Rc - n.target;
  const rect = (x0, x1, z0, z1, fill) => { const [a, b] = P(x1, z0), [c2, d] = P(x0, z1); pctx.fillStyle = fill; pctx.fillRect(a, b, c2 - a, d - b); };
  // notch
  if (n.removed) rect(xA, Rc + 0.1, -Rc - 0.1, Rc + 0.1, '#0b100d');
  else if (n.dTop > 0 || n.dBot > 0) rect(xA, Rc + 0.1, -Rc - 0.1, Rc + 0.1, 'rgba(255,107,26,0.18)');
  // kerf lines
  for (const [d, col] of [[n.dTop, '#ff6b1a'], [n.dBot, '#f2c230']]) if (d > 0) {
    const [x1, y1] = P(Rc - d, -Rc), [x2, y2] = P(Rc - d, Rc);
    pctx.strokeStyle = col; pctx.lineWidth = 2; pctx.beginPath(); pctx.moveTo(x1, y1); pctx.lineTo(x2, y2); pctx.stroke();
  }
  // back cut / bore regions
  const poly = (pts, fill) => { pctx.beginPath(); pts.forEach(([x, z], i) => { const [u, v] = P(x, z); i ? pctx.lineTo(u, v) : pctx.moveTo(u, v); }); pctx.closePath(); pctx.fillStyle = fill; pctx.fill(); };
  const Z = Rc + 0.1;
  if (c.method === 'standard' && c.back.progress > 0) {
    const ty = Math.tan(c.back.yaw), xb = (z) => -Rc + c.back.progress + z * ty;
    poly([[-Rc - 0.1, -Z], [xb(-Z), -Z], [xb(Z), Z], [-Rc - 0.1, Z]], '#0b100d');
    poly([[xb(-Z), -Z], [xA, -Z], [xA, Z], [xb(Z), Z]], 'rgba(255,107,26,0.55)');
  } else if (c.bore) {
    const b = c.bore, ty = Math.tan(b.yaw), xH = (z) => b.hingeBack + z * ty, xS = -Rc + b.strap;
    const span = (b.hingeBack - xS) * Math.min(1, b.progress);
    poly([[xH(-Z) - span, -Z], [xH(-Z), -Z], [xH(Z), Z], [xH(Z) - span, Z]], '#0b100d');
    poly([[xH(-Z), -Z], [xA, -Z], [xA, Z], [xH(Z), Z]], 'rgba(255,107,26,0.55)');
    if (b.strapCut > 0) poly([[-Rc - 0.1, -Z], [-Rc + b.strapCut, -Z], [-Rc + b.strapCut, Z], [-Rc - 0.1, Z]], '#0b100d');
    else poly([[-Rc - 0.1, -Z], [xS, -Z], [xS, Z], [-Rc - 0.1, Z]], 'rgba(127,183,217,0.35)');
  }
  if (tr.spec.rot && (c.back.progress > 0 || n.removed)) { pctx.beginPath(); pctx.arc(cx, cy, tr.spec.rot * Rc * s, 0, Math.PI * 2); pctx.fillStyle = 'rgba(60,40,25,0.75)'; pctx.fill(); }
  // target hinge line
  if (G.step === 'back' || G.step === 'notch') {
    const xt = xA - D * 0.1; const [x1, y1] = P(xt, -Rc), [x2, y2] = P(xt, Rc);
    pctx.setLineDash([4, 4]); pctx.strokeStyle = '#8fd16a'; pctx.lineWidth = 1.5; pctx.beginPath(); pctx.moveTo(x1, y1); pctx.lineTo(x2, y2); pctx.stroke(); pctx.setLineDash([]);
  }
  pctx.restore();
  pctx.strokeStyle = '#2b221b'; pctx.lineWidth = 6; pctx.beginPath(); pctx.arc(cx, cy, Rc * s, 0, Math.PI * 2); pctx.stroke();
  // arrows
  const arrow = (ang, len, col, label) => {
    const x2 = cx + Math.sin(ang) * len, y2 = cy - Math.cos(ang) * len;
    pctx.strokeStyle = col; pctx.fillStyle = col; pctx.lineWidth = 3; pctx.beginPath(); pctx.moveTo(cx, cy); pctx.lineTo(x2, y2); pctx.stroke();
    const a = Math.atan2(y2 - cy, x2 - cx);
    pctx.beginPath(); pctx.moveTo(x2 + Math.cos(a) * 10, y2 + Math.sin(a) * 10); pctx.lineTo(x2 + Math.cos(a + 2.4) * 9, y2 + Math.sin(a + 2.4) * 9); pctx.lineTo(x2 + Math.cos(a - 2.4) * 9, y2 + Math.sin(a - 2.4) * 9); pctx.fill();
    if (label) { pctx.font = '600 15px "Barlow Condensed", sans-serif'; pctx.fillText(label, x2 + Math.cos(a) * 16 - 12, y2 + Math.sin(a) * 16 + 5); }
  };
  arrow(0, 150, '#ff6b1a', 'LAY');
  const L = tr.leanLocal; if (L.length() > deg(0.5)) arrow(Math.atan2(L.y, L.x), 40 + rad2deg(L.length()) * 7, '#ff4433', 'LEAN');
  const wa = f.wind.az - tr.aim; if (f.wind.speed > 0.8) arrow(wa, 30 + f.wind.speed * 7, '#7fb7d9', 'WIND');
  // ---- side profile
  const ox = 470, oy = 210, s2 = Math.min(150 / Rc, 900);
  const S = (x, y) => [ox + x * s2, oy - (y - tr.h0) * s2];
  pctx.save();
  pctx.beginPath(); pctx.rect(340, 0, 260, H); pctx.clip();
  pctx.fillStyle = '#2b221b';
  const [l1, t1] = S(-Rc, tr.h0 + 1.2), [r1, b1] = S(Rc, tr.h0 - 1.2);
  pctx.fillRect(l1, t1, r1 - l1, b1 - t1);
  const lg = pctx.createLinearGradient(l1, 0, r1, 0);
  lg.addColorStop(0, sp.sap); lg.addColorStop(0.2, sp.heart); lg.addColorStop(0.8, sp.heart); lg.addColorStop(1, sp.sap);
  pctx.fillStyle = lg;
  pctx.fillRect(l1 + 5, t1, r1 - l1 - 10, b1 - t1);
  const ta = Math.tan(deg(n.top)), tb = Math.tan(deg(n.bottom));
  const line = (x0, y0, x1, y1, col, w = 2, dash) => { const [a, b] = S(x0, y0), [c2, d] = S(x1, y1); pctx.strokeStyle = col; pctx.lineWidth = w; pctx.setLineDash(dash || []); pctx.beginPath(); pctx.moveTo(a, b); pctx.lineTo(c2, d); pctx.stroke(); pctx.setLineDash([]); };
  if (n.removed) {
    const pts = [S(xA, tr.h0), S(Rc + 0.05, tr.h0 + (Rc + 0.05 - xA) * ta), S(Rc + 0.05, tr.h0 - (Rc + 0.05 - xA) * tb)];
    pctx.fillStyle = '#0b100d'; pctx.beginPath(); pts.forEach(([u, v], i) => (i ? pctx.lineTo(u, v) : pctx.moveTo(u, v))); pctx.fill();
  }
  line(xA, tr.h0, Rc, tr.h0 + (Rc - xA) * ta, 'rgba(255,107,26,0.5)', 1, [3, 3]);
  line(xA, tr.h0, Rc, tr.h0 - (Rc - xA) * tb, 'rgba(242,194,48,0.5)', 1, [3, 3]);
  if (n.dTop > 0) line(Rc, tr.h0 + (Rc - xA) * ta, Rc - n.dTop, tr.h0 + (Rc - n.dTop - xA) * ta, '#ff6b1a', 3);
  if (n.dBot > 0) line(Rc, tr.h0 - (Rc - xA) * tb, Rc - n.dBot, tr.h0 - (Rc - n.dBot - xA) * tb, '#f2c230', 3);
  const yb = tr.h0 + (c.method === 'bore' && c.bore ? c.bore.step : c.back.step);
  line(-Rc, yb, xA - D * 0.1, yb, 'rgba(143,209,106,0.6)', 1, [3, 3]);
  if (c.method === 'standard' && c.back.progress > 0) {
    const xf = -Rc + c.back.progress;
    if (n.type === 'axe') { // chopped back notch: flat bottom, 45° top
      const pts = [S(xf, yb), S(-Rc - 0.05, yb), S(-Rc - 0.05, yb + c.back.progress + 0.05)];
      pctx.fillStyle = '#0b100d'; pctx.beginPath(); pts.forEach(([u, v], i) => (i ? pctx.lineTo(u, v) : pctx.moveTo(u, v))); pctx.fill();
    }
    line(-Rc, yb, xf, yb, '#ebe5d3', 3);
  }
  if (c.bore) { const b = c.bore; line(b.hingeBack - (b.hingeBack - (-Rc + b.strap)) * Math.min(1, b.progress), yb, b.hingeBack, yb, '#ebe5d3', 3); if (b.strapCut) line(-Rc, yb, -Rc + b.strapCut, yb, '#ebe5d3', 3); }
  pctx.restore();
  pctx.fillStyle = '#ebe5d3'; pctx.font = '500 14px "IBM Plex Mono", monospace';
  pctx.fillText(`${n.top}° / ${n.bottom}°`, 350, 22);
  pctx.fillText(`step ${(c.back.step * 100).toFixed(1)} cm`, 350, 40);
  $('planNote').textContent = `Ø ${cm(D)} cm`;
}

// ---------------- frame loop ----------------
const clock = new THREE.Clock();
let planT = 0, menuOrbit = 0;
function tick() {
  const raw = clock.getDelta();
  if (!document.hidden) watchQuality(Math.min(raw, 0.1));
  frame(Math.min(raw, 0.05));
  requestAnimationFrame(tick);
}
function frame(dt) {
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.06; } // axe impact freeze-frame
  G.time += dt;
  const ws = job?.wind?.speed ?? 2;
  wind.value.x += dt * (0.7 + ws * 0.12); wind.value.y = 0.006 + ws * 0.0022;
  if (G.mode === 'fell' && G.felling) {
    const f = G.felling;
    f.update(dt);
    G.rig.update(dt);
    if (G.step === 'notch' || G.step === 'back') { if (job.tool.kind === 'saw') handleSaw(dt); else handleAxe(dt); }
    if (G.step === 'falling') G.rig.hideTool();
    // guide planes step back once cutting starts so the wood being removed stays readable
    previewMat.opacity = previewMat2.opacity = G.cutStarted ? 0.1 : 0.28;
    // CSG refresh
    G.csgT -= dt;
    if (G.csgDirty && G.csgT <= 0 && G.step !== 'falling' && G.step !== 'sizeup') { G.tree.updateCuts(f.cut); G.csgDirty = false; G.csgT = 0.12; }
    // the faller walks out
    if (f.player.retreating) G.rig.setFaller(f.player.x, f.player.z, 1.4, 'walk');
    // creaks as the holding wood loads up
    if (G.step === 'back' && f.load > 0.6) { G.creakT -= dt * f.load; if (G.creakT < 0) { sfx.creak(f.load); G.creakT = 0.6 + Math.random() * 1.2; } }
    if (G.step === 'falling' && f.phase === 'hinge') { G.creakT -= dt * 3; if (G.creakT < 0) { sfx.creak(1); G.creakT = 0.25 + Math.random() * 0.3; } }
    handleFellingEvents();
    // crown sway with wind
    if (f.phase === 'standing') G.tree.upper.rotation.z = Math.sin(G.time * 0.9) * 0.002 * f.wind.speed + f.wind.gust * 0.004;
    if (G.faceChunk) {
      const fc = G.faceChunk; fc.t += dt; fc.v.y -= 9.8 * dt;
      fc.mesh.position.addScaledVector(fc.v, dt); fc.mesh.rotation.z -= fc.w * dt;
      if (fc.mesh.position.y < -G.tree.h0 + 0.05) { fc.mesh.position.y = -G.tree.h0 + 0.05; fc.v.set(0, 0, 0); fc.w = 0; }
      if (fc.t > 3) G.faceChunk = null;
    }
    if (G.step === 'falling' && !f.player.retreating && G.time - G.releaseAt > 2 && !G.retreatWarned) { G.retreatWarned = true; toast('Get off the stump!', 'bad'); }
    planT -= dt; if (planT <= 0) { drawPlan(); refreshBackReadout(); planT = 0.07; }
  }
  if (G.mode === 'harvest') harvester?.update(dt);
  if (G.mode === 'menu' && world) {
    menuOrbit += dt * 0.03;
    const r = 26; const x = Math.cos(menuOrbit) * r, z = Math.sin(menuOrbit) * r;
    camera.position.set(x, world.height(x, z) + 6, z); controls.target.set(0, world.height(0, 0) + 7, 0);
  }
  if (tween) {
    tween.t += dt / tween.dur;
    const k = tween.t >= 1 ? 1 : 1 - Math.pow(1 - tween.t, 3);
    camera.position.lerpVectors(tween.p0, tween.p1, k); controls.target.lerpVectors(tween.t0, tween.t1, k);
    if (tween.t >= 1) tween = null;
  }
  flashLight.intensity *= 0.85;
  dustFx?.update(dt);
  controls.update();
  renderView(dt);
}

// Camera shake from "trauma" (smooth noise, decays), an FOV kick, and a screen flash; all applied only for the render.
let fovKick = 0;
const screenFlash = new THREE.Vector4();
function kick(amount, fov = 0) { shake = Math.min(1.2, shake + amount); fovKick = Math.max(fovKick, fov); }
function renderView(dt) {
  shake = Math.max(0, shake - dt * 1.4);
  fovKick *= Math.exp(-dt * 5);
  const t = G.time * 31, s = shake * shake;
  const off = new THREE.Vector3(Math.sin(t) + Math.sin(t * 2.3), Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1), Math.sin(t * 1.3 + 2)).multiplyScalar(s * 0.06);
  const roll = Math.sin(t * 0.9 + 4) * s * 0.02;
  camera.position.add(off); camera.rotateZ(roll);
  if (fovKick > 0.01) { camera.fov = 55 + fovKick; camera.updateProjectionMatrix(); }
  screenFlash.w *= Math.exp(-dt * 4);
  if (post) { post.finish.uniforms.flash.value.copy(screenFlash); post.render(dt); } else renderer.render(scene, camera);
  camera.rotateZ(-roll); camera.position.sub(off);
  if (camera.fov !== 55 && fovKick <= 0.01) { camera.fov = 55; camera.updateProjectionMatrix(); }
}

// Drop ambient occlusion, then resolution, if the frame rate can't keep up.
let frameEma = 1 / 60, qualityT = 0;
function watchQuality(raw) {
  frameEma += (raw - frameEma) * 0.03;
  qualityT += raw;
  if (qualityT < 4) return;
  if (frameEma > 0.03 && post?.aoOn) { post.setAO(false); qualityT = 0; console.info('Timberline: ambient occlusion off for frame rate'); }
  else if (frameEma > 0.036 && pixelRatio > 1) { pixelRatio = 1; resize(); qualityT = 0; console.info('Timberline: render scale 1×'); }
}

function toMenu() {
  G.mode = 'menu';
  show('hud', false); show('wallet', false); show('panel', false); show('plan', false); show('actionbar', false); show('meter', false);
  if (!world) {
    const loc = LOCATIONS[0];
    world = new World(scene, renderer, loc, 12345);
    world.generateStand(0);
    world.scatterGround();
    world.buildLeaveTrees([]);
  }
  show('menu', true);
  renderMenu();
}

// ---------------- boot ----------------
(async function boot() {
  post = await createPost(renderer, scene, camera);
  resize();
  await assets.load((p) => { $('loadBar').style.width = Math.round(p * 100) + '%'; });
  $('loadMsg').textContent = 'Growing the stand…';
  await new Promise((r) => setTimeout(r, 30));
  toMenu();
  $('loading').style.opacity = '0';
  setTimeout(() => show('loading', false), 650);
  requestAnimationFrame(tick);
  window.__timberline = { G, get post() { return post; }, get world() { return world; }, get job() { return job; }, get harvester() { return harvester; }, save, startJob, LOCATIONS, camera, controls, THREE, shot: () => { controls.update(); renderView(0); return fetch('/shot', { method: 'POST', body: canvas.toDataURL('image/jpeg', 0.85) }); }, look: (p, t) => { tween = null; camera.position.copy(p); controls.target.copy(t); }, step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); } };
})();
