// The theatre sim: days, showtimes, customers and their queues, staff, stock and deliveries, money, story.
import * as THREE from 'three';
import { W, L, P, clone, setAudUnlocked, nearestNode, applyLabel, cartonLabel, candyLabel, printLabel, floorAt, supportAt, moveCircle, addCollider } from './world.js';
import { makePerson, placePerson, walkTo, walkPoints, updatePerson, say } from './people.js';
import { G, film, runtime, showDemand, SEATS, CASE_CAP, POP_CAP, SODA_CAP, UNIT_COST, REF_PRICE, ROLES, rentPerDay, saveGame, rollCatalog, money, CANDY, SUPPLY, STAFF_NAMES, REEL_SECS } from './state.js';
import * as booth from './booth.js';

export const BAG_CAP = 24;
const CANDY_COL = ['#b01818', '#1a56b0', '#c8900f', '#18802f', '#701c80', '#e0661a'];
export const S = {
  customers: [], boxQ: [], conQ: [], staff: [], trash: [], backObjs: [], hits: [], marla: null, chesler: null,
  ui: null,          // set by main: { toast, openPOS, dialog, summary, chooseFilm, choosePoster, openSplice, hint }
  today: null,
};
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const timers = [];
export function later(secs, fn) { timers.push({ t: secs, fn }); }
function runTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { const tm = timers[i]; tm.t -= dt; if (tm.t <= 0) { timers.splice(i, 1); tm.fn(); } } }

// ------------------------------------------------------------------ interactables
export function addHit(x, y, z, w, h, d, def) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), HIT_MAT);
  m.position.set(x, y, z);
  W.scene.add(m);
  def.obj = m; m.userData.inter = def;
  W.interact.push(def);
  return def;
}
export function removeHit(def) { W.scene.remove(def.obj); const i = W.interact.indexOf(def); if (i >= 0) W.interact.splice(i, 1); }
function tagObject(obj, def) { def.obj = obj; obj.traverse(c => { c.userData.inter = def; }); W.interact.push(def); return def; }

// ------------------------------------------------------------------ setup
export function initSim() {
  for (const s of G.screens) setAudUnlocked(s.id, s.open);
  for (const s of G.screens) booth.layoutScreen(s.id);
  // front doors: open the theatre / doors already open
  addHit(0, 1.3, 12, 3.2, 2.6, 0.5, {
    label: () => {
      if (G.phase === 'open') return 'Doors are open';
      if (G.phase === 'closing') return 'Wait for the last show to let out';
      const ready = G.screens.filter(s => s.open && s.film && printReady(s));
      if (!ready.length) return 'Can’t open: no screen has a print ready';
      return `Open the doors — start Day ${G.day}`;
    },
    act: () => { if (G.phase === 'closed' && G.screens.some(s => s.open && s.film && printReady(s))) openDay(); },
  });
  const bc = L.boxCounter, cc = L.conCounter;
  addHit(-4.3, 1.3, bc.z0 + 0.3, 0.7, 0.5, 0.7, {
    label: () => { const c = S.boxQ[0]; if (hasStaff('cashier')) return `${staffName('cashier')} is on the box office`; return c && c.atFront ? 'Sell tickets' : 'Box office register (no one waiting)'; },
    act: () => { const c = S.boxQ[0]; if (c && c.atFront && !hasStaff('cashier')) S.ui.openPOS('box', c); },
  });
  addHit(4.0, 1.25, cc.z0 + 0.3, 0.7, 0.5, 0.7, {
    label: () => { const c = S.conQ[0]; if (hasStaff('concession')) return `${staffName('concession')} is on the counter`; return c && c.atFront ? 'Serve concessions' : 'Concessions register (no one waiting)'; },
    act: () => { const c = S.conQ[0]; if (c && c.atFront && !hasStaff('concession')) S.ui.openPOS('con', c); },
  });
  P.candySlots.forEach((slot, i) => {
    addHit(slot.x, 0.86, slot.z, 0.7, 0.36, 0.55, {
      label: () => {
        const n = G.stock.candy[i];
        const c = G.carry;
        if (c && c.kind === 'candy' && c.i === i) return n >= CASE_CAP ? `${CANDY[i].name} is full` : `Stock ${CANDY[i].name} (${n}/${CASE_CAP})`;
        if (c && c.kind === 'candy') return `That slot is for ${CANDY[i].name}`;
        return `${CANDY[i].name}: ${n}/${CASE_CAP}${n === 0 ? ' — SOLD OUT' : ''}`;
      },
      act: () => { const c = G.carry; if (c && c.kind === 'candy' && c.i === i) { const m = Math.min(CASE_CAP - G.stock.candy[i], c.n); G.stock.candy[i] += m; c.n -= m; refreshCandy(); S.ui.tutDone('restock'); if (c.n <= 0) dropCarry(true); S.ui.sfx('stock'); } },
    });
    slot.items = [];
  });
  addHit(6.6, 1.5, 0.95, 0.9, 1.1, 0.7, {
    label: () => G.carry?.kind === 'kernels' ? `Pour kernels into the popper (${Math.round(G.stock.popcorn)}/${POP_CAP})` : `Popcorn: ${Math.round(G.stock.popcorn)}/${POP_CAP} portions`,
    act: () => { const c = G.carry; if (c?.kind === 'kernels') { const m = Math.min(POP_CAP - G.stock.popcorn, c.n); G.stock.popcorn += m; c.n -= m; if (c.n <= 0) dropCarry(true); S.ui.sfx('pop'); } },
  });
  addHit(3.7, 1.25, 1.0, 0.8, 0.7, 0.6, {
    label: () => G.carry?.kind === 'syrup' ? `Hook up the syrup box (${Math.round(G.stock.soda)}/${SODA_CAP})` : `Soda: ${Math.round(G.stock.soda)}/${SODA_CAP} portions`,
    act: () => { const c = G.carry; if (c?.kind === 'syrup') { const m = Math.min(SODA_CAP - G.stock.soda, c.n); G.stock.soda += m; c.n -= m; if (c.n <= 0) dropCarry(true); S.ui.sfx('stock'); } },
  });
  addHit(L.computer.x, 1.0, L.computer.z, 0.8, 0.6, 1.6, { label: () => 'Use the admin computer', act: () => S.ui.openComputer() });
  addHit(L.bench.x, L.booth.y + 1.0, L.bench.z, 0.7, 0.6, 1.4, {
    label: () => {
      const c = G.carry;
      if (c?.kind === 'print') return `Make up the print: ${film(c.film).title} (${film(c.film).reels - 1} splices)`;
      if (c?.kind === 'drive') return 'DCP drives go to the server, not the splicer';
      const torn = Object.entries(G.prints).find(([, p]) => p.state === 'cans');
      return torn ? 'Splicing bench — bring the print case up from the stockroom' : 'Splicing bench';
    },
    act: () => { const c = G.carry; if (c?.kind === 'print') S.ui.openSplice(c.film); },
  });
  // poster frames by each auditorium door
  for (const a of L.auds) {
    const s = G.screens.find(s => s.id === a.id);
    addHit(a.cx + L.aud.poster.dx, L.aud.poster.y, L.hall.z0 + 0.2, 1.1, 1.6, 0.3, {
      label: () => s.open ? (s.poster ? `Poster: ${film(s.poster).title}${s.poster !== s.film ? ' (WRONG FILM!)' : ''} — swap it` : 'Hang a poster') : null,
      act: () => s.open && S.ui.choosePoster(s.id),
    });
  }
  // projectors (reach target boxes over each machine slot)
  for (const a of L.auds) {
    for (const [id, dx] of [['A', L.aud.ports[0]], ['B', L.aud.ports[1]]]) {
      addHit(a.cx + dx + (id === 'B' ? 0.0 : 0), L.booth.y + 1.2, -2.0, 0.8, 1.6, 1.6, {
        label: () => {
          const s = G.screens.find(s => s.id === a.id);
          if (!s.open) return null;
          if (id === 'B' && s.tier !== 'reel') { if (s.tier === 'digital') return 'TMS server'; return 'Platter'; }
          if (!s.film && id === 'A') return `Screen ${a.id}: load a print`;
          const r = booth.projectorAction(a.id, id);
          return r ? `Screen ${a.id} ${s.tier === 'reel' ? 'projector ' + id : ''}: ${r.label}` : null;
        },
        hold: () => booth.projectorAction(a.id, id)?.hold || 0,
        act: () => {
          const s = G.screens.find(s => s.id === a.id);
          if (!s.open) return;
          if (!s.film && id === 'A') return S.ui.chooseFilm(a.id);
          if (id === 'B' && s.tier !== 'reel') { const r = booth.projectorAction(a.id, 'A'); r?.act?.(); return; }
          const r = booth.projectorAction(a.id, id);
          r?.act?.();
        },
        booth: a.id,
      });
    }
  }
  for (const it of G.back) spawnBack(it);
  if (G.carry) attachCarry();
  for (const s of G.screens) { const n = s.trash || 0; s.trash = 0; if (s.open) for (let i = 0; i < n; i++) spawnTrash(s.id); }
  for (const b of P.bins) addHit(b.x, 0.5, b.z, 0.62, 1.0, 0.62, { label: () => (G.bag ? `Empty the trash bag (${G.bag})` : null), act: () => emptyBag() });
  refreshCandy();
  refreshShelf();
  for (const st of G.staff) spawnStaff(st);
  booth.hooks.onShowStart = onShowStart;
  booth.hooks.onShowEnd = onShowEnd;
  booth.hooks.onFlub = onFlub;
  booth.hooks.onBreak = k => { S.ui.toast(`FILM BREAK on screen ${k}! Get to the booth.`, 'bad'); S.ui.sfx('break'); audienceReact(k, '😠', 'Boooo!'); };
  booth.hooks.openRepair = (k, f, done) => S.ui.openSplice(f.id, 'repair', done);
  booth.hooks.toast = m => S.ui.toast(m);
  booth.hooks.onAction = key => S.ui.tutDone(key);
  booth.hooks.onCue = k => S.ui.UI.onCue?.(k);
  if (G.flags.omniPending && !G.flags.omni) spawnChesler();
}

