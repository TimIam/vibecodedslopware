// Addon watch: keeps the site's WoW addons current with the game clients, with no one at the keyboard.
//
//   node tools/addon-watch/watch.mjs check      what changed since the last release (writes .work/plan.json)
//   node tools/addon-watch/watch.mjs apply      bump Interface numbers and addon versions as the plan says
//   node tools/addon-watch/watch.mjs build      build and zip every addon being released (.work/dist/)
//   node tools/addon-watch/watch.mjs test       syntax, API and (for The Endgame is Me) whole-session tests
//   node tools/addon-watch/watch.mjs site       copy the zips to the addons' pages and update the pages
//   node tools/addon-watch/watch.mjs commit     commit, stamp versions (tools/versions.mjs) and push to main
//   node tools/addon-watch/watch.mjs curseforge upload the new files to CurseForge   (needs CURSEFORGE_TOKEN)
//   node tools/addon-watch/watch.mjs deploy     production deploy of main on Vercel    (needs VERCEL_TOKEN)
//   node tools/addon-watch/watch.mjs keys       one read-only call per service to prove the three secrets still work
//   node tools/addon-watch/watch.mjs baseline   record today's clients and APIs as already handled (first run only)
//
// What counts as a change, per client (config.json):
//   - a new Interface number: Blizzard's version server (us.patch.battle.net) says which build each product is on,
//     and 1.60.1 means Interface 16001, 12.1.5 means 120105;
//   - a change to a Blizzard API an addon calls: Blizzard's generated API docs (Gethe/wow-ui-source, one branch per
//     client) are parsed, every function, method and event an addon's Lua names is looked up, and its doc entry is
//     compared with the one in state.json. A removed or changed entry is listed in plan.json for a fixer (the
//     workflow runs Claude Code on it) and blocks the release if the addon still calls something that is gone.
// state.json is only written by `commit`, so a run that fails is simply tried again the next day.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const work = path.join(here, '.work');
const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const statePath = path.join(here, 'state.json');
const planPath = path.join(work, 'plan.json');
const readState = () => (fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { clients: {}, api: {}, released: {} });
const readPlan = () => JSON.parse(fs.readFileSync(planPath, 'utf8'));
const writePlan = (p) => fs.writeFileSync(planPath, JSON.stringify(p, null, 1) + '\n');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const git = (...args) => sh('git', args);
const rel = (p) => path.join(root, p);
const log = (...a) => console.log('[addon-watch]', ...a);
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
fs.mkdirSync(work, { recursive: true });

// ---------------------------------------------------------------- Blizzard: builds and API docs

export function interfaceOf(version) {
  const [a, b, c] = version.split('.').map(Number);
  return a * 10000 + b * 100 + c;
}

async function liveVersion(product) {
  const text = await (await fetch(`http://us.patch.battle.net:1119/${product}/versions`)).text();
  const head = text.split('\n')[0].split('|').map((s) => s.split('!')[0]);
  const row = text.split('\n').find((l) => l.startsWith('us|'));
  if (!row) throw new Error(`no us row for ${product}: ${text.slice(0, 200)}`);
  const f = Object.fromEntries(row.split('|').map((v, i) => [head[i], v]));
  const version = f.VersionsName.split('.').slice(0, 3).join('.');
  return { version, build: Number(f.BuildId), interface: interfaceOf(version) };
}

const DOCS = 'Interface/AddOns/Blizzard_APIDocumentationGenerated';
function uiSource(branch) {
  const dir = path.join(work, 'ui-' + branch);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    sh('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', '-b', branch, 'https://github.com/Gethe/wow-ui-source', dir]);
    sh('git', ['sparse-checkout', 'set', DOCS], { cwd: dir });
  } else {
    sh('git', ['fetch', '-q', '--depth', '1', 'origin', branch], { cwd: dir });
    sh('git', ['reset', '-q', '--hard', 'FETCH_HEAD'], { cwd: dir });
  }
  return { dir, commit: sh('git', ['rev-parse', 'HEAD'], { cwd: dir }).trim() };
}

