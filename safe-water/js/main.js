// Safe Water: node-to-node exploration engine, UI, saving, travel between places.
import * as THREE from 'three';
import * as A from './audio.js';
import * as T from './tex.js';
import { DOCS } from './text.js';
import { buildStudy } from './study.js';
import { buildRiver } from './river.js';
import { buildCave } from './cave.js';
import { buildCourt } from './court.js';

const $ = s => document.querySelector(s);
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 5000);
camera.rotation.order = 'YXZ';
const rig = new THREE.Object3D();
rig.add(camera);

// ---- Save state ----
const SAVE = 'safewater.v1';
const fresh = () => ({ v: 1, world: 'study', node: 's_center', yaw: 0, pages: {}, flags: {}, read: {}, card: null, started: false });
let state = fresh();
try { const s = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (s && s.v === 1) state = { ...fresh(), ...s }; } catch { /* no storage */ }
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(state)); } catch { /* ignore */ } };

const norm = y => ((y % 360) + 360) % 360;
const adiff = (a, b) => ((b - a + 540) % 360) - 180;
const wait = ms => new Promise(r => setTimeout(r, ms));
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ---- UI ----
const ui = {
  sayTimer: 0,
  say(text, secs = 4) {
    const el = $('#sub');
    el.innerHTML = text; el.classList.add('on');
    clearTimeout(ui.sayTimer);
    ui.sayTimer = setTimeout(() => el.classList.remove('on'), secs * 1000);
  },
  docOpen: false,
  doc(id, extra = {}) {
    const d = typeof id === 'string' ? DOCS[id] : id;
    if (typeof id === 'string') { state.read[id] = true; save(); }
    A.sfx.paper();
    const el = $('#doc'), sh = el.querySelector('.sheet');
    sh.className = 'sheet ' + (d.kind || 'letter');
    sh.innerHTML = `<div class="dtitle">${d.title || ''}</div><div class="dbody">${d.body}</div>${extra.after || ''}<div class="dclose">click anywhere to put it down</div>`;
    el.hidden = false; ui.docOpen = true;
    sh.scrollTop = 0;
    return new Promise(res => { ui._docRes = res; });
  },
  closeDoc() {
    if (!ui.docOpen) return;
    $('#doc').hidden = true; ui.docOpen = false;
    A.sfx.paper();
    const r = ui._docRes; ui._docRes = null; r && r();
  },
  pages() {
    ['river', 'cave', 'court'].forEach(k => $(`#pg-${k}`).classList.toggle('have', !!state.pages[k]));
  },
};
$('#doc').addEventListener('pointerdown', e => { e.preventDefault(); ui.closeDoc(); });

// ---- Engine state ----
const worlds = {};
let W = null;
const view = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 60 };
let tween = null, busy = false;
const mouse = { x: 0.5, y: 0.5, in: false };
const sway = { x: 0, y: 0 };
const ray = new THREE.Raycaster();

function node(id = state.node) { return W && W.nodes[id]; }

function prepNodes(w) {
  for (const [id, n] of Object.entries(w.nodes)) {
    n.id = id;
    n.pos = Array.isArray(n.pos) ? new THREE.Vector3(...n.pos) : n.pos;
    if (n.target) {
      const t = Array.isArray(n.target) ? new THREE.Vector3(...n.target) : n.target;
      const d = t.clone().sub(n.pos);
      n.yaw = norm(THREE.MathUtils.radToDeg(Math.atan2(-d.x, -d.z)));
      n.pitch = THREE.MathUtils.radToDeg(Math.atan2(d.y, Math.hypot(d.x, d.z)));
      n.turn = 0;
    }
    n.turn = n.turn ?? 90;
    n.links = n.links || [];
  }
  w.hots = w.hots || [];
}

function snapYaw(yaw, n) {
  if (!n.turn) return n.yaw ?? 0;
  const base = n.yaw ?? 0;
  return norm(base + Math.round(adiff(base, yaw) / n.turn) * n.turn);
}
function pitchFor(n, yaw) {
  if (n.pitches) { const k = Object.keys(n.pitches).find(k => Math.abs(adiff(+k, yaw)) < 1); if (k !== undefined) return n.pitches[k]; }
  return n.pitch ?? 0;
}

