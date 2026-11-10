-- Runs the game headless for a while with the trace bot's inputs, renders through the real renderer into the addon's
-- Screen, and writes the frame as a PPM (tools/test/ppm2png.mjs turns that into a PNG).
--   lua5.1 tools/test/shot.lua seed level steps out.ppm [kit] [renderEvery]
local seed, level, steps, out = tonumber(arg[1] or 1), tonumber(arg[2] or 1), tonumber(arg[3] or 600), arg[4] or "build/shot.ppm"
local kit, every = tonumber(arg[5] or 0), tonumber(arg[6] or 2)
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W = RT.modules.world
local R = RT.modules.render.createRenderer()
local g = W.createGame(seed)
if level > 1 then W.jumpToLevel(g, level) end
if kit > 0 then
  g.points = 1e9
  for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur" }) do W.buyAbility(g, id) end
  local act = { "swipe", "stomp", "breath", "roar", "summon", "beam", "ice", "charge", "haste", "tail" }
  for sl = 0, 4 do W.setSlot(g, sl, act[(kit * 3 + sl * 2) % 10 + 1]) end
end
local floor = math.floor
local DT = 1 / 60
local tSim, tDraw, frames, cells, worst, warm = 0, 0, 0, 0, 0, 0
local clock = os.clock
local aimX, aimY = 100, 60
local function advance(i, draw)
  local b, m = g.boss, g.map
  local ax, ay
  if m.A then
    local d = g.lastMark == "A" and m.B or m.A
    local dx, dy = d.x - b.x, d.y - b.y
    ax = dx > 1 and 1 or dx < -1 and -1 or 0
    ay = dy > 1 and 1 or dy < -1 and -1 or 0
  else
    ax = floor(i / 200) % 3 - 1
    ay = floor(i / 300) % 3 - 1
  end
  local press = {}
  if i % 300 == 150 then press.slot1 = true end
  if i % 400 == 100 then press.slot2 = true end
  if i % 700 == 350 then press.slot3 = true end
  if i % 50 == 25 then press.shake = true end
  if kit > 0 then
    if i % 90 == 10 then press.slot0 = true end
    if i % 230 == 60 then press.slot4 = true end
  end
  -- any kit but 0 keeps the boss on its feet, so a long run gets as far as the raids
  if kit ~= 0 and b.hp < b.maxhp * 0.5 and not b.dead then b.hp = b.maxhp end
  local mx, my = b.x + ax * 30 + i % 7, b.y + ay * 30 + 1
  aimX, aimY = mx - g.cam.x, my - g.cam.y
  local t0 = clock()
  W.step(g, { mx = mx, my = my, ax = ax, ay = ay, press = press, hold = { slot0 = true } }, DT)
  RT.setlen(g.events, 0)
  if g.store then W.nextMap(g) end
  local t1 = clock()
  tSim = tSim + t1 - t0
  if draw then
    R.render(g, { mx = aimX, my = aimY, cursor = true })
    local c = RT.Screen.present(nil)
    local dt = clock() - t1
    -- the first second paints the level and the boss's sprites; steady state is what the frame rate depends on
    if i >= 60 then cells = cells + c; frames = frames + 1; tDraw = tDraw + dt; if dt > worst then worst = dt end else warm = warm + dt end
  end
end
for i = 0, steps - 1 do advance(i, i % every == 0 or i == steps - 1) end
-- kit -1 is for pictures: no bought abilities and an honest HUD; it runs on until the boss is mid-wind-up and not
-- flashing white from a hit, so the frame shows a telegraph
if kit < 0 then
  local i = steps
  while i < steps + 600 and not (g.boss.flash <= 0 and g.boss.act and not g.boss.act.fired and g.boss.act.kind ~= "shake" and g.boss.act.t > 0.1) do
    advance(i, false)
    i = i + 1
  end
  advance(i, true)
  steps = i + 1
end
local px = RT.Screen.snapshot()
local f = assert(io.open(out, "wb"))
f:write("P6\n320 180\n255\n")
local row = {}
for y = 0, 179 do
  for x = 0, 319 do
    local v = px[y * 320 + x + 1]
    row[x + 1] = string.char(floor(v / 65536), floor(v / 256) % 256, v % 256)
  end
  f:write(table.concat(row))
end
f:close()
print(string.format("level %d: %d steps, sim %.3f ms/step, draw %.2f ms/frame (worst %.1f, first second %.0f ms), %.0f cells recoloured per frame, units %d props %d",
  g.map.n, steps, tSim / steps * 1000, tDraw / frames * 1000, worst * 1000, warm * 1000, cells / frames, g.units.length, g.props.length))
