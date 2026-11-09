// Pit Crew '26: screens, race loop, HUD, input. The pit stop itself lives in stop.js.
import { W, H, canvas as mkCanvas, rect, ellipse, panel, bar, tyreIcon, portrait, carSprite, wheelSprite, crew, shade, WHEELS } from './gfx.js';
import { text, wrap, measure } from './font.js';
import { TEAMS, DRIVERS, TRACKS, COMPOUNDS, COMPOUND_ORDER, PEOPLE, POINTS, MOD_INFO, TV } from './data.js';
import { Race, rng, IN_T, OUT_T, TANK } from './race.js';
import { PitStop } from './stop.js';
import { bake, bakeMap, Y, BOX_X, theme, straightCar } from './scene.js';
import { Director, LINES, rename, pepTalk, pickFresh, saveHeard, setConditions, setLapsDone } from './banter.js';
import { calendar, MODES, TIME_NAME } from './season.js';
import * as C from './custom.js';
import * as A from './audio.js';
import * as O from './options.js';
import { makeBreak } from './break.js';
import { makeDebug } from './debug.js';

// The game draws at 512x288 into an offscreen canvas; present() scales it to fill the window.
const cv = document.getElementById('game');
const out = cv.getContext('2d');
const [src, g] = mkCanvas(W, H);
const [mid, mg] = mkCanvas(W, H);
const DEV = /^(localhost|127\.|\[::1\])/.test(location.hostname);
C.apply();
const SAVE_KEY = 'pitcrew26.v1';

// ------------------------------------------------------------ save
function freshSave(mode = 'short') { return { mode, round: 0, team: {}, drv: {}, results: [], best: {}, practiceBest: null, muted: false }; }
let save = freshSave();
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.round === 'number') save = { ...save, ...s }; } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const cal = () => calendar(save.mode || 'short');
// Kesselwald and Isla Grande come back dry in a long season, with lines of their own.
const dryLines = (track, kind) => (track.dryNow && LINES.DRY_VISIT[track.id]?.[kind]) || [];
// A long season stops for the Summer Shutdown after round 6, once.
const dueBreak = () => save.mode === 'long' && save.round === 6 && !save.breakDone;
const afterRace = () => go(save.round >= cal().length ? seasonScene : dueBreak() ? breakScene : calendarScene);
const nextRace = () => go(save.round >= cal().length ? seasonScene : dueBreak() ? breakScene : briefingScene);
function newSeason(mode) {
  const keep = { muted: save.muted, best: save.best, practiceBest: save.practiceBest };
  save = { ...freshSave(mode), ...keep };
  persist();
  go(calendarScene);
}
A.setMuted(!!save.muted);
A.setLevels({ music: O.opts.music, sfx: O.opts.sfx, duckOn: O.opts.duck });
// Browsers hold sound until the first click or key: wake it on any of them, anywhere.
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => A.init(), { capture: true, passive: true });
function toggleMute() { A.init(); A.setMuted(!A.isMuted()); save.muted = A.isMuted(); persist(); syncMute(); }
const muteBtn = document.getElementById('mute');
function syncMute() { muteBtn.textContent = A.isMuted() ? '♪ Sound off' : '♪ Sound on'; }
syncMute();
muteBtn.addEventListener('click', () => { A.init(); A.setMuted(!A.isMuted()); save.muted = A.isMuted(); persist(); syncMute(); cv.focus(); });

// ------------------------------------------------------------ layout
// Fill the space under the site bar (or the whole screen in full screen) at 16:9.
const wrapEl = document.getElementById('wrap');
function fit() {
  const r = wrapEl.getBoundingClientRect();
  const s = Math.min(r.width / W, r.height / H);
  const cw = Math.max(1, Math.floor(W * s)), ch = Math.max(1, Math.floor(H * s));
  cv.style.width = cw + 'px';
  cv.style.height = ch + 'px';
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cw * dpr);
  cv.height = Math.round(ch * dpr);
  // Blow the pixels up by a whole number first, then let the browser smooth the last
  // fraction: every game pixel stays square and the same size, with soft-free edges.
  const k = Math.max(1, Math.ceil(cv.width / W));
  if (mid.width !== W * k) { mid.width = W * k; mid.height = H * k; }
  mg.imageSmoothingEnabled = false;
}
function present() {
  mg.drawImage(src, 0, 0, mid.width, mid.height);
  out.imageSmoothingEnabled = mid.width !== cv.width;
  out.imageSmoothingQuality = 'high';
  out.drawImage(mid, 0, 0, cv.width, cv.height);
}
addEventListener('resize', fit);
new ResizeObserver(fit).observe(wrapEl);
fit();

// Full screen hides the site bar; the button lives in the bar, F toggles too.
const fsBtn = document.getElementById('fs');
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
fsBtn.addEventListener('click', () => { toggleFull(); cv.focus(); });
document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('full', !!document.fullscreenElement); fit(); });

// ------------------------------------------------------------ input
const ui = [];           // clickable rects registered each frame
let mouse = { x: -1, y: -1 };
let touchMode = false;
const pointerKeys = new Map();

function toLocal(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}

// Hidden text box for typing names: keeps the canvas UI, and brings up phone keyboards.
const typer = document.getElementById('typer');
typer.addEventListener('input', () => scene.typed && scene.typed());
typer.addEventListener('blur', () => scene.typeEnd && scene.typeEnd(true));

// Shift+Ctrl+Comma+Period, from anywhere.
const chord = new Set();
function toggleDebug() {
  if (scene === debugScene) return debugScene.key('esc');
  const st = scene && (scene.S ? scene.S.stop : scene.stop);
  if (st) for (const k of [...st.held]) st.releaseKey(k);
  debugScene.from = scene;
  scene = debugScene;
  debugScene.enter();
}

addEventListener('keydown', e => {
  if (e.code === 'Comma' || e.code === 'Period') {
    chord.add(e.code);
    if (e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      if (!e.repeat && chord.size === 2) toggleDebug();
      return;
    }
  }
  if (e.target.closest && e.target.closest('.site-topbar')) return;
  if (document.activeElement === typer) {
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); scene.typeEnd && scene.typeEnd(true); }
    if (e.key === 'Escape') { e.preventDefault(); scene.typeEnd && scene.typeEnd(false); }
    return;
  }
  A.init();
  if (scene.raw && scene.raw(e, true)) { e.preventDefault(); return; }
  // the options screen waiting for a new key gets the raw key first
  if (scene.capture && scene.capture(e.code)) { e.preventDefault(); return; }
  const acts = O.actionsFor(e.code), nav = NAV[e.code];
  if (acts.length || nav || e.code === 'Tab') e.preventDefault();
  if (e.repeat) return;
  if (acts.includes('fullscreen')) return toggleFull();
  if (acts.includes('mute')) return toggleMute();
  if (scene.actions && acts.length && scene.actions(acts)) return;
  if (nav && scene.key) scene.key(nav);
});
addEventListener('keyup', e => {
  chord.delete(e.code);
  if (scene.raw) scene.raw(e, false);
  const acts = O.actionsFor(e.code);
  if (acts.length && scene.actionsUp) scene.actionsUp(acts);
});
// Menus always answer to these, whatever the gameplay bindings are.
const NAV = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter', NumpadEnter: 'enter', Escape: 'esc', Space: 'space' };
const STOP_KEYS = new Set(['space', 'a', 'd', 'q', 'e', 'z', 'c', 's', 'x', 'w', 'up', 'down', 'left', 'right']);
const stopActs = acts => acts.filter(a => STOP_KEYS.has(a));
// Losing focus mid-stop must not leave a key (the fuel hose) held down.
addEventListener('blur', () => {
  chord.clear();
  const st = scene && (scene.S ? scene.S.stop : scene.stop);
  if (st) for (const k of [...st.held]) st.releaseKey(k);
});

cv.addEventListener('pointerdown', e => {
  A.init();
  cv.focus();
  if (e.pointerType === 'touch') touchMode = true;
  const p = toLocal(e);
  mouse = p;
  cv.setPointerCapture?.(e.pointerId);
  if (scene.pointer) {
    const k = scene.pointer(p.x, p.y);
    if (k) { pointerKeys.set(e.pointerId, k); return; }
  }
  for (let i = ui.length - 1; i >= 0; i--) {
    const b = ui[i];
    if (p.x >= b.x && p.y >= b.y && p.x < b.x + b.w && p.y < b.y + b.h) { A.sfx('select'); b.fn(); return; }
  }
  if (scene.click) scene.click(p.x, p.y);
});
const endPointer = e => {
  if (scene.pointerUp) scene.pointerUp();
  const k = pointerKeys.get(e.pointerId);
  if (k) { pointerKeys.delete(e.pointerId); scene.keyUp && scene.keyUp(k); }
};
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('pointermove', e => { mouse = toLocal(e); if (e.buttons & 1 && scene.drag) scene.drag(mouse.x, mouse.y); });
cv.addEventListener('contextmenu', e => e.preventDefault());

function button(x, y, w, h, label, fn, { hot = false, color = '#16b3a3', small = false, disabled = false } = {}) {
  const over = mouse.x >= x && mouse.y >= y && mouse.x < x + w && mouse.y < y + h;
  const on = (hot || over) && !disabled;
  rect(g, x, y, w, h, '#05060a');
  rect(g, x + 1, y + 1, w - 2, h - 2, disabled ? '#3a3e48' : on ? shade(color, 0.25) : shade(color, -0.35));
  rect(g, x + 1, y + 1, w - 2, 1, disabled ? '#4a4e58' : shade(color, on ? 0.6 : 0));
  rect(g, x + 1, y + h - 2, w - 2, 1, shade(color, -0.6));
  text(g, label, x + w / 2, y + Math.floor((h - 7) / 2), disabled ? '#8a8e98' : '#ffffff', { align: 'center', shadow: '#05060a' });
  if (!disabled) ui.push({ x, y, w, h, fn });
}

// ------------------------------------------------------------ shared visuals
const bgCache = new Map();
function bgFor(track) { const k = track.key || track.id; if (!bgCache.has(k)) bgCache.set(k, bake(track)); return bgCache.get(k); }

function crowdShimmer(T) {
  for (let i = 0; i < 26; i++) {
    const x = (Math.random() * W) | 0, y = Y.stand + 1 + ((Math.random() * 4) | 0) * 3.5 | 0;
    rect(g, x, y, 2, 1, ['#ffffff', '#f2c218', '#e84a3a', '#16b3a3'][i % 4]);
  }
}

const particles = [];
function weather(T, dt, kind, wet) {
  const n = kind === 'snow' ? 40 : kind === 'sand' ? 16 : Math.round(wet * 140);
  while (particles.length < n) particles.push({ x: Math.random() * W, y: Math.random() * Y.panel, v: 0.5 + Math.random() });
  particles.length = Math.min(particles.length, n);
  for (const p of particles) {
    if (kind === 'snow') { p.y += 14 * p.v * dt; p.x += Math.sin(T + p.v * 9) * 8 * dt; rect(g, p.x, p.y, 1, 1, '#ffffff'); }
    else if (kind === 'sand') { p.x += 120 * p.v * dt; p.y += 6 * dt; rect(g, p.x, p.y, 2, 1, '#f0c890'); }
    else { p.y += 260 * p.v * dt; p.x -= 50 * p.v * dt; g.fillStyle = 'rgba(190,215,255,0.55)'; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 4); }
    if (p.y > Y.panel) { p.y = -4; p.x = Math.random() * (W + 60); }
    if (p.x > W + 10) p.x = -10;
    if (p.x < -10) p.x = W + 10;
  }
}

function wetOverlay(wet, T) {
  if (wet <= 0.02) return;
  g.globalAlpha = wet * 0.45;
  rect(g, 0, Y.scenery, W, Y.stand - Y.scenery, '#2a2e36');
  g.globalAlpha = wet * 0.28;
  rect(g, 0, Y.straight, W, Y.curb - Y.straight, '#10203a');
  rect(g, 0, Y.lane, W, Y.garage - Y.lane, '#10203a');
  g.globalAlpha = wet * 0.5;
  for (let i = 0; i < 10; i++) {
    const x = (i * 97 + 31) % W, y = i % 2 ? Y.laneMid + (i % 3) * 5 : Y.straightMid + (i % 3) * 3;
    ellipse(g, x, y, 10 + (i % 4) * 3, 2, '#5a7ab0');
    rect(g, x - 4 + Math.round(Math.sin(T * 3 + i) * 2), y, 4, 1, '#9ab8e8');
  }
  g.globalAlpha = 1;
}

function topBar(left, mid, right) {
  rect(g, 0, 0, W, 12, '#05060a');
  rect(g, 0, 11, W, 1, '#2a3040');
  text(g, left, 4, 3, '#ffd23a');
  if (mid) text(g, mid, W / 2, 3, '#ffffff', { align: 'center' });
  if (right) text(g, right, W - 4, 3, '#9aa8c8', { align: 'right' });
}

