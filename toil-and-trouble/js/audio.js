// Toil & Trouble: synthesised audio. Plain WebAudio, no samples, no imports.
// Every sound and every bar of music is generated at runtime. All melodies are
// original compositions written for this game.
//
// Public API: initAudio, sfx, playMusic, stopMusic, duckMusic, setMuted, isMuted,
// setPaused, plus renderOffline(name, seconds) for headless checks.

const MAX_VOICES = 40;      // hard cap on simultaneous voices (music + sfx)
const MAX_MUSIC = 30;       // music never takes more than this, so sfx always get room
const LOOKAHEAD = 0.15;     // seconds of music scheduled ahead of ctx.currentTime
const TICK_MS = 25;         // scheduler interval
const MUSIC_LEVEL = 0.45;
const SFX_LEVEL = 0.8;
const STORE_KEY = 'toil.muted';

// ---------------------------------------------------------------- helpers
const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PCS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NOTE_RE = /^([a-g])(#|b)?(-?\d)$/;
function noteNum(tok) {
  const m = NOTE_RE.exec(tok);
  if (!m) return null;
  return PCS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
}
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
const jit = (x, amt = 0.03) => x * (1 + (Math.random() * 2 - 1) * amt);
function mkGain(ac, v) { const g = ac.createGain(); g.gain.value = v; return g; }
function kill(nodes) { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already gone */ } } }

// ---------------------------------------------------------------- waveforms
function pulseWave(ac, duty) {
  const N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty) * Math.pow(0.985, n);
  return ac.createPeriodicWave(re, im);
}
function partialWave(ac, amps) {
  const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
  amps.forEach((v, i) => { im[i + 1] = v; });
  return ac.createPeriodicWave(re, im);
}
// Plucked-string spectrum: harmonic k falls off as |sin(k*pi*p)| / k^tilt,
// where p is the pluck point along the string (small p = bright and twangy).
function pluckWave(ac, p, tilt, n = 32) {
  const amps = [];
  for (let k = 1; k <= n; k++) amps.push(Math.abs(Math.sin(k * Math.PI * p)) / Math.pow(k, tilt));
  return partialWave(ac, amps);
}
const WAVE_ALIAS = { saw: 'sawtooth', tri: 'triangle', sq: 'square', sine: 'sine', square: 'square', sawtooth: 'sawtooth', triangle: 'triangle' };
function setWave(g, osc, type) {
  const nat = WAVE_ALIAS[type];
  if (nat) { osc.type = nat; return; }
  let w = g.waves[type];
  if (!w) {
    const ac = g.ac;
    if (type === 'p25') w = pulseWave(ac, 0.25);
    else if (type === 'p12') w = pulseWave(ac, 0.125);
    else if (type === 'p40') w = pulseWave(ac, 0.4);
    else if (type === 'organ') w = partialWave(ac, [1, 0.7, 0.45, 0.35, 0, 0.2, 0, 0.12, 0, 0.05]);
    else if (type === 'soft') w = partialWave(ac, [1, 0, 0.22, 0, 0.08, 0, 0.035, 0, 0.015]);
    else if (type === 'reed') w = partialWave(ac, [1, 0.05, 0.6, 0.04, 0.35, 0.03, 0.2, 0.02, 0.1, 0, 0.05]);
    else if (type === 'flute') w = partialWave(ac, [1, 0.18, 0.06, 0.02]);
    else if (type === 'brass') w = partialWave(ac, [1, 0.8, 0.62, 0.5, 0.38, 0.28, 0.2, 0.14, 0.1, 0.07, 0.05, 0.03]);
    else if (type === 'harpsi') w = pluckWave(ac, 0.13, 0.8);
    else if (type === 'banjo') w = pluckWave(ac, 0.06, 0.62);
    else { osc.type = 'sine'; return; }
    g.waves[type] = w;
  }
  osc.setPeriodicWave(w);
}

// ---------------------------------------------------------------- graph
function makeIR(ac, secs, decay, bright) {
  const sr = ac.sampleRate, len = Math.max(1, Math.floor(sr * secs));
  const buf = ac.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const pre = Math.floor(sr * 0.012);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * (bright - (bright - 0.08) * x);
      d[i] = i < pre ? 0 : lp * Math.pow(1 - x, decay);
    }
  }
  return buf;
}
function clipCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
    c[i] = Math.sign(x) * (ax < 0.75 ? ax : 0.75 + 0.23 * Math.tanh((ax - 0.75) / 0.23));
  }
  return c;
}

// Builds the whole bus layout on any BaseAudioContext (live or offline).
function buildGraph(ac) {
  const g = { ac, waves: {}, ends: [], last: {} };
  const master = mkGain(ac, 1);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -15; comp.knee.value = 12; comp.ratio.value = 3.5;
  comp.attack.value = 0.006; comp.release.value = 0.22;
  const shaper = ac.createWaveShaper();
  shaper.curve = clipCurve();
  master.connect(comp); comp.connect(shaper); shaper.connect(ac.destination);
  g.master = master;

  // music: bus -> duck -> pause low-pass -> pause gain -> master
  g.music = mkGain(ac, MUSIC_LEVEL);
  g.duck = mkGain(ac, 1);
  g.pauseLP = ac.createBiquadFilter();
  g.pauseLP.type = 'lowpass'; g.pauseLP.frequency.value = 20000; g.pauseLP.Q.value = 0.6;
  g.pause = mkGain(ac, 1);
  g.music.connect(g.duck); g.duck.connect(g.pauseLP); g.pauseLP.connect(g.pause); g.pause.connect(master);
  g.mRevIn = mkGain(ac, 1);
  const mRev = ac.createConvolver();
  mRev.buffer = makeIR(ac, 2.8, 3.2, 0.55);
  const mRevOut = mkGain(ac, 0.55);
  g.mRevIn.connect(mRev); mRev.connect(mRevOut); mRevOut.connect(g.music);

  // sfx: bus -> master, with its own short room and slap echo
  g.sfx = mkGain(ac, SFX_LEVEL);
  g.sfx.connect(master);
  g.sRevIn = mkGain(ac, 1);
  const sRev = ac.createConvolver();
  sRev.buffer = makeIR(ac, 1.4, 2.6, 0.7);
  const sRevOut = mkGain(ac, 0.5);
  g.sRevIn.connect(sRev); sRev.connect(sRevOut); sRevOut.connect(g.sfx);
  g.sDlyIn = mkGain(ac, 1);
  const sd = ac.createDelay(1); sd.delayTime.value = 0.17;
  const sfb = mkGain(ac, 0.3);
  const slp = ac.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 3200;
  g.sDlyIn.connect(sd); sd.connect(slp); slp.connect(sfb); sfb.connect(sd); slp.connect(g.sfx);
  g.sch = { in: g.sfx, sends: true, rev: g.sRevIn, dly: g.sDlyIn };

  // shared white noise
  const nb = ac.createBuffer(1, Math.floor(ac.sampleRate * 2), ac.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  g.noise = nb;
  return g;
}

// Voice budget, counted by time span so it also works when a whole track is
// scheduled at once into an OfflineAudioContext.
function claim(g, t, end, music, prio) {
  const a = g.ends;
  let w = 0, m = 0;
  for (let i = 0; i < a.length; i++) if (a[i].e > t) { a[w++] = a[i]; if (a[i].m) m++; }
  a.length = w;
  if (w >= MAX_VOICES + (prio ? 2 : 0) || (music && m >= MAX_MUSIC + (prio ? 4 : 0))) { g.dropped = (g.dropped || 0) + 1; return false; }
  if (w + 1 > (g.peakVoices || 0)) g.peakVoices = w + 1;
  a.push({ e: end, m: !!music });
  return true;
}

function connectOut(g, ch, node, o, nodes) {
  node.connect(ch.in);
  if (ch.sends) {
    if (o.rev) { const s = mkGain(g.ac, o.rev); node.connect(s); s.connect(ch.rev); nodes.push(s); }
    if (o.dly) { const s = mkGain(g.ac, o.dly); node.connect(s); s.connect(ch.dly); nodes.push(s); }
  }
}

// Builds a filter chain ending in `dest`; returns the list of input nodes.
function filterChain(ac, o, t, dur, d, dest, nodes) {
  let head = dest;
  const mk = (type, f, f2, q) => {
    const fl = ac.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + (o.sw ?? dur));
    fl.connect(head); head = fl; nodes.push(fl);
    return fl;
  };
  if (o.lp) {
    if (o.fe) {
      const fl = mk('lowpass', Math.min(16000, o.lp * (1 + o.fe)), 0, o.q ?? 0.8);
      fl.frequency.setTargetAtTime(o.lp, t + (o.a ?? 0.005), (o.fd ?? d) / 3 + 1e-4);
    } else mk('lowpass', o.lp, o.lp2, o.q ?? 0.8);
  }
  if (o.hp) mk('highpass', o.hp, o.hp2, o.hq ?? 0.7);
  if (o.bp) mk('bandpass', o.bp, o.bp2, o.bq ?? 1.2);
  if (o.form) {
    const sum = mkGain(ac, o.fg ?? 3);
    sum.connect(head); nodes.push(sum);
    return o.form.map((ff) => {
      const b = ac.createBiquadFilter();
      b.type = 'bandpass'; b.frequency.value = ff; b.Q.value = o.fq ?? 6;
      b.connect(sum); nodes.push(b);
      return b;
    });
  }
  return [head];
}

function addTrem(ac, o, t, end, head, nodes) {
  if (!o.trem) return head;
  const tg = mkGain(ac, 1 - o.trem * 0.5);
  const l = ac.createOscillator(); l.frequency.value = o.trr ?? 8;
  const lg = mkGain(ac, o.trem * 0.5);
  l.connect(lg); lg.connect(tg.gain); tg.connect(head);
  l.start(t); l.stop(end);
  nodes.push(tg, l, lg);
  return tg;
}

// Timing for one note. Percussive notes (s = 0) ring out their decay unless a
// dur is given (music notes always pass one, unless the instrument rings).
function span(o, t, defDur, defA, defD, defR) {
  const dur = Math.max(0.005, o.dur ?? defDur);
  const a = o.a ?? defA, d = o.d ?? defD, s = o.s ?? 0, r = o.r ?? defR;
  const off = t + Math.max(dur, a);
  const gated = s > 0 || (o.dur != null && !o.ring && r < d);
  const end = (s > 0 ? off + r * 1.8 : gated ? Math.min(t + a + d * 1.8, off + r * 1.8) : t + a + d * 1.8) + 0.02;
  return { dur, a, d, s, r, off, end, gated };
}
function envelope(gp, t, sp, v) {
  const { a, d, s, r, off } = sp;
  gp.setValueAtTime(0, t);
  gp.linearRampToValueAtTime(v, t + a);
  if (s > 0) {
    gp.setTargetAtTime(v * s, t + a, d / 3 + 1e-4);
    gp.setTargetAtTime(0, off, r / 3 + 1e-4);
  } else {
    gp.setTargetAtTime(0, t + a, d / 3 + 1e-4);
    if (sp.gated) gp.setTargetAtTime(0, off, r / 3 + 1e-4);
  }
}

// Oscillator voice: o = { f, f2, gl, pe, pt, type, det, v, a, d, s, r, dur,
//   lp, fe, fd, q, lp2, hp, bp, sw, form, vib, vr, vd, trem, trr, rev, dly }
function voice(g, ch, t, o, music) {
  const ac = g.ac;
  const sp = span(o, t, 0.15, 0.005, 0.12, 0.06), { dur, d, end } = sp;
  if (!claim(g, t, end, music, o.prio)) return;
  const nodes = [];
  const env = ac.createGain(); nodes.push(env);
  envelope(env.gain, t, sp, o.v ?? 0.2);
  const head = addTrem(ac, o, t, end, env, nodes);
  const ins = filterChain(ac, o, t, dur, d, head, nodes);
  const oscs = [];
  const n = o.det ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const os = ac.createOscillator();
    setWave(g, os, o.type || 'sine');
    const fp = os.frequency;
    if (o.pe) {
      fp.setValueAtTime(o.f * Math.pow(2, o.pe / 12), t);
      fp.exponentialRampToValueAtTime(o.f, t + (o.pt ?? 0.05));
    } else fp.setValueAtTime(o.f, t);
    if (o.f2) fp.exponentialRampToValueAtTime(o.f2, t + (o.gl ?? dur));
    if (o.det) os.detune.setValueAtTime(k ? o.det * 0.5 : -o.det * 0.5, t);
    for (const x of ins) os.connect(x);
    os.start(t); os.stop(end);
    oscs.push(os); nodes.push(os);
  }
  if (o.vib) {
    const l = ac.createOscillator(); l.frequency.value = o.vr ?? 5.5;
    const lg = ac.createGain();
    const vd = o.vd ?? 0;
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + vd);
    lg.gain.linearRampToValueAtTime(o.vib, t + vd + 0.25);
    l.connect(lg); for (const os of oscs) lg.connect(os.detune);
    l.start(t); l.stop(end); nodes.push(l, lg);
  }
  connectOut(g, ch, env, o, nodes);
  oscs[0].onended = () => kill(nodes);
}

// Filtered noise burst: same envelope keys as voice, plus rate (playback speed).
function noise(g, ch, t, o, music) {
  const ac = g.ac;
  const sp = span(o, t, 0.05, 0.002, 0.1, 0.05), { dur, d, end } = sp;
  if (!claim(g, t, end, music)) return;
  const nodes = [];
  const env = ac.createGain(); nodes.push(env);
  envelope(env.gain, t, sp, o.v ?? 0.2);
  const head = addTrem(ac, o, t, end, env, nodes);
  const ins = filterChain(ac, o, t, dur, d, head, nodes);
  const src = ac.createBufferSource();
  src.buffer = g.noise; src.loop = true;
  src.playbackRate.value = o.rate ?? 1;
  for (const x of ins) src.connect(x);
  src.start(t, Math.random() * 1.8); src.stop(end);
  nodes.push(src);
  connectOut(g, ch, env, o, nodes);
  src.onended = () => kill(nodes);
}

// Two-operator FM bell / celesta / metal. o = { f, ratio, idx, d, v, a, p2: [ratio, amp] }
function bell(g, ch, t, o, music) {
  const ac = g.ac;
  const f = o.f, d = o.d ?? 1.2, a = o.a ?? 0.002;
  const end = t + a + d * 1.25 + 0.03;
  if (!claim(g, t, end, music, o.prio)) return;
  const nodes = [];
  const env = ac.createGain(); nodes.push(env);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(o.v ?? 0.12, t + a);
  env.gain.setTargetAtTime(0, t + a, d / 4);
  const car = ac.createOscillator(); car.frequency.setValueAtTime(f, t);
  const mod = ac.createOscillator(); mod.frequency.setValueAtTime(f * (o.ratio ?? 3.5), t);
  const mg = ac.createGain();
  const idx = o.idx ?? 3;
  mg.gain.setValueAtTime(f * idx, t);
  mg.gain.setTargetAtTime(f * idx * (o.idxEnd ?? 0.12), t, (o.md ?? d) / 5);
  mod.connect(mg); mg.connect(car.frequency);
  let out = env;
  if (o.lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; fl.connect(env); out = fl; nodes.push(fl); }
  car.connect(out);
  car.start(t); car.stop(end); mod.start(t); mod.stop(end);
  nodes.push(car, mod, mg);
  if (o.p2) {
    const p = ac.createOscillator(); p.frequency.value = f * o.p2[0];
    const pg = ac.createGain();
    pg.gain.setValueAtTime(o.p2[1], t); pg.gain.setTargetAtTime(0, t, d / 8);
    p.connect(pg); pg.connect(out); p.start(t); p.stop(end); nodes.push(p, pg);
  }
  connectOut(g, ch, env, o, nodes);
  car.onended = () => kill(nodes);
}

function timp(g, ch, t, o, music) {
  voice(g, ch, t, { type: 'sine', f: o.f, pe: 2.5, pt: 0.07, a: 0.003, d: o.d ?? 1.1, s: 0, v: o.v ?? 0.4 }, music);
  voice(g, ch, t, { type: 'triangle', f: o.f * 1.5, a: 0.003, d: 0.35, s: 0, v: (o.v ?? 0.4) * 0.18 }, music);
  noise(g, ch, t, { lp: 500, d: 0.1, v: (o.v ?? 0.4) * 0.5 }, music);
}

