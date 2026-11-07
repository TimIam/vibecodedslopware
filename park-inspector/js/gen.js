// Procedural parks. Pure data (no three.js) so tools/simtest.mjs can generate thousands in node.
// A park is a ring path with targets (rides and facilities) around it. Every target carries its findings:
// inspection points, the paperwork and a test run. Defects are planted first, then each finding's text is
// written from its defect (or from plausible in-spec numbers), so the code book in code.js is the only judge.
import { makeRng } from './rng.js';
import { SEV } from './code.js';

const G = 9.81;
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

export const INFO = {
  coaster: { label: 'Roller coaster', fp: 0 },
  ferris: { label: 'Ferris wheel', fp: 10 },
  drop: { label: 'Drop tower', fp: 7 },
  swing: { label: 'Swing ride', fp: 12 },
  pirate: { label: 'Pirate ship', fp: 10 },
  food: { label: 'Food stand', fp: 4 },
  firstaid: { label: 'First aid', fp: 4 },
};

const NAMES = {
  coaster: ['The Widowmaker', 'Gravity\'s Revenge', 'Whiplash Express', 'The Spine Adjuster', 'Thunder Gulch', 'Screaming Eagle',
    'The Liability', 'Mr. Bones\' Wild Descent', 'Neckbreaker Junction', 'The Chiropractor', 'Big Lou\'s Lightning', 'Rattlesnake Run'],
  ferris: ['Sky Wheel', 'The Big Eye', 'Wheel of Fortune', 'Sunset Wheel', 'Grandpa\'s Wheel', 'The Slow Burn', 'Lookout Wheel', 'Circle of Life'],
  drop: ['The Plummet', 'Freefall 3000', 'Elevator of Doom', 'The Gut Punch', 'Sky Drop', 'Terminal Velocity', 'The Drop Zone', 'Gravity Well'],
  swing: ['Wave Swinger', 'Flying Chairs', 'The Whirligig', 'Sky Swings', 'Dizzy Dazzler', 'Centrifuge Jr.', 'The Twirl-o-Matic'],
  pirate: ['Black Pearl', 'The Kraken\'s Swing', 'Seasick Sally', 'Jolly Rocker', 'The Galleon', 'Davy Jones\' Locker', 'Captain Hurl'],
  food: ['Corn Dog Corral', 'Fry Me to the Moon', 'Big Al\'s Funnel Cakes', 'The Grease Pit', 'Lemonade Larry\'s', 'Nacho Business', 'Deep Fried Everything'],
  firstaid: ['First Aid', 'First Aid Station', 'Guest Health Services'],
};
const PARK_A = ['Uncle Gary\'s', 'Captain Sal\'s', 'Funtime', 'Big Lou\'s', 'Discount', 'Grandpa Dale\'s', 'Wally\'s', 'Thrillville',
  'Rusty Bolt', 'Sunny Acres', 'Lakeside', 'Bargain', 'Cousin Ricky\'s', 'Old Mill', 'Liberty Pier', 'Happy Valley'];
const PARK_B = ['Thrill Kingdom', 'Fun Acres', 'Adventure Park', 'Family Fun Zone', 'Wonderland', 'Amusement Pier', 'Joyland',
  'Funland USA', 'Thrill Farm', 'Midway', 'Pleasure Gardens', 'Ride-O-Rama'];
const FIRST = ['Gary', 'Darlene', 'Lou', 'Sal', 'Bev', 'Ricky', 'Dale', 'Tammy', 'Wally', 'Rhonda', 'Chet', 'Marge', 'Duane', 'Lorna'];
const LAST = ['Pruitt', 'Kowalski', 'Dupree', 'Haskins', 'McBride', 'Fontaine', 'Hoyt', 'Spurlock', 'Grubb', 'Tisdale', 'Pickett'];
const QUOTES = ['Everything\'s been fine since the last time you people came.', 'We fixed the thing. Mostly.',
  'My nephew does all the welding, he\'s very good.', 'Our guests love a little danger, it\'s the brand.',
  'You want a funnel cake? On the house. No reason.', 'Insurance says we\'re fine, so we\'re fine.',
  'That noise is normal. All rides make that noise.', 'Please don\'t touch anything, it\'s balanced.'];
const OPS = ['K. Doyle', 'R. Ybarra', 'T. Nguyen', 'M. Okafor', 'J. Pruitt Jr.', 'S. Patel', 'D. Fisk', 'L. Moreau'];

// ------------------------------------------------------------------------------------------------ dates
const DAY0 = Date.UTC(2027, 3, 5); // Mon 5 Apr 2027
export function dateFor(day) { return new Date(DAY0 + (day - 1) * 86400000); }
export function fmtDate(d) { return d.toISOString().slice(0, 10); }
export function prettyDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
const daysFrom = (d, n) => fmtDate(new Date(d.getTime() + n * 86400000));

// ================================================================================================ COASTER
// Plan: a superellipse loop (continuous curvature, so turns ease in). Profile: a polyline of (s, h) vertices
// with parabolic blends at each vertex; blend half-length sets the valley/crest radius and so the g-forces.
function superPlan(a, b, n) {
  const beta = Math.asin(Math.pow(0.45, n / 2));
  const th0 = Math.PI / 2 + beta;
  const N = 8000, raw = [];
  for (let k = 0; k <= N; k++) {
    const th = th0 - 2 * Math.PI * k / N, c = Math.cos(th), s = Math.sin(th);
    raw.push([a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
  }
  const cum = [0];
  for (let k = 1; k <= N; k++) cum.push(cum[k - 1] + Math.hypot(raw[k][0] - raw[k - 1][0], raw[k][1] - raw[k - 1][1]));
  const P = cum[N], ds = 0.5, M = Math.round(P / ds), out = [];
  let j = 0;
  for (let i = 0; i < M; i++) {
    const s = i * P / M;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([raw[j][0] + (raw[j + 1][0] - raw[j][0]) * t, raw[j][1] + (raw[j + 1][1] - raw[j][1]) * t]);
  }
  return { pts: out, P, ds: P / M };
}

function profile(verts) {
  // verts: [{s, h, b}] (b = desired blend half-length). Returns h(s).
  const n = verts.length;
  const m = []; for (let i = 0; i < n - 1; i++) m.push((verts[i + 1].h - verts[i].h) / (verts[i + 1].s - verts[i].s));
  const bl = verts.map((v, i) => {
    if (i === 0 || i === n - 1) return 0;
    const segIn = v.s - verts[i - 1].s, segOut = verts[i + 1].s - v.s;
    return Math.min(v.b, 0.49 * segIn, 0.49 * segOut);
  });
  return s => {
    for (let i = 1; i < n - 1; i++) {
      const v = verts[i], b = bl[i];
      if (b > 0 && s >= v.s - b && s <= v.s + b) {
        const mi = m[i - 1], mo = m[i];
        return v.h + mi * (s - v.s) + (mo - mi) * (s - v.s + b) ** 2 / (4 * b);
      }
    }
    let i = 0; while (i < n - 2 && s > verts[i + 1].s) i++;
    return verts[i].h + m[i] * (s - verts[i].s);
  };
}

const v3 = (x, y, z) => ({ x, y, z });
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const mul = (a, k) => v3(a.x * k, a.y * k, a.z * k);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return v3(a.x / l, a.y / l, a.z / l); };

function smoothArr(arr, w, closed = true) {
  const n = arr.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let t = 0, c = 0;
    for (let k = -w; k <= w; k++) {
      let j = i + k; if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue;
      const wt = w + 1 - Math.abs(k); t += arr[j] * wt; c += wt;
    }
    out[i] = t / c;
  }
  return out;
}

