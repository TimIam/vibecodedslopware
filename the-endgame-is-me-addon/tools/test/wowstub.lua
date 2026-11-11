-- A stand-in for the parts of the WoW client API the addon touches, for running it under stock Lua 5.1.
-- It is strict on purpose: a method the addon calls that is not listed here is an error, so a typo in an API name
-- fails the smoke test instead of failing in the game. It does no drawing; it records enough (anchors, colours,
-- shown/hidden, scripts) for the test to check what the addon did.

local Stub = { frames = {}, sounds = {}, timers = {}, printed = {}, clock = 0, cursor = { 0, 0 }, combat = false }
local W, H = 2560, 1440          -- the pretend monitor
local UISCALE = 0.64

local function noop() end
local Region = {}
function Region:SetPoint(point, rel, relPoint, x, y)
  if type(rel) == "number" then x, y, rel, relPoint = rel, relPoint, nil, nil end
  assert(type(point) == "string", "SetPoint: point")
  self.points[point] = { rel = rel, relPoint = relPoint or point, x = x or 0, y = y or 0 }
end
function Region:ClearAllPoints() self.points = {} end
function Region:SetAllPoints(rel) self.points = { ALL = { rel = rel } } end
function Region:SetSize(w, h) assert(type(w) == "number" and type(h) == "number", "SetSize"); self.w, self.h = w, h end
function Region:SetWidth(w) self.w = w end
function Region:SetHeight(h) self.h = h end
function Region:Show() self.shown = true end
function Region:Hide() self.shown = false end
function Region:IsShown() return self.shown end
function Region:IsVisible() local f = self; while f do if not f.shown then return false end; f = f.parent end return true end

local Texture = setmetatable({}, { __index = Region })
function Texture:SetColorTexture(r, g, b, a) assert(type(r) == "number" and type(g) == "number" and type(b) == "number", "SetColorTexture"); self.color = { r, g, b, a or 1 } end
function Texture:SetVertexColor(r, g, b, a) assert(r >= 0 and r <= 1 and g >= 0 and g <= 1 and b >= 0 and b <= 1, "SetVertexColor range"); assert(a == nil or (a >= 0 and a <= 1), "SetVertexColor alpha"); self.vr, self.vg, self.vb, self.va = r, g, b, a or 1; Stub.colourCalls = (Stub.colourCalls or 0) + 1 end
Texture.SetSnapToPixelGrid, Texture.SetTexelSnappingBias = noop, noop
function Texture:SetTexture(file, wrapH, wrapV, filter)
  assert(type(file) == "string" and file:find("^Interface\\AddOns\\", 1), "SetTexture wants a path under Interface/AddOns")
  assert((wrapH == nil or wrapH == "CLAMP" or wrapH == "REPEAT") and (wrapV == nil or wrapV == "CLAMP" or wrapV == "REPEAT"), "SetTexture wrap mode")
  assert(filter == nil or filter == "NEAREST" or filter == "LINEAR" or filter == "TRILINEAR", "SetTexture filter mode")
  self.file, self.filter = file, filter
end
function Texture:SetDrawLayer(layer, sub)
  assert(layer == "BACKGROUND" or layer == "BORDER" or layer == "ARTWORK" or layer == "OVERLAY", "SetDrawLayer: " .. tostring(layer))
  assert(sub == nil or (sub >= -8 and sub <= 7 and sub == math.floor(sub)), "SetDrawLayer sublevel")
  self.layer, self.sub = layer, sub or 0
end
function Texture:SetTexCoord(l, r, t, b) assert(l >= 0 and r <= 1 and t >= 0 and b <= 1 and l < r and t < b, "SetTexCoord"); self.coord = { l, r, t, b } end

local FontString = setmetatable({}, { __index = Region })
function FontString:SetFont(path, size, flags) assert(type(path) == "string" and type(size) == "number" and size > 0, "SetFont"); self.font = size; return true end
function FontString:SetText(s) assert(s == nil or type(s) == "string" or type(s) == "number", "SetText wants a string"); self.text = s == nil and "" or tostring(s) end
function FontString:GetText() return self.text or "" end
function FontString:SetTextColor(r, g, b) assert(type(r) == "number" and type(g) == "number" and type(b) == "number", "SetTextColor"); self.rgb = { r, g, b } end
function FontString:SetJustifyH(j) assert(j == "LEFT" or j == "CENTER" or j == "RIGHT", "SetJustifyH"); self.justify = j end
FontString.SetShadowColor, FontString.SetShadowOffset = noop, noop