// ---------------------------------------------------------------- drums
function drum(g, ch, t, kind, V, music) {
  switch (kind) {
    case 'k':
      voice(g, ch, t, { type: 'sine', f: 46, pe: 26, pt: 0.085, a: 0.002, d: 0.34, s: 0, v: 0.85 * V }, music);
      noise(g, ch, t, { hp: 2200, d: 0.008, v: 0.12 * V }, music);
      break;
    case 's':
      noise(g, ch, t, { hp: 1100, lp: 9000, d: 0.17, v: 0.36 * V }, music);
      voice(g, ch, t, { type: 'triangle', f: 178, pe: 6, pt: 0.03, d: 0.08, s: 0, v: 0.3 * V }, music);
      break;
    case 'h':
      noise(g, ch, t, { hp: 7200, d: 0.045, v: 0.15 * V }, music);
      break;
    case 'o':
      noise(g, ch, t, { hp: 6800, d: 0.32, v: 0.12 * V }, music);
      break;
    case 'c':
      noise(g, ch, t, { hp: 3800, lp: 12000, d: 1.5, v: 0.13 * V }, music);
      noise(g, ch, t, { bp: 5200, bq: 2, d: 0.7, v: 0.08 * V }, music);
      break;
    case 'r':
      voice(g, ch, t, { type: 'triangle', f: 1650, d: 0.025, v: 0.2 * V }, music);
      noise(g, ch, t, { bp: 2600, bq: 2, d: 0.02, v: 0.14 * V }, music);
      break;
    case 't':
      voice(g, ch, t, { type: 'sine', f: 128, pe: 7, pt: 0.1, d: 0.33, s: 0, v: 0.5 * V }, music);
      break;
    case 'T':
      voice(g, ch, t, { type: 'sine', f: 82, pe: 7, pt: 0.12, d: 0.45, s: 0, v: 0.55 * V }, music);
      break;
    case 'sh':
      noise(g, ch, t, { bp: 6500, bq: 1.2, a: 0.012, d: 0.05, v: 0.13 * V }, music);
      break;
    case 'b':
      noise(g, ch, t, { bp: 3600, bq: 0.8, a: 0.018, d: 0.12, v: 0.12 * V }, music);
      break;
    case 'w':
      voice(g, ch, t, { type: 'sine', f: 880, pe: 3, pt: 0.01, d: 0.06, v: 0.24 * V }, music);
      break;
    case 'cl':
      for (let i = 0; i < 3; i++) noise(g, ch, t + i * 0.011, { bp: 1400, bq: 1.5, d: 0.018, v: 0.22 * V }, music);
      noise(g, ch, t + 0.033, { bp: 1300, bq: 1.2, d: 0.14, v: 0.22 * V }, music);
      break;
    case 'th':
      noise(g, ch, t, { lp: 320, d: 0.16, v: 0.5 * V }, music);
      break;
    // holiday-world percussion
    case 'sr': // snare buzz roll swelling into the next written hit
      noise(g, ch, t, { hp: 1200, lp: 8500, a: 0.44, d: 0.08, v: 0.26 * V, trem: 0.85, trr: 31 }, music);
      break;
    case 'fs': // firework shell: rising whistle and hiss
      voice(g, ch, t, { type: 'sine', f: 900, f2: 2600, gl: 0.46, a: 0.03, d: 0.3, s: 0.8, dur: 0.44, r: 0.04, v: 0.045 * V, vib: 35, vr: 13 }, music);
      noise(g, ch, t, { bp: 3000, bp2: 6500, sw: 0.45, bq: 2, a: 0.1, d: 0.3, v: 0.05 * V }, music);
      break;
    case 'fw': // firework burst: thump, spray, then a trail of crackles
      voice(g, ch, t, { type: 'sine', f: 60, pe: 14, pt: 0.07, d: 0.5, v: 0.42 * V }, music);
      noise(g, ch, t, { lp: 2600, lp2: 500, sw: 0.7, a: 0.004, d: 0.7, v: 0.24 * V }, music);
      for (let i = 0; i < 6; i++) noise(g, ch, t + 0.14 + i * 0.09 + rnd(0, 0.06), { bp: rnd(2000, 6000), bq: 3, d: 0.02, v: rnd(0.08, 0.15) * V }, music);
      break;
    case 'bd': // bodhran, low open stroke
      voice(g, ch, t, { type: 'sine', f: 88, pe: 5, pt: 0.05, d: 0.3, v: 0.55 * V }, music);
      noise(g, ch, t, { lp: 650, d: 0.05, v: 0.22 * V }, music);
      break;
    case 'bt': // bodhran, high tipped stroke
      voice(g, ch, t, { type: 'sine', f: 170, pe: 4, pt: 0.03, d: 0.12, v: 0.32 * V }, music);
      noise(g, ch, t, { bp: 1300, bq: 1, d: 0.03, v: 0.14 * V }, music);
      break;
    case 'sl': // sleigh bells
      noise(g, ch, t, { hp: 5600, lp: 13000, a: 0.002, d: 0.17, v: 0.14 * V, trem: 0.9, trr: 37 }, music);
      break;
    case 'bi': // spring bird chirp
      voice(g, ch, t, { type: 'sine', f: 2900, f2: 4300, gl: 0.05, a: 0.004, d: 0.06, v: 0.055 * V }, music);
      voice(g, ch, t + 0.08, { type: 'sine', f: 3300, f2: 2500, gl: 0.06, a: 0.004, d: 0.07, v: 0.05 * V }, music);
      voice(g, ch, t + 0.17, { type: 'sine', f: 3000, f2: 4600, gl: 0.07, a: 0.004, d: 0.08, v: 0.05 * V, vib: 60, vr: 30 }, music);
      break;
    default: break;
  }
}

// ---------------------------------------------------------------- instrument presets
// role: how a section line is read. mel = note string, pad = the chord line,
// arp = chord-tone index pattern, bass = bass symbol pattern, stab = chord hits,
// drums = object of drum lines. Remaining keys are voice() parameters; v is the
// voice level, vol the channel level, rev/dly the channel send levels, tr a
// transpose in semitones, gate the fraction of the written length that sounds.
const P = {
  lead: { role: 'mel', type: 'p25', v: 0.12, a: 0.012, d: 0.22, s: 0.7, r: 0.12, lp: 2500, q: 0.6, vib: 14, vr: 5.4, vd: 0.16, rev: 0.22, dly: 0.2, pan: -0.05 },
  softLead: { role: 'mel', type: 'soft', v: 0.15, a: 0.02, d: 0.25, s: 0.75, r: 0.18, lp: 2300, vib: 12, vr: 5, vd: 0.2, rev: 0.3, dly: 0.22 },
  whistle: { role: 'mel', type: 'flute', v: 0.15, a: 0.03, d: 0.15, s: 0.85, r: 0.12, lp: 4000, vib: 20, vr: 5.8, vd: 0.12, rev: 0.3, dly: 0.18 },
  flute: { role: 'mel', type: 'flute', v: 0.12, a: 0.06, d: 0.2, s: 0.85, r: 0.25, lp: 3000, vib: 16, vr: 5, vd: 0.25, rev: 0.45, dly: 0.2 },
  clar: { role: 'mel', type: 'reed', v: 0.11, a: 0.025, d: 0.2, s: 0.75, r: 0.1, lp: 1900, vib: 8, vr: 5, vd: 0.25, rev: 0.25, dly: 0.12 },
  brass: { role: 'mel', type: 'brass', det: 8, v: 0.07, a: 0.05, d: 0.35, s: 0.7, r: 0.18, lp: 900, fe: 1.2, fd: 0.25, q: 1, vib: 8, vr: 4.8, vd: 0.3, rev: 0.35 },
  pluck: { role: 'arp', type: 'saw', v: 0.07, a: 0.002, d: 0.22, s: 0, r: 0.08, lp: 500, fe: 7, fd: 0.12, q: 2, rev: 0.2, dly: 0.3, pan: 0.25 },
  harp: { role: 'arp', ring: true, type: 'tri', v: 0.12, a: 0.002, d: 0.7, s: 0, r: 0.35, rev: 0.45, dly: 0.15, pan: 0.2 },
  celesta: { role: 'mel', k: 'bell', ratio: 4, idx: 1.6, d: 1.1, v: 0.1, p2: [2, 0.25], rev: 0.45, dly: 0.2 },
  bell: { role: 'mel', k: 'bell', ratio: 3.51, idx: 3, d: 2.2, v: 0.07, rev: 0.5, dly: 0.25 },
  drip: { role: 'arp', ring: true, type: 'sine', v: 0.11, pe: -10, pt: 0.04, a: 0.002, d: 0.16, s: 0, rev: 0.45, dly: 0.45, pan: 0.3 },
  pad: { role: 'pad', type: 'saw', det: 14, v: 0.028, a: 0.5, d: 0.6, s: 0.8, r: 0.8, lp: 1200, q: 0.4, rev: 0.6, gate: 1 },
  warmPad: { role: 'pad', type: 'tri', det: 10, v: 0.045, a: 0.35, d: 0.5, s: 0.85, r: 0.7, rev: 0.5, gate: 1 },
  organ: { role: 'pad', type: 'organ', v: 0.035, a: 0.06, d: 0.2, s: 1, r: 0.35, lp: 2600, vib: 5, vr: 6.2, rev: 0.55, gate: 1 },
  choir: { role: 'pad', type: 'saw', det: 12, v: 0.045, a: 0.4, d: 0.4, s: 0.85, r: 0.6, form: [700, 1150], fq: 7, fg: 3.5, vib: 10, vr: 4.6, rev: 0.6, gate: 1 },
  bass: { role: 'bass', type: 'tri', v: 0.3, a: 0.004, d: 0.25, s: 0.55, r: 0.06, gate: 0.9 },
  subBass: { role: 'bass', type: 'sine', v: 0.32, a: 0.01, d: 0.3, s: 0.8, r: 0.12, gate: 0.95 },
  sawBass: { role: 'bass', type: 'saw', v: 0.13, a: 0.004, d: 0.18, s: 0.45, r: 0.06, lp: 380, fe: 3, fd: 0.1, q: 3, gate: 0.85 },
  pizz: { role: 'mel', type: 'tri', v: 0.19, a: 0.002, d: 0.16, s: 0, r: 0.08, lp: 2600, fe: 1, fd: 0.06, rev: 0.3, dly: 0.12 },
  pizzBass: { role: 'bass', type: 'tri', v: 0.3, a: 0.002, d: 0.22, s: 0, r: 0.08, gate: 1 },
  stab: { role: 'stab', type: 'saw', det: 12, v: 0.032, a: 0.004, d: 0.16, s: 0.15, r: 0.08, lp: 1800, fe: 1.5, fd: 0.08, rev: 0.25 },
  chop: { role: 'stab', type: 'p25', v: 0.035, a: 0.002, d: 0.09, s: 0, r: 0.05, lp: 2400, rev: 0.2, dly: 0.1, pan: -0.2 },
  timp: { role: 'bass', k: 'timp', v: 0.36, d: 1.0 },
  drums: { role: 'drums', rev: 0.12 },
};
const I = (base, over) => Object.assign({}, base, over);

// ---------------------------------------------------------------- chords
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], sus4: [0, 5, 7], sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], m6: [0, 3, 7, 9], 6: [0, 4, 7, 9],
  aug: [0, 4, 8], 5: [0, 7], mmaj7: [0, 3, 7, 11], m9: [0, 3, 7, 10, 14], 9: [0, 4, 7, 10, 14], '7b9': [0, 4, 7, 10, 13],
};
const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CH_RE = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/;
const accOf = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
const WARN = [];
function warn(msg) { WARN.push(msg); if (typeof console !== 'undefined') console.warn('[audio] ' + msg); }

function voiceChord(pcs) {
  const c = 63;
  let ns = [...new Set(pcs)].map((pc) => { let n = pc + 60; while (n - c > 6) n -= 12; while (c - n > 5) n += 12; return n; });
  ns.sort((a, b) => a - b);
  for (let it = 0; it < 4; it++) {
    let moved = false;
    for (let i = 0; i < ns.length - 1; i++) if (ns[i + 1] - ns[i] === 1) { ns[i] += 12; moved = true; }
    if (!moved) break;
    ns.sort((a, b) => a - b);
  }
  return ns;
}
function parseChord(sym, where) {
  const m = CH_RE.exec(sym);
  if (!m || !QUAL[m[3]]) { warn(`bad chord "${sym}" in ${where}`); return null; }
  const root = (ROOTS[m[1]] + accOf(m[2]) + 12) % 12;
  const iv = QUAL[m[3]];
  const bass = m[4] ? (ROOTS[m[4]] + accOf(m[5]) + 12) % 12 : root;
  return { root, bass, iv, voiced: voiceChord(iv.map((x) => (root + x) % 12)) };
}

// ---------------------------------------------------------------- compiler
function parseMel(str, bar, where) {
  const out = [];
  let p = 0, dl = 2, barStart = 0, barNo = 1;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') {
      if (p - barStart !== bar) warn(`${where}: bar ${barNo} has ${p - barStart} steps`);
      barStart = p; barNo++; continue;
    }
    if (tok[0] === '@') { dl = +tok.slice(1); continue; }
    const [nm, l] = tok.split(':');
    const len = l ? +l : dl;
    if (nm !== 'r') {
      const n = noteNum(nm);
      if (n == null) warn(`${where}: bad note "${tok}"`);
      else out.push({ s: p, n, len });
    }
    p += len;
  }
  return { notes: out, len: p };
}
function eachStep(pat, L, fn) {
  const S = pat.replace(/[\s|]/g, '');
  const n = S.length;
  if (!n) return;
  for (let p = 0; p < L; p++) {
    const c = S[p % n];
    if (c === '.' || c === '-') continue;
    let len = 1;
    while (p + len < L && S[(p + len) % n] === '-') len++;
    fn(p, c, len);
  }
}
function resolveSec(def, name, where) {
  const s = def.sec[name];
  if (!s) { warn(`${where}: no section ${name}`); return { chords: '' }; }
  if (!s.from) return s;
  const out = Object.assign({}, resolveSec(def, s.from, where), s);
  delete out.from;
  return out;
}
const DRUM_VEL = { x: 1, X: 1.3, g: 0.4, o: 1, c: 1 };

function compileTrack(name, def) {
  const bar = def.bar || 16;
  const rand = makeRng(name.length * 7919 + name.charCodeAt(0));
  const ev = [];
  const intro = def.intro || [];
  const order = intro.concat(def.form);
  let pos = 0, loopStart = 0;
  order.forEach((secName, si) => {
    if (si === intro.length) loopStart = pos;
    const where = `${name}.${secName}`;
    const sec = resolveSec(def, secName, where);
    const chords = [];
    let L = 0;
    for (const tok of (sec.chords || '').split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const [sym, l] = tok.split(':');
      const len = l ? +l : bar;
      const c = parseChord(sym, where);
      if (c) chords.push(Object.assign({ s: L, len }, c));
      L += len;
    }
    if (!chords.length) return;
    const chordAt = (p) => { for (let i = chords.length - 1; i >= 0; i--) if (p >= chords[i].s) return chords[i]; return chords[0]; };
    for (const key of Object.keys(sec)) {
      if (key === 'chords' || key === 'fill') continue;
      const inst = def.inst[key], val = sec[key];
      if (!inst) { warn(`${where}: no instrument ${key}`); continue; }
      if (val == null || val === false || val === 0) continue;
      const push = (s, n, len, v) => ev.push({ s: pos + s, i: key, n, len, v: v * (0.95 + rand() * 0.1) * (s % bar === 0 ? 1.06 : 1) });
      switch (inst.role) {
        case 'mel': {
          const m = parseMel(val, bar, `${where}.${key}`);
          if (m.len !== L) warn(`${where}.${key}: ${m.len} steps, section has ${L}`);
          for (const nt of m.notes) if (nt.s < L) push(nt.s, nt.n, nt.len, 1);
          break;
        }
        case 'pad':
          for (const c of chords) for (const n of c.voiced) push(c.s, n, c.len, 1);
          break;
        case 'arp':
          eachStep(val, L, (p, ch, len) => {
            const idx = parseInt(ch, 36);
            if (Number.isNaN(idx)) return;
            const tones = chordAt(p).voiced, k = tones.length;
            push(p, tones[idx % k] + 12 * Math.floor(idx / k), len, 1);
          });
          break;
        case 'bass':
          eachStep(val, L, (p, ch, len) => {
            const c = chordAt(p), r = 36 + c.root, b = 36 + c.bass, iv = c.iv;
            const fifth = iv.find((x) => x >= 6 && x <= 8) ?? 7;
            const third = iv.find((x) => x === 3 || x === 4) ?? (iv.includes(5) ? 5 : iv.includes(2) ? 2 : 4);
            const sev = iv.find((x) => x >= 9 && x <= 11) ?? 10;
            const map = { R: b, O: b + 12, U: b + 24, 3: r + third, 5: r + fifth, 7: r + sev, L: r + fifth - 12, 2: r + 2, 4: r + 5, 6: r + 9, b: b - 1, X: b + 12 + fifth };
            const n = map[ch];
            if (n == null) return;
            push(p, n, len, 1);
          });
          break;
        case 'stab':
          eachStep(val, L, (p, ch, len) => {
            const v = ch === 'X' ? 1.25 : ch === 'g' ? 0.5 : 1;
            for (const n of chordAt(p).voiced) push(p, n, len, v);
          });
          break;
        case 'drums': {
          const fill = sec.fill && L > bar ? sec.fill : null;
          const lim = fill ? L - bar : L;
          const lines = (obj, from, to) => {
            for (const kind of Object.keys(obj)) {
              const S = obj[kind].replace(/[\s|]/g, '');
              if (!S.length) continue;
              for (let p = from; p < to; p++) {
                const c = S[(p - from) % S.length];
                const v = DRUM_VEL[c];
                if (!v) continue;
                ev.push({ s: pos + p, i: key, n: c === 'o' ? 'o' : c === 'c' ? 'c' : kind, len: 1, v: v * (0.92 + rand() * 0.14) });
              }
            }
          };
          lines(val, 0, lim);
          if (fill) lines(fill, lim, L);
          break;
        }
        default: warn(`${where}: instrument ${key} has no role`);
      }
    }
    pos += L;
  });
  ev.sort((a, b) => a.s - b.s);
  return { ev, total: pos, loopStart, loopIdx: Math.max(0, ev.findIndex((e) => e.s >= loopStart)) };
}
const COMPILED = {};
const compiled = (name) => COMPILED[name] || (COMPILED[name] = compileTrack(name, TRACKS[name]));

