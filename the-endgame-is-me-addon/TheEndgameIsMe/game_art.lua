-- Generated from the-endgame-is-me/js/art.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("art");
local __Array, __Map, __Number, __T, __assign, __band, __ch, __get, __hypot, __it, __join, __map, __padStart, __pairs, __parseInt, __sarr, __set, __shr, __slice, __str, __toString, __toUpperCase = RT["Array"], RT["Map"], RT["Number"], RT["T"], RT["assign"], RT["band"], RT["ch"], RT["get"], RT["hypot"], RT["it"], RT["join"], RT["map"], RT["padStart"], pairs, RT["parseInt"], RT["sarr"], RT["set"], RT["shr"], RT["slice"], RT["str"], RT["toString"], RT["toUpperCase"];
local __NaN = 0 / 0;
local __mabs, __matan2, __mceil, __mcos, __mfloor, __mfmod, __mmax, __mmin, __msin = math.abs, math.atan2, math.ceil, math.cos, math.floor, math.fmod, math.max, math.min, math.sin;

-- art:41
M.textWidth = function(s, scale) if scale == nil then scale = 1 end;
do return (((s.length or #s) ~= 0) and ((((s.length or #s) * 4) - 1) * scale) or 0) end;
end;
-- art:44
M.drawText = function(ctx, s, x, y, col, __t3) if __t3 == nil then __t3 = {} end; local scale, align, shadow, alpha; scale = __t3.scale; if scale == nil then scale = 1 end; align = __t3.align; if align == nil then align = "left" end; shadow = __t3.shadow; if shadow == nil then shadow = true end; alpha = __t3.alpha; if alpha == nil then alpha = 1 end;
s = __toUpperCase(__str(s));
local w = M.textWidth(s, scale);
local x0 = __mfloor(((align == "center") and (x - (w / 2)) or ((align == "right") and (x - w) or x)) + 0.5);
local y0 = __mfloor(y + 0.5);
ctx.globalAlpha = alpha;
local pass = function(dx, dy, c) 
ctx.fillStyle = c;
for i = 0, #s - 1 do
local bits = (__T(M.GLYPH_BITS[__ch(s, i)]) and M.GLYPH_BITS[__ch(s, i)] or M.GLYPH_BITS["?"]);
local gx = ((x0 + ((i * 4) * scale)) + dx);
for r = 0, 5 - 1 do
for c2 = 0, 3 - 1 do
if __T(bits[((r * 3) + c2)]) then
ctx:fillRect((gx + (c2 * scale)), ((y0 + (r * scale)) + dy), scale, scale);
end;
end;
end;
end;
end;
if __T(shadow) then
pass(0, scale, M.PAL.ink);
pass(scale, scale, M.PAL.ink);
end;
pass(0, 0, (__T(M.PAL[col]) and M.PAL[col] or col));
ctx.globalAlpha = 1;
end;
-- hash: replaced by the build
M.hash = RT.hash;
-- art:91
M.distSeg = function(px, py, ax, ay, bx, by) 
local dx = (bx - ax);
local dy = (by - ay);
local t = __mmax(0, __mmin(1, ((((px - ax) * dx) + ((py - ay) * dy)) / ((dx * dx) + (dy * dy)))));
do return {[0]=__hypot((px - (ax + (dx * t))), (py - (ay + (dy * t)))), t, length=2} end;
end;
-- art:97
M.distPoly = function(px, py, pts) 
local best = math.huge;
local at = 0;
for i = 0, ((pts.length or #pts) - 1) - 1 do
local d, t;
local __t8 = M.distSeg(px, py, pts[i][0], pts[i][1], pts[(i + 1)][0], pts[(i + 1)][1]); d = __t8[0]; t = __t8[1];
if (d < best) then
best = d;
at = ((i + t) / ((pts.length or #pts) - 1));
end;
end;
do return {[0]=best, at, length=2} end;
end;
-- art:119
M.material = function(lx, ly, frame, mouth, L) 
local ay = __mabs(ly);
local hx = ((L.neck == 3) and 4 or 0);
local X = (lx - hx);
local cyclops = (L.head == 1);
local croc = (L.head == 2);
local turtle = (L.head == 3);
local bird = (L.head == 4);
if cyclops then
local d = __hypot((X - 11.2), ly);
if (d < 0.9) then
do return "pupil" end;
end;
if (d < 2.1) then
do return "eyeWhite" end;
end;
elseif (turtle or bird) then
local d = __hypot((X - (turtle and 9.7 or 9.9)), (ay - (turtle and 3.9 or 3.6)));
if (d < 0.75) then
do return "pupil" end;
end;
if (d < 1.35) then
do return "eyeWhite" end;
end;
elseif (__hypot((X - (croc and 9.4 or 10.6)), (ay - (croc and 3.1 or 2.7))) < 1.05) then
do return "eye" end;
end;
if (L.horns == 0) then
for i = 0, (M.HORN.length - 1) - 1 do
local d, t;
local __t10 = M.distSeg(X, ay, M.HORN[i][0], M.HORN[i][1], M.HORN[(i + 1)][0], M.HORN[(i + 1)][1]); d = __t10[0]; t = __t10[1];
if (d < (1.9 - ((i + t) * 0.28))) then
do return ((i == 3) and "hornD" or "horn") end;
end;
end;
elseif (L.horns == 1) then
local d = __hypot((X - 7), (ay - 6.8));
if ((d > 1.3) and (d < 3.4)) then
do return ((d < 2.2) and "hornD" or "horn") end;
end;
elseif (L.horns == 2) then
do
local __t11, __t12 = __it(M.ANTLER), 0;
while __t12 < __t11.length do
local br = __t11[__t12]; __t12 = __t12 + 1;
if ((M.distPoly(X, ay, br)[0] or __NaN) < 0.8) then
do return "horn" end;
end;
end;
end;
end;
if croc then
if ((X > 10.5) and (X < 20.5)) then
local hw = (2.8 - ((X - 10.5) * 0.11));
if ((__T(mouth) and (X > 12)) and (ay < 1)) then
do return "mouth" end;
end;
if (ay < hw) then
do return (((ay > (hw - 0.9)) and (__mfmod(__mfloor(X), 2) == 0)) and "tooth" or "snoutC") end;
end;
end;
elseif (turtle or bird) then
local len = (turtle and 7.4 or 10.8);
local t = __mmax(0, ((X - 12.4) / len));
if ((t < 1) and (X > (12.4 - ((ay * ay) * (turtle and 0.13 or 0.11))))) then
local gap = (__T(mouth) and (0.3 + (2.2 * (t ^ 1.2))) or 0);
local hw = (turtle and ((4.3 * ((1 - t) ^ 0.55)) * (__T(mouth) and 0.8 or 1)) or (__T(mouth) and (1.9 - (t * 1.2)) or (3.1 * ((1 - t) ^ 0.9))));
if (ay < gap) then
if (t < 0.6) then
do return "mouth" end;
end;
elseif ((ay - gap) < hw) then
if turtle then
do return ((t > 0.7) and "beakGD" or (((ay - gap) < 0.8) and "beakGHi" or "beakG")) end;
end;
do return ((t > 0.84) and "beakYD" or (((ay - gap) < 0.7) and "beakYHi" or "beakY")) end;
end;
end;
else
if (((__T(mouth) and (X > 13.2)) and (X < 17)) and (ay < 1.6)) then
do return "mouth" end;
end;
if (__hypot((X - 15.1), (ay - 1.1)) < 0.65) then
do return "nostril" end;
end;
if (__hypot((X - 13.6), ly) < 2.9) then
do return "snout" end;
end;
end;
if (__hypot((X - 9), ly) < (cyclops and 6.2 or 5.7)) then
do return "head" end;
end;
if ((((L.neck == 3) and (lx > 2)) and (lx < 10)) and (ay < 3.4)) then
do return "neckFur" end;
end;
if (L.neck == 1) then
local a = __matan2(ly, (lx - 5));
if (__hypot((lx - 5), ly) < (8.4 + ((M.hash(__mfloor(((a + 4) * 6) + 0.5), 3) - 0.5) * 2.2))) then
do return "mane" end;
end;
end;
if (L.neck == 2) then
local d = (lx - 4.5);
if ((__mabs(d) < 1.4) and (ay < 10.2)) then
do return "leather" end;
end;
if (((ay >= 10.2) and (ay < 12.2)) and (__mabs(d) < (1.6 - ((ay - 10.2) * 0.75)))) then
do return "horn" end;
end;
do
local __t14, __t15 = __it({[0]=3, 7, length=2}), 0;
while __t15 < __t14.length do
local sy = __t14[__t15]; __t15 = __t15 + 1;
if (((d >= 1.4) and (d < 3.4)) and (__mabs((ay - sy)) < (1.3 - ((d - 1.4) * 0.6)))) then
do return "horn" end;
end;
end;
end;
end;
if (L.neck == 4) then
local d = __hypot((lx - 6.5), ly);
if ((((lx < 8.5) and (lx > 0)) and (d > 5)) and (d < 10.8)) then
do return ((__mfmod(__mfloor((__matan2(ly, (lx - 6.5)) * 5) + 0.5), 2) == 0) and "frillD" or "frill") end;
end;
end;
local bx = (lx + 2);
local ang = __matan2(ly, bx);
local j = ((M.hash(__mfloor(((ang + 4) * 7) + 0.5), 11) - 0.5) * 2.4);
local inBody = ((((bx * bx) / ((12.6 + j) ^ 2)) + ((ly * ly) / ((10.2 + (j * 0.8)) ^ 2))) < 1);
if (L.back == 1) then
do
local px = (-11);
while (px <= 3) do
local r = (2.7 - (__mabs((px + 4)) * 0.07));
local e = (__mabs((lx - px)) + (ay * 1.1));
if (e < r) then
do return ((e < (r - 1.1)) and "plateHi" or "plate") end;
end;
px = (px + 3.5);
end;
end;
elseif (L.back == 2) then
local e = ((((lx + 3) / 10.5) ^ 2) + ((ly / 8.6) ^ 2));
if (e < 1) then
local v = (ly / 3.3);
local u = (((lx + 3) / 3.8) + ((__mfmod(__mfloor(v + 0.5), 2) ~= 0) and 0.5 or 0));
do return ((((e > 0.8) or (__mabs((u - __mfloor(u + 0.5))) > 0.4)) or (__mabs((v - __mfloor(v + 0.5))) > 0.4)) and "shellD" or "shell") end;
end;
elseif (L.back == 3) then
do
local __t18, __t19 = __it({[0]={[0]=(-7), (-3), 2.2, length=3}, {[0]=(-2), 3.6, 1.9, length=3}, {[0]=(-9.5), 4, 1.6, length=3}, {[0]=1, (-4), 1.5, length=3}, {[0]=(-4), 0, 1.7, length=3}, length=5}), 0;
while __t19 < __t18.length do
local __t21 = __t18[__t19]; __t19 = __t19 + 1; local cx, cy, r; cx = __t21[0]; cy = __t21[1]; r = __t21[2];
if (__hypot((lx - cx), (ly - cy)) < r) then
do return ((M.hash((__mfloor((lx * 2) + 0.5) + 9), __mfloor((ly * 2) + 0.5)) > 0.72) and "capDot" or "cap") end;
end;
end;
end;
if (inBody and (M.hash((__mfloor(lx + 0.5) + 3), (__mfloor(ly + 0.5) + 7)) < 0.16)) then
do return "mossy" end;
end;
end;
if inBody then
do return "fur" end;
end;
if (L.back == 4) then
local r = __hypot(lx, (ay - 4.5));
local a = __matan2((ay - 4.5), lx);
if (((a > 1.5) and (a < 3.15)) and (r < 14)) then
local t = ((a - 1.5) / 1.65);
if (r < (14 - (3 * __mabs(__msin(((t * math.pi) * 3)))))) then
do
local __t22, __t23 = __it({[0]=0, 0.34, 0.67, 1, length=4}), 0;
while __t23 < __t22.length do
local q = __t22[__t23]; __t23 = __t23 + 1;
if ((__mabs((a - (1.5 + (q * 1.65)))) * r) < 0.7) then
do return "wingBone" end;
end;
end;
end;
do return "wing" end;
end;
end;
end;
local wag = ((({[0]=0, 1, 0, (-1), length=4})[frame] or __NaN) * 1.2);
if (L.tail == 0) then
if (((M.distSeg(lx, ly, (-13), 0, (-19), (1.5 + wag))[0] or __NaN) < 2.3) or (__hypot((lx + 20.5), ((ly - 2) - wag)) < 3)) then
do return "tail" end;
end;
elseif (L.tail == 1) then
local cx = (-20.4);
local cy = wag;
local d = __hypot((lx - cx), (ly - cy));
if (d < 3.2) then
do return "club" end;
end;
for k = 0, 6 - 1 do
local sa = ((k * math.pi) / 3);
if ((M.distSeg(lx, ly, (cx + (__mcos(sa) * 3)), (cy + (__msin(sa) * 3)), (cx + (__mcos(sa) * 4.6)), (cy + (__msin(sa) * 4.6)))[0] or __NaN) < 0.6) then
do return "horn" end;
end;
end;
if ((M.distSeg(lx, ly, (-13), 0, (-18), (wag * 0.8))[0] or __NaN) < 1.6) then
do return "tail" end;
end;
elseif (L.tail == 2) then
local pts = {[0]={[0]=(-13), 0, length=2}, {[0]=(-16.5), (0.5 + wag), length=2}, {[0]=(-19.5), (2.5 + wag), length=2}, {[0]=(-21), (6 + wag), length=2}, {[0]=(-19.5), (9.5 + wag), length=2}, length=5};
if (__hypot((lx + 18), ((ly - 11) - wag)) < 1.4) then
do return "sting" end;
end;
local d, at;
local __t26 = M.distPoly(lx, ly, pts); d = __t26[0]; at = __t26[1];
if (d < (2.3 - (at * 0.9))) then
do return ((__mfmod(__mfloor((at * 8)), 2) ~= 0) and "tailSeg" or "tail") end;
end;
elseif (L.tail == 3) then
local pts = {[0]={[0]=(-13), 0, length=2}, {[0]=(-17), ((-1.5) + wag), length=2}, {[0]=(-21), (1 + (wag * 1.6)), length=2}, {[0]=(-23.5), (2.5 + (wag * 2)), length=2}, length=4};
local d, at;
local __t27 = M.distPoly(lx, ly, pts); d = __t27[0]; at = __t27[1];
if (d < (1.3 - (at * 0.5))) then
do return ((at > 0.85) and "tailTip" or "tail") end;
end;
elseif (L.tail == 4) then
local e = ((((lx + 18.5) / 6) ^ 2) + (((ly - wag) / 3.8) ^ 2));
if (e < 1) then
do return ((lx < (-22.2)) and "tailWhite" or "tail") end;
end;
end;
local G = (__T(M.GAITS[L.legs]) and M.GAITS[L.legs] or M.GAITS[0]);
local ph = ((({[0]=0, 2.2, 0, (-2.2), length=4})[frame] or __NaN) * (G.swing or __NaN));
for i = 0, ((G.at.length or #G.at) * 2) - 1 do
repeat
local side = ((__band(i, 1) ~= 0) and (-1) or 1);
local n = __shr(i, 1);
local sw = (((__band(n, 1) ~= 0) and (-1) or 1) * side);
local fx = G.at[n];
local s = G.size;
local cx = (fx + (ph * sw));
local cy = (side * (G.y or __NaN));
if (L.limbs == 3) then
do
local t = 0;
while (t <= 1) do
local tx = (((fx + ((ph * sw) * 0.4)) + ((__msin((((t * 3.2) + (frame * 1.6)) + fx)) * 2.4) * (G.wriggle or __NaN))) + (((fx * (G.fan or __NaN)) * t) * 2));
local ty = (side * (6.5 + (t * 9)));
if (__hypot((lx - tx), (ly - ty)) < ((2 - (t * 1.2)) * (G.tent or __NaN))) then
do return ((M.hash(__mfloor((lx * 2) + 0.5), __mfloor((ly * 2) + 0.5)) > 0.8) and "tentacleD" or "tentacle") end;
end;
t = (t + 0.1);
end;
end;
do break end;
end;
if ((L.limbs == 1) and (__hypot(((lx - cx) - (1.6 * s)), ((ly - cy) - ((side * 1.1) * s))) < (1.7 * s))) then
do return "hoof" end;
end;
if (L.limbs == 2) then
local ox = (cx + (1.4 * s));
local oy = (cy + ((side * 1.2) * s));
do
local __t30, __t31 = __it((((G.at.length or #G.at) == 4) and {[0]={[0]=4.4, (-0.2), length=2}, {[0]=1.4, 4, length=2}, length=2} or {[0]={[0]=4, (-0.2), length=2}, {[0]=3.6, 2.2, length=2}, {[0]=0.8, 3.6, length=2}, length=3})), 0;
while __t31 < __t30.length do
local __t33 = __t30[__t31]; __t31 = __t31 + 1; local tx, ty; tx = __t33[0]; ty = __t33[1];
if ((M.distSeg(lx, ly, ox, oy, (ox + (tx * s)), (oy + ((side * ty) * s)))[0] or __NaN) < 0.6) then
do return "talon" end;
end;
end;
end;
end;
if ((L.limbs == 0) and (__hypot(((lx - cx) - (2.6 * s)), ((ly - cy) - ((side * 1.4) * s))) < 1.15)) then
do return "claw" end;
end;
if (__hypot((lx - cx), (ly - cy)) < (((L.limbs == 2) and 2.6 or 3.1) * s)) then
do return "leg" end;
end;
if (__T(G.fan) and ((M.distSeg(lx, ly, (fx * (1 - (G.fan or __NaN))), (side * 5), cx, cy)[0] or __NaN) < (1.9 * s))) then
do return "leg" end;
end;
until true;
end;
do return nil end;
end;
-- art:279
M.buildSprite = function(dir, frame, mouth, L) 
local N = M.BOSS_SIZE;
local C = (N / 2);
local a = (((dir / M.BOSS_DIRS) * math.pi) * 2);
local ca = __mcos(a);
local sa = __msin(a);
local mat = __Array((N * N));
for y = 0, __mceil(N) - 1 do
for x = 0, __mceil(N) - 1 do
local sx = ((x + 0.5) - C);
local sy = ((y + 0.5) - C);
local lx = ((sx * ca) + (sy * sa));
local ly = (((-sx) * sa) + (sy * ca));
local k = M.material(lx, ly, frame, mouth, L);
mat[((y * N) + x)] = (__T(k) and {k=k, lx=lx, ly=ly, sx=sx, sy=sy});
end;
end;
local cv = M.newCanvas(N, N);
local cx = cv:getContext("2d");
for y = 0, __mceil(N) - 1 do
for x = 0, __mceil(N) - 1 do
repeat
local p = mat[((y * N) + x)];
if (not __T(p)) then
do break end;
end;
local edge = ((((((x == 0) or (x == (N - 1))) or (not __T(mat[(((y * N) + x) - 1)]))) or (not __T(mat[(((y * N) + x) + 1)]))) or (not __T(mat[(((y - 1) * N) + x)]))) or (not __T(mat[(((y + 1) * N) + x)])));
if edge then cx.fillStyle = (__T(M.BONE[p.k]) and M.BONE[p.k] or M.PAL.ink); else cx.fillStyle = M.shade(p, L.F); end;
cx:fillRect(x, y, 1, 1);
until true;
end;
end;
do return cv end;
end;
-- art:301
M.makeBossSprites = function(look) 
local L = __assign({head=0, horns=0, neck=0, back=0, tail=0, limbs=0, legs=0}, look);
L.F = M.furRamp(L.fur);
local cache = __Map();
do return {key=M.bossKey(L), get=function(dir, idx) 
local k = ((dir * 8) + idx);
local s = __get(cache, k);
if (not __T(s)) then
__set(cache, k, (function() s = M.buildSprite(dir, __band(idx, 3), __shr(idx, 2), L); return s end)());
end;
do return s end;
end} end;
end;
-- art:321
M.furRamp = function(hex) 
if (not __T(hex)) then
do return {[0]=M.PAL.fur0, M.PAL.fur1, M.PAL.fur2, M.PAL.fur3, M.PAL.fur4, length=5} end;
end;
local h, s, l;
local __t38 = M.hexToHsl(hex); h = __t38[0]; s = __t38[1]; l = __t38[2];
do return __map(M.FUR_STEP, function(d, i) 
return M.hslToHex((h + ((i - 2) * (-4))), __mmin(1, (s * (1 + ((2 - i) * 0.06)))), __mmax(0.04, __mmin(0.96, (l + d))));
end) end;
end;
-- art:326
M.hexToHsl = function(hex) 
local n = __parseInt(__slice(hex, 1), 16);
local r = (__shr(n, 16) / 255);
local g = (__band(__shr(n, 8), 255) / 255);
local b = (__band(n, 255) / 255);
local mx = __mmax(r, g, b);
local mn = __mmin(r, g, b);
local l = ((mx + mn) / 2);
local d = (mx - mn);
if (not (d ~= 0)) then
do return {[0]=0, 0, l, length=3} end;
end;
local s = (d / (1 - __mabs(((2 * l) - 1))));
local h = ((mx == r) and __mfmod((((g - b) / d) + 6), 6) or ((mx == g) and (((b - r) / d) + 2) or (((r - g) / d) + 4)));
do return {[0]=(h * 60), s, l, length=3} end;
end;
-- art:334
M.hslToHex = function(h, s, l) 
h = __mfmod((__mfmod(h, 360) + 360), 360);
local c = ((1 - __mabs(((2 * l) - 1))) * s);
local x = (c * (1 - __mabs((__mfmod((h / 60), 2) - 1))));
local m = (l - (c / 2));
local r, g, b;
local __t39 = ((h < 60) and {[0]=c, x, 0, length=3} or ((h < 120) and {[0]=x, c, 0, length=3} or ((h < 180) and {[0]=0, c, x, length=3} or ((h < 240) and {[0]=0, x, c, length=3} or ((h < 300) and {[0]=x, 0, c, length=3} or {[0]=c, 0, x, length=3}))))); r = __t39[0]; g = __t39[1]; b = __t39[2];
do return ("#" .. __join(__map({[0]=r, g, b, length=3}, function(v) 
return __padStart(__toString(__mfloor(((v + m) * 255) + 0.5), 16), 2, "0");
end), "")) end;
end;
-- art:341
M.shade = function(p, F) 
local light = ((((-(p.sx or __NaN)) * 0.55) - ((p.sy or __NaN) * 0.8)) / 14);
local n = M.hash((__mfloor((((p.lx or __NaN) * 0.9) + ((p.ly or __NaN) * 0.35)) + 0.5) + 40), (__mfloor((((p.ly or __NaN) * 0.85) - ((p.lx or __NaN) * 0.12)) + 0.5) + 90));
local two = function(hi, lo) 
if (light > 0.15) then do return hi end; else do return lo end; end;
end;
local lvl;
do
local __t40 = p.k;
if __t40 == "horn" or __t40 == "claw" or __t40 == "tooth" then
do return M.PAL.horn end;
elseif __t40 == "hornD" then
do return M.PAL.hornD end;
elseif __t40 == "eye" then
do return M.PAL.eye end;
elseif __t40 == "eyeWhite" then
do return "#f2efe2" end;
elseif __t40 == "pupil" then
do return M.PAL.ink end;
elseif __t40 == "mouth" then
do return M.PAL.mouth end;
elseif __t40 == "nostril" then
do return F[0] end;
elseif __t40 == "snout" then
if (light > 0.3) then do return F[4] end; else do return M.PAL.snout end; end;
elseif __t40 == "snoutC" then
do return two(F[3], F[2]) end;
elseif __t40 == "beakG" then
do return two("#a9aea8", "#868c86") end;
elseif __t40 == "beakGHi" then
do return "#bcc1ba" end;
elseif __t40 == "beakGD" then
do return "#5e635f" end;
elseif __t40 == "beakY" then
do return two("#f5c531", "#dfa522") end;
elseif __t40 == "beakYHi" then
do return "#ffe67e" end;
elseif __t40 == "beakYD" then
do return "#d98a1c" end;
elseif __t40 == "leg" then
if (light > 0.2) then do return F[2] end; else do return F[1] end; end;
elseif __t40 == "leather" then
do return "#3a2618" end;
elseif __t40 == "frill" then
do return two("#d8673f", "#c0533a") end;
elseif __t40 == "frillD" then
do return "#7e2a18" end;
elseif __t40 == "plate" then
do return "#8fb3c4" end;
elseif __t40 == "plateHi" then
do return "#c7e3ee" end;
elseif __t40 == "shell" then
do return two("#77843f", "#5f6b34") end;
elseif __t40 == "shellD" then
do return "#36401c" end;
elseif __t40 == "cap" then
do return two("#d0432f", "#a82c20") end;
elseif __t40 == "capDot" then
do return "#f2efe2" end;
elseif __t40 == "mossy" then
do return M.PAL.moss end;
elseif __t40 == "wing" then
do return two("#5a3d68", "#432c50") end;
elseif __t40 == "wingBone" then
do return "#2a1a33" end;
elseif __t40 == "club" then
do return two("#a8977a", "#7e6f56") end;
elseif __t40 == "sting" then
do return M.PAL.red end;
elseif __t40 == "tailSeg" then
do return F[1] end;
elseif __t40 == "tailTip" then
do return F[0] end;
elseif __t40 == "tailWhite" then
do return "#f2efe2" end;
elseif __t40 == "hoof" then
do return "#2a2420" end;
elseif __t40 == "talon" then
do return "#e8c86a" end;
elseif __t40 == "tentacle" then
do return two("#93619f", "#7a4a8a") end;
elseif __t40 == "tentacleD" then
do return "#4e2c5a" end;
elseif __t40 == "mane" then
lvl = ((light > 0.3) and 2 or ((light > (-0.3)) and 1 or 0));
if (n < 0.3) then
lvl = __mmax(0, (lvl - 1));
end;
do return F[lvl] end;
elseif __t40 == "head" or __t40 == "neckFur" then
lvl = ((light > 0.35) and 3 or ((light > (-0.2)) and 2 or 1));
elseif __t40 == "tail" then
lvl = ((light > 0.2) and 2 or 1);
else
lvl = ((light > 0.5) and 3 or ((light > (-0.05)) and 2 or ((light > (-0.55)) and 1 or 0)));
if ((((p.lx or __NaN) > (-12)) and ((p.lx or __NaN) < 3)) and (__mabs(((p.ly or __NaN) + (__msin(((p.lx or __NaN) * 0.9)) * 0.6))) < 1.5)) then
lvl = (__mmin(lvl, 1) - ((n < 0.5) and 1 or 0));
end;
end;
end;
if (n < 0.1) then
lvl = lvl - 1;
elseif (n > 0.96) then
lvl = lvl + 1;
end;
do return F[__mmax(0, __mmin(4, lvl))] end;
end;
-- art:399
M.tinted = function(cv, col) 
local m = __get(M.tints, cv);
if (not __T(m)) then
__set(M.tints, cv, (function() m = {}; return m end)());
end;
if (not __T(m[col])) then
local t = M.newCanvas(cv.width, cv.height);
local c = t:getContext("2d");
c:drawImage(cv, 0, 0);
c.globalCompositeOperation = "source-in";
c.fillStyle = col;
c:fillRect(0, 0, t.width, t.height);
m[col] = t;
end;
do return m[col] end;
end;
-- newCanvas: replaced by the build
M.newCanvas = RT.newCanvas;

-- art:3
M.PAL = {ink="#14100c", night="#141a12", grass0="#24331d", grass1="#2c3e23", grass2="#364b2a", grass3="#425a31", tuft="#56763a", tuftHi="#6c8f46", canopy0="#0f1a10", canopy1="#16261a", canopy2="#1f3523", canopy3="#2c4a2c", dirt0="#3f3222", dirt1="#54432d", dirt2="#6a5538", dirt3="#7e6744", rock0="#2f302c", rock1="#55564f", rock2="#7f7f74", rock3="#aeac9b", rock4="#d2cfbd", moss="#4f6a32", fur0="#2a1912", fur1="#46291b", fur2="#633b25", fur3="#835233", fur4="#a06a43", horn="#e6d9b8", hornD="#a8977a", eye="#ffd23f", snout="#8d5f42", mouth="#c0392b", sigil="#6ff3e8", steel="#a9b4c2", steelHi="#dde6f0", white="#f2efe2", orange="#e8892e", yellow="#e8d23a", red="#d8473a", pink="#ee8fbf", blue="#5b8cff", purple="#a463e0", green="#58b84a", brown="#8a5a32", tan="#d8c39a", skin="#e8b48a", hair="#2a1d14", horse="#5a3d29", horseD="#3a281b", mane="#1a120c", tele="#ff3b2a", fire0="#7a1a0e", fire1="#d64a18", fire2="#ffa22b", fire3="#fff07a", heal="#7cff8a", frost="#9fd8ff", shadow="#c27bff", arrow="#e8d8b0", fireball="#ff8a1f", flame="#ff9a2e", ember="#ffe066", blood="#a3201a", dust="#b4a27c", fur="#6e4229", cream="#f4ecd2", gold="#ffd75a", ghost="#bfe8ff", splinter="#c8a070", leaf="#4e7a32", needle="#2e5a3a", smoke="#6b665c", splash="#9fd0e8", hpHi="#e2483a", hpLo="#7a1d16", hpBg="#2a1310", bone="#e8e2cc", spark="#bff6ff", beam="#7fe8ff", ice0="#b8e4f2", ice1="#dff4fb", ice2="#8cc8de"};
-- art:24
M.GLYPHS = {A="010101111101101", B="110101110101110", C="011100100100011", D="110101101101110", E="111100110100111", F="111100110100100", G="011100101101011", H="101101111101101", I="111010010010111", J="001001001101010", K="101101110101101", L="100100100100111", M="101111111101101", N="110101101101101", O="010101101101010", P="110101110100100", Q="010101101110011", R="110101110101101", S="011100010001110", T="111010010010010", U="101101101101111", V="101101101101010", W="101101111111101", X="101101010101101", Y="101101010010010", Z="111001010100111", ["0"]="111101101101111", ["1"]="010110010010111", ["2"]="110001010100111", ["3"]="110001010001110", ["4"]="101101111001001", ["5"]="111100110001110", ["6"]="011100111101111", ["7"]="111001010010010", ["8"]="111101111101111", ["9"]="111101111001110", [" "]="000000000000000", ["."]="000000000000010", [","]="000000000010100", ["!"]="010010010000010", ["?"]="110001010000010", [":"]="000010000010000", ["-"]="000000111000000", ["+"]="000010111010000", ["/"]="001001010100100", ["'"]="010010000000000", ["\""]="101101000000000", ["("]="001010010010001", [")"]="100010010010100", ["*"]="000101010101000", ["%"]="101001010100101", ["#"]="101111101111101", ["<"]="001010100010001", [">"]="100010001010100", ["="]="000111000111000", ["["]="011010010010011", ["]"]="110010010010110", ["_"]="000000000000111"};
-- art:38
M.GLYPH_BITS = {};
do
for __t2 in __pairs(M.GLYPHS) do
local k = __t2;
M.GLYPH_BITS[k] = __map(__sarr(1, M.GLYPHS[k]), __Number);
end;
end;
-- art:65
M.ICONS = {swipe={[0]="#..#..#.", ".#..#..#", ".#..#..#", "..#..#..", "..#..#..", "...#..#.", "...#..#.", "........", length=8}, stomp={[0]="..####..", ".#....#.", "#..##..#", "#.####.#", "#.####.#", "#..##..#", ".#....#.", "..####..", length=8}, breath={[0]="...#....", "..##....", "..###.#.", ".####.#.", ".######.", "########", ".######.", "..####..", length=8}, roar={[0]="#....#..", "##....#.", "###.#..#", "####.#.#", "###.#..#", "##....#.", "#....#..", "........", length=8}, shake={[0]="........", "#...#...", ".#.#.#.#", "..#...#.", "........", "#...#...", ".#.#.#.#", "..#...#.", length=8}, tail={[0]="..####..", ".#....#.", "#......#", "#...##.#", "#..#..#.", ".#.#....", "..##....", "........", length=8}, charge={[0]="........", "#..#....", ".#..#...", "..#..#..", "...#..#.", "..#..#..", ".#..#...", "#..#....", length=8}, summon={[0]="#.#..#.#", "###..###", "#.#..#.#", "###..###", "........", "...##...", "..####..", ".#.##.#.", length=8}, beam={[0]=".....##.", "....##..", "...##...", "..#####.", "....##..", "...##...", "..##....", ".##.....", length=8}, ice={[0]="...#....", ".#.#.#..", "..###...", "#######.", "..###...", ".#.#.#..", "...#....", "........", length=8}, haste={[0]="........", "###.....", "....####", "##......", "...#####", "###.....", "....####", "........", length=8}, fur={[0]=".#.#.#..", "#.#.#.#.", ".#####..", "#######.", "#######.", ".#####..", "..###...", "........", length=8}, lock={[0]="..###...", ".#...#..", ".#...#..", "#######.", "###.###.", "###.###.", "#######.", "........", length=8}, empty={[0]="........", "........", "........", "..####..", "........", "........", "........", "........", length=8}};
-- art:106
M.HORN = {[0]={[0]=7.5, 3.8, length=2}, {[0]=9.5, 6.8, length=2}, {[0]=12.5, 8.8, length=2}, {[0]=16, 9.2, length=2}, {[0]=18.4, 7.6, length=2}, length=5};
-- art:107
M.ANTLER = {[0]={[0]={[0]=7, 3.5, length=2}, {[0]=4.5, 8.5, length=2}, {[0]=1.5, 12.5, length=2}, length=3}, {[0]={[0]=4.5, 8.5, length=2}, {[0]=7.5, 11.5, length=2}, length=2}, {[0]={[0]=2.6, 11, length=2}, {[0]=3.6, 14.5, length=2}, length=2}, {[0]={[0]=6.2, 5.5, length=2}, {[0]=9.5, 7.2, length=2}, length=2}, length=4};
-- art:110
M.GAITS = {[0]={at={[0]=5, (-8), length=2}, y=10.2, size=1, tent=1, swing=1, wriggle=1, fan=0}, {at={[0]=7.5, (-1.25), (-10), length=3}, y=10.8, size=0.86, tent=0.95, swing=0.72, wriggle=0.85, fan=0.15}, {at={[0]=8.5, 2.6, (-3.3), (-9.2), length=4}, y=11.2, size=0.72, tent=0.88, swing=0.45, wriggle=0.65, fan=0.2}, length=3};
-- art:274
M.BOSS_DIRS = 32;
M.BOSS_SIZE = 56;
-- art:275
M.BONE = {horn=M.PAL.hornD, hornD=M.PAL.hornD, claw=M.PAL.hornD, tooth=M.PAL.hornD, talon="#a88a3a", plate="#5f8496", plateHi="#5f8496", beakG="#5c615d", beakGHi="#5c615d", beakGD="#3b3f3c", beakY="#a8701a", beakYHi="#a8701a", beakYD="#8a5512"};
-- art:316
M.bossKey = function(l) 
return (__join(__map({[0]=l.head, l.horns, l.neck, l.back, l.tail, l.limbs, l.legs, length=7}, function(n) 
return (__T(n) and n or 0);
end), ".") .. __str((__T(l.fur) and l.fur or "")));
end;
-- art:320
M.FUR_STEP = {[0]=(-0.15), (-0.078), 0, 0.09, 0.178, length=5};
-- art:398
M.tints = __Map();
