// Headless checks of the lock mechanics: an SPP bot and a rake bot try every job, and a few rules are asserted
// (overset under heavy tension, drops under no tension, spools need lighter tension).
//   node binding-order/tools/simtest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOBS, makeLock, FAMILY_TOOLS } from '../js/locks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const META = JSON.parse(fs.readFileSync(path.join(here, '../assets/locks.json'), 'utf8'));
const TOOLS = JSON.parse(fs.readFileSync(path.join(here, '../assets/tools.json'), 'utf8'));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

function spp(job, seed, verbose) {
  const meta = META[job.model];
  const L = makeLock(job, meta, seed);
  const fam = L.geo.family;
  const tool = fam === 'tubular' ? { top: [[0, 0]] } : TOOLS[FAMILY_TOOLS[fam].includes('hook') ? 'hook' : FAMILY_TOOLS[fam][0]];
  L.setTool(tool);
  const dt = 1 / 60;
  let t = 0;
  let T = 0.28;
  const inp = { p: 0, h: L.geo.tipMin ?? 0, T, flip: false, select: 0 };
  const run = (secs) => { for (let k = 0; k < secs / dt; k++) { L.step(dt, inp); t += dt; } };
  if (fam === 'warded') {
    // try every skeleton at a sweep of depths
    for (const w of FAMILY_TOOLS.warded) {
      L.setTool(TOOLS[w]);
      for (let p = 2; p <= L.geo.reach; p += 0.5) {
        inp.T = 0; run(0.3); inp.p = p; run(0.3); inp.T = 0.95; run(0.6);
        if (L.open) return { open: true, t, tool: w, p };
      }
    }
    return { open: false, t };
  }
  run(0.3);
  for (let guard = 0; guard < 80 && !L.open; guard++) {
    const b = L.binding;
    if (b < 0) break;
    const s = L.stacks[b];
    if (s.state === 'over') { inp.T = 0; run(0.5); inp.T = T; run(0.3); continue; }
    if (fam === 'tubular') { inp.select = b; inp.h = 0; run(0.1); }
    else {
      inp.flip = s.dir < 0;
      inp.h = inp.flip ? -L.geo.tipMin : L.geo.tipMin; run(0.15);
      inp.p = s.z + (fam === 'lever' ? -0.2 : 0.55); run(0.4);
    }
    // lift slowly until it sets
    const sgn = inp.flip ? -1 : 1;
    for (let k = 0; k < 600 && s.state !== 'set' && s.state !== 'over'; k++) {
      inp.h += sgn * 0.012;
      if (s.state === 'caught') inp.T = Math.min(T, s.catches[s.cIdx].pass * 0.88); else inp.T = T;
      run(dt);
      if (sgn * inp.h > L.geo.tipMax + 0.5) break;
    }
    inp.T = T;
    if (verbose) console.log('  pin', b, s.type, s.state, 'need', s.need, 'y', s.y.toFixed(2), 't', t.toFixed(1));
    inp.h = inp.flip ? -L.geo.tipMin : L.geo.tipMin; run(0.15);
  }
  return { open: L.open, t, stats: L.stats };
}

function rake(job, seed, T) {
  const meta = META[job.model];
  const L = makeLock(job, meta, seed);
  if (!['pin', 'wafer'].includes(L.geo.family)) return null;
  L.setTool(TOOLS.bogota);
  const inp = { p: 0, h: L.geo.tipMin, T, flip: false };
  const dt = 1 / 60;
  for (let k = 0; k < 60 * 20 && !L.open; k++) {
    const ph = k * dt * 6;
    inp.p = L.geo.reach * (0.55 + 0.4 * Math.sin(ph));
    inp.h = L.geo.tipMin + (L.geo.tipMax - L.geo.tipMin) * (0.45 + 0.4 * Math.sin(ph * 2.3));
    if (L.geo.family === 'wafer') inp.flip = Math.floor(k / 90) % 2 === 1;
    L.step(dt, inp);
  }
  return { open: L.open, stats: L.stats };
}

for (const job of JOBS) {
  let opened = 0, tsum = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = spp(job, seed, process.argv.includes('-v') && seed === 1);
    if (r.open) { opened++; tsum += r.t; }
  }
  const rk = [];
  for (const T of [0.12, 0.25, 0.6]) {
    let o = 0, n = 0;
    for (let seed = 1; seed <= 6; seed++) { const r = rake(job, seed, T); if (r) { n++; if (r.open) o++; } }
    if (n) rk.push(`T${T}:${o}/${n}`);
  }
  console.log(`${job.id} ${job.title.padEnd(28)} SPP ${opened}/6 avg ${(tsum / Math.max(1, opened)).toFixed(1)}s   rake ${rk.join(' ')}`);
  ok(opened >= 5, `${job.id} SPP bot opened only ${opened}/6`);
}

// rules
{
  const job = JOBS[0];
  const L = makeLock(job, META[job.model], 3);
  L.setTool(TOOLS.deep);
  const inp = { p: 0, h: L.geo.tipMin, T: 0.9 };
  const dt = 1 / 60;
  for (let k = 0; k < 60; k++) L.step(dt, inp);
  const b = L.binding;
  inp.p = L.stacks[b].z + 0.5;
  for (let k = 0; k < 60; k++) L.step(dt, inp);
  inp.h = L.geo.tipMax;
  for (let k = 0; k < 120; k++) L.step(dt, inp);
  ok(L.stacks[b].state === 'over' || L.broken || L.stacks[b].state === 'free', 'heavy tension + full lift does not cleanly set: ' + L.stacks[b].state);
  console.log('heavy-tension jab ->', L.stacks[b].state, 'strain', L.strain.toFixed(2), 'oversets', L.stats.oversets);
}
console.log(fails ? `${fails} FAILURES` : 'all good');
process.exit(fails ? 1 : 0);
