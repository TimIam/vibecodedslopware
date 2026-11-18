// Every sound is synthesised: no audio files. Plus selectable music, wind, and an
// announcer that uses the browser's speech synthesis to be unhelpful out loud.
let ctx = null, master = null, sfx = null, music = null, whooshGain = null, windGain = null, noiseBuf = null;
let muted = false, musicOn = true, voiceOn = true;
// Volume sliders in the escape menu, each 0 to 1: everything, effects, music, the announcer, voice chat.
const vol = { master: 1, sfx: 1, music: 1, announcer: 1, chat: 1 };
try { const sv = JSON.parse(localStorage.getItem('pftc-vol') || '{}'); for (const k in vol) if (sv[k] >= 0 && sv[k] <= 1) vol[k] = +sv[k]; } catch (e) {}
const mus = x => (musicOn ? x * vol.music : 0);
export function getVolume(k) { return vol[k]; }
export function setVolume(k, v) {
  if (!(k in vol)) return;
  vol[k] = Math.max(0, Math.min(1, +v || 0));
  try { localStorage.setItem('pftc-vol', JSON.stringify(vol)); } catch (e) {}
  if (master) master.gain.value = muted ? 0 : 0.8 * vol.master;
  if (sfx) sfx.gain.value = vol.sfx;
  if (k === 'music') mixMusic();
}
try { muted = localStorage.getItem('pftc-muted') === '1'; musicOn = localStorage.getItem('pftc-music') !== '0'; voiceOn = localStorage.getItem('pftc-voice') !== '0'; } catch (e) {}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8 * vol.master;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  sfx = ctx.createGain(); sfx.gain.value = vol.sfx; sfx.connect(master);
  music = ctx.createGain(); music.gain.value = mus(0.16); music.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // Club whoosh: looping noise through a band-pass whose gain follows head speed.
  const wn = noise(true); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
  whooshGain = ctx.createGain(); whooshGain.gain.value = 0; wn.connect(bp); bp.connect(whooshGain); whooshGain.connect(sfx); wn.start();
  whooshGain.bp = bp;
  // Wind bed.
  const wind = noise(true); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  windGain = ctx.createGain(); windGain.gain.value = 0.05; wind.connect(lp); lp.connect(windGain); windGain.connect(sfx); wind.start();
  startMusic();
}
function noise(loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = !!loop; return s; }
function env(g, t, a, peak, dcy) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); }
function tone(type, f0, f1, dur, vol, t = ctx.currentTime, dest = sfx, a = 0.004) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, a, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + a + 0.05); return o;
}
function burst(dur, vol, freq, type = 'lowpass', t = ctx.currentTime, q = 0.8, f1, dest = sfx) {
  const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type; f.frequency.setValueAtTime(freq, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
  env(g, t, 0.003, vol, dur); n.connect(f); f.connect(g); g.connect(dest); n.start(t, Math.random()); n.stop(t + dur + 0.1);
}

// A club strike has a short ball click and a separate resonance from the head.
function strike(club, kind, v, t) {
  let body = 680, ring = 2560, decay = 0.095; // iron
  if (club === 'driver') { body = 395; ring = 3280; decay = 0.19; }
  if (club === 'wedge') { body = 890; ring = 1850; decay = 0.055; }
  const pitch = 0.97 + Math.random() * 0.06;
  const thin = kind === 'topped' || kind === 'shank';
  burst(0.018, 0.8 * v, thin ? 4000 : 3000, 'bandpass', t, 0.7);
  tone('triangle', body * pitch, body * 0.66, 0.044, (thin ? 0.14 : 0.48) * v, t);
  tone('sine', ring * pitch, ring * pitch * 0.985, thin ? 0.048 : decay, 0.27 * v, t);
  if (club === 'wedge') burst(0.075, 0.32 * v, 2150, 'bandpass', t + 0.006, 0.65, 740);
  if (kind === 'pure') tone('sine', ring * 1.5, ring * 1.49, 0.28, 0.13 * v, t + 0.008);
}

export function play(name, vol = 1, opt = {}) {
  if (!ctx || muted || !(vol > 0)) return;
  const t = ctx.currentTime, v = Math.min(1.2, vol);
  switch (name) {
    case 'hit': strike(opt.club, opt.kind, v, t); break;
    case 'putt': {
      const f = 760 + Math.random() * 55;
      tone('sine', f, f * 0.94, 0.069, 0.36 * v, t);
      tone('sine', f * 2.7, f * 2.6, 0.024, 0.15 * v, t);
      burst(0.012, 0.28 * v, 2300, 'bandpass', t);
      break;
    }
    case 'thud': tone('sine', 140, 60, 0.12, 0.45 * v, t); burst(0.06, 0.25 * v, 600, 'lowpass', t); break;
    case 'cartHorn': {
      // A small two-reed horn. Hold the notes together, then let the reeds fall out of tune.
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.018);
      g.gain.setValueAtTime(0.16 * v, t + 0.17); g.gain.linearRampToValueAtTime(0, t + 0.23);
      g.connect(sfx);
      for (const f of [370, 466]) {
        const reed = ctx.createOscillator(); reed.type = 'triangle';
        reed.frequency.setValueAtTime(f, t); reed.frequency.setValueAtTime(f, t + 0.17);
        reed.frequency.linearRampToValueAtTime(f * 0.96, t + 0.23);
        reed.connect(g); reed.start(t); reed.stop(t + 0.24);
      }
      break;
    }
    case 'cartCrash':
      burst(0.085, 0.7 * v, 1600, 'bandpass', t, 0.8, 420);
      tone('triangle', 198, 77, 0.13, 0.46 * v, t);
      tone('sine', 844, 801, 0.16, 0.2 * v, t + 0.017);
      burst(0.045, 0.27 * v, 3100, 'bandpass', t + 0.064);
      break;
    case 'cartLand':
      tone('sine', 125, 54, 0.19, 0.58 * v, t);
      burst(0.085, 0.46 * v, 800, 'lowpass', t);
      tone('triangle', 360, 270, 0.085, 0.21 * v, t + 0.068);
      break;
    case 'wood': tone('triangle', 420, 260, 0.08, 0.4 * v, t); burst(0.03, 0.3 * v, 1800, 'bandpass', t, 2); break;
    case 'turf':
      tone('sine', 235, 102, 0.055, 0.38 * v, t);
      burst(0.078, 0.46 * v, 1600, 'lowpass', t, 0.65, 360);
      break;
    case 'metal':
      burst(0.018, 0.42 * v, 3700, 'bandpass', t);
      tone('sine', 1120, 1110, 0.22, 0.30 * v, t);
      tone('sine', 2735, 2710, 0.10, 0.16 * v, t);
      break;
    case 'sand':
      burst(0.048, 0.53 * v, 760, 'lowpass', t);
      burst(0.16, 0.46 * v, 3600, 'bandpass', t + 0.012, 0.7, 930);
      for (let i = 0; i < 5; i++) burst(0.012, 0.17 * v, 2100 + Math.random() * 2300, 'bandpass', t + 0.045 + i * 0.021 + Math.random() * 0.012);
      break;
    case 'divot': burst(0.18, 0.45 * v, 700, 'lowpass', t, 0.7, 200); tone('sine', 110, 50, 0.15, 0.3 * v, t); break;
    case 'splash': burst(0.7, 0.6 * v, 3000, 'lowpass', t, 0.5, 300); burst(0.3, 0.3 * v, 6000, 'highpass', t + 0.05); tone('sine', 300, 90, 0.25, 0.2 * v, t); break;
    case 'boing': { const o = tone('sine', 180, 520, 0.35, 0.45 * v, t); tone('triangle', 90, 260, 0.3, 0.2 * v, t); break; }
    case 'bumper': tone('square', 880, 880, 0.12, 0.12 * v, t); tone('square', 1320, 1320, 0.18, 0.1 * v, t + 0.05); tone('sine', 220, 110, 0.15, 0.3 * v, t); break;
    case 'peg': tone('sine', 1600 + Math.random() * 600, 1400, 0.07, 0.2 * v, t); break;
    case 'pin': tone('triangle', 1900, 1700, 0.35, 0.25 * v, t); tone('sine', 3200, 3000, 0.25, 0.12 * v, t); break;
    case 'honk': for (let i = 0; i < 2; i++) { const o = tone('sawtooth', 430, 360, 0.16, 0.18 * v, t + i * 0.2); const f = ctx.createBiquadFilter(); } burst(0.3, 0.1 * v, 900, 'bandpass', t, 3); break;
    case 'cannon': burst(1.2, 0.9 * v, 800, 'lowpass', t, 0.5, 60); tone('sine', 110, 30, 0.6, 0.8 * v, t); break;
    case 'fuse': burst(0.9, 0.2 * v, 5000, 'highpass', t, 0.5); break;
    case 'cup': {
      // Rim, opposite wall, then a tightening rattle against the liner.
      const pitch = 0.97 + Math.random() * 0.06;
      for (const [delay, freq, level] of [[0, 1280, 0.32], [0.082, 740, 0.43], [0.139, 920, 0.25], [0.176, 680, 0.18], [0.202, 710, 0.10]]) {
        tone('triangle', freq * pitch, freq * pitch * 0.93, 0.042, level * v, t + delay);
        burst(0.016, level * v, 2100, 'bandpass', t + delay);
      }
      tone('sine', 390, 295, 0.17, 0.35 * v, t + 0.078);
      break;
    }
    case 'whistle': tone('sine', 1500, 260, 1.4, 0.12 * v, t, sfx, 0.05); break;
    case 'womp': { const n = [392, 370, 349, 294]; n.forEach((f, i) => { const d = i === 3 ? 0.9 : 0.32; const o = tone('sawtooth', f, i === 3 ? f * 0.96 : f, d, 0.09 * v, t + i * 0.36, sfx, 0.03); }); break; }
    case 'cheer': burst(1.8, 0.35 * v, 1800, 'bandpass', t, 0.4); for (let i = 0; i < 18; i++) burst(0.03, 0.15 * v, 2500, 'highpass', t + 0.1 + Math.random() * 1.4); break;
    case 'ooh': { const o = ctx.createOscillator(); burst(1.2, 0.25 * v, 500, 'bandpass', t, 4, 380); break; }
    case 'poof': burst(0.25, 0.3 * v, 1500, 'lowpass', t, 0.5, 300); break;
    case 'pop': tone('sine', 600, 1400, 0.08, 0.3 * v, t); break;
    case 'firework': burst(0.4, 0.5 * v, 900, 'lowpass', t, 0.5, 100); for (let i = 0; i < 10; i++) burst(0.02, 0.12 * v, 5000, 'highpass', t + 0.15 + Math.random() * 0.6); break;
    case 'rustle': burst(0.2, 0.3 * v, 5200, 'highpass', t, 0.5, 2600); burst(0.12, 0.2 * v, 3000, 'bandpass', t + 0.05, 1); break;
    case 'rock': tone('triangle', 950, 320, 0.05, 0.3 * v, t); burst(0.05, 0.5 * v, 2600, 'bandpass', t, 1.5); tone('sine', 170, 80, 0.1, 0.35 * v, t); break;
    case 'crumble': burst(0.6, 0.6 * v, 520, 'lowpass', t, 0.6, 120); for (let i = 0; i < 9; i++) burst(0.03, 0.22 * v, 1700, 'bandpass', t + Math.random() * 0.45, 2); tone('sine', 90, 40, 0.3, 0.5 * v, t); break;
    case 'click': tone('sine', 1200, 1200, 0.03, 0.15 * v, t); break;
    case 'chat': tone('sine', 660, 990, 0.08, 0.15 * v, t); break;
    case 'rage': tone('sawtooth', 120, 90, 0.5, 0.12 * v, t); burst(0.5, 0.2 * v, 400, 'bandpass', t, 2); break;
    case 'lip': tone('triangle', 1200, 900, 0.06, 0.25 * v, t); tone('triangle', 1000, 800, 0.06, 0.2 * v, t + 0.09); break;
    case 'beep': tone('square', 494, 494, 0.16, 0.08 * v, t); tone('square', 392, 392, 0.2, 0.08 * v, t + 0.15); break;
    case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, i === 3 ? 0.6 : 0.14, 0.07, t + i * 0.13)); break;
  }
}
export function whoosh(speed) {
  if (!ctx || !whooshGain) return;
  const v = Math.max(0, Math.min(1, (speed - 2) / 18));
  whooshGain.gain.setTargetAtTime(muted ? 0 : v * v * 0.55, ctx.currentTime, 0.02);
  whooshGain.bp.frequency.setTargetAtTime(500 + v * 1600, ctx.currentTime, 0.03);
}
// Slow motion: a deep "time bends" whoosh going in, a low drone with a heartbeat while it lasts,
// music and wind ducked, then a rising whoosh back to normal speed.
let slowNodes = null, slowBeat = 0;
export function slowmo(on) {
  if (!ctx || (on && muted)) return;
  const t = ctx.currentTime;
  if (on) {
    burst(0.7, 0.45, 2400, 'bandpass', t, 0.9, 180);
    tone('sine', 520, 70, 0.75, 0.32, t, sfx, 0.02);
    tone('triangle', 260, 45, 0.9, 0.14, t + 0.05, sfx, 0.03);
    if (!slowNodes) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.4);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sine'; o2.type = 'sine';
      o1.frequency.value = 55; o2.frequency.value = 55.7;
      const n = noise(true), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      o1.connect(g); o2.connect(g); n.connect(lp); lp.connect(ng); ng.connect(g); g.connect(sfx);
      o1.start(); o2.start(); n.start();
      slowNodes = { g, stop: [o1, o2, n] };
      const beat = () => { const tt = ctx.currentTime; tone('sine', 70, 40, 0.14, 0.4, tt); tone('sine', 66, 38, 0.16, 0.3, tt + 0.22); };
      beat(); slowBeat = setInterval(beat, 900);
    }
    mixMusic(0.15);
    if (windGain) windGain.gain.setTargetAtTime(0.01, t, 0.15);
  } else {
    burst(0.45, 0.3, 200, 'bandpass', t, 0.9, 2600);
    tone('sine', 90, 480, 0.35, 0.18, t, sfx, 0.02);
    if (slowNodes) {
      const { g, stop } = slowNodes; slowNodes = null;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      stop.forEach(o => o.stop(t + 0.35));
    }
    clearInterval(slowBeat);
    mixMusic(0.3);
  }
}
// Motor and gear whine follow wheel speed. Tire noise needs ground contact.
let eng = null;
export function engine(cart, input) {
  if (!ctx || (!cart && !eng)) return;
  if (!eng) {
    const motor = ctx.createOscillator(), gear = ctx.createOscillator(), tires = noise(true);
    const motorGain = ctx.createGain(), gearGain = ctx.createGain(), tireGain = ctx.createGain();
    for (const g of [motorGain, gearGain, tireGain]) { g.gain.value = 0; g.connect(sfx); }
    motor.type = 'triangle'; motor.connect(motorGain); gear.connect(gearGain);
    const tread = ctx.createBiquadFilter(); tread.type = 'bandpass'; tread.Q.value = 0.65;
    tires.connect(tread); tread.connect(tireGain);
    motor.start(); gear.start(); tires.start();
    eng = { motor, gear, tread, motorGain, gearGain, tireGain, active: false, reverseAt: 0 };
  }
  const t = ctx.currentTime;
  if (!cart) {
    if (eng.active) for (const g of [eng.motorGain, eng.gearGain, eng.tireGain]) g.gain.setTargetAtTime(0, t, 0.035);
    eng.active = false;
    return;
  }
  eng.active = true;
  const speed = Math.min(1, Math.abs(cart.speed) / 14);
  const load = input.brake ? 0 : Math.abs(input.throttle);
  const rpm = 54 + speed * 165 + load * 14;
  eng.motor.frequency.setTargetAtTime(rpm, t, 0.09);
  eng.gear.frequency.setTargetAtTime(rpm * 3.03, t, 0.11);
  eng.motorGain.gain.setTargetAtTime(0.012 + 0.045 * speed + 0.038 * load, t, 0.07);
  eng.gearGain.gain.setTargetAtTime((0.012 + 0.035 * load) * speed, t, 0.08);
  const scrub = input.brake ? 1 : Math.abs(input.steer) * speed;
  const hard = ['metal', 'stone', 'rock', 'wood'].includes(cart.surf);
  eng.tread.frequency.setTargetAtTime((hard ? 880 : 420) + speed * 500 + scrub * 1250, t, 0.07);
  eng.tireGain.gain.setTargetAtTime(cart.grounded ? speed * (0.14 + scrub * 0.32) : 0, t, 0.045);
  if (cart.speed < -0.6 && t >= eng.reverseAt) {
    tone('sine', 790, 790, 0.14, 0.075, t, sfx, 0.012);
    eng.reverseAt = t + 0.82;
  }
}
export function wind(strength) {
  if (!ctx || !windGain) return;
  windGain.gain.setTargetAtTime(muted ? 0 : 0.035 + Math.min(1, strength) * 0.12, ctx.currentTime, 0.4);
}

