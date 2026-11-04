// Tiny WebAudio synth: one-shot effects plus a projector clatter loop whose volume follows the player.
let ctx = null, master = null, clatter = null, murmur = null;
export let muted = false;

export function initAudio() {
  if (ctx) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  // projector: a filtered noise burst train at 24 Hz (the intermittent claw)
  clatter = loopNoise(1800, 5, 0);
  murmur = loopNoise(500, 0.7, 0);
}
function noiseBuf(secs = 1) {
  const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function loopNoise(freq, q, vol) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(2); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  const am = ctx.createGain(); am.gain.value = 1;
  src.connect(f); f.connect(am); am.connect(g); g.connect(master);
  src.start();
  return { src, f, g, am };
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }

let tick = 0;
export function updateAudio(dt, projNear, crowd) {
  if (!ctx) return;
  tick += dt;
  // 24 fps flutter on the clatter
  const flutter = 0.55 + 0.45 * Math.sign(Math.sin(tick * Math.PI * 2 * 24));
  clatter.g.gain.setTargetAtTime(projNear * 0.22 * flutter, ctx.currentTime, 0.01);
  murmur.g.gain.setTargetAtTime(Math.min(0.12, crowd * 0.012), ctx.currentTime, 0.4);
}

function tone(f, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function burst(dur, freq, vol = 0.3, delay = 0) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(dur + 0.05);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
export function sfx(name) {
  if (!ctx || muted) return;
  switch (name) {
    case 'register': tone(1320, 0.12, { type: 'square', vol: 0.12 }); tone(1760, 0.35, { type: 'square', vol: 0.1, delay: 0.08 }); burst(0.15, 3000, 0.15, 0.05); break;
    case 'tick': tone(2200, 0.04, { type: 'square', vol: 0.06 }); break;
    case 'print': for (let i = 0; i < 6; i++) burst(0.04, 2500, 0.12, i * 0.05); break;
    case 'stock': burst(0.12, 300, 0.3); break;
    case 'pickup': burst(0.08, 600, 0.25); tone(220, 0.1, { vol: 0.1 }); break;
    case 'pop': for (let i = 0; i < 8; i++) burst(0.03, 1200 + Math.random() * 800, 0.2, Math.random() * 0.6); break;
    case 'bell': tone(880, 1.2, { vol: 0.15 }); tone(1320, 1.0, { vol: 0.08, delay: 0.01 }); break;
    case 'break': burst(0.25, 900, 0.4); tone(300, 0.4, { type: 'sawtooth', vol: 0.1, slide: -200 }); break;
    case 'clack': burst(0.05, 1500, 0.4); burst(0.05, 900, 0.3, 0.06); break;
    case 'thread': for (let i = 0; i < 4; i++) burst(0.03, 2000, 0.1, i * 0.08); break;
    case 'whoosh': burst(0.25, 700, 0.12); break;
    case 'thud': burst(0.08, 180, 0.35); tone(90, 0.12, { vol: 0.15, slide: -30 }); break;
    case 'sweep': burst(0.18, 2600, 0.12); burst(0.1, 900, 0.12, 0.08); break;
    case 'bin': burst(0.2, 400, 0.3); burst(0.12, 1200, 0.15, 0.1); break;
    case 'cue': tone(1900, 0.05, { type: 'triangle', vol: 0.06 }); break;
    case 'boo': tone(180, 0.6, { type: 'sawtooth', vol: 0.06, slide: -60 }); break;
  }
}
