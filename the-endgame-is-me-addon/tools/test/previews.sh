#!/bin/bash
# inside WSL from the addon folder: candidate frames for the download page's picture (kit -1: see shot.lua)
for spec in "1 1 7000" "1 1 7600" "5 1 7300" "9 1 8000" "3 7 1700" "3 7 2600"; do
  set -- $spec
  ${LUA:-lua5.1} tools/test/shot.lua $1 $2 $3 build/prev_$1_$2_$3.ppm -1 40 2>&1 | tail -1
done