export function printReady(s) {
  const pr = G.prints[s.film];
  if (!pr) return false;
  if (s.tier === 'digital') return pr.state === 'ingested' || pr.state === 'drive' || pr.state === 'ingesting';
  return pr.state === 'built';
}

// ------------------------------------------------------------------ made-up prints on the booth shelf
const shelfObjs = [];
export function refreshShelf() {
  while (shelfObjs.length) W.scene.remove(shelfObjs.pop());
  const built = Object.entries(G.prints).filter(([, p]) => p.state === 'built');
  built.slice(0, P.shelfSpots.length).forEach(([id], i) => {
    const o = applyLabel(clone('filmcans'), printLabel(film(id).title, 'MADE UP \u00b7 READY'));
    o.position.copy(P.shelfSpots[i]); o.rotation.y = i * 0.7;
    W.scene.add(o); shelfObjs.push(o);
  });
}

// ------------------------------------------------------------------ candy case visuals
function refreshCandy() {
  P.candySlots.forEach((slot, i) => {
    const want = Math.min(G.stock.candy[i], CASE_CAP);
    while (slot.items.length > want) W.scene.remove(slot.items.pop());
    while (slot.items.length < want) {
      const j = slot.items.length;
      const o = applyLabel(clone('candy_' + i), candyLabel(i, CANDY[i].name, CANDY[i].icon, CANDY_COL[i]));
      const row = j % 2, col = Math.floor(j / 2);
      o.position.set(slot.x - 0.27 + col * 0.11, row ? 0.47 : 0.74, slot.z + (row ? 0.05 : -0.05));
      o.rotation.y = (j % 3 - 1) * 0.08;
      W.scene.add(o); slot.items.push(o);
    }
  });
  if (P.popcornFill) P.popcornFill.scale.y = Math.max(0.02, G.stock.popcorn / POP_CAP);
}

// ------------------------------------------------------------------ backstock (cartons on the pallet)
const backName = it => it.kind === 'candy' ? `Candy carton: ${CANDY[it.i].name} (${it.n})` : it.kind === 'kernels' ? `Popcorn kernels (${it.n})` : it.kind === 'syrup' ? `Soda syrup (${it.n})` : it.kind === 'print' ? `35mm print case: ${film(it.film).title}` : `DCP drive: ${film(it.film).title}`;
function backModel(it) { return it.kind === 'print' ? 'filmcase' : it.kind === 'drive' ? 'hdd' : 'carton'; }
export function dressItem(o, it) {
  if (it.kind === 'candy') applyLabel(o, cartonLabel(CANDY[it.i].name, `${it.n} BOXES \u00b7 KEEP COOL`, CANDY_COL[it.i], CANDY[it.i].icon));
  else if (it.kind === 'kernels') applyLabel(o, cartonLabel('Popcorn kernels', `${it.n} PORTIONS \u00b7 BUTTER NOT INCL.`, '#d08a08', '\ud83c\udf7f'));
  else if (it.kind === 'syrup') applyLabel(o, cartonLabel('Cola syrup', `BAG-IN-BOX \u00b7 ${it.n} PORTIONS`, '#9a1410', '\ud83e\udd64'));
  else if (it.kind === 'print') applyLabel(o, printLabel(film(it.film).title, `35MM \u00b7 ${film(it.film).reels} REELS`));
  else if (it.kind === 'drive') applyLabel(o, printLabel(film(it.film).title, 'DCP \u00b7 ENCRYPTED'));
  return o;
}
// an invisible, slightly fatter box so small things are easy to look at
export function addHitBox(o, pad = 0.06) {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o), s = new THREE.Vector3(), c = new THREE.Vector3();
  b.getSize(s); b.getCenter(c);
  const h = new THREE.Mesh(new THREE.BoxGeometry(s.x + pad, s.y + pad, s.z + pad), HIT_MAT);
  h.position.copy(c);
  W.scene.add(h); o.attach(h);
  return o;
}
function spawnBack(it) {
  const o = dressItem(clone(backModel(it)), it);
  if (it.pos) { o.position.set(it.pos[0], it.pos[1], it.pos[2]); o.rotation.y = it.pos[3]; }
  else {
    const idx = G.back.filter(b => !b.pos).indexOf(it);
    const slot = idx % 6, lvl = Math.floor(idx / 6);
    const x = L.pallet.x - 0.35 + (slot % 3) * 0.36, z = L.pallet.z - 0.22 + Math.floor(slot / 3) * 0.44;
    o.position.set(x, 0.15 + lvl * 0.4, z);
    o.rotation.y = (slot * 0.37) % 0.4 - 0.2;
  }
  W.scene.add(o);
  addHitBox(o);
  const def = tagObject(o, { label: () => G.carry ? 'Hands full (G to drop)' : `Pick up ${backName(it)}`, act: () => pickUp(it) });
  it._obj = o; it._def = def;
}
function despawnBack(it) { if (it._obj) { W.scene.remove(it._obj); const i = W.interact.indexOf(it._def); if (i >= 0) W.interact.splice(i, 1); it._obj = null; } }
function relayoutBack() { for (const it of G.back) despawnBack(it); for (const it of G.back) spawnBack(it); }
function pickUp(it) {
  if (G.carry) return;
  despawnBack(it);
  G.back.splice(G.back.indexOf(it), 1);
  const wasPallet = !it.pos;
  delete it.pos;
  G.carry = it;
  if (wasPallet) relayoutBack();
  attachCarry();
  S.ui.sfx('pickup');
}
export function attachCarry() { S.ui.setCarry(G.carry ? dressItem(clone(backModel(G.carry)), G.carry) : null, G.carry ? backName(G.carry) : ''); }
export function dropCarry(consumed = false) {
  if (!G.carry) return;
  if (!consumed) { if (S.throwFrom) { const [pos, dir] = S.throwFrom(); throwCarry(pos, dir); return; } G.back.push(G.carry); spawnBack(G.carry); }
  G.carry = null;
  attachCarry();
}
export function carryLabel() { return G.carry ? backName(G.carry) : ''; }

