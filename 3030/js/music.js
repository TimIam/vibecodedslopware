// Song compiler. Songs are written as chord charts, scale-degree melodies and drum grids
// (see songs.js), and compiled once into a flat, time-sorted event list for the sequencer.
//
// Part fields (one 16th note per step, 16 steps a bar):
//   chords: '1 6 4 5'      one per bar; '1+5' splits a bar; suffixes m M d a 7 m7 M7 D7 s4 s2 m9 add9 m6 5
//   lead, lead2: '5 - 6 . 1\' - b3 ,'  scale degrees per step; ' up / , down an octave;
//                 b # accidentals; '-' holds; '.' rests; '!' after a note accents it
//   bass: 'R..R..5.R...8.7.'  chord tones per step: R 3 5 7 8 (octave), < / ^ (half step below/above root), - hold
//   arp:  '1353' chord tone indexes per step (1..4, 8 = root up an octave), - hold
//   pad:  true (hold the chord all bar) or a stab grid like 'x..x..x.'
//   drums: { k s h o c t y p z K rb rc rt rs rx: 'x...x...' } x hit, X accent, g ghost
//   ins: per-part instrument overrides; tr: semitone transposition; mute: [channels]

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11], lydian: [0, 2, 4, 6, 7, 9, 11],
};
const QUAL = {
  M: [0, 4, 7], m: [0, 3, 7], d: [0, 3, 6], a: [0, 4, 8], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], D7: [0, 4, 7, 10],
  s4: [0, 5, 7], s2: [0, 2, 7], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], m6: [0, 3, 7, 9], 5: [0, 7], d7: [0, 3, 6, 9], hd: [0, 3, 6, 10],
};

