// Runs a Lua script on Fengari, a Lua VM written in JavaScript. Its math library is the browser's own Math, so a
// trace from here can be compared bit for bit with the game's JS (stock Lua's sin and cos differ in the last place,
// which a long simulation eventually turns into a different dice roll). Fengari is Lua 5.3, so the few 5.1 names the
// addon uses are put back first.
//   node tools/test/fengari.mjs tools/test/trace.lua 1 1 6000 20
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const [script, ...args] = process.argv.slice(2);
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const run = code => {
  if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) { console.error(to_jsstring(lua.lua_tostring(L, -1))); process.exit(1); }
};
run(`unpack = unpack or table.unpack
math.pow = math.pow or function(a, b) return a ^ b end
math.atan2 = math.atan2 or math.atan
loadstring = loadstring or load
arg = { [0] = ${JSON.stringify(script)}, ${args.map(a => JSON.stringify(a)).join(', ')} }`);
if (lauxlib.luaL_dofile(L, to_luastring(script)) !== lua.LUA_OK) { console.error(to_jsstring(lua.lua_tostring(L, -1))); process.exit(1); }
