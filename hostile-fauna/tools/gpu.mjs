// Runs a JS file in the page on the real GPU (headless Chrome, D3D11) and prints its result.
//   node hostile-fauna/tools/gpu.mjs <url> <script.js> [screenshot.png]
// The software renderer the other tools use hides GPU-only faults such as NaN pixels, so check new shaders here.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [url, file, shot] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto(url); await page.waitForFunction(() => window.__hf, null, { timeout: 20000 });
const gl = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
console.log('renderer:', gl);
console.log(await page.evaluate(fs.readFileSync(file, 'utf8')), errs);
if (shot) await page.screenshot({ path: shot });
await browser.close();
