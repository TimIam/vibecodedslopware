// headless run that snapshots on every state change of either animal (plus a frame shortly after each change)
// SET='{"tries":"relentless"}' node episodes.mjs <chase.html url, add #seed=N> <outdir> [seconds] [plan] [w] [h]
import { createRequire } from 'node:module';
const require = createRequire('C:/Projects/vibecodedslopware/package.json');
const { chromium } = require('playwright-core');
const [url, out, secs = '20', plan = '', w = '1600', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
if (process.env.SET) await page.addInitScript((s) => { localStorage.setItem('desert-chase.settings', s); }, process.env.SET);
await page.goto(url);
await page.waitForFunction(() => window.__saver && window.__saver.baked, null, { timeout: 180000 }).catch(e => logs.push('bake timeout'));
await page.evaluate(() => { document.body.classList.add('idle'); });
if (plan) await page.evaluate((p) => { const d = window.__saver.SCENE.debug(); d.setPlan(p); d.A.coy.stT = 0; }, plan);
const t0 = Date.now(); let last = '', n = 0, pend = 0;
while (Date.now() - t0 < +secs * 1000) {
  const st = await page.evaluate(() => { const d = window.__saver.SCENE.debug(), c = d.A.coy, b = d.A.bird; const pc = d.proj(c.sk.J[c.sk.names.withers]), pb = d.proj(b.sk.J[b.sk.names.hips]); return { k: c.st + '/' + b.st + (c.plan ? ' [' + c.plan.kind + ']' : ''), s: window.__saver.SCENE.stats(), pc: pc.map(Math.round), pb: pb.map(Math.round), v: c.v.toFixed(1) }; });
  const now = ((Date.now() - t0) / 1000).toFixed(1);
  if (st.k !== last || (pend && Date.now() > pend)) {
    const tag = String(n++).padStart(3, '0');
    console.log(now, tag, st.k, 'coy', st.pc.join(','), 'v', st.v, 'bird', st.pb.join(','));
    await page.screenshot({ path: `${out}/s${tag}.png` });
    pend = st.k !== last ? Date.now() + 450 : 0; last = st.k;
  }
  await page.waitForTimeout(60);
}
console.log(logs.slice(0, 6).join('\n'));
await browser.close();
