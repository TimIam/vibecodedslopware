import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRound, neutral, tick } from '../mostly-sword/js/arena.js';
import { applyWound, sweptContact } from '../mostly-sword/js/contact.js';

test('a repeated guest input cannot duplicate a pickup or reverse a swap', () => {
  const game = makeRound(1, false);
  const guest = game.p[1];
  const input = [neutral(), { ...neutral(), swapId: 1 }];
  tick(game, input);
  assert.deepEqual([guest.left, guest.right], [0, -1]);
  input[1].rightId = 2;
  tick(game, input);
  tick(game, input);
  assert.deepEqual([guest.left, guest.right], [0, 1]);
  assert.equal(game.loot.filter((item) => item.w >= 0).length, 1);
});

test('steering a second weapon preserves the primary weapon aim', () => {
  const game = makeRound(1, false);
  const p = game.p[0];
  p.left = 1;
  const controls = { ...neutral(), offhand: true };
  for (let i = 0; i < 100; i++) tick(game, [controls, neutral()]);
  const original = p.yaw,
    secondary = p.offYaw;
  controls.offYaw = -1.42;
  for (let i = 0; i < 45; i++) tick(game, [controls, neutral()]);
  assert.ok(Math.abs(p.offYaw - secondary) > 0.9);
  assert.ok(Math.abs(p.yaw - original) < 0.08);
});

test('a fast segment crossing a moving limb registers between ticks', () => {
  const vertical = (x) => [
    [x, 0, 0],
    [x, 1, 0]
  ];
  const hit = sweptContact(vertical(-1), vertical(1), vertical(0.2), vertical(0), 0.08);
  assert.ok(hit && hit.time > 0 && hit.time < 1);
  assert.equal(sweptContact(vertical(-1), vertical(1), vertical(1.4), vertical(1.3), 0.08), null);
});

test('the same leg contact injures the struck side and respects its visible armor', () => {
  const strike = { segment: 'ShinL', region: 4, along: 0.92 };
  const hit = (level) => {
    const p = makeRound().p[0];
    p.armor = level;
    const result = applyWound(p, strike, 0, 7);
    assert.deepEqual(
      p.wounds.map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
      [4]
    );
    return { wound: p.wounds[4], ...result };
  };
  const cloth = hit(0),
    partial = hit(1),
    full = hit(2);
  assert.equal(cloth.wound, partial.wound);
  assert.ok(cloth.wound > full.wound * 3.9);
  assert.deepEqual([cloth.kind, full.kind], ['cut', 'impact']);
});
