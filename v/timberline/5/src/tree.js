// The tree being felled: trunk geometry, crown, live CSG cut visuals, stump/butt split.
// Tree-local frame: origin at the stem base, +X = planned felling direction, +Y = up, Z = across.
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { barkMaterial, endGrainMaterial } from './textures.js';
import { assets } from './assets.js';
import { BARK_TONE } from './world.js';

const KERF = 0.009;
const evaluator = new Evaluator();
evaluator.attributes = ['position', 'uv', 'normal'];
evaluator.useGroups = true;

export class TreeModel {
  constructor(spec, world) {
    this.spec = spec; this.world = world;
    const sp = spec.sp;
    this.R = spec.dbh / 2;
    this.H = spec.h;
    this.bark = barkMaterial(sp.bark);
    this.endMat = endGrainMaterial(sp);
    this.root = new THREE.Group();
    this.root.position.set(spec.x, spec.y, spec.z);
    world.group.add(this.root);
    this.leanGroup = new THREE.Group(); this.root.add(this.leanGroup);
    this.aim = 0;
    this.h0 = spec.axeStump ? 0.9 : sp && spec.dbh > 0.5 ? 0.45 : 0.35; // notch apex height: ax work is chopped standing, at about waist height
    this.buttTop = this.h0 + 2.4 * this.R + 0.25;
    this.buildStem();
    this.setAim(spec.lean.az); // default: lay with the lean
    this.computeMass();
  }

  radiusAt(y) {
    const R = this.R, H = this.H;
    const taper = Math.max(0.04, Math.pow(Math.max(0, (H - y) / (H - 1.37)), 0.85));
    const flare = 1 + 0.32 * Math.exp(-Math.max(0, y) / (0.35 + R * 0.6));
    return R * taper * flare;
  }

