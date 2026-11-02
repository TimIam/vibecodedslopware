// Every sound is synthesised with Web Audio: no files.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.master.connect(comp); comp.connect(ctx.destination);

    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Swing whoosh: a looping noise bed whose band and level follow the axe head speed.
    const wn = this.loopNoise();
    this.whooshF = ctx.createBiquadFilter(); this.whooshF.type = 'bandpass'; this.whooshF.Q.value = 1.6; this.whooshF.frequency.value = 400;
    this.whooshG = ctx.createGain(); this.whooshG.gain.value = 0;
    wn.connect(this.whooshF); this.whooshF.connect(this.whooshG); this.whooshG.connect(this.master);

    // Wind in the pines, very low.
    const an = this.loopNoise();
    const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 380;
    const ag = ctx.createGain(); ag.gain.value = 0.045;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(ag.gain); lfo.start();
    an.connect(af); af.connect(ag); ag.connect(this.master);
    this.nextBird = ctx.currentTime + 3;
  }

  loopNoise() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.9; s.start(); return s;
  }

  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.8; return this.muted; }

  // One-shot helpers -------------------------------------------------------
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  burst({ type = 'bandpass', f = 1000, q = 1, peak = 0.5, a = 0.002, dec = 0.1, delay = 0, f2 = null }) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + dec);
    const g = c.createGain(); this.env(g, t, a, peak, dec);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dec + 0.05);
  }
  tone({ type = 'sine', f = 200, f2 = null, peak = 0.4, a = 0.002, dec = 0.15, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + dec);
    const g = c.createGain(); this.env(g, t, a, peak, dec);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + a + dec + 0.05);
  }

  // Game sounds -----------------------------------------------------------
  whoosh(speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = Math.max(0, Math.min(1, (speed - 5) / 14));
    this.whooshG.gain.setTargetAtTime(k * k * 0.5, t, 0.03);
    this.whooshF.frequency.setTargetAtTime(260 + k * 1500, t, 0.03);
  }
  chop(e, depth) {
    if (!this.ctx) return;
    const k = Math.min(1, e / 160);
    this.burst({ f: 700 + 500 * k, q: 1.1, peak: 0.35 + 0.55 * k, dec: 0.07 + 0.05 * k });
    this.burst({ type: 'highpass', f: 2600, peak: 0.25 + 0.3 * k, dec: 0.025 });
    this.tone({ type: 'triangle', f: 230 - 60 * k, f2: 95, peak: 0.45 + 0.4 * k, dec: 0.12 });
    if (depth > 0.035) this.burst({ type: 'highpass', f: 1800, peak: 0.25, dec: 0.04, delay: 0.035 });
  }
  glance(e) {
    if (!this.ctx) return;
    const k = Math.min(1, e / 120);
    this.tone({ type: 'triangle', f: 1400, f2: 900, peak: 0.12 + 0.2 * k, dec: 0.18 });
    this.burst({ f: 3200, q: 2, peak: 0.2 + 0.25 * k, dec: 0.12, f2: 1500 });
    this.tone({ f: 160, f2: 90, peak: 0.25 * k, dec: 0.08 });
  }
  flat(e) {
    if (!this.ctx) return;
    const k = Math.min(1, e / 120);
    this.tone({ f: 150, f2: 70, peak: 0.5 * (0.4 + k), dec: 0.14 });
    this.burst({ type: 'lowpass', f: 700, peak: 0.4 * (0.4 + k), dec: 0.1 });
    this.tone({ f: 640, peak: 0.08 + 0.1 * k, dec: 0.5 }); this.tone({ f: 1530, peak: 0.05 + 0.06 * k, dec: 0.35 });
  }
  handle(e) {
    if (!this.ctx) return;
    const k = Math.min(1, e / 100);
    this.tone({ type: 'square', f: 360, f2: 300, peak: 0.12 + 0.12 * k, dec: 0.06 });
    this.tone({ type: 'sawtooth', f: 85, peak: 0.05 + 0.08 * k, a: 0.01, dec: 0.32 });
    this.burst({ f: 1200, q: 3, peak: 0.25 * k, dec: 0.05 });
  }
  dirt(e) {
    if (!this.ctx) return;
    const k = Math.min(1, e / 100);
    this.burst({ type: 'lowpass', f: 900, peak: 0.3 + 0.4 * k, dec: 0.12 });
    this.tone({ f: 110, f2: 60, peak: 0.3 * k, dec: 0.1 });
  }
  yank() {
    if (!this.ctx) return;
    this.tone({ type: 'sawtooth', f: 170, f2: 80, peak: 0.12, a: 0.01, dec: 0.12 });
    this.burst({ f: 1400, q: 1.5, peak: 0.35, dec: 0.05, delay: 0.06 });
  }
  wiggle() {
    if (!this.ctx) return;
    this.tone({ type: 'sawtooth', f: 120 + Math.random() * 60, f2: 90, peak: 0.07, a: 0.01, dec: 0.08 });
  }
  creak(intensity = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = 0.7 + 0.9 * intensity;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70 + Math.random() * 25, t);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 9 + Math.random() * 7; lg.gain.value = 18;
    lfo.connect(lg); lg.connect(o.frequency);
    o.frequency.linearRampToValueAtTime(48 + Math.random() * 20, t + dur);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 2.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32 * intensity, t + 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  crack() {
    if (!this.ctx) return;
    for (let i = 0; i < 5; i++) this.burst({ type: 'highpass', f: 1500 + Math.random() * 1500, peak: 0.25 + Math.random() * 0.3, dec: 0.02 + Math.random() * 0.04, delay: i * 0.05 + Math.random() * 0.04 });
  }
  crash(dist) {
    if (!this.ctx) return;
    const k = Math.max(0.25, Math.min(1, 12 / (dist + 4)));
    this.burst({ type: 'lowpass', f: 1600, f2: 160, peak: 0.9 * k, a: 0.01, dec: 1.4 });
    this.tone({ f: 58, f2: 32, peak: 0.9 * k, a: 0.005, dec: 0.9 });
    for (let i = 0; i < 9; i++) this.burst({ type: 'highpass', f: 2000 + Math.random() * 2500, peak: 0.2 * k + Math.random() * 0.2 * k, dec: 0.03, delay: 0.05 + Math.random() * 0.6 });
  }
  thud() {
    if (!this.ctx) return;
    this.tone({ f: 70, f2: 38, peak: 0.8, dec: 0.5 });
    this.burst({ type: 'lowpass', f: 500, peak: 0.6, dec: 0.4 });
  }
  step() {
    if (!this.ctx) return;
    this.burst({ type: 'lowpass', f: 600 + Math.random() * 300, peak: 0.07, dec: 0.06 });
  }
  whoa() {
    if (!this.ctx) return;
    this.tone({ type: 'triangle', f: 210, f2: 150, peak: 0.12, a: 0.03, dec: 0.3 });
  }

  tick() {
    if (!this.ctx || this.ctx.currentTime < this.nextBird) return;
    this.nextBird = this.ctx.currentTime + 4 + Math.random() * 9;
    const base = 2600 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone({ f: base * (1 + Math.random() * 0.15), f2: base * 0.72, peak: 0.025, a: 0.01, dec: 0.07, delay: i * 0.12 });
  }
}
