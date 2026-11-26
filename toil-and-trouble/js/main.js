// main.js — boot, the screen state machine (title → map → level → results), saving, audio wiring and test hooks.
import { createWorld, step, snapCam, W, H, T, STATS } from './world.js';
import { WORLDS, allLevels } from './worlds.js';
const LEVELS = allLevels();
const firstOf = (wi) => LEVELS.findIndex((l) => l.wi === wi);
const levelsOf = (wi) => LEVELS.filter((l) => l.wi === wi);
import { createView, drawWorld, setBackgroundFactory } from './render.js';
import { initInput, readInput, onAnyPress, controlsHint, rumble } from './input.js';
import * as SCR from './screens.js';
import { drawText } from './pix.js';
import { loadArt } from './sprites.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// --- audio and backdrops load as optional modules -------------------------------------------------------------
let A = { initAudio() {}, sfx() {}, playMusic() {}, stopMusic() {}, duckMusic() {}, setMuted() {}, isMuted: () => false, setPaused() {} };
const audioReady = import('./audio.js').then((m) => { A = m; syncMute(); if (wantMusic) A.playMusic(wantMusic); }).catch((e) => console.warn('audio unavailable', e));
const bgMods = [];
const bgReady = Promise.allSettled([import('./backgrounds.js'), import('./bg_holidays_a.js'), import('./bg_holidays_b.js')]).then((rs) => {
  for (const r of rs) if (r.status === 'fulfilled') bgMods.push(r.value);
  setBackgroundFactory((theme, o) => { const m = bgMods.find((mm) => mm.THEMES.includes(theme)); return m ? m.makeBackground(theme, o) : null; });
});
let wantMusic = null;
function music(n, o) { wantMusic = n; A.playMusic(n, o); }

// --- save ---------------------------------------------------------------------------------------------------------
const SAVE_KEY = 'toil.save.v2';
function freshSave() { return { v: 2, reached: 0, cleared: {}, pages: {}, brew: {}, lives: 5, cards: 0 }; }
function loadSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 2) return { ...freshSave(), ...s }; } catch {} return freshSave(); }
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
let save = loadSave();
save.totalPages = LEVELS.filter((l) => l.rooms?.length || l.rows.join('').includes('p')).length; save.totalBrew = LEVELS.filter((l) => !l.isBoss).length;

// --- state --------------------------------------------------------------------------------------------------------
const st = {
  mode: 'title', t: 0, frame: 0,
  map: { node: 0, walk: null, face: 1 }, wsel: 0,
  L: null, levelIdx: 0, world: null, view: null, main: null, mainView: null, bonusIdx: -1,
  run: null, attempt: null, fade: 0, fadeDir: 0, fadeThen: null, pauseSel: 0, deadT: 0, clearT: 0, resT: 0, frozen: false,
};
let inp = {}, prevInp = {};
const pressed = (k) => inp[k] && !prevInp[k];

function setMode(m) { st.mode = m; st.t = 0; }
function fadeTo(fn, speed = 0.08) { st.fadeDir = speed; st.fadeThen = fn; }

function startLevel(i, keepAttempt = false) {
  const L = LEVELS[i];
  st.L = L; st.levelIdx = i;
  if (!keepAttempt) st.attempt = { check: null, page: false, letters: [false, false, false, false], got0: st.run?.got || 0 };
  st.run = st.run || { lives: save.lives, cards: save.cards, letters: {} };
  st.run.letters = { [L.id]: st.attempt.letters };
  st.world = createWorld(L, st.run, { checkpoint: st.attempt.check });
  st.view = createView(st.world);
  st.main = null; st.bonusIdx = -1;
  music(L.music);
  setMode(keepAttempt ? 'play' : 'card');
}
function enterBonus(idx) {
  const room = st.L.rooms[idx];
  st.main = st.world; st.mainView = st.view; st.bonusIdx = idx;
  const def = { ...room, id: st.L.id + ':bonus' + idx, name: 'Bonus' };
  st.world = createWorld(def, st.run, { party: [st.main.p.kind, st.main.partner] });
  st.view = createView(st.world);
  music(room.music || 'bonus');
}
function leaveBonus(win) {
  if (win) st.attempt.page = true;
  const g = st.main, idx = st.bonusIdx;
  st.world = g; st.view = st.mainView; st.main = null;
  const o = st.L.bonus?.[idx] || {};
  const p = g.p;
  if (o.ret) {
    p.x = o.ret[0] * T + 8 - p.w / 2; p.y = (o.ret[1] + 1) * T - p.h; p.vx = 0; p.vy = 0; p.state = 'normal'; p.cannon = null;
  } else {
    const c = g.ents.find((e) => e.type === 'cannon' && e.room === idx);
    if (c) { p.state = 'cannon'; p.cannon = c; c.room = null; c.auto = true; c.fireT = 4; }
    else p.state = 'normal';
  }
  for (const e of g.ents) if (e.type === 'cannon' && e.room === idx) e.cool = 90;
  p.invuln = 60;
  snapCam(g);
  music(st.L.music);
}

