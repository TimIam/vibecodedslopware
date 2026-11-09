#!/bin/bash
# usage (inside WSL, from the addon folder): tools/test/diff.sh seed level steps every   → prints the first lines that differ
node.exe tools/test/trace.mjs "$@" | tr -d '\r' > /tmp/trace_js.txt
${LUA:-lua5.1} tools/test/trace.lua "$@" > /tmp/trace_lua.txt 2>&1
if cmp -s /tmp/trace_js.txt /tmp/trace_lua.txt; then echo "MATCH seed=$1 level=$2 steps=$3 ($(wc -l < /tmp/trace_js.txt) samples)"; else echo "DIFFER seed=$1 level=$2"; diff /tmp/trace_js.txt /tmp/trace_lua.txt | head -${LINES_SHOWN:-8}; fi
