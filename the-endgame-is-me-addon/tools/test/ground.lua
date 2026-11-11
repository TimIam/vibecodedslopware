-- A level whose ground and props ship as images is drawn differently: neither is painted, the client puts the ground
-- image under the grid and a texture for each untouched prop over that, and a cell holds nil (the images show), a
-- colour, or a colour with an alpha for the client to blend. This plays every level twice with the same seed and
-- inputs, once painting everything the old way and once over the images, builds the second picture as the client
-- would (the ground file's pixels, then the prop textures the game asked for from the sheet file, back to front,
-- then the cells), and compares the two.
-- Blending in two steps rounds differently from blending in one, so a channel may be off by a couple of levels.
--   lua5.1 tools/test/ground.lua [steps] [tolerance]        (after tools/bake-art.lua and a build)
local steps, tol = tonumber(arg[1] or 900), tonumber(arg[2] or 3)
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
assert(loadfile("TheEndgameIsMe/ground.lua"))("TheEndgameIsMe", ns)
assert(loadfile("TheEndgameIsMe/props.lua"))("TheEndgameIsMe", ns)
RT.perfNow = function() return 0 end   -- so the painted run never borrows a similar sprite to save time
local W, P = RT.modules.world, RT.modules.props
local floor, byte = math.floor, string.byte
RT.fixedLayouts = true

