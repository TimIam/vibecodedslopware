// One outing: builds the place, runs the list of objectives, keeps score, and translates the radio.

import * as THREE from 'three';
import { S, clamp, rand, pick, hasSkill, saveGame, xpNeed, MAX_LEVEL } from './state.js';
import { BARKS, RECORDS, LOGS, SPEAKERS, DEATH_HEADS } from './data.js';
import { buildWorld } from './world.js';
import { spawnEnemy, clearEnemies, spawnDropship, shipsActive, alertAll } from './enemies.js';
import { clearProj } from './proj.js';
import { clearFx, burst, ring, flash, num, shake } from './fx.js';
import { sfx, babble, setCombat, setKey } from './audio.js';
import { P, resetPlayer, revivePlayer } from './player.js';
import { MISSIONS } from './missions.js';
import * as ui from './ui.js';

const padGeo = new THREE.BoxGeometry(0.34, 0.03, 0.48);
const padMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.4) });

export function startMission(idx) {
  const def = MISSIONS[idx];
  clearEnemies(); clearProj(); clearFx(); S.targets.length = 0; S.time = 0;
  if (S.M) for (const p of S.M.pickups) S.scene.remove(p.mesh);
  const M = S.M = {
    idx, def, stage: -1, stages: [], truce: false, diff: [0.75, 0.9, 1, 1.1, 1.15][idx], done: false, tDone: 0,
    stats: { taken: 0, shots: 0, returned: 0, slain: 0, logs: 0, xp: 0 },
    timers: [], interact: [], pickups: [], tBark: 0, last: {}, tMusic: 0, hold: 0, holding: null, spawn: def.spawn,
  };
  M.later = (t, fn) => M.timers.push({ t, fn });
  M.hint = text => ui.hint(text);
  buildWorld(def);
  M.stages = def.setup(M, api);
  resetPlayer(def.spawn[0], def.spawn[1], def.spawn[2] ?? 0); P.molted = false;
  setCombat(0); setKey(0);
  ui.missionStart(def, idx);
  nextStage();
  return M;
}

// What a mission's setup() gets to place things with.
export const api = {
  enemy: (type, x, z, o) => spawnEnemy(type, x, z, o),
  squad(list, x, z, spread = 5, o = {}) { return list.map((t, i) => { const a = i * 2.4 + x, r = spread * (0.4 + 0.6 * ((i * 37) % 10) / 10); return spawnEnemy(t, x + Math.cos(a) * r, z + Math.sin(a) * r, o); }); },
  ship: (x, z, list, delay = 0, o = {}) => spawnDropship(x, z, list, { delay, ...o }),
  target(group, x, z, o) {
    const W = S.W, y = W.height(x, z);
    group.position.set(x, y, z); W.group.add(group);
    const t = { isTarget: true, x, y, z, r: o.r ?? 1.4, cy: o.cy ?? 1.5, hp: o.hp, max: o.hp, dead: false, group, label: o.label, noun: o.noun || 'thing', shielded: !!o.shielded, onDead: o.onDead, xp: o.xp ?? 40 };
    t.col = W.addCircle(x, z, o.cr ?? t.r * 0.8, y - 1, y + (o.ch ?? t.cy * 2));
    const u = group.userData;
    if (u.spin || u.blink) W.anim.push((time, dt) => { if (t.dead) return; if (u.spin) u.spin.rotation[u.spinAxis || 'y'] += dt * (o.spinRate ?? 4); if (u.blink) u.blink.visible = Math.sin(time * 5 + x) > -0.3; });
    S.targets.push(t); return t;
  },
  use(x, z, o) { const it = { x, z, r: o.r ?? 4, label: o.label, hold: o.hold ?? 0, on: o.on ?? true, use: o.use }; S.M.interact.push(it); return it; },
  log(id, x, z) {
    if (S.save.logs.includes(id)) return;
    const mesh = new THREE.Mesh(padGeo, padMat); mesh.position.set(x, S.W.ground(x, z, 99) + 1, z); mesh.rotation.x = 0.5; S.scene.add(mesh);
    S.M.pickups.push({ id, x, z, mesh });
  },
  say, bark,
};

function nextStage() {
  const M = S.M;
  M.stage++;
  const st = M.stages[M.stage];
  if (!st) { M.done = true; M.tDone = 2.6; ui.objective('Done. Go home.', 'ALL UNITS: WE HAVE WON (WITHDRAWING)'); setCombat(0); return; }
  M.cur = st; M.checkpoint = st.checkpoint || M.checkpoint;
  st.start?.(M);
  ui.objective(typeof st.text === 'function' ? st.text(M) : st.text, st.human);
  if (M.stage > 0) { sfx('objective'); }
}

