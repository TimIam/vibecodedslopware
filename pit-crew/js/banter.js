// Crew banter: who says what, and a director that slots it between the action.
// Lines are [speaker, text]; a conversation is a list of lines. {d} = driver first name, {n} = car number,
// {p} = position, {t} = stop time, {r} = rival team, {x} = track name.
// The bulk of the lines live in lines/*.js and are merged in below.
import * as INTRO from './lines/intro.js';
import { IDLE as MORE_IDLE } from './lines/idle.js';
import { TRACK_IDLE as MORE_TRACK } from './lines/tracks.js';
import * as EV from './lines/events.js';
import * as PEP from './lines/pep.js';
import * as FLAG from './lines/flags.js';
import * as SHUTDOWN from './lines/shutdown.js';
import * as NEON_DAY from './lines/neonday.js';

const IDLE = [
  [['toby', 'Mags, how many wheel nuts have you done in your career?'], ['mags', 'All of them, Toby.']],
  [['lou', 'My mother says a front jack is just a hug with a lever.'], ['mags', 'Your mother has never been in a pit lane.'], ['lou', 'She has been in every pit lane. In spirit.']],
  [['dev', 'Fun fact: the car does three hundred and forty kilometres an hour on this straight.'], ['toby', 'And we stop it with a man holding a stick.'], ['dev', 'A very confident man.']],
  [['pip', 'I have been told the fuel rig is "not a toy" four times today.'], ['mags', 'Five.'], ['pip', 'Five times.']],
  [['toby', 'I practised wheel changes on my bike all winter.'], ['lou', 'How fast?'], ['toby', 'Bit under forty minutes.']],
  [['mags', 'Gloves on. Visors down. Toby, that is your sandwich.'], ['toby', 'It is a very aerodynamic sandwich.']],
  [['dev', 'Tyre temps nominal. Brake temps nominal. Lou\'s temperature?'], ['lou', 'Running warm. Ate the curry.'], ['dev', 'Noted.']],
  [['boss', 'Hargreaves here. I have a sponsor in the garage. Please do not set anything on fire.'], ['pip', 'No promises.'], ['boss', 'Pip.']],
  [['lou', 'You ever think the cars are watching us?'], ['mags', 'No.'], ['lou', 'They have headlights now. Headlights are eyes, Mags.']],
  [['toby', 'Does anyone else hum the wheel gun noise in their sleep?'], ['pip', 'Brrrrrt.'], ['mags', 'Brrrrrrt.'], ['lou', 'BRRRRRRRRT.']],
  [['dev', 'Strategy model says we are fine.'], ['mags', 'What does the model know about wheel nuts?'], ['dev', 'Nothing. That is why it is so calm.']],
  [['nico', 'Radio check. Am I fast?'], ['dev', 'You are fast, Nico.'], ['nico', 'Faster than Sanna?'], ['dev', 'Please drive the car.']],
  [['sanna', 'The car is good. The seat is cold. Tell Lou to stop sitting in it.'], ['lou', 'It was one time.']],
  [['pip', 'Did you know race fuel smells like a lemon that hates you?'], ['toby', 'That is the nicest thing anyone has said about it.']],
  [['mags', 'Rule one of the pit lane: never run.'], ['toby', 'We run all the time.'], ['mags', 'Rule two: run very fast.']],
  [['lou', 'I have named my jack Barbara.'], ['toby', 'Why Barbara?'], ['lou', 'She lifts me up.']],
  [['dev', 'Our tyre carriers have carried four thousand tyres this season.'], ['toby', 'And dropped?'], ['dev', 'We do not say that number out loud.']],
  [['boss', 'Our title sponsor would like more shots of the logo.'], ['mags', 'Tell them to drive slower.']],
  [['toby', 'If I do a perfect stop can I wear the lollipop helmet?'], ['mags', 'There is no lollipop helmet.'], ['toby', 'Not yet there isn\'t.']],
  [['pip', 'Fuel is a lot like coffee.'], ['lou', 'Hot?'], ['pip', 'Expensive, and someone always spills it.']],
];

