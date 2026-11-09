// The five outings. layout(b) dresses the place; setup(M, a) puts the visitors in it and returns the objectives.
// +Z is south. You always arrive from the south, looking north (yaw 0).

import * as THREE from 'three';
import { S, clamp } from './state.js';
import { props } from './world.js';
import { alertEnemy, returnEnemy } from './enemies.js';
import { gainXp, say, bark, alive, allGone, marksFor } from './mission.js';
import { burst, ring, flash, returnFx } from './fx.js';
import { sfx } from './audio.js';
import { ENDINGS } from './data.js';
import * as ui from './ui.js';

const mk = (x, z, label, up = 3, t) => ({ x, z, y: S.W.height(x, z) + up, label, t });
const tmarks = list => list.filter(t => !t.dead).map(t => ({ x: t.x, y: t.y + t.cy * 2 + 1, z: t.z, label: t.label, t }));
const dead = list => list.filter(t => t.dead).length;
const mechLeft = () => S.enemies.some(e => e.type === 'mech' && !e.gone);

export const MISSIONS = [
  // ================================================================ 1
  {
    name: 'A Strongly Worded Note', place: 'The Ancestor Lawn', human: 'OPERATION FIRST HANDSHAKE', humanPlace: 'Landing Zone Liberty',
    seed: 11, spawn: [0, 92, 0], trees: 50,
    sky: { top: 0x0a0b2a, mid: 0x2a2466, hor: 0xb0507a, fog: 0x2a2450, fogD: 0.0095, light: 0xb8d8ff, lightI: 2.1, hemi: 0x8a80d8, hemiI: 1.5, moonAz: 2.4, fleetAz: -1.57 },
    brief: [
      { who: 'oon', text: 'They have put a ship down on the Lawn. Walk up, hand them the note and be gracious about it.' },
      { who: 'thess', text: 'The note is four words. "Please leave. Kind regards." I drafted it over a century.' },
      { who: 'oon', text: 'If the note fails, use the Returner. It lifts them back to their ship unharmed. They will insist otherwise.' },
    ],
    layout(b) {
      b.pad(0, 0, 30, 24); b.pad(-54, -38, 6, 6, 6); b.pad(48, -50, 6, 6, 6);
      for (let i = 0; i < 5; i++) { b.spire(-10, 80 - i * 10.5, 12 + i * 2.5); b.spire(10, 80 - i * 10.5, 12 + i * 2.5); }
      b.spire(-70, 20, 26, 2.4); b.spire(72, -8, 30, 2.6); b.spire(-30, -78, 22, 2.2); b.spire(34, 70, 18, 2);
      b.lander(0, -12);
      b.mod(-20, -8, 8, 6, 3.4, { dish: true }); b.mod(21, -6, 7, 9, 3.4, { mast: true });
      b.crate(-10, 8, 1.3, 2); b.crate(-11.6, 8.3); b.crate(12, 10, 1.4); b.crate(8, 14, 1.3, 2); b.crate(-22, 2, 1.3); b.crate(24, 6, 1.3, 2);
      b.barrier(-7, 20, 5); b.barrier(8, 20, 5); b.barrier(-18, 14, 5, false); b.barrier(18, 12, 5, false); b.barrier(0, 4, 4);
      b.tower(-27, 19); b.tower(27, 19); b.tower(0, -25, false);
      b.flag(4, 16); b.flag(-54, -34); b.flag(48, -46);
      b.sign(-16, 25, 0, 'landed'); b.sign(17, 25, 0, 'ourland'); b.sign(-31, 4, 3, 'peace', { style: 1 }); b.sign(31, -4, 1, 'parking'); b.sign(0, 52, 0, 'moss', { w: 4.5, y: 1.2 });
      // Great-Grandmother's plot: neat rows, small markers, and now a survey beacon.
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if (!(i === 1 && j === 1)) b.spire(44 + i * 4, 26 + j * 4, 1.5, 0.4);
    },
    setup(M, a) {
      const sarge = a.enemy('heavy', 0, 28, { yaw: 0, name: { rank: 'Sgt.', name: 'Brock Hardcastle', last: 'Hardcastle', reason: 'Knows a threat display when he sees a bow.' } });
      const lz = [sarge, ...[[-5, 24], [5, 25], [-13, 17], [13, 16], [-3, 8], [6, 6], [0, 13]].map(([x, z]) => a.enemy('marine', x, z, { yaw: 0 }))];
      a.squad(['marine', 'marine'], -54, -42, 4); a.squad(['marine', 'marine'], 48, -54, 4); a.squad(['marine', 'marine'], 56, 36, 3);
      const names = ['Hope', 'Faith', 'Deborah'];
      const beacons = [[-54, -38], [48, -50], [48, 30]].map(([x, z], i) => a.target(props.beacon(), x, z, {
        hp: 130, r: 1.3, cy: 2.2, cr: 0.5, label: `Beacon "${names[i]}"`, noun: `beacon ${names[i]}`,
        onDead() { const n = dead(beacons); if (n === 1) a.ship(0, 30, ['marine', 'marine', 'marine', 'marine'], 1); if (n === 2) a.ship(-10, -30, ['marine', 'marine', 'marine', 'marine', 'marine'], 1); },
      }));
      a.log('a1', -20, -3.5); a.log('a2', 8, 18.5); a.log('a3', 52, 34);
      M.truce = true;
      const fight = () => { M.truce = false; for (const e of lz) alertEnemy(e, false); };
      M.breakTruce = () => { if (!M.talked) { M.truce = false; note.on = false; say('sarge', 'It attacked without a word! Exactly like we were going to!', true); for (const e of lz) alertEnemy(e, false); } };
      const note = a.use(0, 28, { r: 6.5, label: 'Hand over the note', use(it) {
        it.on = false; M.talked = true;
        ui.showDialog([
          { who: 'sarge', text: 'HALT! Identify yourself, creature! You are trespassing on sovereign human soil, as of Tuesday!' },
          { who: 'you', reWho: 'sarge', choices: [
            { text: 'Welcome. You are standing on my great-grandmother. Please step off the moss.', tr: '"I WILL FEED YOU TO MY GRANDMOTHER."', re: 'It threatened to feed us to its grandmother!' },
            { text: 'This world is lived in. We have been here four million years. Here is a list of empty ones.', tr: '"THIS WORLD IS HUNGRY. FOUR MILLION WILL DIE. HERE IS THE LIST."', re: 'It has a LIST! Four million names!' },
            { text: '(Bow, and hold out the note with both hands.)', tr: '[GESTURE DETECTED: REACHING FOR WEAPON]', re: 'It\'s going for something! It bowed first! That\'s how they taunt!' },
          ] },
          { who: 'sarge', text: 'You all heard it! Weapons free! And remember, people: WE are the good guys!' },
        ], fight);
      } });
      return [
        { text: 'Deliver the note to their sergeant', human: 'HOSTILE APPROACHING. HOLD FIRE UNTIL IT DOES SOMETHING. THEN FIRE.', marks: () => [mk(0, 28, 'Sergeant', 3.4)], done: () => !M.truce },
        { text: () => `Return the landing party to orbit (${alive(lz)} left)`, human: 'REPEL UNPROVOKED ATTACK ON OUR NEW PLANET', marks: () => marksFor(lz), done: () => alive(lz) === 0,
          start() { M.hint('Hold the left button to fire the Thorn. It does not hurt them. They will not believe this.'); } },
        { text: () => `Take the three metal sticks out of the Lawn (${dead(beacons)}/3)`, human: 'DEFEND SURVEY BEACONS HOPE, FAITH AND DEBORAH', marks: () => tmarks(beacons), done: () => dead(beacons) === 3,
          start() { say('thess', 'They have driven survey beacons into the burial rows. One is in your great-grandmother. She will be furious.', true); } },
        { text: 'Return the stragglers', human: 'ALL UNITS: AVENGE THE BEACONS', marks: () => marksFor(S.enemies), done: allGone },
      ];
    },
  },

  // ================================================================ 2
  {
    name: 'The Hole', place: 'The Singing Aquifer', human: 'OPERATION DEEP FREEDOM', humanPlace: 'Freedom Rig 7',
    seed: 23, spawn: [0, 94, 0], trees: 44,
    sky: { top: 0x03040f, mid: 0x0c1840, hor: 0x1f5a6a, fog: 0x0e2233, fogD: 0.011, light: 0x9fd0ff, lightI: 1.9, hemi: 0x5a78c8, hemiI: 1.5, moonAz: 0.9, fleetAz: -2.2 },
    brief: [
      { who: 'oon', text: 'They have drilled into the Singing Aquifer. It has stopped singing. It has sung since before the mountains.' },
      { who: 'thess', text: 'Four pumps feed the machine. Stop the pumps and the machine will stop. I looked this up; they left the manual on the ground.' },
      { who: 'oon', text: 'Some of them now carry shields with a word on the front. The word is "PEACE". Go round it.' },
    ],
    layout(b) {
      b.pad(0, -5, 36, 34);
      for (const [x, z] of [[-70, 40], [66, 50], [-64, -66], [70, -60], [0, 70]]) b.spire(x, z, 20 + b.r() * 10, 2.2);
      b.mod(-13, 8, 8, 5, 3.4, { dish: true }); b.mod(15, -22, 6, 8, 3.4); b.mod(-16, -24, 7, 5, 3.4, { mast: true, navy: true });
      b.crate(8, 8, 1.4, 2); b.crate(9.7, 8, 1.3); b.crate(-6, -16, 1.4); b.crate(4, -18, 1.3, 2); b.crate(-30, -4, 1.4, 2); b.crate(30, -2, 1.4); b.crate(18, 12, 1.3, 2);
      b.barrier(-10, 26, 6); b.barrier(10, 26, 6); b.barrier(-32, 6, 6, false); b.barrier(32, -12, 6, false); b.barrier(0, -36, 6); b.barrier(-14, -2, 5, false); b.barrier(14, 2, 5, false);
      b.fence(-24, 32, 22, true); b.fence(24, 32, 22, true); b.fence(-38, -22, 30, false); b.fence(38, 14, 30, false); b.fence(-20, -41, 30, true);
      b.tower(-34, 28); b.tower(34, 28); b.tower(34, -36); b.tower(-34, -36);
      b.flag(-3, 30); b.sign(12, 36, 0, 'rig', { w: 8 }); b.sign(-14, 36, 0, 'days'); b.sign(-42, 8, 3, 'started', { style: 1 }); b.sign(42, -20, 1, 'flag');
    },
    setup(M, a) {
      const W = S.W, b = W.b;
      const pond = b.pond(0, 18, 12, 7);
      const rig = b.add(props.rig(), 0, -5); W.addBox(0, -5, 8, 8, W.height(0, -5) - 2, W.height(0, -5) + 26);
      let rigUp = true;
      W.anim.push((t) => { if (rigUp) { rig.userData.head.position.y = 6 + Math.sin(t * 2.4) * 3.5; rig.userData.drill.rotation.y = t * 6; rig.userData.blink.visible = Math.sin(t * 4) > 0; } });
      a.squad(['marine', 'marine', 'heavy'], 0, 22, 6); a.squad(['marine', 'marine'], -24, -26, 4); a.squad(['marine', 'marine'], 26, -28, 4);
      a.squad(['marine', 'heavy'], 24, 14, 4); a.squad(['marine', 'marine'], -26, 16, 4); a.squad(['drone', 'drone', 'drone'], 0, -10, 12);
      const pumps = [[-25, -30], [25, -30], [-25, 20], [25, 20]].map(([x, z], i) => a.target(props.pump(), x, z, {
        hp: 240, r: 1.9, cy: 1.3, cr: 1.6, ch: 2.2, label: `Pump ${i + 1}`, noun: 'pump',
        onDead() {
          const n = dead(pumps);
          if (n === 1) a.ship(0, 30, ['marine', 'marine', 'marine', 'drone', 'drone'], 1);
          if (n === 3) a.ship(-6, -30, ['heavy', 'marine', 'marine', 'marine'], 1);
          if (n === 4) {
            rigUp = false; say('oon', 'Listen. It is humming again.', true);
            let k = 0; W.anim.push((t, dt) => { if (k >= 1) return; k = Math.min(1, k + dt * 0.3); rig.rotation.z = k * k * 1.15; rig.position.y = W.height(0, -5) - k * 3; if (Math.random() < 0.3) { burst(rig.position.x - k * 14 + (Math.random() - 0.5) * 6, rig.position.y + 4 + Math.random() * 16 * (1 - k), -5, { n: 8, color: 0xffa040, speed: 6, size: 0.6, life: 0.7, g: 5 }); } if (k >= 1) { sfx('boom'); ring(-14, W.height(-14, -5), -5, 1, 16, 0xffa040, 0.7); } });
            pond.color.setRGB(0.5, 1.9, 1.7);
          }
        },
      }));
      a.log('b1', -13, 12.2); a.log('b2', 18.6, -22); a.log('b3', -16, -19.8);
      return [
        { text: () => `Stop the four pumps (${dead(pumps)}/4)`, human: 'DEFEND FREEDOM RIG 7. IT IS ONLY SIX DAYS OLD.', marks: () => tmarks(pumps), done: () => dead(pumps) === 4,
          start() { M.later(2, () => M.hint('Chorus [2]: hold to charge, release to send it through a whole line of them. Spore Pod [3] for groups.')); } },
        { text: 'Return everyone still here', human: 'ALL UNITS: THE RIG DIED FOR SOMETHING. FIND OUT WHAT.', marks: () => marksFor(S.enemies), done: allGone },
      ];
    },
  },

  // ================================================================ 3
  {
    name: 'Enrichment', place: 'The Library Slopes', human: 'OPERATION GENTLE HAND', humanPlace: 'Native Wildlife Sanctuary',
    seed: 37, spawn: [0, 94, 0], trees: 52,
    sky: { top: 0x10204a, mid: 0x355a80, hor: 0xe8a060, fog: 0x3a4660, fogD: 0.0088, light: 0xffd8a8, lightI: 2.5, hemi: 0x8aa0d0, hemiI: 1.6, moonAz: 4.0, fleetAz: -0.9 },
    brief: [
      { who: 'thess', text: 'They have taken three Elders from the Library and put them in glass domes. There is a sign. It says "Wildlife Sanctuary".' },
      { who: 'oon', text: 'Elder Moth is among them. Moth is nine hundred thousand years old and has been given a tyre on a rope.' },
      { who: 'oon', text: 'Open the domes. Mind the ones with long rifles: when the red line stops following you, step sideways.' },
    ],
    layout(b) {
      b.pad(0, -12, 14, 11); b.pad(-44, -6, 9, 9, 7); b.pad(0, -52, 9, 9, 7); b.pad(46, -2, 9, 9, 7);
      for (const [x, z, h] of [[-20, 50, 18], [22, 46, 22], [-72, -40, 26], [74, -44, 24], [0, -90, 30], [-60, 44, 16], [60, 40, 18]]) b.spire(x, z, h, 2.2);
      b.mod(0, -16, 10, 6, 3.6, { dish: true, mast: true }); b.mod(-12, -6, 5, 5, 3.2, { navy: true });
      b.crate(8, -6, 1.4, 2); b.crate(9.7, -6.2); b.crate(-4, -4, 1.3); b.crate(12, -18, 1.4);
      b.barrier(-6, 2, 6); b.barrier(7, 2, 6); b.barrier(-34, 4, 5); b.barrier(36, 8, 5); b.barrier(-8, -40, 5); b.barrier(8, -40, 5); b.barrier(-30, -14, 5, false); b.barrier(32, -12, 5, false);
      b.tower(-10, 3); b.tower(12, 3); b.tower(0, -62, false); b.tower(-54, -6, false); b.tower(56, -2, false);
      b.flag(3, -4);
      b.sign(0, 8, 0, 'sanctuary', { w: 9 }); b.sign(-44, 6, 0, 'feed', { w: 5, y: 1.6 }); b.sign(46, 10, 0, 'feed', { w: 5, y: 1.6 }); b.sign(-14, -28, 3, 'seesay', { style: 1 }); b.sign(16, -30, 1, 'grateful');
    },
    setup(M, a) {
      const W = S.W, b = W.b;
      const elders = [
        { x: -44, z: -6, tint: 0x5a3a2a, who: 'moth', line: 'Finally. Forty days of pellets. PELLETS. I am nine hundred thousand years old.' },
        { x: 0, z: -52, tint: 0x2b3a52, who: 'thess', name: 'Elder Wren', line: 'They gave me a tyre on a rope. I have spent a month trying to work out the insult.' },
        { x: 46, z: -2, tint: 0x3a2b52, who: 'oon', name: 'Elder Sedge', line: 'I taught their doctor long division. She wrote down "instinct".' },
      ];
      let opened = 0;
      const posts = elders.map((el, i) => {
        const dome = b.add(props.dome(el.tint), el.x, el.z), y = W.height(el.x, el.z), col = W.addCircle(el.x, el.z, 5.1, y - 1, y + 6);
        const post = b.add(props.post(), el.x, el.z + 7.4); W.addCircle(el.x, el.z + 7.4, 0.5, y - 1, y + 1.2);
        W.anim.push(t => { dome.userData.tyre.rotation.y = Math.sin(t * 0.8 + i) * 0.5; dome.userData.elder.userData.halo.rotation.z = t; dome.userData.elder.position.y = 0.15 + Math.sin(t * 1.3 + i) * 0.08; });
        el.it = a.use(el.x, el.z + 7.4, { r: 3.4, hold: 2.4, label: 'Open the habitat', use() {
          opened++; el.open = true; W.remove(col); sfx('free'); gainXp(60);
          post.userData.blink.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 0.6) });
          const g = dome.userData.glass, e = dome.userData.elder; let k = 0;
          W.anim.push((t, dt) => { if (k >= 1) return; k = Math.min(1, k + dt * 0.8); g.scale.setScalar(1 - k * 0.999); g.material.opacity = 0.2 * (1 - k); });
          ui.subtitle(el.name || 'Elder Moth', el.line, 'alien'); M.tBark = S.time + 4;
          M.later(4.2, () => { returnFx(el.x + 0.6, y, el.z + 0.2, 3.4); e.visible = false; sfx('blink'); ui.toast(`${el.name || 'Elder Moth'} has gone home.`, 'good'); });
          if (opened === 1) a.ship(0, 6, ['marine', 'marine', 'marine', 'marine'], 1.5);
          if (opened === 2) a.ship(0, -30, ['marine', 'marine', 'heavy', 'drone', 'drone'], 1.5);
          if (opened === 3) M.later(5, () => { a.ship(0, 16, ['mech', 'marine', 'marine'], 0); bark('mech', null, null, true); });
        } });
        return el;
      });
      a.squad(['marine', 'marine', 'heavy'], 0, -2, 5); a.squad(['marine', 'marine'], -44, 4, 4, { guard: 16 }); a.squad(['marine', 'marine'], 46, 8, 4, { guard: 16 }); a.squad(['marine', 'heavy'], 0, -42, 4, { guard: 16 });
      a.squad(['drone', 'drone'], 0, -20, 10);
      for (const [x, z] of [[-74, -30], [76, -32], [10, -86]]) a.enemy('sniper', x, z, { guard: 14 });
      a.log('c1', 0, -11.4); a.log('c2', -12, -2.3); a.log('c3', 12, -84);
      return [
        { text: () => `Open the three habitats (${opened}/3)`, human: 'PROTECT THE SPECIMENS FROM BEING RESCUED', marks: () => posts.filter(e => !e.open).map(e => mk(e.x, e.z + 7.4, 'Habitat', 2.6)), done: () => opened === 3,
          start() { M.later(1.5, () => M.hint('Hold [F] at a habitat\'s control post to open it.')); } },
        { text: 'Return the Liberator walker', human: 'LIBERATOR: STOMP FOR A BRIGHTER TOMORROW', marks: () => marksFor(S.enemies.filter(e => e.type === 'mech')), done: () => mechGoneAfterDrop(M) },
        { text: 'Return everyone still here', human: 'ALL UNITS: IT TOOK OUR WILDLIFE', marks: () => marksFor(S.enemies), done: allGone },
      ];
    },
  },

  // ================================================================ 4
  {
    name: 'Breathing Room', place: 'The Downwind Forest', human: 'OPERATION FRESH AIR', humanPlace: 'Atmospherics Plant One',
    seed: 51, spawn: [0, 94, 0], trees: 58,
    sky: { top: 0x06121e, mid: 0x124a4a, hor: 0x58c8a0, fog: 0x123838, fogD: 0.009, light: 0xc8f0e0, lightI: 2.1, hemi: 0x78c0b0, hemiI: 1.5, moonAz: 5.2, fleetAz: -1.2 },
    brief: [
      { who: 'oon', text: 'They are changing the air. They say it is for everyone. It is for them. The forest downwind has gone grey.' },
      { who: 'thess', text: 'Three processors, each under a shield. Each shield is fed by a generator nearby. Remove the generator first. I drew a diagram.' },
      { who: 'moth', text: 'Their air makes your shell mend slowly. Do not stand about in it. And tell them the pellets were an insult.' },
    ],
    layout(b) {
      b.pad(-40, -18, 9, 9, 7); b.pad(42, -24, 9, 9, 7); b.pad(0, -62, 9, 9, 7); b.pad(0, -14, 13, 10);
      b.pad(-60, 4, 5, 5, 5); b.pad(64, -2, 5, 5, 5); b.pad(-22, -84, 5, 5, 5);
      for (const [x, z, h] of [[-20, 56, 20], [24, 52, 24], [-80, -30, 22], [82, -40, 26], [40, -80, 22], [-56, 50, 18]]) b.spire(x, z, h, 2.2);
      b.mod(0, -18, 9, 6, 3.6, { dish: true }); b.mod(-10, -8, 5, 5, 3.2, { navy: true, mast: true });
      b.crate(8, -8, 1.4, 2); b.crate(9.7, -8.2); b.crate(-28, -8, 1.4); b.crate(30, -14, 1.4, 2); b.crate(-8, -52, 1.4); b.crate(10, -54, 1.3, 2); b.crate(-52, -8, 1.3); b.crate(54, -12, 1.3);
      b.barrier(-6, 0, 6); b.barrier(7, 0, 6); b.barrier(-30, 0, 5); b.barrier(32, -6, 5); b.barrier(-10, -46, 5); b.barrier(10, -46, 5); b.barrier(-48, -28, 5, false); b.barrier(52, -34, 5, false); b.barrier(-20, -30, 5); b.barrier(22, -38, 5);
      b.tower(-10, 1); b.tower(12, 1); b.tower(-40, -32, false); b.tower(42, -38, false);
      b.flag(3, -6); b.sign(0, 6, 0, 'air', { w: 9 }); b.sign(-40, -4, 0, 'grateful'); b.sign(42, -10, 0, 'days'); b.sign(-16, -62, 3, 'started', { style: 1 });
    },
    setup(M, a) {
      const W = S.W, b = W.b;
      let hazeT = 1; W.setHaze(1);
      W.anim.push((t, dt) => { if (Math.abs(W.haze - hazeT) > 0.003) W.setHaze(W.haze + clamp(hazeT - W.haze, -dt * 0.22, dt * 0.22)); });
      const sites = [{ p: [-40, -18], g: [-60, 4] }, { p: [42, -24], g: [64, -2] }, { p: [0, -62], g: [-22, -84] }];
      const procs = [], gens = [];
      sites.forEach((s, i) => {
        const pg = props.processor();
        const proc = a.target(pg, s.p[0], s.p[1], { hp: 520, r: 3.3, cy: 5, cr: 3.2, ch: 14, label: `Processor ${i + 1}`, noun: 'air processor', shielded: true, xp: 90, spinRate: 3,
          onDead() {
            hazeT = 1 - dead(procs) / 3; const n = dead(procs);
            ui.toast(n === 3 ? 'The sky is yours again.' : 'The air clears a little.', 'good');
            if (n === 1) a.ship(0, 4, ['marine', 'marine', 'marine', 'heavy', 'drone'], 1);
            if (n === 2) a.ship(0, -36, ['marine', 'marine', 'heavy', 'drone', 'drone', 'sniper'], 1);
            if (n === 3) M.later(3, () => { a.ship(0, 4, ['mech', 'heavy', 'marine', 'marine'], 0); bark('mech', null, null, true); });
          } });
        W.anim.push(() => { if (!proc.dead && Math.random() < 0.25) burst(proc.x, proc.y + 14.5, proc.z, { n: 1, color: 0x8a9aa8, speed: 1.2, up: 5, size: 1.6, life: 2.2, drag: 0.3, spread: 1 }); });
        procs.push(proc);
        gens.push(a.target(props.generator(), s.g[0], s.g[1], { hp: 170, r: 1.5, cy: 1.2, cr: 1.2, ch: 2.4, label: `Generator ${i + 1}`, noun: 'generator', onDead() { proc.shielded = false; pg.userData.shield.visible = false; sfx('shieldUp'); ui.toast(`Processor ${i + 1} is exposed.`, 'good'); } }));
        a.enemy('turret', s.g[0] + 4, s.g[1] + 3); a.squad(['marine', 'marine'], s.g[0] - 2, s.g[1] + 4, 3, { guard: 14 });
        a.squad(i === 2 ? ['marine', 'heavy', 'marine'] : ['marine', 'heavy'], s.p[0], s.p[1] + 9, 4, { guard: 18 });
      });
      a.squad(['marine', 'marine', 'marine'], 0, -4, 5); a.squad(['drone', 'drone', 'drone', 'drone'], 0, -30, 14);
      a.enemy('sniper', -78, -56, { guard: 12 }); a.enemy('sniper', 80, -62, { guard: 12 });
      a.log('d1', 0, -13.4); a.log('d2', -10, -4.3); a.log('d3', 66, 2);
      return [
        { text: () => `Shut down the three air processors (${dead(procs)}/3)`, human: 'DEFEND THE FRESH AIR. IT IS A HUMAN RIGHT.',
          marks: () => [...tmarks(gens.filter((g, i) => !procs[i].dead)), ...tmarks(procs.filter(p => !p.shielded))], done: () => dead(procs) === 3,
          start() { M.later(1.5, () => M.hint('Their air: your shell mends at half speed until the processors are gone.')); } },
        { text: 'Return the Liberator walker', human: 'LIBERATOR: MAKE IT REGRET BREATHING', marks: () => marksFor(S.enemies.filter(e => e.type === 'mech')), done: () => mechGoneAfterDrop(M) },
        { text: 'Return everyone still here', human: 'ALL UNITS: IT BROKE THE SKY', marks: () => marksFor(S.enemies), done: allGone },
      ];
    },
  },

  // ================================================================ 5
  {
    name: 'The Protagonist', place: 'The Quiet Plateau', human: 'OPERATION HERO\'S STAND', humanPlace: 'Forward Command "Destiny"',
    seed: 73, spawn: [0, 94, 0], trees: 40,
    sky: { top: 0x12020f, mid: 0x4a1030, hor: 0xd04a30, fog: 0x2a1020, fogD: 0.0085, light: 0xffb898, lightI: 2.2, hemi: 0xb070a0, hemiI: 1.5, moonAz: 1.4, fleetAz: -1.57, aurora: 0.5 },
    brief: [
      { who: 'oon', text: 'Their captain has built a stage on the Quiet Plateau. He is called Buck Sterling. He believes this is his story.' },
      { who: 'thess', text: 'I have repaired their translator from here. This time he will hear exactly what you say. I am curious whether it helps.' },
      { who: 'oon', text: 'When he begins a speech, stop him. A look will do. You have had forty thousand years of practice at that look.' },
    ],
    layout(b) {
      b.pad(0, -12, 36, 34); b.pad(0, 44, 60, 5, 8);
      for (const [x, z, h] of [[-16, 78, 16], [16, 78, 16], [-70, 70, 24], [70, 66, 22], [-84, -20, 28], [86, -24, 30], [0, -92, 34]]) b.spire(x, z, h, 2.3);
      for (const x of [-74, -28, 28, 74]) b.wall(x, 40, 46, true, 5.5);
      b.barrier(-14, 52, 6); b.barrier(14, 52, 6); b.barrier(-30, 58, 6); b.barrier(30, 58, 6); b.barrier(0, 62, 5); b.crate(-8, 47, 1.4, 2); b.crate(8, 47, 1.4, 2);
      b.tower(-7, 43.5, false); b.tower(7, 43.5, false); b.sign(-22, 44, 0, 'seesay'); b.sign(22, 44, 0, 'peace', { style: 1 });
      b.deck(0, -30, 18, 8, 0.5); b.podium(0, -27.5); b.sign(0, -35, 0, 'accomplished', { w: 14, y: 3.4, style: 1 }); b.sign(-22, -30, 0, 'proud'); b.sign(22, -30, 0, 'flag');
      b.mod(0, -42, 16, 7, 4.4, { dish: true, mast: true }); b.mod(-28, -36, 7, 7, 3.4, { navy: true }); b.mod(28, -36, 7, 7, 3.4, { navy: true });
      for (const x of [-12, 12]) for (const z of [-20, 4]) b.flag(x, z);
      b.barrier(-16, -8, 6, false); b.barrier(16, -8, 6, false); b.barrier(-8, 8, 5); b.barrier(8, 8, 5); b.barrier(-24, 10, 5); b.barrier(24, 10, 5); b.barrier(-26, -18, 5, false); b.barrier(26, -18, 5, false); b.barrier(0, -6, 4);
      b.crate(-30, 0, 1.5, 2); b.crate(30, 2, 1.5, 2); b.crate(-20, 18, 1.4); b.crate(20, 18, 1.4, 2);
      b.tower(-32, 18); b.tower(32, 18); b.tower(-32, -30); b.tower(32, -30);
      b.sign(-40, -4, 3, 'mess'); b.sign(40, -4, 1, 'started', { style: 1 });
    },
    setup(M, a) {
      const W = S.W, b = W.b;
      const gate = b.gate(0, 40, 10);
      const sentries = [a.enemy('turret', -8, 45.5), a.enemy('turret', 8, 45.5)];
      a.squad(['marine', 'marine', 'heavy'], -16, 50, 4); a.squad(['marine', 'marine', 'heavy'], 16, 50, 4); a.squad(['marine', 'marine'], 0, 56, 5);
      a.enemy('sniper', -48, 50, { guard: 10 }); a.enemy('sniper', 48, 50, { guard: 10 });
      const guard = [[-6, 14], [6, 14], [-6, 2], [6, 2], [-6, -10], [6, -10]].map(([x, z]) => a.enemy('marine', x, z, { yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2 }));
      const hero = a.enemy('hero', 0, -24, { yaw: 0 });
      a.log('e1', 3, -26.5); a.log('e2', -6, 34); a.log('e3', 14, 84);
      let fighting = false, ended = false;
      const fight = () => { M.truce = false; fighting = true; alertEnemy(hero, false); for (const e of guard) alertEnemy(e, false); M.checkpoint = [0, 28, 0]; };
      M.breakTruce = () => { if (!fighting) { talk.on = false; say('sterling', 'It struck first! I KNEW it would, because I was about to!', true); fight(); } };
      const talk = a.use(0, -24, { r: 9, on: false, label: 'Speak with Captain Sterling', use(it) {
        it.on = false;
        ui.showDialog([
          { who: 'sterling', text: 'So. The monster walks into the light. I\'ve waited my whole life for an enemy this tall.' },
          { who: 'thess', text: '(The translator is fixed. He will hear your exact words. Go on.)' },
          { who: 'you', reWho: 'sterling', accurate: true, choices: [
            { text: 'We do not want to fight. Take the southern continent. It is lovely. We hardly use it.', tr: '"We do not want to fight. Take the southern continent. It is lovely. We hardly use it."', re: 'A whole continent, free... That is EXACTLY what a monster would offer. To lull us.' },
            { text: 'Your soldiers are alive. They are on your ship. Look in the cafeteria.', tr: '"Your soldiers are alive. They are on your ship. Look in the cafeteria."', re: 'Clones. Obviously clones. Kowalski NEVER liked salad.' },
            { text: 'Why are you like this?', tr: '"Why are you like this?"', re: 'Because somebody has to be the hero. And I look great doing it.' },
          ] },
          { who: 'sterling', text: 'Enough talk, which I started! People of Earth: watch closely. This is the part where I win.' },
        ], fight);
      } });
      return [
        { text: () => `Knock at the gate (${alive(sentries)} sentries)`, human: 'HOLD THE GATE. THE CAPTAIN IS REHEARSING.', marks: () => marksFor(sentries), done: () => alive(sentries) === 0,
          end() { gate.open(); sfx('objective'); ui.toast('The gate is opening.', 'good'); } },
        { text: 'Speak with Captain Sterling', human: 'HONOUR GUARD: LET IT APPROACH. HE WANTS AN AUDIENCE.', marks: () => [mk(0, -24, 'Sterling', 3.6)], checkpoint: [0, 60, 0],
          start() { for (const e of S.enemies) if (!guard.includes(e) && e !== hero && !e.alert) alertEnemy(e, false); M.truce = true; talk.on = true; },
          done: () => fighting },
        { text: 'Return Captain Sterling to orbit', human: 'PROTECT THE PROTAGONIST', marks: () => hero.gone ? [] : [{ x: hero.pos.x, y: hero.pos.y + 3.2, z: hero.pos.z, label: '' }], checkpoint: [0, 28, 0],
          start() { ui.bossBar(hero); }, done: () => hero.gone,
          end() { ui.bossBar(null); for (const e of S.enemies) if (!e.gone) M.later(0.4 + Math.random() * 1.5, () => { if (!e.gone) { e.hp = 0; returnEnemy(e); } }); } },
        { text: 'It is quiet.', human: 'ALL UNITS: WE WON. EVERYONE AGREE THAT WE WON.', marks: () => [],
          start() { M.later(4, () => { if (document.pointerLockElement) document.exitPointerLock(); ui.showDialog([
            { who: 'oon', text: 'It is done. They are all in orbit, unharmed, telling each other they won.' },
            { who: 'thess', text: 'For the record: two thousand and six visitors returned. Zero harmed. One gardener, mildly inconvenienced.' },
            { who: 'you', choices: ENDINGS.map((e, i) => ({ text: e.pick, id: i })), onPick: c => { S.save.ending = c.id; } },
          ], () => { ended = true; }); }); },
          done: () => ended },
      ];
    },
  },
];

// The walker counts as dealt with once it has actually been dropped and is no longer here.
function mechGoneAfterDrop(M) {
  if (!M.mechSeen) { if (mechLeft()) M.mechSeen = true; return false; }
  return !mechLeft();
}
