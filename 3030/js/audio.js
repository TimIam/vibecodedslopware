// 16-bit sound chip in WebAudio: a Genesis-style 2-operator FM voice, NES/SNES pulse and
// triangle channels, detuned string pads, noise drums, record scratches rendered from a
// formant "ahh" sample, and an SNES-style echo. A lookahead sequencer plays compiled songs
// (see music.js) and exposes a music clock that rhythm stages judge presses against.

let ctx = null, master, comp, musicGain, sfxGain, echoIn, noiseBuf = null;
let muted = false;
const waves = {};
const scratchBufs = {};

// ----------------------------------------------------------------- clocks
// The music clock runs on the audio hardware when sound is live, and on a virtual clock
// (advanced by the game loop, or by test hooks) when it isn't. A song keeps the domain it
// started in, so its beat never jumps.
let vclock = 0, dom = 'v', forceVirtual = false;
export function tickVirtual(dt) { vclock += dt; }
export function setVirtual(on) { forceVirtual = on; }
function live() { return !forceVirtual && ctx && ctx.state === 'running'; }
function lat() { return ctx ? Math.min(0.08, ctx.outputLatency || ctx.baseLatency || 0) : 0; }
// What the player is hearing right now, in song time.
export function clock() { return dom === 'a' && ctx ? ctx.currentTime - lat() : vclock; }

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC({ latencyHint: 'interactive' });
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  master.connect(comp).connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.8; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.7; sfxGain.connect(master);
  // SNES echo: delay with a darkened feedback loop.
  echoIn = ctx.createGain(); echoIn.gain.value = 0.22;
  const dl = ctx.createDelay(1); dl.delayTime.value = 0.24;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
  // Noise.
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  // Pulse waves at the classic duties, an organ, a reed.
  const mk = (n, fn) => { const re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) { const [a, b] = fn(k); re[k] = a; im[k] = b; } return ctx.createPeriodicWave(re, im); };
  for (const [name, d] of [['p12', 0.125], ['p25', 0.25], ['p50', 0.5]]) waves[name] = mk(48, k => [2 * Math.sin(Math.PI * k * d) / (Math.PI * k), 0]);
  const draw = [1, 0.9, 0.55, 0.5, 0.15, 0.32, 0, 0.25];
  waves.organ = mk(16, k => [0, draw[k - 1] || 0]);
  waves.reed = mk(32, k => [0, (k % 2 ? 1 : 0.35) / k ** 0.9]);
  waves.vox = mk(32, k => [0, Math.exp(-((k * 160 - 700) ** 2) / 120000) + 0.5 * Math.exp(-((k * 160 - 1150) ** 2) / 200000) + 0.25 / k]);
  buildScratches();
  setInterval(pump, 25);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pump(); });
}
export function setEcho(v = 0.22) { if (echoIn) echoIn.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
export function ready() { return !!ctx && ctx.state === 'running'; }
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02); }
export function isMuted() { return muted; }
export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// ----------------------------------------------------------------- voices
// Instrument presets. w: waveform; fm: 2-op FM; pad: detuned saw stack; filt: filter sweep.
export const PRESETS = {
  sqLead: { w: 'p25', a: 0.004, d: 0.14, s: 0.6, r: 0.07, vol: 0.13, vib: [0.18, 5.6, 0.011] },
  sqSoft: { w: 'p50', a: 0.01, d: 0.2, s: 0.5, r: 0.1, vol: 0.09, vib: [0.25, 5, 0.008], cut: 2600 },
  sqThin: { w: 'p12', a: 0.002, d: 0.08, s: 0.35, r: 0.05, vol: 0.09 },
  tri: { w: 'triangle', a: 0.002, d: 0.06, s: 0.9, r: 0.03, vol: 0.3 },
  fmBass: { fm: [1, 4.5, 1.1, 0.12], a: 0.002, d: 0.22, s: 0.55, r: 0.05, vol: 0.3 },
  fmSub: { fm: [1, 1.6, 0.4, 0.2], a: 0.004, d: 0.3, s: 0.75, r: 0.06, vol: 0.34 },
  fmSlap: { fm: [2, 7, 0.6, 0.05], a: 0.001, d: 0.16, s: 0.35, r: 0.04, vol: 0.27 },
  fmBrass: { fm: [1, 0.8, 3.4, 0.09], a: 0.03, d: 0.25, s: 0.75, r: 0.09, vol: 0.13, vib: [0.25, 5, 0.008] },
  fmStab: { fm: [1, 4.2, 1.5, 0.06], a: 0.006, d: 0.14, s: 0.3, r: 0.07, vol: 0.12 },
  fmBell: { fm: [3.5, 4.8, 0.3, 0.6], a: 0.001, d: 1.1, s: 0.0, r: 0.35, vol: 0.12 },
  fmEP: { fm: [1, 2.4, 0.35, 0.35], fm2: [14, 0.6, 0.0, 0.05], a: 0.002, d: 1.1, s: 0.22, r: 0.25, vol: 0.15, trem: [4.2, 0.12] },
  vibes: { fm: [4, 2.6, 0.15, 0.25], a: 0.001, d: 1.3, s: 0.0, r: 0.4, vol: 0.12, trem: [5.5, 0.25] },
  stacc: { pad: [2, 9], a: 0.008, d: 0.12, s: 0.35, r: 0.08, vol: 0.075, cut: 3200 },
  harpsi: { w: 'p12', a: 0.001, d: 0.28, s: 0.0, r: 0.12, vol: 0.1, hp: 500 },
  pluck: { w: 'sawtooth', a: 0.001, d: 0.45, s: 0.12, r: 0.15, vol: 0.12, filt: [4200, 500, 0.12, 1] },
  guitar: { w: 'sawtooth', a: 0.002, d: 0.7, s: 0.25, r: 0.25, vol: 0.1, filt: [2800, 700, 0.25, 2], vib: [0.3, 5, 0.006] },
  strings: { pad: [3, 11], a: 0.14, d: 0.4, s: 0.85, r: 0.4, vol: 0.055, cut: 2200, vib: [0.3, 5.2, 0.004] },
  darkPad: { pad: [3, 7], a: 0.4, d: 0.5, s: 0.9, r: 0.8, vol: 0.05, cut: 900 },
  choir: { w: 'vox', a: 0.18, d: 0.4, s: 0.85, r: 0.4, vol: 0.09, vib: [0.2, 5, 0.007], cut: 2400, dual: 6 },
  melodica: { w: 'reed', a: 0.035, d: 0.2, s: 0.85, r: 0.08, vol: 0.11, vib: [0.22, 5.2, 0.01], cut: 2800 },
  organ: { w: 'organ', a: 0.005, d: 0.1, s: 0.9, r: 0.06, vol: 0.09, trem: [6.5, 0.18] },
  acid: { w: 'sawtooth', a: 0.002, d: 0.16, s: 0.5, r: 0.05, vol: 0.11, filt: [3200, 260, 0.13, 13] },
  sync: { w: 'p25', a: 0.002, d: 0.06, s: 0.7, r: 0.04, vol: 0.1, sweep: [12, 0.05] },
  flute: { w: 'sine', a: 0.04, d: 0.2, s: 0.9, r: 0.08, vol: 0.16, vib: [0.2, 5.5, 0.012], breath: 0.03 },
  voxBlip: { w: 'vox', a: 0.003, d: 0.07, s: 0.4, r: 0.04, vol: 0.16, sweep: [-3, 0.06] },
  voxBlip2: { w: 'p25', a: 0.002, d: 0.06, s: 0.35, r: 0.03, vol: 0.12, sweep: [4, 0.05], cut: 3200 },
};