// Big chunky logo text with layered drop shadows.
function logo(x, y, s = 4) {
  const a = 'PIT CREW', b = "'26";
  const wa = measure(a, s), wb = measure(b, s);
  const x0 = Math.round(x - (wa + wb + s * 3) / 2);
  for (let k = 3; k >= 1; k--) { text(g, a, x0 + k * 2, y + k * 2, k === 1 ? '#0b3a44' : '#05060a', { scale: s }); text(g, b, x0 + wa + s * 3 + k * 2, y + k * 2, k === 1 ? '#7a3a08' : '#05060a', { scale: s }); }
  text(g, a, x0, y, '#ffffff', { scale: s });
  for (let r = 0; r < 7 * s; r += s * 2) { g.fillStyle = 'rgba(22,179,163,0.35)'; g.fillRect(x0, y + r + s, wa, s); }
  text(g, b, x0 + wa + s * 3, y, '#ff8a1e', { scale: s });
}

let shotT = 0;
function dialogue(x, y, w, h, line, T) {
  const hot = line && line.urgent;
  if (hot) panel(g, x, y, w, h, { fill: '#f2c218', edge: '#ffe27a', hi: '#fff4b0', lo: '#7a5a08' });
  else panel(g, x, y, w, h);
  if (!line) {
    text(g, 'PIT WALL RADIO', x + w / 2, y + h / 2 - 8, '#3a4660', { align: 'center' });
    text(g, '- quiet -', x + w / 2, y + h / 2 + 2, '#3a4660', { align: 'center' });
    return;
  }
  const p = PEOPLE[line.who] || PEOPLE.dev;
  const shown = Math.min(line.text.length, Math.floor(line.t / 0.032));
  const talking = shown < line.text.length;
  const mouth = talking && (Math.floor(T * 10) % 2);
  const blink = (Math.floor(T * 1.3 + line.who.length) % 7) === 0 && (T * 1.3 % 1) < 0.15;
  g.drawImage(portrait(p, mouth, blink), x + 5, y + 6);
  text(g, p.name, x + 42, y + 6, hot ? '#5a1a00' : '#ffd23a');
  text(g, p.role.toUpperCase(), x + 42 + measure(p.name) + 6, y + 6, hot ? '#7a5a20' : '#6a7898');
  const lines = wrap(line.text, w - 50);
  const vis = line.text.slice(0, shown);
  let used = 0;
  lines.slice(0, 5).forEach((ln, i) => {
    const part = vis.slice(used, used + ln.length);
    used += ln.length + 1;
    text(g, part, x + 42, y + 17 + i * 9, hot ? '#1a1408' : '#e8e6dc');
  });
  // voice blips
  if (talking && shown !== shotT && shown % 2 === 0 && /[a-z0-9]/i.test(line.text[shown] || '')) A.sfx('blip', p.voice + (shown % 5) * 12);
  shotT = shown;
}

// ------------------------------------------------------------ scenes
let scene = null;
let T = 0;
function go(s) { scene = s; s.enter && s.enter(); }

// ===== title
const titleScene = (() => {
  let sel = 0, t = 0, carT = 0, menu = 'main';
  const track = TRACKS[0];
  const idle = () => new PitStop({ car: { compound: 'medium', wear: 0, damage: 0 }, track, compound: 'soft', fuelNow: 0, fuelNeed: 0, rng: rng(5) });
  let demo = null;
  const open = m => { menu = m; sel = 0; };
  const items = () => menu === 'season' ? [
    save.round > 0 && save.round < cal().length ? ['CONTINUE SEASON', () => go(calendarScene)] : null,
    ['NEW SHORT SEASON', () => newSeason('short')],
    ['NEW LONG SEASON', () => newSeason('long')],
    ['BACK', () => open('main')],
  ].filter(Boolean) : [
    ['SEASON', () => open('season')],
    ['PIT PRACTICE', () => go(practiceScene)],
    ['TEAM SETUP', () => go(setupScene)],
    ['OPTIONS', () => openOptions(titleScene)],
    ['HOW TO PLAY', () => go(howScene)],
  ];
  return {
    enter() { t = 0; sel = 0; menu = 'main'; demo = idle(); demo.hints = false; A.music('title'); A.setCrowd(0.4); A.setRain(0); A.duck(false); },
    update(dt) {
      t += dt; carT += dt;
      demo.update(dt);
      // the demo crew plays itself
      autoplay(demo, dt, 0.9);
      if (demo.done) demo = idle();
    },
    draw() {
      g.drawImage(bgFor(track), 0, 0);
      crowdShimmer(T);
      const k = (carT * 0.8) % 1;
      if (k < 0.5) straightCar(g, carSprite(TEAMS[(carT * 0.8 | 0) % 5]), -60 + k * 2 * 640, Y.straightMid, 1);
      demo.draw(g, T);
      g.globalAlpha = 0.72; rect(g, 0, 0, W, H, '#05060a'); g.globalAlpha = 1;
      rect(g, 0, 0, W, 12, '#05060a');
      logo(W / 2, 40, 6);
      text(g, 'A REVERSE RACING GAME. YOU ARE THE PIT CREW.', W / 2, 98, '#9ad8ff', { align: 'center', shadow: '#05060a' });
      const its = items();
      sel = Math.min(sel, its.length - 1);
      its.forEach(([label, fn], i) => button(W / 2 - 70, 116 + i * 20, 140, 17, label, fn, { hot: i === sel }));
      const n = cal().length;
      if (menu === 'season') text(g, 'SHORT: 6 RACES.  LONG: 12 RACES.', W / 2, 118 + its.length * 20, '#6a7898', { align: 'center' });
      else if (save.round > 0 && save.round < n) text(g, `${MODES[save.mode || 'short'].name}: ROUND ${save.round + 1} OF ${n}`, W / 2, 118 + its.length * 20, '#6a7898', { align: 'center' });
      text(g, 'ARROWS + ENTER, OR CLICK', W / 2, H - 28, '#6a7898', { align: 'center' });
      text(g, 'FICTIONAL TEAMS, DRIVERS AND CIRCUITS. NOT AFFILIATED WITH ANY RACING SERIES.', W / 2, H - 14, '#3a4660', { align: 'center' });
    },
    key(k) {
      const its = items();
      if (k === 'up') { sel = (sel + its.length - 1) % its.length; A.sfx('move'); }
      if (k === 'down') { sel = (sel + 1) % its.length; A.sfx('move'); }
      if (k === 'enter' || k === 'space') { A.sfx('select'); its[sel][1](); }
      if (k === 'esc' && menu !== 'main') open('main');
    },
  };
})();

// Plays a stop by itself (title screen demo and the dev bot). skill 0..1
function autoplay(st, dt, skill = 1) {
  st._bt = (st._bt || 0) - dt;
  if (st._bt > 0) return;
  const gap = 0.07 + (1 - skill) * 0.12;
  const tap = k => { st.press(k); st.releaseKey(k); st._bt = gap; };
  if (st.phase === 'arrive') { if (st.t / 1.7 > 0.99) tap('space'); return; }
  if (!st.working || st.settle > 0) return;
  const f = st.fuel;
  if (f.st === 'fill' && f.level >= (f.lo + f.hi) / 2) { st.releaseKey('s'); return; }
  if ((f.st === 'ready' || (f.st === 'idle' && f.level < f.lo)) && !st.held.has('s')) { st.press('s'); return; }
  if (st.fire && st.fire.st === 'on') return tap('x');
  for (const j of ['a', 'd']) if (st.jacks[j].st === 'wait') return tap(j);
  if (st.driver.st === 'show') return tap('w');
  if (st.repair && st.repair.st === 'combo' && st.repair.lock <= 0) return tap(st.repair.seq[st.repair.idx]);
  for (const w of st.wheels) {
    if (st.jacks[w.end].st !== 'up' || w.lock > 0) continue;
    if (w.st === 'wait' || w.st === 'off') return tap(w.key);
    if (w.st === 'warm' && st.heat(w) > 0.85) return tap(w.key);
    if (w.st === 'on' && Math.abs(w.t - 0.55) < 0.03) return tap(w.key);
  }
  if (st.intake && st.intake.st === 'on') return tap('x');
  for (const j of ['a', 'd']) {
    const ok = st.wheels.filter(w => w.end === j).every(w => w.st === 'done') && (j === 'a' || !st.repair || st.repair.st === 'done');
    if (st.jacks[j].st === 'up' && ok) return tap(j);
  }
  if (st.phase === 'release' && st.danger() === 0) tap('space');
}

// ===== how to play
const howScene = {
  enter() {},
  update() {},
  draw() {
    rect(g, 0, 0, W, H, '#0a0c14');
    topBar('HOW TO PLAY', '', 'ESC / ENTER: BACK');
    text(g, 'YOUR KEYBOARD IS A MAP OF THE CAR', W / 2, 20, '#ffd23a', { align: 'center', scale: 2 });
    // car diagram with keys at the wheels
    const cx = 112, cy = 92;
    for (const w of WHEELS) g.drawImage(wheelSprite('soft'), cx - 39 + w.x, cy - 16 + w.y);
    g.drawImage(carSprite(TEAMS[0]), cx - 39, cy - 16);
    const keyCap = (x, y, k, c = '#ffffff') => { rect(g, x - 7, y - 7, 15, 15, '#05060a'); rect(g, x - 6, y - 6, 13, 12, c); rect(g, x - 6, y + 4, 13, 2, shade(c, -0.4)); text(g, k, x + 1, y - 3, '#0a0a10', { align: 'center' }); };
    keyCap(cx - 24, cy - 32, O.label('q')); keyCap(cx + 20, cy - 32, O.label('e')); keyCap(cx - 24, cy + 32, O.label('z')); keyCap(cx + 20, cy + 32, O.label('c'));
    keyCap(cx - 58, cy, O.label('a'), '#9ad8ff'); keyCap(cx + 58, cy, O.label('d'), '#9ad8ff');
    keyCap(cx - 2, cy + 32, O.label('s'), '#7cff8a'); keyCap(cx - 2, cy - 32, O.label('w'), '#9ad8ff'); keyCap(cx - 2, cy + 54, O.label('x'), '#ff9a7a');
    const rows = [
      [O.label('space'), 'Stop the car on the ring as it slides in'],
      [`${O.label('a')}  ${O.label('d')}`, 'Lift rear / front jack. Again to drop'],
      [['q', 'e', 'z', 'c'].map(O.label).join(' '), 'Guns: mash to loosen, tap on the ring'],
      [O.label('s'), 'Hold to fuel, let go in the green'],
      [['up', 'down', 'left', 'right'].map(O.label).join(''), 'Nose swap: type the keys shown'],
      [O.label('x'), 'Mash: blow out sand, kill a fire'],
      [O.label('w'), 'Driver: visor or drink, for a bonus'],
      [O.label('space'), 'Release on green. Not into traffic'],
    ];
    rows.forEach(([k, d], i) => { text(g, k, 222, 44 + i * 13, '#ffd23a'); text(g, d, 272, 44 + i * 13, '#e8e6dc'); });
    const tips = [
      'Between stops, the race runs on its own. Dev calls the cars in when the plan says so.',
      `Press ${O.label('box7')} or ${O.label('box11')} (or tap BOX) to bring ${DRIVERS[0].name.split(' ')[0]} (car 7) or ${DRIVERS[1].name.split(' ')[0]} (car 11) in early, or to wave off a call.`,
      `When a car turns into the pit lane, pick its tyres with ${['pick_soft', 'pick_medium', 'pick_hard', 'pick_wet'].map(O.label).join(' ')}, or ${O.label('pick_none')} to leave them on. Dev's pick is underlined in green.`,
      'Everything overlaps: fuel while you gun the wheels. Faster stops gain places. Mistakes cost seconds.',
      'Touch screens: tap the key bubbles. Hold the S bubble to fuel.',
    ];
    let ty = 158;
    tips.forEach((tp, i) => wrap(tp, 464).forEach(l => { text(g, l, 24, ty, i === 0 ? '#9ad8ff' : '#c8ccd4'); ty += 10; }));
    button(W / 2 - 50, H - 30, 100, 18, 'BACK', () => go(titleScene), { hot: true });
  },
  key(k) { if (k === 'esc' || k === 'enter' || k === 'space') go(titleScene); },
};