function goTo(id, yaw, { dur, silent = false } = {}) {
  const n = node(id);
  if (!n) { console.warn('no node', id); return Promise.resolve(); }
  const from = node();
  if (from && from !== n) from.onLeave?.();
  const ty = norm(yaw ?? (n.turn ? snapYaw(view.yaw, n) : n.yaw ?? 0));
  const tp = n.turn ? pitchFor(n, ty) : n.pitch ?? 0;
  const dist = view.pos.distanceTo(n.pos);
  dur = dur ?? Math.min(1.6, 0.45 + dist * 0.05);
  if (!silent && dist > 0.6) { A.sfx.step(); if (dist > 3) setTimeout(A.sfx.step, dur * 450); }
  state.node = id;
  return new Promise(res => {
    tween = {
      p0: view.pos.clone(), p1: n.pos.clone(), y0: view.yaw, y1: ty, pi0: view.pitch, pi1: tp,
      f0: view.fov, f1: n.fov ?? W.fov ?? 60, t: 0, dur,
      done() { state.yaw = ty; save(); A.ambience(n.amb || W.amb); n.onEnter?.(); res(); },
    };
  });
}

function turn(dir) {
  const n = node();
  if (!n || !n.turn) return;
  const ty = norm(view.yaw + dir * n.turn);
  A.sfx.turn();
  tween = { p0: view.pos.clone(), p1: view.pos.clone(), y0: view.yaw, y1: ty, pi0: view.pitch, pi1: pitchFor(n, ty), f0: view.fov, f1: view.fov, t: 0, dur: 0.5, done() { state.yaw = ty; save(); n.onTurn?.(ty); } };
}

function forwardLink() {
  const n = node();
  if (!n) return null;
  for (const L of n.links) {
    if (L.yaw === undefined) continue;
    const tol = L.tol ?? (n.turn ? Math.min(40, n.turn / 2 - 1) : 60);
    if (Math.abs(adiff(L.yaw, view.yaw)) <= tol) return L;
  }
  return null;
}
function follow(L) {
  if (L.when && !L.when()) { if (L.msg) { L.onBlocked?.(); ui.say(typeof L.msg === 'function' ? L.msg() : L.msg); } return; }
  if (L.run) { L.run(); return; }
  const t = node(L.to);
  if (L.say) ui.say(L.say, 4);
  if (L.fade) fadeTo(L.to, L.arrive);
  else goTo(L.to, L.arrive ?? (t.turn ? undefined : t.yaw));
}
async function fadeTo(id, yaw) {
  busy = true; setCursor('none');
  A.sfx.step(); setTimeout(A.sfx.step, 300);
  $('#fade').classList.add('on');
  await wait(650);
  node()?.onLeave?.();
  const n = node(id);
  state.node = id;
  view.pos.copy(n.pos);
  view.yaw = norm(yaw ?? n.yaw ?? 0);
  view.pitch = n.turn ? pitchFor(n, view.yaw) : n.pitch ?? 0;
  state.yaw = view.yaw; save();
  A.ambience(n.amb || W.amb); n.onEnter?.();
  await wait(150);
  $('#fade').classList.remove('on');
  await wait(400);
  busy = false; refreshCursor();
}
function goBack() {
  const n = node();
  if (n && n.back) goTo(n.back, n.backYaw);
}

function visibleChain(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function hotAt(mx, my) {
  if (!W.hots.length) return null;
  ray.setFromCamera({ x: mx * 2 - 1, y: -(my * 2 - 1) }, camera);
  const list = W.hots.filter(h => {
    const c = h.userData.hot;
    if (c.nodes && !c.nodes.includes(state.node)) return false;
    if (c.when && !c.when()) return false;
    return visibleChain(h);
  });
  if (!list.length) return null;
  const hits = ray.intersectObjects(list, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.hot) o = o.parent;
    if (o) return { obj: o, cfg: o.userData.hot, point: h.point };
  }
  return null;
}

function actionAt(mx, my) {
  if (busy || tween || ui.docOpen || !W) return { cursor: tween ? 'none' : 'default' };
  const ov = W.pointerAction?.(mx, my);
  if (ov) return ov;
  const n = node();
  const edge = mx < 0.07 || mx > 0.93;
  const h = !edge && hotAt(mx, my);
  if (h) return { cursor: h.cfg.cursor || 'hand', act: () => h.cfg.click(h), label: typeof h.cfg.label === 'function' ? h.cfg.label() : h.cfg.label };
  if (n.turn && mx < 0.14) return { cursor: 'left', act: () => turn(+1) };
  if (n.turn && mx > 0.86) return { cursor: 'right', act: () => turn(-1) };
  if (n.back && my > 0.82) return { cursor: 'back', act: goBack };
  const L = forwardLink();
  if (L && my < 0.9) return { cursor: L.when && !L.when() && !L.msg ? 'default' : 'fwd', act: () => follow(L) };
  if (n.back) return { cursor: 'back', act: goBack };
  return { cursor: 'default' };
}

