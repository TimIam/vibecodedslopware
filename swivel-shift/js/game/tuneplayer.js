// The game's music, played from its own data: a QuickTime Music Architecture TunePlayer plus the
// QuickTime Music Synthesizer, standing in for SetMusic's TuneSetHeaderWithSize + TuneQueue (rate 1.0,
// looping).
//
// A 'Tune' resource is a MusicDescription (one instrument request per part) followed by 32-bit QTMA
// events (notes, controllers, rests, markers) at 600 units per second. Parts that ask for Harry's own
// instruments are played from the "Harry Instruments" component: 'ssai' atomic instruments holding 8-bit
// 22 kHz samples with key ranges, loop points and envelope "knobs". Tunes with parts that ask for
// QuickTime's built-in General MIDI instruments ("Best Synthesizer") can't be played from the game's files
// (canPlayTune is false for them; music.js plays their recordings instead).

import { ResFile, macRoman } from '../rsrc.js';

const UNITS_PER_SECOND = 600;   // the TunePlayer's default time scale (matches the recordings exactly)
const SAMPLE_RATE = 22050;
const MAKEUP = 1.9;             // (level matched against the MP3 recordings)

// ---------------------------------------------------------------- data access
let instFile = null;            // "Harry Instruments" (data/instruments.rsrc)
export function setInstrumentFile(rf) { instFile = rf; }

const be32 = (u8, p) => ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0;
const s32 = (u8, p) => be32(u8, p) | 0;
const s16 = (u8, p) => ((u8[p] << 24) >> 16) | u8[p + 1];
const fourcc = (u8, p) => macRoman(u8.subarray(p, p + 4));
// Str31 that may have a zeroed length byte with the name still behind it (Tune 614 parts 2 and 5)
function str31(u8, p) {
  const n = u8[p];
  if (n) return macRoman(u8.subarray(p + 1, p + 1 + n));
  let e = p + 1;
  while (e < p + 32 && u8[e] >= 32) e++;
  return macRoman(u8.subarray(p + 1, e));
}

// QuickTime atom container: [{type, id, data | kids}]
function atoms(u8, p, end) {
  const out = [];
  while (p + 20 <= end) {
    const size = be32(u8, p), type = fourcc(u8, p + 4), id = be32(u8, p + 8), kids = (u8[p + 14] << 8) | u8[p + 15];
    if (size < 20 || p + size > end) break;
    out.push(kids ? { type, id, kids: atoms(u8, p + 20, p + size) } : { type, id, data: u8.subarray(p + 20, p + size) });
    p += size;
  }
  return out;
}

// ToneDescription
function toneDesc(d) {
  return { synthType: fourcc(d, 0), synth: str31(d, 4), name: str31(d, 36), number: s32(d, 68), gm: s32(d, 72) };
}

