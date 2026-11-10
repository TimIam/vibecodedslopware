-- The Endgame is Me: the part of the browser game's main.js that a WoW addon needs: input, the fixed-step loop, the
-- menus, the Hoard between levels, saves, and the slash command. The rules and the drawing are the game's own
-- modules (the game_*.lua files beside this one).

local ADDON, ns = ...

-- Every file before this one has to have loaded. One that an update added while the client was running has not: a
-- /reload only reads the files that were there when the client started. Say so, instead of failing somewhere odd.
if not (ns.RT and ns.Display and ns.Store and ns.Keys and ns.Sound) then
  local function say()
    _G.print("|cffd8b45cThe Endgame is Me:|r this update added files, and /reload cannot see new files. Exit the game completely and start it again.")
  end
  _G.SLASH_THEENDGAMEISME1, _G.SLASH_THEENDGAMEISME2 = "/endgame", "/teim"
  _G.SlashCmdList["THEENDGAMEISME"] = say
  _G.TheEndgameIsMe_OnCompartmentClick = say
  say()
  return
end

local RT, D, Store, Keys = ns.RT, ns.Display, ns.Store, ns.Keys
local World, Render, Art = RT.module("world"), RT.module("render"), RT.module("art")
local Screen = RT.Screen
local floor, min, max = math.floor, math.min, math.max
local DT = 1 / 60
local GW, GH = 320, 180

local A = { mode = "closed", acc = 0, keys = {}, press = {}, sinceDraw = 0 }
ns.App = A
local ui = {}
A.ui = ui
local stats = { sim = 0, draw = 0, cells = 0, frames = 0, steps = 0, t = 0, line = "" }

local now = _G.debugprofilestop or function() return (_G.GetTime and _G.GetTime() or os.clock()) * 1000 end
RT.perfNow = now
RT.now = function() return (_G.GetTime and _G.GetTime() or 0) * 1000 end
RT.print = function(...) _G.print("|cffd8b45cThe Endgame is Me:|r", ...) end

-- The last few things that happened, kept in the saved variables: after a /reload the file says what went wrong.
local function note(text)
  local db = ns.DB
  if not db then return end
  db.log = db.log or {}
  db.log[#db.log + 1] = string.format("%.1f %s", (_G.GetTime and _G.GetTime() or 0), tostring(text))
  while #db.log > 60 do table.remove(db.log, 1) end
end
A.note = note
local function trace(err)
  local msg = tostring(type(err) == "table" and err.message or err)
  if _G.debugstack then msg = msg .. " | " .. tostring(_G.debugstack(2, 6, 0)):gsub("[%c]+", " / ") end
  return msg
end
-- runs fn; an error is printed and logged instead of vanishing (the client hides Lua errors by default)
local function guard(what, fn, ...)
  local a, b, c = ...
  -- Lua 5.1's xpcall hands no arguments on, so they go in through a closure
  local ok, err = xpcall(function() return fn(a, b, c) end, trace)
  if not ok then
    note("ERROR in " .. what .. ": " .. tostring(err))
    RT.print("error in " .. what .. ": " .. tostring(err))
  end
  return ok
end
A.guard = guard

local function look() return ns.DB.look or {} end
local function bossName(g) if ns.DB.name and ns.DB.name ~= "" then g.boss.name = ns.DB.name:upper() end end

-- ------------------------------------------------------------------------------------------------ small UI kit
-- Everything is laid out in game pixels: the overlay frame is 320×180 units, whatever size the window is on screen.

local function button(parent, text, w, h, fn)
  local b = _G.CreateFrame("Button", nil, parent)
  b:SetSize(w, h)
  b.bg = D.solid(b, "BACKGROUND", 0.2, 0.15, 0.1, 0.96)
  b.bg:SetAllPoints(b)
  b.rim = D.solid(b, "BORDER", 0.5, 0.4, 0.26, 1)
  b.rim:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 0, 0); b.rim:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", 0, 0); b.rim:SetHeight(0.5)
  b.label = D.text(b, min(6, h * 0.6))
  b.label:SetPoint("CENTER", b, "CENTER", 0, 0)
  b.label:SetText(text)
  b.on = true
  function b.paint(self, hot)
    if not self.on then self.bg:SetColorTexture(0.12, 0.1, 0.08, 0.9); self.label:SetTextColor(0.45, 0.42, 0.36)
    elseif self.sel then self.bg:SetColorTexture(0.42, 0.3, 0.12, 1); self.label:SetTextColor(1, 0.93, 0.7)
    elseif hot then self.bg:SetColorTexture(0.33, 0.24, 0.13, 1); self.label:SetTextColor(1, 0.95, 0.8)
    else self.bg:SetColorTexture(0.2, 0.15, 0.1, 0.96); self.label:SetTextColor(0.93, 0.89, 0.78) end
  end
  function b.able(self, on) self.on = on and true or false; self:paint(false) end
  b:SetScript("OnEnter", function(self) self:paint(true) end)
  b:SetScript("OnLeave", function(self) self:paint(false) end)
  b:SetScript("OnClick", function(self) if self.on and fn then ns.Sound.play("menuGo"); guard("a button (" .. tostring(self.label:GetText()) .. ")", fn, self) end end)
  return b
end

local function panel(name, w, h)
  local p = _G.CreateFrame("Frame", nil, D.over)
  p:SetSize(w, h)
  p:SetPoint("CENTER", D.over, "CENTER", 0, 0)
  p:EnableMouse(true)
  local rim = D.solid(p, "BACKGROUND", 0.62, 0.5, 0.3, 1)
  rim:SetAllPoints(p)
  local bg = D.solid(p, "BORDER", 0.13, 0.1, 0.075, 1)
  bg:SetPoint("TOPLEFT", p, "TOPLEFT", 1, -1); bg:SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -1, 1)
  p:Hide()
  ui[name] = p
  return p
end

local function line(parent, size, anchor, x, y, r, g, b)
  local fs = D.text(parent, size, r, g, b)
  fs:SetPoint(anchor, parent, anchor, x, y)
  return fs
end

-- ------------------------------------------------------------------------------------------------ modes

local PANELS = { "menu", "pause", "over", "won", "store", "look", "keys", "loading", "error", "check", "count", "nodisplay" }
local build = {}   -- name → function that makes that panel the first time it is wanted

function A.setMode(mode)
  note("mode " .. tostring(mode))
  A.mode = mode
  local shown = ({ menu = "menu", paused = "pause", over = "over", won = "won", store = "store", look = "look", keys = "keys", loading = "loading",
    error = "error", check = "check", count = "count", nodisplay = "nodisplay" })[mode]
  if shown and not ui[shown] then build[shown]() end
  for _, n in ipairs(PANELS) do if ui[n] then if n == shown then ui[n]:Show() else ui[n]:Hide() end end end
  if ui.dim then if shown and shown ~= "loading" and shown ~= "look" and shown ~= "check" and shown ~= "count" then ui.dim:Show() else ui.dim:Hide() end end
  local playing = mode == "play" or mode == "ending" or mode == "check" or mode == "count"
  A.keys, A.press = {}, {}
  local view = D.view
  view:EnableKeyboard(playing)
  if playing and view.SetPropagateKeyboardInput and not (_G.InCombatLockdown and _G.InCombatLockdown()) then view:SetPropagateKeyboardInput(false) end
  if shown and ui[shown].refresh then ui[shown].refresh() end
  ns.Sound.setCombat(false)
end

local function fail(err)
  A.err = tostring(type(err) == "table" and err.message or err)
  note("ERROR: " .. A.err)
  RT.print("stopped on an error: " .. A.err)
  A.job = nil
  D.info:SetText("error: see chat")
  guard("the error panel", A.setMode, "error")
end

-- ------------------------------------------------------------------------------------------------ slow work in slices

-- Painting a level's ground or a sheet of boss sprites takes whole seconds of Lua. It runs in a coroutine that the
-- drawing code pauses from the inside (RT.breathe), a few milliseconds a frame, so the client never freezes.
local function slice(co, ms)
  RT.yieldAt = now() + ms
  local ok, err = coroutine.resume(co)
  RT.yieldAt = nil
  return ok, err
end

function A.load(label, job, done)
  A.job = { co = coroutine.create(job), done = done, t0 = now(), frames = 0 }
  A.loadLabel = label
  A.setMode("loading")
end

-- between the things that matter, the rest of the boss's sprites get painted a little each frame
local function background()
  while true do
    local left = RT.prefillBoss and RT.prefillBoss(1) or 0
    if left <= 0 then coroutine.yield("idle") end
  end
end

local function firstFrame(g, bare)
  Store.mend(g)
  RT.fillSheets = true
  A.R.render(g, { bare = bare, mx = 160, my = 90 })
  RT.fillSheets = false
  if RT.prefillBoss then RT.prefillBoss(32, true) end   -- one sprite for every heading before the fight starts
end

-- ------------------------------------------------------------------------------------------------ the display check

