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
