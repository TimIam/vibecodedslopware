import R from '../vendor/rapier-0.19.3.mjs';
import { Vector3, Quaternion } from '../vendor/three.js';
import { STEP, RECOVERY, clamp, weapons } from './arena.js';

export const physicsReady = R.init();
const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const up = v(0, 1, 0);
const zero = v();

// Each body starts in the last displayed pose. Its orientation represents a
// rotation relative to that pose, so all joint anchors share the same rest frame.
export function startFall(rig, state, terminal) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  world.numSolverIterations = 8;
  world.createCollider(R.ColliderDesc.cuboid(18, 0.15, 18).setTranslation(0, -0.15, 0).setFriction(0.85));
  rig.root.updateWorldMatrix(true, true);
  const parts = [];
  function segment(node, endLocal, radius, mass, parent, hinge) {
    endLocal = endLocal.clone();
    const start = node.getWorldPosition(v());
    const initial = node.getWorldQuaternion(new Quaternion());
    const delta = node.localToWorld(endLocal.clone()).sub(start);
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(start.x, start.y, start.z)
        .setLinvel(
          state.vx * 0.3 - Math.sin(state.face) * start.y * 1.35,
          0.05,
          state.vz * 0.3 - Math.cos(state.face) * start.y * 1.35
        )
        .setAngularDamping(1.1)
        .setLinearDamping(0.28)
    );
    const center = delta.clone().multiplyScalar(0.5);
    const shape = R.ColliderDesc.capsule(Math.max(0.007, center.length() - radius), radius)
      .setTranslation(center.x, center.y, center.z)
      .setRotation(new Quaternion().setFromUnitVectors(up, delta.clone().normalize()))
      .setMass(mass)
      .setFriction(0.68);
    world.createCollider(shape, body);
    if (parent) {
      const pivot = start.clone().sub(parent.start);
      const joint = hinge ? R.JointData.revolute(pivot, zero, hinge) : R.JointData.spherical(pivot, zero);
      const connection = world.createImpulseJoint(joint, parent.body, body, true);
      connection.setContactsEnabled(false);
      if (hinge) connection.setLimits(-1.65, 1.65);
    }
    const part = {
      node,
      body,
      start,
      initial,
      endLocal,
      delta,
      mass,
      targetPos: v(),
      targetRot: new Quaternion()
    };
    parts.push(part);
    return part;
  }
  const hips = segment(rig.Hips, rig.Chest.position, 0.145, 7);
  const chest = segment(rig.Chest, rig.Head.position, 0.16, 9, hips);
  segment(rig.Head, v(0, 0.22, 0), 0.12, 3, chest);
  const lateral = v(Math.cos(state.face), 0, -Math.sin(state.face));
  for (const side of ['L', 'R']) {
    const thigh = rig['Thigh' + side],
      shin = rig['Shin' + side];
    const arm = rig['UpperArm' + side],
      forearm = rig['Forearm' + side];
    const leg = segment(thigh, shin.position, 0.085, 4, hips);
    segment(shin, v(0, -0.39, 0.025), 0.075, 2.8, leg, lateral);
    const shoulder = segment(arm, forearm.position, 0.07, 2.3, chest);
    const elbow = forearm.getWorldPosition(v());
    const elbowAxis = elbow
      .clone()
      .sub(arm.getWorldPosition(v()))
      .cross(rig['Hand' + side].getWorldPosition(v()).sub(elbow));
    segment(
      forearm,
      rig['Hand' + side].position,
      0.062,
      1.6,
      shoulder,
      elbowAxis.lengthSq() > 0.000001 ? elbowAxis.normalize() : lateral
    );
  }
  const item = rig.gear[state.weapon];
  if (terminal) {
    segment(item, v(0, weapons[state.weapon].reach / item.scale.y, 0), 0.038, 1.4);
  }

  // During a recoverable fall, kinematic targets pull the ends of the limbs
  // through damped springs. The first moments of the fall remain unpowered.
  let driven = false,
    carry = 0;
  const handGoal = v();
  function attachSprings() {
    for (const p of parts) {
      const goal = p.node.localToWorld(p.endLocal.clone());
      p.anchor = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(goal.x, goal.y, goal.z)
      );
      world.createImpulseJoint(
        R.JointData.spring(0, p.mass * 115, p.mass * 14, p.delta, zero),
        p.body,
        p.anchor,
        true
      );
    }
    driven = true;
  }
  return {
    terminal,
    update(dt, recovery = 0) {
      if (!terminal) {
        if (!driven && RECOVERY - recovery >= 0.34) attachSprings();
        rig.HandR.getWorldPosition(handGoal);
        for (const p of parts) {
          p.node.getWorldPosition(p.targetPos);
          p.node.getWorldQuaternion(p.targetRot);
          if (p.anchor) p.goal = p.node.localToWorld(p.endLocal.clone());
        }
      }
      carry += clamp(dt, 0, 0.12);
      while (carry >= STEP) {
        for (const p of parts) if (p.anchor) p.anchor.setNextKinematicTranslation(p.goal);
        world.step();
        carry -= STEP;
      }
      const blend = terminal ? 0 : 1 - clamp(recovery / 0.48, 0, 1);
      for (const p of parts) {
        const pos = v().copy(p.body.translation());
        const rot = new Quaternion().copy(p.body.rotation()).multiply(p.initial);
        if (blend) {
          pos.lerp(p.targetPos, blend);
          rot.slerp(p.targetRot, blend);
        }
        p.node.position.copy(p.node.parent.worldToLocal(pos));
        p.node.quaternion.copy(p.node.parent.getWorldQuaternion(new Quaternion()).invert()).multiply(rot);
        p.node.updateWorldMatrix(false, true);
      }
      if (!terminal) item.position.add(rig.HandR.getWorldPosition(v()).sub(handGoal));
    },
    dispose() {
      world.free();
    }
  };
}