export function buildCoaster(p) {
  const { pts: plan, P, ds } = superPlan(p.a, p.b, p.n);
  const H = p.H, hv = p.hv;
  const verts = [{ s: 0, h: 1.0, b: 0 }, { s: 19, h: 1.0, b: 3 }];
  const sC = 19 + (H - 1) / 0.75;
  verts.push({ s: sC, h: H, b: 6 });
  // valleys and crests are short flats between two blended vertices, so each blend radius is free of the
  // slopes either side (R ~ 2b / slope change)
  let s = sC + (H - hv) / p.mDrop;
  verts.push({ s, h: hv, b: p.bV });
  s += 2.05 * p.bV;
  verts.push({ s, h: hv, b: p.bV });
  const sBrake = P - 30;
  const hills = [];
  for (const f of p.hills) {
    const hk = H * f, up = Math.max((hk - hv) / 0.8, 2.05 * Math.max(p.bC, p.bV2)), flC = 2.05 * p.bC, flV = 2.05 * p.bV2;
    if (s + 2 * up + flC + flV + 8 + (0.32 * H - hv) / 0.3 > sBrake) break;
    hills.push(hk);
    verts.push({ s: s + up, h: hk, b: p.bC });
    verts.push({ s: s + up + flC, h: hk, b: p.bC });
    s += 2 * up + flC;
    verts.push({ s, h: hv, b: p.bV2 });
    s += flV;
    verts.push({ s, h: hv, b: p.bV2 });
  }
  verts.push({ s: sBrake - 6, h: Math.max(2.2, 0.32 * H), b: 6 });
  verts.push({ s: sBrake + 4, h: Math.max(2.2, 0.32 * H), b: 4 });
  verts.push({ s: P - 6, h: 1.0, b: 3 });
  verts.push({ s: P, h: 1.0, b: 0 });
  const h = profile(verts);

  const N = plan.length;
  const pos = plan.map(([x, z], i) => v3(x, h(i * ds), z));
  const s3 = [0];
  for (let i = 1; i <= N; i++) s3.push(s3[i - 1] + Math.hypot(...Object.values(sub(pos[i % N], pos[i - 1]))));
  const L = s3[N];
  const sPlan = i => i * ds;

  // speed along the loop
  const iCrest = Math.round(sC / ds), iBrake = Math.round(sBrake / ds);
  const hC = pos[iCrest].y, vC = 3.0, mu = 0.012;
  const v = new Array(N);
  let vBrake0 = 0;
  for (let i = 0; i < N; i++) {
    const sp = sPlan(i);
    if (sp < 19) v[i] = 2;
    else if (i <= iCrest) v[i] = vC;
    else {
      const e = vC * vC + 2 * G * (hC - pos[i].y) - 2 * mu * G * (s3[i] - s3[iCrest]);
      let vi = Math.sqrt(Math.max(e, 0.01));
      if (i === iBrake) vBrake0 = vi;
      if (i >= iBrake) { const t = Math.min(1, (s3[i] - s3[iBrake]) / 18); const k = t * t * (3 - 2 * t); vi = vBrake0 + (2 - vBrake0) * k; }
      v[i] = vi;
    }
  }
  let vMinRun = Infinity, vMax = 0;
  for (let i = iCrest + 1; i < iBrake; i++) { vMinRun = Math.min(vMinRun, v[i]); vMax = Math.max(vMax, v[i]); }

  // frames and forces
  const T = [], K = [];
  for (let i = 0; i < N; i++) {
    const a = pos[(i - 2 + N) % N], b = pos[(i + 2) % N];
    T.push(norm(sub(b, a)));
  }
  for (let i = 0; i < N; i++) {
    const a = T[(i - 2 + N) % N], b = T[(i + 2) % N];
    let dsx = s3[i + 2 >= N ? (i + 2) - N : i + 2] - s3[i - 2 < 0 ? i - 2 + N : i - 2];
    if (dsx <= 0) dsx += L;
    K.push(mul(sub(b, a), 1 / dsx));
  }
  const Y = v3(0, 1, 0);
  const U0 = [], L0 = [], F = [];
  for (let i = 0; i < N; i++) {
    const t = T[i];
    const u0 = norm(sub(Y, mul(t, dot(Y, t))));
    U0.push(u0); L0.push(cross(t, u0));
    const ip = (i + 1) % N, im = (i - 1 + N) % N;
    let dsx = s3[i + 1] - s3[i === 0 ? N - 1 : i - 1]; if (i === 0) dsx = s3[1] + (L - s3[N - 1]);
    const dvds = (v[ip] - v[im]) / dsx;
    const f = add(add(mul(K[i], v[i] * v[i]), mul(t, v[i] * dvds)), v3(0, G, 0));
    F.push(f);
  }
  const bankF = i => {
    const x = pos[i].x;
    if (x > 0.5 * p.a) return p.bankA; if (x < -0.5 * p.a) return p.bankB; return 0.95;
  };
  let phi = F.map((f, i) => {
    const fu = dot(f, U0[i]), fl = dot(f, L0[i]);
    if (fu < 0.25 * G) return 0;
    return Math.max(-1.3, Math.min(1.3, Math.atan2(fl, fu))) * bankF(i);
  });
  phi = smoothArr(smoothArr(phi, 10), 10);
  const U = [], LAT = [];
  let gz = [], gl = [];
  for (let i = 0; i < N; i++) {
    const u = norm(add(mul(U0[i], Math.cos(phi[i])), mul(L0[i], Math.sin(phi[i]))));
    const l = cross(T[i], u);
    U.push(u); LAT.push(l);
    gz.push(dot(F[i], u) / G); gl.push(dot(F[i], l) / G);
  }
  gz = smoothArr(gz, 3); gl = smoothArr(gl, 3);
  let maxGz = -9, minGz = 9, maxLat = 0;
  for (let i = Math.round(19 / ds); i < iBrake; i++) {
    maxGz = Math.max(maxGz, gz[i]); minGz = Math.min(minGz, gz[i]); maxLat = Math.max(maxLat, Math.abs(gl[i]));
  }

  // timeline: dispatch from the station stop (plan s = 8), one lap, stop again
  const iStop = Math.round(8 / ds);
  const time = new Array(N + 1).fill(0);
  const tr = { t: [], gz: [], gl: [], v: [] };
  let t = 0;
  const order = [];
  for (let k = 0; k <= N; k++) order.push((iStop + k) % N);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (k > 0) {
      const j = order[k - 1];
      let dsx = s3[i] - s3[j]; if (dsx < 0) dsx += L;
      let vv = (v[i] + v[j]) / 2;
      if (k < 8) vv = Math.max(0.6, 2 * k / 8);
      if (k > order.length - 8) vv = Math.max(0.6, 2 * (order.length - k) / 8);
      t += dsx / vv;
    }
    time[k] = t;
    tr.t.push(r2(t)); tr.gz.push(r2(k < 4 || k > order.length - 4 ? 1 : gz[i])); tr.gl.push(r2(k < 4 || k > order.length - 4 ? 0 : gl[i])); tr.v.push(r1(v[i]));
  }

  // supports every 6 m where the track is off the ground (not in the station)
  const supports = [];
  for (let i = 0; i < N; i += 12) {
    const sp = sPlan(i);
    if (sp < 18 || sp > P - 3) continue;
    const sp0 = add(pos[i], mul(U[i], -0.55));
    if (sp0.y < 1.6) continue;
    supports.push({ i, x: r2(sp0.x), z: r2(sp0.z), top: r2(sp0.y - 0.05) });
  }
  return {
    params: p, P, L, N, ds, iStop, iCrest, iBrake, sLift: [19, sC], hills,
    pos: pos.map(q => [r2(q.x), r2(q.y), r2(q.z)]), up: U.map(q => [r2(q.x), r2(q.y), r2(q.z)]),
    s3: s3.slice(0, N).map(r2), v: v.map(r2), time, trace: tr, supports,
    m: { maxGz: r2(maxGz), minGz: r2(minGz), maxLat: r2(maxLat), vMax: r1(vMax), vMinRun: r1(vMinRun), H: r1(H), dur: r1(t) },
  };
}