const TRACK_IDLE = {
  porto: [
    [['lou', 'Lovely harbour. Smell that sea air.'], ['mags', 'That is brake dust, Lou.']],
    [['toby', 'Someone on a yacht just waved at me!'], ['dev', 'That was a sponsor. Wave back. Smile.']],
    [['dev', 'This pit lane was built in 1952 for cars half the size.'], ['mags', 'And crews twice as brave.']],
  ],
  kessel: [
    [['dev', 'Radar shows rain in about ten minutes.'], ['toby', 'How accurate is the radar?'], ['dev', 'About as accurate as you on a Monday.']],
    [['lou', 'I love the forest. Very peaceful.'], ['mags', 'Until twenty cars come through it.']],
    [['pip', 'Wet wheel guns slip. Grip like you mean it.'], ['toby', 'I always mean it.']],
  ],
  qasr: [
    [['toby', 'There is sand in my sandwich.'], ['mags', 'There is sand in my soul.']],
    [['pip', 'It is thirty-eight degrees and I am holding a fuel hose.'], ['dev', 'Hydrate.'], ['pip', 'With what? Everything is sand.']],
    [['dev', 'Sidepods are swallowing dust. Blow them out every stop.']],
  ],
  givre: [
    [['lou', 'I cannot feel my fingers.'], ['mags', 'You never could. Lift the car.']],
    [['toby', 'The tyre blankets are the only warm thing here.'], ['lou', 'I have asked for one. They said no.']],
    [['dev', 'Air temperature four degrees. Wheel nuts are going to be stiff.']],
  ],
  neon: [
    [['nico', 'The walls are so close I can read the adverts.'], ['dev', 'Please do not read the adverts.']],
    [['toby', 'Mags, why is everything purple?'], ['mags', 'Money, Toby. It is the colour of money here.']],
    [['dev', 'Spare noses are on the trolley. We will need them.'], ['lou', 'I will cradle them like eggs.']],
  ],
  isla: [
    [['boss', 'Gentlemen, ladies, Lou. This is the big one.'], ['lou', 'Thank you for including me.']],
    [['mags', 'One last race. Whatever happens, I am proud of this crew.'], ['toby', 'Mags, are you crying?'], ['mags', 'Brake dust.']],
    [['dev', 'Both cars will stop on the same lap. Car two waits right behind.'], ['pip', 'Like a queue at a bakery.'], ['dev', 'A very loud bakery.']],
  ],
};

const START = [
  [['dev', 'Lights are on. Here we go, everybody.'], ['mags', 'Crew to the box. Hands warm, heads cold.']],
  [['mags', 'Five red lights and then we earn our money.'], ['toby', 'We get paid?'], ['mags', 'Barely.']],
];

const BOXCALL = [
  [['dev', 'Box box, {d}. Box this lap.'], ['{drv}', 'Copy. Coming in.'], ['mags', 'Crew out! Car {n} is in!']],
  [['dev', '{d}, box box. Stay out of trouble at pit entry.'], ['{drv}', 'Understood. Have the tyres ready.'], ['toby', 'Tyres are always ready!']],
  [['dev', 'Box, box, box. Car {n}.'], ['{drv}', 'Box. Copy.'], ['lou', 'Barbara is ready.']],
];

