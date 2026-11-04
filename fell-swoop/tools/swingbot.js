// Swing scorecard for tuning, run on localhost (needs window.__fs):
//   const { scorecard } = await import('/fell-swoop/tools/swingbot.js'); scorecard()
// Each stroke starts from a fresh clearing, stands at a distance from the first tree, winds up
// at A relaxed, then holds the button and sweeps the hands to B the way a player would.
export const STROKES = {
  'flat R→L': [[1.3, 0.1], [-0.8, -0.05]],
  'flat L→R': [[-1.2, 0.1], [0.8, -0.05]],
  'diag ↘ from R': [[1.1, 0.8], [-0.6, -0.45]],
  'diag ↙ from L': [[-1.0, 0.8], [0.6, -0.45]],
  'overhead': [[0.1, 1.05], [0, -0.6]],
  'rising from R': [[1.0, -0.6], [-0.5, 0.35]],
  'short flat': [[0.6, 0.05], [-0.4, 0]],
};

export function stroke(name, dist, { sweep = 0.16, hold = 0.45, path = null } = {}) {
  const f = window.__fs, [A, B] = path || STROKES[name], dt = 1 / 60;
  f.newClearing(1); f.setMode('play'); f.freeze(true);
  const t = f.G.target, p = f.player.pos;
  const dx = p.x - t.x, dz = p.z - t.z, d0 = Math.hypot(dx, dz);
  // Wind up out of reach of the trunk, then step in carrying the axe.
  p.set(t.x + dx / d0 * 3, 0, t.z + dz / d0 * 3);
  f.player.yaw = Math.atan2(-(t.x - p.x), -(t.z - p.z));
  f.input.lmb = false; f.setCursor(A[0], A[1]); f.sim(80);
  const step = (dist - 3);
  for (const v of [p, f.axe.x, f.axe.xPrev]) if (v) { v.x += dx / d0 * step; v.z += dz / d0 * step; }
  f.sim(12);
  // The game clears the axe's events every frame: catch them as they are emitted.
  const seen = [], emit = f.axe.emit;
  f.axe.emit = function (e) { seen.push({ type: e.type, depth: e.depth || 0, y: e.point ? e.point.y : (e.surf ? e.surf.y : 0), energy: e.energy || 0, speed: e.speed || 0 }); return emit.call(this, e); };
  f.input.lmb = true;
  const n = Math.round(sweep / dt);
  try {
    for (let i = 1; i <= n; i++) { const k = i / n, s = k * k * (3 - 2 * k); f.setCursor(A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s); f.sim(1); }
    f.sim(Math.round(hold / dt));
  } finally { f.axe.emit = emit; f.input.lmb = false; }
  const bite = seen.find(e => e.type === 'bite');
  const first = seen.find(e => ['bite', 'glance', 'nowood', 'flat', 'handle', 'poll', 'cheek', 'tap'].includes(e.type));
  return {
    result: bite ? `bite ${(bite.depth * 100).toFixed(1)}cm` : first ? first.type : 'miss',
    at: first ? +first.y.toFixed(2) : null, speed: bite ? +bite.speed.toFixed(1) : null,
    stuck: f.axe.mode === 'stuck', cm: bite ? bite.depth * 100 : 0,
  };
}

// Sloppy, human-ish strokes: a wind-up anywhere out to one side, swung through to somewhere
// past the tree on the other, at a random speed and distance inside chopping range.
export function sloppy(n = 60, seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const tally = {}, f = window.__fs, rows = [];
  for (let i = 0; i < n; i++) {
    const side = rnd() < 0.5 ? 1 : -1;
    const A = [side * (0.7 + rnd() * 0.6), -0.4 + rnd() * 1.4], B = [-side * (0.2 + rnd() * 0.7), -0.6 + rnd() * 0.8];
    const gap = 0.84 + rnd() * 0.27, d = gap + 0.17;
    const r = stroke(null, d, { path: [A, B], sweep: 0.1 + rnd() * 0.2 });
    const k = r.cm ? (r.cm >= 2.5 ? 'bite' : 'nick') : r.result;
    tally[k] = (tally[k] || 0) + 1;
    if (!r.cm) rows.push(`${k} A ${A.map(v => v.toFixed(2))} B ${B.map(v => v.toFixed(2))} d ${d.toFixed(2)}${r.at != null ? ' @' + r.at : ''}`);
  }
  f.freeze(false); f.setMode('title');
  return JSON.stringify(tally) + '\n' + rows.join('\n');
}

export function scorecard(dists = [1.0, 1.2, 1.4], opts) {
  const rows = [], tally = { bites: 0, n: 0, cm: 0 };
  for (const name of Object.keys(STROKES)) {
    const cells = dists.map(d => { const r = stroke(name, d, opts); tally.n++; if (r.cm) { tally.bites++; tally.cm += r.cm; } return `${r.result}${r.at != null ? '@' + r.at : ''}`; });
    rows.push(`${name.padEnd(15)} ${cells.map(c => c.padEnd(18)).join(' ')}`);
  }
  window.__fs.freeze(false); window.__fs.setMode('title');
  return `${''.padEnd(15)} ${dists.map(d => (d + ' m').padEnd(18)).join(' ')}\n${rows.join('\n')}\nbit ${tally.bites}/${tally.n}, avg ${(tally.cm / Math.max(1, tally.bites)).toFixed(1)} cm`;
}
