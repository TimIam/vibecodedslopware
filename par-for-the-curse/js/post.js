// Final pass: the scene is drawn into an sRGB render target (so every material, including the custom
// shaders that write their colour directly, looks exactly as it would on the canvas), then copied to the
// screen with a light colour grade: a touch more saturation, cool shadows, warm highlights and a
// gentle vignette. Turns itself off where it cannot run or when
// the frame rate drops.
import * as THREE from 'three';

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.on = renderer.capabilities.isWebGL2;
    if (!this.on) return;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: this.rt.texture }, uTexel: { value: new THREE.Vector2(1 / 4, 1 / 4) }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `
        uniform sampler2D tScene; uniform vec2 uTexel; uniform float uAspect; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;   // linear (the sRGB target is decoded on read)
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = max(mix(vec3(l), c, 1.06), 0.);                                       // saturation
          c *= mix(vec3(0.95, 0.98, 1.05), vec3(1.03, 1.0, 0.97), smoothstep(0.02, 0.5, l)); // cool shadows, warm light
          vec2 q = (vUv - 0.5) * vec2(uAspect, 1.);
          c *= mix(0.8, 1., smoothstep(0.95, 0.3, length(q)));                       // vignette
          gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.cam = new THREE.Camera();
    this.scene.add(this.quad);
    this.slow = 0;
    try { this.forced = localStorage.getItem('pftc-post'); } catch (e) {}   // '1' always on, '0' off
    if (this.forced === '0') this.on = false;
  }
  setSize() {
    if (!this.on) return;
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(v.x, v.y);
    this.mat.uniforms.uTexel.value.set(1 / v.x, 1 / v.y);
    this.mat.uniforms.uAspect.value = v.x / v.y;
  }
  // realDt: the wall-clock frame time. Ten seconds below ~40 fps switches the pass off for good.
  render(scene, camera, realDt) {
    if (this.on && realDt && this.forced !== '1') { this.slow = realDt > 1 / 40 ? this.slow + realDt : Math.max(0, this.slow - realDt * 0.5); if (this.slow > 10) this.on = false; }
    if (!this.on) { this.renderer.setRenderTarget(null); this.renderer.render(scene, camera); return; }
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }
}
