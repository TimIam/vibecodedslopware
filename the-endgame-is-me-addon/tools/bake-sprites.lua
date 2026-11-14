-- Harvests the pictures the game makes for itself while it runs and saves them as sheets the client can draw.
--
-- The level art keeps what it paints in a cache of named sprites (render.js sprite(): a wrecked house, a ruin, a
-- heap of rubble, a cracked wall, a tent knocked flat), and draws from that cache every frame. In the addon each
-- such draw copied the sprite into the grid a pixel at a time. This tool plays every level with bots that knock
-- everything down, collects every sprite the game made, and packs them:
--   art/sprites_K.tga   sheets of sprites, 1024 wide                         (listed in art/sprites.json)
-- The build writes the list into the addon (ns.Sprites), and the Screen then shows a sprite it has on a sheet as one
-- texture (src/canvas.lua, drawImage). A sprite that is not on a sheet (a state no bot reached) is painted as
-- before, so the list only has to be good, not complete.
--   lua5.1 tools/bake-sprites.lua [steps]      (on Windows: bash tools/wsl.sh lua5.1 tools/bake-sprites.lua)
--   node tools/build.mjs
-- Also baked, by asking for every one that can occur: the puffs of smoke (render.js smokeSprite) and the addon's own
-- effect pictures (src/gfx.lua: fires, ice floors).
-- Left out: a sprite the game draws on again after making it (a work surface; getContext drops its name),
-- anything larger than 256 pixels a side, and any name that came out as two
-- different pictures (reported: its name is missing something the picture depends on).
local STEPS = tonumber(arg[1] or 5000)
local SEEDS = { 1101, 2202, 3303, 4404, 5505, 6606, 7707 }   -- as tools/bake-art.lua: the layouts the addon uses
local SHEET_W, SHEET_H, MAX = 1024, 1024, 256
local KITS = {
  { "beam", "ice", "breath", "summon" },
  { "charge", "tail", "stomp", "breath" },
}
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W, Rm = RT.modules.world, RT.modules.render
local floor, char, concat = math.floor, string.char, table.concat
local A1 = 16777216

ns.Ground = {}
for n, seed in ipairs(SEEDS) do ns.Ground[n] = { seed = seed } end   -- the layouts, with everything painted for real
RT.fixedLayouts = true
RT.perfNow = function() return 0 end   -- no time passes: a sprite is never borrowed from a similar one to save time

local function pow2(n) local p = 1; while p < n do p = p * 2 end; return p end
local function le16(n) return char(n % 256, floor(n / 256)) end
local function writeTga(path, tw, th, at)
  local rows = {}
  local none = char(0, 0, 0, 0)
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

-- ------------------------------------------------------------------------------------------------ the harvest

local found, order, clash = {}, {}, {}
local function sig(cv)
  local t, px = {}, cv.px
  for i = 1, cv.width * cv.height do t[i] = px[i] or -1 end
  return concat(t, ",")