let curCursor = '';
function setCursor(c) {
  if (c === curCursor) return;
  document.body.classList.remove('c-' + curCursor);
  curCursor = c; document.body.classList.add('c-' + c);
}
const labelEl = $('#label');
function refreshCursor() {
  const a = actionAt(mouse.x, mouse.y);
  setCursor(a.cursor);
  if (a.label && mouse.in) {
    labelEl.textContent = a.label; labelEl.classList.add('on');
    const r = canvas.getBoundingClientRect();
    labelEl.style.left = (r.left + mouse.x * r.width) + 'px'; labelEl.style.top = (r.top + mouse.y * r.height + 26) + 'px';
  } else labelEl.classList.remove('on');
}

function relPos(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}
canvas.addEventListener('pointermove', e => {
  [mouse.x, mouse.y] = relPos(e); mouse.in = true;
  W?.pointer?.('move', mouse.x, mouse.y, e);
  refreshCursor();
});
canvas.addEventListener('pointerleave', () => { mouse.in = false; W?.pointer?.('up', mouse.x, mouse.y); });
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  A.init();
  [mouse.x, mouse.y] = relPos(e);
  if (W?.pointer?.('down', mouse.x, mouse.y, e)) return;
  const a = actionAt(mouse.x, mouse.y);
  if (a.act) a.act();
  setTimeout(refreshCursor, 30);
});
window.addEventListener('pointerup', () => W?.pointer?.('up', mouse.x, mouse.y));
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (e.target.closest?.('input,button,a')) return;
  if (e.key === 'Escape') { if (ui.docOpen) ui.closeDoc(); else toggleMenu(); return; }
  if (ui.docOpen) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); ui.closeDoc(); } return; }
  if (!$('#menu').hidden || !$('#title').hidden || !$('#ending').hidden) return;
  if (W?.key?.(e, true)) { e.preventDefault(); return; }
  if (busy || tween) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') { e.preventDefault(); turn(+1); }
  else if (k === 'arrowright' || k === 'd') { e.preventDefault(); turn(-1); }
  else if (k === 'arrowup' || k === 'w') { e.preventDefault(); const L = forwardLink(); if (L) follow(L); }
  else if (k === 'arrowdown' || k === 's') { e.preventDefault(); if (node().back) goBack(); else turn(2); }
});
window.addEventListener('keyup', e => { W?.key?.(e, false); });

// ---- Travel between places ----
async function travel(id, { node: nid, yaw, stereo = true } = {}) {
  if (busy) return;
  busy = true; setCursor('none');
  const target = worlds[id];
  const st = $('#stereo');
  if (stereo) {
    A.sfx.travel();
    st.querySelectorAll('img').forEach(i => { i.src = target.snapshot; });
    st.hidden = false;
    st.classList.remove('go'); void st.offsetWidth; st.classList.add('go');
    await wait(1500);
  } else {
    $('#fade').classList.add('on'); await wait(700);
  }
  activate(id, nid ?? target.start, yaw);
  if (stereo) {
    st.classList.add('out');
    await wait(900);
    st.hidden = true; st.classList.remove('go', 'out');
  } else {
    $('#fade').classList.remove('on'); await wait(500);
  }
  busy = false; refreshCursor();
}

function activate(id, nid, yaw) {
  if (W && W !== worlds[id]) W.onLeaveWorld?.();
  W = worlds[id];
  state.world = id; state.node = nid;
  const n = node(nid);
  (W.anchor || W.scene).add(rig);
  view.pos.copy(n.pos);
  view.yaw = norm(yaw ?? n.yaw ?? 0);
  view.pitch = n.turn ? pitchFor(n, view.yaw) : n.pitch ?? 0;
  view.fov = n.fov ?? W.fov ?? 60;
  state.yaw = view.yaw;
  tween = null;
  renderer.toneMappingExposure = W.exposure ?? 1;
  W.onEnterWorld?.();
  n.onEnter?.();
  A.ambience(n.amb || W.amb);
  save();
}

