-- Where a frame's garbage comes from. The client collects in step with what is thrown away, so memory churn is frame
-- time there even when stock Lua does not show it. Plays a level with the collector stopped and, every few hundred
-- VM instructions, charges the memory that appeared since the last look to the line that is running.
--   lua5.1 tools/test/garbage.lua level [frames]
local level, frames = tonumber(arg[1] or 1), tonumber(arg[2] or 200)
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W = RT.modules.world
local floor = math.floor
local R = RT.modules.render.createRenderer()
local g = W.createGame(3)
g.points = 1e9
for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur" }) do W.buyAbility(g, id) end
if level > 1 then W.jumpToLevel(g, level) end

local function frame(i)
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
  R.render(g, { mx = 100, my = 60, cursor = true })
  RT.Screen.present(nil)
end

for i = 0, 299 do frame(i) end   -- the level painted, the sprites made
collectgarbage(); collectgarbage("stop")
local byLine, byFunc = {}, {}
local count = collectgarbage
local last = count("count")
debug.sethook(function()
  local now = count("count")
  local d = now - last
  if d > 0 then
    local info = debug.getinfo(2, "Sl")
    local key = info.short_src:gsub("^.*/", "") .. ":" .. (info.currentline or 0)
    byLine[key] = (byLine[key] or 0) + d
    -- and the nearest caller that is game code rather than the runtime, which is where a fix would go
    for depth = 2, 12 do
      local up = debug.getinfo(depth, "Sl")
      if not up then break end
      if up.short_src:find("game_") then
        local k = up.short_src:gsub("^.*/", "") .. ":" .. (up.currentline or 0)
        byFunc[k] = (byFunc[k] or 0) + d
        break
      end
    end
  end
  last = count("count")
end, "", 200)
local before = count("count")
for i = 300, 300 + frames - 1 do frame(i) end
debug.sethook()
local total = count("count") - before
print(string.format("level %d (%s): %.0f KB of garbage a frame", level, tostring(g.map.name), total / frames))
local function top(t, title, n)
  local names = {}
  for k in pairs(t) do names[#names + 1] = k end
  table.sort(names, function(a, b) return t[a] > t[b] end)
  print(title)
  for i = 1, math.min(n, #names) do print(string.format("  %7.1f KB/frame  %s", t[names[i]] / frames, names[i])) end
end
top(byLine, "by the line that allocated:", 14)
top(byFunc, "by the nearest line of game code:", 22)
