// Colliders (seg 3 +0x1034e..0x11950): static machines with behaviour.
//   2301..2304 fans that blow sprites away (record +4 = range, +6 = strength)
//   2001       small block
//   3100/3101  telephone: rings now and then; touching it while it rings shows a "phone words" balloon
//   9200/9199  copier: save the game (9199 = already used)
//   9300       metal detector: blasts Harry back if he carries ammo
//   9401..9431 wall shooters (up/down/right/left), gated by another record's switch (+4 = record index,
//              negative inverts; own +6 != 0 = always on)
//   9600       vending machine (+4 kicks until a delivery, +6 cans in stock); kicked via HITPLAYERSPRITE
//   9800       incinerator (burns away once used, see HITPLAYERSPRITE)

import { G } from '../state.js';
import { setRect } from '../../core/util.js';
import { SATNewSprite, SATRand, SAT } from '../../core/sat.js';
import { load1EncFaceFromCicn } from '../../core/res.js';
import { S, playRegSound, play3DSound, isPlaying } from '../sound.js';
import { Hooks, register } from '../hooks.js';

const F = { incinerator: null, vending: null, vendingShake: null, phone: null, phoneOff: null, copier: null,
  detector: null, shooters: [], fans: [], fanOverlays: [] };

const lv = () => G.level;
const recOk = (s) => s.param >= 0 && s.param <= 255;
const recW = (s, off) => lv().w(lv().objOff(s.param) + off);
const setRecW = (s, off, v) => lv().setW(lv().objOff(s.param) + off, v);
const sound3D = (s, id, prio = 10, vol = 256) => { const c = Hooks.spriteCenter(s); return play3DSound(S(id), prio, vol, c.v, c.h); };

// ---------------------------------------------------------------- draw procs
// VENDINGDRAWPROC: an empty machine (no cans left) is tinted
function vendingDrawProc(face, s, blit) {
  if (s.f78 === 1 && recW(s, 6) <= 0) { blit(1, 6); s.f78 = 1; s.f8a = 1; return; }
  blit(0, 0);
  s.f78 = 1;
}
// COPIERDRAWPROC: a used copier is tinted
function copierDrawProc(face, s, blit) {
  if (s.kind !== 9200) blit(1, 6); else blit(0, 0);
}
// ACDRAWPROC: fan body, then the static grille on the blowing side
function acDrawProc(face, s, blit) {
  blit(0, 0);
  const i = s.kind - 2301;
  const ov = F.fanOverlays[i];
  if (!ov) return;
  if (i === 0) blit(0, 0, ov, 0, 0);
  else if (i === 1) blit(0, 0, ov, 24, 0);
  else if (i === 2) blit(0, 0, ov, 0, 0);
  else if (i === 3) blit(0, 0, ov, 0, 24);
}

export function initColliderSprite() {
  F.incinerator = load1EncFaceFromCicn(9800, false, 1901);
  F.vending = load1EncFaceFromCicn(9600, false, 1902);
  F.vendingShake = load1EncFaceFromCicn(9601, false, 1903);
  F.phone = load1EncFaceFromCicn(3100, false, 1904);
  F.phoneOff = load1EncFaceFromCicn(3101, false, 1905);
  F.copier = load1EncFaceFromCicn(9200, false, 1906);
  if (F.copier) F.copier.drawProc = copierDrawProc;
  F.detector = load1EncFaceFromCicn(9300, false, 1907);
  [9401, 9411, 9421, 9431].forEach((id, i) => { F.shooters[i] = load1EncFaceFromCicn(id, false, 1908 + i); });
  if (F.vending) F.vending.drawProc = vendingDrawProc;
  if (F.vendingShake) F.vendingShake.drawProc = vendingDrawProc;
  for (let i = 0; i < 4; i++) {
    F.fans[i] = load1EncFaceFromCicn(2301 + i, false, 1921 + i);
    if (F.fans[i]) F.fans[i].drawProc = acDrawProc;
  }
  for (let i = 0; i < 4; i++) F.fanOverlays[i] = load1EncFaceFromCicn(2305 + i, false, 1931 + i);
}

