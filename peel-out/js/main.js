// Peel Out: a pizza line you work with one physical hand. The mouse drives the hand (it has
// weight and lags behind), LMB grips, RMB presses down, Space lifts. Nothing happens unless
// your hand does it: hang the ticket, fetch the dough, pound and spin it, top it, peel it in,
// pull it out, slide it onto the pass.
import * as THREE from 'three';
import { buildKitchen, L } from './kitchen.js';
import { Hand } from './hand.js';
import { Pie } from './pizza.js';
import { Peel, Ladle, Tub, Tray, Ticket, PizzaBox } from './items.js';
import { Waiter } from './staff.js';
import { Sfx } from './audio.js';
import { clamp, lerp, smooth, wrapAng, rand, pick, softDot } from './util.js';
import { TOPPINGS, CART, MENU, SIZES, WAITERS, TABLE_LINES, HIRES, UPGRADES, BIN_SERVINGS } from './data.js';

const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const LOCAL = /localhost|127\.0\.0\.1/.test(location.hostname);

// Renderer ----------------------------------------------------------------------------------
const canvasEl = $('game');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.02, 40);
const K = buildKitchen(scene, renderer);
const sfx = new Sfx();
const hand = new Hand(scene);
function resize() {
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight, pr = renderer.getPixelRatio();
  if (!w || !h || (canvasEl.width === Math.floor(w * pr) && canvasEl.height === Math.floor(h * pr))) return;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = camera.aspect < 1.2 ? 64 : 50; camera.updateProjectionMatrix();
}

// Particles: flour, smoke, steam -------------------------------------------------------------
const FX = (() => {
  const tex = softDot(), pool = [];
  for (let i = 0; i < 160; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; scene.add(s); pool.push({ s, life: 0, max: 1, vel: V(), grow: 0, a0: 1 });
  }
  let k = 0;
  return {
    emit(pos, { n = 6, color = 0xffffff, size = 0.03, grow = 0.05, life = 0.8, spread = 0.05, up = 0.2, alpha = 0.6, vel = null }) {
      for (let i = 0; i < n; i++) {
        const p = pool[k = (k + 1) % pool.length];
        p.s.visible = true; p.s.position.set(pos.x + rand(-spread, spread), pos.y + rand(0, spread * 0.5), pos.z + rand(-spread, spread));
        p.s.material.color.set(color); p.s.scale.setScalar(size); p.size = size; p.grow = grow; p.life = p.max = life * rand(0.7, 1.2); p.a0 = alpha;
        p.vel.set(rand(-1, 1) * spread * 2, up * rand(0.6, 1.3), rand(-1, 1) * spread * 2); if (vel) p.vel.add(vel);
      }
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) { if (p.s.visible) p.s.visible = false; continue; }
        p.life -= dt; const t = 1 - p.life / p.max;
        p.s.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(1 - dt * 1.5);
        p.size += p.grow * dt; p.s.scale.setScalar(p.size);
        p.s.material.opacity = p.a0 * Math.sin(Math.min(1, t * 1.2) * Math.PI) * (1 - t * 0.3);
      }
    },
  };
})();

// Things in the kitchen --------------------------------------------------------------------------
const woodPeel = new Peel(scene, false), metalPeel = new Peel(scene, true);
woodPeel.home = V(L.peelHome.x, L.COUNTER, L.peelHome.z); metalPeel.home = V(L.metalHome.x, L.COUNTER, L.metalHome.z);
const peels = [woodPeel, metalPeel];
const ladle = new Ladle(scene); ladle.home = V(L.cartX(0) - 0.02, L.BIN_FLOOR + 0.03, L.cartZ(0) + 0.04);
const tubs = CART.map((id, i) => { const t = new Tub(scene, id); const s = L.tubSpot(i); t.home = V(s.x, L.SHELF, s.z); return t; });
const coolerTray = new Tray(scene); coolerTray.home = V(L.coolerTray.x, L.SHELF, L.coolerTray.z);
const benchTray = new Tray(scene); benchTray.home = V(L.tray.x, L.BENCH, L.tray.z);
const trays = [coolerTray, benchTray];
const items = [woodPeel, metalPeel, ladle, ...tubs, coolerTray, benchTray];
const pies = [], tickets = [], bits = [];
for (const it of items) { it.goHome(); it.support = { kind: 'surface', top: it.pos.y }; }
// open takeout boxes waiting on the pass
const boxes = [4.53, 5.0, 5.47].map(x => { const b = new PizzaBox(scene); b.home = V(x, L.PASS, -0.66); b.goHome(); b.support = { kind: 'surface' }; b.sync(); return b; });
const boxUnder = (x, z, m = 0) => boxes.find(b => !b.carried && b.over(x, z, m));

// Game state ---------------------------------------------------------------------------------
const SAVE_KEY = 'peelout_v1';
const G = {
  mode: 'title', day: 1, cash: 0, hires: {}, upgrades: {}, time: 0, dayLen: 270, nextOrder: 4, orderNo: 100,
  orders: [], stats: null, rating: [], coach: true, camX: L.stations[1].x, camV: 0, camGoal: null, shake: 0,
  lastCall: false, endT: 0, best: 0, msgT: 0, alarmT: 0, smokeT: 0,
};
function freshStats() { return { served: 0, stars: [], tips: 0, sales: 0, walkouts: 0, burnt: 0, dropped: 0, refused: 0, perfect: 0 }; }
function load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.day) return s; } catch { } return null; }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ day: G.day, cash: G.cash, hires: G.hires, upgrades: G.upgrades, best: G.best })); } catch { } }

// Input --------------------------------------------------------------------------------------
const keys = {};
const input = { lmb: false, rmb: false, locked: false, soft: false, sens: 1, mdx: 0, mdy: 0, mvx: 0, mvy: 0, head: 0, circ: 0 };
const SENS = 1 / 620;
addEventListener('keydown', e => {
  if (e.repeat) { if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
  keys[e.code] = true;
  if (G.mode === 'play') {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[e.code];
    if (n !== undefined) G.camGoal = L.stations[n].x;
    if (e.code === 'KeyH') { G.coach = !G.coach; popup(G.coach ? 'hints on' : 'hints off', 'meh'); }
    if (e.code === 'Escape' && input.soft) setMode('paused');
  }
  if (e.code === 'KeyM') $('mute').textContent = sfx.toggleMute() ? 'sound off' : '';
  if (e.code === 'BracketLeft') nudgeSens(1 / 1.15);
  if (e.code === 'BracketRight') nudgeSens(1.15);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; setButtons(false, false); });
canvasEl.addEventListener('mousedown', e => {
  if (G.mode !== 'play') return;
  if (!input.locked && !input.soft) { lock(); return; }
  if (e.button === 0) setButtons(true, input.rmb);
  if (e.button === 2) setButtons(input.lmb, true);
});
addEventListener('mouseup', e => { if (e.button === 0) setButtons(false, input.rmb); if (e.button === 2) setButtons(input.lmb, false); });
addEventListener('mousemove', e => {
  if (G.mode !== 'play' || (!input.locked && !input.soft)) return;
  input.mdx += e.movementX * SENS * input.sens; input.mdy += e.movementY * SENS * input.sens;
});
canvasEl.addEventListener('contextmenu', e => e.preventDefault());
// Wheel (or Q/E) sets how high your hand rests; it stays there until you change it.
canvasEl.addEventListener('wheel', e => { if (G.mode === 'play') { H.height = clamp(H.height - Math.sign(e.deltaY) * 0.025, 0, 0.45); e.preventDefault(); } }, { passive: false });
function nudgeSens(k) { input.sens = clamp(input.sens * k, 0.35, 3); popup(`mouse ${Math.round(input.sens * 100)}%`, 'meh'); }
function lock() {
  const soft = () => { input.soft = true; };
  try {
    const p = canvasEl.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { const q = canvasEl.requestPointerLock(); if (q && q.catch) q.catch(soft); } catch { soft(); } });
  } catch { soft(); }
  setTimeout(() => { if (!input.locked) soft(); }, 700);
}
document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === canvasEl;
  if (input.locked) input.soft = false;
  else if (G.mode === 'play') { setButtons(false, false); setMode('paused'); }
});
function setButtons(l, r) {
  const pl = input.lmb, pr = input.rmb;
  input.lmb = l; input.rmb = r;
  if (G.mode !== 'play') return;
  if (l && !pl) onGrab();
  if (!l && pl) onRelease();
  if (r && !pr) H.pressStart = true;
}

// The hand -------------------------------------------------------------------------------------
const H = {
  pos: V(L.stations[1].x, 1.08, 0), vel: V(), tgt: V(), cur: { x: 0, z: -0.05 }, lift: 0, height: 0, liftZ: 0, held: null, door: null,
  handful: null, pressStart: false, impactArmed: true, lastAng: null, pose: 'open', sprT: 0, prevVy: 0, acc: V(), prevVel: V(),
  under: { top: 0.92 }, contact: false, sauceT: 0,
};
const handQ = new THREE.Quaternion(), _e = new THREE.Euler(), _v = V(), _w = V(), _u = V(), _tmp = V();
const handfulGroup = new THREE.Group(); scene.add(handfulGroup);

function lifting() { return !!keys.Space; }

// What is on top at (x, z), ignoring `ex` and things riding on it.
function topAt(x, z, y = 9, ex = null, withPies = true) {
  const k = K.topAt(x, z, y);
  let r = { top: k.top, kind: k.kind, s: k.s, thing: null };
  for (const p of peels) if (p !== ex && !p.held && p.support && p.onBlade(x, z) && p.topY() <= y + 0.03 && p.topY() > r.top) r = { top: p.topY(), kind: 'peel', thing: p };
  for (const t of trays) if (t !== ex && !t.held && t.support && Math.abs(x - t.pos.x) < t.w / 2 && Math.abs(z - t.pos.z) < t.d / 2 && t.pos.y + 0.02 <= y + 0.03 && t.pos.y + 0.02 > r.top) r = { top: t.pos.y + 0.02, kind: 'tray', thing: t };
  for (const t of tubs) if (t !== ex && !t.held && t.support && Math.hypot(x - t.pos.x, z - t.pos.z) < 0.06 && t.pos.y + 0.105 <= y + 0.03 && t.pos.y + 0.105 > r.top) r = { top: t.pos.y + 0.105, kind: 'tub', thing: t };
  // a box: pies drop in onto its floor, everything else rests on the rim (or the shut lid)
  const bx = boxUnder(x, z);
  if (bx) { const top = ex instanceof Pie && !bx.closed ? bx.floorY() : bx.rimY(); if (top <= y + 0.03 && top > r.top) r = { top, kind: 'box', thing: bx }; }
  if (withPies) for (const p of pies) {
    if (p === ex || !p.support || p.support.kind === 'air' || p.support.kind === 'held' || p.support.kind === 'waiter') continue;
    if (ex && p.support.peel === ex) continue;
    const lc = p.toLocal(x, z); if (!p.inside(lc.x, lc.z)) continue;
    const h = p.pos.y + p.heightAt(lc.x, lc.z); if (h <= y + 0.06 && h > r.top) r = { top: h, kind: 'pie', thing: p };
  }
  return r;
}

// How far back toward the wall something at (x, y) can go.
function zLimit(x, y, what) {
  const C = L.cooler;
  if (x > C.x0 && x < C.x1) {
    const d = x < C.mid ? K.doors[0] : K.doors[1];
    return d.angle > 0.55 ? -0.74 : 0.0;
  }
  for (const o of K.ovens) {
    if (Math.abs(x - o.x) < 0.45) {
      if (what === 'hand') return -0.44;
      if (!o.locked && o.angle > 1.05 && Math.abs(x - o.x) < L.MOUTH_HALF - 0.04 && y < L.MOUTH_TOP - 0.01) return L.DECK_BACK + 0.02;
      return L.OVEN_FACE + 0.06;
    }
  }
  if (x > L.pass.x0 && x < L.pass.x1 && y > L.PASS - 0.04) return what === 'hand' ? -0.95 : L.pass.z0;
  return -0.75;
}

