// The visitors. Marines, riot-shield heavies, snipers, loudspeaker drones, sentry turrets, the Liberator
// walker, dropships, and Captain Buck Sterling, who is the main character and will tell you so.

import * as THREE from 'three';
import { S, clamp, lerp, rand, pick, angDiff, TAU } from './state.js';
import { RANKS, FIRST, LAST, REASONS } from './data.js';
import { box, peaceShieldTex } from './world.js';
import { fire, explode, segSphere } from './proj.js';
import { burst, ring, returnFx, num, flash, shake, beam } from './fx.js';
import { sfx, setKey } from './audio.js';
import { damagePlayer } from './player.js';
import { bark, onReturned, say } from './mission.js';
import { hitMark, bossBar } from './ui.js';
import { humanModel, droneModel, turretModel, mechModel, shipModel } from './models.js';

export const DEFS = {
  marine: { h: 1.8, r: 0.55, headR: 0.3, hp: 55, speed: 4.2, sight: 44, range: 40, rmin: 9, rmax: 22, xp: 20, noun: 'marine' },
  heavy: { h: 2.15, r: 0.75, headR: 0.32, hp: 150, speed: 2.7, sight: 40, range: 17, rmin: 4, rmax: 10, xp: 45, shield: true, scale: 1.2, noun: 'heavy' },
  sniper: { h: 1.8, r: 0.5, headR: 0.3, hp: 36, speed: 3.6, sight: 95, range: 90, rmin: 38, rmax: 72, xp: 35, noun: 'sniper' },
  drone: { h: 0.9, r: 0.65, hp: 22, speed: 8, sight: 55, range: 24, xp: 15, fly: true, machine: true, noun: 'drone' },
  turret: { h: 1.7, r: 0.75, hp: 130, speed: 0, sight: 50, range: 48, xp: 30, machine: true, noun: 'sentry' },
  mech: { h: 5.4, r: 1.9, hp: 720, speed: 2.5, sight: 80, range: 65, rmin: 14, rmax: 30, xp: 220, big: true, noun: 'walker' },
  hero: { h: 2.2, r: 0.7, headR: 0.32, hp: 2000, speed: 5.2, sight: 200, range: 60, rmin: 10, rmax: 22, xp: 700, scale: 1.18, boss: true, noun: 'hero' },
};

const ships = [];
let MM = null;
const BARGEO = new THREE.PlaneGeometry(1, 1), STAR = new THREE.OctahedronGeometry(0.09);
const v3 = new THREE.Vector3();

function mats() {
  if (MM) return MM;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...o });
  MM = {
    suit: std(0x2c3340), armor: std(0xd8d4c8), navy: std(0x24365c), olive: std(0x5c6844), gold: std(0xd9a93a, { metalness: 0.7, roughness: 0.35 }),
    trim: std(0xe8641c), gun: std(0x1c1f26, { metalness: 0.6 }), skin: std(0xd9a07a, { roughness: 0.8 }), hair: std(0xe8c860), cape: std(0xb8221c, { side: THREE.DoubleSide, roughness: 0.9 }),
    visor: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 2.2) }), eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.3, 0.2) }),
    muzzle: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.5) }), jet: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 2.6) }),
    rotor: new THREE.MeshBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.35 }),
    shield: new THREE.MeshStandardMaterial({ map: peaceShieldTex(), roughness: 0.4, metalness: 0.2 }),
    barBg: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false }),
    star: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 0.5) }),
    laser: new THREE.LineBasicMaterial({ color: new THREE.Color(3, 0.3, 0.2), transparent: true, opacity: 0.8 }),
  };
  return MM;
}
function nameFor(type) {
  if (type === 'hero') return { rank: 'Capt.', name: 'Buck Sterling', reason: 'The hero. Has been told so since birth.' };
  if (type === 'drone') return { rank: '', name: 'PeaceKeeper drone', reason: 'Speaker volume: maximum. Self-doubt: not installed.' };
  if (type === 'turret') return { rank: '', name: 'Sentry "Neighbour"', reason: 'Greets everyone. Shoots most.' };
  const last = pick(LAST);
  return { rank: pick(RANKS[type] || RANKS.marine), name: `${pick(FIRST)} ${last}`, last, reason: type === 'mech' ? 'Pilots twelve tonnes of help.' : pick(REASONS) };
}

