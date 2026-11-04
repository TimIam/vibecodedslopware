// Binding Order: a lockpicking simulator drawn as a live blueprint.
// Two views of one scene: SECTION A-A (orthographic cutaway, hatched caps) and VIEW B (perspective keyway view
// with the hands, tension gauge and pick location). The mechanics live in sim.js, the drawing in build.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { JOBS, FAMILY_TOOLS, makeLock } from './locks.js';
import { LockView } from './build.js';
import { setCut, SHARED, INK } from './blueprint.js';
import { Sfx } from './audio.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const qs = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------------------------- renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.localClippingEnabled = true;
renderer.autoClear = false;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x16426e, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(-40, 90, 70);
scene.add(key);
const side = new THREE.DirectionalLight(0xffffff, 1.1);
side.position.set(120, 30, 20);
scene.add(side);

const camSec = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 2000);
camSec.layers.enable(1);
const camKw = new THREE.PerspectiveCamera(30, 1, 1, 3000);
camKw.layers.enable(2);

// ---------------------------------------------------------------------------------------------- assets
const ASSETS = {};
async function loadAssets() {
  const loader = new GLTFLoader();
  const glb = url => new Promise((res, rej) => loader.load(url, g => res(g), undefined, rej));
  const json = url => fetch(url).then(r => r.json());
  const [locks, tools, hands, meta, toolsJson, handsJson] = await Promise.all([
    glb('assets/locks.glb'), glb('assets/tools.glb'), glb('assets/hands.glb'),
    json('assets/locks.json'), json('assets/tools.json'), json('assets/hands.json')]);
  const byName = g => {
    const o = {};
    g.scene.traverse(n => { if (n.isMesh) o[n.name] = n; });
    return o;
  };
  Object.assign(ASSETS, { locks: byName(locks), tools: byName(tools), hands: byName(hands), meta, toolsJson, handsJson });
}

// ---------------------------------------------------------------------------------------------- state
const sfx = new Sfx();
const PROG_KEY = 'binding-order-progress';
let prog = { best: {}, opened: {} };
try { prog = { ...prog, ...JSON.parse(localStorage.getItem(PROG_KEY) || '{}') }; } catch (e) { /* private mode */ }
const saveProg = () => { try { localStorage.setItem(PROG_KEY, JSON.stringify(prog)); } catch (e) { /* ignore */ } };

const G = {
  jobIdx: 0, job: null, sim: null, view: null, seed: 1, tools: [], tool: 0,
  input: { p: 0, h: 0, T: 0, flip: false, select: 0 }, Ttarget: 0, slack: false,
  t: 0, started: false, picks: 3, aids: true, mode: 'menu', openT: 0, doneShown: false, msgT: 0, lastDrop: 0,
};

function startJob(idx, seed) {
  G.jobIdx = idx;
  const job = JOBS[idx];
  G.job = job;
  G.seed = seed ?? (Math.floor(Math.random() * 1e6) + 1);
  const meta = ASSETS.meta[job.model];
  if (G.view) scene.remove(G.view.root);
  G.sim = makeLock(job, meta, G.seed);
  G.view = new LockView(ASSETS, job, meta, G.sim);
  scene.add(G.view.root);
  G.tools = FAMILY_TOOLS[meta.family];
  G.tool = 0;
  G.input = { p: 2, h: G.sim.geo.tipMin ?? 0, T: 0, flip: false, select: 0 };
  G.Ttarget = 0;
  G.t = 0; G.started = false; G.picks = 3; G.openT = 0; G.doneShown = false;
  G.aids = job.aids;
  selectTool(0, true);
  buildToolTray();
  buildPinsRow();
  $('tName').textContent = job.title;
  $('tDwg').textContent = 'BO-' + job.id;
  $('tKind').textContent = job.kind;
  $('par').textContent = 'PAR ' + fmt(job.par).replace(/\.\d$/, '');
  const fam = meta.family;
  $('secTag').innerHTML = fam === 'lever' ? 'SECTION B–B<small>COVER REMOVED · LEVER PACK · 3:1</small>'
    : fam === 'tubular' ? 'SECTION A–A<small>ROTATES WITH THE FEELER IN HAND · 4:1</small>'
    : 'SECTION A–A<small>CUTAWAY ELEVATION · 4:1</small>';
  $('hintExtra').innerHTML = fam === 'wafer' ? '<kbd>F</kbd> flip pick · ' : fam === 'tubular' ? '<kbd>A</kbd><kbd>D</kbd> feeler · ' : '';
  G.mode = 'play';
  $('menu').hidden = true;
  $('done').hidden = true;
  fitSection();
  updateHud();
  if (job.id === '01' && !prog.opened['01']) say('TENSION FIRST', 'roll the wheel up a little, then find the pin that won\'t lift easily');
}

