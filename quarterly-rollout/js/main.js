// The page: screens, the fixed-step game loop, saving, and wiring input and audio to the world.

import { VIEW_W, VIEW_H, STEP } from './config.js';
import { LEVELS } from './levels.js';
import { createWorld, stepWorld, formatTime, rating } from './world.js';
import { createRenderer } from './render.js';
import { AudioSystem } from './audio.js';
import { createInput } from './input.js';
import { loadSave, writeSave, recordCompletion, resetProgress, withSettings } from './save.js';
import * as Story from './story.js';

const $ = (id) => document.getElementById(id);
const ids = LEVELS.map((l) => l.id);

let storage = null;
try { storage = globalThis.localStorage; } catch (e) { storage = null; }
let save = loadSave(storage, ids);

const audio = new AudioSystem(save.settings);
const canvas = $('screen');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const renderer = createRenderer(canvas.getContext('2d'), (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
});

let mode = 'title';
let world = createWorld(0);
let acc = 0;
let last = performance.now();
const ui = { now: 0, toast: null, muted: false };

const SCREENS = ['title', 'floors', 'intro', 'pause', 'fail', 'complete', 'ending'];
function show(name) {
  for (const s of SCREENS) $('scr-' + s).hidden = s !== name;
  document.body.classList.toggle('in-menu', !!name);
  const panel = name && $('scr-' + name);
  const first = panel && panel.querySelector('button:not([disabled]):not([hidden])');
  if (first) first.focus({ preventScroll: true });
}

function persist() { writeSave(storage, save); }

function refreshToggles() {
  for (const b of document.querySelectorAll('[data-toggle="sound"]')) b.textContent = `Sound: ${save.settings.sound ? 'on' : 'off'}`;
  for (const b of document.querySelectorAll('[data-toggle="music"]')) b.textContent = `Music: ${save.settings.music ? 'on' : 'off'}`;
  ui.muted = !save.settings.sound && !save.settings.music;
}

function setAudio(patch) {
  save = withSettings(save, patch);
  audio.setSound(save.settings.sound);
  audio.setMusic(save.settings.music);
  persist();
  refreshToggles();
}

// ---------------------------------------------------------------- screens
function showTitle() {
  mode = 'title';
  world = createWorld(Math.min(save.lastLevel, LEVELS.length - 1));
  const cont = $('b-continue');
  const resumeAt = save.lastLevel;
  cont.hidden = save.unlocked <= 1 && !save.finished;
  cont.textContent = `Continue: Floor ${LEVELS[resumeAt].floor}`;
  audio.playSong('title');
  show('title');
}

function showFloors() {
  mode = 'floors';
  const list = $('floor-list');
  list.replaceChildren();
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'floor';
    const locked = i >= save.unlocked;
    b.disabled = locked;
    const name = document.createElement('span');
    name.textContent = `Floor ${lv.floor}: ${lv.name}`;
    const best = document.createElement('span');
    best.className = 'best';
    best.textContent = locked ? 'Locked' : save.best[lv.id] ? `Best ${formatTime(save.best[lv.id])}` : 'Not cleared';
    b.append(name, best);
    b.addEventListener('click', () => startLevel(i));
    list.append(b);
  });
  show('floors');
}

function startLevel(i) {
  world = createWorld(i);
  mode = 'intro';
  const lv = LEVELS[i];
  const brief = Story.BRIEFINGS[lv.id];
  $('intro-floor').textContent = `Floor ${lv.floor}`;
  $('intro-name').textContent = lv.name;
  $('intro-speaker').textContent = brief.speaker;
  $('intro-text').textContent = brief.text;
  $('intro-goal').textContent = `Collect all ${world.pages.length} report pages, then roll into the freight elevator. Par: ${formatTime(lv.par)}.`;
  show('intro');
}

function beginPlay() {
  mode = 'playing';
  acc = 0;
  input.clear();
  show(null);
  audio.playSong('level');
  canvas.focus({ preventScroll: true });
}

function pause() {
  if (mode !== 'playing') return;
  mode = 'paused';
  input.clear();
  $('pause-floor').textContent = `Floor ${world.def.floor}: ${world.def.name} · ${formatTime(world.time)}`;
  show('pause');
}

function resume() {
  if (mode !== 'paused') return;
  beginPlay();
}

function restart() {
  world = createWorld(world.levelIndex);
  ui.toast = null;
  beginPlay();
}

