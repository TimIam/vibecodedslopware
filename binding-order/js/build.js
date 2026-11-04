// Builds the drawing of one lock (housing from locks.glb, parametric internals, tools, hands) and keeps it in
// step with the sim. Three.js units are mm: lock face at z = 0, keyway axis -Z, pins +Y.
//
// Layers: 0 = both views, 1 = section view only (caps, section outlines), 2 = keyway view only.
import * as THREE from 'three';
import { INK, ghostMaterial, capMaterial, depthMaterial, lineMaterial, inkMaterial, edges, sliceOutline, handMaterial, springGeometry,
  keyPinProfile, driverProfile, lathe, CUT, springLine } from './blueprint.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = Math.PI / 180;

function onLayers(obj, ...ls) {
  obj.layers.disableAll();
  for (const l of ls) obj.layers.enable(l);
  return obj;
}

/** A housing part: ghost + section cap + feature lines + section outline. */
function housing(geom, opts = {}) {
  const g = new THREE.Group();
  const ghost = new THREE.Mesh(geom, ghostMaterial(opts.color ?? INK.faint, opts.opacity ?? 0.07, opts.rim ?? 0.5));
  ghost.renderOrder = 2;
  g.add(ghost);
  if (opts.cap !== false) {
    const cap = onLayers(new THREE.Mesh(geom, capMaterial(opts.capColor ?? INK.cap, opts.spacing ?? 7, 1, opts.dir ?? -1, opts.mix ?? 0.85)), 1);
    g.add(cap);
    g.userData.cap = cap;
    const dep = onLayers(new THREE.Mesh(geom, depthMaterial()), 1);
    dep.renderOrder = -1;
    g.add(dep);
  }
  const e = edges(ghost, opts.angle ?? 24, lineMaterial(opts.lineColor ?? INK.line, opts.lineOpacity ?? 0.45));
  g.add(e);
  g.userData.geom = geom;
  g.userData.ghost = ghost;
  return g;
}

export class LockView {
  constructor(assets, job, meta, sim) {
    this.assets = assets;
    this.job = job;
    this.meta = meta;
    this.sim = sim;
    this.family = meta.family;
    this.root = new THREE.Group();
    this.shell = new THREE.Group();    // fixed parts
    this.plug = new THREE.Group();     // rotating parts
    this.root.add(this.shell, this.plug);
    this.housings = [];
    this.outlines = new THREE.Group();
    onLayers(this.outlines, 1);
    this.root.add(this.outlines);
    this.pick = new THREE.Group();
    this.root.add(this.pick);
    this.toolId = null;
    this.flash = 0;
    this.buildHousing();
    const f = this.family;
    if (f === 'pin' || f === 'dimple') this.buildPins();
    else if (f === 'wafer') this.buildWafers();
    else if (f === 'lever') this.buildLevers();
    else if (f === 'tubular') this.buildTubular();
    else if (f === 'warded') this.buildWards();
    this.buildTension();
    this.buildHands();
    this.sectionPlane = { normal: V3(-1, 0, 0), constant: 0, up: V3(0, 1, 0) };
    this.updateSectionPlane();
  }

  part(name) {
    const m = this.assets.locks[name];
    return m ? m.geometry : null;
  }

  buildHousing() {
    const id = this.job.model;
    const glassy = this.meta.skin === 'acrylic';
    const add = (name, group, opts) => {
      const geom = this.part(name);
      if (!geom) return null;
      const h = housing(geom, opts);
      group.add(h);
      this.housings.push({ name, h, group });
      return h;
    };
    add(id + '_shell', this.shell, { color: glassy ? 0x9fe0ff : INK.faint, opacity: glassy ? 0.1 : 0.06 });
    add(id + '_skin', this.shell, glassy
      ? { color: 0x9fe0ff, opacity: 0.03, rim: 0.3, lineOpacity: 0.3, capColor: 0x134a7e, spacing: 18, mix: 0.35 }
      : { color: INK.faint, opacity: 0.04, rim: 0.35, lineOpacity: 0.3, capColor: 0x174f82, spacing: 10, mix: 0.6 });
    add(id + '_plug', this.plug, { color: 0xbfe4ff, opacity: 0.07, rim: 0.45, capColor: 0x2466a3, spacing: 6, dir: 1 });
    const sh = this.part(id + '_shackle');
    if (sh) {
      this.shackle = new THREE.Group();
      this.shackle.add(housing(sh, { color: INK.faint, opacity: 0.08, capColor: 0x2466a3, spacing: 5 }));
      this.shell.add(this.shackle);
    }
  }

