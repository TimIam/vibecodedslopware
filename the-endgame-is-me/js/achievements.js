// Achievements: the list (the same ids are the API names in Steamworks), what has been earned on this machine, and
// handing each one to Steam when the game runs in the desktop build (window.slopDesktop.achieve, see the Electron
// wrapper's preload). In a browser they are only remembered here. Only games main.js actually plays earn anything
// (g.counts, as for tally.js): the title screen's attract fights, the Hoard's demo reel and headless tests do not.
//
// What triggers each one lives where the thing happens (world.js, the levels, main.js, appearance.js); they all call
// achieve(g, id), or achieveNow(id) for the few that are not about a game in progress.

export const ACHIEVEMENTS = [
  ['THATLL_DO', "That'll Do", 'Accept whatever came out of the randomizer.'],
  ['OH_GOD_NO', 'OH GOD NO', "Some things weren't meant for mortal eyes."],
  ['AIMLESS', 'Aimless', 'Achieve full aimlessness.'],
  ['BURNING_RAGE', 'Burning Rage', 'Achieve full vengeance.'],
  ['DO_YOU_PRACTICE', 'Do You Practice?', 'Equip a melee-only build.'],
  ['DO_YOU_FIGHT', 'Do You Fight?', 'Beat the game with a melee-only build.'],
  ['TEST_SUBJECT', 'Test Subject', 'Mutate all abilities.'],
  ['LIFE_FINDS_A_WAY', 'Life, Uh, Finds A Way', 'Change your loadout.'],
  ['ITS_EVOLUTION', "It's Evolution, Baby", 'Mutate an ability to max level.'],
  ['BECOME_DEATH', 'I Am Become Death', 'Mutate all abilities to max level.'],
  ['LEVEL_1', "They'll Pay For This!", 'Beat Level 1.'],
  ['LEVEL_2', 'The Countryside', 'Beat Level 2.'],
  ['LEVEL_3', 'The Peasants', 'Beat Level 3.'],
  ['LEVEL_4', 'The People In Their Thatched-Roof Cottages', 'Beat Level 4.'],
  ['LEVEL_5', 'Pontifex', 'Beat Level 5.'],
  ['LEVEL_6', 'A Night On The Town', 'Beat Level 6.'],
  ['LEVEL_7', 'Vengeance Is Mine!', 'Beat Level 7.'],
  ['NG_PLUS', 'Vengeance Is Mine! Again!', 'Beat NG+'],
  ['NG_PLUS_5', 'Vengeance Is For Suckers.', 'Beat NG+ 5'],
  ['EVERY_LAST_LAMPPOST', 'Every Last Lamppost!', 'Completely raze the Castle Town.'],
  ['TOTAL_ANNIHILATION', 'Total Annihilation', 'Completely level the Castle Keep!'],
  ['WHO_WAS_THAT_GUY', 'Who Was That Guy?', 'Kill the Horse guy.'],
  ['PARTY_WIPE', 'Party Wipe!', 'Kill all members of a 5-man party.'],
  ['RAID_WIPE', 'Raid Wipe!', 'Kill all members of a 25-man raid.'],
  ['FULL_CLEAR', 'Full Clear!', 'Kill all members of a 40-man raid.'],
  ['FOR_THE_HORSE', 'This Is For The Horse!', 'Have your necromancer raise the horse guy.'],
  ['STUNNING', 'Stunning!', 'Use one Stun Charge on 15 or more humans.'],
  ['VROOM_VROOM', 'Vroom, Vroom!', 'Trample 20 humans in one charge of Zoomies.'],
  ['BURNINATE', 'BURNINATE!', 'Consummate flames!'],
  ['WHIP_IT_GOOD', 'Whip It Good!', 'Strike 10 or more humans with one cast of Tail Whip.'],
  ['STOMP_STOMP', 'Stomp Stomp!', 'Use one Stomp on 25 or more humans.'],
  ['SLASHY', 'Slashy!', 'Use one Slash attack on 10 or more humans.'],
  ['BRRRRRR', 'Brrrrrr!', 'Use one Ice Floor on 25 or more humans.'],
  ['ZAP', 'ZAP!', 'Strike 40 of anything with one Lightning Beam.'],
  ['LITTER', 'Litter', 'Summon the max number of Gnashers.'],
  ['UGH_EVERYWHERE', "Ugh, It's Everywhere", 'Have a Spitter spit hit four or more.'],
  ['ABOMINATION', 'Abomination', 'Your necromancer raised a farm animal.'],
  ['UNHOLY', 'Unholy', 'Your necromancer raised a healer that gave you a bubble shield.'],
  ['MEGA', 'Mega', 'Have 1,000,000 points in the Hoard.'],
  ['SHAKA', 'Shaka!', 'Destroy the entire wall at the end of Level 6.'],
  ['SHAH_FLOOR_MAT', 'Shah (Floor) Mat!', 'Flatten His Royal Majesty.'],
  ['ALL_OF_IT', 'ALL Of It?!', 'Completely destroy the City Wall on Level 5.'],
  ['MILLICIDE', 'Milli-cide', 'Kill a total of 1000 humans across all playthroughs.'],
  ['KILLING_MACHINE', 'Killing Machine', 'Kill a total of 1000 humans in one playthrough.'],
  ['EXTINCTION_LEVEL', 'Extinction-Level Event', 'Kill a total of 50000 creatures across all playthroughs.'],
  ['REGICIDE', 'You Have Selected Regicide', 'The King is dead! Long Live the King!'],
  ['TOO_SLOW', 'Too Slow!', 'Kill the Horse Guy with a Swipe attack before he grabs your fur.'],
  ['HATCHED_PERFECT', 'Hatched Perfect', 'Beat the game without ever changing Loadout.'],
  ['LUMBERING_NUKE', 'Lumbering Nuke', 'Completely level EVERYTHING.'],
  ['MOO', 'Moo.', 'Unlock the Secret Cow Skin.'],
  ['DANSE_MOOCABRE', 'Danse Moocabre', 'Bear witness to the moost evil soirée.'],
].map(([id, name, desc]) => ({ id, name, desc }));
export const BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

