// Post-processing: ambient occlusion (N8AO, which also renders the scene), tone mapping,
// then a filmic finish (grade, vignette, grain). Falls back to a plain render pass.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinishShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.035 }, flash: { value: new THREE.Vector4(0, 0, 0, 0) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, grain; uniform vec4 flash; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // gentle S-curve and a warm-highlight / cool-shadow split
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += mix(vec3(-0.012, 0.0, 0.018), vec3(0.022, 0.008, -0.018), smoothstep(0.15, 0.85, l));
      c = mix(vec3(l), c, 1.06);
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c += (hash(vUv * 1024.0 + fract(time * 7.13)) - 0.5) * grain;
      c = mix(c, flash.rgb, flash.a * smoothstep(0.0, 0.7, length(d) * 1.4 + 0.15));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export async function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const render = new RenderPass(scene, camera);
  composer.addPass(render);
  let ao = null;
  try {
    const { N8AOPass } = await import('n8ao');
    ao = new N8AOPass(scene, camera, 2, 2);
    Object.assign(ao.configuration, {
      aoRadius: 1.4, distanceFalloff: 0.8, intensity: 2.6, color: new THREE.Color(0x0a0d08),
      halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, screenSpaceRadius: false,
    });
    ao.setQualityMode('Medium');
    composer.addPass(ao);
    render.enabled = false;
  } catch (e) { console.warn('Ambient occlusion unavailable:', e); }
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  return {
    composer, finish,
    get aoOn() { return !!ao && ao.enabled; },
    setAO(on) { if (!ao) return; ao.enabled = on; render.enabled = !on; },
    setSize(w, h, pr) { composer.setPixelRatio(pr); composer.setSize(w, h); },
    render(dt) { finish.uniforms.time.value += dt; composer.render(dt); },
  };
}
