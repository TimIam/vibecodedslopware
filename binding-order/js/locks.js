// The job sheet: every lock in the game, its drawing number, what is inside it and how it fights back.
// Geometry comes from assets/locks.json (built in Blender); this file turns it into a sim lock.
import { StackLock, WardedLock, mulberry } from './sim.js';

export const FAMILY_TOOLS = {
  pin: ['hook', 'deep', 'diamond', 'bogota', 'city', 'snake'],
  wafer: ['hook', 'diamond', 'bogota', 'snake', 'city'],
  dimple: ['flag'],
  lever: ['lever'],
  tubular: ['tubular'],
  warded: ['w1', 'w2', 'w3', 'w4'],
};

export const JOBS = [
  { id: '01', model: 'practice4', title: 'Clear Practice Lock', kind: 'Pin tumbler, 4 pins',
    blurb: 'An acrylic trainer. Light tension with the wheel, slide the hook under each pin and feel for the one that binds. Lift it until it clicks.',
    pins: ['std', 'std', 'std', 'std'], needRange: [0.8, 2.9], tol: 0.26, mu: 0.5, jam: 0.5, hold: 0.05, par: 45, aids: true },
  { id: '02', model: 'padlock4', title: 'Laminated Padlock', kind: 'Pin tumbler, 4 pins',
    blurb: 'Stacked steel plates and four plain pins with sloppy tolerances. Try a rake: light tension, scrub in and out.',
    pins: ['std', 'std', 'std', 'std'], needRange: [0.8, 2.7], tol: 0.3, mu: 0.45, jam: 0.46, hold: 0.05, par: 30, aids: true },
  { id: '03', model: 'warded', title: 'Warded Padlock', kind: 'Warded, skeleton bit',
    blurb: 'No pins at all, just fixed wards. Read the section, choose the skeleton whose bit misses every ward, set the depth so it reaches the latch, and turn.',
    wards: [{ z0: 3.2, z1: 4.6, r0: 4.2, r1: 7.5 }, { z0: 7.0, z1: 8.0, r0: 1.0, r1: 3.0 }], latch: { z: 10.2, r: 5.5 }, par: 30, aids: true },
  { id: '04', model: 'wafer5', title: 'Filing Cabinet Wafer Lock', kind: 'Double wafer, 5 sliders',
    blurb: 'Wafers sprung from both sides: some need lifting, some need pushing down. F flips the pick over.',
    tol: 0.36, mu: 0.42, jam: 0.5, hold: 0.05, par: 40, aids: true },
  { id: '05', model: 'deadbolt5', title: 'Brass Deadbolt', kind: 'Pin tumbler, 5 pins, 1 spool',
    blurb: 'One spool driver. When the plug jumps further than a click (a false set), ease off the tension and keep lifting that pin: you will feel it push back.',
    pins: ['std', 'std', 'spool', 'std', 'std'], tol: 0.22, mu: 0.55, jam: 0.42, hold: 0.06, par: 70, aids: true, shuffle: true },
  { id: '06', model: 'rim3', title: 'Victorian Rim Lock', kind: 'Lever, 3 levers',
    blurb: 'A skeleton-key door lock. Tension the bolt with the curtain wire, then lift each lever until its gate lines up with the bolt stump.',
    pins: ['std', 'std', 'std'], tol: 0.4, mu: 0.45, jam: 0.5, hold: 0.06, par: 50, aids: true },
  { id: '07', model: 'tubular7', title: 'Vending Machine Tubular', kind: 'Tubular, 7 pins',
    blurb: 'Pins in a ring. A/D (or the wheel with Shift) chooses a feeler, the mouse pushes it in. The section turns with the feeler you hold.',
    pins: ['std', 'std', 'std', 'std', 'std', 'std', 'std'], tol: 0.24, mu: 0.5, jam: 0.44, hold: 0.06, par: 70, aids: true },
  { id: '08', model: 'dimple6', title: 'Dimple Euro Cylinder', kind: 'Dimple, 6 pins, 2 mushrooms',
    blurb: 'A flat keyway and short pins pushed by a flag. Tiny lifts, tight tolerances, two mushroom drivers.',
    pins: ['std', 'mushroom', 'std', 'std', 'mushroom', 'std'], tol: 0.13, mu: 0.5, jam: 0.38, hold: 0.07, par: 90, aids: true, shuffle: true },
  { id: '09', model: 'security6', title: 'Security Deadbolt', kind: 'Pin tumbler, 6 pins, spools + serrated',
    blurb: 'Three spools and a serrated driver. Rakes will mostly false set it. Clicks from the serrated pin are not sets: keep lifting until the real one.',
    pins: ['spool', 'std', 'spool', 'serrated', 'spool', 'std'], tol: 0.18, mu: 0.6, jam: 0.34, hold: 0.08, par: 120, aids: false, shuffle: true },
  { id: '10', model: 'lever5', title: 'Five-Lever Padlock', kind: 'Lever, 5 levers, false gates',
    blurb: 'Brass, heavy, five levers and false notches cut into two of them. The false notch catches the stump like a gate; lighten up and keep lifting.',
    pins: ['std', 'falsegate', 'std', 'falsegate', 'std'], tol: 0.32, mu: 0.55, jam: 0.38, hold: 0.07, par: 100, aids: false, shuffle: true },
  { id: '11', model: 'tubular8', title: 'Tubular Vault Lock', kind: 'Tubular, 8 pins, 2 spools',
    blurb: 'Eight pins, two spools, tight tolerances. Keep the tension feather light through the false sets.',
    pins: ['std', 'spool', 'std', 'std', 'std', 'spool', 'std', 'std'], tol: 0.17, mu: 0.55, jam: 0.34, hold: 0.07, par: 130, aids: false, shuffle: true },
  { id: '12', model: 'security6', title: 'The Widowmaker', kind: 'Pin tumbler, 6 pins, all security',
    blurb: 'Spools and serrated pins in every chamber, a narrow tension window and a short temper. The examiners keep this one in a drawer.',
    pins: ['spool', 'serrated', 'spool', 'spool', 'serrated', 'spool'], tol: 0.15, mu: 0.65, jam: 0.28, hold: 0.09, par: 180, aids: false, shuffle: true },
];

