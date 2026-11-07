// Draws a game state into a 320×180 buffer. Everything lands on whole pixels.

import { PAL, drawText, textWidth, ICONS, makeBossSprites, BOSS_DIRS, BOSS_SIZE, tinted, hash, newCanvas, lookKey } from './art.js';
import { W, H, LEASH, CLASS, ADDS, SLOT_KEYS, RAID_LAPS, FINAL_LAPS, angDiff, pathDist, pathNearest, zoneFace, beamEnd, destRock } from './world.js';
import { LEVELS } from './levels/index.js';
import { KINDS, CRITTERS } from './props.js';

// what the levels know how to draw: their props, animals, adds and the animals' bodies
const PROP_ART = Object.assign({}, ...LEVELS.map(L => L.art?.props || {}));
const CRITTER_ART = Object.assign({}, ...LEVELS.map(L => L.art?.critters || {}));
const LEVEL_ADD_ART = Object.assign({}, ...LEVELS.map(L => L.art?.adds || {}));
const CORPSE_ART = Object.assign({}, ...LEVELS.map(L => L.art?.corpses || {}));
// the camera for this frame (world pixels of the screen's top-left), and a sprite cache the level art can use
const VIEW = { x: 0, y: 0 };
// Painting sprites pixel by pixel is slow, and a toppling tower can ask for dozens at once, so each frame gets a few
// milliseconds of it. Past that, a missing sprite borrows the last one painted with the same name prefix and size
// ('cb|castle_wall|…' → 'cb|castle_wall') and gets painted properly on a later frame.
const sprites = new Map(), similar = new Map();
let spriteBudget = 0;
function sprite(key, w, h, paint) {
  let c = sprites.get(key);
  if (c) return c;
  const pre = key.split('|', 2).join('|') + '#' + w + 'x' + h;
  if (spriteBudget <= 0 && similar.has(pre)) return similar.get(pre);
  const t0 = performance.now();
  c = newCanvas(w, h); paint(c.getContext('2d'));
  sprites.set(key, c); similar.set(pre, c);
  spriteBudget -= performance.now() - t0;
  return c;
}
const onScreen = (x, y, m = 30) => x > VIEW.x - m && x < VIEW.x + W + m && y > VIEW.y - m && y < VIEW.y + H + m;

const TAU = Math.PI * 2;

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = t => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// each map's ground, path, trees and flowers
const THEME_PAL = {
  clearing: { grass: [PAL.grass0, PAL.grass1, PAL.grass2, PAL.grass3], tuft: [PAL.tuft, PAL.tuftHi], canopy: [PAL.canopy0, PAL.canopy1, PAL.canopy2, PAL.canopy3],
    dirt: [PAL.dirt0, PAL.dirt1, PAL.dirt2, PAL.dirt3], flowers: [PAL.cream, PAL.yellow, PAL.pink, PAL.frost] },
  autumn: { grass: ['#3a2a16', '#4a3519', '#5c4220', '#6e5126'], tuft: ['#8a5a22', '#b06f26'], canopy: ['#1c0e08', '#4a1a0e', '#7a2c12', '#b0501c'],
    dirt: ['#33251a', '#4a3825', '#5e4830', '#72583a'], flowers: [PAL.gold, PAL.red, PAL.orange] },
  ash: { grass: ['#24221e', '#2c2a25', '#35322c', '#3f3b34'], tuft: ['#4a463e', '#5a554b'], canopy: ['#0b0a09', '#161412', '#211e1b', '#2e2a25'],
    dirt: ['#1a1714', '#26221e', '#322d27', '#3e3830'], flowers: ['#ff6a2a', '#ffb02e', '#c0392b'] },
  snow: { grass: ['#aab8c3', '#bccad4', '#cfdbe3', '#e2eaf0'], tuft: ['#93a5b3', '#a3b4c1'], canopy: ['#0b1812', '#13261d', '#1d382a', '#dfe8ee'],
    dirt: ['#6e6459', '#83786b', '#968a7c', '#a99d8e'], flowers: ['#ffffff', '#9fd8ff'] },
};


