// The boss's name and looks, chosen in Settings. Choices show at once but are only kept when Settings closes and the
// player says to save them (menu.js asks); until then `saved` is what localStorage holds and name/look are the draft.

import { LOOKS, BOSS_NAMES } from './world.js';
import { BOSS_SIZE, PAL, hslToHex } from './art.js';
import { bossPreview, markerPreview } from './render.js';
import { createFurPicker } from './furpick.js';

const LOOK_KEY = 'bosshours.look.v1', NAME_KEY = 'bosshours.name.v1';
const PART_NAMES = { head: 'Head', horns: 'Horns', neck: 'Neck', back: 'Back', tail: 'Tail', limbs: 'Limbs', legs: 'Limb Amount', marker: 'Destination marker' };
const MAX_NAME = 26;
const $ = id => document.getElementById(id);

// only what the game's pixel font can draw
const clean = s => s.toUpperCase().replace(/[^A-Z0-9 .,!?:\-+/'"()*%#<>=[\]_]/g, '').slice(0, MAX_NAME);
const randomName = not => {
  const list = BOSS_NAMES.filter(n => n !== not);
  return list[Math.floor(Math.random() * list.length)];
};

let look = Object.fromEntries(Object.keys(LOOKS).map(k => [k, 0]));
look.fur = null;
try {
  const saved = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}');
  for (const k in LOOKS) if (Number.isInteger(saved[k]) && saved[k] >= 0 && saved[k] < LOOKS[k].length) look[k] = saved[k];
  if (typeof saved.fur === 'string' && /^#[0-9a-f]{6}$/i.test(saved.fur)) look.fur = saved.fur;
} catch {}

let name = '';
try { name = clean(localStorage.getItem(NAME_KEY) || ''); } catch {}
if (!name.trim()) { name = randomName(); try { localStorage.setItem(NAME_KEY, name); } catch {} }

let saved = { name: name.trim(), look: { ...look } };
const same = (a, b) => Object.keys(a).every(k => a[k] === b[k]);

export const currentLook = () => ({ ...look });
export const bossName = () => name.trim() || 'THE BOSS';

// a pixel die showing one face, as an svg
const PIPS = { 1: [[4, 4]], 2: [[2, 2], [6, 6]], 3: [[2, 2], [4, 4], [6, 6]], 4: [[2, 2], [6, 2], [2, 6], [6, 6]], 5: [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]], 6: [[2, 2], [6, 2], [2, 4], [6, 4], [2, 6], [6, 6]] };
const die = n => `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="#14100c" d="M1 0h7v1h1v7H8v1H1V8H0V1h1z"/><path fill="#f4ecd2" d="M1 1h7v7H1z"/><path fill="#aeac9b" d="M1 7h7v1H1zM7 1h1v7H7z"/>${PIPS[n].map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="#c0392b"/>`).join('')}</svg>`;

export function createAppearance({ audio, onLook, onName }) {
  const input = $('bossName'), dieBtn = $('nameDie'), rows = $('lookRows'), lookDie = $('lookDie'), revert = $('lookRevert');
  let focus = null, dir = 0, timer = 0;
  let manual = null;   // the look as the player last set it by hand, kept while the dice are being rolled

  function setName(n) {
    name = n;
    onName(bossName());
  }
  const roll = btn => {
    btn.innerHTML = die(1 + Math.floor(Math.random() * 6));
    btn.classList.remove('roll'); void btn.offsetWidth; btn.classList.add('roll');
    audio.play('menuMove');
  };
  input.addEventListener('input', () => {
    const v = clean(input.value);
    if (v !== input.value) { const at = input.selectionStart; input.value = v; input.setSelectionRange(at, at); }
    setName(v);
  });
  input.addEventListener('blur', () => { if (!name.trim()) { setName(randomName()); input.value = name; } else { input.value = name = name.trim(); setName(name); } });
  dieBtn.innerHTML = die(5);
  dieBtn.addEventListener('click', () => {
    setName(randomName(name));
    input.value = name;
    roll(dieBtn);
  });

  function commit() {
    onLook(currentLook());
    drawPreview();
  }
  // a change made by hand: that is now the look "revert!!" would go back to, so there is nothing to revert
  function byHand() { manual = null; revert.hidden = true; }

  // the other die: every part and the fur colour at once
  lookDie.innerHTML = die(3);
  lookDie.addEventListener('click', () => {
    manual ||= { ...look };
    for (const k in LOOKS) look[k] = Math.floor(Math.random() * LOOKS[k].length);
    look.fur = hslToHex(Math.random() * 360, 0.25 + Math.random() * 0.6, 0.22 + Math.random() * 0.4);
    focus = null;
    fur.set(look.fur); sync(); commit();
    revert.hidden = false;
    roll(lookDie);
  });
  revert.addEventListener('click', () => {
    if (!manual) return;
    look = manual; manual = null;
    focus = null;
    fur.set(look.fur); sync(); commit();
    revert.hidden = true;
    audio.play('menuMove');
    lookDie.focus({ preventScroll: true });
  });

  rows.innerHTML = Object.entries(LOOKS).map(([part, names]) =>
    `<fieldset class="part"><legend>${PART_NAMES[part]}</legend><div class="opts">` +
    names.map((nm, i) => `<label class="radio"><input type="radio" name="look-${part}" data-part="${part}" value="${i}"><span>${nm}</span></label>`).join('') +
    '</div></fieldset>').join('');
  rows.addEventListener('change', e => {
    const r = e.target.closest('input[data-part]');
    if (!r) return;
    look[r.dataset.part] = +r.value;
    focus = r.dataset.part;
    byHand();
    audio.play('menuMove');
    commit();
  });

  const fur = createFurPicker($('furPick'), hex => { look.fur = hex; focus = 'fur'; byHand(); sync(); commit(); });
  $('furNatural').addEventListener('click', () => { look.fur = null; focus = 'fur'; byHand(); fur.set(null); sync(); commit(); audio.play('menuMove'); });

  function sync() {
    for (const r of rows.querySelectorAll('input[data-part]')) r.checked = look[r.dataset.part] === +r.value;
    $('furSwatch').style.background = look.fur || PAL.fur2;
    $('furNatural').classList.toggle('on', !look.fur);
  }

  function drawPreview() {
    const cv = $('preview'), c = cv.getContext('2d'), s = Math.floor(cv.width / BOSS_SIZE);
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cv.width, cv.height);
    const img = focus === 'marker' ? markerPreview(look.marker, performance.now() / 1000) : bossPreview(look, dir, Math.floor(performance.now() / 300) % 4);
    c.drawImage(img, 0, 0, BOSS_SIZE * s, BOSS_SIZE * s);
  }

  return {
    show() {
      input.value = name;
      focus = null;
      fur.set(look.fur);
      sync();
      drawPreview();
      clearInterval(timer);
      timer = setInterval(() => { dir = (dir + 1) % 32; drawPreview(); }, 140);
    },
    hide() { clearInterval(timer); timer = 0; },
    // anything different from what is saved, whether typed, clicked or rolled
    dirty: () => (name.trim() || saved.name) !== saved.name || !same(look, saved.look),
    save() {
      if (!name.trim()) setName(saved.name);
      name = name.trim();
      saved = { name, look: { ...look } };
      try { localStorage.setItem(NAME_KEY, name); localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch {}
      byHand();
    },
    discard() {
      look = { ...saved.look };
      setName(saved.name);
      input.value = name;
      byHand();
      fur.set(look.fur); sync(); commit();
    },
  };
}
