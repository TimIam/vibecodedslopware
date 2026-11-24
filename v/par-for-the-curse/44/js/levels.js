// Level overlays: edits to the hand-written holes, saved as data in levels/front.json and levels/back.json.
// The holes stay code (course.js, back-nine.js). While the course builds, every call to a builder that
// places something (block, prop, wall, bumper, ...) is recorded as an item with a stable id made from where
// it was called and its original arguments. The overlay can patch an item's arguments ("set"), move or
// turn it as a whole ("off", "rot"), or delete it ("del"), and it can add new pieces ("add"). The game and
// the level editor (editor.js, localhost with ?edit) use this one code path. With no edits and no editor,
// nothing here runs and the course builds exactly as written.
//
//   { "version": 1,
//     "items": { "h3:prop:12,5": { "del": true }, "h4:bumper:25,0": { "set": { "0": 26.5 } },
//                "h8:mover:29,1,0": { "off": [0, 0, 1.5], "rot": 0 } },
//     "add": [ { "id": "a1", "hole": 5, "m": "prop", "args": ["tree_pine", 30, 4, { "rot": 1.2, "scale": 1 }] } ] }
import * as THREE from 'three';
import { toon, addOutline } from './assets.js';
import { terrainMat, RISE, PAD } from './course.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const emptyLevel = () => ({ version: 1, items: {}, add: [] });

// The Course methods that place things. Only the outermost call is an item: a block's hanging rocks, a
// sign's collider, a drawbridge's mover all belong to the call that made them.
const WRAP = ['block', 'shoulders', 'underRocks', 'wall', 'prop', 'zone', 'mover', 'sign', 'windsock', 'cone', 'boomGate',
  'patrolGoose', 'bumper', 'drawbridge', 'pressurePlate', 'pushRock', 'lift', 'wrecker', 'road', 'solidify', 'makeCup', 'parkingBay'];
// Cups and checkpoint bays are read by main.js by hole number; the editor shows them but leaves them alone.
export const LOCKED = new Set(['makeCup', 'parkingBay']);
// What an "add" may call: everything whose arguments are plain data.
export const ADDABLE = new Set(['block', 'shoulders', 'underRocks', 'wall', 'prop', 'zone', 'sign', 'cone', 'boomGate', 'patrolGoose',
  'bumper', 'drawbridge', 'pushRock', 'lift', 'wrecker', 'road', 'platform', 'spinner']);
// Pieces that find their own height on whatever is under them: the argument that gives one instead (a
// windsock has none of its own: see exec) and the ones that are its x and z. And the pieces they stand on.
const GROUNDED = { prop: { y: '3.y', xz: ['1', '2'] }, zone: { y: '4.y', xz: ['1', '2'] }, windsock: { y: '3', xz: ['0', '1'] } };
export const groundPaths = m => GROUNDED[m] || null;
const SURFACE = new Set(['block', 'shoulders', 'underRocks', 'wall', 'road', 'loose']);

export const SURFS = ['fairway', 'rough', 'green', 'tee', 'sand', 'moss', 'wood', 'stone', 'rock', 'metal', 'rubber', 'belt'];
// Named looks for blocks, walls and the new builders, so a placed piece can say "stone" in the saved file
// instead of carrying a material. The colours are the ones the holes already use, so toon() hands back the
// very same shared materials.
const LOOKS = {
  grass: () => terrainMat, rough: m => m.roughMat, wood: m => m.woodMat, stone: m => m.stoneMat,
  metal: () => toon(0x9db4cf), steel: () => toon(0x59606b), neon: () => toon(0x7c4dff, { emissive: 0x7c4dff, emissiveIntensity: 0.35 }),
  vermilion: () => toon(0xd95740), harbor: () => toon(0x286e78), cream: () => toon(0xffe9b0), slate: () => toon(0x8a93a6),
};
export const LOOK_NAMES = Object.keys(LOOKS);

/* ---------------- loading ---------------- */
// Never throws: a missing or broken file is an empty overlay, so the course builds as written. A file that
// is there but can't be read (a merge conflict, a typo, a newer version) is noted in level.problem: the
// editor warns about it and won't quietly save over it. Every client in a room has to build the same course
// (push rocks are numbered over the network), so a request that fails fast (a 5xx, a dropped connection) is
// made once more before the course builds without the overlay; a missing or unreadable file is not asked
// for again. All of it takes at most `wait` ms (main.js asks while the models load): a request that hangs
// is not waited for twice.
// In the editor, level.disk is a hash of the file as it was read ('none': there was none), so a save can
// tell whether it changed on disk since (another tab, a git pull).
export async function loadLevel(name, { edit = false, base = 'levels', wait = 7000 } = {}) {
  const url = `${base}/${name}.json`, problems = [], until = Date.now() + wait;
  let got = await fetchOnce(url, wait);
  const left = until - Date.now();
  if (got.again && left > 250) { console.warn(`level overlay ${url}: ${got.fail}; asking again`); got = await fetchOnce(url, left); }
  let data = null;
  if (got.buf) { try { data = JSON.parse(new TextDecoder().decode(got.buf)); } catch (e) { problems.push('it is not valid JSON (' + (e.message || e) + ')'); } }
  else if (got.fail) problems.push(got.fail);
  const lv = new Level(name, tidy(data, problems), edit);
  if (edit) lv.disk = got.missing ? 'none' : got.buf ? await sha256(got.buf) : null;
  if (problems.length) { lv.problem = problems.join('; '); console.warn(`level overlay ${url}: ${lv.problem}`); }
  return lv;
}
async function fetchOnce(url, wait) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl && setTimeout(() => ctl.abort(), wait);
  try {
    const r = await fetch(url, { cache: 'no-cache', signal: ctl?.signal });
    if (r.status === 404) return { missing: true };
    if (!r.ok) return { fail: 'the server answered ' + r.status, again: r.status >= 500 };
    return { buf: await r.arrayBuffer() };
  } catch (e) { return ctl?.signal.aborted ? { fail: `it did not load in time (${(wait / 1000).toFixed(1)} s)` } : { fail: 'it could not be fetched (' + (e.message || e) + ')', again: true }; }
  finally { clearTimeout(timer); }
}
// Hex SHA-256 of a file's bytes, as tools/dev.mjs works it out (null where the browser has no crypto.subtle).
export async function sha256(buf) {
  try { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join(''); } catch (e) { return null; }
}
function tidy(d, problems = []) {
  if (d == null) return emptyLevel();
  if (typeof d !== 'object' || Array.isArray(d)) { problems.push('it is not an overlay object'); return emptyLevel(); }
  if (d.version !== 1) { problems.push(`its version is ${JSON.stringify(d.version)}, not 1`); return emptyLevel(); }
  const items = d.items && typeof d.items === 'object' && !Array.isArray(d.items) ? d.items : {};
  let bad = 0;
  for (const k of Object.keys(items)) if (!items[k] || typeof items[k] !== 'object' || Array.isArray(items[k])) { delete items[k]; bad++; }
  const add = Array.isArray(d.add) ? d.add.filter(a => a && typeof a.id === 'string' && typeof a.m === 'string' && Array.isArray(a.args) && a.hole >= 1 && a.hole <= 9) : [];
  bad += (Array.isArray(d.add) ? d.add.length : 0) - add.length;
  if (bad) problems.push(`${bad} entr${bad === 1 ? 'y' : 'ies'} could not be read and were left out`);
  return { version: 1, items, add };
}
export class Level {
  constructor(name, data, edit) { this.name = name; this.data = data; this.edit = !!edit; this.rec = null; this.problem = null; this.disk = null; }
  get empty() { return !Object.keys(this.data.items).length && !this.data.add.length; }
  // Called by the Course constructor before build(). mats: course.js's private materials, for the looks.
  attach(course, mats) {
    if (this.empty && !this.edit) return null;
    try { return (this.rec = new Recorder(course, this, mats)); } catch (e) { console.warn('level overlay is off:', e); return null; }
  }
}

/* ---------------- small helpers ---------------- */
const num = v => typeof v === 'number' && Number.isFinite(v);
const r1 = v => (Math.round(v * 10) / 10) || 0;
export const r3 = v => (Math.round(v * 1000) / 1000) || 0;
const plainObj = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const opt = (a, i) => (plainObj(a[i]) ? a[i] : {});
const wrapAngle = a => r3(Math.atan2(Math.sin(a), Math.cos(a)));
const jclone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
export function filterIn(a, keep) { let j = 0; for (let i = 0; i < a.length; i++) if (keep(a[i])) a[j++] = a[i]; a.length = j; return a; }
// A point (x, z) turned by da about (cx, cz), the way three.js turns rotation.y.
const turnPt = (x, z, cx, cz, da) => { const c = Math.cos(da), s = Math.sin(da), dx = x - cx, dz = z - cz; return [cx + dx * c + dz * s, cz - dx * s + dz * c]; };
export function getPath(a, path) { let v = a; for (const k of String(path).split('.')) { if (v == null || typeof v !== 'object') return undefined; v = v[k]; } return v; }
// An entry's generic move, as numbers: a hand-edited "off": [1] or "rot": "x" would put colliders at NaN.
const okOff = v => Array.isArray(v) && v.length === 3 && v.every(num);
export const moveOf = e => ({ off: okOff(e?.off) ? e.off : [0, 0, 0], rot: num(e?.rot) ? e.rot : 0 });
const badMove = e => !!e && ((e.off !== undefined && !okOff(e.off)) || (e.rot !== undefined && !num(e.rot)));

