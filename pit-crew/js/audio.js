// All sound is synthesised: Web Audio noise and oscillators, plus a tiny chiptune tracker.
let ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
let muted = false;
let fuelNode = null, crowdGain = null, rainGain = null;
let song = null, step = 0, nextT = 0, timer = null;

// Levels from the options screen; music dips during stops unless the player turned that off.
const lv = { music: 0.8, sfx: 0.9, duckOn: true, ducked: false };
const musicGain = () => 0.4 * lv.music * (lv.ducked && lv.duckOn ? 0.38 : 1);
export function setLevels({ music, sfx, duckOn }) {
  if (music != null) lv.music = music;
  if (sfx != null) lv.sfx = sfx;
  if (duckOn != null) lv.duckOn = duckOn;
  if (!ac) return;
  musicBus.gain.setTargetAtTime(musicGain(), ac.currentTime, 0.05);
  sfxBus.gain.setTargetAtTime(lv.sfx, ac.currentTime, 0.05);
}
let wanted = null; // the song a scene asked for before sound was allowed to start

export function init() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = musicGain(); musicBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = lv.sfx; sfxBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // ambience loops
  crowdGain = ac.createGain(); crowdGain.gain.value = 0;
  loopNoise('lowpass', 700, crowdGain);
  rainGain = ac.createGain(); rainGain.gain.value = 0;
  loopNoise('highpass', 2500, rainGain);
  timer = setInterval(schedule, 40);
  if (wanted) { const w = wanted; wanted = null; music(w); }
}

function loopNoise(type, f, out) {
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
  src.connect(fl); fl.connect(out); out.connect(sfxBus); src.start();
}

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.02); }
export function isMuted() { return muted; }
export function setCrowd(v) { if (crowdGain) crowdGain.gain.setTargetAtTime(v * 0.12, ac.currentTime, 0.3); }
export function setRain(v) { if (rainGain) rainGain.gain.setTargetAtTime(v * 0.1, ac.currentTime, 0.5); }
export function duck(on) { lv.ducked = !!on; if (musicBus) musicBus.gain.setTargetAtTime(musicGain(), ac.currentTime, 0.15); }
export const ready = () => !!ac && ac.state === 'running';
export const playing = () => (song ? song.name : null);

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function noise(t, dur, type, f, q, peak, out = sfxBus, f2) {
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain();
  env(g, t, 0.005, peak, dur);
  src.connect(fl); fl.connect(g); g.connect(out);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
  return g;
}

function tone(t, dur, type, f, peak, f2, out = sfxBus, a = 0.004) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain();
  env(g, t, a, peak, dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

export function sfx(name, p = 0) {
  if (!ac || muted) { if (name === 'fuel' && !p) stopFuel(); return; }
  const t = ac.currentTime;
  switch (name) {
    case 'gun': {
      // rattling impact wrench: AM'd band of noise
      const g = noise(t, 0.09, 'bandpass', 1800 + p * 1600, 3, 0.55);
      const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 70;
      const lg = ac.createGain(); lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g.gain);
      lfo.start(t); lfo.stop(t + 0.12);
      tone(t, 0.05, 'square', 420 + p * 200, 0.06);
      break;
    }
    case 'gunTight': noise(t, 0.16, 'bandpass', 3200, 4, 0.5); tone(t + 0.1, 0.06, 'square', 900, 0.08, 500); break;
    case 'jack': noise(t, 0.14, 'lowpass', 500, 1, 0.5); tone(t, 0.12, 'sine', 120, 0.4, 60); break;
    case 'drop': noise(t, 0.08, 'highpass', 2000, 1, 0.2); break;
    case 'thud': tone(t, 0.16, 'sine', 140, 0.6, 40); noise(t, 0.08, 'lowpass', 300, 1, 0.4); break;
    case 'fuel': p ? startFuel() : stopFuel(); break;
    case 'good': tone(t, 0.06, 'square', 880, 0.1); tone(t + 0.06, 0.09, 'square', 1320, 0.1); break;
    case 'perfect': [1046, 1318, 1568, 2093].forEach((f, i) => tone(t + i * 0.045, 0.08, 'square', f, 0.09)); break;
    case 'miss': tone(t, 0.2, 'square', 160, 0.12, 90); break;
    case 'buzz': tone(t, 0.12, 'sawtooth', 90, 0.12); break;
    case 'fire': noise(t, 0.6, 'lowpass', 200, 1, 0.7, sfxBus, 1800); break;
    case 'ext': noise(t, 0.12, 'highpass', 1800, 1, 0.35); break;
    case 'blow': noise(t, 0.1, 'bandpass', 1300, 2, 0.4); break;
    case 'whoosh': noise(t, 0.26, 'bandpass', 400, 2, 0.35, sfxBus, 2400); break;
    case 'release': {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.9);
      const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(140, t); o2.frequency.exponentialRampToValueAtTime(640, t + 0.9);
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1400;
      const g = ac.createGain(); env(g, t, 0.03, 0.22, 1.0);
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + 1.1); o2.stop(t + 1.1);
      break;
    }
    case 'crash': noise(t, 0.35, 'lowpass', 1600, 1, 0.8); tone(t, 0.2, 'square', 110, 0.2, 50); break;
    case 'brake': tone(t, 0.22, 'sine', 1900, 0.06, 1500); noise(t, 0.2, 'highpass', 3000, 1, 0.15); break;
    case 'clunk': tone(t, 0.07, 'square', 320, 0.12, 160); break;
    case 'mew': { const f = p || 720; tone(t, 0.16, 'triangle', f, 0.12, f * 1.4); tone(t + 0.12, 0.2, 'triangle', f * 1.35, 0.1, f * 0.75); break; }
    case 'purr': noise(t, 0.09, 'lowpass', 170, 1, 0.5); tone(t, 0.08, 'sawtooth', 46, 0.06); break;
    case 'ding': tone(t, 0.3, 'sine', 1318, 0.2); break;
    case 'tick': tone(t, 0.05, 'square', 600 + p * 700, 0.1); break;
    case 'blip': tone(t, 0.035, 'square', p || 220, 0.035); break;
    case 'light': tone(t, 0.18, 'square', 440, 0.12); break;
    case 'go': tone(t, 0.4, 'square', 880, 0.14); break;
    case 'select': tone(t, 0.05, 'square', 660, 0.08); tone(t + 0.05, 0.05, 'square', 990, 0.08); break;
    case 'move': tone(t, 0.03, 'square', 440, 0.06); break;
    case 'radio': noise(t, 0.08, 'bandpass', 2500, 2, 0.18); tone(t + 0.02, 0.05, 'square', 1500, 0.04); break;
    case 'cheer': if (crowdGain) { crowdGain.gain.setTargetAtTime(0.35, t, 0.05); crowdGain.gain.setTargetAtTime(0.1, t + 0.6, 0.6); } break;
  }
}