// Grab --------------------------------------------------------------------------------------
function onGrab() {
  sfx.init();
  const hp = H.pos;
  // a door handle?
  for (const d of K.doors) {
    const hw = coolerHandle(d, _v);
    if (Math.hypot(hp.x - hw.x, hp.z - hw.z) < 0.11 && hp.y > 0.86 && hp.y < 1.5) { H.door = { type: 'cooler', d, y: clamp(hp.y, 0.9, 1.45) }; sfx.grab(); return; }
  }
  for (const o of K.ovens) {
    if (o.locked) continue;
    const hw = ovenHandle(o, _v);
    if (Math.abs(hp.x - o.x) < 0.32 && Math.abs(hp.z - hw.z) < 0.1 && Math.abs(hp.y - hw.y) < 0.42) { H.door = { type: 'oven', o }; sfx.grab(); return; }
  }
  // a box lid: grab anywhere over the box. A click flips a full box shut; dragging works too.
  for (const b of boxes) {
    if (b.carried || hp.y > b.pos.y + 0.55 || Math.abs(hp.x - b.pos.x) > b.w / 2 + 0.03 || hp.z < b.pos.z - b.w / 2 - 0.16 || hp.z > b.pos.z + b.w / 2 + 0.06) continue;
    H.door = { type: 'box', b, z0: hp.z, y0: hp.y, lid0: b.lid, moved: false };
    if (b.pie && b.isOpen) b.lidVel = -7;
    sfx.grab(); return;
  }
  // a pie coming down out of the air: catch it
  for (const p of pies) if (p.support?.kind === 'air' && p.tossed && Math.hypot(p.pos.x - hp.x, p.pos.z - hp.z) < 0.08 + p.meanR * 0.4 && Math.abs(p.pos.y - hp.y) < 0.12) { catchPie(p); return; }
  // nearest grabbable
  let best = null, bd = 1e9;
  const consider = (thing, d, max) => { if (d < max && d < bd) { bd = d; best = thing; } };
  for (const t of tickets) {
    if (t.state === 'printing' || t.state === 'gone') continue;
    if (t.state === 'rail') { consider(t, Math.hypot(t.pos.x - hp.x, (t.pos.z + 0.02 - hp.z) * 0.6), 0.075); continue; }
    consider(t, Math.hypot(t.pos.x - hp.x, t.pos.z + 0.06 - hp.z) + Math.max(0, Math.abs(t.pos.y - hp.y) - 0.12) * 2, 0.08);
  }
  for (const p of peels) {
    if (!p.support) continue;
    const gz = p.pos.z + p.gripZ; // along the handle
    const dz = clamp(hp.z, p.pos.z + p.bl / 2, gz + 0.04) - hp.z;
    consider(p, Math.hypot(p.pos.x - hp.x, dz) + Math.max(0, hp.y - p.pos.y - 0.3), 0.11);
  }
  consider(ladle, ladle.support ? Math.hypot(ladle.pos.x - hp.x, ladle.pos.z + 0.22 - hp.z) : 9, 0.09);
  for (const t of tubs) if (t.support) consider(t, Math.hypot(t.pos.x - hp.x, t.pos.z - hp.z) + Math.max(0, Math.abs(hp.y - t.pos.y - 0.11) - 0.08), 0.075);
  for (const p of pies) {
    if (!p.support || ['held', 'waiter', 'helper'].includes(p.support.kind)) continue;
    if (p.support.kind === 'peel' && p.support.peel.held) continue;
    const lc = p.toLocal(hp.x, hp.z);
    if (!p.inside(lc.x, lc.z, 1.05) || hp.y - (p.pos.y + p.heightAt(lc.x, lc.z)) > 0.14) continue;
    consider(p, Math.hypot(lc.x, lc.z) * 0.5, 1);
  }
  for (const t of trays) if (t.support) {
    const ex = Math.max(0, Math.abs(hp.x - t.pos.x) - t.w / 2), ez = Math.max(0, Math.abs(hp.z - t.pos.z) - t.d / 2);
    // grab a tray by its rim: only if no ball is right under the hand
    const inner = Math.abs(hp.x - t.pos.x) < t.w / 2 - 0.035 && Math.abs(hp.z - t.pos.z) < t.d / 2 - 0.035;
    if (!inner) consider(t, Math.hypot(ex, ez) + 0.01, 0.05);
  }
  if (best && best.kind === undefined) { // a pie
    const p = best;
    if (p.support.kind === 'surface' && p.support.s?.kind === 'deck') { popup('Too hot!', 'bad', 'pull it out with the metal peel'); sfx.buzz(); return; }
    if (p.topped || p.bake > 0.2) { popup('Use a peel', 'warn', "you can't pick up a topped pie"); sfx.buzz(); return; }
    detachPie(p); p.support = { kind: 'held' }; H.held = p; p.spin = 0; sfx.slap(0.4); return;
  }
  if (best) {
    if (best.kind === 'ticket') { best.state = 'held'; if (best.slot >= 0) { railSlots[best.slot] = null; best.slot = -1; } sfx.rip(); }
    else sfx.grab();
    best.held = true; best.support = null; H.held = best;
    if (best.kind === 'peel') { H.gripZ = clamp(hp.z - best.pos.z, best.bl / 2 + 0.05, best.gripZ); H.peelOffX = clamp(best.pos.x - hp.x, -0.05, 0.05); best.justGrabbed = 4; }
    if (best.kind === 'tray') H.trayOff = V(best.pos.x - hp.x, 0, best.pos.z - hp.z);
    return;
  }
  // a handful from a topping bin
  for (const b of K.bins) {
    if (Math.abs(hp.x - b.x) < b.w / 2 && Math.abs(hp.z - b.z) < b.d / 2 && hp.y < L.CART + 0.2) {
      if (b.id === 'sauce') { popup('Use the ladle for sauce', 'warn'); return; }
      if (b.servings <= 0) { popup(`Out of ${TOPPINGS[b.id].name.toLowerCase()}`, 'bad', 'get a tub from the cooler'); sfx.buzz(); return; }
      b.servings--; b.setFill();
      const per = b.id === 'cheese' ? 8 : TOPPINGS[b.id].per;
      H.handful = { id: b.id, n: per };
      buildHandful(b.id);
      sfx.sprinkle(3);
      return;
    }
  }
  // the bell gets slapped too
  if (Math.hypot(hp.x - L.bell.x, hp.z - L.bell.z) < 0.08) ringBell();
}

function onRelease() {
  if (H.door) { H.door = null; return; }
  if (H.handful) { dropHandful(H.handful.n, 0.05 + H.vel.length() * 0.08); H.handful = null; buildHandful(null); return; }
  const it = H.held; if (!it) return;
  H.held = null;
  if (it instanceof Pie) {
    if (lifting() && H.vel.y > 0.75 && it.flat > 0.6 && !it.ruined) {
      it.vel.set(H.vel.x * 0.25, Math.max(2.0, H.vel.y * 1.3), H.vel.z * 0.25);
      it.support = { kind: 'air' }; it.tossed = true; it.airT = 0; it.size0 = it.sizeIn;
      sfx.whoosh(clamp(Math.abs(it.spin) / 12, 0.4, 1));
      if (Math.abs(it.spin) < 4) popup('No spin!', 'warn', 'circle the mouse before you flick');
    } else { it.vel.copy(H.vel).multiplyScalar(0.8); it.support = { kind: 'air' }; it.tossed = false; }
    return;
  }
  it.held = false;
  if (it.kind === 'ticket') {
    const R = L.rail;
    if (it.pos.x > R.x0 - 0.15 && it.pos.x < R.x1 + 0.15 && it.pos.z < -0.42 && G.camX > -3.6 && G.camX < -1.2) { hangTicket(it); return; }
    it.state = 'free';
  }
  if (it.kind === 'tub') {
    for (const b of K.bins) if (Math.abs(it.pos.x - b.x) < b.w / 2 + 0.02 && Math.abs(it.pos.z - b.z) < b.d / 2 + 0.02) {
      if (b.id !== it.top) { popup(`That's ${TOPPINGS[it.top].name.toLowerCase()}`, 'warn', `this bin is ${TOPPINGS[b.id].name.toLowerCase()}`); break; }
      b.servings = b.max; b.setFill(); sfx.scoop(); sfx.sprinkle(8);
      popup(`${TOPPINGS[b.id].name} restocked`, 'good');
      it.goHome(); it.support = { kind: 'surface', top: it.home.y }; return;
    }
  }
  it.vel.copy(H.vel).multiplyScalar(0.7);
  it.support = null;
}

function coolerHandle(d, out) {
  const a = d.angle, hr = d.handleR, ho = d.handleOut;
  if (d.dir > 0) out.set(d.hinge.x + hr * Math.cos(a) - ho * Math.sin(a), 1.18, d.hinge.z + hr * Math.sin(a) + ho * Math.cos(a));
  else out.set(d.hinge.x - hr * Math.cos(a) + ho * Math.sin(a), 1.18, d.hinge.z + hr * Math.sin(a) + ho * Math.cos(a));
  return out;
}
function ovenHandle(o, out) {
  const a = o.angle, y = L.DOOR_H - 0.03, zz = 0.07;
  return out.set(o.x, L.HINGE_Y + y * Math.cos(a) - zz * Math.sin(a), L.OVEN_FACE + 0.04 + y * Math.sin(a) + zz * Math.cos(a));
}

// Handfuls of toppings ---------------------------------------------------------------------------
const pieceGeoCache = {};
function buildHandful(id) {
  while (handfulGroup.children.length) handfulGroup.remove(handfulGroup.children[0]);
  if (!id) return;
  const m = new THREE.MeshStandardMaterial({ color: TOPPINGS[id].color, roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const g = pieceGeoCache[id] ||= (id === 'cheese' ? new THREE.BoxGeometry(0.012, 0.003, 0.003) : new THREE.SphereGeometry(0.009, 8, 6));
    const mesh = new THREE.Mesh(g, m); mesh.position.set(rand(-0.02, 0.02), rand(-0.03, -0.015), rand(-0.03, 0.0)); mesh.rotation.set(rand(0, 3), rand(0, 3), 0);
    if (id === 'cheese') for (let k = 0; k < 4; k++) { const c = mesh.clone(); c.position.x += rand(-0.01, 0.01); c.rotation.y = rand(0, 3); handfulGroup.add(c); }
    handfulGroup.add(mesh);
  }
}
// Let `n` units go from the hand. Pieces fall and stick where they land.
function dropHandful(n, spread) {
  const hf = H.handful; if (!hf) return;
  const cnt = Math.min(n, hf.n); hf.n -= cnt;
  for (let i = 0; i < cnt; i++) {
    const a = rand(0, 6.283), d = Math.sqrt(Math.random()) * spread;
    const x = H.pos.x + Math.cos(a) * d + H.vel.x * 0.06, z = H.pos.z + Math.sin(a) * d + H.vel.z * 0.06;
    spawnBit(hf.id, V(H.pos.x + rand(-0.01, 0.01), H.pos.y - 0.03, H.pos.z + rand(-0.01, 0.01)), x, z, i * 0.012);
  }
  if (cnt) sfx.sprinkle(Math.min(8, cnt + 2));
  if (hf.n <= 0) { H.handful = null; buildHandful(null); }
}
const bitGeo = {
  cheese: new THREE.BoxGeometry(0.012, 0.0025, 0.003),
};
function spawnBit(id, from, x, z, delay) {
  const g = bitGeo[id] || (bitGeo[id] = new THREE.SphereGeometry(0.008, 6, 5));
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: TOPPINGS[id].color, roughness: 0.6 }));
  mesh.castShadow = true; mesh.position.copy(from); mesh.visible = delay <= 0; scene.add(mesh);
  if (id === 'cheese') mesh.scale.set(1.5, 1.5, 1.5);
  const u = topAt(x, z, from.y);
  bits.push({ id, mesh, from: from.clone(), x, z, t: -delay, dur: 0.12 + Math.max(0, from.y - u.top) * 0.6, target: u, life: 6 });
}
function updateBits(dt) {
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i]; b.t += dt;
    if (b.t < 0) continue;
    b.mesh.visible = true;
    if (!b.landed) {
      const k = Math.min(1, b.t / b.dur);
      b.mesh.position.set(lerp(b.from.x, b.x, k), lerp(b.from.y, b.target.top + 0.004, k * k), lerp(b.from.z, b.z, k));
      b.mesh.rotation.x += dt * 12;
      if (k >= 1) {
        b.landed = true;
        const p = b.target.thing instanceof Pie ? b.target.thing : null;
        if (p && p.support && !['air', 'held'].includes(p.support.kind)) {
          const lc = p.toLocal(b.x, b.z);
          if (p.inside(lc.x, lc.z, 0.95)) {
            if (b.id === 'cheese') p.addCheese(lc.x, lc.z, 0.048); else p.addPiece(b.id, lc.x, lc.z);
            scene.remove(b.mesh); b.mesh.material.dispose(); bits.splice(i, 1); continue;
          }
        }
        if (b.target.kind === 'trash' || b.target.top < 0.1) { scene.remove(b.mesh); b.mesh.material.dispose(); bits.splice(i, 1); continue; }
        b.mesh.rotation.set(0, rand(0, 3), 0);
      }
    } else {
      b.life -= dt;
      if (b.life < 1) b.mesh.scale.setScalar(Math.max(0.01, b.life));
      if (b.life <= 0) { scene.remove(b.mesh); b.mesh.material.dispose(); bits.splice(i, 1); }
    }
  }
}

