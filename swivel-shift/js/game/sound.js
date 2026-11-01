// Sound: 'snd ' decoding + WebAudio playback replacing the game's sound library (seg 7 tail:
// load/play/stop/isPlaying/update) and Harry's wrappers STPlayRegSound / STPlay3DSound /
// STPlay3DSoundPitched / STPlayDynamicSound / UpdateDynamicSounds.

import { G, Prefs } from './state.js';
import { getResource, setResWorldFile, restoreResWorldFile } from '../core/res.js';

let ctx = null, master = null;
const MAX_CHANNELS = 8;
const channels = []; // {src, gainL, gainR, prio, end, snd}
let nextRef = 1;

export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Decode a 'snd ' resource (format 1/2 with a bufferCmd/soundCmd and an 8-bit sampled header)
export function decodeSnd(d) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let p;
  if (dv.getUint16(0) === 1) p = 4 + dv.getUint16(2) * 6; else p = 4;
  const hdr = dv.getUint32(p + 2 + 4);
  const len = dv.getUint32(hdr + 4);
  const rate = dv.getUint32(hdr + 8) / 65536;
  const loopStart = dv.getUint32(hdr + 12), loopEnd = dv.getUint32(hdr + 16);
  const enc = d[hdr + 20];
  if (enc !== 0) return null;
  const samples = d.subarray(hdr + 22, hdr + 22 + len);
  return { samples, rate, loopStart, loopEnd, buffer: null };
}

function bufferFor(snd) {
  if (!snd.buffer) {
    const ac = audioContext();
    if (!ac) return null;
    const b = ac.createBuffer(1, Math.max(1, snd.samples.length), Math.max(3000, Math.round(snd.rate)));
    const ch = b.getChannelData(0);
    for (let i = 0; i < snd.samples.length; i++) ch[i] = (snd.samples[i] - 128) / 128;
    snd.buffer = b;
  }
  return snd.buffer;
}

// seg7+87ec: load sound resource -> handle (null if missing)
export function loadSound(id) {
  const d = getResource('snd ', id);
  return d ? decodeSnd(d) : null;
}

// SATSound volume factor g_46c8 = 0x1c * soundVolume pref
const volScale = () => (Prefs.soundOff ? 0 : 0x1c * Prefs.soundVolume);

// seg7+8456: play {snd, rate(16.16), prio, volL, volR (0..256)}
function play(snd, rate, prio, volL, volR) {
  const ac = audioContext();
  if (!ac || !snd) return -1;
  const now = ac.currentTime;
  // free finished channels
  for (let i = channels.length - 1; i >= 0; i--) if (channels[i].end <= now) channels.splice(i, 1);
  if (channels.length >= MAX_CHANNELS) {
    // steal the lowest priority (oldest among equals) if new is >= it
    let worst = 0;
    for (let i = 1; i < channels.length; i++) if (channels[i].prio < channels[worst].prio) worst = i;
    if (channels[worst].prio > prio) return -1;
    stopChannel(channels[worst]);
    channels.splice(worst, 1);
  }
  const buf = bufferFor(snd);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate / 65536;
  const split = ac.createChannelMerger(2);
  const gL = ac.createGain(), gR = ac.createGain();
  gL.gain.value = Math.min(1, volL / 256); gR.gain.value = Math.min(1, volR / 256);
  src.connect(gL); src.connect(gR);
  gL.connect(split, 0, 0); gR.connect(split, 0, 1);
  split.connect(master);
  src.start();
  const ch = { ref: nextRef++, src, gL, gR, prio, snd, end: now + buf.duration / (rate / 65536) };
  channels.push(ch);
  return ch.ref;
}
function stopChannel(ch) { try { ch.src.stop(); } catch (e) { /* already stopped */ } }
const find = (ref) => channels.find((c) => c.ref === ref);

