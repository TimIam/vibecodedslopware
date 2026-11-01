// Tuning constants for Quarterly Rollout. Distances are in pixels, times in seconds.

export const TILE = 32;
export const COLS = 30;
export const ROWS = 18;
export const HUD_H = 44;
export const VIEW_W = COLS * TILE;          // 960
export const VIEW_H = ROWS * TILE + HUD_H;  // 620
export const STEP = 1 / 120;                // fixed simulation step

export const PLAYER = {
  radius: 12,
  thrust: 1150,       // push-off acceleration at full grip
  maxSpeed: 400,
  restitution: 0.55,  // how much speed a wall bounce keeps
  maxComposure: 3,
  invuln: 1.2,        // grace period after a hit
  knockback: 300,
  pickupReach: 12,
};

export const SPIN = { duration: 0.4, cooldown: 0.9, impulse: 320, speedBonus: 1.3 };

// drag: how fast speed bleeds away; grip: how much of the push-off reaches the floor
export const FLOORS = {
  carpet: { drag: 2.6, grip: 1 },
  lino:   { drag: 0.8, grip: 0.7 },
  coffee: { drag: 0.15, grip: 0.3 },
  cable:  { drag: 7, grip: 0.6 },
  vent:   { drag: 1.2, grip: 0.85 },
};

export const BOT = { radius: 13, speed: 110, stun: 2.5 };
export const CARL = { radius: 12, speed: 72, sight: 230, stun: 2.5, cooldown: 2, say: 1.6 };
export const PRINTER = { period: 2.4, range: 380, wadSpeed: 210, wadRadius: 6, wadLife: 4 };
export const DRAFT = { accel: 520 };
export const BUMP_SOUND_SPEED = 150;