// Every documented function, method and event, keyed the way addon code names it:
//   "C_UnitAuras.GetAuraDataByIndex", "UnitHealth" (global), ":SetTexture" (a method of some widget), "event:UNIT_HEALTH"
export function apiIndex(docsDir) {
  const index = {};
  for (const file of fs.readdirSync(docsDir).filter((f) => f.endsWith('.lua')).sort()) {
    const text = fs.readFileSync(path.join(docsDir, file), 'utf8').replace(/\r\n/g, '\n');
    const ns = /^\tNamespace = "([\w.]+)",/m.exec(text)?.[1];
    const kind = /^\tType = "(\w+)",/m.exec(text)?.[1];
    for (const m of text.matchAll(/\n\t\t\{\n([\s\S]*?)\n\t\t\},/g)) {
      const body = m[1];
      const name = /^\t\t\tName = "(\w+)",/m.exec(body)?.[1];
      const type = /^\t\t\tType = "(\w+)",/m.exec(body)?.[1];
      if (!name) continue;
      let key = null;
      if (type === 'Function') key = kind === 'ScriptObject' ? ':' + name : ns ? `${ns}.${name}` : name;
      else if (type === 'Event') key = 'event:' + (/^\t\t\tLiteralName = "(\w+)",/m.exec(body)?.[1] || name);
      if (!key) continue;
      // documentation prose changes are not API changes
      const block = body.split('\n').filter((l) => !/^\s*Documentation = /.test(l)).join('\n');
      (index[key] ??= []).push({ file, block });
    }
  }
  const out = {};
  for (const [k, v] of Object.entries(index)) out[k] = { files: [...new Set(v.map((x) => x.file))], hash: crypto.createHash('sha1').update(v.map((x) => x.block).join('\n--\n')).digest('hex').slice(0, 12) };
  return out;
}

function luaFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.lua') && !/^game_/.test(e.name)) out.push(p);
    }
  })(dir);
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// which index keys an addon's Lua uses (generated game_*.lua is the browser game's rules: it never calls WoW)
export function usedApi(folder, index) {
  const src = luaFiles(folder).map((f) => fs.readFileSync(f, 'utf8').replace(/--\[\[[\s\S]*?\]\]|--[^\n]*/g, '')).join('\n');
  const words = new Set(src.match(/[A-Za-z_]\w*/g));
  const used = {};
  for (const key of Object.keys(index)) {
    let hit;
    if (key.startsWith('event:')) hit = words.has(key.slice(6)) && new RegExp(`["']${key.slice(6)}["']`).test(src);
    else if (key.startsWith(':')) hit = words.has(key.slice(1)) && new RegExp(`:${key.slice(1)}\\s*\\(`).test(src);
    else if (key.includes('.')) { const [ns, fn] = key.split('.'); hit = words.has(fn) && new RegExp(`\\b${esc(ns)}\\s*\\.\\s*${fn}\\b`).test(src); }
    else hit = words.has(key) && new RegExp(`(^|[^\\w.:])${key}\\s*\\(`, 'm').test(src);
    if (hit) used[key] = index[key].hash;
  }
  return used;
}

// ---------------------------------------------------------------- addons: versions and files

function addonVersion(id) {
  const a = config.addons[id];
  if (a.versionFile) return new RegExp(a.versionPattern).exec(fs.readFileSync(rel(a.versionFile), 'utf8'))[1];
  const toc = Object.values(a.builds)[0];
  return /^## Version: (\S+)/m.exec(fs.readFileSync(tocOf(toc.folder), 'utf8'))[1];
}
const tocOf = (folder) => path.join(rel(folder), fs.readdirSync(rel(folder)).find((f) => f.endsWith('.toc')));
const bump = (v) => v.split('.').map(Number).map((n, i, a) => (i === a.length - 1 ? n + 1 : n)).join('.');

function setVersion(id, from, to) {
  const a = config.addons[id];
  if (a.versionFile) {
    const f = rel(a.versionFile), t = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, t.replace(new RegExp(a.versionPattern), (m) => m.replace(from, to)));
  } else for (const b of Object.values(a.builds)) {
    for (const f of [tocOf(b.folder), path.join(rel(b.folder), 'README.txt')]) {
      if (!fs.existsSync(f)) continue;
      const t = fs.readFileSync(f, 'utf8');
      fs.writeFileSync(f, t.replace(new RegExp(`(## Version: |Party Health Pie |v)${esc(from)}\\b`, 'g'), `$1${to}`));
    }
  }
}

// replace one Interface number with another, only on lines that are about the Interface
function setInterface(file, from, to) {
  const t = fs.readFileSync(file, 'utf8');
  const out = t.split('\n').map((l) => (/interface/i.test(l) ? l.replace(new RegExp(`\\b${from}\\b`, 'g'), String(to)) : l)).join('\n');
  if (out === t) throw new Error(`no Interface ${from} in ${path.relative(root, file)}`);
  fs.writeFileSync(file, out);
}

