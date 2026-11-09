-- The Endgame is Me: the part of the browser game's main.js that a WoW addon needs: input, the fixed-step loop, the
-- menus, the Hoard between levels, saves, and the slash command. The rules and the drawing are the game's own
-- modules (the game_*.lua files beside this one).

local ADDON, ns = ...
local RT, D, Store = ns.RT, ns.Display, ns.Store
local World, Render, Art = RT.module("world"), RT.module("render"), RT.module("art")
local Screen = RT.Screen
local floor, min, max = math.floor, math.min, math.max
local DT = 1 / 60
local GW, GH = 320, 180

local A = { mode = "closed", acc = 0, keys = {}, press = {}, mouseL = false, sinceDraw = 0 }
ns.App = A
local ui = {}
local stats = { sim = 0, draw = 0, cells = 0, frames = 0, steps = 0, t = 0, line = "" }

local now = _G.debugprofilestop or function() return (_G.GetTime and _G.GetTime() or os.clock()) * 1000 end
RT.perfNow = now
RT.now = function() return (_G.GetTime and _G.GetTime() or 0) * 1000 end
RT.print = function(...) _G.print("|cffd8b45cThe Endgame is Me:|r", ...) end

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
  b:SetScript("OnClick", function(self) if self.on and fn then ns.Sound.play("menuGo"); fn(self) end end)
  return b
end

local function panel(name, w, h)
  local p = _G.CreateFrame("Frame", nil, D.over)
  p:SetSize(w, h)
  p:SetPoint("CENTER", D.over, "CENTER", 0, 0)
  p:EnableMouse(true)
  local bg = D.solid(p, "BACKGROUND", 0.07, 0.055, 0.04, 0.96)
  bg:SetAllPoints(p)
  for _, side in ipairs({ "TOP", "BOTTOM" }) do
    local l = D.solid(p, "BORDER", 0.5, 0.4, 0.26, 1)
    l:SetPoint(side .. "LEFT", p, side .. "LEFT", 0, 0); l:SetPoint(side .. "RIGHT", p, side .. "RIGHT", 0, 0); l:SetHeight(0.5)
  end
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

local PANELS = { "menu", "pause", "over", "won", "store", "look", "loading", "error" }
local build = {}   -- name → function that makes that panel the first time it is wanted

function A.setMode(mode)
  A.mode = mode
  local shown = ({ menu = "menu", paused = "pause", over = "over", won = "won", store = "store", look = "look", loading = "loading", error = "error" })[mode]
  if shown and not ui[shown] then build[shown]() end
  for _, n in ipairs(PANELS) do if ui[n] then if n == shown then ui[n]:Show() else ui[n]:Hide() end end end
  if ui.dim then if shown and shown ~= "loading" and shown ~= "look" then ui.dim:Show() else ui.dim:Hide() end end
  local playing = mode == "play" or mode == "ending"
  A.keys, A.press, A.mouseL = {}, {}, false
  local view = D.view
  view:EnableKeyboard(playing)
  if playing and view.SetPropagateKeyboardInput and not (_G.InCombatLockdown and _G.InCombatLockdown()) then view:SetPropagateKeyboardInput(false) end
  if shown and ui[shown].refresh then ui[shown].refresh() end
  ns.Sound.setCombat(false)
end

local function fail(err)
  A.err = tostring(type(err) == "table" and err.message or err)
  RT.print("stopped on an error: " .. A.err)
  A.job = nil
  A.setMode("error")
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
  A.job = { co = coroutine.create(job), done = done }
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
  if A.mode ~= "play" and A.mode ~= "paused" and A.mode ~= "store" then return false end
  return Store.write(g, A.mode == "store" and "store" or "play")
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

local KEYMAP = { J = "slot0", K = "slot1", F = "slot1", Q = "slot2", E = "slot3", R = "slot4", SPACE = "shake" }
local MOVE = { W = true, A = true, S = true, D = true, UP = true, DOWN = true, LEFT = true, RIGHT = true }

local function onKeyDown(self, key)
  local used = true
  if A.mode == "ending" then
    if key == "ENTER" or key == "SPACE" or key == "ESCAPE" then endingDone() else used = false end
  elseif A.mode == "play" then
    if key == "ESCAPE" or key == "P" then A.pause()
    elseif key == "M" then ns.Sound.toggle()
    elseif KEYMAP[key] then A.press[KEYMAP[key]] = true; A.keys[key] = true
    elseif MOVE[key] then A.keys[key] = true
    else used = false end
  else used = false end
  -- keys the game has no use for (Enter for chat, the screenshot key) go on to WoW when that is allowed
  if self.SetPropagateKeyboardInput and not (_G.InCombatLockdown and _G.InCombatLockdown()) then self:SetPropagateKeyboardInput(not used) end