/** Sim geometry for a lock model (three.js-space numbers from locks.json). */
export function geoFor(meta) {
  const f = meta.family;
  if (f === 'pin') {
    return { family: f, z: meta.pinZ.map(z => -z), rest: 0.6, mouthY: meta.keywayBottom + 1.0 + 0.8, tipMin: meta.keywayBottom + 1.0 + 0.8,
      tipMax: meta.keywayTop - 0.8, reach: meta.length - 1.0, sample: meta.chamberR * 0.8, shearY: meta.plugR, needRange: [0.6, 3.6] };
  }
  if (f === 'dimple') {
    return { family: f, z: meta.pinZ.map(z => -z), rest: meta.keywayTop, mouthY: -0.35, tipMin: -0.85, tipMax: 0.85,
      reach: meta.length - 1.0, sample: 0.5, shearY: meta.plugR, needRange: [0.25, 0.95] };
  }
  if (f === 'wafer') {
    return { family: f, z: meta.pinZ.map(z => -z), rest: -0.6, mouthY: -2.2, tipMin: -2.2, tipMax: 2.6,
      reach: meta.length - 1.0, sample: 0.35, shearY: meta.plugR, needRange: [0.5, 2.0] };
  }
  if (f === 'lever') {
    const [, , , , d] = meta.box;
    const n = meta.n;
    const z = [];
    const span = (n - 1) * 2.4;
    for (let i = 0; i < n; i++) z.push(d / 2 - span / 2 + i * 2.4);
    return { family: f, z, rest: -4.2, mouthY: -7.6, tipMin: -7.6, tipMax: 0.4, reach: d - meta.wall - 0.6, sample: 0.55,
      needRange: [1.2, 4.0], leverT: 1.6 };
  }
  if (f === 'tubular') {
    return { family: f, z: meta.angles.map(() => meta.shear), rest: 0, mouthY: 0, tipMin: 0, tipMax: 3.6, reach: 1, sample: 0,
      needRange: [0.6, 2.8] };
  }
  if (f === 'warded') {
    const [, , , , d] = meta.box;
    return { family: f, reach: d - meta.wall - 0.4, z: [] };
  }
  throw new Error('family ' + f);
}

export function makeLock(job, meta, seed) {
  const geo = geoFor(meta);
  if (geo.family === 'warded') return new WardedLock(geo, { wards: job.wards, latch: job.latch });
  const rnd = mulberry(seed * 7919 + 13);
  const n = geo.z.length;
  let pins = (job.pins || Array(n).fill('std')).slice(0, n);
  if (job.shuffle) pins = pins.map(v => [rnd(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);
  const [a, b] = job.needRange || geo.needRange;
  const needs = [];
  for (let i = 0; i < n; i++) {
    let v;
    // avoid neighbours so close that a hook cannot tell them apart
    do { v = a + (b - a) * rnd(); } while (i > 0 && Math.abs(v - needs[i - 1]) < (b - a) * 0.12);
    needs.push(Math.round(v * 100) / 100);
  }
  if (geo.family === 'wafer') {
    geo.dirs = [];
    for (let i = 0; i < n; i++) geo.dirs.push(rnd() < 0.5 ? 1 : -1);
    if (geo.dirs.every(d => d === geo.dirs[0])) geo.dirs[n - 1] *= -1;
  }
  const spec = {
    pins, needs, tol: job.tol, mu: job.mu, spring: 0.25, hold: job.hold, jam: job.jam,
    kPick: geo.family === 'tubular' ? 7 : 5, breakF: 6.5, seed: seed * 31 + 7,
  };
  return new StackLock(geo, spec);
}