// ---------------------------------------------------------------- player
class Player {
  constructor(g, name, opts = {}) {
    const def = TRACKS[name], ac = g.ac;
    this.g = g; this.name = name; this.def = def; this.c = compiled(name);
    this.sd = 60 / def.bpm / 4;
    this.loop = def.loop !== false;
    this.music = opts.music !== false;
    this.live = !!opts.live;
    this.onEnd = opts.onEnd || null;
    this.solo = opts.solo || null;
    this.fade = mkGain(ac, 1); this.fade.connect(opts.out || g.music);
    this.revFade = mkGain(ac, 1); this.revFade.connect(opts.revIn || g.mRevIn);
    const dl = ac.createDelay(2); dl.delayTime.value = def.echo ?? this.sd * 3;
    const fb = mkGain(ac, def.fb ?? 0.32);
    const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    dl.connect(dlp); dlp.connect(fb); fb.connect(dl);
    this.nodes = [this.fade, this.revFade, dl, fb, dlp];
    if (ac.createStereoPanner) {
      const dp = ac.createStereoPanner(); dp.pan.value = 0.35;
      dlp.connect(dp); dp.connect(this.fade); this.nodes.push(dp);
    } else dlp.connect(this.fade);
    this.ch = {};
    for (const k of Object.keys(def.inst)) {
      const inst = def.inst[k];
      const inG = mkGain(ac, inst.vol ?? 1);
      let o = inG;
      if (inst.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = inst.pan; inG.connect(p); o = p; this.nodes.push(p); }
      o.connect(this.fade);
      if (inst.rev) { const s = mkGain(ac, inst.rev); o.connect(s); s.connect(this.revFade); this.nodes.push(s); }
      if (inst.dly) { const s = mkGain(ac, inst.dly); o.connect(s); s.connect(dl); this.nodes.push(s); }
      this.nodes.push(inG);
      this.ch[k] = { in: inG };
    }
    this.i = 0; this.t0 = 0; this.done = false; this.endAt = Infinity; this.dieAt = Infinity;
  }
  stepTime(s) {
    const d = this.def;
    let t = s * this.sd;
    if (d.swing && s % 4 === 2) t += d.swing * this.sd * 2;
    if (d.swing16 && s % 2 === 1) t += d.swing16 * this.sd;
    return t;
  }
  fadeIn(secs, now) {
    for (const gn of [this.fade, this.revFade]) { gn.gain.setValueAtTime(0.0001, now); gn.gain.linearRampToValueAtTime(1, now + secs); }
  }
  // Schedules every event that starts before now + ahead. Returns true once a
  // non-looping track has finished (tail included).
  tick(now, ahead) {
    if (this.done) return false;
    const ev = this.c.ev;
    if (!ev.length) { this.done = true; return true; }
    const horizon = now + ahead;
    for (;;) {
      if (this.i >= ev.length) {
        if (!this.loop) { this.endAt = this.t0 + this.c.total * this.sd; break; }
        this.t0 += (this.c.total - this.c.loopStart) * this.sd;
        this.i = this.c.loopIdx;
        continue;
      }
      const e = ev[this.i];
      let t = this.t0 + this.stepTime(e.s);
      if (t > horizon) break;
      if (this.live && t < now - 0.04) { this.t0 += now - t + 0.03; t = this.t0 + this.stepTime(e.s); }
      if (t < this.dieAt && (!this.solo || this.solo === e.i)) playEvent(this.g, this, e, t);
      this.i++;
    }
    if (this.endAt !== Infinity && now >= this.endAt + (this.def.tail ?? 0.2)) {
      this.done = true;
      if (this.live) setTimeout(() => kill(this.nodes), 3500);
      return true;
    }
    return false;
  }
  stop(fade) {
    const now = this.g.ac.currentTime, f = Math.max(0.02, fade);
    this.dieAt = now + f;
    this.onEnd = null;
    for (const gn of [this.fade, this.revFade]) {
      gn.gain.cancelScheduledValues(now);
      gn.gain.setValueAtTime(gn.gain.value, now);
      gn.gain.linearRampToValueAtTime(0, now + f);
    }
    if (this.live) setTimeout(() => { this.done = true; kill(this.nodes); }, (f + 3.5) * 1000);
  }
}

function playEvent(g, pl, e, t) {
  const inst = pl.def.inst[e.i], ch = pl.ch[e.i];
  if (inst.role === 'drums') { drum(g, ch, t, e.n, e.v * ((inst.kit && inst.kit[e.n]) ?? 1), pl.music); return; }
  const o = Object.assign({}, inst);
  o.f = midiHz(e.n + (inst.tr || 0));
  o.dur = e.len * pl.sd * (inst.gate ?? 0.92);
  o.v = (inst.v ?? 0.15) * e.v;
  if (inst.role === 'mel') o.prio = true;
  if (inst.k === 'bell') bell(g, ch, t, o, pl.music);
  else if (inst.k === 'timp') timp(g, ch, t, o, pl.music);
  else voice(g, ch, t, o, pl.music);
}

// ---------------------------------------------------------------- music
// Notes: name+octave[:length in 16ths]; "r" rests; "@n" sets the default length;
// "|" marks a bar (checked). Chords: symbol[:length], default one bar.
// Bass symbols: R root (or slash bass), O octave, 3 5 7 chord tones, L low fifth.
// Arp digits index the voiced chord upwards. Drum chars: x hit, X accent,
// g ghost, o open hat, c crash; "." rest. Every tune here is original.
const TRACKS = {};
const CR = (bars, bar = 16) => 'x' + '.'.repeat(bars * bar - 1);

