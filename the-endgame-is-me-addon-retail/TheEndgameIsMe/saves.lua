-- The Endgame is Me: one save slot, the best score, New Game+ and the settings, kept in SavedVariables
-- (TheEndgameIsMeDB) where the browser game uses localStorage. The run itself is written out by the game's own
-- pack() and read back by its unpack(), so a Save and Quit comes back at the moment it left.

local ADDON, ns = ...
local RT = ns.RT
local S = RT.module("save")
local W = RT.module("world")
local floor = math.floor

local Store = {}
ns.Store = Store

-- Typed arrays in a save. The water grid is a few thousand cells of 0, 1 or 2: a string of digits. The path's distance
-- field is 57,600 numbers that the map can work out again, so it is left out and rebuilt on load.
function RT.packTyped(a)
  local n = a.length
  if n > 20000 then return "" end
  local small = true
  for i = 0, n - 1 do local v = a[i]; if v ~= floor(v) or v < 0 or v > 9 then small = false; break end end
  local t = {}
  for i = 0, n - 1 do t[i + 1] = small and string.char(48 + a[i]) or string.format("%.9g", a[i]) end
  return (small and "d" or "n") .. table.concat(t, small and "" or ",")
end
function RT.unpackTyped(name, s)
  local a = { __ta = name, length = 0 }
  if s == "" then a.__rebuild = true; return a end
  local kind, body = s:sub(1, 1), s:sub(2)
  local n = 0
  if kind == "d" then
    for i = 1, #body do a[n] = body:byte(i) - 48; n = n + 1 end
  else
    for num in body:gmatch("[^,]+") do a[n] = tonumber(num) or 0; n = n + 1 end
  end
  a.length = n
  return a
end

local DEFAULTS = { v = 1, best = 0, calm = false, mute = false, music = true, scale = 0, perf = false, look = nil, name = nil }

function Store.init()
  local db = _G.TheEndgameIsMeDB
  if type(db) ~= "table" then db = {}; _G.TheEndgameIsMeDB = db end
  for k, v in pairs(DEFAULTS) do if db[k] == nil then db[k] = v end end
  ns.DB = db
  return db
end

-- phase is 'play', or 'store' while the Hoard is open. Returns false (and keeps the last good save) if it cannot be written.
function Store.write(g, phase)
  if not ns.DB then return false end
  g.pgrid = nil; g.propsDirty = true   -- a lookup grid the game rebuilds on demand; no need to carry it
  local events = g.events
  g.events = { length = 0 }
  local ok, nodes = pcall(S.pack, g)
  g.events = events
  if not ok then
    RT.console.warn("The Endgame is Me: save failed: " .. tostring(type(nodes) == "table" and nodes.message or nodes))
    return false
  end
  ns.DB.save = { phase = phase or "play", nodes = nodes, level = g.map.n, score = floor(g.score), ng = g.ng or 0 }
  return true
end

function Store.info()
  local s = ns.DB and ns.DB.save
  if not s then return nil end
  return { level = s.level, score = s.score, ng = s.ng }
end

function Store.read()
  local s = ns.DB and ns.DB.save
  if not s or type(s.nodes) ~= "table" then return nil end
  local ok, g = pcall(S.unpack, s.nodes)
  if not ok or type(g) ~= "table" or not g.boss or not g.map then
    RT.console.warn("The Endgame is Me: the save could not be read, so it was dropped.")
    ns.DB.save = nil
    return nil
  end
  g.events = { length = 0 }
  return g, s.phase   -- the caller finishes the job with Store.mend(g), somewhere it is allowed to take its time
end

-- puts back what a save leaves out: the Clearing's path distances (two million sums, so call it from the loader)
function Store.mend(g)
  local m = g.map
  if m.pts and (not m.df or m.df.__rebuild) then m.df = W.pathField(m.pts) end
end

function Store.clear() if ns.DB then ns.DB.save = nil end end

-- beating the castle unlocks New Game+ for good; this is the build it carries forward
function Store.unlockPlus(g)
  local owned = RT.sarr(1, g.owned)
  ns.DB.plus = { owned = owned, lvl = RT.deep(g.lvl), slots = RT.deep(g.slots), ng = g.ng or 0 }
end
function Store.plus() return ns.DB and ns.DB.plus end
