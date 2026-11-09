-- Generated from the-endgame-is-me/js/levels/farms.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("levels/farms");
local __I0 = RT.module("levels/forest");
local __Array, __T, __assign, __assignKV, __band, __charAt, __filter, __hypot, __includes, __it, __map, __orv, __push, __shr, __slice, __some, __str, __unpack = RT["Array"], RT["T"], RT["assign"], RT["assignKV"], RT["band"], RT["charAt"], RT["filter"], RT["hypot"], RT["includes"], RT["it"], RT["map"], RT.orv, RT["push"], RT["shr"], RT["slice"], RT["some"], RT["str"], RT["unpack"];
local __NaN = 0 / 0;
local __mabs, __matan2, __mceil, __mcos, __mfloor, __mfmod, __mmax, __mmin, __msin = math.abs, math.atan2, math.ceil, math.cos, math.floor, math.fmod, math.max, math.min, math.sin;

-- levels/farms:44
M.Occupancy = function() 
local rects = {length=0};
do return {rects=rects, free=function(x0, y0, x1, y1, pad) if pad == nil then pad = 0 end;
return (not __some(rects, function(r) 
return (((((x0 - pad) < (r.x1 or __NaN)) and ((x1 + pad) > (r.x0 or __NaN))) and ((y0 - pad) < (r.y1 or __NaN))) and ((y1 + pad) > (r.y0 or __NaN)));
end));
end, take=function(x0, y0, x1, y1, tag) 
local r = {x0=x0, y0=y0, x1=x1, y1=y1, tag=tag};
__push(rects, r);
do return r end;
end, inside=function(x, y, pad) if pad == nil then pad = 0 end;
return __some(rects, function(r) 
return ((((x > ((r.x0 or __NaN) - pad)) and (x < ((r.x1 or __NaN) + pad))) and (y > ((r.y0 or __NaN) - pad))) and (y < ((r.y1 or __NaN) + pad)));
end);
end} end;
end;
-- levels/farms:55
M.fenceRing = function(g, P, x0, y0, x1, y1, gate) if gate == nil then gate = "b" end;
local hs = {length=0};
local vs = {length=0};
do
local x = (x0 + 4);
while (x <= (x1 - 4)) do
if (not ((gate == "t") and (__mabs((x - ((x0 + x1) / 2))) < 6))) then
__push(hs, {[0]=x, y0, length=2});
end;
if (not ((gate == "b") and (__mabs((x - ((x0 + x1) / 2))) < 6))) then
__push(hs, {[0]=x, y1, length=2});
end;
x = (x + 8);
end;
end;
do
local y = (y0 + 4);
while (y <= (y1 - 4)) do
__push(vs, {[0]=x0, y, length=2});
__push(vs, {[0]=x1, y, length=2});
y = (y + 8);
end;
end;
do
local __t3, __t4 = __it(hs), 0;
while __t4 < __t3.length do
local __t6 = __t3[__t4]; __t4 = __t4 + 1; local x, y; x = __t6[0]; y = __t6[1];
P.addProp(g, "fence", x, y, {w=8, h=2});
end;
end;
do
local __t7, __t8 = __it(vs), 0;
while __t8 < __t7.length do
local __t10 = __t7[__t8]; __t8 = __t8 + 1; local x, y; x = __t10[0]; y = __t10[1];
P.addProp(g, "fence", x, y, {w=2, h=8, vert=true});
end;
end;
end;
-- levels/farms:64
M.sow = function(g, P, f, occ, rng) 
local sx = 8;
local sy = 7;
do
local y = ((f.y0 or __NaN) + 4);
while (y <= ((f.y1 or __NaN) - 3)) do
do
local x = (((f.x0 or __NaN) + 4) + (__band((y / sy), 1) * 2));
while (x <= ((f.x1 or __NaN) - 3)) do
repeat
local jx = (x + ((rng() - 0.5) * 2));
local jy = (y + ((rng() - 0.5) * 1.5));
if (__mabs((jy - M.trackY(jx))) < 8) then
do break end;
end;
if __some(occ.rects, function(r) 
return (((((r.tag ~= "field") and (jx > ((r.x0 or __NaN) - 2))) and (jx < ((r.x1 or __NaN) + 2))) and (jy > ((r.y0 or __NaN) - 2))) and (jy < ((r.y1 or __NaN) + 2)));
end) then
do break end;
end;
P.addProp(g, f.crop, jx, jy);
until true;
x = (x + sx);
end;
end;
y = (y + sy);
end;
end;
end;
-- levels/farms:74
M.build = function(g, rng, P) 
local w = 1140;
local h = 180;
local start = {x=40, y=__mfloor(M.trackY(40) + 0.5), face=0};
local occ = M.Occupancy();
local fields = {length=0};
local yards = {length=0};
local spurs = {length=0};
occ.take(((start.x or __NaN) - 26), ((start.y or __NaN) - 22), ((start.x or __NaN) + 30), ((start.y or __NaN) + 22), "start");
for x = 0, w - 1, 10 do
occ.take(x, (M.trackY((x + 5)) - 6), (x + 10), (M.trackY((x + 5)) + 6), "track");
end;
local nFarms = 5;
for i = 0, nFarms - 1 do
local cx = ((160 + (i * 205)) + ((rng() - 0.5) * 30));
local up = (__mfmod(i, 2) == 0);
local ty = M.trackY(cx);
local yy;
if up then yy = M.clamp((ty - 50), 40, 60); else yy = M.clamp((ty + 46), 128, 146); end;
local flip = ((rng() < 0.5) and (-1) or 1);
local barn = {x=(cx + (flip * 20)), y=(yy + (up and (-4) or 2))};
local hut = {x=(cx - (flip * 24)), y=(yy + (up and 8 or (-6)))};
occ.take(((barn.x or __NaN) - 19), ((barn.y or __NaN) - 14), ((barn.x or __NaN) + 19), ((barn.y or __NaN) + 11), "barn");
occ.take(((hut.x or __NaN) - 11), ((hut.y or __NaN) - 12), ((hut.x or __NaN) + 11), ((hut.y or __NaN) + 10), "hut");
P.addProp(g, "barn", barn.x, barn.y);
P.addProp(g, "hut", hut.x, hut.y);
__push(yards, {x=cx, y=yy, rx=46, ry=22});
__push(spurs, {x0=(cx + ((rng() - 0.5) * 10)), y0=ty, x1=cx, y1=(yy + (up and 8 or (-8)))});
local px0 = (((barn.x or __NaN) + (flip * 23)) - ((flip < 0) and 34 or 0));
local pw = 34;
local ph = 24;
local py0;
if up then py0 = M.clamp(((barn.y or __NaN) - 8), 24, 40); else py0 = M.clamp(((barn.y or __NaN) - 14), 112, 136); end;
if ((__T(occ.free(px0, py0, (px0 + pw), (py0 + ph), 2)) and (px0 > 6)) and ((px0 + pw) < (w - 6))) then
occ.take((px0 - 1), (py0 - 1), ((px0 + pw) + 1), ((py0 + ph) + 1), "pen");
M.fenceRing(g, P, px0, py0, (px0 + pw), (py0 + ph), (up and "b" or "t"));
for k = 0, 2 - 1 do
P.addCritter(g, "pig", ((px0 + 8) + (k * 14)), ((py0 + 9) + (k * 6)));
end;
else
for k = 0, 2 - 1 do
P.addCritter(g, "pig", ((barn.x or __NaN) + ((rng() - 0.5) * 30)), ((barn.y or __NaN) + (up and 16 or (-18))));
end;
end;
for k = 0, 2 - 1 do
P.addCritter(g, "cow", (cx + ((rng() - 0.5) * 70)), (up and (M.clamp((ty - 24), 24, 150) + ((rng() - 0.5) * 6)) or (M.clamp((ty + 24), 30, 152) + ((rng() - 0.5) * 6))));
end;
for k = 0, 4 - 1 do
P.addCritter(g, "chicken", (cx + ((rng() - 0.5) * 40)), ((yy + (up and 12 or (-12))) + ((rng() - 0.5) * 8)));
end;
do
local k = 0;
while (k < (2 + ((rng() < 0.5) and 1 or 0))) do
local hx = ((barn.x or __NaN) - (flip * (2 + (k * 9))));
local hy = (((barn.y or __NaN) + (up and 15 or (-15))) + ((rng() - 0.5) * 3));
if (not __T(occ.inside(hx, hy, 3))) then
P.addProp(g, "hay", hx, hy);
occ.take((hx - 4), (hy - 4), (hx + 4), (hy + 4), "hay");
end;
k = k + 1;
end;
end;
local fw = (70 + (rng() * 20));
local fh = (34 + (rng() * 8));
local fy0;
if up then fy0 = M.clamp((ty + 12), 100, 180); else fy0 = M.clamp(((ty - 12) - fh), 18, 90); end;
local big = {x0=((cx - (fw / 2)) + ((rng() - 0.5) * 30)), y0=fy0, crop=((rng() < 0.65) and "wheat" or "cabbage")};
big.x1 = ((big.x0 or __NaN) + fw);
big.y1 = __mmin(((big.y0 or __NaN) + fh), 160);
if (not up) then
big.y0 = __mmax(18, (big.y0 or __NaN));
end;
__push(fields, big);
local sx0 = (cx + ((flip > 0) and (-86) or 54));
local sm = {x0=sx0, y0=(up and 20 or 120), x1=((sx0 + 36) + (rng() * 10)), y1=(up and (20 + 28) or (120 + 30)), crop=((rng() < 0.5) and "cabbage" or "wheat")};
if __T(occ.free(sm.x0, sm.y0, sm.x1, sm.y1, 3)) then
__push(fields, sm);
end;
end;
do
local __t20, __t21 = __it(fields), 0;
while __t21 < __t20.length do
local f = __t20[__t21]; __t21 = __t21 + 1;
occ.take(f.x0, f.y0, f.x1, f.y1, "field");
end;
end;
do
local __t23, __t24 = __it(fields), 0;
while __t24 < __t23.length do
local f = __t23[__t24]; __t24 = __t24 + 1;
M.sow(g, P, f, occ, rng);
end;
end;
local avoid = __map(__filter(occ.rects, function(r) 
return (r.tag ~= "track");
end), function(r) 
return {x=(((r.x0 or __NaN) + (r.x1 or __NaN)) / 2), y=(((r.y0 or __NaN) + (r.y1 or __NaN)) / 2), r=((__mmax(((r.x1 or __NaN) - (r.x0 or __NaN)), ((r.y1 or __NaN) - (r.y0 or __NaN))) / 2) + 6)};
end);
do
local __t26, __t27 = __it(__I0.scatter(rng, 26, 10, 20, (w - 10), (h - 22), 22, avoid)), 0;
while __t27 < __t26.length do
repeat
local t = __t26[__t27]; __t27 = __t27 + 1;
if (__mabs(((t.y or __NaN) - M.trackY(t.x))) < 10) then
do break end;
end;
P.addProp(g, ((rng() < 0.3) and "oak" or "bush"), t.x, t.y);
until true;
end;
end;
do return {w=w, h=h, scroll="x", start=start, fields=fields, yards=yards, spurs=spurs} end;
end;
-- levels/farms:135
M.paint = function(c, W, H, fill, edge, ink) if edge == nil then edge = "in" end; if ink == nil then ink = M.INK end;
local a = __Array((W * H));
for y = 0, __mceil(H) - 1 do
for x = 0, __mceil(W) - 1 do
a[((y * W) + x)] = __orv(fill(x, y), nil);
end;
end;
local at = function(x, y) 
return (function() if ((((x < 0) or (y < 0)) or (x >= W)) or (y >= H)) then return nil; else return a[((y * W) + x)]; end; end)();
end;
for y = 0, __mceil(H) - 1 do
for x = 0, __mceil(W) - 1 do
local col = a[((y * W) + x)];
local n4 = {[0]=at((x - 1), y), at((x + 1), y), at(x, (y - 1)), at(x, (y + 1)), length=4};
if ((__T(col) and (edge == "in")) and __some(n4, function(v) 
return (not __T(v));
end)) then
col = ink;
end;
if (((not __T(col)) and (edge == "out")) and __some(n4, function(v) 
return v;
end)) then
col = ink;
end;
if __T(col) then
c.fillStyle = col;
c:fillRect(x, y, 1, 1);
end;
end;
end;
end;
-- levels/farms:149
M.mapSprite = function(h, key, rows, pal, flip) if flip == nil then flip = false end;
local w = __mmax(__unpack(__it(__map(rows, function(r) 
return (r.length or #r);
end))));
local H = (rows.length or #rows);
do return h.sprite((__str(key) .. (__T(flip) and "L" or "R")), (w + 2), (H + 2), function(c) 
return M.paint(c, (w + 2), (H + 2), function(x, y) 
local r = rows[(y - 1)];
if (not __T(r)) then
do return nil end;
end;
local ch = __charAt(r, (__T(flip) and (w - x) or (x - 1)));
if ((ch ~= "") and (ch ~= ".")) then do return pal[ch] end; else do return nil end; end;
end, "out");
end) end;
end;
-- levels/farms:159
M.blit = function(ctx, spr, x, y, p, h, burnTime) 
ctx:drawImage(spr, x, y);
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, (((p.burnT or __NaN) / burnTime) * 0.95));
ctx:drawImage(h.tinted(spr, "#1a120c"), x, y);
ctx.globalAlpha = 1;
end;
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.6;
ctx:drawImage(h.tinted(spr, "#ffffff"), x, y);
ctx.globalAlpha = 1;
end;
end;
-- levels/farms:177
M.paintHouse = function(c, o, hash) 
local W, RH, WH, seed;
local __t33 = o; W = __t33.W; RH = __t33.RH; WH = __t33.WH; seed = __t33.seed; if seed == nil then seed = 0 end;
local H = (RH + WH);
local eave = (RH - 1);
local ridge = __mfloor((RH * 0.36) + 0.5);
local R = (__T(o.roofPal) and o.roofPal or ((o.roof == "thatch") and M.THATCH or M.SHINGLE));
local Wp = (__T(o.wallPal) and o.wallPal or M.PLANK);
local thatch = (o.roof == "thatch");
local roofAt = function(x, y) 
local inset = ((y < ridge) and __mceil(((ridge - y) * (o.hip == nil and 0.8 or o.hip))) or 0);
if ((x < inset) or (x > ((W - 1) - inset))) then
do return nil end;
end;
if ((thatch and (y == eave)) and ((x == 0) or (x == (W - 1)))) then
do return nil end;
end;
if ((thatch and (y == 0)) and ((x == inset) or (x == ((W - 1) - inset)))) then
do return nil end;
end;
local side = ((x < (W * 0.28)) and 0.6 or ((x > (W * 0.74)) and (-0.6) or 0));
local l;
if thatch then
if (y == eave) then
if (hash((x + seed), 3) < 0.35) then do return R[0] end; else do return R[1] end; end;
end;
if ((y == ridge) or (y == (ridge - 1))) then
if (__band((x + y), 1) ~= 0) then do return R[1] end; elseif (y == ridge) then do return R[2] end; else do return R[3] end; end;
end;
local s = hash(((x * 3) + seed), (__mfloor((y / 2)) + 7));
l = (((((y < ridge) and 3.3 or 2.4) + side) + ((s - 0.5) * 1.3)) - ((y >= (eave - 1)) and 0.6 or 0));
if (((y > ridge) and (__mfmod((y - ridge), 3) == 0)) and (hash(x, (y + seed)) < 0.6)) then
l = (l - 0.8);
end;
else
if (y == eave) then
do return R[0] end;
end;
if (y == ridge) then
do return R[4] end;
end;
l = (((y < ridge) and 3.2 or 2.4) + side);
if (y > ridge) then
local r = (y - ridge);
if (__mfmod(r, 2) == 0) then
l = (l - 1);
elseif (__mfmod(((x + (__shr(r, 1) * 2)) + seed), 4) == 0) then
l = (l - 0.9);
end;
elseif (__mfmod(((x + y) + seed), 4) == 0) then
l = (l - 0.7);
end;
l = (l + ((hash((x + seed), y) - 0.5) * 0.5));
end;
do return R[M.clamp(__mfloor(l + 0.5), 1, 4)] end;
end;
local wallAt = function(x, y) 
if ((x < 1) or (x > (W - 2))) then
do return nil end;
end;
do
local __t34, __t35 = __it((__T(o.doors) and o.doors or {length=0})), 0;
while __t35 < __t34.length do
local d = __t34[__t35]; __t35 = __t35 + 1;
if (((x >= (d.x or __NaN)) and (x < ((d.x or __NaN) + (d.w or __NaN)))) and (y >= (WH - (d.h or __NaN)))) then
local dx = (x - (d.x or __NaN));
local dy = (y - (WH - (d.h or __NaN)));
if (((dx == 0) or (dx == ((d.w or __NaN) - 1))) or (dy == 0)) then
do return ((Wp == M.PLANK) and "#24160e" or M.PLANK[0]) end;
end;
if (d.kind == "barn") then
local u = (dx / ((d.w or __NaN) - 1));
local v = (dy / ((d.h or __NaN) - 1));
if ((__mabs((u - v)) < 0.18) or (__mabs((u - (1 - v))) < 0.18)) then do return M.PLANK[4] end; elseif (dx == __shr(d.w, 1)) then do return M.PLANK[0] end; else do return M.PLANK[2] end; end;
end;
if (d.kind == "open") then
do return (((dy > ((d.h or __NaN) - 3)) and (hash(dx, seed) < 0.6)) and "#7e6430" or "#120c08") end;
end;
do return (((dx == ((d.w or __NaN) - 2)) and (dy == __shr(d.h, 1))) and "#c8a64a" or M.PLANK[2]) end;
end;
end;
end;
do
local __t37, __t38 = __it((__T(o.windows) and o.windows or {length=0})), 0;
while __t38 < __t37.length do
local wn = __t37[__t38]; __t38 = __t38 + 1;
if ((((x >= (wn.x or __NaN)) and (x < ((wn.x or __NaN) + (__T(wn.w) and wn.w or 2)))) and (y >= (wn.y or __NaN))) and (y < ((wn.y or __NaN) + (__T(wn.h) and wn.h or 2)))) then
do return (__T(o.lit) and "#e8b048" or "#1a1410") end;
end;
end;
end;
if (y == 0) then
do return Wp[0] end;
end;
local side = ((x < (W * 0.35)) and 1 or ((x > (W * 0.7)) and (-1) or 0));
if (o.wall == "plank") then
if (__mfmod(x, 3) == 0) then do return Wp[1] end; else do return Wp[M.clamp(((3 + side) - ((y == 1) and 1 or 0)), 1, 4)] end; end;
end;
if (o.wall == "timber") then
if (((((x == 1) or (x == (W - 2))) or __includes((__T(o.posts) and o.posts or {length=0}), x)) or (y == __mfloor((WH / 2)))) or (y == (WH - 1))) then
do return M.PLANK[1] end;
end;
do return Wp[M.clamp(((3 + side) + ((hash((x + seed), y) < 0.2) and (-1) or 0)), 1, 4)] end;
end;
do return Wp[M.clamp(__mfloor((((2.6 + (side * 0.8)) + ((hash(((x * 5) + seed), (y * 3)) - 0.5) * 1.4)) - ((y == 1) and 0.8 or 0)) + 0.5), 1, 4)] end;
end;
M.paint(c, W, H, function(x, y) 
return (function() if (y <= eave) then return roofAt(x, y); else return wallAt(x, ((y - eave) - 1)); end; end)();
end);
if (o.chimney ~= nil) then
c.fillStyle = M.INK;
c:fillRect(((o.chimney or __NaN) - 1), 0, 4, 4);
c.fillStyle = "#7f7f74";
c:fillRect(o.chimney, 0, 2, 3);
c.fillStyle = "#aeac9b";
c:fillRect(o.chimney, 0, 1, 2);
c.fillStyle = "#1a1410";
c:fillRect(o.chimney, 0, 2, 1);
end;
end;
-- levels/farms:229
M.paintRuin = function(c, W, H, roofPal, wallPal, seed, hash, thatch) if thatch == nil then thatch = false end;
local cx = (W / 2);
local cy = (H * 0.52);
local kx = ((W / 2) - 0.5);
local ky = (H * 0.48);
local crackAt = function(x, y) 
return (((x - cx) - ((y - cy) * 0.9)) + ((hash(y, seed) - 0.5) * 2.4));
end;
M.paint(c, W, H, function(x, y) 
local u = (((x + 0.5) - cx) / kx);
local v = (((y + 0.5) - cy) / ky);
local n = hash((__mfloor((x / 2)) + seed), (__mfloor((y / 2)) + 3));
local d = (__mmax(__mabs(u), __mabs(v)) + ((n - 0.5) * 0.3));
if (d > 0.98) then
do return nil end;
end;
local k = crackAt(x, y);
if (__mabs(k) < 0.8) then
do return "#1a120c" end;
end;
if (hash(((x * 3) + seed), (y * 7)) < 0.05) then
do return "#1a120c" end;
end;
if (d > 0.8) then
do return wallPal[(1 + __mfloor((hash((x + seed), y) * 3)))] end;
end;
local slab = ((k > 0) and 1 or 0);
local l;
if __T(thatch) then
l = ((2.4 + ((hash(((x * 3) + seed), __mfloor((y / 2))) - 0.5) * 1.4)) - ((__mfmod(y, 3) == 0) and 0.6 or 0));
else
local r = (y + slab);
l = ((__mfmod(r, 2) == 0) and 1 or (2.6 - ((__mfmod(((x + (__shr(r, 1) * 2)) + seed), 4) == 0) and 0.9 or 0)));
end;
l = (l + ((slab ~= 0) and (-0.5) or 0.3));
do return roofPal[M.clamp(__mfloor(l + 0.5), 1, 4)] end;
end);
for k = 0, 4 - 1 do
local a = (hash((k * 7), seed) * math.pi);
local L = (5 + (hash(seed, (k * 3)) * 6));
local x0 = ((W * 0.2) + ((hash(k, (seed + 1)) * W) * 0.6));
local y0 = ((H * 0.25) + ((hash((seed + 2), k) * H) * 0.5));
for i = 0, __mceil(L) - 1 do
repeat
local x = __mfloor(((x0 + (__mcos(a) * i)) - ((__mcos(a) * L) / 2)) + 0.5);
local y = __mfloor((y0 + ((__msin(a) * i) * 0.6)) + 0.5);
if ((((x < 0) or (x >= W)) or (y < 0)) or (y >= (H - 1))) then
do break end;
end;
c.fillStyle = M.INK;
c:fillRect(x, (y + 1), 1, 1);
if (__mfmod(i, 4) ~= 0) then c.fillStyle = M.PLANK[3]; else c.fillStyle = M.PLANK[4]; end;
c:fillRect(x, y, 1, 1);
until true;
end;
end;
end;
-- levels/farms:262
M.shadow = function(ctx, x, y, w, hh, a) if a == nil then a = 0.32 end;
ctx.globalAlpha = a;
ctx.fillStyle = "#05080a";
ctx:fillRect(__mfloor(x + 0.5), __mfloor(y + 0.5), __mfloor(w + 0.5), __mfloor(hh + 0.5));
ctx.globalAlpha = 1;
end;
-- levels/farms:270
M.drawBarn = function(ctx, p, g, h) 
local v = __mfmod((p.seed or __NaN), 3);
local W = ((p.w or __NaN) + 2);
local RH = 17;
local WH = 8;
local H = (RH + WH);
local x0 = (__mfloor((p.x or __NaN) + 0.5) - (W / 2));
local base = __mfloor(((p.y or __NaN) + ((p.h or __NaN) / 2)) + 0.5);
if (p.state == "up") then
local spr = h.sprite(("fm-barn" .. __str(v)), W, H, function(c) 
return M.paintHouse(c, {W=W, RH=RH, WH=WH, roof=((v == 2) and "thatch" or "shingle"), wall="plank", doors={[0]={x=(__shr(W, 1) - 4), w=8, h=6, kind=((v == 1) and "open" or "barn")}, length=1}, windows={[0]={x=4, y=2, w=2, h=2}, length=1}, seed=(v * 11)}, h.hash);
end);
M.shadow(ctx, (x0 + 3), (base - WH), W, (WH + 2));
M.blit(ctx, spr, x0, ((base - H) + 1), p, h, M.BT("barn"));
else
local Hh;
Hh = ((p.h or __NaN) + 4);
local spr = h.sprite(("fm-barnx" .. __str(v)), W, Hh, function(c) 
return M.paintRuin(c, W, Hh, ((v == 2) and M.THATCH or M.SHINGLE), M.PLANK, ((v * 5) + 2), h.hash, (v == 2));
end);
M.blit(ctx, spr, x0, ((base - Hh) + 1), p, h, M.BT("barn"));
end;
end;
-- levels/farms:285
M.paintHut = function(c, S, T, seed, hash) 
local cx = ((S / 2) - 0.5);
local ax = (cx - 0.5);
local ay = 1;
local ry = 3.6;
local wallH = 7;
local by = __mfloor((((T - 2) - wallH) - ry));
local rx = ((S / 2) - 0.6);
local R = M.HUT_THATCH;
local foot = __mfloor((((by + wallH) + ry) - 0.6));
M.paint(c, S, T, function(x, y) 
local dx = (x - cx);
local inRoof = false;
if (y >= by) then
inRoof = ((((dx / rx) ^ 2) + (((y - by) / ry) ^ 2)) < 1);
elseif (y >= ay) then
inRoof = (__mabs((x - ax)) <= (((rx * ((y - ay) + 1)) / ((by - ay) + 1)) + 0.3));
end;
if __T(inRoof) then
local ang = __matan2((x - ax), ((y - ay) + 0.01));
local streak = hash((__mfloor(((ang + 2) * 14)) + seed), 1);
local l = (((2.6 - (((x - cx) / rx) * 1.1)) - ((y > (by + 1)) and 0.6 or 0)) + ((streak - 0.5) * 1.2));
if ((y >= by) and ((((dx / rx) ^ 2) + (((y - by) / ry) ^ 2)) > 0.72)) then
l = (l - 0.9);
end;
if (y <= (ay + 1)) then
do return R[1] end;
end;
do return R[M.clamp(__mfloor(l + 0.5), 1, 4)] end;
end;
local rxw = (rx - 1.5);
local yy = (y - by);
local ryw = (ry - 0.6);
local inWall = ((yy > 0) and (function() if (yy <= wallH) then return (__mabs(dx) < rxw); else return ((((dx / rxw) ^ 2) + (((yy - wallH) / ryw) ^ 2)) < 1); end; end)());
if inWall then
if ((__mabs(dx) < 1.6) and (y >= (foot - 3))) then
if (y == (foot - 3)) then do return M.PLANK[0] end; else do return "#120c08" end; end;
end;
if (((dx > (-6.5)) and (dx < (-4.5))) and (y == (foot - 2))) then
do return "#1a1410" end;
end;
local l = (((3 - ((dx / rxw) * 1.4)) + ((hash(((x * 3) + seed), (y * 7)) - 0.5) * 1.1)) - ((y <= ((by + ry) + 1)) and 1.2 or 0));
do return M.MUD[M.clamp(__mfloor(l + 0.5), 1, 4)] end;
end;
do return nil end;
end);
end;
-- levels/farms:313
M.drawHut = function(ctx, p, g, h) 
local v = __mfmod((p.seed or __NaN), 2);
local S = 21;
local T = 23;
local x0 = (__mfloor((p.x or __NaN) + 0.5) - 10);
local top = ((__mfloor((p.y or __NaN) + 0.5) + 7) - T);
if (p.state == "up") then
local spr = h.sprite(("fm-hut" .. __str(v)), S, T, function(c) 
return M.paintHut(c, S, T, (v * 9), h.hash);
end);
M.shadow(ctx, (x0 + 4), (__mfloor((p.y or __NaN) + 0.5) - 1), (S - 2), 7, 0.28);
M.blit(ctx, spr, x0, top, p, h, M.BT("hut"));
if (not __T(p.burning)) then
local t = __mfmod(__mfloor((((g.t or __NaN) * 2) + (p.seed or __NaN))), 6);
ctx.globalAlpha = 0.45;
ctx.fillStyle = "#b8b0a0";
ctx:fillRect(((x0 + 9) + ((t > 2) and 1 or 0)), (top - t), 1, 1);
if (t > 1) then
ctx:fillRect(((x0 + 10) - ((t > 4) and 1 or 0)), ((top - 2) - t), 1, 1);
end;
ctx.globalAlpha = 1;
end;
else
local spr = h.sprite(("fm-hutx" .. __str(v)), S, 14, function(c) 
__I0.canopy(c, ((S / 2) - 0.5), 7, 5.8, __slice(M.HUT_THATCH, 1), ((v * 7) + 3), h.hash, 6);
for i = 0, 14 - 1 do
repeat
local a = ((i / 14) * M.TAU);
if (h.hash(i, (v + 5)) < 0.35) then
do break end;
end;
local x = __mfloor((((S / 2) - 0.5) + (__mcos(a) * 8)) + 0.5);
local y = __mfloor((7 + (__msin(a) * 5)) + 0.5);
c.fillStyle = M.INK;
c:fillRect(x, y, 2, 2);
c.fillStyle = M.MUD[(((a > (math.pi * 0.5)) and (a < (math.pi * 1.5))) and 3 or 2)];
c:fillRect(x, y, 1, 1);
until true;
end;
end);
M.blit(ctx, spr, x0, (__mfloor((p.y or __NaN) + 0.5) - 7), p, h, M.BT("hut"));
end;
end;
-- levels/farms:336
M.drawHay = function(ctx, p, g, h) 
local v = __mfmod((p.seed or __NaN), 3);
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
if (p.state == "up") then
local spr = h.sprite(("fm-hay" .. __str(v)), 11, 10, function(c) 
__I0.canopy(c, 5, 5, 4.4, __slice(M.HAY, 1), ((v * 17) + 1), h.hash, 6);
c.fillStyle = M.HAY[1];
c:fillRect(3, 8, 5, 1);
c.fillStyle = M.HAY[4];
c:fillRect(3, 3, 1, 1);
c:fillRect(5, 2, 1, 1);
c:fillRect(4, 3, 1, 1);
end);
M.shadow(ctx, (x - 2), (y + 1), 9, 2);
M.blit(ctx, spr, (x - 5), (y - 7), p, h, M.BT("hay"));
else
local spr = h.sprite(("fm-hayx" .. __str(v)), 13, 8, function(c) 
for i = 0, 26 - 1 do
local a = (h.hash(i, v) * M.TAU);
local r = (h.hash(v, i) * 5.5);
local px = __mfloor((6 + (__mcos(a) * r)) + 0.5);
local py = __mfloor((4 + ((__msin(a) * r) * 0.55)) + 0.5);
c.fillStyle = M.HAY[(1 + __mfmod(i, 4))];
c:fillRect(px, py, ((__mfmod(i, 3) ~= 0) and 1 or 2), 1);
end;
end);
M.blit(ctx, spr, (x - 6), (y - 4), p, h, M.BT("hay"));
end;
end;
-- levels/farms:361
M.drawCrop = function(ctx, p, g, h) 
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
local wheat = (p.kind == "wheat");
if (p.state == "up") then
local v = __mfmod((p.seed or __NaN), 4);
local spr;
if wheat then spr = h.sprite(("fm-wheat" .. __str(v)), 7, 7, function(c) 
for i = 0, 4 - 1 do
local sx = (((1 + i) + ((i > 1) and 1 or 0)) - ((h.hash(i, v) < 0.3) and 1 or 0));
local tall = (3 + __mfloor((h.hash(v, i) * 2.5)));
for k = 0, tall - 1 do
if (k == 0) then c.fillStyle = M.WHEAT[0]; else c.fillStyle = M.WHEAT[(1 + __band(i, 1))]; end;
c:fillRect(sx, (6 - k), 1, 1);
end;
if (i < 2) then c.fillStyle = M.WHEAT[4]; else c.fillStyle = M.WHEAT[3]; end;
c:fillRect(sx, (6 - tall), 1, 1);
c.fillStyle = M.WHEAT[3];
c:fillRect(sx, (7 - tall), 1, 1);
end;
end); else spr = h.sprite(("fm-cabbage" .. __str(v)), 7, 6, function(c) 
return M.paint(c, 7, 6, function(px, py) 
local dx = (px - 3);
local dy = ((py - 2.6) * 1.25);
local d = __hypot(dx, dy);
if (d > (2.9 + ((h.hash((px + v), py) - 0.5) * 0.6))) then
do return nil end;
end;
local l = (((2.2 - (((dx * 0.5) + (dy * 0.7)) / 2.6)) + ((h.hash(((px * 3) + v), py) - 0.5) * 0.8)) - ((d > 2.1) and 0.8 or 0));
do return M.CABB[M.clamp(__mfloor(l + 0.5), 1, 4)] end;
end, "out", "#16220e");
end); end;
if wheat then
ctx:drawImage(spr, (x - 3), (y - 6));
else
M.shadow(ctx, (x - 1), (y + 2), 5, 1, 0.25);
ctx:drawImage(spr, (x - 3), (y - 3));
end;
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, ((p.burnT or __NaN) / M.BT(p.kind)));
ctx:drawImage(h.tinted(spr, "#1a120c"), (wheat and (x - 3) or (x - 3)), (wheat and (y - 6) or (y - 3)));
ctx.globalAlpha = 1;
end;
else
local a8 = __mfmod(__mfloor(((__mfmod((__mfmod((p.fallA or __NaN), M.TAU) + M.TAU), M.TAU) / M.TAU) * 8) + 0.5), 8);
local ang = ((a8 / 8) * M.TAU);
local v = __mfmod((p.seed or __NaN), 2);
local spr = h.sprite(("fm-" .. __str(p.kind) .. "x" .. __str(a8) .. __str(v)), 9, 9, function(c) 
if wheat then
for i = 0, 3 - 1 do
local ox = (4 + __mfloor((((-__msin(ang)) * (i - 1)) * 1.4) + 0.5));
local oy = (4 + __mfloor(((__mcos(ang) * (i - 1)) * 1.4) + 0.5));
for k = 0, 4 - 1 do
if (k == 3) then c.fillStyle = M.WHEAT[3]; else c.fillStyle = M.WHEAT[(1 + __band(k, 1))]; end;
c:fillRect(__mfloor((ox + (__mcos(ang) * (k - 1))) + 0.5), __mfloor((oy + (__msin(ang) * (k - 1))) + 0.5), 1, 1);
end;
end;
else
for i = 0, 9 - 1 do
local a = (h.hash(i, (a8 + v)) * M.TAU);
local r = (h.hash((v + 3), i) * 3.4);
c.fillStyle = M.CABB[(1 + __mfmod(i, 4))];
c:fillRect(__mfloor(((4 + (__mcos(a) * r)) + (__mcos(ang) * 0.8)) + 0.5), __mfloor((4 + ((__msin(a) * r) * 0.7)) + 0.5), 1, 1);
end;
end;
end);
ctx:drawImage(spr, (x - 4), (y - 4));
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, ((p.burnT or __NaN) / M.BT(p.kind)));
ctx:drawImage(h.tinted(spr, "#1a120c"), (x - 4), (y - 4));
ctx.globalAlpha = 1;
end;
end;
end;
-- levels/farms:398
M.drawFence = function(ctx, p, g, h) 
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
local vert = ((p.w or __NaN) < (p.h or __NaN));
local key = ("fm-fence" .. (vert and "v" or "h") .. ((p.state == "up") and "" or ("x" .. __str(__mfmod((p.seed or __NaN), 2)))));
if (p.state == "up") then
local spr;
if vert then spr = h.sprite(key, 4, 12, function(c) 
c.fillStyle = M.INK;
c:fillRect(0, 0, 3, 12);
c.fillStyle = M.PLANK[3];
c:fillRect(1, 1, 1, 10);
c.fillStyle = M.PLANK[4];
c:fillRect(1, 1, 1, 2);
c:fillRect(1, 8, 1, 2);
c.fillStyle = "rgba(5,8,10,.3)";
c:fillRect(3, 2, 1, 10);
end); else spr = h.sprite(key, 10, 6, function(c) 
c.fillStyle = M.INK;
c:fillRect(0, 0, 10, 5);
c.fillStyle = M.PLANK[3];
c:fillRect(1, 1, 8, 1);
c:fillRect(1, 3, 8, 1);
c.fillStyle = M.PLANK[4];
c:fillRect(1, 0, 1, 4);
c:fillRect(8, 0, 1, 4);
c:clearRect(2, 2, 6, 1);
c:clearRect(2, 4, 6, 1);
c.fillStyle = M.INK;
c:fillRect(2, 2, 6, 1);
c:fillRect(2, 4, 6, 1);
c.fillStyle = "rgba(5,8,10,.3)";
c:fillRect(1, 5, 9, 1);
end); end;
if vert then
M.blit(ctx, spr, (x - 1), (y - 7), p, h, 3);
else
M.blit(ctx, spr, (x - 5), (y - 3), p, h, 3);
end;
else
local spr = h.sprite(key, 11, 9, function(c) 
for k = 0, 3 - 1 do
local a = (h.hash(k, __mfmod((p.seed or __NaN), 2)) * math.pi);
local L = (3 + __mfloor((h.hash((k + 4), __mfmod((p.seed or __NaN), 2)) * 3)));
for i = 0, L - 1 do
local px = __mfloor((5 + (__mcos(a) * (i - (L / 2)))) + 0.5);
local py = __mfloor((((4 + ((__msin(a) * (i - (L / 2))) * 0.7)) + k) - 1) + 0.5);
c.fillStyle = M.INK;
c:fillRect(px, (py + 1), 1, 1);
c.fillStyle = M.PLANK[3];
c:fillRect(px, py, 1, 1);
end;
end;
end);
M.blit(ctx, spr, (x - 5), (y - 4), p, h, 3);
end;
end;
-- levels/farms:444
M.drawBeast = function(ctx, c, h, key, frames, pal, dy, peck, t) if dy == nil then dy = 0 end; if peck == nil then peck = nil end; if t == nil then t = 0 end;
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
local fr = (__T(c.moving) and __mfmod(__mfloor(((c.walk or __NaN) * (((c.scared or __NaN) > 0) and 1.4 or 1))), 2) or 0);
local rows;
if (((__T(peck) and (not __T(c.moving))) and (__mfmod(__mfloor((((c.seed or __NaN) + ((c.walk or __NaN) * 3)) + (__T(c.hx) and c.hx or 0))), 3) == 0)) and (__msin(((t * 3) + (c.seed or __NaN))) > 0.4)) then rows = peck; else rows = frames[fr]; end;
local spr = M.mapSprite(h, (__str(key) .. __str(((rows == peck) and "p" or fr))), rows, pal, ((c.fx or __NaN) < 0));
local w = spr.width;
local hh = spr.height;
M.shadow(ctx, ((x - __shr(w, 1)) + 1), (y + 1), (w - 2), 1, 0.35);
local bob = ((__T(c.moving) and (fr ~= 0)) and 1 or 0);
local X = (x - __shr(w, 1));
local Y = ((((y - hh) + 2) + dy) - bob);
ctx:drawImage(spr, X, Y);
if ((c.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.7;
ctx:drawImage(h.tinted(spr, "#ffffff"), X, Y);
ctx.globalAlpha = 1;
end;
end;
-- levels/farms:465
M.corpse = function(key, rows, pal) 
do return function(ctx, c, h) 
local spr = M.mapSprite(h, key, rows, __assign(__assign({}, pal), M.DEAD_PAL), ((c.fx or __NaN) < 0));
ctx:drawImage(spr, (__mfloor((c.x or __NaN) + 0.5) - __shr(spr.width, 1)), ((__mfloor((c.y or __NaN) + 0.5) - (spr.height or __NaN)) + 3));
end end;
end;
-- levels/farms:484
M.drawSkel = function(key, frames, bite) 
do return function(ctx, a, g, h) 
local x = __mfloor((a.x or __NaN) + 0.5);
local y = __mfloor((a.y or __NaN) + 0.5);
local rows;
if ((a.swing or __NaN) > 0) then rows = bite; else rows = frames[(__T(a.moving) and __mfmod(__mfloor((a.walk or __NaN)), 2) or 0)]; end;
local spr = M.mapSprite(h, (__str(key) .. __str(((rows == bite) and "b" or ((rows == frames[1]) and 1 or 0)))), rows, M.BONE_PAL, ((a.fx or __NaN) < 0));
local X = (x - __shr(spr.width, 1));
local Y = (((y - (spr.height or __NaN)) + 2) - ((__T(a.moving) and (__mfmod(__mfloor((a.walk or __NaN)), 2) ~= 0)) and 1 or 0));
ctx:drawImage(spr, X, Y);
if (__mfmod(__mfloor((((g.t or __NaN) * 6) + (a.id or __NaN))), 5) == 0) then
ctx.globalAlpha = 0.5;
ctx:drawImage(h.tinted(spr, "#7cff8a"), X, Y);
ctx.globalAlpha = 1;
end;
if ((a.hit or __NaN) > 0) then
ctx.globalAlpha = 0.7;
ctx:drawImage(h.tinted(spr, "#ffffff"), X, Y);
ctx.globalAlpha = 1;
end;
end end;
end;
-- levels/farms:500
M.ground = function(ctx, m, h) 
local hash, vnoise;
local __t51 = h; hash = __t51.hash; vnoise = __t51.vnoise;
for y = 0, __mceil(m.h) - 1 do
for x = 0, __mceil(m.w) - 1 do
local n = (((vnoise((x / 30), (y / 30)) * 0.55) + (vnoise(((x / 9) + 40), (y / 9)) * 0.3)) + (hash(x, y) * 0.2));
local lvl = M.clamp(__mfloor((((n * 3.4) - 0.2) + (__band((x + y), 1) * 0.3))), 0, 3);
ctx.fillStyle = M.MEADOW[lvl];
ctx:fillRect(x, y, 1, 1);
end;
end;
for i = 0, __mceil(((m.w or __NaN) * 2)) - 1 do
local x = __mfloor((hash(i, 17) * (m.w or __NaN)));
local y = __mfloor((hash(i, 23) * (m.h or __NaN)));
local k = hash(i, 5);
ctx.fillStyle = ((k < 0.06) and "#e8d23a" or ((k < 0.1) and "#f4ecd2" or ((k < 0.13) and "#ee8fbf" or ((k < 0.6) and "#56763a" or "#26381e"))));
ctx:fillRect(x, y, 1, 1);
end;
do
local __t55, __t56 = __it((__T(m.yards) and m.yards or {length=0})), 0;
while __t56 < __t55.length do
local yd = __t55[__t56]; __t56 = __t56 + 1;
for y = __mfloor((((yd.y or __NaN) - (yd.ry or __NaN)) - 4)), (((yd.y or __NaN) + (yd.ry or __NaN)) + 4) do
for x = __mfloor((((yd.x or __NaN) - (yd.rx or __NaN)) - 4)), (((yd.x or __NaN) + (yd.rx or __NaN)) + 4) do
repeat
local d = (((((x - (yd.x or __NaN)) / (yd.rx or __NaN)) ^ 2) + (((y - (yd.y or __NaN)) / (yd.ry or __NaN)) ^ 2)) + ((vnoise((x / 6), (y / 6)) - 0.5) * 0.7));
if (d > 1) then
do break end;
end;
local k = hash((x * 3), (y * 5));
ctx.fillStyle = ((d > 0.8) and ((k < 0.5) and "#4a5230" or "#55502e") or ((k < 0.15) and "#4a3a26" or ((k < 0.85) and "#5e4c32" or "#6e5a3c")));
ctx:fillRect(x, y, 1, 1);
until true;
end;
end;
end;
end;
do
local __t60, __t61 = __it((__T(m.fields) and m.fields or {length=0})), 0;
while __t61 < __t60.length do
local f = __t60[__t61]; __t61 = __t61 + 1;
local wheat = (f.crop == "wheat");
for y = __mfloor((f.y0 or __NaN)), f.y1 do
for x = __mfloor((f.x0 or __NaN)), f.x1 do
repeat
if (__mabs((y - M.trackY(x))) < 5) then
do break end;
end;
local edge = (((((x - (f.x0 or __NaN)) < 1) or (((f.x1 or __NaN) - x) < 1)) or ((y - (f.y0 or __NaN)) < 1)) or (((f.y1 or __NaN) - y) < 1));
local row = __mfmod((y - __mfloor((f.y0 or __NaN))), 3);
local k = hash((x * 7), (y * 3));
local col = ((row == 0) and "#3a2a1a" or ((row == 1) and ((k < 0.5) and "#5a4228" or "#644a2c") or ((k < 0.5) and "#4c3822" or "#56402a")));
if ((wheat and (row ~= 0)) and (k > 0.82)) then
col = "#8a7434";
end;
if (((not wheat) and (row ~= 0)) and (k > 0.9)) then
col = "#3e5a2a";
end;
if edge then
col = ((k < 0.5) and "#3e4e28" or "#4a3a24");
end;
ctx.fillStyle = col;
ctx:fillRect(x, y, 1, 1);
until true;
end;
end;
end;
end;
local rut = function(x, y) 
ctx.fillStyle = ((hash(x, y) < 0.5) and "#4a3a26" or "#3e3020");
ctx:fillRect(x, y, 1, 1);
end;
local worn = function(x, y) 
if (hash((x * 3), y) < 0.55) then
ctx.fillStyle = ((hash(y, x) < 0.5) and "#5a4a30" or "#665438");
ctx:fillRect(x, y, 1, 1);
end;
end;
for x = 0, __mceil(m.w) - 1 do
local cy = __mfloor(M.trackY(x) + 0.5);
for dy = (-4), 4 do
if ((__mabs(dy) >= 3) or (hash(x, (dy + 50)) < 0.25)) then
worn(x, (cy + dy));
end;
end;
rut(x, (cy - 2));
rut(x, (cy + 2));
if (hash(x, 9) < 0.5) then
rut(x, ((cy - 3) + ((hash(x, 1) < 0.5) and 0 or 0)));
end;
end;
do
local __t67, __t68 = __it((__T(m.spurs) and m.spurs or {length=0})), 0;
while __t68 < __t67.length do
local s = __t67[__t68]; __t68 = __t68 + 1;
local L = __hypot(((s.x1 or __NaN) - (s.x0 or __NaN)), ((s.y1 or __NaN) - (s.y0 or __NaN)));
local nx = ((-((s.y1 or __NaN) - (s.y0 or __NaN))) / L);
local ny = (((s.x1 or __NaN) - (s.x0 or __NaN)) / L);
for i = 0, L do
local t = (i / L);
local wob = (__msin(((t * 5) + (s.x0 or __NaN))) * 3);
local x = (((s.x0 or __NaN) + (((s.x1 or __NaN) - (s.x0 or __NaN)) * t)) + (nx * wob));
local y = ((s.y0 or __NaN) + (((s.y1 or __NaN) - (s.y0 or __NaN)) * t));
worn(__mfloor(x + 0.5), __mfloor(y + 0.5));
worn(__mfloor((x + 1) + 0.5), __mfloor(y + 0.5));
rut(__mfloor((x - 2) + 0.5), __mfloor(y + 0.5));
rut(__mfloor((x + 2) + 0.5), __mfloor(y + 0.5));
end;
end;
end;
end;

-- levels/farms:9
M.TAU = (math.pi * 2);
-- levels/farms:10
M.INK = "#14100c";
-- levels/farms:11
M.clamp = function(v, a, b) 
return (function() if (v < a) then return a; elseif (v > b) then return b; else return v; end; end)();
end;
-- levels/farms:15
M.CROP = {r=2, flammable=true, burnTime=3, spread=0.45, crushShare=0.5, slow=0.3, slowR=4};
-- levels/farms:16
M.BUILDING = {solid=true, flammable=true, crushShare=0.5, spread=0.3};
-- levels/farms:17
M.kinds = {wheat=__assignKV(__assign({}, M.CROP), "leaves", "#c8a64a", "value", {pts=8, venge=0.005, chaos=0.07}), cabbage=__assignKV(__assign({}, M.CROP), "burnTime", 4, "spread", 0.3, "leaves", "#6e9a44", "value", {pts=10, venge=0.005, chaos=0.07}), hay={r=4, flammable=true, burnTime=5, spread=0.6, crushShare=0.5, slow=0.4, slowR=6, leaves="#c4a858", value={pts=40, venge=0.03, chaos=0.4}}, fence={r=1, w=8, h=2, flammable=true, burnTime=3, spread=0.3, crushShare=0.5, leaves="#8a5a36", value={pts=5, venge=0.004, chaos=0.04}}, barn=__assignKV(__assign({}, M.BUILDING), "w", 34, "h", 18, "hp", 300, "burnTime", 11, "leaves", "#8a5a36", "value", {pts=260, venge=0.2, chaos=2.4}), hut=__assignKV(__assign({}, M.BUILDING), "r", 8, "hp", 180, "burnTime", 9, "leaves", "#a4845a", "value", {pts=180, venge=0.15, chaos=1.6})};
-- levels/farms:26
M.critters = {cow={r=3.5, hp=60, spd=6, flee=17, fear=42, raise="skel_cow", cry="kill", value={pts=200, venge=0.15, chaos=0.6}}, pig={r=2.5, hp=40, spd=8, flee=21, fear=40, raise="skel_pig", value={pts=150, venge=0.1, chaos=0.4}}, chicken={r=1.5, hp=10, spd=10, flee=30, fear=34, bits="cream", value={pts=60, venge=0.05, chaos=0.12}}};
-- levels/farms:33
M.adds = {skel_cow={name="BONE COW", hp=150, r=3, spd=24, dmg=24, rate=1.2, reach=4, sense=70}, skel_pig={name="BONE PIG", hp=90, r=2.5, spd=36, dmg=12, rate=0.7, reach=3, sense=70}};
-- levels/farms:41
M.trackY = function(x) 
return ((98 + (__msin((x / 95)) * 20)) + (__msin(((x / 37) + 1)) * 4));
end;
-- levels/farms:166
M.THATCH = {[0]="#3a2c14", "#5e4a22", "#83692e", "#a88a40", "#ccb05a", length=5};
-- levels/farms:167
M.SHINGLE = {[0]="#2a2420", "#4a4038", "#62564a", "#7a6c5a", "#96866e", length=5};
-- levels/farms:168
M.PLANK = {[0]="#2e1c12", "#4a2e1c", "#5e3b24", "#74492c", "#8a5a36", length=5};
-- levels/farms:169
M.MUD = {[0]="#4a3420", "#6a4c30", "#86643e", "#a4845a", "#bea072", length=5};
-- levels/farms:170
M.HUT_THATCH = {[0]="#2e2210", "#4e3a1a", "#6e5426", "#8e7234", "#ae9248", length=5};
-- levels/farms:171
M.HAY = {[0]="#5a4a1a", "#8a7430", "#b49c48", "#d8c068", "#f0dc8c", length=5};
-- levels/farms:172
M.DAUB = {[0]="#6e6450", "#a89c80", "#c8bc9e", "#ded4b8", "#eee6cc", length=5};
-- levels/farms:268
M.BT = function(k) 
return __orv((M.kinds[k] and M.kinds[k].burnTime), 8);
end;
-- levels/farms:359
M.WHEAT = {[0]="#6e5a24", "#977a30", "#b89838", "#d6b84c", "#ecd472", length=5};
-- levels/farms:360
M.CABB = {[0]="#1e3216", "#2e4a22", "#4f7a34", "#6e9a44", "#9cc46a", length=5};
-- levels/farms:429
M.COW_PAL = {h="#e6d9b8", L="#a06a43", B="#835233", D="#5a3622", W="#e8e0cc", H="#835233", e=M.INK, n="#d89a84", l="#3a2418", t="#4a2c1c"};
-- levels/farms:430
M.COW_PAL2 = __assignKV(__assign({}, M.COW_PAL), "L", "#ece6d6", "B", "#d4ccba", "D", "#9a9284", "W", "#2a2420", "H", "#2a2420", "n", "#e0a8a0");
-- levels/farms:431
M.COW = {[0]={[0]=".........h.h.", ".LLLLLLLLHHH.", "tBWWBBBBWHeHn", "t.BWBBBBBDHnn", "..DDBBBDD....", "..l.l..l.l...", length=6}, {[0]=".........h.h.", ".LLLLLLLLHHH.", "tBWWBBBBWHeHn", "t.BWBBBBBDHnn", "..DDBBBDD....", "...l.l..l.l..", length=6}, length=2};
-- levels/farms:435
M.PIG_PAL = {E="#c06a72", L="#f4b4b0", P="#e2948e", D="#b86a66", S="#c87a7a", e=M.INK, t="#c87a7a", l="#8a4a48"};
-- levels/farms:436
M.PIG = {[0]={[0]=".......E..", ".LLLLLLLE.", "tPPPPPPPeS", ".DPPPPPPPS", "..DDPPDD..", "..l.l..l.l", length=6}, {[0]=".......E..", ".LLLLLLLE.", "tPPPPPPPeS", ".DPPPPPPPS", "..DDPPDD..", "...l.l..l.", length=6}, length=2};
-- levels/farms:440
M.HEN_PAL = {r="#d8473a", W="#f2efe2", w="#c8c0ac", y="#e8b83a", e=M.INK};
-- levels/farms:441
M.HEN = {[0]={[0]="..r.", "..We", "WWWy", ".ww.", ".y..", length=5}, {[0]="..r.", "..We", "WWWy", ".ww.", "..y.", length=5}, length=2};
-- levels/farms:442
M.HEN_PECK = {[0]="....", "..r.", "WWWe", ".wwy", ".y..", length=5};
-- levels/farms:456
M.drawCow = function(ctx, c, g, h) 
return M.drawBeast(ctx, c, h, ("fm-cow" .. ((__mfmod((c.seed or __NaN), 3) == 0) and "b" or "a")), M.COW, ((__mfmod((c.seed or __NaN), 3) == 0) and M.COW_PAL2 or M.COW_PAL));
end;
-- levels/farms:457
M.drawPig = function(ctx, c, g, h) 
return M.drawBeast(ctx, c, h, "fm-pig", M.PIG, M.PIG_PAL);
end;
-- levels/farms:458
M.drawHen = function(ctx, c, g, h) 
return M.drawBeast(ctx, c, h, "fm-hen", M.HEN, M.HEN_PAL, 0, M.HEN_PECK, g.t);
end;
-- levels/farms:461
M.COW_DEAD = {[0]="..l.l..l.l...", "..l.l..l.l...", ".LLLLLLLLHH..", "tBWWBBBBWHeHn", ".DDBBBBBDDHnn", "...rr.rrr....", length=6};
-- levels/farms:462
M.PIG_DEAD = {[0]="..l.l..l.l", ".LLLLLLLE.", "tPPPPPPPeS", ".DDPPPPDDS", "..rr.rr...", length=5};
-- levels/farms:463
M.HEN_DEAD = {[0]="W..w.", ".WWr.", "w.rWy", ".r...", length=4};
-- levels/farms:464
M.DEAD_PAL = {r="#a3201a"};
-- levels/farms:473
M.BONE_PAL = {b="#e8e2cc", B="#b8b09a", s="#f2efe2", g="#7cff8a", x="#2a2420", h="#a8977a"};
-- levels/farms:474
M.SKEL_COW = {[0]={[0]=".........h.h.", ".bbbbbbbbsss.", "b.BxBxBxBsgss", "..BxBxBxB.ss.", "..bb...bb....", "..b.B..b.B...", length=6}, {[0]=".........h.h.", ".bbbbbbbbsss.", "b.BxBxBxBsgss", "..BxBxBxB.ss.", "..bb...bb....", "...B.b..B.b..", length=6}, length=2};
-- levels/farms:478
M.SKEL_COW_BITE = {[0]=".........h.h.", ".bbbbbbbbsss.", "b.BxBxBxBsgsss", "..BxBxBxB.x...", "..bb...bb.sss.", "..b.B..b.B....", length=6};
-- levels/farms:479
M.SKEL_PIG = {[0]={[0]=".......b..", ".bbbbbbsb.", "b.BxBxBsgs", "..BxBxB.ss", "..b.B.b.B.", length=5}, {[0]=".......b..", ".bbbbbbsb.", "b.BxBxBsgs", "..BxBxB.ss", "...B.b.B.b", length=5}, length=2};
-- levels/farms:483
M.SKEL_PIG_BITE = {[0]=".......b...", ".bbbbbbsb..", "b.BxBxBsgss", "..BxBxB..x.", "..b.B.b.Bss", length=5};
-- levels/farms:499
M.MEADOW = {[0]="#2e4224", "#364c29", "#3f562f", "#4a6336", length=4};
M.default = {n=3, id="farms", name="THE FARMS", sub="TRAMPLE THE CROPS. BURN THE BARNS. SCATTER THE HERDS.", mode="chaos", kinds=M.kinds, critters=M.critters, adds=M.adds, build=function(g, rng, P) 
do return M.build(g, rng, P) end;
end, art={ground=M.ground, props={barn=M.drawBarn, hut=M.drawHut, hay=M.drawHay, wheat=M.drawCrop, cabbage=M.drawCrop, fence=M.drawFence}, critters={cow=M.drawCow, pig=M.drawPig, chicken=M.drawHen}, corpses={cow=function(ctx, c, h) 
return M.corpse(("fm-cowd" .. __str(0)), M.COW_DEAD, M.COW_PAL)(ctx, c, h);
end, pig=M.corpse("fm-pigd", M.PIG_DEAD, M.PIG_PAL), chicken=M.corpse("fm-hend", M.HEN_DEAD, M.HEN_PAL)}, adds={skel_cow=M.drawSkel("fm-skcow", M.SKEL_COW, M.SKEL_COW_BITE), skel_pig=M.drawSkel("fm-skpig", M.SKEL_PIG, M.SKEL_PIG_BITE)}, canopy=false, theme={leash=false}}};
