// Every sound is synthesised: no audio files. Plus a little plucky music loop, wind, and an
// announcer that uses the browser's speech synthesis to be unhelpful out loud.
let ctx = null, master = null, sfx = null, music = null, whooshGain = null, windGain = null, noiseBuf = null;
let muted = false, musicOn = true, voiceOn = true;
try { muted = localStorage.getItem('pftc-muted') === '1'; musicOn = localStorage.getItem('pftc-music') !== '0'; voiceOn = localStorage.getItem('pftc-voice') !== '0'; } catch (e) {}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  sfx = ctx.createGain(); sfx.connect(master);
  music = ctx.createGain(); music.gain.value = musicOn ? 0.16 : 0; music.connect(master);
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
function burst(dur, vol, freq, type = 'lowpass', t = ctx.currentTime, q = 0.8, f1) {
  const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type; f.frequency.setValueAtTime(freq, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
  env(g, t, 0.003, vol, dur); n.connect(f); f.connect(g); g.connect(sfx); n.start(t, Math.random()); n.stop(t + dur + 0.1);
}

export function play(name, vol = 1, opt = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime, v = Math.max(0.02, Math.min(1.2, vol));
  switch (name) {
    case 'hit': { // driver/iron "tock", brighter when pure
      tone('sine', 1300 + v * 400, 500, 0.09, 0.5 * v, t);
      tone('triangle', 2600, 1800, 0.05, 0.25 * v, t);
      burst(0.04, 0.5 * v, 4000, 'highpass', t);
      if (opt.pure) { tone('sine', 2093, 2093, 0.5, 0.12, t + 0.02); tone('sine', 3136, 3136, 0.6, 0.08, t + 0.04); }
      break;
    }
    case 'putt': tone('sine', 900, 700, 0.06, 0.35 * v, t); burst(0.02, 0.2 * v, 3000, 'highpass', t); break;
    case 'thud': tone('sine', 140, 60, 0.12, 0.45 * v, t); burst(0.06, 0.25 * v, 600, 'lowpass', t); break;
    case 'wood': tone('triangle', 420, 260, 0.08, 0.4 * v, t); burst(0.03, 0.3 * v, 1800, 'bandpass', t, 2); break;
    case 'sand': burst(0.25, 0.35 * v, 2500, 'bandpass', t, 0.6, 900); break;
    case 'divot': burst(0.18, 0.45 * v, 700, 'lowpass', t, 0.7, 200); tone('sine', 110, 50, 0.15, 0.3 * v, t); break;
    case 'splash': burst(0.7, 0.6 * v, 3000, 'lowpass', t, 0.5, 300); burst(0.3, 0.3 * v, 6000, 'highpass', t + 0.05); tone('sine', 300, 90, 0.25, 0.2 * v, t); break;
    case 'boing': { const o = tone('sine', 180, 520, 0.35, 0.45 * v, t); tone('triangle', 90, 260, 0.3, 0.2 * v, t); break; }
    case 'bumper': tone('square', 880, 880, 0.12, 0.12 * v, t); tone('square', 1320, 1320, 0.18, 0.1 * v, t + 0.05); tone('sine', 220, 110, 0.15, 0.3 * v, t); break;
    case 'peg': tone('sine', 1600 + Math.random() * 600, 1400, 0.07, 0.2 * v, t); break;
    case 'pin': tone('triangle', 1900, 1700, 0.35, 0.25 * v, t); tone('sine', 3200, 3000, 0.25, 0.12 * v, t); break;
    case 'honk': for (let i = 0; i < 2; i++) { const o = tone('sawtooth', 430, 360, 0.16, 0.18 * v, t + i * 0.2); const f = ctx.createBiquadFilter(); } burst(0.3, 0.1 * v, 900, 'bandpass', t, 3); break;
    case 'cannon': burst(1.2, 0.9 * v, 800, 'lowpass', t, 0.5, 60); tone('sine', 110, 30, 0.6, 0.8 * v, t); break;
    case 'fuse': burst(0.9, 0.2 * v, 5000, 'highpass', t, 0.5); break;
    case 'cup': for (let i = 0; i < 4; i++) tone('triangle', 1400 - i * 150, 1200 - i * 150, 0.05, 0.2 * v, t + i * 0.06 + Math.random() * 0.02); tone('sine', 300, 160, 0.2, 0.35 * v, t + 0.28); break;
    case 'whistle': tone('sine', 1500, 260, 1.4, 0.12 * v, t, sfx, 0.05); break;
    case 'womp': { const n = [392, 370, 349, 294]; n.forEach((f, i) => { const d = i === 3 ? 0.9 : 0.32; const o = tone('sawtooth', f, i === 3 ? f * 0.96 : f, d, 0.09 * v, t + i * 0.36, sfx, 0.03); }); break; }
    case 'cheer': burst(1.8, 0.35 * v, 1800, 'bandpass', t, 0.4); for (let i = 0; i < 18; i++) burst(0.03, 0.15 * v, 2500, 'highpass', t + 0.1 + Math.random() * 1.4); break;
    case 'ooh': { const o = ctx.createOscillator(); burst(1.2, 0.25 * v, 500, 'bandpass', t, 4, 380); break; }
    case 'poof': burst(0.25, 0.3 * v, 1500, 'lowpass', t, 0.5, 300); break;
    case 'pop': tone('sine', 600, 1400, 0.08, 0.3 * v, t); break;
    case 'firework': burst(0.4, 0.5 * v, 900, 'lowpass', t, 0.5, 100); for (let i = 0; i < 10; i++) burst(0.02, 0.12 * v, 5000, 'highpass', t + 0.15 + Math.random() * 0.6); break;
    case 'click': tone('sine', 1200, 1200, 0.03, 0.15 * v, t); break;
    case 'chat': tone('sine', 660, 990, 0.08, 0.15 * v, t); break;
    case 'rage': tone('sawtooth', 120, 90, 0.5, 0.12 * v, t); burst(0.5, 0.2 * v, 400, 'bandpass', t, 2); break;
    case 'lip': tone('triangle', 1200, 900, 0.06, 0.25 * v, t); tone('triangle', 1000, 800, 0.06, 0.2 * v, t + 0.09); break;
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
    if (music) music.gain.setTargetAtTime(musicOn ? 0.03 : 0, t, 0.15);
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
    if (music) music.gain.setTargetAtTime(musicOn ? 0.16 : 0, t, 0.3);
  }
}
export function wind(strength) {
  if (!ctx || !windGain) return;
  windGain.gain.setTargetAtTime(muted ? 0 : 0.035 + Math.min(1, strength) * 0.12, ctx.currentTime, 0.4);
}

// A breezy little loop: ukulele-ish plucks over a walking bass, pentatonic so it never clashes.
function startMusic() {
  const bpm = 104, beat = 60 / bpm;
  const prog = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
  const bass = [131, 110, 87, 98];
  let step = 0, next = ctx.currentTime + 0.2;
  const pluck = (f, t, vol) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    env(g, t, 0.003, vol, 0.35); o.connect(fl); fl.connect(g); g.connect(music); o.start(t); o.stop(t + 0.5);
  };
  setInterval(() => {
    if (!ctx) return;
    while (next < ctx.currentTime + 0.3) {
      const bar = Math.floor(step / 8) % 4, ch = prog[bar], s = step % 8;
      if (s % 4 === 0) pluck(bass[bar], next, 0.5);
      if (s === 6) pluck(bass[bar] * 1.5, next, 0.3);
      const pat = [0, 1, 2, 1, 2, 1, 0, 2];
      pluck(ch[pat[s]] * 2, next, s % 2 ? 0.16 : 0.24);
      if (Math.random() < 0.18 && s % 2 === 1) pluck(ch[(s + 1) % 3] * 4, next + beat / 4, 0.08);
      step++; next += beat / 2;
    }
  }, 60);
}

export function setMuted(m) { muted = m; try { localStorage.setItem('pftc-muted', m ? '1' : '0'); } catch (e) {} if (master) master.gain.value = m ? 0 : 0.8; if (m && window.speechSynthesis) speechSynthesis.cancel(); }
export function isMuted() { return muted; }
export function setMusic(on) { musicOn = on; try { localStorage.setItem('pftc-music', on ? '1' : '0'); } catch (e) {} if (music) music.gain.value = on ? 0.16 : 0; }
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
  u.rate = 1.04; u.pitch = 0.92; u.volume = 0.9;
  speechSynthesis.speak(u);
}
