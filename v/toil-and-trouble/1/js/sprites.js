// sprites.js — every character and object is a little puppet of lit ellipses, capsules and polygons, rasterised
// once per animation frame by pix.js and cached. All sprites face right; the renderer mirrors them.
import { Painter, ramp, hex, mix, shadeCol } from './pix.js';

const cache = new Map();
function cached(key, make) {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
}
const R = (h, n = 5, s = 1) => ramp(h, n, s);
const SS = 4; // supersampling for the rendered look
const cloth = (h) => Object.assign(R(h), { spec: 0.1, shin: 7 });
const skin = (h) => Object.assign(R(h), { spec: 0.26, shin: 14 });
const metal = (h) => Object.assign(R(h, 6), { spec: 0.85, shin: 38, rim: 0.5 });
const gloss = (h) => Object.assign(R(h), { spec: 0.55, shin: 24 });

// ---------------------------------------------------------------------------------------------------------------
// palettes
const MAGS = {
  dress: cloth('#6b3fa3'), apron: cloth('#cdb68c'), skin: skin('#9ec777'), hair: cloth('#e3642c'), hat: cloth('#40306a'), band: gloss('#eba53e'),
  sockA: cloth('#8a58c0'), sockB: cloth('#2a1f36'), boot: gloss('#5e3c27'), patch: cloth('#7c9a4a'),
};
const PIP = {
  dress: cloth('#2fa39a'), apron: cloth('#f0e2b6'), skin: skin('#f3c49d'), hair: gloss('#f3d46c'), hat: cloth('#2e3c74'), band: gloss('#d85c80'),
  sockA: cloth('#f3d46c'), sockB: cloth('#2c1e34'), boot: gloss('#83402c'), patch: cloth('#f3d46c'),
};
const INK = hex('#170c1e'), WHITE = hex('#f8f4ea'), EYE = hex('#1a1022'), MOUTH = hex('#5a1e2a'), RED = hex('#d23a3a');

// rotation/translation helper for whole-body poses (rolls, blasts)
function xform(st) {
  const a = st.rot || 0, cs = Math.cos(a), sn = Math.sin(a), px = 0, py = st.pivot ?? -10;
  const ox = st.ox || 0, oy = st.bob || 0;
  const f = (x, y) => {
    if (!a) return [x + ox, y + oy];
    const dx = x - px, dy = y - py;
    return [px + dx * cs - dy * sn + ox, py + dx * sn + dy * cs + oy];
  };
  f.a = a;
  return f;
}

// ---------------------------------------------------------------------------------------------------------------
// pose parameters. Feet and hands are given relative to hip/shoulder; f is 0..1 through the cycle.
function poseOf(kind, pose, f) {
  const M = kind === 'mags';
  const st = {
    bob: 0, lean: 0, rot: 0, pivot: M ? -12 : -9, ox: 0,
    fA: [-2.5, 0], fB: [2.5, 0], hF: null, hB: null, hatBack: 0, braid: 0, eye: 'open', mouth: 'smile', crouch: 0, arms: 'down',
    look: 0, broom: false, legsHidden: false, hatOff: 0,
  };
  const ph = f * Math.PI * 2;
  switch (pose) {
    case 'idle': {
      st.bob = Math.sin(ph) > 0.3 ? -1 : 0; st.braid = Math.sin(ph) * 0.5;
      if (f > 0.9) st.eye = 'blink';
      st.hatBack = Math.sin(ph) * 0.6;
      break;
    }
    case 'walk': case 'run': case 'carryWalk': {
      const run = pose === 'run';
      const S = (run ? 5 : 3.6) * (M ? 1 : 0.8), lift = (run ? 3.2 : 2.2) * (M ? 1 : 0.8);
      st.fA = [Math.sin(ph) * S, -Math.max(0, Math.cos(ph)) * lift];
      st.fB = [Math.sin(ph + Math.PI) * S, -Math.max(0, Math.cos(ph + Math.PI)) * lift];
      st.bob = -Math.abs(Math.sin(ph)) * (run ? 1.5 : 1) + (run ? 0 : 0.5);
      st.lean = run ? 1.6 : 0.5;
      st.swing = Math.sin(ph) * (run ? 1 : 0.6);
      st.hatBack = run ? 2.5 : 1; st.braid = run ? 2 : 1;
      if (run) st.mouth = 'grin';
      if (pose === 'carryWalk') { st.arms = 'up'; st.lean = 0.2; }
      break;
    }
    case 'skid': st.fA = [4, 0]; st.fB = [-1, 0]; st.lean = -2; st.hatBack = -1.5; st.mouth = 'o'; st.arms = 'back'; break;
    case 'jump': case 'carryJump':
      st.fA = [2.5, -4]; st.fB = [-2, -1]; st.arms = pose === 'carryJump' ? 'up' : 'jump'; st.hatBack = 3; st.braid = 3; st.mouth = 'grin'; break;
    case 'fall': st.fA = [1.5, -1]; st.fB = [-2.5, 0.5]; st.arms = 'flail'; st.flail = Math.sin(ph) ; st.hatBack = -2; st.braid = -2; st.mouth = 'o'; break;
    case 'float': st.broom = true; st.bob = Math.sin(ph) * 1; st.hatBack = 2; st.braid = 2; st.mouth = 'grin'; break;
    case 'roll': st.rot = ph; st.ball = true; st.mouth = 'grin'; break;
    case 'blast': st.rot = 0; st.ball = true; st.mouth = 'grin'; st.rot = ph; break;
    case 'carryIdle': st.arms = 'up'; st.bob = Math.sin(ph) > 0 ? -0.5 : 0; break;
    case 'throw': st.arms = 'throw'; st.lean = 1.5; st.fA = [3, 0]; st.fB = [-2, 0]; st.mouth = 'grin'; break;
    case 'slap': {
      const k = f < 0.35 ? f / 0.35 : 1;
      st.arms = k < 1 ? 'up' : 'slap'; st.crouch = k < 1 ? -1 : 3; st.fA = [3.5, 0]; st.fB = [-3.5, 0]; st.mouth = k < 1 ? 'grin' : 'o'; st.hatBack = k < 1 ? -1 : 3;
      break;
    }
    case 'hurt': case 'dead':
      st.arms = 'flail'; st.flail = Math.sin(ph * 2); st.fA = [3, -3]; st.fB = [-3, -2]; st.eye = 'x'; st.mouth = 'o'; st.hatOff = 4; st.rot = pose === 'dead' ? Math.sin(ph) * 0.3 : 0;
      break;
    case 'victory': {
      const up = Math.sin(ph) > 0;
      st.arms = up ? 'cheer' : 'up'; st.bob = up ? -2 : 0; st.fA = up ? [2, -2] : [2.5, 0]; st.fB = up ? [-2, -1] : [-2.5, 0]; st.mouth = 'grin'; st.eye = up ? 'happy' : 'open';
      st.hatBack = up ? 2 : -1;
      break;
    }
    case 'cart': st.legsHidden = true; st.arms = 'rim'; st.hatBack = 3 + Math.sin(ph) * 1; st.braid = 3; st.mouth = 'grin'; st.bob = Math.sin(ph) > 0.5 ? -1 : 0; break;
    case 'ride': st.broom = true; st.bob = Math.sin(ph) * 1.2; st.hatBack = 1.5; st.braid = 1.5; st.mouth = 'grin'; break;
    case 'rideDash': st.broom = true; st.lean = 2.4; st.hatBack = 4; st.braid = 4; st.mouth = 'grin'; st.arms = 'rim'; break;
    case 'rideBack': st.broom = true; st.noStick = true; st.bob = Math.sin(ph) * 1.2; st.hatBack = 2; st.braid = 2; st.mouth = 'smile'; break;
    case 'flee': st.broom = true; st.mouth = 'o'; st.eye = 'x'; st.hatBack = 3; st.braid = 3; break;
    default: break;
  }
  return st;
}