// Patch a copy of the arguments by path ("0" is the first argument after H, "4.rot" a key in an options
// object). Only the plain objects and arrays along a patched path are copied: materials, vectors, closures,
// the bridge a pressure plate holds, a windsock's gust, all stay the very objects the hole code passed.
export function patch(args, set) {
  const out = args.slice();
  for (const [path, val] of Object.entries(set || {})) {
    const keys = String(path).split('.');
    let box = out;
    for (let i = 0; i < keys.length - 1 && box; i++) {
      const k = keys[i], cur = box[k];
      const next = Array.isArray(cur) ? cur.slice() : plainObj(cur) ? { ...cur } : cur == null ? (/^\d+$/.test(keys[i + 1]) ? [] : {}) : null;
      if (next) box[k] = next;
      box = next;
    }
    if (!box) continue;
    const last = keys[keys.length - 1];
    if (val === null || val === undefined) { if (Array.isArray(box)) box[last] = undefined; else delete box[last]; }
    else box[last] = jclone(val);
  }
  return out;
}

// The arguments as plain data (for Duplicate), or null if they hold something that is not data (a motion
// closure, a gust, a bridge). A material becomes its look, if it has one.
export function plainArgs(args, rec) {
  const BAD = {};
  const conv = (v, key) => {
    if (v === undefined || v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v ?? null;
    if (Array.isArray(v)) { const r = v.map(x => conv(x)); return r.includes(BAD) ? BAD : r; }
    if (v.isVector3) return [r3(v.x), r3(v.y), r3(v.z)];
    if (plainObj(v)) {
      const o = {};
      for (const k of Object.keys(v)) {
        if (k === 'mat') { const l = rec.lookOf(v[k]); if (l && !v.look) o.look = l; continue; }
        const c = conv(v[k], k); if (c === BAD) return BAD; if (c !== null) o[k] = c;
      }
      return o;
    }
    return BAD;
  };
  const r = conv(args);
  return r === BAD ? null : r;
}

function keyOf(m, a) {
  if (m === 'road') return (Array.isArray(a[0]) && Array.isArray(a[0][0]) ? a[0][0] : []).slice(0, 3).map(r1).join(',');
  if (m === 'makeCup') { const p = a[0]; return p && p.isVector3 ? [p.x, p.y, p.z].map(r1).join(',') : ''; }
  const n = [];
  for (const v of a) if (num(v) && n.length < 3) n.push(r1(v));
  return n.join(',');
}

/* ---------------- extra builders for the palette ---------------- */
// Installed on the course instance (they are not in course.js). `this` is the course. Every argument is
// plain data so they can be saved as adds.
const BUILD = {
  // A slab (top at y) that swings back and forth by (ax, ay, az) metres in the hole's frame.
  platform(H, x, y, z, sx = 4, sy = 0.6, sz = 4, ax = 0, ay = 0, az = 3, speed = 0.7, phase = 0, o = {}) {
    const F = H.frame, surf = o.surf || 'fairway', rec = this.rec;
    const mat = rec ? rec.lookMat(o.look || (surf === 'moss' || surf === 'rough' ? 'rough' : surf === 'wood' ? 'wood' : surf === 'metal' ? 'metal' : 'grass')) : terrainMat;
    return this.mover(H, { size: [sx, sy, sz], surf, mat, under: !!o.under, motion: (t, c) => {
      const s = Math.sin(t * speed + phase);
      c.pos.copy(F.w(x + ax * s, y - sy / 2 + ay * s, z + az * s)); c.quat.copy(F.q);
    } });
  },
  // A bar spinning round a short post, like the back nine's turnstiles.
  spinner(H, x, y, z, length = 6, rate = 0.9, o = {}) {
    const F = H.frame, spin = new THREE.Quaternion(), rec = this.rec;
    const r = this.mover(H, { size: [length, 0.48, 0.38], mat: rec ? rec.lookMat(o.look || 'vermilion') : terrainMat, surf: o.surf || 'wood', under: false, motion: (t, c) => {
      c.pos.copy(F.w(x, y + 0.27, z)); c.quat.copy(F.q).multiply(spin.setFromAxisAngle(UP, t * rate));
    } });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 12), toon(0x59606b)); hub.position.set(x, y + 0.3, z); hub.castShadow = true; addOutline(hub, 0.02); H.group.add(hub);
    return r;
  },
};

