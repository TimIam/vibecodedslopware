// HITPLAYERSPRITE (seg 3 +0x36ee): what happens when Harry (p) touches another sprite (o).
// Called from CheckPlayerCollision for every live sprite overlapping the player (pos-based rects).

import { G, Prefs } from './state.js';
import { w16, sectRect, setRect } from '../core/util.js';
import { regionBounce } from './masks.js';
import { Tiles } from './tiles.js';
import { PlayerFaces } from './player.js';
import { S, playRegSound, isPlaying, stopSound } from './sound.js';
import { Hooks, register } from './hooks.js';

const PHOT = [22, 22, 42, 42]; // g_70b0 player hot rect
const sc = (v, b) => (v * b) >> 8;
const kickRect = (p) => {
  const k = PlayerFaces.kickRects[p.dir];
  return [p.posV + k[0], p.posH + k[1], p.posV + k[2], p.posH + k[3]];
};
const posRect = (o) => [o.posV + o.hot[0], o.posH + o.hot[1], o.posV + o.hot[2], o.posH + o.hot[3]];
const whereRect = (o) => [o.v + o.hot[0], o.h + o.hot[1], o.v + o.hot[2], o.h + o.hot[3]];
const is = (o, name) => o.task === Hooks[name];
const mulT = (v, k) => w16(Math.trunc(v * k));

function talkSound(id) {
  if (!isPlaying(G.talkRef) && !isPlaying(G.talkRef2)) G.talkRef = playRegSound(S(id), 10, 256);
}

