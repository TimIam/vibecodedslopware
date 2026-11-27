// The builder's 3D view: a warm living-room corner, orbit camera, tap picking.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { floorTexture } from './textures.js';
import { TWINKLE } from './decor.js';
import { tickTwinkle } from './build.js';

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.env;
    scene.environmentIntensity = 0.55;

    // Back wall and floor fade to the page colour, so the tree stands in a soft pool of light.
    this.bg = new THREE.Color(0x20160f);
    scene.background = this.bg.clone();
    scene.fog = new THREE.Fog(this.bg.clone(), 6, 16);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0, color: 0xc8b29a });
    const floor = this.floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64).rotateX(-Math.PI / 2), floorMat);
    floor.receiveShadow = true;
    scene.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3b, roughness: 0.95 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), wallMat);
    wall.position.set(0, 5, -2.6); wall.receiveShadow = true;
    scene.add(wall);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6e6254, roughness: 1 }));
    rug.position.y = 0.002; rug.receiveShadow = true;
    scene.add(rug);

    this.hemi = new THREE.HemisphereLight(0xfff1dc, 0x3b2a1e, 0.9);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    sun.position.set(-2.4, 4.5, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -2; sc.right = 2; sc.top = 3.6; sc.bottom = -0.6; sc.near = 0.5; sc.far = 12;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    scene.add(sun); scene.add(sun.target);
    const fillLight = this.fill = new THREE.DirectionalLight(0xb9ccff, 0.5);
    fillLight.position.set(3, 2, -1);
    scene.add(fillLight);

    const cam = this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    cam.position.set(0.4, 1.4, 5.2);
    const ctl = this.controls = new OrbitControls(cam, canvas);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08;
    ctl.enablePan = false;
    ctl.minDistance = 0.6; ctl.maxDistance = 9;
    ctl.maxPolarAngle = Math.PI * 0.53;
    ctl.target.set(0, 1, 0);
    ctl.autoRotateSpeed = 0.6;
    ctl.addEventListener('start', () => { this.idle = 0; ctl.autoRotate = false; });

    this.idle = 0;
    this.dim = false;
    this.timer = new THREE.Timer();
    this.running = false;
    this.onFrame = null;
    this.raycaster = new THREE.Raycaster();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);

    // Taps (not drags) go to the builder for hanging and removing ornaments.
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
    canvas.addEventListener('pointerup', e => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
      down = null;
      if (moved < 8 && dt < 500 && this.onTap) this.onTap(this.ndc(e));
    });
  }

  ndc(e) {
    const rc = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
  }

  pick(ndc, objects, recursive = true) {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }

  resize() {
    if (this.renderer.xr.isPresenting) return;
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    if (this._w === w && this._h === h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones need a wider view to fit a 7 ft tree.
    this.camera.fov = w < h ? 50 : 38;
    this.camera.updateProjectionMatrix();
    this.haloScale = h * this.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  setModel(model) {
    if (this.model) this.scene.remove(this.model.root);
    this.model = model;
    this.scene.add(model.root);
  }

  // Frame the tree: whole thing in view, slightly from above, like you just walked in.
  frame(height, radius, instant = false) {
    const ctl = this.controls, cam = this.camera;
    const target = new THREE.Vector3(0, height * 0.47, 0);
    const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const dist = Math.max((height * 0.62) / Math.tan(vfov / 2), (radius * 1.25) / Math.tan(hfov / 2)) + radius;
    const dir = cam.position.clone().sub(ctl.target).setY(0).normalize();
    if (dir.lengthSq() < 0.5) dir.set(0.1, 0, 1).normalize();
    const pos = target.clone().addScaledVector(dir, dist).setY(height * 0.55 + dist * 0.12);
    this.tween = instant ? null : { from: cam.position.clone(), fromT: ctl.target.clone(), to: pos, toT: target, t: 0 };
    if (instant) { cam.position.copy(pos); ctl.target.copy(target); }
    ctl.maxDistance = Math.max(9, dist * 1.8);
    const sc = this.sun.shadow.camera; sc.top = height + 0.6; sc.left = -radius - 1; sc.right = radius + 1; sc.updateProjectionMatrix();
  }

  setDim(on) {
    this.dim = on;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer.reset?.();
    this.renderer.setAnimationLoop(ts => this.tick(ts));
  }
  stop() { this.running = false; this.renderer.setAnimationLoop(null); }

  tick(ts) {
    this.timer.update(ts);
    const dt = Math.min(0.05, this.timer.getDelta());
    const t = this.timer.getElapsed();
    tickTwinkle(t);
    if (this.tween) {
      const tw = this.tween; tw.t = Math.min(1, tw.t + dt / 0.9);
      const k = 1 - Math.pow(1 - tw.t, 3);
      this.camera.position.lerpVectors(tw.from, tw.to, k);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k);
      if (tw.t >= 1) this.tween = null;
    }
    this.idle += dt;
    if (this.idle > 12 && !this.controls.autoRotate && !this.noAutoRotate) this.controls.autoRotate = true;
    this.controls.update(dt);
    // Room lights up or down; the tree lights take over in the dark.
    const target = this.dim ? 0 : 1;
    this.dimK = (this.dimK ?? 1) + (target - (this.dimK ?? 1)) * Math.min(1, dt * 4);
    const k = this.dimK;
    this.hemi.intensity = 0.06 + 0.84 * k;
    this.sun.intensity = 0.05 + 2.15 * k;
    this.fill.intensity = 0.02 + 0.48 * k;
    this.scene.environmentIntensity = 0.12 + 0.43 * k;
    this.renderer.toneMappingExposure = 1.0 + (1 - k) * 0.3;
    TWINKLE.gain.value = 0.25 + (1 - k) * 0.85;
    if (this.model?.glowLight) this.model.glowLight.intensity = (0.25 + (1 - k) * 2.2) * Math.max(1, this.model.info.H);
    this.model?.root.traverse(o => { if (o.isPoints && o.material.uniforms?.scale) o.material.uniforms.scale.value = this.haloScale; });
    this.onFrame?.(dt, t);
    this.renderer.render(this.scene, this.camera);
  }

  async snapshot() {
    this.renderer.render(this.scene, this.camera);
    return new Promise(res => this.canvas.toBlob(res, 'image/jpeg', 0.9));
  }
}
