// Sky dome, toon sea, drifting clouds, background islands, balloons, a blimp and some gulls.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { make, toon, RAW_OUT } from './assets.js';
import { SEA_Y } from './course.js';
import { backNine } from './nine.js';

export class Sky {
  constructor(scene) {
    this.scene = scene; this.t = 0;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0.45, 0.55, 0.7).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `varying vec3 vD; uniform vec3 uSun;
        vec3 s2l(vec3 c){ return pow(c, vec3(2.2)); }
        void main(){
          float h = vD.y;
          vec3 top = s2l(vec3(0.27,0.55,0.95)), mid = s2l(vec3(0.55,0.80,1.0)), hor = s2l(vec3(0.93,0.95,0.92)), low = s2l(vec3(0.62,0.84,0.95));
          ${backNine ? 'top = s2l(vec3(.31,.33,.63)); mid = s2l(vec3(.74,.57,.71)); hor = s2l(vec3(1.,.83,.64)); low = s2l(vec3(.62,.76,.82));' : ''}
          vec3 c = h > 0. ? mix(hor, mix(mid, top, smoothstep(0.15, 0.7, h)), smoothstep(0.0, 0.18, h)) : mix(hor, low, smoothstep(0.0, -0.2, h));
          float s = max(0., dot(vD, uSun));
          c += s2l(vec3(1.0,0.93,0.7)) * (smoothstep(0.9965, 0.998, s) * 1.2 + pow(s, 60.) * 0.35 + pow(s, 6.) * 0.08);
          gl_FragColor = vec4(c, 1.);${RAW_OUT}
        }`,
    }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    scene.add(sky); this.sky = sky;

    // Sea with drifting foam and a darker band where it meets the spire.
    const seaMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    seaMat.userData.t = { value: 0 };
    seaMat.onBeforeCompile = sh => {
      sh.uniforms.uTime = seaMat.userData.t;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWP; uniform float uTime;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
          float r = length(vWP.xz);
          vec2 p = vWP.xz * 0.06;
          float n = vn(p + vec2(uTime * 0.05, uTime * 0.03)) + vn(p * 2.7 - vec2(uTime * 0.04, 0.)) * 0.5;
          float foam = smoothstep(1.05, 1.15, n);
          float shore = smoothstep(32., 22., r) * (0.5 + 0.5 * sin(r * 1.2 - uTime * 2.0));
          vec3 deep = pow(vec3(0.13,0.50,0.78), vec3(2.2)), shallow = pow(vec3(0.25,0.75,0.88), vec3(2.2));
          vec3 col = mix(deep, shallow, smoothstep(140., 20., r)) + foam * 0.55 + shore * 0.35;
          vec4 diffuseColor = vec4(col, 1.);`);
    };
    this.seaMat = seaMat;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2), seaMat);
    sea.position.y = SEA_Y; sea.receiveShadow = false; scene.add(sea);

    // Clouds: some above, many below the course so you feel how high up you are.
    this.clouds = [];
    for (let i = 0; i < 34; i++) {
      const c = make(Math.random() < 0.5 ? 'cloud_a' : 'cloud_b');
      c.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.material = toon(0xffffff, { emissive: 0xd8e8ff, emissiveIntensity: 0.35 }); } });
      const a = Math.random() * Math.PI * 2, r = 110 + Math.random() * 300;
      const y = i < 12 ? -32 + Math.random() * 18 : 10 + Math.random() * 90;
      c.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      c.scale.setScalar(1 + Math.random() * 2.2);
      c.rotation.y = Math.random() * 6;
      c.userData = { a, r, y, sp: (0.004 + Math.random() * 0.006) * (Math.random() < 0.5 ? 1 : -1) };
      scene.add(c); this.clouds.push(c);
    }
    // Islands on the horizon.
    for (let i = 0; i < 7; i++) {
      const isl = make('island');
      const a = i / 7 * Math.PI * 2 + Math.random() * 0.4, r = 260 + Math.random() * 220;
      isl.position.set(Math.cos(a) * r, SEA_Y, Math.sin(a) * r); isl.rotation.y = Math.random() * 6; isl.scale.setScalar(1 + Math.random() * 1.5);
      isl.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      scene.add(isl);
    }
    // Hot air balloons and a blimp circling the mountain.
    this.floaters = [];
    const tints = ['#ff5d73', '#ffd23f', '#36c5f0', '#a76bff'];
    for (let i = 0; i < 4; i++) {
      const b = make('balloon');
      b.traverse(o => { if (o.isMesh && /balloon|stripe/i.test(o.material.name)) { o.material = o.material.clone(); if (/1|a$/i.test(o.material.name)) o.material.color.set(tints[i]); } });
      b.userData = { r: 90 + i * 25, y: 15 + i * 14, sp: 0.02 + i * 0.006, a: i * 1.7, bob: Math.random() * 6 };
      scene.add(b); this.floaters.push(b);
    }
    const blimp = make('blimp');
    blimp.userData = { r: 150, y: 95, sp: -0.025, a: 2, bob: 0, blimp: true };
    scene.add(blimp); this.floaters.push(blimp);
    // The studio's slop blob (from the Vibe Coded Slopware logo), wrapped onto the middle of the hull on both
    // sides. The decal is cut from the hull itself, so it follows the curve.
    // It sits across the red band round the middle, so it is cut from the band as well as the hull.
    let hull = null; const skins = []; blimp.traverse(o => { if (o.isMesh && /^blimp(_stripe)?$/.test(o.material.name)) { skins.push(o); if (o.material.name === 'blimp') hull = o; } });
    if (hull) {
      const logo = new THREE.TextureLoader().load('assets/slop-blob.png');
      logo.colorSpace = THREE.SRGBColorSpace; logo.magFilter = THREE.NearestFilter; logo.anisotropy = 4;
      const decalMat = new THREE.MeshLambertMaterial({ map: logo, emissive: 0xffffff, emissiveMap: logo, emissiveIntensity: 0.3, transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      blimp.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(hull), mid = bb.getCenter(new THREE.Vector3()), rx = (bb.max.x - bb.min.x) / 2, h = (bb.max.y - bb.min.y) * 0.62;
      for (const side of [1, -1]) {
        for (const skin of skins) {
          const geo = new DecalGeometry(skin, new THREE.Vector3(mid.x + side * rx, mid.y, mid.z + 0.2), new THREE.Euler(0, side * Math.PI / 2, 0), new THREE.Vector3(h * 550 / 410, h, rx * 1.6));
          const d = new THREE.Mesh(geo, decalMat); d.renderOrder = 2; blimp.add(d);
        }
      }
    }
    // Banner trailing the blimp: the studio's address, in slop green.
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#fff6df'; g.fillRect(0, 0, 1024, 128);
    const words = 'vibecodedslopware.com';
    g.font = '900 84px "Trebuchet MS", system-ui'; const px = Math.floor(84 * Math.min(1, 960 / g.measureText(words).width));
    g.font = '900 ' + px + 'px "Trebuchet MS", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 10; g.strokeStyle = '#0b3d1e'; g.strokeText(words, 512, 66);
    g.fillStyle = '#4cc63a'; g.fillText(words, 512, 66);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    // Two one-sided faces back to back, so the address reads the right way round from either side.
    const bannerMat = new THREE.MeshBasicMaterial({ map: tex });
    for (const turn of [Math.PI / 2, -Math.PI / 2]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), bannerMat);
      banner.rotation.y = turn; banner.position.set(0, -1, -16);
      blimp.add(banner);
    }
    // Gulls: little flapping V shapes.
    this.gulls = [];
    const gullGeo = new THREE.BufferGeometry();
    gullGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.6, 0.15, 0, 0, 0, 0.1, 0, 0, -0.1, 0.6, 0.15, 0, 0, 0, 0.1, 0, 0, -0.1]), 3));
    const gm = new THREE.MeshBasicMaterial({ color: 0x3b3346, side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(gullGeo.clone(), gm);
      m.userData = { r: 50 + Math.random() * 60, y: Math.random() * 80, sp: 0.1 + Math.random() * 0.1, a: Math.random() * 6, ph: Math.random() * 6 };
      m.scale.setScalar(1.4); scene.add(m); this.gulls.push(m);
    }
  }
  update(t, dt) {
    this.seaMat.userData.t.value = t;
    for (const c of this.clouds) { const u = c.userData; u.a += u.sp * dt; c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r); }
    for (const f of this.floaters) {
      const u = f.userData; u.a += u.sp * dt;
      f.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.4 + u.bob) * 2, Math.sin(u.a) * u.r);
      if (u.blimp) f.rotation.y = -u.a + (u.sp < 0 ? 0 : Math.PI);
    }
    for (const g of this.gulls) {
      const u = g.userData; u.a += u.sp * dt;
      g.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t + u.ph) * 3, Math.sin(u.a) * u.r);
      g.rotation.y = -u.a;
      const flap = Math.sin(t * 8 + u.ph) * 0.35, p = g.geometry.attributes.position;
      p.setY(0, 0.15 + flap); p.setY(3, 0.15 + flap); p.needsUpdate = true;
    }
  }
}
