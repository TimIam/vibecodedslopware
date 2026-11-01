// Message sprites (kind 21000, seg 3 +0x1ae1c..) and ShowBalloon; buzzword generators (seg 6).
//
// The record's word +4 picks a world string (Hwld at 0x3c9 + n*256), +6 the balloon type, +8 a tint.
// Type 0 is a visible "!" sign that pulses; other types are invisible 96x96 triggers. Type 3 shows
// generated corporate buzzwords instead of a world string.
//
// ShowBalloon was a blocking modal in the original, drawn in the middle of SATSkip. Here the
// decision (and its side effects) happen synchronously and the modal itself is queued on G.modal,
// which the game loop awaits right after the sprite pass, before anything new is drawn.

import { G, Prefs } from '../state.js';
import { setRect } from '../../core/util.js';
import { SATRand } from '../../core/sat.js';
import { Random } from '../../core/util.js';
import { Port, wantedZoom } from '../../core/qd.js';
import { Input } from '../../core/input.js';
import { tickCount, nextFrame } from '../../core/timing.js';
import { Res, load1EncFaceFromCicn, getResource } from '../../core/res.js';
import { strList, pstr } from '../../rsrc.js';
import { S, stopSoundRes, play3DSoundPitched } from '../sound.js';
import { copyStatRect } from '../hud.js';
import { Game } from '../game.js';
import { a5pstr } from '../../core/a5.js';
import { Hooks, register } from '../hooks.js';

const MsgFaces = []; // g_6c1a: cicn 1101..1105

function messageDrawProc(face, s, blit) {
  const tint = G.level.info(0);
  if (tint) return blit(1, tint);
  if (s && s.param >= 0) {
    let t = G.level.w(G.level.objOff(s.param) + 8);
    if (t) {
      if (t < -1 || t > 15) t = 0;
      return blit(1, t);
    }
  }
  return blit(0, 0);
}

export function initMessageSprite() {
  for (let i = 0; i < 5; i++) {
    MsgFaces[i] = load1EncFaceFromCicn(1101 + i, false, 3801 + i);
    if (MsgFaces[i]) MsgFaces[i].drawProc = messageDrawProc;
  }
}

export function setupMessageSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleMessageSprite;
  s.hit = hitMessageSprite;
  s.tileHit = null;
  s.eface = MsgFaces[0];
  s.f26 = 0;
  s.layer = 9;
  s.posH = s.h; s.posV = s.v;
  s.behind = 0;
  s.f6e = 0;
}

const worldString = (n) => {
  const d = Res.world && Res.world.get('Hwld', 0);
  return d ? pstr(d, 0x3c9 + n * 256) : '';
};
const msgIndex = (s) => (s.param >= 0 && s.param <= 255 ? G.level.w(G.level.objOff(s.param) + 4) : 0);

function trigger(s) {
  const text = s.f6e === 3 ? generateBuzzwords() : worldString(msgIndex(s));
  return showBalloon(s, text, s.f6e);
}

export function handleMessageSprite(s) {
  if (s.f92) return;
  s.dir++;
  s.kind = 21000;
  if (s.param >= 0 && s.param <= 255) s.f6e = G.level.w(G.level.objOff(s.param) + 6);
  if (!s.f6e) setRect(s.hot, -8, -8, 32, 32);
  else { setRect(s.hot, -32, -32, 64, 64); s.eface = null; }
  if (!s.f6e) {
    if (s.dir < 15) s.eface = MsgFaces[(s.dir / 3) | 0];
    else if (s.dir < 30) s.eface = MsgFaces[((29 - s.dir) / 3) | 0];
    else s.dir = 0;
  }
  // a balloon that could not be shown yet (off screen) is retried every frame while scrolling there
  if (s.pending && s.pending.task === Hooks.handlePlayerSprite) {
    if (trigger(s)) { s.f92 = 1; s.pending = null; s.hit = null; }
  }
}

export function hitMessageSprite(me, other) {
  if (me.f92 || other.f92) return;
  if (other.task !== Hooks.handlePlayerSprite || other.hot[1] === 0) return; // not while kicking
  if (!trigger(me) && Prefs.scrollMode >= 3) me.pending = other; // (f6a)
}

// ---------------------------------------------------------------- ShowBalloon(s, text, type) -> shown
const BALLOON_W = 195;

export function showBalloon(s, text, type) {
  const port = new Port(Game.display.screen);
  port.textFont(3); port.textSize(9); port.textFace(0);
  const height = port.lineHeight() * (port.wrap(text, BALLOON_W).length + 1);
  let x, y;
  if (type !== 2 && s) {
    x = s.posH - G.viewLeft + (type === 5 ? -65 : -57);
    y = s.posV - G.viewTop + 17 - height;
  } else {
    x = G.playerH - 49 - G.viewLeft;
    y = G.playerV + 13 - G.viewTop - height;
  }
  let shown = true;
  if (x < 32 || y < 32 || x + 210 > 448 || y + height + 8 > 448) {
    shown = false;
    if (Prefs.scrollMode === 3 && G.scrollStepCount === 0 && s) {
      G.viewLeft += s.h + 32 < G.playerH + 32 ? -16 : 16;
      G.viewTop += s.v + 32 < G.playerV + 32 ? -16 : 16;
    }
  }
  if (!shown) return false;
  if (type === 5) stopSoundRes(S(301));
  if ((type === 1 || type === 3 || type === 5) && s) {
    play3DSoundPitched(S(217), 100, 256, s.posV, s.posH, SATRand(16000) + 56000);
  }
  if (s && type !== 5) s.f92 = 1;
  queueModal(() => balloonModal(text, x, y, height));
  return true;
}

