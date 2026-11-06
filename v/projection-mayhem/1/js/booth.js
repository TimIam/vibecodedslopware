// The projection booth: projectors per screen, threading, cue marks, changeovers, platters, digital, film
// breaks, and painting the picture onto each auditorium screen.
import * as THREE from 'three';
import { W, L, clone, addCollider, removeCollider } from './world.js';
import { G, film, REEL_SECS, MOTOR_CUE, CHANGE_CUE, CUE_SHOW } from './state.js';

export const B = {};             // per screen id
let F = null;                    // frames.js (art)
export function setFrames(mod) { F = mod; }
export const hooks = { onShowStart: null, onShowEnd: null, onFlub: null, onBreak: null, openRepair: null, toast: null };

const LEADER = MOTOR_CUE - CHANGE_CUE;  // seconds of leader between the start mark and first picture
const CW = 512, CH = 290;

// ------------------------------------------------------------------ setup
export function initBooth() {
  for (const a of L.auds) {
    const k = a.id;
    const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
    const mesh = W.shell.getObjectByName(`screen_${k}`);
    if (mesh) mesh.material = new THREE.MeshBasicMaterial({ map: tex, color: 0xe8e4dc, toneMapped: false });
    const beam = makeBeam();
    W.scene.add(beam);
    B[k] = { k, cx: a.cx, canvas, ctx: canvas.getContext('2d'), tex, mesh, beam, objs: [], colliders: [], P: {}, show: null, queue: [], paintAcc: 0, slideKey: '', visible: false, ingest: 0 };
  }
}
function makeBeam() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);   // along +z, from z=0 to z=1, radius 1 everywhere (scaled later)
  // taper: scale verts so the start is tiny
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i); const s = 0.02 + z; pos.setX(i, pos.getX(i) * s); pos.setY(i, pos.getY(i) * s); }
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uI: { value: 0 }, uC: { value: new THREE.Color(1, 0.95, 0.85) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform float uT; uniform float uI; uniform vec3 uC;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){ float z = clamp(vP.z, 0.0, 1.0); float dust = smoothstep(0.996, 1.0, h(floor(vP*vec3(160.0,160.0,90.0) + vec3(0.0, uT*1.5, uT*0.7)))) * 0.35;
        float a = (0.035 + dust) * (1.0 - z*0.55) * uI; gl_FragColor = vec4(uC * a, 1.0); }`,
  });
  const b = new THREE.Mesh(geo, m);
  b.visible = false;
  b.renderOrder = 5;
  return b;
}
function aimBeam(b, from, to, wScreen, hScreen) {
  b.position.copy(from);
  b.lookAt(to);
  const d = from.distanceTo(to);
  b.scale.set(wScreen / 2, hScreen / 2, d);
}

// Rebuild the booth furniture for a screen after its tier changes or it opens.
export function layoutScreen(k) {
  const b = B[k], s = G.screens.find(s => s.id === k);
  for (const o of b.objs) W.scene.remove(o);
  for (const c of b.colliders) removeCollider(c);
  b.objs = []; b.colliders = []; b.P = {};
  if (!s.open) return;
  const BY = L.booth.y, z = -2.3, px = L.aud.ports;
  const add = (name, x, zz, ry = Math.PI) => { const o = clone(name); o.position.set(x, BY, zz); o.rotation.y = ry; W.scene.add(o); b.objs.push(o); return o; };
  const coll = (x, zz, w, d, h = 2.4) => b.colliders.push(addCollider(x - w / 2, x + w / 2, zz - d / 2, zz + d / 2, BY, BY + h));
  if (s.tier === 'reel') {
    for (const [id, dx] of [['A', px[0]], ['B', px[1]]]) {
      const o = add('proj35', b.cx + dx, z);
      b.P[id] = { id, obj: o, reel: null, threaded: false, motor: false, motorAt: 0, played: false, upper: o.getObjectByName('reel_up'), lower: o.getObjectByName('reel_lo'), next: id === 'A' ? 1 : 2 };
      coll(b.cx + dx, z + 0.1, 0.55, 1.6);
    }
  } else if (s.tier === 'platter') {
    const o = add('proj35', b.cx + px[0], z);
    b.P.A = { id: 'A', obj: o, reel: null, threaded: false, motor: false, played: false, upper: o.getObjectByName('reel_up'), lower: o.getObjectByName('reel_lo'), platter: true };
    b.P.A.upper.visible = false; b.P.A.lower.visible = false;
    const pl = add('platter', b.cx + 1.25, -1.9, 0);
    b.platter = pl;
    coll(b.cx + px[0], z + 0.1, 0.55, 1.6); coll(b.cx + 1.25, -1.9, 1.6, 1.6, 1.8);
  } else {
    const o = add('projdig', b.cx + px[0], -2.55);
    b.P.A = { id: 'A', obj: o, digital: true, threaded: true, motor: false, played: false };
    const t = add('tms', b.cx + 1.2, -2.6);
    b.tms = t;
    coll(b.cx + px[0], -2.55, 0.8, 1.1, 1.5); coll(b.cx + 1.2, -2.6, 0.7, 0.8, 1.5);
  }
  refreshReelVisuals(k);
}

function refreshReelVisuals(k) {
  const b = B[k];
  for (const P of Object.values(b.P)) {
    if (P.digital || P.platter) continue;
    P.upper.visible = P.reel !== null && !P.played;
    P.lower.visible = true;
    const fp = P.obj.getObjectByName('film_path'); if (fp) fp.visible = P.threaded;
  }
}

// ------------------------------------------------------------------ show lifecycle (sim drives the schedule)
export function screenFilm(k) { return film(G.screens.find(s => s.id === k)?.film); }

// sim calls this when a showtime is reached
export function queueShow(k, idx, startAt) {
  const b = B[k];
  const s = G.screens.find(s => s.id === k);
  const show = { idx, film: s.film, startAt, started: false, startedAt: 0, reel: 1, reelT: 0, active: 'A', ended: false, score: 1, flubs: [], runout: 0, broken: null, preroll: 0, leaderFlash: 0 };
  if (b.show) b.queue.push(show); else b.show = show;
  return show;
}

export function cancelShow(k, show) {
  const b = B[k];
  show.ended = true;
  if (b.show === show) { b.show = b.queue.shift() || null; b.slideKey = ''; }
  else b.queue = b.queue.filter(x => x !== show);
}

function startShow(k, who = 'you') {
  const b = B[k], sh = b.show, s = scr(k);
  if (!sh || sh.started) return;
  sh.started = true; sh.startedAt = G.t;
  const late = Math.max(0, G.t - sh.startAt - 4);
  if (late > 0) sh.score -= Math.min(0.35, late * 0.012);
  if (s.tier === 'reel') { b.P.A.motor = true; b.P.A.motorAt = G.t; sh.active = 'A'; sh.reel = 1; sh.reelT = 0; rollBreak(k); }
  else if (s.tier === 'platter') { b.P.A.motor = true; sh.reelT = 0; rollBreak(k); }
  else { b.P.A.motor = true; sh.preroll = G.flags.omni ? 6 : 0; }
  hooks.onShowStart?.(k, sh, who);
}

function rollBreak(k) {
  const b = B[k], sh = b.show, s = scr(k);
  const pr = G.prints[sh.film];
  const q = pr ? pr.quality : 0.8;
  const p = (s.tier === 'platter' ? 0.06 : 0.035) + (1 - q) * 0.22;
  sh.breakAt = Math.random() < p ? 5 + Math.random() * (REEL_SECS * (s.tier === 'platter' ? film(sh.film).reels : 1) - 14) : null;
}

function endShow(k) {
  const b = B[k], sh = b.show;
  if (!sh || sh.ended) return;
  sh.ended = true;
  for (const P of Object.values(b.P)) { if (P.platter) { P.threaded = false; } if (P.digital) { P.motor = false; } }
  if (b.P.A?.platter) b.P.A.motor = false;
  if (b.P.B) { b.P.A.next = 1; b.P.B.next = 2; }
  const s = scr(k);
  b.show = b.queue.shift() || null;
  hooks.onShowEnd?.(k, Math.max(0, Math.min(1, sh.score)), sh);
  b.slideKey = '';
}

function scr(k) { return G.screens.find(s => s.id === k); }

function flub(k, kind, sev) {
  const sh = B[k].show;
  sh.flubs.push(kind);
  sh.score -= sev;
  hooks.onFlub?.(k, kind, sev);
}

// ------------------------------------------------------------------ player / staff actions
// Returns {label, hold, act} for what pressing E on projector `id` of screen k would do now, or null.
export function projectorAction(k, id, who = 'you') {
  const b = B[k], s = scr(k), sh = b.show, P = b.P[id];
  if (!P || !s.open) return null;
  const f = film(s.film);
  if (P.digital) {
    const pr = G.prints[s.film];
    if (!f) return { label: 'No feature booked on this screen', act: null };
    if (pr?.state === 'drive') return { label: `Ingest the DCP for ${f.title}`, hold: 1.0, act: () => { pr.state = 'ingesting'; b.ingest = 10; hooks.toast?.(`Ingesting ${f.title}…`); } };
    if (pr?.state === 'ingesting') return { label: `Ingesting… ${Math.ceil(b.ingest)}s`, act: null };
    if (sh && !sh.started) return { label: 'Automation will start the show', act: null };
    return { label: `Digital: ${f.title} — nothing to do (that’s the problem)`, act: null };
  }
  if (!f) return { label: 'Load a print (from the bench shelf) first', act: null };
  if (sh?.broken && (sh.active === id || P.platter)) {
    if (sh.broken.staffT !== undefined) return { label: 'The projectionist is splicing the break…', act: null };
    return { label: 'FILM BREAK — splice it back together', hold: 0.3, act: () => repairBreak(k, who) };
  }
  if (P.platter) {
    if (sh && sh.started) return { label: `Running ${f.title} off the platter`, act: null };
    if (!P.threaded) return { label: `Lace up the platter: ${f.title}`, hold: 1.8, act: () => { P.threaded = true; } };
    if (sh && !sh.started && G.t >= sh.startAt - 3) return { label: 'START THE SHOW', hold: 0, act: () => startShow(k, who) };
    return { label: 'Laced and ready', act: null };
  }
  // reel-to-reel
  if (P.played) return { label: `Rewind reel ${P.reel}`, hold: 1.1, act: () => { P.played = false; P.reel = null; P.threaded = false; refreshReelVisuals(k); } };
  if (P.reel === null) {
    const m = P.next;
    if (m > f.reels) return { label: 'No more reels for this machine tonight', act: null };
    return { label: `Thread reel ${m} of ${f.reels}`, hold: 1.3, act: () => { P.reel = m; P.threaded = true; P.motor = false; refreshReelVisuals(k); } };
  }
  if (sh && !sh.started) {
    if (id === 'A' && P.reel === 1 && G.t >= sh.startAt - 3) return { label: 'START THE SHOW (motor + douser)', hold: 0, act: () => startShow(k, who) };
    return { label: `Reel ${P.reel} threaded`, act: null };
  }
  if (sh && sh.started && sh.active !== id && P.reel === sh.reel + 1) {
    if (!P.motor) return { label: `Start motor (reel ${P.reel})`, hold: 0, act: () => { P.motor = true; P.motorAt = G.t; } };
    return { label: 'CHANGEOVER', hold: 0, act: () => changeover(k) };
  }
  if (sh && sh.started && sh.active === id) return { label: `Running reel ${P.reel} of ${f.reels}`, act: null };
  return { label: `Reel ${P.reel} threaded`, act: null };
}

export function motorKey(k) {
  const b = B[k], sh = b?.show;
  if (!sh || !sh.started || scr(k).tier !== 'reel') return false;
  const inc = b.P[sh.active === 'A' ? 'B' : 'A'];
  if (inc.reel === sh.reel + 1 && inc.threaded && !inc.motor) { inc.motor = true; inc.motorAt = G.t; return true; }
  return false;
}
export function changeKey(k) {
  const b = B[k], sh = b?.show;
  if (!sh || !sh.started || scr(k).tier !== 'reel') return false;
  const inc = b.P[sh.active === 'A' ? 'B' : 'A'];
  if (inc.reel === sh.reel + 1 && inc.motor) { changeover(k); return true; }
  return false;
}

function changeover(k) {
  const b = B[k], sh = b.show;
  const out = b.P[sh.active], inc = b.P[sh.active === 'A' ? 'B' : 'A'];
  const remaining = REEL_SECS - sh.reelT;          // picture left on the outgoing reel (negative = runout time)
  if (remaining > 1.8) flub(k, 'cut', Math.min(0.12, 0.03 + remaining * 0.01));
  // where is the incoming reel? 0 = right at the first picture frame
  const pos = (G.t - inc.motorAt) - LEADER;
  sh.reel = inc.reel; sh.active = inc.id;
  sh.reelT = Math.max(0, pos);
  if (pos < -1.0) { sh.leaderFlash = -pos; sh.reelT = 0; flub(k, 'leader', Math.min(0.2, -pos * 0.06)); }
  else if (pos > 1.5) flub(k, 'jump', Math.min(0.2, pos * 0.04));
  else hooks.onFlub?.(k, 'clean', 0);
  out.motor = false; out.played = true; out.next = out.reel + 2;
  inc.threaded = true;
  if (sh.runoutNow) sh.runoutNow = false;
  rollBreak(k);
  refreshReelVisuals(k);
}

function repairBreak(k, who) {
  const sh = B[k].show;
  if (!sh?.broken) return;
  if (who === 'staff') { if (sh.broken.staffT === undefined) sh.broken.staffT = 12; return; }
  hooks.openRepair?.(k, film(sh.film), res => {
    if (!B[k].show) return;
    if (res && !res.aborted) { sh.broken = null; if (res.framesLost > 6) sh.score -= 0.04; }
  });
}

// ------------------------------------------------------------------ per-frame
export function updateBooth(dt, t) {
  for (const k in B) {
    const b = B[k], s = scr(+k);
    if (!s.open) { b.beam.visible = false; continue; }
    if (b.ingest > 0) { b.ingest -= dt; if (b.ingest <= 0) { const pr = G.prints[s.film]; if (pr && pr.state === 'ingesting') { pr.state = 'ingested'; hooks.toast?.(`DCP ingested: ${film(s.film).title}. KDM valid.`); } } }
    const sh = b.show;
    // reel spin
    for (const P of Object.values(b.P)) {
      if (P.motor && P.upper) { P.upper.rotation.x -= dt * 5; P.lower.rotation.x -= dt * 7; }
    }
    if (b.platter && sh?.started && !sh.broken) b.platter.children.forEach((c, i) => { if (c.name.startsWith('platter_disc')) c.rotation.y += dt * (i === 1 ? 1.2 : 0.9); });
    if (sh && !sh.ended) {
      if (!sh.started) {
        const pr = G.prints[sh.film];
        if (s.tier === 'digital' && pr?.state === 'ingested' && G.t >= sh.startAt) startShow(+k, 'auto');
      } else if (sh.preroll > 0) {
        sh.preroll -= dt;
      } else if (sh.broken) {
        sh.score -= dt * 0.004;
        if (sh.broken.staffT !== undefined) { sh.broken.staffT -= dt; if (sh.broken.staffT <= 0) sh.broken = null; }
      } else {
        const f = film(sh.film);
        if (s.tier === 'reel') {
          const act = b.P[sh.active];
          if (sh.leaderFlash > 0) { sh.leaderFlash -= dt; }
          else if (act.motor) {
            sh.reelT += dt;
            if (sh.breakAt != null && sh.reelT >= sh.breakAt) { sh.breakAt = null; sh.broken = { at: G.t }; flub(+k, 'break', 0.2); hooks.onBreak?.(+k); }
            if (sh.reelT >= REEL_SECS) {
              if (sh.reel >= f.reels) { act.motor = false; act.played = true; refreshReelVisuals(+k); endShow(+k); continue; }
              // runout: white screen until someone changes over
              sh.runout += dt;
              if (!sh.runoutNow) { sh.runoutNow = true; flub(+k, 'runout', 0.08); }
              sh.score -= dt * 0.035;
            }
          }
        } else {
          sh.reelT += dt;
          if (sh.breakAt != null && sh.reelT >= sh.breakAt) { sh.breakAt = null; sh.broken = { at: G.t }; flub(+k, 'break', 0.2); hooks.onBreak?.(+k); }
          if (sh.reelT >= f.reels * REEL_SECS) { endShow(+k); continue; }
        }
      }
    }
    // beam
    const lit = sh?.started && !sh.ended && !(s.tier === 'reel' && !b.P[sh.active]?.motor);
    b.beam.visible = !!lit;
    if (lit) {
      const P = b.P[sh.active] || b.P.A;
      const from = new THREE.Vector3(P.obj.position.x, L.booth.y + 1.05, P.obj.position.z - (P.digital ? 0.75 : 0.62));
      const S = L.aud.screen;
      aimBeam(b.beam, from, new THREE.Vector3(b.cx, S.y + S.h / 2, S.z + 0.05), S.w * 0.98, S.h * 0.98);
      b.beam.material.uniforms.uT.value = t;
      b.beam.material.uniforms.uI.value = sh.broken ? 0.4 : 1;
    }
    // paint the screen (every frame when someone's looking, else a few times a second)
    b.paintAcc += dt;
    if (b.visible || b.paintAcc > 0.25) { b.paintAcc = 0; paintScreen(+k, t); }
  }
}

// ------------------------------------------------------------------ painting
const shotCache = new Map();
function shotCanvas(filmId, shot, v) {
  const key = `${filmId}:${shot}:${v}`;
  let c = shotCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext('2d');
  try { F.paintShot(g, filmId, shot, CW, CH, v / 4); }
  catch (e) { g.fillStyle = '#334'; g.fillRect(0, 0, CW, CH); g.fillStyle = '#fff'; g.font = 'bold 30px Georgia'; g.textAlign = 'center'; g.fillText(film(filmId)?.title || filmId, CW / 2, CH / 2); }
  // average colour for the spill light
  const t1 = document.createElement('canvas'); t1.width = t1.height = 1;
  const g1 = t1.getContext('2d'); g1.drawImage(c, 0, 0, 1, 1);
  const d = g1.getImageData(0, 0, 1, 1).data;
  c.avg = [d[0] / 255, d[1] / 255, d[2] / 255];
  shotCache.set(key, c);
  if (shotCache.size > 400) shotCache.delete(shotCache.keys().next().value);
  return c;
}
export function currentShot(k) {
  const sh = B[k].show, s = scr(k);
  if (!sh) return null;
  const f = film(sh.film);
  let reel = sh.reel, rt = sh.reelT;
  if (s.tier !== 'reel') { reel = Math.min(f.reels, Math.floor(sh.reelT / REEL_SECS) + 1); rt = sh.reelT - (reel - 1) * REEL_SECS; }
  const S = f.shots;
  const shot = rt < REEL_SECS / 2 ? (reel - 1) % S : reel % S;
  return { f, reel, rt, shot };
}

function paintScreen(k, t) {
  const b = B[k], g = b.ctx, sh = b.show, s = scr(k);
  const light = W.lights['spill_' + k];
  if (!sh || !sh.started) {
    // house slide between shows
    const f = film(s.film);
    const key = `slide:${s.film}:${sh ? 'soon' : 'idle'}:${G.flags.omni ? 1 : 0}:${G.flags.finale ? 1 : 0}`;
    if (key !== b.slideKey) {
      b.slideKey = key;
      const gr = g.createRadialGradient(CW / 2, CH / 2, 20, CW / 2, CH / 2, CW * 0.7);
      gr.addColorStop(0, G.flags.omni ? '#1b2f63' : '#3a2412'); gr.addColorStop(1, '#070504');
      g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = G.flags.omni ? '#9fc0ff' : '#e9c27a';
      g.font = 'bold 30px Georgia, serif';
      g.fillText(G.flags.omni ? 'OMNIPLEX® CINEMAS' : 'Paper Street Picture House', CW / 2, 72);
      g.font = 'italic 18px Georgia, serif'; g.fillStyle = '#d8cbb0';
      g.fillText(f ? (sh ? 'Our feature presentation will begin shortly' : 'Next on this screen') : 'Dark tonight', CW / 2, 126);
      if (f) { g.font = 'bold 34px Georgia, serif'; g.fillStyle = '#fff3d6'; g.fillText(f.title, CW / 2, 172); }
      g.font = '14px Georgia, serif'; g.fillStyle = '#a89878';
      g.fillText(G.flags.omni ? 'Please enjoy a large popcorn. It is mandatory.' : 'Please silence your pagers. Do not talk about the booth.', CW / 2, 236);
      b.tex.needsUpdate = true;
      if (light) { light.intensity = 1.2; light.color.setRGB(0.6, 0.45, 0.3); }
    }
    return;
  }
  b.slideKey = '';
  const runoutWhite = s.tier === 'reel' && sh.runoutNow;
  const dark = s.tier === 'reel' && !b.P[sh.active]?.motor;
  if (sh.preroll > 0) {
    g.fillStyle = '#0c2a7a'; g.fillRect(0, 0, CW, CH);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 40px "Segoe UI", sans-serif'; g.fillText('BUY A LARGE.', CW / 2, CH / 2 - 20);
    g.font = '18px "Segoe UI", sans-serif'; g.fillText('An OmniPlex® message. You are not your ticket stub.', CW / 2, CH / 2 + 26);
    setSpill(light, [0.2, 0.3, 0.8], 3);
  } else if (sh.broken) {
    const since = G.t - sh.broken.at;
    const cur = currentShot(k);
    if (since < 1.2 && cur) {
      g.drawImage(shotCanvas(cur.f.id, cur.shot, 0), 0, 0);
      // the frame melting in the gate
      const r = since * 140;
      const gr = g.createRadialGradient(CW * 0.55, CH * 0.45, r * 0.2, CW * 0.55, CH * 0.45, r);
      gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.7, '#ffcc66'); gr.addColorStop(0.85, '#5a2a08'); gr.addColorStop(1, 'rgba(40,20,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(CW * 0.55, CH * 0.45, r, 0, 7); g.fill();
    } else { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, CW, CH); grain(g, 0.25); }
    setSpill(light, [1, 0.97, 0.9], 5);
  } else if (dark) {
    g.fillStyle = '#000'; g.fillRect(0, 0, CW, CH);
    setSpill(light, [0, 0, 0], 0);
  } else if (runoutWhite) {
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, CW, CH); grain(g, 0.35);
    g.fillStyle = 'rgba(0,0,0,.6)'; for (let i = 0; i < 3; i++) g.fillRect(Math.random() * CW, 0, 1.5, CH);
    setSpill(light, [1, 0.97, 0.9], 6);
  } else if (sh.leaderFlash > 0) {
    const n = Math.max(2, Math.min(8, Math.ceil(sh.leaderFlash) + 1));
    try { F.paintLeader(g, 'countdown', n - (sh.leaderFlash % 1), CW, CH); } catch { g.fillStyle = '#999'; g.fillRect(0, 0, CW, CH); g.fillStyle = '#000'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.fillText(String(n), CW / 2, CH / 2 + 40); }
    setSpill(light, [0.7, 0.7, 0.7], 4);
  } else {
    const cur = currentShot(k);
    const v = Math.floor(t * 6) % 4;
    const img = shotCanvas(cur.f.id, cur.shot, v);
    const film35 = s.tier !== 'digital';
    if (film35) {
      const wx = (Math.sin(t * 23) + Math.sin(t * 37)) * 0.6, wy = (Math.sin(t * 29) + Math.sin(t * 17)) * 0.8;
      g.drawImage(img, wx - 2, wy - 2, CW + 4, CH + 4);
      const fl = 0.04 + Math.random() * 0.04;
      g.fillStyle = `rgba(0,0,0,${fl})`; g.fillRect(0, 0, CW, CH);
      if (Math.random() < 0.3) { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(Math.random() * CW, Math.random() * CH, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      if (Math.random() < 0.15) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(Math.random() * CW, 0, 1, CH); }
      // cigarette burns near the end of each reel (not on the last one)
      if (s.tier === 'reel' && cur.reel < cur.f.reels) {
        const left = REEL_SECS - sh.reelT;
        if ((left <= MOTOR_CUE && left > MOTOR_CUE - CUE_SHOW) || (left <= CHANGE_CUE && left > CHANGE_CUE - CUE_SHOW)) {
          try { F.paintCue(g, CW, CH); } catch { cueFallback(g); }
          sh.cueVisible = true;
        } else sh.cueVisible = false;
      }
    } else g.drawImage(img, 0, 0);
    // a mischief frame flashes up for a single frame, now and then
    const pr = G.prints[cur.f.id];
    if (pr?.mischief?.length && film35 && Math.random() < 0.004) { try { F.paintMischief(g, pr.mischief[Math.floor(Math.random() * pr.mischief.length)], CW, CH); } catch {} }
    setSpill(light, img.avg, 6);
  }
  b.tex.needsUpdate = true;
}
function setSpill(light, c, i) { if (!light) return; light.color.setRGB(c[0] * 0.8 + 0.2, c[1] * 0.8 + 0.2, c[2] * 0.8 + 0.2); light.intensity = i; }
function grain(g, a) { for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * a})`; g.fillRect(Math.random() * CW, Math.random() * CH, 2, 2); } }
function cueFallback(g) { g.fillStyle = '#111'; g.beginPath(); g.arc(CW * 0.9, CH * 0.12, 9, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }

// What the HUD shows: per screen, a compact status line.
export function status(k) {
  const b = B[k], s = scr(k), sh = b.show;
  if (!s.open) return null;
  const f = film(s.film);
  if (!sh) return { k, text: f ? 'idle' : 'no print', urgent: false };
  if (!sh.started) return { k, text: G.t < sh.startAt ? `starts in ${Math.ceil(sh.startAt - G.t)}s` : `LATE ${Math.ceil(G.t - sh.startAt)}s`, urgent: G.t >= sh.startAt - 5 };
  if (sh.broken) return { k, text: 'FILM BREAK', urgent: true };
  if (s.tier === 'reel') {
    const left = REEL_SECS - sh.reelT;
    if (sh.runoutNow) return { k, text: 'RUNOUT!', urgent: true };
    return { k, text: `reel ${sh.reel}/${f.reels} · ${Math.max(0, Math.ceil(left))}s`, urgent: sh.reel < f.reels && left < MOTOR_CUE + 3, cue: !!sh.cueVisible };
  }
  return { k, text: `${Math.floor(sh.reelT / (f.reels * REEL_SECS) * 100)}%`, urgent: false };
}