// ---- World API ----
const api = {
  THREE, T, A, ui, camera, renderer,
  get state() { return state; },
  save, goTo, travel, turn, wait, fadeTo,
  get node() { return state.node; },
  get view() { return view; },
  get busy() { return busy || !!tween; },
  setBusy(b) { busy = b; if (!b) refreshCursor(); else setCursor('none'); },
  hot(obj, cfg, list) { obj.userData.hot = cfg; list.push(obj); return obj; },
  collect(id, doc) {
    state.pages[id] = true; save(); ui.pages();
    A.sfx.chime();
    return ui.doc(doc, { after: `<div class="dnote">Page ${Object.keys(state.pages).length} of 3 is yours. ${Object.keys(state.pages).length === 3 ? 'Take them back to the study.' : ''}</div>` });
  },
  pageCount: () => Object.keys(state.pages).length,
  look(yaw, pitch, dur = 1) {
    return new Promise(res => { tween = { p0: view.pos.clone(), p1: view.pos.clone(), y0: view.yaw, y1: norm(yaw), pi0: view.pitch, pi1: pitch, f0: view.fov, f1: view.fov, t: 0, dur, done() { state.yaw = norm(yaw); res(); } }; });
  },
  shake: 0,
  ending: () => ending(),
};

// ---- Menu, title, ending ----
function toggleMenu(force) {
  const m = $('#menu');
  if (!$('#title').hidden || !$('#ending').hidden) return;
  m.hidden = force === undefined ? !m.hidden : !force;
  if (!m.hidden) renderJournal();
}
$('#menuBtn').addEventListener('click', () => toggleMenu());
$('#mResume').addEventListener('click', () => toggleMenu(false));
$('#mSound').addEventListener('click', () => { A.setSound(!A.settings.sound); $('#mSound').textContent = 'Sound: ' + (A.settings.sound ? 'on' : 'off'); });
$('#mVoice').addEventListener('click', () => { A.settings.voices = !A.settings.voices; $('#mVoice').textContent = 'Leadsman voice: ' + (A.settings.voices ? 'on' : 'off'); });
$('#mRestart').addEventListener('click', () => {
  if (!confirm('Start over from the beginning? Your pages will be lost.')) return;
  try { localStorage.removeItem(SAVE); } catch { /* ignore */ }
  location.reload();
});
function renderJournal() {
  const j = $('#journal'); j.innerHTML = '';
  const ids = Object.keys(DOCS).filter(k => state.read[k]);
  if (!ids.length) { j.innerHTML = '<p class="empty">Nothing read yet.</p>'; return; }
  for (const k of ids) {
    const b = document.createElement('button'); b.textContent = DOCS[k].title;
    b.addEventListener('click', () => { toggleMenu(false); ui.doc(k); });
    j.appendChild(b);
  }
}

async function ending() {
  busy = true; setCursor('none');
  await wait(1200);
  const e = $('#ending');
  e.hidden = false; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on');
  state.flags.done = true; save();
}
$('#eStay').addEventListener('click', () => { $('#ending').hidden = true; busy = false; refreshCursor(); });

// ---- Loop ----
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let last = performance.now(), time = 0;
function frame(nowT) {
  const dt = Math.min(0.05, (nowT - last) / 1000); last = nowT;
  tick(dt);
  requestAnimationFrame(frame);
}
function tick(dt, draw = true) {
  time += dt;
  if (tween) {
    tween.t += dt / tween.dur;
    const k = ease(Math.min(1, tween.t));
    view.pos.lerpVectors(tween.p0, tween.p1, k);
    view.yaw = norm(tween.y0 + adiff(tween.y0, tween.y1) * k);
    view.pitch = tween.pi0 + (tween.pi1 - tween.pi0) * k;
    view.fov = tween.f0 + (tween.f1 - tween.f0) * k;
    if (tween.t >= 1) { const d = tween.done; tween = null; d && d(); refreshCursor(); }
  }
  const sx = mouse.in && !tween ? (mouse.x - 0.5) : 0, sy = mouse.in && !tween ? (mouse.y - 0.5) : 0;
  sway.x += (sx - sway.x) * Math.min(1, dt * 2.5); sway.y += (sy - sway.y) * Math.min(1, dt * 2.5);
  const swayK = W?.noSway ? 0 : 1;
  W?.update?.(dt, time);
  rig.position.copy(view.pos);
  let shx = 0, shy = 0;
  if (api.shake > 0) { shx = (Math.random() - 0.5) * api.shake; shy = (Math.random() - 0.5) * api.shake; api.shake = Math.max(0, api.shake - dt * 1.5); }
  camera.rotation.set(THREE.MathUtils.degToRad(view.pitch - sway.y * 3 * swayK + shy * 4), THREE.MathUtils.degToRad(view.yaw - sway.x * 4 * swayK + shx * 4), 0);
  // On tall, narrow screens widen the vertical field so you still see a decent slice of the world.
  const minV = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) / Math.max(0.3, camera.aspect)));
  const fov = Math.min(86, Math.max(view.fov, minV));
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (W && draw) renderer.render(W.scene, camera);
}

