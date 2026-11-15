// Copies the browser game into app/game/ for the desktop build, made to work offline and without the website:
// the site's top bar and its links go, the studio splash and the Silkscreen font come from inside the app, and the
// page keeps the whole window. The game's own source is never edited here; run this before every build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '..');
const src = path.join(repo, 'the-endgame-is-me'), out = path.join(here, 'app', 'game');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(src, 'js'), path.join(out, 'js'), { recursive: true });
fs.copyFileSync(path.join(repo, 'splash.js'), path.join(out, 'splash.js'));
const fonts = path.join(here, 'node_modules', '@fontsource', 'silkscreen', 'files');
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
for (const w of [400, 700]) fs.copyFileSync(path.join(fonts, `silkscreen-latin-${w}-normal.woff2`), path.join(out, 'fonts', `silkscreen-${w}.woff2`));

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const swap = (from, to, all = false) => {
  const n = html.split(from).length - 1;
  if (!n) throw new Error(`stage.mjs: the game page no longer has ${JSON.stringify(from.slice(0, 70))}; update stage.mjs`);
  html = all ? html.split(from).join(to) : html.replace(from, to);
};
const fontFace = [400, 700].map(w => `@font-face{font-family:"Silkscreen";font-style:normal;font-weight:${w};font-display:block;src:url("./fonts/silkscreen-${w}.woff2") format("woff2")}`).join('');
swap('<link rel="preconnect" href="https://fonts.googleapis.com">', '');
swap('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', '');
swap('<link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">', `<style>${fontFace}</style>`);
swap('<link rel="stylesheet" href="/site-nav.css">', '');
swap('<script src="/splash.js" data-manual></script>', '<script src="./splash.js" data-manual></script>');
swap(/<nav class="site-topbar"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '<nav class="site-topbar"', '');
swap('<script src="/site-nav.js"></script>', '');
swap('inset:52px 0 0', 'inset:0', true);
if (/https?:\/\/fonts|\/site-nav|"\/splash/.test(html)) throw new Error('stage.mjs: something from the website is still linked');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('staged', path.relative(here, out));