function restartFromDeath() {
  st.run.lives--;
  if (st.run.lives < 0) {
    save.lives = 5; save.cards = 0; writeSave();
    st.run = null;
    music('gameover');
    setMode('gameover');
    return;
  }
  st.attempt.letters = [...(st.main || st.world).letters];
  if (st.main) { st.world = st.main; st.main = null; }
  st.attempt.check = st.world.check;
  save.lives = st.run.lives; save.cards = st.run.cards; writeSave();
  startLevel(st.levelIdx, true);
}

function finishLevel() {
  const L = st.L, g = st.world;
  save.cleared[L.id] = 1;
  if (st.attempt.page || g.pageGot) save.pages[L.id] = 1;
  if (g.letters.every(Boolean)) save.brew[L.id] = 1;
  save.reached = Math.max(save.reached, Math.min(LEVELS.length - 1, st.levelIdx + 1));
  save.lives = st.run.lives; save.cards = st.run.cards;
  writeSave();
}

// --- per-mode update ----------------------------------------------------------------------------------------------
function update() {
  st.t += 1 / 60; st.frame++;
  if (st.fadeDir) {
    st.fade += st.fadeDir;
    if (st.fadeDir > 0 && st.fade >= 1) { st.fade = 1; st.fadeDir = -Math.abs(st.fadeDir); const f = st.fadeThen; st.fadeThen = null; f && f(); }
    else if (st.fadeDir < 0 && st.fade <= 0) { st.fade = 0; st.fadeDir = 0; }
  }
  switch (st.mode) {
    case 'title':
      music('title');
      if (st.t > 0.6 && (pressed('jump') || pressed('pause') || pressed('act'))) { A.sfx('menuSelect'); fadeTo(() => { st.wsel = currentWorld(); setMode('worlds'); music('worlds'); }); }
      break;
    case 'map': updateMap(); break;
    case 'worlds': updateWorlds(); break;
    case 'card':
      if (st.t > 1.7 || (st.t > 0.4 && pressed('jump'))) setMode('play');
      break;
    case 'play': updatePlay(); break;
    case 'pause': updatePause(); break;
    case 'results':
      st.resT += 1 / 60;
      if (st.resT > 1.8 && (pressed('jump') || pressed('pause'))) {
        A.sfx('menuSelect');
        if (st.L.isBoss && st.L.wi === WORLDS.length - 1) fadeTo(() => { setMode('ending'); music('title'); });
        else if (st.L.isBoss) fadeTo(() => { st.wsel = Math.min(WORLDS.length - 1, st.L.wi + 1); setMode('worlds'); music('worlds'); });
        else fadeTo(() => { st.map.node = st.L.li + 2; setMode('map'); music('map'); });
      }
      break;
    case 'gameover':
      if (st.t > 3 && (pressed('jump') || pressed('pause'))) fadeTo(() => { st.map.node = 0; setMode('map'); music('map'); });
      break;
    case 'ending':
      if (st.t > 8 && (pressed('jump') || pressed('pause'))) fadeTo(() => setMode('title'));
      break;
  }
}

