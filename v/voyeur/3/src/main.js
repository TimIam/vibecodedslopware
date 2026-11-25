// Across the Street: tech demo. Renderer, the slow camera that drifts between the whole building
// and whichever window has something going on, the HUD, and the demo keys.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { GH, FH, FLOORS } from './building.js';
import { damp, range } from './util.js';

const q = new URLSearchParams(location.search);
const parseTime = (s) => { const m = /^(\d{1,2}):?(\d{2})?$/.exec(s || ''); return m ? +m[1] * 60 + (+m[2] || 0) : null; };
const date = q.get('date') ? new Date(q.get('date') + 'T12:00:00') : new Date();
const startMin = parseTime(q.get('t')) ?? 16 * 60 + 40;

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 1500);

const world = new World(scene, { date, startMin, seed: +(q.get('seed') || Math.floor(Math.random() * 1e9)), season: q.get('season') });
if (q.get('ff')) world.ff = +q.get('ff');

const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  const narrow = Math.max(0, 1.6 - camera.aspect);
  camera.fov = 38 + narrow * 22;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- camera director
const WIDE = { pos: new THREE.Vector3(0, 9.0, 34), tgt: new THREE.Vector3(0, 10.0, 0) };
const ACT_W = { 'cooking dinner': 3, 'having dinner': 3, 'making breakfast': 2.5, 'having breakfast': 2.5, 'watching TV': 2, 'eating pizza': 4, 'looking out the window': 4, 'working from home': 1.5, 'on the laptop': 1.5, reading: 1.5, collapsed: 10, 'calling 911': 10, 'treating the patient': 10, 'getting into bed': 1, 'packing a suitcase': 3 };
const director = {
  mode: 'wide', t: 14, unit: null, auto: true, pinned: 0,
  pos: WIDE.pos.clone(), tgt: WIDE.tgt.clone(), cur: WIDE.pos.clone(), curT: WIDE.tgt.clone(),
  score(u) {
    let s = 0;
    const lit = u.rooms.L.mainOn() || u.rooms.B.mainOn() || u.rooms.L.tvWatch.size || world.dayF > 0.5;
    for (const a of [...u.residents, ...u.pets]) {
      if (a.hidden || a.asleep) continue;
      const rk = u.roomKeyAt(a.pos);
      if (rk !== 'L' && rk !== 'B') continue;
      s += a.pose === 'walk' ? 1.5 : (ACT_W[a.label] || 1);
    }
    for (const a of world.actors) if (a.home === u && !u.residents.includes(a) && !u.pets.includes(a) && !a.hidden) s += 8;
    if (u.fire) s += 40 * (u.fire.level + 0.2);
    return s * (lit ? 1 : 0.25);
  },
  shotFor(u) {
    return { pos: new THREE.Vector3(u.cx * 0.85, u.y + 5.0, 7.8), tgt: new THREE.Vector3(u.cx, u.y + 0.8, -2.4) };
  },
  streetActive() {
    return world.street.flashing || world.street.vehicles.some((v) => v.state === 'stopped');
  },
  choose() {
    if (this.streetActive() && Math.random() < 0.6) {
      const v = world.street.flashing || world.street.vehicles.find((x) => x.state === 'stopped');
      this.mode = 'street'; this.unit = null;
      this.pos.set(v.x * 0.5, 3.4, 16.5); this.tgt.set(v.x * 0.4, 2.2, 0);
      this.t = range(Math.random, 20, 30);
      return;
    }
    let best = null, bs = 0;
    for (const u of world.units) { const s = this.score(u) * range(Math.random, 0.6, 1.4); if (s > bs) { bs = s; best = u; } }
    if (best && bs > 0.8) { this.focus(best, range(Math.random, 22, 34)); return; }
    this.wide(range(Math.random, 18, 30));
  },
  focus(u, t) { this.mode = 'unit'; this.unit = u; const s = this.shotFor(u); this.pos.copy(s.pos); this.tgt.copy(s.tgt); this.t = t; },
  wide(t) { this.mode = 'wide'; this.unit = null; this.pos.copy(WIDE.pos); this.tgt.copy(WIDE.tgt); this.t = t; },
  update(dt, realT) {
    this.t -= dt;
    if (this.auto && this.t <= 0) { if (this.mode === 'wide') this.choose(); else this.wide(range(Math.random, 30, 55)); }
    if (this.auto && world.street.flashing && !this.sawFlash) { this.sawFlash = world.street.flashing; this.mode = 'wide'; this.t = 0.01; }
    if (!world.street.flashing) this.sawFlash = null;
    const r = this.mode === 'wide' ? 0.35 : 0.42;
    this.cur.x = damp(this.cur.x, this.pos.x, r, dt); this.cur.y = damp(this.cur.y, this.pos.y, r, dt); this.cur.z = damp(this.cur.z, this.pos.z, r, dt);
    this.curT.x = damp(this.curT.x, this.tgt.x, r * 1.3, dt); this.curT.y = damp(this.curT.y, this.tgt.y, r * 1.3, dt); this.curT.z = damp(this.curT.z, this.tgt.z, r * 1.3, dt);
    camera.position.set(this.cur.x + Math.sin(realT * 0.05) * 0.5, this.cur.y + Math.sin(realT * 0.071) * 0.15, this.cur.z);
    camera.lookAt(this.curT);
  },
};

