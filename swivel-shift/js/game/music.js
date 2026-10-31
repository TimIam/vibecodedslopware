// Music: the original plays QuickTime Music Architecture 'Tune' resources through a TunePlayer.
// Tunes written for Harry's own instruments (the "Harry Instruments" file) are played the same way here, from
// the game's data (tuneplayer.js). Tunes written for QuickTime's built-in General MIDI instruments, which
// aren't part of the game, play recordings of the original instead (data/music/tuneNNN.mp3, made by Zacha
// Pedro by playing the game's Tune data through QuickTime).
// SetMusic / SetMusicVolume / FadeMusic / MusicIdle (seg 6 + seg 1).

import { Prefs } from './state.js';
import { waitTicks } from '../core/timing.js';
import { getResource } from '../core/res.js';
import { audioContext } from './sound.js';
import { TunePlayer, canPlayTune } from './tuneplayer.js';

const M = { player: null, id: -1, volume: 1, faded: false };
const RECORDED = new Set([600, 601, 603, 604, 606, 607, 615, 616, 620]); // the General MIDI tunes
const ALIAS = { 602: 601 };

function audioVolume() { return Prefs.music ? Math.max(0, Math.min(1, M.volume)) * (Prefs.musicVolume / 7) * 0.8 : 0; }

// SetMusic's TuneSetHeaderWithSize + TuneQueue (rate 1.0, looping), or the recording
function startPlayer(id) {
  const ac = audioContext();
  const data = getResource('Tune', id);
  if (!ac || !canPlayTune(data)) {
    if (!RECORDED.has(id)) return null;
    const a = new Audio('data/music/tune' + id + '.mp3');
    a.loop = true;
    a.volume = M.faded ? 0 : audioVolume();
    a.play().catch(() => {});
    return { setVolume(v) { a.volume = v; }, level: () => a.volume, stop() { a.pause(); } };
  }
  const gain = ac.createGain();
  gain.gain.value = M.faded ? 0 : audioVolume();
  gain.connect(ac.destination);
  const tp = new TunePlayer(ac, data, gain);
  tp.start();
  return {
    setVolume(v) { gain.gain.setTargetAtTime(v, ac.currentTime, 0.015); },
    level: () => gain.gain.value,
    stop() { tp.stop(); setTimeout(() => gain.disconnect(), 300); },
  };
}

export function setMusic(id) {
  if (ALIAS[id]) id = ALIAS[id];
  if (id === M.id && M.player) return;
  if (M.player) { M.player.stop(); M.player = null; }
  M.id = id;
  if (id === -1 || !Prefs.music) return;
  M.player = startPlayer(id);
}
export function setMusicVolume(v) { // v: 0..1
  M.volume = v;
  if (M.player) M.player.setVolume(audioVolume());
}
export function musicIdle() {}
// Music turned on/off or its volume changed in the preferences: stop, or resume the current tune
export function refreshMusic() {
  if (!Prefs.music) { if (M.player) M.player.stop(); M.player = null; return; }
  if (!M.player && M.id > 0) { const id = M.id; M.id = -1; setMusic(id); }
  else if (M.player) M.player.setVolume(M.faded ? 0 : audioVolume());
}
export function shutDownMusic() { if (M.player) M.player.stop(); M.player = null; M.id = -1; }
export function currentMusic() { return M.id; }
export const musicPlaying = () => !!M.player;
export const musicLevel = () => (M.player ? M.player.level() : 0); // current output volume (0 = silent)

// FadeMusic(fadeIn, ticksPerStep): 24 steps
export async function fadeMusic(fadeIn, ticksPerStep) {
  if (!Prefs.music) return;
  if (!fadeIn) {
    if (M.faded) return;
    M.faded = true;
    for (let i = 0; i < 24; i++) { setMusicVolume((24 - i) / 24); await waitTicks(ticksPerStep); }
    setMusicVolume(0);
  } else {
    if (!M.faded) return;
    M.faded = false;
    for (let i = 0; i < 24; i++) { setMusicVolume(i / 24); await waitTicks(ticksPerStep); }
    setMusicVolume(1);
  }
}
