// Dialog Manager emulation: DLOG/DITL resources drawn in the classic style onto the game screen
// (GetNewDialog + DrawDialog + ModalDialog). Buttons are clicked with the mouse; Return/Enter picks
// the default (item 1), Escape or Cmd-. a Cancel-like button. Editable text items accept typing.

import { getResource, getPicture } from './res.js';
import { macRoman } from '../rsrc.js';
import { Port, zoomFor, unzoom } from './qd.js';
import { Input, UIState } from './input.js';
import { nextFrame } from './timing.js';
import { copyBits } from './render.js';

const rd16 = (d, o) => ((d[o] << 24) >> 16) | d[o + 1];

export function parseDLOG(d) {
  return { bounds: [rd16(d, 0), rd16(d, 2), rd16(d, 4), rd16(d, 6)], procID: rd16(d, 8), ditl: rd16(d, 18),
    title: macRoman(d.subarray(21, 21 + d[20])) };
}

// items: {type: 'button'|'check'|'radio'|'static'|'edit'|'icon'|'pict'|'user', rect:[t,l,b,r], text, id, disabled}
export function parseDITL(d) {
  const n = rd16(d, 0) + 1;
  const items = [];
  let p = 2;
  for (let i = 0; i < n; i++) {
    p += 4;
    const rect = [rd16(d, p), rd16(d, p + 2), rd16(d, p + 4), rd16(d, p + 6)];
    p += 8;
    const typ = d[p], len = d[p + 1];
    const data = d.subarray(p + 2, p + 2 + len);
    p += 2 + len;
    if (p & 1) p++;
    const k = typ & 0x7f;
    const type = { 4: 'button', 5: 'check', 6: 'radio', 8: 'static', 16: 'edit', 32: 'icon', 64: 'pict', 0: 'user' }[k] || 'other';
    const item = { type, rect, disabled: !!(typ & 0x80) };
    if (type === 'button' || type === 'check' || type === 'radio' || type === 'static' || type === 'edit') item.text = macRoman(data);
    else if (len === 2) item.id = rd16(data, 0);
    items.push(item);
  }
  return items;
}

const paramText = (s, params) => s.replace(/\^([0-3])/g, (m, i) => (params[+i] !== undefined ? String(params[+i]) : ''));

function drawButton(p, r, text, hilite) {
  p.paintRoundRect(r, 16, 16, hilite ? 255 : 0);
  // frame: paint a slightly larger black round rect then the white inside
  const frame = (rr, c) => p.paintRoundRect(rr, 16, 16, c);
  frame(r, 255);
  frame([r[0] + 1, r[1] + 1, r[2] - 1, r[3] - 1], hilite ? 255 : 0);
  p.textFont(0); p.textSize(12); p.textFace(0);
  p.fg = hilite ? 0 : 255;
  const w = p.stringWidth(text);
  p.moveTo(r[1] + ((r[3] - r[1] - w) >> 1), r[0] + ((r[2] - r[0]) >> 1) + 5);
  p.drawString(text);
  p.fg = 255;
}

function drawDialog(p, dlog, items, params, edits, focus, user = {}) {
  const [t, l, b, r] = dlog.bounds;
  // dBoxProc frame: black line, white gap, thick black line, white interior
  p.paintRect([t - 8, l - 8, b + 8, r + 8], 255);
  p.paintRect([t - 7, l - 7, b + 7, r + 7], 0);
  p.paintRect([t - 6, l - 6, b + 6, r + 6], 255);
  p.paintRect([t - 3, l - 3, b + 3, r + 3], 0);
  items.forEach((it, i) => {
    const R = [t + it.rect[0], l + it.rect[1], t + it.rect[2], l + it.rect[3]];
    if (it.type === 'button') drawButton(p, R, it.text, false);
    else if (it.type === 'static') {
      p.textFont(0); p.textSize(12); p.textFace(0); p.fg = 255;
      p.textBox(paramText(it.text, params), R);
    } else if (it.type === 'edit') {
      p.fg = 255;
      p.frameRect([R[0] - 3, R[1] - 3, R[2] + 3, R[3] + 3]);
      p.paintRect(R, 0);
      p.textFont(0); p.textSize(12); p.textFace(0); p.fg = 255;
      p.textBox(edits[i + 1] || '', R);
      if (focus === i + 1) {
        const x = R[1] + p.stringWidth(edits[i + 1] || '');
        p.paintRect([R[0] + 1, x, R[2] - 1, x + 1], 255);
      }
    } else if (it.type === 'user' && user[i + 1]) {
      user[i + 1].draw(p, R, edits);
    } else if (it.type === 'pict' || it.type === 'icon') {
      const bm = it.type === 'pict' ? getPicture(it.id) : null;
      if (bm) p.drawPicture(bm, 0, 0, R[0], R[1], Math.min(bm.h, R[2] - R[0]), Math.min(bm.w, R[3] - R[1]));
    }
  });
  // default button ring (the original draws it with PenSize 3, FrameRoundRect 15)
  const first = items[0];
  if (first && first.type === 'button') {
    const R = [t + first.rect[0] - 4, l + first.rect[1] - 4, t + first.rect[2] + 4, l + first.rect[3] + 4];
    for (let k = 0; k < 3; k++) {
      const rr = [R[0] + k, R[1] + k, R[2] - k, R[3] - k];
      // ring = outline only: paint black then restore inside on the last pass
      p.fg = 255;
      p.moveTo(rr[1] + 7, rr[0]); p.lineTo(rr[3] - 8, rr[0]);
      p.moveTo(rr[1] + 7, rr[2] - 1); p.lineTo(rr[3] - 8, rr[2] - 1);
      p.moveTo(rr[1], rr[0] + 7); p.lineTo(rr[1], rr[2] - 8);
      p.moveTo(rr[3] - 1, rr[0] + 7); p.lineTo(rr[3] - 1, rr[2] - 8);
      const arc = (cx, cy, sx, sy) => { for (let a = 0; a <= 8; a++) { const ang = (a / 8) * Math.PI / 2; p.plot(Math.round(cx + sx * 7 * Math.cos(ang)), Math.round(cy + sy * 7 * Math.sin(ang))); } };
      arc(rr[1] + 7, rr[0] + 7, -1, -1); arc(rr[3] - 8, rr[0] + 7, 1, -1);
      arc(rr[1] + 7, rr[2] - 8, -1, 1); arc(rr[3] - 8, rr[2] - 8, 1, 1);
    }
  }
}

