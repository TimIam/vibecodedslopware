// Virtual try-on: the camera (or an uploaded photo) with the chosen garment laid over the wearer.
//
// MediaPipe's pose landmarker finds the shoulders and hips; the garment template's ANCHORS are mapped
// onto them with one affine transform, so it follows lean, distance and turn. Everything runs in the
// browser; no frame or photo is uploaded. If the tracker can't load or can't find a body, the garment
// can be dragged into place and sized by hand.

import { drawGarment, ANCHORS } from "./garment.js";

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;
const SHOULDER_SPAN = ANCHORS.shoulderR[0] - ANCHORS.shoulderL[0];
const TORSO = ANCHORS.hipMid[1] - ANCHORS.shoulderL[1];

let trackerPromise = null;
function loadTracker() {
  trackerPromise ??= (async () => {
    const { PoseLandmarker, FilesetResolver } = await import(`${MP}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const make = (delegate) => PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numPoses: 1 });
    const tracker = await make("GPU").catch(() => make("CPU"));
    tracker.mode = "VIDEO";
    return tracker;
  })();
  return trackerPromise;
}

async function detect(tracker, source, mode) {
  if (tracker.mode !== mode) { await tracker.setOptions({ runningMode: mode }); tracker.mode = mode; }
  const res = mode === "VIDEO" ? tracker.detectForVideo(source, performance.now()) : tracker.detect(source);
  return res.landmarks?.[0] ?? null;
}

export class TryOn {
  constructor(canvas, { onStatus = () => {} } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.onStatus = onStatus;
    this.source = null;      // a <video> or an <img>
    this.mirror = false;
    this.pose = null;        // smoothed { sl, sr, hip } in canvas pixels
    this.lost = 0;
    this.manual = null;      // { x, y, scale } when placed by hand
    this.size = 1;           // size slider, multiplies either placement
    this.garment = { kind: "tee", hex: "#0c0c0c", design: null };
    this.tracker = null;
    this.raf = 0;
    loadTracker().then((t) => { this.tracker = t; this.status(); }, () => { this.trackerFailed = true; this.status(); });
    this.bindDrag();
  }

  set(kind, hex, design) { this.garment = { kind, hex, design }; this.draw(); }

  status(msg) {
    if (msg) return this.onStatus(msg);
    if (!this.source) return this.onStatus("Turn on your camera or pick a photo of yourself.");
    if (this.trackerFailed) return this.onStatus("The body tracker didn't load. Drag the shirt onto yourself and use the size slider.");
    if (!this.tracker) return this.onStatus("Loading the body tracker…");
    if (this.manual) return this.onStatus("Placed by hand. Drag to move it, or use the size slider.");
    if (!this.pose) return this.onStatus(this.mirror ? "Step back until your shoulders are in the frame." : "Couldn't find shoulders in that photo. Drag the shirt into place.");
    this.onStatus(this.mirror ? "Tracking you. Lean, turn, strike a pose." : "Found you. Drag to adjust if it's off.");
  }

  async startCamera() {
    this.stop();
    const video = document.createElement("video");
    video.playsInline = true; video.muted = true;
    try {
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      this.status(e.name === "NotAllowedError" ? "Camera permission was declined. You can pick a photo instead." : "No camera available. You can pick a photo instead.");
      return false;
    }
    await video.play();
    this.useSource(video, true);
    const loop = async () => {
      if (this.source !== video) return;
      if (this.tracker && video.readyState >= 2) this.track(await detect(this.tracker, video, "VIDEO").catch(() => null));
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
    return true;
  }

  async usePhoto(file) {
    this.stop();
    const img = new Image();
    img.src = URL.createObjectURL(file);
    try { await img.decode(); } catch { this.status("That file isn't a picture this browser can open."); return; }
    this.useSource(img, false);
    this.status("Looking for you in the photo…");
    const tracker = this.tracker ?? (await loadTracker().catch(() => null));
    if (tracker && this.source === img) this.track(await detect(tracker, img, "IMAGE").catch(() => null), true);
    if (!this.pose) this.placeByHand();
    this.draw();
    this.status();
  }

  useSource(src, mirror) {
    this.source = src; this.mirror = mirror; this.pose = null; this.manual = null; this.size = 1;
    const w = src.videoWidth || src.naturalWidth, h = src.videoHeight || src.naturalHeight;
    const k = Math.min(1, 1280 / Math.max(w, h));
    this.canvas.width = Math.round(w * k); this.canvas.height = Math.round(h * k);
    this.status();
  }

  // landmarks → smoothed canvas-space shoulder and hip points
  track(lm, still = false) {
    const W = this.canvas.width, H = this.canvas.height;
    const ok = lm && lm[L_SHOULDER].visibility > 0.5 && lm[R_SHOULDER].visibility > 0.5;
    if (!ok) {
      if (++this.lost === 15 || still) { this.pose = null; this.status(); }
      return;
    }
    const P = (i) => [(this.mirror ? 1 - lm[i].x : lm[i].x) * W, lm[i].y * H];
    let a = P(L_SHOULDER), b = P(R_SHOULDER);
    if (a[0] > b[0]) [a, b] = [b, a];            // sl is whichever shoulder is on the left of the picture
    const hipsSeen = lm[L_HIP].visibility > 0.5 && lm[R_HIP].visibility > 0.5;
    const hip = hipsSeen ? [(P(L_HIP)[0] + P(R_HIP)[0]) / 2, (P(L_HIP)[1] + P(R_HIP)[1]) / 2] : null;
    const next = { sl: a, sr: b, hip };
    const was = this.pose;
    if (was && !still) {
      const mix = (p, q) => (p && q ? [p[0] + (q[0] - p[0]) * 0.45, p[1] + (q[1] - p[1]) * 0.45] : q);
      next.sl = mix(was.sl, next.sl); next.sr = mix(was.sr, next.sr); next.hip = mix(was.hip, next.hip);
    }
    const found = !was;
    this.pose = next; this.lost = 0;
    if (found && !this.manual) this.status();
  }

  placeByHand() {
    const W = this.canvas.width, H = this.canvas.height;
    this.manual = { x: W / 2, y: H * 0.32, scale: (W * 0.42) / SHOULDER_SPAN };
  }

  // The garment's transform: template units → canvas pixels.
  transform() {
    const s = this.size;
    if (this.manual) {
      const m = this.manual, k = m.scale * s;
      return [k, 0, 0, k, m.x - 500 * k, m.y - ANCHORS.shoulderL[1] * k];
    }
    if (!this.pose) return null;
    const { sl, sr, hip } = this.pose;
    const mid = [(sl[0] + sr[0]) / 2, (sl[1] + sr[1]) / 2];
    const ux = ((sr[0] - sl[0]) / SHOULDER_SPAN) * s, uy = ((sr[1] - sl[1]) / SHOULDER_SPAN) * s;
    let vx = -uy, vy = ux;                           // no hips in view: keep the template's proportions
    if (hip) {
      vx = ((hip[0] - mid[0]) / TORSO) * s; vy = ((hip[1] - mid[1]) / TORSO) * s;
      const len = Math.hypot(vx, vy), want = Math.hypot(ux, uy);
      if (len < want * 0.7 || len > want * 1.6) { vx = -uy; vy = ux; }   // ignore wild hip guesses
    }
    const ax = 500, ay = ANCHORS.shoulderL[1];
    return [ux, uy, vx, vy, mid[0] - ax * ux - ay * vx, mid[1] - ax * uy - ay * vy];
  }

  draw() {
    const { g, canvas: c } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.source) {
      g.fillStyle = "#1b1f1d"; g.fillRect(0, 0, c.width, c.height);
      return;
    }
    if (this.mirror) { g.setTransform(-1, 0, 0, 1, c.width, 0); }
    g.drawImage(this.source, 0, 0, c.width, c.height);
    g.setTransform(1, 0, 0, 1, 0, 0);
    let t = this.transform();
    if (!t && this.mirror) { this.placeByHand(); t = this.transform(); this.manual = null; }   // lost you: park it mid-frame
    if (!t) return;
    g.setTransform(...t);
    drawGarment(g, this.garment.kind, this.garment.hex, this.garment.design);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  setSize(v) { this.size = v; this.draw(); }

  bindDrag() {
    let from = null;
    const pt = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * this.canvas.width, ((e.clientY - r.top) / r.height) * this.canvas.height];
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      if (!this.source) return;
      if (!this.manual) {
        // grabbing a tracked garment pins it where it is
        const t = this.transform();
        if (t) this.manual = { x: t[4] + 500 * t[0] + ANCHORS.shoulderL[1] * t[2], y: t[5] + 500 * t[1] + ANCHORS.shoulderL[1] * t[3], scale: Math.hypot(t[0], t[1]) / this.size };
        else this.placeByHand();
        this.status();
      }
      from = pt(e);
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!from) return;
      const p = pt(e);
      this.manual.x += p[0] - from[0]; this.manual.y += p[1] - from[1];
      from = p;
      this.draw();
    });
    const end = () => { from = null; };
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);
  }

  // Back to following the body after a drag.
  retrack() { this.manual = null; this.size = 1; this.status(); this.draw(); }

  snapshot() {
    return new Promise((r) => this.canvas.toBlob(r, "image/png"));
  }

  stop() {
    cancelAnimationFrame(this.raf);
    const s = this.source;
    if (s?.srcObject) s.srcObject.getTracks().forEach((t) => t.stop());
    if (s?.src?.startsWith("blob:")) URL.revokeObjectURL(s.src);
    this.source = null; this.pose = null; this.manual = null;
  }
}