function degSemis(scale, deg) {
  const i = deg - 1, o = Math.floor(i / 7);
  return scale[((i % 7) + 7) % 7] + 12 * o;
}
// "b3'" -> semitones from the key root.
function parseDeg(tok, scale) {
  const m = /^([b#]?)(\d)([',]*)(!?)$/.exec(tok);
  if (!m) return null;
  let s = degSemis(scale, +m[2]) + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
  for (const ch of m[3]) s += ch === "'" ? 12 : -12;
  return { s, acc: !!m[4] };
}
function parseChord(tok, scale) {
  const m = /^([b#]?)([1-7])(.*)$/.exec(tok);
  if (!m) throw new Error('bad chord ' + tok);
  const deg = +m[2], acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0, q = m[3];
  const root = degSemis(scale, deg) + acc;
  let tones;
  if (q === '' || q === '7') {
    const n = q === '7' ? 4 : 3;
    tones = []; for (let k = 0; k < n; k++) tones.push(degSemis(scale, deg + k * 2) - degSemis(scale, deg));
  } else {
    tones = QUAL[q];
    if (!tones) throw new Error('bad chord quality ' + tok);
  }
  return { root, tones };
}

const toks = s => (s || '').replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);
const grid = s => (s || '').replace(/[\s|]/g, '');

export function compile(song) {
  const key = NOTE[song.key || 'C'], scale = MODES[song.mode || 'minor'];
  const bpm = song.bpm, beatDur = 60 / bpm, stepDur = beatDur / 4, swing = song.swing || 0;
  const oct = Object.assign({ lead: 5, lead2: 5, bass: 2, pad: 4, arp: 5 }, song.oct || {});
  const vol = Object.assign({ lead: 1, lead2: 0.8, bass: 1, pad: 1, arp: 0.8, drums: 1 }, song.vol || {});
  const baseIns = Object.assign({ lead: 'sqLead', lead2: 'sqThin', bass: 'fmBass', pad: 'strings', arp: 'harpsi' }, song.ins || {});
  const events = [], marks = [];
  let step = 0, loopAt = 0, loopIndex = 0;
  const T = s => s * stepDur + (s % 2 ? swing * stepDur : 0);

  song.order.forEach((name, oi) => {
    const part = song.parts[name];
    if (!part) throw new Error('no part ' + name);
    if (oi === (song.loop ?? 0)) loopAt = step;
    const ins = Object.assign({}, baseIns, part.ins || {});
    const tr = (part.tr || 0) + (song.tr || 0);
    const mute = new Set(part.mute || []);
    // Chords: list of {start, len, root, tones}.
    const bars = toks(part.chords);
    const nBars = part.bars || bars.length || 1;
    const chords = [];
    bars.forEach((b, i) => {
      const pieces = b.split('+');
      pieces.forEach((pc, j) => { const len = 16 / pieces.length; chords.push({ start: i * 16 + j * len, len, ...parseChord(pc, scale) }); });
    });
    if (!chords.length) chords.push({ start: 0, len: nBars * 16, root: 0, tones: [0, 3, 7] });
    const len = nBars * 16;
    const chordAt = s => { let c = chords[0]; for (const ch of chords) if (ch.start <= s) c = ch; return c; };
    const base = ch => 12 * (oct[ch] + 1) + key + tr;
    marks.push({ name, step, len, t: T(step) });

    // Melodic lines.
    for (const ch of ['lead', 'lead2']) {
      if (!part[ch] || mute.has(ch)) continue;
      const tk = toks(part[ch]);
      const L = Math.max(tk.length, 1);
      for (let s = 0; s < len; s++) {
        const tok = tk[s % L];
        const d = parseDeg(tok, scale);
        if (!d) continue;
        let e = s + 1; while (e < len && tk[e % L] === '-') e++;
        events.push({ s: step + s, ch, p: ins[ch], m: base(ch) + d.s, dur: e - s, v: vol[ch] * (d.acc ? 1.25 : 1) });
      }
    }
    // Bass.
    if (part.bass && !mute.has('bass')) {
      const g = grid(part.bass);
      for (let s = 0; s < len; s++) {
        const c = g[s % g.length];
        if (c === '.' || c === '-') continue;
        const chd = chordAt(s);
        let iv;
        if (c === 'R' || c === 'r') iv = 0; else if (c === '3') iv = chd.tones[1]; else if (c === '5') iv = chd.tones[2] ?? 7;
        else if (c === '7') iv = chd.tones[3] ?? 10; else if (c === '8') iv = 12; else if (c === '<') iv = -1; else if (c === '>') iv = 2; else if (c === '^') iv = 1;
        else if (c === 'o') iv = -12; else continue;
        let e = s + 1; while (e < len && g[e % g.length] === '-') e++;
        events.push({ s: step + s, ch: 'bass', p: ins.bass, m: base('bass') + chd.root + iv, dur: e - s, v: vol.bass * (c === 'r' ? 0.6 : 1) });
      }
    }
    // Arpeggio.
    if (part.arp && !mute.has('arp')) {
      const g = grid(part.arp);
      for (let s = 0; s < len; s++) {
        const c = g[s % g.length];
        if (!/[1-48]/.test(c)) continue;
        const chd = chordAt(s);
        const iv = c === '8' ? 12 : chd.tones[(+c - 1) % chd.tones.length] + (+c > chd.tones.length ? 12 : 0);
        let e = s + 1; while (e < len && g[e % g.length] === '-') e++;
        events.push({ s: step + s, ch: 'arp', p: ins.arp, m: base('arp') + chd.root + iv, dur: e - s, v: vol.arp });
      }
    }
    // Pad: held chords or stabs, voiced close above the pad root.
    if (part.pad && !mute.has('pad')) {
      const voice = chd => chd.tones.slice(0, 4).map(iv => base('pad') + ((chd.root + iv) % 12 + 12) % 12);
      if (part.pad === true) {
        for (const chd of chords) for (const m of voice(chd)) events.push({ s: step + chd.start, ch: 'pad', p: ins.pad, m, dur: chd.len, v: vol.pad });
      } else {
        const g = grid(part.pad);
        for (let s = 0; s < len; s++) {
          const c = g[s % g.length];
          if (c !== 'x' && c !== 'X') continue;
          let e = s + 1; while (e < len && g[e % g.length] === '-') e++;
          for (const m of voice(chordAt(s))) events.push({ s: step + s, ch: 'pad', p: ins.pad, m, dur: e - s, v: vol.pad * (c === 'X' ? 1.3 : 1) });
        }
      }
    }
    // Drums.
    if (part.drums && !mute.has('drums')) {
      for (const k in part.drums) {
        const g = grid(part.drums[k]);
        for (let s = 0; s < len; s++) {
          const c = g[s % g.length];
          if (c === '.' || c === '-') continue;
          events.push({ s: step + s, ch: 'drum', k, v: vol.drums * (c === 'X' ? 1.3 : c === 'g' ? 0.45 : 1) });
        }
      }
    }
    step += len;
  });

  for (const e of events) { e.t = T(e.s); if (e.dur != null) e.d = e.dur * stepDur * 0.92; }
  events.sort((a, b) => a.t - b.t || (a.k ? -1 : 1));
  loopIndex = events.findIndex(e => e.s >= loopAt);
  if (loopIndex < 0) loopIndex = 0;
  return {
    name: song.name, title: song.title, bpm, beatDur, stepDur, steps: step, len: T(step), loopAt: T(loopAt), loopStep: loopAt, loopIndex,
    events, marks,
    // Lead onsets as a chart: [{beat, m}] (used by the rhythm stages).
    chart: (ch = 'lead') => events.filter(e => e.ch === ch).map(e => ({ beat: e.s / 4, step: e.s, m: e.m, dur: e.dur })),
  };
}