// G throws whatever you're holding: it arcs out in front of you, bounces, and stays where it lands.
const flying = [];
export function throwCarry(pos, dir) {
  if (!G.carry) return;
  const it = G.carry; G.carry = null; attachCarry();
  const o = dressItem(clone(backModel(it)), it);
  o.position.copy(pos);
  W.scene.add(o);
  const flat = dir.clone().setY(0).normalize();
  flying.push({ it, o, v: flat.multiplyScalar(3.4).add(new THREE.Vector3(0, 1.5 + dir.y * 3, 0)),
    spin: new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 7), t: 0, bounces: 0 });
  S.ui.sfx('whoosh');
}
function updateFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i], p = f.o.position;
    f.t += dt;
    if (f.resting) {
      f.o.rotation.x *= 0.7; f.o.rotation.z *= 0.7;
      if (Math.abs(f.o.rotation.x) + Math.abs(f.o.rotation.z) < 0.01) settleFlying(f, i);
      continue;
    }
    f.v.y -= 9.8 * dt;
    const tx = p.x + f.v.x * dt, tz = p.z + f.v.z * dt;
    const [nx, nz] = moveCircle(p.x, p.z, f.v.x * dt, f.v.z * dt, 0.18, p.y - 0.4, 0.75);
    if (Math.abs(nx - tx) > 1e-3) f.v.x *= -0.35;
    if (Math.abs(nz - tz) > 1e-3) f.v.z *= -0.35;
    p.x = nx; p.z = nz; p.y += f.v.y * dt;
    f.o.rotation.x += f.spin.x * dt; f.o.rotation.y += f.spin.y * dt; f.o.rotation.z += f.spin.z * dt;
    const fy = supportAt(p.x, p.z, p.y + 0.25);
    if (p.y <= fy) {
      p.y = fy;
      if (Math.abs(f.v.y) > 1.3 && f.bounces < 3) { f.bounces++; f.v.y = -f.v.y * 0.3; f.v.x *= 0.5; f.v.z *= 0.5; f.spin.multiplyScalar(0.45); S.ui.sfx('thud'); }
      else {
        // land: snap the tumble flat (to the nearest quarter turn so it sits on a face)
        f.resting = true; f.v.set(0, 0, 0);
        f.o.rotation.x = Math.atan2(Math.sin(f.o.rotation.x), Math.cos(f.o.rotation.x)) * 0.3;
        f.o.rotation.z = Math.atan2(Math.sin(f.o.rotation.z), Math.cos(f.o.rotation.z)) * 0.3;
        S.ui.sfx('thud');
      }
    } else if (f.t > 6) settleFlying(f, i);
  }
}
function settleFlying(f, i) {
  W.scene.remove(f.o);
  flying.splice(i, 1);
  const p = f.o.position;
  f.it.pos = [p.x, supportAt(p.x, p.z, p.y + 0.25), p.z, f.o.rotation.y];
  G.back.push(f.it);
  spawnBack(f.it);
}

// print made up on the bench (called by the splice minigame wrapper)
export function finishBuildUp(filmId, res) {
  const pr = G.prints[filmId];
  if (!pr || !res || res.aborted) return;
  pr.state = 'built';
  pr.quality = Math.max(0.2, res.quality ?? 0.8);
  if (res.mischief) { pr.mischief.push(res.mischief); G.cult += 3; if (G.act >= 4) addMayhem(12, 'a single frame of something nobody asked for'); }
  if (G.carry?.kind === 'print' && G.carry.film === filmId) dropCarry(true);
  refreshShelf();
  S.ui.toast(`${film(filmId).title} is made up and on the booth shelf. Load it on a projector.`, 'good');
}

// ------------------------------------------------------------------ staff
function hasStaff(role) { return S.staff.some(s => s.role === role && s.ready); }
function staffName(role) { return S.staff.find(s => s.role === role)?.name || ''; }
export function hire(role) {
  const used = new Set(G.staff.map(s => s.name));
  const name = STAFF_NAMES.find(n => !used.has(n)) || 'Space Monkey #' + (G.staff.length + 1);
  const st = { id: Date.now() % 1e9 + Math.floor(Math.random() * 1000), role, name, seed: Math.floor(Math.random() * 1e9) };
  G.staff.push(st);
  spawnStaff(st);
  return st;
}
export function fire(id) {
  const i = G.staff.findIndex(s => s.id === id);
  if (i < 0) return;
  const st = G.staff[i];
  G.staff.splice(i, 1);
  const k = S.staff.findIndex(s => s.id === id);
  if (k >= 0) { W.scene.remove(S.staff[k].p.root); S.staff.splice(k, 1); }
  if (st.name === 'Bob Paulson') S.ui.toast('His name was Bob Paulson.', 'info');
}
const STATION = { cashier: 'box_staff', concession: 'con_staff', stocker: 'stock_mid', usher: 'lobby_back', projectionist: 'booth_mid' };
function spawnStaff(st) {
  const p = makePerson(G.flags.monkeys ? 'monkey' : (G.flags.omni ? 'omni' : 'staff'), st.seed);
  W.scene.add(p.root);
  const n = W.nav[STATION[st.role]];
  placePerson(p, n.x + (Math.random() - 0.5) * 0.3, n.z, 0);
  if (st.role === 'projectionist') { p.y = L.booth.y; }
  const s = { ...st, p, task: null, timer: 0, ready: true, node: STATION[st.role] };
  S.staff.push(s);
}
export function restyleStaff() {
  for (const s of S.staff) { W.scene.remove(s.p.root); }
  const keep = S.staff.map(s => ({ id: s.id, role: s.role, name: s.name, seed: s.seed }));
  S.staff.length = 0;
  for (const st of keep) spawnStaff(st);
}
function staffGo(s, node, then) { walkTo(s.p, s.node, node); s.node = node; s.p.onArrive = () => { s.p.onArrive = null; then?.(); }; if (!s.p.moving) { s.p.onArrive = null; then?.(); } }