  /** Recompute section outlines for the current cut plane (in each part's own frame). */
  rebuildOutlines() {
    for (const c of [...this.outlines.children]) { c.geometry.dispose(); this.outlines.remove(c); }
    const pl = new THREE.Plane(this.sectionPlane.normal.clone(), this.sectionPlane.constant);
    const mat = new THREE.LineBasicMaterial({ color: INK.line, transparent: true, opacity: 0.95, depthTest: false });
    for (const { h } of this.housings) {
      const o = sliceOutline(h.userData.geom, pl, mat);
      onLayers(o, 1);
      o.renderOrder = 5;
      this.outlines.add(o);
    }
    for (const w of this.wardMeshes || []) {
      const o = sliceOutline(w.geometry, pl.clone().applyMatrix4(new THREE.Matrix4().copy(w.matrix).invert()), mat);
      o.applyMatrix4(w.matrix);
      onLayers(o, 1);
      this.outlines.add(o);
    }
  }

  updateSectionPlane() {
    const f = this.family;
    if (f === 'lever') {
      // cover plate off: look straight at the lever pack from the front
      this.sectionPlane = { normal: V3(0, 0, -1), constant: -(this.meta.wall + 0.05), up: V3(0, 1, 0), view: V3(0, 0, 1) };
    } else if (f === 'tubular') {
      const a = this.meta.angles[this.sim.selected];
      const u = V3(Math.cos(a), Math.sin(a), 0);
      const n = V3(Math.sin(a), -Math.cos(a), 0);   // u x Z
      this.sectionPlane = { normal: n.clone().negate(), constant: 0, up: u, view: n };
    } else {
      this.sectionPlane = { normal: V3(-1, 0, 0), constant: 0, up: V3(0, 1, 0), view: V3(1, 0, 0) };
    }
    this._planeKey = f === 'tubular' ? this.sim.selected : 0;
    this.rebuildOutlines();
  }

  // ------------------------------------------------------------------------------------- pin tumbler + dimple
  buildPins() {
    const m = this.meta, s = this.sim, r = m.chamberR - 0.06;
    const dimple = this.family === 'dimple';
    const g = s.geo;
    this.stackViews = [];
    const kpMat = () => inkMaterial(INK.keyPin);
    const drMat = () => inkMaterial(INK.driver);
    const spMat = inkMaterial(INK.spring);
    const lm = lineMaterial(0x2a3d55, 0.6, false);
    const Ld = dimple ? 3.4 : 5.0;
    for (const st of s.stacks) {
      const z = -st.z;
      const Lk = g.shearY - g.rest - st.need;
      const kp = new THREE.Mesh(lathe(keyPinProfile(Lk, r)), kpMat());
      kp.add(edges(kp, 30, lm));
      const dr = new THREE.Mesh(lathe(driverProfile(st.type, Ld, r)), drMat());
      dr.add(edges(dr, 30, lm));
      const sp = springLine(r * 0.78, dimple ? 6 : 9);
      kp.position.set(0, g.rest, z);
      dr.position.set(0, g.rest + Lk, z);
      this.plug.add(kp);
      this.shell.add(dr, sp);
      this.stackViews.push({ st, kp, dr, sp, Lk, Ld, z });
    }
    this.springTop = m.shellTop;
  }

