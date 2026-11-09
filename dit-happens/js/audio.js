// All sound is synthesized. The Morse tone gets one oscillator with a keyed gain,
// with short ramps so elements start and stop without clicks.

const EDGE = 0.005;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.vol = 0.6;
    this.hz = 620;
    this.signalAudible = true;
    this.seaOn = true;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    this.master.connect(ctx.destination);

    this.osc = ctx.createOscillator();
    this.osc.frequency.value = this.hz;
    this.toneGain = ctx.createGain();
    this.toneGain.gain.value = 0;
    this.osc.connect(this.toneGain).connect(this.master);
    this.osc.start();

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Sea wash, held well under the tone so it never masks a dit.
    const sea = ctx.createBufferSource();
    sea.buffer = this.noise;
    sea.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 280;
    this.seaGain = ctx.createGain();
    this.seaGain.gain.value = this.seaOn ? 1 : 0;
    const surge = ctx.createGain();
    surge.gain.value = 0.09;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.13;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.03;
    swell.connect(swellDepth).connect(surge.gain);
    sea.connect(lp).connect(surge).connect(this.seaGain).connect(this.master);
    sea.start();
    swell.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.vol;
  }

  setVolume(v) {
    this.vol = v;
    if (this.master && !this.muted) this.master.gain.value = v;
  }

  setPitch(hz) {
    this.hz = hz;
    if (this.osc) this.osc.frequency.value = hz;
  }

  setSea(on) {
    this.seaOn = on;
    if (this.seaGain) this.seaGain.gain.value = on ? 1 : 0;
  }

  /** Schedule a timeline. `force` plays it even in lamp-only mode (the codebook). */
  play(tl, force = false) {
    this.stop();
    if (!this.ctx || (!this.signalAudible && !force)) return;
    const g = this.toneGain.gain;
    const t0 = this.ctx.currentTime + 0.02;
    for (const { t, d } of tl.marks) {
      const on = t0 + t / 1000;
      const off = on + d / 1000;
      g.setValueAtTime(0, on);
      g.linearRampToValueAtTime(0.5, on + EDGE);
      g.setValueAtTime(0.5, off - EDGE);
      g.linearRampToValueAtTime(0, off);
    }
  }

  stop() {
    if (!this.ctx) return;
    const g = this.toneGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + EDGE);
  }

  /** Sidetone for the telegraph key. */
  keyTone(down) {
    if (!this.ctx) return;
    const g = this.toneGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(down ? 0.5 : 0, now + EDGE);
  }

  envelope(peak, attack, release, at) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    return g;
  }

  horn() {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const env = this.envelope(0.3, 0.04, 0.75, at);
    lp.connect(env).connect(this.master);
    for (const hz of [131, 165]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz;
      o.connect(lp);
      o.start(at);
      o.stop(at + 0.85);
    }
  }

  wreck() {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1500, at);
    lp.frequency.exponentialRampToValueAtTime(90, at + 0.8);
    src.connect(lp).connect(this.envelope(0.8, 0.01, 0.9, at)).connect(this.master);
    src.start(at);
    src.stop(at + 1);
    const thump = this.ctx.createOscillator();
    thump.frequency.setValueAtTime(90, at);
    thump.frequency.exponentialRampToValueAtTime(34, at + 0.4);
    thump.connect(this.envelope(0.8, 0.005, 0.5, at)).connect(this.master);
    thump.start(at);
    thump.stop(at + 0.6);
  }

  bell() {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    [988, 1482, 1976].forEach((hz, i) => {
      const o = this.ctx.createOscillator();
      o.frequency.value = hz;
      o.connect(this.envelope(0.18 / (i + 1), 0.004, 1.3, at)).connect(this.master);
      o.start(at);
      o.stop(at + 1.5);
    });
  }

  click() {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 1900;
    o.connect(this.envelope(0.05, 0.001, 0.03, at)).connect(this.master);
    o.start(at);
    o.stop(at + 0.05);
  }
}
