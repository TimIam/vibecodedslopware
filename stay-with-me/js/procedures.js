// Invasive procedures, done by hand. The player steers a real tool through the patient's actual anatomy: the mouse
// chooses the entry point on the skin, W/S/A/D set the angle, holding the mouse button advances the tip, and every
// millimetre is looked up in the anatomical model (anatomy.js `trace`). What the tip passed through on the way is
// reported to actions.js, which decides what a lacerated intercostal artery or a needle in the ventricle costs.
//
// Feedback is what a clinician gets: what the finger feels on the surface, resistance and "pops" on the way in, air
// or blood coming back. The labelled depth gauge is a teaching aid that the harder difficulties take away.
//
// runProcedure(id, args, scene) -> Promise<{ ok, side, hit: [{ name, side }], msg, ... } | { cancelled: true }>

import * as THREE from 'three';
import { G } from './gfx.js';
import { Snd } from './audio.js';
import { $, el, esc, layers, keys, onKey, toast } from './ui.js';
import { clamp } from './physio.js';

const mm = v => Math.round(v * 1000);
const steel = new THREE.MeshStandardMaterial({ color: 0xd5dade, roughness: 0.22, metalness: 1 });
const hubMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });

// Structures that should never be on a tool path. Matched against anatomy segment names.
const DANGER = /artery|vein|neurovascular|nerve|lung|ventricle|atrium|myocard|coronary|aorta|vena cava|pulmonary|brachiocephalic|subclavian|liver|spleen|stomach|bowel|colon|kidney|diaphragm|carotid|jugular|thyroid (isthmus|lobe|gland)|vocal cords|oesophagus|spinal cord|growth plate|phrenic/;

const TOOLS = {
  cannula45: { label: '14G cannula, 45 mm', len: 0.045, r: 0.0011, hub: 0xe2681a, kind: 'needle' },
  cannula83: { label: '14G decompression needle, 83 mm', len: 0.083, r: 0.0011, hub: 0xe2681a, kind: 'needle' },
  spinal: { label: '18G spinal needle, 150 mm, on a syringe', len: 0.15, r: 0.0007, hub: 0xd94f8a, kind: 'needle', syringe: true },
  iv18: { label: '18G cannula (green)', len: 0.045, r: 0.00065, hub: 0x3fa35c, kind: 'needle', gauge: 18 },
  iv16: { label: '16G cannula (grey)', len: 0.045, r: 0.00085, hub: 0x8e9499, kind: 'needle', gauge: 16 },
  iv20: { label: '20G cannula (pink)', len: 0.032, r: 0.00055, hub: 0xe58fb0, kind: 'needle', gauge: 20 },
  io25: { label: 'IO driver, 25 mm needle (blue)', len: 0.025, r: 0.001, hub: 0x2f62b8, kind: 'drill' },
  io45: { label: 'IO driver, 45 mm needle (yellow)', len: 0.045, r: 0.001, hub: 0xe8d24a, kind: 'drill' },
  scalpel: { label: 'No. 10 scalpel', len: 0.03, r: 0.0006, hub: 0x5fa0c8, kind: 'blade' },
  forceps: { label: 'Curved forceps, then finger', len: 0.09, r: 0.004, hub: 0xc9ced2, kind: 'blunt' },
};