export const tracks = [
  { id: 'clubhouse', title: 'Clubhouse Stroll', bpm: 104, play: clubhouse },
  { id: 'switchback', title: 'Switchback Rally', bpm: 124, play: switchback },
  { id: 'moon', title: 'Moon over Mount Bogey', bpm: 76, play: moon },
];
let track = tracks[0], musicStep = 0;
try { track = tracks.find(x => x.id === localStorage.getItem('pftc-track')) || track; } catch (e) {}
export function selectedTrack() { return musicOn ? track.id : 'off'; }
export function selectTrack(id) {
  if (id === 'off') { setMusic(false); return; }
  const choice = tracks.find(x => x.id === id);
  if (!choice) return;
  if (choice !== track) { track = choice; musicStep = 0; }
  try { localStorage.setItem('pftc-track', id); } catch (e) {}
  setMusic(true);
}
function mixMusic(time = 0.018) {
  if (music) music.gain.setTargetAtTime(mus(slowNodes ? 0.03 : 0.16), ctx.currentTime, time);
}
function pluck(f, t, level) {
  const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
  o.type = 'triangle'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(500, t + 0.3);
  env(g, t, 0.003, level, 0.35); o.connect(fl); fl.connect(g); g.connect(music); o.start(t); o.stop(t + 0.5);
}
const clubhouseChords = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
function clubhouse(bar, s, t, beat) {
  const ch = clubhouseChords[bar], bass = ch[0] / 2;
  if (s % 4 === 0) pluck(bass, t, 0.5);
  if (s === 6) pluck(bass * 1.5, t, 0.3);
  pluck(ch[[0, 1, 2, 1, 2, 1, 0, 2][s]] * 2, t, s % 2 ? 0.16 : 0.24);
  if (s % 2 && Math.random() < 0.18) pluck(ch[(s + 1) % 3] * 4, t + beat / 4, 0.08);
}
function switchback(bar, s, t) {
  const root = [110, 131, 98, 147][bar];
  if (s % 4 === 0) tone('sine', 134, 43, 0.16, 0.66, t, music);
  if (s === 2 || s === 6) burst(0.095, 0.6, 1850, 'bandpass', t, 0.7, 840, music);
  if (s % 2) burst(0.055, 0.23, 6300, 'highpass', t, 0.7, undefined, music);
  const bass = [1, 0, 1, 1.5, 0, 2, 0, 1.5][s] * root;
  if (bass) tone('triangle', bass, bass, 0.16, 0.46, t, music);
  if (s === 1 || s === 4 || s === 7) pluck(root * (s === 7 ? 5 : 4), t, 0.32);
}
function moon(bar, s, t, beat) {
  const chord = [[147, 175, 220, 262], [117, 147, 175, 220], [131, 165, 196, 247], [110, 139, 165, 196]][bar];
  if (s === 0) {
    tone('sine', chord[0] / 2, chord[0] / 2, 2.6 * beat, 0.53, t, music, 0.07);
    for (const f of chord.slice(1)) tone('triangle', f, f, 2.8 * beat, 0.16, t, music, 0.22);
  }
  if (s === 0 || s === 3 || s === 6) {
    const f = chord[(bar + s) % 4] * 2;
    tone('sine', f, f, 1.1, 0.42, t, music, 0.008);
    tone('sine', f * 2.98, f * 2.98, 0.23, 0.12, t, music);
  }
}
function startMusic() {
  let next = ctx.currentTime + 0.04;
  setInterval(() => {
    if (!musicOn || !vol.music) return;
    next = Math.max(next, ctx.currentTime);
    const beat = 60 / track.bpm;
    while (next < ctx.currentTime + 0.13) {
      track.play(Math.floor(musicStep / 8) % 4, musicStep % 8, next, beat);
      musicStep++; next += beat / 2;
    }
  }, 60);
}

