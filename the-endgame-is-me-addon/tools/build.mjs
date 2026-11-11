// Builds The Endgame is Me WoW addon: transpiles the browser game's modules to Lua, copies the hand-written Lua in
// ../src beside them, and writes one addon folder per client (same Lua, different TOC).
//   node tools/build.mjs            build both addon folders
//   node tools/build.mjs --check    transpile only, into ../build (for the headless tests)
//   node tools/build.mjs --zip      also pack each addon folder into ../dist/*.zip, ready to unzip into Interface\AddOns

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { transpile } from './js2lua.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const game = path.resolve(root, '../the-endgame-is-me/js');
export const ADDON = 'TheEndgameIsMe';
export const VERSION = '1.2.0';

// in load order: a module comes after everything it imports
export const MODULES = ['props', 'smoke', 'art', 'levels/forest', 'levels/clearing', 'levels/farms', 'levels/village', 'levels/wall', 'levels/city',
  'levels/castle', 'levels/index', 'world', 'render', 'save'];

// What the build changes in the game's source before translating it, and why.
const PATCHES = {
  world: [
    // No footprints: they were a few dark pixels worn into the path, and they cost a stamp into the ground every step.
    ["    if (Math.floor(b.walk / 4) !== before) g.steps.push({ x: b.x, y: b.y, face: b.face, side: Math.floor(b.walk / 4) & 1 });", ''],
    ["  if (Math.floor(b.walk / 4) !== before && b.y > 0) g.steps.push({ x: b.x, y: b.y, face: b.face, side: Math.floor(b.walk / 4) & 1 });", ''],
    // A level whose ground ships as an image (art/, see tools/bake-ground.lua) has to be laid out the same way every
    // time, so it is built from that image's seed instead of the run's. layoutRng() is nil for any other level.
    ["  const L = levelFor(n);\n  for (const k of ARRAYS) g[k] = [];", "  const L = levelFor(n);\n  const fixedRng = layoutRng(n), runRng = g.rng;\n  if (fixedRng) g.rng = fixedRng;\n  for (const k of ARRAYS) g[k] = [];"],
    ["  g.map = m;\n  g.levelT0 = g.t;", "  if (fixedRng) m.layout = layoutSeed(n);\n  g.map = m;\n  g.levelT0 = g.t;"],
    ["  updateCam(g, 0, true);\n  syncView(g);\n}\n\n// the camera follows the boss", "  updateCam(g, 0, true);\n  syncView(g);\n  if (fixedRng) g.rng = runRng;\n}\n\n// the camera follows the boss"],
    // the king has no attack rate; JS shrugs (undefined * n is NaN), Lua stops. Same number, said out loud.
    [`king:      { role: 'king',   col: 'gold',   hp: 30,  spd: 14 }`, `king:      { role: 'king',   col: 'gold',   hp: 30,  spd: 14, rate: NaN }`],
    // a save can't hold 57,600 path distances, so the field is something a map can rebuild
    [`  const df = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = Infinity;
    for (let i = 0; i < pts.length; i += 2) { const dx = x + 0.5 - pts[i].x, dy = y + 0.5 - pts[i].y, d = dx * dx + dy * dy; if (d < m) m = d; }
    df[y * W + x] = Math.sqrt(m);
  }
  return {`, `  const df = pathField(pts);
  return {`],
    [`export function pathDist(`, `export function pathField(pts) {
  const df = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = Infinity;
    for (let i = 0; i < pts.length; i += 2) { const dx = x + 0.5 - pts[i].x, dy = y + 0.5 - pts[i].y, d = dx * dx + dy * dy; if (d < m) m = d; }
    df[y * W + x] = Math.sqrt(m);
  }
  return df;
}
export function pathDist(`],
  ],
  render: [
    // no footprints (see world, above)
    ["    // footprints wear the path in over time\n    for (const st of g.steps) {\n      const px = -Math.sin(st.face), py = Math.cos(st.face), sd = st.side ? 6 : -6;\n      tctx.fillStyle = 'rgba(40,30,18,0.16)';\n      tctx.fillRect(Math.round(st.x + px * sd + Math.cos(st.face) * 3), Math.round(st.y + py * sd + Math.sin(st.face) * 3), 2, 2);\n    }\n    g.steps.length = 0;\n", ''],
    // the ground of a level that ships as an image is not painted at all: the Screen is told which image lies under it
    ["      bg = m.mode === 'patrol' ? makeBackground(m) : makeGround(m);\n      if (art.decorate && !m.plain) art.decorate(bg.getContext('2d'), m, H_ART);",
     "      bg = groundImage(m);\n      if (!bg) {\n        bg = m.mode === 'patrol' ? makeBackground(m) : makeGround(m);\n        if (art.decorate && !m.plain) art.decorate(bg.getContext('2d'), m, H_ART);\n      }"],
    // The frame goes to the addon's Screen (src/canvas.lua): the ground is a retained layer, so instead of repainting
    // it every frame the renderer hands it over, and the screen shake becomes an offset the window applies.
    [`const buf = newCanvas(W, H), ctx = buf.getContext('2d');`, `const buf = makeScreen(W, H), ctx = buf.getContext('2d');`],
    [`    ctx.fillStyle = PAL.night; ctx.fillRect(0, 0, W, H);
    ctx.translate(Math.round(ox) - VIEW.x, Math.round(oy) - VIEW.y);
    ctx.drawImage(bg, 0, 0);
`, `    buf.shakeX = Math.round(ox); buf.shakeY = Math.round(oy);
`],
    [`    ctx.drawImage(trail, 0, 0);
`, `    buf.begin(bg, trail, VIEW.x, VIEW.y, fg, waterLayer(g, VIEW.x, VIEW.y));
    ctx.translate(-VIEW.x, -VIEW.y);
`],
    [`    if (fg) ctx.drawImage(fg, VIEW.x, VIEW.y);`, `    buf.maskOff();`],
    // the boss's adds are drawn from rows of characters: strings, which Lua cannot index
    [`const ch = row[flip ? w - 1 - rx : rx];`, `const ch = row.charAt(flip ? w - 1 - rx : rx);`],
    // smoke is dithered rather than blended: a burning city is a lot of see-through pixels for interpreted Lua
    [`    ctx.globalAlpha = Math.min(0.9, 0.28 + 0.64 * dn ** 1.3) * born;
    ctx.drawImage(spr, Math.round(c.x) - R - 2, Math.round(c.y) - R - 2);`, `    ctx.drawDithered(spr, Math.round(c.x) - R - 2, Math.round(c.y) - R - 2, Math.min(0.9, 0.28 + 0.64 * dn ** 1.3) * born);`],
    // the letters under the ability buttons, and the key the "shake him off" prompt names, are whatever the player
    // has bound (src/keys.lua), not the browser game's fixed ones
    [`key = i < 5 ? SLOT_KEYS[i] : 'SPC';`, `key = keyLabel(i);`],
    [`'HE IS IN YOUR FUR! SHAKE! [SPACE]'`, `'HE IS IN YOUR FUR! SHAKE! [' + keyLabel(6) + ']'`],
    // the telegraph's pixel loop is hand-written Lua (src/gfx.lua): the same picture for a third of the time
    ["  ctx.fillStyle = PAL.tele;\n  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {\n    const dx = px + 0.5 - b.x, dy = py + 0.5 - b.y, dist = Math.hypot(dx, dy);\n    if (dist > R || dist < 8) continue;\n    let edge = dist > R - 1;\n    if (k !== 'stomp') {\n      const ad = Math.abs(angDiff(Math.atan2(dy, dx), face));\n      if (ad > half) continue;\n      if ((half - ad) * dist < 1) edge = true;\n    }\n    let al;\n    if (edge) al = channel ? 0.35 : 0.85;\n    else if (dist < 8 + (R - 8) * prog) al = ((px + py + blink) & 1) ? (channel ? 0.12 : 0.42) : (channel ? 0.04 : 0.16);\n    else al = ((px + py) & 1) ? 0.12 : 0;\n    if (!al) continue;\n    ctx.globalAlpha = al;\n    ctx.fillRect(px, py, 1, 1);\n  }\n", `  ctx.fillStyle = PAL.tele;
  teleArc(ctx, b.x, b.y, R, x0, x1, y0, y1, k !== 'stomp', half, face, prog, blink, channel);
`],
    // light effects: no see-through panel behind the HUD (7,500 blended cells a frame; the text has its own shadow)
    [`ctx.fillRect(0, 0, 136, 36); ctx.fillRect(W - Math.max(108, textWidth(b.name) + 8), 0, Math.max(108, textWidth(b.name) + 8), 24);`,
      `if (!lean()) { ctx.fillRect(0, 0, 136, 36); ctx.fillRect(W - Math.max(108, textWidth(b.name) + 8), 0, Math.max(108, textWidth(b.name) + 8), 24); }`],
    // light effects (src/gfx.lua): the telegraph's fill stops blinking
    [`const blink = Math.floor(g.t * (prog > 0.6 ? 24 : 10)) & 1;`, `const blink = lean() ? 0 : Math.floor(g.t * (prog > 0.6 ? 24 : 10)) & 1;`],
    // thousands separators without a regular expression
    [`function fmt(n) { return Math.floor(n).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','); }`, `function fmt(n) { return commas(n); }`],
  ],
  'levels/farms': [
    // rows of a sprite map are strings; say so, since Lua cannot index a string
    [`const ch = r[flip ? w - x : x - 1];`, `const ch = r.charAt(flip ? w - x : x - 1);`],
  ],
  'levels/wall': [
    // The wall is a drum recomposed column by column and shaded with two gradients, every frame: three quarters of
    // this level's frame time in Lua. The picture only changes when the camera moves or a piece is hit, so it is
    // only recomposed then.
    [`  oc.globalCompositeOperation = 'source-over';
  oc.clearRect(0, 0, W, TH);
  // the wall turns about the boss`, `  // the wall turns about the boss`],
    [`, C = V.x + piv, CR = V.x + W / 2;
`, `, C = V.x + piv, CR = V.x + W / 2;
  const drumKey = piv + '|' + C + '|' + m.wall.map(s => s.drawn + (s.prop && s.prop.hitT > 0 && s.prop.state === 'up' ? 'h' + Math.ceil(s.prop.hitT / 0.03) : '')).join(',');
  const stale = off.drumKey !== drumKey;
  off.drumKey = drumKey;
  if (stale) {
  oc.globalCompositeOperation = 'source-over';
  oc.clearRect(0, 0, W, TH);
`],
    [`  oc.globalCompositeOperation = 'source-over';

  // the wall's shadow on the water`, `  oc.globalCompositeOperation = 'source-over';
  }

  // the wall's shadow on the water`],
  ],
  save: [
    // typed arrays are tagged tables here, and nothing in a Lua graph has a constructor
    [`    if (Array.isArray(o)) return ['a', o.map(val)];`, `    if (o.__ta) return ['t', o.__ta, toB64(o)];\n    if (Array.isArray(o)) return ['a', o.map(val)];`],
    [/    const typed = o\.constructor\?\.name;\n.*\n.*\n/, ''],
  ],
};
// Top-level functions and constants written by hand in Lua instead (the text is the Lua that defines them on M).
const OVERRIDES = {
  // near() is asked for every unit and falling stone, every step. The game builds a Set each time (four tables here)
  // and only ever walks it, so this hands back a plain list, in the same order, with a stamp to skip repeats.
  props: { near: `do
local stamp, call, floor = setmetatable({}, { __mode = "k" }), 0, math.floor
M.near = function(g, x, y, r)
if not g.pgrid or g.propsDirty then M.rebuildGrid(g) end
call = call + 1
local out, n, idx, CELL = { length = 0 }, 0, g.pgrid.idx, M.CELL
for cy = floor((y - r) / CELL), floor((y + r) / CELL) do
for cx = floor((x - r) / CELL), floor((x + r) / CELL) do
local e = idx[cx * 4096 + cy]
local a = e and e[1]
if a then
for i = 0, a.length - 1 do
local p = a[i]
if p.state ~= "gone" and stamp[p] ~= call then stamp[p] = call; out[n] = p; n = n + 1 end
end
end
end
end
out.length = n
return out
end
end` },
  world: { mulberry32: 'M.mulberry32 = RT.mulberry32;', pathField: 'M.pathField = RT.pathField;' },
  smoke: { mulberry32: 'M.mulberry32 = RT.mulberry32;' },
  // still water is part of the retained ground (waterLayer, above); what is left to draw each frame is the glints
  render: { fmt: 'M.fmt = RT.commas;', drawWater: 'M.drawWater = RT.drawWater;', drawFires: 'M.drawFires = RT.drawFires;' },
  art: { hash: 'M.hash = RT.hash;', newCanvas: 'M.newCanvas = RT.newCanvas;' },
  // src/saves.lua keeps the run in SavedVariables instead of localStorage
  save: { toB64: 'M.toB64 = function(a) return RT.packTyped(a) end;', fromB64: 'M.fromB64 = function(name, s) return RT.unpackTyped(name, s) end;',
    writeSave: '', saveInfo: '', readSave: '', clearSave: '', unlockPlus: '', plusData: '' },
};

