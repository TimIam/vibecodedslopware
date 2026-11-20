import { Vector3, Quaternion } from '../vendor/three.js';

// Take the last live pose as the initial condition. A constrained particle skeleton
// carries each armor segment down to the floor, including the released weapon.
export function startFall(rig, gear, state) {
  rig.root.updateWorldMatrix(true, true);
  const nodes = {},
    particles = {},
    constraints = [],
    segments = [];
  const world = (node) => node.getWorldPosition(new Vector3());
  const forward = new Vector3(Math.sin(state.face), 0, Math.cos(state.face));
  const side = new Vector3(forward.z, 0, -forward.x);
  function particle(name, position, radius) {
    const velocity = forward
      .clone()
      .multiplyScalar(-1.15 - position.y * 0.8)
      .addScaledVector(side, 0.3 * position.y)
      .add(new Vector3(state.vx * 0.15, 0.12, state.vz * 0.15));
    particles[name] = {
      pos: position,
      prev: position.clone().addScaledVector(velocity, -1 / 90),
      radius
    };
  }
  function link(a, b) {
    const p = particles[a].pos,
      q = particles[b].pos;
    constraints.push([a, b, p.distanceTo(q)]);
  }
  function segment(node, a, b) {
    link(a, b);
    const start = particles[b].pos.clone().sub(particles[a].pos).normalize();
    segments.push({ node, a, b, start, initial: node.getWorldQuaternion(new Quaternion()) });
  }
  for (const name of [
    'Hips',
    'Chest',
    'Head',
    ...['R', 'L'].flatMap((s) => ['UpperArm', 'Forearm', 'Hand', 'Thigh', 'Shin'].map((k) => k + s))
  ]) {
    const node = rig[name];
    nodes[name] = { node, pos: node.position.clone(), rot: node.quaternion.clone() };
    particle(name, world(node), name === 'Head' ? 0.17 : name === 'Chest' ? 0.18 : 0.09);
  }
  particle('Crown', rig.Head.localToWorld(new Vector3(0, 0.22, 0)), 0.12);
  segment(rig.Hips, 'Hips', 'Chest');
  segment(rig.Chest, 'Chest', 'Head');
  segment(rig.Head, 'Head', 'Crown');
  for (const s of ['R', 'L']) {
    const thigh = 'Thigh' + s,
      shin = 'Shin' + s,
      arm = 'UpperArm' + s,
      elbow = 'Forearm' + s,
      hand = 'Hand' + s;
    particle('Foot' + s, rig[shin].localToWorld(new Vector3(0, -0.39, 0.025)), 0.08);
    link('Hips', thigh);
    link('Chest', thigh);
    link('Chest', arm);
    link('Head', arm);
    link('Hips', arm);
    segment(rig[thigh], thigh, shin);
    segment(rig[shin], shin, 'Foot' + s);
    segment(rig[arm], arm, elbow);
    segment(rig[elbow], elbow, hand);
  }
  link('UpperArmR', 'UpperArmL');
  link('ThighR', 'ThighL');
  link('UpperArmR', 'ThighL');
  link('UpperArmL', 'ThighR');
  const item = gear[state.weapon],
    itemPosition = item.position.clone(),
    itemRotation = item.quaternion.clone();
  particle('Grip', itemPosition, 0.055);
  const axis = new Vector3(0, 1, 0).applyQuaternion(itemRotation);
  particle('Tip', itemPosition.clone().addScaledVector(axis, 0.86), 0.04);
  segment(item, 'Grip', 'Tip');
  const points = Object.values(particles),
    delta = new Vector3(),
    q = new Quaternion(),
    parentQ = new Quaternion();
  let carry = 0;
  function step() {
    for (const p of points) {
      delta.copy(p.pos).sub(p.prev).multiplyScalar(0.996);
      if (p.pos.y < p.radius + 0.009) {
        delta.x *= 0.86;
        delta.z *= 0.86;
      }
      p.prev.copy(p.pos);
      p.pos.add(delta);
      p.pos.y -= 9.81 / 8100;
    }
    for (let iter = 0; iter < 9; iter++) {
      for (const [a, b, length] of constraints) {
        const p = particles[a].pos,
          n = particles[b].pos;
        delta.copy(n).sub(p);
        const len = delta.length();
        delta.multiplyScalar(((len - length) * 0.5) / Math.max(0.00001, len));
        p.add(delta);
        n.sub(delta);
      }
      for (const p of points) p.pos.y = Math.max(p.radius, p.pos.y);
    }
  }
  return {
    update(dt) {
      carry += dt;
      while (carry >= 1 / 90) {
        step();
        carry -= 1 / 90;
      }
      for (const { node, a, b, start, initial } of segments) {
        const from = particles[a].pos,
          to = particles[b].pos;
        node.position.copy(node.parent.worldToLocal(from.clone()));
        q.setFromUnitVectors(start, delta.copy(to).sub(from).normalize()).multiply(initial);
        node.quaternion.copy(node.parent.getWorldQuaternion(parentQ).invert()).multiply(q);
        node.updateWorldMatrix(false, true);
      }
    },
    reset() {
      for (const { node, pos, rot } of Object.values(nodes)) {
        node.position.copy(pos);
        node.quaternion.copy(rot);
      }
    }
  };
}