function updateStaff(dt) {
  for (const s of S.staff) {
    if (s.p.moving) continue;
    s.timer -= dt;
    if ((s.role === 'cashier' || s.role === 'concession') && s.node === STATION[s.role]) s.p.faceTarget = 0;
    if (s.role === 'cashier') {
      const c = S.boxQ[0];
      if (c && c.atFront) { if (s.serving !== c) { s.serving = c; s.timer = 1.4 + c.qty * 0.3; } else if (s.serving === c && s.timer <= 0) { s.serving = null; autoSellTicket(c); } }
    } else if (s.role === 'concession') {
      const c = S.conQ[0];
      if (c && c.atFront) { if (s.serving !== c) { s.serving = c; s.timer = 2.4; } else if (s.timer <= 0) { s.serving = null; autoConcession(c); } }
    } else if (s.role === 'stocker') {
      if (s.task === 'carry') continue;
      if (s.timer > 0) continue;
      // anything low that a carton on the pallet can fix?
      const need = [];
      G.stock.candy.forEach((n, i) => { if (n <= CASE_CAP / 3) need.push(it => it.kind === 'candy' && it.i === i); });
      if (G.stock.popcorn < POP_CAP * 0.3) need.push(it => it.kind === 'kernels');
      if (G.stock.soda < SODA_CAP * 0.3) need.push(it => it.kind === 'syrup');
      const it = need.map(fn => G.back.find(b => !b.pos && fn(b))).find(Boolean);
      if (!it) { s.timer = 2; continue; }
      s.task = 'carry';
      staffGo(s, 'pallet', () => {
        if (!G.back.includes(it)) { s.task = null; return; }
        despawnBack(it); G.back.splice(G.back.indexOf(it), 1); relayoutBack();
        s.p.carrying = clone('carton'); s.p.carrying.scale.setScalar(0.7); s.p.carrying.position.set(0, 0.32, -0.28); s.p.rig.add(s.p.carrying);
        staffGo(s, 'con_staff', () => {
          if (it.kind === 'candy') { const m = Math.min(CASE_CAP - G.stock.candy[it.i], it.n); G.stock.candy[it.i] += m; it.n -= m; }
          else if (it.kind === 'kernels') { const m = Math.min(POP_CAP - G.stock.popcorn, it.n); G.stock.popcorn += m; it.n -= m; }
          else if (it.kind === 'syrup') { const m = Math.min(SODA_CAP - G.stock.soda, it.n); G.stock.soda += m; it.n -= m; }
          refreshCandy();
          s.p.rig.remove(s.p.carrying); s.p.carrying = null;
          if (it.n > 0) { G.back.push(it); spawnBack(it); }
          s.task = null; s.timer = 1.5;
          staffGo(s, 'stock_mid');
        });
      });
    } else if (s.role === 'usher') {
      if (s.task || s.timer > 0) continue;
      const t = S.trash.find(t => !t.claimed && !booth.B[t.k].show?.started);
      if (!t) { if (s.node !== 'lobby_back') { s.task = 'home'; staffGo(s, 'lobby_back', () => { s.task = null; }); } else s.timer = 1; continue; }
      t.claimed = s; s.task = 'clean';
      staffGo(s, t.rowNode, () => {
        walkPoints(s.p, [[t.o.position.x, t.laneZ]]);
        s.p.onArrive = () => {
          s.p.onArrive = null; s.p.faceTarget = Math.PI;
          say(s.p, '\u{1f9f9}', 0.9);
          later(0.9, () => {
            removeTrash(t);
            const n = W.nav[t.rowNode];
            walkPoints(s.p, [[n.x, n.z]]);
            s.p.onArrive = () => { s.p.onArrive = null; s.node = t.rowNode; s.task = null; };
          });
        };
      });
    } else if (s.role === 'projectionist') {
      if (s.task) continue;
      projectionistThink(s);
    }
  }
}
// The hired projectionist walks to whichever screen needs a hand and pokes the right machine. Not perfect.
function projectionistThink(s) {
  let best = null, bestU = 0;
  for (const sc of G.screens) {
    if (!sc.open || sc.tier === 'digital' || !sc.film) continue;
    const b = booth.B[sc.id];
    for (const id of ['A', 'B']) {
      if (!b.P[id]) continue;
      const r = booth.projectorAction(sc.id, id, 'staff');
      if (!r?.act) continue;
      let u = 1;
      const L0 = r.label;
      if (/CHANGEOVER|Start motor/.test(L0)) {
        const sh = b.show; const left = REEL_SECS - sh.reelT;
        if (/Start motor/.test(L0) && left > 6.2) continue;
        if (/CHANGEOVER/.test(L0) && left > 1.2 + (s.seed % 7) / 10) continue;
        u = 10;
      } else if (/START THE SHOW/.test(L0)) u = 9;
      else if (/FILM BREAK/.test(L0)) u = 8;
      else if (/Thread|Lace/.test(L0)) u = 4;
      else if (/Rewind/.test(L0)) u = 3;
      if (u > bestU) { bestU = u; best = { sc, id, r }; }
    }
  }
  if (!best) return;
  const node = 'proj_' + best.sc.id;
  s.task = 'go';
  const doit = () => {
    const r = booth.projectorAction(best.sc.id, best.id, 'staff');
    if (r?.act) {
      const slow = (r.hold || 0) * 1.4;
      if (slow > 0) { s.timer = slow; later((slow * 1000) / 1000, () => { const r2 = booth.projectorAction(best.sc.id, best.id, 'staff'); r2?.act?.(); s.task = null; }); return; }
      // the human factor: now and then a late changeover
      if (/CHANGEOVER/.test(r.label) && Math.random() < 0.12) { later((1200) / 1000, () => { booth.projectorAction(best.sc.id, best.id, 'staff')?.act?.(); s.task = null; }); return; }
      r.act();
    }
    s.task = null;
  };
  if (s.node === node) doit(); else staffGo(s, node, doit);
}

// ------------------------------------------------------------------ day flow
export function openDay() {
  G.phase = 'open'; G.t = 0;
  S.today = { tickets: 0, gross: 0, net: 0, con: 0, conNet: 0, cust: 0, sats: [], flubs: 0, clean: 0, refunds: 0, shows: 0, hipRefused: 0, lost: 0 };
  const showsPerDay = G.day <= 2 ? 2 : 3;
  let order = 0;
  for (const s of G.screens) {
    s.shows = [];
    if (!s.open || !s.film || !printReady(s)) continue;
    const f = film(s.film);
    let t = 55 + order * 28;
    for (let i = 0; i < showsPerDay; i++) { s.shows.push({ t, state: 'pending', spawned: 0, demand: 0 }); t += runtime(f) + 70; }
    order++;
  }
  S.ui.toast(`Day ${G.day}: doors open.`, 'good');
  S.ui.tutDone('open');
  S.ui.sfx('bell');
  if (S.chesler) { W.scene.remove(S.chesler.root); S.chesler = null; }
}

function updateSchedule(dt) {
  for (const s of G.screens) {
    if (!s.open || !s.shows) continue;
    const b = booth.B[s.id];
    for (const sh of s.shows) {
      if (sh.state === 'pending' && G.t >= sh.t - 62) {
        sh.state = 'queued';
        sh.demand = showDemand(s, { jitter: 0.85 + Math.random() * 0.3 });
        sh.spawnTimes = Array.from({ length: sh.demand }, () => sh.t - 60 + Math.pow(Math.random(), 0.8) * 54).sort((a, b) => a - b);
        sh.bs = booth.queueShow(s.id, s.shows.indexOf(sh), sh.t);
        sh.audience = [];
      }
      if (sh.state === 'queued' && !sh.warned && G.t >= sh.t - 12 && s.tier !== 'digital' && !G.staff.some(x => x.role === 'projectionist')) { sh.warned = true; S.ui.toast(`Screen ${s.id} starts in 10 seconds.`, s.trash ? 'bad' : 'info'); S.ui.sfx('bell'); }
      if (sh.state === 'queued') {
        while (sh.spawnTimes.length && G.t >= sh.spawnTimes[0]) { sh.spawnTimes.shift(); spawnCustomer(s.id, sh); }
        const bs = sh.bs;
        if (bs.started) sh.state = 'running';
        else if (G.t > sh.t + 50 && !bs.started) { sh.state = 'cancelled'; booth.cancelShow(s.id, bs); cancelShow(s, sh); }
      }
    }
  }
  if (G.phase === 'open') {
    const allDone = G.screens.every(s => !s.shows || s.shows.every(sh => sh.state === 'done' || sh.state === 'cancelled'));
    if (allDone && S.customers.length === 0) closeDay();
  }
}

