// render.js — draws a world: parallax backdrop, tile layer, animated water, every entity, the trailing partner,
// particles, glows, foreground atmosphere and the HUD. Reads the world, never changes it.
import { T, W, H, WATER, STATS, groundY, solidPx } from './world.js';
import { buildTileLayer, repaint, themeColors } from './tiles.js';
import * as S from './sprites.js';
import { drawText, ramp, hex, css, BAYER4 } from './pix.js';

let bgFactory = null;
export function setBackgroundFactory(f) { bgFactory = f; }

const WATER_COL = {
  wood: ['#3a6a7a', '#7ac0d0'], bog: ['#2e4a2a', '#8ab860'], mine: ['#c8401a', '#ffd060'], belfry: ['#2a3a6a', '#8aa8e0'],
  village: ['#2a3a5a', '#a0c0f0'], keep: ['#1e2a4a', '#6a8ac8'], bonus: ['#4a2a8a', '#c0a0ff'],
};
const DROP_COL = { gravy: '#9a6a3a', brew: '#8cf05a', pink: '#ff9ac8', holy: '#a8e8ff', wood: '#9ad0e0', bog: '#9ac870', mine: '#ffb040', belfry: '#a0b8f0', village: '#b0d0ff', keep: '#8aa8e0', bonus: '#d0b0ff' };

export function createView(g) {
  const v = { layer: buildTileLayer(g), bg: null, t0: g.frame, glow: {} };
  if (bgFactory) {
    try { v.bg = bgFactory(g.def.theme, { W, H, levelW: g.map.wpx, levelH: g.map.hpx, seed: g.def.id.length * 7 + 3 }); } catch (e) { console.error(e); v.bg = null; }
  }
  return v;
}

function glowSprite(v, col, r) {
  const key = col + r;
  if (v.glow[key]) return v.glow[key];
  const c = document.createElement('canvas');
  c.width = c.height = r * 2;
  const x = c.getContext('2d');
  const img = x.createImageData(r * 2, r * 2);
  const [cr, cg, cb] = hex(col);
  for (let y = 0; y < r * 2; y++) for (let xx = 0; xx < r * 2; xx++) {
    const d = Math.hypot(xx + 0.5 - r, y + 0.5 - r) / r;
    if (d >= 1) continue;
    let a = Math.pow(1 - d, 1.8);
    a = a > BAYER4[(y & 3) * 4 + (xx & 3)] * 0.9 ? a : a * 0.5;
    const i = (y * r * 2 + xx) * 4;
    img.data[i] = cr; img.data[i + 1] = cg; img.data[i + 2] = cb; img.data[i + 3] = Math.round(a * 150);
  }
  x.putImageData(img, 0, 0);
  return (v.glow[key] = c);
}

function spr(ctx, c, x, y, ox, oy, face = 1, alpha = 1) {
  if (!c) return;
  x = Math.round(x); y = Math.round(y);
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (face < 0) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(c, -ox, -oy); ctx.restore(); }
  else ctx.drawImage(c, x - ox, y - oy);
  if (alpha < 1) ctx.globalAlpha = 1;
}
function sprRot(ctx, c, x, y, ox, oy, a, face = 1) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(a); if (face < 0) ctx.scale(-1, 1); ctx.drawImage(c, -ox, -oy); ctx.restore();
}