// ===== calendar
function standings() {
  return TEAMS.map((t, i) => ({ t, i, pts: save.team[t.id] || 0 })).sort((a, b) => b.pts - a.pts);
}
const calendarScene = {
  enter() { A.music('title'); A.setCrowd(0); A.setRain(0); },
  update() {},
  draw() {
    rect(g, 0, 0, W, H, '#0a0c14');
    for (let y = 12; y < H; y += 4) rect(g, 0, y, W, 1, '#0d1018');
    topBar("PIT CREW '26", `${MODES[save.mode || 'short'].name}: ${cal().length} RACES`, 'ENTER: NEXT RACE  ESC: TITLE');
    text(g, TEAMS[0].name.toUpperCase(), 16, 22, TEAMS[0].c1, { scale: 2, shadow: '#05060a' });
    const races = cal(), long = races.length > 6;
    races.forEach((tr, i) => {
      const done = save.results[i];
      const next = i === save.round;
      if (long) {
        // twelve rounds: one line each
        const y = 42 + i * 15;
        panel(g, 12, y, 300, 14, { fill: next ? '#18324a' : '#141826', edge: next ? '#16b3a3' : '#3a4660', hi: next ? '#6ae0d4' : '#5c6a8a', lo: '#0e1220' });
        text(g, `R${i + 1}`, 18, y + 4, '#6a7898');
        text(g, tr.name.toUpperCase(), 40, y + 4, next ? '#ffffff' : done ? '#c8ccd4' : '#8a96b0');
        text(g, `${TIME_NAME[tr.time]}${tr.weather.some(w => w.wet) ? ' RAIN' : ''}`, 186, y + 4, '#5a6888');
        if (done) text(g, `P${done.a} P${done.b} +${done.pts}`, 306, y + 4, '#ffd23a', { align: 'right' });
        else if (next) text(g, 'NEXT', 306, y + 4, '#7cff8a', { align: 'right' });
        return;
      }
      const y = 46 + i * 30;
      panel(g, 12, y, 300, 26, { fill: next ? '#18324a' : '#141826', edge: next ? '#16b3a3' : '#3a4660', hi: next ? '#6ae0d4' : '#5c6a8a', lo: '#0e1220' });
      text(g, `R${i + 1}`, 20, y + 6, '#6a7898');
      text(g, tr.name.toUpperCase(), 40, y + 6, next ? '#ffffff' : done ? '#c8ccd4' : '#8a96b0');
      text(g, tr.gp, 40, y + 15, '#6a7898');
      const tags = tr.mods.map(m => MOD_INFO[m][2]);
      let tagStr = tags.join(' / ');
      for (let k = tags.length - 1; k > 0 && measure(tagStr) > 300 - 52 - measure(tr.gp); k--) tagStr = tags.slice(0, k).join(' / ') + ` +${tags.length - k}`;
      text(g, tagStr, 306, y + 15, '#5a6888', { align: 'right' });
      if (done) text(g, `P${done.a}  P${done.b}  +${done.pts}`, 306, y + 6, '#ffd23a', { align: 'right' });
      else if (next) text(g, 'NEXT', 306, y + 6, '#7cff8a', { align: 'right' });
    });
    panel(g, 324, 46, 176, 176);
    text(g, 'CONSTRUCTORS', 412, 54, '#ffd23a', { align: 'center' });
    standings().forEach((s, k) => {
      const y = 70 + k * 18;
      rect(g, 334, y, 4, 12, s.t.c1);
      text(g, `${k + 1}`, 344, y + 3, '#9aa8c8');
      text(g, s.t.short, 356, y + 3, s.i === 0 ? '#ffffff' : '#c8ccd4');
      text(g, String(s.pts), 490, y + 3, '#ffd23a', { align: 'right' });
    });
    const dp = DRIVERS.filter(d => d.team === 0).map(d => `${d.name.split(' ')[1].toUpperCase()} ${save.drv[d.code] || 0}`).join('   ');
    text(g, dp, 412, 168, '#9ad8ff', { align: 'center' });
    if (save.round < cal().length) button(324, 230, 176, 22, `GO TO ROUND ${save.round + 1}`, nextRace, { hot: true });
    else button(324, 230, 176, 22, 'SEASON REVIEW', () => go(seasonScene), { hot: true });
    button(12, 230, 100, 22, 'TITLE', () => go(titleScene), { color: '#5c6a8a' });
    button(118, 230, 110, 22, 'TEAM SETUP', () => go(setupScene), { color: '#5c6a8a' });
  },
  key(k) {
    if (k === 'enter' || k === 'space') nextRace();
    if (k === 'esc') go(titleScene);
  },
};

// ===== briefing
const briefingScene = {
  enter() {
    this.tr = cal()[save.round]; this.map = bakeMap(this.tr, 150, 110); this.t = 0;
    setConditions(this.tr);
    const pool = (this.tr.shutdown ? LINES.SHUTDOWN.BRIEF : LINES.BRIEF[this.tr.id] || []).concat(dryLines(this.tr, 'brief')) || [['mags', 'Gloves on. Same as always.']];
    this.quote = pickFresh(pool);
    saveHeard();
  },
  update(dt) { this.t += dt; },
  draw() {
    const tr = this.tr;
    g.drawImage(bgFor(tr), 0, 0);
    g.globalAlpha = 0.8; rect(g, 0, 0, W, H, '#05060a'); g.globalAlpha = 1;
    topBar(`ROUND ${save.round + 1} OF ${cal().length}`, tr.gp.toUpperCase(), `${tr.laps} LAPS  ${TIME_NAME[tr.time] || ''}`);
    text(g, tr.name.toUpperCase(), 20, 24, '#ffffff', { scale: 3, shadow: '#0b3a44' });
    wrap(tr.blurb, 300).forEach((l, i) => text(g, l, 20, 50 + i * 10, '#c8ccd4'));
    panel(g, 340, 22, 160, 120);
    g.drawImage(this.map.c, 345, 27);
    // a dot running around the map
    const [mx, my] = this.map.map(this.map.P(this.t * 0.12));
    ellipse(g, 345 + mx, 27 + my, 2, 2, '#ff8a1e');
    let y = 86;
    text(g, 'CONDITIONS', 20, y, '#ffd23a'); y += 12;
    for (const m of tr.mods) {
      const [a, b] = MOD_INFO[m];
      rect(g, 20, y + 1, 4, 4, '#ff8a1e');
      text(g, a, 30, y, '#ffffff');
      for (const l of wrap(b, 220)) { text(g, l, 112, y, '#9aa8c8'); y += 9; }
      y += 2;
    }
    // rival par and best stop sit below the map so they get the full width
    y = Math.max(y + 4, 148);
    text(g, `RIVAL CREWS AVERAGE ${(tr.par * TV).toFixed(2)}s HERE. BEAT THAT AND YOU GAIN PLACES.`, 20, y, '#7cff8a');
    y += 11;
    if (save.best[tr.id]) { text(g, `YOUR BEST STOP HERE: ${save.best[tr.id].toFixed(2)}s`, 20, y, '#ffd23a'); y += 11; }
    // crew line, never over the text above
    const [who, raw] = this.quote, person = PEOPLE[who] || PEOPLE.mags, line = rename(raw);
    const ql = wrap(line, 420);
    const py = Math.max(184, y + 4), ph = Math.max(44, 22 + ql.length * 10);
    panel(g, 20, py, 472, ph);
    g.drawImage(portrait(person, Math.floor(this.t * 8) % 2 && this.t < 1.6 ? 1 : 0), 26, py + 6);
    text(g, person.name, 64, py + 8, '#ffd23a');
    ql.forEach((l, i) => text(g, l, 64, py + 20 + i * 10, '#e8e6dc'));
    const by = Math.max(240, py + ph + 8);
    button(W / 2 - 70, by, 140, 22, 'LIGHTS OUT', () => go(raceScene(tr, save.round)), { hot: true, color: '#d42a24' });
    button(20, by, 80, 22, 'BACK', () => go(calendarScene), { color: '#5c6a8a' });
  },
  key(k) { if (k === 'enter' || k === 'space') go(raceScene(this.tr, save.round)); if (k === 'esc') go(calendarScene); },
};

// ===== race
const BOXES = { brw: BOX_X, ros: 96, krn: 416, azv: 640, grh: 760 };
const firstName = c => c.d.name.split(' ')[0];
const drvKey = c => c.i === 0 ? 'nico' : 'sanna';

