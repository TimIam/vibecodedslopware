// HUD (seg 1/3): UpdateText, UpdateMeters, UpdateAmmo, CopyStatRect, inventory
// (GetInvItem / SwitchInvItem / RemoveInvItem / UpdateInventory / DrawNumItems).

import { G } from './state.js';
import { Bitmap } from '../gfx.js';
import { getPicture, satGetFace, pstr } from '../core/res.js';
import { blitFace, copyBits } from '../core/render.js';
import { Port } from '../core/qd.js';
import { PlayerFaces } from './player.js';
import { register } from './hooks.js';
import { Game } from './game.js';

export const HUD = {
  off: new Bitmap(640, 480),   // gameOffscreen (g_7474)
  meters: null,                 // g_f6a6 (PICT 150)
  caps: [],                     // g_f70c / g_f710 / g_f714 end caps
  prevAmmo: [-1, -1, -1],       // g_f6ca / g_f6cc / g_f6ce
};

export function initHUD() {
  HUD.meters = getPicture(150);
  HUD.caps = [satGetFace(10135), satGetFace(10136), satGetFace(10137)];
}

// Draw the game frame PICT 129 into the offscreen and show it
export function drawGameFrame() {
  const pic = getPicture(0x81);
  if (pic) copyBits(HUD.off, pic, 0, 0, 0, 0, 480, 640);
  copyStatRect([0, 0, 480, 640]);
}

export function copyStatRect(r) {
  const scr = Game.display.screen;
  copyBits(scr, HUD.off, r[0], r[1], r[0], r[1], r[2] - r[0], r[3] - r[1]);
}

const port = () => new Port(HUD.off);

// UpdateText(onlyIfChanged)
export function updateText(incremental) {
  const p = port();
  const nameBox = [106, 482, 121, 614], scoreBox = [130, 482, 142, 587];
  p.textFont(21); p.textSize(9);
  p.foreColor(33); p.backColor(30);
  let d3 = 0;
  if (!incremental) {
    p.paintRect(nameBox);
    p.rgbFore(32000, 32000, 32000);
    p.textFace(0);
    p.moveTo(483, 118);
    p.drawString(pstr(G.level.u8, 0x114c0));
    copyStatRect(nameBox);
  }
  if (G.score !== G.dispScore || !incremental) {
    if (G.score !== G.dispScore) {
      if (G.dispScore > G.score) G.dispScore = G.score;
      else { G.dispScore += 50; d3 = G.score - G.dispScore; }
    } else p.foreColor(33);
    p.paintRect(scoreBox, 255);
    if (d3 > 800) d3 = 800;
    const g = 40 * d3 + 0x7d00;
    p.rgbFore(g, g, g);
    p.textFace(1);
    p.moveTo(483, 141);
    p.drawString(String(G.dispScore));
    copyStatRect(scoreBox);
  }
}

// One meter: actual/displayed value pair; y0 = top of the bar; srcRow = strip row in PICT 150
function drawMeter(actual, shown, incremental, y0, srcRow, cap) {
  let d3 = shown > 8 ? -3 : 0;
  const m = HUD.meters;
  const scr = HUD.off;
  if (!m) return;
  // background strip (full, or only the part up to the shown value when incremental)
  if (!(actual >= shown && incremental)) {
    const w = incremental ? shown + 3 : 147;
    copyBits(scr, m, 0, 0, y0, 473, 11, w);
  }
  copyBits(scr, m, srcRow, 0, y0, 473, 11, Math.max(0, shown + d3));
  if (d3 && cap) blitFace(scr, cap, y0 + 1, 473 + shown + d3, [0, 0, 480, 640]);
  copyStatRect(incremental ? [y0, 473, y0 + 11, 476 + shown] : [y0, 473, y0 + 11, 620]);
}

