#!/bin/bash
# runs a command inside WSL from the addon folder, with the unpacked Lua 5.1 on the path (see tools/README)
export LD_LIBRARY_PATH=$HOME/lua51/root/usr/lib/x86_64-linux-gnu
export PATH=$HOME/lua51/root/usr/bin:$PATH
cd "$(dirname "$0")/.."
exec "$@"