function cancelShow(s, sh) {
  S.ui.toast(`Screen ${s.id} never started. The audience wants its money back.`, 'bad');
  for (const c of S.customers.filter(c => c.k === s.id && c.show === sh)) {
    if (c.paid) { G.cash -= c.paid; S.today.refunds += c.paid; S.today.net -= c.paid; }
    c.sat = 0.05;
    say(c.p, '😡 Refund!', 3);
    leave(c);
  }
  G.rep = Math.max(0, G.rep - 0.4);
}

function closeDay() {
  G.phase = 'closed';
  const t = S.today;
  const wages = G.staff.reduce((a, s) => a + ROLES[s.role].wage, 0);
  const nOpen = G.screens.filter(s => s.open).length;
  const rent = rentPerDay(nOpen);
  G.cash -= wages + rent;
  const avg = t.sats.length ? t.sats.reduce((a, b) => a + b, 0) / t.sats.length : 0.5;
  for (const id in G.prints) { const pr = G.prints[id]; if (G.screens.some(s => s.film === id)) { pr.days++; pr.fresh = Math.max(0.35, pr.fresh * 0.86); } }
  if (G.flags.omni) { G.flags.omniDays++; G.soul = Math.max(0, G.soul - 9); }
  const sum = { day: G.day, ...t, wages, rent, avgSat: avg, cash: G.cash, rep: G.rep };
  G.stats.history.push({ day: G.day, net: t.net + t.conNet - wages - rent, cust: t.cust, rep: G.rep });
  G.day++;
  // deliveries arrive overnight
  for (const o of G.orders) { G.back.push(o); spawnBack(o); }
  G.orders = [];
  settleDeliveries();
  rollCatalog();
  storyChecks();
  saveGame();
  S.ui.summary(sum);
}

// ------------------------------------------------------------------ customers
const BOX_Q = [[-4.3, 9.75], [-4.3, 10.5], [-4.3, 11.25], [-5.1, 11.35], [-5.9, 11.35], [-6.7, 11.35], [-6.9, 10.6], [-6.9, 9.9], [-2.9, 11.5], [-2.0, 11.5]];
const CON_Q = [[4.0, 5.55], [4.0, 6.3], [4.0, 7.05], [4.0, 7.8], [4.8, 8.5], [5.6, 8.5], [6.4, 8.5], [6.4, 9.3], [5.6, 9.3], [4.8, 9.3]];
function qPos(arr, i) { return arr[Math.min(i, arr.length - 1)]; }

function spawnCustomer(k, show) {
  const f = film(G.screens.find(s => s.id === k).film);
  let type = 'customer';
  const hipChance = G.flags.finale ? 0.28 : G.flags.omni ? 0.22 : f.hip * 0.22;
  if (Math.random() < hipChance) type = 'hipster';
  else if (G.flags.omni && Math.random() < 0.12) type = 'corpo';
  const p = makePerson(type);
  W.scene.add(p.root);
  const side = Math.random() < 0.5 ? 'street_l' : 'street_r';
  placePerson(p, W.nav[side].x + (Math.random() - 0.5) * 3, W.nav[side].z + (Math.random() - 0.5) * 1.2);
  p.node = side;
  const qty = Math.random() < 0.55 ? 1 : Math.random() < 0.75 ? 2 : 3;
  const c = { p, k, show, type, qty, state: 'arrive', patience: 55 + Math.random() * 40, wait: 0, paid: 0, sat: 1, stockouts: 0, conWants: null, born: G.t };
  S.customers.push(c);
  S.today.cust++;
  walkTo(p, side, 'door_in');
  p.onArrive = () => { p.onArrive = null; joinBox(c); };
  // Marla sneaks in now and then
  if (!S.marla && G.day >= 3 && Math.random() < 0.012) spawnMarla(k);
}
function joinBox(c) { c.state = 'boxq'; S.boxQ.push(c); c.qi = -1; }
function joinCon(c) { c.state = 'conq'; S.conQ.push(c); c.qi = -1; c.wait = 0; }

function updateQueues(dt) {
  const step = (Q, POS, faceZ) => {
    Q.forEach((c, i) => {
      if (c.qi !== i) {
        c.qi = i; c.atFront = false;
        const [x, z] = qPos(POS, i);
        walkPoints(c.p, [[x + (i >= POS.length ? (i - POS.length + 1) * 0.5 : 0), z]]);
        c.p.onArrive = () => { c.p.onArrive = null; c.p.faceTarget = faceZ; if (c.qi === 0) c.atFront = true; };
      }
      c.wait += dt;
    });
  };
  step(S.boxQ, BOX_Q, Math.PI);
  step(S.conQ, CON_Q, Math.PI);
  // impatience
  for (const Q of [S.boxQ, S.conQ]) {
    for (const c of [...Q]) {
      const sh = c.show.bs;
      const started = sh?.started && G.t - sh.startedAt > (Q === S.boxQ ? 25 : 8);
      if (c.wait > c.patience || started || c.show.state === 'cancelled' || c.show.state === 'done') {
        Q.splice(Q.indexOf(c), 1);
        if (Q === S.boxQ) { say(c.p, '😤 Forget it', 2.5); c.sat = 0.1; S.today.lost++; G.rep = Math.max(0, G.rep - 0.03); leave(c); }
        else { say(c.p, '⏱️', 1.5); c.sat -= 0.2; goToAud(c); }
      }
    }
  }
}

function conWants() {
  const pr = G.prices;
  const w = { popcorn: Math.random() < 0.62 * Math.exp(-(pr.popcorn - REF_PRICE.popcorn) / 4) * (G.flags.omni ? 1.15 : 1), soda: Math.random() < 0.52 * Math.exp(-(pr.soda - REF_PRICE.soda) / 3), candy: null };
  if (Math.random() < 0.4 * Math.exp(-(pr.candy - REF_PRICE.candy) / 2.5)) w.candy = Math.floor(Math.random() * 6);
  return w;
}
export function orderText(w) {
  const out = [];
  if (w.popcorn) out.push('🍿 Popcorn');
  if (w.soda) out.push('🥤 Soda');
  if (w.candy !== null) out.push(`${CANDY[w.candy].icon} ${CANDY[w.candy].name}`);
  return out;
}

// Completed sale at the box office. `given` = {screen, qty} chosen; `change` = change given vs owed.
export function sellTicket(c, { screen, qty, changeErr = 0, refused = false }) {
  if (S.boxQ[0] !== c) return;
  S.boxQ.shift();
  if (refused) {
    if (c.type === 'hipster') { say(c.p, '😒 It’s not even irony anymore', 3); G.soul = Math.min(100, G.soul + 2); G.rep = Math.min(5, G.rep + 0.02); S.today.hipRefused++; c.sat = 0.5; c.noRate = true; }
    else { say(c.p, '😠 What?!', 3); G.rep = Math.max(0, G.rep - 0.15); c.sat = 0; }
    leave(c); return;
  }
  const ok = screen === c.k && qty === c.qty;
  if (!ok) { c.sat -= 0.25; say(c.p, screen !== c.k ? '🤨 Wrong movie…' : '🤨 Wrong count…', 2.5); }
  qty = Math.max(1, qty);
  const sc = G.screens.find(s => s.id === screen) || G.screens.find(s => s.id === c.k);
  const f = film(sc.film);
  const gross = G.prices.ticket * qty;
  const net = gross * (1 - f.cut);
  G.cash += gross - changeErr;
  G.cash -= gross * f.cut;   // distributor's cut
  S.today.tickets += qty; S.today.gross += gross; S.today.net += net - changeErr;
  G.lifetime += gross;
  c.paid = gross;
  if (changeErr > 0) { /* gave too much change: their gain, your loss */ }
  if (changeErr < 0) { c.sat -= 0.3; say(c.p, '😠 Short-changed!', 2.5); }
  c.p.excited = 0.4;
  S.ui.sfx('register');
  c.conWants = conWants();
  if (c.conWants.popcorn || c.conWants.soda || c.conWants.candy !== null) {
    walkTo(c.p, 'box_front', 'lobby_mid');
    c.p.onArrive = () => { c.p.onArrive = null; joinCon(c); };
  } else goToAud(c);
}
function autoSellTicket(c) { sellTicket(c, { screen: c.k, qty: c.qty }); }

