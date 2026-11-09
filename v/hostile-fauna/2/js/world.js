// The Garden: terrain, sky, flora, your people's spires, and whatever the humans have bolted on top of it.
// A mission's layout(b) calls the builder; everything it places also registers its own collider.

import * as THREE from 'three';
import { S, clamp, lerp, smooth, rng, TAU } from './state.js';
import { SIGNS } from './data.js';
import { sceneT, dim, playerPos, panelTex, crateTex, concreteTex, gillTex, groundMaterial, makeGrass, makePools, makeMist, lightCone, skyBeam, flare } from './scenery.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const M = {};   // shared materials, made once
const texCache = new Map();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function glyphTex() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const r = rng(77);
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let row = 0; row < 9; row++) {
      if (row % 3 === 1) continue;
      for (let col = 0; col < 4; col++) {
        const cx = 32 + col * 64, cy = 30 + row * 56;
        g.lineWidth = 3;
        g.beginPath();
        const n = 2 + (r() * 3 | 0);
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, len = 8 + r() * 14;
          g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        }
        g.stroke();
        g.beginPath(); g.arc(cx, cy, 16 + r() * 6, r() * TAU, r() * TAU + 2 + r() * 3); g.stroke();
        if (r() > 0.5) { g.beginPath(); g.arc(cx + 12, cy - 12, 3, 0, TAU); g.fillStyle = '#fff'; g.fill(); }
      }
    }
  });
}

function signTex(lines, style = 0) {
  const k = lines.join('|') + style;
  if (texCache.has(k)) return texCache.get(k);
  const t = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = style ? '#16233f' : '#e9e4d6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8641c'; g.fillRect(0, 0, w, 26); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = style ? '#e9e4d6' : '#16233f';
    g.font = '700 15px Arial'; g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText('UNITED EARTH SETTLERS  ★  PEACE FORCE', 12, 19);
    g.fillStyle = style ? '#f3ecd8' : '#16233f'; g.textAlign = 'center';
    let size = 62; g.font = `900 ${size}px Impact, "Arial Narrow", Arial`;
    while (g.measureText(lines[0]).width > w - 40 && size > 20) { size -= 2; g.font = `900 ${size}px Impact, "Arial Narrow", Arial`; }
    g.fillText(lines[0], w / 2, 112);
    if (lines[1]) {
      const big = lines[1] === lines[1].toUpperCase() && lines[1].length < 34;
      let s2 = big ? 58 : 32; g.font = `${big ? 900 : 700} ${s2}px ${big ? 'Impact, "Arial Narrow", Arial' : 'Arial'}`;
      while (g.measureText(lines[1]).width > w - 40 && s2 > 16) { s2 -= 2; g.font = `${big ? 900 : 700} ${s2}px ${big ? 'Impact, "Arial Narrow", Arial' : 'Arial'}`; }
      g.fillStyle = big ? '#c8451a' : (style ? '#c9d3e8' : '#4a5570');
      g.fillText(lines[1], w / 2, big ? 184 : 172);
    }
  });
  texCache.set(k, t); return t;
}

function flagTex() {
  if (texCache.has('flag')) return texCache.get('flag');
  const t = canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#16233f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8641c'; g.fillRect(0, h * 0.72, w, h * 0.1);
    g.fillStyle = '#f3ecd8'; g.fillRect(0, h * 0.86, w, h * 0.06);
    g.strokeStyle = '#f3ecd8'; g.lineWidth = 6; g.beginPath(); g.arc(78, 62, 36, 0, TAU); g.stroke();
    g.fillStyle = '#f3ecd8'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, r = i % 2 ? 11 : 26; g.lineTo(78 + Math.cos(a) * r, 62 + Math.sin(a) * r); }
    g.fill();
    g.font = '900 34px Impact, Arial'; g.fillText('UES', 150, 74);
  });
  texCache.set('flag', t); return t;
}

function shieldTex() {
  if (texCache.has('shield')) return texCache.get('shield');
  const t = canvasTex(128, 192, (g, w, h) => {
    g.fillStyle = '#d7dde6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16233f'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#16233f'; g.font = '900 38px Impact, Arial'; g.textAlign = 'center'; g.fillText('PEACE', w / 2, 112);
    g.fillStyle = '#9fb0c4'; g.fillRect(24, 34, w - 48, 30);
  });
  texCache.set('shield', t); return t;
}
export const peaceShieldTex = shieldTex;

function mats() {
  if (M.hull) return;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, flatShading: true, ...o });
  M.hull = std(0xffffff, { map: panelTex('#d9d6cc', '#8f8c82', 1), flatShading: false }); M.hull2 = std(0xffffff, { map: panelTex('#b9bcc0', '#7b7f86', 2), flatShading: false }); M.trim = std(0xe8641c); M.navy = std(0xffffff, { map: panelTex('#22355c', '#101a30', 3), flatShading: false }); M.dark = std(0x2a2f38, { metalness: 0.5, roughness: 0.5 });
  M.concrete = std(0xffffff, { map: concreteTex(), roughness: 0.95, flatShading: false }); M.crate = std(0xffffff, { map: crateTex('#6f7a52'), flatShading: false }); M.crate2 = std(0xffffff, { map: crateTex('#9aa0a6'), flatShading: false }); M.metal = std(0x7d848c, { metalness: 0.7, roughness: 0.4 });
  M.window = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.7) });
  M.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.55, 1.25) });
  M.red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.3, 0.2) });
  M.green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 0.6) });
  M.glass = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.2, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
  M.stone = std(0x1d2030, { roughness: 0.6, metalness: 0.2, emissive: 0x58e6d0, emissiveMap: glyphTex(), emissiveIntensity: 0.85 });
  M.stonePlain = std(0x232638, { roughness: 0.7 });
  M.trunk = std(0x2a2440, { roughness: 0.9, flatShading: false });
  M.gill = gillTex(); M.band = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.5, 1.3) });
  M.crystal = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x3a6f78, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.5, flatShading: true });
  M.jelly = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  M.rock = std(0x3a3550, { roughness: 0.95 });
  M.robe = std(0x2b3a52, { roughness: 0.7 }); M.skin = std(0x5fa39a, { roughness: 0.5 });
  M.eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.5, 1.35) });
  M.tyre = std(0x15161a, { roughness: 1 });
  M.dim = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 0.72) });
}

const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; };
export function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = mesh(BOX, mat, x, y, z, parent); m.scale.set(w, h, d); m.castShadow = true; m.receiveShadow = true; return m;
}