export function drawWorld(ctx, g, v, opts = {}) {
  if (g.tilesDirty) { repaint(v.layer, g); g.tilesDirty = false; }
  const t = (g.frame - v.t0) / 60;
  let sx = 0, sy = 0;
  if (g.shake > 0 && !opts.noShake) { sx = Math.round(Math.sin(g.frame * 2.1) * Math.min(4, g.shake * 0.4)); sy = Math.round(Math.cos(g.frame * 1.7) * Math.min(3, g.shake * 0.3)); }
  const cx = Math.floor(g.cam.x) + sx, cy = Math.floor(g.cam.y) + sy;
  // backdrop
  if (v.bg) v.bg.drawBack(ctx, Math.max(0, cx), Math.max(0, cy), t);
  else fallbackBack(ctx, g.def.theme, cx, cy);
  // tiles
  ctx.drawImage(v.layer.canvas, cx, cy, W, H, 0, 0, W, H);

  ctx.save();
  ctx.translate(-cx, -cy);
  const vis = (e, m = 48) => e.x + e.w > cx - m && e.x < cx + W + m && e.y + e.h > cy - m && e.y < cy + H + m;
  const glows = [];
  // back-to-front groups
  for (const e of g.ents) if (e.type === 'plat' && vis(e)) drawPlat(ctx, g, e);
  for (const e of g.ents) if (vis(e)) {
    switch (e.type) {
      case 'check': spr(ctx, S.checkSprite(e.on), e.x + e.w / 2, e.y + e.h, 16, 30); if (e.on) { glows.push(['#8cf05a', e.x + e.w / 2, e.y + 6, 22]); fire(ctx, e.x + e.w / 2, e.y + e.h - 2, g.frame); } break;
      case 'goal': spr(ctx, S.goalSprite(Math.floor(g.frame / 6)), e.x + e.w / 2, e.y + e.h, 24, 38); glows.push(['#c8d8ff', e.x + e.w / 2, e.y + 2, 34]);
        if (g.frame % 10 === 0) steam(g, e); break;
      case 'shroom': spr(ctx, S.shroomSprite(g.def.theme, e.sq > 0), e.x + 8, e.y + e.h, 14, 24); break;
      case 'cannon': {
        const n = Math.round((((e.ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 16) % 16;
        const k = e.kick > 0 ? Math.sin(e.kick) * 1.5 : 0;
        const ccx = e.x + e.w / 2, ccy = e.y + e.h / 2;
        drawMount(ctx, g, e, ccx, ccy);
        const big = e.room === null ? S.artFrame('bigcannon', 'd' + n, Math.floor(g.frame / 6)) : null;
        if (big) spr(ctx, big, ccx - Math.cos(e.ang) * k, ccy - Math.sin(e.ang) * k, 28, 28);
        else spr(ctx, S.cannonSprite(n, e.room !== null ? 'bonus' : 'cannon'), ccx - Math.cos(e.ang) * k, ccy - Math.sin(e.ang) * k, 18, 18);
        if (e.room === null) glows.push(['#7aff6a', ccx, ccy, 18]);
        if (e.magic || e.mount === 'magic') { glows.push(['#b060ff', ccx, ccy, 26]); if (g.frame % 2 === 0) magic(g, e); }
        if (e.room !== null) { glows.push(['#c080ff', e.x + e.w / 2, e.y + e.h / 2, 20]); if (g.frame % 8 === 0) sparkle(g, e); }
        if (g.p.cannon === e && g.p.state === 'cannon' && !e.auto && e.room === null) {
          // aim guide: a few blinking dots along the barrel's line
          for (let i = 1; i <= 4; i++) {
            if (((g.frame >> 2) + i) % 4 === 0) continue;
            const d = 14 + i * 9;
            ctx.fillStyle = i === 4 ? '#fff6c8' : '#f0c040';
            ctx.fillRect(Math.round(e.x + e.w / 2 + Math.cos(e.ang) * d) - 1, Math.round(e.y + e.h / 2 + Math.sin(e.ang) * d) - 1, 2, 2);
          }
        }
        break;
      }
    }
  }
  for (const e of g.ents) if (vis(e)) {
    switch (e.type) {
      case 'card': { const y = e.by + Math.sin(g.frame / 16 + e.ph) * 1.5; spr(ctx, S.cardSprite(Math.floor(g.frame / 4 + e.ph * 3), Math.floor(e.x / 16 + e.y / 16)), e.x + 5, y + 16, 8, 18); glows.push(['#f0c060', e.x + 5, y + 7, 10]); break; }
      case 'deck': { const y = e.by + Math.sin(g.frame / 16) * 1.5; spr(ctx, S.deckSprite(Math.floor(g.frame / 6)), e.x + 7, y + 16, 13, 22); glows.push(['#f0c060', e.x + 7, y + 8, 16]); break; }
      case 'block': { const a = S.artFrame('obstacles', e.world, 0); if (a) spr(ctx, a, e.x + e.w / 2, e.y + e.h + 1, 24, 38); else { ctx.fillStyle = '#7a4a2a'; ctx.fillRect(e.x, e.y, e.w, e.h); } break; }
      case 'beam': { const a = S.artFrame('beams', e.world, 0); if (a) spr(ctx, a, e.x + e.w / 2, e.y + e.h / 2, 32, 12); else { ctx.fillStyle = '#5a3a2a'; ctx.fillRect(e.x, e.y, e.w, e.h); } break; }
      case 'bell': { const a = S.artFrame('bell', e.rung ? 'ring' : 'still', Math.floor(e.rung / 5)); if (a) spr(ctx, a, e.x + e.w / 2, e.y - 2, 12, 4); else { ctx.fillStyle = '#d8a840'; ctx.fillRect(e.x + 4, e.y + 4, 12, 14); } if (!e.rung) glows.push(['#ffd060', e.x + 10, e.y + 12, 14]); break; }
      case 'gate': {
        const lift = Math.min(30, e.open) / 30;
        const a = S.artFrame('gate', lift > 0 ? 'open' : 'shut', Math.min(3, Math.floor(lift * 4)));
        if (a) spr(ctx, a, e.x + e.w / 2, e.y + e.h + 2, 16, 54); else if (lift < 1) { ctx.fillStyle = '#3a3646'; ctx.fillRect(e.x, e.y - lift * e.h, e.w, e.h); }
        if (!e.open) glows.push(['#7aff6a', e.x + 8, e.y + e.h / 2, 16]);
        break;
      }
      case 'rack': { spr(ctx, S.broomRackSprite(Math.floor(g.frame / 8)), e.x + 7, e.y + e.h, 14, 38); glows.push(['#ff8ac8', e.x + 7, e.y + 4, 14]); if (g.frame % 9 === 0) sparkle(g, e); break; }
      case 'letter': { const y = e.by + Math.sin(g.frame / 14) * 2; spr(ctx, S.letterSprite(e.i, Math.floor(g.frame / 5)), e.x + 6, y + 15, 10, 18); glows.push(['#f0c040', e.x + 6, y + 8, 14]); break; }
      case 'cat': { const y = e.by + Math.sin(g.frame / 14) * 2; spr(ctx, S.catSprite(Math.floor(g.frame / 5)), e.x + 7, y + 15, 10, 18); glows.push(['#f0c040', e.x + 7, y + 8, 14]); break; }
      case 'page': if (!e.hidden) { const y = e.by + Math.sin(g.frame / 12) * 2; spr(ctx, S.pageSprite(Math.floor(g.frame / 6)), e.x + 6, y + 16, 10, 20); glows.push(['#ff9af0', e.x + 6, y + 8, 18]); } break;
      case 'pot': {
        if (e.state === 'held' && e === g.p.carry) break; // drawn with the carrier
        const who = e.kind === 'partner' && !g.partner ? (g.p.kind === 'mags' ? 'pip' : 'mags') : null;
        const rot = e.state === 'thrown' && !e.dropped && e.onGround ? 0 : 0;
        if (e.state === 'thrown' && !e.dropped && e.kind !== 'iron') sprRot(ctx, S.potSprite(e.kind, Math.floor(g.frame / 8), who), e.x + 7, e.y + 7, 14, 18, (e.roll * Math.sign(e.vx) * 0.25) % (Math.PI * 2));
        else if (e.state === 'thrown' && e.kind === 'iron' && !e.dropped) sprRot(ctx, S.potSprite(e.kind, 0, null), e.x + 7, e.y + 7, 14, 18, (e.t * Math.sign(e.vx) * 0.22) % (Math.PI * 2));
        else spr(ctx, S.potSprite(e.kind, Math.floor(g.frame / 8), who), e.x + 7, e.y + e.h, 14, 25);
        if (e.kind === 'brew') { glows.push(['#ff6a2a', e.x + 7, e.y + 2, 12]); if (g.frame % 4 === 0) g.fx.push({ k: 'ember', x: e.x + 13, y: e.y - 3, vx: 0.2, vy: -0.6, t: 0, life: 12, g: 0, a: 0, spin: 0 }); }
        if (rot) {}
        break;
      }
    }
  }
  for (const e of g.ents) if (e.type === 'enemy' && vis(e)) drawEnemy(ctx, g, e, glows);
  for (const e of g.ents) if (e.type === 'partnerPop') spr(ctx, S.witchSprite(e.kind, 'jump', 0), e.x + 6, e.y + 20, 28, 50, g.p.face);
  for (const e of g.ents) if (e.type === 'boss') drawBoss(ctx, g, e);
  drawParty(ctx, g, glows);
  for (const e of g.ents) if (e.type === 'shot' && vis(e)) drawShot(ctx, g, e, glows);
  drawFx(ctx, g, glows);
  drawWater(ctx, g, cx, cy, t);
  // glows (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (const [col, x, y, r] of glows) { const s = glowSprite(v, col, r); ctx.drawImage(s, Math.round(x - r), Math.round(y - r)); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  if (v.bg && v.bg.drawFront) v.bg.drawFront(ctx, Math.max(0, cx), Math.max(0, cy), t);
  if (!g.def.rail) foreground(ctx, g.def.theme, cx, cy, g.map.hpx);
  if (!opts.noGrade) grade(ctx, g.def.theme);
  if (!opts.noHud) drawHud(ctx, g, opts);
}

function fire(ctx, x, y, f) {
  const cols = ['#ffe070', '#ffb040', '#ff6a2a', '#c8301a'];
  for (let i = 0; i < 9; i++) {
    const ph = (f * 0.25 + i * 1.7) % 6;
    const hgt = 2 + ((i * 7 + Math.floor(f / 3)) % 4);
    const xx = Math.round(x - 6 + i * 1.5), yy = Math.round(y);
    for (let k = 0; k < hgt; k++) { ctx.fillStyle = cols[Math.min(3, Math.floor((k / hgt) * 3 + (ph > 3 ? 1 : 0)))]; ctx.fillRect(xx, yy - k, 1, 1); }
  }
}
function steam(g, e) { g.fx.push({ k: 'smoke', x: e.x + 8 + Math.random() * 16, y: e.y + 2, vx: (Math.random() - 0.5) * 0.3, vy: -0.4, t: 0, life: 40, g: 0, a: 0, spin: 0, s: 1, c: 'steam' }); }
function magic(g, e) {
  // sparkly purple magic swirling round anything that moves by itself
  const a = Math.random() * Math.PI * 2, r = e.w * 0.55;
  g.fx.push({ k: 'magic', x: e.x + e.w / 2 + Math.cos(a) * r, y: e.y + e.h / 2 + Math.sin(a) * r * 0.7, vx: -Math.sin(a) * 0.6, vy: Math.cos(a) * 0.4 - 0.2, t: 0, life: 22 + Math.random() * 14, g: 0, a: 0, spin: 0 });
}
function drawMount(ctx, g, e, cx, cy) {
  if (e.room !== null) return;
  if (e.mount === 'post') {
    const gy = groundY(g, cx, cy + 16, cy + 160, true, 1);
    const bot = gy < Infinity ? gy : cy + 120;
    ctx.fillStyle = '#2a2632'; ctx.fillRect(Math.round(cx) - 3, Math.round(cy + 10), 7, Math.round(bot - cy - 10));
    ctx.fillStyle = '#5a5668'; ctx.fillRect(Math.round(cx) - 2, Math.round(cy + 10), 2, Math.round(bot - cy - 10));
    const m = S.artFrame('mounts', 'post', 0);
    if (m) spr(ctx, m, cx, bot + 1, 28, 38);
    else { ctx.fillStyle = '#3a3646'; ctx.fillRect(Math.round(cx) - 8, Math.round(bot) - 4, 16, 4); }
  } else if (e.mount === 'chains') {
    // chains up to the ceiling or off the top of the screen
    let top = cy - 14;
    while (top > cy - 200 && !solidPx(g, cx, top - 1)) top -= 4;
    ctx.fillStyle = '#6a6678';
    for (const dx of [-9, 0, 9]) for (let y = Math.round(top); y < cy - 10; y += 3) { ctx.fillRect(Math.round(cx + dx * (1 - (y - top) / (cy - top) * 0.3)), y, 1, 2); }
    const m = S.artFrame('mounts', 'chains', 0);
    if (m) spr(ctx, m, cx, top + 4, 28, 0);
  } else if (e.mount === 'magic' && g.frame % 3 === 0) magic(g, e);
}
function sparkle(g, e) { g.fx.push({ k: 'star', x: e.x + Math.random() * e.w, y: e.y + Math.random() * e.h, vx: 0, vy: -0.3, t: 0, life: 18, g: 0, a: 0, spin: 0 }); }

function drawPlat(ctx, g, e) {
  const th = themeColors(g.def.theme);
  const x = Math.round(e.x), y = Math.round(e.y);
  const shake = e.kind === 'faller' && e.fall > 0 && e.fall < 22 ? ((g.frame >> 1) % 2 ? 1 : -1) : 0;
  const wood = e.kind === 'faller' ? th.deep : th.plank;
  // shallow top face receding behind the walking line, like the ground's
  for (let j = 0; j < 4; j++) {
    const inset = 3 - j;
    const c = th.top2[Math.max(0, 3 - j)];
    ctx.fillStyle = css(e.kind === 'faller' ? th.deep[2 + (j > 1 ? 0 : 1)] : c);
    ctx.fillRect(x + inset + shake, y - 4 + j, e.w - inset * 2, 1);
  }
  for (let i = 0; i < e.w; i++) {
    for (let j = 0; j < e.h; j++) {
      const tone = j === 0 ? 0 : j === 1 ? 1 : j < e.h - 2 ? 2 + ((i + j) % 5 === 0 ? 1 : 0) : 4;
      let c = wood[Math.min(wood.length - 1, tone + (e.kind === 'faller' ? 1 : 0))];
      if (j === e.h - 1 || i === 0 || i === e.w - 1) c = th.deep[th.deep.length - 1];
      if (e.kind === 'mover' && j === 0) c = th.top[1];
      ctx.fillStyle = css(c);
      ctx.fillRect(x + i + shake, y + j, 1, 1);
    }
  }
  if (e.kind === 'faller') {
    ctx.fillStyle = css(th.deep[5]);
    for (let i = 3; i < e.w; i += 7) ctx.fillRect(x + i + shake, y + 2, 1, e.h - 3);
  }
  if (e.kind === 'mover') {
    // little lantern underneath / rope
    ctx.fillStyle = '#ffd060';
    ctx.fillRect(x + (e.w >> 1) - 1, y + e.h, 3, 3);
  }
}

function drawEnemy(ctx, g, e, glows) {
  const kind = e.kind;
  let fi = 0;
  if (kind === 'crow' || kind === 'wasp') fi = Math.floor(e.t / (kind === 'wasp' ? 2 : 8));
  else if (kind === 'acolyte') fi = 0;
  else fi = Math.floor(e.t / (kind === 'slug' ? 12 : kind === 'bishop' ? 7 : 6));
  if (e.stun > 0) fi = 0;
  const st = { bald: kind === 'bishop' && e.hp < 2, throwing: kind === 'acolyte' && e.throwT > 0 };
  const c = S.enemySprite(kind, fi, st);
  const x = e.x + e.w / 2, y = e.y + e.h;
  if (e.flash > 0 && (g.frame >> 1) % 2) ctx.globalAlpha = 0.5;
  if (!ENEMY_FLY[kind]) shadow(ctx, x, y, e.w + 6);
  spr(ctx, c, x, y, 24, 48, e.dir);
  ctx.globalAlpha = 1;
  if (e.stun > 0 && kind !== 'deacon') {
    for (let i = 0; i < 3; i++) { const a = g.frame / 8 + i * 2.1; ctx.fillStyle = '#ffe070'; ctx.fillRect(Math.round(x + Math.cos(a) * 7), Math.round(e.y - 3 + Math.sin(a) * 2), 1, 1); }
  }
  if (kind === 'acolyte') {
    const am = S.artMeta('acolyte'), tip = am && am.candleTip && am.candleTip[st.throwing ? 'throw' : 'idle'];
    const tx = x + e.dir * (tip ? tip[0] - am.ox : st.throwing ? 3 : 6), ty = y - (tip ? am.oy - tip[1] : st.throwing ? 27 : 21) - 1;
    if (!st.throwing || e.throwT > 10) { flame(ctx, tx, ty, g.frame); glows.push(['#ff9a3a', tx, ty - 2, 18]); }
  }
  if (kind === 'rider') {
    // sparks under the cart
    if (g.frame % 3 === 0) g.fx.push({ k: 'spark', x: x - e.dir * 6, y, vx: -e.dir * 1, vy: -0.6, t: 0, life: 8, g: 0, a: 0, spin: 0 });
  }
}
function flame(ctx, x, y, f) {
  x = Math.round(x); y = Math.round(y);
  const fl = (f >> 2) % 3;
  ctx.fillStyle = '#c8301a'; ctx.fillRect(x - 2, y - 2, 5, 3);
  ctx.fillStyle = '#ff7a2a'; ctx.fillRect(x - 2 + (fl === 1 ? 1 : 0), y - 4, 4, 3);
  ctx.fillStyle = '#ffc040'; ctx.fillRect(x - 1, y - 5 - fl, 2, 4);
  ctx.fillStyle = '#fff0b0'; ctx.fillRect(x, y - 3, 1, 2);
}

function drawShot(ctx, g, e, glows) {
  if (e.kind === 'torch') {
    if (e.landed) { flame(ctx, e.x + 4, e.y + 8, g.frame); glows.push(['#ff9a3a', e.x + 4, e.y + 4, 14]); return; }
    sprRot(ctx, S.shotSprite('torch'), e.x + 4, e.y + 4, 8, 12, g.frame * 0.3);
    flame(ctx, e.x + 4, e.y + 2, g.frame); glows.push(['#ff9a3a', e.x + 4, e.y + 2, 16]);
  } else if (e.kind === 'flask') {
    if (e.landed) {
      ctx.fillStyle = 'rgba(160,230,255,0.55)';
      ctx.fillRect(Math.round(e.x), Math.round(e.y + 3), e.w, 3);
      ctx.fillStyle = '#e0f8ff';
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(e.x + ((g.frame * 0.7 + i * 7) % e.w)), Math.round(e.y + 2 - ((g.frame + i * 9) % 6) / 2), 1, 1);
      glows.push(['#80d0ff', e.x + e.w / 2, e.y + 4, 14]);
    } else { sprRot(ctx, S.shotSprite('flask'), e.x + 4, e.y + 4, 8, 12, g.frame * 0.25); glows.push(['#80d0ff', e.x + 4, e.y + 4, 10]); }
  } else if (e.kind === 'lob' || e.kind === 'arrow') {
    const x = Math.round(e.x + 4), y = Math.round(e.y + 4);
    const col = { seed: ['#f0a030', '#fff0a0'], rocket: ['#d83a3a', '#ffe070'], coin: ['#e8b030', '#fff4b0'], egg: ['#a8d8f0', '#ffb0d8'], gravy: ['#7a4a22', '#b07a40'], arrow: ['#ff5a8a', '#ffe0ec'] }[e.kind === 'arrow' ? 'arrow' : e.art] || ['#ccc', '#fff'];
    if (e.landed) { if (e.art === 'gravy') { ctx.fillStyle = col[0]; ctx.fillRect(Math.round(e.x), Math.round(e.y + 2), e.w, 4); ctx.fillStyle = col[1]; ctx.fillRect(Math.round(e.x) + 3, Math.round(e.y + 2), e.w - 6, 1); } return; }
    if (e.kind === 'arrow') { const a = Math.atan2(e.vy, e.vx); ctx.fillStyle = '#c8a070'; for (let i = 0; i < 8; i++) ctx.fillRect(Math.round(x - Math.cos(a) * i), Math.round(y - Math.sin(a) * i), 1, 1); ctx.fillStyle = col[0]; ctx.fillRect(x - 1, y - 1, 3, 3); glows.push(['#ff6a9a', x, y, 8]); return; }
    ctx.fillStyle = col[0]; ctx.fillRect(x - 3, y - 2, 6, 5); ctx.fillRect(x - 2, y - 3, 4, 7);
    ctx.fillStyle = col[1]; ctx.fillRect(x - 2, y - 2, 2, 2);
    if (e.art === 'rocket') { glows.push(['#ff8a3a', x, y + 4, 10]); if (g.frame % 2 === 0) g.fx.push({ k: 'spark', x, y: y + 4, vx: -e.vx * 0.3, vy: 0.5, t: 0, life: 10, g: 0, a: 0, spin: 0 }); }
  } else if (e.kind === 'boom') {
    const k = 1 - e.life / 24;
    ctx.fillStyle = `rgba(255,${200 - k * 120},80,${0.6 * (1 - k)})`;
    const r = 10 + k * 22;
    ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, r, 0, Math.PI * 2); ctx.fill();
    glows.push(['#ff8a3a', e.x + e.w / 2, e.y + e.h / 2, 40]);
  }
}

function drawBoss(ctx, g, b) {
  const sheet = b.kind && b.kind !== 'engine' ? 'boss_' + b.kind : null;
  if (sheet && S.artMeta(sheet)) {
    const moving = ['roll', 'swoop', 'hit'].includes(b.mode) || (b.mode === 'hop' && b.onGround);
    const anim = b.inv > 0 && b.mode === 'hit' ? 'hurt' : !b.onGround && !b.B.fly ? 'jump' : moving ? 'move' : b.mode === 'intro' || b.mode === 'slam' && b.modeT < 18 ? 'idle' : ['spit', 'rockets', 'coins', 'eggs', 'gravy', 'flask', 'arrows', 'smash', 'arm'].includes(b.mode) ? 'attack' : 'idle';
    const c = S.artFrame(sheet, anim, Math.floor(g.frame / (anim === 'move' ? 5 : 8)));
    const x = b.x + b.w / 2, y = b.y + b.h + (b.B.fly ? 10 : 0);
    if (b.inv > 0 && (g.frame >> 2) % 2 === 0) ctx.globalAlpha = 0.55;
    spr(ctx, c, x + (b.dying ? Math.sin(g.frame * 0.8) * 2 : 0), y, 64, 108, b.dir);
    ctx.globalAlpha = 1;
    if (b.B.fly) for (let i = 0; i < 2; i++) if (g.frame % 3 === 0) magic(g, b);
    return;
  }
  const fi = Math.floor((b.x / 4) % 8 + 8) % 8;
  const hurt = b.inv > 0 && (g.frame >> 2) % 2 === 0;
  const c = S.bossSprite(fi, { arm: b.arm, hurt, laugh: b.laugh > 0 });
  if (b.laugh > 0) b.laugh--;
  const x = b.x + b.w / 2, y = b.y + b.h;
  const wob = b.dying ? Math.sin(g.frame * 0.8) * 2 : 0;
  spr(ctx, c, x + wob, y, 70, 92, b.dir);
  if (b.mode === 'arm' && b.modeT < 40 && (g.frame >> 2) % 2) {
    ctx.fillStyle = '#ffe070';
    drawText(ctx, '!', x + b.dir * 30, b.y - 24, '#ffe070', { scale: 2 });
  }
}

// both witches: the leader and the partner trailing behind on the recorded path
function drawParty(ctx, g, glows) {
  const p = g.p;
  if (p.state === 'cannon' || p.state === 'warp') return;
  const cx = p.x + p.w / 2, by = p.y + p.h;
  if (p.state === 'cart') {
    const fi = Math.floor(g.frame / 6);
    const lift = S.artMeta('ridepot') ? 20 : 9;
    if (g.partner) spr(ctx, S.witchSprite(g.partner, 'cart', Math.floor(g.frame / 10) + 1), cx - 8, by - lift, 28, 50, 1);
    spr(ctx, S.witchSprite(p.kind, 'cart', Math.floor(g.frame / 10)), cx + 4, by - lift - 1, 28, 50, 1);
    const pot = S.artFrame('ridepot', p.onGround ? 'slide' : 'air', Math.floor(g.frame / 5));
    if (pot) spr(ctx, pot, cx, by + 3, 26, 42, 1); else spr(ctx, S.cartSprite(fi), cx, by + 1, 18, 26, 1);
    glows.push(['#7aff6a', cx, by - 4, 22]);
    if (p.onGround && g.frame % 2 === 0) g.fx.push({ k: 'goo', x: cx - 14 + Math.random() * 6, y: by - 2, vx: -1.2 - Math.random(), vy: -0.6 - Math.random() * 0.8, t: 0, life: 22, g: 0.15, a: 0, spin: 0 });
    return;
  }
  if (p.mount && p.state !== 'dead') {
    const bob = Math.sin(g.frame / 9) * 1.2;
    shadow(ctx, cx, groundBelow(g, p), 22);
    if (p.invuln > 0 && (g.frame >> 1) % 3 === 0) return;
    if (g.partner) spr(ctx, S.witchSprite(g.partner, 'rideBack', Math.floor(g.frame / 7) + 2), cx - p.face * 9, by - 1 + bob, 28, 50, p.face);
    spr(ctx, S.witchSprite(p.kind, p.pose === 'rideDash' ? 'rideDash' : 'ride', Math.floor(g.frame / 7)), cx, by - 1 + bob, 28, 50, p.face);
    return;
  }
  // partner
  if (g.partner && p.state !== 'dead') {
    const tr = g.trail;
    const k = Math.max(0, tr.length - 1 - 13);
    const e = tr[k];
    if (e && e.vis) {
      let fx = e.x;
      const lead = tr[tr.length - 1];
      if (Math.abs(fx - lead.x) < 13 && lead.pose !== 'jump' && lead.pose !== 'fall') fx = lead.x - lead.face * 13;
      let pose = e.pose;
      if (pose === 'roll' || pose === 'slap') pose = 'run';
      if (pose.startsWith('carry')) pose = pose === 'carryIdle' ? 'idle' : pose === 'carryJump' ? 'jump' : 'walk';
      if (pose === 'throw' || pose === 'skid') pose = 'idle';
      if (pose === 'float' && g.partner !== 'pip') pose = 'fall';
      if (Math.abs(fx - lead.x) < 15 && pose === 'walk' && Math.abs(p.vx) < 0.2) pose = 'idle';
      const spd = Math.abs(p.vx);
      if (e.ground) shadow(ctx, fx, e.y, 16);
      spr(ctx, S.witchSprite(g.partner, pose, S.witchFrame(pose, e.poseT + 7, spd)), fx, e.y, 28, 50, e.face, 1);
    }
  }
  // leader
  if (p.state !== 'dead' && p.state !== 'blast') shadow(ctx, cx, groundBelow(g, p), p.w + 8);
  if (p.invuln > 0 && (g.frame >> 1) % 3 === 0 && p.state !== 'dead') return;
  let pose = p.pose;
  if (pose === 'hidden') return;
  const fi = S.witchFrame(pose, p.poseT, p.animSpd || 0);
  if (pose === 'blast') {
    sprRot(ctx, S.witchSprite(p.kind, 'roll', Math.floor(g.frame / 2)), cx, p.y + p.h / 2, 28, p.kind === 'mags' ? 40 : 43, 0, p.face);
    return;
  }
  if (p.carry && p.kind === 'pip') { spr(ctx, S.witchSprite(p.kind, pose, fi), cx, by, 28, 50, p.face); drawCarried(ctx, g, p); return; }
  spr(ctx, S.witchSprite(p.kind, pose, fi), cx, by, 28, 50, p.face);
  if (p.carry) drawCarried(ctx, g, p);
}
// soft contact shadow on the floor (it lies in the floor's top face, so it reads as depth)
function shadow(ctx, x, y, w) {
  if (y == null) return;
  x = Math.round(x); y = Math.round(y);
  const hw = Math.round(w / 2);
  ctx.fillStyle = 'rgba(8,4,16,0.32)';
  ctx.fillRect(x - hw + 2, y - 1, hw * 2 - 4, 3);
  ctx.fillRect(x - hw, y, hw * 2, 1);
  ctx.fillStyle = 'rgba(8,4,16,0.18)';
  ctx.fillRect(x - hw - 1, y - 1, hw * 2 + 2, 3);
}
// floor height under a body, if any within 64 px (shadows shrink with height)
function groundBelow(g, b) {
  const y = groundY(g, b.x + b.w / 2, b.y + b.h - 1, b.y + b.h + 64, true, 1);
  return y < Infinity ? y : null;
}
const ENEMY_FLY = { crow: 1, wasp: 1 };
function drawCarried(ctx, g, p) {
  const e = p.carry;
  const who = e.kind === 'partner' && !g.partner ? (p.kind === 'mags' ? 'pip' : 'mags') : null;
  spr(ctx, S.potSprite(e.kind, Math.floor(g.frame / 8), who), e.x + 7, e.y + e.h, 14, 25);
}

function drawFx(ctx, g, glows) {
  for (const f of g.fx) {
    const k = f.t / f.life;
    const x = Math.round(f.x), y = Math.round(f.y);
    switch (f.k) {
      case 'dust': ctx.fillStyle = `rgba(220,200,170,${0.7 * (1 - k)})`; ctx.fillRect(x, y - 1, k < 0.5 ? 2 : 1, k < 0.5 ? 2 : 1); break;
      case 'smoke': case 'poof': {
        const r = (f.k === 'poof' ? 2 : 2) + k * (f.k === 'poof' ? 4 : 5);
        ctx.fillStyle = f.c === 'steam' ? `rgba(220,230,255,${0.25 * (1 - k)})` : f.k === 'poof' ? `rgba(240,235,250,${0.75 * (1 - k)})` : `rgba(90,80,100,${0.5 * (1 - k)})`;
        ctx.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), Math.round(r), Math.round(r));
        break;
      }
      case 'spark': ctx.fillStyle = f.c === 'card' ? (k < 0.5 ? '#fff4c8' : '#f0b840') : k < 0.4 ? '#fff6c0' : '#ffb040'; ctx.fillRect(x, y, 1, 1); if (f.c === 'card' && k < 0.3) glows.push(['#f0c060', x, y, 6]); break;
      case 'star': {
        const col = k < 0.5 ? '#fff8d0' : '#f0c040';
        ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
        if (k < 0.6) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
        break;
      }
      case 'splash': {
        const a = S.artFrame('splash', 'pop', Math.floor(k * 8));
        if (a) spr(ctx, a, x, y, 28, 44);
        else { ctx.fillStyle = `rgba(122,255,106,${0.8 * (1 - k)})`; const r = 4 + k * 12; ctx.fillRect(Math.round(x - r), Math.round(y - r * 0.6), Math.round(r * 2), Math.round(r)); }
        if (k < 0.5) glows.push(['#7aff6a', x, y - 8, 22]);
        break;
      }
      case 'goo': ctx.fillStyle = k < 0.5 ? '#b8ff9a' : '#5ad84a'; ctx.fillRect(x, y, k < 0.6 ? 2 : 1, 2); break;
      case 'magic': {
        const tw = (f.t >> 1) % 3;
        ctx.fillStyle = tw === 0 ? '#f0d8ff' : tw === 1 ? '#c080ff' : '#8a40e8';
        ctx.fillRect(x, y, 1, 1);
        if (k < 0.5 && tw === 0) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
        if (k < 0.3) glows.push(['#a050ff', x, y, 6]);
        break;
      }
      case 'drop': ctx.fillStyle = DROP_COL[f.c] || '#9ad0e0'; ctx.fillRect(x, y, 1, k < 0.6 ? 2 : 1); break;
      case 'shard': sprRot(ctx, S.shardSprite(f.kind, f.t % 3), x, y, 4, 4, f.a); break;
      case 'rubble': { const th = themeColors(f.c || g.def.theme); ctx.fillStyle = css(th.fill[(f.t >> 3) % 3 + 1]); ctx.fillRect(x - 1, y - 1, 3, 3); ctx.fillStyle = css(th.deep[5]); ctx.fillRect(x + 1, y + 1, 1, 1); break; }
      case 'fire': { const r = 1 + Math.round((1 - k) * 2); ctx.fillStyle = k < 0.3 ? '#fff0b0' : k < 0.6 ? '#ffb040' : '#c8401a'; ctx.fillRect(x - r, y - r, r * 2, r * 2); if (k < 0.4) glows.push(['#ff8a3a', x, y, 10]); break; }
      case 'ember': ctx.fillStyle = (f.t >> 1) % 2 ? '#ffb040' : '#ff6a2a'; ctx.fillRect(x, y, 1, 1); break;
      case 'bubble': { ctx.fillStyle = '#b8ff8a'; ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1); break; }
      case 'trail': { ctx.fillStyle = `rgba(255,240,200,${0.35 * (1 - k)})`; const r = 4 * (1 - k) + 1; ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2)); break; }
      case 'text': drawText(ctx, f.txt, x, y, '#fff6c8', { align: 'center' }); break;
      case 'corpse': {
        const c = S.enemySprite(f.kind, 0, {});
        ctx.save(); ctx.translate(x, y - 10); ctx.rotate(Math.PI + f.a); if (f.face < 0) ctx.scale(-1, 1); ctx.drawImage(c, -24, -38); ctx.restore();
        break;
      }
      case 'flee': {
        if (f.kind === 'finder') { spr(ctx, S.finderSprite(Math.floor(f.t / 5)), x, y, 20, 44, f.vx > 0 ? 1 : -1); break; }
        if (f.kind === 'broom') { sprRot(ctx, S.broomSprite(), x, y - 6, 16, 6, f.t * 0.25 * f.face); break; }
        const c = S.witchSprite(f.kind, 'flee', 0);
        sprRot(ctx, c, x, y - 10, 28, 40, Math.sin(f.t / 6) * 0.2, f.face);
        if (f.t % 3 === 0) g.fx.push({ k: 'star', x: f.x - f.face * 8, y: f.y - 6, vx: 0, vy: 0.2, t: 0, life: 12, g: 0, a: 0, spin: 0 });
        break;
      }
      default: break;
    }
  }
}

