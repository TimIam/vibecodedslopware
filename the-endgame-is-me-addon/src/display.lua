-- The Endgame is Me: the window, and the 320×180 grid of one-pixel textures the game is shown on.
--
-- The Screen (canvas.lua) addresses its cells as a torus: cell (gx, gy) holds whichever world pixel has those
-- coordinates modulo 320×180. So each texture is anchored at the world position it is showing, the whole grid slides
-- under a clipping frame as the camera moves, and when a column or row slides out of view its textures hop to the far
-- side. A scroll step costs 180 or 320 anchor changes instead of 57,600 colour changes.

local ADDON, ns = ...
local RT = ns.RT
local Screen = RT.Screen
local floor = math.floor
local W, H = 320, 180
local BAR = 11          -- title bar height, in game pixels
local EDGE = 2          -- window border

local D = { built = false, scale = 3 }
ns.Display = D
local tex = {}
local colX, rowY = {}, {}
local laidX, laidY = nil, nil

local FONT = _G.STANDARD_TEXT_FONT or "Fonts\\FRIZQT__.TTF"
D.FONT = FONT

-- whole screen pixels per game pixel: the biggest that leaves the window at most ~62% of the screen wide
local function physical()
  if _G.GetPhysicalScreenSize then local w, h = _G.GetPhysicalScreenSize(); if w and h and h > 0 then return w, h end end
  return 1920, 1080
end
function D.autoScale()
  local pw, ph = physical()
  local n = floor(math.min(pw * 0.62 / W, ph * 0.7 / (H + BAR)))
  if n < 1 then n = 1 end
  if n > 6 then n = 6 end
  return n
end

-- one frame unit = n screen pixels, whatever the UI scale is
function D.applyScale()
  local f = D.frame
  if not f then return end
  local n = ns.DB and ns.DB.scale or 0
  if not n or n < 1 then n = D.autoScale() end
  D.scale = n
  local _, ph = physical()
  local parent = _G.UIParent:GetEffectiveScale()
  f:SetScale(n * 768 / ph / parent)
  D.snap()
end

-- keeps the window on whole pixels, so no row of the picture lands between two screen rows
function D.snap()
  local f = D.frame
  if not f or not f:GetLeft() then return end
  local x, y = floor(f:GetLeft() + 0.5), floor(f:GetBottom() + 0.5)
  f:ClearAllPoints()
  f:SetPoint("BOTTOMLEFT", _G.UIParent, "BOTTOMLEFT", x, y)   -- offsets are in the frame's own units
  if ns.DB then ns.DB.pos = { x = x, y = y, scale = D.scale } end
end

local function solid(parent, layer, r, g, b, a)
  local t = parent:CreateTexture(nil, layer or "BACKGROUND")
  t:SetColorTexture(r, g, b, a or 1)
  return t
end
D.solid = solid

function D.text(parent, size, r, g, b, layer)
  local fs = parent:CreateFontString(nil, layer or "OVERLAY")
  fs:SetFont(FONT, size, "")
  fs:SetTextColor(r or 0.93, g or 0.89, b or 0.78)
  fs:SetShadowColor(0, 0, 0, 0.9)
  fs:SetShadowOffset(0.5, -0.5)
  return fs
end

-- The window itself: cheap, made straight away. The grid of textures comes later, in slices (see build).
function D.create()
  if D.frame then return D.frame end
  local f = _G.CreateFrame("Frame", "TheEndgameIsMeFrame", _G.UIParent)
  D.frame = f
  f:SetSize(W + EDGE * 2, H + BAR + EDGE)
  f:SetFrameStrata("HIGH")
  f:SetClampedToScreen(true)
  f:SetMovable(true)
  f:EnableMouse(true)
  f:Hide()
  local bg = solid(f, "BACKGROUND", 0.055, 0.045, 0.035, 1)
  bg:SetAllPoints(f)
  local rim = solid(f, "BORDER", 0.33, 0.27, 0.19, 1)
  rim:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0); rim:SetPoint("TOPRIGHT", f, "TOPRIGHT", 0, 0); rim:SetHeight(1)

  local bar = _G.CreateFrame("Frame", nil, f)
  bar:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0); bar:SetPoint("TOPRIGHT", f, "TOPRIGHT", 0, 0); bar:SetHeight(BAR)
  bar:EnableMouse(true)
  bar:RegisterForDrag("LeftButton")
  bar:SetScript("OnDragStart", function() f:StartMoving() end)
  bar:SetScript("OnDragStop", function() f:StopMovingOrSizing(); D.snap() end)
  local title = D.text(bar, 6, 0.86, 0.72, 0.36)
  title:SetPoint("LEFT", bar, "LEFT", 4, 0)
  title:SetText("The Endgame is Me")
  D.title = title
  local info = D.text(bar, 4.5, 0.55, 0.52, 0.46)
  info:SetPoint("RIGHT", bar, "RIGHT", -16, 0)
  D.info = info

  local close = _G.CreateFrame("Button", nil, bar)
  close:SetSize(9, 9)
  close:SetPoint("RIGHT", bar, "RIGHT", -2, 0)
  local cb = solid(close, "BACKGROUND", 0.45, 0.14, 0.1, 1)
  cb:SetAllPoints(close)
  local cx = D.text(close, 6, 1, 0.9, 0.8)
  cx:SetPoint("CENTER", close, "CENTER", 0, 0)
  cx:SetText("x")
  close:SetScript("OnClick", function() if ns.App then ns.App.close() end end)

  -- the picture: a clipping frame, and inside it the grid that slides about
  local view = _G.CreateFrame("Frame", nil, f)
  D.view = view
  view:SetPoint("TOPLEFT", f, "TOPLEFT", EDGE, -BAR)
  view:SetSize(W, H)
  -- No clipping frame: every texture always sits inside the picture (see layout below), so nothing needs cutting
  -- off, and in the client a clipped parent showed none of its children at all.
  local vb = solid(view, "BACKGROUND", 0.078, 0.102, 0.07, 1)
  vb:SetAllPoints(view)
  local grid = _G.CreateFrame("Frame", nil, view)
  D.grid = grid
  grid:SetSize(W, H)
  grid:SetPoint("TOPLEFT", view, "TOPLEFT", 0, 0)
  -- everything that sits over the picture (menus, the Hoard) parents to this
  -- It belongs to the window, not to the picture, and sits a whole strata above it: whatever happens to the 57,600
  -- textures, the menus do not depend on them.
  local over = _G.CreateFrame("Frame", nil, f)
  D.over = over
  over:SetPoint("TOPLEFT", f, "TOPLEFT", EDGE, -BAR)
  over:SetSize(W, H)
  over:SetFrameStrata("DIALOG")
  bar:SetFrameStrata("DIALOG")   -- the shake nudges the picture a pixel or two; the title bar stays on top of it

  local pos = ns.DB and ns.DB.pos
  D.applyScale()
  f:ClearAllPoints()
  if pos and pos.x and pos.scale == D.scale then
    f:SetPoint("BOTTOMLEFT", _G.UIParent, "BOTTOMLEFT", pos.x, pos.y)
  else
    f:SetPoint("CENTER", _G.UIParent, "CENTER", 0, 20)
  end
  return f
