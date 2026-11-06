// Things you can pick up: the two peels, the sauce ladle, topping tubs, dough trays, tickets.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { peelWoodTexture, labelTexture, canvas, tex } from './util.js';
import { TOPPINGS } from './data.js';
import { L } from './kitchen.js';

class Item {
  constructor(scene, kind) {
    this.kind = kind; this.group = new THREE.Group(); scene.add(this.group);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.support = null; this.held = false; this.home = null; this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.radius = 0.06; this.clear = 0.05; this.mass = 0.3;
  }
  mesh(geo, mat, x = 0, y = 0, z = 0, parent = this.group) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  sync() { this.group.position.copy(this.pos); this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ'); }
  goHome() { if (!this.home) return; this.pos.copy(this.home); this.vel.set(0, 0, 0); this.support = null; this.pitch = this.roll = 0; this.yaw = this.homeYaw || 0; }
}

// Blade centre is the item origin, at the bottom of the blade; the handle runs toward +z.
export class Peel extends Item {
  constructor(scene, metal) {
    super(scene, 'peel');
    this.metal = metal;
    this.bw = metal ? 0.37 : 0.42; this.bl = metal ? 0.36 : 0.42;
    this.handleLen = metal ? 0.55 : 0.4; this.gripZ = this.bl / 2 + this.handleLen - 0.06;
    this.thick = metal ? 0.003 : 0.012;
    this.mass = metal ? 0.9 : 1.2; this.pie = null; this.radius = 0.2; this.clear = 0.02;
    const sh = new THREE.Shape(), w = this.bw / 2, l = this.bl / 2, r = metal ? 0.05 : 0.09;
    sh.moveTo(-w + r, -l); sh.lineTo(w - r, -l); sh.quadraticCurveTo(w, -l, w, -l + r);
    sh.lineTo(w, l - 0.05); sh.quadraticCurveTo(w, l, w - 0.07, l + 0.02); sh.lineTo(0.03, l + 0.035); sh.lineTo(-0.03, l + 0.035); sh.lineTo(-w + 0.07, l + 0.02);
    sh.quadraticCurveTo(-w, l, -w, l - 0.05); sh.lineTo(-w, -l + r); sh.quadraticCurveTo(-w, -l, -w + r, -l);
    const g = new THREE.ExtrudeGeometry(sh, { depth: this.thick, bevelEnabled: !metal, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(Math.PI / 2); g.translate(0, this.thick, 0);
    const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / this.bw + 0.5, -p.getZ(i) / (this.bl + 0.1) + 0.5);
    const bladeMat = metal ? new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.85, roughness: 0.42 }) : new THREE.MeshStandardMaterial({ map: peelWoodTexture(), roughness: 0.7 });
    this.blade = this.mesh(g, bladeMat);
    const hMat = metal ? new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.55 }) : bladeMat;
    const hg = new THREE.CylinderGeometry(0.016, 0.018, this.handleLen, 14); hg.rotateX(Math.PI / 2);
    this.handle = this.mesh(hg, hMat, 0, this.thick / 2 + 0.008, l + this.handleLen / 2);
    if (metal) {
      // riveted collar where the handle meets the blade
      this.mesh(new THREE.BoxGeometry(0.06, 0.012, 0.06), new THREE.MeshStandardMaterial({ color: 0xaeb4ba, metalness: 0.9, roughness: 0.35 }), 0, 0.007, l + 0.01);
    }
    // the grip end, slightly fatter
    this.mesh(new THREE.SphereGeometry(0.02, 12, 8), hMat, 0, this.thick / 2 + 0.008, l + this.handleLen);
  }
  // world point on the handle the hand holds
  gripWorld(out) { return out.set(this.pos.x, this.pos.y + this.thick / 2 + 0.008, this.pos.z + this.gripZ); }
  topY() { return this.pos.y + this.thick + (this.metal ? 0.0005 : 0.003); }
  onBlade(x, z, k = 1) { return Math.abs(x - this.pos.x) < this.bw / 2 * k && Math.abs(z - this.pos.z) < this.bl / 2 * k; }
  get tipZ() { return this.pos.z - this.bl / 2; }
}

export class Ladle extends Item {
  constructor(scene) {
    super(scene, 'ladle');
    const steel = new THREE.MeshStandardMaterial({ color: 0xe2e6ea, metalness: 0.95, roughness: 0.2 });
    // origin at the bottom of the bowl; handle runs back toward +z and up
    const bowl = new THREE.SphereGeometry(0.038, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    this.bowl = this.mesh(bowl, new THREE.MeshStandardMaterial({ color: 0xe2e6ea, metalness: 0.95, roughness: 0.2, side: THREE.DoubleSide }), 0, 0.038, 0);
    this.sauce = this.mesh(new THREE.CircleGeometry(0.035, 18), new THREE.MeshStandardMaterial({ color: 0xa8231a, roughness: 0.15 }), 0, 0.03, 0);
    this.sauce.rotation.x = -Math.PI / 2;
    const h = new THREE.CylinderGeometry(0.006, 0.007, 0.3, 8); h.rotateX(Math.PI / 2 - 0.5);
    this.mesh(h, steel, 0, 0.11, 0.155);
    this.mesh(new THREE.TorusGeometry(0.012, 0.004, 6, 14), steel, 0, 0.18, 0.285);
    this.amount = 0; this.radius = 0.06; this.clear = 0.0; this.mass = 0.2;
    this.gripOff = new THREE.Vector3(0, 0.15, 0.25);
  }
  sync() { super.sync(); this.sauce.visible = this.amount > 0.02; this.sauce.scale.setScalar(0.4 + 0.6 * Math.min(1, this.amount)); this.sauce.position.y = 0.012 + 0.02 * Math.min(1, this.amount); }
}

export class Tub extends Item {
  constructor(scene, top) {
    super(scene, 'tub');
    this.top = top;
    const clear = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, transparent: true, opacity: 0.45 });
    this.mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.1, 22, 1, true), clear, 0, 0.05, 0);
    const fillC = TOPPINGS[top].color;
    this.mesh(new THREE.CylinderGeometry(0.054, 0.049, 0.085, 22), new THREE.MeshStandardMaterial({ color: fillC, roughness: 0.6 }), 0, 0.044, 0);
    this.mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.01, 22), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 }), 0, 0.104, 0);
    const lab = this.mesh(new THREE.PlaneGeometry(0.075, 0.035), new THREE.MeshBasicMaterial({ map: labelTexture(TOPPINGS[top].short, { w: 192, h: 90, bg: '#fffdf4', fg: '#222', font: '800 38px "Segoe UI",sans-serif', border: fillC }) }), 0, 0.055, 0.0585);
    lab.castShadow = false;
    this.radius = 0.06; this.clear = 0.0; this.mass = 0.5;
  }
}

