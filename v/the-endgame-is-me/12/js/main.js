// The page: input, the fixed-step loop, scaling the 320×180 buffer to the window, the between-maps store,
// overlays, saves and the best score.

import { createGame, step, nextMap, W, H, ABILITIES, SLOT_KEYS, abilityOffer, buyAbility, upgradeAbility, setSlot, createDemo, demoSet, demoStep, newGamePlus, createEnding, endingStep } from './world.js';
import { createRenderer, setCalm } from './render.js';
import { ICONS, PAL, drawText } from './art.js';
import { createAudio } from './audio.js';
import { createTitle } from './title.js';
import { createMenu } from './menu.js';
import { createAttract } from './attract.js';
import { createAppearance, currentLook, bossName } from './appearance.js';
import { writeSave, readSave, saveInfo, clearSave, unlockPlus, plusData } from './save.js';

const canvas = document.getElementById('game');
const out = canvas.getContext('2d');
const R = createRenderer();
const audio = createAudio();
const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------------------------- saved things

const BEST_KEY = 'bosshours.best.v1';
let best = 0;
try { best = Number(JSON.parse(localStorage.getItem(BEST_KEY) || '{}').score) || 0; } catch {}
function showBest() { $('best').textContent = best ? `Best shift: ${fmt(best)} points` : ''; }
showBest();

let g = createGame(undefined, currentLook());
let mode = 'title';   // title | play | store | paused | ending | won | over
let ending = null;    // the walk home after the castle falls
const DT = 1 / 60;
let acc = 0, last = performance.now();
let frozen = false;   // tests only: stop the clock so a screenshot shows exactly the stepped state
const thud = name => audio.play(name);
let title = createTitle({ instant: matchMedia('(prefers-reduced-motion: reduce)').matches, onThud: thud });
const attract = createAttract(currentLook);
// Launch order: the sound gate if the browser needs it, the studio splash, then the logo and the music together.
let booted = false;

// a throwaway context tells us whether this browser will play sound without being clicked first
async function soundBlocked() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || (navigator.webdriver && !/[?&]gate=1/.test(location.search))) return false;
  const probe = new AC();
  const allowed = await Promise.race([probe.resume().then(() => true, () => false), new Promise(r => setTimeout(r, 300, false))]);
  const running = allowed && probe.state === 'running';
  probe.close().catch(() => {});
  return !running;
}
// browsers keep every page silent until it's been clicked, so when that's in force, one press comes first
function soundGate() {
  return new Promise(done => {
    const gate = $('soundGate'), EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
    gate.hidden = false;
    $('soundGo').focus({ preventScroll: true });
    const hear = e => {
      e.stopImmediatePropagation();
      if (e.type === 'keydown' && (e.repeat || e.ctrlKey || e.altKey || e.metaKey || /^(Escape|Tab|Shift|Control|Alt|Meta|F\d+)$/.test(e.key))) return;
      if (e.cancelable) e.preventDefault();
      if (e.type === 'pointerdown') return;   // on touch the press only counts when the finger lifts
      for (const ev of EVENTS) removeEventListener(ev, hear, true);
      audio.arm();
      gate.hidden = true;
      done();
    };
    for (const ev of EVENTS) addEventListener(ev, hear, true);
  });
}
function loadSplash() {
  return new Promise(done => {
    const s = document.createElement('script');
    s.src = '/splash.js';
    s.setAttribute('data-always', '');   // every launch, not just the first in a tab
    s.onload = s.onerror = done;
    document.head.appendChild(s);
  });
}
(async () => {
  if (await soundBlocked()) await soundGate();
  await loadSplash();
  await window.SlopwareSplash?.ready;
  booted = true;
  last = performance.now();
  audio.unlock();
})();

let calm = false;
try { calm = localStorage.getItem('bosshours.calm') === '1'; } catch {}
setCalm(calm); title.calm = calm;