end

-- Makes the 57,600 textures. Meant to run inside the loader coroutine: it pauses (RT.breathe) every few hundred.
function D.build()
  if D.built then return end
  local grid = D.grid
  local strip = nil
  for gy = 0, H - 1 do
    -- Eight rows to a frame. One frame holding every texture would be 230,000 vertices in a single batch, more than
    -- a 16-bit index can address, and a frame's textures also get slower to add the more it already has.
    if gy % 8 == 0 then
      strip = _G.CreateFrame("Frame", nil, grid)
      strip:SetAllPoints(grid)
    end
    D.progress = gy / H
    for gx = 0, W - 1 do
      local t = strip:CreateTexture(nil, "ARTWORK")
      t:SetColorTexture(1, 1, 1, 1)
      if t.SetSnapToPixelGrid then t:SetSnapToPixelGrid(false); t:SetTexelSnappingBias(0) end
      t:SetSize(1, 1)
      t:SetPoint("TOPLEFT", grid, "TOPLEFT", gx, -gy)
      t:SetVertexColor(0.078, 0.102, 0.07)
      tex[gy * W + gx + 1] = t
    end
    RT.breathe()
  end
  D.progress = nil
  for gx = 0, W - 1 do colX[gx] = gx end
  for gy = 0, H - 1 do rowY[gy] = gy end
  laidX, laidY = 0, 0
  D.built = true
  Screen.invalidate()
end

-- moves the grid for the Screen's camera (and the shake), hopping any column or row that slid out of view
local function layout()
  local vx, vy = Screen.vx or 0, Screen.vy or 0
  if vx ~= laidX then
    for wx = vx, vx + W - 1 do
      local gx = wx % W
      if colX[gx] ~= wx then
        colX[gx] = wx
        for gy = 0, H - 1 do tex[gy * W + gx + 1]:SetPoint("TOPLEFT", D.grid, "TOPLEFT", wx, -rowY[gy]) end
      end
    end
    laidX = vx
  end
  if vy ~= laidY then
    for wy = vy, vy + H - 1 do
      local gy = wy % H
      if rowY[gy] ~= wy then
        rowY[gy] = wy
        local base = gy * W + 1
        for gx = 0, W - 1 do tex[base + gx]:SetPoint("TOPLEFT", D.grid, "TOPLEFT", colX[gx], -wy) end
      end
    end
    laidY = vy
  end
  local sx, sy = 0, 0
  if not (ns.DB and ns.DB.calm) then sx, sy = Screen.shakeX or 0, Screen.shakeY or 0 end
  if vx ~= D.gx or vy ~= D.gy or sx ~= D.sx or sy ~= D.sy then
    D.gx, D.gy, D.sx, D.sy = vx, vy, sx, sy
    D.grid:SetPoint("TOPLEFT", D.view, "TOPLEFT", sx - vx, vy - sy)
  end
end

local K = 1 / 255
local function setCell(i, v)
  local r = floor(v / 65536)
  local g = floor(v / 256) % 256
  tex[i]:SetVertexColor(r * K, g * K, (v % 256) * K)
end

-- shows the frame the Screen holds; returns how many cells changed colour
function D.present()
  if not D.built then return 0 end
  layout()
  return Screen.present(setCell)
end

-- where the mouse is, in game pixels (0..320, 0..180), and whether it is over the picture
function D.cursor()
  local view = D.view
  local s = view:GetEffectiveScale()
  local cx, cy = _G.GetCursorPosition()
  local x = cx / s - view:GetLeft()
  local y = view:GetTop() - cy / s
  return x, y, x >= 0 and y >= 0 and x < W and y < H
end
