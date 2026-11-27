// Renders the app icon and splash screens from the real tree, for the web app and both native apps.
//   node augmented-treality/tools/icons.mjs [http://localhost:3191]
// Needs the dev server running. Writes augmented-treality/icons/*, the Android mipmaps and splash
// drawables, and the iOS AppIcon and Splash image sets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.argv[2] || 'http://localhost:3191';
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/playwright-core/index.mjs')).href);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

// 1. The tree on a transparent background, lights on, room lights off.
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(base + '/augmented-treality/');
await page.waitForFunction('window.__at?.ready');
const treePng = await page.evaluate(async () => {
  document.querySelector('#title')?.remove();
  const at = window.__at, v = at.view;
  const d = at.defaultDesign();
  d.lights = { style: 'warm', density: 1.4, mode: 'steady', seed: 3 };
  d.garland = { style: 'gold', wraps: 4, seed: 9 };
  d.topper = 'glowstar';
  d.base = { stand: 'none', skirt: 'none' };
  at.autoDecorate(d, 'classic', 77);
  d.gifts = [];
  at.design = d;
  v.noAutoRotate = true;
  v.scene.background = null; v.scene.fog = null;
  v.scene.traverse(o => { if (o.isMesh && (o === v.floor || o.geometry?.type === 'PlaneGeometry' || o.geometry?.type === 'CircleGeometry') && !o.parent?.name?.length) o.visible = false; });
  v.floor.visible = false;
  v.setDim(true); v.dimK = 0.15;
  const c = document.querySelector('#c');
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '900px', height: '1200px', zIndex: 9999 });
  v.resize();
  v.camera.fov = 30; v.camera.updateProjectionMatrix();
  v.controls.target.set(0, 1.2, 0); v.camera.position.set(0, 1.25, 7.4); v.controls.update();
  v.tween = null;
  await new Promise(r => setTimeout(r, 800));
  v.renderer.setClearColor(0x000000, 0);
  v.renderer.render(v.scene, v.camera);
  return c.toDataURL('image/png');
});

