// main.js — boot: data → sim (localStorage, URL params) → scene (or a stub) → ui, then wire the §14.4 bus to both,
// own the canvas pointer (tap vs orbit, §15), resize, visibilitychange saves and the frame loop.
//
// URL params: ?reset clears the save · ?speed=N multiplies sim time · ?seed=N fixes the RNG · ?noscene skips scene.js.
// window.__game = { sim, scene, ui, data, dev } for playtests and tools/shot.mjs.

import * as data from './data.js';
import { createSim } from './sim.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { mulberry32 } from './util.js';

const BUS_EVENTS = ['serverAdded', 'serverSwapped', 'rackAdded', 'rackDark', 'infraAdded', 'stageChanged', 'meters', 'cash',
  'incident', 'incidentResolved', 'event', 'breaker', 'upgrade', 'global', 'milestone', 'contractChanged', 'exit', 'offline',
  'refreshAvailable', 'toast'];
// A tap is judged by travel (data.CAMERA.tapMaxPx) and by the pointer events' own timestamps (data.CAMERA.tapMaxMs),
// not by frame time: a rack drop or a GC pause between pointerdown and pointerup must not turn a press into nothing.
const TAP_MAX_MS = data.CAMERA.tapMaxMs;

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');

// ---- sim ----------------------------------------------------------------------------------------------------------------
if (params.has('reset')) {
  try { localStorage.removeItem(data.SAVE_KEY); } catch { /* private mode */ }
  // one-shot: drop the param so a reload or a restored tab does not wipe the new save as well
  params.delete('reset');
  const q = params.toString();
  try { history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash); } catch { /* file: or sandboxed */ }
}
const speed = Math.max(0, Number(params.get('speed')) || 1);
const seed = params.has('seed') ? (Number(params.get('seed')) >>> 0) : null;
const sim = createSim({ data, speed, rng: seed != null ? mulberry32(seed) : null });

// ---- scene: the real one when it loads, a dark no-op otherwise (§14.6 + apply/setState/resize/start) ----------------------
// `why`: 'noscene' (asked for), 'nowebgl' (the browser has none), 'failed' (scene.js threw); the HUD tells the player
// for the last two.
function stubScene(why) {
  const centre = () => ({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
  const noop = () => {};
  return { stub: true, why, pick: () => null, focus: noop, photo: () => null, setBloom: noop, setQuality: noop, project: centre,
    apply: noop, setState: noop, resize: noop, start: noop, dispose: noop };
}
// three logs console.error three times when it cannot get a context; a probe on a throwaway canvas finds out first.
function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}
async function loadScene() {
  if (params.has('noscene')) return stubScene('noscene');
  if (!hasWebGL()) { console.warn('WebGL unavailable: running with a dark canvas'); return stubScene('nowebgl'); }
  try {
    const mod = await import('./scene.js');
    const s = await mod.createScene({ canvas, data, assetsBase: './assets/' });
    if (!s || typeof s.pick !== 'function') throw new Error('scene.js returned no scene');
    return s;
  } catch (e) {
    console.warn('scene unavailable, running with a dark canvas:', e?.message ?? e);
    return stubScene('failed');
  }
}
const call = (obj, fn, ...args) => { try { return obj[fn]?.(...args); } catch (e) { console.warn(`scene.${fn} failed:`, e?.message ?? e); } };

// ---- boot --------------------------------------------------------------------------------------------------------------
const scene = await loadScene();
const audio = createAudio({ enabled: () => !!sim.state.account.settings.sound });
const ui = createUI({ sim, scene, data, audio });
if (scene.stub && scene.why === 'nowebgl') ui.toast('No WebGL in this browser, so the hall stays dark. The game still runs.', 'info');
else if (scene.stub && scene.why === 'failed') ui.toast('The 3D hall could not load, so it stays dark. The game still runs.', 'info');

for (const name of BUS_EVENTS) {
  sim.on(name, payload => {
    call(scene, 'apply', name, payload);
    if (name === 'stageChanged') call(scene, 'setState', sim.state, sim.derived);
    ui.handle(name, payload);
  });
}
call(scene, 'setState', sim.state, sim.derived);
call(scene, 'setBloom', !!sim.state.account.settings.bloom);
call(scene, 'start');

// ---- pointer: a short, still press is a tap (pick → incident / refresh / scrub); anything else belongs to OrbitControls ----
let press = null;
const unlockAudio = () => audio.unlock();
addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
addEventListener('keydown', unlockAudio, { once: true, capture: true });

// A second finger is a gesture (OrbitControls switches to dolly on it), never a tap: it cancels the pending press
// wherever it lands, canvas or HUD, so a pinch whose anchor finger stays still and lifts inside 500 ms cannot fix an
// incident or spend a Refresh. OrbitControls captures only the first pointer, so the primary's pointerup always reaches
// the canvas during a two-finger gesture; the cancel has to happen on the way down.
addEventListener('pointerdown', e => { if (!e.isPrimary) press = null; }, true);
canvas.addEventListener('pointerdown', e => {
  if (!e.isPrimary) { press = null; return; }
  press = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
});
// travel is judged as it happens, so a press that wandered and came back is still not a tap
canvas.addEventListener('pointermove', e => {
  if (!press) return;
  if (!e.isPrimary || e.pointerId !== press.id) { press = null; return; }
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= data.CAMERA.tapMaxPx) press = null;
});
canvas.addEventListener('pointerup', e => {
  if (!press || e.pointerId !== press.id) return;
  const p = press; press = null;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (Math.hypot(dx, dy) >= data.CAMERA.tapMaxPx || e.timeStamp - p.t >= TAP_MAX_MS) return;
  const r = canvas.getBoundingClientRect();
  onTap(e.clientX - r.left, e.clientY - r.top);
});
canvas.addEventListener('pointercancel', () => { press = null; });

