// Headless balance check: plays every call three ways (nothing done, textbook care, a classic mistake) through the
// physiology model and prints what happened.   node stay-with-me/tools/sim.mjs [scenarioId] [-v]
// A script is a list of [simSeconds, actionId, args]. Skill procedures are assumed to succeed unless the script says otherwise.
import { Patient } from '../js/physio.js';
import { addConditions } from '../js/conditions.js';
import { act } from '../js/actions.js';
import { SCENARIOS } from '../js/scenarios.js';
import { grade } from '../js/review.js';

const only = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null, verbose = process.argv.includes('-v');
const RATE = Number((process.argv.find(a => a.startsWith('--rate=')) || '--rate=1').slice(7));   // difficulty: 0.75 student, 1 paramedic, 1.2 critical
const D = (id, amount, route) => ['drug', { id, amount, route }];
const iv = [null, 'iv', { ok: true, gauge: 18 }];
const at = (t, a) => [t, a[1] ?? a[0], a[2] ?? a[1]];
const basics = [[5, 'response'], [10, 'airway'], [18, 'breathing'], [28, 'pulse'], [34, 'monSpo2'], [40, 'reassure'], [60, 'monEcg'], [90, 'monBp']];
const ALERT = k => ['alert', { kind: k, hospName: 'St. Brigid', kindLabel: k }];

