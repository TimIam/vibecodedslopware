-- Mock-ups of the addon's panels, without the client. Loads a built folder against the stub, opens the panels, and
-- writes down what the stub recorded of each (frames, textures, text, anchors) for panels.mjs to draw. The font and
-- its widths are a browser's, not the client's: good for catching an overlap or a line that runs off its box, not
-- for judging how it looks.
--   lua5.1 tools/test/panels.lua [addon folder] [out.json]     then: node tools/test/panels.mjs
local dir = arg[1] or "TheEndgameIsMe"
local out = arg[2] or "build/panels.json"
local Stub = dofile("tools/test/wowstub.lua")

local ADDON = "TheEndgameIsMe"
local ns = {}
local toc = assert(io.open(dir .. "/" .. ADDON .. ".toc")):read("*a")
for line in toc:gmatch("[^\r\n]+") do
  if line:sub(1, 2) ~= "##" and line:match("%.lua$") then assert(loadfile(dir .. "/" .. line))(ADDON, ns) end
end
Stub.event("ADDON_LOADED", ADDON)
local RT, A, D = ns.RT, ns.App, ns.Display

-- ------------------------------------------------------------------------------------------------ geometry

-- where a region is, in its root's units, y down from the root's top left: left, top, width, height (width and
-- height nil for text that was given none)
local root
local rect
local function anchorAt(o, p)
  local l, t, w, h = rect(p.rel or o.parent)
  local rp = p.relPoint
  local x = rp:find("LEFT") and l or rp:find("RIGHT") and l + w or l + w / 2
  local y = rp:find("TOP") and t or rp:find("BOTTOM") and t + h or t + h / 2
  return x + p.x, y - p.y
end
rect = function(o)
  if o == root then return 0, 0, o.w, o.h end
  if o.points.ALL then return rect(o.points.ALL.rel or o.parent) end
  local w, h = o.w, o.h
  local left, right, cx, top, bottom, cy
  for name, p in pairs(o.points) do
    local x, y = anchorAt(o, p)
    if name:find("LEFT") then left = x elseif name:find("RIGHT") then right = x else cx = x end
    if name:find("TOP") then top = y elseif name:find("BOTTOM") then bottom = y else cy = y end
  end
  if left and right then w = right - left end
  if top and bottom then h = bottom - top end
  if not left then left = right and w and right - w or cx and w and cx - w / 2 or right or cx or 0 end
  if not top then top = bottom and h and bottom - h or cy and h and cy - h / 2 or bottom or cy or 0 end
  return left, top, w, h
end

local LAYER = { BACKGROUND = 1, BORDER = 2, ARTWORK = 3, OVERLAY = 4 }
local skip = {}
local items

