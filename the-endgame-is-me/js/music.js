// The score. Seven fight tracks for chip cello and chip drums, written as data, rendered once into looping AudioBuffers, no audio files.
// Render is sample exact: loop + tail is rendered with OfflineAudioContext and the tail is folded back over the head.

const SR = 32000;            // stereo at 32 kHz keeps the buffers small and the top end soft
const TAIL = 1.4;            // seconds rendered past the loop, folded back over the start
const RMS_TARGET = 0.12;     // every track is normalised here so the seven sit together
const KNEE = 0.82;           // soft clip starts here; tracks should barely touch it
const CELLO_LOW = 36, CELLO_HIGH = 69;   // C2 to A4

// ---- pitch and harmony
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9],
};
const hz = m => 440 * 2 ** ((m - 69) / 12);
const pcOf = n => (PC[n[0]] + (n.slice(1).match(/#/g) || []).length - (n.slice(1).match(/b/g) || []).length + 12) % 12;

export function midi(name) {
  const m = /^([A-G][b#]*)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return pcOf(m[1]) + 12 * (+m[2] + 1);
}

function parseChord(sym) {
  const m = /^([A-G][b#]?)(m7|dim7|dim|m|7)?(?:\/([A-G][b#]?))?$/.exec(sym);
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

// ---- score builder: tracks call these to write events, times in beats
function makeScore(track) {
  const events = [];
  const spb = 60 / track.bpm, total = track.bars * track.beats;
  const add = (inst, m, at, dur, vel, o) => events.push({ inst, m, t: at * spb, d: Math.max(0.02, dur) * spb, v: vel, o: o || {} });
  const chords = parseProg(track.chords, track.beats);
  const chordAt = at => chords.find(ch => at >= ch.at - 1e-6 && at < ch.at + ch.dur - 1e-6);
  const clamp = m => { while (m > CELLO_HIGH) m -= 12; while (m < CELLO_LOW) m += 12; return m; };

  const b = {
    chords,
    total,
    // chords from bar a up to but not including bar z, 0 based
    span: (a, z) => chords.filter(ch => ch.at >= a * track.beats - 1e-6 && ch.at < z * track.beats - 1e-6),
    hit: (inst, m, at, dur, vel, o) => add(inst, typeof m === 'string' ? midi(m) : m, at, dur, vel, o),

    // 'D4:2 F4:1 _:1 | ...': note:beats, _ is a rest, every bar line must close a full bar
    line(inst, seq, { at = 0, vel = 0.8, leg = 0.92, o } = {}) {
      let pos = at, bar = 0;
      for (const tok of seq.split(/\s+/)) {
        if (!tok) continue;
        if (tok === '|') {
          if (Math.abs(bar - track.beats) > 1e-6) throw new Error(`${track.id}: bar of ${bar} beats near beat ${pos}`);
          bar = 0;
          continue;
        }
        const [n, d] = tok.split(':');
        const dur = parseFloat(d);
        if (n !== '_') add(inst, midi(n), pos, dur * leg, vel, o);
        pos += dur; bar += dur;
      }
    },

    // ostinato on the chords: 1 is the bass, 3 5 7 chord tones, 8 the octave, - is a rest, -5 a fifth below
    fig(inst, prog, pattern, { low = 43, step = 0.5, vel = 0.7, len = 0.85, o, accent } = {}) {
      const toks = pattern.trim().split(/\s+/);
      for (const ch of prog) {
        const root = low + ((ch.root - low) % 12 + 12) % 12;
        const bass = low + ((ch.bass - low) % 12 + 12) % 12;
        let i = 0;
        for (let at = ch.at; at < ch.at + ch.dur - 1e-6; at += step, i++) {
          const tk = toks[i % toks.length];
          if (tk === '-') continue;
          let deg = +tk, down = 0;
          if (deg < 0) { deg = -deg; down = 12; }
          const int = deg === 3 ? ch.ints[1] : deg === 5 ? ch.ints[2] : deg === 7 ? (ch.ints[3] ?? 10) : 12;
          const m = deg === 1 ? bass - down : root - down + int;
          add(inst, clamp(m), at, step * len, vel * (accent ? accent[i % accent.length] : 1), o);
        }
      }
    },

    // second cello: picks chord tones against the lead, no parallel fifths or octaves, prefers contrary motion
    counter(inst, { rhythm = [2, 2], low = 48, high = 60, vel = 0.55, leg = 0.9, from = 0, to = total, o } = {}) {
      const lead = events.filter(e => e.inst === 'cello').sort((x, y) => x.t - y.t);
      const leadAt = beat => {
        let m = null;
        for (const e of lead) { if (e.t > beat * spb + 1e-6) break; m = e.m; }
        return m;
      };
      let prev = null, prevL = null;
      for (let bar = 0; bar < track.bars; bar++) {
        let at = bar * track.beats, i = 0;
        const barEnd = at + track.beats - 1e-6;
        while (at < barEnd) {
          const dur = rhythm[i++ % rhythm.length];
          if (at >= from && at < to) {
            const ch = chordAt(at), l = leadAt(at);
            let best = null, bestCost = 1e9;
            for (let m = low; m <= high; m++) {
              if (!ch.pcs.includes(m % 12)) continue;
              let cost = prev == null ? Math.abs(m - (low + high) / 2) / 4 : Math.abs(m - prev);
              if (prev != null && Math.abs(m - prev) > 7) cost += 6;
              if (m === prev) cost += 1.5;
              if (m % 12 === ch.root) cost += 0.5;
              if (l != null) {
                const int = ((m - l) % 12 + 12) % 12;
                if (m >= l) cost += 8;
                if ([1, 2, 10, 11].includes(int)) cost += 6;
                if (prev != null && prevL != null && m !== prev && l !== prevL) {
                  const was = ((prev - prevL) % 12 + 12) % 12;
                  if (int === was && (int === 0 || int === 7)) cost += 14;
                  if (Math.sign(m - prev) === Math.sign(l - prevL)) cost += 2;
                }
              }
              if (cost < bestCost) { bestCost = cost; best = m; }
            }
            add(inst, best, at, dur * leg, vel, o);
            prev = best; prevL = l;
          }
          at += dur;
        }
      }
    },

    // low double stops, digit pattern repeated each bar over the listed bars
    chop(pattern, barList, { low = 40, vel = 0.8 } = {}) {
      const step = track.beats / pattern.length;
      for (const bar of barList) {
        for (let s = 0; s < pattern.length; s++) {
          const c = pattern[s];
          if (c === '.') continue;
          const at = bar * track.beats + s * step, ch = chordAt(at);
          const root = low + ((ch.root - low) % 12 + 12) % 12;
          add('chop', root, at, step * 0.8, vel * (+c) / 9);
          add('chop', clamp(root + ch.ints[2]), at, step * 0.8, vel * (+c) / 9);
        }
      }
    },

    // drums: one pattern string per instrument per bar, fills replace instruments on chosen bars.
    // Digits are velocity, dots are rests. Toms use L M H, lower case is softer.
    kit(main, fills = {}, { toms = [43, 50, 57], amp = 1 } = {}) {
      for (let bar = 0; bar < track.bars; bar++) {
        const pat = { ...main, ...(fills[bar] || {}) };
        for (const inst of Object.keys(pat)) {
          const p = pat[inst];
          if (!p) continue;
          const step = track.beats / p.length;
          for (let s = 0; s < p.length; s++) {
            const c = p[s];
            if (c === '.') continue;
            const at = bar * track.beats + s * step;
            if (inst === 'tom') add('tom', toms['LMH'.indexOf(c.toUpperCase())], at, step, amp * (c === c.toUpperCase() ? 1 : 0.7));
            else add(inst, 36, at, step, amp * (+c) / 9);
          }
        }
      }
    },
  };
  return { b, events };
}

// ---- synthesis context and voices
const BUS = {
  lead: { crush: 30, drive: 2.0, body: [310, 1.1, 4], lp: 2300, rev: 0.1, pan: -0.14 },
  second: { crush: 24, drive: 2.2, body: [240, 1.2, 3], lp: 1800, rev: 0.1, pan: 0.26 },
  spic: { crush: 20, drive: 2.0, body: [280, 1, 2], lp: 1700, rev: 0.06, pan: 0.1 },
  pedal: { crush: 16, drive: 1.8, lp: 820, rev: 0.03 },
  chop: { crush: 14, drive: 1.5, lp: 1300, rev: 0.08 },
  kit: { lp: 4200, rev: 0.05 },
  snare: { hp: 180, lp: 5600, rev: 0.09 },
  hat: { hp: 5200, lp: 9500, rev: 0.02, pan: 0.12 },
  crash: { hp: 2600, lp: 8000, rev: 0.1, pan: -0.1 },
};

function mulberry(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// one-bit noise held for a few samples, like a sound chip's noise channel
let sharedNoise = null;
function noiseBuffers(c) {
  if (sharedNoise && sharedNoise.rate === c.sampleRate) return sharedNoise;
  const make = (hold, seed) => {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0), r = mulberry(seed);
    let v = 1;
    for (let i = 0; i < d.length; i++) { if (i % hold === 0) v = r() < 0.5 ? -1 : 1; d[i] = v; }
    return b;
  };
  sharedNoise = { rate: c.sampleRate, snare: make(3, 77), hat: make(2, 131) };
  return sharedNoise;
}

// pulse, saw and a saw with a heavy fundamental, with the top harmonics rolled off so they don't buzz
function chipWaves(c) {
  const N = 40, taper = n => 1 / (1 + (n / 26) ** 2);
  const make = fn => {
    const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) { const [a, b] = fn(n); re[n] = a * taper(n); im[n] = b * taper(n); }
    return c.createPeriodicWave(re, im);
  };
  const pulse = D => n => [Math.sin(2 * Math.PI * n * D) / (n * Math.PI), (1 - Math.cos(2 * Math.PI * n * D)) / (n * Math.PI)];
  const saw = n => [0, (n % 2 ? 1 : -1) / n];
  return {
    p12: make(pulse(0.125)), p25: make(pulse(0.25)), p50: make(pulse(0.5)), saw: make(saw),
    grit: make(n => [0, (n % 2 ? 1 : -1) / n * (n === 1 ? 2.2 : 1)]),
  };
}

// a small dark room, short enough to stay out of the way
function impulse(c, secs, seed) {
  const n = Math.floor(secs * c.sampleRate);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), r = mulberry(seed + ch * 101);
    let lp = 0;
    for (let i = Math.floor(0.004 * c.sampleRate); i < n; i++) {
      const u = i / n;
      lp += (r() * 2 - 1 - lp) * (0.35 * (1 - u) ** 2 + 0.05);
      d[i] = lp * Math.exp(-5 * u) * (1 - u);
    }
  }
  return buf;
}

// staircase with a little saturation: an 8-bit style DAC for one voice group
const curves = new Map();
function crushCurve(levels) {
  if (curves.has(levels)) return curves.get(levels);
  const n = 2049, curve = new Float32Array(n), k = Math.tanh(1.3);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) / ((n - 1) / 2);
    curve[i] = Math.round(Math.tanh(1.3 * x) / k * levels) / levels;
  }
  curves.set(levels, curve);
  return curve;
}

function getBus(R, name) {
  if (R.buses[name]) return R.buses[name];
  const s = BUS[name], c = R.c;
  const input = c.createGain();
  let last = input;
  const chain = n => { last.connect(n); last = n; };
  if (s.crush) {
    input.gain.value = s.drive;
    const w = c.createWaveShaper(); w.curve = crushCurve(s.crush); chain(w);
    const back = c.createGain(); back.gain.value = 1 / s.drive; chain(back);
  }
  if (s.body) {
    const pk = c.createBiquadFilter(); pk.type = 'peaking';
    pk.frequency.value = s.body[0]; pk.Q.value = s.body[1]; pk.gain.value = s.body[2]; chain(pk);
  }
  if (s.hp) { const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = s.hp; hp.Q.value = 0.6; chain(hp); }
  if (s.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = s.lp; lp.Q.value = 0.6; chain(lp); }
  if (s.pan) { const p = c.createStereoPanner(); p.pan.value = s.pan; chain(p); }
  last.connect(R.dry);
  if (s.rev) { const send = c.createGain(); send.gain.value = s.rev; last.connect(send); send.connect(R.wet); }
  R.buses[name] = { in: input };
  return R.buses[name];
}

function tone(R, wave, f, t, end) {
  const s = R.c.createOscillator();
  if (wave === 'triangle') s.type = 'triangle'; else s.setPeriodicWave(R.waves[wave]);
  s.frequency.value = f;
  s.start(Math.max(0, t)); s.stop(end);
  return s;
}

// volume moves in sound chip frames after the attack, and ends at exact zero
function chipEnv(R, t, d, v, a, dec, sus, rel, dest) {
  const g = R.c.createGain(), p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(v, t + a);
  const steps = Math.max(1, Math.min(5, Math.round(dec * 60)));
  for (let i = 1; i <= steps; i++) {
    const at = t + a + dec * i / steps;
    if (at < t + d) p.setValueAtTime(v * (1 - (1 - sus) * i / steps), at);
  }
  p.setValueAtTime(v * sus, t + d);
  p.setValueAtTime(v * sus * 0.6, t + d + rel * 0.33);
  p.setValueAtTime(v * sus * 0.25, t + d + rel * 0.66);
  p.setValueAtTime(0, t + d + rel);
  g.connect(dest);
  return g;
}

// percussive envelope: the caller stops its sources at t + tau * 7
function decayEnv(R, t, v, tau, dest, a = 0.002) {
  const g = R.c.createGain(), p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(v, t + a);
  p.setTargetAtTime(0, t + a, tau);
  g.connect(dest);
  return g;
}

function noiseSrc(R, kind, t, end) {
  const s = R.c.createBufferSource();
  s.buffer = R.noise[kind]; s.loop = true;
  s.start(Math.max(0, t), R.rng() * 1.8); s.stop(end);
  return s;
}

// bow: narrow pulse bite, then the body wave, a scoop into pitch, stepped vibrato on long notes
function bowed(R, bus, m, t, d, v, o) {
  const f = hz(m), rel = o.rel ?? 0.04, end = t + d + rel + 0.02;
  const g = chipEnv(R, t, d, v, o.a ?? 0.005, o.dec ?? 0.05, o.sus ?? 0.8, rel, bus.in);
  const scoop = s => {
    if (!o.scoop) return;
    s.detune.setValueAtTime(o.scoop, t);
    s.detune.linearRampToValueAtTime(0, t + o.scoopT);
  };
  const bite = o.bite && d > o.bite + 0.03 ? o.bite : 0;
  if (bite) { const s = tone(R, o.biteWave, f, t, t + bite); scoop(s); s.connect(g); }
  const body = tone(R, o.wave, f, t + bite, end);
  scoop(body);
  body.connect(g);
  if (o.vib && d > 0.3) {
    for (let s = 0.22; s < d; s += 1 / 36) body.detune.setValueAtTime(o.vib * Math.sin(2 * Math.PI * 5.6 * (s - 0.22)), t + s);
  }
}

// exported so tests can stub individual voices
export const VOICES = {
  cello(R, m, t, d, v) {
    bowed(R, getBus(R, 'lead'), m, t, d, v * 0.4, { wave: 'p25', biteWave: 'p12', bite: 0.028, scoop: -48, scoopT: 0.034, a: 0.006, dec: 0.06, sus: 0.84, rel: 0.05, vib: 15 });
  },
  second(R, m, t, d, v) {
    bowed(R, getBus(R, 'second'), m, t, d, v * 0.32, { wave: 'p50', biteWave: 'p25', bite: 0.024, scoop: -36, scoopT: 0.03, a: 0.008, dec: 0.08, sus: 0.76, rel: 0.05, vib: 11 });
  },
  spic(R, m, t, d, v, o) {
    bowed(R, getBus(R, 'spic'), m, t, d, v * (o.hard ? 0.95 : 0.26), { wave: o.hard ? 'saw' : 'p12', scoop: -20, scoopT: 0.012, a: 0.003, dec: 0.045, sus: 0.42, rel: 0.03 });
  },
  pedal(R, m, t, d, v) {
    bowed(R, getBus(R, 'pedal'), m, t, d, v * 0.42, { wave: 'grit', scoop: -30, scoopT: 0.02, a: 0.004, dec: 0.08, sus: 0.7, rel: 0.05, vib: 8 });
  },
  chop(R, m, t, d, v) {
    bowed(R, getBus(R, 'chop'), m, t, d, v * 0.3, { wave: 'saw', scoop: -40, scoopT: 0.02, a: 0.003, dec: 0.1, sus: 0.45, rel: 0.05 });
  },
  kick(R, m, t, d, v) {
    const b = getBus(R, 'kit');
    const body = tone(R, 'triangle', 170, t, t + 0.42);
    body.frequency.setValueAtTime(170, t);
    body.frequency.exponentialRampToValueAtTime(50, t + 0.05);
    body.connect(decayEnv(R, t, v * 1.25, 0.07, b.in));
    const click = tone(R, 'p50', 440, t, t + 0.08);
    click.frequency.setValueAtTime(440, t);
    click.frequency.exponentialRampToValueAtTime(110, t + 0.014);
    click.connect(decayEnv(R, t, v * 0.5, 0.01, b.in));
  },
  snare(R, m, t, d, v) {
    const b = getBus(R, 'snare');
    noiseSrc(R, 'snare', t, t + 0.34).connect(decayEnv(R, t, v * 1, 0.055, b.in));
    const body = tone(R, 'p50', 215, t, t + 0.22);
    body.frequency.setValueAtTime(215, t);
    body.frequency.exponentialRampToValueAtTime(150, t + 0.05);
    body.connect(decayEnv(R, t, v * 0.5, 0.036, b.in));
  },
  hat(R, m, t, d, v) {
    noiseSrc(R, 'hat', t, t + 0.12).connect(decayEnv(R, t, v * 0.62, 0.016, getBus(R, 'hat').in, 0.001));
  },
  tom(R, m, t, d, v) {
    const f = hz(m), s = tone(R, 'triangle', f * 1.7, t, t + 0.5);
    s.frequency.setValueAtTime(f * 1.7, t);
    s.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    s.connect(decayEnv(R, t, v * 1.15, 0.075, getBus(R, 'kit').in));
  },
  crash(R, m, t, d, v) {
    noiseSrc(R, 'hat', t, t + 1.1).connect(decayEnv(R, t, v * 0.3, 0.16, getBus(R, 'crash').in));
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
  conv.buffer = impulse(c, track.room, hashStr(track.id) + 7);
  wet.connect(conv); conv.connect(tilt);
  const R = { c, rng, dry, wet, buses: {}, noise: noiseBuffers(c), waves: chipWaves(c) };

  const { b, events } = makeScore(track);
  write(b);
  let t0 = performance.now();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const fn = VOICES[e.inst];
    if (!fn) throw new Error('no voice ' + e.inst);
    fn(R, e.m, e.t, e.d, e.v, e.o);
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

const CRASH = { crash: '9' };
const FIGHT_KIT = { amp: 0.62 };

export const TRACKS = [
  T({
    id: 'rock', name: 'Rock, Other Rock', stage: 1, bpm: 130, pulse: 130, beats: 4, bars: 24, room: 0.28,
    key: 'D minor', meter: '4/4',
    desc: 'Bach in a bad mood: a D pedal, two stubborn low notes, and a subject that keeps getting interrupted.',
    chords: 'Dm | A7 | Dm,Gm | A7 | Dm | F,C | Bb,Gm | A | Gm | C | F | Bb | Edim | A | Dm | A7,Dm | Eb | A7 | Dm | Bb | Gm | C#dim7 | A7 | A7',
    base(b) {
      const p = b.chords;
      b.line('cello', `
        D4:1 F4:.5 E4:.5 D4:1 A3:1 | C#4:1 E4:.5 D4:.5 C#4:1 A3:1 | D4:1 F4:1 G4:1 D4:1 | A4:1.5 G4:.5 E4:1 C#4:1 |
        D4:1 F4:.5 E4:.5 D4:1 A3:1 | A3:1 C4:.5 D4:.5 E4:1 G4:1 | F4:1 D4:1 Bb3:1 D4:.5 E4:.5 | E4:1 C#4:1 A3:2 |
        G3:.5 Bb3:.5 D4:.5 G4:.5 D4:.5 Bb3:.5 G3:1 | G3:.5 C4:.5 E4:.5 G4:.5 E4:.5 C4:.5 G3:1 |
        A3:.5 C4:.5 F4:.5 A4:.5 F4:.5 C4:.5 A3:1 | F3:.5 Bb3:.5 D4:.5 F4:.5 D4:.5 Bb3:.5 F3:1 |
        G3:.5 Bb3:.5 E4:.5 G4:.5 E4:.5 Bb3:.5 G3:1 | A3:.5 C#4:.5 E4:.5 A4:.5 E4:.5 C#4:.5 A3:1 |
        D4:.5 F4:.5 A4:.5 F4:.5 D4:.5 E4:.5 F4:.5 D4:.5 | E4:1 C#4:1 D4:2 |
        Eb4:1 G4:.5 F4:.5 Eb4:1 Bb3:1 | C#4:1 E4:.5 D4:.5 C#4:1 A3:1 | D4:1 F4:.5 E4:.5 D4:1 A3:1 | D4:1 F4:.5 E4:.5 D4:1 Bb3:1 |
        G4:1.5 F4:.5 D4:1 Bb3:1 | E4:1 G4:.5 F4:.5 E4:1 C#4:1 | A4:1 E4:1 C#4:1 A3:1 | A3:.5 C#4:.5 E4:.5 G4:.5 A4:2`, { vel: 0.85 });
      b.counter('second', { rhythm: [1.5, 0.5, 2], low: 48, high: 60, from: 16 });
      b.fig('spic', p, '1 5 3 5 1 5 8 5', { low: 43, step: 0.5, vel: 0.62, accent: [1, 0.6, 0.8, 0.6] });
      b.fig('pedal', p, '1 - 1 5', { low: 36, step: 1, vel: 0.9, len: 0.72 });
      const F = { snare: '....9.......9.79', hat: '7.4.7.4.7.4.....' };
      const G = { kick: '9.....6.........', snare: '....9...........', hat: '7.4.7.4.........', tom: '........HHMmLLll' };
      b.kit({ kick: '9.....6.9.......', snare: '....9.......9...', hat: '7.4.7.4.7.4.7.4.' },
        { 0: CRASH, 3: F, 7: G, 8: CRASH, 11: F, 15: G, 16: CRASH, 19: F, 23: G });
    },
    fight(b) {
      b.fig('spic', b.chords, '8 5 3 5 1 5 3 5', { low: 50, step: 0.25, vel: 0.52, len: 0.62, accent: [1, 0.55, 0.75, 0.55], o: { hard: true } });
      const R = { snare: '5555777799999999', hat: null };
      b.kit({ kick: '9.5.7.5.9.5.7.5.', snare: '....7..5....7.55', hat: '5353535353535353' }, { 7: R, 15: R, 23: R }, FIGHT_KIT);
    },
  }),
  T({
    id: 'hug', name: 'Tree Hugging (Aggressive)', stage: 2, bpm: 144, pulse: 144, beats: 3, bars: 32, room: 0.26,
    key: 'A minor', meter: '3/4',
    desc: 'A scherzo with its elbows out. The B section walks the whole circle of fifths in running eighths.',
    chords: 'Am | E7 | Am | E7 | Am | Dm | Bdim | E7 | Am | E7 | Am | E7 | F | Dm | E7 | Am | Dm | G | C | F | Bdim | E7 | Am | A7 | Dm | G#dim7 | Am/E | E7 | F | Bb | E7 | E7',
    base(b) {
      const p = b.chords;
      const hook = 'A3:.5 C4:.5 E4:1 A4:1 | G#4:1 E4:.5 D4:.5 B3:1 | C4:.5 E4:.5 A4:2 | B3:.5 D4:.5 G#4:2 |';
      b.line('cello', `${hook}
        A4:1 E4:1 C4:1 | D4:.5 F4:.5 A4:1 F4:1 | F4:1 D4:1 B3:1 | E4:1 G#4:1 D4:1 | ${hook}
        A4:1 F4:.5 G4:.5 A4:1 | F4:1 D4:.5 E4:.5 F4:1 | G#4:1 E4:1 B3:1 | A3:1 C4:1 E4:1 |
        D4:.5 E4:.5 F4:.5 G4:.5 A4:1 | G4:.5 F4:.5 D4:.5 C4:.5 B3:1 | C4:.5 D4:.5 E4:.5 F4:.5 G4:1 | F4:.5 E4:.5 C4:.5 Bb3:.5 A3:1 |
        B3:.5 C4:.5 D4:.5 E4:.5 F4:1 | E4:.5 D4:.5 B3:.5 A3:.5 G#3:1 | A3:.5 B3:.5 C4:.5 D4:.5 E4:1 | G4:.5 F4:.5 E4:.5 D4:.5 C#4:1 |
        A4:1 F4:.5 E4:.5 D4:1 | F4:1 D4:.5 C4:.5 B3:1 | E4:1 C4:.5 B3:.5 A3:1 | G#3:.5 B3:.5 D4:.5 G#4:.5 E4:1 |
        A4:1 F4:1 C4:1 | D4:1 F4:.5 D4:.5 Bb3:1 | G#3:1 B3:1 D4:1 | G#4:2 E4:1`, { vel: 0.85 });
      b.counter('second', { rhythm: [1, 2], low: 48, high: 62, from: 24 });
      b.fig('spic', p, '1 8 5 8 3 8', { low: 45, step: 0.5, vel: 0.6, accent: [1, 0.55, 0.8, 0.55, 0.8, 0.55] });
      b.fig('pedal', p, '1 - 5', { low: 36, step: 1, vel: 0.9, len: 0.75 });
      const F = { snare: '....9...9.77', hat: '6.4.6.4.....' };
      const G = { kick: '9...........', snare: '....9.......', hat: null, tom: '......HHMMLL' };
      b.kit({ kick: '9.......5...', snare: '....9...7...', hat: '6.4.6.4.6.4.' },
        { 0: CRASH, 7: F, 8: CRASH, 15: G, 16: CRASH, 23: F, 24: CRASH, 31: G });
    },
    fight(b) {
      b.fig('spic', b.chords, '8 3 5 3 8 3 5 3 8 3 5 3', { low: 50, step: 0.25, vel: 0.5, len: 0.62, accent: [1, 0.55, 0.75, 0.55], o: { hard: true } });
      const R = { snare: '5577779999999', hat: null };
      b.kit({ kick: '9.5.9.5.9.5.', snare: '....7...7..5', hat: '535353535353' }, { 7: R, 15: R, 23: R, 31: R }, FIGHT_KIT);
    },
  }),
  T({
    id: 'farm', name: 'Ee-I-Ee-I-Oh No', stage: 3, bpm: 450, pulse: 150, beats: 6, bars: 44, room: 0.24,
    key: 'E minor', meter: '6/8',
    desc: 'A tarantella built on Old MacDonald, with Paganini arpeggios and a Neapolitan the farmer did not ask for.',
    chords: 'Em | Am,Em | G,D | Em | Em | Am | B7 | Em | C | D | Em | B | C | Am | B7 | B7 | G | D | Em | B7 | C | G/B | Am | B7 | Em | C#dim7 | Am/C | F | Em/B | B7 | Em | B7 | Am | D | G | C | F#dim | B7 | Em | Am,Em | G,D | Em | F | B7',
    base(b) {
      const p = b.chords;
      const oldMac = 'E4:2 E4:1 E4:2 B3:1 | C4:2 C4:1 B3:3 | G4:2 G4:1 F#4:2 F#4:1 |';
      b.line('cello', `${oldMac} E4:4 D4:1 B3:1 |
        B3:1 B3:1 E4:1 E4:1 G4:1 E4:1 | A3:1 C4:1 E4:1 A4:3 | F#4:2 D#4:1 A4:2 F#4:1 | G4:3 E4:3 |
        E4:3 G4:3 | F#4:2 D4:1 A3:3 | G4:2 F#4:1 E4:3 | D#4:3 B3:3 |
        E4:2 G4:1 C4:2 E4:1 | A3:2 C4:1 E4:2 A4:1 | F#4:2 D#4:1 B3:3 | A3:1 B3:1 D#4:1 F#4:1 A4:2`, { vel: 0.85 });
      b.fig('cello', b.span(16, 24), '1 3 5 8 5 3', { low: 47, step: 1, vel: 0.8, len: 0.9 });
      b.line('cello', `
        G4:3 E4:3 | G4:2 E4:1 C#4:3 | C4:2 E4:1 A4:3 | A4:2 F4:1 C4:3 | B3:2 E4:1 G4:3 | F#4:2 D#4:1 B3:3 | E4:6 | B3:1 D#4:1 F#4:1 A4:1 F#4:1 D#4:1 |
        E4:2 E4:1 E4:2 A3:1 | F#4:2 F#4:1 D4:3 | G4:2 G4:1 D4:2 B3:1 | E4:2 E4:1 C4:3 | F#4:2 F#4:1 C4:2 A3:1 | D#4:2 D#4:1 B3:3 |
        ${oldMac} E4:4 D4:1 B3:1 | A4:2 F4:1 C4:3 | B3:1 D#4:1 F#4:1 A4:1 F#4:1 D#4:1`, { at: 144, vel: 0.85 });
      b.counter('second', { rhythm: [3, 3], low: 47, high: 59, from: 48 });
      b.fig('spic', p, '1 - 8 - 5 -', { low: 40, step: 1, vel: 0.58, accent: [1, 0.6, 0.8, 1, 0.6, 0.8] });
      b.fig('pedal', p, '1 - - 5 - -', { low: 36, step: 1, vel: 0.9, len: 1.6 });
      const F = { snare: '......9.9.77', hat: '7.5.7.5.....' };
      const G = { kick: '9.....', snare: null, hat: null, tom: 'HHMMLLHHMMLL' };
      b.kit({ kick: '9..6..', snare: '...9..', hat: '7.5.7.' },
        { 0: CRASH, 7: F, 15: G, 16: CRASH, 23: F, 31: G, 32: CRASH, 43: G });
    },
    fight(b) {
      b.fig('spic', b.chords, '8 5 3 5 8 5', { low: 50, step: 1, vel: 0.5, len: 0.62, accent: [1, 0.55, 0.75, 1, 0.55, 0.75], o: { hard: true } });
      const R = { snare: '557799999999', hat: null };
      b.kit({ kick: '9.5.7.9.5.7.', snare: '....7.....7.', hat: '5.3.5.35.3.5.' }, { 7: R, 15: R, 23: R, 31: R, 43: R }, FIGHT_KIT);
    },
  }),
  T({
    id: 'value', name: 'Property Values', stage: 4, bpm: 160, pulse: 160, beats: 5, bars: 16, room: 0.22,
    key: 'C minor', meter: '5/4',
    desc: 'A lament bass in five, because they only go down. Ends on a Neapolitan and a very firm dominant.',
    chords: 'Cm | G/B | Gm/Bb | F/A | Fm/Ab | G | G7 | Cm | Fm | Bb | Eb | Ab | Ddim | G7 | Db | G7',
    base(b) {
      const p = b.chords;
      b.line('cello', `
        G4:1.5 Eb4:.5 C4:1 Eb4:1 G4:1 | D4:1.5 B3:.5 G3:1 B3:1 D4:1 | D4:1.5 Bb3:.5 G3:1 Bb3:1 G4:1 | C4:1.5 A3:.5 F3:1 A3:1 F4:1 |
        C4:1.5 Ab3:.5 F3:1 Ab3:1 F4:1 | D4:1.5 B3:.5 G3:1 D4:1 G4:1 | F4:1.5 D4:.5 B3:1 D4:1 F4:1 | Eb4:1.5 D4:.5 C4:3 |
        Ab4:1.5 F4:.5 C4:1 F4:1 Ab4:1 | F4:1.5 D4:.5 Bb3:1 D4:1 F4:1 | G4:1.5 Eb4:.5 Bb3:1 Eb4:1 G4:1 | Ab4:1.5 Eb4:.5 C4:1 Eb4:1 Ab4:1 |
        F4:1.5 D4:.5 Ab3:1 D4:1 F4:1 | G4:1.5 D4:.5 B3:1 D4:1 F4:1 | F4:1.5 Db4:.5 Ab3:1 Db4:1 F4:1 | F4:1 D4:1 B3:1 G3:1 B3:.5 D4:.5`, { vel: 0.85 });
      b.counter('second', { rhythm: [1.5, 1.5, 2], low: 46, high: 60, from: 0 });
      b.fig('spic', p, '1 5 1 - 5 - 1 - 1 5 8 - 1 5 1 5 1 5 1 5', { low: 38, step: 0.25, vel: 0.62, accent: [1, 0.6, 0.8, 0.6] });
      b.fig('pedal', p, '1 - - 1 -', { low: 40, step: 1, vel: 0.9, len: 0.8 });
      b.chop('9...................', [0, 8], { low: 40 });
      const F = { snare: '........9.......9.79', hat: '6.4.6.4.6.4.6.4.....' };
      const G = { kick: '9.......5...........', snare: '........9...........', hat: null, tom: '............HHMMLLLL' };
      b.kit({ kick: '9.......5...9.......', snare: '........9.......9...', hat: '6.46.46.46.46.46.46.' },
        { 0: CRASH, 3: F, 7: G, 8: CRASH, 11: F, 15: G });
    },
    fight(b) {
      b.fig('spic', b.chords, '8 5 3 5 8 5 3 5 8 5 3 5 8 5 3 5 8 5 3 5', { low: 50, step: 0.25, vel: 0.5, len: 0.62, accent: [1, 0.55, 0.75, 0.55], o: { hard: true } });
      const R = { snare: '55557777999999999999', hat: null };
      b.kit({ kick: '9.5.7.5.9.5.9.5.7.5.', snare: '....7...7...7...7..5', hat: '53535353535353535353' }, { 7: R, 15: R }, FIGHT_KIT);
    },
  }),
  T({
    id: 'knock', name: 'Knock Knock (It\'s Me)', stage: 5, bpm: 336, pulse: 168, beats: 7, bars: 20, room: 0.2,
    key: 'F# harmonic minor', meter: '7/8',
    desc: 'A battering ram in seven: boom, boom, BOOM. Neapolitan G major on the gatehouse, nobody answers.',
    chords: 'F#m | G | F#m | C#7 | D | Bm | C#7 | F#m | Bm | E | A | D | G#dim | C#7 | F#m | F#m | G | C#7 | F#m | C#7',
    base(b) {
      const p = b.chords;
      b.line('cello', `
        F#4:2 A4:2 C#4:3 | G4:2 B3:2 D4:3 | F#4:2 C#4:2 A3:3 | E#4:2 G#4:2 C#4:3 |
        A4:2 F#4:2 D4:3 | F#4:2 D4:2 B3:3 | G#4:2 E#4:2 B3:3 | F#4:4 C#4:1 A3:2 |
        D4:2 F#4:2 B3:3 | E4:2 G#4:2 B3:3 | E4:2 A4:2 C#4:3 | F#4:2 A4:2 D4:3 |
        G#4:2 D4:2 B3:3 | C#4:2 E#4:2 G#4:1 B3:2 | F#4:2 A4:2 F#4:1 C#4:2 | A3:2 C#4:2 F#4:3 |
        G4:2 D4:2 B3:3 | G#4:2 E#4:2 C#4:3 | C#4:2 F#4:2 A4:3 | G#4:1 E#4:1 C#4:1 B3:1 G#3:1 E#3:1 C#3:1`, { vel: 0.85 });
      b.counter('second', { rhythm: [2, 2, 3], low: 46, high: 60, from: 0 });
      b.fig('spic', p, '1 1 5 5 8 5 1', { low: 42, step: 1, vel: 0.62, accent: [1, 0.6, 1, 0.6, 1, 0.6, 0.75] });
      b.fig('pedal', p, '1 - 1 - 1 - -', { low: 36, step: 1, vel: 0.95, len: 1.5 });
      b.chop('9.....9', [1, 16], { low: 40 });
      const F = { snare: '..........9.77', hat: '5.5.5.5.......' };
      const G = { kick: '9...9.........', snare: null, hat: null, tom: '........HHMMLL' };
      b.kit({ kick: '9...9...9.....', snare: '..5...5...9.5.', hat: '5.5.55.5.55.55' },
        { 0: CRASH, 3: F, 7: G, 8: CRASH, 11: F, 15: G, 16: CRASH, 19: G });
    },
    fight(b) {
      b.fig('spic', b.chords, '8 5 3 5 8 5 3 5 8 5 3 5 8 5', { low: 50, step: 0.5, vel: 0.56, len: 0.62, accent: [1, 0.6, 1, 0.6, 1, 0.6, 0.75], o: { hard: true } });
      const R = { snare: '55777799999999', hat: null };
      b.kit({ kick: '9.5.9.5.9.5.7.', snare: '..7...7...9.7.', hat: '53535353535353' }, { 7: R, 15: R, 19: R }, FIGHT_KIT);
    },
  }),
  T({
    id: 'urban', name: 'Urban Renewal', stage: 6, bpm: 186, pulse: 186, beats: 4, bars: 16, room: 0.18,
    key: 'B minor', meter: '4/4',
    desc: 'The city is rebuilt in minor thirds, then in a very fast circle of fifths. Spiccato runs for the exits.',
    chords: 'Bm | Dm | Fm | Abm | Bm | G | C#dim7 | F#7 | Em | A | D | G | C#dim7 | F#7 | Bm | F#7',
    base(b) {
      const p = b.chords;
      b.line('cello', `
        F#4:1.5 D4:.5 B3:1 D4:1 | A4:1.5 F4:.5 D4:1 F4:1 | Ab4:1.5 F4:.5 C4:1 Ab3:1 | Eb4:1.5 B3:.5 Ab3:1 B3:1 |
        F#4:1.5 E4:.5 D4:1 B3:1 | G4:1.5 F#4:.5 D4:1 B3:1 | E4:1 G4:1 Bb3:1 C#4:1 | C#4:1 E4:1 F#4:1 A#3:1 |
        E4:1 G4:1 B3:1 G4:1 | E4:1 A4:1 C#4:1 A4:1 | F#4:1 A4:1 D4:1 A4:1 | D4:1 G4:1 B3:1 G4:1 |
        E4:1 G4:1 C#4:1 G4:1 | C#4:1 F#4:1 A#3:1 E4:1 | D4:1 F#4:1 B3:1 D4:1 | F#4:.5 E4:.5 C#4:.5 A#3:.5 F#4:2`, { vel: 0.85 });
      b.counter('second', { rhythm: [1, 1, 2], low: 47, high: 60, from: 0 });
      b.fig('spic', p, '1 3 5 8 5 3 5 3', { low: 42, step: 0.25, vel: 0.56, len: 0.7, accent: [1, 0.55, 0.75, 0.55] });
      b.fig('pedal', p, '1 1 - 5 1 1 - 5', { low: 36, step: 0.5, vel: 0.9, len: 0.8 });
      b.chop('9.......', [0, 8], { low: 40 });
      const F = { snare: '....9.......9.99', hat: '75757575757575..' };
      const G = { kick: '9.....6.........', snare: '....9...........', hat: null, tom: '........HHMMLLLL' };
      b.kit({ kick: '9.....6.9.5.....', snare: '....9.......9..5', hat: '7575757575757575' },
        { 0: CRASH, 3: F, 7: G, 8: CRASH, 11: F, 15: G });
    },
    fight(b) {
      b.fig('spic', b.chords, '8 5 3 5 8 3 5 3', { low: 50, step: 0.25, vel: 0.5, len: 0.6, accent: [1, 0.55, 0.75, 0.55], o: { hard: true } });
      const R = { snare: '9999999999999999', hat: null };
      b.kit({ kick: '9.5.9.5.9.5.9.5.', snare: '....7..5....7.55', hat: '5353535353535353' }, { 3: R, 7: R, 11: R, 15: R }, FIGHT_KIT);
    },
  }),
  T({
    id: 'king', name: 'Long Live the King (Briefly)', stage: 7, bpm: 210, pulse: 210, beats: 4, bars: 14, room: 0.16,
    key: 'G minor', meter: '4/4',
    desc: 'Vivaldi storm at the throne room door. The rocks from stage one come back as a bass in a blind panic.',
    chords: 'Gm | D7 | Gm | Ab | Gm | D7 | Eb | D7 | Cm | F | Bb | Eb | Ab | D7',
    base(b) {
      const p = b.chords;
      b.line('cello', `
        G4:1 D4:.5 Bb3:.5 G3:1 Bb3:.5 D4:.5 | F#4:1 D4:.5 A3:.5 F#3:1 A3:.5 D4:.5 | G4:1 Bb3:.5 D4:.5 G3:.5 Bb3:.5 D4:.5 G4:.5 | Ab4:1 Eb4:.5 C4:.5 Ab3:1 C4:.5 Eb4:.5 |
        G4:1 D4:.5 Bb3:.5 G3:1 Bb3:.5 D4:.5 | A4:1 F#4:.5 D4:.5 A3:1 C4:.5 D4:.5 | G4:1 Eb4:.5 Bb3:.5 G3:1 Bb3:.5 Eb4:.5 | F#4:.5 A4:.5 F#4:.5 D4:.5 C4:.5 A3:.5 F#3:.5 D3:.5 |
        C4:1 Eb4:.5 G4:.5 C4:1 Eb4:.5 G4:.5 | F4:1 A4:.5 C4:.5 F4:1 A4:.5 C4:.5 | D4:1 F4:.5 Bb3:.5 D4:1 F4:.5 Bb3:.5 | Eb4:1 G4:.5 Bb3:.5 Eb4:1 G4:.5 Bb3:.5 |
        C4:1 Eb4:.5 Ab4:.5 C4:1 Eb4:.5 Ab4:.5 | F#4:.5 A4:.5 C4:.5 D4:.5 F#4:.5 A4:.5 D4:1`, { vel: 0.85 });
      b.counter('second', { rhythm: [1, 1, 1, 1], low: 46, high: 60, from: 0 });
      b.fig('spic', p, '1 1 5 5 8 8 5 5', { low: 43, step: 0.25, vel: 0.56, len: 0.7, accent: [1, 0.55, 0.75, 0.55] });
      b.fig('pedal', p, '1 5 1 5', { low: 36, step: 0.5, vel: 0.92, len: 0.82 });
      b.chop('9.......', [0, 3, 8, 12], { low: 40 });
      const F = { snare: '....9.......99999', hat: '7575757575......' };
      const G = { snare: '....9...', hat: null, tom: '........HHMMLLLL' };
      b.kit({ kick: '9.7.8.7.9.7.8.79', snare: '....9.......9.5.', hat: '7575757575757575' },
        { 0: CRASH, 3: F, 7: G, 8: CRASH, 11: F, 13: G });
    },
    fight(b) {
      b.fig('spic', b.chords, '8 3 5 3 8 5 3 5', { low: 50, step: 0.25, vel: 0.52, len: 0.6, accent: [1, 0.55, 0.75, 0.55], o: { hard: true } });
      const R = { snare: '9999999999999999', hat: null };
      b.kit({ kick: '9797979797979799', snare: '9.5.9.5.9.5.9.55', hat: '5353535353535353' }, { 3: R, 7: R, 11: R, 13: R }, FIGHT_KIT);
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
