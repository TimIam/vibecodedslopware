-- Loads a built addon folder the way the client would (the TOC's file list, in order, each chunk called with the
-- addon name and a shared table) against tools/test/wowstub.lua, then plays it: opens the window, starts a run, walks
-- and fights, pauses, saves, reloads the save, visits every level and the Hoard, wins, and checks the picture the
-- texture grid would show against the frame the game drew.
--   lua5.1 tools/test/smoke.lua [addon folder] [frames per level]
local dir = arg[1] or "TheEndgameIsMe"
local perLevel = tonumber(arg[2] or 240)
local Stub = dofile("tools/test/wowstub.lua")
local say = Stub.print
getmetatable("").__index = function(s, k) if type(k) == "number" then error("a string was indexed with a number", 2) end return string[k] end

local ADDON = "TheEndgameIsMe"
local ns = {}
local toc = assert(io.open(dir .. "/" .. ADDON .. ".toc")):read("*a")
local files = 0
for line in toc:gmatch("[^\r\n]+") do
  if line:sub(1, 2) ~= "##" and line:match("%.lua$") then
    local f, err = loadfile(dir .. "/" .. line)
    if not f then error(err, 0) end
    f(ADDON, ns)
    files = files + 1
  end
end
assert(toc:match("## Interface: %d+"), "TOC has no Interface line")
assert(toc:match("## SavedVariables: TheEndgameIsMeDB"), "TOC does not declare the saved variable")
say("loaded " .. files .. " files from " .. dir)

-- nothing but the addon's intended globals may leak
local allowed = { TheEndgameIsMeDB = 1, TheEndgameIsMeFrame = 1, SLASH_THEENDGAMEISME1 = 1, SLASH_THEENDGAMEISME2 = 1, TheEndgameIsMe_OnCompartmentClick = 1 }
local before = {}
for k in pairs(_G) do before[k] = true end
Stub.event("ADDON_LOADED", "SomeOtherAddon")
Stub.event("ADDON_LOADED", ADDON)
assert(type(TheEndgameIsMeDB) == "table", "saved variable table was not made")

local RT, A, D = ns.RT, ns.App, ns.Display
local World = RT.modules.world
local function frames(n, dt) for _ = 1, n do Stub.tick(dt or 1 / 60) end end
local function settle(what)
  local n = 0
  while A.mode == "loading" do frames(1); n = n + 1; assert(n < 20000, "loading never finished: " .. what) end
  assert(A.mode ~= "error", "error while " .. what .. ": " .. tostring(A.err))
  return n
end

-- what the grid of textures shows, worked out from their anchors and colours, against the frame the game drew
local function checkPicture(where)
  local snap = RT.Screen.snapshot()
  local view, grid = D.view, D.grid
  local gp = grid.points.TOPLEFT
  local seen, bad = {}, 0
  for _, t in ipairs(grid.regions) do
    local p = t.points.TOPLEFT
    local sx, sy = gp.x + p.x - (D.sx or 0), -(gp.y + p.y) - (D.sy or 0)
    if sx >= 0 and sx < 320 and sy >= 0 and sy < 180 then
      local i = sy * 320 + sx + 1
      assert(not seen[i], where .. ": two textures on one pixel")
      seen[i] = true
      local v = snap[i]
      local r, g, b = math.floor(v / 65536), math.floor(v / 256) % 256, v % 256
      if math.abs(t.vr * 255 - r) > 0.01 or math.abs(t.vg * 255 - g) > 0.01 or math.abs(t.vb * 255 - b) > 0.01 then bad = bad + 1 end
    end
  end
  local n = 0
  for _ in pairs(seen) do n = n + 1 end
  assert(n == 320 * 180, where .. ": the grid covers " .. n .. " of 57600 pixels")
  assert(bad == 0, where .. ": " .. bad .. " pixels on the grid differ from the frame")
end

-- open the window
SlashCmdList["THEENDGAMEISME"]("")
local f = TheEndgameIsMeFrame
assert(f and f:IsShown(), "the slash command did not open the window")
local t = os.clock()
local n = settle("building the screen")
say(string.format("screen built in %d frames (%.2f s of Lua), %d textures", n, os.clock() - t, Stub.textures))
assert(A.mode == "menu", "expected the menu, got " .. A.mode)
assert(not D.view.keyboard, "the menu should not take the keyboard")
assert(not Stub.button("Continue").on, "Continue should be off with no save")

-- appearance: change a few things, look at the preview
Stub.click("Appearance")
frames(20)
Stub.click(">"); Stub.click(">")
frames(40)
checkPicture("appearance")
Stub.click("Done")
assert(A.mode == "menu")

