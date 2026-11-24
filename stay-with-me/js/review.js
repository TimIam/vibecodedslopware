// The call review: what Dr. Reyes (the medical director) makes of a run. Pure functions over the Patient log.
// grade(p, sc, call) -> { score, letter, items, errors, outcome, clinical, driving }
//   call = { dest, sceneTime, responseTime, responseTarget, smooth (0..1 ride quality with the patient aboard),
//            crashes, transportTime }

import { COMMON, HOSPITALS } from './scenarios.js';

const EPILOGUE = {
  hypo: { good: 'Walt signed a refusal with a steady hand, ate two rounds of toast under Mrs. Okonkwo\'s supervision, and asked whether Medic 14 does bins.', poor: 'Walt was admitted overnight for observation. He was not pleased about the hospital toast.', dead: 'Walt Brennan was pronounced at Halloran General. Mrs. Okonkwo brought his bins in.' },
  stemi: { good: 'Marcus Hale went from your stretcher to the cath lab. Right coronary artery, one stent, 61 minutes from first contact. He filled the statin prescription.', poor: 'Marcus Hale reached a cath lab late. He survived with a damaged right ventricle and a pacemaker.', dead: 'Marcus Hale died in the emergency department. He was 54. His deposition was rescheduled, then cancelled.' },
  anaphylaxis: { good: 'Elena Vasquez was observed for six hours and discharged with two auto-injectors, both in date. The diner has changed its satay.', poor: 'Elena Vasquez spent two nights in intensive care on a ventilator. She went home on the fourth day.', dead: 'Elena Vasquez died of anaphylaxis. She was 34.' },
  motorcycle: { good: 'Devon Mills went to theatre within the hour. He kept the leg. He has asked about the bike eleven times.', poor: 'Devon Mills survived after a massive transfusion. The leg was amputated above the knee.', dead: 'Devon Mills bled to death from injuries that were survivable. He was 27.' },
  arrestGym: { good: 'Greg Sorensen was stented, cooled, and woke on day three asking who won. He walked out of St. Brigid eleven days later. Kayla from the gym was there.', poor: 'Greg Sorensen got his pulse back and never woke up. Life support was withdrawn on day six.', dead: 'Greg Sorensen was pronounced after 38 minutes of resuscitation. His wife was still on her way.' },
  overdose: { good: 'Jess Kowalczyk walked into the ED talking. A peer counsellor sat with her until morning. She went back on the programme.', poor: 'Jess Kowalczyk was admitted with aspiration pneumonia and spent a week on oxygen.', dead: 'Jess Kowalczyk died in room twelve. Her daughter is four.' },
  asthma: { good: 'Naomi Achebe was off oxygen by morning and home in two days, with the brown inhaler and a talk about kittens.', poor: 'Naomi Achebe was intubated in the ED and ventilated for five days.', dead: 'Naomi Achebe died of asthma at nineteen.' },
  seizure: { good: 'Hannah Lindqvist ate a sandwich in the ED, reprogrammed her pump with the diabetes nurse, and ran the half-marathon in the spring.', poor: 'Hannah Lindqvist was admitted with a prolonged post-ictal state and an aspiration.', dead: 'Hannah Lindqvist died of a hypoglycaemic seizure that nobody measured.' },
  stabbing: { good: 'Luis Ortega had a chest drain in the trauma bay and a thoracotomy an hour later. He went home in nine days.', poor: 'Luis Ortega survived surgery after a period of profound shock; his kidneys did not fully recover.', dead: 'Luis Ortega died of a tension pneumothorax and blood loss. He was 31.' },
  stroke: { good: 'Peggy Whitlock was in the scanner eight minutes after arrival and had the clot pulled out within the window. She finished the crossword on the ward. Fourteen across was "aubergine".', poor: 'Peggy Whitlock missed the treatment window. She has not recovered the use of her left side.', dead: 'Peggy Whitlock did not survive the night.' },
  choking: { good: 'Paul Dunmore went to theatre for a formal tracheostomy and woke the next day unable to speak and very much alive. He chews slowly now.', poor: 'Paul Dunmore survived with a hypoxic brain injury. He knows his wife\'s face, some days.', dead: 'Paul Dunmore died at his own dinner table.' },
  hyperk: { good: 'Walt was dialysed that night. Somebody at St. Brigid made a phone call about the transit cut. It was in the paper on Thursday.', poor: 'Walt arrested in the emergency department and was resuscitated. He is in intensive care.', dead: 'Walt Brennan died of a potassium level that three dialysis sessions would have fixed. The dial-a-ride letter was still on his table.' },
  gsw: { good: 'Andre Fenn went straight to theatre with a hole in his right ventricle and a surgeon\'s finger on it. He was extubated two days later. His mother has your unit number.', poor: 'Andre Fenn survived to theatre and died on the table.', dead: 'Andre Fenn died in a supermarket car park, between a carton of milk and his mother\'s car. He was 22.' },
  dee: { good: 'Dee Okafor had a chest drain and a pelvic fixator before midnight. On day two she asked for coffee, tasted it, and said yours was worse.', poor: 'Dee Okafor survived. She will not ride an ambulance again.', dead: 'Deandra Okafor, EMT, 22 years of service, died on Kessler Bridge.' },
};

