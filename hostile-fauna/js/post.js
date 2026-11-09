// The last pass before tone mapping: lens fringe, vignette, grain, a colour grade, and the two screen-space
// tricks the abilities use (the Stern Look's ripple, Blink's smear).

import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const shader = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uAberr: { value: 0 }, uRipple: { value: 1 }, uHaze: { value: 0 }, uHurt: { value: 0 }, uAspect: { value: 1.6 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uT,uAberr,uRipple,uHaze,uHurt,uAspect;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 p=vUv-0.5; vec2 q=vec2(p.x*uAspect,p.y); float d=length(q);
      vec2 uv=vUv;
      // A ring of bent light travelling outward.
      float r0=uRipple*1.3, w=d-r0;
      uv+=normalize(q+1e-5)*vec2(1.0/uAspect,1.0)*sin(w*46.0)*exp(-w*w*70.0)*0.02*(1.0-uRipple)*step(uRipple,0.999);
      float ab=(0.0004+uAberr*0.005)*(0.2+d*d*2.2);
      vec2 dir=normalize(p+1e-5);
      vec3 c=vec3(texture2D(tDiffuse,uv+dir*ab).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-dir*ab).b);
      // Grade: cool shadows, warm highlights, a little more colour.
      float l=dot(c,vec3(0.2126,0.7152,0.0722));
      c=mix(c*vec3(0.9,1.0,1.1), c*vec3(1.08,1.0,0.92), smoothstep(0.05,0.9,l));
      c=mix(vec3(l),c,1.14-uHaze*0.45-uHurt*0.5);
      c=c*(1.0+0.12*(c-0.35));
      c*=mix(1.0,0.5,smoothstep(0.45,1.15,d));
      c+=(hash(vUv*vec2(1920.0,1080.0)+fract(uT)*91.7)-0.5)*0.022*(0.4+l);
      gl_FragColor=vec4(max(c,0.0),1.0);
    }`,
};

export const gradePass = new ShaderPass(shader);
const U = gradePass.uniforms;

export const lens = {
  ripple() { U.uRipple.value = 0; },
  smear(v = 1) { U.uAberr.value = Math.max(U.uAberr.value, v); },
  update(dt, t, haze, hurt, aspect) {
    U.uT.value = t; U.uHaze.value = haze; U.uHurt.value = hurt; U.uAspect.value = aspect;
    U.uAberr.value = Math.max(0, U.uAberr.value - dt * 3.2);
    if (U.uRipple.value < 1) U.uRipple.value = Math.min(1, U.uRipple.value + dt * 1.5);
  },
};