function raceScene(track, round, { practice = false } = {}) {
  setConditions(track);
  const seed = (Date.now() & 0xffff) + round * 7919;
  const r = rng(seed);
  const race = new Race(track, { seed, round, flagChance: practice ? 0 : 1.5 / cal().length });
  const bg = bgFor(track);
  const map = bakeMap(track, 96, 60);
  const dir = new Director(PEOPLE, r);
  const th = theme(track);
  const wkind = track.weather.some(w => w.wet) ? 'rain' : track.theme === 'alpine' ? 'snow' : track.theme === 'desert' ? 'sand' : 'rain';
  const own = (track.shutdown ? LINES.SHUTDOWN.TRACK_IDLE : LINES.TRACK_IDLE[track.id] || []).concat(dryLines(track, 'idle'));
  const idlePool = LINES.IDLE.concat(own, own);
  const S = {
    race, track, stop: null, leaving: null, pickers: [], pepT: 0, lightsT: 0, lights: 0, go: false, paused: false, pauseSel: 0,
    log: [], toast: null, overT: 0, passX: {}, idle: new PitStop({ car: { compound: 'medium', wear: 0, damage: 0 }, track, compound: 'medium', fuelNow: 0, fuelNeed: 0, rng: r }),
    lastPass: 0, holdT: 0.6 + r() * 0.8,
  };
  const vars = c => ({ d: firstName(c), drv: drvKey(c), n: c.num, p: c.pos, x: track.name });
  if (!practice) { dir.clear(); dir.say(pepTalk(track, r), {}, 2); saveHeard(); }

  function toast(msg, color = '#ffd23a') { S.toast = { msg, color, t: 0 }; }

  function startStop(c) {
    // each car keeps its own tyre call, so a double stack can't mix them up
    const pi = S.pickers.findIndex(p => p.car === c);
    let pick = pi >= 0 ? S.pickers[pi].choice : race.recommend(c);
    if (pi >= 0) S.pickers.splice(pi, 1);
    if (pick === 'none' && c.puncture) pick = race.recommend(c);
    S.stop = new PitStop({
      car: c, track, compound: pick === 'none' ? c.compound : pick, keepTyres: pick === 'none', fuelNow: Math.max(0, c.fuel), fuelNeed: race.fuelNeed(c), rng: r,
      sfx: (n, p) => A.sfx(n, p), hints: track.hints || round === 0,
      external: () => laneCars().filter(o => o.moving).map(o => o.x),
    });
    A.duck(true);
  }

  function finishStop(st) {
    const c = st.car;
    const res = st.result();
    race.service(c, {
      compound: res.compound, tyres: res.tyres, fuel: Math.max(0, res.fuel - Math.max(0, c.fuel)), repaired: res.repaired,
      cold: res.cold, bonus: res.bonus, penalty: res.penalty,
    });
    race.release(c);
    const par = track.par * TV;
    const grade = res.unsafe ? 'unsafe' : res.tv < par * 0.85 ? 'lightning' : res.tv < par ? 'great' : res.tv < par * 1.2 ? 'ok' : 'slow';
    const full = res.tyres && res.fuelled;
    S.log.push({ num: c.num, lap: c.lapsDone, tv: res.tv, grade, notes: res.notes, compound: res.compound, full });
    if (!practice && full && (!save.best[track.id] || res.tv < save.best[track.id])) { save.best[track.id] = res.tv; persist(); }
    toast(`${res.tv.toFixed(2)}s  ${grade === 'lightning' ? 'LIGHTNING!' : grade.toUpperCase()}`, grade === 'slow' || grade === 'unsafe' ? '#ff6a5a' : grade === 'ok' ? '#ffe27a' : '#7cff8a');
    if (grade === 'lightning' || grade === 'great') A.sfx('cheer');
    const v = { ...vars(c), t: res.tv.toFixed(2) };
    let key = grade;
    if (res.fire) key = 'fire'; else if (res.fuelShort) key = 'short'; else if (res.cold && grade !== 'lightning') key = 'cold'; else if (st.offset > 18 && grade !== 'unsafe') key = 'overshoot';
    if (grade === 'unsafe') key = 'unsafe';
    dir.sayFrom(LINES.REACT[key], v, 2);
    A.duck(false);
  }

  // Cars in the pit lane other than the one in our box: x along the fast lane, y, sprite info.
  function laneCars() {
    const out = [];
    for (const c of race.cars) {
      const bx = BOXES[c.team.id];
      if (c.player) {
        if (c.state === 'wait') out.push({ c, x: -18, y: Y.laneMid, moving: false });
        continue;
      }
      if (c.state === 'in') {
        const p = Math.min(1, c.stateT / IN_T);
        const x = -90 + (bx + 90) * p;
        const turn = bx < 500 ? Math.max(0, (p - 0.8) / 0.2) : 0;
        out.push({ c, x, y: Y.laneMid + (Y.box - Y.laneMid) * turn * turn, moving: turn < 0.3 });
      } else if (c.state === 'box') {
        if (bx < 500) out.push({ c, x: bx, y: Y.box, moving: false, boxed: true });
      } else if (c.state === 'out') {
        const p = Math.min(1, c.stateT / OUT_T);
        const x = bx + (720 - bx) * p;
        const lift = Math.min(1, p * 4);
        out.push({ c, x, y: bx < 500 ? Y.box + (Y.laneMid - Y.box) * lift : Y.laneMid, moving: lift > 0.6 });
      }
    }
    return out;
  }

  function handleEvents() {
    for (const e of race.events) {
      const c = e.car;
      switch (e.type) {
        case 'start': { const own = (track.shutdown ? LINES.SHUTDOWN.TRACK_START : LINES.TRACK_START[track.id] || []).concat(dryLines(track, 'start')); dir.sayFrom(own.length ? own : LINES.START, { x: track.name }, 2); break; }
        case 'boxCall': dir.sayFrom(LINES.BOXCALL, vars(c), 3); A.sfx('radio'); toast(`BOX BOX: CAR ${c.num}`, '#ff8a1e'); break;
        case 'pitEntry':
          if (c.player) { S.pickers = S.pickers.filter(p => p.car !== c); S.pickers.push({ car: c, choice: race.recommend(c), rec: race.recommend(c) }); A.sfx('radio'); }
          break;
        case 'arrive': startStop(c); break;
        case 'queue': dir.sayFrom(LINES.EVENTS.queue, vars(c), 3); break;
        case 'rain': dir.sayFrom(LINES.EVENTS.rain, {}, 3); toast('RAIN!', '#9ad8ff'); break;
        case 'dry': dir.sayFrom(LINES.EVENTS.dry, {}, 2); toast('TRACK DRYING', '#ffd23a'); break;
        case 'damage': if (c.player) { dir.sayFrom(LINES.EVENTS.damage, vars(c), 3); A.sfx('radio'); } break;
        case 'puncture': if (c.player) dir.sayFrom(LINES.EVENTS.puncture, vars(c), 3); break;
        case 'fuelOut': if (c.player) dir.sayFrom(LINES.EVENTS.fuelOut, vars(c), 3); break;
        case 'gain': if (r() < 0.45) dir.sayFrom(LINES.EVENTS.gain, vars(c), 1); break;
        case 'lose': if (r() < 0.3) dir.sayFrom(LINES.EVENTS.lose, vars(c), 1); break;
        case 'rivalPit': if (r() < 0.25) dir.sayFrom(LINES.EVENTS.rivalPit, { r: c.team.short }, 1); break;
        case 'lastLap': dir.sayFrom(LINES.EVENTS.lastLap, {}, 2); toast('FINAL LAP', '#ffffff'); break;
        case 'late': dir.sayFrom(LINES.EVENTS.late, vars(c), 3); toast(`CAR ${c.num}: TOO LATE TO STOP`, '#9ad8ff'); break;
        case 'chequered': toast('CHEQUERED FLAG', '#ffffff'); A.sfx('cheer'); break;
        case 'whiteFlag': {
          const fv = { r: c.team.name.split(' ')[0], c: c.d.name.split(' ').slice(1).join(' ') || c.d.name };
          dir.sayFrom(LINES.FLAG.INCIDENT[e.kind] || LINES.FLAG.INCIDENT.crash, fv, 3);
          dir.sayFrom(LINES.FLAG.BOX, {}, 3);
          toast(e.kind === 'crash' ? `${fv.r.toUpperCase()} BINNED IT! WHITE FLAG` : 'WHITE FLAG', '#ffffff');
          A.sfx('radio');
          break;
        }
        case 'flagEnd': dir.sayFrom(LINES.FLAG.CLEAR, {}, 2); toast('GREEN FLAG', '#7cff8a'); break;
        case 'over': break;
      }
    }
    race.events.length = 0;
  }

  function endRace() {
    const res = race.result;
    const pts = {};
    res.forEach((c, k) => { pts[c.i] = c.dnf ? 0 : POINTS[k] || 0; });
    if (!practice) {
      for (const c of res) { save.team[c.team.id] = (save.team[c.team.id] || 0) + pts[c.i]; save.drv[c.code] = (save.drv[c.code] || 0) + pts[c.i]; }
      const a = race.cars[0].final, b = race.cars[1].final;
      save.results[round] = { a, b, pts: pts[0] + pts[1], best: Math.min(...S.log.filter(l => l.full).map(l => l.tv), 99) };
      // every car's finish, kept per round for the debug tables
      (save.log = save.log || [])[round] = res.map((c, k) => ({ i: c.i, t: c.team.id, pos: k + 1, pts: pts[c.i], dnf: !!c.dnf }));
      save.round = round + 1;
      persist();
    }
    go(resultsScene(track, race, S.log, pts, round));
  }

  function pickerKey(k) {
    const p0 = S.pickers[0];
    if (!p0) return false;
    const i = PICK_ACTS.indexOf(k);
    if (i < 0) return false;
    if (!pickable(p0, PICKS[i])) { A.sfx('buzz'); return true; }
    p0.choice = PICKS[i];
    A.sfx('select');
    return true;
  }

  function drawStraight() {
    const now = race.time;
    for (const c of race.cars) {
      const f = c.dist - Math.round(c.dist);
      if (c.state !== 'run' && c.finish == null) continue;
      if (Math.abs(f) > 0.04) continue;
      const x = 300 + f / 0.035 * 300;
      straightCar(g, carSprite(c.team), x, Y.straightMid + (c.i % 3 - 1) * 2, 1);
      const key = c.i;
      const lap = Math.round(c.dist);
      if (race.started && f > 0 && S.passX[key] !== lap) { S.passX[key] = lap; if (now - S.lastPass > 0.12) { A.pass(1, c.player ? 1.2 : 0.7); S.lastPass = now; } }
    }
  }

  function drawLane() {
    for (const o of laneCars()) {
      const c = o.c;
      const spr = carSprite(c.team, { damaged: c.damage > 0 });
      const x = Math.round(o.x), y = Math.round(o.y);
      if (o.boxed) {
        // rival crew around their car
        const tm = { ...c.team, helmetCrew: '#e8e8e8' };
        for (const [dx, dy, d] of [[-24, -26, 2], [20, -26, 2], [-24, 26, 0], [20, 26, 0]]) crew(g, x + dx, y + dy, d, tm, { tool: 'gun', reach: 0.6 + Math.sin(T * 40 + dx) * 0.3 });
        crew(g, x - 52, y, 1, tm, { tool: 'jack', reach: 0.2 });
        crew(g, x + 54, y, 3, tm, { tool: 'jack', reach: 0.2 });
      }
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 36, y - 11, 76, 26);
      const spin = o.moving ? (T * 30 | 0) % 3 : 0;
      for (const w of WHEELS) g.drawImage(wheelSprite(c.compound, spin), x - 39 + w.x, y - 16 + w.y);
      g.drawImage(spr, x - 39, y - 16);
    }
  }

  function whiteFlag() {
    const x = 352, y = Y.wall - 2, wave = Math.sin(T * 12);
    rect(g, x, y - 18, 1, 20, '#c8ccd4');
    for (let i = 0; i < 12; i++) rect(g, x + 1 + i, y - 18 + Math.round(Math.sin(T * 12 + i * 0.6) * 1.5), 1, 8, i % 4 === 0 && wave > 0 ? '#d8dce4' : '#ffffff');
  }

  function drawTower() {
    const x0 = 2, y0 = 14, w = 80, fade = S.stop && S.stop.phase !== 'arrive' ? 0.45 : 1;
    g.globalAlpha = 0.86 * fade;
    rect(g, x0, y0, w, 9 + race.order.length * 8 + 1, '#05060a');
    g.globalAlpha = fade;
    rect(g, x0, y0, w, 8, '#16b3a3');
    text(g, `LAP ${Math.max(1, Math.min(race.laps, Math.floor(race.order[0].dist) + 1))}/${race.laps}`, x0 + 3, y0 + 1, '#05060a');
    race.order.forEach((c, k) => {
      const y = y0 + 10 + k * 8;
      if (c.player) rect(g, x0, y - 1, w, 8, '#0b3a44');
      rect(g, x0 + 1, y, 2, 6, c.team.c1);
      text(g, String(k + 1), x0 + 15, y, '#9aa8c8', { align: 'right' });
      text(g, c.code, x0 + 19, y, c.penalty ? '#ff6a5a' : c.player ? '#ffffff' : '#c8ccd4');
      let right;
      if (c.state === 'in' || c.state === 'box' || c.state === 'wait' || c.state === 'out') right = ['PIT', '#ff8a1e'];
      else if (c.finish != null) right = ['FIN', '#7cff8a'];
      else if (c.dnf) right = ['OUT', '#ff6a5a'];
      else if (k === 0) right = ['LEAD', '#ffd23a'];
      else right = ['+' + (race.gapToLeader(c) * TV).toFixed(1), '#9aa8c8'];
      text(g, right[0], x0 + w - 3, y, right[1], { align: 'right' });
      tyreIcon(g, x0 + 42, y + 3, c.compound, 1.5);
    });
    g.globalAlpha = 1;
  }

  function drawMap() {
    const x0 = 412, y0 = 14;
    g.globalAlpha = 0.86; rect(g, x0, y0, 98, 62, '#05060a'); g.globalAlpha = 1;
    g.drawImage(map.c, x0 + 1, y0 + 1);
    for (const c of race.order.slice().reverse()) {
      const [mx, my] = map.map(map.P(c.dist));
      if (c.player) {
        ellipse(g, x0 + 1 + mx, y0 + 1 + my, 3, 3, '#05060a');
        ellipse(g, x0 + 1 + mx, y0 + 1 + my, 2.2, 2.2, (T * 3 % 1) < 0.7 ? '#ffd23a' : '#16b3a3');
      } else {
        rect(g, x0 + mx - 1, y0 + my - 1, 3, 3, '#05060a');
        rect(g, x0 + mx, y0 + my, 2, 2, c.team.c1);
      }
    }
    if (race.wet > 0.05) text(g, 'WET', x0 + 94, y0 + 54, '#9ad8ff', { align: 'right' });
  }

  function carCard(c, x) {
    const y = Y.panel, w = 150, h = 72;
    panel(g, x, y, w, h, { fill: '#10141f' });
    rect(g, x + 3, y + 3, w - 6, 10, '#0b3a44');
    rect(g, x + 3, y + 3, 3, 10, '#ff8a1e');
    text(g, `#${c.num} ${c.d.name.split(' ')[1].toUpperCase()}`, x + 10, y + 5, '#ffffff');
    text(g, c.finish != null ? `P${c.pos}` : `P${c.pos}`, x + w - 6, y + 5, '#ffd23a', { align: 'right' });
    g.drawImage(portrait(PEOPLE[drvKey(c)], 0, false), x + 5, y + 16);
    const bx = x + 42;
    tyreIcon(g, bx + 4, y + 20, c.compound, 3);
    text(g, COMPOUNDS[c.compound].name, bx + 11, y + 17, '#c8ccd4');
    // one bar per tyre: FL FR | RL RR (race tyre order is RL FL RR FR)
    [1, 3, 0, 2].forEach((ti, k) => {
      const left = 1 - Math.min(1, c.tw[ti]);
      const tx = bx + 60 + k * 10 + (k > 1 ? 2 : 0), ty = y + 15;
      rect(g, tx, ty, 8, 10, '#0a0a10');
      const hgt = Math.round(8 * left);
      rect(g, tx + 1, ty + 9 - hgt, 6, hgt, left < 0.25 ? '#ff5a2a' : left < 0.5 ? '#ffd23a' : '#7cff8a');
    });
    text(g, 'FUEL', bx, y + 28, '#9aa8c8');
    const fl = Math.max(0, c.fuel) / Math.max(1, race.laps - Math.floor(c.dist));
    bar(g, bx + 26, y + 28, 76, 6, Math.min(1, Math.max(0, c.fuel) / TANK), fl < 0.999 && c.fuel < race.laps - c.dist ? '#ffd23a' : '#4ad8a0');
    // status
    let st = '', col = '#9aa8c8';
    if (c.outOfFuel) { st = 'OUT OF FUEL'; col = '#ff5a2a'; }
    else if (c.puncture) { st = 'PUNCTURE'; col = '#ff5a2a'; }
    else if (c.damage) { st = 'WING DAMAGE'; col = '#ff8a1e'; }
    else if (c.compound !== 'wet' && race.wet > 0.4) { st = 'NEEDS WETS'; col = '#9ad8ff'; }
    else if (c.compound === 'wet' && race.wet < 0.2 && race.wetTarget === 0) { st = 'WETS OVERHEATING'; col = '#ffd23a'; }
    else if (c.cold) { st = 'COLD TYRES'; col = '#9ad8ff'; }
    else if (race.flag && c.state === 'run' && !c.box) { st = 'WHITE FLAG: BOX?'; col = '#ffffff'; }
    else if (c.penalty) { st = '+5s PENALTY'; col = '#ff6a5a'; }
    else { const k = race.order.indexOf(c); const ahead = race.order[k - 1]; st = ahead ? `GAP AHEAD ${((ahead.dist - c.dist) * 18 * TV).toFixed(1)}s` : 'LEADING'; }
    text(g, st, bx, y + 39, col);
    const lapsLeft = race.laps - Math.floor(c.dist);
    // box button
    const key = O.label(c.i === 0 ? 'box7' : 'box11');
    let label, color = '#d42a24', dis = false;
    if (c.finish != null) { label = `FINISHED P${c.pos}`; dis = true; }
    else if (c.state === 'in') { label = 'PIT ENTRY'; dis = true; color = '#ff8a1e'; }
    else if (c.state === 'wait') { label = 'QUEUED'; dis = true; }
    else if (c.state === 'box') { label = 'IN THE BOX'; dis = true; }
    else if (c.state === 'out') { label = 'PIT EXIT'; dis = true; }
    else if (c.box) { label = (T * 2 % 1 < 0.5 ? '> ' : '  ') + `BOXING [${key}]`; color = '#ff8a1e'; }
    else if (lapsLeft <= 1) { label = 'FINAL LAP'; dis = true; }
    else { label = `[${key}] CALL TO BOX`; color = '#2457d6'; }
    button(x + 5, y + 51, w - 10, 16, label, () => toggle(c), { color, disabled: dis || !race.started });
  }

  function toggle(c) {
    if (!race.started) return;
    const on = race.toggleBox(c);
    A.sfx('radio');
    if (on) { dir.sayFrom(LINES.BOXCALL, vars(c), 3); toast(`BOX BOX: CAR ${c.num}`, '#ff8a1e'); }
    else { dir.say([['dev', `Stay out, ${firstName(c)}. Stay out.`]], {}, 3); toast(`CAR ${c.num}: STAY OUT`, '#9ad8ff'); }
  }

  function stopHud(st) {
    const x = 150, y = Y.panel, w = 212, h = 72;
    panel(g, x, y, w, h, { fill: '#0a0c14', edge: '#ff8a1e', hi: '#ffd08a', lo: '#3a1e08' });
    const t = (st.release.time ?? st.clock) * TV;
    text(g, `CAR ${st.car.num}`, x + 8, y + 6, '#ff8a1e');
    text(g, st.phase === 'arrive' ? 'INCOMING' : t.toFixed(2), x + 8, y + 18, st.phase === 'arrive' ? '#ffd23a' : '#ffffff', { scale: 3 });
    text(g, `PAR ${(track.par * TV).toFixed(2)}`, x + 8, y + 46, '#6a7898');
    const best = save.best[track.id];
    if (best) text(g, `BEST ${best.toFixed(2)}`, x + 8, y + 56, '#6a7898');
    // checklist
    const items = [
      ['JACKS', st.jacks.a.st !== 'wait' && st.jacks.d.st !== 'wait'],
      ['WHEELS', st.wheels.every(w => w.st === 'done')],
      st.fuel.st !== 'skip' ? ['FUEL', st.fuel.st === 'idle' && st.fuel.level >= st.fuel.lo - 0.05] : null,
      st.repair ? ['NOSE', st.repair.st === 'done'] : null,
      st.intake ? ['SAND', st.intake.st === 'done'] : null,
      st.fire ? ['FIRE', st.fire.st === 'out'] : null,
      ['DROP', st.jacks.a.st === 'down' && st.jacks.d.st === 'down' && st.caught],
      ['RELEASE', st.phase === 'leave' || st.phase === 'done'],
    ].filter(Boolean);
    items.forEach(([lab, ok], i) => {
      const yy = y + 6 + i * 8;
      rect(g, x + 128, yy, 5, 5, '#05060a'); rect(g, x + 129, yy + 1, 3, 3, ok ? '#7cff8a' : '#3a3e48');
      text(g, lab, x + 137, yy - 1, ok ? '#7cff8a' : '#9aa8c8');
    });
    if (st.keepTyres) text(g, 'NO TYRES', x + 92, y + 6, '#9aa8c8', { align: 'center' });
    else text(g, COMPOUNDS[st.compound].name, x + 92, y + 6, COMPOUNDS[st.compound].color, { align: 'center' });
  }

  function drawPicker() {
    const p = S.pickers[0], nextUp = S.pickers[1];
    // over the garage normally; up over the straight when a stop is already on (double stack)
    const x = 126, y = S.stop ? 14 : 168, w = 260, h = 46;
    panel(g, x, y, w, h, { fill: '#10141f', edge: '#ff8a1e', hi: '#ffd08a', lo: '#3a1e08' });
    text(g, `CAR ${p.car.num} IN THE PIT LANE. TYRES?`, x + 6, y + 6, '#ffd23a');
    text(g, nextUp ? `THEN CAR ${nextUp.car.num}` : `DEV: ${COMPOUNDS[p.rec].name}`, x + w - 6, y + 6, nextUp ? '#ff8a1e' : '#7cff8a', { align: 'right' });
    PICKS.forEach((k, i) => {
      const bx = x + 6 + i * 50, by = y + 16;
      const on = p.choice === k, off = !pickable(p, k);
      rect(g, bx, by, 48, 26, '#05060a');
      rect(g, bx + 1, by + 1, 46, 24, off ? '#14161c' : on ? '#2a3a5a' : '#161a26');
      if (on) { rect(g, bx + 1, by + 1, 46, 1, '#ffd23a'); rect(g, bx + 1, by + 24, 46, 1, '#ffd23a'); }
      if (p.rec === k) rect(g, bx + 1, by + 24, 46, 1, '#7cff8a');
      keycap(bx + 3, by + 3, O.label(PICK_ACTS[i]), off);
      if (k === 'none') {
        ellipse(g, bx + 37, by + 8, 5, 5, '#0a0a10'); ellipse(g, bx + 37, by + 8, 4, 4, '#5a5e68'); ellipse(g, bx + 37, by + 8, 2.5, 2.5, '#1a1a1f');
        for (let d = -4; d <= 4; d++) rect(g, bx + 37 + d, by + 8 - d, 1, 1, '#ff5a4a');
      } else tyreIcon(g, bx + 37, by + 8, k, 4);
      text(g, PICK_NAME[k], bx + 24, by + 16, off ? '#4a4e58' : on ? '#ffffff' : '#9aa8c8', { align: 'center' });
      if (!off) ui.push({ x: bx, y: by, w: 48, h: 26, fn: () => { p.choice = k; } });
    });
  }

  function drawLights() {
    const x = W / 2 - 60, y = 18;
    panel(g, x, y, 120, 26, { fill: '#05060a' });
    for (let i = 0; i < 5; i++) {
      const on = S.go ? false : i < S.lights;
      ellipse(g, x + 16 + i * 22, y + 13, 7, 7, '#1a1a1f');
      ellipse(g, x + 16 + i * 22, y + 13, 5, 5, on ? '#ff2a1a' : '#3a1010');
      if (on) rect(g, x + 14 + i * 22, y + 10, 2, 2, '#ffb0a0');
    }
  }

  const obj = {
    S,
    enter() { A.music('race'); A.setCrowd(0.7); A.duck(false); particles.length = 0; },
    update(dt) {
      if (S.paused) return;
      if (S.toast) { S.toast.t += dt; if (S.toast.t > 2.2) S.toast = null; }
      if (!S.go && dir.talking && S.pepT < 45) S.pepT += dt; // the lights wait for Dev to finish
      else if (!S.go) {
        S.lightsT += dt;
        const n = Math.min(5, Math.floor(S.lightsT / 0.75));
        if (n > S.lights) { S.lights = n; A.sfx('light'); }
        if (S.lights === 5 && S.lightsT > 5 * 0.75 + S.holdT) { S.go = true; race.start(); A.sfx('go'); A.sfx('cheer'); toast('LIGHTS OUT!', '#7cff8a'); }
      }
      race.update(dt);
      handleEvents();
      if (S.stop) {
        S.stop.update(dt);
        if (DEV && window.__pc.bot) autoplay(S.stop, dt, 1);
        if (S.stop.phase === 'leave') { finishStop(S.stop); S.leaving = S.stop; S.stop = null; }
      }
      if (S.leaving) { S.leaving.update(dt); if (S.leaving.done) S.leaving = null; }
      if (S.stop && S.stop.fuel.st === 'fill') A.fuelPitch(S.stop.fuel.level / (TANK + 1));
      setLapsDone(Math.floor(race.order[0].dist));
      dir.update(dt, !!S.stop && S.stop.phase !== 'arrive', S.go ? idlePool : null);
      A.setRain(race.wet);
      if (race.over) { S.overT += dt; if (S.overT > 2.4) { saveHeard(); endRace(); } }
      if (DEV && window.__pc.bot) for (const c of race.cars) if (c.player && c.state === 'run' && !c.box && ((c.compound !== 'wet' && race.wet > 0.5) || (c.compound === 'wet' && race.wetTarget === 0 && race.wet < 0.4))) race.toggleBox(c);
    },
    draw() {
      g.drawImage(bg, 0, 0);
      crowdShimmer(T);
      drawStraight();
      wetOverlay(race.wet, T);
      drawLane();
      if (S.stop) S.stop.draw(g, T);
      else if (!S.leaving || S.leaving.phase === 'done') S.idle.drawIdle(g, T);
      if (S.leaving) S.leaving.draw(g, T);
      if (wkind === 'rain') { if (race.wet > 0.02 || race.wetTarget > 0) weather(T, 1 / 60, 'rain', Math.max(race.wet, race.wetTarget * 0.3)); }
      else weather(T, 1 / 60, wkind, 0);
      drawTower();
      drawMap();
      const lapN = Math.max(1, Math.min(race.laps, Math.floor(race.order[0].dist) + 1));
      topBar(track.name.toUpperCase(), race.started ? `LAP ${lapN} / ${race.laps}` : S.lights ? 'LIGHTS' : 'FORMATION: ENTER TO SKIP', race.flag ? ((T * 2 % 1) < 0.6 ? 'WHITE FLAG' : '') : race.wet > 0.3 ? 'WET' : race.wetTarget > 0 ? 'RAIN COMING' : 'DRY');
      if (race.flag) whiteFlag();
      // bottom panel
      rect(g, 0, Y.panel, W, H - Y.panel, '#05060a');
      carCard(race.cars[0], 0);
      carCard(race.cars[1], W - 150);
      if (S.stop) stopHud(S.stop);
      else dialogue(150, Y.panel, 212, 72, dir.cur, T);
      if (S.pickers.length) drawPicker();
      if (!S.go) drawLights();
      if (S.toast) {
        const a = S.toast.t < 1.8 ? 1 : 1 - (S.toast.t - 1.8) / 0.4;
        g.globalAlpha = Math.max(0, a);
        // small, under the picker, when a double stack has the picker up top
        const low = S.pickers.length && S.stop;
        text(g, S.toast.msg, W / 2, low ? 63 : 32, S.toast.color, { align: 'center', scale: low ? 1 : 2, outline: '#05060a' });
        g.globalAlpha = 1;
      }
      if (S.stop && S.stop.repair && S.stop.repair.st === 'combo' && touchMode) dpad();
      if (S.paused) pauseMenu();
    },
    // gameplay keys (as bound in Options); menus and the pause screen use key() below
    actions(acts) {
      if (S.paused) return false;
      const pick = acts.find(a => a.startsWith('pick_'));
      if (S.pickers.length && pick) { pickerKey(pick); return true; }
      if (acts.includes('box7')) { toggle(race.cars[0]); return true; }
      if (acts.includes('box11')) { toggle(race.cars[1]); return true; }
      const sk = stopActs(acts);
      if (S.stop && sk.length) { sk.forEach(a => S.stop.press(a)); return true; }
      return false;
    },
    actionsUp(acts) { if (S.stop) stopActs(acts).forEach(a => S.stop.releaseKey(a)); },
    key(k) {
      if (S.paused) {
        const n = 4;
        if (k === 'up') S.pauseSel = (S.pauseSel + n - 1) % n;
        if (k === 'down') S.pauseSel = (S.pauseSel + 1) % n;
        if (k === 'enter' || k === 'space') pauseAct(S.pauseSel);
        if (k === 'esc') S.paused = false;
        return;
      }
      if (k === 'esc') { S.paused = true; S.pauseSel = 0; if (S.stop) for (const h of [...S.stop.held]) S.stop.releaseKey(h); A.sfx('fuel', 0); return; }
      if ((k === 'enter' || k === 'space') && !S.go) { dir.clear(); return; } // skip the pep talk
      if (k === 'enter' || k === 'space') dir.skip();
    },
    pointer(x, y) {
      if (S.paused || !S.stop) return null;
      const k = S.stop.hit(x, y);
      if (k) { S.stop.press(k); return k; }
      const dk = dpadHit(x, y);
      if (dk) { S.stop.press(dk); return dk; }
      return null;
    },
    click(x, y) { if (x > 150 && x < 362 && y > Y.panel) dir.skip(); },
  };

  function pauseMenu() {
    g.globalAlpha = 0.7; rect(g, 0, 0, W, H, '#05060a'); g.globalAlpha = 1;
    panel(g, W / 2 - 80, 62, 160, 126);
    text(g, 'PAUSED', W / 2, 72, '#ffd23a', { align: 'center', scale: 2 });
    ['RESUME', practice ? 'NEW PRACTICE' : 'RESTART RACE', 'OPTIONS', 'QUIT TO TITLE'].forEach((l, i) => button(W / 2 - 60, 102 + i * 22, 120, 18, l, () => pauseAct(i), { hot: S.pauseSel === i }));
  }
  function pauseAct(i) {
    if (i === 0) S.paused = false;
    if (i === 1) go(practice ? practiceScene : raceScene(track, round));
    if (i === 2) openOptions(obj);
    if (i === 3) go(titleScene);
  }
  return obj;
}