export function gainXp(n) {
  const sv = S.save; sv.xp += n; S.M.stats.xp += n;
  while (sv.level < MAX_LEVEL && sv.xp >= xpNeed(sv.level)) { sv.xp -= xpNeed(sv.level); sv.level++; sv.pts++; sfx('level'); ui.toast(`Standing ${sv.level}. One adaptation to spend at the Conclave.`, 'good'); }
}

// ------------------------------------------------------------------ the radio
// bark(): a soldier says a line from BARKS over their own comms; you get it translated at the bottom of the screen.
export function bark(key, e, vars, force) {
  const M = S.M; if (!M || S.mode !== 'mission') return;
  if (!force && S.time < M.tBark) return;
  const lines = BARKS[key]; if (!lines) return;
  let line = pick(lines); if (line === M.last[key]) line = pick(lines);
  M.last[key] = line;
  if (vars) for (const k in vars) line = line.replaceAll(`{${k}}`, vars[k]);
  const who = e ? (e.rank ? `${e.rank} ${e.last || e.name}` : e.name) : 'Fleet Comms';
  ui.subtitle(who, line, e?.def.machine ? 'machine' : 'human');
  babble(e ? e.name.length + e.name.charCodeAt(0) : 3, clamp(Math.round(line.length / 9), 3, 9), !!e?.def.machine);
  M.tBark = S.time + 2.9;
}
export function say(who, text, force) {
  const M = S.M, sp = SPEAKERS[who];
  if (!force && M && S.time < M.tBark) return;
  ui.subtitle(sp.name, text, sp.human ? 'human named' : 'alien');
  if (sp.human) babble(who.length * 3, clamp(Math.round(text.length / 9), 3, 10));
  if (M) M.tBark = S.time + 3.2;
}

export function onReturned(e) {
  const M = S.M, mach = e.def.machine;
  M.stats.returned++; S.save.returned++;
  gainXp(e.def.xp);
  ui.feed(`<b>${e.rank ? e.rank + ' ' : ''}${e.name}</b> ${mach ? 'returned to sender' : 'returned to orbit'}`, `Fleet record: "${mach ? pick(['a brave appliance', 'gave its warranty for freedom', 'died doing what it loved: announcing']) : pick(RECORDS)}"`);
  if (hasSkill('g_feed')) { P.sh = Math.min(P.maxSh, P.sh + 8); P.thorn = Math.min(P.thornMax, P.thorn + 10); }
  if (!mach && Math.random() < 0.4) { const o = S.enemies.find(q => q !== e && !q.gone && q.alert && !q.def.machine && q.pos.distanceTo(e.pos) < 45); if (o) bark('ally', o, { name: e.last || e.name }); }
  e.onGone?.(e);
}

export function damageTarget(t, dmg, info = {}) {
  if (t.dead) return;
  const hx = info.x ?? t.x, hy = info.y ?? t.y + t.cy, hz = info.z ?? t.z;
  if (t.shielded) { num(hx, hy + 0.5, hz, 'SHIELDED', 'block'); sfx('block'); if (!S.M.shieldHint) { S.M.shieldHint = true; ui.hint('Shielded. Find the generator feeding it.'); } return; }
  t.hp -= dmg; num(hx, hy + 0.4, hz, Math.round(dmg), '');
  burst(hx, hy, hz, { n: 5, color: 0xffb060, speed: 4, size: 0.25, life: 0.3 }); ui.hitMark(false); sfx('hit');
  alertAll(t.x, t.z, 45);
  if (t.hp > 0) return;
  t.dead = true; t.hp = 0;
  ring(t.x, t.y, t.z, 1, t.r * 4, 0xffa040, 0.5); burst(t.x, t.y + t.cy, t.z, { n: 60, color: 0xffa040, speed: 12, size: 0.6, life: 0.9, g: 8 });
  flash(t.x, t.y + t.cy, t.z, 0xffa040, 200, 0.4); sfx('boom'); shake(0.4);
  // What's left leans over and goes dark.
  const g = t.group, tilt = rand(0.25, 0.5) * (Math.random() < 0.5 ? -1 : 1); let k = 0;
  S.W.anim.push((time, dt) => { if (k >= 1) return; k = Math.min(1, k + dt * 1.6); g.rotation.z = tilt * k; g.position.y = t.y - t.cy * 0.25 * k; });
  if (g.userData.blink) g.userData.blink.visible = false;
  if (g.userData.shield) g.userData.shield.visible = false;
  gainXp(t.xp);
  const o = S.enemies.find(q => !q.gone && !q.def.machine && q.pos.distanceTo(P.pos) < 70);
  bark('broke', o || null, { thing: t.noun }, true);
  t.onDead?.(t);
}

