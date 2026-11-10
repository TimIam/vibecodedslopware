// All sound is made on the spot with Web Audio: filtered noise, a few oscillators, and a small
// step sequencer for the organ on the title screen.
let ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null, crowdGain = null;
let muted = false, song = null, stepN = 0, nextT = 0;

export function init() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = 0.3; musicBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  crowdGain = ac.createGain(); crowdGain.gain.value = 0;
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 650; fl.Q.value = 0.6;
  src.connect(fl); fl.connect(crowdGain); crowdGain.connect(sfxBus); src.start();
  setInterval(schedule, 40);
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.02); }
export const isMuted = () => muted;
export function setCrowd(v) { if (crowdGain) crowdGain.gain.setTargetAtTime(v * 0.1, ac.currentTime, 0.4); }

function env(gn, t, a, peak, dec) {
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(peak, t + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function noise(t, dur, type, f, q, peak, f2, out = sfxBus) {
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ac.createGain(); env(gn, t, 0.004, peak, dur);
  src.connect(fl); fl.connect(gn); gn.connect(out);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(t, dur, type, f, peak, f2, out = sfxBus, a = 0.004) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ac.createGain(); env(gn, t, a, peak, dur);
  o.connect(gn); gn.connect(out);
  o.start(t); o.stop(t + dur + a + 0.05);
}
function cheer(t, len = 1.6, peak = 0.5) {
  if (!crowdGain) return;
  crowdGain.gain.cancelScheduledValues(t);
  crowdGain.gain.setTargetAtTime(peak, t, 0.06);
  crowdGain.gain.setTargetAtTime(0.1, t + len, 0.7);
}

export function sfx(name, p = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime;
  switch (name) {
    case 'pass': noise(t, 0.05, 'bandpass', 2400, 2, 0.3); tone(t, 0.04, 'square', 520, 0.05, 300); break;
    case 'pick': noise(t, 0.03, 'bandpass', 1800, 3, 0.16); break;
    case 'steal': tone(t, 0.05, 'square', 700, 0.07, 1000); noise(t, 0.04, 'bandpass', 2000, 2, 0.2); break;
    case 'shot': noise(t, 0.09, 'bandpass', 1500 + p * 120, 1.2, 0.7); tone(t, 0.08, 'square', 240 + p * 20, 0.14, 90); break;
    case 'save': tone(t, 0.12, 'sine', 180, 0.5, 70); noise(t, 0.1, 'lowpass', 700, 1, 0.45); cheer(t, 0.5, 0.28); break;
    case 'post': tone(t, 0.5, 'sine', 1760, 0.3); tone(t, 0.4, 'sine', 2637, 0.14); cheer(t, 0.5, 0.3); break;
    case 'board': tone(t, 0.09, 'sine', 130, 0.35, 60); noise(t, 0.06, 'lowpass', 400, 1, 0.3); break;
    case 'block': tone(t, 0.07, 'square', 200, 0.12, 110); break;
    case 'check': tone(t, 0.18, 'sine', 150, 0.75, 42); noise(t, 0.14, 'lowpass', 900, 1, 0.6); cheer(t, 0.4, 0.3); break;
    case 'whistle': for (const f of [2350, 2520]) { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; const l = ac.createOscillator(); l.frequency.value = 34; const lg = ac.createGain(); lg.gain.value = 60; l.connect(lg); lg.connect(o.frequency); const gn = ac.createGain(); env(gn, t, 0.01, 0.1, 0.42); o.connect(gn); gn.connect(sfxBus); o.start(t); l.start(t); o.stop(t + 0.5); l.stop(t + 0.5); } break;
    case 'drop': tone(t, 0.05, 'square', 900, 0.08, 500); noise(t, 0.04, 'bandpass', 2600, 3, 0.25); break;
    case 'early': tone(t, 0.16, 'sawtooth', 110, 0.12); break;
    case 'goal': {
      for (const f of [174.6, 220, 261.6]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1200; const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.16, t + 0.05); gn.gain.setValueAtTime(0.16, t + 1.5); gn.gain.exponentialRampToValueAtTime(0.0001, t + 1.9); o.connect(fl); fl.connect(gn); gn.connect(sfxBus); o.start(t); o.stop(t + 2); }
      cheer(t, 2.6, 0.75);
      break;
    }
    case 'horn': tone(t, 1.0, 'sawtooth', 196, 0.2, 0, sfxBus, 0.03); tone(t, 1.0, 'square', 98, 0.14, 0, sfxBus, 0.03); break;
    case 'bell': for (let i = 0; i < 3; i++) { tone(t + i * 0.16, 0.5, 'sine', 1568, 0.22); tone(t + i * 0.16, 0.4, 'sine', 2349, 0.1); } cheer(t, 1.2, 0.55); break;
    case 'fhit': tone(t, 0.1, 'sine', p ? 260 : 170, 0.6, 60); noise(t, 0.08, 'bandpass', p ? 1600 : 800, 1, 0.6); cheer(t, 0.3, 0.4); break;
    case 'fblock': noise(t, 0.05, 'bandpass', 500, 2, 0.4); tone(t, 0.05, 'square', 150, 0.08); break;
    case 'fmiss': noise(t, 0.09, 'bandpass', 900, 2, 0.14, 2400); break;
    case 'ko': tone(t, 0.4, 'sine', 120, 0.8, 35); noise(t, 0.3, 'lowpass', 500, 1, 0.6); cheer(t, 2, 0.75); break;
    case 'penalty': tone(t, 0.14, 'square', 330, 0.1); tone(t + 0.16, 0.2, 'square', 247, 0.1); break;
    case 'select': tone(t, 0.05, 'square', 660, 0.08); tone(t + 0.05, 0.05, 'square', 990, 0.08); break;
    case 'move': tone(t, 0.03, 'square', 440, 0.06); break;
    case 'switch': tone(t, 0.03, 'square', 880, 0.04); break;
    case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(t + i * 0.13, 0.16, 'square', f, 0.1)); cheer(t, 2.5, 0.6); break;
    case 'charge': [392, 523, 659, 784, 659, 784].forEach((f, i) => organ(t + [0, 0.14, 0.28, 0.42, 0.63, 0.77][i], i === 5 ? 0.5 : 0.13, f, 0.1, sfxBus)); break;
  }
}