// Completed concession sale. items = {popcorn:bool, soda:bool, candy:[i...]}
export function sellConcession(c, items, { changeErr = 0, upsell = false } = {}) {
  if (S.conQ[0] !== c) return;
  S.conQ.shift();
  const w = c.conWants, pr = G.prices;
  let gross = 0, cost = 0, missing = 0;
  if (w.popcorn) { if (items.popcorn && G.stock.popcorn >= 1) { G.stock.popcorn -= 1; gross += pr.popcorn + (upsell ? 2 : 0); cost += UNIT_COST.popcorn; } else missing++; }
  if (w.soda) { if (items.soda && G.stock.soda >= 1) { G.stock.soda -= 1; gross += pr.soda; cost += UNIT_COST.soda; } else missing++; }
  if (w.candy !== null) { if (items.candy?.includes(w.candy) && G.stock.candy[w.candy] > 0) { G.stock.candy[w.candy]--; gross += pr.candy; cost += UNIT_COST.candy; } else missing++; }
  if (missing) { c.sat -= 0.15 * missing; c.stockouts += missing; say(c.p, missing > 1 ? '😞 Nothing I wanted' : '😕 Out of that?', 2.2); }
  G.cash += gross - cost - changeErr;
  S.today.con += gross; S.today.conNet += gross - cost - changeErr;
  G.lifetime += gross;
  if (changeErr < 0) { c.sat -= 0.3; }
  if (upsell && G.flags.omni) G.soul = Math.max(0, G.soul - 0.5);
  refreshCandy();
  S.ui.sfx('register');
  // carry the goods
  if (w.popcorn && items.popcorn) { const o = clone('bucket'); o.position.set(-0.2, 0.25, -0.18); c.p.rig.add(o); }
  if (w.soda && items.soda) { const o = clone('sodacup'); o.position.set(0.22, 0.25, -0.18); c.p.rig.add(o); }
  goToAud(c);
}
function autoConcession(c) {
  const w = c.conWants;
  sellConcession(c, { popcorn: w.popcorn && G.stock.popcorn >= 1, soda: w.soda && G.stock.soda >= 1, candy: w.candy !== null && G.stock.candy[w.candy] > 0 ? [w.candy] : [] });
}

function goToAud(c) {
  const scr = G.screens.find(s => s.id === c.k);
  if (scr.trash > 0) {
    c.state = 'hallwait'; if (c.hallSince == null) c.hallSince = G.t;
    const n = W.nav['hall_' + c.k];
    walkTo(c.p, nearestNode(c.p.x, c.p.z, false), 'hall_' + c.k, [n.x - 1.0 - Math.random() * 2.4, -0.7 - Math.random() * 1.6]);
    c.p.onArrive = () => { c.p.onArrive = null; c.p.faceTarget = Math.PI; if (Math.random() < 0.5) say(c.p, ['\u{1f922} It\u2019s filthy in there', '\u23f3 Still cleaning?', '\u{1f37f}\u{1f5d1}\u{fe0f}?'][Math.floor(Math.random() * 3)], 2.5); };
    return;
  }
  if (c.hallSince != null) { c.sat -= Math.min(0.3, (G.t - c.hallSince) / 120); c.hallSince = null; }
  c.state = 'toAud';
  const from = nearestNode(c.p.x, c.p.z, false);
  const a = L.auds.find(a => a.id === c.k), A = L.aud;
  // pick a free seat, filling from the middle rows out
  const taken = new Set(S.customers.filter(o => o.k === c.k && o.seat != null).map(o => o.seat));
  const order = [];
  for (let r = 0; r < A.rows.length; r++) for (let i = 0; i < A.seats; i++) order.push(r * A.seats + i);
  order.sort((p, q) => (Math.abs(Math.floor(p / A.seats) - 2.5) + Math.abs(p % A.seats - 3.5) * 0.4) - (Math.abs(Math.floor(q / A.seats) - 2.5) + Math.abs(q % A.seats - 3.5) * 0.4) + (Math.random() - 0.5) * 1.5);
  c.seat = order.find(s => !taken.has(s));
  if (c.seat == null) { c.sat -= 0.2; leave(c); return; }
  const row = Math.floor(c.seat / A.seats), col = c.seat % A.seats;
  const zr = A.rows[row];
  const rowNode = `row_${c.k}_${A.rows.length - 1 - row}`;
  walkTo(c.p, from, rowNode, null);
  c.p.path.push({ x: a.cx + A.seatX0 + col * A.seatDX, z: zr + 0.62 });
  c.p.path.push({ x: a.cx + A.seatX0 + col * A.seatDX, z: zr + 0.05 });
  c.p.onArrive = () => { c.p.onArrive = null; c.state = 'seated'; c.p.sitting = true; c.p.faceTarget = Math.PI; c.p.face = Math.PI; if (c.show.state === 'done' || c.show.state === 'cancelled') later(1500 / 1000, () => leave(c)); };
}

function leave(c) {
  c.state = 'leaving';
  if (c.p.sitting) {
    c.p.sitting = false;
    const a = L.auds.find(a => a.id === c.k), A = L.aud;
    const row = Math.floor(c.seat / A.seats), zr = A.rows[row];
    walkPoints(c.p, [[c.p.x, zr + 0.62]]);
    const rowNode = `row_${c.k}_${A.rows.length - 1 - row}`;
    c.p.onArrive = () => { walkTo(c.p, rowNode, Math.random() < 0.5 ? 'street_l' : 'street_r'); c.p.onArrive = () => gone(c); };
    return;
  }
  const from = nearestNode(c.p.x, c.p.z, false);
  walkTo(c.p, from, Math.random() < 0.5 ? 'street_l' : 'street_r');
  c.p.onArrive = () => gone(c);
}
function gone(c) {
  W.scene.remove(c.p.root);
  const i = S.customers.indexOf(c); if (i >= 0) S.customers.splice(i, 1);
  for (const Q of [S.boxQ, S.conQ]) { const j = Q.indexOf(c); if (j >= 0) Q.splice(j, 1); }
  if (!c.noRate) S.today?.sats.push(Math.max(0, Math.min(1, c.sat)));
}

function audienceReact(k, emoji, text) {
  const aud = S.customers.filter(c => c.k === k && c.state === 'seated');
  aud.slice(0, 6).forEach((c, i) => later(i * 0.18, () => say(c.p, i % 2 ? emoji : text, 1.8)));
}

