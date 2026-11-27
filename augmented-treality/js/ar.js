// Putting the tree in the room.
//  - Android Chrome: WebXR immersive-ar with hit-testing. The live tree, twinkling, with shadows.
//  - iPhone / iPad Safari: AR Quick Look with a USDZ built on the phone.
//  - The native apps: the ARViewer plugin (ARKit Quick Look on iOS, ARCore SceneView on Android).
//  - Anything else: a QR code to carry the design to a phone.
import * as THREE from 'three';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';
import { toUSDZ, toGLB, blobToBase64 } from './export.js';
import { TWINKLE, MODE_INDEX, LIGHT_MODES } from './decor.js';
import { tickTwinkle } from './build.js';

const cap = () => window.Capacitor;
export const isNative = () => !!cap()?.isNativePlatform?.();
export const nativePlatform = () => (isNative() ? cap().getPlatform() : null);

export async function arSupport() {
  const out = { native: nativePlatform(), webxr: false, quicklook: false, ios: false, android: /Android/i.test(navigator.userAgent) };
  out.ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (out.native) return out;
  try { out.webxr = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch { out.webxr = false; }
  const a = document.createElement('a');
  out.quicklook = !!(a.relList && a.relList.supports && a.relList.supports('ar'));
  return out;
}

// ---------------------------------------------------------------- Quick Look (Safari)
export async function openQuickLook(design, { onProgress, blob } = {}) {
  if (!blob) {
    onProgress?.('Wrapping your tree for iPhone…');
    ({ blob } = await toUSDZ(design));
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = url + '#allowsContentScaling=0';
  a.download = 'augmented-treality.usdz';
  a.appendChild(document.createElement('img'));
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
}

// ---------------------------------------------------------------- the native apps
export async function openNative(design, { onProgress } = {}) {
  const plugin = cap()?.Plugins?.ARViewer;
  if (!plugin) throw new Error('ARViewer plugin missing');
  const ios = nativePlatform() === 'ios';
  onProgress?.(ios ? 'Wrapping your tree for ARKit…' : 'Wrapping your tree for ARCore…');
  const { blob } = ios ? await toUSDZ(design) : await toGLB(design);
  const data = await blobToBase64(blob);
  return plugin.open({ format: ios ? 'usdz' : 'glb', data, title: design.name || 'Christmas tree', twinkle: design.lights.mode !== 'steady' });
}

// ---------------------------------------------------------------- WebXR (Android Chrome)
export class XRSession {
  constructor(view, model, design, overlay, hooks = {}) {
    this.view = view; this.model = model; this.design = design; this.overlay = overlay; this.hooks = hooks;
  }

  async start() {
    const { view, overlay } = this;
    const r = view.renderer;
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation', 'anchors'],
      domOverlay: { root: overlay },
    });
    this.session = session;
    view.stop();
    overlay.hidden = false;
    document.body.classList.add('in-ar');

    const scene = this.scene = new THREE.Scene();
    this.oldParent = this.model.root.parent;
    const holder = this.holder = new THREE.Group();
    holder.visible = false;
    holder.add(this.model.root);
    scene.add(holder);

    // Lighting: a guess at the room until ARCore's estimate arrives.
    const hemi = this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.3);
    scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.8, 3, 1.2); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -1.5; sc.right = 1.5; sc.top = 1.5; sc.bottom = -1.5; sc.near = 0.1; sc.far = 8;
    sun.shadow.radius = 5; sun.shadow.bias = -0.0008;
    holder.add(sun); holder.add(sun.target);
    scene.environment = view.env;
    scene.environmentIntensity = 0.6;

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
    shadow.receiveShadow = true; shadow.position.y = 0.001;
    holder.add(shadow);

    try {
      const xrLight = this.xrLight = new XREstimatedLight(r);
      xrLight.addEventListener('estimationstart', () => {
        scene.add(xrLight); scene.remove(hemi);
        if (xrLight.environment) scene.environment = xrLight.environment;
        sun.intensity = 0.9;
      });
      xrLight.addEventListener('estimationend', () => { scene.remove(xrLight); scene.add(hemi); scene.environment = view.env; sun.intensity = 1.6; });
    } catch (e) { console.warn('no light estimation', e); }

    // The ring that shows where the tree will go.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.2, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24).rotateX(-Math.PI / 2), ring.material);
    const footprint = new THREE.Mesh(new THREE.RingGeometry(0.2, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }));
    footprint.scale.setScalar(this.model.info.R0);
    const reticle = this.reticle = new THREE.Group();
    reticle.add(ring, dot, footprint);
    reticle.matrixAutoUpdate = false; reticle.visible = false;
    scene.add(reticle);

    this.snow = makeSnow(this.model.info);
    this.snow.visible = false;
    holder.add(this.snow);

    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local');
    await r.xr.setSession(session);
    this.viewerSpace = await session.requestReferenceSpace('viewer');
    this.hitSource = await session.requestHitTestSource({ space: this.viewerSpace });

    this.placing = true;
    this.scaleMode = 1;
    this.grow = 1;
    this.lastHit = null;
    this.setStatus('Point your phone at the floor and sweep it slowly side to side.');

    session.addEventListener('select', () => this.onSelect());
    session.addEventListener('end', () => this.cleanup());
    // Taps on the buttons must not also drop the tree.
    overlay.addEventListener('beforexrselect', e => { if (e.target.closest('button,.ar-panel')) e.preventDefault(); });

    this.timer = new THREE.Timer();
    r.setAnimationLoop((t, frame) => this.loop(t, frame));
    this.hooks.onStart?.(this);
    return this;
  }

  setStatus(text) { this.hooks.onStatus?.(text, this); }

  loop(ts, frame) {
    const r = this.view.renderer;
    this.timer.update(ts);
    const dt = Math.min(0.05, this.timer.getDelta());
    tickTwinkle(this.timer.getElapsed());
    if (!frame) return;
    const ref = r.xr.getReferenceSpace();
    if (this.placing && this.hitSource) {
      const hits = frame.getHitTestResults(this.hitSource);
      let ok = false;
      if (hits.length) {
        const pose = hits[0].getPose(ref);
        const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(m));
        if (up.y > 0.85) {
          ok = true;
          this.reticle.matrix.copy(m);
          this.lastHit = hits[0];
          if (!this.sawFloor) { this.sawFloor = true; this.setStatus('Found the floor. Tap to put your tree there.'); }
        }
      }
      this.reticle.visible = ok;
    } else this.reticle.visible = false;
    // Follow the anchor if ARCore gave us one; the tree stays put as tracking improves.
    if (this.anchor && frame.trackedAnchors?.has(this.anchor)) {
      const p = frame.getPose(this.anchor.anchorSpace, ref);
      if (p) this.basePos.setFromMatrixPosition(new THREE.Matrix4().fromArray(p.transform.matrix));
    }
    if (this.basePos) this.holder.position.copy(this.basePos);
    if (this.grow < 1) {
      this.grow = Math.min(1, this.grow + dt / 0.7);
      const k = this.grow, e = 1 - Math.pow(2, -10 * k) * Math.cos(k * 9);
      this.model.root.scale.setScalar(this.scaleMode * Math.max(0.001, e));
    }
    if (this.spin) this.holder.rotation.y += this.spin * dt * 1.4;
    if (this.snow.visible) stepSnow(this.snow, dt, this.model.info);
    // Halo size in pixels per metre at 1 m, from the phone camera's own projection.
    const xc = r.xr.getCamera(), layer = this.session.renderState.baseLayer;
    const sub = xc.cameras?.[0];
    const scale = sub && layer ? sub.projectionMatrix.elements[5] * layer.framebufferHeight / 2 : 900;
    for (const o of this.holderPoints()) o.material.uniforms.scale.value = scale * this.scaleMode;
    r.render(this.scene, xc);
  }

  holderPoints() {
    if (!this._pts) { this._pts = []; this.model.root.traverse(o => { if (o.isPoints && o.material.uniforms?.scale) this._pts.push(o); }); }
    return this._pts;
  }

  onSelect() {
    if (!this.placing || !this.reticle.visible) return;
    const pos = new THREE.Vector3().setFromMatrixPosition(this.reticle.matrix);
    this.basePos = pos.clone();
    // Face the tree's best side toward you.
    const cam = this.view.renderer.xr.getCamera();
    const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    this.holder.rotation.set(0, Math.atan2(cp.x - pos.x, cp.z - pos.z), 0);
    this.holder.position.copy(pos);
    this.holder.visible = true;
    this.placing = false;
    this.grow = 0;
    this._pts = null;
    this.anchor = null;
    if (this.lastHit?.createAnchor) this.lastHit.createAnchor().then(a => { if (!this.placing) this.anchor = a; }).catch(() => {});
    this.setStatus('');
    this.hooks.onPlaced?.(this);
    navigator.vibrate?.(30);
  }

  move() { this.placing = true; this.holder.visible = false; this.anchor?.delete?.(); this.anchor = null; this.setStatus('Tap the floor where it should go.'); }
  setScale(s) { this.scaleMode = s; this.model.root.scale.setScalar(s); this.snow.scale.setScalar(1); }
  setSpin(v) { this.spin = v; }
  toggleSnow() { this.snow.visible = !this.snow.visible; return this.snow.visible; }
  cycleLights() {
    const modes = Object.keys(LIGHT_MODES);
    const i = (modes.indexOf(this.design.lights.mode) + 1) % modes.length;
    this.design.lights.mode = modes[i];
    TWINKLE.mode.value = MODE_INDEX[modes[i]];
    return LIGHT_MODES[modes[i]];
  }

  end() { this.session?.end(); }

  cleanup() {
    const { view, overlay } = this;
    const r = view.renderer;
    r.setAnimationLoop(null);
    r.xr.enabled = false;
    this.hitSource?.cancel?.();
    this.model.root.scale.setScalar(1);
    this.model.root.position.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.holder.remove(this.model.root);
    view.scene.add(this.model.root);
    overlay.hidden = true;
    document.body.classList.remove('in-ar');
    view.resize();
    view.start();
    this.hooks.onEnd?.(this);
  }
}

// A little flurry around the tree, AR only.
function makeSnow(info) {
  const n = 900, R = info.R0 * 2.2 + 0.4, H = info.H + 0.8;
  const pos = new Float32Array(n * 3), vel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * R;
    pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = Math.sin(a) * rr;
    vel[i] = 0.15 + Math.random() * 0.25;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.012, transparent: true, opacity: 0.9, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.userData = { vel, R, H }; p.frustumCulled = false;
  return p;
}
function stepSnow(p, dt) {
  const pos = p.geometry.attributes.position.array, { vel, H } = p.userData, t = performance.now() / 1000;
  for (let i = 0; i < vel.length; i++) {
    pos[i * 3 + 1] -= vel[i] * dt;
    pos[i * 3] += Math.sin(t * 0.7 + i) * 0.02 * dt;
    if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] += H;
  }
  p.geometry.attributes.position.needsUpdate = true;
}
