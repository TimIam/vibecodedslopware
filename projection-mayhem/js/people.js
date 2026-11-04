// Short, stubby cartoon humans assembled from the Blender parts, plus a waddle and a path follower.
import * as THREE from 'three';
import { clone, floorAt, navPath, W } from './world.js';

const SKIN = [0xf2c9a5, 0xe0ac85, 0xc68a5e, 0x9c6440, 0x6e4228, 0xf6d7bd];
const HAIR = [0x1d130c, 0x3a2414, 0x6b4423, 0xb07a3a, 0xd9c08a, 0x8a8a8a, 0xa8331a];
const TOPS = [0x2f6db0, 0x3f8a52, 0xb8462f, 0xe0a03a, 0x6a3f8f, 0x2a2a2a, 0xd8d0c0, 0x1f7f86, 0xc0567a];
const BOTTOMS = [0x1d2a44, 0x2b2b2b, 0x5a4632, 0x3b4f6a, 0x6b6b6b];
const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];

function recolor(o, name, hex) {
  o.traverse(c => {
    if (!c.isMesh) return;
    const ms = Array.isArray(c.material) ? c.material : [c.material];
    const out = ms.map(m => (m.name === name ? Object.assign(m.clone(), { name }) : m));
    out.forEach(m => { if (m.name === name) m.color.setHex(hex); });
    c.material = Array.isArray(c.material) ? out : out[0];
  });
}