function classifyCoaster(m) {
  return {
    gz: m.maxGz > 5.15 ? 2 : (m.maxGz > 4.6 && m.maxGz < 4.9) ? 1 : m.maxGz < 4.3 ? 0 : -1,
    neg: m.minGz < -1.15 ? 2 : m.minGz > -0.85 ? 0 : -1,
    lat: m.maxLat > 1.95 ? 2 : (m.maxLat > 1.6 && m.maxLat < 1.72) ? 1 : m.maxLat < 1.35 ? 0 : -1,
  };
}

function coasterFor(rng, want) {
  // want: null (clean) or {k:'gz'|'neg'|'lat', sev}
  let best = null;
  for (let tries = 0; tries < 160; tries++) {
    const p = {
      a: rng.range(70, 86), b: rng.range(15, 21), n: rng.range(2.6, 3.4), H: rng.range(20, 32), hv: rng.range(1.8, 2.6),
      mDrop: rng.range(0.85, 1.1), bV: rng.range(9, 13), bV2: rng.range(6, 9), bC: rng.range(8, 12),
      bankA: rng.range(0.85, 1.0), bankB: rng.range(0.85, 1.0),
      hills: [rng.range(0.55, 0.68), rng.range(0.38, 0.5), rng.range(0.25, 0.34)],
    };
    if (want?.k === 'gz') { p.bV = want.sev === 2 ? rng.range(4, 6.5) : rng.range(5.5, 8); p.H = rng.range(26, 33); }
    if (want?.k === 'neg') { p.bC = rng.range(2.5, 5); p.H = rng.range(24, 32); }
    if (want?.k === 'lat') { const f = want.sev === 2 ? rng.range(0.15, 0.45) : rng.range(0.4, 0.7); if (rng.chance(0.5)) p.bankA = f; else p.bankB = f; }
    const c = buildCoaster(p);
    if (c.m.vMinRun < 3.2 || c.hills.length < 2) continue;
    const k = classifyCoaster(c.m);
    const ok = !want ? (k.gz === 0 && k.neg === 0 && k.lat === 0)
      : (k[want.k] === want.sev && ['gz', 'neg', 'lat'].every(q => q === want.k || k[q] === 0));
    if (ok) return c;
    if (!best && !want && k.gz >= 0 && k.neg >= 0 && k.lat >= 0) best = c;
  }
  return best;
}