end
local function collect()
  for key, entry in pairs(Rm.sprites.idx) do
    local cv = entry[1]
    if type(key) == "string" and type(cv) == "table" and cv.key == key and cv.keyVer == cv.ver and cv.width <= MAX and cv.height <= MAX then
      local s = sig(cv)
      local was = found[key]
      if not was then
        local px, soft = {}, false
        for i = 1, cv.width * cv.height do
          local v = cv.px[i]
          px[i] = v
          if v and v >= A1 then soft = true end
        end
        found[key] = { key = key, w = cv.width, h = cv.height, px = px, sig = s, soft = soft }
        order[#order + 1] = key
      elseif was.sig ~= s and not clash[key] then
        clash[key] = true
        print("  two pictures under one name, left out: " .. key)
      end
    end
  end
end

local function play(n, kit, steps)
  local g = W.createGame(SEEDS[n])
  if n > 1 then W.jumpToLevel(g, n) end
  assert(g.map.n == n and g.map.layout == SEEDS[n], "level " .. n .. " was not laid out from its seed")
  g.points = 1e9
  for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur", "breath", "roar", "shake" }) do pcall(W.buyAbility, g, id) end
  for k = 1, 4 do W.setSlot(g, k, kit[k]) end
  -- a fresh cache each time, so a name is painted again from nothing and a second, different picture shows up
  Rm.sprites, Rm.similar = RT.Map(), RT.Map()
  local R = Rm.createRenderer()
  for i = 0, steps - 1 do
    local b, m = g.boss, g.map
    local ax, ay
    if m.A then
      local d = g.lastMark == "A" and m.B or m.A
      ax = d.x - b.x > 1 and 1 or d.x - b.x < -1 and -1 or 0
      ay = d.y - b.y > 1 and 1 or d.y - b.y < -1 and -1 or 0
    else ax = floor(i / 200) % 3 - 1; ay = floor(i / 300) % 3 - 1 end
    -- wander off the straight line now and then, to reach what stands to the side
    if floor(i / 400) % 3 == 1 then ay = (floor(i / 100) % 2 == 0) and 1 or -1 end
    local press = {}
    if i % 90 == 45 then press["slot" .. (floor(i / 90) % 4 + 1)] = true end
    if b.hp < b.maxhp * 0.5 and not b.dead then b.hp = b.maxhp end
    W.step(g, { mx = b.x + ax * 30 + i % 7, my = b.y + ay * 30 + 1, ax = ax, ay = ay, press = press, hold = { slot0 = true } }, 1 / 60)
    RT.setlen(g.events, 0)
    g.store, g.won, g.over = false, false, false
    if i % 3 == 0 then
      R.render(g, { mx = 100, my = 60 })
      RT.Screen.present(nil)
    end
  end
  collect()
end

os.execute("mkdir -p art")
-- every puff of smoke, and every effect picture
do
  Rm.sprites, Rm.similar = RT.Map(), RT.Map()
  local radii = Rm.SMOKE_R
  for i = 0, radii.length - 1 do for db = 0, 4 do for v = 0, 2 do Rm.smokeSprite(radii[i], db, v) end end end
  local before = #order
  collect()
  print(string.format("smoke: %d puffs", #order - before))
  -- the ice floor's reach at each level of the ability
  local g = W.createGame(1)
  g.points = 1e9
  W.buyAbility(g, "ice")
  local ranges = { g.abil.ice.range }
  while W.upgradeAbility(g, "ice") do ranges[#ranges + 1] = g.abil.ice.range end
  before = #order
  for key, cv in pairs(RT.effectSprites(ranges)) do RT.set(Rm.sprites, key, cv) end
  collect()
  print(string.format("effects: %d pictures (ice floors of radius %s)", #order - before, concat(ranges, ", ")))
end
for n = 1, #SEEDS do
  local t0, before = os.clock(), #order
  for _, kit in ipairs(KITS) do play(n, kit, STEPS) end
  -- level 5's wall: every section in every state of damage, and the rooftops behind it
  if n == 5 then
    local g = W.createGame(SEEDS[n])
    W.jumpToLevel(g, n)
    Rm.sprites, Rm.similar = RT.Map(), RT.Map()
    RT.modules["levels/wall"].wallSprites(g.map, Rm.H_ART)
    collect()
  end
  print(string.format("level %d: %d new sprites (%.0f s)", n, #order - before, os.clock() - t0))
end

-- ------------------------------------------------------------------------------------------------ the sheets

local list = {}
for _, key in ipairs(order) do if not clash[key] then list[#list + 1] = found[key] end end
-- each different picture once
local unique, pics = {}, {}
for _, e in ipairs(list) do
  local id = e.w .. "x" .. e.h .. ":" .. e.sig
  local p = unique[id]
  if not p then p = { w = e.w, h = e.h, px = e.px }; unique[id] = p; pics[#pics + 1] = p end
  e.pic = p
end
table.sort(pics, function(a, b) if a.h ~= b.h then return a.h > b.h end return a.w > b.w end)
local sheets = { {} }
local x, y, rowH = 0, 0, 0
for _, p in ipairs(pics) do
  if x + p.w > SHEET_W then x, y, rowH = 0, y + rowH + 1, 0 end
  if y + p.h > SHEET_H then sheets[#sheets + 1] = {}; x, y, rowH = 0, 0, 0 end
  p.f, p.u, p.v = #sheets, x, y
  local s = sheets[#sheets]
  s[#s + 1] = p
  s.h = math.max(s.h or 0, y + p.h)
  x = x + p.w + 1
  if p.h > rowH then rowH = p.h end
end
local files = {}
for k, s in ipairs(sheets) do
  local th = pow2(s.h or 1)
  local cells = {}
  for _, p in ipairs(s) do
    for yy = 0, p.h - 1 do
      for xx = 0, p.w - 1 do cells[(p.v + yy) * SHEET_W + p.u + xx] = p.px[yy * p.w + xx + 1] end
    end
  end
  local file = "sprites_" .. k .. ".tga"
  writeTga("art/" .. file, SHEET_W, th, function(px, py) return cells[py * SHEET_W + px] end)
  files[k] = string.format('{ "file": "%s", "tw": %d, "th": %d }', file, SHEET_W, th)
end
local rows = {}
for _, e in ipairs(list) do
  rows[#rows + 1] = string.format('  { "k": %q, "f": %d, "u": %d, "v": %d, "w": %d, "h": %d, "s": %d }', e.key, e.pic.f, e.pic.u, e.pic.v, e.w, e.h, e.soft and 0 or 1)
end
local f = assert(io.open("art/sprites.json", "w"))
f:write('{ "sheets": [ ' .. concat(files, ", ") .. ' ],\n  "list": [\n' .. concat(rows, ",\n") .. "\n] }\n")
f:close()
print(string.format("%d sprites, %d different pictures, on %d sheet%s; wrote art/sprites.json", #list, #pics, #sheets, #sheets == 1 and "" or "s"))
