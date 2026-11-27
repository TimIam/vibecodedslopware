// Pretends to be iPhone Safari (rel="ar" supported, no WebXR) and checks the AR button hands Quick Look a USDZ
// straight from the tap (it is built ahead of time).
//   node augmented-treality/tools/qltest.mjs [http://localhost:3191/augmented-treality/] [download-dir]
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/playwright-core/index.mjs')).href);
const url = process.argv[2] || 'http://localhost:3191/augmented-treality/', dir = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'treality-'));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', e => logs.push('pageerror: ' + e));
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
await page.addInitScript(() => {
  const orig = DOMTokenList.prototype.supports;
  DOMTokenList.prototype.supports = function (t) { return t === 'ar' ? true : orig.call(this, t); };
  Object.defineProperty(navigator, 'xr', { value: undefined });
  window.__clicks = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { window.__clicks.push({ rel: this.rel, href: this.href.slice(0, 60), img: !!this.querySelector('img') }); return click.call(this); };
});
const got = new Promise(r => page.on('download', async d => { const f = path.join(dir, d.suggestedFilename()); await d.saveAs(f); r([f, fs.statSync(f).size]); }));
await page.goto(url);
await page.waitForFunction('window.__at?.ready');
await page.evaluate(() => document.querySelector('#title')?.remove());
await page.waitForTimeout(4500); // prewarm runs ~1.8 s after load
const t0 = Date.now();
await page.tap('#ar');
const dl = await Promise.race([got, new Promise(r => setTimeout(() => r(null), 15000))]);
const clicks = await page.evaluate(() => window.__clicks), ms = Date.now() - t0;
console.log(JSON.stringify({ clicks, download: dl, msAfterTap: ms }));
const ok = clicks.length === 1 && clicks[0].rel === 'ar' && clicks[0].img && dl && dl[1] > 100000 && ms < 1000;
if (logs.length) console.log(logs.join('\n'));
await b.close();
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
