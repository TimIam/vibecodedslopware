// Stay With Me: boot, the title screen, the career loop (briefing -> dispatch -> drive -> scene -> transport ->
// handover -> review), saves, settings and the pause menu. Each big art module is loaded behind a guard and replaced
// by a stand-in from fallback.js if it is missing, so the game always runs.
//
// Save: localStorage 'staywithme.v1'. On localhost `window.__swm` drives the game for tests:
//   __swm.state()  __swm.call(id)  __swm.skipDrive()  __swm.act(id, args)  __swm.step(simSeconds)  __swm.scene / .drive / .game

import * as THREE from 'three';
import { G, U, ENV, initGfx, createOutdoorRig, applyEnv, updateRig, render, resize, setQuality, setFade } from './gfx.js';
import { Snd } from './audio.js';
import { $, el, esc, say, toast, layers, playing, fade, wait, modal, openModal, closeModal, modalOpen, isOpen, onKey, keys, setLoad, hideLoad, showLoad, clearSubs, fmtClock } from './ui.js';
import { SCENARIOS, SHIFTS, TRIAGE, HOSPITALS } from './scenarios.js';
import { DIFFICULTY, BRIEF, ENROUTE, AFTER, ENDINGS, CREDITS } from './story.js';
import { grade } from './review.js';
import { act } from './actions.js';
import { Scene } from './scene.js';
import { Drive } from './drive.js';
import * as FB from './fallback.js';

const SAVE_KEY = 'staywithme.v1';
const params = new URLSearchParams(location.search);
const game = window.game = {
  diff: DIFFICULTY.paramedic, save: null, mods: {}, monitor: null, beat: null, paused: false, mode: 'boot', clockOffset: 0,
  load(f, label) { setLoad(f, label); },
  hospitalInfo(id) { const p = game.town?.places?.[id]; const d = p && game.drive ? Math.hypot(p.stop.x - game.drive.s.x, p.stop.z - game.drive.s.z) : 0; const mi = d ? ` About ${(d * 1.35 / 1609).toFixed(1)} miles.` : ''; return (id === 'regional' ? 'East bank. Trauma centre, cardiac cath lab, stroke unit, dialysis.' : 'West side. Community emergency department. No cath lab, no neurosurgery, no trauma surgeons on site.') + mi; },
  async blackout(ms) { await fade(true, 250); await wait(ms); await fade(false, 500); },
};
const settings = Object.assign({ quality: 'high', master: 0.8, music: 0.55, voice: false }, JSON.parse(localStorage.getItem(SAVE_KEY + '.settings') || '{}'));
const saveSettings = () => localStorage.setItem(SAVE_KEY + '.settings', JSON.stringify(settings));
const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; } };
const writeSave = () => localStorage.setItem(SAVE_KEY, JSON.stringify(game.save));

// ---------------------------------------------------------------- boot
async function tryImport(name, check) { if (params.get('fallback')?.split(',').includes(name) || params.get('fallback') === 'all') return FB[name]; try { const m = await import(`./${name}.js`); if (check && !check(m)) throw new Error(name + ' incomplete'); return m; } catch (e) { console.warn(`[${name}] using stand-in:`, e.message); return FB[name]; } }

async function boot() {
  const canvas = $('#game'); initGfx(canvas, params.get('q') || settings.quality);
  window.addEventListener('resize', resize);
  const firstGesture = () => { Snd.init(); Snd.setVolume({ master: settings.master, sfx: 1, music: settings.music, radio: 1 }); window.removeEventListener('pointerdown', firstGesture); window.removeEventListener('keydown', firstGesture); };
  window.addEventListener('pointerdown', firstGesture); window.addEventListener('keydown', firstGesture);
  setLoad(0.03, 'Loading modules');
  const M = game.mods;
  [M.town, M.vehicles, M.human, M.anatomy, M.sets, M.monitor] = await Promise.all([tryImport('town', m => m.buildTown), tryImport('vehicles', m => m.buildAmbulance), tryImport('human', m => m.buildHuman), tryImport('anatomy', m => m.buildAnatomy), tryImport('sets', m => m.buildSet), import('./monitor.js').catch(() => null)]);
  // world
  const scene = game.townScene = new THREE.Scene(); const rig = game.rig = createOutdoorRig(scene);
  rig.onThunder = d => Snd.thunder(d);
  setLoad(0.08, 'Halloran Falls');
  let town; try { town = await M.town.buildTown({ seed: 1407, onProgress: (f, l) => setLoad(0.08 + 0.6 * f, l || 'Halloran Falls') }); } catch (e) { console.error('town failed, using stand-in', e); town = await FB.town.buildTown(); }
  game.town = town; scene.add(town.group);
  const drive = game.drive = new Drive(game);
  let V = M.vehicles; try { await drive.init(town, V, scene, rig, (f, l) => setLoad(0.7 + 0.25 * f, l)); } catch (e) { console.error('vehicles failed, using stand-in', e); if (drive.amb) scene.remove(drive.amb.group); await drive.init(town, FB.vehicles, scene, rig); }
  game.scene = new Scene(game);
  if (M.monitor) { game.beat = new M.monitor.BeatGen(); game.monitor = new M.monitor.Monitor($('#monCanvas'), game.beat); game.beat.onBeat = b => game.scene.onBeat(b); } else game.beat = { update() { } };
  applyEnv(rig, 'rainNight');
  G.renderer.setAnimationLoop(frame);
  setLoad(1, 'Ready'); await wait(250); hideLoad();
  if (params.get('call')) { game.diff = DIFFICULTY[params.get('diff')] || DIFFICULTY.paramedic; game.save = newSave(game.diff.id); playing(true); return runCall(params.get('call'), { skipDrive: params.has('skip'), env: params.get('env') }); }
  title();
}

