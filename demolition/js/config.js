// Real-world numbers the simulation runs on. Metres, kilograms, kilowatts, US dollars.

export const RACK = { w: 0.6, d: 1.07, h: 2.0, U: 0.04445, usableU: 42, mass: 850, bottomU: 0.12 };

// Rows run along X. Fronts face the cold aisles (+Z or -Z); the B/C hot aisle at z=0 is contained.
export const ROWS = [
  { name: 'A', z: -3.405, face: +1, kind: 'compute' },
  { name: 'B', z: -1.135, face: -1, kind: 'storage' },
  { name: 'C', z:  1.135, face: +1, kind: 'gpu' },
  { name: 'D', z:  3.405, face: -1, kind: 'compute' },
];
export const RACKS_PER_ROW = 20;
export const RACK_X0 = -5.7;                 // centres from -5.7 .. +5.7 on a 600 mm pitch

export const HALL = { x: 26.4, z: 16.2, h: 3.6, plenum: 0.6, tile: 0.6 };

export const SERVER = {
  '1u':  { h: 0.0430, d: 0.72, mass: 16,  kw: 0.35, drives: 8,  cost: 12000,  zOff:  0.055, U: 1 },
  '2u':  { h: 0.0874, d: 0.72, mass: 26,  kw: 0.50, drives: 12, cost: 25000,  zOff:  0.055, U: 2 },
  'gpu': { h: 0.1763, d: 0.88, mass: 125, kw: 6.5,  drives: 8,  cost: 300000, zOff: -0.025, U: 4 },
};

export const COST = {
  rack: 3500, door: 450, sidePanel: 300, rackPdu: 1800,
  crac: 85000, cracPanel: 1200, pdu: 45000, pduDoor: 600, ups: 120000, battery: 60000,
  tile: 160, tileLift: 0, glassPanel: 900, trayCables: 2500, fiberCut: 40000, tapBox: 3000,
  agentRecharge: 95000, hdd: 400, cylinder: 18000,
  downtimePerMinute: 9000,           // Ponemon Institute average cost of data-center downtime
};

export const THERMAL = {
  inletStart: 22, setpoint: 22, cracKW: 180, heatCapacityKJperK: 20000,
  throttleC: 35, shutdownC: 45, ashraeMax: 27,
};

export const FIRE = {
  growth: 1 / 45,               // intensity per second (0 -> 1 in ~45 s)
  spreadAt: 0.5, spreadChancePerSec: 0.05,
  vesdaAlert: 0.05, vesdaAction: 0.15, preDischarge: 30, dischargeTime: 10,
  sprinklerFuseAt: 0.7,          // ~68 °C quick-response head
};

export const PLAYER = { height: 1.8, radius: 0.3, eye: 1.62, walk: 3.6, sprint: 6.2, jump: 4.6 };

export const TOOLS = {
  hammer: { name: 'Sledgehammer', range: 2.4, cooldown: 0.6, impulse: 320, serverEject: 2, dmg: 1.0, swing: 0.2 },
  axe:    { name: 'Fire axe',     range: 2.2, cooldown: 0.42, impulse: 140, serverEject: 1, dmg: 0.6, swing: 0.15, cuts: true },
  hands:  { name: 'Hands',        range: 1.8, cooldown: 0.1, impulse: 0,   serverEject: 0, dmg: 0, swing: 0 },
};

export const SHIFT_SECONDS = 600;