function organ(t, dur, f, peak, out = musicBus) {
  for (const [m, v] of [[1, 1], [2, 0.5], [3, 0.25]]) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(peak * v, t + 0.012);
    gn.gain.setValueAtTime(peak * v, t + dur * 0.8); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(out); o.start(t); o.stop(t + dur + 0.03);
  }
}
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = n => { const m = n.match(/^([A-G]#?)(\d)$/); return 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12); };
const bars = s => s.trim().split(/\s+/);
const SONGS = {
  title: {
    bpm: 126,
    lead: bars(`G4 . B4 D5 . B4 G4 . A4 . C5 E5 . C5 A4 .  B4 . D5 G5 . D5 B4 . D5 . . C5 B4 . A4 .
                G4 . B4 D5 . G5 F#5 . E5 . C5 E5 . A5 G5 .  F#5 . D5 A4 . D5 F#5 . G5 . . . D5 . . .`),
    bass: bars(`G2 . D3 . G2 . D3 . A2 . E3 . A2 . E3 .  G2 . D3 . G2 . D3 . D3 . A2 . D3 . F#2 .
                G2 . D3 . G2 . B2 . C3 . G2 . C3 . E3 .  D3 . A2 . D3 . F#2 . G2 . D3 . G2 . . .`),
    drums: 'k...h...s...h.k.',
  },
};
export function music(name) {
  if (!ac) return;
  if ((song && song.name) === name) return;
  song = name ? { name, ...SONGS[name] } : null;
  stepN = 0; nextT = ac.currentTime + 0.08;
}
function schedule() {
  if (!ac || !song || muted) { if (ac) nextT = ac.currentTime + 0.05; return; }
  const dur = 60 / song.bpm / 4;
  while (nextT < ac.currentTime + 0.2) {
    const li = stepN % song.lead.length, L = song.lead[li], B = song.bass[stepN % song.bass.length];
    if (L !== '.') { let len = 1; while (song.lead[(li + len) % song.lead.length] === '.' && len < 4) len++; organ(nextT, dur * len * 0.95, freq(L), 0.1); }
    if (B !== '.') organ(nextT, dur * 1.8, freq(B), 0.14);
    const D = song.drums[stepN % 16];
    if (D === 'k') tone(nextT, 0.12, 'sine', 140, 0.45, 45, musicBus);
    if (D === 's') noise(nextT, 0.09, 'bandpass', 1800, 0.8, 0.3, 0, musicBus);
    if (D === 'h') noise(nextT, 0.03, 'highpass', 7000, 1, 0.1, 0, musicBus);
    nextT += dur; stepN++;
  }
}