// ------------------------------------------------------------------ sky
function makeSky(sky) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(sky.top) }, uMid: { value: new THREE.Color(sky.mid) }, uHor: { value: new THREE.Color(sky.hor) }, uT: { value: 0 }, uAur: { value: sky.aurora ?? 1 }, uHaze: { value: 0 }, uHazeCol: { value: new THREE.Color(0x9fb4c4) } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uTop,uMid,uHor,uHazeCol; uniform float uT,uAur,uHaze;
      float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){ vec3 d=normalize(vD); float h=clamp(d.y,-0.2,1.0);
        vec3 c=mix(uHor,uMid,smoothstep(0.0,0.28,h)); c=mix(c,uTop,smoothstep(0.2,0.85,h));
        vec3 q=floor(d*190.0); float s=hash(q); float tw=0.6+0.4*sin(uT*2.0+s*90.0);
        c+=vec3(0.9,0.95,1.0)*step(0.9965,s)*tw*smoothstep(0.02,0.3,h)*1.6;
        float s2=hash(floor(d*420.0)+7.0); c+=vec3(0.7,0.8,1.0)*step(0.997,s2)*smoothstep(0.05,0.4,h)*0.6;
        vec3 np=d*2.2+vec3(uT*0.004,0.0,0.0); float nb=0.0, amp=0.5; for(int i=0;i<4;i++){ vec3 ip=floor(np), fp=fract(np); fp=fp*fp*(3.0-2.0*fp);
          float n000=hash(ip),n100=hash(ip+vec3(1,0,0)),n010=hash(ip+vec3(0,1,0)),n110=hash(ip+vec3(1,1,0)),n001=hash(ip+vec3(0,0,1)),n101=hash(ip+vec3(1,0,1)),n011=hash(ip+vec3(0,1,1)),n111=hash(ip+vec3(1,1,1));
          nb+=amp*mix(mix(mix(n000,n100,fp.x),mix(n010,n110,fp.x),fp.y),mix(mix(n001,n101,fp.x),mix(n011,n111,fp.x),fp.y),fp.z); np*=2.03; amp*=0.5; }
        c+=mix(uMid,uHor,nb)*smoothstep(0.5,0.85,nb)*smoothstep(0.1,0.5,h)*0.55*(1.0-uHaze);
        float a=atan(d.z,d.x); float band=sin(a*3.0+uT*0.05+sin(a*7.0+uT*0.11)*0.6);
        float au=smoothstep(0.55,1.0,band)*smoothstep(0.12,0.3,h)*smoothstep(0.75,0.35,h);
        au*=0.5+0.5*sin(a*40.0+uT*0.7+h*20.0);
        c+=mix(vec3(0.1,0.9,0.7),vec3(0.7,0.3,1.0),h*1.6)*au*0.5*uAur;
        c=mix(c,uHazeCol,uHaze*(1.0-smoothstep(0.0,0.7,h)*0.6));
        gl_FragColor=vec4(c,1.0); }`,
  }));
  g.add(dome); g.userData.dome = dome;
  const moon = (r, col, az, el, dist = 780) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshBasicMaterial({ color: col, fog: false }));
    m.position.set(Math.cos(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.sin(az) * Math.cos(el) * dist); g.add(m); return m;
  };
  const m1 = moon(46, new THREE.Color(1.3, 1.5, 1.6), sky.moonAz ?? 2.2, 0.62), m2 = moon(18, new THREE.Color(1.5, 0.9, 1.5), (sky.moonAz ?? 2.2) + 0.5, 0.36);
  for (const [m, c, sz] of [[m1, 0x9fd8ff, 420], [m2, 0xe0a0ff, 170]]) { const f = flare(c, sz, 0.5); f.material.fog = false; f.position.copy(m.position); g.add(f); }
  const giant = moon(150, new THREE.Color(0.32, 0.22, 0.5), (sky.moonAz ?? 2.2) - 2.2, 0.16, 820);
  const band = new THREE.Mesh(new THREE.RingGeometry(190, 270, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.35, 0.6), side: THREE.DoubleSide, transparent: true, opacity: 0.35, fog: false }));
  band.rotation.x = 1.25; giant.add(band);

  // The colony fleet, parked in low orbit where you can't miss it.
  const fleet = new THREE.Group();
  const hullM = new THREE.MeshBasicMaterial({ color: 0x232a3d, fog: false }), winM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.6, 0.9), fog: false }), engM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 2.6), fog: false });
  const r = rng(5);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Group(), L = i === 0 ? 150 : 50 + r() * 50;
    mesh(BOX, hullM, 0, 0, 0, s).scale.set(L, L * 0.13, L * 0.18);
    mesh(BOX, hullM, L * 0.2, L * 0.1, 0, s).scale.set(L * 0.3, L * 0.1, L * 0.12);
    mesh(BOX, hullM, -L * 0.42, 0, 0, s).scale.set(L * 0.16, L * 0.22, L * 0.26);
    mesh(BOX, engM, -L * 0.51, 0, 0, s).scale.set(L * 0.02, L * 0.14, L * 0.18);
    const ef = flare(0x70b8ff, L * 0.7, 0.8); ef.material.fog = false; ef.position.set(-L * 0.54, 0, 0); s.add(ef);
    for (let k = 0; k < 14; k++) mesh(BOX, winM, (r() - 0.4) * L * 0.8, (r() - 0.5) * L * 0.08, L * 0.091, s).scale.set(L * 0.012, L * 0.008, 0.5);
    s.position.set((r() - 0.5) * 520, 300 + r() * 120 - i * 10, (r() - 0.5) * 200);
    s.rotation.y = 0.2 + r() * 0.2; fleet.add(s);
  }
  const fa = sky.fleetAz ?? -1.57;
  fleet.position.set(Math.cos(fa) * 640, 0, Math.sin(fa) * 640); fleet.lookAt(0, 250, 0); g.add(fleet);
  return g;
}

// ------------------------------------------------------------------ props the missions place
export const props = {
  elder(tint = 0x2b3a52) {
    mats();
    const g = new THREE.Group();
    const robe = mesh(new THREE.CylinderGeometry(0.22, 0.75, 2.3, 7), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.7, flatShading: true }), 0, 1.35, 0, g); robe.castShadow = true;
    mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 6), M.skin, 0, 2.75, 0, g);
    const head = mesh(new THREE.SphereGeometry(0.3, 10, 8), M.skin, 0, 3.2, 0.05, g); head.scale.set(0.8, 1.25, 1.1);
    const crest = mesh(new THREE.ConeGeometry(0.16, 0.9, 5), M.skin, 0, 3.75, -0.2, g); crest.rotation.x = -0.6;
    for (const [x, y] of [[-0.12, 3.27], [0.12, 3.27], [-0.07, 3.13], [0.07, 3.13]]) mesh(new THREE.SphereGeometry(0.035, 6, 5), M.eye, x, y, 0.33, g);
    for (const s of [-1, 1]) { const a = mesh(new THREE.CylinderGeometry(0.05, 0.04, 1.5, 5), M.skin, s * 0.36, 1.85, 0.1, g); a.rotation.z = s * 0.22; a.rotation.x = -0.25; }
    const halo = mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 30), M.eye, 0, 3.4, -0.25, g); halo.userData.spin = true;
    g.userData.halo = halo;
    return g;
  },
  beacon() {
    mats();
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), M.metal, Math.cos(i * 2.094) * 0.5, 0.6, Math.sin(i * 2.094) * 0.5, g); l.rotation.z = Math.cos(i * 2.094) * 0.6; l.rotation.x = -Math.sin(i * 2.094) * 0.6; }
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 6), M.metal, 0, 2.6, 0, g).castShadow = true;
    box(0.6, 0.5, 0.6, M.hull, 0, 1.4, 0, g); box(0.62, 0.12, 0.62, M.trim, 0, 1.4, 0, g);
    const dish = mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, TAU, 0, 1.1), M.hull2, 0.2, 3.5, 0, g); dish.rotation.z = -1.2;
    g.userData.blink = mesh(new THREE.SphereGeometry(0.16, 8, 6), M.red, 0, 4.8, 0, g);
    const f = mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshBasicMaterial({ map: flagTex(), side: THREE.DoubleSide, color: 0xaaaaaa }), 0.5, 4.3, 0, g);
    g.userData.flag = f;
    return g;
  },
  pump() {
    mats();
    const g = new THREE.Group();
    box(2.6, 1.6, 2.2, M.hull2, 0, 0.8, 0, g); box(2.7, 0.2, 2.3, M.trim, 0, 1.3, 0, g); box(1, 1.2, 1, M.dark, 0.5, 2.1, 0, g);
    const wheel = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 14), M.metal, -0.9, 1.6, 1.2, g); wheel.rotation.x = Math.PI / 2; g.userData.spin = wheel;
    mesh(new THREE.CylinderGeometry(0.22, 0.22, 3, 8), M.metal, 0.5, 3.1, 0, g);
    const pipe = mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.4, 8), M.metal, 1.9, 0.5, 0, g); pipe.rotation.z = Math.PI / 2;
    g.userData.blink = mesh(new THREE.SphereGeometry(0.14, 8, 6), M.green, -0.9, 1.75, -0.9, g);
    return g;
  },
  rig() {
    mats();
    const g = new THREE.Group(), H = 26;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const leg = box(0.5, H, 0.5, M.metal, sx * 2.6, H / 2, sz * 2.6, g); leg.rotation.z = -sx * 0.085; leg.rotation.x = sz * 0.085;
    }
    for (let y = 3; y < H; y += 4) { const w = 6.6 - y * 0.16; box(w, 0.25, 0.25, M.metal, 0, y, w / 2, g); box(w, 0.25, 0.25, M.metal, 0, y, -w / 2, g); box(0.25, 0.25, w, M.metal, w / 2, y, 0, g); box(0.25, 0.25, w, M.metal, -w / 2, y, 0, g); }
    box(8, 1.2, 8, M.concrete, 0, 0.6, 0, g); box(8.2, 0.3, 8.2, M.trim, 0, 1.1, 0, g);
    box(3, 2, 3, M.hull, 0, H + 0.5, 0, g);
    g.userData.blink = mesh(new THREE.SphereGeometry(0.3, 8, 6), M.red, 0, H + 2, 0, g);
    g.userData.drill = mesh(new THREE.CylinderGeometry(0.35, 0.35, H, 8), M.dark, 0, H / 2, 0, g);
    g.userData.head = box(1.6, 1.6, 1.6, M.trim, 0, 8, 0, g);
    return g;
  },
  dome(elderTint) {
    mats();
    const g = new THREE.Group();
    const glass = mesh(new THREE.SphereGeometry(5, 24, 12, 0, TAU, 0, Math.PI / 2), M.glass.clone(), 0, 0, 0, g); g.userData.glass = glass;
    const rim = mesh(new THREE.TorusGeometry(5, 0.22, 6, 40), M.hull, 0, 0.15, 0, g); rim.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const rib = mesh(new THREE.TorusGeometry(5, 0.07, 5, 24, Math.PI), M.metal, 0, 0, 0, g); rib.rotation.y = i * Math.PI / 6; }
    // Enrichment.
    box(0.15, 3, 0.15, M.metal, -2.4, 1.5, -1.6, g); box(0.15, 3, 0.15, M.metal, -0.4, 1.5, -1.6, g); box(2.2, 0.15, 0.15, M.metal, -1.4, 3, -1.6, g);
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4), M.metal, -1.4, 2.25, -1.6, g);
    const tyre = mesh(new THREE.TorusGeometry(0.45, 0.17, 8, 18), M.tyre, -1.4, 1.2, -1.6, g); g.userData.tyre = tyre;
    mesh(new THREE.CylinderGeometry(0.5, 0.35, 0.25, 12), M.trim, 2, 0.13, 1.8, g);
    const e = props.elder(elderTint); e.position.set(0.6, 0, 0.2); g.add(e); g.userData.elder = e;
    return g;
  },
  post() {
    mats();
    const g = new THREE.Group();
    box(0.7, 1.1, 0.5, M.dark, 0, 0.55, 0, g);
    const scr = box(0.8, 0.5, 0.08, M.red, 0, 1.4, 0.05, g); scr.rotation.x = -0.4; g.userData.blink = scr;
    return g;
  },
  processor() {
    mats();
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(2.6, 3.2, 12, 12), M.hull, 0, 6, 0, g).castShadow = true;
    mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.6, 12), M.trim, 0, 3, 0, g);
    mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.5, 12), M.navy, 0, 9, 0, g);
    mesh(new THREE.CylinderGeometry(3.4, 2.6, 2, 12, 1, true), M.metal, 0, 13, 0, g).material.side = THREE.DoubleSide;
    const fan = new THREE.Group(); fan.position.y = 13.2; g.add(fan);
    for (let i = 0; i < 5; i++) { const b = box(2.8, 0.08, 0.7, M.dark, 0, 0, 0, fan); b.geometry = BOX; b.position.set(Math.cos(i * 1.257) * 1.4, 0, Math.sin(i * 1.257) * 1.4); b.rotation.y = -i * 1.257; b.rotation.x = 0.3; }
    g.userData.spin = fan;
    for (let i = 0; i < 4; i++) mesh(BOX, M.window, Math.cos(i * 1.571 + 0.78) * 2.95, 5, Math.sin(i * 1.571 + 0.78) * 2.95, g).scale.set(0.5, 1.6, 0.5);
    const sh = mesh(new THREE.SphereGeometry(5.2, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.5, 1.1), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 6, 0, g);
    sh.scale.y = 1.6; g.userData.shield = sh;
    return g;
  },
  generator() {
    mats();
    const g = new THREE.Group();
    box(2, 1.4, 1.4, M.navy, 0, 0.7, 0, g); box(2.1, 0.15, 1.5, M.trim, 0, 1.1, 0, g);
    const coil = mesh(new THREE.TorusGeometry(0.55, 0.14, 8, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.2, 2.6) }), 0, 2, 0, g); g.userData.spin = coil; g.userData.blink = coil;
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), M.metal, 0, 1.7, 0, g);
    return g;
  },
};

// ------------------------------------------------------------------ build
export function buildWorld(def) {
  mats();
  const old = S.W;
  if (old) { S.scene.remove(old.group); old.group.traverse(o => { if (o.geometry && o.geometry !== BOX) o.geometry.dispose(); }); }
  const r = rng(def.seed), R = 105;
  const s1 = r() * 6, s2 = r() * 6, s3 = r() * 6;
  const group = new THREE.Group();
  const W = { group, R, boxes: [], circles: [], pads: [], anim: [], lampCount: 0, sky: def.sky };
  const base = (x, z) => 2.4 * Math.sin(x * 0.043 + s1) * Math.cos(z * 0.037 + s2) + 1.2 * Math.sin(x * 0.097 + z * 0.071 + s3) + 0.45 * Math.sin(x * 0.21 - z * 0.17 + s1 * 2);
  const padW = (p, x, z) => { const dx = Math.max(Math.abs(x - p.x) - p.hw, 0), dz = Math.max(Math.abs(z - p.z) - p.hd, 0); return 1 - smooth(0, p.fall, Math.hypot(dx, dz)); };
  W.padAt = (x, z) => { let w = 0; for (const p of W.pads) w = Math.max(w, padW(p, x, z)); return w; };
  W.height = (x, z) => {
    let h = base(x, z);
    for (const p of W.pads) { const w = padW(p, x, z); if (w > 0) h = lerp(h, p.h, w); }
    const d = Math.hypot(x, z);
    if (d > R - 4) { const k = (d - (R - 4)) / 14; h += Math.min(70, k * k * 16) * (0.75 + 0.25 * Math.sin(Math.atan2(z, x) * 13 + s1)); }
    return h;
  };
  // Standing height at a spot: the terrain, or the top of anything low enough to step or land on.
  W.ground = (x, z, feet) => {
    let h = W.height(x, z);
    for (const b of W.boxes) if (b.y1 > h && b.y1 <= feet + 0.55 && x > b.x0 - 0.25 && x < b.x1 + 0.25 && z > b.z0 - 0.25 && z < b.z1 + 0.25) h = b.y1;
    return h;
  };
  W.collide = (p, rad, feet, headY) => {
    for (const b of W.boxes) {
      if (feet >= b.y1 - 0.5 || headY <= b.y0) continue;
      const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
      let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (rad - d) / d; p.x += dx * k; p.z += dz * k; }
      else {   // centre is inside the box: leave by the nearest face
        const l = p.x - b.x0, rr = b.x1 - p.x, n = p.z - b.z0, f = b.z1 - p.z, m = Math.min(l, rr, n, f);
        if (m === l) p.x = b.x0 - rad; else if (m === rr) p.x = b.x1 + rad; else if (m === n) p.z = b.z0 - rad; else p.z = b.z1 + rad;
      }
    }
    for (const c of W.circles) {
      if (feet >= c.y1 - 0.5 || headY <= c.y0) continue;
      const dx = p.x - c.x, dz = p.z - c.z, rr = rad + c.r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.001; p.x = c.x + dx / d * rr; p.z = c.z + dz / d * rr;
    }
    const d = Math.hypot(p.x, p.z); if (d > R) { p.x *= R / d; p.z *= R / d; }
  };
  // Distance along a ray to the first solid thing, or max.
  W.ray = (ox, oy, oz, dx, dy, dz, max) => {
    let best = max;
    for (const b of W.boxes) {
      let t0 = 0, t1 = best, ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        const o = a === 0 ? ox : a === 1 ? oy : oz, d = a === 0 ? dx : a === 1 ? dy : dz;
        const lo = a === 0 ? b.x0 : a === 1 ? b.y0 : b.z0, hi = a === 0 ? b.x1 : a === 1 ? b.y1 : b.z1;
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) ok = false; continue; }
        let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) { const q = ta; ta = tb; tb = q; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) ok = false;
      }
      if (ok && t0 < best) best = t0;
    }
    for (const c of W.circles) {
      const fx = ox - c.x, fz = oz - c.z, a = dx * dx + dz * dz;
      if (a < 1e-9) continue;
      const bb = fx * dx + fz * dz, cc = fx * fx + fz * fz - c.r * c.r, disc = bb * bb - a * cc;
      if (disc < 0) continue;
      const t = (-bb - Math.sqrt(disc)) / a;
      if (t < 0 || t >= best) continue;
      const y = oy + dy * t; if (y >= c.y0 && y <= c.y1) best = t;
    }
    // Terrain: sample along the ray and always test the far end, so a short step (a slow pod, one frame) can't slip under the ground.
    for (let prev = 0, t = Math.min(0.8, best); ; t = Math.min(t + 1.4, best)) {
      const y = oy + dy * t;
      if (y > 40 && dy >= 0) break;
      if (y < W.height(ox + dx * t, oz + dz * t)) {
        let a = prev, b2 = t;
        for (let i = 0; i < 6; i++) { const m = (a + b2) / 2; if (oy + dy * m < W.height(ox + dx * m, oz + dz * m)) b2 = m; else a = m; }
        best = a; break;
      }
      if (t >= best) break;
      prev = t;
    }
    return best;
  };
  W.los = (ax, ay, az, bx, by, bz) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return W.ray(ax, ay, az, dx / len, dy / len, dz / len, len) >= len - 0.05;
  };
  W.addBox = (x, z, w, d, y0, y1) => { const b = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1 }; W.boxes.push(b); return b; };
  W.addCircle = (x, z, rad, y0, y1) => { const c = { x, z, r: rad, y0, y1 }; W.circles.push(c); return c; };
  W.remove = c => { let i = W.boxes.indexOf(c); if (i >= 0) W.boxes.splice(i, 1); i = W.circles.indexOf(c); if (i >= 0) W.circles.splice(i, 1); };
  W.blocked = (x, z, rad = 1) => {
    for (const b of W.boxes) if (x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad) return true;
    for (const c of W.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + rad) return true;
    return false;
  };

  const pools = makePools(900); group.add(pools);
  // A disc of light on the ground. human = 1 for floodlights, which the humans' air does not dim.
  W.pool = (x, z, rad, color, k = 0.5, human = 0) => pools.add_(x, W.height(x, z), z, rad, color, k, human, (W.height(x - 1, z) - W.height(x + 1, z)) / 2, (W.height(x, z - 1) - W.height(x, z + 1)) / 2);

  // ---------------------------------------------------------------- builder
  const b = W.b = {
    r,
    pad(x, z, hw, hd, fall = 9) { W.pads.push({ x, z, hw, hd, fall, h: base(x, z) }); },
    mod(x, z, w, d, h, o = {}) {
      const y = W.height(x, z), g = new THREE.Group(); g.position.set(x, y, z); group.add(g);
      box(w, h, d, o.navy ? M.navy : M.hull, 0, h / 2, 0, g);
      box(w + 0.1, 0.35, d + 0.1, M.trim, 0, h - 0.5, 0, g);
      box(w + 0.2, 0.3, d + 0.2, M.hull2, 0, 0.15, 0, g);
      const n = Math.max(1, Math.floor(w / 2.4));
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) mesh(BOX, M.window, (i - (n - 1) / 2) * 2.2, h * 0.52, s * (d / 2 + 0.02), g).scale.set(1.1, 0.5, 0.06);
      box(1.3, 2.1, 0.12, M.dark, -w * 0.28, 1.05, d / 2 + 0.03, g); mesh(BOX, M.lamp, -w * 0.28, 2.35, d / 2 + 0.08, g).scale.set(0.5, 0.12, 0.1);
      box(1.6, 0.7, 1.2, M.hull2, w * 0.2, h + 0.35, -d * 0.15, g); mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 10), M.dark, w * 0.2, h + 0.72, -d * 0.15, g);
      for (const sx of [-1, 1]) box(0.14, h, 0.14, M.metal, sx * (w / 2 + 0.05), h / 2, d / 2 + 0.05, g);
      W.pool(x - w * 0.28, z + d / 2 + 1.6, 3.2, 0xffe2b0, 0.5, 1);
      if (o.dish) { const dish = mesh(new THREE.SphereGeometry(1.1, 10, 6, 0, TAU, 0, 1.1), M.hull2, w * 0.25, h + 1.2, 0, g); dish.rotation.z = -0.9; mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5), M.metal, w * 0.25, h + 0.6, 0, g); }
      if (o.mast) { mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 5), M.metal, -w * 0.3, h + 2.5, 0, g); mesh(new THREE.SphereGeometry(0.12, 6, 5), M.red, -w * 0.3, h + 5, 0, g); }
      W.addBox(x, z, w, d, y - 2, y + h);
      return g;
    },
    lander(x, z) {
      const y = W.height(x, z), g = new THREE.Group(); g.position.set(x, y, z); group.add(g);
      box(14, 5, 9, M.hull, 0, 5, 0, g); box(14.1, 0.5, 9.1, M.trim, 0, 6.6, 0, g); box(8, 2.4, 6, M.hull2, -1, 8.6, 0, g); box(4, 1.6, 9.4, M.navy, 5, 4.4, 0, g);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const l = box(0.5, 3.4, 0.5, M.metal, sx * 6, 1.5, sz * 4.6, g); l.rotation.x = sz * 0.3; box(1.4, 0.2, 1.4, M.dark, sx * 6, 0.1, sz * 5.2, g); }
      const ramp = box(3.4, 0.2, 6, M.metal, 0, 1.25, 7, g); ramp.rotation.x = 0.43;
      for (let i = 0; i < 5; i++) mesh(BOX, M.window, -5 + i * 2.2, 5.6, 4.52, g).scale.set(1.2, 0.6, 0.06);
      for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(1.1, 1.5, 1.6, 10), M.dark, sx * 4, 2, -2, g);
      const f = mesh(new THREE.PlaneGeometry(4.2, 2.6), new THREE.MeshBasicMaterial({ map: flagTex(), color: 0x999999 }), -3.4, 4.6, 4.53, g);
      W.addBox(x, z, 14, 9, y + 2.4, y + 10);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) W.addCircle(x + sx * 6, z + sz * 5, 0.5, y - 1, y + 3);
      return g;
    },
    crate(x, z, s = 1.3, stack = 1) {
      const y = W.height(x, z);
      for (let i = 0; i < stack; i++) { const c = box(s, s, s, i % 2 ? M.crate2 : M.crate, x, y + s / 2 + i * s, z, group); c.rotation.y = (r() - 0.5) * 0.3 * (i ? 1 : 0); }
      W.addBox(x, z, s, s, y - 1, y + s * stack);
    },
    barrier(x, z, len = 4, alongX = true) {
      const y = W.height(x, z), w = alongX ? len : 0.7, d = alongX ? 0.7 : len;
      box(w, 1.15, d, M.concrete, x, y + 0.57, z, group);
      box(alongX ? len : 0.74, 0.2, alongX ? 0.74 : len, M.trim, x, y + 0.95, z, group);
      W.addBox(x, z, w, d, y - 1, y + 1.15);
    },
    wall(x, z, len, alongX, h = 4.5) {
      const y = W.height(x, z), w = alongX ? len : 1, d = alongX ? 1 : len;
      box(w, h, d, M.concrete, x, y + h / 2, z, group); box(w + 0.1, 0.4, d + 0.1, M.trim, x, y + h - 0.6, z, group);
      return W.addBox(x, z, w, d, y - 2, y + h);
    },
    fence(x, z, len, alongX) {
      const y = W.height(x, z), n = Math.max(2, Math.round(len / 3));
      for (let i = 0; i <= n; i++) { const t = (i / n - 0.5) * len; mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), M.metal, x + (alongX ? t : 0), W.height(x + (alongX ? t : 0), z + (alongX ? 0 : t)) + 1.2, z + (alongX ? 0 : t), group); }
      const net = mesh(new THREE.PlaneGeometry(len, 2), new THREE.MeshBasicMaterial({ color: 0x5a6470, wireframe: true, transparent: true, opacity: 0.5 }), x, y + 1.3, z, group);
      net.geometry = new THREE.PlaneGeometry(len, 2, Math.round(len * 1.5), 5); if (!alongX) net.rotation.y = Math.PI / 2;
      W.addBox(x, z, alongX ? len : 0.3, alongX ? 0.3 : len, y - 1, y + 2.4);
    },
    tower(x, z, light = true) {
      const y = W.height(x, z);
      mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 6), M.metal, x, y + 4.5, z, group).castShadow = true;
      box(1.6, 0.5, 0.5, M.dark, x, y + 9, z, group);
      for (const s of [-0.5, 0, 0.5]) mesh(BOX, M.lamp, x + s, y + 8.9, z + 0.2, group).scale.set(0.36, 0.3, 0.2);
      if (light && W.lampCount < 4) { const l = new THREE.PointLight(0xffe9c8, 260, 60, 1.7); l.position.set(x, y + 8.4, z + 0.6); group.add(l); W.lampCount++; }
      for (const s of [-1, 1]) { const br = box(0.06, 2.2, 0.06, M.metal, x + s * 0.45, y + 8, z, group); br.rotation.z = s * 0.42; }
      const cone = lightCone(9, 7.5, 0xffe9c8, light ? 0.5 : 0.3); cone.position.set(x, y + 8.9, z + 0.3); group.add(cone);
      const fl = flare(0xffe9c8, light ? 9 : 6, 0.9); fl.position.set(x, y + 8.9, z + 0.3); group.add(fl);
      W.pool(x, z + 0.3, 10, 0xffe2b0, light ? 0.5 : 0.3, 1);
      W.addCircle(x, z, 0.3, y - 1, y + 9);
    },
    sign(x, z, face, key, o = {}) {
      const y = W.height(x, z), w = o.w ?? 7, h = w / 2, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = face * Math.PI / 2; group.add(g);
      const lines = SIGNS[key] || [key];
      mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTex(lines, o.style ?? 0), color: 0xb4b4b4 }), 0, (o.y ?? 2.6) + h / 2, 0.08, g);
      box(w + 0.3, h + 0.3, 0.12, M.dark, 0, (o.y ?? 2.6) + h / 2, 0, g);
      for (const s of [-1, 1]) box(0.2, (o.y ?? 2.6) + 0.2, 0.2, M.metal, s * w * 0.36, (o.y ?? 2.6) / 2, 0, g);
      const ax = face % 2 === 0;
      for (const s of [-1, 1]) W.addCircle(x + (ax ? s * w * 0.36 : 0), z + (ax ? 0 : -s * w * 0.36), 0.2, y - 1, y + 3);
      return g;
    },
    flag(x, z) {
      const y = W.height(x, z);
      mesh(new THREE.CylinderGeometry(0.06, 0.08, 8, 6), M.metal, x, y + 4, z, group);
      const geo = new THREE.PlaneGeometry(3, 1.9, 10, 4); geo.translate(1.5, 0, 0);
      const f = mesh(geo, new THREE.MeshBasicMaterial({ map: flagTex(), side: THREE.DoubleSide, color: 0xa0a0a0 }), x, y + 6.9, z, group);
      const p0 = geo.attributes.position.array.slice();
      W.anim.push(t => { const a = geo.attributes.position.array; for (let i = 0; i < a.length; i += 3) a[i + 2] = Math.sin(p0[i] * 2.2 - t * 5 + x) * 0.14 * p0[i]; geo.attributes.position.needsUpdate = true; });
      W.addCircle(x, z, 0.15, y - 1, y + 8);
    },
    spire(x, z, h = 16, rad = 1.5) {
      const y = W.height(x, z) - 0.5;
      const m = mesh(new THREE.CylinderGeometry(rad * 0.3, rad, h, 4, 1), M.stone, x, y + h / 2, z, group); m.rotation.y = r() * TAU; m.castShadow = true;
      if (h < 4) { mesh(new THREE.OctahedronGeometry(rad * 0.4), M.dim, x, y + h + rad * 0.9, z, group); W.addCircle(x, z, rad * 0.8, y - 1, y + h); return; }
      const crown = mesh(new THREE.OctahedronGeometry(rad * 0.5), M.eye, x, y + h + rad * 1.3, z, group); crown.scale.y = 1.6;
      const halo = mesh(new THREE.TorusGeometry(rad * 1.1, 0.04, 5, 36), M.eye, x, y + h + rad * 1.3, z, group); halo.rotation.x = Math.PI / 2;
      const halo2 = mesh(new THREE.TorusGeometry(rad * 1.5, 0.025, 5, 36), M.dim, x, y + h + rad * 1.3, z, group);
      const st = box(rad * 2.6, 0.5, rad * 2.6, M.stonePlain, x, y + 0.6, z, group); st.rotation.y = m.rotation.y + Math.PI / 4; box(rad * 3.3, 0.3, rad * 3.3, M.stonePlain, x, y + 0.3, z, group).rotation.y = st.rotation.y;
      for (const f of [0.3, 0.55, 0.78]) { const rr = rad * (1 - 0.7 * f) * 1.02; const bd = mesh(new THREE.CylinderGeometry(rr, rr * 1.02, 0.09, 4), M.band, x, y + h * f, z, group); bd.rotation.y = m.rotation.y; }
      const shards = [];
      for (let i = 0; i < 3; i++) { const sh = mesh(new THREE.OctahedronGeometry(rad * 0.18), M.stonePlain, x, y, z, group); sh.scale.y = 2.2; shards.push(sh); }
      const beamUp = skyBeam(60, rad * 0.4, 0x7ff0e0, 0.11); beamUp.position.set(x, y + h + rad * 1.3, z); group.add(beamUp);
      const fl = flare(0x7ff0e0, rad * 3.2, 0.32); fl.position.set(x, y + h + rad * 1.3, z); group.add(fl); (W.dimmable ||= []).push(beamUp, fl);
      W.pool(x, z, rad * 5, 0x40e0c8, 0.13);
      const ph = r() * 6;
      W.anim.push(t => { crown.rotation.y = t * 0.5 + ph; const cy = y + h + rad * 1.3 + Math.sin(t * 0.8 + ph) * 0.3; crown.position.y = cy; halo.rotation.z = -t * 0.3; halo.position.y = cy; halo2.position.y = cy; halo2.rotation.set(1.2 + Math.sin(t * 0.3 + ph) * 0.4, t * 0.2, 0);
        for (let i = 0; i < 3; i++) { const a = t * 0.35 + ph + i * 2.094, hh = y + h * (0.45 + i * 0.17) + Math.sin(t * 0.6 + i) * 0.6; shards[i].position.set(x + Math.cos(a) * rad * 1.8, hh, z + Math.sin(a) * rad * 1.8); shards[i].rotation.y = a * 2; } });
      W.addCircle(x, z, rad * 0.8, y - 1, y + h);
    },
    tree(x, z, s = 1) {
      const y = W.height(x, z) - 0.3, h = 5 * s + r() * 3 * s;
      const hue = [0x3fe0c8, 0xc86bff, 0xffa84a, 0x5aa8ff][r() * 4 | 0];
      const t = mesh(new THREE.CylinderGeometry(0.16 * s, 0.44 * s, h, 9, 5), M.trunk, x, y + h / 2, z, group); t.castShadow = true;
      const lean = (r() - 0.5) * 0.9 * s, la = r() * TAU, tp = t.geometry.attributes.position;
      for (let i = 0; i < tp.count; i++) { const k = (tp.getY(i) / h + 0.5); tp.setX(i, tp.getX(i) + Math.cos(la) * lean * k * k); tp.setZ(i, tp.getZ(i) + Math.sin(la) * lean * k * k); }
      t.geometry.computeVertexNormals();
      const cx = x + Math.cos(la) * lean, cz = z + Math.sin(la) * lean, cr = (1.7 + r() * 0.9) * s;
      const capM = new THREE.MeshStandardMaterial({ color: 0x241d3e, emissive: hue, emissiveIntensity: 0.4, roughness: 0.5 });
      const prof = [[0, 0.62], [0.3, 0.6], [0.6, 0.5], [0.85, 0.3], [0.98, 0.08], [1, -0.06], [0.93, -0.12]].map(([px, py]) => new THREE.Vector2(px * cr, py * cr));
      const cap = mesh(new THREE.LatheGeometry(prof, 18), capM, cx, y + h - 0.25 * s, cz, group); cap.castShadow = true;
      const under = mesh(new THREE.CircleGeometry(cr * 0.95, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(1.1), map: M.gill, side: THREE.DoubleSide }), cx, y + h - 0.3 * s, cz, group); under.rotation.x = Math.PI / 2;
      const rim = mesh(new THREE.TorusGeometry(cr * 0.99, 0.035 * s, 5, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(1.5) }), cx, y + h - 0.3 * s, cz, group); rim.rotation.x = Math.PI / 2;
      for (let i = 0, n = 3 + (r() * 4 | 0); i < n; i++) { const a = r() * TAU, d = r() * cr * 0.7, sp = mesh(new THREE.SphereGeometry((0.08 + r() * 0.1) * s, 6, 5), rim.material, cx + Math.cos(a) * d, y + h - 0.25 * s + cr * (0.62 - 0.3 * (d / cr) * (d / cr)), cz + Math.sin(a) * d, group); sp.scale.y = 0.4; }
      W.pool(cx, cz, cr * 3.2, hue, 0.2);
      (W.treeMats ||= []).push({ m: rim.material, hue });
      W.addCircle(x, z, 0.4 * s, y - 1, y + h);
      return { cap: capM, under: under.material, hue };
    },
    rock(x, z, s = 1.5) {
      const y = W.height(x, z);
      const m = mesh(new THREE.DodecahedronGeometry(s, 0), M.rock, x, y + s * 0.35, z, group); m.rotation.set(r() * 3, r() * 3, r() * 3); m.scale.y = 0.7; m.castShadow = true;
      W.addCircle(x, z, s * 0.8, y - 1, y + s * 0.9);
    },
    gate(x, z, w = 10, h = 5.5) {
      const y = W.height(x, z), door = new THREE.Group(); door.position.set(x, y, z); group.add(door);
      box(w, h, 0.8, M.navy, 0, h / 2, 0, door); box(w, 0.5, 0.9, M.trim, 0, h - 1, 0, door); box(w, 0.5, 0.9, M.trim, 0, 1, 0, door);
      mesh(new THREE.PlaneGeometry(4.2, 2.6), new THREE.MeshBasicMaterial({ map: flagTex(), color: 0x999999 }), 0, h / 2, 0.42, door);
      const col = W.addBox(x, z, w, 0.8, y - 2, y + h);
      return { open() { W.remove(col); let k = 0; W.anim.push((t, dt) => { if (k < 1) { k = Math.min(1, k + dt * 0.45); door.position.y = y - k * (h + 0.4); } }); } };
    },
    deck(x, z, w, d, h = 0.5) {
      const y = W.height(x, z);
      box(w, h, d, M.hull2, x, y + h / 2, z, group); box(w + 0.1, 0.08, d + 0.1, M.trim, x, y + h - 0.04, z, group);
      W.addBox(x, z, w, d, y - 1, y + h);
    },
    podium(x, z) {
      const y = W.ground(x, z, W.height(x, z) + 0.6);
      box(1.3, 1.25, 0.8, M.navy, x, y + 0.62, z, group); box(1.4, 0.1, 0.9, M.trim, x, y + 1.25, z, group);
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), M.metal, x, y + 1.5, z, group); mesh(new THREE.SphereGeometry(0.06, 6, 5), M.dark, x, y + 1.76, z, group);
      W.addBox(x, z, 1.3, 0.8, y - 1, y + 1.3);
    },
    pond(x, z, w, d) {
      const y = W.height(x, z), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.35, 0.32) });
      const p = mesh(new THREE.PlaneGeometry(w, d), mat, x, y + 0.08, z, group); p.rotation.x = -Math.PI / 2;
      for (const s of [-1, 1]) { box(w + 0.6, 0.5, 0.3, M.concrete, x, y + 0.2, z + s * d / 2, group); box(0.3, 0.5, d, M.concrete, x + s * w / 2, y + 0.2, z, group); }
      return mat;
    },
    add(obj, x, z, yOff = 0) { obj.position.set(x, W.height(x, z) + yOff, z); group.add(obj); return obj; },
  };

  S.W = W;
  def.layout(b, W);

  // ---------------------------------------------------------------- terrain mesh
  const size = (R + 48) * 2, seg = 210;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), padA = new Float32Array(pos.count);
  const cA = new THREE.Color(0x0d3338), cB = new THREE.Color(0x18523f), cV = new THREE.Color(0x35255e), cD = new THREE.Color(0x66563f), cR = new THREE.Color(0x2b2944), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = W.height(x, z);
    pos.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.13 + s2) * Math.cos(z * 0.11 + s3), v = smooth(0.55, 0.9, 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.03 + s1 * 3));
    c.copy(cA).lerp(cB, n).lerp(cV, v * 0.8);
    const pw = W.padAt(x, z), rimK = smooth(R - 4, R + 6, Math.hypot(x, z));
    c.lerp(cD, pw * 0.95);
    c.lerp(cR, rimK); padA[i] = Math.max(pw, Math.min(1, rimK * 2.5));
    const j = 0.95 + r() * 0.1; col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aPad', new THREE.BufferAttribute(padA, 1)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, groundMaterial());
  ground.receiveShadow = true; group.add(ground); W.groundMesh = ground;

  // ---------------------------------------------------------------- flora (kept off anything the humans paved)
  W.glow = [];
  const free = (x, z, rad) => W.padAt(x, z) < 0.15 && !W.blocked(x, z, rad) && Math.hypot(x, z) < R - 3;
  for (let i = 0, n = 0; i < 400 && n < (def.trees ?? 46); i++) { const x = (r() - 0.5) * 2 * R, z = (r() - 0.5) * 2 * R; if (free(x, z, 3) && Math.hypot(x - def.spawn[0], z - def.spawn[1]) > 6) { W.glow.push(b.tree(x, z, 0.8 + r() * 0.9)); n++; } }
  for (let i = 0, n = 0; i < 200 && n < 14; i++) { const x = (r() - 0.5) * 2 * R, z = (r() - 0.5) * 2 * R; if (free(x, z, 3)) { b.rock(x, z, 0.8 + r() * 1.6); n++; } }
  const dummy = new THREE.Object3D(), ic = new THREE.Color();
  const hueAt = (x, z) => 0.46 + 0.3 * smooth(0.5, 0.9, 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.03 + s1 * 3)) + 0.05 * Math.sin(x * 0.3) * Math.cos(z * 0.27);
  let clump = null;
  const grass = makeGrass(def.grass ?? 30000, r, i => {
    if (i % 12 === 0 || !clump) { const x = (r() - 0.5) * 2 * (R + 2), z = (r() - 0.5) * 2 * (R + 2); clump = W.padAt(x, z) > 0.04 || Math.hypot(x, z) > R + 2 ? null : { x, z }; }
    if (!clump) return null;
    const x = clump.x + (r() - 0.5) * 1.6, z = clump.z + (r() - 0.5) * 1.6;
    return { x, y: W.height(x, z), z };
  }, hueAt);
  group.add(grass); W.tendrils = grass;
  const NB = 520, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial(), NB), stalks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.03, 1, 4).translate(0, 0.5, 0), M.trunk, NB);
  let n = 0;
  for (let i = 0; i < NB * 3 && n < NB; i++) {
    const x = (r() - 0.5) * 2 * R, z = (r() - 0.5) * 2 * R;
    if (W.padAt(x, z) > 0.05 || Math.hypot(x, z) > R) continue;
    const h = 0.4 + r() * 1.3, y = W.height(x, z);
    dummy.rotation.set(0, 0, 0); dummy.position.set(x, y, z); dummy.scale.set(1, h, 1); dummy.updateMatrix(); stalks.setMatrixAt(n, dummy.matrix);
    dummy.position.y = y + h; dummy.scale.setScalar(0.7 + r() * 1.1); dummy.updateMatrix(); bulbs.setMatrixAt(n, dummy.matrix);
    ic.setHSL([0.47, 0.78, 0.09, 0.58][r() * 4 | 0], 0.9, 0.6); if (n % 3 === 0) W.pool(x, z, 1.5 + r() * 1.2, ic.getHex(), 0.16); ic.multiplyScalar(1.25); bulbs.setColorAt(n, ic); n++;
  }
  bulbs.count = stalks.count = n; group.add(bulbs, stalks); W.bulbs = bulbs;

  // Crystal clusters, mostly near the edges where nobody has bulldozed yet.
  const NC = 150, crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0), M.crystal, NC);
  n = 0;
  for (let i = 0; i < 300 && n < NC - 5; i++) {
    const x = (r() - 0.5) * 2 * R, z = (r() - 0.5) * 2 * R;
    if (!free(x, z, 2) || Math.hypot(x - def.spawn[0], z - def.spawn[1]) < 5) continue;
    const hue = [0.48, 0.52, 0.76, 0.83][r() * 4 | 0], k = 3 + (r() * 3 | 0);
    for (let j = 0; j < k; j++) {
      const cx = x + (r() - 0.5) * 1.6, cz = z + (r() - 0.5) * 1.6, sc = 0.6 + r() * 1.6;
      dummy.position.set(cx, W.height(cx, cz) + sc * 0.35, cz); dummy.rotation.set((r() - 0.5) * 0.9, r() * 6, (r() - 0.5) * 0.9); dummy.scale.set(sc * 0.5, sc * 2.2, sc * 0.5); dummy.updateMatrix();
      crystals.setMatrixAt(n, dummy.matrix); crystals.setColorAt(n, ic.setHSL(hue, 0.7, 0.55)); n++;
    }
    W.pool(x, z, 4, ic.setHSL(hue, 0.9, 0.55).getHex(), 0.2);
    if (n % 12 < 4) W.addCircle(x, z, 0.7, W.height(x, z) - 1, W.height(x, z) + 1.6);
  }
  crystals.count = n; crystals.castShadow = true; group.add(crystals);

  // Drifters: slow, pulsing, entirely unbothered by the invasion.
  const bell = new THREE.SphereGeometry(0.5, 10, 6, 0, TAU, 0, Math.PI * 0.55), NJ = def.jellies ?? 26;
  const jellies = new THREE.InstancedMesh(bell, M.jelly, NJ), tails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.005, 1.6, 4).translate(0, -0.8, 0), M.jelly, NJ * 3), jl = [];
  for (let i = 0; i < NJ; i++) { const a = r() * TAU, rr = 12 + r() * (R - 16); jl.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: 4 + r() * 9, ph: r() * 6, s: 0.7 + r() * 1.3, sp: 0.2 + r() * 0.3 }); ic.setHSL([0.5, 0.8, 0.58][i % 3], 0.8, 0.6); jellies.setColorAt(i, ic); for (let k = 0; k < 3; k++) tails.setColorAt(i * 3 + k, ic); }
  jellies.frustumCulled = tails.frustumCulled = false; group.add(jellies, tails);
  W.anim.push(t => {
    for (let i = 0; i < NJ; i++) {
      const j = jl[i], x = j.x + Math.sin(t * 0.05 * j.sp + j.ph) * 8, z = j.z + Math.cos(t * 0.04 * j.sp + j.ph * 1.3) * 8, beat = Math.sin(t * 1.4 * j.sp * 3 + j.ph);
      const y = W.height(x, z) + j.y + Math.sin(t * 0.3 + j.ph) * 1.2 + beat * 0.15;
      dummy.rotation.set(0, 0, 0); dummy.position.set(x, y, z); dummy.scale.set(j.s * (1 + beat * 0.12), j.s * (1 - beat * 0.15), j.s * (1 + beat * 0.12)); dummy.updateMatrix(); jellies.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 3; k++) { dummy.position.set(x + Math.cos(k * 2.09) * 0.22 * j.s, y, z + Math.sin(k * 2.09) * 0.22 * j.s); dummy.rotation.set(Math.sin(t + j.ph + k) * 0.25, 0, Math.cos(t * 0.8 + j.ph + k) * 0.25); dummy.scale.set(j.s, j.s * (1 + beat * 0.2), j.s); dummy.updateMatrix(); tails.setMatrixAt(i * 3 + k, dummy.matrix); }
    }
    jellies.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true;
  });

  const mist = makeMist(54, r, R, W.height, def.sky.mist ?? def.sky.hor); group.add(mist);

  const NF = 260, fg = new THREE.BufferGeometry(), fp = new Float32Array(NF * 3);
  for (let i = 0; i < NF; i++) { const x = (r() - 0.5) * 2 * R, z = (r() - 0.5) * 2 * R; fp[i * 3] = x; fp[i * 3 + 1] = W.height(x, z) + 0.6 + r() * 4; fp[i * 3 + 2] = z; }
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const flies = new THREE.Points(fg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 } },
    vertexShader: 'uniform float uT; varying float vA; void main(){ vec3 p=position; float s=p.x*12.9+p.z*78.2; p.x+=sin(uT*0.4+s)*1.5; p.y+=sin(uT*0.7+s*1.3)*0.6; p.z+=cos(uT*0.5+s*0.7)*1.5; vA=0.5+0.5*sin(uT*2.0+s); vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=150.0/max(1.0,-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d)*vA; gl_FragColor=vec4(vec3(0.6,1.0,0.8)*a*1.5,a); }',
  }));
  flies.frustumCulled = false; group.add(flies);

  // ---------------------------------------------------------------- light and sky
  const sky = makeSky(def.sky); group.add(sky); W.skyGroup = sky;
  const hemi = new THREE.HemisphereLight(def.sky.hemi ?? 0x6a7cc8, 0x14202a, def.sky.hemiI ?? 1.5); group.add(hemi);
  const sun = new THREE.DirectionalLight(def.sky.light ?? 0xa8d8ff, def.sky.lightI ?? 2.2);
  const az = def.sky.moonAz ?? 2.2; sun.userData.dir = new THREE.Vector3(Math.cos(az) * 0.7, 0.75, Math.sin(az) * 0.7).normalize();
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  const sc = sun.shadow.camera; sc.left = sc.bottom = -55; sc.right = sc.top = 55; sc.near = 1; sc.far = 220;
  group.add(sun, sun.target); W.sun = sun; W.hemi = hemi;
  W.fog = new THREE.FogExp2(def.sky.fog, def.sky.fogD ?? 0.011);
  W.fogBase = new THREE.Color(def.sky.fog); W.fogD = def.sky.fogD ?? 0.011;
  S.scene.fog = W.fog; S.scene.background = new THREE.Color(def.sky.fog);

  // Human "fresh air": 0 is your sky, 1 is car park. Mission four drives this.
  W.haze = 0; dim.value = 1; M.jelly.opacity = 0.55; M.crystal.emissiveIntensity = 0.9;
  const hazeCol = new THREE.Color(0x9fb4c4);
  W.setHaze = v => {
    W.haze = v; sky.userData.dome.material.uniforms.uHaze.value = v;
    W.fog.color.copy(W.fogBase).lerp(hazeCol, v * 0.85); W.fog.density = W.fogD * (1 + v * 1.6);
    for (const g of W.glow) { g.cap.emissiveIntensity = 0.55 * (1 - v * 0.9); g.under.color.set(g.hue).multiplyScalar(1.15 * (1 - v * 0.85)); }
    W.bulbs.material.color.setScalar(1 - v * 0.8); dim.value = 1 - v * 0.92;
    for (const t of W.treeMats || []) t.m.color.set(t.hue).multiplyScalar(1.5 * (1 - v * 0.85));
    for (const o of W.dimmable || []) o.visible = v < 0.6;
    M.jelly.opacity = 0.55 * (1 - v * 0.7); M.crystal.emissiveIntensity = 0.9 * (1 - v * 0.8);
  };

  W.update = (dt, t, cam) => {
    sky.position.copy(cam.position);
    sky.userData.dome.material.uniforms.uT.value = t; flies.material.uniforms.uT.value = t; sceneT.value = t;
    if (S.P) playerPos.value.copy(S.mode === 'mission' || S.mode === 'dialog' ? S.P.pos : cam.position);
    M.stone.emissiveIntensity = 0.75 + 0.2 * Math.sin(t * 0.7); M.band.color.setRGB(0.45, 1.5, 1.3).multiplyScalar(0.7 + 0.3 * Math.sin(t * 1.1));
    sun.target.position.set(cam.position.x, 0, cam.position.z);
    sun.position.copy(sun.target.position).addScaledVector(sun.userData.dir, 110);
    for (const f of W.anim) f(t, dt);
  };

  S.scene.add(group); S.W = W;
  return W;
}
