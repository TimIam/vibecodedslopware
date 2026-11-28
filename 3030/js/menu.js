// Title, track list, sound test, credits, and the album runner that walks SEQ.
import { W, H, P, RAMP, canvas, rect, px, line, sky, stars, perisphere, skyline, drawStrip, box, rampAt, mix, bake, ball, poly, ellipse, rng } from './gfx.js';
import { text, measure, wrap } from './font.js';
import * as A from './audio.js';
import { I } from './input.js';
import { G, go, save, persist } from './main.js';
import { getSong, SONGS, JUKEBOX } from './songs.js';
import { CINES, SEQ } from './story.js';
import { cineScene } from './cine.js';
import { stageScene, rankOf } from './stage.js';
import { STAGES } from './stages/index.js';

// ----------------------------------------------------------------- the logo
// "3030" in chrome: the 5x7 font blown up into bevelled blocks with a ramp per row.
function chromeText(str, k) {
  return bake('chrome:' + str + k, measure(str) * k + 8, 7 * k + 8, (g) => {
    const [t, tg] = canvas(measure(str) + 2, 9);
    text(tg, str, 1, 1, '#fff');
    const d = tg.getImageData(0, 0, t.width, t.height).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < t.width && y < t.height && d[(y * t.width + x) * 4 + 3] > 0;
    // Shadow first.
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (on(x, y)) rect(g, (x - 1) * k + 4 + 3, (y - 1) * k + 4 + 3, k, k, P.blood);
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
      if (!on(x, y)) continue;
      const bx = (x - 1) * k + 4, by = (y - 1) * k + 4;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
        const gy = ((y - 1) * k + j) / (7 * k);
        let v = gy < 0.5 ? 0.95 - gy * 0.9 : 0.25 + (gy - 0.5) * 1.1;
        if (j === 0 && !on(x, y - 1)) v = 1;
        if (i === 0 && !on(x - 1, y)) v += 0.15;
        if (j === k - 1 && !on(x, y + 1)) v = 0.1;
        if (i === k - 1 && !on(x + 1, y)) v -= 0.2;
        g.fillStyle = rampAt([P.s0, P.s1, P.s2, P.s3, P.s4, P.white], v, bx + i, by + j);
        g.fillRect(bx + i, by + j, 1, 1);
      }
    }
    // Outline.
    const od = g.getImageData(0, 0, g.canvas.width, g.canvas.height);
    const w = g.canvas.width, h = g.canvas.height, a = od.data;
    const opq = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
    g.fillStyle = P.ink;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!opq(x, y) && (opq(x - 1, y) || opq(x + 1, y) || opq(x, y - 1) || opq(x, y + 1))) g.fillRect(x, y, 1, 1);
  });
}

// Synthwave-free retro-future backdrop: dusk sky, Perisphere, a city, a scrolling grid road.
function backdrop(g, t, { dim = false } = {}) {
  sky(g, 0, 140, [P.ink, P.deep, P.navy, P.indigo, P.violet, P.magenta, P.orange]);
  stars(g, t, { n: 60, seed: 1, y1: 90 });
  // Sun.
  for (let y = -30; y < 30; y++) { if (y > 2 && (y % 5) < (y - 2) / 6) continue; const hw = Math.sqrt(900 - y * y); rect(g, 196 - hw, 110 + y, hw * 2, 1, y < 0 ? P.amber : P.orange); }
  g.drawImage(perisphere(26, [P.ink, P.deep, P.navy, P.indigo, P.violet], P.magenta), 18, 54);
  drawStrip(g, skyline(51, 40, P.deep, P.magenta), t * 3, 100);
  drawStrip(g, skyline(52, 26, P.ink, P.amber, { spires: false }), t * 7, 116);
  rect(g, 0, 140, W, H - 140, P.ink);
  // Grid floor.
  for (let i = 0; i < 12; i++) {
    const z = ((i + (t * 1.5) % 1) / 12), y = 140 + z * z * 84;
    rect(g, 0, y, W, 1, mix(P.navy, P.magenta, z));
  }
  for (let i = -12; i <= 12; i++) line(g, 128 + i * 6, 140, 128 + i * 40, 224, i % 2 ? P.navy : P.indigo);
  if (dim) { g.globalAlpha = 0.55; rect(g, 0, 0, W, H, P.ink); g.globalAlpha = 1; }
}