function oscOf(w, f, t) {
  const o = ctx.createOscillator();
  if (waves[w]) o.setPeriodicWave(waves[w]); else o.type = w;
  o.frequency.setValueAtTime(f, t);
  return o;
}
function envelope(param, t, dur, p, peak) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + p.a);
  param.setTargetAtTime(peak * p.s, t + p.a, Math.max(0.005, p.d / 3));
  const end = t + Math.max(dur, p.a + 0.005);
  param.setTargetAtTime(0, end, Math.max(0.005, p.r / 3));
  return end + p.r * 2 + 0.05;
}

// Play one note. dest defaults to the music bus.
export function note(preset, midi, t, dur, vel = 1, dest = null) {
  if (!ctx) return;
  const p = typeof preset === 'string' ? PRESETS[preset] : preset;
  if (!p) return;
  const out = dest || musicGain;
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = envelope(g.gain, t, dur, p, p.vol * vel);
  let tail = g;
  const nodes = [];
  // Optional tone shaping.
  if (p.cut || p.filt || p.hp) {
    const bq = ctx.createBiquadFilter();
    if (p.hp) { bq.type = 'highpass'; bq.frequency.value = p.hp; }
    else {
      bq.type = 'lowpass';
      if (p.filt) {
        const [f0, f1, ft, q] = p.filt;
        bq.Q.value = q;
        bq.frequency.setValueAtTime(Math.min(f0 * (0.6 + vel * 0.5), 16000), t);
        bq.frequency.setTargetAtTime(f1, t + 0.002, ft);
      } else bq.frequency.value = p.cut;
    }
    bq.connect(g); tail = bq;
  }
  g.connect(out);
  if (p.echo !== false && echoIn && out !== sfxGain) g.connect(echoIn);
  const addVib = (o, scale = 1) => {
    if (!p.vib) return;
    const [del, rate, depth] = p.vib;
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = rate; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * depth * scale, t + del + 0.15);
    l.connect(lg).connect(o.frequency); l.start(t); l.stop(stop); nodes.push(l);
  };
  if (p.trem) {
    const [rate, depth] = p.trem;
    const l = ctx.createOscillator(), lg = ctx.createGain(), tg = ctx.createGain();
    l.frequency.value = rate; lg.gain.value = depth; tg.gain.value = 1 - depth;
    l.connect(lg).connect(tg.gain); tg.connect(tail); tail = tg; l.start(t); l.stop(stop);
  }
  if (p.fm) {
    const [ratio, i0, i1, it] = p.fm;
    const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.setValueAtTime(f, t);
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(f * ratio, t);
    const mg = ctx.createGain();
    const depth = f * ratio;
    mg.gain.setValueAtTime(depth * i0 * (0.7 + vel * 0.4), t);
    mg.gain.setTargetAtTime(depth * i1, t + 0.001, it);
    mod.connect(mg).connect(car.frequency);
    if (p.fm2) {
      const [r2, j0, j1, jt] = p.fm2;
      const m2 = ctx.createOscillator(); m2.frequency.setValueAtTime(f * r2, t);
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(f * r2 * j0, t); g2.gain.setTargetAtTime(f * r2 * j1, t + 0.001, jt);
      m2.connect(g2).connect(car.frequency); m2.start(t); m2.stop(stop);
    }
    addVib(car);
    car.connect(tail);
    car.start(t); mod.start(t); car.stop(stop); mod.stop(stop);
    return;
  }
  if (p.pad) {
    const [n, det] = p.pad;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(p.cut * 0.5, t); lp.frequency.linearRampToValueAtTime(p.cut, t + p.a + 0.2);
    lp.connect(tail);
    for (let i = 0; i < n; i++) {
      const o = oscOf('sawtooth', f, t);
      o.detune.value = (i - (n - 1) / 2) * det;
      addVib(o, 0.5 + i * 0.3);
      o.connect(lp); o.start(t); o.stop(stop);
    }
    return;
  }
  const o = oscOf(p.w, f, t);
  if (p.sweep) { const [st, sd] = p.sweep; o.frequency.setValueAtTime(f * Math.pow(2, st / 12), t); o.frequency.exponentialRampToValueAtTime(f, t + sd); }
  addVib(o);
  o.connect(tail); o.start(t); o.stop(stop);
  if (p.dual) { const o2 = oscOf(p.w, f, t); o2.detune.value = p.dual; addVib(o2, 1.3); o2.connect(tail); o2.start(t); o2.stop(stop); }
  if (p.breath) { const n = noiseSrc(t, Math.min(dur, 0.3)); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2; const bg = ctx.createGain(); bg.gain.setValueAtTime(p.breath * vel * 3, t); bg.gain.setTargetAtTime(p.breath * vel, t + 0.03, 0.05); n.connect(bp).connect(bg).connect(tail); }
}

