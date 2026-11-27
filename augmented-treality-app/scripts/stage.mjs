// Copies the web builder from ../augmented-treality into www/ for the native apps:
//  - three.js comes from node_modules instead of the CDN, so the app works offline,
//  - the site's nav bar comes off and the page is told it is native.
// Run before `npx cap sync` (npm run sync does both).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');
const web = path.resolve(app, '../augmented-treality');
const www = path.join(app, 'www');
const three = path.join(app, 'node_modules/three');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const item of ['js', 'css', 'icons', 'manifest.webmanifest']) {
  const src = path.join(web, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(www, item), { recursive: true });
}

// Vendor three: the core build plus every addon the app imports, following relative imports.
const seen = new Set();
const vendor = rel => {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = path.join(three, rel), dst = path.join(www, 'vendor/three', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const code = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dst, code);
  for (const m of code.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) vendor(path.posix.join(path.posix.dirname(rel), m[1]));
  for (const m of code.matchAll(/import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) vendor(path.posix.join(path.posix.dirname(rel), m[1]));
};
vendor('build/three.module.js');
const addons = new Set();
for (const f of fs.readdirSync(path.join(web, 'js'))) {
  const code = fs.readFileSync(path.join(web, 'js', f), 'utf8');
  for (const m of code.matchAll(/from\s*['"]three\/addons\/([^'"]+)['"]/g)) addons.add(m[1]);
}
for (const a of addons) vendor('examples/jsm/' + a);

let html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
html = html
  .replace('"three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js"', '"three": "./vendor/three/build/three.module.js"')
  .replace('"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"', '"three/addons/": "./vendor/three/examples/jsm/"')
  .replace(/<nav class="site-topbar"[\s\S]*?<\/nav>\s*/, '')
  .replace('<script src="/site-nav.js"></script>', '')
  .replace('<link rel="stylesheet" href="/site-nav.css">\n', '')
  .replace('<body>', '<body class="native">');
if (html.includes('cdn.jsdelivr.net/npm/three')) throw new Error('import map rewrite failed');
fs.writeFileSync(path.join(www, 'index.html'), html);
const ver = JSON.parse(fs.readFileSync(path.join(three, 'package.json'), 'utf8')).version;
console.log(`staged www/ with three ${ver} and ${seen.size} vendored modules: ${[...addons].join(', ')}`);
