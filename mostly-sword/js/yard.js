import { blade, makeRound, neutral, STEP, tick } from './arena.js';

export const maxFrames = 540,
  tail = 90;
const idle = neutral();
export function makeYard(weapon = 0, armor = 1) {
  const g = makeRound(1, false, weapon);
  g.practice = true;
  g.p[0].z = -0.58;
  Object.assign(g.p[1], { z: 0.58, left: -1, right: -1, armor });
  g.loot = [
    { w: 0, x: -0.64, z: -0.7 },
    { w: 1, x: 0, z: -1.33 },
    { w: 2, x: 0.68, z: -0.71 }
  ];
  // Start each take at the same rested motor pose.
  for (let i = 0; i < 75; i++) tick(g, [idle, idle]);
  g.time = 0;
  g.event = null;
  g.serial = 0;
  return g;
}
export function frameInput(clip, index) {
  if (index < clip.length) return clip[index];
  const last = clip.at(-1);
  return {
    ...idle,
    yaw: last.yaw,
    pitch: last.pitch,
    offYaw: last.offYaw,
    offPitch: last.offPitch,
    short: last.short,
    guard: last.guard,
    leftId: last.leftId,
    rightId: last.rightId,
    swapId: last.swapId,
    jumpId: last.jumpId
  };
}
export function stepYard(g, input) {
  tick(g, [input, idle], STEP);
}
export function measureTake(clip, weapon, armor) {
  const world = makeYard(weapon, armor),
    pose = () => blade(world.p[0]);
  let prior = pose(),
    lastInput = idle,
    firstMotion = null,
    onset = null,
    reversal = null,
    reversed = null,
    lastMove = null;
  let priorDirection = null,
    reverseDirection = null,
    still = 0,
    settle = null,
    firstHit = null;
  for (let index = 0; index < clip.length + tail; index++) {
    const input = frameInput(clip, index),
      dx = input.yaw - lastInput.yaw,
      dy = input.pitch - lastInput.pitch;
    if (Math.hypot(dx, dy) > 0.0001) {
      lastMove = index;
      still = 0;
      settle = null;
      if (onset === null) onset = index;
      const norm = Math.hypot(dx, dy),
        direction = [dx / norm, dy / norm];
      if (
        priorDirection &&
        reversal === null &&
        direction[0] * priorDirection[0] + direction[1] * priorDirection[1] < -0.5
      ) {
        reversal = index;
        reverseDirection = direction;
      }
      priorDirection = direction;
    }
    const p = world.p[0],
      oldYaw = p.yaw + p.torso,
      oldPitch = p.pitch,
      serial = world.serial;
    stepYard(world, input);
    const next = pose();
    const speed = (a, b) => Math.hypot(...a.map((v, k) => v - b[k])) / STEP;
    if (onset !== null && firstMotion === null && speed(next[0], prior[0]) > 0.045) firstMotion = index;
    if (
      reverseDirection &&
      reversed === null &&
      (p.yaw + p.torso - oldYaw) * reverseDirection[0] + (p.pitch - oldPitch) * reverseDirection[1] >
        0.12 * STEP
    )
      reversed = index;
    if (lastMove !== null && index > lastMove) {
      still = speed(next[1], prior[1]) < 0.09 ? still + 1 : 0;
      if (still === 5 && settle === null) settle = index - 4;
      if (!still) settle = null;
    }
    if (firstHit === null && serial !== world.serial && world.event?.type === 'hit') firstHit = index + 1;
    lastInput = input;
    prior = next;
  }
  const ms = (end, start) =>
    end === null || start === null ? null : Math.round((end - start + 1) * STEP * 1000);
  return {
    start: ms(firstMotion, onset),
    reverse: ms(reversed, reversal),
    settle: ms(settle, lastMove),
    firstHit
  };
}