// ------------------------------------------------------------------ show hooks
function onShowStart(k, sh, who) {
  const s = G.screens.find(s => s.id === k);
  W.lights['house_' + k].intensity = 0.6;
  S.today.shows++;
  if (who === 'you' && G.flags.tut < 5) G.flags.tut = 5;
}
function onFlub(k, kind, sev) {
  if (kind === 'clean') { S.today.clean++; S.ui.tutDone('change'); S.ui.toast('Clean changeover. Nobody in the audience has any idea.', 'good'); S.ui.sfx('clack'); return; }
  S.today.flubs++;
  const msg = { cut: 'Changed over early: lopped off the end of the reel.', leader: 'Too early on the motor: the countdown leader hit the screen!', jump: 'Motor started late: the picture jumped ahead.', runout: 'RUNOUT! The reel ended on a white screen.', break: 'The film snapped in the gate.' }[kind];
  if (msg) S.ui.toast(msg, 'bad');
  if (kind !== 'break') audienceReact(k, '🙄', kind === 'runout' ? 'Focus!' : 'Hey!');
}
function onShowEnd(k, score, sh) {
  const s = G.screens.find(s => s.id === k);
  const schedule = s.shows?.find(x => x.bs === sh);
  if (schedule) schedule.state = 'done';
  W.lights['house_' + k].intensity = 30;
  const f = film(sh.film);
  const pr = G.prints[sh.film];
  const dirt = Math.min(0.25, s.trash * 0.03);
  const aud = S.customers.filter(c => c.k === k && c.show === schedule && (c.state === 'seated' || c.state === 'toAud'));
  for (const c of aud) {
    const svc = Math.max(0, 1 - c.wait / 140 - c.stockouts * 0.15);
    const price = Math.max(0, Math.min(1, 1 - (G.prices.ticket - REF_PRICE.ticket) * 0.06));
    let sat = c.sat * (0.55 * score + 0.25 * svc + 0.2 * price) - dirt;
    if (c.type === 'hipster') { sat = G.flags.finale ? sat * 0.6 : s.tier === 'digital' ? sat * 0.5 : sat * (0.6 + f.hip * 0.5); }
    c.sat = sat;
  }
  aud.forEach((c, i) => later((300 + i * 220 + Math.random() * 400) / 1000, () => leave(c)));
  if (aud.length) {
    const avg = aud.reduce((a, c) => a + Math.max(0, Math.min(1, c.sat)), 0) / aud.length;
    G.rep = Math.max(0, Math.min(5, G.rep + (avg * 5.2 - G.rep) * 0.12));
    if (avg > 0.75) audienceReact(k, '👏', 'Bravo!');
    else if (avg < 0.4) audienceReact(k, '👎', 'Meh.');
  }
  // trash left behind
  const n = aud.length ? Math.max(3, Math.round(aud.length * 0.45 * (G.flags.omni ? 1.3 : 1))) : 0;
  for (let i = 0; i < n; i++) spawnTrash(k);
  // cult following from single frames
  if (pr?.mischief?.length) {
    G.cult += aud.length * 0.05 * pr.mischief.length;
    if (G.act >= 4 && G.flags.omni) addMayhem(2 * pr.mischief.length);
    if (Math.random() < 0.1) S.ui.toast(`Someone on screen ${k} swears they saw a ${pr.mischief[0]} flash by.`, 'info');
  }
  if (f.kind === 'blockbuster' && G.flags.omni) G.soul = Math.max(0, G.soul - 1);
  if (f.kind !== 'blockbuster' && !G.flags.omni) G.soul = Math.min(100, G.soul + 0.5);
}

// ------------------------------------------------------------------ trash
const TRASH = ['trash_cup', 'trash_bucket', 'trash_wrapper', 'trash_spill', 'trash_cup', 'trash_wrapper'];
function spawnTrash(k) {
  const a = L.auds.find(a => a.id === k), A = L.aud;
  const row = Math.floor(Math.random() * A.rows.length), zr = A.rows[row];
  const seat = Math.floor(Math.random() * A.seats);
  const x = a.cx + A.seatX0 + seat * A.seatDX + (Math.random() - 0.5) * 0.3;
  const kind = TRASH[Math.floor(Math.random() * TRASH.length)];
  const o = clone(kind);
  const onSeat = kind !== 'trash_spill' && Math.random() < 0.3;
  o.position.set(x, onSeat ? 0.5 : 0, onSeat ? zr - 0.02 : zr + 0.5 + (Math.random() - 0.5) * 0.12);
  o.rotation.y = Math.random() * 6.28;
  W.scene.add(o);
  addHitBox(o, 0.18);
  const s = G.screens.find(s => s.id === k);
  s.trash++;
  const t = { k, o, laneZ: zr + 0.62, rowNode: `row_${k}_${A.rows.length - 1 - row}` };
  t.def = tagObject(o, {
    label: () => G.carry ? 'Hands full: throw it down first (G)' : (G.bag || 0) >= BAG_CAP ? 'Trash bag full: empty it in a bin' : `Pick up the trash (bag ${G.bag || 0}/${BAG_CAP})`,
    hold: () => (G.carry || (G.bag || 0) >= BAG_CAP ? 0 : 0.3),
    act: () => { if (G.carry || (G.bag || 0) >= BAG_CAP || !S.trash.includes(t)) return; G.bag = (G.bag || 0) + 1; removeTrash(t); S.ui.sfx('sweep'); S.ui.tutDone('clean'); },
  });
  S.trash.push(t);
}
export function emptyBag() { if (!G.bag) return; G.bag = 0; S.ui.sfx('bin'); S.ui.toast('Bag emptied.'); S.ui.tutDone('bin'); }
function removeTrash(t) {
  if (!S.trash.includes(t)) return;
  W.scene.remove(t.o);
  const i = W.interact.indexOf(t.def); if (i >= 0) W.interact.splice(i, 1);
  S.trash.splice(S.trash.indexOf(t), 1);
  const s = G.screens.find(s => s.id === t.k); s.trash = Math.max(0, s.trash - 1);
}
function clearTrash(k) { for (const t of S.trash.filter(t => t.k === k)) removeTrash(t); }

// ------------------------------------------------------------------ Marla
function spawnMarla(k) {
  const p = makePerson('marla', 4242);
  W.scene.add(p.root);
  placePerson(p, W.nav.street_r.x, W.nav.street_r.z);
  const m = { p, k, caught: false };
  S.marla = m;
  walkTo(p, 'street_r', 'audin_' + k);
  m.def = tagObject(p.root, {
    label: () => m.caught ? null : 'Marla is sneaking in without a ticket — call her on it',
    act: () => { if (m.caught) return; m.caught = true; say(p, '🚬 Fine. It’s a free country.', 3); G.cash += G.prices.ticket; S.today.gross += G.prices.ticket; walkTo(p, nearestNode(p.x, p.z, false), 'street_l'); p.onArrive = () => { W.scene.remove(p.root); const i = W.interact.indexOf(m.def); if (i >= 0) W.interact.splice(i, 1); S.marla = null; }; },
  });
  p.onArrive = () => { if (!m.caught) { say(p, '🚬', 3); later((3000) / 1000, () => { W.scene.remove(p.root); const i = W.interact.indexOf(m.def); if (i >= 0) W.interact.splice(i, 1); S.marla = null; G.rep = Math.max(0, G.rep - 0.02); }); } };
}