export function setupColliderSprite(s) {
  Hooks.initSprite(s);
  s.dir = 0;
  s.task = handleColliderSprite;
  s.hit = hitColliderSprite;
  s.tileHit = null;
  s.f74 = 0;
  s.layer = 5;
  s.f72 = 5;
  setRect(s.hot, 0, 0, 0, 0);
  s.behind = 0;
  s.f78 = -1;
  const k = s.kind;
  if (k === 1019) setRect(s.hot, 8, 0, 12, 32);
  else if (k === 1029) setRect(s.hot, 24, 0, 20, 32);   // (empty rect in the original)
  else if (k === 1039) setRect(s.hot, 0, 24, 12, 20);   // (empty rect in the original)
  else if (k === 1049) setRect(s.hot, 0, 8, 32, 12);
  else if (k === 2001) setRect(s.hot, 2, 2, 14, 14);
  else if (k >= 2301 && k <= 2304) {
    setRect(s.hot, 4, 4, 28, 28);
    s.behind = 1;
    s.eface = F.fans[0];
    s.f6e = -69; // range/strength not read yet
    s.f78 = -1;
  } else if (k === 3100) {
    s.eface = F.phoneOff;
    s.behind = 0;
    setRect(s.hot, -18, -18, 34, 34);
    s.f74 = -100 - SATRand(100);
  } else if (k === 9199 || k === 9200) {
    s.eface = F.copier;
    s.behind = 1;
    setRect(s.hot, 12, 0, 40, 30);
  } else if (k === 9300) {
    s.eface = F.detector;
    setRect(s.hot, 1, 1, 22, 22);
  } else if (k === 9401 || k === 9411 || k === 9421 || k === 9431) {
    s.eface = F.shooters[(k - 9401) / 10];
    s.behind = 0;
    setRect(s.hot, 2, 2, 14, 14);
    s.f74 = SATRand(30);
  } else if (k === 9600) {
    setRect(s.hot, 0, 4, 32, 30);
    s.eface = F.vending;
    s.behind = 1;
  } else if (k === 9800) {
    setRect(s.hot, 8, 0, 56, 64);
    s.eface = F.incinerator;
    s.behind = 1;
  }
  s.posH = s.h; s.posV = s.v;
}

// HandleRepulsions(fan): push sprites inside the fan's 90 degree cone, stronger when closer
const BLOWN = ['handlePlayerSprite', 'handlePlayerShotSprite', 'handleEnemyShotSprite', 'handleBarrelSprite',
  'handleBlobSprite', 'handleGhostSprite', 'handlePlantSprite', 'handleChairSprite', 'handleReversorSprite',
  'handleRobotSprite'];
function handleRepulsions(fan) {
  const ch = fan.posH + 16, cv = fan.posV + 16;
  for (let o = SAT.head; o; o = o.next) {
    if (!BLOWN.some((n) => o.task === Hooks[n])) continue;
    const oc = Hooks.spriteCenter(o);
    const push = (dist) => (fan.f74 * (fan.f6e - dist)) >> 8;
    switch (fan.kind) {
      case 2301:
        if (oc.v < cv) { const across = Math.abs(ch - oc.h), d = cv - oc.v; if (across < d && d < fan.f6e) o.f4e -= push(d); }
        break;
      case 2302:
        if (oc.v > cv) { const across = Math.abs(ch - oc.h), d = oc.v - cv; if (across < d && d < fan.f6e) o.f4e += push(d); }
        break;
      case 2303:
        if (oc.h < ch) { const across = Math.abs(cv - oc.v), d = ch - oc.h; if (across < d && d < fan.f6e) o.f50 -= push(d); }
        break;
      case 2304:
        if (oc.h > ch) { const across = Math.abs(cv - oc.v), d = oc.h - ch; if (across < d && d < fan.f6e) o.f50 += push(d); }
        break;
    }
    o.f4e = (o.f4e << 16) >> 16; o.f50 = (o.f50 << 16) >> 16;
  }
}

const SHOOTER = { // h offset, v offset, vh, vv
  9401: [2, -12, 0, -1500], 9411: [2, 8, 0, 1500], 9421: [12, 2, 1500, 0], 9431: [-12, 2, -1500, 0],
};

