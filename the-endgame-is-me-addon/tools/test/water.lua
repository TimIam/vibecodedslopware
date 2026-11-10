-- The water is drawn a different way from the browser game (a retained layer plus glints, see src/gfx.lua). This
-- draws the levels that have water both ways, the game's own loop written out below and the addon's, before and
-- after rubble is tipped in, and fails on any pixel that differs.
--   lua5.1 tools/test/water.lua
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W, Rm = RT.modules.world, RT.modules.render
local floor, hash = math.floor, RT.hash
local function orig(ctx, g)
  local w = g.water; local cs, fr = w.cs, floor(g.t * 3)
  local vx, vy = RT.Screen.vx, RT.Screen.vy
  local c0, c1 = math.max(0, floor(vx / cs)), math.min(w.cols - 1, math.ceil((vx + 320) / cs))
  local r0, r1 = math.max(0, floor(vy / cs)), math.min(w.rows - 1, math.ceil((vy + 180) / cs))
  local cols = { "#6b6c63", "#55564f", "#7a5a3a", "#8f8f84", "#5a3d29", "#3f403a" }
  for r = r0, r1 do for c = c0, c1 do
    local v = w.a[r * w.cols + c]
    if v ~= 0 then
      local x, y = c * cs, r * cs
      if v == 1 then
        ctx.fillStyle = ((c + r) % 2 == 1) and "#2a4a5e" or "#2e5266"; ctx:fillRect(x, y, cs, cs)
        if hash(c + fr, r) > 0.8 then ctx.fillStyle = "#5f8ea6"; ctx:fillRect(x + floor(hash(c, r + fr) * cs), y + floor(hash(r, c) * cs), 2, 1) end
        if r > 0 and w.a[(r - 1) * w.cols + c] == 0 then ctx.fillStyle = "#16262e"; ctx:fillRect(x, y, cs, 1) end
      else
        for k = 0, 5 do ctx.fillStyle = cols[floor(hash(c * 7 + k, r) * 6) + 1]; ctx:fillRect(x + floor(hash(k, c + r * 31) * (cs - 1)), y + floor(hash(c, k + r) * (cs - 1)), 2, 2) end
        ctx.fillStyle = "rgba(30,40,46,.35)"; ctx:fillRect(x, y, cs, cs)
      end
    end
  end end
end
local newDraw, newLayer = Rm.drawWater, RT.host.waterLayer
for level = 5, 7 do
Rm.drawWater, RT.host.waterLayer = newDraw, newLayer
local R = Rm.createRenderer()
local g = W.createGame(3)
W.jumpToLevel(g, level)
-- somewhere the moat is on the screen
local w0 = g.water
for r = 0, w0.rows - 1 do if w0.a[r * w0.cols + 3] == 1 then g.cam.y = math.max(0, math.min(g.map.h - 180, r * w0.cs - 90)); break end end
for i = 1, 3 do R.render(g, {}); RT.Screen.present(nil) end
-- fill some water the camera can see, after it has been shown, and look again
local P, w, filled = RT.modules.props, g.water, 0
local before = RT.Screen.snapshot()
for r = 0, w.rows - 1 do for c = 0, w.cols - 1 do
  local x, y = c * w.cs + 2, r * w.cs + 2
  if w.a[r * w.cols + c] == 1 and x > RT.Screen.vx and x < RT.Screen.vx + 320 and y > RT.Screen.vy and y < RT.Screen.vy + 180 and (c * 7 + r * 3) % 23 == 0 then
    P.fillWater(g, x, y, 1 + c % 3); filled = filled + 1
  end
end end
for i = 1, 2 do R.render(g, {}); RT.Screen.present(nil) end
local A = RT.Screen.snapshot()
local moved = 0
for i = 1, #A do if A[i] ~= before[i] then moved = moved + 1 end end
assert(filled > 0 and moved > 0, "level " .. level .. ": no water on the screen to fill")
Rm.drawWater = orig; RT.host.waterLayer = function() return nil end
for i = 1, 3 do R.render(g, {}); RT.Screen.present(nil) end
local B = RT.Screen.snapshot()
local n = 0
for i = 1, #A do if A[i] ~= B[i] then n = n + 1; if n < 12 then
  local x, y = (i - 1) % 320, floor((i - 1) / 320)
  local cs = g.water.cs; local c, r = floor(x / cs), floor(y / cs)
  print(string.format("x %d y %d new %06x orig %06x  cell %d,%d v=%d right=%d above=%d  inx %d iny %d", x, y, A[i], B[i], c, r, g.water.a[r * g.water.cols + c], g.water.a[r * g.water.cols + c + 1], r > 0 and g.water.a[(r-1) * g.water.cols + c] or -1, x % cs, y % cs))
end end end
assert(n == 0, "level " .. level .. ": " .. n .. " pixels of water differ from the game's own drawing")
print(string.format("level %d: water identical to the game's own drawing, with %d places filled in (%d pixels changed)", level, filled, moved))
end
