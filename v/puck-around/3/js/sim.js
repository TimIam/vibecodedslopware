// The whole game, with no drawing, sound or network in it: give it the players' buttons and a time
// step and it moves the match on. The host runs this; guests only draw what the host sends them.
// It also runs under plain Node, which is how the balance gets tested (CPU against CPU).
//
// Team 0 defends the left goal and attacks right; team 1 the other way. Skaters 0-4 and goalie 5 are
// team 0, 6-10 and goalie 11 are team 1. Roles: 0 centre, 1 and 2 wings, 3 and 4 defence, 5 goalie.

export const RINK = { W: 960, H: 216, GL: 74, GR: 886, GY0: 89, GY1: 127, NET: 13, CORNER: 46, MID: 108 };
const { W, H, GL, GR, GY0, GY1, NET, CORNER, MID } = RINK;
export const PH = ['faceoff', 'draw', 'play', 'goal', 'fight', 'break', 'final'];

export const TUNE = {
  ACC: 620, V_SKATE: 152, V_CARRY: 140, DRAG_ON: 0.9, DRAG_OFF: 2.4,
  PASS_V: 330, SHOT_V: 350, SHOT_PLUS: 170, WIND_FULL: 0.55, WIND_SLOW: 0.45,
  LUNGE_V: 245, LUNGE_T: 0.2, LUNGE_CD: 0.75, DOWN_T: 1.05, HIT_R: 11,
  G_TRACK: 70, G_DIVE: 128, G_REACT: 0.09, G_SAVE: 0.93, G_LEAN: 0.32, G_LEAN_MAX: 11,
  AIM_HZ: 0.62, AIM_RANGE: 250,
  STEAL: 1.3, BLOCK: 0.28, ANGER: 4, PEN_FRAC: 0.25, FIGHT_HP: 10, FIGHT_T: 22,
  // CPU skill: skating speed, how close the aim marker must be to the corner it wants, checks a second, faceoff reaction
  DIFF: [
    { v: 0.86, tol: 13, chk: 1.0, draw: [0.3, 0.65], shootR: 120 },
    { v: 0.94, tol: 8, chk: 1.9, draw: [0.2, 0.5], shootR: 140 },
    { v: 1.0, tol: 4.5, chk: 3.0, draw: [0.13, 0.38], shootR: 150 },
  ],
};
const T = TUNE;

const dirOf = team => (team === 0 ? 1 : -1);
const ownGoal = team => (team === 0 ? GL : GR);
const oppGoal = team => (team === 0 ? GR : GL);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
const onIce = s => s.out <= 0;

