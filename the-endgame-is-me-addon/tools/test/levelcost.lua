-- Does a level cost more when it is reached by playing than when it is the first thing loaded? Plays each level
-- with the trace bot and prints the time a frame takes and the memory held after a full collection, either walking
-- through the levels in one run as the addon does (nextMap, one renderer) or starting cold at one level.
--   lua5.1 tools/test/levelcost.lua walk [steps]         levels 1 to 7 in one run
--   lua5.1 tools/test/levelcost.lua cold <level> [steps]  one level, nothing before it
local how, a2, a3 = arg[1] or "walk", arg[2], arg[3]
local steps = tonumber(how == "walk" and a2 or a3) or 900
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W = RT.modules.world
local clock, floor = os.clock, math.floor
local R = RT.modules.render.createRenderer()
local g = W.createGame(3)
g.points = 1e9
for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur" }) do W.buyAbility(g, id) end

local function count(t, seen)
  local n = 0
  for _ in pairs(t) do n = n + 1 end
  return n
end

local function play(n)
  local sim, draw, cells, kb, moved = 0, 0, 0, 0, 0
  local lastX, lastY = 0, 0
  for i = 0, n - 1 do
    if i == n - 100 then collectgarbage(); collectgarbage("stop"); kb = collectgarbage("count") end
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
    local t = clock()
    W.step(g, { mx = b.x + ax * 30 + i % 7, my = b.y + ay * 30 + 1, ax = ax, ay = ay, press = press, hold = { slot0 = true } }, 1 / 60)
    RT.setlen(g.events, 0)
    g.store, g.won, g.over = false, false, false
    local t1 = clock()
    R.render(g, { mx = 100, my = 60, cursor = true })
    local sent = RT.Screen.present(nil)
    if i >= 120 then
      sim, draw, cells = sim + t1 - t, draw + clock() - t1, cells + sent   -- skip the level being painted
      -- textures the display would have to move for this camera: a column of 180 or a row of 320 per pixel scrolled
      moved = moved + math.min(320, math.abs(RT.Screen.vx - lastX)) * 180 + math.min(180, math.abs(RT.Screen.vy - lastY)) * 320
    end
    lastX, lastY = RT.Screen.vx, RT.Screen.vy
  end
  kb = (collectgarbage("count") - kb) / 100
  collectgarbage("restart")
  return sim / (n - 120) * 1000, draw / (n - 120) * 1000, cells / (n - 120), kb, moved / (n - 120)
end

local function report()
  local sim, draw, cells, kb, moved = play(steps)
  collectgarbage(); collectgarbage()
  local t = clock()
  collectgarbage()
  local gc = (clock() - t) * 1000
  local lists = {}
  for k, v in pairs(g) do
    if type(v) == "table" and v.length and v.length > 0 then lists[#lists + 1] = k .. "=" .. v.length end
  end
  table.sort(lists)
  print(string.format("level %d %-16s %4dx%-4d sim %5.2f ms  draw %5.2f ms  %5d cells recoloured  %5d moved  %4.0f KB garbage a frame  held %6.1f MB  full collect %4.0f ms   %s",
    g.map.n, tostring(g.map.name), g.map.w, g.map.h, sim, draw, cells, moved, kb,
    collectgarbage("count") / 1024, gc, table.concat(lists, " ")))
end

if how == "cold" then
  local lv = tonumber(a2) or 1
  if lv > 1 then W.jumpToLevel(g, lv) end
  report()
else
  report()
  for _ = 2, 7 do
    W.nextMap(g)
    R.reset()
    report()
  end
end