export const PLANS = {
  hypo: {
    ideal: [...basics, [50, 'history', { q: 'allergies' }], [56, 'history', { q: 'meds' }], [80, 'bgl'], [150, 'iv', { ok: true }], [180, ...D('dextrose', 12.5, 'IV')], [400, 'bgl'], [420, ...D('dextrose', 5, 'IV')], [700, 'bgl']], end: 900, dest: 'general',
    wrong: [...basics, [60, ...D('glucoseGel', 15, 'PO')]], wrongNote: 'gel in a patient who cannot swallow',
  },
  stemi: {
    ideal: [...basics, [100, 'expose', { part: 'chest' }], [150, 'twelveLead'], [210, ...D('aspirin', 324, 'PO')], [260, 'iv', { ok: true }], [330, ...D('fentanyl', 50, 'IV')], [400, ...ALERT('stemi')], [600, ...D('fentanyl', 25, 'IV')]], end: 1500, dest: 'regional',
    wrong: [...basics, [120, ...D('nitroglycerin', 0.4, 'SL')], [420, ...D('nitroglycerin', 0.4, 'SL')], [720, ...D('nitroglycerin', 0.4, 'SL')]], wrongNote: 'nitro x3 in an RV infarct, no aspirin',
  },
  anaphylaxis: {
    ideal: [...basics.slice(0, 5), [40, ...D('epinephrine', 0.5, 'IM')], [60, 'o2', { device: 'nrb' }], [90, 'monBp'], [130, 'iv', { ok: true }], [160, 'fluids', { ml: 1000, pressure: true }], [200, ...D('albuterol', 2.5, 'NEB')], [350, ...D('epinephrine', 0.5, 'IM')], [420, ...D('diphenhydramine', 50, 'IV')], [500, ...ALERT('medical')], [560, 'monBp']], end: 1200, dest: 'general',
    wrong: [...basics.slice(0, 5), [100, 'iv', { ok: true }], [130, ...D('epinephrine', 1, 'IV')]], wrongNote: '1 mg epinephrine IV with a pulse',
  },
  motorcycle: {
    ideal: [[5, 'response'], [12, 'tourniquet', { limb: 'legR', q: 0.97 }], [40, 'airway'], [48, 'breathing'], [58, 'pulse'], [64, 'collar'], [90, 'expose', { part: 'all' }], [110, 'binder'], [150, 'monSpo2'], [160, 'o2', { device: 'nrb' }], [175, 'monEcg'], [200, 'monBp'], [240, 'iv', { ok: true, gauge: 16 }], [270, ...D('txa', 1, 'INF')], [300, ...D('fentanyl', 75, 'IV')], [330, 'logRoll'], [360, 'reassure'], [380, 'blanket'], [400, ...ALERT('trauma')]], end: 1300, dest: 'regional', scene: 620,
    wrong: [...basics, [200, 'iv', { ok: true, gauge: 14 }], [230, 'fluids', { ml: 2000, pressure: true }], [300, 'dressing', { site: 'femR' }]], wrongNote: 'no tourniquet, 2 L of saline',
  },
  arrestGym: {
    ideal: [[4, 'cpr', { by: 'partner' }], [10, 'expose', { part: 'chest' }], [26, 'monPads'], [40, 'charge'], [52, 'shock'], [53, 'cpr', { by: 'partner' }], [60, 'igel'], [86, 'bvm', { by: 'me', rate: 10, o2: true }], [95, 'monCap'], [120, 'io', { ok: true }], [165, 'charge'], [173, 'shock'], [174, 'cpr', { by: 'partner' }], [185, ...D('epinephrine', 1, 'IO')], [285, 'charge'], [293, 'shock'], [294, 'cpr', { by: 'partner' }], [305, ...D('amiodarone', 300, 'IO')], [405, 'charge'], [413, 'shock'], [414, 'cpr', { by: 'partner' }], [430, ...D('epinephrine', 1, 'IO')], [525, 'charge'], [533, 'shock'], [534, 'cpr', { by: 'partner' }], [645, 'charge'], [653, 'shock'], [654, 'cpr', { by: 'partner' }], [670, ...D('epinephrine', 1, 'IO')], [765, 'charge'], [773, 'shock'], [774, 'cpr', { by: 'partner' }]],
    smart: true, end: 1500, dest: 'regional',
    wrong: [[30, 'cpr', { by: 'partner' }], [200, 'expose', { part: 'chest' }], [240, 'monPads'], [300, 'charge'], [320, 'shock']], wrongNote: 'slow to the first shock, no drugs',
  },
  overdose: {
    ideal: [[4, 'scene'], [10, 'response'], [16, 'airway'], [22, 'headTilt'], [30, 'bvm', { by: 'me', rate: 12, o2: true }], [45, 'npa'], [50, 'bvm', { by: 'partner', rate: 12, o2: true }], [60, 'monSpo2'], [70, 'pulse'], [90, ...D('naloxone', 0.4, 'IM')], [150, 'iv', { ok: true }], [240, ...D('naloxone', 0.4, 'IV')], [330, ...D('naloxone', 0.2, 'IV')], [420, 'breathing'], [430, ...ALERT('medical')]], smartOD: true, end: 1200, dest: 'general',
    wrong: [[20, 'response'], [40, ...D('naloxone', 4, 'IN')], [160, ...D('naloxone', 2, 'IM')]], wrongNote: '4 mg nasal + 2 mg IM, never ventilated',
  },
  asthma: {
    ideal: [...basics.slice(0, 5), [36, ['drug', { id: 'albuterol', amount: 5, route: 'NEB' }]], [38, ...D('ipratropium', 0.5, 'NEB')], [70, 'monCap'], [100, ...D('epinephrine', 0.5, 'IM')], [150, 'iv', { ok: true }], [180, ...D('magnesium', 2, 'INF')], [200, ...D('methylpred', 125, 'IV')], [360, ['drug', { id: 'albuterol', amount: 5, route: 'NEB' }]], [420, ...D('epinephrine', 0.5, 'IM')], [500, ...ALERT('medical')], [700, ['drug', { id: 'albuterol', amount: 5, route: 'NEB' }]]].map(x => Array.isArray(x[1]) ? [x[0], ...x[1]] : x), end: 1300, dest: 'general',
    wrong: [...basics.slice(0, 5), [60, 'position', { pos: 'supine' }], [90, 'bvm', { by: 'me', rate: 24, o2: true, tv: 0.6 }]], wrongNote: 'laid flat and bagged at 24/min',
  },
  seizure: {
    ideal: [[5, 'response'], [10, 'airway'], [16, 'npa'], [30, 'o2', { device: 'nrb' }], [45, 'monSpo2'], [60, 'bgl'], [90, ...D('glucagon', 1, 'IM')], [110, ...D('midazolam', 5, 'IM')], [200, 'iv', { ok: true }], [230, ...D('dextrose', 15, 'IV')], [330, 'bgl'], [350, ...D('dextrose', 10, 'IV')], [420, 'pulse'], [430, 'breathing'], [500, 'bgl'], [520, ...ALERT('medical')]], end: 1200, dest: 'general',
    wrong: [[5, 'response'], [30, ...D('midazolam', 10, 'IM')], [330, ...D('midazolam', 10, 'IM')], [600, ...D('midazolam', 10, 'IM')]], wrongNote: 'three doses of midazolam, no glucose check',
  },
  stabbing: {
    ideal: [[5, 'response'], [10, 'airway'], [18, 'breathing'], [26, 'expose', { part: 'chest' }], [44, 'chestSeal', { side: 'L', vented: true }], [60, 'o2', { device: 'nrb' }], [72, 'monSpo2'], [80, 'auscultate'], [96, 'neck'], [104, 'pulse'], [120, 'needleDecomp', { side: 'L', ok: true }], [150, 'logRoll'], [185, 'dressing', { site: 'backStab' }], [186, 'pack', { site: 'backStab' }], [290, 'monBp'], [330, 'iv', { ok: true, gauge: 16 }], [360, ...D('fentanyl', 50, 'IV')], [380, ...ALERT('trauma')], [420, 'reassure']], end: 1300, dest: 'regional', scene: 560,
    wrong: [...basics, [120, 'expose', { part: 'chest' }], [140, 'chestSeal', { side: 'L', vented: false }], [200, 'needleDecomp', { side: 'R', ok: true }]], wrongNote: 'occlusive seal, decompressed the wrong side',
  },
  stroke: {
    ideal: [...basics, [100, 'fast'], [140, 'bgl'], [165, 'history', { q: 'what' }], [175, 'history', { q: 'meds' }], [190, 'iv', { ok: true }], [260, ...ALERT('stroke')]], end: 1300, dest: 'regional', scene: 420,
    wrong: [...basics, [120, ...D('aspirin', 324, 'PO')], [200, ...D('nitroglycerin', 0.8, 'SL')]], wrongNote: 'aspirin and nitro for the blood pressure', wrongDest: 'general',
  },
  choking: {
    ideal: [[4, 'response'], [8, 'airway'], [14, 'magill'], [50, 'magill'], [84, 'cric', { ok: true, quality: 1 }], [100, 'bvm', { by: 'me', rate: 12, o2: true }], [110, 'monSpo2'], [120, 'monCap'], [130, 'expose', { part: 'chest' }], [146, 'monPads'], [160, 'pulse'], [220, 'io', { ok: true }], [240, 'drug', { id: 'epinephrine', amount: 1, route: 'IO', ifArrest: true }], [300, 'monBp'], [320, ...ALERT('arrest')]], smartChoke: true, end: 1200, dest: 'regional',
    wrong: [[4, 'response'], [20, 'cpr', { by: 'partner' }], [30, 'opa'], [45, 'bvm', { by: 'me', rate: 12, o2: true }]], wrongNote: 'bagging against a blocked airway, never looked',
  },
  hyperk: {
    ideal: [...basics, [100, 'history', { q: 'events' }], [110, 'expose', { part: 'chest' }], [130, 'twelveLead'], [190, 'iv', { ok: true }], [220, ...D('calcium', 1, 'IV')], [250, ...D('albuterol', 5, 'NEB')], [600, ...D('albuterol', 5, 'NEB')], [640, ...ALERT('medical')], [900, ...D('calcium', 1, 'IV')]], end: 1500, dest: 'regional',
    wrong: [...basics, [200, 'iv', { ok: true }], [240, ...D('atropine', 1, 'IV')], [500, ...D('atropine', 1, 'IV')]], wrongNote: 'atropine for the bradycardia, potassium never considered',
  },
  gsw: {
    ideal: [[4, 'response'], [8, 'airway'], [14, 'breathing'], [22, 'expose', { part: 'chest' }], [40, 'o2', { device: 'nrb' }], [50, 'auscultate'], [66, 'neck'], [74, 'pulse'], [84, 'monEcg'], [106, 'pericardiocentesis', { ok: true, ml: 60 }], [130, 'io', { ok: true }], [140, 'fluids', { ml: 500, pressure: true }], [150, 'logRoll'], [185, ...ALERT('trauma')], [200, 'monSpo2'], [400, 'pericardiocentesis', { ok: true, ml: 40 }]], end: 760, dest: 'regional', scene: 300,
    wrong: [...basics, [140, 'expose', { part: 'chest' }], [170, 'needleDecomp', { side: 'L', ok: true }], [260, 'iv', { ok: true }], [300, 'fluids', { ml: 2000, pressure: true }]], wrongNote: 'needled the chest, stayed and played',
  },
  dee: {
    ideal: [[4, 'response'], [8, 'airway'], [12, 'reassure'], [18, 'breathing'], [26, 'collar'], [52, 'expose', { part: 'all' }], [70, 'o2', { device: 'nrb' }], [82, 'auscultate'], [100, 'needleDecomp', { side: 'R', ok: true }], [125, 'binder'], [170, 'monSpo2'], [180, 'pressure', { site: 'scalp' }], [190, 'iv', { ok: true, gauge: 16 }], [215, ...D('txa', 1, 'INF')], [240, ...D('ketamine', 20, 'IV')], [270, 'dressing', { site: 'scalp' }], [300, ...ALERT('trauma')], [320, 'fluids', { ml: 250 }], [520, 'thoracostomy', { side: 'R', ok: true }]], end: 1200, dest: 'regional', scene: 420,
    wrong: [...basics, [140, 'iv', { ok: true }], [170, 'fluids', { ml: 2000, pressure: true }], [220, 'needleDecomp', { side: 'L', ok: true }]], wrongNote: 'wrong side, flooded with saline',
  },
};