// ---------------------------------------------------------------------------------------------------------------
// Mags: big, stout, green-skinned, crooked hat, frizzy orange hair. Origin at the feet, facing right.
function drawMags(P, st) {
  const C = MAGS, T = xform(st);
  const L = st.lean;
  const cr = st.crouch || 0;
  const E = (x, y, rx, ry, r, o = {}) => { const [a, b] = T(x, y); P.ellipse(a, b, rx, ry, r, { ...o, rot: (o.rot || 0) + T.a }); };
  const Cp = (x0, y0, x1, y1, r0, r1, r, o) => { const [a, b] = T(x0, y0), [c, d] = T(x1, y1); P.capsule(a, b, c, d, r0, r1, r, o); };
  const Pg = (pts, r, o) => P.poly(pts.map(([x, y]) => T(x, y)), r, o);
  const px = (x, y, c) => { const [a, b] = T(x, y); P.set(a, b, c); };

  if (st.ball) { drawBall(P, st, C, true); return; }
  if (st.broom && !st.noStick) drawBroom(P, T, 0, -4, 1.25);
  const hipY = -8 + cr, shY = -18 + cr;
  // back arm
  const arm = armPos(st, true, 4.5, shY);
  Cp(-3 + L * 0.6, shY + 1, arm.bx, arm.by, 2.1, 1.9, C.dress);
  E(arm.bx, arm.by, 1.9, 1.9, C.skin);
  // legs
  if (!st.legsHidden && !st.broom) {
    for (const [fx, fy, sx] of [[st.fB[0], st.fB[1], -2.2], [st.fA[0], st.fA[1], 2.2]]) {
      Cp(sx * 0.7, hipY, fx, fy - 2.4, 1.9, 1.7, C.sockA, { stripe: { o: 0, p: 2, r: C.sockB } });
      E(fx + 1.2, fy - 1.6, 3.2, 2, C.boot);
      px(fx + 4, fy - 2.6, C.boot[1]);
    }
  } else if (st.broom) {
    Cp(1, hipY, 5, -3, 1.9, 1.7, C.sockA, { stripe: { o: 0, p: 2, r: C.sockB } });
    E(6, -2.5, 3, 1.9, C.boot);
  }
  // dress (round skirt), apron, bodice
  E(0 + L * 0.3, -11 + cr * 0.6, 8.6, 7.2 - cr * 0.3, C.dress);
  Pg([[-8.4 + L * 0.3, -8 + cr], [8.4 + L * 0.3, -8 + cr], [7.4, -4.6], [-7.4, -4.6]], C.dress, { flat: 0.4 });
  // hem zigzag
  for (let i = -7; i <= 7; i += 2) px(i, -4.4 + ((i & 2) ? 0 : 1), C.dress[3]);
  E(3.2 + L * 0.5, -10 + cr * 0.6, 3.6, 5.2, C.apron, { edge: true });
  E(2.6 + L * 0.5, -9 + cr * 0.6, 1.2, 1.1, C.patch, { flat: 0.7 });
  E(0.6 + L, shY + 1.5, 6, 4.6, C.dress, { edge: true });
  Cp(-5 + L, shY + 4.8, 6 + L, shY + 4.8, 0.9, 0.9, C.band, { flat: 0.75 });
  // head
  const hx = 2 + L * 1.1, hy = shY - 6.5;
  // hair (behind)
  E(hx - 4.2 - st.hatBack * 0.3, hy + 1.5, 3.8, 4.6, C.hair);
  E(hx - 2.2, hy - 2.6, 4.4, 2.6, C.hair);
  E(hx - 5.4 - st.hatBack * 0.4, hy + 4.6, 2.2, 2.2, C.hair);
  E(hx, hy, 5.1, 4.7, C.skin, { edge: true });
  // nose: long, crooked, wart
  Cp(hx + 4, hy + 0.2, hx + 7.6, hy + 2.2, 1.5, 0.9, C.skin);
  px(hx + 6.2, hy + 0.4, C.skin[4]);
  // chin
  E(hx + 2.8, hy + 3.6, 2, 1.4, C.skin);
  // face
  eyes(P, T, hx + 2.6, hy - 1, st, true);
  mouth(P, T, hx + 3.6, hy + 2.6, st);
  // hat
  drawHat(P, T, hx - 0.5, hy - 3.8, C, st, true);
  // front arm
  const fa = armPos(st, false, 4.5, shY);
  Cp(4 + L, shY + 1, fa.bx, fa.by, 2.2, 2, C.dress, { edge: true });
  E(fa.bx, fa.by, 2, 2, C.skin);
}

// Pip: small, quick apprentice. Teal cloak, huge floppy hat, blonde braid.
function drawPip(P, st) {
  const C = PIP, T = xform(st);
  const L = st.lean * 0.8;
  const cr = (st.crouch || 0) * 0.6;
  const E = (x, y, rx, ry, r, o = {}) => { const [a, b] = T(x, y); P.ellipse(a, b, rx, ry, r, { ...o, rot: (o.rot || 0) + T.a }); };
  const Cp = (x0, y0, x1, y1, r0, r1, r, o) => { const [a, b] = T(x0, y0), [c, d] = T(x1, y1); P.capsule(a, b, c, d, r0, r1, r, o); };
  const px = (x, y, c) => { const [a, b] = T(x, y); P.set(a, b, c); };

  if (st.ball) { drawBall(P, st, C, false); return; }
  if (st.broom && !st.noStick) drawBroom(P, T, 0, -3, 1);
  const hipY = -5.5 + cr, shY = -11.5 + cr;
  const hx = 1.2 + L, hy = shY - 4.6;
  // braid (behind)
  const bs = st.braid;
  Cp(hx - 3, hy + 1, hx - 5.5 - bs, hy + 6.5, 1.6, 1.3, C.hair);
  E(hx - 5.8 - bs, hy + 7.4, 1.4, 1.2, C.band, { flat: 0.7 });
  // back arm
  const arm = armPos(st, true, 3, shY);
  Cp(-2 + L * 0.5, shY + 1, arm.bx * 0.8, arm.by, 1.4, 1.3, C.dress);
  E(arm.bx * 0.8, arm.by, 1.3, 1.3, C.skin);
  // legs
  if (!st.legsHidden && !st.broom) {
    for (const [fx, fy, sx] of [[st.fB[0], st.fB[1], -1.6], [st.fA[0], st.fA[1], 1.6]]) {
      Cp(sx * 0.6, hipY, fx * 0.9, fy - 1.6, 1.25, 1.15, C.sockA, { stripe: { o: 0, p: 2, r: C.sockB } });
      E(fx * 0.9 + 0.8, fy - 1.1, 2.2, 1.4, C.boot);
    }
  } else if (st.broom) {
    Cp(1, hipY, 4, -2.4, 1.3, 1.2, C.sockA, { stripe: { o: 0, p: 2, r: C.sockB } });
    E(4.8, -1.8, 2.1, 1.4, C.boot);
  }
  // cloak
  P.poly([[-5 + L * 0.3, -2.6], [5.4 + L * 0.3, -2.6], [3.6 + L, shY], [-3 + L, shY]].map(([x, y]) => T(x, y)), C.dress, { flat: 0.5, grad: [-0.04, -0.03] });
  E(0.4 + L * 0.6, -6.5 + cr, 4.6, 4.4, C.dress, { edge: true });
  for (let i = -4; i <= 5; i += 2) px(i, -2.4, C.dress[3]);
  // collar
  E(1.2 + L, shY + 0.6, 3.4, 1.4, C.apron, { flat: 0.8 });
  // head (big)
  E(hx, hy, 4.7, 4.4, C.skin, { edge: true });
  px(hx + 4.6, hy + 0.6, C.skin[1]); px(hx + 5.2, hy + 0.6, C.skin[2]);
  // freckles
  px(hx + 2, hy + 1.6, C.skin[3]); px(hx + 3.4, hy + 2, C.skin[3]);
  // fringe
  E(hx + 0.4, hy - 3, 4.2, 1.6, C.hair);
  eyes(P, T, hx + 2.4, hy - 0.8, st, false);
  mouth(P, T, hx + 2.8, hy + 2.6, st);
  drawHat(P, T, hx - 0.6, hy - 3.6, C, st, false);
  const fa = armPos(st, false, 3, shY);
  Cp(2.6 + L, shY + 1, fa.bx, fa.by, 1.45, 1.35, C.dress, { edge: true });
  E(fa.bx, fa.by, 1.4, 1.4, C.skin);
}

function armPos(st, back, len, shY) {
  const s = back ? -1 : 1;
  const sw = (st.swing || 0) * (back ? 1 : -1);
  const sx = back ? -3.5 : 4;
  let bx = sx + sw * len * 0.8 + st.lean * 0.6, by = shY + len + 1;
  switch (st.arms) {
    case 'up': bx = sx * 0.6 + (back ? -1 : 1); by = shY - len - 4.5; break;
    case 'jump': bx = sx + s * 2; by = shY - len * 0.8; break;
    case 'cheer': bx = sx + s * 3; by = shY - len - 3; break;
    case 'flail': bx = sx + s * 3.5; by = shY - 2 + (st.flail || 0) * 3 * s; break;
    case 'back': bx = sx - 3; by = shY + len * 0.6; break;
    case 'throw': bx = back ? sx - 2 : sx + len + 3; by = back ? shY + len : shY - 1; break;
    case 'slap': bx = sx + s * 1.5 + 3; by = -1; break;
    case 'rim': bx = sx + 3.5; by = shY + 5; break;
    default: break;
  }
  return { bx, by };
}

