// Every sound is synthesised: SFX from oscillators and filtered noise, music from pre-rendered loops in music.js.
import { TRACKS, createPlayer } from './music.js';

const LS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

export function createAudio() {
  let ac = null, master, shaper, sfx, mus, noiseBuf, retryOff = null;
  const player = createPlayer({ get: () => LS.get('bosshours.music'), set: v => LS.set('bosshours.music', v) });
  // the old single mute key counts as both on first load
  const oldMuted = LS.get('bosshours.muted') === '1';
  const readMute = k => { const v = LS.get(k); return v === null ? oldMuted : v === '1'; };
  const mute = { music: readMute('bosshours.muteMusic'), sfx: readMute('bosshours.muteSfx') };
  // volume steps from the Settings menu, 0 to 10; 7 is the mix the game was balanced at
  const levels = { music: 7, sfx: 7 };
  try {
    const saved = JSON.parse(LS.get('bosshours.levels') || '{}');
    for (const k in levels) if (Number.isFinite(saved[k])) levels[k] = Math.max(0, Math.min(10, Math.round(saved[k])));
  } catch {}
  // equal 3 dB steps so the slider feels even; 0 is true silence
  const stepGain = k => k <= 0 ? 0 : 10 ** ((k - 7) * 3 / 20);
  const sfxGain = () => mute.sfx ? 0 : 0.9 * stepGain(levels.sfx);
  const musGain = () => mute.music ? 0 : 0.32 * stepGain(levels.music);

  function setGain(node, v) {
    if (!ac) return;
    const t = ac.currentTime, p = node.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(v, t + 0.04);
  }

  function installRetry() {
    if (retryOff) return;
    const again = () => { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); };
    // touch only counts as permission on the way up, so listen for all of these
    const EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
    for (const ev of EVENTS) addEventListener(ev, again, true);
    retryOff = () => { for (const ev of EVENTS) removeEventListener(ev, again, true); retryOff = null; };
  }

  // soft ceiling on the very end of the chain: unity below 0.85, so it only ever catches stacked peaks
  function makeCeiling() {
    const n = 8192, curve = new Float32Array(n + 1), K = 0.85;
    for (let i = 0; i <= n; i++) {
      const u = (i - n / 2) / (n / 2) * 4, a = Math.abs(u);
      const y = a <= K ? a : K + (1 - K) * Math.tanh((a - K) / (1 - K));
      curve[i] = u < 0 ? -y : y;
    }
    const pre = ac.createGain(); pre.gain.value = 0.25;
    shaper = ac.createWaveShaper(); shaper.curve = curve; shaper.oversample = 'none';
    pre.connect(shaper); shaper.connect(ac.destination);
    return pre;
  }

  let attached = false;   // the music waits for the title, so it doesn't talk over the studio splash
  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.7; master.connect(makeCeiling());
      sfx = ac.createGain(); sfx.gain.value = sfxGain(); sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = musGain(); mus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ac.onstatechange = () => {
        if (ac.state === 'running') { if (retryOff) retryOff(); player.kick(); }
        else if (ac.state !== 'closed') installRetry();
      };
    }
    if (ac.state !== 'running') {
      if (!navigator.userActivation || navigator.userActivation.hasBeenActive) ac.resume().catch(() => {});
      installRetry();
    }
    return true;
  }

  function tone(type, f0, f1, dur, vol, { delay = 0, bus = sfx, vib = 0, attack = 0.005 } = {}) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vib) {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = 9; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur);
    }
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, { f0 = 1000, f1 = 400, q = 1, type = 'bandpass', delay = 0, bus = sfx, attack = 0.005 } = {}) {
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(gn); gn.connect(bus);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  const notes = (list, type, vol, len, gap) => list.forEach((f, i) => tone(type, f, f, len, vol, { delay: i * gap }));
  let lastKill = 0;

  const SFX = {
    wind_swipe: () => noise(0.14, 0.05, { f0: 500, f1: 1500, q: 3 }),
    swipe: () => { noise(0.18, 0.32, { f0: 2400, f1: 450, q: 1.4 }); tone('square', 130, 55, 0.09, 0.07); },
    wind_stomp: () => tone('sine', 45, 95, 0.55, 0.16, { attack: 0.2 }),
    stomp: () => { tone('sine', 115, 30, 0.5, 0.7); noise(0.45, 0.45, { type: 'lowpass', f0: 1000, f1: 90 }); },
    wind_breath: () => tone('sawtooth', 80, 170, 0.45, 0.05, { attack: 0.3 }),
    breath: () => { noise(1.75, 0.32, { type: 'lowpass', f0: 2200, f1: 500, attack: 0.06 }); tone('sawtooth', 72, 52, 1.75, 0.05, { attack: 0.05 }); },
    wind_roar: () => tone('sawtooth', 70, 110, 0.35, 0.06, { attack: 0.25 }),
    roar: () => { tone('sawtooth', 200, 58, 1.0, 0.22, { vib: 14 }); tone('square', 98, 40, 0.95, 0.1, { vib: 6 }); noise(0.9, 0.22, { type: 'lowpass', f0: 1400, f1: 260 }); },
    shake: () => { for (let i = 0; i < 3; i++) noise(0.08, 0.16, { f0: 1700, f1: 600, q: 2, delay: i * 0.08 }); },
    wind_tail: () => noise(0.25, 0.06, { f0: 300, f1: 900, q: 3 }),
    tail: () => { noise(0.22, 0.32, { f0: 1600, f1: 300, q: 1.2 }); tone('sine', 140, 50, 0.2, 0.25); },
    wind_charge: () => { tone('sawtooth', 60, 50, 0.3, 0.08); noise(0.3, 0.1, { type: 'lowpass', f0: 400, f1: 200 }); },
    charge: () => { for (let i = 0; i < 4; i++) tone('sine', 90, 40, 0.12, 0.35, { delay: i * 0.09 }); noise(0.4, 0.25, { type: 'lowpass', f0: 900, f1: 150 }); },
    buy: () => notes([660, 990, 1320], 'square', 0.06, 0.08, 0.05),
    menuMove: () => tone('square', 520, 520, 0.03, 0.03),
    menuGo: () => notes([392, 587], 'square', 0.05, 0.07, 0.05),
    crunch: () => { noise(0.16, 0.22, { f0: 1800, f1: 400, q: 1.2 }); tone('square', 160, 60, 0.1, 0.06); },
    collapse: () => { noise(0.8, 0.4, { type: 'lowpass', f0: 900, f1: 80 }); tone('sine', 70, 30, 0.7, 0.3); },
    thump: () => { tone('sine', 120, 50, 0.16, 0.3); noise(0.1, 0.15, { type: 'lowpass', f0: 600, f1: 150 }); },
    whoosh: () => noise(0.5, 0.16, { f0: 300, f1: 2400, q: 0.8, attack: 0.08 }),
    splash: () => { noise(0.4, 0.25, { f0: 2400, f1: 500, q: 0.7 }); tone('sine', 300, 90, 0.2, 0.08); },
    wind_summon: () => tone('sawtooth', 80, 160, 0.5, 0.06, { vib: 12, attack: 0.3 }),
    wind_beam: () => { tone('sine', 200, 1400, 0.9, 0.08, { attack: 0.6 }); noise(0.9, 0.08, { f0: 1500, f1: 6000, q: 4, attack: 0.6 }); },
    beam: () => { noise(1.4, 0.3, { f0: 3000, f1: 1200, q: 0.8, attack: 0.02 }); tone('sawtooth', 110, 90, 1.4, 0.12, { vib: 30, attack: 0.02 }); tone('square', 880, 660, 1.2, 0.03, { vib: 80 }); },
    wind_ice: () => noise(0.3, 0.06, { type: 'highpass', f0: 4000, f1: 8000 }),
    ice: () => { for (let i = 0; i < 6; i++) tone('triangle', 1800 + i * 300, 2400 + i * 200, 0.12, 0.04, { delay: i * 0.04 }); noise(0.5, 0.15, { type: 'highpass', f0: 5000, f1: 2500 }); },
    haste: () => { tone('square', 300, 900, 0.25, 0.06); tone('square', 450, 1350, 0.25, 0.04, { delay: 0.05 }); },
    rise: () => tone('sawtooth', 70, 140, 0.4, 0.08, { vib: 20 }),
    clear: () => notes([523, 659, 784, 1047, 1319], 'square', 0.07, 0.18, 0.1),
    newmap: () => notes([392, 523, 659], 'triangle', 0.08, 0.3, 0.15),
    summon: () => { tone('sawtooth', 110, 220, 0.35, 0.1, { vib: 20 }); noise(0.3, 0.15, { type: 'lowpass', f0: 600, f1: 200 }); },
    bite: () => { const now = ac.currentTime; if (now - lastKill < 0.05) return; lastKill = now; noise(0.06, 0.12, { f0: 2500, f1: 1200, q: 3 }); },
    spit: () => tone('triangle', 500, 180, 0.15, 0.06),
    thud: () => { tone('sine', 80, 35, 0.3, 0.4); noise(0.25, 0.2, { type: 'lowpass', f0: 500, f1: 80 }); },
    adddie: () => tone('square', 300, 90, 0.3, 0.07, { vib: 30 }),
    kill: () => {
      const now = ac.currentTime;
      if (now - lastKill < 0.04) return;
      lastKill = now;
      tone('square', 560 + Math.random() * 260, 140, 0.13, 0.06);
    },
    riderdie: () => notes([523, 415, 330, 262], 'square', 0.08, 0.16, 0.1),
    lap: () => { tone('square', 784, 784, 0.09, 0.06); tone('square', 1175, 1175, 0.16, 0.06, { delay: 0.08 }); },
    stab: () => { tone('square', 240, 80, 0.18, 0.18); noise(0.14, 0.3, { f0: 3400, f1: 900, q: 2 }); },
    climb: () => noise(0.3, 0.16, { f0: 350, f1: 1100, q: 2 }),
    fling: () => { noise(0.35, 0.22, { f0: 600, f1: 2400 }); tone('triangle', 300, 950, 0.28, 0.1); },
    neigh: () => { tone('triangle', 650, 1150, 0.25, 0.08, { vib: 60 }); tone('triangle', 1100, 520, 0.45, 0.07, { delay: 0.22, vib: 80 }); },
    whistle: () => { tone('sine', 1500, 2100, 0.14, 0.06); tone('sine', 1500, 2300, 0.18, 0.06, { delay: 0.2 }); },
    horn: () => { tone('sawtooth', 147, 147, 0.4, 0.06, { attack: 0.05 }); tone('sawtooth', 220, 220, 0.6, 0.06, { delay: 0.3, attack: 0.05 }); },
    raidhorn: () => { [110, 147, 196].forEach((f, i) => tone('sawtooth', f, f, 0.55, 0.07, { delay: i * 0.35, attack: 0.06 })); },
    tick: () => tone('square', 1046, 1046, 0.05, 0.04),
    engage: () => tone('square', 330, 495, 0.1, 0.05),
    taunt: () => tone('square', 700, 300, 0.16, 0.06),
    evade: () => tone('triangle', 400, 1300, 0.45, 0.09),
    wipe: () => notes([523, 659, 784, 1047], 'square', 0.07, 0.14, 0.09),
    rez: () => tone('sine', 600, 1300, 0.45, 0.07),
    titleThud: () => {
      const p = 1 + (Math.random() - 0.5) * 0.14;
      tone('sine', 150 * p, 40 * p, 0.3, 0.62);
      noise(0.26, 0.42, { type: 'lowpass', f0: 650 * p, f1: 90 });
    },
    titleBoom: () => {
      tone('sine', 120, 26, 1.9, 0.85);
      tone('triangle', 62, 28, 1.6, 0.34);
      noise(1.7, 0.55, { type: 'lowpass', f0: 460, f1: 38, attack: 0.008 });
      noise(0.2, 0.5, { f0: 2600, f1: 700, q: 0.9 });
      noise(0.07, 0.3, { type: 'highpass', f0: 3200, f1: 1800 });
      tone('square', 190, 60, 0.09, 0.12);
    },
    bossdie: () => { tone('sawtooth', 220, 28, 2.2, 0.25, { vib: 10 }); noise(1.5, 0.3, { type: 'lowpass', f0: 800, f1: 60 }); },
  };

  const applyMute = k => { if (ac) setGain(k === 'music' ? mus : sfx, k === 'music' ? musGain() : sfxGain()); };
  function setMutedBoth(v) {
    mute.music = v; mute.sfx = v;
    LS.set('bosshours.muteMusic', v ? '1' : '0'); LS.set('bosshours.muteSfx', v ? '1' : '0');
    applyMute('music'); applyMute('sfx');
  }

  const tracks = TRACKS.map(t => ({ id: t.id, name: t.name, stage: t.stage, seconds: t.seconds }));

  return {
    // the click that lifts the browser's block: wakes the sound without starting the music yet
    arm() { ensure(); },
    unlock() {
      if (!ensure()) return;
      if (!attached) { attached = true; player.attach(ac, mus); }
      player.kick();
    },
    play(name) { if (!ac || mute.sfx || levels.sfx <= 0) return; const f = SFX[name]; if (f) f(); },
    setStage: n => player.setStage(n),
    setCombat: on => player.setCombat(on),
    tracks,
    get selection() { return player.selection; },
    select: v => player.select(v),
    get nowPlaying() { const t = player.nowPlaying; return t ? tracks.find(x => x.id === t.id) : null; },
    stopMusic() { player.stop(); },
    level: k => levels[k],
    setLevel(k, v) {
      if (!(k in levels)) return;
      levels[k] = Math.max(0, Math.min(10, Math.round(+v || 0)));
      LS.set('bosshours.levels', JSON.stringify(levels));
      applyMute(k);
    },
    isMuted: k => !!mute[k],
    setMuted(k, on) {
      if (!(k in mute)) return;
      mute[k] = !!on;
      LS.set(k === 'music' ? 'bosshours.muteMusic' : 'bosshours.muteSfx', on ? '1' : '0');
      applyMute(k);
    },
    get muted() { return mute.music && mute.sfx; },
    toggleMute() { setMutedBoth(!(mute.music && mute.sfx)); return mute.music && mute.sfx; },
  };
}
