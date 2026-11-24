// Everything the crew can do to a patient: examinations (which return what you would actually see, hear and feel,
// never the diagnosis) and interventions (which change the Patient). Headless: the scene UI, the partner AI and the
// test bot all call act(p, id, args). Each entry:
//   cat    : menu group
//   dur    : sim seconds the doer's hands are busy
//   who    : 'me' (paramedic scope only) | 'any' (the EMT partner can do it too)
//   needs  : (p, args) => reason string if it cannot be done now
//   run    : (p, args) => { msg, tone: 'info' | 'good' | 'bad' | 'warn', ...data }
// Skill-based actions (IV, IO, needle decompression, cricothyrotomy, ...) take their result from the procedure
// minigame in args (e.g. { ok, depthOk, hit: [...] }); bots pass { ok: true }.

import { clamp, SHOCKABLE } from './physio.js';
import { DRUGS, administer } from './meds.js';

const R = (msg, tone = 'info', extra) => Object.assign({ msg, tone }, extra);
const side = s => s === 'L' ? 'left' : 'right';
const round = (v, n = 1) => Math.round(v / n) * n;
const noise = (p, v, pct) => v * (1 + (p.rng() - 0.5) * 2 * pct);

// ---------------------------------------------------------------- what the senses report

export function describeBreathSound(p, S) {
  const f = p.find;
  if (p.arrest && !p.tx.vent.on) return 'absent';
  if (p.mvAlv < 0.4) return 'absent';
  if (f['breath' + S]) return f['breath' + S];
  if (f.breathBoth) return f.breathBoth;
  const lung = p.lung[S] * p.lungC[S];
  if (lung < 0.25) return 'absent'; if (lung < 0.6) return 'diminished';
  if (p.bronchoNow > 0.82) return 'almost silent chest, minimal air movement';
  if (p.bronchoNow > 0.25) return 'widespread expiratory wheeze';
  if (p.aspirated > 0.2 || p.pulmOedema > 0.3) return 'coarse crackles';
  return 'clear, good air entry';
}
// The kind the audio engine plays for a breath-sound description.
export function breathSoundKind(desc) { return /absent/.test(desc) ? 'absent' : /silent|diminished/.test(desc) ? 'diminished' : /wheeze/.test(desc) ? 'wheeze' : /crackle/.test(desc) ? 'crackles' : 'normal'; }

export function airwayNoise(p) {
  const pat = p.airwayPatency();
  if (p.arrest) return p.secretions > 0.3 ? 'fluid in the mouth and throat' : 'no air movement';
  if (pat < 0.05) return p.find.airwayExtra || 'no air movement at all despite effort';
  if (p.secretions > 0.3) return 'gurgling: fluid in the airway';
  if ((p.swollenAirway || 0) > 0.35 || p.airway * p.airwayC < 0.5) return 'high-pitched stridor on every breath' + (p.find.airwayExtra ? '; ' + p.find.airwayExtra : '');
  if (pat < 0.6) return 'snoring: the tongue is falling back';
  if (p.find.airwayExtra) return p.find.airwayExtra;
  return p.canTalk ? 'clear, patient is speaking' : 'clear, air moving quietly';
}

function skinText(p) {
  const s = Math.min(p.sym, p.symCap), bits = [];
  if (p.arrest) return 'grey, mottled, cool';
  if (p.sao2 < 0.8) bits.push('blue-grey, lips cyanosed'); else if (p.sao2 < 0.88) bits.push('dusky, lips bluish');
  else if (p.fx.skin.flush > 0.35) bits.push('flushed'); else if (s > 0.55 && !p.warmShock || p.hb < 0.7) bits.push('pale'); else bits.push('normal colour');
  bits.push(p.temp > 38.3 ? 'hot' : p.warmShock ? 'warm' : (s > 0.55 || p.temp < 35.5) ? 'cool' : 'warm');
  bits.push((p.fx.skin.sweat > 0.4 || (s > 0.65 && !p.warmShock)) ? 'clammy, sweating' : 'dry');
  if (p.find.skinExtra) bits.push(p.find.skinExtra);
  return bits.join(', ');
}

function pupilText(p) {
  if (p.find.pupils) return p.find.pupils;
  if (p.arrest && p.downtime > 180) return 'both 7 mm, fixed and dilated';
  if (p.pinpoint) return 'both pinpoint (1 mm), barely reactive';
  if (p.brain < 0.3 && p.sao2 < 0.8) return 'both 5 mm, sluggish';
  if (p.seizing) return 'both 5 mm, eyes deviated';
  if (p.level('atropine') > 0.3 || p.level('epinephrine') > 0.3) return 'both 6 mm, reactive';
  return 'both 3-4 mm, equal and reactive';
}

export function generalImpression(p, sc) {
  const bits = [];
  if (p.arrest) return 'Motionless. Not breathing' + (p.agonal ? ' normally: occasional gasps' : '') + '. Colour grey.';
  if (p.seizing) return 'Generalised convulsion: rigid, jerking all four limbs, jaw clenched, frothing.';
  const b = p.brain;
  bits.push(b > 0.8 ? 'Awake' : b > 0.5 ? 'Drowsy, eyes opening to voice' : b > 0.25 ? 'Barely responsive' : 'Unresponsive');
  if (p.find.posture) bits.push(p.find.posture);
  const work = p.rr > 26 || p.bronchoNow > 0.4 || p.airwayPatency() < 0.55;
  bits.push(p.rr < 7 ? 'breathing very slowly and shallowly' : work ? 'working hard to breathe' : 'breathing without obvious effort');
  if (p.find.speech) bits.push(p.find.speech);
  bits.push('skin ' + skinText(p).split(',')[0]);
  const h = p.get('hemorrhage');
  if (h && h.extRate > 30 && !p.exposedAll) bits.push(h.extRate > 150 ? 'a spreading pool of blood' : 'blood soaking through the clothing');
  if (p.painFelt > 7) bits.push('in severe pain');
  return bits.join('; ') + '.';
}

// ---------------------------------------------------------------- catalogue

const needsIV = p => (p.tx.iv.some(i => i.patent) || p.tx.io) ? null : 'No IV or IO access.';
const needsPads = p => p.tx.mon.pads ? null : 'Defibrillation pads are not on the chest.';
const notArrest = p => p.arrest ? 'The patient is in cardiac arrest.' : null;