const appearance = createAppearance({
  audio,
  onLook(look) { g.look = look; attract.g.look = look; if (demo) demo.look = look; },
  onName(name) { g.boss.name = name; },
});
const menu = createMenu({
  audio, appearance, title: () => title,
  actions: {
    newGame: () => newRun(),
    plus: () => newRun(plusData()),
    cont: () => { const s = readSave(); if (s) resumeFrom(s); else menu.refreshTitle(); },
    resume: () => resume(),
    saveQuit: () => { saveNow(); goTitle(); },
    quit: () => goTitle(),
  },
  saves: { info: saveInfo, plus: plusData },
  clearBest() { best = 0; try { localStorage.removeItem(BEST_KEY); } catch {} showBest(); },
  hasBest: () => best > 0,
  calm: {
    get: () => calm,
    set(on) { calm = on; setCalm(on); title.calm = on; try { localStorage.setItem('bosshours.calm', on ? '1' : '0'); } catch {} },
  },
});
audio.setStage(1);

// ---------------------------------------------------------------------------------------------- input

const keys = new Set();
const mouse = { x: W / 2 + 40, y: H / 2, l: false };
const press = {};
const KEYMAP = { KeyJ: 'slot0', KeyK: 'slot1', KeyF: 'slot1', KeyQ: 'slot2', KeyE: 'slot3', KeyR: 'slot4', Space: 'shake' };

