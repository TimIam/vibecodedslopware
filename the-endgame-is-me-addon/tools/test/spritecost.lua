-- What drawing the things that move as textures saves. Plays each level over its ground image with the trace bot,
-- once with everything that moves painted into the grid and once with the sprites on, and prints for each: the Lua
-- time a frame's drawing takes, how many grid cells change colour a frame, and what the textures cost instead (how
-- many of the boss's block pixels are recoloured, with the display's dozen blocks kept as it keeps them, and how
-- many calls move or re-cut a unit's texture).
--   lua5.1 tools/test/spritecost.lua [steps] [level]        (after tools/bake-art.lua and a build)
local steps, only = tonumber(arg[1] or 1500), tonumber(arg[2] or 0)
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
for _, f in ipairs({ "ground", "props", "units" }) do assert(loadfile("TheEndgameIsMe/" .. f .. ".lua"))("TheEndgameIsMe", ns) end
RT.fixedLayouts = true
local W = RT.modules.world
local clock, floor = os.clock, math.floor

local function play(level, sprites)
  RT.spriteImages = sprites
  local g = W.createGame(3)
  if level > 1 then W.jumpToLevel(g, level) end
  g.points = 1e9
  for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur" }) do W.buyAbility(g, id) end
  local R = RT.modules.render.createRenderer()
  local draw, cells, padPx, unitCalls, units, pads, n = 0, 0, 0, 0, 0, 0, 0
  local blocks, tick = {}, 0          -- picture → when its block was last shown; twelve at most
  local last = setmetatable({}, { __mode = "k" })
  for i = 0, steps - 1 do
    local b, m = g.boss, g.map
    local ax, ay
    if m.A then
      local d = g.lastMark == "A" and m.B or m.A
      ax = d.x - b.x > 1 and 1 or d.x - b.x < -1 and -1 or 0
      ay = d.y - b.y > 1 and 1 or d.y - b.y < -1 and -1 or 0
    else ax = floor(i / 200) % 3 - 1; ay = floor(i / 300) % 3 - 1 end
    local press = {}
    if i % 300 == 150 then press.slot1 = true end
    if i % 400 == 100 then press.slot2 = true end
    if i % 700 == 350 then press.slot3 = true end
    if b.hp < b.maxhp * 0.5 and not b.dead then b.hp = b.maxhp end
    W.step(g, { mx = b.x + ax * 30 + i % 7, my = b.y + ay * 30 + 1, ax = ax, ay = ay, press = press, hold = { slot0 = true } }, 1 / 60)
    RT.setlen(g.events, 0)
    g.store, g.won, g.over = false, false, false
    local t = clock()
    R.render(g, { mx = 100, my = 60, cursor = true })
    local sent = RT.Screen.present(nil)
    local took = clock() - t
    local S = RT.Screen.sprites
    tick = tick + 1
    local pp, uc = 0, 0
    if S.pad then
      if not blocks[S.pad] then
        local count, oldest = 0, nil
        for img, at in pairs(blocks) do count = count + 1; if not oldest or at < blocks[oldest] then oldest = img end end
        if count >= 12 then blocks[oldest] = nil end
        for _ in pairs(S.pad.px) do pp = pp + 1 end
      end
      blocks[S.pad] = tick
    end
    for k = 1, S.n do
      local q = S[k]
      local was = last[q.owner]
      if not was then was = {}; last[q.owner] = was; uc = uc + 4 end
      if was.e ~= q.e then uc = uc + 2 end
      if was.x ~= q.x or was.y ~= q.y then uc = uc + 1 end
      if was.z ~= q.z then uc = uc + 1 end
      if was.hi ~= q.hi then uc = uc + 2 end
      was.e, was.x, was.y, was.z, was.hi = q.e, q.x, q.y, q.z, q.hi
    end
    if i >= 120 then
      n = n + 1
      draw, cells, padPx, unitCalls, units, pads = draw + took, cells + sent, padPx + pp, unitCalls + uc, units + S.n, pads + (S.pad and 1 or 0)
    end
  end
  return draw / n * 1000, cells / n, padPx / n, unitCalls / n, units / n, pads / n, g
end

for level = 1, 7 do
  if only == 0 or only == level then
    local d0, c0 = play(level, false)
    local d1, c1, pp, uc, units, pads, g = play(level, true)
    print(string.format("level %d %-17s painted: draw %5.2f ms, %5.0f cells a frame   textures: draw %5.2f ms, %5.0f cells + %4.0f block pixels + %3.0f unit calls a frame (%2.0f units up, boss on its block %3.0f%%)",
      level, tostring(g.map.name), d0, c0, d1, c1, pp, uc, units, pads * 100))
  end
end