end
local function onKeyUp(self, key) A.keys[key] = nil end

local function onMouseDown(self, btn)
  if A.mode == "ending" then if A.ending and A.ending["end"].t > 1 then endingDone() end return end
  if A.mode ~= "play" then return end
  if btn == "LeftButton" then A.press.slot0 = true; A.mouseL = true end
  if btn == "RightButton" then A.press.slot1 = true end
end
local function onMouseUp(self, btn) if btn == "LeftButton" then A.mouseL = false end end

local function readInput(g, mx, my)
  local k = A.keys
  local press = {}
  for name in pairs(A.press) do press[name] = true end
  return {
    mx = mx + g.cam.x, my = my + g.cam.y,
    ax = ((k.D or k.RIGHT) and 1 or 0) - ((k.A or k.LEFT) and 1 or 0),
    ay = ((k.S or k.DOWN) and 1 or 0) - ((k.W or k.UP) and 1 or 0),
    press = press,
    hold = { slot0 = A.mouseL or k.J or false },
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
    stats.cells = stats.cells + D.present()
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
  if A.job then
    local job = A.job
    local ok, err = slice(job.co, 11)
    if not ok then fail(err) return end
    if coroutine.status(job.co) == "dead" then
      A.job = nil
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
    elseif D.info:GetText() ~= "" then D.info:SetText("") end
    stats.sim, stats.draw, stats.cells, stats.frames, stats.steps, stats.t = 0, 0, 0, 0, 0, 0
  end
end

-- ------------------------------------------------------------------------------------------------ panels

build.loading = function()
  local p = panel("loading", 150, 26)
  local t = line(p, 6, "CENTER", 0, 3, 0.93, 0.89, 0.78)
  local s = line(p, 4.5, "CENTER", 0, -6, 0.6, 0.56, 0.48)
  s:SetText("painting pixels...")
  p.refresh = function() t:SetText(A.loadLabel or "LOADING") end
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
  local p = panel("menu", 190, 150)
  line(p, 12, "TOP", 0, -10, 0.86, 0.72, 0.36):SetText("THE ENDGAME IS ME")
  line(p, 4.5, "TOP", 0, -27, 0.62, 0.58, 0.5):SetText("You are the boss. They are the content.")
  local y = -40
  local function add(text, fn) local b = button(p, text, 110, 13, fn); b:SetPoint("TOP", p, "TOP", 0, y); y = y - 16; return b end
  local cont = add("Continue", function() A.continue() end)
  add("New game", function() A.newRun() end)
  local plus = add("New Game +", function() A.newRun(Store.plus()) end)
  add("Appearance", function() A.setMode("look") end)
  local snd = add("Sound", function() ns.Sound.toggle(); ui.menu.refresh() end)
  local best = line(p, 4.5, "BOTTOM", 0, 18, 0.86, 0.72, 0.36)
  local help = line(p, 4, "BOTTOM", 0, 5, 0.55, 0.52, 0.46)
  help:SetText("WASD walk  -  mouse aims  -  LMB RMB Q E R abilities  -  Space shakes  -  Esc pauses")
  help:SetWidth(182)
  p.refresh = function()
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
  local p = panel("pause", 130, 92)
  line(p, 8, "TOP", 0, -8, 0.93, 0.89, 0.78):SetText("ON BREAK")
  line(p, 4, "TOP", 0, -20, 0.6, 0.56, 0.48):SetText("The keyboard is WoW's again until you resume.")
  button(p, "Resume", 100, 13, function() A.resume() end):SetPoint("TOP", p, "TOP", 0, -30)
  button(p, "Save and quit", 100, 13, function() A.saveNow(); A.goMenu() end):SetPoint("TOP", p, "TOP", 0, -46)
  local snd = button(p, "Sound", 100, 13, function() ns.Sound.toggle(); ui.pause.refresh() end)
  snd:SetPoint("TOP", p, "TOP", 0, -62)
  p.refresh = function() snd.label:SetText(ns.DB.mute and "Sound: off" or "Sound: on") end
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
  for i = 0, AB.length - 1 do
    local a = AB[i]
    local b = button(p, "", 142, 10.5, function() A.storeSel = a.id; ui.store.refresh() end)
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
    if ok then ns.Sound.play("buy"); ui.store.refresh() end
  end)
  mutate:SetPoint("TOPLEFT", p, "TOPLEFT", 158, -86)
  line(p, 4.5, "TOPLEFT", 158, -106, 0.62, 0.58, 0.5):SetText("Slots: click one to change what is on that button.")
  local slots = {}
  for i = 0, 4 do
    local b = button(p, "", 138, 9, function()
      -- step to the next thing you own; one already on another button swaps with this one
      local g = A.g
      local own = { false }
      for k = 0, AB.length - 1 do if not AB[k].passive and RT.has(g.owned, AB[k].id) then own[#own + 1] = AB[k].id end end
      local at = 1
      for k = 1, #own do if own[k] == (g.slots[i] or false) then at = k end end
      World.setSlot(g, i, own[at % #own + 1] or nil)
      ui.store.refresh()
    end)
    b:SetPoint("TOPLEFT", p, "TOPLEFT", 158, -113 - i * 9.5)
    b.label:SetFont(D.FONT, 4.5, "")
    slots[i] = b
  end
  local go = button(p, "Onward", 142, 14, function() A.closeStore() end)
  go:SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", 8, 6)
  p.refresh = function()
    local g = A.g
    pts:SetText(RT.commas(g.points) .. " points")
    go.label:SetText("Onward to level " .. (g.map.n + 1))
    local names = {}
    for i = 0, AB.length - 1 do
      local a = AB[i]
      names[a.id] = a.name
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
      or o.owned and (where >= 0 and ("on " .. World.SLOT_KEYS[where]) or "owned, not on a button") or "not owned")
    desc:SetText((a.id == "summon" and o.owned and o.lvl > 0) and a.ups[o.lvl - 1] or a.desc)
    what:SetText(cost == nil and "Nothing left to grow." or ("Mutate: " .. tostring(text)))
    mutate.label:SetText(cost == nil and "Fully mutated" or ("Mutate   " .. RT.commas(cost)))
    mutate:able(cost ~= nil and g.points >= cost)
    for i = 0, 4 do slots[i].label:SetText(World.SLOT_KEYS[i] .. ":  " .. (g.slots[i] and names[g.slots[i]] or "(empty)")) end
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

function A.open()
  local f = D.create()
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
  if not D.built then
    A.load("SETTING UP THE SCREEN", function()
      D.build()
      A.R = Render.createRenderer()
      Render.setCalm(false)   -- the window does the shaking (see display.lua), so the renderer's own switch stays on
    end, function() A.setMode("menu") end)
  elseif A.mode == "closed" then
    A.setMode(A.wasMode == "paused" and "paused" or A.wasMode == "store" and "store" or "menu")
  end
end

function A.close()
  if not D.frame then return end
  if A.mode == "play" then A.setMode("paused") end
  A.saveNow()
  A.wasMode = A.mode
  A.mode = "closed"
  D.view:EnableKeyboard(false)
  ns.Sound.setStage(0)
  D.frame:Hide()
end

function A.toggle()
  if D.frame and D.frame:IsShown() then A.close() else A.open() end
end

-- ------------------------------------------------------------------------------------------------ events and the slash command

local ev = _G.CreateFrame("Frame")
ev:RegisterEvent("ADDON_LOADED")
ev:RegisterEvent("PLAYER_LOGOUT")
ev:RegisterEvent("PLAYER_REGEN_DISABLED")
ev:RegisterEvent("UI_SCALE_CHANGED")
ev:RegisterEvent("DISPLAY_SIZE_CHANGED")
ev:SetScript("OnEvent", function(self, event, arg1)
  if event == "ADDON_LOADED" then
    if arg1 == ADDON then Store.init(); ns.Sound.init() end
  elseif event == "PLAYER_LOGOUT" then
    A.saveNow()
  elseif event == "UI_SCALE_CHANGED" or event == "DISPLAY_SIZE_CHANGED" then
    if D.frame then D.applyScale() end   -- keep one game pixel on a whole number of screen pixels
  elseif event == "PLAYER_REGEN_DISABLED" then
    -- a real fight has started: hand the keyboard back at once
    if A.mode == "play" then
      A.setMode("paused")
      RT.print("paused, because you are in combat.")
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
  elseif cmd == "help" or cmd == "?" then
    RT.print("/endgame opens and closes the game.  /endgame scale <1-8 or auto>,  fps <10-240>,  perf,  calm,  mute,  reset")
  else
    A.toggle()
  end
end
-- retail's addon compartment (the dropdown by the minimap) calls this by name
_G.TheEndgameIsMe_OnCompartmentClick = function() A.toggle() end