// ---------------------------------------------------------------- check

async function check() {
  const state = readState();
  const plan = { at: new Date().toISOString(), clients: {}, addons: {}, needsFix: false, release: false };
  for (const [cid, c] of Object.entries(config.clients)) {
    const live = await liveVersion(c.product);
    const ui = uiSource(c.uiBranch);
    const was = state.clients[cid] || {};
    plan.clients[cid] = { ...live, uiCommit: ui.commit, wasInterface: was.interface ?? null, wasUiCommit: was.uiCommit ?? null,
      interfaceChanged: was.interface != null && was.interface !== live.interface };
    if (process.env.FORCE_INTERFACE && process.env.FORCE_INTERFACE.startsWith(cid + '=')) { // for test runs
      plan.clients[cid].interface = Number(process.env.FORCE_INTERFACE.split('=')[1]);
      plan.clients[cid].interfaceChanged = plan.clients[cid].interface !== was.interface;
    }
    // the docs only ever ship ahead of a patch or with it; a docs branch that is behind the live build is still the best we have
    const index = apiIndex(path.join(ui.dir, DOCS));
    fs.writeFileSync(path.join(work, `index-${cid}.json`), JSON.stringify(index));
    for (const [id, a] of Object.entries(config.addons)) {
      const b = a.builds[cid];
      if (!b) continue;
      const used = usedApi(rel(b.folder), index);
      const before = state.api?.[id]?.[cid] || {};
      const removed = Object.keys(before).filter((k) => !index[k] && new RegExp(`\\b${esc(k.replace(/^event:|^:/, '').split('.').pop())}\\b`).test(luaFiles(rel(b.folder)).map((f) => fs.readFileSync(f, 'utf8')).join('\n')));
      const changed = Object.keys(used).filter((k) => before[k] && before[k] !== used[k]);
      const p = (plan.addons[id] ??= { name: a.name, version: addonVersion(id), reasons: [], api: {}, used: {} });
      p.used[cid] = used;
      if (plan.clients[cid].interfaceChanged) p.reasons.push(`${c.label} ${live.version} (Interface ${plan.clients[cid].interface})`);
      if (removed.length || changed.length) {
        p.api[cid] = { removed, changed: changed.map((k) => ({ key: k, files: index[k].files })) };
        plan.needsFix = true;
      }
    }
  }
  for (const p of Object.values(plan.addons)) p.release = p.reasons.length > 0;
  plan.release = Object.values(plan.addons).some((p) => p.release);
  writePlan(plan);
  for (const [cid, c] of Object.entries(plan.clients)) log(`${cid}: ${c.version}.${c.build} = Interface ${c.interface}${c.interfaceChanged ? ` (was ${c.wasInterface})` : ''}; ui-source ${c.uiCommit.slice(0, 8)}`);
  for (const [id, p] of Object.entries(plan.addons)) log(`${id} ${p.version}: ${p.release ? 'release for ' + p.reasons.join(', ') : 'nothing to release'}${Object.keys(p.api).length ? '; API changes: ' + JSON.stringify(p.api) : ''}`);
  output('release', plan.release); output('needs_fix', plan.needsFix);
  writeFixBrief(plan);
}

// what the fixer (Claude Code in the workflow) is told
function writeFixBrief(plan) {
  if (!plan.needsFix) return;
  const lines = ['# Blizzard API changes that touch our addons', '',
    'Docs come from https://github.com/Gethe/wow-ui-source, folder ' + DOCS + '. Local copies are in tools/addon-watch/.work/ui-<branch>/.', ''];
  for (const [id, p] of Object.entries(plan.addons)) for (const [cid, api] of Object.entries(p.api)) {
    const c = plan.clients[cid];
    lines.push(`## ${p.name}, ${config.clients[cid].label} build (${config.addons[id].builds[cid].folder})`,
      `Docs: branch ${config.clients[cid].uiBranch}, was ${c.wasUiCommit || '(unknown)'}, now ${c.uiCommit}.`);
    if (api.removed.length) lines.push('', 'No longer documented, but the addon still names them:', ...api.removed.map((k) => `- ${k}`));
    if (api.changed.length) lines.push('', 'Doc entry changed (arguments, returns, secret rules or the like):', ...api.changed.map((x) => `- ${x.key} (${x.files.join(', ')})`));
    lines.push('');
  }
  fs.writeFileSync(path.join(work, 'fix-brief.md'), lines.join('\n'));
}