function onTap(x, y) {
  const hit = call(scene, 'pick', x, y);
  if (hit == null) return;
  // the uplink cabinet during a DDoS: scene.pick reports it as 'uplink' (scene.js) or 'scrub' / { scrub: true }
  if (hit === 'uplink' || hit === 'scrub' || (typeof hit === 'object' && hit.scrub)) {
    const r = sim.tapScrub();
    if (r.ok) { audio.play('blip'); ui.scrubbed(r); }
    return;
  }
  const rack = typeof hit === 'object' ? hit.rack : hit;
  if (!Number.isInteger(rack)) return;
  const rk = sim.state.run.racks[rack];
  if (!rk) return;
  if (rk.incident) { const r = sim.tapIncident(rack); if (r.ok) audio.play(r.bounty > 0 ? 'register' : 'blip'); return; }
  // no incident: a tap on a rack is a Refresh when the hall is bought and full (§3); the sim says no otherwise
  const r = sim.refresh(rack, ui.refreshQty);
  if (r.ok) audio.play('pop');
  else if (r.reason === 'cash') ui.toast('Not enough cash to refresh that rack.', 'info');
  // 'nothing': the hall is bought and full but every next tier belongs to a later stage; say so rather than nothing
  else if (r.reason === 'nothing' && r.text) ui.toast(r.text, 'info');
}

// ---- resize, save, tab return, other tabs, loop ------------------------------------------------------------------------------
addEventListener('resize', () => { call(scene, 'resize'); ui.resize(); });
// §11 for a tab left in the background: rAF is paused there, so on return the sim would swallow the hours away in one
// 2 s catch-up. The save on hide stamped savedAt; sim.resume() credits the time away the way a reload would (card,
// three incidents after it) when it is 60 s or more, and does nothing otherwise.
const onReturn = () => { if (!document.hidden) sim.resume(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) sim.saveNow(); else onReturn(); });
addEventListener('pagehide', () => sim.saveNow());
addEventListener('pageshow', e => { if (e.persisted) onReturn(); });
// Another tab wrote the save: saveNow() runs the session check at once (and returns false, pausing this tab, when
// that tab is the newer one) instead of waiting up to 5 s for the next autosave.
addEventListener('storage', e => { if (e.key === data.SAVE_KEY) sim.saveNow(); });

function frame() {
  sim.update(performance.now());
  ui.update(performance.now());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = { sim, scene, ui, data, audio, dev: sim.dev };