// ----------------------------------------------------------------- album flow
export function runSeq(i) {
  const item = SEQ[i];
  if (!item) return go(titleScene(), 'title');
  if (i > (save.progress || 0)) { save.progress = i; persist(); }
  if (item.cine) return go(cineScene(CINES[item.cine], () => runSeq(i + 1)), 'cine:' + item.cine);
  if (item.stage) return go(stageScene(STAGES[item.stage], { album: true, onWin: () => runSeq(i + 1), onQuit: () => go(titleScene(), 'title') }), 'stage:' + item.stage);
  if (item.credits) { save.finished = true; persist(); return go(creditsScene(() => go(titleScene(), 'title')), 'credits'); }
}

// ----------------------------------------------------------------- boot
export function bootScene() {
  let t = 0;
  const q = new URLSearchParams(location.search);
  return {
    update(dt) {
      t += dt;
      // Dev shortcuts: ?stage=id, ?cine=id, ?seq=n.
      if (q.get('stage') && STAGES[q.get('stage')]) { const id = q.get('stage'); q.delete('stage'); return go(stageScene(STAGES[id], { onWin: () => go(trackScene(), 'tracks'), onQuit: () => go(titleScene(), 'title') }), 'stage:' + id); }
      if (q.get('cine') && CINES[q.get('cine')]) { const id = q.get('cine'); q.delete('cine'); return go(cineScene(CINES[id], () => go(titleScene(), 'title')), 'cine:' + id); }
      if (q.get('seq')) { const n = +q.get('seq'); q.delete('seq'); return runSeq(n); }
      if (t > 2.4 || (t > 0.3 && (I.hit('a') || I.hit('start')))) go(titleScene(), 'title');
    },
    draw(g) {
      rect(g, 0, 0, W, H, P.ink);
      const a = Math.min(1, t * 2) * Math.min(1, (2.4 - t) * 2);
      g.globalAlpha = Math.max(0, a);
      text(g, 'VIBE CODED SLOPWARE', W / 2, 96, P.cream, { align: 'center' });
      text(g, 'PRESENTS', W / 2, 110, P.s2, { align: 'center' });
      text(g, 'A FAN TRIBUTE TO DELTRON 3030', W / 2, 140, P.s1, { align: 'center' });
      g.globalAlpha = 1;
    },
  };
}

// ----------------------------------------------------------------- title
export function titleScene() {
  let t = 0, pressed = false, sel = 0;
  const items = () => {
    const l = [];
    if ((save.progress || 0) > 0) l.push(['CONTINUE', () => runSeq(save.progress)]);
    l.push(['NEW GAME', () => { save.progress = 0; persist(); runSeq(0); }]);
    l.push(['TRACK LIST', () => go(trackScene(), 'tracks')]);
    l.push(['SOUND TEST', () => go(jukeScene(), 'sound')]);
    l.push(['CREDITS', () => go(creditsScene(() => go(titleScene(), 'title')), 'credits')]);
    return l;
  };
  const startMusic = () => { const s = A.songInfo(); if (!s || s.id !== 'title') A.playSong(getSong('title')); };
  return {
    enter() { if (A.ready()) { pressed = true; startMusic(); } },
    update(dt) {
      t += dt;
      if (!pressed) { if (t > 0.3 && (I.hit('a') || I.hit('start'))) { pressed = true; A.init(); A.sfx('start'); setTimeout(startMusic, 60); } return; }
      if (!A.songInfo() && A.ready()) startMusic();
      const l = items();
      sel = Math.min(sel, l.length - 1);
      if (I.rep('up')) { sel = (sel + l.length - 1) % l.length; A.sfx('move'); }
      if (I.rep('down')) { sel = (sel + 1) % l.length; A.sfx('move'); }
      if (I.hit('a') || I.hit('start')) { A.sfx('select'); l[sel][1](); }
    },
    draw(g) {
      backdrop(g, t);
      const logo = chromeText('3030', 9);
      const drop = Math.min(1, t * 1.8);
      const ly = -90 + 112 * (1 - (1 - drop) ** 3);
      g.drawImage(logo, Math.round(W / 2 - logo.width / 2 + 10), Math.round(ly));
      if (t > 0.6) {
        text(g, 'A 16-BIT ALBUM GAME', W / 2 + 10, 94, P.amber, { align: 'center', shadow: P.ink });
      }
      if (!pressed) {
        if ((t * 2 | 0) % 2) text(g, 'PRESS START', W / 2, 168, P.white, { align: 'center', shadow: P.ink });
      } else {
        const l = items();
        box(g, 76, 150, 104, l.length * 11 + 10, P.deep, P.s1, P.s2);
        l.forEach(([s], i) => text(g, (sel === i ? '▶ ' : '  ') + s, 88, 156 + i * 11, sel === i ? P.white : P.s3));
      }
      text(g, 'FAN TRIBUTE · NOT AFFILIATED · ORIGINAL CHIPTUNES', W / 2, 214, P.s1, { align: 'center' });
    },
  };
}

