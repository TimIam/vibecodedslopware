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
  local all = {}
  for _, strip in ipairs(D.strips) do
    assert(Stub.visible(strip), where .. ": a strip of the picture is hidden")
    assert(#strip.regions * 4 <= 65535, "a strip of the grid has too many vertices for one batch")
    for _, t in ipairs(strip.regions) do assert(t.shown, where .. ": a cell of the picture is hidden"); all[#all + 1] = t end
  end
  for _, t in ipairs(all) do
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
-- First run: the display check. Say no to both ways, sit through both measurements, then run it again and say yes.
assert(A.mode == "check", "a first run should start with the display check, got " .. A.mode)
local function shown() local n = 0; for _, strip in ipairs(D.strips) do for _, t in ipairs(strip.regions) do if t.shown then n = n + 1 end end end return n end
assert(shown() == 57600 and D.strips[1].clips == true, "the first card should be up, strips clipping")
Stub.click("No: black")
assert(A.mode == "check" and D.strips[1].buffer == true and D.strips[1].clips == false and shown() == 57600, "the second card should use buffers")
Stub.key(D.view, "SPACE", true)   -- "my interface vanished"
assert(A.mode == "count" and shown() == 0, "after both ways fail it should offer to measure, with nothing showing")
Stub.click("Start measuring")
frames(300)
assert(shown() > 3840 and shown() < 57600, "measuring A should be part way up")
local partway = shown()
Stub.key(D.view, "SPACE", true)
assert(shown() == 0, "SPACE during a measurement must hide every cell")
frames(200)   -- the pause, then B runs
assert(D.strips[1].parent == D.clipAll, "measurement B puts every strip under one clipping frame")
frames(60 * 30)   -- nobody presses anything: B runs to the end and times out
assert(A.mode == "nodisplay" and shown() == 0, "expected the dead end, got " .. A.mode)
assert(TheEndgameIsMeDB.probe.counts.plain == partway and tostring(TheEndgameIsMeDB.probe.counts.oneclip):find("none"), "the measurements were not recorded")
assert(TheEndgameIsMeDB.display == nil)
SlashCmdList["THEENDGAMEISME"]("probe")
assert(A.mode == "check", "/endgame probe should start the check again")
Stub.click("Yes, all of it")
assert(TheEndgameIsMeDB.display == "clip" and D.strips[1].clips == true and D.strips[1].parent == D.view, "yes should settle on clipped strips")
assert(A.mode == "menu", "expected the menu, got " .. A.mode)
assert(shown() == 57600, "the picture should be showing behind the menu")
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

-- controls: the panel, the box that listens, a key taken from another action, mouse buttons, Esc, clearing, combat
local Keys = ns.Keys
local function shownText(s) return (table.concat(Stub.texts(), " | "):find(s, 1, true)) ~= nil end
assert(shownText("W A S D walk"), "the menu should name the keys in use")
Stub.click("Controls")
assert(A.mode == "keys", "Controls should open the controls panel, got " .. A.mode)
local cap = A.ui.keys.cap
local function listening() return Stub.visible(cap) and cap.keyboard == true end
assert(not Stub.visible(cap) and not cap.keyboard, "the listening box should be away until a key is clicked")
Stub.exact("W")                       -- Walk up, key 1
assert(listening() and not D.view.keyboard, "clicking a key should put the listening box up, holding the keyboard")
Stub.key(cap, "I", true)
assert(not Stub.visible(cap) and not cap.keyboard, "a key press should put the listening box away")
assert(Keys.get("up", 1) == "I" and Keys.action("I") == "up" and Keys.action("W") == nil, "Walk up should be on I, and W free")
assert(TheEndgameIsMeDB.keys and TheEndgameIsMeDB.keys.up[1] == "I", "a changed key should be saved")
Stub.exact("Up arrow")                -- Walk up, key 2: give it a key that Ability 4 has
Stub.key(cap, "E", true)
assert(Keys.get("up", 2) == "E" and Keys.get("slot3", 1) == nil and Keys.action("E") == "up", "E should have moved from Ability 4 to Walk up")
assert(shownText("E was Ability 4"), "the panel should say where the key came from")
Stub.exact("Space")                   -- Shake, key 1: a mouse button, clicked on the box
cap.scripts.OnMouseDown(cap, "Button4")
assert(Keys.get("shake", 1) == "BUTTON4" and Keys.action("SPACE") == nil and not listening(), "a mouse button clicked on the box should bind")
assert(RT.host.keyLabel(5) == "M4" and RT.host.keyLabel(6) == "MOUSE BUTTON 4", "the HUD should name the new shake button")
Stub.exact("Q")                       -- Esc cancels, and can never be bound
Stub.key(cap, "ESCAPE", true)
assert(not listening() and Keys.get("slot2", 1) == "Q" and Keys.action("ESCAPE") == nil, "Esc should cancel and stay unbound")
Stub.exact("Q")
Stub.click("Clear this key")
assert(not listening() and Keys.get("slot2", 1) == nil and Keys.action("Q") == nil and RT.host.keyLabel(2) == "-", "Clear should empty the place")
Stub.exact("P")
Stub.click("Cancel")
assert(not listening() and Keys.get("pause", 1) == "P", "Cancel should change nothing")
Stub.combat = true                    -- it never listens in combat, and a fight starting takes the box down
Stub.exact("P")
assert(not listening() and shownText("Not while you are in combat"), "the listening box must not come up in combat")
Stub.combat = false
Stub.exact("P")
assert(listening())
Stub.combat = true
Stub.event("PLAYER_REGEN_DISABLED")
assert(not listening() and A.mode == "keys", "a fight starting should take the listening box down")
Stub.combat = false
-- a saved table somebody edited by hand: junk is dropped, no key ends up on two actions, the rest get defaults
local savedKeys = TheEndgameIsMeDB.keys
Keys.load({ up = { "ESCAPE", 5 }, left = { "W", "W" }, slot0 = "nonsense" })
assert(Keys.get("up", 1) == nil and Keys.get("up", 2) == nil, "entries that are not keys should be dropped")
assert(Keys.get("left", 1) == "W" and Keys.get("left", 2) == nil, "a key listed twice should count once")
assert(Keys.get("slot0", 1) == "BUTTON1" and Keys.get("right", 1) == "D", "anything unreadable or missing should get its defaults")
local seenKey = {}
for _, act in ipairs(Keys.ACTIONS) do
  for slot = 1, 2 do
    local key = Keys.get(act.id, slot)
    if key then assert(not seenKey[key] and Keys.action(key) == act.id, "a key on two actions: " .. key); seenKey[key] = true end
  end
end
-- what the panels and the HUD call a few awkward keys
assert(Keys.short("NUMPAD7") == "N7" and Keys.short(";") == "SEM" and Keys.short("F11") == "F11" and Keys.short("BUTTON5") == "M5" and Keys.short(nil) == "-", "short key names")
assert(Keys.name("NUMPAD7") == "Num 7" and Keys.name("LSHIFT") == "Left Shift" and Keys.name("BUTTON3") == "Middle click" and Keys.name("X") == "X", "key names")
assert(not Keys.bindable("ESCAPE") and not Keys.bindable("") and Keys.bindable("ENTER"), "which keys can be bound")
Keys.load(savedKeys)
assert(Keys.get("up", 1) == "I" and Keys.get("shake", 1) == "BUTTON4" and Keys.get("slot2", 1) == nil and Keys.get("slot3", 1) == nil, "the saved keys did not come back")
Stub.click("Defaults")
assert(TheEndgameIsMeDB.keys == nil and Keys.get("up", 1) == "W" and Keys.get("slot3", 1) == "E" and Keys.get("shake", 1) == "SPACE", "Defaults should put every key back")
Stub.click("Done")
assert(A.mode == "menu", "Done should go back to the menu")

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

-- controls from the pause menu: the run is played on the new keys, and the old ones go back to WoW
Stub.key(view, "ESCAPE", true)
assert(A.mode == "paused")
Stub.click("Controls")
assert(A.mode == "keys" and A.keysBack == "paused", "Controls on the pause menu should open the panel over the run")
Stub.exact("D"); Stub.key(cap, "L", true)                                   -- Walk right
Stub.exact("Left click"); Stub.key(cap, "NUMPAD1", true)                    -- Ability 1
Stub.exact("Right click"); cap.scripts.OnMouseDown(cap, "MiddleButton")     -- Ability 2
assert(RT.host.keyLabel(0) == "N1" and RT.host.keyLabel(1) == "MMB", "the HUD should show the new ability keys")
-- logging out with the panel up over a run still saves the run
TheEndgameIsMeDB.save = nil
Stub.event("PLAYER_LOGOUT")
assert(TheEndgameIsMeDB.save and TheEndgameIsMeDB.save.level == 1, "logging out with Controls up should still save the run")
-- and closing the window from there comes back to the run on break
SlashCmdList["THEENDGAMEISME"]("")
assert(A.mode == "closed" and A.wasMode == "paused", "closing from Controls should leave the run on break, got " .. tostring(A.wasMode))
SlashCmdList["THEENDGAMEISME"]("")
assert(A.mode == "paused")
Stub.click("Resume")
assert(A.mode == "play" and view.keyboard)
frames(150)   -- whatever was mid-swing finishes and cools down
local swipe = g.slots[0]
assert(not g.boss.act and g.boss.cd[swipe] <= 0, "ability 1 should be ready by now")
x0 = g.boss.x
Stub.key(view, "D", true)
assert(view.propagate == true, "D is no longer the game's, so it should go on to WoW")
view.scripts.OnMouseDown(view, "LeftButton")
frames(30)
assert(math.abs(g.boss.x - x0) < 0.5 and not g.boss.act and g.boss.cd[swipe] <= 0, "the old keys still do things")
Stub.key(view, "D", false)
view.scripts.OnMouseUp(view, "LeftButton")
Stub.key(view, "L", true)
assert(view.propagate == false, "the new walking key should be kept from WoW")
frames(60)
assert(g.boss.x > x0 + 10, "the new walking key does not walk")
Stub.key(view, "L", false)
Stub.key(view, "NUMPAD1", true)
frames(2)
assert((g.boss.act and g.boss.act.kind == swipe) or g.boss.cd[swipe] > 0, "the new key did not use ability 1")
local casts = 0
for _ = 1, 400 do
  local was = g.boss.cd[swipe]
  frames(1)
  if g.boss.cd[swipe] > was then casts = casts + 1 end
end
assert(casts >= 1, "holding the new key should keep swiping, as holding the mouse button did")
Stub.key(view, "NUMPAD1", false)
view.scripts.OnMouseDown(view, "MiddleButton")
assert(A.press.slot1 and A.keys.BUTTON3, "middle click should be ability 2 now")
view.scripts.OnMouseUp(view, "MiddleButton")
assert(not A.keys.BUTTON3, "letting go of a mouse button should be noticed")
frames(2)
view.scripts.OnMouseDown(view, "RightButton")
assert(not A.press.slot1 and not A.keys.BUTTON2, "right click should be nobody's now")
frames(20)
checkPicture("on the new keys")
Stub.key(view, "ESCAPE", true)
assert(A.mode == "paused", "Esc should pause whatever the keys are")
Stub.click("Controls")
Stub.click("Defaults")
Stub.click("Done")
assert(A.mode == "paused" and Keys.get("right", 1) == "D" and Keys.get("slot0", 1) == "BUTTON1")
Stub.click("Resume")
assert(A.mode == "play")

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
-- what is on the five buttons, LMB RMB Q E R
local function bar(of)
  local t = {}
  for i = 0, 4 do t[#t + 1] = tostring((of or g).slots[i] or "-") end
  return table.concat(t, " ")
end
assert(bar() == "swipe stomp breath roar -", "a run should start with the boss's own four abilities: " .. bar())
Stub.click("Lightning Beam")
Stub.click("Mutate")
assert(RT.has(g.owned, "beam"), "buying an ability did not work")
assert(bar() == "swipe stomp breath roar beam", "a new ability should take the free button: " .. bar())
Stub.click("Mutate")
assert((g.lvl.beam or 0) == 1, "upgrading an ability did not work")
local texts = table.concat(Stub.texts(), " | ")
assert(texts:find("THE HOARD", 1, true) and texts:find("points", 1, true), "the Hoard panel is missing its text")
-- a sixth ability has no free button: nothing moves, and the Hoard says what to do about it
Stub.click("Tail Sweep")
Stub.click("Mutate")
assert(RT.has(g.owned, "tail") and bar() == "swipe stomp breath roar beam", "learning with all five buttons in use should move nothing: " .. bar())
assert(shownText("Tail Sweep needs a button") and shownText("owned, not on a button"), "the Hoard should say the new ability has no button")
-- a slot puts up a list of what is owned, and picking from it changes that slot only
local pick = A.ui.store.pick
local function listed()
  local n = 0
  for _, b in ipairs(Stub.frames) do if b.kind == "Button" and b.where and Stub.visible(b) then n = n + 1 end end
  return n
end
assert(not Stub.visible(pick), "the list should be away until a slot is clicked")
Stub.click("Q:")
assert(Stub.visible(pick) and pick.slot == 2 and shownText("WHAT GOES ON Q?"), "clicking a slot should put up the list for it")
assert(pick.mouse and pick.points.ALL and pick.points.ALL.rel == A.ui.store and pick.level > A.ui.store:GetFrameLevel(),
  "the veil behind the list should cover the whole panel, above its buttons, and take the clicks")
local listBox = Stub.buttonIn(pick, "Cancel").parent
assert(listBox.points.LEFT and listBox.points.LEFT.x + listBox.w <= Stub.button("Q:").points.TOPLEFT.x,
  "the list must sit clear of the slots, or the second half of a double click on a slot lands on a row")
assert(Stub.button("Q:").sel and not Stub.button("E:").sel, "the slot being changed should be marked")
assert(listed() == 7, "the list should hold the six abilities owned and (empty), not " .. listed() .. " rows")
assert(Stub.buttonIn(pick, "Fire Breath").sel and Stub.buttonIn(pick, "Fire Breath").where.text == "here now", "the list should mark what is on the slot")
assert(Stub.buttonIn(pick, "Roar").where.text == "on E" and Stub.buttonIn(pick, "Tail Sweep").where.text == "", "the list should say where each ability is")
assert(not Stub.buttonIn(pick, "Ice Floor") and not Stub.buttonIn(pick, "Thicker Fur"), "the list should leave out what is not owned and what is never cast")
Stub.clickIn(pick, "Tail Sweep")
assert(bar() == "swipe stomp tail roar beam", "picking from the list should change that slot and no other: " .. bar())
assert(not Stub.visible(pick) and shownText("Tail Sweep replaced Fire Breath on Q."), "a pick should put the list away and say what happened")
assert(not Stub.button("Q:").sel, "the mark on the slot should go when the list does")
-- one that is on another button trades places with what was here
Stub.click("LMB:"); Stub.clickIn(pick, "Roar")
assert(bar() == "roar stomp tail swipe beam" and shownText("Roar and Swipe traded places."), "a pick from another button should trade places: " .. bar())
-- (empty), and a move to an empty slot
Stub.click("R:"); Stub.clickIn(pick, "(empty)")
assert(bar() == "roar stomp tail swipe -" and shownText("R is empty. Lightning Beam has no button."), "(empty) should clear that slot: " .. bar())
Stub.click("R:")
assert(Stub.buttonIn(pick, "(empty)").sel and listed() == 7, "an empty slot's list should mark (empty)")
Stub.clickIn(pick, "Swipe")
assert(bar() == "roar stomp tail - swipe" and shownText("Swipe moved from E to R."), "a pick for an empty slot should leave its old slot empty: " .. bar())
Stub.click("E:"); Stub.clickIn(pick, "Fire Breath")
assert(bar() == "roar stomp tail breath swipe" and shownText("Fire Breath is on E."), "an ability with no button should go on an empty one: " .. bar())
-- picking what is already there, Cancel, and a click beside the list all change nothing
local kept = bar()
Stub.click("E:"); Stub.clickIn(pick, "Fire Breath")
assert(bar() == kept and not Stub.visible(pick), "picking what is already there should change nothing")
Stub.click("E:"); Stub.clickIn(pick, "Cancel")
assert(bar() == kept and not Stub.visible(pick), "Cancel should change nothing")
Stub.click("E:"); pick.scripts.OnMouseDown(pick, "LeftButton")
assert(bar() == kept and not Stub.visible(pick), "a click beside the list should put it away and change nothing")
-- choosing another ability on the left puts the list away too
Stub.click("E:"); Stub.click("Ice Floor")
assert(bar() == kept and not Stub.visible(pick), "the list should not outlive a change of selection")
-- the bar comes back from a save and a /reload as it was left, a hole in the middle included
Stub.click("RMB:"); Stub.clickIn(pick, "(empty)")
assert(bar() == "roar - tail breath swipe")
assert(ns.Store.write(g, "store"), "the Hoard could not be saved")
local saved = {}
dump(TheEndgameIsMeDB.save, saved, 0)
TheEndgameIsMeDB.save = assert(loadstring("return " .. table.concat(saved)))()
local reread = ns.Store.read()
assert(reread and reread.slots.length == 5 and bar(reread) == bar(), "the buttons did not survive a save: " .. tostring(reread and bar(reread)))
Stub.click("RMB:"); Stub.clickIn(pick, "Stomp")
assert(bar() == "roar stomp tail breath swipe")
plain(TheEndgameIsMeDB, 0)

-- every level: load it, play a while with keys held, scroll, check the picture
for lv = 2, 7 do
  Stub.click("Onward")
  t = os.clock()
  n = settle("loading level " .. lv)
  local took = os.clock() - t
  assert(A.mode == "play" and g.map.n == lv, "expected level " .. lv)
  g.boss.maxhp = 1e9; g.boss.hp = 1e9
  if lv == 2 then
    -- the keys cast what the Hoard left on them: Q has Tail Sweep now, and Fire Breath went to E
    assert(g.slots[2] == "tail" and g.slots[3] == "breath")
    local function finish() for _ = 1, 900 do if not g.boss.act then return end; frames(1) end; error("the boss never finished its cast") end
    Stub.key(view, "Q", true); Stub.key(view, "Q", false)
    frames(2)
    assert(g.boss.act and g.boss.act.kind == "tail", "Q did not cast what the Hoard put on it")
    finish()
    Stub.key(view, "E", true); Stub.key(view, "E", false)
    frames(2)
    assert(g.boss.act and g.boss.act.kind == "breath", "E did not cast what the Hoard put on it")
    finish()
  end
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

-- /endgame keys: from a run it pauses first; with the window shut it opens it, on the Controls panel
assert(A.mode == "play")
SlashCmdList["THEENDGAMEISME"]("keys")
assert(A.mode == "keys" and A.keysBack == "paused", "/endgame keys during a run should pause it and open Controls")
Stub.exact("M"); Stub.key(cap, "LSHIFT", true)
assert(Keys.get("mute", 1) == "LSHIFT")
SlashCmdList["THEENDGAMEISME"]("")
assert(not f:IsShown() and A.mode == "closed")
SlashCmdList["THEENDGAMEISME"]("keys")
assert(f:IsShown() and A.mode == "keys" and A.keysBack == "paused", "/endgame keys should open the window on the Controls panel")
Stub.click("Done")
assert(A.mode == "paused")
-- the page in the client's options lists the keys as they stand, and its button leads to the same panel
local page = Stub.showPage(true)
local pageText = {}
for _, r in ipairs(page.regions) do if r.kind == "FontString" and r.text then pageText[#pageText + 1] = r.text end end
pageText = table.concat(pageText, " | ")
assert(pageText:find("Walk up:  W, Up arrow", 1, true) and pageText:find("Pause:  Esc, P", 1, true) and pageText:find("Sound on or off:  Left Shift", 1, true),
  "the options page should list the keys in use: " .. pageText)
SlashCmdList["THEENDGAMEISME"]("")
Stub.click("Change the controls")
assert(f:IsShown() and A.mode == "keys", "the options page's button should open the Controls panel")
Stub.showPage(false)
-- the keys survive the trip through the saved-variables file
plain(TheEndgameIsMeDB, 0)
text = {}
dump(TheEndgameIsMeDB.keys, text, 0)
back = assert(loadstring("return " .. table.concat(text)))()
assert(same(back, TheEndgameIsMeDB.keys), "the keys changed on their way through the saved-variables file")
Keys.load(back)
assert(Keys.get("mute", 1) == "LSHIFT" and Keys.get("up", 1) == "W", "the keys did not come back from the file")
Stub.click("Defaults")
Stub.click("Done")
assert(A.mode == "paused" and TheEndgameIsMeDB.keys == nil)

-- the benchmark runs, and puts the picture back
TheEndgameIsMeDB.perf = true; frames(130); TheEndgameIsMeDB.perf = false
SlashCmdList["THEENDGAMEISME"]("bench")
assert(tostring(TheEndgameIsMeDB.log[#TheEndgameIsMeDB.log]):find("bench: recolour"), "the benchmark did not report")
say("bench: " .. tostring(TheEndgameIsMeDB.log[#TheEndgameIsMeDB.log]))
for _, l in ipairs(TheEndgameIsMeDB.log or {}) do assert(not l:find("ERROR", 1, true), "the addon logged an error: " .. l) end
for k in pairs(_G) do assert(before[k] or allowed[k], "the addon leaked a global: " .. tostring(k)) end

-- An update that adds a file, met by a /reload instead of a restart: the client cannot see the new file, so every
-- other file loads without it. That must not be an error, and the slash command must say what to do.
local half = {}
for line in toc:gmatch("[^\r\n]+") do
  if line:sub(1, 2) ~= "##" and line:match("%.lua$") and line ~= "keys.lua" then assert(loadfile(dir .. "/" .. line))(ADDON, half) end
end
assert(not half.App, "with a file missing the game should not start")
local said = #Stub.printed
SlashCmdList["THEENDGAMEISME"]("")
assert(#Stub.printed == said + 1 and Stub.printed[#Stub.printed]:find("start it again", 1, true), "with a file missing, /endgame should say to restart the game")
for k in pairs(_G) do assert(before[k] or allowed[k], "the half-loaded addon leaked a global: " .. tostring(k)) end

say(string.format("OK: %s passed. %d colour changes over the whole session.", dir, Stub.colourCalls or 0))