export function createRenderer() {
  const buf = newCanvas(W, H), ctx = buf.getContext('2d');
  const shadow = makeShadow();
  let trail = newCanvas(W, H), tctx = trail.getContext('2d');
  let boss = null, bg = null, fg = null, bgFor = null, clouds = null, grade = null;

  function render(g, view = {}) {
    if (!boss || boss.key !== lookKey(g.look)) boss = makeBossSprites(g.look);
    const m = g.map, art = m.level.art || {};
    if (bgFor !== m) {
      bg = m.mode === 'patrol' ? makeBackground(m) : makeGround(m);
      if (art.decorate) art.decorate(bg.getContext('2d'), m, H_ART);
      fg = art.canopy ? makeForeground(m.theme.id) : null;
      bgFor = m;
      trail = newCanvas(m.w, m.h); tctx = trail.getContext('2d');
      clouds = makeClouds(m.seed); grade = makeGrade(m.theme.id);
    }
    const fx = THEME_FX[m.theme.id] || THEME_FX.clearing;
    VIEW.x = Math.round(g.cam.x); VIEW.y = Math.round(g.cam.y);
    spriteBudget = 6;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const s = g.shake > 0 ? Math.ceil(g.shake * 4) : 0;
    const ox = s ? ((Math.floor(g.t * 40) % 2) ? s : -s) : 0, oy = s ? ((Math.floor(g.t * 33) % 2) ? s : -s) * 0.6 : 0;
    ctx.fillStyle = PAL.night; ctx.fillRect(0, 0, W, H);
    ctx.translate(Math.round(ox) - VIEW.x, Math.round(oy) - VIEW.y);
    ctx.drawImage(bg, 0, 0);
    // scorch marks are painted into the persistent ground layer once
    for (const a of g.ashes) if (!a.stamped) { a.stamped = true; stampAsh(tctx, a); }

    // footprints wear the path in over time
    for (const st of g.steps) {
      const px = -Math.sin(st.face), py = Math.cos(st.face), sd = st.side ? 6 : -6;
      tctx.fillStyle = 'rgba(40,30,18,0.16)';
      tctx.fillRect(Math.round(st.x + px * sd + Math.cos(st.face) * 3), Math.round(st.y + py * sd + Math.sin(st.face) * 3), 2, 2);
    }
    g.steps.length = 0;
    ctx.drawImage(trail, 0, 0);

    if (g.water) drawWater(ctx, g);
    art.under?.(ctx, g, H_ART);
    for (const i of g.ice) drawIce(ctx, i, g);
    drawFires(ctx, g);
    drawTelegraph(ctx, g);
    for (const c of g.corpses) if (onScreen(c.x, c.y)) drawCorpse(ctx, c);
    for (const r of g.rings) if (r.col !== 'slash') drawRing(ctx, r);
    const patrol = m.mode === 'patrol';
    if (patrol && !g.clear) drawMarker(ctx, g, false);

    // a dark outline round every hero, so the little ones read on any ground
    ctx.globalAlpha = 0.55;
    for (const u of g.units) if (u.role !== 'rider' && onScreen(u.x, u.y, 8)) for (const [dx, dy] of HALO) { ctx.translate(dx, dy); drawUnit(ctx, u, g, PAL.ink); ctx.translate(-dx, -dy); }
    ctx.globalAlpha = 1;

    // y-sorted: adventurers, loose horses, adds, the boss
    const list = [];
    for (const u of g.units) {
      if (u.role === 'rider') {
        if (!u.mounted) list.push({ y: u.horse.y, f: () => drawHorse(ctx, u.horse.x, u.horse.y, u.horse.face, u.horse.walk, false, g.t) });
        if (u.state !== 'climb') list.push({ y: u.y, f: () => drawRider(ctx, u, g) });
      } else list.push({ y: u.y, f: () => drawUnit(ctx, u, g) });
    }
    for (const p of g.parts) if (p.horse) list.push({ y: p.y, f: () => drawHorse(ctx, p.x, p.y, p.face, p.walk, false, g.t) });
    for (const a of g.adds) list.push({ y: a.y, f: () => drawAdd(ctx, a, g) });
    // scenery: fallen things lie under everybody, standing things sort by their foot
    for (const p of g.props) {
      if (p.state === 'gone' || !onScreen(p.x, p.y, 40)) continue;
      const draw = PROP_ART[p.kind];
      if (!draw) continue;
      list.push({ y: p.state === 'down' ? p.y - 40 : p.y + (p.h ? p.h / 2 : 0) + (p.sortY || 0), f: () => { draw(ctx, p, g, H_ART); if (p.burning) drawFlames(ctx, p, g.t); } });
    }
    for (const c of g.critters) if (onScreen(c.x, c.y)) list.push({ y: c.y, f: () => (CRITTER_ART[c.kind] || drawCritter)(ctx, c, g, H_ART) });
    list.push({ y: g.boss.y + 2, f: () => drawBoss(ctx, g) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.f();
    for (const u of g.units) if (u.role === 'rider' && u.state === 'climb') drawClimber(ctx, u, g);
    art.over?.(ctx, g, H_ART);
    if (patrol && !g.clear) drawMarker(ctx, g, true);

    drawBeam(ctx, g);
    for (const o of g.bolts) drawBolt(ctx, o);
    for (const r of g.rings) if (r.col === 'slash') drawSlash(ctx, r);
    for (const p of g.parts) if (!p.horse && onScreen(p.x, p.y, 4)) drawPart(ctx, p);
    // cloud shadows drift over the field (anchored to the world, so they scroll with it), then everything that glows
    // adds its light on top
    const cx = -wrap(Math.floor(g.t * 3 + (view.bare ? performance.now() / 300 : 0)) + VIEW.x, W), cy = -wrap(VIEW.y, H);
    ctx.globalAlpha = fx.cloud;
    for (const qx of [0, W]) for (const qy of cy ? [0, H] : [0]) ctx.drawImage(clouds, VIEW.x + cx + qx, VIEW.y + cy + qy);
    ctx.globalAlpha = 1;
    drawLights(ctx, g);
    if (fg) ctx.drawImage(fg, VIEW.x, VIEW.y);
    // the weather and the vignette belong to the screen, not the world
    ctx.setTransform(1, 0, 0, 1, Math.round(ox), Math.round(oy));
    drawWeather(ctx, g, fx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(grade, 0, 0);
    ctx.setTransform(1, 0, 0, 1, Math.round(ox) - VIEW.x, Math.round(oy) - VIEW.y);
    for (const o of g.ghosts) drawGhost(ctx, o);
    for (const t of g.texts) {
      const k = t.t / t.life, a = k > 0.7 ? (1 - k) / 0.3 : 1;
      drawText(ctx, t.s, t.x, t.y - k * 10, t.col, { align: 'center', alpha: a });
    }
    for (const k of g.barks) drawBark(ctx, k);
    if (g.thought && !g.boss.dead) drawThought(ctx, g);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!view.bare) drawHud(ctx, g, view);
    if (view.cursor) drawCursor(ctx, view.mx, view.my, g);
    return buf;
  }

  function drawBoss(ctx, g) {
    const b = g.boss;
    const a = ((b.face % TAU) + TAU) % TAU;
    const dir = Math.round(a / TAU * BOSS_DIRS) % BOSS_DIRS;
    const act = b.act;
    const mouth = act && (act.kind === 'breath' || act.kind === 'roar' || act.kind === 'beam' || act.kind === 'summon') ? 1 : 0;
    let frame = b.moving ? Math.floor(b.walk / 2.2) % 4 : 0;
    let lift = 0, jx = 0;
    if (act?.kind === 'stomp' && !act.fired) lift = -Math.round(act.t / g.abil.stomp.wind * 3);
    if (act?.kind === 'charge' && !act.fired) jx = -Math.round(Math.cos(b.face) * 2);
    if (act?.kind === 'shake') { jx = (Math.floor(act.t * 30) % 2) ? 1 : -1; frame = Math.floor(act.t * 20) % 4; }
    if (act?.kind === 'beam' && !act.fired) jx = (Math.floor(act.t * 24) % 2) ? 1 : 0;
    const x = Math.round(b.x) - BOSS_SIZE / 2 + jx, y = Math.round(b.y) - BOSS_SIZE / 2;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(shadow, Math.round(b.x) - 14, Math.round(b.y) - 9);
    ctx.globalAlpha = 1;
    // zoomies leave afterimages; so does a lot of Fast Travel
    const ghosts = (b.haste > 0 ? 1 : 0) + ((g.look.speed || 0) >= 2 ? g.look.speed - 1 : 0);
    if (ghosts && b.moving && !b.dead) {
      const back = boss.get(dir, frame), col = b.haste > 0 ? PAL.gold : PAL.beam;
      for (let k = ghosts; k >= 1; k--) {
        ctx.globalAlpha = 0.2 / k;
        ctx.drawImage(tinted(back, col), x - Math.round(Math.cos(b.face) * 6 * k), y - Math.round(Math.sin(b.face) * 6 * k));
      }
      ctx.globalAlpha = 1;
    }
    const spr = boss.get(dir, mouth * 4 + frame);
    if (b.evade) ctx.globalAlpha = (Math.floor(g.t * 12) % 2) ? 0.55 : 0.85;
    ctx.drawImage(spr, x, y + lift);
    if (b.dead) { ctx.globalAlpha = Math.min(0.6, b.deadT * 0.4); ctx.drawImage(tinted(spr, PAL.rock0), x, y); }
    else if (b.flash > 0) { ctx.globalAlpha = 0.55; ctx.drawImage(tinted(spr, '#ffffff'), x, y + lift); }
    else if (act?.kind === 'beam') { ctx.globalAlpha = act.fired ? 0.35 : Math.min(0.6, act.t / g.abil.beam.wind * 0.6) * (0.6 + 0.4 * Math.sin(g.t * 40)); ctx.drawImage(tinted(spr, PAL.beam), x, y + lift); }
    else if (act?.kind === 'summon') { ctx.globalAlpha = 0.3; ctx.drawImage(tinted(spr, PAL.shadow), x, y + lift); }
    ctx.globalAlpha = 1;
    if (!b.dead) drawSticker(ctx, b, lift);
    // a taunt is a tether to the tank who did it
    if (b.taunt && !b.dead) {
      const u = b.taunt.u, n = Math.ceil(Math.hypot(u.x - b.x, u.y - b.y) / 2);
      ctx.fillStyle = PAL.red;
      for (let i = 1; i < n; i++) if ((i + Math.floor(g.t * 20)) % 3) ctx.fillRect(Math.round(b.x + (u.x - b.x) * i / n), Math.round(b.y + (u.y - b.y) * i / n), 1, 1);
    }
    // the weak spot on the back glows; it flares when someone is up there
    if (!b.dead) {
      const c = Math.cos(b.face), sn = Math.sin(b.face);
      const sx = Math.round(b.x - 4 * c), sy = Math.round(b.y - 4 * sn) + lift;
      const climbed = g.units.some(u => u.role === 'rider' && u.state === 'climb');
      const pulse = climbed ? (Math.floor(g.t * 8) % 2) : (Math.sin(g.t * 2.5) > 0.2 ? 1 : 0);
      ctx.fillStyle = PAL.sigil;
      ctx.globalAlpha = climbed ? 0.9 : 0.55 + pulse * 0.3;
      ctx.fillRect(sx, sy, 1, 1);
      if (pulse) { ctx.globalAlpha *= 0.5; ctx.fillRect(sx - 1, sy, 1, 1); ctx.fillRect(sx + 1, sy, 1, 1); ctx.fillRect(sx, sy - 1, 1, 1); ctx.fillRect(sx, sy + 1, 1, 1); }
      ctx.globalAlpha = 1;
    }
  }

  // the sequel decal: a little upright "2" sticker slapped on the boss's rump
  function drawSticker(ctx, b, lift) {
    const c = Math.cos(b.face), sn = Math.sin(b.face);
    const sx = Math.round(b.x - 12 * c + 4 * sn) - 2, sy = Math.round(b.y - 12 * sn - 4 * c) - 3 + lift;
    ctx.fillStyle = PAL.ink; ctx.fillRect(sx + 1, sy + 7, 5, 1); ctx.fillRect(sx + 5, sy + 1, 1, 6);   // a drop shadow, not a frame
    ctx.fillStyle = PAL.cream; ctx.fillRect(sx, sy, 5, 7);
    drawText(ctx, '2', sx + 1, sy + 1, PAL.red, { shadow: false });
  }

  function reset() { tctx.clearRect(0, 0, W, H); }

  return { buf, render, reset };
}

// a still of the boss for the store: one look, one heading, drawn at 1 px per pixel
const previews = new Map();
export function bossPreview(look, dir, frame = 0) {
  const k = lookKey(look);
  if (!previews.has(k)) previews.set(k, makeBossSprites(look));
  return previews.get(k).get(dir, frame);
}

// ------------------------------------------------------------------------------------------------ level art support

// what level art gets to draw with
const H_ART = { px: (ctx, x, y, c) => px(ctx, x, y, c), PAL, hash, vnoise, drawText, sprite, tinted, ring: (...a) => ring(...a), textWidth, VIEW, W, H };

// a level's whole world, painted once by its ground() art
function makeGround(m) {
  const c = newCanvas(m.w, m.h), x = c.getContext('2d');
  x.fillStyle = PAL.grass1; x.fillRect(0, 0, m.w, m.h);
  m.level.art?.ground?.(x, m, H_ART);
  return c;
}

function stampAsh(c, a) {
  const R = Math.ceil(a.r) + 1;
  for (let py = -R; py <= R; py++) for (let qx = -R; qx <= R; qx++) {
    const inside = a.w ? Math.abs(qx) <= a.w / 2 + 1 && Math.abs(py) <= a.h / 2 + 1 : Math.hypot(qx, py) <= a.r;
    if (!inside) continue;
    const h = hash(qx + a.seed, py + Math.round(a.x));
    if (h < 0.25) continue;
    c.fillStyle = h > 0.92 ? '#5a5248' : h > 0.6 ? '#1c1814' : '#2a241e';
    c.fillRect(Math.round(a.x) + qx, Math.round(a.y) + py, 1, 1);
  }
}

// open water ripples; filled cells are a heap of rubble you can walk on
function drawWater(ctx, g) {
  const w = g.water, cs = w.cs, fr = Math.floor(g.t * 3);
  const c0 = Math.max(0, Math.floor(VIEW.x / cs)), c1 = Math.min(w.cols - 1, Math.ceil((VIEW.x + W) / cs));
  const r0 = Math.max(0, Math.floor(VIEW.y / cs)), r1 = Math.min(w.rows - 1, Math.ceil((VIEW.y + H) / cs));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const v = w.a[r * w.cols + c];
    if (!v) continue;
    const x = c * cs, y = r * cs;
    if (v === 1) {
      ctx.fillStyle = (c + r) & 1 ? '#2a4a5e' : '#2e5266'; ctx.fillRect(x, y, cs, cs);
      if (hash(c + fr, r) > 0.8) { ctx.fillStyle = '#5f8ea6'; ctx.fillRect(x + (hash(c, r + fr) * cs | 0), y + (hash(r, c) * cs | 0), 2, 1); }
      // a dark lip where water meets land
      if (r > 0 && !w.a[(r - 1) * w.cols + c]) { ctx.fillStyle = '#16262e'; ctx.fillRect(x, y, cs, 1); }
    } else {
      for (let k = 0; k < 6; k++) { ctx.fillStyle = ['#6b6c63', '#55564f', '#7a5a3a', '#8f8f84', '#5a3d29', '#3f403a'][(hash(c * 7 + k, r) * 6) | 0]; ctx.fillRect(x + (hash(k, c + r * 31) * (cs - 1) | 0), y + (hash(c, k + r) * (cs - 1) | 0), 2, 2); }
      ctx.fillStyle = 'rgba(30,40,46,.35)'; ctx.fillRect(x, y, cs, cs);
    }
  }
}

// little flames licking up off anything that is burning
function drawFlames(ctx, p, t) {
  const w = p.w || p.r * 2 + 4, top = p.y - (p.state === 'up' ? (p.h ? p.h / 2 + 3 : 9) : 2);
  const fr = Math.floor(t * 12), n = Math.min(16, 3 + Math.floor(w / 2));
  for (let i = 0; i < n; i++) {
    const x = Math.round(p.x - w / 2 + hash(i + p.seed, fr) * w), y = Math.round(top + hash(i * 3, fr + p.seed) * 5);
    const h = hash(i, fr * 7 + p.seed);
    ctx.fillStyle = h > 0.75 ? PAL.fire3 : h > 0.4 ? PAL.fire2 : PAL.fire1;
    ctx.fillRect(x, y, 1, h > 0.5 ? 2 : 1);
  }
}

// an animal with no art of its own: a small coloured lump
function drawCritter(ctx, c) {
  const x = Math.round(c.x), y = Math.round(c.y);
  ctx.fillStyle = c.hitT > 0 ? '#ffffff' : PAL.brown; ctx.fillRect(x - 1, y - 2, 3, 2);
  px(ctx, x + c.fx, y - 3, PAL.ink);
}

// ------------------------------------------------------------------------------------------------ the ground

function makeBackground(m) {
  const T = THEME_PAL[m.theme.id];
  const c = newCanvas(W, H), x = c.getContext('2d');
  const so = m.seed % 1000;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const n = vnoise(px / 22 + so, py / 22) * 0.55 + vnoise(px / 7 + 40 + so, py / 7) * 0.3 + hash(px + so, py) * 0.2;
    const lvl = Math.max(0, Math.min(3, Math.floor(n * 3.4 - 0.35 + ((px + py) & 1) * 0.3)));
    x.fillStyle = T.grass[lvl];
    x.fillRect(px, py, 1, 1);
  }
  // the path, worn by a thousand years of pacing
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const d = m.df[py * W + px];
    const w = 5.2 + vnoise(px / 6 + so, py / 6) * 2.6;
    if (d > w + 1.5) continue;
    const n = vnoise(px / 3, py / 3) + hash(px * 3, py) * 0.4;
    if (d > w) { if (hash(px, py * 7) < 0.45) { x.fillStyle = T.dirt[0]; x.fillRect(px, py, 1, 1); } continue; }
    x.fillStyle = d > w - 1.3 ? T.dirt[0] : n > 1.05 ? T.dirt[3] : n > 0.7 ? T.dirt[2] : T.dirt[1];
    x.fillRect(px, py, 1, 1);
  }
  // tufts, pebbles, flowers
  let seed = 7 + m.n * 101;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 700; i++) {
    const px = Math.floor(r() * W), py = Math.floor(r() * H);
    if (m.df[py * W + px] < 9) continue;
    x.fillStyle = r() < 0.5 ? T.tuft[0] : T.tuft[1];
    x.fillRect(px, py, 1, 1);
    x.fillStyle = T.tuft[0]; x.fillRect(px + (r() < 0.5 ? -1 : 1), py + 1, 1, 1);
  }
  for (let i = 0; i < 60; i++) {
    const px = Math.floor(r() * W), py = Math.floor(r() * H);
    if (m.df[py * W + px] < 9) continue;
    x.fillStyle = T.flowers[Math.floor(r() * T.flowers.length)];
    x.fillRect(px, py, 1, 1);
  }
  for (let i = 0; i < 40; i++) {
    const px = Math.floor(r() * W), py = Math.floor(r() * H);
    x.fillStyle = PAL.rock1; x.fillRect(px, py, 1, 1);
    x.fillStyle = PAL.rock0; x.fillRect(px + 1, py + 1, 1, 1);
  }
  const { A, B } = m;
  drawRock(x, Math.round(A.x), Math.round(A.y), 6.2, 1, 3);
  drawRock(x, Math.round(B.x), Math.round(B.y), 5.6, 2, 7);
  drawText(x, 'ROCK', A.x, A.y + 10, PAL.rock3, { align: 'center', alpha: 0.75 });
  drawText(x, 'OTHER ROCK', B.x, B.y + 10, PAL.rock3, { align: 'center', alpha: 0.75 });
  return c;
}