// ----------------------------------------------------------------- track list
// The album's 21 tracks. Songs are stages; skits replay their cinema scene.
function trackRows() {
  const rows = [];
  SEQ.forEach((it, i) => {
    if (it.stage) { const m = STAGES[it.stage]; rows.push({ n: m.track, name: m.name, i, stage: m }); }
    else if (it.cine && CINES[it.cine].track) { const c = CINES[it.cine]; rows.push({ n: c.track, name: c.title, i, cine: it.cine }); }
  });
  return rows.sort((a, b) => a.n - b.n);
}
export function trackScene() {
  let t = 0, sel = 0, top = 0;
  const rows = trackRows();
  const open = r => r.i <= (save.progress || 0) || save.finished;
  return {
    update(dt) {
      t += dt;
      if (I.rep('up')) { sel = (sel + rows.length - 1) % rows.length; A.sfx('move'); }
      if (I.rep('down')) { sel = (sel + 1) % rows.length; A.sfx('move'); }
      if (sel < top) top = sel; if (sel > top + 11) top = sel - 11;
      if (I.hit('b')) { A.sfx('back'); return go(titleScene(), 'title'); }
      if (I.hit('a') || I.hit('start')) {
        const r = rows[sel];
        if (!open(r)) { A.sfx('miss'); return; }
        A.sfx('select');
        if (r.stage) go(stageScene(r.stage, { onWin: () => go(trackScene(), 'tracks'), onQuit: () => go(trackScene(), 'tracks') }), 'stage:' + r.stage.id);
        else go(cineScene(CINES[r.cine], () => go(trackScene(), 'tracks')), 'cine:' + r.cine);
      }
    },
    draw(g) {
      backdrop(g, t, { dim: true });
      text(g, 'TRACK LIST', W / 2, 10, P.amber, { align: 'center', scale: 2, shadow: P.blood });
      box(g, 12, 32, 232, 168, P.deep, P.s1, P.s2);
      for (let k = 0; k < 12 && top + k < rows.length; k++) {
        const r = rows[top + k], y = 38 + k * 13, on = top + k === sel, ok = open(r);
        if (on) rect(g, 14, y - 2, 228, 11, P.navy);
        text(g, String(r.n).padStart(2, '0'), 20, y, ok ? P.amber : P.s1);
        const nm = ok ? r.name.toUpperCase() : '? ? ? ? ?';
        let s = nm; while (measure(s) > 150) s = s.slice(0, -2) + '…';
        text(g, s, 36, y, ok ? (on ? P.white : r.stage ? P.cream : P.s3) : P.s1);
        if (r.stage && ok) {
          const rk = save.rank[r.stage.id];
          if (rk) text(g, rk, 236, y, { S: P.amber, A: P.cyan, B: P.lime, C: P.s3 }[rk], { align: 'right' });
          if (save.best[r.stage.id]) text(g, String(save.best[r.stage.id]), 222, y, P.s2, { align: 'right' });
        } else if (ok) text(g, 'SKIT', 236, y, P.s1, { align: 'right' });
      }
      text(g, 'Ⓐ PLAY   Ⓑ BACK', W / 2, 208, P.s3, { align: 'center' });
    },
  };
}

