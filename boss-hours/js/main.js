// The page: input, the fixed-step loop, scaling the 320×180 buffer to the window, the between-maps store,
// overlays, and saving the best score.

import { createGame, step, nextMap, W, H, ABILITIES, LOOKS, LOOK_COST, FUR_COST, SLOT_KEYS, abilityOffer, buyAbility, upgradeAbility, setSlot, spend, createDemo, demoSet, demoStep, createEnding, endingStep, newGamePlus } from './world.js';
import { createRenderer, bossPreview, markerPreview } from './render.js';
import { BOSS_SIZE, ICONS, PAL, drawText } from './art.js';
import { createFurPicker } from './furpick.js';
import { createAudio } from './audio.js';

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

let g = createGame();
let mode = 'title';   // title | play | store | paused | ending | over
let ending = null;    // the walk home after the castle falls
const DT = 1 / 60;
let acc = 0, last = performance.now();
let frozen = false;   // tests only: stop the clock so a screenshot shows exactly the stepped state

// ---------------------------------------------------------------------------------------------- input

const keys = new Set();
const mouse = { x: W / 2 + 40, y: H / 2, l: false };
const press = {};
const KEYMAP = { KeyJ: 'slot0', KeyK: 'slot1', KeyF: 'slot1', KeyQ: 'slot2', KeyE: 'slot3', KeyR: 'slot4', Space: 'shake' };

addEventListener('keydown', e => {
  if (e.target.closest?.('a, button, select')) return;
  if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); start(); return; }
  if (mode === 'over' && (e.code === 'KeyR' || e.code === 'Enter')) { e.preventDefault(); start(); return; }
  if (mode === 'won' && e.code === 'Enter') { e.preventDefault(); start(newGamePlus(g)); return; }
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
  g = next && next.map ? next : createGame();
  R.reset();
  acc = 0;
  mode = 'play';
  for (const id of ['title', 'over', 'paused', 'store', 'won']) $(id).hidden = true;
  canvas.focus();
}
function pause() { mode = 'paused'; $('paused').hidden = false; }
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

