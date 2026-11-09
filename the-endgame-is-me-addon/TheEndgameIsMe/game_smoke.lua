-- Generated from the-endgame-is-me/js/smoke.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("smoke");
local __I0 = RT.module("props");
local __Map, __T, __bxor, __filter, __get, __hypot, __imul, __it, __orv, __pop, __push, __set, __setlen, __typed, __u32 = RT["Map"], RT["T"], RT["bxor"], RT["filter"], RT["get"], RT["hypot"], RT["imul"], RT["it"], RT.orv, RT["pop"], RT["push"], RT["set"], RT["setlen"], RT["typed"], RT["u32"];
local __NaN = 0 / 0;
local __mcos, __mexp, __mfloor, __mmax, __mmin, __msin, __msqrt = math.cos, math.exp, math.floor, math.max, math.min, math.sin, math.sqrt;

-- mulberry32: replaced by the build
M.mulberry32 = RT.mulberry32;
-- smoke:34
M.pickWind = function(seed, n, salt) if salt == nil then salt = 0 end;
local rng = M.mulberry32(__u32(__bxor(__bxor(seed, __imul((n + 1), 2654435761)), __imul((salt + 7), 2246822507))));
rng();
rng();
local k = __mfloor((rng() * 5));
local ang = (((-math.pi) + ((k * math.pi) / 4)) + ((rng() - 0.5) * 0.3));
ang = __mmin(0, __mmax((-math.pi), ang));
local spd = (6 + (rng() * 9));
local x = (__mcos(ang) * spd);
local y = __mmin(0, (__msin(ang) * spd));
local name = ({[0]="LEFT", "UP-LEFT", "UP", "UP-RIGHT", "RIGHT", length=5})[k];
do return {ang=ang, spd=spd, x=x, y=y, name=name} end;
end;
-- smoke:47
M.init = function(g) 
local m = g.map;
if (not __T(m.wind)) then
m.wind = M.pickWind(__u32(g.seed), (__T(m.n) and m.n or 0), (__T(g.maps) and g.maps or 0));
end;
g.smoke = {map=m, clouds={length=0}, rng=M.mulberry32(__u32(__bxor(__bxor(__u32(g.seed), 1540483477), (__T(m.n) and m.n or 0)))), mergeT=0, ashSeen=0, smoulder={length=0}, stats={born=0, dense=0, large=0, absorbed=0, dropped=0}};
do return g.smoke end;
end;
-- smoke:59
M.puff = function(s, g, x, y, r, d) 
local rng = s.rng;
local w = g.map.wind;
local cs = s.clouds;
local m = ((d * r) * r);
if ((cs.length or #cs) >= M.SMOKE_MAX) then
local best = nil;
local bd = 1000000000;
do
local __t1, __t2 = __it(cs), 0;
while __t2 < __t1.length do
local c = __t1[__t2]; __t2 = __t2 + 1;
local dd = ((((c.x or __NaN) - x) ^ 2) + (((c.y or __NaN) - y) ^ 2));
if (dd < bd) then
bd = dd;
best = c;
end;
end;
end;
if (__T(best) and (bd < (((best.r or __NaN) + 14) ^ 2))) then
best.m = ((best.m or __NaN) + (m * 0.8));
s.stats.absorbed = (s.stats.absorbed or __NaN) + 1;
do return end;
end;
if (not M.seen(g, x, y, 10)) then
s.stats.skipped = ((__T(s.stats.skipped) and s.stats.skipped or 0) + 1);
do return end;
end;
local fi = 0;
local fd = math.huge;
for i = 0, (cs.length or #cs) - 1 do
local c = cs[i];
local dd = ((M.density(c) * (c.r or __NaN)) * (M.seen(g, c.x, c.y, c.r) and 1 or 0.2));
if (dd < fd) then
fd = dd;
fi = i;
end;
end;
cs[fi] = cs[((cs.length or #cs) - 1)];
__pop(cs);
s.stats.dropped = (s.stats.dropped or __NaN) + 1;
end;
__push(cs, {x=x, y=y, r=r, m=m, vx=(((w.x or __NaN) * 0.2) + ((rng() - 0.5) * 3)), vy=((-6) - (rng() * 5)), age=0, v=__mfloor((rng() * 3))});
s.stats.born = (s.stats.born or __NaN) + 1;
end;
-- smoke:79
M.emit = function(s, g, dt) 
local rng = s.rng;
do
local __t5, __t6 = __it(g.props), 0;
while __t6 < __t5.length do
repeat
local p = __t5[__t6]; __t6 = __t6 + 1;
if ((not __T(p.burning)) or (p.state == "gone")) then
do break end;
end;
local d = __I0.KINDS[p.kind];
local bt = __orv((d and d.burnTime), 6);
local w = (__T(p.w) and p.w or (((p.r or __NaN) * 2) + 2));
local size = (__T(p.w) and (((p.w or __NaN) + (p.h or __NaN)) / 2) or ((p.r or __NaN) * 2));
local heat = M.roar(((p.burnT or __NaN) / bt));
local rate = ((1.2 + (size * 0.22)) * heat);
p.smokeAcc = ((__T(p.smokeAcc) and p.smokeAcc or 0) + (rate * dt));
while ((p.smokeAcc or __NaN) >= 1) do
p.smokeAcc = ((p.smokeAcc or __NaN) - 1);
local top = ((p.y or __NaN) - ((p.state == "up") and (__T(p.h) and (((p.h or __NaN) / 2) + 4) or 10) or 3));
M.puff(s, g, ((p.x or __NaN) + (((rng() - 0.5) * w) * 0.8)), (top - (rng() * 3)), ((1.8 + (rng() * 1.4)) + __mmin(4, (size * 0.08))), (0.45 + (0.3 * heat)));
end;
until true;
end;
end;
do
local __t9, __t10 = __it(g.fires), 0;
while __t10 < __t9.length do
repeat
local f = __t9[__t10]; __t10 = __t10 + 1;
local k = ((f.t or __NaN) / (f.life or __NaN));
if (k > 0.95) then
do break end;
end;
f.smokeAcc = ((__T(f.smokeAcc) and f.smokeAcc or 0) + (((0.7 + ((f.r or __NaN) * 0.12)) * ((k > 0.7) and 0.5 or 1)) * dt));
if ((f.smokeAcc or __NaN) >= 1) then
f.smokeAcc = ((f.smokeAcc or __NaN) - 1);
M.puff(s, g, ((f.x or __NaN) + ((rng() - 0.5) * (f.r or __NaN))), ((f.y or __NaN) - 2), (1.6 + (rng() * 1.2)), (0.22 + (rng() * 0.12)));
end;
until true;
end;
end;
if ((g.ashes.length or #g.ashes) < (s.ashSeen or __NaN)) then
s.ashSeen = 0;
end;
do

while ((s.ashSeen or __NaN) < (g.ashes.length or #g.ashes)) do
local a = g.ashes[s.ashSeen];
__push(s.smoulder, {x=a.x, y=a.y, r=a.r, t=0, life=(4 + __mmin(4, ((a.r or __NaN) * 0.3))), acc=0});
s.ashSeen = (s.ashSeen or __NaN) + 1;
end;
end;
do
local __t13, __t14 = __it(s.smoulder), 0;
while __t14 < __t13.length do
local a = __t13[__t14]; __t14 = __t14 + 1;
a.t = ((a.t or __NaN) + dt);
a.acc = ((a.acc or __NaN) + (((0.5 + ((a.r or __NaN) * 0.08)) * (1 - ((a.t or __NaN) / (a.life or __NaN)))) * dt));
if ((a.acc or __NaN) >= 1) then
a.acc = ((a.acc or __NaN) - 1);
M.puff(s, g, ((a.x or __NaN) + ((rng() - 0.5) * (a.r or __NaN))), ((a.y or __NaN) - 2), (1.6 + rng()), (0.2 + (0.1 * rng())));
end;
end;
end;
if ((s.smoulder.length or #s.smoulder) ~= 0) then
s.smoulder = __filter(s.smoulder, function(a) 
return ((a.t or __NaN) < (a.life or __NaN));
end);
end;
end;
-- smoke:113
M.merge = function(s) 
local cs = s.clouds;
local grid = __Map();
do
local i = 0;
while (i < (cs.length or #cs)) do
local c = cs[i];
local k = ((__mfloor(((c.x or __NaN) / M.CELL)) * 8192) + __mfloor(((c.y or __NaN) / M.CELL)));
local a = __get(grid, k);
if (not __T(a)) then
__set(grid, k, (function() a = {length=0}; return a end)());
end;
__push(a, i);
i = i + 1;
end;
end;
local dead = __typed("Uint8Array", (cs.length or #cs));
for i = 0, (cs.length or #cs) - 1 do
repeat
if __T(dead[i]) then
do break end;
end;
local a = cs[i];
local gx = __mfloor(((a.x or __NaN) / M.CELL));
local gy = __mfloor(((a.y or __NaN) / M.CELL));
local reach = (((a.r or __NaN) > M.CELL) and 2 or 1);
do
local cy = (gy - reach);
while ((cy <= (gy + reach)) and (not __T(dead[i]))) do
do
local cx = (gx - reach);
while ((cx <= (gx + reach)) and (not __T(dead[i]))) do
repeat
local list = __get(grid, ((cx * 8192) + cy));
if (not __T(list)) then
do break end;
end;
do
local __t20, __t21 = __it(list), 0;
local __b22 = false;
while __t21 < __t20.length do
repeat
local j = __t20[__t21]; __t21 = __t21 + 1;
if ((j <= i) or __T(dead[j])) then
do break end;
end;
local b = cs[j];
local dx = ((b.x or __NaN) - (a.x or __NaN));
local dy = ((b.y or __NaN) - (a.y or __NaN));
local dist = __hypot(dx, dy);
local q = (dist / ((a.r or __NaN) + (b.r or __NaN)));
if (q < 0.55) then
local big;
if ((a.r or __NaN) >= (b.r or __NaN)) then big = a; else big = b; end;
local sm;
if (big == a) then sm = b; else sm = a; end;
local M_ = ((a.m or __NaN) + (b.m or __NaN));
local r = __mmin(M.R_MAX, __mmax(__msqrt((((big.r or __NaN) * (big.r or __NaN)) + ((0.3 * (sm.r or __NaN)) * (sm.r or __NaN)))), __msqrt(M_)));
local x = ((((a.x or __NaN) * (a.m or __NaN)) + ((b.x or __NaN) * (b.m or __NaN))) / M_);
local y = ((((a.y or __NaN) * (a.m or __NaN)) + ((b.y or __NaN) * (b.m or __NaN))) / M_);
a.vx = ((((a.vx or __NaN) * (a.m or __NaN)) + ((b.vx or __NaN) * (b.m or __NaN))) / M_);
a.vy = ((((a.vy or __NaN) * (a.m or __NaN)) + ((b.vy or __NaN) * (b.m or __NaN))) / M_);
a.age = __mmin((a.age or __NaN), (b.age or __NaN));
a.x = x;
a.y = __mmin(y, (a.y or __NaN), (b.y or __NaN));
a.r = r;
a.m = __mmin(M_, (r * r));
a.v = big.v;
dead[j] = 1;
s.stats.dense = (s.stats.dense or __NaN) + 1;
elseif (((q < 1.05) and ((a.r or __NaN) <= M.R_SMALL)) and ((b.r or __NaN) <= M.R_SMALL)) then
local r = (((dist + (a.r or __NaN)) + (b.r or __NaN)) / 2);
if (r > M.R_MAX) then
do break end;
end;
local t = ((dist > 0.001) and ((r - (a.r or __NaN)) / dist) or 0);
local M_ = (((a.m or __NaN) + (b.m or __NaN)) * 0.96);
a.vx = ((((a.vx or __NaN) * (a.m or __NaN)) + ((b.vx or __NaN) * (b.m or __NaN))) / ((a.m or __NaN) + (b.m or __NaN)));
a.vy = ((((a.vy or __NaN) * (a.m or __NaN)) + ((b.vy or __NaN) * (b.m or __NaN))) / ((a.m or __NaN) + (b.m or __NaN)));
a.x = ((a.x or __NaN) + (dx * t));
a.y = __mmin(((a.y or __NaN) + (dy * t)), (a.y or __NaN), (b.y or __NaN));
a.r = r;
a.m = __mmin(M_, (r * r));
a.age = __mmin((a.age or __NaN), (b.age or __NaN));
dead[j] = 1;
s.stats.large = (s.stats.large or __NaN) + 1;
else
do break end;
end;
if (((a.r or __NaN) > M.CELL) and (reach == 1)) then
do __b22 = true; break end;
end;
until true;
if __b22 then break end;
end;
end;
until true;
cx = cx + 1;
end;
end;
cy = cy + 1;
end;
end;
until true;
end;
local n = 0;
for i = 0, (cs.length or #cs) - 1 do
if (not __T(dead[i])) then
cs[(function() local __t24 = n; n = __t24 + 1; return __t24 end)()] = cs[i];
end;
end;
__setlen(cs, n);
end;
-- smoke:159
M.updateSmoke = function(g, dt) 
local s = g.smoke;
if ((not __T(s)) or (s.map ~= g.map)) then
s = M.init(g);
end;
M.emit(s, g, dt);
local w = g.map.wind;
local B = g.map;
local cs = s.clouds;
local kv = (1 - __mexp(((-1.2) * dt)));
local fade = __mexp(((-dt) / M.FADE));
local n = 0;
do
local __t25, __t26 = __it(cs), 0;
while __t26 < __t25.length do
repeat
local c = __t25[__t26]; __t26 = __t26 + 1;
c.age = ((c.age or __NaN) + dt);
local lift = (((c.age or __NaN) < 2) and ((-5) * (1 - ((c.age or __NaN) / 2))) or 0);
c.vx = ((c.vx or __NaN) + (((w.x or __NaN) - (c.vx or __NaN)) * kv));
c.vy = ((c.vy or __NaN) + ((((w.y or __NaN) + lift) - (c.vy or __NaN)) * kv));
if ((c.vy or __NaN) > 0) then
c.vy = 0;
end;
c.x = ((c.x or __NaN) + ((c.vx or __NaN) * dt));
c.y = ((c.y or __NaN) + ((c.vy or __NaN) * dt));
c.r = __mmin(M.R_MAX, ((c.r or __NaN) + ((dt * 0.9) / (1 + ((c.r or __NaN) / 8)))));
c.m = ((c.m or __NaN) * fade);
if (((c.m or __NaN) / ((c.r or __NaN) * (c.r or __NaN))) < M.D_MIN) then
do break end;
end;
if (((((c.x or __NaN) < ((-M.R_MAX) - 20)) or ((c.x or __NaN) > (((B.w or __NaN) + M.R_MAX) + 20))) or ((c.y or __NaN) < ((-M.R_MAX) - 30))) or ((c.y or __NaN) > (((B.h or __NaN) + M.R_MAX) + 20))) then
do break end;
end;
cs[(function() local __t28 = n; n = __t28 + 1; return __t28 end)()] = c;
until true;
end;
end;
__setlen(cs, n);
s.mergeT = ((s.mergeT or __NaN) - dt);
if (((s.mergeT or __NaN) <= 0) and ((cs.length or #cs) > 1)) then
s.mergeT = M.MERGE_EVERY;
M.merge(s);
end;
end;

-- smoke:11
M.SMOKE_MAX = 140;
-- smoke:12
M.R_MAX = 30;
-- smoke:13
M.R_SMALL = 15;
-- smoke:14
M.CELL = 16;
-- smoke:15
M.MERGE_EVERY = 0.1;
-- smoke:16
M.FADE = 9;
-- smoke:17
M.D_MIN = 0.045;
-- smoke:30
M.density = function(c) 
return __mmin(1, ((c.m or __NaN) / ((c.r or __NaN) * (c.r or __NaN))));
end;
-- smoke:56
M.seen = function(g, x, y, m) 
return ((((x > ((g.cam.x or __NaN) - m)) and (x < (((g.cam.x or __NaN) + 320) + m))) and (y > ((g.cam.y or __NaN) - m))) and (y < (((g.cam.y or __NaN) + 180) + m)));
end;
-- smoke:77
M.roar = function(k) 
return ((k < 0.15) and (0.4 + (k * 4)) or ((k > 0.8) and __mmax(0.3, ((1 - k) * 5)) or 1));
end;
