import R from '../vendor/rapier-0.19.3.mjs';

// One shared initialization for the host's motor system and the visual ragdolls.
export const physicsReady = R.init();
await physicsReady;
const zero = { x: 0, y: 0, z: 0 },
  up = { x: 0, y: 1, z: 0 },
  across = { x: 1, y: 0, z: 0 };
const identity = { x: 0, y: 0, z: 0, w: 1 };
// Three coaxial/orthogonal pivots form one articulated shoulder and grip. The
// solver is reused between fighters, with every degree of freedom restored from
// authoritative state. Rebounds and injuries therefore feed the next motor step.
const world = new R.World(zero);
world.numSolverIterations = 8;
const base = world.createRigidBody(R.RigidBodyDesc.fixed());
function hinge(parent, axis, inertia) {
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setCanSleep(false)
      .setAdditionalMassProperties(1, zero, { x: inertia, y: inertia, z: inertia }, identity)
  );
  const joint = world.createImpulseJoint(R.JointData.revolute(zero, zero, axis), parent, body, true);
  joint.configureMotorModel(R.MotorModel.AccelerationBased);
  return { body, joint };
}
const shoulder = hinge(base, up, 5.5),
  yawJoint = hinge(shoulder.body, up, 1.1),
  pitchJoint = hinge(yawJoint.body, across, 0.55);
function yawQ(angle) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}
function motor(joint, value, k) {
  joint.configureMotorPosition(value, k, 1.65 * Math.sqrt(k));
}
function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function driveArm(p, targetYaw, targetPitch, stiffness, dt) {
  const yaw = p.torso + p.yaw,
    wy = p.torsoSpeed + p.wy;
  const y = yawQ(yaw),
    sx = Math.sin(p.pitch / 2),
    cx = Math.cos(p.pitch / 2);
  shoulder.body.setRotation(yawQ(p.torso), true);
  yawJoint.body.setRotation(y, true);
  pitchJoint.body.setRotation({ x: y.w * sx, y: y.y * cx, z: -y.y * sx, w: y.w * cx }, true);
  for (const link of [shoulder, yawJoint, pitchJoint]) {
    link.body.setTranslation(zero, true);
    link.body.setLinvel(zero, true);
  }
  shoulder.body.setAngvel({ x: 0, y: p.torsoSpeed, z: 0 }, true);
  yawJoint.body.setAngvel({ x: 0, y: wy, z: 0 }, true);
  pitchJoint.body.setAngvel({ x: Math.cos(yaw) * p.wp, y: wy, z: -Math.sin(yaw) * p.wp }, true);
  const k = stiffness * 4.2;
  motor(shoulder.joint, targetYaw * 0.34, 0.62 * k + 105);
  motor(yawJoint.joint, targetYaw * 0.66, k);
  motor(pitchJoint.joint, targetPitch, k);
  world.timestep = dt;
  world.step();
  const t = shoulder.body.rotation(),
    h = yawJoint.body.rotation(),
    r = pitchJoint.body.rotation();
  const worldYaw = 2 * Math.atan2(h.y, h.w);
  p.torso = wrap(2 * Math.atan2(t.y, t.w));
  p.yaw = wrap(worldYaw - p.torso);
  // Inverse the parent's yaw to recover local pitch and its angular velocity.
  const half = worldYaw / 2,
    cy = Math.cos(half),
    sy = Math.sin(half);
  p.pitch = wrap(2 * Math.atan2(cy * r.x - sy * r.z, cy * r.w + sy * r.y));
  p.torsoSpeed = shoulder.body.angvel().y;
  const handVel = yawJoint.body.angvel(),
    weaponVel = pitchJoint.body.angvel();
  p.wy = handVel.y - p.torsoSpeed;
  p.wp = weaponVel.x * Math.cos(worldYaw) - weaponVel.z * Math.sin(worldYaw);
}
