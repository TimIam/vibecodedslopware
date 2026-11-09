-- Where a frame's time goes: wraps every function of the renderer, the level art and the Screen with a timer, plays
-- a level with the trace bot, and prints the most expensive (inclusive time, so callers include their callees).
--   lua5.1 tools/test/profile.lua level steps [kit]
local level, steps, kit = tonumber(arg[1] or 1), tonumber(arg[2] or 900), tonumber(arg[3] or 1)
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W = RT.modules.world
local clock = os.clock
local acc, calls = {}, {}
local function wrap(tab, key, label)
  local f = tab[key]
  if type(f) ~= "function" then return end
  acc[label], calls[label] = 0, 0
  tab[key] = function(...)
    local t = clock()
    local a, b, c = f(...)
    acc[label] = acc[label] + clock() - t
    calls[label] = calls[label] + 1
    return a, b, c
  end
end
for k in pairs(RT.modules.render) do wrap(RT.modules.render, k, "render." .. k) end
for _, name in ipairs({ "begin", "present" }) do wrap(RT.Screen, name, "Screen." .. name) end
local L = RT.modules["levels/index"].LEVELS[level - 1]
if L.art then
  for k, v in pairs(L.art) do
    if type(v) == "function" then wrap(L.art, k, "art." .. k)
    elseif type(v) == "table" then for k2 in pairs(v) do wrap(v, k2, "art." .. k .. "." .. k2) end end
  end
end
for k in pairs(W) do if k == "step" then wrap(W, k, "world.step") end end
local R = RT.modules.render.createRenderer()
local g = W.createGame(3)
if level > 1 then W.jumpToLevel(g, level) end
if kit > 0 then
  g.points = 1e9
  for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur" }) do W.buyAbility(g, id) end
end
local floor = math.floor
local total = 0
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
  if i == 120 then for k in pairs(acc) do acc[k], calls[k] = 0, 0 end; total = clock() end   -- skip the level being painted
  R.render(g, { mx = 100, my = 60, cursor = true })
  RT.Screen.present(nil)
end
total = clock() - total
local names = {}
for k in pairs(acc) do names[#names + 1] = k end
table.sort(names, function(a, b) return acc[a] > acc[b] end)
local frames = steps - 121
print(string.format("level %d: %.2f ms a frame in all (with the timers' own cost)", level, total / frames * 1000))
for i = 1, math.min(16, #names) do
  local k = names[i]
  print(string.format("  %-28s %6.2f ms/frame  %7.1f calls/frame", k, acc[k] / frames * 1000, calls[k] / frames))
end
