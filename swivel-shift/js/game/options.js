// Preferences (Options in the main menu): the original's three panels (Game / Keyboard / Sound, DITL
// 6901..6903) drawn in the classic style, with the panel popup replaced by tabs, plus a Display tab for
// the web version. Settings that only mattered on 1990s hardware (line skipping, interlace, compatible
// drawing, system tasks) are not shown. Preferences persist in localStorage.

import { Prefs } from './state.js';
import { Port, TextOpts, zoomFor, unzoom } from '../core/qd.js';
import { Input, UIState } from '../core/input.js';
import { nextFrame } from '../core/timing.js';
import { copyBits } from '../core/render.js';
import { Game } from './game.js';
import { refreshMusic } from './music.js';
import { Hooks, register, hasHook } from './hooks.js';
import { ACTIONS } from './keys.js';

const PREFS_KEY = 'harry.prefs';
const copyKeys = (k) => Object.fromEntries(Object.entries(k).map(([n, b]) => [n, b.slice()]));
const DEFAULT_KEYS = copyKeys(Prefs.keys);
const SAVED = ['reduceFrameRate', 'g6173', 'scrollMode', 'soundOff', 'music', 'soundVolume', 'musicVolume', 'playerName',
  'autoDoors', 'smoothText', 'scale', 'filter', 'touch', 'touchLayout'];
const DEFAULTS = Object.fromEntries(SAVED.filter((k) => k !== 'playerName').map((k) => [k, Prefs[k]]));

export function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (p) {
      for (const k of SAVED) if (p[k] !== undefined) Prefs[k] = p[k];
      if (p.keys) for (const n of ACTIONS) if (Array.isArray(p.keys[n])) Prefs.keys[n] = [p.keys[n][0] ?? null, p.keys[n][1] ?? null];
    }
  } catch (e) { /* defaults */ }
  TextOpts.smooth = Prefs.smoothText;
}
export function savePrefs() {
  try {
    const o = { keys: Prefs.keys };
    for (const k of SAVED) o[k] = Prefs[k];
    localStorage.setItem(PREFS_KEY, JSON.stringify(o));
  } catch (e) { /* not persisted */ }
}

// Mac virtual key code -> label
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const KEY_NAMES = { 0x7b: 'Left', 0x7c: 'Right', 0x7d: 'Down', 0x7e: 'Up', 0x31: 'Space',
  0x3b: 'Control', 0x3a: IS_MAC ? 'Option' : 'Alt', 0x38: 'Shift', 0x37: IS_MAC ? 'Cmd' : 'Win', 0x30: 'Tab',
  0x24: 'Return', 0x33: 'Delete', 0x4c: 'Enter', 0x35: 'Esc' };
const LETTERS = 'ASDFHGZXCV?BQWERYT123465=97-80]OU[IP?LJ\'K;\\,/NM.';
export function keyName(code) {
  if (code === null || code === undefined) return '';
  if (KEY_NAMES[code] !== undefined) return KEY_NAMES[code];
  if (code < LETTERS.length && LETTERS[code] !== '?') return LETTERS[code];
  if (code >= 0x52 && code <= 0x5c) return 'Pad ' + [0, 1, 2, 3, 4, 5, 6, 7, , 8, 9][code - 0x52];
  return '#' + code.toString(16);
}

const BOX = [44, 85, 314, 555]; // t, l, b, r (DLOG 6900 is 470 x 260)
const PANELS = ['Game', 'Keyboard', 'Sound', 'Display'];

// Re-apply settings that act outside the dialog (music, text rendering, display scaling)
export function applyPrefs() {
  TextOpts.smooth = Prefs.smoothText;
  refreshMusic();
  if (hasHook('applyDisplayPrefs')) Hooks.applyDisplayPrefs();
}