// Pies ---------------------------------------------------------------------------------------
function newBall() { const p = new Pie(scene); pies.push(p); return p; }
function detachPie(p) {
  const s = p.support;
  if (s?.kind === 'tray') s.tray.slots[s.slot] = null;
  if (s?.kind === 'peel' && s.peel.pie === p) s.peel.pie = null;
  if (s?.kind === 'box' && s.box.pie === p) s.box.pie = null;
}
function putInBox(p, b) {
  detachPie(p);
  b.pie = p; p.support = { kind: 'box', box: b }; p.vel.set(0, 0, 0); p.tossed = false;
  sfx.slide(); sfx.slap(0.35);
  if (!G.boxTip) { G.boxTip = true; popup('In the box', 'good', 'now grab the box to flip the lid shut'); }
}
function removePie(p) {
  detachPie(p);
  if (H.held === p) H.held = null;
  const i = pies.indexOf(p); if (i >= 0) pies.splice(i, 1);
  p.dispose();
}
function catchPie(p) {
  const d = Math.hypot(p.pos.x - H.pos.x, p.pos.z - H.pos.z), q = clamp(d / (0.08 + p.meanR * 0.4), 0, 1);
  if (q > 0.35) { const lc = p.toLocal(H.pos.x, H.pos.z); p.lopsided(-lc.x, -lc.z, q); }
  p.support = { kind: 'held' }; H.held = p; p.tossed = false; p.vel.set(0, 0, 0);
  sfx.slap(0.6);
  const gain = p.sizeIn - (p.size0 || p.sizeIn);
  if (p.ruined === 'torn') { popup('It tore!', 'bad', 'stretched too thin'); sfx.tear(); }
  else popup(q < 0.35 ? 'Clean catch' : 'Caught it', q < 0.35 ? 'good' : 'meh', gain > 0.05 ? `+${gain.toFixed(1)}" · ${Math.round(p.roundness * 100)}% round` : '');
}
function attachToPeel(p, peel) {
  if (peel.pie && peel.pie !== p) return false;
  detachPie(p);
  peel.pie = p;
  // keep where it actually sits on the blade; it settles toward the middle as you carry it
  p.support = { kind: 'peel', peel, ox: clamp(p.pos.x - peel.pos.x, -peel.bw / 2 + 0.03, peel.bw / 2 - 0.03), oz: clamp(p.pos.z - peel.pos.z, -peel.bl / 2, peel.bl / 2 - 0.02), vx: 0, vz: 0, stuck: true, seat: 0.5 };
  return true;
}
function landPie(p, u, vy) {
  p.vel.set(0, 0, 0);
  if (u.kind === 'trash') { trashPie(p); return; }
  if (u.top < 0.1) { p.ruined = 'dropped'; G.stats.dropped++; sfx.splat(); popup('Dropped it!', 'bad', 'that one\'s for the floor'); p.support = { kind: 'surface', top: 0, s: null }; p.pos.y = 0; p.deadT = 1.4; FX.emit(p.pos, { n: 8, color: 0xf2e6cc, size: 0.04, spread: 0.08, up: 0.3 }); return; }
  if (u.kind === 'peel' && attachToPeel(p, u.thing)) { sfx.slap(0.5); return; }
  if (u.kind === 'box' && !u.thing.pie && u.thing.isOpen) { putInBox(p, u.thing); return; }
  if (u.kind === 'tray') {
    const t = u.thing, i = t.slots.findIndex(x => !x);
    if (p.flat < 0.3 && i >= 0) { t.slots[i] = p; p.support = { kind: 'tray', tray: t, slot: i }; sfx.slap(0.3); return; }
  }
  p.pos.y = u.top;
  const s = u.s || (u.kind === 'pie' ? null : null);
  p.support = { kind: 'surface', top: u.top, s };
  if (p.tossed) {
    p.tossed = false;
    if (!p.ruined) { p.flop(Math.abs(p.spin) > 8 ? 0.4 : 1); popup('Flop.', 'meh', 'catch it next time'); }
  }
  if (vy < -0.6) sfx.slap(clamp(-vy / 3, 0.3, 1));
  if (s?.kind === 'deck') { sfx.sizzle?.(); FX.emit(_v.set(p.pos.x, p.pos.y + 0.02, p.pos.z), { n: 6, color: 0xffffff, size: 0.05, up: 0.3, alpha: 0.35 }); }
}
function trashPie(p) {
  sfx.trash(); removePie(p);
}
// Called every frame for each pie.
function canYank(pl) {
  if (pl.metal && K.ovens.some(o => Math.abs(pl.pos.x - o.x) < 0.62)) return false;
  return topAt(pl.pos.x, pl.tipZ + 0.06, pl.pos.y + 0.05, pl, false).top > 0.5;
}
function updatePie(p, dt) {
  const s = p.support;
  if (s?.kind !== 'peel') p.tiltX = p.tiltZ = 0;
  if (!s || s.kind === 'air') {
    p.vel.y -= 9.8 * dt; p.pos.addScaledVector(p.vel, dt);
    if (p.tossed) {
      p.airT += dt; p.rot += p.spin * dt; p.spin *= Math.exp(-0.25 * dt); p.airStretch(dt, p.spin);
      if (p.ruined === 'torn' && !p.tearSaid) { p.tearSaid = true; sfx.tear(); popup('It tore!', 'bad', 'too thin: trash it'); }
    }
    const zl = zLimit(p.pos.x, p.pos.y, 'thing'); if (p.pos.z - p.meanR * 0.5 < zl) { p.pos.z = zl + p.meanR * 0.5; p.vel.z = Math.abs(p.vel.z) * 0.2; }
    // caught on the way down?
    if (p.tossed && p.vel.y < 0 && input.lmb && !H.held && !H.handful && !H.door && Math.hypot(p.pos.x - H.pos.x, p.pos.z - H.pos.z) < 0.08 + p.meanR * 0.4 && p.pos.y < H.pos.y + 0.04 && p.pos.y > H.pos.y - 0.12) { catchPie(p); return; }
    const u = topAt(p.pos.x, p.pos.z, p.pos.y + 0.05, p, true);
    if (p.pos.y <= u.top) landPie(p, u, p.vel.y);
    return;
  }
  if (s.kind === 'held') {
    const flat = p.flat;
    p.pos.set(H.pos.x, H.pos.y + (flat > 0.5 ? 0.016 : -p.profileH(0) - 0.006), H.pos.z + (flat > 0.5 ? 0 : -0.01));
    // spinning on the knuckles
    if (flat > 0.6 && lifting()) {
      const target = clamp(input.circ * 1.05, -26, 26);
      if (Math.abs(input.circ) > 2) p.spin += (target - p.spin) * Math.min(1, dt * 2.2); else p.spin *= Math.exp(-2 * dt);
      p.rot += p.spin * dt; p.airStretch(dt * 0.35, p.spin);
      sfx.set('swish', clamp(Math.abs(p.spin) / 25, 0, 0.3), 500 + Math.abs(p.spin) * 40);
    } else p.spin *= Math.exp(-4 * dt);
    return;
  }
  if (s.kind === 'peel') {
    const pl = s.peel;
    s.seat = Math.max(0, (s.seat || 0) - dt);
    // carried over an open box and lowered onto it: the pie slides in
    if (pl.held && !s.left) {
      const b = boxUnder(p.pos.x, p.pos.z, -0.05);
      if (b && !b.pie && b.isOpen && pl.pos.y < b.rimY() + 0.05) { putInBox(p, b); return; }
    }
    // The yank: jerk the peel back toward you and the pie's own inertia keeps it where it was.
    // Only where there's somewhere for it to land, and never with the metal peel at the ovens
    // (pulling a pie out is a backward pull too).
    if (pl.held && pl.acc.z > 11 && pl.vel.z > 0.45 && !s.left && s.seat <= 0 && canYank(pl)) { s.left = true; s.stuck = false; sfx.slide(); }
    if (s.left) {
      s.ox -= pl.vel.x * dt; s.oz -= pl.vel.z * dt; s.vx = -pl.vel.x; s.vz = -pl.vel.z;
      if (pl.vel.z < 0.35) { s.left = false; s.stuck = true; s.vx = s.vz = 0; }
    } else {
      // Otherwise it rides on cornmeal: it only skids if the peel is whipped hard, it can't skid
      // off the blade, and it settles back toward the middle while you carry it.
      const ax = pl.acc?.x || 0, az = pl.acc?.z || 0, MS = 24, MK = 9;
      if (s.stuck && Math.hypot(ax, az) > MS) { s.stuck = false; s.vx = 0; s.vz = 0; if (pl.held) sfx.slide(); }
      if (!s.stuck) {
        const vr = Math.hypot(s.vx, s.vz);
        let fx = 0, fz = 0;
        if (vr > 1e-4) { fx = -s.vx / vr * MK; fz = -s.vz / vr * MK; }
        s.vx += (-ax + fx) * dt; s.vz += (-az + fz) * dt;
        if (Math.hypot(s.vx, s.vz) < 0.03 && Math.hypot(ax, az) < MS) { s.vx = s.vz = 0; s.stuck = true; }
        s.ox += s.vx * dt; s.oz += s.vz * dt;
      } else if (pl.held) {
        const k = Math.min(1, dt * 2.5);
        s.ox += (clamp(s.ox, -0.04, 0.04) - s.ox) * k; s.oz += (clamp(s.oz, -0.05, 0.04) - s.oz) * k;
      }
      const mx = pl.bw / 2 - 0.03, z0 = -pl.bl / 2 + 0.02, z1 = pl.bl / 2 - 0.02;
      if (Math.abs(s.ox) > mx) { s.ox = Math.sign(s.ox) * mx; s.vx = 0; }
      if (s.oz < z0 || s.oz > z1) { s.oz = clamp(s.oz, z0, z1); s.vz = 0; }
    }
    // sit on the blade, tilted with it
    _w.set(s.ox, pl.topY() - pl.pos.y, s.oz).applyEuler(_e.set(pl.pitch, 0, pl.roll, 'YXZ'));
    p.pos.copy(pl.pos).add(_w); p.tiltX = pl.pitch; p.tiltZ = pl.roll;
    // off the edge? (only a yank gets it here)
    if (s.left && (Math.abs(s.ox) > pl.bw / 2 + 0.01 || s.oz < -pl.bl / 2 - 0.01)) {
      p.tiltX = p.tiltZ = 0;
      pl.pie = null;
      p.vel.set(pl.vel.x + s.vx, 0, pl.vel.z + s.vz);
      p.support = { kind: 'air' }; p.tossed = false;
      p.pos.y += 0.004;
      sfx.slide();
    }
    return;
  }
  if (s.kind === 'tray') { s.tray.slotWorld(s.slot, p.pos); return; }
  if (s.kind === 'box') {
    const b = s.box; _v.set(b.pos.x, b.floorY(), b.pos.z);
    if (b.carried) p.pos.copy(_v); else p.pos.lerp(_v, Math.min(1, dt * 12));
    return;
  }
  if (s.kind === 'surface') {
    if (s.s?.kind === 'deck') {
      const o = K.ovens[s.s.id];
      p.bakeStep(dt, o.temp, bakeRate());
      if (p.bake > 1.25) { G.smokeT += dt; if (Math.random() < dt * (p.bake > 1.45 ? 14 : 5)) FX.emit(_v.set(p.pos.x, 1.12, o.angle > 0.8 ? -0.5 : -0.48), { n: 1, color: p.bake > 1.45 ? 0x2a2a2a : 0x7a7a7a, size: 0.06, grow: 0.25, up: 0.35, life: 1.6, spread: 0.08, alpha: 0.55, vel: _w.set(0, 0.1, o.angle > 0.8 ? 0.35 : 0.15) }); }
      if (p.bake > 1.45 && !p.burntSaid) { p.burntSaid = true; G.stats.burnt++; popup('It\'s burning!', 'bad', `deck ${o.i + 1}`); sfx.alarm(); }
    }
    if (p.ruined === 'dropped') { p.deadT -= dt; if (p.deadT <= 0) removePie(p); }
    // fresh out of the oven: steam
    if (p.bake > 0.7 && s.s?.kind !== 'deck' && Math.random() < dt * 3) FX.emit(_v.set(p.pos.x, p.pos.y + 0.02, p.pos.z), { n: 1, color: 0xffffff, size: 0.04, grow: 0.12, up: 0.25, life: 1.2, spread: p.meanR * 0.5, alpha: 0.18 });
  }
}
function bakeRate() { return (1 / 17) * (G.upgrades.stone ? 1.25 : 1); }

// Peels, ladle, tubs, trays: held or loose --------------------------------------------------------
function updateItem(it, dt) {
  if (it.held) {
    if (it.kind === 'peel') {
      it.prevPos ||= it.pos.clone();
      const gz = H.gripZ || it.gripZ;
      H.peelOffX = (H.peelOffX || 0) * Math.exp(-dt * 3);
      let x = H.pos.x + H.peelOffX, z = H.pos.z - gz;
      // blade can't go through the wall or a shut oven door
      const zl = zLimit(x, H.pos.y - 0.04, 'peel');
      if (z - it.bl / 2 < zl) z = zl + it.bl / 2;
      const want = H.pos.y - 0.035;
      // the blade rides up onto a step (the pass shelf, a box rim) rather than through it
      const u = Math.max(topAt(x, z, want + 0.14, it, false).top, topAt(x, z - it.bl / 2 + 0.03, want + 0.14, it, false).top);
      // held low, the blade lies on whatever is under it rather than hovering a few mm over it
      const y = want - u < 0.05 ? u : want;
      it.pos.set(x, y, z);
      // the handle angles toward the hand; a pie on it rides at the same angle
      // but never so far that the tip, the sides or a pie hanging past them dip into what's below
      const gap = Math.max(0, y - u);
      const pMin = -Math.asin(Math.min(1, gap / (it.bl / 2 + 0.07))), rMax = Math.asin(Math.min(1, gap / (it.bw / 2 + 0.04)));
      it.pitch = clamp(Math.atan2(y + 0.022 - H.pos.y, gz), Math.max(-0.12, pMin), 0.2);
      it.roll = clamp(-H.vel.x * 0.025, -Math.min(0.04, rMax), Math.min(0.04, rMax));
      // scoop: blade lying on a surface, pushed under a pie sitting on that same surface
      if (!it.pie && it.vel.z < -0.03) for (const p of pies) {
        if (p.support?.kind !== 'surface' || p.ruined === 'dropped' || Math.abs(p.pos.y - y) > 0.035) continue;
        if (Math.abs(p.pos.x - x) < it.bw / 2 + 0.03 && it.tipZ < p.pos.z + p.meanR * 0.25 && it.tipZ > p.pos.z - p.meanR * 1.2) { attachToPeel(p, it); sfx.scoop(); break; }
      }
    } else if (it.kind === 'ladle') {
      it.pos.copy(H.pos).sub(it.gripOff);
      const zl = zLimit(it.pos.x, it.pos.y, 'thing'); if (it.pos.z < zl) it.pos.z = zl;
      const u = topAt(it.pos.x, it.pos.z, it.pos.y + 0.1, it);
      if (it.pos.y < u.top) it.pos.y = u.top;
      it.pitch = 0; it.yaw = 0;
    } else if (it.kind === 'tub') {
      it.pos.set(H.pos.x, H.pos.y - 0.115, H.pos.z);
    } else if (it.kind === 'tray') {
      it.pos.set(H.pos.x + H.trayOff.x, H.pos.y - 0.04, H.pos.z + H.trayOff.z);
      const u = topAt(it.pos.x, it.pos.z, it.pos.y + 0.05, it, false); if (it.pos.y < u.top) it.pos.y = u.top;
    } else if (it.kind === 'ticket') {
      it.pos.set(H.pos.x, H.pos.y - 0.005, H.pos.z - 0.035); it.pitch = -1.15; it.yaw = 0; it.roll = 0;
    }
  } else if (!it.support && it.kind !== 'ticket' || (it.kind === 'ticket' && it.state === 'free' && !it.support)) {
    it.vel.y -= 9.8 * dt; it.pos.addScaledVector(it.vel, dt);
    it.vel.x *= 1 - dt * 2; it.vel.z *= 1 - dt * 2;
    const zl = zLimit(it.pos.x, it.pos.y, 'thing');
    const front = it.kind === 'peel' ? it.bl / 2 : 0.03;
    if (it.pos.z - front < zl) { it.pos.z = zl + front; it.vel.z = 0; }
    const u = topAt(it.pos.x, it.pos.z, it.pos.y + 0.03, it, it.kind !== 'peel');
    if (it.kind === 'ticket') it.pitch = lerp(it.pitch, -Math.PI / 2, Math.min(1, dt * 5));
    if (it.pos.y <= u.top) {
      it.pos.y = u.top; const vy = it.vel.y; it.vel.set(0, 0, 0);
      it.pitch = it.kind === 'ticket' ? -Math.PI / 2 : 0; it.roll = 0;
      if (u.kind === 'trash') {
        if (it.kind === 'ticket') { voidTicket(it); return; }
        popup('That\'s not trash', 'warn', 'it goes back where it lives'); it.goHome(); it.support = { kind: 'surface', top: it.home.y }; sfx.clang(0.6); return;
      }
      if (u.top < 0.1) {
        if (it.kind === 'ticket') { popup('Ticket on the floor', 'warn', 'it blew back to the printer'); it.pos.set(L.printer.x, L.COUNTER + 0.002, L.printer.z + 0.2); it.support = { kind: 'surface', top: L.COUNTER }; return; }
        if (it.kind === 'tray') for (let i = 0; i < it.slots.length; i++) if (it.slots[i]) { const p = it.slots[i]; it.slots[i] = null; removePie(p); }
        sfx.clang(1); popup('Clang.', 'meh', 'dropped on the floor, put back');
        it.goHome(); it.support = { kind: 'surface', top: it.home.y }; return;
      }
      it.support = { kind: 'surface', top: u.top, thing: u.thing };
      if (vy < -0.5) it.kind === 'peel' && !it.metal ? sfx.knock(clamp(-vy / 3, 0.3, 1)) : it.kind === 'ticket' ? 0 : sfx.clang(clamp(-vy / 3, 0.3, 1));
    }
  } else if (it.support?.thing && (it.support.thing.held || !it.support.thing.support)) it.support = null;
  // acceleration of the item (for the pie sliding on a peel)
  if (it.kind === 'peel') {
    it.vel0 ||= V(); it.acc ||= V(); it.prevPos ||= it.pos.clone();
    if (it.held && it.justGrabbed > 0) { it.justGrabbed--; it.acc.set(0, 0, 0); it.vel0.set(0, 0, 0); it.vel.set(0, 0, 0); }
    else if (it.held) { _u.copy(it.pos).sub(it.prevPos).divideScalar(Math.max(dt, 1e-3)); it.acc.copy(_u).sub(it.vel0).divideScalar(Math.max(dt, 1e-3)); it.vel0.copy(_u); it.vel.copy(_u); }
    else { it.acc.set(0, 0, 0); it.vel0.set(0, 0, 0); if (it.support) it.vel.set(0, 0, 0); }
    // a single frame spike (pickup) shouldn't fling the pie
    if (it.acc.length() > 60) it.acc.setLength(60);
    it.prevPos.copy(it.pos);
  }
  it.sync();
}