// 2. Compose every size in one page with canvas.
const comp = await browser.newPage();
const out = await comp.evaluate(async src => {
  const tree = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  // Crop to the tree's visible pixels.
  const t = document.createElement('canvas'); t.width = tree.width; t.height = tree.height;
  const tg = t.getContext('2d'); tg.drawImage(tree, 0, 0);
  const px = tg.getImageData(0, 0, t.width, t.height).data;
  let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
  for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (px[(y * t.width + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const crop = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const bg = (g, S) => {
    const gr = g.createRadialGradient(S * 0.5, S * 0.42, 0, S * 0.5, S * 0.5, S * 0.75);
    gr.addColorStop(0, '#4a321c'); gr.addColorStop(0.55, '#241810'); gr.addColorStop(1, '#0d0805');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  };
  // AR corner brackets around the tree, like a camera finding it.
  const brackets = (g, cx, cy, w, h, lw) => {
    g.strokeStyle = '#f0cd73'; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    const l = Math.min(w, h) * 0.2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * w / 2, y = cy + sy * h / 2;
      g.beginPath(); g.moveTo(x, y - sy * l); g.lineTo(x, y); g.lineTo(x - sx * l, y); g.stroke();
    }
  };
  const draw = (S, { scale = 0.72, background = true, frame = true, title = false } = {}) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    if (background && title) {
      // Splash screens: flat colour (compresses to almost nothing) with a small glow behind the tree.
      g.fillStyle = '#1b130d'; g.fillRect(0, 0, S, S);
      const gr = g.createRadialGradient(S / 2, S * 0.4, 0, S / 2, S * 0.4, S * 0.22);
      gr.addColorStop(0, 'rgba(120,80,40,0.55)'); gr.addColorStop(1, 'rgba(120,80,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    } else if (background) bg(g, S);
    const h = S * scale * (title ? 0.62 : 1), w = h * crop.w / crop.h;
    const cy = S * (title ? 0.42 : 0.5);
    g.drawImage(t, crop.x, crop.y, crop.w, crop.h, S / 2 - w / 2, cy - h / 2, w, h);
    if (frame) brackets(g, S / 2, cy + h * 0.01, Math.max(w * 1.25, h * 0.78), h * 1.1, S * 0.022);
    if (title) {
      g.textAlign = 'center'; g.fillStyle = '#f6efe3';
      g.font = `600 ${S * 0.055}px Georgia, serif`;
      g.fillText('Augmented', S / 2, cy + h / 2 + S * 0.11);
      g.fillStyle = '#e8c46a'; g.font = `italic 600 ${S * 0.07}px Georgia, serif`;
      g.fillText('Treality', S / 2, cy + h / 2 + S * 0.185);
    }
    return c.toDataURL('image/png');
  };
  const round = (S) => {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.clip();
    const i = new Image(); return new Promise(r => { i.onload = () => { g.drawImage(i, 0, 0, S, S); r(c.toDataURL('image/png')); }; i.src = draw(S, { scale: 0.62 }); });
  };
  const res = {
    'web/icon-512.png': draw(512), 'web/icon-192.png': draw(192), 'web/icon-180.png': draw(180),
    'web/icon-maskable-512.png': draw(512, { scale: 0.56 }),
    'ios/AppIcon-512@2x.png': draw(1024),
    'ios/splash.png': draw(2732, { scale: 0.42, frame: false, title: true }),
  };
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [k, f] of Object.entries(dens)) {
    res[`android/mipmap-${k}/ic_launcher.png`] = draw(Math.round(48 * f), { scale: 0.7 });
    res[`android/mipmap-${k}/ic_launcher_round.png`] = await round(Math.round(48 * f));
    // Adaptive icons: 108dp canvas, only the middle 66dp is safe.
    res[`android/mipmap-${k}/ic_launcher_foreground.png`] = draw(Math.round(108 * f), { scale: 0.48, background: false });
  }
  const splash = (w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const i = new Image();
    return new Promise(r => { i.onload = () => { g.fillStyle = '#1b130d'; g.fillRect(0, 0, w, h); const S = Math.min(w, h) * 1.0; g.drawImage(i, (w - S) / 2, (h - S) / 2, S, S); r(c.toDataURL('image/png')); }; i.src = draw(1400, { scale: 0.42, frame: false, title: true }); });
  };
  const sp = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  for (const [k, [w, h]] of Object.entries(sp)) {
    res[`android/drawable-port-${k}/splash.png`] = await splash(w, h);
    res[`android/drawable-land-${k}/splash.png`] = await splash(h, w);
  }
  res['android/drawable/splash.png'] = await splash(480, 320);
  return res;
}, treePng);
await browser.close();

const targets = {
  web: path.join(root, 'augmented-treality/icons'),
  ios: path.join(root, 'augmented-treality-app/ios/App/App/Assets.xcassets'),
  android: path.join(root, 'augmented-treality-app/android/app/src/main/res'),
};
let n = 0;
for (const [key, url] of Object.entries(out)) {
  const [kind, ...rest] = key.split('/');
  const files = kind === 'ios' && rest[0] === 'splash.png'
    ? ['Splash.imageset/splash-2732x2732.png', 'Splash.imageset/splash-2732x2732-1.png', 'Splash.imageset/splash-2732x2732-2.png']
    : kind === 'ios' ? ['AppIcon.appiconset/' + rest.join('/')] : [rest.join('/')];
  for (const f of files) {
    const p = path.join(targets[kind], f);
    if (kind !== 'web' && !fs.existsSync(path.dirname(p))) continue;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(url.split(',')[1], 'base64'));
    n++;
  }
}
// Adaptive icon background matches the app.
const bgXml = path.join(targets.android, 'values/ic_launcher_background.xml');
if (fs.existsSync(bgXml)) fs.writeFileSync(bgXml, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1B130D</color>\n</resources>\n');
console.log(`wrote ${n} images`);
