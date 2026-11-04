// Blueprint look: ghosted housings with fresnel edges, hatched section caps where the cut plane goes through
// metal, white linework (feature edges plus a true section outline), and flat "inked" solids for moving parts.
import * as THREE from 'three';

export const INK = {
  paper: 0x0d3a66, line: 0xdcefff, faint: 0x8fc3ee, cap: 0x1d5c94, hatch: 0xcfe8ff,
  keyPin: 0xffc861, driver: 0xe9f3ff, spring: 0x8fe3ff, pick: 0xff7a45, wrench: 0xffe27a, set: 0x7dffb0,
  bind: 0xffb340, over: 0xff5a5a, ward: 0xb9d7f5, lever: 0xcfe4ff, skin: 0xe8eef7,
};

// One shared cut plane. Every clippable material references it; the keyway view moves it out of the way.
export const CUT = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
const FAR_CUT = 1e6;
/** Uniforms shared by every ghost material (the section view is orthographic, the keyway view is not). */
export const SHARED = { uOrtho: { value: 0 } };
export function setCut(on, normal, constant = 0) {
  if (normal) CUT.normal.copy(normal);
  CUT.constant = on ? constant : FAR_CUT;
}

const ghostVS = /* glsl */`
#include <common>
#include <clipping_planes_pars_vertex>
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
  vN = normalize(normalMatrix * normal);
  vV = -mvPosition.xyz;
}`;
const ghostFS = /* glsl */`
#include <common>
#include <clipping_planes_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRim;
uniform float uOrtho;
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(vV);
  float f = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.2);
  float lit = 0.55 + 0.45 * clamp(dot(n, normalize(vec3(-0.3, 0.6, 0.7))), 0.0, 1.0);
  float a = uOpacity * (gl_FrontFacing ? 1.0 : 0.55) + f * uRim;
  gl_FragColor = vec4(uColor * (lit + f * 0.8), clamp(a, 0.0, 1.0));
}`;

export function ghostMaterial(color = INK.faint, opacity = 0.08, rim = 0.55) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uRim: { value: rim }, uOrtho: SHARED.uOrtho },
    vertexShader: ghostVS, fragmentShader: ghostFS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    clipping: true, clippingPlanes: [CUT],
  });
}

const capFS = /* glsl */`
#include <common>
#include <clipping_planes_pars_fragment>
uniform vec3 uFill;
uniform vec3 uHatch;
uniform float uSpacing;
uniform float uAlpha;
uniform float uDir;
uniform float uMix;
void main() {
  #include <clipping_planes_fragment>
  float s = mod(gl_FragCoord.x + uDir * gl_FragCoord.y, uSpacing);
  float line = 1.0 - smoothstep(0.6, 1.6, s);
  gl_FragColor = vec4(mix(uFill, uHatch, line * uMix), uAlpha);
}`;
/** Section cap: drawn only where the cut opens a closed solid (its back faces show through the cut). */
export function capMaterial(fill = INK.cap, spacing = 7, alpha = 1, dir = -1, mix = 0.85) {
  return new THREE.ShaderMaterial({
    uniforms: { uFill: { value: new THREE.Color(fill) }, uHatch: { value: new THREE.Color(INK.hatch) }, uSpacing: { value: spacing }, uAlpha: { value: alpha },
      uDir: { value: dir }, uMix: { value: mix } },
    vertexShader: ghostVS, fragmentShader: capFS, side: THREE.BackSide, clipping: true, clippingPlanes: [CUT],
    transparent: alpha < 1, depthWrite: true,
  });
}

/** Depth-only front faces (section view): hidden surfaces must hide the caps behind them, e.g. through a keyway. */
export function depthMaterial() {
  return new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.FrontSide, clippingPlanes: [CUT] });
}

export function lineMaterial(color = INK.line, opacity = 0.55, clip = true) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, clippingPlanes: clip ? [CUT] : [] });
}

const TOON = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
export function inkMaterial(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: TOON, ...opts });
}