// Tyre picker options: the four compounds, or leave the tyres on (fuel and fixes only).
const PICKS = [...COMPOUND_ORDER, 'none'];
const PICK_ACTS = ['pick_soft', 'pick_medium', 'pick_hard', 'pick_wet', 'pick_none'];
const PICK_NAME = { soft: 'SOFT', medium: 'MED', hard: 'HARD', wet: 'WET', none: 'NONE' };
const pickable = (p, k) => !(k === 'none' && p.car.puncture);

// A small key cap like the in-stop prompts, 11x12.
function keycap(x, y, ch, off = false) {
  rect(g, x - 1, y - 1, 13, 14, '#05060a');
  rect(g, x, y, 11, 11, off ? '#5a5e68' : '#ffffff');
  rect(g, x, y + 9, 11, 2, off ? '#3a3e48' : '#9aa0aa');
  text(g, ch, x + 6, y + 2, '#0a0a10', { align: 'center' });
}

// On-screen arrows for the nose combo on touch screens.
const DPAD = { up: [460, 150], down: [460, 192], left: [439, 171], right: [481, 171] };
function dpad() {
  for (const [k, [x, y]] of Object.entries(DPAD)) {
    rect(g, x - 10, y - 10, 21, 21, '#05060a'); rect(g, x - 9, y - 9, 19, 19, '#3a4660');
    text(g, { up: '↑', down: '↓', left: '←', right: '→' }[k], x + 1, y - 3, '#ffffff', { align: 'center' });
  }
}
function dpadHit(x, y) {
  if (!touchMode) return null;
  for (const [k, [cx, cy]] of Object.entries(DPAD)) if (Math.abs(x - cx) <= 11 && Math.abs(y - cy) <= 11) return k;
  return null;
}