// ---------------------------------------------------------------- frame
let last = performance.now(), titleT = 0;
function frame() {
  const now = performance.now(); let dt = Math.min(0.1, (now - last) / 1000); last = now; resize();
  if (game.paused) dt = 0;
  const d = game.drive, s = game.scene;
  if (game.mode === 'title') {
    titleT += dt; const a = titleT * 0.06 + 0.8, r = 15 + Math.sin(titleT * 0.11) * 4; cineCam.position.set(d.s.x + Math.sin(a) * r, 2.2 + Math.sin(titleT * 0.07) * 1.1, d.s.z + Math.cos(a) * r); cineCam.lookAt(d.s.x, 1.7, d.s.z); cineCam.aspect = G.w / G.h; cineCam.updateProjectionMatrix();
    d.lights = true; d.update(dt); game.town.update?.(dt, G.time, cineCam.position); game.drive?.peds?.update(cineCam.position); updateRig(game.rig, dt, _f.set(d.s.x, 0, d.s.z), cineCam);
  } else if (game.mode === 'drive') {
    d.update(dt); game.town.update?.(dt, G.time + game.clockOffset, d.cam.position); game.drive?.peds?.update(d.cam.position); updateRig(game.rig, dt, _f.set(d.s.x, 0, d.s.z), d.cam);
  } else if (game.mode === 'scene') {
    s.update(dt);
    if (s.world && !s.world.isSet) { const cam = G.camera || d.cam; d.update(dt); game.town.update?.(dt, G.time + game.clockOffset, cam.position); game.drive?.peds?.update(cam.position); updateRig(game.rig, dt, s.orbit.target, cam); }
  }
  Snd.update?.(dt);
  if (G.scene && G.camera) render(dt);
}
const cineCam = new THREE.PerspectiveCamera(38, 1.6, 0.2, 6000), _f = new THREE.Vector3();

// ---------------------------------------------------------------- title and menus
function title() {
  game.mode = 'title'; playing(false); layers('title'); clearSubs(); game.drive.stop?.(); applyEnv(game.rig, 'rainNight'); const sp = game.town.spawn; game.drive.place(sp.x, sp.z, sp.heading); G.view(game.townScene, cineCam);
  Snd.music('menu'); Snd.rain(0.8); Snd.setInterior(0); Snd.ambient('townNight');
  const sv = loadSave(), m = $('#mainMenu'); m.innerHTML = '';
  const B = (label, sub, fn, dis) => m.append(el('button', { disabled: dis, onclick: () => { Snd.ui('click'); fn(); }, onmouseenter: () => Snd.ui('hover') }, label, el('small', { text: sub || '' })));
  B('Continue', sv ? `${DIFFICULTY[sv.diff]?.name} · Shift ${Math.min(sv.shift + 1, SHIFTS.length)} of ${SHIFTS.length}` : 'No career yet', () => { game.save = sv; game.diff = DIFFICULTY[sv.diff]; career(); }, !sv || sv.over);
  B('New career', 'Seven shifts on Medic 14', newCareer);
  B('Single call', 'Any call, no story', singleCall);
  B('Patrol', 'Learn the streets, no patients', patrol);
  B('Settings', '', settingsMenu);
  B('Credits', '', () => modal(`<h2>Stay With Me</h2><p style="line-height:1.7;color:#c6d0d9">${CREDITS}</p><p style="color:var(--dim)">Everything you see and hear is generated in code: the town, the ambulance, the patients and their anatomy, the monitor traces, the siren.</p>`));
}
function newSave(diff) { return { diff, shift: 0, call: 0, results: {}, seed: Math.floor(Math.random() * 1e6), attempt: 0, saved: false, over: false }; }
async function pickDifficulty() {
  let pick = 'paramedic';
  const html = `<h2>Scope of practice</h2><p style="color:var(--dim)">You can change this only by starting again.</p><div class="cards">${Object.values(DIFFICULTY).map(d => `<button class="card ${d.id === pick ? 'sel' : ''}" data-d="${d.id}"><b>${d.name}</b><p>${d.blurb}</p><ul>${d.points.map(p => `<li>${p}</li>`).join('')}</ul></button>`).join('')}</div>`;
  const r = await modal(html, [['x', 'Back'], ['ok', 'Start', true]], { wide: true, onBuild: box => box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { pick = b.dataset.d; Snd.ui('tick'); box.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('sel', x === b)); }) });
  return r === 'ok' ? pick : null;
}
async function newCareer() { const d = await pickDifficulty(); if (!d) return; game.diff = DIFFICULTY[d]; game.save = newSave(d); writeSave(); career(); }
async function singleCall() {
  let pick = null; const d = await pickDifficulty(); if (!d) return; game.diff = DIFFICULTY[d];
  const html = `<h2>Single call</h2><div class="cards">${Object.entries(SCENARIOS).map(([id, s]) => `<button class="card" data-c="${id}"><b>${s.dispatch.nature}</b><p>${s.dispatch.text.replace(/^Medic 14, /, '').slice(0, 110)}...</p></button>`).join('')}</div>`;
  const r = await modal(html, [['x', 'Back']], { wide: true, onBuild: (box, done) => box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { pick = b.dataset.c; done('ok'); }) });
  if (r !== 'ok' || !pick) return; game.save = newSave(d); game.save.single = true; playing(true); await fade(true); const env = Object.keys(ENV)[Math.floor(Math.random() * Object.keys(ENV).length)]; await runCall(pick, { env }); title(); await fade(false);
}
// Free driving between posts: the way to learn the town before Critical Care takes the route line away.
async function patrol() {
  const envs = ['morning', 'noon', 'overcast', 'dusk', 'night', 'rainNight', 'fogDawn', 'rainDay'];
  let pick = 'noon';
  const r = await modal(`<h2>Patrol</h2><p style="color:var(--dim)">Dispatch moves you from post to post. No patients, no clock. <kbd>Esc</kbd> to stop.</p><h3>Conditions</h3><div class="amp" style="display:flex;gap:8px;flex-wrap:wrap">${envs.map(e => `<button class="chip ${e === pick ? 'sel' : ''}" data-e="${e}">${e.replace(/([A-Z])/g, ' $1').toLowerCase()}</button>`).join('')}</div>`, [['x', 'Back'], ['ok', 'Go', true]], { onBuild: box => box.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { pick = b.dataset.e; box.querySelectorAll('[data-e]').forEach(x => x.classList.toggle('sel', x === b)); }) });
  if (r !== 'ok') return;
  game.diff = DIFFICULTY.paramedic; playing(true); await fade(true); applyEnv(game.rig, pick); const drive = game.drive, sp = game.town.spawn; drive.place(sp.x, sp.z, sp.heading); drive.lights = false; game.mode = 'drive';
  const posts = Object.values(game.town.places).filter(p => p.stop); let first = true;
  for (;;) {
    const p = posts[Math.floor(Math.random() * posts.length)]; if (Math.hypot(p.stop.x - drive.s.x, p.stop.z - drive.s.z) < 250) continue;
    const run = drive.start({ to: { x: (p.kerb || p.stop).x, z: (p.kerb || p.stop).z, label: p.name || p.id }, mode: 'return', title: 'Move up and post', radius: 22 });
    if (first) { first = false; await fade(false, 700); }
    setTimeout(() => game.mode === 'drive' && radio(`Medic 14, move up and post at ${p.name || p.id}.`), 800);
    await run; Snd.ui('good'); await wait(600);
  }
}