// ---------------------------------------------------------------- apply

function apply() {
  const plan = readPlan();
  for (const [id, p] of Object.entries(plan.addons)) {
    const a = config.addons[id];
    // the fixer may have changed code without a new Interface: that is a release too
    const touched = git('status', '--porcelain', '--', a.root, ...Object.values(a.builds).map((b) => b.folder)).trim();
    if (touched && !p.release) { p.release = true; p.reasons.push('Blizzard API changes'); }
    // something the addon calls is gone and the code still names it: no release can fix that, a person has to
    for (const [cid, api] of Object.entries(p.api)) {
      const src = luaFiles(rel(a.builds[cid].folder)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
      const still = api.removed.filter((k) => new RegExp(`\\b${esc(k.replace(/^event:|^:/, '').split('.').pop())}\\b`).test(src));
      if (still.length) throw new Error(`${id}/${cid} still uses ${still.join(', ')}, which Blizzard no longer documents`);
    }
    if (!p.release) continue;
    for (const [cid, b] of Object.entries(a.builds)) {
      const c = plan.clients[cid];
      if (!c.interfaceChanged) continue;
      for (const f of b.interfaceFiles || [path.relative(root, tocOf(b.folder))]) setInterface(rel(f), c.wasInterface, c.interface);
    }
    p.newVersion = bump(p.version);
    setVersion(id, p.version, p.newVersion);
    log(`${id}: ${p.version} -> ${p.newVersion}`);
    const cf = a.curseforge;
    log(cf ? `${id}: CurseForge project ${cf.project} gets it after the commit (${Object.keys(a.builds).map((c) => c + " as " + (cf.releaseType[c] || "release")).join(", ")})` : `${id}: not on CurseForge`);
  }
  plan.release = Object.values(plan.addons).some((p) => p.release);
  writePlan(plan);
  output('release', plan.release);
}

// ---------------------------------------------------------------- build

function zipFolder(dir, top, out) { // same as the-endgame-is-me-addon/tools/build.mjs
  const files = [];
  (function walk(d, r0) {
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name), r = r0 + '/' + name;
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
    const stored = packed.length >= data.length;
    const body = stored ? data : packed, crc = zlib.crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(stored ? 0 : 8, 8);
    head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nm.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(stored ? 0 : 8, 10);
    cd.writeUInt16LE(time, 12); cd.writeUInt16LE(date, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(head, nm, body); central.push(cd, nm);
    offset += 30 + nm.length + body.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([...parts, cdBuf, end]));
}

function build() {
  const plan = readPlan(), dist = path.join(work, 'dist');
  fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(dist, { recursive: true });
  for (const [id, p] of Object.entries(plan.addons)) {
    if (!p.release) continue;
    const a = config.addons[id];
    if (a.kind === 'endgame') buildEndgame(a);
    p.zips = {};
    for (const [cid, b] of Object.entries(a.builds)) {
      const name = b.zip.replace('{v}', p.newVersion), out = path.join(dist, name);
      if (a.kind === 'endgame') fs.copyFileSync(rel(path.join(a.root, 'dist', name)), out);
      else zipFolder(rel(b.folder), path.basename(b.folder), out);
      p.zips[cid] = { file: name, bytes: fs.statSync(out).size };
      log(`${name}: ${(p.zips[cid].bytes / 1048576).toFixed(1)} MB`);
    }
  }
  writePlan(plan);
}

// The addon's game_*.lua is transpiled from the browser game. A client update must not also ship whatever the browser
// game has gained since the addon's last release (that needs a person to play it in the client first), so the build
// runs against the browser game as it was when game_*.lua last changed, and checks the transpile comes out the same.
function buildEndgame(a) {
  const pinned = git('log', '-1', '--format=%H', '--', `${a.builds.forever.folder}/game_world.lua`).trim();
  const game = 'the-endgame-is-me';
  log(`endgame: transpiling the browser game as of ${pinned.slice(0, 8)}`);
  if (!fs.existsSync(rel(a.root + '/tools/node_modules'))) sh('npm', ['ci', '--silent'], { cwd: rel(a.root + '/tools'), shell: process.platform === 'win32' });
  git('checkout', pinned, '--', game);
  try { sh('node', ['tools/build.mjs', '--zip'], { cwd: rel(a.root), stdio: 'inherit' }); }
  finally { git('checkout', 'HEAD', '--', game); git('clean', '-fdq', '--', game); }
  const drift = git('diff', '--name-only', 'HEAD', '--', ...Object.values(a.builds).map((b) => b.folder)).split('\n').filter((f) => /\/game_[^/]+\.lua$/.test(f));
  if (drift.length) throw new Error('rebuilding from the pinned game changed the generated Lua: ' + drift.join(', '));
}

// ---------------------------------------------------------------- test

function lua51() {
  for (const exe of ['lua5.1', 'lua']) try { if (/5\.1/.test(sh(exe, ['-v'], { stdio: ['ignore', 'pipe', 'pipe'] }) + '')) return exe; } catch {}
  try { sh('lua5.1', ['-v']); return 'lua5.1'; } catch {}
  throw new Error('Lua 5.1 not found (apt install lua5.1)');
}

function test() {
  const plan = readPlan(), lua = lua51(), luac = lua === 'lua5.1' ? 'luac5.1' : 'luac';
  const fails = [];
  for (const [id, p] of Object.entries(plan.addons)) {
    if (!p.release) continue;
    const a = config.addons[id];
    for (const [cid, b] of Object.entries(a.builds)) {
      const folder = rel(b.folder);
      // 1. every Lua file compiles
      const all = [];
      (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); if (e.isDirectory()) walk(q); else if (e.name.endsWith('.lua')) all.push(q); } })(folder);
      try { sh(luac, ['-p', ...all]); log(`${id}/${cid}: ${all.length} Lua files compile`); } catch (e) { fails.push(`${id}/${cid}: Lua does not compile: ${e.stderr || e.message}`); }
      // 2. the TOC says the Interface the client is on, and lists only files that exist
      const toc = fs.readFileSync(tocOf(b.folder), 'utf8');
      const want = plan.clients[cid].interface;
      if (!new RegExp(`^## Interface: ${want}\\s*$`, 'm').test(toc)) fails.push(`${id}/${cid}: TOC is not Interface ${want}`);
      for (const line of toc.split(/\r?\n/).filter((l) => l && !l.startsWith('#'))) if (!fs.existsSync(path.join(folder, line.trim()))) fails.push(`${id}/${cid}: TOC lists missing ${line}`);
      // 3. nothing it calls has left the API
      const index = JSON.parse(fs.readFileSync(path.join(work, `index-${cid}.json`), 'utf8'));
      const gone = Object.keys(plan.addons[id].used?.[cid] || {}).filter((k) => !index[k]);
      if (gone.length) fails.push(`${id}/${cid}: calls APIs that are gone: ${gone.join(', ')}`);
      // 4. The Endgame is Me plays a whole session against its strict WoW stub
      if (a.kind === 'endgame') {
        try { sh(lua, ['tools/test/smoke.lua', path.relative(rel(a.root), folder)], { cwd: rel(a.root), stdio: ['ignore', 'pipe', 'pipe'] }); log(`${id}/${cid}: smoke.lua passed`); }
        catch (e) { fails.push(`${id}/${cid}: smoke.lua failed: ${(e.stdout + e.stderr).slice(-1500)}`); }
      }
    }
  }
  if (fails.length) { console.error(fails.join('\n')); fs.writeFileSync(path.join(work, 'test-failures.txt'), fails.join('\n')); process.exit(1); }
  log('all tests passed');
}

