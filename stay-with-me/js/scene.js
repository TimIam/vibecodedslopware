// On-scene mode: the patient in front of you, a clock, a kit, one partner, and everything in actions.js.
// The physiology runs in real time whatever the player is doing; every action occupies somebody's hands for its
// duration. Scene owns the camera, the body-region picking, the action menus, the monitor panel, the partner, the
// CPR / bagging skill inputs, and hands invasive procedures to procedures.js.

import * as THREE from 'three';
import { G, U, setStress } from './gfx.js';
import { Patient, SIM_SPEED, SHOCKABLE, clamp } from './physio.js';
import { addConditions } from './conditions.js';
import { ACTIONS, act, describeBreathSound, breathSoundKind } from './actions.js';
import { DRUGS } from './meds.js';
import { HOSPITALS, ALERTS } from './scenarios.js';
import { Snd } from './audio.js';
import { $, el, esc, say, toast, layers, openModal, closeModal, modalOpen, isOpen, modal, keys, onKey, fmtClock } from './ui.js';
import { buildGear } from './gear.js';
import { runProcedure } from './procedures.js';

const REGION_OF = a => /^(forehead|eye|mouth|nose|chin|ear)/.test(a) ? 'head' : /^(neckFront|carotid|sternalNotch)/.test(a) ? 'neck' : /^(sternumCPR|ics|apex|xiphoid)/.test(a) ? 'chest'
  : /^(epigastrium|ruq|luq|rlq|llq|umbilicus)/.test(a) ? 'abdomen' : /^(pelvis|groin)/.test(a) ? 'pelvis' : /^(deltoid|upperArm|acf|forearm|wrist|hand|finger)L/.test(a) ? 'armL' : /^(deltoid|upperArm|acf|forearm|wrist|hand|finger)R/.test(a) ? 'armR'
    : /^(thigh|thighLat|knee|tibia|ankle|foot)L/.test(a) ? 'legL' : /^(thigh|thighLat|knee|tibia|ankle|foot)R/.test(a) ? 'legR' : /^back/.test(a) ? 'back' : 'chest';
const REGION_NAME = { head: 'Head and face', neck: 'Neck', chest: 'Chest', abdomen: 'Abdomen', pelvis: 'Pelvis', armL: 'Left arm', armR: 'Right arm', legL: 'Left leg', legR: 'Right leg', back: 'Back' };

// Menu entries: [actionId, args, label override]. `me` actions are paramedic-only (the EMT partner cannot do them).
const M = (id, args, label) => ({ id, args: args || {}, label });
const MENU = {
  assess: [M('look'), M('response'), M('airway'), M('breathing'), M('pulse'), M('skin'), M('auscultate'), M('percuss'), M('neck'), M('pupils'), M('gcs'), M('bgl'), M('temp'), M('pain'), M('fast'),
    '-Expose and examine', M('expose', { part: 'chest' }, 'Expose the chest'), M('expose', { part: 'legs' }, 'Expose the legs'), M('expose', { part: 'all' }, 'Expose fully'), M('headToToe'), M('logRoll'), M('scene'),
    '-Ask', M('history', { q: 'what' }, '"What happened?"'), M('history', { q: 'allergies' }, '"Any allergies?"'), M('history', { q: 'meds' }, '"What medications?"'), M('history', { q: 'past' }, '"Medical history?"'), M('history', { q: 'last' }, '"Last ate or drank?"'), M('history', { q: 'events' }, '"What led up to this?"'), M('history', { q: 'pde5' }, '"Any Viagra or Cialis in two days?"'), M('reassure')],
  monitor: [M('monSpo2'), M('monEcg'), M('monBp'), M('monCap'), M('monPads'), M('twelveLead')],
  airway: [M('headTilt'), M('suction'), M('opa'), M('npa'), M('igel'), M('recovery'), M('backBlows'), M('thrusts'), M('magill'), M('cric')],
  breathing: [M('o2', { device: 'nc', flow: 3 }, 'Oxygen: nasal cannula 3 L'), M('o2', { device: 'nrb', flow: 15 }, 'Oxygen: non-rebreather 15 L'), M('o2', { device: 'off' }, 'Oxygen off'), M('bvm', {}, 'Bag-valve-mask ventilation'), M('bvmO2'),
    '-Position', M('position', { pos: 'sitting' }, 'Sit upright'), M('position', { pos: 'semi' }, 'Semi-recumbent'), M('position', { pos: 'supine' }, 'Lie flat'), M('position', { pos: 'legsUp' }, 'Flat, legs raised'),
    '-Chest', M('chestSeal', { side: 'L', vented: true }, 'Vented chest seal, left'), M('chestSeal', { side: 'R', vented: true }, 'Vented chest seal, right'), M('chestSeal', { side: 'L', vented: false }, 'Occlusive dressing, left'), M('chestSeal', { side: 'R', vented: false }, 'Occlusive dressing, right'),
    M('needleDecomp', { side: 'L' }, 'Needle decompression, left'), M('needleDecomp', { side: 'R' }, 'Needle decompression, right'), M('thoracostomy', { side: 'L' }, 'Finger thoracostomy, left'), M('thoracostomy', { side: 'R' }, 'Finger thoracostomy, right')],
  circulation: [M('cpr', {}, 'Chest compressions'), M('pressure', {}, 'Direct pressure on a wound'), M('tourniquet', { limb: 'legL' }, 'Tourniquet, left leg'), M('tourniquet', { limb: 'legR' }, 'Tourniquet, right leg'), M('tourniquet', { limb: 'armL' }, 'Tourniquet, left arm'), M('tourniquet', { limb: 'armR' }, 'Tourniquet, right arm'),
    M('pack', {}, 'Pack a wound'), M('dressing', {}, 'Pressure dressing'), M('binder'), M('splint', { where: 'legL', traction: true }, 'Traction splint, left leg'), M('splint', { where: 'legR', traction: true }, 'Traction splint, right leg'), M('collar'), M('blanket'),
    '-Access and fluids', M('iv', { site: 'acfL' }, 'IV cannula, left arm'), M('iv', { site: 'acfR' }, 'IV cannula, right arm'), M('io', { site: 'tibiaL' }, 'Intraosseous, left tibia'), M('io', { site: 'tibiaR' }, 'Intraosseous, right tibia'),
    M('fluids', { ml: 250 }, 'Saline 250 mL bolus'), M('fluids', { ml: 500 }, 'Saline 500 mL bolus'), M('fluids', { ml: 1000, pressure: true }, 'Saline 1000 mL, pressure bag'), M('fluids', { stop: true }, 'Clamp the fluids'),
    '-Heart', M('valsalva'), M('pericardiocentesis'), M('thoracotomy')],
  talk: [M('reassure'), M('backup', { what: 'fire' }, 'Request fire for manpower'), M('backup', { what: 'medic' }, 'Request a second unit'), M('terminate')],
};
const REGION_MENU = {
  head: ['response', 'airway', 'pupils', 'gcs', 'temp', 'fast', 'headTilt', 'suction', 'opa', 'npa', 'igel', 'magill', 'o2:nrb', 'o2:nc', 'bvm'],
  neck: ['pulse', 'neck', 'collar', 'cric'],
  chest: ['expose:chest', 'breathing', 'auscultate', 'percuss', 'monEcg', 'monPads', 'twelveLead', 'cpr', 'chestSeal:L', 'chestSeal:R', 'needleDecomp:L', 'needleDecomp:R', 'thoracostomy:L', 'thoracostomy:R', 'pericardiocentesis', 'thoracotomy'],
  abdomen: ['expose:all', 'headToToe', 'pericardiocentesis'], pelvis: ['headToToe', 'binder', 'expose:legs'],
  armL: ['pulse', 'skin', 'monBp', 'monSpo2', 'bgl', 'iv:acfL', 'tourniquet:armL'], armR: ['pulse', 'skin', 'monBp', 'monSpo2', 'bgl', 'iv:acfR', 'tourniquet:armR'],
  legL: ['expose:legs', 'tourniquet:legL', 'splint:legL', 'io:tibiaL'], legR: ['expose:legs', 'tourniquet:legR', 'splint:legR', 'io:tibiaR'], back: ['logRoll'],
};
const CATS = [['assess', 'Assess', '◉', 'Q'], ['monitor', 'Monitor', '∿', 'W'], ['airway', 'Airway', 'A', 'E'], ['breathing', 'Breathing', 'B', 'R'], ['circulation', 'Circulation', 'C', 'T'], ['drugs', 'Drug box', '✚', 'G'], ['talk', 'Radio / people', '☎', 'Y']];
const HOLD_LABEL = { cpr: 'compressions', vent: 'bagging', manoeuvre: 'holding the airway', pressure: 'direct pressure' };

export class Scene {
  constructor(game) { this.game = game; this.cam = new THREE.PerspectiveCamera(42, 1.6, 0.05, 3000); this.orbit = { yaw: 0.6, pitch: 0.5, dist: 2.4, target: new THREE.Vector3() }; this.ray = new THREE.Raycaster(); this.active = false; this.bindDom(); }