// Title: D minor waltz, 3/4, 80 bpm. Celesta tune, harp, slow timpani.
TRACKS.title = {
  bpm: 80, bar: 12, fb: 0.38,
  inst: {
    cel: I(P.celesta, { v: 0.13 }),
    harp: I(P.harp, { tr: -12, v: 0.09 }),
    pad: I(P.pad, { lp: 950, v: 0.026 }),
    choir: I(P.choir, { v: 0.03 }),
    flute: I(P.flute, { v: 0.1 }),
    bass: I(P.subBass, { v: 0.15 }),
    timp: I(P.timp, { v: 0.24 }),
    dr: I(P.drums, { kit: { T: 0.6, sh: 0.55, b: 0.7, t: 0.5, c: 0.5 } }),
  },
  intro: ['I'],
  sec: {
    I: {
      chords: 'Dm Dm A7 A7', pad: 1, bass: 'R-----------',
      cel: 'r:6 a5:2 d6:2 e6:2 | f6:6 e6:2 d6:2 a5:2 | c#6:6 a5:2 e5:2 g5:2 | a5:12',
      timp: 'R...........', dr: { sh: '....x...x...' },
    },
    A: {
      chords: 'Dm Dm/C Bbmaj7 A7 Dm Dm/C Gm6 A7', pad: 1, bass: 'R-----------',
      cel: 'd5:6 e5:2 f5:4 | a5:8 g5:2 f5:2 | e5:4 f5:2 d5:2 a4:4 | c#5:6 e5:2 g5:4 | f5:6 e5:2 d5:4 | a5:4 bb5:4 a5:4 | g5:2 f5:2 e5:2 g5:2 bb5:4 | a5:6 r:2 c#5:2 e5:2',
      harp: '0.1.2.3.2.1.',
      dr: { T: 'x...........', sh: '..x...x...x.' },
    },
    B: {
      chords: 'Bb C Am7 Dm Gm Eb A7 A7', pad: 1, choir: 1, bass: 'R-----5-----',
      cel: 'd5:4 f5:4 bb5:4 | c6:6 bb5:2 g5:4 | a5:6 g5:2 e5:4 | f5:8 d5:4 | bb4:4 d5:4 g5:4 | bb5:6 g5:2 eb5:4 | c#5:4 e5:4 a5:4 | g5:2 f5:2 e5:2 d5:2 c#5:4',
      harp: '0.2.1.3.2.4.',
      timp: 'R.....5.....',
      dr: { T: 'x...........', b: '......x.....', sh: '..x...x...x.' },
    },
    A2: {
      from: 'A', choir: 1,
      flute: 'f4:12 | e4:12 | d4:12 | c#4:6 e4:6 | a4:12 | g4:12 | bb4:6 g4:6 | e4:6 c#4:6',
      timp: 'R...........',
      dr: { T: 'x.....g.....', b: '......x.....', sh: '..x...x...xx', c: CR(8, 12) },
      fill: { T: 'x...........', t: '....x.x.xxxx', sh: '..x...x...x.' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// World map: A dorian walking tune, 104 bpm, light swing.
TRACKS.map = {
  bpm: 104, swing: 0.12,
  inst: {
    wh: I(P.whistle, {}),
    clar: I(P.clar, { v: 0.085, pan: -0.25 }),
    chop: I(P.chop, { v: 0.07 }),
    bass: I(P.pizzBass, { v: 0.28 }),
    pad: I(P.warmPad, { v: 0.028 }),
    dr: I(P.drums, { kit: { k: 0.45, r: 0.5, sh: 0.5, h: 0.4, w: 0.5 } }),
  },
  sec: {
    A: {
      chords: 'Am D Am D C G F Esus4:8 E7:8', pad: 1,
      wh: 'a4:2 c5:2 e5:4 d5:2 c5:2 d5:4 | f#5:6 e5:2 d5:4 r:4 | a4:2 c5:2 e5:4 g5:2 f#5:2 e5:4 | d5:8 r:4 e5:2 f#5:2 | g5:6 e5:2 c5:4 e5:4 | d5:6 b4:2 g4:4 b4:4 | c5:4 a4:4 f5:4 e5:2 d5:2 | e5:8 g#4:4 b4:4',
      chop: '..x...x...x...x.', bass: 'R-..5-..O-..5-..',
      dr: { k: 'x.......x.......', r: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.' },
    },
    B: {
      chords: 'F G Em Am Dm G Cmaj7 E7', pad: 1,
      wh: 'a5:4 g5:2 f5:2 c5:4 f5:4 | g5:6 f5:2 d5:4 b4:4 | e5:4 g5:4 b5:4 a5:2 g5:2 | a5:8 e5:4 r:4 | f5:4 e5:2 d5:2 a4:4 d5:4 | b4:4 d5:2 g5:2 f5:4 d5:4 | e5:6 d5:2 c5:4 b4:4 | g#4:4 b4:4 d5:4 e5:4',
      chop: '..x...x...x...xx', bass: 'R-..3-..5-..3-..',
      dr: { k: 'x.......x.......', r: '....x.......x..x', sh: 'xxx.xxx.xxx.xxx.', w: '..............x.' },
    },
    A2: {
      from: 'A',
      clar: 'c4:8 e4:8 | f#4:8 a4:8 | e4:8 c4:8 | d4:8 f#4:4 a4:4 | e4:8 g4:8 | d4:8 b3:8 | a3:8 c4:8 | b3:8 g#3:8',
      dr: { k: 'x.......x..x....', r: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.', h: '..x...x...x...x.' },
      fill: { k: 'x.......x.......', r: '....x...x.x.x.x.', sh: 'x.x.x.x.x.x.x.x.' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// Hollow Wood: E minor, 136 bpm, bouncy 16th swing, plucky.
TRACKS.wood = {
  bpm: 136, swing16: 0.12,
  inst: {
    lead: I(P.lead, { v: 0.16 }),
    ctr: I(P.softLead, { v: 0.1, pan: 0.22, dly: 0.1 }),
    arp: I(P.pluck, { tr: 12, v: 0.09 }),
    bass: I(P.bass, { v: 0.22 }),
    pad: I(P.pad, { v: 0.02 }),
    dr: I(P.drums, { kit: { k: 0.55, s: 0.55, h: 0.45, c: 0.5, t: 0.6 } }),
  },
  sec: {
    A: {
      chords: 'Em Cmaj7 Am B7 Em G C Am:8 B7:8', pad: 1,
      lead: 'e5:2 r:1 e5:1 g5:2 b5:2 a5:3 g5:1 f#5:2 g5:2 | e5:6 b4:2 c5:2 d5:2 e5:4 | c5:2 r:1 c5:1 e5:2 a5:2 g5:3 f#5:1 e5:2 c5:2 | b4:6 d#5:2 f#5:4 a5:4 | g5:2 f#5:2 e5:2 b4:2 e5:2 f#5:2 g5:2 a5:2 | b5:6 a5:2 g5:2 f#5:2 d5:4 | e5:3 f#5:3 g5:2 c6:4 b5:2 a5:2 | a5:4 g5:2 f#5:2 d#5:4 b4:4',
      arp: '0.2.1.2.0.2.1.2.', bass: 'R-.RO-.RR-.RO-5-',
      dr: { k: 'x.....x.x.....x.', s: '....x..g....x..g', h: 'x.x.x.x.x.x.x.xx' },
      fill: { k: 'x.....x.x.......', s: '....x..g..x.xxXX', h: 'x.x.x.x.x.......' },
    },
    A2: {
      from: 'A',
      ctr: 'b4:8 g4:8 | g4:8 b4:8 | a4:8 e4:8 | f#4:8 d#4:8 | e4:4 g4:4 b4:8 | d5:8 b4:8 | c5:8 g4:8 | e4:8 f#4:8',
      arp: '0.2.1.2.0.2.1.21',
      dr: { k: 'x.....x.x.....x.', s: '....x..g....x..g', h: 'x.x.x.x.x.x.x.xx', c: CR(8) },
      fill: { k: 'x.....x.x.......', s: '....x..g..x.xxxx', t: '..........x.x...', h: 'x.x.x.x.x.......' },
    },
    B: {
      chords: 'C D Bm Em Am C B7 B7', pad: 1,
      lead: 'g5:4 e5:4 c5:4 e5:2 g5:2 | a5:6 f#5:2 d5:8 | f#5:4 d5:4 b4:4 d5:2 f#5:2 | g5:8 r:4 b4:2 e5:2 | a5:4 c6:4 b5:2 a5:2 g5:2 e5:2 | g5:6 e5:2 c5:4 d5:2 e5:2 | f#5:4 a5:4 g5:2 f#5:2 e5:2 d#5:2 | b4:8 r:8',
      arp: '0.1.2.3.4.3.2.1.', bass: 'R-.R..R-5-.R..O-',
      dr: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', c: CR(8) },
      fill: { k: 'x...x...x...x...', s: '........x.x.xxxx', t: '....x.x.........' },
    },
  },
  form: ['A', 'A2', 'B', 'A2'],
};

// Bramble Bog: C minor with a phrygian Db, 76 bpm, sparse and damp.
TRACKS.bog = {
  bpm: 76, fb: 0.42,
  inst: {
    fl: I(P.flute, { v: 0.11, lp: 2200 }),
    drip: I(P.drip, { v: 0.17 }),
    croak: I(P.sawBass, { v: 0.15, lp: 260, fe: 4, fd: 0.2, q: 6, pe: 2, pt: 0.12, vib: 25, vr: 7, trem: 0.5, trr: 16, gate: 0.95 }),
    pad: I(P.pad, { v: 0.028, lp: 700, a: 1.2, r: 1.5 }),
    dr: I(P.drums, { kit: { k: 0.35, r: 0.35, sh: 0.4, w: 0.4 } }),
  },
  sec: {
    A: {
      chords: 'Cm Cm Abmaj7 G7 Fm Fm Db G7sus4:8 G7:8', pad: 1,
      fl: 'r:4 g4:4 c5:6 d5:2 | eb5:8 d5:4 r:4 | c5:6 g4:2 eb5:8 | d5:12 r:4 | r:4 c5:4 f5:6 g5:2 | ab5:8 g5:4 f5:4 | f5:6 eb5:2 db5:8 | c5:8 b4:8',
      drip: '6....... 4.....5. ........ 7...4...', croak: 'R-------..R---..',
      dr: { k: 'x.........x.....', r: '....x.......x...', sh: '......x.......x.' },
    },
    B: {
      chords: 'Ab Bb Gm Cm Fm7 Ab Dbmaj7 G7', pad: 1,
      fl: 'eb5:4 ab5:4 g5:4 eb5:4 | f5:8 d5:4 bb4:4 | g5:6 f5:2 d5:8 | eb5:12 r:4 | ab5:4 g5:4 f5:4 eb5:4 | c5:8 eb5:8 | f5:6 c5:2 ab4:8 | b4:4 d5:4 f5:4 r:4',
      drip: '....5...... 7... ....4.......6...', croak: 'R-------....5-..',
      dr: { k: 'x.........x.....', r: '....x.......x...', sh: '......x...x...x.', w: '...............x' },
    },
  },
  form: ['A', 'B'],
};

// Cinder Mine: A harmonic minor, 156 bpm, galloping bass, rail-cart drive.
TRACKS.mine = {
  bpm: 156,
  inst: {
    lead: I(P.lead, { v: 0.15, lp: 3000, vib: 10 }),
    lead2: I(P.lead, { type: 'p12', v: 0.06, tr: 12, lp: 4000, pan: 0.3, vib: 0 }),
    arp: I(P.pluck, { tr: 12, v: 0.08 }),
    bass: I(P.sawBass, { v: 0.13, lp: 560 }),
    stab: I(P.stab, { v: 0.04 }),
    dr: I(P.drums, { kit: { k: 0.6, s: 0.6, h: 0.4, c: 0.5, t: 0.6, T: 0.6 } }),
  },
  intro: ['I'],
  sec: {
    I: {
      chords: 'Am Am', bass: 'R-RRR-RRR-RRO-RR',
      dr: { k: 'x...x...x...x...', h: 'x.xxx.xxx.xxx.xx', t: '........................x.x.x.x.' },
    },
    A: {
      chords: 'Am Am Fmaj7 E Dm Am Bb E7',
      lead: 'a4:2 c5:2 e5:2 a5:2 g#5:2 a5:2 e5:4 | c5:2 b4:1 c5:1 d5:2 e5:2 c5:2 a4:2 e4:4 | f5:2 e5:2 f5:2 a5:2 c6:4 a5:4 | g#5:6 f5:2 e5:2 d5:2 b4:4 | d5:2 f5:2 a5:2 d6:2 c6:2 a5:2 f5:4 | e5:2 a5:2 c6:2 e6:2 d6:2 c6:2 a5:4 | bb5:4 a5:2 g5:2 f5:4 d5:4 | e5:4 g#5:4 b5:4 d6:4',
      bass: 'R-RRR-RRR-RRO-RR', stab: 'x..x..x.x..x..x.',
      dr: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', c: CR(8) },
    },
    A2: {
      from: 'A', arp: '0123012301230123',
      lead2: 'a4:2 c5:2 e5:2 a5:2 g#5:2 a5:2 e5:4 | c5:2 b4:1 c5:1 d5:2 e5:2 c5:2 a4:2 e4:4 | f5:2 e5:2 f5:2 a5:2 c6:4 a5:4 | g#5:6 f5:2 e5:2 d5:2 b4:4 | d5:2 f5:2 a5:2 d6:2 c6:2 a5:2 f5:4 | e5:2 a5:2 c6:2 e6:2 d6:2 c6:2 a5:4 | bb5:4 a5:2 g5:2 f5:4 d5:4 | e5:4 g#5:4 b5:4 d6:4',
      fill: { k: 'x...x...x...x...', s: '....x...x.xxxxxx', t: '........x.x.....', T: '............x.x.' },
    },
    B: {
      chords: 'Dm Dm Am Am Bb C E E',
      lead: 'a5:3 a5:3 a5:2 f5:4 d5:4 | e5:3 f5:3 g5:2 f5:4 e5:4 | e5:3 e5:3 e5:2 c5:4 a4:4 | b4:3 c5:3 d5:2 e5:8 | f5:3 f5:3 f5:2 d5:4 bb4:4 | g5:3 g5:3 g5:2 e5:4 c5:4 | g#5:2 a5:2 b5:2 c6:2 b5:2 a5:2 g#5:2 f5:2 | e5:8 b4:4 g#4:4',
      bass: 'R-RRR-RRO-RR5-RR', stab: 'X.......x.x.....',
      dr: { k: 'x...x...x...x...', s: '....x..x....x...', h: 'x.xxx.xxx.xxx.xx', c: CR(8) },
    },
    B2: {
      from: 'B', arp: '0.1.2.3.0.1.2.3.',
      lead2: 'a5:3 a5:3 a5:2 f5:4 d5:4 | e5:3 f5:3 g5:2 f5:4 e5:4 | e5:3 e5:3 e5:2 c5:4 a4:4 | b4:3 c5:3 d5:2 e5:8 | f5:3 f5:3 f5:2 d5:4 bb4:4 | g5:3 g5:3 g5:2 e5:4 c5:4 | g#5:2 a5:2 b5:2 c6:2 b5:2 a5:2 g#5:2 f5:2 | e5:8 b4:4 g#4:4',
      fill: { k: 'x...x...x...x...', s: '....x...x.xxxxXX', T: '........x.x.x.x.' },
    },
  },
  form: ['A', 'A2', 'B', 'B2'],
};

// Belfry Heights: G dorian, 108 bpm, airy, bells and a soaring lead.
TRACKS.belfry = {
  bpm: 108, fb: 0.4,
  inst: {
    lead: I(P.softLead, { v: 0.11, vib: 16, lp: 2800, rev: 0.4, dly: 0.3 }),
    bell: I(P.bell, { role: 'arp', v: 0.08, tr: 12 }),
    harp: I(P.harp, { v: 0.08, tr: 12 }),
    pad: I(P.choir, { v: 0.03 }),
    pad2: I(P.pad, { v: 0.018, lp: 1600 }),
    bass: I(P.subBass, { v: 0.15 }),
    dr: I(P.drums, { kit: { k: 0.75, s: 0.7, h: 0.4, c: 0.55 } }),
  },
  sec: {
    A: {
      chords: 'Gm Ebmaj7 Bb F Gm C Ebmaj7 Dsus4:8 D:8', pad: 1,
      lead: 'd5:4 g5:4 a5:4 bb5:4 | d6:12 c6:2 bb5:2 | bb5:6 a5:2 f5:8 | a5:4 g5:4 f5:4 c5:4 | d5:4 g5:4 bb5:4 d6:4 | e6:8 d6:4 c6:4 | bb5:6 g5:2 d6:4 c6:2 bb5:2 | a5:8 f#5:8',
      bell: '0...............', harp: '0.1.2.3.4.3.2.1.', bass: 'R-------5-------',
      dr: { k: 'x.........x.....', s: '........x.......', h: '..x...x...x...xx' },
    },
    B: {
      chords: 'Eb F Dm Gm Cm F Bb D7', pad: 1, pad2: 1,
      lead: 'g5:4 bb5:4 eb6:8 | f6:6 eb6:2 c6:8 | d6:4 a5:4 f5:4 a5:4 | bb5:12 r:4 | c6:4 eb6:4 d6:4 c6:4 | a5:6 c6:2 f6:8 | d6:6 c6:2 bb5:4 a5:4 | f#5:4 a5:4 c6:4 a5:4',
      bell: '0.......2.......', harp: '0.1.2.3.4.3.2.1.', bass: 'R-------O-------',
      dr: { k: 'x.........x.x...', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', c: CR(8) },
    },
    A2: {
      from: 'A', bell: '0.......4.......', harp: '0123432101234321',
      dr: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', c: CR(8) },
      fill: { k: 'x.......x.x.....', s: '....x...x.x.xxxx', h: 'x.x.x.x.........' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// Lantern Lane: G minor, 100 bpm, triplet swing, tiptoe pizzicato.
TRACKS.village = {
  bpm: 100, swing: 0.3,
  inst: {
    pizz: I(P.pizz, { v: 0.3 }),
    clar: I(P.clar, { v: 0.14 }),
    bsn: I(P.clar, { v: 0.11, lp: 900, pan: 0.25 }),
    bass: I(P.pizzBass, { v: 0.34 }),
    chop: I(P.chop, { v: 0.05, lp: 1500 }),
    pad: I(P.warmPad, { v: 0.035 }),
    dr: I(P.drums, { kit: { k: 0.4, r: 0.45, b: 0.7, h: 0.3 } }),
  },
  sec: {
    A: {
      chords: 'Gm Gm Cm D7 Gm Eb Am7b5 D7',
      pizz: 'g4:2 r:2 bb4:2 r:2 d5:2 c5:2 bb4:2 a4:2 | g4:2 r:2 d4:2 r:2 g4:4 r:4 | c5:2 r:2 eb5:2 r:2 g5:2 f5:2 eb5:2 d5:2 | c5:2 r:2 a4:2 r:2 f#4:4 r:2 d4:2 | g4:2 a4:2 bb4:2 c5:2 d5:2 r:2 g5:2 r:2 | f5:2 eb5:2 d5:2 c5:2 bb4:2 r:2 g4:2 r:2 | a4:2 c5:2 eb5:2 c5:2 a4:2 g4:2 f#4:2 eb4:2 | d4:2 r:2 f#4:2 a4:2 c5:4 r:4',
      bass: 'R-..5-..O-..5-..', chop: '....x.......x...',
      dr: { k: 'x.......x.......', b: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', r: '..............x.' },
    },
    B: {
      chords: 'Cm Gm Ab D7 Eb Cm Am7b5 D7', pad: 1,
      clar: 'eb5:6 d5:2 db5:2 c5:2 r:4 | d5:6 c5:2 b4:2 bb4:2 r:4 | c5:4 eb5:4 ab5:4 g5:2 f5:2 | f#5:4 a5:4 d5:8 | g5:4 f5:2 eb5:2 bb4:4 g4:4 | eb5:4 d5:2 c5:2 g4:4 eb4:4 | c5:2 eb5:2 a5:4 g5:2 eb5:2 c5:4 | d5:4 c5:2 a4:2 f#4:4 r:4',
      bass: 'R-..3-..5-..6-..', chop: '..x...x...x...x.',
      dr: { k: 'x.....x.x.......', b: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    },
    A2: {
      from: 'A',
      bsn: 'd4:8 bb3:8 | g3:16 | eb4:8 g4:8 | f#4:8 c4:8 | bb3:8 d4:8 | g4:8 eb4:8 | eb4:8 c4:8 | a3:8 f#3:8',
      dr: { k: 'x.......x.....x.', b: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', r: '......x.......x.' },
      fill: { k: 'x.......x.......', b: '....x...x.x.x...', r: '..........x.x.x.' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// Witchfinder's Keep: C minor, 96 bpm, organ, low brass, a marching snare.
TRACKS.keep = {
  bpm: 96,
  inst: {
    brass: I(P.brass, { v: 0.12 }),
    brassLo: I(P.brass, { v: 0.07, tr: -12, lp: 600 }),
    organ: I(P.organ, {}),
    ped: I(P.subBass, { v: 0.13 }),
    timp: I(P.timp, { v: 0.24 }),
    bell: I(P.bell, { role: 'arp', v: 0.05, d: 2.6 }),
    dr: I(P.drums, { kit: { s: 0.5, k: 0.55, T: 0.5 } }),
  },
  sec: {
    A: {
      chords: 'Cm Cm/Bb Ab G Cm Fm/Ab Db G7', organ: 1,
      brass: 'c4:6 eb4:2 g4:8 | f4:4 eb4:4 d4:8 | c4:6 eb4:2 ab4:6 g4:2 | g4:8 f4:4 d4:4 | c5:6 bb4:2 g4:8 | ab4:6 g4:2 f4:8 | f4:4 ab4:4 db5:8 | b4:6 d5:2 f5:4 d5:4',
      ped: 'R---------------', timp: 'R.......5.......',
      dr: { k: 'x.......x.......', s: 'x..gx..gx..gx.xx' },
    },
    B: {
      chords: 'Fm Cm Ab Eb Fm Bdim7 Cm G7', organ: 1,
      brass: 'ab4:4 c5:4 f5:8 | eb5:6 d5:2 c5:8 | c5:4 eb5:4 ab5:4 g5:4 | g5:8 bb4:8 | ab5:6 g5:2 f5:4 c5:4 | d5:4 f5:4 ab5:4 b5:4 | c6:8 g5:4 eb5:4 | d5:4 b4:4 g4:4 f4:4',
      ped: 'R-------5-------', timp: 'R...........5...',
      dr: { k: 'x.......x.......', s: 'x.gxx.gxx.gxx.gx', T: 'x.......x...x...' },
    },
    A2: {
      from: 'A', bell: '0...............',
      brassLo: 'c4:6 eb4:2 g4:8 | f4:4 eb4:4 d4:8 | c4:6 eb4:2 ab4:6 g4:2 | g4:8 f4:4 d4:4 | c5:6 bb4:2 g4:8 | ab4:6 g4:2 f4:8 | f4:4 ab4:4 db5:8 | b4:6 d5:2 f5:4 d5:4',
      dr: { k: 'x.......x...x...', s: 'x..gx..gx..gx.xx', T: 'x...............' },
      fill: { s: 'x.x.x.x.xxxxXXXX', T: 'x.......x...x.x.' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// Witchfinder boss: E phrygian/harmonic minor, 172 bpm.
TRACKS.boss = {
  bpm: 172,
  inst: {
    lead: I(P.lead, { v: 0.15, lp: 3200, vib: 10, vr: 6 }),
    lead2: I(P.brass, { v: 0.07, tr: -12, lp: 1400 }),
    stab: I(P.stab, { v: 0.04 }),
    arp: I(P.pluck, { tr: 12, v: 0.08, lp: 700 }),
    bass: I(P.sawBass, { v: 0.15, lp: 520 }),
    organ: I(P.organ, { v: 0.022 }),
    dr: I(P.drums, { kit: { k: 0.55, s: 0.6, h: 0.38, c: 0.5, T: 0.6, t: 0.6 } }),
  },
  intro: ['I'],
  sec: {
    I: {
      chords: 'Em F', bass: 'R-R-O-R-R-R-O-R-', stab: 'X.......X.......',
      dr: { k: 'x...x...x...x...', t: '........................x.x.x.x.', T: '............................x.x.' },
    },
    A: {
      chords: 'Em F Em F C Am B7 B7', organ: 1,
      lead: 'e5:2 e5:1 e5:1 g5:2 e5:2 b5:2 a5:2 g5:2 f#5:2 | f5:4 a5:2 c6:2 b5:2 a5:2 f5:4 | e5:2 e5:1 e5:1 g5:2 e5:2 b5:2 c6:2 b5:2 g5:2 | a5:6 g5:2 f5:4 e5:4 | g5:2 e5:2 c5:2 e5:2 g5:2 c6:2 b5:2 g5:2 | a5:2 e5:2 c5:2 e5:2 a5:2 c6:2 e6:4 | d#6:4 c6:2 b5:2 a5:2 g5:2 f#5:2 d#5:2 | b4:2 c5:2 d#5:2 f#5:2 a5:2 b5:2 d#6:4',
      bass: 'R-R-O-R-R-R-O-R-', stab: 'x.....x.....x...',
      dr: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.o.', c: CR(8) },
    },
    A2: {
      from: 'A', arp: '0.1.2.0.1.2.0.1.',
      lead2: 'e5:2 e5:1 e5:1 g5:2 e5:2 b5:2 a5:2 g5:2 f#5:2 | f5:4 a5:2 c6:2 b5:2 a5:2 f5:4 | e5:2 e5:1 e5:1 g5:2 e5:2 b5:2 c6:2 b5:2 g5:2 | a5:6 g5:2 f5:4 e5:4 | g5:2 e5:2 c5:2 e5:2 g5:2 c6:2 b5:2 g5:2 | a5:2 e5:2 c5:2 e5:2 a5:2 c6:2 e6:4 | d#6:4 c6:2 b5:2 a5:2 g5:2 f#5:2 d#5:2 | b4:2 c5:2 d#5:2 f#5:2 a5:2 b5:2 d#6:4',
      fill: { k: 'x.x.x.x.x.x.x.x.', s: '....x...x.x.xxxx', T: '........x.x.x.x.' },
    },
    B: {
      chords: 'Am Em Am B C D B7 B7', organ: 1,
      lead: 'a5:4 r:2 a5:2 c6:4 b5:4 | g5:4 r:2 g5:2 b5:4 a5:4 | e5:2 f5:2 g5:2 a5:2 c6:4 e6:4 | d#6:8 b5:4 f#5:4 | g5:4 r:2 g5:2 e6:4 d6:4 | f#5:4 r:2 f#5:2 d6:4 c6:4 | b5:2 a5:2 g5:2 f#5:2 e5:2 d#5:2 c5:2 b4:2 | b4:4 d#5:4 f#5:4 a5:4',
      bass: 'R-R-O-R-R-R-O-5-', stab: 'X..X..X...X..X..',
      dr: { k: 'x...x...x...x...', s: '....x..x....x...', h: 'x.xxx.xxx.xxx.xx', c: CR(8) },
    },
    B2: {
      from: 'B', arp: '0123012301230123',
      lead2: 'a5:4 r:2 a5:2 c6:4 b5:4 | g5:4 r:2 g5:2 b5:4 a5:4 | e5:2 f5:2 g5:2 a5:2 c6:4 e6:4 | d#6:8 b5:4 f#5:4 | g5:4 r:2 g5:2 e6:4 d6:4 | f#5:4 r:2 f#5:2 d6:4 c6:4 | b5:2 a5:2 g5:2 f#5:2 e5:2 d#5:2 c5:2 b4:2 | b4:4 d#5:4 f#5:4 a5:4',
      fill: { k: 'x...x...x...x...', s: '....x...xxxxXXXX', T: '..........x.x.x.' },
    },
  },
  form: ['A', 'A2', 'B', 'B2'],
};

// Bonus room: F mixolydian, 160 bpm, a quick frantic loop.
TRACKS.bonus = {
  bpm: 160,
  inst: {
    lead: I(P.lead, { type: 'p12', v: 0.15, lp: 4200, vib: 8, vr: 7 }),
    lead2: I(P.lead, { v: 0.07, tr: -12, vib: 0, pan: 0.3 }),
    arp: I(P.pluck, { tr: 12, v: 0.07, lp: 900 }),
    bass: I(P.bass, { v: 0.22 }),
    chop: I(P.chop, { v: 0.06 }),
    dr: I(P.drums, { kit: { k: 0.6, s: 0.6, h: 0.32, w: 0.6, c: 0.45 } }),
  },
  sec: {
    A: {
      chords: 'F Eb Bb C7',
      lead: 'f5:1 g5:1 a5:1 c6:1 a5:2 f5:2 c5:2 f5:2 a5:2 c6:2 | bb5:1 c6:1 bb5:1 g5:1 eb5:2 g5:2 bb5:2 g5:2 eb6:4 | d6:2 c6:2 bb5:2 f5:2 d5:2 f5:2 bb5:4 | c6:2 bb5:2 a5:2 g5:2 e5:2 c5:2 e5:2 g5:2',
      arp: '0123012301230123', bass: 'R.O.R.O.R.O.R.O.', chop: '..x...x...x...x.',
      dr: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', w: '..............x.', c: CR(4) },
    },
    B: {
      chords: 'Dm Bb Gm C7',
      lead: 'a5:2 r:1 a5:1 f5:2 d5:2 a5:2 r:1 a5:1 d6:4 | bb5:2 r:1 bb5:1 f5:2 d5:2 bb5:2 r:1 bb5:1 d6:4 | g5:1 a5:1 bb5:1 c6:1 d6:2 bb5:2 g5:2 d5:2 g5:2 bb5:2 | c6:2 e6:2 g6:4 e6:2 c6:2 bb5:4',
      arp: '0.1.2.1.0.1.2.1.', bass: 'R.O.R.O.5.O.R.O.', chop: '..x...x...x...x.',
      dr: { k: 'x...x...x...x...', s: '....x..x....x...', h: 'x.xxx.xxx.xxx.xx' },
      fill: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', h: 'x.x.x.x.........' },
    },
    A2: {
      from: 'A',
      lead2: 'f5:1 g5:1 a5:1 c6:1 a5:2 f5:2 c5:2 f5:2 a5:2 c6:2 | bb5:1 c6:1 bb5:1 g5:1 eb5:2 g5:2 bb5:2 g5:2 eb6:4 | d6:2 c6:2 bb5:2 f5:2 d5:2 f5:2 bb5:4 | c6:2 bb5:2 a5:2 g5:2 e5:2 c5:2 e5:2 g5:2',
      fill: { k: 'x...x...x...x...', s: '....x...x.xxxxxx', w: 'x.x.x...' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// ---------------------------------------------------------------- jingles
const KAZOO = { role: 'mel', type: 'saw', form: [520, 1350], fq: 5, fg: 3.2, v: 0.08, a: 0.02, d: 0.2, s: 0.8, r: 0.1, vib: 40, vr: 7, vd: 0.05, rev: 0.25 };

TRACKS.clear = {
  bpm: 120, loop: false, tail: 0.35,
  inst: {
    lead: I(P.lead, { v: 0.13, lp: 3600, vib: 18, vd: 0.12 }),
    kazoo: I(KAZOO, { tr: -12 }),
    stab: I(P.stab, { v: 0.04 }),
    bass: I(P.bass, { v: 0.28 }),
    cel: I(P.celesta, { v: 0.08, role: 'arp', tr: 12 }),
    dr: I(P.drums, { kit: { k: 0.9, s: 0.8, c: 0.7 } }),
  },
  sec: {
    A: {
      chords: 'D:8 G:4 A:4 D:16',
      lead: 'd5:2 f#5:2 a5:2 d6:2 b5:2 g5:2 c#6:2 e6:2 | d6:4 r:2 a5:1 d6:1 f#6:8',
      kazoo: 'a4:2 d5:2 f#5:2 a5:2 g5:2 d5:2 a5:2 c#6:2 | a5:4 r:2 f#5:1 a5:1 d6:8',
      bass: 'R.R.R.R.R.R.R.R. R.....L.R-------',
      stab: 'x.x.x.x.x...x... X.....x.X-------',
      cel: '................ ........0.1.2.3.',
      dr: { k: 'x...x...x...x... x.....x.x.......', s: '..x...x...x.x.x. x.....x.x.......', c: '................ x.......x.......' },
    },
  },
  form: ['A'],
};

TRACKS.death = {
  bpm: 100, loop: false, tail: 0.3,
  inst: {
    lead: I(P.lead, { v: 0.12, vib: 0, lp: 2400 }),
    wah: I(KAZOO, { v: 0.1, vib: 70, vr: 6, vd: 0.12 }),
    low: I(P.bass, { role: 'mel', v: 0.26 }),
    dr: I(P.drums, {}),
  },
  sec: {
    A: {
      chords: 'Am:4 F:3 E:4 Am:5',
      lead: 'a5:1 e5:1 c5:1 a4:1 bb4:3 a4:2 g#4:2 r:5',
      wah: 'r:11 a3:5',
      low: 'a2:4 f2:3 e2:4 a1:5',
      dr: { T: 'x...x..x...x....', th: '...........x....' },
    },
  },
  form: ['A'],
};

TRACKS.gameover = {
  bpm: 80, loop: false, tail: 0.9,
  inst: {
    cel: I(P.celesta, { v: 0.11 }),
    pad: I(P.choir, { v: 0.04, a: 0.25 }),
    bass: I(P.subBass, { v: 0.24 }),
    timp: I(P.timp, { v: 0.3, d: 1.6 }),
  },
  sec: {
    A: {
      chords: 'Dm:4 Gm:4 A7:4 Dm:8', pad: 1,
      cel: 'a5:2 f5:2 bb5:2 d5:2 c#5:2 e5:2 d5:8',
      bass: 'R---R---R---R-------', timp: '................R...',
    },
  },
  form: ['A'],
};

TRACKS.bonusWin = {
  bpm: 150, loop: false, tail: 0.3,
  inst: {
    lead: I(P.lead, { type: 'p12', v: 0.11, lp: 4500, vib: 14, vd: 0.1 }),
    stab: I(P.stab, { v: 0.04 }),
    bass: I(P.bass, { v: 0.26 }),
    dr: I(P.drums, { kit: { c: 0.6 } }),
  },
  sec: {
    A: {
      chords: 'C:8 Am:4 G:4 C:4',
      lead: 'c5:1 e5:1 g5:1 c6:1 e5:1 g5:1 c6:1 e6:1 e6:4 r:2 g5:2 c6:4',
      stab: '........x...x...X...', bass: 'R.R.R.R.R...R...R...',
      dr: { k: 'x.......x...x...x...', s: '........x...x...x...', c: '................x...' },
    },
  },
  form: ['A'],
};

TRACKS.bonusLose = {
  bpm: 150, loop: false, tail: 0.3,
  inst: {
    wah: I(KAZOO, { v: 0.09 }),
    bass: I(P.bass, { v: 0.24 }),
    dr: I(P.drums, {}),
  },
  sec: {
    A: {
      chords: 'Am:8 E:4 Am:8',
      wah: 'e5:2 c5:2 a4:4 bb4:2 g#4:2 a4:8',
      bass: 'R...R...R...R-------',
      dr: { T: 'x.......x...x.......', th: '............x.......' },
    },
  },
  form: ['A'],
};

// Played on the sfx bus over the level music (see sfx('life')).
TRACKS.life = {
  bpm: 150, loop: false, tail: 0.2,
  inst: {
    lead: I(P.lead, { type: 'p12', v: 0.11, lp: 4200, vib: 16, vd: 0.06, rev: 0.3 }),
    cel: I(P.celesta, { v: 0.07 }),
    stab: I(P.stab, { v: 0.035 }),
    bass: I(P.bass, { v: 0.22 }),
  },
  sec: {
    A: {
      chords: 'C:12',
      lead: 'g5:1 c6:1 e6:1 g6:1 e6:1 g6:1 c7:6',
      cel: 'c6:2 e6:2 g6:2 c7:6',
      stab: 'x.....X-----', bass: 'R.....R-----',
    },
  },
  form: ['A'],
};

// ---------------------------------------------------------------- holiday worlds
// Seven holiday worlds, their map, a second cart ride and a second boss. Every
// tune below is an original composition; the holidays are evoked only through
// instrumentation, tempo and style. New drum kinds: sr snare roll, fs/fw
// firework launch/burst, bd/bt bodhran low/tip, sl sleigh bells, bi bird chirp.
const AT = (len, ...at) => { const a = new Array(len).fill('.'); for (const i of at) a[i] = 'x'; return a.join(''); };
const HP = {
  harpsi: { role: 'arp', ring: true, type: 'harpsi', det: 6, v: 0.065, a: 0.002, d: 0.42, s: 0, r: 0.2, lp: 4500, fe: 0.5, fd: 0.1, rev: 0.3, dly: 0.12, pan: -0.2 },
  theremin: { role: 'mel', type: 'soft', v: 0.16, a: 0.08, d: 0.3, s: 0.9, r: 0.3, lp: 3000, pe: -1, pt: 0.12, vib: 40, vr: 6.3, vd: 0.06, rev: 0.5, dly: 0.28, pan: 0.08 },
  fiddle: { role: 'mel', type: 'square', v: 0.065, a: 0.018, d: 0.12, s: 0.8, r: 0.06, lp: 2900, fe: 0.6, fd: 0.08, q: 0.9, vib: 14, vr: 6.2, vd: 0.16, rev: 0.25, dly: 0.1, gate: 0.95 },
  drone: { role: 'mel', type: 'reed', v: 0.03, a: 0.5, d: 0.4, s: 1, r: 0.6, lp: 900, q: 0.5, rev: 0.35, gate: 1 },
  banjo: { role: 'arp', ring: true, type: 'banjo', v: 0.055, a: 0.001, d: 0.22, s: 0, r: 0.1, lp: 3200, fe: 1.4, fd: 0.05, q: 1.6, rev: 0.18, dly: 0.1, pan: 0.3 },
  mallet: { role: 'arp', k: 'bell', ratio: 4, idx: 0.8, idxEnd: 0.05, md: 0.12, d: 0.45, v: 0.085, rev: 0.3, dly: 0.15, pan: 0.2 },
  brassStab: { role: 'stab', type: 'brass', det: 6, v: 0.026, a: 0.01, d: 0.12, s: 0.3, r: 0.06, lp: 1500, fe: 1, fd: 0.06, rev: 0.25, gate: 0.5 },
  tuba: { role: 'bass', type: 'brass', v: 0.15, a: 0.012, d: 0.2, s: 0.6, r: 0.06, lp: 480, fe: 1, fd: 0.1, gate: 0.6 },
  strum: { role: 'stab', type: 'saw', v: 0.04, a: 0.003, d: 0.25, s: 0, r: 0.1, lp: 1700, fe: 2, fd: 0.08, q: 1, rev: 0.25, pan: 0.25, gate: 0.6 },
  strings: { role: 'arp', type: 'saw', det: 10, v: 0.034, a: 0.008, d: 0.12, s: 0.5, r: 0.06, lp: 2400, q: 0.6, rev: 0.35, pan: 0.25, gate: 0.55 },
  brassRiff: { role: 'mel', type: 'brass', det: 6, v: 0.085, a: 0.006, d: 0.1, s: 0.55, r: 0.05, lp: 1200, fe: 1.6, fd: 0.05, q: 1.2, rev: 0.18, gate: 0.8 },
};

// Halloween: B minor, 132 bpm, swung. Harpsichord plucks, a theremin lead with
// wide vibrato and scooped attacks, pizzicato bass, a low tolling bell.
const HW_A = 'f#5:6 g5:2 f#5:4 d5:4 | b4:6 c#5:2 d5:4 e5:4 | g5:8 f#5:2 e5:2 d5:4 | c#5:6 e5:2 a#4:8 | f#5:4 b5:4 a#5:2 b5:2 d6:4 | e6:6 d6:2 b5:4 g5:4 | g5:4 e5:4 c#5:4 b4:2 c#5:2 | a#4:4 c#5:4 e5:4 f#5:4';
const HW_B = 'b4:2 d5:2 g5:2 d5:2 b5:2 a5:2 g5:2 d5:2 | c#5:2 e5:2 a5:2 e5:2 c#6:2 b5:2 a5:2 e5:2 | d5:2 f#5:2 b5:2 a#5:2 b5:2 d6:2 c#6:2 b5:2 | a#5:4 f#5:2 c#5:2 a#4:4 r:4 | g5:2 b5:2 e6:2 b5:2 g5:2 e5:2 g5:2 b5:2 | d6:2 b5:2 g5:2 d5:2 b4:2 d5:2 g5:2 a5:2 | g#5:2 e#5:2 c#5:2 b4:2 c#5:2 e#5:2 g#5:2 b5:2 | a#5:2 g#5:2 f#5:2 e5:2 c#5:2 a#4:2 f#4:4';
TRACKS.halloween = {
  bpm: 132, swing: 0.25, fb: 0.4,
  inst: {
    ther: I(HP.theremin, {}),
    hpsi: I(HP.harpsi, {}),
    hlead: I(HP.harpsi, { role: 'mel', v: 0.075, d: 0.32, pan: 0.15, dly: 0.18 }),
    bass: I(P.pizzBass, { v: 0.3 }),
    organ: I(P.organ, { v: 0.016, lp: 1400, tr: -12 }),
    choir: I(P.choir, { v: 0.028 }),
    toll: I(P.bell, { role: 'arp', tr: -12, v: 0.06, d: 3 }),
    dr: I(P.drums, { kit: { k: 0.5, r: 0.5, h: 0.3, cl: 0.4, t: 0.55, T: 0.55, c: 0.4 } }),
  },
  intro: ['I'],
  sec: {
    I: {
      chords: 'Bm F#7', hpsi: '0.1.2.1.3.1.2.1.', bass: 'R.......5.......', toll: '0' + '.'.repeat(31),
      dr: { k: 'x.......x.......', cl: '..............x.' },
    },
    A: {
      chords: 'Bm Bm/A G F#7 Bm Em C#m7b5 F#7', ther: HW_A, hpsi: '0.1.2.1.3.1.2.1.', bass: 'R...5...O...5...', toll: '0' + '.'.repeat(63),
      dr: { k: 'x.......x.......', r: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', cl: '..............x.' },
      fill: { k: 'x.......x.......', r: '....x...........', t: '........x.x.....', T: '............x.x.' },
    },
    B: {
      chords: 'G A Bm F#/A# Em G C#7 F#7', hlead: HW_B, organ: 1, bass: 'R...3...5...3...',
      ther: 'd5:12 c#5:4 | e5:16 | f#5:12 e5:4 | c#5:16 | g5:12 f#5:4 | d5:16 | e#5:8 g#5:8 | a#5:8 c#6:8',
      dr: { k: 'x.....x.x.......', r: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', cl: '......x.......x.' },
    },
    A2: {
      from: 'A', choir: 1, hpsi: '0.1.2.3.4.3.2.1.',
      dr: { k: 'x.......x..x....', r: '....x.......x...', h: 'x.xxx.x.x.xxx.x.', cl: '......x.......x.', c: CR(8) },
      fill: { k: 'x.......x.......', r: '....x...x.x.xxxx', t: '..........x.....', T: '............x.x.' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// Fourth of July: B flat major march, 120 bpm. Brass lead, tuba and brass
// oom-pah, fife descant, field snare with buzz rolls, fireworks on the beat.
const JL_A = 'f4:3 bb4:1 d5:4 f5:4 d5:4 | eb5:3 d5:1 c5:4 g5:6 eb5:2 | f5:3 d5:1 bb4:4 d5:3 f5:1 bb5:4 | a5:6 g5:2 f5:4 r:4 | d5:3 f5:1 bb5:4 a5:3 g5:1 f5:4 | g5:3 f5:1 eb5:4 bb4:4 eb5:4 | e5:3 f5:1 g5:4 bb5:4 g5:4 | a5:4 c6:4 a5:4 f5:2 eb5:2';
const JL_B = 'g5:8 f5:4 eb5:4 | c6:8 bb5:4 ab5:4 | g5:6 ab5:2 bb5:4 eb5:4 | f5:12 r:4 | g5:8 eb5:4 c5:4 | ab5:6 g5:2 f5:4 c6:4 | a5:6 c6:2 eb6:4 c6:4 | c6:4 a5:2 f5:2 eb5:4 c5:4';
const JL_FIFE = 'd6:4 f6:4 bb5:4 d6:4 | eb6:4 g6:4 bb5:4 eb6:4 | f6:4 d6:4 bb5:4 f6:4 | eb6:4 c6:4 a5:2 bb5:2 c6:2 eb6:2 | f6:8 d6:8 | eb6:8 g6:8 | g6:4 e6:4 c6:4 bb5:4 | a5:4 c6:4 f6:8';
TRACKS.july = {
  bpm: 120,
  inst: {
    brass: I(P.brass, { v: 0.12, lp: 1100 }),
    fife: I(P.whistle, { v: 0.065, vib: 12, rev: 0.25, pan: 0.2 }),
    stab: I(HP.brassStab, {}),
    tuba: I(HP.tuba, {}),
    glock: I(P.celesta, { role: 'arp', v: 0.045, tr: 12 }),
    dr: I(P.drums, { kit: { k: 0.6, s: 0.55, sr: 1, c: 0.5, fw: 1, fs: 1 } }),
  },
  sec: {
    A: {
      chords: 'Bb Eb/Bb Bb F7 Bb Eb C7 F7', brass: JL_A, tuba: 'R...5...R...5...', stab: '..x...x...x...x.',
      dr: { k: 'x.......x.......', s: '....x..g..g.x.gg', sr: AT(32, 24), c: CR(8), fs: AT(128, 60), fw: AT(128, 64) },
    },
    B: {
      chords: 'Eb Ab/Eb Eb Bb7 Cm Ab F7 F7', brass: JL_B, tuba: 'R...5...R...5...', stab: '..x...x...x...x.', glock: '0...............',
      dr: { k: 'x.......x.......', s: 'x..gx.g.x..gx.xx', sr: AT(64, 56), c: CR(4), fs: AT(128, 124), fw: AT(128, 0, 64) },
      fill: { k: 'x.......x.......', s: '....x...x.x.xxxx', sr: 'x...............' },
    },
    A2: {
      from: 'A', fife: JL_FIFE, glock: '0.......2.......',
      dr: { k: 'x.......x.......', s: '....x..g..g.x.gg', sr: AT(32, 8, 24), c: CR(4), fs: AT(128, 60), fw: AT(128, 64, 120) },
      fill: { k: 'x.......x...x...', s: 'X...x...xxxxXXXX', sr: '....x...........', c: '............x...' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// St Patrick's: D mixolydian jig in 6/8 (bar of 12 sixteenths), 156 bpm.
// Square-wave fiddle, tin whistle doubling, reed drones, bodhran, strummed chords.
const PT_A = 'd5:4 f#5:2 a5:2 f#5:2 d5:2 | b5:4 a5:2 g5:2 b5:2 d6:2 | a5:2 f#5:2 d5:2 f#5:2 e5:2 d5:2 | e5:2 g5:2 c6:2 b5:2 g5:2 e5:2 | f#5:4 a5:2 d6:4 a5:2 | b5:2 a5:2 f#5:2 d5:4 f#5:2 | g5:2 b5:2 g5:2 e5:2 c#5:2 e5:2 | d5:4 a4:2 d5:4 e5:2';
const PT_B = 'f#5:2 a5:2 d6:4 c#6:2 d6:2 | e6:4 d6:2 c6:2 g5:2 e5:2 | f#5:2 a5:2 d6:2 e6:2 f#6:4 | g6:2 f#6:2 e6:2 d6:2 b5:2 g5:2 | f#5:4 b5:2 d6:4 b5:2 | c6:2 b5:2 a5:2 g5:2 e5:2 g5:2 | b5:4 g5:2 a5:4 e5:2 | d5:2 f#5:2 a5:2 d6:6';
TRACKS.patrick = {
  bpm: 156, bar: 12,
  inst: {
    fid: I(HP.fiddle, { v: 0.055 }),
    wh: I(P.whistle, { v: 0.09, vib: 10, vd: 0.2, a: 0.015, rev: 0.3, pan: -0.2 }),
    dr1: I(HP.drone, {}),
    dr2: I(HP.drone, { v: 0.022, pan: 0.2 }),
    strum: I(HP.strum, {}),
    bass: I(P.bass, { v: 0.2, gate: 0.6 }),
    drm: I(P.drums, { kit: { bd: 0.6, bt: 0.75 } }),
  },
  intro: ['I'],
  sec: {
    I: { chords: 'D D', dr1: 'd3:24', dr2: 'a3:24', drm: { bd: 'X.g.g.x.g.g.', bt: '..........x.' } },
    A: {
      chords: 'D G D C D Bm G:6 A:6 D', fid: PT_A, dr1: 'd3:96', dr2: 'a3:96', strum: 'x...g.x...g.', bass: 'R.....5.....',
      drm: { bd: 'X.g.g.x.g.g.', bt: '..........x.' },
    },
    A2: {
      from: 'A', wh: PT_A,
      drm: { bd: 'X.g.g.x.g.g.', bt: '..x.....x.x.' },
      fill: { bd: 'X.g.g.X.x.x.', bt: '......xxxxxx' },
    },
    B: {
      chords: 'D C D G Bm C G:6 A:6 D', fid: PT_B, dr1: 'd3:96', dr2: 'a3:96', strum: 'x...g.x...g.', bass: 'R.....5.....',
      drm: { bd: 'X.g.g.X.g.g.', bt: '....x.....x.' },
    },
    B2: {
      from: 'B', wh: PT_B,
      drm: { bd: 'X.g.g.X.g.g.', bt: '..x.x...x.x.' },
      fill: { bd: 'X.....X.x.x.', bt: '..xxxx..xxxx' },
    },
    A3: {
      from: 'A', wh: PT_A, strum: 'x.g.g.x.g.g.',
      drm: { bd: 'X.g.g.X.g.g.', bt: '..x.x...x.x.' },
      fill: { bd: 'X.g.g.X.....', bt: '..x.x.xxxxxx' },
    },
  },
  form: ['A', 'A2', 'B', 'B2', 'A3'],
};

// Easter: G major, 116 bpm. Flute tune over staccato mallets, a bouncing
// clarinet, pizzicato bass, shaker, woodblock and the odd bird.
const ES_A = 'd5:2 r:2 g5:2 r:2 b5:4 a5:2 g5:2 | e5:2 r:2 g5:2 r:2 c6:6 b5:2 | b5:2 a5:2 g5:2 d5:2 g5:2 a5:2 b5:2 d6:2 | a5:8 f#5:4 r:4 | g5:2 r:2 b5:2 r:2 e6:4 d6:2 b5:2 | c6:2 r:2 a5:2 r:2 g5:4 e5:4 | e5:2 a5:2 c6:2 a5:2 d6:2 c6:2 a5:2 f#5:2 | g5:6 r:2 d5:2 e5:2 f#5:2 r:2';
const ES_B = 'g5:6 e5:2 c6:8 | a5:6 f#5:2 d6:8 | b5:4 d6:4 f#6:4 e6:2 d6:2 | e6:12 r:4 | c6:4 b5:2 a5:2 e5:4 a5:4 | f#5:4 a5:2 d6:2 c6:4 a5:4 | b5:4 d6:4 e6:4 g6:4 | e6:4 c6:4 d6:2 c6:2 a5:2 f#5:2';
TRACKS.easter = {
  bpm: 116,
  inst: {
    fl: I(P.flute, { v: 0.13, a: 0.03, d: 0.15, gate: 0.85, vib: 14 }),
    bsn: I(P.clar, { role: 'arp', tr: -12, v: 0.085, lp: 1300, gate: 0.35, s: 0.4, vib: 0, pan: 0.25 }),
    mal: I(HP.mallet, { tr: 12 }),
    bass: I(P.pizzBass, { v: 0.26 }),
    chop: I(P.chop, { v: 0.04, lp: 2200 }),
    pad: I(P.warmPad, { v: 0.026 }),
    dr: I(P.drums, { kit: { k: 0.45, sh: 0.5, w: 0.45, r: 0.4, bi: 1, t: 0.4 } }),
  },
  sec: {
    A: {
      chords: 'G C G D Em C Am:8 D7:8 G', fl: ES_A, mal: '0.2.1.2.0.2.1.2.', bass: 'R...5...R...5...', chop: '..x...x...x...x.',
      dr: { k: 'x.......x.......', sh: '..x...x...x...x.', w: '......x.......x.', bi: AT(128, 46, 110) },
    },
    B: {
      chords: 'C D Bm Em Am D G:8 Em:8 Am:8 D7:8', fl: ES_B, bsn: '0.1.2.1.0.1.2.1.', pad: 1, bass: 'R.......5.......',
      dr: { k: 'x.......x.......', r: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.', bi: AT(128, 62) },
    },
    A2: {
      from: 'A', bsn: '0.2.1.2.0.2.1.2.', pad: 1,
      dr: { k: 'x.......x.....x.', r: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.', w: '......x.......x.', bi: AT(128, 30, 94) },
      fill: { k: 'x.......x.......', r: '....x...x.x.x.x.', t: '..........x.x...', sh: 'x.x.x.x.x.x.x.x.' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// Valentine's: E flat major waltz, 126 bpm. A crooning reed lead with scoops,
// soft bells in sixths, warm pads, harp sweeps and a line-cliche turnaround.
const VL_A = 'g5:8 f5:2 eb5:2 | g5:4 b5:8 | c6:8 bb5:2 g5:2 | db6:8 c6:2 bb5:2 | c6:4 ab5:4 eb5:4 | cb6:8 bb5:2 ab5:2 | g5:4 bb5:4 eb6:4 | d6:6 c6:2 bb5:2 ab5:2';
const VL_H = 'eb5:8 d5:2 c5:2 | eb5:4 g5:8 | g5:8 g5:2 eb5:2 | bb5:8 ab5:2 g5:2 | ab5:4 eb5:4 c5:4 | ab5:8 gb5:2 eb5:2 | eb5:4 g5:4 bb5:4 | bb5:6 ab5:2 f5:2 d5:2';
const VL_B = 'eb6:8 d6:2 c6:2 | d6:4 b5:4 g5:4 | c6:8 bb5:2 g5:2 | a5:8 c6:4 | ab5:4 c6:4 eb6:4 | d6:6 c6:2 bb5:2 ab5:2 | bb5:8 g5:2 eb5:2 | f5:4 ab5:4 d6:4';
TRACKS.valentine = {
  bpm: 126, bar: 12, fb: 0.38,
  inst: {
    lead: I(P.clar, { v: 0.13, lp: 2400, vib: 20, vr: 5.2, vd: 0.14, pe: -0.7, pt: 0.08, a: 0.04, r: 0.2, rev: 0.4, dly: 0.2 }),
    bells: I(P.celesta, { v: 0.075, d: 1.4, idx: 1.2, pan: 0.2 }),
    cel: I(P.celesta, { role: 'arp', v: 0.045, tr: 12, idx: 1, pan: -0.2 }),
    harp: I(P.harp, { v: 0.075, d: 0.42 }),
    pad: I(P.warmPad, { v: 0.04, r: 0.4 }),
    pad2: I(P.pad, { v: 0.015, lp: 1400, r: 0.35 }),
    bass: I(P.pizzBass, { v: 0.28 }),
    chop: I(P.chop, { type: 'tri', v: 0.05, lp: 1500 }),
    dr: I(P.drums, { kit: { k: 0.35, b: 0.6, sh: 0.4, c: 0.3 } }),
  },
  sec: {
    A: {
      chords: 'Eb Ebaug Eb6 Eb7 Ab Abm Eb/Bb Bb7', lead: VL_A, pad: 1, bass: 'R...........', chop: '....x...x...',
      dr: { k: 'x...........', b: '....x...x...' },
    },
    B: {
      chords: 'Cm G7/B Cm/Bb F/A Fm7 Bb7 Eb Bb7', lead: VL_B, pad: 1, pad2: 1, harp: '0.1.2.3.2.1.', bass: 'R...........', chop: '....x...x...',
      dr: { k: 'x...........', b: '....x...x...', sh: '..x...x...x.' },
    },
    A2: {
      from: 'A', bells: VL_H, cel: '0...1...2...', harp: '.'.repeat(84) + '0123456789ab',
      dr: { k: 'x...........', b: '....x...x...', sh: '..x...x...x.', c: CR(8, 12) },
    },
    B2: {
      from: 'B', cel: '0...2...1...', harp: '0.1.2.3.4.3.',
      dr: { k: 'x...........', b: '....x.x.x...', sh: '..x...x...x.' },
    },
  },
  form: ['A', 'B', 'A2', 'B2'],
};

// Thanksgiving: D major folk, 104 bpm. Banjo rolls, harmonica-ish reed lead,
// a sawing fiddle harmony, strummed guitar, accordion and upright bass.
const TH_A = 'f#5:4 e5:2 d5:2 a4:4 d5:4 | b4:4 d5:4 g5:6 f#5:2 | f#5:4 a5:4 f#5:2 e5:2 d5:4 | e5:12 r:4 | f#5:4 e5:2 d5:2 b4:4 d5:4 | g5:6 a5:2 b5:4 a5:2 g5:2 | f#5:4 d5:4 e5:4 c#5:4 | d5:12 r:4';
const TH_H = 'd5:4 c#5:2 a4:2 f#4:4 a4:4 | g4:4 b4:4 d5:6 d5:2 | d5:4 f#5:4 d5:2 c#5:2 a4:4 | c#5:12 r:4 | d5:4 c#5:2 b4:2 f#4:4 b4:4 | d5:6 f#5:2 g5:4 f#5:2 d5:2 | d5:4 a4:4 c#5:4 a4:4 | a4:12 r:4';
const TH_B = 'b5:4 a5:2 g5:2 d5:4 g5:4 | a5:6 g5:2 e5:4 c#5:4 | c#6:4 a5:2 f#5:2 e5:4 f#5:4 | d6:12 r:4 | b5:4 d6:4 b5:2 a5:2 g5:4 | a5:4 c#6:4 e6:4 c#6:4 | d6:4 a5:4 b5:4 f#5:4 | g5:4 e5:4 c#5:4 e5:4';
TRACKS.thanks = {
  bpm: 104, fb: 0.3,
  inst: {
    lead: I(P.clar, { v: 0.13, lp: 2100, vib: 10, trem: 0.12, trr: 5.5, rev: 0.32 }),
    fid: I(HP.fiddle, { type: 'saw', v: 0.055, lp: 2200, pan: -0.25 }),
    banjo: I(HP.banjo, {}),
    strum: I(HP.strum, {}),
    acc: I(P.organ, { type: 'reed', det: 14, v: 0.018, lp: 1700 }),
    bass: I(P.pizzBass, { v: 0.28 }),
    dr: I(P.drums, { kit: { k: 0.45, b: 0.6, sh: 0.4, r: 0.35, t: 0.4 } }),
  },
  sec: {
    A: {
      chords: 'D G D A Bm G D:8 A:8 D', lead: TH_A, banjo: '0240240202402402', strum: '....x.......x...', bass: 'R.......5.......',
      dr: { k: 'x.......x.......', b: '....x.......x...', sh: '..x...x...x...x.' },
    },
    B: {
      chords: 'G A F#m Bm G A D:8 Bm:8 Em:8 A7:8', lead: TH_B, banjo: '0240240202402402', acc: 1, strum: '....x.......x...', bass: 'R...5...R...5...',
      dr: { k: 'x.......x.......', b: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.' },
    },
    A2: {
      from: 'A', fid: TH_H, acc: 1, banjo: '0240240204202420',
      dr: { k: 'x.......x.....x.', b: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.', r: '..............x.' },
      fill: { k: 'x.......x.......', b: '....x...x.x.x.x.', t: '..........x.x...' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// Christmas: E minor lifting to E major, 108 bpm. Music-box lead, harp,
// choir and strings, sleigh bells, a flute counter-line and timpani at the lift.
const XM_A = 'b5:4 e6:4 g6:4 f#6:2 e6:2 | e6:4 g5:4 c6:6 b5:2 | d6:4 b5:4 g5:4 b5:2 d6:2 | f#6:8 e6:4 d6:4 | g6:4 f#6:2 e6:2 b5:4 e6:4 | c6:4 e6:4 a6:4 g6:2 e6:2 | e6:4 f#6:4 d#6:4 a5:4 | e6:8 b5:4 g5:4';
const XM_B = 'g#5:4 b5:4 e6:6 d#6:2 | c#6:4 e6:4 a6:6 g#6:2 | g#6:4 f#6:2 e6:2 b5:8 | d#6:4 f#6:4 b6:8 | g#6:6 e6:2 c#6:4 e6:4 | a6:4 e6:4 c#6:4 a5:4 | a5:4 c#6:4 d#6:4 f#6:4 | e6:12 r:4';
TRACKS.christmas = {
  bpm: 108, fb: 0.42,
  inst: {
    box: I(P.celesta, { v: 0.12, d: 1.3, rev: 0.5 }),
    harp: I(P.harp, { v: 0.07 }),
    fl: I(P.flute, { v: 0.09, lp: 2400 }),
    choir: I(P.choir, { v: 0.034, r: 0.35 }),
    pad: I(P.pad, { v: 0.018, lp: 1100, r: 0.35 }),
    bass: I(P.pizzBass, { v: 0.26 }),
    timp: I(P.timp, { v: 0.22 }),
    dr: I(P.drums, { kit: { sl: 1, k: 0.4, T: 0.5, c: 0.35 } }),
  },
  sec: {
    A: {
      chords: 'Em C G D Em Am B7sus4:8 B7:8 Em', box: XM_A, pad: 1, harp: '0.1.2.1.0.1.2.1.', bass: 'R.......5.......',
      dr: { sl: 'x...x...x...x...', k: 'x.........x.....' },
    },
    A2: {
      from: 'A', choir: 1, pad: 0,
      fl: 'g4:8 b4:8 | c5:8 e5:8 | d5:8 b4:8 | a4:8 f#4:8 | e5:8 g5:8 | e5:8 c5:8 | e5:8 d#5:8 | e5:16',
      dr: { sl: 'X.x.x.x.X.x.x.x.', k: 'x.........x.....' },
      fill: { sl: 'X.x.x.x.X.xxxxxx', k: 'x.........x.....', T: '............x.x.' },
    },
    B: {
      chords: 'E A/E E B C#m A F#m7:8 B7:8 E', box: XM_B, choir: 1, harp: '0.1.2.3.4.3.2.1.', bass: 'R...5...O...5...', timp: 'R...............',
      fl: 'e5:8 g#5:8 | a5:8 c#6:8 | b5:8 g#5:8 | f#5:8 d#5:8 | e5:8 c#5:8 | e5:8 a5:8 | f#5:8 a5:8 | g#5:16',
      dr: { sl: 'X.xgx.xgX.xgx.xg', k: 'x.......x.......', c: CR(8) },
      fill: { sl: 'X.xgx.xgX.xxxxxx', k: 'x.......x.......', T: '........x.x.x.x.' },
    },
  },
  form: ['A', 'A2', 'B'],
};

// The seven-worlds map: C major with lydian and mixolydian colour, 116 bpm.
// Brass theme over driving strings, horns, choir, celesta and timpani.
const WD_A = 'c5:6 g5:2 g5:4 e5:4 | f#5:6 a5:2 d6:8 | b5:4 a5:2 g5:2 d5:4 g5:4 | f5:4 bb5:4 d6:6 c6:2 | c6:6 a5:2 f5:8 | e5:4 g5:4 c6:4 e6:4 | d6:6 c6:2 c6:4 d6:4 | e6:8 r:4 g5:4';
const WD_B = 'e5:4 a5:4 c6:6 b5:2 | a5:4 f5:4 c6:8 | g5:4 e5:4 c6:4 e6:4 | d6:12 b5:4 | c6:4 a5:4 e6:6 d6:2 | c6:6 a5:2 f5:4 a5:4 | g5:4 a5:4 f#5:4 a5:4 | b5:4 d6:4 f6:4 d6:4';
TRACKS.worlds = {
  bpm: 116, fb: 0.34,
  inst: {
    brass: I(P.brass, { v: 0.12, lp: 1100 }),
    horn: I(P.brass, { v: 0.065, tr: -12, lp: 700, pan: -0.2 }),
    str: I(HP.strings, {}),
    pad: I(P.pad, { v: 0.02, r: 0.35 }),
    choir: I(P.choir, { v: 0.03, r: 0.35 }),
    bell: I(P.celesta, { role: 'arp', v: 0.05, tr: 12 }),
    bass: I(P.subBass, { v: 0.16 }),
    timp: I(P.timp, { v: 0.26 }),
    dr: I(P.drums, { kit: { k: 0.6, s: 0.5, c: 0.5, T: 0.55, t: 0.55, sr: 0.7 } }),
  },
  intro: ['I'],
  sec: {
    I: {
      chords: 'C D/C', brass: 'g4:3 g4:1 c5:4 e5:4 g5:4 | f#5:8 a5:8', str: '0120120120120120', timp: 'R.......R.....R.',
      dr: { T: 'x...............x...x...x...x.x.', sr: AT(32, 24) },
    },
    A: {
      chords: 'C D/C G/B Bb F C/E Dm7:8 G7sus4:8 C', brass: WD_A, str: '0120120120120120', pad: 1, bass: 'R-------5-------', timp: 'R...............',
      dr: { k: 'x.......x.......', s: '....x.......x...', c: CR(8) },
    },
    B: {
      chords: 'Am F C G Am F Dsus4:8 D:8 G7', brass: WD_B, str: '0.1.2.1.0.1.2.1.', choir: 1, bell: '0.......2.......', bass: 'R-------O-------', timp: 'R.......5.......',
      dr: { k: 'x.....x.x.......', s: '....x.......x...', T: '............x.x.', c: CR(4) },
      fill: { k: 'x.....x.x.......', s: '....x...x.x.x.x.', sr: '........x.......' },
    },
    A2: {
      from: 'A', horn: WD_A, choir: 1, pad: 0, bell: '0...2...4...2...',
      dr: { k: 'x.......x.x.....', s: '....x.......x...', sr: AT(64, 56), c: CR(4) },
      fill: { k: 'x.......x.......', s: '....x...xxxxXXXX', T: 'x.......x...x.x.' },
    },
  },
  form: ['A', 'B', 'A2'],
};

// Second cauldron ride: F sharp minor, 168 bpm. Tresillo bass and stabs,
// four-on-the-floor kick, offbeat open hats, a pulse lead doubled low in saw.
const RD_A = 'c#5:2 f#5:2 a5:3 g#5:3 f#5:2 e5:2 f#5:2 | d5:3 f#5:3 a5:2 d6:4 c#6:2 a5:2 | b5:3 g#5:3 e5:2 b4:2 e5:2 g#5:2 b5:2 | a5:6 c#6:2 f#6:8 | f#5:2 a5:2 c#6:3 b5:3 a5:2 g#5:2 a5:2 | f#5:3 a5:3 d6:2 f#6:4 e6:2 d6:2 | e6:3 d6:3 b5:2 g#5:4 e5:4 | e#5:2 g#5:2 b5:2 c#6:2 e#6:4 g#6:4';
const RD_B = 'a5:6 f#5:2 d6:4 a5:4 | b5:6 g#5:2 e6:4 b5:4 | c#6:6 g#5:2 e6:4 c#6:4 | f#6:8 e6:4 c#6:4 | d6:3 c#6:3 b5:2 f#5:4 b5:4 | g#5:3 a5:3 b5:2 e6:8 | c#6:3 b5:3 a5:2 e5:4 a5:4 | g#5:2 b5:2 c#6:2 e#6:2 g#6:4 e#6:4';
TRACKS.ride = {
  bpm: 168,
  inst: {
    lead: I(P.lead, { v: 0.13, lp: 3400, vib: 9, vr: 6.5, vd: 0.12 }),
    lead2: I(P.lead, { type: 'saw', v: 0.045, tr: -12, lp: 1600, vib: 0, pan: 0.3, dly: 0.1 }),
    arp: I(P.pluck, { tr: 12, v: 0.065, lp: 800 }),
    bass: I(P.sawBass, { v: 0.14, lp: 600 }),
    stab: I(P.stab, { v: 0.036 }),
    pad: I(P.pad, { v: 0.016, lp: 1600, r: 0.3 }),
    dr: I(P.drums, { kit: { k: 0.55, s: 0.55, h: 0.35, o: 0.75, c: 0.45, t: 0.55, T: 0.55 } }),
  },
  intro: ['I'],
  sec: {
    I: {
      chords: 'F#m F#m', bass: 'R..R..R.R..R..O.',
      dr: { k: 'x...x...x...x...', h: '..o...o...o...o.', t: AT(32, 24, 26, 28), T: AT(32, 29, 30, 31) },
    },
    A: {
      chords: 'F#m D E F#m F#m D E C#7', lead: RD_A, bass: 'R..R..R.R..R..O.', stab: 'X..x..x.....x...',
      dr: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.', c: CR(8) },
    },
    A2: {
      from: 'A', lead2: RD_A, arp: '0123321001233210',
      fill: { k: 'x...x...x...x...', s: '....x...x.xxxxXX', T: '........x.x.x.x.' },
    },
    B: {
      chords: 'D E C#m F#m Bm E A C#7', lead: RD_B, pad: 1, bass: 'R..R..R.R..R..O.', stab: 'X.......X..x..x.',
      dr: { k: 'x...x...x...x...', s: '....x..x....x...', h: 'xxo.xxo.xxo.xxo.', c: CR(4) },
    },
    B2: {
      from: 'B', lead2: RD_B, arp: '0.1.2.3.4.3.2.1.',
      fill: { k: 'x...x...x...x...', s: '....x...xxxxXXXX', t: '........x.x.....', T: '............x.x.' },
    },
  },
  form: ['A', 'A2', 'B', 'B2'],
};

// Second boss: F minor with a Neapolitan G flat, 184 bpm. A low brass ostinato
// with tritone kicks, screaming pulse lead, choir, harpsichord, tolling bell.
const BS_RIFF = 'f3:2 f3:1 f3:1 ab3:2 f3:2 b3:2 c4:2 ab3:2 g3:2 | f3:2 f3:1 f3:1 ab3:2 f3:2 c4:2 db4:2 c4:2 bb3:2 | db4:2 db4:1 db4:1 f4:2 db4:2 ab3:2 f3:2 ab3:2 c4:2 | c4:2 c4:1 c4:1 e4:2 c4:2 g3:2 e3:2 g3:2 bb3:2 | f3:2 f3:1 f3:1 ab3:2 f3:2 b3:2 c4:2 ab3:2 g3:2 | f3:2 f3:1 f3:1 ab3:2 f3:2 c4:2 db4:2 c4:2 bb3:2 | gb3:2 gb3:1 gb3:1 bb3:2 gb3:2 db4:2 c4:2 bb3:2 db4:2 | c4:2 c4:1 c4:1 e4:2 g4:2 bb4:2 c5:2 bb4:2 g4:2';
const BS_LEAD = 'f5:4 ab5:4 c6:8 | b5:8 c6:4 db6:4 | f6:8 eb6:4 db6:4 | e6:12 c6:4 | f6:4 eb6:2 db6:2 c6:4 ab5:4 | b5:4 c6:4 db6:4 e6:4 | gb6:8 f6:4 db6:4 | e6:4 c6:4 bb5:4 g5:4';
const BS_B = 'bb5:6 c6:2 db6:8 | db6:4 bb5:4 gb5:8 | ab5:6 bb5:2 c6:8 | f6:8 eb6:4 db6:4 | db6:6 eb6:2 f6:8 | gb6:6 f6:2 db6:8 | e6:4 g6:4 c6:4 e6:4 | bb5:2 c6:2 e6:2 g6:2 bb6:4 g6:4';
TRACKS.boss2 = {
  bpm: 184,
  inst: {
    riff: I(HP.brassRiff, {}),
    lead: I(P.lead, { type: 'p12', v: 0.13, lp: 4000, vib: 16, vr: 7, vd: 0.1, rev: 0.3 }),
    hpsi: I(HP.harpsi, { ring: false, d: 0.16, r: 0.06, v: 0.05, tr: 12, gate: 0.9, pan: 0.25 }),
    choir: I(P.choir, { v: 0.038, r: 0.22 }),
    sub: I(P.subBass, { v: 0.12 }),
    bass: I(P.sawBass, { v: 0.14, lp: 480 }),
    stab: I(P.stab, { v: 0.04 }),
    toll: I(P.bell, { role: 'arp', tr: -12, v: 0.07, d: 2.6 }),
    timp: I(P.timp, { v: 0.24, d: 0.8 }),
    dr: I(P.drums, { kit: { k: 0.45, s: 0.6, h: 0.35, c: 0.5, T: 0.6, t: 0.6 } }),
  },
  intro: ['I'],
  sec: {
    I: {
      chords: 'Fm C7', riff: 'f3:2 f3:1 f3:1 ab3:2 f3:2 b3:2 c4:2 ab3:2 g3:2 | c4:2 c4:1 c4:1 e4:2 g4:2 bb4:2 c5:2 bb4:2 g4:2',
      toll: '0...............0...............', timp: 'R.......R.......',
      dr: { k: 'x...x...x...x...', t: AT(32, 24, 26, 28), T: AT(32, 29, 30, 31) },
    },
    A: {
      chords: 'Fm Fm Db C Fm Fm Gb C7', riff: BS_RIFF, choir: 1, hpsi: '0123012301230123', sub: 'R-------R-------', timp: '........R.......',
      dr: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: CR(8) },
    },
    A2: {
      from: 'A', lead: BS_LEAD, toll: '0' + '.'.repeat(127),
      dr: { k: 'x.xx..x.x.xx..x.', s: '....x.......x...', h: 'x.x.x.x.x.xxx.x.', c: CR(8) },
      fill: { k: 'x...x...x.x.x.x.', s: '....x...x.x.x.xX', T: '........x...x...' },
    },
    B: {
      chords: 'Bbm Gb Fm Db Bbm Gb C C7', lead: BS_B, choir: 1, bass: 'R.R.R.R.O.R.R.R.', timp: '........R.......',
      dr: { k: 'x..x....x.x.....', s: '........x.......', h: '..x.x.x.x.x.x.x.', T: '..............x.', c: CR(8) },
    },
    B2: {
      from: 'B', choir: 0, stab: 'x...x...X..x..x.', hpsi: '0.1.2.3.0.1.2.3.', toll: '0' + '.'.repeat(63),
      dr: { k: 'x.xx..x.x.xx..x.', s: '....x.......x...', h: 'x.x.x.x.x.xxx.x.', c: CR(8) },
      fill: { k: 'x...x...x.x.x.x.', s: '....x...x.x.x.xX', t: '........x.x.....', T: '............x...' },
    },
  },
  form: ['A', 'A2', 'B', 'B2'],
};

// ---------------------------------------------------------------- sound effects
// Each entry: (graph, startTime, opts). All route through the sfx bus.
const T = (g, t, o) => voice(g, g.sch, t, o, false);
const N = (g, t, o) => noise(g, g.sch, t, o, false);
const B = (g, t, o) => bell(g, g.sch, t, o, false);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

function playJingleOnSfx(g, name, t) {
  const p = new Player(g, name, { out: g.sfx, revIn: g.sRevIn, music: false, live: false });
  p.t0 = t;
  p.tick(t, 4);
  if (g === G) setTimeout(() => kill(p.nodes), 4000);
}

const SFX = {
  jump(g, t) {
    const f = jit(150, 0.04);
    T(g, t, { type: 'p25', f, f2: f * 2.6, gl: 0.13, v: 0.17, a: 0.004, d: 0.16, lp: 2200 });
    T(g, t, { type: 'tri', f: f / 2, f2: f * 1.3, gl: 0.1, v: 0.24, d: 0.12 });
    N(g, t, { lp: 900, d: 0.05, v: 0.12 });
  },
  jumpPip(g, t) {
    const f = jit(420, 0.04);
    T(g, t, { type: 'p12', f, f2: f * 2.5, gl: 0.09, v: 0.22, d: 0.12, lp: 5000 });
    T(g, t + 0.05, { type: 'sine', f: 1300, f2: 1750, gl: 0.05, v: 0.12, d: 0.06 });
  },
  land(g, t) {
    N(g, t, { lp: 520, d: 0.07, v: 0.38 });
    T(g, t, { type: 'sine', f: jit(110), f2: 55, gl: 0.08, d: 0.09, v: 0.32 });
  },
  roll(g, t) {
    N(g, t, { bp: 450, bp2: 2300, sw: 0.16, bq: 1.4, a: 0.07, d: 0.14, v: 0.45 });
    N(g, t + 0.13, { bp: 2200, bp2: 600, sw: 0.2, bq: 1.4, a: 0.01, d: 0.18, v: 0.3 });
  },
  stomp(g, t) {
    N(g, t, { lp: 700, d: 0.06, v: 0.4 });
    T(g, t, { type: 'square', f: 340, f2: 110, gl: 0.07, d: 0.08, v: 0.12, lp: 1500 });
    T(g, t + 0.06, { type: 'tri', f: jit(180), f2: 540, gl: 0.18, d: 0.25, v: 0.26, vib: 60, vr: 22 });
  },
  bounce(g, t) {
    const f = jit(160);
    T(g, t, { type: 'tri', f, f2: f * 4, gl: 0.2, a: 0.003, d: 0.3, v: 0.28, vib: 80, vr: 16 });
    T(g, t, { type: 'p25', f: f * 2, f2: f * 8, gl: 0.2, d: 0.15, v: 0.05, lp: 3000 });
  },
  enemyDie(g, t) {
    N(g, t, { bp: 1800, bp2: 300, sw: 0.3, bq: 0.9, a: 0.01, d: 0.3, v: 0.4 });
    T(g, t, { type: 'sine', f: jit(700), f2: 140, gl: 0.25, d: 0.22, v: 0.17 });
    B(g, t + 0.06, { f: 1568, ratio: 2, idx: 1, d: 0.4, v: 0.05, rev: 0.3 });
  },
  wisp(g, t, o) {
    const n = (((o.chain | 0) % 10) + 10) % 10;
    const f = midiHz(81 + PENTA[n]);
    B(g, t, { f, ratio: 2, idx: 1.2, d: 0.55, v: 0.2, rev: 0.25, dly: 0.12 });
    T(g, t, { type: 'sine', f: f * 2, d: 0.1, v: 0.08 });
    T(g, t + 0.04, { type: 'sine', f: f * 1.5, d: 0.2, v: 0.06, rev: 0.3 });
  },
  wispBunch(g, t) {
    for (let i = 0; i < 6; i++) {
      const f = midiHz(81 + PENTA[i + 2]);
      B(g, t + i * 0.045, { f, ratio: 2, idx: 1.1, d: 0.5, v: 0.075, rev: 0.3, dly: i === 5 ? 0.2 : 0 });
    }
    N(g, t, { hp: 8000, a: 0.08, d: 0.25, v: 0.04, trem: 0.8, trr: 24 });
  },
  letter(g, t, o) {
    const idx = Math.max(0, Math.min(3, o.index | 0));
    const f = midiHz([74, 77, 81, 86][idx]);
    B(g, t, { f, ratio: 3.5, idx: 2, d: 1.0, v: 0.1, rev: 0.4, dly: 0.2 });
    B(g, t + 0.07, { f: f * 1.5, ratio: 3.5, idx: 1.5, d: 0.8, v: 0.06, rev: 0.4 });
    B(g, t + 0.14, { f: f * 2, ratio: 2, idx: 1, d: 0.7, v: 0.05, rev: 0.4 });
    N(g, t, { hp: 7500, a: 0.05, d: 0.3, v: 0.035, trem: 0.7, trr: 20 });
  },
  letterComplete(g, t) {
    [74, 77, 81, 86, 89, 93].forEach((m, i) => {
      B(g, t + i * 0.055, { f: midiHz(m), ratio: 3, idx: 1.5, d: 0.6, v: 0.08, rev: 0.35 });
      T(g, t + i * 0.055, { type: 'p25', f: midiHz(m), d: 0.06, v: 0.04, lp: 4000 });
    });
    for (const m of [86, 89, 93]) B(g, t + 0.36, { f: midiHz(m), ratio: 2, idx: 1, d: 0.9, v: 0.05, rev: 0.45, dly: 0.2 });
  },
  page(g, t) {
    for (let i = 0; i < 7; i++) N(g, t + i * 0.028 + rnd(0, 0.008), { bp: rnd(2500, 4500), bq: 1.5, d: 0.02, v: 0.12 });
    for (const m of [62, 69, 74, 77]) {
      T(g, t + 0.12, { type: 'saw', det: 12, f: midiHz(m), a: 0.12, d: 0.3, s: 0.8, dur: 0.55, r: 0.3, form: [700, 1150], fq: 7, fg: 3.5, vib: 10, vr: 5, v: 0.05, rev: 0.5 });
    }
    B(g, t + 0.12, { f: midiHz(86), ratio: 2, idx: 1, d: 0.8, v: 0.04, rev: 0.5 });
  },
  life(g, t) { playJingleOnSfx(g, 'life', t); },
  hurt(g, t) {
    N(g, t, { lp: 420, d: 0.12, v: 0.48 });
    T(g, t, { type: 'sine', f: 140, f2: 55, gl: 0.15, d: 0.18, v: 0.38 });
    T(g, t + 0.03, { type: 'square', f: jit(520), f2: 300, gl: 0.3, d: 0.35, v: 0.08, lp: 1800, vib: 90, vr: 13 });
  },
  tagSwap(g, t) {
    N(g, t, { bp: 300, bp2: 3500, sw: 0.18, bq: 1.2, a: 0.12, d: 0.1, v: 0.24 });
    T(g, t + 0.17, { type: 'sine', f: 350, f2: 1100, gl: 0.05, d: 0.08, v: 0.24 });
    T(g, t + 0.19, { type: 'p25', f: 1320, d: 0.06, v: 0.05 });
  },
  partnerFree(g, t) {
    N(g, t, { hp: 2500, d: 0.04, v: 0.34 });
    N(g, t + 0.015, { bp: 3800, bq: 3, d: 0.05, v: 0.24 });
    B(g, t, { f: 430, ratio: 2.76, idx: 4, d: 0.5, v: 0.09 });
    T(g, t + 0.18, { type: 'sine', f: 1200, f2: 1800, gl: 0.06, d: 0.08, v: 0.14 });
    T(g, t + 0.3, { type: 'sine', f: 1500, f2: 2300, gl: 0.07, d: 0.12, v: 0.14, vib: 40, vr: 30 });
  },
  pickup(g, t) {
    T(g, t, { type: 'saw', f: jit(150), f2: 115, gl: 0.14, a: 0.01, d: 0.14, v: 0.16, form: [600, 1000], fq: 5, fg: 3 });
    B(g, t + 0.08, { f: 310, ratio: 1.41, idx: 3.5, d: 0.35, v: 0.11 });
    N(g, t + 0.08, { bp: 2000, bq: 2, d: 0.03, v: 0.2 });
  },
  throw(g, t) {
    N(g, t, { bp: 1800, bp2: 350, sw: 0.25, bq: 1.3, a: 0.03, d: 0.22, v: 0.45 });
    T(g, t, { type: 'sine', f: 300, f2: 150, gl: 0.2, d: 0.15, v: 0.08 });
  },
  cauldronBreak(g, t) {
    N(g, t, { hp: 1800, d: 0.05, v: 0.42 });
    for (let i = 0; i < 3; i++) N(g, t + 0.02 + i * 0.025, { bp: rnd(2500, 5000), bq: 4, d: 0.03, v: 0.2 });
    B(g, t, { f: jit(260), ratio: 2.76, idx: 5, d: 0.7, v: 0.1 });
    B(g, t, { f: jit(410), ratio: 1.6, idx: 2, d: 0.5, v: 0.06 });
    N(g, t + 0.06, { lp: 3000, lp2: 400, sw: 0.4, a: 0.02, d: 0.35, v: 0.26 });
    for (let i = 0; i < 3; i++) T(g, t + 0.1 + i * 0.07, { type: 'sine', f: rnd(400, 900), pe: -8, pt: 0.03, d: 0.08, v: 0.1 });
  },
  ironClang(g, t) {
    const f = jit(220);
    B(g, t, { f, ratio: 2.76, idx: 6, d: 0.9, v: 0.12, rev: 0.2 });
    B(g, t, { f: f * 2.41, ratio: 1.41, idx: 2, d: 0.6, v: 0.07 });
    N(g, t, { bp: 3000, bq: 1.5, d: 0.04, v: 0.28 });
    T(g, t, { type: 'sine', f: 90, f2: 60, gl: 0.1, d: 0.1, v: 0.24 });
  },
  blastEnter(g, t) {
    T(g, t, { type: 'sine', f: 160, f2: 55, gl: 0.12, d: 0.16, v: 0.48 });
    N(g, t, { lp: 500, d: 0.08, v: 0.38 });
    T(g, t, { type: 'tri', f: 240, d: 0.06, v: 0.14 });
    B(g, t + 0.02, { f: 180, ratio: 2.76, idx: 3, d: 0.4, v: 0.06 });
  },
  blastFire(g, t) {
    T(g, t, { type: 'sine', f: 110, f2: 30, gl: 0.5, a: 0.003, d: 0.55, v: 0.55 });
    N(g, t, { lp: 1600, lp2: 150, sw: 0.6, d: 0.55, v: 0.45 });
    N(g, t + 0.02, { bp: 2500, bp2: 600, sw: 0.5, bq: 0.8, a: 0.04, d: 0.4, v: 0.25, rev: 0.2 });
  },
  checkpoint(g, t) {
    for (let i = 0; i < 8; i++) T(g, t + i * 0.05 + rnd(0, 0.02), { type: 'sine', f: rnd(260, 520) * (1 + i * 0.08), pe: -9, pt: 0.035, d: 0.07, v: 0.12 });
    [76, 81, 84, 88, 93].forEach((m, i) => B(g, t + 0.3 + i * 0.07, { f: midiHz(m), ratio: 3, idx: 1.5, d: 0.6, v: 0.065, rev: 0.35, dly: 0.2 }));
  },
  bonusEnter(g, t) {
    T(g, t, { type: 'sine', f: 300, f2: 1500, gl: 0.7, a: 0.05, d: 0.4, s: 0.8, dur: 0.6, r: 0.25, v: 0.14, vib: 120, vr: 9, rev: 0.4, dly: 0.3 });
    T(g, t, { type: 'tri', f: 450, f2: 2250, gl: 0.7, a: 0.05, d: 0.4, s: 0.8, dur: 0.6, r: 0.25, v: 0.07, trem: 0.8, trr: 14 });
    [0, 0.15, 0.3, 0.45].forEach((d, i) => B(g, t + d, { f: midiHz(79 + i * 5), ratio: 3.5, idx: 2, d: 0.5, v: 0.05, rev: 0.4 }));
  },
  explosion(g, t) {
    T(g, t, { type: 'sine', f: 85, f2: 25, gl: 0.8, a: 0.004, d: 0.9, v: 0.6 });
    N(g, t, { lp: 2400, lp2: 120, sw: 1.0, a: 0.004, d: 0.95, v: 0.55, rev: 0.25 });
    N(g, t, { hp: 3000, d: 0.15, v: 0.28 });
    for (let i = 0; i < 6; i++) N(g, t + 0.1 + rnd(0, 0.5), { bp: rnd(800, 3000), bq: 3, d: 0.03, v: 0.14 });
  },
  torch(g, t) {
    N(g, t, { bp: 700, bp2: 2600, sw: 0.2, bq: 0.8, a: 0.06, d: 0.3, v: 0.45 });
    N(g, t, { lp: 400, a: 0.04, d: 0.3, v: 0.24 });
  },
  crow(g, t) {
    const f = jit(640, 0.06);
    T(g, t, { type: 'saw', f, f2: f * 0.73, gl: 0.22, a: 0.015, d: 0.18, s: 0.5, dur: 0.2, r: 0.05, form: [1000, 1500], fq: 5, fg: 3, v: 0.22, vib: 70, vr: 38 });
  },
  bossHit(g, t) {
    T(g, t, { type: 'sine', f: 120, f2: 40, gl: 0.2, d: 0.3, v: 0.55 });
    N(g, t, { lp: 1200, d: 0.18, v: 0.45 });
    B(g, t, { f: 180, ratio: 2.41, idx: 6, d: 0.7, v: 0.12, rev: 0.25 });
    B(g, t + 0.01, { f: 463, ratio: 1.53, idx: 3, d: 0.5, v: 0.06 });
    N(g, t, { hp: 4000, d: 0.06, v: 0.24 });
  },
  bossDie(g, t) {
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.17;
      B(g, tt, { f: 300 * Math.pow(0.85, i), ratio: 2.76, idx: 5, d: 0.6, v: 0.1 });
      N(g, tt, { lp: 900, d: 0.15, v: 0.32 });
      T(g, tt, { type: 'sine', f: 100 * Math.pow(0.9, i), f2: 38, gl: 0.15, d: 0.2, v: 0.3 });
    }
    N(g, t, { lp: 300, a: 0.2, d: 1.2, s: 0.6, dur: 1.1, r: 0.5, v: 0.28 });
    [74, 78, 81, 86].forEach((m, i) => T(g, t + 1.15 + i * 0.09, { type: 'p25', f: midiHz(m), d: 0.2, s: 0.5, dur: 0.08, r: 0.05, v: 0.09, lp: 3500 }));
    for (const m of [74, 78, 81]) T(g, t + 1.51, { type: 'p25', f: midiHz(m), a: 0.01, d: 0.3, s: 0.7, dur: 0.45, r: 0.2, v: 0.06, lp: 3000, vib: 14, vd: 0.1, rev: 0.35 });
    B(g, t + 1.51, { f: midiHz(86), ratio: 3.5, idx: 2, d: 0.8, v: 0.06, rev: 0.4 });
  },
  menuMove(g, t) {
    T(g, t, { type: 'square', f: 1250, d: 0.03, v: 0.12, lp: 4000 });
    T(g, t, { type: 'sine', f: 2500, d: 0.02, v: 0.06 });
  },
  menuSelect(g, t) {
    B(g, t, { f: 880, ratio: 2, idx: 1.2, d: 0.5, v: 0.09 });
    B(g, t + 0.07, { f: 1318.5, ratio: 2, idx: 1.2, d: 0.6, v: 0.09, rev: 0.3 });
    T(g, t, { type: 'p25', f: 880, d: 0.06, v: 0.045 });
    T(g, t + 0.07, { type: 'p25', f: 1318.5, d: 0.12, v: 0.045 });
  },
  pause(g, t) {
    T(g, t, { type: 'p25', f: 988, a: 0.004, d: 0.08, s: 0.5, dur: 0.07, r: 0.03, v: 0.13, lp: 3000 });
    T(g, t + 0.09, { type: 'p25', f: 659, d: 0.15, v: 0.13, lp: 3000 });
    B(g, t + 0.09, { f: 1318, ratio: 2, idx: 1, d: 0.5, v: 0.035 });
  },
  splash(g, t) {
    N(g, t, { bp: 1800, bp2: 500, sw: 0.35, bq: 0.8, a: 0.005, d: 0.35, v: 0.42 });
    N(g, t, { hp: 4000, d: 0.12, v: 0.17 });
    for (let i = 0; i < 4; i++) T(g, t + 0.08 + i * 0.06 + rnd(0, 0.03), { type: 'sine', f: rnd(180, 420), pe: -10, pt: 0.04, d: 0.08, v: 0.13 });
    T(g, t, { type: 'sine', f: 140, f2: 60, gl: 0.12, d: 0.15, v: 0.24 });
  },
  rail(g, t) {
    N(g, t, { hp: 2800, d: 0.018, v: jit(0.28, 0.1) });
    B(g, t, { f: jit(1250, 0.05), ratio: 3.1, idx: 1.5, d: 0.08, v: 0.055 });
    T(g, t, { type: 'tri', f: jit(180), d: 0.03, v: 0.14 });
  },
  railJump(g, t) {
    B(g, t, { f: 520, ratio: 2.2, idx: 2.5, d: 0.25, v: 0.12 });
    N(g, t, { bp: 600, bp2: 1800, sw: 0.2, a: 0.03, d: 0.15, v: 0.3 });
    T(g, t, { type: 'p25', f: 200, f2: 400, gl: 0.15, d: 0.15, v: 0.1, lp: 1500 });
  },
  toad(g, t) {
    const f = jit(200, 0.06);
    T(g, t, { type: 'saw', f, f2: f * 0.9, gl: 0.08, a: 0.005, d: 0.07, s: 0.6, dur: 0.07, r: 0.02, form: [600, 1300], fq: 6, fg: 3, v: 0.22, trem: 1, trr: 55 });
    T(g, t + 0.11, { type: 'saw', f: f * 1.3, f2: f * 1.5, gl: 0.06, a: 0.005, d: 0.06, s: 0.6, dur: 0.06, r: 0.02, form: [600, 1300], fq: 6, fg: 3, v: 0.2, trem: 1, trr: 60 });
  },
  doorOpen(g, t) {
    T(g, t, { type: 'saw', f: 70, f2: 95, gl: 0.6, a: 0.05, d: 0.3, s: 0.8, dur: 0.6, r: 0.1, bp: 900, bq: 7, v: 0.22, vib: 300, vr: 11, trem: 0.7, trr: 23 });
    T(g, t + 0.1, { type: 'saw', f: 140, f2: 120, gl: 0.5, a: 0.08, d: 0.3, s: 0.6, dur: 0.45, r: 0.1, bp: 1500, bq: 9, v: 0.1, vib: 200, vr: 7 });
    T(g, t + 0.64, { type: 'sine', f: 120, f2: 70, gl: 0.08, d: 0.1, v: 0.2 });
    N(g, t + 0.64, { lp: 600, d: 0.06, v: 0.2 });
  },
  bell(g, t) {
    const f = 196;
    const parts = [[0.5, 0.5, 1.7], [1, 1, 1.5], [1.19, 0.45, 1.2], [1.5, 0.32, 1.0], [2, 0.38, 0.9], [2.52, 0.2, 0.6], [3.0, 0.14, 0.5], [4.1, 0.09, 0.35]];
    parts.forEach(([r, a, d], i) => T(g, t, { type: 'sine', f: f * r, a: 0.002, d, v: a * 0.12, rev: i < 3 ? 0.35 : 0 }));
    N(g, t, { bp: 2000, bq: 1.5, d: 0.03, v: 0.14 });
  },
  fizzle(g, t) {
    N(g, t, { hp: 2500, lp: 9000, lp2: 3000, sw: 0.4, a: 0.01, d: 0.35, v: 0.3, trem: 0.6, trr: 30 });
    T(g, t, { type: 'sine', f: 500, f2: 200, gl: 0.1, d: 0.1, v: 0.07 });
  },
  wasp(g, t) {
    T(g, t, { type: 'saw', f: jit(240), f2: jit(260), a: 0.02, d: 0.2, s: 0.7, dur: 0.2, r: 0.05, bp: 1400, bq: 1.5, v: 0.28, vib: 90, vr: 28, trem: 0.5, trr: 40 });
  },
};

// ---------------------------------------------------------------- public API
let AC = null, G = null, timer = null, cur = null, pending = null, paused = false;
const players = new Set();
let muted = (() => { try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; } })();

function safeCall(fn) { try { fn(); } catch (e) { console.error(e); } }

function tickAll() {
  if (!G) return;
  const now = G.ac.currentTime;
  const ahead = typeof document !== 'undefined' && document.hidden ? 1.2 : LOOKAHEAD;
  for (const p of players) {
    if (p.dieAt !== Infinity && now > p.dieAt) { players.delete(p); continue; }
    const ended = p.tick(now, ahead);
    if (p.done) {
      players.delete(p);
      if (cur === p) cur = null;
      if (ended && p.onEnd) { const cb = p.onEnd; p.onEnd = null; safeCall(cb); }
    }
  }
  if (!players.size && timer) { clearInterval(timer); timer = null; }
}

function startTrack(name, opts) {
  const now = G.ac.currentTime;
  const p = new Player(G, name, { onEnd: opts.onEnd, live: true });
  if (cur) {
    cur.stop(0.4);
    p.fadeIn(TRACKS[name].loop === false ? 0.02 : 0.35, now);
  }
  p.t0 = now + 0.06;
  cur = p;
  players.add(p);
  p.tick(now, LOOKAHEAD);
  if (!timer) timer = setInterval(tickAll, TICK_MS);
}

function applyMute() {
  if (!G) return;
  const gp = G.master.gain, now = G.ac.currentTime;
  gp.cancelScheduledValues(now);
  gp.setValueAtTime(muted ? 0 : 1, now);
}

export function initAudio() {
  try {
    if (!AC) {
      const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!C) return;
      AC = new C({ latencyHint: 'interactive' });
      G = buildGraph(AC);
      applyMute();
      if (paused) setPaused(true);
      const b = AC.createBuffer(1, 1, AC.sampleRate);
      const s = AC.createBufferSource();
      s.buffer = b; s.connect(AC.destination); s.start(0);
    }
    if (AC.state !== 'running' && AC.resume) AC.resume().catch(() => {});
    if (pending) { const p = pending; pending = null; if (!cur) startTrack(p.name, p.opts); }
  } catch (e) {
    console.warn('[audio] init failed', e);
  }
}

export function sfx(name, opts = {}) {
  if (!G || muted) return;
  const fn = SFX[name];
  if (!fn) return;
  const now = G.ac.currentTime;
  if (now - (G.last[name] ?? -1) < 0.018) return;
  G.last[name] = now;
  try {
    fn(G, now + 0.005, opts || {});
    if (name === 'life') duckMusic(0.3, 1.0);
  } catch (e) {
    console.warn('[audio] sfx ' + name, e);
  }
}

export function playMusic(name, opts = {}) {
  opts = opts || {};
  if (name === 'life') {
    sfx('life');
    if (opts.onEnd) setTimeout(() => safeCall(opts.onEnd), 1300);
    return;
  }
  if (!TRACKS[name]) return;
  if (!G) { pending = { name, opts }; return; }
  if (cur && cur.name === name && !cur.done && cur.dieAt === Infinity) return;
  startTrack(name, opts);
}

export function stopMusic(fade = 0.5) {
  pending = null;
  if (cur) { cur.stop(fade); cur = null; }
}

export function duckMusic(amount = 0.35, seconds = 1) {
  if (!G) return;
  const gp = G.duck.gain, now = G.ac.currentTime;
  const lvl = Math.max(0, Math.min(1, amount));
  gp.cancelScheduledValues(now);
  gp.setValueAtTime(gp.value, now);
  gp.linearRampToValueAtTime(lvl, now + 0.06);
  gp.setValueAtTime(lvl, now + 0.06 + Math.max(0, seconds));
  gp.linearRampToValueAtTime(1, now + 0.06 + Math.max(0, seconds) + 0.5);
}

export function setMuted(b) {
  muted = !!b;
  try { localStorage.setItem(STORE_KEY, muted ? '1' : '0'); } catch (e) { /* private mode */ }
  applyMute();
}

export function isMuted() { return muted; }

export function setPaused(b) {
  paused = !!b;
  if (!G) return;
  const now = G.ac.currentTime;
  const gp = G.pause.gain, fp = G.pauseLP.frequency;
  gp.cancelScheduledValues(now); gp.setValueAtTime(gp.value, now);
  fp.cancelScheduledValues(now); fp.setValueAtTime(fp.value, now);
  gp.setTargetAtTime(paused ? 0.25 : 1, now, 0.05);
  fp.setTargetAtTime(paused ? 700 : 20000, now, paused ? 0.06 : 0.12);
}

// Debug hook: renders a track or sfx through the same graph into an
// OfflineAudioContext and resolves with the AudioBuffer.
export async function renderOffline(name, seconds = 4, opts = {}) {
  const sr = 44100;
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new Off(2, Math.ceil(sr * seconds), sr);
  const g = buildGraph(oc);
  if (TRACKS[name]) {
    // schedule in one-second chunks, as the live scheduler would
    const p = new Player(g, name, { live: false, solo: opts && opts.solo });
    p.t0 = 0.03;
    p.tick(0, 1.25);
    for (let ts = 1; ts < seconds; ts += 1) {
      oc.suspend(ts).then(() => { p.tick(ts, 1.25); oc.resume(); });
    }
  } else if (SFX[name]) {
    SFX[name](g, 0.03, opts);
  } else throw new Error('unknown sound ' + name);
  const buf = await oc.startRendering();
  buf.voiceStats = { dropped: g.dropped || 0, peak: g.peakVoices || 0 };
  return buf;
}
