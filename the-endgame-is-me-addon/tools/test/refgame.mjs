// The browser game the addon is made from, as files the reference run (trace.mjs) can import: the-endgame-is-me/js
// at GAME_COMMIT, with the rule changes the build applies (RULE_PATCHES in tools/build.mjs). Writes build/ref-game/js
// and prints its path. Without a GAME_COMMIT it prints the working tree's copy.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { GAME_COMMIT, RULE_PATCHES, gameSource } from '../build.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (!GAME_COMMIT) { console.log(path.resolve(root, '../the-endgame-is-me/js')); process.exit(0); }
const out = path.join(root, 'build', 'ref-game', 'js');
fs.rmSync(out, { recursive: true, force: true });
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', GAME_COMMIT, 'the-endgame-is-me/js/'], { cwd: path.resolve(root, '..'), encoding: 'utf8' })
  .split('\n').filter(f => f.endsWith('.js')).map(f => f.replace(/^the-endgame-is-me\/js\//, ''));
for (const rel of files) {
  let src = gameSource(rel);
  for (const [from, to] of RULE_PATCHES[rel.replace(/\.js$/, '')] || []) {
    if (src.split(from).length !== 2) throw new Error(`${rel}: a rule patch does not match exactly once: ${from.slice(0, 60)}`);
    src = src.replace(from, () => to);
  }
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.writeFileSync(path.join(out, rel), src);
}
// the game's modules are ES modules; a package.json beside them says so to Node
fs.writeFileSync(path.join(out, '..', 'package.json'), '{ "type": "module" }\n');
console.log(out);