function eyes(P, T, x, y, st, big) {
  const put = (dx, dy, c) => { const [a, b] = T(x + dx, y + dy); P.set(a, b, c); };
  if (st.eye === 'blink') { put(0, 0.6, EYE); put(1, 0.6, EYE); return; }
  if (st.eye === 'x') { put(-0.4, -0.6, EYE); put(1.4, 1.2, EYE); put(1.4, -0.6, EYE); put(-0.4, 1.2, EYE); put(0.5, 0.3, EYE); return; }
  if (st.eye === 'happy') { put(-0.4, 0.6, EYE); put(0.5, -0.3, EYE); put(1.4, 0.6, EYE); return; }
  put(0, 0, WHITE); put(0, 1, WHITE); put(1, 0, EYE); put(1, 1, EYE);
  if (!big) { put(-1, 0, WHITE); put(-1, 1, WHITE); put(2, 1, EYE); }
  put(0, -1.2, EYE); put(1, -1.4, EYE); // brow
}
function mouth(P, T, x, y, st) {
  const put = (dx, dy, c) => { const [a, b] = T(x + dx, y + dy); P.set(a, b, c); };
  if (st.mouth === 'o') { put(0, 0, MOUTH); put(1, 0, MOUTH); put(0, 1, MOUTH); put(1, 1, MOUTH); return; }
  if (st.mouth === 'grin') { put(-1, 0, MOUTH); put(0, 0.6, MOUTH); put(1, 0.6, WHITE); put(2, 0, MOUTH); put(0.5, 1.2, MOUTH); return; }
  put(0, 0.5, MOUTH); put(1, 0.5, MOUTH); put(2, 0, MOUTH);
}
function drawHat(P, T, x, y, C, st, big) {
  const k = big ? 1 : 1.05;
  const back = st.hatBack || 0;
  const off = st.hatOff || 0;
  y -= off;
  const tf = (px, py) => T(x + px * k, y + py * k);
  // brim
  { const [a, b] = tf(0.5, 0); P.ellipse(a, b, (big ? 9 : 7.6) * k, 2 * k, C.hat, { rot: T.a - back * 0.03, bias: 0.05 }); }
  // cone: crooked, tip bends back with motion
  const h = big ? 14 : 12;
  const tipX = -4 - back * 1.2, tipY = -h + Math.abs(back) * 0.4;
  const midX = -0.5 - back * 0.4, midY = -h * 0.55;
  const pts = [[-5.2, -0.6], [5.6, -0.6], [midX + 3.2, midY], [tipX + 0.6, tipY], [tipX - 1.6, tipY + 2.2], [midX - 2.4, midY + 1]];
  P.poly(pts.map(([a, b]) => tf(a, b)), C.hat, { flat: 0.5, grad: [-0.035, -0.02] });
  // tip curl
  { const [a, b] = tf(tipX - 1.6, tipY + 2.2); P.ellipse(a, b, 1.3, 1.3, C.hat); }
  // band
  P.poly([[-5, -0.8], [5.4, -0.8], [4.8, -2.8], [-4.4, -2.8]].map(([a, b]) => tf(a, b)), C.band, { flat: 0.7 });
  if (big) { const [a, b] = tf(1.6, -6.5); P.ellipse(a, b, 1.6, 1.4, C.patch, { flat: 0.6 }); const [c, d] = tf(0.8, -7); P.set(c, d, C.patch[4]); }
  else { const [a, b] = tf(0.6, -6.2); P.set(a, b, C.band[0]); P.set(a + 1, b, C.band[1]); P.set(a, b - 1, C.band[1]); }
}
function drawBroom(P, T, x, y, k) {
  const BR = R('#8a5a32'), BI = R('#d8a54a');
  const [a, b] = T(x - 11 * k, y), [c, d] = T(x + 12 * k, y - 1);
  P.capsule(a, b, c, d, 1, 1, BR);
  const [e, f] = T(x - 13 * k, y + 0.5);
  P.ellipse(e, f, 4 * k, 2.6 * k, BI, { rot: T.a + 0.1 });
  for (let i = 0; i < 4; i++) { const [g, h] = T(x - 16 * k, y - 1.5 + i); P.set(g, h, BI[2]); }
  const [m, n] = T(x - 10 * k, y + 0.2);
  P.ellipse(m, n, 1, 2.2, R('#b0382e'), { flat: 0.6 });
}
// rolled-up witch: a lit ball of dress with boots, hands and the hat whirling round it.
function drawBall(P, st, C, big) {
  const r = big ? 9 : 6.4, cy = big ? -10 : -7, a = st.rot;
  const at = (ang, d) => [Math.cos(a + ang) * d, cy + Math.sin(a + ang) * d];
  // hat flying out behind
  const [hx, hy] = at(Math.PI * 1.05, r + 2);
  P.ellipse(hx, hy, big ? 5 : 4, 2, C.hat, { rot: a + Math.PI * 1.05 + Math.PI / 2 });
  P.ellipse(0, cy, r, r, C.dress, { rot: a });
  const [ax, ay] = at(0.4, r * 0.55);
  P.ellipse(ax, ay, r * 0.45, r * 0.38, C.apron, { rot: a + 0.4, edge: true });
  for (const ang of [2.2, 2.9]) { const [bx, by] = at(ang, r * 0.92); P.ellipse(bx, by, big ? 2.6 : 2, big ? 2 : 1.5, C.boot, { rot: a + ang }); }
  for (const ang of [-0.9, 4.6]) { const [bx, by] = at(ang, r * 0.95); P.ellipse(bx, by, big ? 1.9 : 1.4, big ? 1.9 : 1.4, C.skin); }
  const [fx, fy] = at(-0.25, r * 0.7);
  P.ellipse(fx, fy, big ? 3 : 2.4, big ? 2.6 : 2.2, C.hair);
  // streak lines
  for (let i = 0; i < 3; i++) { const [sx, sy] = at(Math.PI + 0.5 + i * 0.3, r + 1); P.set(sx, sy, C.dress[0]); }
}

