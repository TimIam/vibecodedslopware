// Par for the Curse: multiplayer rage golf up Mount Bogey.
import * as THREE from 'three';
import { loadAssets, make, toon, addOutline } from './assets.js';
import { World, BALL_R, G as GRAV } from './physics.js';
import { Course, frames, NHOLES, CUP_R, SEA_Y, RISE, padPos } from './course.js';
import { Golfer, Swing, CLUBS, SKINS, SHIRTS, PANTS, HATS } from './golfer.js';
import { Particles, Confetti, Trail } from './fx.js';
import { Sky } from './sky.js';
import * as A from './audio.js';
import { joinRoom } from './net.js';

const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const _a = V(), _b = V(), _c = V(), _d = V();
const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
const pick = a => a[(Math.random() * a.length) | 0];
const fmt = s => s.replace(/\{(\w+)\}/g, (_, k) => QV[k] ?? '');
let QV = {};

/* ---------------- renderer, scene ---------------- */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe6f1f2, 140, 720);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 2000);
const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x7fae5c, 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
const SUN_DIR = V(0.45, 0.55, 0.7).normalize();
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 160 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
function resize() {
  const w = innerWidth, h = innerHeight - 52;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (fx) fx.setScale(h);
}

/* ---------------- state ---------------- */
let world, course, sky, fx, confetti, me, swing, ballMesh, ballShadow, trail, aimDots;
let net = null;
const S = {
  mode: 'loading', t: 0, modeT: 0,
  hole: 1, holeStrokes: 0, strokes: 0, falls: 0, lost: 0, rage: 0, best: 0, finished: false, crown: false,
  aim: 0, shotFrom: V(), shotHole: 1, shotY: 0, restT: 0, flightT: 0, shotInfo: null,
  golferG: V(), lookAt: V(), emote: null, emoteT: 0, camMode: 'swing', aimHeld: false, overview: false,
  startedAt: 0, firstLand: true, fallingWhistle: false, whiffArmed: false, maxHead: 0, sinkHole: 0,
};
const ball = { p: V(), v: V(), spin: 0, grounded: false, gN: V(0, 1, 0), gVel: V(), lastGround: null, airT: 0, frozen: false, surfOverride: null, bite: false };
const look = loadLook();
try { S.tipDone = localStorage.getItem('pftc-tip') === '1'; } catch (e) {}
let mouseDX = 0, mouseDY = 0;
const keys = new Set();

function loadLook() {
  let l = null;
  try { l = JSON.parse(localStorage.getItem('pftc-look') || 'null'); } catch (e) {}
  return Object.assign({ name: '', skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hat: pick(SHIRTS), hatType: pick(HATS.slice(0, 5)), stache: Math.random() < 0.3 }, l || {});
}
function saveLook() { try { localStorage.setItem('pftc-look', JSON.stringify(look)); } catch (e) {} }
function save() {
  try { localStorage.setItem('pftc-save', JSON.stringify({ hole: S.hole, strokes: S.strokes, holeStrokes: S.holeStrokes, falls: S.falls, lost: Math.round(S.lost), best: S.best, finished: S.finished, crown: S.crown, ball: ball.p.toArray().map(v => +v.toFixed(3)), aim: S.aim, startedAt: S.startedAt })); } catch (e) {}
}
function loadSave() { try { return JSON.parse(localStorage.getItem('pftc-save') || 'null'); } catch (e) { return null; } }

/* ---------------- quips ---------------- */
const Q = {
  welcome: ['Welcome to Mount Bogey. Nine holes, one mountain, zero refunds.', 'Welcome back. The mountain missed you. It did not.'],
  fall: ['Gravity remains undefeated.', 'And that is {m} metres of progress, gone.', 'The mountain giveth. The mountain taketh away.', 'Bold strategy. It did not pay off.', 'Have you considered hitting it less?', 'Weeeeee.', 'Back to hole {h}. Lovely this time of year.'],
  bigfall: ['That is a long way down. {m} metres, to be precise.', 'Oh no. Oh no no no.', 'And the crowd goes silent.'],
  sea: ['Into the sea. Magnificent.', 'Ball overboard!', 'That one is going to Portugal.', 'The fish thank you for your donation.'],
  splash: ['Splish splash. One stroke penalty.', 'Plop.', 'That is wet, and also a penalty.'],
  sand: ['Beach day!', 'Welcome to the sandbox.', 'It is coarse, and it gets everywhere.'],
  lip: ['Lipped out! Oh, the humanity.', 'So close. So very close.', 'The cup said no.', 'Around the rim and out. Cruel.'],
  whiff: ['Air shot. Very aerodynamic.', 'You missed. The ball is still there, judging you.', 'A lovely practice swing.'],
  topped: ['Topped it. Worm burner!', 'Thin. Very thin.', 'That ball has seen things.'],
  fat: ['Fat! You hit the planet first.', 'Big divot. The groundskeeper weeps.'],
  pure: ['Pured it!', 'Oh, that is sweet.', 'Right off the screws.', 'Now that is a golf shot.'],
  goose: ['HONK.', 'The goose has spoken.', 'Do not anger the goose.'],
  sail: ['Windmilled!', 'The windmill sends its regards.', 'Swatted.'],
  bumper: ['Ding ding ding!', 'Pinball wizard!'],
  sweeper: ['Swept away!', 'Mind the sweeper.'],
  cannon: ['Fire in the hole!', 'Ka-BOOM!', 'Human cannonball. Well, golf ball.'],
  pin: ['Off the pin!', 'Clank!'],
  shroom: ['Boing!', 'Fun guy, that mushroom.'],
  ace: ['HOLE IN ONE! Who ARE you?'],
  albatross: ['An albatross! Rarer than a calm golfer.'],
  eagle: ['Eagle! Look at you go.'],
  birdie: ['Birdie! Tweet tweet.', 'Birdie. Smug, but deserved.'],
  par: ['Par. Perfectly adequate.', 'A par. The mountain shrugs.'],
  bogey: ['Bogey. Mount Bogey approves.', 'Bogey. Could be worse.'],
  double: ['Double bogey. We have all been there.', 'Double. Breathe.'],
  worse: ['{n} strokes. We will not speak of this.', 'That took {n}. The mountain is laughing.', 'Finally. {n} strokes.'],
  idle: ['Any time now.', 'The ball is not going to hit itself.', 'Take your time. It is not like the wind is getting stronger.'],
  tantrum: ['Let it out.', 'Very mature.', 'Use your words.'],
  rage: ['RAGE MODE ENGAGED.', 'Someone needs a juice box.'],
  drop: ['Unplayable lie. One stroke.'],
  nodrop: ['No take-backs after a fall. That is the rule. I just made it up.'],
  summit: ['You conquered Mount Bogey! Champion of the curse!'],
  firstSwing: ['Pull the mouse back. Then swing it through.'],
};
function quip(kind, vars = {}, speak = true) {
  QV = vars;
  const text = fmt(pick(Q[kind] || [kind]));
  const el = $('quip');
  el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(quip.t); quip.t = setTimeout(() => el.classList.remove('show'), 3800);
  if (speak) A.say(text);
  S.lastQuip = S.t;
}
function pop(text, cls = '', p) {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.innerHTML = text;
  if (p) { const s = p.clone().project(camera); el.style.left = ((s.x + 1) / 2 * 100) + '%'; el.style.top = ((1 - s.y) / 2 * 100) + '%'; el.classList.add('at'); }
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1700);
}
function toast(html) {
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html;
  $('toasts').prepend(el); setTimeout(() => el.classList.add('out'), 5200); setTimeout(() => el.remove(), 5800);
  while ($('toasts').children.length > 5) $('toasts').lastChild.remove();
}
function addRage(n) {
  S.rage = clamp(S.rage + n, 0, 100);
  if (S.rage >= 100 && S.emote !== 'tantrum') { S.rage = 35; startEmote('tantrum', 2.6); quip('rage'); shake(0.5); document.body.classList.add('raging'); setTimeout(() => document.body.classList.remove('raging'), 2600); }
}
let shakeAmt = 0; const shake = a => { shakeAmt = Math.max(shakeAmt, a); };
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const myName = () => look.name || 'Golfer';

