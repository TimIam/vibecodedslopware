// Pure Morse logic: code table, Koch order, timing, the straight-key decoder and
// the rules for what to ask next. No DOM, so it runs under plain Node too.

export const MORSE = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..",
  J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....",
  6: "-....", 7: "--...", 8: "---..", 9: "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-.", "=": "-...-",
};

// The standard Koch teaching order: start with two characters, add one at a time.
export const KOCH = "KMURESNAPTLWI.JZ=FOY,VG5/Q92H38B?47C1D60X".split("");

const DECODE = Object.fromEntries(Object.entries(MORSE).map(([ch, code]) => [code, ch]));
export const decode = code => DECODE[code] ?? null;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** "-.-" reads aloud as "dah-di-dah". The last dit of a character is a full "dit". */
export function speak(code) {
  return [...code].map((s, i) => (s === "-" ? "dah" : i === code.length - 1 ? "dit" : "di")).join("-");
}

/**
 * Element length and the gaps between characters and words, in ms.
 * When the effective speed is below the character speed this is ARRL Farnsworth
 * timing: letters stay crisp at full speed and only the gaps between them stretch.
 */
export function gaps(wpm, fwpm) {
  const u = 1200 / wpm;
  if (!fwpm || fwpm >= wpm) return { u, char: 3 * u, word: 7 * u };
  const ta = ((60 * wpm - 37.2 * fwpm) / (wpm * fwpm)) * 1000;
  return { u, char: (3 * ta) / 19, word: (7 * ta) / 19 };
}

/** Key-down marks for a string: { marks: [{ t, d }], total } in ms from the start. */
export function timeline(text, { wpm, fwpm }) {
  const { u, char, word } = gaps(wpm, fwpm);
  const marks = [];
  let t = 0;
  [...text].forEach((ch, i) => {
    if (ch === " ") { t += word - char; return; }
    const code = MORSE[ch];
    if (!code) return;
    [...code].forEach((s, j) => {
      const d = s === "-" ? 3 * u : u;
      marks.push({ t, d });
      t += d + (j < code.length - 1 ? u : 0);
    });
    if (i < text.length - 1) t += char;
  });
  return { marks, total: t };
}

/** Is the key down at time `at` (ms from the start of the timeline)? */
export function keyedAt(tl, at) {
  return tl.marks.some(m => at >= m.t && at < m.t + m.d);
}

/**
 * Turns straight-key presses into characters. Nobody keys evenly while learning,
 * so within a letter that mixes short and long presses the split comes from the
 * letter itself. Letters of one length (T, M, S) fall back on a running estimate
 * of this operator's own dit.
 */
export class KeyDecoder {
  constructor(unit = 95) {
    this.dit = clamp(unit, 50, 260);
    this.reset();
  }

  reset() {
    this.presses = [];
    this.downAt = null;
    this.lastUp = null;
  }

  get pressed() { return this.downAt !== null; }

  /** Dots and dashes as they stand right now, for live display. */
  get live() { return this.classify().join(""); }

  down(t) {
    if (this.downAt === null) this.downAt = t;
  }

  up(t) {
    if (this.downAt === null) return;
    this.presses.push(t - this.downAt);
    this.downAt = null;
    this.lastUp = t;
  }

  classify() {
    const p = this.presses;
    if (!p.length) return [];
    const lo = Math.min(...p), hi = Math.max(...p);
    const split = hi / lo >= 1.8 ? Math.sqrt(lo * hi) : this.dit * 2;
    return p.map(d => (d < split ? "." : "-"));
  }

  /** Silence that ends a letter. Deliberately roomy for hands still learning. */
  get gapLimit() { return Math.max(this.dit * 4, 450); }

  /** Returns { code, ch } once the operator has gone quiet, otherwise null. */
  poll(t) {
    if (this.downAt !== null || this.lastUp === null || t - this.lastUp < this.gapLimit) return null;
    const syms = this.classify();
    syms.forEach((s, i) => {
      const est = s === "." ? this.presses[i] : this.presses[i] / 3;
      this.dit = clamp(this.dit * 0.75 + est * 0.25, 50, 260);
    });
    const code = syms.join("");
    this.presses = [];
    this.lastUp = null;
    return { code, ch: decode(code) };
  }
}

/** Running 0..1 skill score. A replayed answer pulls toward the middle, not the top. */
export function nudge(m, result) {
  return clamp(m + (result - m) * 0.2, 0, 1);
}

const mastery = (stats, ch, field) => stats[ch]?.[field] ?? 0;

/** Weighted pick that favors weak characters and refuses a third in a row. */
export function pickChar(chars, stats, rng, recent = [], field = "rx") {
  const barred = recent.length >= 2 && recent[0] === recent[1] ? recent[0] : null;
  const pool = chars.length > 1 && barred ? chars.filter(c => c !== barred) : chars;
  const weights = pool.map(c => (1.15 - mastery(stats, c, field)) ** 2 * 4 + 0.3);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** How many characters a ship sends, growing as the codebook does. */
export function groupLength(known, rng) {
  const r = rng();
  if (known < 5) return 1;
  if (known < 10) return r < 0.35 ? 2 : 1;
  if (known < 18) return r < 0.3 ? 3 : r < 0.6 ? 2 : 1;
  return r < 0.25 ? 4 : r < 0.5 ? 3 : r < 0.75 ? 2 : 1;
}

/** Milliseconds allowed after the signal ends. Well-known letters get less. */
export function allowance(avgMastery, len, seas) {
  if (seas === "calm") return Infinity;
  const base = lerp(5200, 2600, avgMastery) + (len - 1) * 900;
  return seas === "heavy" ? base * 0.65 : base;
}

/** Accuracy over copied ships: clean counts 1, a replayed copy counts half. */
export function accuracy({ clean, assisted, total }) {
  return total ? (clean + assisted * 0.5) / total : 0;
}

export const PASS_MARK = 0.9;