const KEY = 'bosshours.achievements.v1';
let got = null;
function load() {
  if (got) return got;
  try { got = new Set(JSON.parse(globalThis.localStorage?.getItem(KEY) || '[]')); } catch { got = new Set(); }
  return got;
}
const desktop = () => globalThis.window?.slopDesktop;
export const has = id => load().has(id);
export const earned = () => [...load()];
export const listeners = [];   // anything that wants to hear of each new one (none yet: Steam shows its own)

// Lifetime counts for the "across all playthroughs" ones: 'humans' (heroes, the horse guy, the king, villagers and
// townsfolk) and 'creatures' (all of those, pets, animals, steers and Minotaurs). The first time they are needed they
// start from the Humanstiary's kill counts (tally.js), so kills from before the achievements still count.
const COUNT_KEY = 'bosshours.counts.v1', PETS = { pet: 1, imp: 1, voidwalker: 1 }, HUMAN_CRITTERS = { villager: 1, city_folk: 1 };
let counts = null, countTimer = 0;
function loadCounts() {
  if (counts) return counts;
  try { counts = JSON.parse(globalThis.localStorage?.getItem(COUNT_KEY) || 'null'); } catch { counts = null; }
  if (!counts) {
    counts = { humans: 0, creatures: 0 };
    let tl = {};
    try { tl = JSON.parse(globalThis.localStorage?.getItem('bosshours.tally.v1') || '{}') || {}; } catch {}
    for (const [k, n] of Object.entries(tl)) {
      const [t, kind] = k.split(':');
      if (t === 'p') continue;
      counts.creatures += n;
      if ((t === 'u' && !PETS[kind]) || (t === 'c' && HUMAN_CRITTERS[kind])) counts.humans += n;
    }
  }
  return counts;
}
// one more (only in a game being played); returns the new lifetime total
export function bump(g, key, n = 1) {
  const c = loadCounts();
  if (!g?.counts) return c[key] || 0;
  c[key] = (c[key] || 0) + n;
  if (key === 'creatures' && c[key] >= 50000) achieveNow('EXTINCTION_LEVEL');
  if (!countTimer && typeof setTimeout === 'function') countTimer = setTimeout(() => { countTimer = 0; try { globalThis.localStorage?.setItem(COUNT_KEY, JSON.stringify(c)); } catch {} }, 1500);
  return c[key];
}
export const lifetime = key => loadCounts()[key] || 0;

// earned, whatever game is running (a settings screen, the title)
export function achieveNow(id) {
  if (!BY_ID[id]) { console.warn('no such achievement', id); return false; }
  const s = load();
  if (s.has(id)) return false;
  s.add(id);
  // (one that happened before Steam was there, or offline, catches up at the next start: syncAll)
  try { desktop()?.achieve?.(id); } catch { /* no Steam: remembered here all the same */ }
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify([...s])); } catch {}
  for (const f of listeners) try { f(BY_ID[id]); } catch {}
  return true;
}
// earned in a game, if it is a real one
export function achieve(g, id) { return g?.counts ? achieveNow(id) : false; }
// on start-up, hand Steam everything already earned here (an earlier offline session, or one before the desktop build
// knew about Steam)
export function syncAll() { for (const id of load()) try { desktop()?.achieve?.(id); } catch {} }
