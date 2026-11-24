// The drug box. Each drug: how it gets in (routes: absorption half-time in sim seconds, bioavailability), how long it
// lasts (half), what it does to the patient model (fx, called every step with the effect-site amount c), and how it is
// stocked (forms: real ampoule concentrations, because drawing up the wrong volume of the wrong strength is exactly how
// real tenfold errors happen). `card` is the protocol text shown in the pocket guide.
//
// Tuning lives in the fx functions: each uses an Emax curve e = c / (c + EC50).

import { clamp } from './physio.js';

const IV = { abs: 8 }, IO = { abs: 10 };
const emax = (c, ec) => c / (c + ec);
const also = (cur, x) => 1 - (1 - cur) * (1 - x);       // combine two fractional effects

export const DRUGS = {
  epinephrine: {
    name: 'Epinephrine', aka: 'adrenaline', unit: 'mg', half: 150,
    routes: { IV, IO, IM: { abs: 150 }, NEB: { abs: 1, zero: 300, f: 0.12 } },
    forms: [
      { id: 'epi1', label: 'Epinephrine 1 mg/mL (1:1,000)', pack: '1 mL ampoule', conc: 1, max: 1, step: 0.05, routes: ['IM', 'IV', 'IO', 'NEB'] },
      { id: 'epi01', label: 'Epinephrine 0.1 mg/mL (1:10,000)', pack: '10 mL prefilled syringe', conc: 0.1, max: 10, step: 0.5, routes: ['IV', 'IO', 'IM'] },
    ],
    card: 'CARDIAC ARREST: 1 mg IV/IO (10 mL of 0.1 mg/mL) every 3-5 min.\nANAPHYLAXIS / LIFE-THREATENING ASTHMA: 0.3-0.5 mg IM (0.3-0.5 mL of 1 mg/mL), lateral thigh; repeat at 5 min.\nNEVER give the arrest dose IV to a patient with a pulse.',
    fx(p, m, c) {
      const e = emax(c, 0.08); m.adr = Math.max(m.adr, e);
      const ep = emax(c, 0.38);          // the pressor/chronotropic effects need more drug than the bronchial and mast-cell ones
      m.svrMul *= 1 + 1.25 * ep; m.hrAdd += 62 * ep; m.inoAdd += 0.6 * ep; m.bronchoRelief = also(m.bronchoRelief, 0.85 * e);
      if (!p.arrest && c > 0.28) {
        m.vfRisk += (c - 0.28) * 0.012 * (1 + 2.5 * (p.ischaemia || 0) + (p.age > 60 ? 0.6 : 0) + (p.coronary ? 1.5 : 0));
        p.ecgMods.pvc = Math.max(p.ecgMods.pvc, clamp((c - 0.2) * 0.7));
        if (c > 0.5) p.error('epiOverdose', 'Arrest-dose epinephrine reached the circulation of a patient with a pulse: extreme hypertension, tachyarrhythmia.', 3);
      }
    },
  },
  amiodarone: {
    name: 'Amiodarone', unit: 'mg', half: 3000, routes: { IV, IO },
    forms: [{ id: 'amio', label: 'Amiodarone 50 mg/mL', pack: '3 mL ampoule (150 mg)', conc: 50, max: 9, step: 0.5, routes: ['IV', 'IO'] }],
    card: 'VF / PULSELESS VT refractory to shocks: 300 mg IV/IO (6 mL) after the 3rd shock; 150 mg (3 mL) after the 5th.\nStable wide-complex tachycardia: 150 mg over 10 min.',
    fx(p, m, c) { const e = emax(c, 160); m.antiarr = Math.max(m.antiarr, 0.9 * e); if (!p.arrest) { m.svrMul *= 1 - 0.16 * e; m.hrMul *= 1 - 0.1 * e; } },
  },
  atropine: {
    name: 'Atropine', unit: 'mg', half: 1500, routes: { IV, IO, IM: { abs: 240 } },
    forms: [{ id: 'atro', label: 'Atropine 0.1 mg/mL', pack: '10 mL prefilled syringe (1 mg)', conc: 0.1, max: 10, step: 0.5, routes: ['IV', 'IO', 'IM'] }],
    card: 'SYMPTOMATIC BRADYCARDIA: 1 mg IV (10 mL), repeat every 3-5 min to 3 mg.\nUnlikely to work in complete heart block with a wide escape: go to pacing.',
    fx(p, m, c) { const e = emax(c, 0.35); m.vagalBlock = Math.max(m.vagalBlock || 0, e); if (!p.arrest && p.hrFixed == null) m.hrAdd += 16 * e; p.atropine = e; },
  },
  aspirin: {
    name: 'Aspirin', unit: 'mg', half: 9000, routes: { PO: { abs: 240, f: 0.9 } }, needsSwallow: true,
    forms: [{ id: 'asa', label: 'Aspirin 81 mg chewable', pack: 'tablets', conc: 81, max: 8, step: 1, per: 'tablet', routes: ['PO'] }],
    card: 'SUSPECTED ACUTE CORONARY SYNDROME: 324 mg (4 x 81 mg) chewed.\nNot if allergic to aspirin/NSAIDs or actively bleeding.',
    fx(p, m, c) { p.asa = emax(c, 110); },
    onGive(p) { if (p.allergies.has('aspirin')) { p.flags.asaReaction = true; p.error('aspirinAllergy', 'Gave aspirin to a patient with a documented aspirin allergy.', 3); } },
  },
  nitroglycerin: {
    name: 'Nitroglycerin', aka: 'GTN', unit: 'mg', half: 200, routes: { SL: { abs: 35 } }, needsConscious: true,
    forms: [{ id: 'ntg', label: 'Nitroglycerin 0.4 mg spray', pack: 'metered sublingual spray', conc: 0.4, max: 3, step: 1, per: 'spray', routes: ['SL'] }],
    card: 'CARDIAC CHEST PAIN / PULMONARY OEDEMA: 0.4 mg SL, repeat every 5 min x3 if systolic stays above 100.\nNOT if systolic < 100, heart rate < 50 or > 130, right-ventricular infarct (check the 12-lead), or sildenafil/tadalafil in the last 24-48 h.',
    fx(p, m, c) { const e = emax(c, 0.3); m.veno += 0.3 * e * (p.ntgSens || 1); m.svrMul *= 1 - 0.1 * e; p.ntg = e; },
    onGive(p) {
      if (p.sys < 98) p.error('ntgHypotension', 'Nitroglycerin given with a systolic pressure under 100.', 2);
      if (p.meds.has('pde5')) p.error('ntgPde5', 'Nitroglycerin given to a patient taking a PDE5 inhibitor (sildenafil): profound, prolonged hypotension.', 3);
      if (p.rvInfarct && !p.tx.iv.length) p.error('ntgRV', 'Nitroglycerin given in an inferior MI with right-ventricular involvement: preload-dependent, pressure collapsed.', 2);
    },
  },
  fentanyl: {
    name: 'Fentanyl', unit: 'mcg', half: 1500, routes: { IV, IO, IM: { abs: 240 }, IN: { abs: 120, f: 0.7 } },
    forms: [{ id: 'fent', label: 'Fentanyl 50 mcg/mL', pack: '2 mL ampoule (100 mcg)', conc: 50, max: 6, step: 0.25, routes: ['IV', 'IO', 'IM', 'IN'] }],
    card: 'SEVERE PAIN: 1 mcg/kg IV/IN (typical 50-100 mcg), repeat 25-50 mcg every 5 min. Half dose in the elderly.\nWatch the respiratory rate. Not with systolic < 90.',
    fx(p, m, c) { m.opioid += c / 10; },
    onGive(p) { if (p.sys < 88 && !p.arrest) p.error('opioidShock', 'Opioid given to a hypotensive patient.', 1); },
  },
  morphine: {
    name: 'Morphine', unit: 'mg', half: 3600, routes: { IV, IO, IM: { abs: 300 } },
    forms: [{ id: 'morph', label: 'Morphine 10 mg/mL', pack: '1 mL ampoule', conc: 10, max: 3, step: 0.05, routes: ['IV', 'IO', 'IM'] }],
    card: 'SEVERE PAIN: 2-5 mg IV, repeat every 5 min, max 10 mg. Note the strength: 0.2-0.5 mL.\nReleases histamine: avoid in hypotension.',
    fx(p, m, c) { m.opioid += c; m.veno += 0.08 * emax(c, 8); p.nausea = Math.max(p.nausea, 0.3 * emax(c, 5)); },
    onGive(p) { if (p.sys < 88 && !p.arrest) p.error('opioidShock', 'Opioid given to a hypotensive patient.', 1); },
  },
  naloxone: {
    name: 'Naloxone', aka: 'Narcan', unit: 'mg', half: 720, routes: { IV, IO, IM: { abs: 200 }, IN: { abs: 150, f: 0.5 } },
    forms: [{ id: 'nal', label: 'Naloxone 0.4 mg/mL', pack: '1 mL ampoule', conc: 0.4, max: 5, step: 0.25, routes: ['IV', 'IO', 'IM', 'IN'] }, { id: 'nalin', label: 'Naloxone 4 mg nasal spray', pack: 'single-use device', conc: 4, max: 1, step: 1, per: 'device', routes: ['IN'] }],
    card: 'OPIOID OVERDOSE WITH RESPIRATORY DEPRESSION: ventilate first. 0.4 mg IV/IM, repeat every 2-3 min, titrated to BREATHING (rate > 10), not to wakefulness.\nLarge doses in the dependent cause violent withdrawal and vomiting. It wears off before long-acting opioids do.',
    fx() { },
  },
  midazolam: {
    name: 'Midazolam', aka: 'Versed', unit: 'mg', half: 2400, routes: { IV, IO, IM: { abs: 150 }, IN: { abs: 120, f: 0.75 } },
    forms: [{ id: 'midaz', label: 'Midazolam 5 mg/mL', pack: '2 mL vial (10 mg)', conc: 5, max: 4, step: 0.1, routes: ['IV', 'IO', 'IM', 'IN'] }],
    card: 'SEIZURE > 5 min or recurrent: 10 mg IM (2 mL) if > 40 kg, or 5 mg IV; child 0.2 mg/kg IM. One repeat at 5-10 min.\nCheck a glucose. Expect respiratory depression, worse with alcohol or opioids.',
    fx(p, m, c) { const e = emax(c, 4.5 * (p.w / 75) * (p.age > 70 ? 0.6 : 1)); p.benzo = e; m.sed += 0.55 * e; m.respDep = also(m.respDep, 0.3 * e * (p.alcohol ? 1.8 : 1) * ((p.opioidX || 0) > 3 ? 1.6 : 1)); m.svrMul *= 1 - 0.08 * e; },
  },
  ketamine: {
    name: 'Ketamine', unit: 'mg', half: 900, routes: { IV, IO, IM: { abs: 150 } },
    forms: [{ id: 'ket', label: 'Ketamine 50 mg/mL', pack: '10 mL vial (500 mg)', conc: 50, max: 10, step: 0.1, routes: ['IV', 'IO', 'IM'] }],
    card: 'ANALGESIA: 0.2-0.3 mg/kg IV (15-25 mg) slowly.\nPROCEDURAL DISSOCIATION / severe agitation: 1-1.5 mg/kg IV or 4 mg/kg IM.\nBreathing and pressure are usually preserved.',
    fx(p, m, c) { const x = c / p.w; m.analgesia += 7 * x / (x + 0.2); const d = clamp((x - 0.45) / 0.6); p.dissoc = d; m.sed += 0.8 * d; m.symAdd += 0.08; if (x > 2.6) m.respDep = also(m.respDep, 0.5); },
  },
  ondansetron: {
    name: 'Ondansetron', unit: 'mg', half: 9000, routes: { IV, IO, IM: { abs: 300 } },
    forms: [{ id: 'ond', label: 'Ondansetron 2 mg/mL', pack: '2 mL ampoule (4 mg)', conc: 2, max: 4, step: 0.5, routes: ['IV', 'IM'] }],
    card: 'NAUSEA / VOMITING: 4 mg IV/IM.',
    fx(p, m, c) { m.antiemetic += 0.7 * emax(c, 1.5); },
  },
  dextrose: {
    name: 'Dextrose 10%', aka: 'D10', unit: 'g', half: 99999, routes: { IV: { abs: 60 }, IO: { abs: 70 } },
    forms: [{ id: 'd10', label: 'Dextrose 10% (0.1 g/mL)', pack: '250 mL bag (25 g)', conc: 0.1, max: 250, step: 25, routes: ['IV', 'IO'] }],
    card: 'HYPOGLYCAEMIA (glucose < 60 mg/dL) unable to swallow safely: 100-150 mL (10-15 g) IV, recheck, titrate up to 250 mL (25 g).',
    fx() { }, onFlow(p, g) { p.bgl += g * 5.6 * (70 / p.wIdeal); },
  },
  glucoseGel: {
    name: 'Oral glucose gel', unit: 'g', half: 99999, routes: { PO: { abs: 280, f: 0.9 } },
    forms: [{ id: 'gel', label: 'Glucose gel 15 g', pack: 'tube', conc: 15, max: 3, step: 1, per: 'tube', routes: ['PO'] }],
    card: 'HYPOGLYCAEMIA in a patient who is awake and can swallow: 15-30 g by mouth.\nNEVER by mouth in a patient who cannot protect their airway.',
    fx() { }, onFlow(p, g) { p.bgl += g * 3.6 * (70 / p.wIdeal); },
    onGive(p) { if (!p.canSwallow) { p.error('oralUnsafe', 'Put glucose gel in the mouth of a patient who could not protect their airway: aspirated.', 3); p.secretions = clamp(p.secretions + 0.5); p.aspirated = clamp(p.aspirated + 0.3); p.emit('aspiration'); } },
  },
  glucagon: {
    name: 'Glucagon', unit: 'mg', half: 99999, routes: { IM: { abs: 300 }, IN: { abs: 300, f: 0.8 } },
    forms: [{ id: 'gluc', label: 'Glucagon 1 mg', pack: 'kit: reconstitute to 1 mL', conc: 1, max: 1, step: 0.5, routes: ['IM', 'IN'] }],
    card: 'HYPOGLYCAEMIA without IV access: 1 mg IM. Slow (8-15 min) and needs liver glycogen: unreliable in alcoholics and the malnourished. Causes vomiting.',
    fx() { }, onFlow(p, mg) { if (p.glycogen !== false) p.bgl += mg * 95; p.nausea = Math.max(p.nausea, 0.45); },
  },
  albuterol: {
    name: 'Albuterol', aka: 'salbutamol', unit: 'mg', half: 900, routes: { NEB: { abs: 1, zero: 300 } }, needsBreathing: true,
    forms: [{ id: 'alb', label: 'Albuterol 2.5 mg / 3 mL', pack: 'nebule', conc: 2.5, max: 3, step: 1, per: 'nebule', routes: ['NEB'] }],
    card: 'BRONCHOSPASM (asthma, COPD, anaphylaxis): 2.5-5 mg nebulised with oxygen at 6-8 L/min; back-to-back in severe attacks. Add ipratropium to the first.\nAlso shifts potassium into cells (hyperkalaemia).',
    fx(p, m, c) { const e = emax(c, 2); m.bronchoRelief = also(m.bronchoRelief, 0.5 * e * (p.betaResponse ?? 1)); m.hrAdd += 14 * e; m.kShift = Math.max(m.kShift, e); },
  },
  ipratropium: {
    name: 'Ipratropium', unit: 'mg', half: 3000, routes: { NEB: { abs: 1, zero: 300 } }, needsBreathing: true,
    forms: [{ id: 'ipra', label: 'Ipratropium 0.5 mg / 2.5 mL', pack: 'nebule', conc: 0.5, max: 1, step: 1, per: 'nebule', routes: ['NEB'] }],
    card: 'Added to the first albuterol nebuliser in moderate-severe asthma / COPD: 0.5 mg.',
    fx(p, m, c) { m.bronchoRelief = also(m.bronchoRelief, 0.16 * emax(c, 0.2)); },
  },
  magnesium: {
    name: 'Magnesium sulfate', unit: 'g', half: 2400, routes: { IV: { abs: 8 }, INF: { abs: 1, zero: 600 } },
    forms: [{ id: 'mag', label: 'Magnesium sulfate 0.5 g/mL', pack: '4 mL vial (2 g)', conc: 0.5, max: 8, step: 1, routes: ['INF', 'IV'] }],
    card: 'LIFE-THREATENING ASTHMA: 2 g IV over 10-20 min.\nTORSADES DE POINTES: 2 g IV over 1-2 min (push in arrest).\nFast pushes drop the pressure.',
    fx(p, m, c) { const e = emax(c, 1.5); m.bronchoRelief = also(m.bronchoRelief, 0.22 * e); p.mag = e; m.svrMul *= 1 - 0.14 * e; if (c > 1.6 && !p.arrest) m.svrMul *= 1 - 0.25 * clamp(c - 1.6); },
  },
  methylpred: {
    name: 'Methylprednisolone', aka: 'Solu-Medrol', unit: 'mg', half: 20000, routes: { IV, IO, IM: { abs: 400 } },
    forms: [{ id: 'mp', label: 'Methylprednisolone 125 mg', pack: 'vial: reconstitute to 2 mL', conc: 62.5, max: 2, step: 1, routes: ['IV', 'IM'] }],
    card: 'Asthma / COPD / anaphylaxis (after epinephrine): 125 mg IV. Works over hours: never instead of the drugs that work now.',
    fx(p) { p.steroid = true; },
  },
  diphenhydramine: {
    name: 'Diphenhydramine', aka: 'Benadryl', unit: 'mg', half: 9000, routes: { IV, IM: { abs: 300 } },
    forms: [{ id: 'dph', label: 'Diphenhydramine 50 mg/mL', pack: '1 mL vial', conc: 50, max: 1, step: 0.5, routes: ['IV', 'IM'] }],
    card: 'Allergic reaction (itch, hives), after epinephrine in anaphylaxis: 25-50 mg IV/IM. Does not treat airway swelling or shock.',
    fx(p, m, c) { p.antihist = emax(c, 20); m.sed += 0.08 * p.antihist; },
  },
  txa: {
    name: 'Tranexamic acid', aka: 'TXA', unit: 'g', half: 7000, routes: { INF: { abs: 1, zero: 600 }, IV: { abs: 8 }, IO: { abs: 10 } },
    forms: [{ id: 'txa', label: 'Tranexamic acid 100 mg/mL', pack: '10 mL ampoule (1 g)', conc: 0.1, max: 20, step: 5, routes: ['INF', 'IV', 'IO'] }],
    card: 'MAJOR HAEMORRHAGE from trauma within 3 hours: 1 g IV over 10 min.',
    fx(p, m, c) { m.clotAid = Math.max(m.clotAid, emax(c, 0.4)); },
  },
  calcium: {
    name: 'Calcium chloride 10%', unit: 'g', half: 1500, routes: { IV, IO },
    forms: [{ id: 'cacl', label: 'Calcium chloride 100 mg/mL', pack: '10 mL prefilled syringe (1 g)', conc: 0.1, max: 10, step: 1, routes: ['IV', 'IO'] }],
    card: 'HYPERKALAEMIA with ECG changes (peaked T, wide QRS, bradycardia) e.g. missed dialysis: 1 g IV over 2-5 min through a good line. Protects the heart for ~30 min; it does not remove potassium.',
    fx(p, m, c) { m.memStab = Math.max(m.memStab, emax(c, 0.3)); },
  },
  bicarb: {
    name: 'Sodium bicarbonate 8.4%', unit: 'mEq', half: 2000, routes: { IV, IO },
    forms: [{ id: 'bic', label: 'Sodium bicarbonate 1 mEq/mL', pack: '50 mL prefilled syringe', conc: 1, max: 100, step: 10, routes: ['IV', 'IO'] }],
    card: 'TRICYCLIC OVERDOSE with wide QRS, or hyperkalaemia: 50 mEq IV.',
    fx(p, m, c) { p.bicarb = emax(c, 30); m.kShift = Math.max(m.kShift, 0.6 * p.bicarb); },
  },
  adenosine: {
    name: 'Adenosine', unit: 'mg', half: 6, routes: { IV: { abs: 2 } },
    forms: [{ id: 'aden', label: 'Adenosine 3 mg/mL', pack: '2 mL vial (6 mg)', conc: 3, max: 4, step: 0.5, routes: ['IV'] }],
    card: 'STABLE NARROW REGULAR TACHYCARDIA (SVT): 6 mg rapid IV push with flush in a large proximal vein, then 12 mg. Warn the patient. Not in asthma; useless in atrial fibrillation.',
    fx(p, m, c, dt, d) { if (c > 2.5 && !d.hit) { d.hit = true; p.adenosine?.(c); p.emit('adenosine', { c }); if (p.get('asthma')) { p.broncho = clamp(p.broncho + 0.25); p.error('adenosineAsthma', 'Adenosine in an asthmatic: bronchospasm.', 2); } } if (c < 0.5) d.hit = false; },
  },
  acetaminophen: {
    name: 'Acetaminophen', aka: 'paracetamol', unit: 'mg', half: 9000, routes: { INF: { abs: 1, zero: 600 }, PO: { abs: 900, f: 0.9 } },
    forms: [{ id: 'apap', label: 'Acetaminophen 10 mg/mL', pack: '100 mL IV bag (1 g)', conc: 10, max: 100, step: 50, routes: ['INF'] }],
    card: 'MILD-MODERATE PAIN / FEVER: 1 g IV over 10 min.',
    fx(p, m, c) { m.analgesia += 1.8 * emax(c, 400); },
  },
};

