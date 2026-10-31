// Game globals (the original's A5 world). Names are descriptive where known; otherwise gXXXX keeps the
// original A5 offset so cross-referencing the disassembly (re/lst2) stays easy.

export const G = {
  // ---- level / world
  level: null,          // g_746c hLevel (Level)
  world: null,          // g_7468 hWorld
  curLevel: 1,          // g_8066
  curLevel2: 1,         // g_13c1e (last level seen by CheckGameEvents)
  levelDone: false,     // g_46ce
  playerDead: false,    // g_80c4
  defaultWorld: true,   // g_7f22 (playing the shipped Episode 1)
  cheats: false,        // g_7f1a (developer mode)

  // ---- view / scrolling
  viewLeft: 0, viewTop: 0,     // g_806a / g_8068 (camera, world coords of playfield top-left)
  viewLeft2: 0, viewTop2: 0,   // g_806e / g_806c (smoothed camera target)
  scrollLeft: 0, scrollTop: 0, // g_6aae / g_6aac (view at last SCROLLTO)
  prevScrollLeft: 0, prevScrollTop: 0, // g_6ab2 / g_6ab0
  scrollStepCount: 0, scrollCooldown: 0, scrollDir: 0, // g_13c22 / g_13c24 / g_13c20
  screenShake: 0,       // g_80c0

  // ---- player
  player: null,         // g_8070
  playerH: 0, playerV: 0, // g_8074 / g_8076 (pos - 32 => top-left of 64x64 face)
  playerDir: 0,         // g_8078
  animOff: 0,           // g_7090 (0/36/72/108 face set)
  tScoot: 0, tSc2: 0, tKick: 0, tInch: 0, // g_7092 g_7094 g_7096 g_7098
  tSwitch: 0,           // g_709a
  tHurt: 0,             // g_709c (damage cooldown)
  tFire: 0,             // g_709e
  g70a0: 0, g70a2: 0, g70a4: 0, g70a6: 0, comfortDelta: 0 /* g_70a8 */, g70aa: 0, kickPower: 0 /* g_70ac */,
  g70ae: 0, g70b8: 0, g70ba: 0,
  bouncedFG: 0, bouncedBG: 0, g70be: 0, g70bf: 0, // g_70bc g_70bd g_70be g_70bf
  oil: 0,               // g_70c0
  egg1: 0, egg1s: 0, egg2: 0, egg2s: 0, egg3: 0, egg3s: 0, // g_70c2..g_70cc typed easter eggs
  wavy: false,          // g_70ce
  impulse: 0,           // g_4400
  kickHit: 0,           // g_8088
  floorType: 1,         // g_46b6 (1 normal, 2 slick?, 3 rough)

  // ---- meters (InitGameGlobals sets these to 72)
  comfort: 72,          // g_46c4
  g46be: 72, g46ba: 72, g46c0: 72, g46bc: 72, legPower: 72 /* g_46c2 */, gf6c4: 72, gf6c8: 72, gf6c6: 72,
  curItem: -1,          // g_46b4 (inventory slot)
  shotType: 0,          // g_46b8
  firing: 0,            // g_808a
  caffeine: 0,          // g_808c
  charge: 0,            // g_808e
  ammoStaple: 0, ammoBadass: 0, ammoShrapnel: 0, // g_8082 g_8084 g_8086
  inventory: Array.from({ length: 12 }, () => ({ id: -1, count: 0 })), // g_8090
  g80c2: 0,
  score: 0,             // g_807a
  dispScore: 0,         // g_807e (displayed, counts up)
  curMusic: -1, g46c6: 0, wonGame: false, saved: null,
  g807e: 0, gf6c0: 0,

  // ---- physics constants (LoadLevelPhysics)
  scootPower: 50,       // g_7e1e
  kickPowerK: 70,       // g_7e20
  frictionA: 245,       // g_7e22
  frictionB: 252,       // g_7e24
  bounciness: 150,      // g_7e26

  // ---- misc
  ripplePhase: 0,       // g_f682
  redrawAll: false,     // g_13c2f
  gf686: false, g46af: false,
  ticks: 0,
};

// Mac preferences record (g_6172...). Defaults from InitPrefs.
export const Prefs = {
  reduceFrameRate: false, g6173: true /* save between levels (web: on by default, silent autosave) */, interlace: false, lineSkip: false, soundOff: false,
  g6178: false, g6179: false,
  scrollMode: 3,
  switchDepth: true, music: true, soundVolume: 9, musicVolume: 7,
  // Each action has two bindings [primary, secondary] (Mac virtual key codes; null = unbound).
  // The original had one key each (the arrows, Space, Control, Option, Tab); WASD etc. are web additions.
  keys: {
    rotLeft: [0x7b, 0x00],    // g_6182: dir+1   Left arrow / A
    rotRight: [0x7c, 0x02],   // g_6184: dir-1   Right arrow / D
    scoot: [0x7d, 0x01],      // g_6186          Down arrow / S
    inch: [0x7e, 0x0d],       // g_6188          Up arrow / W
    kick: [0x31, 0x38],       // g_618a          Space / Shift
    switchItem: [0x3b, 0x0c], // g_618c          Control / Q
    fire: [0x3a, 0x0e],       // g_618e          Option (Alt) / E
    map: [0x30, 0x2e],        // g_6190          Tab / M
  },
  // web additions
  autoDoors: true,      // walking into an unlocked door opens it (no need to turn and kick)
  smoothText: true,     // anti-aliased text
  scale: 'fit',         // 1 | 2 | 'fit'
  filter: 'sharp',      // 'nearest' | 'smooth' | 'sharp' (sharp bilinear)
  touch: 'auto',        // on-screen controls: 'auto' | 'on' | 'off'
  touchLayout: 'overlay', // 'overlay' (over the screen, see-through) | 'beside' (next to / under it)
  playerName: '',
};