export function spawnEnemy(type, x, z, o = {}) {
  const def = DEFS[type], m = mats();
  const armor = (type === 'heavy' ? m.navy : type === 'sniper' ? m.olive : type === 'hero' ? m.armor : type === 'drone' ? m.navy : m.armor).clone();
  const model = type === 'drone' ? droneModel() : type === 'turret' ? turretModel() : type === 'mech' ? mechModel(armor) : humanModel(type, armor, def.scale || 1);
  const y = o.y ?? S.W.ground(x, z, S.W.height(x, z) + 0.5);
  const e = {
    type, def, mesh: model, armor, pos: new THREE.Vector3(x, y, z), vy: 0, kx: 0, kz: 0, yaw: o.yaw ?? rand(TAU),
    hp: def.hp * (o.hpMul ?? 1), max: def.hp * (o.hpMul ?? 1), alert: !!o.alert, alertIn: 0, los: false, tLos: rand(0.3),
    tFire: rand(0.6, 1.8), burst: 0, tB: 0, strafe: pick([-1, 1]), tStrafe: rand(1, 2), stuck: 0, tSide: 0, sx: 0, sz: 0,
    stun: 0, flash: 0, walk: rand(6), aim: 0, lock: null, orb: rand(TAU), gone: false, vanish: 0, t: rand(10), tIdle: rand(4, 14),
    home: { x, z }, guard: o.guard ?? 0, mode: 'fight', tMode: 0, phase: 1, armorUses: 0, speeches: 0, invuln: 0, ...nameFor(type),
  };
  if (o.name) Object.assign(e, o.name);
  model.position.copy(e.pos); model.rotation.y = e.yaw;
  // Health bar and the little stars that mean "currently being looked at".
  const bar = new THREE.Group(), w = def.big || def.boss ? 2.2 : 1.1;
  const bg = new THREE.Mesh(BARGEO, m.barBg); bg.scale.set(w + 0.08, 0.16, 1); bg.renderOrder = 10; bar.add(bg);
  const fill = new THREE.Mesh(BARGEO, new THREE.MeshBasicMaterial({ color: 0xffb057, depthTest: false })); fill.scale.set(w, 0.09, 1); fill.renderOrder = 11; bar.add(fill);
  bar.visible = false; e.bar = bar; e.fill = fill; e.barW = w; S.scene.add(bar);
  const stars = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(STAR, m.star); s.position.set(Math.cos(i * 2.09) * 0.4, 0, Math.sin(i * 2.09) * 0.4); stars.add(s); }
  stars.visible = false; e.stars = stars; S.scene.add(stars);
  if (type === 'sniper') { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); e.laser = new THREE.Line(g, m.laser); e.laser.frustumCulled = false; e.laser.visible = false; S.scene.add(e.laser); }
  S.scene.add(model); S.enemies.push(e);
  return e;
}

export function clearEnemies() {
  for (const e of S.enemies) removeMeshes(e);
  S.enemies.length = 0;
  for (const s of ships) S.scene.remove(s.mesh);
  ships.length = 0;
}
function removeMeshes(e) { S.scene.remove(e.mesh, e.bar, e.stars); if (e.laser) S.scene.remove(e.laser); e.armor.dispose(); e.fill.material.dispose(); }

export function alertEnemy(e, shout = true) {
  if (e.alert || e.gone) return;
  e.alert = true; e.alertIn = 0; e.tFire = Math.max(e.tFire, rand(0.9, 2.2));
  if (S.M?.truce) S.M.breakTruce?.(e);
  if (!shout) return;
  bark(e.def.machine ? e.type : 'spot', e);
  for (const o of S.enemies) if (!o.alert && !o.alertIn && o.pos.distanceTo(e.pos) < 30) o.alertIn = rand(0.3, 1);
}
export function alertAll(x, z, r) { for (const e of S.enemies) if (!e.alert && Math.hypot(e.pos.x - x, e.pos.z - z) < r) e.alertIn = rand(0.1, 0.7); }

// The Stern Look. Returns how many it caught.
export function stunCone(px, py, pz, dx, dz, range, cosHalf, dur, each) {
  let n = 0;
  for (const e of S.enemies) {
    if (e.gone) continue;
    const ex = e.pos.x - px, ez = e.pos.z - pz, d = Math.hypot(ex, ez);
    if (d > range + e.def.r || (d > 2 && (ex * dx + ez * dz) / d < cosHalf)) continue;
    if (!S.W.los(px, py, pz, e.pos.x, e.pos.y + e.def.h * 0.7, e.pos.z)) continue;
    n++; alertEnemy(e, false); each?.(e);
    if (e.type === 'hero') {
      if (e.mode === 'speech') { endSpeech(e, true); e.stun = 2.4; } else if (e.mode === 'fight') e.stun = 1.1;
    } else e.stun = Math.max(e.stun, e.def.big ? dur * 0.5 : dur);
    e.aim = 0; e.burst = 0; if (e.laser) e.laser.visible = false;
    burst(e.pos.x, e.pos.y + e.def.h, e.pos.z, { n: 8, color: 0xffe070, speed: 2, size: 0.25, life: 0.5 });
  }
  return n;
}

