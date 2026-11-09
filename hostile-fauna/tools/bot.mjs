// Headless bot run of one outing, using the system Chrome through playwright-core (repo devDependency).
//   node hostile-fauna/tools/bot.mjs <mission 0-4> [max seconds] [screenshot.png]      (HF_URL overrides the address)
// Prints a line every 15 game-seconds and stops at the debrief. The bot aims well and dodges nothing.
import { chromium } from 'playwright-core';
const [idx = '0', secs = '420', out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto(process.env.HF_URL || 'http://localhost:3131/hostile-fauna/'); await page.waitForFunction(() => window.__hf, null, { timeout: 20000 });
await page.evaluate(i => { localStorage.clear(); __hf.S.save.seenIntro = true; if (+i > 0) { __hf.S.save.pts = 0; const sk = ['c_hp','g_thorn','v_blink','c_regen','g_chorus','v_look','c_shell','g_spore'].slice(0, i * 2); for (const k of sk) __hf.S.save.skills[k] = 1; } __hf.bot(true); __hf.start(+i); }, idx);
let last = '';
for (let t = 0; t < +secs; t += 15) {
  const st = await page.evaluate(() => __hf.step(450));
  const line = `${String(st.t).padStart(6)}s st${st.stage} hp${st.hp} sh${st.sh} en${st.enemies}/${st.alert} ret${st.stats?.returned} slain${st.stats?.slain} taken${Math.round(st.stats?.taken)} pos${st.pos} | ${st.obj}`;
  console.log(line);
  if (errs.length) { console.log('ERR', errs.slice(0, 3)); break; }
  if (st.mode === 'debrief') { console.log('DEBRIEF reached', JSON.stringify(st.stats), 'level', st.level); break; }
}
if (out) { await page.waitForTimeout(1500); await page.screenshot({ path: out }); }
await browser.close();
