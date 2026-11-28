// Runs one minigame: Tecmo-style title card, READY/GO, play, pause menu, CLEAR/FAILED stamp,
// and a results panel with score, rank and best. The minigame itself only plays.
//
// Stage module (stages/*.js) exports default:
//   { id, track, song, name, title, blurb, how: [...], par: [C, B, A, S], restartSong, make(ctx) }
// make(ctx) returns { update(dt), draw(g), result } and sets result = { win, score, lines: [] }.
// ctx: { I, A, sfx, beat(), songTime(), pressBeat(btn), song, rng, shake(px), flash(), attempt, W, H }
import { W, H, P, RAMP, rect, box, rng, sky, stars, rampAt, mix } from './gfx.js';
import { text, wrap, measure } from './font.js';
import * as A from './audio.js';
import { I } from './input.js';
import { getSong } from './songs.js';
import { G, save, persist } from './main.js';

export const RANKS = ['C', 'B', 'A', 'S'];
export function rankOf(mod, score, win) {
  if (!win) return '-';
  const p = mod.par || [0, 1, 2, 3];
  let r = 'C';
  for (let i = 0; i < 4; i++) if (score >= p[i]) r = RANKS[i];
  return r;
}
const RANK_COL = { S: P.amber, A: P.cyan, B: P.lime, C: P.s3, '-': P.s2 };

export function stageScene(mod, { onWin, onQuit, album = false } = {}) {
  let phase = 'card', t = 0, inst = null, attempt = 0, shake = 0, menuI = 0, endT = 0, res = null, newBest = false;
  const seed = (Date.now() & 0xffff) || 7;
  const song = getSong(mod.song);
  const ctx = {
    I, A, W, H, song,
    sfx: (n, v) => A.sfx(n, v),
    beat: () => A.beat(), songTime: () => A.songTime(),
    // Exact beat a button went down at (stamped on the key event, not the frame).
    pressBeat: b => A.beatAt(I.when(b)),
    rng: rng(seed), shake: n => { shake = Math.max(shake, n); }, flash: (k = 0.6) => { G.flash = Math.max(G.flash, k); },
    get attempt() { return attempt; },
  };
  const ensureSong = () => { const s = A.songInfo(); if (!s || s.id !== mod.song) A.playSong(song); };
  const begin = () => {
    attempt++;
    ctx.rng = rng(seed + attempt * 977);
    inst = mod.make(ctx);
    phase = 'ready'; t = 0; shake = 0; res = null;
    if (mod.restartSong) A.playSong(song); else ensureSong();
  };

  const scene = {
    get inst() { return inst; }, get phase() { return phase; }, mod,
    enter() { if (!mod.restartSong) ensureSong(); else A.stopSong(0.4); },
    exit() {},
    autoPause() { if (phase === 'play') { phase = 'pause'; menuI = 0; A.suspend(); } },
    update(dt) {
      t += dt;
      if (shake > 0) shake = Math.max(0, shake - dt * 30);
      if (phase === 'card') {
        if (t > 0.4 && (I.hit('a') || I.hit('start'))) { A.sfx('start'); begin(); }
        return;
      }
      if (phase === 'ready') { if (t >= 1.5) { phase = 'play'; t = 0; } return; }
      if (phase === 'pause') {
        if (I.rep('up')) { menuI = (menuI + 2) % 3; A.sfx('move'); }
        if (I.rep('down')) { menuI = (menuI + 1) % 3; A.sfx('move'); }
        if (I.hit('start') || (I.hit('a') && menuI === 0) || I.hit('b')) { A.resume(); phase = 'play'; A.sfx('back'); return; }
        if (I.hit('a') && menuI === 1) { A.resume(); A.sfx('select'); begin(); return; }
        if (I.hit('a') && menuI === 2) { A.resume(); A.sfx('back'); A.stopSong(0.3); onQuit && onQuit(); return; }
        return;
      }
      if (phase === 'play') {
        if (I.hit('start')) { phase = 'pause'; menuI = 0; A.suspend(); return; }
        // Test bot: a stage may offer auto() -> buttons to hold this frame.
        if (window.__d3 && window.__d3.bot && inst.auto) { const want = new Set(inst.auto() || []); for (const b of ['up', 'down', 'left', 'right', 'a', 'b']) I.set(b, want.has(b)); }
        inst.update(dt);
        if (inst.result && window.__d3 && window.__d3.bot && inst.auto) for (const b of ['up', 'down', 'left', 'right', 'a', 'b']) I.set(b, false);
        if (inst.result) {
          res = inst.result; phase = 'end'; endT = 0;
          A.sfx(res.win ? 'win' : 'lose');
          if (res.win) {
            const best = save.best[mod.id] || 0;
            newBest = res.score > best;
            if (newBest) save.best[mod.id] = res.score;
            const r = rankOf(mod, res.score, true), old = save.rank[mod.id];
            if (!old || RANKS.indexOf(r) > RANKS.indexOf(old)) save.rank[mod.id] = r;
            save.cleared[mod.id] = true;
            persist();
          }
        }
        return;
      }
      if (phase === 'end') {
        endT += dt;
        if (endT > 0.4) inst.update && inst.endUpdate && inst.endUpdate(dt);
        if (endT > 1.6 || (endT > 0.6 && I.hit('a'))) { phase = 'result'; t = 0; menuI = 0; if (res.win) A.stopSong(1.2); }
        return;
      }
      if (phase === 'result') {
        if (t < 0.4) return;
        if (I.rep('up') || I.rep('down')) { menuI = 1 - menuI; A.sfx('move'); }
        if (I.hit('a')) {
          if (menuI === 0) { A.sfx('select'); if (res.win) { onWin && onWin(res); } else begin(); }
          else { A.sfx('back'); if (res.win) begin(); else { A.stopSong(0.3); onQuit && onQuit(); } }
        }
        if (I.hit('b')) { A.sfx('back'); A.stopSong(0.3); onQuit && onQuit(); }
      }
    },
    draw(g) {
      if (phase === 'card') return drawCard(g, mod, t);
      g.save();
      if (shake > 0) g.translate(Math.round(Math.sin(G.t * 90) * shake), Math.round(Math.cos(G.t * 71) * shake));
      inst.draw(g);
      g.restore();
      if (phase === 'ready') {
        const go = t > 1.0;
        const s = go ? 'GO!' : 'READY';
        const k = go ? 1 + Math.max(0, 0.2 - (t - 1.0)) * 4 : 1;
        rect(g, 0, 94, W, 30, P.ink);
        rect(g, 0, 94, W, 1, P.amber); rect(g, 0, 123, W, 1, P.amber);
        text(g, s, W / 2, 102, go ? P.amber : P.cream, { align: 'center', scale: 2, shadow: P.blood });
        void k;
      }
      if (phase === 'pause') {
        g.globalAlpha = 0.6; rect(g, 0, 0, W, H, P.ink); g.globalAlpha = 1;
        box(g, 78, 70, 100, 76);
        text(g, 'PAUSED', W / 2, 78, P.amber, { align: 'center' });
        ['RESUME', 'RESTART', 'QUIT'].forEach((s, i) => text(g, (menuI === i ? '▶ ' : '  ') + s, 98, 96 + i * 14, menuI === i ? P.white : P.s3));
      }
      if (phase === 'end') {
        const k = Math.min(1, endT * 4);
        const s = res.win ? 'CLEAR!' : 'FAILED';
        rect(g, 0, 92, W * k, 34, res.win ? P.navy : P.blood);
        rect(g, 0, 92, W * k, 1, P.amber); rect(g, 0, 125, W * k, 1, P.amber);
        if (k >= 1) text(g, s, W / 2, 101, res.win ? P.amber : P.cream, { align: 'center', scale: 2, shadow: P.ink });
      }
      if (phase === 'result') drawResult(g, mod, res, t, menuI, newBest);
    },
  };
  return scene;
}