// ---------------------------------------------------------------- site pages

const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
function note(p) {
  const why = p.reasons.join(' and ');
  // the fixer's own one-line account of a code change, if it made one
  const fixed = fs.existsSync(path.join(work, 'fix-notes.md')) ? fs.readFileSync(path.join(work, 'fix-notes.md'), 'utf8').trim().replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]) : '';
  return `<li><b>${p.newVersion}:</b> updated for ${why}. ${fixed ? fixed + ' ' : 'Nothing else changed. '}(Released automatically by the addon watch.)</li>`;
}

function site() {
  const plan = readPlan();
  for (const [id, p] of Object.entries(plan.addons)) {
    if (!p.release) continue;
    const a = config.addons[id], page = rel(a.page), html = path.join(page, 'index.html');
    let t = fs.readFileSync(html, 'utf8');
    for (const [cid, b] of Object.entries(a.builds)) {
      const z = p.zips[cid], old = b.zip.replace('{v}', p.version);
      fs.copyFileSync(path.join(work, 'dist', z.file), path.join(page, z.file));
      // the download button: link, then the "v1.1.0 · 0.3 MB" line under it
      const at = t.indexOf(`/${a.page}/${old}`);
      if (at < 0) throw new Error(`${a.page}/index.html has no link to ${old}`);
      const endA = t.indexOf('</a>', at);
      const button = t.slice(at, endA).replace(old, z.file).replace(`v${p.version}`, `v${p.newVersion}`).replace(/\d+(\.\d+)? MB/, mb(z.bytes));
      t = t.slice(0, at) + button + t.slice(endA);
    }
    // What's new: add a line on top, or start the list
    if (/<h2>What’s new<\/h2>\s*<ul>/.test(t)) t = t.replace(/(<h2>What’s new<\/h2>\s*<ul>)/, `$1\n    ${note(p)}`);
    else t = t.replace(/(\n\s*<footer)/, `\n\n  <h2>What’s new</h2>\n  <ul>\n    ${note(p)}\n  </ul>$1`);
    fs.writeFileSync(html, t);
    log(`${a.page}/index.html now offers ${p.newVersion}`);
  }
}