  lathe(y0, y1, steps, seg = 36) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const y = y0 + (y1 - y0) * (i / steps);
      pts.push(new THREE.Vector2(Math.max(0.004, this.radiusAt(Math.max(0, y))), y));
    }
    const geo = new THREE.LatheGeometry(pts, seg);
    const uv = geo.attributes.uv;
    const around = Math.max(1, Math.round((Math.PI * 2 * this.radiusAt(0.5)) / 0.5)); // same wrap count as the butt section, so the bark lines up at the joint
    const len = (y1 - y0) / 0.55;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * len + y0 / 0.55);
    return geo;
  }

  buildStem() {
    const sp = this.spec.sp, H = this.H;
    // Butt section (gets the CSG cuts). Closed at both ends so CSG has a solid.
    this.buttGeo = this.closedLathe(-1.4, this.buttTop, 12);
    this.buttMesh = new THREE.Mesh(this.buttGeo, this.bark);
    this.buttMesh.castShadow = this.buttMesh.receiveShadow = true;
    this.leanGroup.add(this.buttMesh);

    this.fallPivot = new THREE.Group(); this.leanGroup.add(this.fallPivot);
    this.fallGroup = new THREE.Group(); this.fallPivot.add(this.fallGroup);

    const topOfStem = sp.crown === 'conifer' ? H : this.spec.crownBase + this.spec.crownLen * 0.45;
    this.breakY = Math.min(topOfStem - 1, Math.max(this.buttTop + 1, H * this.spec.breakAt));
    const log1 = new THREE.Mesh(this.lathe(this.buttTop - 0.03, this.breakY, 12), this.bark); // overlaps the butt so the joint shows no seam
    this.upper = new THREE.Group(); this.upper.position.y = this.breakY;
    const log2geo = this.lathe(this.breakY, topOfStem, 14); log2geo.translate(0, -this.breakY, 0);
    const log2 = new THREE.Mesh(log2geo, this.bark);
    for (const m of [log1, log2]) { m.castShadow = m.receiveShadow = true; }
    this.fallGroup.add(log1, this.upper); this.upper.add(log2);

    // crown
    const crown = assets.crown(sp.crown);
    const w = this.spec.crownR / (sp.crown === 'conifer' ? 0.22 : 0.375);
    crown.scale.set(w, this.spec.crownLen, w);
    crown.position.y = this.spec.crownBase - this.breakY;
    crown.rotation.y = (this.spec.seed % 628) / 100;
    // heavy side: shift crown toward crownOffset
    const co = this.spec.crownOffset;
    this.crownOffsetWorld = new THREE.Vector2(Math.cos(co.az) * co.m, Math.sin(co.az) * co.m);
    crown.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (/bark|branch|wood/i.test(o.material.name || "")) { o.material = o.material.clone(); o.material.color.set(BARK_TONE[sp.bark] ?? 0x5a4a3c); } // branches match this species
    });
    this.crown = crown; this.upper.add(crown);

    // dead branch stubs below the crown
    const stubMat = new THREE.MeshStandardMaterial({ color: 0x4b3d30, roughness: 1 });
    const r = mulberry(this.spec.seed);
    const n = Math.floor(10 + this.H * 0.6);
    for (let i = 0; i < n; i++) {
      const y = this.buttTop + 1.5 + r() * (this.spec.crownBase - this.buttTop - 1.5);
      if (y > this.spec.crownBase) continue;
      const len = 0.15 + r() * (sp.crown === 'conifer' ? 0.6 : 0.35);
      const g = new THREE.CylinderGeometry(0.004, 0.012 + this.R * 0.03, len, 4); g.translate(0, len / 2, 0);
      const m = new THREE.Mesh(g, stubMat);
      const a = r() * Math.PI * 2;
      m.position.set(Math.cos(a) * this.radiusAt(y) * 0.9, y, Math.sin(a) * this.radiusAt(y) * 0.9);
      m.rotation.set(0, -a, -Math.PI / 2 + 0.3 + r() * 0.4, 'YXZ');
      m.castShadow = true;
      if (y < this.breakY) this.fallGroup.add(m); else { m.position.y -= this.breakY; this.upper.add(m); }
    }

    // paint: job marking band + aim dot
    if (this.spec.job) {
      const paint = new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.6, emissive: 0x401000 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(this.radiusAt(1.5) * 1.012, this.radiusAt(1.4) * 1.012, 0.08, 36, 1, true), paint);
      band.position.y = 1.45; this.fallGroup.add(band); this.band = band;
    }
  }

  closedLathe(y0, y1, steps) {
    const pts = [new THREE.Vector2(0.0001, y0)];
    for (let i = 0; i <= steps; i++) {
      const y = y0 + (y1 - y0) * (i / steps);
      pts.push(new THREE.Vector2(this.radiusAt(Math.max(0, y)), y));
    }
    pts.push(new THREE.Vector2(0.0001, y1));
    const geo = new THREE.LatheGeometry(pts, 40);
    const uv = geo.attributes.uv;
    const around = Math.max(1, Math.round((Math.PI * 2 * this.radiusAt(0.5)) / 0.5));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * (y1 - y0) / 0.55 + y0 / 0.55);
    return geo;
  }

  computeMass() {
    const sp = this.spec.sp;
    let vol = 0, mom = 0, merch = 0;
    const dy = 0.25;
    for (let y = 0; y < this.H; y += dy) {
      const r = this.radiusAt(y + dy / 2) / (y < 1 ? 1.15 : 1);
      const v = Math.PI * r * r * dy * 0.95;
      vol += v; mom += v * (y + dy / 2);
      if (r * 2 > 0.1 && y > this.h0) merch += v;
    }
    const stemMass = vol * sp.density;
    const crownMass = stemMass * (sp.crown === 'conifer' ? 0.22 : 0.34);
    const crownY = this.spec.crownBase + this.spec.crownLen * 0.4;
    this.mass = stemMass + crownMass;
    this.crownMass = crownMass;
    this.hc = (mom * sp.density + crownMass * crownY) / this.mass;
    this.volume = vol; this.merchVolume = merch;
    this.crownY = crownY;
    // moment of inertia about the stump
    let I = 0;
    for (let y = 0; y < this.H; y += dy) { const r = this.radiusAt(y + dy / 2); I += Math.PI * r * r * dy * sp.density * (y + dy / 2) ** 2; }
    I += crownMass * crownY * crownY + crownMass * (this.spec.crownLen ** 2) / 12;
    this.inertia = I;
  }

  // Aim: world azimuth of the intended lay (radians, measured from +X toward +Z).
  setAim(az) {
    this.aim = az;
    this.root.rotation.y = -az;
    // lean in local frame
    const L = THREE.MathUtils.degToRad(this.spec.lean.deg), la = this.spec.lean.az - az;
    this.leanLocal = new THREE.Vector2(Math.cos(la) * L, Math.sin(la) * L);
    this.leanGroup.quaternion.copy(tiltQuat(this.leanLocal));
    const ca = this.spec.crownOffset.az - az;
    this.crownOffsetLocal = new THREE.Vector2(Math.cos(ca), Math.sin(ca)).multiplyScalar(this.spec.crownOffset.m);
  }

  // ---- CSG ----
  planarUV(geo, R) {
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R * 1.04), 0.5 + p.getZ(i) / (2 * R * 1.04));
    return geo;
  }
  prismXY(points, zHalf) { // polygon in XY, extruded across Z
    const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: zHalf * 2, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -zHalf);
    return this.planarUV(g, this.Rc);
  }
  slabXZ(points, y, thick) { // polygon in XZ at height y with thickness
    const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(Math.PI / 2); // shape y -> world z, extrude -> world -y
    g.translate(0, y + thick / 2, 0);
    return this.planarUV(g, this.Rc);
  }
  shearZ(g, t) { // x += z*t: turns a square back cut into a tapered one
    if (t) g.applyMatrix4(new THREE.Matrix4().set(1, 0, t, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
    return this.planarUV(g, this.Rc);
  }
  get Rc() { return this.radiusAt(this.h0); }
  // back-cut kerf, wider than a real chain so the removed wood reads from the cutting camera
  get backKerf() { return THREE.MathUtils.clamp(this.R * 2 * 0.04, 0.016, 0.026); }

  // An axe notch as chopped so far: each face keeps its final angle and its apex moves in with depth,
  // so the V opens up swing by swing. The two faces meet at (xi, yi); unequal depths shift that point.
  axeNotch(n) {
    const ta = Math.tan(THREE.MathUtils.degToRad(n.top)), tb = Math.tan(THREE.MathUtils.degToRad(n.bottom)), h0 = this.h0;
    const xt = this.Rc - n.dTop, xb = this.Rc - n.dBot;
    const xi = (xt * ta + xb * tb) / Math.max(1e-6, ta + tb), yi = h0 + (xi - xt) * ta;
    return { ta, tb, xi, yi, top: (x) => h0 + (x - xt) * ta, bot: (x) => h0 - (x - xb) * tb };
  }

  cutterBrushes(cut) {
    const R = this.Rc + 0.25, h0 = this.h0, Z = this.Rc + 0.3;
    const out = [];
    const n = cut.notch;
    if (n && n.type === 'axe' && !n.removed) {
      if (Math.max(n.dTop, n.dBot) > 0.002) { const v = this.axeNotch(n); out.push(this.prismXY([[v.xi, v.yi], [R, v.bot(R)], [R, v.top(R)]], Z)); }
    } else if (n) {
      const xA = this.Rc - n.target;
      const ta = Math.tan(THREE.MathUtils.degToRad(n.top)), tb = Math.tan(THREE.MathUtils.degToRad(n.bottom));
      const kerfAlong = (tanA, sign, depth) => {
        // thin slab along a plane y = h0 + sign*(x-xA)*tanA from x=R down to x=Rc-depth
        const xe = this.Rc - depth;
        const off = KERF / 2 / Math.cos(Math.atan(tanA));
        const y = (x) => h0 + sign * (x - xA) * tanA;
        return this.prismXY([[R, y(R) - off], [R, y(R) + off], [xe, y(xe) + off], [xe, y(xe) - off]], Z);
      };
      if (n.dTop > 0.002) out.push(kerfAlong(ta, 1, n.dTop));
      if (n.dBot > 0.002) out.push(kerfAlong(tb, -1, n.dBot));
      if (n.removed) out.push(this.prismXY([[xA, h0], [R, h0 - (R - xA) * tb], [R, h0 + (R - xA) * ta]], Z));
    }
    const b = cut.back;
    if (b && b.progress > 0.002) {
      const yb = h0 + b.step, xf = -this.Rc + b.progress;
      // an axe can't make a kerf: it chops a notch in from the back, flat at the back-cut height with a 45° top
      const g = n?.type === 'axe'
        ? this.prismXY([[xf, yb - 0.002], [-R, yb - 0.002], [-R, yb + (xf + R)]], Z)
        : this.slabXZ([[-R, -Z], [xf, -Z], [xf, Z], [-R, Z]], yb, this.backKerf);
      out.push(this.shearZ(g, Math.tan(b.yaw)));
    }
    const bo = cut.bore;
    if (bo && bo.progress > 0.002) {
      const yb = h0 + bo.step, xS = -this.Rc + bo.strap;
      const span = (bo.hingeBack - xS) * Math.min(1, bo.progress);
      out.push(this.shearZ(this.slabXZ([[bo.hingeBack - span, -Z], [bo.hingeBack, -Z], [bo.hingeBack, Z], [bo.hingeBack - span, Z]], yb, this.backKerf), Math.tan(bo.yaw)));
      if (bo.strapCut > 0.002) out.push(this.slabXZ([[-R, -Z], [-this.Rc + bo.strapCut, -Z], [-this.Rc + bo.strapCut, Z], [-R, Z]], yb, this.backKerf));
    }
    return out;
  }

  updateCuts(cut) {
    const t0 = performance.now();
    let result = new Brush(this.buttGeo, this.bark);
    result.updateMatrixWorld();
    for (const g of this.cutterBrushes(cut)) {
      const b = new Brush(g, this.endMat); b.updateMatrixWorld();
      result = evaluator.evaluate(result, b, SUBTRACTION);
    }
    this.cutResult = result;
    this.buttMesh.geometry = result.geometry;
    this.buttMesh.material = result.material;
    this.lastCsgMs = performance.now() - t0;
  }

  // Split the butt section along the cut surface into the stump and the piece that falls.
  split(cut) {
    if (!this.cutResult) this.updateCuts(cut);
    const h0 = this.h0, R = this.Rc + 0.4, Z = R;
    const n = cut.notch, tb = Math.tan(THREE.MathUtils.degToRad(n.bottom));
    const xA = this.Rc - n.target;
    const yb = h0 + (cut.back ? cut.back.step : cut.bore ? cut.bore.step : 0);
    const below = new Brush(this.prismXY([[-R, -2], [xA, -2], [xA + 0.0001, (h0 + yb) / 2], [-R, yb]], Z), this.endMat);
    const belowFront = new Brush(this.prismXY([[xA - 0.001, -2], [R, -2], [R, h0 - (R - xA) * tb], [xA - 0.001, (h0 + yb) / 2]], Z), this.endMat);
    below.updateMatrixWorld(); belowFront.updateMatrixWorld();
    const lower = evaluator.evaluate(below, belowFront, ADDITION);
    const stump = evaluator.evaluate(this.cutResult, lower, INTERSECTION);
    const top = evaluator.evaluate(this.cutResult, lower, SUBTRACTION);
    this.buttMesh.geometry = stump.geometry; this.buttMesh.material = stump.material;
    const topMesh = new THREE.Mesh(top.geometry, top.material);
    topMesh.castShadow = topMesh.receiveShadow = true;
    this.fallGroup.add(topMesh);
    // torn hinge fibres
    const fib = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.spec.sp.sap), roughness: 1 });
    const r = mulberry(this.spec.seed + 5);
    const hingeHalf = Math.sqrt(Math.max(0, this.Rc ** 2 - xA ** 2)) * 0.9;
    for (let i = 0; i < 26; i++) {
      const len = 0.03 + r() * 0.12;
      const g = new THREE.BoxGeometry(0.004 + r() * 0.006, len, 0.004 + r() * 0.01);
      const m = new THREE.Mesh(g, fib);
      const up = i % 2 === 0;
      m.position.set(xA - r() * (cut.hingeT || 0.03), (h0 + yb) / 2 + (up ? len / 2 : -len / 2), (r() * 2 - 1) * hingeHalf);
      m.rotation.set((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.6);
      if (up) this.leanGroup.add(m); else this.fallGroup.add(m);
    }
    this.fallPivot.position.set(xA, h0, 0);
    this.fallGroup.position.set(-xA, -h0, 0);
  }

  barberChair(cut) {
    // a slab of the back of the stem splits away and stays standing
    const slabH = Math.min(4, 1.2 + this.R * 4);
    const g = new THREE.CylinderGeometry(this.Rc * 0.98, this.Rc, slabH, 20, 1, false, Math.PI * 0.62, Math.PI * 0.76);
    g.translate(0, slabH / 2 + this.h0, 0);
    const slab = new THREE.Mesh(g, [this.bark, this.endMat, this.endMat]);
    slab.castShadow = true;
    slab.rotation.z = 0.08;
    this.leanGroup.add(slab);
    this.chair = slab;
    // falling part pivots higher up
    const xA = this.Rc - cut.notch.target;
    this.fallPivot.position.set(xA, this.h0 + slabH * 0.6, 0);
    this.fallGroup.position.set(-xA, -(this.h0 + slabH * 0.6), 0);
  }

  // world-space point on the (possibly falling) stem axis at local height y
  stemPoint(y, target = new THREE.Vector3()) {
    target.set(0, y, 0);
    return this.fallGroup.localToWorld(target);
  }
  upperPoint(yLocal, target = new THREE.Vector3()) { target.set(0, yLocal - this.breakY, 0); return this.upper.localToWorld(target); }

  dispose() { this.root.parent?.remove(this.root); }
}

// rotation that tilts +Y toward local direction t (2D: x forward, y=z side) by |t| radians
export function tiltQuat(t, q = new THREE.Quaternion()) {
  const a = Math.hypot(t.x, t.y);
  if (a < 1e-6) return q.identity();
  const dx = t.x / a, dz = t.y / a;
  return q.setFromAxisAngle(new THREE.Vector3(dz, 0, -dx), a);
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
