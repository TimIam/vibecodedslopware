// Every sound is synthesized: no audio files. Farts get the most love.

const AC = window.AudioContext || window.webkitAudioContext;
const R = (a, b) => a + Math.random() * (b - a);

export const Snd = {
  ctx: null, out: null, noise: null, hum: null, drone: null,
  on: localStorage.getItem("ms-mute") !== "1",

  wake() {
    if (!AC) return;
    if (!this.ctx) {
      const c = this.ctx = new AC();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.out = c.createGain(); this.out.gain.value = this.on ? 0.85 : 0;
      this.out.connect(comp); comp.connect(c.destination);
      const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
      this.ambience();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  setOn(v) {
    this.on = v; localStorage.setItem("ms-mute", v ? "0" : "1");
    if (this.out) this.out.gain.setTargetAtTime(v ? 0.85 : 0, this.ctx.currentTime, 0.02);
  },
  get now() { return this.ctx ? this.ctx.currentTime + 0.005 : 0; },

  bus(vol = 1, pan = 0) {
    const c = this.ctx, g = c.createGain();
    g.gain.value = vol;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(this.out);
    } else g.connect(this.out);
    return g;
  },
  ns(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  },
  filt(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },
  env(g, t, a, peak, hold, rel) {
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  },
  tone(type, f0, f1, dur, vol, pan = 0, t = this.now) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, 0.005, 1, dur * 0.3, dur * 0.7);
    o.connect(g); g.connect(this.bus(vol, pan)); o.start(t); o.stop(t + dur + 0.05);
  },
  burst(f, type, dur, vol, pan = 0, t = this.now, q = 1) {
    if (!this.ctx) return;
    const n = this.ns(t, dur), b = this.filt(type, f, q), g = this.ctx.createGain();
    this.env(g, t, 0.004, 1, dur * 0.2, dur * 0.8);
    n.connect(b); b.connect(g); g.connect(this.bus(vol, pan));
  },

  // kind: squeak | flap | rumble | tuba | wet
  fart(kind = "flap", vol = 1, pan = 0) {
    const c = this.ctx; if (!c) return 0;
    const P = {
      squeak: [230, 400, 0.22, 0.55, 28, 48, 0.12, 1.5],
      flap: [85, 150, 0.35, 0.85, 13, 24, 0.3, -0.35],
      rumble: [42, 70, 0.8, 1.5, 7, 14, 0.25, -0.3],
      tuba: [62, 100, 1.3, 2.2, 9, 18, 0.35, -0.45],
      wet: [80, 140, 0.4, 0.9, 17, 30, 0.9, -0.2],
    }[kind] || [85, 150, 0.35, 0.85, 13, 24, 0.3, -0.35];
    const [fa0, fb0, da, db, fla, flb, wet, drift] = P;
    const t = this.now + 0.01, dur = R(da, db), f0 = R(fa0, fb0), fl = R(fla, flb);
    const out = this.bus(vol, pan);
    const lp = this.filt("lowpass", Math.min(4000, f0 * 7), 5);
    lp.connect(out);
    const amp = c.createGain(); amp.gain.value = 0; amp.connect(lp);
    const N = Math.max(48, Math.floor(dur * 240));
    const ac = new Float32Array(N), fc = new Float32Array(N);
    let wob = 0, ph = Math.random() * 6;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), tt = u * dur;
      wob += (Math.random() - 0.5) * 0.14; wob *= 0.9;
      fc[i] = Math.max(20, f0 * (1 + drift * u) * (1 + wob) * (1 + 0.08 * Math.sin(tt * fl * 3.1)));
      ph += fl * (1 + wob * 2) * (dur / N) * 6.283;
      const flutter = Math.pow(Math.max(0, Math.sin(ph)), 0.5);
      const envv = Math.min(1, u * 30) * Math.pow(1 - u, 0.5) * (u > 0.86 ? (1 - u) / 0.14 : 1);
      ac[i] = envv * (0.3 + 0.7 * flutter) * (Math.random() < 0.04 ? 0.25 : 1);
    }
    ac[0] = 0; ac[N - 1] = 0;
    amp.gain.setValueCurveAtTime(ac, t, dur);
    const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueCurveAtTime(fc, t, dur);
    const o2 = c.createOscillator(); o2.type = "square"; o2.frequency.setValueCurveAtTime(fc.map(v => v * 0.5 + 0.7), t, dur);
    const g2 = c.createGain(); g2.gain.value = 0.4;
    o.connect(amp); o2.connect(g2); g2.connect(amp);
    o.start(t); o.stop(t + dur + 0.05); o2.start(t); o2.stop(t + dur + 0.05);
    // air / wetness
    const nb = this.filt("bandpass", kind === "wet" ? 450 : 900, kind === "wet" ? 0.8 : 1.3);
    const ng = c.createGain(); ng.gain.value = 0;
    ng.gain.setValueCurveAtTime(ac.map(v => v * wet * 1.6), t, dur);
    const n = this.ns(t, dur); n.connect(nb); nb.connect(ng); ng.connect(out);
    // the little "pfft" at the end
    this.burst(1400, "bandpass", 0.12, vol * 0.25, pan, t + dur * 0.92, 0.7);
    return dur;
  },

  // stick-slip creak: a slow buzzing pulse train through a resonant board
  creak(vol = 1, pan = 0) {
    const c = this.ctx; if (!c) return;
    const t = this.now, dur = R(0.35, 0.8);
    const o = c.createOscillator(); o.type = "sawtooth";
    const N = 48, fc = new Float32Array(N), a = R(16, 34), b = R(40, 90);
    for (let i = 0; i < N; i++) { const u = i / (N - 1); fc[i] = a + (b - a) * Math.sin(u * Math.PI) * R(0.8, 1.2); }
    o.frequency.setValueCurveAtTime(fc, t, dur);
    const f = R(650, 1300);
    const bp = this.filt("bandpass", f, 10), bp2 = this.filt("bandpass", f * 2.3, 12);
    const g = c.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(5, t + 0.06);
    g.gain.setValueAtTime(5, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(bp); o.connect(bp2); bp.connect(g); bp2.connect(g); g.connect(this.bus(vol, pan));
    o.start(t); o.stop(t + dur + 0.05);
  },

  step(vol = 0.3, pan = 0) {
    this.tone("sine", 90, 42, 0.09, vol * 0.9, pan);
    this.burst(260, "lowpass", 0.06, vol * 0.7, pan);
  },
  mstep(vol = 0.4, pan = 0) { // the Portion Controller wears hard shoes
    this.burst(2600, "bandpass", 0.035, vol, pan, this.now, 2);
    this.tone("triangle", 1400, 900, 0.03, vol * 0.25, pan);
  },
  heartbeat(vol = 0.5) {
    const t = this.now;
    this.tone("sine", 62, 38, 0.12, vol, 0, t);
    this.tone("sine", 58, 36, 0.12, vol * 0.75, 0, t + 0.17);
  },
  rustle(vol = 0.4, pan = 0) {
    const t = this.now;
    for (let i = 0; i < 4; i++) this.burst(R(2000, 4200), "bandpass", 0.05, vol * R(0.5, 1), pan, t + i * R(0.04, 0.07), 1.5);
  },
  pickup() { const t = this.now; this.tone("square", 660, 880, 0.06, 0.12, 0, t); this.tone("square", 990, 1320, 0.07, 0.1, 0, t + 0.06); },
  deposit() {
    const t = this.now;
    [523, 659, 784, 1046].forEach((f, i) => this.tone("square", f, f, 0.09, 0.12, 0, t + i * 0.07));
  },
  chomp() {
    const t = this.now;
    for (let i = 0; i < 4; i++) {
      this.burst(R(900, 1800), "lowpass", 0.07, 0.5, 0, t + i * 0.13);
      this.tone("sine", 120, 60, 0.06, 0.4, 0, t + i * 0.13);
    }
    this.tone("sine", 300, 120, 0.25, 0.3, 0, t + 0.6); // gulp
  },
  fridgeOpen() {
    const t = this.now;
    this.burst(500, "lowpass", 0.25, 0.4, 0, t);
    this.burst(3000, "highpass", 0.18, 0.12, 0, t + 0.02);
    this.tone("sine", 110, 70, 0.12, 0.4, 0, t);
  },
  fridgeHum(on) {
    const c = this.ctx; if (!c) return;
    if (on && !this.hum) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.bus(1));
      g.gain.setTargetAtTime(0.07, c.currentTime, 0.1);
      const os = [58, 117, 176].map((f, i) => { const o = c.createOscillator(); o.frequency.value = f; const og = c.createGain(); og.gain.value = 1 / (i + 1); o.connect(og); og.connect(g); o.start(); return o; });
      this.hum = { g, os };
    } else if (!on && this.hum) {
      const h = this.hum; this.hum = null;
      h.g.gain.setTargetAtTime(0, c.currentTime, 0.08);
      h.os.forEach(o => o.stop(c.currentTime + 0.5));
      this.tone("sine", 90, 50, 0.1, 0.35);
    }
  },
  scream() {
    const c = this.ctx; if (!c) return;
    const t = this.now, dur = 1.5, out = this.bus(1.3);
    const ws = c.createWaveShaper(), k = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; k[i] = Math.tanh(x * 5); }
    ws.curve = k; ws.connect(out);
    for (let i = 0; i < 6; i++) {
      const o = c.createOscillator(); o.type = i % 2 ? "sawtooth" : "square";
      const base = 360 + i * 41;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 3.1, t + 0.16);
      o.frequency.exponentialRampToValueAtTime(base * 2.0, t + dur);
      const lfo = c.createOscillator(); lfo.frequency.value = 8 + i * 1.9;
      const lg = c.createGain(); lg.gain.value = base * 0.18; lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur);
      const g = c.createGain(); g.gain.value = 0;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(ws); o.start(t); o.stop(t + dur + 0.05);
    }
    this.burst(1800, "highpass", 0.7, 0.8, 0, t);
    this.tone("sine", 70, 28, 0.9, 1.0, 0, t);
  },
  sting() {
    const t = this.now;
    this.tone("sawtooth", 1100, 1600, 0.45, 0.22, 0, t);
    this.tone("sawtooth", 1165, 1720, 0.45, 0.22, 0, t);
    this.tone("sine", 80, 35, 0.6, 0.8, 0, t);
    this.burst(2500, "highpass", 0.3, 0.3, 0, t);
  },
  spotted() {
    const t = this.now;
    this.tone("sawtooth", 520, 980, 0.5, 0.2, 0, t);
    this.tone("sawtooth", 555, 1040, 0.5, 0.18, 0, t);
    this.tone("sine", 70, 40, 0.5, 0.6, 0, t);
  },
  yelp(delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = this.now + delay, o = c.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(950, t + 0.08); o.frequency.exponentialRampToValueAtTime(520, t + 0.35);
    const bp = this.filt("bandpass", 1100, 1.5), g = c.createGain();
    this.env(g, t, 0.01, 1.2, 0.18, 0.15);
    o.connect(bp); bp.connect(g); g.connect(this.bus(0.9)); o.start(t); o.stop(t + 0.45);
  },
  ban() {
    const t = this.now;
    this.tone("sine", 190, 60, 0.18, 0.8, 0, t);
    this.burst(1800, "bandpass", 0.04, 0.6, 0, t, 2);
    this.tone("sine", 170, 55, 0.14, 0.5, 0, t + 0.16);
    this.burst(1600, "bandpass", 0.03, 0.4, 0, t + 0.16, 2);
  },
  gag(vol = 0.6, pan = 0) {
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      this.burst(R(700, 1100), "bandpass", 0.13, vol, pan, t + i * 0.24, 2);
      this.tone("sawtooth", 160, 90, 0.1, vol * 0.3, pan, t + i * 0.24);
    }
  },
  chasePulse() { this.tone("sawtooth", 55, 50, 0.13, 0.22); this.burst(150, "lowpass", 0.1, 0.4); },
  blip(f = 600, vol = 0.08) { this.tone("square", f, f, 0.05, vol); },
  ambience() {
    const c = this.ctx, g = c.createGain(); g.gain.value = 0.05; g.connect(this.bus(1));
    const lp = this.filt("lowpass", 220, 1); lp.connect(g);
    [49, 49.7, 73.4].forEach(f => { const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = f; o.connect(lp); o.start(); });
    this.drone = g;
  },
  dread(v) { if (this.drone) this.drone.gain.setTargetAtTime(0.04 + v * 0.12, this.ctx.currentTime, 0.4); },
};
