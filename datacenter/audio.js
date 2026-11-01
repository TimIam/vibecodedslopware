// audio.js — a tiny WebAudio synth for the HUD (§19): pop (a purchase), thud (a rack lands), register (money: bounty,
// milestone, exit sweep), blip (a tap or Hustle), alarm (an incident). No samples, no dependencies.
//
//   const audio = createAudio({ enabled: () => sim.state.account.settings.sound });
//   window.addEventListener('pointerdown', audio.unlock, { once: true });   // browsers need a gesture first
//   audio.play('pop');
//
// play() before unlock() or with sound off is a silent no-op. Each sound is rate-limited to one start per 40 ms so a
// ×10 buy or a burst of incidents at ?speed=20 does not turn into a click storm.

const MIN_GAP_MS = 40;

export function createAudio({ enabled = () => true } = {}) {
  let ctx = null, master = null, unlocked = false;
  const lastAt = {};

  function unlock() {
    if (unlocked) { if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      unlocked = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch { ctx = null; }
  }

  // One oscillator voice: frequency f0 → f1 over dur seconds with a fast attack and an exponential tail.
  function tone(type, f0, f1, t0, dur, gain = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // A short filtered noise burst (the dust of a rack drop).
  function noise(t0, dur, gain, cutoff) {
    const n = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.value = gain;
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  const SOUNDS = {
    pop: t => tone('sine', 520, 240, t, 0.12, 0.6),
    blip: t => tone('square', 880, 1320, t, 0.05, 0.18),
    thud: t => { tone('sine', 95, 38, t, 0.28, 1.0); noise(t, 0.14, 0.45, 700); },
    register: t => { tone('triangle', 1318, 1318, t, 0.07, 0.45); tone('triangle', 1760, 1760, t + 0.08, 0.16, 0.45); },
    alarm: t => { tone('square', 660, 660, t, 0.09, 0.16); tone('square', 495, 495, t + 0.12, 0.11, 0.16); },
    boot: t => { tone('sine', 220, 440, t, 0.18, 0.3); },
  };

  function play(name) {
    if (!unlocked || !ctx || !enabled()) return false;
    const fn = SOUNDS[name];
    if (!fn) return false;
    const now = performance.now();
    if (now - (lastAt[name] || 0) < MIN_GAP_MS) return false;
    lastAt[name] = now;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try { fn(ctx.currentTime); } catch { return false; }
    return true;
  }

  return { unlock, play, get unlocked() { return unlocked; }, names: Object.keys(SOUNDS) };
}