export function buildModules(only) {
  const exportTypes = {};
  const out = {};
  for (const name of MODULES) {
    if (only && !only.includes(name)) continue;
    const file = path.join(game, name + '.js');
    const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const dir = path.posix.dirname(name);
    const resolve = spec => path.posix.normalize(path.posix.join(dir, spec)).replace(/\.js$/, '');
    const { lua, fnTypes } = transpile(src, { name, resolve, patches: PATCHES[name] || [], overrides: OVERRIDES[name] || {}, exportTypes });
    exportTypes[name] = fnTypes;
    out[name] = lua;
  }
  return out;
}

const luaName = name => 'game_' + name.replace(/\//g, '_') + '.lua';

// every Lua file of the addon, in load order: [file name, where it comes from]
export function fileList() {
  const g = name => [luaName(name), 'game'];
  return [['rt.lua', 'src'], ['canvas.lua', 'src'], g('props'), g('smoke'), g('art'), ['gfx.lua', 'src'],
    ...MODULES.filter(m => m.startsWith('levels/')).map(g), g('world'), g('render'), g('save'),
    ['sound_manifest.lua', 'made'], ['ground.lua', 'ground'], ['saves.lua', 'src'], ['keys.lua', 'src'], ['display.lua', 'src'], ['sound.lua', 'src'], ['app.lua', 'src']];
}

// One addon folder per client. The Lua is the same; only the TOC's Interface number differs.
export const CLIENTS = [
  { dir: path.join(root, ADDON), interface: 16001, client: 'WoW Classic Forever', zip: `${ADDON}-${VERSION}.zip` },
  { dir: path.resolve(root, '../the-endgame-is-me-addon-retail', ADDON), interface: 120105, client: 'World of Warcraft (retail)', zip: `${ADDON}-Retail-${VERSION}.zip` },
];

function groundManifest() {
  // the levels whose ground has been baked to an image (tools/bake-ground.lua); with none, every ground is painted in Lua
  const dir = path.join(root, 'art');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(dir, 'ground.json'), 'utf8')); } catch {}
  list = list.filter(g => fs.existsSync(path.join(dir, g.file)));
  const lua = ['-- Generated by tools/build.mjs: the levels whose ground ships as an image in Art/, the size of each (w, h) inside',
    '-- its power-of-two file (tw, th), and the seed the level is laid out from so that it matches the image.',
    'local ADDON, ns = ...;', 'ns.Ground = {',
    ...list.map(g => `  [${g.n}] = { file = "${g.file}", w = ${g.w}, h = ${g.h}, tw = ${g.tw}, th = ${g.th}, seed = ${g.seed} },`),
    '};', ''].join('\n');
  return { lua, files: list.map(g => g.file), dir };
}