// ---------------------------------------------------------------- Tune
// -> {parts: Map(part -> tone), events: [{t, kind, part, a, b, c}], length}
export function parseTune(u8) {
  const hsize = be32(u8, 0);
  const parts = new Map();
  let p = 0x14;
  while (p < hsize - 4) {                       // header: general events, one per part
    const head = be32(u8, p);
    if (head >>> 28 !== 0xf) break;
    const len = head & 0xffff, part = (head >>> 16) & 0xfff;
    const sub = (be32(u8, p + len * 4 - 4) >>> 16) & 0xff;
    const body = u8.subarray(p + 4, p + len * 4 - 4);
    if (sub === 1) parts.set(part, toneDesc(body.subarray(8)));            // NoteRequest
    else if (sub === 6) {                                                     // same, as an atom container
      for (const a of atoms(body, 12, body.length)) {
        for (const k of a.kids || []) if (k.type === 'tone') parts.set(part, toneDesc(k.data));
      }
    }
    p += len * 4;
  }
  const events = [];
  let t = 0;
  for (p = hsize; p + 4 <= u8.length;) {
    const w = be32(u8, p);
    const top = w >>> 29;
    if (top === 0) { t += w & 0x1fffffff; p += 4; }                          // rest
    else if (top === 1) {                                                     // note
      events.push({ t, kind: 'note', part: (w >>> 24) & 0x1f, a: ((w >>> 18) & 0x3f) + 32, b: (w >>> 11) & 0x7f, c: w & 0x7ff });
      p += 4;
    } else if (top === 2) {                                                   // controller (value 8.8)
      events.push({ t, kind: 'ctl', part: (w >>> 24) & 0x1f, a: (w >>> 16) & 0xff, b: ((w & 0xffff) << 16) >> 16 });
      p += 4;
    } else if (top === 3) {                                                   // marker
      p += 4;
      if (w === 0x60000000) break;                                            // end of the sequence
    } else {
      const w2 = be32(u8, p + 4), kind = w >>> 28;
      if (kind === 0x9) {                                                     // extended note
        events.push({ t, kind: 'note', part: (w >>> 16) & 0xfff, a: w & 0xffff, b: (w2 >>> 22) & 0x7f, c: w2 & 0x3fffff });
        p += 8;
      } else if (kind === 0xa) {                                              // extended controller
        events.push({ t, kind: 'ctl', part: (w >>> 16) & 0xfff, a: w & 0x3fff, b: ((w2 & 0xffff) << 16) >> 16 });
        p += 8;
      } else if (kind === 0xf) p += Math.max(1, w & 0xffff) * 4;              // general event (skipped)
      else p += 8;                                                            // knob / undefined
    }
  }
  return { parts, events, length: t };
}

// ---------------------------------------------------------------- 'ssai' atomic instruments
// Knob ids (QuickTime Music Synthesizer, low bits of 0x02000000 + n)
const K = { attack: 1, decay: 2, sustainLevel: 3, release: 6, transpose: 18, sustainTime: 29, sustainInfinite: 30,
  velocityLow: 32, velocityHigh: 33, pitchSensitivity: 35 };

function knobList(d) {
  const out = {};
  if (!d || d.length < 8) return out;
  const n = s32(d, 0);
  for (let i = 0; i < n && 16 + i * 8 <= d.length; i++) out[be32(d, 8 + i * 8) & 0xffffff] = s32(d, 12 + i * 8);
  return out;
}

// Harry's instruments ('ssai'), decoded on first use. pick(key, vel) returns a zone for the voice engine.
class SsaiInstrument {
  constructor(ac, data) {
    this.knobs = {};
    this.samples = [];
    const sdat = new Map();
    for (const root of atoms(data, 12, data.length)) {
      for (const a of root.kids || []) {
        if (a.type === 'knbl') this.knobs = knobList(a.data);
        else if (a.type === 'sdat') sdat.set(a.id, a.data);
        else if (a.type === 'sinf') {
          const s = { knobs: {} };
          for (const k of a.kids || []) {
            if (k.type === 'knbl') s.knobs = knobList(k.data);
            else if (k.type === 'sdsc') {
              const d = k.data; // InstSampleDescRec
              Object.assign(s, { dataId: s16(d, 12), frames: s32(d, 18), loopStart: s32(d, 26), loopEnd: s32(d, 30),
                pitchNormal: s32(d, 34), pitchLow: s32(d, 38), pitchHigh: s32(d, 42) });
            }
          }
          this.samples.push(s);
        }
      }
    }
    for (const s of this.samples) {               // 8-bit unsigned -> AudioBuffer
      const raw = sdat.get(s.dataId) || new Uint8Array(0);
      const n = Math.max(1, Math.min(s.frames, raw.length));
      s.buffer = ac.createBuffer(1, n, SAMPLE_RATE);
      const ch = s.buffer.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (raw[i] - 128) / 128;
      s.k = { ...this.knobs, ...s.knobs };
    }
  }

