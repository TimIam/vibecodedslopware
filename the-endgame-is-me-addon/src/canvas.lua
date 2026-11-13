-- The Endgame is Me: the slice of the browser's 2D canvas that the game's drawing code uses, in plain Lua.
--
-- Offscreen canvases (sprites, the painted ground) are tables of packed pixels. The one on-screen canvas, the Screen,
-- is different: it keeps the frame as 320×180 colours and remembers which of them changed, so the WoW side only
-- recolours those. The ground under everything is a retained "base" layer, and the Screen is addressed as a torus
-- (cell = world pixel modulo the screen size), so a scrolling level only repaints the row or column that came into view.
-- No WoW API in here; the headless tests drive it under stock Lua 5.1.

local ADDON, ns = ...
local RT = ns.RT
local floor, min, max = math.floor, math.min, math.max
local type, tonumber, setmetatable, rawget = type, tonumber, setmetatable, rawget

local W, H = 320, 180
local A1 = 16777216          -- one step of alpha in a packed pixel
-- A packed pixel: nil is empty, below A1 is a solid 0xRRGGBB, anything else is alpha (1..254) * A1 + 0xRRGGBB.

-- ------------------------------------------------------------------------------------------------ colours

local COLORS = {}
local function parseColor(s)
  local c = COLORS[s]
  if c then return c end
  local r, g, b, a = 0, 0, 0, 1
  if type(s) == "string" then
    if s:sub(1, 1) == "#" then
      if #s == 4 then
        r, g, b = tonumber(s:sub(2, 2), 16) * 17, tonumber(s:sub(3, 3), 16) * 17, tonumber(s:sub(4, 4), 16) * 17
      else
        r, g, b = tonumber(s:sub(2, 3), 16), tonumber(s:sub(4, 5), 16), tonumber(s:sub(6, 7), 16)
        if #s >= 9 then a = tonumber(s:sub(8, 9), 16) / 255 end
      end
    else
      local p = {}
      for n in s:gmatch("[%d%.]+") do p[#p + 1] = tonumber(n) end
      r, g, b = p[1] or 0, p[2] or 0, p[3] or 0
      if s:sub(1, 4) == "rgba" then a = p[4] or 1 end
    end
  end
  c = { rgb = floor(r) * 65536 + floor(g) * 256 + floor(b), a = a }
  COLORS[s] = c
  return c
end
RT.parseColor = parseColor

-- src over dst, both 0xRRGGBB, a in 0..1
local function mix(dst, src, a)
  local dr = floor(dst / 65536)
  local dg = floor(dst / 256) % 256
  local db = dst % 256
  local sr = floor(src / 65536)
  local sg = floor(src / 256) % 256
  local sb = src % 256
  return floor(dr + (sr - dr) * a + 0.5) * 65536 + floor(dg + (sg - dg) * a + 0.5) * 256 + floor(db + (sb - db) * a + 0.5)
end

RT.mix = mix

-- src (with alpha sa, 0..1) over a packed destination pixel that may itself be see-through
local function over(d, src, sa)
  if d == nil then
    if sa >= 0.998 then return src end
    local a = floor(sa * 255 + 0.5)
    if a <= 0 then return nil end
    return a * A1 + src
  end
  if sa >= 0.998 then return src end
  if d < A1 then return mix(d, src, sa) end
  local da = floor(d / A1)
  local drgb = d - da * A1
  local daf = da / 255
  local oa = sa + daf * (1 - sa)
  local rgb = mix(drgb, src, sa / oa)
  local a = floor(oa * 255 + 0.5)
  if a >= 255 then return rgb end
  return a * A1 + rgb
end

-- ------------------------------------------------------------------------------------------------ offscreen canvases

local Canvas = {}
Canvas.__index = Canvas
local Ctx = {}
Ctx.__index = Ctx

function RT.newCanvas(w, h)
  return setmetatable({ width = w or 300, height = h or 150, px = {}, ver = 0 }, Canvas)
end
function Canvas:getContext()
  local c = self.ctx
  if not c then
    c = setmetatable({ canvas = self, fillStyle = "#000000", globalAlpha = 1, globalCompositeOperation = "source-over", tx = 0, ty = 0 }, Ctx)
    self.ctx = c
  end
  return c
end

local function logRect(cv, x0, y0, x1, y1)
  local log = cv.log
  if log then
    -- A burst of small marks (a shower of ash) used to overflow the list, and the Screen then worked the whole
    -- picture's ground out again: a 13 ms frame. Past 96 the last entry grows to hold the rest instead.
    local n = #log
    if n >= 96 then
      local r = log[n]
      if x0 < r[1] then r[1] = x0 end
      if y0 < r[2] then r[2] = y0 end
      if x1 > r[3] then r[3] = x1 end
      if y1 > r[4] then r[4] = y1 end
    else log[n + 1] = { x0, y0, x1, y1 } end
  end
end

function Ctx:setTransform(a, b, c, d, e, f) self.tx, self.ty = e or 0, f or 0 end
function Ctx:translate(x, y) self.tx, self.ty = self.tx + x, self.ty + y end
function Ctx:beginPath() end

local Gradient = {}
Gradient.__index = Gradient
function Gradient:addColorStop(t, col) local c = parseColor(col); self.stops[#self.stops + 1] = { t = t, rgb = c.rgb, a = c.a } end
function Ctx:createLinearGradient(x0, y0, x1, y1) return setmetatable({ x0 = x0, y0 = y0, x1 = x1, y1 = y1, stops = {}, __grad = true }, Gradient) end
-- the colour and alpha of a gradient at canvas x (only left-to-right gradients are used)
local function gradAt(gr, x)
  local st = gr.stops
  local t = (x + 0.5 - gr.x0) / (gr.x1 - gr.x0)
  if t <= st[1].t then return st[1].rgb, st[1].a end
  for i = 2, #st do
    if t <= st[i].t then
      local p, q = st[i - 1], st[i]
      local k = (t - p.t) / (q.t - p.t)
      -- colours with alpha interpolate premultiplied in a browser; close enough here to mix straight
      return mix(p.rgb, q.rgb, k), p.a + (q.a - p.a) * k
    end
  end
  return st[#st].rgb, st[#st].a
end

local fills = 0
function Ctx:fillRect(x, y, w, h)
  fills = fills + 1
  if fills >= 600 then fills = 0; RT.breathe() end
  local cv = self.canvas
  local CW, CH = cv.width, cv.height
  x, y = x + self.tx, y + self.ty
  local x0, y0 = floor(x + 0.5), floor(y + 0.5)
  local x1, y1 = floor(x + w + 0.5) - 1, floor(y + h + 0.5) - 1
  if x0 < 0 then x0 = 0 end
  if y0 < 0 then y0 = 0 end
  if x1 >= CW then x1 = CW - 1 end
  if y1 >= CH then y1 = CH - 1 end
  if x1 < x0 or y1 < y0 then return end
  local style = self.fillStyle
  local grad = type(style) == "table" and style or nil
  local rgb, sa = 0, 1
  if not grad then local c = parseColor(style); rgb, sa = c.rgb, c.a end
  local ga = self.globalAlpha
  local op = self.globalCompositeOperation
  local px = cv.px
  cv.ver = cv.ver + 1
  if cv.log then logRect(cv, x0, y0, x1, y1) end
  if op == "source-over" and not grad then
    local a = sa * ga
    if a >= 0.998 then
      for yy = y0, y1 do
        local i = yy * CW + x0 + 1
        for k = i, i + x1 - x0 do px[k] = rgb end
      end
    elseif a > 0.002 then
      for yy = y0, y1 do
        local i = yy * CW + x0 + 1
        for k = i, i + x1 - x0 do px[k] = over(px[k], rgb, a) end
      end
    end
    return
  end
  for xx = x0, x1 do
    local a = sa
    if grad then rgb, a = gradAt(grad, xx) end
    a = a * ga
    for yy = y0, y1 do
      local i = yy * CW + xx + 1
      local d = px[i]
      if op == "source-in" then
        -- keep the shape that is there, in the new colour
        if d ~= nil then
          local da = d < A1 and 255 or floor(d / A1)
          local na = floor(da * a + 0.5)
          if na <= 0 then px[i] = nil elseif na >= 255 then px[i] = rgb else px[i] = na * A1 + rgb end
        end
      elseif op == "source-atop" then
        -- paint only where there is something already, keeping its alpha
        if d ~= nil then
          if d < A1 then px[i] = mix(d, rgb, a)
          else local da = floor(d / A1); px[i] = da * A1 + mix(d - da * A1, rgb, a) end
        end
      else
        px[i] = over(d, rgb, a)
      end
    end
  end
end

function Ctx:clearRect(x, y, w, h)
  local cv = self.canvas
  local CW, CH = cv.width, cv.height
  x, y = x + self.tx, y + self.ty
  local x0, y0 = max(0, floor(x + 0.5)), max(0, floor(y + 0.5))
  local x1, y1 = min(CW - 1, floor(x + w + 0.5) - 1), min(CH - 1, floor(y + h + 0.5) - 1)
  cv.ver = cv.ver + 1
  if x0 == 0 and y0 == 0 and x1 == CW - 1 and y1 == CH - 1 then
    cv.px = {}
    if cv.log then cv.logAll = true end
    return
  end
  local px = cv.px
  for yy = y0, y1 do for xx = x0, x1 do px[yy * CW + xx + 1] = nil end end
  if cv.log then logRect(cv, x0, y0, x1, y1) end
end

-- drawImage(img, dx, dy) or drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) with no scaling
function Ctx:drawImage(img, a1, a2, a3, a4, a5, a6)
  local sx, sy, sw, sh, dx, dy = 0, 0, img.width, img.height, a1, a2
  if a5 ~= nil then sx, sy, sw, sh, dx, dy = a1, a2, a3, a4, a5, a6 end
  local cv = self.canvas
  local CW, CH = cv.width, cv.height
  dx, dy = floor(dx + self.tx + 0.5), floor(dy + self.ty + 0.5)
  local px, spx, SW, SH = cv.px, img.px, img.width, img.height
  local ga = self.globalAlpha
  cv.ver = cv.ver + 1
  if cv.log then logRect(cv, dx, dy, dx + sw - 1, dy + sh - 1) end
  if ga >= 0.998 and self.globalCompositeOperation == "source-over" then
    -- clip once, then copy runs
    local c0, c1, r0, r1 = 0, sw - 1, 0, sh - 1
    if dx < 0 then c0 = -dx end
    if sx + c0 < 0 then c0 = -sx end
    if dx + c1 >= CW then c1 = CW - 1 - dx end
    if sx + c1 >= SW then c1 = SW - 1 - sx end
    if dy < 0 then r0 = -dy end
    if sy + r0 < 0 then r0 = -sy end
    if dy + r1 >= CH then r1 = CH - 1 - dy end
    if sy + r1 >= SH then r1 = SH - 1 - sy end
    for row = r0, r1 do
      local di, si = (dy + row) * CW + dx + 1, (sy + row) * SW + sx + 1
      for col = c0, c1 do
        local v = spx[si + col]
        if v ~= nil then
          if v < A1 then px[di + col] = v
          else local va = floor(v / A1); px[di + col] = over(px[di + col], v - va * A1, va / 255) end
        end
      end
    end
    return
  end
  for row = 0, sh - 1 do
    local yy, syy = dy + row, sy + row
    if yy >= 0 and yy < CH and syy >= 0 and syy < SH then
      for col = 0, sw - 1 do
        local xx, sxx = dx + col, sx + col
        if xx >= 0 and xx < CW and sxx >= 0 and sxx < SW then
          local v = spx[syy * SW + sxx + 1]
          if v ~= nil then
            local i = yy * CW + xx + 1
            if v < A1 then
              if ga >= 0.998 then px[i] = v else px[i] = over(px[i], v, ga) end
            else
              local va = floor(v / A1)
              px[i] = over(px[i], v - va * A1, va / 255 * ga)
            end
          end
        end
      end
    end
  end
end

local ZERO = { __index = function() return 0 end }
function Ctx:createImageData(w, h)
  return { width = w, height = h, data = setmetatable({ length = w * h * 4 }, ZERO) }
end
function Ctx:putImageData(img, x, y)
  local cv = self.canvas
  local CW, CH = cv.width, cv.height
  local px, d, IW = cv.px, img.data, img.width
  cv.ver = cv.ver + 1
  if cv.log then cv.logAll = true end
  for row = 0, img.height - 1 do
    local yy = y + row
    if row % 16 == 15 then RT.breathe() end
    if yy >= 0 and yy < CH then
      for col = 0, IW - 1 do
        local xx = x + col
        if xx >= 0 and xx < CW then
          local i = (row * IW + col) * 4
          local a = rawget(d, i + 3) or 0
          local o = yy * CW + xx + 1
          if a <= 0 then px[o] = nil
          else
            local rgb = (rawget(d, i) or 0) * 65536 + (rawget(d, i + 1) or 0) * 256 + (rawget(d, i + 2) or 0)
            if a >= 255 then px[o] = rgb else px[o] = floor(a) * A1 + rgb end
          end
        end
      end
    end
  end
end
RT.host.ImageData = { new = function(data, w, h) return { data = data, width = w, height = h } end }
RT.host.document = { createElement = function() return RT.newCanvas(300, 150) end }

-- the runs of pixels in each row of a sprite, so drawing it never looks at the gaps
local function spansOf(cv)
  if cv.spanVer == cv.ver then return cv.spans end
  local px, CW, CH = cv.px, cv.width, cv.height
  local spans, alpha = {}, false
  for row = 0, CH - 1 do
    local base = row * CW + 1
    local list, n, start = nil, 0, nil
    for col = 0, CW - 1 do
      local v = px[base + col]
      if v ~= nil then
        if v >= A1 then alpha = true end
        if not start then start = col end
      elseif start then
        list = list or {}
        list[n + 1], list[n + 2] = start, col - 1
        n = n + 2
        start = nil
      end
    end
    if start then list = list or {}; list[n + 1], list[n + 2] = start, CW - 1 end
    spans[row] = list or false
  end
  cv.spans, cv.spanVer, cv.hasAlpha = spans, cv.ver, alpha
  return spans
end

-- ------------------------------------------------------------------------------------------------ the Screen

local NIGHT = 0x141a12
local cur, shown, base = {}, {}, {}      -- what the frame is, what the display shows, the ground under it
local mark = {}                          -- frame number a cell was last drawn on
local now, nNow = {}, 0                  -- cells drawn on this frame
local prev, nPrev = {}, 0                -- cells drawn on the last one
local touched, nTouched = {}, 0          -- cells whose ground changed
local mask = nil                         -- cells under the tree canopy, while things are being drawn beneath it
local maskData = {}
local frame = 1
local imageMode = false                  -- a ground image lies under the grid (Screen.begin): cells may be empty
local inHud = false                      -- drawing is going to the HUD layer (Screen.hudBegin)
local ox, oy = 0, 0                      -- the camera, modulo the screen
for i = 1, W * H do cur[i] = NIGHT; shown[i] = -1; base[i] = NIGHT; mark[i] = 0 end

-- Where anything is, coarsely: the screen in tiles of 10 pixels. A prop that ships as an image is drawn by the client
-- as a texture under the grid (gfx.lua), which is only right while no cell over it holds something that belongs
-- behind it. Screen.clear() answers that from these two tables without looking at a single cell.
local TILE = 10
local TW, TH = W / TILE, H / TILE
local occ = {}        -- screen tile → the frame something was last drawn in it
local baseCnt = {}    -- torus tile → how many of its cells have a retained colour (scorch, rubble, canopy)
local ttile = {}      -- cell → its torus tile
for t = 1, TW * TH do occ[t] = 0; baseCnt[t] = TILE * TILE end
for gy = 0, H - 1 do for gx = 0, W - 1 do ttile[gy * W + gx + 1] = floor(gy / TILE) * TW + floor(gx / TILE) + 1 end end
local occOn = false
local function markRect(x0, y0, x1, y1)
  local f = frame
  local tx0, tx1 = floor(x0 / TILE), floor(x1 / TILE)
  for ty = floor(y0 / TILE), floor(y1 / TILE) do
    local r = ty * TW + 1
    for tx = tx0, tx1 do occ[r + tx] = f end
  end
end

local Screen = { width = W, height = H, shakeX = 0, shakeY = 0 }
local SCtx = { canvas = Screen, fillStyle = "#000000", globalAlpha = 1, globalCompositeOperation = "source-over", tx = 0, ty = 0 }
local SMeta = {}
SMeta.__index = SMeta
setmetatable(SCtx, SMeta)
function Screen:getContext() return SCtx end
RT.Screen = Screen
RT.host.makeScreen = function() return Screen end

function SMeta:setTransform(a, b, c, d, e, f) self.tx, self.ty = e or 0, f or 0 end
function SMeta:translate(x, y) self.tx, self.ty = self.tx + x, self.ty + y end
function SMeta:beginPath() end

local lastStyle, lastRgb, lastA = nil, 0, 1

-- Blending is most of what a see-through fill costs, and a fill meets the same few ground colours over and over (the
-- HUD's backing covers 7,500 cells a frame), so the answers are kept: blends[colour][alpha][what was there] = result.
local blends, nBlends = {}, 0
local memoRgb, memoA, memoT = nil, nil, nil
local function blendsFor(rgb, a)
  if rgb == memoRgb and a == memoA then return memoT end
  if nBlends > 300 then blends, nBlends = {}, 0 end   -- a fade makes a new alpha every frame
  local byA = blends[rgb]
  if not byA then byA = {}; blends[rgb] = byA end
  local t = byA[a]
  if not t then t = {}; byA[a] = t; nBlends = nBlends + 1 end
  memoRgb, memoA, memoT = rgb, a, t
  return t
end

function SMeta:fillRect(x, y, w, h)
  local style = self.fillStyle
  if style ~= lastStyle then
    local c = parseColor(style)
    lastStyle, lastRgb, lastA = style, c.rgb, c.a
  end
  local a = lastA * self.globalAlpha
  if a <= 0.002 then return end
  local rgb = lastRgb
  x, y = x + self.tx, y + self.ty
  local x0, y0 = floor(x + 0.5), floor(y + 0.5)
  local x1, y1 = floor(x + w + 0.5) - 1, floor(y + h + 0.5) - 1
  if x0 < 0 then x0 = 0 end
  if y0 < 0 then y0 = 0 end
  if x1 >= W then x1 = W - 1 end
  if y1 >= H then y1 = H - 1 end
  if x1 < x0 or y1 < y0 then return end
  if occOn then markRect(x0, y0, x1, y1) end
  local n = x1 - x0 + 1
  local gx = (x0 + ox) % W
  local first = W - gx
  if first > n then first = n end
  local opaque = a >= 0.998
  local memo = not opaque and blendsFor(rgb, a)
  local f, m = frame, mask
  for sy = y0, y1 do
    local row = ((sy + oy) % H) * W + 1
    local i0, i1 = row + gx, row + gx + first - 1
    for pass = 1, 2 do
      for i = i0, i1 do
        if not (m and m[i]) then
          if mark[i] ~= f then mark[i] = f; nNow = nNow + 1; now[nNow] = i end
          if opaque then cur[i] = rgb
          else
            local d = cur[i]
            local v = d and memo[d]
            if not v then v = over(d, rgb, a); if d then memo[d] = v end end
            cur[i] = v
          end
        end
      end
      if first >= n then break end
      i0, i1 = row, row + n - first - 1
    end
  end
end

-- A list of single pixels in one colour (list[1], list[2] = x, y of the first, and so on up to list[n]): what
-- fillRect(x, y, 1, 1) does for each, without the call, the colour lookup and the clipping arithmetic every time.
-- Ice floors and fires are thousands of these a frame.
function Screen.points(list, n, style, alpha)
  local c = parseColor(style)
  local a = c.a * alpha
  if a <= 0.002 then return end
  local rgb = c.rgb
  local dx, dy = SCtx.tx + 0.5, SCtx.ty + 0.5
  local opaque = a >= 0.998
  local memo = not opaque and blendsFor(rgb, a)
  local f, m, marking = frame, mask, occOn
  for j = 1, n, 2 do
    local sx, sy = floor(list[j] + dx), floor(list[j + 1] + dy)
    if sx >= 0 and sx < W and sy >= 0 and sy < H then
      if marking then occ[floor(sy / TILE) * TW + 1 + floor(sx / TILE)] = f end
      local i = ((sy + oy) % H) * W + 1 + (sx + ox) % W
      if not (m and m[i]) then
        if mark[i] ~= f then mark[i] = f; nNow = nNow + 1; now[nNow] = i end
        if opaque then cur[i] = rgb
        else
          local d = cur[i]
          local v = d and memo[d]
          if not v then v = over(d, rgb, a); if d then memo[d] = v end end
          cur[i] = v
        end
      end
    end
  end
end
Screen.ctx = SCtx

-- A see-through pane over a wide stretch of the picture: the panel behind the HUD. Painted, it is thousands of
-- blended cells, every one a texture the client must show. On the HUD layer (hudBegin, below) it is instead one
-- texture the client lays over the grid and under that layer (Screen.panes, see display.lua); anything already
-- drawn on the layer under it is tinted here.
Screen.panes = { n = 0 }
function SMeta:pane(x, y, w, h)
  if not inHud then return self:fillRect(x, y, w, h) end
  local style = self.fillStyle
  if style ~= lastStyle then
    local c = parseColor(style)
    lastStyle, lastRgb, lastA = style, c.rgb, c.a
  end
  local a = lastA * self.globalAlpha
  if a <= 0.002 then return end
  local rgb = lastRgb
  x, y = x + self.tx, y + self.ty
  local x0, y0 = floor(x + 0.5), floor(y + 0.5)
  local x1, y1 = floor(x + w + 0.5) - 1, floor(y + h + 0.5) - 1
  if x0 < 0 then x0 = 0 end
  if y0 < 0 then y0 = 0 end
  if x1 >= W then x1 = W - 1 end
  if y1 >= H then y1 = H - 1 end
  if x1 < x0 or y1 < y0 then return end
  local panes = Screen.panes
  local k = panes.n + 1
  local pn = panes[k]
  if not pn then pn = {}; panes[k] = pn end
  panes.n = k
  pn.x, pn.y, pn.w, pn.h, pn.rgb, pn.a = x0, y0, x1 - x0 + 1, y1 - y0 + 1, rgb, a
  if nNow == 0 then return end   -- nothing drawn on the layer yet, so nothing of it to tint
  local n = x1 - x0 + 1
  local gx = (x0 + ox) % W
  local first = W - gx
  if first > n then first = n end
  local memo = blendsFor(rgb, a)
  local f, m = frame, mask
  for sy = y0, y1 do
    local row = ((sy + oy) % H) * W + 1
    local i0, i1 = row + gx, row + gx + first - 1
    for pass = 1, 2 do
      for i = i0, i1 do
        local d = cur[i]
        if d ~= nil and not (m and m[i]) then
          if mark[i] ~= f then mark[i] = f; nNow = nNow + 1; now[nNow] = i end
          local v = memo[d]
          if not v then
            -- A see-through cell keeps its alpha and takes the tint in its colour: over the pane beneath, that comes
            -- to exactly what the pane laid over the cell would have.
            if d < A1 then v = mix(d, rgb, a) else local da = floor(d / A1); v = da * A1 + mix(d - da * A1, rgb, a) end
            memo[d] = v
          end
          cur[i] = v
        end
      end
      if first >= n then break end
      i0, i1 = row, row + n - first - 1
    end
  end
end

-- a sprite onto the screen: straight, blended (globalAlpha below 1), or dithered (thresh: skip cells the pattern says to)
local BAYER = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 }
for i = 1, 16 do BAYER[i] = (BAYER[i] + 0.5) / 16 end

local function blit(self, img, dx, dy, thresh)
  local spans = spansOf(img)
  local spx, SW, SH = img.px, img.width, img.height
  dx, dy = floor(dx + self.tx + 0.5), floor(dy + self.ty + 0.5)
  if dx >= W or dy >= H or dx + SW <= 0 or dy + SH <= 0 then return end
  local ga = thresh and 1 or self.globalAlpha
  if ga <= 0.002 then return end
  local plain = ga >= 0.998 and not img.hasAlpha and not thresh
  local bx = Screen.vx or 0
  local f, m = frame, mask
  local r0, r1 = 0, SH - 1
  if dy < 0 then r0 = -dy end
  if dy + r1 >= H then r1 = H - 1 - dy end
  if occOn and r1 >= r0 then markRect(dx < 0 and 0 or dx, dy + r0, dx + SW > W and W - 1 or dx + SW - 1, dy + r1) end
  for r = r0, r1 do
    local list = spans[r]
    if list then
      local sy = dy + r
      local row = ((sy + oy) % H) * W + 1
      local srow = r * SW + 1
      -- the dither pattern belongs to the ground, not the glass: tied to the screen, every cell of every cloud would
      -- change colour each time the camera moved a pixel
      local brow = thresh and ((sy + (Screen.vy or 0)) % 4) * 4 + 1
      for k = 1, #list, 2 do
        local s, e = list[k], list[k + 1]
        local sx0, sx1 = dx + s, dx + e
        if sx0 < 0 then s = s - sx0; sx0 = 0 end
        if sx1 >= W then sx1 = W - 1 end
        if sx1 >= sx0 then
          local n = sx1 - sx0 + 1
          local gx = (sx0 + ox) % W
          local first = W - gx
          if first > n then first = n end
          local i0, cnt, si = row + gx, first, srow + s
          for pass = 1, 2 do
            if plain then
              for j = 0, cnt - 1 do
                local i = i0 + j
                if not (m and m[i]) then
                  if mark[i] ~= f then mark[i] = f; nNow = nNow + 1; now[nNow] = i end
                  cur[i] = spx[si + j]
                end
              end
            else
              for j = 0, cnt - 1 do
                local i = i0 + j
                if not (m and m[i]) and not (thresh and BAYER[brow + (sx0 + bx + (pass == 1 and j or j + first)) % 4] >= thresh) then
                  local v = spx[si + j]
                  if mark[i] ~= f then mark[i] = f; nNow = nNow + 1; now[nNow] = i end
                  if v < A1 then
                    if ga >= 0.998 then cur[i] = v else cur[i] = over(cur[i], v, ga) end
                  else
                    local va = floor(v / A1)
                    cur[i] = over(cur[i], v - va * A1, va / 255 * ga)
                  end
                end
              end
            end
            if first >= n then break end
            i0, cnt, si = row, n - first, si + first
          end
        end
      end
    end
  end
end
function SMeta:drawImage(img, dx, dy) blit(self, img, dx, dy, nil) end
-- smoke: a see-through cloud as a dither instead of a blend, which costs a fraction as much
function SMeta:drawDithered(img, dx, dy, alpha)
  if alpha >= 0.97 then blit(self, img, dx, dy, nil) elseif alpha > 0.03 then blit(self, img, dx, dy, alpha) end
end

-- the ground at one world pixel: the painted level, then scorch marks and footprints
local bgC, trailC, fgC, waterC = nil, nil, nil, nil
local WATER_TINT = 0.35   -- the one see-through thing in a water layer: the wash over a filled-in cell (see gfx.lua)
local viewX, viewY = 0, 0
-- With a ground image (bgC.image, see gfx.lua) there is no ground colour to start from: a cell is nil where only the
-- image shows, and a see-through pixel stays see-through (alpha in the top byte, as in a canvas) for the client to
-- blend over the image.
local function groundAt(wx, wy)
  local v = NIGHT
  if imageMode then v = nil end
  if wx >= 0 and wy >= 0 and wx < bgC.width and wy < bgC.height then
    local b = bgC.px[wy * bgC.width + wx + 1]
    if b ~= nil then
      if b < A1 then v = b else local a = floor(b / A1); v = mix(v, b - a * A1, a / 255) end
    end
    if wx < trailC.width and wy < trailC.height then
      local t = trailC.px[wy * trailC.width + wx + 1]
      if t ~= nil then
        if t < A1 then v = t else local a = floor(t / A1); v = over(v, t - a * A1, a / 255) end
      end
    end
    if waterC and wx < waterC.width and wy < waterC.height then
      local t = waterC.px[wy * waterC.width + wx + 1]
      if t ~= nil then
        if t < A1 then v = t else v = over(v, t % A1, WATER_TINT) end
      end
    end
  end
  return v
end
local function rebase(wx, wy)
  local i = (wy % H) * W + wx % W + 1
  local v = groundAt(wx, wy)
  if fgC then
    local f = fgC.px[(wy - viewY) * W + (wx - viewX) + 1]
    if f ~= nil then v = f < A1 and f or v; maskData[i] = true else maskData[i] = nil end
  end
  local was = base[i]
  if (was == nil) ~= (v == nil) then local t = ttile[i]; baseCnt[t] = baseCnt[t] + (v == nil and -1 or 1) end
  base[i] = v
  if cur[i] ~= v then cur[i] = v end
  nTouched = nTouched + 1; touched[nTouched] = i
end

-- Is there nothing, drawn so far this frame or retained, on the cells under this world rectangle? (Tiles, so "no"
-- sometimes means "nothing, but something near".)
function Screen.clear(wx, wy, w, h)
  local x0, y0 = wx - viewX, wy - viewY
  local x1, y1 = x0 + w - 1, y0 + h - 1
  if x0 < 0 then x0 = 0 end
  if y0 < 0 then y0 = 0 end
  if x1 >= W then x1 = W - 1 end
  if y1 >= H then y1 = H - 1 end
  if x1 < x0 or y1 < y0 then return true end
  local f = frame
  local tx0, tx1 = floor(x0 / TILE), floor(x1 / TILE)
  for ty = floor(y0 / TILE), floor(y1 / TILE) do
    local r = ty * TW + 1
    for tx = tx0, tx1 do if occ[r + tx] == f then return false end end
  end
  tx0, tx1 = floor((x0 + ox) / TILE), floor((x1 + ox) / TILE)
  for ty = floor((y0 + oy) / TILE), floor((y1 + oy) / TILE) do
    local r = (ty % TH) * TW + 1
    for tx = tx0, tx1 do if baseCnt[r + tx % TW] > 0 then return false end end
  end
  return true
end
-- gfx.lua switches the bookkeeping on only while a level has props that ship as images
function Screen.occupancy(on) occOn = on and true or false end

-- ------------------------------------------------------------------------------------------------ sprites

-- The things that move. Painted, a walking adventurer is a dozen cells that change every step and the boss is a
-- thousand. Over a ground image they can instead be textures the client lays under the grid (display.lua):
--   Screen.sprite()      a picture from the units sheet (Art/units.tga, listed in ns.Units), one texture
--   Screen.padSprite()   the boss: any look can be chosen, so it cannot ship as a picture; it gets a block of
--                        one-pixel textures of its own that moves as one piece and is only recoloured when the boss
--                        turns or takes a step in its walk
-- The frame is drawn back to front and the grid lies over every texture, so a sprite "punches": the cells under its
-- solid pixels are emptied, which is what painting it would have overwritten. Whatever is drawn later lands in the
-- grid, on top, as it should. Among themselves the textures are ordered by the client: everything before the boss,
-- the boss, everything after, and within each of the two groups a draw layer one above whatever the sprite overlaps.
local sprites = { n = 0, pad = nil, padX = 0, padY = 0 }
Screen.sprites = sprites
local SPRITE_LAYERS = 64
local zt, ztf, zstamp = {}, {}, 0     -- screen tile → the draw layer the next sprite there must take, and when that was set
for t = 1, TW * TH do zt[t] = 0; ztf[t] = 0 end

-- is anything drawn this frame, or retained, in the tiles that screen columns x0..x1 cross on screen row sy?
local function rowBusy(sy, x0, x1)
  if not occOn then return true end
  local f = frame
  local r = floor(sy / TILE) * TW + 1
  for tx = floor(x0 / TILE), floor(x1 / TILE) do if occ[r + tx] == f then return true end end
  r = floor(((sy + oy) % H) / TILE) * TW + 1
  for tx = floor((x0 + ox) / TILE), floor((x1 + ox) / TILE) do if baseCnt[r + tx % TW] > 0 then return true end end
  return false
end

-- empties the cells under a sprite's solid pixels (spans: the runs in each row, as spansOf makes them)
local function punch(spans, SW, SH, dx, dy)
  local f, m = frame, mask
  local r0, r1 = 0, SH - 1
  if dy < 0 then r0 = -dy end
  if dy + r1 >= H then r1 = H - 1 - dy end
  local X0, X1 = dx < 0 and 0 or dx, dx + SW > W and W - 1 or dx + SW - 1
  local ta, tb, busy = -1, -1, true
  for r = r0, r1 do
    local list = spans[r]
    if list then
      local sy = dy + r
      local gy = (sy + oy) % H
      local a, b = floor(sy / TILE), floor(gy / TILE)
      if a ~= ta or b ~= tb then ta, tb = a, b; busy = rowBusy(sy, X0, X1) end
      if busy then
        local row = gy * W + 1
        for k = 1, #list, 2 do
          local sx0, sx1 = dx + list[k], dx + list[k + 1]
          if sx0 < 0 then sx0 = 0 end
          if sx1 >= W then sx1 = W - 1 end
          if sx1 >= sx0 then
            local n = sx1 - sx0 + 1
            local gx = (sx0 + ox) % W
            local first = W - gx
            if first > n then first = n end
            local i0, i1 = row + gx, row + gx + first - 1
            for pass = 1, 2 do
              for i = i0, i1 do
                if cur[i] ~= nil and not (m and m[i]) then
                  if mark[i] ~= f then mark[i] = f; nNow = nNow + 1; now[nNow] = i end
                  cur[i] = nil
                end
              end
              if first >= n then break end
              i0, i1 = row, row + n - first - 1
            end
          end
        end
      end
    end
  end
end

-- owner: the thing being drawn (its texture is kept for it from frame to frame). e: its picture on the sheet,
-- { u, v, w, h, spans }. wx, wy: where the picture's top left goes in the world. False if it has to be painted.
function Screen.sprite(owner, e, wx, wy)
  if not imageMode then return false end
  local x0, y0 = wx - viewX, wy - viewY
  local x1, y1 = x0 + e.w - 1, y0 + e.h - 1
  if x1 < 0 or y1 < 0 or x0 >= W or y0 >= H then return true end   -- off the screen: nothing to show
  local cx0, cy0, cx1, cy1 = x0 < 0 and 0 or x0, y0 < 0 and 0 or y0, x1 >= W and W - 1 or x1, y1 >= H and H - 1 or y1
  local z, st = 0, zstamp
  local tx0, tx1 = floor(cx0 / TILE), floor(cx1 / TILE)
  local ty0, ty1 = floor(cy0 / TILE), floor(cy1 / TILE)
  for ty = ty0, ty1 do
    local r = ty * TW + 1
    for tx = tx0, tx1 do if ztf[r + tx] == st and zt[r + tx] > z then z = zt[r + tx] end end
  end
  if z >= SPRITE_LAYERS then return false end
  for ty = ty0, ty1 do
    local r = ty * TW + 1
    for tx = tx0, tx1 do ztf[r + tx] = st; zt[r + tx] = z + 1 end
  end
  punch(e.spans, e.w, e.h, x0, y0)
  if occOn then markRect(cx0, cy0, cx1, cy1) end
  local n = sprites.n + 1
  local s = sprites[n]
  if not s then s = {}; sprites[n] = s end
  sprites.n = n
  s.owner, s.e, s.x, s.y, s.z, s.hi = owner, e, wx, wy, z, sprites.pad ~= nil
  return true
end

-- the one big sprite of the frame (the boss), from a canvas of solid pixels. False if it has to be painted.
function Screen.padSprite(img, wx, wy)
  if not imageMode or sprites.pad then return false end
  local spans = spansOf(img)
  if img.hasAlpha then return false end
  local SW, SH = img.width, img.height
  local x0, y0 = wx - viewX, wy - viewY
  if x0 + SW <= 0 or y0 + SH <= 0 or x0 >= W or y0 >= H then return true end
  punch(spans, SW, SH, x0, y0)
  if occOn then markRect(x0 < 0 and 0 or x0, y0 < 0 and 0 or y0, x0 + SW > W and W - 1 or x0 + SW - 1, y0 + SH > H and H - 1 or y0 + SH - 1) end
  sprites.pad, sprites.padX, sprites.padY = img, wx, wy
  zstamp = zstamp + 1   -- what comes after is in a group of its own, over the boss
  return true
end

-- ------------------------------------------------------------------------------------------------ the HUD layer

-- The HUD stays put on the screen while the grid's cells belong to the ground: every pixel the camera moves, each
-- edge of each letter and bar lands on different cells, and they all have to be recoloured. Over a ground image the
-- HUD is drawn on a layer of its own instead, addressed by screen position, which the display shows with textures
-- of its own on top of the grid: a HUD that says the same thing as last frame costs nothing. Between hudBegin and
-- hudEnd every drawing call lands there, by pointing the Screen's working tables at the layer's.
-- There are two such layers: 1 is the HUD, 2 the cursor over it. Drawing the HUD is a third of a frame's drawing,
-- and nobody reads a score sixty times a second, so the renderer asks hudDue() first: with Screen.hudEvery = 3 the
-- HUD is drawn on one frame in three and its layer simply stays as it is on the others. The cursor is every frame.
local function newLayer()
  return { cur = {}, mark = {}, now = {}, nNow = 0, prev = {}, nPrev = 0, shown = {}, drawn = false, kept = false, live = false, all = false, age = 0 }
end
local layers = { newLayer(), newLayer() }
local hud = nil       -- the layer being drawn on
local world = {}
Screen.hudEvery = 1
-- should the HUD be drawn this frame? (Always, when it goes into the grid.)
function Screen.hudDue()
  if not imageMode then return true end
  local L = layers[1]
  L.age = L.age + 1
  if L.age >= Screen.hudEvery or not L.live then L.age = 0; return true end
  L.kept = true
  return false
end
function Screen.hudBegin(k)
  if not imageMode or inHud then return end
  local L = layers[k or 1]
  hud = L
  world.cur, world.mark, world.now, world.nNow, world.ox, world.oy, world.mask, world.occ = cur, mark, now, nNow, ox, oy, mask, occOn
  -- wipe what the layer held
  local c, list = L.cur, L.now
  for i = 1, L.nNow do c[list[i]] = nil end
  L.prev, L.now = L.now, L.prev
  L.nPrev = L.nNow
  cur, mark, now, nNow, ox, oy, mask, occOn = c, L.mark, L.now, 0, 0, 0, nil, false
  inHud, L.drawn, L.live = true, true, true
end
function Screen.hudEnd()
  if not inHud then return end
  hud.nNow = nNow
  cur, mark, now, nNow, ox, oy, mask, occOn = world.cur, world.mark, world.now, world.nNow, world.ox, world.oy, world.mask, world.occ
  inHud = false
end
-- Ends a layer's frame: set(cell, value) for every cell of it that is not what the display shows (the cell is its
-- place on the screen in reading order; the value is nil, a colour, or a colour with an alpha above it).
function Screen.presentHud(k, set)
  local L = layers[k]
  if not L.drawn and not L.kept and L.live then
    -- a frame without it: whatever the layer still holds goes
    local c, list = L.cur, L.now
    for i = 1, L.nNow do c[list[i]] = nil end
    L.prev, L.now = L.now, L.prev
    L.nPrev, L.nNow = L.nNow, 0
    L.live, L.drawn = false, true
  end
  local c, shownL, n = L.cur, L.shown, 0
  if L.all then
    L.all = false
    for i = 1, W * H do
      local v = c[i]
      if shownL[i] ~= v then shownL[i] = v; n = n + 1; if set then set(i, v) end end
    end
    return n
  end
  if not L.drawn then return 0 end   -- kept, or empty: nothing has changed
  for pass = 1, 2 do
    local list, cnt = L.prev, L.nPrev
    if pass == 2 then list, cnt = L.now, L.nNow end
    for i = 1, cnt do
      local at = list[i]
      local v = c[at]
      if shownL[at] ~= v then shownL[at] = v; n = n + 1; if set then set(at, v) end end
    end
  end
  return n
end
-- a layer in reading order, for the tests
function Screen.snapshotHud(k)
  local out, c = {}, layers[k].cur
  for i = 1, W * H do out[i] = c[i] end
  return out
end

local lastBg, lastTrail, lastFg, lastWater = nil, nil, nil, nil
-- A frame that was drawn but never shown (the one painted behind a loading screen) leaves the display out of step
-- with the lists of what changed, so the next frame to be shown sends every cell.
local sendAll, unshown = false, false
local function newFrame()
  if inHud then Screen.hudEnd() end
  for k = 1, 2 do layers[k].drawn, layers[k].kept = false, false end
  frame = frame + 1
  Screen.panes.n = 0
  sprites.n, sprites.pad = 0, nil
  zstamp = zstamp + 1
  nTouched = 0
  if unshown then sendAll = true; layers[1].all, layers[2].all = true, true end
  unshown = true
end

-- Starts a frame: brings the ground layer up to date for this camera, then wipes last frame's drawing back to ground.
-- fg (a screen-sized canopy) is folded into the ground too, and until maskOff() nothing is drawn over it.
-- water (RT.host.waterLayer) is the level's still water, which lies over the footprints.
function Screen.begin(bg, trail, vx, vy, fg, water)
  newFrame()
  if not trail.log then trail.log = {} end
  water = water or nil
  local full = bg ~= lastBg or trail ~= lastTrail or fg ~= lastFg or water ~= lastWater or trail.logAll
  if not full and (math.abs(vx - viewX) >= W or math.abs(vy - viewY) >= H) then full = true end
  bgC, trailC, fgC, waterC = bg, trail, fg or nil, water
  imageMode = bg.image ~= nil
  Screen.ground = bg.image or nil
  local px, py = viewX, viewY
  viewX, viewY = vx, vy
  ox, oy = vx % W, vy % H
  if full then
    for wy = vy, vy + H - 1 do for wx = vx, vx + W - 1 do rebase(wx, wy) end end
  else
    -- the strip that scrolled into view
    if vx > px then for wx = px + W, vx + W - 1 do for wy = vy, vy + H - 1 do rebase(wx, wy) end end
    elseif vx < px then for wx = vx, px - 1 do for wy = vy, vy + H - 1 do rebase(wx, wy) end end end
    if vy > py then for wy = py + H, vy + H - 1 do for wx = vx, vx + W - 1 do rebase(wx, wy) end end
    elseif vy < py then for wy = vy, py - 1 do for wx = vx, vx + W - 1 do rebase(wx, wy) end end end
    -- fresh footprints and scorch marks
    local log = trail.log
    for k = 1, #log do
      local r = log[k]
      local x0, y0, x1, y1 = max(r[1], vx), max(r[2], vy), min(r[3], vx + W - 1), min(r[4], vy + H - 1)
      for wy = y0, y1 do for wx = x0, x1 do rebase(wx, wy) end end
    end
    -- water that was filled in
    if water then
      local wlog = water.log
      for k = 1, #wlog do
        local r = wlog[k]
        local x0, y0, x1, y1 = max(r[1], vx), max(r[2], vy), min(r[3], vx + W - 1), min(r[4], vy + H - 1)
        for wy = y0, y1 do for wx = x0, x1 do rebase(wx, wy) end end
      end
    end
  end
  if water and #water.log > 0 then water.log = {} end
  trail.log, trail.logAll = {}, nil
  lastBg, lastTrail, lastFg, lastWater = bg, trail, fg, water
  -- back to bare ground wherever something was drawn last frame
  for k = 1, nNow do local i = now[k]; cur[i] = base[i] end
  prev, now = now, prev
  nPrev, nNow = nNow, 0
  mask = fg and maskData or nil
  SCtx.tx, SCtx.ty, SCtx.globalAlpha = 0, 0, 1
  Screen.ox, Screen.oy, Screen.vx, Screen.vy = ox, oy, vx, vy
end
function Screen.maskOff() mask = nil end
-- another frame over the same ground, with nothing about the ground to work out
function Screen.again()
  newFrame()
  for k = 1, nNow do local i = now[k]; cur[i] = base[i] end
  prev, now = now, prev
  nPrev, nNow = nNow, 0
  SCtx.tx, SCtx.ty, SCtx.globalAlpha = 0, 0, 1
end

-- A frame with no level under it (the menu, the ending card): everything is cleared to one colour first.
function Screen.beginPlain(rgb)
  newFrame()
  for i = 1, W * H do
    if base[i] ~= rgb or cur[i] ~= rgb then
      if base[i] == nil then local t = ttile[i]; baseCnt[t] = baseCnt[t] + 1 end
      base[i] = rgb; cur[i] = rgb; nTouched = nTouched + 1; touched[nTouched] = i
    end
  end
  nPrev, nNow = 0, 0
  mask = nil
  lastBg, waterC = nil, nil
  imageMode, Screen.ground, Screen.props = false, nil, nil
  ox, oy, viewX, viewY = 0, 0, 0, 0
  SCtx.tx, SCtx.ty, SCtx.globalAlpha = 0, 0, 1
  Screen.ox, Screen.oy, Screen.vx, Screen.vy, Screen.shakeX, Screen.shakeY = 0, 0, 0, 0, 0, 0
end

-- Ends a frame: calls set(cell, rgb) for every cell whose colour is not what the display shows. Returns how many.
function Screen.present(set)
  local n = 0
  unshown = false
  if sendAll then
    sendAll = false
    for i = 1, W * H do
      local v = cur[i]
      shown[i] = v
      n = n + 1
      if set then set(i, v) end
    end
    return n
  end
  for pass = 1, 3 do
    local list, cnt = touched, nTouched
    if pass == 2 then list, cnt = prev, nPrev elseif pass == 3 then list, cnt = now, nNow end
    local f = pass == 2 and frame or nil
    for k = 1, cnt do
      local i = list[k]
      -- a cell drawn last frame and this one (most of the HUD) is looked at once, in the third pass
      if mark[i] ~= f then
        local v = cur[i]
        if shown[i] ~= v then
          shown[i] = v
          n = n + 1
          if set then set(i, v) end
        end
      end
    end
  end
  return n
end
-- forget what the display shows (after the textures were rebuilt): the next present() sends every cell
function Screen.invalidate() sendAll = true end
-- the frame in reading order, for the tests' screenshots
function Screen.snapshot()
  local out = {}
  for sy = 0, H - 1 do
    local row = ((sy + oy) % H) * W + 1
    for sx = 0, W - 1 do out[sy * W + sx + 1] = cur[row + (sx + ox) % W] end
  end
  return out
end
Screen.W, Screen.H = W, H

-- ------------------------------------------------------------------------------------------------ fast paths

-- art.js's hash(), the noise behind most of the pixel art, without the general-purpose integer helpers
do
  local bit = bit or ns.bit
  local bxor, rshift = bit.bxor, bit.rshift
  local P32 = 4294967296
  local function int(x)
    if x < 0 then x = math.ceil(x) else x = floor(x) end
    return x % P32
  end
  local function mulc(a, ch, cl)
    local ah = floor(a / 65536)
    local al = a - ah * 65536
    return (al * cl + ((ah * cl + al * ch) % 65536) * 65536) % P32
  end
  local C1, C2, C3 = 374761393, 668265263, 1274126177
  local C1H, C1L, C2H, C2L, C3H, C3L = floor(C1 / 65536), C1 % 65536, floor(C2 / 65536), C2 % 65536, floor(C3 / 65536), C3 % 65536
  local calls = 0
  function RT.hash(x, y)
    calls = calls + 1
    if calls >= 800 then calls = 0; RT.breathe() end
    local h = (mulc(int(x), C1H, C1L) + mulc(int(y), C2H, C2L)) % P32
    h = mulc(bxor(h, rshift(h, 13)) % P32, C3H, C3L)
    return (bxor(h, rshift(h, 16)) % P32) / P32
  end
end