// ------------------------------------------------------------------ story / acts
export function addMayhem(n, why) {
  G.mayhem = Math.min(100, G.mayhem + n);
  if (why) S.ui.toast(`Mayhem +${n}: ${why}`, 'info');
}
function storyChecks() {
  const nOpen = G.screens.filter(s => s.open).length;
  if (G.act === 1 && nOpen >= 2) G.act = 2;
  if (!G.flags.omni && !G.flags.finale && nOpen >= 4 && G.day >= (G.flags.omniOfferDay || 0)) G.flags.omniPending = true;
  if (G.flags.omni && G.act === 3 && G.soul <= 30) { G.act = 4; G.flags.story.mayhem = 'pending'; }
}
export function spawnChesler() {
  if (S.chesler) return;
  const p = makePerson('corpo', 1999);
  W.scene.add(p.root);
  placePerson(p, 0, 9.2, Math.PI);
  S.chesler = p;
  tagObject(p.root, { label: () => G.flags.omniPending ? 'A man in a suit: Richard Chesler, OmniPlex Corp.' : null, act: () => S.ui.omniOffer() });
  say(p, '💼 Got a minute?', 8);
}
export function acceptOmni() {
  G.flags.omni = true; G.flags.omniPending = false; G.act = 3;
  G.cash += 2500;
  G.prices.ticket = Math.max(G.prices.ticket, 13);
  for (const s of G.screens) if (s.open) { s.tier = 'digital'; }
  for (const id in G.prints) {
    const f = film(id);
    if (f.kind === 'arthouse') { delete G.prints[id]; continue; }
    G.prints[id].state = 'drive';
  }
  for (const it of [...G.back]) if (it.film) { if (!G.prints[it.film]) { despawnBack(it); G.back.splice(G.back.indexOf(it), 1); } else if (it.kind === 'print') { despawnBack(it); it.kind = 'drive'; G.prints[it.film].state = 'drive'; } }
  G.orders = G.orders.filter(o => !o.film || G.prints[o.film]).map(o => o.kind === 'print' ? { ...o, kind: 'drive' } : o);
  relayoutBack();
  for (const s of G.screens) { if (s.film && !G.prints[s.film]) { s.film = null; } if (s.poster && !G.prints[s.poster]) s.poster = null; booth.layoutScreen(s.id); }
  if (S.chesler) { W.scene.remove(S.chesler.root); S.chesler = null; }
  restyleStaff();
  rollCatalog();
  refreshShelf();
  saveGame();
}
export function declineOmni() {
  G.flags.omniPending = false; G.flags.omniOfferDay = G.day + 3; G.soul = Math.min(100, G.soul + 5);
  if (S.chesler) { const p = S.chesler; walkTo(p, 'lobby_front', 'street_r'); p.onArrive = () => { W.scene.remove(p.root); }; S.chesler = null; }
}
export function runFinale() {
  G.flags.finale = true; G.flags.omni = false; G.flags.monkeys = true;
  G.act = 4; G.soul = 100; G.mayhem = 100;
  G.cash = Math.max(800, Math.round(G.cash * 0.5));
  G.prices.ticket = 7;
  for (const s of G.screens) {
    s.open = s.id === 3; s.tier = 'reel'; s.shows = null;
    if (s.film && film(s.film).kind === 'blockbuster') s.film = null;
    if (s.poster && film(s.poster).kind === 'blockbuster') s.poster = null;
  }
  for (const id in G.prints) { if (film(id).kind === 'blockbuster') delete G.prints[id]; else G.prints[id].state = G.back.some(b => b.film === id) || G.orders.some(o => o.film === id) ? 'cans' : 'built'; }
  for (const it of [...G.back]) if (it.film) { despawnBack(it); if (!G.prints[it.film]) G.back.splice(G.back.indexOf(it), 1); else it.kind = 'print'; }
  G.orders = G.orders.filter(o => !o.film || G.prints[o.film]).map(o => o.kind === 'drive' ? { ...o, kind: 'print' } : o);
  relayoutBack();
  const s3 = G.screens.find(s => s.id === 3);
  if (!s3.film) { const any = Object.keys(G.prints)[0]; s3.film = any || null; s3.poster = any || null; }
  G.staff = G.staff.slice(0, 3);
  for (const s of G.screens) { setAudUnlocked(s.id, s.open); booth.layoutScreen(s.id); }
  for (const st of [...S.staff]) if (!G.staff.find(g => g.id === st.id)) { W.scene.remove(st.p.root); S.staff.splice(S.staff.indexOf(st), 1); }
  restyleStaff();
  rollCatalog();
  refreshShelf();
  saveGame();
}

// ------------------------------------------------------------------ per-frame
let saveAcc = 0;
export function updateSim(dt, t) {
  runTimers(dt);
  if (G.phase === 'closed' && (saveAcc += dt) > 15) { saveAcc = 0; saveGame(); }
  if (G.phase === 'open') { G.t += dt; updateSchedule(dt); }
  updateQueues(dt);
  updateFlying(dt);
  for (const c of S.customers) if (c.state === 'hallwait' && !c.p.moving && G.screens.find(s => s.id === c.k).trash === 0) goToAud(c);
  updateStaff(dt);
  for (const c of S.customers) updatePerson(c.p, dt, t);
  for (const s of S.staff) updatePerson(s.p, dt, t);
  if (S.marla) updatePerson(S.marla.p, dt, t);
  if (S.chesler) updatePerson(S.chesler, dt, t);
  // popcorn smell: the machine keeps popping while it has kernels
  if (P.popcornFill) P.popcornFill.scale.y += (Math.max(0.02, G.stock.popcorn / POP_CAP) - P.popcornFill.scale.y) * Math.min(1, dt * 2);
}

// ------------------------------------------------------------------ purchases (computer)
export function order(kind, extra = {}) {
  if (kind === 'film') {
    const f = film(extra.film);
    if (G.cash < f.cost) return { ok: false, reason: 'Not enough cash' };
    G.cash -= f.cost;
    const digital = G.flags.omni || G.screens.some(s => s.open && s.tier === 'digital') && extra.digital;
    G.prints[f.id] = { state: 'shipping', quality: 0, mischief: [], days: 0, fresh: 1 };
    G.orders.push(G.flags.omni ? { kind: 'drive', film: f.id } : { kind: 'print', film: f.id });
    G.catalog = G.catalog.filter(id => id !== f.id);
    return { ok: true };
  }
  const sp = SUPPLY[kind];
  if (!sp) return { ok: false };
  if (G.cash < sp.cost) return { ok: false, reason: 'Not enough cash' };
  G.cash -= sp.cost;
  const it = kind === 'candy' ? { kind, i: extra.i, n: sp.units } : { kind, n: sp.units };
  if (G.phase === 'closed' && extra.rush) { G.back.push(it); spawnBack(it); } else G.orders.push(it);
  return { ok: true };
}
// prints arrive with the delivery: 'shipping' -> 'cans' / 'drive' when the case lands on the pallet
export function settleDeliveries() {
  for (const it of G.back) {
    const pr = it.film && G.prints[it.film];
    if (pr && pr.state === 'shipping') pr.state = it.kind === 'drive' ? 'drive' : 'cans';
  }
}
export function openNextScreen(cost) {
  if (G.cash < cost) return { ok: false, reason: 'Not enough cash' };
  const id = L.unlockOrder.find(id => !G.screens.find(s => s.id === id).open);
  if (!id) return { ok: false, reason: 'All six screens are open' };
  G.cash -= cost;
  const s = G.screens.find(s => s.id === id);
  s.open = true; s.tier = G.flags.omni ? 'digital' : 'reel';
  setAudUnlocked(id, true);
  booth.layoutScreen(id);
  const wasAct = G.act;
  storyChecks();
  return { ok: true, id, newAct: G.act !== wasAct };
}
export function setTier(id, tier, cost) {
  if (G.cash < cost) return { ok: false, reason: 'Not enough cash' };
  const s = G.screens.find(s => s.id === id);
  if (booth.B[id].show) return { ok: false, reason: 'Wait until the show is over' };
  G.cash -= cost;
  s.tier = tier;
  if (tier === 'digital' && s.film && G.prints[s.film]) G.prints[s.film].state = 'drive';
  booth.layoutScreen(id);
  return { ok: true };
}