// ================================================================================================ FINDINGS
// Each kind: variants (defects it can carry) and write(rng, variant, target) → lines.
const pick = (rng, a) => rng.pick(a);
const KINDS = {
  support: {
    variants: [['1.1', 1, 'corrosion'], ['1.1', 2, 'corrosion'], ['1.2', 2, 'bolt'], ['1.2', 1, 'torque'], ['1.3', 2, 'weld']],
    write(rng, d) {
      const nom = pick(rng, [6.0, 8.0, 10.0, 12.5]);
      let loss = rng.range(0, 9.4);
      if (d?.v === 'corrosion') loss = d.sev === 2 ? rng.range(21, 38) : rng.range(10.8, 19.2);
      const th = nom * (1 - loss / 100);
      const bolts = d?.v === 'bolt' ? rng.int(2, 3) : 4;
      const tq = d?.v === 'torque' ? rng.int(55, 78) : rng.int(84, 108);
      return {
        lines: [`Wall thickness ${th.toFixed(1)} mm (nominal ${nom.toFixed(1)} mm, −${loss.toFixed(1)}%)`,
          `Anchor bolts: ${bolts} of 4 present · lowest torque ${tq}% of spec`,
          `Weld UT: ${d?.v === 'weld' ? `linear indication ${rng.int(6, 30)} mm at the weld toe` : 'no recordable indications'}`],
        tell: d?.v === 'corrosion' ? (rng.chance(d.sev === 2 ? 0.75 : 0.3) ? 'rust' : null)
          : d?.v === 'bolt' ? (rng.chance(0.85) ? 'bolt' : null) : d?.v === 'weld' ? (rng.chance(0.5) ? 'crack' : null) : null,
        boltsMissing: 4 - bolts,
      };
    },
  },
  splice: {
    variants: [['1.4', 1, 'offset'], ['1.4', 2, 'offset'], ['1.3', 2, 'weld']],
    write(rng, d) {
      let off = rng.range(0.1, 0.9);
      if (d?.v === 'offset') off = d.sev === 2 ? rng.range(3.3, 6.5) : rng.range(1.2, 2.8);
      return { lines: [`Rail offset at splice: ${off.toFixed(1)} mm`, 'Splice bolts: 8 of 8 tight',
        `Weld UT: ${d?.v === 'weld' ? `crack indication ${rng.int(8, 25)} mm, spine weld` : 'no recordable indications'}`],
      tell: d?.v === 'weld' && rng.chance(0.5) ? 'crack' : null };
    },
  },
  car: {
    variants: [['2.1', 2, 'bar'], ['2.2', 1, 'pad'], ['9.3', 1, 'wheel']],
    write(rng, d, tg) {
      const badRow = rng.int(1, 2), min = 148;
      const dia = d?.v === 'wheel' ? rng.range(141, 147.5) : rng.range(149, 156);
      return { lines: [1, 2].map(r => `Row ${r} lap bar: ${d?.v === 'bar' && r === badRow ? 'does not lock, lifts freely' : `locks, ${rng.int(3, 6)} positions`}`)
        .concat([`Road wheels: worst ${dia.toFixed(1)} mm (minimum ${min} mm)`,
          `Seat padding: ${d?.v === 'pad' ? `torn ${rng.int(8, 20)} cm, foam exposed` : 'intact'}`]),
      tell: d?.v === 'bar' && rng.chance(0.75) ? 'bar' : null, row: badRow };
    },
  },
  lift: {
    variants: [['9.2', 1, 'chain'], ['9.2', 2, 'chain'], ['9.4', 2, 'arb']],
    write(rng, d) {
      let e = rng.range(0.3, 1.8);
      if (d?.v === 'chain') e = d.sev === 2 ? rng.range(3.2, 4.6) : rng.range(2.1, 2.9);
      const n = rng.int(14, 24);
      return { lines: [`Lift chain elongation: ${e.toFixed(1)}%`,
        `Anti-rollback: ${d?.v === 'arb' ? `dog ${rng.int(2, n)} of ${n} does not drop into the rack` : `all ${n} dogs engage`}`] };
    },
  },
  estop: {
    variants: [['7.3', 2, 'estop']],
    write(rng, d) {
      const t = d ? rng.range(3.4, 6.5) : rng.range(0.8, 2.6);
      return { lines: [d && rng.chance(0.3) ? 'E-stop at full speed: no response, ride ran to end of cycle' : `E-stop at full speed: ride halted in ${t.toFixed(1)} s`,
        'Station gates: interlocked with dispatch'] };
    },
  },
  sign: {
    variants: [['6.1', 2, 'low']],
    write(rng, d, tg) {
      const min = tg.spec.minHeight;
      const mark = d ? min - rng.int(2, 6) : min + rng.pick([0, 0, 0, 1, 2, 3]);
      tg.spec.signMark = mark;
      return { lines: [`Sign marks ${mark} in. above grade`, `Manufacturer minimum rider height (spec plate): ${min} in.`], tell: 'sign' };
    },
  },
  fence: {
    variants: [['4.2', 1, 'gap']],
    write(rng, d) {
      return { lines: [`Perimeter fence: ${d ? `one ${pick(rng, [2, 2, 4])} m panel missing` : 'continuous, 1.1 m high'}`, 'Exit gate: self-closing'], tell: d ? 'fence' : null };
    },
  },
  panel: {
    variants: [['7.1', 2, 'open']],
    write(rng, d) {
      return { lines: [`Control panel door: ${d ? 'open and unlocked, energised terminals exposed (480 V)' : 'closed, locked'}`,
        `Ground fault test: ${rng.int(4, 9)} ms trip`], tell: d && rng.chance(0.85) ? 'panel' : null };
    },
  },
  level: {
    variants: [['8.1', 1, 'level'], ['8.1', 2, 'level']],
    write(rng, d) {
      let a = rng.range(0.05, 0.45);
      if (d) a = d.sev === 2 ? rng.range(1.15, 2.2) : rng.range(0.58, 0.95);
      return { lines: [`Digital level on the base: ${a.toFixed(2)}° out of level`, 'Shims and leveling jacks: tight'],
        tell: d?.sev === 2 && rng.chance(0.5) ? 'tilt' : null, tilt: a };
    },
  },
  bearing: {
    variants: [['8.2', 1, 'hot'], ['8.2', 2, 'hot']],
    write(rng, d) {
      let T = rng.range(36, 62);
      if (d) T = d.sev === 2 ? rng.range(81, 96) : rng.range(66, 78);
      return { lines: [`Main bearing temperature after a 10 min run: ${Math.round(T)} °C`, `Radial play: ${rng.range(0.05, 0.3).toFixed(2)} mm (spec 0.5 mm max)`] };
    },
  },
  gondola: {
    variants: [['2.1', 2, 'latch'], ['1.1', 1, 'floor']],
    write(rng, d) {
      const loss = d?.v === 'floor' ? rng.range(11, 19) : rng.range(0, 7);
      return { lines: [`Door latch: ${d?.v === 'latch' ? 'does not engage, door swings open' : 'engages, secondary pin present'}`,
        `Floor plate section loss: ${loss.toFixed(1)}%`], tell: d?.v === 'latch' && rng.chance(0.75) ? 'door' : null };
    },
  },
  drive: {
    variants: [['7.2', 1, 'guard']],
    write(rng, d) {
      return { lines: [`Drive gear guard: ${d ? 'missing' : 'in place, bolted'}`, `Motor current at full load: ${rng.int(60, 88)}% of rating`],
        tell: d && rng.chance(0.9) ? 'guard' : null };
    },
  },
  fins: {
    variants: [['9.5', 2, 'missing'], ['9.5', 1, 'thin']],
    write(rng, d, tg) {
      const min = 11.0, faces = ['A', 'B', 'C', 'D'], bad = rng.int(0, 3);
      const t = faces.map((f, i) => {
        if (d && i === bad) return d.v === 'missing' ? `${f} missing` : `${f} ${rng.range(9.0, 10.8).toFixed(1)} mm`;
        return `${f} ${rng.range(11.2, 12.4).toFixed(1)} mm`;
      });
      return { lines: [`Brake fin thickness: ${t.join(' · ')}`, `Minimum fin thickness (spec plate): ${min.toFixed(1)} mm`],
        tell: d?.v === 'missing' ? 'fin' : null, fin: bad };
    },
  },
  harness: {
    variants: [['2.1', 2, 'bar'], ['2.2', 1, 'pad']],
    write(rng, d) {
      return { lines: [`Harness: ${d?.v === 'bar' ? 'does not lock, rises under 5 kg' : `locks, ${rng.int(4, 7)} positions, secondary belt buckles`}`,
        `Shoulder padding: ${d?.v === 'pad' ? 'split, foam exposed' : 'intact'}`], tell: d?.v === 'bar' && rng.chance(0.7) ? 'bar' : null };
    },
  },
  cable: {
    variants: [['9.1', 1, 'wires'], ['9.1', 2, 'wires']],
    write(rng, d) {
      let n = rng.int(0, 2);
      if (d) n = d.sev === 2 ? rng.int(6, 11) : rng.int(3, 5);
      return { lines: [`Lift cable: ${n} broken wire${n === 1 ? '' : 's'} in the worst lay length`, `Diameter ${(16 - rng.range(0, 0.4)).toFixed(1)} mm (nominal 16.0 mm)`] };
    },
  },
  seat: {
    variants: [['2.1', 2, 'belt'], ['9.2', 1, 'chain']],
    write(rng, d) {
      const e = d?.v === 'chain' ? rng.range(2.1, 2.9) : rng.range(0.2, 1.6);
      return { lines: [`Seat restraint chain: ${d?.v === 'belt' ? 'missing' : 'present, latches'}`, `Hanger chain elongation: ${e.toFixed(1)}%`],
        tell: d?.v === 'belt' && rng.chance(0.8) ? 'belt' : null };
    },
  },
  envelope: {
    variants: [['4.1', 1, 'close'], ['4.1', 2, 'close']],
    write(rng, d, tg) {
      const R = tg.spec.sweptR;
      let c = rng.range(1.25, 3.2);
      if (d) c = d.sev === 2 ? rng.range(0.1, 0.42) : rng.range(0.55, 0.92);
      tg.spec.obstacle.dist = r2(R + c);
      return { lines: [`Swept seat radius at rated speed: ${R.toFixed(2)} m from centre`,
        `Nearest fixed object (${tg.spec.obstacle.kind === 'tree' ? 'tree' : 'lamp post'}): ${(R + c).toFixed(2)} m from centre`], tell: 'obstacle' };
    },
  },
  pbar: {
    variants: [['2.1', 2, 'bar'], ['2.2', 1, 'pad']],
    write(rng, d) {
      return { lines: [`Lap bar: ${d?.v === 'bar' ? 'ratchet slips, bar lifts under hand pressure' : `locks, ${rng.int(4, 8)} positions`}`,
        `Bar padding: ${d?.v === 'pad' ? 'torn, steel exposed' : 'intact'}`], tell: d?.v === 'bar' && rng.chance(0.7) ? 'bar' : null };
    },
  },
  tyre: {
    variants: [['9.3', 1, 'worn']],
    write(rng, d) {
      const min = 1150, dia = d ? rng.range(1100, 1146) : rng.range(1158, 1205);
      return { lines: [`Drive tyre diameter: ${Math.round(dia)} mm (minimum ${min} mm)`, `Tyre pressure: ${rng.int(28, 34)} psi`] };
    },
  },
  fridge: {
    variants: [['10.1', 1, 'warm'], ['10.1', 2, 'warm']],
    write(rng, d) {
      let T = rng.range(34, 40.5);
      if (d) T = d.sev === 2 ? rng.range(51, 62) : rng.range(42, 49);
      return { lines: [`Cooler probe (hot dogs, cheese sauce): ${T.toFixed(1)} °F`, `Thermometer in unit: ${d ? 'missing' : 'present'}`] };
    },
  },
  ext: {
    variants: [['10.2', 2, 'missing'], ['10.2', 1, 'tag']],
    write(rng, d) {
      if (d?.v === 'missing') return { lines: ['Fire extinguisher: empty bracket, none on site', 'Hood suppression: tagged'], tell: 'ext' };
      const mo = d ? rng.int(13, 30) : rng.int(1, 11);
      return { lines: [`Fire extinguisher tag: last inspected ${mo} months ago`, `Gauge: ${rng.chance(0.5) ? 'in the green' : 'charged'}`] };
    },
  },
  sink: {
    variants: [['10.3', 1, 'cold']],
    write(rng, d) {
      const T = d ? rng.range(62, 97) : rng.range(101, 118);
      return { lines: [`Hand sink water: ${Math.round(T)} °F after 30 s`, `Soap and towels: ${rng.chance(0.85) ? 'stocked' : 'stocked (barely)'}`] };
    },
  },
  staff: {
    variants: [['10.5', 2, 'empty']],
    write(rng, d) {
      return { lines: d ? ['Station locked. Note on door: "back in 5 min" (sun-faded)', 'Nobody answers the posted phone number']
        : [`On duty: ${pick(rng, FIRST)} ${pick(rng, LAST)}, EMT-B, cert #${rng.int(10000, 99999)}`, 'Radio check with ride ops: clear'] };
    },
  },
  aed: {
    variants: [['10.5', 1, 'pads']],
    write(rng, d, tg) {
      const exp = d ? daysFrom(tg.date, -rng.int(20, 400)) : daysFrom(tg.date, rng.int(60, 700));
      return { lines: [`AED self-test: pass`, `Electrode pads expire: ${exp}`] };
    },
  },
};