/* ---------------- boot ---------------- */
async function boot() {
  resize();
  await loadAssets('assets', p => { $('loadbar').style.width = Math.round(p * 100) + '%'; });
  world = new World();
  course = new Course(scene, world);
  sky = new Sky(scene);
  fx = new Particles(scene); fx.setScale(innerHeight - 52);
  confetti = new Confetti(scene);
  course.fx.sound = (n, v, p) => A.play(n, v * proximity(p));
  course.fx.event = (k, d) => worldEvent(k, d);
  me = new Golfer(look); scene.add(me.root); me.setClub(3);
  swing = new Swing();
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), toon(0xffffff));
  ballMesh.castShadow = true; addOutline(ballMesh, 0.012); scene.add(ballMesh);
  ballShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1b2a1a, transparent: true, opacity: 0.25, depthWrite: false }));
  scene.add(ballShadow);
  trail = new Trail(scene, '#ffffff');
  aimDots = new THREE.Group();
  for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 - i * 0.08 })); aimDots.add(d); }
  scene.add(aimDots);
  // Start position: saved progress, or the first tee.
  const sv = loadSave();
  if (sv && Array.isArray(sv.ball)) {
    Object.assign(S, { hole: sv.hole || 1, strokes: sv.strokes || 0, holeStrokes: sv.holeStrokes || 0, falls: sv.falls || 0, lost: sv.lost || 0, best: sv.best || 0, finished: !!sv.finished, crown: !!sv.crown, aim: sv.aim || 0, startedAt: sv.startedAt || 0 });
    ball.p.fromArray(sv.ball);
    $('continueNote').hidden = false;
    $('continueNote').textContent = `Picking up on hole ${S.hole}, ${S.strokes} strokes in.`;
  } else placeOnTee(1);
  if (S.crown) me.setCrown(true);
  settleGolfer(true);
  setupTitle();
  setMode('title');
  $('loading').hidden = true; $('title').hidden = false;
  requestAnimationFrame(frame);
}
function proximity(p) { if (!p) return 1; const d = camera.position.distanceTo(p); return clamp(1.4 - d / 40, 0.05, 1); }

function placeOnTee(h) {
  const H = course.holes[h];
  ball.p.copy(H.tee); ball.v.set(0, 0, 0); ball.spin = 0; ball.frozen = false;
  // Spread golfers across the tee box so friends on the same hole do not stand inside each other.
  const F = H.frame; ball.p.addScaledVector(F.in, (Math.random() - 0.5) * 2.6).addScaledVector(F.f, (Math.random() - 0.5) * 1.2);
  S.hole = h; S.holeStrokes = 0;
  aimAt(courseTarget());
}
function courseTarget() { const H = course.holes[S.hole]; return H ? H.cup : ball.p.clone().add(V(0, 0, 10)); }
function aimAt(p) { S.aim = Math.atan2(p.x - ball.p.x, p.z - ball.p.z); }
const fDir = (yaw = S.aim) => V(Math.sin(yaw), 0, Math.cos(yaw));
const wDir = (yaw = S.aim) => { const f = fDir(yaw); return V(-f.z, 0, f.x); };
function golferOrigin(out) {
  const f = fDir(), w = wDir(), b = swing.ball;
  return out.copy(ball.p).addScaledVector(f, -b.x).addScaledVector(w, -b.z).add(V(0, -BALL_R, 0));
}
function settleGolfer(instant) {
  const from = S.golferG.clone();
  golferOrigin(S.golferG);
  swing.reset();
  if (!instant) { fx.poof(from.clone().add(V(0, 0.5, 0))); fx.poof(S.golferG.clone().add(V(0, 0.5, 0))); me.squash = 1; A.play('poof', 0.7); }
}

/* ---------------- title / customisation ---------------- */
function setupTitle() {
  const sw = (id, list, key) => {
    const el = $(id); el.innerHTML = '';
    for (const c of list) {
      const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.title = c;
      if (look[key] === c) b.classList.add('on');
      b.onclick = () => { look[key] = c; [...el.children].forEach(x => x.classList.toggle('on', x === b)); me.setLook(look); saveLook(); A.play('click'); };
      el.appendChild(b);
    }
  };
  sw('skinSw', SKINS, 'skin'); sw('shirtSw', SHIRTS, 'shirt'); sw('pantsSw', PANTS, 'pants'); sw('hatSw', SHIRTS, 'hat');
  const hs = $('hatType'); hs.innerHTML = '';
  for (const h of HATS) {
    const b = document.createElement('button'); b.className = 'chip' + (look.hatType === h ? ' on' : ''); b.textContent = h;
    b.onclick = () => { look.hatType = h; [...hs.children].forEach(x => x.classList.toggle('on', x === b)); me.setLook(look); if (S.crown) me.setCrown(true); saveLook(); A.play('click'); };
    hs.appendChild(b);
  }
  $('stache').checked = !!look.stache;
  $('stache').onchange = () => { look.stache = $('stache').checked; me.setLook(look); saveLook(); };
  $('name').value = look.name || '';
  $('name').oninput = () => { look.name = $('name').value.replace(/[^\p{L}\p{N} _.'-]/gu, '').slice(0, 16); saveLook(); };
  $('randomize').onclick = () => { Object.assign(look, { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hat: pick(SHIRTS), hatType: pick(HATS), stache: Math.random() < 0.35 }); me.setLook(look); if (S.crown) me.setCrown(true); saveLook(); setupTitle(); A.play('poof'); };
  const params = new URLSearchParams(location.search);
  S.room = (params.get('room') || 'mountain').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'mountain';
  $('roomName').textContent = S.room === 'mountain' ? 'Public mountain: everyone here climbs together' : `Private mountain: ${S.room}`;
  $('newRoom').onclick = () => { location.href = location.pathname + '?room=' + Math.random().toString(36).slice(2, 8); };
  $('copyInvite').onclick = () => { const u = location.origin + location.pathname + (S.room === 'mountain' ? '' : '?room=' + S.room); navigator.clipboard.writeText(u).then(() => toast('Invite link copied'), () => toast(escapeHtml(u))); };
  $('play').onclick = start;
  $('restartClimb').onclick = () => { if (confirm('Start the climb over from hole 1? Your stroke count resets.')) { resetClimb(); start(); } };
}
function resetClimb() {
  Object.assign(S, { strokes: 0, holeStrokes: 0, falls: 0, lost: 0, rage: 0, finished: false, startedAt: 0 });
  placeOnTee(1); settleGolfer(true); save();
}
function start() {
  A.initAudio();
  $('title').hidden = true; document.body.classList.add('playing');
  if (!S.startedAt) S.startedAt = Date.now();
  setMode('address');
  lockPointer();
  showHoleCard();
  if (!S.welcomed) { S.welcomed = true; setTimeout(() => quip('welcome', {}, true), 900); }
  if (!net) connect();
  updateHud();
}
// requestPointerLock returns a promise in newer browsers and rejects if the user backs out.
function lockPointer() { try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function setMode(m) { S.mode = m; S.modeT = 0; }

/* ---------------- input ---------------- */
addEventListener('resize', resize);
canvas.addEventListener('mousedown', e => {
  A.initAudio();
  if (S.mode === 'title' || S.mode === 'loading') return;
  if (document.pointerLockElement !== canvas) lockPointer();
  if (e.button === 2) S.aimHeld = true;
});
addEventListener('mouseup', e => { if (e.button === 2) S.aimHeld = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (S.mode === 'title') return;
  if (document.pointerLockElement === canvas || e.buttons & 1) {
    mouseDX += e.movementX; mouseDY += e.movementY;
    if (S.intro) { S.intro.moved += Math.abs(e.movementX) + Math.abs(e.movementY); if (S.intro.moved > 120) S.intro = null; }
  }
});
addEventListener('wheel', e => { if (S.mode !== 'title' && !S.paused) cycleClub(e.deltaY > 0 ? -1 : 1); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  $('clickToPlay').hidden = locked || S.mode === 'title' || S.mode === 'loading';
  if (!locked) S.aimHeld = false;
});
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'tab') { e.preventDefault(); $('board').hidden = false; renderBoard(); return; }
  if (S.mode === 'title') return;
  keys.add(k);
  if (k >= '1' && k <= '4') setClub(+k - 1);
  if (k === 'q') cycleClub(-1); if (k === 'e') cycleClub(1);
  if (k === 'm') { A.setMuted(!A.isMuted()); updateHud(); }
  if (k === 'n') { A.setMusic(!A.musicIsOn()); toast(A.musicIsOn() ? 'Music on' : 'Music off'); }
  if (k === 'b') { A.setVoice(!A.voiceIsOn()); toast(A.voiceIsOn() ? 'Announcer on' : 'Announcer off'); }
  if (k === 't') { startEmote('tantrum', 2.2); quip('tantrum', {}, false); sendEv({ k: 'emote', e: 'tantrum' }); addRage(-30); }
  if (k === 'g') { startEmote('dance', 2.4); sendEv({ k: 'emote', e: 'dance' }); }
  if (k === 'r') takeDrop();
  if (k === ' ') { if (S.mode === 'flight' && S.restT > 0) S.restT = 99; e.preventDefault(); }
  const shouts = { z: 'FORE!', x: 'Nice shot!', c: 'ARGH!', v: 'Hold my juice box.', f: '' };
  if (shouts[k]) shout(shouts[k], true);
  if (k === 'h') $('help').hidden = !$('help').hidden;
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === 'tab') $('board').hidden = true; });
function setClub(i) {
  if (S.mode !== 'address' && S.mode !== 'title') { S.pendingClub = i; return; }
  swing.setClub(i); me.setClub(i); settleGolfer(true); updateHud(); A.play('click', 0.6);
}
function cycleClub(d) { setClub((swing.ci + d + 4) % 4); }
function takeDrop() {
  if (S.mode !== 'address') return;
  const H = course.holeAt(ball.p, S.hole);
  if (H !== S.shotHole || ball.p.y < S.shotY - 4) { quip('nodrop'); return; }
  if (ball.p.distanceTo(S.shotFrom) < 0.5) return;
  S.strokes++; S.holeStrokes++;
  ball.p.copy(S.shotFrom); ball.v.set(0, 0, 0);
  settleGolfer(); quip('drop'); updateHud(); save();
}
function shout(text, mine) {
  if (!text) return;
  speech(me, text);
  A.play('chat');
  if (mine) sendEv({ k: 'shout', text });
}