// Opioid agonists and naloxone meet here (called by the patient after all drugs have reported in).
export function resolveOpioids(p, m, dt) {
  const nal = p.level('naloxone');
  const raw = m.opioid;
  const eff = raw / (1 + nal / 0.12);
  const tol = p.meds.has('opioidTolerant') ? 3 : 1, sens = (p.age > 70 ? 1.45 : 1);
  const x = eff / tol * sens;
  p.opioidX = x;
  m.analgesia += 9 * x / (x + 6);
  m.respDep = also(m.respDep, x * x / (x * x + 289));
  m.sed += 0.95 * x * x / (x * x + 324);
  p.pinpoint = x > 7;
  if (x > 3) p.nausea = Math.max(p.nausea, 0.2);
  // precipitated withdrawal in the dependent
  const dep = p.meds.has('opioidTolerant') || p.flags.opioidDependent;
  const w = dep ? clamp((nal - 0.55) / 1.2) : 0;
  p.withdrawal = w;
  if (w > 0.15) { p.nausea = Math.max(p.nausea, 0.55 + 0.6 * w); m.symAdd += 0.3 * w; p.painC = Math.max(p.painC, 5 * w); if (!p.flags.withdrawalSaid) { p.flags.withdrawalSaid = true; p.emit('withdrawal'); p.error('withdrawal', 'Too much naloxone at once in an opioid-dependent patient: precipitated withdrawal (vomiting, agitation).', 1); } }
}

// Convenience for UI and bots: give `amount` (in the drug's unit) by `route`. Returns { ok, msg }.
export function administer(p, id, amount, route) {
  const def = DRUGS[id]; if (!def) return { ok: false, msg: 'Unknown drug.' };
  if (!def.routes[route]) return { ok: false, msg: `${def.name} cannot be given ${route}.` };
  if ((route === 'IV' || route === 'INF') && !p.tx.iv.some(i => i.patent)) { if (p.tx.io) route = route === 'INF' ? 'INF' : 'IO'; else return { ok: false, msg: 'No IV access.' }; }
  if (route === 'IO' && !p.tx.io) return { ok: false, msg: 'No IO access.' };
  if (route === 'PO' || route === 'SL') { if (p.arrest) return { ok: false, msg: 'The patient is in cardiac arrest.' }; }
  if (route === 'NEB' && !p.arrest && p.spontMv < 0.5 && !p.tx.vent.on) { p.note('nebNoBreath', { id }); }
  def.onGive?.(p, amount, route);
  p.give(id, amount, route, def);
  return { ok: true, msg: `${def.name} ${fmt(amount)} ${def.unit} ${route}` };
}
const fmt = n => (Math.round(n * 1000) / 1000).toString();
