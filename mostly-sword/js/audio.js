// A short transient carries contact timing. The resonances distinguish a
// ringing harness or blade from a muffled cloth strike at low volume.
const timbres = {
  clash: [[714, 1410, 2330], 0.23, 'triangle'],
  plate: [[330, 860, 1387], 0.16, 'triangle'],
  cloth: [[127, 211], 0.08, 'sine'],
  fall: [[79, 113], 0.21, 'sine'],
  equip: [[455, 692], 0.09, 'triangle'],
  grapple: [[115, 164], 0.055, 'sine']
};

export function playContact(audio, type, surface) {
  const timbre = timbres[type === 'hit' ? surface : type];
  if (!timbre) return;
  const [partials, decay, wave] = timbre;
  const start = audio.currentTime;
  for (const [i, hz] of partials.entries()) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(hz, start);
    oscillator.frequency.exponentialRampToValueAtTime(hz * (wave === 'sine' ? 0.48 : 0.94), start + decay);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12 / (1 + i), start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + decay + 0.01);
  }
}
