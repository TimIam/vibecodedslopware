// Synthesised sound: two-stroke saw engine, axe chops, wood creak/crack, impact, diesel, wind.
let ctx = null, master = null, noiseBuf = null;
const live = {};

export function initAudio() {
  if (ctx) { ctx.resume?.(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startWind();
}
export const audioReady = () => !!ctx;
export function setMuted(m) { if (master) master.gain.value = m ? 0 : 0.55; }

function noise(loop = false) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = loop; return s;
}

function startWind() {
  const n = noise(true), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6; g.gain.value = 0.03;
  n.connect(f).connect(g).connect(master); n.start();
  live.wind = { f, g };
}
export function setWind(speed) {
  if (!live.wind) return;
  const t = ctx.currentTime;
  live.wind.g.gain.setTargetAtTime(0.015 + speed * 0.012, t, 0.6);
  live.wind.f.frequency.setTargetAtTime(300 + speed * 60, t, 0.6);
}

// ---- Chainsaw: sawtooth + pulse through a resonant filter, rpm 0..1, load 0..1
export function sawStart() {
  if (!ctx || live.saw) return;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator();
  const lg = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain(), dist = ctx.createWaveShaper();
  o1.type = 'sawtooth'; o2.type = 'square'; lfo.type = 'square';
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
  dist.curve = curve;
  f.type = 'lowpass'; f.Q.value = 4;
  lg.gain.value = 0.4; lfo.connect(lg).connect(g.gain);
  const n = noise(true), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
  nf.type = 'highpass'; nf.frequency.value = 2500; ng.gain.value = 0;
  n.connect(nf).connect(ng).connect(master);
  o1.connect(dist); o2.connect(dist); dist.connect(f).connect(g).connect(master);
  g.gain.value = 0.0;
  o1.start(); o2.start(); lfo.start(); n.start();
  live.saw = { o1, o2, lfo, f, g, ng, n };
  sawSet(0.15, 0);
}
export function sawSet(rpm, load) {
  const s = live.saw; if (!s) return;
  const t = ctx.currentTime;
  const hz = 45 + rpm * 165 - load * 35; // firing frequency
  s.o1.frequency.setTargetAtTime(hz, t, 0.05);
  s.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.05);
  s.lfo.frequency.setTargetAtTime(hz * 0.5, t, 0.05);
  s.f.frequency.setTargetAtTime(500 + rpm * 2600, t, 0.05);
  s.g.gain.setTargetAtTime(0.10 + rpm * 0.14, t, 0.05);
  s.ng.gain.setTargetAtTime(load * 0.10, t, 0.05);
}
export function sawStop() {
  const s = live.saw; if (!s) return;
  const t = ctx.currentTime;
  s.g.gain.setTargetAtTime(0, t, 0.15); s.ng.gain.setTargetAtTime(0, t, 0.1);
  setTimeout(() => { try { s.o1.stop(); s.o2.stop(); s.lfo.stop(); s.n.stop(); } catch {} }, 700);
  live.saw = null;
}

// ---- Diesel for the harvester
export function dieselStart() {
  if (!ctx || live.diesel) return;
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = 32; f.type = 'lowpass'; f.frequency.value = 260; g.gain.value = 0.12;
  o.connect(f).connect(g).connect(master); o.start();
  const h = ctx.createOscillator(), hg = ctx.createGain(); h.type = 'triangle'; h.frequency.value = 900; hg.gain.value = 0;
  h.connect(hg).connect(master); h.start();
  live.diesel = { o, f, g, h, hg };
}
export function dieselSet(throttle, hydraulic) {
  const d = live.diesel; if (!d) return;
  const t = ctx.currentTime;
  d.o.frequency.setTargetAtTime(30 + throttle * 28, t, 0.2);
  d.f.frequency.setTargetAtTime(220 + throttle * 300, t, 0.2);
  d.hg.gain.setTargetAtTime(hydraulic * 0.025, t, 0.1);
}
export function dieselStop() {
  const d = live.diesel; if (!d) return;
  d.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  d.hg.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  setTimeout(() => { try { d.o.stop(); d.h.stop(); } catch {} }, 1200);
  live.diesel = null;
}

// ---- One-shots
function burst({ dur = 0.2, freq = 800, q = 1, type = 'bandpass', gain = 0.5, decay = 0.08, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + dur + 0.05);
}
function thump(freq, dur, gain, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
export function chop(quality = 1) {
  thump(140, 0.12, 0.5 * quality);
  burst({ dur: 0.09, freq: 1800, q: 2, gain: 0.6 * quality });
  burst({ dur: 0.25, freq: 600, q: 6, gain: 0.15, delay: 0.01 });
}
export function swish() { burst({ dur: 0.18, freq: 1200, q: 0.8, gain: 0.08 }); }
export function creak(intensity = 0.5) {
  if (!ctx) return;
  const t = ctx.currentTime, dur = 0.5 + Math.random() * 0.8;
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; const base = 60 + Math.random() * 90;
  o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.8), t + dur);
  f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 600; f.Q.value = 8;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * intensity, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
export function crack(intensity = 1) {
  for (let i = 0; i < 3 + intensity * 5; i++) burst({ dur: 0.04 + Math.random() * 0.06, freq: 1500 + Math.random() * 2500, q: 3, gain: 0.5 * intensity, delay: i * (0.02 + Math.random() * 0.05) });
  thump(90, 0.25, 0.4 * intensity);
}
export function rush(dur = 2) { burst({ dur, freq: 900, q: 0.4, gain: 0.25, type: 'bandpass' }); }
export function impact(size = 1) {
  thump(55, 1.2, 0.9 * Math.min(1.5, size));
  burst({ dur: 1.4, freq: 300, q: 0.5, gain: 0.6 * Math.min(1.5, size), type: 'lowpass' });
  burst({ dur: 0.8, freq: 2500, q: 0.6, gain: 0.25, delay: 0.05 });
}
export function clank() { thump(900, 0.08, 0.3); burst({ dur: 0.06, freq: 4000, q: 8, gain: 0.3 }); }
export function cash() { thump(1200, 0.08, 0.15); thump(1600, 0.12, 0.15, 0.09); }
export function alarm() { for (let i = 0; i < 3; i++) thump(880, 0.12, 0.25, i * 0.18); }
export function zap() { for (let i = 0; i < 8; i++) burst({ dur: 0.05, freq: 3000 + Math.random() * 3000, q: 1, gain: 0.5, delay: i * 0.04 }); thump(60, 0.6, 0.6); }
