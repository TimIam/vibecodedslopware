-- Paints, once and here, what the addon used to paint in Lua while the game ran, and saves it as images the client
-- can draw as textures:
--   art/ground_N.tga   a level's whole ground, one image                       (listed in art/ground.json)
--   art/props_N.tga    a sheet of every prop of the level as it stands at the start (listed in art/props.json)
-- Run from the addon folder after the build (it uses build/game_*.lua), then build again to pack the images:
--   lua5.1 tools/bake-art.lua            (on Windows: bash tools/wsl.sh lua5.1 tools/bake-art.lua)
--   node tools/build.mjs
-- A level's ground and props depend on how the level was laid out, so the images belong to one layout seed (SEEDS
-- below); the addon lays that level out from the same seed (src/gfx.lua). Change a seed and that level is a
-- different place. The files are 32-bit uncompressed TGA, which every client reads, padded to powers of two, which
-- older ones need.
local SEEDS = { 1101, 2202, 3303, 4404, 5505, 6606, 7707 }
local LAYERS = 48          -- how many prop textures may lie on top of one another (three draw layers of sixteen)
local SHEET_W = 1024
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W, Rm = RT.modules.world, RT.modules.render
local Screen = RT.Screen
local floor, char, concat = math.floor, string.char, table.concat
local A1 = 16777216

ns.Ground = {}
for n, seed in ipairs(SEEDS) do ns.Ground[n] = { seed = seed } end   -- no file yet, so everything is painted for real
RT.fixedLayouts = true
RT.perfNow = function() return 0 end   -- no time passes: a sprite is never borrowed from a similar one to save time

-- the canvas the renderer hands the Screen as the ground
local caught
local begin = Screen.begin
Screen.begin = function(bg, ...) caught = bg; return begin(bg, ...) end

local function pow2(n) local p = 1; while p < n do p = p * 2 end; return p end
local function le16(n) return char(n % 256, floor(n / 256)) end