const REACT = {
  lightning: [
    [['mags', '{t} seconds. That is the best stop I have seen this year.'], ['toby', 'Can I have the helmet now?']],
    [['dev', '{t}! Fastest stop in the pit lane.'], ['boss', 'Who did that? Someone get that on camera.']],
    [['{drv}', 'Whoa. I did not even get to say hello.'], ['lou', 'Hello, {d}. Goodbye, {d}.']],
  ],
  great: [
    [['dev', 'Clean stop, {t}. Gained time on the cars around us.'], ['mags', 'Good work. Reset for the next one.']],
    [['{drv}', 'Nice stop, guys. Car feels good.'], ['toby', 'She said nice! Did you hear?']],
    [['mags', '{t}. That is the job.'], ['pip', 'That is the job.']],
  ],
  ok: [
    [['dev', '{t}. A bit slow, but no damage done.'], ['mags', 'We can do better than that.']],
    [['lou', 'Not our finest.'], ['mags', 'Not our worst. Next one.']],
  ],
  slow: [
    [['dev', '{t}. That cost us track position.'], ['mags', 'Shake it off. Shake it off. Then never do it again.']],
    [['{drv}', 'What happened? Did somebody take a phone call?'], ['toby', 'Sorry!']],
    [['boss', 'Was that a pit stop or a picnic?'], ['mags', 'Leave it, Hargreaves.']],
  ],
  unsafe: [
    [['dev', 'Unsafe release. Five second penalty.'], ['mags', 'Look at the lane before you wave the car out!'], ['lou', 'In my defence, it was very fast.']],
    [['boss', 'The stewards would like a word. Several words.'], ['dev', 'Five seconds added to {d}\'s race time.']],
  ],
  fire: [
    [['pip', 'Small fire. Very small. Out now.'], ['mags', 'Pip.'], ['pip', 'I said it was out.']],
    [['toby', 'Is it normal for the car to be on fire?'], ['lou', 'For about one second, yes.']],
  ],
  short: [
    [['dev', 'Fuel is short. {d}, you will need to save fuel.'], ['{drv}', 'Save fuel? In a race?']],
    [['pip', 'I may have been a bit stingy with the fuel.'], ['dev', 'The car may stop. Fingers crossed.']],
  ],
  cold: [
    [['{drv}', 'The tyres are freezing. No grip at all for a lap.'], ['mags', 'Blankets off at the peak, people!']],
  ],
  overshoot: [
    [['lou', 'Ow. My toes.'], ['mags', 'Catch the car on the mark, not on Lou.']],
  ],
};

const EVENTS = {
  rain: [
    [['dev', 'Rain! Rain is here. Get the wets ready.'], ['toby', 'Wets on the trolley!'], ['dev', 'Box the cars for WETS. Slicks will be useless.']],
  ],
  dry: [
    [['dev', 'Track is drying out. Wets are cooking. Think about slicks.'], ['mags', 'Slicks in the warmers!']],
  ],
  damage: [
    [['{drv}', 'I clipped the wall. Front wing is damaged.'], ['dev', 'Copy. We will change the nose at the stop.'], ['mags', 'Nose on the trolley. Arrows ready.']],
    [['{drv}', 'Contact! I have lost part of the front wing.'], ['dev', 'Understood, {d}. We will fix it.']],
  ],
  puncture: [
    [['{drv}', 'Puncture! Tyre is gone, I am coming in!'], ['mags', 'Crew out, now!']],
  ],
  fuelOut: [
    [['{drv}', 'Engine is cutting out. I am out of fuel.'], ['dev', 'Bring it in, slowly.'], ['pip', 'In my defence, nobody told me to put more in.']],
  ],
  gain: [
    [['dev', '{d} is up to P{p}.'], ['toby', 'Yes!']],
    [['{drv}', 'Got him! That is P{p}.'], ['dev', 'Good move, {d}.']],
    [['dev', 'P{p} for {d}. Nice.']],
  ],
  lose: [
    [['dev', '{d} drops to P{p}.'], ['{drv}', 'I know. I can see them.']],
    [['dev', 'We lost one. P{p} now for car {n}.']],
  ],
  rivalPit: [
    [['dev', '{r} have boxed. Watch their stop.'], ['mags', 'Never mind them. Watch ours.']],
    [['toby', '{r} are in. Their crew is fast.'], ['lou', 'We are faster. We are also more handsome.']],
    [['dev', '{r} pitting. Their tyre man looks nervous.'], ['toby', 'I know that feeling.']],
  ],
  queue: [
    [['dev', 'Double stack! Car {n} is waiting behind.'], ['mags', 'Finish this car and reset FAST!']],
  ],
  lastLap: [
    [['dev', 'Last lap. Bring them home.'], ['mags', 'Crew, stand down. Fingers crossed.']],
  ],
  late: [
    [['dev', 'Too late to stop now, {d}. Bring it home.']],
  ],
};

