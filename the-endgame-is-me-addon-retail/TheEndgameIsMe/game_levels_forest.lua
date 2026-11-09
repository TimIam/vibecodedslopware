-- Generated from the-endgame-is-me/js/levels/forest.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("levels/forest");
local __T, __assign, __band, __concat, __hypot, __it, __map, __orv, __push, __slice, __some, __str = RT["T"], RT["assign"], RT["band"], RT["concat"], RT["hypot"], RT["it"], RT["map"], RT.orv, RT["push"], RT["slice"], RT["some"], RT["str"];
local __NaN = 0 / 0;
local __mabs, __matan2, __mceil, __mcos, __mfloor, __mfmod, __mmin, __msin = math.abs, math.atan2, math.ceil, math.cos, math.floor, math.fmod, math.min, math.sin;

-- levels/forest:14
M.scatter = function(rng, n, x0, y0, x1, y1, gap, avoid) if avoid == nil then avoid = {length=0} end;
local out = {length=0};
do
local tries = 0;
while ((tries < (n * 30)) and (out.length < n)) do
repeat
local x = (x0 + (rng() * (x1 - x0)));
local y = (y0 + (rng() * (y1 - y0)));
if __some(avoid, function(a) 
return (__hypot(((a.x or __NaN) - x), ((a.y or __NaN) - y)) < (a.r or __NaN));
end) then
do break end;
end;
if __some(out, function(p) 
return (__hypot(((p.x or __NaN) - x), ((p.y or __NaN) - y)) < gap);
end) then
do break end;
end;
__push(out, {x=x, y=y});
until true;
tries = tries + 1;
end;
end;
do return out end;
end;
-- levels/forest:25
M.build = function(g, rng, P) 
local w = 960;
local h = 180;
local start = {x=46, y=98, face=0};
local glade = {[0]={x=start.x, y=start.y, r=40}, length=1};
for i = 0, 5 - 1 do
__push(glade, {x=(160 + (rng() * 760)), y=(40 + (rng() * 110)), r=(18 + (rng() * 14))});
end;
local trees = M.scatter(rng, 125, 12, 22, (w - 12), (h - 22), 13, glade);
do
local __t3, __t4 = __it(trees), 0;
while __t4 < __t3.length do
local t = __t3[__t4]; __t4 = __t4 + 1;
P.addProp(g, ((rng() < 0.6) and "pine" or "oak"), t.x, t.y);
end;
end;
do
local __t6, __t7 = __it(M.scatter(rng, 70, 12, 22, (w - 12), (h - 22), 7, __concat(__slice(glade, 0, 1), __map(trees, function(t) 
return __assign({}, t, {r=6});
end)))), 0;
while __t7 < __t6.length do
local t = __t6[__t7]; __t7 = __t7 + 1;
P.addProp(g, "bush", t.x, t.y);
end;
end;
do return {w=w, h=h, scroll="x", start=start} end;
end;
-- levels/forest:40
M.ground = function(ctx, m, h) 
local hash, vnoise;
local __t9 = h; hash = __t9.hash; vnoise = __t9.vnoise;
for y = 0, __mceil(m.h) - 1 do
for x = 0, __mceil(m.w) - 1 do
local n = (((vnoise((x / 26), (y / 26)) * 0.55) + (vnoise(((x / 8) + 30), (y / 8)) * 0.3)) + (hash(x, y) * 0.2));
local lvl = __mfloor((((n * 3.4) - 0.3) + (__band((x + y), 1) * 0.3)));
if (lvl <= 0) then ctx.fillStyle = M.GROUND.a; elseif (lvl == 1) then ctx.fillStyle = M.GROUND.b; elseif (lvl == 2) then ctx.fillStyle = M.GROUND.c; else ctx.fillStyle = M.GROUND.d; end;
ctx:fillRect(x, y, 1, 1);
end;
end;
for k = 0, 2 - 1 do
local y0 = (60 + (k * 60));
local ph = (k * 2.1);
for x = 0, __mceil(m.w) - 1 do
local cy = ((y0 + (__msin(((x / 70) + ph)) * 18)) + (__msin((x / 23)) * 4));
for dy = (-2), 2 do
if (hash(x, ((__mfloor(cy + 0.5) + dy) + (k * 99))) < (0.75 - (__mabs(dy) * 0.15))) then
ctx.fillStyle = M.GROUND.trail[__band((x + dy), 1)];
ctx:fillRect(x, (__mfloor(cy + 0.5) + dy), 1, 1);
end;
end;
end;
end;
for i = 0, __mceil(((m.w or __NaN) * 3)) - 1 do
local x = __mfloor((hash(i, 7) * (m.w or __NaN)));
local y = __mfloor((hash(i, 13) * (m.h or __NaN)));
if (hash(i, 3) < 0.2) then ctx.fillStyle = M.GROUND.moss; else ctx.fillStyle = M.GROUND.litter[__band(i, 3)]; end;
ctx:fillRect(x, y, 1, 1);
end;
end;
-- levels/forest:65
M.canopy = function(ctx, cx, cy, R, cols, seed, hash, lumps) if lumps == nil then lumps = 7 end;
local inside = function(x, y) 
local dx = ((x + 0.5) - cx);
local dy = ((y + 0.5) - cy);
local a = __matan2(dy, dx);
local j = (((hash((__mfloor(((a + 4) * lumps) + 0.5) + seed), seed) - 0.5) * R) * 0.35);
do return (__hypot(dx, dy) < (R + j)) end;
end;
for y = __mfloor(((cy - R) - 2)), ((cy + R) + 2) do
for x = __mfloor(((cx - R) - 2)), ((cx + R) + 2) do
repeat
if (not inside(x, y)) then
do break end;
end;
local edge = ((((not inside((x - 1), y)) or (not inside((x + 1), y))) or (not inside(x, (y - 1)))) or (not inside(x, (y + 1))));
local l = (((((-(x - cx)) * 0.6) - ((y - cy) * 0.8)) / R) + ((hash(((x * 3) + seed), (y * 5)) - 0.5) * 0.55));
ctx.fillStyle = (edge and "#0e140c" or (function() if (l > 0.55) then return cols[3]; elseif (l > 0.05) then return cols[2]; elseif (l > (-0.45)) then return cols[1]; else return cols[0]; end; end)());
ctx:fillRect(x, y, 1, 1);
until true;
end;
end;
end;
-- levels/forest:82
M.drawTree = function(ctx, p, g, h, kind) if kind == nil then kind = p.kind end;
local v = __mfmod((p.seed or __NaN), 4);
local big = ((kind == "oak") and 7 or ((kind == "pine") and 6 or 3.4));
local S = __mceil(((big * 2) + 6));
local spr = h.sprite((__str(kind) .. __str(v)), S, S, function(c) 
local C = (S / 2);
if (kind == "pine") then
M.canopy(c, C, C, big, M.PINE, (v * 17), h.hash, 9);
M.canopy(c, (C - 0.5), (C - 0.5), (big * 0.62), __concat(__slice(M.PINE, 1), {[0]="#4a7e52", length=1}), ((v * 31) + 5), h.hash, 6);
c.fillStyle = "#6a9a62";
c:fillRect(__mfloor((C - 1)), __mfloor((C - 1)), 1, 1);
else
M.canopy(c, C, C, big, ((kind == "oak") and M.OAK or M.BUSH), (v * 23), h.hash, ((kind == "oak") and 6 or 5));
end;
end);
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
ctx.globalAlpha = 0.35;
ctx.fillStyle = "#05080a";
if ctx.beginPath then ctx:beginPath(); end;
ctx:fillRect(((x - big) + 2), (y - 1), ((big * 2) - 1), 3);
ctx.globalAlpha = 1;
local top = (((y - S) + 3) + ((kind == "bush") and 1 or 0));
if (kind ~= "bush") then
ctx.fillStyle = "#3a2618";
ctx:fillRect(x, (y - 3), 1, 3);
end;
ctx:drawImage(spr, (x - __mfloor((S / 2))), top);
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, (((p.burnT or __NaN) / M.KB(p)) * 0.9));
ctx:drawImage(h.tinted(spr, "#1a120c"), (x - __mfloor((S / 2))), top);
ctx.globalAlpha = 1;
end;
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.6;
ctx:drawImage(h.tinted(spr, "#ffffff"), (x - __mfloor((S / 2))), top);
ctx.globalAlpha = 1;
end;
end;
-- levels/forest:107
M.drawFallen = function(ctx, p, g, h) 
local x, y;
local a8 = __mfmod(__mfloor(((__mfmod((__mfmod((p.fallA or __NaN), M.TAU) + M.TAU), M.TAU) / M.TAU) * 8) + 0.5), 8);
local ang = ((a8 / 8) * M.TAU);
local v = __mfmod((p.seed or __NaN), 2);
local big = ((p.kind == "oak") and 6 or ((p.kind == "pine") and 5 or 3));
local L = ((p.kind == "bush") and 3 or 11);
local S = (2 * ((L + big) + 3));
local spr = h.sprite(("fallen-" .. __str(p.kind) .. __str(a8) .. __str(v)), S, S, function(c) 
local C = (S / 2);
local ca = __mcos(ang);
local sa = __msin(ang);
if (p.kind ~= "bush") then
for i = 0, L do
local x = __mfloor((C + (ca * i)) + 0.5);
local y = __mfloor((C + (sa * i)) + 0.5);
c.fillStyle = "#0e140c";
c:fillRect((x - 1), y, 3, 2);
c.fillStyle = ((__mfmod(i, 3) ~= 0) and "#5a3a22" or "#6e4a2a");
c:fillRect(x, y, 1, 1);
c:fillRect(x, (y + 1), 1, 1);
end;
end;
M.canopy(c, (C + (ca * (L + (big * 0.4)))), (C + (sa * (L + (big * 0.4)))), (big * 0.85), ((p.kind == "pine") and M.PINE or ((p.kind == "oak") and M.OAK or M.BUSH)), ((a8 * 7) + v), h.hash, 5);
c.fillStyle = "#d8c39a";
c:fillRect((__mfloor(C + 0.5) - 1), (__mfloor(C + 0.5) - 1), 1, 1);
c:fillRect((__mfloor(C + 0.5) + 1), __mfloor(C + 0.5), 1, 1);
end);
x = (__mfloor((p.x or __NaN) + 0.5) - (S / 2));
y = (__mfloor((p.y or __NaN) + 0.5) - (S / 2));
ctx:drawImage(spr, x, y);
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, (((p.burnT or __NaN) / M.KB(p)) * 0.9));
ctx:drawImage(h.tinted(spr, "#1a120c"), x, y);
ctx.globalAlpha = 1;
end;
end;
-- levels/forest:126
M.drawProp = function(ctx, p, g, h) 
if (p.state == "up") then
M.drawTree(ctx, p, g, h);
else
M.drawFallen(ctx, p, g, h);
end;
end;