-- at(x, y) → a packed pixel (0xRRGGBB, with an alpha above it if see-through) or nil; the image is tw × th
local function writeTga(path, tw, th, at)
  local rows = {}
  local none = char(0, 0, 0, 0)
  -- bottom row first: the oldest and most widely read layout
  for y = th - 1, 0, -1 do
    local row = {}
    for x = 0, tw - 1 do
      local v = at(x, y)
      if v == nil then row[x + 1] = none
      else
        local a = 255
        if v >= A1 then a = floor(v / A1); v = v % A1 end
        row[x + 1] = char(v % 256, floor(v / 256) % 256, floor(v / 65536), a)
      end
    end
    rows[#rows + 1] = concat(row)
  end
  local f = assert(io.open(path, "wb"))
  f:write(char(0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0), le16(tw), le16(th), char(32, 8))
  f:write(concat(rows))
  f:close()
end

local function writePpm(path, w, h, at)
  local out = { string.format("P6\n%d %d\n255\n", w, h) }
  for y = 0, h - 1 do for x = 0, w - 1 do
    local v = at(x, y)
    if v == nil then v = 0xff00ff elseif v >= A1 then v = v % A1 end
    out[#out + 1] = char(floor(v / 65536), floor(v / 256) % 256, v % 256)
  end end
  local f = assert(io.open(path, "wb")); f:write(concat(out)); f:close()
end

-- ------------------------------------------------------------------------------------------------ props

-- One prop, painted by its level's art onto an empty Screen exactly as the renderer would paint it, with the camera
-- nudged by (dx, dy) and the clock at t. Returns where its pixels are in the world, and the pixels.
local function paint(g, p, draw, t, dx, dy)
  local m = g.map
  local vx, vy = floor(p.x + 0.5) - 160 + dx, floor(p.y + 0.5) - 90 + dy
  local was = g.t
  g.t = t
  Rm.VIEW.x, Rm.VIEW.y = vx, vy
  Rm.spriteBudget = 1e9
  Screen.begin({ image = true, width = m.w, height = m.h, px = {} }, { width = m.w, height = m.h, px = {} }, vx, vy)
  local ctx = Screen:getContext()
  ctx:setTransform(1, 0, 0, 1, 0, 0)
  ctx:translate(-vx, -vy)
  draw(ctx, p, g, Rm.H_ART)
  ctx.globalAlpha = 1
  g.t = was
  local snap = Screen.snapshot()
  local x0, y0, x1, y1 = 320, 180, -1, -1
  for sy = 0, 179 do
    local row = sy * 320
    for sx = 0, 319 do
      if snap[row + sx + 1] ~= nil then
        if sx < x0 then x0 = sx end
        if sx > x1 then x1 = sx end
        if sy < y0 then y0 = sy end
        if sy > y1 then y1 = sy end
      end
    end
  end
  if x1 < 0 then return nil, "draws nothing" end
  if x0 == 0 or y0 == 0 or x1 == 319 or y1 == 179 then return nil, "too big" end
  local w, h = x1 - x0 + 1, y1 - y0 + 1
  local px, key = {}, {}
  for yy = 0, h - 1 do
    for xx = 0, w - 1 do
      local v = snap[(y0 + yy) * 320 + x0 + xx + 1]
      px[yy * w + xx + 1] = v
      key[#key + 1] = v or -1
    end
  end
  return { x = x0 + vx, y = y0 + vy, w = w, h = h, px = px, key = w .. "x" .. h .. ":" .. concat(key, ",") }
end

local function bakeProps(n, seed, g)
  local m = g.map
  local art = Rm.PROP_ART
  local why = {}
  local function skip(reason) why[reason] = (why[reason] or 0) + 1 end
  local entries = {}
  for i = 0, g.props.length - 1 do
    local p = g.props[i]
    local draw = art[p.kind]
    if not draw then skip("no art")
    elseif p.state ~= "up" or p.burning or p.hitT > 0 or p.fallA ~= 0 or p.broken then skip("not standing")
    else
      local a, err = paint(g, p, draw, g.t, 0, 0)
      if not a then skip(err)
      else
        -- the same at a spread of other moments and with the camera somewhere else, or it is not a still picture
        -- (a lamp that flickers once a second looks still if you only look twice)
        local still = true
        for k = 1, 24 do
          local b = paint(g, p, draw, g.t + k * 0.293 + (k % 5) * 1.37, (k % 2 == 0) and 37 or -41, (k % 3 == 0) and -23 or 17)
          if not (b and b.key == a.key and b.x == a.x and b.y == a.y) then still = false; break end
        end
        if not still then skip("moves")
        else
          a.i, a.kind, a.px0, a.py0, a.hp = i, p.kind, p.x, p.y, p.hp
          a.sort = p.y + ((p.h and p.h ~= 0) and p.h / 2 or 0) + ((p.sortY and p.sortY ~= 0) and p.sortY or 0)
          entries[#entries + 1] = a
        end
      end
    end
  end
  -- back to front, as the renderer sorts them (a stable sort: equal ones stay in list order)
  table.sort(entries, function(a, b) if a.sort ~= b.sort then return a.sort < b.sort end return a.i < b.i end)
  -- a draw layer for each: one more than the deepest thing it overlaps that is behind it
  local kept = {}
  for k, e in ipairs(entries) do
    local z = 0
    for j = 1, #kept do
      local o = kept[j]
      if o.x < e.x + e.w and e.x < o.x + o.w and o.y < e.y + e.h and e.y < o.y + o.h and o.z + 1 > z then z = o.z + 1 end
    end
    if z >= LAYERS then skip("too deep a pile")
    else e.z = z; kept[#kept + 1] = e end
  end
  if #kept == 0 then return nil, why end
  -- the sheet: each different picture once, tallest first, in rows
  local unique, order = {}, {}
  for _, e in ipairs(kept) do
    if not unique[e.key] then unique[e.key] = { w = e.w, h = e.h, px = e.px }; order[#order + 1] = unique[e.key] end
  end
  table.sort(order, function(a, b) if a.h ~= b.h then return a.h > b.h end return a.w > b.w end)
  local x, y, rowH = 0, 0, 0
  for _, s in ipairs(order) do
    if x + s.w > SHEET_W then x, y, rowH = 0, y + rowH + 1, 0 end
    s.u, s.v = x, y
    x = x + s.w + 1
    if s.h > rowH then rowH = s.h end
  end
  local tw, th = SHEET_W, pow2(y + rowH)
  assert(th <= 2048, "level " .. n .. ": the prop sheet is taller than a texture may be")
  local sheet = {}
  for _, s in ipairs(order) do
    for yy = 0, s.h - 1 do for xx = 0, s.w - 1 do sheet[(s.v + yy) * tw + s.u + xx] = s.px[yy * s.w + xx + 1] end end
  end
  local file = "props_" .. n .. ".tga"
  writeTga("art/" .. file, tw, th, function(xx, yy) return sheet[yy * tw + xx] end)
  writePpm("build/props_" .. n .. ".ppm", tw, th, function(xx, yy) return sheet[yy * tw + xx] end)
  local list, deepest = {}, 0
  for _, e in ipairs(kept) do
    local s = unique[e.key]
    if e.z > deepest then deepest = e.z end
    list[#list + 1] = string.format('{ "i": %d, "kind": "%s", "px": %.17g, "py": %.17g, "hp": %.17g, "x": %d, "y": %d, "w": %d, "h": %d, "u": %d, "v": %d, "z": %d }',
      e.i, e.kind, e.px0, e.py0, e.hp, e.x, e.y, e.w, e.h, s.u, s.v, e.z)
  end
  return { json = string.format('  { "n": %d, "file": "%s", "tw": %d, "th": %d, "seed": %d, "list": [\n    %s\n  ] }', n, file, tw, th, seed, concat(list, ",\n    ")),
    baked = #kept, pictures = #order, tw = tw, th = th, layers = deepest + 1 }, why
end

-- ------------------------------------------------------------------------------------------------ every level

os.execute("mkdir -p art build")
local grounds, sheets = {}, {}
for n, seed in ipairs(SEEDS) do
  local t0 = os.clock()
  local g = W.createGame(seed)
  if n > 1 then W.jumpToLevel(g, n) end
  assert(g.map.n == n and g.map.layout == seed, "level " .. n .. " was not laid out from its seed")
  local R = Rm.createRenderer()
  caught = nil
  R.render(g, {})
  local cv = assert(caught, "the renderer handed over no ground")
  assert(not cv.image and cv.width == g.map.w and cv.height == g.map.h, "level " .. n .. ": that is not a painted ground")
  local tw, th = pow2(cv.width), pow2(cv.height)
  local file = "ground_" .. n .. ".tga"
  local function ground(x, y)
    if x >= cv.width or y >= cv.height then return 0 end
    local v = cv.px[y * cv.width + x + 1]
    assert(v and v < A1, "the ground has a hole or a see-through pixel at " .. x .. "," .. y)
    return v
  end
  writeTga("art/" .. file, tw, th, ground)
  writePpm("build/ground_" .. n .. ".ppm", cv.width, cv.height, ground)
  grounds[#grounds + 1] = string.format('  { "n": %d, "file": "%s", "w": %d, "h": %d, "tw": %d, "th": %d, "seed": %d }', n, file, cv.width, cv.height, tw, th, seed)
  local sheet, why = bakeProps(n, seed, g)
  local reasons = {}
  for k, v in pairs(why) do reasons[#reasons + 1] = v .. " " .. k end
  table.sort(reasons)
  if sheet then sheets[#sheets + 1] = sheet.json end
  print(string.format("level %d %-18s ground %4dx%-4d in %4dx%-4d; props: %3d of %3d as %3d pictures on a %dx%d sheet, %d deep%s  (%.0f s)",
    n, tostring(g.map.name), cv.width, cv.height, tw, th, sheet and sheet.baked or 0, g.props.length, sheet and sheet.pictures or 0,
    sheet and sheet.tw or 0, sheet and sheet.th or 0, sheet and sheet.layers or 0, #reasons > 0 and ("; left to the grid: " .. concat(reasons, ", ")) or "", os.clock() - t0))
end
local f = assert(io.open("art/ground.json", "w"))
f:write("[\n" .. concat(grounds, ",\n") .. "\n]\n")
f:close()
f = assert(io.open("art/props.json", "w"))
f:write("[\n" .. concat(sheets, ",\n") .. "\n]\n")
f:close()
print("wrote art/ground.json and art/props.json")
