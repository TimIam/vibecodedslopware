-- The Endgame is Me: the adventurers and the boss's adds as pictures from a sheet instead of a dozen little fills
-- each. Loaded after the transpiled renderer, whose drawUnit and drawAdd it stands in front of.
--
-- render.js paints an adventurer from what it is and what it is doing: its class, which way it faces, which foot is
-- forward, whether it has just been hit, and one more thing that depends on its role (a sword mid-swing, a staff
-- that glows, a healer's sparkle, the glint on the king's armour). That is a few hundred different pictures in all,
-- so tools/bake-art.lua paints every one of them with the game's own code into Art/units.tga, and the build lists
-- them in ns.Units by the same number unitKey() gives here. Over a ground image an adventurer is then one texture
-- (Screen.sprite). What is not part of the picture is still painted, exactly as render.js does it: the shadow under
-- the feet (see-through, so it has to be blended), the Z of someone away from their keyboard, the spark of standing
-- in fire, the health bar. Anything this file does not know for certain goes to the original, which paints it.

local ADDON, ns = ...
local RT = ns.RT
local Screen = RT.Screen
local Rm, Wm, art = RT.modules.render, RT.modules.world, RT.modules.art
local floor, ceil, fmod, max = math.floor, math.ceil, math.fmod, math.max
local T = RT.T
local PAL = art.PAL
local screen = Screen:getContext()

-- class → its place in the numbering, and the role the picture was painted for
local CLS = { "warrior", "priest", "druid", "rogue", "berserker", "paladin", "mage", "warlock", "hunter", "pet", "king" }
local CLS_N, ROLE = {}, {}
for i, c in ipairs(CLS) do CLS_N[c] = i - 1; ROLE[c] = Wm.CLASS[c].role end
RT.unitClasses = CLS

-- The number of the picture render.js would paint for this unit now, and how tall its body is; nil if it is not one
-- of the pictures on the sheet. Every test below is the one drawUnit makes, in its words.
local function unitKey(u, g)
  local c = CLS_N[u.cls]
  local role = u.role
  if not c or role ~= ROLE[u.cls] then return nil end
  local moving = T(u.moving)
  local fx
  if moving then fx = u.fx elseif g.boss.x > u.x then fx = 1 else fx = -1 end
  if fx ~= 1 and fx ~= -1 then return nil end
  local walk = u.walk or 0
  if not (walk >= 0) then return nil end
  local st, v, tall = 2, 0, 2
  if role == "pet" then
    st = moving and floor(walk * 1.5) % 2 or 0
  else
    if moving then st = floor(walk) % 2 end
    if role == "tank" then tall = 3
    elseif role == "king" then
      tall = 3
      local k = floor(g.t * 2.3 + u.id)
      if not (k >= 0) then return nil end
      if k % 5 == 0 then v = 1 end
    elseif role == "melee" then if (u.swing or 0) > 0 then v = 1 end
    elseif role == "ranged" then if u.cls ~= "hunter" and (u.cast or 0) > 0.3 and floor(g.t * 10) % 2 ~= 0 then v = 1 end
    elseif role == "healer" then if (u.glow or 0) > 0 then v = 1 end
    else return nil end
  end
  local flash = (u.hit or 0) > 0 and 1 or 0
  return (((c * 2 + (fx > 0 and 1 or 0)) * 3 + st) * 2 + flash) * 2 + v, tall
end
RT.unitKey = unitKey

local function sheet()
  local U = ns.Units
  if U and U.file and RT.spriteImages and Screen.ground then return U end
  return nil
end

local SHADOW, Z_OPTS = "rgba(8,10,6,.4)", { shadow = false, alpha = 0.7 }
local paintUnit = Rm.drawUnit
RT.paintUnit = paintUnit
Rm.drawUnit = function(ctx, u, g)
  local U = ctx == screen and sheet()
  if not U then return paintUnit(ctx, u, g) end
  local key, tall = unitKey(u, g)
  local e = key and U.unit[key]
  if not e then return paintUnit(ctx, u, g) end
  local x, uy = floor(u.x + 0.5), floor(u.y + 0.5)
  local y = uy - (T(u.dance) and fmod(floor(u.dance * 7), 2) or 0)
  if not Screen.sprite(u, e, x + e.ax, y + e.ay) then return paintUnit(ctx, u, g) end
  ctx.fillStyle = SHADOW
  ctx:fillRect(x - 1, uy + 1, 3, 1)
  if u.role == "pet" then return end
  if u.state == "afk" then
    local z = floor(g.t * 2) % 3
    art.drawText(ctx, "Z", x + 2 + z, y - 9 - z * 2, PAL.cream, Z_OPTS)
  end
  if T(u.inFire) and T(u.fireOk) then
    ctx.fillStyle = PAL.fire2
    ctx:fillRect(x, y - tall - 2, 1, 1)
  end
  local hp, maxhp = u.hp, u.maxhp
  if hp and maxhp and hp < maxhp and T(u.party.engaged) then
    local w = max(0, ceil(3 * hp / maxhp))
    ctx.fillStyle = PAL.hpBg
    ctx:fillRect(x - 1, y - tall - 3, 3, 1)
    ctx.fillStyle = hp / maxhp > 0.4 and PAL.heal or PAL.red
    ctx:fillRect(x - 1, y - tall - 3, w, 1)
  end
end

-- The boss's adds that are drawn from the little maps in render.js (ADD_ART): two frames each, mirrored when they
-- face left, white when hit. The ones a level draws itself are left to it.
local ADD = { "gnasher", "spitter", "necro", "skeleton" }
local ADD_N = {}
for i, k in ipairs(ADD) do ADD_N[k] = i - 1 end
RT.addKinds = ADD
local function addKey(a)
  local k = ADD_N[a.kind]
  if not k or T(Rm.LEVEL_ADD_ART[a.kind]) then return nil end
  local fr
  if a.kind == "spitter" or a.kind == "necro" then fr = (a.swing or 0) > 0 and 1 or 0
  elseif T(a.moving) then
    local walk = a.walk or 0
    if not (walk >= 0) then return nil end
    fr = floor(walk) % 2
  else fr = 0 end
  if a.fx == nil or a.fx ~= a.fx then return nil end
  return ((k * 2 + fr) * 2 + (a.fx < 0 and 1 or 0)) * 2 + ((a.hit or 0) > 0 and 1 or 0)
end
RT.addKey = addKey

local paintAdd = Rm.drawAdd
RT.paintAdd = paintAdd
Rm.drawAdd = function(ctx, a, g)
  local U = ctx == screen and sheet()
  if not U then return paintAdd(ctx, a, g) end
  local key = addKey(a)
  local e = key and U.add[key]
  local r = a.r
  if not (e and r and r == r) then return paintAdd(ctx, a, g) end
  local x, y = floor(a.x + 0.5), floor(a.y + 0.5)
  local lift = (a.kind == "gnasher" and (a.swing or 0) > 0) and 1 or 0
  if not Screen.sprite(a, e, x + e.ax, y + e.ay - lift) then return paintAdd(ctx, a, g) end
  ctx.fillStyle = SHADOW
  ctx:fillRect(x - ceil(r), y + 1, ceil(r) * 2 + 1, 1)
  local hp, maxhp = a.hp, a.maxhp
  if hp and maxhp and hp < maxhp then
    local bx, by = x - 2, y - (a.kind == "necro" and 9 or 7)
    ctx.fillStyle = PAL.ink
    ctx:fillRect(bx, by, 5, 1)
    ctx.fillStyle = PAL.gold
    ctx:fillRect(bx, by, max(1, floor(5 * hp / maxhp + 0.5)), 1)
  end
end