function currentWorld() { return Math.min(WORLDS.length - 1, LEVELS[Math.min(save.reached, LEVELS.length - 1)].wi); }
function updateWorlds() {
  if (st.fadeDir) return;
  if (pressed('right')) { st.wsel = Math.min(WORLDS.length - 1, st.wsel + 1); A.sfx('menuMove'); }
  if (pressed('left')) { st.wsel = Math.max(0, st.wsel - 1); A.sfx('menuMove'); }
  if ((pressed('jump') || pressed('pause')) && firstOf(st.wsel) <= save.reached) {
    A.sfx('menuSelect');
    fadeTo(() => { st.map.node = 0; st.map.walk = null; setMode('map'); music(WORLDS[st.wsel].music); });
  }
  if (pressed('act')) fadeTo(() => setMode('title'));
}
function updateMap() {
  const m = st.map, wl = levelsOf(st.wsel), f0 = firstOf(st.wsel);
  const nodes = SCR.worldNodes(WORLDS[st.wsel], wl.length);
  if (m.walk) {
    m.walk.t += 0.04;
    if (m.walk.t >= 1) { m.node = m.walk.to; m.face = nodes[m.walk.to].x >= nodes[m.walk.from].x ? 1 : -1; m.walk = null; }
    return;
  }
  if (st.fadeDir) return;
  if (m.node > wl.length) m.node = wl.length;
  const open = (n) => n === 0 || f0 + n - 1 <= save.reached;
  const go = (d) => { const n = m.node + d; if (n >= 0 && n <= wl.length && open(n)) { m.walk = { from: m.node, to: n, t: 0 }; A.sfx('menuMove'); } };
  if (pressed('right') || pressed('up')) go(1);
  else if (pressed('left') || pressed('down')) go(-1);
  else if (pressed('act')) { A.sfx('menuMove'); fadeTo(() => { setMode('worlds'); music('worlds'); }); }
  else if ((pressed('jump') || pressed('pause')) && m.node > 0) {
    A.sfx('menuSelect');
    const i = f0 + m.node - 1;
    st.run = { lives: save.lives, cards: save.cards, letters: {} };
    fadeTo(() => startLevel(i));
  }
}

function updatePlay() {
  const g = st.world;
  if (pressed('pause') && !st.fadeDir && g.state === 'play' && g.p.state !== 'dead') { setMode('pause'); st.pauseSel = 0; A.sfx('pause'); A.setPaused(true); return; }
  if (st.frozen) return;
  step(g, inp);
  for (const e of g.ev) handleEvent(g, e);
  g.ev.length = 0;
  if (g.p.state === 'dead') {
    st.deadT++;
  } else st.deadT = 0;
  if (g.state === 'clear') {
    st.clearT++;
    if (st.clearT === 200) { finishLevel(); st.resT = 0; setMode('results'); }
  } else st.clearT = 0;
}
function handleEvent(g, e) {
  switch (e.k) {
    case 'sfx': A.sfx(e.n, e.o || {}); if (e.n === 'explosion') rumble(0.9, 0.7, 260); else if (e.n === 'blastFire') rumble(0.5, 0.3, 120); else if (e.n === 'bossHit') rumble(0.7, 0.5, 180); break;
    case 'lost': case 'dismount': rumble(0.8, 0.6, 240); break;
    case 'dying': music('death'); rumble(1, 1, 450); break;
    case 'dead': fadeTo(() => restartFromDeath(), 0.06); break;
    case 'clear': music('clear'); break;
    case 'bonus': fadeTo(() => enterBonus(e.room), 0.1); break;
    case 'bonusResult': music(e.win ? 'bonusWin' : 'bonusLose'); break;
    case 'bonusEnd': fadeTo(() => leaveBonus(e.win), 0.08); break;
    case 'checkpoint': st.attempt.check = g.check; break;
    case 'page': if (!g.bonus) st.attempt.page = true; break;
    case 'bossDown': A.duckMusic(0.2, 3); A.stopMusic(2); break;
    case 'bossHit': A.duckMusic(0.5, 0.4); break;
    default: break;
  }
}
const PAUSE_ITEMS = () => ['RESUME', 'EXIT TO MAP', A.isMuted() ? 'SOUND: OFF' : 'SOUND: ON'];
function updatePause() {
  const items = PAUSE_ITEMS();
  if (pressed('down')) { st.pauseSel = (st.pauseSel + 1) % items.length; A.sfx('menuMove'); }
  if (pressed('up')) { st.pauseSel = (st.pauseSel + items.length - 1) % items.length; A.sfx('menuMove'); }
  if (pressed('pause') || pressed('act')) { setMode('play'); A.setPaused(false); return; }
  if (pressed('jump')) {
    A.sfx('menuSelect');
    if (st.pauseSel === 0) { setMode('play'); A.setPaused(false); }
    else if (st.pauseSel === 1) {
      A.setPaused(false);
      save.lives = st.run.lives; save.cards = st.run.cards; writeSave();
      fadeTo(() => { st.map.node = st.L.li + 1; setMode('map'); music(WORLDS[st.wsel].music); });
    } else { A.setMuted(!A.isMuted()); syncMute(); }
  }
}