// UpdateMeters(incremental)
export function updateMeters(incremental) {
  if (incremental && G.comfort === G.g46be && G.legPower === G.g46bc && G.g46c0 === G.g46ba) return;
  G.comfort = Math.max(0, Math.min(0x90, G.comfort));
  G.legPower = Math.max(0, Math.min(0x90, G.legPower));
  G.g46c0 = Math.max(0, Math.min(0x90, G.g46c0));
  if (!(G.comfort === G.g46be && incremental)) {
    drawMeter(G.comfort, G.g46be, incremental, 386, 11, HUD.caps[0]);
    if (G.comfort < G.g46be) G.g46be--; else if (G.comfort > G.g46be) G.g46be++;
  }
  if (!(G.legPower === G.g46bc && incremental)) {
    // the swivel/surface meter is drawn inverted (144 - value)
    const a = 0x90 - G.legPower, s = 0x90 - G.g46bc;
    drawMeter(a, s, incremental, 416, 22, HUD.caps[1]);
    let ns = s;
    if (a < s) ns--; else if (a > s) ns++;
    G.g46bc = 0x90 - ns;
  }
  if (!(G.g46c0 === G.g46ba && incremental)) {
    drawMeter(G.g46c0, G.g46ba, incremental, 446, 33, HUD.caps[2]);
    if (G.g46c0 < G.g46ba) G.g46ba--; else if (G.g46c0 > G.g46ba) G.g46ba++;
  }
}

// ---------------------------------------------------------------- inventory
export const findCol = (i) => (i >= 0 && i <= 11 ? i % 3 : 0);
export const findRow = (i) => (i >= 0 && i <= 11 ? (i / 3) | 0 : 0);
const slotXY = (i) => [476 + findCol(i) * 49, 167 + findRow(i) * 49];

export function findInvItemFace(id) {
  if (id === 11398) return PlayerFaces.keyA;
  if (id === 11397) return PlayerFaces.keyB;
  return PlayerFaces.items[((id - 11199) / 100) | 0] || null;
}

function plot(face, h, v) { if (face) blitFace(HUD.off, face, v, h, [0, 0, 480, 640]); }

function drawNumItems(i, h, v) {
  const e = G.inventory[i];
  if (!e || e.count <= 1) return;
  const p = port();
  p.foreColor(30); p.textFace(1); p.textSize(9); p.textFont(21);
  p.moveTo(h + 2, v + 34); p.drawString('x');
  p.moveTo(h + 9, v + 34); p.drawString(String(e.count));
}

function drawSlot(i, selected) {
  const [x, y] = slotXY(i);
  const box = [y, x, y + 44, x + 44];
  if (selected) plot(PlayerFaces.slotSel, x + 4, y + 4);
  else port().paintRect(box, 255);
  plot(PlayerFaces.slot, x, y);
  const e = G.inventory[i];
  if (e && e.id !== -1) {
    plot(findInvItemFace(e.id), x + 4, y + 4);
    drawNumItems(i, x + 4, y + 4);
  }
  copyStatRect(box);
}

export function updateInventory() {
  for (let i = 0; i < 12; i++) if (G.inventory[i].id !== -1) drawSlot(i, i === G.curItem);
  updateAmmo(false);
}

// GetInvItem(id) -> bool
export function getInvItem(id) {
  let found = -1, free = -1;
  for (let i = 0; i < 12; i++) if (G.inventory[i].id === id) { found = i; break; }
  if (found !== -1) {
    G.inventory[found].count++;
    updateInventory();
    updateAmmo(false);
    return true;
  }
  for (let i = 0; i < 12; i++) if (G.inventory[i].id === -1) { free = i; break; }
  if (free === -1) { updateAmmo(false); return false; }
  G.inventory[free].id = id;
  G.inventory[free].count = 1;
  if (G.curItem === -1) G.curItem = free;
  drawSlot(free, free === G.curItem);
  updateAmmo(false);
  return true;
}

export function switchInvItem(to) {
  if (G.inventory[0].id === -1) return;
  drawSlot(G.curItem, false);
  if (to === -1) {
    const n = G.curItem + 1;
    if (G.curItem === 11 || G.inventory[n].id === -1) G.curItem = 0; else G.curItem = n;
  } else G.curItem = to;
  drawSlot(G.curItem, true);
  updateAmmo(false);
}