const PAPER = {
  ride: [['5.1', 2, 'ndt'], ['5.2', 1, 'cert'], ['5.3', 1, 'check'], ['5.4', 2, 'cap']],
  food: [['10.4', 2, 'permit'], ['5.3', 1, 'check']],
  firstaid: [['5.3', 1, 'check']],
};
function writePaper(rng, tg, defs) {
  const has = v => defs.find(d => d.v === v);
  const today = tg.date, lines = [];
  if (tg.kind === 'ride') {
    lines.push(`Spec plate: ${tg.spec.maker}, serial ${tg.spec.serial}, built ${tg.spec.year}`);
    lines.push(`Last NDT inspection: ${daysFrom(today, has('ndt') ? -rng.int(372, 640) : -rng.int(25, 340))}`);
    lines.push(`Operator ${pick(rng, OPS)} certification expires: ${daysFrom(today, has('cert') ? -rng.int(3, 120) : rng.int(15, 500))}`);
    const n = has('check') ? rng.int(3, 6) : 7;
    lines.push(`Daily pre-opening checklists signed: ${n} of last 7`);
    const cap = tg.spec.capacity;
    lines.push(`Design capacity (spec plate): ${cap} riders · posted at entrance: ${has('cap') ? cap + rng.pick([2, 4, 4, 6, 8]) : cap - rng.pick([0, 0, 0, 2])}`);
  } else if (tg.type === 'food') {
    lines.push(`Health permit expires: ${daysFrom(today, has('permit') ? -rng.int(5, 200) : rng.int(20, 330))}`);
    const staff = rng.int(2, 5);
    lines.push(`Food handler cards on file: ${staff} of ${staff} staff`);
    const n = has('check') ? rng.int(3, 6) : 7;
    lines.push(`Daily temperature logs signed: ${n} of last 7`);
  } else {
    const n = has('check') ? rng.int(3, 6) : 7;
    lines.push(`Daily supply checklists signed: ${n} of last 7`);
    lines.push(`Responder roster: ${rng.int(3, 6)} certified EMTs`);
  }
  return lines;
}

const TESTV = {
  coaster: [['3.1', 2, 'gz'], ['3.1', 1, 'gz'], ['3.1', 2, 'neg'], ['3.2', 2, 'lat'], ['3.2', 1, 'lat']],
  ferris: [['3.3', 1, 'rpm'], ['3.3', 2, 'rpm']],
  swing: [['3.3', 1, 'rpm'], ['3.3', 2, 'rpm']],
  pirate: [['3.3', 1, 'angle'], ['3.3', 2, 'angle']],
  drop: [['3.4', 1, 'margin'], ['3.4', 2, 'margin']],
};

function overRated(rng, rated, d) {
  if (!d) return rated * rng.range(0.82, 0.985);
  return rated * (d.sev === 2 ? rng.range(1.13, 1.3) : rng.range(1.025, 1.085));
}