function drawWater(ctx, g, cx, cy, t) {
  const m = g.map;
  const c0 = Math.max(0, Math.floor(cx / T)), c1 = Math.min(m.cols - 1, Math.floor((cx + W) / T));
  const r0 = Math.max(0, Math.floor(cy / T)), r1 = Math.min(m.rows - 1, Math.floor((cy + H) / T));
  const [deep, hi] = WATER_COL[g.def.theme] || WATER_COL.wood;
  const lava = g.def.theme === 'mine';
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (m.t[r * m.cols + c] !== WATER) continue;
    const top = r === 0 || m.t[(r - 1) * m.cols + c] !== WATER;
    const x = c * T, y = r * T;
    ctx.fillStyle = lava ? 'rgba(200,64,26,0.92)' : hexA(deep, 0.78);
    ctx.fillRect(x, y + (top ? 6 : 0), T, T - (top ? 6 : 0));
    if (top) {
      for (let i = 0; i < T; i++) {
        const wy = Math.round(Math.sin((x + i) / 5 + t * 2.4) * 1.2 + Math.sin((x + i) / 2.3 - t * 3.1) * 0.6);
        ctx.fillStyle = hi; ctx.fillRect(x + i, y + 6 + wy, 1, 1);
        ctx.fillStyle = hexA(hi, 0.4); ctx.fillRect(x + i, y + 7 + wy, 1, 1);
      }
      if (lava && ((c * 7 + Math.floor(t * 4)) % 11) === 0) { ctx.fillStyle = '#ffe080'; ctx.fillRect(x + 7, y + 4 - Math.floor((t * 8) % 3), 2, 2); }
      if (!lava && ((c * 5 + Math.floor(t * 2)) % 13) === 0) { ctx.fillStyle = hexA(hi, 0.7); ctx.fillRect(x + 4, y + 9, 5, 1); }
    }
    if (lava) { ctx.fillStyle = 'rgba(255,170,60,0.25)'; ctx.fillRect(x, y + 10 + Math.round(Math.sin(t * 2 + c) * 2), T, 2); }
  }
}
function hexA(h, a) { const [r, gg, b] = hex(h); return `rgba(${r},${gg},${b},${a})`; }

