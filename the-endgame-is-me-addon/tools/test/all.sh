#!/bin/bash
# every level, a few seeds and loadouts: the Lua port against the browser game
steps=${1:-3000}
for lv in 1 2 3 4 5 6 7; do for seed in 1 77; do for kit in 0 1 2 3; do bash tools/test/diff.sh $seed $lv $steps 20 $kit; done; done; done
