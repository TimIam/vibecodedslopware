#!/bin/bash
# The Lua port against the browser game, with the same math library on both sides (see fengari.mjs): every level, two
# seeds, four loadouts. Every line should say MATCH.   usage: bash tools/test/exact.sh [steps]
cd "$(dirname "$0")/../.."
steps=${1:-8000}
tmp=$(mktemp -d)
# REF_GAME can be given (made by tools/test/refgame.mjs where git can read the repository, e.g. outside WSL)
export REF_GAME=${REF_GAME:-$(node tools/test/refgame.mjs)}
[ -d "$REF_GAME" ] || { echo "no reference game: run node tools/test/refgame.mjs"; exit 1; }
for lv in 1 2 3 4 5 6 7; do for seed in ${SEEDS:-1 77}; do for kit in ${KITS:-0 1 2 3}; do
  node tools/test/trace.mjs $seed $lv $steps 20 $kit > $tmp/js.txt
  node tools/test/fengari.mjs tools/test/trace.lua $seed $lv $steps 20 $kit > $tmp/lua.txt 2>&1
  if cmp -s $tmp/js.txt $tmp/lua.txt; then echo "MATCH level=$lv seed=$seed kit=$kit steps=$steps"
  else echo "DIFFER level=$lv seed=$seed kit=$kit"; diff $tmp/js.txt $tmp/lua.txt | head -6; fi
done; done; done
rm -rf $tmp
