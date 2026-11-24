// Stay With Me: audio.js. The whole sound of the game, synthesised with the Web Audio API (no audio files).
//
//   import { Snd } from './audio.js';   Snd.init() from a user gesture, then call anything; every method is a safe no-op
//   before init() (state setters such as music/ambient/siren/setVolume are remembered and replayed at init).
//
// Layout
//   createSound(ctx, opt)  builds the complete graph on ANY BaseAudioContext (the tests render it through an
//                          OfflineAudioContext with { offline: true }) and returns the real implementation.
//   Snd                    lazy singleton facade over one live AudioContext, plus speech (speechSynthesis).
//
// Signal flow
//   outside ─ low-pass + attenuation (setInterior) ─┐
//   vehicle ────────────────────────────────────────┼─ duck (stethoscope) ─┐
//   medical ────────────────────────────────────────┘                      ├─ sfx ─┐
//   ui ────────────────────────────────────────────────────────────────────┤       │
//   steth ─ tube filter ───────────────────────────────────────────────────┘       ├─ master ─ compressor ─ limiter
//   radio ─ 300..3100 Hz band + saturation ─ radio volume ─────────────────────────┤           ─ soft clip ─ out
//   music ─ music volume ──────────────────────────────────────────────────────────┘
//   Three generated convolution reverbs: 'street' (slap echoes, returns into outside), 'room' (into medical),
//   'hall' (into music).
//
// Three kinds of sound
//   voice(name, bus, build)  continuous: built on first use, parameters automated with setTargetAtTime, torn down
//                            after ~2.5 s of silence (engine, siren, rain, ambience beds ...). Never rebuilt per frame.
//   shot(bus, k => ...)      one-shot: a little kit `k` (k.nz filtered noise, k.tone, k.ping, k.click, k.thud) builds
//                            the nodes, sources stop themselves and the output is disconnected by pump().
//   motor(name, seconds)     drill / bone saw: a voice with a scheduled spin-down, so tool(30) can be cut short by tool(0).
//   every(name, fn)          look-ahead scheduler (alarms, indicator, metronome, ambience events, music), driven by
//                            update(dt) and by a 100 ms timer so it keeps going while the game loop is not running.
//
// Tuning: levels are the `peak` / gain numbers next to each sound; the siren sweeps live in sirenCtl(); engine balance
// in engine(); the score (chords, tempo, layers per mood) in MOODS; default volumes in VOL.

const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const notes = s => s.trim().split(/\s+/).map(n => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(n); return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (+m[3] + 1); });
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const VOL = { master: 0.8, sfx: 1, music: 0.6, radio: 0.9 };
export const DISPATCH_TONES_SECONDS = 3.45;

// The score. Steps are eighth notes; a chord lasts `len` steps. chords: bass first, then the pad voicing.
// scale: pitch classes the piano may pass through. pad: level and filter cutoff. piano: style, register, loudness,
// rest (steps between phrases, [min, max]). pulse: 'eighth' | 'ost' | 'heart' | 'quarter'. shim: tremolo strings.
const MOODS = {
  menu: { bpm: 60, len: 20, scale: [2, 4, 5, 7, 9, 10, 0], pad: { lvl: 0.2, cut: 620 }, piano: { style: 'sparse', lo: 57, hi: 81, lvl: 0.5, rest: [5, 13] }, shim: 0.012,
    chords: ['D2 A2 F3 C4 E4', 'Bb1 F2 D3 A3 C4', 'F2 C3 A3 E4 G4', 'C2 G2 E3 D4 G4', 'G2 D3 Bb3 F4 A4', 'Bb1 F2 D3 F3 C4'] },
  drive: { bpm: 104, len: 32, scale: [9, 11, 0, 2, 4, 5, 7], pad: { lvl: 0.16, cut: 800 }, piano: { style: 'arp', lo: 60, hi: 84, lvl: 0.36, rest: [10, 26] }, pulse: 'eighth', pulseLvl: 0.2, shim: 0.01,
    chords: ['A1 E2 A2 C4 E4 B4', 'F1 C2 F2 C4 E4 A4', 'C2 G2 E3 D4 G4', 'G1 D2 G2 B3 D4 A4', 'D2 A2 F3 C4 E4', 'E1 B1 E2 B3 D4 G4'] },
  tension: { bpm: 56, len: 20, scale: [2, 3, 5, 7, 9, 10, 0], pad: { lvl: 0.17, cut: 480 }, piano: { style: 'low', lo: 38, hi: 86, lvl: 0.42, rest: [7, 16] }, pulse: 'heart', pulseLvl: 0.34, shim: 0.03,
    chords: ['D1 D2 A2 Eb3 G3 D4', 'D1 D2 Bb2 F3 A3 E4', 'D1 D2 A2 F3 Ab3 C4', 'D1 C2 G2 Eb3 Bb3 D4', 'D1 D2 A2 E3 G3 Bb3'] },
  critical: { bpm: 126, len: 32, scale: [0, 2, 3, 5, 7, 8, 10], pad: { lvl: 0.17, cut: 700 }, piano: { style: 'low', lo: 36, hi: 84, lvl: 0.4, rest: [12, 28] }, pulse: 'ost', pulseLvl: 0.26, shim: 0.034, riser: true,
    chords: ['C1 C2 G2 Eb3 G3 D4', 'Ab0 Ab1 Eb2 C3 G3 Bb3', 'F1 F2 C3 Ab3 C4 G4', 'G1 G2 D3 Ab3 B3 F4', 'C1 C2 G2 F3 Ab3 Eb4', 'Bb0 Bb1 F2 D3 Ab3 C4'] },
  calm: { bpm: 66, len: 24, scale: [5, 7, 9, 11, 0, 2, 4], pad: { lvl: 0.19, cut: 720 }, piano: { style: 'arp', lo: 60, hi: 86, lvl: 0.4, rest: [6, 14] }, shim: 0.008,
    chords: ['F2 C3 A3 E4 G4', 'A1 E2 G3 C4 E4', 'D2 A2 F3 C4 E4', 'Bb1 F2 D3 A3 C4', 'C2 G2 E3 B3 D4', 'F2 C3 G3 A3 E4'] },
  grief: { bpm: 50, len: 20, scale: [1, 3, 4, 6, 8, 9, 11], pad: { lvl: 0.15, cut: 520 }, piano: { style: 'sparse', lo: 52, hi: 78, lvl: 0.55, rest: [6, 12], fall: true }, shim: 0.006,
    chords: ['C#2 G#2 E3 G#3 D#4', 'A1 E2 C#3 G#3 B3', 'F#1 C#2 A2 E3 G#3', 'G#1 D#2 G#2 C4 D#4', 'E2 B2 E3 G#3 B3', 'F#1 C#2 A2 C#3 E3'] },
  triumph: { bpm: 76, len: 24, scale: [2, 4, 6, 7, 9, 11, 1], pad: { lvl: 0.2, cut: 950 }, piano: { style: 'arp', lo: 62, hi: 90, lvl: 0.44, rest: [4, 10], rise: true }, pulse: 'quarter', pulseLvl: 0.15, shim: 0.02,
    chords: ['D2 A2 F#3 A3 E4', 'C#2 A2 E3 A3 E4', 'B1 F#2 D3 A3 C#4 F#4', 'G1 D2 B2 D3 A3 F#4', 'A1 E2 A2 C#4 E4 A4', 'G1 D2 G2 B3 D4 A4'] },
};
for (const k in MOODS) MOODS[k].chords = MOODS[k].chords.map(notes);