  // ---------------------------------------------------------------- setup
  // world = { scene, patientSpot: {pos, yaw, seatHeight}, partnerSpot, kitSpot, bystanderSpots, cameraBounds (Box3|null), cameraHome, update(dt,t), lights?, isSet }
  async start(sc, world, opts = {}) {
    const game = this.game;
    this.sc = sc; this.world = world; this.diff = game.diff; this.opts = opts; this.ready = false; this.human = null; this.gear = null;
    if (opts.patient) { this.p = opts.patient; this.script = opts.script; this.p.events.length = 0; }
    else {
      this.p = new Patient(Object.assign({ seed: (game.save.seed || 1) + sc.id.length * 7 + (game.save.attempt || 0) }, sc.pt), { rate: this.diff.rate, forgiving: this.diff.forgiving });
      addConditions(this.p, sc.conditions); sc.init?.(this.p);
      this.script = JSON.parse(JSON.stringify(sc.script || {}, (k, v) => typeof v === 'function' ? undefined : v));
    }
    this.p.events.length = 0;                      // whatever happened before you arrived is not news
    const pose = opts.inTransit ? 'supine' : sc.pose;
    this.ctx = { id: sc.id, pt: sc.pt, script: this.script, partnerBusy: () => this.crew.every(c => c.task) };
    this.crew = sc.partnerDown ? [] : [{ name: 'Dee', role: 'EMT', task: null, t: 0, hold: null }];
    this.backupDue = sc.autoBackup || 0;
    this.busy = null; this.skill = null; this.machine = []; this.hintsSaid = new Set(); this.afterSaid = new Set(); this.linesSaid = new Set(); this.clearT = -99; this.t0 = performance.now();
    this.breath = 0; this.breathV = 0; this.beatT = 0; this.done = null; this.packaging = null; this.logLines = 0; this.monOn = false; this.stethOn = 0; this.lastAlarm = 'none'; this.arrestMusic = false;
    $('#log').innerHTML = ''; $('#ptName').textContent = 'Unknown patient'; $('#ptSub').textContent = `${sc.dispatch.nature}`;
    $('#monWrap').classList.remove('on'); this.closeFly();
    if (opts.patient) { $('#ptName').textContent = `${sc.pt.first} ${sc.pt.last}`; $('#ptSub').textContent = 'In the back of Medic 14'; }
    // people
    const H = game.mods.human;
    const spot = world.patientSpot;
    this.root = new THREE.Group(); world.scene.add(this.root);
    const spec = Object.assign({ sex: sc.pt.sex, age: sc.pt.age, heightM: sc.pt.heightM, bmi: sc.pt.weight / (sc.pt.heightM * sc.pt.heightM), pose, eyes: this.p.conscious ? 'open' : 'closed', seed: sc.id.length * 13 + sc.pt.age }, sc.pt.look);
    game.load?.(0.1, 'Patient');
    this.human = await H.buildHuman(spec, f => game.load?.(0.1 + 0.6 * f, 'Patient'));
    this.human.group.position.copy(spot.pos); this.human.group.rotation.y = spot.yaw || 0; this.root.add(this.human.group);
    if (/sitting|slumped/.test(pose) && spot.seatHeight != null && this.human.seat != null) this.human.group.position.y += spot.seatHeight - this.human.seat;
    this.human.group.updateMatrixWorld(true);
    this.anat = null;
    try { this.anat = await game.mods.anatomy.buildAnatomy(this.human, { organs: true }); } catch (e) { console.warn('anatomy unavailable', e); }
    for (const f of this.script.findings || []) if (f.wound && this.human.addWound) { const a = this.human.anchors[f.wound.anchor]; if (a) { const pos = a.pos.clone(); if (f.wound.off) { pos.x += f.wound.off[0]; pos.z += f.wound.off[1]; } f.woundId = this.human.addWound({ pos, normal: a.normal, kind: f.wound.kind, size: f.wound.size, angle: 0.4 }); } }
    this.human.setGround?.(0);
    game.load?.(0.75, 'Crew');
    this.partnerMesh = null;
    if (this.crew.length && world.partnerSpot) {
      try {
        const d = await H.buildHuman({ sex: 'f', age: 51, heightM: 1.68, bmi: 25, skin: 0.8, hair: { style: 'bun', color: 0x1a1412 }, pose: pose === 'supine' && !opts.inTransit ? 'kneeling' : 'standing', detail: 'low', clothing: { top: 'uniform', topColor: 0x1f3a2c, bottom: 'uniform', bottomColor: 0x1b1f24, shoes: 'boots' }, eyes: 'open', seed: 51 });
        d.group.position.copy(world.partnerSpot.pos); d.group.rotation.y = world.partnerSpot.yaw || 0; this.root.add(d.group); this.partnerMesh = d;
      } catch (e) { console.warn('partner mesh', e); }
    }
    // whoever called it in: a relative, a colleague, a police officer
    this.bystanderMesh = null;
    if (this.script.bystander && world.bystanderSpots?.[0] && !opts.inTransit) {
      try {
        const nm = this.script.bystander, cop = /Officer/.test(nm), fem = /Mrs\.|Priya|Kayla|Amber|Claire/.test(nm), h = [...nm].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7), r = k => ((h >>> k) & 255) / 255;
        const b = await H.buildHuman({ sex: fem ? 'f' : 'm', age: /Mrs\.|Harold/.test(nm) ? 68 : 24 + Math.floor(r(3) * 25), heightM: fem ? 1.6 + r(5) * 0.1 : 1.72 + r(5) * 0.12, bmi: 21 + r(9) * 8, skin: r(1), hair: { style: cop ? 'buzz' : fem ? ['long', 'bun', 'curly'][h & 1 ? 0 : (h & 2 ? 1 : 2)] : ['short', 'buzz', 'balding'][Math.abs(h) % 3], color: /Mrs\.|Harold/.test(nm) ? 0xc8c8c8 : [0x1a1412, 0x4a3420, 0x6a4a2a, 0x2a1a12][Math.abs(h >> 4) % 4] }, pose: 'standing', detail: 'low', eyes: 'open', seed: Math.abs(h) % 9973,
          clothing: cop ? { top: 'uniform', topColor: 0x18223a, bottom: 'uniform', bottomColor: 0x141a28, shoes: 'boots' } : { top: /Mrs\.|Harold/.test(nm) ? 'jacket' : (h & 16) ? 'hoodie' : 'shirt', topColor: [0x7a8a6a, 0x7a2f3a, 0x4a5a7a, 0x2f5a5a, 0x5a4a6a][Math.abs(h >> 6) % 5], bottom: fem && (h & 8) ? 'skirt' : 'trousers', bottomColor: [0x2a2c33, 0x3a3428, 0x1e2636][Math.abs(h >> 9) % 3], shoes: 'trainers' } });
        const sp = world.bystanderSpots[0]; b.group.position.copy(sp.pos); b.group.rotation.y = sp.yaw || 0; this.root.add(b.group); this.bystanderMesh = b;
      } catch (e) { console.warn('bystander mesh', e); }
    }
    this.gear = buildGear(this.human, this.root, world.kitSpot);
    if (opts.patient) { const ex = this.p.exposed || {}; for (const k in ex) if (ex[k]) this.human.expose?.(k, true); if (this.p.exposedAll) for (const k of ['chest', 'legs', 'abdomen', 'arms']) this.human.expose?.(k, true); this.gear.sync(this.p); for (const c of this.crew) { if (this.p.tx.cpr.on && this.p.tx.cpr.by !== 'me') { c.task = 'cpr'; c.dur = Infinity; } else if (this.p.tx.vent.on) { c.task = 'bvm'; c.dur = Infinity; } } }
    game.load?.(0.95, 'Scene');
    // camera
    const chest = this.anchorWorld('sternumCPR') || spot.pos.clone().add(new THREE.Vector3(0, 0.3, 0));
    this.orbit.target.copy(chest); this.orbit.dist = pose === 'supine' ? (opts.inTransit ? 1.5 : 2.3) : 2.6; this.orbit.pitch = pose === 'supine' ? 0.75 : 0.25;
    this.orbit.yaw = world.cameraHome ? Math.atan2(world.cameraHome.pos.x - chest.x, world.cameraHome.pos.z - chest.z) : (spot.yaw || 0) + 1.1;
    this.cam.fov = 42; this.camDist = null;
    { // prefer the set's own camera angle; turn away from it only as far as needed for a clear view
      const base = this.orbit.yaw; let best = base, bd = -Infinity;
      // someone sitting up should be seen from the front, not the back of their head
      let front = null; if (pose !== 'supine') { const a = this.human.anchors?.sternumCPR; if (a?.normal) { const n = a.normal.clone().transformDirection(this.human.group.matrixWorld); if (Math.hypot(n.x, n.z) > 0.4) front = Math.atan2(n.x, n.z); } }
      for (let k = 0; k < 12; k++) { const turn = Math.ceil(k / 2), y = base + (k % 2 ? 1 : -1) * turn * Math.PI / 6; this.orbit.yaw = y; this.camDist = null; this.placeCam(0); const d = this.camDist - turn * 0.1 - this.crowding() - (front == null ? 0 : 0.9 * (1 - Math.cos(y - front)) / 2); if (d > bd) { bd = d; best = y; } }
      this.orbit.yaw = best; this.camDist = null; }
    this.placeCam(0);
    G.view(world.scene, this.cam);
    layers('hudScene'); this.active = true; this.ready = true;
    Snd.setInterior(world.isSet ? 0.9 : 0); Snd.siren('off'); Snd.engine({ on: false, rpm: 0, load: 0, speed: 0 });
    Snd.ambient(world.ambient || (world.isSet ? 'room' : U.uNight.value > 0.5 ? 'townNight' : 'townDay')); Snd.music('tension');
    this.buildCats(); this.buildMonKeys(); this.sceneButtons();
    if (!opts.patient && !localStorage.getItem('staywithme.help1')) { localStorage.setItem('staywithme.help1', '1'); this.helpCard(); }
    // opening lines
    let t = 600;
    if (!opts.patient) for (const l of this.script.opening || []) { setTimeout(() => this.active && this.speak(l.who, l.say), t); t += 2600 + l.say.length * 45; }
    if (sc.bystanderCPR && !opts.patient) { this.p.tx.cpr.on = true; this.p.tx.cpr.by = 'bystander'; this.p.tx.cpr.baseQ = 0.6; this.p.tx.cpr.rate = 100; this.p.tx.cpr.cycleStart = 0; this.crewBystander = { name: this.script.bystander?.split(' ')[0] || 'Bystander', task: 'cpr' }; }
    return new Promise(res => { this.done = res; });
  }

  helpCard() {
    modal(`<h2>On scene</h2><div style="line-height:1.75;color:#d3dbe2;font-size:14.5px">
      <p>The patient's body keeps its own time. Nothing waits for you, and the monitor shows only what you have attached.</p>
      <p><b>Click the patient</b> for what you can do to that part of them, or use the menu on the left (<kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> <kbd>T</kbd> <kbd>G</kbd> <kbd>Y</kbd>). Everything takes time and occupies your hands. <kbd>Esc</kbd> stops what you are doing.</p>
      <p><b>Shift+click</b> a menu item, or click Dee's panel, to give your partner the job instead. She is an EMT: she cannot give drugs or put needles in.</p>
      <p><b>Drag</b> to look around, <b>scroll</b> to zoom, <kbd>F</kbd> to step the view from chest to head, neck, arm, leg.</p>
      <p>Before a shock, say <b>CLEAR</b> (<kbd>X</kbd>) and make sure nobody, including you, is touching the patient.</p>
      <p>When you have done what must be done here, <b>Load and go</b>. Where you take them matters.</p></div>`, [['ok', 'Go to work', true]]);
  }
  anchorWorld(name) { const a = this.human?.anchors?.[name]; if (!a) return null; return this.human.group.localToWorld(a.pos.clone()); }

  // ---------------------------------------------------------------- speech / log
  speak(who, text) {
    const first = this.sc.pt.first; const kind = who === 'Dee' ? 'dee' : who === first ? 'pt' : /Dispatch|radio/i.test(who) ? 'radio' : 'by';
    say(who, text, kind);
    if (who === first) $('#ptName').textContent = `${first} ${this.sc.pt.last}`, $('#ptSub').textContent = `${this.sc.pt.age} y, ${this.sc.pt.sex === 'f' ? 'female' : 'male'}, ~${this.sc.pt.weight} kg`;
  }
  log(msg, tone = 'info') {
    if (!msg) return; const box = $('#log');
    box.append(el('div', { class: 'ln ' + tone, html: `<i>${fmtClock(this.p.t)}</i>${esc(msg)}` })); box.scrollTop = box.scrollHeight;
    while (box.children.length > 60) box.firstChild.remove();
  }

  // ---------------------------------------------------------------- menus
  bindDom() {
    const c = G.canvas || document.getElementById('game');
    let down = null;
    c.addEventListener('pointerdown', e => { if (!this.active || this.proc) return; down = { x: e.clientX, y: e.clientY, b: e.button, moved: false }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (!this.active || this.proc) return;
      if (down) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true; if (down.moved) { this.orbit.yaw -= e.movementX * 0.006; this.orbit.pitch = clamp(this.orbit.pitch + e.movementY * 0.005, 0.06, 1.45); } }
      else this.hover(e);
    });
    c.addEventListener('pointerup', e => { if (!this.active || this.proc) return; if (down && !down.moved && down.b === 0) this.click(e); down = null; });
    c.addEventListener('wheel', e => { if (!this.active || this.proc) return; this.orbit.dist = clamp(this.orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9), 0.45, 5); e.preventDefault(); }, { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    onKey(code => {
      if (!this.active || this.proc) return;
      if (code === 'Escape') { if (isOpen('drugs') || isOpen('ecg12') || isOpen('generic')) { closeModal('drugs'); closeModal('ecg12'); return true; } if ($('#fly').classList.contains('on')) { this.closeFly(); return true; } if (this.skill) { this.stopSkill(); return true; } if (this.busy) { this.cancelBusy(); return true; } return; }
      if (modalOpen()) return;
      if (this.skill) return;
      const cat = CATS.find(c => 'Key' + c[3] === code); if (cat) { this.openCat(cat[0]); return true; }
      if (code === 'KeyX') { this.callClear(); return true; }
      if (code === 'KeyF') { this.focusNext(); return true; }
    });
    $('#partner').addEventListener('click', () => this.active && this.partnerMenu());
    $('#monCanvas').addEventListener('click', e => { const mon = this.game.monitor; if (!this.active || !mon?.hit) return; const r = e.target.getBoundingClientRect(); const id = mon.hit(e.clientX - r.left, e.clientY - r.top); if (!id) return; Snd.ui('tick'); if (id === 'nibp') this.machineRun('monBp', 30); else if (id === '12lead') this.choose('twelveLead', {}, 'me'); else mon.handle?.(id); });
  }
  buildCats() {
    const box = $('#cats'); box.innerHTML = '';
    for (const [id, label, ic, k] of CATS) box.append(el('button', { 'data-cat': id, onclick: () => this.openCat(id) }, el('span', { class: 'ic', text: ic }), label, el('span', { class: 'k', text: k })));
  }
  closeFly() { $('#fly').classList.remove('on'); for (const b of document.querySelectorAll('#cats button')) b.classList.remove('on'); this.flyCat = null; }
  openCat(id) {
    if (this.flyCat === id) return this.closeFly();
    Snd.ui('click');
    if (id === 'drugs') { this.closeFly(); return this.openDrugs(); }
    this.flyCat = id; for (const b of document.querySelectorAll('#cats button')) b.classList.toggle('on', b.dataset.cat === id);
    this.fillFly(CATS.find(c => c[0] === id)[1], MENU[id]);
  }
  fillFly(title, items) {
    const fly = $('#fly'); fly.innerHTML = ''; fly.classList.add('on');
    fly.append(el('div', { class: 'hd' }, el('span', { class: 'cap', text: title }), el('span', { class: 'cap', style: { letterSpacing: '.04em', textTransform: 'none' }, html: this.crew.length ? '<kbd>Shift</kbd>+click: Dee does it' : '' })));
    for (const it of items) {
      if (typeof it === 'string') { fly.append(el('div', { class: 'sep', text: it.slice(1) })); continue; }
      const A = ACTIONS[it.id]; if (!A) continue;
      if (it.id === 'thoracotomy' && !this.diff.scopeThoracotomy && this.sc.id !== 'gsw' && this.sc.id !== 'dee') continue;
      const why = A.needs?.(this.p, it.args, this.ctx);
      const dur = A.proc ? 'procedure' : A.dur ? `${Math.round(A.dur)} s` : '';
      fly.append(el('button', { class: 'it' + (why ? ' dis' : '') + (A.who === 'me' ? ' me' : ''), title: why || '', onclick: e => { this.choose(it.id, it.args, e.shiftKey ? 'crew' : 'me'); } }, el('span', { text: it.label || A.label }), el('small', { text: dur })));
    }
  }
  regionMenu(region) {
    const items = [];
    for (const s of REGION_MENU[region] || []) {
      const [id, arg] = s.split(':'); const A = ACTIONS[id]; if (!A) continue; let args = {}, label = A.label;
      if (id === 'expose') { args = { part: arg }; label = `Expose (${arg})`; } else if (id === 'o2') { args = { device: arg, flow: arg === 'nc' ? 3 : 15 }; label = arg === 'nc' ? 'Oxygen: nasal cannula' : 'Oxygen: non-rebreather'; }
      else if (id === 'chestSeal') { args = { side: arg, vented: true }; label = `Vented chest seal, ${arg === 'L' ? 'left' : 'right'}`; } else if (id === 'needleDecomp' || id === 'thoracostomy') { args = { side: arg }; label = `${A.label}, ${arg === 'L' ? 'left' : 'right'}`; }
      else if (id === 'iv' || id === 'io') args = { site: arg }; else if (id === 'tourniquet') args = { limb: arg }; else if (id === 'splint') { args = { where: arg, traction: true }; label = 'Traction splint'; }
      items.push(M(id, args, label));
    }
    this.flyCat = 'region'; for (const b of document.querySelectorAll('#cats button')) b.classList.remove('on');
    this.fillFly(REGION_NAME[region], items);
  }
  partnerMenu() {
    if (!this.crew.length) return toast('You are on your own.', 'bad');
    const items = [M('cpr', {}, 'Take over compressions'), M('bvm', { rate: 10 }, 'Bag at 10 a minute'), M('bvm', { rate: 6 }, 'Bag slowly, 6 a minute'), M('headTilt', {}, 'Hold the airway open'), M('pressure', {}, 'Direct pressure'), '-Set up', M('monSpo2'), M('monEcg'), M('monBp'), M('monPads'), M('o2', { device: 'nrb', flow: 15 }, 'Oxygen: non-rebreather'), M('collar'), M('suction'), M('bgl'), M('expose', { part: 'chest' }, 'Cut the shirt off'), M('expose', { part: 'all' }, 'Expose fully'), M('tourniquet', {}, 'Tourniquet'), M('binder'), M('blanket'), M('stop', {}, 'Stop what you are doing')];
    this.flyCat = 'partner'; const fly = $('#fly'); fly.innerHTML = ''; fly.classList.add('on');
    fly.append(el('div', { class: 'hd' }, el('span', { class: 'cap', text: 'Dee: do this' })));
    for (const it of items) { if (typeof it === 'string') { fly.append(el('div', { class: 'sep', text: it.slice(1) })); continue; } fly.append(el('button', { class: 'it', onclick: () => { if (it.id === 'stop') { this.crewStop(this.crew[0], true); this.closeFly(); } else this.choose(it.id, it.args, 'crew'); } }, el('span', { text: it.label || ACTIONS[it.id].label }))); }
  }

  // ---------------------------------------------------------------- picking
  pick(e) {
    const r = G.canvas.getBoundingClientRect(); const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const hits = this.ray.intersectObject(this.human.group, true); if (!hits.length) return null;
    const local = this.human.group.worldToLocal(hits[0].point.clone()); let best = null, bd = 1e9;
    for (const k in this.human.anchors) { const d = this.human.anchors[k].pos.distanceToSquared(local); if (d < bd) { bd = d; best = k; } }
    return { anchor: best, region: REGION_OF(best), point: hits[0].point, local };
  }
  hover(e) { const tip = $('#tip'); if (modalOpen() || this.skill) { tip.style.display = 'none'; return; } const h = this.pick(e); if (!h) { tip.style.display = 'none'; G.canvas.style.cursor = ''; return; } const r = $('#view').getBoundingClientRect(); tip.style.display = 'block'; tip.style.left = e.clientX - r.left + 14 + 'px'; tip.style.top = e.clientY - r.top + 12 + 'px'; tip.textContent = REGION_NAME[h.region]; G.canvas.style.cursor = 'pointer'; }
  click(e) { if (modalOpen() || this.skill) return; const h = this.pick(e); if (!h) return this.closeFly(); Snd.ui('click'); this.lastPick = h; this.regionMenu(h.region); }
  focusNext() { const order = ['sternumCPR', 'forehead', 'neckFront', 'acfL', 'thighR', 'umbilicus']; this.focusI = ((this.focusI ?? -1) + 1) % order.length; const w = this.anchorWorld(order[this.focusI]); if (w) { this.focusTo = w; this.orbit.dist = this.focusI === 0 ? 2.2 : 1.1; } }

  // ---------------------------------------------------------------- doing things
  freeCrew() { return this.crew.find(c => !c.task) || null; }
  choose(id, args, who) {
    const A = ACTIONS[id]; const p = this.p;
    args = Object.assign({}, args);
    // things that need a target picked from what has been found
    if ((id === 'pressure' || id === 'pack' || id === 'dressing') && !args.site) return this.pickWound(id, args, who);
    if (id === 'tourniquet' && !args.limb) return this.pickLimb(args, who);
    const why = A.needs?.(p, args, this.ctx); if (why) { toast(why, 'bad'); Snd.ui('error'); return; }
    this.closeFly();
    if (who === 'crew') {
      if (!this.crew.length) return toast('There is nobody to ask. You are on your own.', 'bad');
      if (A.who === 'me') { this.speak(this.crew[0].name, this.crew[0].name === 'Dee' ? 'I\'m a basic, Rook. That one\'s yours.' : 'That\'s a medic skill. I can\'t.'); return; }
      const c = this.freeCrew() || this.crew[0];
      if (c.task) this.crewStop(c);
      return this.crewStart(c, id, args);
    }
    if (this.skill) return toast(`Your hands are busy (${this.skill.kind}). Esc to stop.`, 'bad');
    if (this.busy) this.cancelBusy();
    if (A.proc) return this.startProc(id, args);
    if (id === 'cpr') return this.startSkill('cpr');
    if (id === 'bvm') return this.startSkill('bvm', args);
    if (A.hold) { this.myHold = A.hold; const r = act(p, id, args, this.ctx); this.log(r.msg, r.tone); this.busy = { id, args, hold: true, label: 'You: ' + HOLD_LABEL[A.hold] }; return; }
    if (!A.dur) return this.finish(id, args, 'me');
    this.busy = { id, args, t: 0, dur: A.dur * (this.sc.partnerDown && id === 'logRoll' ? 1.5 : 1), label: (args && MENU_LABEL(id, args)) || A.label };
    this.sfxStart(id);
  }
  cancelBusy() { const b = this.busy; if (!b) return; if (b.hold) this.releaseHold(b.id, 'me'); this.busy = null; $('#busy').classList.remove('on'); Snd.stethoscope(false); }
  releaseHold(id, who) {
    const p = this.p, h = ACTIONS[id].hold;
    const othersHolding = this.crew.some(c => c.task === id) || (who !== 'me' && this.busy?.id === id) || (who !== 'me' && this.skill && ((id === 'cpr' && this.skill.kind === 'cpr') || (id === 'bvm' && this.skill.kind === 'bvm')));
    if (othersHolding) return;
    if (h === 'manoeuvre') p.tx.manoeuvre = false; else if (h === 'pressure') p.tx.pressureOn = null; else if (h === 'cpr') act(p, 'cpr', { stop: true }); else if (h === 'vent') act(p, 'bvm', { stop: true });
  }
  crewStart(c, id, args) {
    const A = ACTIONS[id]; c.task = id; c.args = args; c.t = 0; c.dur = A.hold ? Infinity : A.dur;
    if (A.hold) { const a2 = Object.assign({ by: 'partner' }, args); if (id === 'bvm') a2.o2 = this.p.tx.vent.o2; const r = act(this.p, id, a2, this.ctx); this.log(`${c.name}: ${r.msg}`, r.tone); if (id === 'cpr' && this.crewBystander) this.crewBystander = null; }
    else this.sfxStart(id);
    const ack = { cpr: 'On the chest.', bvm: 'Bagging.', headTilt: 'Got the airway.', pressure: 'Pressure on.', monEcg: 'Leads going on.', monPads: 'Pads.', collar: 'Collar.' }[id];
    if (ack && Math.random() < 0.7) this.speak(c.name, ack);
  }
  crewStop(c, announce) { if (!c.task) return; const id = c.task; c.task = null; if (ACTIONS[id].hold) this.releaseHold(id, c.name); if (announce) this.speak(c.name, 'Hands off.'); }
  finish(id, args, who) {
    const p = this.p; const r = act(p, id, args, this.ctx);
    this.log((who !== 'me' ? who + ': ' : '') + r.msg, r.tone);
    this.afterAction(id, args, r, who);
    return r;
  }
  afterAction(id, args, r, who) {
    const p = this.p, h = this.human;
    if (id === 'backup' && !this.backupDue) {
      if (this.sc.noBackup) setTimeout(() => this.active && say('Dispatch', 'Medic 14, negative. Engine 4 is committed and Medic 9 is out of service. You are on your own.', 'radio'), 1800);
      else this.backupDue = p.t + (args.what === 'medic' ? 420 : 240);
    }
    if (r.tone === 'bad') Snd.ui('bad'); else if (r.tone === 'good') Snd.ui('good');
    if (id === 'expose') { h.expose?.(args.part, true); if (args.part === 'all') { h.expose?.('chest', true); h.expose?.('legs', true); h.expose?.('abdomen', true); h.expose?.('arms', true); } Snd.shears(); }
    if (id === 'auscultate') { this.stethOn = 3; Snd.stethoscope(true); }
    if (id === 'twelveLead' && !r.blocked) this.show12(r.pattern, r.hr);
    if (id === 'history' && r.speaker) { /* already logged */ }
    if (id === 'monBp') Snd.nibp(false);
    if (id === 'suction') Snd.suction(false);
    if (id === 'iv' || id === 'io') { /* procedure handled */ }
    this.gear.sync(p);
    if (this.flyCat && this.flyCat !== 'region' && this.flyCat !== 'partner' && $('#fly').classList.contains('on')) this.fillFly(CATS.find(c => c[0] === this.flyCat)[1], MENU[this.flyCat]);
  }
  sfxStart(id) {
    if (id === 'monBp') Snd.nibp(true); else if (id === 'suction') Snd.suction(true); else if (id === 'expose') Snd.shears(); else if (/^mon|collar|binder|tourniquet|splint/.test(id)) Snd.velcro();
    else if (id === 'auscultate') { Snd.stethoscope(true); this.stethOn = 99; } else if (id === 'drug') Snd.packaging(); else if (/opa|npa|igel|o2|chestSeal|dressing|pack/.test(id)) Snd.packaging(); else if (id === 'recovery' || id === 'logRoll' || id === 'position') Snd.zipper();
  }
  pickWound(id, args, who) {
    const h = this.p.get('hemorrhage'); const seen = (this.script.findings || []).filter(f => f.seen && f.wound?.bleed).map(f => f.wound.bleed);
    const sites = (h?.sites || []).filter(s => s.ext && (seen.includes(s.id) || !this.script.findings?.some(f => f.wound?.bleed === s.id)));
    if (!sites.length) { toast('You have not found a wound to treat. Expose and look.', 'bad'); return; }
    if (sites.length === 1) return this.choose(id, Object.assign({}, args, { site: sites[0].id }), who);
    this.flyCat = 'wound'; const fly = $('#fly'); fly.innerHTML = ''; fly.classList.add('on'); fly.append(el('div', { class: 'hd' }, el('span', { class: 'cap', text: 'Which wound?' })));
    for (const s of sites) fly.append(el('button', { class: 'it', onclick: () => this.choose(id, Object.assign({}, args, { site: s.id }), who) }, el('span', { text: s.label })));
  }
  pickLimb(args, who) {
    this.flyCat = 'limb'; const fly = $('#fly'); fly.innerHTML = ''; fly.classList.add('on'); fly.append(el('div', { class: 'hd' }, el('span', { class: 'cap', text: 'Which limb?' })));
    for (const [l, n] of [['legL', 'Left leg'], ['legR', 'Right leg'], ['armL', 'Left arm'], ['armR', 'Right arm']]) fly.append(el('button', { class: 'it', onclick: () => this.choose('tourniquet', Object.assign({}, args, { limb: l }), who) }, el('span', { text: n })));
  }

  // ---------------------------------------------------------------- procedures
  async startProc(id, args) {
    if (!this.anat) { // no anatomy model available: resolve by a dice roll so the game is still playable
      const r = this.finish(id, Object.assign({ ok: Math.random() < 0.8 }, args), 'me'); return r;
    }
    this.proc = id; this.closeFly(); $('#tip').style.display = 'none';
    const res = await runProcedure(id, args, this);
    this.proc = null; layers('hudScene'); G.view(this.world.scene, this.cam);
    if (!res || res.cancelled) { this.log('Procedure abandoned.', 'warn'); return; }
    this.finish(id, Object.assign({}, args, res), 'me');
  }

  // ---------------------------------------------------------------- skills: your own hands on the chest / the bag
  startSkill(kind, args = {}) {
    const p = this.p; this.closeFly();
    if (kind === 'cpr') { const c = this.crew.find(c => c.task === 'cpr'); if (c) this.crewStop(c); this.crewBystander = null; const r = act(p, 'cpr', { by: 'me', q: 0.5, rate: 110 }, this.ctx); this.log(r.msg); this.skill = { kind, last: 0, ivs: [], q: 0.5, n: 0, downT: 0 }; if (!p.flags.ribs) { p.flags.ribs = true; setTimeout(() => Snd.ribCrack(), 1500); } }
    else { const c = this.crew.find(c => c.task === 'bvm'); if (c) this.crewStop(c); const r = act(p, 'bvm', { by: 'me', rate: 0, tv: 0.5, o2: p.tx.vent.o2 }, this.ctx); this.log(r.msg, r.tone); this.skill = { kind, last: performance.now() / 1000, ivs: [], downT: 0, squeezing: false, n: 0 }; }
    const box = $('#skill'); box.classList.add('on');
    box.innerHTML = kind === 'cpr' ? `<div class="cap">Chest compressions: tap <kbd>Space</kbd> on the beat, 100-120 a minute, let the chest recoil</div><div class="beat"><i></i><b id="beatDot"></b></div><div class="stats"><span>Rate <b id="skRate">--</b></span><span>Quality <b id="skQ">--</b></span><span>Cycle <b id="skCyc">0:00</b></span><span><kbd>Esc</kbd> stop</span></div>`
      : `<div class="cap">Bagging: hold <kbd>Space</kbd> about one second to squeeze, one breath every 5-6 seconds</div><div class="beat"><b id="beatDot" style="width:0;left:0;background:var(--cyan)"></b></div><div class="stats"><span>Rate <b id="skRate">--</b></span><span>Volume <b id="skQ">--</b></span><span>O₂ <b id="skCyc">${p.tx.vent.o2 ? 'on' : 'OFF'}</b></span><span><kbd>O</kbd> connect O₂ &nbsp; <kbd>Esc</kbd> stop</span></div>`;
    Snd.metronome(kind === 'cpr' && this.diff.metronome, 110);
  }
  stopSkill() { const s = this.skill; if (!s) return; this.skill = null; $('#skill').classList.remove('on'); Snd.metronome(false, 110); if (s.kind === 'cpr') { if (!this.crew.some(c => c.task === 'cpr')) act(this.p, 'cpr', { stop: true }); } else if (!this.crew.some(c => c.task === 'bvm')) act(this.p, 'bvm', { stop: true }); }
  tickSkill(dt) {
    const s = this.skill, p = this.p, now = performance.now() / 1000; if (!s) return;
    const sp = keys.has('Space');
    if (s.kind === 'cpr') {
      if (sp && !s.held) { s.held = true; s.downT = now; if (s.last) { const iv = now - s.last; if (iv < 2) { s.ivs.push(iv); if (s.ivs.length > 6) s.ivs.shift(); } else s.ivs.length = 0; } s.last = now; s.n++; Snd.cprThump(0.9); this.compress = 1; }
      if (!sp && s.held) { s.held = false; const hold = now - s.downT; s.leanPenalty = hold > 0.38 ? 0.25 : 0; }
      const mean = s.ivs.length >= 2 ? s.ivs.reduce((a, b) => a + b, 0) / s.ivs.length : 0, rate = mean ? 60 / mean : 0;
      const sd = s.ivs.length >= 3 ? Math.sqrt(s.ivs.reduce((a, b) => a + (b - mean) ** 2, 0) / s.ivs.length) : 0;
      let q = rate ? clamp(1 - Math.max(0, 100 - rate) / 45 - Math.max(0, rate - 120) / 50) * clamp(1 - sd * 3.5) * (1 - (s.leanPenalty || 0)) : 0;
      if (now - s.last > 1.3) q = 0;
      s.q += (q - s.q) * Math.min(1, dt * 3); p.tx.cpr.q = s.q; p.tx.cpr.rate = rate || 0; p.tx.cpr.by = 'me';
      if (now - s.last > 2.5 && p.tx.cpr.on) { p.tx.cpr.on = false; p.tx.cpr.lastPause = p.t; } else if (now - s.last < 1.3 && !p.tx.cpr.on) { act(p, 'cpr', { by: 'me', q: s.q }); }
      $('#skRate').textContent = rate ? Math.round(rate) : '--'; $('#skQ').textContent = Math.round(s.q * 100) + '%'; $('#skCyc').textContent = fmtClock(p.t - (p.tx.cpr.cycleStart || p.t));
      const ph = ((now * 110 / 60) % 1); $('#beatDot').style.left = (ph * 100) + '%';
    } else {
      if (keys.has('KeyO') && !p.tx.vent.o2) { act(p, 'bvmO2', {}, this.ctx); this.log('Reservoir connected to oxygen at 15 L/min.', 'good'); $('#skCyc').textContent = 'on'; }
      if (sp && !s.squeezing) { s.squeezing = true; s.downT = now; Snd.bvm(); }
      if (s.squeezing) { const d = now - s.downT; $('#beatDot').style.width = clamp(d / 1.8) * 100 + '%'; this.bagV = clamp(d / 1.0); }
      if (!sp && s.squeezing) { s.squeezing = false; const d = now - s.downT; const tv = clamp(0.15 + d * 0.38, 0.15, 0.95); s.ivs.push({ iv: now - s.last, tv }); if (s.ivs.length > 4) s.ivs.shift(); s.last = now; s.n++; $('#beatDot').style.width = '0'; this.bagV = 0; }
      const rec = s.ivs.filter(x => x.iv < 20); const mean = rec.length ? rec.reduce((a, b) => a + b.iv, 0) / rec.length : 0; let rate = mean ? 60 / mean : 0; const tv = rec.length ? rec.reduce((a, b) => a + b.tv, 0) / rec.length : 0.5;
      if (now - s.last > 14) rate = 0;
      p.tx.vent.rate = rate; p.tx.vent.tv = tv; p.tx.vent.on = true; p.tx.vent.by = 'me';
      $('#skRate').textContent = rate ? Math.round(rate) + '/min' : '--'; $('#skQ').textContent = rec.length ? Math.round(tv * 1000) + ' mL' : '--';
    }
  }

  // ---------------------------------------------------------------- monitor panel
  buildMonKeys() {
    const k = $('#monKeys'); k.innerHTML = ''; const p = this.p;
    const B = (label, cls, fn, title) => { const b = el('button', { class: cls || '', text: label, title: title || '', onclick: () => { Snd.ui('tick'); fn(b); } }); k.append(b); return b; };
    B('NIBP', '', () => this.machineRun('monBp', 30));
    B('12-LEAD', '', () => this.choose('twelveLead', {}, 'me'));
    B('ENERGY −', '', () => { const E = [50, 70, 100, 120, 150, 200, 300, 360], i = E.indexOf(p.defib.energy); act(p, 'energy', { j: E[Math.max(0, i - 1)] }); });
    B('ENERGY +', '', () => { const E = [50, 70, 100, 120, 150, 200, 300, 360], i = E.indexOf(p.defib.energy); act(p, 'energy', { j: E[Math.min(E.length - 1, i + 1)] }); });
    this.bSync = B('SYNC', 'tog', () => { act(p, 'sync'); });
    B('CLEAR! [X]', '', () => this.callClear(), 'Tell everyone to take their hands off before a shock');
    B('CHARGE', 'chg', () => { const r = act(p, 'charge', {}, this.ctx); if (r.blocked) toast(r.msg, 'bad'); else { Snd.defibCharge(4 / 1); this.log(r.msg); } });
    this.bShock = B('⚡ SHOCK', 'shk', () => this.pressShock());
    B('DISARM', '', () => { act(p, 'disarm'); Snd.defibReady(false); });
    this.bPace = B('PACER', 'tog', () => { const r = act(p, 'pacer', p.defib.mode === 'pacer' ? { off: true } : { rate: 70, ma: 0 }); if (r.blocked) toast(r.msg, 'bad'); });
    B('mA −', '', () => { if (p.defib.mode === 'pacer') act(p, 'pacer', { ma: p.defib.paceMa - 10 }); });
    B('mA +', '', () => { if (p.defib.mode === 'pacer') act(p, 'pacer', { ma: p.defib.paceMa + 10 }); });
  }
  machineRun(id, dur) { if (this.machine.some(m => m.id === id)) return; if (id === 'monBp') { this.p.tx.nibpCycling = 1; Snd.nibp(true); } this.machine.push({ id, t: 0, dur }); }
  callClear() { if (!this.active) return; this.clearT = this.p.t; this.speak('You', 'Clear!'); for (const c of this.crew) if (c.task && ACTIONS[c.task].hold) { c.paused = { id: c.task, args: c.args, until: this.p.t + 9 }; this.crewStop(c); } if (this.crewBystander) { this.crewBystander.paused = this.p.t + 9; this.p.tx.cpr.on = false; this.p.tx.cpr.lastPause = this.p.t; } }
  pressShock() {
    const p = this.p; const need = ACTIONS.shock.needs(p); if (need) { toast(need, 'bad'); return; }
    const touching = [];
    for (const c of this.crew) if (c.task && ACTIONS[c.task].hold) touching.push(c.name);
    if (this.crewBystander && p.tx.cpr.on && p.tx.cpr.by === 'bystander') touching.push(this.crewBystander.name);
    if (this.busy?.hold || this.skill) touching.push('you');
    const r = act(p, 'shock', { touching }, this.ctx);
    Snd.defibReady(false); Snd.shock(); this.jolt = 1; G.grade.uFlash.value = 0.25;
    this.log(r.msg + (r.shockable ? '' : ' (Rhythm before the shock was not shockable.)'), r.shockable ? 'info' : 'bad');
    if (touching.length) {
      for (const c of this.crew) if (touching.includes(c.name)) { this.crewStop(c); c.stunned = p.t + 90; this.speak(c.name, 'AGH! Jesus, Rook! CLEAR means CLEAR!'); }
      if (touching.includes('you')) { this.stopSkill(); this.cancelBusy(); toast('You shocked yourself.', 'bad'); this.stun = 3; }
    }
  }
  show12(pattern, hr) {
    const M2 = this.game.mods.monitor; if (!M2?.print12) return;
    const c = M2.print12(pattern, { hr, interpret: !!this.diff.interpret12, name: `${this.sc.pt.last}, ${this.sc.pt.first}`, age: this.sc.pt.age, sex: this.sc.pt.sex, time: fmtClock(this.p.t) });
    const h = $('#ecgHolder'); h.innerHTML = ''; h.append(c); openModal('ecg12'); this.last12 = c;
  }

  // ---------------------------------------------------------------- drug box
  openDrugs() {
    const p = this.p; openModal('drugs'); const list = $('#drugList'), pane = $('#drugPane'); list.innerHTML = '<div class="cap" style="margin:2px 6px 8px">Drug box</div>';
    const ids = Object.keys(DRUGS).sort((a, b) => DRUGS[a].name.localeCompare(DRUGS[b].name));
    const sel = id => {
      for (const b of list.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.id === id);
      const d = DRUGS[id]; let form = d.forms[0], route = form.routes[0], vol = form.step;
      const draw = () => {
        const per = form.per; const amount = vol * form.conc;
        pane.innerHTML = `<h2 style="font-size:24px">${esc(d.name)}</h2>${d.aka ? `<div class="cap" style="text-transform:none;letter-spacing:.04em">${esc(d.aka)}</div>` : ''}
          <h3>Presentation</h3><div class="amp">${d.forms.map((f, i) => `<button class="chip ${f === form ? 'sel' : ''}" data-f="${i}">${esc(f.label)}<br><small style="font-weight:400;opacity:.8">${esc(f.pack)}</small></button>`).join('')}</div>
          <h3>Route</h3><div class="amp">${form.routes.map(r => `<button class="chip ${r === route ? 'sel' : ''}" data-r="${r}">${ROUTE_NAME[r]}</button>`).join('')}</div>
          <h3>${per ? 'How many' : 'Draw up'}</h3>
          <div class="vol num">${per ? vol : fmtVol(vol)}<small>${per ? per + (vol !== 1 ? 's' : '') : 'mL'}</small>${this.diff.showDose ? `<small style="color:var(--amber)">= ${fmtAmt(amount)} ${d.unit}</small>` : ''}</div>
          ${per ? '' : `<div class="syr"><i style="width:${vol / form.max * 100}%"></i><div class="ticks"></div></div>`}
          <input type="range" min="${form.step}" max="${form.max}" step="${form.step}" value="${vol}">
          <div class="row" style="margin-top:16px"><button class="btn pri" id="giveBtn">${route === 'NEB' ? 'Set up nebuliser' : 'Draw up and give'}</button><button class="btn" id="cardBtn">Protocol card</button><span class="cap grow" style="text-align:right;text-transform:none;letter-spacing:.03em">${route === 'IV' || route === 'INF' ? (p.tx.iv.some(i => i.patent) ? 'IV in place' : p.tx.io ? 'via IO' : '<span style="color:var(--red)">no IV access</span>') : ''}</span></div>
          <div id="cardTxt"></div>`;
        pane.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { form = d.forms[+b.dataset.f]; route = form.routes[0]; vol = form.step; draw(); });
        pane.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { route = b.dataset.r; draw(); });
        pane.querySelector('input').oninput = e => { vol = +e.target.value; pane.querySelector('.vol').firstChild.textContent = per ? vol : fmtVol(vol); const i = pane.querySelector('.syr i'); if (i) i.style.width = vol / form.max * 100 + '%'; const s = pane.querySelectorAll('.vol small')[1]; if (s) s.textContent = `= ${fmtAmt(vol * form.conc)} ${d.unit}`; const s0 = pane.querySelector('.vol small'); if (per) s0.textContent = per + (vol !== 1 ? 's' : ''); };
        pane.querySelector('#cardBtn').onclick = () => { pane.querySelector('#cardTxt').innerHTML = `<div class="cardtxt">${esc(d.card)}</div>`; };
        pane.querySelector('#giveBtn').onclick = () => { closeModal('drugs'); this.giveDrug(id, vol * form.conc, route, form, vol); };
      };
      draw();
    };
    for (const id of ids) list.append(el('button', { 'data-id': id, onclick: () => { Snd.ui('tick'); sel(id); } }, DRUGS[id].name, el('small', { text: DRUGS[id].forms.map(f => f.label.replace(DRUGS[id].name + ' ', '')).join(' · ') })));
    pane.innerHTML = '<div class="cap">Pick a drug. Check the strength on the ampoule. The clock is still running.</div>';
  }
  giveDrug(id, amount, route, form, vol) {
    const p = this.p; if (this.skill) return toast('Your hands are busy.', 'bad'); if (this.busy) this.cancelBusy();
    if ((route === 'IV' || route === 'INF') && !p.tx.iv.some(i => i.patent) && !p.tx.io) { toast('No IV or IO access.', 'bad'); return; }
    const dur = route === 'IV' || route === 'IO' ? 18 : route === 'INF' ? 30 : route === 'IM' ? 16 : route === 'NEB' ? 25 : 10;
    this.busy = { id: 'drug', args: { id, amount, route }, t: 0, dur, label: `${DRUGS[id].name} ${form.per ? vol + ' ' + form.per : fmtVol(vol) + ' mL'} ${ROUTE_NAME[route]}` };
    Snd.packaging();
  }

  // ---------------------------------------------------------------- transport
  sceneButtons() {
    const b = $('#sceneBtns'); b.innerHTML = '';
    if (this.opts.inTransit) { b.append(el('button', { class: 'btn', text: 'Hospital pre-alert', onclick: () => this.alertModal() }), el('button', { class: 'btn pri', text: 'Back to the wheel', onclick: () => { if (this.skill) this.stopSkill(); this.cancelBusy(); this.end({ resume: true }); } })); return; }
    if (this.sc.allowRefusal !== false && this.sc.id === 'hypo') b.append(el('button', { class: 'btn', text: 'Patient refuses transport', onclick: () => this.refusal() }));
    b.append(el('button', { class: 'btn', text: 'Hospital pre-alert', onclick: () => this.alertModal() }));
    b.append(el('button', { class: 'btn pri', text: 'Load and go', onclick: () => this.transportModal() }));
  }
  async alertModal() {
    const html = `<h2>Pre-alert</h2><p style="color:var(--dim)">Who are you calling, and what do you tell them is coming?</p><h3>Hospital</h3><div class="cards" id="aH">${Object.values(HOSPITALS).map(h => `<button class="card" data-h="${h.id}"><b>${h.name}</b><p>${this.game.hospitalInfo(h.id)}</p></button>`).join('')}</div><h3>Alert</h3><div class="amp" id="aK" style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(ALERTS).map(([k, v]) => `<button class="chip" data-k="${k}">${v}</button>`).join('')}</div>`;
    let hsel = null, ksel = null;
    const res = await modal(html, [['x', 'Cancel'], ['ok', 'Call it in', true]], { onBuild: box => { box.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { hsel = b.dataset.h; box.querySelectorAll('[data-h]').forEach(x => x.classList.toggle('sel', x === b)); }); box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { ksel = b.dataset.k; box.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('sel', x === b)); }); } });
    if (res !== 'ok' || !hsel || !ksel) return;
    this.dest = hsel; const r = act(this.p, 'alert', { kind: ksel, hosp: hsel, hospName: HOSPITALS[hsel].name, kindLabel: ALERTS[ksel] }, this.ctx); this.log(r.msg, 'good'); Snd.radioSquelch(true);
    setTimeout(() => this.active && say(HOSPITALS[hsel].name, ksel === 'none' ? 'Copy, Medic 14. See you when you get here.' : `Copy, Medic 14, ${ALERTS[ksel].toLowerCase()}. Team is being activated.`, 'radio'), 1400);
  }
  async transportModal() {
    if (this.packaging) return;
    const html = `<h2>Transport</h2><p style="color:var(--dim)">Moving to the stretcher takes about a minute. Whatever is running keeps running; whatever is not done will have to be done in the back, on the move.</p><div class="cards">${Object.values(HOSPITALS).map(h => `<button class="card ${this.dest === h.id ? 'sel' : ''}" data-h="${h.id}"><b>${h.name}</b><p>${this.game.hospitalInfo(h.id)}</p></button>`).join('')}</div>`;
    let hsel = this.dest || null;
    const res = await modal(html, [['x', 'Stay on scene'], ['ok', 'Load and go', true]], { onBuild: box => box.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { hsel = b.dataset.h; box.querySelectorAll('[data-h]').forEach(x => x.classList.toggle('sel', x === b)); }) });
    if (res !== 'ok' || !hsel) return;
    this.dest = hsel; if (this.skill) this.stopSkill(); this.cancelBusy();
    this.packaging = { t: 0, dur: this.crew.length ? 60 : 110 }; this.p.flags.moved = true; this.p.moving = 0.4; Snd.stretcher('raise');
    this.log('Packaging for transport.', 'info'); if (this.crew.length) this.speak('Dee', 'Stretcher\'s here. On three.');
  }
  async refusal() {
    const p = this.p; if (!(p.brain > 0.88 && p.bgl > 75)) return toast('He is in no state to refuse anything.', 'bad');
    this.end({ dest: null, refused: true });
  }
  end(extra = {}) {
    if (!this.active) return; this.active = false; if (this.skill) this.stopSkill(); this.busy = null; $('#busy').classList.remove('on'); this.closeFly();
    Snd.metronome(false, 110); Snd.alarm('off'); Snd.flatline(false); Snd.stethoscope(false); Snd.defibReady(false);
    const out = Object.assign({ p: this.p, script: this.script, sceneTime: this.p.t, dest: this.dest, partnerTasks: this.crew.map(c => c.task) }, extra);
    this.done?.(out);
  }
  dispose() { this.ready = false; if (this.root) { this.world.scene.remove(this.root); this.human?.dispose?.(); this.partnerMesh?.dispose?.(); this.bystanderMesh?.dispose?.(); this.gear?.dispose?.(); this.root = null; } setStress(0); }

  // ---------------------------------------------------------------- frame
  update(dtReal) {
    if (!this.root || !this.ready) return;        // still building the patient
    const p = this.p, dt = Math.min(dtReal, 0.1);
    if (this.active) {
      if (this.stun > 0) this.stun -= dt;
      p.tick(dt);
      const sdt = dt * SIM_SPEED;
      // your hands
      if (this.busy && !this.busy.hold) { const b = this.busy; b.t += sdt * (this.stun > 0 ? 0 : 1); $('#busy').classList.add('on'); $('#busyTxt').textContent = b.label; $('#busy .ring').style.setProperty('--p', clamp(b.t / b.dur)); if (b.t >= b.dur) { this.busy = null; $('#busy').classList.remove('on'); this.finish(b.id, b.args, 'me'); } }
      else if (this.busy?.hold) { $('#busy').classList.add('on'); $('#busyTxt').textContent = this.busy.label; $('#busy .ring').style.setProperty('--p', 1); } else $('#busy').classList.remove('on');
      this.tickSkill(dt);
      // crew
      for (const c of this.crew) {
        if (c.stunned && p.t < c.stunned) { c.task = null; continue; }
        if (c.paused && p.t >= c.paused.until && !c.task) { const ps = c.paused; c.paused = null; if (p.arrest || ps.id !== 'cpr') this.crewStart(c, ps.id, ps.args); }
        if (c.task && c.dur !== Infinity) { c.t += sdt; if (c.t >= c.dur) { const id = c.task, a = c.args; c.task = null; this.finish(id, a, c.name); } }
        // an EMT stops compressions on a patient who has a pulse back, and starts them (if free) on one who has lost it
        if (c.task === 'cpr' && !p.arrest && p.t - (p.roscAt || 0) > 6) { this.crewStop(c); this.speak(c.name, 'Hold on. I\'ve got a pulse. I\'ve got a pulse!'); }
      }
      if (this.crewBystander) { const b = this.crewBystander; if (b.paused && p.t > b.paused) { b.paused = 0; if (p.arrest && !this.crew.some(c => c.task === 'cpr') && this.skill?.kind !== 'cpr') { p.tx.cpr.on = true; p.tx.cpr.by = 'bystander'; } } if (!p.arrest) { p.tx.cpr.on = false; this.crewBystander = null; } }
      $('#partnerDoing').textContent = this.crew.length ? this.crew.map(c => (this.crew.length > 1 ? c.name + ': ' : '') + (c.stunned && p.t < c.stunned ? 'recovering from the shock' : c.task ? TASK_LABEL(c.task) : 'standing by')).join(' · ').replace(/^./, m => m.toUpperCase()) : 'Down';
      // machines (things that run without hands)
      for (let i = this.machine.length - 1; i >= 0; i--) { const m = this.machine[i]; m.t += sdt; if (m.t >= m.dur) { this.machine.splice(i, 1); if (m.id === 'monBp') { p.tx.nibpCycling = 0; } this.finish(m.id, {}, 'me'); } }
      if (p.tx.o2?.until && p.t > p.tx.o2.until) p.tx.o2 = null;
      if (this.backupDue && p.t >= this.backupDue) { this.backupDue = Infinity; this.crew.push({ name: 'Alvarez', role: 'Firefighter', task: null, t: 0 }); this.speak('Alvarez', 'Engine 4. Where do you want me?'); this.log('Engine 4 on scene: one firefighter to help.', 'good'); Snd.doorSlam(); }
      // packaging -> leave
      if (this.packaging) { this.packaging.t += sdt; $('#busy').classList.add('on'); $('#busyTxt').textContent = 'Moving to the stretcher'; $('#busy .ring').style.setProperty('--p', clamp(this.packaging.t / this.packaging.dur)); if (this.packaging.t >= this.packaging.dur) { this.packaging = null; p.moving = 0; return this.end(); } }
      this.events(); this.prompts(dt);
      $('#sceneClock').textContent = fmtClock(p.t);
      if (p.dead) return this.end({ dead: true });
    }
    this.visuals(dt); this.monitor(dt); this.placeCam(dt);
    if (this.proc) this.procUpdate?.(dt);
    this.world.update?.(dt, G.time);
  }

  events() {
    const p = this.p; const dee = this.crew[0], hint = this.diff.hints;
    for (const e of p.events.splice(0)) {
      switch (e.type) {
        case 'arrest': Snd.music('critical'); if (dee && (hint || Math.random() < 0.5)) this.speak('Dee', SHOCKABLE[e.rhythm] ? 'He\'s gone. No pulse. That\'s V-fib!'.replace('He', this.sc.pt.sex === 'f' ? 'She' : 'He') : 'I\'ve lost the pulse. Rook, no pulse!'); this.log('Change in the patient.', 'bad'); break;
        case 'rosc': Snd.music('tension'); this.log('Signs of life.', 'good'); break;
        case 'vomit': Snd.vomit(); this.log('The patient vomits.', 'bad'); if (dee && hint) this.speak('Dee', 'Suction! Turn the head!'); break;
        case 'aspiration': this.log('Vomit in an unprotected airway.', 'bad'); break;
        case 'seizureStart': this.log(e.again ? 'Seizing again.' : 'Generalised seizure.', 'bad'); if (dee && e.again && hint) this.speak('Dee', 'She\'s going again. Why is she going again?'); break;
        case 'seizureStop': this.log('The convulsion stops.', 'good'); break;
        case 'rebleed': this.log(`Fresh bleeding from the ${e.site}.`, 'bad'); if (dee) this.speak('Dee', 'It\'s bleeding again. You pumped the pressure up and blew the clot off.'); break;
        case 'charged': Snd.defibReady(true); break;
        case 'bagEmpty': this.log('The fluid bag is empty.'); break;
        case 'decompFailed': this.log('The decompression cannula has stopped working.', 'bad'); if (dee && hint) this.speak('Dee', 'That cannula\'s kinked. It\'s building again.'); break;
        case 'withdrawal': Snd.groan(1, this.sc.pt.sex === 'f'); break;
        case 'fbaoCleared': this.log('Airway cleared.', 'good'); break;
        case 'adenosine': this.log('The monitor goes flat for a few long seconds.', 'warn'); break;
      }
    }
  }
  prompts(dt) {
    const p = this.p, sc = this.sc;
    this.promptT = (this.promptT || 0) + dt; if (this.promptT < 1) return; this.promptT = 0;
    const live = SRC[sc.id];                               // functions were stripped from the cloned script: read them from the source
    if (this.diff.hints && this.crew.length) for (let i = 0; i < (sc.hints || []).length; i++) { if (this.hintsSaid.has(i)) continue; let ok = false; try { ok = sc.hints[i].when(p, this); } catch { } if (ok) { this.hintsSaid.add(i); this.speak('Dee', sc.hints[i].say); this.lastHint = p.t; break; } }
    for (const [key, set] of [['after', this.afterSaid], ['lines', this.linesSaid]]) { const arr = sc.script?.[key] || []; for (let i = 0; i < arr.length; i++) { if (set.has(i)) continue; let ok = false; try { ok = arr[i].when(p, this); } catch { } if (ok) { set.add(i); this.speak(arr[i].who, arr[i].say); break; } } }
    // partner reads the room on her own
    if (this.crew.length && p.arrest && !p.tx.cpr.on && !this.crew[0].task && p.t - p.tArrest > (this.diff.hints ? 6 : 14) && !(this.crew[0].stunned > p.t) && this.clearT < p.t - 10) { this.crewStart(this.crew[0], 'cpr', {}); }
    setStress(p.arrest ? 0.35 : clamp((0.9 - p.sao2) * 1.2 + (70 - p.sys) / 200));
  }

  visuals(dt) {
    const p = this.p, h = this.human, t = G.time;
    // breathing: spontaneous or delivered
    let v = 0;
    if (p.tx.vent.on && p.tx.vent.by === 'me' && this.skill?.kind === 'bvm') v = this.bagV || 0;
    else if (p.tx.vent.on && p.tx.vent.rate > 0) { this.breath += dt * p.tx.vent.rate / 60; const ph = this.breath % 1; v = ph < 0.25 ? Math.sin(ph / 0.25 * Math.PI / 2) : Math.max(0, 1 - (ph - 0.25) / 0.3); if (ph < dt * p.tx.vent.rate / 60) Snd.bvm(); }
    else if (p.rr > 0.5) { const was = this.breath % 1; this.breath += dt * p.rr / 60; const ph = this.breath % 1; v = ph < 0.4 ? Math.sin(ph / 0.4 * Math.PI / 2) ** 2 : Math.max(0, 1 - (ph - 0.4) / 0.45) ** 1.5; v *= clamp(0.35 + p.tvC * 0.65) * (p.agonal ? 1.4 : 1); if (this.stethOn > 0) { if (ph < was) this.breathSnd('in'); else if (was < 0.4 && ph >= 0.4) this.breathSnd('out'); } }
    this.breathV += (v - this.breathV) * Math.min(1, dt * 10);
    h.setBreath?.(this.breathV, clamp(p.lung.L * p.lungC.L + 0.08), clamp(p.lung.R * p.lungC.R + 0.08));
    // compressions
    if (p.tx.cpr.on && p.tx.cpr.by !== 'me') { const ph = (t * (p.tx.cpr.rate || 110) / 60) % 1; this.compress = ph < 0.45 ? Math.sin(ph / 0.45 * Math.PI) : 0; if (ph < dt * 2 && Math.random() < 0.9) Snd.cprThump(0.6); }
    else this.compress = Math.max(0, (this.compress || 0) - dt * 7);
    h.setCompress?.(this.compress * 0.9);
    if (this.partnerMesh && this.crew[0]?.task === 'cpr') this.partnerMesh.group.position.y = this.world.partnerSpot.pos.y - this.compress * 0.035; else if (this.partnerMesh) this.partnerMesh.group.position.y = this.world.partnerSpot.pos.y;
    if (this.jolt > 0) { this.jolt -= dt * 4; h.setCompress?.(-0.5 * Math.max(0, this.jolt)); G.grade.uFlash.value = Math.max(0, G.grade.uFlash.value - dt); }
    // skin and eyes
    const s = Math.min(p.sym, p.symCap), sk = p.fx.skin;
    h.setSkin?.({ pallor: clamp(Math.max(sk.pallor || 0, p.arrest ? 0.9 : (s - 0.4) * 1.3, (1 - p.hb) * 1.6)), cyanosis: clamp((0.9 - p.sao2) * 3.2), flush: clamp(sk.flush || 0), sweat: clamp(Math.max(sk.sweat || 0, (s - 0.55) * 1.6)), mottling: p.arrest ? 0.6 : clamp((p.shockTime - 120) / 300), jaundice: 0 });
    const open = p.arrest ? 0.25 : p.seizing ? 0.8 : clamp((p.brain - 0.3) / 0.4);
    const pup = p.pinpoint ? 1.5 : p.arrest && p.downtime > 120 ? 7 : p.brain < 0.3 && p.sao2 < 0.8 ? 5.5 : 3.5;
    h.setEyes?.(open, pup, pup); h.setMouth?.(p.tx.adjunct ? 0.6 : p.arrest ? 0.35 : p.seizing ? 0.1 : 0.05);
    h.setJVD?.(p.find.jvd ? 1 : 0); h.setTrachea?.(p.find.trachea ? (/left/.test(p.find.trachea) ? 1 : -1) : 0);
    if (p.seizing) { h.group.rotation.z = Math.sin(t * 31) * 0.012; h.group.position.x = this.world.patientSpot.pos.x + Math.sin(t * 27) * 0.006; } else { h.group.rotation.z = 0; }
    // bleeding
    const hm = p.get('hemorrhage');
    if (hm && h.setBleed) for (const f of this.script.findings || []) if (f.woundId != null && f.wound.bleed) { const site = hm.sites.find(x => x.id === f.wound.bleed); if (site) h.setBleed(f.woundId, clamp((site.flow || 0) * 60 / 200)); }
    h.update?.(dt, t);
    // anatomy state for when the body is opened
    if (this.anat) { const tp = p.get('tensionPneumo'), ip = p.cond.filter(c => c.type === 'iatrogenicPneumo'), tm = p.get('tamponade'); const st = { pneumoL: 0, pneumoR: 0, tamponade: tm ? tm.sev : 0, heartRate: p.arrest ? 0 : p.hr, heartStrength: p.arrest ? 0 : clamp(p.sv / p.svRest), fibrillating: !!SHOCKABLE[p.rhythm], lungInflate: this.breathV }; if (tp) st['pneumo' + tp.side] = tp.sev; for (const c of ip) st['pneumo' + c.side] = Math.max(st['pneumo' + c.side], c.sev); this.anat.setState?.(st); this.anat.update?.(dt, t); }
    this.gear.update(dt, p, this.breathV);
  }
  breathSnd(phase) { const p = this.p; const L = breathSoundKind(describeBreathSound(p, 'L')), R = breathSoundKind(describeBreathSound(p, 'R')); Snd.breathSound(L, phase, -0.7); Snd.breathSound(R, phase, 0.7); }

  monitor(dt) {
    const p = this.p, mon = this.game.monitor; const any = p.tx.mon.ecg || p.tx.mon.spo2 || p.tx.mon.cap || p.tx.mon.cuff || p.tx.mon.pads;
    if (any && !this.monOn) { this.monOn = true; $('#monWrap').classList.add('on'); Snd.ui('confirm'); }
    const v = p.vitals();
    this.game.beat.update(dt, v);
    if (this.stethOn > 0) { this.stethOn -= dt; if (this.stethOn <= 0) Snd.stethoscope(false); }
    if (!this.monOn || !mon) return;
    if (this.active || this.proc) mon.update(dt, v);
    const a = mon.alarm || 'none'; if (a !== this.lastAlarm) { this.lastAlarm = a; Snd.alarm(a === 'none' ? 'off' : a); }
    this.bShock?.classList.toggle('armed', p.defib.charged); this.bSync?.classList.toggle('on', p.defib.sync); this.bPace?.classList.toggle('on', p.defib.mode === 'pacer');
  }
  onBeat(b) { const p = this.p; if (!p || !this.root) return; if (this.stethOn > 0 && b.perfused) Snd.heartSound(p.find.heartSounds ? 'muffled' : 'normal'); if (this.monOn && (p.tx.mon.ecg || p.tx.mon.pads || p.tx.mon.spo2) && this.active) Snd.monitorBeep(p.tx.mon.spo2 && p.perf > 0.08 ? p.spo2 : null); }

  // how much of the frame the people standing around take up from where the camera is now (0 = clear)
  crowding() {
    const o = this.orbit, cam = this.cam.position; let pen = 0;
    const dx = cam.x - o.target.x, dz = cam.z - o.target.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    for (const m of [this.partnerMesh, this.bystanderMesh]) { if (!m) continue; const c = m.group.position, px = c.x - o.target.x, pz = c.z - o.target.z, along = px * ux + pz * uz; if (along < 0.3 || along > len - 0.05) continue; const perp = Math.abs(px * uz - pz * ux), depth = Math.max(0.3, len - along), ratio = perp / depth; pen += 1.6 * Math.max(0, 1 - ratio / 0.65); if ((perp - 0.3) / depth < 0.7) pen += 1.3 * Math.max(0, 1 - depth / 1.9); }
    return pen;
  }
  placeCam(dt) {
    const o = this.orbit; if (this.focusTo) { o.target.lerp(this.focusTo, Math.min(1, dt * 6)); if (o.target.distanceTo(this.focusTo) < 0.01) this.focusTo = null; }
    const cp = Math.cos(o.pitch), dir = new THREE.Vector3(Math.sin(o.yaw) * cp, Math.sin(o.pitch), Math.cos(o.yaw) * cp);
    // keep the view clear: pull the camera in front of furniture and of anyone standing between it and the patient
    let dist = o.dist;
    _ray.origin.copy(o.target); _ray.direction.copy(dir);
    for (const b of this.world?.colliders || []) { if (!b.isBox3 || b.containsPoint(o.target)) continue; const hit = _ray.intersectBox(b, _hit); if (hit) dist = Math.min(dist, Math.max(0.55, o.target.distanceTo(hit) - 0.12)); }
    for (const m of [this.partnerMesh, this.bystanderMesh]) { if (!m) continue; const c = m.group.position, r = 0.42, ox = o.target.x - c.x, oz = o.target.z - c.z, a = dir.x * dir.x + dir.z * dir.z, bq = 2 * (ox * dir.x + oz * dir.z), cq = ox * ox + oz * oz - r * r; if (a < 1e-6 || cq < 0) continue; const disc = bq * bq - 4 * a * cq; if (disc <= 0) continue; const t = (-bq - Math.sqrt(disc)) / (2 * a); if (t > 0 && t < dist && o.target.y + dir.y * t < c.y + 1.9) dist = Math.max(0.55, t - 0.1); }
    this.camDist = this.camDist == null || dt === 0 ? dist : (dist < this.camDist ? dist : this.camDist + (dist - this.camDist) * Math.min(1, dt * 4));
    const pos = new THREE.Vector3().copy(o.target).addScaledVector(dir, this.camDist);
    // anyone the camera has backed into is hidden rather than filling the frame
    for (const m of [this.partnerMesh, this.bystanderMesh]) if (m) m.group.visible = Math.hypot(pos.x - m.group.position.x, pos.z - m.group.position.z) > 1.15 || pos.y > m.group.position.y + 2.2;
    const b = this.world?.cameraBounds; if (b) pos.clamp(b.min, b.max);
    pos.y = Math.max(pos.y, (this.world?.patientSpot?.pos.y || 0) + 0.12);
    this.cam.position.copy(pos); this.cam.lookAt(o.target);
  }
}

import { SCENARIOS as SRC } from './scenarios.js';
const _ray = new THREE.Ray(), _hit = new THREE.Vector3();
const ROUTE_NAME = { IV: 'IV push', IO: 'IO', IM: 'IM', IN: 'Intranasal', SL: 'Sublingual', PO: 'By mouth', NEB: 'Nebulised', INF: 'IV over 10 min', BUC: 'Buccal' };
const fmtVol = v => (Math.round(v * 100) / 100).toFixed(v < 1 ? 2 : v < 10 ? 1 : 0);
const fmtAmt = v => (Math.round(v * 1000) / 1000).toString();
const TASK_LABEL = id => ({ cpr: 'Chest compressions', bvm: 'Bagging', headTilt: 'Holding the airway', pressure: 'Direct pressure' }[id] || ACTIONS[id]?.label || id);
function MENU_LABEL(id, args) { for (const k in MENU) for (const it of MENU[k]) if (typeof it !== 'string' && it.id === id && it.label && JSON.stringify(it.args) === JSON.stringify(args)) return it.label; return null; }