function fallbackBack(ctx, theme, cx, cy) {
  const pre = theme.split('_')[0];
  const HC = { hallo: ['#1a0e24', '#e07a3a'], july: ['#0e1430', '#4a3a6a'], pat: ['#7ac8f0', '#d8f0d0'], easter: ['#b8e0ff', '#fff0f8'], val: ['#5a2a5a', '#ffa0a0'], thanks: ['#3a2a4a', '#ffb060'], xmas: ['#0a1430', '#3a5a8a'] }[pre];
  if (HC) { const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, HC[0]); gr.addColorStop(1, HC[1]); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); return; }
  const top = { wood: '#3a2448', bog: '#1e3a34', mine: '#1a1418', belfry: '#141a3a', village: '#141a30', keep: '#1a1624', bonus: '#2a1050' }[theme] || '#222';
  const bot = { wood: '#e08a4a', bog: '#6a8a5a', mine: '#3a2420', belfry: '#4a5a8a', village: '#3a3a5a', keep: '#3a3048', bonus: '#6a3ac0' }[theme] || '#444';
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top); gr.addColorStop(1, bot);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------------------------------------------
// HUD
export function drawHud(ctx, g, opts = {}) {
  const show = opts.paused;
  const run = g.run;
  // tarot cards
  const wa = show ? 1 : Math.min(1, g.hud.cards / 20);
  if (wa > 0) {
    const y = Math.round(-14 + wa * 22);
    spr(ctx, S.cardSprite(0, 0), 13, y + 13, 8, 18);
    drawText(ctx, String(run.cards), 24, y + 2, '#fff0c0', { scale: 1, outline: true });
  }
  // lives (portrait of the leader, partner behind)
  const la = show ? 1 : Math.min(1, g.hud.lives / 20);
  if (la > 0) {
    const x = Math.round(W + 40 - la * 80);
    if (g.partner) spr(ctx, S.witchSprite(g.partner, 'idle', 0), x - 6, 36, 28, 50, 1);
    spr(ctx, S.witchSprite(g.p.kind, 'idle', 0), x + 4, 38, 28, 50, 1);
    drawText(ctx, 'x' + run.lives, x + 16, 22, '#fff6c8', { outline: true });
  }
  // letters
  const lta = show ? 1 : Math.min(1, g.hud.letters / 20);
  if (lta > 0 && !g.bonus) {
    const y = Math.round(-14 + lta * 22);
    for (let i = 0; i < 4; i++) {
      const x = W / 2 - 30 + i * 16;
      if (g.letters[i]) spr(ctx, S.letterSprite(i, 0), x + 6, y + 15, 10, 18);
      else { ctx.fillStyle = 'rgba(20,10,30,0.6)'; ctx.fillRect(x, y + 1, 12, 13); ctx.fillStyle = 'rgba(240,192,64,0.35)'; ctx.fillRect(x + 1, y + 2, 10, 11); }
    }
  }
  // bonus timer
  if (g.bonus && !g.bonus.done) {
    const s = Math.ceil(g.bonus.left / 60);
    drawText(ctx, String(s), W / 2, 8, s <= 3 ? '#ff6a6a' : '#fff6c8', { align: 'center', scale: 2, outline: true });
    if (g.stateT < 120) drawText(ctx, g.bonus.kind === 'collect' ? 'GRAB EVERY WISP!' : g.bonus.kind === 'stomp' ? 'BOP THEM ALL!' : 'GET THE PAGE!', W / 2, 30, '#ffe070', { align: 'center', outline: true });
  }
  if (g.bonus && g.bonus.done) {
    drawText(ctx, g.bonus.result === 'win' ? 'SPELLBOOK PAGE!' : 'TOO SLOW!', W / 2, 60, g.bonus.result === 'win' ? '#ffe070' : '#ff8a8a', { align: 'center', scale: 2, outline: true });
  }
  // boss pips
  const boss = g.ents.find((e) => e.type === 'boss');
  if (boss && !boss.dying && boss.mode !== 'intro') {
    for (let i = 0; i < boss.maxHp; i++) {
      const x = W / 2 - boss.maxHp * 6 + i * 12;
      ctx.fillStyle = '#170c1e'; ctx.fillRect(x, 6, 10, 8);
      ctx.fillStyle = i < boss.hp ? '#d84a4a' : '#4a3a4a'; ctx.fillRect(x + 1, 7, 8, 6);
      if (i < boss.hp) { ctx.fillStyle = '#ff9a8a'; ctx.fillRect(x + 1, 7, 8, 1); }
    }
  }
}