// Doors ---------------------------------------------------------------------------------------
function updateDoors(dt) {
  for (const d of K.doors) {
    const prev = d.angle;
    if (H.door?.d === d) {
      const a = Math.atan2(H.tgt.z - d.hinge.z, d.dir * (H.tgt.x - d.hinge.x)) - 0.08;
      const goal = clamp(a, 0, 1.85);
      d.vel = (goal - d.angle) * 14; d.angle += clamp(d.vel * dt, -4 * dt, 4 * dt);
    } else {
      d.angle += d.vel * dt; d.vel *= Math.exp(-dt * 6);
      if (d.angle < 0.12 && d.angle > 0) d.vel -= dt * 4;  // the gasket pulls it shut
      else if (d.angle > 0.45 && d.angle < 1.8) d.vel += dt * 5;  // past halfway it swings on open
    }
    if (d.angle <= 0) { if (prev > 0.02 && d.vel < -0.3) sfx.coolerShut(); d.angle = 0; d.vel = 0; }
    if (d.angle >= 1.85) { d.angle = 1.85; d.vel = 0; }
    if (prev === 0 && d.angle > 0.02) sfx.coolerOpen();
    d.pivot.rotation.y = d.dir > 0 ? -d.angle : d.angle;
  }
  for (const o of K.ovens) {
    if (o.locked) continue;
    const prev = o.angle;
    if (H.door?.o === o) {
      const s = (H.tgt.z - (L.OVEN_FACE + 0.04) - 0.07) / (L.DOOR_H - 0.03);
      const goal = s >= 1 ? 1.5 : Math.asin(clamp(s, 0, 1)) * 1.08;
      o.vel = (clamp(goal, 0, 1.5) - o.angle) * 12; o.angle += clamp(o.vel * dt, -5 * dt, 5 * dt);
    } else {
      // a drop-down door falls open past the balance point and springs shut below it
      if (o.angle > 0.7) o.vel += dt * 6; else if (o.angle > 0) o.vel -= dt * 8;
      o.vel *= Math.exp(-dt * 3); o.angle += o.vel * dt;
    }
    if (o.angle <= 0) { if (prev > 0.05) sfx.ovenDoor(false); o.angle = 0; o.vel = 0; }
    if (o.angle >= 1.5) { if (prev < 1.49 && o.vel > 0.5) sfx.clang(0.5); o.angle = 1.5; o.vel = 0; }
    if (prev === 0 && o.angle > 0.03) { sfx.ovenDoor(true); FX.emit(_v.set(o.x, 1.2, -0.45), { n: 8, color: 0xffd9b0, size: 0.06, grow: 0.2, up: 0.4, spread: 0.15, alpha: 0.25, life: 1 }); }
    o.pivot.rotation.x = o.angle;
    // heat: a shut door holds ~650F, an open one bleeds it fast
    const open = Math.sin(o.angle);
    o.temp += ((1 - open * 0.6) - o.temp) * dt * (open > 0.3 ? 0.35 : 0.12);
    o.openFor = open > 0.4 ? o.openFor + dt : 0;
  }
  // surfaces on the open oven doors so a pie that misses the deck lands on them
}

// Tickets and the rail ---------------------------------------------------------------------------
const RAIL_N = 12, railSlots = new Array(RAIL_N).fill(null);
const railX = i => L.rail.x0 + 0.05 + i * ((L.rail.x1 - L.rail.x0 - 0.1) / (RAIL_N - 1));
function hangTicket(t) {
  let best = -1, bd = 9;
  for (let i = 0; i < RAIL_N; i++) if (!railSlots[i]) { const d = Math.abs(railX(i) - t.pos.x); if (d < bd) { bd = d; best = i; } }
  if (best < 0) { t.state = 'free'; t.support = null; return; }
  railSlots[best] = t; t.slot = best; t.state = 'rail'; t.support = { kind: 'rail' }; t.held = false;
  t.order.hung = true; sfx.clip();
  if (!G.hungOnce) { G.hungOnce = true; popup('On the rail', 'good', 'its order shows at the top of the screen'); }
}
function updateTickets(dt) {
  for (const t of tickets) {
    if (t.state === 'printing') {
      t.printT += dt;
      const k = Math.min(1, t.printT / 1.3);
      t.paper.scale.set(1, Math.max(0.02, k), 1);
      t.pos.set(L.printer.x, L.COUNTER + 0.155, L.printer.z + 0.07); t.pitch = -1.25 + k * 0.4; t.yaw = 0;
      if (k >= 1) { t.state = 'free'; t.support = null; t.vel.set(rand(-0.1, 0.1), 0.3, 0.6); }
      t.sync();
    } else if (t.state === 'rail') {
      const sway = Math.sin(performance.now() / 700 + t.slot) * 0.03;
      t.pos.set(railX(t.slot), L.rail.y - 0.004, L.rail.z + 0.03); t.pitch = 0.08 + sway; t.yaw = 0; t.roll = sway * 0.5;
      t.sync();
    } else if (t.state !== 'gone') updateItem(t, dt);
  }
}
function voidTicket(t) {
  const o = t.order; t.state = 'gone'; t.group.visible = false;
  if (t.slot >= 0) { railSlots[t.slot] = null; t.slot = -1; }
  if (o && !o.done) { closeOrder(o, 'void'); popup(`Table ${o.table}'s ticket is in the trash`, 'bad', 'they never got their pizza'); }
}

// Orders -----------------------------------------------------------------------------------------
const waiters = WAITERS.map((w, i) => new Waiter(scene, w, 4.45 + i * 0.37));
const fmtClock = t => { const m = Math.floor(17 * 60 + (t / G.dayLen) * 300), h = Math.floor(m / 60) % 12 || 12; return `${h}:${String(m % 60).padStart(2, '0')} PM`; };
function patience() { return Math.max(120, 250 - (G.day - 1) * 28); }
function spawnOrder() {
  const menu = MENU.filter(m => m.day <= G.day);
  let item = pick(menu);
  if (G.day === 1 && G.orderNo === 100) item = MENU[1]; // first ticket: a pepperoni
  const size = G.day < 2 ? SIZES[2] : pick(G.day < 3 ? [SIZES[1], SIZES[2], SIZES[2]] : SIZES);
  const free = waiters.filter(w => !G.orders.some(o => !o.done && o.waiter === w));
  const waiter = free.length ? pick(free) : pick(waiters);
  const o = {
    no: ++G.orderNo, table: 1 + Math.floor(Math.random() * 14), name: item.name, tops: item.tops, price: item.price + (size.in - 12),
    size, bake: G.day >= 3 && Math.random() < 0.18 ? 'well' : G.day >= 4 && Math.random() < 0.12 ? 'light' : 'normal',
    waiter, t0: G.time, patience: patience() + item.tops.length * 8, done: false, hung: false, clock: fmtClock(G.time), lineT: rand(8, 15),
  };
  const t = new Ticket(scene, o); o.ticket = t; tickets.push(t);
  G.orders.push(o);
  sfx.printer();
  K.printer.led.material.color.set(0xffaa33);
  setTimeout(() => K.printer.led.material.color.set(0x55ff77), 1400);
  if (G.orders.filter(x => !x.done).length === 1 && G.time > 5) popup('New ticket', 'warn', 'at the printer');
}
function openOrders() { return G.orders.filter(o => !o.done); }
function closeOrder(o, how) {
  o.done = how;
  const t = o.ticket;
  if (t.state !== 'gone') { t.state = 'gone'; t.group.visible = false; if (t.slot >= 0) railSlots[t.slot] = null; t.slot = -1; if (H.held === t) H.held = null; }
}
const bakeTarget = o => (o.bake === 'well' ? 1.25 : o.bake === 'light' ? 0.85 : 1.0);
function judge(p, o) {
  const tops = [];
  let topS = 0;
  for (const t of o.tops) {
    let s;
    if (t === 'sauce') s = clamp(p.sauceCov() / 0.5, 0, 1);
    else if (t === 'cheese') s = clamp(p.cheeseCov() / 0.45, 0, 1);
    else { const st = p.pieceStats(t), need = t === 'basil' ? 3 : 5; s = clamp(st.n / need, 0, 1) * 0.65 + clamp(st.quads / 3, 0, 1) * 0.35; }
    tops.push([t, s]); topS += s;
  }
  topS /= o.tops.length;
  const have = p.types(), extras = [...have].filter(t => !o.tops.includes(t));
  topS = clamp(topS - extras.length * 0.25, 0, 1);
  const tgt = bakeTarget(o), bd = Math.abs(p.bake - tgt), bakeS = clamp(1 - (bd - 0.13) / 0.32, 0, 1);
  const sizeS = clamp(1 - (Math.abs(p.sizeIn - o.size.in) - 1) / 2.5, 0, 1);
  const shapeS = p.roundness;
  const total = 0.45 * topS + 0.25 * bakeS + 0.15 * shapeS + 0.15 * sizeS;
  const refuse = p.ruined ? p.ruined : p.bake < 0.55 ? 'raw' : p.bake > (o.bake === 'well' ? 1.6 : 1.45) ? 'burnt' : null;
  return { total, topS, bakeS, sizeS, shapeS, extras, tops, refuse };
}
// A shut box on the pass gets picked up by whichever server's order it matches best.
function checkPass(dt) {
  for (const b of boxes) {
    const p = b.pie;
    if (!p || b.carried || !b.closed) { if (p) p.passT = 0; continue; }
    p.passT = (p.passT || 0) + dt * (G.bellT > 0 ? 4 : 1);
    if (p.passT < 1.2) continue;
    const open = openOrders();
    if (!open.length) { if (!p.noOrderSaid) { p.noOrderSaid = true; popup('Nobody ordered that', 'warn', 'no open tickets'); } continue; }
    let best = null, bs = -1, bj = null;
    for (const o of open) { const j = judge(p, o); const s = j.topS * 2 + j.sizeS * 0.5 - (G.time - o.t0) * 0.0005; if (s > bs) { bs = s; best = o; bj = j; } }
    serve(b, best, bj);
  }
  // a pie left bare on the pass: nobody will carry that out
  for (const p of pies) {
    const bare = p.support?.kind === 'surface' && p.pos.x > L.pass.x0 && p.pos.x < L.pass.x1 && p.pos.z < L.pass.z1 + 0.02 && p.pos.y > L.PASS - 0.02;
    if (bare && !p.bareSaid) { p.bareSaid = true; popup('Box it up', 'warn', 'scoop it into an open box'); }
  }
  G.bellT = Math.max(0, (G.bellT || 0) - dt);
}
function serve(b, o, j) {
  const w = o.waiter, p = b.pie;
  if (j.refuse) {
    // the server opens it, looks, and bins the whole box
    G.stats.refused++;
    say(w, pick(TABLE_LINES.refuse)); sfx.bad(); sfx.trash();
    popup(j.refuse === 'raw' ? 'Sent back: raw' : j.refuse === 'burnt' ? 'Sent back: burnt' : j.refuse === 'torn' ? 'Sent back: torn' : 'Sent back', 'bad', 'they binned it: fire another');
    removePie(p); b.reset();
    return;
  }
  b.carried = true; b.support = null; w.carry = b; w.leaving = 3.2;
  const elapsed = G.time - o.t0, pf = clamp(1 - elapsed / o.patience, 0, 1);
  const stars = clamp(Math.round((1 + j.total * 4) * 2) / 2, 1, 5);
  const sale = Math.round(o.price * (0.55 + 0.45 * j.total));
  const tip = Math.round(o.price * 0.35 * j.total * (0.4 + pf));
  G.cash += sale + tip; G.stats.sales += sale; G.stats.tips += tip; G.stats.served++; G.stats.stars.push(stars); G.rating.push(stars);
  if (j.total > 0.85) G.stats.perfect++;
  closeOrder(o, 'served');
  const notes = [];
  for (const [t, s] of j.tops) if (s < 0.6) notes.push(s < 0.15 ? `no ${TOPPINGS[t].name.toLowerCase()}` : `light on ${TOPPINGS[t].name.toLowerCase()}`);
  for (const t of j.extras) notes.push(`didn't want ${TOPPINGS[t].name.toLowerCase()}`);
  if (j.bakeS < 0.6) notes.push(p.bake < bakeTarget(o) ? 'underbaked' : 'overbaked');
  if (j.sizeS < 0.6) notes.push(p.sizeIn < o.size.in ? `small (${p.sizeIn.toFixed(0)}")` : `big (${p.sizeIn.toFixed(0)}")`);
  if (j.shapeS < 0.5) notes.push('lumpy shape');
  say(w, pick(j.total > 0.7 ? TABLE_LINES.happy : TABLE_LINES.meh));
  starPop(stars, `+$${sale + tip}${tip ? ` (tip $${tip})` : ''}`, notes.slice(0, 3).join(' · ') || 'perfect');
  sfx.cash(); if (j.total > 0.7) sfx.good();
  saveSoon();
}
function ringBell() {
  if (!sfx.gate('bell', 300)) return;
  sfx.init(); sfx.bell(); K.bell.ring = 1; G.bellT = 1.2;
}
function say(w, text) { w.say = text.replace('{t}', G.orders.find(o => o.waiter === w && !o.done)?.table ?? ''); w.sayT = 3.2; sfx.voice(w.look.name === 'Sal' ? 0.75 : w.look.name === 'Bev' ? 1.15 : 1, 4); }
function updateOrders(dt) {
  if (G.mode !== 'play') return;
  G.time += dt;
  if (!G.lastCall && G.time >= G.dayLen) { G.lastCall = true; popup('Last call', 'warn', 'finish the open tickets'); }
  const open = openOrders();
  const maxOpen = Math.min(6, G.day === 1 ? 2 : G.day + 1);
  G.nextOrder -= dt;
  if (!G.lastCall && G.nextOrder <= 0 && open.length < maxOpen) {
    spawnOrder();
    G.nextOrder = Math.max(24, 66 - (G.day - 1) * 8) * rand(0.75, 1.25) * (open.length === 0 ? 0.6 : 1);
  }
  if (!G.lastCall && open.length === 0 && G.nextOrder > 8) G.nextOrder = 8;
  for (const o of open) {
    const el = G.time - o.t0, f = el / o.patience;
    o.lineT -= dt;
    if (o.lineT <= 0 && f > 0.35) { o.lineT = rand(12, 20) * (1.2 - f); say(o.waiter, pick(f > 0.75 ? TABLE_LINES.angry : TABLE_LINES.wait).replace('{t}', o.table)); }
    if (f >= 1) {
      closeOrder(o, 'walkout'); G.stats.walkouts++; G.rating.push(1);
      say(o.waiter, `Table ${o.table} walked out.`); sfx.bad(); popup(`Table ${o.table} walked out`, 'bad', 'ticket voided');
    }
  }
  // waiters: come to the window when their ticket is getting old, leave with pies
  waiters.forEach((w, i) => {
    const o = G.orders.find(x => !x.done && x.waiter === w);
    const f = o ? (G.time - o.t0) / o.patience : 0;
    w.leaving = Math.max(0, w.leaving - dt);
    if (w.carry && w.leaving <= 0) { const b = w.carry; w.carry = null; if (b.pie) removePie(b.pie); b.reset(); }
    const active = (!!o && f > 0.25) || (w.carry && w.leaving > 2.4);
    w.tx = 4.45 + i * 0.37;
    w.update(dt, o ? clamp(1.1 - f * 1.2, 0, 1) : 1, active && !(w.carry && w.leaving <= 2.4));
    w.sayT = Math.max(0, w.sayT - dt);
  });
  if (G.lastCall && open.length === 0) { G.endT += dt; if (G.endT > 3) endDay(); }
}