export function damageEnemy(e, dmg, info = {}) {
  if (e.gone) return false;
  const P = S.P, d = e.def;
  const hx = info.x ?? e.pos.x, hy = info.y ?? e.pos.y + d.h * 0.7, hz = info.z ?? e.pos.z;
  alertEnemy(e, true);
  if (e.invuln > 0) { num(hx, hy + 0.4, hz, 'PLOT ARMOUR', 'armor'); sfx('block'); return false; }
  if (d.shield && e.stun <= 0 && info.kind === 'thorn' && info.dx !== undefined) {
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    if (-(info.dx * fx + info.dz * fz) > 0.3) {
      sfx('block'); burst(hx, hy, hz, { n: 5, color: 0xcfe0ff, speed: 3, size: 0.2, life: 0.2 }); num(hx, hy + 0.3, hz, 'PEACE', 'block');
      if (Math.random() < 0.12) bark('blocked', e);
      if (!S.M.blockHint) { S.M.blockHint = true; S.M.hint('Thorns bounce off the PEACE shield. Get behind it, or use Chorus [2], a Spore Pod [3], claws or a Stern Look [E].'); }
      return false;
    }
  }
  if (e.type === 'hero' && e.mode === 'speech' && info.kind !== 'claw') { dmg *= 0.25; if (Math.random() < 0.3) num(hx, hy + 0.5, hz, 'MONOLOGUING', 'armor'); }
  e.hp -= dmg; e.flash = 0.12;
  if (info.push) { const l = Math.hypot(info.dx || 0, info.dz || 0) || 1, k = info.push / (d.big ? 6 : d.boss ? 3 : 1); e.kx += (info.dx || 0) / l * k; e.kz += (info.dz || 0) / l * k; }
  num(hx, hy + 0.3, hz, Math.round(dmg), info.head ? 'crit' : '');
  burst(hx, hy, hz, { n: info.head ? 8 : 4, color: 0x7ffff0, speed: 3, size: 0.22, life: 0.3 });
  hitMark(info.head); sfx(info.head ? 'crit' : 'hit');
  if (e.type === 'hero' && info.kind === 'claw' && e.mode === 'speech') { endSpeech(e, true); e.stun = 2.4; }
  if (e.hp <= 0) {
    if (e.type === 'hero' && e.armorUses < 2) { plotArmor(e); return true; }
    returnEnemy(e); return true;
  }
  if (Math.random() < 0.14) bark('hurt', e);
  return true;
}

export function returnEnemy(e) {
  if (e.gone) return;
  e.gone = true; e.vanish = 0.3; e.hp = 0;
  returnFx(e.pos.x, e.pos.y, e.pos.z, e.def.h);
  flash(e.pos.x, e.pos.y + 1, e.pos.z, 0x7ffff0, e.def.big ? 160 : 50, 0.4);
  sfx('pop'); if (e.laser) e.laser.visible = false;
  onReturned(e);
}

// ------------------------------------------------------------------ shooting
function muzzle(e, out) {
  const s = e.def.scale || 1, mz = e.mesh.userData.muzzleZ * s, h = e.type === 'mech' ? 4.4 : e.type === 'turret' ? 1.15 : e.type === 'drone' ? 0.4 : 1.28 * s;
  return out.set(e.pos.x + Math.sin(e.yaw) * mz, e.pos.y + h, e.pos.z + Math.cos(e.yaw) * mz);
}
function shootAt(e, speed, dmg, spread, o = {}) {
  const P = S.P; muzzle(e, v3);
  const dist = Math.hypot(P.pos.x - v3.x, P.pos.z - v3.z), lead = (o.lead ?? 0.5) * dist / speed;
  let dx = P.pos.x + P.vel.x * lead - v3.x, dy = P.pos.y + 1.25 - v3.y + (o.grav ? dist * dist * o.grav / (2 * speed * speed) : 0), dz = P.pos.z + P.vel.z * lead - v3.z;
  const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
  dx += rand(-spread, spread); dy += rand(-spread, spread) * 0.6; dz += rand(-spread, spread);
  const l2 = Math.hypot(dx, dy, dz);
  fire({ x: v3.x, y: v3.y, z: v3.z, dx: dx / l2, dy: dy / l2, dz: dz / l2, speed, dmg: dmg * (S.M?.diff ?? 1), owner: 'e', by: e, color: o.color ?? 0xffb050, size: o.size ?? 0.09, len: o.len ?? 0.9, aoe: o.aoe, homing: o.homing, life: o.life ?? 3, kind: o.kind });
  if (dist < 70) burst(v3.x, v3.y, v3.z, { n: 2, color: 0xffc070, speed: 1.5, size: 0.3, life: 0.08 });
}

