// You: the Groundskeeper. Movement, the three Returners, claws, Blink, the Stern Look, and your arms on screen.

import * as THREE from 'three';
import { S, clamp, lerp, rand, hasSkill } from './state.js';
import { fire, beamHits } from './proj.js';
import { burst, ring, beam, flash, shake, shakeAmt } from './fx.js';
import { sfx } from './audio.js';
import { damageEnemy, stunCone, returnEnemy } from './enemies.js';
import { damageTarget, bark, onPlayerDown } from './mission.js';
import { damageFrom, toast } from './ui.js';
import { buildArms } from './arms.js';
import { lens } from './post.js';   // toast: the molt notice

export const WEAPONS = [
  { id: 'thorn', name: 'Thorn', sub: 'Standard Returner. Quick and polite.' },
  { id: 'chorus', name: 'Chorus', sub: 'Hold to sing, release to send. Passes through guests.' },
  { id: 'spore', name: 'Spore Pod', sub: 'Lobbed. Returns whole committees.' },
];

export const SKILLS = [
  { id: 'c_hp', tree: 'Carapace', name: 'Old Growth', text: '+30 health. You have had time to thicken.' },
  { id: 'c_regen', tree: 'Carapace', name: 'Patience', text: 'Shell starts mending sooner, and faster.' },
  { id: 'c_shell', tree: 'Carapace', name: 'Second Skin', text: '+30 shell.' },
  { id: 'c_molt', tree: 'Carapace', name: 'Molt', text: 'Once per outing, a killing blow instead sheds your skin: half health back and everyone nearby is stunned.' },
  { id: 'v_blink', tree: 'Voice', name: 'Shortcut', text: 'Blink recovers a third faster.' },
  { id: 'v_look', tree: 'Voice', name: 'Disappointment', text: 'The Stern Look reaches further and lingers.' },
  { id: 'v_echo', tree: 'Voice', name: 'Afterimage', text: 'Blinking leaves a stunning pulse where you were.' },
  { id: 'v_send', tree: 'Voice', name: 'Dismissed', text: 'The Stern Look returns any visitor already below 30% on the spot.' },
  { id: 'g_thorn', tree: 'Garden', name: 'Sharper Thorns', text: 'Thorn does 25% more.' },
  { id: 'g_chorus', tree: 'Garden', name: 'Fourth Voice', text: 'Chorus charges 40% faster and holds one more note.' },
  { id: 'g_spore', tree: 'Garden', name: 'Good Soil', text: 'One more Spore Pod, and a wider bloom.' },
  { id: 'g_feed', tree: 'Garden', name: 'Compost', text: 'Every visitor you return restores some shell and Thorn energy.' },
];

const P = S.P = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, alive: true, ghost: 0, sprinting: false,
  hp: 100, maxHp: 100, sh: 50, maxSh: 50, shDelay: 0, weapon: 0,
  thorn: 40, thornMax: 40, thornT: 0, tFire: 0,
  cells: 3, cellMax: 3, cellT: 0, charge: 0, charging: false,
  pods: 2, podMax: 2, podT: 0,
  cdBlink: 0, cdLook: 0, cdClaw: 0, molted: false,
  recoil: 0, bob: 0, swap: 0, clawT: 0, lookT: 0, fov: 80, hurtT: 0,
};
export { P };

let cam = null, vm = null, vmR = null, vmL = null, wModels = [], glowM = null, chargeM = null, vmFlash = null;
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3(), aim = new THREE.Vector3();

export function recompute() {
  P.maxHp = 100 + (hasSkill('c_hp') ? 30 : 0);
  P.maxSh = 50 + (hasSkill('c_shell') ? 30 : 0);
  P.cellMax = 3 + (hasSkill('g_chorus') ? 1 : 0);
  P.podMax = 2 + (hasSkill('g_spore') ? 1 : 0);
  P.blinkCd = hasSkill('v_blink') ? 3.4 : 5;
  P.lookCd = 12;
}

export function resetPlayer(x, z, yaw = 0) {
  recompute();
  P.pos.set(x, S.W.height(x, z), z); P.vel.set(0, 0, 0); P.yaw = yaw; P.pitch = 0; P.alive = true; P.ghost = 0;
  P.hp = P.maxHp; P.sh = P.maxSh; P.shDelay = 0; P.thorn = P.thornMax; P.cells = P.cellMax; P.pods = P.podMax;
  P.cdBlink = P.cdLook = P.cdClaw = 0; P.charge = 0; P.charging = false; P.hurtT = 0;
}
export function revivePlayer(x, z, yaw) { const m = P.molted; resetPlayer(x, z, yaw); P.molted = m; P.ghost = 2; }

