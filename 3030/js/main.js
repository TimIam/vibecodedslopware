// 3030: boot, the fixed-step loop, screen scaling, scene switching, saves and test hooks.
import { W, H, canvas, P, rect } from './gfx.js';
import * as A from './audio.js';
import { I, poll, endFrame, initTouch } from './input.js';
import { text } from './font.js';

const STEP = 1 / 60;
const cv = document.getElementById('game');
const out = cv.getContext('2d');
const [src, g] = canvas(W, H);
const [mid, mg] = canvas(W * 4, H * 4);

// ------------------------------------------------------------ save
const KEY = '3030-save-v1';
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return s; } catch (e) { /* fresh */ }
  return {};
}
export const save = Object.assign({ progress: 0, best: {}, rank: {}, cleared: {}, muted: false, seen: {} }, loadSave());
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }

// ------------------------------------------------------------ state
export const G = { t: 0, frame: 0, scene: null, sceneName: '', next: null, fade: 0, fadeDir: 0, manual: false, flash: 0 };

// Switch scenes through a quick fade to black.
export function go(scene, name = '', fast = false) {
  if (!G.scene || fast) { swap(scene, name); G.fade = fast && G.scene ? 1 : 0; G.fadeDir = fast ? -1 : 0; return; }
  G.next = { scene, name }; G.fadeDir = 1;
}
function swap(scene, name) {
  if (G.scene && G.scene.exit) G.scene.exit();
  G.scene = scene; G.sceneName = name;
  if (scene.enter) scene.enter();
}

// ------------------------------------------------------------ layout
const wrapEl = document.getElementById('wrap');
function fit() {
  const r = wrapEl.getBoundingClientRect();
  const s = Math.min(r.width / W, r.height / H);
  // Prefer whole-number scales when they fit, so every pixel is the same size.
  const k = s >= 2 ? Math.floor(s) : s;
  const cw = Math.max(1, Math.floor(W * k)), ch = Math.max(1, Math.floor(H * k));
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  const m = Math.max(1, Math.ceil(cv.width / W));
  if (mid.width !== W * m) { mid.width = W * m; mid.height = H * m; }
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

// Full screen and mute live in the site bar.
const fsBtn = document.getElementById('fs');
fsBtn.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {});
  cv.focus();
});
document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('full', !!document.fullscreenElement); fit(); });
const muteBtn = document.getElementById('mute');
function syncMute() { muteBtn.textContent = A.isMuted() ? '♪ Sound off' : '♪ Sound on'; muteBtn.setAttribute('aria-pressed', A.isMuted() ? 'true' : 'false'); }
A.setMuted(!!save.muted); syncMute();
muteBtn.addEventListener('click', () => { A.init(); A.setMuted(!A.isMuted()); save.muted = A.isMuted(); persist(); syncMute(); cv.focus(); });

// Sound needs a gesture: the first key, click or touch wakes the chip.
const wake = () => { A.init(); };
addEventListener('keydown', wake, { capture: true });
addEventListener('pointerdown', wake, { capture: true });
initTouch(wake);
cv.addEventListener('pointerdown', () => cv.focus());

// Pause when the tab hides, so rhythm stages don't run on without you.
document.addEventListener('visibilitychange', () => { if (document.hidden && G.scene && G.scene.autoPause) G.scene.autoPause(); });

// ------------------------------------------------------------ loop
function step() {
  A.tickVirtual(STEP);
  poll();
  G.t += STEP; G.frame++;
  if (G.fadeDir > 0) {
    G.fade = Math.min(1, G.fade + STEP / 0.22);
    if (G.fade >= 1 && G.next) { const n = G.next; G.next = null; swap(n.scene, n.name); G.fadeDir = -1; }
  } else if (G.fadeDir < 0) {
    G.fade = Math.max(0, G.fade - STEP / 0.25);
    if (G.fade <= 0) G.fadeDir = 0;
  }
  if (G.scene && !G.next) G.scene.update(STEP);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - STEP * 4);
  endFrame();
}
function render() {
  if (G.scene) G.scene.draw(g);
  if (G.flash > 0) { g.globalAlpha = G.flash; rect(g, 0, 0, W, H, P.white); g.globalAlpha = 1; }
  if (G.fade > 0) {
    // Chunky 16-bit fade: black bars closing in steps.
    const k = Math.round(G.fade * 8) / 8;
    g.globalAlpha = k; rect(g, 0, 0, W, H, P.ink); g.globalAlpha = 1;
  }
  present();
}
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (G.manual) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 6) { step(); acc -= STEP; n++; }
  if (n === 6) acc = 0;
  render();
}

// ------------------------------------------------------------ boot
import('./menu.js').then(m => {
  go(m.bootScene(), 'boot');
  requestAnimationFrame(frame);
  window.__d3.menu = m;
});

// ------------------------------------------------------------ test hooks
window.__d3 = {
  G, I, A, data: save,   // the save game (save() below is the screenshot hook)
  // Manual mode: the loop stops and only step() advances time (music clock goes virtual).
  manual(on = true) { G.manual = on; A.setVirtual(on); },
  step(n = 1) { for (let i = 0; i < n; i++) step(); render(); return G.sceneName; },
  key(b, down) { I.set(b, down); },
  tap(b, frames = 2) { I.set(b, true); this.step(frames); I.set(b, false); this.step(1); },
  scene: () => G.sceneName,
  cur: () => G.scene,
  go: (scene, name) => go(scene, name, true),
  shot: () => src.toDataURL(),
  src,
  // Dev: POST a 2x screenshot to the local shot server (scratchpad shotserver.mjs).
  save(name = 'shot', k = 2) {
    const [c, cg] = canvas(W * k, H * k); cg.imageSmoothingEnabled = false; cg.drawImage(src, 0, 0, W * k, H * k);
    return fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: c.toDataURL() }).then(r => r.text());
  },
  bot: false,
};
