// Writes the Steamworks bulk-import CSVs (App Admin > Stats & Achievements > Achievements > Bulk Import/Export) from the
// game's own list, the-endgame-is-me/js/achievements.js: definitions.csv (every one Client-set, none hidden:
// "spoiler" false) and localization.csv (the English names and descriptions, in the layout Steamworks exports once the
// definitions are in). Upload definitions.csv first and save, then localization.csv and the icons (png/, named
// <API_NAME>_ACHIEVED.png and <API_NAME>_UNACHIEVED.png by save.mjs).
//   node make-csv.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { ACHIEVEMENTS } = await import(pathToFileURL(path.join(here, '../../../the-endgame-is-me/js/achievements.js')).href);
const q = s => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
const write = (name, lines) => { fs.writeFileSync(path.join(here, name), lines.join('\n') + '\n'); console.log(name + ':', lines.length - 1, 'rows'); };

write('definitions.csv', [
  '"api_name (required, unique; the name your game passes to the API)",setid (optional; the id of a set that already exists),"permission (one of Client, GameServer, OfficialGameServer)",spoiler (true or false),archived (true or false),"progress_stat_name (optional; the name of a stat that already exists, blank for no progress bar)","progress_stat_min (number, no lower than the stat\'s own min)","progress_stat_max (number, above min and no higher than the stat\'s own max)"',
  ...ACHIEVEMENTS.map(a => [a.id, '', 'Client', 'false', 'false', '', 0, 0].join(',')),
]);
write('localization.csv', [
  'api_name (required; must match an api_name from the definitions CSV),field (name or description),english',
  ...ACHIEVEMENTS.flatMap(a => [[a.id, 'name', q(a.name)], [a.id, 'description', q(a.desc)]].map(r => r.join(','))),
]);