/* ---------------- adapters ---------------- */
// How the editor reads and writes each builder's arguments (the ones after H), so moving a piece rewrites its
// real arguments instead of nudging it after the fact.
//   pivot(a, it): the local point [x, y, z] the gizmo sits on.
//   move(a, [dx, dy, dz], it): patches for a move in the hole frame. axes: which axes it can move along.
//   turn(a, da, it): patches for a turn of da about local up (three.js rotation.y); no turn: it can't turn.
//   fields: what the inspector shows, [path, label, type]: type is 'num' (default), 'str', 'bool', 'lines',
//   'props' (a model name) or a list of options.
//   opt: the arguments that may be left empty (the builder has a default for them); need: option keys that
//   may not. Every other argument is required, and option keys are optional (see canBeEmpty).
//   prep(a, rec): the call's arguments as the builder wants them (looks become materials, [x, y, z] belts
//   become vectors). after(H, a, ret): extra pieces built inside the same item.
const first = it => it?.out?.group?.[0] || it?.out?.scene?.[0];
const meshY = it => first(it)?.position.y ?? 0;
const zoneY = it => { const z = it?.out?.zones?.[0]; return z ? z.y - z.frame.o.y : meshY(it); };
const move3 = (ix, iy, iz) => (a, [dx, dy, dz]) => ({ [ix]: a[ix] + dx, [iy]: (a[iy] ?? 0) + dy, [iz]: a[iz] + dz });
const XYZ = [['0', 'x'], ['1', 'y'], ['2', 'z']];
// A look chosen in the editor wins over the material the hole code passed (the code never sets a look).
const lookPrep = i => (a, rec) => {
  const o = a[i];
  if (!plainObj(o) || (!o.look && !Array.isArray(o.belt))) return a;
  const b = a.slice(), oo = { ...o };
  if (o.look) oo.mat = rec.lookMat(o.look);
  if (Array.isArray(o.belt)) oo.belt = V(...o.belt);
  b[i] = oo; return b;
};
export const AD = {
  block: {
    opt: ['5'],
    pivot: a => [(a[0] + a[1]) / 2, (a[4] + (num(a[5]) ? a[5] : a[4])) / 2, (a[2] + a[3]) / 2],
    move: (a, [dx, dy, dz]) => ({ 0: a[0] + dx, 1: a[1] + dx, 2: a[2] + dz, 3: a[3] + dz, 4: a[4] + dy, ...(num(a[5]) ? { 5: a[5] + dy } : {}) }),
    fields: [['0', 'x from'], ['1', 'x to'], ['2', 'z from'], ['3', 'z to'], ['4', 'top y at x from'], ['5', 'top y at x to'], ['6.thick', 'thickness'], ['6.surf', 'surface', SURFS],
      ['6.look', 'look', LOOK_NAMES], ['6.noRock', 'no rocks under', 'bool'], ['6.rockDepth', 'rock depth'], ['6.radius', 'corner radius']],
    prep: lookPrep(6),
  },
  shoulders: {
    axes: 'xy', opt: ['4', '5', '6', '7'],
    pivot: a => { const s = Array.isArray(a[6]) ? a[6] : [-1, 1], out = a[5] ?? 11; return [(a[0] + a[1]) / 2, (a[3] + (num(a[4]) ? a[4] : a[3])) / 2 - 0.35, s.length === 1 ? s[0] * (a[2] + out) / 2 : 0]; },
    move: (a, [dx, dy]) => ({ 0: a[0] + dx, 1: a[1] + dx, 3: a[3] + dy, ...(num(a[4]) ? { 4: a[4] + dy } : {}) }),
    fields: [['0', 'x from'], ['1', 'x to'], ['2', 'inner |z|'], ['3', 'fairway y at x from'], ['4', 'fairway y at x to'], ['5', 'outer |z|'], ['7', 'thickness']],
  },
  underRocks: {
    opt: ['5', '6'],
    pivot: a => [(a[0] + a[1]) / 2, (a[4] + (num(a[6]) ? a[6] : a[4])) / 2, (a[2] + a[3]) / 2],
    move: (a, [dx, dy, dz]) => ({ 0: a[0] + dx, 1: a[1] + dx, 2: a[2] + dz, 3: a[3] + dz, 4: a[4] + dy, ...(num(a[6]) ? { 6: a[6] + dy } : {}) }),
    fields: [['0', 'x from'], ['1', 'x to'], ['2', 'z from'], ['3', 'z to'], ['4', 'top y at x from'], ['6', 'top y at x to'], ['5', 'depth']],
  },
  wall: {
    pivot: a => [(a[0] + a[2]) / 2, (a[4] + (num(opt(a, 5).y1) ? opt(a, 5).y1 : a[4])) / 2, (a[1] + a[3]) / 2],
    move: (a, [dx, dy, dz]) => ({ 0: a[0] + dx, 1: a[1] + dz, 2: a[2] + dx, 3: a[3] + dz, 4: a[4] + dy, ...(num(opt(a, 5).y1) ? { '5.y1': opt(a, 5).y1 + dy } : {}) }),
    turn: (a, da) => {
      const cx = (a[0] + a[2]) / 2, cz = (a[1] + a[3]) / 2, [x0, z0] = turnPt(a[0], a[1], cx, cz, da), [x1, z1] = turnPt(a[2], a[3], cx, cz, da);
      return { 0: x0, 1: z0, 2: x1, 3: z1 };
    },
    fields: [['0', 'x start'], ['1', 'z start'], ['2', 'x end'], ['3', 'z end'], ['4', 'base y'], ['5.y1', 'base y at end'], ['5.h', 'height (built x0.6)'], ['5.t', 'thickness'],
      ['5.wood', 'wood', 'bool'], ['5.surf', 'surface', SURFS], ['5.look', 'look', LOOK_NAMES]],
    prep: lookPrep(5),
  },
  prop: {
    pivot: (a, it) => [a[1], num(opt(a, 3).y) ? opt(a, 3).y : meshY(it), a[2]],
    move: (a, [dx, dy, dz], it) => ({ 1: a[1] + dx, 2: a[2] + dz, ...(dy ? { '3.y': (num(opt(a, 3).y) ? opt(a, 3).y : meshY(it)) + dy } : {}) }),
    turn: (a, da, it) => ({ '3.rot': wrapAngle((num(opt(a, 3).rot) ? opt(a, 3).rot : first(it)?.rotation.y ?? 0) + da) }),
    peek: (it, path) => (path === '3.y' ? meshY(it) : path === '3.rot' ? first(it)?.rotation.y : path === '3.scale' ? first(it)?.scale.x : undefined),
    fields: [['0', 'model', 'props'], ['1', 'x'], ['2', 'z'], ['3.y', 'y (empty: on the ground)'], ['3.rot', 'turn (degrees)', 'deg'], ['3.scale', 'scale'], ['3.trunk', 'trunk radius (trees)'], ['3.solid', 'solid (mesh collider)', 'bool']],
    // prop() builds a 3 m trunk pole for any model given a trunk: only a tree keeps one (a typed or hand-edited
    // trunk on a rock would be an invisible pole). The holes give trunks to trees only.
    prep: a => { const o = opt(a, 3); if (o.trunk == null || /^tree_/.test(a[0])) return a; const b = a.slice(), oo = { ...o }; delete oo.trunk; b[3] = oo; return b; },
    // o.solid: a model that has no collider of its own (fence, island, trophy...) gets one from its triangles.
    after(H, a, ret) { const o = opt(a, 3); if (o.solid && ret) this.solidify(ret, { surf: typeof o.solid === 'string' ? o.solid : 'rock', hole: H.i }); },
  },
  zone: {
    pivot: (a, it) => [a[1], num(opt(a, 4).y) ? opt(a, 4).y : zoneY(it), a[2]],
    move: (a, [dx, dy, dz], it) => ({ 1: a[1] + dx, 2: a[2] + dz, ...(dy ? { '4.y': (num(opt(a, 4).y) ? opt(a, 4).y : zoneY(it)) + dy } : {}) }),
    turn: (a, da) => ({ '4.rot': wrapAngle((opt(a, 4).rot || 0) + da) }),
    peek: (it, path) => (path === '4.y' ? zoneY(it) : undefined),
    fields: [['0', 'type', ['sand', 'water', 'green', 'tee']], ['1', 'x'], ['2', 'z'], ['3', 'radius along x'], ['4.rz', 'radius along z'], ['4.y', 'y (empty: on the ground)'], ['4.rot', 'turn (degrees)', 'deg'], ['4.wobble', 'edge wobble']],
  },
  sign: {
    opt: ['4'],
    pivot: a => [a[0], a[2], a[1]],
    move: (a, [dx, dy, dz]) => ({ 0: a[0] + dx, 1: a[1] + dz, 2: a[2] + dy }),
    turn: (a, da) => ({ 4: wrapAngle((a[4] || 0) + da) }),
    fields: [['3', 'text (| between lines)', 'lines'], ['0', 'x'], ['1', 'z'], ['2', 'y'], ['4', 'turn (degrees)', 'deg']],
  },
  // windsock(x, z, gust) has no height: it stands on the ground under it. A fourth argument, when there is
  // one, is the height it stands at (exec holds the ground there while it builds), like a prop's o.y.
  windsock: {
    opt: ['3'],
    pivot: (a, it) => [a[0], num(a[3]) ? a[3] : meshY(it), a[1]],
    move: (a, [dx, dy, dz], it) => ({ 0: a[0] + dx, 1: a[1] + dz, ...(dy ? { 3: (num(a[3]) ? a[3] : meshY(it)) + dy } : {}) }),
    peek: (it, path) => (path === '3' ? meshY(it) : undefined),
    fields: [['0', 'x'], ['1', 'z'], ['3', 'y (empty: on the ground)']],
  },
  cone: { pivot: a => [a[0], a[1], a[2]], move: move3(0, 1, 2), fields: XYZ },
  boomGate: {
    opt: ['3', '4'],
    pivot: a => [a[0], a[2], a[1]],
    move: (a, [dx, dy, dz]) => ({ 0: a[0] + dx, 1: a[1] + dz, 2: a[2] + dy }),
    fields: [['0', 'x'], ['1', 'road centre z'], ['2', 'road y'], ['3', 'road width'], ['4', 'post side', [1, -1]]],
  },
  patrolGoose: {
    pivot: a => [a[0], a[1], a[2]], move: move3(0, 1, 2),
    fields: [['0', 'x'], ['1', 'ground y'], ['2', 'patrol centre z'], ['3', 'reach'], ['4', 'speed'], ['5', 'phase']],
  },
  bumper: {
    opt: ['2'],
    pivot: a => [a[0], a[2] ?? 0, a[1]],
    move: (a, [dx, dy, dz]) => ({ 0: a[0] + dx, 1: a[1] + dz, 2: (a[2] ?? 0) + dy }),
    fields: [['0', 'x'], ['1', 'z'], ['2', 'base y (not 0: on a steel disc)']],
  },
  drawbridge: {
    pivot: a => [(a[0] + a[1]) / 2, a[2], a[3]],
    move: (a, [dx, dy, dz]) => ({ 0: a[0] + dx, 1: a[1] + dx, 2: a[2] + dy, 3: a[3] + dz }),
    fields: [['0', 'x from'], ['1', 'x to (hinge)'], ['2', 'road y'], ['3', 'road centre z'], ['4', 'width']],
  },
  pressurePlate: { pivot: a => [a[0], a[1], a[2]], move: move3(0, 1, 2), fields: [...XYZ, ['4.rock', 'only a rock holds it', 'bool']] },
  pushRock: { pivot: a => [a[0], a[1], a[2]], move: move3(0, 1, 2), fields: XYZ },
  lift: {
    pivot: a => [(a[0] + a[1]) / 2, a[3], a[2]],
    move: (a, [dx, dy, dz]) => ({ 0: a[0] + dx, 1: a[1] + dx, 2: a[2] + dz, 3: a[3] + dy, 4: a[4] + dy }),
    fields: [['0', 'x from'], ['1', 'x to'], ['2', 'z'], ['3', 'bottom y'], ['4', 'top y'], ['5', 'width']],
  },
  wrecker: { pivot: a => [a[0], a[1], a[2]], move: move3(0, 1, 2), fields: [['0', 'x (also its timing)'], ['1', 'road y'], ['2', 'road centre z'], ['3', 'road width']] },
  road: {
    pivot: a => { const b = new THREE.Box3(); for (const p of a[0] || []) b.expandByPoint(V(p[0], p[1], p[2])); const c = b.getCenter(V()); return [c.x, c.y, c.z]; },
    move: (a, [dx, dy, dz]) => ({ 0: (a[0] || []).map(p => [r3(p[0] + dx), r3(p[1] + dy), r3(p[2] + dz)]) }),
    fields: [['1', 'width']],
  },
  mover: { need: ['0.size.0', '0.size.1', '0.size.2'], fields: [['0.size.0', 'size x'], ['0.size.1', 'size y'], ['0.size.2', 'size z'], ['0.surf', 'surface', SURFS]] },
  makeCup: { pivot: (a, it) => { const p = it.H.frame.local(a[0], V()); return [p.x, p.y, p.z]; } },
  parkingBay: { pivot: a => [(a[1] + a[2]) / 2, a[4], (a[3] - PAD + 0.4) / 2] },
  platform: {
    opt: ['3', '4', '5', '6', '7', '8', '9', '10'],
    pivot: a => [a[0], a[1], a[2]], move: move3(0, 1, 2),
    fields: [...XYZ.map(([p, l]) => [p, l === 'y' ? 'top y' : l]), ['3', 'size x'], ['4', 'thickness'], ['5', 'size z'], ['6', 'swing x'], ['7', 'swing y'], ['8', 'swing z'], ['9', 'speed'], ['10', 'phase'],
      ['11.surf', 'surface', SURFS], ['11.look', 'look', LOOK_NAMES], ['11.under', 'rock under', 'bool']],
  },
  spinner: {
    opt: ['3', '4'],
    pivot: a => [a[0], a[1], a[2]], move: move3(0, 1, 2),
    fields: [...XYZ, ['3', 'length'], ['4', 'spin (rad/s)'], ['5.look', 'look', LOOK_NAMES], ['5.surf', 'surface', SURFS]],
  },
};