-- levels/forest:4
M.TAU = (math.pi * 2);
-- levels/forest:6
M.TREE = {flammable=true, burnTime=7, spread=0.25, crushShare=0.5};
-- levels/forest:7
M.kinds = {pine=__assign({}, M.TREE, {r=3, slow=0.45, slowR=9, leaves="needle", value={pts=120, venge=0.12, chaos=1}}), oak=__assign({}, M.TREE, {r=4, slow=0.45, slowR=10, burnTime=8, leaves="leaf", value={pts=150, venge=0.14, chaos=1.2}}), bush=__assign({}, M.TREE, {r=2, slow=0.25, slowR=5, burnTime=3, leaves="leaf", value={pts=30, venge=0.04, chaos=0.25}})};
-- levels/forest:38
M.GROUND = {a="#22301b", b="#2a3a20", c="#334526", d="#3e5230", litter={[0]="#5a4a2a", "#6e5a32", "#4a3a22", "#7a6a3a", length=4}, moss="#4e6a2e", trail={[0]="#4a3d29", "#5a4a32", length=2}};
-- levels/forest:79
M.PINE = {[0]="#12261a", "#1b3a26", "#265034", "#356842", length=4};
M.OAK = {[0]="#1e3216", "#2c4a1e", "#3e6428", "#56803a", length=4};
M.BUSH = {[0]="#24361a", "#34501f", "#466a2a", "#5e8a38", length=4};
-- levels/forest:104
M.KB = function(p) 
return __orv((M.kinds[p.kind] and M.kinds[p.kind].burnTime), 7);
end;
M.default = {n=2, id="forest", name="THE LOW WOOD", sub="WRECK THE TREES. VENGEANCE FILLS, CHAOS RISES.", mode="chaos", kinds=M.kinds, build=function(g, rng, P) 
do return M.build(g, rng, P) end;
end, art={ground=M.ground, props={pine=M.drawProp, oak=M.drawProp, bush=M.drawProp}, canopy=false, theme={leash=false}}};