addEventListener('keydown', e => {
  if (menu.key(e, mode)) return;
  if (mode === 'over' && e.code === 'KeyR') { e.preventDefault(); respawn(); return; }
  if (e.target.closest?.('a, button, select')) return;
  if (mode === 'over' && e.code === 'Enter') { e.preventDefault(); respawn(); return; }
  if (mode === 'won' && e.code === 'Enter') { e.preventDefault(); newRun(plusData()); return; }
  if (mode === 'ending' && ['Enter', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); endingDone(); return; }
  if (e.code === 'KeyM') { audio.toggleMute(); return; }
  if (mode === 'store') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') pause(); else if (mode === 'paused') resume(); return; }
  if (mode === 'paused' && e.code === 'Space') { e.preventDefault(); resume(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat && KEYMAP[e.code]) press[KEYMAP[e.code]] = true;
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.l = false; if (mode === 'play') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });

function toBuffer(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width * W;
  mouse.y = (e.clientY - r.top) / r.height * H;
}
addEventListener('pointermove', toBuffer);
canvas.addEventListener('pointerdown', e => {
  toBuffer(e);
  canvas.focus();
  if (mode === 'ending' && ending.end.t > 1) { endingDone(); return; }
  if (mode !== 'play') return;
  if (e.button === 0) { press.slot0 = true; mouse.l = true; }
  if (e.button === 2) press.slot1 = true;
});
addEventListener('pointerup', e => { if (e.button === 0) mouse.l = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function readInput() {
  const k = c => keys.has(c);
  return {
    mx: mouse.x + g.cam.x, my: mouse.y + g.cam.y,   // aim in world pixels; the screen scrolls on later levels
    ax: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0),
    ay: (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0),
    press: { ...press },
    hold: { slot0: mouse.l || k('KeyJ') },
  };
}

// ---------------------------------------------------------------------------------------------- flow

function start(next) {
  audio.unlock();
  ending = null;
  g = next;
  R.reset();
  acc = 0;
  mode = 'play';
  for (const id of ['title', 'over', 'paused', 'store', 'won', 'panel']) $(id).hidden = true;
  audio.setStage(g.map.n);
  canvas.focus();
}
// a new run, or New Game+ when handed the build carried over from a win; either way it is saved from the first step
function newRun(plus) {
  const run = plus ? newGamePlus(plus, currentLook()) : createGame(undefined, currentLook());
  run.boss.name = bossName();
  start(run);
  writeSave(g);
}
function saveNow() {
  if (g.boss.dead || g.over) return false;
  return writeSave(g, mode === 'store' ? 'store' : 'play');
}
// back into a saved run: at the Hoard if that's where it left off, otherwise on break so nobody gets jumped
function resumeFrom({ g: run, phase }) {
  run.look = currentLook();
  run.boss.name = bossName();
  start(run);
  if (phase === 'store') openStore(); else pause();
}
function respawn() {
  const s = readSave();
  if (s) resumeFrom(s); else newRun();
}
// back to the menu from a pause, a defeat or a win; the logo doesn't replay
function goTitle() {
  audio.setCombat(false);
  ending = null;
  audio.setStage(1);
  acc = 0;
  mode = 'title';
  for (const id of ['over', 'paused', 'store', 'won', 'panel']) $(id).hidden = true;
  showBest();
  title = createTitle({ instant: true, onThud: thud });
  title.calm = calm;
  menu.reset();
  $('title').hidden = false;
  menu.reveal();
}
function pause() { mode = 'paused'; $('paused').hidden = false; $('resume').focus({ preventScroll: true }); }
function resume() { mode = 'play'; $('paused').hidden = true; last = performance.now(); canvas.focus(); }

const LINES = {
  raid: ['by a raid.', 'They are arguing about who gets your fur.'],
  dungeon: ['by five people who met an hour ago.', 'One of them was AFK for most of it.'],
  rider: ['by a quiet man on a horse.', 'The horse did not help.'],
};
function gameOver() {
  mode = 'over';
  const killer = Object.entries(g.blame).sort((a, b) => b[1] - a[1])[0][0];
  const [a, b] = LINES[killer];
  $('overBy').textContent = a;
  $('overSub').textContent = b;
  const newBest = g.score > best;
  if (newBest) { best = Math.floor(g.score); try { localStorage.setItem(BEST_KEY, JSON.stringify({ score: best, at: Date.now() })); } catch {} }
  const m = Math.floor(g.t / 60), s = String(Math.floor(g.t % 60)).padStart(2, '0');
  $('stats').innerHTML = [
    ['Score', fmt(g.score) + (newBest ? ' <em>new best</em>' : '')],
    ['Shift length', `${m}:${s}`],
    ['Levels cleared', g.maps],
    ['Laps between rocks', g.laps],
    ['Adventurers eaten', g.kills],
    ['Raids wiped', g.wipes.raid + g.wipes.final],
    ['5-mans wiped', g.wipes.dungeon],
    ['Horse guys', g.wipes.rider],
    ['Points spent', fmt(g.spent)],
    ['Adds summoned', g.summoned],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  showBest();
  $('over').hidden = false;
  $('again').focus();
}

// the castle is down: the run is over, so the save goes and New Game+ opens. First the walk home, then the card
function gameWon() {
  clearSave();
  unlockPlus(g);
  audio.setCombat(false);
  audio.setStage(1);   // back in the Clearing, so back to its tune
  mode = 'ending';
  ending = createEnding(g.look);
  R.reset();
  acc = 0;
}
function endingDone() {
  if (mode !== 'ending') return;
  // the boss stays home with its rocks behind the card
  const en = ending.end;
  if (en.phase !== 'home') { const { A, B } = ending.map; Object.assign(ending.boss, { x: (A.x + B.x) / 2, y: A.y + 14, face: Math.PI / 2 }); en.phase = 'home'; en.at = en.t; }
  showWon();
}
function showWon() {
  mode = 'won';
  const newBest = g.score > best;
  if (newBest) { best = Math.floor(g.score); try { localStorage.setItem(BEST_KEY, JSON.stringify({ score: best, at: Date.now() })); } catch {} }
  const m = Math.floor(g.t / 60), s = String(Math.floor(g.t % 60)).padStart(2, '0');
  $('wonStats').innerHTML = [
    ['Score', fmt(g.score) + (newBest ? ' <em>new best</em>' : '')],
    ['Time', `${m}:${s}`],
    ...(g.ng ? [['Round', `New Game +${g.ng > 1 ? g.ng : ''}`]] : []),
    ['Adventurers eaten', g.kills],
    ['Raids wiped', g.wipes.raid + g.wipes.final],
    ['Points spent', fmt(g.spent)],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  showBest();
  $('wonPlus').textContent = g.ng ? `New Game +${g.ng + 1}` : 'New Game +';
  $('won').hidden = false;
  $('wonPlus').focus();
}

$('wonAgain').addEventListener('click', () => newRun());
$('wonPlus').addEventListener('click', () => newRun(plusData()));
$('again').addEventListener('click', respawn);
$('resume').addEventListener('click', resume);

// ---------------------------------------------------------------------------------------------- the store, between maps

let tab = 'abil', sel = 'summon', demo = null, demoRaf = 0;
const PR = createRenderer();   // the demo reel's own renderer

function openStore() {
  mode = 'store';
  keys.clear(); mouse.l = false;
  $('storeMap').textContent = g.map.n;
  tab = 'abil';
  if (!ABILITIES.some(a => a.id === sel)) sel = 'summon';
  demo ||= createDemo(g.look);
  showDemo();
  drawStore();
  $('store').hidden = false;
  writeSave(g, 'store');
  cancelAnimationFrame(demoRaf);
  let then = performance.now(), acc = 0;
  const tick = now => {
    if (mode !== 'store') return;
    acc = Math.min(0.25, acc + (now - then) / 1000); then = now;
    if (tab === 'abil') {
      while (acc >= DT) { demoStep(demo, DT); acc -= DT; }
      paintDemo();
    } else acc = 0;
    demoRaf = requestAnimationFrame(tick);
  };
  demoRaf = requestAnimationFrame(tick);
}
function closeStore() {
  cancelAnimationFrame(demoRaf);
  $('store').hidden = true;
  nextMap(g);
  R.reset();
  mode = 'play';
  audio.setStage(g.map.n);
  writeSave(g);
  last = performance.now();
  canvas.focus();
}

function icon(id) {
  const rows = ICONS[id] || ICONS.empty;
  return `<svg class="ico" viewBox="0 0 8 8" aria-hidden="true">${rows.map((r, y) => [...r].map((c, x) => c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '').join('')).join('')}</svg>`;
}

function drawStore() {
  $('storePts').textContent = fmt(g.points);
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', b.dataset.tab === tab);
  $('tabAbil').hidden = tab !== 'abil'; $('tabSlots').hidden = tab !== 'slots';
  if (tab === 'abil') drawAbilities();
  if (tab === 'slots') drawSlots();
}

// what the Mutate button would buy for one ability: its price, and the level the demo should show
function mutateOffer(id) {
  const o = abilityOffer(g, id);
  if (o.buyCost != null) return { o, cost: o.buyCost, what: 'Learn it', show: 0 };
  if (o.upCost != null) return { o, cost: o.upCost, what: o.upText, show: o.it.passive ? o.lvl : o.lvl + 1 };
  return { o, cost: null, what: 'Fully mutated', show: o.lvl };
}

function drawAbilities() {
  $('abilList').innerHTML = ABILITIES.map(a => {
    const { o, cost } = mutateOffer(a.id);
    const pips = `<span class="pips">${Array.from({ length: o.max }, (_, i) => `<i class="${i < o.lvl ? 'on' : ''}"></i>`).join('')}</span>`;
    const owned = o.owned || (a.passive && o.lvl > 0);
    const line = cost == null ? '<span class="cost dim">maxed</span>' : `<span class="cost ${g.points < cost ? 'dim' : ''}">${owned ? 'upgrade' : 'learn'} ${fmt(cost)}</span>`;
    return `<button type="button" class="item ${owned ? 'owned' : ''} ${a.id === sel ? 'sel' : ''}" data-sel="${a.id}" aria-pressed="${a.id === sel}">${icon(a.id)}<b class="nm">${a.name}</b>${pips}${line}</button>`;
  }).join('');
  const { o, cost, what } = mutateOffer(sel), a = o.it;
  const tag = a.passive ? (o.lvl ? `level ${o.lvl}` : 'not grown') : o.owned ? (g.slots.includes(a.id) ? `on ${SLOT_KEYS[g.slots.indexOf(a.id)]}` : 'owned, not slotted') : 'not owned';
  const desc = a.id === 'summon' && o.owned && o.lvl > 0 ? a.ups[o.lvl - 1] : a.desc;
  $('abilInfo').innerHTML = `<b class="nm">${icon(a.id)} ${a.name}</b><span class="up">${tag}</span><span class="desc">${desc}</span>` +
    (cost == null ? `<span class="up">Fully mutated. Nothing left to grow.</span>`
      : `<button type="button" class="mutate" id="abilMutate" ${g.points < cost ? 'aria-disabled="true"' : ''}><span>Mutate <small>${what}</small></span><b>${fmt(cost)}</b></button>`);
}

// the demo reel: the selected ability (at the level Mutate would give you), cast on a loop at a 5-man
function showDemo() {
  const { show } = mutateOffer(sel);
  demoSet(demo, sel, show, g.look);
  for (let i = 0; i < 20; i++) demoStep(demo, DT);
  paintDemo();
}
function paintDemo() {
  const buf = PR.render(demo, { bare: true });
  const cv = $('demo'), c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(buf, 10, 28, 240, 135, 0, 0, cv.width, cv.height);
}

function drawSlots() {
  const owned = ABILITIES.filter(a => !a.passive && g.owned.has(a.id));
  $('tabSlots').innerHTML = `<p class="hint">Five slots. Pick what goes where; picking something already in another slot swaps them. Shake your fur stays on <kbd>Space</kbd>.</p>` +
    g.slots.map((id, i) => `<label class="slot"><kbd>${SLOT_KEYS[i]}</kbd>${icon(id || 'empty')}
      <select data-slot="${i}"><option value="">(empty)</option>${owned.map(a => `<option value="${a.id}" ${a.id === id ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>`).join('');
}

$('store').addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t || t.getAttribute('aria-disabled') === 'true') return;
  if (t.dataset.tab) { tab = t.dataset.tab; drawStore(); return; }
  if (t.id === 'storeGo') { closeStore(); return; }
  if (t.dataset.sel) { sel = t.dataset.sel; showDemo(); drawAbilities(); return; }
  let ok = false;
  if (t.id === 'abilMutate') {
    const o = abilityOffer(g, sel);
    ok = o.buyCost != null ? buyAbility(g, sel) : upgradeAbility(g, sel);
    if (ok) showDemo();
  }
  if (ok) { audio.play('buy'); drawStore(); }
});
$('store').addEventListener('change', e => {
  const s = e.target.closest('select[data-slot]');
  if (s) { setSlot(g, +s.dataset.slot, s.value || null); drawStore(); }
});

// ---------------------------------------------------------------------------------------------- loop

function fit() {
  const dpr = window.devicePixelRatio || 1;
  const availW = innerWidth, availH = innerHeight - 52;
  const fitScale = Math.min(availW / W, availH / H);
  // whole-number scales in device pixels keep the pixels square; fall back to a plain fit on tiny screens
  let s = Math.floor(fitScale * dpr);
  if (s < 1) s = 1;
  canvas.width = W * s; canvas.height = H * s;
  const cssW = s / dpr >= 1 ? W * s / dpr : W * fitScale;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssW * H / W + 'px';
  const root = document.documentElement.style;
  root.setProperty('--cw', cssW + 'px'); root.setProperty('--ch', cssW * H / W + 'px'); root.setProperty('--u', cssW / W);
  out.imageSmoothingEnabled = false;
}
addEventListener('resize', fit);
fit();

function drain() {
  for (const e of g.events) {
    if (e === 'over') gameOver();
    else if (e === 'store') openStore();
    else if (e === 'won') gameWon();
    else audio.play(e);
  }
  g.events.length = 0;
}

// the ending: the clearing, the boss, its rocks, hearts, and a line of narration letterboxed at the bottom
const HEART = ['.#.#.', '#####', '#####', '.###.', '..#..'];
function paintEnding(card = false) {
  const buf = R.render(ending, { bare: true }), c = buf.getContext('2d'), en = ending.end;
  for (const h of en.hearts) {
    if (h.t < 0) continue;
    c.globalAlpha = h.t > 1.6 ? Math.max(0, (2.4 - h.t) / 0.8) : 1;
    const x = Math.round(h.x - ending.cam.x) - 2, y = Math.round(h.y - ending.cam.y) - 2;
    c.fillStyle = PAL.ink; HEART.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') c.fillRect(x + i - 1, y + j, 3, 1); });
    HEART.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') { c.fillStyle = i === 1 && j === 1 ? '#ffd0dc' : '#e2486a'; c.fillRect(x + i, y + j, 1, 1); } });
  }
  c.globalAlpha = 1;
  const warm = Math.min(0.32, en.t * 0.012);
  if (card) { c.globalAlpha = warm; c.fillStyle = '#ff9a4a'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; out.drawImage(buf, 0, 0, canvas.width, canvas.height); return; }
  // letterbox bars, the caption typed out, and a warm wash that deepens toward the end
  const k = Math.min(1, en.t / 1.2);
  c.fillStyle = '#0a0806'; c.fillRect(0, 0, W, Math.round(16 * k)); c.fillRect(0, H - Math.round(22 * k), W, 22);
  c.globalAlpha = warm; c.fillStyle = '#ff9a4a'; c.fillRect(0, 16, W, H - 38); c.globalAlpha = 1;
  if (en.caption) drawText(c, en.caption.slice(0, Math.floor(en.capT * 28)), W / 2, H - 15, PAL.cream, { align: 'center' });
  if (en.t > 2) drawText(c, 'CLICK TO SKIP', W - 4, 5, '#6b665c', { align: 'right', shadow: false });
  if (en.done || en.phase === 'home' && en.t - (en.at || 0) > 7.5) { c.globalAlpha = Math.min(1, (en.t - en.at - 7.5) / 1); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  out.imageSmoothingEnabled = false;
  out.drawImage(buf, 0, 0, canvas.width, canvas.height);
}

function paint() {
  if (mode === 'title' && !booted && !frozen) {   // nothing shows until the gate and the splash are done
    out.fillStyle = '#000';
    out.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (mode === 'title') {
    const buf = R.render(attract.g, { bare: true }), c = buf.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    // the fights stay in the background at 35% brightness, with a quick fade in at each cut
    c.globalAlpha = 0.65 + 0.35 * Math.max(0, 1 - attract.t / 0.14);
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
    if (booted || frozen) title.draw(c);
    out.imageSmoothingEnabled = false;
    out.drawImage(buf, 0, 0, canvas.width, canvas.height);
    return;
  }
  const buf = R.render(g, { mx: mouse.x, my: mouse.y, cursor: mode === 'play', muted: audio.muted });
  out.imageSmoothingEnabled = false;
  out.drawImage(buf, 0, 0, canvas.width, canvas.height);
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'play' && !frozen) {
    acc += dt;
    while (acc >= DT && mode === 'play') {
      step(g, readInput(), DT);
      for (const k in press) delete press[k];
      acc -= DT;
      drain();
    }
    audio.setCombat(g.parties.some(p => p.engaged));
  }
  if (mode === 'title' && !frozen) {
    attract.update(dt);
    if (booted) {
      title.update(dt);
      if (title.done) menu.reveal();
    }
  }
  if (mode === 'won' && ending) {
    endingStep(ending, Math.min(dt, 0.05));
    ending.events.length = 0;
    paintEnding(true); requestAnimationFrame(frame); return;
  }
  if (mode === 'ending') {
    acc += dt;
    while (acc >= DT && mode === 'ending') {
      const more = endingStep(ending, DT);
      for (const e of ending.events) audio.play(e);
      ending.events.length = 0;
      acc -= DT;
      if (!more) endingDone();
    }
    if (mode === 'ending') { paintEnding(); requestAnimationFrame(frame); return; }
  }
  paint();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// leaving the page keeps your place
addEventListener('pagehide', () => { if (mode === 'play' || mode === 'paused' || mode === 'store') saveNow(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (mode === 'play' || mode === 'paused' || mode === 'store')) saveNow(); });

// headless test hooks
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  window.__bh = {
    get g() { return g; },
    get mode() { return mode; },
    get title() { return title; },
    goTitle,
    start,
    win: () => gameWon(),
    get booted() { return booted; },
    get ending() { return ending; },
    newRun,
    respawn,
    attract,
    saveNow,
    readSave,
    saveInfo,
    audio,
    openStore, closeStore,
    tab(t) { tab = t; drawStore(); },
    freeze(on = true) { frozen = on; },
    // covers the page with a magnified crop of the buffer (w buffer px wide), for close-up screenshots
    zoom(cx, cy, w = 100) {
      let z = document.getElementById('bhzoom');
      if (!cx && z) { z.remove(); return; }
      if (!z) { z = document.createElement('canvas'); z.id = 'bhzoom'; z.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99;image-rendering:pixelated'; document.body.appendChild(z); }
      z.width = 1200; z.height = 900;
      const c = z.getContext('2d'), s = canvas.width / W, h = w * 0.75;
      c.imageSmoothingEnabled = false;
      c.drawImage(canvas, (cx - w / 2) * s, (cy - h / 2) * s, w * s, h * s, 0, 0, 1200, 900);
    },
    aim(x, y) { mouse.x = x; mouse.y = y; },
    // steps n frames with the given input (and renders once at the end)
    step(n = 60, inp = {}) {
      for (let i = 0; i < n; i++) { step(g, { mx: g.boss.x + 30, my: g.boss.y, ax: 0, ay: 0, press: {}, hold: {}, ...inp }, DT); inp = { ...inp, press: {} }; }
      drain();
      paint();
      return { t: g.t, score: Math.round(g.score), hp: Math.round(g.boss.hp), units: g.units.length, mult: g.mult };
    },
    world: () => import('./world.js'),
    level: async n => { (await import('./world.js')).jumpToLevel(g, n); R.reset(); audio.setStage(g.map.n); paint(); return g.map.name; },
  };
}