export function removeInvItem(i) {
  const e = G.inventory[i];
  if (!e) return;
  e.count--;
  if (e.count <= 0) {
    // the slot that becomes empty after compaction: this one, or the last used one
    let blankSlot;
    if (i === 11 || G.inventory[i + 1].id === -1) blankSlot = i;
    else {
      let d3 = -1;
      for (let k = 0; k < 12; k++) if (G.inventory[k].id === -1) { d3 = k - 1; break; }
      blankSlot = d3 !== -1 ? d3 : 11;
    }
    e.id = -1; e.count = 0;
    let [x, y] = slotXY(blankSlot);
    plot(PlayerFaces.slotEmpty, x, y);
    copyStatRect([y, x, y + 44, x + 44]);
    [x, y] = slotXY(i);
    plot(PlayerFaces.slotEmpty, x, y);
    for (let k = 0; k < 12; k++) {
      if (G.inventory[k].id === -1 && k !== 11 && G.inventory[k + 1].id !== -1) {
        for (let j = k; j < 11; j++) { G.inventory[j].id = G.inventory[j + 1].id; G.inventory[j].count = G.inventory[j + 1].count; }
        G.inventory[11].id = -1; G.inventory[11].count = 0;
      }
    }
    if (G.curItem === i) {
      if (i === 0) { if (G.inventory[0].id === -1) G.curItem = -1; }
      else G.curItem--;
    }
    copyStatRect([y, x, y + 44, x + 44]);
  }
  updateInventory();
}

// UpdateAmmo(incremental)
export function updateAmmo(incremental) {
  const ids = [11299, 11599, 11799];
  const keys = ['ammoStaple', 'ammoBadass', 'ammoShrapnel'];
  for (let w = 0; w < 3; w++) {
    G[keys[w]] = Math.max(0, Math.min(100, G[keys[w]]));
    let slot = -1;
    for (let i = 0; i < 12; i++) if (G.inventory[i].id === ids[w]) slot = i;
    if (slot === -1) continue;
    const ammo = G[keys[w]];
    if (HUD.prevAmmo[w] === ammo && incremental) continue;
    const x0 = 481 + findCol(slot) * 49, y0 = 201 + findRow(slot) * 49;
    const d3 = (ammo / 3) | 0;
    const p = port();
    p.moveTo(x0, y0); p.rgbFore(65535, 65535, 65535); p.lineTo(x0 + d3, y0);
    p.rgbFore(4369, 4369, 4369); p.lineTo(x0 + 33, y0);
    p.rgbFore(43690, 43690, 43690); p.paintRect([y0 + 1, x0, y0 + 4, x0 + d3]);
    p.rgbFore(21845, 21845, 21845); p.paintRect([y0 + 1, x0 + d3, y0 + 4, x0 + 33]);
    p.moveTo(x0, y0 + 4); p.rgbFore(30583, 30583, 30583); p.lineTo(x0 + d3, y0 + 4);
    p.rgbFore(39321, 39321, 39321); p.lineTo(x0 + 33, y0 + 4);
    p.moveTo(x0, y0);
    if (ammo > 0) p.rgbFore(65535, 65535, 65535); else p.rgbFore(4369, 4369, 4369);
    p.lineTo(x0, y0 + 4);
    if (ammo < 100) { p.moveTo(x0 + 33, y0); p.rgbFore(39321, 39321, 39321); p.lineTo(x0 + 33, y0 + 4); }
    if (ammo > 0) { p.moveTo(x0 + d3, y0); p.rgbFore(30583, 30583, 30583); p.lineTo(x0 + d3, y0 + 4); }
    copyStatRect([y0, x0, y0 + 6, x0 + 36]);
    HUD.prevAmmo[w] = ammo;
  }
}

register({ updateText, updateMeters, updateAmmo, getInvItem, switchInvItem, removeInvItem, updateInventory,
  copyStatRect, findInvItemFace });