export function queueModal(fn) {
  const prev = G.modal;
  G.modal = prev ? async () => { await prev(); await fn(); } : fn;
}
export async function runModal() {
  while (G.modal) { const m = G.modal; G.modal = null; await m(); }
}

// PressAnyKey: polls the keyboard/mouse; queued events also count so very short taps aren't lost
export async function pressAnyKey() {
  while (!Input.anyKeyDown() && !Input.nextKey() && !Input.nextClick()) await nextFrame();
}

async function balloonModal(text, x, y, height) {
  const port = new Port(Game.display.screen);
  port.foreColor(33);
  port.paintRectGrayOr([16, 16, 464, 464]);
  // Enlarged on small screens so the 9pt text stays readable. The tail tip stays where the original puts it
  // (at the speaker); the bubble sits above it, or below the speaker when that leaves room for bigger text.
  const W = 210, TAIL = 8;
  const tip = [x + 88, y + height + TAIL]; // [h, v]
  const zMax = Math.min(wantedZoom(9), 448 / W);
  const zAbove = Math.max(1, Math.min(zMax, (tip[1] - 16) / (height + TAIL)));
  const tipBelow = tip[1] + 36; // under the speaker
  const zBelow = Math.min(zMax, (464 - tipBelow) / (height + TAIL));
  const below = zBelow > zAbove;
  const z = below ? zBelow : zAbove, tv = below ? tipBelow : tip[1];
  const left = Math.round(Math.max(16, Math.min(tip[0] - 88 * z, 464 - W * z)));
  const top = Math.round(below ? tv + TAIL * z : tv - (height + TAIL) * z);
  port.setZoom({ z, tx: left - x * z, ty: top - y * z });
  port.textFont(3); port.textSize(9); port.textFace(0);
  const box = [y, x, y + height, x + W];
  const inner = [y + 5, x + 5, y + height - 5, x + 200];
  port.foreColor(30);
  port.paintRoundRect(box, 16, 16);
  // the tail, in screen pixels: from the bubble's edge to the tip (original shape: base at tip+8..tip+16)
  const tail = new Port(Game.display.screen);
  tail.foreColor(30);
  const edge = below ? top + 1 : top + Math.round(height * z);
  const bx = Math.round(Math.max(left + 8 * z, Math.min(tip[0] + 8 * z, left + (W - 16) * z)));
  tail.paintPoly([[bx, edge], [tip[0], tv], [Math.round(bx + 8 * z), edge]]);
  port.foreColor(33);
  port.textBox(text, inner);
  const start = tickCount();
  let quick = false;
  for (;;) {
    const k = Input.nextKey();
    if (Input.isPressed(0x24) || Input.isPressed(0x4c) || (k && (k.mac === 0x24 || k.mac === 0x4c))) { quick = true; break; }
    if (tickCount() - 60 >= start) break;
    await nextFrame();
  }
  Input.flushEvents();
  if (!quick) await pressAnyKey();
  // restore whatever the balloon covered outside the playfield; the playfield is redrawn next frame
  copyStatRect([0, 0, 16, 640]); copyStatRect([464, 0, 480, 640]);
  copyStatRect([16, 0, 464, 16]); copyStatRect([16, 464, 464, 640]);
  G.gf686 = true; G.g46af = true;
}

// ---------------------------------------------------------------- buzzwords (seg 6)
const Buzz = { lists: [], phone: [], last: new Array(8).fill(0) }; // g_6b44.. / g_6b5c.. / g_6b64..

export function initBuzzwords() {
  for (let i = 0; i <= 5; i++) Buzz.lists[i] = strList(getResource('STR#', 6900 + i));
  for (let i = 0; i <= 1; i++) Buzz.phone[i] = strList(getResource('STR#', 6800 + i));
}

// PickAString: a random entry, never the same index twice in a row
function pickAString(slot, list) {
  if (!list || !list.length) return '';
  let i;
  do { i = (Random() & 0xffff) % list.length; } while (i === Buzz.last[slot] && list.length > 1);
  Buzz.last[slot] = i;
  return list[i];
}

function fillTemplate(templateSlot, templateList, fills) {
  let s = pickAString(templateSlot, templateList);
  fills.forEach(([slot, list], digit) => {
    const pat = '^' + digit;
    let at = 0;
    for (;;) {
      const word = pickAString(slot, list);
      const k = s.indexOf(pat, at);
      if (k < 0) break;
      s = s.slice(0, k) + word + s.slice(k + 2);
      at = k + word.length;
    }
  });
  const up = (c) => (c >= 'a' && c <= 'z' ? c.toUpperCase() : c);
  if (s.length) s = up(s[0]) + s.slice(1);
  if ((s[0] === '"' || s[0] === '“') && s.length > 1) s = s[0] + up(s[1]) + s.slice(2);
  return s.slice(0, 255);
}

export function generateBuzzwords() {
  if (!Buzz.lists.length) initBuzzwords();
  const L = Buzz.lists;
  return fillTemplate(0, L[0], [[1, L[1]], [2, L[2]], [3, L[3]], [4, L[4]], [5, L[5]]]);
}

export function generatePhonewords() {
  if (!Buzz.phone.length) initBuzzwords();
  return fillTemplate(6, Buzz.phone[0], [[7, Buzz.phone[1]]]);
}

// Easter egg texts kept in the app globals: 52 quotes at g_ef0 ("parghz") and g_42f0 ("ben")
export const randomQuote = (n) => a5pstr(0xef0 + n * 256);
export const benQuote = () => a5pstr(0x42f0);

register({ runModal, queueModal, randomQuote, benQuote, initMessageSprite, setupMessageSprite, handleMessageSprite, showBalloon, generateBuzzwords,
  generatePhonewords, initBuzzwords, pressAnyKey });
