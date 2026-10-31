/* Desktop Bag — game layer.
 *
 * The wind (ambient drift + gusts + curl-noise turbulence + warm-pavement thermals +
 * drifting eddies + your cursor) pushes the bag around. Beauty accrues while it's
 * airborne, scaled by a grace combo that builds the longer it stays up; noticed moments
 * (loops, hanging still, near-landings, rising, dancing with a leaf) pay out bonuses.
 * Spend beauty on wind, company, cameras and patience. End the tape to shelve it and
 * start a new season with a permanent multiplier.
 */
(() => {
  'use strict';

  const DB = window.desktopBag || null;
  const DEMO = !DB;
  if (DEMO) document.body.classList.add('demo');

  const $ = (id) => document.getElementById(id);
  const cvs = $('c'), ctx = cvs.getContext('2d');
  const TAU = Math.PI * 2;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ERR = [];
  addEventListener('error', (e) => ERR.push(String(e.message)));

  let W = 0, H = 0, DPR = 1, FLOOR = 0;
  const TASKBAR = 44;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, innerWidth); H = Math.max(240, innerHeight);
    FLOOR = DEMO ? H - TASKBAR : H;
    cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR);
  }
  addEventListener('resize', resize);
  resize();

  // ======================================================================== content
  const THEMES = [
    { name: 'October', one: 'a leaf', company: 'A leaf', kind: 'leaf',
      colors: ['#d9822b', '#c0392b', '#e8b04a', '#9c5a2b', '#b5651d', '#d4a017'], bag: 'rgba(250,250,252,0.64)' },
    { name: 'First snow', one: 'a snowflake', company: 'A snowflake', kind: 'snow',
      colors: ['#ffffff', '#eef4ff', '#dfeaff'], bag: 'rgba(238,245,255,0.62)' },
    { name: 'April', one: 'a petal', company: 'A petal', kind: 'petal',
      colors: ['#f7c6d9', '#f4a9c4', '#fde2ec', '#ffffff', '#f9b8cf'], bag: 'rgba(255,250,252,0.64)' },
    { name: 'Midsummer night', one: 'a firefly', company: 'A firefly', kind: 'firefly',
      colors: ['#e8ff8a', '#fff3a0', '#c8ff6a'], bag: 'rgba(255,248,236,0.56)' },
    { name: 'Everything at once', one: 'a friend', company: 'A friend', kind: 'mix',
      colors: ['#d9822b', '#f4a9c4', '#ffffff', '#e8ff8a', '#c0392b'], bag: 'rgba(250,250,252,0.64)' },
  ];

  const UPS = [
    { id: 'breeze', tab: 'wind', name: 'Steadier breeze', max: 10, base: 15, k: 1.55,
      desc: 'More wind, more often. Gusts come sooner.' },
    { id: 'thermal', tab: 'wind', name: 'Warm pavement', max: 10, base: 40, k: 1.6,
      desc: 'Heat rising off the ground. Landings become lift-offs.' },
    { id: 'hand', tab: 'wind', name: 'Your hand', max: 8, base: 25, k: 1.5,
      desc: 'Your cursor pushes more air, from farther away.' },
    { id: 'eddies', tab: 'wind', name: 'Eddies', max: 8, base: 120, k: 1.75,
      desc: 'Little whirlpools of air wander through. Loops happen.' },
    { id: 'company', tab: 'company', name: () => theme().company, max: 14, base: 30, k: 1.45,
      desc: () => `${cap(theme().one)} to dance with. Drifting together is worth noticing.` },
    { id: 'bags', tab: 'company', name: 'Another bag', max: 2, base: 6000, k: 12,
      desc: 'A second bag in the same wind. Neither of them planned it.' },
    { id: 'look', tab: 'patience', name: 'Look closer', max: 10, base: 60, k: 1.8,
      desc: 'The moments when it hangs perfectly still are worth far more.' },
    { id: 'still', tab: 'patience', name: 'Stillness', max: 10, base: 90, k: 1.7,
      desc: 'Grace builds higher while it floats, and fades slower when it lands.' },
  ];

  const CAMERAS = [
    { name: 'Phone', mult: 1, desc: 'Vertical. Smudged. It still counts.' },
    { name: 'Camcorder', cost: 250, mult: 2, desc: 'Tape hiss and a red light. Now it feels like you’re recording something.' },
    { name: 'Hi8 Handycam', cost: 1800, mult: 4, desc: 'A little sharper. A strap for your hand.' },
    { name: '16mm Bolex', cost: 12000, mult: 8, desc: 'Every foot of film costs something. You wait for the good parts.' },
    { name: '35mm', cost: 80000, mult: 16, desc: 'Cinema. The bag doesn’t know. The bag doesn’t need to.' },
    { name: 'Your own eyes', cost: 500000, mult: 40, desc: 'You stop recording and just watch. It’s worth the most.' },
  ];

  const LINES = [
    'Nobody asked it to dance.',
    'It has nowhere to be. For a minute, neither do you.',
    'The wind doesn’t know it’s being watched.',
    'It held groceries once. Now it holds air.',
    'A thing made to be thrown away, refusing.',
    'Your cursor is weather now.',
    'Breathe out. It’s still up there.',
    'Every gust is a first draft.',
    'No two afternoons move the same way.',
    'Somewhere, a leaf blower is taking this personally.',
    'The wall is patient. The bag is not.',
    'Ordinary things, paying attention back.',
    'Look how long it stays up.',
    'It isn’t going anywhere. That’s the point.',
  ];

  const TAPE_MIN = 50000;
  const tapeGain = (tb) => Math.floor(Math.sqrt(tb / TAPE_MIN));

  // ======================================================================== state
  const SAVE_KEY = 'desktop-bag-v1';
  const fresh = () => ({
    beauty: 0, lifetime: 0, tapeBeauty: 0, tapes: 0, tapeSecs: 0, cam: 0,
    lv: { breeze: 0, thermal: 0, hand: 0, eddies: 0, company: 0, bags: 0, look: 0, still: 0 },
    settings: { opacity: 0.92, size: 1, sound: false, onTop: true, lowPower: false, paused: false },
    shelf: [], moments: [],
    stats: { loops: 0, flips: 0, suspended: 0, almost: 0, rising: 0, duets: 0, lifted: 0, airtime: 0 },
    avgRate: 0, lastSeen: Date.now(), seenIntro: false,
  });
  let S = fresh();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw), f = fresh();
      S = Object.assign(f, o);
      S.lv = Object.assign(f.lv, o.lv); S.settings = Object.assign(f.settings, o.settings); S.stats = Object.assign(f.stats, o.stats);
    }
  } catch (e) { /* first run or storage blocked */ }
  function save() {
    S.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  const theme = () => THEMES[S.shelf.length % THEMES.length];
  const gmult = () => CAMERAS[S.cam].mult * (1 + 0.5 * S.tapes);
  const cost = (u) => Math.ceil(u.base * Math.pow(u.k, S.lv[u.id]));
  const nm = (u) => (typeof u.name === 'function' ? u.name() : u.name);
  const ds = (u) => (typeof u.desc === 'function' ? u.desc() : u.desc);

  let P;
  function params() {
    const L = S.lv;
    P = {
      amb: 40 + 8 * L.breeze, turb: 30 + 5 * L.breeze, thermal: 46 + 15 * L.thermal,
      gustEvery: 11 / (1 + 0.12 * L.breeze),
      vortN: L.eddies ? 1 + Math.floor(L.eddies / 2) : 0, vortS: 80 + 20 * L.eddies,
      handGain: 0.5 + 0.14 * L.hand, handR: 110 + 22 * L.hand,
      comboCap: 2 + 0.5 * L.still, comboDecay: 0.6 * (1 - 0.07 * L.still),
      suspMult: 2 + 0.6 * L.look, suspSpeed: 26 + 3 * L.look,
      // more going on = more to notice: every upgrade lifts the base rate
      airRate: 0.6 + 0.12 * L.breeze + 0.1 * L.thermal + 0.15 * L.eddies + 0.05 * L.hand + 0.06 * L.company,
    };
  }
  params();

  // ======================================================================== wind
  const WIND = { t: rand() * 100, ax: 0, ay: 0, gust: 0, gustT: 4, gustDir: 1, mag: 0 };
  const VORT = [];
  const CUR = { x: -9999, y: -9999, rx: -9999, ry: -9999, lx: null, ly: null, vx: 0, vy: 0, fresh: false };

  function updateWind(dt) {
    WIND.t += dt;
    const t = WIND.t;
    const n1 = Bag.noise3(t * 0.035, 1.7, 0.3), n2 = Bag.noise3(t * 0.05, 9.1, 4.2);
    const strength = P.amb * (0.55 + 0.75 * (n2 * 0.5 + 0.5));
    WIND.gustT -= dt;
    if (WIND.gustT <= 0) {
      WIND.gustT = P.gustEvery * (0.5 + rand());
      WIND.gustDir = n1 >= 0 ? 1 : -1;
      WIND.gustTarget = 0.8 + rand() * 0.8;
    }
    // gusts swell in over ~0.4 s, then die away over a couple of seconds
    if (WIND.gustTarget) { WIND.gust += (WIND.gustTarget - WIND.gust) * Math.min(1, dt * 5); if (WIND.gust > WIND.gustTarget * 0.95) WIND.gustTarget = 0; }
    else WIND.gust *= Math.exp(-dt * 0.7);
    const g = WIND.gust;
    WIND.ax = strength * clamp(n1 * 1.6, -1, 1) * (1 + 1.4 * g) + WIND.gustDir * g * 40;
    WIND.ay = strength * 0.25 * Bag.noise3(t * 0.07, 3.3, 8.8) - g * 75;
    WIND.mag = Math.hypot(WIND.ax, WIND.ay);

    // eddies drift with the wind and get replaced when they wander off
    while (VORT.length < P.vortN) VORT.push(newVortex(true));
    VORT.length = Math.min(VORT.length, P.vortN);
    for (let i = 0; i < VORT.length; i++) {
      const v = VORT[i];
      v.x += (WIND.ax * 0.6 + v.vx) * dt; v.y += v.vy * dt; v.life -= dt;
      v.s = v.dir * P.vortS * Math.min(1, v.age += dt * 0.5) * Math.min(1, v.life * 0.5);
      if (v.life <= 0 || v.x < -300 || v.x > W + 300) VORT[i] = newVortex(false);
    }
  }
  function newVortex(anywhere) {
    return {
      x: anywhere ? rand() * W : (WIND.ax > 0 ? -150 : W + 150),
      y: H * 0.15 + rand() * (FLOOR - H * 0.15 - 90),
      vx: (rand() - 0.5) * 20, vy: (rand() - 0.5) * 10,
      r: 80 + rand() * 90, dir: rand() < 0.5 ? -1 : 1, s: 0, age: 0, life: 18 + rand() * 20,
    };
  }

  function wind(x, y, out) {
    let wx = WIND.ax, wy = WIND.ay;
    // turbulence: curl of a drifting noise field (divergence-free, so it swirls)
    const s = 1 / 240, X = x * s, Y = y * s, Z = WIND.t * 0.09, e = 0.06;
    const A = P.turb * (1 + WIND.gust) * 0.5 / (2 * e);
    wx += A * (Bag.noise3(X, Y + e, Z) - Bag.noise3(X, Y - e, Z));
    wy -= A * (Bag.noise3(X + e, Y, Z) - Bag.noise3(X - e, Y, Z));
    // warm pavement
    const h = FLOOR - y;
    wy -= P.thermal * Math.exp(-Math.max(0, h) / 230);
    // the room: a soft pull away from the side walls and the top of the screen
    wx += (W * 0.5 - x) / (W * 0.5) * 22;
    if (x < 160) wx += (160 - x) * 1.6; else if (x > W - 160) wx -= (x - (W - 160)) * 1.6;
    if (y < H * 0.12) wy += (H * 0.12 - y) * 0.7;
    // eddies (Lamb–Oseen-ish, localised)
    for (let i = 0; i < VORT.length; i++) {
      const v = VORT[i], dx = x - v.x, dy = y - v.y, d2 = dx * dx + dy * dy, r2 = v.r * v.r;
      if (d2 > r2 * 9) continue;
      const d = Math.sqrt(d2) + 1e-3;
      const vt = v.s * (1 - Math.exp(-d2 / r2)) * v.r / d * Math.exp(-d2 / (r2 * 6));
      wx += -dy / d * vt; wy += dx / d * vt;
    }
    // your hand
    const dx = x - CUR.x, dy = y - CUR.y, d2 = dx * dx + dy * dy, R2 = P.handR * P.handR;
    if (d2 < R2 * 6) { const f = Math.exp(-d2 / R2) * P.handGain; wx += CUR.vx * f; wy += CUR.vy * f; }
    out.x = wx; out.y = wy;
  }

  function updateCursor(dt) {
    if (CUR.lx === null || !CUR.fresh) { CUR.lx = CUR.rx; CUR.ly = CUR.ry; CUR.fresh = CUR.rx > -9000; }
    let ivx = (CUR.rx - CUR.lx) / dt, ivy = (CUR.ry - CUR.ly) / dt;
    const sp = Math.hypot(ivx, ivy);
    if (sp > 1100) { ivx *= 1100 / sp; ivy *= 1100 / sp; }
    const k = Math.min(1, dt * 10);
    CUR.vx += (ivx - CUR.vx) * k; CUR.vy += (ivy - CUR.vy) * k;
    CUR.lx = CUR.rx; CUR.ly = CUR.ry; CUR.x = CUR.rx; CUR.y = CUR.ry;
  }
  if (DB) DB.onCursor((p) => { CUR.rx = p.x; CUR.ry = p.y; });
  else {
    addEventListener('mousemove', (e) => { CUR.rx = e.clientX; CUR.ry = e.clientY; });
    addEventListener('mouseleave', () => { CUR.rx = CUR.ry = -9999; CUR.fresh = false; });
  }

  // ======================================================================== bags
  let bags = [];
  const BOX = () => ({ left: 4, right: W - 4, top: -70, bottom: FLOOR - 1 });
  function makeBags(keep) {
    const want = 1 + S.lv.bags, s = S.settings.size;
    const next = [];
    for (let i = 0; i < want; i++) {
      const old = keep && bags[i];
      const b = Bag.make(old ? old.cx : W * (0.35 + 0.3 * i), old ? old.cy : FLOOR - 220 - i * 60, s);
      b.g = { combo: old ? old.g.combo : 1, suspT: 0, susp: false, loopRef: b.spin, turn: 0, head: null, armed: false, riseY: b.cy, duetT: 0, cd: {}, wasAir: false };
      next.push(b);
    }
    bags = next;
  }
  makeBags(false);

  // ======================================================================== company
  let parts = [];
  function syncParts() {
    const want = S.lv.company;
    while (parts.length < want) parts.push(newPart(true));
    parts.length = want;
  }
  function newPart(anywhere) {
    const th = theme();
    const kind = th.kind === 'mix' ? pick(['leaf', 'petal', 'snow', 'firefly']) : th.kind;
    const colors = th.kind === 'mix' ? THEMES[['leaf', 'snow', 'petal', 'firefly'].indexOf(kind)].colors : th.colors;
    return {
      kind, col: pick(colors), x: rand() * W, y: anywhere ? rand() * FLOOR * 0.8 : -30,
      vx: 0, vy: 0, a: rand() * TAU, size: 6 + rand() * 5, ph: rand() * TAU, rest: 0,
    };
  }
  const PW = { x: 0, y: 0 };
  function updateParts(dt, T) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      wind(p.x, p.y, PW);
      let rate = 2.4, grav = 60, flut = 40;
      if (p.kind === 'petal') { rate = 3; grav = 34; flut = 50; }
      else if (p.kind === 'snow') { rate = 3.6; grav = 26; flut = 12; }
      else if (p.kind === 'firefly') {
        rate = 0.9; grav = 0; flut = 0;
        PW.x = PW.x * 0.35 + Bag.noise3(T * 0.3, p.ph, 1) * 70;
        PW.y = PW.y * 0.25 + Bag.noise3(T * 0.3, p.ph, 7) * 50 - (p.y > FLOOR - 120 ? 40 : 0);
      }
      p.vx += (PW.x - p.vx) * rate * dt + Math.sin(T * 2.3 + p.ph) * flut * dt;
      p.vy += (PW.y - p.vy) * rate * dt + grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.a += (p.vx * 0.012 + Math.sin(T * 1.7 + p.ph) * 1.1) * dt;
      if (p.y > FLOOR - 2) {
        p.y = FLOOR - 2; if (p.vy > 0) p.vy = 0; p.vx *= 0.9; p.rest += dt;
        if (p.kind === 'snow' && p.rest > 4) parts[i] = newPart(false);
      } else p.rest = 0;
      if (p.y < -40) { p.y = -40; p.vy = Math.max(0, p.vy); }
      if (p.x < -40) p.x = W + 40; else if (p.x > W + 40) p.x = -40;
    }
  }
  function drawPart(p, T) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.kind === 'firefly') {
      const on = 0.35 + 0.65 * Math.max(0, Math.sin(T * 1.4 + p.ph * 3)) ** 2;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2.4);
      g.addColorStop(0, p.col); g.addColorStop(1, 'rgba(232,255,138,0)');
      ctx.globalAlpha = on; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, p.size * 2.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fbffe0';
      ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fill();
    } else if (p.kind === 'snow') {
      ctx.fillStyle = p.col; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 3;
      ctx.beginPath(); ctx.arc(0, 0, p.size * 0.3, 0, TAU); ctx.fill();
    } else {
      ctx.rotate(p.a);
      const s = p.kind === 'petal' ? p.size * 0.65 : p.size;
      ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.a * 2 + p.ph)));   // turning over in the air
      ctx.beginPath();
      if (p.kind === 'petal') {
        ctx.moveTo(-s, 0); ctx.bezierCurveTo(-s * 0.4, -s * 0.9, s * 0.8, -s * 0.7, s, -s * 0.12);
        ctx.lineTo(s * 0.7, 0); ctx.lineTo(s, s * 0.12);
        ctx.bezierCurveTo(s * 0.8, s * 0.7, -s * 0.4, s * 0.9, -s, 0);
      } else {
        ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.62, s, 0); ctx.quadraticCurveTo(0, s * 0.62, -s, 0);
      }
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      ctx.fillStyle = p.col; ctx.fill();
      if (p.kind === 'leaf') {
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(60,30,10,0.35)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-s * 1.25, 0); ctx.lineTo(s * 0.85, 0); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ======================================================================== scoring
  let gainedThisSec = 0, secAcc = 0, rateShown = 0;
  const POPS = [];

  function add(n) { S.beauty += n; S.lifetime += n; S.tapeBeauty += n; gainedThisSec += n; }

  function moment(b, key, label, secs, cd) {
    const g = b.g, now = WIND.t;
    if ((g.cd[key] || 0) > now) return;
    g.cd[key] = now + (cd || 4);
    const gain = Math.max(1, secs * P.airRate * g.combo * gmult());
    add(gain);
    S.stats[key] = (S.stats[key] || 0) + 1;
    POPS.push({ x: b.cx, y: b.cy - 58 * b.scale, t: 0, life: 2.8, text: label, sub: '+' + fmt(gain) });
    S.moments.unshift(`${timecode(S.tapeSecs)}  ${label}  +${fmt(gain)}`);
    S.moments.length = Math.min(S.moments.length, 5);
    momentsDirty = true;
    if (S.settings.sound) chime();
  }

  function score(dt) {
    const gm = gmult();
    for (const b of bags) {
      const g = b.g;
      const air = b.touch > 0.35;
      const speed = Math.hypot(b.vx, b.vy);

      g.combo = air ? Math.min(P.comboCap, g.combo + 0.08 * dt) : Math.max(1, g.combo - P.comboDecay * dt);

      // hanging still in mid-air — the whole point
      if (air && speed < P.suspSpeed && b.gap > 40) g.suspT += dt; else { g.suspT = 0; g.susp = false; }
      if (g.suspT > 1.1 && !g.susp) { g.susp = true; moment(b, 'suspended', 'suspended', 10, 6); }

      // a loop: its path through the air turns all the way around
      if (air && speed > 18) {
        const hd = Math.atan2(b.vy, b.vx);
        if (g.head != null) { let d = hd - g.head; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; g.turn += d; }
        g.head = hd;
        g.turn *= Math.exp(-dt / 12);
        if (Math.abs(g.turn) >= TAU * 0.92) { g.turn = 0; moment(b, 'loops', 'a loop', 25, 2); }
      } else if (!air) { g.turn = 0; g.head = null; }
      // a somersault: the bag itself turns over (only in the air — rolling on the ground isn't dancing)
      if (!air) g.loopRef = b.spin;
      else if (Math.abs(b.spin - g.loopRef) >= TAU) { g.loopRef += Math.sign(b.spin - g.loopRef) * TAU; moment(b, 'flips', 'a somersault', 12, 3); }

      // almost landed
      if (b.touch === 0) g.armed = false;
      else if (air && b.gap < 14 && b.vy > 0) g.armed = true;
      else if (g.armed && b.gap > 70) { g.armed = false; moment(b, 'almost', 'it almost landed', 15, 5); }

      // rising
      if (!air) g.riseY = b.cy;
      else { g.riseY = Math.max(g.riseY, b.cy); if (g.riseY - b.cy > 200 * b.scale) { g.riseY = b.cy; moment(b, 'rising', 'rising', 8, 6); } }

      // lifted by your hand
      if (air && !g.wasAir) {
        const d = Math.hypot(CUR.x - b.cx, CUR.y - b.cy), sp = Math.hypot(CUR.vx, CUR.vy);
        if (d < P.handR * 1.6 && sp > 120) moment(b, 'lifted', 'you lifted it', 6, 15);
      }
      g.wasAir = air;

      // dancing with company
      let duet = false;
      if (air && speed > 20) {
        for (const p of parts) {
          const dx = p.x - b.cx, dy = p.y - b.cy;
          if (dx * dx + dy * dy > (80 * b.scale) ** 2) continue;
          const ps = Math.hypot(p.vx, p.vy);
          if (ps > 15 && (p.vx * b.vx + p.vy * b.vy) / (ps * speed) > 0.8) { duet = true; break; }
        }
      }
      g.duetT = duet ? g.duetT + dt : Math.max(0, g.duetT - dt * 2);
      if (g.duetT > 1.2) { g.duetT = 0; moment(b, 'duets', `dancing with ${theme().one}`, 12, 10); }

      if (air) S.stats.airtime += dt;
      add((air ? P.airRate : 0.05) * g.combo * (g.susp ? P.suspMult : 1) * gm * dt);
    }
    secAcc += dt;
    if (secAcc >= 1) {
      const r = gainedThisSec / secAcc;
      rateShown = rateShown ? rateShown + (r - rateShown) * 0.2 : r;
      S.avgRate = S.avgRate ? S.avgRate + (r - S.avgRate) * (secAcc / 300) : r;
      gainedThisSec = 0; secAcc = 0;
    }
  }

  // ======================================================================== render
  function render(T) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < parts.length; i += 2) drawPart(parts[i], T);
    const style = { fill: theme().bag, alpha: S.settings.opacity };
    for (const b of bags) Bag.draw(ctx, b, style);
    for (let i = 1; i < parts.length; i += 2) drawPart(parts[i], T);

    for (let i = POPS.length - 1; i >= 0; i--) {
      const p = POPS[i];
      const a = Math.min(1, p.t * 3) * Math.min(1, (p.life - p.t) * 1.2);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 6;
      ctx.fillStyle = '#fbf8f2';
      ctx.font = p.line ? 'italic 17px Georgia, serif' : 'italic 16px Georgia, serif';
      const y = p.y - p.t * 10;
      ctx.fillText(p.text, clamp(p.x, 120, W - 120), clamp(y, 30, FLOOR - 30));
      if (p.sub) {
        ctx.font = '600 11px "Segoe UI", sans-serif'; ctx.fillStyle = '#f3c77a';
        ctx.fillText(p.sub, clamp(p.x, 120, W - 120), clamp(y, 30, FLOOR - 30) + 16);
      }
      ctx.restore();
    }
  }

  // ======================================================================== sound
  let AC = null, bed = null;
  function ensureSound() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const len = AC.sampleRate * 6, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {          // pink-ish noise
      const w = rand() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
      d[i] = (b0 + b1 + b2) * 0.9;
    }
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6; bp.frequency.value = 400;
    const g = AC.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(AC.destination); src.start();
    bed = { bp, g, buf };
  }
  function soundTick() {
    if (!bed) return;
    const on = S.settings.sound && !S.settings.paused && visible;
    const target = on ? 0.05 + Math.min(0.16, WIND.mag / 900) : 0;
    bed.g.gain.setTargetAtTime(target, AC.currentTime, 0.4);
    bed.bp.frequency.setTargetAtTime(280 + WIND.mag * 3, AC.currentTime, 0.5);
    // plastic rustle when the bag crumples fast
    if (on && bags[0] && bags[0].relAvg > 90 && rand() < 0.04) {
      const s = AC.createBufferSource(); s.buffer = bed.buf; s.playbackRate.value = 2.5;
      const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const e = AC.createGain(); const t = AC.currentTime;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.05, t + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      s.connect(hp).connect(e).connect(AC.destination); s.start(t, rand() * 5, 0.2);
    }
  }
  function chime() {
    if (!AC) return;
    const t = AC.currentTime, f = pick([523.25, 587.33, 659.25, 783.99, 880]);
    const o = AC.createOscillator(), e = AC.createGain();
    o.type = 'sine'; o.frequency.value = f;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.035, t + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(e).connect(AC.destination); o.start(t); o.stop(t + 2.3);
  }

  // ======================================================================== HUD
  const hud = $('hud'), bt = $('bt'), rateEl = $('rate'), recEl = $('rec'), tcEl = $('tc');
  const tabsEl = $('tabs'), body = $('tabbody'), momentsEl = $('moments'), toastEl = $('toast');
  const TABS = [['wind', 'Wind'], ['company', 'Company'], ['camera', 'Camera'], ['patience', 'Patience'], ['tape', 'Tape'], ['settings', '⚙']];
  let tab = 'wind', momentsDirty = true, openUntil = 0, closeAt = 0, interactive = false, resetArm = 0;

  tabsEl.innerHTML = TABS.map(([id, l]) => `<button data-tab="${id}">${l}</button>`).join('');
  tabsEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; renderTab(); } });

  function fmt(n) {
    if (n < 10) return n.toFixed(1);
    if (n < 1000) return String(Math.floor(n));
    const u = ['k', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = -1;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return (n < 100 ? n.toFixed(n < 10 ? 2 : 1) : Math.floor(n)) + u[i];
  }
  function timecode(s) {
    s = Math.floor(s);
    const p = (x) => String(x).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function upBtn(u) {
    const lv = S.lv[u.id], maxed = lv >= u.max;
    return `<button class="up${maxed ? ' maxed' : ''}" data-buy="${u.id}">
      <span class="nm">${esc(nm(u))}</span><span class="lv">${maxed ? 'all of it' : `${lv} / ${u.max}`}</span>
      <span class="ds">${esc(ds(u))}</span>
      <span class="cost" data-cost="${u.id}">${maxed ? '' : fmt(cost(u)) + ' beauty'}</span></button>`;
  }

  function renderTab() {
    for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.tab === tab);
    let h = '';
    if (tab === 'wind' || tab === 'company' || tab === 'patience') {
      if (tab === 'company' && S.lv.company === 0) h += `<div class="note">It’s alone out there. It doesn’t seem to mind.</div>`;
      h += UPS.filter((u) => u.tab === tab).map(upBtn).join('');
      if (tab === 'wind') h += `<div class="note">Move your mouse near the bag. That’s wind too.</div>`;
    } else if (tab === 'camera') {
      const c = CAMERAS[S.cam], next = CAMERAS[S.cam + 1];
      h += `<div class="big">${esc(c.name)} <span class="note">×${c.mult}</span></div><div class="note">${esc(c.desc)}</div>`;
      if (next) h += `<button class="up" data-buy="camera"><span class="nm">${esc(next.name)}</span><span class="lv">×${next.mult}</span>
        <span class="ds">${esc(next.desc)}</span><span class="cost" data-cost="camera">${fmt(next.cost)} beauty</span></button>`;
      else h += `<div class="note">There’s nothing better than this.</div>`;
    } else if (tab === 'tape') {
      const g = tapeGain(S.tapeBeauty);
      h += `<div class="big">Tape ${S.shelf.length + 1} · ${esc(theme().name)}</div>
        <div class="note">Recorded ${timecode(S.tapeSecs)} · ${fmt(S.tapeBeauty)} beauty on this tape.<br>
        Ending the tape shelves it and starts a new season. Everything you bought goes, but every shelved tape makes all beauty worth +50% forever.
        You have ${S.tapes} ${S.tapes === 1 ? 'tape' : 'tapes'} (×${(1 + 0.5 * S.tapes).toFixed(1)}).</div>
        <button class="btn" id="endTape" ${g < 1 ? 'disabled' : ''}>${g < 1 ? `End the tape (at ${fmt(TAPE_MIN)} beauty)` : `End the tape · +${g} ${g === 1 ? 'tape' : 'tapes'}`}</button>`;
      if (S.shelf.length) h += `<div class="note" style="margin-top:6px">The shelf</div>` +
        S.shelf.slice().reverse().map((t) => `<div class="tape"><b>${esc(t.title)}</b><span>${timecode(t.secs)} · ${fmt(t.beauty)} beauty · ${esc(t.date)}</span></div>`).join('');
    } else if (tab === 'settings') {
      const st = S.settings;
      h += `<div class="row"><span>Bag opacity</span><input type="range" id="sOpacity" min="0.25" max="1" step="0.01" value="${st.opacity}"></div>
        <div class="row"><span>Bag size</span><input type="range" id="sSize" min="0.6" max="1.8" step="0.05" value="${st.size}"></div>
        <div class="row"><span>Sound (wind + rustle)</span><input type="checkbox" id="sSound" ${st.sound ? 'checked' : ''}></div>
        ${DB ? `<div class="row"><span>Float above windows</span><input type="checkbox" id="sTop" ${st.onTop ? 'checked' : ''}></div>` : ''}
        <div class="row"><span>Low power (30 fps)</span><input type="checkbox" id="sLow" ${st.lowPower ? 'checked' : ''}></div>
        <div class="row"><span>Hold still (pause)</span><input type="checkbox" id="sPause" ${st.paused ? 'checked' : ''}></div>
        <div class="note">${DB ? 'Ctrl+Alt+B hides and shows the bag. The tray icon has the same controls.' : 'Browser demo. The Windows app floats over your real desktop.'}</div>
        <div class="note">Loops ${S.stats.loops || 0} · suspended ${S.stats.suspended || 0} · almost ${S.stats.almost || 0} · duets ${S.stats.duets || 0} · airtime ${timecode(S.stats.airtime)}</div>
        <div class="row"><button class="btn quiet" id="sReset">Start over</button>${DB ? '<button class="btn quiet" id="sQuit">Quit</button>' : ''}</div>`;
    }
    body.innerHTML = h;
    wireTab();
    refresh();
  }

  function wireTab() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('endTape', 'click', endTape);
    on('sOpacity', 'input', (e) => { S.settings.opacity = +e.target.value; });
    on('sSize', 'change', (e) => { S.settings.size = +e.target.value; makeBags(true); });
    on('sSound', 'change', (e) => { S.settings.sound = e.target.checked; if (S.settings.sound) ensureSound(); });
    on('sTop', 'change', (e) => { S.settings.onTop = e.target.checked; DB && DB.setOnTop(S.settings.onTop); });
    on('sLow', 'change', (e) => { S.settings.lowPower = e.target.checked; });
    on('sPause', 'change', (e) => setPaused(e.target.checked));
    on('sQuit', 'click', () => { save(); DB && DB.quit(); });
    on('sReset', 'click', (e) => {
      if (Date.now() < resetArm) { localStorage.removeItem(SAVE_KEY); S = fresh(); params(); makeBags(false); syncParts(); renderTab(); toast('A new bag. The same wind.'); return; }
      resetArm = Date.now() + 3000; e.target.textContent = 'Really? Click again';
    });
  }

  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (!b || b.disabled) return;
    const id = b.dataset.buy;
    if (id === 'camera') {
      const next = CAMERAS[S.cam + 1];
      if (!next || S.beauty < next.cost) return;
      S.beauty -= next.cost; S.cam++;
      toast(next.desc);
    } else {
      const u = UPS.find((x) => x.id === id);
      if (S.lv[id] >= u.max || S.beauty < cost(u)) return;
      S.beauty -= cost(u); S.lv[id]++;
      params();
      if (id === 'bags') makeBags(true);
      if (id === 'company') syncParts();
    }
    if (S.settings.sound) chime();
    save();
    renderTab();
  });

  function refresh() {
    bt.textContent = fmt(S.beauty);
    rateEl.textContent = '+' + fmt(rateShown) + '/s';
    recEl.classList.toggle('on', S.cam >= 1);
    tcEl.textContent = timecode(S.tapeSecs);
    for (const btn of body.querySelectorAll('[data-buy]')) {
      const id = btn.dataset.buy;
      let c, can;
      if (id === 'camera') { const n = CAMERAS[S.cam + 1]; c = n ? n.cost : Infinity; can = !!n; }
      else { const u = UPS.find((x) => x.id === id); can = S.lv[id] < u.max; c = cost(u); }
      btn.disabled = !can || S.beauty < c;
    }
    const et = $('endTape');
    if (et) {
      const g = tapeGain(S.tapeBeauty);
      et.disabled = g < 1;
      et.textContent = g < 1 ? `End the tape (at ${fmt(TAPE_MIN)} beauty)` : `End the tape · +${g} ${g === 1 ? 'tape' : 'tapes'}`;
    }
    if (momentsDirty) {
      momentsEl.innerHTML = S.moments.length ? S.moments.map((m) => `<div>${esc(m)}</div>`).join('') : '<div>nothing yet. keep watching.</div>';
      momentsDirty = false;
    }
  }

  function updateHover(now) {
    const r = hud.getBoundingClientRect();
    const inside = CUR.x >= r.left - 8 && CUR.x <= r.right + 8 && CUR.y >= r.top - 8 && CUR.y <= r.bottom + 8;
    const open = hud.classList.contains('open');
    if (inside || now < openUntil) { closeAt = 0; if (!open) { hud.classList.add('open'); renderTab(); } }
    else if (open) { if (!closeAt) closeAt = now + 600; else if (now > closeAt) { hud.classList.remove('open'); closeAt = 0; } }
    if (DB && inside !== interactive) { interactive = inside; DB.setInteractive(inside); }
  }

  let toastTimer = 0;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 5200);
  }

  // ======================================================================== tapes
  function endTape() {
    const g = tapeGain(S.tapeBeauty);
    if (g < 1) return;
    const fade = $('fade');
    const n = S.shelf.length + 1;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const from = WIND.ax > 0 ? 'west' : 'east';
    fade.textContent = `Tape ${n} ends.`;
    fade.classList.add('on');
    setTimeout(() => {
      S.shelf.push({ title: `Tape ${n}: ${theme().name}, ${days[new Date().getDay()]}, wind from the ${from}`,
        secs: S.tapeSecs, beauty: S.tapeBeauty, date: new Date().toLocaleDateString() });
      S.tapes += g;
      S.beauty = 0; S.tapeBeauty = 0; S.tapeSecs = 0; S.cam = 0;
      for (const k in S.lv) S.lv[k] = 0;
      S.moments = []; momentsDirty = true;
      params(); makeBags(false); parts = []; syncParts();
      fade.textContent = `Tape ${n + 1}: ${theme().name}`;
      save(); renderTab();
      setTimeout(() => fade.classList.remove('on'), 1800);
    }, 2200);
  }

  // ======================================================================== pause / visibility / tray
  let visible = true, hiddenAt = 0;
  function setPaused(p) { S.settings.paused = p; DB && DB.setPaused(p); const el = $('sPause'); if (el) el.checked = p; }
  function awayGain(sec, why) {
    if (sec < 60 || !S.avgRate) return;
    const gain = Math.min(sec, 8 * 3600) * S.avgRate * 0.25;
    add(gain);
    toast(`${why} +${fmt(gain)} beauty.`, 7000);
  }
  if (DB) {
    DB.onCommand((cmd, arg) => {
      if (cmd === 'pause') setPaused(!!arg);
      else if (cmd === 'open-shop') openUntil = performance.now() + 6000;
      else if (cmd === 'on-top') { S.settings.onTop = !!arg; renderTab(); }
      else if (cmd === 'visible') {
        visible = !!arg;
        if (!visible) { hiddenAt = Date.now(); save(); }
        else if (hiddenAt) { awayGain((Date.now() - hiddenAt) / 1000, 'While it was hidden, the wind kept going.'); hiddenAt = 0; }
      }
    });
    if (!S.settings.onTop) DB.setOnTop(false);
    // tray icon: a tiny bag
    const ic = document.createElement('canvas'); ic.width = ic.height = 32;
    const ictx = ic.getContext('2d'), tb = Bag.make(16, 19, 0.28);
    Bag.draw(ictx, tb, { fill: 'rgba(250,250,252,0.95)', print: false });
    DB.setTrayIcon(ic.toDataURL('image/png'));
  }
  addEventListener('beforeunload', save);
  setInterval(save, 5000);

  // ======================================================================== loop
  const STEP = 1 / 120;
  let last = performance.now(), acc = 0, T = 0, uiAcc = 0, nextLine = 150 + rand() * 180;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (visible) {
      updateCursor(Math.max(dt, 1e-3));
      if (!S.settings.paused) {
        T += dt;
        S.tapeSecs += dt;
        updateWind(dt);
        acc += dt;
        let k = 0;
        const box = BOX();
        while (acc >= STEP && k < 8) { for (const b of bags) Bag.step(b, STEP, wind, box); acc -= STEP; k++; }
        if (k === 8) acc = 0;
        updateParts(dt, T);
        score(dt);
        nextLine -= dt;
        if (nextLine <= 0) {
          nextLine = 240 + rand() * 240;
          const b = bags[0];
          POPS.push({ x: b.cx, y: b.cy - 90 * b.scale, t: 0, life: 7, text: pick(LINES), line: true });
        }
      }
      for (let i = POPS.length - 1; i >= 0; i--) { POPS[i].t += dt; if (POPS[i].t > POPS[i].life) POPS.splice(i, 1); }
      render(T);
      updateHover(now);
      uiAcc += dt;
      if (uiAcc > 0.25) { uiAcc = 0; refresh(); soundTick(); }
    }
    if (S.settings.lowPower) setTimeout(() => requestAnimationFrame(frame), 28);
    else requestAnimationFrame(frame);
  }

  // ======================================================================== boot
  syncParts();
  renderTab();
  if (S.lastSeen && S.seenIntro) awayGain((Date.now() - S.lastSeen) / 1000, 'While you were away, the wind kept going.');
  if (!S.seenIntro) {
    setTimeout(() => toast('It’s just a bag. Move your mouse near it. You’re the wind.', 6500), 1200);
    setTimeout(() => toast('Hover the corner to see what you’ve noticed.', 6000), 11000);
    S.seenIntro = true;
  }
  if (S.settings.sound) addEventListener('pointerdown', ensureSound, { once: true });
  requestAnimationFrame(frame);

  // hooks for smoke tests and tuning
  window.DB_SMOKE = () => ({ ok: ERR.length === 0, errors: ERR.slice(0, 3), bags: bags.length, beauty: S.beauty, W, H, desktop: !!DB });
  window.__bag = {
    get S() { return S; }, get bags() { return bags; }, get P() { return P; }, params, makeBags, syncParts, renderTab,
    render: () => render(T),
    // run the sim headless (no render) for `sec` seconds; returns airborne fraction + beauty gained
    sim(sec) {
      const box = BOX(); let air = 0, t = 0; const b0 = S.lifetime;
      while (t < sec) {
        updateWind(1 / 60);
        for (let k = 0; k < 2; k++) for (const b of bags) Bag.step(b, STEP, wind, box);
        updateParts(1 / 60, T += 1 / 60); score(1 / 60);
        if (bags[0].touch > 0.35) air++;
        t += 1 / 60;
      }
      POPS.length = 0;
      return { airFrac: +(air / (sec * 60)).toFixed(2), gained: Math.round(S.lifetime - b0), stats: Object.assign({}, S.stats) };
    },
  };
})();