function writeTest(rng, tg, d) {
  const sp = tg.spec;
  if (tg.type === 'coaster') {
    const m = tg.coaster.m, tr = tg.coaster.trace;
    const iMax = tr.gz.indexOf(Math.max(...tr.gz));
    return { lines: [`Peak +Gz: ${m.maxGz.toFixed(2)} g (at ${Math.round(tr.t[iMax])} s)`, `Minimum Gz: ${m.minGz.toFixed(2)} g`,
      `Peak lateral: ${m.maxLat.toFixed(2)} g`, `Top speed: ${Math.round(m.vMax * 3.6)} km/h · lap ${Math.round(m.dur)} s`],
    trace: { t: tr.t, series: [{ name: 'Vertical (Gz)', data: tr.gz, color: '#ff8a3d', lines: [4.5, 5.0, -1.0] },
      { name: 'Lateral', data: tr.gl, color: '#53c6ff', lines: [1.5, 1.8, -1.5, -1.8] }] } };
  }
  const t = [], a = [], b = [];
  if (tg.type === 'ferris' || tg.type === 'swing') {
    const rpm = overRated(rng, sp.rated, d);
    sp.testRpm = rpm;
    const ramp = tg.type === 'ferris' ? 25 : 12, dur = tg.type === 'ferris' ? 90 : 70;
    for (let k = 0; k <= 120; k++) {
      const tt = dur * k / 120; t.push(r1(tt));
      const up = Math.min(1, tt / ramp), down = Math.min(1, (dur - tt) / ramp);
      const w = rpm * Math.min(up, down) * (1 + 0.012 * Math.sin(tt * 1.7));
      a.push(r2(w));
      if (tg.type === 'swing') { const om = w * 2 * Math.PI / 60; b.push(r1(Math.atan(om * om * sp.armR / G) * 180 / Math.PI)); }
    }
    const series = [{ name: 'Speed (rpm)', data: a, color: '#ff8a3d', lines: [sp.rated, sp.rated * 1.1] }];
    if (tg.type === 'swing') series.push({ name: 'Seat swing-out (°)', data: b, color: '#53c6ff', scale: 0.1, lines: [] });
    return { lines: [`Rated speed (spec plate): ${r1(sp.rated)} rpm`, `Measured peak speed: ${rpm.toFixed(2)} rpm`].concat(
      tg.type === 'swing' ? [`Peak seat swing-out: ${Math.max(...b).toFixed(0)}°`] : [`E-stop from full speed: halted in ${rng.range(4, 9).toFixed(1)} s (wheel)`]),
    trace: { t, series } };
  }
  if (tg.type === 'pirate') {
    const ang = overRated(rng, sp.rated, d);
    sp.testAngle = ang;
    for (let k = 0; k <= 240; k++) {
      const tt = 80 * k / 240; t.push(r1(tt));
      const env = Math.min(1, tt / 35) * Math.min(1, (80 - tt) / 18);
      const th = ang * env * Math.sin(2 * Math.PI * tt / 6.2);
      a.push(r1(th));
      const thr = th * Math.PI / 180, thm = ang * env * Math.PI / 180;
      b.push(r2(3 * Math.cos(thr) - 2 * Math.cos(thm)));
    }
    return { lines: [`Rated swing angle (spec plate): ${Math.round(sp.rated)}°`, `Measured peak swing angle: ${ang.toFixed(1)}°`,
      `Peak +Gz at the ends: ${Math.max(...b).toFixed(2)} g`],
    trace: { t, series: [{ name: 'Swing angle (°)', data: a, color: '#ff8a3d', scale: 0.04, lines: [sp.rated, -sp.rated] }, { name: 'Gz (end rows)', data: b, color: '#53c6ff', lines: [] }] } };
  }
  // drop tower: lift, hold, free fall, magnetic braking
  let margin = rng.range(2.4, 4.2);
  if (d) margin = d.sev === 2 ? rng.range(0.15, 0.9) : rng.range(1.1, 1.85);
  const Hd = sp.dropH, brakeLen = Hd * 0.32, fall = Hd - brakeLen - margin;
  const vb = Math.sqrt(2 * G * fall), decel = vb * vb / (2 * (brakeLen)) / G;
  sp.margin = margin;
  let y = sp.towerTop0;
  for (let k = 0; k <= 300; k++) {
    const tt = 60 * k / 300; t.push(r1(tt));
    let gzz = 1;
    const tLift = 30, tHold = 36, tf = Math.sqrt(2 * fall / G);
    if (tt < tLift) y = 2 + Hd * (tt / tLift);
    else if (tt < tHold) y = 2 + Hd;
    else if (tt < tHold + tf) { const q = tt - tHold; y = 2 + Hd - 0.5 * G * q * q; gzz = 0.03; }
    else { const q = tt - tHold - tf, tb = vb / (decel * G); if (q < tb) { y = 2 + brakeLen + margin - (vb * q - 0.5 * decel * G * q * q); gzz = 1 + decel; } else { y = 2 + margin; gzz = 1; } }
    a.push(r2(y - 2)); b.push(r2(gzz));
  }
  return { lines: [`Free-fall height: ${Hd.toFixed(1)} m · peak braking ${(1 + decel).toFixed(2)} g`,
    `Carriage stopped ${margin.toFixed(2)} m above the bumpers`],
  trace: { t, series: [{ name: 'Height above bumpers (m)', data: a, color: '#ff8a3d', scale: 0.1, lines: [] }, { name: 'Gz', data: b, color: '#53c6ff', lines: [] }] } };
}

// points per target type (kind, label, anchor)
function pointsFor(tg, rng) {
  const P = [];
  const add = (kind, label, anchor) => P.push({ kind, label, anchor });
  switch (tg.type) {
    case 'coaster': {
      const sup = tg.coaster.supports;
      const picks = new Set();
      const want = Math.min(6, sup.length);
      const order = sup.map((s, i) => [i, s.top + rng.range(0, 8)]).sort((a, b) => b[1] - a[1]);
      for (const [i] of order) { if ([...picks].every(j => Math.abs(j - i) > 1)) picks.add(i); if (picks.size >= want) break; }
      [...picks].sort((a, b) => a - b).forEach((i, k) => add('support', `Support column C${i + 1}`, { sup: i }));
      const c = tg.coaster, ds = c.ds;
      const at = [Math.round(c.sLift[1] / ds) + 10, Math.round((c.sLift[1] + 26) / ds), Math.round(c.P * 0.62 / ds)];
      at.forEach((i, k) => add('splice', `Track splice at ${Math.round(c.s3[i % c.N])} m`, { track: i % c.N }));
      for (let k = 0; k < 4; k++) add('car', `Car ${k + 1}`, { car: k });
      add('lift', 'Lift chain and anti-rollback', { track: Math.round((c.sLift[0] + c.sLift[1]) / 2 / ds) });
      add('estop', 'Station E-stop and gates', { station: 'estop' });
      add('panel', 'Ride control panel', { station: 'panel' });
      add('sign', 'Height requirement sign', { sign: 1 });
      add('fence', 'Perimeter fence', { fence: 1 });
      break;
    }
    case 'ferris':
      for (let k = 0; k < 4; k++) add('support', `Leg footing ${'ABCD'[k]}`, { foot: k });
      add('level', 'Base level', { base: 1 });
      add('bearing', 'Axle bearings', { axle: 1 });
      add('drive', 'Drive and gear guard', { drive: 1 });
      for (let k = 0; k < 16; k++) add('gondola', `Gondola ${k + 1}`, { gond: k });
      add('panel', 'Ride control panel', { panel: 1 });
      add('fence', 'Perimeter fence', { fence: 1 });
      break;
    case 'drop':
      add('support', 'Base anchorage', { foot: 0 });
      add('fins', 'Magnetic brake fins', { fins: 1 });
      add('cable', 'Lift cable', { cable: 1 });
      add('support', 'Column splice at 12 m', { splice: 12 });
      add('support', 'Column splice at 24 m', { splice: 24 });
      for (let k = 0; k < 12; k++) add('harness', `Seat ${k + 1} harness`, { seat: k });
      add('panel', 'Ride control panel', { panel: 1 });
      add('sign', 'Height requirement sign', { sign: 1 });
      add('fence', 'Perimeter fence', { fence: 1 });
      break;
    case 'swing':
      add('level', 'Base level', { base: 1 });
      add('bearing', 'Canopy slewing bearing', { canopy: 1 });
      add('envelope', 'Seat envelope clearance', { obstacle: 1 });
      for (let k = 0; k < 16; k++) add('seat', `Swing seat ${k + 1}`, { seat: k });
      add('panel', 'Ride control panel', { panel: 1 });
      add('sign', 'Height requirement sign', { sign: 1 });
      add('fence', 'Perimeter fence', { fence: 1 });
      break;
    case 'pirate':
      for (let k = 0; k < 4; k++) add('support', `Frame footing ${'ABCD'[k]}`, { foot: k });
      add('bearing', 'Pivot bearings', { axle: 1 });
      add('tyre', 'Drive tyre', { tyre: 1 });
      for (let r = 0; r < 5; r++) for (const sd of ['port', 'starboard']) add('pbar', `Row ${r + 1} ${sd} lap bar`, { row: r, side: sd });
      add('panel', 'Ride control panel', { panel: 1 });
      add('sign', 'Height requirement sign', { sign: 1 });
      add('fence', 'Perimeter fence', { fence: 1 });
      break;
    case 'food':
      add('fridge', 'Cold holding', { fridge: 1 });
      add('ext', 'Fire extinguisher', { ext: 1 });
      add('sink', 'Hand sink', { sink: 1 });
      add('panel', 'Electrical panel', { panel: 1 });
      break;
    case 'firstaid':
      add('staff', 'Staffing', { door: 1 });
      add('aed', 'AED cabinet', { aed: 1 });
      add('ext', 'Fire extinguisher', { ext: 1 });
      break;
  }
  return P;
}