/** Feature edges as white linework. */
export function edges(mesh, angle = 24, mat = lineMaterial()) {
  const g = new THREE.EdgesGeometry(mesh.geometry, angle);
  const l = new THREE.LineSegments(g, mat);
  l.raycast = () => {};
  return l;
}

/** Where a mesh crosses a plane (in the mesh's local frame): line segments for the section outline. */
export function sliceOutline(geometry, plane, mat) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = [a, b, c];
  const n = idx ? idx.count / 3 : pos.count / 3;
  const pts = [];
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k);
    const d = tri.map(p => plane.distanceToPoint(p));
    pts.length = 0;
    for (let k = 0; k < 3; k++) {
      const k2 = (k + 1) % 3;
      if ((d[k] > 0) !== (d[k2] > 0)) {
        const s = d[k] / (d[k] - d[k2]);
        pts.push(tri[k].clone().lerp(tri[k2], s));
      }
    }
    if (pts.length === 2) out.push(pts[0].x, pts[0].y, pts[0].z, pts[1].x, pts[1].y, pts[1].z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const l = new THREE.LineSegments(g, mat || new THREE.LineBasicMaterial({ color: INK.line, transparent: true, opacity: 0.95 }));
  l.raycast = () => {};
  return l;
}

/** Hands: a pale drafting-film rendering so the anatomy reads against the blueprint (shaded, rim-lit). */
export function handMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.0 });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      {
        vec3 nn = normalize(vNormal);
        float rim = pow(1.0 - clamp(abs(nn.z), 0.0, 1.0), 2.5);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.94, 1.0), 0.35) + rim * vec3(0.35, 0.6, 0.85) * 0.55;
      }`);
  };
  return m;
}

/** Helix spring along +Y from 0 to 1 (scaled to length at runtime), drawn as a line coil with flat end turns. */
export function springGeometry(r, wire, turns, segs = 200) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    const y = t < 0.04 ? 0 : t > 0.96 ? 1 : (t - 0.04) / 0.92;
    pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
/** The spring object: a coil line (the material argument is ignored, springs are always drawn as ink lines). */
export function springLine(r, turns) {
  const l = new THREE.Line(springGeometry(r, 0, turns), new THREE.LineBasicMaterial({ color: INK.spring, transparent: true, opacity: 0.95 }));
  l.raycast = () => {};
  return l;
}

/** Pin outlines for LatheGeometry (radius, height) from the bottom up. */
export function keyPinProfile(L, r) {
  const tip = Math.min(1.0, L * 0.35);
  return [[0, 0], [r * 0.35, 0.02], [r * 0.92, tip], [r, tip + 0.15], [r, L - 0.12], [r * 0.9, L], [0, L]];
}
export function driverProfile(type, L, r) {
  if (type === 'spool' || type === 'falsegate') {
    return [[0, 0], [r * 0.9, 0], [r, 0.12], [r, 0.55], [r * 0.6, 0.75], [r * 0.6, L - 1.25], [r, L - 1.05], [r, L - 0.12], [r * 0.9, L], [0, L]];
  }
  if (type === 'mushroom') {
    return [[0, 0], [r * 0.9, 0], [r, 0.12], [r, 0.6], [r * 0.58, 1.3], [r * 0.62, L - 0.9], [r, L - 0.7], [r, L - 0.1], [r * 0.9, L], [0, L]];
  }
  if (type === 'serrated') {
    const p = [[0, 0], [r * 0.9, 0], [r, 0.1]];
    for (let k = 0; k < 4; k++) { const y = 0.3 + k * 0.42; p.push([r, y], [r * 0.82, y + 0.14], [r, y + 0.28]); }
    p.push([r, L - 0.12], [r * 0.9, L], [0, L]);
    return p;
  }
  return [[0, 0], [r * 0.9, 0], [r, 0.12], [r, L - 0.12], [r * 0.9, L], [0, L]];
}
export function lathe(profile, seg = 28) {
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}