async function settingsMenu() {
  const html = `<h2>Settings</h2><h3>Graphics</h3><div class="amp" style="display:flex;gap:8px">${['low', 'medium', 'high', 'ultra'].map(q => `<button class="chip ${settings.quality === q ? 'sel' : ''}" data-q="${q}">${q}</button>`).join('')}</div><h3>Master volume</h3><input type="range" min="0" max="1" step="0.05" value="${settings.master}" data-v="master" style="width:100%"><h3>Music</h3><input type="range" min="0" max="1" step="0.05" value="${settings.music}" data-v="music" style="width:100%"><h3>Radio voice</h3><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" ${settings.voice ? 'checked' : ''} data-voice> Speak dispatch traffic with the system voice (subtitles are always shown)</label>`;
  await modal(html, [['ok', 'Done', true]], { onBuild: box => { box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { settings.quality = b.dataset.q; setQuality(settings.quality); box.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('sel', x === b)); saveSettings(); }); box.querySelectorAll('[data-v]').forEach(i => i.oninput = () => { settings[i.dataset.v] = +i.value; Snd.setVolume({ master: settings.master, music: settings.music, sfx: 1, radio: 1 }); saveSettings(); }); box.querySelector('[data-voice]').onchange = e => { settings.voice = e.target.checked; saveSettings(); }; } });
}
onKey(code => {
  if (code !== 'Escape' || modalOpen()) return;
  if (game.mode === 'scene') { const s = game.scene; if (!s.active || s.proc || s.skill || s.busy || $('#fly').classList.contains('on')) return; }
  else if (game.mode !== 'drive' || !game.drive.active) return;
  game.paused = true; Snd.suspendAll?.();
  modal('<h2>Paused</h2><p style="color:var(--dim)">The patient is not.</p>', [['quit', 'Quit to title'], ['set', 'Settings'], ['ok', 'Resume', true]]).then(async r => { if (r === 'set') await settingsMenu(); game.paused = false; Snd.resumeAll?.(); last = performance.now(); if (r === 'quit') { game.abort = true; game.drive.arriveAbort?.(); location.reload(); } });
  return true;
});

