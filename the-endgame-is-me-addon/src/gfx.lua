-- The Endgame is Me: hand-tuned stand-ins for a few of the game's drawing helpers, loaded straight after the
-- transpiled art module and before anything that captures its functions.

local ADDON, ns = ...
local RT = ns.RT
local art = RT.modules.art
local floor, upper, sub = math.floor, string.upper, string.sub

-- drawText paints one 1×1 rectangle per lit pixel of every letter, twice over for the shadow. On the screen that is
-- thousands of calls a frame for the HUD alone, so each letter (in each colour, size and shadow) is painted once into
-- a tiny sprite and stamped from then on. Anything drawn elsewhere still goes through the original.
local slow = art.drawText
local glyphs = {}
local screen = RT.Screen:getContext()
local PAL = art.PAL

art.drawText = function(ctx, s, x, y, col, o)
  if ctx ~= screen then return slow(ctx, s, x, y, col, o) end
  local scale, align, shadow, alpha = 1, "left", true, 1
  if o then
    if o.scale ~= nil then scale = o.scale end
    if o.align ~= nil then align = o.align end
    if o.shadow ~= nil then shadow = o.shadow end
    if o.alpha ~= nil then alpha = o.alpha end
  end
  if alpha <= 0 then return end
  s = upper(RT.str(s))
  local n = #s
  if n == 0 then return end
  local w = (n * 4 - 1) * scale
  local x0 = floor((align == "center" and x - w / 2 or align == "right" and x - w or x) + 0.5)
  local y0 = floor(y + 0.5)
  col = PAL[col] or col
  local set = glyphs[col]
  if not set then set = {}; glyphs[col] = set end
  local kind = scale * 2 + (shadow and 1 or 0)
  for i = 1, n do
    local ch = sub(s, i, i)
    if ch ~= " " then
      local key = ch .. kind
      local g = set[key]
      if not g then
        g = RT.newCanvas(4 * scale, 6 * scale)
        slow(g:getContext(), ch, 0, 0, col, { scale = scale, shadow = shadow })
        set[key] = g
      end
      ctx.globalAlpha = alpha
      ctx:drawImage(g, x0 + (i - 1) * 4 * scale, y0)
    end
  end
  ctx.globalAlpha = 1
end

-- The boss is 32 headings x 4 walk frames x mouth open or shut, each sprite a few thousand evaluations of the shape
-- function: about 25 ms apiece in this Lua. Painted on demand they would stutter every time the boss turned. So
-- during play nothing is painted on the spot: a missing sprite borrows the nearest heading that exists, and the host
-- paints the rest in the background (RT.prefillBoss), a couple of milliseconds a frame.
--   RT.spriteBudget > 0   a frame may paint (the Appearance preview)
--   RT.yieldAt set        we are inside a background slice, so paint
--   RT.fillSheets         gameplay is drawing: the sheet it asks for is the one the background should finish
RT.spriteBudget = 0
RT.fillSheets = false
local makeSheet = art.makeBossSprites
local current = nil
art.makeBossSprites = function(lookTable)
  local sheet = makeSheet(lookTable)
  local get = sheet.get
  local have = {}
  local count = 0
  local function paint(dir, idx)
    local s = get(dir, idx)
    local k = dir * 8 + idx
    if not have[k] then have[k] = true; count = count + 1 end
    return s
  end
  sheet.get = function(dir, idx)
    if RT.fillSheets then current = sheet end
    if have[dir * 8 + idx] then return get(dir, idx) end
    if RT.yieldAt == nil and RT.spriteBudget <= 0 and count > 0 then
      for d = 1, 16 do
        local a, b = (dir + d) % 32, (dir - d) % 32
        if have[a * 8 + idx] then return get(a, idx) end
        if have[b * 8 + idx] then return get(b, idx) end
      end
      for i = 0, 7 do if have[dir * 8 + i] then return get(dir, i) end end
    end
    local t0 = RT.perfNow()
    local s = paint(dir, idx)
    RT.spriteBudget = RT.spriteBudget - (RT.perfNow() - t0)
    return s
  end
  -- paints up to n sprites that are still missing (standing frames first); returns how many are left after that
  sheet.prefill = function(n, standingOnly)
    for idx = 0, standingOnly and 0 or 7 do
      for dir = 0, 31 do
        if not have[dir * 8 + idx] then
          if n <= 0 then return 256 - count end
          paint(dir, idx)
          n = n - 1
        end
      end
    end
    return standingOnly and 0 or 256 - count
  end
  return sheet
