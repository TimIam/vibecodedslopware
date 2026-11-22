// Lantern Links. Coordinates run down each hole from the tee at x=5.5 to the green at x=80.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from './assets.js';

const waterline = toon(0x286e78), vermilion = toon(0xd95740), cream = toon(0xffe9b0);
const lens = toon(0xffda72, { emissive: 0xffb546, emissiveIntensity: 0.55 });
const up = new THREE.Vector3(0, 1, 0);

// Repeated lighthouse daymarks give the docks a silhouette from the holes below.
function beacon(course, hole, x, z, y, scale = 1) {
  const tower = new THREE.Group();
  for (const [base, top, height, at, mat] of [
    [.55, .37, 1.45, .725, cream], [.38, .32, .53, 1.715, vermilion], [.32, .29, .42, 2.19, cream],
    [.46, .46, .11, 2.455, waterline], [.29, .29, .46, 2.74, lens], [.45, .05, .32, 3.13, vermilion],
  ]) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(top, base, height, 12), mat);
    part.position.y = at;
    part.castShadow = true;
    tower.add(part);
  }
  // Dark mullions break up the lens at a distance. A seaward door and porthole give it scale.
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(.038, .46, .038), waterline);
    rib.position.set(.29 * Math.cos(angle), 2.74, .29 * Math.sin(angle));
    tower.add(rib);
  }
  const door = new THREE.Mesh(new RoundedBoxGeometry(.29, .66, .10, 2, .045), waterline);
  door.position.set(-.47, .34, 0);
  door.rotation.y = Math.PI / 2;
  tower.add(door);
  const port = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .07, 12), waterline);
  port.rotation.z = Math.PI / 2;
  port.position.set(-.40, 1.22, 0);
  tower.add(port);
  tower.position.set(x, y, z);
  tower.scale.setScalar(scale); tower.userData.label = 'beacon'; hole.group.add(tower);      // userData.label: what the level editor calls it
  course.solidify(tower, { hole: hole.i, surf: 'stone' });
}

// A rounded moving box uses the same transform for drawing, ball contact and cart contact.
function shuttle(course, hole, x, y, z, size, travel, rate, phase, visual) {
  course.mover(hole, { size, visual, mat: vermilion, surf: visual ? 'wood' : 'metal', under: false, motion: (t, collider) => {
    collider.pos.copy(hole.frame.w(x, y, z + travel * Math.sin(rate * t + phase)));
    collider.quat.copy(hole.frame.q);
  } });
}

function ferryDeck(wood) {
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new RoundedBoxGeometry(8, .54, 4.2, 2, .24), waterline);
  hull.position.y = -.055;
  boat.add(hull);
  const deck = new THREE.Mesh(new RoundedBoxGeometry(7.88, .14, 4.08, 2, .06), wood);
  deck.position.y = .255;
  deck.receiveShadow = true;
  boat.add(deck);
  const ring = new THREE.TorusGeometry(.18, .065, 6, 16);
  for (const side of [-1, 1]) for (const x of [-2.8, 0, 2.8]) {
    const fender = new THREE.Mesh(ring, x === 0 ? vermilion : cream);
    fender.position.set(x, -.025, side * 2.07);
    boat.add(fender);
  }
  return boat;
}

function turnstile(course, hole, x, y, z, length, rate) {
  const spin = new THREE.Quaternion();
  course.mover(hole, { size: [length, .48, .38], mat: vermilion, surf: 'wood', under: false, motion: (t, col) => {
    col.pos.copy(hole.frame.w(x, y + .27, z));
    col.quat.copy(hole.frame.q).multiply(spin.setFromAxisAngle(up, t * rate));
  } });
}

const holes = [
  ['Lantern Quay', 4, 'Bank off the quay walls or carry the inlet from the tee.', [[27, -2], [48, 2]]],
  ['Double Lock', 4, 'Two lock doors slide across the channel on opposite tides.', [[30, 0], [51, 0]]],
  ['Split Shipment', 5, 'Take the long timber pier on the left or carry the broken pier on the right.', [[27, -4], [53, -4], [65, 0]]],
  ['Buoy Alley', 4, 'Bank around the red buoys. The last pair guard a narrow exit.', [[27, 2], [43, -2], [60, 0]]],
  ['Last Ferry', 5, 'Two ferries cross the channel. Carry both gaps or land on deck.', [[30, 0], [47, 0], [61, 0]]],
  ['Salt Marsh', 4, 'The salt pools leave a curling strip of dry turf. Follow it uphill.', [[22, -3], [45, 3], [62, -2]]],
  ['Switchyard', 5, 'Twin freight belts carry the ball toward opposite ends of the yard.', [[25, -2], [49, -2], [65, 1]]],
  ['Clockwork Cut', 4, 'Two turning arms sweep the terraces. Play past the tips or wait for a gap.', [[28, 3], [49, -3], [64, 0]]],
  ['Last Light', 5, 'Thread the harbor mouth, carry the last channel, then putt beneath the lighthouse.', [[29, 0], [50, 0], [66, 0]]],
];