  // ------------------------------------------------------------------------------------- wafers
  buildWafers() {
    const s = this.sim;
    this.stackViews = [];
    for (const st of s.stacks) {
      const shape = new THREE.Shape();
      const W = 3.15, H = 5.1, rr = 0.9;
      shape.moveTo(-W + rr, -H); shape.lineTo(W - rr, -H); shape.quadraticCurveTo(W, -H, W, -H + rr);
      shape.lineTo(W, H - rr); shape.quadraticCurveTo(W, H, W - rr, H); shape.lineTo(-W + rr, H);
      shape.quadraticCurveTo(-W, H, -W, H - rr); shape.lineTo(-W, -H + rr); shape.quadraticCurveTo(-W, -H, -W + rr, -H);
      // key window: its contact edge sits at the rest line + need (mirrored for top-sprung wafers)
      const edge = st.dir > 0 ? (s.geo.rest + st.need) : -(s.geo.rest + st.need);
      const y0 = st.dir > 0 ? edge : edge - 3.6, y1 = st.dir > 0 ? edge + 3.6 : edge;
      const hole = new THREE.Path();
      hole.moveTo(-1.25, y0); hole.lineTo(1.25, y0); hole.lineTo(1.25, y1); hole.lineTo(-1.25, y1); hole.lineTo(-1.25, y0);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false });
      geo.translate(0, 0, -0.45);
      const mesh = new THREE.Mesh(geo, inkMaterial(INK.lever, { transparent: true, opacity: 0.92 }));
      mesh.add(edges(mesh, 30, lineMaterial(0x2a3d55, 0.7, false)));
      mesh.position.z = -st.z;
      this.plug.add(mesh);
      // little spring at the outer side, pushing it toward its rest
      const sp = springLine(0.45, 5);
      sp.position.set(2.2, 0, -st.z);
      this.plug.add(sp);
      this.stackViews.push({ st, mesh, sp });
    }
  }

  // ------------------------------------------------------------------------------------- levers
  buildLevers() {
    const s = this.sim, m = this.meta;
    const [x0, x1, z0, z1, d] = m.box;
    this.stackViews = [];
    const rest = s.geo.rest;
    const pivotX = x1 - 6, stumpX = x0 * 0.3, stumpY = 6.5, pivotY = stumpY + 2;
    // the lever turns about its pivot; a lift y at the belly (x = 0) moves the stump's spot on the lever by y * k
    const k = (pivotX - stumpX) / pivotX;
    this.lever = { pivotX, stumpX, stumpY };
    const top = stumpY + 4.5;
    for (const st of s.stacks) {
      const need = st.need;
      const shape = new THREE.Shape();
      const left = stumpX - 8;
      shape.moveTo(left, top);
      shape.lineTo(pivotX + 3.2, top);
      shape.lineTo(pivotX + 3.2, pivotY - 3.2);
      shape.lineTo(4.5, rest + 0.6);
      shape.quadraticCurveTo(3.5, rest, 2.5, rest);
      shape.lineTo(-2.5, rest);                        // the belly the pick lifts
      shape.quadraticCurveTo(-3.8, rest, -4.4, rest + 1.2);
      shape.lineTo(-6, rest + 2.4);
      shape.lineTo(left, rest + 2.4);
      shape.lineTo(left, top);
      // pocket the stump rides in, the gate (a channel toward the front) where it lines up at `need`, and for
      // false-gated levers a shallow notch just below the true gate
      const yb = Math.max(rest + 3.4, stumpY - 4.6 * k - 1.6);
      const yt = stumpY + 1.7;
      const yg = stumpY - need * k;
      const pw = 1.6;
      const h = new THREE.Path();
      h.moveTo(stumpX + pw, yb);
      h.lineTo(stumpX + pw, yt);
      h.lineTo(stumpX - pw, yt);
      if (st.type === 'falsegate') {
        const yf = stumpY - (need - 1.35) * k;
        if (yf + 0.7 < yt - 0.3 && yf - 0.7 > yg + 1.6) {
          h.lineTo(stumpX - pw, yf + 0.7);
          h.lineTo(stumpX - pw - 1.0, yf + 0.7);
          h.lineTo(stumpX - pw - 1.0, yf - 0.7);
          h.lineTo(stumpX - pw, yf - 0.7);
        }
      }
      h.lineTo(stumpX - pw, Math.min(yt - 0.2, yg + 1.5));
      h.lineTo(left + 1.6, Math.min(yt - 0.2, yg + 1.5));
      h.lineTo(left + 1.6, Math.max(yb + 0.2, yg - 1.5));
      h.lineTo(stumpX - pw, Math.max(yb + 0.2, yg - 1.5));
      h.lineTo(stumpX - pw, yb);
      h.lineTo(stumpX + pw, yb);
      shape.holes.push(h);
      const pv = new THREE.Path();
      pv.absarc(pivotX, pivotY, 1.3, 0, Math.PI * 2, true);
      shape.holes.push(pv);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: s.geo.leverT, bevelEnabled: false, curveSegments: 10 });
      geo.translate(-pivotX, -pivotY, -s.geo.leverT / 2);
      const mesh = new THREE.Mesh(geo, inkMaterial(INK.lever, { transparent: true, opacity: 0.55, depthWrite: false }));
      mesh.add(edges(mesh, 30, lineMaterial(0x24476b, 0.9, false)));
      const piv = new THREE.Group();
      piv.position.set(pivotX, pivotY, -st.z);
      piv.add(mesh);
      this.shell.add(piv);
      this.stackViews.push({ st, mesh, piv, arm: pivotX });
    }
    // pivot post and the bolt with its stump
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, d - 2, 18).rotateX(Math.PI / 2), inkMaterial(INK.driver));
    post.position.set(pivotX, pivotY, -d / 2);
    this.shell.add(post);
    this.bolt = new THREE.Group();
    const bw = stumpX - (x0 + 1.4) + 10;
    const boltBar = new THREE.Mesh(new THREE.BoxGeometry(bw, 6, 2.6), inkMaterial(INK.keyPin, { transparent: true, opacity: 0.9 }));
    boltBar.position.set(stumpX - bw / 2 + 2, stumpY + 0.5, -d + 3.0);
    boltBar.add(edges(boltBar, 30, lineMaterial(0x2a3d55, 0.7, false)));
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, d - 4, 18).rotateX(Math.PI / 2), inkMaterial(INK.keyPin));
    stump.position.set(stumpX, stumpY, -d / 2);
    this.bolt.add(boltBar, stump);
    this.shell.add(this.bolt);
  }


  // ------------------------------------------------------------------------------------- tubular
  buildTubular() {
    const s = this.sim, m = this.meta;
    this.stackViews = [];
    const r = m.pinR - 0.05;
    for (const st of s.stacks) {
      const a = m.angles[st.i];
      const x = Math.cos(a) * m.pinCircle, y = Math.sin(a) * m.pinCircle;
      const front = 1.7;                      // key pin front face depth at rest
      const Lk = m.shear - front - st.need;
      const kp = new THREE.Mesh(lathe(keyPinProfile(Lk, r)), inkMaterial(INK.keyPin));
      kp.rotation.x = -Math.PI / 2;           // lathe +Y -> -Z
      kp.add(edges(kp, 30, lineMaterial(0x2a3d55, 0.6, false)));
      const dr = new THREE.Mesh(lathe(driverProfile(st.type, 4.2, r)), inkMaterial(INK.driver));
      dr.rotation.x = -Math.PI / 2;
      dr.add(edges(dr, 30, lineMaterial(0x2a3d55, 0.6, false)));
      const sp = springLine(r * 0.75, 7);
      sp.rotation.x = -Math.PI / 2;
      kp.position.set(x, y, -front);
      dr.position.set(x, y, -front - Lk);
      sp.position.set(x, y, 0);
      this.plug.add(kp);
      this.shell.add(dr, sp);
      this.stackViews.push({ st, kp, dr, sp, Lk, front, x, y });
    }
    // the pick: a sleeve with one feeler per pin; the grip comes from tools.glb
    this.tubePick = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 12, 48, 1, true).rotateX(Math.PI / 2), ghostMaterial(INK.pick, 0.12, 0.7));
    sleeve.position.z = 7;
    const sleeveLines = edges(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 12, 24, 1, true).rotateX(Math.PI / 2)), 10, lineMaterial(INK.pick, 0.8, false));
    sleeveLines.position.z = 7;
    this.tubePick.add(sleeve, sleeveLines);
    this.feelers = [];
    for (const sv of this.stackViews) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 10).rotateX(Math.PI / 2), inkMaterial(INK.pick));
      f.position.set(sv.x, sv.y, 7);
      this.tubePick.add(f);
      this.feelers.push(f);
    }
  }

  // ------------------------------------------------------------------------------------- warded
  buildWards() {
    const job = this.job, m = this.meta;
    this.wardMeshes = [];
    const gap = 26 * deg;                     // the keyhole slot runs straight down; wards leave a gap there
    for (const w of job.wards) {
      const sh = new THREE.Shape();
      const a0 = -Math.PI / 2 + gap, a1 = -Math.PI / 2 + Math.PI * 2 - gap;
      sh.absarc(0, 0, w.r1, a0, a1, false);
      sh.absarc(0, 0, w.r0, a1, a0, true);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: w.z1 - w.z0, bevelEnabled: false, curveSegments: 40 });
      const mesh = new THREE.Mesh(geo, inkMaterial(INK.ward, { transparent: true, opacity: 0.55, depthWrite: false }));
      mesh.position.z = -w.z1;
      mesh.updateMatrix();
      mesh.add(edges(mesh, 30, lineMaterial(0x24476b, 0.9, false)));
      const cap = onLayers(new THREE.Mesh(geo, capMaterial(0x2c6fb0, 4)), 1);
      mesh.add(cap);
      this.shell.add(mesh);
      this.wardMeshes.push(mesh);
    }
    // latch: a leaf spring whose tip sits at the latch radius, off to the side the bit turns toward
    const L = job.latch;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 14, 1.4), inkMaterial(INK.spring));
    leaf.position.set(L.r + 0.5, 5, -L.z);
    leaf.add(edges(leaf, 30, lineMaterial(0x2a3d55, 0.6, false)));
    this.latchLeaf = leaf;
    this.shell.add(leaf);
  }

  // ------------------------------------------------------------------------------------- tension tools
  buildTension() {
    const f = this.family;
    const T = this.assets.tools;
    if (f === 'pin' || f === 'wafer' || f === 'dimple') {
      const w = new THREE.Group();
      const geom = T.wrench_bok.geometry;
      const mesh = new THREE.Mesh(geom, inkMaterial(INK.wrench));
      mesh.add(edges(mesh, 30, lineMaterial(0x3a3a20, 0.7, false)));
      w.add(mesh);
      const kb = f === 'dimple' ? -1.15 : this.meta.keywayBottom;
      w.position.set(f === 'dimple' ? 2.2 : 0, kb, this.meta.face ? this.meta.face : 0);
      this.plug.add(w);
      this.wrench = w;
      this.wrenchPad = V3(-52 + 7, 0.9, 0);  // wrench-local point the left index presses
    } else if (f === 'lever') {
      const w = new THREE.Group();
      const mesh = new THREE.Mesh(T.curtain.geometry, inkMaterial(INK.wrench));
      const grip = new THREE.Mesh(T.curtain_grip.geometry, inkMaterial(0x6d8cb0));
      w.add(mesh, grip);
      w.position.set(1.0, -8.6, 0);
      this.shell.add(w);
      this.wrench = w;
      this.wrenchPad = V3(0, 3.5, 70);
    }
  }

  setTool(id) {
    if (id === this.toolId) return;
    this.toolId = id;
    for (const c of [...this.pick.children]) this.pick.remove(c);
    const T = this.assets.tools;
    if (this.family === 'tubular') {
      const grip = new THREE.Mesh(T.tubular_grip.geometry, inkMaterial(0xff9a66));
      grip.add(edges(grip, 30, lineMaterial(0x5a2a10, 0.5, false)));
      this.pick.add(this.tubePick, grip);
    } else {
      const bladeName = this.family === 'warded' ? 'ward_' + id : 'pick_' + id;
      const blade = new THREE.Mesh(T[bladeName].geometry, inkMaterial(INK.pick));
      blade.add(edges(blade, 30, lineMaterial(0x5a2a10, 0.6, false)));
      const grip = new THREE.Mesh(T[bladeName + '_grip'].geometry, inkMaterial(0xff9a66, { transparent: true, opacity: 0.95 }));
      grip.add(edges(grip, 30, lineMaterial(0x5a2a10, 0.4, false)));
      this.pick.add(blade, grip);
    }
    if (this.handR) this.pick.add(this.handR);
  }

  // ------------------------------------------------------------------------------------- hands
  buildHands() {
    const H = this.assets.hands, J = this.assets.handsJson;
    const mat = handMaterial();
    const nailMat = new THREE.MeshStandardMaterial({ color: 0xf4e6ea, roughness: 0.35 });
    const sleeveMat = inkMaterial(0x31557d);
    const hand = (side) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(H['hand_' + side].geometry, mat));
      g.add(new THREE.Mesh(H['nails_' + side].geometry, nailMat));
      const sl = new THREE.Mesh(H['sleeve_' + side].geometry, sleeveMat);
      sl.add(edges(sl, 40, lineMaterial(0x9fc7ee, 0.25, false)));
      g.add(sl);
      g.traverse(o => onLayers(o, 2));
      return g;
    };
    // Right hand: put the hand's handle line onto the pick's grip axis, pinch at grip z ~ 66 mm from the tip.
    {
      const R = J.R;
      const A = V3(...R.a), D = V3(...R.d).normalize(), U = V3(...R.up).normalize();
      const t0 = 56;
      const origin = A.clone().addScaledVector(D, t0);
      const Xh = new THREE.Vector3().crossVectors(U, D.clone().negate()).normalize();
      const handFrame = new THREE.Matrix4().makeBasis(Xh, U, D.clone().negate()).setPosition(origin);   // hand space
      const zPinch = this.family === 'tubular' ? 40 : (this.family === 'warded' ? 60 : 66);
      const pickFrame = new THREE.Matrix4().makeBasis(V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1)).setPosition(0, 0, zPinch);
      const M = pickFrame.multiply(handFrame.clone().invert());
      const g = hand('R');
      g.applyMatrix4(M);
      // roll the hand a little so the knuckles face up and out (a natural picking wrist)
      const wrap = new THREE.Group();
      wrap.add(g);
      wrap.rotation.z = this.family === 'tubular' ? 0.3 : 0.15;
      wrap.position.set(0, 0, 0);
      this.handR = wrap;
      this.pick.add(wrap);
    }
    // Left hand: index pad on the tension wrench pad, pressing along -Y; fingers pointing toward +X.
    if (this.wrench) {
      const L = J.L;
      const pad = V3(...L.pad), n = V3(...L.padNormal).normalize();
      // hand forward (fingers) in hand space is about -Z after export (Blender +Y). Build an orthonormal frame.
      const fwd = V3(0, 0, -1).addScaledVector(n, -V3(0, 0, -1).dot(n)).normalize();
      const side = new THREE.Vector3().crossVectors(fwd, n).normalize();
      const handFrame = new THREE.Matrix4().makeBasis(side, n, fwd).setPosition(pad);
      const wFwd = this.family === 'lever' ? V3(0.25, 0.2, -1).normalize() : V3(1, 0.15, 0.45).normalize();
      const wN = V3(0, -1, 0);
      const wf = wFwd.clone().addScaledVector(wN, -wFwd.dot(wN)).normalize();
      const ws = new THREE.Vector3().crossVectors(wf, wN).normalize();
      const worldFrame = new THREE.Matrix4().makeBasis(ws, wN, wf).setPosition(this.wrenchPad.clone().add(V3(0, 1.0, 0)));
      const M = worldFrame.multiply(handFrame.clone().invert());
      const g = hand('L');
      g.applyMatrix4(M);
      this.handL = new THREE.Group();
      this.handL.add(g);
      this.wrench.add(this.handL);
    }
  }

  // ------------------------------------------------------------------------------------- per frame
  /** view: 'section' | 'keyway' (the plug's rotation is drawn exaggerated in the keyway view). */
  sync(view, aids, time) {
    const s = this.sim, f = this.family;
    if (f === 'tubular' && this._planeKey !== s.selected) this.updateSectionPlane();
    const th = (s.theta + s.thetaKick) * deg;
    const ex = view === 'keyway' ? 4 : (f === 'tubular' ? 2 : 0);
    if (f !== 'warded') this.plug.rotation.z = -th * ex;
    const g = s.geo;
    const pulse = 0.5 + 0.5 * Math.sin(time * 7);
    // tool pose
    if (f === 'tubular') {
      this.pick.position.set(0, 0, 0.2);
      this.pick.rotation.set(0, 0, -th * ex);
    } else if (f === 'warded') {
      this.pick.position.set(0, 0, -s.tip.p);
      this.pick.rotation.set(0, 0, Math.PI - s.angle * deg);
    } else {
      const p = Math.max(3, s.tip.p);
      const ty = s.tipY;
      const my = s.tip.flip ? -g.mouthY : g.mouthY;
      const a = Math.atan2(my - ty, p);
      this.pick.position.set(0, ty, -s.tip.p);
      this.pick.rotation.set(-a, 0, s.tip.flip ? Math.PI : 0, 'XYZ');   // roll first, then pitch about the mouth
      // the hand stays upright when the pick is flipped
      if (this.handR) this.handR.rotation.z = s.tip.flip ? Math.PI + 0.15 : 0.15;
    }
    if (this.wrench && this.handL) this.handL.position.y = -s.T * 1.2;
    // stacks
    const bi = s.binding;
    for (const sv of this.stackViews || []) {
      const st = sv.st;
      const isB = aids && st.i === bi && s.T > 0.03;
      const colKey = st.state === 'over' ? INK.over : INK.keyPin;
      const colDr = st.state === 'set' ? INK.set : (st.state === 'caught' ? 0xffd27a : (isB ? INK.bind : INK.driver));
      if (f === 'pin' || f === 'dimple') {
        sv.kp.position.y = g.rest + st.y;
        sv.dr.position.y = g.rest + sv.Lk + st.yd;
        const top = sv.dr.position.y + sv.Ld;
        sv.sp.position.set(0, top, sv.z);
        sv.sp.scale.y = Math.max(0.5, this.springTop - top);
        sv.kp.material.color.setHex(colKey);
        sv.dr.material.color.setHex(colDr);
        sv.dr.material.emissive.setHex(isB ? INK.bind : 0x000000);
        sv.dr.material.emissiveIntensity = isB ? 0.35 * pulse : 0;
      } else if (f === 'tubular') {
        const side = sv.x * this.sectionPlane.view.x + sv.y * this.sectionPlane.view.y;
        const show = view !== 'section' || side < 0.6;
        sv.kp.visible = sv.dr.visible = sv.sp.visible = show;
        if (this.feelers) this.feelers[st.i].visible = show;
        sv.kp.position.z = -sv.front - st.y;
        sv.dr.position.z = -sv.front - sv.Lk - st.yd;
        const back = -sv.front - sv.Lk - st.yd - 4.2;
        sv.sp.position.z = back;
        sv.sp.scale.y = Math.max(0.5, back + (this.meta.length - 2));
        sv.kp.material.color.setHex(colKey);
        sv.dr.material.color.setHex(colDr);
        sv.dr.material.emissive.setHex(isB ? INK.bind : 0);
        sv.dr.material.emissiveIntensity = isB ? 0.35 * pulse : 0;
        const fe = this.feelers[st.i];
        fe.position.z = 7 - 1.7 + 0.6 - (st.i === s.selected ? s.tip.h : (st.state === 'set' ? 0 : st.y));
        fe.material.color.setHex(st.i === s.selected ? 0xffd2a8 : INK.pick);
      } else if (f === 'wafer') {
        const off = (st.y - st.need) * st.dir;
        sv.mesh.position.y = off;
        sv.sp.position.y = st.dir > 0 ? 5.1 + off : -5.1 + off - 1;
        sv.sp.scale.y = 1.2;
        sv.mesh.material.color.setHex(st.state === 'set' ? INK.set : st.state === 'over' ? INK.over : (isB ? INK.bind : INK.lever));
      } else if (f === 'lever') {
        const ang = Math.atan2(st.y, sv.arm);
        sv.piv.rotation.z = -ang;
        const near = Math.abs(s.tip.p - st.z) < 0.9;
        sv.mesh.material.opacity = near ? 0.85 : 0.4;
        sv.mesh.material.color.setHex(st.state === 'set' ? INK.set : st.state === 'over' ? INK.over : (isB ? INK.bind : INK.lever));
      }
    }
    if (f === 'lever' && this.bolt) this.bolt.position.x = s.open ? Math.max(this.bolt.position.x - 0.6, -9) : -Math.min(0.6, s.T * 0.6);
    if (f === 'warded' && this.latchLeaf) {
      const push = s.latchOk && s.latchOk(s.tip.p) ? Math.max(0, Math.sin(Math.min(Math.PI / 2, s.angle * deg))) : 0;
      this.latchLeaf.rotation.z = -push * 0.25;
    }
    if (this.shackle) {
      const lift = (this.meta.shackle?.lift || 8) * (this.openT || 0);
      if (f === 'pin') this.shackle.position.z = -lift; else this.shackle.position.y = lift;
    }
  }
}