export function createSound(ctx, opt = {}) {
  const sr = ctx.sampleRate, offline = !!opt.offline, rng = mulberry(opt.seed ?? 20261124);
  const R = (a = 1, b) => b === undefined ? rng() * a : a + rng() * (b - a);
  const pick = a => a[Math.floor(rng() * a.length)];
  const now = () => ctx.currentTime;
  const live = () => offline || ctx.state === 'running';   // one-shots are dropped while suspended so they cannot pile up
  const S = { interior: 0, siren: 'off', alarm: 'off', ambient: 'none', music: 'off', wet: 0, bpm: 110, vol: { ...VOL } };

  // ---------- node helpers
  const gn = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const fl = (type, f, q = 0.707, db = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = db; return n; };
  const pn = p => { const n = ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); return n; };
  const dl = (t, max = 1) => { const n = ctx.createDelay(max); n.delayTime.value = t; return n; };
  const ws = (curve, over = 'none') => { const n = ctx.createWaveShaper(); n.curve = curve; n.oversample = over; return n; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
  const os = (type, f, det = 0) => { const o = ctx.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.value = f; o.detune.value = det; return o; };
  const nz = (kind = 'white', rate = 1) => { const s = ctx.createBufferSource(); s.buffer = NB(kind); s.loop = true; s.playbackRate.value = rate; return s; };
  const pw = amps => ctx.createPeriodicWave(new Float32Array(amps.length + 1), Float32Array.from([0, ...amps]));
  const curve = (fn, n = 2048) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; };
  const CURVE = {
    soft: curve(x => Math.tanh(1.6 * x)), drive: curve(x => Math.tanh(3.2 * x)),
    // master soft clip, fed at half level: linear to 0.6, then a tanh knee that can never reach 1
    clip: curve(x => { const a = Math.abs(x * 2); return Math.sign(x) * (a < 0.6 ? a : 0.6 + 0.38 * Math.tanh((a - 0.6) / 0.38)); }, 8192),
  };
  const WAVE = {
    beep: pw([1, 0.4, 0.18, 0.08, 0.04]), alarm: pw([1, 0.62, 0.42, 0.26, 0.16, 0.08]),
    pianoBody: pw([1, 0.42, 0.2, 0.1, 0.06, 0.035, 0.02, 0.012]), pianoBright: pw([0, 0.5, 0.6, 0.5, 0.42, 0.34, 0.27, 0.21, 0.16, 0.12, 0.09, 0.07, 0.05, 0.04]),
  };

  // ---------- automation helpers
  const hold = (p, t) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); } };
  const to = (p, v, tc = 0.05) => { if (p._v === v) return; p._v = v; p.setTargetAtTime(v, now(), tc); };   // smooth continuous control
  const fade = (p, v, d, t = now()) => { hold(p, t); p.linearRampToValueAtTime(v, t + d); p._v = undefined; };  // gates
  const lr = (p, t, v0, ...s) => { p.setValueAtTime(v0, t); for (let i = 0; i < s.length; i += 2) p.linearRampToValueAtTime(s[i + 1], t += Math.max(0, s[i])); return t; };
  const xr = (p, t, v0, ...s) => { p.setValueAtTime(Math.max(1e-4, v0), t); for (let i = 0; i < s.length; i += 2) p.exponentialRampToValueAtTime(Math.max(1e-4, s[i + 1]), t += Math.max(1e-3, s[i])); return t; };
  const perc = (p, t, peak, att, tc) => { p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + att); p.setTargetAtTime(0, t + att, tc); };
  const tail = (p, t, d) => { if (p.cancelAndHoldAtTime) { p.cancelAndHoldAtTime(t); p.linearRampToValueAtTime(0, t + d); } else p.setTargetAtTime(0, t, d / 4); };

  // ---------- generated buffers (lazy)
  const bufs = {};
  const NB = k => bufs[k] || (bufs[k] = k === 'roof' ? mkPings(3.1, 320, 900, 3800, 0.003, 0.011, 71) : k === 'drops' ? mkPings(2.9, 520, 2400, 9000, 0.0008, 0.003, 113) : mkNoise(k));
  function mkNoise(kind) {   // white / pink (Kellet) / brown, seamless loop, RMS 0.3
    const n = Math.round(sr * 3.37), X = 4096, raw = new Float32Array(n + X), r = mulberry(kind.length * 7919 + 13);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n + X; i++) {
      const w = r() * 2 - 1;
      if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; raw[i] = b0 + b1 + b2 + w * 0.1848; }
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; raw[i] = last; }
      else raw[i] = w;
    }
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); let ss = 0;
    for (let i = 0; i < n; i++) { d[i] = i < X ? raw[i] * (i / X) + raw[n + i] * (1 - i / X) : raw[i]; ss += d[i] * d[i]; }
    const k = 0.3 / Math.sqrt(ss / n); for (let i = 0; i < n; i++) d[i] = clamp(d[i] * k, -1, 1);
    return b;
  }
  function mkPings(secs, per, fLo, fHi, tcLo, tcHi, seed) {   // a loop of sparse damped pings: raindrops on metal / on the ground
    const n = Math.round(sr * secs), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), r = mulberry(seed);
    for (let i = 0, m = per * secs; i < m; i++) {
      const f = fLo * (fHi / fLo) ** r(), tc = lerp(tcLo, tcHi, r()), a = 0.15 + r() ** 3, o = (r() * n) | 0, len = Math.min(n, (tc * 6 * sr) | 0), w = 2 * Math.PI * f / sr, ph = r() * 6.28, dec = Math.exp(-1 / (tc * sr));
      for (let j = 0, e = a; j < len; j++, e *= dec) d[(o + j) % n] += e * Math.sin(w * j + ph) * Math.min(1, j / 6);
    }
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < n; i++) d[i] *= 0.9 / pk;
    return b;
  }
  function mkIR(name) {   // stereo impulse responses: decaying noise that darkens with time, plus discrete slaps for the street
    const P = { street: [1.3, 0.2, 0.5, 0.03, 0.22], room: [0.5, 0.08, 0.9, 0.003, 1], hall: [4.6, 0.95, 0.7, 0.02, 1] }[name];
    const n = Math.round(sr * P[0]), b = ctx.createBuffer(2, n, sr), r = mulberry(name.length * 977 + 5);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = (P[3] * sr) | 0; i < n; i++) {
        const t = i / sr - P[3];
        lp += ((r() * 2 - 1) - lp) * clamp(Math.exp(-t / (P[1] * 1.5)) * P[2] + 0.05);
        d[i] = lp * Math.exp(-t / P[1]) * Math.min(1, t / 0.012) * P[4];
      }
      if (name === 'street') for (const [tt, a] of ch ? [[0.071, 0.8], [0.118, 0.5], [0.203, 0.45], [0.33, 0.25], [0.47, 0.14]] : [[0.058, 0.8], [0.134, 0.55], [0.171, 0.4], [0.29, 0.3], [0.52, 0.12]]) {
        const o = (tt * sr) | 0; let s = 0;
        for (let j = 0; j < 140; j++) { s += ((r() * 2 - 1) - s) * 0.5; d[o + j] += a * s * Math.exp(-j / 30) * 1.6; }
      }
      for (let i = n - 2000; i < n; i++) d[i] *= (n - i) / 2000;
    }
    return b;
  }

  // ---------- buses and master chain
  const B = {}; for (const k of ['outside', 'vehicle', 'medical', 'ui', 'radio', 'music', 'steth']) B[k] = gn(1);
  const mix = gn(1), master = gn(S.vol.master), sfx = gn(S.vol.sfx), duck = gn(1), musicDuck = gn(1), musicV = gn(S.vol.music), radioDuck = gn(1), radioV = gn(S.vol.radio);
  const outLP = fl('lowpass', 20000, 0.6), outAtt = gn(1);
  chain(B.outside, outLP, outAtt, duck); B.vehicle.connect(duck); B.medical.connect(duck);
  chain(duck, sfx, mix); B.ui.connect(sfx);
  chain(B.steth, fl('lowpass', 1100, 0.8), fl('peaking', 120, 0.9, 6), sfx);
  chain(B.radio, fl('highpass', 320, 0.8), fl('lowpass', 3100, 0.9), fl('peaking', 1700, 1, 5), ws(CURVE.soft), radioDuck, radioV, mix);
  chain(B.music, musicDuck, musicV, mix);
  const comp = ctx.createDynamicsCompressor(), lim = ctx.createDynamicsCompressor();
  comp.threshold.value = -15; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.012; comp.release.value = 0.28;
  lim.threshold.value = -5; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.09;
  // Chrome's compressor adds its own make-up gain (about +5 dB for each of these settings); the two trims undo it.
  chain(mix, master, comp, gn(0.6), lim, gn(0.5 * 0.82), ws(CURVE.clip), ctx.destination);
  const REV = {}, REVBUS = { street: 'outside', room: 'medical', hall: 'music' }, REVOF = { outside: 'street', vehicle: 'room', medical: 'room', ui: 'room', music: 'hall' };
  function reverb(name) { if (!REV[name]) { const c = ctx.createConvolver(), i = gn(1); c.buffer = mkIR(name); chain(i, c, B[REVBUS[name]]); REV[name] = i; } return REV[name]; }

  // ---------- one-shots
  const trash = [], sched = new Map(), V = {}, SEQ = {};
  function kit(t, out) {
    const k = { t, out, end: t, srcs: [] };
    const run = (s, a, len, off) => { s.start(t + a, off); s.stop(t + a + len); k.srcs.push(s); k.end = Math.max(k.end, t + a + len); return s; };
    const envl = (g, T, len, { peak = 0.3, att = 0.005, tc, rel, curve: cv }) => {
      if (cv) { const c = Float32Array.from(cv, x => x * peak); g.setValueAtTime(0, T); g.setValueCurveAtTime(c, T + 1e-4, len); g.setValueAtTime(0, T + len + 2e-4); }
      else if (tc) perc(g, T, peak, att, tc);
      else { const r = rel ?? len * 0.5; lr(g, T, 0, att, peak, len - att - r, peak, r, 0); }
    };
    k.osc = (type, f, a, len, det) => run(os(type, f, det), a, len);
    k.noise = (kind, a, len, rate = 1) => { const s = nz(kind, rate); return run(s, a, len, R(s.buffer.duration)); };
    // filtered noise with an envelope: { kind, type, f, f2 (sweep to), q, peak, att, tc (percussive) | rel | curve, dest }
    k.nz = (a, len, o = {}) => {
      const L = o.tc ? Math.max(len, (o.att ?? 0.005) + o.tc * 7) : len, s = k.noise(o.kind || 'white', a, L + 0.02, o.rate), f = fl(o.type || 'bandpass', o.f ?? 1000, o.q ?? 1), g = gn(0);
      if (o.f2) xr(f.frequency, t + a, o.f ?? 1000, len, o.f2);
      envl(g.gain, t + a, L, o); chain(s, f, g, o.dest || out); return { s, f, g };
    };
    // oscillator with an envelope: { type, f, f2, fTc (glide time), det, peak, att, tc | rel, dest }
    k.tone = (a, len, o = {}) => {
      const L = o.tc ? Math.max(len, (o.att ?? 0.005) + o.tc * 7) : len, s = k.osc(o.type || 'sine', o.f ?? 440, a, L + 0.02, o.det), g = gn(0);
      if (o.f2) xr(s.frequency, t + a, o.f ?? 440, o.fTc ?? len, o.f2);
      envl(g.gain, t + a, L, o); chain(s, g, o.dest || out); return { s, g };
    };
    k.ping = (a, f, peak, tc, type) => k.tone(a, 0, { f, peak, att: 0.001, tc, type });
    k.click = (a, peak = 0.3, f = 2500, q = 1.2) => k.nz(a, 0, { f, q, peak, att: 0.0005, tc: 0.004 });
    k.thud = (a, f, peak, tc, drop = 0.55) => k.tone(a, 0, { f, f2: f * drop, fTc: tc * 3, peak, att: 0.004, tc });
    return k;
  }
  // Runs fn(k) to build a one-shot on `bus`. Options: at (start time), pan, gain, rev (reverb send), revName.
  function shot(bus, fn, o = {}) {
    if (!live()) return null;
    const t = o.at ?? now() + 0.006, out = gn(o.gain ?? 1), nodes = [out]; let end = out;
    if (o.pan) { end = pn(o.pan); out.connect(end); nodes.push(end); }
    end.connect(B[bus]);
    if (o.rev) { const s = gn(o.rev); end.connect(s); s.connect(reverb(o.revName || REVOF[bus])); nodes.push(s); }
    const k = kit(t, out); fn(k);
    trash.push({ at: k.end + 0.3, nodes });
    return { k, out, nodes };
  }
  // A named, cancellable one-shot sequence (defib charge, NIBP cycle).
  function seq(name, bus, fn, o) { stopSeq(name); const h = shot(bus, fn, o); if (h) SEQ[name] = h; return h; }
  function stopSeq(name, d = 0.05) {
    const h = SEQ[name]; if (!h) return false; delete SEQ[name]; const t = now(); if (h.k.end < t) return false;
    fade(h.out.gain, 0, d); for (const s of h.k.srcs) try { s.stop(t + d + 0.02); } catch { /* already stopped */ }
    trash.push({ at: t + d + 0.1, nodes: h.nodes }); return true;
  }
  // jagged 0..1 envelope for tearing / crinkling / crackling textures
  function grains(n, dens, shape = x => Math.sin(Math.PI * x) ** 0.6, floor = 0.06) {
    const c = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) c[i] = shape(i / (n - 1)) * (rng() < dens ? 0.35 + 0.65 * rng() : floor);
    return c;
  }

  // ---------- continuous voices
  function voice(name, bus, build) {
    let v = V[name]; if (v) return v;
    const out = gn(0); out.connect(B[bus]);
    v = V[name] = { out, srcs: [], nodes: [out], level: 0, quiet: now() };
    const c = {
      out, v,
      osc: (type, f, det) => { const o = os(type, f, det); o.start(); v.srcs.push(o); return o; },
      noise: (kind, rate) => { const s = nz(kind, rate); s.start(0, R(s.buffer.duration)); v.srcs.push(s); return s; },
      loop: (buffer, rate = 1, off = 0) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.playbackRate.value = rate; s.start(0, off); v.srcs.push(s); return s; },
      send: (node, amt, name) => { const s = gn(amt); node.connect(s); s.connect(reverb(name)); v.nodes.push(s); return s; },
    };
    build(c, v); return v;
  }
  const lvl = (v, x) => { v.level = x; if (x > 5e-4) v.quiet = now(); };
  function kill(name) {
    const v = V[name]; if (!v) return; delete V[name]; const t = now();
    fade(v.out.gain, 0, 0.08); for (const s of v.srcs) try { s.stop(t + 0.12); } catch { /* already stopped */ }
    trash.push({ at: t + 0.3, nodes: v.nodes });
  }
  // simple on/off voice with its own fade
  function gate(name, on, level, bus, build, tcOn = 0.03, tcOff = 0.05) {
    if (!on && !V[name]) return null;
    const v = voice(name, bus, build); lvl(v, on ? 1 : 0); to(v.out.gain, on ? level : 0, on ? tcOn : tcOff); return v;
  }

  // ---------- scheduler
  const LOOK = 0.35;
  function every(name, fn, delay = 0.03) { sched.set(name, { next: now() + delay, fn }); }
  function pump() {
    const t = now();
    for (let i = trash.length - 1; i >= 0; i--) if (trash[i].at < t) { for (const n of trash[i].nodes) try { n.disconnect(); } catch { /* gone */ } trash.splice(i, 1); }
    for (const name in V) {
      const v = V[name];
      if (v.stopAt && t > v.stopAt) { v.stopAt = 0; v.run = false; v.level = 0; v.quiet = t; }   // a motor tool that has run its time
      if (v.level <= 5e-4 && t - v.quiet > 2.5) kill(name);
    }
    for (const name in SEQ) if (SEQ[name].k.end < t) delete SEQ[name];
    for (const [name, s] of sched) {
      if (s.next < t - 0.25) s.next = t + 0.02;   // stalled (hidden tab): do not replay the backlog
      while (s.next < t + LOOK) { const d = s.fn(s.next); if (d == null || !sched.has(name) || sched.get(name) !== s) { if (d == null) sched.delete(name); break; } s.next += Math.max(0.02, d); }
    }
    musicTick(t);
  }

  // ================================================================ mix controls
  function setVolume(v = {}) {
    for (const k of ['master', 'sfx', 'music', 'radio']) if (Number.isFinite(v[k])) S.vol[k] = clamp(v[k]);
    to(master.gain, S.vol.master); to(sfx.gain, S.vol.sfx); to(musicV.gain, S.vol.music); to(radioV.gain, S.vol.radio);
  }
  function setInterior(a = 0) {
    a = S.interior = clamp(+a || 0);
    to(outLP.frequency, 20000 * (1250 / 20000) ** a, 0.12); to(outAtt.gain, lerp(1, 0.45, a), 0.12);
  }

  // ================================================================ driving
  // Diesel V8 van. One 720° engine cycle (8 uneven firing pulses, two exhaust banks) is baked into a buffer and played
  // at a rate proportional to rpm; clatter is fixed-band noise gated by a second buffer of the same firing pattern.
  function engineBufs() {
    if (bufs.engP) return;
    const n = Math.round(sr * 120 / 700), P = ctx.createBuffer(1, n, sr), E = ctx.createBuffer(1, n, sr), p = P.getChannelData(0), e = E.getChannelData(0), seg = n / 8, r = mulberry(8);
    const bank = [1, 0, 1, 1, 0, 1, 0, 0];   // firing order 1-2-7-3-4-5-6-8, odd cylinders on the right bank
    for (let c = 0; c < 8; c++) {
      const a = (bank[c] ? 1 : 0.74) * lerp(0.85, 1.1, r()), a2 = lerp(0.55, 1, r()), o = Math.round(seg * (c + lerp(-0.03, 0.03, r()) + (bank[c] ? 0 : 0.06)));
      for (let i = 0; i < seg * 1.8; i++) {
        const ph = i / seg, j = (o + i + n) % n;
        p[j] += a * ((1 - Math.exp(-ph * 38)) * Math.exp(-ph * 4.2) + 0.45 * Math.exp(-ph * 6) * Math.sin(2 * Math.PI * 3.1 * ph));
        e[j] += a2 * Math.exp(-ph * 15);
      }
    }
    let m = 0, pk = 0; for (let i = 0; i < n; i++) m += p[i] / n;
    for (let i = 0; i < n; i++) { p[i] -= m; pk = Math.max(pk, Math.abs(p[i])); }
    for (let i = 0; i < n; i++) p[i] /= pk;
    bufs.engP = P; bufs.engE = E;
  }
  const engineVoice = () => voice('engine', 'vehicle', (c, v) => {
    engineBufs();
    const sum = gn(1);
    v.pulse = c.loop(bufs.engP); v.env = c.loop(bufs.engE);
    v.lp = fl('lowpass', 400, 0.8); v.gP = gn(0.5);
    chain(v.pulse, v.lp, fl('peaking', 95, 1.2, 3), fl('peaking', 230, 1.5, 5), ws(CURVE.soft), v.gP, sum);
    v.saw = c.osc('sawtooth', 46.7); v.sawLP = fl('lowpass', 300, 1); v.gSaw = gn(0); chain(v.saw, v.sawLP, v.gSaw, sum);
    v.sub = c.osc('sawtooth', 23.3); v.gSub = gn(0.1); chain(v.sub, fl('lowpass', 140, 0.7), v.gSub, sum);
    const cn = c.noise('white'), cg = gn(0), b1 = fl('bandpass', 1900, 0.9), b2 = fl('bandpass', 3700, 1.4);   // injector / combustion clatter
    v.gClat = gn(0.2); cn.connect(b1); cn.connect(b2); b1.connect(cg); chain(b2, gn(0.6), cg); chain(cg, v.gClat, sum); v.env.connect(cg.gain);
    v.tA = c.osc('sine', 3000); v.tB = c.osc('triangle', 3040); v.gTurbo = gn(0); v.tBP = fl('bandpass', 3000, 9); v.gTurboN = gn(0);   // turbo whistle
    v.tA.connect(v.gTurbo); chain(v.tB, gn(0.4), v.gTurbo); v.gTurbo.connect(sum); chain(c.noise('white'), v.tBP, v.gTurboN, sum);
    v.airBP = fl('bandpass', 400, 0.6); v.gAir = gn(0); chain(c.noise('pink'), v.airBP, v.gAir, sum);   // intake and exhaust rush
    v.gRum = gn(0.1); chain(c.noise('brown'), fl('lowpass', 110, 0.7), v.gRum, sum);
    v.whine = c.osc('triangle', 400); v.gWhine = gn(0); chain(v.whine, v.gWhine, sum);   // driveline whine with road speed
    v.tone = fl('lowpass', 7000, 0.5); chain(sum, fl('highpass', 28, 0.7), v.tone, c.out);
    v.boost = 0; v.last = now();
  });
  function engine({ on = true, rpm = 0, load = 0, speed = 0 } = {}) {
    if (!on && !V.engine) return;
    const v = engineVoice(), t = now(), dt = clamp(t - v.last, 0, 0.2); v.last = t;
    rpm = clamp(+rpm || 0); load = clamp(+load || 0); speed = Math.abs(+speed || 0);
    const r = (700 + rpm * 2900) / 700, fire = 46.667 * r, inn = S.interior;
    v.boost += (load * clamp((rpm - 0.1) / 0.5) - v.boost) * (1 - Math.exp(-dt / 0.45));   // the turbo spools with a lag
    const bst = Math.round(v.boost * 200) / 200, ft = 1700 + 6800 * bst;
    to(v.pulse.playbackRate, r, 0.04); to(v.env.playbackRate, r, 0.04); to(v.saw.frequency, fire * 1.003, 0.04); to(v.sub.frequency, fire / 2, 0.04);
    to(v.lp.frequency, 400 + 500 * rpm + 900 * load); to(v.gP.gain, 0.42 + 0.3 * load);
    to(v.sawLP.frequency, 250 + 500 * rpm + 1400 * load); to(v.gSaw.gain, 0.04 + 0.05 * rpm + 0.22 * load * (0.4 + 0.6 * rpm));
    to(v.gSub.gain, 0.07 + 0.08 * load);
    to(v.gClat.gain, (2.2 - 0.8 * rpm + 0.8 * load) * (1 - 0.6 * inn));
    to(v.tA.frequency, ft, 0.08); to(v.tB.frequency, ft * 1.012, 0.08); to(v.tBP.frequency, ft, 0.08);
    to(v.gTurbo.gain, 0.02 * bst ** 1.5, 0.1); to(v.gTurboN.gain, 0.12 * bst ** 1.5, 0.1);
    to(v.airBP.frequency, 300 + 700 * rpm); to(v.gAir.gain, 0.03 + 0.25 * load * (0.3 + rpm));
    to(v.gRum.gain, 0.07 + 0.15 * rpm);
    to(v.whine.frequency, 250 + speed * 24, 0.1); to(v.gWhine.gain, clamp(speed / 25) * 0.012 * (0.4 + load), 0.1);
    to(v.tone.frequency, lerp(7000, 1500, inn), 0.2);
    lvl(v, on ? 1 : 0); to(v.out.gain, on ? 0.4 : 0, on ? 0.12 : 0.22);
  }

  // US electronic siren. The pitch sweep of each mode is one looped control buffer feeding the oscillator frequency,
  // so the shapes are exact and nothing is scheduled per frame. 600..1350 Hz, RC-shaped rise and fall.
  function sirenCtl(mode) {
    const key = 'sir_' + mode; if (bufs[key]) return bufs[key];
    const csr = 8000, dur = { wail: 4.5, yelp: 0.33, phaser: 0.075, hilo: 1 }[mode], n = Math.round(dur * csr), b = ctx.createBuffer(1, n, csr), d = b.getChannelData(0);
    const lo = 600, hi = 1350, k = 2.4, nk = 1 - Math.exp(-k);
    const sweep = (p, up) => p < up ? (1 - Math.exp(-k * p / up)) / nk : (Math.exp(-k * (p - up) / (1 - up)) - Math.exp(-k)) / nk;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      d[i] = (mode === 'wail' ? lo + (hi - lo) * sweep(p, 0.6)            // 2.7 s up, 1.8 s down
        : mode === 'yelp' ? lo + (hi - lo) * sweep(p, 0.55)
        : mode === 'phaser' ? (p < 0.85 ? 780 + 700 * p / 0.85 : 1480 - 700 * (p - 0.85) / 0.15)
        : p < 0.5 ? 880 : 660) / 2000;
    }
    return bufs[key] = b;
  }
  const sirenVoice = () => voice('siren', 'outside', (c, v) => {
    v.ctl = gn(2000);
    const a = c.osc('square', 0), b = c.osc('sawtooth', 0, 7), pre = gn(0.55);
    v.ctl.connect(a.frequency); v.ctl.connect(b.frequency); a.connect(pre); chain(b, gn(0.5), pre);
    v.gate = gn(0);
    // amplifier saturation, then the 100 W compression driver and horn: nasal band-pass peaking between 1 and 3 kHz
    const horn = chain(pre, ws(CURVE.drive, '2x'), fl('highpass', 430, 0.8), fl('peaking', 1500, 1.1, 8), fl('peaking', 2700, 2.2, 5), fl('lowpass', 4300, 0.7), v.gate);
    horn.connect(c.out);
    const d1 = dl(0.092), f1 = fl('lowpass', 2400, 0.6); chain(horn, d1, f1, gn(0.26), pn(0.35), c.out); chain(f1, gn(0.28), d1);   // slap off the near facade
    chain(horn, dl(0.237), fl('lowpass', 1700, 0.6), gn(0.15), pn(-0.45), c.out);                                                  // and a later one across the street
    c.send(horn, 0.2, 'street');
    c.out.gain.value = 0.13;
  });
  function siren(mode = 'off') {
    if (!sirenCtlOk(mode)) mode = 'off';
    if (mode === S.siren && (mode === 'off' || V.siren)) return;
    S.siren = mode; const t = now();
    if (mode === 'off') { const v = V.siren; if (v) { fade(v.gate.gain, 0, 0.07); lvl(v, 0); v.open = false; } return; }
    const v = sirenVoice(), s = ctx.createBufferSource(), g = gn(0), old = v.cur;
    s.buffer = sirenCtl(mode); s.loop = true; chain(s, g, v.ctl); s.start(t);
    if (old && v.open) { fade(old.g.gain, 0, 0.045); old.s.stop(t + 0.06); lr(g.gain, t, 0, 0.045, 1); }   // glide between modes
    else { if (old) { old.g.disconnect(); old.s.stop(t); } g.gain.setValueAtTime(1, t); }                 // from silence: start at the bottom of the sweep
    if (old) { v.srcs.splice(v.srcs.indexOf(old.s), 1); v.nodes.splice(v.nodes.indexOf(old.g), 1); trash.push({ at: t + 0.2, nodes: [old.g] }); }
    v.cur = { s, g }; v.srcs.push(s); v.nodes.push(g); v.open = true;
    fade(v.gate.gain, 1, 0.035); lvl(v, 1);
  }
  const sirenCtlOk = m => m === 'wail' || m === 'yelp' || m === 'phaser' || m === 'hilo';

  // Two-tone air horn: a pair of reed-like horns a major third apart, each a detuned saw + square through the bell formants.
  function airhorn(on) {
    on = !!on; if (on === !!S.horn && (V.airhorn || !on)) return; S.horn = on;
    if (!on && !V.airhorn) return;
    const v = voice('airhorn', 'outside', (c, v) => {
      const pre = gn(0.3); v.os = [];
      for (const f of [329, 415]) for (const [type, det, g] of [['sawtooth', -4, 1], ['square', 5, 0.5]]) { const o = c.osc(type, f, det); o._d = det; chain(o, gn(g), pre); v.os.push(o); }
      chain(c.noise('white'), fl('bandpass', 1500, 0.5), gn(0.25), pre);
      v.gate = gn(0);
      const h = chain(pre, ws(CURVE.drive, '2x'), fl('highpass', 210, 0.7), fl('peaking', 800, 2, 8), fl('peaking', 1900, 2, 6), fl('lowpass', 3800, 0.7), v.gate);
      h.connect(c.out); chain(h, dl(0.105), fl('lowpass', 2000, 0.6), gn(0.25), pn(-0.3), c.out); c.send(h, 0.25, 'street');
      c.out.gain.value = 0.28;
    }), t = now();
    // the blat: pressure builds, pitch rises into the note; on release it droops
    for (const o of v.os) { const p = o.detune; hold(p, t); if (on) { p.setValueAtTime(o._d - 70, t); p.linearRampToValueAtTime(o._d, t + 0.09); } else p.linearRampToValueAtTime(o._d - 90, t + 0.14); }
    fade(v.gate.gain, on ? 1 : 0, on ? 0.045 : 0.13); lvl(v, on ? 1 : 0);
  }

  function tires({ skid = 0, speed = 0, wet = 0 } = {}) {
    skid = clamp(+skid || 0); wet = S.wet = clamp(+wet || 0); const s = clamp(Math.abs(+speed || 0) / 35);
    if (s < 0.004 && skid < 0.004 && !V.tires) return;
    const v = voice('tires', 'outside', (c, v) => {
      v.roarBP = fl('bandpass', 300, 0.5); v.gRoar = gn(0); chain(c.noise('pink'), v.roarBP, v.gRoar, c.out);
      v.gLow = gn(0); chain(c.noise('brown'), fl('lowpass', 90, 0.7), v.gLow, c.out);
      v.gSpray = gn(0); chain(c.noise('white'), fl('highpass', 2200, 0.5), fl('lowpass', 8000, 0.5), v.gSpray, c.out);
      // dry squeal: two rough tones wandering in pitch plus resonant rubber noise
      v.sqA = c.osc('sawtooth', 980); v.sqB = c.osc('square', 1310); v.gSq = gn(0);
      const jit = c.noise('brown', 0.02), jg = gn(260), mixq = gn(0.5); jit.connect(jg); jg.connect(v.sqA.frequency); jg.connect(v.sqB.frequency);
      v.sqA.connect(mixq); chain(v.sqB, gn(0.4), mixq); chain(c.noise('white'), fl('bandpass', 1150, 7), gn(3), mixq);
      v.sqBP = fl('bandpass', 1150, 2.2); chain(mixq, v.sqBP, ws(CURVE.soft), v.gSq, c.out);
      v.gHiss = gn(0); chain(c.noise('white'), fl('bandpass', 3000, 0.6), v.gHiss, c.out);
      c.out.gain.value = 1;
    });
    const dry = skid * (1 - wet);
    to(v.roarBP.frequency, 240 + 700 * s); to(v.gRoar.gain, 0.34 * s ** 1.3); to(v.gLow.gain, 0.25 * s);
    to(v.gSpray.gain, 0.2 * wet * s ** 1.4);
    to(v.sqA.frequency, 880 + 260 * skid); to(v.sqB.frequency, 1180 + 300 * skid); to(v.sqBP.frequency, 1050 + 300 * skid);
    to(v.gSq.gain, 0.3 * dry ** 1.5); to(v.gHiss.gain, 0.3 * skid * wet + 0.06 * skid);
    lvl(v, Math.max(s, skid));
  }

  function wind(level = 0) {
    const L = clamp(+level || 0, 0, 1.5); if (L <= 0 && !V.wind) return;
    const v = voice('wind', 'outside', (c, v) => {
      v.bp1 = fl('bandpass', 420, 0.7); v.bp2 = fl('bandpass', 1500, 3.5); v.gB = gn(0.2); const gust = gn(0.7), src = c.noise('pink');
      chain(c.osc('sine', 0.071), gn(150), v.bp1.frequency); chain(c.osc('sine', 0.13), gn(420), v.bp2.frequency);
      for (const f of [0.047, 0.11, 0.29]) chain(c.osc('sine', f), gn(0.13), gust.gain);
      chain(src, v.bp1, gust); chain(src, v.bp2, v.gB, gust); chain(c.noise('brown'), fl('lowpass', 140, 0.7), gn(1.2), gust);
      const pl = pn(-0.5), pr = pn(0.5), d = dl(0.013); chain(gust, pl, c.out); chain(gust, d, pr, c.out);
    });
    to(v.bp1.frequency, 330 + 260 * L, 0.3); to(v.gB.gain, 0.08 + 0.3 * L, 0.3); to(v.out.gain, 0.34 * L ** 1.2, 0.25); lvl(v, L);
  }
  function rain(level = 0) {
    const L = clamp(+level || 0, 0, 1.5); if (L <= 0 && !V.rain) return;
    const v = voice('rain', 'outside', (c, v) => {
      const all = gn(0.9); v.gSizz = gn(0); v.gRoar = gn(0); v.gDrops = gn(0);
      for (const side of [-1, 1]) {
        chain(c.noise('white', side > 0 ? 1 : 0.93), fl('highpass', 1700, 0.5), fl('lowpass', 9500, 0.5), pn(side * 0.75), v.gSizz);
        chain(c.loop(NB('drops'), side > 0 ? 1 : 0.87, side > 0 ? 0 : 1.3), fl('highpass', 1000, 0.5), pn(side * 0.5), v.gDrops);
      }
      chain(c.noise('pink'), fl('bandpass', 520, 0.4), v.gRoar);
      for (const f of [0.083, 0.19]) chain(c.osc('sine', f), gn(0.07), all.gain);
      v.gSizz.connect(all); v.gRoar.connect(all); v.gDrops.connect(all); all.connect(c.out); c.out.gain.value = 1;
    });
    to(v.gSizz.gain, 0.3 * L ** 1.3, 0.3); to(v.gRoar.gain, 0.5 * Math.max(0, L - 0.25) ** 1.2, 0.3); to(v.gDrops.gain, 0.5 * Math.min(L, 0.9) * (1.15 - 0.45 * L), 0.3); lvl(v, L);
  }
  function rainOnRoof(level = 0) {
    const L = clamp(+level || 0, 0, 1.5); if (L <= 0 && !V.roof) return;
    const v = voice('roof', 'vehicle', (c, v) => {
      v.gTink = gn(0); v.gDrum = gn(0); v.gHiss = gn(0); const lp = fl('lowpass', 5200, 0.6);
      chain(c.loop(NB('roof'), 1, 0), pn(-0.45), lp); chain(c.loop(NB('roof'), 0.91, 1.7), pn(0.45), lp); chain(lp, v.gTink, c.out);
      chain(c.noise('brown'), fl('bandpass', 250, 0.8), v.gDrum, c.out);      // the sheet-metal roof booming
      chain(c.noise('pink'), fl('bandpass', 1300, 0.5), v.gHiss, c.out);
      c.out.gain.value = 1;
    });
    to(v.gTink.gain, 0.3 * Math.min(L, 1) ** 0.8, 0.3); to(v.gDrum.gain, 0.5 * L ** 1.4, 0.3); to(v.gHiss.gain, 0.16 * L ** 1.6, 0.3); lvl(v, L);
  }

  function thunder(distance = 0.5) {
    const d = clamp(+distance || 0);
    shot('outside', k => {
      if (d < 0.75) {   // the crack: a few ragged broadband snaps
        const c = (1 - d / 0.75) ** 1.5; let a = 0;
        for (let i = 0, n = 2 + (R(3) | 0); i < n; i++) {
          k.nz(a, 0.3, { type: 'highpass', f: 900 + 2500 * (1 - d), q: 0.5, peak: 0.9 * c * R(0.5, 1), att: 0.002, tc: R(0.02, 0.07) });
          k.nz(a, 0.4, { kind: 'pink', type: 'lowpass', f: 1800, peak: 0.8 * c, att: 0.003, tc: 0.09 }); a += R(0.04, 0.16);
        }
        k.thud(0, 55, 0.9 * c, 0.12, 0.5);
      }
      const len = lerp(5, 9, d) + R(2), n = 96;   // the roll: brown noise, cutoff falling, a bumpy random envelope
      for (const [kind, f0, f1, lv] of [['brown', lerp(700, 140, d), 55, 1.6], ['pink', lerp(320, 110, d), 70, 0.5]]) {
        const cv = new Float32Array(n); let w = 0.6;
        for (let i = 1; i < n - 1; i++) { const x = i / (n - 1); w = clamp(w + R(-0.22, 0.22), 0.25, 1); cv[i] = w * Math.min(1, x * lerp(40, 5, d)) * (1 - x) ** 1.6; }
        k.nz(0, len, { kind, type: 'lowpass', f: f0, f2: f1, q: 0.6, peak: lv * lerp(1, 0.55, d), curve: cv });
      }
    }, { rev: 0.5, gain: 0.8 });
  }
  function crash(intensity = 0.6) {
    const x = clamp(+intensity || 0);
    shot('vehicle', k => {
      k.thud(0, 68, 0.9 * x + 0.2, 0.09, 0.5);
      k.nz(0, 0.5, { kind: 'pink', type: 'lowpass', f: 2600, f2: 300, q: 0.6, peak: 0.5 + 0.9 * x, att: 0.002, tc: 0.07 + 0.1 * x });
      k.nz(0, 0.3, { f: 900, q: 0.7, peak: 0.5 * x + 0.15, att: 0.001, tc: 0.03 });
      for (let i = 0, n = 5 + (x * 6 | 0); i < n; i++) k.ping(R(0.03), R(190, 3100), R(0.04, 0.16) * (0.4 + x), R(0.05, 0.3 + 0.5 * x), i % 2 ? 'triangle' : 'sine');   // sheet metal ringing
      k.nz(0.05, 0.5, { f: 520, q: 3, peak: 0.25 * x, curve: grains(48, 0.4, y => (1 - y) ** 2) });   // crumple
      if (x > 0.42) {   // glass
        const gl = (x - 0.42) / 0.58;
        k.nz(0.01, 0.5, { type: 'highpass', f: 3800, q: 0.6, peak: 0.5 * gl + 0.15, att: 0.002, tc: 0.07 });
        for (let i = 0, n = 14 + (gl * 30 | 0); i < n; i++) k.ping(0.03 + R() ** 1.6 * (0.5 + gl), R(2400, 9000), R(0.015, 0.07), R(0.006, 0.03));
      }
    }, { rev: 0.25, gain: 0.75 });
  }
  function bump(intensity = 0.5) {
    const x = clamp(+intensity || 0);
    shot('vehicle', k => {
      k.thud(0, 86, 0.45 + 0.5 * x, 0.04, 0.5); k.nz(0, 0.2, { kind: 'brown', type: 'lowpass', f: 260, peak: 0.6 + 0.6 * x, att: 0.003, tc: 0.035 });
      for (let i = 0, n = 2 + (x * 4 | 0); i < n; i++) k.click(0.02 + R(0.12), R(0.03, 0.09) * (0.5 + x), R(900, 2600), 2);   // kit rattling in the cabinets
      k.thud(0.11, 60, 0.2 * x, 0.05, 0.7);   // suspension rebound
    }, { gain: 0.8 });
  }

  function indicator(on) {
    on = !!on; if (on === !!S.ind) return; S.ind = on; if (!on) { sched.delete('ind'); return; }
    let tick = false;
    every('ind', te => { tick = !tick; shot('vehicle', k => { k.click(0, tick ? 0.45 : 0.34, tick ? 2600 : 1900, 3); k.ping(0, tick ? 1150 : 820, 0.13, 0.006); k.thud(0, 180, 0.1, 0.01); }, { at: te }); return 0.36; });
  }
  function reverseBeeper(on) {
    gate('reverse', !!on, 0.09, 'outside', (c, v) => {
      const o = c.osc('square', 1250), o2 = c.osc('square', 2507), g = gn(0), pre = gn(1);
      chain(c.osc('square', 1), fl('lowpass', 70, 0.5), gn(0.5), g.gain); g.gain.value = 0.5;   // 0.5 s on, 0.5 s off, soft edges
      o.connect(pre); chain(o2, gn(0.25), pre); const h = chain(pre, fl('bandpass', 1500, 1.2), g);
      h.connect(c.out); chain(h, dl(0.08), fl('lowpass', 2200), gn(0.25), c.out); c.send(h, 0.2, 'street');
    });
  }
  function doorSlam() {
    shot('vehicle', k => {
      k.click(0, 0.25, 2300, 2); k.ping(0.002, 640, 0.07, 0.012);   // latch
      k.thud(0.012, 74, 0.9, 0.05, 0.6); k.nz(0.012, 0.3, { kind: 'brown', type: 'lowpass', f: 420, peak: 1.1, att: 0.003, tc: 0.045 });
      k.nz(0.012, 0.2, { f: 1100, q: 0.8, peak: 0.16, att: 0.002, tc: 0.02 });
      k.ping(0.03, 310, 0.08, 0.06); k.click(0.07, 0.05, 1500, 3);   // panel ring, window rattle
    }, { rev: 0.12 });
  }
  function seatbelt() {
    shot('vehicle', k => {
      k.nz(0, 0.5, { f: 1500, f2: 2600, q: 1.5, peak: 0.14, curve: grains(40, 0.75) });   // webbing running off the reel
      k.click(0.56, 0.55, 3100, 3); k.ping(0.56, 2450, 0.16, 0.012); k.click(0.6, 0.36, 2200, 2); k.thud(0.6, 240, 0.2, 0.012);
    });
  }
  function handbrake() {
    shot('vehicle', k => {
      let a = 0; for (let i = 0; i < 7; i++) { k.click(a, 0.22, 2000 + i * 90, 3); k.ping(a, 900 + i * 40, 0.06, 0.008); a += 0.045 + i * 0.012; }
      k.thud(a, 120, 0.3, 0.03); k.nz(a, 0.2, { kind: 'brown', type: 'lowpass', f: 500, peak: 0.3, att: 0.002, tc: 0.03 });
    });
  }
  function passBy(pan = 1, speed = 20) {
    const sp = clamp(Math.abs(+speed || 20), 4, 60), len = clamp(22 / sp, 0.6, 3), side = clamp(+pan || 0, -1, 1), dop = sp / 343;
    const h = shot('outside', k => {
      const env = { peak: 1, att: len * 0.45, rel: len * 0.55 };
      xr(k.nz(0, len, { kind: 'pink', f: 350, q: 0.6, ...env, peak: 0.4 }).f.frequency, k.t, 350, len * 0.45, 900, len * 0.55, 260);
      k.nz(0, len, { type: 'highpass', f: 2400, q: 0.5, ...env, peak: 0.05 + 0.25 * S.wet });   // tyre hiss, spray when wet
      const f = R(85, 130), bp = fl('lowpass', 500, 1); bp.connect(k.out);
      for (const m of [1, 2.01]) { const o = k.tone(0, len, { type: 'sawtooth', f: f * m * (1 + dop), ...env, peak: 0.25 / m, dest: bp }).s; o.frequency.setValueAtTime(f * m * (1 + dop), k.t + len * 0.35); o.frequency.linearRampToValueAtTime(f * m * (1 - dop), k.t + len * 0.6); }
    }, { pan: side * 0.25 || 0.001, gain: 0.75, rev: 0.15 });
    if (h) { const p = h.nodes[1].pan, t = h.k.t; lr(p, t, side * 0.25, len * 0.45, side, len * 0.55, side * 0.7); }
  }
  function carHorn(pan = 0) {
    const base = R(370, 480), len = R(0.25, 0.8), dbl = rng() < 0.3;
    shot('outside', k => {
      for (let i = 0; i < (dbl ? 2 : 1); i++) {
        const L = dbl ? len * 0.5 : len, a = i * (L + 0.11), g = gn(0);
        for (const f of [base, base * 1.26]) { k.osc('sawtooth', f, a, L + 0.05).connect(g); chain(k.osc('square', f * 1.004, a, L + 0.05), gn(0.5), g); }
        lr(g.gain, k.t + a, 0, 0.012, 0.3, L - 0.045, 0.3, 0.033, 0);
        chain(g, ws(CURVE.drive), fl('highpass', 350, 0.7), fl('peaking', 2100, 1.2, 9), fl('lowpass', 5000, 0.7), k.out);
      }
    }, { pan: clamp(+pan || 0, -1, 1), rev: 0.35, gain: R(0.22, 0.34) });
  }

  // ================================================================ radio and UI
  function radioSquelch(open = true) {
    shot('radio', k => {
      if (open) { k.thud(0, 150, 0.35, 0.008, 0.7); k.click(0, 0.35, 1800, 1.5); k.nz(0.005, 0.09, { f: 1800, q: 0.4, peak: 0.3, att: 0.003, rel: 0.05 }); }
      else { k.nz(0, 0.17, { f: 1900, q: 0.35, peak: 0.42, att: 0.004, rel: 0.012 }); k.click(0.172, 0.3, 1200, 1.5); k.thud(0.172, 120, 0.25, 0.01); }   // the "kssht" tail
    });
  }
  function radioStatic(level = 0) {
    const L = clamp(+level || 0); if (L <= 0 && !V.static) return;
    const v = voice('static', 'radio', c => {
      const g = gn(0.6); chain(c.noise('white'), fl('bandpass', 1900, 0.35), g, c.out);
      chain(c.noise('brown', 0.25), gn(1.4), g.gain);                                    // the hiss breathes as the signal fades
      chain(c.loop(NB('drops'), 0.35, 0.4), fl('lowpass', 2500, 0.7), gn(0.3), c.out);   // crackle
      chain(c.osc('sawtooth', 120), fl('lowpass', 600, 0.7), gn(0.012), c.out);          // alternator hum
    });
    to(v.out.gain, 0.3 * L, 0.06); lvl(v, L);
  }
  // Two-tone sequential page (Quick Call II style): 1 s A tone, 2 s B tone, between a key-up and a squelch tail.
  function dispatchTones() {
    shot('radio', k => {
      k.thud(0, 150, 0.3, 0.008, 0.7); k.click(0, 0.3, 1800, 1.5);
      k.nz(0, 3.25, { f: 1900, q: 0.35, peak: 0.03, att: 0.01, rel: 0.02 });
      for (const [a, len, f] of [[0.12, 1.0, 853.2], [1.12, 2.08, 1232.6]]) { k.tone(a, len, { f, peak: 0.12, att: 0.006, rel: 0.012 }); k.tone(a, len, { f: f * 2, peak: 0.008, att: 0.006, rel: 0.012 }); }
      k.nz(3.25, 0.17, { f: 1900, q: 0.35, peak: 0.4, att: 0.004, rel: 0.012 }); k.click(3.42, 0.28, 1200, 1.5); k.thud(3.42, 120, 0.22, 0.01);
    });
    return DISPATCH_TONES_SECONDS;
  }
  const bell = (k, a, f, peak, tc) => { k.ping(a, f, peak, tc); k.ping(a, f * 2, peak * 0.22, tc * 0.5); k.ping(a, f * 3.01, peak * 0.08, tc * 0.3); };
  function ui(kind = 'click') {
    shot('ui', k => {
      switch (kind) {
        case 'hover': k.ping(0, 1900, 0.035, 0.012); k.nz(0, 0, { type: 'highpass', f: 5000, peak: 0.02, att: 0.001, tc: 0.006 }); break;
        case 'click': k.nz(0, 0, { f: 2400, q: 1.2, peak: 0.12, att: 0.0005, tc: 0.006 }); k.ping(0, 620, 0.09, 0.02); k.ping(0.004, 1240, 0.03, 0.012); break;
        case 'back': bell(k, 0, 520, 0.07, 0.05); bell(k, 0.07, 390, 0.06, 0.07); break;
        case 'error': for (const a of [0, 0.13]) { k.tone(a, 0.09, { f: 196, peak: 0.09, att: 0.006, rel: 0.04 }); k.tone(a, 0.09, { type: 'triangle', f: 147, peak: 0.05, att: 0.006, rel: 0.04 }); } break;
        case 'confirm': bell(k, 0, 659.3, 0.08, 0.09); bell(k, 0.09, 987.8, 0.08, 0.16); break;
        case 'tick': k.nz(0, 0, { f: 3200, q: 2, peak: 0.4, att: 0.0005, tc: 0.003 }); k.ping(0, 2200, 0.012, 0.004); break;
        case 'page': k.nz(0, 0.16, { f: 1800, f2: 4200, q: 0.8, peak: 0.15, att: 0.03, rel: 0.1 }); k.nz(0.02, 0.1, { type: 'highpass', f: 5000, peak: 0.05, curve: grains(24, 0.5) }); break;
        case 'good': [523.3, 659.3, 784].forEach((f, i) => bell(k, i * 0.085, f, 0.065, 0.16 + i * 0.05)); break;
        case 'bad': bell(k, 0, 311.1, 0.08, 0.12); bell(k, 0.14, 277.2, 0.08, 0.2); k.tone(0.14, 0.25, { f: 138.6, peak: 0.04, att: 0.01, rel: 0.2 }); break;
        default: k.ping(0, 620, 0.06, 0.02);
      }
    }, { rev: kind === 'hover' || kind === 'tick' ? 0 : 0.12 });
  }

  // ================================================================ medical
  // Pulse-oximeter pitch: 100 % = 880 Hz falling exponentially to 330 Hz at 60 %; no SpO2 = fixed 784 Hz.
  const beepF = s => s == null || !Number.isFinite(+s) ? 784 : 330 * (880 / 330) ** ((clamp(+s, 60, 100) - 60) / 40);
  const speaker = k => { const hp = fl('highpass', 240, 0.7); chain(hp, fl('peaking', 2300, 1, 4), fl('lowpass', 6500, 0.7), k.out); return hp; };   // the monitor's little speaker
  function monitorBeep(spo2) {
    shot('medical', k => { const o = k.osc(WAVE.beep, beepF(spo2), 0, 0.14), g = gn(0); lr(g.gain, k.t, 0, 0.004, 0.2, 0.072, 0.2, 0.03, 0); chain(o, g, speaker(k)); }, { rev: 0.06 });
  }
  // IEC 60601-1-8 shaped alarms. critical: the 10-pulse high-priority burst (3-2, pause, 3-2), cardiac melody c e g - g C.
  // advisory: a slow three-note chime.
  const ALARM = {
    advisory: { period: 5.5, tones: [[0, 523.3], [0.42, 659.3], [0.84, 784]], chime: true, peak: 0.13 },
    critical: { period: 4.3, tones: [0, 0.25, 0.5, 1.0, 1.25, 1.9, 2.15, 2.4, 2.9, 3.15].map((a, i) => [a, [523.3, 659.3, 784, 784, 1046.5][i % 5]]), len: 0.15, peak: 0.2 },
  };
  function alarm(level = 'off') {
    if (!ALARM[level]) level = 'off';
    if (level === S.alarm) return;
    S.alarm = level; sched.delete('alarm'); if (level === 'off') return;
    const A = ALARM[level];
    every('alarm', te => {
      shot('medical', k => {
        const sp = speaker(k);
        for (const [a, f] of A.tones) {
          const o = k.osc(WAVE.alarm, f, a, A.chime ? 1.3 : A.len + 0.02), g = gn(0), T = k.t + a;
          if (A.chime) perc(g.gain, T, A.peak, 0.02, 0.18); else lr(g.gain, T, 0, 0.014, A.peak, A.len - 0.034, A.peak, 0.02, 0);
          chain(o, g, sp);
        }
      }, { at: te, rev: 0.08 });
      return A.period;
    }, 0.05);
  }
  function flatline(on) {
    gate('flat', !!on, 0.11, 'medical', c => { chain(c.osc(WAVE.beep, 784), fl('highpass', 240, 0.7), fl('peaking', 2300, 1, 4), fl('lowpass', 6500, 0.7), c.out); }, 0.008, 0.012);
  }
  function defibCharge(seconds = 5) {
    const d = clamp(+seconds || 5, 0.4, 30);
    seq('charge', 'medical', k => {
      const T = k.t, g = gn(0), lp = fl('lowpass', 1800, 2), o1 = k.osc('triangle', 520, 0, d + 0.03), o2 = k.osc('sawtooth', 1040, 0, d + 0.03);
      xr(o1.frequency, T, 520, d, 2600); xr(o2.frequency, T, 1043, d, 5215); xr(lp.frequency, T, 1800, d, 7500);   // the capacitor whine climbs
      lr(g.gain, T, 0, 0.05, 0.05, d - 0.07, 0.14, 0.02, 0); o1.connect(g); chain(o2, gn(0.22), g); chain(g, lp, k.out);
      k.nz(0, d, { f: 4000, q: 2, peak: 0.012, att: 0.2, rel: 0.05 }); k.tone(0, d, { type: 'sawtooth', f: 120, peak: 0.01, att: 0.1, rel: 0.05 });
    }, { rev: 0.05 });
  }
  function defibReady(on) {
    on = !!on; if (on) stopSeq('charge', 0.02);
    gate('ready', on, 0.1, 'medical', c => {
      const o = c.osc(WAVE.alarm, 1560); chain(c.osc('square', 4.2), fl('lowpass', 45, 0.5), gn(190), o.frequency);   // urgent two-pitch warble
      chain(o, fl('highpass', 300, 0.7), fl('peaking', 2600, 1, 4), c.out);
    }, 0.01, 0.015);
  }
  function shock() {
    stopSeq('charge', 0.01); defibReady(false);
    shot('medical', k => {
      k.click(0, 0.5, 1800, 1.5); k.thud(0, 140, 0.5, 0.03);                                       // relay
      k.nz(0.004, 0, { type: 'highpass', f: 3000, q: 0.6, peak: 0.35, att: 0.001, tc: 0.012 });    // the snap of the discharge
      k.thud(0.015, 62, 0.9, 0.07, 0.6);                                                             // every muscle at once
      k.nz(0.2, 0, { kind: 'brown', type: 'lowpass', f: 300, peak: 1.1, att: 0.006, tc: 0.05 });    // the body lands
      k.nz(0.2, 0.2, { f: 1800, q: 0.6, peak: 0.06, curve: grains(24, 0.6, x => 1 - x) });
      k.ping(0.22, 1250, 0.04, 0.04); k.click(0.24, 0.08, 2600, 3);
    }, { rev: 0.15 });
  }
  function metronome(on, bpm) {
    if (Number.isFinite(+bpm) && +bpm > 0) S.bpm = clamp(+bpm, 30, 240);
    on = !!on; if (on === !!S.metro) return;
    S.metro = on; if (!on) { sched.delete('metro'); return; }
    every('metro', te => { shot('medical', k => { k.ping(0, 1180, 0.22, 0.011); k.ping(0, 2360, 0.07, 0.006); k.click(0, 0.12, 3000, 2); }, { at: te, rev: 0.05 }); return 60 / S.bpm; });
  }
  function cprThump(depth = 0.7) {
    const d = clamp(+depth || 0);
    shot('medical', k => {
      k.thud(0, 78 + 14 * d, 0.2 + 0.36 * d, 0.04, 0.6); k.nz(0, 0, { kind: 'brown', type: 'lowpass', f: 240, peak: 0.35 + 0.42 * d, att: 0.004, tc: 0.035 });
      k.nz(0, 0.13, { f: 2300, q: 0.6, peak: 0.04 + 0.05 * d, curve: grains(24, 0.6) }); k.nz(0.2, 0.12, { f: 1800, q: 0.6, peak: 0.025 + 0.02 * d, curve: grains(20, 0.5) });   // clothing, then the recoil
      if (d > 0.55) k.tone(0.01, 0.12, { type: 'sawtooth', f: 430, f2: 380, peak: 0.012, att: 0.02, rel: 0.06 });   // the cot creaks under a deep one
    });
  }
  function ribCrack() {
    shot('medical', k => {
      let a = 0;
      for (let i = 0, n = 2 + (R(2) | 0); i < n; i++) { k.click(a, 0.7, R(1100, 2400), 2.5); k.ping(a, R(480, 900), 0.22, 0.008); k.thud(a, 190, 0.3, 0.012, 0.6); a += R(0.05, 0.12); }
      k.nz(0, a + 0.18, { kind: 'pink', f: 720, q: 0.8, peak: 0.3, curve: grains(48, 0.35, x => (1 - x) ** 0.7) });   // cartilage giving way
    }, { rev: 0.08 });
  }
  function bvm() {
    shot('medical', k => {
      k.nz(0, 0.9, { kind: 'pink', f: 600, f2: 1500, q: 0.9, peak: 0.45, att: 0.25, rel: 0.45 }); k.nz(0.1, 0.7, { type: 'highpass', f: 4000, q: 0.6, peak: 0.045, att: 0.2, rel: 0.3 });
      k.click(0.02, 0.12, 3200, 2); k.click(0.9, 0.1, 2800, 2); k.nz(0, 0.5, { f: 2600, q: 0.8, peak: 0.03, curve: grains(30, 0.4) });   // valve, bag crinkle
      k.nz(1.0, 0.8, { kind: 'pink', f: 900, f2: 450, q: 1.2, peak: 0.2, att: 0.1, rel: 0.6 });                                            // the bag refills
    });
  }
  function suction(on) {
    gate('suction', !!on, 0.75, 'medical', c => {
      const m = gn(0.05); chain(c.osc('sawtooth', 118), fl('lowpass', 520, 1), m, c.out); chain(c.osc('square', 236.6), fl('lowpass', 700, 0.7), gn(0.4), m);   // pump motor
      chain(c.noise('white'), fl('bandpass', 3300, 0.7), gn(0.2), c.out);                                                                                      // air through the catheter
      const bp = fl('bandpass', 850, 5), gg = gn(0.6); chain(c.noise('pink'), bp, gg, c.out);                                                                 // gurgle: a resonance thrown about
      chain(c.noise('brown', 0.035), gn(900), bp.frequency); chain(c.noise('brown', 0.05), gn(1.6), gg.gain);
    }, 0.08, 0.12);
  }
  function oxygen(on) {
    gate('oxygen', !!on, 0.11, 'medical', c => {
      const g = gn(0.8); chain(c.noise('white'), fl('highpass', 3200, 0.6), fl('peaking', 6500, 1.2, 7), g, c.out);
      chain(c.noise('pink'), fl('bandpass', 1500, 0.8), gn(0.2), c.out); chain(c.osc('sine', 0.37), gn(0.08), g.gain);
    }, 0.1, 0.15);
  }
  function nibp(on) {
    if (!on) { if (stopSeq('nibp', 0.12)) shot('medical', k => k.nz(0, 0.6, { f: 2800, f2: 1200, q: 0.6, peak: 0.07, att: 0.02, rel: 0.5 })); return; }
    if (SEQ.nibp && SEQ.nibp.k.end > now()) return;
    seq('nibp', 'medical', k => {
      const T = k.t, up = 5.5, g = gn(0), o = k.osc('sawtooth', 80, 0, up + 0.1), o2 = k.osc('square', 160, 0, up + 0.1, 11);
      for (const [x, m] of [[o, 1], [o2, 2]]) xr(x.frequency, T, 62 * m, 0.25, 84 * m, up - 0.25, 124 * m);   // the pump labours as the cuff fills
      lr(g.gain, T, 0, 0.08, 0.2, up - 0.13, 0.26, 0.05, 0); o.connect(g); chain(o2, gn(0.45), g);
      chain(g, fl('bandpass', 520, 0.8), k.out); chain(g, fl('bandpass', 1900, 2), gn(0.35), k.out);
      k.nz(0, up, { f: 2400, q: 0.8, peak: 0.02, att: 0.1, rel: 0.05 }); k.click(up + 0.02, 0.12, 1500, 2);
      let a = up + 0.5;
      for (let i = 0; i < 12; i++) { k.nz(a, 0, { type: 'highpass', f: 2400, q: 0.6, peak: 0.07, att: 0.004, tc: 0.022 }); k.click(a, 0.07, 1500, 2); a += R(0.75, 0.95); }   // stepped bleed
      k.nz(a, 0.9, { f: 3000, f2: 1100, q: 0.6, peak: 0.09, att: 0.02, rel: 0.8 });   // dump
    });
  }

  // ---------- stethoscope
  function stethoscope(on) {
    on = !!on; if (on === !!S.steth) return;
    S.steth = on;
    to(duck.gain, on ? 0.1 : 1, 0.12); to(musicDuck.gain, on ? 0.4 : 1, 0.25); to(radioDuck.gain, on ? 0.25 : 1, 0.12);
    gate('tube', on, 0.13, 'steth', c => { chain(c.noise('brown'), fl('lowpass', 160, 0.7), gn(0.5), c.out); chain(c.noise('pink'), fl('bandpass', 420, 0.6), gn(0.05), c.out); }, 0.1, 0.1);
    if (on) shot('steth', k => { k.thud(0, 90, 0.5, 0.03); k.nz(0, 0.2, { kind: 'pink', type: 'lowpass', f: 700, peak: 0.4, curve: grains(24, 0.6) }); });   // the diaphragm lands on the chest
  }
  function breathSound(kind = 'normal', phase = 'in', side = 0) {
    if (kind === 'absent') return;
    const inn = phase !== 'out';
    shot('steth', k => {
      let amp = inn ? 1 : 0.55, len = inn ? 1.25 : 0.95; const f = inn ? 430 : 290;
      if (kind === 'diminished') amp *= 0.28;
      if (kind === 'stridor') amp *= 0.5;
      if (kind === 'wheeze' && !inn) len = 1.8;
      k.nz(0, len, { kind: 'pink', type: 'lowpass', f, q: 0.8, peak: 1.3 * amp, att: len * 0.4, rel: len * 0.5 });   // vesicular rush
      k.nz(0, len, { f: f * 1.6, q: 1, peak: 0.5 * amp, att: len * 0.45, rel: len * 0.45 });
      if (kind === 'wheeze') for (let i = 0, n = inn ? 1 : 3; i < n; i++) {   // musical, polyphonic, mostly expiratory
        const f0 = R(260, 640) * (inn ? 1.3 : 1), a = R(len * 0.15), L = len - a - R(len * 0.15), e = { att: L * 0.3, rel: L * 0.45 };
        k.tone(a, L, { type: 'triangle', f: f0, f2: f0 * R(0.86, 1.08), peak: inn ? 0.12 : 0.3, ...e }); k.nz(a, L, { f: f0, q: 30, peak: inn ? 1.5 : 3.5, ...e });
      }
      if (kind === 'crackles') for (let i = 0, n = inn ? 16 + (R(8) | 0) : 4; i < n; i++) {   // fine late-inspiratory pops
        const a = len * (inn ? 0.35 + 0.6 * R() ** 0.7 : R(0.5)); k.ping(a, R(480, 1050), R(0.25, 0.7), R(0.0018, 0.0045)); k.click(a, 0.2, 900, 1.5);
      }
      if (kind === 'stridor') {   // one harsh high pitch on the way in
        const bp = fl('bandpass', inn ? 760 : 560, 4), e = { att: len * 0.25, rel: len * 0.4 }; bp.connect(k.out);
        k.tone(0, len, { type: 'sawtooth', f: inn ? 380 : 280, f2: inn ? 420 : 250, peak: inn ? 1.2 : 0.4, ...e, dest: bp }); k.nz(0, len, { f: 800, q: 6, peak: inn ? 2.5 : 0.8, ...e });
      }
      if (kind === 'gurgle') {   // coarse low bubbling
        for (let i = 0, n = 9 + (R(6) | 0); i < n; i++) { const a = R(len * 0.9); k.ping(a, R(130, 360), R(0.5, 1), R(0.008, 0.018)); k.nz(a, 0, { kind: 'pink', type: 'lowpass', f: 500, peak: 0.6, att: 0.002, tc: 0.012 }); }
        k.nz(0, len, { kind: 'brown', f: 230, q: 2, peak: 1.2, curve: grains(40, 0.5) });
      }
    }, { pan: clamp(+side || 0, -1, 1) * 0.7 });
  }
  function heartSound(kind = 'normal') {
    const m = kind === 'muffled' ? 0.3 : 1;
    shot('steth', k => {
      const beat = (a, f, lv, tc) => { k.thud(a, f, 1.1 * lv * m, tc, 0.7); k.nz(a, 0, { kind: 'brown', f: f * 0.9, q: 1.4, peak: 2.2 * lv * m, att: 0.008, tc: tc * 0.9 }); };
      beat(0, 60, 1, 0.034); beat(0.31, 86, 0.7, 0.022);                                                             // lub, dub
      if (kind === 'murmur') k.nz(0.06, 0.24, { kind: 'pink', f: 270, q: 1.3, peak: 1.0, att: 0.1, rel: 0.12 });   // systolic, crescendo-decrescendo
      if (kind === 'gallop') beat(0.46, 44, 0.55, 0.04);                                                             // S3
    });
  }

  // ---------- kit and procedures
  function velcro() { shot('medical', k => { const L = R(0.3, 0.45); k.nz(0, L, { f: 3200, q: 0.5, peak: 0.6, curve: grains(120, 0.55) }); k.nz(0, L, { type: 'highpass', f: 6000, peak: 0.24, curve: grains(120, 0.5) }); k.nz(0, L, { f: 900, q: 1, peak: 0.2, curve: grains(60, 0.4) }); }); }
  function shears() {
    shot('medical', k => {
      let a = 0;
      for (let i = 0, n = 2 + (R(2) | 0); i < n; i++) {
        k.nz(a, 0.11, { f: 4200, f2: 6800, q: 1.4, peak: 0.25, att: 0.02, rel: 0.03 });   // blades sliding
        k.nz(a, 0.12, { f: 1300, q: 0.7, peak: 0.35, curve: grains(30, 0.6) });            // cloth parting
        k.click(a + 0.115, 0.55, 3400, 3); k.ping(a + 0.115, 5200, 0.07, 0.01); k.ping(a + 0.115, 2100, 0.1, 0.008); a += R(0.22, 0.3);
      }
    });
  }
  function zipper() {
    shot('medical', k => {
      const L = R(0.35, 0.5), hp = fl('highpass', 1400, 0.7); chain(hp, fl('bandpass', 3000, 1.2), k.out);
      k.tone(0, L, { type: 'sawtooth', f: 160, f2: 420, peak: 0.32, att: 0.02, rel: 0.05, dest: hp }); k.nz(0, L, { f: 3600, q: 0.8, peak: 0.1, att: 0.02, rel: 0.05 }); k.click(L, 0.12, 2400, 2);
    });
  }
  function packaging() { shot('medical', k => { const L = R(0.4, 0.6); k.nz(0, L, { f: 5500, q: 0.6, peak: 0.32, curve: grains(110, 0.35) }); k.nz(0, L, { type: 'highpass', f: 7500, peak: 0.2, curve: grains(110, 0.3) }); k.nz(L * 0.5, 0.14, { f: 2600, f2: 4200, q: 1, peak: 0.24, curve: grains(40, 0.7) }); }); }
  function glove() { shot('medical', k => { k.nz(0, 0.2, { f: 900, f2: 1700, q: 3, peak: 0.12, curve: grains(40, 0.7, x => x) }); k.click(0.22, 0.4, 2600, 1.5); k.thud(0.22, 300, 0.3, 0.012, 0.6); k.ping(0.22, 880, 0.08, 0.015); k.nz(0.3, 0.12, { f: 1200, q: 2, peak: 0.04, curve: grains(20, 0.6) }); }); }
  function tape() { shot('medical', k => { const L = R(0.3, 0.45); k.nz(0, L, { f: 1900, f2: 3400, q: 2, peak: 0.75, curve: grains(100, 0.7, x => 0.5 + 0.5 * x) }); k.nz(0, L, { f: 5200, q: 1, peak: 0.2, curve: grains(100, 0.6) }); k.click(L + 0.01, 0.5, 3000, 2); }); }
  function drawer() {
    shot('medical', k => {
      k.nz(0, 0.24, { kind: 'brown', f: 320, q: 0.8, peak: 0.5, att: 0.03, rel: 0.05 }); k.nz(0, 0.24, { f: 1500, q: 0.7, peak: 0.03, curve: grains(30, 0.6) });
      k.thud(0.24, 110, 0.4, 0.03); k.click(0.24, 0.2, 1700, 2); for (let i = 0; i < 4; i++) k.click(0.26 + R(0.12), R(0.03, 0.1), R(1500, 4200), 3);
    });
  }
  function needlePop() { shot('medical', k => { k.click(0, 0.14, 2800, 2); k.thud(0.002, 210, 0.2, 0.012, 0.6); k.nz(0.004, 0, { kind: 'pink', type: 'lowpass', f: 900, peak: 0.12, att: 0.002, tc: 0.015 }); }); }
  function airHiss(seconds = 2) {   // trapped air leaving a decompressed chest: loud at first, dying away over `seconds`
    const d = clamp(+seconds || 2, 0.2, 15);
    shot('medical', k => { const e = { att: 0.012, tc: d / 3.2 }; k.nz(0, d, { type: 'highpass', f: 2600, q: 0.6, peak: 0.3, ...e }); k.nz(0, d, { f: 5200, q: 1.5, peak: 0.24, ...e }); k.nz(0, d, { f: 3300, q: 14, peak: 0.75, ...e }); });
  }
  // Motor tools are voices, so the game can run one for as long as a button is held: tool(seconds) with seconds > 0
  // starts it (or keeps it running) and schedules the spin-down, tool(0) stops it now. v.spd is a 0..1 speed that every
  // pitch follows; v.grind gates the bone noise, which comes in as the tool bites and bogs down to v.bog.
  function motor(name, seconds, down, build) {
    const s = +seconds, t = now(); let v = V[name];
    if (!(s > 0)) {
      if (v && v.run) { v.run = false; v.stopAt = t + down * 1.5; for (const p of [v.amp.gain, v.spd.offset, v.grind.gain]) hold(p, t); v.amp.gain.setTargetAtTime(0, t, down / 4); v.spd.offset.setTargetAtTime(0.2, t, down / 3); v.grind.gain.setTargetAtTime(0, t, down / 8); }
      return;
    }
    v = voice(name, 'medical', (c, v) => {
      v.spd = ctx.createConstantSource(); v.spd.offset.value = 0.3; v.spd.start(); v.srcs.push(v.spd);
      v.amp = gn(0); v.grind = gn(0); build(c, v); v.amp.connect(c.out); c.out.gain.value = 1;
    });
    const d = clamp(s, 0.25, 180), e = t + d, fresh = !v.run;
    for (const p of [v.amp.gain, v.spd.offset, v.grind.gain]) hold(p, t);
    v.amp.gain.linearRampToValueAtTime(1, t + 0.03);
    if (fresh) {
      v.spd.offset.linearRampToValueAtTime(1, t + v.up);
      if (d > v.up + 0.45) { v.spd.offset.setValueAtTime(1, t + v.up + 0.15); v.spd.offset.linearRampToValueAtTime(v.bog, t + v.up + 0.3); v.grind.gain.setValueAtTime(0, t + v.up + 0.15); v.grind.gain.linearRampToValueAtTime(1, t + v.up + 0.35); }
    }
    v.amp.gain.setTargetAtTime(0, e, down / 4); v.spd.offset.setTargetAtTime(0.2, e, down / 3); v.grind.gain.setTargetAtTime(0, e, down / 8);
    v.run = true; v.stopAt = e + down * 1.5; lvl(v, 1);
  }
  function drill(seconds = 1.5) {   // intraosseous driver: spins up, bogs as it bites bone, spins down. drill(0) stops it.
    motor('drill', seconds, 0.25, (c, v) => {
      v.up = 0.09; v.bog = 0.83;
      const f = gn(455), pre = gn(0.2), o1 = c.osc('sawtooth', 0), o2 = c.osc('square', 0, 9), o3 = c.osc('sine', 0), wob = gn(22), gg = gn(0.07);
      v.spd.connect(f); f.connect(o1.frequency); f.connect(o2.frequency); chain(f, gn(7.3), o3.frequency);   // motor, and the gearbox whine above it
      chain(c.noise('brown', 0.12), wob); wob.connect(o1.frequency); wob.connect(o2.frequency);            // the hand's pressure never holds steady
      o1.connect(pre); chain(o2, gn(0.5), pre); chain(o3, gn(0.12), pre);
      chain(pre, ws(CURVE.soft), fl('bandpass', 1900, 1.1), v.amp); chain(pre, fl('lowpass', 600, 0.7), gn(0.4), v.amp);
      chain(c.noise('white'), fl('bandpass', 1300, 1.5), gg, v.grind, v.amp); chain(c.noise('brown', 0.6), gn(0.16), gg.gain);   // flutes in bone
    });
  }
  function scalpel() { shot('medical', k => { k.nz(0, 0.3, { f: 4200, f2: 2400, q: 1.2, peak: 0.09, att: 0.06, rel: 0.15 }); k.nz(0.02, 0.3, { kind: 'pink', type: 'lowpass', f: 700, peak: 0.18, curve: grains(40, 0.5) }); }); }
  function boneSaw(seconds = 2) {   // oscillating saw: motor buzz, with noise chopped at the blade rate for the teeth in bone. boneSaw(0) stops it.
    motor('saw', seconds, 0.4, (c, v) => {
      v.up = 0.18; v.bog = 0.9;
      const f = gn(232), pre = gn(0.22), am = gn(0), o = c.osc('sawtooth', 0), o2 = c.osc('square', 0, -8), wob = gn(14);
      v.spd.connect(f); f.connect(o.frequency); chain(f, gn(2), o2.frequency);
      chain(c.noise('brown', 0.1), wob); wob.connect(o.frequency); chain(wob, gn(2), o2.frequency);
      o.connect(pre); chain(o2, gn(0.4), pre); chain(pre, ws(CURVE.drive), fl('bandpass', 1500, 0.7), gn(0.6), v.amp); chain(pre, fl('lowpass', 500, 0.7), gn(0.5), v.amp);
      chain(o, gn(0.5), am.gain); chain(c.noise('white'), fl('bandpass', 2900, 0.9), am, v.grind, v.amp);
    });
  }
  function suctionSlurp() {
    shot('medical', k => {
      const L = R(0.45, 0.7);
      k.nz(0, L, { kind: 'pink', f: 500, f2: 1900, q: 4, peak: 1, curve: grains(60, 0.65) }); k.nz(0, L, { f: 3000, q: 0.8, peak: 0.11, att: 0.05, rel: 0.1 });
      for (let i = 0; i < 6; i++) k.tone(R(L), 0.04, { f: R(300, 700), f2: R(700, 1400), peak: 0.11, att: 0.004, rel: 0.02 });
    });
  }
  function bloodDrip() {
    shot('medical', k => { k.tone(0, 0.035, { f: R(700, 1000), f2: R(1500, 2100), fTc: 0.03, peak: 0.07, att: 0.002, rel: 0.02 }); k.nz(0, 0, { kind: 'pink', type: 'lowpass', f: 1500, peak: 0.07, att: 0.001, tc: 0.008 }); k.ping(0.012, R(2500, 3500), 0.012, 0.01); }, { pan: R(-0.3, 0.3), rev: 0.1 });
  }

  // ---------- the patient
  // A voiced sound: glottal sawtooth with a pitch contour and jitter, breath noise, three formant band-passes.
  function voiced(k, a, len, o) {
    const T = k.t + a, src = gn(1), g = gn(0), o1 = k.osc('sawtooth', o.f0, a, len + 0.05), att = o.att ?? len * 0.2, rel = o.rel ?? len * 0.45;
    lr(o1.frequency, T, o.f0 * (o.c0 ?? 0.92), len * 0.25, o.f0 * (o.c1 ?? 1.08), len * 0.75, o.f0 * (o.c2 ?? 0.72));
    if (o.rough) chain(k.noise('brown', a, len + 0.05, 0.6), gn(o.f0 * o.rough * 0.5), o1.frequency);
    chain(o1, fl('lowpass', o.tilt ?? 1400, 0.6), src);
    if (o.breath) chain(k.noise('white', a, len + 0.05), fl('highpass', 1200, 0.5), gn(o.breath), src);
    for (const [f, q, lv] of o.formants) chain(src, fl('bandpass', f, q), gn(lv), g);
    lr(g.gain, T, 0, att, o.peak, len - att - rel, o.peak * 0.8, rel, 0); g.connect(o.dest || k.out);
  }
  function groan(pain = 0.5, female = false) {
    const p = clamp(+pain || 0), m = female ? 1.17 : 1, f0 = (female ? 196 : 108) * (1 + 0.38 * p) * R(0.94, 1.06), len = 0.55 + 0.85 * p + R(0.3);
    const F = p < 0.45 ? [[430, 4, 1], [1150, 6, 0.25], [2400, 7, 0.08]] : [[lerp(560, 760, p), 4, 1], [1180, 6, 0.55], [2600, 7, 0.25]];   // closed "mm/uh" opening to "aah"
    shot('medical', k => voiced(k, 0, len, { f0, formants: F.map(([f, q, l]) => [f * m, q, l]), peak: 0.5 + 0.9 * p, breath: 0.06 + 0.12 * p, rough: 0.25 + 0.75 * p, tilt: 900 + 1800 * p, c1: 1.04 + 0.1 * p, c2: 0.7 }), { rev: 0.1 });
  }
  function cough(female = false) {
    shot('medical', k => {
      for (const [a, s] of [[0, 1], [R(0.26, 0.34), 0.7]]) {
        k.nz(a, 0, { f: 1250, q: 0.6, peak: 0.9 * s, att: 0.008, tc: 0.045 }); k.nz(a, 0, { f: 520, q: 1.1, peak: 0.8 * s, att: 0.006, tc: 0.04 }); k.nz(a, 0, { type: 'highpass', f: 2800, peak: 0.16 * s, att: 0.004, tc: 0.03 });
        voiced(k, a + 0.015, 0.17, { f0: female ? 230 : 135, formants: [[650, 3, 1], [1300, 5, 0.4]], peak: 0.6 * s, breath: 0.1, rough: 0.8, att: 0.01, rel: 0.12, c1: 1, c2: 0.6 });
      }
    }, { rev: 0.12 });
  }
  function gasp() {
    shot('medical', k => {
      k.nz(0, 0.5, { f: 900, f2: 2300, q: 1.3, peak: 0.8, att: 0.05, rel: 0.32 }); k.nz(0, 0.5, { f: 1900, f2: 3400, q: 2, peak: 0.4, att: 0.05, rel: 0.32 }); k.nz(0, 0.45, { type: 'highpass', f: 4500, peak: 0.05, att: 0.05, rel: 0.3 });
      voiced(k, 0.03, 0.4, { f0: 250, formants: [[700, 4, 1], [1500, 6, 0.4]], peak: 0.22, rough: 0.5, c0: 0.9, c1: 1.1, c2: 1.25 });
    }, { rev: 0.1 });
  }
  function snoreBreath(k, a, len, lv) {   // an inhalation with the soft palate fluttering
    const fr = R(26, 40), am = gn(0.5), env = gn(0), T = k.t + a, lfo = k.osc('sawtooth', fr, a, len + 0.05);
    lr(lfo.frequency, T, fr * 0.8, len * 0.4, fr * 1.15, len * 0.6, fr * 0.7); chain(lfo, gn(0.5), am.gain);
    k.nz(a, len, { kind: 'pink', f: 260, q: 1.3, peak: 1, att: 0.02, rel: 0.02, dest: am }); k.nz(a, len, { f: 950, q: 1.6, peak: 0.25, att: 0.02, rel: 0.02, dest: am });
    chain(lfo, fl('lowpass', 140, 0.7), gn(0.25), env); lr(env.gain, T, 0, len * 0.35, lv, len * 0.35, lv * 0.8, len * 0.3, 0); chain(am, env, k.out);
  }
  function snore(on) {
    on = !!on; if (on === !!S.snore) return;
    S.snore = on; if (!on) { sched.delete('snore'); return; }
    every('snore', te => { shot('medical', k => { const L = R(1.3, 1.8); snoreBreath(k, 0, L, 0.8); k.nz(L + 0.25, 1.1, { kind: 'pink', type: 'lowpass', f: 600, peak: 0.07, att: 0.3, rel: 0.7 }); }, { at: te, rev: 0.1 }); return R(4.1, 5.2); }, 0.1);
  }
  function agonal() {
    shot('medical', k => {
      const L = R(0.55, 0.8); snoreBreath(k, 0, L, 1); k.nz(0, L, { f: 1300, f2: 2100, q: 1.5, peak: 0.22, att: 0.05, rel: L * 0.5 });
      voiced(k, L * 0.55, 0.45, { f0: 120, formants: [[520, 4, 1], [1100, 6, 0.3]], peak: 0.3, breath: 0.1, rough: 1, c0: 1, c1: 0.9, c2: 0.6 }); k.click(L + 0.42, 0.05, 900, 2);
    }, { rev: 0.1 });
  }
  function vomit() {
    shot('medical', k => {
      voiced(k, 0, 0.5, { f0: 125, formants: [[480, 3, 1], [1000, 5, 0.5], [2300, 6, 0.1]], peak: 0.6, breath: 0.25, rough: 1, c0: 1.2, c1: 1, c2: 0.6, att: 0.05 });
      k.nz(0.3, 0.9, { kind: 'pink', type: 'lowpass', f: 1500, f2: 600, peak: 0.5, curve: grains(80, 0.6, x => Math.min(1, x * 8) * (1 - x) ** 1.3) });
      k.nz(0.3, 0.7, { f: 2600, q: 0.7, peak: 0.1, curve: grains(60, 0.5, x => 1 - x) });
      for (let i = 0; i < 9; i++) k.tone(0.35 + R(0.9), 0.04, { f: R(250, 600), f2: R(600, 1500), peak: R(0.03, 0.09), att: 0.004, rel: 0.02 });
    }, { rev: 0.12 });
  }
  function stretcher(kind = 'roll') {
    shot('medical', k => {
      const clack = (a, lv = 1) => { k.click(a, 0.35 * lv, 2100, 2); k.ping(a, 1450, 0.08 * lv, 0.02); k.ping(a, 3120, 0.04 * lv, 0.012); k.thud(a, 150, 0.35 * lv, 0.025); };
      const roll = (a, len, lv) => {
        k.nz(a, len, { kind: 'brown', f: 210, q: 0.7, peak: 0.55 * lv, att: len * 0.2, rel: len * 0.3 }); k.nz(a, len, { f: 1400, q: 0.8, peak: 0.05 * lv, curve: grains(Math.round(len * 40) + 8, 0.35) });
        for (let i = 0, n = len * 5 | 0; i < n; i++) k.click(a + R(len), R(0.03, 0.09) * lv, R(1300, 3200), 3);   // casters chattering
      };
      if (kind === 'raise') {   // powered cot: hydraulic pump whine, then the lock
        const g = gn(0), T = k.t, d = 1.7, o = k.osc('sawtooth', 190, 0, d + 0.1), o2 = k.osc('square', 380, 0, d + 0.1, 6);
        for (const [x, m] of [[o, 1], [o2, 2]]) lr(x.frequency, T, 120 * m, 0.12, 205 * m, d - 0.3, 190 * m, 0.18, 110 * m);
        lr(g.gain, T, 0, 0.05, 0.16, d - 0.15, 0.16, 0.1, 0); o.connect(g); chain(o2, gn(0.4), g); chain(g, fl('bandpass', 900, 0.8), k.out); chain(g, fl('lowpass', 400, 0.7), gn(0.5), k.out);
        k.nz(0, d, { f: 2600, q: 0.8, peak: 0.03, att: 0.1, rel: 0.2 }); clack(d + 0.05);
      } else if (kind === 'lower') {
        k.nz(0, 1.1, { type: 'highpass', f: 2200, q: 0.6, peak: 0.07, att: 0.03, rel: 0.6 }); k.click(0, 0.2, 1800, 2);
        for (let i = 0; i < 6; i++) clack(0.15 + i * 0.14, 0.35);
        clack(1.1, 1);
      } else if (kind === 'load') { roll(0, 0.9, 0.8); clack(0.55, 0.9); clack(0.8, 0.8); k.thud(1.0, 70, 0.5, 0.05); clack(1.05, 1); }
      else roll(0, 1.4, 1);
    }, { rev: 0.12 });
  }

  // ================================================================ ambience
  // Each bed is a continuous voice; AMBEV adds the irregular events on top (returns seconds until the next one).
  function syllBuf() {   // 24 s of syllable-shaped gating for the bar's murmur of voices
    if (bufs.syll) return bufs.syll;
    const csr = 3000, n = csr * 24, b = ctx.createBuffer(1, n, csr), d = b.getChannelData(0), r = mulberry(404); let i = 0, v = 0;
    while (i < n) { const on = r() < 0.72, L = (on ? lerp(0.09, 0.3, r()) : lerp(0.05, 0.6, r() ** 2)) * csr | 0, tgt = on ? lerp(0.4, 1, r()) : 0; for (let j = 0; j < L && i < n; j++, i++) { v += (tgt - v) * 0.004; d[i] = v; } }
    return bufs.syll = b;
  }
  const hum = (c, list, lp = 0) => { for (const [f, a] of list) { const o = c.osc(lp ? 'sawtooth' : 'sine', f); if (lp) chain(o, fl('lowpass', lp, 0.7), gn(a), c.out); else chain(o, gn(a), c.out); } };
  const AMB = {
    townDay: c => {
      const g = gn(0.16); chain(c.noise('brown'), fl('lowpass', 420, 0.6), g, c.out);                       // the town's traffic, far off
      chain(c.osc('sine', 0.06), gn(0.05), g.gain); chain(c.osc('sine', 0.17), gn(0.03), g.gain);
      chain(c.noise('pink'), fl('bandpass', 700, 0.5), gn(0.1), pn(-0.3), c.out); chain(c.noise('pink', 0.8), fl('bandpass', 1100, 0.6), gn(0.05), pn(0.4), c.out);
    },
    townNight: c => {
      const g = gn(0.14); chain(c.noise('brown'), fl('lowpass', 220, 0.6), g, c.out); chain(c.osc('sine', 0.045), gn(0.05), g.gain);   // the highway beyond the river
      hum(c, [[60, 0.008], [120.3, 0.012], [180, 0.004]]); hum(c, [[120, 0.006]], 1400);                                               // transformer, a street lamp's ballast
      chain(c.noise('pink'), fl('bandpass', 500, 0.5), gn(0.035), c.out);
    },
    room: c => {
      hum(c, [[59.8, 0.014], [120.1, 0.012], [179.6, 0.005], [240, 0.0025]]);                                // the fridge
      chain(c.noise('brown'), fl('bandpass', 180, 1), gn(0.1), pn(-0.4), c.out); chain(c.noise('pink'), fl('lowpass', 420, 0.6), gn(0.03), c.out);
    },
    gym: c => {
      chain(c.noise('pink'), fl('bandpass', 520, 0.4), gn(0.1), c.out); chain(c.noise('brown'), fl('lowpass', 120, 0.7), gn(0.12), c.out);   // air handlers in a big hard room
      const g = gn(0.03); chain(c.osc('sawtooth', 87), fl('lowpass', 420, 1), g, pn(0.5), c.out); chain(c.osc('sine', 2.8), gn(0.012), g.gain);   // a treadmill belt
      chain(c.noise('pink'), fl('bandpass', 2400, 0.8), gn(0.02), pn(0.5), c.out);
    },
    bar: c => {
      const sum = gn(1), lp = fl('lowpass', 2600, 0.6);
      for (let i = 0; i < 6; i++) {   // six "talkers": a wandering glottal pitch through two moving formants, gated in syllables
        const f0 = R(95, 230), o = c.osc('sawtooth', f0), g = gn(0), f1 = fl('bandpass', R(450, 750), 4), f2 = fl('bandpass', R(1100, 1900), 6);
        chain(c.osc('sine', R(0.15, 0.45)), gn(f0 * 0.12), o.frequency); chain(c.osc('sine', R(1.5, 3.5)), gn(180), f1.frequency); chain(c.osc('sine', R(1.1, 2.9)), gn(420), f2.frequency);
        o.connect(f1); o.connect(f2); f1.connect(g); chain(f2, gn(0.5), g); chain(c.loop(syllBuf(), R(0.8, 1.25), R(20)), g.gain); chain(g, pn(R(-0.8, 0.8)), sum);
      }
      chain(sum, lp, gn(0.55), c.out); c.send(lp, 0.5, 'room');
      chain(c.noise('pink'), fl('bandpass', 900, 0.5), gn(0.09), c.out); chain(c.noise('brown'), fl('lowpass', 110, 0.7), gn(0.1), c.out);
    },
    hospital: c => {
      chain(c.noise('pink'), fl('bandpass', 700, 0.4), gn(0.07), c.out); chain(c.noise('brown'), fl('lowpass', 100, 0.7), gn(0.08), c.out);   // ventilation
      hum(c, [[120, 0.006]], 900);                                                                                                         // light fittings
    },
    ambulance: c => {
      hum(c, [[60, 0.03], [120, 0.012]], 320); hum(c, [[7800, 0.0012]]);                                   // inverter
      chain(c.noise('pink'), fl('bandpass', 1900, 1.5), gn(0.035), c.out);                                  // its fan
      chain(c.noise('brown'), fl('lowpass', 80, 0.7), gn(0.12), c.out);                                     // the box
    },
  };
  function distantCar(te, lv = 1) {
    const L = R(3.5, 6);
    shot('outside', k => {
      xr(k.nz(0, L, { kind: 'pink', f: 220, q: 0.6, peak: 0.6 * lv, att: L * 0.5, rel: L * 0.5 }).f.frequency, k.t, 220, L * 0.5, 420, L * 0.5, 200);
      k.nz(0, L, { type: 'highpass', f: 2000, q: 0.5, peak: (0.02 + 0.08 * S.wet) * lv, att: L * 0.5, rel: L * 0.5 });
    }, { at: te, pan: R(-0.7, 0.7), gain: 0.14 });
  }
  let tock = false;
  const AMBEV = {
    townDay: te => {
      if (rng() < 0.6) shot('outside', k => {   // a bird phrase
        const f = R(2600, 4800); let a = 0;
        for (let i = 0, n = 2 + (R(5) | 0); i < n; i++) { const L = R(0.05, 0.13); k.tone(a, L, { f: f * R(0.85, 1.15), f2: f * R(0.7, 1.4), peak: 1, att: 0.01, rel: L * 0.5 }); a += L + R(0.03, 0.12); }
      }, { at: te, pan: R(-0.9, 0.9), gain: R(0.01, 0.035), rev: 0.5 });
      else distantCar(te);
      return R(1.2, 5);
    },
    townNight: te => { distantCar(te, 0.6); return R(7, 16); },
    room: te => { tock = !tock; shot('vehicle', k => { k.click(0, 0.05, tock ? 2900 : 3400, 4); k.ping(0, tock ? 1750 : 2100, 0.012, 0.006); }, { at: te, pan: 0.4, rev: 0.25 }); return 1; },   // wall clock
    gym: te => {
      shot('vehicle', k => { k.thud(0, 58, 0.09, 0.05, 0.6); }, { at: te });   // somebody's playlist through the wall
      if (rng() < 0.07) shot('vehicle', k => { k.thud(0, 110, 0.2, 0.04); for (let i = 0, n = 2 + (R(3) | 0); i < n; i++) k.ping(R(0.06), R(900, 3400), R(0.03, 0.08), R(0.08, 0.3), 'triangle'); }, { at: te + R(0.4), pan: R(-0.8, 0.8), rev: 0.6, gain: R(0.3, 0.8) });   // plates racked
      return 60 / 124;
    },
    bar: te => { shot('vehicle', k => { const f = R(2800, 5600); k.ping(0, f, 0.05, R(0.03, 0.09)); k.ping(R(0.01, 0.05), f * R(1.1, 1.4), 0.04, R(0.03, 0.08)); k.click(0, 0.05, 3000, 2); }, { at: te, pan: R(-0.8, 0.8), rev: 0.4, gain: R(0.3, 0.9) }); return R(1.5, 6); },   // glasses
    hospital: te => {
      const r = rng();
      if (r < 0.5) shot('vehicle', k => { const f = pick([784, 880, 698]); for (let i = 0, n = 3 + (R(4) | 0); i < n; i++) k.tone(i * 0.92, 0.09, { type: WAVE.beep, f, peak: 1, att: 0.004, rel: 0.03 }); }, { at: te, pan: R(-0.7, 0.7), gain: R(0.008, 0.02), rev: 0.5 });   // a monitor down the corridor
      else if (r < 0.7) shot('vehicle', k => { bell(k, 0, 659.3, 1, 0.35); bell(k, 0.55, 523.3, 1, 0.5); }, { at: te, gain: 0.02, rev: 0.6 });   // overhead page chime
      else shot('vehicle', k => { const L = R(1.5, 3); k.nz(0, L, { kind: 'brown', f: 200, q: 0.7, peak: 1, att: L * 0.4, rel: L * 0.5 }); for (let i = 0; i < L * 4; i++) k.click(R(L), R(0.02, 0.06), R(1500, 3000), 3); }, { at: te, pan: R(-0.7, 0.7), gain: 0.12, rev: 0.4 });   // a trolley
      return R(4, 10);
    },
    ambulance: te => { shot('vehicle', k => { for (let i = 0, n = 1 + (R(4) | 0); i < n; i++) { const a = R(0.2); k.click(a, R(0.03, 0.1), R(1200, 3600), 3); if (rng() < 0.4) k.ping(a, R(1500, 4200), 0.015, R(0.01, 0.04)); } if (rng() < 0.3) k.thud(R(0.1), R(120, 200), 0.06, 0.02); }, { at: te, pan: R(-0.7, 0.7) }); return R(1.2, 4.5); },   // kit shifting in the cabinets
  };
  function ambient(kind = 'none') {
    if (!AMB[kind]) kind = 'none';
    if (kind === S.ambient && (kind === 'none' || V['amb_' + kind])) return;
    const old = V['amb_' + S.ambient]; if (old) { lvl(old, 0); to(old.out.gain, 0, 0.5); }
    S.ambient = kind; sched.delete('amb'); if (kind === 'none') return;
    const v = voice('amb_' + kind, kind.startsWith('town') ? 'outside' : 'vehicle', AMB[kind]); lvl(v, 1); to(v.out.gain, 1, 0.6);
    every('amb', te => S.ambient === kind ? AMBEV[kind](te) : null, R(0.5, 2));
  }

  // ================================================================ music
  // A restrained generative score: slow pad chords with voice-led overlaps, felt-piano notes built from additive
  // partials, low pulses, tremolo strings, all into the long hall. One mood plays at a time; changing mood crossfades.
  let MUS = null;
  function music(mood = 'off') {
    if (!MOODS[mood]) mood = 'off';
    if (mood === S.music) return;
    S.music = mood; const t = now();
    if (MUS) { const o = MUS; fade(o.bus.gain, 0, 3); fade(o.rbus.gain, 0, 3); trash.push({ at: t + 3.2, nodes: [o.bus, o.rbus] }); MUS = null; }
    if (mood === 'off') return;
    const M = MOODS[mood], m = MUS = { M, bus: gn(0), rbus: gn(0), dt: 30 / M.bpm, step: 0, next: t + 0.12, ci: -1, ch: null, wait: 3 + (R(6) | 0), q: [], last: null };
    m.bus.connect(B.music); m.rbus.connect(reverb('hall')); lr(m.bus.gain, t, 0, 3, 1); lr(m.rbus.gain, t, 0, 3, 1);
  }
  function musicTick(t) {
    const m = MUS; if (!m) return; const M = m.M;
    if (m.next < t - 0.3) { m.next = t + 0.05; m.step = Math.ceil(m.step / M.len) * M.len; }   // stalled: start over on a fresh chord
    while (m.next < t + 0.45) {
      const T = m.next, s = m.step % M.len;
      if (s === 0) {   // next chord: usually the next in the list, sometimes a jump, never a repeat
        m.ci = m.ci < 0 ? 0 : rng() < 0.25 ? (m.ci + 1 + (R(M.chords.length - 1) | 0)) % M.chords.length : (m.ci + 1) % M.chords.length;
        m.ch = M.chords[m.ci]; padChord(m, T, m.ch, M.len * m.dt);
      }
      if (M.pulse) pulseStep(m, T, s);
      if (M.riser && s === M.len - 8 && rng() < 0.5) riser(m, T, 8 * m.dt);
      pianoStep(m, T);
      m.step++; m.next += m.dt;
    }
  }
  function padChord(m, T, ch, len) {
    const M = m.M, P = M.pad, grp = gn(0), lp = fl('lowpass', P.cut * 0.5, 0.5), att = m.step === 0 ? 1.2 : Math.min(4, len * 0.4), rel = 5, end = T + len + rel, nodes = [grp];   // the first chord of a mood comes in with the crossfade
    lr(grp.gain, T, 0, att, P.lvl, len - att, P.lvl * 0.85, rel, 0);
    lr(lp.frequency, T, P.cut * 0.5, len * 0.6, P.cut * R(0.9, 1.35), len * 0.4 + rel, P.cut * 0.45);   // each chord breathes open and closed
    ch.forEach((n, i) => {
      const f = mtof(n), bass = i === 0, g = gn((bass ? 1.1 : 0.55) / Math.sqrt(ch.length)), p = pn(bass ? 0 : (i % 2 ? 1 : -1) * R(0.2, 0.65));
      for (const det of bass ? [0, 4] : [-7, 6]) { const o = os(bass ? 'triangle' : 'sawtooth', f, det + R(-2, 2)); o.start(T); o.stop(end + 0.05); o.connect(g); }
      chain(g, p, lp);
    });
    chain(lp, grp, m.bus); const s = gn(0.4); grp.connect(s); s.connect(m.rbus); nodes.push(s);
    if (M.shim) {   // tremolo strings an octave above the top of the chord
      const sg = gn(0), trem = gn(0.6), lfo = os('sine', R(4.6, 6.4)), s2 = gn(0.6); lfo.start(T); lfo.stop(end); chain(lfo, gn(0.4), trem.gain);
      lr(sg.gain, T, 0, len * 0.5, M.shim, len * 0.5, M.shim * 0.7, rel * 0.6, 0);
      for (const n of ch.slice(-3)) for (const det of [-5, 6]) { const o = os('sawtooth', mtof(n + 12), det); o.start(T); o.stop(end); o.connect(trem); }
      chain(trem, fl('bandpass', 1900, 0.7), sg, m.bus); sg.connect(s2); s2.connect(m.rbus); nodes.push(sg, s2);
    }
    trash.push({ at: end + 0.2, nodes });
  }
  // Felt piano: two slightly detuned strings of mellow partials that ring on, a bright set that dies in a fraction of
  // a second, a soft hammer thump, and a low-pass that closes as the note decays.
  function piano(m, T, n, vel = 0.5) {
    const f = mtof(n), dur = clamp(6.2 - (n - 40) * 0.06, 2.2, 6.5), g = gn(0), gb = gn(0), hg = gn(0), lp = fl('lowpass', 800, 0.4), out = gn(vel * m.M.piano.lvl), p = pn(clamp((n - 64) / 40, -0.5, 0.5)), send = gn(0.55);
    for (const det of [-2.5, 3]) { const o = os(WAVE.pianoBody, f, det); o.start(T); o.stop(T + dur); o.connect(g); }
    const ob = os(WAVE.pianoBright, f), hs = nz('pink'); ob.start(T); ob.stop(T + 1.5); hs.start(T, R(2)); hs.stop(T + 0.08);
    perc(gb.gain, T, 0.3 * vel, 0.003, 0.08 + 0.22 * clamp(1 - (n - 30) / 70));
    perc(hg.gain, T, 0.5 * vel, 0.002, 0.009);
    g.gain.setValueAtTime(0, T); g.gain.linearRampToValueAtTime(0.5, T + 0.006); g.gain.setTargetAtTime(0.24, T + 0.006, 0.22); g.gain.setTargetAtTime(0, T + 0.55, dur / 3.4); tail(g.gain, T + dur - 0.15, 0.14);
    lp.frequency.setValueAtTime(Math.min(9000, f * (4 + 10 * vel)), T); lp.frequency.setTargetAtTime(Math.min(4000, f * 2.2), T, 0.35);
    chain(ob, gb, lp); chain(g, lp, out, p); chain(hs, fl('bandpass', Math.min(2800, f * 3), 0.8), hg, out);
    p.connect(m.bus); p.connect(send); send.connect(m.rbus);
    trash.push({ at: T + dur + 0.3, nodes: [p, send] });
  }
  function pianoStep(m, T) {
    const P = m.M.piano; if (!P) return;
    if (m.wait > 0) { m.wait--; return; }
    if (!m.q.length) compose(m);
    const ev = m.q.shift(); if (!ev) return;
    piano(m, T + R(0.015), ev.n, ev.v); if (ev.n2 && ev.n2 !== ev.n) piano(m, T + R(0.015, 0.04), ev.n2, ev.v * 0.7);
    m.wait = ev.gap; if (!m.q.length) m.wait += P.rest[0] + (R(P.rest[1] - P.rest[0]) | 0);
  }
  function compose(m) {   // write the next little phrase from the chord that is sounding
    const P = m.M.piano, pcs = new Set(m.ch.map(n => n % 12)), chordT = [], scaleT = [];
    for (let n = P.lo; n <= P.hi; n++) { if (pcs.has(n % 12)) chordT.push(n); if (pcs.has(n % 12) || m.M.scale.includes(n % 12)) scaleT.push(n); }
    const near = (arr, x) => arr.reduce((b, n) => Math.abs(n - x) < Math.abs(b - x) ? n : b, arr[0]), vel = () => R(0.45, 0.8);
    if (P.style === 'arp') {   // a broken chord, rising (sometimes turning back)
      let i = R(chordT.length * 0.5) | 0; const n = 3 + (R(4) | 0), gap = rng() < 0.6 ? 1 : 2, turn = !P.rise && rng() < 0.35 ? n - 2 : 99;
      for (let j = 0; j < n; j++) { m.q.push({ n: chordT[clamp(i, 0, chordT.length - 1)], v: vel() * (0.75 + 0.25 * j / n), gap: j === n - 1 ? 0 : gap - 1 }); i += j >= turn ? -1 : rng() < 0.25 ? 2 : 1; }
    } else if (P.style === 'low') {   // a deep note, perhaps answered far above
      const lowT = chordT.filter(n => n < P.lo + 14), hiT = chordT.filter(n => n > P.hi - 20);
      m.q.push({ n: pick(lowT.length ? lowT : chordT), v: R(0.6, 0.9), gap: 2 + (R(4) | 0) });
      if (rng() < 0.7) m.q.push({ n: pick(hiT.length ? hiT : chordT), v: R(0.3, 0.5), gap: rng() < 0.4 ? 1 : 0 });
      if (rng() < 0.4) m.q.push({ n: near(scaleT, m.q[m.q.length - 1].n + pick([-2, -1, 1])), v: R(0.25, 0.4), gap: 0 });
    } else {   // a sparse melody moving by step and coming to rest on a chord tone
      let i = scaleT.indexOf(near(scaleT, (m.last ?? (P.lo + P.hi) / 2) + R(-4, 4))); const n = 1 + (R(4) | 0);
      for (let j = 0; j < n; j++) {
        i = clamp(i + pick(P.fall ? [-2, -1, -1, -1, 1] : [-2, -1, -1, 1, 1, 2]), 0, scaleT.length - 1); let note = scaleT[i];
        if (j === n - 1) { note = near(chordT, note); i = scaleT.indexOf(note); }
        m.q.push({ n: note, v: vel(), gap: j === n - 1 ? 0 : 1 + (R(3) | 0), n2: rng() < 0.2 ? near(chordT, note - R(7, 10)) : 0 });
      }
    }
    m.last = m.q[m.q.length - 1].n;
    if (P.fall && m.last < P.lo + 5) m.last = P.hi - 4;   // a falling line starts again from the top
  }
  function pulseNote(m, T, n, vel, bright = 1) {
    const f = mtof(n), o = os('sawtooth', f), o2 = os('sine', f / 2), lp = fl('lowpass', f * 1.5, 1.2), g = gn(0), s = gn(0.15);
    o.start(T); o.stop(T + 0.7); o2.start(T); o2.stop(T + 0.7);
    lp.frequency.setValueAtTime(f * (2 + 7 * bright * vel), T); lp.frequency.setTargetAtTime(f * 1.3, T, 0.07);
    perc(g.gain, T, vel * m.M.pulseLvl, 0.006, 0.085); o.connect(lp); chain(o2, gn(0.7), lp); chain(lp, g, m.bus); g.connect(s); s.connect(m.rbus);
    trash.push({ at: T + 0.9, nodes: [g, s] });
  }
  function pulseStep(m, T, s) {
    const M = m.M, root = m.ch[0] + (m.ch[0] < 31 ? 24 : 12), fifth = root + 7;
    if (M.pulse === 'eighth') pulseNote(m, T, s % 16 === 14 ? fifth : root, s % 4 === 0 ? 1 : s % 2 === 0 ? 0.7 : 0.45, 0.6);
    else if (M.pulse === 'quarter') { if (s % 2 === 0) pulseNote(m, T, s % 8 === 6 ? fifth : root, s % 4 === 0 ? 1 : 0.6, 0.4); }
    else if (M.pulse === 'ost') {
      pulseNote(m, T, root, s % 2 === 0 ? 1 : 0.55, 0.8); if (s % 4 === 3) pulseNote(m, T + m.dt / 2, root, 0.4, 0.6);
      if (s % 8 === 0 || s % 8 === 3 || s % 8 === 6) pulseNote(m, T, m.ch[m.ch.length - 2] + 12, 0.35, 1.3);
    } else if (M.pulse === 'heart' && s % 4 === 0) for (const [a, lv] of [[0, 1], [0.26, 0.6]]) {   // a slow heartbeat under the tension
      const o = os('sine', 60), g = gn(0); o.start(T + a); o.stop(T + a + 0.55); xr(o.frequency, T + a, 62, 0.15, 38); perc(g.gain, T + a, lv * M.pulseLvl, 0.008, 0.07); chain(o, g, m.bus);
      trash.push({ at: T + a + 0.7, nodes: [g] });
    }
  }
  function riser(m, T, len) {
    const s = nz('pink'), f = fl('bandpass', 300, 2.5), g = gn(0), r = gn(0.6);
    s.start(T, R(2)); s.stop(T + len + 0.1); xr(f.frequency, T, 300, len, 3200); lr(g.gain, T, 0, len * 0.95, 0.09, len * 0.05, 0); chain(s, f, g, m.bus); g.connect(r); r.connect(m.rbus);
    trash.push({ at: T + len + 0.3, nodes: [g, r] });
  }

  return {
    ctx, state: S, setVolume, setInterior, update: pump,
    engine, siren, airhorn, tires, wind, rain, rainOnRoof, thunder, crash, bump, indicator, reverseBeeper, doorSlam, seatbelt, handbrake, passBy, carHorn,
    dispatchTones, radioSquelch, radioStatic, ui,
    monitorBeep, alarm, flatline, defibCharge, defibReady, shock, metronome, cprThump, ribCrack, bvm, suction, oxygen, nibp, breathSound, heartSound, stethoscope,
    velcro, shears, zipper, packaging, glove, tape, drawer, needlePop, airHiss, drill, scalpel, boneSaw, suctionSlurp, bloodDrip, vomit, cough, gasp, groan, snore, agonal, stretcher,
    ambient, music,
    debug: { V, B, sched, trash, SEQ, beepF, get music() { return MUS; } },
  };
}