// Whether an argument may be empty (null in a saved file, undefined for the builder): an option key ("3.y",
// "on the ground") or an argument with a default. An empty required one (a cone's y) builds at NaN, and one
// NaN collider anywhere sends the ball to NaN on every hole.
export function canBeEmpty(m, path) {
  const ad = AD[m] || {}; path = String(path);
  if (ad.need?.includes(path)) return false;
  return path.includes('.') || !!ad.opt?.includes(path);
}
// A saved value that does not fit its field (a hand-edited file: "thick": "lots") never reaches a builder.
function badValue(m, path, v) {
  if (v === null || v === undefined) return !canBeEmpty(m, path);
  const f = (AD[m]?.fields || []).find(f => f[0] === String(path)), t = f ? f[2] ?? 'num' : null;
  if (!t) return false;
  if (t === 'num' || t === 'deg') return !num(v);      // deg: radians in the file, degrees in the editor
  if (t === 'bool') return typeof v !== 'boolean';
  if (t === 'lines') return !Array.isArray(v) || !v.length || v.some(s => typeof s !== 'string');
  if (t === 'str' || t === 'props') return typeof v !== 'string';
  if (Array.isArray(t)) return !t.includes(v);
  return false;
}
// The usable part of an entry's "set"; what is left out is noted on the item.
function goodSet(it, set) {
  if (!set) return null;
  const bad = Object.keys(set).filter(k => badValue(it.m, k, set[k]));
  if (!bad.length) return set;
  it.broken = 'ignored a bad value for ' + bad.join(', ');
  console.warn(`level overlay: ${it.id} ${it.broken}`);
  return Object.fromEntries(Object.entries(set).filter(([k]) => !bad.includes(k)));
}
const badArgs = (m, a) => [...new Set([...(AD[m]?.fields || []).map(f => f[0]), ...(AD[m]?.need || [])])].filter(p => badValue(m, p, getPath(a, p)));
// Where an edited piece ended up, as numbers? A value can pass every check above and still build at NaN or
// Infinity (a hand-edited file); then it counts as a piece that would not build.
const finite3 = v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
function offTheMap(out, t) {
  const k = { pos: V(), quat: new THREE.Quaternion() };
  for (const c of out.cols || []) {
    if (!finite3(c.pos) || (!c.aabb.isEmpty() && !(finite3(c.aabb.min) && finite3(c.aabb.max)))) return true;
    if (c.motion) { k.pos.copy(c.pos); k.quat.copy(c.quat); try { c.motion(t, k); } catch (e) { return true; } if (!finite3(k.pos)) return true; }
  }
  for (const o of [...(out.group || []), ...(out.scene || [])]) if (!finite3(o.position)) return true;
  for (const z of out.zones || []) if (!Number.isFinite(z.x + z.y + z.z + z.rx + z.rz)) return true;
  return false;
}

/* ---------------- the recorder ---------------- */
class Recorder {
  constructor(course, level, mats = {}) {
    this.C = course; this.level = level; this.data = level.data; this.mats = mats;
    this.items = new Map(); this.list = [];
    this.byObj = new WeakMap(); this.byCol = new WeakMap();
    this.ownAnim = new WeakSet(); this.ownZone = new WeakSet(); this.ownSensor = new WeakSet();
    this.needs = new Map();      // sensor -> the inline pieces it needs (see looseScan)
    this.depth = 0; this.scope = null; this.count = new Map(); this.padK = new Map(); this.padN = 0;
    this.live = false;      // true once the course is built: edits from the editor
    this.onThings = null;   // the editor's hook for wreckable things made or revived after the build
    this.orphans = [];      // saved edits whose ids match nothing the code built (the holes changed)
    this.relays = [];       // colliders that throw the ball to a point on another piece (see trackRelays)
    // Deleted meshes wait here, out of the scene. They keep a parent because wreck.js asks for one.
    this.grave = new THREE.Group();
    // Where a deleted wreckable thing stands (see bury): far below the course, out of everyone's reach.
    this.nowhere = new THREE.Object3D(); this.nowhere.name = 'level-dead-thing'; this.nowhere.position.set(0, -1e5, 0); this.grave.add(this.nowhere);
    this.orig = {};
    const proto = Object.getPrototypeOf(course);
    for (const m of [...WRAP, ...Object.keys(BUILD)]) {
      const fn = BUILD[m] || proto[m];
      if (typeof fn !== 'function') continue;
      this.orig[m] = fn;
      course[m] = (...a) => this.call(m, a);
    }
    const lk = this.looks = new Map();
    for (const n of LOOK_NAMES) { const m = LOOKS[n](mats); if (m && !lk.has(m)) lk.set(m, n); }
  }
  lookMat(name) { return (LOOKS[name] || LOOKS.grass)(this.mats) || terrainMat; }
  lookOf(mat) { return this.looks.get(mat) || null; }
  entry(it) { return it.add ? null : this.data.items[it.id] || null; }

  /* ----- hooks called by course.js build() ----- */
  // A scope is the pads, one hole's builder, or one hole's cart road and bay. kind: 'pads' | 'hole' | 'road'.
  begin(kind, H) {
    try {
      const C = this.C, W = C.world, groups = kind === 'pads' ? C.H.map(h => h.group) : [H.group];
      this.scope = { kind, H, name: H ? 'h' + H.i : 'p', groups, kids: new Set(groups.flatMap(g => g.children)), cols: new Set(W.cols),
        anim: C.animators.length, zones: new Set(C.zones), sensors: new Set(C.sensors), solids: [] };
    } catch (e) { console.warn('level overlay:', e); this.scope = null; }
  }
  end() {
    const S = this.scope; this.scope = null;
    if (!S) return;
    try { for (const it of S.items || []) this.noteFix(it); this.looseScan(S); this.sweep(); } catch (e) { console.warn('level overlay:', e); }
  }
  // New pieces go in after the cart road (so puzzles exist and are not reset under them) and before the grass.
  applyAdds() {
    const undo = this.clampGround();
    try { for (const a of this.data.add) this.buildAdd(a); } catch (e) { console.warn('level overlay:', e); } finally { undo(); }
  }
  finish() {
    try {
      this.sweep();
      this.orphans = Object.keys(this.data.items).filter(id => !this.items.has(id));
      if (this.orphans.length) console.warn(`level overlay: ${this.orphans.length} saved edit(s) match nothing in the code (the holes changed?):`, this.orphans);
    } catch (e) { console.warn('level overlay:', e); }
    this.live = true;
  }

