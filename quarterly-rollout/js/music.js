// The score, written for this game. Notes are MIDI numbers; null is a rest. Every bar has four bass
// quarter notes and eight melody eighth notes, and one chord that is stabbed on beats two and four.

export const SONGS = {
  // "Rollout Shuffle": the in-game loop, a swung office shuffle in F major
  level: {
    tempo: 126, swing: 0.18, drums: true,
    bars: [
      { chord: [57, 60, 64, 65], bass: [41, 45, 48, 52], melody: [69, 72, null, 69, 67, 65, null, 64] },
      { chord: [57, 60, 62, 65], bass: [38, 41, 45, 48], melody: [65, null, 69, 74, 72, null, 69, null] },
      { chord: [58, 62, 65, 67], bass: [43, 46, 50, 53], melody: [70, null, 70, 69, 67, null, 74, null] },
      { chord: [58, 60, 64, 67], bass: [48, 52, 43, 46], melody: [72, 70, 67, 64, null, 67, null, null] },
      { chord: [55, 60, 64, 67], bass: [45, 48, 52, 55], melody: [76, null, 72, null, 69, 72, 76, 79] },
      { chord: [54, 57, 60, 62], bass: [50, 42, 45, 48], melody: [78, null, 74, null, 69, null, 66, null] },
      { chord: [58, 62, 65, 67], bass: [43, 50, 46, 45], melody: [67, 70, 74, 77, 76, 74, null, 70] },
      { chord: [58, 60, 64, 67], bass: [48, 46, 43, 40], melody: [72, null, null, 69, 67, null, 64, null] },
    ],
  },
  // "Lobby Hold Music": the title screen, slower and softer, in C major
  title: {
    tempo: 92, swing: 0.1, drums: false,
    bars: [
      { chord: [59, 64, 67, 71], bass: [36, 43, 48, 43], melody: [76, null, null, 79, 77, null, 76, null] },
      { chord: [57, 60, 64, 67], bass: [45, 52, 45, 52], melody: [72, null, 74, null, 76, null, null, null] },
      { chord: [57, 60, 62, 65], bass: [38, 45, 50, 45], melody: [77, null, null, 76, 74, null, 72, null] },
      { chord: [55, 59, 62, 65], bass: [43, 50, 43, 47], melody: [71, null, 74, null, 67, null, null, null] },
    ],
  },
};

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Short tunes for events, as [midi, beats] pairs at the given tempo.
export const JINGLES = {
  complete: { tempo: 160, notes: [[72, 0.5], [76, 0.5], [79, 0.5], [84, 1.5]] },
  fail: { tempo: 110, notes: [[67, 0.75], [63, 0.75], [60, 2]] },
  exitOpen: { tempo: 220, notes: [[67, 0.5], [72, 0.5], [76, 0.5], [79, 1]] },
  ending: { tempo: 120, notes: [[65, 0.5], [69, 0.5], [72, 0.5], [77, 1], [76, 0.5], [77, 2]] },
};
