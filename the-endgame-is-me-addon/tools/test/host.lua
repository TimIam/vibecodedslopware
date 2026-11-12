-- Loads the addon's runtime and the transpiled game under plain Lua 5.1 (or LuaJIT), with no WoW client.
-- usage: local ns = dofile("tools/test/host.lua")   (run from the addon folder)
local ns = {}
ns.bit = rawget(_G, "bit") or dofile("tools/test/bit.lua")
local function load(file)
  local f, err = loadfile(file)
  if not f then error(err, 0) end
  return f("TheEndgameIsMe", ns)
end
ns.load = load
-- a missed string index (s[i] on a string) is silent in Lua; under test it is an error
getmetatable("").__index = function(s, k) if type(k) == "number" then error("a string was indexed with a number", 2) end return string[k] end
load("src/rt.lua")
local RT = ns.RT
RT.print = print
RT.now = function() return os.time() * 1000 end
RT.perfNow = function() return os.clock() * 1000 end
-- RT.host comes from rt.lua; the canvas shim adds to it
ns.loadGame = function(mods)
  for _, m in ipairs(mods) do load("build/game_" .. m:gsub("/", "_") .. ".lua") end
end
ns.SIM = { "props", "smoke", "levels/forest", "levels/clearing", "levels/farms", "levels/village", "levels/wall", "levels/city", "levels/castle", "levels/index", "world" }
ns.loadAll = function()
  load("src/canvas.lua")
  load("src/keys.lua")   -- the HUD asks it what to write under the ability buttons
  ns.loadGame({ "props", "smoke", "art" })
  load("src/gfx.lua")
  ns.loadGame({ "levels/forest", "levels/clearing", "levels/farms", "levels/village", "levels/wall", "levels/city", "levels/castle", "levels/index", "world", "render" })
  load("src/sprites.lua")   -- stands in front of the renderer's drawUnit and drawAdd
end
return ns
