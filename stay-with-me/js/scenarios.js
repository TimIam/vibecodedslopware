// The calls. Each scenario is data: who the patient is, what is wrong (conditions.js), what people say, what an
// examination turns up, where they should go, and the rubric the medical director marks the run against.
// Nothing here knows about rendering: `look` is passed to the body builder, `set`/`place` to the world.
//
//   place   : a named place id in the town, or { kind, district } to pick an address
//   set     : interior set id, or 'street' to work where the patient lies in the town
//   pose    : how the patient is found
//   rubric  : [{ id, text, pts, test(p, call) -> true | false | 0..1 }]   (positive credit; errors come from p.errors)
//   dest    : best destination ('regional' has trauma, cath lab and stroke; 'general' is the nearer community ED)
//   alert   : the pre-alert the receiving hospital should get
//   truth   : shown in the debrief: what it was and what good care looks like
//   hints   : partner prompts on the easiest difficulty: [{ when(p, call), say }]

const drug = (p, name) => p.given.filter(g => g.name === name);
const total = (p, name, route) => drug(p, name).filter(g => !route || g.route === route).reduce((s, g) => s + g.amt, 0);
const first = (p, type, f) => { const l = p.log.find(l => l.type === type && (!f || f(l))); return l ? l.t : null; };
const within = (t, lim) => t != null && t <= lim;
const did = (p, type, f) => p.log.some(l => l.type === type && (!f || f(l)));
const drugAt = (p, name) => { const g = p.given.find(g => g.name === name); return g ? g.t : null; };
const primary = p => ['avpu', 'airwayCheck', 'breathingCheck', 'pulseCheck'].every(t => within(first(p, t), 150));
const mins = s => s / 60;

export const HOSPITALS = {
  regional: { id: 'regional', name: 'St. Brigid Regional', caps: ['trauma', 'stemi', 'stroke', 'sepsis', 'arrest', 'medical'] },
  general: { id: 'general', name: 'Halloran General', caps: ['medical', 'sepsis'] },
};
export const ALERTS = { none: 'Routine handover', medical: 'Medical pre-alert', stemi: 'STEMI alert (cath lab)', stroke: 'Stroke alert', trauma: 'Trauma alert', arrest: 'Cardiac arrest / post-ROSC', sepsis: 'Sepsis alert' };

