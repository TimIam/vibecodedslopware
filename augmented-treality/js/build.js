// Turns a design into a scene graph, rebuilding only the parts that changed.
// The same model is shown in the builder and in WebXR; exports build a clean copy.
import * as THREE from 'three';
import { buildTree, surfacePoint } from './tree.js';
import {
  buildLights, buildHalos, liveBulbMaterial, buildGarland, buildTopper, buildBase,
  buildGifts, buildOrnament, TWINKLE, MODE_INDEX,
} from './decor.js';
import { glowTexture } from './textures.js';

const key = o => JSON.stringify(o);

export class TreeModel {
  constructor({ live = true } = {}) {
    this.live = live;
    this.root = new THREE.Group();
    this.root.name = 'AugmentedTreality';
    this.keys = {};
    this.parts = {};
    this.info = null;
    this.ornGroup = new THREE.Group(); this.ornGroup.name = 'ornaments';
    this.root.add(this.ornGroup);
  }

  set(part, obj) {
    const old = this.parts[part];
    if (old) { this.root.remove(old); dispose(old); }
    this.parts[part] = obj;
    if (obj) this.root.add(obj);
  }

  update(d) {
    const tk = key(d.tree);
    let treeChanged = false;
    if (this.keys.tree !== tk) {
      const t = buildTree(d.tree);
      this.info = t;
      this.set('tree', t.group);
      this.envelope = t.envelope;
      this.keys.tree = tk; treeChanged = true;
    }
    const info = this.info;
    const bk = tk + key(d.base);
    if (this.keys.base !== bk) { this.set('base', buildBase(info, d.base)); this.keys.base = bk; }
    const lk = tk + key(d.lights);
    if (this.keys.lights !== lk) {
      const { group, bulbs, styleBulb } = buildLights(info, d.lights);
      if (this.live) {
        group.traverse(o => { if (o.userData.bulbs) o.material = liveBulbMaterial(o.material); });
        if (bulbs.length) group.add(buildHalos(bulbs, styleBulb));
        // One soft light in the middle of the tree so ornaments pick up the glow.
        if (bulbs.length) {
          const c = new THREE.Color(0, 0, 0);
          for (const b of bulbs) c.add(new THREE.Color(b.color));
          c.multiplyScalar(1 / bulbs.length);
          const pl = new THREE.PointLight(c, 0, info.R0 * 3.5, 1.6);
          pl.position.set(0, info.yb + (info.H - info.yb) * 0.35, 0);
          pl.userData.liveOnly = true; pl.userData.glowLight = true;
          group.add(pl);
          this.glowLight = pl;
        } else this.glowLight = null;
      }
      this.bulbs = bulbs;
      this.set('lights', group); this.keys.lights = lk;
    }
    TWINKLE.mode.value = MODE_INDEX[d.lights.mode] ?? 1;
    const gk = tk + key(d.garland);
    if (this.keys.garland !== gk) { this.set('garland', buildGarland(info, d.garland)); this.keys.garland = gk; }
    const pk = tk + d.topper;
    if (this.keys.topper !== pk) {
      const top = buildTopper(info, d.topper);
      if (this.live && top.userData.glow) {
        const sm = new THREE.SpriteMaterial({ map: glowTexture(), color: top.userData.glow.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
        const sp = new THREE.Sprite(sm); sp.scale.setScalar(top.userData.glow.size); sp.position.y = top.userData.glow.y / top.scale.y;
        sp.userData.liveOnly = true; sp.renderOrder = 11;
        top.add(sp);
      }
      this.set('topper', top); this.keys.topper = pk;
    }
    const xk = key(d.gifts);
    if (this.keys.gifts !== xk) { this.set('gifts', buildGifts(info, d.gifts)); this.keys.gifts = xk; }
    // Ornaments: rebuild one by one so hanging a new one is instant.
    const ok = d.ornaments.map(key);
    const prev = this.ornKeys || [];
    if (treeChanged || ok.length !== prev.length || ok.some((k, i) => k !== prev[i])) {
      const keep = new Map();
      if (!treeChanged) this.ornGroup.children.forEach(c => keep.set(c.userData.key, c));
      const next = [];
      for (let i = 0; i < d.ornaments.length; i++) {
        let obj = keep.get(ok[i]);
        if (obj) keep.delete(ok[i]);
        else { obj = buildOrnament(d.ornaments[i]); this.placeOrnament(obj, d.ornaments[i]); obj.userData.key = ok[i]; }
        obj.userData.index = i;
        next.push(obj);
      }
      for (const c of this.ornGroup.children.slice()) if (!next.includes(c)) this.ornGroup.remove(c);
      for (const c of next) if (c.parent !== this.ornGroup) this.ornGroup.add(c);
      this.ornKeys = ok;
    }
    return this;
  }

  placeOrnament(obj, o) {
    surfacePoint(this.info, o.y, o.a, o.d ?? 0.93, obj.position);
  }

  // Overall height including the topper, for the "will it fit under my ceiling" readout.
  get totalHeight() {
    const top = this.parts.topper;
    if (!top) return this.info.H;
    const box = new THREE.Box3().setFromObject(top, true);
    return Math.max(this.info.H, box.max.y);
  }
}

export function dispose(obj) {
  obj.traverse(o => {
    if (o.isMesh || o.isPoints) {
      // Shared geometries (ornament pieces) are cached and never disposed here.
      if (o.geometry && !o.geometry.userData.shared && o.geometry.attributes.position.count > 2000) o.geometry.dispose();
    }
  });
}

// Light everything in the builder from the tree lights' shared clock.
export function tickTwinkle(t) { TWINKLE.time.value = t; }