// the castle is down: first the walk home to the rocks, then the card
function gameWon() {
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

$('go').addEventListener('click', start);
$('wonAgain').addEventListener('click', start);
$('wonPlus').addEventListener('click', () => start(newGamePlus(g)));
$('again').addEventListener('click', start);
$('resume').addEventListener('click', resume);

// ---------------------------------------------------------------------------------------------- the store, between maps

let tab = 'abil', spin = null, sel = 'summon', pend = null, demo = null, demoRaf = 0;
let lookFocus = null;   // the part last clicked in Looks: the marker shows on a rock instead of on the boss
let openSlot = -1;      // the Loadout slot whose list is open
const PART_NAMES = { head: 'Head', neck: 'Neck', back: 'Back', tail: 'Tail', limbs: 'Limbs', marker: 'Destination marker' };
const PR = createRenderer();   // the demo reel's own renderer
const furPick = createFurPicker($('furPick'), hex => { lookFocus = 'fur'; pend = { ...pend, fur: hex }; drawLooks(); drawPreview(0); });

function openStore() {
  mode = 'store';
  keys.clear(); mouse.l = false;
  $('storeMap').textContent = g.map.n;
  tab = 'abil'; lookFocus = null; openSlot = -1;
  pend = { ...g.look };
  furPick.set(g.look.fur);
  if (!ABILITIES.some(a => a.id === sel)) sel = 'summon';
  demo ||= createDemo(g.look);
  showDemo();
  drawStore();
  $('store').hidden = false;
  let dir = 0;
  clearInterval(spin);
  spin = setInterval(() => { dir = (dir + 1) % 32; if (tab === 'looks') drawPreview(dir); }, 140);
  cancelAnimationFrame(demoRaf);
  let then = performance.now(), acc = 0;
  const tick = now => {
    if (mode !== 'store') return;
    acc = Math.min(0.25, acc + (now - then) / 1000); then = now;
    if (tab === 'abil') {
      while (acc >= DT) { demoStep(demo, DT); acc -= DT; }
      paintDemo();
    } else acc = 0;
    if (tab === 'looks' && lookFocus === 'marker') drawPreview(0);   // markers twinkle and spin
    demoRaf = requestAnimationFrame(tick);
  };
  demoRaf = requestAnimationFrame(tick);
}
function closeStore() {
  clearInterval(spin);
  cancelAnimationFrame(demoRaf);
  $('store').hidden = true;
  nextMap(g);
  R.reset();
  mode = 'play';
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
  $('tabAbil').hidden = tab !== 'abil'; $('tabSlots').hidden = tab !== 'slots'; $('tabLooks').hidden = tab !== 'looks';
  if (tab === 'abil') drawAbilities();
  if (tab === 'slots') drawSlots();
  if (tab === 'looks') { drawLooks(); drawPreview(0); }
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

// the loadout: five slots, each a pick-list in the game's own type. Every ability in a list says which key it is
// already on, so you can see what picking it would swap.
function drawSlots() {
  const owned = ABILITIES.filter(a => !a.passive && g.owned.has(a.id));
  const name = id => id ? ABILITIES.find(a => a.id === id).name : '(empty)';
  $('tabSlots').innerHTML = `<p class="hint">Five slots. Pick what goes where; picking something already on another key swaps them. Shake your fur stays on <kbd>Space</kbd>.</p>` +
    g.slots.map((id, i) => {
      const list = openSlot !== i ? '' : `<div class="pickList" role="listbox" aria-label="${SLOT_KEYS[i]} slot">` +
        [null, ...owned.map(a => a.id)].map(o => {
          const on = g.slots.indexOf(o), here = o === id;
          const tag = here ? 'here' : o && on >= 0 ? `on ${SLOT_KEYS[on]}` : o ? 'unbound' : '';
          return `<button type="button" role="option" aria-selected="${here}" class="pickOpt ${here ? 'here' : ''} ${o && on >= 0 && !here ? 'bound' : ''}" data-slot="${i}" data-pick="${o || ''}">${icon(o || 'empty')}<span>${name(o)}</span><small>${tag}</small></button>`;
        }).join('') + '</div>';
      return `<div class="slot ${openSlot === i ? 'open' : ''}"><kbd>${SLOT_KEYS[i]}</kbd>
        <button type="button" class="pickBtn" data-open="${i}" aria-haspopup="listbox" aria-expanded="${openSlot === i}">${icon(id || 'empty')}<span>${name(id)}</span><i aria-hidden="true">${openSlot === i ? '▲' : '▼'}</i></button>${list}</div>`;
    }).join('');
}

// looks are tried on for free and paid for when you mutate; nothing is owned, so going back costs again
function mutateCost() {
  let n = 0;
  for (const part in LOOKS) if (pend[part] !== g.look[part]) n += LOOK_COST[pend[part]];
  if (pend.fur !== g.look.fur && pend.fur) n += FUR_COST;
  return n;
}
function lookChanged() { return Object.keys(LOOKS).some(p => pend[p] !== g.look[p]) || pend.fur !== g.look.fur; }

function drawLooks() {
  $('lookRows').innerHTML = Object.entries(LOOKS).map(([part, names]) => `<div class="part"><h3>${PART_NAMES[part]}</h3><div class="opts">` +
    names.map((nm, i) => {
      const wearing = g.look[part] === i, trying = pend[part] === i && !wearing;
      const label = trying ? 'trying on' : wearing ? 'wearing' : LOOK_COST[i] ? fmt(LOOK_COST[i]) : 'free';
      return `<button type="button" class="opt ${wearing ? 'on' : ''} ${trying ? 'try' : ''}" data-part="${part}" data-i="${i}">${nm}<small>${label}</small></button>`;
    }).join('') + '</div></div>').join('');
  $('furSwatch').style.background = pend.fur || PAL.fur2;
  $('furNatural').classList.toggle('on', !pend.fur);
  const cost = mutateCost(), changed = lookChanged();
  $('lookInfo').innerHTML = changed
    ? `<button type="button" class="mutate" id="lookMutate" ${g.points < cost ? 'aria-disabled="true"' : ''}><span>Mutate</span><b>${cost ? fmt(cost) : 'free'}</b></button><button type="button" class="revert" id="lookRevert">Put it all back</button>`
    : `<span class="hint" style="margin:0;text-align:center">Click a part or a colour to try it on. Nothing is kept: every mutation is paid for again.</span>`;
}

function drawPreview(dir) {
  const cv = $('preview'), c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, cv.width, cv.height);
  const s = Math.floor(cv.width / BOSS_SIZE);
  const img = lookFocus === 'marker' ? markerPreview(pend.marker, performance.now() / 1000) : bossPreview(pend, dir, Math.floor(performance.now() / 300) % 4);
  c.drawImage(img, 0, 0, BOSS_SIZE * s, BOSS_SIZE * s);
}

$('store').addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t || t.getAttribute('aria-disabled') === 'true') return;
  if (t.dataset.tab) { tab = t.dataset.tab; drawStore(); return; }
  if (t.id === 'storeGo') { closeStore(); return; }
  if (t.dataset.sel) { sel = t.dataset.sel; showDemo(); drawAbilities(); return; }
  if (t.dataset.open) { const i = +t.dataset.open; openSlot = openSlot === i ? -1 : i; drawSlots(); focusPick(); return; }
  if (t.dataset.pick !== undefined) { setSlot(g, +t.dataset.slot, t.dataset.pick || null); openSlot = -1; audio.play('buy'); drawSlots(); return; }
  if (t.dataset.part) { lookFocus = t.dataset.part; pend = { ...pend, [t.dataset.part]: +t.dataset.i }; drawLooks(); drawPreview(0); return; }
  if (t.id === 'furNatural') { lookFocus = 'fur'; pend = { ...pend, fur: null }; furPick.set(null); drawLooks(); drawPreview(0); return; }
  if (t.id === 'lookRevert') { pend = { ...g.look }; furPick.set(g.look.fur); drawLooks(); drawPreview(0); return; }
  let ok = false;
  if (t.id === 'abilMutate') {
    const o = abilityOffer(g, sel);
    ok = o.buyCost != null ? buyAbility(g, sel) : upgradeAbility(g, sel);
    if (ok) showDemo();
  } else if (t.id === 'lookMutate') {
    ok = spend(g, mutateCost());
    if (ok) { g.look = { ...pend }; demo.look = { ...g.look }; }
  }
  if (ok) { audio.play('buy'); drawStore(); }
});
// an open pick-list closes on a click anywhere else or on Escape; arrow keys walk it
function focusPick() { (document.querySelector('.pickOpt.here') || document.querySelector('.pickOpt'))?.focus(); }
document.addEventListener('pointerdown', e => {
  if (openSlot >= 0 && !e.target.closest('.slot.open, .pickBtn')) { openSlot = -1; drawSlots(); }
});
$('store').addEventListener('keydown', e => {
  if (openSlot < 0) return;
  if (e.key === 'Escape') { e.preventDefault(); const i = openSlot; openSlot = -1; drawSlots(); document.querySelector(`[data-open="${i}"]`)?.focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const opts = [...document.querySelectorAll('.pickOpt')], k = opts.indexOf(document.activeElement);
    opts[(k + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length]?.focus();
  }
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
  window.__bh = {
    get g() { return g; },
    get mode() { return mode; },
    start,
    openStore, closeStore,
    win: () => gameWon(),
    get ending() { return ending; },
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
    level: async n => { (await import('./world.js')).jumpToLevel(g, n); R.reset(); paint(); return g.map.name; },
  };
}