local Frame = setmetatable({}, { __index = Region })
function Frame:CreateTexture(name, layer) local t = setmetatable({ kind = "Texture", points = {}, shown = true, parent = self, layer = layer }, { __index = Texture }); self.regions[#self.regions + 1] = t; Stub.textures = (Stub.textures or 0) + 1; return t end
function Frame:CreateFontString(name, layer) local t = setmetatable({ kind = "FontString", points = {}, shown = true, parent = self }, { __index = FontString }); self.regions[#self.regions + 1] = t; return t end
function Frame:SetScript(what, fn) assert(fn == nil or type(fn) == "function", "SetScript"); self.scripts[what] = fn end
function Frame:GetScript(what) return self.scripts[what] end
function Frame:RegisterEvent(e) self.events[e] = true end
function Frame:EnableMouse(on) self.mouse = on and true or false end
function Frame:EnableKeyboard(on) self.keyboard = on and true or false end
function Frame:SetPropagateKeyboardInput(on) assert(not Stub.combat, "SetPropagateKeyboardInput in combat"); self.propagate = on and true or false end
function Frame:SetMovable(on) self.movable = on end
function Frame:SetScale(s) assert(type(s) == "number" and s > 0, "SetScale"); self.scale = s end
function Frame:GetScale() return self.scale end
function Frame:GetEffectiveScale() return self.scale * (self.parent and self.parent:GetEffectiveScale() or 1) end
function Frame:SetFrameLevel(n) self.level = n end
function Frame:GetFrameLevel() return self.level or 1 end
function Frame:StartMoving() self.moving = true end
function Frame:StopMovingOrSizing() self.moving = false end
Frame.SetFrameStrata, Frame.SetClampedToScreen, Frame.RegisterForDrag = noop, noop, noop
function Frame:SetClipsChildren(on) self.clips = on and true or false end
function Frame:SetIsFrameBuffer(on) self.buffer = on and true or false end
function Frame:SetFlattensRenderLayers(on) self.flat = on and true or false end
function Frame:SetParent(p)
  if self.parent then for i, c in ipairs(self.parent.children) do if c == self then table.remove(self.parent.children, i); break end end end
  self.parent = p
  if p then p.children[#p.children + 1] = self end
end
function Frame:GetWidth() return self.w or 0 end
function Frame:GetHeight() return self.h or 0 end
function Frame:GetFrameStrata() return "HIGH" end
function Frame:GetAlpha() return 1 end
-- only a frame anchored by its bottom left to UIParent, or centred, needs working out here
function Frame:GetLeft()
  if next(self.points) == nil then return nil end   -- not placed yet: the client says nil too
  local p = self.points.BOTTOMLEFT
  if p then return p.x end
  if self.points.CENTER then return (W / self:GetEffectiveScale() - (self.w or 0)) / 2 end
  local tl = self.points.TOPLEFT
  if tl and tl.rel then return tl.rel:GetLeft() + tl.x end
  return 0
end
function Frame:GetBottom()
  if next(self.points) == nil then return nil end
  local p = self.points.BOTTOMLEFT
  if p then return p.y end
  if self.points.CENTER then return (H / self:GetEffectiveScale() - (self.h or 0)) / 2 + (self.points.CENTER.y or 0) end
  return self:GetTop() - (self.h or 0)
end
function Frame:GetTop()
  local tl = self.points.TOPLEFT
  if tl and tl.rel then return tl.rel:GetTop() + tl.y end
  return self:GetBottom() + (self.h or 0)
end

local EditBox = setmetatable({}, { __index = Frame })
EditBox.SetFont, EditBox.SetTextColor, EditBox.SetAutoFocus, EditBox.SetMaxLetters, EditBox.ClearFocus = FontString.SetFont, FontString.SetTextColor, noop, noop, noop
function EditBox:SetText(s) assert(type(s) == "string", "EditBox:SetText"); self.text = s end
function EditBox:GetText() return self.text or "" end

local KINDS = { Frame = Frame, Button = Frame, EditBox = EditBox }
function CreateFrame(kind, name, parent, template)
  local class = assert(KINDS[kind], "CreateFrame: unknown frame type " .. tostring(kind))
  assert(template == nil, "the addon should not need XML templates")
  local f = setmetatable({ kind = kind, name = name, parent = parent, points = {}, regions = {}, children = {}, scripts = {}, events = {}, shown = true, scale = 1 }, { __index = class })
  if parent then parent.children[#parent.children + 1] = f end
  Stub.frames[#Stub.frames + 1] = f
  if name then _G[name] = f end
  return f
end

UIParent = CreateFrame("Frame", "UIParent")
UIParent.scale, UIParent.w, UIParent.h = UISCALE, W / UISCALE, H / UISCALE
UIParent.points = { BOTTOMLEFT = { x = 0, y = 0 } }
STANDARD_TEXT_FONT = "Fonts\\FRIZQT__.TTF"
bit = dofile("tools/test/bit.lua")
SlashCmdList = {}
function GetPhysicalScreenSize() return W, H end
function GetCursorPosition() return Stub.cursor[1], Stub.cursor[2] end
function GetTime() return Stub.clock end
local t0 = os.clock()
function debugprofilestop() return (os.clock() - t0) * 1000 end
function GetBuildInfo() return "1.60.1", "99999", "Nov 1 2026", 16001 end
function debugstack() return "stub stack" end
function InCombatLockdown() return Stub.combat end
function PlaySoundFile(path, channel) assert(type(path) == "string"); Stub.sounds[#Stub.sounds + 1] = path; return true, #Stub.sounds end
function StopSound(handle, fade) end
C_Timer = { After = function(sec, fn) Stub.timers[#Stub.timers + 1] = { at = Stub.clock + sec, fn = fn } end }
-- Options > AddOns: the page is kept, hidden, until the test "opens" it (Stub.showPage)
Settings = {
  RegisterCanvasLayoutCategory = function(frame, name) assert(type(name) == "string", "category name"); frame.shown = false; return { frame = frame, name = name } end,
  RegisterAddOnCategory = function(cat) Stub.category = cat end,
}
local realPrint = print
function print(...) local t = {}; for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end; Stub.printed[#Stub.printed + 1] = table.concat(t, " "); if Stub.echo then realPrint(...) end end
Stub.print = realPrint

-- ------------------------------------------------------------------------------------------------ driving it

function Stub.event(name, ...)
  for _, f in ipairs(Stub.frames) do if f.events[name] and f.scripts.OnEvent then f.scripts.OnEvent(f, name, ...) end end
end
local function visible(f) while f do if not f.shown then return false end; f = f.parent end return true end
Stub.visible = visible
-- one rendered frame: timers, then every visible frame's OnUpdate
function Stub.tick(dt)
  Stub.clock = Stub.clock + dt
  for i = #Stub.timers, 1, -1 do local t = Stub.timers[i]; if t.at <= Stub.clock then table.remove(Stub.timers, i); t.fn() end end
  for _, f in ipairs(Stub.frames) do if f.scripts.OnUpdate and visible(f) then f.scripts.OnUpdate(f, dt) end end
end
-- the visible button whose label holds this text
function Stub.button(text)
  for _, f in ipairs(Stub.frames) do
    if f.kind == "Button" and visible(f) and f.label and f.label.text and f.label.text:find(text, 1, true) then return f end
  end
end
function Stub.click(text)
  local b = Stub.button(text)
  if not b then error("no visible button labelled " .. text, 2) end
  b.scripts.OnClick(b, "LeftButton")
end
-- the same, looking only at the buttons inside one frame: a list drawn over a panel that has a button of the same
-- name (the stub knows nothing of what covers what, so the test has to say which one the player could reach)
local function inside(f, root) while f do if f == root then return true end; f = f.parent end return false end
function Stub.buttonIn(root, text)
  for _, f in ipairs(Stub.frames) do
    if f.kind == "Button" and visible(f) and inside(f, root) and f.label and f.label.text and f.label.text:find(text, 1, true) then return f end
  end
end
function Stub.clickIn(root, text)
  local b = Stub.buttonIn(root, text)
  if not b then error("no visible button labelled " .. text .. " in that frame", 2) end
  b.scripts.OnClick(b, "LeftButton")
end
-- the first visible button whose label is exactly this (the Controls panel's keys: "W" is also in "New game")
function Stub.exact(text)
  for _, f in ipairs(Stub.frames) do
    if f.kind == "Button" and visible(f) and f.label and f.label.text == text then f.scripts.OnClick(f, "LeftButton"); return f end
  end
  error("no visible button labelled exactly " .. text, 2)
end
-- the addon's page in the client's options, opened or closed
function Stub.showPage(on)
  local page = assert(Stub.category, "the addon registered no options page").frame
  page.shown = on and true or false
  if on and page.scripts.OnShow then page.scripts.OnShow(page) end
  return page
end
function Stub.key(frame, key, down) local s = frame.scripts[down and "OnKeyDown" or "OnKeyUp"]; assert(frame.keyboard, "the frame is not taking keys"); s(frame, key) end
-- every piece of text on visible things, for looking at a panel
function Stub.texts()
  local out = {}
  for _, f in ipairs(Stub.frames) do
    if visible(f) then for _, r in ipairs(f.regions) do if r.kind == "FontString" and r.shown and r.text and r.text ~= "" then out[#out + 1] = r.text end end end
  end
  return out
end
return Stub
