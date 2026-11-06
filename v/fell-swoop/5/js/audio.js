// Every sound is synthesised with Web Audio: no files.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.sfxVol = 1; this.musicVol = 0.5; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.bus = ctx.createGain(); this.bus.gain.value = this.sfxVol; this.bus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol; this.musicBus.connect(this.master);

    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Swing whoosh: a looping noise bed whose band and level follow the axe head speed.
    const wn = this.loopNoise();
    this.whooshF = ctx.createBiquadFilter(); this.whooshF.type = 'bandpass'; this.whooshF.Q.value = 1.6; this.whooshF.frequency.value = 400;
    this.whooshG = ctx.createGain(); this.whooshG.gain.value = 0;
    wn.connect(this.whooshF); this.whooshF.connect(this.whooshG); this.whooshG.connect(this.bus);

    // Wind in the pines, very low.
    const an = this.loopNoise();
    const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 380;
    const ag = ctx.createGain(); ag.gain.value = 0.045;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(ag.gain); lfo.start();
    an.connect(af); af.connect(ag); ag.connect(this.bus);
    this.nextBird = ctx.currentTime + 3;
  }

  loopNoise() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.9; s.start(); return s;
  }

  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.8; return this.muted; }
  setSfxVolume(v) { this.sfxVol = v; if (this.bus) this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setMusicVolume(v) { this.musicVol = v; if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  // Music -----------------------------------------------------------------
  // Lo-fi in the pines: a slow swung beat, warm electric-piano chords, a round bass, a breathy
  // flute now and then and record crackle, all generated, all a little wobbly and out of tune.
  startMusic() {
    const c = this.ctx; if (!c || this.music) return;
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400; tone.Q.value = 0.4;
    tone.connect(this.musicBus);
    const wow = c.createOscillator(); wow.frequency.value = 0.45;
    this.wow = c.createGain(); this.wow.gain.value = 8; wow.connect(this.wow); wow.start();
    // Hats skip the warm filter (through it they turn to hiss) and go straight to the bus, quietly.
    const air = c.createGain(); air.gain.value = 0.7; air.connect(this.musicBus);
    this.music = { out: tone, air, next: c.currentTime + 0.2, step: 0, phrase: null };
    this.musicTimer = setInterval(() => this.scheduleMusic(), 80);
  }
  scheduleMusic() {
    const c = this.ctx, M = this.music; if (!c || !M || c.state !== 'running') return;
    const s16 = 60 / 72 / 4;
    if (M.next < c.currentTime) M.next = c.currentTime + 0.05;   // after a stall, don't play catch-up
    while (M.next < c.currentTime + 0.35) {
      const st = M.step % 16, bar = Math.floor(M.step / 16);
      this.musicStep(M.next + (st % 2 ? s16 * 0.3 : 0), st, bar, s16);
      M.next += s16; M.step++;
    }
  }
  musicStep(t, st, bar, s16) {
    // Dm9 G13 Cmaj9 Am9 | Fmaj9 Em7 Dm9 G13, voiced without the root, root in the bass.
    const PROG = [[[53, 57, 60, 64], 38], [[53, 57, 59, 64], 43], [[52, 55, 59, 62], 36], [[55, 59, 60, 64], 45],
      [[57, 60, 64, 67], 41], [[55, 59, 62, 64], 40], [[53, 57, 60, 64], 38], [[53, 57, 59, 64], 43]];
    const [chord, root] = PROG[bar % 8], R = Math.random, barLen = s16 * 16;
    if (st === 0) chord.forEach((n, i) => this.keys(t + i * 0.014 + R() * 0.01, n, 0.05 + R() * 0.015, barLen * 0.95));
    if (st === 10 && R() < 0.4) chord.forEach((n, i) => this.keys(t + i * 0.01, n, 0.025, barLen * 0.35));
    if (st === 0) this.bass(t, root, s16 * 7);
    if (st === 7 && R() < 0.6) this.bass(t, root + (R() < 0.5 ? 7 : 12), s16 * 3);
    if (st === 12 && R() < 0.35) this.bass(t, root + 7, s16 * 3);
    if (st === 0 || (st === 7 && R() < 0.7) || (st === 10 && R() < 0.35)) this.kick(t);
    if (st === 4 || st === 12) this.snare(t);
    if (st % 2 === 0) this.hat(t, st % 4 === 2 ? 0.7 : 0.4 + R() * 0.2);
    else if (R() < 0.15) this.hat(t, 0.2);
    // Now and then a few breathy flute notes on the A minor pentatonic.
    if (st === 0) this.music.phrase = R() < 0.45 ? Array.from({ length: 2 + Math.floor(R() * 3) }, () => [Math.floor(R() * 8) * 2, [69, 72, 74, 76, 79, 81][Math.floor(R() * 6)]]) : null;
    for (const [at, n] of this.music.phrase || []) if (at === st) this.flute(t, n, s16 * (2 + R() * 3));
  }
  osc(type, midi, t, dur) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    o.detune.value = (Math.random() - 0.5) * 10; this.wow.connect(o.detune);
    o.start(t); o.stop(t + dur + 0.1); return o;
  }
  keys(t, n, v, dur) {
    const c = this.ctx, g = c.createGain(), g2 = c.createGain(); g2.gain.value = 0.16;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(v * 0.3, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.osc('sine', n, t, dur).connect(g); this.osc('triangle', n + 12, t, dur).connect(g2); g2.connect(g);
    g.connect(this.music.out);
  }
  bass(t, n, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.osc('sine', n, t, dur).connect(g); g.connect(this.music.out);
  }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.music.out); o.start(t); o.stop(t + 0.35);
  }
  hit(t, type, f, q, peak, dec, out = this.music.out) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dec + 0.05);
  }
  snare(t) {
    this.hit(t, 'bandpass', 1700, 0.7, 0.15, 0.16);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.value = 185;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(this.music.out); o.start(t); o.stop(t + 0.1);
  }
  hat(t, v) { this.hit(t, 'bandpass', 8500, 1.2, 0.03 * v, 0.03 + v * 0.015, this.music.air); }
  flute(t, n, dur) {
    const c = this.ctx, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.09);
    g.gain.setValueAtTime(0.05, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const o = this.osc('sine', n, t, dur);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5; vg.gain.value = 9;
    vib.connect(vg); vg.connect(o.detune); vib.start(t); vib.stop(t + dur + 0.1);
    o.connect(g); g.connect(this.music.out);
    this.hit(t, 'bandpass', 440 * 2 ** ((n - 69) / 12) * 2, 3, 0.012, dur * 0.8);
  }

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
    s.connect(fl); fl.connect(g); g.connect(this.bus);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dec + 0.05);
  }
  tone({ type = 'sine', f = 200, f2 = null, peak = 0.4, a = 0.002, dec = 0.15, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + dec);
    const g = c.createGain(); this.env(g, t, a, peak, dec);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + a + dec + 0.05);
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
    o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
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
