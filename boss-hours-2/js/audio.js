// Every sound is synthesised: a handful of oscillators and filtered noise, plus a small looping boss theme.

export function createAudio() {
  let ac = null, master, sfx, mus, noiseBuf, musicT = 0, step = 0, timer = null, combat = 0;
  let muted = false;
  try { muted = localStorage.getItem('bosshours2.muted') === '1'; } catch {}

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = 0.32; mus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
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
    levelup: () => { notes([523, 659, 784, 1047], 'square', 0.06, 0.1, 0.07); tone('triangle', 1568, 1568, 0.3, 0.04, { delay: 0.28 }); },
    deal: () => noise(0.06, 0.08, { f0: 3000, f1: 1500, q: 2 }),
    card: () => notes([784, 1175], 'square', 0.06, 0.09, 0.06),
    legendary: () => { notes([523, 784, 1047, 1319, 1568, 2093], 'square', 0.06, 0.12, 0.06); tone('sawtooth', 110, 55, 0.8, 0.12, { delay: 0.1 }); },
    evolve: () => { tone('triangle', 300, 1200, 0.5, 0.07, { vib: 20 }); noise(0.4, 0.08, { f0: 2000, f1: 6000, q: 3 }); },
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
    bossdie: () => { tone('sawtooth', 220, 28, 2.2, 0.25, { vib: 10 }); noise(1.5, 0.3, { type: 'lowpass', f0: 800, f1: 60 }); },
  };

  // ---- music: a plodding minor riff; drums and an arpeggio join in when there is a fight
  const BASS = [45, 45, 48, 45, 43, 43, 40, 43, 41, 41, 45, 41, 40, 40, 44, 40];
  const ARP = [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]];
  const mtof = m => 440 * 2 ** ((m - 69) / 12);
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    const spb = 60 / 92 / 2;   // eighth notes
    while (musicT < ac.currentTime + 0.25) {
      const delay = Math.max(0, musicT - ac.currentTime);
      const i = step % 16, bar = Math.floor(step / 4) % 4;
      tone('triangle', mtof(BASS[i]), mtof(BASS[i]), spb * 0.95, 0.22, { delay, bus: mus, attack: 0.01 });
      if (i % 4 === 0) tone('sine', 120, 40, 0.18, 0.4, { delay, bus: mus });
      if (combat > 0.5) {
        if (i % 4 === 2) noise(0.12, 0.12, { f0: 2000, f1: 800, delay, bus: mus });
        noise(0.03, 0.05, { type: 'highpass', f0: 7000, f1: 6000, delay, bus: mus });
        const ch = ARP[bar];
        tone('square', mtof(ch[i % 3] + 12), mtof(ch[i % 3] + 12), spb * 0.5, 0.035, { delay, bus: mus });
        tone('square', mtof(ch[(i + 1) % 3] + 12), mtof(ch[(i + 1) % 3] + 12), spb * 0.45, 0.025, { delay: delay + spb / 2, bus: mus });
      }
      musicT += spb;
      step++;
    }
  }

  return {
    unlock() { if (ensure() && !timer) { musicT = ac.currentTime + 0.1; timer = setInterval(schedule, 60); } },
    play(name) { if (!ac || muted) return; const f = SFX[name]; if (f) f(); },
    setCombat(on) { combat = on ? 1 : 0; },
    stopMusic() { if (timer) { clearInterval(timer); timer = null; } },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('bosshours2.muted', muted ? '1' : '0'); } catch {}
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
  };
}
