// All sound is synthesised with Web Audio: ambience beds per place, one-shot effects, a little music.
let ctx = null, master, sfxBus, ambBus, verb, verbSend, noiseBuf, brownBuf;
let amb = null, ambName = null, musicTimer = null;
const timers = new Set();
export const settings = { sound: true, voices: true };

function every(fn, min, max) {
  let live = true, id;
  const tick = () => { if (!live) return; fn(); id = setTimeout(tick, (min + Math.random() * (max - min)) * 1000); timers.add(id); };
  id = setTimeout(tick, Math.random() * min * 1000); timers.add(id);
  return () => { live = false; clearTimeout(id); };
}

function makeNoise(brown) {
  const len = ctx.sampleRate * 3, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

function impulse(sec, decay) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = settings.sound ? 0.9 : 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.connect(master);
  verb = ctx.createConvolver(); verb.buffer = impulse(2.6, 2.4);
  verbSend = ctx.createGain(); verbSend.gain.value = 0.35; verbSend.connect(verb).connect(master);
  noiseBuf = makeNoise(false); brownBuf = makeNoise(true);
}

export function setSound(on) {
  settings.sound = on;
  if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.1);
  if (!on && window.speechSynthesis) speechSynthesis.cancel();
}

const now = () => ctx.currentTime;

function env(g, t, a, peak, dur, rel) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + Math.max(0, dur - a));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
}

function out(node, { pan = 0, wet = 0, dest = sfxBus } = {}) {
  let n = node;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(dest);
  if (wet) { const s = ctx.createGain(); s.gain.value = wet; n.connect(s).connect(verbSend); }
}

export function tone(freq, dur, { type = 'sine', gain = 0.2, a = 0.005, rel = 0.1, slide = null, at = 0, pan = 0, wet = 0, dest, detune = 0 } = {}) {
  if (!ctx) return;
  const t = now() + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  env(g, t, a, gain, dur, rel);
  o.connect(g); out(g, { pan, wet, dest });
  o.start(t); o.stop(t + dur + rel + 0.05);
  return o;
}

export function noise(dur, { gain = 0.2, a = 0.005, rel = 0.1, type = 'bandpass', f = 1000, Q = 1, fTo = null, at = 0, pan = 0, wet = 0, brown = false, dest } = {}) {
  if (!ctx) return;
  const t = now() + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = brown ? brownBuf : noiseBuf; s.loop = true;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = Q;
  if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + dur);
  env(g, t, a, gain, dur, rel);
  s.connect(fl).connect(g); out(g, { pan, wet, dest });
  s.start(t, Math.random() * 2); s.stop(t + dur + rel + 0.05);
}

// A looping filtered noise bed with a slowly wandering level.
function bed(gain, { type = 'lowpass', f = 400, Q = 0.7, brown = true, wander = 0.4, rate = [1.5, 4] } = {}) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = brown ? brownBuf : noiseBuf; s.loop = true;
  fl.type = type; fl.frequency.value = f; fl.Q.value = Q;
  g.gain.value = 0; g.gain.setTargetAtTime(gain, now(), 1.5);
  s.connect(fl).connect(g).connect(ambBus); s.start();
  const stopW = every(() => g.gain.setTargetAtTime(gain * (1 - wander + Math.random() * wander * 2), now(), 1.2), rate[0], rate[1]);
  return { g, fl, stop() { stopW(); g.gain.setTargetAtTime(0, now(), 0.6); setTimeout(() => s.stop(), 3000); } };
}