// tilt0: starting angle (degrees from perpendicular) toward `axis` (an [from, to] anchor pair giving a body direction).
const PROCS = {
  needleDecomp: {
    title: 'Needle decompression', tools: ['cannula83', 'cannula45'], view: a => 'ics5' + (a.side || 'L'), max: 0.09, axis: ['xiphoid', 'sternalNotch'],
    steps: ['Find the space: 5th intercostal space, anterior axillary line (or the 2nd, mid-clavicular)', 'Go in just over the TOP of the rib below: the artery runs under each rib', 'Advance until air hisses, and stop', 'Enter: slide the catheter off, needle out'],
    needs: s => s.p.exposed?.chest || s.p.exposedAll ? null : 'Expose the chest first.',
    target: /pleural space/, allow: /skin|fat|pector|intercostal m|external intercostal|internal intercostal|innermost|serratus|muscle|pleura$|parietal pleura|pleural space/,
    done(st, s) {
      const side = st.side, tp = s.p.cond.find(c => (c.type === 'tensionPneumo' || c.type === 'iatrogenicPneumo') && c.side === side);
      if (!st.inTarget) return { ok: false, side, msg: st.maxDepth < 0.01 ? 'You did not insert the needle.' : st.blocked ? 'The needle is against bone. It never reached the pleura.' : `The needle went ${mm(st.depth)} mm and never reached the pleural space. Too short for this chest wall, or the wrong path.` };
      const spare = st.tool.len - st.targetAt;
      return { ok: true, side, dur: spare < 0.008 ? 150 : 480 + spare * 4000, depth: st.targetAt, msg: tp ? '' : '' };
    },
  },
  thoracostomy: {
    title: 'Finger thoracostomy', tools: ['scalpel', 'forceps'], view: a => 'ics5' + (a.side || 'L'), max: 0.08, axis: ['xiphoid', 'sternalNotch'], twoStage: true,
    steps: ['5th intercostal space, anterior to the mid-axillary line', 'Scalpel: cut through skin and fat only, on the upper border of the rib (hold the button to cut down, Enter when through the fat)', 'Forceps: push over the top of the rib through the muscle until the pleura pops', 'Enter: sweep a finger inside, feel the lung'],
    needs: s => s.p.exposed?.chest || s.p.exposedAll ? null : 'Expose the chest first.',
    target: /pleural space/, allow: /skin|fat|pector|intercostal m|external intercostal|internal intercostal|innermost|serratus|muscle|pleura$|parietal pleura|pleural space/,
    done(st) { if (!st.inTarget) return { ok: false, side: st.side, msg: st.blocked ? 'You are on bone. You have not entered the chest.' : 'You have not got through into the pleural cavity.' }; return { ok: true, side: st.side }; },
  },
  cric: {
    title: 'Surgical cricothyrotomy', tools: ['scalpel'], view: () => 'neckFront', max: 0.045, axis: ['sternalNotch', 'chin'], twoStage: true,
    steps: ['Feel down the midline: laryngeal prominence, then the soft dip below it. That dip is the membrane.', 'Vertical cut through SKIN AND FAT only, in the midline over the dip (hold to cut down, Enter when through)', 'Turn the blade: stab horizontally through the membrane until it gives into the airway. No deeper.', 'Enter: bougie, tube, cuff up'],
    target: /airway lumen|tracheal lumen|laryngeal lumen|subglottic|trachea$/, allow: /skin|fat|platysma|strap|sternohyoid|muscle|cricothyroid membrane|airway|lumen|trachea$|fascia/,
    done(st) {
      if (!st.inTarget) return { ok: false, msg: st.maxDepth < 0.004 ? 'You never got through the skin.' : st.passed.some(n => /thyroid cartilage/.test(n)) ? 'The blade is in cartilage. You are too high: that is the thyroid cartilage, not the membrane.' : 'You are not in the airway.' };
      const via = st.passed.find(n => /membrane|cricoid|tracheal ring|thyroid cartilage/.test(n)) || '';
      const q = /membrane/.test(via) ? 1 : /cricoid|ring/.test(via) ? 0.75 : 0.6;
      const lateral = Math.abs(st.entry.x) > 0.012 ? 0.8 : 1;
      return { ok: true, quality: q * lateral, via };
    },
  },
  pericardiocentesis: {
    title: 'Pericardiocentesis', tools: ['spinal'], view: () => 'subxiphoid', max: 0.15, axis: ['xiphoid', 'sternalNotch'], tilt0: [48, -10],
    steps: ['Enter just below and to the patient\'s left of the xiphoid', 'Angle 30-45° to the skin, aiming at the left shoulder', 'Advance slowly, aspirating (hold Space). Watch the monitor: ectopics mean you are touching the heart', 'Dark blood that keeps coming: stop there. Enter when done'],
    needs: s => s.p.exposed?.chest || s.p.exposedAll ? null : 'Expose the chest first.',
    target: /pericardial space|pericardial fluid|pericardial effusion/, allow: /skin|fat|rectus|muscle|diaphragm|pericardium|pericardial|linea|fascia|mediastin/, aspirate: true,
    done(st) { if (!st.aspirated && !st.everTarget) return { ok: false, msg: st.maxDepth < 0.02 ? 'You did not advance the needle.' : 'Dry tap: the needle never entered the pericardial space.' }; return { ok: true, ml: st.aspirated }; },
  },
  iv: {
    title: 'Peripheral IV cannulation', tools: ['iv18', 'iv16', 'iv20'], view: a => a.site || 'acfL', max: 0.045, axisFor: a => a.site === 'acfR' ? ['acfR', 'deltoidR'] : ['acfL', 'deltoidL'], tilt0: [62, 0], alongVein: true,
    steps: ['Find the vein in the elbow crease (bluish line; soft and bouncy under the finger)', 'Go in shallow, 15-30° to the skin, along the vein', 'Blood in the chamber: flatten out and advance 3 mm more, staying inside', 'Enter: slide the cannula off the needle'],
    target: /vein/, allow: /skin|fat|fascia|vein/, targetOk: /median cubital|cephalic|basilic|vein/,
    done(st, s, a) {
      if (!st.inTarget) return { ok: false, msg: st.everTarget ? 'You had it, then went straight out through the back wall. The vein has blown: a lump is rising.' : 'No flashback. You are not in a vein.' };
      if (st.inTargetDepth < 0.002) return { ok: false, msg: 'Only the needle tip was in the vein. The cannula would not thread.' };
      return { ok: true, gauge: st.tool.gauge, site: a.site || 'acfL' };
    },
  },
  io: {
    title: 'Intraosseous access', tools: ['io25', 'io45'], view: a => a.site || 'tibiaL', max: 0.05, axisFor: a => a.site === 'tibiaR' ? ['ankleR', 'kneeR'] : ['ankleL', 'kneeL'],
    steps: ['Flat surface of the tibia: two fingers below the kneecap, one finger toward the inside of the leg', 'Perpendicular to the bone. Needle to bone first, then drive', 'Drill until it gives, and stop: that is the marrow', 'Enter: stylet out, aspirate, flush'],
    target: /marrow/, allow: /skin|fat|periost|cortex|tibia|marrow|fascia/, drill: true,
    done(st, s, a) { if (!st.inTarget) return { ok: false, msg: st.passed.some(n => /marrow/.test(n)) ? 'Through the bone and out of the far side. It will not flush; fluid would go into the calf.' : st.blocked || st.passed.some(n => /cortex|tibia/.test(n)) ? 'Still in the cortex: not deep enough to reach marrow.' : 'The needle is in soft tissue, not bone. The needle may be too short, or you are off the bone.' }; return { ok: true, site: a.site || 'tibiaL' }; },
  },
};

export function procNeeds(id, scene) { return PROCS[id]?.needs?.(scene) || null; }