// An engine screaming past on the main straight, panned across the stereo field.
export function pass(dir = 1, vol = 1) {
  if (!ac || muted) return;
  const t = ac.currentTime, d = 0.55;
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(560, t + d * 0.45); o.frequency.exponentialRampToValueAtTime(300, t + d);
  const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(1040, t); o2.frequency.exponentialRampToValueAtTime(600, t + d);
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * vol, t + d * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
  o.connect(fl); o2.connect(fl); fl.connect(g);
  if (pan) { pan.pan.setValueAtTime(-0.9 * dir, t); pan.pan.linearRampToValueAtTime(0.9 * dir, t + d); g.connect(pan); pan.connect(sfxBus); } else g.connect(sfxBus);
  o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
}

function startFuel() {
  if (fuelNode) return;
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500; fl.Q.value = 6;
  const lfo = ac.createOscillator(); lfo.frequency.value = 9;
  const lg = ac.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(fl.frequency);
  const g = ac.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.4, ac.currentTime + 0.05);
  src.connect(fl); fl.connect(g); g.connect(sfxBus);
  src.start(); lfo.start();
  fuelNode = { src, lfo, g, fl };
}
function stopFuel() {
  if (!fuelNode) return;
  const { src, lfo, g } = fuelNode;
  g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.03);
  src.stop(ac.currentTime + 0.15); lfo.stop(ac.currentTime + 0.15);
  fuelNode = null;
}
export function fuelPitch(p) { if (fuelNode) fuelNode.fl.frequency.setTargetAtTime(400 + p * 700, ac.currentTime, 0.05); }