function fireLogic(e, dt, dist) {
  const P = S.P, d = e.def, near = dist < 60;
  if (!P.alive || P.ghost > 0) { e.burst = 0; e.aim = 0; if (e.laser) e.laser.visible = false; return; }
  e.tFire -= dt;
  switch (e.type) {
    case 'marine':
      if (e.burst > 0) { e.tB -= dt; if (e.tB <= 0) { shootAt(e, 46, 6, 0.035); e.burst--; e.tB = 0.11; if (near) sfx('rifle'); } }
      else if (e.tFire <= 0 && e.los && dist < d.range) { e.burst = 3; e.tB = 0; e.tFire = rand(1.4, 2.4); }
      break;
    case 'heavy':
      if (e.tFire <= 0 && e.los && dist < d.range) { for (let i = 0; i < 6; i++) shootAt(e, 40, 5, 0.1, { len: 0.5, lead: 0.2 }); e.tFire = rand(1.6, 2.2); sfx('shotgun'); }
      break;
    case 'drone':
      if (e.tFire <= 0 && e.los && dist < d.range) { shootAt(e, 50, 4, 0.03, { color: 0xff5540, len: 0.6 }); e.tFire = rand(0.9, 1.3); if (near) sfx('zap'); }
      break;
    case 'turret':
      if (e.burst > 0) { e.tB -= dt; if (e.tB <= 0) { shootAt(e, 55, 5, 0.03, { color: 0xffd070, lead: 0.7 }); e.burst--; e.tB = 0.16; if (near) sfx('rifle'); } }
      else if (e.tFire <= 0 && e.los && dist < d.range && Math.abs(e.aimErr) < 0.2) { e.burst = 8; e.tB = 0; e.tFire = rand(2.4, 3); }
      break;
    case 'sniper': {
      muzzle(e, v3);
      const a = e.laser.geometry.attributes.position;
      if (e.aim > 0) {
        e.aim -= dt;
        if (e.aim > 0.35 || !e.lock) e.lock = { x: P.pos.x - v3.x, y: P.pos.y + 1.3 - v3.y, z: P.pos.z - v3.z };   // tracks you, then commits
        const L = Math.hypot(e.lock.x, e.lock.y, e.lock.z), dx = e.lock.x / L, dy = e.lock.y / L, dz = e.lock.z / L;
        const reach = S.W.ray(v3.x, v3.y, v3.z, dx, dy, dz, 140);
        a.setXYZ(0, v3.x, v3.y, v3.z); a.setXYZ(1, v3.x + dx * reach, v3.y + dy * reach, v3.z + dz * reach); a.needsUpdate = true;
        e.laser.visible = true; e.laser.material.opacity = e.aim < 0.35 ? 1 : 0.35 + 0.3 * Math.sin(e.t * 30);
        if (e.aim <= 0) {
          e.laser.visible = false; sfx('laser');
          beam(v3.x, v3.y, v3.z, v3.x + dx * reach, v3.y + dy * reach, v3.z + dz * reach, 0xff5030, 0.12, 0.25);
          if (segSphere(v3.x, v3.y, v3.z, dx, dy, dz, reach, P.pos.x, P.pos.y + 1.3, P.pos.z, 0.8) >= 0) damagePlayer(32 * (S.M?.diff ?? 1), v3.x, v3.z, { by: e });
          e.tFire = rand(2.6, 3.6); e.lock = null;
        }
      } else if (e.tFire <= 0 && e.los && dist < d.range) { e.aim = 1.5; e.lock = null; sfx('laserCharge'); if (Math.random() < 0.3) bark('sniper', e); }
      else e.laser.visible = false;
      break;
    }
    case 'mech':
      if (e.burst > 0) { e.tB -= dt; if (e.tB <= 0) { shootAt(e, 19, 22, 0.05, { color: 0xff8030, size: 0.28, len: 0.9, aoe: 4.2, homing: 7, life: 4.5, lead: 0, kind: 'rocket' }); e.burst--; e.tB = 0.3; sfx('rocket'); } }
      else if (e.tFire <= 0 && e.los && dist < d.range && dist > 8) { e.burst = 3; e.tB = 0; e.tFire = rand(4, 5.5); if (Math.random() < 0.4) bark('mech', e); }
      if (e.stomp > 0) {
        e.stomp -= dt;
        if (e.stomp <= 0) { stompAt(e, 7.5, 26); e.tStomp = 3.5; }
      } else if ((e.tStomp = (e.tStomp ?? 1) - dt) <= 0 && dist < 7.5) { e.stomp = 0.8; ring(e.pos.x, e.pos.y, e.pos.z, 7.5, 7.5, 0xff7030, 0.8, 0.5); }
      break;
  }
}
function stompAt(e, r, dmg) {
  const P = S.P;
  sfx('stomp'); shake(0.7); ring(e.pos.x, e.pos.y, e.pos.z, 1, r, 0xffa050, 0.4);
  burst(e.pos.x, e.pos.y + 0.3, e.pos.z, { n: 30, color: 0xc8b090, speed: 9, size: 0.5, life: 0.6, g: 6 });
  if (Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < r && P.pos.y - e.pos.y < 2.5) damagePlayer(dmg * (S.M?.diff ?? 1), e.pos.x, e.pos.z, { push: 14, by: e });
}