function selectTool(i, quiet) {
  G.tool = (i + G.tools.length) % G.tools.length;
  const id = G.tools[G.tool];
  const td = ASSETS.toolsJson[id] || { top: [[0, 0]] };
  G.sim.setTool(G.sim.geo.family === 'tubular' ? { top: [[0, 0]] } : td);
  G.view.setTool(id);
  if (G.sim.geo.tipMin !== undefined) G.input.h = G.sim.tip.flip ? -G.sim.geo.tipMin : G.sim.geo.tipMin;
  document.querySelectorAll('.tool').forEach((b, k) => b.classList.toggle('on', k === G.tool));
  if (!quiet) sfx.play('tool');
}

function toolIcon(id) {
  const td = ASSETS.toolsJson[id];
  if (td && td.bit) {
    const [z0, z1, y0, y1] = td.bit;
    return `<svg viewBox="0 0 44 14"><line x1="4" y1="10" x2="42" y2="10" stroke="currentColor" stroke-width="1.6"/><rect x="${4 + z0 * 3}" y="${10 - y1 * 1.3}" width="${(z1 - z0) * 3}" height="${(y1 - y0) * 1.3}" fill="currentColor"/></svg>`;
  }
  if (!td || !td.top) return '<svg viewBox="0 0 44 14"><rect x="2" y="5" width="40" height="4" fill="none" stroke="currentColor"/><circle cx="6" cy="7" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/></svg>';
  const pts = td.top.filter(p => p[0] < 14).map(p => `${3 + p[0] * 2.6},${11 - p[1] * 2.6}`);
  return `<svg viewBox="0 0 44 14"><polyline points="${pts.join(' ')} 42,${11 - 0.8 * 2.6}" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="3" y1="${11 + 0.8 * 2.6 - 0.5}" x2="42" y2="${11 + 0.8 * 2.6 - 0.5}" stroke="currentColor" stroke-width="1.3"/></svg>`;
}

function buildToolTray() {
  const el = $('tools');
  el.innerHTML = '';
  G.tools.forEach((id, k) => {
    const b = document.createElement('button');
    b.className = 'tool' + (k === G.tool ? ' on' : '');
    const label = id === 'tubular' ? 'Tubular pick' : (ASSETS.toolsJson[id]?.label || id);
    b.innerHTML = `${toolIcon(id)}<span>${label}</span><kbd>${k + 1}</kbd>`;
    b.onclick = () => selectTool(k);
    el.appendChild(b);
  });
}

function buildPinsRow() {
  const el = $('pinsRow');
  el.innerHTML = '';
  for (const s of G.sim.stacks) {
    const d = document.createElement('i');
    d.style.cssText = 'width:12px;height:12px;border:1px solid rgba(220,239,255,.55);display:block';
    el.appendChild(d);
  }
}

// ---------------------------------------------------------------------------------------------- layout + cameras
function panelRect(el) {
  const c = canvas.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - c.left + 2, y: r.top - c.top + 2, w: r.width - 4, h: r.height - 4 };
}

