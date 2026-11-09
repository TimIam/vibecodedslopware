-- Generated from the-endgame-is-me/js/levels/wall.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("levels/wall");
local __I0 = RT.module("levels/forest");
local __I1 = RT.module("props");
local __T, __assign, __band, __filter, __forEach, __hypot, __it, __join, __map, __padStart, __parseInt, __push, __sarr, __shr, __slice, __some, __str, __toFixed, __toString = RT["T"], RT["assign"], RT["band"], RT["filter"], RT["forEach"], RT["hypot"], RT["it"], RT["join"], RT["map"], RT["padStart"], RT["parseInt"], RT["push"], RT["sarr"], RT["shr"], RT["slice"], RT["some"], RT["str"], RT["toFixed"], RT["toString"];
local __NaN = 0 / 0;
local __mabs, __masin, __matan2, __mceil, __mcos, __mfloor, __mfmod, __mmax, __mmin, __msin, __msqrt = math.abs, math.asin, math.atan2, math.ceil, math.cos, math.floor, math.fmod, math.max, math.min, math.sin, math.sqrt;

-- levels/wall:54
M.layoutWall = function() 
local anchors = {[0]={[0]=(-16), 8, "wl_tower", length=3}, {[0]=158, 182, "wl_tower", length=3}, {[0]=408, 432, "wl_tower", length=3}, {[0]=618, 642, "wl_tower", length=3}, {[0]=826, M.GATE_X0, "wl_tower", "L", length=4}, {[0]=M.GATE_X0, M.GATE_X1, "wl_gate", length=3}, {[0]=M.GATE_X1, 896, "wl_tower", "R", length=4}, {[0]=1068, 1092, "wl_tower", length=3}, {[0]=1258, 1282, "wl_tower", length=3}, length=9};
local secs = {length=0};
local x = (-M.TEXOFF);
do
local __t1, __t2 = __it(__sarr(1, anchors, 0, {[0]=(M.WW + M.TEXOFF), (M.WW + M.TEXOFF), nil, length=3})), 0;
while __t2 < __t1.length do
local __t4 = __t1[__t2]; __t2 = __t2 + 1; local a0, a1, kind, side; a0 = __t4[0]; a1 = __t4[1]; kind = __t4[2]; side = __t4[3];
local gap = (a0 - x);
if (gap > 0) then
local n = __mmax(1, __mfloor((gap / 40) + 0.5));
for i = 0, n - 1 do
local s0 = __mfloor((x + ((gap * i) / n)) + 0.5);
local s1 = __mfloor((x + ((gap * (i + 1)) / n)) + 0.5);
__push(secs, {kind="wl_curtain", x0=s0, x1=s1, postern=((M.OLD_X >= s0) and (M.OLD_X < s1))});
end;
end;
if __T(kind) then
__push(secs, {kind=kind, x0=a0, x1=a1, banner=(not (not __T(side)))});
end;
x = a1;
end;
end;
__forEach(secs, function(s, i) 
s.i = i;
s.total = M.HITS[s.kind];
s.label = M.LABEL[s.kind];
s.drawn = (-1);
end);
do return secs end;
end;
-- levels/wall:76
M.build = function(g, rng, P) 
local start = {x=70, y=122, face=0};
local water = P.makeWater(M.WW, M.WH, 6);
local cs = water.cs;
P.setWater(water, 0, M.MOAT0, (M.WW - 1), (M.MOAT1 - 1), 1);
local fill = function(c, r) 
if ((c >= 0) and (c < (water.cols or __NaN))) then
water.a[((r * (water.cols or __NaN)) + c)] = 2;
end;
end;
local r0 = (M.MOAT0 / cs);
local r1 = ((M.MOAT1 / cs) - 1);
local oc = __mfloor((M.OLD_X / cs));
__forEach({[0]={[0]=oc, length=1}, {[0]=oc, length=1}, {[0]=(oc - 1), oc, length=2}, {[0]=oc, length=1}, {[0]=(oc - 1), oc, (oc + 1), length=3}, length=5}, function(cols, k) 
return __forEach(cols, function(c) 
return fill(c, (r0 + k));
end);
end);
for c = (__mfloor((M.GATE_X0 / cs)) + 1), (__mfloor((M.GATE_X1 / cs)) - 1) do
fill(c, r1);
end;
for i = 0, 26 - 1 do
repeat
local c = __mfloor((rng() * (water.cols or __NaN)));
local r = ((rng() < 0.75) and r1 or (r1 - 1));
if ((__mabs(((c * cs) - M.OLD_X)) < 30) or (__mabs(((c * cs) - ((M.GATE_X0 + M.GATE_X1) / 2))) < 30)) then
do break end;
end;
local row = (r * (water.cols or __NaN));
if ((((water.a[((row + c) - 1)] == 2) or (water.a[((row + c) + 1)] == 2)) or (water.a[((row + c) - 2)] == 2)) or (water.a[((row + c) + 2)] == 2)) then
do break end;
end;
fill(c, r);
until true;
end;
g.water = water;
g.waterDirty = true;
local wall = M.layoutWall();
do
local __t8, __t9 = __it(wall), 0;
while __t9 < __t8.length do
repeat
local s = __t8[__t9]; __t9 = __t9 + 1;
local a = __mmax(0, (s.x0 or __NaN));
local b = __mmin(M.WW, (s.x1 or __NaN));
if ((b - a) < 2) then
do break end;
end;
local hp = M.kinds[s.kind].hp;
s.prop = P.addProp(g, s.kind, ((a + b) / 2), (M.WALL_B / 2), {w=(b - a), h=M.WALL_B, lastHp=hp, sec=s.i});
until true;
end;
end;
local keep = {[0]={x=start.x, y=start.y, r=34}, length=1};
for y = 70, 140 - 1, 8 do
__push(keep, {x=M.gateLaneX(y), y=y, r=18});
end;
__push(keep, {x=M.OLD_X, y=88, r=20}, {x=600, y=94, r=22});
local spots = __filter(__I0.scatter(rng, 34, 24, 92, (M.WW - 24), 152, 31, keep), function(s) 
return (__mabs(((s.y or __NaN) - M.roadY(s.x))) > 13);
end);
do
local __t12, __t13 = __it(spots), 0;
while __t13 < __t12.length do
local s = __t12[__t13]; __t13 = __t13 + 1;
local k = rng();
local kind = ((k < 0.36) and "wl_cottage" or ((k < 0.68) and "wl_house" or ((k < 0.84) and "wl_barn" or "wl_watch")));
P.addProp(g, kind, __mfloor((s.x or __NaN) + 0.5), __mfloor((s.y or __NaN) + 0.5));
end;
end;
for i = 0, 9 - 1 do
repeat
local x = (120 + (rng() * (M.WW - 200)));
local y = (M.roadY(x) + ((rng() < 0.5) and (-9) or 9));
if (__hypot((x - (start.x or __NaN)), (y - (start.y or __NaN))) < 30) then
do break end;
end;
P.addProp(g, ((rng() < 0.5) and "wl_cart" or "wl_stall"), __mfloor(x + 0.5), __mfloor(y + 0.5));
until true;
end;
do
local __t16, __t17 = __it({[0]=96, 112, length=2}), 0;
while __t17 < __t16.length do
local y = __t16[__t17]; __t17 = __t17 + 1;
P.addProp(g, "wl_stall", __mfloor((M.gateLaneX(y) + ((y == 96) and (-16) or 17)) + 0.5), y);
end;
end;
do
local __t19, __t20 = __it({[0]={[0]=(-22), 96, length=2}, {[0]=14, 104, length=2}, {[0]=30, 90, length=2}, length=3}), 0;
while __t20 < __t19.length do
local __t22 = __t19[__t20]; __t20 = __t20 + 1; local dx, dy; dx = __t22[0]; dy = __t22[1];
P.addProp(g, "wl_timber", (M.OLD_X + dx), dy);
end;
end;
do
local __t23, __t24 = __it({[0]={[0]=(-12), 88, length=2}, {[0]=0, 86, length=2}, {[0]=12, 90, length=2}, {[0]=(-6), 98, length=2}, {[0]=8, 100, length=2}, length=5}), 0;
while __t24 < __t23.length do
local __t26 = __t23[__t24]; __t24 = __t24 + 1; local dx, dy; dx = __t26[0]; dy = __t26[1];
P.addProp(g, "wl_block", (600 + dx), dy);
end;
end;
do return {w=M.WW, h=M.WH, scroll="x", start=start, wall=wall, edges={[0]=0, 1, 3, length=3}, sideBand={[0]=86, 140, length=2}, key=__mfloor((rng() * 1000000000)), roadY=M.roadY} end;
end;
-- levels/wall:133
M.update = function(g, dt, api) 
local m = g.map;
local b = g.boss;
local across = ((b.y or __NaN) < (M.MOAT1 + 3));
do
local __t27, __t28 = __it(m.wall), 0;
while __t28 < __t27.length do
repeat
local s = __t27[__t28]; __t28 = __t28 + 1;
local p = s.prop;
if (not __T(p)) then
do break end;
end;
if (p.state == "up") then
if ((p.hp or __NaN) < (p.lastHp or __NaN)) then
if across then
p.lastHp = p.hp;
s.hit = true;
for i = 0, 4 - 1 do
api.part(g, (__mmax(((p.x or __NaN) - ((p.w or __NaN) / 2)), __mmin(((p.x or __NaN) + ((p.w or __NaN) / 2)), (b.x or __NaN))) + ((g.rng() - 0.5) * 14)), ((M.WALL_B - 2) - (g.rng() * 8)), ((g.rng() - 0.5) * 30), (10 + (g.rng() * 20)), 0.6, "dust");
end;
else
p.hp = p.lastHp;
if (g.rng() < 0.3) then
api.part(g, ((p.x or __NaN) + ((g.rng() - 0.5) * (p.w or __NaN))), (M.WALL_B - 4), ((g.rng() - 0.5) * 20), 15, 0.3, "spark");
end;
end;
end;
elseif (((not __T(s.breached)) and (not __T(g.clear))) and (not __T(g.won))) then
s.breached = true;
g.shake = __mmax((g.shake or __NaN), 0.7);
for i = 0, 40 - 1 do
local a = (g.rng() * math.pi);
local sp = (20 + (g.rng() * 50));
api.part(g, ((p.x or __NaN) + ((g.rng() - 0.5) * (p.w or __NaN))), (M.WALL_B - (g.rng() * 20)), (__mcos(a) * sp), ((__msin(a) * sp) * 0.6), (0.6 + (g.rng() * 0.8)), ((g.rng() < 0.6) and "dust" or "rock2"));
end;
local pts = __mfloor((3000 * (g.mult or __NaN)) + 0.5);
api.addScore(g, pts);
api.text(g, p.x, (M.WALL_B + 14), ("+" .. __str(pts)), "gold", 2);
api.sound(g, "collapse");
api.banner(g, ((s.kind == "wl_gate") and "THE GATE IS DOWN" or "THE WALL IS DOWN"), "THE CITY IS OPEN. WALK IN.", 4);
end;
until true;
end;
end;
if (((not __T(g.clear)) and (not __T(g.won))) and (not __T(b.dead))) then
do
local __t32, __t33 = __it(m.wall), 0;
local __b34 = false;
while __t33 < __t32.length do
repeat
local s = __t32[__t33]; __t33 = __t33 + 1;
if (not __T(s.breached)) then
do break end;
end;
local a = __mmax(0, (s.x0 or __NaN));
local c = __mmin(M.WW, (s.x1 or __NaN));
if ((((b.y or __NaN) < (M.WALL_B + 6)) and ((b.x or __NaN) > (a - 2))) and ((b.x or __NaN) < (c + 2))) then
api.walkOff(g, {x=((a + c) / 2), title="INTO THE CITY", sub="THE HOARD OPENS IN A MOMENT."});
do __b34 = true; break end;
end;
until true;
if __b34 then break end;
end;
end;
end;
local cs = g.water.cs;
do
local __t35, __t36 = __it(g.props), 0;
while __t36 < __t35.length do
repeat
local p = __t35[__t36]; __t36 = __t36 + 1;
if ((p.state ~= "down") or (not __T((M.kinds[p.kind] and M.kinds[p.kind].push)))) then
do break end;
end;
if ((p.y or __NaN) < (M.MOAT0 + 3)) then
p.y = (M.MOAT0 + 3);
p.vy = __mmax(0, (p.vy or __NaN));
end;
if (((__T(p.vx) or __T(p.vy)) or ((p.y or __NaN) >= M.MOAT1)) or __T(__I1.isWater(g, p.x, p.y))) then
do break end;
end;
do
local __t38, __t39 = __it(M.TUMBLE), 0;
local __b40 = false;
while __t39 < __t38.length do
repeat
local __t41 = __t38[__t39]; __t39 = __t39 + 1; local dx, dy; dx = __t41[0]; dy = __t41[1];
local tx = ((p.x or __NaN) + (dx * cs));
local ty = ((p.y or __NaN) + (dy * cs));
if (not __T(__I1.isWater(g, tx, ty))) then
do break end;
end;
local l = __hypot(dx, dy);
p.vx = (((dx / l) * 38) * l);
p.vy = (((dy / l) * 38) * l);
g.propsDirty = true;
do __b40 = true; break end;
until true;
if __b40 then break end;
end;
end;
until true;
end;
end;
do
local __t42, __t43 = __it(g.units), 0;
while __t43 < __t42.length do
local u = __t42[__t43]; __t43 = __t43 + 1;
if (((not __T(u.dead)) and ((u.y or __NaN) < M.MOAT0)) and (not ((u.role == "rider") and (u.state == "climb")))) then
u.y = (M.MOAT1 + 4);
end;
end;
end;
end;
-- levels/wall:195
M.hud = function(g) 
if __T(g.walkoff) then
do return "INTO THE CITY" end;
end;
if __some(g.map.wall, function(s) 
return s.breached;
end) then
do return "THE WAY IS OPEN. WALK IN" end;
end;
local best = nil;
do
local __t45, __t46 = __it(g.map.wall), 0;
while __t46 < __t45.length do
repeat
local s = __t45[__t46]; __t46 = __t46 + 1;
local p = s.prop;
if ((not __T(p)) or (p.state ~= "up")) then
do break end;
end;
local hits = __mfloor((((p.maxhp or __NaN) - (p.hp or __NaN)) / M.BASH) + 0.5);
if ((hits > 0) and ((not __T(best)) or ((hits / (s.total or __NaN)) > (best.k or __NaN)))) then
best = {s=s, hits=hits, k=(hits / (s.total or __NaN))};
end;
until true;
end;
end;
if __T(best) then
do return (__str(best.s.label) .. " " .. __str(__mmin((best.hits or __NaN), ((best.s.total or __NaN) - 1))) .. "/" .. __str(best.s.total)) end;
end;
do return M.FLAVOUR[__mfmod(__mfloor((((g.t or __NaN) - (__T(g.levelT0) and g.levelT0 or 0)) / 9)), M.FLAVOUR.length)] end;
end;
-- levels/wall:218
M.dot = function(c, x, y, col) 
c.fillStyle = col;
c:fillRect(x, y, 1, 1);
end;
-- levels/wall:223
M.ashlar = function(h, X, y, y0, base, seed) 
local course = __mfloor(((y - y0) / 4));
local row = __mfmod((y - y0), 4);
if (row == 3) then
do return 1 end;
end;
local L = (6 + __mfmod(((course * 5) + seed), 4));
local off = ((course * 3) + seed);
local k = __mfmod((__mfmod((X + off), L) + L), L);
local id = __mfloor(((X + off) / L));
if (k == 0) then
do return 1 end;
end;
local l = ((base + ((h.hash(((id * 7) + seed), course) - 0.5) * 1.6)) + ((h.hash(X, ((y * 3) + seed)) - 0.5) * 0.7));
if (row == 0) then
l = (l + 0.8);
end;
if (k == 1) then
l = (l + 0.5);
end;
if (k == (L - 1)) then
l = (l - 0.4);
end;
do return l end;
end;
-- levels/wall:236
M.paintCurtain = function(c, s, stage, h) 
local sd = (((s.i or __NaN) * 13) + 5);
do
local X = s.x0;
while (X < (s.x1 or __NaN)) do
local tx = (X + M.TEXOFF);
local m7 = __mfmod((__mfmod(X, 7) + 7), 7);
local merlon = (m7 < 5);
for y = 10, 46 - 1 do
local col = nil;
if (y == 10) then
col = M.ST[1];
elseif (y == 11) then
col = M.ST[3];
elseif (y <= 14) then
if (__mfmod((X + (y * 3)), 9) == 0) then col = M.ST[3]; elseif (y == 14) then col = M.ST[3]; else col = M.ST[5]; end;
elseif (y <= 21) then
if merlon then
if (y == 15) then
col = M.ST[6];
elseif (y == 16) then
col = M.ST[5];
else
col = M.pick(M.ST, ((((m7 == 0) and 4.4 or ((m7 == 4) and 2.4 or 3.4)) - ((y - 17) * 0.15)) + ((h.hash(X, y) - 0.5) * 0.6)));
end;
if ((m7 == 4) and (y > 15)) then
col = M.ST[1];
end;
else
if (y <= 17) then col = M.ST[2]; elseif (y <= 19) then col = M.ST[0]; else col = M.ST[5]; end;
end;
if ((not merlon) and (y == 20)) then
col = M.ST[5];
end;
if ((not merlon) and (y == 21)) then
col = M.ST[4];
end;
elseif (y == 22) then
col = M.ST[6];
elseif (y == 23) then
col = "#24211c";
elseif (y <= 41) then
local l = M.ashlar(h, X, y, 24, (3.1 - ((y - 24) * 0.06)), sd);
if (l == 1) then col = M.ST[1]; else col = M.pick(M.ST, l); end;
if ((y > 34) and (h.hash((X * 3), (y + sd)) < ((y - 34) * 0.07))) then
if (h.hash(X, (y * 7)) < 0.5) then col = M.MOSS[1]; else col = M.MOSS[0]; end;
end;
if (((y > 38) and (__mfmod((X + sd), 23) < 2)) and (h.hash(X, y) < 0.7)) then
col = "#2c2e28";
end;
elseif (y <= 44) then
if (h.hash((X * 5), y) < 0.3) then col = M.MOSS[0]; elseif (y == 44) then col = "#1d2a2e"; else col = M.pick(M.ST, (1.6 + (h.hash(X, (y + 1)) * 1.4))); end;
if ((y == 42) and (h.hash(X, 99) < 0.4)) then
col = M.MOSS[2];
end;
end;
if __T(col) then
M.dot(c, tx, y, col);
end;
end;
local lx = (X - (s.x0 or __NaN));
if ((lx == __mfloor((((s.x1 or __NaN) - (s.x0 or __NaN)) / 2))) and (not __T(s.postern))) then
for y = 27, 33 - 1 do
M.dot(c, tx, y, M.INK);
M.dot(c, (tx - 1), y, M.ST[2]);
M.dot(c, (tx + 1), y, M.ST[5]);
end;
end;
X = X + 1;
end;
end;
if __T(s.postern) then
local cx = M.OLD_X;
for y = 26, 42 - 1 do
for dx = (-6), 6 do
repeat
local top = (32 - __msqrt(__mmax(0, (36 - (dx * dx)))));
if (y < (top - 1)) then
do break end;
end;
local ring = ((y < (top + 1)) or (__mabs(dx) == 6));
local brick = ((__mfmod(((dx + 8) + (__mfmod(__mfloor((y / 2)), 2) * 2)), 4) == 0) or (__mfmod(y, 2) == 0));
M.dot(c, ((cx + dx) + M.TEXOFF), y, (function() if ring then return (function() if (dx < 0) then return M.ST[6]; else return M.ST[4]; end; end)(); elseif brick then return "#4a4038"; else return M.pick({[0]="#5e5348", "#6a5c4e", "#544a40", length=3}, ((h.hash(dx, y) * 2.9) - 0.5)); end; end)());
until true;
end;
end;
end;
if (stage > 0) then
M.damage(c, s, stage, h, 24, 41);
end;
end;
-- levels/wall:287
M.damage = function(c, s, stage, h, y0, y1) 
local sd = (((s.i or __NaN) * 31) + 7);
local w = ((s.x1 or __NaN) - (s.x0 or __NaN));
for k = 0, __mceil((stage * 2)) - 1 do
local x = (((s.x0 or __NaN) + 3) + __mfloor((h.hash((sd + k), 1) * (w - 6))));
local y = ((y0 - 2) + __mfloor((h.hash(sd, (k + 3)) * 4)));
local len = ((8 + __mfloor((h.hash(k, sd) * 10))) + (stage * 3));
do
local i = 0;
while ((i < len) and (y < y1)) do
M.dot(c, (x + M.TEXOFF), y, (function() if (__mfmod(i, 5) == 4) then return M.ST[1]; else return "#16130f"; end; end)());
if (h.hash(x, (y + sd)) < 0.3) then
M.dot(c, ((x + 1) + M.TEXOFF), y, M.ST[4]);
end;
if (h.hash(i, (sd + k)) < 0.12) then
local bx = (x + ((h.hash(y, k) < 0.5) and (-1) or 1));
M.dot(c, (bx + M.TEXOFF), (y + 1), "#24201a");
M.dot(c, (((bx * 2) - x) + M.TEXOFF), (y + 2), "#24201a");
end;
y = y + 1;
do
local t = h.hash(((x * 3) + i), (y + sd));
x = (x + ((t < 0.28) and (-1) or ((t > 0.72) and 1 or 0)));
end;
x = __mmax(((s.x0 or __NaN) + 1), __mmin(((s.x1 or __NaN) - 2), x));
i = i + 1;
end;
end;
end;
if ((stage >= 2) and (s.kind ~= "wl_gate")) then
for k = 0, __mceil((stage - 1)) - 1 do
local mx = (((s.x0 or __NaN) + 2) + __mfloor((h.hash(sd, (40 + k)) * (w - 8))));
do
local x = mx;
while (x < (mx + 5)) do
do
local y = ((s.kind == "wl_tower") and 2 or 15);
while (y < ((s.kind == "wl_tower") and 7 or 21)) do
local t = h.hash(x, (y + sd));
c:clearRect((x + M.TEXOFF), y, 1, 1);
if ((y > ((s.kind == "wl_tower") and 4 or 18)) or (t < 0.25)) then
M.dot(c, (x + M.TEXOFF), y, (function() if (t < 0.5) then return M.ST[2]; else return M.ST[6]; end; end)());
end;
y = y + 1;
end;
end;
x = x + 1;
end;
end;
end;
end;
if (stage >= 3) then
local hx = (__mfloor((((s.x0 or __NaN) + (s.x1 or __NaN)) / 2)) + __mfloor(((h.hash(sd, 9) - 0.5) * (w - 14))));
local hy = (y0 + 7);
do
local y = (hy - 5);
while (y <= (hy + 5)) do
for x = (hx - 6), (hx + 6) do
repeat
local d = (__hypot(((x - hx) / 6), ((y - hy) / 5)) + ((h.hash(x, y) - 0.5) * 0.35));
if (d > 1) then
do break end;
end;
M.dot(c, (x + M.TEXOFF), y, (function() if (d > 0.8) then return M.ST[6]; elseif (d > 0.6) then return M.ST[1]; elseif (h.hash((x * 3), y) < 0.3) then return M.ST[2]; else return "#1a1712"; end; end)());
until true;
end;
y = y + 1;
end;
end;
for i = 0, 9 - 1 do
local x = ((s.x0 or __NaN) + __mfloor((h.hash(i, sd) * w)));
M.dot(c, (x + M.TEXOFF), 42, M.ST[4]);
M.dot(c, ((x + M.TEXOFF) + 1), 42, M.ST[2]);
M.dot(c, (x + M.TEXOFF), 41, M.ST[5]);
end;
end;
end;
-- levels/wall:322
M.paintTower = function(c, s, stage, h) 
local tw = ((s.x1 or __NaN) - (s.x0 or __NaN));
local cx = (((s.x0 or __NaN) + (s.x1 or __NaN)) / 2);
local sd = (((s.i or __NaN) * 17) + 3);
do
local X = s.x0;
while (X < (s.x1 or __NaN)) do
local tx = (X + M.TEXOFF);
local nx = (((X + 0.5) - cx) / (tw / 2));
local a = __masin(__mmax((-1), __mmin(1, nx)));
local lit = ((3.3 - (nx * 1.6)) - ((nx * nx) * 1.1));
local edge = ((X == s.x0) or (X == ((s.x1 or __NaN) - 1)));
local merl = (__mfmod(__mfloor(((a + 2) * 3.2)), 2) == 0);
for y = 1, 46 - 1 do
local col = nil;
if (y <= 7) then
if merl then
if (y == 1) then col = (function() if edge then return nil; else return M.ST[6]; end; end)(); elseif (y == 2) then col = M.ST[5]; else col = M.pick(M.ST, ((lit + 0.3) - ((y - 3) * 0.1))); end;
else
if (y <= 3) then col = nil; elseif (y == 4) then col = M.ST[1]; elseif (y == 5) then col = M.ST[5]; else col = M.pick(M.ST, (lit + 0.2)); end;
end;
elseif (y <= 9) then
col = ((__mfmod((X + y), 2) ~= 0) and M.INK or M.pick(M.ST, (lit + 0.8)));
elseif (y == 10) then
col = "#1e1b17";
elseif (y <= 43) then
local course = __mfloor(((y - 11) / 4));
local row = __mfmod((y - 11), 4);
local sid = __mfloor((((a * 3.2) + (course * 0.5)) + sd));
local sidL = __mfloor((((__masin(__mmax((-1), __mmin(1, (nx - (2 / tw))))) * 3.2) + (course * 0.5)) + sd));
if ((row == 3) or (sid ~= sidL)) then
col = M.pick(M.ST, (lit - 1.6));
else
col = M.pick(M.ST, (((lit + ((row == 0) and 0.6 or 0)) + ((h.hash(sid, course) - 0.5) * 1.2)) + ((h.hash(X, (y + sd)) - 0.5) * 0.5)));
end;
if ((y > 35) and (h.hash((X * 3), (y + sd)) < ((y - 35) * 0.08))) then
col = M.MOSS[((h.hash(X, y) < 0.5) and 1 or 0)];
end;
if (y >= 42) then
col = ((y == 43) and "#1d2a2e" or (function() if (h.hash(X, y) < 0.35) then return M.MOSS[0]; else return M.pick(M.ST, (lit - 1.2)); end; end)());
end;
end;
if ((edge and (y > 2)) and (y < 43)) then
col = M.INK;
end;
if __T(col) then
M.dot(c, tx, y, col);
end;
end;
X = X + 1;
end;
end;
do
local X = ((s.x0 or __NaN) + 2);
while (X < ((s.x1 or __NaN) - 2)) do
M.dot(c, (X + M.TEXOFF), 3, "#24201b");
X = X + 1;
end;
end;
local sx = (__mfloor((cx - 0.5) + 0.5) + M.TEXOFF);
for y = 15, 21 - 1 do
M.dot(c, sx, y, M.INK);
M.dot(c, (sx + 1), y, M.ST[5]);
end;
for y = 28, 33 - 1 do
M.dot(c, (sx - 5), y, M.INK);
M.dot(c, (sx + 5), y, M.INK);
M.dot(c, (sx + 6), y, M.ST[4]);
end;
if __T(s.banner) then
for y = 11, 26 - 1 do
for dx = (-3), 3 do
repeat
if ((y > 23) and (__mabs(dx) < (25 - y))) then
do break end;
end;
local ed = ((__mabs(dx) == 3) or (y == 11));
M.dot(c, (sx + dx), y, (ed and "#4a140f" or ((dx < 0) and "#a8362a" or "#8a2a20")));
until true;
end;
end;
do
local __t68, __t69 = __it({[0]={[0]=0, 15, length=2}, {[0]=(-1), 16, length=2}, {[0]=0, 16, length=2}, {[0]=1, 16, length=2}, {[0]=0, 17, length=2}, {[0]=(-1), 18, length=2}, {[0]=1, 18, length=2}, {[0]=0, 19, length=2}, length=8}), 0;
while __t69 < __t68.length do
local __t71 = __t68[__t69]; __t69 = __t69 + 1; local dx, dy; dx = __t71[0]; dy = __t71[1];
M.dot(c, (sx + dx), dy, "#e8c050");
end;
end;
M.dot(c, (sx - 4), 11, M.IRON[2]);
M.dot(c, (sx + 4), 11, M.IRON[2]);
end;
if (stage > 0) then
M.damage(c, s, stage, h, 12, 41);
end;
end;
-- levels/wall:368
M.paintGate = function(c, s, stage, h) 
local cx = (((s.x0 or __NaN) + (s.x1 or __NaN)) / 2);
local sd = ((s.i or __NaN) * 11);
do
local X = s.x0;
while (X < (s.x1 or __NaN)) do
local tx = (X + M.TEXOFF);
local dx = ((X + 0.5) - cx);
local m6 = __mfmod((__mfmod((X - (s.x0 or __NaN)), 6) + 6), 6);
local merlon = (m6 < 4);
for y = 8, 46 - 1 do
local col = nil;
local archTop = (30 - __msqrt(__mmax(0, (81 - (dx * dx)))));
local inArch = ((__mabs(dx) < 9) and (y >= archTop));
if (y <= 9) then
if (y == 8) then col = M.ST[1]; else col = M.ST[5]; end;
elseif (y <= 15) then
if merlon then
if (y == 10) then col = M.ST[6]; elseif (y == 11) then col = M.ST[5]; else col = M.pick(M.ST, ((m6 == 3) and 1.6 or 3.6)); end;
else
if (y <= 12) then col = M.ST[2]; elseif (y <= 14) then col = M.ST[0]; else col = M.ST[5]; end;
end;
elseif (y == 16) then
col = M.ST[6];
elseif (y == 17) then
col = "#24211c";
elseif inArch then
local board = __mfloor(((dx + 9) / 3));
local bx = __mfmod((__mfmod(__mfloor((dx + 9)), 3) + 3), 3);
if (bx == 0) then col = M.WOOD[0]; else col = M.WOOD[(1 + __mfloor((h.hash(board, (__mfloor((y / 5)) + sd)) * 2.6)))]; end;
if ((bx == 1) and (h.hash(board, y) < 0.15)) then
col = M.WOOD[3];
end;
if ((y == 25) or (y == 36)) then
col = M.IRON[1];
end;
if (((y == 25) or (y == 36)) and (bx == 1)) then
col = M.IRON[2];
end;
if (y < (archTop + 1)) then
col = M.WOOD[0];
end;
elseif (((__mabs(dx) < 11) and (y >= (archTop - 2))) and (y <= 41)) then
local ang = __matan2((y - 30), dx);
local v = __mfloor((ang * 5));
if (__mfmod(v, 2) ~= 0) then col = M.ST[5]; else col = M.ST[4]; end;
if (dx > 0) then
if (__mfmod(v, 2) ~= 0) then col = M.ST[4]; else col = M.ST[3]; end;
end;
elseif (y <= 41) then
local l = M.ashlar(h, X, y, 18, 3, sd);
if (l == 1) then col = M.ST[1]; else col = M.pick(M.ST, l); end;
elseif (y <= 44) then
col = ((y == 44) and "#1d2a2e" or M.pick(M.ST, (2 + (h.hash(X, y) * 1.4))));
end;
if __T(col) then
M.dot(c, tx, y, col);
end;
end;
X = X + 1;
end;
end;
local L = ((__mfloor(cx + 0.5) - 7) + M.TEXOFF);
local Rr = ((__mfloor(cx + 0.5) + 6) + M.TEXOFF);
for i = 0, 8 - 1 do
M.dot(c, (L - __mfloor((i / 2))), (23 - i), (function() if (__mfmod(i, 2) ~= 0) then return M.IRON[2]; else return M.IRON[1]; end; end)());
M.dot(c, (Rr + __mfloor((i / 2))), (23 - i), (function() if (__mfmod(i, 2) ~= 0) then return M.IRON[2]; else return M.IRON[1]; end; end)());
end;
M.dot(c, (L - 4), 15, M.INK);
M.dot(c, (Rr + 4), 15, M.INK);
if (stage > 0) then
for k = 0, __mceil((stage * 2)) - 1 do
local bx = ((__mfloor(cx + 0.5) - 8) + __mfloor((h.hash(k, (sd + 3)) * 15)));
local top = (24 + __mfloor((h.hash(sd, k) * 10)));
local len = (4 + (stage * 2));
for y = top, __mceil(__mmin(41, (top + len))) - 1 do
local hole = ((stage >= 2) and (k < stage));
M.dot(c, (bx + M.TEXOFF), y, (function() if hole then return (function() if (__mfmod(y, 3) == 0) then return M.IRON[1]; else return "#0c0a08"; end; end)(); else return "#1a120a"; end; end)());
if hole then
M.dot(c, ((bx + 1) + M.TEXOFF), y, (function() if ((__mfmod(y, 3) == 0) or (__mfmod((bx + 1), 3) == 0)) then return M.IRON[1]; else return "#0c0a08"; end; end)());
end;
if ((not hole) and (h.hash(bx, y) < 0.3)) then
M.dot(c, ((bx + 1) + M.TEXOFF), y, M.WOOD[3]);
end;
end;
end;
end;
end;
-- levels/wall:423
M.paintBreach = function(c, s, h) 
local w = ((s.x1 or __NaN) - (s.x0 or __NaN));
local mid = (((s.x0 or __NaN) + (s.x1 or __NaN)) / 2);
local sd = ((s.i or __NaN) * 7);
c:clearRect(((s.x0 or __NaN) + M.TEXOFF), 0, w, M.TH);
do
local X = s.x0;
while (X < (s.x1 or __NaN)) do
local tx = (X + M.TEXOFF);
local e = __mmin((X - (s.x0 or __NaN)), (((s.x1 or __NaN) - 1) - X));
local stub = ((e < 3) and ((14 + __mfloor((h.hash(X, sd) * 9))) + (e * 4)) or 99);
local mound = ((44 - __mmax(0, (13 * (1 - (((X - mid) / ((w / 2) + 5)) ^ 2))))) - (h.hash(X, 3) * 2));
for y = 12, 46 - 1 do
local col;
if (y >= mound) then
col = ((y > 43) and "#1d2a2e" or M.pick(M.ST, ((1.5 + (h.hash((X * 3), y) * 4)) - ((y - mound) * 0.15))));
elseif (y >= stub) then
if (y == stub) then col = M.ST[6]; else col = M.pick(M.ST, (3 + ((h.hash(X, y) - 0.5) * 2))); end;
elseif (y > (12 + ((e < 6) and 0 or 0))) then
col = ((y > 32) and ((h.hash(X, y) < 0.3) and "#3a3226" or "#2c261e") or "#15120e");
if (((((y > 14) and (y < 31)) and ((__mfmod(y, 6) == 1) or (__mfmod(y, 6) == 2))) and (__mfmod(X, 4) == 1)) and (h.hash(__mfloor((X / 4)), (__mfloor((y / 6)) + sd)) < 0.3)) then
col = ((__mfmod(y, 6) == 1) and "#f0c060" or "#b07a30");
elseif ((((y > 13) and (y < 32)) and (h.hash((__mfloor((X / 9)) + sd), 5) < 0.5)) and (y > (14 + __mfloor((h.hash(__mfloor((X / 9)), sd) * 6))))) then
col = "#1f1a14";
end;
end;
if __T(col) then
M.dot(c, tx, y, col);
end;
end;
if ((stub == 99) and (h.hash(X, 77) < 0.08)) then
M.dot(c, tx, (mound - 1), M.ST[6]);
end;
X = X + 1;
end;
end;
end;
-- levels/wall:446
M.paintSection = function(c, s, stage, h) 
c:clearRect(((s.x0 or __NaN) + M.TEXOFF), 0, ((s.x1 or __NaN) - (s.x0 or __NaN)), M.TH);
if (stage >= 4) then
do return M.paintBreach(c, s, h) end;
end;
if (s.kind == "wl_tower") then
M.paintTower(c, s, stage, h);
elseif (s.kind == "wl_gate") then
M.paintGate(c, s, stage, h);
else
M.paintCurtain(c, s, stage, h);
end;
end;
-- levels/wall:462
M.paintRoofs = function(c, h, seed) 
c.fillStyle = "#121310";
c:fillRect(0, 0, M.WW, M.RH);
local ROOF = {[0]={[0]="#3a1c14", "#5a2c1e", "#74402a", "#8c5434", length=4}, {[0]="#20242c", "#2e3440", "#3e4656", "#525c6e", length=4}, {[0]="#3a3018", "#54462a", "#6e5c36", "#867044", length=4}, length=3};
local house = function(x0, bw, top, bot, pal, dim) 
local ridge = (top + 1);
do
local x = x0;
while (x < (x0 + bw)) do
do
local y = top;
while (y <= bot) do
repeat
local X = __mfmod((__mfmod(x, M.WW) + M.WW), M.WW);
local l = ((y == ridge) and 3 or ((y < ridge) and 2 or (2 - (((y - ridge) / __mmax(1, (bot - ridge))) * 1.6))));
if (((x == x0) or (x == ((x0 + bw) - 1))) or (y == top)) then
M.dot(c, X, y, M.INK);
do break end;
end;
if (x == (x0 + 1)) then
l = (l + 0.5);
end;
if (x > (x0 + (bw * 0.65))) then
l = (l - 0.5);
end;
if ((__mfmod((x - x0), 2) == 0) and (y > ridge)) then
l = (l - 0.35);
end;
l = (l + (((h.hash(x, (y + seed)) - 0.5) * 0.4) - dim));
M.dot(c, X, y, M.pick(pal, l));
until true;
y = y + 1;
end;
end;
x = x + 1;
end;
end;
if (h.hash(x0, seed) < 0.4) then
local cx = ((x0 + 2) + __mfloor((h.hash(seed, x0) * (bw - 4))));
do
local y = (top - 2);
while (y < (top + 1)) do
M.dot(c, __mfmod((__mfmod(cx, M.WW) + M.WW), M.WW), y, "#3a3630");
M.dot(c, __mfmod((__mfmod((cx + 1), M.WW) + M.WW), M.WW), y, "#24211c");
y = y + 1;
end;
end;
end;
end;
do
local x = 0;
while (x < M.WW) do
local bw = (7 + __mfloor((h.hash(x, seed) * 8)));
house(x, bw, (2 + __mfloor((h.hash(seed, x) * 4))), 14, ROOF[__mfloor((h.hash(x, 5) * 3))], 0.7);
x = (x + (bw - 1));

