-- A fingerprint of the picture, for proving that a speed-up changed no pixel: plays every level with a bot that
-- walks, casts everything on the bar and wrecks things, and prints a checksum of the screen every few frames.
-- Save the output before a change, run it again after, and diff.
--   lua5.1 tools/test/framehash.lua [steps] [every] > build/frames_before.txt
local steps, every = tonumber(arg[1] or 1500), tonumber(arg[2] or 7)
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local W = RT.modules.world
local floor = math.floor
for level = 1, 7 do
  local R = RT.modules.render.createRenderer()
  local g = W.createGame(3)
  if level > 1 then W.jumpToLevel(g, level) end
  g.points = 1e9
  for _, id in ipairs({ "summon", "beam", "ice", "charge", "haste", "tail", "fur" }) do W.buyAbility(g, id) end
  local bars = { { "swipe", "stomp", "breath", "roar", "summon" }, { "swipe", "beam", "charge", "ice", "tail" }, { "swipe", "breath", "haste", "beam", "stomp" } }
  for i = 0, steps - 1 do
    local b, m = g.boss, g.map
    if i % 500 == 0 then local bar = bars[floor(i / 500) % 3 + 1]; for s = 1, 5 do W.setSlot(g, s - 1, bar[s]) end end
    local ax, ay
    if m.A and i % 1000 < 600 then
      local d = g.lastMark == "A" and m.B or m.A
      ax = d.x - b.x > 1 and 1 or d.x - b.x < -1 and -1 or 0
      ay = d.y - b.y > 1 and 1 or d.y - b.y < -1 and -1 or 0
    else ax = floor(i / 170) % 3 - 1; ay = floor(i / 230) % 3 - 1; if m.scroll == "x" and ax == 0 then ax = 1 end end
    local press = {}
    if i % 90 == 30 then press.slot1 = true end
    if i % 130 == 70 then press.slot2 = true end
    if i % 210 == 110 then press.slot3 = true end
    if i % 250 == 190 then press.slot4 = true end
    if b.hp < b.maxhp * 0.5 and not b.dead then b.hp = b.maxhp end
    W.step(g, { mx = b.x + ax * 30 + i % 7, my = b.y + ay * 30 + 1, ax = ax, ay = ay, press = press, hold = { slot0 = i % 400 < 300 } }, 1 / 60)
    RT.setlen(g.events, 0)
    g.store, g.won, g.over = false, false, false
    R.render(g, { mx = 100 + i % 50, my = 60, cursor = true })
    RT.Screen.present(nil)
    if i % every == 0 then
      local snap, h = RT.Screen.snapshot(), 0
      for k = 1, #snap do h = (h * 31 + snap[k]) % 2147483647 end
      print(level, i, h, RT.Screen.vx, RT.Screen.vy, b.act and b.act.kind or "-")
    end
  end
end
