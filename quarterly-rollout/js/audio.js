// Every sound is synthesised live with the Web Audio API; there are no audio files. Browsers only allow
// audio after a click or key press, so nothing plays until unlock() runs from one.

import { SONGS, JINGLES, midiToHz } from './music.js';

export class AudioSystem {
  constructor(settings = {}) {
    this.ctx = null;
    this.sound = settings.sound !== false;
    this.music = settings.music !== false;
    this.song = null;        // name of the song that should be playing
    this.timer = null;
    this.nextTime = 0;
    this.step = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.45;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x3fffffff) - 1; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.song && this.music && !this.timer) this.startScheduler();
  }

  setSound(on) { this.sound = !!on; }

  setMusic(on) {
    this.music = !!on;
    if (!on) this.stopScheduler();
    else if (this.song && this.ctx) this.startScheduler();
  }

  playSong(name) {
    if (this.song === name && this.timer) return;
    this.song = name;
    this.stopScheduler();
    if (this.music && this.ctx) this.startScheduler();
  }

  stopSong() { this.song = null; this.stopScheduler(); }

  // ---- low-level voices
  tone(type, freq, start, dur, gain, bus, endFreq) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(bus);
    o.start(start); o.stop(start + dur + 0.02);
  }

  noiseBurst(start, dur, gain, bus, filterType, freq, endFreq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = filterType;
    f.frequency.setValueAtTime(freq, start);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(start, Math.random() * 0.5); src.stop(start + dur + 0.02);
  }

  jingle(name, bus = this.sfxBus) {
    const j = JINGLES[name];
    let t = this.ctx.currentTime + 0.02;
    const beat = 60 / j.tempo;
    for (const [m, beats] of j.notes) {
      this.tone('square', midiToHz(m), t, beats * beat * 0.95, 0.07, bus);
      this.tone('triangle', midiToHz(m - 12), t, beats * beat * 0.95, 0.09, bus);
      t += beats * beat;
    }
  }

  // ---- sound effects
  play(name, opts = {}) {
    if (!this.sound || !this.ctx) return;
    const t = this.ctx.currentTime + 0.005, b = this.sfxBus;
    switch (name) {
      case 'bump': {
        const s = Math.max(0.2, Math.min(1, opts.strength || 0.5));
        this.tone('sine', 150, t, 0.16, 0.35 * s, b, 55);
        this.noiseBurst(t, 0.05, 0.12 * s, b, 'lowpass', 900);
        break;
      }
      case 'page':
        this.tone('square', 880, t, 0.07, 0.06, b);
        this.tone('square', 1318.5, t + 0.07, 0.12, 0.06, b);
        break;
      case 'coffee':
        this.tone('sine', 392, t, 0.25, 0.18, b, 784);
        break;
      case 'exitOpen': this.jingle('exitOpen'); break;
      case 'hurt':
        this.tone('sawtooth', 320, t, 0.28, 0.12, b, 80);
        this.noiseBurst(t, 0.12, 0.15, b, 'bandpass', 1200);
        break;
      case 'spin':
        this.noiseBurst(t, 0.3, 0.16, b, 'bandpass', 500, 2600);
        break;
      case 'stun':
        this.tone('square', 660, t, 0.22, 0.07, b, 200);
        break;
      case 'print':
        this.noiseBurst(t, 0.05, 0.12, b, 'highpass', 2500);
        this.tone('square', 196, t, 0.06, 0.04, b);
        break;
      case 'deflect':
        this.tone('triangle', 1400, t, 0.08, 0.12, b, 2200);
        break;
      case 'carl':
        // a calendar notification: ding-dong
        this.tone('sine', 987.8, t, 0.18, 0.16, b);
        this.tone('sine', 740, t + 0.16, 0.3, 0.16, b);
        break;
      case 'complete': this.jingle('complete'); break;
      case 'fail': this.jingle('fail'); break;
      case 'ending': this.jingle('ending'); break;
      case 'ui':
        this.tone('sine', 620, t, 0.05, 0.08, b);
        break;
      default: break;
    }
  }

  // ---- music: a look-ahead scheduler stepping through the song in eighth notes
  startScheduler() {
    if (this.timer || !this.ctx || !this.song) return;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stopScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const song = SONGS[this.song];
    if (!song || !this.ctx) return;
    const eighth = 60 / song.tempo / 2;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const bar = song.bars[Math.floor(this.step / 8) % song.bars.length];
      const i = this.step % 8;
      const t = this.nextTime + (i % 2 ? song.swing * eighth : 0);
      this.playStep(song, bar, i, t, eighth);
      this.nextTime += eighth;
      this.step += 1;
    }
  }

  playStep(song, bar, i, t, eighth) {
    const m = this.musicBus;
    const note = bar.melody[i];
    if (note != null) this.tone('square', midiToHz(note), t, eighth * 0.9, 0.05, m);
    if (i % 2 === 0) this.tone('triangle', midiToHz(bar.bass[i / 2]), t, eighth * 1.8, 0.16, m);
    if (i === 2 || i === 6) for (const c of bar.chord) this.tone('sawtooth', midiToHz(c), t, eighth * 0.7, 0.018, m);
    if (!song.drums) return;
    if (i === 0 || i === 4) this.tone('sine', 120, t, 0.14, 0.3, m, 45);
    if (i === 2 || i === 6) this.noiseBurst(t, 0.09, 0.12, m, 'bandpass', 1800);
    if (i % 2 === 1) this.noiseBurst(t, 0.03, 0.05, m, 'highpass', 7000);
  }
}