end;
end;
do
local x = 90;
while (x < M.WW) do
for y = 0, 16 - 1 do
local hw = __mfloor((y / 3));
for dx = (-hw), hw do
M.dot(c, (x + dx), y, ((__mabs(dx) == hw) and M.INK or ((dx < 0) and "#525c6e" or "#3a4252")));
end;
end;
M.dot(c, x, 0, "#e8c050");
for y = 16, 22 - 1 do
for dx = (-3), 3 do
M.dot(c, (x + dx), y, ((__mabs(dx) == 3) and M.INK or ((dx < 0) and "#827b67" or "#6a6455")));
end;
end;
M.dot(c, x, 18, "#e8b04a");
x = (x + (150 + __mfloor((h.hash(x, seed) * 90))));
end;
end;
local kx = 860;
for x = (kx - 16), (kx + 16) - 1 do
for y = 0, __mceil(M.RH) - 1 do
local e = ((x == (kx - 16)) or (x == (kx + 15)));
local m = (__mfmod(((x - kx) + 16), 5) < 3);
local col = (e and M.INK or M.pick({[0]="#3e3a32", "#4f4a40", "#655f51", "#7a7362", length=4}, ((2.5 - ((x - kx) / 12)) + ((h.hash(x, y) - 0.5) * 0.6))));
if ((y < 2) and (not m)) then
col = nil;
end;
if ((y == 2) and m) then
col = "#8f8873";
end;
if (((y == 8) or (y == 9)) and (__mfmod(((x - kx) + 16), 8) == 4)) then
col = "#e8b04a";
end;
if __T(col) then
M.dot(c, x, y, col);
end;
end;
end;
do
local x = 3;
while (x < M.WW) do
local bw = (8 + __mfloor((h.hash(x, (seed + 1)) * 9)));
if ((__mabs((x - kx)) > 20) or (h.hash(x, 2) < 0.5)) then
house(x, bw, (9 + __mfloor((h.hash((seed + 2), x) * 4))), (M.RH - 1), ROOF[__mfloor((h.hash(x, 6) * 3))], 0.3);
end;
x = (x + ((bw + __mfloor((h.hash(x, 8) * 3))) - 1));

