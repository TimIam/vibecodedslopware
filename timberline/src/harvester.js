// Harvester shift: drive the 8WD machine through the plantation, grab a stem with the head,
// fell it in the direction you choose, then feed it through and buck it to length.
import * as THREE from 'three';
import { assets } from './assets.js';
import { TreeModel, tiltQuat } from './tree.js';
import { endGrainMaterial } from './textures.js';
import * as sfx from './audio.js';

const REACH = 10.5, SHIFT = 420; // seconds
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');

export class HarvesterMode {
  constructor({ scene, world, camera, controls, renderer, specs, ui, onDone }) {
    Object.assign(this, { scene, world, camera, controls, renderer, specs, ui, onDone });
    renderer.localClippingEnabled = true;
    world.buildLeaveTrees([]);
    this.root = assets.harvester();
    world.group.add(this.root);
    const q = (n) => this.root.getObjectByName(n);
    this.n = { chassis: q('Chassis'), turret: q('Turret'), boom1: q('Boom1'), boom2: q('Boom2'), head: q('Head') };
    this.wheels = []; for (let i = 0; i < 8; i++) { const w = q('Wheel_' + i); if (w) this.wheels.push(w); }
    this.cyl = [[q('Cyl1_Barrel'), q('Cyl1_Rod')], [q('Cyl2_Barrel'), q('Cyl2_Rod')]].filter(([a, b]) => a && b);
    const { boom1, boom2, head } = this.n;
    this.ik = !!(boom1 && boom2 && head && this.n.turret);
    if (this.ik) {
      const elev = (v) => Math.atan2(v.y, v.z);
      this.L1 = boom2.position.length(); this.L2 = head.position.length();
      this.e1 = elev(boom2.position); this.e2 = elev(head.position);
      this.restSum = boom1.rotation.x + boom2.rotation.x + head.rotation.x;
      this.ang = { yaw: this.n.turret.rotation.y, a1: boom1.rotation.x, a2: boom2.rotation.x };
      this.goal = { ...this.ang };
      this.yaw0 = this.n.turret.rotation.y;
    }
    this.pos = new THREE.Vector3(0, 0, -12); this.heading = 0; this.speed = 0;
    this.keys = {};
    this.state = 'drive';
    this.time = SHIFT;
    this.stats = { trees: 0, logs: 0, pay: 0, saw: 0, pulp: 0 };
    this.logs = [];
    this.reachRing = this.makeRing();
    world.group.add(this.reachRing);
    this.dirArrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 3), new THREE.MeshBasicMaterial({ color: 0xff6b1a, fog: false }));
    this.dirArrow.visible = false; world.group.add(this.dirArrow);
    this.camOffset = new THREE.Vector3(-9, 7, -11);
    sfx.dieselStart();
    this.placeMachine(0);
    camera.position.copy(this.pos).add(this.camOffset);
    controls.target.copy(this.pos).add(new THREE.Vector3(0, 2, 4));
    this.renderPanel();
    ui.toast('W/S drive, A/D steer. Click a marked stem inside the orange ring to grab it.');
  }

  makeRing() {
    const pts = []; for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * REACH, 0, Math.sin(a) * REACH)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff6b1a, transparent: true, opacity: 0.55, fog: false }));
    return l;
  }

  key(e, down) {
    this.keys[e.code] = down;
    if (!down) return;
    if (e.code === 'Space') { e.preventDefault(); this.action(); }
    if (e.code === 'KeyB') this.buck();
  }

  click(ray) {
    if (this.state !== 'drive') return;
    // pick nearest marked stem to the ray
    let best = null, bd = 1e9;
    const p = new THREE.Vector3();
    for (const s of this.specs) {
      if (s.felled) continue;
      p.set(s.x, s.y + 1.5, s.z);
      const d = ray.ray.distanceToPoint(p);
      if (d < 1.2 && d < bd) { bd = d; best = s; }
    }
    if (!best) return;
    const turret = this.turretWorld();
    const dist = Math.hypot(best.x - turret.x, best.z - turret.z);
    if (dist > REACH) { this.ui.toast(`Out of reach (${dist.toFixed(1)} m). Drive closer.`, 'bad'); return; }
    if (dist < 2.8) { this.ui.toast('Too close to the machine.', 'bad'); return; }
    this.grab(best);
  }

  turretWorld() { const t = new THREE.Vector3(); (this.n.turret || this.root).getWorldPosition(t); return t; }

  grab(spec) {
    this.target = spec;
    this.world.hideTree(spec);
    const tr = new TreeModel(spec, this.world);
    tr.buttMesh.visible = false;
    const stumpH = 0.12;
    const cutY = 0.35;
    // stump stays, stem above the felling cut goes with the tree
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(tr.radiusAt(cutY), tr.radiusAt(0) * 1.05, cutY + stumpH, 24), [tr.bark, endGrainMaterial(spec.sp), tr.bark]);
    stump.position.y = (cutY - stumpH) / 2; stump.castShadow = true;
    tr.root.add(stump);
    const butt = new THREE.Mesh(tr.lathe(cutY, tr.buttTop, 4), tr.bark); butt.castShadow = true;
    tr.fallGroup.add(butt);
    tr.fallPivot.position.set(0, cutY, 0); tr.fallGroup.position.set(0, -cutY, 0);
    tr.setAim(0); tr.leanGroup.quaternion.identity();
    this.tree = tr; this.cutY = cutY;
    this.fellAz = Math.atan2(spec.z - this.pos.z, spec.x - this.pos.x) + Math.PI / 2;
    this.state = 'reaching'; this.stateT = 0;
    sfx.dieselSet(0.6, 1);
    this.renderPanel();
  }

  action() {
    if (this.state === 'gripped') {
      this.state = 'cutting'; this.stateT = 0;
      sfx.sawStart(); sfx.sawSet(1, 1);
      this.renderPanel();
    } else if (this.state === 'processing') {
      // Space toggles feed in processing
      this.feeding = !this.feeding;
    }
  }

  buck() {
    if (this.state !== 'processing') return;
    const L = this.fed - this.lastBuck;
    if (L < 0.5) return;
    const tr = this.tree;
    const s0 = this.cutY + this.lastBuck, s1 = this.cutY + this.fed;
    const r0 = tr.radiusAt(s0), r1 = tr.radiusAt(s1);
    const vol = Math.PI * ((r0 + r1) / 2) ** 2 * L;
    let kind, value;
    const smallEnd = r1 * 2;
    if (L >= 3.6 && L <= 5.6 && smallEnd >= 0.14) { kind = 'sawlog'; value = vol * tr.spec.sp.price * 1.3; this.stats.saw++; }
    else if (L >= 2.3 && L <= 3.2 && smallEnd >= 0.07) { kind = 'pulp'; value = vol * 48; this.stats.pulp++; }
    else { kind = 'cull'; value = vol * 6; }
    this.stats.logs++; this.stats.pay += value;
    sfx.sawSet(1, 1); setTimeout(() => sfx.sawSet(0.25, 0), 250);
    this.ui.toast(`${kind === 'sawlog' ? 'Sawlog' : kind === 'pulp' ? 'Pulpwood' : 'Cull — off-spec length'} · ${L.toFixed(1)} m × ${(smallEnd * 100).toFixed(0)} cm top · ${money(value)}`, kind === 'cull' ? 'bad' : 'ok');
    // drop a log mesh where the cut section lay
    const geo = new THREE.CylinderGeometry(r1, r0, L, 18); geo.rotateZ(Math.PI / 2);
    const log = new THREE.Mesh(geo, [tr.bark, tr.endMat, tr.endMat]); log.castShadow = log.receiveShadow = true;
    const headP = this.headGrip();
    const axis = this.stemAxis();
    const center = headP.clone().addScaledVector(axis, -L / 2);
    log.position.copy(center);
    log.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
    this.world.group.add(log);
    this.logs.push({ mesh: log, vy: 0, settle: this.world.height(center.x, center.z) + (r0 + r1) / 2 });
    this.lastBuck = this.fed;
    this.renderPanel();
  }

  headGrip() {
    const p = new THREE.Vector3();
    if (this.n.head) { this.n.head.getWorldPosition(p); p.y -= 0.6; } else p.copy(this.pos);
    return p;
  }
  stemAxis() { return new THREE.Vector3(Math.cos(this.fellAz), 0, Math.sin(this.fellAz)); }

  // aim the crane at a world point (2-link IK in the boom plane)
  aimAt(pt) {
    if (!this.ik) return;
    const { turret, boom1 } = this.n;
    const tl = turret.parent.worldToLocal(pt.clone());
    const tp = turret.position;
    const b1 = boom1.position;
    const dx = tl.x - tp.x, dz = tl.z - tp.z;
    const flat = Math.hypot(dx, dz);
    const lateral = b1.x;
    this.goal.yaw = Math.atan2(dx, dz) + Math.asin(THREE.MathUtils.clamp(lateral / Math.max(flat, 0.1), -0.9, 0.9));
    // boom plane coordinates relative to boom1 pivot
    const fwd = Math.sqrt(Math.max(0.01, flat * flat - lateral * lateral)) - b1.z;
    const up = tl.y - tp.y - b1.y + 1.3; // head hangs ~1.3 m below boom tip
    const L1 = this.L1, L2 = this.L2;
    const r = Math.min(Math.hypot(fwd, up), L1 + L2 - 0.05);
    const base = Math.atan2(up, fwd);
    const k = THREE.MathUtils.clamp((L1 * L1 + r * r - L2 * L2) / (2 * L1 * r), -1, 1);
    const phi1 = base + Math.acos(k);
    const elbow = new THREE.Vector2(Math.cos(phi1) * L1, Math.sin(phi1) * L1);
    const tip = new THREE.Vector2(Math.cos(base) * r, Math.sin(base) * r);
    const phi2 = Math.atan2(tip.y - elbow.y, tip.x - elbow.x);
    this.goal.a1 = this.e1 - phi1;
    this.goal.a2 = this.e2 - this.goal.a1 - phi2;
    this.reachNow = r;
  }

  applyCrane(dt) {
    if (!this.ik) return;
    const { turret, boom1, boom2, head } = this.n;
    const k = 1 - Math.exp(-dt * 3.2);
    for (const key of ['yaw', 'a1', 'a2']) this.ang[key] += (this.goal[key] - this.ang[key]) * k;
    turret.rotation.y = this.ang.yaw;
    boom1.rotation.x = this.ang.a1; boom2.rotation.x = this.ang.a2;
    head.rotation.x = this.restSum - this.ang.a1 - this.ang.a2;
    for (const [a, b] of this.cyl) { const pa = new THREE.Vector3(), pb = new THREE.Vector3(); a.getWorldPosition(pa); b.getWorldPosition(pb); a.lookAt(pb); b.lookAt(pa); }
  }

  placeMachine(dt) {
    const w = this.world;
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const hF = w.height(this.pos.x + fwd.x * 3, this.pos.z + fwd.z * 3), hB = w.height(this.pos.x - fwd.x * 3, this.pos.z - fwd.z * 3);
    const hR = w.height(this.pos.x + right.x * 1.3, this.pos.z + right.z * 1.3), hL = w.height(this.pos.x - right.x * 1.3, this.pos.z - right.z * 1.3);
    this.pos.y = (hF + hB + hR + hL) / 4;
    const pitch = Math.atan2(hB - hF, 6), roll = Math.atan2(hR - hL, 2.6);
    this.root.position.copy(this.pos);
    this.root.rotation.set(pitch, this.heading, roll, 'YXZ');
    this.slopeDeg = THREE.MathUtils.radToDeg(Math.max(Math.abs(pitch), Math.abs(roll)));
    for (const wh of this.wheels) wh.rotation.x += this.speed * dt / 0.68;
    this.reachRing.position.copy(this.turretWorld()); this.reachRing.position.y = w.height(this.reachRing.position.x, this.reachRing.position.z) + 0.15;
  }

  update(dt) {
    this.time -= dt;
    const k = this.keys;
    if (this.state === 'drive') {
      const throttle = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
      this.speed += (throttle * 3.2 - this.speed) * Math.min(1, dt * 1.5);
      const steer = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
      this.heading += steer * dt * 0.5 * Math.sign(this.speed || 1) * Math.min(1, Math.abs(this.speed) / 1.2 + 0.2);
      const next = this.pos.clone().add(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(this.speed * dt));
      const blocked = this.specs.some((s) => !s.felled && Math.hypot(s.x - next.x, s.z - next.z) < 2.2);
      if (blocked) this.speed = 0; else this.pos.copy(next);
      sfx.dieselSet(0.25 + Math.abs(this.speed) / 4, 0);
      if (this.ik) { this.goal.yaw += ((k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0)) * dt * 0.8; }
    }
    if (this.state === 'reaching' || this.state === 'gripped' || this.state === 'cutting') {
      const s = this.target;
      this.aimAt(new THREE.Vector3(s.x, s.y + this.cutY + 0.5, s.z));
      this.stateT += dt;
      if (this.state === 'reaching' && this.stateT > 1.8) { this.state = 'gripped'; sfx.clank(); this.renderPanel(); }
      if (this.state === 'gripped') {
        this.fellAz += ((k.KeyE || k.KeyD ? 1 : 0) - (k.KeyQ || k.KeyA ? 1 : 0)) * dt * 1.0;
        const p = new THREE.Vector3(s.x + Math.cos(this.fellAz) * 4, 0, s.z + Math.sin(this.fellAz) * 4);
        p.y = this.world.height(p.x, p.z) + 0.6;
        this.dirArrow.position.copy(p); this.dirArrow.visible = true;
        this.dirArrow.rotation.set(0, -this.fellAz, -Math.PI / 2);
      }
      if (this.state === 'cutting' && this.stateT > 1.1) {
        sfx.sawSet(0.2, 0); sfx.crack(0.6);
        this.dirArrow.visible = false;
        this.tree.setAim(this.fellAz); this.tree.leanGroup.quaternion.identity();
        this.state = 'tipping'; this.tilt = 0.02; this.tiltW = 0.15;
        this.renderPanel();
      }
    }
    if (this.state === 'tipping') {
      const tr = this.tree;
      const ground = this.world.height(tr.spec.x + Math.cos(this.fellAz) * tr.H * 0.6, tr.spec.z + Math.sin(this.fellAz) * tr.H * 0.6) - tr.spec.y;
      const maxTilt = Math.PI / 2 - Math.atan2(ground, tr.H * 0.6) - 0.02;
      this.tiltW += Math.sin(this.tilt) * 2.2 * dt;
      this.tilt = Math.min(maxTilt, this.tilt + this.tiltW * dt);
      tiltQuat(new THREE.Vector2(this.tilt, 0), tr.fallPivot.quaternion);
      tr.root.updateMatrixWorld(true);
      this.aimAt(tr.stemPoint(this.cutY + 0.6));
      if (this.tilt >= maxTilt) {
        sfx.impact(0.5); sfx.rush(0.6);
        this.state = 'processing'; this.fed = 0; this.lastBuck = 0; this.feeding = false;
        this.stats.trees++; this.stats.pay += 16; // per-stem thinning rate
        this.target.felled = true;
        // clip what has already been bucked off
        this.clip = new THREE.Plane();
        tr.root.traverse((o) => {
          if (!o.isMesh) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          o.material = mats.map((m) => { const c = m.clone(); c.clippingPlanes = [this.clip]; return c; });
          if (o.material.length === 1) o.material = o.material[0];
        });
        this.renderPanel();
        sfx.sawStop();
        setTimeout(() => sfx.sawStart(), 50);
      }
    }
    if (this.state === 'processing') {
      const tr = this.tree;
      if (this.feeding) this.fed += dt * 3.6;
      const topLimit = tr.spec.sp.crown === 'conifer' ? tr.H - 2 : tr.spec.crownBase;
      const d = tr.radiusAt(this.cutY + this.fed) * 2;
      // stem slides back through the head
      const axis = this.stemAxis();
      tr.root.position.set(tr.spec.x, tr.spec.y, tr.spec.z).addScaledVector(axis, -this.fed);
      tr.root.updateMatrixWorld(true);
      const head = tr.stemPoint(this.cutY + this.fed + 0.1);
      this.aimAt(head);
      // keep the section between lastBuck and fed (the log being measured); clip what's been cut
      const keepFrom = tr.stemPoint(this.cutY + this.lastBuck);
      this.clip.setFromNormalAndCoplanarPoint(axis, keepFrom);
      this.curLen = this.fed - this.lastBuck; this.curDia = d;
      sfx.sawSet(this.feeding ? 0.55 : 0.25, this.feeding ? 0.4 : 0);
      if (this.cutY + this.fed >= topLimit || d < 0.06) {
        if (this.curLen > 0.5) this.buck();
        this.feeding = false;
        // top and crown drop as slash
        this.ui.toast('Topped out — crown dropped as slash.');
        sfx.crack(0.5);
        this.state = 'drive'; this.tree = null;
        sfx.sawStop();
        this.goal.a1 = this.e1 - 0.35; this.goal.a2 = this.e2 - this.goal.a1 + 0.6;
        this.goal.yaw = this.yaw0 ?? 0;
        this.renderPanel();
      }
      this.updateReadout();
    }
    for (const l of this.logs) if (l.mesh.position.y > l.settle) { l.vy -= 9.8 * dt; l.mesh.position.y = Math.max(l.settle, l.mesh.position.y + l.vy * dt); }
    this.applyCrane(dt);
    this.placeMachine(dt);
    // follow camera
    const want = this.pos.clone().add(new THREE.Vector3(0, 2.2, 0));
    const delta = want.clone().sub(this.controls.target);
    this.controls.target.add(delta); this.camera.position.add(delta);
    if (this.time <= 0) this.finish();
    this.timerT = (this.timerT || 0) - dt;
    if (this.timerT <= 0) { this.timerT = 0.5; this.updateReadout(); }
    if (this.slopeDeg > 18 && this.reachNow > 8.5 && !this.tipWarned) { this.tipWarned = true; this.ui.toast(`Machine at ${this.slopeDeg.toFixed(0)}° with the crane out — tip-over risk.`, 'bad'); }
  }

  renderPanel() {
    const s = this.state;
    const help = {
      drive: 'Drive with <b>W/S</b>, steer <b>A/D</b>, slew the crane <b>Q/E</b>. Click a marked stem inside the orange ring.',
      reaching: 'Crane reaching out…',
      gripped: 'Head is clamped. Choose a felling direction with <b>Q/E</b> (arrow), then <b>Space</b> to saw and fell.',
      cutting: 'Sawing…',
      tipping: 'Timber!',
      processing: '<b>Space</b> starts/stops the feed rollers. <b>B</b> bucks at the current length. Sawlogs: 3.7–5.5 m with a top ≥ 14 cm. Pulp: 2.4–3.1 m, top ≥ 7 cm. Anything else is cull.',
    }[s];
    this.ui.panel.innerHTML = `<div class="stepno">HARVESTER</div><h3>${s === 'processing' ? 'Processing' : s === 'drive' ? 'Thinning' : 'Felling'}</h3>
      <p>${help}</p>
      <div class="readout">
        <div><div class="lbl">Shift left</div><div class="v" id="hvT"></div></div>
        <div><div class="lbl">Earned</div><div class="v" id="hvP"></div></div>
        <div><div class="lbl">Stems</div><div class="v" id="hvS"></div></div>
        <div><div class="lbl">Logs · saw/pulp</div><div class="v" id="hvL"></div></div>
        ${s === 'processing' ? `<div><div class="lbl">Log length</div><div class="v" id="hvLen"></div></div><div><div class="lbl">Diameter at head</div><div class="v" id="hvD"></div></div>` : ''}
      </div>
      ${s === 'processing' ? '<div class="row"><button class="chip" id="hvFeed" type="button">Feed</button><button class="chip" id="hvBuck" type="button">Buck</button></div>' : ''}
      ${s === 'gripped' ? '<button class="go" id="hvCut" type="button">Saw &amp; fell</button>' : ''}
      <button class="go ghost" id="hvEnd" type="button">End shift</button>`;
    const b = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    b('hvFeed', () => { this.feeding = !this.feeding; });
    b('hvBuck', () => this.buck());
    b('hvCut', () => this.action());
    b('hvEnd', () => this.finish());
    this.ui.jobcard.innerHTML = `<div class="lbl">Pine Plantation — Block 7</div><h2>Commercial thinning</h2><div class="sub">Wheeled harvester · 10.5 m crane</div>`;
    this.updateReadout();
  }
  updateReadout() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const t = Math.max(0, this.time);
    set('hvT', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    set('hvP', money(this.stats.pay)); set('hvS', this.stats.trees); set('hvL', `${this.stats.logs} · ${this.stats.saw}/${this.stats.pulp}`);
    if (this.state === 'processing') { set('hvLen', `${(this.curLen || 0).toFixed(2)} m`); set('hvD', `${((this.curDia || 0) * 100).toFixed(1)} cm`); }
  }

  finish() {
    if (this.done) return; this.done = true;
    sfx.dieselStop(); sfx.sawStop();
    this.onDone({ trees: this.stats.trees, logs: this.stats.logs, pay: this.stats.pay });
  }
  dispose() { sfx.dieselStop(); sfx.sawStop(); this.renderer.localClippingEnabled = false; }
}