function fitSection() {
  const v = G.view, m = v.meta, f = m.family;
  const rect = panelRect($('sec'));
  const aspect = rect.w / Math.max(1, rect.h);
  const sp = v.sectionPlane;
  let box;
  if (f === 'lever') { const [x0, x1, z0, z1] = m.box; box = [[x0 - 4, z0 - 4, -10], [x1 + 4, z1 + 4, 2]]; }
  else if (f === 'tubular') box = [[-12, -12, -(m.length + 1)], [12, 12, 16]];
  else if (f === 'warded') { const d = m.box[4]; box = [[0, -14, -(d + 2)], [0, 14, 16]]; }
  else {
    const top = (m.shellTop ?? m.plugR + 3) + 3;
    const bot = f === 'wafer' ? -(m.plugR + 4) : -11;
    box = [[0, bot, -(m.length + 4)], [0, top, 17]];
  }
  const fwd = sp.view.clone().negate();
  const up = sp.up.clone();
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  const c = V3((box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2, (box[0][2] + box[1][2]) / 2);
  if (f === 'tubular') { c.x = 0; c.y = 0; }
  let rx = 0, ry = 0;
  for (const x of [box[0][0], box[1][0]]) for (const y of [box[0][1], box[1][1]]) for (const z of [box[0][2], box[1][2]]) {
    const q = V3(x, y, z).sub(c);
    rx = Math.max(rx, Math.abs(q.dot(right)));
    ry = Math.max(ry, Math.abs(q.dot(up)));
  }
  let hw = Math.max(rx, ry * aspect) * 1.04, hh = hw / aspect;
  camSec.left = -hw; camSec.right = hw; camSec.top = hh; camSec.bottom = -hh;
  camSec.position.copy(c).addScaledVector(sp.view, 300);
  camSec.up.copy(up);
  camSec.lookAt(c);
  camSec.updateProjectionMatrix();
  G.secKey = v._planeKey;
}

function fitKeyway() {
  const f = G.view.family;
  const rect = panelRect($('kw'));
  camKw.aspect = rect.w / Math.max(1, rect.h);
  let tgt, dir, dist;
  if (f === 'lever') { tgt = V3(-4, -2, -4); dir = V3(-0.42, 0.3, 0.86); dist = 230; }
  else if (f === 'warded') { tgt = V3(-4, -4, -2); dir = V3(-0.78, 0.34, 0.53); dist = 230; }
  else if (f === 'tubular') { tgt = V3(-2, -3, 2); dir = V3(-0.78, 0.36, 0.52); dist = 175; }
  else { tgt = V3(4, -10, 22); dir = V3(-0.46, 0.42, 0.78); dist = 235; }
  const narrow = camKw.aspect < 1.1 ? 1.25 : 1;
  camKw.position.copy(tgt).addScaledVector(dir.normalize(), dist * narrow);
  camKw.lookAt(tgt);
  camKw.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------------------------- input
const keys = new Set();
let locked = false;
const secEl = $('sec');
secEl.addEventListener('mousedown', e => {
  sfx.start();
  if (G.mode !== 'play') return;
  if (!locked && secEl.requestPointerLock) secEl.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === secEl;
  document.body.classList.toggle('locked', locked);
});
let selAcc = 0;
document.addEventListener('mousemove', e => {
  if (!locked || G.mode !== 'play') return;
  const fine = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 0.35 : 1;
  moveHand(e.movementX * fine, e.movementY * fine);
});
function moveHand(dx, dy) {
  const g = G.sim.geo, f = g.family, inp = G.input;
  G.started = true;
  if (f === 'tubular') {
    selAcc += dx;
    if (Math.abs(selAcc) > 70) { cycleFeeler(Math.sign(selAcc)); selAcc = 0; }
    inp.h = clamp(inp.h - dy * 0.01, g.tipMin, g.tipMax + 0.6);
    return;
  }
  inp.p = clamp(inp.p + dx * 0.035, 0, g.reach + 1);
  if (f !== 'warded') {
    const lo = inp.flip ? -g.tipMax - 0.6 : g.tipMin, hi = inp.flip ? -g.tipMin : g.tipMax + 0.6;
    inp.h = clamp(inp.h - dy * 0.011, lo, hi);
  }
}
function cycleFeeler(d) {
  const n = G.sim.stacks.length;
  G.input.select = (G.input.select + d + n) % n;
  G.input.h = 0;
  sfx.play('tool');
}
// drag fallback (touch, or no pointer lock): absolute mapping inside the section panel
let dragging = null;
secEl.addEventListener('pointerdown', e => { if (!locked) { dragging = { x: e.clientX, y: e.clientY }; sfx.start(); } });
document.addEventListener('pointerlockerror', () => say('NO MOUSE LOCK', 'drag in the section to move the pick instead'));
window.addEventListener('pointermove', e => {
  if (!dragging || locked || G.mode !== 'play') return;
  moveHand((e.clientX - dragging.x) * 1.2, (e.clientY - dragging.y) * 1.2);
  dragging = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', () => { dragging = null; });
window.addEventListener('wheel', e => {
  if (G.mode !== 'play') return;
  e.preventDefault();
  if (G.sim.geo.family === 'tubular' && e.shiftKey) { cycleFeeler(Math.sign(e.deltaY)); return; }
  const step = Math.sign(e.deltaY) * (Math.abs(e.deltaY) > 40 ? 0.04 : 0.02);
  G.Ttarget = clamp(G.Ttarget - step, 0, 1);
  G.started = true;
}, { passive: false });
const tBar = $('tBar');
const setFromBar = e => { const r = tBar.getBoundingClientRect(); G.Ttarget = clamp((e.clientX - r.left) / r.width, 0, 1); };
tBar.addEventListener('pointerdown', e => { setFromBar(e); tBar.setPointerCapture(e.pointerId); tBar.onpointermove = setFromBar; });
tBar.addEventListener('pointerup', () => { tBar.onpointermove = null; });

window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (G.mode !== 'play') {
    if (e.code === 'Escape' && G.mode === 'done') showMenu();
    return;
  }
  sfx.start();
  if (e.code === 'Escape') { showMenu(); return; }
  if (e.code === 'KeyQ') selectTool(G.tool - 1);
  if (e.code === 'KeyE') selectTool(G.tool + 1);
  if (/^Digit[1-9]$/.test(e.code)) { const k = +e.code.slice(5) - 1; if (k < G.tools.length) selectTool(k); }
  if (e.code === 'KeyF' && G.sim.geo.family === 'wafer') { G.input.flip = !G.input.flip; G.input.h = -G.input.h; sfx.play('tool'); say(G.input.flip ? 'PICK FLIPPED · HOOK DOWN' : 'PICK UPRIGHT · HOOK UP', ''); }
  if (e.code === 'KeyA' && G.sim.geo.family === 'tubular') cycleFeeler(-1);
  if (e.code === 'KeyD' && G.sim.geo.family === 'tubular') cycleFeeler(1);
  if (e.code === 'KeyH') { G.aids = !G.aids; say(G.aids ? 'BINDING AID ON' : 'BINDING AID OFF', G.aids ? 'the binding pin glows amber' : 'by feel alone'); }
  if (e.code === 'KeyR') startJob(G.jobIdx, G.seed);
  if (e.code === 'KeyM') { sfx.setMuted(!sfx.muted); say(sfx.muted ? 'SOUND OFF' : 'SOUND ON', ''); }
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------------------------------------- messages + HUD
function say(t, sub, color) {
  const el = $('msg');
  el.innerHTML = `<div class="m" style="color:${color || 'var(--ink)'}">${t}${sub ? `<small>${sub}</small>` : ''}</div>`;
}

function updateHud() {
  const s = G.sim;
  $('tFill').style.width = (s.T * 100).toFixed(1) + '%';
  $('tVal').textContent = Math.round(G.slack ? 0 : G.Ttarget * 100) + '%';
  const st = clamp(s.strain / (s.spec?.breakF || 10), 0, 1);
  $('sFill').style.width = (st * 100).toFixed(1) + '%';
  $('sVal').textContent = s.strain.toFixed(1);
  const pins = $('pinsRow').children;
  let nSet = 0;
  s.stacks.forEach((p, k) => {
    const c = p.state === 'set' ? 'var(--set)' : p.state === 'over' ? 'var(--over)' : p.state === 'caught' ? 'var(--bind)' : 'transparent';
    if (pins[k]) pins[k].style.background = c;
    if (p.state === 'set') nSet++;
  });
  $('setVal').textContent = s.stacks.length ? `${nSet}/${s.stacks.length}` : (s.open ? 'OPEN' : '—');
  $('tPicks').textContent = G.picks;
  $('tOver').textContent = s.stats.oversets;
  $('tFalse').textContent = s.stats.falseSets;
  $('time').textContent = fmt(G.t);
  const rot = s.geo.family === 'warded' ? `TURN ${s.angle.toFixed(0)}°` : `PLUG ROTATION ${(s.theta + s.thetaKick).toFixed(2)}° <small style="opacity:.6">(drawn ×4)</small>`;
  $('rot').innerHTML = rot;
}

function onEvent(ev) {
  const n = ev.i !== undefined ? ev.i + 1 : '';
  const fam = G.sim.geo.family;
  const noun = fam === 'lever' ? 'LEVER' : fam === 'wafer' ? 'WAFER' : 'PIN';
  sfx.play(ev.type);
  switch (ev.type) {
    case 'set': say(`CLICK · ${noun} ${n} SET`, 'the plug turns a hair; find the next binder', 'var(--set)'); G.view.flash = 1; break;
    case 'falseset': say(`FALSE SET · ${noun} ${n}`, ev.kind === 'false gate' ? 'false notch: lighter tension, keep lifting' : `${ev.kind}: ease the tension and keep lifting it`, 'var(--bind)'); break;
    case 'serration': say(`TICK · ${noun} ${n}`, 'serrated: not set yet', 'var(--bind)'); break;
    case 'counter': say(`COUNTER-ROTATION · ${noun} ${n}`, 'it pushed the plug back; hold on', 'var(--bind)'); break;
    case 'overset': say(`OVERSET · ${noun} ${n}`, 'pushed through the shear line. Hold SPACE to let off tension', 'var(--over)'); break;
    case 'unjam': say('UNJAMMED', 'it dropped back to the shear line', 'var(--ink)'); break;
    case 'drop':
      if (G.t - G.lastDrop > 0.6) say('PINS DROPPED', 'not enough tension to hold them', 'var(--faint)');
      G.lastDrop = G.t;
      break;
    case 'snap':
      G.picks--;
      if (G.picks <= 0) { say('LAST PICK SNAPPED', 'the examiner sighs', 'var(--over)'); setTimeout(() => finish(false), 900); }
      else say('PICK SNAPPED', `too much force on a binding ${noun.toLowerCase()}. ${G.picks} left in the roll`, 'var(--over)');
      G.sim.releaseAll();
      G.Ttarget = 0;
      G.input.h = G.sim.geo.tipMin ?? 0;
      G.input.p = 2;
      break;
    case 'bend': {
      const c = G.sim.stacks.find(q => q.state === 'caught');
      say('PICK BENDING', c && G.sim.T > c.catches[c.cIdx].pass ? 'the false-set pin will not move under this much tension: ease off' : 'too much force: lighten the tension or back off', 'var(--over)');
      break;
    }
    case 'ward': say('BLOCKED BY A WARD', 'wrong bit, or wrong depth', 'var(--over)'); break;
    case 'spin': say('TURNS FREELY', 'the bit is missing the latch: go deeper or pick a longer bit', 'var(--faint)'); break;
    case 'latch': say('LATCH SPRING', 'keep turning', 'var(--bind)'); break;
    case 'open': say('OPEN', '', 'var(--set)'); break;
  }
}

function finish(ok) {
  if (G.doneShown) return;
  G.doneShown = true;
  G.mode = 'done';
  if (document.pointerLockElement) document.exitPointerLock();
  const s = G.sim, job = G.job;
  const t = G.t;
  let grade = 'F';
  if (ok) {
    const brk = 3 - G.picks;
    grade = t <= job.par && s.stats.oversets <= 1 && brk === 0 ? 'A' : t <= job.par * 2 && brk <= 1 ? 'B' : 'C';
    prog.opened[job.id] = true;
    if (!prog.best[job.id] || t < prog.best[job.id]) prog.best[job.id] = t;
    saveProg();
  }
  $('dTitle').textContent = ok ? 'Opened.' : 'Failed.';
  $('dSub').textContent = ok ? `${job.title} · DWG BO-${job.id}` : 'Out of picks. The lock wins this one.';
  $('dTime').textContent = fmt(t);
  $('dOver').textContent = s.stats.oversets;
  $('dFalse').textContent = s.stats.falseSets;
  $('dGrade').textContent = grade;
  $('dNext').hidden = !ok || G.jobIdx >= JOBS.length - 1;
  $('done').hidden = false;
}
$('dNext').onclick = () => startJob(Math.min(JOBS.length - 1, G.jobIdx + 1));
$('dAgain').onclick = () => startJob(G.jobIdx);
$('dMenu').onclick = () => showMenu();

function showMenu() {
  G.mode = 'menu';
  if (document.pointerLockElement) document.exitPointerLock();
  const el = $('jobs');
  el.innerHTML = '';
  JOBS.forEach((j, k) => {
    const unlocked = k < 4 || prog.opened[JOBS[k - 1].id] || prog.opened[j.id] || qs.has('all');
    const b = document.createElement('button');
    b.className = 'job';
    b.disabled = !unlocked;
    b.innerHTML = `<span class="no">DWG BO-${j.id}</span><span class="t">${j.title}</span><span class="k2">${j.kind}</span>`
      + (prog.best[j.id] ? `<span class="best">${fmt(prog.best[j.id])}</span>` : '')
      + (prog.opened[j.id] ? '<span class="stamp">OPENED</span>' : '');
    b.title = j.blurb;
    b.onclick = () => { sfx.start(); startJob(k); };
    el.appendChild(b);
  });
  $('menu').hidden = false;
  $('done').hidden = true;
}

// ---------------------------------------------------------------------------------------------- overlays
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function proj(cam, rect, p) {
  const v = p.clone().project(cam);
  return [(v.x + 1) / 2 * rect.w, (1 - v.y) / 2 * rect.h];
}

function drawSectionOverlay(rect) {
  const ov = $('secOv');
  ov.innerHTML = '';
  const s = G.sim, v = G.view, m = v.meta, f = m.family;
  if (s.open) {
    const k = Math.min(1, G.openT * 1.4);
    const g = svgEl('g', { transform: `translate(${rect.w * 0.72},${rect.h * 0.2}) rotate(-9) scale(${1.6 - 0.6 * k})`, opacity: k }, ov);
    svgEl('rect', { x: -96, y: -30, width: 192, height: 60, fill: 'none', stroke: '#7dffb0', 'stroke-width': 3.5 }, g);
    svgEl('rect', { x: -89, y: -23, width: 178, height: 46, fill: 'none', stroke: '#7dffb0', 'stroke-width': 1.2 }, g);
    const tt = svgEl('text', { x: 0, y: 11, fill: '#7dffb0', 'font-size': 32, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-weight': 700, 'letter-spacing': '.18em' }, g);
    tt.textContent = 'OPENED';
  }
  const ink = 'rgba(220,239,255,.85)', faint = 'rgba(220,239,255,.45)';
  const text = (x, y, str, o = {}) => { const t = svgEl('text', { x, y, fill: o.fill || ink, 'font-size': o.size || 10, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': o.anchor || 'middle', 'letter-spacing': '.08em', 'font-weight': o.w || 500, stroke: '#0d3a66', 'stroke-width': 3.5, 'paint-order': 'stroke' }, ov); t.textContent = str; return t; };
  const line = (a, b, o = {}) => svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: o.stroke || faint, 'stroke-width': o.sw || 1, 'stroke-dasharray': o.dash || '' }, ov);
  if (f === 'pin' || f === 'dimple' || f === 'wafer') {
    const L = m.length;
    const shear = [m.plugR];
    if (f === 'wafer') shear.push(-m.plugR);
    for (const y of shear) {
      const a = proj(camSec, rect, V3(0, y, 2)), b = proj(camSec, rect, V3(0, y, -L - 2));
      line(a, b, { stroke: 'rgba(125,255,176,.75)', dash: '7 4 2 4' });
      text(b[0] + 4, b[1] - 4, 'SHEAR LINE', { anchor: 'start', fill: 'rgba(125,255,176,.85)', size: 9 });
    }
    // pin numbers and leader marks
    const topY = (m.shellTop ?? m.plugR + 2) + 1.6;
    s.stacks.forEach((st, k) => {
      const q = proj(camSec, rect, V3(0, f === 'wafer' ? m.plugR + 2.6 : topY, -st.z));
      const isB = G.aids && s.binding === k && s.T > 0.03;
      const col = st.state === 'set' ? '#7dffb0' : st.state === 'over' ? '#ff6b6b' : st.state === 'caught' ? '#ffd27a' : isB ? '#ffb340' : ink;
      svgEl('circle', { cx: q[0], cy: q[1] - 4, r: 8, fill: 'none', stroke: col, 'stroke-width': 1.2 }, ov);
      text(q[0], q[1], String(k + 1), { fill: col, size: 10, w: 700 });
      if (f === 'wafer') text(q[0], q[1] + 16, st.dir > 0 ? '▲' : '▼', { fill: faint, size: 9 });
    });
    // dimension: pick tip depth
    const tip = proj(camSec, rect, V3(0, s.tipY, -s.tip.p));
    const face = proj(camSec, rect, V3(0, f === 'wafer' ? -m.plugR - 2.5 : -9, 0));
    const tipB = proj(camSec, rect, V3(0, f === 'wafer' ? -m.plugR - 2.5 : -9, -s.tip.p));
    line([face[0], face[1] - 5], [face[0], face[1] + 5]);
    line([tipB[0], tipB[1] - 5], [tipB[0], tipB[1] + 5]);
    line(face, tipB, { stroke: 'rgba(255,138,85,.8)' });
    text((face[0] + tipB[0]) / 2, face[1] + 13, `${s.tip.p.toFixed(1)} mm`, { fill: 'rgba(255,170,130,.95)', size: 9 });
    line([tip[0] - 7, tip[1]], [tip[0] + 7, tip[1]], { stroke: 'rgba(255,138,85,.9)' });
    line([tip[0], tip[1] - 7], [tip[0], tip[1] + 7], { stroke: 'rgba(255,138,85,.9)' });
    if (G.job.id === '01') {
      const st0 = s.stacks[s.stacks.length - 1];
      const callout = (p3, label, dx, dy) => {
        const a = proj(camSec, rect, p3);
        const b = [a[0] + dx, a[1] + dy];
        line(a, b, { stroke: faint });
        svgEl('circle', { cx: a[0], cy: a[1], r: 2, fill: ink }, ov);
        text(b[0] + (dx > 0 ? 4 : -4), b[1] + 3, label, { anchor: dx > 0 ? 'start' : 'end', size: 9 });
      };
      const zz = -st0.z;
      const sv = v.stackViews[st0.i];
      callout(V3(0, 0.6 + st0.y + sv.Lk * 0.5, zz), 'KEY PIN', 60, 30);
      callout(V3(0, sv.dr.position.y + 2.5, zz), 'DRIVER', 60, 0);
      callout(V3(0, m.shellTop - 2, zz), 'SPRING', 60, -16);
      callout(V3(0, -3.5, -L + 3), 'PLUG (TURNS)', 40, 36);
      callout(V3(0, m.plugR + 6, -L * 0.15), 'BIBLE (FIXED)', -30, -40);
    }
  } else if (f === 'tubular') {
    const a = proj(camSec, rect, V3(0, 0, -m.shear).addScaledVector(v.sectionPlane.up, 10)), b = proj(camSec, rect, V3(0, 0, -m.shear).addScaledVector(v.sectionPlane.up, -10));
    line(a, b, { stroke: 'rgba(125,255,176,.75)', dash: '7 4 2 4' });
    text(a[0], a[1] - 6, 'SHEAR PLANE', { fill: 'rgba(125,255,176,.85)', size: 9 });
    text(rect.w / 2, rect.h - 18, `FEELER ${s.selected + 1} OF ${s.stacks.length} · PUSHED ${s.tip.h.toFixed(2)} mm`, { size: 11, fill: 'rgba(255,170,130,.95)' });
  } else if (f === 'lever') {
    const lv = v.lever;
    const p = proj(camSec, rect, V3(lv.stumpX, lv.stumpY, 0));
    text(p[0], p[1] - 14, 'STUMP', { size: 9 });
    const near = s.stacks.findIndex(st => Math.abs(s.tip.p - st.z) < 0.9);
    text(rect.w / 2, rect.h - 18, near >= 0 ? `PICK UNDER LEVER ${near + 1} OF ${s.stacks.length} · LIFT ${s.stacks[near].y.toFixed(2)} mm` : `PICK DEPTH ${s.tip.p.toFixed(1)} mm · BETWEEN LEVERS`, { size: 11, fill: 'rgba(255,170,130,.95)' });
    s.stacks.forEach((st, k) => {
      const q = proj(camSec, rect, V3(lv.pivotX + 6 + k * 0.01, lv.stumpY + 10 - k * 3.2, 0));
      const isB = G.aids && s.binding === k && s.T > 0.03;
      const col = st.state === 'set' ? '#7dffb0' : st.state === 'over' ? '#ff6b6b' : st.state === 'caught' ? '#ffd27a' : isB ? '#ffb340' : ink;
      text(q[0], q[1], `L${k + 1}`, { fill: col, size: 10, w: 700 });
    });
  } else if (f === 'warded') {
    for (const w of G.job.wards) {
      const p = proj(camSec, rect, V3(0, -w.r1 - 1.5, -(w.z0 + w.z1) / 2));
      text(p[0], p[1] + 10, 'WARD', { size: 9, fill: faint });
    }
    const L = G.job.latch;
    const pl = proj(camSec, rect, V3(0, L.r + 3, -L.z));
    text(pl[0], pl[1] - 8, 'LATCH', { size: 9, fill: '#8fe3ff' });
    const tip = proj(camSec, rect, V3(0, -10, -s.tip.p));
    const face = proj(camSec, rect, V3(0, -10, 0));
    line(face, tip, { stroke: 'rgba(255,138,85,.8)' });
    text((face[0] + tip[0]) / 2, face[1] + 13, `${s.tip.p.toFixed(1)} mm`, { fill: 'rgba(255,170,130,.95)', size: 9 });
  }
}

function drawKeywayOverlay(rect) {
  const ov = $('kwOv');
  ov.innerHTML = '';
  const s = G.sim, v = G.view, m = v.meta, f = m.family;
  const c = proj(camKw, rect, V3(0, 0, 0.5));
  const rr = f === 'lever' || f === 'warded' ? 14 : (m.plugR || 7) + 4.5;
  const e = proj(camKw, rect, V3(rr, 0, 0.5));
  const R = Math.max(26, Math.hypot(e[0] - c[0], e[1] - c[1]));
  // tension arc over the top of the plug: 0 at the left, full at the right
  const arc = (a0, a1, r) => {
    const p0 = [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], p1 = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)];
    return `M${p0[0]},${p0[1]} A${r},${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${p1[0]},${p1[1]}`;
  };
  const A0 = Math.PI * 1.15, A1 = Math.PI * 1.85;
  svgEl('path', { d: arc(A0, A1, R), fill: 'none', stroke: 'rgba(220,239,255,.35)', 'stroke-width': 7 }, ov);
  const T = s.T;
  if (T > 0.005) svgEl('path', { d: arc(A0, A0 + (A1 - A0) * T, R), fill: 'none', stroke: '#ffe27a', 'stroke-width': 7 }, ov);
  for (let k = 0; k <= 10; k++) {
    const a = A0 + (A1 - A0) * k / 10;
    const r0 = R + 5, r1 = R + (k % 5 ? 9 : 13);
    svgEl('line', { x1: c[0] + r0 * Math.cos(a), y1: c[1] + r0 * Math.sin(a), x2: c[0] + r1 * Math.cos(a), y2: c[1] + r1 * Math.sin(a), stroke: 'rgba(220,239,255,.6)' }, ov);
  }
  const tl = svgEl('text', { x: c[0], y: c[1] - R - 18, fill: '#ffe27a', 'font-size': 10, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'letter-spacing': '.1em' }, ov);
  tl.textContent = f === 'warded' ? `TURN ${Math.round(T * 100)}%` : `TENSION ${Math.round(T * 100)}%`;
  // plug rotation needle
  const th = -(s.theta + s.thetaKick) * Math.PI / 180 * (f === 'warded' ? 1 : 4) - Math.PI / 2;
  svgEl('line', { x1: c[0], y1: c[1], x2: c[0] + (R - 10) * Math.cos(th), y2: c[1] + (R - 10) * Math.sin(th), stroke: 'rgba(125,255,176,.85)', 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }, ov);
  // pick location callout
  if (f !== 'tubular' && f !== 'warded') {
    const tip = proj(camKw, rect, V3(0, s.tipY, -s.tip.p));
    let near = -1, nd = 9;
    s.stacks.forEach((st, k) => { const d = Math.abs(st.z - s.tip.p); if (d < nd) { nd = d; near = k; } });
    const noun = f === 'lever' ? 'LEVER' : f === 'wafer' ? 'WAFER' : 'PIN';
    const lbl = nd < 1.6 ? `${noun} ${near + 1}` : 'BETWEEN';
    const bx = rect.w - 300;
    svgEl('line', { x1: tip[0], y1: tip[1], x2: bx, y2: 26, stroke: 'rgba(255,138,85,.7)' }, ov);
    svgEl('circle', { cx: tip[0], cy: tip[1], r: 3, fill: 'none', stroke: '#ff8a55' }, ov);
    const t = svgEl('text', { x: bx, y: 22, fill: '#ffb08a', 'font-size': 10, 'font-family': 'IBM Plex Mono, monospace', 'letter-spacing': '.06em' }, ov);
    t.textContent = `TIP ▸ ${lbl} · ${s.tip.p.toFixed(1)} mm IN · LIFT ${(s.tipY - s.geo.mouthY).toFixed(1)}`;
  }
}

// ---------------------------------------------------------------------------------------------- loop
let last = performance.now();
let overlayTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  render();
}
function tick(dt) {
  if (!G.sim) return;
  if (G.mode === 'play' && !G.sim.open) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) { G.Ttarget = clamp(G.Ttarget + dt * 0.5, 0, 1); G.started = true; }
    if (keys.has('KeyS') || keys.has('ArrowDown')) G.Ttarget = clamp(G.Ttarget - dt * 0.5, 0, 1);
    if (keys.has('ArrowRight')) moveHand(dt * 160, 0);
    if (keys.has('ArrowLeft')) moveHand(-dt * 160, 0);
    G.slack = keys.has('Space');
    G.input.T = G.slack ? 0 : G.Ttarget;
    if (G.started) G.t += dt;
    G.sim.step(dt, G.input);
    for (const ev of G.sim.events) onEvent(ev);
    G.sim.events.length = 0;
    sfx.scrape(clamp((G.sim.pVel || 0) / 60, 0, 1) * (G.sim.stacks.some(s => s.contact) ? 1 : 0.3) + (G.sim.scrape || 0) * 0.3, clamp(G.sim.T, 0, 1));
  } else sfx.scrape(0, 0);
  if (G.sim.open) {
    G.openT = Math.min(1, G.openT + dt * 1.6);
    G.view.openT = G.openT;
    if (G.openT >= 1 && G.mode === 'play') setTimeout(() => finish(true), 500);
    if (G.mode === 'play' && G.openT >= 1) G.mode = 'opening';
    // turn the plug the rest of the way
    G.sim.theta = Math.min(G.sim.geo.family === 'warded' ? 110 : 22, G.sim.theta + dt * 40);
  }
  updateHud();
}

function render() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * renderer.getPixelRatio()) || canvas.height !== Math.round(H * renderer.getPixelRatio())) {
    renderer.setSize(W, H, false);
    if (G.view) { fitSection(); fitKeyway(); }
  }
  renderer.setScissorTest(false);
  renderer.clear();
  if (!G.view) return;
  const t = performance.now() / 1000;
  renderer.setScissorTest(true);
  const sr = panelRect($('sec'));
  if (G.view._planeKey !== G.secKey) fitSection();
  const sp = G.view.sectionPlane;
  setCut(true, sp.normal, sp.constant);
  SHARED.uOrtho.value = 1;
  G.view.sync('section', G.aids, t);
  renderer.setViewport(sr.x, H - sr.y - sr.h, sr.w, sr.h);
  renderer.setScissor(sr.x, H - sr.y - sr.h, sr.w, sr.h);
  renderer.render(scene, camSec);
  const kr = panelRect($('kw'));
  if (Math.abs(camKw.aspect - kr.w / Math.max(1, kr.h)) > 0.01) fitKeyway();
  setCut(false);
  SHARED.uOrtho.value = 0;
  G.view.sync('keyway', G.aids, t);
  renderer.setViewport(kr.x, H - kr.y - kr.h, kr.w, kr.h);
  renderer.setScissor(kr.x, H - kr.y - kr.h, kr.w, kr.h);
  renderer.render(scene, camKw);
  if (++overlayTick % 2 === 0 || G.mode !== 'play') {
    drawSectionOverlay(sr);
    drawKeywayOverlay(kr);
  }
}

// ---------------------------------------------------------------------------------------------- boot
loadAssets().then(() => {
  $('loading').remove();
  const j = qs.get('job');
  if (j !== null) {
    startJob(clamp(parseInt(j, 10) - 1 || 0, 0, JOBS.length - 1), qs.has('seed') ? +qs.get('seed') : undefined);
    fitKeyway();
  } else {
    startJob(0);
    fitKeyway();
    showMenu();
  }
  requestAnimationFrame(frame);
}).catch(e => {
  console.error(e);
  $('loading').textContent = 'COULD NOT LOAD THE DRAWINGS: ' + e.message;
});

// Test hooks (localhost only): drive the hand without a mouse.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  window.__bo = {
    G, JOBS, scene, camSec, camKw,
    set(p, h, T) { if (p !== undefined) G.input.p = p; if (h !== undefined) G.input.h = h; if (T !== undefined) G.Ttarget = T; G.started = true; },
    step(n = 60) { for (let k = 0; k < n; k++) tick(1 / 60); render(); },
    start(i, seed) { startJob(i, seed); fitKeyway(); },
    tool(i) { selectTool(i); },
  };
}
