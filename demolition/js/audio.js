// Everything is synthesised: there are no audio files. The horn uses the NFPA 72 temporal-three
// pattern (0.5 s on/off x3, 1.5 s rest) that real fire alarms use.
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.hum = null; this.hornOn = false; this.beepOn = false; this.crackles = new Map(); }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0.7; this.master.connect(C.destination);
    this.noiseBuf = this._noise(2.0);
    // hall hum: fans (filtered noise) + 120 Hz transformer buzz
    const g = C.createGain(); g.gain.value = 0.0; g.connect(this.master);
    const n = C.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
    n.connect(lp); lp.connect(g); n.start();
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
    const og = C.createGain(); og.gain.value = 0.035; const olp = C.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 300;
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
    this.hum.g.gain.setTargetAtTime(0.05 + 0.35 * fans + 0.18 * crac, t, 0.5);
    this.hum.lp.frequency.setTargetAtTime(500 + 900 * fans, t, 0.5);
    this.hum.og.gain.setTargetAtTime(0.035 * (fans > 0 ? 1 : 0), t, 0.2);
  }
  _burst({ dur = 0.1, type = 'bandpass', freq = 1500, q = 2, gain = 0.5, decay = 0.08, delay = 0, freqEnd = null }) {
    if (!this.ctx) return;
    const C = this.ctx, t0 = C.currentTime + delay;
    const s = C.createBufferSource(); s.buffer = this.noiseBuf;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = C.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur + decay);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + dur + decay + 0.05);
  }
  _tone({ freq = 440, type = 'sine', dur = 0.1, gain = 0.3, delay = 0, freqEnd = null }) {
    if (!this.ctx) return;
    const C = this.ctx, t0 = C.currentTime + delay;
    const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = C.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  swing() { this._burst({ dur: 0.18, type: 'lowpass', freq: 1200, freqEnd: 300, gain: 0.12, decay: 0.05 }); }
  clang(strength = 1) {
    this._burst({ dur: 0.05, type: 'bandpass', freq: 1800 + Math.random() * 1200, q: 6, gain: 0.6 * strength, decay: 0.25 });
    this._burst({ dur: 0.08, type: 'lowpass', freq: 250, gain: 0.5 * strength, decay: 0.12 });
    this._tone({ freq: 2200 + Math.random() * 800, dur: 0.3, gain: 0.08 * strength });
  }
  thud(strength = 1) { this._burst({ dur: 0.12, type: 'lowpass', freq: 160, gain: Math.min(1, 0.9 * strength), decay: 0.25 }); }
  glass() { for (let i = 0; i < 4; i++) this._burst({ dur: 0.05, type: 'highpass', freq: 3500 + Math.random() * 3000, gain: 0.35, decay: 0.3, delay: i * 0.04 }); }
  wood() { this._burst({ dur: 0.06, type: 'bandpass', freq: 600, q: 1.5, gain: 0.5, decay: 0.08 }); }
  click() { this._burst({ dur: 0.02, type: 'highpass', freq: 2000, gain: 0.25, decay: 0.02 }); }
  breaker() { this._burst({ dur: 0.03, type: 'bandpass', freq: 900, q: 3, gain: 0.7, decay: 0.15 }); this._tone({ freq: 90, dur: 0.15, gain: 0.3, type: 'square' }); }
  arcFlash() {
    this._burst({ dur: 0.4, type: 'lowpass', freq: 4000, freqEnd: 200, gain: 1.4, decay: 0.8 });
    this._tone({ freq: 60, dur: 1.2, gain: 0.5, type: 'sawtooth' }); this._tone({ freq: 120, dur: 1.2, gain: 0.3, type: 'square' });
  }
  discharge() { this._burst({ dur: 9, type: 'lowpass', freq: 6000, freqEnd: 800, gain: 0.9, decay: 2.0 }); }
  rocket() { this._burst({ dur: 3.5, type: 'bandpass', freq: 900, freqEnd: 400, q: 0.7, gain: 0.8, decay: 0.6 }); }
  sprinkler() { this._burst({ dur: 6, type: 'highpass', freq: 2500, gain: 0.25, decay: 2.0 }); }
  chime() { this._tone({ freq: 880, dur: 0.12, gain: 0.2 }); this._tone({ freq: 1320, dur: 0.18, gain: 0.2, delay: 0.12 }); }
  /** VESDA-style alert beeps while on. */
  setBeep(on) {
    if (on === this.beepOn) return; this.beepOn = on;
    const loop = () => { if (!this.beepOn || !this.ctx) return; this._tone({ freq: 2800, dur: 0.08, gain: 0.12 }); setTimeout(loop, 1000); };
    if (on) loop();
  }
  setHorn(on) {
    if (on === this.hornOn) return; this.hornOn = on;
    const cycle = () => {
      if (!this.hornOn || !this.ctx) return;
      for (let i = 0; i < 3; i++) this._tone({ freq: 520, type: 'square', dur: 0.5, gain: 0.16, delay: i * 1.0 });
      setTimeout(cycle, 4000);  // 3 x (0.5 on + 0.5 off) + 1.5 s rest = temporal-three
    };
    if (on) cycle();
  }
  stopAll() { for (const id of [...this.crackles.keys()]) this.fireCrackle(id, false); if (this.hum) this.hum.g.gain.setTargetAtTime(0.05, this.ctx.currentTime, 1.0); }
  /** keep a crackle loop per burning thing */
  fireCrackle(id, on) {
    if (!this.ctx) return;
    if (!on) { const c = this.crackles.get(id); if (c) { c.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5); setTimeout(() => c.s.stop(), 1500); this.crackles.delete(id); } return; }
    if (this.crackles.has(id)) return;
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    const g = C.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.12, C.currentTime, 1.0);
    const lfo = C.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 9 + Math.random() * 6; const lg = C.createGain(); lg.gain.value = 0.08;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.crackles.set(id, { s, g });
  }
}