export function buildBackHole(course, hole, wood) {
  const [name, par, blurb, aims] = holes[hole.i - 1];
  course.holeInfo(hole, name, par, blurb); hole.aims = aims;
  const deck = (a, b, left, right, y, end = y, opts={}) => course.block(hole, a, b, left, right, y, end, opts);
  const timber = { surf: 'wood', thick: .65, noRock: true };
  const pond = (x, z, y, rx, rz) => course.zone(hole, 'water', x, z, rx, {y, rz });
  const rail = (x, z, xx, zz, y) => course.wall(hole, x, z, xx, zz, y, { h: 1.5, mat: waterline });
  switch (hole.i) {
    case 1:
      deck(9, 32, -6, 6, 0);
      deck(32, 51, -5, 2, 0, 7);
      deck(51, 71, -6, 6, 7);
      pond(22, 2.2, 0, 3.8, 2.1);
      rail(25, -5, 31, -2, 0);
      rail(53, 2, 60, 5, 7);
      course.zone(hole, 'sand', 63, -2.6, 2.6, { y: 7, rz: 1.5 });
      break;
    case 2:
      deck(9, 25, -6, 6, 0, 2);
      deck(25, 45, -4.3, 4.3, 2);
      deck(45, 60, -4.3, 4.3, 2, 7);
      deck(60, 71, -6, 6, 7);
      for (const [x, phase] of [[30, 0], [39, Math.PI]]) shuttle(course, hole, x, 2.65, 0, [.6, 1.3, 4], 2.7, .82, phase);
      rail(25, -4.1, 45, -4.1, 2);
      rail(25, 4.1, 45, 4.1, 2);
      break;
    case 3:
      deck(9, 24, -7, 7, 0);
      deck(24, 54, -6.5, -2, 0, 5, timber);
      deck(24, 34, 1.5, 6, 0, 2, timber);
      deck(40, 54, 1.5, 6, 3, 5, timber);
      deck(54, 64, -7, 7, 5, 7);
      deck(64, 71, -7, 7, 7);
      course.zone(hole, 'sand', 66, 0, 1.8, { y: 7, rz: 1.2 });
      break;
    case 4:
      deck(9, 22, -5.8, 5.8, 0, 2);
      deck(22, 46, -5.8, 5.8, 2);
      deck(46, 60, -4.5, 4.5, 2, 7);
      deck(60, 71, -6, 6, 7);
      for (const [x, z] of [[25, 0], [30, -2.5], [34, 2.5], [39, -1.4], [43, 1.5]]) course.bumper(hole, x, z, 2);
      break;
    case 5:
      deck(9, 25, -7, 7, 0, 2.5);
      deck(36, 42, -4, 4, 3.2);
      deck(53, 71, -6.5, 6.5, 4.2, 7);
      shuttle(course, hole, 30.5, 2.6, 0, [8, .65, 4.2], 2.6, .54, 0, ferryDeck(wood));
      shuttle(course, hole, 47.5, 3.5, 0, [8, .65, 4.2], 2.9, .54, Math.PI, ferryDeck(wood));
      break;
    case 6:
      deck(9, 31, -6.5, 6.5, 0);
      deck(31, 46, -6.5, 6.5, 0, 4);
      deck(46, 58, -6.5, 6.5, 4);
      deck(58, 71, -6, 6, 4, 7);
      pond(20, 2.3, 0, 5, 3);
      pond(28, -3.2, 0, 2.3, 2.1);
      pond(50, -2.4, 4, 4, 3);
      course.zone(hole, 'sand', 54, 3.8, 2.1, { y: 4, rz: 1.4 });
      break;
    case 7: {
      deck(9, 24, -6, 6, 0, 2);
      deck(24, 52, -1, 1, 2, 4);
      deck(52, 71, -6, 6, 4, 7);
      for (const s of [-1, 1]) {
        const v = hole.frame.f.clone().multiplyScalar(-s * 3);
        const arrows = course.beltMat().map.clone();
        arrows.center.set(.5, .5);
        arrows.rotation = s * Math.PI / 2;
        arrows.needsUpdate = true;
        const mat = toon(0xffffff, { unique: true, params: { map: arrows }});
        deck(24, 52, s < 0 ? -6: 1, s < 0 ? -1: 6, 2, 4, { surf: 'belt', belt: v, mat, thick: 1 });
        course.animators.push(t => { arrows.offset.y = -(t * .75)%1; });
      }
      break;
    }
    case 8:
      deck(9, 24, -6, 6, 0, 2.4);
      deck(24, 36, -5, 5, 2.4);
      deck(36, 46, -4, 4, 2.4, 5.1);
      deck(46, 57, -5, 5, 5.1);
      deck(57, 71, -6, 6, 5.1, 7);
      turnstile(course, hole, 30, 2.4, 0, 7.6, .85);
      turnstile(course, hole, 51, 5.1, 0, 8, -1.02);
      break;
    case 9:
      deck(9, 24, -7, 7, 0, 2);
      deck(24, 39, -5, 5, 2);
      deck(39, 48, -3.3, 3.3, 2, 4.4);
      deck(51, 63, -5, 5, 4, 7);
      deck(63, 71, -6, 6, 7);
      beacon(course, hole, 32, -3, 2, .95);
      beacon(course, hole, 32, 3, 2, .95);
      turnstile(course, hole, 36, 2, 0, 4.8, .9);
      pond(67, 2.3, 7, 2.7, 1.8);
      course.zone(hole, 'green', 80, 0, 5, { y: 7 });
      course.makeCup(hole, hole.frame.w(81, 7, -.8));
      beacon(course, hole, 85, 4.3, 7, 1.75);
      break;
  }
  beacon(course, hole, 9.8, -4.7, course.groundY(hole, 9.8, -4.7) ?? 0, .71);
  course.prop(hole, hole.i % 2 ? 'tree_palm' : 'tree_pine', 68, 4.7, { trunk: .26, scale: .85, rot: hole.i });
}

