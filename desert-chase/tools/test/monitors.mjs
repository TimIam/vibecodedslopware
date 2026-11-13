// node monitors.mjs <chase.html url> <outdir>
// the real "Every monitor" flow with two fake 1600x900 screens: leader on the left, popup pane on the right
import { createRequire } from 'node:module';
const require = createRequire('C:/Projects/vibecodedslopware/package.json');
const { chromium } = require('playwright-core');
const base = process.argv[2], out = process.argv[3];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('desert-chase.settings', JSON.stringify({ tries: 'relentless' }));
  const mk = (left) => ({ left, top: 0, width: 1600, height: 900, availLeft: left, availTop: 0, availWidth: 1600, availHeight: 900, devicePixelRatio: 1 });
  const screens = [mk(0), mk(1600)];
  window.getScreenDetails = async () => ({ screens, currentScreen: screens[0] });
});
const logs = [];
const watch = (p, tag) => { p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(tag + ' ' + m.text().slice(0, 200)); }); p.on('pageerror', e => logs.push(tag + ' pageerror ' + e.message)); };
const lead = await ctx.newPage(); watch(lead, 'L');
await lead.goto(base + '#seed=77');
await lead.waitForFunction(() => window.__saver && window.__saver.baked, null, { timeout: 120000 });
const clickEvery = () => lead.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Every monitor/.test(x.textContent)); b.click(); return !!b; });
console.log('first click', await clickEvery());
await lead.waitForTimeout(500);
await lead.waitForFunction(() => window.__saver.baked && window.__saver.W === 3200, null, { timeout: 120000 }).catch(() => logs.push('leader rebake timeout'));
console.log('leader W', await lead.evaluate(() => window.__saver.W));
const popP = ctx.waitForEvent('page');
console.log('second click', await clickEvery());
const pane = await popP; watch(pane, 'P'); await pane.setViewportSize({ width: 1600, height: 900 });
console.log('pane url', pane.url().replace(/^.*#/, '#'));
await pane.waitForFunction(() => window.__saver && window.__saver.baked, null, { timeout: 120000 }).catch(() => logs.push('pane bake timeout'));
for (const p of [lead, pane]) await p.evaluate(() => document.body.classList.add('idle'));
for (let i = 0; i < 45; i++) {
  await lead.waitForTimeout(1000);
  const st = await lead.evaluate(() => { const d = window.__saver.SCENE.debug(); return window.__saver.SCENE.stats() + ' | coy x ' + d.A.coy.x.toFixed(1) + ' bird x ' + d.A.bird.x.toFixed(1); });
  if (i % 5 === 0 || /rag|charge|pounce|skid/.test(st)) {
    const tag = String(i).padStart(2, '0');
    await Promise.all([lead.screenshot({ path: `${out}/L${tag}.png` }), pane.screenshot({ path: `${out}/P${tag}.png` })]);
    console.log(i, st);
  }
}
console.log(logs.slice(0, 8).join('\n'));
await browser.close();
