// Dev tool: plays the whole album headless, cinemas advanced with A and every stage by its bot.
// Open /3030/?seq=0, then in the console: await import('/3030/tools/album.js'); await __albumRun()
// Progress and per-stage [win, score] land in window.__album.
window.__albumRun = async function () {
  const log = window.__album = { steps: [], errors: [], done: false, t0: performance.now() };
  addEventListener('error', e => log.errors.push(String(e.message)));
  __d3.manual(true);
  let guard = 0, last = '', since = 0;
  while (guard++ < 200000) {
    const name = __d3.scene(), sc = __d3.cur();
    if (name !== last) { log.steps.push({ name, at: +__d3.G.t.toFixed(1) }); last = name; since = 0; }
    since++;
    try {
      if (name === 'credits') { log.done = true; break; }
      if (name.startsWith('cine:') || name === 'boot') { __d3.tap('a', 1); __d3.step(8); }
      else if (name.startsWith('stage:')) {
        const ph = sc.phase;
        __d3.bot = ph === 'play';
        if (ph === 'card') { __d3.step(30); __d3.tap('a'); }
        else if (ph === 'result') {
          const r = sc.inst.result;
          const cur = log.steps[log.steps.length - 1];
          (cur.results = cur.results || []).push([r.win, r.score]);
          __d3.bot = false; __d3.tap('a'); __d3.step(40);
        } else __d3.step(30);
      } else { __d3.step(30); }
    } catch (e) { log.errors.push(name + ': ' + e.message); break; }
    if (since > 20000) { log.errors.push('stuck in ' + name); break; }
    if (guard % 50 === 0) await new Promise(r => setTimeout(r, 0));
  }
  log.ms = Math.round(performance.now() - log.t0);
  return log;
};