-- The picture is 57,600 textures, and this client's renderer has limits nobody documents: handed over one way it
-- draws nothing, another way it stops drawing the whole interface (see Display.setMode). The addon cannot see what
-- reached the screen, so the first time it opens it shows a test card each way and asks. The answer is remembered
-- (DB.display). If no way works it measures where the limits are, so the numbers can be read from the saved log.
local C = nil   -- the check in progress

local function afterDisplay()
  D.blank()
  D.showAll()
  A.setMode("menu")
  note("display ready in mode " .. tostring(D.mode))
  if A.wantKeys then A.wantKeys = nil; A.openKeys() end
end

local function tryMode()
  local mode = C.modes[C.i]
  note("display check: trying '" .. mode .. "'")
  D.hideAll()
  D.setMode(mode)
  D.pattern()
  D.showAll()
  C.phase, C.t = "ask", 0
  A.setMode("check")
end

local function measureIntro()
  D.hideAll()
  C.phase = "intro"
  A.setMode("count")
end

function A.startCheck(measureOnly)
  local modes = { "clip" }
  if D.canBuffer() then modes[#modes + 1] = "buffer" end
  C = { modes = modes, i = 1, answers = {}, counts = {}, fps = {} }
  A.check = C
  ns.DB.display = nil
  note("display check started; buffer frames available: " .. tostring(D.canBuffer()))
  if measureOnly then measureIntro() else tryMode() end
end

-- the player's verdict on the card that is up: "yes", "no", or "space" (their interface vanished)
local function answer(how)
  if not C or C.phase ~= "ask" then return end
  local mode = C.modes[C.i]
  C.answers[mode] = how
  C.fps[mode] = A.fps
  note(string.format("display check: '%s' answered %s after %.1f s, client at %s fps", mode, how, C.t, tostring(A.fps and floor(A.fps))))
  if how == "yes" then
    ns.DB.display = mode
    ns.DB.probe = { answers = C.answers, fps = C.fps }
    C = nil; A.check = nil
    afterDisplay()
    return
  end
  D.hideAll()
  C.i = C.i + 1
  if C.modes[C.i] then tryMode() else measureIntro() end
end

-- Measuring: cells are switched on four rows at a time until the player says something vanished.
local STAGES = { { mode = "plain", label = "A" }, { mode = "oneclip", label = "B" } }
local function startStage(n)
  local st = STAGES[n]
  if not st then
    D.hideAll()
    ns.DB.probe = { answers = C.answers, fps = C.fps, counts = C.counts }
    note("display check finished: no way of drawing works; counts plain=" .. tostring(C.counts.plain) .. " oneclip=" .. tostring(C.counts.oneclip))
    C.phase = "done"
    A.setMode("nodisplay")
    return
  end
  C.stage, C.phase, C.count, C.t, C.hold = n, "run", 0, 0, 0
  D.hideAll()
  D.setMode(st.mode)
  D.pattern()
  note("measuring " .. st.label .. " (" .. st.mode .. ")")
  if ui.count then ui.count.refresh() end
end
local function stageOver(result)
  local st = STAGES[C.stage]
  C.counts[st.mode] = result
  note(string.format("measured %s (%s): %s, client at %s fps", st.label, st.mode, tostring(result), tostring(A.fps and floor(A.fps))))
  D.hideAll()
  C.phase, C.t = "pause", 0
  if ui.count then ui.count.refresh() end
end
local function checkTick(elapsed)
  if not C then return end
  C.t = (C.t or 0) + elapsed
  if C.phase == "run" then
    if C.count < GW * GH then
      if C.t >= 0.3 then
        C.t = 0
        -- a row at a time to begin with: if a group gives up early, the count says how early
        C.count = C.count + (C.count < GW * 12 and GW or GW * 4)
        D.showCount(C.count)
        D.info:SetText("test " .. STAGES[C.stage].label .. ": " .. RT.commas(C.count) .. " squares")
        if ui.count then ui.count.refresh() end
      end
    else
      -- everything is up; give the player a few seconds to say it vanished
      C.hold = C.hold + elapsed
      if C.hold > 5 then stageOver("none up to " .. (GW * GH)) end
    end
  elseif C.phase == "pause" then
    if C.t > 2.5 then startStage(C.stage + 1) end
  end
end
local function checkSpace()
  if not C then return end
  if C.phase == "ask" then answer("space")
  elseif C.phase == "run" then stageOver(C.count) end
end

-- ------------------------------------------------------------------------------------------------ flow

local function start(g, after)
  A.g = g
  A.ending = nil
  A.acc = 0
  A.R.reset()
  A.load("LEVEL " .. g.map.n .. ": " .. tostring(g.map.name), function() firstFrame(g) end, function()
    ns.Sound.setStage(g.map.n)
    if after then after() else A.setMode("play") end
  end)
end

function A.newRun(plus)
  A.load("WAKING THE BOSS", function()
    local g = plus and World.newGamePlus(plus, look()) or World.createGame(nil, look())
    bossName(g)
    A.g = g
    A.ending = nil
    A.acc = 0
    A.R.reset()
    firstFrame(g)
  end, function()
    Store.write(A.g)
    ns.Sound.setStage(1)
    A.setMode("play")
  end)
end

function A.saveNow()
  local g = A.g
  if not g or g.boss.dead or g.over or g.won then return false end
  local mode = A.mode == "keys" and A.keysBack or A.mode   -- the Controls panel may be up over a run on break
  if mode ~= "play" and mode ~= "paused" and mode ~= "store" then return false end
  return Store.write(g, mode == "store" and "store" or "play")
end

local function resumeFrom(g, phase)
  g.look = RT.assign({ head = 0, horns = 0, neck = 0, back = 0, tail = 0, limbs = 0, legs = 0, marker = 0 }, look())
  bossName(g)
  start(g, function() if phase == "store" then A.openStore() else A.setMode("paused") end end)
end

function A.continue()
  local g, phase = Store.read()
  if g then resumeFrom(g, phase) else A.setMode("menu") end
end
function A.respawn()
  local g, phase = Store.read()
  if g then resumeFrom(g, phase) else A.newRun() end
end

function A.goMenu()
  A.ending = nil
  ns.Sound.setStage(0)
  A.setMode("menu")
end
function A.pause() if A.mode == "play" then A.setMode("paused") end end
function A.resume() if A.mode == "paused" then A.acc = 0; A.setMode("play") end end

local function newBest(g)
  if g.score > (ns.DB.best or 0) then ns.DB.best = floor(g.score); return true end
  return false
end
local function clock(t) return string.format("%d:%02d", floor(t / 60), floor(t % 60)) end

local LINES = {
  raid = { "by a raid.", "They are arguing about who gets your fur." },
  dungeon = { "by five people who met an hour ago.", "One of them was AFK for most of it." },
  rider = { "by a quiet man on a horse.", "The horse did not help." },
}
local function gameOver()
  local g = A.g
  local killer, most = "dungeon", -1
  for k, v in pairs(g.blame) do if v > most then killer, most = k, v end end
  local best = newBest(g)
  A.overText = {
    LINES[killer][1], LINES[killer][2],
    { { "Score", RT.commas(g.score) .. (best and "  (new best)" or "") }, { "Shift length", clock(g.t) }, { "Levels cleared", g.maps },
      { "Laps between rocks", g.laps }, { "Adventurers eaten", g.kills }, { "Raids wiped", g.wipes.raid + g.wipes.final },
      { "5-mans wiped", g.wipes.dungeon }, { "Horse guys", g.wipes.rider }, { "Points spent", RT.commas(g.spent) }, { "Adds summoned", g.summoned } },
  }
  ns.Sound.setCombat(false)
  A.setMode("over")
end

-- the castle is down: the run is over, so the save goes and New Game+ opens. First the walk home, then the card.
local function gameWon()
  local g = A.g
  Store.clear()
  Store.unlockPlus(g)
  ns.Sound.setCombat(false)
  A.acc = 0
  A.load("THE LONG WALK HOME", function()
    A.ending = World.createEnding(g.look)
    A.R.reset()
    firstFrame(A.ending, true)
  end, function()
    ns.Sound.setStage(1)
    A.setMode("ending")
  end)
end
local function showWon()
  local g = A.g
  local best = newBest(g)
  A.wonText = { { "Score", RT.commas(g.score) .. (best and "  (new best)" or "") }, { "Time", clock(g.t) } }
  if g.ng and g.ng > 0 then A.wonText[#A.wonText + 1] = { "Round", "New Game +" .. (g.ng > 1 and g.ng or "") } end
  A.wonText[#A.wonText + 1] = { "Adventurers eaten", g.kills }
  A.wonText[#A.wonText + 1] = { "Raids wiped", g.wipes.raid + g.wipes.final }
  A.wonText[#A.wonText + 1] = { "Points spent", RT.commas(g.spent) }
  A.setMode("won")
end
local function endingDone() if A.mode == "ending" then showWon() end end

function A.openStore()
  A.storeSel = A.storeSel or "summon"
  A.storeMsg = nil
  A.setMode("store")
  Store.write(A.g, "store")
end
function A.closeStore()
  local g = A.g
  A.load("ONWARD", function()
    World.nextMap(g)
    A.R.reset()
    firstFrame(g)
  end, function()
    Store.write(g)
    ns.Sound.setStage(g.map.n)
    A.acc = 0
    A.setMode("play")
  end)
end

-- ------------------------------------------------------------------------------------------------ input

-- A key or a mouse button going down, by the name its binding has (see keys.lua). Says whether the game had a use
-- for it. A.keys is everything being held, which is what walking and the held swipe read.
local function pressed(name)
  local act = Keys.action(name)
  if not act then return false end
  A.keys[name] = true
  if act == "pause" then A.pause()
  elseif act == "mute" then ns.Sound.toggle()
  elseif act == "shake" or act:sub(1, 4) == "slot" then A.press[act] = true end
  return true
end

local function onKeyDown(self, key)
  local used = true
  if A.mode == "check" or A.mode == "count" then
    if key == "SPACE" then guard("the display check", checkSpace) else used = false end
  elseif A.mode == "ending" then
    if key == "ENTER" or key == "SPACE" or key == "ESCAPE" then endingDone() else used = false end
  elseif A.mode == "play" then
    if key == "ESCAPE" then A.pause()   -- always, whatever the bindings say: the way out cannot be bound away
    elseif not pressed(key) then used = false end
  else used = false end
  -- keys the game has no use for (Enter for chat, the screenshot key) go on to WoW when that is allowed
  if self.SetPropagateKeyboardInput and not (_G.InCombatLockdown and _G.InCombatLockdown()) then self:SetPropagateKeyboardInput(not used) end
end
local function onKeyUp(self, key) A.keys[key] = nil end

local function onMouseDown(self, btn)
  if A.mode == "ending" then if A.ending and A.ending["end"].t > 1 then endingDone() end return end
  if A.mode ~= "play" then return end
  local name = Keys.MOUSE[btn]
  if name then pressed(name) end
end
local function onMouseUp(self, btn) local name = Keys.MOUSE[btn]; if name then A.keys[name] = nil end end

local function readInput(g, mx, my)
  local k = A.keys
  local press = {}
  for name in pairs(A.press) do press[name] = true end
  return {
    mx = mx + g.cam.x, my = my + g.cam.y,
    ax = (Keys.held(k, "right") and 1 or 0) - (Keys.held(k, "left") and 1 or 0),
    ay = (Keys.held(k, "down") and 1 or 0) - (Keys.held(k, "up") and 1 or 0),
    press = press,
    hold = { slot0 = Keys.held(k, "slot0") },
  }
end

-- ------------------------------------------------------------------------------------------------ the loop

local function drain(g)
  local ev = g.events
  for i = 0, ev.length - 1 do
    local e = ev[i]
    if e == "over" then gameOver()
    elseif e == "store" then A.openStore()
    elseif e == "won" then gameWon()
    else ns.Sound.play(e) end
  end
  RT.setlen(ev, 0)
end

local function playFrame(elapsed)
  local g = A.g
  local mx, my = D.cursor()
  A.acc = A.acc + min(elapsed, 0.1)
  local t0 = now()
  local n = 0
  while A.acc >= DT and A.mode == "play" and n < 4 do
    World.step(g, readInput(g, mx, my), DT)
    A.press = {}
    A.acc = A.acc - DT
    n = n + 1
    drain(g)
  end
  if A.acc > DT then A.acc = 0 end   -- can't keep up: run slow rather than fall further behind
  local t1 = now()
  if A.mode == "play" then
    local engaged = false
    for i = 0, g.parties.length - 1 do if g.parties[i].engaged then engaged = true; break end end
    ns.Sound.setCombat(engaged)
    RT.spriteBudget, RT.fillSheets = 0, true
    A.R.render(g, { mx = mx, my = my, cursor = true, muted = ns.DB.mute })
    RT.fillSheets = false
    local sent = D.present()
    stats.cells = stats.cells + sent
    A.drawn = (A.drawn or 0) + 1
    if A.drawn <= 3 or A.drawn % 600 == 0 then note(string.format("play frame %d: %d cells sent, sim+draw %.1f ms, boss at %.0f,%.0f", A.drawn, sent, now() - t0, g.boss.x, g.boss.y)) end
  end
  local t2 = now()
  stats.sim, stats.draw, stats.steps, stats.frames = stats.sim + t1 - t0, stats.draw + t2 - t1, stats.steps + n, stats.frames + 1
end

local HEART = { ".#.#.", "#####", "#####", ".###.", "..#.." }
local function endingFrame(elapsed)
  local e, c = A.ending, Screen:getContext()
  local en = e["end"]
  A.acc = A.acc + min(elapsed, 0.1)
  while A.acc >= DT and A.mode == "ending" do
    local more = World.endingStep(e, DT)
    for i = 0, e.events.length - 1 do ns.Sound.play(e.events[i]) end
    RT.setlen(e.events, 0)
    A.acc = A.acc - DT
    if not more then endingDone() return end
  end
  RT.spriteBudget, RT.fillSheets = 0, true
  A.R.render(e, { bare = true })
  RT.fillSheets = false
  c:setTransform(1, 0, 0, 1, 0, 0)
  for i = 0, en.hearts.length - 1 do
    local h = en.hearts[i]
    if h.t >= 0 then
      c.globalAlpha = h.t > 1.6 and max(0, (2.4 - h.t) / 0.8) or 1
      local x, y = floor(h.x - e.cam.x + 0.5) - 2, floor(h.y - e.cam.y + 0.5) - 2
      c.fillStyle = Art.PAL.ink
      for j = 1, 5 do for k = 1, 5 do if HEART[j]:sub(k, k) == "#" then c:fillRect(x + k - 2, y + j - 1, 3, 1) end end end
      for j = 1, 5 do for k = 1, 5 do
        if HEART[j]:sub(k, k) == "#" then c.fillStyle = (k == 2 and j == 2) and "#ffd0dc" or "#e2486a"; c:fillRect(x + k - 1, y + j - 1, 1, 1) end
      end end
    end
  end
  c.globalAlpha = 1
  -- letterbox bars and the caption typed out
  local k = min(1, en.t / 1.2)
  c.fillStyle = "#0a0806"
  c:fillRect(0, 0, GW, floor(16 * k + 0.5)); c:fillRect(0, GH - floor(22 * k + 0.5), GW, 22)
  if en.caption then Art.drawText(c, en.caption:sub(1, floor(en.capT * 28)), GW / 2, GH - 15, Art.PAL.cream, { align = "center" }) end
  if en.t > 2 then Art.drawText(c, "CLICK TO SKIP", GW - 4, 5, "#6b665c", { align = "right", shadow = false }) end
  D.present()
end

-- the boss turning on the spot behind the Appearance panel, and the marker it will walk to
local function lookFrame(elapsed)
  A.lookT = (A.lookT or 0) + elapsed
  if A.lookPlain then Screen.again() else Screen.beginPlain(0x141a12); A.lookPlain = true end
  local c = Screen:getContext()
  RT.spriteBudget = 30
  local l = RT.assign({ head = 0, horns = 0, neck = 0, back = 0, tail = 0, limbs = 0, legs = 0, marker = 0 }, look())
  -- eight headings, standing: a preview sheet is never finished, so it should stay small
  c:drawImage(Render.bossPreview(l, (floor(A.lookT * 1.5) % 8) * 4, 0), 22, 30)
  c:drawImage(Render.bossPreview(l, 8, 0), 22, 96)
  c:drawImage(Render.markerPreview(l.marker or 0, A.lookT), 84, 96)
  D.present()
end

local function onUpdate(self, elapsed)
  if not A.ticked then A.ticked = true; note("first OnUpdate, elapsed " .. tostring(elapsed)) end
  -- the client's own frame rate with the window open, logged now and then: it is the number that says whether
  -- 57,600 textures are affordable
  A.fpsN, A.fpsT = (A.fpsN or 0) + 1, (A.fpsT or 0) + elapsed
  if A.fpsT >= 3 then
    A.fps = A.fpsN / A.fpsT
    A.fpsNotes = (A.fpsNotes or 0) + 1
    if A.fpsNotes <= 40 then note(string.format("client at %.0f fps in mode %s", A.fps, tostring(A.mode))) end
    A.fpsN, A.fpsT = 0, 0
  end
  if A.job then
    local job = A.job
    job.frames = job.frames + 1
    -- Half of each frame goes to the work. If the client is slow anyway, a fixed few milliseconds a frame would
    -- stretch a four-second job into minutes, so the slice grows with the frame time.
    local ms = math.max(11, math.min(80, elapsed * 1000 * 0.6))
    local ok, err = slice(job.co, ms)
    if not ok then fail(err) return end
    -- the title bar says what is going on even if nothing over the picture can be seen
    local secs = (now() - job.t0) / 1000
    local dots = string.format("  %d s", secs)
    local text = (A.loadLabel or "LOADING") .. (D.progress and string.format("  %d%%", D.progress * 100) or dots)
    D.info:SetText(text)
    if ui.loading and ui.loading.status then ui.loading.status:SetText(D.progress and string.format("%d%%", D.progress * 100) or string.format("painting pixels, %d s so far", secs)) end
    if coroutine.status(job.co) == "dead" then
      A.job = nil
      D.info:SetText("")
      note(string.format("loaded '%s' in %d frames, %.1f s", tostring(A.loadLabel), job.frames, (now() - job.t0) / 1000))
      local ok2, err2 = pcall(job.done)
      if not ok2 then fail(err2) end
    end
    return
  end
  A.sinceDraw = A.sinceDraw + elapsed
  local mode = A.mode
  if mode == "play" or mode == "ending" or mode == "look" then
    -- at most DB.fps pictures a second (the simulation always runs at 60 steps a second, whatever this is)
    if A.sinceDraw >= 1 / ((ns.DB.fps or 60) * 1.5) then
      local ok, err = pcall(mode == "play" and playFrame or mode == "ending" and endingFrame or lookFrame, A.sinceDraw)
      A.sinceDraw = 0
      if not ok then fail(err) return end
    end
  end
  if mode == "check" or mode == "count" then guard("the display check", checkTick, elapsed) end
  if mode ~= "look" and A.lookPlain then
    A.lookPlain = false
    Render.previews = RT.Map()   -- let go of the preview sheets
  end
  -- spare time goes to the sprites that have not been painted yet
  if mode ~= "closed" and mode ~= "error" then
    if not A.bg or coroutine.status(A.bg) == "dead" then A.bg = coroutine.create(background) end
    local ok, err = slice(A.bg, mode == "play" and 2.5 or 6)
    if not ok then A.bg = nil end
  end
  stats.t = stats.t + elapsed
  if stats.t >= 1 then
    if ns.DB.perf and stats.frames > 0 then
      D.info:SetText(string.format("sim %.1f ms x%.1f   draw %.1f ms   %d px/frame   %d fps", stats.sim / max(1, stats.steps), stats.steps / stats.frames,
        stats.draw / stats.frames, stats.cells / stats.frames, floor(stats.frames / stats.t + 0.5)))
    elseif A.mode == "error" then D.info:SetText("error: see chat, or /endgame log")
    elseif D.info:GetText() ~= "" then D.info:SetText("") end
    stats.sim, stats.draw, stats.cells, stats.frames, stats.steps, stats.t = 0, 0, 0, 0, 0, 0
  end
end

-- ------------------------------------------------------------------------------------------------ panels

build.loading = function()
  local p = panel("loading", 170, 34)
  local t = line(p, 7, "CENTER", 0, 5, 1, 0.9, 0.6)
  local s = line(p, 5, "CENTER", 0, -7, 0.85, 0.8, 0.7)
  s:SetText("painting pixels")
  p.status = s
  p.refresh = function() t:SetText(A.loadLabel or "LOADING") end
end

build.check = function()
  local p = panel("check", 214, 70)
  local title = line(p, 7, "TOP", 0, -5, 1, 0.9, 0.6)
  local body = line(p, 5, "TOP", 0, -16, 0.93, 0.89, 0.78)
  body:SetWidth(204)
  body:SetText("Is the picture behind this box filled with coloured stripes, edge to edge, inside a white border?")
  button(p, "Yes, all of it", 92, 13, function() answer("yes") end):SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", 10, 14)
  button(p, "No: black or patchy", 92, 13, function() answer("no") end):SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -10, 14)
  line(p, 4.5, "BOTTOM", 0, 4, 1, 0.75, 0.5):SetText("If your whole interface vanishes, press SPACE to bring it back.")
  p.refresh = function() if C then title:SetText("DISPLAY TEST " .. C.i .. " OF " .. #C.modes) end end
end

build.count = function()
  local p = panel("count", 250, 62)
  p:ClearAllPoints(); p:SetPoint("BOTTOM", D.over, "BOTTOM", 0, 6)
  local title = line(p, 7, "TOP", 0, -5, 1, 0.9, 0.6)
  local body = line(p, 4.8, "TOP", 0, -16, 0.93, 0.89, 0.78)
  body:SetWidth(240)
  local start = button(p, "Start measuring", 100, 13, function() startStage(1) end)
  start:SetPoint("BOTTOM", p, "BOTTOM", 0, 5)
  p.refresh = function()
    if not C then return end
    if C.phase == "intro" then
      title:SetText("NEITHER WAY SHOWED THE PICTURE")
      body:SetText("Two short measurements will find out why. Stripes fill the picture from the top. The moment they vanish, or your whole interface vanishes, press SPACE. If they never appear, press SPACE. If nothing goes wrong, just wait.")
      start:Show()
    else
      start:Hide()
      local st = STAGES[C.stage]
      title:SetText("MEASURING " .. (st and st.label or "") .. " OF B")
      if C.phase == "pause" then body:SetText("Noted. The next one starts in a moment.")
      else body:SetText(RT.commas(C.count or 0) .. " squares showing. Press SPACE the moment the stripes, or your whole interface, vanish.") end
    end
  end
end

build.nodisplay = function()
  local p = panel("nodisplay", 240, 62)
  line(p, 7, "TOP", 0, -6, 1, 0.9, 0.6):SetText("THE PICTURE CANNOT BE DRAWN YET")
  local body = line(p, 5, "TOP", 0, -18, 0.93, 0.89, 0.78)
  body:SetWidth(228)
  body:SetText("This client would not show the game's picture either way. The measurements are saved when you type /reload. Do that, then tell Claude it is done.")
  button(p, "Close", 70, 12, function() A.close() end):SetPoint("BOTTOM", p, "BOTTOM", 0, 5)
end

build.error = function()
  local p = panel("error", 260, 90)
  line(p, 7, "TOP", 0, -8, 0.9, 0.35, 0.25):SetText("THE BOSS TRIPPED")
  local t = line(p, 4.5, "TOP", 0, -24, 0.85, 0.8, 0.7)
  t:SetWidth(240); t:SetJustifyH("LEFT")
  button(p, "Back to the menu", 90, 13, function() A.goMenu() end):SetPoint("BOTTOM", p, "BOTTOM", 0, 8)
  p.refresh = function() t:SetText((A.err or "?") .. "\n\nThis is a bug in the addon. The text above is also in your chat window.") end
end

build.menu = function()
  local p = panel("menu", 190, 166)
  line(p, 12, "TOP", 0, -10, 0.86, 0.72, 0.36):SetText("THE ENDGAME IS ME")
  line(p, 4.5, "TOP", 0, -27, 0.62, 0.58, 0.5):SetText("You are the boss. They are the content.")
  local y = -40
  local function add(text, fn) local b = button(p, text, 110, 13, fn); b:SetPoint("TOP", p, "TOP", 0, y); y = y - 16; return b end
  local cont = add("Continue", function() A.continue() end)
  add("New game", function() A.newRun() end)
  local plus = add("New Game +", function() A.newRun(Store.plus()) end)
  add("Appearance", function() A.setMode("look") end)
  add("Controls", function() A.openKeys() end)
  local snd = add("Sound", function() ns.Sound.toggle(); ui.menu.refresh() end)
  local best = line(p, 4.5, "BOTTOM", 0, 18, 0.86, 0.72, 0.36)
  local help = line(p, 4, "BOTTOM", 0, 5, 0.55, 0.52, 0.46)
  help:SetWidth(182)
  p.refresh = function()
    help:SetText(Keys.summary())
    local info = Store.info()
    cont:able(info ~= nil)
    cont.label:SetText(info and ("Continue (level " .. info.level .. ", " .. RT.commas(info.score) .. ")") or "Continue")
    local pl = Store.plus()
    plus:able(pl ~= nil)
    plus.label:SetText(pl and ("New Game +" .. ((pl.ng or 0) > 0 and (pl.ng + 1) or "")) or "New Game + (beat the castle)")
    snd.label:SetText(ns.DB.mute and "Sound: off" or "Sound: on")
    best:SetText((ns.DB.best or 0) > 0 and ("Best shift: " .. RT.commas(ns.DB.best) .. " points") or "")
  end
end

build.pause = function()
  local p = panel("pause", 130, 102)
  line(p, 8, "TOP", 0, -8, 0.93, 0.89, 0.78):SetText("ON BREAK")
  line(p, 4, "TOP", 0, -20, 0.6, 0.56, 0.48):SetText("The keyboard is WoW's again until you resume.")
  button(p, "Resume", 100, 13, function() A.resume() end):SetPoint("TOP", p, "TOP", 0, -30)
  button(p, "Save and quit", 100, 13, function() A.saveNow(); A.goMenu() end):SetPoint("TOP", p, "TOP", 0, -46)
  button(p, "Controls", 100, 13, function() A.openKeys() end):SetPoint("TOP", p, "TOP", 0, -62)
  local snd = button(p, "Sound", 100, 13, function() ns.Sound.toggle(); ui.pause.refresh() end)
  snd:SetPoint("TOP", p, "TOP", 0, -78)
  p.refresh = function() snd.label:SetText(ns.DB.mute and "Sound: off" or "Sound: on") end
end

-- ------------------------------------------------------------------------------------------------ the Controls panel

-- Two places for a key or a mouse button beside each action. Clicking one puts up a box that takes the next key
-- pressed, or the next mouse button clicked on it. While the box is up it has the whole keyboard, Esc included, so
-- it is never put up in combat and comes down the moment a fight starts.
local capture   -- { act = an entry of Keys.ACTIONS, slot = 1 or 2 } while the box is waiting

function A.endCapture()
  capture = nil
  local p = ui.keys
  if p and p.cap then p.cap:EnableKeyboard(false); p.cap:Hide() end
end

function A.startCapture(act, slot)
  if _G.InCombatLockdown and _G.InCombatLockdown() then
    A.keysMsg = "Not while you are in combat."
    ui.keys.refresh()
    return
  end
  capture = { act = act, slot = slot }
  local cap = ui.keys.cap
  local now = Keys.get(act.id, slot)
  cap.title:SetText(act.name:upper() .. ", KEY " .. slot)
  cap.sub:SetText("Now: " .. (now and Keys.name(now) or "nothing") .. ".   Esc cancels.   A key already in use moves here.")
  cap.clear:able(now ~= nil)
  cap:Show()
  cap:EnableKeyboard(true)
end

-- the box heard something: a key name from OnKeyDown, or BUTTON1 to BUTTON5
function A.captured(key)
  local c = capture
  if not c then return end
  if key == "ESCAPE" then
    A.keysMsg = nil
    ui.keys.refresh()
    return
  end
  local ok, from = Keys.set(c.act.id, c.slot, key)
  if not ok then return end   -- not a key that can be bound: keep waiting
  A.keysMsg = from and (Keys.name(key) .. " was " .. Keys.actionName(from) .. ". Now it is " .. c.act.name .. ".") or (c.act.name .. ": " .. Keys.name(key) .. ".")
  note("controls: " .. c.act.id .. " " .. c.slot .. " = " .. key .. (from and (" (taken from " .. from .. ")") or ""))
  ns.Sound.play("menuGo")
  ui.keys.refresh()
end

-- The panel sits over whatever was up: the menu, a run on break, the Hoard. Done goes back there.
function A.openKeys()
  if A.mode == "play" then A.pause() end
  if A.mode == "keys" then return true end
  if A.job or not ({ menu = true, paused = true, store = true, over = true, won = true, look = true })[A.mode] then return false end
  A.keysBack, A.keysMsg = A.mode, nil
  A.setMode("keys")
  return true
end

build.keys = function()
  local p = panel("keys", 240, 172)
  line(p, 8, "TOPLEFT", 8, -6, 0.86, 0.72, 0.36):SetText("CONTROLS")
  local hint = D.text(p, 4.2, 0.62, 0.58, 0.5)
  hint:SetPoint("TOPRIGHT", p, "TOPRIGHT", -8, -8.5)
  hint:SetText("Click a key to change it. Esc always pauses.")
  local cells = {}
  for i, act in ipairs(Keys.ACTIONS) do
    local y = -19 - (i - 1) * 10.4
    line(p, 5, "TOPLEFT", 10, y - 2.2, 0.8, 0.76, 0.66):SetText(act.name)
    cells[act.id] = {}
    for slot = 1, 2 do
      local b = button(p, "", 70, 9.4, function() A.startCapture(act, slot) end)
      b:SetPoint("TOPLEFT", p, "TOPLEFT", 86 + (slot - 1) * 73, y)
      b.label:SetFont(D.FONT, 4.8, "")
      cells[act.id][slot] = b
    end
  end
  local status = line(p, 4.4, "BOTTOMLEFT", 10, 20.5, 1, 0.75, 0.5)
  status:SetWidth(220); status:SetJustifyH("LEFT")
  button(p, "Defaults", 70, 12, function()
    Keys.reset()
    A.keysMsg = "Back to the keys the game came with."
    ui.keys.refresh()
  end):SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", 10, 5)
  button(p, "Done", 70, 12, function() A.setMode(A.keysBack or "menu") end):SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -10, 5)

  -- the box that listens, over the middle of the list
  local cap = _G.CreateFrame("Frame", nil, p)
  cap:SetFrameLevel(p:GetFrameLevel() + 20)
  cap:SetSize(204, 66)
  cap:SetPoint("CENTER", p, "CENTER", 0, 4)
  cap:EnableMouse(true)
  local rim = D.solid(cap, "BACKGROUND", 0.86, 0.72, 0.36, 1)
  rim:SetAllPoints(cap)
  local bg = D.solid(cap, "BORDER", 0.1, 0.08, 0.06, 1)
  bg:SetPoint("TOPLEFT", cap, "TOPLEFT", 1, -1); bg:SetPoint("BOTTOMRIGHT", cap, "BOTTOMRIGHT", -1, 1)
  cap.title = line(cap, 6.5, "TOP", 0, -6, 0.86, 0.72, 0.36)
  line(cap, 5, "TOP", 0, -19, 0.93, 0.89, 0.78):SetText("Press a key, or click a mouse button on this box.")
  cap.sub = line(cap, 4.2, "TOP", 0, -29, 0.62, 0.58, 0.5)
  cap.clear = button(cap, "Clear this key", 84, 11, function()
    local c = capture
    if c and Keys.clear(c.act.id, c.slot) then A.keysMsg = c.act.name .. ": key " .. c.slot .. " cleared." end
    ui.keys.refresh()
  end)
  cap.clear:SetPoint("BOTTOMLEFT", cap, "BOTTOMLEFT", 10, 6)
  button(cap, "Cancel", 84, 11, function() ui.keys.refresh() end):SetPoint("BOTTOMRIGHT", cap, "BOTTOMRIGHT", -10, 6)
  cap:SetScript("OnKeyDown", function(self, key) guard("the controls", A.captured, key) end)
  cap:SetScript("OnMouseDown", function(self, btn)
    local name = Keys.MOUSE[btn]
    if name then guard("the controls", A.captured, name) end
  end)
  cap:Hide()
  p.cap = cap

  -- showing the panel as it stands always puts the box away
  p.refresh = function()
    A.endCapture()
    for _, act in ipairs(Keys.ACTIONS) do
      for slot = 1, 2 do
        local key = Keys.get(act.id, slot)
        cells[act.id][slot].label:SetText(key and Keys.name(key) or "-")
      end
    end
    status:SetText(A.keysMsg or "")
  end
end

local function statBlock(p, top, rows)
  local fs = {}
  for i = 1, rows do
    local k = line(p, 4.5, "TOPLEFT", 14, top - (i - 1) * 7, 0.62, 0.58, 0.5)
    local v = D.text(p, 4.5, 0.93, 0.89, 0.78)
    v:SetPoint("TOPRIGHT", p, "TOPRIGHT", -14, top - (i - 1) * 7)
    fs[i] = { k, v }
  end
  return function(list)
    for i = 1, rows do
      local r = list[i]
      fs[i][1]:SetText(r and r[1] or ""); fs[i][2]:SetText(r and tostring(r[2]) or "")
    end
  end
end

build.over = function()
  local p = panel("over", 190, 150)
  line(p, 9, "TOP", 0, -8, 0.9, 0.35, 0.25):SetText("YOU HAVE BEEN DEFEATED")
  local by = line(p, 5, "TOP", 0, -22, 0.93, 0.89, 0.78)
  local sub = line(p, 4.5, "TOP", 0, -30, 0.62, 0.58, 0.5)
  local set = statBlock(p, -42, 10)
  local again = button(p, "Respawn", 80, 13, function() A.respawn() end)
  again:SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", 12, 8)
  button(p, "Menu", 80, 13, function() A.goMenu() end):SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -12, 8)
  p.refresh = function()
    local t = A.overText
    by:SetText(t[1]); sub:SetText(t[2]); set(t[3])
    again.label:SetText(Store.info() and "Respawn (last save)" or "Clock in again")
  end
end

build.won = function()
  local p = panel("won", 190, 120)
  line(p, 9, "TOP", 0, -8, 0.86, 0.72, 0.36):SetText("THE KINGDOM IS RUBBLE")
  line(p, 4.5, "TOP", 0, -22, 0.62, 0.58, 0.5):SetText("Every hero has logged off. You went home to your rocks.")
  local set = statBlock(p, -34, 6)
  local plus = button(p, "New Game +", 80, 13, function() A.newRun(Store.plus()) end)
  plus:SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", 12, 8)
  button(p, "Menu", 80, 13, function() A.goMenu() end):SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT", -12, 8)
  p.refresh = function()
    set(A.wonText)
    local g = A.g
    plus.label:SetText((g.ng and g.ng > 0) and ("New Game +" .. (g.ng + 1)) or "New Game +")
  end
end

-- what the Mutate button would buy for one ability
local function mutateOffer(g, id)
  local o = World.abilityOffer(g, id)
  if o.buyCost ~= nil then return o, o.buyCost, "Learn it" end
  if o.upCost ~= nil then return o, o.upCost, o.upText end
  return o, nil, "Fully mutated"
end

build.store = function()
  local p = panel("store", 304, 166)
  line(p, 9, "TOPLEFT", 8, -6, 0.86, 0.72, 0.36):SetText("THE HOARD")
  local pts = D.text(p, 6, 0.86, 0.72, 0.36)
  pts:SetPoint("TOPRIGHT", p, "TOPRIGHT", -8, -8)
  local rows = {}
  local AB = World.ABILITIES
  local names = {}
  for i = 0, AB.length - 1 do names[AB[i].id] = AB[i].name end
  for i = 0, AB.length - 1 do
    local a = AB[i]
    local b = button(p, "", 142, 10.5, function() A.storeSel, A.storeMsg = a.id, nil; ui.store.refresh() end)
    b:SetPoint("TOPLEFT", p, "TOPLEFT", 8, -22 - i * 11.5)
    b.label:ClearAllPoints(); b.label:SetPoint("LEFT", b, "LEFT", 3, 0); b.label:SetFont(D.FONT, 5, "")
    b.cost = D.text(b, 4.5, 0.86, 0.72, 0.36); b.cost:SetPoint("RIGHT", b, "RIGHT", -3, 0)
    b.pips = D.text(b, 4.5, 0.6, 0.8, 0.6); b.pips:SetPoint("RIGHT", b, "RIGHT", -50, 0)
    rows[a.id] = b
  end
  local name = line(p, 7, "TOPLEFT", 158, -22, 0.93, 0.89, 0.78)
  local tag = line(p, 4.5, "TOPLEFT", 158, -32, 0.6, 0.8, 0.6)
  local desc = line(p, 4.5, "TOPLEFT", 158, -41, 0.8, 0.76, 0.66)
  desc:SetWidth(138); desc:SetJustifyH("LEFT")
  local what = line(p, 4.5, "TOPLEFT", 158, -68, 0.62, 0.58, 0.5)
  what:SetWidth(138); what:SetJustifyH("LEFT")
  local mutate = button(p, "Mutate", 138, 14, function()
    local g, id = A.g, A.storeSel
    local o = World.abilityOffer(g, id)
    local ok
    if o.buyCost ~= nil then ok = World.buyAbility(g, id) else ok = World.upgradeAbility(g, id) end
    if ok then
      ns.Sound.play("buy")
      -- a new ability takes the first free button; with all five in use it has none until the player gives it one
      A.storeMsg = (not o.it.passive and RT.indexOf(g.slots, id) < 0) and (o.it.name .. " needs a button: click a slot.") or nil
      ui.store.refresh()
    end
  end)
  mutate:SetPoint("TOPLEFT", p, "TOPLEFT", 158, -86)
  local hint = line(p, 4.5, "TOPLEFT", 158, -106, 0.62, 0.58, 0.5)
  -- what the player knows slot i by: the key it is on
  local function keyOf(i)
    local key = Keys.first("slot" .. i)
    return key and Keys.short(key) or ("slot " .. (i + 1))
  end
  local slots = {}
  local openPick
  for i = 0, 4 do
    local b = button(p, "", 138, 9, function() openPick(i) end)
    b:SetPoint("TOPLEFT", p, "TOPLEFT", 158, -113 - i * 9.5)
    b.label:SetFont(D.FONT, 4.5, "")
    slots[i] = b
  end
  local go = button(p, "Onward", 142, 14, function() A.closeStore() end)
  go:SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", 8, 6)

  -- The list a slot puts up, as the browser game's drop-down does: everything owned that can go on a button, and
  -- where each of them is now. Picking one changes that slot and nothing else, except that a pick which was on
  -- another button trades places with what was here (World.setSlot). The veil behind the list takes every click
  -- that misses it, so nothing under it can be pressed by accident; a click on the veil is Cancel. The list sits
  -- on the left, clear of the slots, so the click that opened it (or its second half, for a double-clicker) can
  -- never land on a row.
  local pick = _G.CreateFrame("Frame", nil, p)
  pick:SetFrameLevel(p:GetFrameLevel() + 20)
  pick:SetAllPoints(p)
  pick:EnableMouse(true)
  D.solid(pick, "BACKGROUND", 0.04, 0.03, 0.02, 0.6):SetAllPoints(pick)
  pick:SetScript("OnMouseDown", function() guard("the Hoard", ui.store.refresh) end)
  local box = _G.CreateFrame("Frame", nil, pick)
  box:SetFrameLevel(pick:GetFrameLevel() + 1)
  box:SetPoint("LEFT", pick, "LEFT", 4, 0)
  box:EnableMouse(true)
  local rim = D.solid(box, "BACKGROUND", 0.86, 0.72, 0.36, 1)
  rim:SetAllPoints(box)
  local bg = D.solid(box, "BORDER", 0.1, 0.08, 0.06, 1)
  bg:SetPoint("TOPLEFT", box, "TOPLEFT", 1, -1); bg:SetPoint("BOTTOMRIGHT", box, "BOTTOMRIGHT", -1, 1)
  local title = line(box, 6.5, "TOP", 0, -6, 0.86, 0.72, 0.36)
  line(box, 4.2, "TOP", 0, -16.5, 0.62, 0.58, 0.5):SetText("One that is on another button trades places.")
  local function choose(id)
    local g, i = A.g, pick.slot
    local was = g.slots[i]
    if id ~= was then
      local from = id and RT.indexOf(g.slots, id) or -1
      World.setSlot(g, i, id)
      local new, old = id and names[id], was and names[was]
      if not id then A.storeMsg = keyOf(i) .. " is empty. " .. old .. " has no button."
      elseif from >= 0 then A.storeMsg = old and (new .. " and " .. old .. " traded places.") or (new .. " moved from " .. keyOf(from) .. " to " .. keyOf(i) .. ".")
      else A.storeMsg = old and (new .. " replaced " .. old .. " on " .. keyOf(i) .. ".") or (new .. " is on " .. keyOf(i) .. ".") end
      note("hoard: slot " .. i .. " = " .. tostring(id) .. " (was " .. tostring(was) .. (from >= 0 and (", traded with slot " .. from) or "") .. ")")
    end
    ui.store.refresh()
  end
  local function pickRow(text, id)
    local b = button(box, text, 138, 9, function() choose(id) end)
    b.label:ClearAllPoints(); b.label:SetPoint("LEFT", b, "LEFT", 3, 0); b.label:SetFont(D.FONT, 4.8, "")
    b.where = D.text(b, 4.2, 0.86, 0.72, 0.36); b.where:SetPoint("RIGHT", b, "RIGHT", -3, 0)
    return b
  end
  local pickRows = {}
  for i = 0, AB.length - 1 do if not AB[i].passive then pickRows[AB[i].id] = pickRow(AB[i].name, AB[i].id) end end
  local none = pickRow("(empty)", nil)
  button(box, "Cancel", 60, 10, function() ui.store.refresh() end):SetPoint("BOTTOM", box, "BOTTOM", 0, 5)
  openPick = function(i)
    local g = A.g
    pick.slot = i
    title:SetText("WHAT GOES ON " .. keyOf(i):upper() .. "?")
    local n = 0
    local function place(b, here, where)
      b:ClearAllPoints(); b:SetPoint("TOPLEFT", box, "TOPLEFT", 6, -25 - n * 9.6)
      n = n + 1
      b.sel = here
      b.where:SetText(here and "here now" or where)
      b:paint(false)
      b:Show()
    end
    for k = 0, AB.length - 1 do
      local id = AB[k].id
      local b = pickRows[id]
      if b then
        if RT.has(g.owned, id) then
          local at = RT.indexOf(g.slots, id)
          place(b, at == i, at >= 0 and ("on " .. keyOf(at)) or "")
        else b:Hide() end
      end
    end
    place(none, g.slots[i] == nil, "")
    box:SetSize(150, 44 + n * 9.6)
    for k = 0, 4 do slots[k].sel = k == i; slots[k]:paint(false) end
    pick:Show()
  end
  pick:Hide()
  p.pick = pick

  -- showing the panel as it stands always puts the list away
  p.refresh = function()
    local g = A.g
    pick:Hide()
    pts:SetText(RT.commas(g.points) .. " points")
    go.label:SetText("Onward to level " .. (g.map.n + 1))
    for i = 0, AB.length - 1 do
      local a = AB[i]
      local o, cost = mutateOffer(g, a.id)
      local b = rows[a.id]
      local owned = o.owned or (a.passive and o.lvl > 0)
      b.sel = a.id == A.storeSel
      b.label:SetText(a.name)
      b.pips:SetText(string.rep("#", o.lvl) .. string.rep("-", o.max - o.lvl))
      b.cost:SetText(cost == nil and "maxed" or ((owned and "upgrade " or "learn ") .. RT.commas(cost)))
      if cost ~= nil and g.points < cost then b.cost:SetTextColor(0.5, 0.46, 0.4) else b.cost:SetTextColor(0.86, 0.72, 0.36) end
      b:paint(false)
    end
    local o, cost, text = mutateOffer(g, A.storeSel)
    local a = o.it
    name:SetText(a.name)
    local where = RT.indexOf(g.slots, a.id)
    tag:SetText(a.passive and (o.lvl > 0 and ("level " .. o.lvl) or "not grown")
      or o.owned and (where >= 0 and ("on " .. keyOf(where)) or "owned, not on a button") or "not owned")
    desc:SetText((a.id == "summon" and o.owned and o.lvl > 0) and a.ups[o.lvl - 1] or a.desc)
    what:SetText(cost == nil and "Nothing left to grow." or ("Mutate: " .. tostring(text)))
    mutate.label:SetText(cost == nil and "Fully mutated" or ("Mutate   " .. RT.commas(cost)))
    mutate:able(cost ~= nil and g.points >= cost)
    if A.storeMsg then hint:SetText(A.storeMsg); hint:SetTextColor(1, 0.75, 0.5)
    else hint:SetText("Slots: click one to pick what goes on it."); hint:SetTextColor(0.62, 0.58, 0.5) end
    for i = 0, 4 do
      local b = slots[i]
      b.label:SetText(keyOf(i) .. ":  " .. (g.slots[i] and names[g.slots[i]] or "(empty)"))
      b.sel = false
      b:paint(false)
    end
  end
end

local FURS = { false, "#8a5a36", "#c9c4b6", "#2a2622", "#b8452a", "#d8a040", "#5a8a3a", "#3a6a9a", "#93619f", "#e2486a", "#5ad0c8" }
local PARTS = { { "head", "Head" }, { "horns", "Horns" }, { "neck", "Neck" }, { "back", "Back" }, { "tail", "Tail" }, { "limbs", "Feet" }, { "legs", "Legs" }, { "marker", "Rock marker" } }

build.look = function()
  local p = panel("look", 176, 164)
  p:ClearAllPoints(); p:SetPoint("RIGHT", D.over, "RIGHT", -6, 0)
  line(p, 8, "TOPLEFT", 8, -6, 0.86, 0.72, 0.36):SetText("APPEARANCE")
  local values = {}
  local function change(key, d)
    local l = ns.DB.look or {}
    local opts = World.LOOKS[key]
    l[key] = ((l[key] or 0) + d) % opts.length
    ns.DB.look = l
    ui.look.refresh()
  end
  for i, part in ipairs(PARTS) do
    local y = -20 - (i - 1) * 12
    line(p, 4.5, "TOPLEFT", 8, y - 2, 0.62, 0.58, 0.5):SetText(part[2])
    button(p, "<", 10, 10, function() change(part[1], -1) end):SetPoint("TOPLEFT", p, "TOPLEFT", 58, y)
    button(p, ">", 10, 10, function() change(part[1], 1) end):SetPoint("TOPLEFT", p, "TOPLEFT", 158, y)
    local v = D.text(p, 5, 0.93, 0.89, 0.78)
    v:SetPoint("TOP", p, "TOPLEFT", 113, y - 2)
    values[part[1]] = v
  end
  line(p, 4.5, "TOPLEFT", 8, -119, 0.62, 0.58, 0.5):SetText("Fur")
  local swatches = {}
  for i, hex in ipairs(FURS) do
    local b = button(p, hex and "" or "nat", 10, 10, function() local l = ns.DB.look or {}; l.fur = hex or nil; ns.DB.look = l; ui.look.refresh() end)
    b:SetPoint("TOPLEFT", p, "TOPLEFT", 34 + (i - 1) * 12, -116)
    if hex then
      local c = RT.parseColor(hex).rgb
      b.chip = D.solid(b, "ARTWORK", floor(c / 65536) / 255, floor(c / 256) % 256 / 255, c % 256 / 255, 1)
      b.chip:SetPoint("TOPLEFT", b, "TOPLEFT", 1.5, -1.5); b.chip:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -1.5, 1.5)
    else b.label:SetFont(D.FONT, 3.5, "") end
    swatches[i] = b
  end
  line(p, 4.5, "TOPLEFT", 8, -134, 0.62, 0.58, 0.5):SetText("Name")
  local edit = _G.CreateFrame("EditBox", nil, p)
  edit:SetSize(100, 10)
  edit:SetPoint("TOPLEFT", p, "TOPLEFT", 34, -131)
  edit:SetFont(D.FONT, 5, "")
  edit:SetTextColor(0.93, 0.89, 0.78)
  edit:SetAutoFocus(false)
  edit:SetMaxLetters(26)
  local eb = D.solid(edit, "BACKGROUND", 0.16, 0.12, 0.09, 1)
  eb:SetPoint("TOPLEFT", edit, "TOPLEFT", -2, 1); eb:SetPoint("BOTTOMRIGHT", edit, "BOTTOMRIGHT", 2, -1)
  local function keep() local s = (edit:GetText() or ""):gsub("^%s+", ""):gsub("%s+$", ""); ns.DB.name = s ~= "" and s:upper() or nil end
  edit:SetScript("OnEnterPressed", function(self) keep(); self:ClearFocus() end)
  edit:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  edit:SetScript("OnEditFocusLost", keep)
  button(p, "any", 24, 10, function() ns.DB.name = nil; edit:SetText(""); edit:ClearFocus() end):SetPoint("TOPLEFT", p, "TOPLEFT", 140, -131)
  button(p, "Done", 60, 12, function() keep(); edit:ClearFocus(); A.setMode("menu") end):SetPoint("BOTTOM", p, "BOTTOM", 0, 5)
  p.refresh = function()
    local l = ns.DB.look or {}
    for _, part in ipairs(PARTS) do values[part[1]]:SetText(World.LOOKS[part[1]][l[part[1]] or 0]) end
    for i, hex in ipairs(FURS) do swatches[i].sel = (l.fur or false) == hex; swatches[i]:paint(false) end
    edit:SetText(ns.DB.name or "")
  end
end

-- ------------------------------------------------------------------------------------------------ opening and closing

-- The client's Options and game menu cover the screen and hide the rest of the interface while they are up, so a
-- window opened from there would sit underneath, unseen. Put them away first (not possible in combat).
local function clearTheWay()
  if _G.InCombatLockdown and _G.InCombatLockdown() then return end
  for _, name in ipairs({ "SettingsPanel", "GameMenuFrame" }) do
    local panel = _G[name]
    if panel and panel.IsShown and panel:IsShown() then
      note("closing " .. name .. " to show the window")
      if _G.HideUIPanel then _G.HideUIPanel(panel) else panel:Hide() end
    end
  end
end

function A.open()
  guard("closing the client's menus", clearTheWay)
  note("open: UIParent shown " .. tostring(_G.UIParent:IsShown()) .. ", alpha " .. tostring(_G.UIParent.GetAlpha and _G.UIParent:GetAlpha()))
  note("open: client build " .. tostring(_G.GetBuildInfo and select(4, _G.GetBuildInfo())) .. ", screen " .. tostring(_G.GetPhysicalScreenSize and table.concat({ _G.GetPhysicalScreenSize() }, "x")))
  local f = D.create()
  note(string.format("window made: scale %s (%d px per game px), effective %.4f, UIParent %.4f", tostring(f:GetScale()), D.scale, f:GetEffectiveScale(), _G.UIParent:GetEffectiveScale()))
  if not ui.dim then
    ui.dim = D.solid(D.over, "BACKGROUND", 0, 0, 0, 0.55)
    ui.dim:SetAllPoints(D.over)
    local view = D.view
    view:EnableMouse(true)
    view:SetScript("OnKeyDown", onKeyDown)
    view:SetScript("OnKeyUp", onKeyUp)
    view:SetScript("OnMouseDown", onMouseDown)
    view:SetScript("OnMouseUp", onMouseUp)
    f:SetScript("OnUpdate", onUpdate)
  end
  f:Show()
  note(string.format("window shown: visible %s, left %s, bottom %s, size %sx%s, strata %s", tostring(f.IsVisible and f:IsVisible()), tostring(f:GetLeft()), tostring(f:GetBottom()),
    tostring(f.GetWidth and f:GetWidth()), tostring(f.GetHeight and f:GetHeight()), tostring(f.GetFrameStrata and f:GetFrameStrata())))
  if not D.built then
    note("opening for the first time this session")
    A.load("SETTING UP THE SCREEN", function()
      D.build()
      note("grid built")
      A.R = Render.createRenderer()
      Render.setCalm(false)   -- the window does the shaking (see display.lua), so the renderer's own switch stays on
      note("renderer made")
    end, function()
      local mode = ns.DB.display
      if mode == "clip" or (mode == "buffer" and D.canBuffer()) then
        D.setMode(mode)
        afterDisplay()
      else
        A.startCheck(A.measureFirst)
        A.measureFirst = nil
      end
    end)
  elseif A.mode == "closed" then
    if not ns.DB.display then A.startCheck(A.measureFirst); A.measureFirst = nil
    else
      A.setMode(A.wasMode == "paused" and "paused" or A.wasMode == "store" and "store" or "menu")
      if A.wantKeys then A.wantKeys = nil; A.openKeys() end
    end
  end
end

function A.close()
  if not D.frame then return end
  A.wantKeys = nil
  if A.mode == "keys" then A.setMode(A.keysBack or "menu") end   -- back to what the panel was over, so that is what gets saved
  if A.mode == "play" then A.setMode("paused") end
  A.saveNow()
  A.wasMode = A.mode
  A.mode = "closed"
  D.view:EnableKeyboard(false)
  ns.Sound.setStage(0)
  D.frame:Hide()
end

function A.toggle()
  if D.frame and D.frame:IsShown() then guard("closing the window", A.close) else guard("opening the window", A.open) end
end

-- the Controls panel, asked for from outside the window (the options page, /endgame keys): open the window first if it is shut
function A.showKeys()
  guard("closing the client's menus", clearTheWay)
  if not (D.frame and D.frame:IsShown()) then
    A.wantKeys = true
    guard("opening the window", A.open)
  elseif not A.openKeys() then
    RT.print("the window is busy. When it is done, Controls is on the game's menu.")
  end
end

-- ------------------------------------------------------------------------------------------------ events and the slash command

local ev = _G.CreateFrame("Frame")
ev:RegisterEvent("ADDON_LOADED")
ev:RegisterEvent("PLAYER_LOGOUT")
ev:RegisterEvent("PLAYER_REGEN_DISABLED")
ev:RegisterEvent("UI_SCALE_CHANGED")
ev:RegisterEvent("DISPLAY_SIZE_CHANGED")
-- a page in the client's Options > AddOns list: what the addon is, the keys as they stand, and how to open it
local function settingsPage()
  local S = _G.Settings
  if not (S and S.RegisterCanvasLayoutCategory and S.RegisterAddOnCategory) then return end
  local page = _G.CreateFrame("Frame")
  page.name = "The Endgame is Me"
  local function text(size, x, y, width, str, r, g, b)
    local fs = page:CreateFontString(nil, "OVERLAY")
    fs:SetFont(D.FONT, size, "")
    fs:SetTextColor(r or 0.93, g or 0.89, b or 0.78)
    fs:SetPoint("TOPLEFT", page, "TOPLEFT", x, y)
    fs:SetWidth(width); fs:SetJustifyH("LEFT")
    fs:SetText(str)
    return fs
  end
  local function press(label, x, y, w, fn)
    local b = _G.CreateFrame("Button", nil, page)
    b:SetSize(w, 28)
    b:SetPoint("TOPLEFT", page, "TOPLEFT", x, y)
    local bg = b:CreateTexture(nil, "BACKGROUND"); bg:SetColorTexture(0.33, 0.24, 0.13, 1); bg:SetAllPoints(b)
    b.label = b:CreateFontString(nil, "OVERLAY"); b.label:SetFont(D.FONT, 14, ""); b.label:SetPoint("CENTER", b, "CENTER", 0, 0); b.label:SetText(label)
    b:SetScript("OnClick", function() guard("the options page", fn) end)
    return b
  end
  text(22, 16, -16, 560, "The Endgame is Me", 0.86, 0.72, 0.36)
  text(13, 16, -50, 560, "A reverse boss fight in a window: you are the boss, the raids are the content.")
  text(13, 16, -76, 560, "/endgame  opens and closes the game (also /teim). The mouse aims. Esc pauses and gives the keyboard back to WoW.")
  text(14, 16, -118, 560, "Controls", 0.86, 0.72, 0.36)
  local left, right = text(12, 16, -140, 270, ""), text(12, 300, -140, 270, "")
  press("Open the game", 16, -246, 160, function() if not (D.frame and D.frame:IsShown()) then A.toggle() end end)
  press("Change the controls", 188, -246, 190, function() A.showKeys() end)
  text(13, 16, -292, 560, "/endgame keys             change the controls\n/endgame scale 1-8    screen pixels per game pixel (or: auto)\n/endgame fps 30         draw less often\n/endgame perf            timings in the title bar\n/endgame calm           screen shake on or off\n/endgame mute           sound on or off\n/endgame reset          move the window back to the middle\n/endgame log              what the addon has been doing", 0.7, 0.67, 0.6)
  -- the keys as they are now, in two columns; filled in each time the page is shown
  local function refresh()
    local cols = { {}, {} }
    for i, act in ipairs(Keys.ACTIONS) do
      local keys = Keys.describe(act.id)
      if act.id == "pause" then keys = keys == "not set" and "Esc" or ("Esc, " .. keys) end
      local col = cols[i <= 6 and 1 or 2]
      col[#col + 1] = act.name .. ":  " .. keys
    end
    left:SetText(table.concat(cols[1], "\n"))
    right:SetText(table.concat(cols[2], "\n"))
  end
  page:SetScript("OnShow", function() guard("the options page", refresh) end)
  refresh()
  local cat = S.RegisterCanvasLayoutCategory(page, page.name)
  S.RegisterAddOnCategory(cat)
end

ev:SetScript("OnEvent", function(self, event, arg1)
  if event == "ADDON_LOADED" then
    if arg1 == ADDON then Store.init(); Keys.init(); ns.Sound.init(); guard("the options page", settingsPage) end
  elseif event == "PLAYER_LOGOUT" then
    A.saveNow()
  elseif event == "UI_SCALE_CHANGED" or event == "DISPLAY_SIZE_CHANGED" then
    if D.frame then D.applyScale() end   -- keep one game pixel on a whole number of screen pixels
  elseif event == "PLAYER_REGEN_DISABLED" then
    -- a real fight has started: hand the keyboard back at once
    if A.mode == "play" then
      A.setMode("paused")
      RT.print("paused, because you are in combat.")
    elseif A.mode == "keys" and ui.keys then
      ui.keys.refresh()   -- puts the listening box away
    end
  end
end)

_G.SLASH_THEENDGAMEISME1 = "/endgame"
_G.SLASH_THEENDGAMEISME2 = "/teim"
_G.SlashCmdList["THEENDGAMEISME"] = function(msg)
  local cmd, arg = (msg or ""):lower():match("^%s*(%S*)%s*(.-)%s*$")
  if cmd == "scale" then
    local n = tonumber(arg)
    ns.DB.scale = (n and n >= 1 and n <= 8) and floor(n) or 0
    if D.frame then D.applyScale() end
    RT.print("window scale: " .. (ns.DB.scale == 0 and "automatic" or (ns.DB.scale .. " screen pixels per game pixel")))
  elseif cmd == "perf" then
    ns.DB.perf = not ns.DB.perf
    RT.print("timings in the title bar: " .. (ns.DB.perf and "on" or "off"))
  elseif cmd == "fps" then
    local n = tonumber(arg)
    ns.DB.fps = (n and n >= 10 and n <= 240) and floor(n) or 60
    RT.print("drawing at most about " .. ns.DB.fps .. " frames a second. Lower it if the game drags your frame rate down.")
  elseif cmd == "calm" then
    ns.DB.calm = not ns.DB.calm
    RT.print("screen shake: " .. (ns.DB.calm and "off" or "on"))
  elseif cmd == "mute" or cmd == "sound" then
    ns.Sound.toggle()
    RT.print("sound: " .. (ns.DB.mute and "off" or "on"))
  elseif cmd == "reset" then
    ns.DB.pos = nil
    if D.frame then D.frame:ClearAllPoints(); D.frame:SetPoint("CENTER", _G.UIParent, "CENTER", 0, 20); D.snap() end
    RT.print("window moved back to the middle.")
  elseif cmd == "probe" or cmd == "measure" then
    -- run the display check again (probe), or go straight to measuring the renderer's limits (measure)
    ns.DB.display = nil
    if D.built and D.frame and D.frame:IsShown() and not A.job then guard("the display check", A.startCheck, cmd == "measure")
    else A.measureFirst = cmd == "measure"; if not (D.frame and D.frame:IsShown()) then A.toggle() end end
  elseif cmd == "keys" or cmd == "controls" or cmd == "binds" then
    A.showKeys()
  elseif cmd == "log" then
    for _, l in ipairs(ns.DB.log or {}) do RT.print(l) end
  elseif cmd == "help" or cmd == "?" then
    RT.print("/endgame opens and closes the game.  /endgame keys,  scale <1-8 or auto>,  fps <10-240>,  perf,  calm,  mute,  reset,  log,  probe")
  else
    A.toggle()
  end
end
-- retail's addon compartment (the dropdown by the minimap) calls this by name
_G.TheEndgameIsMe_OnCompartmentClick = function() A.toggle() end
