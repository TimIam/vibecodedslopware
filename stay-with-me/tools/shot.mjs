// Screenshot a page on the real GPU (headless Chrome, D3D11), optionally running JS first.
//   node stay-with-me/tools/shot.mjs <url> <out.png> [--eval "js"] [--evalfile f.js] [--wait ms] [--size 1600x900] [--ready "js expr"] [--shots "js1 => a.png ;; js2 => b.png"]
// --ready: an expression polled until truthy before anything else (default: window.__dev?.ready || window.__swm?.ready).
// --eval runs once after ready; its JSON result is printed. --shots takes several "js => file" pairs to grab many views
// in one browser launch. Console errors and page errors are printed at the end.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let chromium;
for (const base of [process.cwd(), 'C:/Projects/vibecodedslopware']) {
  const p = path.join(base, 'node_modules/playwright-core/index.mjs');
  if (fs.existsSync(p)) { ({ chromium } = await import(pathToFileURL(p).href)); break; }
}
if (!chromium) { console.error('playwright-core not found'); process.exit(1); }

const a = process.argv.slice(2), url = a[0], out = a[1];
const opt = k => { const i = a.indexOf('--' + k); return i > 0 ? a[i + 1] : null; };
const [w, h] = (opt('size') || '1600x900').split('x').map(Number);
const wait = Number(opt('wait') || 1500);
const ready = opt('ready') || 'window.__dev?.ready || window.__swm?.ready';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + String(e.stack || e).slice(0, 600)));
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /THREE|WebGL|shader/i.test(m.text()))) errs.push(m.type() + ': ' + m.text().slice(0, 600)); });
await page.goto(url);
try { await page.waitForFunction(ready, null, { timeout: 60000 }); } catch { errs.push('ready timeout: ' + ready); }
const ev = opt('evalfile') ? fs.readFileSync(opt('evalfile'), 'utf8') : opt('eval');
if (ev) { try { console.log('eval:', JSON.stringify(await page.evaluate(ev))); } catch (e) { errs.push('eval failed: ' + String(e).slice(0, 600)); } }
await page.waitForTimeout(wait);
if (opt('shots')) {
  for (const pair of opt('shots').split(';;')) {
    const [js, file] = pair.split('=>').map(s => s.trim());
    try { const r = await page.evaluate(js); if (r !== undefined && r !== null) console.log(file, JSON.stringify(r)); } catch (e) { errs.push(`shot ${file}: ` + String(e).slice(0, 400)); }
    await page.waitForTimeout(wait);
    await page.screenshot({ path: file });
  }
} else if (out && out !== '-') await page.screenshot({ path: out });
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 20).join('\n'));
await browser.close();