// ==================================================================== the singleton
let core = null, actx = null, paused = false;
const stash = new Map(), warned = new Set(), speaking = new Set();
// state setters: if called before init() the last arguments are kept and replayed once the context exists
const STATEFUL = new Set(['setVolume', 'setInterior', 'ambient', 'music', 'rain', 'rainOnRoof', 'wind', 'radioStatic', 'alarm', 'flatline', 'siren', 'airhorn', 'indicator', 'reverseBeeper', 'metronome', 'suction', 'oxygen', 'snore', 'stethoscope', 'defibReady']);
const FORWARD = ['setInterior', 'engine', 'siren', 'airhorn', 'tires', 'wind', 'rain', 'rainOnRoof', 'thunder', 'crash', 'bump', 'indicator', 'reverseBeeper', 'doorSlam', 'seatbelt', 'handbrake', 'passBy', 'carHorn',
  'radioSquelch', 'radioStatic', 'ui', 'monitorBeep', 'alarm', 'flatline', 'defibCharge', 'defibReady', 'shock', 'metronome', 'cprThump', 'ribCrack', 'bvm', 'suction', 'oxygen', 'nibp', 'breathSound', 'heartSound', 'stethoscope',
  'velcro', 'shears', 'zipper', 'packaging', 'glove', 'tape', 'drawer', 'needlePop', 'airHiss', 'drill', 'scalpel', 'boneSaw', 'suctionSlurp', 'bloodDrip', 'vomit', 'cough', 'gasp', 'groan', 'snore', 'agonal', 'stretcher', 'ambient', 'music'];
