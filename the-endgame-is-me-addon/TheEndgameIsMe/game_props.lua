-- Generated from the-endgame-is-me/js/props.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("props");
local __Error, __Map, __Set, __T, __add, __assign, __assignKV, __filter, __get, __hypot, __it, __orv, __pairs, __push, __set, __sign, __some, __str, __throw, __typed = RT["Error"], RT["Map"], RT["Set"], RT["T"], RT["add"], RT["assign"], RT["assignKV"], RT["filter"], RT["get"], RT["hypot"], RT["it"], RT.orv, pairs, RT["push"], RT["set"], RT["sign"], RT["some"], RT["str"], RT["throw"], RT["typed"];
local __NaN = 0 / 0;
local __mabs, __matan2, __mceil, __mcos, __mexp, __mfloor, __mmax, __mmin, __msin = math.abs, math.atan2, math.ceil, math.cos, math.exp, math.floor, math.max, math.min, math.sin;

-- props:17
M.setWorldApi = function(api) 
M.API = api;
end;
-- props:18
M.registerKinds = function(kinds, critters) if kinds == nil then kinds = {} end; if critters == nil then critters = {} end;
for __t2 in __pairs(kinds) do
local k = __t2;
M.KINDS[k] = __assignKV(__assign(__assign({}, M.PROP_DEFAULTS), kinds[k]), "value", __assign(__assign({}, M.PROP_DEFAULTS.value), (__T(kinds[k].value) and kinds[k].value or {})));
end;
for __t4 in __pairs(critters) do
local k = __t4;
M.CRITTERS[k] = __assignKV(__assign(__assign({}, M.CRITTER_DEFAULTS), critters[k]), "value", __assign(__assign({}, M.CRITTER_DEFAULTS.value), (__T(critters[k].value) and critters[k].value or {})));
end;
end;
-- props:29
M.addProp = function(g, kind, x, y, extra) if extra == nil then extra = {} end;
local d = M.KINDS[kind];
if (not __T(d)) then
__throw(__Error(("unknown prop kind " .. __str(kind))));
end;
local p = __assign({id=(function() local __t5 = g.nextId; g.nextId = __t5 + 1; return __t5 end)(), kind=kind, x=x, y=y, r=d.r, w=d.w, h=d.h, hp=d.hp, maxhp=d.hp, state=(__T(d.push) and "down" or "up"), burning=false, burnT=0, paid=0, seed=__mfloor((g.rng() * 1000000)), fallA=0, hitT=0, vx=0, vy=0, broken=false}, extra);
__push(g.props, p);
g.propsDirty = true;
do return p end;
end;
-- props:40
M.touches = function(p, x, y, r) 
if __T(p.w) then
local dx = __mmax((__mabs((x - (p.x or __NaN))) - ((p.w or __NaN) / 2)), 0);
local dy = __mmax((__mabs((y - (p.y or __NaN))) - ((p.h or __NaN) / 2)), 0);
do return (((dx * dx) + (dy * dy)) < (r * r)) end;
end;
do return (__hypot((x - (p.x or __NaN)), (y - (p.y or __NaN))) < (r + (p.r or __NaN))) end;
end;
-- props:45
M.closest = function(p, x, y) 
if __T(p.w) then
local cx = M.clamp(x, ((p.x or __NaN) - ((p.w or __NaN) / 2)), ((p.x or __NaN) + ((p.w or __NaN) / 2)));
local cy = M.clamp(y, ((p.y or __NaN) - ((p.h or __NaN) / 2)), ((p.y or __NaN) + ((p.h or __NaN) / 2)));
local nx = (x - cx);
local ny = (y - cy);
local d = __hypot(nx, ny);
if (d < 0.001) then
local ex = (((p.w or __NaN) / 2) - __mabs((x - (p.x or __NaN))));
local ey = (((p.h or __NaN) / 2) - __mabs((y - (p.y or __NaN))));
if (ex < ey) then
nx = __orv(__sign((x - (p.x or __NaN))), 1);
ny = 0;
do return {x=((p.x or __NaN) + ((nx * (p.w or __NaN)) / 2)), y=y, nx=nx, ny=ny, d=(-ex)} end;
end;
nx = 0;
ny = __orv(__sign((y - (p.y or __NaN))), 1);
do return {x=x, y=((p.y or __NaN) + ((ny * (p.h or __NaN)) / 2)), nx=nx, ny=ny, d=(-ey)} end;
end;
do return {x=cx, y=cy, nx=(nx / d), ny=(ny / d), d=d} end;
end;
local dx = (x - (p.x or __NaN));
local dy = (y - (p.y or __NaN));
local d = ((__hypot(dx, dy) ~= 0) and __hypot(dx, dy) or 0.001);
do return {x=((p.x or __NaN) + ((dx / d) * (p.r or __NaN))), y=((p.y or __NaN) + ((dy / d) * (p.r or __NaN))), nx=(dx / d), ny=(dy / d), d=(d - (p.r or __NaN))} end;
end;
-- props:62
M.rebuildGrid = function(g) 
local grid = __Map();
do
local __t6, __t7 = __it(g.props), 0;
while __t7 < __t6.length do
repeat
local p = __t6[__t7]; __t7 = __t7 + 1;
if (p.state == "gone") then
do break end;
end;
local rx = ((__T(p.w) and ((p.w or __NaN) / 2) or p.r) + 2);
local ry = ((__T(p.h) and ((p.h or __NaN) / 2) or p.r) + 2);
for cy = __mfloor((((p.y or __NaN) - ry) / M.CELL)), __mfloor((((p.y or __NaN) + ry) / M.CELL)) do
for cx = __mfloor((((p.x or __NaN) - rx) / M.CELL)), __mfloor((((p.x or __NaN) + rx) / M.CELL)) do
local k = ((cx * 4096) + cy);
local a = __get(grid, k);
if (not __T(a)) then
__set(grid, k, (function() a = {length=0}; return a end)());
end;
__push(a, p);
end;
end;
until true;
end;
end;
g.pgrid = grid;
g.propsDirty = false;
end;
-- props:76
M.near = function(g, x, y, r) 
if ((not __T(g.pgrid)) or __T(g.propsDirty)) then
M.rebuildGrid(g);
end;
local out = __Set();
for cy = __mfloor(((y - r) / M.CELL)), __mfloor(((y + r) / M.CELL)) do
for cx = __mfloor(((x - r) / M.CELL)), __mfloor(((x + r) / M.CELL)) do
local a = __get(g.pgrid, ((cx * 4096) + cy));
if __T(a) then
do
local __t13, __t14 = __it(a), 0;
while __t14 < __t13.length do
local p = __t13[__t14]; __t14 = __t14 + 1;
if (p.state ~= "gone") then
__add(out, p);
end;
end;
end;
end;
end;
end;
do return out end;
end;
-- props:88
M.pay = function(g, p, frac, fire) 
frac = __mmin(frac, (1 - (p.paid or __NaN)));
if (frac <= 0) then
do return end;
end;
p.paid = ((p.paid or __NaN) + frac);
local d = M.KINDS[p.kind];
local v = d.value;
if __T(v.pts) then
local pts = __mfloor((((v.pts or __NaN) * frac) * (g.mult or __NaN)) + 0.5);
M.API.addScore(g, pts);
if (pts >= 20) then
M.API.text(g, p.x, ((p.y or __NaN) - 8), ("+" .. __str(pts)), (__T(fire) and "flame" or "cream"), 0.9);
end;
end;
if (__T(v.venge) and ((not __T(fire)) or __T(d.fireVenge))) then
M.API.vengeance(g, ((v.venge or __NaN) * frac));
end;
if __T(v.chaos) then
M.API.chaos(g, ((v.chaos or __NaN) * frac));
end;
end;
-- props:103
M.knockDown = function(g, p, ang) if ang == nil then ang = 0 end;
if (p.state ~= "up") then
do return end;
end;
local d = M.KINDS[p.kind];
p.state = ((__T(d.flammable) or __T(d.push)) and "down" or "gone");
p.fallA = ang;
p.hp = 0;
p.broken = true;
M.pay(g, p, (function() if __T(d.flammable) then return d.crushShare; else return 1; end; end)(), false);
g.propsDirty = true;
M.API.sound(g, (__T(d.solid) and "collapse" or "crunch"));
local kind = (__T(d.leaves) and d.leaves or "splinter");
do
local i = 0;
while (i < (__T(d.solid) and 16 or 7)) do
local a = (g.rng() * M.TAU);
local s = (15 + (g.rng() * 35));
M.API.part(g, p.x, ((p.y or __NaN) - 2), (__mcos(a) * s), (__msin(a) * s), 0.5, kind);
i = i + 1;
end;
end;
if __T(d.solid) then
g.shake = __mmax((g.shake or __NaN), 0.2);
end;
if __T(d.rubble) then
do
local i = 0;
while (i < (__T(d.rubbleN) and d.rubbleN or 2)) do
local a = (g.rng() * M.TAU);
local rr = ((__T(p.w) and (__mmin((p.w or __NaN), (p.h or __NaN)) / 3) or p.r) * g.rng());
M.addProp(g, d.rubble, ((p.x or __NaN) + (__mcos(a) * rr)), ((p.y or __NaN) + (__msin(a) * rr)));
i = i + 1;
end;
end;
end;
if __T(d.onDown) then
d.onDown(g, p);
end;
end;
-- props:122
M.hitProp = function(g, p, dmg, ang) 
if (p.state ~= "up") then
do return end;
end;
p.hp = ((p.hp or __NaN) - dmg);
p.hitT = 0.12;
if ((p.hp or __NaN) <= 0) then
M.knockDown(g, p, ang);
elseif __T(M.KINDS[p.kind].solid) then
M.API.sound(g, "thump");
end;
end;
-- props:130
M.ignite = function(g, p) 
local d = M.KINDS[p.kind];
if (((not __T(d.flammable)) or __T(p.burning)) or (p.state == "gone")) then
do return false end;
end;
p.burning = true;
p.burnT = 0;
M.API.sound(g, "whoosh");
do return true end;
end;
-- props:139
M.damageZone = function(g, test, dmg, cx, cy, reach) 
do
local __t18, __t19 = __it(M.near(g, cx, cy, reach)), 0;
while __t19 < __t18.length do
repeat
local p = __t18[__t19]; __t19 = __t19 + 1;
if (p.state ~= "up") then
do break end;
end;
local c = M.closest(p, cx, cy);
if (__T(test(c.x, c.y)) or __T(test(p.x, p.y))) then
M.hitProp(g, p, dmg, __matan2(((p.y or __NaN) - cy), ((p.x or __NaN) - cx)));
end;
until true;
end;
end;
do
local __t21, __t22 = __it(g.critters), 0;
while __t22 < __t21.length do
local c = __t21[__t22]; __t22 = __t22 + 1;
if ((not __T(c.dead)) and __T(test(c.x, c.y))) then
M.hurtCritter(g, c, dmg);
end;
end;
end;
end;
-- props:148
M.igniteZone = function(g, test, cx, cy, reach, chance) if chance == nil then chance = 1 end;
do
local __t24, __t25 = __it(M.near(g, cx, cy, reach)), 0;
while __t25 < __t24.length do
local p = __t24[__t25]; __t25 = __t25 + 1;
if (((__T(M.KINDS[p.kind].flammable) and (not __T(p.burning))) and __T(test(p.x, p.y))) and (g.rng() < chance)) then
M.ignite(g, p);
end;
end;
end;
end;
-- props:152
M.slowAt = function(g, x, y) 
local f = 1;
do
local __t27, __t28 = __it(M.near(g, x, y, 14)), 0;
while __t28 < __t27.length do
local p = __t27[__t28]; __t28 = __t28 + 1;
local d = M.KINDS[p.kind];
if (((p.state == "up") and __T(d.slow)) and (__hypot((x - (p.x or __NaN)), (y - (p.y or __NaN))) < (d.slowR or __NaN))) then
f = __mmin(f, (1 - (d.slow or __NaN)));
end;
end;
end;
do return f end;
end;
-- props:162
M.solidPush = function(g, e, r) 
do
local __t30, __t31 = __it(M.near(g, e.x, e.y, (r + 4))), 0;
while __t31 < __t30.length do
repeat
local p = __t30[__t31]; __t31 = __t31 + 1;
if ((p.state ~= "up") or (not __T(M.KINDS[p.kind].solid))) then
do break end;
end;
local c = M.closest(p, e.x, e.y);
if ((c.d or __NaN) < r) then
e.x = ((e.x or __NaN) + ((c.nx or __NaN) * (r - (c.d or __NaN))));
e.y = ((e.y or __NaN) + ((c.ny or __NaN) * (r - (c.d or __NaN))));
end;
until true;
end;
end;
if (__T(g.water) and __T(M.isWater(g, e.x, e.y))) then
M.unstuck(g, e);
end;
end;
-- props:172
M.bossTouch = function(g, ox, oy, dt) 
local b = g.boss;
local mx = ((b.x or __NaN) - ox);
local my = ((b.y or __NaN) - oy);
local ml = __hypot(mx, my);
local blocked = false;
do
local __t33, __t34 = __it(M.near(g, b.x, b.y, ((b.r or __NaN) + 14))), 0;
while __t34 < __t33.length do
repeat
local p = __t33[__t34]; __t34 = __t34 + 1;
local d = M.KINDS[p.kind];
if (not M.touches(p, b.x, b.y, ((b.r or __NaN) - 1))) then
do break end;
end;
if ((p.state == "up") and __T(d.solid)) then
local c = M.closest(p, b.x, b.y);
if ((c.d or __NaN) < (b.r or __NaN)) then
b.x = ((b.x or __NaN) + ((c.nx or __NaN) * ((b.r or __NaN) - (c.d or __NaN))));
b.y = ((b.y or __NaN) + ((c.ny or __NaN) * ((b.r or __NaN) - (c.d or __NaN))));
blocked = true;
end;
p.bashT = ((__T(p.bashT) and p.bashT or 0) - dt);
if (((ml > 0.05) and (((mx * (-(c.nx or __NaN))) + (my * (-(c.ny or __NaN)))) > 0)) and ((p.bashT or __NaN) <= 0)) then
p.bashT = 0.4;
M.hitProp(g, p, (__T(b.bash) and b.bash or 45), __matan2((-(c.ny or __NaN)), (-(c.nx or __NaN))));
g.shake = __mmax((g.shake or __NaN), 0.1);
end;
elseif (p.state == "up") then
if (ml > 0.05) then
M.knockDown(g, p, (__matan2(my, mx) + ((g.rng() - 0.5) * 0.8)));
end;
elseif ((p.state == "down") and __T(d.push)) then
local dx = ((p.x or __NaN) - (b.x or __NaN));
local dy = ((p.y or __NaN) - (b.y or __NaN));
local dd = ((__hypot(dx, dy) ~= 0) and __hypot(dx, dy) or 1);
local sp = (ml / __mmax(dt, 0.001));
p.vx = (((mx / ((ml ~= 0) and ml or 1)) * __mmax(40, (sp * 2.2))) + ((dx / dd) * 25));
p.vy = (((my / ((ml ~= 0) and ml or 1)) * __mmax(40, (sp * 2.2))) + ((dy / dd) * 25));
end;
until true;
end;
end;
do
local __t36, __t37 = __it(g.critters), 0;
while __t37 < __t36.length do
repeat
local c = __t36[__t37]; __t37 = __t37 + 1;
if (__T(c.dead) or (__hypot(((c.x or __NaN) - (b.x or __NaN)), ((c.y or __NaN) - (b.y or __NaN))) > ((b.r or __NaN) + (c.r or __NaN)))) then
do break end;
end;
if __T(M.CRITTERS[c.kind].trample) then
M.hurtCritter(g, c, 999);
end;
until true;
end;
end;
do return blocked end;
end;
-- props:205
M.updateProps = function(g, dt) 
do
local __t39, __t40 = __it(g.props), 0;
while __t40 < __t39.length do
repeat
local p = __t39[__t40]; __t40 = __t40 + 1;
if (p.state == "gone") then
do break end;
end;
p.hitT = __mmax(0, ((p.hitT or __NaN) - dt));
local d = M.KINDS[p.kind];
if __T(p.burning) then
p.burnT = ((p.burnT or __NaN) + dt);
if (g.rng() < (((d.spread or __NaN) * dt) * 4)) then
do
local __t42, __t43 = __it(M.near(g, p.x, p.y, 16)), 0;
while __t43 < __t42.length do
local q = __t42[__t43]; __t43 = __t43 + 1;
if (((((q ~= p) and (not __T(q.burning))) and __T(M.KINDS[q.kind].flammable)) and (__hypot(((q.x or __NaN) - (p.x or __NaN)), ((q.y or __NaN) - (p.y or __NaN))) < ((__T(p.w) and p.w or ((p.r or __NaN) * 2)) + 10))) and (g.rng() < 0.25)) then
M.ignite(g, q);
end;
end;
end;
end;
if (g.rng() < 0.25) then
M.API.part(g, ((p.x or __NaN) + ((g.rng() - 0.5) * (__T(p.w) and p.w or ((p.r or __NaN) * 2)))), (((p.y or __NaN) - 2) - (g.rng() * 4)), ((g.rng() - 0.5) * 8), ((-12) - (g.rng() * 14)), (0.5 + (g.rng() * 0.4)), "flame");
end;
do
local __t45, __t46 = __it(g.units), 0;
while __t46 < __t45.length do
local u = __t45[__t46]; __t46 = __t46 + 1;
if ((not __T(u.dead)) and M.touches(p, u.x, u.y, 4)) then
M.API.hurt(g, u, (20 * dt));
end;
end;
end;
if ((p.burnT or __NaN) >= (d.burnTime or __NaN)) then
p.burning = false;
p.state = "gone";
p.ash = true;
M.pay(g, p, 1, true);
__push(g.ashes, {x=p.x, y=p.y, r=(__T(p.w) and (__mmax((p.w or __NaN), (p.h or __NaN)) / 2) or ((p.r or __NaN) + 2)), w=p.w, h=p.h, seed=p.seed});
g.propsDirty = true;
end;
end;
if (__T(p.vx) or __T(p.vy)) then
p.x = ((p.x or __NaN) + ((p.vx or __NaN) * dt));
p.y = ((p.y or __NaN) + ((p.vy or __NaN) * dt));
local k = __mexp(((-5) * dt));
p.vx = ((p.vx or __NaN) * k);
p.vy = ((p.vy or __NaN) * k);
if ((__mabs((p.vx or __NaN)) + __mabs((p.vy or __NaN))) < 2) then
p.vx = 0;
p.vy = 0;
end;
g.propsDirty = true;
if (__T(g.water) and __T(M.isWater(g, p.x, p.y))) then
M.fillWater(g, p.x, p.y, (__T(d.fill) and d.fill or 1));
p.state = "gone";
do local __t48 = 0; p.vy = __t48; p.vx = __t48; end;
M.API.sound(g, "splash");
for i = 0, 8 - 1 do
local a = (g.rng() * M.TAU);
M.API.part(g, p.x, p.y, (__mcos(a) * 25), ((__msin(a) * 25) - 10), 0.5, "splash");
end;
end;
end;
until true;
end;
end;
if ((g.props.length or #g.props) > 1500) then
g.props = __filter(g.props, function(p) 
return ((p.state ~= "gone") or p.burning);
end);
g.propsDirty = true;
end;
M.updateCritters(g, dt);
end;
-- props:247
M.makeWater = function(w, h, cs) if cs == nil then cs = 6 end;
local cols = __mceil((w / cs));
local rows = __mceil((h / cs));
do return {cs=cs, cols=cols, rows=rows, a=__typed("Uint8Array", (cols * rows))} end;
end;
-- props:251
M.setWater = function(wt, x0, y0, x1, y1, v) if v == nil then v = 1 end;
for y = __mfloor((y0 / (wt.cs or __NaN))), __mfloor((y1 / (wt.cs or __NaN))) do
for x = __mfloor((x0 / (wt.cs or __NaN))), __mfloor((x1 / (wt.cs or __NaN))) do
if ((((x >= 0) and (y >= 0)) and (x < (wt.cols or __NaN))) and (y < (wt.rows or __NaN))) then
wt.a[((y * (wt.cols or __NaN)) + x)] = v;
end;
end;
end;
end;
-- props:255
M.waterCell = function(g, x, y) 
local w = g.water;
local cx = __mfloor((x / (w.cs or __NaN)));
local cy = __mfloor((y / (w.cs or __NaN)));
do return (((((cx < 0) or (cy < 0)) or (cx >= (w.cols or __NaN))) or (cy >= (w.rows or __NaN))) and 0 or w.a[((cy * (w.cols or __NaN)) + cx)]) end;
end;
-- props:261
M.fillWater = function(g, x, y, amount) if amount == nil then amount = 1 end;
local w = g.water;
local cx = __mfloor((x / (w.cs or __NaN)));
local cy = __mfloor((y / (w.cs or __NaN)));
local cells = {[0]={[0]=0, 0, length=2}, {[0]=1, 0, length=2}, {[0]=(-1), 0, length=2}, {[0]=0, 1, length=2}, {[0]=0, (-1), length=2}, {[0]=1, 1, length=2}, {[0]=(-1), (-1), length=2}, {[0]=1, (-1), length=2}, {[0]=(-1), 1, length=2}, length=9};
local n = 0;
do
local __t52, __t53 = __it(cells), 0;
local __b54 = false;
while __t53 < __t52.length do
repeat
local __t55 = __t52[__t53]; __t53 = __t53 + 1; local dx, dy; dx = __t55[0]; dy = __t55[1];
if (n >= (2 + (amount * 2))) then
do __b54 = true; break end;
end;
local X = (cx + dx);
local Y = (cy + dy);
if (((((X < 0) or (Y < 0)) or (X >= (w.cols or __NaN))) or (Y >= (w.rows or __NaN))) or (w.a[((Y * (w.cols or __NaN)) + X)] ~= 1)) then
do break end;
end;
w.a[((Y * (w.cols or __NaN)) + X)] = 2;
n = n + 1;
until true;
if __b54 then break end;
end;
end;
g.waterDirty = true;
if __T(n) then
if M.API.filled then M.API.filled(g, x, y, n); end;
end;
end;
-- props:275
M.hitsWater = function(g, x, y, r) 
if (not __T(g.water)) then
do return false end;
end;
for i = 0, 8 - 1 do
local a = ((i / 8) * M.TAU);
if __T(M.isWater(g, (x + ((__mcos(a) * r) * 0.85)), (y + ((__msin(a) * r) * 0.85)))) then
do return true end;
end;
end;
do return M.isWater(g, x, y) end;
end;
-- props:281
M.unstuck = function(g, e) 
local w = g.water;
for rr = 1, 8 - 1 do
for k = 0, 12 - 1 do
local a = ((k / 12) * M.TAU);
local x = ((e.x or __NaN) + ((__mcos(a) * rr) * (w.cs or __NaN)));
local y = ((e.y or __NaN) + ((__msin(a) * rr) * (w.cs or __NaN)));
if (not __T(M.isWater(g, x, y))) then
e.x = x;
e.y = y;
do return end;
end;
end;
end;
end;
-- props:291
M.addCritter = function(g, kind, x, y, extra) if extra == nil then extra = {} end;
local d = M.CRITTERS[kind];
local c = __assign({id=(function() local __t59 = g.nextId; g.nextId = __t59 + 1; return __t59 end)(), kind=kind, x=x, y=y, hx=x, hy=y, hp=d.hp, r=d.r, dead=false, gone=false, walk=(g.rng() * 10), fx=((g.rng() < 0.5) and 1 or (-1)), moving=false, tx=x, ty=y, scared=0, hitT=0, seed=__mfloor((g.rng() * 1000000))}, extra);
__push(g.critters, c);
do return c end;
end;
-- props:299
M.hurtCritter = function(g, c, dmg) 
if __T(c.dead) then
do return end;
end;
c.hp = ((c.hp or __NaN) - dmg);
c.hitT = 0.12;
c.scared = 4;
if ((c.hp or __NaN) > 0) then
do return end;
end;
c.dead = true;
local d = M.CRITTERS[c.kind];
local v = d.value;
local pts = __mfloor(((v.pts or __NaN) * (g.mult or __NaN)) + 0.5);
M.API.addScore(g, pts);
M.API.text(g, c.x, ((c.y or __NaN) - 6), ("+" .. __str(pts)), "cream", 0.9);
if __T(v.venge) then
M.API.vengeance(g, v.venge);
end;
if __T(v.chaos) then
M.API.chaos(g, v.chaos);
end;
M.API.sound(g, (__T(d.cry) and d.cry or "kill"));
for i = 0, 6 - 1 do
local a = (g.rng() * M.TAU);
local s = (10 + (g.rng() * 25));
M.API.part(g, c.x, ((c.y or __NaN) - 1), (__mcos(a) * s), (__msin(a) * s), 0.35, (__T(d.bits) and d.bits or "blood"));
end;
if (not __T(d.leaves)) then
__push(g.corpses, {u=nil, critter=c.kind, x=c.x, y=c.y, cls=nil, t=0, fx=c.fx});
end;
end;
-- props:315
M.updateCritters = function(g, dt) 
local b = g.boss;
do
local __t61, __t62 = __it(g.critters), 0;
while __t62 < __t61.length do
repeat
local c = __t61[__t62]; __t62 = __t62 + 1;
if __T(c.dead) then
do break end;
end;
local d = M.CRITTERS[c.kind];
c.hitT = __mmax(0, ((c.hitT or __NaN) - dt));
c.scared = __mmax(0, ((c.scared or __NaN) - dt));
local db = __hypot(((c.x or __NaN) - (b.x or __NaN)), ((c.y or __NaN) - (b.y or __NaN)));
if (((db < (d.fear or __NaN)) or ((c.scared or __NaN) > 0)) or __T(c.bolting)) then
local ax = ((c.x or __NaN) - (b.x or __NaN));
local ay = ((c.y or __NaN) - (b.y or __NaN));
local l = ((__hypot(ax, ay) ~= 0) and __hypot(ax, ay) or 1);
ax = (ax / l);
ay = (ay / l);
if __T(d.leaves) then
c.bolting = true;
end;
local sp = ((d.flee or __NaN) * (__T(c.slowed) and c.slowed or 1));
local ox = c.x;
local oy = c.y;
c.x = ((c.x or __NaN) + (((ax + (__msin((((g.t or __NaN) * 3) + (c.seed or __NaN))) * 0.4)) * sp) * dt));
c.y = ((c.y or __NaN) + (((ay + (__mcos((((g.t or __NaN) * 2.7) + (c.seed or __NaN))) * 0.4)) * sp) * dt));
c.walk = ((c.walk or __NaN) + ((sp * dt) * 0.5));
c.moving = true;
if (__mabs(((c.x or __NaN) - ox)) > 0.01) then
c.fx = (((c.x or __NaN) > ox) and 1 or (-1));
end;
c.face = __matan2(((c.y or __NaN) - oy), ((c.x or __NaN) - ox));
else
if (__hypot(((c.tx or __NaN) - (c.x or __NaN)), ((c.ty or __NaN) - (c.y or __NaN))) < 1.5) then
c.moving = false;
if (g.rng() < (0.4 * dt)) then
c.tx = ((c.hx or __NaN) + ((g.rng() - 0.5) * 30));
c.ty = ((c.hy or __NaN) + ((g.rng() - 0.5) * 20));
end;
else
local dx = ((c.tx or __NaN) - (c.x or __NaN));
local dy = ((c.ty or __NaN) - (c.y or __NaN));
local l = __hypot(dx, dy);
c.x = ((c.x or __NaN) + (((dx / l) * (d.spd or __NaN)) * dt));
c.y = ((c.y or __NaN) + (((dy / l) * (d.spd or __NaN)) * dt));
c.walk = ((c.walk or __NaN) + (((d.spd or __NaN) * dt) * 0.5));
c.moving = true;
if (__mabs(dx) > 0.2) then
c.fx = ((dx > 0) and 1 or (-1));
end;
c.face = __matan2(dy, dx);
end;
end;
M.solidPush(g, c, c.r);
local B = g.map;
if (__T(c.bolting) and (((((c.x or __NaN) < (-20)) or ((c.y or __NaN) < (-20))) or ((c.x or __NaN) > ((B.w or __NaN) + 20))) or ((c.y or __NaN) > ((B.h or __NaN) + 20)))) then
c.gone = true;
end;
c.x = M.clamp(c.x, (__T(c.bolting) and (-30) or 4), (__T(c.bolting) and ((B.w or __NaN) + 30) or ((B.w or __NaN) - 4)));
c.y = M.clamp(c.y, (__T(c.bolting) and (-30) or 14), (__T(c.bolting) and ((B.h or __NaN) + 30) or ((B.h or __NaN) - 18)));
until true;
end;
end;
if __some(g.critters, function(c) 
return (__T(c.dead) and c.dead or c.gone);
end) then
g.critters = __filter(g.critters, function(c) 
return ((not __T(c.dead)) and (not __T(c.gone)));
end);
end;
end;

-- props:8
M.KINDS = {};
-- props:9
M.CRITTERS = {};
-- props:10
M.PROP_DEFAULTS = {r=3, w=0, h=0, hp=1, solid=false, slow=0, slowR=0, flammable=false, burnTime=6, spread=0.2, crushShare=0.5, breaks=true, push=false, rubble=nil, value={pts=0, venge=0, chaos=0}, fireVenge=true};
-- props:14
M.CRITTER_DEFAULTS = {r=2, hp=30, spd=20, flee=40, fear=50, value={pts=50, venge=0.05, chaos=0.2}, raise=nil, trample=true, leaves=false};
-- props:16
M.API = nil;
-- props:23
M.clamp = function(v, a, b) 
if (v < a) then do return a end; elseif (v > b) then do return b end; else do return v end; end;
end;
-- props:24
M.TAU = (math.pi * 2);
-- props:61
M.CELL = 24;
-- props:259
M.isWater = function(g, x, y) 
return (__T(g.water) and (M.waterCell(g, x, y) == 1));
end;
