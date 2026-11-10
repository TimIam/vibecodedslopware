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
    if #log >= 96 then cv.logAll = true else log[#log + 1] = { x0, y0, x1, y1 } end
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
local ox, oy = 0, 0                      -- the camera, modulo the screen
for i = 1, W * H do cur[i] = NIGHT; shown[i] = -1; base[i] = NIGHT; mark[i] = 0 end

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
            local v = memo[d]
            if not v then v = mix(d, rgb, a); memo[d] = v end
            cur[i] = v
          end
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
  local f, m = frame, mask
  local r0, r1 = 0, SH - 1
  if dy < 0 then r0 = -dy end
  if dy + r1 >= H then r1 = H - 1 - dy end
  for r = r0, r1 do
    local list = spans[r]
    if list then
      local sy = dy + r
      local row = ((sy + oy) % H) * W + 1
      local srow = r * SW + 1
      local brow = thresh and (sy % 4) * 4 + 1
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
                if not (m and m[i]) and not (thresh and BAYER[brow + (sx0 + (pass == 1 and j or j + first)) % 4] >= thresh) then
                  local v = spx[si + j]
                  if mark[i] ~= f then mark[i] = f; nNow = nNow + 1; now[nNow] = i end
                  if v < A1 then
                    if ga >= 0.998 then cur[i] = v else cur[i] = mix(cur[i], v, ga) end
                  else
                    local va = floor(v / A1)
                    cur[i] = mix(cur[i], v - va * A1, va / 255 * ga)
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
local function groundAt(wx, wy)
  local v = NIGHT
  if wx >= 0 and wy >= 0 and wx < bgC.width and wy < bgC.height then
    local b = bgC.px[wy * bgC.width + wx + 1]
    if b ~= nil then
      if b < A1 then v = b else local a = floor(b / A1); v = mix(v, b - a * A1, a / 255) end
    end
    if wx < trailC.width and wy < trailC.height then
      local t = trailC.px[wy * trailC.width + wx + 1]
      if t ~= nil then
        if t < A1 then v = t else local a = floor(t / A1); v = mix(v, t - a * A1, a / 255) end
      end
    end
    if waterC and wx < waterC.width and wy < waterC.height then
      local t = waterC.px[wy * waterC.width + wx + 1]
      if t ~= nil then
        if t < A1 then v = t else v = mix(v, t % A1, WATER_TINT) end
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
  base[i] = v
  if cur[i] ~= v then cur[i] = v end
  nTouched = nTouched + 1; touched[nTouched] = i
end

local lastBg, lastTrail, lastFg, lastWater = nil, nil, nil, nil
-- A frame that was drawn but never shown (the one painted behind a loading screen) leaves the display out of step
-- with the lists of what changed, so the next frame to be shown sends every cell.
local sendAll, unshown = false, false
local function newFrame()
  frame = frame + 1
  nTouched = 0
  if unshown then sendAll = true end
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
    if base[i] ~= rgb or cur[i] ~= rgb then base[i] = rgb; cur[i] = rgb; nTouched = nTouched + 1; touched[nTouched] = i end
  end
  nPrev, nNow = 0, 0
  mask = nil
  lastBg, waterC = nil, nil
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
    for k = 1, cnt do
      local i = list[k]
      local v = cur[i]
      if shown[i] ~= v then
        shown[i] = v
        n = n + 1
        if set then set(i, v) end
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