function drawRock(x, cx, cy, R, kind, sd) {
  const shapeR = a => R + (hash(Math.round((a + 4) * 3) + sd, sd) - 0.5) * 2.2 * (kind === 1 ? 1.4 : 0.8);
  const inside = (px, py) => { const dx = px - cx, dy = (py - cy) * (kind === 1 ? 1.15 : 1); return Math.hypot(dx, dy) < shapeR(Math.atan2(dy, dx)); };
  for (let py = cy - 12; py < cy + 12; py++) for (let px = cx - 12; px < cx + 12; px++) {
    if (inside(px - 2, py - 2) && !inside(px, py)) { x.fillStyle = 'rgba(10,14,8,.45)'; x.fillRect(px, py, 1, 1); }
  }
  for (let py = cy - 12; py < cy + 12; py++) for (let px = cx - 12; px < cx + 12; px++) {
    if (!inside(px, py)) continue;
    const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
    const l = (-(px - cx) * 0.6 - (py - cy) * 0.8) / R + hash(px * 5, py * 3) * 0.35;
    let col = edge ? PAL.ink : l > 0.75 ? PAL.rock4 : l > 0.25 ? PAL.rock3 : l > -0.3 ? PAL.rock2 : PAL.rock1;
    if (!edge && kind === 2 && l < 0.1 && hash(px, py * 9) < 0.45) col = PAL.moss;
    x.fillStyle = col; x.fillRect(px, py, 1, 1);
  }
}

// a ring of tree canopies round the clearing, drawn over everything that walks under them
function makeForeground(theme) {
  const T = THEME_PAL[theme];
  const c = newCanvas(W, H), x = c.getContext('2d');
  const trees = [];
  let seed = 31 + theme.length * 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let px = -6; px < W + 10; px += 11 + r() * 7) { trees.push([px, -4 + r() * 6, 8 + r() * 6]); trees.push([px + 5, H + 3 - r() * 6, 8 + r() * 6]); }
  for (let py = 10; py < H; py += 12 + r() * 7) { trees.push([-5 + r() * 5, py, 8 + r() * 5]); trees.push([W + 5 - r() * 5, py + 6, 8 + r() * 5]); }
  const cover = new Float32Array(W * H), owner = new Int16Array(W * H).fill(-1);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (px > 26 && px < W - 26 && py > 22 && py < H - 22) continue;
    let best = 0;
    trees.forEach((t, i) => {
      const dx = px - t[0], dy = py - t[1], d = Math.hypot(dx, dy);
      const rr = t[2] + (hash(Math.round((Math.atan2(dy, dx) + 4) * 5) + i * 13, i) - 0.5) * 2.5;
      const v = 1 - d / rr;
      if (v > best) { best = v; owner[py * W + px] = i; }
    });
    cover[py * W + px] = best;
  }
  const on = (px, py) => px < 0 || py < 0 || px >= W || py >= H || cover[py * W + px] > 0;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px;
    if (cover[i] <= 0) continue;
    const t = trees[owner[i]];
    const edge = !on(px - 1, py) || !on(px + 1, py) || !on(px, py - 1) || !on(px, py + 1);
    const l = (-(px - t[0]) * 0.55 - (py - t[1]) * 0.8) / t[2] + (hash(px * 3 + 1, py * 5) - 0.5) * 0.5;
    x.fillStyle = edge ? PAL.ink : l > 0.55 ? T.canopy[3] : l > 0 ? T.canopy[2] : l > -0.5 ? T.canopy[1] : T.canopy[0];
    x.fillRect(px, py, 1, 1);
  }
  return c;
}

function makeShadow() {
  const c = newCanvas(28, 22), x = c.getContext('2d');
  x.fillStyle = PAL.ink;
  for (let py = 0; py < 22; py++) for (let px = 0; px < 28; px++) {
    const dx = (px + 0.5 - 14) / 13, dy = (py + 0.5 - 12) / 10;
    if (dx * dx + dy * dy < 1) x.fillRect(px, py, 1, 1);
  }
  return c;
}

// ------------------------------------------------------------------------------------------------ world bits


function drawIce(ctx, i, g) {
  const fade = i.t < 0.2 ? i.t / 0.2 : i.t > i.life - 1.2 ? Math.max(0, (i.life - i.t) / 1.2) : 1;
  const R = Math.ceil(i.r), fr = Math.floor(g.t * 4);
  for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
    const d = Math.hypot(px, py) / i.r;
    if (d > 1) continue;
    const wx = Math.round(i.x) + px, wy = Math.round(i.y) + py;
    const h = hash(wx * 3 + i.seed, wy * 5);
    if (d > 0.85 && h < (d - 0.85) * 5) continue;
    const crack = Math.abs(Math.sin((Math.atan2(py, px) * 5 + i.seed) )) < 0.08 && d > 0.2;
    ctx.globalAlpha = fade * (crack ? 0.7 : 0.45);
    ctx.fillStyle = crack ? '#ffffff' : h > 0.82 ? PAL.ice1 : (px + py) & 1 ? PAL.ice0 : PAL.ice2;
    ctx.fillRect(wx, wy, 1, 1);
    if (h > 0.996 && (fr + wx) % 3 === 0) { ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff'; ctx.fillRect(wx, wy, 1, 1); }
  }
  ctx.globalAlpha = 1;
}

