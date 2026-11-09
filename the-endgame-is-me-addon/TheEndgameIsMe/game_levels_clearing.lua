-- Generated from the-endgame-is-me/js/levels/clearing.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("levels/clearing");
local __I0 = RT.module("levels/forest");
local __forEach, __it, __push = RT["forEach"], RT["it"], RT["push"];
local __NaN = 0 / 0;
local __mceil, __mcos, __mfloor, __mfmod, __msin = math.ceil, math.cos, math.floor, math.fmod, math.sin;

-- levels/clearing:9
M.leashRing = function(m, leash, step) 
local A, B;
local __t1 = m; A = __t1.A; B = __t1.B;
local len = ((B.x or __NaN) - (A.x or __NaN));
local arc = (math.pi * leash);
local per = ((2 * len) + (2 * arc));
local out = {length=0};
do
local s = 0;
while (s < per) do
local x;
local y;
local nx;
local ny;
if (s < len) then
x = ((A.x or __NaN) + s);
y = ((A.y or __NaN) - leash);
nx = 0;
ny = (-1);
elseif (s < (len + arc)) then
local k = (((s - len) / leash) - (math.pi / 2));
x = ((B.x or __NaN) + (__mcos(k) * leash));
y = ((B.y or __NaN) + (__msin(k) * leash));
nx = __mcos(k);
ny = __msin(k);
elseif (s < ((2 * len) + arc)) then
x = ((B.x or __NaN) - ((s - len) - arc));
y = ((A.y or __NaN) + leash);
nx = 0;
ny = 1;
else
local k = ((((s - (2 * len)) - arc) / leash) + (math.pi / 2));
x = ((A.x or __NaN) + (__mcos(k) * leash));
y = ((A.y or __NaN) + (__msin(k) * leash));
nx = __mcos(k);
ny = __msin(k);
end;
__push(out, {x=x, y=y, nx=nx, ny=ny});
s = (s + step);
end;
end;
do return out end;
end;
-- levels/clearing:23
M.standingStone = function(ctx, x, y, tall, hash, seed) 
ctx.fillStyle = "rgba(8,10,6,.45)";
ctx:fillRect((x - 1), (y + 1), 4, 1);
ctx.fillStyle = "#14100c";
ctx:fillRect((x - 1), ((y - tall) - 1), 4, (tall + 2));
for j = 0, __mceil(tall) - 1 do
for i = 0, 2 - 1 do
local l = ((((i == 0) and 0.5 or (-0.1)) + ((j < 2) and 0.3 or 0)) + ((hash((((x * 7) + i) + seed), (y + j)) - 0.5) * 0.5));
if (l > 0.6) then ctx.fillStyle = M.STONE[3]; elseif (l > 0.2) then ctx.fillStyle = M.STONE[2]; else ctx.fillStyle = M.STONE[1]; end;
ctx:fillRect((x + i), ((y - tall) + j), 1, 1);
end;
end;
if (hash(seed, 3) < 0.3) then
ctx.fillStyle = "#4f6a32";
ctx:fillRect((x + 1), (y - 1), 1, 1);
end;
end;
-- levels/clearing:33
M.cairn = function(ctx, x, y, hash, seed) 
ctx.fillStyle = "rgba(8,10,6,.45)";
ctx:fillRect((x - 2), (y + 1), 6, 1);
local rocks = {[0]={[0]=(-2), 0, 2, length=3}, {[0]=1, 0, 2, length=3}, {[0]=(-1), (-2), 2, length=3}, {[0]=0, (-4), 1, length=3}, length=4};
do
local __t5, __t6 = __it(rocks), 0;
while __t6 < __t5.length do
local __t8 = __t5[__t6]; __t6 = __t6 + 1; local dx, dy, s; dx = __t8[0]; dy = __t8[1]; s = __t8[2];
ctx.fillStyle = "#14100c";
ctx:fillRect(((x + dx) - 1), ((y + dy) - 1), (s + 2), (s + 1));
end;
end;
do
local __t9, __t10 = __it(rocks), 0;
while __t10 < __t9.length do
local __t12 = __t9[__t10]; __t10 = __t10 + 1; local dx, dy, s; dx = __t12[0]; dy = __t12[1]; s = __t12[2];
ctx.fillStyle = M.STONE[2];
ctx:fillRect((x + dx), ((y + dy) - 1), s, s);
ctx.fillStyle = M.STONE[3];
ctx:fillRect((x + dx), ((y + dy) - 1), 1, 1);
end;
end;
end;
-- levels/clearing:41
M.decorate = function(ctx, m, h) 
local ring = M.leashRing(m, 60, 9);
__forEach(ring, function(p, i) 
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
if ((((x < 3) or (x > 316)) or (y < 40)) or (y > 160)) then
do return end;
end;
if (__mfmod(i, 4) == 2) then
M.cairn(ctx, x, y, h.hash, i);
else
M.standingStone(ctx, x, y, ((__mfmod(i, 4) == 0) and 4 or 3), h.hash, i);
end;
end);
local k = 0;
do
local __t13, __t14 = __it(M.leashRing(m, 74, 15)), 0;
while __t14 < __t13.length do
repeat
local p = __t13[__t14]; __t14 = __t14 + 1;
local out = (4 + (h.hash(k, 9) * 8));
local x = ((p.x or __NaN) + ((p.nx or __NaN) * out));
local y = ((p.y or __NaN) + ((p.ny or __NaN) * out));
k = k + 1;
if ((((x < 6) or (x > 314)) or (y < 46)) or (y > 156)) then
do break end;
end;
__I0.drawTree(ctx, {x=x, y=y, seed=(k * 7), burning=false, hitT=0}, nil, h, ((__mfmod(k, 3) ~= 0) and "pine" or "oak"));
until true;
end;
end;
end;

-- levels/clearing:6
M.TAU = (math.pi * 2);
-- levels/clearing:22
M.STONE = {[0]="#3f403a", "#6b6c63", "#8f8f84", "#b9b7a6", length=4};
M.default = {n=1, id="clearing", name="THE CLEARING", sub="WALK BETWEEN THE ROCKS. DO NOT LEAVE THE HENGE.", mode="patrol", art={decorate=M.decorate, canopy=true, theme={leash=true}}};
