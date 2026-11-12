-- Paints, once and here, what the addon used to paint in Lua while the game ran, and saves it as images the client
-- can draw as textures:
--   art/ground_N.tga   a level's whole ground, one image                       (listed in art/ground.json)
--   art/props_N.tga    a sheet of every prop of the level as it stands at the start (listed in art/props.json)
--   art/units.tga      a sheet of every picture of an adventurer or an add          (listed in art/units.json)
-- Run from the addon folder after the build (it uses build/game_*.lua), then build again to pack the images:
--   lua5.1 tools/bake-art.lua            (on Windows: bash tools/wsl.sh lua5.1 tools/bake-art.lua)
--   lua5.1 tools/bake-art.lua units      only the units sheet, which takes a second
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
  -- The level art keeps the sprites it paints, by name. If a name leaves out something the painting depends on, two
  -- props share whichever of their pictures was painted first, and that depends on which came on screen first: no
  -- one picture is right. So everything is painted again from nothing in the opposite order, and a prop that comes
  -- out differently is left to the grid. (tools/build.mjs fixes the names that were found this way.)
  Rm.sprites, Rm.similar = RT.Map(), RT.Map()
  local steady = {}
  for k = #entries, 1, -1 do
    local a = entries[k]
    local p = g.props[a.i]
    local b = paint(g, p, art[p.kind], g.t, 0, 0)
    if b and b.key == a.key and b.x == a.x and b.y == a.y then steady[#steady + 1] = a else skip("depends on which was painted first") end
  end
  entries = steady
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

-- ------------------------------------------------------------------------------------------------ units

-- Every picture render.js can paint for an adventurer or one of the boss's adds (src/sprites.lua says which they
-- are and numbers them), each painted here by the game's own drawUnit / drawAdd from a made-up unit in that state.
-- Only the solid pixels are kept: the shadow under the feet is see-through, and the addon still paints that.
local UNIT_SHEET_W = 256
local stageBg, stageTrail = { image = true, width = 2000, height = 2000, px = {} }, { width = 2000, height = 2000, px = {} }
local function pose(draw, o, g, softWanted, what)
  local vx, vy = 500 - 160, 500 - 90
  Screen.begin(stageBg, stageTrail, vx, vy)
  local ctx = Screen:getContext()
  ctx:setTransform(1, 0, 0, 1, 0, 0)
  ctx:translate(-vx, -vy)
  draw(ctx, o, g)
  ctx.globalAlpha = 1
  local snap = Screen.snapshot()
  local x0, y0, x1, y1, soft = 320, 180, -1, -1, 0
  for sy = 0, 179 do
    for sx = 0, 319 do
      local v = snap[sy * 320 + sx + 1]
      if v ~= nil then
        if v >= A1 then soft = soft + 1
        else
          if sx < x0 then x0 = sx end
          if sx > x1 then x1 = sx end
          if sy < y0 then y0 = sy end
          if sy > y1 then y1 = sy end
        end
      end
    end
  end
  assert(x1 >= 0, what .. " draws nothing solid")
  assert(soft == softWanted, what .. ": " .. soft .. " see-through pixels where the shadow is " .. softWanted)
  local w, h = x1 - x0 + 1, y1 - y0 + 1
  local px, key, rows = {}, {}, {}
  for yy = 0, h - 1 do
    local runs, start = {}, nil
    for xx = 0, w - 1 do
      local v = snap[(y0 + yy) * 320 + x0 + xx + 1]
      if v ~= nil and v >= A1 then v = nil end
      px[yy * w + xx + 1] = v
      key[#key + 1] = v or -1
      if v ~= nil then start = start or xx
      elseif start then runs[#runs + 1] = start; runs[#runs + 1] = xx - 1; start = nil end
    end
    if start then runs[#runs + 1] = start; runs[#runs + 1] = w - 1 end
    rows[yy + 1] = #runs > 0 and ("[" .. concat(runs, ",") .. "]") or "null"
  end
  -- where the picture's corner is from the unit's own pixel (the made-up unit stands at 500, 500)
  return { ax = x0 - 160, ay = y0 - 90, w = w, h = h, px = px, key = w .. "x" .. h .. ":" .. concat(key, ","), rows = "[" .. concat(rows, ",") .. "]" }
end

local function bakeUnits()
  local unit, add = {}, {}
  for ci, cls in ipairs(RT.unitClasses) do
    local role = W.CLASS[cls].role
    local twoLooks = role == "melee" or role == "healer" or role == "king" or (role == "ranged" and cls ~= "hunter")
    for fxi = 0, 1 do for st = 0, role == "pet" and 1 or 2 do for flash = 0, 1 do for v = 0, twoLooks and 1 or 0 do
      local fx = fxi == 1 and 1 or -1
      local u = { x = 500, y = 500, cls = cls, role = role, id = v == 1 and 0 or 1, hit = flash * 0.1, state = "chase", hp = 10, maxhp = 10,
        party = { engaged = false }, inFire = false, swing = 0, cast = 0, glow = 0 }
      local g = { boss = { x = 500 + fx * 100 }, t = 0.15 }
      if st == 2 then u.moving = false else u.moving, u.fx, u.walk, g.boss.x = true, fx, st, 500 - fx * 100 end
      if role == "melee" then u.swing = v * 0.1 elseif role == "ranged" then u.cast = v * 0.5 elseif role == "healer" then u.glow = v * 0.1 end
      local key = RT.unitKey(u, g)
      local want = ((((ci - 1) * 2 + fxi) * 3 + st) * 2 + flash) * 2 + v
      assert(key == want, cls .. ": the addon numbers this picture " .. tostring(key) .. ", not " .. want)
      assert(not unit[key])
      unit[key] = pose(RT.paintUnit, u, g, 3, cls .. " " .. key)
    end end end end
  end
  for ki, kind in ipairs(RT.addKinds) do
    for fr = 0, 1 do for flip = 0, 1 do for flash = 0, 1 do
      local a = { x = 500, y = 500, kind = kind, fx = flip == 1 and -1 or 1, hit = flash * 0.1, r = W.ADDS[kind].r, hp = 1, maxhp = 1, swing = 0, moving = false, walk = 0 }
      if kind == "spitter" or kind == "necro" then a.swing = fr * 0.1 else a.moving, a.walk = true, fr end
      local key = RT.addKey(a)
      if key then
        assert(key == (((ki - 1) * 2 + fr) * 2 + flip) * 2 + flash and not add[key])
        add[key] = pose(RT.paintAdd, a, {}, math.ceil(a.r) * 2 + 1, kind .. " " .. key)
      end
    end end end
  end
  -- the sheet: each different picture once
  local unique, order = {}, {}
  for _, set in ipairs({ unit, add }) do
    for _, e in pairs(set) do
      if not unique[e.key] then unique[e.key] = { w = e.w, h = e.h, px = e.px, key = e.key }; order[#order + 1] = unique[e.key] end
    end
  end
  table.sort(order, function(a, b) if a.h ~= b.h then return a.h > b.h end if a.w ~= b.w then return a.w > b.w end return a.key < b.key end)
  local x, y, rowH = 0, 0, 0
  for _, s in ipairs(order) do
    if x + s.w > UNIT_SHEET_W then x, y, rowH = 0, y + rowH + 1, 0 end
    s.u, s.v = x, y
    x = x + s.w + 1
    if s.h > rowH then rowH = s.h end
  end
  local tw, th = UNIT_SHEET_W, pow2(y + rowH)
  local sheet = {}
  for _, s in ipairs(order) do
    for yy = 0, s.h - 1 do for xx = 0, s.w - 1 do sheet[(s.v + yy) * tw + s.u + xx] = s.px[yy * s.w + xx + 1] end end
  end
  writeTga("art/units.tga", tw, th, function(xx, yy) return sheet[yy * tw + xx] end)
  writePpm("build/units.ppm", tw, th, function(xx, yy) return sheet[yy * tw + xx] end)
  local function listOf(set)
    local keys, out = {}, {}
    for k in pairs(set) do keys[#keys + 1] = k end
    table.sort(keys)
    for _, k in ipairs(keys) do
      local e, s = set[k], unique[set[k].key]
      out[#out + 1] = string.format('{ "k": %d, "u": %d, "v": %d, "w": %d, "h": %d, "ax": %d, "ay": %d, "m": %s }', k, s.u, s.v, e.w, e.h, e.ax, e.ay, e.rows)
    end
    return concat(out, ",\n    "), #keys
  end
  local units, nu = listOf(unit)
  local adds, na = listOf(add)
  local f = assert(io.open("art/units.json", "w"))
  f:write(string.format('{ "file": "units.tga", "tw": %d, "th": %d,\n  "unit": [\n    %s\n  ],\n  "add": [\n    %s\n  ] }\n', tw, th, units, adds))
  f:close()
  print(string.format("units: %d adventurer pictures and %d add pictures, %d different, on a %dx%d sheet", nu, na, #order, tw, th))
end
if arg[1] == "units" then bakeUnits(); print("wrote art/units.json"); return end

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
bakeUnits()
print("wrote art/ground.json, art/props.json and art/units.json")