const MAKERS = ['Zamperla-ish Rides', 'Chance & Sons', 'Hoosier Steel Amusements', 'Big Wheel Mfg.', 'Kiddie Kraft', 'Ozark Ride Works', 'Midwest Fabrication Co.'];

function makeTarget(type, rng, park, idx, wants) {
  const tg = { id: `t${idx}`, type, kind: (type === 'food' || type === 'firstaid') ? type : 'ride', date: park.dateObj,
    name: '', spec: {}, findings: [], colors: {} };
  const hue = rng.range(0, 360);
  tg.colors = { a: `hsl(${hue.toFixed(0)},${rng.int(55, 80)}%,${rng.int(42, 52)}%)`, b: `hsl(${((hue + rng.pick([40, 150, 180, 200])) % 360).toFixed(0)},${rng.int(60, 85)}%,${rng.int(50, 62)}%)` };
  const sp = tg.spec;
  sp.maker = rng.pick(MAKERS); sp.serial = `${rng.pick(['A', 'B', 'K', 'Z'])}${rng.int(1000, 9999)}-${rng.int(10, 99)}`; sp.year = rng.int(1979, 2021);
  if (type === 'coaster') { sp.minHeight = rng.pick([48, 48, 52, 54]); sp.capacity = 16; }
  if (type === 'ferris') { sp.rated = rng.pick([1.5, 2.0, 2.0, 2.5]); sp.capacity = 64; }
  if (type === 'drop') { sp.minHeight = rng.pick([48, 52, 54]); sp.capacity = 12; sp.sections = rng.int(8, 11); sp.dropH = sp.sections * 4 - 6; sp.towerTop0 = sp.sections * 4; }
  if (type === 'swing') {
    sp.minHeight = rng.pick([42, 48, 48]); sp.capacity = 16; sp.rated = rng.pick([9, 10, 10, 11]);
    const om = sp.rated * 2 * Math.PI / 60;
    let ang = 0.6; for (let k = 0; k < 30; k++) { const R = 5.4 + 5.0 * Math.sin(ang); ang = Math.atan(om * om * R / G); }
    sp.armR = 5.4 + 5.0 * Math.sin(ang); sp.sweptR = r2(sp.armR + 0.4);
    sp.obstacle = { kind: rng.pick(['tree', 'lamp']), ang: rng.range(0, Math.PI * 2), dist: 0 };
  }
  if (type === 'pirate') { sp.minHeight = rng.pick([42, 44, 48]); sp.capacity = 40; sp.rated = rng.pick([70, 72, 75, 80]); }
  tg.name = rng.pick(NAMES[type].filter(n => !park.usedNames.has(n)));
  park.usedNames.add(tg.name);

  // which findings carry defects
  const testWant = wants.test;
  if (type === 'coaster') tg.coaster = coasterFor(rng, testWant ? { k: testWant[2], sev: testWant[1] } : null) || coasterFor(rng, null);
  const pts = pointsFor(tg, rng);
  const pool = pts.map((p, i) => ({ ref: i, w: p.kind === 'gondola' || p.kind === 'seat' || p.kind === 'harness' || p.kind === 'pbar' ? 0.35 : p.kind === 'sign' ? 2 : 1 }));
  const chosen = new Map();
  for (let k = 0; k < wants.points; k++) {
    const avail = pool.filter(p => !chosen.has(p.ref) && KINDS[pts[p.ref].kind].variants.length);
    if (!avail.length) break;
    const pr = rng.weighted(avail.map(p => [p, p.w]));
    const kv = KINDS[pts[pr.ref].kind].variants;
    let vs = kv.filter(v => v[1] === (rng.chance(park.majorP) ? 2 : 1));
    if (!vs.length) vs = kv;
    const v = rng.pick(vs);
    chosen.set(pr.ref, { code: v[0], sev: v[1], v: v[2] });
  }
  pts.forEach((p, i) => {
    const d = chosen.get(i) || null;
    const w = KINDS[p.kind].write(rng, d, tg);
    tg.findings.push({ id: `${tg.id}p${i}`, group: 'point', kind: p.kind, label: p.label, anchor: p.anchor, lines: w.lines,
      defect: d ? { code: d.code, sev: d.sev, v: d.v } : null, tell: w.tell || null, extra: { boltsMissing: w.boltsMissing, row: w.row, fin: w.fin, tilt: w.tilt } });
  });
  // paperwork
  const pk = tg.kind === 'ride' ? PAPER.ride : PAPER[type];
  const pdefs = [];
  for (let k = 0; k < wants.paper; k++) {
    let vs = pk.filter(v => v[1] === (rng.chance(park.majorP) ? 2 : 1) && !pdefs.find(d => d.v === v[2]));
    if (!vs.length) vs = pk.filter(v => !pdefs.find(d => d.v === v[2]));
    if (!vs.length) break;
    const v = rng.pick(vs); pdefs.push({ code: v[0], sev: v[1], v: v[2] });
  }
  const worstP = pdefs.reduce((a, d) => (!a || d.sev > a.sev ? d : a), null);
  tg.findings.push({ id: `${tg.id}paper`, group: 'paper', kind: 'paper', label: 'Paperwork and spec plate', lines: writePaper(rng, tg, pdefs),
    defect: worstP ? { code: pdefs.map(d => d.code).join(', '), sev: worstP.sev, v: pdefs.map(d => d.v).join(',') } : null, tell: null });
  // test run
  if (TESTV[type]) {
    let d = null;
    if (testWant) {
      if (type === 'coaster') {
        const k = classifyCoaster(tg.coaster.m);
        const hit = ['gz', 'neg', 'lat'].find(q => k[q] > 0);
        if (hit) d = { code: hit === 'lat' ? '3.2' : '3.1', sev: k[hit], v: hit };
      } else d = { code: testWant[0], sev: testWant[1], v: testWant[2] };
    }
    const w = writeTest(rng, tg, d);
    tg.findings.push({ id: `${tg.id}test`, group: 'test', kind: 'test', label: 'Test run with dummies', lines: w.lines, trace: w.trace, defect: d, tell: null });
  }
  tg.truth = Math.max(0, ...tg.findings.map(f => f.defect?.sev || 0));
  return tg;
}