end
function RT.prefillBoss(n, standingOnly)
  if not current then return 0 end
  return current.prefill(n, standingOnly)
end

-- ------------------------------------------------------------------------------------------------ water

-- The game repaints every square of water every frame: two fills and three hashes a square, a millisecond and a half
-- on the levels that have a moat. Only the glints move. So the water itself is a layer of the retained ground
-- (Screen.begin takes it), painted a square at a time as squares come into view or get filled with rubble, and what
-- is drawn each frame is the glints. Pixel for pixel what render.js's drawWater makes.
local hash, mix = RT.hash, RT.mix
local A1 = 16777216
local WATER = { [0] = 0x2e5266, [1] = 0x2a4a5e }
local LIP, GLINT, WASH = 0x16262e, "#5f8ea6", 0x1e282e
local GLINT_WASHED = string.format("#%06x", mix(0x5f8ea6, WASH, 0.35))
local RUBBLE = { [0] = 0x6b6c63, 0x55564f, 0x7a5a3a, 0x8f8f84, 0x5a3d29, 0x3f403a }
local layers = setmetatable({}, { __mode = "k" })   -- a level's water → its layer

local function paintCell(L, w, c, r, v)
  local cs, CW, px = w.cs, L.width, L.px
  local x, y = c * cs, r * cs
  if v == 1 then
    local col = WATER[(c + r) % 2]
    for yy = y, y + cs - 1 do local row = yy * CW + 1; for xx = x, x + cs - 1 do px[row + xx] = col end end
    -- a dark lip where water meets land
    if r > 0 and w.a[(r - 1) * w.cols + c] == 0 then local row = y * CW + 1; for xx = x, x + cs - 1 do px[row + xx] = LIP end end
  elseif v == 0 then
    for yy = y, y + cs - 1 do local row = yy * CW + 1; for xx = x, x + cs - 1 do px[row + xx] = nil end end
  else
    -- filled in: six lumps of rubble under a wash. The wash alone is a see-through pixel, flagged by A1.
    for yy = y, y + cs - 1 do local row = yy * CW + 1; for xx = x, x + cs - 1 do px[row + xx] = A1 + WASH end end
    for k = 0, 5 do
      local col = mix(RUBBLE[floor(hash(c * 7 + k, r) * 6)], WASH, 0.35)
      local dx, dy = x + floor(hash(k, c + r * 31) * (cs - 1)), y + floor(hash(c, k + r) * (cs - 1))
      for yy = dy, dy + 1 do for xx = dx, dx + 1 do
        if xx < CW and yy < L.height then px[yy * CW + xx + 1] = col end
      end end
    end
  end
end

local function cellRange(w, vx, vy)
  local cs = w.cs
  local c0, c1 = math.max(0, floor(vx / cs)), math.min(w.cols - 1, math.ceil((vx + 320) / cs))
  local r0, r1 = math.max(0, floor(vy / cs)), math.min(w.rows - 1, math.ceil((vy + 180) / cs))
  return c0, c1, r0, r1
end

