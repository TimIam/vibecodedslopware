// Debug mode. Holding Shift and Ctrl and pressing comma then period stops the level where it stands and turns the
// screen into an inspector: every actor and piece of scenery gets an outline in its affiliation's colour, a click
// selects the nearest one and opens a window on it (picture, name, archetype, stats, affiliation, editable numbers),
// a checkbox draws the hitboxes, a pull-down drops straight into any level, and two buttons open the Hoard or its
// Loadout tab over the stopped level (free, with mutations that can be taken back off). Nothing here is mentioned in the game.
// All of its state lives in this module: the saved game only ever sees the edits themselves.

import { CLASS, ADDS, BOSS_SPEED, ROCK_R, W, H } from './world.js';
import { KINDS, CRITTERS } from './props.js';
import { LEVELS } from './levels/index.js';
import { drawThing, bossPreview } from './render.js';
import { BOSS_DIRS, BOSS_SIZE, PAL, newCanvas } from './art.js';
import { isolate, portrait } from './humanstiary.js';

// a boss named after the key combination (spaces and case aside) cannot be hurt
export const isSecretName = name => String(name || '').replace(/\s+/g, '').toLowerCase() === 'shiftctrl,.';

const TAU = Math.PI * 2;
const AFF = {
  scenery: { col: '#ffffff', name: 'Scenery' },
  rider: { col: '#3a8cff', name: 'Horse guy' },
  raid25: { col: '#ff3ad8', name: '25-man' },
  five: { col: '#3aff5a', name: '5-man' },
  raid40: { col: '#ffe23a', name: '40-man' },
  boss: { col: '#ff7a2a', name: 'The boss' },
};
// a party's head count, pets aside; the 40-man is the final raid, or any raid that size (the castle's garrison)
const heads = p => p.units.filter(u => !(CLASS[u.cls] || {}).pet && u.role !== 'pet').length;
const partyAff = p => p.type === 'rider' ? 'rider' : p.type === 'raid' ? (p.final || heads(p) > 32 ? 'raid40' : 'raid25') : 'five';
const num = (v, d = 1) => Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d) : String(v);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
#dbgBar,#dbgWin{position:fixed;z-index:20;background:#1c1610;border:3px solid #14100c;box-shadow:0 0 0 3px #633b25,0 8px 24px rgba(0,0,0,.6);font-size:11px;color:#f4ecd2}
#dbgBar{left:50%;bottom:6px;transform:translateX(-50%);padding:5px 10px 4px;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;justify-content:center;width:max-content;max-width:calc(100vw - 16px)}
#dbgBar[hidden]{display:none}
#dbgBar b{color:#ffd75a;font-size:13px}
#dbgBar label{display:flex;gap:6px;align-items:center}
#dbgBar select,#dbgWin input{font:11px "Silkscreen",monospace;background:#14100c;color:#f4ecd2;border:2px solid #633b25;padding:3px 4px}
#dbgBar select:focus,#dbgWin input:focus,#dbgBar input:focus-visible{outline:2px solid #ffd75a;outline-offset:1px}
#dbgBar .key{display:flex;flex-wrap:wrap;gap:2px 5px;align-items:center}
#dbgBar .key span{margin-right:6px}
#dbgBar .key i{width:10px;height:10px;box-shadow:0 0 0 1px #14100c}
#dbgBar small{color:#aeac9b;flex-basis:100%;text-align:center}
#dbgBar .btns{display:flex;gap:6px}
#dbgBar .btns button{margin:0;padding:3px 7px 2px;font-size:11px}
#dbgWin{top:64px;width:270px;max-height:calc(100dvh - 80px);overflow:auto;padding:8px 10px 10px}
#dbgWin[hidden]{display:none}
#dbgWin header{display:flex;justify-content:space-between;align-items:center;gap:8px}
#dbgWin header b{color:#ffd75a;font-size:13px;text-transform:uppercase}
#dbgWin header button{margin:0;padding:3px 7px 2px;font-size:11px;background:#2a2016;box-shadow:0 2px 0 #14100c,0 0 0 2px #14100c}
#dbgWin canvas{display:block;margin:8px auto 6px;width:144px;height:144px;image-rendering:pixelated;box-shadow:0 0 0 2px #14100c}
#dbgWin dl{width:100%;margin:0;grid-template-columns:auto 1fr;gap:2px 10px;font-size:11px}
#dbgWin dd{text-align:left}
#dbgWin dd i{display:inline-block;width:9px;height:9px;margin-right:5px;box-shadow:0 0 0 1px #14100c;vertical-align:-1px}
#dbgWin .edit{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:8px}
#dbgWin .edit input{width:100%;min-width:0;user-select:text;-webkit-user-select:text}
#dbgWin h4{margin:10px 0 0;font-size:11px;color:#aeac9b;font-weight:400}
`;

export function createDebug({ canvas, host }) {
  let on = false, armed = false, hitboxes = false, sel = null, g = null, was = null, camWas = null, shakeWas = 0;
  let lastClick = null, cycle = 0;
  const outlines = new Map();   // thing object → its outline, built once while the world stands still
  let bar = null, win = null;

  // ------------------------------------------------------------------------------------------------ what there is

  // every selectable thing on the level, as { t, o, x, y, aff, and a shape: r or w and h }
  function things() {
    const out = [{ t: 'boss', o: g.boss, x: g.boss.x, y: g.boss.y, r: g.boss.r, aff: 'boss' }];
    for (const u of g.units) {
      if (u.dead || u.gone) continue;
      const aff = partyAff(u.party);
      out.push({ t: 'unit', o: u, x: u.x, y: u.y, r: 1.5, aff });
      if (u.role === 'rider' && u.horse) out.push({ t: 'horse', o: u.horse, owner: u, x: u.horse.x, y: u.horse.y, r: 3, aff });
    }
    for (const p of g.parts) if (p.horse) out.push({ t: 'horse', o: p, x: p.x, y: p.y, r: 3, aff: 'rider' });
    for (const a of g.adds) if (!a.dead) out.push({ t: 'add', o: a, x: a.x, y: a.y, r: a.r, aff: 'boss' });
    for (const c of g.critters) if (!c.dead && !c.gone) out.push({ t: 'critter', o: c, x: c.x, y: c.y, r: c.r, aff: 'scenery' });
    for (const p of g.props) if (p.state !== 'gone') out.push({ t: 'prop', o: p, x: p.x, y: p.y, r: p.r, w: p.w, h: p.h, aff: 'scenery' });
    const m = g.map;
    if (m.mode === 'patrol' && !m.plain && m.A && m.B) {
      out.push({ t: 'rock', o: m.A, x: m.A.x, y: m.A.y, r: ROCK_R, aff: 'scenery', other: false });
      out.push({ t: 'rock', o: m.B, x: m.B.x, y: m.B.y, r: ROCK_R, aff: 'scenery', other: true });
    }
    return out;
  }
  const isActor = th => th.t !== 'prop' && th.t !== 'rock';

  // how far a point is from a thing (0 when it is on it). Little people stand on their feet, so aim a bit higher.
  function reach(th, x, y) {
    if (th.w) return Math.hypot(Math.max(Math.abs(x - th.x) - th.w / 2, 0), Math.max(Math.abs(y - th.y) - th.h / 2, 0));
    const up = th.t === 'unit' || th.t === 'critter' || th.t === 'add' ? 2 : 0;
    return Math.max(0, Math.hypot(x - th.x, y - (th.y - up)) - Math.max(th.r, 2.5));
  }

  // ------------------------------------------------------------------------------------------------ pictures

  function paintThing(c, th) {
    const o = th.o;
    if (th.t === 'boss') {
      const a = ((o.face % TAU) + TAU) % TAU, dir = Math.round(a / TAU * BOSS_DIRS) % BOSS_DIRS;
      c.drawImage(bossPreview(g.look, dir, 0), Math.round(o.x) - BOSS_SIZE / 2, Math.round(o.y) - BOSS_SIZE / 2);
    } else if (th.t === 'unit') (o.role === 'rider' ? drawThing.rider : drawThing.unit)(c, o, g);
    else if (th.t === 'horse') drawThing.horse(c, o, g);
    else if (th.t === 'add') drawThing.add(c, o, g);
    else if (th.t === 'critter') drawThing.critter(c, o, g);
    else if (th.t === 'prop') drawThing.prop(c, o, g);
    else if (th.t === 'rock') drawThing.rock(c, Math.round(o.x), Math.round(o.y), th.other);
  }
  function room(th) {
    if (th.t === 'boss') return { hx: 32, up: 32, down: 32 };
    if (th.t === 'prop') return { hx: Math.min(90, Math.max(28, (th.w || 0) / 2 + 14)), up: Math.min(130, Math.max(44, (th.h || 0) / 2 + 44)), down: Math.min(60, Math.max(14, (th.h || 0) / 2 + 12)) };
    return { hx: 16, up: 22, down: 10 };
  }
  const alone = (th, solid) => isolate(th.x, th.y, c => paintThing(c, th), { ...room(th), solid });

  // a one-pixel line round whatever the thing's own art covers; a plain box round its shape when it draws nothing
  function outlineOf(th) {
    let hit = outlines.get(th.o);
    if (hit) return hit;
    const col = AFF[th.aff].col, iso = alone(th, 128);
    if (iso.empty) hit = { box: true };
    else {
      const bw = iso.x1 - iso.x0 + 3, bh = iso.y1 - iso.y0 + 3, cv = newCanvas(bw, bh), c = cv.getContext('2d');
      const img = c.createImageData(bw, bh), d = img.data, n = parseInt(col.slice(1), 16);
      const full = (x, y) => x >= 0 && y >= 0 && x < iso.w && y < iso.h && iso.d[(y * iso.w + x) * 4 + 3] >= 128;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const sx = iso.x0 - 1 + x, sy = iso.y0 - 1 + y;
        if (full(sx, sy) || !(full(sx - 1, sy) || full(sx + 1, sy) || full(sx, sy - 1) || full(sx, sy + 1))) continue;
        const i = (y * bw + x) * 4;
        d[i] = n >> 16; d[i + 1] = n >> 8 & 255; d[i + 2] = n & 255; d[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      hit = { cv, dx: iso.x0 - 1 - iso.hx, dy: iso.y0 - 1 - iso.up, w: bw, h: bh };
    }
    outlines.set(th.o, hit);
    return hit;
  }

  const px = (c, x, y) => c.fillRect(Math.round(x), Math.round(y), 1, 1);
  function circle(c, cx, cy, r) {
    const n = Math.max(8, Math.ceil(r * 7));
    for (let i = 0; i < n; i++) px(c, cx + Math.cos(i / n * TAU) * r, cy + Math.sin(i / n * TAU) * r);
  }
  function box(c, x, y, w, h) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    c.fillRect(x, y, w, 1); c.fillRect(x, y + h - 1, w, 1); c.fillRect(x, y, 1, h); c.fillRect(x + w - 1, y, 1, h);
  }
  function shape(c, th, grow = 0) {
    if (th.w) box(c, th.x - th.w / 2 - grow, th.y - th.h / 2 - grow, th.w + grow * 2, th.h + grow * 2);
    else circle(c, th.x, th.y, th.r + grow);
  }

  // called once the frame is in the buffer: outlines, hitboxes and the selection, in world pixels like render.js
  function draw(buf) {
    if (!on) return;
    const c = buf.getContext('2d'), vx = Math.round(g.cam.x), vy = Math.round(g.cam.y);
    c.save();
    c.setTransform(1, 0, 0, 1, -vx, -vy);
    c.globalAlpha = 1;
    let budget = 60;   // outlines are worked out a few dozen a frame, so a busy level does not hitch
    const all = things();
    for (const th of all) {
      const m = Math.max(40, (th.w || 0) / 2 + 20, (th.h || 0) / 2 + 20);
      if (th.x < vx - m || th.x > vx + W + m || th.y < vy - m || th.y > vy + H + m) continue;
      if (!outlines.has(th.o) && budget-- <= 0) continue;
      const o = outlineOf(th);
      if (o.box) { c.fillStyle = AFF[th.aff].col; shape(c, th, 2); }
      else c.drawImage(o.cv, Math.round(th.x) + o.dx, Math.round(th.y) + o.dy);
      if (hitboxes) { c.fillStyle = '#ff2a2a'; shape(c, th); }
    }
    if (sel) {
      const th = all.find(t => t.o === sel.o);
      if (!th) select(null);
      else if (Math.floor(performance.now() / 250) % 2) {
        const o = outlines.get(th.o);
        c.fillStyle = PAL.cream;
        if (o && !o.box) corners(c, Math.round(th.x) + o.dx - 2, Math.round(th.y) + o.dy - 2, o.w + 4, o.h + 4);
        else { const r = Math.max(th.r || 0, 3) + 4, w = th.w ? th.w + 8 : r * 2, h = th.h ? th.h + 8 : r * 2; corners(c, th.x - w / 2, th.y - h / 2, w, h); }
      }
    }
    c.restore();
  }
  function corners(c, x, y, w, h) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const k = Math.min(3, w >> 1, h >> 1);
    for (const [cx, sx] of [[x, 1], [x + w - 1, -1]]) for (const [cy, sy] of [[y, 1], [y + h - 1, -1]]) {
      c.fillRect(Math.min(cx, cx + sx * (k - 1)), cy, k, 1);
      c.fillRect(cx, Math.min(cy, cy + sy * (k - 1)), 1, k);
    }
  }

  // ------------------------------------------------------------------------------------------------ the window

  function describe(th) {
    const o = th.o, rows = [];
    let name = '', arch = '', fields = [];
    const aff = AFF[th.aff];
    let affText = aff.name;
    if (th.t === 'boss') {
      name = o.name; arch = 'Boss'; affText = 'The boss (you)';
      rows.push(['HP', `${num(o.hp, 0)} / ${num(o.maxhp, 0)}`], ['Speed', BOSS_SPEED], ['State', o.dead ? 'dead' : o.evade ? 'evading' : o.act ? o.act.kind : o.moving ? 'walking' : 'standing']);
      fields = ['hp', 'maxhp', 'x', 'y', 'face'];
    } else if (th.t === 'unit') {
      const c = CLASS[o.cls] || {}, p = o.party;
      name = o.role === 'king' ? 'THE KING' : o.role === 'rider' ? 'THE QUIET MAN' : '';
      arch = c.pet || o.role === 'pet' ? `${o.cls} (pet${o.owner ? ' of a ' + o.owner.cls : ''})` : `${o.cls} (${o.role})`;
      const live = p.units.filter(u => !u.dead && !u.gone).length;
      affText = p.type === 'rider' ? 'The quiet man on a horse' : p.king ? 'The crown (a party of one, 5-man rules)'
        : p.type === 'raid' ? `${heads(p)}-man raid${p.final ? ', the last one' : ''}${p.post ? ', garrison' : ''}` : `5-man${p.post ? ', garrison' : ''}`;
      rows.push(['HP', `${num(o.hp)} / ${num(o.maxhp)}`], ['Speed', `${num(o.spd)}${o.slow < 1 ? ` (slowed x${num(o.slow, 2)})` : ''}`]);
      if (c.dmg) rows.push(['Damage', `${num(c.dmg * p.power)} every ${c.rate} s${c.bolt ? `, ${c.bolt} bolt` : ''}`]);
      if (c.heal) rows.push(['Heals', `${num(c.heal * p.power)} every ${c.rate} s`]);
      rows.push(['State', o.state + (o.stun > 0 ? ', stunned' : '') + (o.fear > 0 ? ', feared' : '') + (o.mounted ? ', mounted' : '')]);
      rows.push(['Party', `#${p.id}, ${live} of ${p.units.length} up, power ${num(p.power, 2)}, ${p.engaged ? 'engaged' : 'not engaged'}${p.fleeing ? ', fleeing' : ''}`]);
      if (p.skill) rows.push(['Skill', `reacts ${p.skill.react} s, dodges ${Math.round(p.skill.dodge * 100)}%`]);
      fields = ['hp', 'maxhp', 'x', 'y', 'spd', 'stun', 'fear'];
      if (o.role === 'rider') fields.push('grip');
    } else if (th.t === 'horse') {
      name = ''; arch = 'Horse'; affText = 'The quiet man\'s horse';
      rows.push(['HP', 'none'], ['State', th.owner ? (th.owner.mounted ? 'ridden' : 'waiting') : 'loose, leaving']);
      fields = ['x', 'y', 'face'];
    } else if (th.t === 'add') {
      const d = ADDS[o.kind] || {};
      name = d.name || ''; arch = `Add: ${o.kind}`; affText = 'The boss\'s adds';
      rows.push(['HP', `${num(o.hp)} / ${num(o.maxhp)}`], ['Speed', num(d.spd)], ['Damage', `${num(d.dmg)} every ${d.rate} s, reach ${d.reach}`], ['State', o.state || (o.moving ? 'moving' : 'idle')]);
      fields = ['hp', 'maxhp', 'x', 'y'];
    } else if (th.t === 'critter') {
      const d = CRITTERS[o.kind] || { value: {} };
      arch = `Critter: ${o.kind}`; affText = 'Scenery (bystander)';
      rows.push(['HP', `${num(o.hp)} / ${num(d.hp)}`], ['Speed', `${num(d.spd)}, ${num(d.flee)} fleeing`], ['Damage', 'none'], ['State', o.bolting ? 'bolting' : o.scared > 0 ? 'scared' : o.moving ? 'wandering' : 'standing'], ['Worth', `${d.value.pts} points`]);
      fields = ['hp', 'x', 'y'];
    } else if (th.t === 'prop') {
      const d = KINDS[o.kind] || { value: {} };
      arch = `Prop: ${o.kind}`; affText = 'Scenery';
      rows.push(['HP', `${num(o.hp)} / ${num(o.maxhp)}`], ['State', o.state + (o.burning ? ', burning' : '')], ['Size', o.w ? `${num(o.w)} x ${num(o.h)}` : `radius ${num(o.r)}`],
        ['Traits', [d.solid ? 'solid' : 'walk-through', d.flammable ? 'flammable' : 'fireproof', d.push ? 'pushable' : ''].filter(Boolean).join(', ')], ['Worth', `${d.value.pts} points`]);
      fields = ['hp', 'maxhp', 'x', 'y', ...(o.w ? ['w', 'h'] : ['r'])];
    } else if (th.t === 'rock') {
      name = th.other ? 'THE OTHER ROCK' : 'THE ROCK'; arch = 'Rock';
      rows.push(['HP', 'none'], ['Position', `${num(o.x)}, ${num(o.y)}`], ['Size', `radius ${ROCK_R}, solid`], ['State', 'being a rock']);
    }
    return { name, arch, affText, col: aff.col, rows, fields };
  }

  function fillWindow(keepFields) {
    if (!sel) { win.hidden = true; return; }
    const d = describe(sel);
    win.hidden = false;
    if (!keepFields) {   // the window opens on whichever side the thing is not
      const left = sel.x - g.cam.x > W / 2;
      win.style.left = left ? '12px' : 'auto'; win.style.right = left ? 'auto' : '12px';
    }
    win.querySelector('header b').textContent = d.name || d.arch;
    win.querySelector('dl').innerHTML = [...(d.name ? [['Name', esc(d.name)]] : []), ['Archetype', esc(d.arch)], ['Affiliation', `<i style="background:${d.col}"></i>${esc(d.affText)}`],
      ...d.rows.map(([k, v]) => [k, esc(v)])].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    if (!keepFields) {
      win.querySelector('h4').hidden = !d.fields.length;
      win.querySelector('.edit').innerHTML = d.fields.filter(k => typeof sel.o[k] === 'number')
        .map(k => `<label for="dbg-${k}">${k}</label><input id="dbg-${k}" data-k="${k}" type="number" step="any" value="${num(sel.o[k], 2)}">`).join('');
    }
    portrait(win.querySelector('canvas'), alone(sel, 1));
  }

  function select(th) {
    sel = th;
    if (win) fillWindow(false);
  }

  // a click picks the nearest thing; clicking the same spot again steps through whatever else is under it
  function click(mx, my) {
    if (!on) return;
    const x = mx + Math.round(g.cam.x), y = my + Math.round(g.cam.y);
    const near = things().map(th => ({ th, d: reach(th, x, y) })).filter(e => e.d < 12)
      .sort((a, b) => a.d - b.d || isActor(b.th) - isActor(a.th) || Math.hypot(a.th.x - x, a.th.y - y) - Math.hypot(b.th.x - x, b.th.y - y));
    if (!near.length) { lastClick = null; select(null); return; }
    const close = near.filter(e => e.d <= near[0].d + 3);
    cycle = lastClick && Math.hypot(lastClick.x - x, lastClick.y - y) < 2 ? (cycle + 1) % close.length : 0;
    lastClick = { x, y };
    select(close[cycle].th);
  }

  function build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    bar = document.createElement('div');
    bar.id = 'dbgBar';
    bar.innerHTML = `<b>Debug</b>
      <label>Level <select id="dbgLevel">${LEVELS.map((L, i) => `<option value="${i + 1}">${i + 1}. ${esc(L.name)}</option>`).join('')}</select></label>
      <label class="chk"><input id="dbgHit" type="checkbox"><span>Hitboxes</span></label>
      <span class="btns"><button type="button" id="dbgHoard">Hoard</button><button type="button" id="dbgSlots">Loadout</button></span>
      <div class="key">${Object.values(AFF).map(a => `<i style="background:${a.col}"></i><span>${a.name}</span>`).join('')}</div>
      <small>The level is stopped. Click anything; click again for what is under it. Arrows look around. Hoard and Loadout cost nothing here. Esc leaves.</small>`;
    win = document.createElement('div');
    win.id = 'dbgWin';
    win.hidden = true;
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Selected thing');
    win.innerHTML = `<header><b></b><button type="button" id="dbgClose" aria-label="Close">X</button></header><canvas width="144" height="144"></canvas><dl></dl><h4>Change it</h4><div class="edit"></div>`;
    document.body.append(bar, win);
    bar.querySelector('#dbgHit').addEventListener('change', e => { hitboxes = e.target.checked; });
    bar.querySelector('#dbgLevel').addEventListener('change', e => jump(+e.target.value));
    // the Hoard and its Loadout tab, over the stopped level, free; closing it comes back here
    const store = t => {
      bar.hidden = true; win.hidden = true;
      host.store(t, () => { bar.hidden = false; if (sel) fillWindow(true); canvas.focus(); });
    };
    bar.querySelector('#dbgHoard').addEventListener('click', () => store('abil'));
    bar.querySelector('#dbgSlots').addEventListener('click', () => store('slots'));
    win.querySelector('#dbgClose').addEventListener('click', () => { select(null); canvas.focus(); });
    // numbers typed into the window go straight onto the thing
    win.querySelector('.edit').addEventListener('input', e => {
      const k = e.target.dataset.k, v = parseFloat(e.target.value);
      if (!sel || !k || !Number.isFinite(v)) return;
      sel.o[k] = v;
      if (k in sel) sel[k] = v;
      if (sel.t === 'prop') g.propsDirty = true;
      outlines.delete(sel.o);
      fillWindow(true);
    });
  }

  function jump(n) {
    host.jump(n);
    g = host.game();
    outlines.clear();
    camWas = { ...g.cam }; shakeWas = 0; g.shake = 0;
    select(null);
    bar.querySelector('#dbgLevel').value = g.map.n;
  }

  // ------------------------------------------------------------------------------------------------ on and off

  function enter() {
    if (on || !host.can()) return false;
    was = host.freeze();
    g = host.game();
    on = true;
    camWas = { ...g.cam }; shakeWas = g.shake; g.shake = 0;
    outlines.clear();
    if (!bar) build();
    bar.hidden = false;
    bar.querySelector('#dbgLevel').value = g.map.n;
    bar.querySelector('#dbgHit').checked = hitboxes;
    select(null);
    canvas.style.cursor = 'crosshair';
    canvas.focus();
    return true;
  }
  function leave() {
    if (!on) return;
    on = false;
    g.cam.x = camWas.x; g.cam.y = camWas.y; g.shake = shakeWas;
    sel = null; outlines.clear();
    bar.hidden = true; win.hidden = true;
    canvas.style.cursor = '';
    host.thaw(was);
  }

  // true when this key was debug's and nobody else should see it
  function key(e) {
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
      if (e.code === 'Comma') { armed = true; return on; }
      if (e.code === 'Period' && armed) {
        armed = false;
        if (on) leave(); else if (!enter()) return false;
        e.preventDefault();
        return true;
      }
      if (!/^(Shift|Control)/.test(e.code)) armed = false;
    } else armed = false;
    if (!on) return false;
    if (host.storeOpen) {   // the Hoard opened from here: Esc shuts it, every other key is the Hoard's
      if (e.code === 'Escape') { e.preventDefault(); host.closeStore(); return true; }
      return false;
    }
    if (e.code === 'Escape') { e.preventDefault(); leave(); return true; }
    if (e.target.closest?.('#dbgBar, #dbgWin')) return true;   // typing a number, picking a level
    const pan = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (pan) {
      e.preventDefault();
      g.cam.x = Math.max(0, Math.min(g.map.w - W, g.cam.x + pan[0] * 16));
      g.cam.y = Math.max(0, Math.min(g.map.h - H, g.cam.y + pan[1] * 16));
    }
    if (e.code === 'Space') e.preventDefault();
    return e.code !== 'Tab';
  }

  return {
    get on() { return on; }, key, click, draw, leave,
    // for tests
    get selected() { return sel && { t: sel.t, o: sel.o, ...describe(sel) }; },
    things: () => things().map(th => ({ t: th.t, x: th.x, y: th.y, aff: th.aff, col: AFF[th.aff].col, kind: th.o.kind || th.o.cls || th.t })),
  };
}