// ---------------------------------------------------------------- career
async function briefing(shiftNo) {
  const b = BRIEF[shiftNo]; if (!b) return; Snd.music('calm');
  $('#briefShift').textContent = `Shift ${shiftNo} of ${SHIFTS.length}`; $('#briefTitle').textContent = b.title; $('#briefBody').innerHTML = b.text.map(t => `<p>${t}</p>`).join('') + (b.radio ? `<p class="radio">${esc(b.radio)}</p>` : '');
  openModal('brief'); await new Promise(r => { $('#briefGo').onclick = () => { Snd.ui('click'); closeModal('brief'); r(); }; });
}
async function career() {
  playing(true); const sv = game.save;
  while (sv.shift < SHIFTS.length && !sv.over) {
    const sh = SHIFTS[sv.shift];
    await fade(true); layers(); game.mode = 'idle';
    if (sv.call === 0) await briefing(sh.id);
    for (; sv.call < sh.calls.length; ) {
      const id = sh.calls[sv.call]; const env = sh.env2 && sv.call >= 2 ? sh.env2 : sh.env;
      const res = id === 'triage' ? await runTriage(env) : await runCall(id, { env, chained: id === 'dee' });
      if (res === 'quit') return title();
      if (res.retry) { sv.attempt++; continue; }
      sv.results[id] = { score: res.score, letter: res.letter, state: res.state }; sv.call++; sv.attempt = 0; writeSave();
      if (game.diff.permadeath && res.state === 'dead' && res.avoidable) { sv.over = true; writeSave(); await ending('career'); return title(); }
    }
    sv.shift++; sv.call = 0; writeSave();
    if (sv.shift < SHIFTS.length) await shiftSummary(sh);
  }
  await ending(sv.results.dee?.state === 'dead' ? 'deeDies' : 'deeLives'); sv.over = true; writeSave(); title(); fade(false);
}
async function shiftSummary(sh) {
  await fade(true); layers(); const rows = sh.calls.map(id => { const r = game.save.results[id]; const s = SCENARIOS[id] || TRIAGE; return r ? `<tr><td>${esc(s.title)}</td><td class="pt g${r.letter}" style="font-size:18px">${r.letter}</td><td class="pt">${r.score}</td></tr>` : ''; }).join('');
  await modal(`<div class="cap" style="color:var(--red)">End of shift ${sh.id}</div><h2>${esc(sh.name)}</h2><div id="review"><table style="margin-top:14px">${rows}</table></div>`, [['ok', 'Next shift', true]]);
}
async function ending(key) {
  const e = ENDINGS[key]; await fade(true); layers(); Snd.music(key === 'deeLives' ? 'triumph' : 'grief'); Snd.siren('off');
  $('#briefShift').textContent = key === 'career' ? 'Ketter County EMS' : 'Afterwards'; $('#briefTitle').textContent = e.title; $('#briefBody').innerHTML = e.text.map(t => `<p>${t}</p>`).join('');
  openModal('brief'); await new Promise(r => { $('#briefGo').onclick = () => { closeModal('brief'); r(); }; });
  const all = Object.values(game.save.results); if (all.length) { const mean = Math.round(all.reduce((s, r) => s + r.score, 0) / all.length), lived = all.filter(r => r.state !== 'dead').length; await modal(`<h2>Service record</h2><p style="font:17px/1.7 Georgia,serif">Calls: <b>${all.length}</b><br>Patients who lived: <b>${lived}</b><br>Mean review score: <b>${mean}</b><br>Scope: <b>${game.diff.name}</b></p><p style="color:var(--dim)">${CREDITS}</p>`, [['ok', 'Title', true]]); }
}

// ---------------------------------------------------------------- one call
function resolvePlace(sc) {
  const town = game.town, pl = sc.place, rng = mul((game.save.seed || 1) + sc.id.length * 31);
  if (typeof pl === 'string') { const p = town.places?.[pl]; if (p) return { label: p.name || pl, stop: p.stop, spot: p.spot || p.stop, heading: p.heading }; }
  if (pl && pl.kind === 'road') { const es = town.edges.filter(e => e.cls === (pl.cls || 'arterial') && e.length > 90 && !e.bridge); const e = es[Math.floor(rng() * es.length)] || town.edges[0]; const a = game.drive.nodeById.get(e.a), t = e.length * 0.5, off = (e.median || 0) / 2 + (e.laneWidth || 3.4) * 0.5; const x = a.x + e.dir.x * t - e.dir.z * off, z = a.z + e.dir.z * t + e.dir.x * off, hd = Math.atan2(e.dir.x, e.dir.z); return { label: `${e.name}, mid-block`, stop: { x: x - e.dir.x * 14, z: z - e.dir.z * 14, heading: hd }, spot: { x: x + e.dir.x * 3, z: z + e.dir.z * 3, onRoad: true }, heading: hd }; }
  let list = (town.addresses || []).filter(a => (!pl?.kind || a.kind === pl.kind) && (!pl?.district || a.district === pl.district)); if (!list.length) list = town.addresses || [];
  const a = list[Math.floor(rng() * list.length)]; if (a) return { label: a.label, stop: a.stop, spot: a.spot || a.stop };
  const p = Object.values(town.places || {})[0]; return { label: p?.name || 'Unknown', stop: p.stop, spot: p.spot || p.stop };
}
const mul = seed => { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

async function buildWorld(sc, place, envName) {
  const drive = game.drive, night = (ENV[envName]?.night || 0) > 0.5;
  if (sc.set && sc.set !== 'street') {
    showLoad('Entering');
    let set; try { set = await game.mods.sets.buildSet(sc.set, { time: night ? 'night' : (ENV[envName]?.night || 0) > 0.3 ? 'dusk' : 'day', weather: (ENV[envName]?.rain || 0) > 0.3 ? 'rain' : 'clear', seed: sc.id.length * 17, patient: sc.patientOn || 'floor' }); } catch (e) { console.warn('set failed', e); set = await FB.sets.buildSet(sc.set, { patient: sc.patientOn || 'floor' }); }
    set.scene.updateMatrixWorld(true);
    const spot = o => { if (!o) return null; const p = new THREE.Vector3(), q = new THREE.Quaternion(); o.getWorldPosition(p); o.getWorldQuaternion(q); const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); return { pos: p, yaw: e.y }; };
    const ps = spot(set.patientSpot); ps.seatHeight = sc.patientOn !== 'floor' ? 0 : null; if (sc.patientOn && sc.patientOn !== 'floor') { ps.seatHeight = 0; }
    G.renderer.toneMappingExposure = set.exposure ?? 1; if (G.passes.bloom) G.passes.bloom.strength = set.bloom ?? 0.15;
    return { scene: set.scene, isSet: true, set, patientSpot: ps, partnerSpot: spot(set.partnerSpot), kitSpot: spot(set.kitSpot), bystanderSpots: (set.bystanderSpots || []).map(spot), colliders: set.colliders || [], cameraBounds: set.cameraBounds || null, cameraHome: set.cameraHome, update: (dt, t) => set.update?.(dt, t), ambient: { gym: 'gym', bar: 'bar', diner: 'bar' }[sc.set] || 'room', dispose: () => set.dispose?.() };
  }
  // on the street: the patient lies where the town says, lit by the truck
  const sp = place.spot, yaw = (place.heading ?? drive.s.yaw) + Math.PI / 2, y = sp.onRoad ? 0.01 : (game.town.surface?.(sp.x, sp.z) === 'sidewalk' ? 0.16 : 0.02);
  const pos = new THREE.Vector3(sp.x, y, sp.z), rot = (x, z) => new THREE.Vector3(pos.x + x * Math.cos(yaw) + z * Math.sin(yaw), y, pos.z - x * Math.sin(yaw) + z * Math.cos(yaw));
  drive.lightScene(pos.clone().setY(0.3), true); drive.lights = true;
  const dress = dressStreet(sc, rot, yaw); game.townScene.add(dress.group);
  return { scene: game.townScene, isSet: false, patientSpot: { pos, yaw }, partnerSpot: { pos: rot(-0.62, -0.42), yaw: yaw + Math.PI / 2 }, kitSpot: { pos: rot(0.95, -0.15), yaw: yaw - 0.5 }, bystanderSpots: [{ pos: rot(1.5, -1.9), yaw: yaw - 2.5 }], cameraBounds: null, cameraHome: { pos: rot(1.6, 1.4).setY(1.5), target: pos }, update: (dt, t) => dress.update(dt, t), dispose: () => { drive.lightScene(pos, false); dress.dispose(); } };
}