// ---- HUD
const $ = (id) => document.getElementById(id);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let showCaps = true;
function clockText() {
  const d = world.date(), m = world.mod;
  let h = Math.floor(m / 60), mm = Math.floor(m % 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${h}:${String(mm).padStart(2, '0')} ${ap} · ${world.season.name}${world.ff > 1 ? ` · ×${world.ff} fast` : ''}`;
}
function captionText() {
  if (director.mode === 'unit' && director.unit) {
    const u = director.unit;
    const people = u.residents.filter((p) => p.where === 'home' && !p.hidden);
    const others = world.actors.filter((a) => a.home === u && !u.residents.includes(a) && !u.pets.includes(a) && !a.hidden);
    const lines = people.map((p) => `${p.name} is ${p.label || 'at home'}`);
    if (u.fire && !u.fire.out) lines.unshift('the kitchen is on fire');
    for (const role of new Set(others.map((a) => a.role || 'visitors'))) lines.push(`${role} ${role.startsWith('a ') ? 'is' : 'are'} here`);
    if (u.breakIn && u.breakIn.done && !u.breakIn.reported) lines.push('someone has been in here');
    if (u.damage && !u.damage.bedroomOnly) lines.push('fire damage, windows boarded up');
    for (const c of u.pets) lines.push(`${c.name} the cat is ${c.pose === 'loaf' ? 'curled up' : 'wandering'}`);
    if (!people.length && !others.length) lines.push(u.residents.some((p) => p.where === 'away') ? 'nobody home: away on a trip' : u.residents.some((p) => p.where === 'hospital') ? 'nobody home: in the hospital' : 'nobody home right now');
    return `<b>Apartment ${u.name}</b> · ${lines.join(' · ')}`;
  }
  if (director.mode === 'street') return '<b>Out front</b>';
  return '';
}
let lastToast = null, toastUntil = 0;
function updateHud() {
  $('clock').textContent = clockText();
  $('cap').innerHTML = showCaps ? captionText() : '';
  const tq = world.toastQ;
  if (tq.length && tq[tq.length - 1] !== lastToast) { lastToast = tq[tq.length - 1]; toastUntil = performance.now() + 7000; $('toast').textContent = lastToast.msg; }
  $('toast').style.opacity = performance.now() < toastUntil ? 1 : 0;
}

// ---- input
const seasons = [null, 'winter', 'halloween', 'summer', 'spring'];
let seasonIdx = 0;
const say = (m) => world.toast(m);
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === '1') { const n = world.demo('delivery'); say(n ? `Demo: a parcel van is coming for ${n}` : 'Demo: nobody to deliver to'); }
  if (k === '2') { const n = world.demo('pizza'); say(n ? `Demo: ${n} orders pizza` : 'Demo: nobody is awake at home'); }
  if (k === '3') { const n = world.demo('ride'); say(n ? `Demo: someone in ${n} calls a ride` : 'Demo: nobody is awake at home'); }
  if (k === '4') { const n = world.demo('ambulance'); if (!n) say('Demo: no emergency right now (nobody awake at home, or one is already under way)'); }
  if (k === '6') { const n = world.demo('fire'); say(n ? `Demo: fire in ${n}` : 'Demo: something big is already happening'); }
  if (k === '7') { const n = world.demo('breakin'); say(n ? `Demo: a break-in at ${n} (nobody home)` : 'Demo: no empty apartment right now (try during work hours or a trip)'); }
  if (k === '5') { seasonIdx = (seasonIdx + 1) % seasons.length; world.seasonOverride = seasons[seasonIdx]; world.applySeason(); say(`Season: ${world.season.name}${seasons[seasonIdx] ? '' : ' (from today\'s date)'}`); }
  if (k === 't') { world.time += 60; say('Skipped ahead one hour'); }
  if (k === 'f' && !e.repeat) world.ff = 30;
  if (k === 'c') { director.auto = !director.auto; if (!director.auto) director.wide(1e9); else director.t = 0; say(director.auto ? 'Camera: drifting' : 'Camera: held on the whole building'); }
  if (k === 'n') director.t = 0;
  if (k === 'i') showCaps = !showCaps;
  if (k === 'h' || k === '?') $('help').classList.toggle('show');
});
addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'f') world.ff = +(q.get('ff') || 1); });
canvas.addEventListener('click', (e) => {
  const ndc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const t = -ray.ray.origin.z / ray.ray.direction.z;
  if (!(t > 0)) return;
  const p = ray.ray.at(t, new THREE.Vector3());
  const f = Math.floor((p.y - GH) / FH);
  if (f < 0 || f >= FLOORS || Math.abs(p.x) > 7.6) { director.wide(40); return; }
  const u = world.units.find((x) => x.floor === f && x.side === (p.x < 0 ? 0 : 1));
  if (u) director.focus(u, 45);
});
let idle = 0;
addEventListener('mousemove', () => { idle = 0; document.body.classList.remove('idle'); });

// ---- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  world.update(dt);
  director.update(dt, now / 1000);
  renderer.toneMappingExposure = world.exposure;
  composer.render();
  updateHud();
  idle += dt;
  if (idle > 3) document.body.classList.add('idle');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Headless/test hooks
window.__vy = {
  world, director, camera, renderer,
  render() { renderer.toneMappingExposure = world.exposure; composer.render(); },
  setTime(hhmm) { const m = parseTime(hhmm); world.time = world.day * 1440 + m; },
  step(sec, sub = 1 / 30) { for (let t = 0; t < sec; t += sub) { world.update(sub); director.update(sub, t); } },
  status() {
    return world.units.map((u) => ({ unit: u.name, people: u.residents.map((p) => `${p.name}(${p.job}): ${p.where} ${p.label}`), lights: Object.fromEntries(Object.entries(u.rooms).map(([k, r]) => [k, r.lights.filter(Boolean).map((l) => (l.on ? 1 : 0)).join('')])) }));
  },
};
