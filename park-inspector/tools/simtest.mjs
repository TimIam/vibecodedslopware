// node park-inspector/tools/simtest.mjs [parks=300] — generates parks and checks the generator's promises.
import { genPark, buildCoaster } from '../js/gen.js';
import { SECTION } from '../js/code.js';
const N = Number(process.argv[2] || 300);
const fail = [];
const stats = { targets: 0, truth: [0, 0, 0], coasters: 0, coasterMiss: 0, defects: 0, tells: 0, kinds: {} };
const t0 = Date.now();
for (let s = 1; s <= N; s++) {
  const day = 1 + (s % 8);
  const p = genPark(s * 31 + 7, day);
  for (const tg of p.targets) {
    stats.targets++; stats.truth[tg.truth]++;
    if (!Number.isFinite(tg.x) || !Number.isFinite(tg.z)) fail.push(`${s} ${tg.id} no position`);
    if (tg.type === 'coaster') {
      stats.coasters++;
      if (!tg.coaster) { fail.push(`${s} coaster null`); continue; }
      const m = tg.coaster.m;
      if (m.vMinRun < 3) fail.push(`${s} coaster stalls v=${m.vMinRun}`);
      const test = tg.findings.find(f => f.group === 'test');
      if (test.defect == null && (m.maxGz > 4.5 || m.minGz < -1 || m.maxLat > 1.5)) fail.push(`${s} clean coaster out of limits ${JSON.stringify(m)}`);
    }
    for (const f of tg.findings) {
      if (f.defect) {
        stats.defects++; if (f.tell) stats.tells++;
        for (const c of String(f.defect.code).split(', ')) if (!SECTION[c]) fail.push(`${s} bad code ${c}`);
        stats.kinds[f.kind] = (stats.kinds[f.kind] || 0) + 1;
      }
      if (!f.lines?.length) fail.push(`${s} ${f.id} no lines`);
      if (f.lines.some(l => /NaN|undefined/.test(l))) fail.push(`${s} ${f.id} bad line ${f.lines.join(' | ')}`);
    }
  }
  const C = T => T.find(t => t.type === 'coaster');
  const co = C(p.targets);
  if (co) for (const t of p.targets) {
    if (t === co) continue;
    const fp = { ferris: 10, drop: 7, swing: 12, pirate: 10, food: 4, firstaid: 4 }[t.type];
    for (let i = 0; i < co.coaster.N; i += 4) {
      const d = Math.hypot(co.coaster.pos[i][0] + co.x - t.x, co.coaster.pos[i][2] + co.z - t.z);
      if (d < fp + 7) { fail.push(`${s} ${t.type} under the coaster d=${d.toFixed(1)}`); break; }
    }
  }
  // targets must not overlap
  const T = p.targets;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const a = T[i], b = T[j];
    if (a.type === 'coaster' || b.type === 'coaster') continue;
    const fp = { ferris: 10, drop: 7, swing: 12, pirate: 10, food: 4, firstaid: 4 };
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < fp[a.type] + fp[b.type]) fail.push(`${s} overlap ${a.type}/${b.type} d=${d.toFixed(1)}`);
  }
}
console.log(JSON.stringify(stats), `${Date.now() - t0} ms`);
console.log(fail.length ? `FAIL ${fail.length}\n` + fail.slice(0, 25).join('\n') : 'OK');
process.exit(fail.length ? 1 : 0);
