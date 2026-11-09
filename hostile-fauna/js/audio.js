// Everything you hear is synthesised here. Your side is soft and organic; the humans' side is
// tinny radio brass, because they brought their own heroic soundtrack and it plays whenever they see you.

import { S, clamp } from './state.js';

let ac = null, master = null, radio = null, radioGain = null, padGain = null, noiseBuf = null;
let combat = 0, combatTarget = 0, key = 0, step = 0, nextT = 0, timer = null;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = S.save?.opts.vol ?? 0.7;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
  master.connect(comp).connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Their music goes through a narrow band-pass so it sounds like it's coming out of forty helmet radios.
  radio = ac.createBiquadFilter(); radio.type = 'bandpass'; radio.frequency.value = 1500; radio.Q.value = 1.1;
  radioGain = ac.createGain(); radioGain.gain.value = 0;
  radio.connect(radioGain).connect(master);

  // Your world: a slow two-note pad and some wind.
  padGain = ac.createGain(); padGain.gain.value = 0.05; padGain.connect(master);
  for (const [f, det] of [[55, 0], [82.4, 4], [110, -5], [164.8, 3]]) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = det;
    const g = ac.createGain(); g.gain.value = 0.3;
    const l = ac.createOscillator(); l.frequency.value = 0.05 + Math.random() * 0.08;
    const lg = ac.createGain(); lg.gain.value = 0.25; l.connect(lg).connect(g.gain); l.start();
    o.connect(g).connect(padGain); o.start();
  }
  const wind = ac.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const wf = ac.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.6;
  const wg = ac.createGain(); wg.gain.value = 0.035;
  const wl = ac.createOscillator(); wl.frequency.value = 0.07; const wlg = ac.createGain(); wlg.gain.value = 220; wl.connect(wlg).connect(wf.frequency); wl.start();
  wind.connect(wf).connect(wg).connect(master); wind.start();

  timer = setInterval(sequence, 60);
}

export function setVolume(v) { if (master) master.gain.value = v; }
export function setCombat(v) { combatTarget = clamp(v, 0, 1); }
export function setKey(semitones) { key = semitones; }   // the hero's second wind modulates up, like every anthem

// ------------------------------------------------------------------ small voices
function tone(type, f0, f1, dur, vol, when = 0, dest = master) {
  const t = ac.currentTime + when;
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, type, f0, f1, q = 1, when = 0, dest = master) {
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loopStart = Math.random(); s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest); s.start(t); s.stop(t + dur + 0.02);
}