const FINISH = {
  win: [[['dev', 'P1! P1! We have won the {x}!'], ['nico', 'Yes! Yes! That was the stop! The stop won it!'], ['mags', 'Get the champagne away from Lou.']]],
  podium: [[['dev', 'P{p} for {d}. That is a podium!'], ['toby', 'We are going to be on telly!'], ['mags', 'You are always on telly, Toby. Usually dropping a tyre.']]],
  points: [[['dev', 'P{p} for {d}. Points on the board.'], ['mags', 'Solid. Not a party, but solid.']]],
  none: [[['dev', '{d} finishes P{p}. No points.'], ['mags', 'We learn. We come back.']]],
};

const BOSS = {
  great: ['A splendid day for Brightwater. I shall be insufferable at dinner.', 'Marvellous. Our sponsors are weeping with joy. Or with sea spray.', 'That is what I pay you for. Not much, but that is what for.'],
  good: ['Respectable. I can work with respectable.', 'Points. Good. Now find me another two tenths in the pit lane.'],
  bad: ['I have seen faster stops at a petrol station.', 'The board will hear of this. The board is my cat, but still.', 'Next race, I want fewer fires and more points.'],
};

const merge = (base, more) => { for (const k in more) base[k] = (base[k] || []).concat(more[k]); return base; };
export const LINES = {
  IDLE: IDLE.concat(MORE_IDLE),
  TRACK_IDLE: merge(merge(TRACK_IDLE, MORE_TRACK), { neon: NEON_DAY.TRACK_IDLE }),
  START: START.concat(INTRO.START),
  TRACK_START: merge({ ...INTRO.TRACK_START }, { neon: NEON_DAY.TRACK_START }),
  BRIEF: merge({ ...INTRO.BRIEF }, { neon: NEON_DAY.BRIEF }),
  BOXCALL: BOXCALL.concat(EV.BOXCALL),
  REACT: merge(REACT, EV.REACT),
  EVENTS: merge(EVENTS, EV.EVENTS),
  FINISH: merge(FINISH, INTRO.FINISH),
  BOSS: merge(BOSS, INTRO.BOSS),
  FLAG,
  SHUTDOWN,
};

// Player-chosen names: every line is written with the defaults and swapped on the way out.
let renames = [];
export function setNames(pairs) {
  renames = [];
  for (const [from, to] of pairs) {
    if (!to || from === to) continue;
    renames.push([new RegExp(`\\b${from}\\b`, 'g'), to]);
    renames.push([new RegExp(`\\b${from.toUpperCase()}\\b`, 'g'), to.toUpperCase()]);
  }
}
export function rename(text) {
  // Park each new name behind a marker so one swap can't be swapped again
  // (say the mechanic is renamed "Nico").
  const hold = [];
  for (const [re, to] of renames) text = text.replace(re, () => { hold.push(to); return `\u0001${hold.length - 1}\u0002`; });
  return text.replace(/\u0001(\d+)\u0002/g, (_, i) => hold[+i]);
}