export function hitPlayerSprite(p, o) {
  if (p.f92 || o.f92) return;
  const kicking = p.hot[1] === 0;

  if (is(o, 'handleRampSprite')) {
    if (p.f8e === 0 && !kicking) Hooks.handleRampCollision(p, 32, PHOT, o, S(209));
    return;
  }
  if (is(o, 'handleStairsSprite')) {
    if (p.f8e === 0) Hooks.handleStairsCollision(p, 32, PHOT, o);
    return;
  }
  if (is(o, 'handleDeskSprite')) {
    p.h = p.fixH >> 8; p.v = p.fixV >> 8;
    const mask = o.kind < 310 ? Hooks.deskMask(0) : Hooks.deskMask(1);
    if (regionBounce(p, o.posV, o.posH, Tiles.harryMask, mask)) {
      const cx = p.h + 32, cy = p.v + 32;
      const d4 = o.h, d6 = o.h + 32 + (o.kind < 310 ? 32 : 0);
      const d5 = o.v, d3 = o.v + 32 + (o.kind > 310 ? 32 : 0);
      if (d4 <= cx && d6 >= cx) { p.f50 = mulT(p.f50, 0.5); p.f4e = mulT(p.f4e, -0.5); }
      else if (d5 > cy || d3 < cy) { p.f50 = mulT(p.f50, -0.5); p.f4e = mulT(p.f4e, -0.5); }
      else { p.f50 = mulT(p.f50, -0.5); p.f4e = mulT(p.f4e, 0.5); }
      p.fixH = p.h << 8; p.fixV = p.v << 8;
    } else if (kicking) {
      const kr = [p.v + PlayerFaces.kickRects[p.dir][0], p.h + PlayerFaces.kickRects[p.dir][1],
        p.v + PlayerFaces.kickRects[p.dir][2], p.h + PlayerFaces.kickRects[p.dir][3]];
      if (sectRect(kr, whereRect(o))) G.kickHit = 256;
    }
    return;
  }
  if (is(o, 'handleGrateSprite') && o.f72 > -100) {
    const b = G.bounciness;
    if (o.kind === 3900 || o.kind === 3910) {
      if (p.posV + 32 > o.v + o.hot[0] + 3) {
        const lim = o.posV + o.hot[2] - PHOT[0];
        if (p.posV < lim) { p.posV = lim; p.f4e = w16(-sc(p.f4e, b)); p.f50 = w16(sc(p.f50, b)); p.fixV = p.posV << 8; }
      } else {
        const lim = o.posV + o.hot[0] - PHOT[2];
        if (p.posV > lim) { p.posV = lim; p.f4e = w16(-sc(p.f4e, b)); p.f50 = w16(sc(p.f50, b)); p.fixV = p.posV << 8; }
      }
    } else if (o.kind === 3905 || o.kind === 3915) {
      if (p.posH + 32 > o.h + o.hot[1] + 3) {
        const lim = o.posH + o.hot[3] - PHOT[1];
        if (p.posH < lim) { p.posH = lim; p.f4e = w16(sc(p.f4e, b)); p.f50 = w16(-sc(p.f50, b)); p.fixH = p.posH << 8; }
      } else {
        const lim = o.posH + o.hot[1] - PHOT[3];
        if (p.posH > lim) { p.posH = lim; p.f4e = w16(sc(p.f4e, b)); p.f50 = w16(-sc(p.f50, b)); p.fixH = p.posH << 8; }
      }
    }
    if (kicking && sectRect(kickRect(p), o.hot2)) {
      G.kickHit = 256;
      o.f72--;
      playRegSound(S(4702), 15, 256);
    }
    return;
  }
  if (is(o, 'handleDoorSprite')) {
    // the side a kick opens the door from (same hinge points as the kick test below)
    const onOpeningSide = (d) => {
      const cx = G.playerH + 32, cy = G.playerV + 32;
      switch (d.kind) {
        case 901: case 903: return cy > d.v + 35;
        case 911: case 913: return cy < d.v + 17;
        case 921: case 923: return cx > d.h + 34;
        case 931: case 933: return cx < d.h + 5;
      }
      return false;
    };
    if (o.kind === 902 || o.kind === 912 || o.kind === 922 || o.kind === 932) return;
    const lv = G.level;
    const locked = o.kind === 903 || o.kind === 913 || o.kind === 923 || o.kind === 933;
    const keyId = () => 11399 - lv.w(lv.objOff(o.param) + 4);
    const curId = () => (G.inventory[G.curItem] || { id: -1 }).id;
    if (!kicking) {
      let unlocked = !locked;
      if (locked) {
        if (curId() === keyId()) {
          playRegSound(S(240), 10, 256);
          Hooks.removeInvItem(G.curItem);
          o.kind -= 2;
          lv.setW(lv.objOff(o.param) + 2, lv.w(lv.objOff(o.param) + 2) - 2);
          o.f8a = 1;
          unlocked = true;
        } else if (G.g70a4 === 0) {
          G.g70a4 = 25;
          stopSound(G.lockRef);
          G.lockRef = playRegSound(S(205), 100, 256);
        }
      }
      // (web option) walking into an unlocked door from its opening side opens it, as a kick would
      if (Prefs.autoDoors && unlocked && o.dir === 0 && onOpeningSide(o)) {
        o.dir++;
        playRegSound(S(204), 10, 256);
      }
      Hooks.doorSeparate(p, o);
      p.f50 = w16(-sc(p.f50, G.bounciness));
      p.f4e = w16(-sc(p.f4e, G.bounciness));
      return;
    }
    // kicking a door: open it when kicked from the correct side
    let open = false, kickBack = false, sound = false;
    const cx = G.playerH + 32, cy = G.playerV + 32;
    let hx = 0, hy = 0;
    // (the original leaves the hinge uninitialised for locked doors; use the unlocked twin's)
    switch (locked ? o.kind - 2 : o.kind) {
      case 901: hx = o.h + 30; hy = o.v + 35; break;
      case 911: hx = o.h + 31; hy = o.v + 17; break;
      case 921: hx = o.h + 34; hy = o.v + 19; break;
      case 931: hx = o.h + 5; hy = o.v + 18; break;
    }
    const d = p.dir;
    switch (o.kind) {
      case 901: case 903:
        if (cy > hy) { if (d > 0 && d < 18) { open = true; sound = true; } }
        else if (d > 18 && d < 35) { kickBack = true; sound = true; }
        break;
      case 911: case 913:
        if (cy < hy) { if (d > 18 && d < 35) { open = true; sound = true; } }
        else if (d > 0 && d < 18) { kickBack = true; sound = true; }
        break;
      case 921: case 923:
        if (cx > hx) { if (d > 9 && d < 27) { open = true; sound = true; } }
        else if (d < 9 || d > 27) { kickBack = true; sound = true; }
        break;
      case 931: case 933:
        if (cx < hx) { if (d < 9 || d > 27) { open = true; sound = true; } }
        else if (d > 9 && d < 27) { kickBack = true; sound = true; }
        break;
    }
    if (locked) {
      if (curId() !== keyId()) open = false;
      else {
        playRegSound(S(240), 10, 256);
        Hooks.removeInvItem(G.curItem);
        o.kind -= 2;
        lv.setW(lv.objOff(o.param) + 2, lv.w(lv.objOff(o.param) + 2) - 2);
      }
    }
    if (kickBack) G.kickHit = 256;
    if (open) { G.kickHit = 0; G.g70bf = 1; o.dir++; } // starts the opening animation
    if (!open && !kickBack) {
      setRect(p.hot, 22, 22, 42, 42);
      Hooks.rectSeparate(p, o);
      // (original intended to restore the kick rect here but tested an address, never true)
    }
    if (sound) playRegSound(S(204), 10, 256);
    return;
  }
  if (is(o, 'handleSlidingDoorSprite')) {
    Hooks.rectBounce(p, o, 32, G.bounciness, PHOT);
    return;
  }
  if (is(o, 'handleEnemyShotSprite') && p.f8e === 0) {
    const k = o.kind;
    const push = (sh) => { p.f50 = w16(p.f50 + (o.f50 >> sh)); p.f4e = w16(p.f4e + (o.f4e >> sh)); };
    if (k < 1100) {
      o.f92 = 1;
      if (G.tHurt) return;
      G.tHurt = 3; Hooks.ouch(); G.comfortDelta -= 12; push(4);
    } else if (k >= 2001 && k < 3000) {
      o.f92 = 1;
      if (G.tHurt) return;
      if (k === 2281) { G.tHurt = 5; Hooks.ouch(); G.g46c0 -= 4; push(5); }
      else if (k === 2291) { G.tHurt = 5; Hooks.ouch(); G.comfortDelta -= 7; push(5); }
      else { G.tHurt = 3; Hooks.ouch(); G.comfortDelta -= 4; push(5); }
    } else if (k === 9610) {
      if (G.tHurt) return;
      G.tHurt = 12; Hooks.ouch(); G.comfortDelta -= 7; push(2);
    } else if (k === 9450) {
      o.f92 = 1;
      if (G.tHurt) return;
      G.tHurt = 12; Hooks.ouch(); playRegSound(S(251), 10, 256); G.comfortDelta -= 10; push(2);
    } else if (k > 1100 && k < 1300) {
      if (o.f74) return;
      o.f74 = -16; Hooks.ouch(); G.comfortDelta -= 10; push(4);
    } else {
      o.f92 = 1;
      if (G.tHurt) return;
      G.tHurt = 12;
      playRegSound(S(k === 9450 ? 251 : 223), 10, 256);
      G.comfortDelta -= 10; push(4);
    }
    return;
  }
  if (is(o, 'handleBlobSprite')) {
    if (p.f8e !== 0 || G.tHurt) return;
    playRegSound(S(224), 10, 256);
    if (o.kind < 1711) { G.comfortDelta -= 6; G.tHurt = 6; }
    else { G.comfortDelta -= 9; G.tHurt = 12; }
    return;
  }
  if (is(o, 'handleRobotSprite') || is(o, 'handleBossSprite')) {
    if (p.f8e === 0 && !kicking) Hooks.rectBounce(p, o, 32, G.bounciness >> 1, PHOT);
    return;
  }
  if (is(o, 'handleReversorSprite')) {
    if (p.f8e !== 0 || G.tHurt) return;
    G.comfortDelta -= 8; Hooks.ouch(); G.tHurt = 12;
    return;
  }
  if (is(o, 'handleMailGuySprite')) {
    if (G.g70a0 || o.dir !== 0) return;
    G.g70a0 = 18; Hooks.ouch(); G.comfortDelta -= 10;
    p.f50 = w16(p.f50 + (o.f50 << 7)); p.f4e = w16(p.f4e + (o.f4e << 7));
    return;
  }
  if (is(o, 'handleBoulderSprite')) {
    if (p.f8e !== 0) return;
    if (!kicking) {
      if (G.g70a2) return;
      G.g70a2 = 32;
      playRegSound(S(224), 10, 256);
      G.comfortDelta -= 18;
      p.f50 = 0; p.f4e = 0;
    } else if (sectRect(kickRect(p), posRect(o))) G.kickHit = 256;
    return;
  }
  const collider = is(o, 'handleColliderSprite');
  if ((collider && o.kind !== 3100 && o.kind !== 3101) || is(o, 'handleDartEnemySprite') ||
      is(o, 'handleScientistSprite') || is(o, 'handleCoWorkerSprite')) {
    if (p.f8e !== 0) return;
    if (G.g70be) return;
    Hooks.rectBounce(p, o, 32, G.bounciness, PHOT);
    G.g70be = 1;
    if (collider && o.kind === 9800) {             // incinerator: feed it stacks of papers
      if (G.curItem === -1) return;
      if (G.inventory[G.curItem].id !== 11199) return;
      Hooks.removeInvItem(G.curItem);
      o.f74++;
      G.score += 5000;
    } else if (collider && o.kind === 9600) {      // vending machine
      if (kicking) return;
      if (!sectRect(kickRect(p), posRect(o))) return;
      if (p.posV + 32 > o.posV + ((o.hot[0] + o.hot[2]) >> 1)) { if (!o.f74) o.f74 = 3; }
      else G.kickHit = 256;
    } else if (collider && (o.kind === 9200 || o.kind === 9199)) { // copying machine
      if (kicking) return;
      if (sectRect(kickRect(p), posRect(o))) G.kickHit = 256;
    }
    return;
  }
  if (is(o, 'handleHazardSprite')) return;
  if (is(o, 'handleBonusSprite')) {
    if (p.f8e !== 0) return;
    if (o.kind < 711) {
      if (G.comfort >= 0x90) {
        if (!G.g70aa) { G.g70aa = 200; Hooks.haltTalkingSounds(); playRegSound(S(218), 10, 256); }
        return;
      }
      o.f92 = 1;
      if (o.kind === 700 || o.kind === 701) { talkSound(210); G.comfort += 10; }
      else if (o.kind === 702) { talkSound(212); G.comfort += 20; }
      else if (o.kind === 703) { talkSound(211); G.comfort += 8; }
      return;
    }
    const ammo = { 711: 'ammoStaple', 712: 'ammoBadass', 713: 'ammoShrapnel' }[o.kind];
    if (!ammo) return;
    if (G[ammo] < 100) {
      Hooks.haltTalkingSounds(); playRegSound(S(216), 10, 256);
      G[ammo] += 20; o.f92 = 1;
    } else if (!G.g70aa) {
      G.g70aa = 200; Hooks.haltTalkingSounds(); playRegSound(S(219), 10, 256);
    }
    return;
  }
  if (is(o, 'handleItemSprite')) {
    if (p.f8e !== 0) return;
    let have = false, get = true;
    for (let i = 0; i < 12; i++) if (G.inventory[i].id === o.kind) have = true;
    const gun = { 11299: 'ammoStaple', 11599: 'ammoBadass', 11799: 'ammoShrapnel' }[o.kind];
    if (gun) {
      o.f92 = 1; get = !have;
      G[gun] = Math.min(100, G[gun] + 50);
    }
    if (!get) return;
    if (Hooks.getInvItem(o.kind)) { o.f92 = 1; playRegSound(S(214), 10, 256); }
    return;
  }
  if (is(o, 'handleCustomSprite')) {
    if (p.f8e !== 0) return;
    const lv = G.level, base = 0x11000 + o.param * 0x34;
    if (lv.w(base + 0xe) !== 3) return;
    let need = Math.abs(lv.w(base + 0x14));
    const cur = (G.inventory[G.curItem] || { id: -1 }).id;
    if (need === cur || need === 0) {
      if (lv.w(base + 0x14) > 0) Hooks.removeInvItem(G.curItem);
      G.curLevel++;
    }
    p.fixH -= p.f50; p.fixV -= p.f4e;
    p.f50 = mulT(p.f50, -0.45); p.f4e = mulT(p.f4e, -0.45);
    return;
  }
  if (is(o, 'handleEffectSprite')) {
    if (p.f8e !== 0) return;
    if (o.f7c >= 4200) {
      if (o.dir > 6 && o.dir < 25 && !G.tHurt) {
        G.comfortDelta -= 10; G.tHurt = 15; o.f6e = 3; Hooks.ouch();
      }
      return;
    }
    Hooks.handleExplodeRadius(p, 32, o);
    if (!G.tHurt && o.dir > 5 && o.dir < 20) { G.comfortDelta -= 8; G.tHurt = 15; Hooks.ouch(); }
    return;
  }
  if (is(o, 'handleGhostSprite')) {
    if (p.f8e !== 0 || G.tHurt || o.f6e !== 2 || kicking) return;
    G.comfortDelta -= 7; G.tHurt = 12;
    playRegSound(S(224), 10, 256);
  }
}

register({ hitPlayerSprite });