function soundManifest() {
  // which baked sound files exist (see tools/bake-audio.mjs); with none, the addon is simply silent
  const dir = path.join(root, 'sounds');
  let meta = { sfx: [], music: [] };
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch {}
  const sfx = meta.sfx.filter(n => fs.existsSync(path.join(dir, n + '.ogg')));
  const music = meta.music.filter(t => fs.existsSync(path.join(dir, t.id + '_calm.ogg')) && fs.existsSync(path.join(dir, t.id + '_fight.ogg')));
  const lua = ['-- Generated by tools/build.mjs: the sound files that ship in Sounds/, and how long each music loop runs.',
    'local ADDON, ns = ...;', 'ns.SoundManifest = {',
    `  sfx = { ${sfx.map(n => `${n} = true`).join(', ')} },`,
    `  music = { ${music.map(t => `[${t.stage}] = { id = "${t.id}", seconds = ${t.seconds} }`).join(', ')} },`,
    '};', ''].join('\n');
  return { lua, files: [...sfx.map(n => n + '.ogg'), ...music.flatMap(t => [t.id + '_calm.ogg', t.id + '_fight.ogg'])], dir };
}

// A plain zip of one addon folder, with the folder itself as the top entry (what an AddOns folder wants). No
// dependencies: deflate from zlib, and the three record types of the zip format written by hand.
function zipFolder(dir, top, out) {
  const files = [];
  (function walk(d, rel) {
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name), r = rel + '/' + name;
      if (fs.statSync(full).isDirectory()) walk(full, r); else files.push([r, full]);
    }
  })(dir, top);
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const [name, full] of files) {
    const data = fs.readFileSync(full), nm = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const stored = packed.length >= data.length;   // the OGG files do not shrink
    const body = stored ? data : packed, crc = zlib.crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(stored ? 0 : 8, 8);
    head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nm.length, 26); head.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(stored ? 0 : 8, 10);
    cd.writeUInt16LE(time, 12); cd.writeUInt16LE(date, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(head, nm, body);
    central.push(cd, nm);
    offset += 30 + nm.length + body.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([...parts, cdBuf, end]));
  return { files: files.length, bytes: offset + cdBuf.length + 22 };
}