// A sheet pan of dough balls. Pies ride in its slots.
export class Tray extends Item {
  constructor(scene, slots = 4) {
    super(scene, 'tray');
    const m = new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 0.8, roughness: 0.4 });
    this.w = 0.32; this.d = 0.3;
    this.mesh(new RoundedBoxGeometry(this.w, 0.02, this.d, 2, 0.006), m, 0, 0.01, 0);
    this.mesh(new THREE.BoxGeometry(this.w, 0.025, 0.006), m, 0, 0.022, this.d / 2);
    this.mesh(new THREE.BoxGeometry(this.w, 0.025, 0.006), m, 0, 0.022, -this.d / 2);
    this.slots = new Array(slots).fill(null);
    this.offs = [[-0.075, -0.07], [0.075, -0.07], [-0.075, 0.07], [0.075, 0.07]];
    this.radius = 0.16; this.clear = 0.07; this.mass = 1.2;
  }
  slotWorld(i, out) { return out.set(this.pos.x + this.offs[i][0], this.pos.y + 0.02, this.pos.z + this.offs[i][1]); }
  get count() { return this.slots.filter(Boolean).length; }
}

// Order tickets: 3-inch thermal paper.
export class Ticket extends Item {
  constructor(scene, order) {
    super(scene, 'ticket');
    this.order = order;
    this.w = 0.08; this.h = 0.13;
    this.cv = canvas(160, 260); this.draw();
    const m = new THREE.MeshStandardMaterial({ map: tex(this.cv, { aniso: 8 }), roughness: 0.85, side: THREE.DoubleSide });
    m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping;
    this.mat = m;
    const g = new THREE.PlaneGeometry(this.w, this.h, 1, 6);
    // a slight curl
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, Math.pow((y + this.h / 2) / this.h, 2) * -0.0 + Math.sin((y / this.h + 0.5) * Math.PI) * 0.004); }
    g.computeVertexNormals();
    // origin at the top edge (where it clips to the rail)
    g.translate(0, -this.h / 2, 0);
    this.paper = this.mesh(g, m);
    this.radius = 0.05; this.clear = 0.0; this.mass = 0.02;
    this.state = 'printing'; this.printT = 0; this.slot = -1;
  }
  draw() {
    const o = this.order, x = this.cv.getContext('2d'), W = 160, H = 260;
    x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#222'; x.textAlign = 'center';
    x.font = '700 15px Consolas,monospace'; x.fillText('PEEL OUT', W / 2, 20);
    x.font = '12px Consolas,monospace'; x.fillText(`#${o.no}  ·  TABLE ${o.table}`, W / 2, 38);
    x.fillText(`SERVER: ${o.waiter.look.name.toUpperCase()}`, W / 2, 54);
    x.strokeStyle = '#555'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(8, 64); x.lineTo(W - 8, 64); x.stroke(); x.setLineDash([]);
    x.textAlign = 'left'; x.font = '800 19px Consolas,monospace'; x.fillText(`${o.size.label} ${o.name.toUpperCase()}`.slice(0, 15), 10, 88);
    x.font = '700 14px Consolas,monospace';
    let y = 110;
    for (const t of o.tops) { x.fillText(`+ ${TOPPINGS[t].name.toUpperCase()}`.slice(0, 18), 12, y); y += 17; }
    if (o.bake === 'well') { x.fillStyle = '#b01c10'; x.font = '800 15px Consolas,monospace'; x.fillText('** WELL DONE **', 12, y + 6); y += 22; x.fillStyle = '#222'; }
    if (o.bake === 'light') { x.fillStyle = '#1c4fb0'; x.font = '800 15px Consolas,monospace'; x.fillText('** LIGHT BAKE **', 12, y + 6); y += 22; x.fillStyle = '#222'; }
    x.font = '11px Consolas,monospace'; x.textAlign = 'center'; x.fillText(o.clock, W / 2, H - 14);
    // torn edge
    x.fillStyle = '#1b1410'; for (let i = 0; i < W; i += 8) { x.beginPath(); x.moveTo(i, H); x.lineTo(i + 4, H - 4); x.lineTo(i + 8, H); x.fill(); }
    if (this.mat) this.mat.map.needsUpdate = true;
  }
}

export { L };