// Box lids: a lid past upright falls open, below it falls shut. Fresh boxes drop onto the pass.
function updateBoxes(dt) {
  for (const b of boxes) {
    if (b.carried) { b.sync(); if (b.pie) b.pie.pos.set(b.pos.x, b.floorY(), b.pos.z); continue; }
    if (b.pos.y > b.home.y) {
      b.vel.y -= 9.8 * dt; b.pos.y += b.vel.y * dt;
      if (b.pos.y <= b.home.y) { b.pos.y = b.home.y; if (b.vel.y < -1) sfx.knock(0.3); b.vel.y = 0; }
    }
    const prev = b.lid, d = H.door?.b === b ? H.door : null;
    if (d && (Math.abs(H.pos.x - b.pos.x) > 0.5 || Math.abs(H.pos.z - b.pos.z) > 0.6)) H.door = null;
    if (d) {
      const dz = H.pos.z - d.z0, dy = Math.min(0, H.pos.y - d.y0);
      if (Math.abs(dz) > 0.02 || dy < -0.02) d.moved = true;
      if (d.moved) b.lidVel = (clamp(d.lid0 - dz * 14 + dy * 12, 0, 2.3) - b.lid) * 16;
      else b.lidVel -= Math.cos(b.lid) * 26 * dt;
    } else b.lidVel -= Math.cos(b.lid) * 26 * dt;
    b.lidVel *= Math.exp(-dt * 1.5);
    b.lid += b.lidVel * dt;
    if (b.lid <= 0) {
      if (b.lidVel < -1.5) { sfx.knock(0.5); FX.emit(_v.set(b.pos.x, b.pos.y + 0.05, b.pos.z + b.w / 2), { n: 5, color: 0xffffff, size: 0.03, grow: 0.1, up: 0.15, spread: 0.12, alpha: 0.2, life: 0.6 }); }
      b.lid = 0; b.lidVel = 0;
    }
    if (b.lid >= 2.3) { b.lid = 2.3; b.lidVel = Math.min(0, b.lidVel); }
    if (prev >= 0.04 && b.closed && b.pie && !b.pie.boxedSaid) { b.pie.boxedSaid = true; popup('Boxed', 'good', openOrders().length ? 'ring the bell' : ''); }
    b.sync();
  }
}

// Helpers you hire ---------------------------------------------------------------------------------
const helpers = HIRES.map(h => ({ ...h, hand: null, task: null, idle: 2 }));
function helperHand(h) {
  if (!h.hand) {
    h.hand = new Hand(scene, { glove: { runner: 0x3a8ad6, dough: 0x8f5ad6, oven: 0x2fa36b }[h.id], arm: false });
    h.hand.group.scale.setScalar(0.95); h.pos = V(L.cooler.mid, 1.5, 0.2); h.hand.setPose('relax');
  }
  return h.hand;
}
// A task is a list of steps: move to a point (carrying a prop) and then run a callback.
function runHelpers(dt) {
  for (const h of helpers) {
    if (!G.hires[h.id]) { if (h.hand) h.hand.setVisible(false); continue; }
    const hd = helperHand(h); hd.setVisible(true);
    if (!h.task) {
      h.idle -= dt;
      if (h.idle <= 0) { h.idle = 1.2; h.task = planHelper(h); h.step = 0; h.stepT = 0; if (h.task) h.from = h.pos.clone(); }
      _v.set(h.home?.x ?? L.stations[h.id === 'oven' ? 3 : h.id === 'dough' ? 1 : 0].x, 1.7 + Math.sin(performance.now() / 600 + h.wage) * 0.02, -0.3);
      h.pos.lerp(_v, Math.min(1, dt * 1.5));
    } else {
      const st = h.task[h.step];
      h.stepT += dt;
      const k = st.dur ? smooth(0, 1, h.stepT / st.dur) : 1;
      if (st.to) { h.pos.lerpVectors(h.from, st.to, k); h.pos.y += Math.sin(k * Math.PI) * (st.arc ?? 0.15); }
      st.each?.(k, dt);
      if (k >= 1) { st.done?.(); h.step++; h.stepT = 0; h.from = h.pos.clone(); if (h.step >= h.task.length || h.abort) { h.task = null; h.abort = false; } }
    }
    hd.setPose(h.task && h.task[h.step]?.pose ? h.task[h.step].pose : 'relax', Math.min(1, dt * 8));
    _e.set(-0.25, 0, Math.sin(performance.now() / 400) * 0.05); handQ.setFromEuler(_e);
    hd.place(h.pos, handQ);
  }
}
function planHelper(h) {
  if (h.id === 'runner') {
    const b = K.bins.find(x => x.servings === 0);
    if (b) {
      const tub = tubs.find(t => t.top === b.id); const prop = tub.group.clone(); prop.visible = false; scene.add(prop);
      return [
        { to: V(tub.home.x, 1.15, -0.25), dur: 1.4, pose: 'open' },
        { dur: 0.3, pose: 'grip', done: () => { prop.visible = true; } },
        { to: V(b.x, 1.12, b.z), dur: 2.6, pose: 'grip', arc: 0.3, each: () => prop.position.copy(h.pos).add(_w.set(0, -0.115, 0)) },
        { dur: 0.5, pose: 'grip', done: () => { b.servings = b.max; b.setFill(); sfx.scoop(); scene.remove(prop); popup(`Dev restocked ${TOPPINGS[b.id].name.toLowerCase()}`, 'meh'); } },
      ];
    }
    const empty = benchTray.slots.findIndex(x => !x);
    if (benchTray.count === 0 && benchTray.support && !benchTray.held) {
      const prop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), new THREE.MeshStandardMaterial({ color: 0xead9b6, roughness: 0.8 })); prop.scale.y = 0.75; prop.visible = false; scene.add(prop);
      let left = 4;
      return [
        { to: V(L.coolerTray.x, 1.12, L.coolerTray.z), dur: 1.4, pose: 'open' },
        { dur: 0.3, pose: 'grip', done: () => (prop.visible = true) },
        { to: V(benchTray.pos.x, 1.1, benchTray.pos.z), dur: 2.4, pose: 'grip', arc: 0.25, each: () => prop.position.copy(h.pos).add(_w.set(0, -0.05, 0)) },
        { dur: 0.4, done: () => { scene.remove(prop); for (let i = 0; i < 4 && left > 0; i++) if (!benchTray.slots[i]) { const p = newBall(); benchTray.slots[i] = p; p.support = { kind: 'tray', tray: benchTray, slot: i }; left--; } sfx.slap(0.3); popup('Dev brought dough', 'meh'); } },
      ];
    }
    void empty;
  }
  if (h.id === 'oven') {
    for (const o of K.ovens) {
      if (o.locked || H.door?.o === o) continue;
      const p = pies.find(q => q.support?.kind === 'surface' && q.support.s?.kind === 'deck' && q.support.s.id === o.i);
      const heldPeelIn = H.held?.kind === 'peel' && Math.abs(H.held.pos.x - o.x) < 0.4 && H.held.tipZ < L.OVEN_FACE;
      if (p && !heldPeelIn) {
        const ord = openOrders().map(x => [x, judge(p, x).topS]).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (p.bake < (ord ? bakeTarget(ord) : 1) - 0.03) continue;
        const bx = boxes.find(b => !b.pie && !b.carried && b.isOpen && b.pos.y <= b.home.y + 0.001);
        if (!bx) continue;
        const spot = bx.pos;
        return [
          { to: V(o.x, 1.3, -0.35), dur: 1.0, pose: 'open' },
          { dur: 0.5, pose: 'grip', each: k => { o.angle = Math.max(o.angle, k * 1.5); o.pivot.rotation.x = o.angle; }, done: () => sfx.ovenDoor(true) },
          { to: V(o.x, 1.15, -0.5), dur: 0.5, pose: 'grip', done: () => { if (p.support?.kind !== 'surface' || p.support.s?.kind !== 'deck') { h.abort = true; return; } detachPie(p); p.support = { kind: 'helper' }; } },
          { to: V(spot.x, 1.25, spot.z + 0.1), dur: 2.4, pose: 'grip', arc: 0.2, each: () => { if (p.support?.kind === 'helper') p.pos.set(h.pos.x, h.pos.y - 0.08, h.pos.z - 0.1); } },
          { dur: 0.3, done: () => { if (p.support?.kind !== 'helper') return; if (bx.pie || bx.carried || !bx.isOpen) { p.pos.set(spot.x, L.PASS, spot.z); p.support = { kind: 'surface', top: L.PASS, s: K.surfaces.find(s => s.kind === 'pass') }; h.abort = true; return; } putInBox(p, bx); } },
          { to: V(spot.x, 1.22, spot.z - 0.12), dur: 0.35, pose: 'flat' },
          { to: V(spot.x, 1.1, spot.z + 0.1), dur: 0.35, pose: 'flat', each: k => { if (H.door?.b !== bx) { bx.lid = Math.min(bx.lid, (1 - k) * 2.3); bx.lidVel = 0; } }, done: () => { if (bx.pie && bx.lid < 0.05) { bx.lid = 0; sfx.knock(0.5); } } },
          { to: V(o.x, 1.32, -0.3), dur: 1.6, pose: 'open' },
          { dur: 0.4, pose: 'flat', each: k => { if (!(H.door?.o === o)) { o.angle = Math.min(o.angle, (1 - k) * 1.5); o.pivot.rotation.x = o.angle; } }, done: () => { o.vel = 0; if (o.angle < 0.05) { o.angle = 0; sfx.ovenDoor(false); } } },
        ];
      }
      if (!p && o.openFor > 4 && !heldPeelIn) return [
        { to: V(o.x, 1.32, -0.3), dur: 1.0, pose: 'open' },
        { dur: 0.45, pose: 'flat', each: k => { if (!(H.door?.o === o)) { o.angle = Math.min(o.angle, (1 - k) * 1.5); o.pivot.rotation.x = o.angle; } }, done: () => { o.vel = 0; if (o.angle < 0.05) { o.angle = 0; sfx.ovenDoor(false); popup('Rosa shut the oven', 'meh'); } } },
      ];
    }
  }
  if (h.id === 'dough') {
    const home = Math.hypot(woodPeel.pos.x - L.peelHome.x, woodPeel.pos.z - L.peelHome.z) < 0.2;
    const ball = benchTray.slots.find(Boolean) || null;
    if (home && !woodPeel.held && woodPeel.support && !woodPeel.pie && ball && !H.held?.kind) {
      const work = V(-2.2, 1.25, -0.2);
      return [
        { to: V(ball.pos.x, 1.08, ball.pos.z), dur: 1.0, pose: 'open' },
        { dur: 0.25, pose: 'grip', done: () => { if (ball.support?.kind !== 'tray') { h.abort = true; return; } detachPie(ball); ball.support = { kind: 'helper' }; } },
        { to: work, dur: 1.2, pose: 'fist', each: () => { if (ball.support?.kind === 'helper') ball.pos.copy(h.pos).add(_w.set(0, 0.016, 0)); } },
        { dur: 4.5, pose: 'fist', each: (k, dt) => { if (ball.support?.kind !== 'helper') return; const r0 = ball.meanR; ball.makeRound(lerp(2 * r0 / 0.0254, 14, Math.min(1, dt * 1.2))); ball.rot += dt * 14; ball.pos.copy(h.pos).add(_w.set(0, 0.016 + Math.abs(Math.sin(k * 9)) * 0.25, 0)); } },
        { to: V(woodPeel.pos.x, 1.08, woodPeel.pos.z), dur: 1.6, pose: 'fist', each: () => { if (ball.support?.kind === 'helper') ball.pos.copy(h.pos).add(_w.set(0, 0.016, 0)); } },
        { dur: 0.3, done: () => { if (ball.support?.kind !== 'helper') return; ball.makeRound(14); if (!woodPeel.pie && !woodPeel.held) { ball.pos.set(woodPeel.pos.x, woodPeel.topY(), woodPeel.pos.z); attachToPeel(ball, woodPeel); } else { ball.support = { kind: 'air' }; } sfx.slap(0.5); } },
      ];
    }
  }
  return null;
}