export const SCENARIOS = {
  // =====================================================================================================
  hypo: {
    title: 'Not himself',
    dispatch: { pri: 2, nature: 'Altered mental status', text: 'Medic 14, priority two. 218 Alder Street. Seventy-one-year-old male, neighbour reports he is confused and will not answer properly. History of diabetes.' },
    place: 'brennan', set: 'kitchen', pose: 'sitting', patientOn: 'seat',
    pt: { first: 'Walt', last: 'Brennan', age: 71, sex: 'm', weight: 84, heightM: 1.74, baseline: { hr: 78, map: 98 }, meds: ['insulin'], allergies: ['penicillin'],
      look: { skin: 0.15, hair: { style: 'balding', color: 0xb8b8b8 }, beard: 0.2, build: 0.3, clothing: { top: 'shirt', topColor: 0x6b7a8a, bottom: 'trousers', bottomColor: 0x4a4238, shoes: 'none' } } },
    conditions: [{ type: 'hypoglycaemia', bgl: 31, drift: 0.5, until: 1500 }],
    script: {
      bystander: 'Mrs. Okonkwo (neighbour)',
      opening: [{ who: 'Mrs. Okonkwo', say: 'He was supposed to bring my bins in. I found him like this. He keeps saying the kettle is on.' }, { who: 'Walt', say: 'Kettle... kettle\'s on. Who let you in.' }],
      history: {
        what: { pt: 'Kettle\'s on. \'M fine. Go away.', by: 'He\'s diabetic, I know that much. He injects. He was fine yesterday at four.' },
        allergies: { by: 'Penicillin. He told me the story about the rash at least nine times.' },
        meds: { by: 'Insulin, in the fridge door. And something for his blood pressure.' },
        past: { by: 'Diabetes. His kidneys are not good. His wife, Ruth, passed two winters ago.' },
        last: { by: 'There\'s a bowl of cereal poured on the side but no milk in it. I don\'t think he ate.' },
        events: { by: 'I think he took his morning insulin and then forgot breakfast. He does that since Ruth.' },
      },
      sceneClues: 'An insulin pen on the counter with the cap off. A bowl of dry cereal. A calendar with "DIALYSIS M-W-F" written in a woman\'s handwriting, the newest months blank.',
      after: [{ when: p => p.bgl > 75 && p.brain > 0.85, who: 'Walt', say: 'Oh, for... I did it again, didn\'t I. Ruth would have had my hide. You\'re new. Where\'s Ray?' }],
    },
    hints: [
      { when: p => p.t > 25 && !did(p, 'bgl'), say: 'Confused diabetic, Rook. What\'s the one number you want before anything else?' },
      { when: p => did(p, 'bgl') && p.bgl < 60 && p.t > 90 && !drug(p, 'dextrose').length && !drug(p, 'glucagon').length, say: 'He can\'t swallow safe like that. Gel\'s out. You need a line and D10, or glucagon in the thigh.' },
    ],
    dest: 'either', alert: 'none', sceneTarget: 900,
    truth: 'Hypoglycaemia: insulin taken, breakfast forgotten. A sugar of 31 looks like a stroke, a drunk or dementia until someone checks. He could not swallow safely, so the fix is IV dextrose titrated to effect (or IM glucagon without a line), never gel in the mouth.',
    rubric: [
      { id: 'bgl', text: 'Checked a blood glucose within 3 minutes', pts: 20, test: p => within(first(p, 'bgl'), 180) },
      { id: 'treat', text: 'Corrected the glucose by a safe route (IV dextrose or IM glucagon)', pts: 30, test: p => total(p, 'dextrose') >= 8 || total(p, 'glucagon') >= 0.9 },
      { id: 'titrate', text: 'Titrated dextrose rather than dumping the whole bag', pts: 10, test: p => total(p, 'dextrose') <= 20.5 && p.bgl < 260 },
      { id: 'recheck', text: 'Rechecked the glucose after treatment', pts: 10, test: p => p.log.filter(l => l.type === 'bgl').length >= 2 },
      { id: 'awake', text: 'Patient awake and orientated at handover', pts: 20, test: p => p.brain > 0.85 },
      { id: 'hx', text: 'Asked about allergies and medications', pts: 10, test: p => did(p, 'history', l => l.q === 'allergies') && did(p, 'history', l => l.q === 'meds') },
    ],
  },

  // =====================================================================================================
  stemi: {
    title: 'Elephant',
    dispatch: { pri: 1, nature: 'Chest pain', text: 'Medic 14, priority one. Courthouse annex, third floor. Fifty-four-year-old male, chest pain, sweating, conscious and breathing.' },
    place: 'courthouse', set: 'office', pose: 'sitting', patientOn: 'seat',
    pt: { first: 'Marcus', last: 'Hale', age: 54, sex: 'm', weight: 96, heightM: 1.80, baseline: { hr: 70, map: 96 }, meds: [], allergies: [],
      look: { skin: 0.75, hair: { style: 'buzz', color: 0x1a1a1a }, beard: 0.5, build: 0.5, clothing: { top: 'shirt', topColor: 0xdfe6ee, bottom: 'trousers', bottomColor: 0x23262e, shoes: 'boots' } } },
    conditions: [{ type: 'mi', territory: 'inferior', rv: true, sev: 0.62, vfRisk: 0.00016, pain: 8 }],
    script: {
      bystander: 'Priya (colleague)',
      opening: [{ who: 'Marcus', say: 'It\'s like somebody parked on my chest. It\'s going into my jaw. I thought it was the burrito.' }],
      painWords: 'Heavy, crushing, centre of the chest into the jaw and left arm. Started 40 minutes ago at rest. Nothing makes it better.',
      history: {
        what: { pt: 'Forty minutes. I was just sitting in a deposition. I feel like I\'m going to be sick.', by: 'He went grey and started sweating through his shirt.' },
        allergies: { pt: 'None.' },
        meds: { pt: 'Nothing regular. My doctor wanted me on a statin. I didn\'t fill it.' },
        past: { pt: 'High blood pressure, they said. My dad died of a heart attack at fifty-six.' },
        last: { pt: 'Lunch, a couple of hours ago.' },
        events: { pt: 'Nothing. I was sitting down.' },
        pde5: { pt: 'Viagra? No. God, no. Why?' },
      },
      sceneClues: 'A half-eaten burrito. An untouched antacid packet. His jacket over the chair, soaked at the collar.',
    },
    hints: [
      { when: p => p.t > 150 && !did(p, '12lead'), say: 'Chest pain like that gets a 12-lead before it gets anything else. First ten minutes.' },
      { when: p => did(p, '12lead') && !drug(p, 'nitroglycerin').length && p.t < 600, say: 'Look at V1 and the inferior leads before you reach for the nitro. Right-sided hearts live on preload.' },
      { when: p => did(p, '12lead') && !drug(p, 'aspirin').length && p.t > 240, say: 'Aspirin, Rook. Cheapest life-saver on the truck.' },
    ],
    dest: 'regional', alert: 'stemi', sceneTarget: 900,
    truth: 'Inferior STEMI with right-ventricular involvement (ST elevation in II, III, aVF with III > II and ST elevation in V1). Aspirin, a 12-lead within ten minutes, a STEMI alert and the cath lab at St. Brigid. Nitroglycerin is the trap: an infarcting right ventricle depends on preload, and nitrate takes it away. Halloran General cannot open the artery.',
    rubric: [
      { id: 'primary', text: 'Primary survey in the first two minutes', pts: 8, test: primary },
      { id: '12', text: '12-lead ECG within 10 minutes of patient contact', pts: 20, test: p => within(first(p, '12lead'), 600) },
      { id: 'asa', text: 'Aspirin 324 mg', pts: 18, test: p => total(p, 'aspirin') >= 300 },
      { id: 'noNtg', text: 'Withheld nitroglycerin in a right-ventricular infarct', pts: 14, test: p => total(p, 'nitroglycerin') === 0 },
      { id: 'iv', text: 'IV access', pts: 8, test: p => p.tx.iv.length > 0 },
      { id: 'pain', text: 'Treated the pain without dropping the pressure', pts: 8, test: p => (total(p, 'fentanyl') > 0 || total(p, 'morphine') > 0) && p.sys > 88 },
      { id: 'alert', text: 'STEMI alert to the cath-lab hospital', pts: 16, test: (p, c) => p.alerted?.kind === 'stemi' && c.dest === 'regional' },
      { id: 'pads', text: 'Monitored continuously (ready for an arrest)', pts: 8, test: p => p.tx.mon.ecg },
    ],
  },

  // =====================================================================================================
  anaphylaxis: {
    title: 'Table nine',
    dispatch: { pri: 1, nature: 'Allergic reaction', text: 'Medic 14, priority one. Harbor Lights Diner. Thirty-four-year-old female, allergic reaction, difficulty breathing. Caller states she has used her own auto-injector.' },
    place: 'harbor', set: 'diner', pose: 'sitting', patientOn: 'seat',
    pt: { first: 'Elena', last: 'Vasquez', age: 34, sex: 'f', weight: 63, heightM: 1.65, baseline: { hr: 76, map: 88 }, meds: [], allergies: ['peanut'],
      look: { skin: 0.4, hair: { style: 'long', color: 0x2a1a12 }, build: 0.3, clothing: { top: 'blouse', topColor: 0x7a2f3a, bottom: 'jeans', bottomColor: 0x2c3a52, shoes: 'trainers' } } },
    conditions: [{ type: 'anaphylaxis', sev: 0.9, start: 0.5, airway: false, biphasic: false }],
    script: {
      bystander: 'Tomás (husband)',
      opening: [{ who: 'Tomás', say: 'Satay. They swore there was no peanut. She used the pen but it was the old one from the glovebox.' }, { who: 'Elena', say: 'Can\'t... throat\'s... tight.' }],
      history: {
        what: { pt: 'Peanut. Throat. Can\'t.', by: 'About eight minutes ago. Her lips went first, then the hives, then the wheezing.' },
        allergies: { by: 'Peanuts. Badly. She was in intensive care at nineteen.' },
        meds: { by: 'Just the pen. That one expired last year, I checked after.' },
        past: { by: 'Asthma as a kid.' },
        last: { by: 'The satay. Two bites.' },
        events: { by: 'She said her mouth was tingling and then she couldn\'t stop coughing.' },
      },
      sceneClues: 'An auto-injector on the table: expiry date fourteen months ago, the window cloudy brown. A plate of satay, two skewers eaten.',
    },
    hints: [
      { when: p => p.t > 45 && !drug(p, 'epinephrine').length, say: 'Hives, wheeze and a dropping pressure. Epi. In the thigh. The one-in-a-thousand, a third to half a mil. Not the syringe.' },
      { when: p => drug(p, 'epinephrine').length === 1 && p.t - drugAt(p, 'epinephrine') > 330 && p.sys < 92, say: 'Five minutes and she\'s still soft. Second dose.' },
    ],
    dest: 'either', alert: 'medical', sceneTarget: 780,
    truth: 'Anaphylaxis to peanut with shock and bronchospasm; her own auto-injector was expired and did little. Intramuscular epinephrine 0.3-0.5 mg of the 1 mg/mL strength in the lateral thigh, repeated at five minutes, with oxygen, fluids for the pressure and a nebuliser for the wheeze. The arrest syringe (0.1 mg/mL, 10 mL) given IV to someone with a pulse is a classic fatal error.',
    rubric: [
      { id: 'epi', text: 'IM epinephrine within 2 minutes of contact', pts: 30, test: p => within(first(p, 'drug', l => l.name === 'epinephrine' && l.route === 'IM' && l.amt >= 0.25 && l.amt <= 0.55), 150) },
      { id: 'dose', text: 'Correct dose and route every time (0.3-0.5 mg IM)', pts: 14, test: p => drug(p, 'epinephrine').length > 0 && drug(p, 'epinephrine').every(g => (g.route === 'IM' && g.amt >= 0.25 && g.amt <= 0.55) || (g.route === 'NEB')) },
      { id: 'repeat', text: 'Repeated epinephrine when the first dose was not enough', pts: 12, test: p => drug(p, 'epinephrine').filter(g => g.route === 'IM').length >= 2 || p.sys > 95 },
      { id: 'o2', text: 'High-flow oxygen', pts: 8, test: p => did(p, 'o2', l => l.device === 'nrb') },
      { id: 'fluid', text: 'IV access and a fluid bolus for the hypotension', pts: 12, test: p => (p.fluidsGiven || 0) >= 400 },
      { id: 'neb', text: 'Nebulised albuterol for the wheeze', pts: 8, test: p => total(p, 'albuterol') > 0 },
      { id: 'adj', text: 'Antihistamine / steroid only after epinephrine', pts: 6, test: p => { const e = drugAt(p, 'epinephrine'), a = drugAt(p, 'diphenhydramine') ?? drugAt(p, 'methylpred'); return a == null || (e != null && e < a); } },
      { id: 'out', text: 'Pressure and airway restored at handover', pts: 10, test: p => p.sys > 95 && p.spo2 > 93 },
    ],
  },

  // =====================================================================================================
  motorcycle: {
    title: 'Low side',
    dispatch: { pri: 1, nature: 'Motor vehicle collision', text: 'Medic 14, priority one. Motorcycle versus car. Rider is down in the roadway, conscious, heavy bleeding reported. PD is on scene.' },
    place: { kind: 'road', cls: 'arterial' }, set: 'street', pose: 'supine', props: ['bikeDown', 'carStopped', 'police'],
    pt: { first: 'Devon', last: 'Mills', age: 27, sex: 'm', weight: 78, heightM: 1.81, baseline: { hr: 66, map: 92 }, meds: [], allergies: [],
      look: { skin: 0.25, hair: { style: 'short', color: 0x4a3420 }, beard: 0.4, build: 0.6, clothing: { top: 'jacket', topColor: 0x18181a, bottom: 'jeans', bottomColor: 0x25344d, shoes: 'boots' } } },
    conditions: [
      { type: 'hemorrhage', sites: [
        { id: 'femR', label: 'right thigh (open femur fracture)', region: 'legR', rate: 260, ext: true, arterial: true, fix: { tq: 'legR', pressure: true }, pain: 9 },
        { id: 'pelvis', label: 'pelvis', region: 'pelvis', rate: 95, ext: false, fix: { binder: true }, pain: 8 },
      ] },
      { type: 'fracture', where: 'legR', pain: 9, find: { pelvis: 'pain on gentle compression: do not spring it again', legs: 'right thigh grossly deformed, bone visible in a 10 cm wound, pulsatile bleeding; foot pale' } },
    ],
    script: {
      bystander: 'Officer Tran',
      opening: [{ who: 'Officer Tran', say: 'Car pulled out, he laid it down at maybe forty. He was talking when I got here. That leg is bad.' }, { who: 'Devon', say: 'My leg. Oh God, my leg. Is my bike okay?' }],
      painWords: 'Screaming about his right leg and his hips.',
      history: {
        what: { pt: 'Car pulled out. I couldn\'t... my leg. I can\'t feel my foot right.', by: 'Thrown about six metres. Helmet stayed on. No loss of consciousness that I saw.' },
        allergies: { pt: 'No.' }, meds: { pt: 'Nothing.' }, past: { pt: 'Nothing. I\'m healthy.' }, last: { pt: 'Coffee. An hour ago.' },
        events: { pt: 'I remember all of it. I remember the bumper.' },
      },
      findings: [
        { on: 'legs', hidden: 'clothes', text: 'Right thigh: open mid-shaft femur fracture, a pulsing arterial bleed soaking the jeans.', wound: { anchor: 'thighR', kind: 'laceration', size: 0.1, bleed: 'femR' } },
        { on: 'legs', hidden: 'clothes', text: 'Pelvis: bruising over the right iliac crest.', wound: { anchor: 'pelvisR', kind: 'bruise', size: 0.12 } },
        { on: 'back', text: 'Back: road rash across both shoulder blades, no spinal step or tenderness.', wound: { anchor: 'backUpper', kind: 'abrasion', size: 0.2 } },
      ],
      sceneClues: 'A motorcycle on its side, forks bent. A dented quarter panel on a sedan. A dark trail from the bike to where he lies.',
    },
    hints: [
      { when: p => p.t > 25 && !p.tx.tq.legR, say: 'That\'s arterial. Tourniquet, high and tight, before anything else. Airway can wait ten seconds for that.' },
      { when: p => p.tx.tq.legR && p.t > 150 && !p.tx.binder, say: 'Mechanism like that, hips hurting: bind the pelvis.' },
      { when: p => (p.fluidsGiven || 0) > 600 && p.sys > 100, say: 'Easy on the saline. Ninety systolic and a radial pulse is plenty until a surgeon has him.' },
    ],
    dest: 'regional', alert: 'trauma', sceneTarget: 780,
    truth: 'Open femur fracture with arterial bleeding and a pelvic ring injury. Catastrophic bleeding first: a tourniquet high on the thigh within the first minute, then a pelvic binder, tranexamic acid, and only enough fluid to keep a radial pulse (permissive hypotension: chasing a normal pressure washes the clots away). Ten minutes on scene, trauma alert, St. Brigid.',
    rubric: [
      { id: 'tq', text: 'Tourniquet on the bleeding leg within 90 seconds', pts: 26, test: p => within(first(p, 'tourniquet', l => l.limb === 'legR'), 110) && p.tx.tq.legR?.q > 0.85 },
      { id: 'cspine', text: 'Cervical spine protected', pts: 6, test: p => p.tx.collar },
      { id: 'expose', text: 'Exposed and examined the patient, including the back', pts: 8, test: p => did(p, 'logRoll') && (p.exposed?.legs || p.exposedAll) },
      { id: 'binder', text: 'Pelvic binder', pts: 14, test: p => p.tx.binder },
      { id: 'txa', text: 'Tranexamic acid 1 g', pts: 10, test: p => total(p, 'txa') >= 0.9 },
      { id: 'permissive', text: 'Permissive hypotension: no clot blown off by over-resuscitation', pts: 12, test: p => !p.errors.some(e => e.id === 'popClot') && (p.fluidsGiven || 0) <= 1000 },
      { id: 'analgesia', text: 'Analgesia for a patient in agony', pts: 8, test: p => total(p, 'fentanyl') > 0 || total(p, 'ketamine') > 0 || total(p, 'morphine') > 0 },
      { id: 'alert', text: 'Trauma alert to the trauma centre', pts: 10, test: (p, c) => p.alerted?.kind === 'trauma' && c.dest === 'regional' },
      { id: 'time', text: 'On scene less than 13 minutes', pts: 6, test: (p, c) => c.sceneTime < 800 },
    ],
  },

  // =====================================================================================================
  arrestGym: {
    title: 'Treadmill six',
    dispatch: { pri: 1, nature: 'Cardiac arrest', text: 'Medic 14, priority one, cardiac arrest. Ironworks Gym. Forty-nine-year-old male collapsed on a treadmill. Staff are doing CPR. Engine 4 is not available.' },
    place: 'ironworks', set: 'gym', pose: 'supine', patientOn: 'floor', bystanderCPR: true, noBackup: true,
    pt: { first: 'Greg', last: 'Sorensen', age: 49, sex: 'm', weight: 88, heightM: 1.83, baseline: { hr: 62, map: 94 }, meds: [], allergies: [],
      look: { skin: 0.1, hair: { style: 'short', color: 0x8a7a60 }, build: 0.7, clothing: { top: 'tshirt', topColor: 0x3c4a5c, bottom: 'shorts', bottomColor: 0x15161a, shoes: 'trainers' } } },
    conditions: [{ type: 'cardiacArrest', rhythm: 'vf', downtime: 300, bystanderCPR: true, cause: 'cardiac' }, { type: 'mi', territory: 'anterior', sev: 0.6, vfRisk: 0.0002, brady: false }],
    script: {
      bystander: 'Kayla (gym staff)',
      opening: [{ who: 'Kayla', say: 'He just went down, face first. He wasn\'t breathing right, like snoring. I did the class last year, I\'ve been pushing since. Our AED\'s battery is dead, I\'m so sorry.' }],
      history: {
        what: { by: 'Five minutes? Six? He was doing intervals. He grabbed the rail and dropped.' },
        allergies: { by: 'I don\'t know. I don\'t know him, he comes in mornings.' }, meds: { by: 'No idea.' },
        past: { by: 'His wife\'s on the membership. I can call her.' }, events: { by: 'No warning. He was laughing at the TV.' },
      },
      sceneClues: 'An AED cabinet on the wall, door open, the unit\'s status light red. A treadmill still running.',
      after: [{ when: p => p.rosc && !p.arrest && p.brain > 0.3, who: 'Greg', say: '(a groan, then a cough against the airway)' }],
    },
    hints: [
      { when: p => p.t > 20 && !p.tx.mon.pads, say: 'I\'ve got the chest. Get the pads on, I want to know what we\'re shocking.' },
      { when: p => p.defib.shocks >= 2 && !drug(p, 'epinephrine').length, say: 'Two shocks down. Line or IO, then epi, the big syringe, every other cycle.' },
      { when: p => p.defib.shocks >= 3 && !drug(p, 'amiodarone').length, say: 'Still fibrillating after three. Amiodarone, three hundred.' },
      { when: p => p.rosc && !p.arrest && !did(p, '12lead'), say: 'We\'ve got him back. Twelve-lead. I want to know why he went down.' },
    ],
    dest: 'regional', alert: 'arrest', sceneTarget: 1500,
    truth: 'Ventricular fibrillation from an anterior myocardial infarction, with good bystander CPR. What saves him: compressions that never stop for more than a few seconds, a shock every two minutes while the rhythm is shockable, epinephrine after the second shock, amiodarone after the third, and oxygenated ventilation that is slow rather than frantic. After the pulse returns: a 12-lead, and the cath lab.',
    rubric: [
      { id: 'cpr10', text: 'Compressions continued within 10 seconds of arrival', pts: 10, test: p => within(first(p, 'cprStart'), 25) },
      { id: 'shock1', text: 'First shock within 2 minutes', pts: 18, test: p => within(first(p, 'shock'), 150) },
      { id: 'handsoff', text: 'Hands-off time kept short', pts: 14, test: p => p.tx.cpr.handsOff < 0.2 * Math.max(60, (p.roscAt ?? p.t) - (first(p, 'cprStart') || 0)) },
      { id: 'airway', text: 'Airway secured and ventilated with oxygen', pts: 10, test: p => (p.tx.adjunct === 'igel' || did(p, 'igel')) && p.tx.vent.o2 },
      { id: 'epi', text: 'Epinephrine 1 mg IV/IO at the right time', pts: 10, test: p => { const g = drug(p, 'epinephrine').filter(g => (g.route === 'IV' || g.route === 'IO') && g.amt >= 0.9 && g.amt <= 1.1); return g.length > 0 || (p.rosc > 0 && p.defib.shocks <= 2); } },
      { id: 'amio', text: 'Amiodarone 300 mg for refractory VF', pts: 8, test: p => total(p, 'amiodarone') >= 290 || p.defib.shocks <= 3 },
      { id: 'noBad', text: 'No shocks into a non-shockable rhythm', pts: 6, test: p => !p.errors.some(e => e.id === 'shockNonShockable') },
      { id: 'rosc', text: 'Return of spontaneous circulation', pts: 14, test: p => p.rosc > 0 && !p.arrest },
      { id: 'post', text: 'Post-ROSC: 12-lead and a cath-lab destination', pts: 10, test: (p, c) => p.rosc > 0 && did(p, '12lead') && c.dest === 'regional' },
    ],
  },

  // =====================================================================================================
  overdose: {
    title: 'Room 12',
    dispatch: { pri: 1, nature: 'Overdose / unconscious', text: 'Medic 14, priority one. Starlite Motel, room twelve. Caller states her friend is blue and will not wake up. Caller is hysterical. No PD available, stage at your discretion.' },
    place: 'motel', set: 'motelRoom', pose: 'supine', patientOn: 'floor',
    pt: { first: 'Jess', last: 'Kowalczyk', age: 26, sex: 'f', weight: 54, heightM: 1.68, baseline: { hr: 74, map: 84 }, meds: ['opioidTolerant'], allergies: [],
      look: { skin: 0.08, hair: { style: 'bun', color: 0x6a4a2a }, build: 0.15, clothing: { top: 'hoodie', topColor: 0x4a4a55, bottom: 'jeans', bottomColor: 0x1e2636, shoes: 'none' } } },
    conditions: [{ type: 'opioidOD', dose: 118, dependent: true }],
    init(p) { p.sao2 = 0.8; p.spo2Lag = 0.8; p.pAO2 = 48; p.pCO2 = 64; p.rr = 4; p.brain = 0.2; },
    script: {
      bystander: 'Amber (friend)',
      opening: [{ who: 'Amber', say: 'She said it was the same stuff as always! She did hers and she just slid off the bed. Please. Please. She\'s got a little girl.' }],
      history: {
        what: { by: 'Ten minutes. Maybe fifteen. I couldn\'t find my phone.' }, allergies: { by: 'I don\'t know.' },
        meds: { by: 'She\'s on the methadone programme. Was. She missed a week.' }, past: { by: 'She\'s been clean since March. Until tonight.' },
        events: { by: 'It was a different colour. Kind of blue. I didn\'t do mine.' },
      },
      findings: [{ on: 'arms', text: 'Left antecubital fossa: a fresh puncture with a bead of blood, older track marks.', wound: { anchor: 'acfL', kind: 'needleMark', size: 0.01 } }],
      sceneClues: 'An uncapped syringe on the carpet by her hand: mind your knees. A spoon, a lighter, a torn blue-tinted baggie. A child\'s drawing taped to the mirror.',
      after: [{ when: p => p.brain > 0.7 && p.withdrawal < 0.2, who: 'Jess', say: 'Wha... no. No no no. Did Amber call you? Is Maddie okay?' }, { when: p => p.withdrawal > 0.3, who: 'Jess', say: 'Get OFF me! What did you give me? I\'m gonna be sick...' }],
    },
    hints: [
      { when: p => p.t > 15 && !p.tx.vent.on && p.rr < 6, say: 'She\'s blue, Rook. Narcan doesn\'t put oxygen in her. Bag her first.' },
      { when: p => p.tx.vent.on && !p.tx.vent.o2 && p.t > 40, say: 'That bag isn\'t plugged into anything.' },
      { when: p => p.tx.vent.on && !drug(p, 'naloxone').length && p.t > 90, say: 'Now the Narcan. Point four at a time. We want her breathing, not swinging.' },
    ],
    dest: 'either', alert: 'medical', sceneTarget: 840,
    truth: 'Opioid overdose (fentanyl-contaminated heroin) in a dependent patient: respiratory arrest with a pulse. The treatment for not breathing is breathing: open the airway and ventilate with oxygen, then naloxone in small steps (0.4 mg) titrated to a respiratory rate, not to waking her up. A 2-4 mg slug produces instant withdrawal: vomiting, an unprotected airway, and a patient fighting her way out the door before it wears off.',
    rubric: [
      { id: 'safety', text: 'Looked at the scene before kneeling in it', pts: 6, test: p => within(first(p, 'sceneLook'), 60) },
      { id: 'vent', text: 'Ventilated within 60 seconds', pts: 24, test: p => within(first(p, 'bvm'), 75) },
      { id: 'o2', text: 'Oxygen connected to the bag', pts: 8, test: p => p.tx.vent.o2 || did(p, 'bvmO2') || did(p, 'bvm', l => l.o2) },
      { id: 'airway', text: 'Airway adjunct or manoeuvre used', pts: 8, test: p => did(p, 'npa') || did(p, 'opa') || did(p, 'manoeuvre') },
      { id: 'nal', text: 'Naloxone given', pts: 16, test: p => total(p, 'naloxone') > 0 },
      { id: 'titrate', text: 'Titrated naloxone: no precipitated withdrawal', pts: 16, test: p => total(p, 'naloxone') > 0 && !p.errors.some(e => e.id === 'withdrawal') },
      { id: 'noAsp', text: 'No aspiration', pts: 10, test: p => p.aspirated < 0.1 },
      { id: 'out', text: 'Breathing adequately at handover', pts: 12, test: p => p.rr >= 9 && p.spo2 >= 93 },
    ],
  },

  // =====================================================================================================
  asthma: {
    title: 'Blue inhaler',
    dispatch: { pri: 1, nature: 'Difficulty breathing', text: 'Medic 14, priority one. Riverview Towers, apartment 9C. Nineteen-year-old female, asthma attack, mother states the inhaler is not working and she cannot talk.' },
    place: 'riverview', set: 'bedroom', pose: 'sitting', patientOn: 'bed',
    pt: { first: 'Naomi', last: 'Achebe', age: 19, sex: 'f', weight: 58, heightM: 1.66, baseline: { hr: 80, map: 86, rr: 16 }, meds: [], allergies: [],
      look: { skin: 0.85, hair: { style: 'curly', color: 0x14100e }, build: 0.2, clothing: { top: 'tshirt', topColor: 0xc9b458, bottom: 'shorts', bottomColor: 0x3a3a44, shoes: 'none' } } },
    conditions: [{ type: 'asthma', sev: 0.8, trend: 0.02, response: 0.8, fatigue: 0.35 }],
    script: {
      bystander: 'Mrs. Achebe (mother)',
      opening: [{ who: 'Mrs. Achebe', say: 'She has had twenty puffs. Twenty! It has never been like this. She was in the ICU when she was twelve, on the machine.' }, { who: 'Naomi', say: '(shakes her head, holds up the inhaler, cannot speak)' }],
      history: {
        what: { by: 'Since the afternoon. It got worse and worse and now she will not answer me.' }, allergies: { by: 'Cats. Dust. No medicines.' },
        meds: { by: 'The blue one and the brown one. She stopped the brown one. She said it was expensive.' }, past: { by: 'Asthma since she was three. Intubated once, at twelve.' },
        last: { by: 'She has not eaten today.' }, events: { by: 'Her roommate got a kitten on Sunday.' },
      },
      sceneClues: 'An empty blue inhaler on the duvet. A spacer on the floor. A litter tray by the door.',
      after: [{ when: p => (p.bronchoNow || 1) < 0.4, who: 'Naomi', say: 'That\'s... better. That\'s so much better. Thank you. Mum, stop crying.' }],
    },
    hints: [
      { when: p => p.t > 30 && !total(p, 'albuterol'), say: 'Neb. Albuterol and ipratropium together, on oxygen, now. Don\'t lie her down.' },
      { when: p => p.t > 150 && !drug(p, 'epinephrine').length && (p.bronchoNow || 0) > 0.6, say: 'She\'s not moving any air, the neb can\'t get in. IM epi, Rook.' },
      { when: p => p.tx.vent.on && p.tx.vent.rate > 12, say: 'Slow! Slow down! She can\'t get it back out. Eight a minute, let her chest fall.' },
    ],
    dest: 'either', alert: 'medical', sceneTarget: 780,
    truth: 'Life-threatening asthma: silent chest, exhaustion, saturations in the eighties. Back-to-back albuterol with ipratropium on oxygen, sitting up; IM epinephrine when no air is moving; IV magnesium over ten minutes; a steroid. If she tires and has to be bagged: slowly (6-8 a minute) with a long expiratory time. Bagging an asthmatic fast stacks breaths until the chest is so full the heart cannot fill.',
    rubric: [
      { id: 'neb', text: 'Nebulised albuterol within 2 minutes', pts: 20, test: p => within(drugAt(p, 'albuterol'), 150) },
      { id: 'ipra', text: 'Ipratropium added', pts: 6, test: p => total(p, 'ipratropium') > 0 },
      { id: 'pos', text: 'Kept her sitting up', pts: 6, test: p => !did(p, 'position', l => l.pos === 'supine') || p.arrest },
      { id: 'epi', text: 'IM epinephrine for a silent chest', pts: 16, test: p => drug(p, 'epinephrine').some(g => g.route === 'IM' && g.amt >= 0.25 && g.amt <= 0.55) },
      { id: 'mag', text: 'Magnesium 2 g as an infusion', pts: 12, test: p => drug(p, 'magnesium').some(g => g.route === 'INF' && g.amt >= 1.5) },
      { id: 'steroid', text: 'Steroid given', pts: 4, test: p => total(p, 'methylpred') > 0 },
      { id: 'noStack', text: 'No breath-stacking if ventilated', pts: 12, test: p => p.hyperinfl < 0.25 },
      { id: 'cap', text: 'Capnography on', pts: 6, test: p => p.tx.mon.cap },
      { id: 'out', text: 'Moving air and saturating above 92% at handover', pts: 18, test: p => !p.arrest && p.spo2 >= 92 && (p.bronchoNow || 0) < 0.55 },
    ],
  },

  // =====================================================================================================
  seizure: {
    title: 'Every seizure',
    dispatch: { pri: 1, nature: 'Seizure', text: 'Medic 14, priority one. 77 Birch Court, upstairs landing. Twenty-three-year-old female, seizure, ongoing more than five minutes. Roommate on scene.' },
    place: { kind: 'apartment' }, set: 'stairwell', pose: 'supine', patientOn: 'floor',
    pt: { first: 'Hannah', last: 'Lindqvist', age: 23, sex: 'f', weight: 61, heightM: 1.70, baseline: { hr: 72, map: 85 }, meds: ['insulin'], allergies: [],
      look: { skin: 0.05, hair: { style: 'long', color: 0xc9a868 }, build: 0.25, clothing: { top: 'tshirt', topColor: 0x8a9aa8, bottom: 'shorts', bottomColor: 0x2a2a30, shoes: 'trainers' } } },
    conditions: [{ type: 'hypoglycaemia', bgl: 19, drift: 0.2, until: 3000 }, { type: 'seizure', cause: 'hypoglycaemia', status: true }],
    script: {
      bystander: 'Cole (roommate)',
      opening: [{ who: 'Cole', say: 'She came back from a run and just dropped on the stairs. She\'s been shaking the whole time. I didn\'t know what to do so I put a pillow under her head.' }],
      history: {
        what: { by: 'Seven, eight minutes now. She hasn\'t stopped.' }, allergies: { by: 'I don\'t think so.' },
        meds: { by: 'She\'s got a pump thing. For diabetes. On her stomach.' }, past: { by: 'Type one diabetes. She\'s never had a seizure, not since I\'ve known her.' },
        last: { by: 'She skipped dinner to go running. She\'s training for the half.' }, events: { by: 'She said she felt shaky on the last hill. She texted me that.' },
      },
      findings: [{ on: 'abdomen', hidden: 'clothes', text: 'An insulin pump clipped to her waistband, cannula in the left abdomen.' }],
      sceneClues: 'Running shoes, a phone with a fitness app still counting. An insulin pump clipped to her waistband.',
      after: [{ when: p => p.brain > 0.8 && !p.seizing, who: 'Hannah', say: 'Why am I on the stairs? Oh no. Cole, did I... I didn\'t bolus down for the run. I\'m so stupid.' }],
    },
    hints: [
      { when: p => p.t > 30 && !did(p, 'bgl'), say: 'Every seizure gets a sugar. Every single one.' },
      { when: p => did(p, 'bgl') && p.bgl < 60 && p.t > 110 && !total(p, 'dextrose') && !total(p, 'glucagon'), say: 'Versed won\'t hold a brain that\'s out of fuel. Sugar. Line and D10, or glucagon.' },
    ],
    dest: 'either', alert: 'medical', sceneTarget: 840,
    truth: 'A hypoglycaemic seizure in a type 1 diabetic who ran on an insulin pump without eating. Midazolam will stop the convulsion for a minute or two, and it will come straight back, because the brain has no glucose. Protect the airway (a nasal airway: the jaw is clenched), oxygen, check a glucose in every seizing patient, and give dextrose (or IM glucagon while you get a line).',
    rubric: [
      { id: 'airway', text: 'Airway and oxygen during the seizure', pts: 14, test: p => (did(p, 'npa') || did(p, 'manoeuvre') || did(p, 'recovery')) && did(p, 'o2') },
      { id: 'noOpa', text: 'Did not force anything between clenched teeth', pts: 6, test: p => !did(p, 'opa') && !did(p, 'igel') },
      { id: 'bgl', text: 'Glucose checked within 3 minutes', pts: 24, test: p => within(first(p, 'bgl'), 180) },
      { id: 'sugar', text: 'Glucose corrected', pts: 26, test: p => total(p, 'dextrose') >= 10 || total(p, 'glucagon') >= 0.9 },
      { id: 'benzo', text: 'Appropriate benzodiazepine dose if used (not stacked)', pts: 8, test: p => total(p, 'midazolam') <= 12 },
      { id: 'breathing', text: 'Breathing supported if it was depressed', pts: 8, test: p => p.spo2 >= 90 },
      { id: 'out', text: 'Seizure-free and waking at handover', pts: 14, test: p => !p.seizing && p.bgl > 70 },
    ],
  },

  // =====================================================================================================
  stabbing: {
    title: 'Behind The Anchor',
    dispatch: { pri: 1, nature: 'Stabbing', text: 'Medic 14, priority one. The Anchor bar, rear lot. Thirty-one-year-old male stabbed in the chest. PD advises scene is secure, suspect has fled.' },
    place: 'anchor', set: 'street', pose: 'semi', props: ['police', 'wall'],
    pt: { first: 'Luis', last: 'Ortega', age: 31, sex: 'm', weight: 82, heightM: 1.76, baseline: { hr: 74, map: 92 }, meds: [], allergies: [],
      look: { skin: 0.5, hair: { style: 'short', color: 0x121212 }, beard: 0.6, build: 0.55, clothing: { top: 'tshirt', topColor: 0x8f8f8f, bottom: 'jeans', bottomColor: 0x1d2433, shoes: 'boots' } } },
    conditions: [
      { type: 'tensionPneumo', side: 'L', sev: 0.3, rate: 0.085, open: true },
      { type: 'haemothorax', side: 'L', rate: 22, vol: 150 },
      { type: 'hemorrhage', sites: [{ id: 'backStab', label: 'second stab wound, left flank', region: 'back', rate: 55, ext: true, fix: { pressure: true, pack: true }, pain: 6 }] },
      { type: 'alcohol', sed: 0.12 },
    ],
    script: {
      bystander: 'Officer Tran',
      opening: [{ who: 'Luis', say: 'I can\'t... I can\'t get a breath. He just came up behind me. Am I gonna die?' }, { who: 'Officer Tran', say: 'One wound that I can see, left side. Knife was a kitchen knife, maybe fifteen centimetres. It\'s in an evidence bag.' }],
      painWords: 'Sharp, left side of the chest, worse on breathing in.',
      history: {
        what: { pt: 'Felt like a punch. Then I couldn\'t breathe.', by: 'About ten minutes ago. Witnesses say two swings.' },
        allergies: { pt: 'No.' }, meds: { pt: 'No.' }, past: { pt: 'Nothing.' }, last: { pt: 'Four beers. Five.' },
        events: { pt: 'I didn\'t even see him.', by: 'Two swings, the witness said. I\'d check his back.' },
      },
      findings: [
        { on: 'chest', hidden: 'clothes', text: 'Left chest, 5th intercostal space in the anterior axillary line: a 3 cm stab wound, bubbling and sucking with each breath.', wound: { anchor: 'ics5L', kind: 'stab', size: 0.03 }, side: 'L' },
        { on: 'back', text: 'Left flank below the scapula: a second 2 cm stab wound, bleeding steadily. Easy to miss.', wound: { anchor: 'backLower', kind: 'stab', size: 0.02, bleed: 'backStab' } },
      ],
      sceneClues: 'Blood on the wall at shoulder height and a smear lower down where he slid. More on the ground than one wound in the front explains.',
    },
    hints: [
      { when: p => p.t > 30 && !(p.exposed?.chest), say: 'Shears. You can\'t treat what you can\'t see.' },
      { when: p => p.exposed?.chest && !p.tx.seal.L && p.t > 75, say: 'That hole is breathing for him. Seal it. The vented one.' },
      { when: p => (p.get('tensionPneumo')?.sev || 0) > 0.6 && !p.tx.decomp.L && !p.tx.thoracostomy.L, say: 'No sounds on the left, veins up, pressure going. That chest is under tension. Needle. Over the rib, Rook, never under it.' },
      { when: p => p.t > 240 && !did(p, 'logRoll'), say: 'Tran said two swings. I count one hole.' },
    ],
    dest: 'regional', alert: 'trauma', sceneTarget: 700,
    truth: 'A stab wound to the left chest with an open pneumothorax that tensions, a haemothorax, and a second wound in the back that only a log-roll finds. A vented chest seal, oxygen, and when breath sounds vanish and the pressure falls, needle decompression on the LEFT: 5th intercostal space, anterior axillary line (or 2nd space mid-clavicular with a long needle), over the top of the rib. Then drive: this is a surgical problem and the trauma centre is the treatment.',
    rubric: [
      { id: 'expose', text: 'Exposed the chest in the first minute and a half', pts: 8, test: p => within(first(p, 'expose', l => l.part === 'chest' || l.part === 'all'), 100) },
      { id: 'seal', text: 'Vented chest seal on the sucking wound', pts: 14, test: p => p.tx.seal.L?.vented },
      { id: 'ausc', text: 'Listened to both sides of the chest', pts: 8, test: p => did(p, 'auscultate') },
      { id: 'decomp', text: 'Decompressed the tension pneumothorax, correct side and site', pts: 26, test: p => (p.tx.decomp.L?.ok || p.tx.thoracostomy.L) && !p.errors.some(e => e.id === 'decompWrong') },
      { id: 'clean', text: 'No structures damaged on the way in', pts: 10, test: p => !p.errors.some(e => /^hit/.test(e.id)) },
      { id: 'back', text: 'Found and controlled the second wound', pts: 14, test: p => did(p, 'logRoll') && (p.tx.dressings.backStab || p.tx.pressureOn === 'backStab') },
      { id: 'o2', text: 'High-flow oxygen', pts: 4, test: p => did(p, 'o2', l => l.device === 'nrb') || p.tx.vent.o2 },
      { id: 'alert', text: 'Trauma alert, trauma centre, short scene time', pts: 16, test: (p, c) => p.alerted?.kind === 'trauma' && c.dest === 'regional' && c.sceneTime < 780 },
    ],
  },

  // =====================================================================================================
  stroke: {
    title: 'The crossword',
    dispatch: { pri: 1, nature: 'Stroke', text: 'Medic 14, priority one. 14 Linden Court. Seventy-seven-year-old female, husband reports facial droop and she cannot speak properly. Onset under one hour.' },
    place: { kind: 'house', district: 'residential' }, set: 'elderFlat', pose: 'sitting', patientOn: 'seat',
    pt: { first: 'Peggy', last: 'Whitlock', age: 77, sex: 'f', weight: 64, heightM: 1.60, baseline: { hr: 84, map: 128, rhythm: 'afib' }, meds: [], allergies: [],
      look: { skin: 0.12, hair: { style: 'short', color: 0xe8e8e8 }, build: 0.2, clothing: { top: 'blouse', topColor: 0x8fa0b8, bottom: 'skirt', bottomColor: 0x4b3f52, shoes: 'none' } } },
    conditions: [{ type: 'stroke', side: 'left', sev: 0.55 }],
    script: {
      bystander: 'Harold (husband)',
      opening: [{ who: 'Harold', say: 'We were doing the crossword. She went to say "aubergine" and it came out all wrong, and then her tea went down her front. That was at ten to seven. I looked at the clock. I was a signalman, I always look at the clock.' }, { who: 'Peggy', say: 'Th... the... (she looks at her left hand as if it belongs to someone else)' }],
      history: {
        what: { by: 'Ten to seven exactly. She was perfectly fine at quarter to.', pt: 'Mm... the... no.' },
        allergies: { by: 'None.' }, meds: { by: 'She is meant to take a blood thinner for her heart. She stopped it in the spring. It made her bruise and she hated it.' },
        past: { by: 'An irregular heartbeat. Atrial something.' }, last: { by: 'Tea. Half a biscuit.' }, events: { by: 'No fall. No headache that she said.' },
      },
      sceneClues: 'A crossword, 14 across half-filled in a careful hand. A cold cup of tea on its side. A box of apixaban on the mantel, the seal unbroken, dispensed in March.',
    },
    hints: [
      { when: p => p.t > 40 && !did(p, 'fast'), say: 'Face, arms, speech. Do the screen properly so you can say it on the radio.' },
      { when: p => p.t > 120 && !did(p, 'bgl'), say: 'Sugar. Low glucose does a perfect impression of this.' },
      { when: p => did(p, 'fast') && p.t > 360, say: 'Clock\'s running, Rook. Everything else we can do on the road. Time is brain.' },
    ],
    dest: 'regional', alert: 'stroke', sceneTarget: 600,
    truth: 'An embolic stroke: atrial fibrillation, anticoagulant stopped in the spring. The husband gave a last-known-well to the minute, which is the most valuable thing on scene. A positive stroke screen, a normal glucose, a stroke alert with that time, and St. Brigid (the only stroke centre) as fast as is safe. Leave the blood pressure alone: the brain is depending on it. No aspirin until a scan has shown it is not a bleed.',
    rubric: [
      { id: 'fast', text: 'Stroke screen performed', pts: 16, test: p => did(p, 'fast') },
      { id: 'bgl', text: 'Glucose checked to exclude a mimic', pts: 14, test: p => did(p, 'bgl') },
      { id: 'lkw', text: 'Established the time last known well', pts: 12, test: p => did(p, 'history', l => l.q === 'what') },
      { id: 'meds', text: 'Asked about anticoagulants', pts: 8, test: p => did(p, 'history', l => l.q === 'meds') },
      { id: 'bp', text: 'Left the blood pressure alone', pts: 10, test: p => !p.errors.some(e => e.id === 'strokeBP') && total(p, 'nitroglycerin') === 0 },
      { id: 'noAsa', text: 'No aspirin before imaging', pts: 10, test: p => total(p, 'aspirin') === 0 },
      { id: 'scene', text: 'On scene under 10 minutes', pts: 14, test: (p, c) => c.sceneTime < 620 },
      { id: 'alert', text: 'Stroke alert to the stroke centre', pts: 16, test: (p, c) => p.alerted?.kind === 'stroke' && c.dest === 'regional' },
    ],
  },

  // =====================================================================================================
  choking: {
    title: 'Sunday roast',
    dispatch: { pri: 1, nature: 'Choking', text: 'Medic 14, priority one. 9 Cedar Lane. Forty-five-year-old male choking at the dinner table, now unconscious. Family attempting abdominal thrusts.' },
    place: { kind: 'house', district: 'residential' }, set: 'kitchen', pose: 'supine', patientOn: 'floor',
    pt: { first: 'Paul', last: 'Dunmore', age: 45, sex: 'm', weight: 104, heightM: 1.78, baseline: { hr: 76, map: 96 }, meds: [], allergies: [],
      look: { skin: 0.1, hair: { style: 'balding', color: 0x5a4632 }, beard: 0.7, build: 0.35, clothing: { top: 'shirt', topColor: 0x4f6b52, bottom: 'jeans', bottomColor: 0x2a3550, shoes: 'none' } } },
    conditions: [{ type: 'choking', depth: 0.9, item: 'a fist of half-chewed beef' }],
    init(p) { p.sao2 = 0.62; p.spo2Lag = 0.62; p.pAO2 = 30; p.pCO2 = 66; p.brain = 0.12; p.energy = 0.9; p.flags.cricIndicated = true; },
    script: {
      bystander: 'Claire (wife)',
      opening: [{ who: 'Claire', say: 'He was laughing with his mouth full and then nothing, no noise at all. Our son did the Heimlich until he went down. Please, he\'s gone purple.' }],
      history: {
        what: { by: 'Four minutes. Five. Roast beef.' }, allergies: { by: 'None.' }, meds: { by: 'Blood pressure tablets.' },
        past: { by: 'He snores like a train. The doctor said sleep apnoea. Big neck.' }, events: { by: 'He\'d had a couple of beers. He always eats too fast.' },
      },
      sceneClues: 'A dining chair on its back. A carving board. A teenage boy in the doorway with his hands over his mouth.',
    },
    hints: [
      { when: p => p.t > 20 && !did(p, 'magill') && !did(p, 'cprStart'), say: 'Unconscious choke. Look in with the scope and the forceps. I\'ll get on the chest.' },
      { when: p => did(p, 'magill') && p.get('choking')?.lodged && p.t > 80 && p.tx.adjunct !== 'cric', say: 'You can\'t pull it and I can\'t bag past it. There\'s one airway left and it\'s the front of his neck. Find the membrane. Stay in the middle.' },
    ],
    dest: 'either', alert: 'arrest', sceneTarget: 900,
    truth: 'A complete foreign-body airway obstruction impacted at the laryngeal inlet in an unconscious, hypoxic, thick-necked man. Laryngoscopy and Magill forceps are the right first move; when that fails and he cannot be ventilated, this is "can\'t intubate, can\'t oxygenate" and the answer is a surgical cricothyrotomy: a vertical skin incision in the midline, a horizontal stab through the cricothyroid membrane (the soft dip between the thyroid and cricoid cartilages), tube in, ventilate. Seconds matter; lateral or deep cuts kill.',
    rubric: [
      { id: 'look', text: 'Laryngoscopy and forceps attempted first', pts: 14, test: p => did(p, 'magill') },
      { id: 'cpr', text: 'Compressions when the pulse was lost', pts: 8, test: p => !did(p, 'arrest') || did(p, 'cprStart') },
      { id: 'cric', text: 'Front-of-neck airway established', pts: 30, test: p => p.tx.adjunct === 'cric' },
      { id: 'fast', text: 'Airway opened within 4 minutes of contact', pts: 14, test: p => within(first(p, 'cric', l => l.ok), 260) || within(first(p, 'fbaoCleared'), 260) },
      { id: 'clean', text: 'Midline, correct depth: nothing else cut', pts: 14, test: p => !p.errors.some(e => /^hit/.test(e.id)) },
      { id: 'vent', text: 'Ventilated with oxygen and confirmed with capnography', pts: 10, test: p => p.tx.vent.o2 && p.tx.mon.cap },
      { id: 'out', text: 'Pulse and saturations above 90% at handover', pts: 10, test: p => !p.arrest && p.spo2 >= 90 },
    ],
  },

  // =====================================================================================================
  hyperk: {
    title: 'Monday, Wednesday, Friday',
    dispatch: { pri: 2, nature: 'Weakness / sick person', text: 'Medic 14, priority two. 218 Alder Street. Seventy-one-year-old male, generalised weakness, cannot get out of his chair. Known to you.' },
    place: 'brennan', set: 'livingRoom', pose: 'sitting', patientOn: 'seat',
    pt: { first: 'Walt', last: 'Brennan', age: 71, sex: 'm', weight: 86, heightM: 1.74, baseline: { hr: 74, map: 100 }, meds: ['insulin'], allergies: ['penicillin'],
      look: { skin: 0.15, hair: { style: 'balding', color: 0xb8b8b8 }, beard: 0.5, build: 0.3, clothing: { top: 'shirt', topColor: 0x55604a, bottom: 'trousers', bottomColor: 0x3a3630, shoes: 'none' } } },
    conditions: [{ type: 'hyperK', k: 7.15, rise: 0.045 }],
    script: {
      bystander: null,
      opening: [{ who: 'Walt', say: 'It\'s you. Good. My legs have gone to lead, Rook. And my heart keeps... stopping to think.' }],
      painWords: 'No pain. "Just heavy. Everything is heavy."',
      history: {
        what: { pt: 'Since yesterday. Legs first. Now my arms. I can\'t lift the remote.' },
        allergies: { pt: 'Penicillin. Did I tell you about the rash?' },
        meds: { pt: 'Insulin. The blood pressure one. And the dialysis, if that counts.' },
        past: { pt: 'Sugar. Kidneys. Monday, Wednesday, Friday at the unit on Ferry Road.' },
        last: { pt: 'Bananas. Mrs. Okonkwo brought bananas. And orange juice, for my sugar. I\'ve been careful about the sugar, like you said.' },
        events: { pt: 'The county stopped the dial-a-ride van. Budget. I\'ve not been to the unit since a week last Friday. I didn\'t want to bother anybody.' },
      },
      sceneClues: 'A fruit bowl, mostly banana skins. An appointment card for the dialysis unit with three dates crossed out by hand. A letter from Ketter County Transit: "service discontinued".',
      after: [{ when: p => p.level('calcium') > 0.2 && p.m.memStab > 0.5, who: 'Walt', say: 'Huh. That\'s it steadied. You\'re getting good at this. Ray would\'ve liked you.' }],
    },
    hints: [
      { when: p => p.t > 60 && !p.tx.mon.ecg, say: 'Slow pulse, dialysis patient, heavy legs. Get him on the monitor and look hard at the T waves.' },
      { when: p => p.tx.mon.ecg && p.t > 200 && !total(p, 'calcium'), say: 'Missed a week of dialysis, tall tented T\'s, QRS getting wide. That\'s potassium. Calcium protects the heart: slow, through a good line.' },
    ],
    dest: 'regional', alert: 'medical', sceneTarget: 900,
    truth: 'Severe hyperkalaemia: a dialysis patient who missed four sessions when the county cut his transport, living on bananas and orange juice. Weakness, a slow pulse, peaked T waves and a widening QRS on the way to arrest. Calcium chloride stabilises the heart within minutes; back-to-back albuterol drives potassium into cells; then a hospital with dialysis. The clue is in the history, and nowhere else.',
    rubric: [
      { id: 'ecg', text: 'On the monitor within 3 minutes', pts: 12, test: p => within(first(p, 'ecgOn') ?? first(p, '12lead'), 180) },
      { id: '12', text: '12-lead ECG', pts: 12, test: p => did(p, '12lead') },
      { id: 'hx', text: 'Found the missed dialysis in the history', pts: 14, test: p => did(p, 'history', l => l.q === 'events' || l.q === 'past') },
      { id: 'iv', text: 'IV access', pts: 8, test: p => p.tx.iv.length > 0 },
      { id: 'ca', text: 'Calcium chloride 1 g IV', pts: 26, test: p => total(p, 'calcium') >= 0.9 },
      { id: 'alb', text: 'Nebulised albuterol to shift potassium', pts: 12, test: p => total(p, 'albuterol') >= 2.5 },
      { id: 'noArrest', text: 'He did not arrest', pts: 16, test: p => !did(p, 'arrest') },
    ],
  },

  // =====================================================================================================
  gsw: {
    title: 'Under the lights',
    dispatch: { pri: 1, nature: 'Shooting', text: 'Medic 14, priority one. FreshWay car park, east side. Twenty-two-year-old male, gunshot wound to the chest. PD on scene, scene is secure. Engine 4 responding.' },
    place: 'market', set: 'street', pose: 'supine', props: ['police', 'carStopped'],
    pt: { first: 'Andre', last: 'Fenn', age: 22, sex: 'm', weight: 74, heightM: 1.79, baseline: { hr: 68, map: 90 }, meds: [], allergies: [],
      look: { skin: 0.8, hair: { style: 'buzz', color: 0x0f0f0f }, build: 0.5, clothing: { top: 'hoodie', topColor: 0x8a1f1f, bottom: 'jeans', bottomColor: 0x15161c, shoes: 'trainers' } } },
    conditions: [
      { type: 'tamponade', vol: 105, rate: 29, clotted: 0.45 },
      { type: 'haemothorax', side: 'L', rate: 30, vol: 100 },
    ],
    script: {
      bystander: 'Officer Tran',
      opening: [{ who: 'Officer Tran', say: 'Single shot, small calibre, about six minutes ago. He was talking to me a minute back. He\'s stopped.' }, { who: 'Andre', say: '...tell my mum... I wasn\'t... I was just getting the car...' }],
      history: { what: { by: 'One round. No exit that I could see, but I didn\'t roll him.', pt: 'Can\'t... breathe right.' }, allergies: { by: 'Unknown.' }, meds: { by: 'Unknown.' }, past: { by: 'His ID says he\'s twenty-two. That\'s all I\'ve got.' } },
      findings: [
        { on: 'chest', hidden: 'clothes', text: 'A single 8 mm entry wound just left of the sternum, 4th intercostal space. Very little external bleeding.', wound: { anchor: 'apex', kind: 'gsw', size: 0.012, off: [-0.045, 0.03] }, side: 'L' },
        { on: 'back', text: 'Back: no exit wound.' },
      ],
      sceneClues: 'A set of car keys and a shopping bag split on the tarmac: milk, cereal. One shell casing under an evidence cone.',
    },
    hints: [
      { when: p => p.t > 35 && !(p.exposed?.chest), say: 'Cut the hoodie. Where did it go in?' },
      { when: p => p.exposed?.chest && p.t > 110 && !did(p, 'auscultate'), say: 'Hole in the box, pressure in his boots. Listen: lungs and heart. And look at his neck.' },
      { when: p => did(p, 'auscultate') && !p.tx.pericardial && !p.arrest && p.t > 170, say: 'Veins up, heart sounds like they\'re under a pillow, no air problem. That\'s his pericardium filling. Needle under the xiphoid, aim at the left shoulder, watch the monitor. Or we go, now. Your call.' },
      { when: p => p.arrest && !p.tx.thoracotomy && p.t - p.tArrest > 20, say: 'He\'s lost his output. Compressions won\'t pump a heart that can\'t fill. If you\'re ever going to open a chest, Rook, it\'s this one.' },
    ],
    dest: 'regional', alert: 'trauma', sceneTarget: 480,
    truth: 'A gunshot wound to the "cardiac box" with pericardial tamponade: falling pressure, distended neck veins, muffled heart sounds (Beck\'s triad), clear lungs. Needle pericardiocentesis from below the xiphoid toward the left shoulder buys minutes when the blood is liquid; much of it is clot. The definitive field answer after he loses his output is a resuscitative thoracotomy: open the pericardium (clear of the phrenic nerves), deliver the clot, put a finger on the hole. Otherwise: minimal scene time and the trauma centre.',
    rubric: [
      { id: 'expose', text: 'Exposed the chest and found the wound in the cardiac box', pts: 8, test: p => p.exposed?.chest || p.exposedAll },
      { id: 'recognise', text: 'Examined for tamponade (neck veins, heart sounds)', pts: 12, test: p => did(p, 'auscultate') && did(p, 'neck') },
      { id: 'noDecomp', text: 'Did not needle a chest that had no tension', pts: 8, test: p => !p.errors.some(e => e.id === 'decompWrong') },
      { id: 'relief', text: 'Relieved the tamponade (needle or thoracotomy)', pts: 26, test: p => p.tx.pericardial || (p.tx.thoracotomy && true) },
      { id: 'clean', text: 'Nothing else damaged', pts: 10, test: p => !p.errors.some(e => /^hit/.test(e.id)) },
      { id: 'fluid', text: 'Fluid to maintain filling, not to normalise pressure', pts: 6, test: p => (p.fluidsGiven || 0) > 200 && (p.fluidsGiven || 0) < 1200 },
      { id: 'time', text: 'Scene time under 9 minutes or a pulse restored on scene', pts: 14, test: (p, c) => c.sceneTime < 540 || (p.tx.thoracotomy && !p.arrest) },
      { id: 'alert', text: 'Trauma alert to the trauma centre', pts: 16, test: (p, c) => p.alerted?.kind === 'trauma' && c.dest === 'regional' },
    ],
  },

  // =====================================================================================================
  dee: {
    title: 'Stay with me',
    dispatch: { pri: 1, nature: 'Responder down', text: 'All units, Kessler Bridge: Medic 14\'s EMT has been struck by a vehicle. Medic 14, you are the only ALS unit on the bridge. Engine 4, Medic 9 responding, ETA eight minutes.' },
    place: 'kessler', set: 'street', pose: 'supine', props: ['pileup', 'engine'], partnerDown: true, autoBackup: 300,
    pt: { first: 'Dee', last: 'Okafor', age: 51, sex: 'f', weight: 70, heightM: 1.68, baseline: { hr: 64, map: 90 }, meds: [], allergies: [],
      look: { skin: 0.8, hair: { style: 'bun', color: 0x1a1412 }, build: 0.45, clothing: { top: 'uniform', topColor: 0x1f3a2c, bottom: 'uniform', bottomColor: 0x1b1f24, shoes: 'boots' } } },
    conditions: [
      { type: 'tensionPneumo', side: 'R', sev: 0.35, rate: 0.09 },
      { type: 'flailChest', side: 'R' },
      { type: 'hemorrhage', sites: [{ id: 'pelvis', label: 'pelvis', region: 'pelvis', rate: 150, ext: false, fix: { binder: true }, pain: 9 }, { id: 'scalp', label: 'scalp laceration', region: 'head', rate: 30, ext: true, fix: { pressure: true }, pain: 3 }] },
      { type: 'headInjury', sev: 0.15, expand: 0 },
    ],
    script: {
      bystander: null,
      opening: [{ who: 'Dee', say: 'Rook. Rook, listen. Right side. I can\'t... get air on the right. Hips are gone. Don\'t you dare... look at me like that. Work.' }],
      painWords: '"Ribs. Hips. Everything. Don\'t ask me again."',
      history: {
        what: { pt: 'Didn\'t see it. Heard it. Pickup, sliding. Threw me into the barrier.' }, allergies: { pt: 'Nothing. You know that.' },
        meds: { pt: 'Nothing.' }, past: { pt: 'Twenty-two years of this. Bad knees.' }, last: { pt: 'Your terrible coffee.' }, events: { pt: 'I was tagging the kid in the hatchback. Is the kid okay?' },
      },
      findings: [
        { on: 'chest', hidden: 'clothes', text: 'Right chest: a segment of ribs 4 to 8 moving the wrong way with each breath, crepitus, bruising already spreading.', wound: { anchor: 'ics5R', kind: 'bruise', size: 0.16 }, side: 'R' },
        { on: 'legs', hidden: 'clothes', text: 'Pelvis: legs externally rotated, one shorter. Do not spring it.', wound: { anchor: 'pelvisR', kind: 'bruise', size: 0.14 } },
        { on: 'head', text: 'Scalp: a 5 cm laceration above the right ear, bleeding briskly.', wound: { anchor: 'forehead', kind: 'laceration', size: 0.05, bleed: 'scalp' } },
        { on: 'back', text: 'Back: abrasions, no step in the spine.' },
      ],
      sceneClues: 'Rain coming sideways across the deck. Your own truck\'s lights turning the spray red and white. A pickup against the barrier, steaming. Her radio on the ground, still talking.',
      lines: [
        { when: p => (p.get('tensionPneumo')?.sev || 0) > 0.55 && !p.tx.decomp.R && !p.tx.thoracostomy.R && p.conscious, who: 'Dee', say: 'It\'s tensioning. You know where. Fifth space. Over the rib, Rook. Never under.' },
        { when: p => (p.tx.decomp.R?.ok || p.tx.thoracostomy.R) && p.conscious, who: 'Dee', say: 'There. There it is. Good hands. Now bind my hips before I bleed out telling you how.' },
        { when: p => p.brain < 0.45 && !p.arrest, who: 'Dee', say: '...Ray? Is that...' },
      ],
    },
    hints: [],
    dest: 'regional', alert: 'trauma', sceneTarget: 660,
    truth: 'Your partner: a flail chest with a right tension pneumothorax and a pelvic fracture bleeding into itself. Decompress the right chest (5th space, anterior axillary line, over the rib: the lesson she has been repeating all month), bind the pelvis, protect the neck, TXA, enough fluid for a radial pulse and no more, analgesia because it is Dee, and the trauma centre across the bridge you are standing on. If she arrests: bilateral finger thoracostomies before anything else.',
    rubric: [
      { id: 'decomp', text: 'Decompressed the right chest, correct site, cleanly', pts: 28, test: p => (p.tx.decomp.R?.ok || p.tx.thoracostomy.R) && !p.errors.some(e => e.id === 'decompWrong' || /^hit/.test(e.id)) },
      { id: 'binder', text: 'Pelvic binder within 5 minutes', pts: 16, test: p => within(first(p, 'binder'), 300) },
      { id: 'cspine', text: 'Cervical spine protected', pts: 6, test: p => p.tx.collar },
      { id: 'txa', text: 'Tranexamic acid', pts: 8, test: p => total(p, 'txa') >= 0.9 },
      { id: 'o2', text: 'Oxygen', pts: 4, test: p => did(p, 'o2') || p.tx.vent.o2 },
      { id: 'pain', text: 'You treated her pain', pts: 8, test: p => total(p, 'fentanyl') > 0 || total(p, 'ketamine') > 0 },
      { id: 'permissive', text: 'Permissive hypotension', pts: 8, test: p => !p.errors.some(e => e.id === 'popClot') },
      { id: 'talk', text: 'You talked to her', pts: 6, test: p => (p.reassured || 0) > 0 },
      { id: 'alive', text: 'She was alive when you reached St. Brigid', pts: 16, test: p => !p.arrest && !p.dead },
    ],
  },
};

