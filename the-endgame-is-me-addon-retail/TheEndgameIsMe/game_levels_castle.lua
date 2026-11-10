-- Generated from the-endgame-is-me/js/levels/castle.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("levels/castle");
local __I0 = RT.module("props");
local __I1 = RT.module("levels/city");
local __Array, __Set, __T, __add, __assign, __assignKV, __band, __fill, __filter, __has, __hypot, __includes, __it, __join, __orv, __parseInt, __push, __reduce, __shift, __shr, __slice, __some, __sort, __str, __typed, __unpack = RT["Array"], RT["Set"], RT["T"], RT["add"], RT["assign"], RT["assignKV"], RT["band"], RT["fill"], RT["filter"], RT["has"], RT["hypot"], RT["includes"], RT["it"], RT["join"], RT.orv, RT["parseInt"], RT["push"], RT["reduce"], RT["shift"], RT["shr"], RT["slice"], RT["some"], RT["sort"], RT["str"], RT["typed"], RT["unpack"];
local __NaN = 0 / 0;
local __mabs, __matan2, __mceil, __mcos, __mfloor, __mfmod, __mmax, __mmin, __msin, __msqrt = math.abs, math.atan2, math.ceil, math.cos, math.floor, math.fmod, math.max, math.min, math.sin, math.sqrt;

