-- Which drawing primitives a frame's time goes to, and on whose behalf: wraps the Screen's fillRect and drawImage and
-- the art module's drawText, and charges each call to the renderer function that is running (drawHud, drawWater...).
--   lua5.1 tools/test/prims.lua level [steps]
local level, steps = tonumber(arg[1] or 1), tonumber(arg[2] or 700)
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W, Rm, Art = RT.modules.world, RT.modules.render, RT.modules.art
local clock, floor = os.clock, math.floor
local owner = "render"
local t, n = {}, {}
local function prim(tab, key, label)
  local f = tab[key]
  tab[key] = function(...)
    local k = owner .. " > " .. label
    local t0 = clock()
    local a, b = f(...)
    t[k] = (t[k] or 0) + clock() - t0
    n[k] = (n[k] or 0) + 1
    return a, b
  end
end
local SMeta = getmetatable(RT.Screen:getContext())
prim(SMeta, "fillRect", "fillRect"); prim(SMeta, "drawImage", "drawImage"); prim(SMeta, "drawDithered", "drawDithered")
for k, f in pairs(Rm) do
  if type(f) == "function" and k:find("^draw") then
    Rm[k] = function(...)
      local was = owner
      if was == "render" then owner = k end
      local t0 = clock()
      local a, b = f(...)
      if was == "render" then t[k] = (t[k] or 0) + clock() - t0; n[k] = (n[k] or 0) + 1 end
      owner = was
      return a, b
    end
  end
end
local L = RT.modules["levels/index"].LEVELS[level - 1]
if L.art then for k, f in pairs(L.art) do if type(f) == "function" then
  L.art[k] = function(...)
    local was = owner
    if was == "render" then owner = "art." .. k end
    local t0 = clock()
    local a, b = f(...)
    if was == "render" then t["art." .. k] = (t["art." .. k] or 0) + clock() - t0; n["art." .. k] = (n["art." .. k] or 0) + 1 end
    owner = was
    return a, b
  end
end end end
local R = Rm.createRenderer()
local g = W.createGame(3)
if level > 1 then W.jumpToLevel(g, level) end
g.points = 1e9
for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur" }) do W.buyAbility(g, id) end
local total, tr = 0, 0
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
  if i == 120 then for k in pairs(t) do t[k], n[k] = 0, 0 end; total = clock(); tr = 0 end
  local t0 = clock()
  R.render(g, { mx = 100, my = 60, cursor = true })
  tr = tr + clock() - t0
  RT.Screen.present(nil)
end
local frames = steps - 121
print(string.format("level %d: render %.2f ms a frame (timers included)", level, tr / frames * 1000))
local names = {}
for k in pairs(t) do names[#names + 1] = k end
table.sort(names, function(a, b) return t[a] > t[b] end)
for i = 1, math.min(26, #names) do local k = names[i]; print(string.format("  %-34s %6.2f ms/frame %8.1f calls/frame", k, t[k] / frames * 1000, n[k] / frames)) end