const vol = { ...VOL };
function call(name, args) {   // sound must never take the game down: errors are logged once per method and kept in Snd.errors
  if (!core) { if (STATEFUL.has(name)) stash.set(name, args); return undefined; }
  try { return core[name](...args); } catch (e) { Snd.errors.push(name + ': ' + (e && e.message || e)); if (!warned.has(name)) { warned.add(name); console.warn('[audio] ' + name, e); } return undefined; }
}

// speech: a different voice, rate and pitch for each role; "Natural" (Edge) and "Google" (Chrome) voices preferred
const FEM = /aria|jenny|michelle|\bana\b|emma|\bava\b|sonia|libby|zira|female|samantha|natasha|clara|hazel|susan|catherine|nancy|jane|amber|ashley|cora|elizabeth|monica|google us english/i;
const MALE = /\bguy\b|davis|andrew|brian|christopher|\beric\b|roger|steffan|ryan|david|\bmark\b|\bmale\b|william|thomas|tony|jason|jacob|george|james|daniel/i;
const ROLE = { dispatch: { female: true, rate: 1.12, pitch: 1, nth: 0 }, partner: { female: false, rate: 1.04, pitch: 0.95, nth: 0 }, patient: { rate: 0.92, pitch: 1, nth: 1 }, doctor: { female: false, rate: 1, pitch: 0.82, nth: 1 } };
function pickVoice(role, female) {
  let vs = []; try { vs = globalThis.speechSynthesis.getVoices() || []; } catch { /* none */ }
  let en = vs.filter(v => /^en\b/i.test(v.lang)); if (!en.length) en = vs; if (!en.length) return null;
  const score = v => (/natural/i.test(v.name) ? 8 : 0) + (/google/i.test(v.name) ? 5 : 0) + (/en[-_]US/i.test(v.lang) ? 2 : 0);
  const want = female ?? ROLE[role].female, pool = want == null ? en : en.filter(v => want ? FEM.test(v.name) && !MALE.test(v.name) : MALE.test(v.name));
  const list = (pool.length ? pool : en).slice().sort((a, b) => score(b) - score(a));
  return list[Math.min(ROLE[role].nth, list.length - 1)];
}

