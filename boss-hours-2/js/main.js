// The page: input, the fixed-step loop, scaling the 320×180 buffer to the window, the level-up cards (and the slot
// picker when all five slots are full), overlays, and saving the best score.

import { createGame, step, W, H, SLOT_KEYS, RARITY, pickCard, needsSlot, cardLook, abilName, evoLook, openOffer } from './world.js';
import { createRenderer, bossPreview } from './render.js';
import { BOSS_SIZE, ICONS, lookKey } from './art.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('game');
const out = canvas.getContext('2d');
const R = createRenderer();
const audio = createAudio();
const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------------------------- saved things

const BEST_KEY = 'bosshours2.best.v1';
let best = 0;
try { best = Number(JSON.parse(localStorage.getItem(BEST_KEY) || '{}').score) || 0; } catch {}
function showBest() { $('best').textContent = best ? `Best shift: ${fmt(best)} points` : ''; }
showBest();

let g = createGame();
g.noLevel = true;     // the title screen's attract mode does not level up
let mode = 'title';   // title | play | cards | paused | over
const DT = 1 / 60;
let acc = 0, last = performance.now();
let frozen = false;   // tests only: stop the clock so a screenshot shows exactly the stepped state

// ---------------------------------------------------------------------------------------------- input

const keys = new Set();
const mouse = { x: W / 2 + 40, y: H / 2, l: false };
const press = {};
const KEYMAP = { KeyJ: 'slot0', KeyK: 'slot1', KeyF: 'slot1', KeyQ: 'slot2', KeyE: 'slot3', KeyR: 'slot4', Space: 'shake' };