// ---------------------------------------------------------------- commit and push

function commit() {
  const plan = readPlan();
  const msgTail = '\n\nReleased by the addon watch (tools/addon-watch).';
  const releasing = Object.entries(plan.addons).filter(([, p]) => p.release);
  // the new state: today's clients and APIs are handled
  const state = readState();
  for (const [cid, c] of Object.entries(plan.clients)) state.clients[cid] = { version: c.version, build: c.build, interface: c.interface, uiCommit: c.uiCommit };
  // every change in plan.api has been looked at (by the fixer, then the tests if anything was released)
  // (read again, since the fixer may have changed what the code calls)
  for (const [id, p] of Object.entries(plan.addons)) for (const cid of Object.keys(p.used)) {
    const index = JSON.parse(fs.readFileSync(path.join(work, `index-${cid}.json`), 'utf8'));
    (state.api[id] ??= {})[cid] = usedApi(rel(config.addons[id].builds[cid].folder), index);
  }
  for (const [id, p] of releasing) {
    state.released[id] = { version: p.newVersion, at: plan.at, for: p.reasons };
    // CurseForge often lists a new game version some hours after the patch, so uploads wait here until they work
    // (only the clients this release is for: a Forever patch puts no new retail file on CurseForge)
    const forClients = Object.keys(config.addons[id].builds).filter((cid) => plan.clients[cid].interfaceChanged || p.reasons.includes('Blizzard API changes'));
    if (config.addons[id].curseforge) (state.pendingCurseforge ??= []).push(...forClients.map((cid) => ({
      addon: id, client: cid, file: p.zips[cid].file, gameVersion: plan.clients[cid].version, why: p.reasons.join(' and ') })));
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n');

  gitIdentity();
  for (const [id, p] of releasing) {
    const a = config.addons[id];
    git('add', '--', a.root, ...Object.values(a.builds).map((b) => b.folder));
    git('commit', '-q', '-m', `${p.name} addon ${p.newVersion}: ${p.reasons.join(', ')}${msgTail}`);
    // the page on its own: tools/versions.mjs counts each commit to it as a version of the card
    git('add', '--', a.page);
    git('commit', '-q', '-m', `${p.name} addon: ${p.newVersion}, updated for ${p.reasons.join(' and ')}${msgTail}`);
  }
  git('add', '--', path.relative(root, statePath));
  if (git('diff', '--cached', '--name-only').trim()) git('commit', '-q', '-m', `Addon watch: seen ${Object.entries(plan.clients).map(([k, c]) => `${k} ${c.version}.${c.build}`).join(', ')}${msgTail}`);

  push(releasing.length ? () => {
    sh('node', ['tools/versions.mjs'], { stdio: 'inherit' });
    git('add', '--', 'apps.js', 'v', 'vercel.json');
    if (!git('diff', '--cached', '--name-only').trim()) return false;
    git('commit', '-q', '-m', `Version stamps: ${releasing.map(([, p]) => p.name + ' addon').join(', ')}${msgTail}`);
    return true;
  } : null);
  plan.sha = git('rev-parse', 'HEAD').trim();
  writePlan(plan);
  output('sha', plan.sha);
}

function gitIdentity() {
  // only on the runner: locally .git/config is shared by every worktree, and this would sign everyone's commits as the bot
  if (!process.env.GITHUB_ACTIONS) return;
  git('config', 'user.name', process.env.GIT_NAME || 'addon-watch[bot]');
  git('config', 'user.email', process.env.GIT_EMAIL || '41898282+github-actions[bot]@users.noreply.github.com');
}

// push on top of whatever else landed on main meanwhile; stamp() (the version stamps) is redone on each try
function push(stamp) {
  for (let i = 0; ; i++) {
    git('fetch', '-q', 'origin', 'main');
    git('rebase', '-q', 'origin/main');
    const stamped = stamp ? stamp() : false;
    if (process.env.NO_PUSH) { log('NO_PUSH set: not pushing'); return; }
    try { git('push', '-q', 'origin', 'HEAD:main'); log('pushed ' + git('rev-parse', 'HEAD').trim()); return; }
    catch (e) {
      if (i >= 4) throw e;
      log('main moved while pushing; trying again');
      if (stamped) git('reset', '-q', '--hard', 'HEAD~1');
    }
  }
}

// ---------------------------------------------------------------- CurseForge

// uploads everything in state.pendingCurseforge (this run's release and any earlier one CurseForge was not ready for)
async function curseforge() {
  const token = process.env.CURSEFORGE_TOKEN, state = readState();
  const todo = state.pendingCurseforge || [];
  if (!todo.length) return log('curseforge: nothing to upload');
  if (!token) throw new Error('CURSEFORGE_TOKEN is not set');
  const api = 'https://wow.curseforge.com/api';
  const get = async (u) => { const r = await fetch(api + u, { headers: { 'X-Api-Token': token } }); if (!r.ok) throw new Error(`${u}: ${r.status} ${await r.text()}`); return r.json(); };
  const [types, versions] = [await get('/game/version-types'), await get('/game/versions')];
  const left = [], problems = [];
  for (const job of todo) {
    const cf = config.addons[job.addon].curseforge, re = new RegExp(config.clients[job.client].curseforgeType, 'i');
    const typeIds = types.filter((t) => re.test(t.name) || re.test(t.slug)).map((t) => t.id);
    const gv = versions.find((v) => v.name === job.gameVersion && typeIds.includes(v.gameVersionTypeID));
    if (!gv) { left.push(job); log(`curseforge: no game version ${job.gameVersion} for ${job.client} yet; ${job.file} waits for the next run`); continue; }
    const form = new FormData();
    form.append('metadata', JSON.stringify({
      changelog: job.changelog || `Updated for ${job.why}. Nothing else changed.`, changelogType: 'markdown',
      displayName: job.file.replace(/\.zip$/, ''), gameVersions: [gv.id], releaseType: cf.releaseType[job.client] || 'release',
    }));
    form.append('file', new Blob([fs.readFileSync(rel(path.join(config.addons[job.addon].page, job.file)))]), job.file);
    const r = await fetch(`${api}/projects/${cf.project}/upload-file`, { method: 'POST', headers: { 'X-Api-Token': token }, body: form });
    if (!r.ok) { left.push(job); problems.push(`${job.file}: ${r.status} ${await r.text()}`); continue; }
    log(`curseforge: uploaded ${job.file} (${JSON.stringify(await r.json())})`);
  }
  if (left.length !== todo.length) {
    state.pendingCurseforge = left;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n');
    gitIdentity();
    git('add', '--', path.relative(root, statePath));
    git('commit', '-q', '-m', `Addon watch: uploaded to CurseForge\n\nReleased by the addon watch (tools/addon-watch).`);
    push(null);
  }
  if (problems.length) throw new Error('CurseForge refused: ' + problems.join('; '));
  // a file that has waited more than three days means CurseForge names the version differently: say so
  const old = left.filter((j) => Date.now() - Date.parse(state.released[j.addon]?.at || new Date().toISOString()) > 3 * 864e5);
  if (old.length) throw new Error('still waiting on CurseForge for ' + old.map((j) => `${j.file} (${j.gameVersion})`).join(', '));
}

// ---------------------------------------------------------------- Vercel

const VERCEL_TEAM = 'team_Eha9A9JR9tDUGanSeW7NIiFd', VERCEL_PROJECT = 'prj_3aXdB5VQyRqHYxF6oHbDdQ1yZ4Gg';

async function deploy() {
  const token = process.env.VERCEL_TOKEN, plan = readPlan();
  if (!token) throw new Error('VERCEL_TOKEN is not set');
  const team = VERCEL_TEAM, sha = plan.sha || git('rev-parse', 'origin/main').trim();
  const r = await fetch(`https://api.vercel.com/v13/deployments?teamId=${team}&skipAutoDetectionConfirmation=1`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'vibecodedslopware', project: VERCEL_PROJECT, target: 'production',
      gitSource: { type: 'github', org: 'TimIam', repo: 'vibecodedslopware', ref: 'main', sha } }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Vercel: ' + JSON.stringify(d));
  log(`vercel: ${d.id} building ${sha.slice(0, 8)}`);
  for (let i = 0; i < 60; i++) {
    await new Promise((ok) => setTimeout(ok, 10000));
    const s = await (await fetch(`https://api.vercel.com/v13/deployments/${d.id}?teamId=${team}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (s.readyState === 'READY') break;
    if (s.readyState === 'ERROR' || s.readyState === 'CANCELED') throw new Error('Vercel deploy ' + s.readyState);
  }
  // the new zips must be served
  for (const [id, p] of Object.entries(plan.addons)) if (p.release) for (const z of Object.values(p.zips)) {
    const res = await fetch(`https://vibecodedslopware.com/${config.addons[id].page}/${z.file}`, { method: 'HEAD' });
    if (!res.ok) throw new Error(`live site does not serve ${z.file}: ${res.status}`);
    log(`live: /${config.addons[id].page}/${z.file}`);
  }
}

// ---------------------------------------------------------------- keys

// One read-only call per service, every run, so a revoked or expired secret shows up long before a patch needs it.
// Nothing is uploaded, deployed or billed (listing Anthropic models is free).
async function keys() {
  const bad = [], env = process.env;
  const tryIt = async (name, url, headers) => {
    if (!headers) return bad.push(`${name} is not set`);
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) bad.push(`${name}: ${url} answered ${r.status} ${(await r.text()).slice(0, 200)}`);
      else log(`keys: ${name} works`);
    } catch (e) { bad.push(`${name}: ${e.message}`); }
  };
  await tryIt('VERCEL_TOKEN', `https://api.vercel.com/v9/projects/${VERCEL_PROJECT}?teamId=${VERCEL_TEAM}`,
    env.VERCEL_TOKEN && { Authorization: `Bearer ${env.VERCEL_TOKEN}` });
  await tryIt('CURSEFORGE_TOKEN', 'https://wow.curseforge.com/api/game/version-types',
    env.CURSEFORGE_TOKEN && { 'X-Api-Token': env.CURSEFORGE_TOKEN });
  await tryIt('ANTHROPIC_API_KEY', 'https://api.anthropic.com/v1/models?limit=1',
    env.ANTHROPIC_API_KEY && { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' });
  if (bad.length) throw new Error('secrets that do not work:\n  ' + bad.join('\n  '));
}

// ---------------------------------------------------------------- baseline

async function baseline() {
  await check();
  const plan = readPlan(), state = { clients: {}, api: {}, released: {}, pendingCurseforge: [] };
  for (const [cid, c] of Object.entries(plan.clients)) state.clients[cid] = { version: c.version, build: c.build, interface: c.wasInterface ?? c.interface, uiCommit: c.uiCommit };
  for (const [id, p] of Object.entries(plan.addons)) { state.api[id] = p.used; state.released[id] = { version: p.version, at: null, for: ['released by hand'] }; }
  // the Interface each addon ships with today, so a client that is already ahead is caught on the first real run
  for (const [cid] of Object.entries(plan.clients)) {
    const tocs = Object.values(config.addons).map((a) => a.builds[cid]).filter(Boolean).map((b) => Number(/^## Interface: (\d+)/m.exec(fs.readFileSync(tocOf(b.folder), 'utf8'))[1]));
    state.clients[cid].interface = tocs[0];
    if (new Set(tocs).size > 1) throw new Error(`${cid}: the addons ship different Interface numbers ${tocs}`);
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n');
  log('wrote ' + path.relative(root, statePath));
}

const cmds = { check, apply, build, test, site, commit, curseforge, deploy, keys, baseline };
const cmd = process.argv[2];
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!cmds[cmd]) { console.error('usage: watch.mjs ' + Object.keys(cmds).join('|')); process.exit(2); }
  Promise.resolve(cmds[cmd]()).catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