export function setMuted(m) { muted = m; try { localStorage.setItem('pftc-muted', m ? '1' : '0'); } catch (e) {} if (master) master.gain.value = m ? 0 : 0.8 * vol.master; if (m && window.speechSynthesis) speechSynthesis.cancel(); }
export function isMuted() { return muted; }
export function setMusic(on) { musicOn = on; try { localStorage.setItem('pftc-music', on ? '1' : '0'); } catch (e) {} mixMusic(); }
export function musicIsOn() { return musicOn; }
export function setVoice(on) { voiceOn = on; try { localStorage.setItem('pftc-voice', on ? '1' : '0'); } catch (e) {} if (!on && window.speechSynthesis) speechSynthesis.cancel(); }
export function voiceIsOn() { return voiceOn; }

// The announcer. Picks a dry English voice if the browser has one.
let voice = null;
function pickVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  voice = vs.find(v => /en-GB/i.test(v.lang) && /male|daniel|george|arthur|ryan/i.test(v.name)) || vs.find(v => /en-GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
let lastSay = 0;
export function say(text, force) {
  if (!voiceOn || muted || !window.speechSynthesis) return;
  const now = performance.now();
  if (!force && now - lastSay < 2500) return;
  lastSay = now;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[^\w\s.,!?'’-]/g, ''));
  if (voice) u.voice = voice;
  u.rate = 1.04; u.pitch = 0.92; u.volume = 0.9 * vol.announcer * vol.master;
  speechSynthesis.speak(u);
}
