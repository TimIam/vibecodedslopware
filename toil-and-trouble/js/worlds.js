// worlds.js — the seven holiday worlds, in play order. Each level is either a hand-made one from levels.js (by id)
// or a recipe for gen.js. Blast cauldrons (cannons) are only required in Easter, Valentine's and Thanksgiving.
import { buildLevel } from './gen.js';
import { BY_ID } from './levels.js';

const W = (id, name, holiday, music, out, inn, foes, boss, bossName, levels, extra = {}) => ({ id, name, holiday, music, out, inn, foes, boss, bossName, levels, ...extra });

export const WORLDS = [
  W('hallo', 'Gourd Almighty', 'Halloween', 'halloween', 'hallo_out', 'hallo_in', 'yhkds', 'gourd', 'The Gourdfather', [
    { name: 'Pumpkin Patch Panic', kind: 'walk', where: 'out', blurb: 'Every one of them is watching.' },
    { name: 'Creaky Manor', kind: 'walk', where: 'in', blurb: 'The floorboards tell on you.' },
    { name: 'Hayride to Heck', kind: 'ride', where: 'out', blurb: 'Hold on to your hat.' },
    { name: 'Cobweb Cellars', kind: 'walk', where: 'in', blurb: 'Mind the dust sheets.' },
    { hand: 'mine', name: 'Cinder Mine', blurb: 'One cauldron, no brakes, plenty of lava.' },
  ]),
  W('july', 'Land of the Free Refills', 'Independence Day', 'july', 'july_out', 'july_in', 'ytkdw', 'kaboom', 'Colonel Kaboom', [
    { name: 'Picnic Panic', kind: 'walk', where: 'out', blurb: 'Bring a blanket. Bring a cauldron.' },
    { name: 'Sparkler Warehouse', kind: 'walk', where: 'in', blurb: 'Absolutely no open flames. Ha.' },
    { name: "Rocket's Red Climb", kind: 'climb', theme: 'july_rocket', blurb: 'All the way up the big one.' },
    { name: 'Fuse Box Express', kind: 'ride', where: 'in', blurb: 'The fuse is already lit.' },
    { name: 'Bunting Boulevard', kind: 'walk', where: 'out', blurb: 'Parade route. Mind the band.' },
  ]),
  W('pat', 'Shamrock Bottom', "St. Patrick's Day", 'patrick', 'pat_out', 'pat_in', 'yskhd', 'goldgrip', 'Seamus Goldgrip', [
    { name: 'Clover Over', kind: 'walk', where: 'out', blurb: 'Four leaves, zero luck.' },
    { name: 'Pot Luck Vault', kind: 'walk', where: 'in', blurb: 'Counting houses count you back.' },
    { name: 'Rainbow Rapids', kind: 'ride', where: 'out', blurb: 'The end of the rainbow is a cliff.' },
    { name: 'Stone Wall Scramble', kind: 'walk', where: 'out', blurb: 'Sheep have right of way.' },
    { name: 'Copper Kettle Mint', kind: 'walk', where: 'in', blurb: 'Fresh coins, still warm.' },
  ]),
  W('easter', 'Hare-Raising Heights', 'Easter', 'easter', 'easter_out', 'easter_in', 'yhwdb', 'egg', 'The Eggsecutioner', [
    { name: 'Egg Hunt Havoc', kind: 'walk', where: 'out', cannons: true, blurb: 'They hid them in the cauldrons.' },
    { name: 'Choc Block Factory', kind: 'walk', where: 'in', cannons: true, blurb: 'Hollow on the inside. Like the guards.' },
    { name: 'Conveyor Calamity', kind: 'ride', where: 'in', blurb: 'Quality control is a cliff.' },
    { name: 'Blossom Barrage', kind: 'walk', where: 'out', cannons: true, blurb: 'Petals everywhere. Bishops too.' },
    { name: 'Bunny Hill Hop', kind: 'walk', where: 'out', cannons: true, blurb: 'The hills are alive with hopping.' },
    { name: 'Basket Case', kind: 'walk', where: 'in', cannons: true, blurb: 'Wicker, wicker everywhere.' },
  ]),
  W('val', 'Heartburn Boulevard', "Valentine's Day", 'valentine', 'val_out', 'val_in', 'dtkwb', 'cupid', 'Cupidity', [
    { name: 'Rose Garden Rumble', kind: 'walk', where: 'out', cannons: true, blurb: 'Every rose has its deacon.' },
    { name: 'Bonbon Mansion', kind: 'walk', where: 'in', cannons: true, blurb: 'Soft centres, hard landings.' },
    { name: 'Love Tunnel Luge', kind: 'ride', where: 'in', blurb: 'Dim lights. Sharp turns.' },
    { name: "Cupid's Shooting Gallery", kind: 'walk', where: 'out', cannons: true, blurb: 'Hearts on target. Witches too.' },
    { name: 'Chocolate Box Attic', kind: 'walk', where: 'in', cannons: true, blurb: 'Nobody ever eats the coconut ones.' },
  ]),
  W('thanks', 'The Gravy Train', 'Thanksgiving', 'thanks', 'thanks_out', 'thanks_in', 'ybkht', 'gobble', 'Gobblezilla', [
    { name: 'Cornfield Chaos', kind: 'walk', where: 'out', cannons: true, blurb: 'Lost in the maize. Literally.' },
    { name: 'All Aboard the Gravy', kind: 'ride', where: 'in', blurb: 'Next stop: seconds.' },
    { name: 'Feast Hall Fiasco', kind: 'walk', where: 'in', cannons: true, blurb: 'Elbows off the table.' },
    { name: 'Haystack Hop', kind: 'walk', where: 'out', cannons: true, blurb: 'Needles optional.' },
    { name: 'Pie Hard', kind: 'walk', where: 'in', cannons: true, blurb: 'Crust in show.' },
    { name: 'Leftover Line', kind: 'ride', where: 'out', blurb: 'Nobody wanted the sprouts.' },
  ]),
  W('xmas', 'Yule Be Sorry', 'Christmas', 'christmas', 'xmas_out', 'xmas_in', 'dbtkw', 'sleigh', "The Witchfinder's Naughty Sleigh", [
    { name: 'Snowdrift Slog', kind: 'walk', where: 'out', blurb: 'Knee-deep and rising.' },
    { name: 'Toy Workshop Tantrum', kind: 'walk', where: 'in', blurb: 'Some assembly required.' },
    { hand: 'village', name: 'Lantern Lane', blurb: 'Every window is watching. So are the torches.' },
    { name: 'Sleigh Ride Slide', kind: 'ride', where: 'out', blurb: 'Bells, ice, and no reins.' },
    { name: 'Wrapping Room Rampage', kind: 'walk', where: 'in', blurb: 'Tape everywhere. Mostly on you.' },
  ]),
];

