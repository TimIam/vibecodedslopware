// Every sound is synthesised with Web Audio: no files.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.last = {}; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // Loops whose level the game drives each frame.
    this.loops = {
      roar: this.loop('lowpass', 260, 0.7),
      hum: this.hum(),
      swish: this.loop('bandpass', 900, 1.4),
      squelch: this.loop('lowpass', 500, 2),
      sizzle: this.loop('highpass', 3500, 0.6),
    };
    // dining room murmur, always on, low
    const m = this.loop('bandpass', 420, 0.9); m.g.gain.value = 0.05;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.21; lg.gain.value = 0.025; lfo.connect(lg); lg.connect(m.g.gain); lfo.start();
    this.nextClink = ctx.currentTime + 2;
  }
  loop(type, f, q) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.95;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start();
    return { f: fl, g };
  }
  hum() {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60; o2.type = 'sine'; o2.frequency.value = 120;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 300;
    const g = c.createGain(); g.gain.value = 0; o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.master); o.start(); o2.start();
    return { f: fl, g };
  }
  set(name, level, freq) {
    if (!this.ctx) return;
    const L = this.loops[name], t = this.ctx.currentTime;
    L.g.gain.setTargetAtTime(level, t, 0.06);
    if (freq) L.f.frequency.setTargetAtTime(freq, t, 0.06);
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.8; return this.muted; }
  gate(k, ms) { const n = performance.now(); if (this.last[k] && n - this.last[k] < ms) return false; this.last[k] = n; return true; }

  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  burst({ type = 'bandpass', f = 1000, q = 1, peak = 0.5, a = 0.002, dec = 0.1, delay = 0, f2 = null }) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + dec);
    const g = c.createGain(); this.env(g, t, a, peak, dec);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.5); s.stop(t + a + dec + 0.05);
  }
  tone({ type = 'sine', f = 200, f2 = null, peak = 0.4, a = 0.002, dec = 0.15, delay = 0 }) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + dec);
    const g = c.createGain(); this.env(g, t, a, peak, dec);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + a + dec + 0.05);
  }

  // Kitchen ---------------------------------------------------------------------------
  printer() {
    if (!this.ctx) return;
    for (let i = 0; i < 26; i++) { this.tone({ type: 'square', f: 1900 + (i % 3) * 140, peak: 0.035, dec: 0.018, delay: i * 0.045 }); if (i % 4 === 0) this.burst({ f: 3000, q: 4, peak: 0.08, dec: 0.02, delay: i * 0.045 }); }
    this.burst({ type: 'highpass', f: 2500, peak: 0.18, dec: 0.06, delay: 1.2 });
  }
  rip() { this.burst({ type: 'highpass', f: 2200, f2: 5000, peak: 0.25, a: 0.01, dec: 0.12 }); }
  clip() { this.tone({ f: 2400, peak: 0.12, dec: 0.25 }); this.tone({ f: 3700, peak: 0.06, dec: 0.18 }); this.burst({ type: 'highpass', f: 4000, peak: 0.12, dec: 0.02 }); }
  grab() { if (this.gate('grab', 60)) this.burst({ type: 'lowpass', f: 900, peak: 0.12, dec: 0.04 }); }
  coolerOpen() { this.burst({ type: 'lowpass', f: 400, f2: 1400, peak: 0.35, a: 0.01, dec: 0.25 }); this.tone({ f: 90, f2: 60, peak: 0.2, dec: 0.15 }); }
  coolerShut() { this.tone({ f: 85, f2: 45, peak: 0.55, dec: 0.18 }); this.burst({ type: 'lowpass', f: 700, peak: 0.4, dec: 0.08 }); this.burst({ type: 'highpass', f: 3000, peak: 0.08, dec: 0.05, delay: 0.03 }); }
  ovenDoor(open) {
    this.tone({ type: 'sawtooth', f: open ? 140 : 180, f2: open ? 90 : 120, peak: 0.08, a: 0.02, dec: 0.25 });
    this.burst({ f: 1600, q: 3, peak: 0.18, dec: 0.06, delay: open ? 0.2 : 0 });
    this.tone({ f: open ? 300 : 220, f2: 140, peak: 0.35, dec: 0.18, delay: open ? 0.2 : 0 });
    this.tone({ type: 'triangle', f: 1300, peak: 0.07, dec: 0.4, delay: open ? 0.2 : 0 });
  }
  clang(k = 1) { if (!this.gate('clang', 70)) return; this.tone({ type: 'triangle', f: 900 + Math.random() * 200, peak: 0.16 * k, dec: 0.35 }); this.tone({ f: 2300, peak: 0.07 * k, dec: 0.25 }); this.burst({ f: 2000, q: 2, peak: 0.2 * k, dec: 0.04 }); }
  knock(k = 1) { if (!this.gate('knock', 70)) return; this.tone({ f: 260, f2: 160, peak: 0.3 * k, dec: 0.07 }); this.burst({ type: 'lowpass', f: 1200, peak: 0.25 * k, dec: 0.04 }); }
  pound(k = 1) { this.tone({ f: 120, f2: 55, peak: 0.6 * k, dec: 0.12 }); this.burst({ type: 'lowpass', f: 600, peak: 0.5 * k, dec: 0.09 }); this.burst({ type: 'bandpass', f: 1800, q: 0.8, peak: 0.12 * k, dec: 0.05 }); }
  slap(k = 1) { if (!this.gate('slap', 80)) return; this.burst({ type: 'bandpass', f: 1200, q: 0.7, peak: 0.45 * k, dec: 0.07 }); this.tone({ f: 160, f2: 80, peak: 0.25 * k, dec: 0.08 }); }
  whoosh(k = 1) { this.burst({ type: 'bandpass', f: 500, f2: 1600, q: 1.2, peak: 0.35 * k, a: 0.08, dec: 0.3 }); }
  splat() { this.burst({ type: 'lowpass', f: 900, f2: 200, peak: 0.8, dec: 0.25 }); this.tone({ f: 90, f2: 40, peak: 0.5, dec: 0.2 }); }
  sprinkle(n = 6) { for (let i = 0; i < n; i++) this.burst({ type: 'highpass', f: 2500 + Math.random() * 3000, peak: 0.05 + Math.random() * 0.06, dec: 0.015, delay: i * 0.025 + Math.random() * 0.02 }); }
  scoop() { this.burst({ type: 'lowpass', f: 700, f2: 300, peak: 0.3, a: 0.02, dec: 0.15 }); }
  slide() { this.burst({ type: 'bandpass', f: 1500, f2: 600, q: 0.8, peak: 0.25, a: 0.01, dec: 0.25 }); }
  trash() { this.tone({ f: 110, f2: 50, peak: 0.5, dec: 0.25, delay: 0.12 }); this.burst({ type: 'lowpass', f: 500, peak: 0.4, dec: 0.15, delay: 0.12 }); this.burst({ f: 1200, peak: 0.1, dec: 0.2 }); }
  bell() {
    for (const [f, p, d] of [[2093, 0.3, 1.6], [2637, 0.15, 1.2], [4186, 0.08, 0.7], [5274, 0.05, 0.5]]) this.tone({ f, peak: p, dec: d });
    this.burst({ type: 'highpass', f: 5000, peak: 0.12, dec: 0.02 });
  }
  cash() {
    this.burst({ type: 'highpass', f: 3000, peak: 0.2, dec: 0.05 });
    for (const [f, d] of [[1568, 0.08], [2093, 0.2]]) this.tone({ type: 'triangle', f, peak: 0.18, dec: 0.4, delay: d });
  }
  beep() { this.tone({ type: 'square', f: 2800, peak: 0.05, dec: 0.09 }); }
  alarm() { for (let i = 0; i < 3; i++) this.tone({ type: 'square', f: 3200, peak: 0.07, dec: 0.08, delay: i * 0.14 }); }
  buzz() { this.tone({ type: 'sawtooth', f: 140, peak: 0.15, dec: 0.2 }); this.tone({ type: 'sawtooth', f: 147, peak: 0.12, dec: 0.2 }); }
  tear() { for (let i = 0; i < 5; i++) this.burst({ type: 'bandpass', f: 600 + Math.random() * 400, q: 2, peak: 0.25, dec: 0.04, delay: i * 0.035 }); }
  good() { [880, 1108, 1318].forEach((f, i) => this.tone({ type: 'triangle', f, peak: 0.12, dec: 0.25, delay: i * 0.07 })); }
  bad() { [330, 262].forEach((f, i) => this.tone({ type: 'triangle', f, peak: 0.15, dec: 0.3, delay: i * 0.12 })); }
  voice(pitch = 1, n = 4) {
    if (!this.ctx || !this.gate('voice', 400)) return;
    for (let i = 0; i < n; i++) this.tone({ type: 'triangle', f: (220 + Math.random() * 120) * pitch, f2: (180 + Math.random() * 80) * pitch, peak: 0.06, a: 0.01, dec: 0.08, delay: i * 0.09 });
  }
  tick() {
    if (!this.ctx || this.ctx.currentTime < this.nextClink) return;
    this.nextClink = this.ctx.currentTime + 2 + Math.random() * 6;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone({ f: 2600 + Math.random() * 2000, peak: 0.012 + Math.random() * 0.012, dec: 0.25, delay: i * 0.08 });
  }
}