-- a new run
Stub.click("New game")
t = os.clock()
n = settle("starting a run")
say(string.format("level 1 ready in %d frames (%.2f s of Lua)", n, os.clock() - t))
assert(A.mode == "play" and D.view.keyboard, "the run should be playing with the keyboard")
assert(TheEndgameIsMeDB.save and TheEndgameIsMeDB.save.level == 1, "no save was written at the start of the run")
local view = D.view
local g = A.g
local scale = view:GetEffectiveScale()
local function aim(x, y) Stub.cursor = { (view:GetLeft() + x) * scale, (view:GetTop() - y) * scale } end
aim(250, 90)
local mx = D.cursor()
assert(math.abs(mx - 250) < 0.01, "cursor maths is off: " .. mx)
Stub.key(view, "D", true)
view.scripts.OnMouseDown(view, "LeftButton")
local x0 = g.boss.x
frames(120)
assert(g.boss.x > x0 + 20, "the boss did not walk")
assert(g.score > 0, "walking the path scored nothing")
Stub.key(view, "D", false)
view.scripts.OnMouseUp(view, "LeftButton")
Stub.key(view, "SPACE", true); Stub.key(view, "SPACE", false)
view.scripts.OnMouseDown(view, "RightButton")
frames(30)
checkPicture("level 1")
Stub.key(view, "ENTER", true)
assert(view.propagate == true, "a key the game does not use should be passed on to WoW")
Stub.key(view, "W", true)
assert(view.propagate == false, "a movement key should not be passed on")
Stub.key(view, "W", false)

-- pause, save and quit, continue
Stub.key(view, "ESCAPE", true)
assert(A.mode == "paused" and not view.keyboard, "Esc should pause and release the keyboard")
local score = g.score
frames(30)
assert(g.score == score, "the game ran while paused")
Stub.click("Save and quit")
assert(A.mode == "menu")
assert(Stub.button("Continue").on, "Continue should be on after Save and quit")
-- the save must survive being written to disk: nothing but plain data, no NaN or infinity
local function plain(v, depth)
  local tv = type(v)
  if tv == "table" then for k, x in pairs(v) do assert(type(k) == "string" or type(k) == "number", "bad key in save"); plain(x, depth + 1) end
  elseif tv == "number" then assert(v == v and v ~= math.huge and v ~= -math.huge, "a NaN or infinity in the save")
  else assert(tv == "string" or tv == "boolean", "a " .. tv .. " in the save") end