// The patient compartment of Medic 14 as a place to work (when you pull over on the way in).
async function rigWorld() {
  showLoad('Climbing in the back'); const V = game.mods.vehicles;
  const spot = o => { if (!o) return null; const p = new THREE.Vector3(), q = new THREE.Quaternion(); o.getWorldPosition(p); o.getWorldQuaternion(q); return { pos: p, yaw: new THREE.Euler().setFromQuaternion(q, 'YXZ').y }; };
  try {
    if (!V.buildAmbulanceInterior) throw new Error('no interior');
    const it = V.buildAmbulanceInterior({}); const scene = new THREE.Scene(); scene.background = new THREE.Color(0x040506); scene.add(it.group); it.stretcher?.setBackrest?.(0); it.setLights?.(true); scene.updateMatrixWorld(true);
    const rt = G.pmrem.fromScene(scene, 0.04); scene.environment = rt.texture; scene.environmentIntensity = 0.3; G.renderer.toneMappingExposure = 0.72; if (G.passes.bloom) G.passes.bloom.strength = 0.1;
    // the patient lies on the cot (its head end is +Z; a supine body's head points along -Z of its own frame)
    const ps = spot(it.stretcher?.mattressTop || it.patientSpot), b = it.bounds?.isBox3 ? it.bounds : null; if (it.stretcher?.mattressTop) ps.yaw += Math.PI;
    return { scene, isSet: true, patientSpot: ps, partnerSpot: (() => { const a = spot(it.seatAttendant), p = a.pos.clone().lerp(ps.pos, 0.35); p.y = 0; return { pos: p, yaw: Math.atan2(ps.pos.x - p.x, ps.pos.z - p.z) }; })(), kitSpot: { pos: new THREE.Vector3(ps.pos.x + 0.75, 0, ps.pos.z + 0.3), yaw: 0 }, cameraBounds: b, cameraHome: it.cameraHome ? { pos: spot(it.cameraHome).pos, target: ps.pos } : null, update() { }, ambient: 'ambulance', dispose: () => { rt.dispose(); scene.traverse(o => o.geometry?.dispose()); } };
  } catch (e) {
    console.warn('ambulance interior stand-in:', e.message); const set = await FB.sets.buildSet('ambulance', { patient: 'floor' }); G.renderer.toneMappingExposure = 1;
    return { scene: set.scene, isSet: true, patientSpot: spot(set.patientSpot), partnerSpot: spot(set.partnerSpot), kitSpot: spot(set.kitSpot), cameraBounds: set.cameraBounds, cameraHome: set.cameraHome, update() { }, ambient: 'ambulance', dispose: () => set.dispose() };
  }
}

// Vehicles around an outdoor patient: the police unit, what they were riding, what hit them.
function dressStreet(sc, rot, yaw) {
  const V = game.mods.vehicles, group = new THREE.Group(), upd = [], rng = mul(sc.id.length * 91 + 5);
  const put = (obj, x, z, h, y = 0) => { const p = rot(x, z); obj.position.set(p.x, y, p.z); obj.rotation.y = yaw + h; group.add(obj); };
  const car = (type, x, z, h, o = {}) => { if (!V.buildCar) return null; try { const c = V.buildCar(type, { lod: 1, seed: Math.floor(rng() * 999), color: o.color }); put(c.group, x, z, h); c.lights?.setHead?.(U.uNight.value > 0.3 ? 1 : 0); if (o.emergency) c.lights?.setEmergency?.(true); if (o.hazard) c.lights?.setHazard?.(true); if (c.lights?.update) upd.push((dt, t) => c.lights.update(dt, t)); return c; } catch (e) { console.warn('prop', type, e.message); return null; } };
  for (const pr of sc.props || []) {
    if (pr === 'police') car('police', -5.5, 7.5, 2.5, { emergency: true });
    else if (pr === 'carStopped') car('sedan', 4.2, -6.5, 0.5, { hazard: true });
    else if (pr === 'bikeDown' && V.buildMotorcycle) { try { const b = V.buildMotorcycle({ seed: 3 }); b.group.rotation.z = Math.PI / 2 * 0.92; put(b.group, 3.4, 3.2, 1.1, 0.32); b.group.rotation.z = Math.PI / 2 * 0.92; } catch (e) { console.warn('prop bike', e.message); } }
    else if (pr === 'pileup') { car('pickup', -7, -3, 0.9, { hazard: true }); car('van', 6.5, 2.5, -0.35, { hazard: true }); car('hatch', 3.5, 9, 1.9); car('sedan', -3.5, 12, 0.2, { hazard: true }); car('suv', 9, -7, 2.7); }
    else if (pr === 'engine') car('engine', -14, 16, 0.4, { emergency: true });
  }
  return { group, update(dt, t) { for (const f of upd) f(dt, t); }, dispose() { group.removeFromParent(); group.traverse(o => { if (o.isMesh && !o.geometry.userData?.shared) o.geometry.dispose?.(); }); } };
}

