// Walking the menus with the arrow keys or a controller: a square cursor drawn around whatever has focus, moved
// spatially between the visible controls of whichever screen is on top. menu.js decides which screen that is and
// what Back means; this only knows how to find, move between and press the controls.

const FOCUSABLE = 'button, input, select, canvas[tabindex]';
const shown = el => el && !el.closest('[hidden]') && el.getClientRects().length > 0;

export function createNav() {
  const box = document.createElement('div');
  box.id = 'navCursor'; box.hidden = true; box.setAttribute('aria-hidden', 'true');
  document.body.appendChild(box);
  let on = false, adjusting = null, lastRect = '';

  const items = root => root ? [...root.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled && shown(el)) : [];
  // the cursor goes round a radio or checkbox's whole label, not the little square
  const target = el => el.closest('label.radio, label.chk') || el;

  function focus(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    target(el).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // the nearest control in that direction: scored on the space between the two edges along it (plus a little of the
  // centre distance), and one and a half times any sideways gap, so the next row wins over something far below that
  // happens to line up. With nothing further that way, up and down wrap round to the other end and left and right
  // step through the page in order.
  function move(root, dir) {
    const all = items(root);
    if (!all.length) return false;
    const cur = document.activeElement;
    if (!all.includes(cur)) { focus(all[0]); return true; }
    const r = target(cur).getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const vert = dir === 'up' || dir === 'down', sign = dir === 'down' || dir === 'right' ? 1 : -1;
    let best = null, score = Infinity;
    for (const el of all) {
      if (el === cur) continue;
      const q = target(el).getBoundingClientRect();
      if (target(el) === target(cur)) continue;
      const qx = q.left + q.width / 2, qy = q.top + q.height / 2;
      const along = (vert ? qy - cy : qx - cx) * sign;
      if (along < 4) continue;
      const edge = Math.max(0, vert ? (sign > 0 ? q.top - r.bottom : r.top - q.bottom) : (sign > 0 ? q.left - r.right : r.left - q.right));
      const gap = vert ? Math.max(0, q.left - r.right, r.left - q.right) : Math.max(0, q.top - r.bottom, r.top - q.bottom);
      const s = edge + along * 0.25 + gap * 1.5 + Math.abs(vert ? qx - cx : qy - cy) * 0.1;
      if (s < score) { score = s; best = el; }
    }
    if (!best && vert) best = sign > 0 ? all[0] : all[all.length - 1];
    if (!best) best = all[(all.indexOf(cur) + sign + all.length) % all.length];   // left and right are never dead: page order
    if (best && best !== cur) { focus(best); return true; }
    return false;
  }
  // Shift+Tab: back one in page order
  function step(root, d) {
    const all = items(root);
    if (!all.length) return;
    const at = all.indexOf(document.activeElement);
    focus(all[at < 0 ? 0 : (at + d + all.length) % all.length]);
  }

  // left and right change a slider or a pull-down in place instead of moving off it
  function adjust(el, dir) {
    if (!el || (dir !== 'left' && dir !== 'right')) return false;
    const d = dir === 'right' ? 1 : -1;
    if (el.type === 'range') {
      const v = Math.max(+el.min, Math.min(+el.max, +el.value + d * (+el.step || 1)));
      if (v !== +el.value) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
      return true;
    }
    if (el.tagName === 'SELECT') { cycle(el, d); return true; }
    return false;
  }
  function cycle(el, d) {
    const n = el.options.length;
    for (let k = 1; k <= n; k++) {
      const i = (el.selectedIndex + d * k + n * 2) % n;
      if (!el.options[i].disabled) { el.selectedIndex = i; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
    }
  }

  // what pressing does: buttons click, boxes tick, pull-downs step on, the name box hands on to the next control,
  // and a canvas that takes arrows (the fur picker) is picked up or put down
  function press(root, el) {
    if (!el || !items(root).includes(el)) { const all = items(root); focus(all[0]); return; }
    if (el.tagName === 'SELECT') { cycle(el, 1); return; }
    if (el.type === 'range') return;
    if (el.tagName === 'INPUT' && (el.type === 'text' || !el.type)) { move(root, 'down'); return; }
    if (el.tagName === 'CANVAS') { adjusting = adjusting === el ? null : el; return; }
    if (el.getAttribute('aria-disabled') === 'true') return;
    el.click();
  }

  // remembers what had focus by name, so a list that is drawn again (the Hoard's) can put it back
  function keyOf(el) {
    if (!el || el === document.body) return null;
    if (el.id) return '#' + el.id;
    for (const a of ['sel', 'tab', 'slot', 'bind', 'go', 'v', 'stick', 'mode']) if (el.dataset[a] != null) return `[data-${a}="${el.dataset[a]}"]`;
    return null;
  }
  function restore(k, root) {
    if (!k || (document.activeElement && document.activeElement !== document.body && root?.contains(document.activeElement))) return;
    const el = (root || document).querySelector(k);
    if (el && shown(el)) el.focus({ preventScroll: true });
  }

  // drawn once a frame while the menus are being walked; it only touches the page when the box has to move
  function draw(root) {
    const el = document.activeElement;
    const show = on && root && el && el !== document.body && root.contains(el) && shown(el);
    if (!show) { if (!box.hidden) { box.hidden = true; lastRect = ''; } return; }
    const r = target(el).getBoundingClientRect(), p = 5;
    const key = `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0},${adjusting === el}`;
    if (key !== lastRect) {
      lastRect = key;
      box.style.transform = `translate(${Math.round(r.left - p)}px,${Math.round(r.top - p)}px)`;
      box.style.width = Math.round(r.width + p * 2) + 'px';
      box.style.height = Math.round(r.height + p * 2) + 'px';
      box.classList.toggle('adjust', adjusting === el);
    }
    if (box.hidden) box.hidden = false;
  }
  // the mouse takes over the moment it moves; the cursor comes back with the next arrow or button
  addEventListener('pointermove', e => { if (e.movementX || e.movementY) setOn(false); }, { passive: true });
  addEventListener('pointerdown', () => setOn(false), { passive: true });
  function setOn(v) {
    if (on === v) return;
    on = v;
    document.documentElement.classList.toggle('navving', v);
    if (!v) adjusting = null;
  }

  return {
    move, step, adjust, press, keyOf, restore, draw, items, focus,
    get on() { return on; }, set on(v) { setOn(v); },
    get adjusting() { return adjusting && adjusting === document.activeElement ? adjusting : null; },
    drop() { adjusting = null; },
  };
}