  /* ----- the wrapper round every builder ----- */
  call(m, a) {
    const fn = this.orig[m];
    if (this.depth || !this.scope) return this.inner(fn, a);
    if (m === 'solidify') return this.solid(fn, a);
    return this.record(m, a[0], a.slice(1));
  }
  inner(fn, a) { this.depth++; try { return fn.apply(this.C, a); } finally { this.depth--; } }
  // solidify() called by a hole's own code: the collider belongs to whatever item made the object. When
  // that is a builder's piece (a rest stop's bench, made solid after prop() returns), the call is noted on
  // the item too, so a live rebuild can make the new piece solid the same way (replay).
  solid(fn, a) {
    // Nothing to make solid: an edit left the piece unbuilt (a rest stop's bench moved off its pad with its y
    // emptied: prop() found no ground and returned null). The hole's code never passes null itself, so this
    // only happens with an overlay. The call is still noted on that prop (the builder call just before), so
    // a live rebuild that does build it makes it solid, as a reload would.
    if (!a[0]) {
      const last = this.list[this.list.length - 1];
      if (last && last.m === 'prop' && !last.add && last.ret == null && !last.follow) last.follow = [{ path: [0], o: a[1] }];
      return null;
    }
    const col = this.inner(fn, a), it = this.ownerOf(a[0]);
    if (it) { this.adopt(it, col); const path = this.pathTo(it, a[0]); if (path && !it.loose) (it.follow ||= []).push({ path, o: a[1] }); }
    else (this.scope.solids ||= []).push({ obj: a[0], col });
    return col;
  }
  // Where obj sits in an item's pieces, as indices: [which piece, child, grandchild...], and back.
  pathTo(it, obj) {
    const roots = [...(it.out.group || []), ...(it.out.scene || [])], path = [];
    for (let o = obj; o; o = o.parent) { const r = roots.indexOf(o); if (r >= 0) return [r, ...path]; if (!o.parent) break; path.unshift(o.parent.children.indexOf(o)); }
    return null;
  }
  walkPath(it, path) {
    let o = [...(it.out.group || []), ...(it.out.scene || [])][path[0]];
    for (let i = 1; o && i < path.length; i++) o = o.children[path[i]];
    return o || null;
  }
  meshList(it) { const L = []; for (const obj of [...(it.out.group || []), ...(it.out.scene || [])]) obj.traverse(m => { if (m.isMesh) L.push(m); }); return L; }
  // What the hole's code did to an item after its builder returned, found when the scope ends: the tee
  // markers take their pad's colour. Noted by mesh (in traversal order) and the material it had.
  noteFix(it) {
    const M = it.mats0; it.mats0 = null;
    if (!M) return;
    const L = this.meshList(it), fix = [];
    if (L.length !== M.length) return;
    L.forEach((m, i) => { if (m.material !== M[i]) fix.push([i, M[i]?.name ?? '', m.material]); });
    if (fix.length) it.fix = fix;
  }
  // A normal load runs that code again by itself; a live rebuild (only the builder runs) redoes it here, so
  // the editor and its test drive show what a reload will.
  replay(it) {
    if (it.deleted) return;
    const L = it.fix ? this.meshList(it) : [];
    for (const [i, name, mat] of it.fix || []) { const m = L[i]; if (m && (m.material?.name ?? '') === name) m.material = mat; }
    for (const f of it.follow || []) { const obj = this.walkPath(it, f.path); if (obj) { const col = this.inner(this.orig.solidify, [obj, f.o]); if (col) this.adopt(it, col); } }
  }
  ownerOf(o) { for (; o; o = o.parent) { const it = this.byObj.get(o); if (it) return it; } return null; }
  makeId(sc, m, key) {
    const base = `${sc}:${m}:${key}`, n = (this.count.get(base) || 0) + 1;
    this.count.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  }
  scopeName(H) {
    const S = this.scope;
    if (S.kind !== 'pads') return S.name;
    // Pads are built on stand-in hole objects, one per pad, in order. The welcome sign's comes after the
    // loop but stands on the first tee, so it shares pad 0. A cup is made with the real hole it belongs to:
    // it goes with the pad being built.
    if (this.C.H.includes(H)) return 'p' + (this.padCur ?? 0);
    if (!this.padK.has(H)) this.padK.set(H, this.padN > 0 && H.group === this.C.H[0].group ? 0 : this.padN++);
    this.padCur = this.padK.get(H);
    return 'p' + this.padCur;
  }
  record(m, H, args) {
    let it;
    try { it = { id: null, m, scope: this.scopeName(H), H, hole: H.i, origArgs: args, args, out: {}, ret: undefined }; }
    catch (e) { console.warn('level overlay:', e); return this.inner(this.orig[m], [H, ...args]); }
    // A mover's arguments are a closure: its id is where its collider starts (t = 0), in the hole frame.
    const moverKey = p => { const l = H.frame.local(p, V()); return [l.x, l.y, l.z].map(v => Math.round(v * 2) / 2 || 0).join(','); };
    if (m === 'mover') {
      try { const c = { pos: V(), quat: new THREE.Quaternion() }; args[0].motion(0, c); it.id = this.makeId(it.scope, m, moverKey(c.pos)); } catch (err) { it.id = null; }
    } else it.id = this.makeId(it.scope, m, keyOf(m, args));
    let e = it.id ? this.data.items[it.id] : null;
    it.setKey = JSON.stringify(e?.set || null);
    const set = goodSet(it, e?.set), edited = !!(set && Object.keys(set).length);
    // An edited piece looks for the ground the way the editor's live rebuilds do (clampGround), so it lands
    // where it was seen: probing from 40 m, a prop moved under the pad four holes up would land on that pad.
    const undo = edited ? this.clampGround() : null;
    let ret;
    try { ret = this.exec(it, edited ? patch(args, set) : args); } finally { undo?.(); }
    // Its materials as built, to find what the hole's code changes afterwards (noteFix, when the scope ends).
    it.mats0 = this.meshList(it).map(m => m.material); (this.scope.items ||= []).push(it);
    if (!it.id) { try { it.id = this.makeId(it.scope, m, moverKey(ret.col.pos)); } catch (err) { it.id = this.makeId(it.scope, m, '?'); } e = this.data.items[it.id]; }
    this.register(it);
    if (e) this.applyEntry(it, e);
    return ret;
  }
  register(it) {
    if (!AD[it.m]?.pivot && !it.loose) it.pivot0 = this.boxPivot(it);
    this.items.set(it.id, it); this.list.push(it);
  }
  applyEntry(it, e) {
    if (badMove(e)) { it.broken = 'ignored a bad off/rot value'; console.warn(`level overlay: ${it.id} ${it.broken}`); }
    if (it.lockMove && moveOf(e).off.some(v => v)) { it.broken = 'ignored its move (' + it.lockMove + ')'; console.warn(`level overlay: ${it.id} ${it.broken}`); }
    try { if (e.del) this.kill(it); else if (e.off || e.rot) this.xform(it); }
    catch (err) { console.warn('level overlay: could not apply', it.id, err); }
  }
  // Build an item: snapshot the registries, call the builder, and keep what appeared as its outputs. If the
  // edited arguments break the builder, throw away what it half built and build it as the code wrote it.
  exec(it, args) {
    const C = this.C, fn = this.orig[it.m], ad = AD[it.m] || {};
    it.unbuilt = false;
    if (it.add) {
      const bad = badArgs(it.m, args);
      if (bad.length) { it.broken = 'bad value for ' + bad.join(', '); console.warn(`level overlay: add ${it.id} has a ${it.broken}`); it.args = args; it.out = {}; it.ret = undefined; it.deleted = true; return undefined; }
    }
    const snap = this.snap(it.H);
    let ret, err = null;
    this.depth++;
    try {
      const a = (ad.prep ? ad.prep(args, this) : args).map(v => (v === null ? undefined : v));      // saved data has null where code had undefined
      const hold = it.m === 'windsock' && num(a[3]) ? this.swapGround(() => a[3]) : null;      // a pinned windsock (see AD.windsock)
      try { ret = fn.call(C, it.H, ...a); } finally { hold?.(); }
      if (ad.after) ad.after.call(C, it.H, args, ret);
      // A placed bumper bats carts too: main.js looks for them in puzzles.bumpers, where the holes file theirs.
      if (it.add && it.m === 'bumper' && ret && C.puzzles?.bumpers) C.puzzles.bumpers.push(ret);
    } catch (e) { err = e; } finally { this.depth--; }
    it.out = this.diff(snap);
    // A prop or windsock with no ground under it is not built (prop() returns null): not an error, and a
    // normal load does the same, but the editor says so instead of letting the piece just vanish.
    it.unbuilt = !err && !!GROUNDED[it.m] && it.m !== 'zone' && !it.out.group?.length && !it.out.scene?.length;
    if (!err && (args !== it.origArgs || it.add) && offTheMap(it.out, C.world.t)) err = new Error('it would stand at a position that is not a number');
    if (err) {
      if (args === it.origArgs && !it.add) {      // the course's own call failed: fail as it would have without an overlay
        if (this.live) { it.deleted = false; this.kill(it); }
        throw err;
      }
      console.warn(`level overlay: ${it.id || it.m} would not build from its edited arguments:`, err);
      it.deleted = false; this.kill(it);
      it.broken = String(err && err.message || err);
      if (it.add) { it.args = args; it.ret = undefined; return undefined; }
      this.release(it); it.deleted = false;
      return this.exec(it, it.origArgs);
    }
    it.args = args; it.ret = ret; it.deleted = false;
    this.own(it);
    return ret;
  }
  snap(H) {
    const C = this.C, W = C.world;
    const L = [['group', H.group.children], ['scene', C.scene.children], ['cols', W.cols], ['movers', W.movers], ['anim', C.animators], ['zones', C.zones],
      ['things', C.things], ['sensors', C.sensors], ['cam', C.camBlockers], ['winds', C.winds]];
    if (C.lawns) L.push(['lawns', C.lawns]);
    if (C.puzzles) for (const k in C.puzzles) L.push(['pz.' + k, C.puzzles[k]]);
    return { lists: L.map(([k, a]) => [k, a, a.length]), lawns: !!C.lawns };
  }
  diff(snap) {
    const out = {};
    for (const [k, a, n] of snap.lists) if (a.length > n) out[k] = a.slice(n);
    if (!snap.lawns && this.C.lawns?.length) out.lawns = this.C.lawns.slice();      // block() made the list just now
    return out;
  }
  own(it) {
    const o = it.out, C = this.C, W = C.world;
    for (const obj of [...(o.group || []), ...(o.scene || [])]) this.byObj.set(obj, it);
    for (const c of o.cols || []) this.byCol.set(c, it);
    for (const a of o.anim || []) this.ownAnim.add(a);
    for (const z of o.zones || []) this.ownZone.add(z);
    for (const s of o.sensors || []) this.ownSensor.add(s);
    // A mover built mid-game starts from where it was at t=0: step it to now, or its first step throws the ball.
    if (this.live) for (const c of o.cols || []) if (c.motion) { c.step(W.t, 1 / 240); c.prevInv.copy(c.inv); }
    // Run its animators once so animated pieces stand where they will be drawn (movers copy their collider).
    for (const a of o.anim || []) try { a(C.t, 0); } catch (e) {}
    if (this.live && o.things?.length && this.onThings) this.onThings(o.things);
  }
  adopt(it, col) {
    (it.out.cols ||= []).push(col); if (col.motion) (it.out.movers ||= []).push(col);
    this.byCol.set(col, it);
    if (it.deleted) this.dropCols([col]);
  }