// ----------------------------------------------------------------- sound test
export function jukeScene() {
  let t = 0, sel = 0, playing = null;
  return {
    update(dt) {
      t += dt;
      if (I.rep('up')) { sel = (sel + JUKEBOX.length - 1) % JUKEBOX.length; A.sfx('move'); }
      if (I.rep('down')) { sel = (sel + 1) % JUKEBOX.length; A.sfx('move'); }
      if (I.hit('a')) { playing = JUKEBOX[sel]; A.playSong(getSong(playing)); }
      if (I.hit('b')) { if (playing) { playing = null; A.stopSong(0.4); } else { A.sfx('back'); go(titleScene(), 'title'); } }
      if (I.hit('start')) { A.sfx('back'); go(titleScene(), 'title'); }
    },
    draw(g) {
      backdrop(g, t, { dim: true });
      text(g, 'SOUND TEST', W / 2, 10, P.amber, { align: 'center', scale: 2, shadow: P.blood });
      box(g, 12, 32, 232, 120, P.deep, P.s1, P.s2);
      const top = Math.max(0, Math.min(JUKEBOX.length - 9, sel - 4));
      for (let k = 0; k < 9; k++) {
        const id = JUKEBOX[top + k]; if (!id) break;
        const y = 38 + k * 12, on = top + k === sel;
        if (on) rect(g, 14, y - 2, 228, 11, P.navy);
        let s = SONGS[id].title.toUpperCase(); while (measure(s) > 196) s = s.slice(0, -2) + '…';
        text(g, (playing === id ? '♪ ' : '  ') + s, 22, y, on ? P.white : P.s3);
      }
      // Visualiser: bars per channel from the live beat.
      box(g, 12, 160, 232, 36, P.ink, P.s1, P.s2);
      const info = A.songInfo();
      if (info) {
        const b = A.beat();
        text(g, `${info.bpm} BPM  BAR ${Math.floor(b / 4) + 1}`, 20, 164, P.s3);
        for (let i = 0; i < 28; i++) { const h = Math.abs(Math.sin(b * Math.PI * 0.5 + i * 0.7) * Math.sin(b * 0.31 + i)) * 16 * (1 - (b % 1) * 0.5); rect(g, 20 + i * 8, 192 - h, 6, h, rampAt(RAMP.neon, i / 28, i, 0)); }
      }
      text(g, 'Ⓐ PLAY  Ⓑ STOP/BACK', W / 2, 206, P.s3, { align: 'center' });
    },
  };
}

// ----------------------------------------------------------------- credits
export function creditsScene(onDone) {
  let t = 0;
  const lines = [
    ['3030', P.amber, 2], ['', null], ['A 16-BIT ALBUM GAME', P.cream], ['', null],
    ['A FAN TRIBUTE TO THE ALBUM', P.s3], ['DELTRON 3030 (2000)', P.white], ['', null],
    ['DEL THE FUNKY HOMOSAPIEN', P.cream], ['DAN THE AUTOMATOR', P.cream], ['KID KOALA', P.cream], ['', null],
    ['NOT AFFILIATED WITH OR ENDORSED', P.s2], ['BY THE ARTISTS OR THEIR LABELS.', P.s2], ['', null],
    ['ALL MUSIC IN THIS GAME IS ORIGINAL', P.s3], ['CHIPTUNE WRITTEN FOR IT, ONE PIECE', P.s3], ['PER TRACK, AFTER THE FEEL OF EACH', P.s3], ['SONG. NO SAMPLES, NO LYRICS.', P.s3], ['', null],
    ['STORY, CODE, PIXELS AND SOUND CHIP', P.s3], ['VIBE CODED SLOPWARE', P.white], ['', null], ['', null],
    ['GO LISTEN TO THE RECORD.', P.amber], ['', null], ['SEE YOU IN 3030.', P.cream],
  ];
  const total = lines.length * 14 + H;
  return {
    enter() { const s = A.songInfo(); if (!s || s.id !== 'ending') A.playSong(getSong('ending')); },
    update(dt) {
      t += dt * (I.down('a') ? 4 : 1);
      if (I.hit('start') || I.hit('b') || t * 16 > total) { A.stopSong(0.6); onDone(); }
    },
    draw(g) {
      backdrop(g, t * 0.3, { dim: true });
      const y0 = H - t * 16;
      lines.forEach(([s, c, k], i) => { if (s) text(g, s, W / 2, y0 + i * 14, c, { align: 'center', scale: k || 1, shadow: P.ink }); });
    },
  };
}