function radio(text, who = 'Dispatch') { Snd.radioSquelch(true); say(who, text, 'radio'); if (settings.voice) Snd.say(text, { role: 'dispatch' }); setTimeout(() => Snd.radioSquelch(false), 900); }

async function runCall(id, opts = {}) {
  const sc = Object.assign({ id }, SCENARIOS[id]); const drive = game.drive, env = opts.env || 'overcast';
  applyEnv(game.rig, env); game.clockOffset = Math.random() * 60;
  const place = resolvePlace(sc); let resp = { time: 0, target: 1, crashes: 0, smooth: 1 };
  // ---- respond
  if (!opts.chained && !opts.skipDrive) {
    if (opts.fromHere !== true) { const sp = game.town.spawn; if (Math.hypot(drive.s.x - sp.x, drive.s.z - sp.z) > 2500 || game.save.call === 0 || game.save.single) drive.place(sp.x, sp.z, sp.heading); }
    game.mode = 'drive'; drive.lights = false; drive.siren = 'off';
    const p = drive.start({ to: { x: place.stop.x, z: place.stop.z, label: place.label }, mode: 'response', call: sc.dispatch });
    await fade(false, 800);
    const dur = Snd.dispatchTones() || 3.4; await wait(dur * 1000 * 0.8); radio(sc.dispatch.text);
    const lines = ENROUTE[id] || []; lines.forEach((l, i) => setTimeout(() => { if (drive.active && drive.run?.mode === 'response') say('Dee', l, 'dee'); }, 9000 + i * 11000));
    resp = await p; await fade(true, 500);
  } else { drive.place(place.stop.x, place.stop.z, place.stop.heading ?? 0); if (!opts.chained) await fade(true, 10); }
  // ---- on scene
  clearSubs(); const world = await buildWorld(sc, place, env); game.mode = 'scene';
  const scenePromise = game.scene.start(sc, world, {}); hideLoad(); await wait(200); await fade(false, 700);
  const out = await scenePromise; const p = out.p;
  // ---- transport
  let trans = { time: 0, smooth: 1, crashes: 0 };
  if (out.dest && !out.dead && !out.refused && !opts.skipDrive) {
    await fade(true, 500); game.scene.dispose(); world.dispose?.(); applyEnv(game.rig, env);
    const hp = game.town.places[out.dest] || Object.values(game.town.places)[0]; game.mode = 'drive'; drive.lights = true;
    const said = new Set(); let backResolve = null;
    const tp = drive.start({ onBack: () => backResolve?.('back'), to: { x: hp.stop.x, z: hp.stop.z, label: hp.name || HOSPITALS[out.dest].name }, mode: 'transport', call: sc.dispatch, patient: p, radius: 20,
      jolt: imp => { if (p.tx.cpr.on && imp > 5) { p.tx.cpr.on = false; p.tx.cpr.lastPause = p.t; setTimeout(() => { if (p.arrest) act(p, 'cpr', { by: 'partner' }); }, 5000); say('Dee', 'I\'m on the floor back here! Drive it like there\'s someone in it!', 'dee'); } },
      onTick: () => { for (const e of p.events.splice(0)) { if (e.type === 'arrest' && !said.has('a')) { said.add('a'); if (!sc.partnerDown) { say('Dee', 'Rook! No pulse back here. I\'m starting compressions. Just get us there!', 'dee'); act(p, 'cpr', { by: 'partner' }); } Snd.music('critical'); } else if (e.type === 'rosc') say('Dee', 'I\'ve got a pulse back. Keep it smooth.', 'dee'); else if (e.type === 'vomit' && !sc.partnerDown) { say('Dee', 'Vomiting. I\'ve got suction.', 'dee'); p.secretions = Math.max(0, p.secretions - 0.6); } }
        if (!said.has('s') && p.spo2 < 85 && !p.arrest) { said.add('s'); if (!sc.partnerDown) say('Dee', `Sats are ${p.spo2} and dropping.`, 'dee'); } if (!said.has('b') && p.sys < 75 && !p.arrest) { said.add('b'); if (!sc.partnerDown) say('Dee', 'Pressure\'s in the seventies. Whatever you\'re going to do, do it at the hospital. Go.', 'dee'); } } });
    await fade(false, 600);
    for (;;) {
      const r = await Promise.race([tp, new Promise(res => { backResolve = res; })]);
      if (r !== 'back') { trans = r; break; }
      await fade(true, 400); const w = await rigWorld(); game.mode = 'scene';
      const sp = game.scene.start(sc, w, { patient: p, script: out.script, inTransit: true }); hideLoad(); await wait(150); await fade(false, 500);
      const o2 = await sp; if (o2.dest) out.dest = o2.dest; await fade(true, 400); game.scene.dispose(); w.dispose?.(); applyEnv(game.rig, env); game.mode = 'drive';
      if (o2.dead) { drive.stop(); break; }
      drive.resumeRun(); await fade(false, 400);
    }
    await fade(true, 600);
  } else { await fade(true, 500); game.scene.dispose(); world.dispose?.(); applyEnv(game.rig, env); }
  Snd.siren('off'); Snd.music('calm'); Snd.alarm('off'); game.mode = 'idle'; layers();
  // ---- review
  const call = { dest: out.dest, sceneTime: out.sceneTime, responseTime: resp.time, responseTarget: resp.target, smooth: trans.smooth, crashes: (resp.crashes || 0) + (trans.crashes || 0), transportTime: trans.time };
  const g = grade(p, sc, call); const pass = g.score >= game.diff.passMark;
  const first = !Object.keys(game.save.results).length && g.outcome.state === 'good';
  const choice = await review(sc, g, call, p, pass);
  if (choice === 'retry') return { retry: true };
  if (!sc.partnerDown && !game.save.single) { const pool = g.outcome.state === 'dead' ? AFTER.bad : g.score >= 85 ? AFTER.good : AFTER.ok; setTimeout(() => say('Dee', first ? AFTER.first : pool[Math.floor(Math.random() * pool.length)], 'dee'), 600); }
  return { score: g.score, letter: g.letter, state: g.outcome.state, avoidable: g.errors.some(e => e.sev >= 3) };
}