const isCancelLabel = (s) => /cancel|don.t|abort|no\b/i.test(s || '');

// ModalDialog loop. Returns {item, edits}. opts: {params:[^0..^3], edits:{itemNo: text}, screen, hide:[itemNo],
// user:{itemNo: {draw(port, rect, edits), click(pt, rect, edits)}} for userItems}
export async function modalDialog(dlogId, opts = {}) {
  const dlogData = getResource('DLOG', dlogId);
  if (!dlogData) throw new Error('missing DLOG ' + dlogId);
  const dlog = parseDLOG(dlogData);
  const items = parseDITL(getResource('DITL', dlog.ditl));
  for (const n of opts.hide || []) if (items[n - 1]) items[n - 1].type = 'hidden';
  const screen = opts.screen;
  const params = opts.params || [];
  const edits = { ...(opts.edits || {}) };
  let focus = items.findIndex((it) => it.type === 'edit') + 1 || 0;
  const [t, l, b, r] = dlog.bounds;
  const area = [t - 8, l - 8, b + 8, r + 8];
  // enlarged on small screens so the text stays readable (see zoomFor); clicks are mapped back
  const zm = zoomFor(area, 12);
  const port = new Port(screen).setZoom(zm);
  const dev = zm.dev;
  const saved = screen.sub(dev[1], dev[0], dev[3] - dev[1], dev[2] - dev[0]);
  Input.flushEvents();
  UIState.modal++;
  const user = opts.user || {};
  const redraw = () => drawDialog(port, dlog, items, params, edits, focus, user);
  redraw();
  const hitItem = (pt) => items.findIndex((it) => it.type === 'button'
    && pt.v >= t + it.rect[0] && pt.v < t + it.rect[2] && pt.h >= l + it.rect[1] && pt.h < l + it.rect[3]) + 1;
  let result = 0;
  while (!result) {
    await nextFrame();
    let k;
    while (!result && (k = Input.nextKey())) {
      if (k.mac === 0x24 || k.mac === 0x4c) result = 1;
      else if (k.mac === 0x35 || (k.cmd && k.key === '.')) {
        const c = items.findIndex((it) => it.type === 'button' && isCancelLabel(it.text)) + 1;
        if (c) result = c;
      } else if (focus) {
        let s = edits[focus] || '';
        if (k.mac === 0x33) s = s.slice(0, -1);
        else if (k.key && k.key.length === 1 && s.length < 31) s += k.key;
        edits[focus] = s;
        redraw();
      }
    }
    let c;
    while (!result && (c = unzoom(Input.nextClick(), zm))) {
      const hit = hitItem(c);
      if (hit) { // track the press like the Control Manager: hilite, then confirm on release inside
        const it = items[hit - 1];
        const R = [t + it.rect[0], l + it.rect[1], t + it.rect[2], l + it.rect[3]];
        drawButton(port, R, it.text, true);
        while (Input.mouseDown) await nextFrame();
        drawButton(port, R, it.text, false);
        const m = unzoom(Input.mouse, zm) || c;
        if (hitItem(m) === hit || !Input.mouse) result = hit;
      } else {
        const e = items.findIndex((it) => it.type === 'edit'
          && c.v >= t + it.rect[0] && c.v < t + it.rect[2] && c.h >= l + it.rect[1] && c.h < l + it.rect[3]) + 1;
        if (e) { focus = e; redraw(); }
        else {
          const u = items.findIndex((it, i) => it.type === 'user' && user[i + 1]
            && c.v >= t + it.rect[0] && c.v < t + it.rect[2] && c.h >= l + it.rect[1] && c.h < l + it.rect[3]) + 1;
          if (u) {
            const it = items[u - 1];
            if (user[u].click) user[u].click(c, [t + it.rect[0], l + it.rect[1], t + it.rect[2], l + it.rect[3]], edits);
            redraw();
          }
        }
      }
    }
  }
  copyBits(screen, saved, 0, 0, dev[0], dev[1], saved.h, saved.w);
  UIState.modal--;
  Input.flushEvents();
  return { item: result, edits };
}