end;
end;
end;
-- levels/wall:504
M.under = function(ctx, g, h) 
local m = g.map;
local V = h.VIEW;
local W = h.W;
local tex = h.sprite(("wl-tex-" .. __str(m.key)), M.TEXW, M.TH, function(c) 
do
local __t91, __t92 = __it(m.wall), 0;
while __t92 < __t91.length do
local s = __t91[__t92]; __t92 = __t92 + 1;
M.paintSection(c, s, 0, h);
s.drawn = 0;
end;
end;
end);
local tc = tex:getContext("2d");
do
local __t94, __t95 = __it(m.wall), 0;
while __t95 < __t94.length do
local s = __t94[__t95]; __t95 = __t95 + 1;
local st = M.stageOf(s);
if (st ~= s.drawn) then
M.paintSection(tc, s, st, h);
s.drawn = st;
end;
end;
end;
local roofs = h.sprite(("wl-roofs-" .. __str(m.key)), M.WW, M.RH, function(c) 
return M.paintRoofs(c, h, __mfmod((m.key or __NaN), 997));
end);
local off = h.sprite("wl-off", W, M.TH, function() 

end);
local oc = off:getContext("2d");
oc.globalCompositeOperation = "source-over";
oc:clearRect(0, 0, W, M.TH);
local piv = ((W / 2) + __mmax((-38), __mmin(38, __mfloor((((g.boss.x or __NaN) - (V.x or __NaN)) - (W / 2)) + 0.5))));
local C = ((V.x or __NaN) + piv);
local CR = ((V.x or __NaN) + (W / 2));
for sx = 0, __mceil(W) - 1 do
local q = (((sx + 0.5) - (W / 2)) / M.R2);
local th = __masin(q);
local u = __mfmod(__mfloor((CR + (th * M.R))), M.WW);
oc:drawImage(roofs, __mfmod((u + M.WW), M.WW), 0, 1, M.RH, sx, __mfloor(((-M.CURVE2) * (1 - __mcos(th))) + 0.5), 1, M.RH);
end;
for sx = 0, __mceil(W) - 1 do
local q = (((sx + 0.5) - piv) / M.R);
local th = __masin(q);
local u = __mmax(0, __mmin((M.TEXW - 1), (__mfloor((C + (th * M.R))) + M.TEXOFF)));
oc:drawImage(tex, u, 0, 1, M.TH, sx, __mfloor(((-M.CURVE) * (1 - __mcos(th))) + 0.5), 1, M.TH);
end;
local side = h.sprite("wl-towerside", 8, M.TH, function(c) 
for x = 0, 8 - 1 do
for y = 2, 44 - 1 do
local col;
if ((__mfmod((y - 11), 4) == 3) or (y == 10)) then col = M.ST[0]; else col = M.pick(M.ST, (((1.9 - (x * 0.12)) + ((h.hash(x, y) - 0.5) * 0.8)) + ((__mfmod((y - 11), 4) == 0) and 0.4 or 0))); end;
if (y < 8) then
if ((y < 4) and (__mfmod(x, 3) == 1)) then col = nil; elseif ((y == 2) or (y == 4)) then col = M.ST[4]; else col = M.ST[2]; end;
end;
if ((y == 8) or (y == 9)) then
col = ((__mfmod((x + y), 2) ~= 0) and M.INK or M.ST[3]);
end;
if ((y > 37) and (h.hash((x * 3), y) < ((y - 37) * 0.1))) then
col = M.MOSS[0];
end;
if (y == 43) then
col = "#1d2a2e";
end;
if __T(col) then
M.dot(c, x, y, col);
end;
end;
end;
end);
do
local __t101, __t102 = __it(m.wall), 0;
while __t102 < __t101.length do
repeat
local s = __t101[__t102]; __t102 = __t102 + 1;
if ((s.kind ~= "wl_tower") or (M.stageOf(s) >= 4)) then
do break end;
end;
local mid = (((s.x0 or __NaN) + (s.x1 or __NaN)) / 2);
local right = (mid > C);
local ex;
if right then ex = s.x0; else ex = s.x1; end;
local th = ((ex - C) / M.R);
if (__mabs(th) > 1.45) then
do break end;
end;
local n = __mfloor((9 * __mabs(__msin(th))) + 0.5);
local e = (piv + (M.R * __msin(th)));
for i = 0, n - 1 do
repeat
local sx = __mfloor((right and ((e - 1) - i) or (e + i)) + 0.5);
if ((sx < 0) or (sx >= W)) then
do break end;
end;
local q = (((sx + 0.5) - piv) / M.R);
local yo = __mfloor(((-M.CURVE) * (1 - __mcos(__masin(__mmax((-1), __mmin(1, q)))))) + 0.5);
oc:drawImage(side, (right and (7 - __mmin(7, i)) or __mmin(7, i)), 0, 1, M.TH, sx, yo, 1, M.TH);
until true;
end;
local sx = __mfloor((right and ((e - 1) - n) or (e + n)) + 0.5);
if (((n ~= 0) and (sx >= 0)) and (sx < W)) then
local q = (((sx + 0.5) - piv) / M.R);
local yo = __mfloor(((-M.CURVE) * (1 - __mcos(__masin(__mmax((-1), __mmin(1, q)))))) + 0.5);
oc.fillStyle = "rgba(10,8,6,0.55)";
oc:fillRect(sx, (yo + 10), 1, 33);
end;
until true;
end;
end;
oc.globalCompositeOperation = "source-atop";
local grd = oc:createLinearGradient(0, 0, W, 0);
for i = 0, 10 do
local q = (((((i / 10) - 0.5) * 2) * (W / 2)) / M.R);
local th = __masin(q);
local e = ((1 - __mcos(th)) / (1 - __mcos(__masin(((W / 2) / M.R)))));
local a = ((th < 0) and (0.1 + (e * 0.3)) or (0.08 + (e * 0.6)));
grd:addColorStop((i / 10), ("rgba(8,10,14," .. __toFixed(a, 3) .. ")"));
end;
oc.fillStyle = grd;
oc:fillRect(0, 0, W, M.TH);
local hi = oc:createLinearGradient(0, 0, W, 0);
hi:addColorStop(0.05, "rgba(255,236,190,0)");
hi:addColorStop(0.3, "rgba(255,236,190,0.05)");
hi:addColorStop(0.55, "rgba(255,236,190,0)");
oc.fillStyle = hi;
oc:fillRect(0, 0, W, M.TH);
do
local __t106, __t107 = __it(m.wall), 0;
while __t107 < __t106.length do
repeat
local s = __t106[__t107]; __t107 = __t107 + 1;
local p = s.prop;
if (((not __T(p)) or ((p.hitT or __NaN) <= 0)) or (p.state ~= "up")) then
do break end;
end;
local a = M.toScreen(s.x0, C, W, piv);
local b = M.toScreen(s.x1, C, W, piv);
if ((b < 0) or (a > W)) then
do break end;
end;
oc.fillStyle = ("rgba(255,255,255," .. __toFixed((((p.hitT or __NaN) / 0.12) * 0.45), 3) .. ")");
oc:fillRect(__mfloor(a), 0, __mceil((b - a)), M.TH);
until true;
end;
end;
oc.globalCompositeOperation = "source-over";
ctx.fillStyle = "rgba(6,10,14,0.28)";
ctx:fillRect(V.x, (M.MOAT0 + 2), W, 4);
ctx.fillStyle = "rgba(6,10,14,0.14)";
ctx:fillRect(V.x, (M.MOAT0 + 6), W, 3);
if (__mabs((M.OLD_X - C)) < W) then
do
local __t109, __t110 = __it({[0]={[0]=(M.OLD_X - 8), 49, length=2}, {[0]=(M.OLD_X + 7), 50, length=2}, {[0]=(M.OLD_X - 9), 61, length=2}, {[0]=(M.OLD_X + 8), 62, length=2}, {[0]=(M.OLD_X + 2), 56, length=2}, length=5}), 0;
while __t110 < __t109.length do
local __t112 = __t109[__t110]; __t110 = __t110 + 1; local x, y; x = __t112[0]; y = __t112[1];
ctx.fillStyle = M.INK;
ctx:fillRect((x - 1), (y - 3), 4, 5);
ctx.fillStyle = M.WOOD[1];
ctx:fillRect(x, (y - 2), 2, 3);
ctx.fillStyle = M.WOOD[3];
ctx:fillRect(x, (y - 2), 2, 1);
ctx.fillStyle = "rgba(160,200,220,0.35)";
ctx:fillRect((x - 1), (y + 1), 4, 1);
end;
end;
end;
local fr = __mfloor(((g.t or __NaN) * 2));
do
local x = ((V.x or __NaN) - 2);
while (x < (((V.x or __NaN) + W) + 2)) do
repeat
if ((h.hash(x, 41) > 0.16) or (not __T(__I1.isWater(g, x, (M.MOAT1 - 2))))) then
do break end;
end;
local t = h.hash(x, 3);
local sway = ((h.hash(x, fr) < 0.15) and 1 or 0);
if (t < 0.5) then ctx.fillStyle = M.MOSS[1]; else ctx.fillStyle = M.MOSS[2]; end;
ctx:fillRect((x + sway), ((M.MOAT1 - 4) - __mfloor((t * 3))), 1, (4 + __mfloor((t * 3))));
if (t > 0.8) then
ctx.fillStyle = "#5a4428";
ctx:fillRect((x + sway), ((M.MOAT1 - 6) - __mfloor((t * 3))), 1, 2);
end;
until true;
x = x + 1;
end;
end;
for i = 0, 6 - 1 do
repeat
local x = __mfloor(((V.x or __NaN) + (h.hash(i, __mfloor(((V.x or __NaN) / 200))) * W)));
local y = ((M.MOAT0 + 12) + __mfloor((h.hash(i, 9) * 14)));
if (not __T(__I1.isWater(g, x, y))) then
do break end;
end;
ctx.fillStyle = "#2e4a26";
ctx:fillRect(x, y, 3, 2);
ctx.fillStyle = "#4a6a34";
ctx:fillRect(x, y, 2, 1);
until true;
end;
ctx:drawImage(off, V.x, 0);
end;
-- levels/wall:608
M.ground = function(ctx, m, h) 
local hash, vnoise;
local __t115 = h; hash = __t115.hash; vnoise = __t115.vnoise;
for y = 0, __mceil(m.h) - 1 do
for x = 0, __mceil(m.w) - 1 do
local col;
if (y < M.MOAT0) then
col = ((y > 30) and ((hash(x, y) < 0.3) and "#2a2a20" or "#22231a") or "#1a1a16");
elseif (y < (M.MOAT1 + 4)) then
if (y >= M.MOAT1) then col = ((y == M.MOAT1) and "#1e2218" or (function() if (hash(x, y) < 0.5) then return M.DIRT[1]; else return M.DIRT[0]; end; end)()); else col = "#22343c"; end;
else
local n = (((vnoise((x / 30), (y / 30)) * 0.55) + (vnoise(((x / 9) + 40), (y / 9)) * 0.3)) + (hash(x, y) * 0.2));
col = M.GR[__mmax(0, __mmin(3, __mfloor((((n * 3.4) - 0.3) + (__band((x + y), 1) * 0.3)))))];
end;
ctx.fillStyle = col;
ctx:fillRect(x, y, 1, 1);
end;
end;
for x = 0, __mceil(m.w) - 1 do
local g = __mfloor((hash(x, 5) * 3));
do
local y = ((M.MOAT1 + 4) - g);
while (y < (M.MOAT1 + 6)) do
if (hash(x, y) < 0.6) then
ctx.fillStyle = M.GR[2];
ctx:fillRect(x, y, 1, 1);
end;
y = y + 1;
end;
end;
end;
do
local __t120, __t121 = __it({[0]={[0]=160, 146, 90, 22, length=4}, {[0]=520, 150, 70, 20, length=4}, {[0]=1100, 144, 110, 26, length=4}, length=3}), 0;
while __t121 < __t120.length do
local __t123 = __t120[__t121]; __t121 = __t121 + 1; local fx, fy, fw, fh; fx = __t123[0]; fy = __t123[1]; fw = __t123[2]; fh = __t123[3];
do
local y = fy;
while (y < __mmin((m.h or __NaN), (fy + fh))) do
do
local x = fx;
while (x < (fx + fw)) do
repeat
if (hash(x, y) < 0.08) then
do break end;
end;
if (__mfmod((y - fy), 3) == 0) then ctx.fillStyle = M.DIRT[0]; elseif (__mfmod((y - fy), 3) == 1) then ctx.fillStyle = M.DIRT[2]; else ctx.fillStyle = M.DIRT[1]; end;
ctx:fillRect(x, y, 1, 1);
until true;
x = x + 1;
end;
end;
y = y + 1;
end;
end;
end;
end;
local road = function(x, y, w, worn) 
do
local dy = (-w);
while (dy <= w) do
repeat
local e = (__mabs(dy) / w);
if (hash(x, (y + dy)) > (worn - (e * 0.5))) then
do break end;
end;
if ((__mabs(dy) == __mfloor((w * 0.45) + 0.5)) and (hash(x, 7) < 0.8)) then ctx.fillStyle = M.DIRT[0]; else ctx.fillStyle = M.DIRT[(1 + __mfloor((hash((x + dy), y) * 3)))]; end;
ctx:fillRect(x, (y + dy), 1, 1);
until true;
dy = dy + 1;
end;
end;
end;
for x = 0, __mceil(m.w) - 1 do
road(x, __mfloor(m.roadY(x) + 0.5), 5, 1.1);
end;
do
local y = (M.MOAT1 + 2);
while (y < m.roadY(860)) do
local x = __mfloor(M.gateLaneX(y) + 0.5);
for dx = (-5), 5 do
local e = (__mabs(dx) / 5);
if (hash((x + dx), y) < (1.1 - (e * 0.5))) then
ctx.fillStyle = M.DIRT[(1 + __mfloor((hash((x + dx), (y * 3)) * 3)))];
ctx:fillRect((x + dx), y, 1, 1);
end;
end;
y = y + 1;
end;
end;
do
local y = (M.MOAT1 + 2);
while (y < m.roadY(M.OLD_X)) do
local x = __mfloor((M.OLD_X + (__msin((y / 11)) * 4)) + 0.5);
for dx = (-4), 4 do
if (hash((x + dx), y) < (0.45 - (__mabs(dx) * 0.06))) then
ctx.fillStyle = M.DIRT[(1 + __mfloor((hash(x, (y + dx)) * 2)))];
ctx:fillRect((x + dx), y, 1, 1);
end;
end;
y = y + 1;
end;
end;
local gx = ((M.GATE_X0 + M.GATE_X1) / 2);
do
local y = (M.MOAT1 - 1);
while (y < (M.MOAT1 + 12)) do
do
local x = (gx - 15);
while (x <= (gx + 15)) do
local j = ((__mfmod((x + __mfmod(__mfloor((y / 2)), 2)), 3) == 0) or (__mfmod(y, 2) == 0));
ctx.fillStyle = (j and "#3f403a" or ({[0]="#6b6c63", "#5f6058", "#7a7a70", length=3})[__mfloor((hash(x, y) * 3))]);
ctx:fillRect(x, y, 1, 1);
x = x + 1;
end;
end;
y = y + 1;
end;
end;
do
local __t134, __t135 = __it({[0]=(gx - 14), (gx + 13), length=2}), 0;
while __t135 < __t134.length do
local px = __t134[__t135]; __t135 = __t135 + 1;
ctx.fillStyle = M.INK;
ctx:fillRect((px - 1), (M.MOAT1 - 1), 4, 7);
ctx.fillStyle = "#55564f";
ctx:fillRect(px, M.MOAT1, 2, 5);
ctx.fillStyle = "#8f8f84";
ctx:fillRect(px, M.MOAT1, 2, 1);
end;
end;
for i = 0, __mceil(((m.w or __NaN) * 2)) - 1 do
local x = __mfloor((hash(i, 7) * (m.w or __NaN)));
local y = ((M.MOAT1 + 6) + __mfloor((hash(i, 13) * (((m.h or __NaN) - M.MOAT1) - 6))));
local t = hash(i, 3);
ctx.fillStyle = ((t < 0.1) and "#8f8f84" or ((t < 0.16) and "#c8b85a" or ((t < 0.2) and "#b07aa0" or ((t < 0.6) and "#4a6a2e" or "#22301a"))));
ctx:fillRect(x, y, 1, 1);
end;
end;
-- levels/wall:665
M.paintHouse = function(c, kind, W, D, v, h) 
local wallH = ((kind == "wl_barn") and 7 or 6);
local pal = ((kind == "wl_cottage") and M.THATCH or ((kind == "wl_house") and M.SLATE or M.SHINGLE));
local ox = 1;
local oy = 1;
local mid = ((oy + __mfloor((D / 2))) - 1);
c.fillStyle = "rgba(6,8,6,0.4)";
c:fillRect((ox + 2), ((oy + wallH) + 2), W, D);
c:fillRect((ox + W), (oy + 3), 2, ((D + wallH) - 1));
for x = ox, __mceil((ox + W)) - 1 do
do
local y = (oy + D);
while (y < ((oy + D) + wallH)) do
local lx = (x - ox);
local ly = ((y - oy) - D);
local col;
if (kind == "wl_cottage") then
local post = (((((lx == 1) or (lx == (W - 2))) or (lx == (__mfloor((W / 2)) + 2))) or (ly == 0)) or (ly == (wallH - 1)));
col = (post and "#4a3020" or ((ly == 1) and "#a8946c" or ((h.hash((lx + (v * 7)), ly) < 0.15) and "#b49e74" or "#c8b48a")));
elseif (kind == "wl_house") then
col = (((__mfmod(ly, 3) == 2) or (__mfmod((lx + (__mfmod(__mfloor((ly / 3)), 2) * 3)), 6) == 0)) and "#4a463d" or ({[0]="#7a7464", "#8a8370", "#6c6758", length=3})[__mfloor((h.hash((lx + (v * 9)), ly) * 3))]);
else
if (__mfmod(lx, 3) == 0) then col = M.WOOD[0]; else col = M.WOOD[(1 + __mfloor((h.hash(lx, v) * 2)))]; end;
end;
if (lx == 0) then
col = M.INK;
elseif (lx == (W - 1)) then
col = M.INK;
end;
if ((ly == (wallH - 1)) and ((lx == 0) or (lx == (W - 1)))) then
col = M.INK;
end;
M.dot(c, x, y, col);
y = y + 1;
end;
end;
end;
local dx = (ox + __mfloor((W * (0.3 + (__mfmod(v, 3) * 0.15)))));
local by = (((oy + D) + wallH) - 1);
if (kind == "wl_barn") then
local bw = 8;
local bx = (ox + __mfloor(((W - bw) / 2)));
for x = bx, (bx + bw) - 1 do
do
local y = (by - 5);
while (y <= by) do
local lx = (x - bx);
local ly = (by - y);
M.dot(c, x, y, ((((x == bx) or (x == ((bx + bw) - 1))) or (y == (by - 5))) and M.INK or (function() if ((__mabs((lx - (ly * 1.4))) < 1) or (__mabs((((bw - 1) - lx) - (ly * 1.4))) < 1)) then return M.WOOD[3]; else return M.WOOD[1]; end; end)()));
y = y + 1;
end;
end;
end;
else
do
local y = (by - 3);
while (y <= by) do
M.dot(c, dx, y, "#24160c");
M.dot(c, (dx + 1), y, "#2e1c10");
M.dot(c, (dx + 2), y, ((y == (by - 3)) and M.INK or "#2e1c10"));
y = y + 1;
end;
end;
M.dot(c, dx, (by - 4), M.INK);
M.dot(c, (dx + 1), (by - 4), M.INK);
do
local __t143, __t144 = __it({[0]=((ox + 2) + __mfmod(v, 2)), ((ox + W) - 5), length=2}), 0;
while __t144 < __t143.length do
local wx = __t143[__t144]; __t144 = __t144 + 1;
if (__mabs((wx - dx)) > 3) then
c.fillStyle = M.INK;
c:fillRect((wx - 1), (by - 4), 4, 3);
c.fillStyle = ((h.hash(wx, v) < 0.7) and "#f0c050" or "#3a3428");
c:fillRect(wx, (by - 3), 2, 1);
if (h.hash(wx, v) < 0.7) then
M.dot(c, wx, (by - 3), "#ffe890");
end;
end;
end;
end;
end;
for x = (ox - 1), (ox + W) do
for y = oy, __mceil(((oy + D) + 1)) - 1 do
local lx = (x - ox);
local l = ((y < mid) and (3 - ((mid - y) * 0.15)) or ((y == mid) and 4 or (2.2 - (((y - mid) / (D - mid)) * 1.2))));
if (kind == "wl_cottage") then
l = (l + (((h.hash(((x * 2) + v), __mfloor((y / 2))) - 0.5) * 1.1) + ((__mfmod((x + v), 3) == 0) and (-0.4) or 0)));
elseif (kind == "wl_house") then
l = (l + ((((__mfmod(y, 2) == 0) and (-0.5) or 0) + ((__mfmod((x + ((__mfmod(y, 4) < 2) and 0 or 2)), 4) == 0) and (-0.5) or 0)) + ((h.hash(x, y) - 0.5) * 0.4)));
else
l = (l + (((__mfmod((x + __mfloor((y / 2))), 3) == 0) and (-0.5) or 0) + ((h.hash(x, (y + v)) - 0.5) * 0.5)));
end;
if (lx == (-1)) then
l = (l + 0.6);
elseif (lx == W) then
l = (l - 0.8);
end;
local col = M.pick(pal, l);
if ((((y == oy) or (y == (oy + D))) or ((lx == (-1)) and (y > (mid + 1)))) or (lx == W)) then
col = M.INK;
end;
M.dot(c, x, y, col);
end;
end;
if (kind == "wl_house") then
local cx = ((ox + W) - 6);
for y = (oy - 1), (oy + 4) - 1 do
M.dot(c, cx, y, M.INK);
M.dot(c, (cx + 1), y, "#8a8370");
M.dot(c, (cx + 2), y, "#5a564a");
M.dot(c, (cx + 3), y, M.INK);
end;
M.dot(c, (cx + 1), (oy - 1), "#2a2622");
M.dot(c, (cx + 2), (oy - 1), "#2a2622");
end;
if (kind == "wl_barn") then
local vx = ((ox + __mfloor((W / 2))) - 1);
for x = vx, (vx + 3) - 1 do
M.dot(c, x, (mid - 1), M.INK);
M.dot(c, x, mid, "#2a1a10");
end;
end;
end;
-- levels/wall:728
M.paintWatch = function(c, v, h) 
local cx = 9;
local roofB = 11;
local bodyB = 25;
local pal = ((__mfmod(v, 2) ~= 0) and M.SLATE or M.SHINGLE);
c.fillStyle = "rgba(6,8,6,0.4)";
c:fillRect((cx - 3), (bodyB - 1), 13, 3);
for x = (cx - 6), (cx + 6) do
local nx = ((x - cx) / 6.5);
local a = __masin(__mmax((-1), __mmin(1, nx)));
local lit = ((3.2 - (nx * 1.7)) - (nx * nx));
for y = (roofB - 1), bodyB do
local course = __mfloor(((y - roofB) / 3));
local row = __mfmod((__mfmod((y - roofB), 3) + 3), 3);
local sid = __mfloor(((a * 2.6) + (course * 0.5)));
local sidL = __mfloor(((__masin(__mmax((-1), __mmin(1, (nx - 0.15)))) * 2.6) + (course * 0.5)));
local col;
if ((row == 2) or (sid ~= sidL)) then col = M.pick(M.ST, (lit - 1.5)); else col = M.pick(M.ST, ((lit + ((row == 0) and 0.5 or 0)) + ((h.hash((sid + v), course) - 0.5) * 0.8))); end;
if ((__mabs((x - cx)) == 6) or (y == bodyB)) then
col = M.INK;
end;
M.dot(c, x, y, col);
end;
end;
for y = (bodyB - 5), bodyB - 1 do
for x = (cx - 1), (cx + 1) do
M.dot(c, x, y, (function() if ((y == (bodyB - 5)) and (x ~= cx)) then return M.pick(M.ST, 3); elseif (x == (cx + 1)) then return "#2a1a10"; else return "#3a2416"; end; end)());
end;
end;
M.dot(c, cx, (bodyB - 6), M.INK);
M.dot(c, (cx - 2), (roofB + 4), M.INK);
M.dot(c, (cx - 2), (roofB + 5), M.INK);
M.dot(c, (cx - 1), (roofB + 4), "#e8b04a");
for y = 1, roofB do
local hw = __mfloor((1 + (((y - 1) / (roofB - 1)) * 7.5)) + 0.5);
for dx = (-hw), hw do
local k = (dx / hw);
local l = (((2.8 - (k * 1.6)) - ((y > (roofB - 2)) and 0.4 or 0)) + ((h.hash((dx + (v * 5)), y) - 0.5) * 0.5));
if (__mfloor((k * 4) + 0.5) ~= __mfloor((((dx - 1) / hw) * 4) + 0.5)) then
l = (l - 0.7);
end;
M.dot(c, (cx + dx), y, (((__mabs(dx) == hw) or (y == roofB)) and M.INK or M.pick(pal, l)));
end;
end;
M.dot(c, cx, 0, "#e8c050");
M.dot(c, cx, 1, M.IRON[2]);
end;
-- levels/wall:758
M.drawBuilding = function(ctx, p, g, h) 
local d = M.kinds[p.kind];
local v = __mfmod((p.seed or __NaN), 4);
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
if (p.state == "down") then
do return M.drawRuin(ctx, p, g, h) end;
end;
local spr;
local sx;
local sy;
if (p.kind == "wl_watch") then
spr = h.sprite(("wl-watch" .. __str(v)), 19, 28, function(c) 
return M.paintWatch(c, v, h);
end);
sx = (x - 9);
sy = ((y + 4) - 25);
else
local wallH = ((p.kind == "wl_barn") and 7 or 6);
spr = h.sprite(("wl-" .. __str(p.kind) .. __str(v)), ((d.w or __NaN) + 4), (((d.h or __NaN) + wallH) + 4), function(c) 
return M.paintHouse(c, p.kind, d.w, d.h, v, h);
end);
sx = ((x - ((d.w or __NaN) / 2)) - 1);
sy = ((((y + ((d.h or __NaN) / 2)) - (d.h or __NaN)) - wallH) - 1);
end;
sx = __mfloor(sx + 0.5);
sy = __mfloor(sy + 0.5);
ctx:drawImage(spr, sx, sy);
local k = (1 - ((p.hp or __NaN) / (p.maxhp or __NaN)));
if (k > 0.3) then
ctx.fillStyle = M.INK;
local n = __mfloor((k * 8));
for i = 0, n - 1 do
local cx = ((sx + 3) + __mfloor((h.hash(p.seed, i) * ((spr.width or __NaN) - 7))));
local cy = ((sy + 3) + __mfloor((h.hash(i, p.seed) * ((spr.height or __NaN) - 6))));
for j = 0, 4 - 1 do
ctx:fillRect(cx, cy, 1, 1);
cy = cy + 1;
cx = (cx + (__mfloor((h.hash(cx, cy) * 3)) - 1));
end;
end;
end;
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, (((p.burnT or __NaN) / (d.burnTime or __NaN)) * 0.9));
ctx:drawImage(h.tinted(spr, "#1a120c"), sx, sy);
ctx.globalAlpha = 1;
end;
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.6;
ctx:drawImage(h.tinted(spr, "#ffffff"), sx, sy);
ctx.globalAlpha = 1;
end;
end;
-- levels/wall:787
M.drawRuin = function(ctx, p, g, h) 
local d = M.kinds[p.kind];
local v = __mfmod((p.seed or __NaN), 3);
local W = (__T(d.w) and d.w or 9);
local D = (__T(d.h) and d.h or 6);
local spr = h.sprite(("wl-ruin-" .. __str(p.kind) .. __str(v)), (W + 4), (D + 4), function(c) 
for y = 1, __mceil((D + 3)) - 1 do
for x = 1, __mceil((W + 3)) - 1 do
repeat
local t = h.hash(((x * 3) + v), y);
if (t < 0.25) then
do break end;
end;
c.fillStyle = ((t > 0.9) and "#5a5248" or ((t > 0.6) and "#1c1814" or (function() if (t > 0.45) then return M.THATCH[0]; else return "#2a241e"; end; end)()));
c:fillRect(x, y, 1, 1);
until true;
end;
end;
for i = 0, (3 + __shr(W, 3)) - 1 do
local a = (h.hash(i, v) * math.pi);
local L = (4 + __mfloor((h.hash(v, i) * (W / 2))));
local x0 = (2 + (h.hash(i, 9) * (W - 2)));
local y0 = (2 + (h.hash(9, i) * (D - 1)));
for j = 0, L - 1 do
repeat
local x = __mfloor((x0 + (__mcos(a) * j)) + 0.5);
local y = __mfloor((y0 + ((__msin(a) * j) * 0.6)) + 0.5);
if ((((x < 0) or (y < 0)) or (x > (W + 3))) or (y > (D + 3))) then
do break end;
end;
c.fillStyle = M.INK;
c:fillRect(x, (y + 1), 1, 1);
if (__mfmod(j, 3) ~= 0) then c.fillStyle = M.WOOD[1]; else c.fillStyle = M.WOOD[0]; end;
c:fillRect(x, y, 1, 1);
until true;
end;
end;
if (p.kind == "wl_stall") then
c.fillStyle = "#a8362a";
c:fillRect(3, 2, 3, 1);
c.fillStyle = "#d8c39a";
c:fillRect(6, 3, 2, 1);
end;
end);
local sx = __mfloor((((p.x or __NaN) - (W / 2)) - 2) + 0.5);
local sy = __mfloor((((p.y or __NaN) - (D / 2)) - 2) + 0.5);
ctx:drawImage(spr, sx, sy);
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.8, (((p.burnT or __NaN) / (d.burnTime or __NaN)) * 0.9));
ctx:drawImage(h.tinted(spr, "#120c08"), sx, sy);
ctx.globalAlpha = 1;
end;
end;
-- levels/wall:807
M.drawCart = function(ctx, p, g, h) 
if (p.state == "down") then
do return M.drawRuin(ctx, p, g, h) end;
end;
local v = __mfmod((p.seed or __NaN), 2);
local spr = h.sprite(("wl-cart" .. __str(v)), 12, 10, function(c) 
c.fillStyle = "rgba(6,8,6,0.4)";
c:fillRect(3, 7, 9, 2);
c.fillStyle = M.INK;
c:fillRect(1, 1, 9, 7);
for x = 2, 9 - 1 do
for y = 2, 7 - 1 do
if (v ~= 0) then c.fillStyle = (function() if (h.hash(x, y) < 0.5) then return M.THATCH[3]; else return M.THATCH[2]; end; end)(); elseif (y < 4) then c.fillStyle = "#7a7464"; else c.fillStyle = "#5a564a"; end;
c:fillRect(x, y, 1, 1);
end;
end;
if (not (v ~= 0)) then
c.fillStyle = "#8f8873";
c:fillRect(3, 2, 2, 1);
c:fillRect(6, 3, 2, 1);
end;
c.fillStyle = M.WOOD[2];
c:fillRect(1, 6, 9, 1);
do
local __t164, __t165 = __it({[0]=1, 7, length=2}), 0;
while __t165 < __t164.length do
local wx = __t164[__t165]; __t165 = __t165 + 1;
c.fillStyle = M.INK;
c:fillRect(wx, 6, 3, 3);
c.fillStyle = M.WOOD[1];
c:fillRect((wx + 1), 7, 1, 1);
end;
end;
c.fillStyle = M.WOOD[3];
c:fillRect(10, 4, 2, 1);
c.fillStyle = M.INK;
c:fillRect(10, 5, 2, 1);
end);
local sx = (__mfloor((p.x or __NaN) + 0.5) - 6);
local sy = (__mfloor((p.y or __NaN) + 0.5) - 7);
ctx:drawImage(spr, sx, sy);
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.6;
ctx:drawImage(h.tinted(spr, "#ffffff"), sx, sy);
ctx.globalAlpha = 1;
end;
end;
-- levels/wall:824
M.drawStall = function(ctx, p, g, h) 
if (p.state == "down") then
do return M.drawRuin(ctx, p, g, h) end;
end;
local v = __mfmod((p.seed or __NaN), 3);
local col = ({[0]="#a8362a", "#3a6a9a", "#5a8a3a", length=3})[v];
local spr = h.sprite(("wl-stall" .. __str(v)), 15, 13, function(c) 
c.fillStyle = "rgba(6,8,6,0.4)";
c:fillRect(3, 9, 12, 3);
c.fillStyle = M.INK;
c:fillRect(1, 7, 13, 4);
c.fillStyle = M.WOOD[2];
c:fillRect(2, 8, 11, 2);
for x = 3, 12 - 1, 2 do
c.fillStyle = ({[0]="#d8a040", "#a8c050", "#c05a3a", length=3})[__mfmod((x + v), 3)];
c:fillRect(x, 7, 1, 1);
end;
c.fillStyle = M.INK;
c:fillRect(0, 1, 15, 7);
for x = 1, 14 - 1 do
for y = 2, 7 - 1 do
c.fillStyle = ((__mfmod(__mfloor((x / 2)), 2) ~= 0) and ((y < 4) and "#f4ecd2" or "#d8cfb4") or (function() if (y < 4) then return col; else return M.shadeHex(col); end; end)());
c:fillRect(x, y, 1, 1);
end;
end;
for x = 1, 14 - 1, 2 do
c.fillStyle = M.INK;
c:fillRect(x, 7, 1, 1);
end;
end);
local sx = (__mfloor((p.x or __NaN) + 0.5) - 7);
local sy = (__mfloor((p.y or __NaN) + 0.5) - 9);
ctx:drawImage(spr, sx, sy);
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, (((p.burnT or __NaN) / 4) * 0.9));
ctx:drawImage(h.tinted(spr, "#1a120c"), sx, sy);
ctx.globalAlpha = 1;
end;
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.6;
ctx:drawImage(h.tinted(spr, "#ffffff"), sx, sy);
ctx.globalAlpha = 1;
end;
end;
-- levels/wall:845
M.drawRubble = function(ctx, p, g, h) 
local v = __mfmod((p.seed or __NaN), 3);
local k = p.kind;
local spr = h.sprite(("wl-" .. __str(k) .. __str(v)), 11, 10, function(c) 
c.fillStyle = "rgba(6,8,6,0.4)";
c:fillRect(3, 7, 7, 2);
if (k == "wl_timber") then
local beam = function(x0, y0, dx, dy, n) 
for i = 0, __mceil(n) - 1 do
local x = (x0 + __mfloor((dx * i) + 0.5));
local y = (y0 + __mfloor((dy * i) + 0.5));
c.fillStyle = M.INK;
c:fillRect((x - 1), (y - 1), 3, 3);
end;
for i = 0, __mceil(n) - 1 do
local x = (x0 + __mfloor((dx * i) + 0.5));
local y = (y0 + __mfloor((dy * i) + 0.5));
c.fillStyle = M.WOOD[2];
c:fillRect(x, y, 1, 1);
if (__mfmod(i, 3) ~= 0) then c.fillStyle = M.WOOD[3]; else c.fillStyle = M.WOOD[2]; end;
c:fillRect(x, (y - 0), 1, 1);
c.fillStyle = M.WOOD[1];
c:fillRect(x, (y + 1), 1, 0);
end;
end;
beam(2, (3 + v), 1, 0.35, 7);
beam((3 + v), 7, 0.8, (-0.6), 6);
c.fillStyle = "#d8c39a";
c:fillRect(8, (3 + v), 1, 1);
elseif (k == "wl_block") then
c.fillStyle = M.INK;
c:fillRect(1, 1, 9, 8);
c.fillStyle = M.ST[6];
c:fillRect(2, 2, 6, 2);
c.fillStyle = M.ST[4];
c:fillRect(2, 4, 6, 4);
c.fillStyle = M.ST[2];
c:fillRect(8, 2, 1, 6);
c.fillStyle = M.ST[3];
c:fillRect((3 + v), 5, 1, 1);
c:fillRect(5, 6, 2, 1);
c.fillStyle = M.ST[5];
c:fillRect(2, 4, 1, 3);
else
do
local __t173, __t174 = __it(__map({[0]={[0]=1, 4, 3, length=3}, {[0]=4, 2, 3, length=3}, {[0]=6, 5, 3, length=3}, {[0]=3, 6, 2, length=3}, length=4}, function(__t177) local x, y, s; x = __t177[0]; y = __t177[1]; s = __t177[2];
return {[0]=(x + ((v == 1) and 1 or 0)), y, s, length=3};
end)), 0;
while __t174 < __t173.length do
local __t176 = __t173[__t174]; __t174 = __t174 + 1; local x, y, s; x = __t176[0]; y = __t176[1]; s = __t176[2];
c.fillStyle = M.INK;
c:fillRect((x - 1), (y - 1), (s + 2), (s + 1));
end;
end;
do
local __t178, __t179 = __it(__map({[0]={[0]=1, 4, 3, length=3}, {[0]=4, 2, 3, length=3}, {[0]=6, 5, 3, length=3}, {[0]=3, 6, 2, length=3}, length=4}, function(__t182) local x, y, s; x = __t182[0]; y = __t182[1]; s = __t182[2];
return {[0]=(x + ((v == 1) and 1 or 0)), y, s, length=3};
end)), 0;
while __t179 < __t178.length do
local __t181 = __t178[__t179]; __t179 = __t179 + 1; local x, y, s; x = __t181[0]; y = __t181[1]; s = __t181[2];
c.fillStyle = M.ST[3];
c:fillRect(x, y, s, (s - 1));
c.fillStyle = M.ST[5];
c:fillRect(x, ((y - 1) + 1), (s - 1), 1);
c.fillStyle = M.ST[2];
c:fillRect(((x + s) - 1), y, 1, (s - 1));
end;
end;
if (v == 2) then
c.fillStyle = M.WOOD[2];
c:fillRect(2, 7, 4, 1);
end;
end;
end);
ctx:drawImage(spr, (__mfloor((p.x or __NaN) + 0.5) - 5), (__mfloor((p.y or __NaN) + 0.5) - 5));
end;