// ===== results
function resultsScene(track, race, log, pts, round) {
  const ours = race.cars.filter(c => c.player);
  const bestPos = Math.min(...ours.map(c => c.final));
  const tier = bestPos === 1 ? 'win' : bestPos <= 3 ? 'podium' : bestPos <= 10 && pts[0] + pts[1] >= 8 ? 'points' : 'none';
  const bossTier = bestPos <= 3 ? 'great' : pts[0] + pts[1] >= 10 ? 'good' : 'bad';
  const r = rng(Date.now() & 0xffff);
  const quote = rename(pickFresh(LINES.BOSS[bossTier], r));
  const fin = pickFresh(LINES.FINISH[tier], r);
  saveHeard();
  const lead = race.result[0];
  let t = 0;
  return {
    enter() { A.music('results'); A.setCrowd(bestPos <= 3 ? 0.9 : 0.3); A.setRain(0); if (bestPos <= 3) A.sfx('cheer'); },
    update(dt) { t += dt; },
    draw() {
      rect(g, 0, 0, W, H, '#0a0c14');
      for (let y = 12; y < H; y += 4) rect(g, 0, y, W, 1, '#0d1018');
      topBar(track.name.toUpperCase(), 'RACE RESULT', `ROUND ${round + 1}`);
      panel(g, 8, 18, 248, 168);
      text(g, 'CLASSIFICATION', 132, 25, '#ffd23a', { align: 'center' });
      race.result.forEach((c, k) => {
        const y = 38 + k * 14;
        if (c.player) rect(g, 12, y - 3, 240, 13, '#0b3a44');
        rect(g, 14, y - 2, 3, 11, c.team.c1);
        text(g, String(k + 1), 30, y, k < 3 ? '#ffd23a' : '#9aa8c8', { align: 'right' });
        text(g, c.d.name, 36, y, c.player ? '#ffffff' : '#c8ccd4');
        text(g, '#' + c.num, 132, y, '#6a7898');
        const gap = c.dnf ? 'DNF' : k === 0 ? 'WINNER' : '+' + ((c.finish + c.penalty - lead.finish - lead.penalty) * TV).toFixed(2);
        text(g, gap, 222, y, '#9aa8c8', { align: 'right' });
        if (c.penalty) text(g, 'P', 228, y, '#ff6a5a');
        text(g, pts[c.i] ? '+' + pts[c.i] : '', 250, y, '#7cff8a', { align: 'right' });
      });
      panel(g, 262, 18, 242, 168);
      text(g, 'YOUR STOPS', 383, 25, '#ffd23a', { align: 'center' });
      if (!log.length) text(g, 'No stops made. Bold.', 383, 50, '#9aa8c8', { align: 'center' });
      log.slice(0, 7).forEach((l, i) => {
        const y = 38 + i * 18;
        text(g, `CAR ${l.num}`, 272, y, '#ff8a1e');
        text(g, `L${l.lap}`, 310, y, '#6a7898');
        tyreIcon(g, 334, y + 3, l.compound, 3);
        text(g, l.tv.toFixed(2) + 's', 380, y, '#ffffff', { align: 'right' });
        const gc = { lightning: '#7cff8a', great: '#7cff8a', ok: '#ffe27a', slow: '#ff6a5a', unsafe: '#ff4a3a' }[l.grade];
        text(g, l.grade.toUpperCase(), 388, y, gc);
        // mistakes go on their own line under the stop
        if (l.notes.length) text(g, l.notes.join(', ').slice(0, 44), 310, y + 8, '#6a7898');
      });
      const fulls = log.filter(l => l.full);
      text(g, `PAR ${(track.par * TV).toFixed(2)}s`, 272, 172, '#6a7898');
      text(g, fulls.length ? `FASTEST FULL STOP ${Math.min(...fulls.map(l => l.tv)).toFixed(2)}s` : 'NO FULL STOPS', 498, 172, fulls.length ? '#7cff8a' : '#6a7898', { align: 'right' });
      // boss
      panel(g, 8, 190, 496, 60);
      g.drawImage(portrait(PEOPLE.boss, t < 2 && Math.floor(t * 9) % 2 ? 1 : 0), 14, 198);
      text(g, PEOPLE.boss.name, 52, 199, '#ffd23a');
      text(g, `TEAM: +${pts[0] + pts[1]} PTS`, 496, 199, '#7cff8a', { align: 'right' });
      const ql = wrap(quote, 440).slice(0, 2);
      ql.forEach((l, i) => text(g, l, 52, 212 + i * 10, '#e8e6dc'));
      const [who, rawSaid] = fin[0], said = rename(rawSaid);
      const name = (PEOPLE[who === '{drv}' ? (bestPos === ours[0].final ? 'nico' : 'sanna') : who] || PEOPLE.dev).name;
      const line = name + ': ' + said.replace(/{d}/g, (bestPos === ours[0].final ? DRIVERS[0] : DRIVERS[1]).name.split(' ')[0]).replace(/{p}/g, bestPos).replace(/{x}/g, track.gp).replace(/{n}/g, bestPos === ours[0].final ? 7 : 11);
      wrap(line, 440).slice(0, 4 - ql.length).forEach((l, i) => text(g, l, 52, 214 + ql.length * 10 + i * 10, '#9ad8ff'));
      button(W / 2 - 60, 260, 120, 20, round === null ? 'BACK' : 'CONTINUE', afterRace, { hot: true });
    },
    key(k) { if (k === 'enter' || k === 'space') afterRace(); },
  };
}

// ===== team setup: names and livery
const setupScene = (() => {
  let sel = 0, editing = null, before = '', t = 0;
  const NF = C.FIELDS.length;
  const ROWS = ['scheme', 'c1', 'c2', 'helmet'];
  const N = NF + ROWS.length + 2; // + reset, done
  const changed = () => { C.apply(); C.persist(); bgCache.clear(); };
  function startEdit(i) {
    sel = i; editing = C.FIELDS[i][1]; before = C.get(editing);
    typer.value = before;
    // after the click has finished, or the canvas takes focus straight back
    setTimeout(() => { typer.focus(); try { typer.setSelectionRange(0, before.length); } catch (e) {} }, 0);
    A.sfx('select');
  }
  const done = () => go(titleScene);
  function cycle(row, d) {
    if (row === 'scheme') {
      const i = C.SCHEMES.findIndex(s => s.c1 === C.team.c1 && s.c2 === C.team.c2 && s.helmet === C.team.helmet);
      const s = C.SCHEMES[(i + d + C.SCHEMES.length) % C.SCHEMES.length];
      C.team.c1 = s.c1; C.team.c2 = s.c2; C.team.helmet = s.helmet;
    } else {
      const i = C.PALETTE.indexOf(C.team[row]);
      C.team[row] = C.PALETTE[(i + d + C.PALETTE.length) % C.PALETTE.length];
    }
    changed(); A.sfx('move');
  }
  return {
    enter() { sel = 0; editing = null; t = 0; },
    update(dt) { t += dt; },
    typed() {
      if (!editing) return;
      const v = typer.value.replace(/[^ -~]/g, '').slice(0, 16);
      if (v !== typer.value) typer.value = v;
      C.set(editing, v || C.defaultOf(editing));
      changed();
    },
    typeEnd(keep) {
      if (!editing) return;
      if (!keep) C.set(editing, before);
      else C.set(editing, typer.value.trim().replace(/\s+/g, ' ') || C.defaultOf(editing));
      changed();
      editing = null;
      typer.blur(); cv.focus();
    },
    draw() {
      rect(g, 0, 0, W, H, '#0a0c14');
      for (let y = 12; y < H; y += 4) rect(g, 0, y, W, 1, '#0d1018');
      topBar('TEAM SETUP', 'NAMES AND LIVERY', 'ESC: DONE');
      // names
      panel(g, 6, 16, 252, 200);
      C.FIELDS.forEach(([label, key], i) => {
        const y = 22 + i * 16, on = sel === i, ed = editing === key;
        text(g, label, 14, y + 3, on ? '#ffd23a' : '#8a96b0');
        rect(g, 108, y, 144, 13, '#05060a');
        rect(g, 109, y + 1, 142, 11, ed ? '#22304a' : on ? '#1a2234' : '#121624');
        if (on) rect(g, 109, y + 1, 142, 1, ed ? '#7cff8a' : '#ffd23a');
        const v = C.get(key);
        let shown = v;
        while (measure(shown) > 134) shown = shown.slice(0, -1);
        text(g, shown, 113, y + 3, ed ? '#ffffff' : '#e8e6dc');
        if (ed && (t * 2 % 1) < 0.6) rect(g, 113 + measure(shown) + 1, y + 2, 1, 9, '#7cff8a');
        ui.push({ x: 108, y, w: 144, h: 13, fn: () => startEdit(i) });
      });
      text(g, editing ? 'TYPE, THEN ENTER. ESC UNDOES.' : 'CLICK A NAME, OR PRESS ENTER, TO TYPE', 132, 205, '#6a7898', { align: 'center' });
      // livery
      panel(g, 262, 16, 244, 200);
      const rowY = { scheme: 24, c1: 64, c2: 92, helmet: 120 };
      const label = { scheme: 'SCHEMES', c1: 'LIVERY', c2: 'ACCENT', helmet: 'HELMET' };
      ROWS.forEach((row, ri) => {
        const y = rowY[row], on = sel === NF + ri;
        text(g, label[row], 270, y, on ? '#ffd23a' : '#8a96b0');
        if (on) text(g, '← →', 498, y, '#ffd23a', { align: 'right' });
        if (row === 'scheme') {
          C.SCHEMES.forEach((sc, k) => {
            const x = 270 + (k % 4) * 58, yy = y + 10 + Math.floor(k / 4) * 14;
            const cur = sc.c1 === C.team.c1 && sc.c2 === C.team.c2 && sc.helmet === C.team.helmet;
            rect(g, x - 1, yy - 1, 56, 13, cur ? '#ffd23a' : '#05060a');
            rect(g, x, yy, 54, 11, sc.c1);
            rect(g, x, yy + 8, 54, 3, sc.c2);
            rect(g, x + 46, yy + 2, 5, 5, sc.helmet);
            ui.push({ x: x - 1, y: yy - 1, w: 56, h: 13, fn: () => { C.team.c1 = sc.c1; C.team.c2 = sc.c2; C.team.helmet = sc.helmet; sel = NF; changed(); } });
          });
        } else {
          C.PALETTE.forEach((col, k) => {
            const x = 270 + k * 14, yy = y + 10;
            const cur = C.team[row] === col;
            rect(g, x - 1, yy - 1, 14, 14, cur ? '#ffffff' : '#05060a');
            rect(g, x, yy, 12, 12, col);
            if (cur) rect(g, x + 4, yy + 4, 4, 4, shade(col, col === '#f4f4f0' ? -0.6 : 0.6));
            ui.push({ x: x - 1, y: yy - 1, w: 14, h: 14, fn: () => { C.team[row] = col; sel = NF + ri; changed(); } });
          });
        }
      });
      // preview: car on the lane, crew, the faces, the garage banner
      const tm = TEAMS[0];
      rect(g, 266, 146, 236, 66, '#5a5f6a');
      for (let x = 266; x < 400; x += 16) rect(g, x, 186, 9, 1, '#f0f0f0');
      const cx = 330, cy = 164;
      for (const w of WHEELS) g.drawImage(wheelSprite('soft'), cx - 39 + w.x, cy - 16 + w.y);
      g.drawImage(carSprite(tm), cx - 39, cy - 16);
      crew(g, cx - 18, cy + 34, 0, tm, { tool: 'gun', reach: 0.6 + Math.sin(t * 30) * 0.2 });
      crew(g, cx + 22, cy + 34, 0, tm, { tool: 'tyre', reach: 0.3, toolColor: '#e8342c' });
      g.drawImage(portrait(PEOPLE.nico), 400, 149);
      g.drawImage(portrait(PEOPLE.sanna), 434, 149);
      g.drawImage(portrait(PEOPLE.mags), 468, 149);
      rect(g, 400, 186, 100, 22, tm.c1); rect(g, 400, 186, 100, 2, tm.c2);
      text(g, tm.short, 450, 194, tm.c1 === '#14161c' || tm.c1 === '#3a3e48' || tm.c1 === '#8e44ad' ? '#ffffff' : '#0a0a10', { align: 'center' });
      // buttons
      button(6, 236, 140, 22, 'RESET TO DEFAULTS', () => { C.reset(); bgCache.clear(); }, { hot: sel === N - 2, color: '#5c6a8a' });
      button(366, 236, 140, 22, 'DONE', done, { hot: sel === N - 1 });
      text(g, 'Saved in this browser. Your team carries into every season.', W / 2, 268, '#6a7898', { align: 'center' });
    },
    key(k) {
      if (k === 'esc') return done();
      if (k === 'up') { sel = (sel + N - 1) % N; A.sfx('move'); }
      if (k === 'down') { sel = (sel + 1) % N; A.sfx('move'); }
      if ((k === 'left' || k === 'right') && sel >= NF && sel < NF + ROWS.length) cycle(ROWS[sel - NF], k === 'left' ? -1 : 1);
      if (k === 'enter' || k === 'space') {
        if (sel < NF) startEdit(sel);
        else if (sel === N - 2) { C.reset(); bgCache.clear(); A.sfx('select'); }
        else if (sel === N - 1) done();
        else cycle(ROWS[sel - NF], 1);
      }
    },
  };
})();

