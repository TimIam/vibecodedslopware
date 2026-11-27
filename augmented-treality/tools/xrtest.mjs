// Drives the WebXR AR path headlessly with Meta's IWER emulator standing in a scanned living room:
// session start, floor hit-test, tap to place, the AR buttons, and the way back to the builder.
//   node augmented-treality/tools/xrtest.mjs [http://localhost:3191/augmented-treality/] [shots-dir]
// IWER comes from augmented-treality-app's devDependencies (npm install there first).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/playwright-core/index.mjs')).href);
const url = process.argv[2] || 'http://localhost:3191/augmented-treality/', S = process.argv[3] || null;
const mods = path.join(root, 'augmented-treality-app/node_modules');
const iwer = fs.readFileSync(mods + '/iwer/build/iwer.js', 'utf8');
const sem = fs.readFileSync(mods + '/@iwer/sem/build/iwer-sem.js', 'utf8');
const room = fs.readFileSync(mods + '/@iwer/sem/captures/living_room.json', 'utf8');
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 800, height: 900 } });
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/X4122|deprecated|metalnessMap/.test(m.text())) logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', e => logs.push('pageerror: ' + String(e.stack || e).slice(0, 500)));
await page.addInitScript({ content: iwer + '\n' + sem + `
  window.__xrdev = new IWER.XRDevice(IWER.metaQuest3);
  window.__xrdev.installRuntime({ forceInstall: true });
  window.__xrdev.installSEM(IWER_SEM.SyntheticEnvironmentModule);
  window.__xrroom = ${room};
` });
await page.goto(url);
await page.waitForFunction('window.__at?.ready');
const r1 = await page.evaluate(async () => {
  document.querySelector('#title')?.remove();
  const dev = window.__xrdev;
  dev.sem.loadEnvironment(window.__xrroom);
  dev.position.set(0, 1.5, 0);
  // Look down at the floor, a couple of metres ahead.
  const a = -0.6; dev.quaternion.set(Math.sin(a / 2), 0, 0, Math.cos(a / 2));
  const supported = await navigator.xr.isSessionSupported('immersive-ar');
  document.querySelector('#ar').click();
  await new Promise(r => setTimeout(r, 2500));
  const at = window.__at;
  return { supported, inAR: document.body.classList.contains('in-ar'), status: document.querySelector('#ar-status').textContent, overlay: !document.querySelector('#ar-overlay').hidden };
});
console.log('session:', JSON.stringify(r1));
if (S) await page.screenshot({ path: S + '/xr1.png' });
// Pull the trigger: a 'select' on the session.
const r2 = await page.evaluate(async () => {
  const dev = window.__xrdev;
  const c = dev.controllers.right;
  c.updateButtonValue('trigger', 1);
  await new Promise(r => setTimeout(r, 300));
  c.updateButtonValue('trigger', 0);
  await new Promise(r => setTimeout(r, 1800));
  const root = window.__at.model.root, holder = root.parent;
  const p = holder.position;
  return { placed: holder.visible, at: [p.x, p.y, p.z].map(v => +v.toFixed(2)), scale: +root.scale.x.toFixed(2), tools: !document.querySelector('#ar-tools').hidden };
});
console.log('placed:', JSON.stringify(r2));
if (S) await page.screenshot({ path: S + '/xr2.png' });
const r3 = await page.evaluate(async () => {
  document.querySelector('#ar-snow').click();
  document.querySelector('#ar-size').click();
  const label = document.querySelector('#ar-size').textContent;
  document.querySelector('#ar-lights').click();
  await new Promise(r => setTimeout(r, 800));
  const scale = window.__at.model.root.scale.x;
  document.querySelector('#ar-done').click();
  await new Promise(r => setTimeout(r, 1200));
  return { label, scale, ended: !document.body.classList.contains('in-ar'), backInBuilder: window.__at.model.root.parent === window.__at.view.scene, lights: document.querySelector('#ar-lights').textContent };
});
console.log('tools+end:', JSON.stringify(r3));
if (S) await page.screenshot({ path: S + '/xr3.png' });
if (logs.length) console.log('LOGS:\n' + [...new Set(logs)].slice(0, 15).join('\n'));
await b.close();
const ok = r1.inAR && r2.placed && r2.tools && r3.ended && r3.backInBuilder && r3.scale === 0.2;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
