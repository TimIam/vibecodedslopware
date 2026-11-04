// Small synthesized sound kit: pin clicks, spring rattles, the scrape of a pick in a keyway.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(this.ctx.destination);
    // continuous scrape: filtered noise, gain driven by pick motion
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i * 0.003));
    this.noise = buf;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.scrapeF = this.ctx.createBiquadFilter();
    this.scrapeF.type = 'bandpass'; this.scrapeF.frequency.value = 3200; this.scrapeF.Q.value = 2.5;
    this.scrapeG = this.ctx.createGain(); this.scrapeG.gain.value = 0;
    src.connect(this.scrapeF).connect(this.scrapeG).connect(this.out);
    src.start();
  }
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : 0.55; }
  scrape(amount, pitch) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.scrapeG.gain.setTargetAtTime(Math.min(0.35, amount * 0.35), t, 0.03);
    this.scrapeF.frequency.setTargetAtTime(2200 + pitch * 2600, t, 0.05);
  }
  blip(freq, dur, type = 'square', vol = 0.3, bend = 0.5) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * bend), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, freq, q, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  play(type) {
    switch (type) {
      case 'set': this.blip(2400, 0.035, 'square', 0.22, 0.4); this.burst(0.03, 5200, 6, 0.5); break;
      case 'serration': this.blip(3200, 0.02, 'square', 0.1, 0.6); break;
      case 'falseset': this.blip(520, 0.12, 'triangle', 0.35, 0.5); this.burst(0.08, 1400, 3, 0.4); break;
      case 'counter': this.blip(380, 0.09, 'sine', 0.35, 1.4); break;
      case 'overset': this.blip(180, 0.16, 'sawtooth', 0.22, 0.6); break;
      case 'drop': this.burst(0.06, 2600, 8, 0.25); this.blip(900, 0.05, 'triangle', 0.06, 0.5); break;
      case 'unjam': this.blip(700, 0.06, 'triangle', 0.18, 0.6); break;
      case 'snap': this.burst(0.25, 3800, 1.5, 0.9); this.blip(1600, 0.2, 'sawtooth', 0.25, 0.2); break;
      case 'ward': this.blip(140, 0.12, 'square', 0.25, 0.7); this.burst(0.05, 900, 4, 0.3); break;
      case 'spin': this.blip(260, 0.08, 'triangle', 0.15, 0.9); break;
      case 'latch': this.blip(900, 0.05, 'square', 0.18, 0.6); break;
      case 'open':
        this.blip(220, 0.25, 'triangle', 0.35, 0.6);
        setTimeout(() => { this.blip(1800, 0.05, 'square', 0.2, 0.5); this.burst(0.18, 1800, 2, 0.5); }, 120);
        break;
      case 'bend': this.blip(90, 0.3, 'sawtooth', 0.12, 1.3); break;
      case 'tool': this.burst(0.05, 4200, 3, 0.18); break;
    }
  }
}