// --- draw -----------------------------------------------------------------------------------------------------------
function draw() {
  ctx.imageSmoothingEnabled = false;
  switch (st.mode) {
    case 'title': SCR.drawTitle(ctx, st.t, { hint: controlsHint() }); break;
    case 'map': SCR.drawMap(ctx, st.map, WORLDS[st.wsel], levelsOf(st.wsel), firstOf(st.wsel), save, st.t); break;
    case 'worlds': SCR.drawWorlds(ctx, st.wsel, WORLDS, LEVELS, save, st.t); break;
    case 'card': drawWorld(ctx, st.world, st.view, { noHud: true }); SCR.drawCard(ctx, st.L, Math.min(1, st.t / 1.7)); break;
    case 'play': drawWorld(ctx, st.world, st.view); break;
    case 'pause': drawWorld(ctx, st.world, st.view, { paused: true }); SCR.drawPause(ctx, st.pauseSel, PAUSE_ITEMS()); break;
    case 'results': drawWorld(ctx, st.world, st.view, { noHud: true }); SCR.drawResults(ctx, st.L, { cards: (st.run.got || 0) - st.attempt.got0, letters: st.world.letters, page: st.attempt.page || st.world.pageGot, hasPage: !!(st.L.rooms?.length || st.L.rows.join('').includes('p')) }, st.resT); break;
    case 'gameover': SCR.drawGameOver(ctx, st.t); break;
    case 'ending': SCR.drawEnding(ctx, st.t, save); break;
  }
  if (st.fade > 0) { ctx.fillStyle = `rgba(6,3,10,${Math.min(1, st.fade)})`; ctx.fillRect(0, 0, W, H); }
}

// --- loop -----------------------------------------------------------------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt;
  let n = 0;
  while (acc >= 1 / 60 && n < 5 && !st.frozen) {
    prevInp = inp; inp = readInput();
    update();
    acc -= 1 / 60; n++;
  }
  if (n === 5) acc = 0;
  draw();
  requestAnimationFrame(frame);
}

// --- page wiring ----------------------------------------------------------------------------------------------------
function fit() {
  const wrap = document.getElementById('wrap');
  const r = wrap.getBoundingClientRect();
  let k = Math.min(r.width / W, r.height / H);
  if (k >= 1) k = Math.floor(k);
  canvas.style.width = Math.round(W * k) + 'px';
  canvas.style.height = Math.round(H * k) + 'px';
}
addEventListener('resize', fit);
fit();
initInput(canvas);
onAnyPress(() => { A.initAudio(); });
const muteBtn = document.getElementById('mute');
function syncMute() { if (muteBtn) muteBtn.textContent = A.isMuted() ? '♪ Sound off' : '♪ Sound on'; }
muteBtn?.addEventListener('click', () => { A.initAudio(); A.setMuted(!A.isMuted()); syncMute(); muteBtn.blur(); });
document.getElementById('fs')?.addEventListener('click', (e) => {
  e.currentTarget.blur();
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('full', !!document.fullscreenElement); setTimeout(fit, 50); });
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
canvas.focus();

const artReady = loadArt().catch((e) => console.warn('art unavailable', e));
Promise.allSettled([audioReady, bgReady, artReady]).then(() => requestAnimationFrame(frame));

// --- test hooks -----------------------------------------------------------------------------------------------------
const q = new URLSearchParams(location.search);
window.__tt = {
  get st() { return st; }, get save() { return save; }, LEVELS,
  get g() { return st.world; },
  start(id, opts = {}) {
    const i = typeof id === 'number' ? id : LEVELS.findIndex((l) => l.id === id || l.id === ({ wood: 'x', bog: 'x', mine: 'hallo5', village: 'xmas3', boss: 'xmasB' })[id]);
    st.wsel = LEVELS[i].wi;
    st.run = { lives: save.lives, cards: save.cards, letters: {} };
    startLevel(i); if (opts.play !== false) setMode('play');
    if (opts.x != null) { const p = st.world.p; p.x = opts.x * T; p.y = (opts.y ?? 10) * T - p.h; snapCam(st.world); }
    return st.world;
  },
  step(n = 1, input = {}) {
    const fr = st.frozen; st.frozen = false;
    for (let i = 0; i < n; i++) { prevInp = inp; inp = { ...input }; update(); }
    st.frozen = fr; draw(); return st.world?.p;
  },
  freeze(b = true) { st.frozen = b; },
  draw,
  unlockAll() { save.reached = LEVELS.length - 1; writeSave(); },
  worlds: WORLDS,
  reset() { save = freshSave(); writeSave(); },
  mode: setMode,
};
if (q.get('level')) { Promise.allSettled([bgReady, artReady]).then(() => window.__tt.start(q.get('level'), { x: q.get('x') ? +q.get('x') : undefined, y: q.get('y') ? +q.get('y') : undefined })); }