/* ---------------- emotes ---------------- */
function startEmote(e, dur) { S.emote = e; S.emoteT = 0; S.emoteDur = dur; if (e === 'tantrum') A.play('rage'); }

/* ---------------- world events (from the course) ---------------- */
function worldEvent(k, d) {
  if (k === 'sail' || k === 'goose' || k === 'bumper' || k === 'sweeper' || k === 'pin' || k === 'shroom') {
    if (S.mode !== 'flight') return;
    fx.sparks(d.p, 12);
    if (!S.eventQuip || S.t - S.eventQuip > 4) { S.eventQuip = S.t; quip(k, {}, k !== 'bumper' && k !== 'shroom'); }
    if (k === 'pin') A.play('pin', 0.8);
    if (k === 'goose' || k === 'sail') addRage(6);
  }
}

/* ---------------- the shot ---------------- */
function launch(r) {
  if (!S.tipDone) { S.tipDone = true; try { localStorage.setItem('pftc-tip', '1'); } catch (e) {} $('tip').classList.remove('show'); }
  const f = fDir(), w = wDir();
  ball.v.set(0, 0, 0).addScaledVector(f, r.v.x).addScaledVector(UP, r.v.y).addScaledVector(w, r.v.z);
  ball.spin = r.spin; ball.bite = r.bite; ball.frozen = false;
  ball.p.y += 0.005;
  S.shotFrom.copy(ball.p); S.shotHole = S.hole; S.shotY = ball.p.y;
  S.strokes++; S.holeStrokes++;
  S.flightT = 0; S.restT = 0; S.firstLand = true; S.fallingWhistle = false; S.cupCheck = true;
  S.shotInfo = r;
  setMode('flight');
  trail.clear();
  const speed = r.v.length();
  if (r.kind === 'putt') A.play('putt', clamp(speed / 6, 0.3, 1));
  else A.play('hit', clamp(speed / 30, 0.4, 1), { pure: r.kind === 'pure' });
  const mph = v => Math.round(v * 2.237);
  $('shot').innerHTML = `<b>${CLUBS[swing.ci].name}</b> · head ${mph(r.headSpeed)} mph · ball ${mph(speed)} mph` + (r.kind === 'pure' ? ' · <em>PURE</em>' : r.kind === 'topped' ? ' · <em class="bad">TOPPED</em>' : '');
  $('shot').classList.add('show'); clearTimeout(launch.t); launch.t = setTimeout(() => $('shot').classList.remove('show'), 4000);
  if (r.kind === 'pure') { fx.sparks(ball.p, 26); pop('PURE!', 'great', ball.p.clone().add(V(0, 0.4, 0))); if (Math.random() < 0.6) quip('pure'); shake(0.12); }
  else if (r.kind === 'topped') { pop('topped', 'bad', ball.p.clone().add(V(0, 0.4, 0))); quip('topped'); addRage(5); }
  if (r.kind !== 'putt' && speed > 25) shake(0.1);
  sendEv({ k: 'hit', p: ball.p.toArray().map(n => +n.toFixed(2)), s: +speed.toFixed(1) });
  updateHud();
}

function ballRested() {
  // Called once the ball has settled. Decide what happened.
  const h = course.holeAt(ball.p, S.hole) ?? S.hole;
  const dropped = S.shotY - ball.p.y;
  if (h < S.shotHole && dropped > 8) {
    S.falls++; S.lost += dropped;
    const big = dropped > 20;
    quip(big ? 'bigfall' : 'fall', { m: Math.round(dropped), h });
    A.play('womp', 1); addRage(big ? 40 : 25);
    setTimeout(() => startEmote('facepalm', 2), 300);
    sendEv({ k: 'fall', m: Math.round(dropped), from: S.shotHole, to: h });
    if (h !== S.hole) { S.hole = h; S.holeStrokes = 0; setTimeout(showHoleCard, 2200); }
  } else if (h !== S.hole && h > S.hole) {
    // Rolled onto a later hole without holing out: keep playing the current one.
  } else if (h !== S.hole) { S.hole = h; S.holeStrokes = 0; }
  const z = course.zoneAt(ball.p);
  if (z && z.type === 'sand' && Math.random() < 0.6) quip('sand');
  aimAt(courseTarget());
  settleGolfer();
  setMode('address');
  if (S.pendingClub != null) { setClub(S.pendingClub); S.pendingClub = null; }
  else autoClub();
  updateHud(); save();
}
function autoClub() {
  const z = course.zoneAt(ball.p);
  const d = ball.p.distanceTo(courseTarget());
  if (z && z.type === 'green' && d < 14) setClub(0);
  else if (swing.ci === 0 && !(z && z.type === 'green')) setClub(d < 22 ? 1 : 2);
}
function penalty(kind) {
  setMode('respawn');
  ball.frozen = true;
  S.strokes++; S.holeStrokes++;
  addRage(kind === 'sea' ? 20 : 12);
  quip(kind === 'sea' ? 'sea' : 'splash');
  sendEv({ k: kind });
  setTimeout(() => {
    ball.p.copy(S.shotFrom); ball.v.set(0, 0, 0); ball.frozen = false;
    S.hole = S.shotHole;
    aimAt(courseTarget()); settleGolfer(); setMode('address'); updateHud(); save();
    pop('+1 penalty', 'bad');
  }, 1800);
}
function holed(h) {
  setMode('cup'); ball.frozen = true;
  S.sinkHole = h;
  const H = course.holes[h], n = S.holeStrokes, par = H.par, diff = n - par;
  const name = n === 1 ? 'ace' : diff <= -3 ? 'albatross' : diff === -2 ? 'eagle' : diff === -1 ? 'birdie' : diff === 0 ? 'par' : diff === 1 ? 'bogey' : diff === 2 ? 'double' : 'worse';
  const label = { ace: 'HOLE IN ONE!', albatross: 'ALBATROSS!', eagle: 'EAGLE!', birdie: 'BIRDIE!', par: 'PAR', bogey: 'BOGEY', double: 'DOUBLE BOGEY', worse: `+${diff}` }[name];
  A.play('cup', 1);
  setTimeout(() => { A.play(diff <= 0 ? 'cheer' : 'ooh', diff <= 0 ? 1 : 0.6); if (diff <= -1) A.play('fanfare'); }, 300);
  confetti.burst(H.cup.clone().add(V(0, 0.3, 0)), diff <= 0 ? 260 : 90, diff <= 0 ? 7 : 4);
  fx.sparks(H.cup.clone().add(V(0, 0.2, 0)), 30);
  pop(`${label}<small>hole ${h} in ${n}</small>`, diff <= 0 ? 'big' : 'big meh');
  quip(name, { n });
  S.best = Math.max(S.best, h);
  addRage(diff <= 0 ? -40 : -15);
  startEmote(diff <= 0 ? 'dance' : 'cheer', 2.4);
  sendEv({ k: 'sink', h, n, par });
  setTimeout(() => {
    if (h === NHOLES) return finish();
    placeOnTee(h + 1); settleGolfer(); setMode('address'); setClub(3); showHoleCard(); updateHud(); save();
  }, 2800);
}
function finish() {
  S.finished = true; S.crown = true; me.setCrown(true);
  setMode('finished');
  quip('summit', {}, true);
  A.play('fanfare'); A.play('cheer');
  S.fireworksUntil = S.t + 14;
  const secs = Math.round((Date.now() - S.startedAt) / 1000);
  $('finStrokes').textContent = S.strokes; $('finFalls').textContent = S.falls; $('finLost').textContent = Math.round(S.lost) + ' m';
  $('finTime').textContent = `${Math.floor(secs / 60)}m ${secs % 60}s`;
  setTimeout(() => { document.exitPointerLock?.(); $('finish').hidden = false; }, 2500);
  sendEv({ k: 'finish', n: S.strokes, falls: S.falls });
  save(); updateHud();
}
$('climbAgain').onclick = () => { $('finish').hidden = true; resetClimb(); setMode('address'); showHoleCard(); updateHud(); lockPointer(); };
$('stayTop').onclick = () => { $('finish').hidden = true; setMode('address'); lockPointer(); };

