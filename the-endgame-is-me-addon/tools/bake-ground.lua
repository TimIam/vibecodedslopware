-- Paints every level's ground once, here, and saves it as an image the client can draw as a single texture
-- (art/ground_N.tga), instead of the addon painting it in Lua each time a level loads and then showing it a pixel at
-- a time. Run from the addon folder after the build (it uses build/game_*.lua), then build again to pack the images:
--   lua5.1 tools/bake-ground.lua            (on Windows: bash tools/wsl.sh lua5.1 tools/bake-ground.lua)
--   node tools/build.mjs
-- A level's ground depends on how the level was laid out, so each image belongs to one layout seed (SEEDS below); the
-- addon lays that level out from the same seed (src/gfx.lua). Change a seed and that level is a different place.
-- The files are 32-bit uncompressed TGA, which every client reads, padded to powers of two, which older ones need.
local SEEDS = { 1101, 2202, 3303, 4404, 5505, 6606, 7707 }
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W = RT.modules.world
local floor, char, concat = math.floor, string.char, table.concat

ns.Ground = {}
for n, seed in ipairs(SEEDS) do ns.Ground[n] = { seed = seed } end   -- no file yet, so the ground is painted for real
RT.fixedLayouts = true

-- the canvas the renderer hands the Screen as the ground
local caught
local begin = RT.Screen.begin
RT.Screen.begin = function(bg, ...) caught = bg; return begin(bg, ...) end

local function pow2(n) local p = 1; while p < n do p = p * 2 end; return p end
local function le16(n) return char(n % 256, floor(n / 256)) end

local function writeTga(path, cv, tw, th)
  local w, h, px = cv.width, cv.height, cv.px
  local rows = {}
  local pad = char(0, 0, 0, 255)
  -- bottom row first: the oldest and most widely read layout
  for y = th - 1, 0, -1 do
    local row, k = {}, 0
    if y < h then
      local base = y * w
      for x = 1, w do
        local v = px[base + x]
        assert(v and v < 16777216, "the ground has a hole or a see-through pixel at " .. (x - 1) .. "," .. y)
        k = k + 1
        row[k] = char(v % 256, floor(v / 256) % 256, floor(v / 65536), 255)
      end
      if tw > w then k = k + 1; row[k] = pad:rep(tw - w) end
    else
      k = 1; row[1] = pad:rep(tw)
    end
    rows[#rows + 1] = concat(row)
  end
  local f = assert(io.open(path, "wb"))
  f:write(char(0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0), le16(tw), le16(th), char(32, 8))
  f:write(concat(rows))
  f:close()
end

local function writePpm(path, cv)
  local w, h, px = cv.width, cv.height, cv.px
  local out = { string.format("P6\n%d %d\n255\n", w, h) }
  for i = 1, w * h do local v = px[i]; out[#out + 1] = char(floor(v / 65536), floor(v / 256) % 256, v % 256) end
  local f = assert(io.open(path, "wb")); f:write(concat(out)); f:close()
end

os.execute("mkdir -p art build")
local list = {}
for n, seed in ipairs(SEEDS) do
  local t0 = os.clock()
  local g = W.createGame(seed)
  if n > 1 then W.jumpToLevel(g, n) end
  assert(g.map.n == n and g.map.layout == seed, "level " .. n .. " was not laid out from its seed")
  local R = RT.modules.render.createRenderer()
  caught = nil
  R.render(g, {})
  local cv = assert(caught, "the renderer handed over no ground")
  assert(not cv.image and cv.width == g.map.w and cv.height == g.map.h, "level " .. n .. ": that is not a painted ground")
  local tw, th = pow2(cv.width), pow2(cv.height)
  local file = "ground_" .. n .. ".tga"
  writeTga("art/" .. file, cv, tw, th)
  writePpm("build/ground_" .. n .. ".ppm", cv)
  list[#list + 1] = string.format('  { "n": %d, "file": "%s", "w": %d, "h": %d, "tw": %d, "th": %d, "seed": %d, "props": %d }',
    n, file, cv.width, cv.height, tw, th, seed, g.props.length)
  print(string.format("level %d %-18s %4dx%-4d in a %4dx%-4d image, %d props, %.1f s", n, tostring(g.map.name), cv.width, cv.height, tw, th, g.props.length, os.clock() - t0))
end
local f = assert(io.open("art/ground.json", "w"))
f:write("[\n" .. concat(list, ",\n") .. "\n]\n")
f:close()
print("wrote art/ground.json")
