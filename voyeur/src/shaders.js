// Interior lighting. Every room has its own copy of this material, so a lamp only lights the room
// it is in: walls between rooms stop light the way real walls do, without any shadow maps.
// Up to four point lights per room (ceiling, lamp, TV, tree), daylight through the street windows,
// and a cheap corner/contact darkening from the room's own bounds.
import * as THREE from 'three';

export const MAXL = 4;

const VS = /* glsl */`
varying vec3 vW;
varying vec3 vN;
varying vec3 vC;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
#ifdef USE_COLOR
  vC = color;
#else
  vC = vec3(1.0);
#endif
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */`
uniform vec3 uLP[${MAXL}];
uniform vec3 uLC[${MAXL}];
uniform vec3 uDay;
uniform vec3 uAmb;
uniform vec3 uMin;
uniform vec3 uMax;
uniform float uWin;
varying vec3 vW;
varying vec3 vN;
varying vec3 vC;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 acc = uAmb;
  for (int i = 0; i < ${MAXL}; i++) {
    vec3 d = uLP[i] - vW;
    float r2 = dot(d, d) + 0.03;
    vec3 l = d * inversesqrt(r2);
    float ndl = max(dot(n, l), 0.0) * 0.72 + 0.28;
    acc += uLC[i] * ndl / (1.0 + r2 * 0.55);
  }
  float depth = max(uMax.z - vW.z, 0.0);
  float win = uWin * (0.25 + 0.75 * exp(-depth * 0.42));
  acc += uDay * (win * (0.55 + 0.45 * max(n.z, 0.0)) + 0.05);
  vec3 a = vW - uMin;
  vec3 b = uMax - vW;
  vec3 m = clamp(min(a, b), 0.0, 10.0);
  vec3 s = smoothstep(vec3(0.0), vec3(0.6), m);
  float ao = max(s.x * s.y, max(s.y * s.z, s.x * s.z));
  ao = 0.42 + 0.58 * ao;
  gl_FragColor = vec4(vC * acc * ao, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeRoomMaterial(min, max, shared, hasWindows = true) {
  const uniforms = {
    uLP: { value: Array.from({ length: MAXL }, () => new THREE.Vector3(0, -500, 0)) },
    uLC: { value: Array.from({ length: MAXL }, () => new THREE.Vector3()) },
    uDay: shared.uDay,
    uAmb: shared.uAmb,
    uMin: { value: min.clone() },
    uMax: { value: max.clone() },
    uWin: { value: hasWindows ? 1 : 0 },
  };
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, vertexColors: true });
}

export function makeSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uStars: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vD;
      void main() {
        vD = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uMoonDir; uniform float uStars;
      varying vec3 vD;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vD);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHor, uTop, pow(h, 0.5));
        float sd = max(dot(d, uSunDir), 0.0);
        c += uSunCol * (pow(sd, 900.0) * 30.0 + pow(sd, 10.0) * 0.35);
        float md = max(dot(d, uMoonDir), 0.0);
        c += vec3(0.8, 0.85, 1.0) * smoothstep(0.99965, 0.9998, md) * 1.6 * uStars + vec3(0.05, 0.06, 0.09) * pow(md, 40.0) * uStars;
        vec3 g = floor(d * 260.0);
        float s = hash(g);
        c += vec3(step(0.9975, s) * uStars * smoothstep(0.05, 0.4, d.y) * 0.9);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