export const ACTIONS = {
  // ======================= primary survey
  look: { cat: 'assess', label: 'General impression', dur: 3, who: 'any', run: (p, a, sc) => R(generalImpression(p, sc)) },
  response: {
    cat: 'assess', label: 'Check response (AVPU)', dur: 5, who: 'any', run(p) {
      p.note('avpu');
      if (p.arrest) return R('No response to voice or to a trapezius squeeze. Not breathing normally.', 'bad');
      if (p.seizing) return R('Actively seizing. No purposeful response.', 'bad');
      const v = p.avpu;
      return R({ A: p.brain > 0.92 ? 'Alert. Knows name, place and day.' : 'Alert but confused: gets the day and place wrong.', V: 'Eyes open to your voice. Mumbles, confused.', P: 'No response to voice. Groans and pulls away from a trapezius squeeze.', U: 'No response to voice or pain.' }[v], v === 'A' ? 'info' : 'warn', { avpu: v });
    },
  },
  airway: { cat: 'assess', label: 'Open and check the airway', dur: 6, who: 'any', run(p) { p.note('airwayCheck'); const t = airwayNoise(p); return R('Airway: ' + t + '.', /clear/.test(t) ? 'info' : 'bad'); } },
  breathing: {
    cat: 'assess', label: 'Look, listen, feel (10 s)', dur: 10, who: 'any', run(p) {
      p.note('breathingCheck');
      if (p.rr < 1) return R(p.tx.vent.on ? 'No spontaneous breaths between ventilations.' : 'Not breathing.', 'bad', { rr: 0 });
      if (p.agonal) return R('Occasional slow gasps: agonal. This is not breathing.', 'bad', { rr: 0 });
      const rr = Math.max(1, Math.round(noise(p, p.rr, 0.06)));
      const depth = p.tvC < 0.6 || p.m.respDep > 0.4 ? 'shallow' : p.rr > 24 ? 'fast' : 'normal depth';
      const extra = [p.find.chestRise, p.find.breathingExtra, p.find.speech].filter(Boolean).join('; ');
      return R(`Breathing ${rr}/min, ${depth}${extra ? '; ' + extra : ', chest rising equally'}.`, rr < 9 || rr > 28 ? 'warn' : 'info', { rr });
    },
  },
  auscultate: {
    cat: 'assess', label: 'Auscultate the chest', dur: 14, who: 'me', run(p) {
      p.note('auscultate'); const L = describeBreathSound(p, 'L'), Rr = describeBreathSound(p, 'R');
      const hs = p.arrest ? 'no heart sounds' : (p.find.heartSounds || 'heart sounds normal');
      return R(`Left lung: ${L}. Right lung: ${Rr}. ${hs[0].toUpperCase() + hs.slice(1)}.`, L === Rr && /clear/.test(L) ? 'info' : 'warn', { L, R: Rr, heart: hs });
    },
  },
  percuss: { cat: 'assess', label: 'Percuss the chest', dur: 8, who: 'me', run(p) { p.note('percuss'); const L = p.find.percussL || 'resonant', Rr = p.find.percussR || 'resonant'; return R(`Percussion: left ${L}, right ${Rr}.`, L !== Rr ? 'warn' : 'info'); } },
  neck: { cat: 'assess', label: 'Look at the neck (trachea, veins)', dur: 6, who: 'me', run(p) { p.note('neck'); const t = p.find.trachea || 'midline', j = p.arrest ? 'flat' : (p.find.jvd || (p.vol / p.volN < 0.8 ? 'flat' : 'not distended')); return R(`Trachea ${t}. Neck veins ${j}.`, p.find.trachea || p.find.jvd ? 'warn' : 'info'); } },
  pulse: {
    cat: 'assess', label: 'Check pulses (radial, carotid)', dur: 10, who: 'any', run(p) {
      p.note('pulseCheck', { cpr: p.tx.cpr.on });
      if (p.tx.cpr.on) return R('You cannot feel for a pulse during compressions. Pause to check.', 'warn');
      if (!p.carotid) return R('No carotid pulse.', 'bad', { carotid: false });
      const rate = round(noise(p, p.hr, 0.05), 2), reg = p.rhythm === 'afib' ? 'irregularly irregular' : p.ecgMods.pvc > 0.12 ? 'regular with dropped beats' : 'regular';
      const vol = p.sys < 90 ? 'weak and thready' : p.sys > 165 ? 'bounding' : 'good volume';
      if (!p.radial) return R(`Carotid pulse present, ${rate}/min, ${vol}. No radial pulse.`, 'bad', { carotid: true, radial: false, rate });
      return R(`Radial pulse ${rate}/min, ${reg}, ${vol}.`, p.sys < 90 || rate > 120 || rate < 50 ? 'warn' : 'info', { carotid: true, radial: true, rate });
    },
  },
  skin: { cat: 'assess', label: 'Skin and capillary refill', dur: 6, who: 'any', run(p) { p.note('skin'); const cr = p.capRefill; return R(`Skin ${skinText(p)}. Capillary refill ${cr >= 5.5 ? 'more than 5' : cr.toFixed(0)} s.`, cr > 2.4 ? 'warn' : 'info'); } },
  pupils: { cat: 'assess', label: 'Pupils (penlight)', dur: 8, who: 'any', run(p) { p.note('pupils'); const t = pupilText(p); return R('Pupils: ' + t + '.', /3-4/.test(t) ? 'info' : 'warn'); } },
  gcs: { cat: 'assess', label: 'Glasgow Coma Scale', dur: 15, who: 'any', run(p) { p.note('gcs'); const g = p.gcs; return R(`GCS ${g.total}: eyes ${g.e}, verbal ${g.v}, motor ${g.m}.`, g.total < 13 ? 'warn' : 'info', { gcs: g.total }); } },
  bgl: {
    cat: 'assess', label: 'Blood glucose (fingerstick)', dur: 20, who: 'any', run(p) {
      const v = Math.round(noise(p, p.bgl, 0.03)); p.bglShown = v; p.note('bgl', { v });
      return R(v < 20 ? 'Glucometer reads LO (below 20 mg/dL).' : v > 500 ? 'Glucometer reads HI.' : `Blood glucose ${v} mg/dL.`, v < 60 || v > 300 ? 'bad' : 'info', { bgl: v });
    },
  },
  temp: { cat: 'assess', label: 'Temperature', dur: 10, who: 'any', run(p) { const v = Math.round(p.temp * 10) / 10; p.tempShown = v; p.note('temp'); return R(`Tympanic temperature ${v.toFixed(1)} °C (${(v * 9 / 5 + 32).toFixed(1)} °F).`, v > 38.3 || v < 35 ? 'warn' : 'info'); } },
  pain: {
    cat: 'assess', label: 'Ask about pain (0-10)', dur: 8, who: 'any', needs: p => p.canTalk ? null : 'The patient cannot answer.', run(p, a, sc) {
      p.note('painScore', { v: p.painFelt }); const v = Math.round(p.painFelt);
      return R(v <= 0 ? '"No pain."' : `"${v} out of 10."` + (sc?.script?.painWords ? ' ' + sc.script.painWords : ''), v >= 7 ? 'warn' : 'info', { pain: v });
    },
  },
  fast: {
    cat: 'assess', label: 'Stroke screen (face, arms, speech)', dur: 30, who: 'any', needs: p => p.arrest ? 'Not now.' : p.brain < 0.3 ? 'The patient cannot follow commands.' : null, run(p) {
      p.note('fast'); const f = p.find.fast;
      if (!f) return R('Face symmetrical. Both arms held up for 10 seconds. Speech clear and appropriate. Stroke screen negative.');
      return R(`Face: ${f.face}. Arms: ${f.arm}. Speech: ${f.speech}. Stroke screen POSITIVE.`, 'bad', { positive: true });
    },
  },
  history: {
    cat: 'assess', label: 'Ask', dur: 8, who: 'any', run(p, a, sc) {
      const h = sc?.script?.history?.[a.q]; p.note('history', { q: a.q });
      if (!h) return R('Nothing useful.');
      if (p.canTalk && h.pt) return R(`${sc.pt.first}: "${h.pt}"`, 'info', { speaker: 'patient' });
      if (h.by && sc.script.bystander) return R(`${sc.script.bystander}: "${h.by}"`, 'info', { speaker: 'bystander' });
      if (!p.canTalk && !h.by) return R(sc?.script?.bystander ? `${sc.script.bystander} does not know.` : 'The patient cannot answer and there is no one else to ask.', 'warn');
      return R('No answer.');
    },
  },
  scene: { cat: 'assess', label: 'Look around the scene', dur: 10, who: 'any', run(p, a, sc) { p.note('sceneLook'); return R(sc?.script?.sceneClues || 'Nothing notable around the patient.'); } },
  expose: {
    cat: 'assess', label: 'Expose (cut clothing)', dur: 15, who: 'any', run(p, a, sc) {
      const part = a.part || 'chest'; p.exposed = p.exposed || {}; p.exposed[part] = true; if (part === 'all') { p.exposedAll = true; p.exposed.chest = p.exposed.legs = true; } p.note('expose', { part });
      const found = (sc?.script?.findings || []).filter(f => (f.on === part || (part === 'all' && f.on !== 'back')) && !f.seen); found.forEach(f => f.seen = true);
      return R(found.length ? found.map(f => f.text).join(' ') : `${part === 'all' ? 'Fully exposed' : part[0].toUpperCase() + part.slice(1) + ' exposed'}: no wounds or deformity seen.`, found.length ? 'bad' : 'info', { found });
    },
  },
  headToToe: {
    cat: 'assess', label: 'Head-to-toe secondary survey', dur: 75, who: 'me', run(p, a, sc) {
      p.note('secondary'); const out = [];
      const fs = (sc?.script?.findings || []).filter(f => f.on !== 'back'); for (const f of fs) { if (!f.seen && (f.hidden !== 'clothes' || p.exposed?.[f.on] || p.exposedAll)) { f.seen = true; out.push(f.text); } }
      const add = (label, t) => { if (t) out.push(`${label}: ${t}.`); };
      add('Abdomen', p.find.abdomen || 'soft, not tender'); add('Pelvis', p.find.pelvis || 'stable'); add('Limbs', p.find.limbs || p.find.legs || 'moving all four, no deformity');
      if (p.find.medAlert) add('Also', p.find.medAlert); if (p.find.smell) add('Smell', p.find.smell);
      const hidden = fs.some(f => !f.seen);
      return R(out.join(' ') + (hidden ? ' (Clothing still covers part of the body.)' : ''), out.length > 3 ? 'warn' : 'info');
    },
  },
  logRoll: {
    cat: 'assess', label: 'Log-roll and check the back', dur: 30, who: 'me', needs: (p, a, sc) => sc?.partnerBusy?.() ? 'You need your partner free to roll the patient.' : null, run(p, a, sc) {
      p.note('logRoll'); p.flags.moved = true;
      const found = (sc?.script?.findings || []).filter(f => f.on === 'back' && !f.seen); found.forEach(f => f.seen = true);
      return R(found.length ? found.map(f => f.text).join(' ') : 'Back and spine: no wounds, no step, no tenderness.', found.length ? 'bad' : 'info', { found });
    },
  },

  // ======================= monitoring
  monSpo2: { cat: 'monitor', label: 'Pulse oximeter', dur: 6, who: 'any', run(p) { p.tx.mon.spo2 = true; p.note('spo2On'); return R('SpO2 probe on a finger.'); } },
  monEcg: { cat: 'monitor', label: 'ECG electrodes (4-lead)', dur: 20, who: 'any', run(p) { p.tx.mon.ecg = true; p.note('ecgOn'); return R('Limb electrodes on. Lead II on screen.'); } },
  monBp: {
    cat: 'monitor', label: 'Blood pressure (cuff)', dur: 30, who: 'any', run(p) {
      p.tx.mon.cuff = true; p.note('bp');
      if (p.tx.cpr.on || p.seizing) { return R('Cuff cycles and fails: too much movement.', 'warn'); }
      if (p.sys < 46) { p.tx.nibp = { sys: 0, dia: 0, t: p.t, fail: true }; return R('Cuff cycles twice and reads nothing.', 'bad'); }
      const s = Math.round(noise(p, p.sys, 0.035)), d = Math.round(noise(p, p.dia, 0.04)); p.tx.nibp = { sys: s, dia: d, t: p.t };
      return R(`Blood pressure ${s}/${d}.`, s < 90 || s > 180 ? 'warn' : 'info', { sys: s, dia: d });
    },
  },
  monCap: { cat: 'monitor', label: 'Capnography', dur: 8, who: 'any', run(p) { p.tx.mon.cap = true; p.note('capOn'); return R(p.tx.vent.on ? 'Capnography in line with the bag.' : 'Nasal capnography cannula on.'); } },
  monPads: { cat: 'monitor', label: 'Defibrillation pads', dur: 14, who: 'any', needs: p => p.exposed?.chest || p.exposedAll ? null : 'Expose the chest first.', run(p) { p.tx.mon.pads = true; p.note('padsOn'); return R('Pads on: right upper chest, left lateral.'); } },
  twelveLead: {
    cat: 'monitor', label: 'Acquire a 12-lead ECG', dur: 45, who: 'me', needs: p => p.arrest ? 'Not in cardiac arrest.' : p.seizing ? 'Patient is seizing.' : (p.exposed?.chest || p.exposedAll ? null : 'Expose the chest first.'), run(p) {
      p.tx.mon.ecg = true; p.note('12lead', { pattern: p.twelve }); return R('12-lead acquired. Read it.', 'info', { pattern: p.rhythm === 'sinus' || p.rhythm === 'chb' || p.rhythm === 'svt' || p.rhythm === 'vt' ? p.twelve : (p.rhythm === 'afib' ? 'afibRVR' : p.twelve), hr: p.hr });
    },
  },

  // ======================= airway
  headTilt: { cat: 'airway', label: 'Head tilt / jaw thrust (hold)', dur: 3, who: 'any', hold: 'manoeuvre', run(p, a) { p.tx.manoeuvre = true; p.note('manoeuvre'); if (p.get('spinal') && !a?.jawThrust) p.flags.neckExtended = true; return R('Airway held open.'); } },
  suction: {
    cat: 'airway', label: 'Suction the mouth', dur: 12, who: 'any', run(p) { const had = p.secretions; p.secretions = Math.max(0, p.secretions - 0.8); p.note('suction'); return R(had > 0.15 ? 'Suctioned: airway cleared of fluid.' : 'Nothing to suction.', had > 0.15 ? 'good' : 'info'); },
  },
  opa: {
    cat: 'airway', label: 'Oropharyngeal airway', dur: 10, who: 'any', needs: notArrestOk, run(p) {
      p.note('opa');
      if (p.find.jaw || p.seizing) return R('The jaw is clenched: you cannot get it between the teeth.', 'bad');
      if ((p.swollenAirway || 0) > 0.55) return R('The tongue is too swollen: it will not pass.', 'bad');
      if (!p.arrest && p.brain > 0.3) { p.vomit('gagged on an oral airway'); p.error('opaGag', 'Oral airway placed in a patient with a gag reflex: vomited.', 1); return R('The patient gags violently and vomits. Removed.', 'bad'); }
      p.tx.adjunct = 'opa'; return R('Oral airway in, tongue held forward.', 'good');
    },
  },
  npa: {
    cat: 'airway', label: 'Nasopharyngeal airway', dur: 12, who: 'any', run(p) {
      p.note('npa'); if (p.get('headInjury')?.sev > 0.5) p.error('npaSkull', 'Nasal airway in a patient with signs of a severe head injury (possible skull-base fracture).', 1);
      if (!p.arrest && p.brain > 0.72) return R('The patient pushes your hand away.', 'warn');
      p.tx.adjunct = 'npa'; return R('Nasal airway in, lubricated, right nostril.', 'good');
    },
  },
  igel: {
    cat: 'airway', label: 'Supraglottic airway (i-gel)', dur: 25, who: 'me', run(p) {
      p.note('igel');
      if (p.find.jaw || p.seizing) return R('Jaw clenched: cannot insert.', 'bad');
      if ((p.swollenAirway || 0) > 0.5) return R('Swelling fills the pharynx: the device will not seat. No ventilation through it.', 'bad');
      if (!p.arrest && p.brain > 0.28) { p.vomit('gagged on a supraglottic airway'); p.error('igelGag', 'Supraglottic airway attempted in a patient with intact airway reflexes: vomited.', 2); return R('The patient gags, retches and vomits. Removed.', 'bad'); }
      p.tx.adjunct = 'igel'; p.tx.manoeuvre = false; return R('i-gel seated, bite block at the teeth. Confirm with capnography.', 'good');
    },
  },
  recovery: { cat: 'airway', label: 'Recovery position', dur: 15, who: 'any', needs: p => p.arrest ? 'Not in cardiac arrest.' : p.tx.cpr.on ? 'CPR in progress.' : null, run(p) { p.tx.pos = 'recovery'; p.flags.moved = true; p.note('recovery'); return R('Rolled into the recovery position.'); } },
  backBlows: { cat: 'airway', label: 'Back blows x5', dur: 10, who: 'any', needs: p => p.conscious ? null : 'The patient is unconscious: start CPR.', run(p) { const c = p.get('choking'); p.note('backBlows'); return c?.attempt(p, 'backBlows') ? R('The fifth blow does it: the obstruction flies out. Coughing, breathing.', 'good') : R('Five firm back blows. Nothing comes out.', 'warn'); } },
  thrusts: { cat: 'airway', label: 'Abdominal thrusts x5', dur: 10, who: 'any', needs: p => p.conscious ? null : 'The patient is unconscious: start CPR.', run(p) { const c = p.get('choking'); p.note('thrusts'); return c?.attempt(p, 'thrusts') ? R('The obstruction is expelled. Coughing, breathing.', 'good') : R('Five abdominal thrusts. Still obstructed.', 'warn'); } },
  magill: {
    cat: 'airway', label: 'Laryngoscope + Magill forceps', dur: 30, who: 'me', needs: p => p.conscious ? 'The patient is awake.' : null, run(p, a) {
      p.note('magill'); const c = p.get('choking');
      if (!c || !c.lodged) return R((p.swollenAirway || 0) > 0.5 ? 'Laryngoscopy: nothing but swollen tissue. You cannot see the cords.' : 'Laryngoscopy: no foreign body seen.', 'info');
      if (c.depth > 0.85) return R('Laryngoscopy: you can see the top of something wedged below the cords. The forceps cannot reach it.', 'bad');
      return c.attempt(p, 'magill', a?.skill ?? 1) ? R(`Under direct vision you grasp it and pull out ${c.item}.`, 'good') : R('You can see it but it slips from the forceps.', 'warn');
    },
  },
  cric: {
    cat: 'airway', label: 'Surgical cricothyrotomy', dur: 5, who: 'me', proc: 'cric', run(p, a = {}) {
      p.note('cric', a);
      if (!a.ok) { for (const h of a.hit || []) applyCollateral(p, h); return R(a.msg || 'The tube is not in the trachea.', 'bad'); }
      p.tx.adjunct = 'cric'; p.cricPatency = a.quality ?? 1; for (const h of a.hit || []) applyCollateral(p, h);
      if (p.airwayPatency() > 0.6 && !p.flags.cricIndicated && (p.airway * p.airwayC) > 0.5) p.error('cricUnneeded', 'Performed a surgical airway on a patient whose airway could be managed without one.', 3);
      return R('Tube through the cricothyroid membrane, cuff up. Ventilate and confirm with capnography.', 'good');
    },
  },

  // ======================= breathing
  o2: {
    cat: 'breathing', label: 'Oxygen', dur: 12, who: 'any', run(p, a) {
      if (a.device === 'off') { p.tx.o2 = null; p.note('o2Off'); return R('Oxygen off.'); }
      p.tx.o2 = { device: a.device, flow: a.flow ?? (a.device === 'nc' ? 3 : 15) }; p.note('o2', a);
      return R(a.device === 'nc' ? `Nasal cannula at ${p.tx.o2.flow} L/min.` : 'Non-rebreather mask at 15 L/min.');
    },
  },
  bvm: {
    cat: 'breathing', label: 'Bag-valve-mask ventilation', dur: 6, who: 'any', hold: 'vent', run(p, a = {}) {
      const v = p.tx.vent;
      if (a.stop) { v.on = false; v.by = null; p.note('bvmStop'); return R('Ventilation stopped.'); }
      v.on = true; v.by = a.by || 'me'; v.rate = a.rate ?? 10; v.tv = a.tv ?? 0.5; v.o2 = a.o2 ?? v.o2; v.seal = a.seal ?? (a.by === 'partner' ? 0.8 : 0.85);
      p.note('bvm', { rate: v.rate, o2: v.o2, by: v.by });
      if (!p.arrest && p.spontMv > 3 && p.rr > 10 && p.sao2 > 0.9) p.note('bvmUnneeded');
      return R(`Bagging at ${v.rate}/min${v.o2 ? ' on 15 L oxygen' : ' on ROOM AIR (oxygen not connected)'}.`, v.o2 ? 'info' : 'warn');
    },
  },
  bvmO2: { cat: 'breathing', label: 'Connect oxygen to the bag', dur: 6, who: 'any', run(p) { p.tx.vent.o2 = true; p.note('bvmO2'); return R('Reservoir connected to oxygen at 15 L/min.', 'good'); } },
  chestSeal: {
    cat: 'breathing', label: 'Chest seal', dur: 15, who: 'any', needs: p => p.exposed?.chest || p.exposedAll ? null : 'Expose the chest first.', run(p, a) {
      p.tx.seal[a.side] = { vented: a.vented !== false, t: p.t }; p.note('chestSeal', a);
      return R(`${a.vented !== false ? 'Vented' : 'Non-vented occlusive'} chest seal over the ${side(a.side)} chest wound.`, 'info');
    },
  },
  needleDecomp: {
    cat: 'breathing', label: 'Needle decompression', dur: 5, who: 'me', proc: 'needleDecomp', run(p, a = {}) {
      const S = a.side; p.note('needleDecomp', a);
      for (const h of a.hit || []) applyCollateral(p, h, S);
      const tp = p.get('tensionPneumo');
      if (!a.ok) return R(a.msg || 'The needle did not reach the pleural space. No rush of air.', 'bad');
      if (!tp || tp.side !== S || tp.sev < 0.15) {
        p.error('decompWrong', `Needle decompression of a chest with no tension pneumothorax (${side(S)} side): you have made a pneumothorax.`, 3);
        if (!tp || tp.side !== S) p.add(condPneumo(S));
        return R('No rush of air. The needle is in the pleural space of a lung that was not collapsed.', 'bad');
      }
      p.tx.decomp[S] = { ok: true, t: p.t, dur: a.dur ?? 420 };
      return R('A hiss of air under pressure escapes through the cannula.', 'good');
    },
  },
  thoracostomy: {
    cat: 'breathing', label: 'Finger thoracostomy', dur: 5, who: 'me', proc: 'thoracostomy', run(p, a = {}) {
      const S = a.side; p.note('thoracostomy', a);
      for (const h of a.hit || []) applyCollateral(p, h, S);
      if (!a.ok) return R(a.msg || 'You have not entered the pleural cavity.', 'bad');
      if (!p.arrest && p.brain > 0.4 && (p.dissoc || 0) < 0.5 && p.m.analgesia < 5) { p.painC = 10; p.error('thoracoAwake', 'Opened the chest of a conscious patient without adequate analgesia or sedation.', 2); }
      p.tx.thoracostomy[S] = { t: p.t };
      const tp = p.get('tensionPneumo'), ht = p.get('haemothorax');
      if (ht && ht.side === S) ht.vol = Math.max(0, ht.vol - 500);
      return R(tp && tp.side === S ? 'Air rushes out past your finger; you feel the lung come up against it.' : ht && ht.side === S ? 'Blood pours out past your finger. Lung palpable.' : 'Pleura opened. No air or blood under pressure; lung is up.', 'good');
    },
  },
  position: {
    cat: 'breathing', label: 'Position', dur: 10, who: 'any', needs: p => p.tx.cpr.on ? 'CPR in progress.' : null, run(p, a) {
      p.tx.pos = a.pos; p.note('position', a); if (a.pos !== 'supine' && a.pos !== 'legsUp') p.flags.moved = true;
      return R({ sitting: 'Sat upright.', semi: 'Semi-recumbent at 45°.', supine: 'Laid flat.', legsUp: 'Laid flat with legs raised.' }[a.pos]);
    },
  },

  // ======================= circulation
  cpr: {
    cat: 'circulation', label: 'Chest compressions', dur: 2, who: 'any', hold: 'cpr', run(p, a = {}) {
      const c = p.tx.cpr;
      if (a.stop) { if (c.on) { c.on = false; c.by = null; c.lastPause = p.t; p.note('cprStop'); } return R('Compressions paused.', 'warn'); }
      if (!p.arrest && p.carotid) { p.error('cprPulse', 'Started chest compressions on a patient with a pulse.', 2); if (p.brain > 0.3) p.painC = 9; }
      if (!c.on) { c.on = true; c.cycleStart = p.t; if (c.lastPause) { const gap = p.t - c.lastPause; c.handsOff += gap; if (gap > 20 && c.total > 30) p.note('longPause', { gap }); } p.note('cprStart', { by: a.by || 'me' }); }
      c.by = a.by || 'me'; if (a.q != null) c.q = a.q; if (a.rate) c.rate = a.rate; if (c.by !== 'me') { c.q = a.q ?? 0.82; c.rate = 110; }
      return R('Compressions started.', 'info');
    },
  },
  energy: { cat: 'defib', label: 'Select energy', dur: 0, who: 'any', run(p, a) { p.defib.energy = a.j; return R(`${a.j} J selected.`); } },
  sync: { cat: 'defib', label: 'SYNC', dur: 0, who: 'me', run(p) { p.defib.sync = !p.defib.sync; return R(p.defib.sync ? 'SYNC on.' : 'SYNC off.'); } },
  charge: { cat: 'defib', label: 'Charge', dur: 0, who: 'any', needs: needsPads, run(p) { const d = p.defib; if (d.charging || d.charged) return R('Already charged.'); d.mode = d.mode === 'pacer' ? 'manual' : (d.mode === 'monitor' ? 'manual' : d.mode); d.charging = true; d.charge = 0; d.msg = `CHARGING ${d.energy}J`; p.note('charge', { j: d.energy, cprOn: p.tx.cpr.on }); return R(`Charging to ${d.energy} J.`); } },
  disarm: { cat: 'defib', label: 'Disarm', dur: 0, who: 'any', run(p) { const d = p.defib; d.charging = d.charged = false; d.charge = 0; d.msg = 'DISARMED'; p.note('disarm'); return R('Energy dumped.'); } },
  shock: {
    cat: 'defib', label: 'SHOCK', dur: 0, who: 'any', needs: p => needsPads(p) || (p.defib.charged ? null : 'Not charged.'), run(p, a = {}) {
      const d = p.defib; d.charged = false; d.charge = 0;
      const touching = a.touching || [];                       // who still has hands on the patient
      if (touching.length) { p.error('shockNotClear', `Shocked while ${touching.join(' and ')} ${touching.length > 1 ? 'were' : 'was'} still touching the patient.`, 3); p.flags.crewShocked = touching; }
      const was = p.rhythm, res = p.shock(d.energy, d.sync); d.sync = false; d.msg = `SHOCK ${d.shocks} DELIVERED`;
      if (p.tx.cpr.on) { p.tx.cpr.on = false; p.tx.cpr.lastPause = p.t; }
      return R(`Shock delivered at ${d.energy} J.`, 'info', { was, res, shockable: !!SHOCKABLE[was] });
    },
  },
  pacer: {
    cat: 'defib', label: 'Pacer', dur: 0, who: 'me', needs: needsPads, run(p, a = {}) {
      const d = p.defib; if (a.off) { d.mode = 'monitor'; d.paceMa = 0; return R('Pacer off.'); }
      d.mode = 'pacer'; if (a.rate) d.paceRate = a.rate; if (a.ma != null) d.paceMa = clamp(a.ma, 0, 200); p.note('pacer', { ma: d.paceMa, rate: d.paceRate });
      return R(`Pacing ${d.paceRate}/min at ${d.paceMa} mA.`);
    },
  },
  pressure: { cat: 'circulation', label: 'Direct pressure', dur: 4, who: 'any', hold: 'pressure', run(p, a) { p.tx.pressureOn = a.site; p.note('pressure', a); return R('Firm direct pressure on the wound.'); } },
  tourniquet: {
    cat: 'circulation', label: 'Tourniquet', dur: 25, who: 'any', run(p, a) {
      const q = a.q ?? 0.95; p.tx.tq[a.limb] = { q, t: p.t, high: a.high !== false }; p.note('tourniquet', a);
      const h = p.get('hemorrhage'), useful = h && h.sites.some(s => s.fix?.tq === a.limb && s.rate > 30);
      if (!useful) p.note('tqUnneeded', a); if (p.brain > 0.4) p.painC = Math.max(p.painC, 7);
      return R(q > 0.85 ? `Tourniquet high and tight on the ${limbName(a.limb)}: windlass locked, distal pulse gone. Time noted.` : `Tourniquet on the ${limbName(a.limb)} but still oozing: not tight enough.`, q > 0.85 ? 'good' : 'warn');
    },
  },
  pack: {
    cat: 'circulation', label: 'Pack the wound (haemostatic gauze)', dur: 90, who: 'any', run(p, a) { p.tx.dressings[a.site] = { kind: 'pack', q: a.q ?? 0.9, t: p.t }; p.note('pack', a); if (p.brain > 0.4) p.painC = 9; return R('Wound packed to the bone with haemostatic gauze, three minutes of pressure held.', 'good'); },
  },
  dressing: { cat: 'circulation', label: 'Pressure dressing', dur: 30, who: 'any', run(p, a) { if (!p.tx.dressings[a.site]) p.tx.dressings[a.site] = { kind: 'pressure', t: p.t }; p.note('dressing', a); return R('Pressure dressing applied.'); } },
  binder: { cat: 'circulation', label: 'Pelvic binder', dur: 40, who: 'any', run(p) { p.tx.binder = true; p.note('binder'); return R('Pelvic binder tightened over the greater trochanters.', 'good'); } },
  splint: { cat: 'circulation', label: 'Splint', dur: 60, who: 'any', run(p, a) { p.tx.splints[a.where] = a.traction ? 'traction' : 'splint'; p.note('splint', a); return R(a.traction ? 'Traction splint applied: leg pulled out to length.' : 'Limb splinted.', 'good'); } },
  collar: { cat: 'circulation', label: 'Cervical collar', dur: 25, who: 'any', run(p) { p.tx.collar = true; p.note('collar'); return R('Cervical collar sized and fitted, head held in line.'); } },
  blanket: { cat: 'circulation', label: 'Blanket / keep warm', dur: 10, who: 'any', run(p) { p.tx.blanket = true; p.note('blanket'); return R('Wrapped in a blanket.'); } },
  iv: {
    cat: 'circulation', label: 'IV cannula', dur: 5, who: 'me', proc: 'iv', run(p, a = {}) {
      p.note('ivAttempt', a); p.ivTries = (p.ivTries || 0) + 1;
      if (!a.ok) { if (p.brain > 0.4) p.painC = Math.max(p.painC, 4); return R(a.msg || 'Missed: the vein has blown.', 'bad'); }
      p.tx.iv.push({ site: a.site || 'acfL', gauge: a.gauge || 18, patent: true, t: p.t }); p.note('iv', a);
      return R(`${a.gauge || 18}G cannula in the ${a.site === 'acfR' ? 'right' : 'left'} antecubital fossa: flashback, flushes easily.`, 'good');
    },
  },
  io: {
    cat: 'circulation', label: 'Intraosseous access (tibia)', dur: 5, who: 'me', proc: 'io', run(p, a = {}) {
      p.note('ioAttempt', a);
      if (!a.ok) return R(a.msg || 'The needle is not in the marrow cavity: it will not flush.', 'bad');
      if (!p.arrest && p.brain > 0.4) { p.painC = 9; p.note('ioAwake'); }
      p.tx.io = { site: a.site || 'tibiaL', t: p.t }; p.note('io', a); return R('Loss of resistance, needle stands firm, marrow aspirated, flushes. IO secured.', 'good');
    },
  },
  fluids: {
    cat: 'circulation', label: 'IV fluid bolus', dur: 20, who: 'me', needs: needsIV, run(p, a) {
      if (a.stop) { p.tx.fluidsRunning = null; p.note('fluidsStop'); return R('Fluids clamped.'); }
      p.tx.fluidsRunning = { left: a.ml, what: 'saline', pressure: !!a.pressure, io: !p.tx.iv.some(i => i.patent) }; p.note('fluids', a);
      return R(`${a.ml} mL of normal saline running${a.pressure ? ' under a pressure bag' : ''}.`);
    },
  },
  pericardiocentesis: {
    cat: 'circulation', label: 'Pericardiocentesis', dur: 5, who: 'me', proc: 'pericardiocentesis', run(p, a = {}) {
      p.note('pericardiocentesis', a); for (const h of a.hit || []) applyCollateral(p, h);
      const t = p.get('tamponade');
      if (!a.ok) return R(a.msg || 'Dry tap.', 'bad');
      if (!t || t.sev < 0.15) { p.error('pericardNoTamponade', 'Put a needle into the pericardium of a patient without tamponade.', 3); return R('Nothing aspirated. Ectopics on the monitor: the needle is touching the heart.', 'bad'); }
      const got = t.aspirate(p, a.ml ?? 40); p.tx.pericardial = true;
      return R(got > 8 ? `${Math.round(got)} mL of dark, non-clotting blood aspirated. The pressure comes up.` : 'Only a few mL: the rest is clot. A needle will not fix this.', got > 8 ? 'good' : 'warn', { got });
    },
  },
  thoracotomy: {
    cat: 'circulation', label: 'Resuscitative thoracotomy', dur: 5, who: 'me', proc: 'thoracotomy', run(p, a = {}) {
      p.note('thoracotomy', a); for (const h of a.hit || []) applyCollateral(p, h);
      if (!p.arrest) { p.error('thoracotomyAlive', 'Opened the chest of a patient who had a pulse.', 3); }
      p.tx.thoracotomy = { t: p.t, woundControlled: !!a.woundControlled, internalMassage: !!a.massage, aortaCompressed: !!a.aorta };
      p.tx.thoracostomy.L = p.tx.thoracostomy.R = { t: p.t };
      return R(a.woundControlled ? 'Pericardium opened, clot delivered, wound controlled.' : 'Chest open.', 'good');
    },
  },
  valsalva: { cat: 'circulation', label: 'Modified Valsalva manoeuvre', dur: 40, who: 'any', needs: p => p.conscious ? null : 'The patient cannot cooperate.', run(p) { p.note('valsalva'); const s = p.get('svt'); return s?.vagal(p, true) ? R('Strain, then legs up... the rhythm breaks. Sinus rhythm.', 'good') : R('Strain, then legs up. No change in the rhythm.', 'info'); } },

  // ======================= drugs
  drug: {
    cat: 'drugs', label: 'Give a drug', dur: 20, who: 'me', run(p, a) {
      const def = DRUGS[a.id];
      if ((def.needsSwallow) && !p.canSwallow && a.id !== 'glucoseGel') { p.error('poUnsafe', `Gave ${def.name} by mouth to a patient who could not swallow safely.`, 2); p.vomit('tablets in an unprotected airway'); }
      if (def.needsConscious && !p.conscious) return R('The patient cannot cooperate with that.', 'warn');
      if (a.route === 'NEB') { p.tx.o2 = { device: 'neb', flow: 8, until: p.t + 320 }; }
      const r = administer(p, a.id, a.amount, a.route);
      return R(r.ok ? r.msg + ' given.' : r.msg, r.ok ? 'info' : 'warn', { given: r.ok });
    },
  },

  // ======================= people
  reassure: { cat: 'talk', label: 'Reassure / explain', dur: 6, who: 'any', needs: p => p.conscious ? null : 'The patient cannot hear you.', run(p) { p.anxiety = Math.max(0.1, p.anxiety - 0.25); p.reassured = (p.reassured || 0) + 1; p.note('reassure'); return R('You tell them who you are, what you are doing and that you are staying with them.', 'good'); } },
  backup: { cat: 'talk', label: 'Request backup', dur: 6, who: 'any', run(p, a) { p.note('backup', a); return R(a.what === 'fire' ? 'Dispatch: "Engine 4 en route to your location for manpower."' : a.what === 'police' ? 'Dispatch: "PD en route."' : 'Dispatch: "Second unit en route, ETA six minutes."'); } },
  alert: { cat: 'talk', label: 'Hospital pre-alert', dur: 15, who: 'any', run(p, a) { p.note('alert', a); p.alerted = a; return R(`Pre-alert to ${a.hospName}: ${a.kindLabel}.`, 'good'); } },
  terminate: {
    cat: 'talk', label: 'Stop resuscitation', dur: 10, who: 'me', needs: p => p.arrest ? null : 'The patient has a pulse.', run(p) {
      const ok = p.rhythm === 'asystole' && p.t - (p.firstTime('cprStart') ?? p.t) > 1200 && p.etco2 < 12;
      if (!ok) p.error('terminateEarly', 'Stopped resuscitation before meeting termination criteria (20 min of ALS, asystole, EtCO2 < 10, reversible causes addressed).', 3);
      p.dead = true; p.tx.cpr.on = false; p.tx.vent.on = false; p.note('terminate', { ok }); return R(`Resuscitation stopped. Time of death ${fmtT(p.t)}.`, 'bad');
    },
  },
};
function notArrestOk() { return null; }
const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const limbName = l => ({ legL: 'left thigh', legR: 'right thigh', armL: 'left arm', armR: 'right arm' }[l] || l);