// ---- One-shot effects ----
export const sfx = {
  step() { noise(0.09, { gain: 0.12, f: 260, Q: 0.8, rel: 0.08 }); noise(0.05, { gain: 0.05, f: 1800, Q: 1, at: 0.02 }); },
  turn() { noise(0.18, { gain: 0.025, f: 700, Q: 0.6, a: 0.06, rel: 0.12 }); },
  click() { tone(1800, 0.015, { gain: 0.08, type: 'square' }); noise(0.02, { gain: 0.08, f: 3000 }); },
  clack() {
    noise(0.03, { gain: 0.3, f: 2400, Q: 3 }); tone(420, 0.05, { gain: 0.12, type: 'triangle', slide: 300 });
    noise(0.04, { gain: 0.18, f: 1300, Q: 4, at: 0.07 });
  },
  paper() { noise(0.22, { gain: 0.12, type: 'highpass', f: 2500, a: 0.02, rel: 0.15 }); noise(0.12, { gain: 0.08, f: 5000, at: 0.12 }); },
  bell(f = 520, g = 0.25) {
    [1, 2.01, 2.76, 4.07].forEach((m, i) => tone(f * m, 2.6 / (i + 1), { gain: g / (i + 1.2), wet: 0.5, a: 0.002, rel: 1.4 }));
  },
  whistle(dur = 2.4) {
    if (!ctx) return;
    [196, 247, 294].forEach(f => tone(f, dur, { type: 'sawtooth', gain: 0.05, a: 0.15, rel: 0.6, wet: 0.7 }));
    noise(dur, { gain: 0.12, f: 900, Q: 2, a: 0.1, rel: 0.6, wet: 0.6 });
  },
  thud() {
    tone(70, 0.9, { gain: 0.5, slide: 32, rel: 0.6 });
    noise(1.4, { gain: 0.35, brown: true, type: 'lowpass', f: 300, a: 0.01, rel: 1.0 });
    noise(1.0, { gain: 0.1, f: 600, Q: 6, at: 0.1, a: 0.2, fTo: 260 });
  },
  creak() { tone(140, 0.55, { type: 'sawtooth', gain: 0.05, slide: 95, a: 0.05, wet: 0.3 }); noise(0.5, { gain: 0.05, f: 900, Q: 12, fTo: 600 }); },
  dig() { noise(0.25, { gain: 0.3, f: 500, Q: 0.8, brown: true, type: 'lowpass', rel: 0.2 }); noise(0.1, { gain: 0.15, f: 2600, at: 0.05 }); },
  type() { noise(0.02, { gain: 0.25, f: 3200, Q: 2 }); tone(220 + Math.random() * 60, 0.025, { gain: 0.08, type: 'square' }); },
  ding() { tone(2093, 1.2, { gain: 0.1, rel: 0.9 }); },
  purr() { if (!ctx) return; const o = tone(26, 1.8, { type: 'sawtooth', gain: 0.0001 }); noise(1.8, { gain: 0.12, brown: true, type: 'lowpass', f: 180, a: 0.3, rel: 0.5 }); void o; },
  meow() { tone(620, 0.45, { type: 'sawtooth', gain: 0.06, slide: 420, a: 0.04 }); tone(1240, 0.45, { gain: 0.03, slide: 840, a: 0.04 }); },
  chest() { tone(180, 0.4, { type: 'sawtooth', gain: 0.05, slide: 120, a: 0.04 }); noise(0.15, { gain: 0.2, f: 1200, at: 0.35 }); },
  coins() { for (let i = 0; i < 9; i++) tone(2400 + Math.random() * 1800, 0.12, { gain: 0.05, at: i * 0.05 + Math.random() * 0.04, wet: 0.4 }); },
  gasp() { noise(2.2, { gain: 0.22, f: 900, Q: 0.7, a: 0.4, rel: 1.2, fTo: 1500, wet: 0.4 }); },
  cheer() { noise(4, { gain: 0.3, f: 1100, Q: 0.6, a: 0.6, rel: 2, wet: 0.5 }); for (let i = 0; i < 6; i++) noise(0.3, { gain: 0.08, f: 2000 + Math.random() * 1500, Q: 3, at: 0.6 + Math.random() * 2.5 }); },
  grind() { for (let i = 0; i < 14; i++) noise(0.05, { gain: 0.12, f: 900 + i * 40, Q: 6, at: i * 0.06 }); tone(90, 0.9, { type: 'sawtooth', gain: 0.04, slide: 60 }); },
  shutter() { noise(0.5, { gain: 0.16, f: 1600, Q: 0.8, fTo: 400 }); tone(220, 0.3, { gain: 0.05, slide: 110, at: 0.4 }); },
  door() { sfx.creak(); noise(0.3, { gain: 0.25, brown: true, type: 'lowpass', f: 250, at: 0.5 }); },
  splash() { noise(0.6, { gain: 0.2, f: 900, Q: 0.6, fTo: 300, rel: 0.3 }); },
  travel() {
    if (!ctx) return;
    [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 1.6, { gain: 0.05, at: i * 0.12, wet: 0.8, rel: 1.2 }));
    noise(2, { gain: 0.08, f: 3000, Q: 0.5, a: 0.8, rel: 1, wet: 0.6 });
  },
  chime() { [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, 1.2, { gain: 0.07, at: i * 0.18, wet: 0.7, rel: 1.4 })); },
  drip() { const f = 1400 + Math.random() * 1400; tone(f, 0.07, { gain: 0.08, slide: f * 0.55, wet: 0.9, pan: Math.random() * 1.6 - 0.8 }); },
};

