// The code book: the Federal Amusement Safety Administration's ride and park standard (49 FASA §1–§10).
// Findings never say "violation"; the player compares the numbers they read to these limits.
// Every defect gen.js can plant cites one of these sections and is minor (Cite) or major (Red Tag) by
// exactly the thresholds written here, so the book is the whole rulebook.

export const SEV = { NONE: 0, MINOR: 1, MAJOR: 2 };
export const VERDICTS = ['approve', 'cite', 'redtag'];
export const VERDICT_LABEL = { approve: 'Approve', cite: 'Cite', redtag: 'Red Tag' };
export const VERDICT_SEV = { approve: 0, cite: 1, redtag: 2 };

export const CODE = [
  { ch: '§1 Structure', items: [
    { id: '1.1', t: 'Corrosion', x: 'Wall section loss above 10% of nominal thickness is a minor defect. Above 20% is major.' },
    { id: '1.2', t: 'Bolted connections', x: 'Any bolt missing is major. Any bolt below 80% of specified torque is minor.' },
    { id: '1.3', t: 'Welds', x: 'Any crack indication found by ultrasonic test (UT) is major.' },
    { id: '1.4', t: 'Track splices', x: 'Rail offset at a splice above 1.0 mm is minor. Above 3.0 mm is major.' },
  ] },
  { ch: '§2 Patron restraint', items: [
    { id: '2.1', t: 'Primary restraint', x: 'A restraint (lap bar, harness, seat chain) that is missing or fails to lock is major.' },
    { id: '2.2', t: 'Padding and webbing', x: 'Torn padding or frayed webbing is minor.' },
  ] },
  { ch: '§3 Ride dynamics', items: [
    { id: '3.1', t: 'Vertical acceleration', x: 'Peak +Gz above 4.5 g is minor. Above 5.0 g is major. Below −1.0 g (ejector air) is major.' },
    { id: '3.2', t: 'Lateral acceleration', x: 'Peak lateral above 1.5 g is minor. Above 1.8 g is major.' },
    { id: '3.3', t: 'Rated limits', x: 'Exceeding the manufacturer\'s rated speed, rpm or swing angle is minor. Exceeding it by more than 10% is major.' },
    { id: '3.4', t: 'Braking', x: 'Drop rides must stop at least 2.0 m above the bumpers. Less is minor; less than 1.0 m is major.' },
  ] },
  { ch: '§4 Patron envelope', items: [
    { id: '4.1', t: 'Clearance', x: 'Seats at full swing must clear every fixed object by 1.0 m. Under 1.0 m is minor; under 0.5 m is major.' },
    { id: '4.2', t: 'Perimeter fence', x: 'A gap in the ride perimeter fence is minor.' },
  ] },
  { ch: '§5 Records', items: [
    { id: '5.1', t: 'Annual inspection', x: 'Non-destructive testing (NDT) more than 365 days ago is major.' },
    { id: '5.2', t: 'Operator certification', x: 'An expired operator certificate is minor.' },
    { id: '5.3', t: 'Daily checklist', x: 'Fewer than 7 of the last 7 pre-opening checklists signed is minor.' },
    { id: '5.4', t: 'Capacity', x: 'Posted capacity above the design capacity on the spec plate is major.' },
  ] },
  { ch: '§6 Signage', items: [
    { id: '6.1', t: 'Height requirement', x: 'A height sign that marks lower than the manufacturer\'s minimum rider height is major. Higher is allowed.' },
  ] },
  { ch: '§7 Electrical and guarding', items: [
    { id: '7.1', t: 'Live conductors', x: 'Exposed live conductors within public reach are major.' },
    { id: '7.2', t: 'Drive guarding', x: 'An unguarded gear, chain or pinch point is minor.' },
    { id: '7.3', t: 'Emergency stop', x: 'An E-stop that does not halt the ride within 3.0 s is major.' },
  ] },
  { ch: '§8 Alignment and bearings', items: [
    { id: '8.1', t: 'Level', x: 'Rotating rides must be level within 0.5°. Out by more than 0.5° is minor; more than 1.0° is major.' },
    { id: '8.2', t: 'Bearings', x: 'Main bearing running above 65 °C is minor. Above 80 °C is major.' },
  ] },
  { ch: '§9 Wear parts', items: [
    { id: '9.1', t: 'Wire rope', x: 'Broken wires in one lay length: 3 to 5 is minor, 6 or more is major.' },
    { id: '9.2', t: 'Chains', x: 'Chain elongation above 2% is minor. Above 3% is major.' },
    { id: '9.3', t: 'Wheels and tyres', x: 'Tread below the manufacturer\'s minimum diameter is minor.' },
    { id: '9.4', t: 'Anti-rollback', x: 'An anti-rollback device that fails to engage is major.' },
    { id: '9.5', t: 'Brake fins', x: 'A missing brake fin is major. A fin below its minimum thickness is minor.' },
  ] },
  { ch: '§10 Food and first aid', items: [
    { id: '10.1', t: 'Cold holding', x: 'Refrigerated food above 41 °F is minor. Above 50 °F is major.' },
    { id: '10.2', t: 'Fire extinguisher', x: 'An extinguisher missing is major. One with an inspection tag over 12 months old is minor.' },
    { id: '10.3', t: 'Hand sink', x: 'Hand-sink water below 100 °F is minor.' },
    { id: '10.4', t: 'Health permit', x: 'An expired health permit is major.' },
    { id: '10.5', t: 'First aid', x: 'A first aid station without a certified responder on duty is major. Expired AED pads are minor.' },
  ] },
];

export const SECTION = Object.fromEntries(CODE.flatMap(c => c.items.map(i => [i.id, i])));

// Action costs in game minutes.
export const COST = { examine: 4, paper: 6, test: 12, walkPerM: 1 / 45, shiftStart: 8 * 60, shiftEnd: 17 * 60 };

export const RANKS = ['GS-5 Trainee Inspector', 'GS-7 Inspector', 'GS-9 Inspector', 'GS-11 Senior Inspector',
  'GS-12 Lead Inspector', 'GS-13 Regional Inspector', 'GS-14 Chief Inspector', 'GS-15 Inspector General'];
