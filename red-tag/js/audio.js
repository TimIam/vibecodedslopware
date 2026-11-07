// Procedural sound: park ambience (crowd murmur + a far-off band organ), UI clicks, rubber stamp, paper, test-run whoosh.
let ctx = null, master = null, amb = null, on = true;
try { on = localStorage.getItem('rt_mute') !== '1'; } catch {}

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ctx.destination);
}
function noiseBuf(sec = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  return b;
}
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

export const Sfx = {
  unlock() { init(); if (ctx.state === 'suspended') ctx.resume(); if (!amb) this.ambience(); },
  get on() { return on; },
  toggle() { on = !on; try { localStorage.setItem('rt_mute', on ? '0' : '1'); } catch {} if (master) master.gain.value = on ? 0.8 : 0; return on; },
  ambience() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(4); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(bp).connect(g).connect(master); src.start();
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.02; lfo.connect(lg).connect(g.gain); lfo.start();
    amb = { g };
    // band organ waltz, quiet and far away
    const notes = [67, 71, 74, 71, 72, 76, 79, 76, 74, 72, 71, 69, 67, 69, 71, 67, 66, 69, 72, 69, 71, 74, 79, 74];
    const bass = [43, 50, 50, 48, 52, 52, 50, 54, 54, 43, 50, 50];
    const og = ctx.createGain(); og.gain.value = 0.018;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    og.connect(lp).connect(master);
    const beat = 0.36; let t0 = ctx.currentTime + 0.5, k = 0;
    const tick = () => {
      while (t0 < ctx.currentTime + 1.5) {
        const f = 440 * Math.pow(2, (notes[k % notes.length] - 69) / 12);
        for (const [type, mul, vol] of [['square', 1, 0.5], ['triangle', 2, 0.6]]) {
          const o = ctx.createOscillator(), g2 = ctx.createGain(); o.type = type; o.frequency.value = f * mul;
          o.connect(g2).connect(og); env(g2, t0, 0.01, vol, beat * 0.9); o.start(t0); o.stop(t0 + beat);
        }
        if (k % 1 === 0) {
          const b = 440 * Math.pow(2, (bass[Math.floor(k / 2) % bass.length] - 69) / 12) / (k % 3 === 0 ? 1 : 0.5);
          const o = ctx.createOscillator(), g3 = ctx.createGain(); o.type = 'triangle'; o.frequency.value = b;
          o.connect(g3).connect(og); env(g3, t0, 0.01, k % 3 === 0 ? 0.9 : 0.35, beat * 0.7); o.start(t0); o.stop(t0 + beat);
        }
        t0 += beat; k++;
      }
    };
    setInterval(tick, 400); tick();
  },
  click() { if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 1800; o.type = 'triangle'; o.connect(g).connect(master); env(g, t, 0.002, 0.08, 0.04); o.start(t); o.stop(t + 0.06); },
  paper() {
    if (!ctx) return; const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf(0.5);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const g = ctx.createGain();
    s.connect(hp).connect(g).connect(master); env(g, t, 0.02, 0.35, 0.25); s.start(t); s.stop(t + 0.4);
  },
  stamp(kind) {
    if (!ctx) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    o.connect(g).connect(master); env(g, t, 0.004, 0.9, 0.2); o.start(t); o.stop(t + 0.3);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.3); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const g2 = ctx.createGain();
    s.connect(lp).connect(g2).connect(master); env(g2, t, 0.002, 0.6, 0.12); s.start(t); s.stop(t + 0.2);
    if (kind === 'redtag') { const b = ctx.createOscillator(), gb = ctx.createGain(); b.type = 'sawtooth'; b.frequency.value = 110; b.connect(gb).connect(master); env(gb, t + 0.05, 0.01, 0.08, 0.5); b.start(t); b.stop(t + 0.7); }
  },
  whoosh(dur = 3) {
    if (!ctx) return; const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf(dur + 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(400, t + dur);
    const g = ctx.createGain(); s.connect(bp).connect(g).connect(master); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t); s.stop(t + dur + 0.2);
  },
  steps(n = 6) {
    if (!ctx) return; for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.32, s = ctx.createBufferSource(); s.buffer = noiseBuf(0.1);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; const g = ctx.createGain();
      s.connect(lp).connect(g).connect(master); env(g, t, 0.005, 0.12, 0.06); s.start(t); s.stop(t + 0.1);
    }
  },
};