// ------------------------------------------------------------------ Captain Buck Sterling
const SPEECH = [
  ['Monster! Hear me!', 'My whole life has led to this moment. It is a great moment, because I am in it.', 'My father told me: son, everything the light touches belongs to whoever gets there with a flag!'],
  ['Is that all you\'ve got?', 'I feel it. A second wind! Hear the music change? I asked them to do that.', 'I fight for every human who ever looked at something and said: MINE!'],
];
const ARMOR_LINES = ['Not like this! Not before my big scene!', 'Heroes. Don\'t. LOSE!'];
function startSpeech(e) {
  e.mode = 'speech'; e.tMode = 5.4; e.speechLine = 0; e.burst = 0;
  e.healTo = Math.min(e.max, e.hp + e.max * 0.22);
  setKey(e.speeches * 2); sfx('sting');
  say('sterling', SPEECH[e.speeches][0], true);
  S.M.hint?.('He is giving a speech. It heals him. A Stern Look [E] or your claws [RMB] will interrupt.');
  e.speeches++;
}
function endSpeech(e, rude) {
  e.mode = 'fight'; e.tMode = rand(3, 5);
  if (rude) { say('sterling', pick(['...Rude!', 'I was TALKING!', 'You interrupted the best part!']), true); num(e.pos.x, e.pos.y + 3, e.pos.z, 'INTERRUPTED', 'crit'); }
  else say('sterling', 'Thank you. I\'m available for questions after the fight.', true);
  if (e.speeches === 1 || e.speeches === 2) heroWave(e);
}
function heroWave(e) {
  const a = rand(TAU);
  spawnDropship(e.home.x + Math.cos(a) * 24, e.home.z + Math.sin(a) * 24, e.phase >= 3 ? ['marine', 'marine', 'marine', 'heavy', 'drone'] : ['marine', 'marine', 'marine', 'drone']);
}
function plotArmor(e) {
  const P = S.P;
  e.hp = e.max * 0.07; e.invuln = 2.6; e.mode = 'fight'; e.tMode = 1.5;
  say('sterling', ARMOR_LINES[e.armorUses], true); e.armorUses++;
  num(e.pos.x, e.pos.y + 3, e.pos.z, 'PLOT ARMOUR', 'armor'); sfx('sting'); shake(0.6);
  ring(e.pos.x, e.pos.y, e.pos.z, 1, 12, 0xffd24a, 0.5); burst(e.pos.x, e.pos.y + 1.2, e.pos.z, { n: 50, color: 0xffd24a, speed: 12, size: 0.5, life: 0.7 });
  if (P.pos.distanceTo(e.pos) < 12) damagePlayer(8, e.pos.x, e.pos.z, { push: 18, by: e });
}
function heroLogic(e, dt, dist) {
  const P = S.P, W = S.W;
  const frac = e.hp / e.max;
  e.phase = frac > 0.6 ? 1 : frac > 0.28 ? 2 : 3;
  if (e.invuln > 0) { e.invuln -= dt; if (Math.random() < 0.5) burst(e.pos.x, e.pos.y + 1.2, e.pos.z, { n: 1, color: 0xffd24a, speed: 2, size: 0.4, life: 0.5, spread: 0.8 }); }
  if (e.mesh.userData.cape) e.mesh.userData.cape.rotation.x = 0.3 + Math.sin(e.t * 5) * 0.12 + (e.mode === 'leap' ? 0.8 : 0);
  for (const j of e.mesh.userData.jets) j.visible = e.mode === 'leap';

  if (e.mode === 'speech') {
    e.tMode -= dt;
    e.hp = Math.min(e.healTo, e.hp + e.max * 0.045 * dt);
    const li = Math.min(2, Math.floor((5.4 - e.tMode) / 1.8));
    if (li !== e.speechLine) { e.speechLine = li; say('sterling', SPEECH[e.speeches - 1][li], true); }
    if (Math.random() < 0.6) burst(e.pos.x, e.pos.y + rand(0, 2.4), e.pos.z, { n: 1, color: 0xffd24a, speed: 1, up: 2.5, size: 0.35, life: 0.8, spread: 0.7 });
    e.mesh.userData.top.rotation.x = -0.25;
    if (e.tMode <= 0) endSpeech(e, false);
    return false;
  }
  e.mesh.userData.top.rotation.x = 0;
  if (e.mode === 'leap') {
    e.tMode -= dt;
    const k = clamp(1 - e.tMode / 1.05, 0, 1);
    e.pos.x = lerp(e.leap.x0, e.leap.x1, k); e.pos.z = lerp(e.leap.z0, e.leap.z1, k);
    e.pos.y = lerp(e.leap.y0, e.leap.y1, k) + Math.sin(k * Math.PI) * 9;
    burst(e.pos.x, e.pos.y, e.pos.z, { n: 2, color: 0x8cc8ff, speed: 1, up: -4, size: 0.4, life: 0.3 });
    if (k >= 1) { e.pos.y = e.leap.y1; e.mode = 'fight'; e.tMode = rand(3.5, 5); e.tFire = 0.7; stompAt(e, 6, 24); }
    return false;
  }
  if (e.speeches === 0 && frac <= 0.6 || e.speeches === 1 && frac <= 0.28) { startSpeech(e); return false; }

  // Rifle bursts between set pieces.
  if (e.burst > 0) { e.tB -= dt; if (e.tB <= 0) { shootAt(e, 52, 4.5, 0.045, { color: 0xffe070, lead: 0.45 }); e.burst--; e.tB = 0.1; sfx('rifle'); } }
  else if ((e.tFire -= dt) <= 0 && e.los) { e.burst = 3 + e.phase; e.tB = 0; e.tFire = rand(1.7, 2.4) - e.phase * 0.15; }

  e.tMode -= dt;
  if (e.tMode <= 0 && P.alive) {
    if (e.phase >= 2 && Math.random() < 0.5) {
      // Air support: the fleet shells wherever you are about to be.
      const n = e.phase === 3 ? 5 : 3;
      say('sterling', pick(['Fleet! Bombard my heroic position!', 'Air support! Danger close! I\'ll be fine, I\'m me!']), false);
      for (let i = 0; i < n; i++) {
        const tx = P.pos.x + P.vel.x * (0.4 + i * 0.35) + rand(-3, 3), tz = P.pos.z + P.vel.z * (0.4 + i * 0.35) + rand(-3, 3), ty = W.height(tx, tz);
        S.M.later(i * 0.28, () => { ring(tx, ty, tz, 5, 5, 0xff5030, 1.2, 0.55); });
        S.M.later(1.2 + i * 0.28, () => { beam(tx, ty + 160, tz, tx, ty, tz, 0xffb060, 0.9, 0.35); explode(tx, ty + 0.5, tz, 5, 20 * S.M.diff, 'e', { by: e }); });
      }
      e.tMode = rand(5, 6.5);
    } else if (dist > 5) {
      const tx = P.pos.x + P.vel.x * 0.5, tz = P.pos.z + P.vel.z * 0.5;
      e.mode = 'leap'; e.tMode = 1.05; e.leap = { x0: e.pos.x, z0: e.pos.z, y0: e.pos.y, x1: tx, z1: tz, y1: W.height(tx, tz) };
      ring(tx, e.leap.y1, tz, 6, 6, 0xffd24a, 1.05, 0.5); sfx('jet');
      if (Math.random() < 0.5) say('sterling', pick(['Justice from above!', 'Watch this, history!', 'Death from a reasonable height!']), false);
      return false;
    } else e.tMode = 1;
  }
  return true;   // carry on with normal movement
}