async function review(sc, g, call, p, pass) {
  const box = $('#reviewBox');
  const rows = g.items.map(i => `<tr class="${i.ok ? 'ok' : 'no'}"><td>${i.ok ? '✓' : '·'}</td><td>${esc(i.text)}</td><td class="pt">${i.got}/${i.pts}</td></tr>`).join('');
  const errs = g.errors.map(e => `<tr class="err"><td>✗</td><td>${esc(e.text)}${e.n > 1 ? ` (x${e.n})` : ''}</td><td class="pt">${e.sev >= 3 ? 'critical' : e.sev === 2 ? 'serious' : 'minor'}</td></tr>`).join('');
  box.innerHTML = `<div class="grade g${g.letter}">${g.letter}</div><div class="cap" style="color:var(--red)">Call review · Dr. I. Reyes, Medical Director</div><h2>${esc(sc.title)}</h2>
    <div class="outcome ${g.outcome.state}">${esc(g.outcome.text)}</div>
    <div class="cols"><div><h3>What you did</h3><table>${rows}</table>${errs ? `<h3>Errors</h3><table>${errs}</table>` : ''}</div>
    <div><h3>The numbers</h3><table><tr><td>Score</td><td class="pt">${g.score} / 100</td></tr><tr><td>Clinical care</td><td class="pt">${g.clinical}</td></tr><tr><td>Driving</td><td class="pt">${g.driving}</td></tr><tr><td>Response time</td><td class="pt">${fmtClock(call.responseTime)} <span style="color:var(--faint)">(target ${fmtClock(call.responseTarget)})</span></td></tr><tr><td>On scene</td><td class="pt">${fmtClock(call.sceneTime)}</td></tr><tr><td>Collisions</td><td class="pt">${call.crashes}</td></tr></table>
    <h3>What it was</h3><div class="truth">${esc(sc.truth)}</div></div></div>
    <div class="row" style="margin-top:20px;justify-content:flex-end">${pass ? '' : `<span class="cap grow" style="color:var(--amber);text-transform:none;letter-spacing:.03em">Below the standard for ${game.diff.name} (${game.diff.passMark}). The record stands if you continue.</span>`}<button class="btn" id="rvRetry">Run the call again</button><button class="btn pri" id="rvGo">Continue</button></div>`;
  Snd.music(g.outcome.state === 'dead' ? 'grief' : g.score >= 85 ? 'triumph' : 'calm');
  if (game.diff.permadeath) $('#rvRetry').style.display = 'none';
  const picked = new Promise(res => { $('#rvGo').onclick = () => res('go'); $('#rvRetry').onclick = () => res('retry'); });
  openModal('review'); await fade(false, 500);
  const r = await picked;
  Snd.ui('click'); await fade(true, 400); closeModal('review'); return r;
}

