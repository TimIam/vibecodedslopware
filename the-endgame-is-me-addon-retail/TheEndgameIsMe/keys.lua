-- The Endgame is Me: which key or mouse button does what. The defaults are the browser game's; the Controls panel
-- (app.lua) changes them, and what the player chose is kept in TheEndgameIsMeDB.keys.
--
-- A binding is the name the client gives a key in OnKeyDown ("W", "SPACE", "NUMPAD4", "LSHIFT"), or BUTTON1 to
-- BUTTON5 for a mouse button. Each action has two places for one, and a key can only be in one place at a time.
-- Esc is not on the list: it always pauses, so whatever the bindings say there is a way to get the keyboard back.

local ADDON, ns = ...
local RT = ns.RT

local K = {}
ns.Keys = K

-- in the order the Controls panel lists them
K.ACTIONS = {
  { id = "up", name = "Walk up" }, { id = "down", name = "Walk down" }, { id = "left", name = "Walk left" }, { id = "right", name = "Walk right" },
  { id = "slot0", name = "Ability 1" }, { id = "slot1", name = "Ability 2" }, { id = "slot2", name = "Ability 3" }, { id = "slot3", name = "Ability 4" },
  { id = "slot4", name = "Ability 5" }, { id = "shake", name = "Shake your fur" }, { id = "pause", name = "Pause" }, { id = "mute", name = "Sound on or off" },
}
local DEFAULTS = {
  up = { "W", "UP" }, down = { "S", "DOWN" }, left = { "A", "LEFT" }, right = { "D", "RIGHT" },
  slot0 = { "BUTTON1", "J" }, slot1 = { "BUTTON2", "K" }, slot2 = { "Q" }, slot3 = { "E" }, slot4 = { "R" },
  shake = { "SPACE" }, pause = { "P" }, mute = { "M" },
}
-- what OnMouseDown calls the buttons → what a binding calls them
K.MOUSE = { LeftButton = "BUTTON1", RightButton = "BUTTON2", MiddleButton = "BUTTON3", Button4 = "BUTTON4", Button5 = "BUTTON5" }

local cur = {}     -- action id → { key or false, key or false }
local byKey = {}   -- key → action id
local hud = {}     -- what the game's HUD writes under its buttons (see keyLabel below)

local function valid(key) return type(key) == "string" and key ~= "" and #key <= 24 and key ~= "ESCAPE" and key ~= "UNKNOWN" end
function K.bindable(key) return valid(key) end

-- ------------------------------------------------------------------------------------------------ names

local NAMES = {
  BUTTON1 = "Left click", BUTTON2 = "Right click", BUTTON3 = "Middle click", BUTTON4 = "Mouse button 4", BUTTON5 = "Mouse button 5",
  SPACE = "Space", ENTER = "Enter", TAB = "Tab", BACKSPACE = "Backspace", DELETE = "Delete", INSERT = "Insert", HOME = "Home", END = "End",
  PAGEUP = "Page Up", PAGEDOWN = "Page Down", UP = "Up arrow", DOWN = "Down arrow", LEFT = "Left arrow", RIGHT = "Right arrow",
  CAPSLOCK = "Caps Lock", NUMLOCK = "Num Lock", SCROLLLOCK = "Scroll Lock", PRINTSCREEN = "Print Screen", PAUSE = "Pause key",
  LSHIFT = "Left Shift", RSHIFT = "Right Shift", LCTRL = "Left Ctrl", RCTRL = "Right Ctrl", LALT = "Left Alt", RALT = "Right Alt",
  LMETA = "Left Cmd", RMETA = "Right Cmd",
  NUMPADPLUS = "Num +", NUMPADMINUS = "Num -", NUMPADMULTIPLY = "Num *", NUMPADDIVIDE = "Num /", NUMPADDECIMAL = "Num .", NUMPADEQUALS = "Num =",
}
-- Three letters at most: the HUD has 17 pixels a button and a letter is four wide. The pixel font has capitals,
-- digits and a little punctuation, so the keys it has no letter for are spelled.
local SHORT = {
  BUTTON1 = "LMB", BUTTON2 = "RMB", BUTTON3 = "MMB", BUTTON4 = "M4", BUTTON5 = "M5",
  SPACE = "SPC", ENTER = "ENT", TAB = "TAB", BACKSPACE = "BKS", DELETE = "DEL", INSERT = "INS", HOME = "HOM", END = "END",
  PAGEUP = "PGU", PAGEDOWN = "PGD", UP = "UP", DOWN = "DN", LEFT = "LT", RIGHT = "RT",
  CAPSLOCK = "CAP", NUMLOCK = "NUM", SCROLLLOCK = "SCR", PRINTSCREEN = "PRT", PAUSE = "PAU",
  LSHIFT = "LSH", RSHIFT = "RSH", LCTRL = "LCT", RCTRL = "RCT", LALT = "LAL", RALT = "RAL", LMETA = "LCM", RMETA = "RCM",
  NUMPADPLUS = "N+", NUMPADMINUS = "N-", NUMPADMULTIPLY = "N*", NUMPADDIVIDE = "N/", NUMPADDECIMAL = "N.", NUMPADEQUALS = "N=",
  [";"] = "SEM", ["`"] = "TIL", ["\\"] = "BSL",
}