// ------------------------------------------------------------------ dropships
export function spawnDropship(x, z, list, o = {}) {
  const a = rand(TAU), y = S.W.height(x, z) + 8;
  const s = { mesh: shipModel(), x, y, z, a, t: -(o.delay ?? 0), list: [...list], dropped: 0, sx: x + Math.cos(a) * 190, sz: z + Math.sin(a) * 190, hpMul: o.hpMul };
  s.mesh.position.set(s.sx, y + 80, s.sz); s.mesh.rotation.y = -a + Math.PI; S.scene.add(s.mesh); ships.push(s);
  return s;
}
export const shipsActive = () => ships.length;
function updateShips(dt) {
  for (let i = ships.length - 1; i >= 0; i--) {
    const s = ships[i]; const was = s.t; s.t += dt;
    if (s.t < 0) continue;
    if (was < 0) { sfx('ship'); bark('dropship', null); }
    const m = s.mesh;
    if (s.t < 4) { const k = 1 - Math.pow(1 - s.t / 4, 3); m.position.set(lerp(s.sx, s.x, k), s.y + 80 * (1 - k), lerp(s.sz, s.z, k)); m.rotation.z = (1 - k) * 0.25; }
    else if (s.t < 4 + s.list.length * 0.35 + 0.8) {
      m.position.set(s.x, s.y + Math.sin(s.t * 3) * 0.2, s.z); m.rotation.z = 0;
      const want = Math.min(s.list.length, Math.floor((s.t - 4.3) / 0.35) + 1);
      while (s.dropped < want) {
        const an = s.dropped * 2.4, r = 2.5 + (s.dropped % 3);
        const e = spawnEnemy(s.list[s.dropped], s.x + Math.cos(an) * r, s.z + Math.sin(an) * r, { alert: true, y: s.y - 2, hpMul: s.hpMul });
        if (e.def.fly) e.pos.y = s.y - 1;
        s.dropped++;
      }
      for (const f of m.userData.flames) f.scale.y = 0.8 + Math.random() * 0.5;
      for (const sz of [-1, 1]) if (Math.random() < 0.5) burst(s.x - 0.5 * Math.cos(-s.a + Math.PI) + sz * 4.6 * Math.sin(-s.a + Math.PI), s.y - 1.4, s.z + sz * 4.6 * Math.cos(-s.a + Math.PI), { n: 1, color: 0x70b8ff, speed: 1, up: -8, size: 0.6, life: 0.4 });
    } else {
      const k = s.t - (4 + s.list.length * 0.35 + 0.8);
      m.position.y = s.y + k * k * 9; m.position.x -= Math.cos(s.a + 2) * k * 30 * dt; m.position.z -= Math.sin(s.a + 2) * k * 30 * dt; m.rotation.z = -Math.min(0.3, k * 0.1);
      if (k > 4.5) { S.scene.remove(m); ships.splice(i, 1); }
    }
  }
}