function noiseSrc(t, dur) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
  return n;
}

// ----------------------------------------------------------------- drums
export function drum(kind, t, vel = 1, dest = null) {
  if (!ctx) return;
  const out = dest || musicGain;
  const g = ctx.createGain(); g.connect(out);
  const v = vel;
  switch (kind) {
    case 'k': { // boom-bap kick: pitch-dropped sine with a click
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      g.gain.setValueAtTime(0.95 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g); o.start(t); o.stop(t + 0.4);
      const c = noiseSrc(t, 0.01), cg = ctx.createGain(); cg.gain.setValueAtTime(0.25 * v, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.012); c.connect(cg).connect(out);
      break;
    }
    case 'K': { // 909-ish electronic kick
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.07);
      g.gain.setValueAtTime(1 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); o.start(t); o.stop(t + 0.32);
      break;
    }
    case 's': { // snare: noise band + body tone
      const n = noiseSrc(t, 0.2), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
      g.gain.setValueAtTime(0.55 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      n.connect(bp).connect(g);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.4 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(og).connect(out); o.start(t); o.stop(t + 0.1);
      if (echoIn && out !== sfxGain) g.connect(echoIn);
      break;
    }
    case 'c': { // clap: three quick bursts
      const n = noiseSrc(t, 0.25), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.1;
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.5 * v, t + i * 0.011); g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.011 + 0.009); }
      g.gain.setValueAtTime(0.45 * v, t + 0.034); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      n.connect(bp).connect(g);
      if (echoIn && out !== sfxGain) g.connect(echoIn);
      break;
    }
    case 'h': case 'o': { // hats
      const n = noiseSrc(t, kind === 'o' ? 0.3 : 0.05), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
      g.gain.setValueAtTime((kind === 'o' ? 0.17 : 0.13) * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'o' ? 0.26 : 0.045));
      n.connect(hp).connect(g);
      break;
    }
    case 'y': { // crash
      const n = noiseSrc(t, 1.3), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500;
      g.gain.setValueAtTime(0.2 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      n.connect(hp).connect(g);
      if (echoIn && out !== sfxGain) g.connect(echoIn);
      break;
    }
    case 't': { // clock tick / rim
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(2600, t);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 4;
      g.gain.setValueAtTime(0.16 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      o.connect(bp).connect(g); o.start(t); o.stop(t + 0.03);
      break;
    }
    case 'p': { // tom / conga
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
      g.gain.setValueAtTime(0.4 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); o.start(t); o.stop(t + 0.24);
      break;
    }
    case 'z': { // zap / laser perc
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
      g.gain.setValueAtTime(0.08 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.connect(g); o.start(t); o.stop(t + 0.14);
      break;
    }
    default: if (scratchBufs[kind]) scratch(kind, t, v, out);
  }
}

// ----------------------------------------------------------------- scratches
// A sustained "ahh" is rendered once, then each scratch gesture reads through it with a
// moving record position, like a hand on vinyl: speed is pitch, the fader gates it.
function buildScratches() {
  const sr = ctx.sampleRate, N = sr * 2;
  const src = new Float32Array(N);
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const tt = i / sr, f0 = 150 + 25 * Math.sin(tt * 3);
    ph += f0 / sr;
    let s = 0;
    for (let k = 1; k < 20; k++) {
      const fk = f0 * k, w = Math.exp(-((fk - 750) ** 2) / 90000) + 0.6 * Math.exp(-((fk - 1250) ** 2) / 160000) + 0.06;
      s += Math.sin(6.2832 * ph * k) * w / Math.sqrt(k);
    }
    src[i] = s * 0.35 + (Math.random() * 2 - 1) * 0.04;
  }
  const make = (name, len, pos, gate) => {
    const L = Math.floor(len * sr), b = ctx.createBuffer(1, L, sr), d = b.getChannelData(0);
    let last = 0, lp = 0;
    for (let i = 0; i < L; i++) {
      const tt = i / len / sr;
      const p = (0.2 + pos(tt) * 0.35) * sr;
      const j = Math.floor(p), fr = p - j;
      const s = (src[j] || 0) * (1 - fr) + (src[j + 1] || 0) * fr;
      const sp = Math.abs(p - last); last = p;
      lp += (s - lp) * Math.min(1, 0.15 + sp * 0.5);
      d[i] = lp * gate(tt) * Math.min(1, sp * 1.4) * 1.8;
    }
    scratchBufs[name] = b;
  };
  const sin = Math.sin, PI = Math.PI;
  make('rb', 0.2, t => sin(PI * t) ** 2, () => 1); // baby: forward and back
  make('rc', 0.14, t => t < 0.5 ? sin(PI * t) : 1 - (t - 0.5), t => t < 0.45 ? 1 : 0.05); // chirp: cut on the way back
  make('rt', 0.26, t => t < 0.33 ? t * 1.4 : t < 0.55 ? 0.46 + (t - 0.33) * 1.2 : 0.72 - (t - 0.55) * 1.6, () => 1); // tear
  make('rs', 0.22, t => t * 0.3 + sin(t * PI * 10) * 0.05, () => 1); // scribble
  make('rx', 0.18, t => sin(PI * t * 0.5), t => (t * 7 | 0) % 2 ? 0.05 : 1); // transformer
}
function scratch(kind, t, v, out) {
  const s = ctx.createBufferSource(); s.buffer = scratchBufs[kind];
  const g = ctx.createGain(); g.gain.value = 0.55 * v;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
  s.connect(hp).connect(g).connect(out); s.start(t);
  if (echoIn && out !== sfxGain) g.connect(echoIn);
}