// ===== options: key bindings, volume, music dip in stops
// Opened from the title or a pause menu, and hands control straight back when done.
function openOptions(from) { optionsScene.from = from; scene = optionsScene; optionsScene.enter(); }
const optionsScene = (() => {
  const COL_A = ['space', 'a', 'd', 'q', 'e', 'z', 'c', 's', 'x', 'w'];
  const NOSE = ['up', 'down', 'left', 'right'];
  const COL_B = ['box7', 'box11', 'pick_soft', 'pick_medium', 'pick_hard', 'pick_wet', 'pick_none', 'fullscreen', 'mute'];
  const NAME = Object.fromEntries(O.ACTIONS.map(a => [a[0], a[1]]));
  // everything you can select, in up/down order
  const ITEMS = [...COL_A, ...NOSE, ...COL_B, 'music', 'sfx', 'duck', 'reset', 'done'];
  let sel = 0, waiting = null, note = '', noteT = 0;
  const SLIDER = { x: 364, w: 132, y: { music: 46, sfx: 78 } };
  const levels = () => { A.setLevels({ music: O.opts.music, sfx: O.opts.sfx, duckOn: O.opts.duck }); O.save(); };
  const leave = () => { waiting = null; scene = optionsScene.from || titleScene; };

  // a key cap in a green square
  function slot(x, y, act, w = 22) {
    const i = ITEMS.indexOf(act), on = sel === i, wait = waiting === act;
    const lab = wait ? '?' : O.label(act);
    w = Math.max(w, measure(lab) + 8);
    rect(g, x - 1, y - 1, w + 2, 13, on ? '#ffd23a' : '#05060a');
    rect(g, x, y, w, 11, wait && (T * 3 % 1) < 0.5 ? '#ffe27a' : '#3ab04a');
    rect(g, x, y, w, 1, '#8af09a');
    rect(g, x, y + 9, w, 2, '#1f7a2c');
    text(g, lab, x + w / 2, y + 2, '#05140a', { align: 'center' });
    ui.push({ x: x - 1, y: y - 1, w: w + 2, h: 13, fn: () => { sel = i; waiting = act; } });
    return w;
  }

  function setSlider(k, x) {
    O.opts[k] = Math.max(0, Math.min(1, Math.round((x - SLIDER.x) / SLIDER.w * 20) / 20));
    levels();
  }

  return {
    from: null,
    enter() { sel = 0; waiting = null; note = ''; },
    update(dt) { if (noteT > 0) noteT -= dt; },
    // the next key pressed while a slot is waiting becomes its binding
    capture(code) {
      if (!waiting) return false;
      if (code === 'Escape') { waiting = null; return true; }
      const swapped = O.bind(waiting, code);
      note = swapped.length ? `${NAME[waiting]} TAKES ${O.codeLabel(code)}. SWAPPED WITH ${swapped.join(', ')}.` : `${NAME[waiting]}: ${O.codeLabel(code)}`;
      noteT = 4;
      waiting = null;
      A.sfx('select');
      return true;
    },
    drag(x, y) {
      for (const k of ['music', 'sfx']) if (y >= SLIDER.y[k] - 4 && y <= SLIDER.y[k] + 10 && x >= SLIDER.x - 6 && x <= SLIDER.x + SLIDER.w + 6) setSlider(k, x);
    },
    draw() {
      rect(g, 0, 0, W, H, '#0a0c14');
      for (let y = 12; y < H; y += 4) rect(g, 0, y, W, 1, '#0d1018');
      topBar('OPTIONS', 'CONTROLS AND SOUND', 'ESC: DONE');
      // controls
      panel(g, 6, 16, 346, 206);
      text(g, 'PIT STOP', 14, 23, '#ffd23a');
      COL_A.forEach((act, r) => {
        const y = 34 + r * 14;
        text(g, NAME[act], 14, y + 2, sel === ITEMS.indexOf(act) ? '#ffffff' : '#9aa8c8');
        slot(124, y, act);
      });
      // nose swap: four key spaces in one wide green bar
      const ny = 34 + COL_A.length * 14 + 2;
      text(g, 'REPLACE NOSE', 14, ny + 2, NOSE.includes(ITEMS[sel]) ? '#ffffff' : '#9aa8c8');
      rect(g, 13, ny + 11, 156, 19, '#05060a');
      rect(g, 14, ny + 12, 154, 17, '#1f6a2c');
      rect(g, 14, ny + 12, 154, 1, '#3ab04a');
      NOSE.forEach((act, k) => slot(19 + k * 37, ny + 15, act, 32));
      text(g, 'RACE', 184, 23, '#ffd23a');
      COL_B.forEach((act, r) => {
        const y = 34 + r * 14 + (r >= 7 ? 8 : 0);
        if (r === 7) text(g, 'ANY TIME', 184, y - 9, '#ffd23a');
        text(g, NAME[act], 184, y + 2, sel === ITEMS.indexOf(act) ? '#ffffff' : '#9aa8c8');
        slot(296, y, act);
      });
      text(g, 'TYRE KEYS CAN SHARE BOX KEYS:', 184, 192, '#6a7898');
      text(g, 'THE PICKER WINS WHILE OPEN.', 184, 201, '#6a7898');
      // sound
      panel(g, 356, 16, 150, 206);
      for (const k of ['music', 'sfx']) {
        const y = SLIDER.y[k], on = sel === ITEMS.indexOf(k);
        text(g, k === 'music' ? 'MUSIC' : 'SOUND EFFECTS', 364, y - 12, on ? '#ffffff' : '#9aa8c8');
        text(g, `${Math.round(O.opts[k] * 100)}%`, 496, y - 12, on ? '#ffd23a' : '#6a7898', { align: 'right' });
        rect(g, SLIDER.x - 1, y + 1, SLIDER.w + 2, 5, '#05060a');
        rect(g, SLIDER.x, y + 2, Math.round(SLIDER.w * O.opts[k]), 3, on ? '#ffd23a' : '#3ab04a');
        const kx = SLIDER.x + Math.round(SLIDER.w * O.opts[k]);
        rect(g, kx - 3, y - 2, 7, 11, '#05060a'); rect(g, kx - 2, y - 1, 5, 9, on ? '#ffffff' : '#c8ccd4');
        ui.push({ x: SLIDER.x - 6, y: y - 4, w: SLIDER.w + 12, h: 14, fn: () => { sel = ITEMS.indexOf(k); setSlider(k, mouse.x); } });
      }
      const dOn = sel === ITEMS.indexOf('duck');
      text(g, 'QUIETER MUSIC', 364, 104, dOn ? '#ffffff' : '#9aa8c8');
      text(g, 'DURING PIT STOPS', 364, 113, dOn ? '#ffffff' : '#9aa8c8');
      button(364, 124, 60, 16, O.opts.duck ? 'ON' : 'OFF', () => { sel = ITEMS.indexOf('duck'); O.opts.duck = !O.opts.duck; levels(); }, { hot: dOn, color: O.opts.duck ? '#3ab04a' : '#5c6a8a' });
      text(g, O.opts.duck ? 'Music dips while' : 'Music stays at', 364, 148, '#6a7898');
      text(g, O.opts.duck ? 'the crew works.' : 'full volume.', 364, 157, '#6a7898');
      // footer
      const msg = waiting ? `PRESS A KEY FOR ${NAME[waiting]}. ESC CANCELS.` : noteT > 0 ? note : 'CLICK A KEY (OR ENTER), THEN PRESS THE NEW ONE.';
      text(g, msg, W / 2, 228, waiting ? '#ffd23a' : noteT > 0 ? '#7cff8a' : '#6a7898', { align: 'center' });
      button(6, 242, 150, 20, 'RESET CONTROLS', () => { O.resetKeys(); note = 'CONTROLS BACK TO DEFAULTS.'; noteT = 3; }, { hot: sel === ITEMS.indexOf('reset'), color: '#5c6a8a' });
      button(356, 242, 150, 20, 'DONE', leave, { hot: sel === ITEMS.indexOf('done') });
    },
    key(k) {
      if (waiting) return;
      const item = ITEMS[sel];
      if (k === 'esc') return leave();
      if (k === 'up') { sel = (sel + ITEMS.length - 1) % ITEMS.length; A.sfx('move'); }
      if (k === 'down') { sel = (sel + 1) % ITEMS.length; A.sfx('move'); }
      if ((k === 'left' || k === 'right') && (item === 'music' || item === 'sfx')) {
        O.opts[item] = Math.max(0, Math.min(1, Math.round((O.opts[item] + (k === 'left' ? -0.05 : 0.05)) * 20) / 20));
        levels(); A.sfx('move');
      }
      if (k === 'enter' || k === 'space') {
        if (item === 'duck') { O.opts.duck = !O.opts.duck; levels(); }
        else if (item === 'reset') { O.resetKeys(); note = 'CONTROLS BACK TO DEFAULTS.'; noteT = 3; }
        else if (item === 'done') leave();
        else if (item !== 'music' && item !== 'sfx') waiting = item;
        A.sfx('select');
      }
    },
  };
})();