// ---- Snapshots for stereo cards ----
function snapshot(w) {
  const n = w.nodes[w.snapNode || w.start];
  (w.anchor || w.scene).add(rig);
  rig.position.copy(n.pos);
  const yaw = w.snapYaw ?? n.yaw ?? 0, pitch = w.snapPitch ?? n.pitch ?? 0;
  camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0);
  camera.fov = 62; camera.aspect = 1.4; camera.updateProjectionMatrix();
  const keep = new THREE.Vector2(); renderer.getSize(keep);
  renderer.setSize(560, 400, false);
  w.beforeSnap?.();
  renderer.toneMappingExposure = w.exposure ?? 1;
  renderer.render(w.scene, camera);
  const c = document.createElement('canvas'); c.width = 560; c.height = 400;
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0, 560, 400);
  w.afterSnap?.();
  const img = g.getImageData(0, 0, 560, 400), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4, x = p % 560, y = Math.floor(p / 560);
    const v = 1 - Math.min(1, Math.hypot((x - 280) / 330, (y - 200) / 260) ** 3 * 0.8);
    const gy = 255 * Math.pow((0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255, 0.62) * 1.05 + 10;
    d[i] = Math.min(255, (gy * 1.06 + 18) * v); d[i + 1] = Math.min(255, (gy * 0.93 + 8) * v); d[i + 2] = Math.min(255, (gy * 0.72) * v);
  }
  g.putImageData(img, 0, 0);
  renderer.setSize(keep.x, keep.y, false);
  return c;
}

// ---- Boot ----
async function boot() {
  resize();
  try {
    await Promise.race([
      Promise.all(['IM Fell English', 'IM Fell English SC', 'Gochi Hand', 'UnifrakturMaguntia'].map(f => document.fonts.load(`32px "${f}"`))),
      wait(2500),
    ]);
  } catch { /* fallback fonts are fine */ }
  const builders = { study: buildStudy, river: buildRiver, cave: buildCave, court: buildCourt };
  for (const [id, b] of Object.entries(builders)) {
    $('#tLoad').textContent = `Setting the scene… ${id}`;
    await wait(16);
    const w = b(api);
    w.id = id; prepNodes(w);
    worlds[id] = w;
  }
  for (const w of Object.values(worlds)) {
    const c = snapshot(w);
    w.snapCanvas = c;
    w.snapshot = c.toDataURL('image/jpeg', 0.85);
  }
  for (const w of Object.values(worlds)) w.onSnapshots?.(worlds);
  resize();
  const wid = worlds[state.world] ? state.world : 'study';
  const nid = worlds[wid].nodes[state.node] ? state.node : worlds[wid].start;
  activate(wid, nid, state.yaw);
  ui.pages();
  requestAnimationFrame(frame);
  $('#tLoad').hidden = true;
  $('#tBegin').hidden = false;
  if (state.started) { $('#tBegin').textContent = 'Continue'; $('#tNew').hidden = false; }
}

$('#tBegin').addEventListener('click', () => {
  A.init();
  $('#title').hidden = true;
  A.ambience(node().amb || W.amb); A.music(true);
  if (!state.started) {
    state.started = true; save();
    setTimeout(() => ui.say('Click ahead to walk. Click the left or right edge to turn. The cursor shows what you can touch.', 7), 600);
  }
  refreshCursor();
});
$('#tNew').addEventListener('click', () => { try { localStorage.removeItem(SAVE); } catch { /* ignore */ } location.reload(); });

if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  window.__sw = {
    get state() { return state; }, worlds, api, goTo, travel, turn, get W() { return W; }, view, activate, actionAt, ui,
    run(sec = 1, dt = 1 / 30, draw = false) { for (let t = 0; t < sec; t += dt) tick(dt, draw); tick(0.0001); return state.node; },
    click(x, y) { const a = actionAt(x, y); a.act && a.act(); return a.cursor; },
    shot() {
      tick(0.0001);
      let img = document.getElementById('dbgshot');
      if (!img) { img = document.createElement('img'); img.id = 'dbgshot'; img.style.cssText = 'position:fixed;left:0;top:52px;width:100vw;height:calc(100vh - 52px);z-index:99;pointer-events:none'; document.body.appendChild(img); }
      img.src = canvas.toDataURL('image/jpeg', 0.85); img.hidden = false;
      return 'shot';
    },
    unshot() { const i = document.getElementById('dbgshot'); if (i) i.hidden = true; },
  };
}

boot().catch(err => { console.error(err); $('#tLoad').textContent = 'Something broke while setting the scene: ' + err.message; });