let built = null;
// every playable level in order, each tagged with world/stage indices; the boss closes each world
export function allLevels() {
  if (built) return built;
  built = [];
  WORLDS.forEach((w, wi) => {
    w.levels.forEach((L, li) => {
      const id = `${w.id}${li + 1}`;
      let def;
      if (L.hand) def = { ...BY_ID[L.hand], name: L.name, blurb: L.blurb };
      else {
        const theme = L.theme || (L.where === 'in' ? w.inn : w.out);
        def = buildLevel({
          id, name: L.name, blurb: L.blurb, theme, kind: L.kind, seed: L.seed || (wi * 97 + li * 13 + 5),
          len: L.len || (L.kind === 'ride' ? 300 + wi * 10 : 260 + wi * 14), diff: Math.min(1, 0.15 + wi * 0.13 + li * 0.03),
          cannons: !!L.cannons, indoor: L.where === 'in', foes: w.foes, world: w.id, music: L.kind === 'ride' ? (wi % 2 ? 'ride' : 'mine') : w.music,
          bonusRoom: L.kind === 'walk',
        });
      }
      def.id = id; def.wi = wi; def.li = li; def.worldName = w.name;
      built.push(def);
    });
    const boss = buildLevel({ id: w.id + 'B', name: w.bossName, blurb: 'Boss of ' + w.name + '.', theme: w.boss === 'sleigh' || w.boss === 'cupid' || w.boss === 'gobble' ? w.inn : w.out, kind: 'boss', seed: wi, boss: w.boss, world: w.id, music: wi % 2 ? 'boss2' : 'boss' });
    boss.id = w.id + 'B'; boss.wi = wi; boss.li = w.levels.length; boss.isBoss = true; boss.worldName = w.name;
    built.push(boss);
  });
  return built;
}
