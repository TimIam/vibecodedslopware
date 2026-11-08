// One save slot in localStorage. The whole run is written out as a graph (units point at parties and back), so a
// Save and Quit comes back at the exact moment it left. Anything the graph can't hold makes save() return false, and
// the last good save stays put.

import { LEVELS } from './levels/index.js';
import { makeRng } from './world.js';

const KEY = 'bosshours.save.v1', META = 'bosshours.save.meta.v1', PLUS = 'bosshours.plus.v1';

const TYPED = { Float32Array, Float64Array, Uint8Array, Uint16Array, Int16Array, Int32Array, Uint32Array };

function toB64(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
function fromB64(name, s) {
  const bin = atob(s), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TYPED[name](bytes.buffer);
}

// every object becomes a numbered node; inside a node a one-item array is a pointer or a special value
export function pack(root) {
  const ids = new Map(), nodes = [];
  function fn(f) {
    if (f.rngState) return ['r', f.rngState()];
    for (let i = 0; i < LEVELS.length; i++) for (const k in LEVELS[i]) if (LEVELS[i][k] === f) return ['f', i, k];
    throw new Error('cannot save a function');
  }
  function val(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : ['n', String(v)];
    if (v === undefined) return ['u'];
    if (typeof v === 'function') return fn(v);
    if (v === null || typeof v !== 'object') return v;
    const level = LEVELS.indexOf(v);
    if (level >= 0) return ['l', level];
    let id = ids.get(v);
    if (id !== undefined) return [id];
    id = nodes.length;
    ids.set(v, id);
    nodes.push(null);
    nodes[id] = node(v);
    return [id];
  }
  function node(o) {
    if (Array.isArray(o)) return ['a', o.map(val)];
    if (o instanceof Set) return ['s', [...o].map(val)];
    if (o instanceof Map) return ['m', [...o].map(([k, v]) => [val(k), val(v)])];
    const typed = o.constructor?.name;
    if (TYPED[typed]) return ['t', typed, toB64(o)];
    if (o.constructor !== Object && o.constructor !== undefined) throw new Error(`cannot save a ${typed}`);
    const out = {};
    for (const k of Object.keys(o)) out[k] = val(o[k]);
    return ['o', out];
  }
  val(root);
  return nodes;
}

export function unpack(nodes) {
  const made = nodes.map(n => {
    switch (n[0]) {
      case 'a': return [];
      case 's': return new Set();
      case 'm': return new Map();
      case 't': return fromB64(n[1], n[2]);
      default: return {};
    }
  });
  const val = v => {
    if (!Array.isArray(v)) return v;
    if (typeof v[0] === 'number') return made[v[0]];
    switch (v[0]) {
      case 'u': return undefined;
      case 'n': return Number(v[1]);
      case 'r': return makeRng(v[1]);
      case 'l': return LEVELS[v[1]];
      case 'f': return LEVELS[v[1]][v[2]];
    }
    throw new Error('bad save');
  };
  nodes.forEach((n, i) => {
    const o = made[i];
    if (n[0] === 'a') n[1].forEach(v => o.push(val(v)));
    else if (n[0] === 's') n[1].forEach(v => o.add(val(v)));
    else if (n[0] === 'm') n[1].forEach(([k, v]) => o.set(val(k), val(v)));
    else if (n[0] === 'o') for (const k in n[1]) o[k] = val(n[1][k]);
  });
  return made[0];
}

// phase is 'play', or 'store' while the Hoard is open
export function writeSave(g, phase = 'play') {
  try {
    const text = JSON.stringify({ phase, nodes: pack(g) });
    localStorage.setItem(KEY, text);
    localStorage.setItem(META, JSON.stringify({ level: g.map.n, score: Math.floor(g.score), ng: g.ng || 0, at: Date.now() }));
    return true;
  } catch (e) {
    console.warn('save failed:', e.message);
    return false;
  }
}

export function saveInfo() {
  try { return JSON.parse(localStorage.getItem(META)); } catch { return null; }
}

export function readSave() {
  try {
    const { phase, nodes } = JSON.parse(localStorage.getItem(KEY));
    const g = unpack(nodes);
    g.events = [];
    return { g, phase };
  } catch (e) {
    console.warn('save unreadable:', e.message);
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(META); } catch {}
}

// beating the castle unlocks New Game+ for good; this is the build it carries forward
export function unlockPlus(g) {
  try { localStorage.setItem(PLUS, JSON.stringify({ owned: [...g.owned], lvl: g.lvl, slots: g.slots, ng: g.ng || 0 })); } catch {}
}
export function plusData() {
  try { return JSON.parse(localStorage.getItem(PLUS)); } catch { return null; }
}