export function handleColliderSprite(s) {
  if (s.f92) return;
  const k = s.kind;
  if (k >= 2301 && k <= 2304) {
    if (Math.abs(s.posH - G.playerH) < 448 && Math.abs(s.posV - G.playerV) < 448) {
      if (s.f6e === -69 && recOk(s)) {
        s.f6e = recW(s, 4) || 125;
        s.f74 = recW(s, 6) || 256;
      }
      if (!isPlaying(S(1303))) s.f78 = sound3D(s, 1303, 1, 0x55);
      if (++s.dir > 3) s.dir = 0;
      s.eface = F.fans[s.dir];
      handleRepulsions(s);
    }
  } else if (k === 3100) {
    if (s.f74 < 0) {
      if (++s.f74 === 0) s.f74 = (SATRand(3) + 1) * 90;
    } else if (s.f74 > 0) {
      if (s.f74 === 90 || s.f74 === 180 || s.f74 === 270) sound3D(s, 301);
      const t = s.f74;
      if ((t > 60 && t < 90) || (t > 150 && t < 180) || (t > 240 && t < 270)) {
        if (t & 2) s.eface = s.eface === F.phone ? F.phoneOff : F.phone;
      } else s.eface = F.phoneOff;
      if (--s.f74 === 0) s.f74 = -100 - SATRand(200);
    }
  } else if (k === 3101) {
    s.eface = F.phoneOff;
  } else if (k === 9200) {
    if (s.f74 > 0) s.f74--;
  } else if (k === 9300) {
    if (Math.abs(G.playerH + 32 - (s.posH + 12)) < 96 && G.playerV + 32 < s.posV + 12 &&
        (G.ammoStaple || G.ammoBadass || G.ammoShrapnel)) {
      if (!G.geea) {
        sound3D(s, 602);
        G.player.f4e = 2500;
        G.geea = 2;
        if (!G.caffeine) G.comfort -= 5;
      } else if (G.geea > 0) G.geea--;
    }
  } else if (k > 9400 && k < 9450) {
    if (!recOk(s)) return;
    const link = recW(s, 4);
    const idx = Math.abs(link);
    if (s.f74 > 0) s.f74--;
    const linked = lv().w(lv().objOff(idx) + 6);
    const on = link >= 0 ? linked === 0 : linked !== 0;
    if ((on || recW(s, 6) !== 0) && s.f74 === 0 && SHOOTER[k]) {
      const [dh, dv, vh, vv] = SHOOTER[k];
      play3DSound(S(250), 10, 256, s.posV, s.posH);
      const shot = SATNewSprite(9450, s.posH + dh, s.posV + dv, Hooks.setupEnemyShotSprite);
      shot.f50 = vh; shot.f4e = vv;
      s.f74 = 60;
    }
  }
  // vending machine: stock up once
  if (s.dir === 0 && k === 9600) {
    if (recOk(s)) {
      if (!recW(s, 4)) setRecW(s, 4, SATRand(3) + 2);
      if (!recW(s, 6)) setRecW(s, 6, SATRand(3) + 2);
    }
    s.dir = 1;
  }
  if (k === 9800 && s.f74 > 0) {
    s.hit = null;
    if (s.f74 === 3) playRegSound(S(700), 200, 256);
    s.posV--;
    if (++s.f74 > 64) s.f92 = 1;
    return;
  }
  if (k !== 9600) return;
  if (s.f74 > 0) {
    if (s.f74 === 3) {
      if (recW(s, 4) > 0) setRecW(s, 4, recW(s, 4) - 1);
      if (recW(s, 4) === 0) {
        if (recW(s, 6) > 0) {
          sound3D(s, 1302);
          if (recOk(s) && !recW(s, 4)) setRecW(s, 4, SATRand(3) + 2);
          s.f74 = -25;
          setRecW(s, 6, recW(s, 6) - 1);
          if (recW(s, 6) === 0) setRecW(s, 6, -1);
        } else sound3D(s, 1301);
      } else sound3D(s, 1301);
    }
    s.eface = F.vendingShake;
    s.f74--;
  } else if (s.f74 < 0) {
    if (++s.f74 === 0) { // out comes a soda can
      const can = SATNewSprite(9610, s.posH + 12, s.posV + 28, Hooks.setupEnemyShotSprite);
      can.f4e = SATRand(800) + 1500;
      can.f50 = SATRand(2000) - 1000;
    }
  } else s.eface = F.vending;
}

export function hitColliderSprite(me, o) {
  if (me.f92 || o.f92) return;
  if (o.task === Hooks.handlePlayerSprite && me.kind === 9200 && me.f74 === 0) {
    if (recOk(me)) setRecW(me, 2, 9199);
    Hooks.queueModal(async () => {
      const saved = Hooks.copierSave ? await Hooks.copierSave() : false;
      if (!saved) {
        if (recOk(me)) lv().setB(lv().objOff(me.param), 1);
        me.f74 = 300;
      } else {
        setRecW(me, 2, 9199);
        me.kind = 9199;
      }
    });
    me.f74 = 1; // (keeps the modal from being queued twice before it runs)
    return;
  }
  if (o.task === Hooks.handlePlayerSprite && me.kind === 3100 && me.eface === F.phone) {
    if (Hooks.showBalloon(me, Hooks.generatePhonewords(), 5)) me.kind = 3101;
  }
}

register({ initColliderSprite, setupColliderSprite, handleColliderSprite });
