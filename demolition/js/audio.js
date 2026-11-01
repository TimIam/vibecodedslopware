// Everything is synthesised: there are no audio files. The horn uses the NFPA 72 temporal-three
// pattern (0.5 s on/off x3, 1.5 s rest) that real fire alarms use.
// Signal path: every voice -> master gain -> limiter (DynamicsCompressor) -> destination, so
// arc flash, discharge and stacked clangs cannot clip.
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.limiter = null; this.hum = null; this.hornOn = false; this.beepOn = false; this.crackles = new Map(); }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const lim = this.limiter = C.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 20; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.25;
    lim.connect(C.destination);
    this.master = C.createGain(); this.master.gain.value = 0.4; this.master.connect(lim);
    this.noiseBuf = this._noise(2.0);
    // hall hum: fans (filtered noise) + 120 Hz transformer buzz; a background presence, not a hiss
    const g = C.createGain(); g.gain.value = 0.0; g.connect(this.master);
    const n = C.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.3;
    n.connect(lp); lp.connect(g); n.start();
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
    const og = C.createGain(); og.gain.value = 0.018; const olp = C.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 240;
    o.connect(olp); olp.connect(og); og.connect(g); o.start();
    this.hum = { g, lp, og };
  }
  _noise(sec) {
    const C = this.ctx, b = C.createBuffer(1, C.sampleRate * sec, C.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  /** fans: 0..1 fraction of hall running; crac: 0..1 fraction of CRACs running. */
  setHum(fans, crac) {
    if (!this.hum) return;
    const t = this.ctx.currentTime;
    this.hum.g.gain.setTargetAtTime(0.025 + 0.17 * fans + 0.09 * crac, t, 0.5);
    this.hum.lp.frequency.setTargetAtTime(320 + 480 * fans, t, 0.5);
    this.hum.og.gain.setTargetAtTime(0.018 * (fans > 0 ? 1 : 0), t, 0.2);
  }
  _burst({ dur = 0.1, type = 'bandpass', freq = 1500, q = 2, gain = 0.5, decay = 0.08, delay = 0, freqEnd = null, attack = 0.002 }) {
    if (!this.ctx || gain <= 0) return;
    const C = this.ctx, t0 = C.currentTime + delay, len = dur + decay;
    const s = C.createBufferSource(); s.buffer = this.noiseBuf;
    // long bursts loop the buffer; short ones start at a random offset so overlapping hits differ
    s.loop = len > 1.4;
    const off = s.loop ? 0 : Math.random() * Math.max(0, this.noiseBuf.duration - len - 0.1);
    const f = C.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0, off); s.stop(t0 + len + 0.05);
  }
  _tone({ freq = 440, type = 'sine', dur = 0.1, gain = 0.3, delay = 0, freqEnd = null, attack = 0.003, lp = 0 }) {
    if (!this.ctx || gain <= 0) return;
    const C = this.ctx, t0 = C.currentTime + delay;
    const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    if (lp) { const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5; o.connect(f); f.connect(g); }
    else o.connect(g);
    g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  swing() { this._burst({ dur: 0.11, type: 'lowpass', freq: 900, freqEnd: 250, q: 0.7, gain: 0.06, decay: 0.03, attack: 0.02 }); }
  /** hammer on a steel cabinet: low thunk body, short inharmonic ring, tiny high tick. */
  clang(strength = 1) {
    const s = Math.max(0, Math.min(1.5, strength)), p = 0.92 + Math.random() * 0.16;
    this._burst({ dur: 0.04, type: 'lowpass', freq: (150 + Math.random() * 150) * p, q: 1.2, gain: 0.38 * s, decay: 0.12, attack: 0.001 });
    this._burst({ dur: 0.015, type: 'bandpass', freq: 850 * p, q: 9, gain: 0.1 * s, decay: 0.12, attack: 0.001 });
    this._tone({ freq: 410 * p, type: 'triangle', dur: 0.16, gain: 0.035 * s, attack: 0.001 });
    this._tone({ freq: 1090 * p, dur: 0.09, gain: 0.018 * s, attack: 0.001 });
    this._burst({ dur: 0.006, type: 'highpass', freq: 4500, q: 0.7, gain: 0.05 * s, decay: 0.01, attack: 0.0005 });
  }
  thud(strength = 1) { this._burst({ dur: 0.12, type: 'lowpass', freq: 150, q: 0.9, gain: Math.min(0.6, 0.5 * strength), decay: 0.22, attack: 0.004 }); }
  /** shatter: a few staggered, falling-level bursts with a moderate highpass. */
  glass() {
    let d = 0;
    for (let i = 0; i < 5; i++) {
      this._burst({ dur: 0.03 + Math.random() * 0.03, type: 'highpass', freq: 1800 + Math.random() * 1600, q: 0.8, gain: 0.13 * (1 - i * 0.15), decay: 0.12 + Math.random() * 0.12, delay: d });
      d += 0.025 + Math.random() * 0.05;
    }
    this._burst({ dur: 0.02, type: 'bandpass', freq: 900, q: 1.5, gain: 0.1, decay: 0.06 });
  }
  wood() { this._burst({ dur: 0.06, type: 'bandpass', freq: 600, q: 1.5, gain: 0.35, decay: 0.08 }); }
  click() { this._burst({ dur: 0.015, type: 'highpass', freq: 2000, gain: 0.12, decay: 0.02, attack: 0.001 }); }
  breaker() { this._burst({ dur: 0.03, type: 'bandpass', freq: 900, q: 3, gain: 0.45, decay: 0.15, attack: 0.001 }); this._tone({ freq: 90, dur: 0.15, gain: 0.2, type: 'square', lp: 600 }); }
  /** the loudest event in the game; the limiter after master catches the peak. */
  arcFlash() {
    this._burst({ dur: 0.4, type: 'lowpass', freq: 4000, freqEnd: 200, gain: 1.1, decay: 0.8, attack: 0.001 });
    this._tone({ freq: 60, dur: 1.2, gain: 0.4, type: 'sawtooth', lp: 900 }); this._tone({ freq: 120, dur: 1.2, gain: 0.22, type: 'square', lp: 900 });
  }
  discharge() { this._burst({ dur: 9, type: 'lowpass', freq: 3500, freqEnd: 600, q: 0.7, gain: 0.32, decay: 2.0, attack: 0.08 }); }
  rocket() { this._burst({ dur: 3.5, type: 'bandpass', freq: 900, freqEnd: 400, q: 0.7, gain: 0.3, decay: 0.6, attack: 0.03 }); }
  sprinkler() { this._burst({ dur: 6, type: 'highpass', freq: 2000, q: 0.5, gain: 0.13, decay: 2.0, attack: 0.15 }); }
  chime() { this._tone({ freq: 880, dur: 0.12, gain: 0.12 }); this._tone({ freq: 1320, dur: 0.18, gain: 0.12, delay: 0.12 }); }
  /** VESDA-style alert beeps while on. */
  setBeep(on) {
    if (on === this.beepOn) return; this.beepOn = on;
    const loop = () => { if (!this.beepOn || !this.ctx) return; this._tone({ freq: 2800, dur: 0.08, gain: 0.075 }); setTimeout(loop, 1000); };
    if (on) loop();
  }
  setHorn(on) {
    if (on === this.hornOn) return; this.hornOn = on;
    const cycle = () => {
      if (!this.hornOn || !this.ctx) return;
      for (let i = 0; i < 3; i++) this._tone({ freq: 520, type: 'square', dur: 0.5, gain: 0.1, delay: i * 1.0, attack: 0.006, lp: 3000 });
      setTimeout(cycle, 4000);  // 3 x (0.5 on + 0.5 off) + 1.5 s rest = temporal-three
    };
    if (on) cycle();
  }
  stopAll() { for (const id of [...this.crackles.keys()]) this.fireCrackle(id, false); if (this.hum) this.hum.g.gain.setTargetAtTime(0.025, this.ctx.currentTime, 1.0); }
  /** keep a crackle loop per burning thing */
  fireCrackle(id, on) {
    if (!this.ctx) return;
    if (!on) { const c = this.crackles.get(id); if (c) { c.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5); setTimeout(() => c.s.stop(), 1500); this.crackles.delete(id); } return; }
    if (this.crackles.has(id)) return;
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.8;
    const g = C.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.06, C.currentTime, 1.0);
    const lfo = C.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 9 + Math.random() * 6; const lg = C.createGain(); lg.gain.value = 0.04;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.crackles.set(id, { s, g });
  }
}