// Bridge pile-up triage (shift 7, before "dee"): four casualties sorted with START in about ninety seconds.
// Each check costs seconds; the tag is scored against `tag`.
export const TRIAGE = {
  title: 'Kessler Bridge',
  dispatch: { pri: 1, nature: 'Multi-vehicle collision', text: 'Medic 14, priority one. Multi-vehicle collision, Kessler Bridge mid-span, six vehicles, unknown injuries. You are first due. Establish command and triage.' },
  place: 'kessler',
  casualties: [
    { id: 'a', where: 'Standing by a grey sedan', desc: 'A man in a suit holding his wrist, walking toward you, shouting about his car.', walks: true, rr: 20, radial: true, obeys: true, tag: 'green', why: 'Walking wounded: GREEN. He can wait, however loud he is.' },
    { id: 'b', where: 'Driver\'s seat of a white van', desc: 'A woman, silent, eyes open, a steering wheel bent toward her chest.', walks: false, rr: 34, radial: true, obeys: true, tag: 'red', why: 'Respiratory rate over 30: RED, immediately.' },
    { id: 'c', where: 'Rear seat of a hatchback', desc: 'A boy of about ten, crying, saying his leg hurts, holding the head-rest.', walks: false, rr: 24, radial: true, obeys: true, tag: 'yellow', why: 'Cannot walk, breathing under 30, radial pulse, obeys commands: YELLOW.' },
    { id: 'd', where: 'On the deck beside a pickup', desc: 'A man face down, not moving. No chest movement you can see.', walks: false, rr: 0, rrAfter: 0, radial: false, obeys: false, tag: 'black', why: 'Not breathing after the airway is opened: BLACK in a mass-casualty incident. The hardest tag to tie.' },
    { id: 'e', where: 'Passenger seat of the pickup', desc: 'A young woman slumped against the door, pale, answering slowly.', walks: false, rr: 26, radial: false, obeys: true, tag: 'red', why: 'No radial pulse: RED.' },
  ],
};

