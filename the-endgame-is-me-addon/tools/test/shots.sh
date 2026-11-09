#!/bin/bash
# inside WSL from the addon folder: a frame and timings from every level
for lv in 1 2 3 4 5 6 7; do ${LUA:-lua5.1} tools/test/shot.lua ${SEED:-3} $lv ${STEPS:-1500} build/shot$lv.ppm ${KIT:-1} ${EVERY:-1} 2>&1 | tail -4; done