// An iatrogenic pneumothorax (needle into a healthy chest).
function condPneumo(S) {
  return { type: 'iatrogenicPneumo', side: S, sev: 0.25, tick(p, dt) { this.sev = clamp(this.sev + dt * (0.0004 + 0.002 * (p.ppv || 0))); if (p.tx.thoracostomy[S]) this.sev = 0.05; p.lungC[S] *= 1 - 0.8 * this.sev; if (this.sev > 0.5) p.m.obstruct *= 1 - 0.7 * clamp((this.sev - 0.5) / 0.5); p.find['breath' + S] = this.sev > 0.4 ? 'diminished' : null; } };
}

// A structure struck by a needle or blade on the way in or out. `h` = { name, t (tissue), severity 0..1 }.
// The procedure layer reports what the tool passed through; this decides what that does to the patient.
export function applyCollateral(p, h, S) {
  const n = h.name || '', sev = h.severity ?? 1;
  const bleedSite = (id, label, rate, extra) => { const hm = p.get('hemorrhage') || p.add(hemEmpty()); if (!hm.sites.find(s => s.id === id)) hm.sites.push(Object.assign({ id, label, rate: rate * sev, ext: false, clot: 0, ctl: 0, lost: 0, pain: 4 }, extra)); };
  const err = (id, text, s = 2) => p.error(id, text, s);
  if (/intercostal artery|neurovascular/.test(n)) { bleedSite('icA' + (S || ''), 'intercostal artery', 70); err('hitIntercostal', 'Went in under the rib instead of over it: lacerated the intercostal artery. Bleeding into the chest.'); }
  else if (/internal mammary/.test(n)) { bleedSite('ima', 'internal mammary artery', 110); err('hitIMA', 'Too close to the sternum: lacerated the internal mammary artery.'); }
  else if (/subclavian/.test(n)) { bleedSite('subclav', 'subclavian vessel', 220); err('hitSubclavian', 'Too high and too deep under the clavicle: punctured a subclavian vessel.', 3); }
  else if (/lung/.test(n)) { if (!p.tx.thoracostomy[S || h.side]) { const s2 = S || h.side || 'L'; if (!p.cond.some(c => (c.type === 'tensionPneumo' || c.type === 'iatrogenicPneumo') && c.side === s2)) p.add(condPneumo(s2)); } p.shunt = clamp(p.shunt + 0.05 * sev); err('hitLung', 'The tool went on into the lung: laceration, air leak.', 2); }
  else if (/ventricle|atrium|myocard|coronary|anterior descending/.test(n)) {
    const t = p.get('tamponade');
    if (/coronary|descending/.test(n)) { p.coronary = Math.max(p.coronary || 0, 0.45); p.m.vfRisk += 0.02; err('hitCoronary', 'Lacerated a coronary artery.', 3); }
    if (t) { t.rate += 45 / 60 * sev; } else p.add(tampNew(40 * sev));
    p.ecgMods.pvc = 0.4; if (p.rng() < 0.25 * sev && !p.arrest) { p.vfWhy = 'needle in the ventricle'; p.setRhythm('vf', 'needle in the myocardium'); }
    err('hitHeart', 'The needle went through the pericardium into the heart muscle.', 3);
  }
  else if (/aorta|vena cava|pulmonary trunk|pulmonary artery|brachiocephalic/.test(n)) { bleedSite('great', 'great vessel', 900); err('hitGreatVessel', `Punctured the ${n}. This is not survivable in the field.`, 3); }
  else if (/liver/.test(n)) { bleedSite('liver', 'liver laceration', 160); err('hitLiver', 'Too low: through the diaphragm into the liver.', 3); }
  else if (/spleen/.test(n)) { bleedSite('spleen', 'splenic laceration', 190); err('hitSpleen', 'Too low: through the diaphragm into the spleen.', 3); }
  else if (/stomach|bowel|colon/.test(n)) { err('hitBowel', `Too low: entered the abdomen and perforated the ${n}.`, 2); p.flags.perforation = true; }
  else if (/diaphragm/.test(n)) { err('hitDiaphragm', 'Too low: through the diaphragm.', 2); }
  else if (/carotid/.test(n)) { bleedSite('carotid', 'carotid artery', 450, { ext: true, fix: { pressure: true } }); p.brainC *= 0.8; err('hitCarotid', 'Far too lateral: cut the carotid artery.', 3); }
  else if (/jugular/.test(n)) { bleedSite('jug', n, /internal/.test(n) ? 200 : 50, { ext: true, fix: { pressure: true } }); p.secretions = clamp(p.secretions + 0.3); err('hitJugular', `Off the midline: opened the ${n}. Blood in the field and the airway.`, /internal/.test(n) ? 3 : 1); }
  else if (/thyroid (isthmus|lobe|gland)/.test(n)) { bleedSite('thyroid', 'thyroid', 45, { ext: true, fix: { pressure: true } }); p.secretions = clamp(p.secretions + 0.3); err('hitThyroid', 'Too low: cut into the thyroid. Bleeding obscures everything.', 1); }
  else if (/vocal cords/.test(n)) { p.flags.cordsCut = true; err('hitCords', 'Too high: went through the thyroid cartilage and the vocal cords.', 2); }
  else if (/oesophagus/.test(n)) { p.flags.oesophagus = true; err('hitOesophagus', 'Too deep: through the back wall of the trachea into the oesophagus.', 3); }
  else if (/spinal cord|vertebra/.test(n) && /cord/.test(n)) { err('hitCord', 'The blade reached the spinal cord.', 3); p.flags.cordWorse = true; }
  else if (/brachial artery/.test(n)) { bleedSite('brach', 'brachial artery puncture', 40, { ext: true, fix: { pressure: true } }); err('hitBrachial', 'Bright red pulsatile flash: that was the brachial artery, not a vein.', 1); }
  else if (/median nerve/.test(n)) { p.painC = 10; err('hitNerve', 'Electric pain down the forearm: the needle hit the median nerve.', 1); }
  else if (/growth plate/.test(n)) { err('hitPhysis', 'IO through the growth plate of a child.', 2); }
  else if (/femoral artery|femoral vein/.test(n)) { bleedSite('fem', n, 200, { ext: true, fix: { pressure: true, pack: true } }); err('hitFemoral', `Punctured the ${n}.`, 2); }
  else if (/phrenic/.test(n)) { p.tvC *= 0.7; err('hitPhrenic', 'Cut the phrenic nerve on the pericardium: that half of the diaphragm is paralysed.', 2); }
}
function hemEmpty() { return { type: 'hemorrhage', sites: [], rate: 0, extRate: 0, tick(p, dt, m) { let total = 0; for (const s of this.sites) { const flow = s.rate / 60 * (p.arrest ? clamp(p.map / 90) : Math.pow(clamp(p.map / 90, 0.05, 1.7), 1.3)) * (1 - 0.85 * s.clot) * (s.fix?.pressure && p.tx.pressureOn === s.id ? 0.25 : 1); s.clot = clamp(s.clot + (0.0009 + 0.002 * m.clotAid) * dt, 0, 0.85); p.bleed(flow * dt); s.lost += flow * dt; total += flow; } this.rate = total * 60; }, reversed() { return clamp(1 - (this.rate - 20) / 120); } }; }
function tampNew(vol) { return { type: 'tamponade', vol, rate: 30 / 60, clotted: 0.3, sev: 0, tick(p, dt, m) { const f = this.rate * clamp(p.map / 80, 0.15, 1.3) * clamp(1 - this.vol / 420); this.vol += f * dt; p.bleed(f * dt); const s = this.sev = clamp(this.vol / 260); m.obstruct *= 1 - 0.94 * Math.pow(clamp((s - 0.28) / 0.72), 1.15); if (s > 0.35) p.find.heartSounds = 'muffled, distant'; }, aspirate(p, ml) { const got = Math.min(ml, this.vol * 0.7); this.vol -= got; return got; }, reversed() { return clamp(1 - (this.sev - 0.3) / 0.3); } }; }

// Run an action. sc = the call context (scenario script, patient name, partner state) or undefined in tests.
export function act(p, id, args = {}, sc) {
  const A = ACTIONS[id]; if (!A) return R('Unknown action ' + id, 'warn');
  const why = A.needs?.(p, args, sc); if (why) return R(why, 'warn', { blocked: true });
  const r = A.run(p, args, sc) || R('');
  p.note('act', { id, args: summarise(args), msg: r.msg });
  return r;
}
const summarise = a => { const o = {}; for (const k in a) if (typeof a[k] !== 'object' && typeof a[k] !== 'function') o[k] = a[k]; return o; };
export const CATS = [['assess', 'Assess'], ['monitor', 'Monitor'], ['airway', 'Airway'], ['breathing', 'Breathing'], ['circulation', 'Circulation'], ['drugs', 'Drugs'], ['talk', 'Radio / People']];
