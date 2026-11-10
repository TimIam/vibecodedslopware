-- Generated from the-endgame-is-me/js/levels/village.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("levels/village");
local __I0 = RT.module("levels/forest");
local __I1 = RT.module("levels/farms");
local __Map, __T, __assign, __assignKV, __band, __delete, __filter, __forEach, __hypot, __i32, __it, __map, __orv, __padEnd, __push, __set, __shr, __some, __str = RT["Map"], RT["T"], RT["assign"], RT["assignKV"], RT["band"], RT["delete"], RT["filter"], RT["forEach"], RT["hypot"], RT["i32"], RT["it"], RT["map"], RT.orv, RT["padEnd"], RT["push"], RT["set"], RT["shr"], RT["some"], RT["str"];
local __NaN = 0 / 0;
local __mabs, __mceil, __mcos, __mfloor, __mfmod, __mmax, __mmin, __msin = math.abs, math.ceil, math.cos, math.floor, math.fmod, math.max, math.min, math.sin;

-- levels/village:37
M.build = function(g, rng, P) 
local w = 1200;
local h = 180;
local start = {x=36, y=__mfloor(M.roadY(36) + 0.5), face=0};
local occ = __I1.Occupancy();
local gardens = {length=0};
local squares = {length=0};
local greens = {length=0};
g.lvlCarts = __Map();
occ.take(((start.x or __NaN) - 26), ((start.y or __NaN) - 20), ((start.x or __NaN) + 30), ((start.y or __NaN) + 20), "start");
for x = 0, w - 1, 8 do
occ.take(x, (M.roadY((x + 4)) - 8), (x + 8), (M.roadY((x + 4)) + 8), "road");
end;
do
local __t2, __t3 = __it(M.VILLAGES), 0;
while __t3 < __t2.length do
local cx = __t2[__t3]; __t3 = __t3 + 1;
for y = 0, h - 1, 8 do
occ.take((M.lane(cx, (y + 4)) - 8), y, (M.lane(cx, (y + 4)) + 8), (y + 8), "road");
end;
end;
end;
local tryPlace = function(kind, x0, y0, x1, y1, pad, n) if n == nil then n = 40 end;
local d = P.KINDS[kind];
local hw = ((__T(d.w) and d.w or ((d.r or __NaN) * 2)) / 2);
local hh = ((__T(d.h) and d.h or ((d.r or __NaN) * 2)) / 2);
for i = 0, __mceil(n) - 1 do
repeat
local x = (x0 + (rng() * (x1 - x0)));
local y = (y0 + (rng() * (y1 - y0)));
if (((((x - hw) < 6) or ((x + hw) > (w - 6))) or ((y - hh) < 22)) or ((y + hh) > 158)) then
do break end;
end;
local up = ((kind == "inn") and 12 or ((kind == "cottage") and 8 or 2));
if (not __T(occ.free((x - hw), ((y - hh) - up), (x + hw), (y + hh), pad))) then
do break end;
end;
occ.take((x - hw), ((y - hh) - up), (x + hw), (y + hh), kind);
do return P.addProp(g, kind, x, y) end;
until true;
end;
do return nil end;
end;
__forEach(M.VILLAGES, function(cx, vi) 
local cy = M.roadY(cx);
__push(squares, {x=cx, y=cy, rx=26, ry=16});
__push(greens, {x=cx, y=cy, rx=105, ry=62});
P.addProp(g, "well", (cx + 12), (cy - 9));
occ.take((cx + 6), (cy - 16), (cx + 18), (cy - 4), "well");
local quads = {[0]={[0]=(-1), (-1), length=2}, {[0]=1, (-1), length=2}, {[0]=(-1), 1, length=2}, {[0]=1, 1, length=2}, length=4};
local innQ = __mfloor((rng() * 4));
__forEach(quads, function(__t7, qi) local sx, sy; sx = __t7[0]; sy = __t7[1];
local near = ((sx < 0) and {[0]=(cx - 46), (cx - 22), length=2} or {[0]=(cx + 22), (cx + 46), length=2});
local ny = ((sy < 0) and {[0]=(cy - 34), (cy - 22), length=2} or {[0]=(cy + 22), (cy + 34), length=2});
if (qi == innQ) then
local inn = tryPlace("inn", near[0], ny[0], near[1], ny[1], 3, 80);
if __T(inn) then
for k = 0, 4 - 1 do
tryPlace(((rng() < 0.6) and "barrel" or "crate"), (((inn.x or __NaN) + (sx * 20)) - 5), ((inn.y or __NaN) - 6), (((inn.x or __NaN) + (sx * 20)) + 5), ((inn.y or __NaN) + 12), 1);
end;
P.addCritter(g, "horse", ((inn.x or __NaN) - (sx * 4)), ((inn.y or __NaN) + (sy * 16)));
end;
end;
for k = 0, 2 - 1 do
local fx = ((sx < 0) and {[0]=(cx - 100), (cx - 22), length=2} or {[0]=(cx + 22), (cx + 100), length=2});
local fy = ((sy < 0) and {[0]=(cy - 70), (cy - 20), length=2} or {[0]=(cy + 20), (cy + 60), length=2});
local c = tryPlace("cottage", fx[0], fy[0], fx[1], fy[1], 4);
if (__T(c) and (rng() < 0.55)) then
local gx0 = (((c.x or __NaN) - 12) + ((rng() - 0.5) * 8));
local gy0 = ((sy < 0) and ((c.y or __NaN) - 36) or ((c.y or __NaN) + 15));
local gd = {x0=gx0, y0=gy0, x1=(gx0 + 24), y1=(gy0 + 16)};
if ((((gd.y0 or __NaN) > 20) and ((gd.y1 or __NaN) < 158)) and __T(occ.free(gd.x0, gd.y0, gd.x1, gd.y1, 2))) then
occ.take(((gd.x0 or __NaN) - 1), ((gd.y0 or __NaN) - 1), ((gd.x1 or __NaN) + 1), ((gd.y1 or __NaN) + 1), "garden");
__push(gardens, gd);
do
local yy = ((gd.y0 or __NaN) + 4);
while (yy <= ((gd.y1 or __NaN) - 3)) do
do
local xx = ((gd.x0 or __NaN) + 4);
while (xx <= ((gd.x1 or __NaN) - 3)) do
P.addProp(g, "cabbage", (xx + (rng() - 0.5)), (yy + (rng() - 0.5)));
xx = (xx + 6);
end;
end;
yy = (yy + 6);
end;
end;
__I1.fenceRing(g, P, ((gd.x0 or __NaN) - 2), ((gd.y0 or __NaN) - 2), ((gd.x1 or __NaN) + 2), ((gd.y1 or __NaN) + 2), ((sy < 0) and "b" or "t"));
end;
end;
end;
end);
for k = 0, 3 - 1 do
local sx = ((k == 0) and (-1) or 1);
local x = (cx + (sx * (20 + (rng() * 14))));
local y = ((cy + ((k == 2) and 16 or (-16))) + ((rng() - 0.5) * 4));
if __T(occ.free((x - 7), (y - 5), (x + 7), (y + 4))) then
occ.take((x - 7), (y - 5), (x + 7), (y + 4), "stall");
P.addProp(g, "stall", x, y);
end;
end;
P.addCritter(g, "cart", ((cx - 60) - (rng() * 20)), (M.roadY((cx - 70)) + 1));
P.addCritter(g, "cart", (M.lane(cx, (cy + 45)) + 1), ((cy + 45) + (rng() * 10)));
if (vi ~= 1) then
P.addCritter(g, "cart", ((cx + 70) + (rng() * 20)), (M.roadY((cx + 80)) - 1));
end;
for k = 0, 6 - 1 do
P.addCritter(g, "villager", (cx + ((rng() - 0.5) * 50)), (cy + ((rng() - 0.5) * 24)));
end;
for k = 0, 3 - 1 do
P.addCritter(g, "chicken", (cx + (((rng() < 0.5) and (-1) or 1) * (30 + (rng() * 40)))), (cy + (((rng() < 0.5) and (-1) or 1) * (14 + (rng() * 10)))));
end;
for k = 0, 2 - 1 do
tryPlace("hay", ((cx - 110) + (rng() * 220)), 24, ((cx - 110) + (rng() * 220)), 156, 3);
end;
end);
P.addCritter(g, "horse", 420, (M.roadY(420) + 12));
P.addCritter(g, "horse", 810, (M.roadY(810) - 12));
local avoid = __map(__filter(occ.rects, function(r) 
return (r.tag ~= "road");
end), function(r) 
return {x=(((r.x0 or __NaN) + (r.x1 or __NaN)) / 2), y=(((r.y0 or __NaN) + (r.y1 or __NaN)) / 2), r=((__mmax(((r.x1 or __NaN) - (r.x0 or __NaN)), ((r.y1 or __NaN) - (r.y0 or __NaN))) / 2) + 5)};
end);
do
local __t16, __t17 = __it(__I0.scatter(rng, 70, 10, 22, (w - 10), (h - 22), 16, avoid)), 0;
while __t17 < __t16.length do
repeat
local t = __t16[__t17]; __t17 = __t17 + 1;
if __T(occ.inside(t.x, t.y, 4)) then
do break end;
end;
local inVillage = __some(M.VILLAGES, function(cx) 
return (__mabs(((t.x or __NaN) - cx)) < 70);
end);
P.addProp(g, (inVillage and "bush" or ((rng() < 0.5) and "oak" or ((rng() < 0.5) and "pine" or "bush"))), t.x, t.y);
until true;
end;
end;
do return {w=w, h=h, scroll="x", start=start, gardens=gardens, squares=squares, greens=greens} end;
end;
-- levels/village:121
M.update = function(g) 
local seen = (function() if not __T(g.lvlCarts) then g.lvlCarts = __Map() end; return g.lvlCarts end)();
do
local __t19, __t20 = __it(g.critters), 0;
while __t20 < __t19.length do
local c = __t19[__t20]; __t20 = __t20 + 1;
if ((c.kind == "cart") or (c.kind == "horse")) then
__set(seen, c.id, c);
end;
end;
end;
do
local __t22, __t23 = __it(seen), 0;
while __t23 < __t22.length do
repeat
local __t25 = __t22[__t23]; __t23 = __t23 + 1; local id, c; id = __t25[0]; c = __t25[1];
if ((not __T(c.dead)) and (not __T(c.gone))) then
do break end;
end;
__delete(seen, id);
if __T(c.dead) then
__push(g.corpses, {u=nil, critter=c.kind, x=c.x, y=c.y, cls=nil, t=0, fx=c.fx});
end;
until true;
end;
end;
end;
-- levels/village:137
M.drawCottage = function(ctx, p, g, h) 
local v = __mfmod((p.seed or __NaN), 4);
local W = ((p.w or __NaN) + 2);
local RH = 11;
local WH = 7;
local H = (RH + WH);
local x0 = (__mfloor((p.x or __NaN) + 0.5) - __shr(W, 1));
local base = __mfloor(((p.y or __NaN) + ((p.h or __NaN) / 2)) + 0.5);
if (p.state == "up") then
local spr = h.sprite(("vl-cot" .. __str(v)), W, H, function(c) 
return __I1.paintHouse(c, {W=W, RH=RH, WH=WH, roof="thatch", roofPal=((__band(v, 1) ~= 0) and M.THATCH2 or __I1.THATCH), wall="timber", wallPal=((v > 1) and M.DAUB2 or __I1.DAUB), posts={[0]=7, (W - 8), length=2}, doors={[0]={x=((__band(v, 2) ~= 0) and 4 or (W - 9)), w=3, h=5, kind="plain"}, length=1}, windows={[0]={x=((__band(v, 2) ~= 0) and (W - 7) or 4), y=2, w=2, h=2}, {x=((__band(v, 2) ~= 0) and 10 or 9), y=2, w=2, h=2}, length=2}, chimney=(function() if (v == 3) then return nil; elseif (__band(v, 1) ~= 0) then return 4; else return (W - 6); end; end)(), seed=((v * 7) + 1), lit=(v == 1)}, h.hash);
end);
__I1.shadow(ctx, (x0 + 3), (base - WH), W, (WH + 2));
__I1.blit(ctx, spr, x0, ((base - H) + 1), p, h, M.BT("cottage"));
if ((not __T(p.burning)) and (v ~= 3)) then
M.smoke(ctx, g, (x0 + ((__band(v, 1) ~= 0) and 4 or (W - 6))), (base - H), p.seed);
end;
else
local Hh;
Hh = ((p.h or __NaN) + 4);
local spr = h.sprite(("vl-cotx" .. __str(v)), W, Hh, function(c) 
return __I1.paintRuin(c, W, Hh, ((__band(v, 1) ~= 0) and M.THATCH2 or __I1.THATCH), __I1.DAUB, ((v * 3) + 9), h.hash, true);
end);
__I1.blit(ctx, spr, x0, ((base - Hh) + 1), p, h, M.BT("cottage"));
end;
end;
-- levels/village:153
M.smoke = function(ctx, g, x, y, seed) 
local t = __mfmod(__mfloor((((g.t or __NaN) * 2) + seed)), 7);
ctx.globalAlpha = 0.4;
ctx.fillStyle = "#b8b0a0";
ctx:fillRect((x + ((t > 3) and 1 or 0)), ((y - 1) - t), 1, 1);
if (t > 1) then
ctx:fillRect(((x + 1) - ((t > 5) and 1 or 0)), ((y - 3) - t), 1, 1);
end;
ctx.globalAlpha = 1;
end;
-- levels/village:161
M.drawInn = function(ctx, p, g, h) 
local v = __mfmod((p.seed or __NaN), 2);
local W = ((p.w or __NaN) + 2);
local RH = 14;
local WH = 13;
local H = (RH + WH);
local x0 = (__mfloor((p.x or __NaN) + 0.5) - __shr(W, 1));
local base = __mfloor(((p.y or __NaN) + ((p.h or __NaN) / 2)) + 0.5);
if (p.state == "up") then
local spr = h.sprite(("vl-inn" .. __str(v)), W, H, function(c) 
__I1.paintHouse(c, {W=W, RH=RH, WH=WH, roof="shingle", roofPal=(function() if (v ~= 0) then return __I1.SHINGLE; else return {[0]="#2a1c18", "#4a2e26", "#643c30", "#7c4c3a", "#985e46", length=5}; end; end)(), wall="plank", doors={[0]={x=(__shr(W, 1) - 2), w=5, h=6, kind="plain"}, length=1}, windows={[0]={x=4, y=2, w=3, h=2}, {x=10, y=2, w=3, h=2}, {x=(W - 13), y=2, w=3, h=2}, {x=(W - 7), y=2, w=3, h=2}, {x=5, y=8, w=3, h=2}, {x=(W - 8), y=8, w=3, h=2}, length=6}, chimney=((v ~= 0) and 5 or (W - 7)), seed=(5 + v), lit=true, hip=0.6}, h.hash);
c.fillStyle = __I1.PLANK[0];
c:fillRect(1, (RH + 6), (W - 2), 1);
local sx = (__shr(W, 1) + 5);
local sy = (RH + 6);
c.fillStyle = __I1.INK;
c:fillRect(sx, sy, 5, 1);
c:fillRect((sx + 1), (sy + 1), 5, 4);
c.fillStyle = __I1.PLANK[3];
c:fillRect((sx + 2), (sy + 2), 3, 2);
c.fillStyle = "#ffd75a";
c:fillRect((sx + 3), (sy + 2), 1, 2);
end);
__I1.shadow(ctx, (x0 + 4), (base - WH), W, (WH + 3));
__I1.blit(ctx, spr, x0, ((base - H) + 1), p, h, M.BT("inn"));
if (not __T(p.burning)) then
M.smoke(ctx, g, (x0 + ((v ~= 0) and 5 or (W - 7))), (base - H), p.seed);
end;
else
local Hh;
Hh = ((p.h or __NaN) + 5);
local spr = h.sprite(("vl-innx" .. __str(v)), W, Hh, function(c) 
return __I1.paintRuin(c, W, Hh, (function() if (v ~= 0) then return __I1.SHINGLE; else return {[0]="#2a1c18", "#4a2e26", "#643c30", "#7c4c3a", "#985e46", length=5}; end; end)(), __I1.PLANK, ((v * 5) + 21), h.hash);
end);
__I1.blit(ctx, spr, x0, ((base - Hh) + 1), p, h, M.BT("inn"));
end;
end;
-- levels/village:187
M.drawWell = function(ctx, p, g, h) 
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
if (p.state == "up") then
local spr = h.sprite("vl-well", 13, 16, function(c) 
__I1.paint(c, 13, 16, function(px, py) 
local dx = (px - 6);
local yy = (py - 8);
if (yy < 0) then
do return nil end;
end;
local inTop = ((((dx / 5.5) ^ 2) + (((yy - 1.5) / 2.2) ^ 2)) < 1);
local inBody = ((((__mabs(dx) < 5.5) and (yy >= 1.5)) and (yy <= 5)) or ((((dx / 5.5) ^ 2) + (((yy - 5) / 2.2) ^ 2)) < 1));
if ((not inTop) and (not inBody)) then
do return nil end;
end;
if (inTop and ((((dx / 3.8) ^ 2) + (((yy - 1.5) / 1.3) ^ 2)) < 1)) then
do return "#0e1418" end;
end;
if (inTop and (yy < 2.5)) then
do return M.STONE[3] end;
end;
local brick = ((__mfmod((px + (__band(py, 1) * 2)), 4) == 0) or (__mfmod(py, 2) == 0));
do return M.STONE[M.clamp(__mfloor(((2.6 - (dx / 5.5)) + (brick and (-1) or 0)) + 0.5), 1, 4)] end;
end);
c.fillStyle = __I1.INK;
c:fillRect(0, 4, 2, 7);
c:fillRect(11, 4, 2, 7);
c.fillStyle = __I1.PLANK[3];
c:fillRect(0, 5, 1, 5);
c:fillRect(11, 5, 1, 5);
__I1.paint(c, 13, 6, function(px, py) 
if ((py < 5) and (__mabs((px - 6)) <= (2 + py))) then do return (function() if (py == 4) then return __I1.SHINGLE[0]; else return __I1.SHINGLE[M.clamp(((4 - ((px > 6) and 1 or 0)) - ((py > 2) and 1 or 0)), 1, 4)]; end; end)() end; else do return nil end; end;
end);
c.fillStyle = __I1.PLANK[1];
c:fillRect(1, 6, 11, 1);
c.fillStyle = "#c8b48a";
c:fillRect(6, 7, 1, 3);
end);
__I1.shadow(ctx, (x - 3), (y + 1), 11, 3);
__I1.blit(ctx, spr, (x - 6), (y - 12), p, h, M.BT("well"));
else
local spr = h.sprite("vl-wellx", 15, 10, function(c) 
for i = 0, 16 - 1 do
repeat
local a = ((i / 16) * M.TAU);
if (h.hash(i, 3) < 0.3) then
do break end;
end;
local px = __mfloor((7 + (__mcos(a) * 5.5)) + 0.5);
local py = __mfloor((5 + (__msin(a) * 3)) + 0.5);
c.fillStyle = __I1.INK;
c:fillRect(px, py, 2, 2);
c.fillStyle = M.STONE[(2 + __band(i, 1))];
c:fillRect(px, py, 1, 1);
until true;
end;
c.fillStyle = "#0e1418";
c:fillRect(5, 4, 5, 2);
for k = 0, 3 - 1 do
c.fillStyle = __I1.INK;
c:fillRect((2 + (k * 4)), (7 - k), 4, 2);
c.fillStyle = __I1.PLANK[3];
c:fillRect((2 + (k * 4)), (7 - k), 3, 1);
end;
end);
__I1.blit(ctx, spr, (x - 7), (y - 5), p, h, M.BT("well"));
end;
end;
-- levels/village:228
M.drawStall = function(ctx, p, g, h) 
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
local v = __mfmod((p.seed or __NaN), 3);
local a, b;
local __t28 = M.AWN[v]; a = __t28[0]; b = __t28[1];
if (p.state == "up") then
local spr = h.sprite(("vl-stall" .. __str(v)), 15, 12, function(c) 
c.fillStyle = __I1.INK;
c:fillRect(1, 6, 13, 6);
c.fillStyle = __I1.PLANK[3];
c:fillRect(2, 9, 11, 2);
c.fillStyle = __I1.PLANK[1];
c:fillRect(2, 10, 11, 1);
for i = 0, 10 - 1 do
c.fillStyle = M.GOODS[__mfmod(((i * 3) + v), 5)];
c:fillRect(((2 + i) + ((i > 4) and 1 or 0)), (7 + __band(i, 1)), 1, 1);
end;
c.fillStyle = __I1.PLANK[0];
c:fillRect(2, 7, 1, 2);
c:fillRect(12, 7, 1, 2);
__I1.paint(c, 15, 8, function(px, py) 
if (((px < 0) or (px > 14)) or (py > 6)) then
do return nil end;
end;
if ((py == 6) and (__band(px, 1) ~= 0)) then
do return nil end;
end;
if ((py == 0) and ((px == 0) or (px == 14))) then
do return nil end;
end;
local stripe = __band(__mfloor((px / 2)), 1);
local dark = (py >= 5);
if (stripe ~= 0) then do return (dark and "#b8ac94" or b) end; elseif dark then do return "#8a2a22" end; else do return a end; end;
end);
end);
__I1.shadow(ctx, (x - 5), (y + 2), 13, 2);
__I1.blit(ctx, spr, (x - 7), (y - 8), p, h, M.BT("stall"));
else
local spr = h.sprite(("vl-stallx" .. __str(v)), 15, 9, function(c) 
__I1.paint(c, 15, 9, function(px, py) 
local d = (__hypot(((px - 7) / 6.5), ((py - 4) / 3.5)) + ((h.hash(px, (py + v)) - 0.5) * 0.4));
if (d > 1) then
do return nil end;
end;
if (__band(__mfloor(((px + py) / 2)), 1) ~= 0) then do return ((d > 0.7) and "#9a8e78" or b) end; elseif (d > 0.7) then do return "#7a2420" end; else do return a end; end;
end);
for i = 0, 7 - 1 do
c.fillStyle = M.GOODS[__mfmod((i + v), 5)];
c:fillRect(__mfloor((h.hash(i, (v + 2)) * 15)), (6 + __mfmod(i, 3)), 1, 1);
end;
end);
__I1.blit(ctx, spr, (x - 7), (y - 4), p, h, M.BT("stall"));
end;
end;
-- levels/village:263
M.drawBarrel = function(ctx, p, g, h) 
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
local crate = (p.kind == "crate");
if (p.state == "up") then
local spr;
if crate then spr = h.sprite("vl-crate", 7, 7, function(c) 
c.fillStyle = __I1.INK;
c:fillRect(0, 0, 7, 7);
c.fillStyle = "#c8a46c";
c:fillRect(1, 1, 5, 2);
c.fillStyle = "#a07a48";
c:fillRect(1, 3, 5, 3);
c.fillStyle = "#7a5a34";
c:fillRect(1, 4, 5, 1);
c:fillRect(3, 3, 1, 3);
c.fillStyle = "#e0c48c";
c:fillRect(1, 1, 2, 1);
end); else spr = h.sprite("vl-barrel", 7, 8, function(c) 
return __I1.paint(c, 7, 8, function(px, py) 
local dx = (px - 3);
if (__mabs(dx) > (((py == 0) or (py == 7)) and 2 or 3)) then
do return nil end;
end;
if (py <= 1) then
do return ((py == 0) and "#5e3b24" or ((dx < 0) and "#a06a43" or "#835233")) end;
end;
if ((py == 3) or (py == 6)) then
do return "#3a3430" end;
end;
do return __I1.PLANK[M.clamp((((3 - ((dx > 0) and 1 or 0)) - ((dx > 1) and 1 or 0)) + ((dx < (-1)) and 1 or 0)), 1, 4)] end;
end);
end); end;
__I1.shadow(ctx, (x - 1), (y + 2), 5, 1);
__I1.blit(ctx, spr, (x - 3), ((y - (spr.height or __NaN)) + 3), p, h, M.BT("barrel"));
else
local spr = h.sprite(("vl-" .. __str(p.kind) .. "x"), 9, 6, function(c) 
for i = 0, 6 - 1 do
local px = __mfloor((h.hash(i, (crate and 1 or 2)) * 8));
local py = __mfloor((h.hash((crate and 3 or 4), i) * 4));
c.fillStyle = __I1.INK;
c:fillRect(px, (py + 1), 2, 1);
c.fillStyle = (crate and "#b08a5a" or __I1.PLANK[3]);
c:fillRect(px, py, 2, 1);
end;
if (not crate) then
c.fillStyle = "#3a3430";
c:fillRect(3, 2, 3, 1);
end;
end);
__I1.blit(ctx, spr, (x - 4), (y - 3), p, h, M.BT("barrel"));
end;
end;
-- levels/village:301
M.cartRows = function(load, fr) 
local hr = M.HORSE[fr];
local cart = {[0]=load[0], load[1], "PPPPPPP", "pPPPPPp", ".WwW...", "..W....", length=6};
do return __map(hr, function(r, i) 
return ((__padEnd(cart[i], 7, ".") .. ((i == 3) and "-" or ".")) .. __str(r));
end) end;
end;
-- levels/village:306
M.drawHorse = function(ctx, c, g, h) 
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
local fr = (__T(c.moving) and __mfmod(__mfloor(((c.walk or __NaN) * 1.5)), 2) or 0);
local pal = ((__mfmod((c.seed or __NaN), 3) == 0) and M.HORSE_PAL2 or M.HORSE_PAL);
local spr = __I1.mapSprite(h, ("vl-horse" .. ((__mfmod((c.seed or __NaN), 3) == 0) and "g" or "b") .. __str(fr)), M.HORSE[fr], pal, ((c.fx or __NaN) < 0));
__I1.shadow(ctx, (x - 4), (y + 1), 9, 1, 0.35);
local X = (x - __shr(spr.width, 1));
local Y = (((y - (spr.height or __NaN)) + 2) - ((__T(c.moving) and (fr ~= 0)) and 1 or 0));
ctx:drawImage(spr, X, Y);
if ((c.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.7;
ctx:drawImage(h.tinted(spr, "#ffffff"), X, Y);
ctx.globalAlpha = 1;
end;
end;
-- levels/village:314
M.drawCart = function(ctx, c, g, h) 
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
local fr = (__T(c.moving) and __mfmod(__mfloor(((c.walk or __NaN) * 1.5)), 2) or 0);
local ld = __mfmod((c.seed or __NaN), 3);
local spr = __I1.mapSprite(h, ("vl-cart" .. __str(ld) .. __str(fr)), M.cartRows(M.CART_LOADS[ld], fr), M.CART_PAL, ((c.fx or __NaN) < 0));
__I1.shadow(ctx, (x - 8), (y + 1), 17, 1, 0.35);
local X = (x - __shr(spr.width, 1));
local Y = (((y - (spr.height or __NaN)) + 2) - ((__T(c.moving) and (fr ~= 0)) and 1 or 0));
ctx:drawImage(spr, X, Y);
if ((c.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.7;
ctx:drawImage(h.tinted(spr, "#ffffff"), X, Y);
ctx.globalAlpha = 1;
end;
end;
-- levels/village:326
M.drawVillager = function(ctx, c, g, h) 
local flash;
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
flash = ((c.hitT or __NaN) > 0);
local C = function(col) 
return (flash and "#ffffff" or col);
end;
local run = (((c.scared or __NaN) > 0) or (__hypot(((g.boss.x or __NaN) - (c.x or __NaN)), ((g.boss.y or __NaN) - (c.y or __NaN))) < 40));
local st = (__T(c.moving) and __mfmod(__mfloor(((c.walk or __NaN) * (run and 2 or 1))), 2) or 2);
ctx.fillStyle = "rgba(8,10,6,.4)";
ctx:fillRect((x - 1), (y + 1), 3, 1);
if (st ~= 0) then
h.px(ctx, (x - 1), y, C(__I1.INK));
end;
if (st ~= 1) then
h.px(ctx, (x + 1), y, C(__I1.INK));
end;
ctx.fillStyle = C(M.TUNIC[__mfmod((c.seed or __NaN), 6)]);
ctx:fillRect((x - 1), (y - 2), 3, 2);
h.px(ctx, x, (y - 3), C("#e8b48a"));
h.px(ctx, (x - (c.fx or __NaN)), (y - 3), C(M.HAIR[__mfmod((c.seed or __NaN), 5)]));
if (__mfmod((c.seed or __NaN), 4) == 0) then
h.px(ctx, x, (y - 4), C(M.HAIR[__mfmod((c.seed or __NaN), 5)]));
end;
if run then
local k = __mfmod(__mfloor((((g.t or __NaN) * 8) + (c.seed or __NaN))), 2);
h.px(ctx, (x - 2), ((y - 3) - k), C("#e8b48a"));
h.px(ctx, (x + 2), ((y - 4) + k), C("#e8b48a"));
elseif (__mfmod((c.seed or __NaN), 3) == 0) then
h.px(ctx, (x + ((c.fx or __NaN) * 2)), (y - 2), C(((__mfmod((c.seed or __NaN), 2) ~= 0) and "#c8a064" or "#8a5a36")));
end;
end;
-- levels/village:344
M.corpse = function(key, rows) 
do return function(ctx, c, h) 
local spr = __I1.mapSprite(h, key, rows, M.DEAD_PAL, ((c.fx or __NaN) < 0));
ctx:drawImage(spr, (__mfloor((c.x or __NaN) + 0.5) - __shr(spr.width, 1)), ((__mfloor((c.y or __NaN) + 0.5) - (spr.height or __NaN)) + 3));
end end;
end;
-- levels/village:351
M.drawVillagerCorpse = function(ctx, c, h) 
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
ctx.fillStyle = M.TUNIC[__mfmod(__i32(((c.x or __NaN) * 7)), 6)];
ctx:fillRect((x - 1), (y - 1), 3, 1);
h.px(ctx, (x + 2), (y - 1), "#e8b48a");
h.px(ctx, x, y, "#a3201a");
h.px(ctx, (x - 1), y, "#a3201a");
end;
-- levels/village:360
M.ground = function(ctx, m, h) 
local hash, vnoise;
local __t32 = h; hash = __t32.hash; vnoise = __t32.vnoise;
for y = 0, __mceil(m.h) - 1 do
for x = 0, __mceil(m.w) - 1 do
local n = (((vnoise((x / 28), (y / 28)) * 0.55) + (vnoise(((x / 9) + 70), (y / 9)) * 0.3)) + (hash(x, y) * 0.2));
ctx.fillStyle = M.GRASS[M.clamp(__mfloor((((n * 3.4) - 0.2) + (__band((x + y), 1) * 0.3))), 0, 3)];
ctx:fillRect(x, y, 1, 1);
end;
end;
for i = 0, __mceil(((m.w or __NaN) * 2)) - 1 do
local x = __mfloor((hash(i, 19) * (m.w or __NaN)));
local y = __mfloor((hash(i, 29) * (m.h or __NaN)));
local k = hash(i, 7);
ctx.fillStyle = ((k < 0.05) and "#e8d23a" or ((k < 0.09) and "#f4ecd2" or ((k < 0.12) and "#9fb8ff" or ((k < 0.6) and "#5a7a3c" or "#2a3c22"))));
ctx:fillRect(x, y, 1, 1);
end;
do
local __t36, __t37 = __it((__T(m.greens) and m.greens or {length=0})), 0;
while __t37 < __t36.length do
local gr = __t36[__t37]; __t37 = __t37 + 1;
for y = __mmax(0, __mfloor(((gr.y or __NaN) - (gr.ry or __NaN)))), __mmin(((m.h or __NaN) - 1), ((gr.y or __NaN) + (gr.ry or __NaN))) do
for x = __mfloor(((gr.x or __NaN) - (gr.rx or __NaN))), ((gr.x or __NaN) + (gr.rx or __NaN)) do
repeat
local d = (((((x - (gr.x or __NaN)) / (gr.rx or __NaN)) ^ 2) + (((y - (gr.y or __NaN)) / (gr.ry or __NaN)) ^ 2)) + ((vnoise((x / 7), (y / 7)) - 0.5) * 0.6));
if ((d > 1) or (hash((x * 5), (y * 3)) > (0.45 - (d * 0.3)))) then
do break end;
end;
ctx.fillStyle = ((hash(y, x) < 0.5) and "#4a4a2c" or "#55502e");
ctx:fillRect(x, y, 1, 1);
until true;
end;
end;
end;
end;
local road = function(x, y, d, half) 
if ((((x < 0) or (y < 0)) or (x >= (m.w or __NaN))) or (y >= (m.h or __NaN))) then
do return end;
end;
local k = hash((x * 3), (y * 7));
if ((__mabs(d) > (half - 1)) and (k < 0.45)) then
do return end;
end;
local col = ((k < 0.3) and "#5a4a32" or ((k < 0.8) and "#665438" or "#74603f"));
if (__mabs((__mabs(d) - 2.5)) < 0.6) then
col = ((k < 0.5) and "#4a3a26" or "#54422c");
end;
if (k > 0.97) then
col = "#8a8a7a";
end;
ctx.fillStyle = col;
ctx:fillRect(x, y, 1, 1);
end;
for x = 0, __mceil(m.w) - 1 do
local cy = M.roadY(x);
for dy = (-6), 6 do
road(x, __mfloor((cy + dy) + 0.5), dy, 6);
end;
end;
do
local __t43, __t44 = __it(M.VILLAGES), 0;
while __t44 < __t43.length do
local cx = __t43[__t44]; __t44 = __t44 + 1;
for y = 0, __mceil(m.h) - 1 do
local lx = M.lane(cx, y);
for dx = (-5), 5 do
road(__mfloor((lx + dx) + 0.5), y, dx, 5);
end;
end;
end;
end;
do
local __t48, __t49 = __it((__T(m.squares) and m.squares or {length=0})), 0;
while __t49 < __t48.length do
local s = __t48[__t49]; __t49 = __t49 + 1;
for y = __mfloor(((s.y or __NaN) - (s.ry or __NaN))), ((s.y or __NaN) + (s.ry or __NaN)) do
for x = __mfloor(((s.x or __NaN) - (s.rx or __NaN))), ((s.x or __NaN) + (s.rx or __NaN)) do
repeat
local d = (((((x - (s.x or __NaN)) / (s.rx or __NaN)) ^ 2) + (((y - (s.y or __NaN)) / (s.ry or __NaN)) ^ 2)) + ((hash(x, y) - 0.5) * 0.15));
if (d > 1) then
do break end;
end;
local bx = __mfloor(((x + (__band(__mfloor((y / 2)), 1) * 2)) / 3));
local by = __mfloor((y / 2));
local seam = ((__mfmod((x + (__band(__mfloor((y / 2)), 1) * 2)), 3) == 0) or (__mfmod(y, 2) == 0));
local k = hash(bx, by);
local lit = (((not seam) and (__mfmod((x + (__band(__mfloor((y / 2)), 1) * 2)), 3) == 1)) and (__mfmod(y, 2) == 1));
ctx.fillStyle = (seam and ((d > 0.75) and "#55463a" or "#4a443a") or ((k < 0.3) and "#6e685a" or ((k < 0.75) and "#7a7464" or ((k < 0.95) and "#857e6c" or "#6a5a42"))));
if (lit and (k > 0.3)) then
ctx.fillStyle = "#958e7a";
end;
if ((d > 0.8) and (hash(y, x) < 0.4)) then
ctx.fillStyle = "#665438";
end;
ctx:fillRect(x, y, 1, 1);
until true;
end;
end;
end;
end;
do
local __t53, __t54 = __it((__T(m.gardens) and m.gardens or {length=0})), 0;
while __t54 < __t53.length do
local gd = __t53[__t54]; __t54 = __t54 + 1;
for y = __mfloor((gd.y0 or __NaN)), gd.y1 do
for x = __mfloor((gd.x0 or __NaN)), gd.x1 do
local row = __mfmod((y - __mfloor((gd.y0 or __NaN))), 3);
local k = hash((x * 7), (y * 3));
ctx.fillStyle = ((row == 0) and "#3a2a1a" or ((k < 0.5) and "#5a4228" or "#4c3822"));
ctx:fillRect(x, y, 1, 1);
end;
end;
end;
end;
end;

-- levels/village:9
M.TAU = (math.pi * 2);
-- levels/village:10
M.clamp = function(v, a, b) 
if (v < a) then do return a end; elseif (v > b) then do return b end; else do return v end; end;
end;
-- levels/village:14
M.BUILDING = {solid=true, flammable=true, crushShare=0.5, spread=0.3};
-- levels/village:15
M.SMALL = {flammable=true, crushShare=0.5, burnTime=4, spread=0.3};
-- levels/village:16
M.kinds = {cottage=__assignKV(__assign({}, M.BUILDING), "w", 20, "h", 12, "hp", 160, "burnTime", 9, "leaves", "#c4a858", "value", {pts=200, venge=0.16, chaos=1.8}), inn=__assignKV(__assign({}, M.BUILDING), "w", 32, "h", 18, "hp", 360, "burnTime", 13, "leaves", "#8a5a36", "value", {pts=450, venge=0.3, chaos=3.5}), well=__assignKV(__assign({}, M.BUILDING), "r", 4, "hp", 140, "burnTime", 5, "spread", 0.1, "leaves", "#aeac9b", "value", {pts=120, venge=0.1, chaos=0.6}), stall=__assignKV(__assign({}, M.SMALL), "w", 12, "h", 6, "slow", 0.3, "slowR", 7, "leaves", "#d8473a", "value", {pts=40, venge=0.04, chaos=0.35}), barrel=__assignKV(__assign({}, M.SMALL), "r", 2, "leaves", "#8a5a36", "value", {pts=15, venge=0.01, chaos=0.1}), crate=__assignKV(__assign({}, M.SMALL), "r", 2, "leaves", "#b08a5a", "value", {pts=15, venge=0.01, chaos=0.1})};
-- levels/village:25
M.critters = {cart={r=4, hp=60, spd=2, flee=24, fear=55, leaves=true, bits="#8a5a36", cry="neigh", value={pts=300, venge=0.15, chaos=0.6}}, horse={r=3, hp=45, spd=5, flee=30, fear=50, leaves=true, bits="blood", cry="neigh", value={pts=250, venge=0.12, chaos=0.5}}, villager={r=1.5, hp=15, spd=7, flee=20, fear=40, raise="skeleton", value={pts=80, venge=0.06, chaos=0.2}}};
-- levels/village:33
M.roadY = function(x) 
return ((96 + (__msin((x / 140)) * 9)) + (__msin((x / 47)) * 2));
end;
-- levels/village:34
M.VILLAGES = {[0]=230, 615, 1000, length=3};
-- levels/village:35
M.lane = function(cx, y) 
return (cx + (__msin(((y / 23) + cx)) * 3));
end;
-- levels/village:133
M.BT = function(k) 
return __orv((M.kinds[k] and M.kinds[k].burnTime), 8);
end;
-- levels/village:134
M.THATCH2 = {[0]="#3e2e14", "#644c22", "#8a6c30", "#ae9040", "#d0b45c", length=5};
-- levels/village:135
M.DAUB2 = {[0]="#6a5e48", "#9c8c6c", "#bcac88", "#d4c6a0", "#e6dab8", length=5};
-- levels/village:186
M.STONE = {[0]="#2f302c", "#55564f", "#7f7f74", "#aeac9b", "#d2cfbd", length=5};
-- levels/village:226
M.AWN = {[0]={[0]="#d8473a", "#f4ecd2", length=2}, {[0]="#3a6ab0", "#f4ecd2", length=2}, {[0]="#4a8a3a", "#e8d23a", length=2}, length=3};
-- levels/village:227
M.GOODS = {[0]="#d8473a", "#e8b83a", "#6e9a44", "#c8a064", "#a463e0", length=5};
-- levels/village:292
M.HORSE_PAL = {H="#7a5236", h="#5a3d29", m="#1a120c", d="#3a281b", L="#3a281b", t="#1a120c", e=__I1.INK};
-- levels/village:293
M.HORSE_PAL2 = __assignKV(__assign({}, M.HORSE_PAL), "H", "#c8b8a0", "h", "#9a8a74", "L", "#6a5e50");
-- levels/village:294
M.HORSE = {[0]={[0]="......mm..", "t.....mHH.", "tHHHHHHHed", ".hHHHHh...", ".L.L..L.L.", ".L.L..L.L.", length=6}, {[0]="......mm..", "t.....mHH.", "tHHHHHHHed", ".hHHHHh...", "..L.L..L.L", ".L..L.L..L", length=6}, length=2};
-- levels/village:299
M.CART_PAL = __assignKV(__assign({}, M.HORSE_PAL), "P", "#74492c", "p", "#4a2e1c", "W", "#2a1c12", "w", "#a08a6a", "S", "#c8b48a", "s", "#a08a64", "Y", "#d8c068", "y", "#b49c48", "B", "#835233", "b", "#5e3b24", "-", "#4a2e1c");
-- levels/village:300
M.CART_LOADS = {[0]={[0]=".SsSs..", "SsSsSs.", length=2}, {[0]=".YyYY..", "YYyYyY.", length=2}, {[0]=".Bb.Bb.", "BbBbBb.", length=2}, length=3};
-- levels/village:324
M.TUNIC = {[0]="#7a6a4a", "#5a6a3a", "#8a5a3a", "#6a5a7a", "#9a8a6a", "#4a5a6a", length=6};
-- levels/village:325
M.HAIR = {[0]="#2a1d14", "#6e4a2a", "#c8a064", "#3a2a1a", "#8a8a80", length=5};
-- levels/village:341
M.HORSE_DEAD = {[0]=".L.L.L.L..", ".L.L.L.L..", "tHHHHHHHH.", ".hHHHHhHed", "..rr.rrr..", length=5};
-- levels/village:342
M.CART_WRECK = {[0]="..S.s..Y.", ".PPp.sPP.", "P.pPP.pPw", ".W.PP.W..", "rWw...Ww.", length=5};
-- levels/village:343
M.DEAD_PAL = __assignKV(__assign({}, M.CART_PAL), "r", "#a3201a");
-- levels/village:350
M.cartCorpse = M.corpse("vl-cartd", M.CART_WRECK);
M.horseCorpse = M.corpse("vl-horsed", M.HORSE_DEAD);
-- levels/village:359
M.GRASS = {[0]="#30462a", "#384f2e", "#415a34", "#4c663a", length=4};
M.default = {n=4, id="village", name="THE VILLAGES", sub="FLATTEN THE COTTAGES. TORCH THE INNS. THE CARTS WILL RUN.", mode="chaos", kinds=M.kinds, critters=M.critters, build=function(g, rng, P) 
do return M.build(g, rng, P) end;
end, update=M.update, art={ground=M.ground, props={cottage=M.drawCottage, inn=M.drawInn, well=M.drawWell, stall=M.drawStall, barrel=M.drawBarrel, crate=M.drawBarrel}, critters={cart=M.drawCart, horse=M.drawHorse, villager=M.drawVillager}, corpses={cart=M.cartCorpse, horse=M.horseCorpse, villager=M.drawVillagerCorpse}, canopy=false, theme={leash=false}}};
