// Zero-asset procedural Web Audio ambient soundscape (soft rain/wind + distant city hum + muffled emergency sirens)
// Muted by default until toggled by the user.

export class AmbientAudio {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.master = null;
    this.rainGain = null;
    this.cityGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  toggle() {
    if (!this.enabled) {
      this.start();
    } else {
      this.stop();
    }
    return this.enabled;
  }

  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.001;
      this.master.connect(this.ctx.destination);

      // Filtered noise buffer for soft rain / breeze / city air
      const len = this.ctx.sampleRate * 3;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.04 * white) / 1.04;
        lastOut = data[i];
      }

      // Rain / wind layer
      const rainSrc = this.ctx.createBufferSource();
      rainSrc.buffer = buf;
      rainSrc.loop = true;
      const rainFilter = this.ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 900;
      rainFilter.Q.value = 0.6;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.09;
      rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.master);
      rainSrc.start();

      // Low urban hum
      const citySrc = this.ctx.createBufferSource();
      citySrc.buffer = buf;
      citySrc.loop = true;
      const cityFilter = this.ctx.createBiquadFilter();
      cityFilter.type = 'lowpass';
      cityFilter.frequency.value = 140;
      this.cityGain = this.ctx.createGain();
      this.cityGain.gain.value = 0.16;
      citySrc.connect(cityFilter).connect(this.cityGain).connect(this.master);
      citySrc.start();

      // Faint distant muffled siren oscillator (only raised when emergency vehicle approaches)
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 540;
      const sirenFilter = this.ctx.createBiquadFilter();
      sirenFilter.type = 'lowpass';
      sirenFilter.frequency.value = 650;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(sirenFilter).connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    }

    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.35);
    this.enabled = true;
  }

  stop() {
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
    }
    this.enabled = false;
  }

  update(weather, hasEmergencyArriving, timeSec) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const rainTarget = weather === 'storm' ? 0.16 : weather === 'rain' ? 0.095 : weather === 'snow' ? 0.025 : 0.018;
    this.rainGain.gain.setTargetAtTime(rainTarget, now, 0.4);

    if (hasEmergencyArriving) {
      const wail = 520 + Math.sin(timeSec * 3.8) * 140;
      this.sirenOsc.frequency.setTargetAtTime(wail, now, 0.06);
      this.sirenGain.gain.setTargetAtTime(0.018, now, 0.3);
    } else {
      this.sirenGain.gain.setTargetAtTime(0.0, now, 0.5);
    }
  }
}