export { spr, sprRot };

// ---------------------------------------------------------------------------------------------------------------
// Atmosphere: dark foreground silhouettes sliding past faster than the camera, then a per-theme grade
// (soft-light tint from the sky down, multiplied vignette) so sprites, tiles and backdrop sit in one light.
const GRADE = {
  wood: ['#4a2440', '#ffb47a'], bog: ['#16302c', '#c8e8a8'], mine: ['#2a0e0a', '#ff9a5a'], belfry: ['#141a3a', '#b8ccff'],
  village: ['#141a36', '#ffd49a'], keep: ['#160f1c', '#ffb878'], bonus: ['#240c48', '#e8b8ff'],
};
const gradeCache = {};
const GRADE_PRE = { hallo: ['#2a1030', '#ffa060'], july: ['#14183a', '#ffd0a0'], pat: ['#1a3020', '#fff0c0'], easter: ['#4a3a5a', '#fff4e0'], val: ['#3a1030', '#ffc0c8'], thanks: ['#2a1810', '#ffc070'], xmas: ['#101a3a', '#d0e0ff'] };
function gradeLayers(theme) {
  if (gradeCache[theme]) return gradeCache[theme];
  const [shadow, lightC] = GRADE[theme] || GRADE_PRE[theme.split('_')[0]] || GRADE.wood;
  const vig = document.createElement('canvas'); vig.width = W; vig.height = H;
  let x = vig.getContext('2d');
  const rg = x.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.5, W * 0.62);
  rg.addColorStop(0, '#ffffff'); rg.addColorStop(1, shadow);
  x.fillStyle = rg; x.fillRect(0, 0, W, H);
  const tint = document.createElement('canvas'); tint.width = W; tint.height = H;
  x = tint.getContext('2d');
  const lg = x.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, lightC); lg.addColorStop(0.55, '#808080'); lg.addColorStop(1, shadow);
  x.fillStyle = lg; x.fillRect(0, 0, W, H);
  return (gradeCache[theme] = { vig, tint });
}
function grade(ctx, theme) {
  const L = gradeLayers(theme);
  ctx.save();
  ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'soft-light'; ctx.drawImage(L.tint, 0, 0);
  ctx.globalAlpha = 0.85; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(L.vig, 0, 0);
  ctx.restore();
}