export function onPlayerDown(by) {
  const M = S.M;
  M.stats.slain++; S.save.slain++; saveGame();
  setCombat(0); sfx('sting');
  const o = by && !by.gone && !by.def?.machine ? by : S.enemies.find(q => !q.gone && !q.def.machine);
  if (o) bark('youDown', o, null, true);
  S.mode = 'dead';
  ui.showDeath(DEATH_HEADS[Math.min(DEATH_HEADS.length - 1, S.save.slain - 1)], S.save.slain, () => {
    const c = M.checkpoint || M.spawn;
    revivePlayer(c[0], c[1], c[2] ?? 0);
    for (const e of S.enemies) { e.burst = 0; e.aim = 0; e.tFire = rand(1.5, 3); }
    clearProj(); S.mode = 'mission';
  });
}

// ------------------------------------------------------------------ per-frame
export function updateMission(dt) {
  const M = S.M, I = S.I;
  S.time += dt;
  for (let i = M.timers.length - 1; i >= 0; i--) { const t = M.timers[i]; if ((t.t -= dt) <= 0) { M.timers.splice(i, 1); t.fn(); } }

  if (M.done) { if (M.tDone > 0 && (M.tDone -= dt) <= 0) finish(); }
  else if (M.cur) {
    M.cur.update?.(M, dt);
    if (typeof M.cur.text === 'function') ui.objective(M.cur.text(M), M.cur.human, true);
    if (M.cur.done(M)) { M.cur.end?.(M); nextStage(); }
  }

  // Things to press F at.
  let near = null, nd = 1e9;
  if (P.alive) for (const it of M.interact) { if (!it.on) continue; const d = Math.hypot(it.x - P.pos.x, it.z - P.pos.z); if (d < it.r && d < nd) { nd = d; near = it; } }
  if (near !== M.holding) { M.holding = near; M.hold = 0; }
  if (near) {
    if (near.hold) { if (I.useHeld) { M.hold += dt; if (M.hold >= near.hold) { near.on = false; near.use(near); M.hold = 0; } } else M.hold = Math.max(0, M.hold - dt * 2); }
    else if (I.use) { near.use(near); }
    ui.prompt(near.on ? near.label : null, near.hold ? M.hold / near.hold : 0);
  } else ui.prompt(null);
  I.use = false;

  // Datapads.
  for (let i = M.pickups.length - 1; i >= 0; i--) {
    const p = M.pickups[i]; p.mesh.rotation.y += dt * 2; p.mesh.position.y += Math.sin(S.time * 3 + i) * dt * 0.2;
    if (Math.random() < 0.1) burst(p.x, p.mesh.position.y, p.z, { n: 1, color: 0xffb060, speed: 0.4, up: 1, size: 0.25, life: 0.7 });
    if (Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < 1.8 && P.alive) {
      S.scene.remove(p.mesh); M.pickups.splice(i, 1);
      S.save.logs.push(p.id); M.stats.logs++; saveGame(); gainXp(25); sfx('log');
      ui.showLog(LOGS.find(l => l.id === p.id));
    }
  }

  // Their soundtrack follows how many of them are currently being brave at you.
  if ((M.tMusic -= dt) <= 0) {
    M.tMusic = 0.4;
    let n = 0; for (const e of S.enemies) if (e.alert && !e.gone) n += e.def.boss ? 4 : e.def.big ? 2 : 1;
    setCombat(M.done || !P.alive ? 0 : clamp(n / 4, 0, 1));
  }
}

function finish() {
  const M = S.M, sv = S.save;
  const first = !sv.done.includes(M.idx);
  if (first) sv.done.push(M.idx);
  gainXp(first ? 150 : 60); saveGame();
  if (document.pointerLockElement) document.exitPointerLock();
  S.mode = 'debrief';
  ui.showDebrief(M);
}

// Helpers for stage scripts.
export const alive = list => list.filter(e => !e.gone).length;
export const allGone = () => S.enemies.every(e => e.gone) && shipsActive() === 0;
export const marksFor = list => list.filter(e => !e.gone).map(e => ({ x: e.pos.x, y: e.pos.y + e.def.h + 0.6, z: e.pos.z, label: '' }));

// Back to the Conclave: clear the field so the next outing (or the title's slow pan) starts clean.
export function leaveMission() {
  clearEnemies(); clearProj(); clearFx();
  if (S.M) for (const p of S.M.pickups) S.scene.remove(p.mesh);
  S.targets.length = 0; S.M = null; setCombat(0); setKey(0);
}
