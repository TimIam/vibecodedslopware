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
local vis = {}          -- whether each cell's texture is showing: a cell with nothing on it over a ground image is hidden
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

-- Makes the 57,600 textures, hidden, eight rows to a frame ("strip"). Meant to run inside the loader coroutine: it
-- pauses (RT.breathe) after every row. Nothing is shown until showCount / showAll.
local strips = {}
D.strips = strips
function D.build()
  if D.built then return end
  local grid, view = D.grid, D.view
  -- the level's ground, when it ships as an image: one texture under every strip, sliding with the grid
  local level = view:GetFrameLevel()
  local gf = _G.CreateFrame("Frame", nil, view)
  gf:SetAllPoints(view)
  gf:SetFrameLevel(level + 1)
  D.groundFrame = gf
  local gt = gf:CreateTexture(nil, "ARTWORK")
  if gt.SetSnapToPixelGrid then gt:SetSnapToPixelGrid(false); gt:SetTexelSnappingBias(0) end
  gt:Hide()
  D.groundTex = gt
  -- and over it, under the strips, the level's untouched props, a texture each (D.setProps)
  local pf = _G.CreateFrame("Frame", nil, view)
  pf:SetAllPoints(view)
  pf:SetFrameLevel(level + 2)
  D.propFrame = pf
  -- and over the props, still under the strips, the see-through panes (the HUD's panel)
  local nf = _G.CreateFrame("Frame", nil, view)
  nf:SetAllPoints(view)
  nf:SetFrameLevel(level + 3)
  D.paneFrame = nf
  local strip = nil
  for gy = 0, H - 1 do
    if gy % 8 == 0 then
      strip = _G.CreateFrame("Frame", nil, view)
      strip:SetAllPoints(view)
      strip:SetFrameLevel(level + 4)
      strips[#strips + 1] = strip
    end
    D.progress = gy / H
    for gx = 0, W - 1 do
      local t = strip:CreateTexture(nil, "ARTWORK")
      t:SetColorTexture(1, 1, 1, 1)
      if t.SetSnapToPixelGrid then t:SetSnapToPixelGrid(false); t:SetTexelSnappingBias(0) end
      t:SetSize(1, 1)
      t:SetPoint("TOPLEFT", grid, "TOPLEFT", gx, -gy)
      t:SetVertexColor(0.078, 0.102, 0.07)
      t:Hide()
      tex[gy * W + gx + 1] = t
      vis[gy * W + gx + 1] = false
    end
    RT.breathe()
  end
  D.progress = nil
  for gx = 0, W - 1 do colX[gx] = gx end
  for gy = 0, H - 1 do rowY[gy] = gy end
  laidX, laidY = 0, 0
  D.shown = 0
  D.built = true
  Screen.invalidate()
end

-- How the strips are handed to the client's renderer. This matters more than it should: in the client, 57,600
-- textures under ONE clipping frame drew nothing at all (the rest of the interface was fine), and 57,600 textures
-- with no clipping made the client stop drawing its whole interface. So the picture is cut into groups the renderer
-- treats separately, and the addon asks the player which way actually shows up (see the display check in app.lua).
--   "clip"     every strip is its own clipping frame the size of the picture
--   "buffer"   every strip is drawn into its own off-screen buffer
--   "plain"    nothing special (what took the interface down; only used to measure where the limit is)
--   "oneclip"  all the strips inside one clipping frame (what drew nothing; only used to measure)
function D.canBuffer()
  local v = D.view
  return v ~= nil and v.SetIsFrameBuffer ~= nil and v.SetFlattensRenderLayers ~= nil
end
function D.setMode(mode)
  D.mode = mode
  local view = D.view
  if mode == "oneclip" and not D.clipAll then
    D.clipAll = _G.CreateFrame("Frame", nil, view)
    D.clipAll:SetAllPoints(view)
    if D.clipAll.SetClipsChildren then D.clipAll:SetClipsChildren(true) end
  end
  local parent = mode == "oneclip" and D.clipAll or view
  -- the ground image is cut to the picture the same way a strip is
  for _, gf in ipairs({ D.groundFrame, D.propFrame, D.paneFrame }) do
    if gf.SetClipsChildren then gf:SetClipsChildren(mode == "clip" or mode == "oneclip") end
    if D.canBuffer() then
      gf:SetFlattensRenderLayers(mode == "buffer")
      gf:SetIsFrameBuffer(mode == "buffer")
    end
  end
  for _, strip in ipairs(strips) do
    if strip.SetClipsChildren then strip:SetClipsChildren(mode == "clip") end
    if D.canBuffer() then
      strip:SetFlattensRenderLayers(mode == "buffer")
      strip:SetIsFrameBuffer(mode == "buffer")
    end
    strip:SetParent(parent)
    strip:ClearAllPoints()
    strip:SetAllPoints(view)
    strip:Show()
  end
end

-- shows the first n cells, in reading order, and hides the rest
function D.showCount(n)
  local from = D.shown or 0
  if n > W * H then n = W * H end
  if n < 0 then n = 0 end
  if n > from then for i = from + 1, n do tex[i]:Show(); vis[i] = true end
  else for i = n + 1, from do tex[i]:Hide(); vis[i] = false end end
  -- cells the game hid or showed one at a time (over a ground image) are put back in step
  for i = 1, n do if not vis[i] then tex[i]:Show(); vis[i] = true end end
  for i = n + 1, W * H do if vis[i] then tex[i]:Hide(); vis[i] = false end end
  D.shown = n
end
function D.showAll() D.showCount(W * H) end
function D.hideAll() D.showCount(0) end

-- the test card: a white border, and a band of colour for every strip, so a missing strip is a dark band
local BARS = { { 0.90, 0.30, 0.25 }, { 0.95, 0.75, 0.25 }, { 0.35, 0.75, 0.35 }, { 0.30, 0.65, 0.90 }, { 0.65, 0.45, 0.85 }, { 0.90, 0.60, 0.75 } }
function D.pattern()
  for gy = 0, H - 1 do
    local c = BARS[floor(gy / 8) % #BARS + 1]
    local k = 0.65 + 0.35 * ((gy % 8) / 7)
    for gx = 0, W - 1 do
      local t = tex[gy * W + gx + 1]
      if gx < 2 or gx >= W - 2 or gy < 2 or gy >= H - 2 then t:SetVertexColor(1, 1, 1, 1) else t:SetVertexColor(c[1] * k, c[2] * k, c[3] * k, 1) end
    end
  end
  Screen.invalidate()
end
-- every cell back to night; the next frame the game shows resends them all
function D.blank()
  for i = 1, W * H do tex[i]:SetVertexColor(0.078, 0.102, 0.07, 1) end
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
        D.moved = D.moved + H
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
        D.moved = D.moved + W
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
local A1 = 16777216
-- v is what the Screen holds for the cell: nil (nothing: the ground image shows through), 0xRRGGBB, or that with an
-- alpha in the byte above (a shadow or a pane of smoke, which the client blends over the image)
local function setCell(i, v)
  local t = tex[i]
  if v == nil then
    if vis[i] then t:Hide(); vis[i] = false end
    return
  end
  local a = 1
  if v >= A1 then a = floor(v / A1) * K; v = v % A1 end
  local r = floor(v / 65536)
  local g = floor(v / 256) % 256
  t:SetVertexColor(r * K, g * K, (v % 256) * K, a)
  if not vis[i] then t:Show(); vis[i] = true end
end

-- Puts the level's ground image under the grid, or takes it away (G is an entry of ns.Ground, or nil). The image is
-- padded to powers of two, so the texture coordinates pick out the part that is the level.
local DIR = "Interface\\AddOns\\" .. ADDON .. "\\Art\\"
function D.setGround(G)
  D.groundNow = G
  local gt = D.groundTex
  if not gt then return end
  if not G then gt:Hide() return end
  gt:SetTexture(DIR .. G.file, "CLAMP", "CLAMP", "NEAREST")
  gt:SetTexCoord(0, G.w / G.tw, 0, G.h / G.th)
  gt:SetSize(G.w, G.h)
  gt:ClearAllPoints()
  gt:SetPoint("TOPLEFT", D.grid, "TOPLEFT", 0, 0)
  gt:Show()
end

-- shows the frame the Screen holds; returns how many cells changed colour
-- The level's props that ship as images (P is an entry of ns.Props, or nil): a texture for each, cut from the
-- level's sheet, pinned to the grid where the prop stands, and hidden until the game says that prop is untouched and
-- has nothing behind it this frame (Screen.props, see gfx.lua). Who is in front of whom is the draw layer: the
-- sheet was made so that no more than 48 ever lie on one another.
local LAYER = { [0] = "BORDER", "ARTWORK", "OVERLAY" }
local pool, lit, stamp = {}, {}, 0
function D.setProps(P)
  D.propsNow = P
  for k = 1, #lit do lit[k].on = false; lit[k].tex:Hide(); lit[k] = nil end
  if not P then return end
  local pf, file = D.propFrame, DIR .. P.file
  for k = 1, #P.list do
    local e = P.list[k]
    local t = pool[k]
    if not t then
      t = pf:CreateTexture(nil, "ARTWORK")
      if t.SetSnapToPixelGrid then t:SetSnapToPixelGrid(false); t:SetTexelSnappingBias(0) end
      pool[k] = t
    end
    t:Hide()
    t:SetTexture(file, "CLAMP", "CLAMP", "NEAREST")
    t:SetTexCoord(e.u / P.tw, (e.u + e.w) / P.tw, e.v / P.th, (e.v + e.h) / P.th)
    t:SetSize(e.w, e.h)
    t:SetDrawLayer(LAYER[floor(e.z / 16)], e.z % 16 - 8)
    t:ClearAllPoints()
    t:SetPoint("TOPLEFT", D.grid, "TOPLEFT", e.x, -e.y)
    e.tex, e.on, e.stamp = t, false, 0
    RT.breathe()
  end
end
local function syncProps()
  local ps = Screen.props
  local P = ps and ps.P or nil
  if P ~= D.propsNow then D.setProps(P) end
  if not ps then return end
  stamp = stamp + 1
  for k = 1, ps.n do
    local e = ps[k]
    e.stamp = stamp
    if not e.on then e.tex:Show(); e.on = true; lit[#lit + 1] = e end
  end
  -- the ones that were up and are not wanted this frame
  local j = 0
  for k = 1, #lit do
    local e = lit[k]
    if e.stamp == stamp then j = j + 1; lit[j] = e else e.tex:Hide(); e.on = false end
  end
  for k = #lit, j + 1, -1 do lit[k] = nil end
end
D.propsLit = lit

-- The Screen's panes (canvas.lua): each a flat see-through rectangle under the grid. They are in screen pixels and
-- the grid is not (it slides with the camera and jumps with the shake, and the HUD must jump with it), so each is
-- pinned to the grid at wherever that puts it on the screen this frame.
local panes = {}
local function syncPanes()
  local list = Screen.panes
  local n = list.n
  local vx, vy = Screen.vx or 0, Screen.vy or 0
  for k = 1, n do
    local pn, t = list[k], panes[k]
    if not t then
      t = { tex = D.paneFrame:CreateTexture(nil, "ARTWORK"), on = false }
      t.tex:SetColorTexture(1, 1, 1, 1)
      if t.tex.SetSnapToPixelGrid then t.tex:SetSnapToPixelGrid(false); t.tex:SetTexelSnappingBias(0) end
      t.tex:Hide()
      panes[k] = t
    end
    if t.rgb ~= pn.rgb or t.a ~= pn.a then
      t.rgb, t.a = pn.rgb, pn.a
      t.tex:SetVertexColor(floor(pn.rgb / 65536) * K, floor(pn.rgb / 256) % 256 * K, (pn.rgb % 256) * K, pn.a)
    end
    if t.w ~= pn.w or t.h ~= pn.h then t.w, t.h = pn.w, pn.h; t.tex:SetSize(pn.w, pn.h) end
    local x, y = pn.x + vx, pn.y + vy
    if t.x ~= x or t.y ~= y then t.x, t.y = x, y; t.tex:SetPoint("TOPLEFT", D.grid, "TOPLEFT", x, -y) end
    if not t.on then t.tex:Show(); t.on = true end
  end
  for k = n + 1, #panes do local t = panes[k]; if t.on then t.tex:Hide(); t.on = false end end
end
D.panes = panes

-- D.moveMs and D.sendMs say what the two halves cost (moving textures for the camera, recolouring them), and
-- D.moved how many textures were moved: /endgame perf shows them
D.moved, D.moveMs, D.sendMs = 0, 0, 0
function D.present()
  if not D.built then return 0 end
  local clock = RT.perfNow
  local t0 = clock()
  D.moved = 0
  if Screen.ground ~= D.groundNow then D.setGround(Screen.ground) end
  syncProps()
  syncPanes()
  layout()
  local t1 = clock()
  local n = Screen.present(setCell)
  D.moveMs, D.sendMs = t1 - t0, clock() - t1
  return n
end

-- What the client charges for the three things a frame is made of, measured where it runs: recolouring a texture,
-- moving one, and plain Lua. Returns a line to print. The picture is resent afterwards.
function D.bench()
  if not D.built then return "open the game first" end
  local clock = RT.perfNow
  local n = 20000
  local t0 = clock()
  for i = 1, n do local k = (i % 7) / 7; tex[i]:SetVertexColor(k, 0.3, 1 - k) end
  local colour = (clock() - t0) / n * 1000
  t0 = clock()
  for i = 1, n do tex[i]:SetVertexColor(0.5, 0.3, 0.5) end
  for i = 1, n do tex[i]:SetVertexColor(0.5, 0.3, 0.5) end
  local same = (clock() - t0) / (2 * n) * 1000
  t0 = clock()
  for i = 1, n do
    local gx, gy = (i - 1) % W, floor((i - 1) / W)
    tex[i]:SetPoint("TOPLEFT", D.grid, "TOPLEFT", colX[gx], -rowY[gy])
  end
  local move = (clock() - t0) / n * 1000
  t0 = clock()
  local t, acc = {}, 0
  for i = 1, 1000000 do local v = (i * 7) % 1024; t[v] = i; acc = acc + floor(v / 16) end
  local lua = clock() - t0
  Screen.invalidate()
  return string.format("recolour %.2f us each (%.2f when unchanged), move %.2f us each, a million Lua steps %.0f ms (about 25 on this PC outside the game)", colour, same, move, lua)
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