// ----------------------------------------------------------------- sequencer
let cur = null;      // { c: compiled song, start, base, i, loop, bus }
const songListeners = [];

export function playSong(compiled, { loop = true, at = 0, vol = 1 } = {}) {
  stopSong(0.04);
  dom = live() ? 'a' : 'v';
  const now = dom === 'a' ? ctx.currentTime + 0.06 : vclock;
  let bus = null;
  if (dom === 'a') { bus = ctx.createGain(); bus.gain.value = vol; bus.connect(musicGain); }
  cur = { c: compiled, start: now - at, base: now - at, i: 0, loop, bus, done: false };
  // Skip events before `at`.
  while (cur.c.events[cur.i] && cur.c.events[cur.i].t < at) cur.i++;
  pump();
  return cur;
}
export function stopSong(fade = 0.3) {
  if (!cur) return;
  const b = cur.bus;
  if (b && ctx) { b.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.01, fade / 3)); setTimeout(() => b.disconnect(), fade * 1000 + 400); }
  cur = null;
}
export function songInfo() { return cur ? cur.c : null; }
// Seconds since the song started, by the music clock (not wrapped at the loop point).
export function songTime() { return cur ? clock() - cur.start : 0; }
// The song beat at a given music-clock time (input.js stamps presses with clock()).
export function beatAt(tc) { return cur ? (tc - cur.start) / cur.c.beatDur : 0; }
export function beat() { return cur ? songTime() / cur.c.beatDur : 0; }
// Play a note exactly on a song beat (no-op when the song is on the virtual clock).
export function atBeat(preset, midi, b, durBeats = 0.25, vel = 1) {
  if (!cur || dom !== 'a' || !ctx) return;
  const t = cur.start + b * cur.c.beatDur;
  if (t < ctx.currentTime) return;
  note(preset, midi, t, durBeats * cur.c.beatDur, vel, cur.bus);
}
// Play a note right now on the effects bus (player-triggered voices).
export function noteNow(preset, midi, dur = 0.12, vel = 1) { if (ctx && ctx.state === 'running') note(preset, midi, ctx.currentTime + 0.003, dur, vel, sfxGain); }
export function songDone() { return !cur || (!cur.loop && songTime() > cur.c.len + 0.5); }