// Hand motion -------------------------------------------------------------------------------------
function updateHand(dt) {
  // mouse -> target
  const dx = input.mdx, dy = input.mdy; input.mdx = input.mdy = 0;
  const lift = lifting();
  if (lift) { H.lift = clamp(H.lift - dy * 1.15, 0, 0.6); H.cur.x += dx; }
  else { H.cur.x += dx; H.cur.z += dy; H.lift = Math.max(0, H.lift - dt * 0.45); }  // let go of Space and the arm settles, it doesn't drop
  H.height = clamp(H.height + ((keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0)) * 0.3 * dt, 0, 0.45);
  H.cur.x = clamp(H.cur.x, -1.25, 1.25); H.cur.z = clamp(H.cur.z, -1.0, 0.55);
  // circling detector (for spinning dough)
  const a = Math.min(1, dt / 0.05), ivx = dx / Math.max(dt, 1e-3), ivy = dy / Math.max(dt, 1e-3);
  input.mvx += (ivx - input.mvx) * a; input.mvy += (ivy - input.mvy) * a;
  const sp = Math.hypot(input.mvx, input.mvy);
  if (sp > 0.25) { const hd = Math.atan2(input.mvy, input.mvx), dh = wrapAng(hd - input.head); input.head = hd; input.circ += (dh / Math.max(dt, 1e-3) - input.circ) * Math.min(1, dt * 8); }
  else input.circ *= Math.exp(-dt * 6);

  const held = H.held;
  let tx = G.camX + H.cur.x, tz = H.cur.z;
  // reach: held things keep their far end out of walls
  const zh = zLimit(tx, H.pos.y, 'hand');
  if (tz < zh) { tz = zh; H.cur.z = Math.max(H.cur.z, zh - 0.02); }
  // what's under the hand
  const ex = held instanceof Pie ? held : held;
  let below = 0.075, probeZ = tz;
  if (held?.kind === 'tub') below = 0.13;
  else if (held?.kind === 'tray') below = 0.07;
  else if (held?.kind === 'ladle') { below = 0.16; probeZ = tz - 0.25; }
  else if (held?.kind === 'peel') below = 0.06;
  else if (held instanceof Pie) below = held.flat > 0.5 ? 0.07 : 0.085;
  else if (H.handful) below = 0.08;
  const u = topAt(tx, probeZ, H.pos.y + 0.12, ex);
  H.under = u;
  let ty = Math.max(u.top + below, 0.985) + H.height + H.lift;
  // a peel's blade out in front rests on whatever it is over, and the hand rises with it
  if (held?.kind === 'peel') {
    const gz = H.gripZ || held.gripZ, bz = tz - gz;
    const bt = Math.max(topAt(tx, bz, H.pos.y + 0.1, held, false).top, topAt(tx, bz - held.bl / 2 + 0.03, H.pos.y + 0.1, held, false).top);
    ty = Math.max(ty, bt + 0.035 + H.height + H.lift);
  }
  // RMB presses the palm (or whatever is in it) down onto what's below
  const press = input.rmb && !H.door;
  if (press) ty = u.top + (held?.kind === 'ladle' ? 0.152 : held?.kind === 'peel' ? 0.03 : held?.kind === 'tub' ? 0.118 : held instanceof Pie ? 0.03 : H.handful ? 0.05 : -0.05);
  if (H.door) {
    if (H.door.type === 'cooler') coolerHandle(H.door.d, _v), ty = H.door.y;
    else if (H.door.type === 'oven') { ovenHandle(H.door.o, _v); ty = _v.y; }
  }
  H.tgt.set(tx, ty, tz);
  // spring with a force limit: heavy things lag, overshoot a little, and can't be whipped around instantly
  const mass = held ? (held.mass ?? 0.4) + (held.pie ? 0.5 : 0) : 0.15;
  const wn = held?.kind === 'peel' ? 9.5 : held ? 13 : 17, zeta = 0.8;
  const aMax = held?.kind === 'peel' ? 16 : 34 / (1 + mass);
  _v.subVectors(H.tgt, H.pos).multiplyScalar(wn * wn).addScaledVector(H.vel, -2 * zeta * wn);
  // pounding slams down hard; otherwise the arm is held up and lowers under control
  const ay = press ? clamp(_v.y * (held ? 1.2 : 2.6), -90, 55) : clamp(_v.y * 0.9, -14, 40); _v.y = 0;
  if (_v.length() > aMax) _v.setLength(aMax);
  H.vel.x += _v.x * dt; H.vel.z += _v.z * dt; H.vel.y += ay * dt;
  if (lift) H.vel.y += (H.tgt.y - H.pos.y) * 30 * dt;  // lifting is quick: it's your whole arm
  H.pos.addScaledVector(H.vel, dt);
  // never further than arm's reach from where you stand
  if (Math.abs(H.pos.x - G.camX) > 1.4) { H.pos.x = clamp(H.pos.x, G.camX - 1.4, G.camX + 1.4); H.vel.x *= 0.3; }
  if (H.pos.z > 0.62) { H.pos.z = 0.62; H.vel.z = Math.min(0, H.vel.z); }
  // a door handle holds the hand where it is
  if (H.door && H.door.type !== 'box') {
    const hw = H.door.type === 'cooler' ? coolerHandle(H.door.d, _w) : ovenHandle(H.door.o, _w);
    if (H.door.type === 'cooler') hw.y = H.door.y;
    H.pos.lerp(hw, Math.min(1, dt * 25)); H.vel.multiplyScalar(0.5);
    if (H.pos.distanceTo(H.tgt) > 0.5) H.door = null; // pulled too far: lost the grip
  }
  // never through the counter
  H.vyPre = H.vel.y;
  const floorY = topAt(H.pos.x, H.pos.z, H.pos.y + 0.05, ex).top + (held?.kind === 'tub' ? 0.115 : 0.012);
  if (H.pos.y < floorY) { if (H.vel.y < 0) H.vel.y = 0; H.pos.y = floorY; }
  const zl = zLimit(H.pos.x, H.pos.y, 'hand'); if (H.pos.z < zl) { H.pos.z = zl; H.vel.z = Math.max(0, H.vel.z); }
  H.contact = press && H.pos.y < u.top + 0.035;

  // pose and orientation
  let pose = H.door ? 'grip' : held ? (held instanceof Pie ? (held.flat > 0.5 ? 'toss' : 'grip') : held.kind === 'ticket' ? 'pinch' : 'grip') : H.handful ? 'pinch' : press ? (u.kind === 'pie' && u.thing?.canStretch && !u.thing?.flatEnough ? 'fist' : 'flat') : input.lmb ? 'grip' : 'open';
  if (press && !held && u.kind === 'pie' && u.thing && u.thing.meanR > 0.1) pose = 'flat';
  hand.setPose(pose, Math.min(1, dt * 14));
  const shoulder = shoulderPos(_u);
  const d = _w.subVectors(H.pos, shoulder); const yaw = Math.atan2(-d.x, -d.z);
  const pitch = press ? -0.02 : held?.kind === 'peel' ? 0.15 : held instanceof Pie && held.flat > 0.5 ? 0.12 : H.door?.type === 'cooler' ? 0.1 : -0.22;
  const roll = H.door?.type === 'cooler' ? -1.3 : clamp(-H.vel.x * 0.08, -0.25, 0.25);
  _e.set(pitch + clamp(H.vel.z * 0.05, -0.1, 0.1), yaw, roll, 'YXZ'); handQ.setFromEuler(_e);
  hand.place(H.pos, handQ);
  hand.updateArm(shoulder);
  handfulGroup.position.copy(H.pos); handfulGroup.quaternion.copy(handQ);
  // acceleration (used for slip)
  H.acc.subVectors(H.vel, H.prevVel).divideScalar(Math.max(dt, 1e-3)); H.prevVel.copy(H.vel);
}
function shoulderPos(out) { return out.set(camera.position.x + 0.3 + (H.pos.x - G.camX) * 0.25, camera.position.y - 0.42, camera.position.z - 0.28); }

// RMB actions: pounding, palm-spinning, sauce, sprinkling, the bell.
function updateActions(dt) {
  const held = H.held, u = H.under;
  if (!input.rmb) { H.impactArmed = true; H.lastAng = null; sfx.set('squelch', 0); if (!(held instanceof Pie && lifting())) sfx.set('swish', 0); return; }
  if (H.pressStart) {
    H.pressStart = false;
    if (!held && Math.hypot(H.pos.x - L.bell.x, H.pos.z - L.bell.z) < 0.09) ringBell();
  }
  // empty hand on dough
  const p = !held && !H.handful && u.kind === 'pie' ? u.thing : null;
  if (p && H.pos.y < u.top + 0.03) {
    const lc = p.toLocal(H.pos.x, H.pos.z);
    if (H.impactArmed && H.vyPre < -0.25) {
      H.impactArmed = false;
      const k = clamp(-H.vyPre / 1.1, 0.45, 1.3);
      if (p.canStretch) {
        const before = p.sizeIn; p.pound(lc.x, lc.z, k); sfx.pound(k);
        FX.emit(_v.set(H.pos.x, u.top + 0.01, H.pos.z), { n: 5, color: 0xfffaf0, size: 0.025, grow: 0.12, up: 0.15, spread: 0.06, alpha: 0.5, life: 0.7 });
        G.shake = 0.004 * k;
        if (p.ruined === 'torn') { popup('Tore it!', 'bad', 'too thin: trash it'); sfx.tear(); }
        else if (!G.poundTip && p.sizeIn > 9 && before <= 9) { G.poundTip = true; popup('Now spin it', 'meh', 'keep RMB down and circle the mouse'); }
      } else { sfx.slap(0.4); if (p.topped && sfx.gate('squash', 2000)) popup("Don't squash it", 'warn'); }
    }
    // palm spin: circling the hand while pressed turns the dough under it
    const ang = Math.atan2(-(H.pos.z - p.pos.z), H.pos.x - p.pos.x), dist = Math.hypot(lc.x, lc.z);
    if (H.lastAng !== null && dist > p.meanR * 0.18) {
      const dth = wrapAng(ang - H.lastAng);
      if (Math.abs(dth) < 0.5) { p.rot += dth * 0.92; if (p.canStretch) p.palmSpin(dth); sfx.set('swish', clamp(Math.abs(dth) / dt / 30, 0, 0.18), 700); }
    }
    H.lastAng = ang;
  } else { H.lastAng = null; sfx.set('swish', 0); }
  if (H.pos.y > u.top + 0.05) H.impactArmed = true;
  // ladle: refill in the sauce bin, paint on dough
  if (held?.kind === 'ladle') {
    const lp = held.pos, sb = K.bins[0];
    if (Math.abs(lp.x - sb.x) < sb.w / 2 && Math.abs(lp.z - sb.z) < sb.d / 2) {
      if (held.amount < 0.4 && sfx.gate('ladle', 600)) {
        if (sb.servings <= 0) { popup('Out of sauce', 'bad', 'tub of sauce is in the cooler'); sfx.buzz(); }
        else { sb.servings--; sb.setFill(); held.amount = 1; sfx.scoop(); }
      }
    } else {
      const q = topAt(lp.x, lp.z, lp.y + 0.08, held);
      if (q.kind === 'pie' && lp.y < q.top + 0.03 && held.amount > 0) {
        const pie = q.thing, lc = pie.toLocal(lp.x, lp.z);
        const mv = Math.hypot(H.vel.x, H.vel.z);
        pie.addSauce(lc.x, lc.z, 0.32 + mv * 0.4);
        held.amount = Math.max(0, held.amount - dt * (0.1 + mv * 0.32));
        sfx.set('squelch', 0.12 + mv * 0.3, 400 + mv * 400);
        if (held.amount <= 0 && sfx.gate('ladleout', 1500)) popup('Ladle empty', 'meh', 'dip it back in the sauce bin');
      } else sfx.set('squelch', 0);
    }
  }
  // a handful: let it go a pinch at a time
  if (H.handful) {
    H.sprT -= dt;
    if (H.sprT <= 0) { H.sprT = H.handful.id === 'cheese' ? 0.09 : 0.075; dropHandful(1, 0.018 + H.vel.length() * 0.03); }
  }
}