const SFX = {
  thorn() { tone('sine', 900 + Math.random() * 200, 240, 0.09, 0.16); noise(0.05, 0.08, 'highpass', 3000, 6000); },
  charge(p = 0) { tone('sine', 180 + p * 500, 200 + p * 560, 0.09, 0.05); },
  chorus(p = 1) { for (const m of [1, 1.5, 2, 3]) tone('sawtooth', 220 * m, 110 * m, 0.5, 0.07 * p); noise(0.35, 0.18 * p, 'bandpass', 2400, 300, 2); },
  spore() { tone('sine', 300, 90, 0.18, 0.25); },
  boom() { noise(0.6, 0.5, 'lowpass', 900, 60); tone('sine', 110, 35, 0.45, 0.4); },
  pop() { tone('sine', 300, 1800, 0.22, 0.2); tone('sine', 2400, 2400, 0.06, 0.12, 0.2); noise(0.08, 0.1, 'highpass', 4000, 8000, 1, 0.2); },
  hit() { tone('triangle', 1400, 900, 0.04, 0.1); },
  crit() { tone('triangle', 2100, 1400, 0.07, 0.14); },
  block() { tone('square', 2600, 2200, 0.06, 0.07); tone('sine', 3900, 3600, 0.12, 0.05); },
  hurt() { tone('sine', 140, 60, 0.2, 0.4); noise(0.12, 0.2, 'lowpass', 700, 200); },
  shield() { tone('sine', 700, 500, 0.1, 0.12); },
  shieldUp() { tone('sine', 400, 900, 0.3, 0.07); },
  blink() { noise(0.25, 0.25, 'bandpass', 300, 4000, 3); tone('sine', 200, 1200, 0.2, 0.1); },
  look() { tone('sawtooth', 70, 45, 0.9, 0.3); tone('sine', 140, 80, 0.9, 0.3); noise(0.7, 0.12, 'bandpass', 500, 150, 4); },
  claw() { noise(0.12, 0.25, 'bandpass', 1800, 500, 2); },
  rifle() { noise(0.06, 0.1, 'bandpass', 2600, 1200, 2); },
  shotgun() { noise(0.18, 0.25, 'lowpass', 2400, 300); },
  zap() { tone('square', 1800, 600, 0.07, 0.04); },
  rocket() { noise(0.5, 0.18, 'bandpass', 600, 1800, 1.5); },
  laserCharge() { tone('sine', 600, 2400, 1.2, 0.035); },
  laser() { tone('sawtooth', 3000, 400, 0.18, 0.12); noise(0.1, 0.12, 'highpass', 5000, 2000); },
  stomp() { tone('sine', 80, 30, 0.35, 0.5); noise(0.3, 0.3, 'lowpass', 400, 60); },
  jet() { noise(0.9, 0.22, 'bandpass', 500, 2200, 1); },
  ui() { tone('sine', 660, 880, 0.06, 0.08); },
  uiBack() { tone('sine', 520, 380, 0.07, 0.07); },
  objective() { for (let i = 0; i < 3; i++) tone('sine', [392, 523, 784][i], [392, 523, 784][i], 0.5, 0.1, i * 0.09); },
  level() { for (let i = 0; i < 5; i++) tone('triangle', [262, 330, 392, 523, 659][i], [262, 330, 392, 523, 659][i], 0.4, 0.12, i * 0.07); },
  log() { tone('square', 880, 880, 0.05, 0.05); tone('square', 1320, 1320, 0.08, 0.05, 0.07); },
  free() { for (let i = 0; i < 4; i++) tone('sine', 300 * (i + 2), 300 * (i + 2), 1.2, 0.05, i * 0.12); },
  ship() { noise(2.5, 0.2, 'lowpass', 200, 700); tone('sawtooth', 60, 90, 2.5, 0.08); },
  // A fanfare sting: what plays in their heads whenever something of theirs happens.
  sting() { [0, 4, 7, 12].forEach((n, i) => brass(57 + n, 0.16, i * 0.1, 0.5)); },
  sad() { [7, 5, 3, 0].forEach((n, i) => brass(57 + n, 0.3, i * 0.22, 0.4)); },
};

export function sfx(name, a) { if (!ac || ac.state !== 'running') return; try { SFX[name]?.(a); } catch { /* audio is never worth crashing for */ } }

// Radio gibberish for a human line: a handful of formant bleeps, pitched per speaker.
export function babble(seed = 0, len = 6, robot = false) {
  if (!ac || ac.state !== 'running') return;
  const base = robot ? 160 : 190 + (seed % 7) * 26;
  for (let i = 0; i < len; i++) {
    const f = robot ? base : base * (1 + ((seed * 7 + i * 13) % 9) / 14);
    tone(robot ? 'square' : 'sawtooth', f, f * (robot ? 1 : 0.92), 0.055, 0.05, i * 0.07, radio);
  }
}

// ------------------------------------------------------------------ the humans' theme
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
function brass(n, dur, when = 0, vol = 0.5) {
  const t = ac.currentTime + when, f = midi(n + key);
  for (const det of [-6, 6]) {
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.5, t + 0.03);
    g.gain.setValueAtTime(vol * 0.4, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(radio); o.start(t); o.stop(t + dur + 0.02);
  }
}
// 16 steps of a march in A: melody note (semitones from A3) or null, bass on the beats, snare on the offbeats.
const MEL = [12, null, 12, 12, 16, null, 19, null, 17, null, 16, 14, 12, null, 7, null, 12, null, 12, 12, 16, null, 19, null, 24, null, 23, 21, 19, null, null, null];
const BASS = [0, 0, 7, 0, 5, 5, 7, 7];
function sequence() {
  if (!ac || ac.state !== 'running') return;
  combat += (combatTarget - combat) * 0.04;
  radioGain.gain.value = combat * 0.34;
  padGain.gain.value = 0.05 * (1 - combat * 0.6);
  const sp = 0.115;
  if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
  while (nextT < ac.currentTime + 0.15) {
    if (combat > 0.03) {
      const w = nextT - ac.currentTime, m = MEL[step % MEL.length];
      if (m !== null) brass(57 + m, sp * 1.6, w, 0.5);
      if (step % 4 === 0) brass(33 + BASS[(step / 4) % BASS.length | 0], sp * 3, w, 0.6);
      if (step % 4 === 2) noise(0.07, 0.3, 'highpass', 2500, 4000, 1, w, radio);
      if (step % 16 === 14) { noise(0.05, 0.25, 'highpass', 2500, 4000, 1, w + sp * 0.5, radio); }
    }
    step++; nextT += sp;
  }
}
