#!/usr/bin/env node
// Headless screenshot + console capture for the game, so several people/agents can verify in parallel
// without sharing one browser. Uses the system Chrome through playwright-core (repo devDependency).
//
//   node datacenter/tools/shot.mjs <url> [--out shot.png] [--wait 4000] [--w 1280] [--h 800] [--mobile]
//                                   [--eval "<js expression>"] [--click x,y] [--actions '<json>']
//
// Prints a JSON report: { url, errors:[], console:[], eval, title, out }. Exit code 1 if any page error
// or console.error was seen (unless --lenient). --actions is a JSON array of steps (or @path to a JSON file) run in
// order, each {click:[x,y]} | {tap:"css selector"} | {tapIf:"css"} (skipped when absent) | {hover:"css"} | {move:[x,y]}
// | {clickEval:"expr → [x,y] page px"} | {waitFor:"css", timeout?:ms} | {type:"text"} | {key:"Enter"} | {wait:ms}
// | {eval:"expr", as:"name"} | {shot:"file.png"} | {viewport:[w,h]} | {repeat:n, steps:[…]} | {hold:"css", ms:1400}
// (press-and-hold). Results of named evals end up in report.evals; a failed tap/waitFor is recorded in report.errors
// and the run goes on. Dialogs (confirm/alert) are accepted and listed in report.dialogs.
//
// Example: node datacenter/tools/shot.mjs "http://localhost:3131/datacenter/?speed=20" --wait 6000 --out /tmp/a.png --eval "window.__game?.state.run.cash"

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; return (v === undefined || v.startsWith('--')) ? true : v; };
if (!url) { console.error('usage: shot.mjs <url> [--out f.png] [--wait ms] [--w px] [--h px] [--mobile] [--eval expr] [--actions json] [--lenient]'); process.exit(2); }

const out = opt('out', null);
const wait = Number(opt('wait', 4000));
const mobile = !!opt('mobile', false);
const width = Number(opt('w', mobile ? 390 : 1280));
const height = Number(opt('h', mobile ? 844 : 800));
const lenient = !!opt('lenient', false);
const evalExpr = opt('eval', null);
const actionsArg = opt('actions', null);
const actions = actionsArg ? JSON.parse(String(actionsArg).startsWith('@') ? fs.readFileSync(String(actionsArg).slice(1), 'utf8') : actionsArg) : [];

const report = { url, errors: [], console: [], evals: {}, dialogs: [], title: null, out };
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
});
try {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, userAgent: mobile ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' : undefined });
  const page = await ctx.newPage();
  const isFavicon = u => /favicon\.ico$/.test(u || '');
  page.on('console', m => {
    const t = m.type(); const loc = m.location()?.url || '';
    if (isFavicon(loc)) return;
    if (['error', 'warning', 'warn', 'log', 'info'].includes(t)) report.console.push({ type: t, text: m.text().slice(0, 500) + (loc ? `  @ ${loc.replace(/^https?:\/\/[^/]+/, '')}` : '') });
  });
  page.on('pageerror', e => report.errors.push(String(e.message || e).slice(0, 1000)));
  page.on('dialog', d => { report.dialogs.push(`${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
  page.on('requestfailed', r => { if (!isFavicon(r.url())) report.errors.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`); });
  page.on('response', r => { if (r.status() >= 400 && !isFavicon(r.url())) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(wait);
  async function run(step, i) {
    try {
      if (step.repeat) { for (let k = 0; k < step.repeat; k++) for (const s of step.steps) await run(s, `${i}.${k}`); }
      if (step.viewport) await page.setViewportSize({ width: step.viewport[0], height: step.viewport[1] });
      if (step.click) await page.mouse.click(step.click[0], step.click[1]);
      if (step.tap) await page.click(step.tap, { timeout: 5000 });
      if (step.tapIf) { const el = await page.$(step.tapIf); if (el && await el.isVisible()) await el.click({ timeout: 3000 }); }
      if (step.hover) await page.hover(step.hover, { timeout: 5000 });
      if (step.move) await page.mouse.move(step.move[0], step.move[1]);
      if (step.clickEval) {
        const p = await page.evaluate(step.clickEval);
        if (Array.isArray(p) && p.length === 2) await page.mouse.click(p[0], p[1]);
        else report.errors.push(`step ${i} clickEval gave no point: ${JSON.stringify(p)}`);
      }
      if (step.hold) {
        const box = await (await page.waitForSelector(step.hold, { timeout: 5000 })).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down(); await page.waitForTimeout(step.ms ?? 1400); await page.mouse.up();
      }
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: step.timeout ?? 10000 });
      if (step.type) await page.keyboard.type(step.type);
      if (step.key) await page.keyboard.press(step.key);
      if (step.wait) await page.waitForTimeout(step.wait);
      if (step.eval) { try { report.evals[step.as ?? step.eval] = await page.evaluate(step.eval); } catch (e) { report.evals[step.as ?? step.eval] = 'EVAL ERROR: ' + e.message; } }
      if (step.shot) { fs.mkdirSync(path.dirname(path.resolve(step.shot)), { recursive: true }); await page.screenshot({ path: step.shot }); }
    } catch (e) {
      report.errors.push(`step ${i} ${JSON.stringify(step).slice(0, 120)}: ${(e.message || e).split('\n')[0]}`);
    }
  }
  for (let i = 0; i < actions.length; i++) await run(actions[i], i);
  report.title = await page.title();
  if (evalExpr) { try { report.eval = await page.evaluate(evalExpr); } catch (e) { report.eval = 'EVAL ERROR: ' + e.message; } }
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); await page.screenshot({ path: out }); }
} catch (e) {
  report.errors.push('shot.mjs: ' + (e.message || e));
} finally {
  await browser.close();
}
const bad = report.errors.length > 0 || report.console.some(c => c.type === 'error');
console.log(JSON.stringify(report, null, 1));
process.exit(bad && !lenient ? 1 : 0);