// seg7+87b0
// (the original compares the channel's snd handle, so a decoded snd object works too)
export function isPlaying(ref) {
  if (ref == null || ref < 0 || !ctx) return false;
  if (typeof ref === 'object') return channels.some((c) => c.snd === ref && c.end > ctx.currentTime);
  const ch = find(ref);
  return !!ch && ch.end > ctx.currentTime;
}
export function stopSound(ref) {
  const ch = find(ref);
  if (ch) { stopChannel(ch); ch.end = 0; }
}
// seg7+87b0 also works as a count of channels playing a snd
export function playingCount(snd) {
  if (!ctx || !snd) return 0;
  return channels.filter((c) => c.snd === snd && c.end > ctx.currentTime).length;
}
// seg7+865a: stop every channel playing this snd
export function stopSoundRes(snd) {
  for (const ch of channels) if (ch.snd === snd && snd) { stopChannel(ch); ch.end = 0; }
}
export function stopAllSounds() { for (const ch of channels) { stopChannel(ch); ch.end = 0; } }

// STPlayRegSound(snd, prio, vol)
export function playRegSound(snd, prio = 100, vol = 256) {
  if (!snd) return -1;
  const v = (vol * volScale()) >> 8;
  return play(snd, 0x10000, prio, v, v);
}

// PEDistance: max + min/3
export function peDistance(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  return Math.max(a, b) + ((Math.min(a, b) / 3) | 0);
}
// CalcStereoVolume(vol, v, h) -> [left, right]
export function calcStereoVolume(vol, v, h) {
  const ear = (eh, ev) => {
    const d = peDistance(ev - v, eh - h);
    return d > 0x400 ? 0 : (0x400 - d) >> 3;
  };
  const l = ear(G.viewLeft, G.viewTop + 224), r = ear(G.viewLeft + 448, G.viewTop + 224);
  return [(l * vol) >> 7, (r * vol) >> 7];
}
export function play3DSound(snd, prio, vol, v, h) {
  if (!snd) return -1;
  const [l, r] = calcStereoVolume((vol * volScale()) >> 8, v, h);
  return play(snd, 0x10000, prio, l, r);
}
export function play3DSoundPitched(snd, prio, vol, v, h, rate) {
  if (!snd) return -1;
  const [l, r] = calcStereoVolume((vol * volScale()) >> 8, v, h);
  return play(snd, rate, prio, l, r);
}

// Dynamic (moving) sounds: 15 slots g_72d8
const dyn = [];
export function initDynamicSounds() { dyn.length = 0; }
export function playDynamicSound(snd, prio, vol, v, h, dv, dh) {
  if (!snd || dyn.filter(Boolean).length >= 16) return;
  const v0 = (vol * volScale()) >> 8;
  const [l, r] = calcStereoVolume(v0, v, h);
  const ref = play(snd, 0x10000, prio, l, r);
  dyn.push({ ref, snd, prio, vol: v0, v, h, dv, dh });
}
export function updateDynamicSounds() {
  for (let i = dyn.length - 1; i >= 0; i--) {
    const s = dyn[i];
    if (!isPlaying(s.ref)) { dyn.splice(i, 1); continue; }
    s.v += s.dv; s.h += s.dh;
    const [l, r] = calcStereoVolume(s.vol, s.v, s.h);
    const ch = find(s.ref);
    if (ch) { ch.gL.gain.value = Math.min(1, l / 256); ch.gR.gain.value = Math.min(1, r / 256); }
  }
}

// ---------------------------------------------------------------- sound handles by resource id
// The original loads ~100 sound handles into globals (InitNonLevelSounds / InitSounds); level sounds
// 200..217 can be overridden by the world file (LoadLevelSounds). S(id) returns the handle.
const cache = new Map();
let levelOverride = new Map();
export function S(id) {
  if (id >= 200 && id <= 217 && levelOverride.has(id)) return levelOverride.get(id);
  if (!cache.has(id)) cache.set(id, loadSound(id));
  return cache.get(id);
}
// InitSounds from the world file (level flag +0x12034) or back to defaults
export function initLevelSounds(fromWorld) {
  levelOverride = new Map();
  if (!fromWorld) return;
  setResWorldFile();
  for (let id = 200; id <= 217; id++) { const h = loadSound(id); if (h) levelOverride.set(id, h); }
  restoreResWorldFile();
}