// What the crew has said lately, across races, so a bit can't come round again too soon.
// Keyed by a conversation's first line (as written, before renaming).
const HEARD_KEY = 'pitcrew26.heard.v1';
const heard = { n: 0, at: {} };
try { const s = JSON.parse(localStorage.getItem(HEARD_KEY)); if (s && s.at) Object.assign(heard, s); } catch (e) {}
let heardDirty = false;
function remember(key) { heard.at[key] = ++heard.n; heardDirty = true; }
export function saveHeard() {
  if (!heardDirty) return;
  heardDirty = false;
  // keep the file small: forget the oldest once it gets big
  const keys = Object.keys(heard.at);
  if (keys.length > 2500) keys.sort((a, b) => heard.at[a] - heard.at[b]).slice(0, keys.length - 2000).forEach(k => delete heard.at[k]);
  try { localStorage.setItem(HEARD_KEY, JSON.stringify(heard)); } catch (e) {}
}
// Lines that only make sense at certain times of day. A long season runs the tracks again at
// other times, so sunset chat must stay off a night race and floodlights off a day race.
const NIGHT_ONLY = /\b(floodlights?|midnight|night races?|under the lights|neon signs|all that neon|neon on the fuel|ten at night|two in the morning|beautiful night|all night|so purple|everything purple|four shadows|tight and dark|darker than it looks|dark out there|lit the bridge)\b/i;
const DUSK_ONLY = /\b(sunset|sundown|dusk|twilight|low sun|going purple|everything is orange|racing into gold)\b|\bsun (sets|goes down|is going down|is setting|is low|sits right on the horizon|is right behind)\b|start in daylight and finish/i;
const NOT_NIGHT = /\b(sun|suns|sunny|sunshine|sunburnt?|sunglasses|glare|daylight|shade|afternoon)\b|sand is so bright|exit is bright|eating breakfast/i;
const NOT_DAY = /\btonight\b/i;
function textFits(t, time) {
  if (NIGHT_ONLY.test(t) && time !== 'night') return false;
  if (DUSK_ONLY.test(t) && time !== 'dusk' && time !== 'sunset') return false;
  if (NOT_NIGHT.test(t) && time === 'night') return false;
  if (NOT_DAY.test(t) && time === 'day') return false;
  return true;
}
const textsOf = item => typeof item === 'string' ? [item] : Array.isArray(item[0]) ? item.map(l => l[1]) : [item[1]];
export const fitsTime = (item, time) => textsOf(item).every(t => textFits(t, time));
let timeNow = null;
// The time of day of the race being talked about; pickFresh only offers lines that fit it.
export function setTimeOfDay(t) { timeNow = t || null; }

const keyOf = item => typeof item === 'string' ? item : Array.isArray(item[0]) ? item[0][1] : item[1];

// Pick from a pool, least recently heard first: anything used waits until most of
// the rest of its pool has had a turn.
export function pickFresh(list, r = Math.random) {
  if (!list || !list.length) return null;
  if (timeNow) { const fit = list.filter(c => fitsTime(c, timeNow)); if (fit.length) list = fit; }
  const ranked = list.map(c => ({ c, at: heard.at[keyOf(c)] || 0, k: r() })).sort((a, b) => a.at - b.at || a.k - b.k);
  const window = Math.max(1, Math.ceil(list.length / 4));
  const pick = ranked[Math.floor(r() * window)].c;
  remember(keyOf(pick));
  return pick;
}

// Plays one conversation at a time. Every line of a conversation finishes before the
// next conversation starts; urgent ones jump the queue but never cut in mid-chat
// (only prio 3, a real emergency, does that). Small talk that has waited too long
// goes stale and is dropped.
export class Director {
  constructor(people, rnd) {
    this.people = people;
    this.r = rnd;
    this.queue = [];   // conversations waiting: { lines, prio, age }
    this.conv = null;  // lines left in the conversation now playing
    this.cur = null;   // the line on screen
    this.gap = 0;      // breath between conversations
    this.idleT = 4;
  }

  get talking() { return !!(this.cur || (this.conv && this.conv.length) || this.queue.length); }

