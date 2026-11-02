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

// ---- Chainsaws. Each saw has two voices that crossfade with the throttle:
// idle: the low, loping burble of a two-stroke at tick-over (chain stopped);
// cutting: wide open and screaming, bogging down in the wood, with the chain rasping through it.
// Firing rates follow engine speed (about 2,800 rpm idle, 10-13,000 rpm wide open); bigger engines are lower and fuller.
const SAWS = {
  sawSmall:  { idle: 52, wot: 212, bog: 48, idleTone: 900, cutTone: 3400, q: 7, sub: 0.15, gain: 0.85, rasp: 0.07 },
  sawPro:    { idle: 46, wot: 186, bog: 30, idleTone: 700, cutTone: 2900, q: 4.5, sub: 0.3, gain: 1, rasp: 0.09 },
  sawBig:    { idle: 39, wot: 158, bog: 20, idleTone: 520, cutTone: 2300, q: 3, sub: 0.5, gain: 1.15, rasp: 0.11 },
  harvester: { idle: 58, wot: 230, bog: 25, idleTone: 600, cutTone: 3000, q: 3, sub: 0.2, gain: 0.8, rasp: 0.12 },
};
const shaper = (k) => { const c = new Float32Array(256); for (let i = 0; i < 256; i++) c[i] = Math.tanh((i / 128 - 1) * k); const w = ctx.createWaveShaper(); w.curve = c; return w; };
export function sawStart(model = 'harvester') {
  if (!ctx) return;
  if (live.saw) { if (live.saw.model === model) return; sawStop(); }
  const p = SAWS[model] || SAWS.sawPro, osc = [];
  const make = (type, hz) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; osc.push(o); return o; };
  const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  // idle voice: pulse + sub through a dull filter, with an uneven lope (a cold two-stroke "four-strokes" at idle)
  const iA = make('sawtooth', p.idle), iSub = make('sine', p.idle / 2), lope = make('sine', 2.7), lopeG = ctx.createGain();
  lopeG.gain.value = p.idle * 0.06; lope.connect(lopeG); lopeG.connect(iA.frequency); lopeG.connect(iSub.frequency);
  const iPulse = make('square', p.idle / 2), iPulseG = ctx.createGain(), iAmp = ctx.createGain();
  iAmp.gain.value = 0.55; iPulseG.gain.value = 0.45; iPulse.connect(iPulseG).connect(iAmp.gain);
  const iF = ctx.createBiquadFilter(); iF.type = 'lowpass'; iF.frequency.value = p.idleTone; iF.Q.value = 2;
  const iSubG = ctx.createGain(); iSubG.gain.value = p.sub;
  const idle = ctx.createGain(); idle.gain.value = 0;
  iA.connect(shaper(2)).connect(iF).connect(iAmp).connect(idle); iSub.connect(iSubG).connect(idle); idle.connect(out);
  // cutting voice: two slightly detuned saws, hard-clipped, through a resonant muffler band
  const cA = make('sawtooth', p.wot), cB = make('sawtooth', p.wot * 1.012), cHalf = make('square', p.wot / 2);
  const cMix = ctx.createGain(), cHalfG = ctx.createGain(); cMix.gain.value = 0.5; cHalfG.gain.value = 0.25;
  const cF = ctx.createBiquadFilter(); cF.type = 'lowpass'; cF.frequency.value = p.cutTone; cF.Q.value = p.q;
  const cBody = ctx.createBiquadFilter(); cBody.type = 'peaking'; cBody.frequency.value = p.wot * 3; cBody.gain.value = 6; cBody.Q.value = 1.5;
  const cut = ctx.createGain(); cut.gain.value = 0;
  cA.connect(cMix); cB.connect(cMix); cHalf.connect(cHalfG).connect(cMix);
  cMix.connect(shaper(4)).connect(cBody).connect(cF).connect(cut).connect(out);
  // chain in the wood: bright rasping noise chopped at the tooth rate, plus a low chip rumble
  const n = noise(true), rF = ctx.createBiquadFilter(), rAmp = ctx.createGain(), teeth = make('square', 310), teethG = ctx.createGain();
  rF.type = 'bandpass'; rF.frequency.value = 4200; rF.Q.value = 0.9; rAmp.gain.value = 0.5; teethG.gain.value = 0.5; teeth.connect(teethG).connect(rAmp.gain);
  const chipF = ctx.createBiquadFilter(); chipF.type = 'lowpass'; chipF.frequency.value = 500; const chipG = ctx.createGain(); chipG.gain.value = 0.5;
  const rasp = ctx.createGain(); rasp.gain.value = 0;
  n.connect(rF).connect(rAmp).connect(rasp); n.connect(chipF).connect(chipG).connect(rasp); rasp.connect(out);
  for (const o of osc) o.start(); n.start();
  out.gain.setTargetAtTime(0.24 * p.gain, ctx.currentTime, 0.08);
  live.saw = { model, p, osc, n, out, idle, cut, rasp, cA, cB, cHalf, cF, iA, rpm: 0 };
  sawSet(0, 0);
}
// rpm 0 (idle) .. 1 (wide open), load 0..1 (how hard the chain is in the wood)
export function sawSet(rpm, load) {
  const s = live.saw; if (!s) return;
  const t = ctx.currentTime, p = s.p;
  const tc = rpm > s.rpm ? 0.07 : 0.3; // revs up fast, winds down slower
  s.rpm = rpm;
  const hz = p.idle + (p.wot - p.idle) * rpm - p.bog * load * rpm;
  for (const [o, k] of [[s.cA, 1], [s.cB, 1.012], [s.cHalf, 0.5]]) o.frequency.setTargetAtTime(hz * k, t, tc);
  s.cF.frequency.setTargetAtTime(p.cutTone * (0.35 + 0.65 * rpm) * (1 - 0.15 * load), t, tc);
  const open = Math.min(1, Math.max(0, (rpm - 0.08) / 0.5));
  s.idle.gain.setTargetAtTime(0.65 * (1 - open), t, tc);
  s.cut.gain.setTargetAtTime(open * (0.95 + 0.25 * load), t, tc);
  s.rasp.gain.setTargetAtTime(load * rpm * p.rasp * 4, t, 0.05);
}
export function sawStop() {
  const s = live.saw; if (!s) return;
  s.out.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  setTimeout(() => { try { for (const o of s.osc) o.stop(); s.n.stop(); } catch {} }, 900);
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
export function tick() { thump(2200, 0.035, 0.05); burst({ dur: 0.02, freq: 5000, q: 2, gain: 0.04 }); }