const FG_W = 1024, fgCache = {};
function foregroundStrip(theme) {
  if (fgCache[theme] !== undefined) return fgCache[theme];
  const c = document.createElement('canvas'); c.width = FG_W; c.height = 70;
  const x = c.getContext('2d');
  const pre = theme.split('_')[0];
  const dark = { hallo_out: '#0e0610', july_out: '#060a12', pat_out: '#061008', easter_out: '#1a1020', val_out: '#14060e', thanks_out: '#140a06', xmas_out: '#060a16', wood: '#120814', bog: '#06120e', mine: '#0c0606', belfry: '#080a18', village: '#0a0c1c', keep: '#0a070e', bonus: '#120628' }[theme] || '#0a0a0a';
  const rim = { wood: '#5a2a3a', bog: '#2a4a3a', mine: '#5a2010', belfry: '#2a3a6a', village: '#3a4a7a', keep: '#3a2a3a', bonus: '#5a3a9a' }[theme] || '#333';
  let s = theme.length * 977;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const blob = (fill) => { x.fillStyle = fill; x.fill(); };
  for (let i = 0; i < 7; i++) {
    const bx = 40 + i * (FG_W / 7) + rnd() * 60, kind = rnd();
    x.beginPath();
    const outdoor = /_out$/.test(theme);
    if (theme === 'wood' || theme === 'bog' || theme === 'bonus' || outdoor) {
      // fern / reed clump: fronds fanning up from the bottom
      const n = 5 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.2, len = 34 + rnd() * 30;
        const ex = bx + Math.cos(a) * len, ey = 70 + Math.sin(a) * len;
        x.moveTo(bx - 3, 70); x.quadraticCurveTo(bx + Math.cos(a) * len * 0.5 - 6, 70 + Math.sin(a) * len * 0.6, ex, ey);
        x.quadraticCurveTo(bx + Math.cos(a) * len * 0.5 + 6, 70 + Math.sin(a) * len * 0.6, bx + 3, 70);
      }
      if (theme === 'bog' && kind > 0.5) { x.rect(bx + 14, 18, 2, 52); x.ellipse(bx + 15, 16, 2.5, 6, 0, 0, Math.PI * 2); }
    } else if (theme === 'mine') {
      x.moveTo(bx - 40, 70); x.lineTo(bx - 26, 40); x.lineTo(bx - 6, 30); x.lineTo(bx + 18, 44); x.lineTo(bx + 40, 70);
      if (kind > 0.5) { x.rect(bx + 50, 10, 6, 60); x.rect(bx + 40, 14, 26, 5); }
    } else if (theme === 'village') {
      for (let k = 0; k < 5; k++) x.rect(bx + k * 12, 36 - (k % 2) * 4, 5, 40);
      x.rect(bx - 4, 46, 64, 4); x.rect(bx - 4, 60, 64, 4);
    } else {
      // keep / belfry: column bases and rubble
      if (kind > 0.4) { x.rect(bx, 40, 16, 30); x.rect(bx - 3, 36, 22, 5); x.rect(bx - 5, 64, 26, 6); }
      x.moveTo(bx + 60, 70); x.lineTo(bx + 70, 56); x.lineTo(bx + 84, 60); x.lineTo(bx + 92, 70);
    }
    blob(dark);
    // faint rim light on top edges
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = rim;
    x.fillRect(bx - 60, 0, 140, 2);
    x.globalCompositeOperation = 'source-over';
  }
  // quantise alpha to hard edges
  const d = x.getImageData(0, 0, FG_W, 70);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
  x.putImageData(d, 0, 0);
  return (fgCache[theme] = c);
}
function foreground(ctx, theme, camX, camY, levelH) {
  const strip = foregroundStrip(theme);
  if (!strip) return;
  // only show when the camera is near the bottom of the level, so it never covers play higher up
  const fromBottom = levelH - (camY + H);
  if (fromBottom > 40) return;
  const ox = -Math.floor((camX * 1.35) % FG_W);
  const y = H - 46 + Math.max(0, fromBottom);
  ctx.drawImage(strip, ox, y); ctx.drawImage(strip, ox + FG_W, y);
}