  // vars: {d, drv (person key), n, p, t, r, x}
  say(conv, vars = {}, prio = 1) {
    if (!conv || !conv.length) return;
    const lines = conv.map(([who, txt]) => {
      const w = who === '{drv}' ? vars.drv || 'nico' : who;
      return { who: w, text: rename(txt).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') };
    });
    const item = { lines, prio, age: 0 };
    if (prio >= 3) {
      // Urgent radio (box calls, rain, damage, a white flag) breaks into whatever chat is on,
      // shows on the yellow panel, and queues behind any other urgent call already going.
      lines.forEach(l => { l.urgent = true; });
      if (this.cur && !this.cur.urgent) {
        lines[0].text = 'BREAKER! ' + lines[0].text;
        this.cur = null; this.conv = null; this.gap = 0;
      }
      const i = this.queue.findIndex(q => q.prio < 3);
      this.queue.splice(i < 0 ? this.queue.length : i, 0, item);
      this.queue = this.queue.filter(q => q.prio >= 2).slice(0, 5);
    }
    else if (prio === 2) {
      // behind urgent calls and other important ones, ahead of small talk
      const i = this.queue.findIndex(q => q.prio < 2);
      this.queue.splice(i < 0 ? this.queue.length : i, 0, item);
      this.queue = this.queue.filter(q => q.prio >= 2 || q === item).slice(0, 4);
    } else {
      // small talk only if nothing else is waiting
      if (this.queue.length) return;
      this.queue.push(item);
    }
    this.idleT = 3 + this.r() * 4;
  }

  sayFrom(list, vars, prio) { this.say(pickFresh(list, this.r), vars, prio); }

  // busy: true while a stop is underway (the radio holds everything until it's done).
  update(dt, busy, idlePool) {
    for (const q of this.queue) q.age += dt;
    this.queue = this.queue.filter(q => q.age < (q.prio >= 2 ? 25 : 8));
    if (this.cur) {
      this.cur.t += dt;
      const full = this.cur.text.length * 0.032;
      if (this.cur.t > full + 1.5 + this.cur.text.length * 0.018) {
        this.cur = null;
        if (this.conv && this.conv.length) this.cur = { ...this.conv.shift(), t: 0 };
        else { this.conv = null; this.gap = 0.9; }
      }
      return;
    }
    if (this.gap > 0) { this.gap -= dt; return; }
    if (busy) return;
    if (this.queue.length) {
      const item = this.queue.shift();
      this.conv = item.lines.slice(1);
      this.cur = { ...item.lines[0], t: 0 };
      return;
    }
    this.idleT -= dt;
    if (this.idleT <= 0 && idlePool) this.say(pickFresh(idlePool, this.r), {}, 0);
  }

  skip() {
    if (!this.cur) return;
    const full = this.cur.text.length * 0.032;
    if (this.cur.t < full) this.cur.t = full;
    else this.cur.t = 1e9;
  }
  clear() { this.queue = []; this.conv = null; this.cur = null; }
}

// Mags' pep talk as the cars line up: built fresh each race from parts, about the day's
// conditions, or about the basics when it's dry, mild and daylight.
const PEP_ORDER = ['finale', 'shutdown', 'rain', 'dry', 'heat', 'cold', 'night', 'dusk', 'sand', 'walls', 'doubleStack', 'tightLane', 'slick', 'long'];
export function pepTalk(track, r = Math.random) {
  setTimeOfDay(track.time);
  const has = m => track.mods.includes(m);
  const wet = track.weather.some(w => w.wet);
  const time = track.time || 'day';
  const c = new Set();
  if (track.finale) c.add('finale');
  if (track.shutdown) c.add('shutdown');
  if (wet) c.add('rain'); else if (track.dryNow) c.add('dry');
  if (has('heat')) c.add('heat');
  if (has('cold')) c.add('cold');
  if (time === 'night') c.add('night'); else if (time === 'dusk' || time === 'sunset') c.add('dusk');
  for (const m of ['sand', 'walls', 'doubleStack', 'tightLane']) if (has(m)) c.add(m);
  if (has('slick') && !wet) c.add('slick');
  if (track.laps >= 14) c.add('long');
  const mild = !wet && !has('heat') && !has('cold') && time === 'day';
  const say = list => ['mags', pickFresh(list, r)];
  const lines = [say(PEP.OPEN)];
  const keys = PEP_ORDER.filter(k => c.has(k) && PEP.COND[k]);
  if (mild) {
    lines.push(say(PEP.MILD));
    if (keys.length && r() < 0.5) lines.push(say(PEP.COND[keys[0]]));
  } else for (const k of keys.slice(0, 2)) lines.push(say(PEP.COND[k]));
  lines.push(say(PEP.CLOSE));
  if (r() < 0.6) lines.push(pickFresh(PEP.REPLY, r));
  return lines;
}