-- levels/castle:45
M.blockDown = function(g, p) 
__push((function() if not __T(g.ruins) then g.ruins = {length=0} end; return g.ruins end)(), {x=p.x, y=p.y, w=p.w, h=p.h, seed=p.seed, castle=true});
for i = 0, 6 - 1 do
local a = (g.rng() * M.TAU);
if g.cs then __push(g.cs.dust, {x=((p.x or __NaN) + (__mcos(a) * 4)), y=((p.y or __NaN) + (__msin(a) * 4)), vx=(__mcos(a) * 10), vy=((__msin(a) * 6) - 4), t=0, life=(0.8 + (g.rng() * 0.6))}); end;
end;
end;
-- levels/castle:50
M.towerDown = function(g, p) 
M.blockDown(g, p);
if g.cs then __push(g.cs.fallen, p); end;
local len = (__T(p.donjon) and 58 or 46);
if g.cs then __push(g.cs.topples, {x=p.x, y=p.y, ang=p.fallA, len=len, t=0, hit=false, seed=p.seed, roof=p.roof, donjon=p.donjon, r=((p.w or __NaN) / 2)}); end;
end;
-- levels/castle:59
M.build = function(g, rng) 
g.ruins = {length=0};
local cs = (function() g.cs = {cell=__fill(__Array(((M.COLS * M.ROWS) + 200)), nil), orig=__typed("Uint8Array", (M.COLS * M.ROWS)), blocks={length=0}, topples={length=0}, falls={length=0}, dust={length=0}, won=false, crumbleT=0, share=0, fallen={length=0}, garrisons={length=0}, king=nil, manned=false}; return g.cs end)();
local key = function(c, r) 
return (((((c >= 0) and (r >= 0)) and (c < M.COLS)) and (r < M.ROWS)) and ((r * M.COLS) + c) or (-1));
end;
local taken = __Set();
local block = function(kind, c, r, n, extra) if n == nil then n = 1 end; if extra == nil then extra = {} end;
local w = (M.C * n);
local p = __I0.addProp(g, kind, ((M.X0 + (c * M.C)) + (w / 2)), ((M.Y0 + (r * M.C)) + (w / 2)), __assign({w=w, h=w, castle=true, gc=c, gr=r, gn=n}, extra));
if __T(extra.hp) then
p.maxhp = extra.hp;
end;
__push(cs.blocks, p);
for dr = 0, __mceil(n) - 1 do
for dc = 0, __mceil(n) - 1 do
local k = key(__mfloor((c + dc)), __mfloor((r + dr)));
if (k >= 0) then
cs.cell[k] = p;
cs.orig[k] = 1;
__add(taken, k);
end;
end;
end;
do return p end;
end;
do
local __t4, __t5 = __it(M.TOWERS), 0;
while __t5 < __t4.length do
local t = __t4[__t5]; __t5 = __t5 + 1;
block("castle_tower", t.c, t.r, t.n, __assign({roof=t.roof, banner=(not (not __T(t.banner))), donjon=(not (not __T(t.donjon)))}, (__T(t.donjon) and {hp=1600} or {})));
end;
end;
block("castle_gate", M.GATE.c, M.GATE.r, M.GATE.n);
for r = 0, __mceil(M.ROWS) - 1 do
for c = 0, __mceil(M.COLS) - 1 do
repeat
local edge = ((((r < 2) or (r >= (M.ROWS - 2))) or (c < 2)) or (c >= (M.COLS - 2)));
local keep = ((((c >= (M.KEEP.c0 or __NaN)) and (c <= (M.KEEP.c1 or __NaN))) and (r >= (M.KEEP.r0 or __NaN))) and (r <= (M.KEEP.r1 or __NaN)));
if (((not edge) and (not keep)) or __has(taken, key(c, r))) then
do break end;
end;
block((keep and "castle_keep" or "castle_wall"), c, r);
until true;
end;
end;
cs.total = __reduce(cs.blocks, function(s, p) 
return (s + (p.maxhp or __NaN));
end, 0);
local bld = function(kind, x, y, w, h) 
local d = __I0.KINDS[kind];
local hp = __mfloor(((d.hp or __NaN) * __msqrt(((w * h) / ((d.w or __NaN) * (d.h or __NaN))))) + 0.5);
local p = __I0.addProp(g, kind, (x + (w / 2)), (y + (h / 2)), {w=w, h=h, hp=hp, maxhp=hp});
p.v = __mfmod((p.seed or __NaN), 3);
end;
bld("city_chapel", 206, 186, 42, 48);
bld("city_shop", 62, 92, 30, 24);
bld("city_shop", 62, 120, 30, 24);
bld("city_pub", 228, 92, 30, 24);
bld("city_house", 62, 256, 34, 24);
bld("city_house", 62, 284, 34, 22);
bld("city_inn", 216, 262, 40, 44);
__I0.addProp(g, "city_fountain", 116, 214);
do
local __t9, __t10 = __it({[0]={[0]=80, 196, length=2}, {[0]=80, 222, length=2}, {[0]=148, 284, length=2}, {[0]=176, 284, length=2}, {[0]=176, 210, length=2}, length=5}), 0;
while __t10 < __t9.length do
local __t12 = __t9[__t10]; __t10 = __t10 + 1; local x, y; x = __t12[0]; y = __t12[1];
__I0.addProp(g, "city_tent", x, y, {v=__mfloor((rng() * 4))});
end;
end;
do
local __t13, __t14 = __it({[0]={[0]=100, 296, length=2}, {[0]=130, 298, length=2}, {[0]=196, 300, length=2}, {[0]=150, 210, length=2}, {[0]=190, 236, length=2}, length=5}), 0;
while __t14 < __t13.length do
local __t16 = __t13[__t14]; __t14 = __t14 + 1; local x, y; x = __t16[0]; y = __t16[1];
__I0.addProp(g, "city_stall", x, y);
end;
end;
do
local __t17, __t18 = __it({[0]={[0]=100, 250, length=2}, {[0]=220, 250, length=2}, {[0]=140, 320, length=2}, {[0]=180, 320, length=2}, length=4}), 0;
while __t18 < __t17.length do
local __t20 = __t17[__t18]; __t18 = __t18 + 1; local x, y; x = __t20[0]; y = __t20[1];
__I0.addProp(g, "city_lamp", x, y);
end;
end;
do
local __t21, __t22 = __it({[0]=408, 428, length=2}), 0;
while __t22 < __t21.length do
local y = __t21[__t22]; __t22 = __t22 + 1;
__I0.addProp(g, "city_lamp", 136, y);
__I0.addProp(g, "city_lamp", 188, y);
end;
end;
for i = 0, 10 - 1 do
__I0.addCritter(g, "city_folk", (100 + (rng() * 120)), (200 + (rng() * 110)), {col=__mfloor((rng() * 6))});
end;
for i = 0, 6 - 1 do
__I0.addCritter(g, "city_folk", (30 + (rng() * 260)), (402 + (rng() * 26)), {col=__mfloor((rng() * 6))});
end;
local water = __I0.makeWater(M.MW, M.MH);
__I0.setWater(water, 0, M.MOAT.y0, M.MW, ((M.MOAT.y1 or __NaN) - 1), 1);
__I0.setWater(water, M.BRIDGE.x0, M.MOAT.y0, ((M.BRIDGE.x1 or __NaN) - 1), ((M.MOAT.y1 or __NaN) - 1), 2);
g.water = water;
local canals = {[0]={y0=M.MOAT.y0, y1=M.MOAT.y1, bridges={[0]=M.BRIDGE, length=1}, cross={[0]=(((M.BRIDGE.x0 or __NaN) + (M.BRIDGE.x1 or __NaN)) / 2), length=1}}, length=1};
do return {w=M.MW, h=M.MH, scroll="y", start={x=160, y=420, face=((-math.pi) / 2)}, canals=canals} end;
end;
-- levels/castle:119
M.freeSpot = function(g, x, y, r, inYard) if r == nil then r = 9 end; if inYard == nil then inYard = false end;
local yard = function(px, py) 
return ((((px > ((M.X0 + (2 * M.C)) + r)) and (px < ((M.X0 + ((M.COLS - 2) * M.C)) - r))) and (py > ((M.Y0 + (2 * M.C)) + r))) and (py < ((M.Y0 + ((M.ROWS - 2) * M.C)) - r)));
end;
local clear = function(px, py) 
if (((__T(__I0.isWater(g, px, py)) or (px < 12)) or (px > (M.MW - 12))) or (__T(inYard) and (not yard(px, py)))) then
do return false end;
end;
do
local __t26, __t27 = __it(__I0.near(g, px, py, (r + 4))), 0;
while __t27 < __t26.length do
local q = __t26[__t27]; __t27 = __t27 + 1;
if (((q.state == "up") and __T(__I0.KINDS[q.kind].solid)) and __I0.touches(q, px, py, r)) then
do return false end;
end;
end;
end;
do return true end;
end;
for d = 0, 60 - 1, 3 do
for k = 0, __mmax(1, (d * 2)) - 1 do
local a = ((k / __mmax(1, (d * 2))) * M.TAU);
local px = (x + (__mcos(a) * d));
local py = (y + (__msin(a) * d));
if clear(px, py) then
do return {x=__mfloor(px + 0.5), y=__mfloor(py + 0.5)} end;
end;
end;
end;
do return {x=x, y=y} end;
end;
-- levels/castle:132
M.manCastle = function(g, api) 
local cs = g.cs;
cs.manned = true;
do
local __t31, __t32 = __it(cs.blocks), 0;
while __t32 < __t31.length do
repeat
local t = __t31[__t32]; __t32 = __t32 + 1;
if ((t.kind ~= "castle_tower") or __T(t.donjon)) then
do break end;
end;
local dx = (M.MIDX - (t.x or __NaN));
local dy = (M.MIDY - (t.y or __NaN));
local l = ((__hypot(dx, dy) ~= 0) and __hypot(dx, dy) or 1);
local s = M.freeSpot(g, ((t.x or __NaN) + ((dx / l) * (((t.w or __NaN) / 2) + 16))), ((t.y or __NaN) + ((dy / l) * (((t.w or __NaN) / 2) + 16))), 8, true);
local p = api.garrison(g, {x=s.x, y=s.y, size=5, guard=52, leash=110, power=M.GARRISON_POWER});
p.tower = t;
__push(cs.garrisons, p);
until true;
end;
end;
do
local __t34, __t35 = __it({[0]={[0]=162, 360, false, length=3}, {[0]=74, 258, true, length=3}, {[0]=246, 150, true, length=3}, length=3}), 0;
while __t35 < __t34.length do
local __t37 = __t34[__t35]; __t35 = __t35 + 1; local x, y, yard; x = __t37[0]; y = __t37[1]; yard = __t37[2];
local s = M.freeSpot(g, x, y, 8, yard);
__push(cs.garrisons, api.garrison(g, {x=s.x, y=s.y, size=5, guard=52, leash=110}));
end;
end;
local ky = (M.Y0 + (((M.KEEP.r1 or __NaN) + 1) * M.C));
cs.raid = api.garrison(g, {x=M.MIDX, y=(ky + 22), size=40, guard=58, leash=150, power=M.RAID_POWER});
cs.king = api.king(g, {x=M.MIDX, y=(ky + 6), hp=30});
end;
-- levels/castle:156
M.towerFell = function(g, api, t) 
do
local __t38, __t39 = __it(g.cs.garrisons), 0;
while __t39 < __t38.length do
repeat
local p = __t38[__t39]; __t39 = __t39 + 1;
if ((p.tower ~= t) or __T(p.done)) then
do break end;
end;
local dead = 0;
do
local __t41, __t42 = __it(api.alive(p)), 0;
while __t42 < __t41.length do
local u = __t41[__t42]; __t42 = __t42 + 1;
if (__hypot(((u.x or __NaN) - (t.x or __NaN)), ((u.y or __NaN) - (t.y or __NaN))) < (((t.w or __NaN) / 2) + 22)) then
api.hurtUnit(g, u, 9999);
dead = dead + 1;
end;
end;
end;
local left = api.alive(p);
if ((left.length or #left) ~= 0) then
api.scatter(g, p);
api.bark(g, left[0], (__T(dead) and "RUN!!!" or "NOPE"));
end;
api.text(g, t.x, ((t.y or __NaN) - 22), (__T(dead) and "GARRISON CRUSHED" or "GARRISON ROUTED"), "gold", 1.6);
until true;
end;
end;
end;
-- levels/castle:168
M.updateKing = function(g, api) 
local cs = g.cs;
local k = cs.king;
local b = g.boss;
if ((not __T(k)) or __T(cs.kingDone)) then
do return end;
end;
if (((((not __T(k.dead)) and (not __T(k.gone))) and (not __T(b.dead))) and (not __T(g.won))) and (__hypot(((k.x or __NaN) - (b.x or __NaN)), ((k.y or __NaN) - (b.y or __NaN))) < ((b.r or __NaN) + 3.5))) then
api.hurtUnit(g, k, 9999);
end;
if __T(k.dead) then
cs.kingDone = true;
local pts = __mfloor((M.KING_BONUS * (g.mult or __NaN)) + 0.5);
api.addScore(g, pts);
api.text(g, k.x, ((k.y or __NaN) - 12), ("+" .. __str(pts)), "gold", 2.2);
for i = 0, 18 - 1 do
local a = (g.rng() * M.TAU);
local s = (15 + (g.rng() * 40));
api.part(g, k.x, ((k.y or __NaN) - 2), (__mcos(a) * s), (__msin(a) * s), 0.6, ((__mfmod(i, 3) ~= 0) and "spark" or "blood"));
end;
api.sound(g, "crunch");
if (not __T(g.won)) then
api.banner(g, "THE KING IS CRUSHED", ("+" .. __str(pts) .. ". THE ARMOUR WAS MOSTLY GOLD LEAF."), 4);
end;
elseif __T(k.gone) then
cs.kingDone = true;
end;
end;
-- levels/castle:185
M.castleShare = function(g) 
local cs = g.cs;
local down = 0;
do
local __t45, __t46 = __it(cs.blocks), 0;
while __t46 < __t45.length do
local p = __t45[__t46]; __t46 = __t46 + 1;
down = (down + (function() if (p.state == "up") then return M.clamp(((p.maxhp or __NaN) - (p.hp or __NaN)), 0, p.maxhp); else return p.maxhp; end; end)());
end;
end;
do return (down / (cs.total or __NaN)) end;
end;
-- levels/castle:193
M.openings = function(g) 
local out = {length=0};
local open = function(c, r) 
return (not __T(M.standing(g, c, r)));
end;
local runAlong = function(n, isOpen, mk) 
local run = 0;
for i = 0, n do
repeat
if ((i < n) and __T(isOpen(i))) then
run = run + 1;
do break end;
end;
if __T(run) then
__push(out, __assignKV(__assign({}, mk((i - (run / 2)))), "hw", ((run * M.C) / 2)));
end;
run = 0;
until true;
end;
end;
local xs = function(i) 
return (M.X0 + (i * M.C));
end;
local ys = function(i) 
return (M.Y0 + (i * M.C));
end;
local R = (M.Y0 + (M.ROWS * M.C));
local Rx = (M.X0 + (M.COLS * M.C));
runAlong(M.COLS, function(c) 
return (open(c, (M.ROWS - 1)) and open(c, (M.ROWS - 2)));
end, function(m) 
return {side=2, ox=xs(m), oy=(R + 20), ix=xs(m), iy=((R - (2 * M.C)) - 5)};
end);
runAlong(M.COLS, function(c) 
return (open(c, 0) and open(c, 1));
end, function(m) 
return {side=0, ox=xs(m), oy=(M.Y0 - 20), ix=xs(m), iy=((M.Y0 + (2 * M.C)) + 5)};
end);
runAlong(M.ROWS, function(r) 
return (open(0, r) and open(1, r));
end, function(m) 
return {side=3, ox=(M.X0 - 20), oy=ys(m), ix=((M.X0 + (2 * M.C)) + 5), iy=ys(m)};
end);
runAlong(M.ROWS, function(r) 
return (open((M.COLS - 1), r) and open((M.COLS - 2), r));
end, function(m) 
return {side=1, ox=(Rx + 20), oy=ys(m), ix=((Rx - (2 * M.C)) - 5), iy=ys(m)};
end);
do return out end;
end;
-- levels/castle:212
M.sidesOf = function(x, y) 
local s = {length=0};
if (y < (M.Y0 - 3)) then
__push(s, 0);
end;
if (x > ((M.X0 + (M.COLS * M.C)) + 3)) then
__push(s, 1);
end;
if (y > ((M.Y0 + (M.ROWS * M.C)) + 3)) then
__push(s, 2);
end;
if (x < (M.X0 - 3)) then
__push(s, 3);
end;
do return s end;
end;
-- levels/castle:222
M.steerThroughWalls = function(g, dt) 
local cs = g.cs;
local b = g.boss;
if ((not __T(cs.openT)) or (((g.t or __NaN) - (cs.openT or __NaN)) > 0.5)) then
cs.openT = g.t;
cs.open = M.openings(g);
end;
if (not ((cs.open.length or #cs.open) ~= 0)) then
do return end;
end;
local inside = function(x, y) 
return ((((x > (M.X0 + 4)) and (x < ((M.X0 + (M.COLS * M.C)) - 4))) and (y > (M.Y0 + 4))) and (y < ((M.Y0 + (M.ROWS * M.C)) - 4)));
end;
do
local __t49, __t50 = __it(g.units), 0;
while __t50 < __t49.length do
repeat
local u = __t49[__t50]; __t50 = __t50 + 1;
if ((((__T(u.dead) or __T(u.gone)) or (u.role == "rider")) or ((u.stun or __NaN) > 0)) or ((u.y or __NaN) > ((M.MOAT.y0 or __NaN) - 2))) then
do break end;
end;
local t;
if (((u.state == "flee") or (u.state == "leave")) and __T(u.exit)) then t = u.exit; elseif ((not __T((u.party and u.party.engaged))) and (__T(u.post) or __T(u.stage))) then t = (__T(u.post) and u.post or u.stage); else t = b; end;
local ui = inside(u.x, u.y);
if (ui == inside(t.x, t.y)) then
do break end;
end;
local best = nil;
local bd = 1000000000;
do
local __t52, __t53 = __it(cs.open), 0;
while __t53 < __t52.length do
local o = __t52[__t53]; __t53 = __t53 + 1;
local d = (ui and (__hypot(((o.ix or __NaN) - (u.x or __NaN)), ((o.iy or __NaN) - (u.y or __NaN))) + __hypot(((t.x or __NaN) - (o.ox or __NaN)), ((t.y or __NaN) - (o.oy or __NaN)))) or (__hypot(((o.ox or __NaN) - (u.x or __NaN)), ((o.oy or __NaN) - (u.y or __NaN))) + __hypot(((t.x or __NaN) - (o.ix or __NaN)), ((t.y or __NaN) - (o.iy or __NaN)))));
if (d < bd) then
bd = d;
best = o;
end;
end;
end;
local o = best;
local tx;
local ty;
if ui then
local near = ((((__mfmod((o.side or __NaN), 2) ~= 0) and __mabs(((u.y or __NaN) - (o.iy or __NaN))) or __mabs(((u.x or __NaN) - (o.ix or __NaN)))) < ((o.hw or __NaN) - 2)) and (__hypot(((o.ix or __NaN) - (u.x or __NaN)), ((o.iy or __NaN) - (u.y or __NaN))) < 12));
if near then tx = o.ox; else tx = o.ix; end;
if near then ty = o.oy; else ty = o.iy; end;
else
local sides = M.sidesOf(u.x, u.y);
local corner;
if ((sides.length or #sides) == 2) then corner = M.RING[((__includes(sides, 3) and __includes(sides, 0)) and 3 or __mmin(__unpack(__it(sides))))]; else corner = nil; end;
local past = ({[0]=((u.y or __NaN) < (M.Y0 - 13)), ((u.x or __NaN) > ((M.X0 + (M.COLS * M.C)) + 13)), ((u.y or __NaN) > ((M.Y0 + (M.ROWS * M.C)) + 13)), ((u.x or __NaN) < (M.X0 - 13)), length=4})[o.side];
if ((__T(corner) and __includes(sides, o.side)) and (not __T(past))) then
tx = corner.x;
ty = corner.y;
elseif ((not ((sides.length or #sides) ~= 0)) or __includes(sides, o.side)) then
local near = ((((__mfmod((o.side or __NaN), 2) ~= 0) and __mabs(((u.y or __NaN) - (o.oy or __NaN))) or __mabs(((u.x or __NaN) - (o.ox or __NaN)))) < ((o.hw or __NaN) - 2)) or (not ((sides.length or #sides) ~= 0)));
if near then tx = o.ix; else tx = o.ox; end;
if near then ty = o.iy; else ty = o.oy; end;
else
local s = sides[0];
local cw = __mfmod((((o.side or __NaN) - s) + 4), 4);
local k;
if ((cw <= 2) and (not ((cw == 2) and (((u.x or __NaN) + ((u.y or __NaN) * 0.01)) < 160)))) then k = s; else k = __mfmod((s + 3), 4); end;
tx = M.RING[k].x;
ty = M.RING[k].y;
end;
end;
local dx = (tx - (u.x or __NaN));
local dy = (ty - (u.y or __NaN));
local d = ((__hypot(dx, dy) ~= 0) and __hypot(dx, dy) or 1);
local sp = __mmin((d / dt), 70);
u.x = ((u.x or __NaN) + (((dx / d) * sp) * dt));
u.y = ((u.y or __NaN) + (((dy / d) * sp) * dt));
until true;
end;
end;
end;
-- levels/castle:262
M.update = function(g, dt, api) 
local cs = g.cs;
if (not __T(cs)) then
do return end;
end;
if (not __T(cs.manned)) then
M.manCastle(g, api);
end;
if (((not __T(cs.kingSaid)) and (((g.t or __NaN) - (g.levelT0 or __NaN)) > 4.5)) and (not __T(g.won))) then
cs.kingSaid = true;
api.banner(g, "THE KING IS AT HOME", "GOLD ARMOUR. VERY SHINY. VERY THIN.", 3.4);
end;
__I1.steerHeroes(g, dt, g.map.canals);
M.steerThroughWalls(g, dt);
while ((cs.fallen.length or #cs.fallen) ~= 0) do
M.towerFell(g, api, __shift(cs.fallen));
end;
M.updateKing(g, api);
do
local __t56, __t57 = __it(cs.topples), 0;
while __t57 < __t56.length do
local t = __t56[__t57]; __t57 = __t57 + 1;
t.t = ((t.t or __NaN) + dt);
if ((not __T(t.hit)) and ((t.t or __NaN) >= 0.42)) then
t.hit = true;
local ca = __mcos((t.ang or __NaN));
local sa = __msin((t.ang or __NaN));
local done = __Set();
g.shake = __mmax((g.shake or __NaN), 0.55);
api.sound(g, "collapse");
do
local s = ((t.r or __NaN) * 0.6);
while (s <= (t.len or __NaN)) do
local x = ((t.x or __NaN) + (ca * s));
local y = ((t.y or __NaN) + (sa * s));
do
local __t60, __t61 = __it(__I0.near(g, x, y, 10)), 0;
while __t61 < __t60.length do
repeat
local q = __t60[__t61]; __t61 = __t61 + 1;
if (((q.state ~= "up") or __has(done, q)) or (not __I0.touches(q, x, y, 7))) then
do break end;
end;
__add(done, q);
if __T(__I0.KINDS[q.kind].solid) then
__I0.hitProp(g, q, (__T(t.donjon) and 520 or 420), t.ang);
else
__I0.knockDown(g, q, t.ang);
end;
until true;
end;
end;
do
local __t63, __t64 = __it(g.units), 0;
while __t64 < __t63.length do
local u = __t63[__t64]; __t64 = __t64 + 1;
if ((((not __T(u.dead)) and (not __T(u.gone))) and (__hypot(((u.x or __NaN) - x), ((u.y or __NaN) - y)) < 9)) and (not __has(done, u))) then
__add(done, u);
api.hurtUnit(g, u, 180);
end;
end;
end;
for i = 0, 2 - 1 do
api.part(g, (x + ((g.rng() - 0.5) * 10)), (y + ((g.rng() - 0.5) * 8)), ((g.rng() - 0.5) * 50), ((-10) - (g.rng() * 30)), (0.5 + (g.rng() * 0.4)), ((g.rng() < 0.6) and "dust" or "splinter"));
end;
s = (s + 4);
end;
end;
do
local s = ((t.len or __NaN) * 0.35);
while (s <= (t.len or __NaN)) do
__I0.addProp(g, "castle_rubble", (((t.x or __NaN) + (ca * s)) + ((g.rng() - 0.5) * 6)), (((t.y or __NaN) + (sa * s)) + ((g.rng() - 0.5) * 6)));
s = (s + 9);
end;
end;
if (__T(g.water) and __T(__I0.isWater(g, ((t.x or __NaN) + ((ca * (t.len or __NaN)) * 0.85)), ((t.y or __NaN) + ((sa * (t.len or __NaN)) * 0.85))))) then
__I0.fillWater(g, ((t.x or __NaN) + ((ca * (t.len or __NaN)) * 0.85)), ((t.y or __NaN) + ((sa * (t.len or __NaN)) * 0.85)), 3);
end;
end;
end;
end;
do
local __t68, __t69 = __it(cs.dust), 0;
while __t69 < __t68.length do
local d = __t68[__t69]; __t69 = __t69 + 1;
d.t = ((d.t or __NaN) + dt);
d.x = ((d.x or __NaN) + ((d.vx or __NaN) * dt));
d.y = ((d.y or __NaN) + ((d.vy or __NaN) * dt));
d.vx = ((d.vx or __NaN) * 0.96);
d.vy = ((d.vy or __NaN) * 0.96);
end;
end;
if (((cs.dust.length or #cs.dust) > 60) or __some(cs.dust, function(d) 
return ((d.t or __NaN) > (d.life or __NaN));
end)) then
cs.dust = __slice(__filter(cs.dust, function(d) 
return ((d.t or __NaN) < (d.life or __NaN));
end), (-60));
end;
cs.share = M.castleShare(g);
if (((not __T(cs.won)) and (not __T(g.boss.dead))) and ((cs.share or __NaN) >= M.WIN_SHARE)) then
cs.won = true;
api.win(g);
end;
if __T(cs.won) then
cs.crumbleT = ((cs.crumbleT or __NaN) - dt);
if ((cs.crumbleT or __NaN) <= 0) then
cs.crumbleT = 0.09;
local left = __filter(cs.blocks, function(p) 
return (p.state == "up");
end);
if (left.length ~= 0) then
local p = left[__mfloor((g.rng() * left.length))];
__I0.knockDown(g, p, (g.rng() * M.TAU));
end;
end;
end;
end;
-- levels/castle:324
M.edges = function(g, p) 
local c = p.gc;
local r = p.gr;
local out = {length=0};
do
local __t71, __t72 = __it({[0]={[0]=0, (-1), length=2}, {[0]=1, 0, length=2}, {[0]=0, 1, length=2}, {[0]=(-1), 0, length=2}, length=4}), 0;
while __t72 < __t71.length do
local __t74 = __t71[__t72]; __t72 = __t72 + 1; local dc, dr; dc = __t74[0]; dr = __t74[1];
local q = M.standing(g, (c + dc), (r + dr));
__push(out, ((__T(q) and (q.kind ~= "castle_tower")) and 0 or ((M.wasThere(g, (c + dc), (r + dr)) and (not (__T(q) and (q.kind == "castle_tower")))) and 2 or 1)));
end;
end;
do return out end;
end;
-- levels/castle:334
M.blockSprite = function(h, kind, mask, stage, v) 
local L = M.LIFT[kind];
local keep = (kind == "castle_keep");
local gate = (kind == "castle_gate");
local W = (gate and 20 or M.C);
local D = (gate and 20 or M.C);
do return h.sprite(("cb|" .. __str(kind) .. "|" .. __join(mask, "") .. "|" .. __str(stage) .. "|" .. __str(v)), W, (D + L), function(c) 
local eN, eE, eS, eW;
local __t75 = mask; eN = __t75[0]; eE = __t75[1]; eS = __t75[2]; eW = __t75[3];
local seed = ((v * 31) + 7);
for y = 0, __mceil(D) - 1 do
for x = 0, __mceil(W) - 1 do
local col;
if keep then
col = ((__mfmod(((x + (y * 3)) + v), 7) == 0) and "#3e4650" or ((__mfmod(y, 4) == 0) and "#454e58" or "#525c66"));
else
local row = __mfloor((y / 3));
local lx = __mfmod(((x + (row * 2)) + v), 5);
if ((lx == 0) or (__mfmod(y, 3) == 2)) then col = __I1.STONEP[1]; else col = __I1.STONEP[(2 + ((h.hash((__mfloor((((x + (row * 2)) + v) / 5)) + seed), row) > 0.6) and 1 or 0))]; end;
end;
M.put(c, x, y, col);
end;
end;
local merlon = function(x, y) 
M.put(c, x, y, __I1.STONEP[5]);
end;
local side = function(e, horiz, at, inward) 
if (e == 0) then
do return end;
end;
do
local i = 0;
while (i < (__T(horiz) and W or D)) do
local x;
if __T(horiz) then x = i; else x = at; end;
local y;
if __T(horiz) then y = at; else y = i; end;
if (e == 1) then
local m = (__mfmod(i, 4) < 2);
M.put(c, x, y, (function() if m then return __I1.STONEP[4]; else return __I1.INK; end; end)());
local x2;
if __T(horiz) then x2 = i; else x2 = (at + inward); end;
local y2 = (__T(horiz) and (at + inward) or i);
M.put(c, x2, y2, (function() if m then return __I1.STONEP[5]; else return __I1.STONEP[1]; end; end)());
else
M.put(c, x, y, (function() if (h.hash((i + seed), at) > 0.5) then return __I1.INK; else return __I1.STONEP[1]; end; end)());
if (h.hash(at, (i + seed)) > 0.6) then
local x2;
if __T(horiz) then x2 = i; else x2 = (at + inward); end;
local y2 = (__T(horiz) and (at + inward) or i);
M.put(c, x2, y2, "#2a2620");
end;
end;
i = i + 1;
end;
end;
end;
side(eN, true, 0, 1);
side(eS, true, (D - 1), (-1));
side(eW, false, 0, 1);
side(eE, false, (W - 1), (-1));
if (eN == 1) then
merlon(0, 0);
end;
do
local y = D;
while (y < (D + L)) do
for x = 0, __mceil(W) - 1 do
local yy = (y - D);
local course = __mfloor((yy / 3));
local mortar = ((__mfmod(yy, 3) == 2) or (__mfmod(((x + (course * 4)) + v), 6) == 0));
local l = (((2 + ((x < 2) and 1 or 0)) - ((yy > (L - 3)) and 1 or 0)) + ((yy == 0) and 1 or 0));
M.put(c, x, y, (function() if mortar then return __I1.STONEP[1]; else return __I1.STONEP[M.clamp((l + ((h.hash((x + seed), course) > 0.8) and 1 or 0)), 0, 5)]; end; end)());
end;
y = y + 1;
end;
end;
M.rect(c, 0, D, W, 1, __I1.INK);
if gate then
M.rect(c, 3, (D + 1), (W - 6), (L - 1), __I1.INK);
do
local y = (D + 2);
while (y < (D + L)) do
for x = 4, __mceil((W - 4)) - 1 do
M.put(c, x, y, ((__mfmod((x - 4), 3) == 0) and "#2a1a0e" or "#5a3a22"));
end;
y = y + 1;
end;
end;
for x = 5, __mceil((W - 4)) - 1, 3 do
M.rect(c, x, (D + 2), 1, (L - 2), "#6b6c63");
end;
elseif (keep and (v == 1)) then
M.rect(c, 4, (D + 2), 2, 5, M.SLIT);
M.put(c, 4, (D + 3), M.LITW);
elseif ((not keep) and (v == 2)) then
M.rect(c, 4, (D + 2), 1, 3, M.SLIT);
end;
if ((v == 0) and (not keep)) then
M.put(c, 1, ((D + L) - 2), M.MOSS);
M.put(c, 2, ((D + L) - 1), M.MOSS);
end;
if (stage >= 1) then
for i = 0, __mceil(stage) - 1 do
local x = (1 + __mfloor((h.hash(i, (seed + 3)) * (W - 3))));
local y = ((D + 1) + __mfloor((h.hash(seed, i) * 2)));
for k = 0, __mceil((L - 2)) - 1 do
M.put(c, x, (y + k), "#1c1814");
if (h.hash(k, (i + seed)) > 0.6) then
x = (x + ((h.hash(i, (k + seed)) > 0.5) and 1 or (-1)));
end;
end;
end;
for i = 0, __mceil((2 + (stage * 2))) - 1 do
M.put(c, (1 + __mfloor((h.hash((i * 3), (seed + 9)) * (W - 2)))), (1 + __mfloor((h.hash((seed + 9), (i * 3)) * (D - 2)))), ((__band(i, 1) ~= 0) and "#2a2620" or __I1.STONEP[1]));
end;
end;
if (stage >= 2) then
local hx = (1 + __mfloor((h.hash(seed, 21) * (W - 5))));
local hy = (2 + __mfloor((h.hash(21, seed) * (D - 5))));
M.rect(c, hx, hy, 2, 2, "#0c0a08");
M.put(c, (hx + 2), (hy + 1), "#2a2620");
M.put(c, hx, hy, "#2a2620");
for i = 0, 3 - 1 do
M.put(c, __mfloor((h.hash(i, (seed + 5)) * W)), 0, "#2a2620");
end;
M.rect(c, __mfloor((h.hash(seed, 33) * (W - 3))), ((D + L) - 4), 2, 2, "#0c0a08");
end;
M.rect(c, 0, ((D + L) - 1), W, 1, __I1.INK);
end) end;
end;
-- levels/castle:398
M.towerSprite = function(h, p, stage) 
local S = p.w;
local L = (__T(p.donjon) and 26 or M.LIFT.castle_tower);
local R = ((S / 2) - 1);
local roof = p.roof;
local donjon = p.donjon;
local key = ("tw|" .. __str(S) .. "|" .. __str(roof) .. "|" .. __str((__T(donjon) and 1 or 0)) .. "|" .. __str((__T(p.banner) and 1 or 0)) .. "|" .. __str(stage));
do return h.sprite(key, S, ((S + L) + ((roof == "cone") and 8 or 0)), function(c) 
local top = ((roof == "cone") and 8 or 0);
local cx = ((S / 2) - 0.5);
local cy = ((top + (S / 2)) - 0.5);
for y = __mfloor(cy), __mceil(((S + L) + top)) - 1 do
for x = 0, __mceil(S) - 1 do
repeat
local dx = (x - cx);
local body = ((__mabs(dx) <= R) and (y < (((cy + L) + 0.5) + (__msqrt(__mmax(0, ((R * R) - (dx * dx)))) * 0.5))));
if (not body) then
do break end;
end;
local edge = ((__mabs(dx) > (R - 1)) or (not ((y + 1) < (((cy + L) + 0.5) + (__msqrt(__mmax(0, ((R * R) - (dx * dx)))) * 0.5)))));
local course = __mfloor(((y - cy) / 3));
local lx = (dx / R);
local l = ((lx < (-0.55)) and 4 or ((lx < (-0.1)) and 3 or ((lx < 0.5) and 2 or 1)));
local mortar = ((__mfmod((y - __mfloor(cy)), 3) == 2) or (__mfmod(((__mfloor((dx * 1.4) + 0.5) + (course * 3)) + 40), 6) == 0));
M.put(c, x, y, (function() if edge then return __I1.INK; elseif mortar then return __I1.STONEP[__mmax(0, (l - 2))]; else return __I1.STONEP[l]; end; end)());
until true;
end;
end;
M.rect(c, (__mfloor(cx + 0.5) - 1), __mfloor((cy + (L * 0.45)) + 0.5), 2, 4, M.SLIT);
if (__T(donjon) or __T(p.banner)) then
M.put(c, (__mfloor(cx + 0.5) - 1), (__mfloor((cy + (L * 0.45)) + 0.5) + 1), M.LITW);
end;
if __T(p.banner) then
local bx = (__mfloor(cx + 0.5) - 4);
local by = __mfloor((cy + (R * 0.6)) + 0.5);
M.rect(c, (bx - 1), by, 10, 13, __I1.INK);
M.rect(c, bx, by, 8, 11, "#8a1e18");
M.rect(c, bx, by, 2, 11, "#a82a20");
M.rect(c, (bx + 2), (by + 4), 4, 1, "#ffd75a");
M.put(c, (bx + 2), (by + 3), "#ffd75a");
M.put(c, (bx + 5), (by + 3), "#ffd75a");
M.put(c, bx, (by + 11), "#8a1e18");
M.put(c, (bx + 7), (by + 11), "#8a1e18");
end;
for y = 0, __mceil((S + top)) - 1 do
for x = 0, __mceil(S) - 1 do
repeat
local dx = (x - cx);
local dy = (y - cy);
local d = __hypot(dx, dy);
if (roof == "cone") then
local k = ((y - ((cy - R) - top)) / (R + top));
local rr = (R + 1);
if (y > cy) then
if (d > rr) then
do break end;
end;
else
local half = (rr * M.clamp(((y - ((cy - R) - top)) / (R + top)), 0, 1));
if (__mabs(dx) > half) then
do break end;
end;
end;
local a = __matan2((dy - ((y > cy) and 0 or 0)), dx);
local lit = ((dx < (-1)) and 4 or ((dx < 2) and 3 or ((dx < (R * 0.6)) and 2 or 1)));
local pal;
if __T(donjon) then pal = __I1.ROOF_PAL.tile; else pal = __I1.ROOF_PAL.slate; end;
local ring = ((y > cy) and (d > (rr - 1)));
local outline = (((y <= cy) and (__mabs(dx) > ((rr * M.clamp(k, 0, 1)) - 1))) or ring);
M.put(c, x, y, (function() if outline then return __I1.INK; elseif ((__mfmod(__mfloor((dx + 20) + 0.5), 3) == 0) and (y < cy)) then return pal[__mmax(0, (lit - 1))]; else return pal[lit]; end; end)());
local __t92 = nil;
else
if (d > (R + 0.5)) then
do break end;
end;
local rim = (d > (R - 2.5));
local ang = __matan2(dy, dx);
local col;
if (d > (R - 0.5)) then
col = __I1.INK;
elseif rim then
if (__mfmod(__mfloor(((ang + 4) * 4.2)), 2) ~= 0) then col = (function() if ((dx + dy) < 0) then return __I1.STONEP[5]; else return __I1.STONEP[3]; end; end)(); else col = __I1.STONEP[1]; end;
else
local ring = (__mfmod(__mfloor(d), 4) == 0);
local spoke = (__mfloor((((((ang + 4) * 8) / M.TAU) * 1.0001) * ((d > 6) and 2 or 1))) ~= __mfloor(((((__matan2(dy, (dx + 0.7)) + 4) * 8) / M.TAU) * ((d > 6) and 2 or 1))));
if (ring or spoke) then col = __I1.STONEP[1]; else col = __I1.STONEP[(2 + ((__mfmod((__mfloor((d / 4)) + __mfloor(((ang + 4) * 3))), 3) == 0) and 1 or 0))]; end;
end;
M.put(c, x, y, col);
end;
until true;
end;
end;
if (roof == "cone") then
M.put(c, __mfloor(cx + 0.5), 0, (__T(donjon) and "#ffd75a" or "#c8962a"));
M.put(c, __mfloor(cx + 0.5), 1, __I1.INK);
else
M.rect(c, (__mfloor(cx + 0.5) - 1), (__mfloor(cy + 0.5) - 1), 3, 3, "#4a3a2a");
M.put(c, (__mfloor(cx + 0.5) - 1), (__mfloor(cy + 0.5) - 1), "#6a5a44");
end;
local body0 = __mfloor(((cy + R) + 1) + 0.5);
local bodyH = __mmax(4, __mfloor(((L - (R * 0.5)) - 2) + 0.5));
if (stage >= 1) then
for i = 0, __mceil((1 + (stage * 2))) - 1 do
local x = __mfloor((((cx - R) + 3) + (h.hash(i, S) * ((R * 2) - 6))) + 0.5);
local y = (body0 + __mfloor((h.hash(S, i) * 2)));
for k = 0, bodyH - 1 do
M.put(c, x, (y + k), "#1c1814");
if (h.hash(k, i) > 0.55) then
x = (x + ((h.hash(i, k) > 0.5) and 1 or (-1)));
end;
end;
end;
end;
if (stage >= 2) then
local hx = (__mfloor(cx + 0.5) + 1);
local hy = (__mfloor(cy + 0.5) - ((roof == "cone") and 6 or 3));
M.rect(c, hx, hy, 6, 4, "#0c0a08");
M.rect(c, (hx + 1), hy, 1, 4, "#5a3a22");
M.rect(c, (hx + 4), hy, 1, 4, "#5a3a22");
M.rect(c, hx, (hy + 4), 6, 1, __I1.INK);
M.rect(c, (__mfloor(cx + 0.5) - 8), (body0 + 2), 4, 3, "#0c0a08");
end;
end) end;
end;
-- levels/castle:463
M.ruinField = function(h, r) 
local W = __mfloor((r.w or __NaN) + 0.5);
local D = __mfloor((r.h or __NaN) + 0.5);
local v = __mfmod((r.seed or __NaN), 4);
do return h.sprite(("cruin|" .. __str(W) .. "|" .. __str(v)), (W + 4), (D + 4), function(c) 
for y = 0, (D + 4) - 1 do
for x = 0, (W + 4) - 1 do
repeat
local e = __mmin(x, y, ((W + 3) - x), ((D + 3) - y));
local n = h.hash((x + (v * 13)), (y + W));
if ((e < 2) and (n < 0.6)) then
do break end;
end;
if (n < 0.55) then
M.put(c, x, y, ((n < 0.2) and "#3a342b" or "#4a4236"));
end;
until true;
end;
end;
for i = 0, __mceil(((W * D) / 14)) - 1 do
local x = (1 + __mfloor((h.hash(i, ((v * 7) + W)) * (W + 1))));
local y = (1 + __mfloor((h.hash(((v * 7) + W), i) * (D + 1))));
local s = ((h.hash(i, (i + v)) > 0.65) and 2 or 1);
M.rect(c, (x + 1), (y + 1), s, s, "#1c1814");
M.rect(c, x, y, s, s, __I1.STONEP[(2 + __mfloor((h.hash(x, y) * 3)))]);
end;
end) end;
end;
-- levels/castle:481
M.fallenTower = function(h, t) 
local a8 = __mfmod(__mfloor(((__mfmod((__mfmod((t.ang or __NaN), M.TAU) + M.TAU), M.TAU) / M.TAU) * 16) + 0.5), 16);
local ang = ((a8 / 16) * M.TAU);
local L = t.len;
local S = __mceil(((L * 2) + 16));
do return h.sprite(("ftw|" .. __str(a8) .. "|" .. __str(L) .. "|" .. __str(t.roof) .. "|" .. __str((__T(t.donjon) and 1 or 0)) .. "|" .. __str(__mfmod((t.seed or __NaN), 3))), S, S, function(c) 
local C2 = (S / 2);
local ca = __mcos(ang);
local sa = __msin(ang);
local v = __mfmod((t.seed or __NaN), 3);
local blobs = {length=0};
for s = 2, __mceil(L) - 1, 2 do
local wid = (7 - ((s / L) * 2));
for k = 0, 4 - 1 do
local off = (((h.hash((s + v), k) - 0.5) * wid) * 2);
__push(blobs, {[0]=((C2 + (ca * s)) - (sa * off)), ((C2 + (sa * s)) + (ca * off)), ((h.hash(k, (s + v)) > 0.6) and 3 or 2), length=3});
end;
end;
__sort(blobs, function(a, b) 
return ((a[1] or __NaN) - (b[1] or __NaN));
end);
do
local __t100, __t101 = __it(blobs), 0;
while __t101 < __t100.length do
local __t103 = __t100[__t101]; __t101 = __t101 + 1; local x, y, s; x = __t103[0]; y = __t103[1]; s = __t103[2];
M.rect(c, (__mfloor(x + 0.5) - 1), __mfloor(y + 0.5), (s + 2), (s + 1), "#1c1814");
end;
end;
do
local __t104, __t105 = __it(blobs), 0;
while __t105 < __t104.length do
local __t107 = __t104[__t105]; __t105 = __t105 + 1; local x, y, s; x = __t107[0]; y = __t107[1]; s = __t107[2];
M.rect(c, __mfloor(x + 0.5), __mfloor(y + 0.5), s, s, __I1.STONEP[(2 + __mfmod(__mfloor((x + y) + 0.5), 3))]);
M.put(c, __mfloor(x + 0.5), __mfloor(y + 0.5), __I1.STONEP[5]);
end;
end;
if (t.roof == "cone") then
local pal;
if __T(t.donjon) then pal = __I1.ROOF_PAL.tile; else pal = __I1.ROOF_PAL.slate; end;
local ex = (C2 + (ca * (L - 2)));
local ey = (C2 + (sa * (L - 2)));
for k = 0, 9 - 1 do
local x = __mfloor((ex + ((h.hash(k, v) - 0.5) * 10)) + 0.5);
local y = __mfloor((ey + ((h.hash(v, k) - 0.5) * 8)) + 0.5);
M.rect(c, (x - 1), (y - 1), 5, 4, __I1.INK);
M.rect(c, x, y, 3, 2, pal[(2 + __mfmod(k, 3))]);
end;
M.put(c, __mfloor((ex + (ca * 4)) + 0.5), __mfloor((ey + (sa * 4)) + 0.5), (__T(t.donjon) and "#ffd75a" or "#c8962a"));
end;
end) end;
end;
-- levels/castle:507
M.drawBlock = function(ctx, p, g, h) 
if (p.state ~= "up") then
do return end;
end;
local L = M.LIFT[p.kind];
local x = (__mfloor(((p.x or __NaN) - ((p.w or __NaN) / 2)) + 0.5) + (((p.hitT or __NaN) > 0.07) and 1 or 0));
local y = (__mfloor(((p.y or __NaN) - ((p.h or __NaN) / 2)) + 0.5) - L);
local st = ((((p.hp or __NaN) / (p.maxhp or __NaN)) < 0.34) and 2 or ((((p.hp or __NaN) / (p.maxhp or __NaN)) < 0.67) and 1 or 0));
local spr = M.blockSprite(h, p.kind, ((p.kind == "castle_gate") and {[0]=1, 0, 1, 0, length=4} or M.edges(g, p)), st, __mfmod((p.seed or __NaN), 4));
ctx.globalAlpha = 0.3;
ctx.fillStyle = "#05080a";
ctx:fillRect((x + 3), ((y + L) + 2), p.w, p.h);
ctx.globalAlpha = 1;
ctx:drawImage(spr, x, y);
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, ((p.burnT or __NaN) / 10));
ctx:drawImage(h.tinted(spr, "#1a120c"), x, y);
ctx.globalAlpha = 1;
end;
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.5;
ctx:drawImage(h.tinted(spr, "#ffffff"), x, y);
ctx.globalAlpha = 1;
end;
end;
-- levels/castle:517
M.drawTower = function(ctx, p, g, h) 
if (p.state ~= "up") then
do return end;
end;
local L = (__T(p.donjon) and 26 or M.LIFT.castle_tower);
local top = ((p.roof == "cone") and 8 or 0);
local st = ((((p.hp or __NaN) / (p.maxhp or __NaN)) < 0.34) and 2 or ((((p.hp or __NaN) / (p.maxhp or __NaN)) < 0.67) and 1 or 0));
local spr = M.towerSprite(h, p, st);
local x = (__mfloor(((p.x or __NaN) - ((p.w or __NaN) / 2)) + 0.5) + (((p.hitT or __NaN) > 0.07) and 1 or 0));
local y = (((__mfloor(((p.y or __NaN) - ((p.h or __NaN) / 2)) + 0.5) - L) - top) + __mfloor((((p.w or __NaN) / 2) - ((((p.w or __NaN) / 2) - 1) / 2)) + 0.5));
ctx.globalAlpha = 0.3;
ctx.fillStyle = "#05080a";
for k = (-4), 4 do
local hw = __mfloor((((p.w or __NaN) / 2) * __msqrt((1 - ((k / 5) ^ 2)))) + 0.5);
ctx:fillRect(((__mfloor((p.x or __NaN) + 0.5) + 5) - hw), ((__mfloor(((p.y or __NaN) + ((p.h or __NaN) / 2)) + 0.5) - 2) + k), (hw * 2), 1);
end;
ctx.globalAlpha = 1;
ctx:drawImage(spr, x, y);
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.5;
ctx:drawImage(h.tinted(spr, "#ffffff"), x, y);
ctx.globalAlpha = 1;
end;
end;
-- levels/castle:529
M.drawRubble = function(ctx, p, g, h) 
ctx:drawImage(__I1.rubbleSprite(h, __mfmod((p.seed or __NaN), 4), (__mfmod((p.seed or __NaN), 5) == 0)), (__mfloor((p.x or __NaN) + 0.5) - 4), (__mfloor((p.y or __NaN) + 0.5) - 3));
end;
-- levels/castle:537
M.ground = function(ctx, m, h) 
local zone = __typed("Uint8Array", ((m.w or __NaN) * (m.h or __NaN)));
__I1.fillZone(zone, m.w, M.X0, M.Y0, (M.X0 + (M.COLS * M.C)), (M.Y0 + (M.ROWS * M.C)), 1);
__I1.fillZone(zone, m.w, 140, (M.Y0 + (M.ROWS * M.C)), 184, m.h, 0);
local grassy = __typed("Uint8Array", ((m.w or __NaN) * (m.h or __NaN)));
for y = 0, __mceil(m.h) - 1 do
for x = 0, __mceil(m.w) - 1 do
local inCastle = ((((x >= M.X0) and (x < (M.X0 + (M.COLS * M.C)))) and (y >= M.Y0)) and (y < (M.Y0 + (M.ROWS * M.C))));
local road = (((x >= 140) and (x < 184)) and (y >= (M.MOAT.y1 or __NaN)));
if ((not inCastle) and (not road)) then
grassy[((y * (m.w or __NaN)) + x)] = 1;
end;
end;
end;
__I1.paintGround(ctx, m, h, zone);
for y = 0, __mceil(m.h) - 1 do
for x = 0, __mceil(m.w) - 1 do
repeat
if (not __T(grassy[((y * (m.w or __NaN)) + x)])) then
do break end;
end;
local n = (((h.vnoise((x / 18), (y / 18)) * 0.6) + (h.vnoise(((x / 6) + 40), (y / 6)) * 0.25)) + (h.hash(x, y) * 0.2));
local col = M.GRASS[M.clamp(__mfloor((((n * 3.6) - 0.4) + (__band((x + y), 1) * 0.3))), 0, 3)];
if (((y > (M.MOAT.y1 or __NaN)) and (__mabs(((x - 162) + (__msin((y / 20)) * 4))) < 30)) and (h.hash((x * 3), y) < (0.5 - (__mabs((x - 162)) / 70)))) then
col = M.DIRT[__mfloor((h.hash(x, (y * 7)) * 3))];
end;
M.put(ctx, x, y, col);
until true;
end;
end;
for i = 0, 400 - 1 do
repeat
local x = __mfloor((h.hash(i, 5) * (m.w or __NaN)));
local y = __mfloor((h.hash(5, i) * (m.h or __NaN)));
if (not __T(grassy[((y * (m.w or __NaN)) + x)])) then
do break end;
end;
M.put(ctx, x, y, ((__mfmod(i, 3) ~= 0) and "#56763a" or "#6c8f46"));
if (__mfmod(i, 7) == 0) then
M.put(ctx, x, (y - 1), ((__mfmod(i, 2) ~= 0) and "#f4ecd2" or "#e8d23a"));
end;
until true;
end;
do
local __t115, __t116 = __it({[0]={[0]=((M.MOAT.y0 or __NaN) - 3), M.MOAT.y0, length=2}, {[0]=M.MOAT.y1, ((M.MOAT.y1 or __NaN) + 3), length=2}, length=2}), 0;
while __t116 < __t115.length do
local __t118 = __t115[__t116]; __t116 = __t116 + 1; local y0, y1; y0 = __t118[0]; y1 = __t118[1];
do
local y = y0;
while (y < y1) do
for x = 0, __mceil(m.w) - 1 do
M.put(ctx, x, y, ((__mfmod((x + (y * 3)), 8) == 0) and "#3a3833" or (((y == ((M.MOAT.y0 or __NaN) - 3)) or (y == ((M.MOAT.y1 or __NaN) + 2))) and "#6e6a5e" or "#8d8878")));
end;
y = y + 1;
end;
end;
end;
end;
M.rect(ctx, 140, ((M.MOAT.y1 or __NaN) + 3), 1, m.h, "#2a2723");
M.rect(ctx, 183, ((M.MOAT.y1 or __NaN) + 3), 1, m.h, "#2a2723");
__I1.sideWall(ctx, 0, 5, ((M.MOAT.y1 or __NaN) + 3), m.h, h, false);
__I1.sideWall(ctx, ((m.w or __NaN) - 5), 5, ((M.MOAT.y1 or __NaN) + 3), m.h, h, true);
end;
-- levels/castle:571
M.under = function(ctx, g, h) 
local V = h.VIEW;
if (((M.MOAT.y1 or __NaN) > ((V.y or __NaN) - 10)) and ((M.MOAT.y0 or __NaN) < (((V.y or __NaN) + (h.H or __NaN)) + 10))) then
local s = h.sprite("drawbridge", ((M.BRIDGE.x1 or __NaN) - (M.BRIDGE.x0 or __NaN)), (((M.MOAT.y1 or __NaN) - (M.MOAT.y0 or __NaN)) + 4), function(c) 
local W = ((M.BRIDGE.x1 or __NaN) - (M.BRIDGE.x0 or __NaN));
local D = (((M.MOAT.y1 or __NaN) - (M.MOAT.y0 or __NaN)) + 4);
for y = 0, __mceil(D) - 1 do
for x = 0, __mceil(W) - 1 do
M.put(c, x, y, ((__mfmod(x, 4) == 0) and "#3a2414" or ((__mfmod(y, 6) == 0) and "#5a3a22" or ((x < (W / 2)) and "#7a5030" or "#6a4428"))));
end;
end;
for y = 0, __mceil(D) - 1, 6 do
M.put(c, 2, (y + 1), "#a9b4c2");
M.put(c, (W - 3), (y + 1), "#a9b4c2");
end;
M.rect(c, 0, 0, 1, D, __I1.INK);
M.rect(c, (W - 1), 0, 1, D, __I1.INK);
M.rect(c, 0, (D - 1), W, 1, __I1.INK);
for y = 0, __mceil((D - 2)) - 1, 2 do
M.put(c, 3, y, "#55564f");
M.put(c, (W - 4), y, "#55564f");
end;
end);
ctx:drawImage(s, M.BRIDGE.x0, ((M.MOAT.y0 or __NaN) - 2));
end;
if __T(g.ruins) then
do
local __t125, __t126 = __it(g.ruins), 0;
while __t126 < __t125.length do
repeat
local r = __t125[__t126]; __t126 = __t126 + 1;
if ((((r.y or __NaN) + (r.h or __NaN)) < ((V.y or __NaN) - 6)) or (((r.y or __NaN) - (r.h or __NaN)) > (((V.y or __NaN) + (h.H or __NaN)) + 6))) then
do break end;
end;
ctx:drawImage(M.ruinField(h, r), (__mfloor(((r.x or __NaN) - ((r.w or __NaN) / 2)) + 0.5) - 2), (__mfloor(((r.y or __NaN) - ((r.h or __NaN) / 2)) + 0.5) - 2));
until true;
end;
end;
end;
do
local __t128, __t129 = __it((function() local __t131 = (g.cs and g.cs.topples); if __T(__t131) then return __t131 end; return {length=0} end)()), 0;
while __t129 < __t128.length do
repeat
local t = __t128[__t129]; __t129 = __t129 + 1;
if (not __T(t.hit)) then
do break end;
end;
local s = M.fallenTower(h, t);
ctx:drawImage(s, __mfloor(((t.x or __NaN) - ((s.width or __NaN) / 2)) + 0.5), __mfloor(((t.y or __NaN) - ((s.height or __NaN) / 2)) + 0.5));
until true;
end;
end;
end;
-- levels/castle:595
M.disc = function(ctx, cx, cy, r, col) 
ctx.fillStyle = col;
for y = (-__mfloor(r)), __mfloor(r) do
local w = __mfloor(__msqrt(((r * r) - (y * y))));
ctx:fillRect((cx - w), (cy + y), ((w * 2) + 1), 1);
end;
end;
-- levels/castle:600
M.over = function(ctx, g, h) 
local cs = g.cs;
if (not __T(cs)) then
do return end;
end;
do
local __t133, __t134 = __it(cs.topples), 0;
while __t134 < __t133.length do
repeat
local t = __t133[__t134]; __t134 = __t134 + 1;
if __T(t.hit) then
do break end;
end;
local k = __mmin(1, ((t.t or __NaN) / 0.42));
local e = (k * k);
local ca = __mcos((t.ang or __NaN));
local sa = __msin((t.ang or __NaN));
local n = __mceil(((t.len or __NaN) / 3));
for i = 0, n do
local s = (((i / n) * (t.len or __NaN)) * e);
local lift = (((1 - e) * (16 + (i * 0.6))) * (i / n));
local x = __mfloor(((t.x or __NaN) + (ca * s)) + 0.5);
local y = __mfloor((((t.y or __NaN) + (sa * s)) - lift) + 0.5);
local r = __mmax(3, (((t.r or __NaN) - 2) - (i * 0.12)));
M.disc(ctx, x, y, (r + 1), __I1.INK);
M.disc(ctx, x, y, r, (function() if (i == n) then return ((t.roof == "cone") and (__T(t.donjon) and "#9a4028" or "#4f6072") or __I1.STONEP[4]); else return __I1.STONEP[((__mfmod(i, 3) == 0) and 2 or 3)]; end; end)());
if (i < n) then
M.disc(ctx, (x - __mfloor((r * 0.3) + 0.5)), (y - __mfloor((r * 0.3) + 0.5)), __mmax(1, (r * 0.35)), __I1.STONEP[4]);
end;
end;
until true;
end;
end;
do
local __t137, __t138 = __it(cs.dust), 0;
while __t138 < __t137.length do
local d = __t137[__t138]; __t138 = __t138 + 1;
local a = (1 - ((d.t or __NaN) / (d.life or __NaN)));
ctx.globalAlpha = (a * 0.5);
ctx.fillStyle = "#b4a27c";
local s = __mfloor((2 + ((d.t or __NaN) * 4)) + 0.5);
ctx:fillRect(__mfloor(((d.x or __NaN) - (s / 2)) + 0.5), __mfloor(((d.y or __NaN) - (s / 2)) + 0.5), s, s);
end;
end;
ctx.globalAlpha = 1;
end;

-- levels/castle:14
M.TAU = (math.pi * 2);
-- levels/castle:15
M.clamp = function(v, a, b) 
if (v < a) then do return a end; elseif (v > b) then do return b end; else do return v end; end;
end;
-- levels/castle:19
M.MW = 320;
M.MH = 452;
-- levels/castle:20
M.X0 = 40;
M.Y0 = 64;
M.C = 10;
M.COLS = 24;
M.ROWS = 28;
-- levels/castle:21
M.MOAT = {y0=378, y1=396};
M.BRIDGE = {x0=144, x1=180};
-- levels/castle:22
M.WIN_SHARE = 0.9;
-- levels/castle:24
M.TOWERS = {[0]={c=(-1), r=(-1), n=3, roof="cone"}, {c=22, r=(-1), n=3, roof="cone"}, {c=(-1), r=26, n=3, roof="cone"}, {c=22, r=26, n=3, roof="cone"}, {c=(-1), r=12, n=3, roof="flat"}, {c=22, r=12, n=3, roof="flat"}, {c=10, r=(-1), n=4, roof="flat"}, {c=8, r=26, n=3, roof="flat", banner=true}, {c=13, r=26, n=3, roof="flat", banner=true}, {c=10, r=6, n=4, roof="cone", donjon=true}, length=10};
-- levels/castle:30
M.KEEP = {c0=6, c1=17, r0=4, r1=11};
-- levels/castle:31
M.GATE = {c=11, r=26, n=2};
-- levels/castle:35
M.BLOCK = {solid=true, rubble="castle_rubble", rubbleN=1, w=M.C, h=M.C, onDown=M.blockDown};
-- levels/castle:36
M.kinds = {castle_wall=__assignKV(__assign({}, M.BLOCK), "hp", 170, "value", {pts=110, venge=0.05, chaos=1}), castle_keep=__assignKV(__assign({}, M.BLOCK), "hp", 210, "value", {pts=140, venge=0.06, chaos=1}), castle_tower=__assignKV(__assign({}, M.BLOCK), "w", 30, "h", 30, "hp", 1000, "rubbleN", 4, "value", {pts=900, venge=0.35, chaos=4}, "onDown", M.towerDown), castle_gate=__assignKV(__assign({}, M.BLOCK), "w", 20, "h", 20, "hp", 520, "flammable", true, "burnTime", 10, "crushShare", 0.6, "value", {pts=600, venge=0.3, chaos=2}), castle_rubble={r=3, push=true, fill=2, value={pts=0, venge=0, chaos=0}}};
-- levels/castle:43
M.LIFT = {castle_wall=7, castle_keep=12, castle_gate=7, castle_tower=16};
-- levels/castle:113
M.MIDX = (M.X0 + ((M.COLS * M.C) / 2));
M.MIDY = (M.Y0 + ((M.ROWS * M.C) / 2));
-- levels/castle:114
M.KING_BONUS = 5000;
-- levels/castle:116
M.GARRISON_POWER = 1.6;
M.RAID_POWER = 2;
-- levels/castle:211
M.RING = {[0]={x=((M.X0 + (M.COLS * M.C)) + 21), y=(M.Y0 - 22)}, {x=((M.X0 + (M.COLS * M.C)) + 21), y=((M.Y0 + (M.ROWS * M.C)) + 22)}, {x=(M.X0 - 21), y=((M.Y0 + (M.ROWS * M.C)) + 22)}, {x=(M.X0 - 21), y=(M.Y0 - 22)}, length=4};
-- levels/castle:313
M.hud = function(g) 
return ("CASTLE " .. __str(__mfloor((__orv((g.cs and g.cs.share), 0) * 100))) .. "% DOWN  " .. __str(__mfloor((M.WIN_SHARE * 100) + 0.5)) .. " WINS");
end;
-- levels/castle:317
M.MOSS = "#4f6a32";
M.SLIT = "#0e0b08";
M.LITW = "#e8b850";
-- levels/castle:318
M.put = function(c, x, y, col) 
c.fillStyle = col;
c:fillRect(x, y, 1, 1);
end;
-- levels/castle:319
M.rect = function(c, x, y, w, h, col) 
c.fillStyle = col;
c:fillRect(x, y, w, h);
end;
-- levels/castle:320
M.standing = function(g, c, r) 
local p;
if ((((c >= 0) and (r >= 0)) and (c < M.COLS)) and (r < M.ROWS)) then p = g.cs.cell[((r * M.COLS) + c)]; else p = nil; end;
if (__T(p) and (p.state == "up")) then do return p end; else do return nil end; end;
end;
-- levels/castle:321
M.wasThere = function(g, c, r) 
return (((((c >= 0) and (r >= 0)) and (c < M.COLS)) and (r < M.ROWS)) and (g.cs.orig[((r * M.COLS) + c)] == 1));
end;
-- levels/castle:533
M.rgb = function(hex) 
local n = __parseInt(__slice(hex, 1), 16);
do return {[0]=__shr(n, 16), __band(__shr(n, 8), 255), __band(n, 255), length=3} end;
end;
-- levels/castle:534
M.GRASS = {[0]="#24331d", "#2c3e23", "#364b2a", "#425a31", length=4};
-- levels/castle:535
M.DIRT = {[0]="#3f3222", "#54432d", "#6a5538", length=3};
M.default = {n=7, id="castle", name="THE CASTLE", sub="BRING IT DOWN. ALL OF IT.", mode="timed", kinds=M.kinds, build=function(g, rng) 
do return M.build(g, rng) end;
end, update=M.update, hud=M.hud, art={ground=M.ground, under=M.under, over=M.over, props={castle_wall=M.drawBlock, castle_keep=M.drawBlock, castle_gate=M.drawBlock, castle_tower=M.drawTower, castle_rubble=M.drawRubble}, canopy=false, theme={leash=false}}};