  pick(key, vel) {
    const s = this.samples.find((x) => key >= x.pitchLow && key <= x.pitchHigh
        && vel >= (x.k[K.velocityLow] ?? 0) && vel <= (x.k[K.velocityHigh] ?? 127))
      || this.samples.find((x) => key >= x.pitchLow && key <= x.pitchHigh);
    if (!s) return null;
    const k = s.k;
    // envelope: attack, decay to the sustain level, then hold (sustain infinite) or fade out over the
    // sustain time. Transpose is in 1/256 semitone; pitch sensitivity is how far the pitch follows the key.
    return {
      buffer: s.buffer, root: s.pitchNormal, cents: ((k[K.transpose] || 0) / 256) * 100,
      keyTrack: (k[K.pitchSensitivity] ?? 100) / 100,
      // (a one- or two-frame "loop" at the very end means one-shot)
      loop: s.loopEnd - s.loopStart > 16 ? { start: s.loopStart / SAMPLE_RATE, end: (s.loopEnd + 1) / SAMPLE_RATE } : null,
      gain: 1, velocity: (v) => v / 127, pan: 0, group: 0, pitchEnv: null,
      env: {
        attack: (k[K.attack] || 0) / 1000, decay: (k[K.decay] || 0) / 1000,
        sustain: (k[K.sustainLevel] ?? 65536) / 65536,
        infinite: k[K.sustainInfinite] !== undefined ? !!k[K.sustainInfinite] : k[K.sustainTime] === undefined,
        sustainTime: (k[K.sustainTime] || 0) / 1000, release: (k[K.release] || 0) / 1000,
      },
    };
  }
}

const instCache = new Map();
function harryInstrument(ac, name) {
  if (!instCache.has(name)) {
    const data = instFile && instFile.getNamed('ssai', name);
    instCache.set(name, data ? new SsaiInstrument(ac, data) : null);
  }
  return instCache.get(name);
}

// The instrument a part asked for, if it is one of Harry's own (by name, from the QuickTime Music Synthesizer)
const isHarry = (tone) => !!(tone && instFile && tone.name && instFile.getNamed('ssai', tone.name));
const partInstrument = (ac, tone) => (isHarry(tone) ? harryInstrument(ac, tone.name) : null);
const partPlayable = isHarry;

// Can every part of this tune that plays notes be given its instrument?
export function canPlayTune(tuneData) {
  if (!tuneData) return false;
  const tune = parseTune(tuneData);
  const used = new Set(tune.events.filter((e) => e.kind === 'note').map((e) => e.part));
  for (const part of used) if (!partPlayable(tune.parts.get(part))) return false;
  return used.size > 0;
}

// ---------------------------------------------------------------- playback
// QTMA controllers (values 8.8): 7 volume (0..127), 10 pan (256 left .. 384 centre .. 512 right),
// 32 pitch bend (semitones). 33 (aftertouch) is ignored, as QuickTime's synthesiser ignores it.
class Part {
  constructor(ac, out, inst) {
    this.inst = inst;
    this.pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    this.gain = ac.createGain();
    this.gain.connect(this.pan || out);
    if (this.pan) this.pan.connect(out);
    this.bend = 0;
    this.voices = new Set();
  }
}

export class TunePlayer {
  // opts.output: AudioNode to connect to
  constructor(ac, tuneData, output) {
    this.ac = ac;
    this.tune = parseTune(tuneData);
    // mix -> gentle limiter -> make-up gain, bringing the level up to the recordings' (and so keeping the
    // balance with the sound effects) without clipping the peaks
    this.out = ac.createGain();
    this.out.gain.value = 0.55;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -20; limiter.knee.value = 4; limiter.ratio.value = 12;
    limiter.attack.value = 0.001; limiter.release.value = 0.15;
    const makeup = ac.createGain();
    makeup.gain.value = MAKEUP;
    this.out.connect(limiter);
    limiter.connect(makeup);
    makeup.connect(output);
    this.tail = makeup;
    this.parts = new Map();
    for (const [n, tone] of this.tune.parts) this.parts.set(n, new Part(ac, this.out, partInstrument(ac, tone)));
    this.stopped = false;
  }

  start(when = this.ac.currentTime + 0.05) {
    this.origin = when;
    this.index = 0;
    this.timer = setInterval(() => this.pump(), 50);
    this.pump();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    const now = this.ac.currentTime;
    for (const part of this.parts.values()) {
      for (const v of part.voices) { try { v.src.stop(now + 0.02); } catch (e) { /* not started */ } }
    }
    this.out.gain.setTargetAtTime(0, now, 0.01);
    setTimeout(() => this.tail.disconnect(), 200);
  }