// Shifts: the story order. env = weather/time preset in gfx.js.
export const SHIFTS = [
  { id: 1, name: 'First Day', env: 'morning', calls: ['hypo', 'stemi'] },
  { id: 2, name: 'The Old Pen', env: 'overcast', calls: ['anaphylaxis', 'motorcycle'] },
  { id: 3, name: 'Nights', env: 'night', calls: ['arrestGym', 'overdose'] },
  { id: 4, name: 'Weather Coming', env: 'dusk', env2: 'rainNight', calls: ['asthma', 'seizure', 'stabbing'] },
  { id: 5, name: 'Time Is Brain', env: 'fogDawn', calls: ['stroke', 'choking'] },
  { id: 6, name: 'Monday, Wednesday, Friday', env: 'rainNight', calls: ['hyperk', 'gsw'] },
  { id: 7, name: 'Kessler Bridge', env: 'storm', calls: ['triage', 'dee'] },
];

// Generic marks applied to every call on top of its own rubric.
export const COMMON = [
  { id: 'c_primary', text: 'Primary survey (response, airway, breathing, circulation) promptly', pts: 8, test: p => primary(p) },
  { id: 'c_monitor', text: 'Monitoring attached', pts: 4, test: p => p.tx.mon.spo2 && (p.tx.mon.ecg || p.tx.mon.pads) },
  { id: 'c_bp', text: 'Blood pressure measured', pts: 3, test: p => did(p, 'bp') || p.arrest || did(p, 'arrest') },
  { id: 'c_talk', text: 'Talked to the patient like a person', pts: 4, test: p => (p.reassured || 0) > 0 || !p.wasConscious },
  { id: 'c_alert', text: 'Receiving hospital told what was coming', pts: 3, test: p => !!p.alerted },
];
export { drug, total, first, did, within, mins };