// ===== season end
const LAUREL_T = 10;
function openLaurels() { laurelsBack = seasonScene; go(laurelsScene); }
const seasonScene = {
  enter() { A.music('title'); this.t = 0; this.sel = 0; const s = standings(); this.champ = s[0].i === 0; this.pos = s.findIndex(x => x.i === 0) + 1; if (this.champ) A.sfx('cheer'); },
  update(dt) { this.t += dt; },
  draw() {
    rect(g, 0, 0, W, H, '#0a0c14');
    topBar("PIT CREW '26", 'SEASON REVIEW', '');
    if (this.champ) {
      text(g, 'CONSTRUCTORS CHAMPIONS', W / 2, 24, '#ffd23a', { align: 'center', scale: 2, shadow: '#7a3a08' });
      // trophy
      const tx = W / 2, ty = 70;
      ellipse(g, tx, ty, 18, 14, '#ffd23a'); ellipse(g, tx - 5, ty - 4, 6, 5, '#fff0a0');
      rect(g, tx - 4, ty + 12, 8, 10, '#d8a020'); rect(g, tx - 12, ty + 22, 24, 6, '#a87818');
      rect(g, tx - 24, ty - 6, 6, 12, '#d8a020'); rect(g, tx + 18, ty - 6, 6, 12, '#d8a020');
      for (let i = 0; i < 20; i++) { const a = this.t * 0.6 + i; rect(g, tx + Math.cos(a * 1.7) * 120, 40 + ((this.t * 40 + i * 23) % 200), 2, 2, ['#ff8a1e', '#16b3a3', '#ffffff', '#ffd23a'][i % 4]); }
    } else text(g, `${TEAMS[0].short} FINISH P${this.pos} IN THE CONSTRUCTORS`, W / 2, 30, '#ffffff', { align: 'center', scale: 2 });
    panel(g, W / 2 - 120, 108, 240, 112);
    standings().forEach((s, k) => {
      const y = 118 + k * 18;
      rect(g, W / 2 - 108, y, 4, 12, s.t.c1);
      text(g, `${k + 1}  ${s.t.name}`, W / 2 - 98, y + 3, s.i === 0 ? '#ffffff' : '#9aa8c8');
      text(g, String(s.pts), W / 2 + 108, y + 3, '#ffd23a', { align: 'right' });
    });
    const q = rename(this.champ ? 'Mags: "Brake dust. It is just brake dust, Toby."' : 'Mags: "Next year. Gloves on, same as always."');
    text(g, q, W / 2, 230, '#9ad8ff', { align: 'center' });
    button(W / 2 - 150, 250, 140, 20, 'NEW SHORT SEASON', () => newSeason('short'), { hot: true });
    button(W / 2 + 10, 250, 140, 20, 'NEW LONG SEASON', () => newSeason('long'));
    // ten seconds of looking at the table, then this fades up
    if (this.t > LAUREL_T) {
      g.globalAlpha = Math.min(1, (this.t - LAUREL_T) / 1.5);
      button(W / 2 - 90, 272, 180, 15, 'REST ON YOUR LAURELS', openLaurels, { hot: this.sel === 1, color: '#b8902a' });
      g.globalAlpha = 1;
    }
  },
  key(k) {
    if (this.t > LAUREL_T && (k === 'down' || k === 'up')) { this.sel = k === 'down' ? 1 : 0; A.sfx('move'); return; }
    if (k === 'enter' || k === 'space') { if (this.sel === 1) openLaurels(); else go(titleScene); }
  },
};

// ===== practice: endless stops on a quiet lane
const practiceScene = (() => {
  let st = null, track = null, wait = 0, times = [], n = 0, r = rng(1), bg = null, idle = null, last = null, paused = false;
  const MODS = ['tightLane', 'slick', 'sand', 'heat', 'cold', 'walls'];
  function next() {
    n++;
    track = TRACKS[(Math.floor((n - 1) / 3)) % TRACKS.length];
    bg = bgFor(track);
    const mods = MODS.filter(() => r() < 0.3);
    const tr = { ...track, mods };
    const car = { num: 7, i: 0, compound: r() < 0.5 ? 'medium' : 'hard', wear: 0.6 + r() * 0.3, damage: mods.includes('walls') || r() < 0.3 ? 1 : 0, fuel: 1 };
    st = new PitStop({ car, track: tr, compound: 'soft', fuelNow: 0.6, fuelNeed: Math.round((2.5 + r() * 2.5) * 10) / 10, rng: r, sfx: (a, b) => A.sfx(a, b), hints: n <= 2 });
    st.mods = new Set(mods);
    idle = st;
  }
  return {
    get stop() { return st; },
    enter() { r = rng(Date.now() & 0xffff); n = 0; times = []; wait = 0; last = null; paused = false; next(); A.music('race'); A.setCrowd(0.3); A.duck(true); particles.length = 0; },
    update(dt) {
      if (paused) return;
      if (st) {
        st.update(dt);
        if (DEV && window.__pc.bot) autoplay(st, dt, 1);
        if (st.phase === 'leave' && !st._logged) {
          st._logged = true;
          const res = st.result();
          last = res; times.unshift(res.tv); times = times.slice(0, 6);
          if (res.tyres && res.fuelled && (!save.practiceBest || res.tv < save.practiceBest)) { save.practiceBest = res.tv; persist(); A.sfx('cheer'); }
        }
        if (st.done) { st = null; wait = 1.2; }
      } else { wait -= dt; if (wait <= 0) next(); }
    },
    draw() {
      g.drawImage(bg, 0, 0);
      crowdShimmer(T);
      if (st) st.draw(g, T); else idle.drawIdle(g, T);
      topBar('PIT PRACTICE', track.name.toUpperCase(), 'ESC: MENU');
      rect(g, 0, Y.panel, W, H - Y.panel, '#05060a');
      panel(g, 0, Y.panel, 150, 72);
      text(g, 'MODS THIS STOP', 8, Y.panel + 6, '#ffd23a');
      const mods = st ? [...st.mods] : [];
      if (!mods.length) text(g, 'none', 8, Y.panel + 18, '#6a7898');
      mods.slice(0, 5).forEach((m, i) => text(g, MOD_INFO[m][0], 8, Y.panel + 18 + i * 9, '#c8ccd4'));
      if (st && st.repair) text(g, 'WING DAMAGE', 8, Y.panel + 18 + Math.min(5, mods.length) * 9, '#ff8a1e');
      if (st && st.phase !== 'leave' && st.phase !== 'done') {
        const x = 150, y = Y.panel;
        panel(g, x, y, 212, 72, { fill: '#0a0c14', edge: '#ff8a1e', hi: '#ffd08a', lo: '#3a1e08' });
        text(g, `STOP ${n}`, x + 8, y + 6, '#ff8a1e');
        text(g, st.phase === 'arrive' ? 'INCOMING' : (st.clock * TV).toFixed(2), x + 8, y + 18, '#ffffff', { scale: 3 });
        text(g, `PRACTICE BEST ${save.practiceBest ? save.practiceBest.toFixed(2) : '-'}`, x + 8, y + 50, '#6a7898');
      } else {
        panel(g, 150, Y.panel, 212, 72);
        if (last) {
          text(g, last.tv.toFixed(2) + 's', 256, Y.panel + 12, last.unsafe ? '#ff6a5a' : '#7cff8a', { align: 'center', scale: 3 });
          text(g, last.notes.length ? last.notes.join(', ') : last.perfects >= 5 ? 'clean and quick' : 'clean', 256, Y.panel + 42, '#9aa8c8', { align: 'center' });
        }
      }
      panel(g, 362, Y.panel, 150, 72);
      text(g, 'LAST STOPS', 370, Y.panel + 6, '#ffd23a');
      times.forEach((tv, i) => text(g, tv.toFixed(2), 370 + (i % 3) * 46, Y.panel + 20 + Math.floor(i / 3) * 12, i === 0 ? '#ffffff' : '#9aa8c8'));
      if (save.practiceBest) text(g, `BEST ${save.practiceBest.toFixed(2)}`, 370, Y.panel + 50, '#7cff8a');
      if (st && st.repair && st.repair.st === 'combo' && touchMode) dpad();
      if (paused) {
        g.globalAlpha = 0.7; rect(g, 0, 0, W, H, '#05060a'); g.globalAlpha = 1;
        panel(g, W / 2 - 80, 74, 160, 100);
        button(W / 2 - 60, 90, 120, 18, 'RESUME', () => { paused = false; }, { hot: true });
        button(W / 2 - 60, 114, 120, 18, 'OPTIONS', () => openOptions(practiceScene));
        button(W / 2 - 60, 138, 120, 18, 'QUIT TO TITLE', () => go(titleScene));
      }
    },
    actions(acts) {
      const sk = stopActs(acts);
      if (paused || !st || !sk.length) return false;
      sk.forEach(a => st.press(a));
      return true;
    },
    actionsUp(acts) { if (st) stopActs(acts).forEach(a => st.releaseKey(a)); },
    key(k) {
      if (k === 'esc') { paused = !paused; if (st) for (const h of [...st.held]) st.releaseKey(h); A.sfx('fuel', 0); return; }
      if (paused && k === 'enter') paused = false;
    },
    pointer(x, y) {
      if (!st || paused) return null;
      const k = st.hit(x, y) || dpadHit(x, y);
      if (k) { st.press(k); return k; }
      return null;
    },
  };
})();

// ===== the Summer Shutdown, between rounds 6 and 7 of a long season
const breakScene = makeBreak({ g, button, mouse: () => mouse, onContinue: () => { save.breakDone = true; persist(); go(briefingScene); } });

// ===== Rest On Your Laurels, after the season review (or from the debug screen)
// One trophy for each race with a car on the podium, and the big cup for the constructors' title.
function trophies() {
  const tiers = save.results.filter(Boolean).map(r => Math.min(r.a, r.b)).filter(p => p <= 3);
  const top = standings()[0];
  const champ = top.i === 0 && top.pts > 0;
  // the debug screen can come here before any racing: dress the case so there is something to see
  if (laurelsBack === debugScene && !tiers.length) return { tiers: [1, 3, 2, 1, 2, 3, 1, 1], champ: true };
  return { tiers, champ };
}
let laurelsBack = null;
const laurelsScene = makeBreak({
  g, button, mouse: () => mouse, only: ['laurels'], splash: false, label: 'CALL IT A NIGHT', song: 'laurels', reserved: ['KeyL'], data: trophies,
  onContinue: () => { A.music('title'); scene = laurelsBack; },
});

// ===== the debug screen
const debugBreak = makeBreak({ g, button, mouse: () => mouse, label: 'BACK TO DEBUG', onContinue: () => { A.music('title'); scene = debugScene; } });
function jumpTo(mode, i) {
  if ((save.mode || 'short') !== mode) save = { ...freshSave(mode), muted: save.muted, best: save.best, practiceBest: save.practiceBest };
  else {
    // going back: those rounds never happened
    (save.log || []).forEach((rows, r) => { if (r >= i && rows) for (const e of rows) { save.team[e.t] = Math.max(0, (save.team[e.t] || 0) - e.pts); const code = DRIVERS[e.i].code; save.drv[code] = Math.max(0, (save.drv[code] || 0) - e.pts); } });
    if (save.log) save.log.length = Math.min(save.log.length, i);
    save.results.length = Math.min(save.results.length, i);
  }
  save.round = i;
  save.breakDone = i > 5;
  persist();
  go(briefingScene);
}
const debugScene = makeDebug({
  g, button, ui, typer, cv, mouse: () => mouse,
  save: () => save,
  setScene: s => { scene = s; },
  jumpTo,
  changed() { C.apply(); C.persist(); bgCache.clear(); },
  openGame(id) {
    if (id === 'splash') go(debugBreak);
    else if (id === 'laurels') { laurelsBack = debugScene; go(laurelsScene); }
    else if (id === 'season') go(seasonScene);
    else { go(debugBreak); debugBreak.jump(id); }
  },
});

// ------------------------------------------------------------ loop
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt * (DEV ? window.__pc.speed : 1);
  let n = 0;
  while (acc >= STEP && n < 8) { scene.update(STEP); T += STEP; acc -= STEP; n++; }
  if (n >= 8) acc = 0;
  ui.length = 0;
  g.setTransform(1, 0, 0, 1, 0, 0);
  scene.draw();
  present();
  requestAnimationFrame(frame);
}

if (DEV) {
  window.__pc = {
    speed: 1, bot: false,
    get scene() { return scene; },
    breakScene, brk: id => { go(breakScene); return breakScene.jump(id); },
    debugScene, toggleDebug, laurelsScene, debugBreak, trophies,
    go: name => go({ setup: setupScene, title: titleScene, calendar: calendarScene, briefing: briefingScene, practice: practiceScene, how: howScene, season: seasonScene }[name]),
    race: (i, mode) => go(raceScene(calendar(mode || save.mode || 'short')[i] || TRACKS[i], i)),
    step(n = 1) { for (let i = 0; i < n; i++) { scene.update(STEP); T += STEP; } ui.length = 0; scene.draw(); present(); },
    key: k => scene.key && scene.key(k),
    keyUp: k => scene.keyUp && scene.keyUp(k),
    save: () => save,
  };
}

// the studio splash first, then the title from its beginning
(async () => {
  await window.SlopwareSplash?.ready;
  if (navigator.userActivation?.hasBeenActive) A.init();   // a click that skipped the splash already allows sound
  last = performance.now();
  go(titleScene);
  requestAnimationFrame(frame);
})();
