// Renders the browser game's own sound to files the addon can play. Everything in the game is synthesised with
// Web Audio, which WoW has no equivalent of, so this runs the game's audio.js and music.js in headless Chrome against
// offline audio contexts, pulls the samples out, and encodes them to OGG Vorbis with ffmpeg.
//
//   node tools/bake-audio.mjs            (needs Google Chrome, and ffmpeg: on PATH, or inside WSL)
//
// Output: ../sounds/<effect>.ogg for every effect in audio.js, ../sounds/<track>_calm.ogg and <track>_fight.ogg for
// the seven level tracks (the loop alone, and the loop with its fight stem mixed in), and manifest.json for the build.

import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(here, '../../the-endgame-is-me');
const out = path.resolve(here, '../sounds');
fs.mkdirSync(out, { recursive: true });

// the game's files, plus one empty page to run in
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/bake.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>bake</title>'); return; }
  const file = path.join(game, url);
  if (!file.startsWith(game) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const names = [...fs.readFileSync(path.join(game, 'js/audio.js'), 'utf8').matchAll(/^    (\w+): \(\) =>/gm)].map(m => m[1]);
if (names.length < 40) throw new Error('could not read the effect names out of audio.js');

function wav(pcm, rate, channels) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const haveFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
function encode(name, quality) {
  const src = path.join(out, name + '.wav'), dst = path.join(out, name + '.ogg');
  const args = ['-y', '-loglevel', 'error', '-i', null, '-c:a', 'libvorbis', '-q:a', String(quality), null];
  let r;
  if (haveFfmpeg) { args[4] = src; args[9] = dst; r = spawnSync('ffmpeg', args); }
  else {
    const w = p => '/mnt/' + p[0].toLowerCase() + p.slice(2).replace(/\\/g, '/');
    args[4] = w(src); args[9] = w(dst);
    r = spawnSync('wsl.exe', ['-e', 'ffmpeg', ...args]);
  }
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${name}: ${r.stderr}`);
  fs.unlinkSync(src);
  return fs.statSync(dst).size;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.error('page:', m.text()); });
await page.goto(base + '/bake.html');

// ---- effects: each one played into a fresh three-second offline context through the game's own output chain
await page.evaluate(() => {
  window.__mk = () => (window.__ac = new OfflineAudioContext(2, 48000 * 3.2, 48000));
  window.AudioContext = function () { return window.__mk(); };
  window.b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
  // interleaved 16-bit samples from channel data, with the silence before the first sound and after the last trimmed off
  window.pcm16 = (chs, gain = 1, trim = true) => {
    let n = chs[0].length, a = 0;
    if (trim) {
      while (n > 2400 && chs.every(c => Math.abs(c[n - 1]) < 0.0012)) n--;
      n = Math.min(chs[0].length, n + 1200);
      while (a < n - 2400 && chs.every(c => Math.abs(c[a]) < 0.0004)) a++;
      a = Math.max(0, a - 48);
    }
    const o = new Int16Array((n - a) * chs.length);
    for (let i = a; i < n; i++) for (let c = 0; c < chs.length; c++) {
      let v = chs[c][i] * gain;
      if (trim && n - i < 600) v *= (n - i) / 600;   // a short fade so the cut never clicks
      o[(i - a) * chs.length + c] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    }
    return window.b64(new Uint8Array(o.buffer));
  };
});
const sfx = [];
let total = 0;
for (const name of names) {
  const b64 = await page.evaluate(async name => {
    const { createAudio } = await import('/js/audio.js');
    const a = createAudio();
    a.arm();
    // played a moment into the render, not at time zero: a couple of effects refuse to fire twice within 40 ms of
    // "the last one", and the last one starts out at zero
    const ac = window.__ac;
    ac.suspend(0.1).then(() => { a.play(name); ac.resume(); });
    const buf = await ac.startRendering();
    // effects are close to mono; one channel halves the file
    const l = buf.getChannelData(0), r = buf.getChannelData(1), m = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) m[i] = (l[i] + r[i]) / 2;
    // the page's output chain leaves the effects well below full scale; bring them up for a game client
    return window.pcm16([m], 1.8);
  }, name);
  fs.writeFileSync(path.join(out, name + '.wav'), wav(Buffer.from(b64, 'base64'), 48000, 1));
  total += encode(name, 3);
  sfx.push(name);
}
console.log(`${sfx.length} effects, ${(total / 1024).toFixed(0)} KB`);

// ---- music: the game's own renderer gives the loop and its fight stem, both sample-exact loops
const tracks = await page.evaluate(async () => (await import('/js/music.js')).TRACKS.map(t => ({ id: t.id, name: t.name, stage: t.stage, seconds: t.seconds })));
const music = [];
total = 0;
for (const t of tracks) {
  const r = await page.evaluate(async id => {
    const M = await import('/js/music.js');
    const res = await M.renderTrack(id);
    const ch = b => [b.getChannelData(0), b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0)];
    const base = ch(res.base), fight = ch(res.fight);
    const both = base.map((c, i) => { const o = new Float32Array(c.length); for (let k = 0; k < c.length; k++) o[k] = c[k] + fight[i][k]; return o; });
    return { rate: res.base.sampleRate, calm: window.pcm16(base, 0.7, false), fight: window.pcm16(both, 0.7, false) };
  }, t.id);
  for (const mix of ['calm', 'fight']) {
    fs.writeFileSync(path.join(out, `${t.id}_${mix}.wav`), wav(Buffer.from(r[mix], 'base64'), r.rate, 2));
    total += encode(`${t.id}_${mix}`, 2);
  }
  music.push({ id: t.id, name: t.name, stage: t.stage, seconds: Math.round(t.seconds * 1000) / 1000 });
  console.log(`  ${t.id}: ${t.seconds.toFixed(1)} s`);
}
console.log(`${music.length} tracks in two mixes, ${(total / 1024 / 1024).toFixed(1)} MB`);

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ sfx, music }, null, 1) + '\n');
await browser.close();
server.close();