export async function runProcedure(id, args, scene) {
  if (id === 'thoracotomy') return thoracotomy(args, scene);
  const P = PROCS[id]; if (!P) return { ok: true };
  const why = P.needs?.(scene); if (why) { toast(why, 'bad'); return { cancelled: true }; }
  const H = scene.human, A = scene.anat, diff = scene.diff, world = scene.world;
  const TN = Object.fromEntries(Object.entries(scene.game.mods.anatomy.T || {}).map(([k, v]) => [v, k]));
  const cam = new THREE.PerspectiveCamera(32, G.w / G.h, 0.02, 200);
  const toRoot = v => H.group.worldToLocal(v.clone()), toWorld = v => H.group.localToWorld(v.clone());
  const dirWorld = d => d.clone().transformDirection(H.group.matrixWorld);
  const normalAt = p => { const e = 0.002, f = (x, y, z) => H.sdf(new THREE.Vector3(p.x + x, p.y + y, p.z + z)); const n = new THREE.Vector3(f(e, 0, 0) - f(-e, 0, 0), f(0, e, 0) - f(0, -e, 0), f(0, 0, e) - f(0, 0, -e)); return n.lengthSq() > 1e-12 ? n.normalize() : new THREE.Vector3(0, 1, 0); };
  const anchor = H.anchors[P.view(args)] || H.anchors.xiphoid || H.anchors.sternumCPR;
  const axisPair = P.axisFor ? P.axisFor(args) : P.axis;
  let ceph = H.anchors[axisPair[1]] && H.anchors[axisPair[0]] ? H.anchors[axisPair[1]].pos.clone().sub(H.anchors[axisPair[0]].pos).normalize() : new THREE.Vector3(0, 0, -1);
  // IV: the needle is laid along the vein, so take "forward" from the course of the vein under the site
  if (P.alongVein) { try { const n0 = normalAt(anchor.pos), t1 = new THREE.Vector3().crossVectors(n0, ceph).normalize(), t2 = new THREE.Vector3().crossVectors(t1, n0).normalize(), pts = []; for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) { const p = anchor.pos.clone().addScaledVector(t1, i * 0.003).addScaledVector(t2, j * 0.003); p.addScaledVector(normalAt(p), -H.sdf(p)); const seg = (A.trace(p, normalAt(p).multiplyScalar(-1), 0.014, 0.0006) || []).find(s => /vein/.test(s.name || '')); if (seg) pts.push([i, j]); }
      if (pts.length > 6) { let mx = 0, my = 0; for (const q of pts) { mx += q[0]; my += q[1]; } mx /= pts.length; my /= pts.length; let sxx = 0, sxy = 0, syy = 0; for (const q of pts) { const a = q[0] - mx, b = q[1] - my; sxx += a * a; sxy += a * b; syy += b * b; } const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); const dir = t1.clone().multiplyScalar(Math.cos(th)).addScaledVector(t2, Math.sin(th)).normalize(); if (dir.dot(ceph) < 0) dir.negate(); ceph = dir; } } catch (e) { console.warn('vein axis', e); } }

  // ---- state
  const st = { tool: null, toolId: null, entry: null, n: null, dir: null, depth: 0, maxDepth: 0, tilt: [...(P.tilt0 || [0, 0])], passed: [], hits: [], punctures: 0, stage: 0, inTarget: false, everTarget: false, targetAt: 0, inTargetDepth: 0, aspirated: 0, blocked: false, side: 'L', feel: '', cur: null, cutDepth: 0, opening: null };
  let toolMesh = null, done = null, hover = null, orbit = { yaw: 0.5, pitch: 0.65, dist: id === 'iv' ? 0.34 : 0.46 }, xray = 0, lastSeg = '', hissed = false, flashT = 0, drillOn = false;
  const result = new Promise(r => { done = r; });

  // start from the textbook angle for this site when the body model supplies one
  if (P.fromDir && anchor.dir) { const n = anchor.normal, d = anchor.dir.clone().normalize(); let u = ceph.clone().addScaledVector(n, -ceph.dot(n)); if (u.lengthSq() > 1e-6) { u.normalize(); const v = new THREE.Vector3().crossVectors(n, u).normalize(); const a = Math.asin(clamp(d.dot(u), -1, 1)); const b = Math.asin(clamp(d.dot(v) / Math.max(0.2, Math.cos(a)), -1, 1)); st.tilt = [THREE.MathUtils.radToDeg(a) * 0.8, THREE.MathUtils.radToDeg(b) * 0.8]; } }
  function setTool(tid) {
    st.toolId = tid; st.tool = TOOLS[tid]; toolMesh?.removeFromParent();
    const t = st.tool, g = new THREE.Group();
    if (t.kind === 'blade') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.008, 0.03), steel); b.position.z = -0.015; const h = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.009, 0.1), hubMat(t.hub)); h.position.z = -0.08; g.add(b, h); }
    else if (t.kind === 'blunt') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.004, t.len, 10), steel); b.rotation.x = Math.PI / 2; b.position.z = -t.len / 2; const h = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 16), steel); h.position.z = -t.len - 0.012; g.add(b, h); }
    else { const n = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, t.len, 8), steel); n.rotation.x = Math.PI / 2; n.position.z = -t.len / 2; const h = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 3.4, t.r * 2.6, 0.022, 12), hubMat(t.hub)); h.rotation.x = Math.PI / 2; h.position.z = -t.len - 0.011; g.add(n, h); if (t.syringe || t.kind === 'drill') { const s = new THREE.Mesh(new THREE.CylinderGeometry(t.kind === 'drill' ? 0.016 : 0.009, t.kind === 'drill' ? 0.016 : 0.009, t.kind === 'drill' ? 0.11 : 0.085, 14), t.kind === 'drill' ? hubMat(0x23272b) : new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.1 })); s.rotation.x = Math.PI / 2; s.position.z = -t.len - 0.022 - (t.kind === 'drill' ? 0.055 : 0.0425); g.add(s); g.userData.syr = s; } }
    g.traverse(o => { o.castShadow = true; }); toolMesh = g; world.scene.add(g); G.noAO.add(g); drawTools();
  }
  function basis() { // tangent frame at the entry: u = toward the head, v = across
    const n = st.n; let u = ceph.clone().addScaledVector(n, -ceph.dot(n)); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize(); const v = new THREE.Vector3().crossVectors(n, u).normalize(); return { u, v };
  }
  function computeDir() { const { u, v } = basis(); const a = THREE.MathUtils.degToRad(st.tilt[0]), b = THREE.MathUtils.degToRad(st.tilt[1]); st.dir = st.n.clone().multiplyScalar(-Math.cos(a) * Math.cos(b)).addScaledVector(u, Math.sin(a) * Math.cos(b)).addScaledVector(v, Math.sin(b)).normalize(); }
  const tip = () => st.entry.clone().addScaledVector(st.dir, st.depth);

  function surfaceFeel(pRoot) { try { const s = A.surface(pRoot); return s?.feel || ''; } catch { return ''; } }
  function advanceTo(d) {
    d = clamp(d, 0, Math.min(P.max, st.tool.len));
    if (d <= st.depth) { st.depth = d; if (d <= 0.0005 && st.depth === d) { /* fully out */ } refresh(); return; }
    // walk the new stretch of the path and react to each tissue boundary
    let segs = []; try { segs = A.trace(st.entry, st.dir, d + 0.0005, 0.00025) || []; } catch (e) { segs = []; }
    for (const s of segs) {
      if (s.to <= st.depth || s.from > d) continue;
      const name = s.name || TN[s.t] || 'tissue', key = name + (s.side || '');
      if (/bone|rib \d|sternum|clavicle|vertebra|cortex|cartilage|tracheal ring|cricoid/.test(name) && !/marrow|costal cartilage soft/.test(name) && !(P.drill && /cortex|tibia/.test(name)) && !(st.tool.kind === 'blade' && /thyroid cartilage|cricoid|tracheal ring/.test(name) && false)) {
        const hard = /cartilage|ring|cricoid/.test(name) ? (st.tool.kind === 'blade') : false;
        if (!hard && s.from > st.depth - 1e-5) { d = Math.max(st.depth, s.from - 0.0002); st.blocked = name; if (lastSeg !== 'bone' + name) { lastSeg = 'bone' + name; Snd.ui('error'); note(`Hard stop: ${name}.`); } break; }
      }
      if (s.from >= st.depth - 1e-5 && !st.passed.includes(name)) {
        st.passed.push(name); st.blocked = false;
        if (DANGER.test(name) && !(P.target.test(name)) && !(P.allow.test(name))) { st.hits.push({ name, side: s.side || st.side, t: s.t }); onDanger(name); }
        onEnter(name, s);
      }
    }
    st.depth = d; st.maxDepth = Math.max(st.maxDepth, d); refresh();
  }
  function onEnter(name, s) {
    if (/^skin/.test(name)) { if (st.punctures === 0 || st.depth < 0.0005) st.punctures++; if (scene.p.brain > 0.4 && (scene.p.dissoc || 0) < 0.5) Snd.groan(0.5, scene.sc.pt.sex === 'f'); }
    if (s.side === 'L' || s.side === 'R') st.side = s.side;
    if (P.target.test(name)) { st.everTarget = true; st.targetAt = s.from; Snd.needlePop(); if (/pleural/.test(name)) { const side = st.side; const tp = scene.p.cond.find(c => (c.type === 'tensionPneumo') && c.side === side); if (tp && tp.sev > 0.15 && !hissed) { hissed = true; Snd.airHiss(2.5); note('A rush of air.'); } else note('A pop: you are through the pleura.'); } else if (/vein/.test(name)) { flashT = 1.5; note('Flashback: dark blood in the chamber.'); } else if (/marrow/.test(name)) note('It gives: loss of resistance.'); else if (/lumen|trachea|airway/.test(name)) { Snd.airHiss(0.6); note('It gives. Air bubbles through the blood.'); } else if (/pericardial/.test(name)) note('A subtle give.'); }
    else if (/membrane/.test(name)) note('A tough, elastic layer...');
    else if (/muscle|pector|intercostal|serratus|rectus|strap/.test(name)) note('Firmer: muscle.');
    else if (/fat/.test(name)) note('Soft: fat.');
    else if (/cortex|tibia$/.test(name)) note('On bone.');
  }
  function onDanger(name) {
    Snd.ui('bad');
    if (/artery|carotid|aorta/.test(name)) { note('Bright red blood, pulsing.', true); Snd.bloodDrip(); }
    else if (/vein|jugular|vena cava/.test(name)) { note('Dark blood wells up fast.', true); Snd.bloodDrip(); }
    else if (/lung/.test(name)) note('A grating, spongy feel: lung.', true);
    else if (/ventricle|atrium|myocard|coronary/.test(name)) { note('The needle is jumping with each beat.', true); scene.p.touchHeart = scene.p.t + 6; }
    else if (/nerve/.test(name)) note(scene.p.brain > 0.4 ? 'The patient screams: an electric shock down the arm.' : 'A twitch.', true);
    else note(`Something that should not be there: ${name}.`, diff.gauge >= 2);
  }
  const fwdWord = P.alongVein ? 'along the vein' : /tibia|acf/.test(P.view(args)) ? 'up the limb' : 'toward the head';
  function angleText() { const a = Math.round(st.tilt[0]), b = Math.round(st.tilt[1]); if (!a && !b) return 'perpendicular to the skin'; const parts = []; if (a) parts.push(Math.abs(a) + '° ' + (a > 0 ? fwdWord : 'away, ' + fwdWord.replace('toward', 'from'))); if (b) parts.push(Math.abs(b) + '° toward the patient\'s ' + (b > 0 ? 'right' : 'left')); return parts.join(', '); }
  let noteT = 0; function note(text, bad) { $('#feel').innerHTML = `<b>${bad ? '⚠ ' : ''}</b>${esc(text)}`; $('#feel').style.borderColor = bad ? 'var(--red)' : ''; noteT = 3; }

  function refresh() {
    if (!st.entry) return;
    const t = tip(); let cur = null; try { cur = A.sample(t); } catch { }
    const name = cur ? (cur.name || TN[cur.t] || '') : ''; st.cur = name;
    const was = st.inTarget; st.inTarget = !!name && P.target.test(name) && st.depth > 0.0005;
    if (st.inTarget && !was) st.targetEnter = st.depth; if (st.inTarget) st.inTargetDepth = st.depth - (st.targetEnter ?? st.depth);
    if (was && !st.inTarget && st.depth > (st.targetEnter ?? 0)) { if (/vein/.test(P.target.source)) note('Resistance again: you have gone through the back wall.', true); }
    if (/ventricle|atrium|myocard/.test(name)) scene.p.touchHeart = scene.p.t + 4;
  }

  scene.procDebug = { st, advanceTo, computeDir, P, get ceph() { return ceph; }, normalAt, nextStage: () => nextStage(), tip };
  // ---- UI
  layers('hudProc');
  $('#procInfo').innerHTML = `<h4>${P.title}</h4><ol>${P.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('#procKeys').innerHTML = `<kbd>Mouse</kbd> place &nbsp; <kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd> angle &nbsp; hold <kbd>LMB</kbd> advance (<kbd>Shift</kbd> slow) &nbsp; hold <kbd>RMB</kbd> withdraw &nbsp; <kbd>F</kbd> palpate ${P.aspirate ? '&nbsp; <kbd>Space</kbd> aspirate' : ''} ${diff.xray ? '&nbsp; <kbd>X</kbd> anatomy overlay' : ''} &nbsp; <kbd>Enter</kbd> ${P.twoStage ? 'next / finish' : 'finish'} &nbsp; <kbd>Esc</kbd> abandon`;
  $('#gauge').style.display = diff.gauge >= 3 ? 'none' : 'block';
  const btns = $('#procBtns'); btns.innerHTML = ''; btns.append(el('button', { class: 'btn', text: 'Abandon', onclick: () => finish(true) }), el('button', { class: 'btn pri', text: P.twoStage ? 'Next step' : 'Finish', id: 'procNext', onclick: () => nextStage() }));
  function drawTools() { const tb = $('#tools'); tb.innerHTML = ''; if (P.twoStage) { tb.append(el('span', { class: 'chip sel', text: TOOLS[st.toolId].label })); return; } for (const tid of P.tools) tb.append(el('button', { class: 'chip' + (tid === st.toolId ? ' sel' : ''), text: TOOLS[tid].label, onclick: () => { if (st.depth > 0.0005) return toast('Withdraw the needle first.', 'bad'); setTool(tid); } })); }
  setTool(P.tools[0]);
  function markSteps() { const li = $('#procInfo').querySelectorAll('li'); const cur = P.twoStage ? Math.min(li.length - 1, st.stage + 1) : (st.depth > 0.0005 ? (st.inTarget ? 3 : 2) : (st.entry ? 1 : 0)); li.forEach((l, i) => { l.className = i < cur ? 'done' : i === cur ? 'cur' : ''; }); }

  function gauge() {
    if (diff.gauge >= 3) return; const cv = $('#gauge canvas'), c = cv.getContext('2d'), W = cv.width, Hh = cv.height; c.clearRect(0, 0, W, Hh);
    const max = Math.min(P.max, st.tool.len), y = d => 20 + (Hh - 40) * d / max;
    c.fillStyle = '#0c1014'; c.fillRect(60, 20, 90, Hh - 40);
    if (st.entry && st.dir) {
      let segs = []; try { segs = A.trace(st.entry, st.dir, max, 0.0005) || []; } catch { }
      for (const s of segs) { const shown = diff.gauge === 0 || s.from < st.maxDepth; if (!shown) continue; const to = diff.gauge === 0 ? s.to : Math.min(s.to, st.maxDepth); if (to <= s.from) continue; const name = s.name || TN[s.t] || ''; c.fillStyle = tissueColor(name, TN[s.t]); c.fillRect(60, y(s.from), 90, Math.max(1, y(to) - y(s.from))); if (diff.gauge === 0 && y(to) - y(s.from) > 22) { c.fillStyle = 'rgba(0,0,0,.75)'; c.font = '600 17px Segoe UI'; c.fillText(short(name), 64, (y(s.from) + y(to)) / 2 + 6, 84); } }
    }
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.fillStyle = '#9aa7b3'; c.font = '17px Consolas'; c.lineWidth = 1;
    for (let d = 0; d <= max + 1e-6; d += 0.005) { const yy = y(d), big = Math.round(d * 1000) % 10 === 0; c.beginPath(); c.moveTo(big ? 44 : 52, yy); c.lineTo(60, yy); c.stroke(); if (big) c.fillText(String(mm(d)), 6, yy + 6); }
    c.fillStyle = '#fff'; c.fillRect(150, y(st.depth) - 2, 100, 4); c.fillStyle = '#e8edf1'; c.fillRect(196, 20, 8, y(st.depth) - 20); c.font = '600 22px Consolas'; c.fillStyle = '#fff'; c.fillText(mm(st.depth) + ' mm', 160, Math.min(Hh - 8, y(st.depth) + 30));
  }

  // ---- input
  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(); let lmb = false, rmb = false, mmb = false;
  const cv = G.canvas;
  let mouseMoved = false, camInit = false;
  const onMove = e => { mouseMoved = true; const r = cv.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); if (mmb) { orbit.yaw -= e.movementX * 0.006; orbit.pitch = clamp(orbit.pitch + e.movementY * 0.005, 0.1, 1.45); } };
  const onDown = e => { if (e.button === 0) lmb = true; else if (e.button === 2) rmb = true; else if (e.button === 1) { mmb = true; e.preventDefault(); } };
  const onUp = e => { if (e.button === 0) lmb = false; else if (e.button === 2) rmb = false; else mmb = false; };
  const onWheel = e => { e.preventDefault(); if (e.ctrlKey || !st.entry || st.depth < 0.0005 && false) return; if (keys.has('AltLeft')) { orbit.dist = clamp(orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9), 0.18, 1.2); return; } if (st.entry && (st.depth > 0 || e.deltaY < 0)) advanceTo(st.depth + (e.deltaY < 0 ? 0.001 : -0.001)); };
  cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); cv.addEventListener('wheel', onWheel, { passive: false });
  const offKey = onKey(code => {
    if (code === 'Escape') { finish(true); return true; }
    if (code === 'Enter' || code === 'NumpadEnter') { nextStage(); return true; }
    if (code === 'KeyF' && hover && st.depth < 0.0005) { const f = surfaceFeel(hover.p); note(f ? `Under your finger: ${f}.` : 'Soft tissue.'); Snd.ui('tick'); return true; }
    if (code === 'KeyX' && diff.xray) { xray = xray ? 0 : 0.6; A.setXray?.(xray); A.show?.({ skeleton: !!xray, organs: !!xray, vessels: !!xray, airway: !!xray }); return true; }
    if (code === 'KeyQ') { orbit.yaw += 0.35; return true; } if (code === 'KeyE') { orbit.yaw -= 0.35; return true; }
    return true;
  });

  function nextStage() {
    if (P.twoStage && st.stage === 0) {
      if (st.depth < 0.0015) return toast('You have not cut through the skin yet.', 'bad');
      // record the skin incision as an opening; the second tool goes through its centre
      st.cutDepth = st.depth; const { u, v } = basis(); const along = id === 'cric' ? u : v; const half = id === 'cric' ? 0.016 : 0.02;
      const a = st.entry.clone().addScaledVector(along, -half), b = st.entry.clone().addScaledVector(along, half);
      // everything the blade edge crossed along the cut, at the depth reached
      for (let i = -2; i <= 2; i++) { const o = st.entry.clone().addScaledVector(along, half * i / 2); let segs = []; try { segs = A.trace(o, st.dir, st.cutDepth, 0.0004) || []; } catch { } for (const s of segs) { const name = s.name || TN[s.t] || ''; if (DANGER.test(name) && !st.hits.some(h => h.name === name)) { st.hits.push({ name, side: s.side || st.side, t: s.t }); onDanger(name); } if (i !== 0 && !st.passed.includes(name)) st.passed.push(name); } }
      try { st.opening = A.openings?.add({ a, b, gape: id === 'cric' ? 0.012 : 0.018, depth: st.cutDepth }); } catch { }
      Snd.scalpel(); st.stage = 1; st.depth = 0; st.maxDepth = 0; st.blocked = false; st.cutPassed = st.passed; st.passed = []; setTool(P.tools[1] || P.tools[0]); st.tilt = [0, 0]; computeDir();
      if (id === 'cric') note('Skin and fat open. Now find the membrane with your fingertip in the wound, and stab through it.'); else note('Skin open. Forceps over the top of the rib.');
      $('#procNext').textContent = 'Finish'; return;
    }
    finish(false);
  }
  st.side = anchor.pos.x >= 0 ? 'L' : 'R';
  function finish(cancel) {
    cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerdown', onDown); window.removeEventListener('pointerup', onUp); cv.removeEventListener('wheel', onWheel); offKey();
    toolMesh?.removeFromParent(); G.noAO.delete(toolMesh); scene.procUpdate = null; A.setXray?.(0); A.show?.({ skeleton: false, organs: false, vessels: false, airway: false, muscles: false });
    Snd.drill?.(0);
    if (cancel && st.maxDepth < 0.001 && st.stage === 0) return done({ cancelled: true });
    let r = cancel ? { ok: false, msg: 'You withdrew and abandoned the attempt.' } : P.done(st, scene, args);
    r = Object.assign({ side: st.side, hit: st.hits, punctures: st.punctures }, r);
    if (!r.ok && st.opening != null && id !== 'cric') { /* the wound stays */ }
    done(r);
  }

  // ---- per-frame
  scene.procUpdate = dt => {
    // camera
    const target = toWorld(anchor.pos); const nW = dirWorld(anchor.normal);
    const side = new THREE.Vector3().crossVectors(nW, new THREE.Vector3(0, 1, 0)); if (side.lengthSq() < 0.01) side.set(1, 0, 0); side.normalize(); const up2 = new THREE.Vector3().crossVectors(side, nW).normalize();
    const cp = Math.cos(orbit.pitch), camPos = target.clone().addScaledVector(nW, Math.sin(orbit.pitch) * orbit.dist).addScaledVector(side, Math.sin(orbit.yaw) * cp * orbit.dist).addScaledVector(up2, Math.cos(orbit.yaw) * cp * orbit.dist);
    if (world.cameraBounds) camPos.clamp(world.cameraBounds.min, world.cameraBounds.max);
    cam.position.lerp(camPos, camInit ? Math.min(1, dt * 6) : 1); camInit = true; cam.lookAt(target); cam.aspect = G.w / G.h; cam.updateProjectionMatrix();
    G.view(world.scene, cam);
    // where the mouse is on the skin
    if (st.depth < 0.0005 && mouseMoved) {
      ray.setFromCamera(mouse, cam); const hits = ray.intersectObject(H.skinMesh || H.group, true);
      const hit = hits.find(h => !h.object.userData.gear);
      if (hit && toRoot(hit.point).distanceTo(anchor.pos) < 0.18) { const pR = toRoot(hit.point); const n = normalAt(pR); hover = { p: pR, n }; if (st.stage === 0 || !st.entry) { st.entry = pR; st.n = n; st.side = pR.x >= 0 ? 'L' : 'R'; } else { // second stage: stay within the incision
          const d = pR.clone().sub(st.entry0 || st.entry); if (!st.entry0) st.entry0 = st.entry.clone(); if (d.length() < 0.02) { st.entry = pR; st.n = n; } }
        if (diff.gauge === 0 && !noteT) { const f = surfaceFeel(pR); if (f) $('#feel').innerHTML = `Under your finger: <b>${esc(f)}</b>`; }
      }
    }
    if (!st.entry) { st.entry = anchor.pos.clone(); st.n = anchor.normal.clone(); }
    // angle
    const rate = 40 * dt; if (keys.has('KeyW')) st.tilt[0] = clamp(st.tilt[0] + rate, -80, 80); if (keys.has('KeyS')) st.tilt[0] = clamp(st.tilt[0] - rate, -80, 80); if (keys.has('KeyD')) st.tilt[1] = clamp(st.tilt[1] - rate, -80, 80); if (keys.has('KeyA')) st.tilt[1] = clamp(st.tilt[1] + rate, -80, 80);
    const before = st.dir?.clone(); computeDir();
    if (st.depth > 0.004 && before && before.angleTo(st.dir) > 0.0005 && !st.levered) { /* levering a needle inside tissue tears it */ st.lever = (st.lever || 0) + before.angleTo(st.dir); if (st.lever > 0.35 && st.depth > 0.012) { st.levered = true; note('You are levering the needle inside the tissue: it tears as it swings.', true); for (const n of st.passed) if (/lung|vein|artery/.test(n) && !st.hits.some(h => h.name === n) && !P.target.test(n)) st.hits.push({ name: n, side: st.side }); } }
    // depth
    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight'); const speed = (P.drill ? 0.006 : st.tool.kind === 'blade' ? 0.004 : 0.012) * (slow ? 0.3 : 1);
    if (lmb) { advanceTo(st.depth + speed * dt); if (P.drill && !drillOn) { drillOn = true; Snd.drill?.(30); } } else if (drillOn) { drillOn = false; Snd.drill?.(0); }
    if (rmb) advanceTo(st.depth - 0.02 * dt);
    if (P.aspirate && keys.has('Space')) {
      const tm = scene.p.get('tamponade');
      if (st.inTarget && tm) { const got = tm.aspirate(scene.p, 22 * dt); st.aspirated += got; if (toolMesh.userData.syr) toolMesh.userData.syr.material.color.set(0x5a0e0e); if (got > 0.01) { if (!st.aspNote) { st.aspNote = true; note('Dark blood fills the syringe and does not clot.'); } } else if (!st.clotNote && st.aspirated > 5) { st.clotNote = true; note('Nothing more comes: the rest is clot.'); } }
      else if (/ventricle|atrium/.test(st.cur || '')) { if (!st.vNote) { st.vNote = true; note('Bright blood, pulsing into the syringe with each beat.', true); } }
    }
    // tool pose
    const tW = toWorld(tip()), dW = dirWorld(st.dir); toolMesh.position.copy(tW); toolMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dW);
    if (st.tool.kind === 'blade' && st.stage === 1 && id === 'cric') toolMesh.rotateZ(Math.PI / 2);
    if (noteT > 0) { noteT -= dt; if (noteT <= 0) { noteT = 0; $('#feel').style.borderColor = ''; $('#feel').innerHTML = st.depth > 0.0005 ? `Depth <b>${diff.gauge >= 2 ? '?' : mm(st.depth) + ' mm'}</b> &nbsp; angle <b>${Math.round(Math.hypot(st.tilt[0], st.tilt[1]))}°</b> off perpendicular` : `Place the tip. <b>F</b> to feel what is under your finger. &nbsp; Angle: <b>${angleText()}</b>`; } }
    else if (st.depth > 0.0005) $('#feel').innerHTML = `Depth <b>${diff.gauge >= 2 ? '?' : mm(st.depth) + ' mm'}</b> &nbsp; <b>${angleText()}</b>${st.blocked ? ' &nbsp; <b>on bone</b>' : ''}`;
    else if (!noteT) $('#feel').innerHTML = `Place the tip. <b>F</b> to feel what is under your finger. &nbsp; Angle: <b>${angleText()}</b>`;
    if (flashT > 0) flashT -= dt;
    markSteps(); gauge();
  };
  note(P.steps[0]);
  return result;
}

function tissueColor(name, key = '') {
  const n = name + ' ' + key;
  if (/skin|SKIN/.test(n)) return '#e2b49a'; if (/fat|FAT/.test(n)) return '#e9cf6a'; if (/artery|aorta|carotid|ARTERY/.test(n)) return '#ff3b30'; if (/vein|vena|jugular|VEIN/.test(n)) return '#3f6fd0'; if (/nerve|NERVE|neurovascular/.test(n)) return '#f4efc2';
  if (/pleural space|PLEURAL/.test(n)) return '#1c2c3a'; if (/lung|LUNG/.test(n)) return '#d98fa0'; if (/pericardial/.test(n)) return '#5a1a1a'; if (/ventricle|atrium|myocard|HEART|MYOCARD/.test(n)) return '#9c1f1f';
  if (/marrow|MARROW/.test(n)) return '#b5524a'; if (/rib|bone|sternum|clavicle|vertebra|cortex|tibia|BONE/.test(n)) return '#efe7d2'; if (/cartilage|ring|cricoid|CARTILAGE/.test(n)) return '#cfe0e6'; if (/membrane|MEMBRANE/.test(n)) return '#d8b98a';
  if (/lumen|trachea|airway|AIRWAY/.test(n)) return '#10161b'; if (/liver|LIVER/.test(n)) return '#6e2a1c'; if (/spleen/.test(n)) return '#5a2440'; if (/thyroid/.test(n)) return '#b06a5a'; if (/oesophagus/.test(n)) return '#c98a7a';
  if (/muscle|pector|intercostal|serratus|rectus|strap|MUSCLE|diaphragm/.test(n)) return '#a8453a'; return '#7a6a66';
}
const short = n => n.replace('subcutaneous ', '').replace('intercostal', 'i.c.').replace('pectoralis', 'pec.').replace('cricothyroid membrane', 'CT membrane');

// ---------------------------------------------------------------- resuscitative (clamshell) thoracotomy
// A guided sequence rather than a free tool: each step is one decision that can go wrong.
async function thoracotomy(args, scene) {
  const p = scene.p, A = scene.anat, H = scene.human;
  if (!(p.exposed?.chest || p.exposedAll)) { toast('Expose the chest first.', 'bad'); return { cancelled: true }; }
  layers('hudProc'); $('#gauge').style.display = 'none'; $('#tools').innerHTML = ''; $('#procKeys').innerHTML = 'Each step: choose. The clock is running and nobody is doing compressions.';
  const cam = new THREE.PerspectiveCamera(36, G.w / G.h, 0.03, 200); const chest = H.group.localToWorld(H.anchors.sternumCPR.pos.clone()); const n = H.anchors.sternumCPR.normal.clone().transformDirection(H.group.matrixWorld);
  let camDist = 0.95; scene.procUpdate = () => { cam.position.copy(chest).addScaledVector(n, camDist).add(new THREE.Vector3(0.12, 0.05, 0.3)); cam.lookAt(chest); cam.aspect = G.w / G.h; cam.updateProjectionMatrix(); G.view(scene.world.scene, cam); };
  const hits = []; const out = { ok: true, hit: hits, woundControlled: false, massage: false };
  const ask = (title, text, opts) => new Promise(res => { $('#procInfo').innerHTML = `<h4>${title}</h4><p style="color:#c6d0d9;font-size:13px;line-height:1.55;margin:6px 0 0">${text}</p>`; const b = $('#procBtns'); b.innerHTML = ''; for (const [label, v] of opts) b.append(el('button', { class: 'btn' + (v === opts[0][1] ? '' : ''), text: label, onclick: () => { Snd.ui('click'); res(v); } })); });
  const work = (label, secs) => new Promise(res => { let t = 0; $('#feel').innerHTML = `<b>${label}</b>`; const iv = setInterval(() => { t += 0.1; if (t >= secs) { clearInterval(iv); res(); } }, 100); });
  if (p.tx.cpr.on) { p.tx.cpr.on = false; p.tx.cpr.lastPause = p.t; }
  let a = await ask('Clamshell thoracotomy', 'Bilateral thoracostomies in the 5th intercostal spaces, joined across the sternum. Where do you cut between the ribs?', [['Along the upper border of the 6th rib', 'ok'], ['Along the lower border of the 5th rib', 'under'], ['Abandon', 'x']]);
  if (a === 'x') { scene.procUpdate = null; return { cancelled: true }; }
  if (a === 'under') hits.push({ name: 'intercostal artery', side: 'L' }, { name: 'intercostal artery', side: 'R' });
  Snd.scalpel(); await work('Scalpel through skin and muscle, both sides...', 5);
  a = await ask('The sternum', 'The two incisions meet at the sternum.', [['Trauma shears straight across the sternum', 'ok'], ['Keep cutting sideways toward the spine', 'far']]);
  if (a === 'far') hits.push({ name: 'internal mammary artery' });
  Snd.boneSaw?.(3); await work('Cutting the sternum...', 4);
  try { A?.show?.({ skeleton: true, organs: true, vessels: true, airway: true, muscles: true }); for (let i = 0; i <= 10; i++) { A?.openings?.setThoracotomy(i / 10); await new Promise(r => setTimeout(r, 70)); } } catch { }
  camDist = 0.6;
  const tm = p.get('tamponade');
  a = await ask('The pericardium', `The chest is open. The lungs fall away; the pericardium is ${tm && tm.sev > 0.3 ? 'tense, dark and bulging' : 'not distended'}. The phrenic nerves run down each side of it like white threads. Open it:`, [['Tent it with forceps and cut vertically, down the front, in the midline', 'ok'], ['Cut across it, side to side', 'across'], ['Leave it closed and start massage', 'closed']]);
  if (a === 'across') hits.push({ name: 'phrenic nerve' });
  if (a !== 'closed') {
    Snd.scalpel(); if (tm) { await work('Clot and blood pour out of the pericardium...', 3); }
    a = await ask('The heart', tm ? 'With the clot delivered you can see it: a hole in the front of the right ventricle, welling dark blood with each feeble squeeze. A coronary artery runs a centimetre from it.' : 'The heart is in the bag. No wound on the front of it.', tm ? [['Put a finger on the hole', 'finger'], ['Staple across the hole and the vessel beside it', 'staple'], ['Leave it and massage', 'leave']] : [['Start internal massage', 'leave']]);
    if (a === 'finger') out.woundControlled = true; else if (a === 'staple') { out.woundControlled = true; hits.push({ name: 'left anterior descending artery' }); }
  } else out.closedPericardium = true;
  a = await ask('Massage', 'Two hands, flat, squeezing from the apex toward the base. Not fingertips.', [['Two-handed internal massage', 'ok'], ['Squeeze with the fingertips of one hand', 'tips']]);
  if (a === 'tips') hits.push({ name: 'right ventricle', severity: 0.5 }); out.massage = true;
  scene.procUpdate = null;
  // internal massage is the best CPR there is, if the heart can fill
  if (!out.closedPericardium) { p.tx.cpr.on = true; p.tx.cpr.by = 'internal'; p.tx.cpr.baseQ = 1.25; p.tx.cpr.cycleStart = p.t; p.tx.cpr.fatigue = 0; }
  return out;
}