// Camera -----------------------------------------------------------------------------------------
function updateCamera(dt) {
  const dir = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let want = 0;
  if (dir) { want = dir * 2.4; G.camGoal = null; }
  else if (G.camGoal !== null) { const e = G.camGoal - G.camX; want = clamp(e * 3, -2.4, 2.4); if (Math.abs(e) < 0.01) G.camGoal = null; }
  // gentle acceleration so a loaded peel survives the walk
  const amax = H.held?.kind === 'peel' && H.held.pie ? 4 : 7;
  G.camV += clamp(want - G.camV, -amax * dt, amax * dt);
  G.camX = clamp(G.camX + G.camV * dt, -4.95, 5.05);
  if ((G.camX <= -4.95 && G.camV < 0) || (G.camX >= 5.05 && G.camV > 0)) G.camV = 0;
  const hx = (H.pos.x - G.camX), sh = G.shake; G.shake *= Math.exp(-dt * 20);
  const lookUp = G.camX < -4 ? 0.12 : G.camX > 4 ? 0.1 : 0;
  // at the ovens you crouch a little to look in through the mouth
  const ov = smooth(1.2, 0.35, Math.abs(G.camX - L.stations[3].x));
  camera.position.set(G.camX + hx * 0.06 + rand(-sh, sh), 1.74 + lookUp * 0.3 - ov * 0.16 + rand(-sh, sh), 1.14 - ov * 0.1);
  _v.set(G.camX + hx * 0.18, 0.94 + lookUp + ov * 0.1, -0.32 - ov * 0.33 + H.cur.z * 0.06);
  camera.lookAt(_v);
}

// Cooler rules: dough regrows in the cooler tray; leaving the doors open sets off a beeper.
function updateCooler(dt) {
  const inCooler = t => t.pos.x > L.cooler.x0 && t.pos.x < L.cooler.x1 && t.pos.z < -0.05;
  if (coolerTray.support && !coolerTray.held && inCooler(coolerTray)) {
    G.doughT = (G.doughT || 0) + dt;
    const i = coolerTray.slots.findIndex(x => !x);
    if (i >= 0 && G.doughT > 1.5) { G.doughT = 0; const p = newBall(); coolerTray.slots[i] = p; p.support = { kind: 'tray', tray: coolerTray, slot: i }; }
  }
  const open = Math.max(K.doors[0].angle, K.doors[1].angle) > 0.2;
  G.coolerOpenT = open ? (G.coolerOpenT || 0) + dt : 0;
  sfx.set('hum', open ? 0.05 : 0);
  if (G.coolerOpenT > 14) { G.alarmT -= dt; if (G.alarmT <= 0) { G.alarmT = 0.9; sfx.beep(); } }
  if (G.coolerOpenT > 14 && !G.coolerSaid) { G.coolerSaid = true; popup('Close the cooler!', 'warn', "it's beeping at you"); }
  if (!open) G.coolerSaid = false;
}

// HUD --------------------------------------------------------------------------------------------
const hud = { rail: $('rail'), coach: $('coach'), held: $('held'), tags: $('ovenTags'), bubbles: $('bubbles'), stations: $('stations') };
const tagEls = K.ovens.map(o => { const d = document.createElement('div'); d.className = 'otag'; d.innerHTML = '<div class="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg"/></svg><b></b></div><span></span>'; hud.tags.appendChild(d); return d; });
const bubbleEls = waiters.map(() => { const d = document.createElement('div'); d.className = 'bubble'; hud.bubbles.appendChild(d); return d; });
L.stations.forEach((s, i) => { const b = document.createElement('button'); b.innerHTML = `<kbd>${i + 1}</kbd>${s.name}`; b.onclick = () => { G.camGoal = s.x; canvasEl.focus(); }; hud.stations.appendChild(b); });
function project(p, out) { _tmp.copy(p).project(camera); out.x = (_tmp.x * 0.5 + 0.5) * canvasEl.clientWidth; out.y = (-_tmp.y * 0.5 + 0.5) * canvasEl.clientHeight + canvasEl.offsetTop; out.z = _tmp.z; return out; }
const scr = { x: 0, y: 0, z: 0 };
let railKey = '';
function updateHud() {
  $('day').textContent = `Day ${G.day}`;
  $('clock').textContent = fmtClock(Math.min(G.time, G.dayLen));
  $('cash').textContent = `$${G.cash}`;
  const r = G.rating.slice(-12); const avg = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  $('stars').textContent = r.length ? '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg)) : '☆☆☆☆☆';
  // rail mirror: hung tickets, left to right
  const hung = railSlots.filter(Boolean).map(t => t.order).filter(o => !o.done);
  const focus = woodPeel.pie || pies.find(p => p.support?.kind === 'surface' && p.support.s?.kind !== 'deck' && p.topped && !p.refused) || null;
  const key = hung.map(o => o.no).join(',');
  if (key !== railKey) {
    railKey = key;
    hud.rail.innerHTML = hung.map(o => `<div class="tk" data-no="${o.no}"><div class="tkh"><b>${o.size.label} ${o.name}</b><span>T${o.table} · ${o.waiter.look.name}</span></div><div class="tops">${o.tops.map(t => `<i data-t="${t}">${TOPPINGS[t].short}</i>`).join('')}</div>${o.bake !== 'normal' ? `<div class="bk ${o.bake}">${o.bake === 'well' ? 'WELL DONE' : 'LIGHT BAKE'}</div>` : ''}<div class="pt"><i></i></div></div>`).join('') || '';
  }
  for (const el of hud.rail.children) {
    const o = G.orders.find(x => x.no === +el.dataset.no); if (!o) continue;
    const f = clamp(1 - (G.time - o.t0) / o.patience, 0, 1);
    const bar = el.querySelector('.pt i'); bar.style.width = `${f * 100}%`; bar.className = f < 0.25 ? 'red' : f < 0.5 ? 'amb' : '';
    if (focus) { const have = focus.types(); for (const i of el.querySelectorAll('.tops i')) i.classList.toggle('ok', have.has(i.dataset.t)); }
    else for (const i of el.querySelectorAll('.tops i')) i.classList.remove('ok');
  }
  const unhung = tickets.filter(t => !t.order.done && (t.state === 'free' || t.state === 'printing')).length;
  $('newtix').textContent = unhung ? `🧾 ${unhung} ticket${unhung > 1 ? 's' : ''} at the printer` : '';
  // oven tags
  K.ovens.forEach((o, i) => {
    const el = tagEls[i];
    if (o.locked) { el.style.display = 'none'; return; }
    project(_v.set(o.x - 0.2, L.MOUTH_TOP + 0.17, L.OVEN_FACE + 0.06), scr);
    const vis = scr.z < 1 && scr.x > -60 && scr.x < innerWidth + 60;
    el.style.display = vis ? '' : 'none'; if (!vis) return;
    el.style.transform = `translate(${scr.x}px, ${scr.y}px) translate(-50%,-50%)`;
    const p = pies.find(q => q.support?.kind === 'surface' && q.support.s?.kind === 'deck' && q.support.s.id === i);
    const fg = el.querySelector('.fg'), b = el.querySelector('b'), sp = el.querySelector('span');
    const temp = Math.round(300 + o.temp * 350);
    if (p) {
      const f = clamp(p.bake / 1.5, 0, 1);
      fg.style.strokeDasharray = `${f * 94.2} 94.2`;
      const dn = p.doneness;
      fg.style.stroke = { raw: '#9fb7d8', pale: '#e8c06a', perfect: '#52c46a', dark: '#e0802a', burnt: '#e0452b' }[dn];
      b.textContent = { raw: 'RAW', pale: 'PALE', perfect: 'DONE', dark: 'DARK', burnt: 'BURNT' }[dn];
      el.classList.toggle('hot', dn === 'perfect'); el.classList.toggle('burn', dn === 'burnt' || dn === 'dark');
    } else { fg.style.strokeDasharray = '0 94.2'; b.textContent = 'EMPTY'; el.classList.remove('hot', 'burn'); }
    sp.textContent = `${temp}°F${o.angle > 0.3 ? ' · door open' : ''}`;
    el.classList.toggle('cold', o.temp < 0.75);
  });
  // speech bubbles over the waiters
  waiters.forEach((w, i) => {
    const el = bubbleEls[i];
    if (w.sayT <= 0 || w.z < -2.2) { el.style.opacity = 0; return; }
    project(w.headWorld(_v), scr);
    el.textContent = `${w.look.name}: ${w.say}`;
    el.style.opacity = Math.min(1, w.sayT * 2);
    el.style.transform = `translate(${scr.x}px, ${scr.y - 18}px) translate(-50%,-100%)`;
  });
  // what's in your hand
  hud.held.innerHTML = heldText();
  hud.coach.textContent = G.coach ? coachText() : '';
  hud.coach.style.opacity = hud.coach.textContent ? 1 : 0;
  [...hud.stations.children].forEach((b, i) => b.classList.toggle('on', Math.abs(G.camX - L.stations[i].x) < 0.9));
}
function heldText() {
  const h = H.held, act = [];
  let name = '';
  if (H.door?.type === 'box') { name = 'Box lid'; act.push('pull toward you to shut it', 'push away to open'); }
  else if (H.door) { name = H.door.type === 'cooler' ? 'Cooler door' : `Oven ${H.door.o.i + 1} door`; act.push('move to swing it', 'let go of <kbd>LMB</kbd>'); }
  else if (H.handful) { name = `Handful of ${TOPPINGS[H.handful.id].name.toLowerCase()}`; act.push('<kbd>RMB</kbd> sprinkle', 'let go: drop it all'); }
  else if (h instanceof Pie) { name = h.flat > 0.5 ? `Dough · ${h.sizeIn.toFixed(1)}" · ${Math.round(h.roundness * 100)}% round` : 'Dough ball'; act.push(h.flat > 0.6 ? 'hold <kbd>Space</kbd>, circle the mouse, flick up + let go to toss' : 'drop it on the wood peel or bench'); }
  else if (h?.kind === 'peel') { name = h.metal ? 'Metal peel' : 'Wood peel'; if (h.pie) name += ' + pie'; act.push(h.pie ? (h.metal ? 'hold it over an open box on the pass' : 'yank back fast to slide it off') : 'push the blade under a pie'); }
  else if (h?.kind === 'ladle') { name = `Ladle · ${Math.round(h.amount * 100)}% sauce`; act.push('<kbd>RMB</kbd> down on dough and swirl', 'dip in the sauce bin to refill'); }
  else if (h?.kind === 'tub') { name = `Tub of ${TOPPINGS[h.top].name.toLowerCase()}`; act.push('let go over its bin to restock'); }
  else if (h?.kind === 'tray') { name = `Dough tray · ${h.count} balls`; act.push('set it down on the bench'); }
  else if (h?.kind === 'ticket') { name = `Ticket #${h.order.no}`; act.push('let go at the rail behind the bench'); }
  else {
    const u = H.under;
    if (u.kind === 'pie' && u.thing?.canStretch) { const p = u.thing; return `<b>Dough · ${p.sizeIn.toFixed(1)}" · ${Math.round(p.roundness * 100)}% round</b><span><kbd>RMB</kbd> pound · hold <kbd>RMB</kbd> + circle to spin it round · <kbd>LMB</kbd> pick up</span>`; }
    return '';
  }
  return `<b>${name}</b><span>${act.join(' · ')}</span>`;
}
function coachText() {
  if (G.mode !== 'play') return '';
  const open = openOrders();
  const unhung = tickets.find(t => !t.order.done && t.state === 'free');
  if (H.door?.type === 'oven') return 'Pull toward you to open, push away to close. Let go to drop it.';
  const ovenOpen = K.ovens.find(o => !o.locked && o.openFor > 5);
  if (ovenOpen && !(H.held?.kind === 'peel')) return `Shut oven ${ovenOpen.i + 1}: grab the handle and push it closed. Open doors lose heat.`;
  if (G.coolerOpenT > 8 && !H.held) return 'Close the cooler: grab a door handle and push it shut.';
  const baked = pies.find(p => p.support?.s?.kind === 'deck' && p.bake > 0.88);
  if (baked && !(H.held === metalPeel)) return baked.bake > 1.2 ? 'PULL IT NOW: metal peel (right of the ovens), open the door, slide it under, pull it out.' : 'Pizza\'s done: grab the metal peel by the ovens, open the door, slide the blade flat under the pie and pull it out.';
  if (H.held === metalPeel && metalPeel.pie) return G.camX > 4.2 ? 'Hold the pie over an open box: it slides right in.' : 'Carry it to the pass (D or 5). It won\'t slide off on the way.';
  const inBox = boxes.find(b => b.pie && !b.carried && !b.closed);
  if (inBox && !H.held) return 'Close the box: grab it (LMB) and the lid flips shut. Then ring the bell.';
  const boxed = boxes.find(b => b.pie && !b.carried && b.closed && openOrders().length);
  if (boxed && !H.held && boxed.pie.passT < 0.6) return 'Ring the bell (right end of the pass) and a server takes it.';
  if (pies.some(p => p.bareSaid && p.support?.kind === 'surface' && p.pos.x > L.pass.x0)) return 'That pie is sitting on the bare pass. Scoop it with the metal peel and lower it into a box.';
  if (unhung) return 'A ticket printed. Hold LMB on it, carry it up to the rail behind the bench, let go.';
  if (!open.length) return G.lastCall ? 'Closing up...' : 'Quiet. Next ticket soon.';
  if (H.held instanceof Pie) return H.held.flat > 0.5 ? 'Put it on the wood peel at the make table (3). Or hold Space, circle the mouse, flick up and let go to toss it bigger.' : 'Drop the ball on the wood peel at the make table (3), or on the bench.';
  if (H.held?.kind === 'tray') return 'Set the tray down on the bench.';
  if (H.held?.kind === 'tub') return 'Let go of the tub over its bin on the cart.';
  const wp = woodPeel.pie;
  const work = wp || pies.find(p => p.support?.kind === 'surface' && p.support.s?.kind !== 'deck' && !p.refused && !p.ruined && p.bake < 0.3 && p.pos.y > 0.5);
  if (!work) {
    if (benchTray.count === 0 && !pies.some(p => p.support?.kind === 'held')) return 'Out of dough. The cooler is far left (1): grab a door handle, pull it open, take a ball (or the whole tray).';
    return 'Grab a dough ball from the tray on the bench (2), put it on the wood peel at the make table (3).';
  }
  if (work.ruined) return 'That one is ruined. Drop it in the TRASH hole on the make table.';
  const need = open.find(o => o.hung) || open[0];
  if (work.canStretch && work.sizeIn < need.size.in - 1) return work.sizeIn < 9 ? `Pound it flat: tap RMB on the dough (${work.sizeIn.toFixed(1)}" now, ticket wants ${need.size.label}).` : `Spin it bigger: hold RMB on the dough and circle the mouse (${work.sizeIn.toFixed(1)}" of ${need.size.label}).`;
  const miss = need.tops.find(t => t === 'sauce' ? work.sauceCov() < 0.5 : t === 'cheese' ? work.cheeseCov() < 0.45 : work.pieceStats(t).n < (t === 'basil' ? 3 : 5));
  if (miss === 'sauce') return H.held === ladle ? 'Hold RMB with the ladle on the dough and swirl it out toward the edge.' : 'Sauce: grab the ladle in the sauce bin (front left of the cart).';
  if (miss) return H.handful ? 'Let go over the pie, or hold RMB to sprinkle it evenly.' : `${TOPPINGS[miss].name}: hold LMB over its bin on the cart to grab a handful.`;
  if (wp && !H.held) return 'Ready to bake. Grab the wood peel by its handle and walk it to the ovens (4).';
  if (H.held === woodPeel) { const o = K.ovens.find(x => !x.locked && x.angle > 1.05); return o ? 'Slide the peel into the oven over the deck, then yank it back fast so the pie stays.' : 'Open an oven first: let go of the peel on the counter, grab the door handle, pull it down.'; }
  if (!wp) return 'Scoop it onto the wood peel: grab the peel, push the blade flat under the pie.';
  return '';
}

