import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRound, neutral, STEP } from '../mostly-sword/js/arena.js';
import { packState, unpackState } from '../mostly-sword/js/packets.js';
import { guestPrediction } from '../mostly-sword/js/prediction.js';

function snapshot() {
  return { ...makeRound(1, false), boutId: 1, score: [0, 0], inputAck: 0 };
}

test('wire frames retain inventory, wounds, events and simulation inputs for reconciliation', () => {
  const state = snapshot(),
    guest = state.p[1];
  Object.assign(guest, { x: 0.123456789, gripL: false, left: 2, wounds: [0, 12, 34, 0, 0, 0] });
  state.event = { n: 1, type: 'hit', region: 2, kind: 'cut', surface: 'cloth', target: 1, pos: [1, 0.8, 0] };
  const wire = JSON.stringify(packState(state));
  const restored = unpackState(JSON.parse(wire));
  assert.ok(wire.length < JSON.stringify(state).length * 0.6);
  assert.deepEqual(restored.p[1], { ...guest, x: 0.1235, face: 3.1416 });
  assert.deepEqual(restored.event, state.event);
  assert.equal(unpackState([]), null);
});

test('guest aim is visible immediately and only unacknowledged steps replay after correction', () => {
  const state = snapshot(),
    before = structuredClone(state),
    prediction = guestPrediction();
  prediction.accept(state);
  const command = { ...neutral(), yaw: 1.5, fwd: 1 };
  assert.equal(prediction.step(command, 4 * STEP), 4);
  assert.ok(prediction.fighter.yaw > state.p[1].yaw);
  assert.deepEqual(state, before);
  const first = structuredClone(prediction.fighter);
  prediction.accept({ ...state, inputAck: 0 });
  assert.deepEqual(prediction.fighter, first);
  prediction.accept({ ...state, inputAck: 4 });
  assert.deepEqual(prediction.fighter, state.p[1]);
  state.winner = 0;
  prediction.accept(state);
  prediction.step(command, STEP);
  assert.deepEqual(prediction.fighter, state.p[1]);
});