// ---- Ambience beds ----
function cricket(pan, rate, pitch) {
  return every(() => {
    for (let i = 0; i < 3; i++) tone(pitch, 0.018, { gain: 0.018, at: i * 0.045, pan, dest: ambBus, a: 0.003, rel: 0.01 });
  }, rate * 0.8, rate * 1.25);
}
function owl() { tone(380, 0.35, { gain: 0.04, slide: 330, a: 0.08, dest: ambBus, wet: 0.6 }); tone(370, 0.6, { gain: 0.04, slide: 300, a: 0.1, at: 0.55, dest: ambBus, wet: 0.6 }); }
function frog() { const f = 90 + Math.random() * 60, pan = Math.random() * 2 - 1; for (let i = 0; i < 3; i++) tone(f, 0.07, { type: 'square', gain: 0.012, at: i * 0.09, pan, dest: ambBus }); }
function bird() { const f = 2400 + Math.random() * 2000, pan = Math.random() * 2 - 1; for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) tone(f * (0.9 + Math.random() * 0.3), 0.08, { gain: 0.02, slide: f * 1.3, at: i * 0.12, pan, dest: ambBus }); }

const beds = {
  study() {
    const stops = [bed(0.05, { f: 350 }), cricket(-0.6, 1.1, 4300), cricket(0.5, 0.9, 4650), cricket(0.1, 1.4, 4100), every(owl, 18, 40)];
    let tick = 0;
    stops.push(every(() => { tone(tick++ % 2 ? 2600 : 2300, 0.012, { gain: 0.03, type: 'square', dest: ambBus }); }, 1, 1));
    return () => stops.forEach(s => typeof s === 'function' ? s() : s.stop());
  },
  porch() {
    const stops = [bed(0.08, { f: 500, wander: 0.6 }), cricket(-0.8, 1.0, 4300), cricket(0.7, 0.85, 4700), cricket(0.2, 1.3, 4000), cricket(-0.2, 0.7, 4900), every(owl, 12, 30)];
    return () => stops.forEach(s => typeof s === 'function' ? s() : s.stop());
  },
  river() {
    const lap = bed(0.22, { f: 520, wander: 0.5, rate: [0.6, 1.4] });
    const stops = [lap, bed(0.04, { type: 'bandpass', f: 1800, Q: 0.4, brown: false }), every(frog, 1.5, 5), cricket(-0.9, 1.2, 4500), cricket(0.9, 1.1, 4200)];
    return () => stops.forEach(s => typeof s === 'function' ? s() : s.stop());
  },
  cave() {
    const stops = [bed(0.12, { f: 130 }), every(sfx.drip, 0.5, 2.6), every(() => { if (Math.random() < 0.4) for (let i = 0; i < 4; i++) tone(9000 + Math.random() * 3000, 0.02, { gain: 0.012, at: i * 0.07, dest: ambBus, wet: 0.6 }); }, 12, 30)];
    return () => stops.forEach(s => typeof s === 'function' ? s() : s.stop());
  },
  bluff() {
    const stops = [bed(0.1, { f: 700, wander: 0.6 }), every(bird, 1.5, 5), bed(0.05, { f: 260 })];
    return () => stops.forEach(s => typeof s === 'function' ? s() : s.stop());
  },
  court() {
    const crowd = [];
    for (let i = 0; i < 4; i++) crowd.push(bed(0.035, { type: 'bandpass', f: 320 + i * 180, Q: 2.5, brown: false, wander: 0.8, rate: [0.15, 0.5] }));
    const stops = [bed(0.07, { f: 450, wander: 0.6 }), ...crowd, every(bird, 2, 7)];
    const fn = () => stops.forEach(s => typeof s === 'function' ? s() : s.stop());
    fn.crowd = crowd;
    return fn;
  },
  shop() {
    const stops = [bed(0.04, { f: 300 }), every(() => tone(2400, 0.01, { gain: 0.02, type: 'square', dest: ambBus }), 1, 1)];
    return () => stops.forEach(s => typeof s === 'function' ? s() : s.stop());
  },
  silence() { return () => {}; },
};

