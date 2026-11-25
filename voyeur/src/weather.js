// Weather: clear, cloudy, rain, thunderstorms and snow, drifting from one to the next every few
// game hours with odds that follow the season. Rain falls at real speed, streets and bricks darken
// and shine when wet, the sky goes grey, lightning lights up the whole block, and now and then a
// storm knocks the power out and people light candles.
import * as THREE from 'three';
import { range, pick, damp, weighted } from './util.js';
import { SW_Y } from './building.js';
import { makeProp } from './avatar.js';

const R = Math.random;
const STATES = {
  clear: { cloud: 0.05, rain: 0, storm: 0, snow: 0, label: 'Clear' },
  cloudy: { cloud: 0.75, rain: 0, storm: 0, snow: 0, label: 'Overcast' },
  rain: { cloud: 0.9, rain: 0.7, storm: 0, snow: 0, label: 'Rain' },
  storm: { cloud: 1, rain: 1, storm: 1, snow: 0, label: 'Thunderstorm' },
  snow: { cloud: 0.85, rain: 0, storm: 0, snow: 1, label: 'Snow' },
};
const RAIN_N = 5000;

export class Weather {
  constructor(world, forced) {
    this.world = world;
    this.p = { cloud: 0, rain: 0, storm: 0, snow: 0, wet: 0, flash: 0 };
    this.state = forced && STATES[forced] ? forced : this.pick(true);
    Object.assign(this.p, STATES[this.state]);
    this.p.wet = this.p.rain;
    this.next = world.time + range(R, 120, 360);
    this.flashT = 8; this.pulses = []; this.outage = null;
    this.makeRain();
    this.makeBolt();
    this.flashLight = new THREE.DirectionalLight(0xc8d4ff, 0);
    this.flashLight.position.set(-30, 80, -60);
    world.scene.add(this.flashLight);
    this.umbrellas = new Set();
  }
  get label() { return STATES[this.state].label + (this.outage ? ' · power out' : ''); }

  pick(first) {
    const s = this.world.season || {};
    const winter = s.snow || /Winter/.test(s.name || '');
    const summer = /Summer/.test(s.name || '');
    const table = winter ? [[4, 'clear'], [3, 'cloudy'], [3, 'snow'], [0.5, 'rain']]
      : summer ? [[5, 'clear'], [2, 'cloudy'], [1.5, 'rain'], [1.5, 'storm']]
      : [[4, 'clear'], [3, 'cloudy'], [2.5, 'rain'], [0.7, 'storm']];
    if (first) return weighted(R, table);
    // weather drifts: storms clear to rain, rain to cloud, and so on
    const from = this.state;
    const near = { clear: ['cloudy', 'clear'], cloudy: ['clear', 'rain', 'snow', 'cloudy'], rain: ['cloudy', 'storm', 'rain'], storm: ['rain', 'cloudy'], snow: ['cloudy', 'snow'] }[from];
    return weighted(R, table.filter(([, k]) => near.includes(k)).concat([[0.2, 'cloudy']]));
  }
  set(state, quiet) {
    if (!STATES[state] || state === this.state) return;
    const W = this.world;
    const was = this.state;
    this.state = state;
    this.next = W.time + range(R, 120, 360);
    if (!quiet) {
      const msg = { rain: was === 'storm' ? 'The storm eases to steady rain' : 'Rain moving in', storm: 'A thunderstorm rolls in', snow: 'It starts to snow', cloudy: was === 'rain' || was === 'storm' || was === 'snow' ? 'It lets up' : 'Clouds rolling in', clear: 'The sky clears' }[state];
      if (msg) W.toast(msg);
    }
  }

