import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRound, neutral, tick } from '../mostly-sword/js/arena.js';
import { findGrip } from '../mostly-sword/js/grabs.js';
import { weaponShape, featureName } from '../mostly-sword/js/shapes.js';
import { bodyContact } from '../mostly-sword/js/contact.js';
import { makeYard, frameInput, measureTake, stepYard, tail } from '../mostly-sword/js/yard.js';
import { packState, unpackState } from '../mostly-sword/js/packets.js';

test('a grip tracks the contacted equipment, restrains its arm and releases when dropped', () => {
  const g = makeRound(1, false);
  const [p, rival] = g.p;
  p.z = -0.32;
  rival.z = 0.32;
  rival.left = 1;
  const left = { ...neutral(), leftId: 1 },
    dual = { ...neutral(), yaw: 1.65, offhand: true, offYaw: -1.6 };
  assert.equal(findGrip(p, rival, 'L').part, 'gear');
  tick(g, [left, dual]);
  const start = p.grabL.point;
  for (let i = 0; i < 35; i++) tick(g, [left, dual]);
  assert.equal(p.grabL.side, 'R');
  assert.notDeepEqual(p.grabL.point, start);
  assert.ok(rival.yaw + rival.torso < 0 && rival.offYaw < -0.85);
  assert.deepEqual(
    unpackState(JSON.parse(JSON.stringify(packState({ ...g, boutId: 1, score: [0, 0], inputAck: 0 })))).p[0]
      .grabL,
    p.grabL
  );
  tick(g, [left, { ...dual, rightId: 2 }]);
  assert.equal(p.grabL, null);
  assert.equal(p.gripL, false);
  rival.z = 2;
  assert.equal(findGrip(p, rival, 'L'), null);
});
test('weapon features follow the Blender axes and the short grip shifts the crossguard', () => {
  const s = [
      [0, 0, 0],
      [0, 1, 0]
    ],
    sword = weaponShape(s, 0),
    flat = sword.find((p) => p.part === 'blade');
  assert.equal(featureName(flat, [1, 0, 0]), 'edge');
  assert.equal(featureName(flat, [0, 0, 1]), 'flat');
  const guard = sword[0];
  assert.ok(guard.line[0][0] < -0.15);
  assert.ok(
    weaponShape(
      [
        [0, 0, 0],
        [0, 0.71, 0]
      ],
      0,
      true
    )[0].line[0][1] < guard.line[0][1]
  );
  assert.ok(weaponShape(s, 1).some((p) => p.part === 'flanges' && p.r > 0.1));
  assert.ok(weaponShape(s, 2).find((p) => p.part === 'axe edge').line[0][0] < 0);
  assert.ok(weaponShape(s, 2).find((p) => p.part === 'beak').line[1][0] > 0);
});
test('the outer shoulder plate has its own contact point and outward normal', () => {
  const joints = Object.fromEntries(
    [
      'Hips',
      'Chest',
      'Head',
      'Crown',
      ...['L', 'R'].flatMap((s) => ['UpperArm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((k) => k + s))
    ].map((k) => [k, [10, 10, 10]])
  );
  Object.assign(joints, { face: 0, UpperArmL: [0, 1, 0], ForearmL: [0, 0.7, 0], HandL: [0, 0.45, 0] });
  const before = [
      [0.5, 0.94, -0.5],
      [0.5, 0.94, 0.5]
    ],
    after = [
      [-0.02, 0.94, -0.5],
      [-0.02, 0.94, 0.5]
    ];
  const contact = (armor) => bodyContact(before, after, joints, joints, 0, 1 / 90, false, armor);
  const plate = contact(1),
    cloth = contact(0);
  assert.equal(plate.piece, 'spaulder');
  assert.equal(plate.region, 2);
  assert.equal(plate.surface, 'plate');
  assert.ok(plate.normal[0] > 0.85 && plate.pos[0] > 0.09);
  assert.ok(plate.time < cloth.time);
});
test('one fixed-step take produces repeatable timings, different weapon responses and a rooted dummy', () => {
  const clip = Array.from({ length: 96 }, (_, i) => ({
    ...neutral(),
    yaw: i < 8 ? -0.65 : i < 38 ? 1.52 : -1.45,
    pitch: i < 8 ? 0.53 : 0.12
  }));
  const results = [0, 1, 2].map((w) => measureTake(clip, w, 1));
  assert.deepEqual(results[0], measureTake(clip, 0, 1));
  assert.ok(results.every((r) => r.start > 0 && r.reverse > 0 && r.firstHit > 0));
  assert.ok(new Set(results.map((r) => r.settle)).size > 1);
  const g = makeYard(2, 2),
    start = [g.p[1].x, g.p[1].z];
  let count = 0;
  for (let i = 0; i < clip.length + tail; i++) {
    const serial = g.serial;
    stepYard(g, frameInput(clip, i));
    if (g.serial !== serial && g.event?.type === 'hit') count++;
  }
  assert.ok(count > 0);
  assert.equal(g.winner, -1);
  assert.deepEqual([g.p[1].x, g.p[1].z], start);
});