  /* ----- meshes the hole code builds inline (windmill, mushrooms, cannon, pegs, turntable, beacons...) ----- */
  looseScan(S) {
    const C = this.C, W = C.world, made = [];
    S.groups.forEach((g, gi) => {
      const H = S.kind === 'pads' ? C.H[gi] : S.H, sc = S.kind === 'pads' ? 'p' + gi : S.name;
      for (const obj of g.children) {
        if (S.kids.has(obj) || this.byObj.has(obj) || obj.isInstancedMesh) continue;
        // The id leaves out the height: inline pieces often stand on whatever is below (a back-nine beacon
        // takes groundY of its deck), so raising the deck would orphan the beacon's edit. #n tells apart two
        // pieces stacked at one spot.
        const p = obj.position, name = obj.name || obj.type;
        const it = { id: this.makeId(sc, 'loose', `${name}:${r1(p.x)},${r1(p.z)}`), m: 'loose', loose: true, name, scope: sc, H, hole: H.i, origArgs: [], args: [], out: { group: [obj] } };
        this.byObj.set(obj, it); made.push(it); this.register(it);
      }
    });
    // solidify() on an inline mesh: the collider goes with that mesh.
    for (const { obj, col } of S.solids) { const it = this.ownerOf(obj); if (it) this.adopt(it, col); }
    // The hole's own animators place some meshes (the lane geese, the turntable): let them, once.
    const anims = C.animators.slice(S.anim).filter(a => !this.ownAnim.has(a) && !a.was);
    const run = t => { for (const a of anims) try { a(t, 0); } catch (e) {} };
    run(C.t);
    if (!made.length) { this.trackRelays(S); return; }
    // Colliders, zones and sensors the hole code made inline go with the loose mesh they sit in (the
    // smallest one, if several).
    const boxes = made.map(it => [it, this.worldBox(it).expandByScalar(0.3)]).filter(([, b]) => !b.isEmpty());
    const size = V(), home = p => {
      let best = null, bv = Infinity;
      for (const [it, b] of boxes) if (b.containsPoint(p)) { b.getSize(size); const v = size.x * size.y * size.z; if (v < bv) { bv = v; best = it; } }
      return best;
    };
    for (const c of W.cols) {
      if (S.cols.has(c) || this.byCol.has(c)) continue;
      if (c.motion) { c.step(W.t, 1 / 240); c.prevInv.copy(c.inv); }      // inline movers have no position until stepped
      const it = home(c.kind === 'mesh' ? c.aabb.getCenter(V()) : c.pos);
      if (it) this.adopt(it, c);
    }
    for (const zn of C.zones) if (!S.zones.has(zn) && !this.ownZone.has(zn)) { const it = home(zn.frame.w(zn.x, zn.y - zn.frame.o.y, zn.z)); if (it) { (it.out.zones ||= []).push(zn); this.ownZone.add(zn); } }
    for (const s of C.sensors) {
      if (S.sensors.has(s) || this.ownSensor.has(s)) continue;
      const it = s.p ? home(s.p) : null;
      if (it) { (it.out.sensors ||= []).push(s); this.ownSensor.add(s); }
      // A sensor that works other pieces too (hole 7's cannon swings and fires from its barrel, a piece of
      // its own; the sensor sits in the catch ring) is off while any of them is deleted: a cannon with no
      // barrel must not fire from where the barrel was. It moves with the piece it sits in.
      const needs = [...new Set(Object.values(s).filter(v => v?.isObject3D).map(v => this.ownerOf(v)).filter(o => o && o !== it && made.includes(o)))];
      if (needs.length) { this.needs.set(s, [...(it ? [it] : []), ...needs]); for (const o of needs) (o.out.deps ||= []).push(s); this.ownSensor.add(s); }
    }
    const roam = this.roamPivots(made, run);
    // A piece that carries a cup the code moves every frame (hole 9's turntable) can turn in place, but
    // moved, it would ride off and leave the cup turning where it was.
    const hole = S.kind !== 'pads' && C.holes?.[S.H.i];
    if (hole?.cupMoving && hole.cup) for (const it of made) if (this.worldBox(it).expandByScalar(0.2).containsPoint(hole.cup)) it.lockMove = 'the cup rides it, and the hole\'s code moves the cup round the spot it was built at';
    for (const it of made) it.pivot0 = roam.get(it) || this.boxPivot(it);
    this.trackRelays(S);      // before the saved moves of inline pieces: it looks at them as the code built them
    for (const it of made) { const e = this.data.items[it.id]; if (e) this.applyEntry(it, e); }
  }
  // Hole 3's mushrooms throw a ball that lands on one in an arc to the next cap: the cap's collider holds
  // that world point (relay, see physics.js). The point belongs to the piece the ball lands on there, so it
  // goes where that piece goes: moving or turning the whole staircase, or one mushroom, keeps the chain.
  // The piece is found once, as the hole's code built it (ride undoes any saved move first), so a normal
  // load and the editor agree on it.
  trackRelays(S) {
    for (const c of this.C.world.cols) {
      if (!c.relay || S.cols.has(c) || this.relays.some(r => r.c === c)) continue;
      const p0 = c.relay.clone();
      this.relays.push({ c, p0, home: this.landsOn(p0, this.byCol.get(c)) });
    }
    this.followRelays();
  }
  // The piece whose top is at a code-built world point: a collider of it (deleted or not, so the answer
  // does not depend on what is deleted) has its top within 0.6 m of the point, right over or under it.
  landsOn(p0, self) {
    let best = null, bd = 0.6;
    const q = V();
    for (const o of this.list) {
      if (o === self || LOCKED.has(o.m)) continue;
      this.ride(o, p0, q);
      for (const c of o.out.cols || []) {
        const a = c.aabb;
        if (c.motion || a.isEmpty() || q.x < a.min.x - 0.3 || q.x > a.max.x + 0.3 || q.z < a.min.z - 0.3 || q.z > a.max.z + 0.3) continue;
        const d = Math.abs(a.max.y - q.y);
        if (d < bd) { bd = d; best = o; }
      }
    }
    return best;
  }
  // Where a code-built world point p0 on piece o is now (into out): moved by the piece's arguments (by as
  // much as its pivot moved), then by its offsets and turn (xform's matrix, also the gizmo's drag preview).
  ride(o, p0, out) {
    out.copy(p0);
    const ad = AD[o.m];
    if (ad?.move) {
      let a = null, b = null;
      try { a = ad.pivot(o.origArgs, o); b = ad.pivot(o.args, o); } catch (e) {}
      if (a?.every(num) && b?.every(num)) { const F = o.H.frame; out.add(F.w(b[0], b[1], b[2])).sub(F.w(a[0], a[1], a[2])); }
    }
    if (o.xf) out.applyMatrix4(o.xf.DW);
    return out;
  }
  // Kept up after every move, rebuild, delete and restore. A deleted piece takes no ball: its relay goes
  // back to the code's point (so it never depends on where the deleted piece was last moved to).
  followRelays() { for (const r of this.relays) if (r.home) { if (r.home.deleted) r.c.relay.copy(r.p0); else this.ride(r.home, r.p0, r.c.relay); } }
  // An inline piece that an animator walks about the hole (the lane geese patrol from a random phase)
  // stands somewhere else at t = 0 on every load and on every player's screen, so the middle of its box
  // then would turn a saved "rot" about a different point each time. It turns about the middle of where it
  // walks instead: the middle of the ground its origin covers over two minutes of its animation, at the
  // height of its feet, sampled finely enough that the sampling error (well under 0.1 mm across, a few mm
  // up and down for a goose's waddle) disappears in the rounding to 1 cm. Pieces that only spin or bob in
  // place keep their box pivot.
  roamPivots(made, run) {
    const out = new Map(), t0 = this.C.t, root = it => it.out.group[0];
    const at = new Map(made.map(it => [it, root(it).position.clone()])), roams = new Set();
    for (const dt of [1.7, 5.3, 11.9]) { run(t0 + dt); for (const it of made) { const p = root(it).position, q = at.get(it); if (Math.hypot(p.x - q.x, p.z - q.z) > 1e-3) roams.add(it); } }
    if (roams.size) {
      const lo = new Map(), hi = new Map();
      for (const it of roams) { lo.set(it, V(Infinity, Infinity, Infinity)); hi.set(it, V(-Infinity, -Infinity, -Infinity)); }
      for (let k = 0; k <= 6000; k++) { run(t0 + k * 0.02); for (const it of roams) { const p = root(it).position; lo.get(it).min(p); hi.get(it).max(p); } }
      const cm = v => (Math.round(v * 100) / 100) || 0;
      for (const it of roams) { const a = lo.get(it), b = hi.get(it); out.set(it, V(cm((a.x + b.x) / 2), cm(a.y), cm((a.z + b.z) / 2))); }
    }
    run(t0);
    return out;
  }

  /* ----- soft delete ----- */
  // Meshes leave the scene, colliders leave the world (spliced: gates switch theirs back on every frame),
  // animators become no-ops in place, zones, sensors and puzzle entries are dropped. Wreckable things stay in
  // course.things (their indices are sent over the network) but are buried (see bury).
  kill(it) {
    if (it.deleted) return;
    const C = this.C, o = it.out;
    it.deleted = true;
    it.parents = new Map();
    for (const obj of [...(o.group || []), ...(o.scene || [])]) {
      const top = it.wraps?.get(obj) || obj;
      it.parents.set(top, top.parent);
      obj.userData.levelDead = true;
      this.grave.add(top);
    }
    if (o.cam) { const s = new Set(o.cam); filterIn(C.camBlockers, x => !s.has(x)); }
    this.dropCols(o.cols || []);
    for (const a of o.anim || []) { const i = C.animators.indexOf(a); if (i >= 0) { const z = () => {}; z.was = a; C.animators[i] = z; } }
    for (const k of ['zones', 'sensors', 'winds', 'lawns']) if (o[k] && C[k]) { const s = new Set(o[k]); filterIn(C[k], x => !s.has(x)); }
    if (o.deps) { const s = new Set(o.deps); filterIn(C.sensors, x => !s.has(x)); }
    for (const k in o) if (k.startsWith('pz.') && C.puzzles?.[k.slice(3)]) { const s = new Set(o[k]); filterIn(C.puzzles[k.slice(3)], x => !s.has(x)); }
    for (const th of o.things || []) this.bury(th);
    this.sweep();
    this.followRelays();
  }
  // A deleted wreckable thing. wreck.js finds things by where they stand (near()) and every frame main.js
  // hits whatever is near a moving cart: a thing with no hit zones never takes the hit (so never starts its
  // cool-down) and the cart would tell the room it hit it four times a second. So an empty object far below
  // the course stands in for its mesh: near() never finds it, now or after wreck.js prepares the things
  // when the build is done (it measures each one from its obj).
  bury(th) {
    if (th.kind !== 'dead') { th.liveKind = th.kind; th.liveObj = th.obj; }
    th.kind = 'dead'; th.obj = this.nowhere; th.zones = []; th.reach = 0;
    if (th.p) th.p.copy(this.nowhere.position);
  }
  dropCols(cols) {
    if (!cols.length) return;
    const W = this.C.world, dead = new Set(cols);
    for (const c of cols) c.dead = true;
    filterIn(W.cols, c => !dead.has(c)); filterIn(W.movers, c => !dead.has(c));
  }
  // Undo a soft delete (inline meshes; built items are simply built again).
  revive(it) {
    if (!it.deleted) return;
    const C = this.C, W = C.world, o = it.out;
    for (const [top, parent] of it.parents || []) (parent && parent !== this.grave ? parent : it.H.group).add(top);
    for (const obj of [...(o.group || []), ...(o.scene || [])]) delete obj.userData.levelDead;
    if (o.cam) C.camBlockers.push(...o.cam);
    for (const c of o.cols || []) { c.dead = false; W.cols.push(c); if (c.motion) { W.movers.push(c); c.step(W.t, 1 / 240); c.prevInv.copy(c.inv); } }
    const was = new Set(o.anim || []);
    for (let i = 0; i < C.animators.length; i++) { const a = C.animators[i]; if (a.was && was.has(a.was)) C.animators[i] = a.was; }
    for (const k of ['zones', 'winds', 'lawns']) if (o[k] && C[k]) C[k].push(...o[k]);
    // A sensor comes back once every piece it needs is back (see looseScan).
    for (const s of [...(o.sensors || []), ...(o.deps || [])]) if (!C.sensors.includes(s) && (this.needs.get(s) || []).every(x => x === it || !x.deleted)) C.sensors.push(s);
    for (const k in o) if (k.startsWith('pz.') && C.puzzles?.[k.slice(3)]) C.puzzles[k.slice(3)].push(...o[k]);
    for (const th of o.things || []) if (th.kind === 'dead' && th.liveObj) { th.kind = th.liveKind; th.obj = th.liveObj; }
    it.deleted = false; it.parents = null;
    if (o.things?.length && this.onThings) this.onThings(o.things);
  }
  // Puzzle entries whose collider or mesh is gone. Callers file some return values themselves after the
  // builder returns (ring4 pushes its bumpers into puzzles.bumpers), so this also notes where they went.
  sweep() {
    const P = this.C.puzzles; if (!P) return;
    const dead = e => e && (e.dead || e.col?.dead || e.stop?.dead || e.mesh?.userData?.levelDead);
    for (const k in P) {
      for (const e of P[k]) { const it = e && typeof e === 'object' ? this.byCol.get(e) : null; if (it && it.ret === e && !it.out['pz.' + k]?.includes(e)) it.filed = k; }
      filterIn(P[k], e => !dead(e));
    }
  }