function stripes(g, t, c1, c2) {
  for (let y = 0; y < H; y += 2) { const off = ((y * 3 + t * 60) % 64); for (let x = -64; x < W; x += 64) rect(g, x + off, y, 32, 1, c1); }
  void c2;
}

// The Tecmo-style title card: track number slides in, big title, how to play.
function drawCard(g, mod, t) {
  rect(g, 0, 0, W, H, P.ink);
  g.globalAlpha = 0.35; stripes(g, t, P.deep); g.globalAlpha = 1;
  const k = Math.min(1, t * 3.5);
  const x = -220 + 236 * k;
  rect(g, 0, 26, W, 34, P.blood); rect(g, 0, 26, W, 1, P.red); rect(g, 0, 59, W, 1, P.ink);
  text(g, 'TRACK ' + String(mod.track).padStart(2, '0'), x, 30, P.amber, { scale: 1, shadow: P.ink });
  const nm = mod.name.toUpperCase();
  if (measure(nm, 2) <= 236) text(g, nm, x, 42, P.white, { scale: 2, shadow: P.ink });
  else wrap(nm, 236).slice(0, 2).forEach((l, i) => text(g, l, x, 41 + i * 9, P.white, { shadow: P.ink }));
  const tx = W + 220 - 236 * k;
  text(g, mod.title, tx - 16, 70, P.cyan, { align: 'right', shadow: P.navy });
  wrap(mod.blurb, 216).forEach((l, i) => text(g, l, 20, 92 + i * 11, P.cream));
  box(g, 20, 140, 216, 52, P.deep, P.s1, P.s2);
  text(g, 'HOW TO PLAY', 28, 145, P.amber);
  mod.how.forEach((h, i) => text(g, h, 28 + (i % 2) * 104, 159 + Math.floor(i / 2) * 11, P.s4));
  const best = save.best[mod.id], rank = save.rank[mod.id];
  if (best) text(g, `BEST ${best}  RANK ${rank || '-'}`, W - 20, 198, P.s3, { align: 'right' });
  if (t > 0.4 && (t * 2.5 | 0) % 2) text(g, 'PRESS Ⓐ', W / 2, 208, P.white, { align: 'center' });
}

function drawResult(g, mod, res, t, menuI, newBest) {
  g.globalAlpha = 0.75; rect(g, 0, 0, W, H, P.ink); g.globalAlpha = 1;
  box(g, 32, 30, 192, 160);
  text(g, res.win ? 'TRACK CLEAR' : 'TRACK FAILED', W / 2, 38, res.win ? P.amber : P.red, { align: 'center' });
  text(g, mod.name.toUpperCase(), W / 2, 50, P.s3, { align: 'center' });
  (res.lines || []).slice(0, 6).forEach((l, i) => text(g, l, 46, 68 + i * 11, P.cream));
  text(g, 'SCORE', 46, 138, P.s3); text(g, String(res.score), 140, 138, P.white, { align: 'right' });
  if (newBest && res.win && (t * 3 | 0) % 2) text(g, 'NEW BEST!', 46, 150, P.amber);
  const r = rankOf(mod, res.score, res.win);
  text(g, 'RANK', 172, 120, P.s3, { align: 'center' });
  text(g, r, 172, 132, RANK_COL[r], { align: 'center', scale: 3, shadow: P.ink });
  const opts = res.win ? ['CONTINUE', 'PLAY AGAIN'] : ['RETRY', 'QUIT'];
  opts.forEach((s, i) => text(g, (menuI === i ? '▶ ' : '  ') + s, 70 + i * 66, 172, menuI === i ? P.white : P.s2));
}
