// Coordinates follow the same local X (edge), Y (length), Z (face) frame as the Blender exports.
const models = [
  [
    ['guard', [-0.207, 0.14, 0], [0, 0.177, 0], 0.019],
    ['guard', [0, 0.177, 0], [0.207, 0.14, 0], 0.019],
    ['blade', [-0.032, 0.19, 0], [-0.018, 1.09, 0], 0.014],
    ['blade', [0.032, 0.19, 0], [0.018, 1.09, 0], 0.014],
    ['blade', [0, 0.19, 0], [0, 1.09, 0], 0.016],
    ['point', [0, 1.07, 0], [0, 1.23, 0], 0.012]
  ],
  [
    ['haft', [0, -0.15, 0], [0, 0.54, 0], 0.029],
    ['flanges', [0, 0.59, 0], [0, 0.73, 0], 0.111],
    ['cap', [0, 0.73, 0], [0, 0.81, 0], 0.037]
  ],
  [
    ['haft', [0, -0.5, 0], [0, 1.18, 0], 0.029],
    ['axe blade', [-0.038, 1.15, 0], [-0.23, 1.17, 0], 0.052],
    ['axe edge', [-0.237, 1.04, 0], [-0.251, 1.29, 0], 0.023],
    ['beak', [0.038, 1.165, 0], [0.146, 1.034, 0], 0.023],
    ['spike', [0, 1.21, 0], [0, 1.6, 0], 0.022]
  ]
];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a, b) => a.map((v, k) => v - b[k]);
export const unit = (v) => v.map((n) => n / (Math.hypot(...v) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function weaponShape(segment, id, short = false) {
  if (id < 0) return [{ part: 'fist', line: segment, r: 0.067 }];
  const y = unit(sub(segment[1], segment[0])),
    [dx, dy, dz] = y,
    den = 1 + dy;
  const x = den < 1e-7 ? [-1, 0, 0] : [1 - (dx * dx) / den, -dx, (-dx * dz) / den],
    z = cross(x, y);
  const len = Math.hypot(...sub(segment[1], segment[0])) / (short ? 0.71 : 1);
  const size = len / [1.23, 0.845, 1.6][id];
  const world = ([w, h, d]) =>
    segment[0].map((n, k) => n + size * (x[k] * w + y[k] * h + z[k] * d) - (short ? 0.29 * len * y[k] : 0));
  return models[id].map(([part, a, b, r]) => ({ part, line: [world(a), world(b)], r: r * size, x, y, z }));
}
export function featureName(shape, direction) {
  if (shape.part !== 'blade') return shape.part;
  return Math.abs(dot(direction, shape.z)) > Math.abs(dot(direction, shape.x)) ? 'flat' : 'edge';
}
// Local armor shells measured from the Blender pivots. Their ends leave the joints exposed.
const shells = {
  Head: ['helm', 0.5, 0.157, 0.171, 0.166],
  Chest: ['breastplate', 0.43, 0.249, 0.233, 0.181],
  Hips: ['fauld', 0.04, 0.222, 0.169, 0.165],
  UpperArm: ['spaulder', 0.22, 0.121, 0.145, 0.121],
  Forearm: ['vambrace', 0.47, 0.083, 0.113, 0.083],
  Thigh: ['cuisse', 0.46, 0.116, 0.207, 0.108],
  Shin: ['greave', 0.46, 0.089, 0.18, 0.085]
};
export function armorShell(pose, start, end) {
  const [piece, t, ...radii] = shells[start.replace(/[LR]$/, '')];
  const a = pose[start],
    b = pose[end],
    y = unit(sub(b, a));
  const front = [Math.sin(pose.face || 0), 0, Math.cos(pose.face || 0)];
  const x = unit(cross(y, Math.abs(dot(y, front)) > 0.96 ? [0, 1, 0] : front));
  return { piece, center: a.map((n, k) => n + (b[k] - n) * t), axes: [x, y, cross(x, y)], radii };
}
export function shellSpace(point, shell, width) {
  const d = sub(point, shell.center);
  return shell.axes.map((axis, k) => dot(d, axis) / (shell.radii[k] + width));
}
export function shellNormal(local, shell, width) {
  const weights = local.map((n, k) => n / (shell.radii[k] + width));
  return unit([0, 1, 2].map((i) => weights.reduce((v, w, k) => v + w * shell.axes[k][i], 0)));
}