// Each drive has two level stretches for obstacles, linked by its own bends and grades.
// The bays and the outside corners use the same dimensions as the shared checkpoint system.
const drives = [
  ['QUAY SLALOM', 'follow the bollards', -1.5, 2],
  ['CUSTOMS', 'honk at both barriers', 2, -1],
  ['FREIGHT WEIGH-IN', 'trip the plate to lower the span', -3, -1],
  ['FENDER RUN', 'steer inside the buoys', 1.5, -3],
  ['FERRY TERMINAL', 'ride the hoist', -2, -2],
  ['BIRD SANCTUARY', 'yield at the crossings', 2, 1.5],
  ['LOADING CRANE', 'wait for the swinging load', -2.5, 2],
  ['SERVICE CUT', 'build speed for the jump', 1, -3],
  ['HARBOR MASTER', 'honk, then dodge the crane', -2, -2.5],
];
export function buildBackRoad(course, hole, {P, corner, end, road, w, off }) {
  const [name, hint, low, high] = drives[hole.i - 1];
  const z1 = -off + low, z2 = -off + high;
  const start = [...corner, ...(hole.i === 1 ? [] : [P(-4, 0), P(6, 0)]), P(18, 1, low), P(23, 1, low), P(32, 1, low)];
  const finish = [P(47, 4.5, high), P(53, 4.5, high), P(59, 4.5, high), P(68, 7), ...end];
  if (hole.i === 3) {
    road(start, { lead: [true, false] });
    const bridge = course.drawbridge(hole, 32, 38, 1, z1, w);
    course.pressurePlate(hole, 26, 1, z1, bridge);
    road([P(38, 1, low), ...finish], { lead: [false, true] });
  } else if (hole.i === 5) {
    road(start, { lead: [true, false] });
    course.lift(hole, 32, 36, z1, 1, 4.5, w + .4);
    road([P(36, 4.5, low), ...finish], { lead: [false, true] });
  } else if (hole.i === 8) {
    road([...start, P(37, 1.8, low), P(39, 2.45, low)], { kicker: true });
    // Room to land and straighten the wheels before the outside bend begins.
    road([P(43, 1.5, low), P(53, 1.5, low), P(61, 4.5, high), P(68, 7), ...end],
      { lead: [false, true], w: w + .65 });
  } else road([...start, ...finish]);
  if (hole.i === 1 || hole.i === 8) for (const [x, s] of [[23, 1], [27, -1], [31, 1]]) course.cone(hole, x, 1, z1 + s * .66);
  if (hole.i === 2 || hole.i === 9) course.boomGate(hole, 27, z1, 1, w, 1);
  if (hole.i === 2) course.boomGate(hole, 55, z2, 4.5, w, -1);
  if (hole.i === 4) for (const [x, s] of [[48, 1], [52, -1], [56, 1]]) course.puzzles.bumpers.push(course.bumper(hole, x, z2 + s * w * .56, 4.5));
  if (hole.i === 6) for (const [x, z, y, phase] of [[25, z1, 1, 0], [30, z1, 1, 2], [54, z2, 4.5, 4]]) course.patrolGoose(hole, x, y, z, w * .42, 1, phase);
  if (hole.i === 7 || hole.i === 9) course.wrecker(hole, 54, 4.5, z2, w);
  if (hole.i === 7) course.wrecker(hole, 26, 1, z1, w);
  course.sign(hole, 5.3, -7.6, 0, [name, hint], .4);
}
