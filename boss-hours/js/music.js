// The score. Seven tracks written as data, rendered once into looping AudioBuffers, no audio files.
// Render is sample exact: loop + tail is rendered with OfflineAudioContext and the tail is folded back over the head.

const SR = 32000;            // stereo at 32 kHz keeps the buffers small and the top end soft
const TAIL = 3.5;            // seconds rendered past the loop, folded back over the start
const RMS_TARGET = 0.12;     // every track is normalised here so the seven sit together
const KNEE = 0.82;           // soft clip starts here; tracks should barely touch it

// ---- pitch and harmony
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], sus4: [0, 5, 7], aug: [0, 4, 8],
};
const hz = m => 440 * 2 ** ((m - 69) / 12);
const pcOf = n => (PC[n[0]] + (n.slice(1).match(/#/g) || []).length - (n.slice(1).match(/b/g) || []).length + 12) % 12;

export function midi(name) {
  const m = /^([A-G][b#]*)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return pcOf(m[1]) + 12 * (+m[2] + 1);
}

function parseChord(sym) {
  const m = /^([A-G][b#]?)(maj7|m7|dim7|dim|sus4|aug|m|7)?(?:\/([A-G][b#]?))?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const root = pcOf(m[1]), ints = QUAL[m[2] || ''];
  return { sym, root, ints, bass: m[3] ? pcOf(m[3]) : root, pcs: ints.map(i => (root + i) % 12) };
}

function parseProg(str, beats) {
  const out = [];
  let at = 0;
  for (const bar of str.split('|')) {
    const parts = bar.trim().split(',');
    const d = beats / parts.length;
    for (const p of parts) { out.push({ ...parseChord(p.trim()), at, dur: d }); at += d; }
  }
  return out;
}

function permutations(a) {
  if (a.length < 2) return [a];
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
}

// nearest pitch of class pc to prev inside the range
function nearest(prev, pc, low, high) {
  let m = prev - ((prev - pc) % 12 + 12) % 12;
  if (prev - m > 6) m += 12;
  while (m < low) m += 12;
  while (m > high) m -= 12;
  return m;
}

// voice each chord close to the last one so the harmony moves by step
function voiceLead(prog, n, low, high) {
  let prev = Array.from({ length: n }, (_, i) => Math.round(low + (high - low) * (i + 0.5) / n));
  return prog.map(ch => {
    const tones = ch.pcs.slice(0, Math.max(n, 3));
    while (tones.length < n) tones.push(tones.length === 3 ? ch.pcs[0] : ch.pcs[2]);
    let best = null, bestCost = 1e9;
    for (const p of permutations(tones.slice(0, n))) {
      const notes = p.map((pc, i) => nearest(prev[i], pc, low, high));
      const cost = notes.reduce((s, m, i) => s + Math.abs(m - prev[i]), 0);
      if (cost < bestCost) { bestCost = cost; best = notes; }
    }
    prev = best.slice().sort((a, b) => a - b);
    return prev;
  });
}

// ---- score builder: tracks call these to write events, times in beats
function makeScore(track) {
  const events = [];
  const spb = 60 / track.bpm, total = track.bars * track.beats;
  const add = (inst, m, at, dur, vel, o) => events.push({ inst, m, t: at * spb, d: Math.max(0.02, dur) * spb, v: vel, o: o || {} });

  const b = {
    prog: str => parseProg(str, track.beats),
    hit: (inst, m, at, dur, vel, o) => add(inst, typeof m === 'string' ? midi(m) : m, at, dur, vel, o),

    // 'D4:2 F4:1 _:1 | ...': note:beats, _ is a rest, bar lines are decoration
    line(inst, seq, { at = 0, vel = 0.8, oct = 0, leg = 0.92, o } = {}) {
      let pos = at;
      for (const tok of seq.split(/\s+/)) {
        if (!tok || tok === '|') continue;
        const [n, d] = tok.split(':');
        const dur = parseFloat(d);
        if (n !== '_') add(inst, midi(n) + oct * 12, pos, dur * leg, vel, o);
        pos += dur;
      }
    },

    // one sustained chord for each progression entry
    pad(inst, prog, { n = 4, low = 55, high = 76, vel = 0.4, o, overlap = 1 } = {}) {
      const voices = voiceLead(prog, n, low, high);
      prog.forEach((ch, i) => voices[i].forEach(m => add(inst, m, ch.at, ch.dur * overlap, vel, o)));
    },

    // rhythmic chords: digits are velocity, dots are rests, one pattern per bar
    stab(inst, prog, pattern, { n = 3, low = 55, high = 76, vel = 0.6, len = 0.7, o } = {}) {
      const voices = voiceLead(prog, n, low, high);
      const step = track.beats / pattern.length;
      for (let bar = 0; bar < track.bars; bar++) {
        for (let s = 0; s < pattern.length; s++) {
          const c = pattern[s];
          if (c === '.') continue;
          const at = bar * track.beats + s * step;
          const idx = prog.findIndex(ch => at >= ch.at && at < ch.at + ch.dur);
          if (idx < 0) continue;
          voices[idx].forEach(m => add(inst, m, at, step * len, vel * (+c) / 9, o));
        }
      }
    },

    // arpeggio or ostinato: tokens 1 3 5 7 8 are chord tones, -1 -5 are an octave down, - is a rest
    arp(inst, prog, pattern, { oct = 3, step = 1, vel = 0.7, len = 0.9, o, accent } = {}) {
      const toks = pattern.split(/\s+/).filter(Boolean);
      const base = 12 * (oct + 1);
      for (const ch of prog) {
        let i = 0;
        for (let at = ch.at; at < ch.at + ch.dur - 1e-6; at += step, i++) {
          const tk = toks[i % toks.length];
          if (tk === '-') continue;
          let v = +tk, down = 0;
          if (v < 0) { v = -v; down = 12; }
          const int = v === 1 ? 0 : v === 3 ? ch.ints[1] : v === 5 ? ch.ints[2] : v === 7 ? (ch.ints[3] ?? 10) : 12;
          const root = v === 1 ? ch.bass : ch.root;
          const acc = accent ? accent[i % accent.length] : 1;
          add(inst, base + root + int - down, at, step * len, vel * acc, o);
        }
      }
    },

    // drums: digit pattern repeated each bar (or span), o.note sets pitch
    beat(inst, pattern, { note = 'C3', vel = 0.8, from = 0, bars = track.bars, span = track.beats, o } = {}) {
      const m = midi(note);
      const step = span / pattern.length;
      const spans = Math.round(bars * track.beats / span);
      for (let k = 0; k < spans; k++) {
        for (let s = 0; s < pattern.length; s++) {
          const c = pattern[s];
          if (c === '.') continue;
          add(inst, m, from * track.beats + k * span + s * step, step, vel * (+c) / 9, o);
        }
      }
    },
    total,
  };
  return { b, events };
}

// ---- synthesis context and voices
const BUS = {
  strings: { lp: 2600, rev: 0.45, sides: 0.6, chorus: [0.55, 0.0035] },
  lowstr: { lp: 950, rev: 0.25, sides: 0.35 },
  spic: { lp: 2400, rev: 0.25, sides: 0.5 },
  horn: { lp: 1500, rev: 0.6, sides: 0.3, vib: [4.6, 3] },
  brass: { rev: 0.5, sides: 0.35, vib: [4.8, 4] },
  choir: { formants: [[650, 2.2, 1], [1080, 3, 0.7], [2500, 5, 0.2]], rev: 0.75, sides: 0.6, chorus: [0.42, 0.005] },
  flute: { rev: 0.6, sides: 0.2, vib: [5.3, 9] },
  fiddle: { lp: 3200, rev: 0.4, sides: 0.2, vib: [6, 10] },
  reed: { lp: 2000, rev: 0.3, sides: 0.35 },
  pizz: { rev: 0.35, sides: 0.25 },
  harp: { rev: 0.6, sides: 0.5 },
  bell: { rev: 0.8, sides: 0.3 },
  drum: { lp: 3500, rev: 0.32 },
  metal: { lp: 6000, rev: 0.4, sides: 0.3 },
  air: { lp: 5000, rev: 0.6, sides: 0.5 },
  sub: { lp: 180, rev: 0 },
  wood: { rev: 0.28, sides: 0.35 },
};

function mulberry(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let sharedNoise = null;
function noiseBuffer(c) {
  if (sharedNoise && sharedNoise.sampleRate === c.sampleRate) return sharedNoise;
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0), r = mulberry(77);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  sharedNoise = b;
  return b;
}

// a hall: stereo noise with an exponential decay that darkens as it fades
function impulse(c, secs, seed) {
  const n = Math.floor(secs * c.sampleRate);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), r = mulberry(seed + ch * 101);
    let lp = 0;
    const pre = Math.floor(0.018 * c.sampleRate);
    for (let i = pre; i < n; i++) {
      const u = i / n;
      const cut = 0.5 * (1 - u) ** 2 + 0.05;
      lp += (r() * 2 - 1 - lp) * cut;
      d[i] = lp * Math.exp(-6.2 * u) * (1 - u);
    }
  }
  return buf;
}

function getBus(R, name) {
  if (R.buses[name]) return R.buses[name];
  const s = BUS[name], c = R.c;
  const input = c.createGain();
  let last = input;
  if (s.formants) {
    const sum = c.createGain();
    for (const [f, q, amp] of s.formants) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const lv = c.createGain(); lv.gain.value = amp;
      input.connect(bp); bp.connect(lv); lv.connect(sum);
    }
    last = sum;
  } else if (s.lp) {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = s.lp; lp.Q.value = 0.5;
    input.connect(lp); last = lp;
  }
  last.connect(R.dry);
  if (s.rev) { const send = c.createGain(); send.gain.value = s.rev; last.connect(send); send.connect(R.wet); }
  const bus = { in: input, L: input, R: input, vib: null };
  const side = (pan, rate, phase) => {
    const p = c.createStereoPanner(); p.pan.value = pan;
    if (!s.chorus) { p.connect(input); return p; }
    // dry plus a slowly swept delay reads as a section rather than one player
    const d = c.createDelay(0.05); d.delayTime.value = 0.012 + phase * 0.004;
    const lfo = c.createOscillator(); lfo.frequency.value = rate;
    const depth = c.createGain(); depth.gain.value = s.chorus[1];
    lfo.connect(depth); depth.connect(d.delayTime); lfo.start(phase * 0.5); lfo.stop(R.end);
    const dry = c.createGain(); dry.gain.value = 0.8;
    const wet = c.createGain(); wet.gain.value = 0.62;
    p.connect(dry); p.connect(d); d.connect(wet); dry.connect(input); wet.connect(input);
    return p;
  };
  if (s.sides) {
    bus.L = side(-s.sides, (s.chorus?.[0] ?? 0) * 1.13, 0);
    bus.R = side(s.sides, (s.chorus?.[0] ?? 0) * 0.91, 1);
  }
  if (s.vib) {
    const lfo = c.createOscillator(); lfo.frequency.value = s.vib[0];
    const depth = c.createGain(); depth.gain.value = s.vib[1];
    lfo.connect(depth); lfo.start(0); lfo.stop(R.end);
    bus.vib = depth;
  }
  R.buses[name] = bus;
  return bus;
}

function osc(R, type, f, t, end, det, vib) {
  const s = R.c.createOscillator();
  s.type = type; s.frequency.value = f;
  if (det) s.detune.value = det;
  if (vib) vib.connect(s.detune);
  s.start(Math.max(0, t)); s.stop(end);
  return s;
}

// sustained envelope ending at exact zero
function env(R, t, d, v, a, r, dest, sus = 1, dec = 0.25) {
  const g = R.c.createGain(), p = g.gain;
  const at = Math.min(a, d * 0.8);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(v, t + at);
  if (sus !== 1) p.linearRampToValueAtTime(v * sus, Math.min(t + at + dec, t + d));
  p.setValueAtTime(v * sus, t + d);
  p.linearRampToValueAtTime(0, t + d + r);
  g.connect(dest);
  return g;
}

// percussive envelope: returns the node; the caller stops its sources at t + tau * 7
function decayEnv(R, t, v, tau, dest, a = 0.002) {
  const g = R.c.createGain(), p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(v, t + a);
  p.setTargetAtTime(0, t + a, tau);
  g.connect(dest);
  return g;
}

function lowpass(R, f, q = 0.7) {
  const n = R.c.createBiquadFilter();
  n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q;
  return n;
}

function noiseSrc(R, t, end) {
  const s = R.c.createBufferSource();
  s.buffer = R.noise; s.loop = true;
  s.start(Math.max(0, t), R.rng() * 1.9); s.stop(end);
  return s;
}

function membrane(R, f, t, v, tau, bend, click, busName = 'drum') {
  const b = getBus(R, busName);
  const end = t + tau * 7;
  const g = decayEnv(R, t, v, tau, b.in);
  const s = osc(R, 'sine', f * bend, t, end);
  s.frequency.setValueAtTime(f * bend, t);
  s.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  s.connect(g);
  if (click > 0) {
    const n = noiseSrc(R, t, t + 0.25), lp = lowpass(R, 1400), ng = decayEnv(R, t, v * click, 0.03, lp);
    n.connect(ng); lp.connect(b.in);
  }
}

// exported so tests can stub individual voices
export const VOICES = {
  strings(R, m, t, d, v, o) {
    const b = getBus(R, o.bus || 'strings'), f = hz(m), a = o.a ?? 0.25, r = o.r ?? 0.55, end = t + d + r + 0.05;
    for (const side of [b.L, b.R]) {
      const g = env(R, t, d, v * 0.3, a, r, side);
      for (const k of [-1, 1]) osc(R, 'sawtooth', f, t + R.rng() * 0.012, end, k * (3 + R.rng() * 7) + (side === b.L ? -2 : 2), b.vib).connect(g);
    }
  },
  lowstr(R, m, t, d, v, o) { VOICES.strings(R, m, t, d, v * 1.2, { a: 0.05, r: 0.2, bus: 'lowstr', ...o }); },
  spic(R, m, t, d, v) {
    const b = getBus(R, 'spic'), f = hz(m), end = t + d + 0.1;
    for (const side of [b.L, b.R]) {
      const g = env(R, t, d, v * 0.32, 0.006, 0.05, side, 0.5, 0.05);
      osc(R, 'sawtooth', f, t, end, side === b.L ? -5 : 5).connect(g);
    }
  },
  horn(R, m, t, d, v) {
    const b = getBus(R, 'horn'), f = hz(m), r = 0.4, end = t + d + r + 0.05;
    const g = env(R, t, d, v * 0.42, 0.09, r, b.R);
    const lp = lowpass(R, 300, 0.8);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(Math.min(1500, f * 3.8), t + 0.09);
    lp.connect(g);
    osc(R, 'sawtooth', f, t, end, -4, b.vib).connect(lp);
    osc(R, 'sawtooth', f, t, end, 5, b.vib).connect(lp);
    osc(R, 'triangle', f / 2, t, end, 0, b.vib).connect(lp);
  },
  brass(R, m, t, d, v, o) {
    const b = getBus(R, 'brass'), f = hz(m), r = o.r ?? 0.22, end = t + d + r + 0.05;
    const sides = o.mono ? [b.in] : [b.L, b.R];
    for (const side of sides) {
      const g = env(R, t, d, v * 0.32, 0.03, r, side, 0.82, 0.12);
      const lp = lowpass(R, 500, 1.2);
      const peak = Math.min(3200, f * 5 + 900 * v);
      lp.frequency.setValueAtTime(350, t);
      lp.frequency.linearRampToValueAtTime(peak, t + 0.07);
      lp.frequency.setTargetAtTime(peak * 0.55, t + 0.09, 0.28);
      lp.connect(g);
      osc(R, 'sawtooth', f, t, end, side === b.L ? -5 : 6, b.vib).connect(lp);
      osc(R, 'square', f * 0.998, t, end, side === b.L ? 4 : -3, b.vib).connect(lp);
    }
  },
  choir(R, m, t, d, v, o) {
    const b = getBus(R, 'choir'), f = hz(m), a = o.a ?? 0.7, r = o.r ?? 1.0, end = t + d + r + 0.05;
    for (const side of [b.L, b.R]) {
      const g = env(R, t, d, v * 1.1, a, r, side);
      for (const k of [-1, 1]) osc(R, 'sawtooth', f, t + R.rng() * 0.05, end, k * (4 + R.rng() * 6) + (side === b.L ? 3 : -3)).connect(g);
    }
  },
  flute(R, m, t, d, v) {
    const b = getBus(R, 'flute'), f = hz(m), r = 0.18, end = t + d + r + 0.05;
    const g = env(R, t, d, v * 0.42, 0.06, r, b.in);
    const add = R.c.createGain(); add.gain.value = 0.25; add.connect(g);
    osc(R, 'sine', f, t, end, 0, b.vib).connect(g);
    osc(R, 'triangle', f, t, end, 2, b.vib).connect(add);
  },
  fiddle(R, m, t, d, v) {
    const b = getBus(R, 'fiddle'), f = hz(m), r = 0.12, end = t + d + r + 0.05;
    const g = env(R, t, d, v * 0.34, 0.025, r, b.in, 0.85, 0.1);
    osc(R, 'sawtooth', f, t, end, -3, b.vib).connect(g);
    osc(R, 'sawtooth', f, t + 0.004, end, 4, b.vib).connect(g);
  },
  reed(R, m, t, d, v, o) {
    const b = getBus(R, 'reed'), f = hz(m), r = o.r ?? 0.08, end = t + d + r + 0.05;
    const g = env(R, t, d, v * 0.28, 0.018, r, b.L === b.in ? b.in : (m % 2 ? b.L : b.R));
    osc(R, 'square', f, t, end, 6).connect(g);
    osc(R, 'sawtooth', f, t, end, -6).connect(g);
  },
  pizz(R, m, t, d, v) {
    const b = getBus(R, 'pizz'), f = hz(m), tau = 0.1 + 18 / (f + 60), end = t + tau * 7;
    const g = decayEnv(R, t, v * 0.55, tau, m % 2 ? b.L : b.R);
    const lp = lowpass(R, Math.min(2600, f * 6), 0.8);
    lp.frequency.setValueAtTime(Math.min(3000, f * 7), t);
    lp.frequency.setTargetAtTime(f * 1.3, t, 0.05);
    lp.connect(g);
    osc(R, 'triangle', f, t, end).connect(lp);
    osc(R, 'sawtooth', f, t, end, 3).connect(lp);
  },
  harp(R, m, t, d, v) {
    const b = getBus(R, 'harp'), f = hz(m), tau = 0.38, end = t + tau * 7;
    const g = decayEnv(R, t, v * 0.42, tau, m % 2 ? b.L : b.R);
    osc(R, 'triangle', f, t, end).connect(g);
    osc(R, 'sine', f * 2, t, end).connect(g);
  },
  bell(R, m, t, d, v) {
    const b = getBus(R, 'bell'), f = hz(m);
    const parts = [[0.5, 0.5, 2.6], [1, 0.8, 1.9], [1.2, 0.34, 1.4], [1.5, 0.28, 1.1], [2, 0.3, 0.9], [2.51, 0.14, 0.6]];
    for (const [r, a, tau] of parts) {
      const g = decayEnv(R, t, v * a * 0.5, tau, m % 2 ? b.L : b.R, 0.004);
      osc(R, 'sine', f * r, t, t + tau * 7).connect(g);
    }
  },
  glock(R, m, t, d, v) {
    const b = getBus(R, 'bell'), f = hz(m);
    for (const [r, a, tau] of [[1, 0.7, 0.5], [2.76, 0.22, 0.2]]) {
      const g = decayEnv(R, t, v * a * 0.4, tau, b.in, 0.002);
      osc(R, 'sine', f * r, t, t + tau * 7).connect(g);
    }
  },
  timp(R, m, t, d, v) { membrane(R, hz(m), t, v * 0.95, 0.42, 1.25, 0.25); },
  taiko(R, m, t, d, v) { membrane(R, hz(m), t, v * 0.9, 0.28, 2.6, 0.5); },
  tom(R, m, t, d, v) { membrane(R, hz(m), t, v * 0.75, 0.16, 1.7, 0.4); },
  boom(R, m, t, d, v) {
    membrane(R, hz(m), t, v * 0.85, 0.42, 2.2, 0.55);
    const b = getBus(R, 'sub'), end = t + 0.9, g = decayEnv(R, t, v * 0.3, 0.2, b.in);
    osc(R, 'sine', hz(m) * 0.5, t, end).connect(g);
  },
  snare(R, m, t, d, v) {
    const b = getBus(R, 'drum');
    const lp = lowpass(R, 3600, 0.5), g = decayEnv(R, t, v * 0.5, 0.05, lp);
    noiseSrc(R, t, t + 0.5).connect(g); lp.connect(b.in);
    osc(R, 'triangle', 170, t, t + 0.3).connect(decayEnv(R, t, v * 0.3, 0.05, b.in));
  },
  rim(R, m, t, d, v) {
    const b = getBus(R, 'drum');
    const lp = lowpass(R, 2800, 1), g = decayEnv(R, t, v * 0.32, 0.018, lp);
    noiseSrc(R, t, t + 0.2).connect(g); lp.connect(b.in);
  },
  wood(R, m, t, d, v) {
    const b = getBus(R, 'wood'), f = hz(m);
    const g = decayEnv(R, t, v * 0.5, 0.035, m % 2 ? b.L : b.R, 0.001);
    osc(R, 'triangle', f, t, t + 0.35).connect(g);
    osc(R, 'sine', f * 1.5, t, t + 0.35).connect(decayEnv(R, t, v * 0.25, 0.02, b.in, 0.001));
  },
  anvil(R, m, t, d, v) {
    const b = getBus(R, 'metal'), f = hz(m);
    for (const [r, a, tau] of [[1, 0.5, 0.16], [2.27, 0.3, 0.1], [3.44, 0.14, 0.07]]) {
      const g = decayEnv(R, t, v * a * 0.5, tau, m % 2 ? b.L : b.R, 0.001);
      osc(R, 'triangle', f * r, t, t + tau * 7).connect(g);
    }
  },
  swell(R, m, t, d, v) {
    const b = getBus(R, 'air');
    const g = env(R, t, d, v * 0.18, d * 0.9, 0.5, b.in);
    noiseSrc(R, t, t + d + 0.6).connect(g);
  },
  sub(R, m, t, d, v) {
    const b = getBus(R, 'sub'), end = t + d + 0.2;
    const g = env(R, t, d, v * 0.6, 0.04, 0.12, b.in);
    osc(R, 'sine', hz(m), t, end).connect(g);
  },
};

const TICK = (() => {
  // MessageChannel: yields to input without the setTimeout clamp in hidden tabs
  let ch = null, q = [];
  return () => new Promise(res => {
    if (!ch) { ch = new MessageChannel(); ch.port1.onmessage = () => q.shift()?.(); }
    q.push(res); ch.port2.postMessage(0);
  });
})();

// build one stem graph; returns the started render promise or null when abandoned
async function renderStem(track, write, seedOff, isStale) {
  const seconds = track.seconds;
  const loopFrames = Math.round(seconds * SR);
  const length = loopFrames + Math.round(TAIL * SR);
  const c = new OfflineAudioContext(2, length, SR);
  const rng = mulberry(hashStr(track.id) + seedOff);
  const dry = c.createGain(), wet = c.createGain(), tilt = c.createBiquadFilter();
  tilt.type = 'highshelf'; tilt.frequency.value = 6500; tilt.gain.value = -6;
  dry.connect(tilt); tilt.connect(c.destination);
  const conv = c.createConvolver();
  conv.buffer = impulse(c, track.hall, hashStr(track.id) + 7);
  wet.connect(conv); conv.connect(tilt);
  const R = { c, rng, dry, wet, buses: {}, noise: noiseBuffer(c), end: length / SR };

  const { b, events } = makeScore(track);
  write(b);
  let t0 = performance.now();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const fn = VOICES[e.inst];
    if (!fn) throw new Error('no voice ' + e.inst);
    fn(R, e.m, Math.max(0, e.t + rng() * 0.004), e.d, e.v, e.o);
    if (performance.now() - t0 > 5) {
      await TICK();
      if (isStale && isStale()) return null;
      t0 = performance.now();
    }
  }
  return { render: () => c.startRendering().then(buf => ({ buf, loopFrames })) };
}

function hashStr(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

function softClip(x) {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  const y = KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE));
  return x < 0 ? -y : y;
}

// fold the rendered tail back over the head of the loop
function foldTail(buf, loopFrames) {
  return [0, 1].map(ch => {
    const src = buf.getChannelData(ch);
    const out = new Float32Array(loopFrames);
    out.set(src.subarray(0, loopFrames));
    for (let i = loopFrames; i < src.length; i++) out[i - loopFrames] += src[i];
    return out;
  });
}

function rmsOf(chs) {
  let s = 0, n = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; n++; }
  return Math.sqrt(s / n);
}

function bake(chs, gain) {
  const buf = new AudioBuffer({ numberOfChannels: 2, length: chs[0].length, sampleRate: SR });
  chs.forEach((d, ch) => {
    for (let i = 0; i < d.length; i++) d[i] = softClip(d[i] * gain);
    buf.copyToChannel(d, ch);
  });
  return buf;
}

// Render one track. Returns { track, base, fight, ms } or null if isStale() turned true during setup.
export async function renderTrack(trackOrId, { isStale } = {}) {
  const track = typeof trackOrId === 'string' ? TRACKS.find(t => t.id === trackOrId) : trackOrId;
  if (!track) throw new Error('no such track ' + trackOrId);
  const t0 = performance.now();
  const phases = {};
  const baseJob = await renderStem(track, b => track.base(b), 0, isStale);
  if (!baseJob) return null;
  if (isStale && isStale()) return null;
  const fightJob = await renderStem(track, b => track.fight(b), 991, isStale);
  if (!fightJob) return null;
  phases.buildMs = Math.round(performance.now() - t0);
  const [a, f] = await Promise.all([baseJob.render(), fightJob.render()]);
  phases.renderedMs = Math.round(performance.now() - t0);
  await TICK();
  const baseChs = foldTail(a.buf, a.loopFrames);
  const fightChs = foldTail(f.buf, f.loopFrames);
  await TICK();
  const gain = RMS_TARGET / rmsOf(baseChs);
  const base = bake(baseChs, gain);
  await TICK();
  const fight = bake(fightChs, RMS_TARGET * (0.42 + 0.025 * track.stage) / rmsOf(fightChs));
  return { track, base, fight, gain, ms: performance.now() - t0, phases };
}

// events only, for measuring how busy a score is
export function scoreEvents(track, stem = 'base') {
  const { b, events } = makeScore(track);
  track[stem](b);
  return events;
}

// ---- the seven tracks
// bpm is the score's beat tempo; pulse is the tempo a human would tap
function T(def) {
  return { ...def, seconds: def.bars * def.beats * 60 / def.bpm };
}

export const TRACKS = [
  T({
    id: 'rock', name: 'Rock, Other Rock', stage: 1, bpm: 64, pulse: 64, beats: 4, bars: 12, hall: 3.2,
    key: 'Bb major', meter: '4/4',
    desc: 'Solemn horn processional. The bass just walks between two notes, the woodblocks are the rocks.',
    base(b) {
      const p = b.prog('Bb | F/A | Gm | Eb | Bb/F,F | Bb | Gm | Dm | Eb | Bb/D | Cm | F7');
      b.pad('strings', p, { n: 4, low: 53, high: 74, vel: 0.36, o: { a: 0.7, r: 1.1 } });
      b.arp('pizz', p, '1 5 1 5', { oct: 2, vel: 0.9, len: 0.8 });
      b.arp('timp', p, '1 - 5 -', { oct: 2, vel: 0.8 });
      b.beat('wood', '9...', { note: 'D5', vel: 0.32, span: 8 });
      b.beat('wood', '..9.', { note: 'Bb4', vel: 0.28, span: 8 });
      b.line('horn', 'D4:2 F4:1 Bb4:1 | C5:3 A4:1 | Bb4:1.5 A4:.5 G4:2 | G4:1 Bb4:1 Eb5:2 | D5:2 C5:1 A4:1 | Bb4:3 _:1', { vel: 0.85 });
      b.pad('choir', p.slice(6), { n: 4, low: 55, high: 72, vel: 0.5, o: { a: 1.4, r: 1.4 } });
      b.line('brass', 'Bb4:2 D5:2 | C5:1 D5:1 F5:2 | Eb5:3 D5:.5 C5:.5 | D5:1.5 Bb4:.5 F4:2 | Eb5:2 D5:1 C5:1 | C5:1.5 Eb5:.5 D5:1 A4:1', { at: 24, vel: 0.62 });
      b.arp('harp', p.slice(4), '1 5 8 3 5 8 5 3', { oct: 3, step: 0.5, vel: 0.26 });
      b.hit('swell', 0, 21, 3, 0.6);
      b.hit('swell', 0, 45, 3, 0.7);
      b.hit('bell', 'Bb4', 0, 2, 0.32);
      b.hit('bell', 'F4', 24, 2, 0.28);
    },
    fight(b) {
      const p = b.prog('Bb | F/A | Gm | Eb | Bb/F,F | Bb | Gm | Dm | Eb | Bb/D | Cm | F7');
      b.arp('lowstr', p, '1 1 5 1 1 5 8 5', { oct: 2, step: 0.5, vel: 0.5, len: 0.7 });
      b.beat('taiko', '9.4.6.4.', { note: 'Bb1', vel: 0.75 });
      b.beat('snare', '..5...5.', { vel: 0.5 });
      b.beat('rim', '5.3.5.3.5.3.5.3.', { vel: 0.3 });
    },
  }),
  T({
    id: 'hug', name: 'Tree Hugging (Aggressive)', stage: 2, bpm: 72, pulse: 72, beats: 3, bars: 16, hall: 2.8,
    key: 'A dorian', meter: '3/4',
    desc: 'A woodland waltz with a flute that means it. Horns and a chopping block arrive in the B section.',
    base(b) {
      const p = b.prog('Am | D | Am | G | Am | D | F | E | F | C | G | Am | F | C | Dm | E');
      b.pad('strings', p, { n: 4, low: 55, high: 72, vel: 0.28, o: { a: 0.5, r: 0.7 } });
      b.arp('lowstr', p, '1 5 8', { oct: 2, vel: 0.62, len: 0.82 });
      b.arp('harp', p, '1 3 5 8 5 3', { oct: 4, step: 0.5, vel: 0.3 });
      b.line('flute', 'E5:1 A5:1 G5:.5 E5:.5 | F#5:1.5 E5:.5 D5:1 | E5:2 C5:1 | D5:1 G5:1 B4:1 | E5:1 A5:1 B5:.5 A5:.5 | F#5:1 G5:.5 A5:.5 F#5:1 | A5:1 G5:.5 F5:.5 E5:1 | E5:1 D5:.5 C5:.5 B4:1', { vel: 0.85 });
      b.line('horn', 'C5:2 A4:1 | G4:2 E4:1 | B4:1 D5:1 G5:1 | A5:2 E5:1 | A5:1 G5:1 F5:1 | E5:1 G5:.5 E5:.5 C5:1 | D5:1 F5:1 A5:1 | G#5:2 E5:1', { at: 24, oct: -1, vel: 0.8 });
      b.line('flute', 'C6:2 A5:1 | G5:2 E5:1 | B5:1 D6:1 G6:1 | A6:2 E6:1 | A6:1 G6:1 F6:1 | E6:1 G6:.5 E6:.5 C6:1 | D6:1 F6:1 A6:1 | G#6:2 E6:1', { at: 24, oct: -1, vel: 0.5 });
      b.pad('choir', p.slice(8), { n: 3, low: 57, high: 72, vel: 0.42, o: { a: 1, r: 1 } });
      b.beat('taiko', '9..', { note: 'A1', vel: 0.72 });
      b.beat('tom', '.74', { note: 'E3', vel: 0.42 });
      b.beat('wood', '..........9.', { note: 'E5', vel: 0.34, span: 12 });
      b.hit('swell', 0, 21, 3, 0.55);
    },
    fight(b) {
      const p = b.prog('Am | D | Am | G | Am | D | F | E | F | C | G | Am | F | C | Dm | E');
      b.arp('lowstr', p, '1 3 5 8 5 3', { oct: 2, step: 0.5, vel: 0.55, len: 0.7 });
      b.beat('tom', '959595', { note: 'A2', vel: 0.55 });
      b.beat('rim', '.5.5.5', { vel: 0.32 });
      b.beat('snare', '...5..', { vel: 0.5 });
    },
  }),
  T({
    id: 'farm', name: 'Ee-I-Ee-I-Oh No', stage: 3, bpm: 252, pulse: 84, beats: 6, bars: 24, hall: 2.2,
    key: 'E minor', meter: '6/8',
    desc: 'Old MacDonald in the minor, on a fiddle over an accordion, as the barn catches. Brass takes the second verse.',
    base(b) {
      const p = b.prog('Em | Am | G,D | Em | Em | Am | B7 | Em | C | D | Em | B | C | G | Am | Em | F | C | B | B7 | Em | Am | F | B7');
      b.hit('reed', 'E3', 0, 72, 0.2, { r: 0.3 });
      b.hit('reed', 'B3', 0, 72, 0.14, { r: 0.3 });
      b.arp('pizz', p, '1 - - 5 - -', { oct: 2, vel: 0.85 });
      b.stab('reed', p, '..7..7', { n: 3, low: 55, high: 72, vel: 0.5, len: 0.55 });
      b.pad('strings', p, { n: 4, low: 55, high: 76, vel: 0.26, o: { a: 0.3, r: 0.4 } });
      const A = 'E5:2 E5:1 E5:2 B4:1 | C5:2 C5:1 B4:3 | G5:2 G5:1 F#5:2 F#5:1 | E5:4 _:2 | B4:1 B4:1 E5:1 E5:2 E5:1 | A4:1 C5:1 E5:1 A5:3 | F#5:2 D#5:1 A5:2 F#5:1 | G5:3 E5:3 | E5:3 G5:3 | F#5:2 D5:1 A4:3 | G5:2 F#5:1 E5:3 | D#5:3 B4:3';
      const Bs = 'C5:3 E5:3 | D5:3 B4:3 | C5:3 A4:3 | B4:6 | A4:3 C5:3 | E5:3 C5:3 | D#5:3 F#5:3 | B5:6 | E5:2 G5:1 B5:3 | C6:3 A5:3 | G5:2 F5:1 E5:3 | D#5:2 F#5:1 B5:3';
      b.line('fiddle', A, { vel: 0.9 });
      b.line('brass', Bs, { at: 72, oct: -1, vel: 0.85 });
      b.line('fiddle', Bs, { at: 72, vel: 0.5 });
      b.pad('choir', p.slice(12), { n: 3, low: 57, high: 72, vel: 0.36, o: { a: 0.6, r: 0.8 } });
      b.beat('tom', '9..6..', { note: 'E2', vel: 0.72 });
      b.beat('rim', '..5..5', { vel: 0.42 });
      b.hit('swell', 0, 69, 3, 0.5);
    },
    fight(b) {
      const p = b.prog('Em | Am | G,D | Em | Em | Am | B7 | Em | C | D | Em | B | C | G | Am | Em | F | C | B | B7 | Em | Am | F | B7');
      b.arp('spic', p, '1 3 5 8 5 3', { oct: 3, vel: 0.5, len: 0.6 });
      b.beat('taiko', '9.....7.....', { note: 'E1', vel: 0.8, span: 12 });
      b.beat('snare', '...5.....6.5', { vel: 0.5, span: 12 });
      b.beat('tom', '.5.5.5', { note: 'B2', vel: 0.4 });
    },
  }),
  T({
    id: 'value', name: 'Property Values', stage: 4, bpm: 96, pulse: 96, beats: 4, bars: 12, hall: 3.0,
    key: 'C phrygian', meter: '4/4',
    desc: 'Village bells toll over a trombone lament. An auctioneer signs off the last bar.',
    base(b) {
      const p = b.prog('Cm | Db | Cm | Bbm | Ab | Db | Fm | Cm | Db | Bbm | Ab | G');
      b.pad('strings', p, { n: 4, low: 52, high: 75, vel: 0.32, o: { a: 0.3, r: 0.5 } });
      b.arp('lowstr', p, '1 1 1 5 1 8 5 1', { oct: 2, step: 0.5, vel: 0.5, len: 0.68 });
      b.arp('spic', p, '5 3 5 8 5 3 5 1', { oct: 3, step: 0.25, vel: 0.3, len: 0.55, accent: [1, 0.6, 0.8, 0.6] });
      b.pad('choir', p, { n: 3, low: 55, high: 70, vel: 0.5, o: { a: 0.9, r: 0.9 } });
      b.line('brass', 'C5:1 Eb5:1 C5:.5 Db5:.5 C5:1 | F5:2 Ab5:1 F5:1 | G5:1.5 F5:.5 Eb5:2 | F5:1 Eb5:.5 Db5:.5 Bb4:2 | C5:1 Eb5:1 Ab5:2 | Ab5:1.5 G5:.5 F5:2', { oct: -1, vel: 0.85 });
      b.line('brass', 'C6:2 Ab5:2 | G5:2 Eb5:2 | F5:1 Ab5:1 Db6:2 | C6:1 Bb5:1 F5:2 | Eb5:1 Ab5:1 C6:1 Bb5:1 | B5:1.5 D5:.5 G5:2', { at: 24, vel: 0.72 });
      b.line('horn', 'C5:2 Ab4:2 | G4:2 Eb4:2 | F4:1 Ab4:1 Db5:2 | C5:1 Bb4:1 F4:2 | Eb4:1 Ab4:1 C5:1 Bb4:1 | B4:1.5 D4:.5 G4:2', { at: 24, vel: 0.6 });
      b.beat('bell', '9...............', { note: 'C4', vel: 0.72, span: 8 });
      b.beat('bell', '........9.......', { note: 'G3', vel: 0.55, span: 8 });
      b.arp('timp', p, '1 - 5 -', { oct: 2, vel: 0.75 });
      b.beat('taiko', '9..6....', { note: 'C2', vel: 0.72 });
      b.beat('rim', '....5..5', { vel: 0.36 });
      b.hit('wood', 'F5', 45, 0.3, 0.5);
      b.hit('wood', 'F5', 45.5, 0.3, 0.5);
      b.hit('wood', 'Bb4', 46, 0.4, 0.75);
      b.hit('swell', 0, 21, 3, 0.55);
    },
    fight(b) {
      const p = b.prog('Cm | Db | Cm | Bbm | Ab | Db | Fm | Cm | Db | Bbm | Ab | G');
      b.arp('spic', p, '1 5 3 5 1 5 3 5', { oct: 3, step: 0.5, vel: 0.5, len: 0.55 });
      b.beat('tom', '5.4.6.4.5.4.7.5.', { note: 'G2', vel: 0.52 });
      b.beat('snare', '....9.....5.9...', { vel: 0.55 });
    },
  }),
  T({
    id: 'knock', name: 'Knock Knock (It\'s Me)', stage: 5, bpm: 240, pulse: 120, beats: 7, bars: 14, hall: 2.3,
    key: 'F# harmonic minor', meter: '7/8',
    desc: 'A battering ram in seven: boom, boom, BOOM. Brass rides the ram, chains rattle, nobody answers.',
    base(b) {
      const p = b.prog('F#m | F#m | G | F#m | D | E | C#7 | F#m | Bm | F#m | D | C#7 | Bm | C#7');
      b.pad('strings', p, { n: 4, low: 54, high: 76, vel: 0.26, o: { a: 0.15, r: 0.3 } });
      b.pad('choir', p, { n: 3, low: 57, high: 72, vel: 0.5, o: { a: 0.3, r: 0.4 } });
      b.arp('lowstr', p, '1 1 5 1 8 5 1', { oct: 2, vel: 0.6, len: 0.68, accent: [1, 0.7, 1, 0.7, 1, 0.7, 0.8] });
      const A = 'F#5:2 A5:2 C#6:3 | B5:2 A5:2 F#5:3 | G5:2 B5:2 D6:3 | C#6:2 A5:2 F#5:3 | D5:2 F#5:2 A5:3 | G#5:2 E5:2 B4:3 | C#5:2 E#5:2 G#5:3 | F#5:7';
      const B = 'B4:2 D5:2 F#5:3 | C#5:2 F#5:2 A5:3 | D5:2 A5:2 F#5:3 | E#5:2 G#5:2 C#6:3 | D6:2 B5:2 F#5:3 | E#6:2 C#6:2 B5:1 G#5:2';
      b.line('brass', A, { vel: 0.85, leg: 0.8 });
      b.line('brass', B, { at: 56, vel: 0.85, leg: 0.8 });
      b.line('horn', A, { oct: -1, vel: 0.5, leg: 0.8 });
      b.line('horn', B, { at: 56, oct: -1, vel: 0.5, leg: 0.8 });
      b.stab('brass', p, '..6.6..', { n: 3, low: 54, high: 69, vel: 0.5, len: 0.6, o: { mono: true } });
      b.beat('boom', '9.8.9..', { note: 'F#1', vel: 0.72 });
      b.beat('tom', '..4.4.5', { note: 'C#3', vel: 0.5 });
      b.beat('anvil', '5.......7.....', { note: 'F#4', vel: 0.32, span: 14 });
      b.beat('rim', '54545454545455', { vel: 0.26 });
      b.hit('swell', 0, 53, 3, 0.55);
    },
    fight(b) {
      const p = b.prog('F#m | F#m | G | F#m | D | E | C#7 | F#m | Bm | F#m | D | C#7 | Bm | C#7');
      b.arp('spic', p, '1 5 3 5 8 5 3', { oct: 3, vel: 0.6, len: 0.5, accent: [1, 0.7, 1, 0.7, 1, 0.7, 0.8] });
      b.beat('snare', '5.5.5.9', { vel: 0.55 });
      b.beat('tom', '.5.5.5.', { note: 'F#2', vel: 0.55 });
      b.beat('taiko', '9.9.9..', { note: 'C#2', vel: 0.75 });
    },
  }),
  T({
    id: 'urban', name: 'Urban Renewal', stage: 6, bpm: 144, pulse: 144, beats: 4, bars: 12, hall: 1.9,
    key: 'B octatonic', meter: '4/4',
    desc: 'Minor thirds cycle while spiccato strings run for the exits. Alarm anvil, choir shouting in triads.',
    base(b) {
      const p = b.prog('Bm | Dm | Fm | Abm | Bm | D | F | Ab | Bm | D | Fm | F#');
      b.arp('spic', p, '1 3 5 8 5 3 5 3', { oct: 3, step: 0.25, vel: 0.46, len: 0.65, accent: [1, 0.6, 0.75, 0.6] });
      b.arp('spic', p, '1 5 1 5', { oct: 2, step: 0.25, vel: 0.5, len: 0.65 });
      b.arp('lowstr', p, '1 1 5 1', { oct: 2, step: 0.5, vel: 0.58, len: 0.6 });
      b.pad('strings', p, { n: 4, low: 58, high: 79, vel: 0.2, o: { a: 0.08, r: 0.2 } });
      b.stab('choir', p, '9..7..7.', { n: 3, low: 59, high: 74, vel: 0.46, len: 0.8, o: { a: 0.04, r: 0.14 } });
      b.line('brass', 'B4:1.5 D5:.5 F#5:2 | F5:1.5 D5:.5 A5:2 | Ab5:1.5 F5:.5 C6:2 | B5:1 Ab5:1 Eb5:2 | F#5:1 D5:1 F#5:.5 B5:1.5 | A5:1.5 F#5:.5 D5:2 | C6:1 A5:1 F5:.5 A5:.5 C6:1 | Eb6:1.5 C6:.5 Ab5:2 | B5:.5 D6:.5 B5:.5 F#5:.5 D5:2 | F#5:.5 A5:.5 F#5:.5 D5:.5 A4:2 | Ab5:1 C6:1 Ab5:1 F5:1 | A#5:1 C#6:1 A#5:1 F#5:1', { vel: 0.85, leg: 0.8 });
      b.line('horn', 'B3:2 F#4:2 | D4:2 A4:2 | F4:2 C5:2 | Ab4:2 Eb5:2 | B3:2 F#4:2 | D4:2 A4:2 | F4:2 C5:2 | Ab4:2 Eb5:2 | B3:2 F#4:2 | D4:2 A4:2 | F4:2 C5:2 | F#4:2 C#5:2', { vel: 0.5 });
      b.beat('anvil', '9.......9.......', { note: 'B4', vel: 0.34, span: 8 });
      b.beat('anvil', '....9.......9...', { note: 'F4', vel: 0.28, span: 8 });
      b.beat('boom', '9.4.7.4.', { note: 'B1', vel: 0.5 });
      b.beat('tom', '5.5.7.5.5.7.5.9.', { note: 'F#2', vel: 0.5 });
      b.beat('snare', '....9.......9...', { vel: 0.68 });
      b.hit('swell', 0, 21, 3, 0.55);
    },
    fight(b) {
      const p = b.prog('Bm | Dm | Fm | Abm | Bm | D | F | Ab | Bm | D | Fm | F#');
      b.arp('spic', p, '8 3 5 3 8 3 5 3', { oct: 4, step: 0.25, vel: 0.4, len: 0.55 });
      b.beat('tom', '7575757575757597', { note: 'B2', vel: 0.55 });
      b.beat('taiko', '9.......7...9...', { note: 'B1', vel: 0.7 });
      b.beat('rim', '5555', { vel: 0.3, span: 1 });
    },
  }),
  T({
    id: 'king', name: 'Long Live the King (Briefly)', stage: 7, bpm: 180, pulse: 180, beats: 4, bars: 12, hall: 1.7,
    key: 'D phrygian dominant', meter: '4/4',
    desc: 'War drums and full brass. The two rocks come back as a bass in a blind panic.',
    base(b) {
      const p = b.prog('D | Eb | D | Cm | Eb | D | Gm | Eb | Cm | D | Eb | Eb');
      b.arp('spic', p, '8 5 3 5 1 5 3 5', { oct: 3, step: 0.25, vel: 0.5, len: 0.7, accent: [1, 0.55, 0.8, 0.55] });
      b.arp('lowstr', p, '1 5 1 5 1 5 1 5', { oct: 2, step: 0.5, vel: 0.62, len: 0.7 });
      b.pad('strings', p, { n: 4, low: 60, high: 81, vel: 0.26, o: { a: 0.05, r: 0.15 } });
      b.pad('choir', p, { n: 4, low: 55, high: 74, vel: 0.55, o: { a: 0.1, r: 0.25 } });
      b.stab('brass', p, '9.7.9.7.', { n: 3, low: 57, high: 69, vel: 0.5, len: 0.55, o: { mono: true } });
      b.line('brass', 'D5:1 F#5:1 A5:1 D6:1 | Bb5:1.5 G5:.5 Eb5:2 | F#5:1 A5:1 D6:2 | C6:1 Bb5:1 G5:2 | G5:1 Bb5:1 Eb6:2 | D6:2 A5:2 | G5:1.5 Bb5:.5 D6:2 | Eb6:1 D6:1 Bb5:2 | C6:1 Bb5:1 G5:.5 Eb5:.5 G5:1 | F#5:1 A5:1 F#5:.5 D5:.5 F#5:1 | Eb6:1 Bb5:1 G5:1 Eb5:1 | Eb6:.5 D6:.5 Eb6:.5 D6:.5 Eb6:2', { vel: 0.9, leg: 0.85 });
      b.line('horn', 'D4:1 F#4:1 A4:1 D5:1 | Bb4:1.5 G4:.5 Eb4:2 | F#4:1 A4:1 D5:2 | C5:1 Bb4:1 G4:2 | G4:1 Bb4:1 Eb5:2 | D5:2 A4:2 | G4:1.5 Bb4:.5 D5:2 | Eb5:1 D5:1 Bb4:2 | C5:1 Bb4:1 G4:.5 Eb4:.5 G4:1 | F#4:1 A4:1 F#4:.5 D4:.5 F#4:1 | Eb5:1 Bb4:1 G4:1 Eb4:1 | Eb5:.5 D5:.5 Eb5:.5 D5:.5 Eb5:2', { vel: 0.55, leg: 0.85 });
      b.beat('boom', '9.5.8.5.', { note: 'D2', vel: 0.65 });
      b.beat('taiko', '9.7.9.7.9.7.9.77', { note: 'A1', vel: 0.55 });
      b.beat('tom', '5555', { note: 'D3', vel: 0.42, span: 1 });
      b.beat('snare', '....9.......9.5.', { vel: 0.7 });
      b.beat('anvil', '9.......', { note: 'A4', vel: 0.3, span: 8 });
      b.hit('swell', 0, 44, 4, 0.8);
    },
    fight(b) {
      const p = b.prog('D | Eb | D | Cm | Eb | D | Gm | Eb | Cm | D | Eb | Eb');
      b.arp('spic', p, '1 3 5 3 1 3 5 3', { oct: 4, step: 0.25, vel: 0.4, len: 0.55 });
      b.beat('taiko', '9595959595959599', { note: 'D2', vel: 0.75 });
      b.beat('tom', '8567', { note: 'A2', vel: 0.5, span: 1 });
      b.beat('snare', '5.5.5.5.5.5.5.55', { vel: 0.5 });
      b.arp('brass', p, '1 - 8 -', { oct: 3, step: 0.5, vel: 0.5, len: 0.5, o: { mono: true } });
    },
  }),
];

// ---- the player: renders on demand, crossfades, keeps a small LRU, follows the selection
const XFADE = 1.0;
const CACHE_MAX = 3;
const RANDOM_MIN = 40;   // seconds a random-order track plays before the next
const VALID = new Set(['stage', 'randomStage', 'random', ...TRACKS.map(t => t.id)]);

export function createPlayer(store) {
  const load = () => {
    try { const v = store.get(); return VALID.has(v) ? v : 'stage'; } catch { return 'stage'; }
  };
  let ac = null, out = null, sel = load(), stage = null, combat = false, stopped = false;
  let stagePick = null, randomPick = null, randomNext = null, rotateAt = 0, rotateTimer = 0, onSeam = false;
  let current = null, busy = null;
  const cache = new Map();   // id -> render, insertion order is recency
  const failed = new Set();

  const pickOther = t => {
    const pool = TRACKS.filter(x => x !== t);
    return pool[Math.floor(Math.random() * pool.length)];
  };

  function desired() {
    if (stopped) return null;
    if (sel === 'stage') return TRACKS[(stage || 1) - 1];
    if (sel === 'randomStage') return stagePick || (stagePick = pickOther(null));
    if (sel === 'random') return randomPick || (randomPick = pickOther(current && current.track));
    return TRACKS.find(t => t.id === sel) || null;
  }
  function prewarmTrack() {
    if (stopped) return null;
    if (sel === 'stage' && stage && stage < 7) return TRACKS[stage];
    if (sel === 'random') return randomNext;
    return null;
  }
  const needsRender = t => t && !cache.has(t.id) && !failed.has(t.id);
  function wantedRender() {
    const d = desired();
    if (needsRender(d)) return d;
    const n = prewarmTrack();
    return needsRender(n) ? n : null;
  }

  function evict() {
    const keep = new Set([current && current.track.id, desired()?.id, prewarmTrack()?.id]);
    for (const k of cache.keys()) {
      if (cache.size <= CACHE_MAX) break;
      if (!keep.has(k)) cache.delete(k);
    }
  }

  // one render at a time; the newest wanted track always comes next
  function pump() {
    if (busy) return;
    const t = wantedRender();
    if (!t) return;
    busy = t;
    renderTrack(t, { isStale: () => wantedRender() !== t }).then(r => {
      busy = null;
      if (r) { cache.set(t.id, r); evict(); sync(); }
      pump();
    }).catch(e => {
      busy = null;
      failed.add(t.id);
      console.warn('music render failed', t.id, e);
      pump();
    });
  }

  const running = () => ac && ac.state === 'running';

  function ramp(param, to, secs, when) {
    const t = Math.max(ac.currentTime, when ?? ac.currentTime);
    const now = ac.currentTime;
    const from = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    if (t > now) param.setValueAtTime(from, t);
    param.linearRampToValueAtTime(to, t + secs);
  }

  function fadeOut(p, when) {
    const t = Math.max(ac.currentTime, when ?? ac.currentTime);
    const now = ac.currentTime, from = p.gain.gain.value;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(from, now);
    p.gain.gain.setValueAtTime(from, t);
    p.gain.gain.linearRampToValueAtTime(from * 0.72, t + XFADE / 2);
    p.gain.gain.linearRampToValueAtTime(0, t + XFADE);
    const stop = t + XFADE + 0.05;
    try { p.base.stop(stop); p.fight.stop(stop); } catch {}
    p.base.onended = () => { p.gain.disconnect(); };
  }

  function start(track, render, when) {
    const t = Math.max(ac.currentTime + 0.03, when || 0);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.72, t + XFADE / 2);
    gain.gain.linearRampToValueAtTime(1, t + XFADE);
    gain.connect(out);
    const fightGain = ac.createGain();
    fightGain.gain.value = combat ? 1 : 0;
    fightGain.connect(gain);
    const base = ac.createBufferSource();
    base.buffer = render.base; base.loop = true; base.connect(gain);
    const fight = ac.createBufferSource();
    fight.buffer = render.fight; fight.loop = true; fight.connect(fightGain);
    base.start(t); fight.start(t);
    if (current) fadeOut(current, t);
    current = { track, gain, fightGain, base, fight, t0: t };
    scheduleRotate();
  }

  function scheduleRotate() {
    clearTimeout(rotateTimer);
    if (sel !== 'random' || !current) return;
    const L = current.track.seconds;
    const loops = Math.max(1, Math.ceil(RANDOM_MIN / L));
    rotateAt = current.t0 + loops * L;
    randomNext = pickOther(current.track);
    pump();
    rotateTimer = setTimeout(rotate, Math.max(0, (rotateAt - ac.currentTime - 0.4) * 1000));
  }

  function rotate() {
    if (sel !== 'random' || !current) return;
    if (randomNext && cache.has(randomNext.id)) { randomPick = randomNext; onSeam = true; }
    else if (randomNext && failed.has(randomNext.id)) randomNext = pickOther(current.track);
    else { rotateTimer = setTimeout(rotate, 300); pump(); return; }
    sync();
  }

  // next whole loop boundary of the current track, so swaps land on the seam
  function boundary(preferred) {
    if (!current) return 0;
    const L = current.track.seconds, now = ac.currentTime + 0.05;
    if (preferred && preferred > now) return preferred;
    const k = Math.ceil((now - current.t0) / L);
    return current.t0 + k * L;
  }

  function sync() {
    const d = desired();
    if (!d || !out) { pump(); return; }
    if (current && current.track === d) { pump(); return; }
    const r = cache.get(d.id);
    if (!r) { pump(); return; }
    cache.delete(d.id); cache.set(d.id, r);
    if (!running()) { pump(); return; }
    start(d, r, onSeam && current ? boundary(rotateAt) : 0);
    onSeam = false;
    evict();
    pump();
  }

  return {
    attach(ctx, output) { ac = ctx; out = output; sync(); },
    kick() { stopped = false; sync(); },
    setStage(n) {
      n = Math.max(1, Math.min(7, Math.round(n) || 1));
      if (n !== stage) { stage = n; stagePick = pickOther(stagePick); }
      stopped = false;
      sync();
    },
    setCombat(on) {
      combat = !!on;
      if (current && ac) ramp(current.fightGain.gain, combat ? 1 : 0, 0.5);
    },
    get selection() { return sel; },
    select(v) {
      if (!VALID.has(v)) v = 'stage';
      sel = v;
      try { store.set(v); } catch {}
      stopped = false;
      clearTimeout(rotateTimer);
      if (v === 'random') { randomPick = pickOther(current && current.track); randomNext = null; rotateAt = 0; }
      if (v === 'randomStage') stagePick = pickOther(current && current.track);
      sync();
    },
    get nowPlaying() { return current ? current.track : null; },
    stop() {
      stopped = true;
      clearTimeout(rotateTimer);
      if (current && ac) { fadeOut(current, ac.currentTime); current = null; }
    },
  };
}