function run(id, script, opts = {}) {
  const sc = Object.assign({ id }, SCENARIOS[id]);
  sc.script = JSON.parse(JSON.stringify(SCENARIOS[id].script || {}, (k, v) => typeof v === 'function' ? undefined : v));
  sc.pt = SCENARIOS[id].pt;
  const p = new Patient(Object.assign({ seed: opts.seed || 7 }, sc.pt), { rate: opts.rate ?? RATE });
  addConditions(p, sc.conditions); SCENARIOS[id].init?.(p);
  const q = [...(script || [])].sort((a, b) => a[0] - b[0]);
  const end = opts.end || 1500, trace = [];
  let nextTrace = 0, lastRhythmCheck = 0;
  while (p.t < end && !p.dead) {
    while (q.length && q[0][0] <= p.t) { const [, a, args] = q.shift(); if (a === 'shock' && opts.smart && !['vf', 'vfFine', 'vtPulseless'].includes(p.rhythm)) { act(p, 'disarm'); continue; } if (a === 'shock') p.defib.charged = true; if (args?.ifArrest && !p.arrest) continue; const r = act(p, a, args || {}, sc); if (verbose) console.log(`   ${fmt(p.t)} ${a} ${JSON.stringify(args || {})} -> ${r.msg}`); }
    // minimal smart resuscitation so "ideal" scripts cope with what the dice do
    if (opts.smart && p.t > 60) {
      if (p.arrest && !p.tx.cpr.on) act(p, 'cpr', { by: 'partner' });
      if (!p.arrest && p.tx.cpr.on) { act(p, 'cpr', { stop: true }); if (!p.log.some(l => l.type === '12lead')) { act(p, 'twelveLead'); act(p, 'alert', { kind: 'arrest', hospName: 'St. Brigid', kindLabel: 'arrest' }); act(p, 'monSpo2'); act(p, 'monBp'); } }
      if (p.arrest && p.tx.mon.pads && p.t - lastRhythmCheck > 120 && !q.some(x => x[1] === 'shock' && x[0] - p.t < 20)) { lastRhythmCheck = p.t; if (['vf', 'vfFine', 'vtPulseless'].includes(p.rhythm)) { act(p, 'charge'); p.defib.charged = true; act(p, 'shock'); act(p, 'cpr', { by: 'partner' }); } }
      if (!p.arrest) { while (q.length && ['shock', 'charge', 'cpr'].includes(q[0][1])) q.shift(); for (let i = q.length - 1; i >= 0; i--) if (['shock', 'charge', 'cpr'].includes(q[i][1]) || (q[i][1] === 'drug' && ['epinephrine', 'amiodarone'].includes(q[i][2].id))) q.splice(i, 1); }
    }
    if (opts.smart && p.defib.charging) { p.defib.charge = 1; p.defib.charging = false; p.defib.charged = true; }
    if (opts.smartOD) { if (p.rr > 10 && p.spo2 > 93 && p.tx.vent.on) act(p, 'bvm', { stop: true }); if (p.rr > 11 && p.t > 100) for (let i = q.length - 1; i >= 0; i--) if (q[i][1] === 'drug' && q[i][2].id === 'naloxone') q.splice(i, 1); }
    if (opts.smartChoke) { if (p.arrest && !p.tx.cpr.on) act(p, 'cpr', { by: 'partner' }); if (!p.arrest && p.tx.cpr.on) act(p, 'cpr', { stop: true }); }
    p.step(0.25);
    if (p.t >= nextTrace) { nextTrace += 120; trace.push(`${fmt(p.t)} ${p.rhythm.padEnd(8)} HR ${String(Math.round(p.hr)).padStart(3)} BP ${String(Math.round(p.sys)).padStart(3)}/${String(Math.round(p.dia)).padStart(3)} RR ${String(Math.round(p.rr)).padStart(2)} SpO2 ${String(p.spo2).padStart(3)} EtCO2 ${String(Math.round(p.etco2)).padStart(2)} GCS ${String(p.gcs.total).padStart(2)} vol ${(p.vol / p.volN * 100).toFixed(0)}% E ${p.energy.toFixed(2)} brainInj ${p.brainInjury.toFixed(2)} BGL ${Math.round(p.bgl)}`); }
  }
  const call = { dest: opts.dest || sc.dest, sceneTime: opts.scene || 600, responseTime: 200, responseTarget: 240, smooth: 0.9, crashes: 0 };
  const g = grade(p, sc, call);
  return { p, g, trace };
}
const fmt = t => `${String(Math.floor(t / 60)).padStart(2)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function report(label, r) {
  const { p, g } = r;
  const arrest = p.log.find(l => l.type === 'arrest');
  console.log(`  ${label.padEnd(9)} ${g.letter} ${String(g.score).padStart(3)}  ${g.outcome.state.padEnd(5)} ${arrest ? 'arrest@' + fmt(arrest.t) + ' ' + arrest.rhythm : 'no arrest'.padEnd(14)} ROSC ${p.rosc}  end: ${p.rhythm} ${Math.round(p.sys)}/${Math.round(p.dia)} SpO2 ${p.spo2} GCS ${p.gcs.total} brainInj ${p.brainInjury.toFixed(2)}`);
  if (g.errors.length) console.log('            errors: ' + g.errors.map(e => `[${e.sev}] ${e.id}`).join(', '));
  const missed = g.items.filter(i => !i.ok).map(i => i.id); if (missed.length && label !== 'nothing') console.log('            missed: ' + missed.join(', '));
  if (verbose || label === 'nothing' && process.argv.includes('-t')) console.log(r.trace.map(t => '      ' + t).join('\n'));
}

for (const id of Object.keys(SCENARIOS)) {
  if (only && id !== only) continue;
  const P = PLANS[id]; console.log(`\n${id}: ${SCENARIOS[id].title}`);
  report('nothing', run(id, [], { end: 1800 }));
  if (!P) continue;
  const N = 5; let good = 0, alive = 0, sum = 0; let sample;
  for (let s = 1; s <= N; s++) { const r = run(id, P.ideal, { seed: s * 13, end: P.end, smart: P.smart, smartOD: P.smartOD, smartChoke: P.smartChoke, dest: P.dest, scene: P.scene }); sum += r.g.score; if (r.g.outcome.state === 'good') good++; if (r.g.outcome.state !== 'dead') alive++; if (s === 1) sample = r; }
  report('ideal', sample); console.log(`            over ${N} seeds: mean ${Math.round(sum / N)}, good ${good}/${N}, alive ${alive}/${N}`);
  const w = run(id, P.wrong, { end: P.end, dest: P.wrongDest || P.dest }); report('mistake', w); console.log('            (' + P.wrongNote + ')');
}