function release(mods) {
  const sounds = soundManifest(), ground = groundManifest();
  for (const c of CLIENTS) {
    fs.rmSync(c.dir, { recursive: true, force: true });
    fs.mkdirSync(c.dir, { recursive: true });
    const toc = [`## Interface: ${c.interface}`, '## Title: The Endgame is Me', '## Notes: A reverse boss fight: you are the boss. Type /endgame to play.',
      '## Author: timiam', `## Version: ${VERSION}`, '## SavedVariables: TheEndgameIsMeDB', '## AddonCompartmentFunc: TheEndgameIsMe_OnCompartmentClick',
      `## X-Website: https://vibecodedslopware.com/the-endgame-is-me-wow/`, ''];
    for (const [file, from] of fileList()) {
      const text = from === 'src' ? fs.readFileSync(path.join(root, 'src', file), 'utf8') : from === 'made' ? sounds.lua : from === 'ground' ? ground.lua
        : mods[MODULES.find(m => luaName(m) === file)];
      fs.writeFileSync(path.join(c.dir, file), text.replace(/\r\n/g, '\n'));
      toc.push(file);
    }
    fs.writeFileSync(path.join(c.dir, ADDON + '.toc'), toc.join('\n') + '\n');
    fs.writeFileSync(path.join(c.dir, 'README.txt'), `The Endgame is Me ${VERSION}, for ${c.client}.

A reverse boss fight in a window: you are the boss, the raids are the content. It is the browser game from
https://vibecodedslopware.com/the-endgame-is-me/ with its rules and pixel art translated to Lua.
Help, updates and the other client's download: https://vibecodedslopware.com/the-endgame-is-me-wow/

Install: put this TheEndgameIsMe folder in Interface\\AddOns and /reload.
Play:    /endgame   (also /teim)
         WASD or the arrows walk, the mouse aims, left and right click, Q, E and R are your abilities,
         Space shakes your fur, Esc pauses and gives the keyboard back to WoW.
Keys:    Controls, on the game's menu and on the pause menu, puts any of that on other keys or mouse
         buttons (/endgame keys opens it). Esc always pauses.
Slots:   in the Hoard, between levels, click a slot to pick which ability goes on that button.
Options: /endgame scale 1-8 (or auto)   how many screen pixels per game pixel
         /endgame fps 30               draw less often, if it drags your frame rate down
         /endgame perf                 show timings in the title bar
         /endgame ground off           paint the ground a pixel at a time instead of using the images in Art
         /endgame calm, /endgame mute, /endgame reset (moves the window back to the middle)

The game_*.lua files are generated from the game's JavaScript. Do not edit them by hand.
`);
    if (sounds.files.length) {
      fs.mkdirSync(path.join(c.dir, 'Sounds'));
      for (const f of sounds.files) fs.copyFileSync(path.join(sounds.dir, f), path.join(c.dir, 'Sounds', f));
    }
    if (ground.files.length) {
      fs.mkdirSync(path.join(c.dir, 'Art'));
      for (const f of ground.files) fs.copyFileSync(path.join(ground.dir, f), path.join(c.dir, 'Art', f));
    }
    console.log(`${c.client}: ${path.relative(path.resolve(root, '..'), c.dir)} (Interface ${c.interface}, ${fileList().length} Lua files, ${sounds.files.length} sounds, ${ground.files.length} ground images)`);
    if (process.argv.includes('--zip')) {
      const out = path.join(root, 'dist', c.zip), z = zipFolder(c.dir, ADDON, out);
      console.log(`  zipped: ${path.relative(path.resolve(root, '..'), out)} (${z.files} files, ${(z.bytes / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
  const mods = buildModules(only);
  const dest = path.join(root, 'build');
  fs.mkdirSync(dest, { recursive: true });
  for (const [name, lua] of Object.entries(mods)) fs.writeFileSync(path.join(dest, luaName(name)), lua);
  console.log(`transpiled ${Object.keys(mods).length} modules, ${Object.values(mods).reduce((a, s) => a + s.split('\n').length, 0)} lines of Lua`);
  if (!only && !process.argv.includes('--check')) release(mods);
}