export async function options(startPanel = 0) {
  const scr = Game.display.screen;
  const [t, l, b, r] = BOX;
  const zm = zoomFor([t - 8, l - 8, b + 8, r + 8], 12);
  const p = new Port(scr).setZoom(zm);
  const dev = zm.dev;
  const saved = scr.sub(dev[1], dev[0], dev[3] - dev[1], dev[2] - dev[0]);
  const before = JSON.stringify(Prefs);
  let panel = startPanel, editing = null, result = null; // editing = [action, 0 | 1]
  UIState.modal++;
  const R = (rt, rl, rb, rr) => [t + rt, l + rl, t + rb, l + rr];
  const tabs = PANELS.map((name, i) => ({ name, rect: R(36, 20 + i * 100, 56, 112 + i * 100) }));
  const ok = R(230, 395, 250, 470), cancel = R(230, 307, 250, 382), defaults = R(230, 13, 250, 133);
  // [label, action, label right edge, primary box, secondary box] in two columns of four
  const keyFields = [['Rotate Left:', 'rotLeft'], ['Rotate Right:', 'rotRight'], ['Scoot:', 'scoot'], ['Inch:', 'inch'],
    ['Power Kick:', 'kick'], ['Select Item:', 'switchItem'], ['Use Item:', 'fire'], ['Toggle Map:', 'map']]
    .map(([label, key], i) => {
      const x = i >> 2 ? 327 : 104, top = 84 + (i & 3) * 30;
      return [label, key, l + x, R(top, x + 6, top + 16, x + 64), R(top, x + 74, top + 16, x + 132)];
    });
  const radio = (label, get, set, top, left, w = 190) => ({ label, get, set, rect: R(top, left, top + 18, left + w) });
  const radios = () => {
    if (panel === 0) {
      return ['Constant, Catch-up', 'Constant, Anticipate', 'Step-Scroll, Smoother', 'Step-Scroll, Faster'].map((lb, i) =>
        radio(lb, () => Prefs.scrollMode === i + 1, () => { Prefs.scrollMode = i + 1; }, 116 + i * 20 + (i > 1 ? 7 : 0), 286, 180));
    }
    if (panel !== 3) return [];
    return [
      ...[[1, '1:1 (640 x 480)'], [2, '1:2 (1280 x 960)'], ['fit', 'Fill the window']].map(([v, lb], i) =>
        radio(lb, () => Prefs.scale === v, () => { Prefs.scale = v; }, 82 + i * 20, 25)),
      ...[['nearest', 'Sharp pixels'], ['sharp', 'Sharp, smoothed edges'], ['smooth', 'Smooth (bilinear)']].map(([v, lb], i) =>
        radio(lb, () => Prefs.filter === v, () => { Prefs.filter = v; }, 82 + i * 20, 250, 200)),
      ...[['auto', 'Automatic'], ['on', 'Always'], ['off', 'Never']].map(([v, lb], i) =>
        radio(lb, () => Prefs.touch === v, () => { Prefs.touch = v; }, 166, 25 + i * 110, 100)),
      ...[['overlay', 'Over the screen'], ['beside', 'Beside the screen']].map(([v, lb], i) =>
        radio(lb, () => Prefs.touchLayout === v, () => { Prefs.touchLayout = v; }, 190, 25 + i * 165, 150)),
    ];
  };
  const checks = () => (panel === 0 ? [
    { label: 'Auto-open unlocked doors', get: () => Prefs.autoDoors, set: (v) => { Prefs.autoDoors = v; }, rect: R(67, 25, 85, 240) },
    { label: 'Reduce frame rate', get: () => Prefs.reduceFrameRate, set: (v) => { Prefs.reduceFrameRate = v; }, rect: R(96, 25, 114, 192) },
    { label: 'Save between levels', get: () => Prefs.g6173, set: (v) => { Prefs.g6173 = v; }, rect: R(67, 257, 85, 425) },
  ] : panel === 2 ? [
    { label: 'Sound Effects', get: () => !Prefs.soundOff, set: (v) => { Prefs.soundOff = !v; }, rect: R(67, 26, 85, 135) },
    { label: 'Music', get: () => Prefs.music, set: (v) => { Prefs.music = v; }, rect: R(98, 26, 116, 83) },
  ] : panel === 3 ? [
    { label: 'Smooth (anti-aliased) text', get: () => Prefs.smoothText, set: (v) => { Prefs.smoothText = v; TextOpts.smooth = v; }, rect: R(146, 250, 164, 460) },
  ] : []);
  const sliders = () => (panel === 2 ? [
    { label: 'Sound Volume:', key: 'soundVolume', max: 9, rect: R(66, 350, 86, 450), lrect: R(68, 251, 84, 348) },
    { label: 'Music Volume:', key: 'musicVolume', max: 9, rect: R(97, 350, 117, 450), lrect: R(99, 252, 115, 348) },
  ] : []);

  const text = (s, x, y, size = 12, face = 0) => { p.textFont(0); p.textSize(size); p.textFace(face); p.moveTo(x, y); p.drawString(s); };
  const button = (rr, label, bold) => {
    p.paintRoundRect(rr, 16, 16, 255);
    p.paintRoundRect([rr[0] + 1, rr[1] + 1, rr[2] - 1, rr[3] - 1], 16, 16, 0);
    p.fg = 255;
    p.textFont(0); p.textSize(12); p.textFace(0);
    const w = p.stringWidth(label);
    text(label, rr[1] + ((rr[3] - rr[1] - w) >> 1), rr[0] + 15);
    if (bold) for (let k = 1; k <= 3; k++) p.frameRect([rr[0] - 3 - k + 1, rr[1] - 3 - k + 1, rr[2] + 3 + k - 1, rr[3] + 3 + k - 1]);
  };
  const isEditing = (key, n) => editing && editing[0] === key && editing[1] === n;
  const draw = () => {
    p.paintRect([t - 8, l - 8, b + 8, r + 8], 255);
    p.paintRect([t - 7, l - 7, b + 7, r + 7], 0);
    p.paintRect([t - 6, l - 6, b + 6, r + 6], 255);
    p.paintRect([t - 3, l - 3, b + 3, r + 3], 0);
    p.fg = 255;
    text('Harry Preferences', l + 179, t + 24, 12, 1);
    tabs.forEach((tab, i) => {
      p.paintRect(tab.rect, i === panel ? 255 : 0);
      p.fg = i === panel ? 0 : 255;
      p.frameRect(tab.rect);
      p.textFont(0); p.textSize(12);
      text(tab.name, tab.rect[1] + ((tab.rect[3] - tab.rect[1] - p.stringWidth(tab.name)) >> 1), tab.rect[0] + 15);
      p.fg = 255;
    });
    p.frameRect(R(60, 13, 220, 470));
    for (const c of checks()) {
      const box = [c.rect[0] + 3, c.rect[1], c.rect[0] + 15, c.rect[1] + 12];
      p.paintRect(box, 0); p.frameRect(box);
      if (c.get()) { p.moveTo(box[1], box[0]); p.lineTo(box[3] - 1, box[2] - 1); p.moveTo(box[3] - 1, box[0]); p.lineTo(box[1], box[2] - 1); }
      text(c.label, c.rect[1] + 18, c.rect[0] + 13);
    }
    for (const c of radios()) {
      const cx = c.rect[1] + 6, cy = c.rect[0] + 9, on = c.get();
      p.paintRoundRect([cy - 6, cx - 6, cy + 6, cx + 6], 12, 12, 255);
      p.paintRoundRect([cy - 5, cx - 5, cy + 5, cx + 5], 10, 10, 0);
      if (on) p.paintRoundRect([cy - 3, cx - 3, cy + 3, cx + 3], 6, 6, 255);
      text(c.label, c.rect[1] + 18, c.rect[0] + 13);
    }
    if (panel === 0) text('Camera Mode:', l + 257, t + 110);
    else if (panel === 1) {
      for (const [, , , ...boxes] of [keyFields[0], keyFields[4]]) {
        ['Primary', 'Secondary'].forEach((h, n) => {
          p.textFont(0); p.textSize(10);
          text(h, boxes[n][1] + ((boxes[n][3] - boxes[n][1] - p.stringWidth(h)) >> 1), t + 76, 10);
        });
      }
      for (const [label, key, lx, ...boxes] of keyFields) {
        p.textFont(0); p.textSize(12); p.textFace(0);
        text(label, lx - p.stringWidth(label), boxes[0][0] + 13);
        boxes.forEach((fr, n) => {
          const ed = isEditing(key, n);
          p.fg = 255;
          p.frameRect([fr[0] - 3, fr[1] - 3, fr[2] + 3, fr[3] + 3]);
          p.paintRect(fr, ed ? 255 : 0);
          p.fg = ed ? 0 : 255;
          const label2 = ed ? 'press' : keyName(Prefs.keys[key][n]);
          p.textFont(0); p.textSize(12);
          text(label2, fr[1] + ((fr[3] - fr[1] - p.stringWidth(label2)) >> 1), fr[0] + 13);
          p.fg = 255;
        });
      }
      text('Click a box, then press a key. Delete clears the box.', l + 70, t + 208, 10);
    } else if (panel === 2) {
      for (const s of sliders()) {
        text(s.label, s.lrect[1], s.lrect[0] + 13);
        const tr = s.rect;
        p.frameRect([tr[0] + 8, tr[1], tr[0] + 12, tr[3]]);
        const x = tr[1] + Math.round((Prefs[s.key] / s.max) * (tr[3] - tr[1] - 8));
        p.paintRect([tr[0] + 2, x, tr[0] + 18, x + 8], 255);
      }
      text('Some tunes are played from recordings of the original.', l + 61, t + 145, 10);
    } else if (panel === 3) {
      text('Screen size:', l + 25, t + 77);
      text('Scaling filter:', l + 250, t + 77);
      text('On-screen touch controls:', l + 25, t + 161);
    }
    button(defaults, 'Default Settings');
    button(cancel, 'Cancel');
    button(ok, 'OK', true);
  };
  const inR = (c, rr) => c.v >= rr[0] && c.v < rr[2] && c.h >= rr[1] && c.h < rr[3];
  const bind = (code) => {
    const [key, n] = editing;
    if (code !== 0x33) { // Delete just clears the box
      // a key can only do one thing: take it away from any other binding
      for (const a of ACTIONS) Prefs.keys[a] = Prefs.keys[a].map((k) => (k === code ? null : k));
    }
    Prefs.keys[key][n] = code === 0x33 ? null : code;
  };
  Input.flushEvents();
  draw();
  while (!result) {
    await nextFrame();
    let k;
    while ((k = Input.nextKey())) {
      if (editing) { if (k.mac !== 0x35) bind(k.mac); editing = null; draw(); }
      else if (k.mac === 0x24 || k.mac === 0x4c) result = 'ok';
      else if (k.mac === 0x35) result = 'cancel';
    }
    let c;
    while ((c = unzoom(Input.nextClick(), zm))) {
      editing = null;
      const ti = tabs.findIndex((tab) => inR(c, tab.rect));
      if (ti >= 0) panel = ti;
      else if (inR(c, ok)) result = 'ok';
      else if (inR(c, cancel)) result = 'cancel';
      else if (inR(c, defaults)) {
        Prefs.keys = copyKeys(DEFAULT_KEYS);
        Object.assign(Prefs, DEFAULTS);
        TextOpts.smooth = Prefs.smoothText;
      } else {
        for (const ch of checks()) if (inR(c, ch.rect)) ch.set(!ch.get());
        for (const rd of radios()) if (inR(c, rd.rect)) rd.set();
        if (panel === 1) for (const [, key, , ...boxes] of keyFields) boxes.forEach((fr, n) => { if (inR(c, fr)) editing = [key, n]; });
        if (panel === 2) for (const s of sliders()) if (inR(c, s.rect)) {
          Prefs[s.key] = Math.max(0, Math.min(s.max, Math.round(((c.h - s.rect[1]) / (s.rect[3] - s.rect[1] - 8)) * s.max)));
        }
      }
      draw();
    }
  }
  if (result === 'cancel') Object.assign(Prefs, JSON.parse(before));
  else savePrefs();
  applyPrefs();
  copyBits(scr, saved, 0, 0, dev[0], dev[1], saved.h, saved.w);
  UIState.modal--;
  Input.flushEvents();
}

register({ options, loadPrefs, savePrefs, applyPrefs });
