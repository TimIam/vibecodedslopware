// Headless screenshots and scripted checks on the real GPU.
//   node augmented-treality/tools/shot.mjs <url> [--phone] [--size 1400x900] [--wait ms]
//        [--shots "js => out.png ;; js2 => out2.png"] [--evalfile f.js] [--download dir]
// Waits for window.__at.ready, prints console errors at the end. --download saves files the page downloads.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let chromium;
for (const base of [process.cwd(), 'C:/Projects/vibecodedslopware']) {
  const p = path.join(base, 'node_modules/playwright-core/index.mjs');
  if (fs.existsSync(p)) { ({ chromium } = await import(pathToFileURL(p).href)); break; }
}
const a = process.argv.slice(2), url = a[0];
const opt = k => { const i = a.indexOf('--' + k); return i > 0 ? a[i + 1] : null; };
const phone = a.includes('--phone');
const [w, h] = (opt('size') || (phone ? '390x844' : '1400x900')).split('x').map(Number);
const wait = Number(opt('wait') || 1200);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + String(e.stack || e).slice(0, 800)));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' || (m.type() === 'warning' && !/X4122|deprecated/.test(t))) errs.push(m.type() + ': ' + t.slice(0, 600)); else if (m.type() === 'log' && t.startsWith('[test]')) console.log(t); });
if (opt('download')) page.on('download', async d => { const f = path.join(opt('download'), d.suggestedFilename()); await d.saveAs(f); console.log('downloaded', f, fs.statSync(f).size); });
await page.goto(url);
try { await page.waitForFunction('window.__at?.ready', null, { timeout: 60000 }); } catch { errs.push('ready timeout'); }
await page.waitForTimeout(wait);
if (opt('evalfile')) {
  try { console.log('eval:', JSON.stringify(await page.evaluate(fs.readFileSync(opt('evalfile'), 'utf8')), null, 1)); } catch (e) { errs.push('eval failed: ' + String(e).slice(0, 800)); }
}
if (opt('shots')) {
  for (const pair of opt('shots').split(';;')) {
    const k = pair.lastIndexOf('=>'), js = pair.slice(0, k).trim(), file = pair.slice(k + 2).trim();
    try { const r = await page.evaluate(js); if (r !== undefined && r !== null) console.log(file, JSON.stringify(r)); } catch (e) { errs.push(`shot ${file}: ` + String(e).slice(0, 400)); }
    await page.waitForTimeout(wait);
    await page.screenshot({ path: file });
  }
}
if (opt('download')) await page.waitForTimeout(3000);
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 20).join('\n'));
await browser.close();