// ------------------------------------------------------------------ per-frame
export function updateEnemies(dt, camera) {
  const P = S.P, W = S.W;
  updateShips(dt);
  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i], d = e.def, u = e.mesh.userData;
    e.t += dt;
    if (e.gone) {
      e.vanish -= dt; e.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 9)); e.bar.visible = e.stars.visible = false;
      if (e.vanish <= 0) { removeMeshes(e); S.enemies.splice(i, 1); }
      continue;
    }
    if (e.flash > 0) { e.flash -= dt; e.armor.emissive.setScalar(e.flash > 0 ? 0.9 : 0); }
    if (e.alertIn > 0) { e.alertIn -= dt; if (e.alertIn <= 0) alertEnemy(e, false); }

    const dxp = P.pos.x - e.pos.x, dzp = P.pos.z - e.pos.z, dist = Math.hypot(dxp, dzp) || 0.01;
    const eyeY = e.pos.y + d.h * 0.85;
    if ((e.tLos -= dt) <= 0) { e.tLos = 0.18 + rand(0.1); e.los = P.alive && !(P.ghost > 0) && dist < d.sight * 1.3 && W.los(e.pos.x, eyeY, e.pos.z, P.pos.x, P.pos.y + 1.6, P.pos.z); }

    let moving = 0, canAct = true;
    if (e.stun > 0) {
      e.stun -= dt; canAct = false;
      e.stars.visible = true; e.stars.position.set(e.pos.x, e.pos.y + d.h * (d.scale || 1) + 0.35, e.pos.z); e.stars.rotation.y = e.t * 6;
      if (u.top) u.top.rotation.x = 0.35 + Math.sin(e.t * 9) * 0.06;
      if (u.shield) u.shield.rotation.x = 1.2;
      if (e.stun <= 0) { e.stars.visible = false; if (u.top) u.top.rotation.x = 0; if (u.shield) u.shield.rotation.x = 0; }
    } else if (!e.alert) {
      canAct = false;
      if (!S.M.truce && P.alive && !(P.ghost > 0) && e.los && dist < d.sight * (P.sprinting ? 0.8 : 0.62)) alertEnemy(e, true);
      e.yaw += Math.sin(e.t * 0.4 + e.walk) * 0.3 * dt;
      if ((e.tIdle -= dt) <= 0) { e.tIdle = rand(9, 20); if (dist < 26 && !d.machine) bark('idle', e); else if (dist < 30 && e.type === 'drone') bark('drone', e); }
    }
    if (canAct && e.type === 'hero') { canAct = heroLogic(e, dt, dist); if (e.mode !== 'fight') { e.yaw += angDiff(Math.atan2(dxp, dzp), e.yaw) * Math.min(1, dt * 5); } }

    if (canAct) {
      const want = Math.atan2(dxp, dzp);
      if (e.type === 'turret') { e.aimErr = angDiff(want, e.yaw); e.yaw += clamp(e.aimErr, -2.4 * dt, 2.4 * dt); }
      else e.yaw += angDiff(want, e.yaw) * Math.min(1, dt * 7);
      const ux = dxp / dist, uz = dzp / dist;
      let mx = 0, mz = 0;
      if (d.fly) {
        e.orb += dt * 0.7 * e.strafe;
        const tx = P.pos.x + Math.cos(e.orb) * 11, tz = P.pos.z + Math.sin(e.orb) * 11, ty = Math.max(W.height(e.pos.x, e.pos.z), P.pos.y) + 3.6 + Math.sin(e.t * 1.7) * 0.8;
        const ddx = tx - e.pos.x, ddz = tz - e.pos.z, dl = Math.hypot(ddx, ddz) || 1, sp = Math.min(d.speed, dl * 2);
        e.pos.x += ddx / dl * sp * dt; e.pos.z += ddz / dl * sp * dt; e.pos.y += (ty - e.pos.y) * Math.min(1, dt * 2.5);
      } else if (d.speed > 0) {
        const leash = e.guard && Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z) > e.guard;
        const flee = e.hp < e.max * 0.3 && !d.big && !d.boss && e.type !== 'heavy';
        if (flee && !e.fled) { e.fled = true; if (Math.random() < 0.5) bark('flee', e); }
        if (leash) { mx = (e.home.x - e.pos.x); mz = (e.home.z - e.pos.z); }
        else if (!e.los || dist > d.rmax) { mx = ux; mz = uz; }
        else if (dist < d.rmin || (flee && dist < d.rmax)) { mx = -ux; mz = -uz; }
        if ((e.tStrafe -= dt) <= 0) { e.strafe = pick([-1, 1, 1, -1, 0]); e.tStrafe = rand(0.8, 2.4); }
        if (e.los && !leash) { mx += -uz * e.strafe * 0.85; mz += ux * e.strafe * 0.85; }
        if (e.tSide > 0) { e.tSide -= dt; mx = e.sx; mz = e.sz; }
        const ml = Math.hypot(mx, mz);
        if (ml > 0.05) {
          mx /= ml; mz /= ml; const sp = d.speed * (flee ? 1.15 : 1), ox = e.pos.x, oz = e.pos.z;
          e.pos.x += mx * sp * dt; e.pos.z += mz * sp * dt;
          W.collide(e.pos, d.r, e.pos.y, e.pos.y + d.h);
          const moved = Math.hypot(e.pos.x - ox, e.pos.z - oz);
          moving = moved / dt;
          if (moved < sp * dt * 0.3) { if ((e.stuck += dt) > 0.35) { const s = pick([-1, 1]); e.sx = -mz * s + mx * 0.2; e.sz = mx * s + mz * 0.2; e.tSide = rand(0.6, 1.2); e.stuck = 0; } } else e.stuck = 0;
        }
      }
      fireLogic(e, dt, dist);
    } else if (e.laser && e.stun > 0) e.laser.visible = false;

    // Shoves, crowding, gravity.
    if (!d.fly && d.speed > 0 && e.mode !== 'leap') {
      if (Math.abs(e.kx) + Math.abs(e.kz) > 0.05) { e.pos.x += e.kx * dt; e.pos.z += e.kz * dt; const k = Math.max(0, 1 - dt * 6); e.kx *= k; e.kz *= k; W.collide(e.pos, d.r, e.pos.y, e.pos.y + d.h); }
      for (let j = i - 1; j >= 0; j--) {
        const o = S.enemies[j]; if (o.gone || o.def.fly) continue;
        const sx = e.pos.x - o.pos.x, sz = e.pos.z - o.pos.z, rr = d.r + o.def.r, d2 = sx * sx + sz * sz;
        if (d2 < rr * rr && d2 > 1e-5) { const dd = Math.sqrt(d2), k = (rr - dd) / dd * 0.5; if (d.speed) { e.pos.x += sx * k; e.pos.z += sz * k; } if (o.def.speed) { o.pos.x -= sx * k; o.pos.z -= sz * k; } }
      }
      const gy = W.ground(e.pos.x, e.pos.z, e.pos.y);
      if (e.pos.y > gy + 0.02) { e.vy -= 25 * dt; e.pos.y += e.vy * dt; if (e.pos.y < gy) { e.pos.y = gy; e.vy = 0; } } else { e.pos.y = gy; e.vy = 0; }
    }

    // Pose.
    e.mesh.position.copy(e.pos);
    if (e.type === 'turret') u.turret.rotation.y = e.yaw; else e.mesh.rotation.y = e.yaw;
    if (u.legL) { e.walk += moving * dt * (d.big ? 0.9 : 2.2); const sw = Math.sin(e.walk) * clamp(moving / 3, 0, 1) * (d.big ? 0.35 : 0.7); u.legL.rotation.x = sw; u.legR.rotation.x = -sw; const amp = clamp(moving / 3, 0, 1) * (d.big ? 0.35 : 1.1); u.kneeL.rotation.x = Math.max(0, Math.sin(e.walk + 1.1)) * amp; u.kneeR.rotation.x = Math.max(0, -Math.sin(e.walk + 1.1)) * amp; if (d.big && moving > 0.5 && Math.abs(Math.sin(e.walk)) > 0.98 && !e.stepLatch) { e.stepLatch = true; if (dist < 45) { sfx('stomp'); shake(clamp(0.5 - dist / 90, 0, 0.3)); } } else if (Math.abs(Math.sin(e.walk)) < 0.5) e.stepLatch = false; }
    if (u.gun && u.head && e.mode !== 'speech') { const pit = e.alert && e.stun <= 0 ? clamp(Math.atan2(P.pos.y - e.pos.y, dist), -0.5, 0.6) : 0; u.gun.rotation.x += (-pit - u.gun.rotation.x) * Math.min(1, dt * 8); u.head.rotation.x = u.gun.rotation.x * 0.6; u.head.rotation.y = e.alert ? 0 : Math.sin(e.t * 0.5 + e.walk) * 0.5; }
    if (u.cape0) { const a = u.cape.geometry.attributes.position, c0 = u.cape0; for (let k = 0; k < a.count; k++) { const y = c0[k * 3 + 1]; a.setZ(k, Math.sin(y * 5 + e.t * 7 + c0[k * 3] * 2) * 0.07 * -y - moving * 0.03 * y * y); } a.needsUpdate = true; }
    if (u.rotors) { for (const r of u.rotors) r.rotation.y += dt * 40; e.mesh.rotation.z = Math.sin(e.t * 2) * 0.08; }
    if (e.hp < e.max || e.stun > 0) {
      e.bar.visible = !d.boss; e.bar.position.set(e.pos.x, e.pos.y + d.h * (d.scale || 1) + (d.fly ? 0.5 : 0.25), e.pos.z); e.bar.quaternion.copy(camera.quaternion);
      const k = clamp(e.hp / e.max, 0, 1); e.fill.scale.x = e.barW * k; e.fill.position.x = -e.barW * (1 - k) / 2;
      const sc = clamp(dist / 14, 0.7, 2.4); e.bar.scale.setScalar(sc);
    }
    if (d.boss && e.alert) bossBar(e);
  }
}