function showHoleCard() {
  const H = course.holes[S.hole]; if (!H) return;
  if (S.mode === 'address' && H.cup) S.intro = { t: 0, dur: 3.4, cup: H.cup.clone(), moved: 0 };
  $('hcNum').textContent = `Hole ${S.hole}`; $('hcName').textContent = H.name; $('hcPar').textContent = `Par ${H.par}`; $('hcBlurb').textContent = H.blurb;
  const el = $('holeCard'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

/* ---------------- frame ---------------- */
let last = performance.now();
const tmpBallLocal = V();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.slowmo) dt *= S.slowmo;
  step(dt);
  render(dt);
}
function step(dt) {
  S.t += dt; S.modeT += dt;
  const t = S.t;
  // Aim.
  const aimKeys = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
  if (S.mode === 'address' && !S.emote) {
    if (aimKeys) { S.aim += aimKeys * dt * (keys.has('shift') ? 0.35 : 1.1); golferOrigin(S.golferG); }
    if (S.aimHeld || keys.has('shift')) { S.aim -= mouseDX * 0.0035; golferOrigin(S.golferG); mouseDX = mouseDY = 0; }
  }
  // Swing simulation (also runs during flight for the follow-through).
  const swinging = (S.mode === 'address' || S.mode === 'flight') && !S.emote;
  if (swinging && S.mode === 'address') swing.input(mouseDX, mouseDY);
  mouseDX = mouseDY = 0;
  const sub = 6, h = dt / sub;
  let maxHead = 0;
  for (let i = 0; i < sub && swinging; i++) {
    const hv = swing.step(h, true);
    maxHead = Math.max(maxHead, hv.length());
    if (swing.groundHit > 4 && S.mode === 'address') {
      const hp = localToWorld(swing.head, V());
      if (!S.divotT || t - S.divotT > 0.4) {
        S.divotT = t;
        const z = course.zoneAt(ball.p);
        if (z && z.type === 'sand') { fx.sand(hp, 1); A.play('sand', 0.8); } else { fx.divot(hp, fDir(), clamp(swing.groundHit / 15, 0.3, 1.2)); A.play('divot', clamp(swing.groundHit / 15, 0.3, 1)); }
        // Fat: digging in properly behind the ball before reaching it.
        if (swing.groundHit > 6 && swing.groundDepth > 0.022 && swing.head.x < swing.ball.x - 0.04 && swing.head.x > swing.ball.x - 0.6) S.fat = true;
      }
    }
    if (S.mode === 'address') {
      const r = swing.strike(swing.ball);
      if (r) {
        if (S.fat) { r.v.multiplyScalar(0.55); r.kind = 'fat'; quip('fat'); addRage(5); }
        launch(r); S.fat = false;
      }
    }
  }
  if (S.mode === 'address' && swing.armed) {
    // A big swing that never touched the ball is a whiff.
    if (maxHead > 9) S.whiffArmed = true;
    const pastBall = swing.head.x > swing.ball.x + 0.25 && swing.headV.x > 4;
    if (S.whiffArmed && pastBall) { S.whiffArmed = false; pop('whiff', 'bad', ball.p.clone().add(V(0, 0.5, 0))); quip('whiff'); addRage(8); S.fat = false; }
    if (maxHead < 1 && swing.head.x < swing.ball.x) { S.whiffArmed = false; S.fat = false; }
    if (S.modeT > 40 && (!S.lastQuip || t - S.lastQuip > 40)) quip('idle', {}, false);
  }
  A.whoosh(maxHead);
  // Ball physics (always advance the world so movers keep moving).
  const wind = V();
  world.stepBall(ball, dt, (b, hh) => {
    if (b.frozen) return;
    course.windAt(b.p, wind);
    if (wind.lengthSq() && !b.grounded) b.v.addScaledVector(wind, hh);
    else if (wind.lengthSq() && b.grounded) b.v.addScaledVector(wind, hh * 0.35);
    const z = b.grounded ? course.zoneAt(b.p) : null;
    b.surfOverride = z && z.type !== 'tee' && z.type !== 'water' ? z.type : null;
    if (z && z.type === 'water') b.inWater = true;
  });
  A.wind(wind.length() / 5);
  if (S.mode === 'flight') flight(dt);
  if (S.mode === 'address' && !ball.frozen) {
    // On movers the golfer rides along; if the ball gets knocked (bonk), go back to watching it.
    if (ball.v.distanceTo(ball.gVel) > 0.6 || !ball.grounded && ball.airT > 0.15) { setMode('flight'); S.flightT = 0; S.restT = 0; S.shotFrom.copy(ball.p); S.shotY = ball.p.y; S.shotHole = S.hole; }
    else golferOrigin(S.golferG);
  }
  if (S.mode === 'finished' || (S.fireworksUntil && t < S.fireworksUntil)) {
    if (Math.random() < dt * 3) { const c = course.holes[NHOLES].cup; fx.firework(c.clone().add(V((Math.random() - 0.5) * 30, 8 + Math.random() * 10, (Math.random() - 0.5) * 30))); A.play('firework', 0.5); }
  }
  // Emotes.
  if (S.emote) { S.emoteT += dt; if (S.emoteT > S.emoteDur) { S.emote = null; swing.reset(); } }
  me.redness = lerp(me.redness, S.emote === 'tantrum' ? 1 : S.rage / 160, dt * 3);
  if (S.emote === 'tantrum' && Math.random() < dt * 30) fx.steam(me.p.head.getWorldPosition(V()).add(V(0, 0.35, 0)));
  if (S.rage > 70 && Math.random() < dt * 6) fx.steam(me.p.head.getWorldPosition(V()).add(V(0, 0.35, 0)));
  S.rage = Math.max(0, S.rage - dt * 0.6);
  poseMe(dt);
  course.update(t, dt);
  sky.update(t, dt);
  fx.update(dt); confetti.update(dt, t);
  updateOthers(dt);
  netTick(dt);
  updateCamera(dt);
  updateHudLive();
}