// ------------------------------------------------------------------ arms and weapons on screen
export function initViewModel(camera) {
  cam = camera;
  ({ vm, vmR, vmL, wModels, glowM, chargeM, flash: vmFlash } = buildArms(camera));
}

// ------------------------------------------------------------------ hurt
export function damagePlayer(dmg, fromX, fromZ, o = {}) {
  if (!P.alive || P.ghost > 0 || S.mode !== 'mission') return;
  S.M.stats.taken += dmg;
  P.shDelay = hasSkill('c_regen') ? 2.2 : 3.6;
  if (P.sh > 0) { const a = Math.min(P.sh, dmg); P.sh -= a; dmg -= a; sfx('shield'); }
  if (dmg > 0) { P.hp -= dmg; sfx('hurt'); P.hurtT = 0.5; }
  shake(0.25 + dmg * 0.012);
  damageFrom(Math.atan2(fromX - P.pos.x, fromZ - P.pos.z) - (P.yaw + Math.PI));
  if (o.push) { const dx = P.pos.x - fromX, dz = P.pos.z - fromZ, l = Math.hypot(dx, dz) || 1; P.vel.x += dx / l * o.push; P.vel.z += dz / l * o.push; P.vel.y = Math.max(P.vel.y, 4); P.onGround = false; }
  if (o.by && !o.by.def?.machine && Math.random() < 0.1) bark('hitYou', o.by);
  if (P.hp <= 0) {
    if (hasSkill('c_molt') && !P.molted) {
      P.molted = true; P.hp = P.maxHp * 0.5; P.sh = P.maxSh; P.ghost = 1.2;
      toast('Molted. You leave the old skin standing there.', 'good'); sfx('look');
      ring(P.pos.x, P.pos.y, P.pos.z, 1, 12, 0x7ffff0, 0.6);
      stunCone(P.pos.x, P.pos.y + 2, P.pos.z, 0, 1, 12, -2, 3);
      return;
    }
    P.hp = 0; P.alive = false; P.charging = false; P.charge = 0;
    onPlayerDown(o.by);
  }
}

// ------------------------------------------------------------------ per-frame
function muzzlePoint(out) {
  cam.getWorldDirection(fwd); right.crossVectors(fwd, cam.up).normalize();
  return out.copy(cam.position).addScaledVector(fwd, 1.0).addScaledVector(right, 0.29).addScaledVector(cam.up, -0.26);
}
function aimDir(from, out) {
  const d = S.W.ray(cam.position.x, cam.position.y, cam.position.z, fwd.x, fwd.y, fwd.z, 140);
  aim.copy(cam.position).addScaledVector(fwd, Math.max(7, d));
  return out.copy(aim).sub(from).normalize();
}