// ---------------------------------------------------------------- the bridge: triage
async function runTriage(env) {
  const drive = game.drive; applyEnv(game.rig, env); const pl = game.town.places.kessler || Object.values(game.town.places)[0];
  game.mode = 'drive'; drive.lights = false; const sp = game.town.spawn; drive.place(sp.x, sp.z, sp.heading);
  const dp = drive.start({ to: { x: pl.stop.x, z: pl.stop.z, label: 'Kessler Bridge, mid-span' }, mode: 'response', call: TRIAGE.dispatch, radius: 22 });
  await fade(false, 800); await wait((Snd.dispatchTones() || 3.4) * 800); radio(TRIAGE.dispatch.text); (ENROUTE.triage || []).forEach((l, i) => setTimeout(() => drive.active && say('Dee', l, 'dee'), 9000 + i * 11000));
  const resp = await dp; drive.lights = true; game.mode = 'title'; G.view(game.townScene, cineCam); layers(); clearSubs();
  let clock = 100; const tags = {}, checks = {}; const C = TRIAGE.casualties;
  const box = $('#triageBox'); const draw = () => {
    box.innerHTML = `<div class="row"><div class="grow"><div class="cap" style="color:var(--red)">Mass-casualty triage · START</div><h2>Kessler Bridge</h2></div><div style="text-align:right"><div class="cap">Before the next vehicle hits this pile</div><div class="num" style="font:300 40px var(--thin)" id="trClock">${Math.ceil(clock)}</div></div></div><p style="color:var(--dim);margin:4px 0 14px">Each check costs four seconds. Tag all five. Can they walk? Breathing over 30, or not at all? Radial pulse? Do they follow a command?</p><div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">${C.map(c => `<div class="cas"><div class="cap">${esc(c.where)}</div><p style="margin:6px 0;font-size:13px">${esc(c.desc)}</p><div class="chk">${[['walks', 'Walk?'], ['rr', 'Breathing'], ['radial', 'Radial'], ['obeys', 'Command']].map(([k, l]) => `<button class="btn sm" data-c="${c.id}" data-k="${k}">${l}</button>`).join('')}</div><div class="res">${(checks[c.id] || []).join('<br>')}</div><div class="tags">${['red', 'yellow', 'green', 'black'].map(t => `<button class="tag ${t} ${tags[c.id] === t ? 'sel' : ''}" data-t="${t}" data-c="${c.id}">${t[0].toUpperCase()}</button>`).join('')}</div></div>`).join('')}</div>`;
    box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const c = C.find(x => x.id === b.dataset.c), k = b.dataset.k; clock -= 4; Snd.ui('tick'); const txt = k === 'walks' ? (c.walks ? 'Walks toward you.' : 'Cannot walk.') : k === 'rr' ? (c.rr === 0 ? 'Not breathing. Airway opened: still nothing.' : `Breathing ${c.rr} a minute.`) : k === 'radial' ? (c.radial ? 'Radial pulse present.' : 'No radial pulse.') : (c.obeys ? 'Squeezes your hand on command.' : 'No response to command.'); (checks[c.id] = checks[c.id] || []).push(txt); draw(); });
    box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tags[b.dataset.c] = b.dataset.t; Snd.velcro(); draw(); if (Object.keys(tags).length === C.length) finish(); });
  };
  let finish; const done = new Promise(r => { finish = r; }); draw(); openModal('triage'); await fade(false, 500); Snd.music('tension');
  const iv = setInterval(() => { clock -= 0.25; const e = $('#trClock'); if (e) e.textContent = Math.max(0, Math.ceil(clock)); if (clock <= 0) finish(); }, 250);
  await done; clearInterval(iv);
  let right = 0; const notes = C.map(c => { const ok = tags[c.id] === c.tag; if (ok) right++; return `<tr class="${ok ? 'ok' : 'err'}"><td>${ok ? '✓' : '✗'}</td><td><b>${esc(c.where)}</b>: ${esc(c.why)}${tags[c.id] && !ok ? ` You tagged ${tags[c.id].toUpperCase()}.` : !tags[c.id] ? ' Not tagged.' : ''}</td></tr>`; }).join('');
  const score = Math.round(100 * right / C.length * 0.85 + (clock > 0 ? 15 : 0)), letter = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  closeModal('triage'); Snd.crash(1); G.grade.uFlash.value = 0.6; Snd.music('critical');
  await modal(`<div id="review"><div class="grade g${letter}">${letter}</div><div class="cap" style="color:var(--red)">Triage</div><h2>Kessler Bridge</h2><table style="margin-top:12px">${notes}</table><div class="outcome dead" style="margin-top:18px">You are tying the last tag when you hear it: an engine note that is wrong, coming too fast through the rain, and then the long sound of a pickup finding the back of the queue. When you turn round, Dee is not where she was standing.</div></div>`, [['ok', 'Dee', true]], { wide: true });
  await fade(true, 300);
  return { score, letter, state: 'good' };
}

boot().catch(e => { console.error(e); $('#loadLabel').textContent = 'Failed to start: ' + e.message; });

// ---------------------------------------------------------------- test hooks
window.__swm = {
  get ready() { return game.mode !== 'boot'; }, game, get scene() { return game.scene; }, get drive() { return game.drive; },
  state() { const p = game.scene?.p; return { mode: game.mode, call: game.scene?.sc?.id, t: p?.t, rhythm: p?.rhythm, hr: p && Math.round(p.hr), sys: p && Math.round(p.sys), spo2: p?.spo2, gcs: p?.gcs.total, errors: p?.errors.map(e => e.id), x: game.drive?.s.x, z: game.drive?.s.z, v: game.drive?.s.vx }; },
  call(id, opt = {}) { game.diff = DIFFICULTY[opt.diff || 'student']; game.save = newSave(game.diff.id); game.save.single = true; playing(true); return runCall(id, Object.assign({ skipDrive: true }, opt)); },
  act(id, args) { const s = game.scene; const r = act(s.p, id, args || {}, s.ctx); s.afterAction(id, args || {}, r, 'me'); return r.msg; },
  step(sec) { const p = game.scene.p; for (let t = 0; t < sec; t += 0.25) p.step(0.25); return this.state(); },
  skipDrive() { const d = game.drive; if (d.run) { d.place(d.run.to.x, d.run.to.z, d.s.yaw); d.arrive(); } },
  env(n) { applyEnv(game.rig, n); },
  auto(on = true, speed = 15) { game.drive.auto = on; game.drive.autoSpeed = speed; },
  // put the truck in the lane of the nearest road, pointing along the route
  toRoad() { const d = game.drive, ne = d.nearestEdge(d.s.x, d.s.z), D = d.distTo, e = ne.e; const sign = !D || (D.get(e.b) ?? 0) <= (D.get(e.a) ?? 0) ? 1 : -1; const o = {}; d.lane(e, sign, 0, sign > 0 ? ne.t : e.length - ne.t, o); d.place(o.x, o.z, o.yaw); return [Math.round(o.x), Math.round(o.z), e.name]; },
};
