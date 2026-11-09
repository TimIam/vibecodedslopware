// Square-wave beeps. The context is created on the first key or touch, so browsers let it play.
let ctx = null, muted = false, noiseBuf = null;

export function unlockAudio() {
  if (!ctx) {
    try { ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)(); } catch { return; }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setAudioMuted(v) { muted = !!v; }
export function audioMuted() { return muted; }

// [frequency, seconds, wave, volume, slide-to frequency, delay]; frequency 0 is noise
const SOUNDS = {
  blip: [[660, .05, 'square', .12]],
  start: [[392, .08, 'square', .14], [523, .08, 'square', .14, 523, .08], [784, .14, 'square', .14, 784, .16]],
  over: [[392, .16, 'square', .14], [311, .16, 'square', .14, 311, .16], [247, .34, 'square', .14, 196, .32]],
  shoot: [[880, .07, 'square', .08, 330]],
  hit: [[220, .06, 'square', .12, 120]],
  bounce: [[440, .03, 'square', .1]],
  brick: [[740, .04, 'square', .1]],
  pick: [[660, .06, 'square', .12], [990, .1, 'square', .12, 990, .06]],
  boom: [[0, .34, 'noise', .3], [90, .3, 'square', .14, 30]],
  crunch: [[0, .08, 'noise', .16]],
  die: [[523, .1, 'square', .14, 262], [262, .3, 'square', .14, 65, .1]],
  level: [[523, .08, 'square', .13], [659, .08, 'square', .13, 659, .08], [784, .08, 'square', .13, 784, .16], [1047, .2, 'square', .13, 1047, .24]],
  bite: [[300, .05, 'triangle', .22, 600], [600, .08, 'triangle', .22, 300, .06]],
  splash: [[0, .2, 'noise', .16]],
  zap: [[1200, .2, 'sawtooth', .1, 200]],
  snap: [[1800, .08, 'square', .16, 200], [0, .1, 'noise', .2, 0, .02]],
  eat: [[520, .025, 'triangle', .1]],
};

export function sfx(name) {
  if (muted || !ctx || ctx.state !== 'running') return;
  for (const [f, dur, wave = 'square', vol = .12, to = f, delay = 0] of SOUNDS[name] ?? []) {
    const t = ctx.currentTime + delay, gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    gain.connect(ctx.destination);
    if (wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.connect(gain); src.start(t); src.stop(t + dur);
    } else {
      const osc = ctx.createOscillator();
      osc.type = wave; osc.frequency.setValueAtTime(f, t);
      if (to !== f) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t + dur);
      osc.connect(gain); osc.start(t); osc.stop(t + dur);
    }
  }
}