export const Snd = {
  errors: [],
  get ctx() { return actx; },
  get ready() { return !!core; },
  get core() { return core; },   // the createSound() instance, for tests and debugging
  // Create (or resume) the AudioContext. Call from a user gesture; safe to call again.
  init() {
    const wake = () => { if (actx && actx.state !== 'running' && !paused) actx.resume().catch(() => {}); };
    if (core) { wake(); return true; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return false;
    try { actx = new AC({ latencyHint: 'interactive' }); core = createSound(actx); } catch (e) { console.warn('[audio] unavailable', e); core = actx = null; return false; }
    for (const [name, args] of stash) call(name, args);
    stash.clear();
    setInterval(() => { if (core && actx.state === 'running') call('update', [0]); }, 100);
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) globalThis.addEventListener?.(ev, wake, { passive: true });   // autoplay policy: wake on the next gesture
    try { globalThis.speechSynthesis?.getVoices(); } catch { /* none */ }
    wake(); return true;
  },
  setVolume(v = {}) { for (const k in vol) if (Number.isFinite(v?.[k])) vol[k] = clamp(v[k]); call('setVolume', [{ ...vol }]); },
  suspendAll() { paused = true; try { actx?.suspend(); globalThis.speechSynthesis?.pause(); } catch { /* nothing to pause */ } },
  resumeAll() { paused = false; try { actx?.resume(); globalThis.speechSynthesis?.resume(); } catch { /* nothing to resume */ } },
  update(dt) { call('update', [dt]); },
  dispatchTones() { call('dispatchTones', []); return DISPATCH_TONES_SECONDS; },
  // Speak a line. opts: role 'dispatch' | 'partner' | 'patient' | 'doctor', onend(), female (voice hint).
  // onend always fires once (after an estimated time if speech is unavailable) unless stopSpeech() cancelled the line.
  say(text, { role = 'partner', onend, female } = {}) {
    if (!ROLE[role]) role = 'partner';
    const radio = role === 'dispatch', est = 0.7 + String(text ?? '').length * 0.07, rec = { stop: () => fin(false) };
    let done = false, timer = 0, opened = false;
    const open = () => { if (radio && !opened && !done) { opened = true; Snd.radioSquelch(true); Snd.radioStatic(0.3); } };
    function fin(ok) {
      if (done) return; done = true; clearTimeout(timer); speaking.delete(rec);
      if (opened) { Snd.radioSquelch(false); Snd.radioStatic(0); }
      if (ok && typeof onend === 'function') try { onend(); } catch (e) { console.error(e); }
    }
    let queued = 0; for (const r of speaking) queued += r.est;
    rec.est = est; speaking.add(rec);
    try {
      const synth = globalThis.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined' || !text) throw 0;
      const u = new SpeechSynthesisUtterance(String(text)), v = pickVoice(role, female), r = ROLE[role];
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = r.rate; u.pitch = r.pitch * (role === 'patient' && female ? 1.1 : 1); u.volume = clamp(vol.master * (radio ? vol.radio : vol.sfx) * 1.25);
      u.onstart = open; u.onend = () => fin(true); u.onerror = e => fin(e.error !== 'canceled' && e.error !== 'interrupted');
      synth.speak(u);
      timer = setTimeout(() => fin(true), (queued + est * 1.8 + 4) * 1000);   // some engines never fire `end`
    } catch { open(); timer = setTimeout(() => fin(true), (queued + est) * 1000); }   // no speech: keep the pacing (and the radio noise)
  },
  stopSpeech() {
    for (const r of [...speaking]) r.stop();
    try { globalThis.speechSynthesis?.cancel(); } catch { /* none */ }
  },
};
for (const name of FORWARD) Snd[name] = (...args) => call(name, args);