// the lightning beam: a white core, a cyan sheath and forks of lightning crawling along it
function drawBeam(ctx, g) {
  const b = g.boss, a = b.act;
  if (!a || a.kind !== 'beam' || !a.fired || b.dead) return;
  const e = beamEnd(g), c = Math.cos(b.face), s = Math.sin(b.face), w = g.abil.beam.width;
  const fr = Math.floor(g.t * 30);
  const fade = Math.min(1, (g.abil.beam.wind + g.abil.beam.dur - a.t) / 0.25);
  for (let l = 10; l < e.len; l += 0.7) {
    const bx = b.x + c * l, by = b.y + s * l;
    const wob = Math.sin(l * 0.3 + fr) * 0.6;
    for (let k = -w; k <= w; k += 0.7) {
      const px = Math.round(bx - s * (k + wob)), py = Math.round(by + c * (k + wob));
      const ak = Math.abs(k);
      ctx.globalAlpha = fade * (ak < 1.2 ? 1 : ak < w * 0.6 ? 0.8 : 0.35);
      ctx.fillStyle = ak < 1.2 ? '#ffffff' : ak < w * 0.6 ? PAL.beam : PAL.blue;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  // forks
  ctx.fillStyle = PAL.spark;
  for (let f = 0; f < 4; f++) {
    let l = (hash(fr, f) * 0.9 + 0.05) * e.len, k = 0;
    const side = hash(fr, f + 9) < 0.5 ? -1 : 1;
    for (let i = 0; i < 10; i++) {
      l += 1.5; k += side * (0.5 + hash(fr + i, f) * 1.5);
      ctx.globalAlpha = fade * 0.8;
      ctx.fillRect(Math.round(b.x + c * l - s * k), Math.round(b.y + s * l + c * k), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// what marks the rock you are walking to; each map has its own (the store that sold them was cut from the sequel)
function drawMarker(ctx, g, over) {
  const R = destRock(g), style = (g.map.n - 1) % 5, t = g.t;
  const x = Math.round(R.x), y = Math.round(R.y);
  if (style === 0) {
    if (!over) return;
    // twinkling four-point sparkles circling the rock
    for (let i = 0; i < 6; i++) {
      const a = t * 0.8 + i * TAU / 6, rr = 9 + Math.sin(t * 2 + i) * 2;
      const sx = Math.round(x + Math.cos(a) * rr), sy = Math.round(y - 3 + Math.sin(a) * rr * 0.6);
      const tw = (Math.sin(t * 6 + i * 1.7) + 1) / 2;
      ctx.globalAlpha = 0.4 + tw * 0.6;
      px(ctx, sx, sy, tw > 0.7 ? '#ffffff' : PAL.gold);
      if (tw > 0.45) { ctx.fillStyle = PAL.gold; ctx.fillRect(sx - 1, sy, 1, 1); ctx.fillRect(sx + 1, sy, 1, 1); ctx.fillRect(sx, sy - 1, 1, 1); ctx.fillRect(sx, sy + 1, 1, 1); }
      if (tw > 0.85) { ctx.globalAlpha = 0.5; ctx.fillRect(sx - 2, sy, 1, 1); ctx.fillRect(sx + 2, sy, 1, 1); ctx.fillRect(sx, sy - 2, 1, 1); ctx.fillRect(sx, sy + 2, 1, 1); }
    }
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3);
    ring(ctx, x, y, 7, PAL.gold, ctx.globalAlpha);
    ctx.globalAlpha = 1;
  } else if (style === 1) {
    // a small black hole over the rock, eating the light around it
    const cy = y - 13;
    if (!over) { ctx.globalAlpha = 0.3; ctx.fillStyle = PAL.ink; for (let py = -9; py <= 9; py++) for (let qx = -11; qx <= 11; qx++) if ((qx / 11) ** 2 + (py / 9) ** 2 < 1 && (qx + py) & 1) ctx.fillRect(x + qx, cy + py, 1, 1); ctx.globalAlpha = 1; return; }
    for (let i = 0; i < 28; i++) {
      const a = t * (2.4 - (i % 3) * 0.4) + i * 0.7, rr = 5.5 + (i % 3) * 1.4;
      const sx = Math.round(x + Math.cos(a) * rr), sy = Math.round(cy + Math.sin(a) * rr * 0.45);
      px(ctx, sx, sy, i % 4 === 0 ? '#ffffff' : i % 2 ? PAL.orange : PAL.purple);
    }
    ctx.fillStyle = '#000000';
    for (let py = -3; py <= 3; py++) for (let qx = -3; qx <= 3; qx++) if (qx * qx + py * py <= 10) ctx.fillRect(x + qx, cy + py, 1, 1);
    ctx.globalAlpha = 0.6; ring(ctx, x, cy, 4, PAL.purple, 0.6); ctx.globalAlpha = 1;
  } else if (style === 2) {
    if (!over) return;
    // a sat-nav arrow bobbing over the rock, with the distance left along the path
    const by = y - 16 + Math.round(Math.sin(t * 4) * 1.5);
    const arrow = ['#######', '.#####.', '..###..', '...#...'];
    arrow.forEach((row, ry) => { for (let rx = 0; rx < 7; rx++) if (row[rx] === '#') { px(ctx, x - 3 + rx, by + ry, ry === 0 || rx === 0 || rx === 6 ? '#ffffff' : '#3a7bff'); } });
    ctx.fillStyle = PAL.ink; ctx.fillRect(x - 4, by - 1, 9, 1);
    const b = g.boss, here = pathNearest(g.map, b.x, b.y), left = Math.max(0, Math.round(R === g.map.B ? g.map.len - here.s : here.s));
    drawText(ctx, left < 20 ? 'ARRIVE' : `${left} M`, x, by - 8, '#9fc4ff', { align: 'center' });
  } else if (style === 3) {
    if (!over) return;
    // a poor soul tied to a wooden cross above the rock
    const top = y - 22, sway = Math.round(Math.sin(t * 1.5) * 0.6);
    ctx.fillStyle = PAL.ink; ctx.fillRect(x - 1, top - 1, 3, 17); ctx.fillRect(x - 5, top + 2, 11, 3);
    ctx.fillStyle = PAL.horse; ctx.fillRect(x, top, 1, 15); ctx.fillRect(x - 4, top + 3, 9, 1);
    px(ctx, x + sway, top + 1, PAL.skin);                                // head, lolling
    ctx.fillStyle = PAL.white; ctx.fillRect(x - 1, top + 3, 3, 4);       // rags
    px(ctx, x - 3, top + 3, PAL.skin); px(ctx, x + 3, top + 3, PAL.skin); // hands
    px(ctx, x, top + 8, PAL.skin);
    if (Math.floor(t / 4) % 3 === 0 && (t % 4) < 1.6) drawText(ctx, 'HELP', x + 8, top - 2, PAL.cream, { alpha: 0.85 });
  } else if (style === 4) {
    // a disco ball on a string, throwing coloured light around the rock
    const by = y - 18;
    if (!over) {
      const cols = [PAL.pink, PAL.blue, PAL.gold, PAL.green, PAL.purple];
      for (let i = 0; i < 14; i++) {
        const a = t * 1.3 + i * 2.1, rr = 6 + (i * 7 % 13);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.6), 2, 1);
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = PAL.rock2; ctx.fillRect(x, by - 8, 1, 6);
    for (let py = -2; py <= 2; py++) for (let qx = -2; qx <= 2; qx++) {
      if (qx * qx + py * py > 5) continue;
      const lit = (qx + py + Math.floor(t * 8)) % 3 === 0;
      px(ctx, x + qx, by + py, lit ? '#ffffff' : (qx + py) & 1 ? PAL.rock3 : PAL.rock2);
    }
  }
}

function drawFires(ctx, g) {
  const fr = Math.floor(g.t * 10);
  for (const f of g.fires) {
    const fade = f.t < 0.25 ? f.t / 0.25 : f.t > f.life - 1.2 ? Math.max(0, (f.life - f.t) / 1.2) : 1;
    const R = Math.ceil(f.r);
    for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
      const d = Math.hypot(px, py) / f.r;
      if (d > 1) continue;
      const wx = Math.round(f.x) + px, wy = Math.round(f.y) + py;
      const h = hash(wx * 7 + fr * 31, wy * 13 + fr);
      if (h < 0.15 + d * 0.45 * (2 - fade)) continue;
      ctx.fillStyle = d < 0.35 && h > 0.6 ? PAL.fire3 : d < 0.6 ? PAL.fire2 : h > 0.7 ? PAL.fire1 : PAL.fire0;
      ctx.globalAlpha = fade;
      ctx.fillRect(wx, wy, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawTelegraph(ctx, g) {
  const b = g.boss, a = b.act;
  if (!a || b.dead) return;
  const k = a.kind, d = g.abil[k];
  if (k === 'shake') return;
  if (k === 'charge') { if (!a.fired) drawLane(ctx, g, d.range, d.width, a.t / d.wind); return; }
  if (k === 'beam') { if (!a.fired) drawLane(ctx, g, beamEnd(g).len, d.width, a.t / d.wind); return; }
  if (k === 'summon' || k === 'ice' || k === 'haste') return;
  if (k === 'roar') {
    if (a.fired) return;
    const rr = 6 + a.t / d.wind * 8;
    ring(ctx, b.x, b.y, rr, PAL.cream, 0.6);
    return;
  }
  if (a.fired && k !== 'breath') return;
  const prog = a.fired ? 1 : a.t / d.wind;
  const R = d.range, x0 = Math.max(VIEW.x, Math.floor(b.x - R)), x1 = Math.min(VIEW.x + W - 1, Math.ceil(b.x + R));
  const y0 = Math.max(VIEW.y, Math.floor(b.y - R)), y1 = Math.min(VIEW.y + H - 1, Math.ceil(b.y + R));
  const blink = Math.floor(g.t * (prog > 0.6 ? 24 : 10)) & 1;
  const half = d.arc / 2, face = zoneFace(g, k);
  const channel = a.fired;
  ctx.fillStyle = PAL.tele;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px + 0.5 - b.x, dy = py + 0.5 - b.y, dist = Math.hypot(dx, dy);
    if (dist > R || dist < 8) continue;
    let edge = dist > R - 1;
    if (k !== 'stomp') {
      const ad = Math.abs(angDiff(Math.atan2(dy, dx), face));
      if (ad > half) continue;
      if ((half - ad) * dist < 1) edge = true;
    }
    let al;
    if (edge) al = channel ? 0.35 : 0.85;
    else if (dist < 8 + (R - 8) * prog) al = ((px + py + blink) & 1) ? (channel ? 0.12 : 0.42) : (channel ? 0.04 : 0.16);
    else al = ((px + py) & 1) ? 0.12 : 0;
    if (!al) continue;
    ctx.globalAlpha = al;
    ctx.fillRect(px, py, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawLane(ctx, g, range, width, prog) {
  const d = { range, width };
  const b = g.boss, c = Math.cos(b.face), s = Math.sin(b.face), R = d.range + 4;
  const blink = Math.floor(g.t * (prog > 0.6 ? 24 : 10)) & 1;
  ctx.fillStyle = PAL.tele;
  for (let py = Math.floor(b.y - R); py <= Math.ceil(b.y + R); py++) for (let qx = Math.floor(b.x - R); qx <= Math.ceil(b.x + R); qx++) {
    const dx = qx + 0.5 - b.x, dy = py + 0.5 - b.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (qx < VIEW.x || py < VIEW.y || qx >= VIEW.x + W || py >= VIEW.y + H || lx < 8 || lx > d.range || Math.abs(ly) > d.width) continue;
    const edge = lx > d.range - 1 || Math.abs(ly) > d.width - 1;
    const al = edge ? 0.85 : lx < 8 + (d.range - 8) * prog ? (((qx + py + blink) & 1) ? 0.42 : 0.16) : (((qx + py) & 1) ? 0.12 : 0);
    if (!al) continue;
    ctx.globalAlpha = al;
    ctx.fillRect(qx, py, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function ring(ctx, cx, cy, r, col, alpha) {
  ctx.fillStyle = col;
  ctx.globalAlpha = alpha;
  const n = Math.max(12, Math.floor(r * 6.3));
  let lx = null, ly = null;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    if (x !== lx || y !== ly) ctx.fillRect(x, y, 1, 1);
    lx = x; ly = y;
  }
  ctx.globalAlpha = 1;
}

function drawRing(ctx, r) {
  const k = r.t / 0.45;
  const rr = r.r + (r.max - r.r) * (1 - (1 - k) * (1 - k));
  if (r.col === 'dust') { ring(ctx, r.x, r.y, rr, PAL.dust, (1 - k) * 0.9); ring(ctx, r.x, r.y, rr * 0.8, PAL.dirt3, (1 - k) * 0.5); }
  else if (r.col === 'ice') { ring(ctx, r.x, r.y, rr, '#ffffff', (1 - k) * 0.9); ring(ctx, r.x, r.y, rr * 0.85, PAL.ice0, (1 - k) * 0.6); }
  else { ring(ctx, r.x, r.y, rr, PAL.cream, (1 - k) * 0.8); ring(ctx, r.x, r.y, rr * 0.7, PAL.cream, (1 - k) * 0.45); }
}

function drawSlash(ctx, r) {
  const k = r.t / 0.18;
  ctx.fillStyle = k < 0.5 ? '#ffffff' : PAL.cream;
  ctx.globalAlpha = 1 - k;
  for (let j = 0; j < 3; j++) {
    const rad = (r.big ? 16 : 17) + j * (r.big ? 5 : 4), sweep = r.big ? 2.2 : 1.9;
    for (let i = 0; i <= 18; i++) {
      const a = r.face - sweep / 2 + i / 18 * sweep + j * 0.08;
      if (i / 18 > k * 1.6 + 0.2) break;
      ctx.fillRect(Math.round(r.x + Math.cos(a) * rad), Math.round(r.y + Math.sin(a) * rad), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function px(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }

// sil: draw the whole hero in one colour (the outline pass)
function drawUnit(ctx, u, g, sil) {
  const b = g.boss;
  const x = Math.round(u.x), y = Math.round(u.y) - (u.dance ? Math.floor(u.dance * 7) % 2 : 0);
  const fx = u.moving ? u.fx : (b.x > u.x ? 1 : -1);
  const flash = u.hit > 0;
  const C = sil ? () => sil : c => flash ? '#ffffff' : c;
  const col = C(PAL[CLASS[u.cls].col]);
  if (!sil) { ctx.fillStyle = 'rgba(8,10,6,.4)'; ctx.fillRect(x - 2, Math.round(u.y) + 1, 5, 1); }
  if (u.role === 'pet') {
    const st = u.moving ? Math.floor(u.walk * 1.5) % 2 : 0;
    px(ctx, x - 1, y, C(PAL.ink)); px(ctx, x + 1, y - st, C(PAL.ink));
    ctx.fillStyle = col; ctx.fillRect(x - 1, y - 2, 3, 2);
    px(ctx, x + fx, y - 3, C(PAL.brown)); px(ctx, x + fx * 2, y - 2, C(PAL.ink));
    return;
  }
  const st = u.moving ? Math.floor(u.walk) % 2 : 2;
  if (st !== 0) px(ctx, x - 1, y, C(PAL.ink));
  if (st !== 1) px(ctx, x + 1, y, C(PAL.ink));
  const tall = u.role === 'tank' ? 3 : 2;
  ctx.fillStyle = col; ctx.fillRect(x - 1, y - tall, 3, tall);
  px(ctx, x, y - tall - 1, C(u.role === 'tank' ? PAL.steelHi : PAL.skin));
  if (u.role === 'tank') { ctx.fillStyle = C(PAL.steelHi); ctx.fillRect(x + fx * 2, y - 3, 1, 3); }
  else if (u.role === 'melee') {
    const sw = u.swing > 0;
    px(ctx, x + fx * 2, y - (sw ? 2 : 3), C(PAL.steelHi)); px(ctx, x + fx * (sw ? 3 : 2), y - (sw ? 2 : 4), C(PAL.steelHi));
  } else if (u.role === 'ranged') {
    const casting = u.cast > 0.3;
    if (u.cls === 'hunter') { ctx.fillStyle = C(PAL.tan); ctx.fillRect(x + fx * 2, y - 3, 1, 3); }
    else { ctx.fillStyle = C(PAL.brown); ctx.fillRect(x + fx * 2, y - 4, 1, 4); px(ctx, x + fx * 2, y - 5, C(casting && (Math.floor(g.t * 10) % 2) ? '#ffffff' : u.cls === 'mage' ? PAL.frost : PAL.shadow)); }
  } else if (u.role === 'healer') {
    px(ctx, x + fx * 2, y - 2, C(PAL.cream));
    if (u.glow > 0 && !sil) { px(ctx, x, y - 5, PAL.heal); px(ctx, x - 1, y - 4, PAL.heal); px(ctx, x + 1, y - 4, PAL.heal); }
  }
  if (sil) return;
  if (u.state === 'afk') { const z = Math.floor(g.t * 2) % 3; drawText(ctx, 'Z', x + 2 + z, y - 9 - z * 2, PAL.cream, { shadow: false, alpha: 0.7 }); }
  if (u.inFire && u.fireOk) px(ctx, x, y - tall - 2, PAL.fire2);
  if (u.hp < u.maxhp && u.party.engaged) {
    const w = Math.max(0, Math.ceil(3 * u.hp / u.maxhp));
    ctx.fillStyle = PAL.hpBg; ctx.fillRect(x - 1, y - tall - 3, 3, 1);
    ctx.fillStyle = u.hp / u.maxhp > 0.4 ? PAL.heal : PAL.red; ctx.fillRect(x - 1, y - tall - 3, w, 1);
  }
}

// ------------------------------------------------------------------------------------------------ light, weather, clouds

const HALO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// per theme: how dark the edges get and in what colour, how strong the cloud shadows are, and what drifts through the
// air (cols overrides the drift's colours). The campaign's maps are keyed by their level id.
const THEME_FX = {
  clearing: { tint: [6, 14, 6], dark: 0.4, cloud: 0.14, amb: 'pollen' },
  autumn: { tint: [24, 10, 4], dark: 0.45, cloud: 0.14, amb: 'leaves' },
  ash: { tint: [16, 6, 6], dark: 0.55, cloud: 0.18, amb: 'ash' },
  snow: { tint: [10, 20, 38], dark: 0.36, cloud: 0.1, amb: 'snow' },
  forest: { tint: [4, 16, 10], dark: 0.5, cloud: 0.17, amb: 'leaves', cols: ['#4e7a32', '#6e9a3a', '#2e5a3a', '#a8892e'] },
  farms: { tint: [26, 20, 6], dark: 0.34, cloud: 0.12, amb: 'chaff' },
  village: { tint: [22, 14, 6], dark: 0.4, cloud: 0.13, amb: 'pollen' },
  wall: { tint: [10, 14, 22], dark: 0.45, cloud: 0.16, amb: 'dust' },
  city: { tint: [22, 10, 6], dark: 0.5, cloud: 0.16, amb: 'smoke' },
  castle: { tint: [22, 6, 12], dark: 0.56, cloud: 0.18, amb: 'smoke' },
};

// banded, dithered light blobs, added on with 'lighter' so they glow without going smooth
const glows = new Map();
function glow(col, r) {
  const k = col + r;
  let c = glows.get(k);
  if (c) return c;
  c = newCanvas(r * 2 + 1, r * 2 + 1);
  const x = c.getContext('2d');
  x.fillStyle = col;
  for (let py = 0; py <= r * 2; py++) for (let qx = 0; qx <= r * 2; qx++) {
    const d = Math.hypot(qx - r, py - r) / r;
    if (d > 1) continue;
    const a = d < 0.3 ? 0.34 : d < 0.6 ? 0.2 : (qx + py) & 1 ? 0.12 : 0;
    if (!a) continue;
    x.globalAlpha = a;
    x.fillRect(qx, py, 1, 1);
  }
  glows.set(k, c);
  return c;
}
function light(ctx, x, y, col, r, a = 1) {
  if (a <= 0.02) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glow(col, r), Math.round(x) - r, Math.round(y) - r);
}
const PART_LIGHT = { flame: ['#ff7a1a', 3], ember: ['#ffb02e', 2], spark: ['#7fe8ff', 3], heal: ['#4cff6a', 2], fireball: ['#ff7a1a', 3], shadow: ['#a463e0', 2] };

function drawLights(ctx, g) {
  const b = g.boss, t = g.t;
  ctx.globalCompositeOperation = 'lighter';
  // anything burning lights up the ground round it, more for bigger things
  let lit = 0;
  for (const p of g.props) {
    if (!p.burning || p.state === 'gone' || lit > 70 || !onScreen(p.x, p.y, 24)) continue;
    lit++;
    const size = p.w ? (p.w + p.h) / 2 : p.r * 2, r = Math.max(6, Math.min(20, Math.round(5 + size * 0.6)));
    light(ctx, p.x, p.y - (p.state === 'up' ? Math.min(10, size * 0.4) : 0), '#ff6a12', r, 0.6 + 0.25 * Math.sin(t * 13 + p.seed));
  }
  for (const f of g.fires) {
    if (!onScreen(f.x, f.y, 10)) continue;
    const fade = f.t < 0.25 ? f.t / 0.25 : f.t > f.life - 1.2 ? Math.max(0, (f.life - f.t) / 1.2) : 1;
    light(ctx, f.x, f.y, '#ff6a12', 9, fade * (0.75 + 0.25 * Math.sin(t * 17 + f.x)));
  }
  for (const i of g.ice) light(ctx, i.x, i.y, '#5fb8ff', Math.min(26, Math.round(i.r * 0.7)), Math.max(0, Math.min(1, (i.life - i.t) / 1.5)) * 0.5);
  let n = 0;
  for (const p of g.parts) { const L = PART_LIGHT[p.kind]; if (L && n++ % 2 === 0 && onScreen(p.x, p.y, 4)) light(ctx, p.x, p.y, L[0], L[1], 0.6 * (1 - p.t / p.life)); }
  for (const o of g.bolts) light(ctx, o.x, o.y, o.kind === 'fireball' ? '#ff7a1a' : o.kind === 'shadow' ? '#a463e0' : o.kind === 'frost' ? '#7fc8ff' : '#e8d8b0', 4, 0.7);
  for (const a of g.adds) {
    if (a.kind === 'necro') light(ctx, a.x, a.y - 4, '#4cff6a', 6, 0.35 + (a.swing > 0 ? 0.5 : 0));
    else if (a.kind === 'spitter' && a.swing > 0) light(ctx, a.x, a.y - 3, '#ff7a1a', 6, 0.8);
  }
  const act = b.act;
  if (act?.kind === 'beam' && !b.dead) {
    if (!act.fired) light(ctx, b.x, b.y, '#7fe8ff', 18, act.t / g.abil.beam.wind * 0.9);
    else {
      const e = beamEnd(g), c = Math.cos(b.face), s = Math.sin(b.face);
      for (let l = 12; l < e.len; l += 9) light(ctx, b.x + c * l, b.y + s * l, '#5fd8ff', 10, 0.55);
      light(ctx, e.x, e.y, '#bff6ff', 16, 0.8);
    }
  }
  if (!b.dead) {
    const climbed = g.units.some(u => u.role === 'rider' && u.state === 'climb');
    light(ctx, b.x - 4 * Math.cos(b.face), b.y - 4 * Math.sin(b.face), '#6ff3e8', 4, climbed ? 0.9 : 0.35 + 0.15 * Math.sin(t * 2.5));
  }
  if (!g.clear && g.map.mode === 'patrol') {
    const R = destRock(g), m = (g.map.n - 1) % 5;   // the marker style follows the map, as in drawMarker
    light(ctx, R.x, R.y - (m === 0 ? 3 : 14), ['#ffd75a', '#a463e0', '#3a7bff', '#ffd75a', '#ee8fbf'][m] || '#ffd75a', 12, 0.3 + 0.1 * Math.sin(t * 3));
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

const wrap = (v, m) => ((v % m) + m) % m;
// things in the air: pollen and fireflies, falling leaves, ash and embers, snow. Stateless, worked out from time.
// Drawn in screen pixels; the camera's offset (VIEW) shifts it so it drifts with the world as the screen scrolls.
// chaff: bits of straw and seed blowing across; dust: grey grit off the wall; smoke: drifting smoke, ash and embers.
function drawWeather(ctx, g, fx) {
  const kind = fx.amb, t = g.t + (g.weatherT || 0), vx = VIEW.x * 0.9, vy = VIEW.y * 0.9;
  for (let i = 0; i < 44; i++) {
    const h1 = hash(i, 1), h2 = hash(i, 2), h3 = hash(i, 3);
    let x, y, col, a = 1, w = 1, hgt = 1;
    const X = v => wrap(v - vx, W), Y = v => wrap(v - vy, H);
    if (kind === 'chaff') {
      x = X(h1 * W + t * (14 + h3 * 12) + Math.sin(t * 2.1 + i) * 3); y = Y(h2 * H + Math.sin(t * 0.7 + i * 2) * 8 + t * (2 + h3 * 2));
      col = ['#e8d27a', '#c8a050', '#f4ecd2', '#b49a5a'][i % 4]; w = (i + Math.floor(t * 4)) % 3 ? 2 : 1; a = 0.55 + h3 * 0.4;
    } else if (kind === 'dust') {
      if (i % 2) continue;
      x = X(h1 * W + t * (6 + h3 * 6)); y = Y(h2 * H + Math.sin(t + i) * 4 + t * (1 + h3));
      col = h3 > 0.5 ? '#9a948a' : '#b4a27c'; a = 0.35 + h3 * 0.3;
    } else if (kind === 'smoke') {
      if (i % 3 === 0) {
        // slow grey puffs rising off the fires
        x = X(h1 * W + t * (4 + h3 * 4) + Math.sin(t * 0.5 + i) * 6); y = Y(h2 * H - t * (6 + h3 * 5));
        col = h3 > 0.5 ? '#3f3b34' : '#6b665c'; a = 0.22 + 0.12 * Math.sin(t * 0.8 + i); w = 3; hgt = 2;
      } else if (i % 5 === 0) {
        x = X(h1 * W + Math.sin(t * 2 + i) * 3); y = Y(h2 * H - t * (12 + h3 * 9));
        col = '#ffb02e'; a = 0.5 + 0.5 * Math.sin(t * 9 + i);
        ctx.globalCompositeOperation = 'lighter'; light(ctx, x, y, '#ff6a12', 2, a * 0.7); ctx.globalCompositeOperation = 'source-over';
      } else { x = X(h1 * W + t * (3 + h3 * 3)); y = Y(h2 * H + t * (5 + h3 * 4)); col = h3 > 0.5 ? '#6b665c' : '#9a948a'; a = 0.65; }
    } else if (kind === 'pollen') {
      x = wrap(h1 * W + t * (3 + h3 * 5) + Math.sin(t * 0.8 + i) * 4, W); y = wrap(h2 * H - t * (1 + h3 * 2) + Math.cos(t * 0.6 + i) * 3, H);
      a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 2.2 + i * 1.7)); col = h3 > 0.6 ? '#fff07a' : '#f4ecd2';
      if (h3 > 0.85) { ctx.globalCompositeOperation = 'lighter'; light(ctx, x, y, '#fff07a', 3, a * 0.6); ctx.globalCompositeOperation = 'source-over'; }
    } else if (kind === 'leaves') {
      x = X(h1 * W + t * (9 + h3 * 9) + Math.sin(t * 1.6 + i) * 4); y = Y(h2 * H + t * (12 + h3 * 9));
      col = (fx.cols || ['#e8892e', '#d8473a', '#ffd75a', '#b0501c'])[i % 4]; w = Math.sin(t * 3 + i) > 0 ? 2 : 1; hgt = w === 2 ? 1 : 2;
    } else if (kind === 'ash') {
      if (i % 4 === 0) {
        x = wrap(h1 * W + Math.sin(t * 2 + i) * 3, W); y = wrap(h2 * H - t * (10 + h3 * 8), H);
        col = '#ffb02e'; a = 0.5 + 0.5 * Math.sin(t * 9 + i);
        ctx.globalCompositeOperation = 'lighter'; light(ctx, x, y, '#ff6a12', 2, a * 0.7); ctx.globalCompositeOperation = 'source-over';
      } else { x = wrap(h1 * W + t * (2 + h3 * 3), W); y = wrap(h2 * H + t * (5 + h3 * 5), H); col = h3 > 0.5 ? '#6b665c' : '#9a948a'; a = 0.7; }
    } else {
      x = wrap(h1 * W + Math.sin(t * 0.9 + i) * 5 + t * 3, W); y = wrap(h2 * H + t * (11 + h3 * 14), H);
      col = '#ffffff'; a = 0.6 + h3 * 0.4; if (h3 > 0.82) { w = 2; hgt = 2; }
    }
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), w, hgt);
  }
  ctx.globalAlpha = 1;
}

// soft cloud shadows, one screen big and seamless both ways so they can tile across a scrolling world forever
function makeClouds(seed) {
  const c = newCanvas(W, H), x = c.getContext('2d');
  const so = (seed % 997) + 0.5;
  const N = (qx, qy) => vnoise(qx / 46 + so, qy / 34) * 0.7 + vnoise(qx / 17 + so + 9, qy / 13) * 0.3;
  x.fillStyle = PAL.ink;
  for (let py = 0; py < H; py++) for (let qx = 0; qx < W; qx++) {
    const k = qx / W, j = py / H;
    const n = (N(qx, py) * (1 - k) + N(qx + W, py) * k) * (1 - j) + (N(qx, py + H) * (1 - k) + N(qx + W, py + H) * k) * j;
    if (n > 0.66 || (n > 0.6 && (qx + py) & 1)) x.fillRect(qx, py, 1, 1);
  }
  return c;
}

// the edges fall off into the theme's shadow colour, in dithered steps
function makeGrade(theme) {
  const F = THEME_FX[theme] || THEME_FX.clearing;
  const c = newCanvas(W, H), x = c.getContext('2d'), img = x.createImageData(W, H);
  for (let py = 0; py < H; py++) for (let qx = 0; qx < W; qx++) {
    const dx = (qx + 0.5 - W / 2) / (W / 2), dy = (py + 0.5 - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx * 0.85 + dy * dy);
    const s = Math.max(0, Math.min(1, (d - 0.55) / 0.7));
    let a = s * s * (3 - 2 * s) * F.dark;
    a = Math.floor(a / 0.06 + ((qx + py) & 1) * 0.5) * 0.06;
    const i = (py * W + qx) * 4;
    img.data[i] = F.tint[0]; img.data[i + 1] = F.tint[1]; img.data[i + 2] = F.tint[2]; img.data[i + 3] = Math.round(Math.max(0, a) * 255);
  }
  x.putImageData(img, 0, 0);
  return c;
}

// a horse seen from above, sampled at its heading
function drawHorse(ctx, hx, hy, face, walk, rider, t) {
  const c = Math.cos(face), s = Math.sin(face);
  const gait = Math.floor(walk / 1.6) % 4;
  const cx = Math.round(hx), cy = Math.round(hy);
  const mat = (lx, ly) => {
    if (Math.hypot(lx - 5, ly) < 1.25) return 'head';
    if (Math.abs(ly) < 0.7 && lx > 1 && lx < 4.4) return 'mane';
    if (Math.abs(ly) < 1.1 && lx > 2 && lx < 5) return 'body';
    if ((lx / 3.6) ** 2 + (ly / 1.9) ** 2 < 1) return 'body';
    if (Math.hypot(lx + 4.4, ly) < 1) return 'mane';
    const ph = [0, 1, 0, -1][gait];
    for (const [fx, sy, sw] of [[2.3, 1, 1], [2.3, -1, -1], [-2.4, 1, -1], [-2.4, -1, 1]]) if (Math.hypot(lx - fx - ph * sw, ly - sy * 2) < 0.75) return 'leg';
    return null;
  };
  ctx.fillStyle = 'rgba(8,10,6,.4)'; ctx.fillRect(cx - 3, cy + 2, 7, 1);
  const cells = [];
  for (let py = -7; py <= 7; py++) for (let qx = -7; qx <= 7; qx++) {
    const lx = qx * c + py * s, ly = -qx * s + py * c;
    const m = mat(lx, ly);
    if (m) cells.push([qx, py, m]);
  }
  const has = new Set(cells.map(([a, b]) => a + ',' + b));
  for (const [qx, py, m] of cells) {
    const edge = m !== 'leg' && (!has.has((qx - 1) + ',' + py) || !has.has((qx + 1) + ',' + py) || !has.has(qx + ',' + (py - 1)) || !has.has(qx + ',' + (py + 1)));
    px(ctx, cx + qx, cy + py - 1, edge ? PAL.ink : m === 'mane' ? PAL.mane : m === 'leg' ? PAL.horseD : PAL.horse);
  }
}

function drawRider(ctx, u, g) {
  const x = Math.round(u.x), y = Math.round(u.y);
  const flash = u.hit > 0, C = c => flash ? '#ffffff' : c;
  if (u.mounted) {
    drawHorse(ctx, u.horse.x, u.horse.y, u.horse.face, u.horse.walk, true, g.t);
    px(ctx, x, y - 2, C(PAL.tan)); px(ctx, x - 1, y - 2, C(PAL.tan)); px(ctx, x, y - 3, C(PAL.hair));
    px(ctx, x + (Math.cos(u.horse.face) > 0 ? 1 : -1), y - 3, C(Math.floor(g.t * 3) % 4 ? PAL.steel : '#ffffff'));
    return;
  }
  if (u.state === 'flung' || u.state === 'stun') {
    ctx.fillStyle = C(PAL.tan); ctx.fillRect(x - 1, y - 1, 3, 1);
    px(ctx, x + 2, y - 1, C(PAL.hair));
    if (u.state === 'stun') {
      const a = g.t * 6;
      px(ctx, Math.round(x + Math.cos(a) * 3), Math.round(y - 4 + Math.sin(a)), PAL.gold);
      px(ctx, Math.round(x + Math.cos(a + Math.PI) * 3), Math.round(y - 4 + Math.sin(a + Math.PI)), PAL.gold);
    }
    return;
  }
  const st = u.moving ? Math.floor(u.walk) % 2 : 2;
  if (st !== 0) px(ctx, x - 1, y, PAL.ink);
  if (st !== 1) px(ctx, x + 1, y, PAL.ink);
  ctx.fillStyle = C(PAL.tan); ctx.fillRect(x - 1, y - 2, 3, 2);
  px(ctx, x, y - 3, C(PAL.hair));
  px(ctx, x + u.fx * 2, y - 3, C(PAL.steelHi));
}

function drawClimber(ctx, u, g) {
  const x = Math.round(u.x), y = Math.round(u.y);
  const wig = Math.floor(u.walk) % 2;
  ctx.fillStyle = PAL.ink; ctx.fillRect(x - 1 - wig, y - 3, 4, 5);
  ctx.fillStyle = PAL.tan; ctx.fillRect(x - wig, y - 1, 2, 2);
  px(ctx, x + 1 - wig, y - 2, PAL.skin); px(ctx, x - wig, y - 2, PAL.hair);
  if (u.stab > 0) { px(ctx, x - 1, y - 2, '#ffffff'); px(ctx, x - 2, y - 3, PAL.sigil); }
  else px(ctx, x + 2 - wig, y - 1, PAL.steelHi);
  // grip meter
  const w = 12, gx = Math.round(g.boss.x) - 6, gy = Math.round(g.boss.y) - 22;
  ctx.fillStyle = PAL.ink; ctx.fillRect(gx - 1, gy - 1, w + 2, 3);
  ctx.fillStyle = PAL.gold; ctx.fillRect(gx, gy, Math.max(0, Math.round(w * u.grip / 100)), 1);
}

// the boss's adds, all drawn from little pixel maps facing right (flipped when they face left)
const ADD_ART = {
  gnasher: [['.h..h.', 'kFFFFk', 'kfFFek', 'kfffFk', '.k..k.'], ['.h..h.', 'kFFFFk', 'kfFFek', 'kfffFk', '..kk..']],
  spitter: [['..kkk..', '.kRRRk.', 'kRrRRek', 'kRrRRmk', 'kRRrRRk', '.kkkkk.'], ['..kkk..', '.kRRRk.', 'kRrRRek', 'kRrRMMM', 'kRRrRRk', '.kkkkk.']],
  necro: [['..kkk..s', '.kPPPk.s', '.kPgPk.s', 'kPPPPPks', 'kPpPPPks', 'kPPPPPk.', '.kk.kk..'], ['..kkk..G', '.kPPPk.s', '.kPgPk.s', 'kPPPPPks', 'kPpPPPks', 'kPPPPPk.', '.kk.kk..']],
  skeleton: [['.b.', 'bbb', '.b.', 'b.b'], ['.b.', 'bbb', '.b.', '.b.']],
};
const ADD_COL = { k: PAL.ink, F: PAL.fur3, f: PAL.fur2, e: PAL.eye, h: PAL.horn, R: '#b8452a', r: '#7e2a18', m: '#3a120a', M: PAL.fire3,
  P: '#4a2a5e', p: '#2e1a3c', g: PAL.heal, s: PAL.brown, G: PAL.heal, b: PAL.bone };

function drawAdd(ctx, a, g) {
  const x = Math.round(a.x), y = Math.round(a.y), flip = a.fx < 0, flash = a.hit > 0;
  ctx.fillStyle = 'rgba(8,10,6,.4)'; ctx.fillRect(x - Math.ceil(a.r), y + 1, Math.ceil(a.r) * 2 + 1, 1);
  if (LEVEL_ADD_ART[a.kind]) LEVEL_ADD_ART[a.kind](ctx, a, g, H_ART);
  else {
    const frames = ADD_ART[a.kind];
    const map = a.kind === 'spitter' || a.kind === 'necro' ? frames[a.swing > 0 ? 1 : 0] : frames[a.moving ? Math.floor(a.walk) % 2 : 0];
    const w = map[0].length, h = map.length, ox = x - Math.floor(w / 2), oy = y - h + 1 - (a.kind === 'gnasher' && a.swing > 0 ? 1 : 0);
    map.forEach((row, ry) => { for (let rx = 0; rx < w; rx++) { const ch = row[flip ? w - 1 - rx : rx]; if (ch !== '.') px(ctx, ox + rx, oy + ry, flash ? '#ffffff' : ADD_COL[ch]); } });
  }
  if (a.hp < a.maxhp) {
    const bw = 5, bx = x - 2, by = y - (a.kind === 'necro' ? 9 : 7);
    ctx.fillStyle = PAL.ink; ctx.fillRect(bx, by, bw, 1);
    ctx.fillStyle = PAL.gold; ctx.fillRect(bx, by, Math.max(1, Math.round(bw * a.hp / a.maxhp)), 1);
  }
}

function drawCorpse(ctx, c) {
  const a = c.t > 30 ? (40 - c.t) / 10 : 1;
  ctx.globalAlpha = Math.max(0, a) * 0.85;
  const x = Math.round(c.x), y = Math.round(c.y);
  if (c.critter) {
    if (CORPSE_ART[c.critter]) CORPSE_ART[c.critter](ctx, c, H_ART);
    else { ctx.fillStyle = PAL.brown; ctx.fillRect(x - 1, y - 1, 3, 1); px(ctx, x, y, PAL.blood); }
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = PAL[CLASS[c.cls].col]; ctx.fillRect(x - 1, y - 1, c.cls === 'pet' ? 2 : 3, 1);
  px(ctx, x + 2, y - 1, c.cls === 'pet' ? PAL.brown : PAL.skin);
  px(ctx, x, y, PAL.blood);
  if (c.t < 8) px(ctx, x - 1, y, PAL.blood);
  ctx.globalAlpha = 1;
}

function drawGhost(ctx, o) {
  const a = (1 - o.t / 3.5) * 0.7;
  ctx.globalAlpha = a;
  const x = Math.round(o.x + Math.sin(o.t * 4) * 1.2), y = Math.round(o.y);
  ctx.fillStyle = PAL.ghost; ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x - 1, y - 1, 3, 2);
  px(ctx, x - 1, y + 1, PAL.ghost); px(ctx, x + 1, y + 1, PAL.ghost);
  ctx.globalAlpha = 1;
}

function drawBolt(ctx, o) {
  const col = PAL[o.kind];
  const x = Math.round(o.x), y = Math.round(o.y);
  const l = Math.hypot(o.vx || 0, o.vy || 0) || 1;
  px(ctx, x, y, col);
  ctx.globalAlpha = 0.6; px(ctx, Math.round(o.x - o.vx / l * 1.5), Math.round(o.y - o.vy / l * 1.5), col); ctx.globalAlpha = 1;
  if (o.kind === 'arrow') px(ctx, Math.round(o.x - o.vx / l * 2.5), Math.round(o.y - o.vy / l * 2.5), PAL.tan);
}

function drawPart(ctx, p) {
  const k = p.t / p.life;
  let col = PAL[p.kind] || p.kind;
  if (p.kind === 'flame') col = k < 0.3 ? PAL.fire3 : k < 0.6 ? PAL.fire2 : PAL.fire1;
  ctx.globalAlpha = p.kind === 'heal' || p.kind === 'dust' ? 1 - k : 1;
  px(ctx, Math.round(p.x), Math.round(p.y), col);
  ctx.globalAlpha = 1;
}

function bubble(ctx, s, x, y, bg, fg, alpha = 1) {
  const w = textWidth(s);
  const bx = Math.max(VIEW.x + 2, Math.min(VIEW.x + W - w - 6, Math.round(x - w / 2 - 2))), by = Math.max(VIEW.y + 2, Math.round(y));
  ctx.globalAlpha = alpha * 0.82;
  ctx.fillStyle = bg; ctx.fillRect(bx, by, w + 4, 7);
  ctx.fillRect(Math.round(x), by + 7, 1, 1);
  ctx.globalAlpha = 1;
  drawText(ctx, s, bx + 2, by + 1, fg, { shadow: false, alpha });
}

function drawBark(ctx, k) {
  const a = k.t < 0.1 ? k.t / 0.1 : k.t > k.life - 0.3 ? (k.life - k.t) / 0.3 : 1;
  bubble(ctx, k.s, k.x, k.y - 14, PAL.ink, PAL.cream, a);
}

function drawThought(ctx, g) {
  const b = g.boss, t = g.thought;
  const a = t.t < 0.2 ? t.t / 0.2 : t.t > 2.1 ? (2.4 - t.t) / 0.3 : 1;
  bubble(ctx, t.s, b.x, b.y - 32, PAL.cream, PAL.ink, a);
  ctx.globalAlpha = a * 0.8; ctx.fillStyle = PAL.cream;
  ctx.fillRect(Math.round(b.x) + 1, Math.round(b.y) - 22, 1, 1);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ HUD

function fmt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function drawHud(ctx, g, view) {
  const b = g.boss;
  // a faint backing so the HUD reads on pale maps too
  ctx.fillStyle = PAL.ink; ctx.globalAlpha = 0.28;
  ctx.fillRect(0, 0, 136, 38); ctx.fillRect(W - Math.max(108, textWidth(b.name) + 8), 0, Math.max(108, textWidth(b.name) + 8), 24);
  ctx.globalAlpha = 1;
  drawText(ctx, fmt(g.score), 4, 3, PAL.cream, { scale: 2 });
  const mc = g.mult >= 4 ? PAL.gold : g.mult >= 2 ? PAL.yellow : PAL.cream;
  const mp = g.map, ML = mp.level;
  drawText(ctx, `${mp.mode === 'patrol' ? 'AIMLESS' : 'VENGEANCE'} X${g.mult.toFixed(2)}`, 4, 15, mc);
  // where this map is up to: laps or Chaos to the 25-man and the 40-man, or the map's own goal
  const goal = g.won ? 'YOU WIN (EARLY ACCESS)' : g.clear ? 'MAP CLEARED' : ML.hud ? ML.hud(g) : g.dir.final ? 'BEAT THE 40-MAN'
    : mp.mode === 'patrol' ? (g.lapsMap < RAID_LAPS ? `LAP ${g.lapsMap}/${RAID_LAPS} TO THE RAID` : `LAP ${g.lapsMap}/${FINAL_LAPS} TO THE BIG ONE`)
    : `CHAOS ${Math.floor(g.chaos * 100)}%  ${g.chaos < 0.5 ? 'RAID AT 50' : 'BIG ONE AT 100'}`;
  const goalTxt = `MAP ${mp.n}  ${goal}`;
  drawText(ctx, goalTxt, 4, 22, g.dir.final ? PAL.red : PAL.rock3);
  if (mp.mode === 'chaos') {
    // the Chaos meter, with a tick at the 25-man
    const cx = 8 + textWidth(goalTxt);
    ctx.fillStyle = PAL.ink; ctx.fillRect(cx, 22, 42, 5);
    ctx.fillStyle = g.chaos >= 1 ? PAL.red : PAL.orange; ctx.fillRect(cx + 1, 23, Math.round(40 * Math.min(1, g.chaos)), 3);
    ctx.fillStyle = PAL.cream; ctx.fillRect(cx + 21, 22, 1, 5);
  }
  // level and XP to the next card
  const L = g.lv, lvTxt = `LVL ${L.level}`;
  drawText(ctx, lvTxt, 4, 30, PAL.gold);
  const xw = 64, xx = 4 + textWidth(lvTxt) + 4, xy = 31, fill = Math.max(0, Math.min(xw, Math.round(xw * L.xp / L.next)));
  ctx.fillStyle = PAL.ink; ctx.fillRect(xx - 1, xy - 1, xw + 2, 5);
  ctx.fillStyle = '#2a2016'; ctx.fillRect(xx, xy, xw, 3);
  ctx.fillStyle = PAL.gold; ctx.fillRect(xx, xy, fill, 3);
  ctx.fillStyle = '#fff0a0'; ctx.fillRect(xx, xy, fill, 1);
  if (L.pending.length) drawText(ctx, 'CARD!', xx + xw + 4, 30, PAL.gold, { alpha: Math.floor(g.t * 4) % 2 ? 1 : 0.5 });
  // stickers, as is tradition
  sticker(ctx, W - 4, 25, 'EARLY ACCESS', PAL.gold, PAL.ink, 'right');

  // the target frame, as the adventurers see it
  drawText(ctx, b.name, W - 4, 3, PAL.cream, { align: 'right' });
  const bw = 100, bx = W - 4 - bw, by = 10;
  ctx.fillStyle = PAL.ink; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
  ctx.fillStyle = PAL.hpBg; ctx.fillRect(bx, by, bw, 5);
  const fw = Math.round(bw * b.hp / b.maxhp);
  ctx.fillStyle = PAL.hpLo; ctx.fillRect(bx, by, fw, 5);
  ctx.fillStyle = PAL.hpHi; ctx.fillRect(bx, by, fw, 3);
  if (b.flash > 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + fw - 1, by, 1, 5); }
  ctx.fillStyle = PAL.ink;
  for (let i = 1; i < 10; i++) ctx.fillRect(bx + i * 10, by + 4, 1, 1);
  drawText(ctx, `${Math.ceil(b.hp)} / ${b.maxhp}`, W - 4, 17, PAL.rock3, { align: 'right' });

  // patrol status
  const blink = Math.floor(g.t * 3) % 2;
  if (b.dead) drawText(ctx, 'DEFEATED', 4, 170, PAL.red);
  else if (b.evade) drawText(ctx, 'EVADING...', 4, 170, PAL.cream, { alpha: blink ? 1 : 0.5 });
  else if (g.map.mode !== 'patrol') drawText(ctx, g.vengeT > 4 && g.mult > 1 ? 'VENGEANCE FADING' : 'WRECK IT', 4, 170, g.vengeT > 4 && g.mult > 1 ? PAL.red : PAL.orange, { alpha: g.vengeT > 4 && g.mult > 1 && !blink ? 0.6 : 1 });
  else if (g.onPatrol) drawText(ctx, 'ON PATROL', 4, 170, PAL.tuftHi);
  else drawText(ctx, g.offLane > 3 ? 'AIMLESSNESS FADING' : 'OFF THE PATH', 4, 170, PAL.red, { alpha: blink ? 1 : 0.6 });
  const m = Math.floor(g.t / 60), s = Math.floor(g.t % 60);
  drawText(ctx, `${m}:${String(s).padStart(2, '0')}`, W - 4, 170, PAL.rock3, { align: 'right' });
  if (view.muted) drawText(ctx, 'MUTED', W - 4, 163, PAL.rock2, { align: 'right' });

  // the five ability slots, then shake, which is always on Space
  const n = 6, bs = 14, gap = 3, x0 = Math.round(W / 2 - (n * bs + (n - 1) * gap) / 2), y0 = 160;
  [...g.slots, 'shake'].forEach((k, i) => {
    const x = x0 + i * (bs + gap), key = i < 5 ? SLOT_KEYS[i] : 'SPC';
    ctx.fillStyle = PAL.ink; ctx.globalAlpha = 0.8; ctx.fillRect(x, y0, bs, bs); ctx.globalAlpha = 1;
    if (!k) {
      ctx.fillStyle = PAL.rock1;
      ctx.fillRect(x, y0, bs, 1); ctx.fillRect(x, y0 + bs - 1, bs, 1); ctx.fillRect(x, y0, 1, bs); ctx.fillRect(x + bs - 1, y0, 1, bs);
      ICONS.empty.forEach((row, r) => { for (let c = 0; c < 8; c++) if (row[c] === '#') ctx.fillRect(x + 3 + c, y0 + 3 + r, 1, 1); });
      drawText(ctx, key, x + bs / 2 + 1, y0 + bs + 1, PAL.rock1, { align: 'center', shadow: false });
      return;
    }
    const cd = b.cd[k], max = g.abil[k].cd, ready = cd <= 0 && !b.dead;
    const active = b.act?.kind === k;
    ctx.fillStyle = active ? PAL.gold : ready ? PAL.rock3 : PAL.rock1;
    ctx.fillRect(x, y0, bs, 1); ctx.fillRect(x, y0 + bs - 1, bs, 1); ctx.fillRect(x, y0, 1, bs); ctx.fillRect(x + bs - 1, y0, 1, bs);
    ctx.fillStyle = ready ? (active ? PAL.gold : PAL.cream) : PAL.rock2;
    ICONS[k].forEach((row, r) => { for (let c = 0; c < 8; c++) if (row[c] === '#') ctx.fillRect(x + 3 + c, y0 + 3 + r, 1, 1); });
    if (cd > 0) {
      const h = Math.ceil((bs - 2) * cd / max);
      ctx.fillStyle = PAL.ink; ctx.globalAlpha = 0.6; ctx.fillRect(x + 1, y0 + 1, bs - 2, h); ctx.globalAlpha = 1;
      if (cd > 1) drawText(ctx, String(Math.ceil(cd)), x + bs / 2 + 1, y0 + 5, PAL.cream, { align: 'center' });
    }
    drawText(ctx, key, x + bs / 2 + 1, y0 + bs + 1, PAL.rock3, { align: 'center', shadow: false });
  });
  if (b.haste > 0) drawText(ctx, 'ZOOMIES', x0 - 4, 163, PAL.gold, { align: 'right' });

  const climber = g.units.find(u => u.role === 'rider' && u.state === 'climb');
  if (climber && !b.dead) drawText(ctx, 'HE IS IN YOUR FUR! SHAKE! [SPACE]', W / 2, 151, PAL.gold, { align: 'center', alpha: blink ? 1 : 0.55 });
  else if (b.taunt) drawText(ctx, 'TAUNTED', W / 2, 151, PAL.red, { align: 'center' });

  if (g.banner) {
    const t = g.banner.t, d = g.banner.dur;
    const a = t < 0.2 ? t / 0.2 : t > d - 0.5 ? Math.max(0, (d - t) / 0.5) : 1;
    drawText(ctx, g.banner.s, W / 2, 34, PAL.cream, { scale: 2, align: 'center', alpha: a });
    if (g.banner.sub) drawText(ctx, g.banner.sub, W / 2, 47, PAL.rock4, { align: 'center', alpha: a });
  }
}

// a little label with an ink border, like a sticker on a box
function sticker(ctx, x, y, s, bg, fg, align = 'left') {
  const w = textWidth(s) + 4, x0 = align === 'right' ? x - w : align === 'center' ? Math.round(x - w / 2) : x;
  ctx.fillStyle = PAL.ink; ctx.fillRect(x0 - 1, y - 1, w + 2, 9);
  ctx.fillStyle = bg; ctx.fillRect(x0, y, w, 7);
  drawText(ctx, s, x0 + 2, y + 1, fg, { shadow: false });
}

function drawCursor(ctx, mx, my, g) {
  const x = Math.round(mx), y = Math.round(my);
  const col = g.boss.act ? PAL.gold : PAL.cream;
  for (const [dx, dy] of [[-3, 0], [-2, 0], [2, 0], [3, 0], [0, -3], [0, -2], [0, 2], [0, 3]]) {
    ctx.fillStyle = PAL.ink; ctx.fillRect(x + dx + 1, y + dy + 1, 1, 1);
  }
  for (const [dx, dy] of [[-3, 0], [-2, 0], [2, 0], [3, 0], [0, -3], [0, -2], [0, 2], [0, 3]]) px(ctx, x + dx, y + dy, col);
}
