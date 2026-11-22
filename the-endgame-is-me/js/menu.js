// The menus: the title's list, the Phenotype / Controls / Handbook / Credits panels it shares with the pause screen,
// and the Hoard and the end cards for walking. Everything is real controls, so the mouse works as it always did; the
// arrow keys and a controller walk them with nav.js's square cursor (Enter, Space, Tab or A pick, Esc or B go back).

import { createHumanstiary } from './humanstiary.js';
import { createNav } from './nav.js';
import { controls, SLOTS, MOVES, STICK_ROLES, keyName, padName, slotLabel, spaceLabel, bindKey, bindPad, setStick, setMode, resetKeys, resetPad, onChange, hit, held, stick, fullscreen, PAD_A, PAD_B, PAD_SELECT } from './controls.js';

const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const TITLES = { handbook: 'Handbook', settings: 'Phenotype', controls: 'Controls', credits: 'Credits', humanstiary: 'Humanstiary' };
const READING = new Set(['handbook', 'credits', 'humanstiary']);   // long panels: up and down scroll them first
const PAUSE_BTN = { handbook: 'pausedHandbook', controls: 'pausedControls', settings: 'pausedSettings' };
const OPENER = { handbook: 'openHandbook', credits: 'openCredits', humanstiary: 'openHumanstiary' };   // the button that leads to each panel from another