-- the layer for this game's water with every square the camera can see up to date; nil on a dry level
RT.host.waterLayer = function(g, vx, vy)
  local w = g.water
  if not w then return nil end
  local L = layers[w]
  if not L then
    L = { width = w.cols * w.cs, height = w.rows * w.cs, px = {}, log = {}, seen = {} }
    layers[w] = L
  end
  local a, cols, cs, seen = w.a, w.cols, w.cs, L.seen
  local c0, c1, r0, r1 = cellRange(w, vx, vy)
  for r = r0, r1 do
    local base = r * cols
    for c = c0, c1 do
      local v = a[base + c]
      local was = seen[base + c]
      if was ~= v then
        seen[base + c] = v
        paintCell(L, w, c, r, v)
        -- a square never seen before is about to be worked into the ground anyway; one that changed has to be said
        if was ~= nil then L.log[#L.log + 1] = { c * cs, r * cs, c * cs + cs - 1, r * cs + cs - 1 } end
      end
    end
  end
  return L
end

-- the glints: one square in five has one, somewhere new three times a second
local glintFor, glintFr, glints = nil, nil, nil
function RT.drawWater(ctx, g)
  local w = g.water
  local a, cols, cs = w.a, w.cols, w.cs
  local fr = floor(g.t * 3)
  if glintFor ~= w or glintFr ~= fr then glintFor, glintFr, glints = w, fr, {} end
  local c0, c1, r0, r1 = cellRange(w, RT.Screen.vx, RT.Screen.vy)
  local list = glints
  for r = r0, r1 do
    local base = r * cols
    for c = c0, c1 do
      if a[base + c] == 1 then
        local at = list[base + c]
        if at == nil then
          at = hash(c + fr, r) > 0.8 and (c * cs + floor(hash(c, r + fr) * cs)) * 4096 + r * cs + floor(hash(r, c) * cs)
          list[base + c] = at
        end
        if at then
          -- The game paints a square's glint before its lip and before the square to its right, so the lip hides a
          -- glint on the top row, and the pixel that hangs over into the next square shows only if that is land.
          local gx, gy = floor(at / 4096), at % 4096
          local lip = gy == r * cs and r > 0 and a[base - cols + c] == 0
          local first = not lip
          local second = first
          local washed = false
          if gx + 1 >= c * cs + cs then
            local nb = c + 1 < cols and a[base + c + 1] or 0
            second = nb == 0
            -- into a filled-in square it shows through the wash, unless a lump of rubble is in the way
            if nb == 2 then
              local L = layers[w]
              local v = L and L.px[gy * L.width + gx + 2]
              washed = v ~= nil and v >= A1
            end
          end
          if first or second then
            ctx.fillStyle = GLINT
            ctx:fillRect(first and gx or gx + 1, gy, (first and second) and 2 or 1, 1)
          end
          if washed then ctx.fillStyle = GLINT_WASHED; ctx:fillRect(gx + 1, gy, 1, 1) end
        end
      end
    end
  end
end

-- ------------------------------------------------------------------------------------------------ telegraphs and fires

-- The arc an attack is about to cover, and the fires, are worked out a pixel at a time, every frame. Translated code
-- pays for each of JavaScript's habits on every pixel (a missing number is NaN, every Math call is a lookup), so
-- these two loops are written by hand. Same arithmetic in the same order: the pictures are identical.
local sqrt, atan2, fmod, abs, pi = math.sqrt, math.atan2, math.fmod, math.abs, math.pi
local TAU = pi * 2

-- render.js drawTelegraph's loop: a stomp's disc, or a swipe's or breath's wedge (wedge = true)
RT.host.teleArc = function(ctx, bx, by, R, x0, x1, y0, y1, wedge, half, face, prog, blink, channel)
  local far, near = R * R * 1.0001, 64 * 0.9999   -- well outside or well inside: no need for the square root
  local edgeA = channel and 0.35 or 0.85
  local onA, offA = channel and 0.12 or 0.42, channel and 0.04 or 0.16
  local reach = 8 + (R - 8) * prog
  local fill = ctx.fillRect
  for py = y0, y1 do
    local dy = py + 0.5 - by
    local dy2 = dy * dy
    for px = x0, x1 do
      local dx = px + 0.5 - bx
      local d2 = dx * dx + dy2
      if d2 <= far and d2 >= near then
        local dist = sqrt(d2)
        if not (dist > R or dist < 8) then
          local edge = dist > R - 1
          local show = true
          if wedge then
            local d = fmod(atan2(dy, dx) - face, TAU)
            if d > pi then d = d - TAU end
            if d < -pi then d = d + TAU end
            local ad = abs(d)
            if ad > half then show = false
            elseif (half - ad) * dist < 1 then edge = true end
          end
          if show then
            local al
            if edge then al = edgeA
            elseif dist < reach then al = ((px + py + blink) % 2 == 1) and onA or offA
            else al = ((px + py) % 2 == 1) and 0.12 or 0 end
            if al ~= 0 then
              ctx.globalAlpha = al
              fill(ctx, px, py, 1, 1)
            end
          end
        end
      end
    end
  end
end

-- Light effects (RT.lean). What costs most in a busy scene is whatever repaints a wide area many times a second: the
-- attack telegraph's fill blinks 10 to 24 times a second over a thousand cells, and every fire reshuffles ten times
-- a second, and the panel behind the HUD is 7,500 blended cells every frame. With this on the telegraph holds
-- still, fires flicker half as often and the HUD has no panel. app.lua switches it on for the
-- rest of a level when frames get slow (/endgame effects).
RT.lean = false
RT.host.lean = function() return RT.lean end
local FIRE = { PAL.fire0, PAL.fire1, PAL.fire2, PAL.fire3 }
-- render.js drawFires. The flicker is a hash of where and when, and "when" moves ten times a second, so a fire's
-- pixels are worked out once per flicker and drawn from the list on the frames between (while it is not fading).
local firePx = setmetatable({}, { __mode = "k" })   -- a fire → { fr, fade, cx, cy, r, n, x, y, colour, ... }
function RT.drawFires(ctx, g)
  local fr = floor(g.t * 10)
  if RT.lean then fr = fr - fr % 2 end   -- light effects: the flicker changes five times a second, not ten
  local fires = g.fires
  local fill = ctx.fillRect
  local vx, vy = RT.Screen.vx, RT.Screen.vy
  for i = 0, fires.length - 1 do
    local f = fires[i]
    local fade
    if f.t < 0.25 then fade = f.t / 0.25
    elseif f.t > f.life - 1.2 then fade = math.max(0, (f.life - f.t) / 1.2)
    else fade = 1 end
    local r = f.r
    local R = math.ceil(r)
    local cx, cy = floor(f.x + 0.5), floor(f.y + 0.5)
    -- one that is wholly off the screen draws nothing
    if cx + R >= vx and cx - R < vx + 320 and cy + R >= vy and cy - R < vy + 180 then
      local c = firePx[f]
      if not c then c = {}; firePx[f] = c end
      if c[1] ~= fr or c[2] ~= fade or c[3] ~= cx or c[4] ~= cy or c[5] ~= r then
        c[1], c[2], c[3], c[4], c[5] = fr, fade, cx, cy, r
        local n = 6
        local k = 0.45 * (2 - fade)
        for py = -R, R do
          local wy = cy + py
          local hy = wy * 13 + fr
          for px = -R, R do
            local d = sqrt(px * px + py * py) / r
            if not (d > 1) then
              local wx = cx + px
              local h = hash(wx * 7 + fr * 31, hy)
              if not (h < 0.15 + d * k) then
                c[n + 1], c[n + 2], c[n + 3] = wx, wy, (d < 0.35 and h > 0.6) and 4 or d < 0.6 and 3 or h > 0.7 and 2 or 1
                n = n + 3
              end
            end
          end
        end
        c[6] = n
      end
      ctx.globalAlpha = fade
      for j = 7, c[6], 3 do
        ctx.fillStyle = FIRE[c[j + 2]]
        fill(ctx, c[j], c[j + 1], 1, 1)
      end
    end
  end
  ctx.globalAlpha = 1
end

-- ------------------------------------------------------------------------------------------------ ground images

-- Painting a level's ground in Lua took seconds, and then every bare pixel of it was one of the 57,600 textures. A
-- level's ground now ships as an image (Art/ground_N.tga, made by tools/bake-ground.lua and listed in ns.Ground by
-- the build): the client draws it as one texture under the grid, and the grid only shows the cells that have
-- something on them. For the image to match, the level must be laid out exactly as it was when the image was made,
-- so such a level is built from the image's seed instead of the run's (the patches to world.js in tools/build.mjs).
--   RT.fixedLayouts   on in the addon; off under the tests that compare with the browser game, which has no such thing
--   RT.groundImages   off: lay levels out the fixed way but paint the ground in Lua as before (/endgame ground off)
RT.fixedLayouts, RT.groundImages = false, true
local function baked(n) return RT.fixedLayouts and ns.Ground and ns.Ground[n] or nil end
RT.host.layoutRng = function(n)
  local G = baked(n)
  return G and RT.mulberry32(G.seed) or nil
end
RT.host.layoutSeed = function(n) local G = baked(n); return G and G.seed or nil end
local NOPX = {}
-- what the renderer hands the Screen in place of a painted ground: its size and which file it is
RT.host.groundImage = function(m)
  local G = baked(m.n)
  if not (G and G.file and RT.groundImages) or m.plain or m.layout ~= G.seed then return nil end
  return { image = G, width = G.w, height = G.h, px = NOPX }
end