export function ambience(name) {
  if (!ctx || name === ambName) return;
  if (amb) amb();
  ambName = name;
  amb = (beds[name] || beds.silence)();
}
export function crowdLevel(k) {
  if (amb && amb.crowd) amb.crowd.forEach(b => b.g.gain.setTargetAtTime(0.035 * k, now(), 0.8));
}

// River engine: paddlewheel chunks and escape-pipe chuffs scaled by speed.
let engine = null;
export function riverEngine(speed) {
  if (!ctx) return;
  if (speed <= 0.05) { if (engine) { engine(); engine = null; } return; }
  if (!engine) {
    let live = true, k = speed;
    const loop = () => {
      if (!live) return;
      noise(0.22, { gain: 0.16 * k, f: 260, Q: 0.8, brown: true, type: 'lowpass', dest: ambBus });
      noise(0.16, { gain: 0.07 * k, f: 900, Q: 1.2, at: 0.25, dest: ambBus });
      setTimeout(loop, 520 / Math.max(0.5, k));
    };
    loop();
    engine = () => { live = false; };
    engine.set = v => { k = v; };
  }
  engine.set?.(speed);
}

// Sparse music: a few soft piano-ish notes now and then.
const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
export function music(on) {
  if (musicTimer) { musicTimer(); musicTimer = null; }
  if (!on || !ctx) return;
  musicTimer = every(() => {
    const base = Math.floor(Math.random() * 4);
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const f = scale[(base + Math.floor(Math.random() * 4)) % scale.length] / 2;
      tone(f, 1.8, { gain: 0.035, at: i * 0.7, wet: 0.8, rel: 1.6 });
      tone(f * 2, 1.2, { gain: 0.012, at: i * 0.7, wet: 0.8, rel: 1 });
    }
  }, 14, 26);
}

// Spoken lines (leadsman calls). Subtitles are shown regardless.
let voice = null;
export function speak(text, { rate = 0.8, pitch = 0.6, volume = 0.9 } = {}) {
  if (!settings.sound || !settings.voices || !window.speechSynthesis) return;
  try {
    if (!voice) {
      const vs = speechSynthesis.getVoices();
      voice = vs.find(v => /en-US/i.test(v.lang) && /male|david|guy|fred|daniel/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)) || null;
    }
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { /* speech is optional */ }
}

export function ready() { return !!ctx; }
