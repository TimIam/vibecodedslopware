// Port of the parts of Ingemar Ragnemalm's Sprite Animation Toolkit (SAT) that Harry uses:
// the doubly linked sprite list, SATNewSprite/SATKillSprite, and SATSkip (task calls, one-pass
// bidirectional bubble sort by `layer`, and AppForwardSearch hit detection).

import { rectsTouch, Random } from './util.js';

// Sprite record. Field names follow the original offsets (see re/notes.md).
export class Sprite {
  constructor() {
    this.kind = 0;            // 0x00
    this.v = 0; this.h = 0;   // 0x02 where (Point v,h)
    this.hot = [0, 0, 0, 0];  // 0x06 hotRect (relative)
    this.hot2 = [0, 0, 0, 0]; // 0x0e hotRect (absolute)
    this.face = null;         // 0x16 SAT face (unused by Harry's own drawing)
    this.task = null;         // 0x1a handle proc
    this.hit = null;          // 0x1e hit proc (me, other)
    this.destruct = null;     // 0x22
    this.f26 = 0;
    this.oldV = 0; this.oldH = 0; // 0x2a
    this.next = null;         // 0x2e
    this.prev = null;         // 0x32
    this.drawR = [0, 0, 0, 0];    // 0x36
    this.oldDrawR = [0, 0, 0, 0]; // 0x3e
    this.f46 = 0;
    // ---- Harry fields (record size 0xa2) ----
    this.f4a = 0;
    this.layer = 0;      // 0x4c sort key for hit search
    this.f4e = 0; this.f50 = 0;
    this.scaleH = 256;   // 0x52
    this.scaleV = 256;   // 0x54
    this.f56 = 256; this.f58 = 256;
    this.posV = 0;       // 0x5a integer position (top-left of face), v
    this.posH = 0;       // 0x5c h
    this.fixH = 0;       // 0x5e h << 8
    this.fixV = 0;       // 0x62 v << 8
    this.dir = 0;        // 0x66
    this.param = -1;     // 0x68
    this.f6a = 0; this.f6c = 0;
    this.f6e = 0;        // long
    this.f72 = 0; this.f74 = 0;
    this.idle = -1;      // 0x76 idle slot
    this.f78 = 0;        // long
    this.f7c = 0;
    this.eface = null;   // 0x7e encoded face (drawn by Harry)
    this.f82 = 0; this.f84 = 0;
    this.f86 = 0;        // long
    this.f8a = 0;        // byte
    this.behind = 0;     // 0x8b byte: 1 = drawn behind FG tiles (and gets FG tile collisions)
    this.f8c = 0;        // byte
    this.f8e = 0; this.f90 = 0;
    this.f92 = 0;        // byte
    this.f94 = 0; this.f96 = 0;
    this.f98 = 0; this.f9a = 0; this.f9c = 0;
    this.tileHit = null; // 0x9e tile hit proc (s, cellV, cellH, kind, isFG)
  }
}

export const SAT = {
  head: null,      // -$179a(a5)
  sortMode: 1,     // SATCONFIGURE: sort by layer
  searchRange: 0x40,
};

const NOP = () => {};

// SATNewSprite(kind, h, v, setup) -> sprite. Inserted at the head of the list.
export function SATNewSprite(kind, h, v, setup) {
  const s = new Sprite();
  s.kind = kind;
  s.h = h; s.v = v;
  s.oldV = v; s.oldH = h;
  s.next = SAT.head;
  s.prev = null;
  if (SAT.head) SAT.head.prev = s;
  SAT.head = s;
  if (setup) {
    setup(s);
    s.hot2[0] = s.hot[0] + s.v; s.hot2[1] = s.hot[1] + s.h;
    s.hot2[2] = s.hot[2] + s.v; s.hot2[3] = s.hot[3] + s.h;
  } else {
    s.task = NOP;
  }
  return s;
}

export function SATKillSprite(s) {
  if (s.next) s.next.prev = s.prev;
  if (s.prev) s.prev.next = s.next;
  else if (SAT.head === s) SAT.head = s.next;
  s.dead = true;
  if (s.destruct) s.destruct(s);
}

export function forEachSprite(fn) {
  for (let s = SAT.head; s; ) { const n = s.next; fn(s); s = n; }
}

function bubbleSort() {
  if (!SAT.head || SAT.sortMode === 2) return;
  const key = SAT.sortMode === 0 ? (s) => s.v : (s) => s.layer;
  // forward pass
  let a3 = null;
  let a1 = SAT.head.next;
  while (a1) {
    const a4 = a1.next;
    if (key(a1) < key(a1.prev)) {
      const p = a1.prev; // a3
      if (p.prev) p.prev.next = a1;
      if (a1.next) a1.next.prev = p;
      a1.prev = p.prev;
      p.next = a1.next;
      a1.next = p;
      p.prev = a1;
      if (SAT.head === p) SAT.head = a1;
    }
    a3 = a1;
    a1 = a4;
  }
  // backward pass from the last element
  if (!a3) return;
  a1 = a3.prev;
  while (a1) {
    const a4 = a1.prev;
    if (key(a1) > key(a1.next)) {
      const n = a1.next; // a3
      if (n.next) n.next.prev = a1;
      if (a1.prev) a1.prev.next = n;
      a1.next = n.next;
      n.prev = a1.prev;
      a1.prev = n;
      n.next = a1;
      if (SAT.head === a1) SAT.head = n;
    }
    a1 = a4;
  }
}

// AppForwardSearch5
function searchHits() {
  for (let a = SAT.head; a; a = a.next) {
    const lim = a.layer + SAT.searchRange;
    let b = a.next;
    while (b) {
      if (rectsTouch(a.hot2, b.hot2)) {
        if (a.hit) a.hit(a, b);
        if (b.hit) b.hit(b, a);
      }
      b = b.next;
      if (b && b.layer > lim) b = null;
    }
  }
}

// SATSkip: run tasks, update hot rects, sort, detect hits; dead sprites lose hit proc & kind.
export function SATSkip() {
  for (let s = SAT.head; s; s = s.next) {
    if (s.task) s.task(s);
    s.hot2[0] = s.hot[0] + s.v; s.hot2[2] = s.hot[2] + s.v;
    s.hot2[1] = s.hot[1] + s.h; s.hot2[3] = s.hot[3] + s.h;
  }
  bubbleSort();
  searchHits();
  for (let s = SAT.head; s; s = s.next) {
    if (!s.task) { s.hit = null; s.kind = 0; }
  }
}

// SATRAND(n) = |Random()| mod n
export function SATRand(n) {
  let r = Random();
  if (r < 0) r = -r;
  return n ? r % n : 0;
}
