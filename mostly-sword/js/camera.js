import { Vector3 } from '../vendor/three.js';

// Slide out over the shoulder as the two bodies meet. Looking straight down
// their shared axis hides the opponent's hands and knees behind the player.
export function duelCamera(player, rival, aspect) {
  const range = Math.hypot(rival.x - player.x, rival.z - player.z);
  const near = Math.max(0, Math.min(1, (2.7 - range) / 1.9));
  const blend = near * near * (3 - 2 * near);
  const narrow = aspect < 0.95 ? 1.2 : 1;
  const offset = (1.12 + 1.35 * blend) * narrow;
  const back = (3.2 - 0.6 * blend) * narrow;
  const s = Math.sin(player.face),
    c = Math.cos(player.face);
  const eye = new Vector3(
    player.x - s * back + c * offset,
    1.92 + 0.3 * blend,
    player.z - c * back - s * offset
  );
  const radius = Math.hypot(eye.x, eye.z);
  if (radius > 9.15) {
    eye.x *= 9.15 / radius;
    eye.z *= 9.15 / radius;
    // An outward-facing wall can shorten the camera arm. Lift the camera
    // progressively so the viewer keeps sight of both grounded fighters.
    eye.y += Math.min(0.94, (radius - 9.15) * 0.55);
  }
  const aim = Math.min(0.49, 1.75 / Math.max(0.01, range));
  const low = player.recovery > 1 || rival.recovery > 1 || player.down || rival.down;
  const target = new Vector3(
    player.x + (rival.x - player.x) * aim,
    low ? 0.79 : 0.97,
    player.z + (rival.z - player.z) * aim
  );
  return [eye, target];
}