export function outcome(p, sc) {
  const e = EPILOGUE[sc.id] || {};
  const dead = p.dead || p.arrest;
  let state = 'good';
  if (dead) state = 'dead';
  else if (p.brainInjury > 0.3 || p.flags.cordWorse || p.aspirated > 0.3 || p.heartInjury > 0.5 || p.flags.secondaryInsult > 240 || p.shockTime > 500) state = 'poor';
  else if (p.errors.some(x => x.sev >= 3) && p.errors.filter(x => x.sev >= 3).length >= 2) state = 'poor';
  return { state, text: e[state] || (state === 'dead' ? 'The patient died.' : state === 'poor' ? 'The patient survived with lasting harm.' : 'The patient recovered.') };
}

export function grade(p, sc, call = {}) {
  const items = [];
  for (const r of [...(sc.rubric || []), ...COMMON]) {
    let v = false; try { v = r.test(p, call); } catch { v = false; }
    const f = typeof v === "number" && !Number.isNaN(v) ? Math.max(0, Math.min(1, v)) : (v ? 1 : 0);
    items.push({ id: r.id, text: r.text, pts: r.pts, got: Math.round(r.pts * f), ok: f >= 0.99 });
  }
  const max = items.reduce((s, i) => s + i.pts, 0), got = items.reduce((s, i) => s + i.got, 0);
  let clinical = 100 * got / max;
  const errors = dedupe(p.errors);
  for (const e of errors) clinical -= e.sev >= 3 ? 22 : e.sev === 2 ? 10 : 4;
  // destination
  const destOk = sc.dest === 'either' || !call.dest || call.dest === sc.dest;
  if (!destOk) { clinical -= 12; errors.push({ id: 'dest', sev: 2, t: p.t, text: `Transported to ${HOSPITALS[call.dest]?.name || call.dest}, which cannot treat this. The right destination was ${HOSPITALS[sc.dest].name}.` }); }
  clinical = Math.max(0, Math.min(100, clinical));
  // driving
  let driving = 100;
  if (call.responseTarget) driving -= Math.max(0, Math.min(40, (call.responseTime - call.responseTarget) / call.responseTarget * 80));
  driving -= Math.min(45, (call.crashes || 0) * 15);
  if (call.smooth != null) driving -= (1 - call.smooth) * 30;
  driving = Math.max(0, driving);
  const out = outcome(p, sc);
  let score = clinical * 0.82 + driving * 0.18;
  if (out.state === 'dead') score = Math.min(score, 54);
  else if (out.state === 'poor') score = Math.min(score, 74);
  score = Math.round(score);
  const letter = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  return { score, letter, items, errors, outcome: out, clinical: Math.round(clinical), driving: Math.round(driving), destOk };
}
function dedupe(errs) { const seen = new Map(); for (const e of errs) { if (!seen.has(e.id)) seen.set(e.id, Object.assign({ n: 1 }, e)); else seen.get(e.id).n++; } return [...seen.values()]; }

export const fmtClock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