local function walk(f)
  if not f.shown then return end
  if skip[f] then return end
  local tex, txt = {}, {}
  for i, r in ipairs(f.regions) do
    if r.shown then
      if r.kind == "Texture" then tex[#tex + 1] = { r = r, k = (LAYER[r.layer] or 1) * 1000 + i } else txt[#txt + 1] = r end
    end
  end
  table.sort(tex, function(a, b) return a.k < b.k end)
  for _, e in ipairs(tex) do
    local r = e.r
    local l, t, w, h = rect(r)
    if r.color and w and h then items[#items + 1] = { t = "rect", x = l, y = t, w = w, h = h, c = r.color } end
  end
  if f == D.view then
    -- the 57,600 squares are not walked; the frame the game drew goes here in their place
    local l, t, w, h = rect(f)
    items[#items + 1] = { t = "picture", x = l, y = t, w = w, h = h }
  end
  for _, r in ipairs(txt) do
    if r.text and r.text ~= "" then
      -- text is placed by its one anchor; the browser works out how big it is
      local name, p = next(r.points)
      if name and name ~= "ALL" then
        local x, y = anchorAt(r, p)
        items[#items + 1] = { t = "text", x = x, y = y, anchor = name, w = r.w, size = r.font or 5, c = r.rgb or { 1, 1, 1 }, s = r.text, justify = r.justify }
      end
    end
  end
  if f.kind == "EditBox" then
    local l, t, w, h = rect(f)
    items[#items + 1] = { t = "text", x = l, y = t + h / 2, anchor = "LEFT", size = f.font or 5, c = f.rgb or { 1, 1, 1 }, s = f.text or "" }
  end
  local kids = {}
  for i, c in ipairs(f.children) do kids[#kids + 1] = { f = c, k = (c.level or 0) * 1000 + i } end
  table.sort(kids, function(a, b) return a.k < b.k end)
  for _, e in ipairs(kids) do walk(e.f) end
end

-- ------------------------------------------------------------------------------------------------ writing it down

local function json(v, buf)
  local tv = type(v)
  if tv == "table" then
    if #v > 0 or next(v) == nil then
      buf[#buf + 1] = "["
      for i, x in ipairs(v) do if i > 1 then buf[#buf + 1] = "," end; json(x, buf) end
      buf[#buf + 1] = "]"
    else
      buf[#buf + 1] = "{"
      local first = true
      for k, x in pairs(v) do
        if not first then buf[#buf + 1] = "," end
        first = false
        buf[#buf + 1] = string.format("%q:", k)
        json(x, buf)
      end
      buf[#buf + 1] = "}"
    end
  elseif tv == "number" then buf[#buf + 1] = string.format("%.5g", v)
  elseif tv == "string" then buf[#buf + 1] = '"' .. v:gsub('[%c"\\]', function(ch) return string.format("\\u%04x", ch:byte()) end) .. '"'
  else buf[#buf + 1] = tostring(v) end
end

local shots = {}
local function shoot(name, r, w, h, note)
  root = r
  if w then r.w, r.h = w, h end
  items = {}
  walk(r)
  local px = {}
  if r == D.frame then
    local snap = RT.Screen.snapshot()
    for i = 1, 320 * 180 do px[i] = string.format("%06x", snap[i]) end
  end
  shots[#shots + 1] = { name = name, note = note or "", w = r.w, h = r.h, items = items, picture = table.concat(px) }
  Stub.print("drew " .. name .. ": " .. #items .. " things")
end

-- ------------------------------------------------------------------------------------------------ the tour

local function frames(n) for _ = 1, n do Stub.tick(1 / 60) end end
local function settle() local n = 0; while A.mode == "loading" do frames(1); n = n + 1; assert(n < 20000, "loading never finished") end assert(A.mode ~= "error", tostring(A.err)) end

SlashCmdList["THEENDGAMEISME"]("")
settle()
Stub.click("Yes, all of it")
for _, strip in ipairs(D.strips) do skip[strip] = true end
if D.clipAll then skip[D.clipAll] = true end
local f = TheEndgameIsMeFrame
shoot("menu", f, nil, nil, "the menu, with Controls on it")
Stub.click("New game")
settle()
local view = D.view
local scale = view:GetEffectiveScale()
Stub.cursor = { (view:GetLeft() + 250) * scale, (view:GetTop() - 90) * scale }
Stub.key(view, "D", true)
view.scripts.OnMouseDown(view, "LeftButton")
frames(240)
Stub.key(view, "D", false)
view.scripts.OnMouseUp(view, "LeftButton")
shoot("play", f, nil, nil, "a run, default keys under the ability buttons")
Stub.key(view, "ESCAPE", true)
shoot("pause", f, nil, nil, "the pause menu")
Stub.click("Controls")
shoot("controls", f, nil, nil, "the Controls panel, default keys")
Stub.exact("W")
shoot("listening", f, nil, nil, "after clicking a key: the box that takes the next key or mouse button")
local cap = A.ui.keys.cap
Stub.key(cap, "NUMPAD8", true)
Stub.exact("Left click"); Stub.key(cap, "NUMPAD1", true)
Stub.exact("Right click"); cap.scripts.OnMouseDown(cap, "MiddleButton")
Stub.exact("Space"); cap.scripts.OnMouseDown(cap, "Button4")
Stub.exact("Up arrow"); Stub.key(cap, "E", true)
shoot("changed", f, nil, nil, "the panel after a few changes; E was taken from Ability 4")
Stub.click("Done")
Stub.click("Resume")
frames(90)
shoot("play_changed", f, nil, nil, "the run again: the HUD names the new keys")
Stub.key(view, "ESCAPE", true)
shoot("options", Stub.showPage(true), 640, 470, "the page under Options > AddOns")

local buf = {}
json(shots, buf)
local file = assert(io.open(out, "w"))
file:write(table.concat(buf))
file:close()
Stub.print("wrote " .. out)
