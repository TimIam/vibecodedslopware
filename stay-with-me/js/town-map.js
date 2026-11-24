// Top-down street map of Halloran Falls for the in-cab GPS / minimap: a dark navigation-style sheet with roads by
// class, the river, parks, building footprints, street names and icons for the hospitals and the station.
// Returns { canvas, scale (px per m), minX, minZ }; world (x,z) -> pixel ((x-minX)*scale, (z-minZ)*scale).

import { makeCanvas } from './util.js';
import { riverX, riverHW, BOUNDS } from './town-layout.js';
import { obbCorners } from './town-geo.js';

const PAD = 160;

export function drawMap(L, T = {}) {
  const minX = BOUNDS.minX - PAD, minZ = BOUNDS.minZ - PAD, W = BOUNDS.maxX - BOUNDS.minX + PAD * 2, H = BOUNDS.maxZ - BOUNDS.minZ + PAD * 2;
  const scale = 2048 / W, cv = makeCanvas(2048, Math.round(H * scale)), g = cv.getContext('2d');
  const X = x => (x - minX) * scale, Z = z => (z - minZ) * scale;
  const path = pts => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1]))); g.closePath(); };
  g.fillStyle = '#18222a'; g.fillRect(0, 0, cv.width, cv.height);
  // forest texture outside town
  g.fillStyle = '#16261f'; for (let i = 0; i < 2600; i++) { const x = (i * 7919 % 2048), y = (i * 104729 % cv.height); g.fillRect(x, y, 3, 3); }
  // blocks
  const DC = { downtown: '#262e3a', oldtown: '#2c2a2b', midtown: '#262c36', residential: '#222b2c', bungalow: '#232a2a', industrial: '#2a2a30', mixed: '#28292f', retail: '#2a2c33', campus: '#27303a', strip: '#26292e', park: '#1c3a2a' };
  for (const b of L.blocks) { if (b.river) continue; path(b.outer); g.fillStyle = b.park ? DC.park : DC[b.district] || '#242b33'; g.fill(); }
  for (const b of L.blocks) { if (!b.river) continue; path(b.outer); g.fillStyle = '#1b3526'; g.fill(); }
  // green areas, lots
  for (const a of T.greens || []) { path(a); g.fillStyle = '#1e4530'; g.fill(); }
  for (const a of T.lots || []) { path(a); g.fillStyle = '#2b3038'; g.fill(); }
  // river
  const wp = [], ep = [];
  for (let z = minZ - 20; z <= minZ + H + 20; z += 10) { wp.push([riverX(z) - riverHW(z), z]); ep.push([riverX(z) + riverHW(z), z]); }
  path(wp.concat(ep.reverse())); g.fillStyle = '#1d4a6b'; g.fill(); g.strokeStyle = '#2a6088'; g.lineWidth = 1.5; g.stroke();
  for (const a of T.waters || []) { path(a); g.fillStyle = '#1d4a6b'; g.fill(); }
  // buildings
  for (const f of T.footprints || []) { path(obbCorners(f)); g.fillStyle = f.hl ? '#5b4a4a' : '#39424f'; g.fill(); }
  // roads: casing then fill, minor classes first
  const RC = { alley: ['#2d343c', '#4b545f'], street: ['#101519', '#6d7783'], arterial: ['#101519', '#d9b65a'], bypass: ['#101519', '#f0a63a'] };
  const quad = (e, grow) => { const a = L.nodes[e.a], b = L.nodes[e.b], w = e.width / 2 + grow, rx = -e.dir.z * w, rz = e.dir.x * w, s0 = Math.max(0, e.trimA - 0.5), s1 = e.length - Math.max(0, e.trimB - 0.5); return [[a.x + e.dir.x * s0 + rx, a.z + e.dir.z * s0 + rz], [a.x + e.dir.x * s1 + rx, a.z + e.dir.z * s1 + rz], [a.x + e.dir.x * s1 - rx, a.z + e.dir.z * s1 - rz], [a.x + e.dir.x * s0 - rx, a.z + e.dir.z * s0 - rz]]; };
  const order = ['alley', 'street', 'arterial', 'bypass'];
  const nodeCls = n => order[Math.max(...n.edges.map(i => order.indexOf(L.edges[i].cls)))];
  for (const pass of [0, 1]) for (const cls of order) {
    g.fillStyle = RC[cls][pass]; g.strokeStyle = RC[cls][pass]; g.lineWidth = pass ? 0.6 : 2.4; g.lineJoin = 'round';
    for (const e of L.edges) if (e.cls === cls) { path(quad(e, pass ? 0.4 : 0)); g.fill(); if (!pass) g.stroke(); }
    for (const n of L.nodes) if (n.poly && nodeCls(n) === cls) { path(n.poly); g.fill(); if (!pass) g.stroke(); }
  }
  // bridges get a rail tick
  g.strokeStyle = '#9aa7b5'; g.lineWidth = 1.2;
  for (const e of L.edges) if (e.bridge) for (const s of [-1, 1]) { const a = L.nodes[e.a], b = L.nodes[e.b], w = (e.width / 2 + 2.5) * s; g.beginPath(); g.moveTo(X(a.x - e.dir.z * w), Z(a.z + e.dir.x * w)); g.lineTo(X(b.x - e.dir.z * w), Z(b.z + e.dir.x * w)); g.stroke(); }
  // street names along the longest runs of each street
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const byName = new Map(); for (const e of L.edges) { if (!byName.has(e.name)) byName.set(e.name, []); byName.get(e.name).push(e); }
  for (const [name, list] of byName) {
    const big = list[0].cls === 'arterial' || list[0].cls === 'bypass'; if (list[0].cls === 'alley') continue;
    g.font = `${big ? 600 : 500} ${big ? 13 : 11}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    let acc = 1e9;
    for (const e of list) {
      acc += e.length; if (acc < 420 || e.length < 85) continue; acc = 0;
      const a = L.nodes[e.a], mx = a.x + e.dir.x * e.length / 2, mz = a.z + e.dir.z * e.length / 2;
      if (mx < minX + 30 || mx > minX + W - 30 || mz < minZ + 20 || mz > minZ + H - 20) { acc = 1e9; continue; }
      let ang = Math.atan2(e.dir.z, e.dir.x); if (ang > Math.PI / 2 + 0.01 || ang < -Math.PI / 2 + 0.01) ang += Math.PI;
      g.save(); g.translate(X(mx), Z(mz)); g.rotate(ang);
      g.lineWidth = 3; g.strokeStyle = 'rgba(12,16,20,0.85)'; g.strokeText(name, 0, 0); g.fillStyle = big ? '#fff3d0' : '#d5dde6'; g.fillText(name, 0, 0); g.restore();
    }
  }
  // river label
  g.save(); g.translate(X(riverX(360) + 2), Z(360)); g.rotate(Math.PI / 2 - 0.08); g.font = 'italic 600 13px Georgia, serif'; g.fillStyle = '#7fb5dd'; g.fillText('K E T T E R   R I V E R', 0, 0); g.restore();
  // place icons
  const icon = (x, z, kind, label) => {
    const px = X(x), pz = Z(z);
    g.save(); g.translate(px, pz);
    if (kind === 'hospital') { g.fillStyle = '#2f6fe0'; g.beginPath(); g.roundRect(-9, -9, 18, 18, 3); g.fill(); g.fillStyle = '#fff'; g.font = '700 14px Arial'; g.fillText('H', 0, 1); }
    else if (kind === 'station') { g.fillStyle = '#d83a2e'; g.beginPath(); g.roundRect(-9, -9, 18, 18, 9); g.fill(); g.fillStyle = '#fff'; g.fillRect(-1.6, -6, 3.2, 12); g.fillRect(-6, -1.6, 12, 3.2); }
    else { g.fillStyle = '#e6edf5'; g.beginPath(); g.arc(0, 0, 2.6, 0, 7); g.fill(); }
    if (label) { g.font = `600 ${kind === 'poi' ? 10 : 11}px "Segoe UI", Arial, sans-serif`; g.textAlign = 'left'; g.lineWidth = 3; g.strokeStyle = 'rgba(12,16,20,0.9)'; g.strokeText(label, kind === 'poi' ? 6 : 13, 0); g.fillStyle = kind === 'hospital' ? '#9cc4ff' : kind === 'station' ? '#ffb0a8' : '#aeb9c6'; g.fillText(label, kind === 'poi' ? 6 : 13, 0); }
    g.restore();
  };
  for (const p of Object.values(T.places || {})) icon(p.x, p.z, p.id === 'general' || p.id === 'regional' ? 'hospital' : p.id === 'station4' ? 'station' : 'poi', p.mapLabel ?? p.name);
  // frame + north arrow
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.strokeRect(X(BOUNDS.minX), Z(BOUNDS.minZ), (BOUNDS.maxX - BOUNDS.minX) * scale, (BOUNDS.maxZ - BOUNDS.minZ) * scale);
  g.save(); g.translate(cv.width - 46, 52); g.fillStyle = '#e6edf5'; g.beginPath(); g.moveTo(0, -20); g.lineTo(8, 8); g.lineTo(0, 3); g.lineTo(-8, 8); g.closePath(); g.fill(); g.font = '700 12px Arial'; g.textAlign = 'center'; g.fillText('N', 0, 22); g.restore();
  g.font = '700 22px "Segoe UI", Arial, sans-serif'; g.textAlign = 'left'; g.fillStyle = 'rgba(230,237,245,0.85)'; g.fillText('HALLORAN FALLS', 22, 30);
  g.font = '500 11px "Segoe UI", Arial, sans-serif'; g.fillStyle = 'rgba(230,237,245,0.5)'; g.fillText('KETTER COUNTY EMS  ·  DISTRICT 4', 23, 50);
  return { canvas: cv, scale, minX, minZ };
}