  // schedule the events that fall inside the look-ahead window (longer when the page is hidden, since
  // timers then run at most once a second)
  pump() {
    if (this.stopped) return;
    this.scheduleUntil(this.ac.currentTime + (document.hidden ? 2.5 : 0.3));
  }

  // schedule everything up to context time `until` (also used to render a tune offline)
  scheduleUntil(until) {
    const ev = this.tune.events;
    const len = this.tune.length / UNITS_PER_SECOND;
    for (;;) {
      if (this.index >= ev.length) {           // loop (TuneQueue with kTuneLoopUntil)
        if (len <= 0) return;
        this.origin += len;
        this.index = 0;
      }
      const e = ev[this.index];
      const at = this.origin + e.t / UNITS_PER_SECOND;
      if (at > until) break;
      this.index++;
      if (at < this.ac.currentTime - 0.1) continue; // fell behind: skip rather than pile up
      const part = this.parts.get(e.part);
      if (!part) continue;
      if (e.kind === 'note') this.noteOn(part, e.a, e.b, Math.max(at, this.ac.currentTime), e.c / UNITS_PER_SECOND);
      else this.control(part, e.a, e.b, Math.max(at, this.ac.currentTime));
    }
  }

  control(part, ctl, val, at) {
    if (ctl === 7) part.gain.gain.setValueAtTime(Math.max(0, Math.min(1, val / 256 / 127)) ** 2, at);
    else if (ctl === 10 && part.pan) part.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, (val - 384) / 128)), at);
    else if (ctl === 32) {
      part.bend = val / 256;
      for (const v of part.voices) v.src.detune.setValueAtTime(part.bend * 100, at);
    }
  }

  noteOn(part, key, vel, at, dur) {
    const z = part.inst && vel ? part.inst.pick(key, vel) : null;
    if (!z) return;
    const ac = this.ac;
    if (z.group) {                              // exclusive key groups (open/closed hi-hat): cut the last one
      for (const v of part.voices) {
        if (v.group === z.group && v.end > at) { v.gain.gain.setTargetAtTime(0, at, 0.005); v.end = at; }
      }
    }
    const src = ac.createBufferSource();
    src.buffer = z.buffer;
    src.playbackRate.value = 2 ** (((key - z.root) * z.keyTrack) / 12 + (z.cents || 0) / 1200);
    src.detune.value = part.bend * 100;
    if (z.pitchEnv) {                           // drum pitch drop
      src.detune.setValueAtTime(part.bend * 100 + z.pitchEnv.cents, at);
      src.detune.setTargetAtTime(part.bend * 100 + z.pitchEnv.cents * z.pitchEnv.sustain, at, z.pitchEnv.decay / 4);
    }
    if (z.loop) { src.loop = true; src.loopStart = z.loop.start; src.loopEnd = z.loop.end; }
    // envelope: attack, decay to the sustain level, hold (or fade over the sustain time), release at note end
    const g = ac.createGain(), gg = g.gain, e = z.env;
    const peak = z.gain * z.velocity(vel);
    const A = Math.min(e.attack, dur);
    if (A > 0.002) { gg.setValueAtTime(0, at); gg.linearRampToValueAtTime(peak, at + A); } else gg.setValueAtTime(peak, at);
    if (e.decay > 0 && e.sustain < 1) gg.setTargetAtTime(peak * e.sustain, at + A, e.decay / 4);
    if (!e.infinite && e.sustainTime > 0) gg.setTargetAtTime(0, at + A + e.decay, e.sustainTime / 3);
    const R = Math.max(0.01, e.release);
    const off = at + Math.max(dur, 0.005);
    gg.setTargetAtTime(0, off, R / 4);
    let last = g;
    if (z.pan && ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = z.pan; g.connect(pn); last = pn; }
    src.connect(g);
    last.connect(part.gain);
    src.start(at);
    src.stop(off + R * 1.5 + 0.02);
    const voice = { src, gain: g, group: z.group, end: off };
    part.voices.add(voice);
    src.onended = () => { part.voices.delete(voice); last.disconnect(); if (last !== g) g.disconnect(); };
  }
}

export { ResFile };