// ------------------------------------------------------------ music
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = n => { const m = n.match(/^([A-G]#?)(\d)$/); return 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12); };
const bars = s => s.trim().split(/\s+/);

const SONGS = {
  title: {
    bpm: 148,
    lead: bars(`A4 . C5 . E5 . A5 . G5 . E5 . C5 . D5 .  F5 . . . E5 . C5 . A4 . . . C5 . . .  E5 . G5 . C6 . G5 . E5 . G5 . A5 . G5 .  D5 . . . B4 . D5 . G5 . . . F5 . E5 D5
                A4 . C5 . E5 . A5 . B5 . A5 . G5 . E5 .  F5 . A5 . C6 . A5 . G5 . F5 . E5 . C5 .  E5 . . . G5 . . . C6 . . . B5 . A5 .  G5 . F5 . E5 . D5 . B4 . . . . . . .`),
    bass: bars(`A2 A3 A2 A3 A2 A3 A2 A3 A2 A3 A2 A3 A2 A3 A2 A3  F2 F3 F2 F3 F2 F3 F2 F3 F2 F3 F2 F3 F2 F3 F2 F3  C3 C4 C3 C4 C3 C4 C3 C4 C3 C4 C3 C4 C3 C4 C3 C4  G2 G3 G2 G3 G2 G3 G2 G3 G2 G3 G2 G3 G2 G3 G2 G3`),
    drums: 'k.h.s.h.k.k.s.hh',
  },
  race: {
    bpm: 132,
    lead: bars(`E4 . G4 . B4 . G4 . E5 . B4 . G4 . B4 .  C5 . G4 . E4 . G4 . C5 . E5 . D5 . C5 .  D5 . A4 . F#4 . A4 . D5 . F#5 . E5 . D5 .  B4 . F#4 . D#5 . F#5 . B5 . . . A5 . F#5 .`),
    bass: bars(`E2 . E2 E3 . E2 E2 . E2 . E2 E3 . E2 D2 D#2  C2 . C2 C3 . C2 C2 . C2 . C2 C3 . C2 C2 . D2 . D2 D3 . D2 D2 . D2 . D2 D3 . D2 D2 .  B1 . B1 B2 . B1 B1 . B1 . B1 B2 . A1 A#1 B1`),
    drums: 'k.h.s.hkk.h.s.h.',
    leadVol: 0.5,
  },
  break: {
    bpm: 92,
    lead: bars(`E5 . . G5 . . A5 . G5 . E5 . . . D5 .  C5 . . E5 . . G5 . E5 . C5 . . . A4 .  D5 . . F5 . . A5 . F5 . D5 . . . C5 .  B4 . . D5 . . G5 . . . . . . . . .`),
    bass: bars(`C3 . . . G3 . . . C3 . . . G3 . . .  A2 . . . E3 . . . A2 . . . E3 . . .  D3 . . . A3 . . . D3 . . . A3 . . .  G2 . . . D3 . . . G2 . . . D3 . . .`),
    drums: 'k.....h.s.....h.',
    leadVol: 0.45,
  },
  // a slow one for an empty office
  laurels: {
    bpm: 56,
    lead: bars(`E4 . . . G4 . . . B4 . . . A4 . . .  G4 . . . E4 . . . D4 . . . . . . .  C4 . . . E4 . . . G4 . . . F#4 . . .  E4 . . . . . . . . . . . . . . .`),
    bass: bars(`E2 . . . . . . . B2 . . . . . . .  C3 . . . . . . . G2 . . . . . . .  A2 . . . . . . . D3 . . . . . . .  E2 . . . . . . . B1 . . . . . . .`),
    drums: '................',
    leadVol: 0.3,
  },
  results: {
    bpm: 120,
    lead: bars(`C5 E5 G5 C6 . . G5 . C6 . . . . . . .  A5 . G5 . F5 . E5 . D5 . E5 . C5 . . .`),
    bass: bars(`C3 . . . C3 . . . C3 . G2 . C3 . . .  F2 . . . G2 . . . G2 . G2 . C3 . . .`),
    drums: 'k...s...k.k.s...',
  },
};

export function music(name) {
  if (!ac) { wanted = name; return; }
  if (song && song.name === name) return;
  song = name ? { name, ...SONGS[name] } : null;
  step = 0;
  nextT = ac.currentTime + 0.08;
}

function schedule() {
  if (!ac || !song || muted) { if (ac) nextT = ac.currentTime + 0.05; return; }
  const dur = 60 / song.bpm / 4;
  while (nextT < ac.currentTime + 0.2) {
    const li = step % song.lead.length, bi = step % song.bass.length;
    const L = song.lead[li], B = song.bass[bi];
    if (L !== '.') {
      let len = 1; while (song.lead[(li + len) % song.lead.length] === '.' && len < 4) len++;
      pulse(nextT, dur * len * 0.9, freq(L), 0.09 * (song.leadVol || 1), 'square');
      pulse(nextT + dur * 0.5, dur * len * 0.5, freq(L) * 1.003, 0.025 * (song.leadVol || 1), 'square'); // echo
    }
    if (B !== '.') pulse(nextT, dur * 0.9, freq(B), 0.2, 'triangle');
    const D = song.drums[step % 16];
    if (D === 'k') { tone(nextT, 0.12, 'sine', 150, 0.5, 45, musicBus); }
    if (D === 's') { noise(nextT, 0.1, 'bandpass', 1800, 0.8, 0.35, musicBus); tone(nextT, 0.06, 'triangle', 220, 0.2, 140, musicBus); }
    if (D === 'h') noise(nextT, 0.03, 'highpass', 7000, 1, 0.12, musicBus);
    nextT += dur;
    step++;
    if (song.name === 'results' && step >= song.lead.length) { song = null; break; }
  }
}

function pulse(t, dur, f, peak, type) {
  const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  g.gain.setValueAtTime(peak, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicBus);
  o.start(t); o.stop(t + dur + 0.02);
}