  makeRain() {
    const pos = new Float32Array(RAIN_N * 6);
    this.drops = new Float32Array(RAIN_N * 4);
    for (let i = 0; i < RAIN_N; i++) this.seedDrop(i, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab4c8, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.world.scene.add(this.rain);
    const sp = new Float32Array(400 * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.splash = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xc8d0dc, size: 0.05, transparent: true, opacity: 0, depthWrite: false }));
    this.splash.frustumCulled = false;
    this.world.scene.add(this.splash);
  }
  seedDrop(i, anyY) {
    const d = this.drops;
    // more drops near the street (where close-ups look) than far up the facade
    d[i * 4] = range(R, -26, 26);
    d[i * 4 + 1] = anyY ? range(R, 0, 32) : range(R, 30, 33);
    d[i * 4 + 2] = R() < 0.55 ? range(R, 0.2, 9) : range(R, 9, 20);
    d[i * 4 + 3] = range(R, 8, 10.5);
  }
  makeBolt() {
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(5, 5, 6), fog: false }));
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    this.world.scene.add(this.bolt);
  }
  strike() {
    const pts = [];
    let x = range(R, -90, 90), y = 95, z = range(R, -130, -180);
    pts.push(new THREE.Vector3(x, y, z));
    while (y > 30) { y -= range(R, 4, 9); x += range(R, -6, 6); pts.push(new THREE.Vector3(x, y, z)); }
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const t = this.world.realT;
    const n = 2 + Math.floor(R() * 3);
    this.pulses = [];
    let at = t;
    for (let i = 0; i < n; i++) { this.pulses.push([at, at + range(R, 0.05, 0.12), i === 0 ? 1 : range(R, 0.4, 0.9)]); at += range(R, 0.08, 0.25); }
    // a strike near enough can take the block's power out for a few minutes
    if (!this.outage && R() < 0.12) this.outage = { until: t + range(R, 90, 240), started: false };
  }

  update(dt) {
    const W = this.world, p = this.p, t = W.realT;
    if (W.time >= this.next) this.set(this.pick(false));
    const s = STATES[this.state];
    const winter = W.season && W.season.snow;
    const precipAsSnow = winter && this.state === 'rain';
    p.cloud = damp(p.cloud, s.cloud, 0.08, dt);
    p.rain = damp(p.rain, precipAsSnow ? 0 : s.rain, 0.1, dt);
    p.snow = damp(p.snow, precipAsSnow ? 0.7 : s.snow, 0.1, dt);
    p.storm = damp(p.storm, s.storm, 0.1, dt);
    p.wet = p.rain > p.wet ? damp(p.wet, p.rain, 0.15, dt) : Math.max(p.rain, p.wet - dt / 600);
    // lightning
    if (p.storm > 0.5) { this.flashT -= dt; if (this.flashT <= 0) { this.flashT = range(R, 6, 26); this.strike(); } }
    let f = 0;
    for (const [a, b, k] of this.pulses) if (t >= a && t <= b) f = Math.max(f, k);
    p.flash = f;
    this.bolt.visible = f > 0.7;
    this.flashLight.intensity = f * 1.6;
    // falling snow follows the weather now, not just the calendar
    W.snow.visible = p.snow > 0.03;
    W.snow.material.opacity = Math.min(1, p.snow * 1.2);
    this.updateRain(dt);
    this.updateOutage(dt);
  }
  updateRain(dt) {
    const p = this.p;
    const n = Math.floor(RAIN_N * Math.min(1, p.rain));
    this.rain.visible = n > 0;
    this.splash.visible = n > 0;
    if (!n) return;
    const d = this.drops, a = this.rain.geometry.attributes.position.array;
    const wind = 0.9 + p.storm * 2.2;
    for (let i = 0; i < n; i++) {
      d[i * 4 + 1] -= d[i * 4 + 3] * dt;
      d[i * 4] -= wind * dt;
      if (d[i * 4 + 1] < 0) this.seedDrop(i, false);
      const x = d[i * 4], y = d[i * 4 + 1], z = d[i * 4 + 2], L = 0.5;
      a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z;
      a[i * 6 + 3] = x + wind * 0.05; a[i * 6 + 4] = y + L; a[i * 6 + 5] = z;
    }
    this.rain.geometry.setDrawRange(0, n * 2);
    this.rain.geometry.attributes.position.needsUpdate = true;
    const day = this.world.dayF;
    this.rain.material.opacity = 0.14 + 0.14 * day + this.p.flash * 0.25;
    this.rain.material.color.setRGB(0.55 + 0.2 * day, 0.6 + 0.2 * day, 0.7 + 0.2 * day);
    const sp = this.splash.geometry.attributes.position.array;
    const m = Math.floor(400 * p.rain);
    for (let i = 0; i < m; i++) { const ground = R() < 0.6; sp[i * 3] = range(R, -24, 24); sp[i * 3 + 1] = ground ? SW_Y + 0.02 : 0.02; sp[i * 3 + 2] = ground ? range(R, 0.3, 3.8) : range(R, 4.2, 16); }
    this.splash.geometry.setDrawRange(0, m);
    this.splash.geometry.attributes.position.needsUpdate = true;
    this.splash.material.opacity = 0.35 + 0.25 * day;
  }
  updateOutage() {
    const W = this.world, o = this.outage;
    if (!o) return;
    const t = W.realT;
    if (!o.started && this.p.flash === 0 && this.pulses.length && t > this.pulses[this.pulses.length - 1][1]) {
      o.started = true;
      W.toast('The power just went out on the whole block');
    }
    if (!o.started) return;
    if (t > o.until) {
      this.outage = null;
      W.toast('The power is back');
      for (const u of W.units) if (u.rooms.L.tvWatch.size) u.rooms.L.set(2, true);
      return;
    }
    // everything electric is off; people with nothing better to do light a candle
    for (const r of W.rooms) for (const L of r.lights) if (L) L.on = false;
    for (const m of W.B.signs) m.emissiveIntensity = 0;
    W.B.openSign.material.color.setScalar(0);
    for (const l of W.shopLights) l.intensity = 0;
    W.lobbyLight.intensity = 0;
    for (const u of W.units) if (u.strip) { u.strip.instanceColor.array.fill(0.03); u.strip.instanceColor.needsUpdate = true; }
    for (const u of W.units) {
      const home = u.residents.some((q) => q.where === 'home' && !q.asleep && !q.hidden);
      if (home && !u.rooms.L.dyn && W.dayF < 0.5) {
        const fl = 0.85 + 0.15 * Math.sin(t * 11 + u.index) * Math.sin(t * 7.3 + u.index * 2);
        u.rooms.L.dyn = { pos: new THREE.Vector3(u.X(1.72), u.y + 0.6, u.Z(-2.1)), col: new THREE.Vector3(1, 0.55, 0.2).multiplyScalar(1.3 * fl) };
      }
    }
  }

  // Changes the frame's sky and light after the world has set them for the time of day.
  affectEnv() {
    const W = this.world, p = this.p, U = W.sky.uniforms, day = W.dayF;
    const c = p.cloud;
    const grey = new THREE.Color(0.34, 0.36, 0.4).multiplyScalar(0.12 + 0.88 * day);
    U.uTop.value.lerp(grey, c * 0.9);
    U.uHor.value.lerp(grey.clone().multiplyScalar(1.15), c * 0.85);
    U.uSunCol.value.multiplyScalar(1 - c * 0.95);
    U.uStars.value *= 1 - c;
    if (W.scene.fog) W.scene.fog.color.copy(U.uHor.value);
    if (p.flash) { U.uTop.value.add(new THREE.Color(0.35, 0.38, 0.55).multiplyScalar(p.flash * 0.7)); U.uHor.value.add(new THREE.Color(0.4, 0.42, 0.6).multiplyScalar(p.flash * 0.6)); }
    W.sun.intensity *= 1 - c * 0.85;
    W.hemi.intensity = W.hemi.intensity * (1 - c * 0.25) + p.flash * 0.9;
    W.hemi.color.lerp(new THREE.Color(0.7, 0.72, 0.78), c * 0.6);
    W.shared.uDay.value.multiplyScalar(1 - c * 0.45);
    W.shared.uAmb.value.add(new THREE.Vector3(0.12, 0.13, 0.18).multiplyScalar(p.flash));
    W.exposure *= 1 + c * 0.12 * day;
    // wet streets and bricks: darker, and shiny under the street lamps
    const wet = p.wet;
    W.B.sidewalkMat.roughness = 0.95 - wet * 0.6;
    W.B.roadMat.roughness = 0.92 - wet * 0.72;
    if (!W.season.snow) { W.B.sidewalkMat.color.setScalar(1 - wet * 0.38); W.B.roadMat.color.setScalar(1 - wet * 0.45); }
    W.B.ext.brick.color.setScalar(1 - wet * 0.22);
    W.B.ext.brick.roughness = 0.92 - wet * 0.35;
    if (W.scene.fog) W.scene.fog.density = 0.0022 + c * 0.0018 + p.rain * 0.0035 + p.snow * 0.005;
    if (this.outage && this.outage.started) {
      for (const L of W.B.lamps) { L.light.intensity = 0; L.head.material.color.setScalar(0.05); }
      for (const nb of W.B.neighbors) nb.mat.emissiveIntensity = 0.02;
      W.B.skyline.emissiveIntensity *= 0.5;
    }
  }

  // Anyone walking outside in the rain gets an umbrella (crews and medics excepted).
  umbrellaFor(a) {
    const want = this.p.rain > 0.25 && !a.hidden && !a.room && a.av.kind === 'human' && !a.role && a.pos.y < 1;
    if (want && !a.umbrella) {
      const u = makeProp('umbrella');
      u.group.position.set(0.12 * a.av.s, 0.62 * a.av.s, 0.08);
      for (const m of u.meshes) { m.material = a.mat; a.meshes.push(m); }
      a.av.J.torso.add(u.group);
      a.umbrella = u;
    } else if (!want && a.umbrella) {
      a.av.J.torso.remove(a.umbrella.group);
      a.meshes = a.meshes.filter((m) => !a.umbrella.meshes.includes(m));
      a.umbrella = null;
    }
  }
}