function rnd(S) {
  let t = (S.seed = (S.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function emit(S, k, a = 0, b = 0) { S.ev.push({ i: ++S.evSeq, k, a, b, t: S.t }); }

function mkSkater(id) {
  const team = id < 6 ? 0 : 1;
  return { id, team, role: id % 6, x: 0, y: 0, vx: 0, vy: 0, face: dirOf(team), dx: dirOf(team), dy: 0,
    down: 0, lunge: 0, lungeCd: 0, wind: -1, out: 0, ctl: -1, pickCd: 0, anger: 0, hold: 0, aiAim: 0, shotAnim: 0, holdT: 0, react: 0 };
}

// cfg: { periodLen (seconds), diff 0-2, seed, humans: [{ team, name }] }
export function newGame(cfg) {
  const S = {
    cfg, t: 0, tick: 0, seed: (cfg.seed | 0) || 1, phase: 'faceoff', phaseT: 0, period: 1, clock: cfg.periodLen,
    score: [0, 0], shots: [0, 0], sk: Array.from({ length: 12 }, (_, i) => mkSkater(i)),
    puck: { x: W / 2, y: MID, vx: 0, vy: 0, owner: -1, shot: false, passTo: -1, lastTeam: -1, lastSk: -1, noPick: { id: -1, t: 0 }, gk: [0, 0], tried: {} },
    ctl: cfg.humans.map((h, i) => ({ idx: i, team: h.team, sk: -1, name: h.name, inp: { mx: 0, my: 0, a: false, b: false, pa: 0, pb: 0, pt: -1 }, pressA: false, pressB: false, dead: false })),
    aim: [{ y: MID, on: false, ph: 0 }, { y: MID, on: false, ph: 0.37 }],
    fight: null, fightsLeft: 1, ev: [], evSeq: 0, fo: null, winner: -1, stats: { checks: [0, 0], fights: 0, passes: [0, 0] },
  };
  setFaceoff(S);
  return S;
}

export function dropController(S, idx) {
  const c = S.ctl[idx];
  if (!c || c.dead) return;
  c.dead = true;
  if (c.sk >= 0) S.sk[c.sk].ctl = -1;
  c.sk = -1;
}
const humansOn = (S, team) => S.ctl.some(c => !c.dead && c.team === team);
function setCtl(S, c, s) {
  if (c.sk >= 0) S.sk[c.sk].ctl = -1;
  c.sk = s.id; s.ctl = c.idx;
}

// ---------------------------------------------------------------------------------------- set pieces
const SPOTS = [[-14, 0], [-44, -52], [-44, 52], [-112, -30], [-112, 30]];
function setFaceoff(S) {
  for (const s of S.sk) {
    s.vx = s.vy = 0; s.down = 0; s.lunge = 0; s.wind = -1; s.ctl = -1; s.hold = 0; s.aiAim = 0; s.holdT = 0;
    const d = dirOf(s.team);
    s.face = s.dx = d; s.dy = 0;
    if (!onIce(s)) continue;
    if (s.role === 5) { s.x = ownGoal(s.team) + d * 7; s.y = MID; } else { s.x = W / 2 + SPOTS[s.role][0] * d; s.y = MID + SPOTS[s.role][1]; }
  }
  const taker = [0, 1].map(team => S.sk.find(s => s.team === team && s.role < 5 && onIce(s)));
  for (const team of [0, 1]) {            // whoever takes the draw stands at the dot, whatever their usual spot
    const s = taker[team];
    if (s.role !== 0) { s.x = W / 2 - 14 * dirOf(team); s.y = MID; }
    const list = S.sk.filter(k => k.team === team && k.role < 5 && onIce(k));
    for (const c of S.ctl) { if (c.dead || c.team !== team) continue; c.sk = -1; const k = list.shift(); if (k) setCtl(S, c, k); }
  }
  const p = S.puck;
  p.x = W / 2; p.y = MID; p.vx = p.vy = 0; p.owner = -1; p.shot = false; p.passTo = -1; p.gk = [0, 0]; p.tried = {};
  const D = T.DIFF[S.cfg.diff] || T.DIFF[1];
  S.fo = { ids: [taker[0].id, taker[1].id], ai: [0, 1].map(() => D.draw[0] + rnd(S) * (D.draw[1] - D.draw[0])), lock: [0, 0], t: 0 };
  S.phase = 'faceoff'; S.phaseT = 1.9;
  S.aim[0].on = S.aim[1].on = false;
  emit(S, 'faceoff');
}

function stepDraw(S, dt) {
  const fo = S.fo;
  fo.t += dt;
  let win = -1;
  const order = rnd(S) < 0.5 ? [0, 1] : [1, 0];
  for (const team of order) {
    if (fo.lock[team] > 0) { fo.lock[team] -= dt; continue; }
    const c = S.ctl.find(c => !c.dead && c.sk === fo.ids[team]);
    if (c) { if (c.pressA || c.pressB) { win = team; break; } } else if ((fo.ai[team] -= dt) <= 0) { win = team; break; }
  }
  if (win < 0 && fo.t > 1.3) win = rnd(S) < 0.5 ? 0 : 1;
  if (win < 0) return;
  const back = S.sk.filter(s => s.team === win && s.role < 5 && onIce(s) && s.id !== fo.ids[win]).sort((a, b) => b.role - a.role)[0];
  const p = S.puck, taker = S.sk[fo.ids[win]];
  p.lastTeam = win; p.lastSk = taker.id; p.noPick = { id: taker.id, t: 0.3 };
  if (back) { const d = hyp(back.x - p.x, back.y - p.y) || 1; p.vx = (back.x - p.x) / d * 250; p.vy = (back.y - p.y) / d * 250; p.passTo = back.id; ctlFollow(S, taker, back); }
  S.phase = 'play';
  emit(S, 'draw', win);
}

function endPeriod(S) {
  emit(S, 'horn');
  for (const s of S.sk) { s.wind = -1; s.lunge = 0; }
  const tied = S.score[0] === S.score[1];
  if (S.period >= 3 && !tied) { S.phase = 'final'; S.winner = S.score[0] > S.score[1] ? 0 : 1; emit(S, 'final', S.winner); return; }
  S.period++;
  S.clock = S.period > 3 ? Math.max(45, S.cfg.periodLen / 2) : S.cfg.periodLen;
  S.fightsLeft = S.period > 3 ? 0 : 1;
  S.phase = 'break'; S.phaseT = 3.4;
}

function goal(S, team) {
  S.score[team]++; S.shots[team]++;
  S.phase = 'goal'; S.phaseT = 3.4;
  for (const s of S.sk) { s.wind = -1; s.lunge = 0; }
  emit(S, 'goal', team, S.puck.lastTeam === team ? S.puck.lastSk : -1);
}

// ------------------------------------------------------------------------------------------- moving
function drive(s, mx, my, dt, maxV) {
  const m = hyp(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  s.vx += mx * T.ACC * dt; s.vy += my * T.ACC * dt;
  const k = Math.exp(-(m > 0.1 ? T.DRAG_ON : T.DRAG_OFF) * dt);
  s.vx *= k; s.vy *= k;
  const v = hyp(s.vx, s.vy);
  if (v > maxV) { s.vx *= maxV / v; s.vy *= maxV / v; }
  s.x += s.vx * dt; s.y += s.vy * dt;
  if (m > 0.1) { const n = Math.min(m, 1); s.dx = mx / n; s.dy = my / n; if (Math.abs(mx) > 0.2) s.face = mx > 0 ? 1 : -1; }
}
function coast(s, dt, drag) {
  const k = Math.exp(-drag * dt);
  s.vx *= k; s.vy *= k; s.x += s.vx * dt; s.y += s.vy * dt;
}
// Keep something inside the boards, rounded corners included. Returns true when it bounced.
export function confine(o, r, rest) {
  let hit = false;
  if (o.x < r) { o.x = r; if (o.vx < 0) { o.vx = -o.vx * rest; hit = true; } }
  if (o.x > W - r) { o.x = W - r; if (o.vx > 0) { o.vx = -o.vx * rest; hit = true; } }
  if (o.y < r) { o.y = r; if (o.vy < 0) { o.vy = -o.vy * rest; hit = true; } }
  if (o.y > H - r) { o.y = H - r; if (o.vy > 0) { o.vy = -o.vy * rest; hit = true; } }
  const cx = o.x < CORNER ? CORNER : o.x > W - CORNER ? W - CORNER : null, cy = o.y < CORNER ? CORNER : o.y > H - CORNER ? H - CORNER : null;
  if (cx !== null && cy !== null) {
    const dx = o.x - cx, dy = o.y - cy, d = hyp(dx, dy), lim = CORNER - r;
    if (d > lim) {
      const nx = dx / d, ny = dy / d, vn = o.vx * nx + o.vy * ny;
      o.x = cx + nx * lim; o.y = cy + ny * lim;
      if (vn > 0) { o.vx -= (1 + rest) * vn * nx; o.vy -= (1 + rest) * vn * ny; hit = true; }
    }
  }
  return hit;
}
// Nets are solid, and the far team may not stand in the crease.
export function obstacles(s) {
  for (const side of [0, 1]) {
    const x0 = (side ? GR : GL - NET) - 5, x1 = (side ? GR + NET : GL) + 5, y0 = GY0 - 4, y1 = GY1 + 6;
    if (s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1) {
      const pen = [s.x - x0, x1 - s.x, s.y - y0, y1 - s.y], m = Math.min(...pen);
      if (m === pen[0]) { s.x = x0; s.vx = Math.min(s.vx, 0); } else if (m === pen[1]) { s.x = x1; s.vx = Math.max(s.vx, 0); }
      else if (m === pen[2]) { s.y = y0; s.vy = Math.min(s.vy, 0); } else { s.y = y1; s.vy = Math.max(s.vy, 0); }
    }
    if (s.role < 5 && s.team === side) continue;      // side 0 is the left goal, defended by team 0
    if (s.role === 5) continue;
    const gx = side ? GR : GL, inF = side ? gx - s.x : s.x - gx;
    if (inF > -2) { const dx = s.x - gx, dy = s.y - MID, d = hyp(dx, dy); if (d < 19 && d > 0.01) { s.x = gx + dx / d * 19; s.y = MID + dy / d * 19; } }
  }
}

// ------------------------------------------------------------------------------------- puck handling
function give(S, s) {
  const p = S.puck;
  p.owner = s.id; p.passTo = -1; p.shot = false; p.lastTeam = s.team; p.lastSk = s.id; p.gk = [0, 0]; p.tried = {};
  s.hold = 0; s.aiAim = 0; s.wind = -1; s.holdT = 0;
  if (s.role < 5 && s.ctl < 0 && humansOn(S, s.team)) {
    let best = null, bd = 1e9;
    for (const c of S.ctl) { if (c.dead || c.team !== s.team) continue; const k = c.sk >= 0 ? S.sk[c.sk] : null; const d = k ? hyp(k.x - s.x, k.y - s.y) : 0; if (d < bd) { bd = d; best = c; } }
    if (best) setCtl(S, best, s);
  }
}
// A human who passes takes over the skater they passed to.
function ctlFollow(S, from, to) {
  if (from.ctl >= 0 && to.ctl < 0 && to.role < 5) setCtl(S, S.ctl[from.ctl], to);
}
function release(S, s, vx, vy, shot) {
  const p = S.puck;
  p.owner = -1; p.x = s.x + s.dx * 7; p.y = s.y + s.dy * 4 + 1; p.vx = vx; p.vy = vy; p.shot = shot;
  p.lastTeam = s.team; p.lastSk = s.id; p.noPick = { id: s.id, t: 0.35 }; p.gk = [0, 0]; p.tried = {}; p.passTo = -1;
  s.wind = -1; s.shotAnim = 0.22;
}
function passTo(S, s, m) {
  const lead = 0.3, tx = m.x + m.vx * lead, ty = m.y + m.vy * lead;
  const d = hyp(tx - s.x, ty - s.y) || 1;
  s.dx = (tx - s.x) / d; s.dy = (ty - s.y) / d; if (Math.abs(s.dx) > 0.2) s.face = s.dx > 0 ? 1 : -1;
  release(S, s, s.dx * T.PASS_V, s.dy * T.PASS_V, false);
  S.puck.passTo = m.id;
  S.stats.passes[s.team]++;
  ctlFollow(S, s, m);
  emit(S, 'pass');
}
// A clicked teammate: the skater a mouse pass or switch is meant for, if that is allowed.
function picked(S, c, self) {
  const id = c.inp.pt, m = Number.isInteger(id) && id >= 0 && id < 12 ? S.sk[id] : null;
  return m && m.team === c.team && m.role < 5 && onIce(m) && m.down <= 0 && m.id !== self ? m : null;
}
function humanPass(S, s, mx, my, to) {
  if (to) return passTo(S, s, to);
  const aimed = Math.abs(mx) + Math.abs(my) > 0.2, im = hyp(mx, my) || 1, d = dirOf(s.team);
  let best = null, bs = -1e9;
  for (const m of S.sk) {
    if (m.team !== s.team || m === s || m.role === 5 || !onIce(m) || m.down > 0) continue;
    const vx = m.x - s.x, vy = m.y - s.y, dist = hyp(vx, vy);
    if (dist < 14) continue;
    let sc;
    if (aimed) { const cos = (vx * mx + vy * my) / (dist * im); if (cos < 0.25) continue; sc = cos * 100 - Math.abs(dist - 120) * 0.15; }
    else sc = d * vx * 0.5 - Math.abs(dist - 110) * 0.2;
    if (sc > bs) { bs = sc; best = m; }
  }
  if (best) return passTo(S, s, best);
  if (aimed) { s.dx = mx / im; s.dy = my / im; }
  release(S, s, s.dx * 300, s.dy * 300, false);
  emit(S, 'pass');
}
function shoot(S, s, power) {
  const a = S.aim[s.team], gx = oppGoal(s.team);
  let ang, dist = 0;
  if (a.on) {
    const px = s.x + s.dx * 7, py = s.y + s.dy * 4 + 1;
    dist = hyp(gx - px, a.y - py);
    ang = Math.atan2(a.y - py, gx - px) + (rnd(S) - 0.5) * 2 * (0.012 + dist * 0.0002);
    s.face = gx > s.x ? 1 : -1;
  } else ang = Math.atan2(s.dy, s.dx);      // out of range: it just goes where you are facing
  const sp = T.SHOT_V + T.SHOT_PLUS * power;
  s.dx = Math.cos(ang); s.dy = Math.sin(ang);
  release(S, s, s.dx * sp, s.dy * sp, true);
  emit(S, 'shot', Math.round(power * 10));
}
function startLunge(s, mx, my) {
  const m = hyp(mx, my);
  if (m > 0.2) { s.dx = mx / m; s.dy = my / m; if (Math.abs(s.dx) > 0.2) s.face = s.dx > 0 ? 1 : -1; }
  s.lunge = T.LUNGE_T; s.lungeCd = T.LUNGE_CD;
  s.vx = s.dx * T.LUNGE_V; s.vy = s.dy * T.LUNGE_V;
}
function hit(S, a, v) {
  v.down = T.DOWN_T; v.vx = a.dx * 130; v.vy = a.dy * 130; v.wind = -1; v.lunge = 0;
  a.lunge = 0; a.vx *= 0.3; a.vy *= 0.3;
  const p = S.puck;
  if (p.owner === v.id) {
    p.owner = -1; p.vx = a.dx * 90 + (rnd(S) - 0.5) * 140; p.vy = a.dy * 90 + (rnd(S) - 0.5) * 140; p.noPick = { id: v.id, t: 1 }; p.shot = false; p.passTo = -1;
  }
  S.stats.checks[a.team]++;
  emit(S, 'check', Math.round(v.x), Math.round(v.y));
  if (++v.anger >= T.ANGER && S.fightsLeft > 0) startFight(S, a, v);
}
function switchCtl(S, c, to) {
  const p = S.puck;
  let best = to && to.ctl < 0 ? to : null, bd = best ? -1 : 1e9;
  for (const s of S.sk) {
    if (s.team !== c.team || s.role === 5 || !onIce(s) || s.down > 0 || (s.ctl >= 0 && s.ctl !== c.idx)) continue;
    const d = hyp(s.x - p.x, s.y - p.y);
    if (d < bd) { bd = d; best = s; }
  }
  if (best && best.id !== c.sk) { setCtl(S, c, best); emit(S, 'switch', c.idx); }
}

function human(S, c, dt) {
  let s = c.sk >= 0 ? S.sk[c.sk] : null;
  if (!s || !onIce(s)) { c.sk = -1; switchCtl(S, c); s = c.sk >= 0 ? S.sk[c.sk] : null; if (!s) return; }
  const to = c.pressA ? picked(S, c, s.id) : null;
  if (c.pressA) c.inp.pt = -1;
  if (s.down > 0) { if (c.pressA) switchCtl(S, c, to); return; }
  if (s.lunge > 0) return;
  const { mx, my } = c.inp, p = S.puck, has = p.owner === s.id;
  drive(s, mx, my, dt, (has ? T.V_CARRY : T.V_SKATE) * (s.wind >= 0 ? T.WIND_SLOW : 1));
  if (has) {
    if (c.pressA && s.wind < 0) humanPass(S, s, mx, my, to);
    else {
      if (c.pressB && s.wind < 0) s.wind = 0;
      if (s.wind >= 0) { s.wind += dt; if (!c.inp.b || s.wind > 1.1) shoot(S, s, Math.min(1, s.wind / T.WIND_FULL)); }
    }
  } else {
    s.wind = -1;
    if (c.pressA) switchCtl(S, c, to);
    if (c.pressB && s.lungeCd <= 0) startLunge(s, mx, my);
  }
}

// ----------------------------------------------------------------------------------------------- AI
function teamInfo(S, team) {
  const p = S.puck, owner = p.owner >= 0 ? S.sk[p.owner] : null;
  const poss = owner ? (owner.team === team ? 1 : -1) : 0, human = humansOn(S, team);
  let chaser = -1, chaser2 = -1;
  if (poss !== 1) {
    const list = S.sk.filter(s => s.team === team && s.role < 5 && onIce(s) && s.down <= 0 && s.ctl < 0)
      .map(s => [hyp(s.x - p.x, s.y - p.y), s.id]).sort((a, b) => a[0] - b[0]);
    if (p.passTo >= 0 && S.sk[p.passTo].team === team && S.sk[p.passTo].ctl < 0) chaser = p.passTo;
    else if (list.length) chaser = list[0][1];
    if (!human && poss === -1 && list.length > 1 && dirOf(team) * (p.x - W / 2) < 0) chaser2 = list[1][1] === chaser ? list[0][1] : list[1][1];
  }
  return { poss, human, chaser, chaser2, owner };
}
function formation(S, s, info) {
  const p = S.puck, d = dirOf(s.team), og = ownGoal(s.team), xg = oppGoal(s.team);
  let x, y;
  if (info.poss >= 0) {
    const tight = info.poss === 0 ? 0.6 : 1;
    if (s.role === 0) { x = p.x + d * 46 * tight; y = MID + (p.y < MID ? 22 : -22); }
    else if (s.role < 3) { x = p.x + d * 58 * tight; y = s.role === 1 ? 34 : H - 34; }
    else { x = p.x - d * 82; y = MID + (s.role === 3 ? -34 : 34); }
    if (d * (x - (xg - d * 36)) > 0) x = xg - d * 36;
    if (s.role >= 3 && d * (x - (xg - d * 250)) > 0) x = xg - d * 250;
  } else {
    if (s.role === 0) { x = p.x - d * 24; y = MID + (p.y - MID) * 0.6; }
    else if (s.role < 3) { x = p.x - d * 40; y = s.role === 1 ? 46 : H - 46; }
    else { x = og + d * 64; y = MID + (s.role === 3 ? -20 : 20) + (p.y - MID) * 0.3; if (d * (x - p.x) > -20) x = p.x - d * 20; }
    if (d * (x - (og + d * 30)) < 0) x = og + d * 30;
  }
  return [clamp(x, 16, W - 16), clamp(y, 14, H - 14)];
}
function seek(s, tx, ty, dt, maxV) {
  const dx = tx - s.x, dy = ty - s.y, dist = hyp(dx, dy);
  if (dist < 4) return drive(s, 0, 0, dt, maxV);
  const k = Math.min(1, dist / 24) / dist;
  drive(s, dx * k, dy * k, dt, maxV);
}
function bestMate(S, s, needAhead) {
  const d = dirOf(s.team);
  let best = null, bs = needAhead;
  for (const m of S.sk) {
    if (m.team !== s.team || m === s || m.role === 5 || !onIce(m) || m.down > 0) continue;
    const vx = m.x - s.x, vy = m.y - s.y, dist = hyp(vx, vy);
    if (dist < 30 || dist > 320) continue;
    let open = 1e9, lane = 1e9;
    for (const o of S.sk) {
      if (o.team === s.team || !onIce(o) || o.role === 5) continue;
      open = Math.min(open, hyp(o.x - m.x, o.y - m.y));
      const t = clamp(((o.x - s.x) * vx + (o.y - s.y) * vy) / (dist * dist), 0, 1);
      lane = Math.min(lane, hyp(s.x + vx * t - o.x, s.y + vy * t - o.y));
    }
    if (open < 22 || lane < 11) continue;
    const sc = d * vx + Math.min(open, 80) * 0.5;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
function aiCarrier(S, s, dt, D) {
  const d = dirOf(s.team), gx = oppGoal(s.team), toGoal = d * (gx - s.x);
  s.hold += dt;
  let opp = null, od = 1e9;
  for (const o of S.sk) { if (o.team === s.team || o.role === 5 || !onIce(o) || o.down > 0) continue; const k = hyp(o.x - s.x, o.y - s.y); if (k < od) { od = k; opp = o; } }
  let tx = gx - d * 56, ty = MID + clamp(s.y - MID, -32, 32) * 0.8;
  if (toGoal < 56) { tx = gx - d * 44; ty = MID + (s.y < MID ? -16 : 16); }
  let mx = tx - s.x, my = ty - s.y;
  const m = hyp(mx, my) || 1; mx /= m; my /= m;
  if (opp && od < 32 && d * (opp.x - s.x) > -6) {
    let side = s.y < opp.y ? -1 : 1;
    if (s.y < 30) side = 1; else if (s.y > H - 30) side = -1;
    my += side * 0.95; mx += d * 0.15;
    const n = hyp(mx, my) || 1; mx /= n; my /= n;
  }
  drive(s, mx, my, dt, T.V_CARRY * D.v);
  if (S.puck.owner !== s.id) return;
  if (toGoal > 14 && toGoal < D.shootR && Math.abs(s.y - MID) < 72 && S.aim[s.team].on) {
    const g = S.sk[s.team === 0 ? 11 : 5], want = g.y < MID ? GY1 - 5 : GY0 + 5;
    s.aiAim += dt;
    if (s.aiAim > 0.15 && (Math.abs(S.aim[s.team].y - want) < D.tol || s.aiAim > 1.0)) return shoot(S, s, toGoal < 70 ? 0.25 : 0.4 + rnd(S) * 0.5);
  } else s.aiAim = 0;
  if (od < 24 && rnd(S) < 2.6 * dt) { const mate = bestMate(S, s, -70); if (mate) return passTo(S, s, mate); }
  if (rnd(S) < 0.35 * dt) { const mate = bestMate(S, s, 40); if (mate) return passTo(S, s, mate); }
  if (s.hold > 5 && toGoal > W / 2) {
    const mate = bestMate(S, s, -200);
    if (mate) return passTo(S, s, mate);
    s.dx = d; s.dy = s.y < MID ? 0.3 : -0.3; release(S, s, d * 300, s.dy * 300, false);
  }
}
function aiSkater(S, s, dt, info) {
  const p = S.puck, D = T.DIFF[S.cfg.diff] || T.DIFF[1];
  if (p.owner === s.id) return aiCarrier(S, s, dt, D);
  const vf = info.human ? 0.92 : D.v;
  if (s.id === info.chaser || s.id === info.chaser2) {
    const second = s.id === info.chaser2;
    const lead = info.poss === 0 ? 0.18 : 0.12;
    seek(s, p.x + p.vx * lead, p.y + p.vy * lead, dt, T.V_SKATE * vf * (second ? 0.9 : 1));
    const o = info.owner;
    if (o && o.role < 5 && s.lungeCd <= 0 && hyp(o.x - s.x, o.y - s.y) < 16 && rnd(S) < (info.human ? 0.6 : D.chk) * dt) startLunge(s, o.x + o.vx * 0.08 - s.x, o.y + o.vy * 0.08 - s.y);
    return;
  }
  let [tx, ty] = formation(S, s, info);
  const o = info.owner;
  if (!info.human && info.poss === -1 && s.role >= 3 && o && hyp(o.x - s.x, o.y - s.y) < 46) { tx = o.x; ty = o.y; }
  seek(s, tx, ty, dt, T.V_SKATE * vf * 0.95);
}
function aiGoalie(S, g, dt) {
  const d = dirOf(g.team), gx = ownGoal(g.team) + d * 7, p = S.puck;
  g.vx = g.vy = 0; g.x = gx; g.face = g.dx = d; g.dy = 0;
  if (p.owner === g.id) {
    g.holdT += dt;
    if (g.holdT > 0.9) {
      const mate = bestMate(S, g, -1e9) || S.sk.find(s => s.team === g.team && s.role < 5 && onIce(s));
      if (mate) passTo(S, g, mate);
    }
    return;
  }
  const near = d * (p.x - gx) < W / 2;
  let ty = near ? MID + clamp((p.y - MID) * T.G_LEAN, -T.G_LEAN_MAX, T.G_LEAN_MAX) : MID, sp = T.G_TRACK;
  if (p.owner < 0 && p.shot && p.vx * d < -40) {
    const tt = (gx - p.x) / p.vx, cy = p.y + p.vy * tt;
    if (tt > 0 && cy > GY0 - 8 && cy < GY1 + 8) { g.react += dt; if (g.react > T.G_REACT) { ty = clamp(cy, GY0 + 3, GY1 - 3); sp = T.G_DIVE; } }
  } else g.react = 0;
  const dy = ty - g.y, mv = sp * dt;
  g.y += Math.abs(dy) <= mv ? dy : Math.sign(dy) * mv;
  // smother a slow loose puck on the doorstep, or poke it off a skater who gets too close
  if (p.owner < 0 && hyp(p.x - g.x, p.y - g.y) < 15 && hyp(p.vx, p.vy) < 110 && !(p.noPick.id === g.id && p.noPick.t > 0)) { give(S, g); emit(S, 'save', 1); }
  else if (p.owner >= 0 && S.sk[p.owner].team !== g.team && hyp(S.sk[p.owner].x - g.x, S.sk[p.owner].y - g.y) < 13) { S.sk[p.owner].pickCd = 0.6; give(S, g); emit(S, 'save', 1); }
}

// --------------------------------------------------------------------------------------------- puck
function goalCheck(S, px, py) {
  const p = S.puck;
  for (const side of [0, 1]) {
    const gx = side ? GR : GL, sgn = side ? 1 : -1;
    if ((px - gx) * sgn <= 0 && (p.x - gx) * sgn > 0) {
      const t = (gx - px) / (p.x - px), cy = py + (p.y - py) * t;
      if (cy > GY0 + 1.5 && cy < GY1 - 1.5) { p.x = gx + sgn * 6; p.y = cy; p.vx = p.vy = 0; goal(S, side ? 0 : 1); return true; }
      if (cy >= GY0 - 1.5 && cy <= GY1 + 1.5) {
        p.x = gx - sgn; p.y = cy; p.vx = -p.vx * 0.55; p.vy += (cy < MID ? -1 : 1) * (40 + rnd(S) * 60); p.shot = false;
        emit(S, 'post');
      }
    }
    const bx0 = side ? GR : GL - NET, bx1 = bx0 + NET;
    if (p.x > bx0 && p.x < bx1 && p.y > GY0 && p.y < GY1) {
      if (py <= GY0) { p.y = GY0 - 0.5; p.vy = -Math.abs(p.vy) * 0.4; }
      else if (py >= GY1) { p.y = GY1 + 0.5; p.vy = Math.abs(p.vy) * 0.4; }
      else { p.x = side ? bx1 + 0.5 : bx0 - 0.5; p.vx = (side ? 1 : -1) * Math.abs(p.vx) * 0.4; }
    }
  }
  return false;
}
function goalieCheck(S) {
  const p = S.puck;
  for (const g of [S.sk[5], S.sk[11]]) {
    if (p.gk[g.team] || (p.noPick.id === g.id && p.noPick.t > 0)) continue;
    if (Math.abs(p.x - g.x) > 7 || Math.abs(p.y - g.y) > 10) continue;
    const d = dirOf(g.team), sp = hyp(p.vx, p.vy);
    if (p.vx * d >= 0 && sp > 60) continue;
    if (sp > 200 && rnd(S) > T.G_SAVE) { p.gk[g.team] = 1; continue; }      // through the five-hole
    if (p.lastTeam !== g.team && p.shot) S.shots[1 - g.team]++;
    if (sp <= 200 || (sp < 430 && rnd(S) < 0.55)) { give(S, g); emit(S, 'save', 1); return; }
    p.x = g.x + d * 8; p.vx = d * Math.abs(p.vx) * (0.25 + rnd(S) * 0.3); p.vy = (rnd(S) - 0.5) * 260; p.shot = false; p.passTo = -1;
    emit(S, 'save', 0);
  }
}
function pickup(S) {
  const p = S.puck, sp = hyp(p.vx, p.vy);
  if (p.shot && sp < 220) p.shot = false;
  let best = null, bd = 1e9;
  for (const s of S.sk) {
    if (s.role === 5 || !onIce(s) || s.down > 0 || s.pickCd > 0 || (p.noPick.id === s.id && p.noPick.t > 0)) continue;
    const dist = hyp(s.x - p.x, s.y - p.y + 1);
    if (dist > (p.passTo === s.id ? 13 : 8.5)) continue;
    if (p.shot && sp > 260) {
      if (s.team !== p.lastTeam && !p.tried[s.id]) {
        p.tried[s.id] = 1;
        if (rnd(S) < T.BLOCK) { p.vx *= -0.25; p.vy = p.vy * 0.3 + (rnd(S) - 0.5) * 120; p.shot = false; emit(S, 'block'); return; }
      }
      continue;
    }
    if (dist < bd) { bd = dist; best = s; }
  }
  if (best) { const inter = p.lastTeam >= 0 && p.lastTeam !== best.team && sp > 150; give(S, best); emit(S, inter ? 'steal' : 'pick'); }
}
function stepPuck(S, dt) {
  const p = S.puck;
  if (p.noPick.t > 0) p.noPick.t -= dt;
  if (p.owner >= 0) {
    const o = S.sk[p.owner];
    if (o.role === 5) { p.x = o.x + dirOf(o.team) * 4; p.y = o.y + 1; } else { p.x = o.x + o.dx * 7; p.y = o.y + o.dy * 4 + 1; }
    p.vx = o.vx; p.vy = o.vy;
    return;
  }
  const n = 3, h = dt / n;
  for (let i = 0; i < n; i++) {
    const px = p.x, py = p.y;
    p.x += p.vx * h; p.y += p.vy * h;
    const k = Math.exp(-0.42 * h); p.vx *= k; p.vy *= k;
    if (goalCheck(S, px, py)) return;
    const before = hyp(p.vx, p.vy);
    if (confine(p, 2, 0.6) && before > 130) emit(S, 'board');
    goalieCheck(S);
    if (p.owner >= 0) return;
  }
  if (hyp(p.vx, p.vy) < 8) p.vx = p.vy = 0;
  pickup(S);
}

// --------------------------------------------------------------------------------------------- play
function stepPlay(S, dt) {
  const p = S.puck;
  S.clock -= dt;
  const owner = p.owner >= 0 ? S.sk[p.owner] : null;
  for (const team of [0, 1]) {
    const a = S.aim[team];
    a.ph += dt * 2 * T.AIM_HZ;
    const u = a.ph % 2, v = u < 1 ? u : 2 - u;
    a.y = GY0 + 4 + v * (GY1 - GY0 - 8);
    const toGoal = owner ? dirOf(team) * (oppGoal(team) - owner.x) : 0;
    a.on = !!owner && owner.team === team && owner.role < 5 && toGoal > 8 && toGoal < T.AIM_RANGE;
  }
  for (const s of S.sk) {
    if (s.lungeCd > 0) s.lungeCd -= dt;
    if (s.pickCd > 0) s.pickCd -= dt;
    if (s.shotAnim > 0) s.shotAnim -= dt;
    if (s.out > 0) { s.out -= dt; if (s.out <= 0) { s.out = 0; s.x = W / 2 + (s.team ? 26 : -26); s.y = 9; s.vx = 0; s.vy = 70; s.anger = 0; emit(S, 'penEnd', s.team); } }
  }
  for (const c of S.ctl) if (!c.dead) human(S, c, dt);
  const info = [teamInfo(S, 0), teamInfo(S, 1)];
  for (const s of S.sk) {
    if (!onIce(s)) continue;
    if (s.down > 0) { s.down -= dt; coast(s, dt, 3); if (s.down <= 0) s.pickCd = 0.2; continue; }
    if (s.lunge > 0) { s.lunge -= dt; coast(s, dt, 0.5); if (s.lunge <= 0) { s.vx *= 0.35; s.vy *= 0.35; } continue; }
    if (s.ctl >= 0) continue;
    if (s.role === 5) aiGoalie(S, s, dt); else aiSkater(S, s, dt, info[s.team]);
  }
  // body checks
  for (const a of S.sk) {
    if (a.lunge <= 0 || !onIce(a)) continue;
    for (const v of S.sk) {
      if (v.team === a.team || v.role === 5 || !onIce(v) || v.down > 0) continue;
      if (hyp(v.x - a.x, v.y - a.y) < T.HIT_R) { hit(S, a, v); break; }
    }
    if (S.phase !== 'play') return;
  }
  // bodies keep apart; boards, nets and creases hold
  const list = S.sk.filter(onIce);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
    if (d >= 10 || d < 0.01) continue;
    const push = (10 - d) / 2, nx = dx / d, ny = dy / d;
    if (a.role < 5) { a.x -= nx * push; a.y -= ny * push; }
    if (b.role < 5) { b.x += nx * push; b.y += ny * push; }
  }
  for (const s of list) { if (s.role < 5) { obstacles(s); confine(s, 6, 0); } }
  // a defender leaning on the carrier can lift the puck off them
  if (p.owner >= 0 && S.sk[p.owner].role < 5) {
    const o = S.sk[p.owner];
    for (const s of list) {
      if (s.team === o.team || s.role === 5 || s.down > 0 || s.pickCd > 0) continue;
      if (hyp(s.x - o.x, s.y - o.y) < 9 && rnd(S) < T.STEAL * dt) { o.pickCd = 0.6; o.wind = -1; give(S, s); emit(S, 'steal'); break; }
    }
  }
  stepPuck(S, dt);
  if (S.phase === 'play' && S.clock <= 0) { S.clock = 0; endPeriod(S); }
}

// -------------------------------------------------------------------------------------------- fights
// Two skaters square off on a line. Up guards the head, down guards the body, A jabs high, B digs low.
function mkFighter(x) { return { x, hp: T.FIGHT_HP, st: 0, t: 0, g: 0, done: false, lag: 0, ai: 0, aiMx: 0, aiG: 0 }; }
function startFight(S, a, v) {
  const ids = a.team === 0 ? [a.id, v.id] : [v.id, a.id];
  S.fight = { ids, f: [mkFighter(-26), mkFighter(26)], t: 0, intro: 1.6, over: 0, winner: -1 };
  for (const s of S.sk) { s.vx = s.vy = 0; s.lunge = 0; s.wind = -1; }
  const p = S.puck; p.owner = -1; p.vx = p.vy = 0; p.shot = false;
  S.phase = 'fight'; S.fightsLeft--; S.stats.fights++;
  emit(S, 'fightStart', ids[0], ids[1]);
}
function fightInput(S, F, i) {
  const c = S.ctl.find(c => !c.dead && c.sk === F.ids[i]) || S.ctl.find(c => !c.dead && c.team === i);
  if (c) return { mx: c.inp.mx, my: c.inp.my, pa: c.pressA, pb: c.pressB };
  const f = F.f[i], o = F.f[1 - i], gap = Math.abs(o.x - f.x), D = T.DIFF[S.cfg.diff] || T.DIFF[1];
  const out = { mx: f.aiMx, my: f.aiG === 1 ? -1 : f.aiG === 2 ? 1 : 0, pa: false, pb: false };
  if ((o.st === 1 || o.st === 2) && o.t < 0.03 && f.st === 0 && rnd(S) < 0.25 + D.v * 0.25 - 0.2) { f.aiG = o.st; f.ai = 0.3; f.aiMx = 0; }
  f.ai -= 1 / 60;
  if (f.ai <= 0) {
    f.ai = 0.22 + rnd(S) * 0.32; f.aiG = 0; f.aiMx = 0;
    if (gap > 30) f.aiMx = i === 0 ? 1 : -1;
    else { const r = rnd(S); if (r < 0.48) out.pa = true; else if (r < 0.8) out.pb = true; else f.aiG = rnd(S) < 0.5 ? 1 : 2; }
  }
  return out;
}
function stepFight(S, dt) {
  const F = S.fight;
  F.t += dt;
  if (F.intro > 0) { F.intro -= dt; return; }
  if (F.over > 0) { F.over -= dt; if (F.over <= 0) endFight(S); return; }
  for (const i of [0, 1]) {
    const f = F.f[i], o = F.f[1 - i], inp = fightInput(S, F, i), facing = i === 0 ? 1 : -1;
    if (f.st === 3) { f.t -= dt; if (f.t <= 0) f.st = 0; }
    else if (f.st === 1 || f.st === 2) {
      f.t += dt;
      const hi = f.st === 1;
      if (!f.done && f.t >= (hi ? 0.16 : 0.1)) {
        f.done = true;
        if (Math.abs(o.x - f.x) <= 32 && o.st !== 4) {
          if (o.g === f.st && o.st === 0) { f.lag = 0.2; o.x += facing * 2; emit(S, 'fblock'); }
          else {
            o.hp -= hi ? 2 : 1; o.st = 3; o.t = 0.22; o.g = 0; o.x += facing * 5;
            emit(S, 'fhit', hi ? 1 : 0, 1 - i);
            if (o.hp <= 0) { o.hp = 0; o.st = 4; F.over = 2; F.winner = i; emit(S, 'ko', i); }
          }
        } else emit(S, 'fmiss');
      }
      if (f.t >= (hi ? 0.42 : 0.3) + f.lag) { f.st = 0; f.lag = 0; }
    } else if (f.st === 0) {
      f.g = inp.my < -0.5 ? 1 : inp.my > 0.5 ? 2 : 0;
      if (inp.pa) { f.st = 1; f.t = 0; f.done = false; f.g = 0; }
      else if (inp.pb) { f.st = 2; f.t = 0; f.done = false; f.g = 0; }
      else if (f.g === 0) f.x += clamp(inp.mx, -1, 1) * 46 * dt;
    }
  }
  const [a, b] = F.f;
  if (b.x - a.x < 24) { const m = (a.x + b.x) / 2; a.x = m - 12; b.x = m + 12; }
  if (a.x < -60) { a.x = -60; b.x = Math.max(b.x, -36); }
  if (b.x > 60) { b.x = 60; a.x = Math.min(a.x, 36); }
  if (F.over <= 0 && F.t > T.FIGHT_T) { F.winner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1; F.over = 1.6; emit(S, 'bell', F.winner); }
}
function endFight(S) {
  const F = S.fight;
  for (const id of F.ids) S.sk[id].anger = 0;
  if (F.winner >= 0) {
    const loser = S.sk[F.ids[1 - F.winner]];
    loser.out = S.cfg.periodLen * T.PEN_FRAC;
    if (loser.ctl >= 0) { S.ctl[loser.ctl].sk = -1; loser.ctl = -1; }
    emit(S, 'penalty', loser.team, loser.id);
  }
  S.fight = null;
  setFaceoff(S);
}

// --------------------------------------------------------------------------------------------- step
export function step(S, dt) {
  S.t += dt; S.tick++;
  for (const c of S.ctl) {
    c.pressA = c.inp.pa > 0; if (c.pressA) c.inp.pa--;
    c.pressB = c.inp.pb > 0; if (c.pressB) c.inp.pb--;
  }
  while (S.ev.length && S.ev[0].t < S.t - 1.2) S.ev.shift();
  switch (S.phase) {
    case 'faceoff':
      for (const team of [0, 1]) { const c = S.ctl.find(c => !c.dead && c.sk === S.fo.ids[team]); if (c && (c.pressA || c.pressB) && S.phaseT < 1.2) { S.fo.lock[team] = 0.4; emit(S, 'early', team); } }
      if ((S.phaseT -= dt) <= 0) { S.phase = 'draw'; emit(S, 'drop'); }
      break;
    case 'draw': stepDraw(S, dt); break;
    case 'play': stepPlay(S, dt); break;
    case 'goal':
      for (const s of S.sk) if (onIce(s) && s.role < 5) { coast(s, dt, 2); obstacles(s); confine(s, 6, 0); }
      if ((S.phaseT -= dt) <= 0) { if (S.period > 3) { S.phase = 'final'; S.winner = S.score[0] > S.score[1] ? 0 : 1; emit(S, 'final', S.winner); } else setFaceoff(S); }
      break;
    case 'fight': stepFight(S, dt); break;
    case 'break': if ((S.phaseT -= dt) <= 0) setFaceoff(S); break;
  }
}

// ------------------------------------------------------------------------------- over the network
// What a guest needs to draw one moment of the match, as small as it will go.
export function pack(S) {
  const p = S.puck, sk = [];
  for (const s of S.sk) {
    const a = Math.round(Math.atan2(s.dy, s.dx) / (Math.PI / 8)) & 15;
    sk.push(Math.round(s.x * 4), Math.round(s.y * 4), Math.round(s.vx), Math.round(s.vy),
      (s.face > 0 ? 1 : 0) | (s.down > 0 ? 2 : 0) | (s.lunge > 0 ? 4 : 0) | (a << 3) | (s.shotAnim > 0 ? 128 : 0),
      s.ctl, s.wind < 0 ? -1 : Math.round(s.wind * 100), Math.ceil(s.out));
  }
  const F = S.fight;
  return {
    n: S.tick, ph: PH.indexOf(S.phase), pt: Math.round(S.phaseT * 100) / 100, pd: S.period, ck: Math.round(S.clock * 10) / 10,
    sc: S.score, sh: S.shots, wn: S.winner,
    am: [Math.round(S.aim[0].y * 2), S.aim[0].on ? 1 : 0, Math.round(S.aim[1].y * 2), S.aim[1].on ? 1 : 0],
    pk: [Math.round(p.x * 4), Math.round(p.y * 4), Math.round(p.vx), Math.round(p.vy), p.owner, p.shot ? 1 : 0],
    sk, ev: S.ev.map(e => [e.i, e.k, e.a, e.b]),
    ft: F ? [F.ids[0], F.ids[1], Math.round(F.t * 100) / 100, Math.round(F.intro * 100) / 100, Math.round(F.over * 100) / 100, F.winner,
      ...F.f.flatMap(f => [Math.round(f.x * 4), f.hp, f.st, Math.round(f.t * 100) / 100, f.g])] : 0,
  };
}
// The same shape the drawing code reads from a live game.
export function unpack(o, cfg) {
  const sk = [];
  for (let i = 0; i < 12; i++) {
    const b = i * 8, bits = o.sk[b + 4], a = (bits >> 3 & 15) * Math.PI / 8;
    sk.push({ id: i, team: i < 6 ? 0 : 1, role: i % 6, x: o.sk[b] / 4, y: o.sk[b + 1] / 4, vx: o.sk[b + 2], vy: o.sk[b + 3],
      face: bits & 1 ? 1 : -1, down: bits & 2 ? 1 : 0, lunge: bits & 4 ? 1 : 0, shotAnim: bits & 128 ? 1 : 0, dx: Math.cos(a), dy: Math.sin(a),
      ctl: o.sk[b + 5], wind: o.sk[b + 6] < 0 ? -1 : o.sk[b + 6] / 100, out: o.sk[b + 7] });
  }
  const f = o.ft;
  return {
    cfg, tick: o.n, t: o.n / 60, phase: PH[o.ph], phaseT: o.pt, period: o.pd, clock: o.ck, score: o.sc, shots: o.sh, winner: o.wn,
    aim: [{ y: o.am[0] / 2, on: !!o.am[1] }, { y: o.am[2] / 2, on: !!o.am[3] }],
    puck: { x: o.pk[0] / 4, y: o.pk[1] / 4, vx: o.pk[2], vy: o.pk[3], owner: o.pk[4], shot: !!o.pk[5] },
    sk, ev: o.ev.map(e => ({ i: e[0], k: e[1], a: e[2], b: e[3] })),
    fight: f ? { ids: [f[0], f[1]], t: f[2], intro: f[3], over: f[4], winner: f[5],
      f: [0, 1].map(i => ({ x: f[6 + i * 5] / 4, hp: f[7 + i * 5], st: f[8 + i * 5], t: f[9 + i * 5], g: f[10 + i * 5] })) } : null,
  };
}
// Blend two unpacked moments for smooth drawing between network updates.
export function blend(a, b, k) {
  if (!a || a.phase !== b.phase || k >= 1) return b;
  const L = (x, y) => x + (y - x) * k;
  const out = { ...b, sk: b.sk.map((s, i) => { const q = a.sk[i]; return (q.out > 0) !== (s.out > 0) || Math.abs(q.x - s.x) > 60 ? s : { ...s, x: L(q.x, s.x), y: L(q.y, s.y) }; }) };
  out.puck = Math.abs(a.puck.x - b.puck.x) > 80 ? b.puck : { ...b.puck, x: L(a.puck.x, b.puck.x), y: L(a.puck.y, b.puck.y) };
  out.aim = b.aim.map((m, i) => ({ on: m.on, y: L(a.aim[i].y, m.y) }));
  if (a.fight && b.fight) out.fight = { ...b.fight, f: b.fight.f.map((f, i) => ({ ...f, x: L(a.fight.f[i].x, f.x) })) };
  return out;
}
// A guest moves its own skater at once rather than waiting for the host to say so.
export function predictMove(s, mx, my, dt, hasPuck) {
  drive(s, mx, my, dt, (hasPuck ? T.V_CARRY : T.V_SKATE) * (s.wind >= 0 ? T.WIND_SLOW : 1));
  obstacles(s); confine(s, 6, 0);
}
