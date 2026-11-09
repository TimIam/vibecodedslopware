#!/bin/bash
# Every global the addon's Lua reads or writes, from the compiler's own listing. Anything read should be stock Lua 5.1
# that WoW keeps (no io, os or debug) or go through _G; anything written is a leak.   usage: tools/test/globals.sh [folder]
dir=${1:-TheEndgameIsMe}
for f in "$dir"/*.lua; do luac5.1 -l -p "$f" | grep -E "GETGLOBAL|SETGLOBAL" | sed -e 's/.*\(GETGLOBAL\|SETGLOBAL\).*; \(.*\)/\1 \2/'; done | sort | uniq -c | sort -k2,2 -k1,1nr