function levelComplete() {
  const i = world.levelIndex, lv = LEVELS[i];
  const prevBest = save.best[lv.id];
  save = recordCompletion(save, i, world.time, ids);
  persist();
  mode = 'complete';
  audio.stopSong();
  $('done-time').textContent = formatTime(world.time);
  $('done-best').textContent = prevBest && prevBest < world.time ? `Best ${formatTime(prevBest)}` : 'New best time!';
  $('done-rating').textContent = `${rating(world.time, lv.par)} (par ${formatTime(lv.par)})`;
  const last = i === LEVELS.length - 1;
  $('b-next').textContent = last ? 'Into the boardroom' : `Next: Floor ${LEVELS[i + 1].floor}`;
  show('complete');
}

function levelFailed(cause) {
  mode = 'failed';
  audio.stopSong();
  $('fail-text').textContent = Story.FAIL_LINES[cause] || Story.FAIL_LINES.default;
  show('fail');
}

function showEnding() {
  mode = 'ending';
  const box = $('ending-text');
  box.replaceChildren(...Story.ENDING.map((line) => { const p = document.createElement('p'); p.textContent = line; return p; }));
  const total = ids.reduce((s, id) => s + (save.best[id] || 0), 0);
  $('ending-total').textContent = `Best times add up to ${formatTime(total)}.`;
  audio.play('ending');
  audio.playSong('title');
  show('ending');
}

function nextFloor() {
  const i = world.levelIndex;
  if (i >= LEVELS.length - 1) showEnding();
  else startLevel(i + 1);
}

// ---------------------------------------------------------------- input
function command(cmd) {
  if (cmd === 'mute') {
    const on = !(save.settings.sound || save.settings.music);
    setAudio({ sound: on, music: on });
    return true;
  }
  if (cmd === 'pause') {
    if (mode === 'playing') pause();
    else if (mode === 'paused') resume();
    else if (mode === 'floors') showTitle();
    else return false;
    return true;
  }
  if (cmd === 'restart') {
    if (['playing', 'paused', 'failed', 'complete'].includes(mode)) { restart(); return true; }
    return false;
  }
  if (cmd === 'confirm') {
    if (mode === 'intro') beginPlay();
    else if (mode === 'complete') nextFloor();
    else if (mode === 'failed') restart();
    else return false;
    return true;
  }
  return false;
}

const input = createInput(globalThis, { onCommand: command, isPlaying: () => mode === 'playing' });

const unlockAudio = () => audio.unlock();
globalThis.addEventListener('pointerdown', unlockAudio);
globalThis.addEventListener('keydown', unlockAudio);

const click = (id, fn) => $(id).addEventListener('click', () => { audio.play('ui'); fn(); });
click('b-continue', () => startLevel(Math.min(save.lastLevel, save.unlocked - 1)));
click('b-new', () => startLevel(0));
click('b-floors', showFloors);
click('b-floors-back', showTitle);
click('b-reset', () => {
  if (!globalThis.confirm || globalThis.confirm('Forget all cleared floors and best times?')) {
    save = resetProgress(save);
    persist();
    showFloors();
  }
});
click('b-roll', beginPlay);
click('b-resume', resume);
click('b-restart', restart);
click('b-quit', showTitle);
click('b-retry', restart);
click('b-fail-quit', showTitle);
click('b-next', nextFloor);
click('b-again', restart);
click('b-done-quit', showTitle);
click('b-ending-title', showTitle);
for (const b of document.querySelectorAll('[data-toggle]')) {
  b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    setAudio({ [k]: !save.settings[k] });
    audio.play('ui');
  });
}

// touch controls
const touchQuery = globalThis.matchMedia ? globalThis.matchMedia('(pointer: coarse)') : null;
const enableTouch = () => document.body.classList.add('touch');
if (touchQuery && touchQuery.matches) enableTouch();
globalThis.addEventListener('touchstart', enableTouch, { once: true, passive: true });
input.attachStick($('stick'), $('knob'));
$('t-spin').addEventListener('pointerdown', (e) => { e.preventDefault(); input.queueSpin(); });
$('t-pause').addEventListener('click', () => command('pause'));

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------------------------------------------------------------- loop
function handleEvents() {
  for (const ev of world.events) {
    audio.play(ev.type, ev);
    if (ev.type === 'exitOpen') ui.toast = { text: 'Every page! The elevator is open.', until: ui.now + 2.2 };
  }
  world.events.length = 0;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  ui.now += dt;
  if (mode === 'playing') {
    acc += dt;
    while (acc >= STEP && mode === 'playing') {
      stepWorld(world, input.read(), STEP);
      acc -= STEP;
      const status = world.status;
      const cause = (world.events.find((e) => e.type === 'fail') || {}).cause;
      handleEvents();
      if (status === 'complete') levelComplete();
      else if (status === 'failed') levelFailed(cause);
    }
  }
  renderer.draw(world, ui);
  requestAnimationFrame(frame);
}

$('premise').textContent = Story.PREMISE;
refreshToggles();
showTitle();
requestAnimationFrame(frame);