-- for the panels, in the client's own font
function K.name(key)
  if not key then return "-" end
  if NAMES[key] then return NAMES[key] end
  local n = key:match("^NUMPAD(%d)$")
  if n then return "Num " .. n end
  return key
end
-- for the HUD
function K.short(key)
  if not key then return "-" end
  if SHORT[key] then return SHORT[key] end
  local n = key:match("^NUMPAD(%d)$")
  if n then return "N" .. n end
  if key:find("[^%w%p]") then return "KEY" end   -- a letter from another alphabet: the pixel font cannot write it
  return key:sub(1, 3)
end

-- ------------------------------------------------------------------------------------------------ the table

local function relabel()
  for i = 0, 4 do hud[i] = K.short(K.first("slot" .. i)) end
  local shake = K.first("shake")
  hud[5] = K.short(shake)
  local long = shake and K.name(shake):upper() or "NO KEY"
  hud[6] = long:find("^[A-Z0-9 %+%-%*/%.,]+$") and long or K.short(shake)
end

-- saved is what the player set, or nil. Their choices go in first, so a default never takes a key they gave to
-- something else; an action they never touched (one a later version added, say) gets its defaults.
function K.load(saved)
  cur, byKey = {}, {}
  if type(saved) == "table" then
    for _, a in ipairs(K.ACTIONS) do
      local s = saved[a.id]
      if type(s) == "table" then
        local t = { false, false }
        for slot = 1, 2 do
          local key = s[slot]
          if valid(key) and not byKey[key] then t[slot] = key; byKey[key] = a.id end
        end
        cur[a.id] = t
      end
    end
  end
  for _, a in ipairs(K.ACTIONS) do
    if not cur[a.id] then
      local t = { false, false }
      for slot = 1, 2 do
        local key = DEFAULTS[a.id][slot]
        if key and not byKey[key] then t[slot] = key; byKey[key] = a.id end
      end
      cur[a.id] = t
    end
  end
  relabel()
end
function K.init() K.load(ns.DB and ns.DB.keys) end

local function keep()
  relabel()
  if not ns.DB then return end
  local out = {}
  for id, t in pairs(cur) do out[id] = { t[1], t[2] } end
  ns.DB.keys = out
end

function K.action(key) return byKey[key] end
function K.get(id, slot) local t = cur[id]; return t and t[slot] or nil end
function K.first(id) local t = cur[id]; return t and (t[1] or t[2]) or nil end
-- is anything bound to this action down? (down: the set of keys and buttons being held)
function K.held(down, id)
  local t = cur[id]
  return ((t[1] and down[t[1]]) or (t[2] and down[t[2]])) and true or false
end

-- Puts key in one of an action's two places. Whatever had the key gives it up; the second result is that action's
-- id when it was a different one.
function K.set(id, slot, key)
  local t = cur[id]
  if not t or (slot ~= 1 and slot ~= 2) or not valid(key) then return false end
  local from = byKey[key]
  if from then
    local ft = cur[from]
    for s = 1, 2 do if ft[s] == key then ft[s] = false end end
  end
  if t[slot] then byKey[t[slot]] = nil end
  t[slot] = key
  byKey[key] = id
  keep()
  return true, from ~= id and from or nil
end
function K.clear(id, slot)
  local t = cur[id]
  if not t or not t[slot] then return false end
  byKey[t[slot]] = nil
  t[slot] = false
  keep()
  return true
end
function K.reset()
  if ns.DB then ns.DB.keys = nil end
  K.load(nil)
end

-- ------------------------------------------------------------------------------------------------ in words

function K.actionName(id)
  for _, a in ipairs(K.ACTIONS) do if a.id == id then return a.name end end
  return id
end
-- "W, Up arrow"
function K.describe(id)
  local t, out = cur[id], {}
  for slot = 1, 2 do if t[slot] then out[#out + 1] = K.name(t[slot]) end end
  return #out > 0 and table.concat(out, ", ") or "not set"
end
-- the line of help under the menu
function K.summary()
  local function row(ids)
    local out = {}
    for i, id in ipairs(ids) do out[i] = K.short(K.first(id)) end
    return table.concat(out, " ")
  end
  local shake = K.first("shake")
  return row({ "up", "left", "down", "right" }) .. " walk  -  mouse aims  -  " .. row({ "slot0", "slot1", "slot2", "slot3", "slot4" })
    .. " abilities  -  " .. (shake and K.name(shake) or "nothing") .. " shakes  -  Esc pauses"
end

-- The game's own HUD asks for these (render.js is patched to, in tools/build.mjs): 0 to 4 are the letters under the
-- five ability buttons, 5 the shake button, 6 the key named in the "shake him off" prompt.
RT.host.keyLabel = function(i) return hud[i] or "" end

K.load(nil)
