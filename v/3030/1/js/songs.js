// The soundtrack. Every piece is an original chiptune written for this game. Each one borrows
// only the mood of its album track's production (tempo, key colour, the instruments it leans
// on), never its melodies, samples or lyrics. Notation is explained at the top of music.js.
import { compile } from './music.js';

const BB = { k: 'x......x.x......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' };       // boom-bap
const BB2 = { k: 'x.....x.x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xo' };
const SOFT = { k: 'x.........x.....', s: '....g.......x...', h: '..x...x...x...x.' };

export const SONGS = {
  // Dark pad, a reedy melodica line, a slow heartbeat: the bank of time at closing hour.
  title: {
    title: 'State of the Nation', bpm: 70, key: 'D', mode: 'minor', swing: 0.06,
    ins: { lead: 'melodica', bass: 'fmSub', pad: 'darkPad', arp: 'vibes' }, oct: { lead: 4, arp: 5, pad: 3, bass: 2 }, vol: { arp: 0.6 },
    parts: {
      in: { chords: '1 6', pad: true, arp: '1...3...5...3...', drums: { t: '....x.......x...' } },
      A: {
        chords: '1 6 4 5M', pad: true, bass: 'R-------5-------', arp: '1...3...5...3...', drums: SOFT,
        lead: '5 - - - - - 6 5 4 - 3 - 4 - - - | 3 - - - 2 - 1 - 2 - - - 4 - - - | 5 - - - 4 - 3 - 4 - 5 - 6 - - - | #7, - - - 1 - 2 - #7, - - - - - - -',
      },
      B: {
        chords: '6 7 1 1', pad: true, bass: 'R-------R---5---', arp: '1...3...5...8...', drums: SOFT,
        lead: "3' - - - 2' - 1' - 7 - - - 6 - - - | 7 - - - 1' - 2' - 5 - - - - - - - | 1' - - - 7 - 5 - 4 - 3 - 4 - - - | 1 - - - - - - - - - - - - - - -",
      },
    },
    order: ['in', 'A', 'B', 'A'], loop: 1,
  },

  // Big minor-key strings over a dusty boom-bap: the hero's theme.
  s3030: {
    title: '3030', bpm: 90, key: 'B', mode: 'minor', swing: 0.1,
    ins: { lead: 'fmBrass', lead2: 'choir', bass: 'fmBass', pad: 'strings', arp: 'stacc' }, oct: { lead: 4, lead2: 4, arp: 4, pad: 3, bass: 2 },
    parts: {
      in: { chords: '1 1', pad: true, arp: '1.3.2.3.1.3.2.3.', drums: { t: 'x...x...x...x...' } },
      A: {
        chords: '1 6 3 7', pad: true, arp: '1.3.2.3.1.3.2.3.', bass: 'R---..R.R---..5.', drums: BB,
        lead: '1 - - - 1 - 2 - 3 - - - 5 - 4 3 | 3 - - - 2 - 1 - 2 - - - 3 - - - | 5 - - - 5 - 6 - 7 - - - 6 - 5 - | 4 - - - 3 - 2 - 1 - - - - - - -',
      },
      B: {
        chords: '1 1 6 7', pad: true, arp: '1.3.2.3.1.3.2.3.', bass: 'R---..R.R-5-..<.', drums: { ...BB2, rb: '..............x.' },
        lead2: '5 - - - - - - - - - - - - - - - | 4 - - - - - - - 3 - - - - - - - | 3 - - - - - - - - - - - - - - - | 4 - - - - - - - 2 - - - - - - -',
      },
      C: {
        chords: '4 4 5M 5M', pad: true, arp: '1.3.2.3.1.3.2.3.', bass: 'R---..R.R---..5.', drums: { ...BB, y: 'x...............' },
        lead: "1' - - - 7 - 6 - 5 - - - 4 - - - | 3 - - - 4 - 5 - 6 - - - - - - - | #7 - - - 5 - - - 2' - - - #7 - - - | 2 - - - 1 - - - #7, - - - - - - -",
      },
    },
    order: ['in', 'A', 'B', 'A', 'C', 'B', 'A'], loop: 1,
  },

  // Dorian funk vamp: slap bass, organ stabs, a flute that can't stop showing off.
  things: {
    title: 'Things You Can Do', bpm: 96, key: 'G', mode: 'dorian', swing: 0.14,
    ins: { lead: 'flute', bass: 'fmSlap', pad: 'organ', arp: 'sqThin' }, oct: { lead: 5, pad: 4, bass: 2, arp: 5 }, vol: { pad: 0.9 },
    parts: {
      A: {
        chords: '1m7 4D7 1m7 4D7', pad: '..x...x...x..x..', bass: 'R.rR..R.5.r7..8.',
        drums: { k: 'x.....x.x.....x.', s: '....x..g....x..g', h: 'x.xxx.x.x.xxx.x.' },
        lead: "5 . 7 . 1' - 7 5 4 . 5 . 3 - - . | 4 . 6 . 7 - 6 4 3 . 4 . 1 - - . | 5 . 7 . 1' - 7 5 4 . 5 . 7 - 1' . | 2' - 1' 7 6 . 4 . 5 - - - - - - .",
      },
      B: {
        chords: '7M7 b6M7 4D7 5m7', pad: 'x..x..x...x.....', bass: 'R..R..R.5..R.8..', arp: '1.3.4.3.8.4.3.4.',
        drums: { k: 'x.....x.x.....x.', s: '....x..g....x..g', h: 'x.xxx.x.x.xxx.xo', p: '...x......x.....' },
      },
    },
    order: ['A', 'B', 'A', 'A', 'B'], loop: 0,
  },

  // Bright mixolydian bounce with the DJ cutting in on every bar.
  contact: {
    title: 'Positive Contact', bpm: 100, key: 'A', mode: 'mixo', swing: 0.12,
    ins: { lead: 'sqLead', lead2: 'voxBlip', bass: 'fmBass', pad: 'fmStab', arp: 'sqThin' }, oct: { lead: 5, lead2: 5, bass: 2, pad: 4 },
    parts: {
      A: {
        chords: '1 7 4 1', pad: '....x.......x...', bass: 'R..R..R...5..R..',
        drums: { k: 'x..x..x...x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', rb: '..........x.....', rc: '..............x.' },
        lead: "1' . 1' . 7 . 5 . 6 . 5 . 3 . . . | 7 . 7 . 6 . 4 . 5 . 4 . 2 . . . | 4 . 6 . 1' . 6 . 2' - 1' - 6 . . . | 5 . . 5 6 . 7 . 1' - - - - - . .",
      },
      B: {
        chords: '4 4 1 1', pad: 'x.......x.......', bass: 'R..R..R...5..R.8',
        drums: { k: 'x..x..x...x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', rb: 'x...x...x.x.x...', rc: '..x...x.......x.', rt: '......x.........' },
      },
      C: {
        chords: '6m 7 1 1', pad: '....x.......x...', bass: 'R..R..R...5..R..',
        drums: { k: 'x..x..x...x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', rs: '............x...' },
        lead2: '6 . 6 . 5 . 6 . 1\' . . . . . . . | 7 . 7 . 6 . 7 . 2\' . . . . . . . | 3\' . 2\' . 1\' . 6 . 5 . 6 . 1\' . . . | 5 - - - - - . . . . . . . . . .',
      },
    },
    order: ['A', 'B', 'A', 'C', 'B'], loop: 0,
  },

  // Phrygian menace: a sub bass that leans on the flat second, glitching sync arps.
  virus: {
    title: 'Virus', bpm: 86, key: 'E', mode: 'phrygian', swing: 0,
    ins: { lead: 'sync', lead2: 'sqThin', bass: 'fmSub', pad: 'darkPad', arp: 'sync' }, oct: { lead: 5, lead2: 5, bass: 1, pad: 3, arp: 4 }, vol: { arp: 0.6 },
    parts: {
      in: { chords: '1 1', pad: true, bass: 'R.......R.......', drums: { t: 'x...x...x...x...', z: '.............x..' } },
      A: {
        chords: '1 2 1 7', pad: true, bass: 'R..R..R.^..R..5.', arp: '1.8.1.5.1.8.3.5.',
        drums: { k: 'x......xx.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', z: '...........x....' },
        lead: "1' - - - 2' - 1' - 7 - 5 - - - . . | 6 - - - 5 - 6 - 1' - - - 7 - . . | 1' - - - 2' - 3' - 2' - 1' - 7 - 1' - | 6 - - - 4 - 3 - 4 - - - 2 - - -",
      },
      B: {
        chords: '1 1 2 2', pad: true, bass: 'R..R..R.^..R..5.', arp: '1.8.1.5.1.8.3.5.',
        drums: { k: 'x......xx.....x.', s: '....x.......x...', h: 'xxx.xxx.xxx.xxx.', z: '...x.......x....' },
        lead2: '1 1 1 . 1 1 . 1 2 . 2 2 . 1 . . | 1 1 1 . 1 1 . 1 5, . 5, 5, . 7, . .',
      },
    },
    order: ['in', 'A', 'B', 'A', 'B'], loop: 1,
  },

  // Campus jazz: vibraphone, electric piano, a walking bass in a cardigan.
  upgrade: {
    title: 'Upgrade (A Brymar College Course)', bpm: 92, key: 'F', mode: 'major', swing: 0.15,
    ins: { lead: 'vibes', bass: 'fmSub', pad: 'fmEP', arp: 'vibes' }, oct: { lead: 5, bass: 2, pad: 4, arp: 5 }, vol: { pad: 0.7 },
    parts: {
      A: {
        chords: '2m7 5D7 1M7 6m7', pad: '..x.....x.x.....', bass: 'R---5---8---7---',
        drums: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', t: '.......g.......g' },
        lead: "5 - 4 - 2 - 1 - 2 - 4 - 6 - - - | 7 - - - 6 - 5 - 4 - 3 - 2 - - - | 3 - 5 - 7 - 1' - 3' - - - 2' - 1' - | 6 - - - 5 - 3 - 4 - - - 5 - - -",
      },
      B: {
        chords: '4M7 3m7 2m7 5D7', pad: '..x.....x.x.....', bass: 'R---3---5---<---', arp: '1.2.3.4.3.2.1.2.',
        drums: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', t: '...g.......g....' },
      },
    },
    order: ['A', 'B', 'A', 'B'], loop: 0,
  },

  // Harmonic minor intrigue: harpsichord runs and brass, a villain's plan in a vault.
  mastermind: {
    title: 'Mastermind', bpm: 88, key: 'C', mode: 'harm', swing: 0.08,
    ins: { lead: 'fmBrass', bass: 'fmBass', pad: 'strings', arp: 'harpsi' }, oct: { lead: 4, bass: 2, pad: 3, arp: 5 },
    parts: {
      A: {
        chords: '1m 6 4m 5D7', pad: true, arp: '1323132313231324', bass: 'R---..R.R---..5.', drums: { k: 'x.....x...x...x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        lead: "5 - - - - - 3 - 4 - 5 - 6 - 5 - | 3 - - - - - 1 - 2 - 3 - 4 - 3 - | 1' - - - 7 - 6 - 5 - 4 - 3 - 4 - | 2 - - - 7, - - - 5, - - - 7, - 2 -",
      },
      B: {
        chords: '1m 1m 6 5M', pad: 'x..x..x...x.....', arp: '1323132313231324', bass: 'R..R..R.R..R..5.', drums: { k: 'x.....x...x...x.', s: '....x.......x...', h: 'x.xxx.x.x.xxx.x.' },
      },
    },
    order: ['A', 'B', 'A', 'B'], loop: 0,
  },

  // The descending Andalusian line, sped up and doubled by a choir: the city losing its mind.
  madness: {
    title: 'Madness', bpm: 98, key: 'F#', mode: 'minor', swing: 0.05,
    ins: { lead: 'organ', lead2: 'choir', bass: 'fmBass', pad: 'choir', arp: 'sqThin' }, oct: { lead: 5, lead2: 4, bass: 2, pad: 4, arp: 5 }, vol: { arp: 0.6, pad: 0.7 },
    parts: {
      A: {
        chords: '1 7 6 5M', pad: true, arp: '1358535813585358', bass: 'R.R.R.R.R.R.5.R.',
        drums: { k: 'x...x...x...x.x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
        lead: '1\' - 7 - 6 - 5 - 6 - 5 - 4 - 3 - | 7 - 6 - 5 - 4 - 5 - 4 - 3 - 2 - | 6 - 5 - 4 - 3 - 4 - 3 - 2 - 1 - | #7, - - - 2 - - - #7, - 2 - 5 - - -',
      },
      B: {
        chords: '1 1 4 4', pad: true, arp: '1358535813585358', bass: 'R.R.R.R.R.R.5.R.',
        drums: { k: 'x...x...x...x.x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', y: 'x...............' },
        lead2: '5 - - - - - - - 4 - - - 3 - - - | 1 - - - - - - - - - - - - - - - | 6 - - - - - - - 5 - - - 4 - - - | 1 - - - - - - - - - - - - - - -',
      },
    },
    order: ['A', 'B', 'A', 'B'], loop: 0,
  },

  // Soul ballad with a melodica on top and a clock ticking every beat.
  slipping: {
    title: 'Time Keeps On Slipping', bpm: 92, key: 'A', mode: 'minor', swing: 0.1,
    ins: { lead: 'melodica', bass: 'fmSub', pad: 'fmEP', arp: 'vibes' }, oct: { lead: 5, bass: 2, pad: 4, arp: 5 }, vol: { pad: 0.75 },
    parts: {
      A: {
        chords: '1m7 4m7 7 3M7', pad: '..x...x...x...x.', bass: 'R---..R.R---..5.',
        drums: { ...BB, t: 'x...x...x...x...' },
        lead: '5 - - - 3 - - - 5 - 6 - 5 - 3 - | 4 - - - - - 3 - 4 - 5 - 6 - - - | 7 - - - 6 - 5 - 6 - - - 5 - 4 - | 3 - - - - - - - 2 - - - 1 - - -',
      },
      B: {
        chords: '6M7 5m7 4m7 7', pad: '..x...x...x...x.', bass: 'R---..R.R---..5.', arp: '1...3...4...3...',
        drums: { ...BB2, t: 'x.x.x.x.x.x.x.x.' },
      },
    },
    order: ['A', 'B', 'A', 'B'], loop: 0,
  },

  // Warehouse techno remix: 909 kick, acid line, bleeps. The ship shakes at 132.
  turbulence: {
    title: 'Turbulence', bpm: 132, key: 'F', mode: 'minor', swing: 0,
    ins: { lead: 'sync', lead2: 'sqThin', bass: 'acid', pad: 'darkPad', arp: 'sqThin' }, oct: { lead: 5, lead2: 5, bass: 2, pad: 3, arp: 5 }, vol: { arp: 0.55 },
    parts: {
      in: { chords: '1 1', bass: 'R.8.RR.8R.5.R8.r', drums: { K: 'x...x...x...x...', h: 'gxgxgxgxgxgxgxgx' } },
      A: {
        chords: '1 1 6 7', bass: 'R.8.RR.8R.5.R8.r', arp: '8.5.3.1.8.5.3.1.',
        drums: { K: 'x...x...x...x...', c: '....x.......x...', h: 'gxgxgxgxgxgxgxgx', o: '..x...x...x...x.' },
        lead: "1' . . 1' . . 7 . . 1' . . 3' . 2' . | 1' . . 1' . . 7 . . 1' . . 5 . 4 . | 6 . . 6 . . 5 . . 6 . . 1' . 7 . | 7 . . 7 . . 6 . . 7 . . 2' . 1' .",
      },
      B: {
        chords: '1 1 6 6', pad: true, arp: '1.3.5.8.5.3.1.3.',
        drums: { c: '....x.......x...', h: 'gxgxgxgxgxgxgxgx' },
      },
      C: {
        chords: '1 1 6 7', bass: 'R.8.RR.8R.5.R8.r', pad: true,
        drums: { K: 'x...x...x...x...', c: '....x...x...x.xx', h: 'xxxxxxxxxxxxxxxx', y: 'x...............' },
        lead2: "1 1 3 1 5 1 3 1 1' 1 5 1 3 1 5 3 | 1 1 3 1 5 1 3 1 1' 1 5 1 3 1 5 3",
      },
    },
    order: ['in', 'A', 'B', 'C', 'A', 'B', 'C'], loop: 1,
  },

  // Brass stabs and war drums for the title fight.
  battlesong: {
    title: 'Battlesong', bpm: 94, key: 'E', mode: 'harm', swing: 0.08,
    ins: { lead: 'fmBrass', lead2: 'choir', bass: 'fmBass', pad: 'fmStab', arp: 'stacc' }, oct: { lead: 4, lead2: 4, bass: 2, pad: 4, arp: 4 },
    parts: {
      in: { chords: '1m 1m', pad: 'X...............', drums: { k: 'x.......x.......', y: 'x...............' } },
      A: {
        chords: '1m 1m 6 5M', pad: 'X..x..x...x.....', bass: 'R.R...R.R.R...5.',
        drums: { k: 'x.x...x.x.x...x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', y: 'x...............' },
        lead: "1 . 1 . 1 - 3 . 2 . 1 . 7, - - . | 1 . 1 . 3 - 5 . 4 . 3 . 2 - - . | 3 . 3 . 3 - 5 . 6 . 5 . 3 - - . | 5 . 5 . 7 - 2' . 1' - 7 - 5 - - .",
      },
      B: {
        chords: '1m 4m 1m 5M', pad: 'X.........x.....', bass: 'R.R...R.R.R...5.', arp: '1.3.2.3.1.3.2.3.',
        drums: { k: 'x.x...x.x.x...x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
        lead2: '1 - - - - - - - - - - - - - - - | 3 - - - - - - - - - - - - - - - | 1 - - - - - - - - - - - - - - - | 7, - - - - - - - - - - - - - - -',
      },
    },
    order: ['in', 'A', 'B', 'B', 'A', 'B', 'B'], loop: 1,
  },

  // Late-night quiet storm: electric piano and flute, brushes, swing.
  lovestory: {
    title: 'Love Story', bpm: 84, key: 'Eb', mode: 'major', swing: 0.14,
    ins: { lead: 'flute', bass: 'fmSub', pad: 'fmEP', arp: 'vibes' }, oct: { lead: 5, bass: 2, pad: 4, arp: 5 }, vol: { drums: 0.7, pad: 0.8 },
    parts: {
      A: {
        chords: '1M7 3m7 4M7 5s4+5', pad: '..x...x...x.x...', bass: 'R---..R.R---5---', drums: BB,
        lead: "3 - - - 5 - - - 7 - 6 - 5 - - - | 5 - 4 - 3 - - - 2 - 3 - 5 - - - | 6 - - - 1' - - - 7 - 6 - 5 - 4 - | 4 - - - 3 - - - 2 - - - - - - -",
      },
      B: {
        chords: '6m7 2m7 5D7 1M7', pad: '..x...x...x.x...', bass: 'R---..R.R---5---', arp: '1...3...4...3...', drums: BB,
      },
    },
    order: ['A', 'B', 'A', 'B'], loop: 0,
  },

  // Fingerpicked guitar under strings, a lead that keeps forgetting how it ends.
  memory: {
    title: 'Memory Loss', bpm: 80, key: 'A', mode: 'minor', swing: 0.05,
    ins: { lead: 'sqSoft', bass: 'fmSub', pad: 'strings', arp: 'guitar' }, oct: { lead: 5, bass: 2, pad: 3, arp: 4 }, vol: { drums: 0.75 },
    parts: {
      A: {
        chords: '1 5 6 7', pad: true, arp: '1-3-2-3-8-3-2-3-', bass: 'R-------5---R---', drums: SOFT,
        lead: '5 - - - - - 4 - 3 - - - 1 - - - | 2 - - - - - 3 - 5 - - - - - - - | 6 - - - 5 - 4 - 3 - - - 4 - 3 - | 2 - - - - - - - . . . . 7, - 1 -',
      },
      B: {
        chords: '6 3 4 5M', pad: true, arp: '1-3-2-3-8-3-2-3-', bass: 'R-------5---R---', drums: SOFT,
        lead: "1' - - - 7 - 6 - 5 - - - 3 - - - | 5 - - - 4 - 3 - 2 - - - - - - - | 4 - - - 3 - 2 - 1 - - - 2 - 3 - | #7, - - - - - - - - - - - - - - -",
      },
    },
    order: ['A', 'B', 'A', 'B'], loop: 0,
  },

  // The computer's farewell: the title melody again, in major, on vibes.
  ending: {
    title: 'The Assmann 640 Speaks', bpm: 76, key: 'D', mode: 'major', swing: 0.06,
    ins: { lead: 'vibes', bass: 'fmSub', pad: 'strings', arp: 'fmBell' }, oct: { lead: 5, bass: 2, pad: 3, arp: 6 }, vol: { arp: 0.4 },
    parts: {
      A: {
        chords: '1 5 6 4', pad: true, bass: 'R-------5-------', arp: '1.......5.......', drums: SOFT,
        lead: '5 - - - - - 6 5 4 - 3 - 4 - - - | 3 - - - 2 - 1 - 2 - - - 5 - - - | 5 - - - 4 - 3 - 4 - 5 - 6 - - - | 5 - - - 3 - 2 - 1 - - - - - - -',
      },
    },
    order: ['A', 'A'], loop: 0,
  },

  // ----- skits
  fantabulous: {
    title: 'The Fantabulous Rap Extravaganza', bpm: 124, key: 'C', mode: 'major', swing: 0.2,
    ins: { lead: 'fmBrass', bass: 'fmSlap', pad: 'fmStab' }, oct: { lead: 5, bass: 2, pad: 4 },
    parts: {
      A: {
        chords: '1 6m 2m 5D7', pad: '..x...x...x...x.', bass: 'R...5...R...5...',
        drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x..xx..xx..xx..x', y: 'x...............' },
        lead: "1 . 3 . 5 . 1' - - - 7 . 1' - - - | 6 . 5 . 3 . 6 - - - 5 - - - - - | 2 . 4 . 6 . 2' - - - 1' . 7 - 6 - | 5 - - - 5 . 6 . 7 - - - - - - -",
      },
    },
    order: ['A'], loop: 0,
  },
  stcath: {
    title: 'St. Catherine St.', bpm: 84, key: 'C', mode: 'minor', swing: 0.2,
    ins: { lead: 'sqSoft', bass: 'fmSub', pad: 'fmEP' }, oct: { lead: 5, bass: 2, pad: 4 }, vol: { pad: 0.7, drums: 0.7 },
    parts: {
      A: {
        chords: '1m7 4m7 7D7 3M7', pad: '..x.....x.......', bass: 'R---5---R---<---',
        drums: { k: 'x.........x.....', h: 'x.xxx.xxx.xxx.xx', t: '....x.......x...' },
        lead: '5 - - 3 . 4 5 . 7 - 5 - - - . . | 4 - - 3 . 1 - . 3 - - - - - . . | 2 - 4 - 7 - 6 - 5 - 4 - 2 - . . | 3 - - - - - - - . . . . . . . .',
      },
    },
    order: ['A'], loop: 0,
  },
  newcoke: {
    title: 'New Coke', bpm: 116, key: 'G', mode: 'major', swing: 0.05,
    ins: { lead: 'fmBell', bass: 'fmBass', pad: 'organ' }, oct: { lead: 5, bass: 2, pad: 4 }, vol: { pad: 0.6 },
    parts: {
      A: {
        chords: '1 4 5 1', pad: '..x...x...x...x.', bass: 'R...5...R...5...', drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        lead: "5 - 3 - 5 - 1' - - - 7 - 6 - 5 - | 6 - 4 - 6 - 2' - - - 1' - 7 - 6 - | 7 - 5 - 2' - 1' - 7 - 6 - 5 - 4 - | 3 - 2 - 1 - - - 1' - - - - - - -",
      },
    },
    order: ['A'], loop: 0,
  },
  review: {
    title: 'National Movie Review', bpm: 100, key: 'F', mode: 'major', swing: 0.2,
    ins: { lead: 'vibes', bass: 'fmSub', pad: 'fmEP' }, oct: { lead: 5, bass: 2, pad: 4 },
    parts: {
      A: {
        chords: '1M7 6m7 2m7 5D7', pad: '..x...x...x...x.', bass: 'R---3---5---<---', drums: { k: 'x.......x.......', h: 'x.xxx.xxx.xxx.xx', t: '....x.......x...' },
        lead: "3 - 5 - 1' - - - 7 - 5 - 3 - - - | 1' - - - 6 - - - 5 - - - - - - - | 4 - 6 - 1' - 2' - 1' - 6 - 4 - - - | 2 - - - 3 - 4 - 5 - - - - - - -",
      },
    },
    order: ['A'], loop: 0,
  },
  cleofis: {
    title: 'Meet Cleofis Randolph the Patriarch', bpm: 72, key: 'F', mode: 'major', swing: 0,
    ins: { lead: 'organ', bass: 'fmSub', pad: 'organ' }, oct: { lead: 5, bass: 2, pad: 4 }, vol: { pad: 0.6 },
    parts: {
      A: {
        chords: '1 4 1 5', pad: true, bass: 'R-------R-------', drums: { t: '....x.......x...' },
        lead: "5 - - - 6 - 5 - 3 - - - 4 - - - | 5 - - - 4 - 3 - 2 - - - - - - - | 1' - - - 7 - 6 - 5 - - - 6 - - - | 5 - - - 4 - 3 - 2 - - - - - - -",
      },
    },
    order: ['A'], loop: 0,
  },
  news: {
    title: 'The News (A Wholly Owned Subsidiary of Microsoft, Inc.)', bpm: 120, key: 'D', mode: 'minor', swing: 0,
    ins: { lead: 'fmBrass', bass: 'fmBass', arp: 'sync', pad: 'strings' }, oct: { lead: 5, bass: 2, arp: 5, pad: 3 }, vol: { arp: 0.5 },
    parts: {
      A: {
        chords: '1 1 6 7', pad: true, arp: '1.1.1.1.8.1.1.1.', bass: 'R...R...R...R.5.', drums: { k: 'x.......x.......', t: 'xxxxxxxxxxxxxxxx', y: 'x...............' },
        lead: "1' - - - 5 - - - 6 - 5 - 4 - 3 - | 4 - - - 5 - - - 1 - - - - - - - | 6 - - - 5 - - - 4 - 3 - 2 - 1 - | 7, - - - 2 - - - 1 - - - - - - -",
      },
    },
    order: ['A'], loop: 0,
  },
};

const cache = new Map();
// Compile (and cache) a song, optionally at another tempo.
export function getSong(id, bpm = null) {
  const k = id + ':' + (bpm || '');
  let c = cache.get(k);
  if (!c) {
    const def = SONGS[id];
    if (!def) throw new Error('no song ' + id);
    c = compile(bpm ? { ...def, bpm } : def);
    c.id = id;
    cache.set(k, c);
  }
  return c;
}

// Jukebox order (the Sound Test), album order first.
export const JUKEBOX = ['title', 's3030', 'fantabulous', 'things', 'contact', 'stcath', 'virus', 'upgrade', 'newcoke', 'mastermind', 'review', 'madness', 'cleofis', 'slipping', 'news', 'turbulence', 'battlesong', 'lovestory', 'memory', 'ending'];
