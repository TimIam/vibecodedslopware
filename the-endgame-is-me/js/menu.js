// The menus: the title's list, the Settings / Handbook / Credits panels it shares with the pause screen.
// Everything is real controls, so Tab, Enter and the mouse all work; the arrow keys are added on top.

import { createHumanstiary } from './humanstiary.js';

const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const TITLES = { handbook: 'Handbook', settings: 'Settings', credits: 'Credits', humanstiary: 'Humanstiary' };
const OPENER = { handbook: 'openHandbook', credits: 'openCredits', humanstiary: 'openHumanstiary' };   // the button that leads to each panel from another

export function createMenu({ audio, title, actions, saves, appearance, clearBest, hasBest, calm }) {
  const stage = $('titleStage'), list = $('titleMenu');
  let panel = null, stack = [], shown = false, forgetArmed = false, armed = null;
  const humans = createHumanstiary();

  const focusable = root => [...root.querySelectorAll('button, input:not([type=radio]), input[type=radio]:checked')].filter(b => !b.disabled && b.offsetParent !== null);
  function move(root, d) {
    const all = focusable(root);
    if (!all.length) return;
    const at = all.indexOf(document.activeElement);
    all[at < 0 ? (d > 0 ? 0 : all.length - 1) : (at + d + all.length) % all.length].focus();
  }

  // ------------------------------------------------------------------------------------------------ the title list

  const item = go => list.querySelector(`[data-go="${go}"]`);
  const LABEL = { new: 'New Game', plus: 'New Game+' };

  function hint(go) {
    const info = saves.info();
    if (armed === go) return 'This replaces your save. Press again to go ahead.';
    if (go === 'new') return 'Start a new shift. The rocks are waiting.';
    if (go === 'continue') return info ? `Level ${info.level}, ${fmt(info.score)} points${info.ng ? `, New Game +${info.ng > 1 ? info.ng : ''}` : ''}.` : 'Nothing saved yet.';
    if (go === 'plus') return 'Every ability you own, back at the rocks. The heroes have been practising.';
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
    if (go === 'settings') { open('settings', 'title'); return; }
    if (go === 'continue') { actions.cont(); return; }
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
    $('panelCard').classList.toggle('wide', name === 'settings' || name === 'humanstiary');
    if (name === 'settings') { forgetArmed = false; refresh(); appearance.show(); } else appearance.hide();
    if (name === 'humanstiary') humans.open(0);
    $('panelCard').scrollTop = 0;
    (name === 'settings' ? $('bossName') : name === 'humanstiary' ? humans.tab() : $('panelBack')).focus({ preventScroll: true });
  }
  // back is where Back leads: another panel, or the 'title' or 'paused' screen underneath
  function open(name, back) {
    if (TITLES[back]) stack.push(back);
    else { stack = [back]; (back === 'title' ? $('title') : $('paused')).hidden = true; }
    $('panel').hidden = false;
    show(name);
  }
  // leaving Settings with the boss's name or looks changed asks first; Escape there means "keep editing"
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
    if (panel === 'settings' && appearance.dirty()) { ask.hidden = false; $('askSave').focus({ preventScroll: true }); return; }
    const was = panel, back = stack.pop();
    if (TITLES[back]) { show(back); $(OPENER[was]).focus({ preventScroll: true }); return; }
    panel = null;
    appearance.hide();
    $('panel').hidden = true;
    if (back === 'title') { $('title').hidden = false; item('settings').focus({ preventScroll: true }); }
    else { $('paused').hidden = false; $(was === 'handbook' ? 'pausedHandbook' : 'pausedSettings').focus({ preventScroll: true }); }
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
  $('pausedSave').addEventListener('click', () => { audio.play('menuGo'); actions.saveQuit(); });
  for (const id of ['overTitle', 'wonTitle']) $(id).addEventListener('click', () => { audio.play('menuGo'); actions.quit(); });

  // ------------------------------------------------------------------------------------------------ keys

  // true when the menus took this key and the game should ignore it
  function key(e, mode) {
    const up = e.code === 'ArrowUp', down = e.code === 'ArrowDown';
    if (mode === 'title' && !title().done) {
      if (e.ctrlKey || e.altKey || e.metaKey || e.code === 'Tab') return false;
      e.preventDefault();
      title().skip();
      return true;
    }
    if (panel && !ask.hidden) {
      // the save question: arrows and Tab walk its three buttons, Enter and Space press the one in focus
      const fwd = down || e.code === 'ArrowRight' || (e.code === 'Tab' && !e.shiftKey);
      if (fwd || up || e.code === 'ArrowLeft' || e.code === 'Tab') { e.preventDefault(); move(ask, fwd ? 1 : -1); }
      else if (e.code === 'Escape') { e.preventDefault(); answer('keep'); }
      return true;
    }
    if (panel) {
      const typing = e.target === $('bossName');
      if (e.code === 'Escape') {
        e.preventDefault();
        if (!pick.hidden) closePick(true); else close();
        return true;
      }
      if (typing && !up && !down) return true;   // letters, M and Backspace belong to the name box
      if (!pick.hidden && (up || down)) {
        e.preventDefault();
        const opts = [...pick.querySelectorAll('button')], k = opts.indexOf(document.activeElement);
        opts[(k + (down ? 1 : opts.length - 1)) % opts.length].focus();
        return true;
      }
      if (e.code === 'KeyM') { audio.toggleMute(); if (panel === 'settings') refresh(); return true; }
      if (e.code === 'Backspace') { e.preventDefault(); close(); return true; }
      if (up || down) {
        if (panel !== 'settings') { e.preventDefault(); $('panelCard').scrollBy(0, down ? 60 : -60); return true; }
        if (e.target.type === 'radio') return true;   // the browser walks the group and it saves itself
        e.preventDefault();
        move($('panelCard'), down ? 1 : -1);
      }
      // the reading panels scroll with up and down, so left and right walk their buttons
      if (panel !== 'settings' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.preventDefault(); move($('panelCard'), e.code === 'ArrowRight' ? 1 : -1); }
      return true;
    }
    if (mode === 'title') {
      if (e.code === 'KeyM') { audio.toggleMute(); return true; }
      if (up || down) { e.preventDefault(); move(list, down ? 1 : -1); return true; }
      if ((e.code === 'Enter' || e.code === 'Space') && !e.target.closest?.('a, button')) {
        e.preventDefault();
        firstItem().click();
      }
      return true;
    }
    if (mode === 'paused') {
      if (e.code === 'KeyM') { audio.toggleMute(); return true; }
      if (up || down) { e.preventDefault(); move($('paused'), down ? 1 : -1); return true; }
      if (e.code === 'Escape' || e.code === 'KeyP') { actions.resume(); return true; }
      return false;
    }
    if (mode === 'over' || mode === 'won') {
      if (up || down) { e.preventDefault(); move($(mode), down ? 1 : -1); return true; }
    }
    return false;
  }

  return { reveal, reset, key, refreshTitle, get open() { return panel; } };
}