function flight(dt) {
  S.flightT += dt;
  const sp = ball.v.length();
  trail.push(ball.p, sp > 3);
  if (sp > 3 && Math.random() < 0.5) {}
  // First landing: sand puffs, wedges bite.
  if (ball.grounded && S.firstLand && S.flightT > 0.05) {
    S.firstLand = false;
    const z = course.zoneAt(ball.p);
    if (z && z.type === 'sand') { fx.sand(ball.p, 1.2); A.play('sand', 0.9); }
    else if (sp > 4) fx.dust(ball.p, 8, 0.6);
    if (ball.bite) { const vn = ball.v.dot(ball.gN); _a.copy(ball.v).addScaledVector(ball.gN, -vn).multiplyScalar(0.45); ball.v.copy(_a).addScaledVector(ball.gN, vn); }
  }
  if (!ball.grounded && ball.airT > 0.5) S.firstLand = true;
  // Water.
  if (ball.inWater) { ball.inWater = false; fx.splash(ball.p); A.play('splash', 1); return penalty('splash'); }
  // Sea.
  if (ball.p.y < SEA_Y + 0.3) { fx.bigSplash(V(ball.p.x, SEA_Y, ball.p.z)); A.play('splash', 1); return penalty('sea'); }
  // Falling far: whistle.
  if (!S.fallingWhistle && !ball.grounded && ball.p.y < S.shotY - 5 && ball.v.y < -8) { S.fallingWhistle = true; A.play('whistle', 1); }
  // Slow motion near the cup.
  S.slowmo = null;
  for (let h = 1; h <= NHOLES; h++) {
    const H = course.holes[h]; if (!H || !H.cup) continue;
    const dx = ball.p.x - H.cup.x, dz = ball.p.z - H.cup.z, d = Math.hypot(dx, dz);
    if (Math.abs(ball.p.y - BALL_R - H.cup.y) > 0.25) continue;
    const rel = _a.subVectors(ball.v, ball.gVel); const rs = Math.hypot(rel.x, rel.z);
    if (d < 1.4 && rs > 0.3 && rs < 5) S.slowmo = 0.45;
    if (d < CUP_R) {
      if (rs < 4.2 && ball.grounded) { ball.p.set(H.cup.x, H.cup.y - 0.06, H.cup.z); ball.v.set(0, 0, 0); S.slowmo = null; return holed(h); }
      if (S.cupCheck && d < CUP_R * 0.75) {
        S.cupCheck = false;
        // Lip out: kick it up and sideways.
        const a = (Math.random() - 0.5) * 1.6, c = Math.cos(a), s = Math.sin(a);
        const vx = ball.v.x, vz = ball.v.z;
        ball.v.x = vx * c - vz * s; ball.v.z = vx * s + vz * c; ball.v.multiplyScalar(0.7); ball.v.y = 1.4;
        A.play('lip'); quip('lip'); addRage(10); pop('LIP OUT', 'bad', H.cup.clone().add(V(0, 0.5, 0)));
      }
    } else if (d > CUP_R * 1.5 && d < 3) S.cupCheck = true;
  }
  // Cannon.
  for (const sn of course.sensors) {
    if (sn.kind !== 'cannon') continue;
    const dx = ball.p.x - sn.p.x, dz = ball.p.z - sn.p.z;
    if (Math.hypot(dx, dz) < sn.r && Math.abs(ball.p.y - sn.p.y) < 0.6 && sp < 16) return cannon(sn);
  }
  // Rest.
  const rel = _a.subVectors(ball.v, ball.gVel).length();
  if (ball.grounded && rel < 0.1) S.restT += dt; else if (S.restT < 50) S.restT = 0;
  if (S.restT > 0.9 || S.flightT > 40 || ball.p.y < SEA_Y - 20) { S.slowmo = null; trail.clear(); ballRested(); }
}
function cannon(sn) {
  setMode('cannon'); ball.frozen = true; ball.v.set(0, 0, 0);
  const H = course.holes[7];
  A.play('fuse', 1); quip('cannon');
  const tgt = H.cup.clone().add(V((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
  ballMesh.visible = false;
  const start = performance.now();
  // Aim the barrel at the target as the fuse burns.
  const aimTick = () => {
    const k = Math.min(1, (performance.now() - start) / 1200);
    sn.barrel.rotation.x = lerp(-0.6, -0.95, k) + Math.sin(k * 40) * 0.02 * (1 - k);
    if (k < 1) requestAnimationFrame(aimTick);
  };
  aimTick();
  setTimeout(() => {
    const M = sn.mouth();
    const T = 2.4;
    ball.p.copy(M);
    ball.v.set((tgt.x - M.x) / T, (tgt.y + BALL_R - M.y) / T + 0.5 * GRAV * T, (tgt.z - M.z) / T);
    ball.spin = 0; ball.bite = false; ball.frozen = false; ballMesh.visible = true;
    fx.smoke(M, ball.v.clone().normalize()); A.play('cannon', 1); shake(0.6);
    setMode('flight'); S.flightT = 0; S.restT = 0; S.firstLand = true; S.cupCheck = true;
    sendEv({ k: 'cannon' });
  }, 1300);
}

/* ---------------- posing ---------------- */
function localToWorld(p, out) { const f = fDir(), w = wDir(); return out.copy(S.golferG).addScaledVector(f, p.x).addScaledVector(UP, p.y).addScaledVector(w, p.z); }
function worldToLocal(p, out) { const f = fDir(), w = wDir(); _d.subVectors(p, S.golferG); return out.set(_d.dot(f), _d.y, _d.dot(w)); }
const poseIn = { hands: [V(), V()], club: V(), handDir: null, feet: [V(), V()] };
function poseMe(dt) {
  const f = fDir(), w = wDir();
  const s = poseIn;
  s.G = S.golferG; s.f = f; s.w = w;
  s.hop = 0; s.tilt = 0.38; s.turn = 0; s.shift = 0; s.lean = 0; s.squint = false; s.elbowsUp = false; s.handDir = null; s.headRoll = 0; s.knee = 0.03;
  // Feet follow the ground (slopes, steps).
  for (let k = 0; k < 2; k++) {
    s.feet[k].set(k ? -0.15 : 0.15, swing.R.ankle, 0.02);
    const fw = localToWorld(s.feet[k], _b); const g = world.groundAt(fw.x, fw.y + 0.6, fw.z, 2);
    if (g) s.feet[k].y += clamp(g.y - S.golferG.y, -0.25, 0.25);
  }
  if (S.emote) {
    const t = S.emoteT, e = S.emote;
    const club = s.club.set(0, 1, 0.3).normalize();
    if (e === 'tantrum') {
      s.hop = Math.abs(Math.sin(t * 11)) * 0.14; s.squint = true; s.tilt = 0.1;
      s.hands[0].set(0.16, 0.98 + Math.sin(t * 22) * 0.12, 0.12); s.hands[1].set(-0.16, 0.98 - Math.sin(t * 22) * 0.12, 0.12);
      club.set(Math.sin(t * 22) * 0.6, 1, 0.2).normalize(); s.headRoll = Math.sin(t * 15) * 0.2;
      s.feet[0].y += Math.max(0, Math.sin(t * 22)) * 0.06; s.feet[1].y += Math.max(0, -Math.sin(t * 22)) * 0.06;
      if (Math.random() < dt * 8) { fx.dust(localToWorld(V(0, 0, 0), V()), 3, 0.5); }
    } else if (e === 'dance' || e === 'cheer') {
      s.hop = Math.abs(Math.sin(t * 8)) * 0.18; s.tilt = 0.05;
      s.hands[0].set(0.2, 1.02 + Math.sin(t * 8) * 0.05, 0.05); s.hands[1].set(-0.2, 1.02 - Math.sin(t * 8) * 0.05, 0.05);
      club.set(0.3, 1, 0).normalize(); s.turn = e === 'dance' ? Math.sin(t * 4) * 0.6 : 0; s.lean = Math.sin(t * 8) * 0.12;
    } else if (e === 'facepalm') {
      s.tilt = 0.55; s.hands[0].set(0.04, 0.78, 0.2); s.hands[1].set(-0.04, 0.8, 0.22); club.set(0.4, -1, 0.3).normalize(); s.squint = true; s.headRoll = Math.sin(t * 3) * 0.15;
    }
    s.look = V(0, 0.7, 2);
  } else {
    s.hands[0].copy(swing.hand);
    s.club.subVectors(swing.head, swing.hand).normalize();
    s.hands[1].copy(swing.hand).addScaledVector(s.club, 0.075);
    const a = swing.alpha || 0;
    s.turn = clamp(a * 0.6, -1.3, 1.15);
    s.shift = a < 0 ? Math.max(-0.04, a * 0.02) : Math.min(0.07, a * 0.05);
    s.knee = 0.035 + Math.abs(a) * 0.01;
    if (S.mode === 'flight' || S.mode === 'cannon') s.look = worldToLocal(ball.p, V());
    else s.look = swing.ball.clone();
  }
  me.pose(s, dt, S.t);
}

/* ---------------- camera ---------------- */
const cam = { pos: V(130, 60, 130), look: V(0, 20, 0), fov: 55 };
function updateCamera(dt) {
  const f = fDir(), w = wDir();
  let wantPos, wantLook, k = 4;
  if (S.mode === 'title') {
    // Close on my golfer for dressing up, gently orbiting.
    const a = Math.sin(S.t * 0.25) * 0.5;
    const g = S.golferG.clone().add(V(0, 0.55, 0));
    const narrow = innerWidth < 760;
    wantLook = g.clone().addScaledVector(f, narrow ? 0 : 0.85).add(V(0, narrow ? -0.35 : 0, 0));
    wantPos = g.clone().addScaledVector(w, 2.6 * Math.cos(a)).addScaledVector(f, -2.6 * Math.sin(a) + (narrow ? 0 : 0.85)).add(V(0, 0.35, 0));
    k = 2;
  } else if (S.mode === 'flight' || S.mode === 'cannon' || S.mode === 'respawn') {
    const b = ball.p;
    const vh = _a.set(ball.v.x, 0, ball.v.z);
    if (vh.length() > 1.5) S.followDir = (S.followDir || f.clone()).lerp(vh.normalize(), dt * 2).normalize();
    const fd = S.followDir || f;
    const fall = clamp((S.shotY - b.y) / 20, 0, 1);
    wantPos = b.clone().addScaledVector(fd, -6.5 - fall * 4).add(V(0, 2.6 + fall * 6, 0));
    wantLook = b.clone().addScaledVector(fd, 2);
    if (S.mode === 'respawn') { wantPos = cam.pos.clone(); }
    k = S.flightT < 0.4 ? 2.5 : 3.5;
  } else if (S.mode === 'cup') {
    const H = course.holes[S.sinkHole];
    wantLook = H.cup.clone().add(V(0, 0.3, 0));
    wantPos = H.cup.clone().addScaledVector(f, -2.5).add(V(1, 1.4, 0));
    k = 2;
  } else if (S.mode === 'finished') {
    const c = course.holes[NHOLES].cup, a = S.t * 0.2;
    wantLook = S.golferG.clone().add(V(0, 0.6, 0));
    wantPos = wantLook.clone().add(V(Math.cos(a) * 5, 2, Math.sin(a) * 5));
    k = 1.5;
  } else if (S.aimHeld || keys.has('shift')) {
    wantPos = ball.p.clone().addScaledVector(f, -3.4).addScaledVector(w, -0.3).add(V(0, 1.3, 0));
    wantLook = ball.p.clone().addScaledVector(f, 16).add(V(0, 0.5, 0));
    k = 6;
  } else if (keys.has('f')) {
    const tgt = courseTarget();
    const mid = ball.p.clone().lerp(tgt, 0.5);
    const d = ball.p.distanceTo(tgt);
    wantLook = mid; wantPos = mid.clone().addScaledVector(f, -d * 0.3).add(V(0, 12 + d * 0.5, 0)).addScaledVector(w, d * 0.2);
    k = 3;
  } else {
    // The swing camera: in front of the golfer, across the ball, swung back from the target.
    const L = S.golferG.clone().addScaledVector(w, 0.5).addScaledVector(f, 0.9).add(V(0, 0.6, 0));
    const ang = 0.7, dist = swing.ci === 0 ? 3.1 : 3.9;
    wantPos = L.clone().addScaledVector(w, Math.cos(ang) * dist).addScaledVector(f, -Math.sin(ang) * dist).add(V(0, swing.ci === 0 ? 1.4 : 1.45, 0));
    wantLook = L;
    k = S.modeT < 1 ? 3 : 6;
    if (S.intro) {
      // Fly in from above the flag to the golfer when a hole starts.
      S.intro.t += dt;
      const e = THREE.MathUtils.smootherstep(Math.max(0, S.intro.t - 0.6) / (S.intro.dur - 0.6), 0, 1);
      const c = S.intro.cup, back = _a.subVectors(c, ball.p).setY(0).normalize();
      const p0 = c.clone().addScaledVector(back, 7).add(V(0, 7, 0)), l0 = c.clone().add(V(0, 1, 0));
      const arc = Math.sin(e * Math.PI) * 10;
      cam.pos.copy(p0).lerp(wantPos, e).add(V(0, arc, 0)); cam.look.copy(l0).lerp(wantLook, e);
      if (S.intro.t >= S.intro.dur) S.intro = null;
      wantPos = cam.pos.clone(); wantLook = cam.look.clone(); k = 1000;
    }
  }
  const a = 1 - Math.exp(-dt * k);
  cam.pos.lerp(wantPos, a); cam.look.lerp(wantLook, a);
  if (window.__freeCam) { cam.pos.fromArray(window.__freeCam[0]); cam.look.fromArray(window.__freeCam[1]); }
  camera.position.copy(cam.pos);
  if (shakeAmt > 0.001) { camera.position.add(V((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt)); shakeAmt *= Math.exp(-dt * 6); }
  camera.lookAt(cam.look);
  // Shadows follow the action.
  const focus = S.mode === 'flight' ? ball.p : S.golferG;
  sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN_DIR, 70);
}

/* ---------------- render ---------------- */
function render(dt) {
  ballMesh.position.copy(ball.p);
  if (ball.v.lengthSq() > 0.01) { const ax = _a.set(ball.v.z, 0, -ball.v.x).normalize(); ballMesh.rotateOnWorldAxis(ax, ball.v.length() * dt / BALL_R); }
  // Blob shadow under the ball helps judge its height.
  const g = world.groundAt(ball.p.x, ball.p.y, ball.p.z, 60);
  if (g && ballMesh.visible) {
    const hgt = ball.p.y - g.y;
    ballShadow.visible = hgt > 0.15; ballShadow.position.set(ball.p.x, g.y + 0.02, ball.p.z);
    ballShadow.scale.setScalar(0.07 + hgt * 0.015); ballShadow.material.opacity = clamp(0.35 - hgt * 0.01, 0.08, 0.35);
  } else ballShadow.visible = false;
  // Aim dots.
  aimDots.visible = S.mode === 'address' && !S.emote;
  if (aimDots.visible) {
    const f = fDir();
    aimDots.children.forEach((d, i) => { d.position.copy(ball.p).addScaledVector(f, 0.5 + i * 0.55 + (S.t * 0.6 % 0.55)).add(V(0, -BALL_R + 0.03, 0)); });
  }
  trail.update(camera);
  renderer.render(scene, camera);
  positionTags();
}

/* ---------------- HUD ---------------- */
function updateHud() {
  const H = course.holes[S.hole];
  $('hHole').textContent = S.hole; $('hName').textContent = H ? H.name : ''; $('hPar').textContent = H ? H.par : '';
  $('hThis').textContent = S.holeStrokes; $('hTotal').textContent = S.strokes; $('hFalls').textContent = S.falls;
  [...$('clubs').children].forEach((el, i) => el.classList.toggle('on', i === swing.ci));
  $('mute').textContent = A.isMuted() ? '🔇 M' : '🔊 M';
  renderBoard();
}
const climbMarks = [];
function updateHudLive() {
  $('tip').classList.toggle('show', !S.tipDone && S.mode === 'address' && !S.intro && S.modeT > 0.5);
  $('rageFill').style.width = S.rage + '%';
  $('rage').classList.toggle('hot', S.rage > 70);
  const top = NHOLES * RISE;
  const pct = y => clamp(y / top, -0.05, 1.02) * 100;
  $('meDot').style.bottom = pct(ball.p.y) + '%';
  if (net) for (const p of net.peers.values()) {
    if (!p.dot) { p.dot = document.createElement('i'); p.dot.className = 'odot'; $('climbTrack').appendChild(p.dot); }
    const y = p.state?.b?.[1] ?? 0;
    p.dot.style.bottom = pct(y) + '%'; p.dot.style.background = p.presence?.lk?.shirt || '#999';
    p.dot.title = p.presence?.nm || 'Golfer';
  }
  const wind = course.windAt(ball.p.clone().add(V(0, 0.5, 0)), V());
  $('wind').textContent = wind.length() > 0.5 ? `💨 gusts ${wind.length().toFixed(1)}` : '';
}

/* ---------------- multiplayer ---------------- */
const others = new Map();
async function connect() {
  try {
    net = await joinRoom(S.room, presenceInfo());
  } catch (e) { console.warn('multiplayer unavailable', e); $('netStatus').textContent = 'solo (offline)'; return; }
  net.on('connection', c => { $('netStatus').textContent = c ? 'live' : 'reconnecting…'; if (c) net.presence(presenceInfo()); });
  net.on('join', p => { toast(`👋 <b>${escapeHtml(p.presence.nm || 'A golfer')}</b> started climbing`); renderBoard(); });
  net.on('leave', p => { const o = others.get(p.id); if (o) { scene.remove(o.golfer.root); scene.remove(o.ball); o.trail.mesh.removeFromParent(); o.tag.remove(); others.delete(p.id); } p.dot?.remove(); renderBoard(); });
  net.on('event', (p, e) => remoteEvent(p, e));
}
function presenceInfo() { return { nm: myName(), lk: { skin: look.skin, shirt: look.shirt, pants: look.pants, hat: look.hat, hatType: look.hatType, stache: !!look.stache }, hole: S.hole, st: S.strokes, fa: S.falls, best: S.best, done: S.finished, crown: S.crown }; }
let netAcc = 0, presAcc = 0;
function netTick(dt) {
  if (!net || S.mode === 'title') return;
  netAcc += dt; presAcc += dt;
  if (netAcc > 0.08) {
    netAcc = 0;
    const r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;
    const hp = swing.handPlane();
    net.state({ b: ball.p.toArray().map(r2), g: [r2(S.golferG.x), r2(S.golferG.y), r2(S.golferG.z), r3(S.aim)], h: [r3(hp[0]), r3(hp[1])], hd: swing.head.toArray().map(r3), c: swing.ci, e: S.emote || 0, et: r2(S.emoteT), m: S.mode === 'flight' ? 1 : 0, rd: Math.round(me.redness * 10) / 10, bv: ballMesh.visible ? 1 : 0 });
  }
  if (presAcc > 2) { presAcc = 0; net.presence(presenceInfo()); if (!$('board').hidden) renderBoard(); $('netStatus').textContent =(net.connected() ? 'live' : 'reconnecting…') + (net.peers.size ? ` · ${net.peers.size + 1} here` : ''); }
}
function sendEv(e) { if (net) net.event(e); if (e.k === 'sink' || e.k === 'fall' || e.k === 'finish') net && net.presence(presenceInfo()); }
function remoteEvent(p, e) {
  const nm = `<b style="color:${escapeHtml(p.presence?.lk?.shirt || '#fff')}">${escapeHtml(p.presence?.nm || 'Golfer')}</b>`;
  const o = others.get(p.id);
  if (e.k === 'fall') { toast(`😂 ${nm} fell ${+e.m || 0} m (hole ${+e.from || '?'} → ${+e.to || '?'})`); if (o) A.play('womp', 0.3 * proximity(o.ball.position)); }
  else if (e.k === 'sink') { const d = (+e.n || 0) - (+e.par || 0); toast(`⛳ ${nm} sank hole ${+e.h || '?'} in ${+e.n || '?'}${+e.n === 1 ? ' — ACE!' : d < 0 ? ' (under par!)' : ''}`); if (o) confetti.burst(o.ball.position.clone(), 80, 4); }
  else if (e.k === 'sea') toast(`🌊 ${nm} hit it into the sea`);
  else if (e.k === 'finish') toast(`👑 ${nm} CONQUERED MOUNT BOGEY in ${+e.n || '?'} strokes!`);
  else if (e.k === 'shout' && o && typeof e.text === 'string') { speech(o.golfer, e.text.slice(0, 40)); A.play('chat', proximity(o.ball.position)); }
  else if (e.k === 'emote' && o) { o.emote = e.e === 'tantrum' ? 'tantrum' : 'dance'; o.emoteT = 0; }
  else if (e.k === 'hit' && o) { const pp = V().fromArray(e.p || [0, 0, 0]); A.play('hit', clamp((+e.s || 10) / 30, 0.2, 1) * proximity(pp) * 0.7); }
  else if (e.k === 'cannon' && o) A.play('cannon', proximity(o.ball.position) * 0.8);
  else if (e.k === 'bonk' && e.to === net.me && Array.isArray(e.v)) {
    // Someone's ball knocked ours.
    if (S.mode === 'address' || S.mode === 'flight') { ball.v.add(V().fromArray(e.v).clampLength(0, 15)); toast(`💥 ${nm} bonked your ball!`); }
  }
}
function othersFor(p) {
  let o = others.get(p.id);
  if (!o) {
    const lk = Object.assign({ skin: SKINS[1], shirt: SHIRTS[1], pants: PANTS[0], hat: SHIRTS[0], hatType: 'cap', stache: false }, p.presence.lk || {});
    for (const k of ['skin', 'shirt', 'pants', 'hat']) if (!/^#[0-9a-f]{6}$/i.test(lk[k] || '')) lk[k] = '#999999';
    if (!HATS.includes(lk.hatType)) lk.hatType = 'cap';
    const golfer = new Golfer(lk); scene.add(golfer.root);
    const b = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), toon(lk.shirt)); b.castShadow = true; addOutline(b, 0.012); scene.add(b);
    const tr = new Trail(scene, lk.shirt);
    const tag = document.createElement('div'); tag.className = 'tag'; $('tags').appendChild(tag);
    const sw = new Swing();
    o = { golfer, ball: b, trail: tr, tag, sw, G: V(), aim: 0, hand: V(), head: V(), bpos: V(), lastBall: V(), bvel: V(), emote: null, emoteT: 0, lk };
    others.set(p.id, o);
  }
  return o;
}
function updateOthers(dt) {
  if (!net) return;
  for (const p of net.peers.values()) {
    const s = p.state; if (!s || !Array.isArray(s.b) || !Array.isArray(s.g)) continue;
    const o = othersFor(p);
    const k = 1 - Math.exp(-dt * 12);
    const bt = V().fromArray(s.b);
    if (o.bpos.lengthSq() === 0 || o.bpos.distanceTo(bt) > 6) o.bpos.copy(bt);
    o.bvel.subVectors(bt, o.lastBall).divideScalar(0.08); o.lastBall.copy(bt);
    o.bpos.lerp(bt, k);
    o.ball.position.copy(o.bpos); o.ball.visible = s.bv !== 0;
    o.trail.push(o.bpos, s.m === 1 && o.bvel.length() > 3); o.trail.update(camera);
    const gt = V(s.g[0], s.g[1], s.g[2]);
    if (o.G.distanceTo(gt) > 2) { if (o.G.lengthSq()) fx.poof(o.G.clone().add(V(0, 0.5, 0))); o.G.copy(gt); o.golfer.squash = 1; } else o.G.lerp(gt, k);
    let da = (s.g[3] || 0) - o.aim; da = Math.atan2(Math.sin(da), Math.cos(da)); o.aim += da * k;
    if (o.sw.ci !== s.c && s.c >= 0 && s.c < 4) { o.sw.setClub(s.c); o.golfer.setClub(s.c); }
    if (Array.isArray(s.h)) { const hp = o.sw.planePoint(s.h[0], s.h[1], V()); o.hand.lerp(hp, k); }
    if (Array.isArray(s.hd)) o.head.lerp(V().fromArray(s.hd), k);
    o.golfer.redness = lerp(o.golfer.redness, +s.rd || 0, dt * 3);
    if (s.e && !o.emote) { o.emote = s.e; o.emoteT = s.et || 0; }
    if (!s.e) o.emote = null;
    if (o.emote) o.emoteT += dt;
    const f = fDir(o.aim), w = wDir(o.aim);
    const pose = { G: o.G, f, w, hands: [V(), V()], club: V(), feet: null, tilt: 0.38, turn: 0, knee: 0.03 };
    if (o.emote) {
      const t = o.emoteT;
      pose.hop = Math.abs(Math.sin(t * 10)) * 0.15; pose.tilt = 0.08;
      pose.hands[0].set(0.18, 1.0 + Math.sin(t * 20) * 0.1, 0.1); pose.hands[1].set(-0.18, 1.0 - Math.sin(t * 20) * 0.1, 0.1);
      pose.club.set(0.3, 1, 0.2).normalize(); pose.squint = o.emote === 'tantrum';
      if (o.emote === 'tantrum' && Math.random() < dt * 20) fx.steam(o.golfer.p.head.getWorldPosition(V()).add(V(0, 0.35, 0)));
    } else {
      pose.hands[0].copy(o.hand);
      pose.club.subVectors(o.head, o.hand); if (pose.club.lengthSq() < 1e-6) pose.club.set(0, -1, 0.5); pose.club.normalize();
      pose.hands[1].copy(o.hand).addScaledVector(pose.club, 0.075);
      const rel = _a.subVectors(o.hand, o.sw.S); const al = Math.atan2(rel.x, rel.dot(o.sw.a0));
      pose.turn = clamp(al * 0.6, -1.3, 1.15);
      _b.subVectors(o.bpos, o.G); pose.look = V(_b.dot(f), _b.y, _b.dot(w));
    }
    const cr = !!p.presence?.crown; if (cr !== o.crown) { o.crown = cr; o.golfer.setCrown(cr); }
    o.golfer.pose(pose, dt, S.t);
    o.tag.textContent = (p.presence?.crown ? '👑 ' : '') + (p.presence?.nm || 'Golfer');
    o.tagPos = o.G.clone().add(V(0, 1.45, 0));
    // Ball-to-ball bonks: our ball reflects, theirs gets told.
    if (S.mode === 'flight' && o.ball.visible) {
      const d = ball.p.distanceTo(o.bpos);
      if (d < BALL_R * 2 && d > 1e-4 && (!o.bonkT || S.t - o.bonkT > 0.5)) {
        o.bonkT = S.t;
        const n = _c.subVectors(ball.p, o.bpos).normalize();
        const vn = ball.v.dot(n);
        if (vn < 0) {
          const imp = n.clone().multiplyScalar(-vn * 0.9);
          ball.v.addScaledVector(n, -vn * 0.9);
          net.event({ k: 'bonk', to: p.id, v: imp.negate().toArray().map(x => +x.toFixed(2)) });
          A.play('wood', 0.8); fx.sparks(ball.p, 10); pop('BONK', 'good', ball.p.clone().add(V(0, 0.4, 0)));
        }
      }
    }
  }
}
function speech(golfer, text) {
  const el = document.createElement('div'); el.className = 'bubble'; el.textContent = text;
  $('tags').appendChild(el);
  const born = performance.now();
  const tick = () => {
    const age = (performance.now() - born) / 1000;
    if (age > 2.6) { el.remove(); return; }
    const p = golfer.root.position.clone().add(V(0, 1.75 + age * 0.1, 0)).project(camera);
    el.style.left = ((p.x + 1) / 2 * 100) + '%'; el.style.top = ((1 - p.y) / 2 * 100) + '%';
    el.style.opacity = p.z < 1 ? Math.min(1, (2.6 - age) * 2) : 0;
    requestAnimationFrame(tick);
  };
  tick();
}
function positionTags() {
  for (const o of others.values()) {
    if (!o.tagPos) continue;
    const p = o.tagPos.clone().project(camera);
    const d = camera.position.distanceTo(o.tagPos);
    const vis = p.z < 1 && d < 90;
    o.tag.style.display = vis ? '' : 'none';
    if (vis) { o.tag.style.left = ((p.x + 1) / 2 * 100) + '%'; o.tag.style.top = ((1 - p.y) / 2 * 100) + '%'; o.tag.style.opacity = clamp(1.4 - d / 70, 0.3, 1); }
  }
}
function renderBoard() {
  const rows = [{ nm: myName() + ' (you)', hole: S.hole, st: S.strokes, fa: S.falls, best: S.best, done: S.finished, crown: S.crown, shirt: look.shirt }];
  if (net) for (const p of net.peers.values()) { const q = p.presence || {}; rows.push({ nm: q.nm || 'Golfer', hole: q.hole || 1, st: q.st || 0, fa: q.fa || 0, best: q.best || 0, done: q.done, crown: q.crown, shirt: q.lk?.shirt }); }
  rows.sort((a, b) => (b.done - a.done) || (b.best - a.best) || (b.hole - a.hole) || (a.st - b.st));
  $('boardRows').innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td><i class="dot" style="background:${escapeHtml(r.shirt || '#999')}"></i>${r.crown ? '👑 ' : ''}${escapeHtml(r.nm)}</td><td>${r.done ? 'Summit!' : 'Hole ' + (+r.hole || 1)}</td><td>${+r.st || 0}</td><td>${+r.fa || 0}</td></tr>`).join('');
  $('playerCount').textContent = rows.length === 1 ? 'just you (so far)' : `${rows.length} golfers on the mountain`;
}

/* ---------------- debug hooks for headless testing (localhost only) ---------------- */
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  window.__g = {
    S, ball, camera, get info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }; }, get swing() { return swing; }, get course() { return course; }, get world() { return world; }, get me() { return me; },
    start, step: n => { for (let i = 0; i < n; i++) step(1 / 60); render(1 / 60); },
    input: (dx, dy) => { mouseDX += dx; mouseDY += dy; },
    teleport: h => { placeOnTee(h); settleGolfer(true); setMode('address'); updateHud(); },
    put: (x, y, z) => { ball.p.set(x, y, z); ball.v.set(0, 0, 0); setMode('flight'); S.flightT = 0; S.restT = 0; },
    aimAt: (x, z) => { aimAt(V(x, 0, z)); golferOrigin(S.golferG); },
    setClub,
    // Deterministic swing at 60 fps: back for `back` frames, pause, then through; runs until the ball rests.
    swingTest: (power = 1, back = 24, down = 10, club) => {
      if (club != null) setClub(club);
      const st = () => step(1 / 60);
      for (let i = 0; i < back; i++) { mouseDX -= 14; mouseDY -= 11; st(); }
      for (let i = 0; i < 14; i++) st();
      for (let i = 0; i < down; i++) { mouseDX += 60 * power; mouseDY += 46 * power; st(); }
      for (let i = 0; i < 6; i++) { mouseDX += 10; mouseDY -= 14; st(); }
      const from = S.shotFrom.clone(); let carry = null, apex = 0, n = 0;
      while (S.mode === 'flight' && n++ < 3000) { st(); apex = Math.max(apex, ball.p.y - from.y); if (carry === null && ball.grounded && S.flightT > 0.1) carry = Math.hypot(ball.p.x - from.x, ball.p.z - from.z); }
      for (let i = 0; i < 200 && S.mode !== 'address' && S.mode !== 'finished'; i++) st();
      const r = S.shotInfo;
      return { kind: r && r.kind, head: r && +r.headSpeed.toFixed(1), ball: r && +r.v.length().toFixed(1), launch: r && +(r.launch * 57.3).toFixed(1), carry: carry && +carry.toFixed(1), apex: +apex.toFixed(1), total: +Math.hypot(ball.p.x - from.x, ball.p.z - from.z).toFixed(1), y: +ball.p.y.toFixed(2), mode: S.mode, hole: S.hole, strokes: S.strokes };
    },
    // Scripted swing: back for `back` frames, pause, then through. Returns when the ball rests.
    bot: async (power = 1, back = 24) => {
      const fr = n => new Promise(r => { let k = 0; const tick = () => (++k >= n ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
      for (let i = 0; i < back; i++) { mouseDX -= 9 * power; mouseDY -= 7 * power; await fr(1); }
      await fr(10);
      for (let i = 0; i < 10; i++) { mouseDX += 34 * power; mouseDY += 26 * power; await fr(1); }
      for (let i = 0; i < 6; i++) { mouseDX += 10; mouseDY -= 14; await fr(1); }
    },
  };
}

boot().catch(e => { console.error(e); $('loadmsg').textContent = 'Something broke while loading: ' + e.message; });
