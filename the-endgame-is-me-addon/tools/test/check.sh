#!/bin/bash
# Everything that can be checked without the game client, on both built addon folders. Needs lua5.1 and luac5.1.
#   usage (from the addon folder; on Windows through tools/wsl.sh): bash tools/test/check.sh [frames per level]
frames=${1:-150}
fail=0
for d in TheEndgameIsMe ../the-endgame-is-me-addon-retail/TheEndgameIsMe; do
  for f in "$d"/*.lua; do luac5.1 -p "$f" || fail=1; done
  lua5.1 tools/test/smoke.lua "$d" "$frames" 2>&1 | grep -v "^level [2-6]" || fail=1
done
if cmp -s <(cd TheEndgameIsMe && cat *.lua) <(cd ../the-endgame-is-me-addon-retail/TheEndgameIsMe && cat *.lua); then echo "both builds have identical Lua"; else echo "THE TWO BUILDS DIFFER"; fail=1; fi
lua5.1 tools/test/water.lua || fail=1
lua5.1 tools/test/looks.lua | tail -1
writes=$(bash tools/test/globals.sh | grep -c SETGLOBAL)
echo "globals written by the addon's Lua: $writes"
[ "$writes" = "0" ] || fail=1
exit $fail