export function createMenu({ audio, title, actions, saves, appearance, clearBest, hasBest, calm, slots }) {
  const stage = $('titleStage'), list = $('titleMenu');
  let panel = null, stack = [], shown = false, forgetArmed = false, armed = null;
  const humans = createHumanstiary();
  const nav = createNav();

  // ------------------------------------------------------------------------------------------------ the title list

  const item = go => list.querySelector(`[data-go="${go}"]`);
  const LABEL = { new: 'New Game', plus: 'New Game+' };

  function hint(go) {
    const info = saves.info();
    if (armed === go) return 'This replaces your save. Press again to go ahead.';
    if (go === 'new') return 'Start a new shift. The rocks are waiting.';
    if (go === 'continue') return info ? `Level ${info.level}, ${fmt(info.score)} points${info.ng ? `, New Game +${info.ng > 1 ? info.ng : ''}` : ''}.` : 'Nothing saved yet.';
    if (go === 'plus') return 'Every ability you own, back at the rocks. The heroes have been practising.';
    if (go === 'quit') return 'Back to the desktop. Your save stays where it is.';
    if (go === 'controls') return 'Keyboard or controller, and what goes on which key.';
    return 'Your name, sound, music, and which horns.';
  }
  // The hint shows at once whenever it changes, and stays up while the mouse is on a menu item; with the mouse
  // anywhere else it fades out over 2 s (#menuHint.fade in index.html).
  const hintEl = $('menuHint');
  const overItem = () => !!list.querySelector('.mi:hover');
  function fadeHint(go) {
    hintEl.classList.remove('fade');
    if (!go) return;
    void hintEl.offsetWidth;   // so the fade starts from fully shown
    hintEl.classList.add('fade');
  }
  function setHint(go) { hintEl.dataset.at = go; hintEl.textContent = hint(go); fadeHint(!overItem()); }

  function disarm() {
    if (!armed) return;
    item(armed).textContent = LABEL[armed];
    armed = null;
  }
  function refreshTitle() {
    disarm();
    item('continue').disabled = !saves.info();
    item('plus').hidden = !saves.plus();
    item('quit').hidden = !window.slopDesktop;   // only the desktop (Steam) build can close itself
  }
  function firstItem() { return item('continue').disabled ? item('new') : item('continue'); }

  function reveal() {
    if (shown) return;
    shown = true;
    refreshTitle();
    stage.classList.add('on');
    firstItem().focus({ preventScroll: true });
    setHint(firstItem().dataset.go);
  }
  function reset() {   // going back to the title without replaying the logo
    shown = false;
    stage.classList.remove('on');
  }

  list.addEventListener('focusin', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if ($('menuHint').dataset.at !== b.dataset.go && shown && $('menuHint').dataset.at) audio.play('menuMove');
    setHint(b.dataset.go);
  });
  list.addEventListener('focusout', disarm);
  list.addEventListener('pointerover', e => {
    const b = e.target.closest('.mi');
    if (!b) return;
    fadeHint(false);
    if (!b.disabled) b.focus({ preventScroll: true });
  });
  list.addEventListener('pointerout', e => { if (e.target.closest('.mi') && !e.relatedTarget?.closest?.('.mi')) fadeHint(true); });
  list.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const go = b.dataset.go;
    audio.play('menuGo');
    if (go === 'settings' || go === 'controls') { open(go, 'title'); return; }
    if (go === 'continue') { actions.cont(); return; }
    if (go === 'quit') { window.slopDesktop?.quit(); return; }
    // starting over would overwrite the save, so that takes a second press
    if (saves.info() && armed !== go) {
      disarm();
      armed = go;
      b.textContent = 'Replace save?';
      setHint(go);
      return;
    }
    disarm();
    if (go === 'new') actions.newGame(); else actions.plus();
  });
  $('title').addEventListener('pointerdown', () => { if (!title().done) title().skip(); });

  // ------------------------------------------------------------------------------------------------ the panels

  function show(name) {
    panel = name;
    for (const p of document.querySelectorAll('#panel .panelBody')) p.hidden = p.dataset.panel !== name;
    $('panelTitle').textContent = TITLES[name];
    $('panelCard').classList.toggle('wide', name === 'settings' || name === 'humanstiary' || name === 'controls');
    if (name === 'settings') { forgetArmed = false; refresh(); appearance.show(); } else appearance.hide();
    if (name === 'humanstiary') humans.open(0);
    if (name === 'handbook') drawKeys();
    capture = null;
    if (name === 'controls') drawControls();
    $('panelCard').scrollTop = 0;
    const first = { settings: $('bossName'), humanstiary: humans.tab(), controls: document.querySelector(`.ctlMode [data-mode="${controls.mode}"]`) }[name];
    (first || $('panelBack')).focus({ preventScroll: true });
  }
  // back is where Back leads: another panel, or the 'title' or 'paused' screen underneath
  function open(name, back) {
    if (TITLES[back]) stack.push(back);
    else { stack = [back]; (back === 'title' ? $('title') : $('paused')).hidden = true; }
    $('panel').hidden = false;
    show(name);
  }
  // leaving Phenotype with the boss's name or looks changed asks first; Escape there means "keep editing"
  const ask = $('saveAsk');
  function answer(how) {
    ask.hidden = true;
    audio.play('menuGo');
    if (how === 'keep') { $('bossName').focus({ preventScroll: true }); return; }
    if (how === 'save') appearance.save(); else appearance.discard();
    close();
  }
  $('askSave').addEventListener('click', () => answer('save'));
  $('askDiscard').addEventListener('click', () => answer('discard'));
  $('askKeep').addEventListener('click', () => answer('keep'));
  function close() {
    closePick();
    capture = null; nav.drop();
    if (panel === 'settings' && appearance.dirty()) { ask.hidden = false; $('askSave').focus({ preventScroll: true }); return; }
    const was = panel, back = stack.pop();
    if (TITLES[back]) { show(back); $(OPENER[was]).focus({ preventScroll: true }); return; }
    panel = null;
    appearance.hide();
    $('panel').hidden = true;
    if (back === 'title') { $('title').hidden = false; item(was === 'controls' ? 'controls' : 'settings').focus({ preventScroll: true }); }
    else { $('paused').hidden = false; $(PAUSE_BTN[was] || 'pausedSettings').focus({ preventScroll: true }); }
  }
  $('panelBack').addEventListener('click', () => { audio.play('menuGo'); close(); });
  $('openHandbook').addEventListener('click', () => { audio.play('menuGo'); open('handbook', 'settings'); });
  $('openCredits').addEventListener('click', () => { audio.play('menuGo'); open('credits', 'settings'); });
  $('openHumanstiary').addEventListener('click', () => { audio.play('menuGo'); open('humanstiary', 'handbook'); });

  // ------------------------------------------------------------------------------------------------ sound

  const SOUND = { music: ['volMusic', 'muteMusic'], sfx: ['volSfx', 'muteSfx'] };
  for (const [k, [vol, mute]] of Object.entries(SOUND)) {
    $(vol).addEventListener('input', () => { audio.setLevel(k, +$(vol).value); paintSlider($(vol)); if (k === 'sfx') audio.play('menuMove'); });
    $(mute).addEventListener('change', () => { audio.setMuted(k, $(mute).checked); audio.play('menuMove'); });
  }
  function paintSlider(s) { s.style.setProperty('--at', `${s.value / s.max * 100}%`); }

  // the music pull-down: "stage music", the two random modes, then one track for the whole game
  const pick = $('musicList'), pickBtn = $('musicBtn');
  const CHOICES = () => [
    { v: 'stage', name: 'Each stage its own', note: '' },
    { v: 'randomStage', name: 'Random per stage', note: '' },
    { v: 'random', name: 'Random', note: '' },
    ...audio.tracks.map(t => ({ v: t.id, name: t.name, note: `${t.seconds | 0} s` })),
  ];
  function drawPick() {
    const now = audio.selection, c = CHOICES();
    pickBtn.querySelector('span').textContent = (c.find(o => o.v === now) || c[0]).name;
    pick.innerHTML = c.map(o => `<button type="button" role="option" class="pickOpt ${o.v === now ? 'here' : ''}" aria-selected="${o.v === now}" data-v="${o.v}"><span>${o.name}</span><small>${o.note}</small></button>`).join('');
  }
  function closePick(refocus) {
    if (pick.hidden) return;
    pick.hidden = true;
    pickBtn.setAttribute('aria-expanded', 'false');
    pickBtn.querySelector('i').textContent = '▼';
    if (refocus) pickBtn.focus();
  }
  function openPick() {
    drawPick();
    pick.hidden = false;
    pickBtn.setAttribute('aria-expanded', 'true');
    pickBtn.querySelector('i').textContent = '▲';
    (pick.querySelector('.here') || pick.querySelector('button')).focus();
  }
  pickBtn.addEventListener('click', () => { if (pick.hidden) openPick(); else closePick(true); });
  pick.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    audio.select(b.dataset.v);
    audio.play('menuMove');
    drawPick();
    closePick(true);
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#musicPick')) closePick(); });

  // ------------------------------------------------------------------------------------------------ settings

  const shake = $('setShake'), forget = $('setForget');
  function refresh() {
    for (const [k, [vol, mute]] of Object.entries(SOUND)) {
      $(vol).value = audio.level(k); paintSlider($(vol));
      $(mute).checked = audio.isMuted(k);
    }
    drawPick();
    shake.checked = !calm.get();
    forget.querySelector('.lbl').textContent = forgetArmed ? 'Really forget it?' : 'Forget best shift';
    forget.querySelector('.val').textContent = hasBest() ? (forgetArmed ? 'Yes' : '') : 'None yet';
  }
  shake.addEventListener('change', () => { calm.set(!shake.checked); audio.play('menuMove'); });
  forget.addEventListener('click', () => {
    if (hasBest()) { if (forgetArmed) { clearBest(); forgetArmed = false; } else forgetArmed = true; }
    audio.play('menuMove');
    refresh();
  });

  // ------------------------------------------------------------------------------------------------ pause and the end cards

  $('pausedHandbook').addEventListener('click', () => { audio.play('menuGo'); open('handbook', 'paused'); });
  $('pausedSettings').addEventListener('click', () => { audio.play('menuGo'); open('settings', 'paused'); });
  $('pausedControls').addEventListener('click', () => { audio.play('menuGo'); open('controls', 'paused'); });
  $('pausedSave').addEventListener('click', () => { audio.play('menuGo'); actions.saveQuit(); });
  for (const id of ['overTitle', 'wonTitle']) $(id).addEventListener('click', () => { audio.play('menuGo'); actions.quit(); });

  // ------------------------------------------------------------------------------------------------ controls

  // capture: waiting for the key or button to bind, { kind: 'kb' | 'pad', action, frame } (frame: the poll it began
  // on, so the very press that opened it is not taken as the answer)
  let capture = null;
  const ACT = { space: 'Roar / shake', up: 'Walk up', down: 'Walk down', left: 'Walk left', right: 'Walk right', pause: 'Pause' };
  const slotTitle = i => `Slot ${i + 1}<small>${slots()[i] || 'empty'}</small>`;
  function drawControls() {
    if (panel !== 'controls') return;
    const keep = nav.keyOf(document.activeElement);
    for (const b of document.querySelectorAll('.ctlMode [data-mode]')) { b.classList.toggle('on', b.dataset.mode === controls.mode); b.setAttribute('aria-pressed', b.dataset.mode === controls.mode); }
    const gp = navigator.getGamepads?.().find(p => p && p.connected);
    $('padStatus').textContent = gp ? `Found ${gp.id.replace(/\s*\(.*$/, '').slice(0, 32) || 'a controller'}.` : 'No controller yet. Press a button on one.';
    const row = (kind, a, label, val) => {
      const wait = capture?.kind === kind && capture.action === a;
      return `<button type="button" class="setRow bind ${wait ? 'wait' : ''}" data-bind="${kind}:${a}"><span class="lbl">${label}</span><span class="val">${wait ? (kind === 'kb' ? 'Press a key' : 'Press a button') : val}</span></button>`;
    };
    $('kbRows').innerHTML = [...SLOTS.map((a, i) => row('kb', a, slotTitle(i) + (i < 2 ? `<small>or ${['LMB', 'RMB'][i]}</small>` : ''), keyName(controls.kb[a]))),
      row('kb', 'space', ACT.space, keyName(controls.kb.space)), ...MOVES.map(a => row('kb', a, ACT[a], keyName(controls.kb[a])))].join('');
    $('padRows').innerHTML = [...SLOTS.map((a, i) => row('pad', a, slotTitle(i), padName(controls.pad[a]))),
      row('pad', 'space', ACT.space, padName(controls.pad.space)), row('pad', 'pause', ACT.pause, padName(controls.pad.pause))].join('');
    $('stickRows').innerHTML = ['left', 'right'].map(s => `<label class="stickRow"><span>${s === 'left' ? 'Left' : 'Right'} stick</span><select data-stick="${s}">` +
      Object.entries(STICK_ROLES).map(([v, n]) => `<option value="${v}" ${controls.sticks[s] === v ? 'selected' : ''}>${n}</option>`).join('') + '</select></label>').join('');
    nav.restore(keep, $('panelCard'));
  }
  onChange(() => {
    document.documentElement.classList.toggle('pad', controls.mode === 'pad');
    drawControls();
    if (panel === 'handbook') drawKeys();
  });
  document.documentElement.classList.toggle('pad', controls.mode === 'pad');
  $('panelCard').addEventListener('click', e => {
    const m = e.target.closest('.ctlMode [data-mode]');
    if (m) { setMode(m.dataset.mode); audio.play('menuMove'); return; }
    const b = e.target.closest('[data-bind]');
    if (!b) return;
    const [kind, action] = b.dataset.bind.split(':');
    capture = capture?.kind === kind && capture.action === action ? null : { kind, action, frame: controls.gamepad.frame };
    audio.play('menuMove');
    drawControls();
  });
  $('panelCard').addEventListener('change', e => {
    const s = e.target.closest('select[data-stick]');
    if (s) { setStick(s.dataset.stick, s.value); audio.play('menuMove'); }
  });
  $('kbReset').addEventListener('click', () => { capture = null; resetKeys(); audio.play('menuMove'); });
  $('padReset').addEventListener('click', () => { capture = null; resetPad(); audio.play('menuMove'); });
  $('ctlFull').addEventListener('click', () => toggleFull());
  function toggleFull() { fullscreen().then(ok => { if (!ok) notice('The browser wants a key for that: press F11.'); }); }
  let noticeT = 0;
  function notice(text) {
    const n = $('notice');
    n.textContent = text; n.hidden = false;
    clearTimeout(noticeT); noticeT = setTimeout(() => { n.hidden = true; }, 3500);
  }
  function endCapture(ok) { capture = null; audio.play(ok ? 'menuGo' : 'menuMove'); drawControls(); }

  // the Handbook's key list, drawn from whatever the keys and buttons are now
  function drawKeys() {
    const k = s => `<kbd>${s}</kbd>`, names = slots(), pad = controls.mode === 'pad';
    const STICK = { move: 'lumber about', tank: 'turn, and walk forward and back', aim: 'face somewhere' };
    const rows = pad ? [
      ...['left', 'right'].filter(s => controls.sticks[s] !== 'none').map(s => [k(s === 'left' ? 'Left stick' : 'Right stick'), STICK[controls.sticks[s]]]),
      [k('D-pad'), 'lumber about'],
    ] : [[['up', 'left', 'down', 'right'].map(a => k(keyName(controls.kb[a]))).join(''), 'lumber about'], [k('mouse'), 'face somewhere']];
    names.forEach((n, i) => rows.push([k(slotLabel(i, !pad && i > 1)), n ? n.toLowerCase() + (i === 0 ? ' (hold it)' : '') : 'empty slot (buy something)']));
    rows.push([k(spaceLabel(true)), 'roar (everyone runs)'], [k(spaceLabel(true)), 'shake, when he is in your fur']);
    rows.push(pad ? [k(padName(controls.pad.pause)) + ' ' + k('Select'), 'pause, fullscreen'] : [k('P') + ' ' + k('M'), 'pause, mute']);
    $('hbKeys').innerHTML = rows.map(([a, b]) => `<span class="k">${a}</span><span>${b}</span>`).join('');
  }

  // ------------------------------------------------------------------------------------------------ walking the menus

  // the screen on top, whose controls the arrows and the controller walk; null while playing
  function activeRoot(mode) {
    if (panel) return !ask.hidden ? ask : !pick.hidden ? pick : $('panelCard');
    if (mode === 'title') return shown && title().done ? list : null;
    if (mode === 'paused') return $('paused').hidden ? null : $('paused');
    if (mode === 'store' || mode === 'over' || mode === 'won') return $(mode).hidden ? null : $(mode);
    return null;
  }
  const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  // one menu action, from either the keyboard or a controller: a direction, 'select', 'prev' or 'back'
  function intent(name, mode) {
    const root = activeRoot(mode);
    if (!root) return false;
    nav.on = true;
    const el = document.activeElement, mine = el && el !== document.body && root.contains(el);
    if (name === 'back') return back(mode);
    if (name === 'prev') { nav.step(root, -1); return true; }
    if (name === 'select') {
      if (!mine && root === list) { firstItem().click(); return true; }
      if (mine && el.id === 'furPick' && nav.adjusting) { nav.drop(); return true; }
      nav.press(root, mine ? el : null);
      return true;
    }
    if (nav.adjusting && el.id === 'furPick') { const [x, y] = VEC[name]; appearance.nudgeFur(x, -y); return true; }
    if (mine && nav.adjust(el, name)) return true;
    if (panel && READING.has(panel) && root === $('panelCard') && (name === 'up' || name === 'down')) {
      const c = root, room = name === 'down' ? c.scrollHeight - c.clientHeight - c.scrollTop : c.scrollTop;
      if (room > 2) { c.scrollBy(0, name === 'down' ? 60 : -60); return true; }
    }
    nav.move(root, name);   // (the title list makes its own sound when focus lands)
    return true;
  }
  function back(mode) {
    if (panel && !ask.hidden) { answer('keep'); return true; }
    if (panel && !pick.hidden) { closePick(true); return true; }
    if (nav.adjusting) { nav.drop(); return true; }
    if (panel) { audio.play('menuGo'); close(); return true; }
    if (mode === 'paused') { actions.resume(); return true; }
    return false;
  }

  // ------------------------------------------------------------------------------------------------ keys

  const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  let eatUp = null;   // the Space or Enter whose press we took, so its keyup can't click a button as well
  addEventListener('keyup', e => { if (e.code === eatUp) { e.preventDefault(); eatUp = null; } }, true);

  // true when the menus took this key and the game should ignore it
  function key(e, mode) {
    if (capture) {   // binding: the next key is the answer, Esc gives up
      e.preventDefault();
      if (e.code === 'Escape') endCapture(false);
      else if (capture.kind === 'kb' && !e.repeat && bindKey(capture.action, e.code)) endCapture(true);
      return true;
    }
    if (mode === 'title' && !title().done) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      e.preventDefault();
      title().skip();
      return true;
    }
    const root = activeRoot(mode);
    if (!root || e.ctrlKey || e.altKey || e.metaKey) return false;
    const typing = e.target === $('bossName');
    const dir = DIRS[e.code];
    if (dir) {
      if (typing && (dir === 'left' || dir === 'right')) return true;   // the caret
      e.preventDefault();
      intent(dir, mode);
      return true;
    }
    if (e.code === 'Tab') { e.preventDefault(); intent(e.shiftKey ? 'prev' : 'select', mode); return true; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || (e.code === 'Space' && !typing)) {
      e.preventDefault();
      if (!e.repeat) { eatUp = e.code; intent('select', mode); }
      return true;
    }
    if (e.code === 'Escape' || (e.code === 'Backspace' && !typing && panel)) { e.preventDefault(); intent('back', mode); return true; }
    if (typing) return true;   // letters, M and the rest belong to the name box
    if (e.code === 'KeyM') { audio.toggleMute(); if (panel === 'settings') refresh(); return true; }
    if (mode === 'paused' && !panel && e.code === 'KeyP') { actions.resume(); return true; }
    return !!panel || mode === 'title' || mode === 'paused';
  }

  // ------------------------------------------------------------------------------------------------ the controller

  // called every frame with the pad already polled: binding first, then the D-pad or left stick walk the cursor
  // (held, it repeats), A picks, B goes back, Select is fullscreen anywhere
  let padDir = null, padRep = 0;
  function pad(mode, dt) {
    if (capture?.kind === 'pad') {
      if (controls.gamepad.frame <= capture.frame) return true;
      for (let i = 0; i < 17; i++) if (hit(i)) {
        if (i === PAD_SELECT || i === 16) endCapture(false);
        else if (bindPad(capture.action, i)) endCapture(true);
        return true;
      }
      return true;
    }
    if (hit(PAD_SELECT)) toggleFull();
    if (mode === 'title' && !title().done) {
      for (let i = 0; i < 17; i++) if (hit(i)) { title().skip(); break; }
      return true;
    }
    if (!activeRoot(mode)) { padDir = null; return false; }
    const [sx, sy] = stick('left');
    let d = held(12) ? 'up' : held(13) ? 'down' : held(14) ? 'left' : held(15) ? 'right' : null;
    if (!d && Math.hypot(sx, sy) > 0.5) d = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'right' : 'left') : (sy > 0 ? 'down' : 'up');
    if (d !== padDir) { padDir = d; padRep = 0.38; if (d) intent(d, mode); }
    else if (d && (padRep -= dt) <= 0) { padRep = 0.11; intent(d, mode); }
    if (hit(PAD_A)) intent('select', mode);
    else if (hit(PAD_B)) intent('back', mode);
    else if (hit(controls.pad.pause)) { if (mode === 'paused' && !panel) actions.resume(); else if (mode === 'title' && !panel) intent('select', mode); }
    return true;
  }

  return {
    reveal, reset, key, pad, intent, refreshTitle, notice, toggleFull,
    get open() { return panel; },
    get capturing() { return capture; },
    // once a frame: where the square cursor is
    draw(mode) { nav.draw(activeRoot(mode)); },
    nav,
  };
}