// Popups --------------------------------------------------------------------------------------------
function popup(text, cls = '', sub = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls;
  el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  $('pops').prepend(el);
  while ($('pops').children.length > 4) $('pops').lastChild.remove();
  setTimeout(() => el.remove(), 2600);
}
function starPop(stars, money, notes) {
  const el = document.createElement('div'); el.className = 'pop great';
  const full = Math.floor(stars), half = stars - full >= 0.5;
  el.innerHTML = `<span class="st">${'★'.repeat(full)}${half ? '½' : ''}</span> ${money}<small>${notes}</small>`;
  $('pops').prepend(el); setTimeout(() => el.remove(), 3400);
}
let saveTimer = 0; function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }

// Days ---------------------------------------------------------------------------------------------
function resetLine() {
  for (const p of [...pies]) removePie(p);
  for (const t of tickets) { t.group.parent?.remove(t.group); }
  tickets.length = 0; railSlots.fill(null);
  for (const b of bits) scene.remove(b.mesh); bits.length = 0;
  for (const it of items) { it.held = false; it.goHome(); it.support = { kind: 'surface', top: it.home.y }; it.pie = null; if (it.slots) it.slots.fill(null); it.sync(); }
  ladle.amount = 0;
  const max = G.upgrades.bins ? 12 : BIN_SERVINGS;
  for (const b of K.bins) { b.max = max; b.servings = max; b.setFill(); }
  for (let i = 0; i < 3; i++) { const p = newBall(); benchTray.slots[i] = p; p.support = { kind: 'tray', tray: benchTray, slot: i }; }
  for (const d of K.doors) { d.angle = 0; d.vel = 0; d.pivot.rotation.y = 0; }
  for (const o of K.ovens) { o.angle = 0; o.vel = 0; o.temp = 1; o.pivot.rotation.x = 0; o.locked = o.i === 1 && !G.upgrades.oven2; if (o.tape) o.tape.visible = o.locked; }
  for (const w of waiters) { w.carry = null; w.sayT = 0; w.z = -2.6; }
  for (const b of boxes) { b.reset(); b.goHome(); b.support = { kind: 'surface' }; b.sync(); }
  for (const h of helpers) { h.task = null; h.idle = 3; }
  H.held = null; H.handful = null; H.door = null; buildHandful(null);
  H.cur.x = 0; H.cur.z = -0.05; H.lift = 0; H.height = 0;
}
function startDay() {
  resetLine();
  G.time = 0; G.nextOrder = 3; G.orders = []; G.lastCall = false; G.endT = 0; G.stats = freshStats();
  G.camX = L.stations[1].x; G.camV = 0; G.camGoal = null; G.coach = G.day <= 2 || G.coach;
  H.pos.set(G.camX, 1.1, 0); H.vel.set(0, 0, 0);
  setMode('play'); lock();
}
function endDay() {
  if (G.mode !== 'play') return;
  const s = G.stats, wages = HIRES.filter(h => G.hires[h.id]).reduce((a, h) => a + h.wage, 0);
  G.cash -= wages;
  const avg = s.stars.length ? s.stars.reduce((a, b) => a + b, 0) / s.stars.length : 0;
  $('dayT').textContent = `Day ${G.day} is done.`;
  $('dayP').textContent = s.served === 0 ? 'Nobody ate tonight.' : avg >= 4.3 ? 'The dining room was humming. Somebody asked for the chef.' : avg >= 3.3 ? 'Solid night on the line.' : avg >= 2.3 ? 'You got through it.' : 'Rough night. The servers are talking about you.';
  $('dayS').innerHTML = [['served', s.served], ['avg', s.stars.length ? `${avg.toFixed(1)}★` : '–'], ['sales', `$${s.sales}`], ['tips', `$${s.tips}`], ['wages', `-$${wages}`], ['walkouts', s.walkouts]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  G.day++; G.best = Math.max(G.best, G.day - 1);
  save(); renderShop(); setMode('day');
}
function renderShop() {
  $('bank').textContent = `$${G.cash}`;
  const row = (id, name, sub, cost, owned, onBuy, note) => {
    const d = document.createElement('div'); d.className = 'buy' + (owned ? ' own' : '');
    d.innerHTML = `<div><b>${name}</b><small>${sub}</small></div>`;
    const b = document.createElement('button'); b.textContent = owned ? (note || 'Hired') : `$${cost}`;
    b.disabled = owned || G.cash < cost; b.onclick = () => { onBuy(); save(); renderShop(); sfx.cash(); };
    d.appendChild(b); return d;
  };
  const sh = $('shop'); sh.innerHTML = '';
  for (const h of HIRES) sh.appendChild(row(h.id, `${h.name}, ${h.role.toLowerCase()}`, `${h.desc} $${h.wage}/night.`, h.hire, !!G.hires[h.id], () => { G.cash -= h.hire; G.hires[h.id] = true; }, 'On staff'));
  for (const u of UPGRADES) sh.appendChild(row(u.id, u.name, u.desc, u.cost, !!G.upgrades[u.id], () => { G.cash -= u.cost; G.upgrades[u.id] = true; }, 'Done'));
  const adds = MENU.filter(m => m.day === G.day).map(m => m.name);
  $('nextP').textContent = `Day ${G.day}${adds.length ? ` adds ${adds.join(', ')} to the menu` : ''}.${G.day === 2 ? ' Tickets start asking for 10" and 12" too.' : ''}${G.day === 3 ? ' Some want it well done.' : ''}`;
}

function setMode(m) {
  G.mode = m;
  for (const id of ['title', 'paused', 'dayover']) $(id).hidden = true;
  if (m === 'title') $('title').hidden = false;
  if (m === 'paused') $('paused').hidden = false;
  if (m === 'day') $('dayover').hidden = false;
  document.body.classList.toggle('playing', m === 'play');
  if (m !== 'play') { sfx.set('roar', 0); sfx.set('swish', 0); sfx.set('squelch', 0); sfx.set('hum', 0); sfx.set('sizzle', 0); }
}
function titleScreen() {
  const s = load();
  $('cont').hidden = !s; if (s) $('cont').textContent = `Continue: Day ${s.day} · $${s.cash}`;
  setMode('title');
}
$('start').onclick = () => { sfx.init(); Object.assign(G, { day: 1, cash: 0, hires: {}, upgrades: {}, rating: [] }); G.coach = true; startDay(); };
$('cont').onclick = () => { sfx.init(); const s = load(); if (s) Object.assign(G, { day: s.day, cash: s.cash, hires: s.hires || {}, upgrades: s.upgrades || {}, best: s.best || 0 }); startDay(); };
$('paused').onclick = () => { sfx.init(); setMode('play'); lock(); };
$('nextDay').onclick = () => { sfx.init(); startDay(); };

// Main loop ---------------------------------------------------------------------------------------
function update(dt) {
  if (G.mode === 'play') {
    updateCamera(dt);
    updateHand(dt);
    updateActions(dt);
    updateDoors(dt);
    for (const it of items) updateItem(it, dt);
    for (const p of [...pies]) updatePie(p, dt);
    updateTickets(dt);
    updateBits(dt);
    updateCooler(dt);
    checkPass(dt);
    updateOrders(dt);
    updateBoxes(dt);
    runHelpers(dt);
    // loops
    const near = clamp(1 - Math.min(...K.ovens.filter(o => !o.locked).map(o => Math.abs(o.x - G.camX))) / 3, 0, 1);
    const openMax = Math.max(...K.ovens.filter(o => !o.locked).map(o => Math.sin(o.angle)));
    sfx.set('roar', (0.04 + openMax * 0.2) * near, 200 + openMax * 400);
    sfx.set('sizzle', pies.some(p => p.support?.s?.kind === 'deck') ? 0.02 + openMax * 0.06 * near : 0);
    sfx.tick();
  } else if (G.mode === 'title' || G.mode === 'day') {
    // idle: let the camera drift along the line behind the title card
    G.camX = Math.sin(performance.now() / 9000) * 3.2 - 0.4;
    camera.position.set(G.camX, 1.85, 1.35); camera.lookAt(G.camX * 1.02, 0.95, -0.4);
    runIdle(dt);
  }
  for (const p of pies) p.sync();
  K.bell.ring = Math.max(0, K.bell.ring - dt * 3); K.bell.dome.scale.setScalar(1 + Math.sin(K.bell.ring * 30) * 0.03 * K.bell.ring);
  K.update(dt, G.camX, performance.now() / 1000);
  FX.update(dt);
  for (const w of waiters) if (G.mode !== 'play') w.update(dt, 1, false);
}
// title-screen life: the hand floats over the line
function runIdle() { hand.setVisible(G.mode === 'play'); }

let last = performance.now(), frozen = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  resize();
  if (!frozen) update(dt);
  if (G.mode === 'play') { hand.setVisible(true); updateHud(); }
  renderer.render(scene, camera);
}

resetLine();
for (const it of items) it.sync();
hand.setVisible(false);
titleScreen();
// a pie on the peel and one baking, so the title view has something to look at
{
  const p = newBall(); p.makeRound(14); p.pos.set(L.peelHome.x, woodPeel.topY(), L.peelHome.z); attachToPeel(p, woodPeel);
  for (let i = 0; i < 9; i++) p.addSauce(Math.cos(i) * 0.06 * (i % 3), Math.sin(i) * 0.06 * (i % 3), 0.8);
  for (let i = 0; i < 6; i++) p.addCheese(rand(-0.1, 0.1), rand(-0.1, 0.1), 0.05);
  for (let i = 0; i < 8; i++) p.addPiece('pepperoni', rand(-0.12, 0.12), rand(-0.12, 0.12));
  p.support.ox = 0; p.support.oz = 0;
  const q = newBall(); q.makeRound(14); q.pos.set(L.OVEN_X[0], L.DECK, -0.85); q.support = { kind: 'surface', top: L.DECK, s: K.surfaces.find(s => s.kind === 'deck' && s.id === 0) };
  for (let i = 0; i < 9; i++) q.addSauce(Math.cos(i * 2) * 0.07 * (i % 3), Math.sin(i * 2) * 0.07 * (i % 3), 0.8);
  for (let i = 0; i < 7; i++) q.addCheese(rand(-0.1, 0.1), rand(-0.1, 0.1), 0.05);
  q.bake = 0.95; q.dirty = true; q.layShreds();
  K.ovens[0].angle = 1.5; K.ovens[0].pivot.rotation.x = 1.5;
  for (const p of pies) { if (p.support?.kind === 'peel') p.pos.set(woodPeel.pos.x, woodPeel.topY(), woodPeel.pos.z); p.sync(); }
}
requestAnimationFrame(frame);

// Test hooks (local only) ----------------------------------------------------------------------------
if (LOCAL) {
  window.__po = {
    G, H, K, L, pies, tickets, items, boxes, woodPeel, metalPeel, ladle, tubs, trays, waiters, helpers, input, keys, scene, camera, renderer, railSlots,
    startDay, endDay, spawnOrder, setMode, judge,
    freeze(v = true) { frozen = v; },
    // put the hand target at world (x, z) relative to the current camera
    aim(x, z) { H.cur.x = x - G.camX; H.cur.z = z; },
    btn(l, r) { setButtons(l, r); },
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); },
    run(n = 1, dt = 1 / 60, each) { for (let i = 0; i < n; i++) { if (each) each(i); update(dt); } updateHud(); renderer.render(scene, camera); },
    goto(i) { G.camX = L.stations[i].x; G.camGoal = null; G.camV = 0; },
  };
}