export function updatePlayer(dt) {
  const I = S.I, W = S.W, sens = 0.0022 * S.save.opts.sens;
  P.yaw -= I.dx * sens; P.pitch = clamp(P.pitch - I.dy * sens, -1.5, 1.5);
  const sway = clamp(I.dx * 0.0006, -0.05, 0.05); I.dx = I.dy = 0;
  if (P.ghost > 0) P.ghost -= dt;
  P.cdBlink -= dt; P.cdLook -= dt; P.cdClaw -= dt; P.tFire -= dt; P.hurtT -= dt;

  if (P.alive) {
    // ---- walk
    const sn = Math.sin(P.yaw), cs = Math.cos(P.yaw);
    let wx = -sn * I.f + cs * I.r, wz = -cs * I.f - sn * I.r; const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    P.sprinting = I.sprint && I.f > 0 && !P.charging;
    const speed = P.charging ? 5 : P.sprinting ? 10.8 : 7.4, acc = (P.onGround ? 70 : 16) * dt;
    const tx = wx * speed, tz = wz * speed, ddx = tx - P.vel.x, ddz = tz - P.vel.z, dl = Math.hypot(ddx, ddz);
    if (dl > 0) { const k = Math.min(1, acc / dl); P.vel.x += ddx * k; P.vel.z += ddz * k; }
    if (I.jump && P.onGround) { P.vel.y = 8.8; P.onGround = false; }
    P.vel.y -= 24 * dt;
    P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt; P.pos.y += P.vel.y * dt;
    W.collide(P.pos, 0.6, P.pos.y, P.pos.y + 2.5);
    const gy = W.ground(P.pos.x, P.pos.z, P.pos.y);
    if (P.pos.y <= gy || (P.onGround && P.vel.y <= 0 && P.pos.y - gy < 0.6)) { if (!P.onGround && P.vel.y < -12) shake(0.25); P.pos.y = gy; P.vel.y = 0; P.onGround = true; }
    else P.onGround = false;

    // ---- shell and stores
    if ((P.shDelay -= dt) <= 0 && P.sh < P.maxSh) { const was = P.sh; P.sh = Math.min(P.maxSh, P.sh + (hasSkill('c_regen') ? 26 : 17) * (1 - 0.5 * W.haze) * dt); if (was === 0) sfx('shieldUp'); }
    if (P.sh >= P.maxSh && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + 5 * dt);   // with the shell whole, you mend
    if ((P.thornT += dt) > 0.55) P.thorn = Math.min(P.thornMax, P.thorn + 16 * dt);
    if (P.cells < P.cellMax && (P.cellT += dt) > 3) { P.cells++; P.cellT = 0; }
    if (P.pods < P.podMax && (P.podT += dt) > 4.5) { P.pods++; P.podT = 0; }

    // ---- weapons
    if (I.weapon >= 0 && I.weapon !== P.weapon && I.weapon < 3) { P.weapon = I.weapon; P.swap = 1; P.charging = false; P.charge = 0; for (const [i, w] of wModels.entries()) w.visible = i === P.weapon; sfx('ui'); }
    I.weapon = -1;
    cam.getWorldDirection(fwd);
    if (P.weapon === 0 && I.fire && P.tFire <= 0 && P.thorn >= 1) {
      P.tFire = 0.1; P.thorn -= 1; P.thornT = 0; P.recoil = 1;
      muzzlePoint(tmp); const d = aimDir(tmp, aim);
      fire({ x: tmp.x, y: tmp.y, z: tmp.z, dx: d.x + rand(-0.011, 0.011), dy: d.y + rand(-0.011, 0.011), dz: d.z + rand(-0.011, 0.011), speed: 150, dmg: 9 * (hasSkill('g_thorn') ? 1.25 : 1), owner: 'p', kind: 'thorn', color: 0x7ffff0, size: 0.07, len: 1.3, life: 1.6 });
      sfx('thorn'); S.M.stats.shots++;
    }
    if (P.weapon === 1) {
      if (I.fire && P.cells > 0) {
        if (!P.charging) { P.charging = true; P.charge = 0; }
        const was = P.charge; P.charge = Math.min(1, P.charge + dt / (hasSkill('g_chorus') ? 0.66 : 1.1));
        if (Math.floor(was * 8) !== Math.floor(P.charge * 8)) sfx('charge', P.charge);
      } else if (P.charging) {
        P.charging = false;
        if (P.charge > 0.2 && P.cells > 0) {
          P.cells--; P.cellT = 0; P.recoil = 2.2; shake(0.3 + P.charge * 0.4); lens.smear(0.25 + P.charge * 0.5);
          muzzlePoint(tmp); const d = aimDir(tmp, aim), dmg = lerp(34, 150, P.charge);
          const { wall, out } = beamHits(tmp.x, tmp.y, tmp.z, d.x, d.y, d.z, 130, 0.35);
          beam(tmp.x, tmp.y, tmp.z, tmp.x + d.x * wall, tmp.y + d.y * wall, tmp.z + d.z * wall, 0xc070ff, 0.14 + P.charge * 0.3, 0.35);
          flash(tmp.x + d.x * 2, tmp.y, tmp.z + d.z * 2, 0xc070ff, 80, 0.3);
          for (const h of out) { if (h.hit.isTarget) damageTarget(h.hit, dmg, { kind: 'chorus' }); else damageEnemy(h.hit, dmg, { kind: 'chorus', dx: d.x, dz: d.z, push: 4 * P.charge }); }
          burst(tmp.x + d.x * wall, tmp.y + d.y * wall, tmp.z + d.z * wall, { n: 14, color: 0xc070ff, speed: 6, size: 0.4, life: 0.4 });
          sfx('chorus', 0.5 + P.charge * 0.5); S.M.stats.shots++;
        }
        P.charge = 0;
      }
    }
    if (P.weapon === 2 && I.fire && P.tFire <= 0 && P.pods > 0) {
      P.tFire = 0.55; P.pods--; P.podT = 0; P.recoil = 1.8;
      muzzlePoint(tmp); const d = aimDir(tmp, aim);
      fire({ x: tmp.x, y: tmp.y, z: tmp.z, dx: d.x, dy: d.y + 0.1, dz: d.z, speed: 30, dmg: 85, owner: 'p', kind: 'spore', color: 0x8dffb0, size: 0.28, len: 0.3, grav: 15, aoe: hasSkill('g_spore') ? 8 : 6.6, life: 5 });
      sfx('spore'); S.M.stats.shots++;
    }

    // ---- claws
    if (I.alt && P.cdClaw <= 0) {
      P.cdClaw = 0.65; P.clawT = 0.35; sfx('claw');
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      for (const e of [...S.enemies]) { if (e.gone) continue; const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz); if (d < 3.8 + e.def.r && (d < 1.5 || (dx * fx + dz * fz) / d > 0.45) && Math.abs(e.pos.y - P.pos.y) < 4) damageEnemy(e, 55, { kind: 'claw', dx: fx, dz: fz, push: 10 }); }
      for (const t of [...S.targets]) { if (t.dead) continue; const dx = t.x - P.pos.x, dz = t.z - P.pos.z, d = Math.hypot(dx, dz); if (d < 3.6 + t.r && (dx * fx + dz * fz) / d > 0.3) damageTarget(t, 40, { kind: 'claw' }); }
    }
    I.alt = false;

    // ---- Blink
    if (I.blink && P.cdBlink <= 0) {
      P.cdBlink = P.blinkCd; P.ghost = 0.35; lens.smear(1);
      let bx = wx, bz = wz; if (Math.hypot(bx, bz) < 0.1) { bx = -sn; bz = -cs; } const bl = Math.hypot(bx, bz); bx /= bl; bz /= bl;
      const ox = P.pos.x, oy = P.pos.y, oz = P.pos.z;
      for (let i = 0; i < 22; i++) {
        const px = P.pos.x, pz = P.pos.z; P.pos.x += bx * 0.5; P.pos.z += bz * 0.5;
        W.collide(P.pos, 0.6, P.pos.y, P.pos.y + 2.5); P.pos.y = Math.max(P.pos.y, W.ground(P.pos.x, P.pos.z, P.pos.y));
        if (Math.hypot(P.pos.x - px, P.pos.z - pz) < 0.2) break;
        burst(P.pos.x, P.pos.y + 1.3, P.pos.z, { n: 2, color: 0x7ffff0, speed: 1, size: 0.4, life: 0.4, spread: 0.5 });
      }
      P.vel.x = bx * speed; P.vel.z = bz * speed; P.fov = 100;
      burst(ox, oy + 1.3, oz, { n: 24, color: 0x9fe8ff, speed: 3, size: 0.4, life: 0.5, spread: 0.6 });
      sfx('blink');
      if (hasSkill('v_echo')) { ring(ox, oy, oz, 1, 7, 0x7ffff0, 0.4); stunCone(ox, oy + 2, oz, 0, 1, 7, -2, 1.6); }
      const seen = S.enemies.find(e => e.alert && e.los && !e.def.machine && !e.gone);
      if (seen && Math.random() < 0.3) bark('blink', seen);
    }
    I.blink = false;

    // ---- the Stern Look
    if (I.look && P.cdLook <= 0) {
      P.cdLook = P.lookCd; P.lookT = 0.8; sfx('look'); shake(0.35); lens.ripple();
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), range = hasSkill('v_look') ? 23 : 16;
      ring(P.pos.x + fx * 2, P.pos.y, P.pos.z + fz * 2, 1, range * 0.8, 0xffe070, 0.5);
      for (let i = 0; i < 26; i++) { const a = rand(-0.7, 0.7), d = rand(2, range); burst(P.pos.x + (fx * Math.cos(a) - fz * Math.sin(a)) * d, P.pos.y + rand(0.5, 2.5), P.pos.z + (fz * Math.cos(a) + fx * Math.sin(a)) * d, { n: 1, color: 0xffe070, speed: 0.5, size: 0.45, life: 0.6 }); }
      const caught = [];
      const n = stunCone(P.pos.x, P.pos.y + 2.2, P.pos.z, fx, fz, range, 0.55, hasSkill('v_look') ? 3.8 : 2.6, e => caught.push(e));
      if (hasSkill('v_send')) for (const e of caught) if (!e.def.boss && e.hp < e.max * 0.3) returnEnemy(e);
      if (n) { const e = caught.find(c => !c.def.machine && !c.gone); if (e) bark('stunned', e, null, true); }
    }
    I.look = false;
  } else { P.vel.set(0, 0, 0); I.alt = I.blink = I.look = false; }

  // ---- camera
  const moving = Math.hypot(P.vel.x, P.vel.z);
  if (P.onGround) P.bob += moving * dt * 1.1;
  P.fov = lerp(P.fov, P.sprinting ? 87 : P.charging ? 74 : 80, Math.min(1, dt * 7));
  if (Math.abs(cam.fov - P.fov) > 0.05) { cam.fov = P.fov; cam.updateProjectionMatrix(); }
  const bobY = Math.sin(P.bob * 1.9) * 0.05 * clamp(moving / 7, 0, 1);
  cam.position.set(P.pos.x + rand(-1, 1) * shakeAmt * 0.12, P.pos.y + (P.alive ? 2.3 : 0.7) + bobY + rand(-1, 1) * shakeAmt * 0.12, P.pos.z);
  cam.rotation.set(P.pitch + rand(-1, 1) * shakeAmt * 0.012, P.yaw, (P.alive ? 0 : 0.6) + rand(-1, 1) * shakeAmt * 0.012, 'YXZ');
  cam.updateMatrixWorld();

  // ---- arms
  P.recoil = Math.max(0, P.recoil - dt * 9); P.swap = Math.max(0, P.swap - dt * 4); P.clawT = Math.max(0, P.clawT - dt); P.lookT = Math.max(0, P.lookT - dt);
  const ch = P.charging ? P.charge : 0;
  vmR.position.set(0.3 + Math.cos(P.bob * 0.95) * 0.012 * clamp(moving / 7, 0, 1) - sway + rand(-1, 1) * ch * 0.004, -0.3 + Math.abs(Math.sin(P.bob * 0.95)) * 0.014 * clamp(moving / 7, 0, 1) - P.swap * 0.3 - (P.sprinting ? 0.05 : 0) + rand(-1, 1) * ch * 0.004, -0.52 + P.recoil * 0.035);
  vmR.rotation.set(P.recoil * 0.05 - P.swap * 0.8 + (P.sprinting ? -0.12 : 0), sway * 2 + (P.sprinting ? 0.25 : 0), 0);
  const pulse = 0.6 + 0.4 * Math.sin(S.time * 3);
  glowM.color.setRGB(0.22, 1.0, 0.9).multiplyScalar((0.25 + 0.75 * P.thorn / P.thornMax) * (0.8 + 0.2 * pulse));
  chargeM.color.setRGB(0.9, 0.45, 1.5).multiplyScalar(P.cells > 0 ? 0.5 + ch * 2.2 : 0.12);
  wModels[1].userData.core.scale.setScalar(1 + ch * 1.6); wModels[1].userData.core.rotation.y += dt * (1 + ch * 14); wModels[1].userData.ring.rotation.x += dt * (0.6 + ch * 9); wModels[1].userData.ring.scale.setScalar(1 + ch * 0.8);
  wModels[2].userData.seeds.rotation.z += dt * 0.6; wModels[2].userData.seeds.visible = P.pods > 0;
  vmFlash.material.opacity = P.weapon === 0 ? Math.max(0, P.recoil - 0.4) * 1.2 : P.weapon === 1 ? ch * 0.9 : 0; vmFlash.position.z = P.weapon === 1 ? -0.42 : -0.62; vmFlash.material.color.set(P.weapon === 1 ? 0xc070ff : 0x9ffff0); vmFlash.scale.setScalar(P.weapon === 1 ? 0.25 + ch * 0.5 : 0.3 + P.recoil * 0.25);
  wModels[2].userData.core.scale.set(1, 1, 1.25).multiplyScalar(P.pods > 0 ? 1 + 0.05 * pulse : 0.45);
  if (P.clawT > 0) { const k = 1 - P.clawT / 0.35; vmL.position.set(-0.45 + k * 0.75, -0.2 - Math.abs(k - 0.5) * 0.25, -0.5); vmL.rotation.set(0.2, 0.9 - k * 1.8, 1.1); }
  else if (P.lookT > 0) { const k = Math.sin(clamp((0.8 - P.lookT) / 0.8, 0, 1) * Math.PI); vmL.position.set(-0.28, -0.7 + k * 0.5, -0.5); vmL.rotation.set(-1.1 * k, 0.2, 0.3); }
  else vmL.position.set(-0.5, -0.9, -0.3);
  vm.visible = P.alive;
}

export const lookDir = out => { cam.getWorldDirection(out); return out; };