export const WITCH_FRAMES = { idle: 4, walk: 8, run: 8, carryWalk: 8, skid: 1, jump: 1, carryJump: 1, fall: 2, float: 2, roll: 8, blast: 8, carryIdle: 2, throw: 1, slap: 3, hurt: 2, dead: 2, victory: 2, cart: 2, flee: 1, ride: 6, rideDash: 2, rideBack: 6 };
export function witchSprite(kind, pose, fi) {
  const n = WITCH_FRAMES[pose] || 1;
  fi = ((fi % n) + n) % n;
  return cached(`w:${kind}:${pose}:${fi}`, () => {
    const P = new Painter(56, 56, 28, 50, SS);
    const st = poseOf(kind, pose, fi / n);
    if (kind === 'mags') drawMags(P, st); else drawPip(P, st);
    P.outline();
    return P.toCanvas();
  });
}
// frame index for a pose given its timer (frames) and speed
export function witchFrame(pose, t, spd = 1) {
  switch (pose) {
    case 'idle': return Math.floor(t / 18);
    case 'walk': case 'carryWalk': return Math.floor(t * Math.max(0.12, spd * 0.12));
    case 'run': return Math.floor(t * Math.max(0.16, spd * 0.09));
    case 'roll': return Math.floor(t / 2.4);
    case 'blast': return Math.floor(t / 2);
    case 'fall': case 'float': case 'hurt': case 'dead': return Math.floor(t / 8);
    case 'slap': return t < 6 ? 0 : t < 12 ? 1 : 2;
    case 'victory': return Math.floor(t / 14);
    case 'carryIdle': return Math.floor(t / 20);
    case 'cart': return Math.floor(t / 10);
    case 'ride': case 'rideBack': return Math.floor(t / 7);
    case 'rideDash': return Math.floor(t / 4);
    default: return 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// enemies

// clergy: the Witchfinder's congregation
const FRI = { robe: cloth('#7a5236'), rope: cloth('#d8c080'), skin: skin('#eab48e'), hair: cloth('#5a3a22'), sandal: cloth('#6a4a2a') };
const DEA = { robe: cloth('#2c2a3c'), collar: cloth('#ece6d6'), skin: skin('#e6b896'), hat: cloth('#1e1c28'), buckle: metal('#e8c050'), shield: gloss('#8a5a34'), boss: metal('#d8b048') };
const BIS = { robe: cloth('#6a2a78'), stole: cloth('#2a7a4a'), gold: metal('#e0b040'), skin: skin('#e2a888'), mitre: cloth('#7a3a8a'), staff: metal('#d8a838'), shoe: cloth('#3a1a2a') };
const ACO = { cassock: cloth('#a82a30'), surplice: cloth('#f2ede0'), skin: skin('#f0c09a'), hair: cloth('#c88a40'), wax: gloss('#f4ead0') };
const HOG = { body: cloth('#8a5c38'), spike: gloss('#5a3a24'), face: skin('#d8b088'), nose: gloss('#2a1a14') };
const SLG = { body: gloss('#7aa04a'), belly: gloss('#c8d888'), spot: gloss('#4a6a2a') };
const CRO = { body: gloss('#2c2838'), beak: gloss('#e8b03a'), eye: hex('#e84a3a') };
const WAS = { body: gloss('#e8c23a'), band: gloss('#2a1e1a'), wing: Object.assign(R('#cfe8f0'), { spec: 0.9, shin: 30 }), eye: hex('#ff3a2a') };

function walkLegs(f, S = 3, lift = 2) {
  const ph = f * Math.PI * 2;
  return [[Math.sin(ph) * S, -Math.max(0, Math.cos(ph)) * lift], [Math.sin(ph + Math.PI) * S, -Math.max(0, Math.cos(ph + Math.PI)) * lift]];
}
function face(P, x, y, mood = 'cross') {
  // two eyes and a brow, a mouth
  P.set(x, y, WHITE); P.set(x + 1, y, EYE); P.set(x + 2.4, y, WHITE); P.set(x + 3.4, y, EYE);
  if (mood === 'cross') { P.set(x, y - 1.3, EYE); P.set(x + 1, y - 1, EYE); P.set(x + 2.6, y - 1, EYE); P.set(x + 3.6, y - 1.4, EYE); }
}

// Friar: round brown-robed foot soldier with a tonsure and a rope belt. Stomp him, roll him, throw things at him.
function drawFriar(P, f) {
  const C = FRI;
  const [a, b] = walkLegs(f, 2.4, 1.4);
  const bob = -Math.abs(Math.sin(f * Math.PI * 2)) * 0.8;
  for (const [fx, fy] of [b, a]) P.ellipse(fx + 0.8, fy - 1, 2.6, 1.3, C.sandal);
  P.poly([[-6.5, -2 + bob * 0.3], [6.5, -2 + bob * 0.3], [4.5, -15 + bob], [-4.5, -15 + bob]], C.robe, { round: 0.8 });
  P.ellipse(0.5, -9.5 + bob, 6.4, 6.6, C.robe, { edge: true });
  // hem sway
  P.ellipse(0, -2.6, 6.4, 1.6, C.robe, { bias: -0.15 });
  P.capsule(-5.6, -8.5 + bob, 6.2, -8.5 + bob, 0.8, 0.8, C.rope);
  P.capsule(3.5, -8 + bob, 4.5, -3.5 + bob, 0.6, 0.6, C.rope);
  P.ellipse(4.6, -3.2 + bob, 0.9, 0.9, C.rope);
  // hands tucked in sleeves in front
  P.capsule(-1, -12 + bob, 5, -10.5 + bob, 2, 2.2, C.robe, { edge: true });
  P.ellipse(5.6, -10.6 + bob, 1.4, 1.5, C.skin);
  // head: tonsured
  P.ellipse(1.5, -19 + bob, 4.6, 4.4, C.skin, { edge: true });
  P.ellipse(1.5, -17.2 + bob, 4.7, 2.2, C.hair, { clip: (x, y) => y < -17.2 + bob + 0.3 && y > -19.6 + bob });
  P.ellipse(1.6, -21.6 + bob, 3.4, 1.6, C.skin, { bias: 0.1 });
  P.ellipse(5.6, -18.4 + bob, 1.4, 1.2, C.skin);
  P.ellipse(4.3, -16.8 + bob, 1.1, 0.8, skin('#f08a7a'), { flat: 0.7 });
  face(P, 2.6, -19.6 + bob);
  P.set(3.6, -16 + bob, MOUTH); P.set(4.6, -16.2 + bob, MOUTH);
}

// Deacon: black robe, white collar, tall buckled hat, a round shield that turns away rolls. Stomp him.
function drawDeacon(P, f) {
  const C = DEA;
  const [a, b] = walkLegs(f, 2, 1.4);
  const bob = -Math.abs(Math.sin(f * Math.PI * 2)) * 0.6;
  for (const [fx, fy] of [b, a]) P.ellipse(fx + 0.8, fy - 1.4, 2.6, 1.6, gloss('#1a1418'));
  P.poly([[-6, -2], [5, -2], [3.5, -17 + bob], [-4.5, -17 + bob]], C.robe, { round: 0.7 });
  P.ellipse(-0.5, -12 + bob, 5, 6, C.robe, { edge: true });
  P.ellipse(0.5, -16 + bob, 3.6, 1.4, C.collar);
  P.ellipse(1, -20 + bob, 3.8, 3.8, C.skin, { edge: true });
  P.ellipse(4.4, -19.6 + bob, 1.2, 1.1, C.skin);
  face(P, 1.6, -20.6 + bob);
  P.set(2, -17.8 + bob, MOUTH); P.set(3, -17.8 + bob, MOUTH);
  P.ellipse(1, -23 + bob, 6.4, 1.5, C.hat);
  P.poly([[-3.4, -23.4 + bob], [4.4, -23.4 + bob], [3.6, -31 + bob], [-2.6, -31 + bob]], C.hat, { round: 0.7 });
  P.ellipse(0.5, -31 + bob, 3.1, 0.9, C.hat, { bias: 0.15 });
  P.capsule(-3, -24.6 + bob, 4, -24.6 + bob, 0.7, 0.7, cloth('#3a3446'));
  P.ellipse(1, -24.6 + bob, 1.2, 1, C.buckle);
  // shield with a painted sun
  P.ellipse(6.5, -11 + bob, 4.2, 7, C.shield, { edge: true });
  P.ellipse(7.2, -11 + bob, 2.2, 2.6, C.boss);
  for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2; P.set(7.2 + Math.cos(an) * 2, -11 + bob + Math.sin(an) * 4, C.boss[1]); }
}

// Bishop: the big one. Tall mitre, gold-trimmed vestments, a crook. Mags flattens him in one stomp, Pip needs two
// (the first knocks his mitre off). Rolls bounce off him; cauldrons and broom charges don't.
function drawBishop(P, f, st) {
  const C = BIS;
  const [a, b] = walkLegs(f, 3, 2);
  const bob = -Math.abs(Math.sin(f * Math.PI * 2)) * 1.1;
  // crook held behind
  P.capsule(-8, -4, -9.5, -36 + bob, 1, 1, C.staff);
  P.capsule(-9.5, -36 + bob, -7, -40 + bob, 1, 1, C.staff);
  P.capsule(-7, -40 + bob, -4.5, -38 + bob, 1, 1, C.staff);
  P.ellipse(-5, -36.4 + bob, 1.1, 1.1, C.staff);
  for (const [fx, fy] of [b, a]) P.ellipse(fx + 1.2, fy - 1.6, 3.6, 2, C.shoe);
  P.poly([[-9.5, -2], [9.5, -2], [7, -22 + bob], [-7, -22 + bob]], C.robe, { round: 0.8 });
  P.ellipse(0, -15 + bob, 10, 9.5, C.robe, { edge: true });
  // stole and gold trim
  P.poly([[1, -24 + bob], [5, -24 + bob], [4, -2], [0, -2]], C.stole, { round: 0.5 });
  P.capsule(0.4, -2.6, 4.4, -2.6, 0.7, 0.7, C.gold);
  for (let y = -20; y < -4; y += 4) P.ellipse(2.4, y + bob * 0.5, 1, 1, C.gold);
  // back hand on the crook
  P.capsule(-5, -21 + bob, -8.4, -18 + bob, 2.6, 2.4, C.robe);
  P.ellipse(-8.6, -17.6 + bob, 2, 2, C.skin);
  // head: jowly, frowning
  P.ellipse(2, -27 + bob, 5.2, 4.8, C.skin, { edge: true });
  P.ellipse(4.2, -24.2 + bob, 3.2, 2.2, C.skin, { bias: -0.05 });
  P.ellipse(6.6, -27 + bob, 1.6, 1.4, C.skin);
  face(P, 3, -28.4 + bob);
  P.set(3.6, -24.6 + bob, MOUTH); P.set(4.6, -24.4 + bob, MOUTH); P.set(5.6, -24.6 + bob, MOUTH);
  if (!st.bald) {
    // mitre: tall, split peak, gold band
    P.poly([[-3.6, -31 + bob], [6.4, -31 + bob], [5.4, -40 + bob], [1.4, -44 + bob], [-2.6, -40 + bob]], C.mitre, { round: 0.7 });
    P.capsule(1.4, -43 + bob, 1.4, -32 + bob, 0.9, 0.9, C.gold);
    P.capsule(-3.4, -31.6 + bob, 6.2, -31.6 + bob, 1, 1, C.gold);
    P.ellipse(1.4, -37 + bob, 1.2, 1.2, gloss('#d02a3a'));
  } else {
    P.ellipse(2, -30.6 + bob, 4.4, 2, C.skin, { bias: 0.15 });
    P.set(0.6, -32 + bob, hex('#fff0e0'));
  }
  // front fist
  P.capsule(6, -20 + bob, 9.6, -14 + bob, 2.8, 2.6, C.robe, { edge: true });
  P.ellipse(10, -13 + bob, 2.4, 2.4, C.skin);
}

// Acolyte: a small altar-server who lobs lit candles at witches.
function drawAcolyte(P, f, st) {
  const C = ACO;
  const raise = st.throwing ? 1 : 0;
  P.ellipse(0.2, -1.4, 2.8, 1.4, gloss('#2a1c1a'));
  P.ellipse(-2.6, -1.4, 2.4, 1.3, gloss('#2a1c1a'));
  P.poly([[-5.5, -2], [5.2, -2], [3.4, -12], [-3.6, -12]], C.cassock, { round: 0.7 });
  P.poly([[-5, -7], [5, -7], [3.6, -15], [-3.4, -15]], C.surplice, { round: 0.7 });
  P.ellipse(0, -13, 4, 3, C.surplice, { edge: true });
  P.ellipse(0.6, -18.4, 4, 3.9, C.skin, { edge: true });
  P.ellipse(0.4, -21, 4.1, 2, C.hair);
  P.ellipse(4.2, -18, 1.1, 1, C.skin);
  face(P, 1.6, -18.8, 'calm');
  P.set(2.6, -16.4, MOUTH); P.set(3.6, -16.4, MOUTH);
  // candle hand (the flame is drawn live by the renderer)
  const tx = raise ? 3 : 6, ty = raise ? -27 : -21;
  P.capsule(2.6, -13, tx, ty + 5, 1.5, 1.3, C.surplice, { edge: true });
  P.ellipse(tx, ty + 5, 1.3, 1.3, C.skin);
  P.capsule(tx, ty + 4, tx, ty, 1.2, 1.2, C.wax);
}

function drawHedgehog(P, f) {
  const C = HOG;
  const [a, b] = walkLegs(f, 1.6, 1);
  for (const [fx, fy] of [b, a]) P.ellipse(fx, fy - 0.8, 1.6, 1, C.face);
  for (let i = 0; i < 11; i++) {
    const an = Math.PI * (1.05 + (i / 10) * 0.95);
    const cx = -0.5 + Math.cos(an) * 6, cy = -5 + Math.sin(an) * 4.4;
    const tx = -0.5 + Math.cos(an) * 10.2, ty = -5 + Math.sin(an) * 8.2 + (i % 2) * 0.8;
    P.poly([[cx - Math.sin(an) * 1.8, cy + Math.cos(an) * 1.8], [cx + Math.sin(an) * 1.8, cy - Math.cos(an) * 1.8], [tx, ty]], C.spike, { round: 0.4 });
  }
  P.ellipse(-0.5, -4.6, 6.6, 4.6, C.body, { edge: true });
  P.ellipse(5, -3, 3, 2.4, C.face);
  P.ellipse(7.8, -3.2, 1, 0.9, C.nose);
  P.set(5, -4.5, EYE); P.set(4.5, -5.5, EYE);
}
function drawSlug(P, f) {
  const C = SLG;
  const s = Math.sin(f * Math.PI * 2);
  P.ellipse(0, -3.6, 8 + s * 0.6, 3.4 - s * 0.3, C.body, { edge: true });
  P.ellipse(0.5, -1.6, 7, 1.4, C.belly);
  P.ellipse(-3, -5, 1.2, 1, C.spot); P.ellipse(1, -5.6, 1, 0.8, C.spot);
  for (const [x0, x1] of [[5, 6.5], [6.4, 9]]) {
    P.capsule(x0, -5.4, x1, -9.5 + s * 0.6, 0.6, 0.5, C.body);
    P.ellipse(x1, -9.7 + s * 0.6, 1.1, 1.1, C.belly);
    P.set(x1 + 0.4, -9.7 + s * 0.6, EYE);
  }
}
function drawCrow(P, f) {
  const C = CRO;
  const up = f < 0.5;
  P.poly([[-6, -5], [-10, -7], [-10, -3]], C.body);
  P.ellipse(0, -5, 6, 3.6, C.body, { edge: true });
  P.ellipse(5, -7, 3, 2.8, C.body, { edge: true });
  P.poly([[7.4, -7.6], [11, -6.4], [7.4, -5.6]], C.beak);
  P.set(6, -8, C.eye);
  if (up) P.poly([[-2, -6], [3, -6], [-4, -14], [-6, -13]], C.body, { bias: 0.1 });
  else P.poly([[-2, -4], [3, -4], [-3, 3], [-6, 1]], C.body, { bias: -0.1 });
  P.set(0, -1, C.beak[2]); P.set(2, -1, C.beak[2]);
}
function drawWasp(P, f) {
  const C = WAS;
  const up = f < 0.5;
  P.ellipse(-1, up ? -11 : -9, 4, up ? 3 : 2, C.wing);
  P.ellipse(-4, -3.5, 5, 3.4, C.body, { edge: true, rot: -0.2 });
  for (const x of [-6, -3.4]) P.capsule(x, -6.6, x + 0.6, -0.6, 0.7, 0.7, C.band);
  P.poly([[-9, -3], [-12.5, -1.5], [-9, -1.5]], C.band);
  P.ellipse(1.6, -5, 2.4, 2.2, C.body, { edge: true });
  P.ellipse(4.6, -5.4, 2.6, 2.6, C.band, { edge: true });
  P.set(5.6, -6, C.eye); P.set(6.2, -5, C.eye);
  P.capsule(6, -7.4, 8, -9.6, 0.4, 0.4, C.band);
  P.ellipse(1, up ? -10 : -8, 3, up ? 2.4 : 1.6, C.wing);
}
function drawRider(P, f) {
  // a friar riding a little mine cart
  const C = FRI;
  P.ellipse(0, -11, 5.5, 4, C.robe, { edge: true });
  P.ellipse(1.5, -17, 4.6, 4.4, C.skin, { edge: true });
  P.ellipse(1.5, -15.4, 4.7, 2.1, C.hair, { clip: (x, y) => y < -15 && y > -17.4 });
  P.ellipse(1.6, -19.6, 3.4, 1.6, C.skin, { bias: 0.1 });
  face(P, 2.6, -17.6);
  P.capsule(3, -12, 8, -14, 1.5, 1.4, C.robe, { edge: true }); P.ellipse(8.4, -14.4, 1.5, 1.5, C.skin);
  cartBody(P, gloss('#6a5a52'), metal('#4a4a56'));
}
function cartBody(P, wood, iron) {
  P.poly([[-10, -11], [10, -11], [8.5, -3], [-8.5, -3]], wood, { round: 0.6 });
  P.capsule(-10, -11, 10, -11, 1, 1, iron);
  for (const x of [-6, 0, 6]) P.capsule(x, -10, x, -4, 0.5, 0.5, iron);
  for (const x of [-6, 6]) { P.ellipse(x, -2.2, 2.6, 2.6, iron, { edge: true }); P.set(x, -2.2, iron[0]); }
}

export const ENEMY_FRAMES = { friar: 8, deacon: 8, hedgehog: 6, slug: 6, bishop: 8, acolyte: 2, crow: 2, wasp: 2, rider: 1 };
export function enemySprite(kind, fi, st = {}) {
  const n = ENEMY_FRAMES[kind] || 1;
  fi = ((fi % n) + n) % n;
  const key = `e:${kind}:${fi}:${st.bald ? 1 : 0}:${st.throwing ? 1 : 0}`;
  return cached(key, () => {
    const P = new Painter(48, 52, 24, 48, SS);
    const f = fi / n;
    ({ friar: drawFriar, deacon: drawDeacon, hedgehog: drawHedgehog, slug: drawSlug, bishop: drawBishop, acolyte: drawAcolyte, crow: drawCrow, wasp: drawWasp, rider: drawRider })[kind](P, f, st);
    return P.toCanvas();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// the Witchfinder in his Ducking Engine (boss) — 96×80, origin bottom centre
const FIN = { coat: R('#2a2638'), skin: R('#e4b896'), hat: R('#18161f'), wood: R('#8a5a32'), dark: R('#4a2e1a'), iron: R('#7a7e8c'), bell: R('#d8a840'), seat: R('#7a2a34') };
export function bossSprite(fi, st = {}) {
  const key = `boss:${fi}:${st.arm ? Math.round(st.arm * 4) : 0}:${st.hurt ? 1 : 0}:${st.laugh ? 1 : 0}`;
  return cached(key, () => {
    const P = new Painter(140, 96, 70, 92, SS);
    const C = FIN;
    const wheelA = (fi / 8) * Math.PI * 2;
    // arm (beam with ducking chair) pointing forward, raised by st.arm (0 rest .. 1 raised .. 2 slammed)
    const arm = st.arm || 0;
    const ang = arm <= 1 ? -0.25 - arm * 0.9 : -1.15 + (arm - 1) * 1.6;
    const bx = 14, by = -36;
    const ex = bx + Math.cos(ang) * 44, ey = by + Math.sin(ang) * 44;
    P.capsule(bx, by, ex, ey, 2.4, 2, C.wood, { edge: true });
    P.capsule(ex, ey, ex, ey + 10, 0.8, 0.8, C.iron);
    P.poly([[ex - 6, ey + 10], [ex + 6, ey + 10], [ex + 5, ey + 20], [ex - 5, ey + 20]], C.dark, { flat: 0.4 });
    P.poly([[ex - 6, ey + 10], [ex - 4, ey + 10], [ex - 4, ey + 2], [ex - 6, ey + 2]], C.dark, { flat: 0.5 });
    // wagon body
    P.poly([[-30, -14], [30, -14], [26, -34], [-26, -34]], C.wood, { flat: 0.5, grad: [-0.01, -0.02] });
    for (let x = -24; x <= 24; x += 8) P.capsule(x, -33, x - 1, -15, 0.5, 0.5, C.dark, { flat: 0.3 });
    P.capsule(-30, -14, 30, -14, 1.4, 1.4, C.iron, { flat: 0.6 });
    P.capsule(-26, -34, 26, -34, 1.4, 1.4, C.iron, { flat: 0.7 });
    // big rune "eye" painted on the side
    P.ellipse(-8, -24, 6, 4, R('#e8d8a8'), { flat: 0.85 }); P.ellipse(-8, -24, 2.4, 2.4, R('#3a2a6a'), { flat: 0.5 });
    // wheels
    for (const wx of [-18, 18]) {
      P.ellipse(wx, -12, 11, 11, C.dark, { edge: true });
      P.ellipse(wx, -12, 8.4, 8.4, C.wood);
      for (let i = 0; i < 6; i++) { const a = wheelA + (i / 6) * Math.PI * 2; P.capsule(wx, -12, wx + Math.cos(a) * 8, -12 + Math.sin(a) * 8, 0.8, 0.8, C.dark, { flat: 0.3 }); }
      P.ellipse(wx, -12, 2.4, 2.4, C.iron);
    }
    // chimney + bell frame
    P.capsule(-20, -34, -20, -52, 3, 3, C.iron, { edge: true });
    P.ellipse(-20, -54, 4, 2, C.iron);
    P.capsule(8, -34, 8, -56, 1, 1, C.dark); P.capsule(22, -34, 22, -56, 1, 1, C.dark); P.capsule(7, -56, 23, -56, 1.2, 1.2, C.dark);
    P.ellipse(15, -49, 4.6, 5.6, C.bell, { edge: true, clip: (x, y) => y < -45 });
    P.capsule(10.4, -45, 19.6, -45, 1, 1, C.bell);
    // seat + witchfinder
    P.poly([[-6, -34], [6, -34], [6, -44], [-6, -44]], C.seat, { flat: 0.5 });
    P.ellipse(0, -46, 6.5, 7, C.coat, { edge: true });
    P.ellipse(1, -49, 3.4, 1.3, R('#ece6d6'), { flat: 0.8 });
    const hy = st.laugh ? -55 : -54;
    P.ellipse(1, hy, 4.4, 4.4, C.skin, { edge: true });
    P.ellipse(5, hy + 0.6, 1.6, 1.3, C.skin);
    // mean eyes + moustache
    P.set(2, hy - 1, EYE); P.set(4, hy - 1, EYE); P.set(1, hy - 2.4, EYE); P.set(2, hy - 2, EYE); P.set(4, hy - 2, EYE); P.set(5, hy - 2.4, EYE);
    P.capsule(1, hy + 2.4, 6, hy + 2, 0.6, 0.6, R('#5a4a52'), { flat: 0.3 });
    if (st.laugh) { P.set(3, hy + 3.4, MOUTH); P.set(4, hy + 3.4, MOUTH); }
    // capotain hat
    P.ellipse(1, hy - 4, 7, 1.6, C.hat);
    P.poly([[-3.6, hy - 4.6], [5, hy - 4.6], [4, hy - 14], [-2.8, hy - 14]], C.hat, { flat: 0.4, grad: [-0.05, 0] });
    P.ellipse(0.6, hy - 14, 3.5, 1, C.hat, { flat: 0.6 });
    P.capsule(-3.2, hy - 6, 4.6, hy - 6, 0.8, 0.8, R('#4a4458'), { flat: 0.5 });
    P.rect(0, hy - 7, 2, 2, R('#e8c050')[1]);
    // arm on the lever
    P.capsule(4, -48, 11, -40, 1.6, 1.4, C.coat, { edge: true });
    P.ellipse(11.5, -39.5, 1.6, 1.6, C.skin);
    return P.toCanvas({ hurt: st.hurt });
  });
}
// the Witchfinder on foot, fleeing (for the ending)
export function finderSprite(fi) {
  return cached(`finder:${fi % 4}`, () => {
    const P = new Painter(40, 48, 20, 44, SS);
    const C = FIN;
    const [a, b] = walkLegs((fi % 4) / 4, 3.6, 2.4);
    for (const [fx, fy, sx] of [[b[0], b[1], -1.6], [a[0], a[1], 1.6]]) { P.capsule(sx, -8, fx, fy - 2, 1.4, 1.3, R('#3a3446')); P.ellipse(fx + 1, fy - 1.2, 2.6, 1.5, R('#1a1418')); }
    P.poly([[-5, -6], [5, -6], [3.4, -18], [-3.4, -18]], C.coat, { flat: 0.4 });
    P.ellipse(0, -13, 4.6, 6, C.coat, { edge: true });
    P.ellipse(1, -22, 4, 4, C.skin, { edge: true });
    P.set(3, -23, EYE); P.set(4, -21, MOUTH); P.set(3, -21, MOUTH);
    P.ellipse(1, -26, 6, 1.4, C.hat);
    P.poly([[-3, -26.5], [4, -26.5], [3.4, -34], [-2.4, -34]], C.hat, { flat: 0.4 });
    P.capsule(3, -16, 7, -20 - (fi % 2) * 3, 1.3, 1.2, C.coat); P.ellipse(7.4, -20.6 - (fi % 2) * 3, 1.4, 1.4, C.skin);
    P.outline();
    return P.toCanvas();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// cauldrons and things

const POT = {
  clay: { body: R('#b0683a'), rim: R('#c88a52'), brew: R('#7ad04a') },
  iron: { body: R('#5a6070'), rim: R('#8a90a0'), brew: R('#3a3a48') },
  brew: { body: R('#4a2a5a'), rim: R('#6a3e7a'), brew: R('#f0502a') },
  partner: { body: R('#b0683a'), rim: R('#c88a52'), brew: R('#f08ab0') },
};
export function potSprite(kind, fi = 0, who = null) {
  return cached(`pot:${kind}:${fi % 4}:${who}`, () => {
    const P = new Painter(28, 28, 14, 25, SS);
    const C = POT[kind];
    // little feet
    for (const x of [-4.5, 4.5]) P.ellipse(x, -1, 1.8, 1.4, C.body);
    P.ellipse(0, -6.5, 7.4, 6, C.body, { edge: true });
    P.ellipse(0, -11.4, 7, 2.2, C.rim, { edge: true });
    if (kind === 'iron') {
      P.ellipse(0, -11.6, 5.6, 1.4, C.brew, { flat: 0.4 });
      P.ellipse(0, -13.6, 2, 1.2, C.rim);
      for (const x of [-5, -2, 2, 5]) P.set(x, -6.5 + (Math.abs(x) > 3 ? 1 : 0), C.rim[0]);
      P.capsule(-6.5, -8.6, 6.5, -8.6, 0.6, 0.6, C.rim, { flat: 0.6 });
    } else {
      P.ellipse(0, -11.6, 5.6, 1.4, C.brew, { flat: 0.75 });
      const bf = fi % 4;
      P.ellipse(-2 + bf, -12.6, 1.2, 1.1, C.brew, { flat: 0.95 });
      if (bf % 2) P.ellipse(2.5, -13, 0.9, 0.9, C.brew, { flat: 1 });
      // handles
      for (const s of [-1, 1]) { P.set(s * 7.6, -9.6, C.rim[3]); P.set(s * 8.2, -8.6, C.rim[3]); P.set(s * 7.6, -7.6, C.rim[3]); }
    }
    if (kind === 'brew') {
      // skull-ish mark and fuse
      P.ellipse(0, -6, 2.6, 2.2, R('#e8e0c8'), { flat: 0.85 });
      P.set(-1, -6.4, EYE); P.set(1, -6.4, EYE); P.set(0, -4.6, EYE);
      P.capsule(3, -12, 6, -16, 0.5, 0.5, R('#6a5a4a'), { flat: 0.4 });
    }
    if (kind === 'partner' && who) {
      // the missing witch's hat poking out of the brew
      const H = who === 'mags' ? MAGS : PIP;
      P.ellipse(0, -12.4, 5, 1.2, H.hat);
      P.poly([[-3, -12.6], [3.4, -12.6], [-1, -20], [-3, -19]], H.hat, { flat: 0.5, grad: [-0.04, -0.02] });
      P.poly([[-3, -12.8], [3.3, -12.8], [3, -14], [-2.8, -14]], H.band, { flat: 0.75 });
      // heart
      P.ellipse(-1, -6.5, 1.4, 1.4, R('#ff6a9a'), { flat: 0.9 }); P.ellipse(1, -6.5, 1.4, 1.4, R('#ff6a9a'), { flat: 0.9 });
      P.poly([[-2.4, -6], [2.4, -6], [0, -3.4]], R('#ff6a9a'), { flat: 0.9 });
    }
    P.outline();
    return P.toCanvas();
  });
}

// blast cauldron, lying on its side, mouth pointing along ang (16 directions). kind: 'cannon' | 'bonus'
export function cannonSprite(dirIdx, kind = 'cannon') {
  return cached(`can:${kind}:${dirIdx}`, () => {
    const P = new Painter(36, 36, 18, 18, SS);
    const a = (dirIdx / 16) * Math.PI * 2;
    const body = kind === 'bonus' ? R('#5a2a8a') : R('#3a3446');
    const band = kind === 'bonus' ? R('#f0d060') : R('#d8a840');
    const cs = Math.cos(a), sn = Math.sin(a);
    // body: ellipse elongated along the barrel axis
    P.ellipse(-cs * 1.5, -sn * 1.5, 9.4, 8, body, { rot: a, edge: true });
    // bands
    for (const d of [-4, 1.5]) {
      const bx = cs * d, by = sn * d;
      P.capsule(bx - sn * 7.4, by + cs * 7.4, bx + sn * 7.4, by - cs * 7.4, 0.9, 0.9, band, { flat: 0.7 });
    }
    // mouth rim
    P.ellipse(cs * 7.4, sn * 7.4, 2.6, 6.6, body, { rot: a, flat: 0.75 });
    P.ellipse(cs * 7.8, sn * 7.8, 1.6, 5, R('#120c18'), { rot: a, flat: 0.5 });
    if (kind === 'bonus') { P.ellipse(-cs * 2, -sn * 2, 1.6, 1.6, R('#fff0a0'), { flat: 1 }); }
    else { const bx = -cs * 1.5, by = -sn * 1.5; P.set(bx, by, band[0]); P.set(bx + 1, by, band[1]); P.set(bx, by + 1, band[1]); }
    P.outline();
    return P.toCanvas();
  });
}

export function checkSprite(on) {
  return cached(`check:${on}`, () => {
    const P = new Painter(32, 32, 16, 30, SS);
    // logs
    P.capsule(-9, -2, 9, -3, 2, 2, R('#7a4a2a'));
    P.capsule(-8, -3, 8, -1, 1.8, 1.8, R('#5a3a22'));
    P.ellipse(0, -11, 9.4, 7.6, R('#3a3446'), { edge: true });
    P.ellipse(0, -17.4, 9, 2.6, R('#5a5466'), { edge: true });
    P.ellipse(0, -17.6, 7.4, 1.6, on ? R('#8cf05a') : R('#2a2632'), { flat: 0.75 });
    // rune
    const rc = on ? R('#b8ff8a') : R('#6a6478');
    P.set(-1, -12, rc[0]); P.set(0, -13, rc[0]); P.set(1, -12, rc[0]); P.set(0, -11, rc[0]); P.set(0, -10, rc[1]);
    P.outline();
    return P.toCanvas();
  });
}
export function goalSprite(fi) {
  return cached(`goal:${fi % 6}`, () => {
    const P = new Painter(48, 40, 24, 38, SS);
    for (const x of [-11, 11]) P.capsule(x, -2, x * 1.15, -6, 2, 2, R('#3a3446'));
    P.ellipse(0, -13, 17, 12, R('#2c2838'), { edge: true });
    P.ellipse(0, -23, 16, 4.2, R('#4a4458'), { edge: true });
    P.ellipse(0, -23.2, 13.6, 2.8, R('#c8d8ff'), { flat: 0.8 });
    // swirl
    const a = (fi / 6) * Math.PI * 2;
    for (let i = 0; i < 10; i++) { const t = a + i * 0.6; P.set(Math.cos(t) * (2 + i), -23.2 + Math.sin(t) * (0.5 + i * 0.2), hex('#ffffff')); }
    // painted moon
    P.ellipse(0, -12, 5, 5, R('#f0e8b8'), { flat: 0.9 });
    P.ellipse(2.2, -13, 4, 4.4, R('#2c2838'), { flat: 0.5 });
    P.outline();
    return P.toCanvas();
  });
}

export function shroomSprite(theme, sq) {
  const bell = theme === 'belfry' || theme === 'village' || theme === 'keep';
  return cached(`shroom:${bell}:${sq}`, () => {
    const P = new Painter(28, 26, 14, 24, SS);
    const s = sq ? 0.7 : 1;
    if (bell) {
      P.capsule(-7, -1, 7, -1, 1.2, 1.2, R('#5a3a22'));
      P.ellipse(0, -7 * s, 7, 7 * s, R('#d8a840'), { edge: true, clip: (x, y) => y < -2 });
      P.capsule(-7.6, -2.4, 7.6, -2.4, 1.2, 1.2, R('#d8a840'));
      P.ellipse(0, -1, 1.8, 1.4, R('#8a6a2a'));
    } else {
      P.capsule(0, -1, 0, -6 * s, 2.6, 2.2, R('#ece0c8'));
      P.ellipse(0, -7.5 * s, 9, 5.4 * s, R('#d83a3a'), { edge: true, clip: (x, y) => y < -5 * s + 0.6 });
      for (const [x, y] of [[-4, -9], [2, -11], [5, -8], [-1, -7.5]]) P.ellipse(x, y * s, 1.3, 1.1 * s, R('#f8f0e0'), { flat: 0.9 });
    }
    P.outline();
    return P.toCanvas();
  });
}

// Tarot cards (the collectible): a little card spinning in the light. Face shows one of four plain symbols (sun, moon,
// star, eye) on cream with a gold frame; the back is violet with a gold crescent.
const CARD = { face: gloss('#f2e6c4'), back: gloss('#5a2a8a'), gold: metal('#e8b840'), sun: gloss('#f0a020'), moon: gloss('#c8d8f0'), star: gloss('#f8e070'), eye: gloss('#4a8ad8') };
function drawCardShape(P, cx, cy, sx, sym, tilt = 0) {
  // sx = cos of the spin; negative shows the back
  const w = 4.6 * Math.max(0.12, Math.abs(sx)), h = 6.6;
  const back = sx < 0;
  const pts = [[cx - w, cy - h + tilt], [cx + w, cy - h - tilt], [cx + w, cy + h - tilt], [cx - w, cy + h + tilt]];
  P.poly(pts, CARD.gold, { nx: sx * 0.3, round: 0.2 });
  const iw = Math.max(0, w - 1.1), ih = h - 1.1;
  if (iw > 0.4) P.poly([[cx - iw, cy - ih + tilt], [cx + iw, cy - ih - tilt], [cx + iw, cy + ih - tilt], [cx - iw, cy + ih + tilt]], back ? CARD.back : CARD.face, { nx: sx * 0.3, round: 0.25 });
  if (Math.abs(sx) < 0.45) return;
  const k = Math.abs(sx);
  if (back) {
    P.ellipse(cx, cy, 2.2 * k, 2.4, CARD.gold);
    P.ellipse(cx + 0.9 * k, cy - 0.4, 1.8 * k, 2, CARD.back);
    return;
  }
  if (sym === 0) { P.ellipse(cx, cy, 2 * k, 2, CARD.sun); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.set(cx + Math.cos(a) * 3 * k, cy + Math.sin(a) * 3.2, CARD.sun[2]); } }
  else if (sym === 1) { P.ellipse(cx, cy, 2.3 * k, 2.6, CARD.moon); P.ellipse(cx + 1 * k, cy - 0.5, 1.9 * k, 2.2, CARD.face, { bias: 0.1 }); }
  else if (sym === 2) { P.poly([[cx, cy - 3], [cx + 0.9 * k, cy - 0.6], [cx + 3 * k, cy - 0.4], [cx + 1.2 * k, cy + 0.9], [cx + 1.9 * k, cy + 3], [cx, cy + 1.6], [cx - 1.9 * k, cy + 3], [cx - 1.2 * k, cy + 0.9], [cx - 3 * k, cy - 0.4], [cx - 0.9 * k, cy - 0.6]], CARD.star); }
  else { P.ellipse(cx, cy, 2.8 * k, 1.5, CARD.face, { bias: -0.15 }); P.ellipse(cx, cy, 1.3 * k, 1.3, CARD.eye); P.set(cx, cy, EYE); }
}
export const CARD_FRAMES = 12;
export function cardSprite(fi, sym = 0) {
  fi = ((fi % CARD_FRAMES) + CARD_FRAMES) % CARD_FRAMES;
  return cached(`card:${fi}:${sym & 3}`, () => {
    const P = new Painter(16, 20, 8, 18, SS);
    const a = (fi / CARD_FRAMES) * Math.PI * 2;
    drawCardShape(P, 0, -8, Math.cos(a), sym & 3, Math.sin(a) * 0.6);
    P.outline(0.45);
    return P.toCanvas();
  });
}
// a fanned hand of five: worth ten
export function deckSprite(fi) {
  return cached(`deck:${fi % 8}`, () => {
    const P = new Painter(26, 24, 13, 22, SS);
    const wob = Math.sin((fi / 8) * Math.PI * 2) * 0.6;
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * 3.2;
      drawCardShape(P, off, -9 + Math.abs(i - 2) * 1.1 + (i === 2 ? wob : 0), 1, i & 3, (i - 2) * 0.9);
    }
    P.outline(0.45);
    return P.toCanvas();
  });
}
// a loose broom (knocked off it, it spins away)
export function broomSprite() {
  return cached('broom', () => { const P = new Painter(32, 12, 16, 6, SS); drawBroom(P, (x, y) => [x, y], 0, 0, 1.2); P.outline(0.5); return P.toCanvas(); });
}
// broom rack: a besom leaning in a little stand with a ribbon. Touch it to ride.
export function broomRackSprite(fi) {
  return cached(`rack:${fi % 6}`, () => {
    const P = new Painter(28, 40, 14, 38, SS);
    const wood = gloss('#7a4e2c'), straw = cloth('#d8a84a'), ribbon = gloss('#d84a8a');
    P.poly([[-9, -1], [9, -1], [7, -5], [-7, -5]], wood, { round: 0.5 });
    P.capsule(-6, -5, -6, -14, 1, 1, wood); P.capsule(6, -5, 6, -14, 1, 1, wood);
    P.capsule(-7, -14, 7, -14, 1.1, 1.1, wood);
    const sway = Math.sin((fi / 6) * Math.PI * 2) * 0.8;
    P.capsule(-1 + sway, -34, 1, -10, 1.1, 1.1, wood);
    P.poly([[-2.6, -12], [4.6, -12], [6, -3], [-4, -3]], straw, { round: 0.7 });
    for (let x = -3; x <= 5; x += 2) P.capsule(x * 0.9, -11, x * 1.2, -3.5, 0.3, 0.3, cloth('#a87a2a'));
    P.capsule(-2.6, -12, 4.6, -12, 0.9, 0.9, ribbon);
    P.ellipse(3.2 + sway * 0.5, -31, 2, 1.4, ribbon); P.ellipse(0.2 + sway * 0.5, -31, 2, 1.4, ribbon);
    P.capsule(1.6 + sway * 0.5, -31, 3 + sway, -26, 0.5, 0.5, ribbon);
    P.outline(0.5);
    return P.toCanvas();
  });
}
export function catSprite(fi) {
  return cached(`cat:${fi % 8}`, () => {
    const P = new Painter(20, 20, 10, 18, SS);
    const sx = Math.abs(Math.cos((fi / 8) * Math.PI));
    const gold = R('#f0c040');
    P.ellipse(0, -8, 7 * Math.max(0.2, sx), 7, gold, { edge: true });
    if (sx > 0.45) {
      const k = sx;
      const blk = R('#2a2434');
      P.ellipse(0, -7.4, 4.4 * k, 3.8, blk);
      P.poly([[-4 * k, -9], [-1.4 * k, -10], [-3.4 * k, -13.4]], blk, { flat: 0.4 });
      P.poly([[4 * k, -9], [1.4 * k, -10], [3.4 * k, -13.4]], blk, { flat: 0.4 });
      P.set(-1.6 * k, -8, hex('#a8f060')); P.set(1.6 * k, -8, hex('#a8f060'));
    }
    P.outline();
    return P.toCanvas();
  });
}
export function pageSprite(fi) {
  return cached(`page:${fi % 6}`, () => {
    const P = new Painter(20, 22, 10, 20, SS);
    const w = 5 + Math.sin((fi / 6) * Math.PI * 2) * 1;
    const par = R('#f0e0b0');
    P.poly([[-w, -16], [w, -15], [w + 0.6, -2], [-w + 0.4, -3]], par, { flat: 0.85, grad: [-0.02, -0.02] });
    for (let y = -13; y < -4; y += 2) for (let x = -w + 2; x < w - 1; x++) if ((x * 7 + y * 3) % 5) P.set(x, y, hex('#6a4a8a'));
    P.ellipse(0, -9, 1.4, 1.4, R('#d84ab0'), { flat: 1 });
    P.outline(0.3);
    return P.toCanvas();
  });
}
const LETTERS = 'BREW';
export function letterSprite(i, fi) {
  return cached(`letter:${i}:${fi % 8}`, () => {
    const P = new Painter(20, 20, 10, 18, SS);
    const sx = Math.max(0.15, Math.abs(Math.cos((fi / 8) * Math.PI)));
    P.ellipse(0, -8, 7.2 * sx, 7.4, R('#f0c040'), { edge: true });
    P.ellipse(0, -8, 5.6 * sx, 5.8, R('#c87a28'), { flat: 0.6 });
    P.outline();
    const c = P.toCanvas();
    if (sx > 0.5) {
      const x = c.getContext('2d');
      x.save(); x.translate(10, 0); x.scale(sx, 1);
      const g = glyphFor(LETTERS[i]);
      x.fillStyle = '#fff6c8';
      for (let r = 0; r < 7; r++) for (let cc = 0; cc < 5; cc++) if (g[r][cc] === '#') x.fillRect(cc - 2.5, 7 + r - 0.5, 1, 1);
      x.restore();
    }
    return c;
  });
}
import { glyph as glyphFor } from './pix.js';

export function shotSprite(kind) {
  return cached(`shot:${kind}`, () => {
    const P = new Painter(16, 16, 8, 12, SS);
    if (kind === 'torch') { P.capsule(-3, 2, 2, -3, 1.3, 1.3, gloss('#f4ead0')); }
    else { P.ellipse(0, -1, 3, 3.4, R('#8ad8f0'), { flat: 0.85 }); P.capsule(0, -4, 0, -7, 1, 1, R('#8ad8f0')); P.ellipse(0, -7.4, 1.4, 1, R('#a0703a')); }
    P.outline();
    return P.toCanvas();
  });
}

// pieces for breaking cauldrons
export function shardSprite(kind, i) {
  return cached(`shard:${kind}:${i % 3}`, () => {
    const P = new Painter(8, 8, 4, 4, SS);
    const C = POT[kind] || POT.clay;
    P.poly([[-3, -2], [2 + (i % 2), -3], [3, 2], [-2, 3 - (i % 3)]], C.body, { flat: 0.5 + (i % 3) * 0.15 });
    P.outline();
    return P.toCanvas();
  });
}

// cart for the rail level: an iron cauldron on wheels
export function cartSprite(fi) {
  return cached(`cart:${fi % 4}`, () => {
    const P = new Painter(36, 28, 18, 26, SS);
    const metal = R('#5a6070');
    for (const x of [-7, 7]) {
      P.ellipse(x, -3, 3.4, 3.4, R('#2a2a34'), { edge: true });
      const a = (fi / 4) * Math.PI;
      P.set(x + Math.cos(a) * 2, -3 + Math.sin(a) * 2, metal[0]);
    }
    P.ellipse(0, -9, 11, 7, metal, { edge: true, clip: (x, y) => y > -14 });
    P.capsule(-11, -14, 11, -14, 1.5, 1.5, R('#8a90a0'));
    for (const x of [-7, -2, 3, 8]) P.set(x, -9, metal[0]);
    P.outline();
    return P.toCanvas();
  });
}

export function portrait(kind) {
  // head-and-hat icon for the HUD
  return cached(`portrait:${kind}`, () => {
    const P = new Painter(20, 22, 9, 25, SS);
    const st = poseOf(kind, 'idle', 0);
    if (kind === 'mags') drawMags(P, st); else drawPip(P, { ...st, ox: 0 });
    P.outline();
    return P.toCanvas();
  });
}

export { MAGS, PIP, mix, shadeCol };
