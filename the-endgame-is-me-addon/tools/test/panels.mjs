// Draws what tools/test/panels.lua wrote down: one PNG per panel in ../../build, laid out by a browser.
//   node tools/test/panels.mjs [panels.json] [scale]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const build = path.resolve(here, '../../build');
const shots = JSON.parse(fs.readFileSync(process.argv[2] || path.join(build, 'panels.json'), 'utf8'));
const S = Number(process.argv[3] || 4);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rgba = c => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] ?? 1})`;
// which way a piece of text hangs from its anchor
const SHIFT = { TOPLEFT: [0, 0], TOP: [-50, 0], TOPRIGHT: [-100, 0], LEFT: [0, -50], CENTER: [-50, -50], RIGHT: [-100, -50],
  BOTTOMLEFT: [0, -100], BOTTOM: [-50, -100], BOTTOMRIGHT: [-100, -100] };

let html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#333;font-family:"Friz Quadrata","Friz Quadrata TT","Palatino Linotype",Georgia,serif}
.shot{position:relative;overflow:hidden;margin:0 0 24px}
.shot>*{position:absolute}
.tx{white-space:pre-wrap;line-height:1.18;text-shadow:${0.5 * S}px ${0.5 * S}px 0 rgba(0,0,0,.9)}
canvas{image-rendering:pixelated}
</style>`;
for (const shot of shots) {
  html += `<div class="shot" id="${shot.name}" style="width:${shot.w * S}px;height:${shot.h * S}px;background:#101010">`;
  for (const it of shot.items) {
    if (it.t === 'rect') html += `<div style="left:${it.x * S}px;top:${it.y * S}px;width:${it.w * S}px;height:${it.h * S}px;background:${rgba(it.c)}"></div>`;
    else if (it.t === 'picture') html += `<canvas data-shot="${shot.name}" width="320" height="180" style="left:${it.x * S}px;top:${it.y * S}px;width:${it.w * S}px;height:${it.h * S}px"></canvas>`;
    else {
      const [sx, sy] = SHIFT[it.anchor] || [0, 0];
      const align = (it.justify || (it.w ? 'CENTER' : 'LEFT')).toLowerCase();
      html += `<div class="tx" style="left:${it.x * S}px;top:${it.y * S}px;${it.w ? `width:${it.w * S}px;` : 'white-space:pre;'}text-align:${align};font-size:${it.size * S}px;color:${rgba(it.c)};transform:translate(${sx}%,${sy}%)">${esc(it.s)}</div>`;
    }
  }
  html += `</div>`;
}
html += `<script>const P=${JSON.stringify(Object.fromEntries(shots.filter(s => s.picture).map(s => [s.name, s.picture])))};
for (const c of document.querySelectorAll('canvas')) {
  const hex = P[c.dataset.shot]; if (!hex) continue;
  const ctx = c.getContext('2d'), im = ctx.createImageData(320, 180);
  for (let i = 0; i < 57600; i++) { const v = parseInt(hex.substr(i * 6, 6), 16); im.data[i * 4] = v >> 16; im.data[i * 4 + 1] = (v >> 8) & 255; im.data[i * 4 + 2] = v & 255; im.data[i * 4 + 3] = 255; }
  ctx.putImageData(im, 0, 0);
}</script>`;
const page = path.join(build, 'panels.html');
fs.writeFileSync(page, html);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await tab.goto('file:///' + page.split(path.sep).join('/'));
for (const shot of shots) {
  const file = path.join(build, `panel_${shot.name}.png`);
  await tab.locator('#' + shot.name).screenshot({ path: file });
  console.log(`${shot.name}: ${path.relative(path.resolve(here, '../..'), file)}  (${shot.note})`);
}
await browser.close();