// ================================================================================================ HINTS
function hintFor(rng, tg, f) {
  const n = tg.name, d = f.defect;
  const H = {
    gz: [`Guest email: "Blacked out at the bottom of the first drop on ${n}. 10/10."`, `Ride op: "${n} has been running hot since the track work. People come off it grey."`],
    neg: [`Guest email: "Left my seat on ${n}. Physically. On the second hill."`],
    lat: [`Guest email: "My husband's head hit my head in the big turn on ${n}. Twice."`],
    bar: [`Ride op note: "One of the bars on ${n} is a bit springy, we just tell them to hold on."`],
    latch: [`Guest email: "Our gondola door on ${n} opened by itself at the top. Lovely view though."`],
    belt: [`Guest email: "My kid's swing on ${n} didn't have the little chain. She held on great!"`],
    warm: [`Anonymous tip: "The hot dogs at ${n} are warm on the inside, and not in the good way."`],
    empty: [`Guest email: "Tried to get a band-aid at ${n}. Locked. Bled on a churro."`],
    ndt: [`Records office: no NDT report on file for ${n} this year.`],
    cap: [`Guest email: "They crammed nine of us into a row on ${n}. Fun!"`],
    rpm: [`Guest email: "${n} feels like it's going faster than it used to??"`],
    angle: [`Guest email: "${n} went nearly vertical today. Is it supposed to do that"`],
    margin: [`Ride op note: "${n} has been landing a bit hard on the bumpers lately."`],
    open: [`Maintenance: "Somebody keeps leaving the panel open at ${n}, we'll get to it."`],
    hot: [`Ride op: "${n} squeals a lot more this season."`],
    close: [`Guest email: "On ${n} my foot clipped something. Is that part of the ride?"`],
    missing: [`Maintenance: "We borrowed some parts off ${n}, it still stops fine."`],
  };
  const key = (d.v || '').split(',')[0];
  const opts = H[key];
  return opts ? rng.pick(opts) : null;
}

// ================================================================================================ PARK
export function genPark(seed, day = 1) {
  const rng = makeRng((seed * 7919 + day * 104729) >>> 0);
  const dateObj = dateFor(day);
  const park = { seed, day, date: fmtDate(dateObj), dateObj, pretty: prettyDate(dateObj), usedNames: new Set(),
    name: `${rng.pick(PARK_A)} ${rng.pick(PARK_B)}`, owner: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, quote: rng.pick(QUOTES),
    majorP: Math.min(0.6, 0.4 + day * 0.02), targets: [], briefing: [] };

  // pick targets: more and bigger rides as the career goes on
  const rides = ['ferris', 'drop', 'swing', 'pirate'];
  const nRides = Math.min(5, 1 + Math.ceil(day / 2) + rng.int(0, 1));
  const types = [];
  if (day >= 3 || rng.chance(0.25 + day * 0.1)) types.push('coaster');
  rng.shuffle(rides.slice()).slice(0, nRides - types.length).forEach(t => types.push(t));
  types.push('food');
  if (day >= 2) types.push('firstaid');
  if (day >= 4 && rng.chance(0.5)) types.push('food');

  // defect budget per target
  const nDefects = () => rng.weighted([[0, 0.34], [1, 0.36], [2, 0.2], [3, 0.1]]);
  types.forEach((type, i) => {
    let n = nDefects();
    const wants = { points: 0, paper: 0, test: null };
    while (n-- > 0) {
      const src = rng.weighted([['points', 0.62], ['paper', 0.2], ['test', TESTV[type] ? 0.18 : 0]]);
      if (src === 'test' && !wants.test) {
        let vs = TESTV[type].filter(v => v[1] === (rng.chance(park.majorP) ? 2 : 1)); if (!vs.length) vs = TESTV[type];
        wants.test = rng.pick(vs);
      } else if (src === 'paper') wants.paper++;
      else wants.points++;
    }
    park.targets.push(makeTarget(type, rng, park, i, wants));
  });

  // layout: ring path, entrance south (+z), coaster north, the rest outside the ring
  // (angles are atan2(z, x); the coaster owns the whole north side, so with one the rest share the south half)
  const others = park.targets.filter(t => t.type !== 'coaster');
  const hasC = park.targets.some(t => t.type === 'coaster');
  const arcs = hasC ? [[-0.22, Math.PI / 2 - 0.62], [Math.PI / 2 + 0.62, Math.PI + 0.22]] : [[-Math.PI / 2, Math.PI / 2 - 0.62], [Math.PI / 2 + 0.62, 1.5 * Math.PI]];
  const arcLen = arcs.reduce((a, [p, q]) => a + q - p, 0);
  const total = others.reduce((a, t) => a + 2 * INFO[t.type].fp + 14, 0);
  const ringR = Math.max(42, total / (arcLen * 0.95) - 14);
  park.ringR = r1(ringR);
  park.entrance = { x: 0, z: r1(ringR + 34) };
  let acc = rng.range(0, 0.25) * (arcLen - total / (ringR + 14));
  const scale = arcLen / Math.max(arcLen, total / (ringR + 14)) * 0.96;
  rng.shuffle(others);
  others.forEach(t => {
    const fp = INFO[t.type].fp, rr = ringR + fp + 8;
    const w = (2 * fp + 14) / (ringR + 14) * scale;
    let a = acc + w / 2; acc += w + Math.max(0, (arcLen - total / (ringR + 14)) / others.length * 0.9);
    let ang = arcs[0][0] + a;
    if (ang > arcs[0][1]) ang = arcs[1][0] + (ang - arcs[0][1]);
    t.ang = ang;
    t.x = r1(Math.cos(ang) * rr); t.z = r1(Math.sin(ang) * rr);
    t.rot = Math.atan2(-t.x, -t.z);
    t.spur = { x0: r1(Math.cos(ang) * ringR), z0: r1(Math.sin(ang) * ringR) };
  });
  for (const t of park.targets.filter(t => t.type === 'coaster')) {
    const b = t.coaster.params.b;
    t.x = 0; t.z = r1(-(ringR + b + 16)); t.rot = 0; t.ang = -Math.PI / 2;
    t.spur = { x0: 0, z0: -ringR };
  }

  // briefing: complaints that point at real defects (and one that doesn't)
  const hints = [];
  for (const tg of park.targets) for (const f of tg.findings) if (f.defect && rng.chance(0.45)) { const h = hintFor(rng, tg, f); if (h) hints.push(h); }
  rng.shuffle(hints);
  park.briefing = hints.slice(0, 3);
  if (rng.chance(0.5)) {
    const tg = rng.pick(park.targets.filter(t => t.truth === 0).concat(park.targets.slice(0, 1)));
    park.briefing.push(rng.pick([`Guest email: "${tg.name} is way too boring. Make it scarier."`, `Guest email: "The music near ${tg.name} is too loud and also bad."`,
      `Guest email: "Someone on ${tg.name} looked at me funny."`]));
  }
  delete park.usedNames;
  return park;
}

export function truthVerdict(tg) { return ['approve', 'cite', 'redtag'][tg.truth]; }