end
plain(TheEndgameIsMeDB, 0)
-- and it must come back the same after the client writes it out as Lua source and reads it in again (a /reload)
local function dump(v, out, depth)
  assert(depth < 40, "the save is nested too deep (a cycle?)")
  local tv = type(v)
  if tv == "table" then
    out[#out + 1] = "{"
    for k, x in pairs(v) do
      out[#out + 1] = type(k) == "number" and ("[" .. string.format("%.17g", k) .. "]=") or ("[" .. string.format("%q", k) .. "]=")
      dump(x, out, depth + 1)
      out[#out + 1] = ","
    end
    out[#out + 1] = "}"
  elseif tv == "number" then out[#out + 1] = string.format("%.17g", v)
  elseif tv == "string" then out[#out + 1] = string.format("%q", v)
  else out[#out + 1] = tostring(v) end
end
local function same(a, b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= "table" then return a == b end
  for k, x in pairs(a) do if not same(x, b[k]) then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end
local text = {}
dump(TheEndgameIsMeDB.save, text, 0)
text = table.concat(text)
local back = assert(loadstring("return " .. text))()
assert(same(back, TheEndgameIsMeDB.save), "the save changed on its way through the saved-variables file")
TheEndgameIsMeDB.save = back
say(string.format("save: %d KB as saved-variables text", #text / 1024))
Stub.click("Continue")
settle("loading the save")
assert(A.mode == "paused", "a loaded run should start on break")
assert(math.abs(A.g.score - score) < 1e-6 and A.g ~= g, "the loaded run is not the saved one")
assert(A.g.rng.rngState() == g.rng.rngState(), "the dice did not survive the save")
Stub.click("Resume")
g = A.g
frames(60)
checkPicture("after loading")

-- a real fight starting pauses the game
Stub.combat = true
Stub.event("PLAYER_REGEN_DISABLED")
assert(A.mode == "paused", "entering combat should pause")
Stub.click("Resume")
frames(10)
Stub.combat = false

-- the Hoard: buy, upgrade, change a slot, move on
g.points = 500000
g.store = true; g.events.push = nil
RT.push(g.events, "store")
frames(2)
assert(A.mode == "store", "the Hoard did not open")
Stub.click("Lightning Beam")
Stub.click("Mutate")
assert(RT.has(g.owned, "beam"), "buying an ability did not work")
Stub.click("Mutate")
assert((g.lvl.beam or 0) == 1, "upgrading an ability did not work")
Stub.click("LMB:")
local texts = table.concat(Stub.texts(), " | ")
assert(texts:find("THE HOARD", 1, true) and texts:find("points", 1, true), "the Hoard panel is missing its text")
plain(TheEndgameIsMeDB, 0)

-- every level: load it, play a while with keys held, scroll, check the picture
for lv = 2, 7 do
  Stub.click("Onward")
  t = os.clock()
  n = settle("loading level " .. lv)
  local took = os.clock() - t
  assert(A.mode == "play" and g.map.n == lv, "expected level " .. lv)
  g.boss.maxhp = 1e9; g.boss.hp = 1e9
  -- put the boss mid-map on the sideways levels, so the camera has to scroll both ways while it walks
  if g.map.scroll == "x" then g.boss.x = math.min(g.map.w - 200, 430) end
  local keys = lv % 2 == 0 and { "D", "W" } or { "A", "S" }
  if lv >= 6 then keys = { "W" } end
  for _, k in ipairs(keys) do Stub.key(view, k, true) end
  view.scripts.OnMouseDown(view, "LeftButton")
  local c0 = os.clock()
  for i = 1, perLevel do
    if i % 60 == 5 then for _, k in ipairs({ "Q", "E", "R", "SPACE" }) do Stub.key(view, k, true); Stub.key(view, k, false) end; view.scripts.OnMouseDown(view, "RightButton") end
    aim(160 + 80 * math.cos(i / 20), 90 + 50 * math.sin(i / 20))
    frames(1)
    assert(A.mode == "play" or A.mode == "store" or A.mode == "loading", "level " .. lv .. " stopped in mode " .. A.mode .. ": " .. tostring(A.err))
    if A.mode ~= "play" then break end
  end
  local per = (os.clock() - c0) / perLevel * 1000
  for _, k in ipairs(keys) do Stub.key(view, k, false) end
  view.scripts.OnMouseUp(view, "LeftButton")
  if A.mode == "play" then
    checkPicture("level " .. lv)
    if g.map.scroll == "x" then assert(RT.Screen.vx > 0, "level " .. lv .. " never scrolled") end
  end
  say(string.format("level %d (%s): loaded in %d frames (%.2f s), then %.1f ms a frame, camera at %d,%d", lv, tostring(g.map.name), n, took, per, RT.Screen.vx, RT.Screen.vy))
  if lv < 7 then
    if A.mode == "play" then g.store = true; RT.push(g.events, "store"); frames(2) end
    settle("opening the Hoard")
    assert(A.mode == "store", "the Hoard did not open after level " .. lv .. " (mode " .. A.mode .. ")")
  end
end

-- win: the walk home, the card, New Game+
assert(A.mode == "play")
g.won = true
RT.push(g.events, "won")
frames(2)
settle("the ending")
assert(A.mode == "ending", "expected the ending, got " .. A.mode)
assert(TheEndgameIsMeDB.save == nil and TheEndgameIsMeDB.plus, "winning should clear the save and unlock New Game+")
frames(200)
checkPicture("the ending")
view.scripts.OnMouseDown(view, "LeftButton")
assert(A.mode == "won", "a click should skip the ending")
Stub.click("New Game +")
settle("New Game+")
assert(A.mode == "play" and A.g.ng == 1 and RT.has(A.g.owned, "beam"), "New Game+ did not carry the build over")

-- lose: the boss dies, the stats card, respawn from the save
g = A.g
g.boss.hp = 0; g.boss.dead = true; g.boss.deadT = 0
frames(60 * 5)
assert(A.mode == "over", "the boss died but the game did not end (mode " .. A.mode .. ")")
texts = table.concat(Stub.texts(), " | ")
assert(texts:find("DEFEATED", 1, true), "the defeat card is missing")
Stub.click("Respawn")
settle("respawning")
assert(A.mode == "paused", "respawn should load the last save")

-- sound: effects were asked for by name, and the level music started
local sfx, music = 0, 0
for _, path in ipairs(Stub.sounds) do
  assert(path:find("Interface\\AddOns\\TheEndgameIsMe\\Sounds\\", 1, true) == 1 and path:find("^[%w_]+%.ogg$", 40), "odd sound path " .. path)
  local file = io.open(dir .. "/Sounds/" .. path:match("([%w_]+%.ogg)$"), "rb")
  assert(file, "the addon asked for a sound file that is not in the folder: " .. path)
  file:close()
  if path:find("_calm") or path:find("_fight") then music = music + 1 else sfx = sfx + 1 end
end
say(string.format("sound: %d effects and %d music starts requested, every file present", sfx, music))

-- close and reopen, logout
SlashCmdList["THEENDGAMEISME"]("")
assert(not f:IsShown() and A.mode == "closed")
frames(5)
SlashCmdList["THEENDGAMEISME"]("")
assert(f:IsShown() and A.mode == "paused", "reopening should come back to the paused run")
for _, cmd in ipairs({ "perf", "calm", "calm", "mute", "mute", "scale 2", "scale auto", "fps 30", "fps", "reset", "help" }) do SlashCmdList["THEENDGAMEISME"](cmd) end
Stub.click("Resume")
frames(90)
checkPicture("after reopening")
Stub.event("PLAYER_LOGOUT")
plain(TheEndgameIsMeDB, 0)

for k in pairs(_G) do assert(before[k] or allowed[k], "the addon leaked a global: " .. tostring(k)) end
say(string.format("OK: %s passed. %d colour changes over the whole session.", dir, Stub.colourCalls or 0))