addEventListener('keydown', e => {
  if (mode === 'cards') { cardKey(e); return; }
  if (e.target.closest?.('a, button, select, summary')) return;
  if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); start(); return; }
  if (mode === 'over' && (e.code === 'KeyR' || e.code === 'Enter')) { e.preventDefault(); start(); return; }
  if (e.code === 'KeyM') { audio.toggleMute(); return; }
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
  if (mode !== 'play') return;
  if (e.button === 0) { press.slot0 = true; mouse.l = true; }
  if (e.button === 2) press.slot1 = true;
});
addEventListener('pointerup', e => { if (e.button === 0) mouse.l = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function readInput() {
  const k = c => keys.has(c);
  return {
    mx: mouse.x, my: mouse.y,
    ax: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0),
    ay: (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0),
    press: { ...press },
    hold: { slot0: mouse.l || k('KeyJ') },
  };
}

// ---------------------------------------------------------------------------------------------- flow

function start() {
  audio.unlock();
  g = createGame();
  R.reset();
  acc = 0;
  mode = 'play';
  for (const id of ['title', 'over', 'paused', 'cards']) $(id).hidden = true;
  canvas.focus();
}
function pause() { mode = 'paused'; $('paused').hidden = false; }
function resume() { mode = 'play'; $('paused').hidden = true; last = performance.now(); canvas.focus(); }

const LINES = {
  raid: ['by a raid.', 'They are arguing about who gets your fur. Again.'],
  dungeon: ['by five people who met an hour ago.', 'None of them played the first one.'],
  rider: ['by a quiet man on a horse.', 'The horse did not help. The horse never helps.'],
};
const REVIEWS = [
  ['7/10', 'More of the same, but more.', 'Sequel Quarterly'],
  ['6/10', 'Has a 2 on it. Delivers on the 2.', 'Rock & Other Rock Weekly'],
  ['9/10', 'I have not played the first one. Neither, it turns out, has anyone.', 'Pacing Digest'],
  ['4/10', 'Sloppier, as promised. Right there on the box.', 'A Guy On A Forum'],
  ['8/10', 'Sequelier!', 'The Monthly Patrol'],
  ['5/10', 'The rocks are the same rocks.', 'Two Rocks Review'],
];
function gameOver() {
  mode = 'over';
  $('cards').hidden = true;
  const killer = Object.entries(g.blame).sort((a, b) => b[1] - a[1])[0][0];
  const [a, b] = LINES[killer];
  $('overBy').textContent = a;
  $('overSub').textContent = b;
  const newBest = g.score > best;
  if (newBest) { best = Math.floor(g.score); try { localStorage.setItem(BEST_KEY, JSON.stringify({ score: best, at: Date.now() })); } catch {} }
  const m = Math.floor(g.t / 60), s = String(Math.floor(g.t % 60)).padStart(2, '0');
  const rare = g.lv.rare;
  $('stats').innerHTML = [
    ['Score', fmt(g.score) + (newBest ? ' <em>new best</em>' : '')],
    ['Shift length', `${m}:${s}`],
    ['Level reached', g.lv.level],
    ['Cards taken', `${g.lv.picks.length}` + (rare[3] ? ` <em>${rare[3]} legendary</em>` : '')],
    ['Maps cleared', g.maps],
    ['Laps between rocks', g.laps],
    ['Adventurers eaten', g.kills],
    ['Raids wiped', g.wipes.raid + g.wipes.final],
    ['5-mans wiped', g.wipes.dungeon],
    ['Horse guys', g.wipes.rider],
    ['Adds summoned', g.summoned],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const rv = REVIEWS[Math.floor(Math.random() * REVIEWS.length)];
  $('review').innerHTML = `<b>${rv[0]}</b> “${rv[1]}” <span>— ${rv[2]}</span>`;
  showBest();
  $('over').hidden = false;
  $('again').focus();
}

$('go').addEventListener('click', start);
$('again').addEventListener('click', start);
$('resume').addEventListener('click', resume);

// ---------------------------------------------------------------------------------------------- level-up cards

const QUIPS = [
  'Pick one. The other two go in the sequel to the sequel.',
  'Three cards, freshly generated. Do not look at them too closely.',
  'Content drop! Some assembly required.',
  'Hand-crafted by a machine, moments ago.',
  'Every card is free. That is the whole business model, and it is a bad one.',
  'Choose wisely. Or quickly. The raid is literally frozen mid-swing.',
];
const WHY = { 'LEVEL UP': 'Level up!', 'RAID WIPED': 'Raid wiped: bonus card!', '40-MAN WIPED': '40-man wiped: a great card!', 'MAP CLEARED': 'Map cleared: bonus card!' };
let picking = null;      // the index of an ability card waiting for a slot
let hover = -1, spin = null, spinDir = 0;

function icon(id) {
  const rows = ICONS[id] || ICONS.empty;
  return `<svg class="ico" viewBox="0 0 8 8" aria-hidden="true">${rows.map((r, y) => [...r].map((c, x) => c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '').join('')).join('')}</svg>`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function openCards() {
  if (!g.offer) return;
  mode = 'cards';
  keys.clear(); mouse.l = false;
  for (const k in press) delete press[k];
  picking = null; hover = -1;
  drawCards(true);
  $('cards').hidden = false;
  audio.play('levelup');
  g.offer.cards.forEach((c, i) => setTimeout(() => audio.play(c.r === 3 ? 'legendary' : 'deal'), 160 + i * 120));
  clearInterval(spin);
  spin = setInterval(() => { spinDir = (spinDir + 1) % 32; drawPreview(); }, 150);
  setTimeout(() => $('cards').querySelector('.lvcard')?.focus(), 50);
}

function drawCards(deal) {
  const o = g.offer;
  $('cardsTitle').textContent = `${WHY[o.why] || 'Level up!'}`;
  $('cardsLevel').textContent = `Level ${g.lv.level}`;
  $('cardsQuip').textContent = QUIPS[(o.level + o.cards.length) % QUIPS.length];
  const cur = lookKey(g.look);
  $('cardRow').innerHTML = o.cards.map((c, i) => {
    const rr = RARITY[c.r], evo = lookKey(cardLook(g, c)) !== cur;
    let slotNote = '';
    if (c.kind === 'unlock') {
      const free = g.slots.indexOf(null);
      slotNote = free >= 0 ? `<span class="slotnote">Goes on <kbd>${SLOT_KEYS[free]}</kbd></span>` : `<span class="slotnote warn">Slots full: replaces one</span>`;
    }
    return `<button type="button" class="lvcard r${c.r} ${deal ? 'deal' : ''}" style="--i:${i}" data-card="${i}" aria-label="${esc(rr.name + ' card: ' + c.title + '. ' + c.text)}">
      <span class="rar">${rr.name}</span>
      <span class="art">${icon(c.icon)}</span>
      <span class="tag">${esc(c.tag)}</span>
      <b class="ttl">${esc(c.title)}</b>
      <span class="txt">${esc(c.text)}</span>
      <i class="flv">${esc(c.flavor)}</i>
      ${evo ? '<span class="evo">New model!</span>' : ''}${slotNote}
      <kbd class="num">${i + 1}</kbd>
    </button>`;
  }).join('');
  $('cardHint').innerHTML = picking == null ? 'The fight is paused. Hover a card to preview the new model. Keys <kbd>1</kbd>–<kbd>3</kbd> pick.'
    : 'Keys <kbd>1</kbd>–<kbd>5</kbd> replace a slot. <kbd>Esc</kbd> goes back to the cards.';
  $('slotPick').hidden = picking == null;
  $('cardRow').hidden = picking != null;
  if (picking != null) drawSlotPick();
  drawPreview();
}

function drawSlotPick() {
  const c = g.offer.cards[picking];
  $('slotPickTitle').innerHTML = `Where does <b>${esc(c.title)}</b> go?`;
  $('slotButtons').innerHTML = g.slots.map((id, i) => `<button type="button" class="slotbtn" data-slot="${i}">
      <kbd>${SLOT_KEYS[i]}</kbd>${icon(id)}<span>${esc(abilName(id))}</span><small>replace</small><kbd class="num">${i + 1}</kbd></button>`).join('');
  setTimeout(() => $('slotButtons').querySelector('button')?.focus(), 30);
}

function drawPreview() {
  const cv = $('cardPreview');
  if (!cv || !g.offer) return;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, cv.width, cv.height);
  const card = hover >= 0 ? g.offer.cards[hover] : picking != null ? g.offer.cards[picking] : null;
  const look = card ? cardLook(g, card) : g.look;
  const changed = card && lookKey(look) !== lookKey(g.look);
  const s = Math.floor(cv.width / BOSS_SIZE);
  c.drawImage(bossPreview(look, spinDir, Math.floor(performance.now() / 300) % 4), 0, 0, BOSS_SIZE * s, BOSS_SIZE * s);
  $('previewCap').textContent = changed ? 'New model preview' : card ? 'No visible change (the numbers are invisible)' : 'Current model';
  $('previewCap').classList.toggle('on', !!changed);
}

function take(i, slot) {
  if (!g.offer) return;
  if (slot == null && needsSlot(g, i)) { picking = i; audio.play('deal'); drawCards(false); return; }
  const res = pickCard(g, i, slot);
  if (res !== true) return;
  clearInterval(spin);
  $('cards').hidden = true;
  picking = null; hover = -1;
  mode = 'play';
  last = performance.now();
  drain();
  canvas.focus();
}

function cardKey(e) {
  if (!g.offer) return;
  if (e.code === 'KeyM') { audio.toggleMute(); return; }
  const n = /^(Digit|Numpad)([1-5])$/.exec(e.code)?.[2];
  if (picking != null) {
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); picking = null; drawCards(false); setTimeout(() => $('cardRow').querySelector('button')?.focus(), 30); return; }
    if (n) { e.preventDefault(); take(picking, +n - 1); }
    return;
  }
  if (n && +n <= g.offer.cards.length) { e.preventDefault(); take(+n - 1); }
}

