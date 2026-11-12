// Plays thousands of runs with a perfect bot and a random bot to check the scoring.
import * as G from "../js/gen.js";
const N = +process.argv[2] || 2000;
const stats = { best: [], rnd: [], rightIsBest: 0, total: 0, kinds: {}, verdicts: {} };
for (let s = 1; s <= N; s++) {
  for (const mode of ["best", "rnd"]) {
    const r = G.makeRng(s * 31 + (mode === "best" ? 0 : 7));
    const pool = G.makePool(s);
    let last = -1, tot = 0;
    for (let i = 0; i < G.SHIFTS; i++) {
      const rv = G.makeReviewer(r.int(1e9));
      const g = G.nextGame(pool, last, r); last = g.id;
      const opts = G.makeOptions(g, pool, r.int(1e9));
      const js = opts.map((o) => G.judge(o, g, rv, 8, 99));
      if (opts.length !== 4) throw new Error("options " + opts.length);
      let k;
      if (mode === "best") {
        k = js.indexOf(js.reduce((a, b) => (b.points > a.points ? b : a)));
        stats.total++; if (opts[k].kind === "right") stats.rightIsBest++;
        stats.kinds[opts[k].kind] = (stats.kinds[opts[k].kind] || 0) + 1;
      } else k = r.int(4);
      stats.verdicts[js[k].verdict] = (stats.verdicts[js[k].verdict] || 0) + (mode === "rnd");
      tot += js[k].points;
      G.applyReview(g, opts[k], js[k], rv, i);
    }
    stats[mode].push(tot);
  }
}
const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
console.log("perfect bot avg", avg(stats.best), "p10", pct(stats.best, .1), "p90", pct(stats.best, .9));
console.log("random bot avg", avg(stats.rnd), "p10", pct(stats.rnd, .1), "p90", pct(stats.rnd, .9));
console.log("right option is best:", (stats.rightIsBest / stats.total * 100).toFixed(1) + "%", stats.kinds);
console.log("random verdicts", stats.verdicts);