-- levels/wall:15
M.roadY = function(x) 
return ((132 + (__msin((x / 110)) * 9)) + (__msin((x / 37)) * 3));
end;
-- levels/wall:16
M.TAU = (math.pi * 2);
-- levels/wall:17
M.WW = 1280;
M.WH = 180;
-- levels/wall:18
M.MOAT0 = 42;
M.MOAT1 = 72;
-- levels/wall:19
M.WALL_B = 42;
-- levels/wall:20
M.BASH = 45;
-- levels/wall:21
M.HITS = {wl_curtain=20, wl_tower=24, wl_gate=18};
-- levels/wall:22
M.LABEL = {wl_curtain="WALL", wl_tower="TOWER", wl_gate="GATE"};
-- levels/wall:23
M.GATE_X0 = 848;
M.GATE_X1 = 874;
-- levels/wall:24
M.OLD_X = 300;
-- levels/wall:27
M.R = 200;
M.CURVE = 26;
M.R2 = 168;
M.CURVE2 = 12;
-- levels/wall:28
M.TEXOFF = 40;
M.TEXW = (M.WW + (M.TEXOFF * 2));
M.TH = 48;
M.RH = 24;
-- levels/wall:32
M.WALLK = {solid=true, breaks=true, value={pts=0, venge=0, chaos=0}};
-- levels/wall:33
M.kinds = {wl_curtain=__assign({}, M.WALLK, {w=40, h=M.WALL_B, hp=((M.HITS.wl_curtain or __NaN) * M.BASH)}), wl_tower=__assign({}, M.WALLK, {w=24, h=M.WALL_B, hp=((M.HITS.wl_tower or __NaN) * M.BASH)}), wl_gate=__assign({}, M.WALLK, {w=26, h=M.WALL_B, hp=((M.HITS.wl_gate or __NaN) * M.BASH)}), wl_cottage={w=18, h=12, hp=135, solid=true, flammable=true, burnTime=8, spread=0.25, crushShare=0.5, rubble="wl_timber", rubbleN=2, value={pts=320, venge=0.3}}, wl_house={w=20, h=14, hp=270, solid=true, rubble="wl_stones", rubbleN=3, value={pts=480, venge=0.42}}, wl_barn={w=28, h=16, hp=225, solid=true, flammable=true, burnTime=10, spread=0.3, crushShare=0.5, rubble="wl_timber", rubbleN=3, value={pts=520, venge=0.45}}, wl_watch={r=7, hp=360, solid=true, rubble="wl_block", rubbleN=3, value={pts=650, venge=0.55}}, wl_cart={r=4, hp=1, flammable=true, burnTime=4, rubble="wl_timber", rubbleN=1, value={pts=60, venge=0.06}}, wl_stall={w=12, h=8, hp=1, flammable=true, burnTime=4, rubble="wl_timber", rubbleN=1, value={pts=90, venge=0.08}}, wl_stones={r=3, push=true, fill=1}, wl_timber={r=3, push=true, fill=1}, wl_block={r=3.5, push=true, fill=2}};
-- levels/wall:129
M.gateLaneX = function(y) 
return (((M.GATE_X0 + M.GATE_X1) / 2) + (__msin((y / 15)) * 3));
end;
-- levels/wall:192
M.TUMBLE = {[0]={[0]=0, (-1), length=2}, {[0]=(-1), 0, length=2}, {[0]=1, 0, length=2}, {[0]=(-1), (-1), length=2}, {[0]=1, (-1), length=2}, {[0]=0, 1, length=2}, {[0]=(-1), 1, length=2}, {[0]=1, 1, length=2}, {[0]=0, (-2), length=2}, {[0]=(-2), 0, length=2}, {[0]=2, 0, length=2}, {[0]=(-2), (-1), length=2}, {[0]=2, (-1), length=2}, {[0]=(-1), (-2), length=2}, {[0]=1, (-2), length=2}, length=15};
-- levels/wall:194
M.FLAVOUR = {[0]="THE GATES ARE SHUT", "THE CITY HOLDS ITS BREATH", "THEY ARE WATCHING FROM THE WALL", "THE MOAT IS DEEP AND COLD", length=4};
-- levels/wall:211
M.INK = "#14100c";
-- levels/wall:212
M.ST = {[0]="#2b2924", "#423e35", "#555046", "#6a6455", "#827b67", "#9a927b", "#b3aa90", length=7};
-- levels/wall:213
M.MOSS = {[0]="#2f3c20", "#3e4e28", "#4f6230", length=3};
-- levels/wall:214
M.WOOD = {[0]="#3a2416", "#553620", "#6e4a2a", "#866034", length=4};
-- levels/wall:215
M.IRON = {[0]="#1e1e22", "#3a3a40", "#62626a", length=3};
-- levels/wall:216
M.pick = function(arr, l) 
return arr[__mmax(0, __mmin(((arr.length or #arr) - 1), __mfloor(l + 0.5)))];
end;
-- levels/wall:453
M.stageOf = function(s) 
local p = s.prop;
if (not __T(p)) then
do return 0 end;
end;
if (p.state ~= "up") then
do return 4 end;
end;
local f = ((p.hp or __NaN) / (p.maxhp or __NaN));
do return ((f > 0.8) and 0 or ((f > 0.55) and 1 or ((f > 0.3) and 2 or 3))) end;
end;
-- levels/wall:602
M.toScreen = function(x, C, W, piv) 
local th = ((x - C) / M.R);
do return ((__mabs(th) >= (math.pi / 2)) and ((th < 0) and (-1) or (W + 1)) or (piv + (M.R * __msin(th)))) end;
end;
-- levels/wall:606
M.GR = {[0]="#28381e", "#2f4224", "#374c2a", "#415833", length=4};
-- levels/wall:607
M.DIRT = {[0]="#3f3222", "#4e3f2a", "#5e4c32", "#6e5a3a", length=4};
-- levels/wall:660
M.THATCH = {[0]="#4a3a1e", "#64502a", "#7e6834", "#9a8244", "#b49a56", length=5};
-- levels/wall:661
M.SLATE = {[0]="#262b34", "#343b48", "#454e5e", "#5a6476", "#727c90", length=5};
-- levels/wall:662
M.SHINGLE = {[0]="#3a2016", "#55301e", "#6e4028", "#875234", "#9e6440", length=5};
-- levels/wall:842
M.shadeHex = function(c) 
return ("#" .. __join(__map({[0]=1, 3, 5, length=3}, function(i) 
return __padStart(__toString(__mfloor((__parseInt(__slice(c, i, (i + 2)), 16) * 0.72)), 16), 2, "0");
end), ""));
end;
M.default = {roadY=M.roadY, n=5, id="wall", name="THE CITY WALL", sub="THEY PULLED UP THE BRIDGE.", mode="timed", kinds=M.kinds, build=function(g, rng, P) 
do return M.build(g, rng, P) end;
end, update=M.update, hud=M.hud, art={ground=M.ground, under=M.under, props={wl_cottage=M.drawBuilding, wl_house=M.drawBuilding, wl_barn=M.drawBuilding, wl_watch=M.drawBuilding, wl_cart=M.drawCart, wl_stall=M.drawStall, wl_stones=M.drawRubble, wl_timber=M.drawRubble, wl_block=M.drawRubble}, canopy=false, theme={leash=false}}};