$('cards').addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.card != null) take(+t.dataset.card);
  else if (t.dataset.slot != null) take(picking, +t.dataset.slot);
  else if (t.id === 'slotBack') { picking = null; drawCards(false); }
});
for (const ev of ['pointerover', 'focusin']) $('cards').addEventListener(ev, e => {
  const t = e.target.closest?.('[data-card]');
  const i = t ? +t.dataset.card : -1;
  if (i !== hover && picking == null) { hover = i; drawPreview(); }
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
  out.imageSmoothingEnabled = false;
}
addEventListener('resize', fit);
fit();

function drain() {
  let cards = false;
  for (const e of g.events) {
    if (e === 'over') gameOver();
    else if (e === 'levelup') cards = true;
    else audio.play(e);
  }
  g.events.length = 0;
  if (cards && mode === 'play') openCards();
}

function paint() {
  const buf = R.render(g, { mx: mouse.x, my: mouse.y, cursor: mode === 'play', muted: audio.muted, bare: mode === 'title' });
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
  paint();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// title screen: let the boss amble on its own behind the card
(function attract() {
  let t = 0;
  const id = setInterval(() => {
    if (mode !== 'title') { clearInterval(id); return; }
    t += DT * 2;
    const b = g.boss;
    const dir = Math.sin(t * 0.35) > 0 ? 1 : -1;
    step(g, { mx: b.x + dir * 30, my: b.y + Math.sin(t) * 4, ax: dir, ay: Math.sin(t * 1.3) * 0.2, press: {}, hold: {} }, DT);
    g.events.length = 0;
    g.dir.next = 1e9;
  }, 1000 / 30);
})();

// headless test hooks
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  window.__bh2 = {
    get g() { return g; },
    get mode() { return mode; },
    start,
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
    // steps n frames with the given input (and renders once at the end); stops early if a level-up opens
    step(n = 60, inp = {}) {
      for (let i = 0; i < n && mode === 'play'; i++) {
        step(g, { mx: g.boss.x + 30, my: g.boss.y, ax: 0, ay: 0, press: {}, hold: {}, ...inp }, DT); inp = { ...inp, press: {} };
        drain();
      }
      paint();
      return { t: g.t, score: Math.round(g.score), hp: Math.round(g.boss.hp), units: g.units.length, mult: g.mult, mode, level: g.lv.level };
    },
    // deals a level-up now; rarities forces each card's rarity (0 common .. 3 legendary)
    deal(rarities, why = 'LEVEL UP') { openOffer(g, { min: 0, why, force: rarities }); drain(); return g.offer?.cards.map(c => `${c.r}:${c.title}`); },
    pick(i, slot) { take(i, slot); return { mode, slots: [...g.slots], offer: !!g.offer }; },
    // sets how much has gone into each card tree and redraws the boss: e.g. { beam: 9, hp: 9, legend: 1 }
    evolve(inv) { const { legend = 0, ...rest } = inv; g.inv = { ...rest }; g.lv.rare[3] = legend; g.look = evoLook(g); paint(); return g.look; },
    world: () => import('./world.js'),
  };
}