local function readTga(path)
  local f = assert(io.open(path, "rb"), "no such image: " .. path)
  local s = f:read("*a")
  f:close()
  assert(byte(s, 3) == 2 and byte(s, 17) == 32, path .. " is not an uncompressed 32-bit TGA")
  local w, h = byte(s, 13) + byte(s, 14) * 256, byte(s, 15) + byte(s, 16) * 256
  local topDown = floor(byte(s, 18) / 32) % 2 == 1
  assert(#s == 18 + w * h * 4, path .. " is the wrong length for its size")
  return { w = w, h = h, at = function(x, y)
    local row = topDown and y or h - 1 - y
    local o = 18 + (row * w + x) * 4
    return byte(s, o + 3) * 65536 + byte(s, o + 2) * 256 + byte(s, o + 1), byte(s, o + 4)
  end }
end

local function play(level, images, shots)
  RT.groundImages, RT.propImages = images, images
  local g = W.createGame(5)
  if level > 1 then W.jumpToLevel(g, level) end
  g.points = 1e9
  for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur" }) do W.buyAbility(g, id) end
  local R = RT.modules.render.createRenderer()
  local out, hidden, soft, textures = {}, 0, 0, 0
  for i = 0, steps - 1 do
    local b, m = g.boss, g.map
    local ax, ay = floor(i / 170) % 3 - 1, floor(i / 230) % 3 - 1
    if m.scroll == "x" and ax == 0 then ax = 1 end
    if m.scroll == "y" and ay == 0 then ay = -1 end
    -- fire and rubble: scorch marks and filled water are the things that change the ground while a level runs
    if i % 120 == 60 then for j = 0, g.props.length - 1 do local p = g.props[j]; if math.abs(p.x - b.x) < 120 and math.abs(p.y - b.y) < 90 then P.ignite(g, p) end end end
    if g.water and i % 200 == 100 then P.fillWater(g, b.x + 20, b.y - 30, 2); P.fillWater(g, b.x - 30, b.y + 30, 3) end
    local press = {}
    if i % 90 == 30 then press.slot1 = true end
    if i % 130 == 70 then press.slot2 = true end
    if i % 210 == 110 then press.slot3 = true end
    if b.hp < b.maxhp * 0.5 and not b.dead then b.hp = b.maxhp end
    W.step(g, { mx = b.x + ax * 30 + i % 7, my = b.y + ay * 30 + 1, ax = ax, ay = ay, press = press, hold = { slot0 = i % 400 < 300 } }, 1 / 60)
    RT.setlen(g.events, 0)
    g.store, g.won, g.over = false, false, false
    R.render(g, { mx = 100 + i % 50, my = 60, cursor = true })
    RT.Screen.present(nil)
    assert((RT.Screen.ground ~= nil) == images, "level " .. level .. ": the Screen " .. (images and "was not given" or "was given") .. " a ground image")
    if i % 41 == 0 or i == steps - 1 then
      local snap = RT.Screen.snapshot()
      local shot = { snap = snap, vx = RT.Screen.vx, vy = RT.Screen.vy, i = i, props = {} }
      local ps = RT.Screen.props
      if ps then
        assert(images, "prop textures asked for while images are off")
        shot.P = ps.P
        for k = 1, ps.n do shot.props[k] = ps[k] end
        textures = textures + ps.n
      end
      out[#out + 1] = shot
      for k = 1, 57600 do local v = snap[k]; if v == nil then hidden = hidden + 1 elseif v >= 16777216 then soft = soft + 1 end end
    end
  end
  return out, hidden / (#out * 57600), soft / (#out * 57600), g, textures / #out
end

-- the layer of prop textures for one picture: screen pixel → colour and alpha, the nearest texture winning
local sheets = {}
local function propLayer(shot)
  local layer = {}
  if not shot.P then return layer end
  local file = shot.P.file
  sheets[file] = sheets[file] or readTga("art/" .. file)
  local sheet = sheets[file]
  local list = {}
  for k, e in ipairs(shot.props) do list[k] = e end
  table.sort(list, function(a, b) return a.z < b.z end)
  for _, e in ipairs(list) do
    for yy = 0, e.h - 1 do
      local sy = e.y + yy - shot.vy
      if sy >= 0 and sy < 180 then
        for xx = 0, e.w - 1 do
          local sx = e.x + xx - shot.vx
          if sx >= 0 and sx < 320 then
            local c, a = sheet.at(e.u + xx, e.v + yy)
            if a > 0 then
              local k = sy * 320 + sx + 1
              local was = layer[k]
              assert(not (was and was.z == e.z), "two prop textures on one draw layer overlap at " .. sx .. "," .. sy)
              layer[k] = { c = c, a = a, z = e.z, under = was }
            end
          end
        end
      end
    end
  end
  return layer
end
local function blend(under, c, al)
  local r = floor(under / 65536) + (floor(c / 65536) - floor(under / 65536)) * al
  local g = floor(under / 256) % 256 + (floor(c / 256) % 256 - floor(under / 256) % 256) * al
  local b = under % 256 + (c % 256 - under % 256) * al
  return floor(r + 0.5) * 65536 + floor(g + 0.5) * 256 + floor(b + 0.5)
end
local function propOver(under, p)
  if p.under then under = propOver(under, p.under) end
  if p.a >= 255 then return p.c end
  return blend(under, p.c, p.a / 255)
end

local worstAll = 0
for level = 1, 7 do
  local G = assert(ns.Ground[level], "level " .. level .. " has no ground image")
  local img = readTga("art/" .. G.file)
  assert(img.w == G.tw and img.h == G.th, "level " .. level .. ": the image is not the size the manifest says")
  local t0 = os.clock()
  local ref = play(level, false)
  local tPaint = os.clock() - t0
  t0 = os.clock()
  local got, hidden, soft, g, textures = play(level, true)
  local tImage = os.clock() - t0
  assert(g.map.layout == G.seed and g.map.w == G.w and g.map.h == G.h, "level " .. level .. " was not laid out to match its image")
  assert(#ref == #got)
  local worst, off = 0, 0
  for s = 1, #ref do
    local a, b = ref[s], got[s]
    assert(a.vx == b.vx and a.vy == b.vy, "level " .. level .. ": the two runs did not stay in step")
    local layer = propLayer(b)
    for k = 1, 57600 do
      local want, v = a.snap[k], b.snap[k]
      local sx, sy = (k - 1) % 320, floor((k - 1) / 320)
      local r, gg, bb
      if v == nil or v >= 16777216 then
        local wx, wy = sx + b.vx, sy + b.vy
        local under = (wx >= 0 and wy >= 0 and wx < G.w and wy < G.h) and (img.at(wx, wy)) or 0x141a12
        if layer[k] then under = propOver(under, layer[k]) end
        if v == nil then r, gg, bb = floor(under / 65536), floor(under / 256) % 256, under % 256
        else
          local al = floor(v / 16777216) / 255
          local c = v % 16777216
          r = floor(under / 65536) + (floor(c / 65536) - floor(under / 65536)) * al
          gg = floor(under / 256) % 256 + (floor(c / 256) % 256 - floor(under / 256) % 256) * al
          bb = under % 256 + (c % 256 - under % 256) * al
        end
      else r, gg, bb = floor(v / 65536), floor(v / 256) % 256, v % 256 end
      local d = math.max(math.abs(r - floor(want / 65536)), math.abs(gg - floor(want / 256) % 256), math.abs(bb - want % 256))
      if d > worst then worst = d end
      if d > tol then
        off = off + 1
        if off <= 5 then print(string.format("  level %d step %d pixel %d,%d: want %06x, got %s over the image", level, a.i, sx, sy, want, v and string.format("%08x", v) or "nothing")) end
      end
    end
  end
  assert(off == 0, "level " .. level .. ": " .. off .. " pixels differ from the painted ground by more than " .. tol)
  if worst > worstAll then worstAll = worst end
  print(string.format("level %d: %d pictures match the painted ones (worst channel off by %.1f); %2.0f%% of cells hidden, %.1f%% see-through, %3.0f prop textures up; %.1f s painted, %.1f s over the images",
    level, #ref, worst, hidden * 100, soft * 100, textures, tPaint, tImage))
end
print("OK: every level over its images is the picture that painting everything gives")