export function rngFrom(seed) { let s = (seed * 2654435761) >>> 0 || 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// type: 'customer' | 'hipster' | 'corpo' | 'staff' | 'monkey' | 'marla' | 'tyler'
export function makePerson(type, seed = Math.random() * 1e9) {
  const r = rngFrom(seed);
  const root = new THREE.Group();
  const rig = new THREE.Group();   // bobbing/swaying part
  root.add(rig);
  const h = type === 'tyler' ? 1.08 : 0.86 + r() * 0.24;
  const wide = 0.88 + r() * 0.3;
  const body = clone('h_body'); body.scale.set(wide, h, wide);
  const head = clone('h_head'); head.position.y = 0.6 * h - 0.04; head.scale.setScalar(0.95 + r() * 0.12);
  const skin = pick(SKIN, r), hair = pick(HAIR, r);
  let top = pick(TOPS, r), bottom = pick(BOTTOMS, r);
  let hairPart = r() < 0.15 ? null : pick(['hair_short', 'hair_bun', 'hair_spiky', 'hair_short'], r);
  let hat = null, extras = [];
  if (type === 'staff') { top = 0x9e1b22; bottom = 0x1c1c1c; hat = ['hat_cap', 0x9e1b22]; extras.push(['bowtie', 0x101010], ['badge']); }
  if (type === 'monkey') { top = 0x111111; bottom = 0x111111; hairPart = null; }
  if (type === 'corpo') { top = 0x2b3e66; bottom = 0x22252b; extras.push(['tie', 0x0a2a7a]); if (r() < 0.5) extras.push(['glasses']); hairPart = 'hair_short'; }
  if (type === 'omni') { top = 0x1d4fb8; bottom = 0x22252b; hat = ['hat_cap', 0x1d4fb8]; extras.push(['badge']); }
  if (type === 'hipster') {
    top = pick([0x6b5a3a, 0x8a3b2a, 0x3a5a4a, 0xc9b28a], r); bottom = pick([0x2a3a5a, 0x1d1d1d], r);
    hat = ['hat_beanie', pick([0xb03a2a, 0xd9a03a, 0x3a5a7a, 0x5a4a3a], r)];
    extras.push(['glasses'], r() < 0.6 ? ['stache'] : ['beard'], ['tote']);
  }
  if (type === 'marla') { top = 0x1a1a1a; bottom = 0x1a1a1a; hairPart = 'hair_short'; extras.push(['glasses']); }
  if (type === 'tyler') { top = 0xb5452a; bottom = 0x35302a; hairPart = 'hair_spiky'; }
  if (type === 'customer') {
    if (r() < 0.18) hat = [pick(['hat_cap', 'hat_fedora'], r), pick(TOPS, r)];
    if (r() < 0.18) extras.push(['glasses']);
    if (r() < 0.12) extras.push(['stache']);
  }
  recolor(body, 'cloth_top', top); recolor(body, 'cloth_bottom', bottom); recolor(head, 'skin', skin);
  rig.add(body); rig.add(head);
  const headTop = 0.37;
  if (hairPart) { const hp = clone(hairPart); recolor(hp, 'hair', hair); hp.position.y = headTop * 0.62; head.add(hp); }
  if (hat) { const ho = clone(hat[0]); recolor(ho, 'hat', hat[1]); ho.position.y = hat[0] === 'hat_fedora' ? 0.31 : hat[0] === 'hat_cap' ? 0.3 : 0.25; head.add(ho); }
  for (const [nm, col] of extras) {
    const o = clone(nm);
    if (col !== undefined) { recolor(o, 'hair', hair); recolor(o, 'hat', col); recolor(o, 'black', col); }
    else if (nm === 'stache' || nm === 'beard') recolor(o, 'hair', hair);
    if (nm === 'glasses') { o.position.set(0, 0.235, -0.19); head.add(o); }
    else if (nm === 'stache') { recolor(o, 'hair', hair); o.position.set(0, 0.135, -0.205); head.add(o); }
    else if (nm === 'beard') { recolor(o, 'hair', hair); o.position.set(0, -0.02, -0.08); head.add(o); }
    else if (nm === 'tie') { o.position.set(0, 0.25 * h, -0.2 * wide); rig.add(o); }
    else if (nm === 'bowtie') { o.position.set(0, 0.55 * h, -0.17 * wide); rig.add(o); }
    else if (nm === 'badge') { o.position.set(0.1, 0.42 * h, -0.2 * wide); rig.add(o); }
    else if (nm === 'tote') { o.position.set(0.27 * wide, 0.12, 0.02); rig.add(o); }
  }
  const handL = clone('h_hand'), handR = clone('h_hand');
  recolor(handL, 'skin', skin); recolor(handR, 'skin', skin);
  handL.position.set(-0.29 * wide, 0.22 * h, 0); handR.position.set(0.29 * wide, 0.22 * h, 0);
  rig.add(handL, handR);
  const footL = clone('h_foot'), footR = clone('h_foot');
  footL.position.set(-0.11 * wide, 0, 0); footR.position.set(0.11 * wide, 0, 0);
  root.add(footL, footR);
  body.position.y = 0.06;
  const p = {
    type, root, rig, head, body, handL, handR, footL, footR, h, wide,
    x: 0, z: 0, y: 0, face: 0, speed: 1.25 + r() * 0.35, phase: r() * 10,
    path: [], target: null, moving: false, sitting: false, carrying: null, bubble: null, bubbleT: 0,
  };
  root.userData.person = p;
  return p;
}

export function placePerson(p, x, z, face = 0) {
  p.x = x; p.z = z; p.face = face; p.y = floorAt(x, z, p.y ?? 0);
  p.root.position.set(x, p.y, z); p.root.rotation.y = face;
}

// Walk along nav nodes, then optionally to an exact point.
export function walkTo(p, nodeFrom, nodeTo, finalPoint = null) {
  const ids = navPath(nodeFrom, nodeTo);
  p.path = ids.map(id => ({ x: W.nav[id].x, z: W.nav[id].z }));
  if (p.path.length && Math.hypot(p.path[0].x - p.x, p.path[0].z - p.z) < 0.4) p.path.shift();
  if (finalPoint) p.path.push({ x: finalPoint[0], z: finalPoint[1] });
  p.moving = p.path.length > 0;
  p.sitting = false;
  p.node = nodeTo;
}
export function walkPoints(p, pts) { p.path = pts.map(([x, z]) => ({ x, z })); p.moving = p.path.length > 0; p.sitting = false; }

export function updatePerson(p, dt, t) {
  let walking = false;
  if (p.moving && p.path.length) {
    const tg = p.path[0];
    const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
    const step = p.speed * dt;
    if (d <= step) { p.x = tg.x; p.z = tg.z; p.path.shift(); if (!p.path.length) { p.moving = false; p.onArrive?.(p); } }
    else { p.x += dx / d * step; p.z += dz / d * step; walking = true; }
    if (d > 0.01) p.faceTarget = Math.atan2(dx, dz);   // models face +Z
  }
  if (p.faceTarget !== undefined) {
    let df = p.faceTarget - p.face; df = Math.atan2(Math.sin(df), Math.cos(df));
    p.face += df * Math.min(1, dt * 9);
  }
  const fy = floorAt(p.x, p.z, p.y + 0.3);
  p.y += (fy - p.y) * Math.min(1, dt * 12);
  p.root.position.set(p.x, p.y + (p.sitting ? 0.36 : 0), p.z);
  p.root.rotation.y = p.face;
  // waddle
  p.phase += dt * (walking ? p.speed * 7.5 : 1.6);
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  if (walking) {
    p.rig.position.y = Math.abs(s) * 0.05;
    p.rig.rotation.z = s * 0.09;
    p.rig.rotation.x = -0.06;
    p.footL.position.z = s * 0.14; p.footR.position.z = -s * 0.14;
    p.footL.position.y = Math.max(0, c) * 0.06; p.footR.position.y = Math.max(0, -c) * 0.06;
    p.handL.position.z = -s * 0.12; p.handR.position.z = s * 0.12;
  } else if (p.sitting) {
    p.rig.position.y = 0; p.rig.rotation.set(0.12, 0, 0);
    p.footL.position.set(-0.11 * p.wide, -0.1, -0.24); p.footR.position.set(0.11 * p.wide, -0.1, -0.24);
    p.handL.position.z = -0.05; p.handR.position.z = -0.05;
    p.head.rotation.x = -0.1 + Math.sin(t * 0.7 + p.phase) * 0.02;
  } else {
    p.rig.position.y = Math.sin(p.phase) * 0.008;
    p.rig.rotation.z *= 0.9; p.rig.rotation.x *= 0.9;
    p.footL.position.z *= 0.8; p.footR.position.z *= 0.8; p.footL.position.y = 0; p.footR.position.y = 0;
    p.footL.position.x = -0.11 * p.wide; p.footR.position.x = 0.11 * p.wide;
    p.handL.position.z *= 0.85; p.handR.position.z *= 0.85;
  }
  if (p.excited > 0) { p.excited -= dt; p.rig.position.y += Math.abs(Math.sin(t * 14)) * 0.07; p.handL.position.y = 0.22 * p.h + Math.abs(Math.sin(t * 14)) * 0.15; p.handR.position.y = p.handL.position.y; }
  else { p.handL.position.y = 0.22 * p.h; p.handR.position.y = 0.22 * p.h; }
  if (p.carrying) { p.handL.position.z = -0.2; p.handR.position.z = -0.2; p.handL.position.y = p.handR.position.y = 0.32 * p.h; }
  if (p.bubble) {
    p.bubbleT -= dt;
    p.bubble.position.y = p.h * 0.6 + 0.62 + Math.sin(t * 3) * 0.02;
    if (p.bubbleT <= 0) { p.root.remove(p.bubble); p.bubble.material.map.dispose(); p.bubble.material.dispose(); p.bubble = null; }
  }
}

// Speech bubble sprite above the head (emoji/short text).
export function say(p, text, secs = 2.5, { bg = '#fffaf0', fg = '#2a1a10' } = {}) {
  if (p.bubble) { p.root.remove(p.bubble); p.bubble.material.map.dispose(); p.bubble.material.dispose(); }
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
  const w = Math.min(512, Math.ceil(g.measureText(text).width) + 36);
  c.width = w; c.height = 72;
  g.font = 'bold 34px "Segoe UI", "Segoe UI Emoji", system-ui, sans-serif';
  g.fillStyle = bg; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3;
  const r = 22;
  g.beginPath(); g.roundRect(2, 2, w - 4, 56, r); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 10, 57); g.lineTo(w / 2, 70); g.lineTo(w / 2 + 10, 57); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 31);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, toneMapped: false }));
  sp.scale.set(w / 72 * 0.32, 0.32, 1);
  sp.renderOrder = 10;
  p.root.add(sp);
  p.bubble = sp; p.bubbleT = secs;
}