  /* ----- generic move: off (local metres) and rot (about local up, round the item's pivot) ----- */
  // Meshes in the hole's group get a wrapper group that carries the move, so animators that set their
  // position every frame (geese, sails) keep working inside it. Colliders, zones and sensors are moved from
  // their original poses; a moving collider's motion gets the move applied after it.
  xform(it, off, rot) {
    if (it.deleted) return;
    const mv = moveOf(this.entry(it));
    off = it.lockMove ? [0, 0, 0] : off || mv.off; rot = rot ?? mv.rot;
    const C = this.C, W = C.world, F = it.H.frame, base = it.base || (it.base = this.capture(it)), p = base.pivot;
    const D = new THREE.Matrix4().makeTranslation(off[0] + p.x, off[1] + p.y, off[2] + p.z)
      .multiply(new THREE.Matrix4().makeRotationY(rot)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
    const xf = it.xf || (it.xf = { DW: new THREE.Matrix4(), qW: new THREE.Quaternion() });
    xf.DW.copy(F.m).multiply(D).multiply(F.inv); xf.qW.setFromAxisAngle(UP, rot);
    for (const obj of it.out.group || []) {
      let w = (it.wraps ||= new Map()).get(obj);
      if (!w) { w = new THREE.Group(); w.name = 'level-move'; w.matrixAutoUpdate = false; obj.parent.add(w); w.add(obj); it.wraps.set(obj, w); this.byObj.set(w, it); }
      w.matrix.copy(D); w.matrixWorldNeedsUpdate = true;
    }
    for (const [obj, pos, q] of base.scene) { obj.position.copy(pos).applyMatrix4(xf.DW); obj.quaternion.copy(q).premultiply(xf.qW); }
    for (const [c, pos, q] of base.cols) {
      if (c.motion) {
        if (!c.levelMotion) { const m0 = c.levelMotion = c.motion; c.motion = (t, k) => { k.pos.copy(pos); k.quat.copy(q); m0(t, k); k.pos.applyMatrix4(xf.DW); k.quat.premultiply(xf.qW); }; }
        c.step(W.t, 1 / 240); c.prevInv.copy(c.inv);
      } else { c.pos.copy(pos).applyMatrix4(xf.DW); c.quat.copy(q).premultiply(xf.qW); c.update(); c.prevInv.copy(c.inv); }
    }
    const l = V();
    for (const [zn, x, y, z, r] of base.zones) { l.set(x, y, z).applyMatrix4(D); zn.x = l.x; zn.z = l.z; zn.y = zn.frame.o.y + l.y; zn.rot = r + rot; }
    for (const [s, pos] of base.sensors) s.p.copy(pos).applyMatrix4(xf.DW);
    this.followRelays();
  }
  capture(it) {
    const o = it.out, ad = AD[it.m];
    return {
      scene: (o.scene || []).map(x => [x, x.position.clone(), x.quaternion.clone()]),
      cols: (o.cols || []).map(c => [c, c.pos.clone(), c.quat.clone()]),
      zones: (o.zones || []).map(z => [z, z.x, z.y - z.frame.o.y, z.z, z.rot || 0]),
      sensors: (o.sensors || []).map(s => [s, s.p.clone()]),
      pivot: ad?.pivot ? V(...ad.pivot(it.args, it)) : (it.pivot0 || (it.pivot0 = this.boxPivot(it))).clone(),
    };
  }
  // While the gizmo drags: an item with an adapter moves by the drag alone (it is rebuilt on release); one
  // without moves by its saved offset plus the drag.
  preview(it, d, da) {
    if (AD[it.m]?.move) return this.xform(it, d, da);
    const { off, rot } = moveOf(this.entry(it));
    this.xform(it, [off[0] + d[0], off[1] + d[1], off[2] + d[2]], rot + da);
  }

  /* ----- boxes and pivots ----- */
  worldBox(it, box = new THREE.Box3()) {
    box.makeEmpty();
    const b = new THREE.Box3();
    for (const obj of [...(it.out.group || []), ...(it.out.scene || [])]) {
      if (it.deleted) break;
      obj.updateWorldMatrix(true, true);
      obj.traverse(m => {
        if (!m.isMesh || m.userData.isOutline || !m.visible) return;
        if (m.isInstancedMesh) { if (!m.boundingBox) m.computeBoundingBox?.(); if (m.boundingBox) box.union(b.copy(m.boundingBox).applyMatrix4(m.matrixWorld)); return; }
        if (!m.geometry) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.union(b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
      });
    }
    if (box.isEmpty()) for (const c of it.out.cols || []) box.union(c.aabb);
    return box;
  }
  boxPivot(it) {
    const b = this.worldBox(it);
    if (b.isEmpty()) return V();
    return it.H.frame.local(b.getCenter(V()), V());
  }
  pivotOf(it) {
    const ad = AD[it.m];
    if (ad?.pivot) return V(...ad.pivot(it.args, it));
    const p = it.pivot0 || (it.pivot0 = this.boxPivot(it)), off = it.lockMove ? [0, 0, 0] : moveOf(this.entry(it)).off;
    return V(p.x + off[0], p.y + off[1], p.z + off[2]);
  }
  // The pivot of a piece without an adapter is the middle of its box at t = 0, as a normal load measures it
  // (register): a moving platform rebuilt mid-swing must still turn about the same point.
  startPivot(it) {
    const C = this.C, W = C.world, movers = (it.out.cols || []).filter(c => c.motion);
    if (!movers.length) return this.boxPivot(it);
    const run = (tw, tc) => { for (const c of movers) { c.step(tw, 1 / 240); c.prevInv.copy(c.inv); } for (const a of it.out.anim || []) try { a(tc, 0); } catch (e) {} };
    run(0, 0);
    const p = this.boxPivot(it);
    run(W.t, C.t);
    return p;
  }
  // World box of an item's fixed colliders: what props and zones may be standing on.
  colBox(it, box = new THREE.Box3()) { for (const c of it.out.cols || []) if (!c.motion && !c.aabb.isEmpty()) box.union(c.aabb); return box; }

  /* ----- live edits from the editor ----- */
  // Builders that drop props on the ground probe down from 40 m. During the first build the hole 28 m above
  // does not exist yet; afterwards it does, so a live rebuild (or an add) probes from just above this hole.
  clampGround() {
    const C = this.C, base = Object.getPrototypeOf(C).groundY;
    return this.swapGround((H, x, z, from = 40) => base.call(C, H, x, z, Math.min(from, RISE + 7)));
  }
  // Puts fn in place of course.groundY for a while; the returned function puts back what was there.
  swapGround(fn) {
    const C = this.C, had = Object.prototype.hasOwnProperty.call(C, 'groundY'), was = C.groundY;
    C.groundY = fn;
    return () => { if (had) C.groundY = was; else delete C.groundY; };
  }
  buildAdd(a) {
    const H = this.C.H[(a.hole | 0) - 1];
    if (!H || !ADDABLE.has(a.m) || !this.orig[a.m]) { console.warn('level overlay: cannot add', a); return null; }
    const it = { id: a.id, m: a.m, scope: 'h' + H.i, H, hole: H.i, origArgs: a.args, args: a.args, add: a, out: {} };
    this.scope = { kind: 'add', H, name: it.scope };
    try { this.exec(it, a.args); } catch (e) { console.warn('level overlay: add', a.id, 'failed:', e); it.broken = String(e && e.message || e); it.deleted = true; }
    finally { this.scope = null; }
    this.register(it);
    return it;
  }
  addLive(a) {
    const undo = this.clampGround();
    try { const it = this.buildAdd(a); this.sweep(); return it; } finally { undo(); }
  }
  // Make the live course match the overlay for one item: kill it, build it again from its (patched)
  // arguments, revive it, or move it. Then whatever stood on it finds its feet again (resettle).
  refresh(it) {
    if (!it || LOCKED.has(it.m)) return;
    const box = SURFACE.has(it.m) ? this.colBox(it) : null;
    this.apply(it);
    if (box) this.resettle(it, this.colBox(it, box));
  }
  apply(it) {
    if (it.add) { if (this.data.add.includes(it.add)) this.rebuild(it); else this.kill(it); return; }
    const e = this.entry(it);
    if (it.loose) { if (e?.del) this.kill(it); else { this.revive(it); this.xform(it); } this.sweep(); return; }
    if (e?.del) { this.kill(it); return; }
    // Moved by offsets only (a mover): no need to build it again.
    if (!AD[it.m]?.move && !it.deleted && it.setKey === JSON.stringify(e?.set || null)) { this.xform(it); return; }
    this.rebuild(it);
  }
  // Props, zones and windsocks with no height of their own stand on whatever was under them when they were
  // built. When a block (wall, road, inline piece) moves, goes or comes back, the ones on its old or new
  // footprint are built again, so they land where a normal load will put them: on the new surface, or
  // nowhere (a prop with no ground under it is not built). Only the ones a normal load builds after it
  // (later in the list: the list is in build order), since the others never see it; adds are built last of
  // all, so nothing stands on them.
  resettle(it, box) {
    const i0 = this.list.indexOf(it);
    if (box.isEmpty() || it.add || i0 < 0) return;
    const near = [];
    for (let i = i0 + 1; i < this.list.length; i++) {
      const o = this.list[i];
      const g = GROUNDED[o.m];
      if (o.deleted || !g || num(getPath(o.args, g.y))) continue;
      const [x, z] = g.xz.map(p => o.args[p]);
      if (!num(x) || !num(z)) continue;
      const p = o.H.frame.w(x, 0, z), top = o.H.frame.o.y + RISE + 7;
      if (p.x < box.min.x - 0.3 || p.x > box.max.x + 0.3 || p.z < box.min.z - 0.3 || p.z > box.max.z + 0.3 || box.min.y > top) continue;
      near.push(o);
    }
    for (const o of near) this.rebuild(o);
  }
  // The height a prop, zone or windsock stands at now, to pin it there (editor.js, when it moves sideways):
  // null when it already has a height of its own, or is not built.
  heightOf(it) {
    const path = GROUNDED[it.m]?.y;
    if (!path || it.deleted || it.broken || it.unbuilt || num(getPath(it.args, path))) return null;
    const y = it.m === 'zone' ? zoneY(it) : first(it)?.position.y;
    return num(y) ? r3(y) : null;
  }
  // Whether a prop, zone or windsock given a height stands right on the ground there: where its builder
  // would put it with no height, the way a live rebuild looks (clampGround), its own colliders left out.
  standsOnGround(it) {
    const g = GROUNDED[it.m];
    if (!g || it.deleted || it.broken) return false;
    const y = getPath(it.args, g.y), [x, z] = g.xz.map(p => it.args[p]);
    if (!num(y) || !num(x) || !num(z)) return false;
    const own = (it.out.cols || []).filter(c => c.enabled);
    for (const c of own) c.enabled = false;
    const undo = this.clampGround();
    let gy;
    try { gy = this.C.groundY(it.H, x, z, it.m === 'zone' ? 30 : 40); } finally { undo(); for (const c of own) c.enabled = true; }
    if (gy == null && it.m === 'zone') gy = 0;      // zone(): no ground under it is y 0
    return num(gy) && Math.abs(gy - y) < 0.02;
  }
  // A rebuilt item's old pieces never come back (only inline meshes are revived): let them go, so a long
  // editing session doesn't pile up meshes, GPU buffers, materials and dead animators. (Its wreckable things
  // were buried: they no longer point at its meshes.) Geometry, materials and textures that anything still
  // in the scene or the grave uses are kept. That leaves what the item made for itself: a sign's painted
  // board, a gate light or a pressure plate of its own (toon({ unique })), a windsock's cloned cloth. A
  // freed material that toon() hands out again is simply set up again by three.js the next time it draws.
  // Only canvas textures are freed: model textures stay with the model library.
  release(it) {
    const C = this.C, o = it.out, geos = new Set(), mats = new Set(), texs = new Set();
    const matsOf = m => (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []);
    for (const [top] of it.parents || []) {
      this.grave.remove(top);
      top.traverse(m => { if (m.geometry) geos.add(m.geometry); for (const x of matsOf(m)) mats.add(x); });
    }
    for (const m of mats) for (const v of Object.values(m)) if (v && v.isCanvasTexture) texs.add(v);
    if (geos.size || mats.size) {
      for (const root of [C.scene, this.grave]) root.traverse(m => {
        if (m.geometry) geos.delete(m.geometry);
        for (const x of matsOf(m)) { mats.delete(x); if (texs.size) for (const v of Object.values(x)) if (v && v.isTexture) texs.delete(v); }
      });
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    }
    if (o.anim?.length) { const dead = new Set(o.anim); filterIn(C.animators, a => !(a.was && dead.has(a.was))); }
    it.parents = null;
  }
  rebuild(it) {
    const old = it.ret, oldThings = it.out.things || [];
    this.kill(it); this.release(it);
    Object.assign(it, { parents: null, base: null, wraps: null, xf: null, broken: null, pivot0: null, filedOnce: it.filed });
    const e = this.entry(it), set = goodSet(it, e?.set), args = it.add ? it.add.args : set && Object.keys(set).length ? patch(it.origArgs, set) : it.origArgs;
    it.setKey = JSON.stringify(e?.set || null);
    this.scope = { kind: 'live', H: it.H, name: it.scope };
    const undo = this.clampGround();
    try { this.exec(it, args); }
    catch (err) { console.warn('level overlay: could not rebuild', it.id, err); it.broken = String(err && err.message || err); it.deleted = true; return false; }
    finally { this.scope = null; undo(); }
    this.replay(it);
    this.reuseThings(oldThings, it);
    if (old && typeof old === 'object' && it.ret && typeof it.ret === 'object' && old !== it.ret) this.swapRef(old, it.ret, it);
    this.reslot(it);
    if (!AD[it.m]?.pivot) it.pivot0 = this.startPivot(it);
    const en = this.entry(it);
    if (en && !en.del && (en.off || en.rot)) this.xform(it);
    this.followRelays();
    this.sweep();
    return true;
  }
  // A rebuilt piece's wreckable things take the places of the ones it had (buried by kill), so course.things
  // does not grow with every edit and keeps the numbering a reload gives (wreck.js and the network use it).
  // Only when it made as many as it had (a tree moved, not a tree turned into a fence), and they are the
  // last ones in the list (made just now).
  reuseThings(old, it) {
    const T = this.C.things, nu = it.out.things || [], n = nu.length;
    if (!n || old.length !== n) return;
    const at = old.map(th => T.indexOf(th)), from = nu.map(th => T.indexOf(th));
    if (at.some(i => i < 0) || from.some((f, k) => f !== T.length - n + k)) return;
    const to = new Map(from.map((f, k) => [f, at[k]]));
    for (const c of it.out.cols || []) if (to.has(c.thing)) c.thing = to.get(c.thing);
    nu.forEach((th, k) => { T[at[k]] = th; });
    T.length -= n;
    if (this.onThings) this.onThings(nu);
  }
  // Whatever held the old return value now holds the new one: ring4 files its bumpers in puzzles.bumpers,
  // a pressure plate holds its drawbridge (both in its puzzle entry and in its recorded arguments).
  swapRef(old, nu, it) {
    const P = this.C.puzzles || {};
    for (const k in P) for (let i = 0; i < P[k].length; i++) {
      const x = P[k][i];
      if (x === old) P[k][i] = nu;
      else if (x && typeof x === 'object' && !x.isVector3) for (const f of Object.keys(x)) if (x[f] === old) x[f] = nu;
    }
    const k = it.filed || it.filedOnce;
    if (k && P[k] && !P[k].includes(nu)) P[k].push(nu);
    for (const o of this.list) for (const a of [o.origArgs, o.args]) for (let i = 0; i < a.length; i++) if (a[i] === old) a[i] = nu;
  }
  // An item built again puts its puzzle entries where a fresh load would have them: in build order among
  // everyone else's (push rocks are numbered over the network), whether it was moved in place, or deleted
  // and brought back after others moved up into its slot. A fresh load builds the code's items in list
  // order, then the adds in the file's order.
  reslot(it) {
    const P = this.C.puzzles; if (!P) return;
    const n = this.list.length, rank = new Map(), rankOf = (o, i) => { if (!o.add) return i; const j = this.data.add.indexOf(o.add); return j < 0 ? Infinity : n + j; };
    this.list.forEach((o, i) => {
      const r = rankOf(o, i);
      for (const k in o.out) if (k.startsWith('pz.')) for (const x of o.out[k]) rank.set(x, r);
      if (o.ret && typeof o.ret === 'object') rank.set(o.ret, r);      // filed by the caller (ring4's bumpers)
    });
    const me = this.list.indexOf(it); if (me < 0) return;
    const mine = rankOf(it, me);
    for (const k in P) {
      const arr = P[k], own = arr.filter(x => rank.get(x) === mine);
      if (!own.length) continue;
      filterIn(arr, x => rank.get(x) !== mine);
      const at = arr.findIndex(x => rank.has(x) && rank.get(x) > mine);
      arr.splice(at < 0 ? arr.length : at, 0, ...own);
    }
  }
}
