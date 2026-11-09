-- Plays a fixed script of inputs and prints the state every few steps. tools/test/trace.mjs does the same with the
-- browser game's own modules; the two outputs should match line for line.
local seed, level, steps, every, kit = tonumber(arg[1] or 1), tonumber(arg[2] or 1), tonumber(arg[3] or 600), tonumber(arg[4] or 20), tonumber(arg[5] or 0)
local hop = tonumber(arg[6] or 0)   -- hop > 0: the level ends every hop steps, so a short run crosses every level change
local ns = dofile("tools/test/host.lua")
ns.loadGame(ns.SIM)
local W = ns.RT.modules.world
local g = W.createGame(seed)
if level > 1 then W.jumpToLevel(g, level) end
-- kit > 0: buy everything, upgrade it, shuffle the slots, and keep the boss alive so the run goes the distance
if kit > 0 then
  g.points = 1e9
  local ids = { "summon", "beam", "ice", "charge", "haste", "tail", "fur" }
  for _, id in ipairs(ids) do W.buyAbility(g, id) end
  local all = { "swipe", "stomp", "breath", "roar", "summon", "beam", "ice", "charge", "haste", "tail", "fur" }
  for j, id in ipairs(all) do for _ = 1, (kit + j) % 4 do W.upgradeAbility(g, id) end end
  local act = { "swipe", "stomp", "breath", "roar", "summon", "beam", "ice", "charge", "haste", "tail" }
  for sl = 0, 4 do W.setSlot(g, sl, act[(kit * 3 + sl * 2) % 10 + 1]) end
end
local floor = math.floor
local function r(x) return string.format("%.0f", floor(x * 1e4 + 0.5)) end
local DT = 1 / 60
for i = 0, steps - 1 do
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
    if b.hp < b.maxhp * 0.5 and not b.dead then b.hp = b.maxhp end
  end
  W.step(g, { mx = b.x + ax * 30 + i % 7, my = b.y + ay * 30 + 1, ax = ax, ay = ay, press = press, hold = { slot0 = true } }, DT)
  ns.RT.setlen(g.events, 0)
  if hop > 0 and i % hop == hop - 1 and g.map.n < 7 and not g.boss.dead then g.clear = { t = 99 } end
  if g.store then W.nextMap(g) end
  if i % every == 0 or i == steps - 1 then
    print(string.format("%.0f %s %s %s %s %s %.0f %.0f %.0f %.0f %.0f %.0f", i, r(g.t), r(g.score), r(b.hp), r(b.x), r(b.y), g.units.length, g.parties.length, g.props.length, g.critters.length, g.parts.length, g.rng.rngState()))
  end
end