function pump() {
  if (!cur || dom !== 'a' || !ctx) return;
  const c = cur.c, ahead = ctx.currentTime + 0.16;
  for (let guard = 0; guard < 4000; guard++) {
    let ev = c.events[cur.i];
    if (!ev) {
      if (!cur.loop) return;
      cur.base += c.len - c.loopAt;
      cur.i = c.loopIndex;
      ev = c.events[cur.i];
      if (!ev) return;
    }
    const t = cur.base + ev.t;
    if (t > ahead) return;
    if (t >= ctx.currentTime - 0.03) {
      if (ev.k) drum(ev.k, t, ev.v, cur.bus);
      else note(ev.p, ev.m, t, ev.d, ev.v, cur.bus);
    }
    cur.i++;
  }
}

// ----------------------------------------------------------------- sfx
// One-shot effects on their own bus. Each is a few notes or a noise sweep.
export function sfx(name, vel = 1) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.005, o = sfxGain;
  const n = (p, m, dt, d, v = 1) => note(p, m, t + dt, d, v * vel, o);
  const d = (k, dt = 0, v = 1) => drum(k, t + dt, v * vel, o);
  switch (name) {
    case 'blip': n('voxBlip2', 84 + (Math.random() * 3 | 0), 0, 0.02, 0.5); break;
    case 'move': n('sqThin', 88, 0, 0.03, 0.8); break;
    case 'select': n('sqLead', 79, 0, 0.04); n('sqLead', 86, 0.05, 0.06); break;
    case 'back': n('sqLead', 74, 0, 0.04); n('sqLead', 67, 0.05, 0.06); break;
    case 'start': [72, 76, 79, 84, 88].forEach((m, i) => n('fmBrass', m, i * 0.06, 0.2, 1.4)); d('y', 0, 0.6); break;
    case 'shoot': { const x = ctx.createOscillator(), g = ctx.createGain(); x.type = 'square'; x.frequency.setValueAtTime(1400, t); x.frequency.exponentialRampToValueAtTime(220, t + 0.08); g.gain.setValueAtTime(0.06 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09); x.connect(g).connect(o); x.start(t); x.stop(t + 0.1); break; }
    case 'boom': d('k', 0, 1.2); { const s = noiseSrc(t, 0.6), lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.5); g.gain.setValueAtTime(0.5 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55); s.connect(lp).connect(g).connect(o); } break;
    case 'hurt': n('fmSlap', 52, 0, 0.12, 1.2); n('fmSlap', 47, 0.07, 0.15, 1.2); break;
    case 'jump': { const x = ctx.createOscillator(), g = ctx.createGain(); x.type = 'square'; x.frequency.setValueAtTime(300, t); x.frequency.exponentialRampToValueAtTime(900, t + 0.12); g.gain.setValueAtTime(0.05 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14); x.connect(g).connect(o); x.start(t); x.stop(t + 0.15); break; }
    case 'coin': n('sqLead', 88, 0, 0.04); n('sqLead', 95, 0.05, 0.14); break;
    case 'good': n('fmBell', 84, 0, 0.2, 0.9); break;
    case 'perfect': n('fmBell', 91, 0, 0.2, 1); n('fmBell', 96, 0.04, 0.2, 0.7); break;
    case 'miss': n('sqThin', 50, 0, 0.08); n('sqThin', 49, 0.06, 0.1); break;
    case 'win': [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => n('sqLead', m, i * 0.09, 0.12, 1.3)); [48, 55, 60].forEach((m, i) => n('fmBass', m, i * 0.18, 0.2)); break;
    case 'lose': [67, 63, 60, 55].forEach((m, i) => n('sqSoft', m, i * 0.16, 0.22, 1.4)); n('fmBass', 36, 0.48, 0.6); break;
    case 'whoosh': { const s = noiseSrc(t, 0.5), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3000, t + 0.4); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.25 * vel, t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45); s.connect(bp).connect(g).connect(o); break; }
    case 'zap': d('z', 0, 2); break;
    case 'alarm': for (let i = 0; i < 4; i++) { n('sqLead', 81, i * 0.22, 0.1, 1.2); n('sqLead', 76, i * 0.22 + 0.11, 0.1, 1.2); } break;
    case 'tick': d('t', 0, 1.5); break;
    case 'lock': n('fmStab', 60, 0, 0.08, 1.5); d('k', 0, 0.5); d('t', 0.01, 1.5); break;
    case 'flip': n('sqThin', 76, 0, 0.03); n('sqThin', 83, 0.03, 0.04); break;
    case 'glitch': for (let i = 0; i < 6; i++) n('sync', 40 + Math.random() * 50, i * 0.025, 0.03, 0.9); break;
    case 'heart': n('fmBell', 79, 0, 0.1); n('fmBell', 86, 0.07, 0.2); break;
    case 'brick': n('fmStab', 70 + (Math.random() * 6 | 0), 0, 0.05, 1); break;
    case 'power': [60, 64, 67, 72, 76, 79].forEach((m, i) => n('sqLead', m, i * 0.035, 0.05)); break;
    case 'crowd': { const s = noiseSrc(t, 1.4), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6; g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3); s.connect(bp).connect(g).connect(o); break; }
    case 'rb': case 'rc': case 'rt': case 'rs': case 'rx': d(name, 0, 1); break;
    case 'radio': for (let i = 0; i < 3; i++) n('sqThin', 96, i * 0.07, 0.03, 0.6); break;
    default: break;
  }
}
