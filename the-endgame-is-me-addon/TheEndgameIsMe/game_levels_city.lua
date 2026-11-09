-- Generated from the-endgame-is-me/js/levels/city.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("levels/city");
local __T, __assign, __assignKV, __band, __bor, __filter, __find, __hypot, __i32, __it, __map, __orv, __parseInt, __push, __shl, __shr, __sign, __slice, __some, __sort, __str, __toString, __typed = RT["T"], RT["assign"], RT["assignKV"], RT["band"], RT["bor"], RT["filter"], RT["find"], RT["hypot"], RT["i32"], RT["it"], RT["map"], RT.orv, RT["parseInt"], RT["push"], RT["shl"], RT["shr"], RT["sign"], RT["slice"], RT["some"], RT["sort"], RT["str"], RT["toString"], RT["typed"];
local __NaN = 0 / 0;
local __mabs, __matan2, __mceil, __mcos, __mfloor, __mfmod, __mmax, __mmin, __msin, __msqrt = math.abs, math.atan2, math.ceil, math.cos, math.floor, math.fmod, math.max, math.min, math.sin, math.sqrt;

-- levels/city:62
M.ruinOf = function(g, p) 
__push((function() if not __T(g.ruins) then g.ruins = {length=0} end; return g.ruins end)(), {x=p.x, y=p.y, w=(__T(p.w) and p.w or ((p.r or __NaN) * 2)), h=(__T(p.h) and p.h or ((p.r or __NaN) * 2)), round=(not __T(p.w)), seed=p.seed, kind=p.kind});
end;
-- levels/city:67
M.addBuilding = function(g, P, kind, x0, y0, w, h) 
local d = P.KINDS[kind];
local hp = __mfloor(((d.hp or __NaN) * __msqrt(((w * h) / ((d.w or __NaN) * (d.h or __NaN))))) + 0.5);
local p = P.addProp(g, kind, (x0 + (w / 2)), (y0 + (h / 2)), {w=w, h=h, hp=hp, maxhp=hp});
p.v = __mfmod((p.seed or __NaN), 3);
do return p end;
end;
-- levels/city:75
M.placeRun = function(g, rng, P, x0, x1, y0, y1) 
local x = x0;
while ((x1 - x) >= 16) do
local w = (22 + __mfloor((rng() * 18)));
if ((x1 - (x + w)) < 18) then
w = (x1 - x);
end;
local r = rng();
local kind = ((r < 0.42) and "city_house" or ((r < 0.72) and "city_shop" or "city_pub"));
M.addBuilding(g, P, kind, x, y0, w, (y1 - y0));
x = (x + ((w + 2) + __mfloor((rng() * 3))));
end;
end;
-- levels/city:88
M.market = function(g, rng, P, x0, x1, y0, y1, plazas) 
__push(plazas, {x0=x0, y0=y0, x1=x1, y1=y1});
do
local y = (y0 + 4);
while ((y + 10) < (y1 - 2)) do
do
local x = (x0 + 4);
while ((x + 14) < (x1 - 2)) do
local r = rng();
if (r < 0.55) then
P.addProp(g, "city_tent", (x + 7), (y + 5), {v=__mfloor((rng() * 4))});
elseif (r < 0.8) then
P.addProp(g, "city_stall", (x + 6), (y + 4));
end;
x = (x + 19);
end;
end;
y = (y + 15);
end;
end;
if ((x1 - x0) > 40) then
P.addProp(g, "city_lamp", (((x0 + x1) / 2) + 3), (y1 - 3));
end;
end;
-- levels/city:99
M.fillBlock = function(g, rng, P, x0, x1, y0, y1, plazas) 
if ((x1 - x0) < 14) then
do return end;
end;
local r = rng();
if ((r < 0.12) and ((x1 - x0) >= 36)) then
M.market(g, rng, P, x0, x1, y0, y1, plazas);
do return end;
end;
if ((r < 0.32) and ((x1 - x0) >= 40)) then
local w = (36 + __mfloor((rng() * 8)));
local left = (rng() < 0.5);
local bx;
if left then bx = x0; else bx = (x1 - w); end;
M.addBuilding(g, P, ((rng() < 0.6) and "city_inn" or "city_chapel"), bx, y0, w, (y1 - y0));
local a = (left and ((x0 + w) + 3) or x0);
local b;
if left then b = x1; else b = ((x1 - w) - 3); end;
local mid = __mfloor(((y0 + y1) / 2) + 0.5);
M.placeRun(g, rng, P, a, b, y0, (mid - 2));
M.placeRun(g, rng, P, a, b, (mid + 2), y1);
do return end;
end;
local mid = __mfloor(((y0 + y1) / 2) + 0.5);
M.placeRun(g, rng, P, x0, x1, y0, (mid - 2));
M.placeRun(g, rng, P, x0, x1, (mid + 2), y1);
end;
-- levels/city:118
M.fillRow = function(g, rng, P, y0, y1, streets, plazas) 
local s = __sort(__slice(streets), function(a, b) 
return ((a[0] or __NaN) - (b[0] or __NaN));
end);
local x = 10;
do
local __t4, __t5 = __it(s), 0;
while __t5 < __t4.length do
local __t7 = __t4[__t5]; __t5 = __t5 + 1; local a, b; a = __t7[0]; b = __t7[1];
M.fillBlock(g, rng, P, x, a, y0, y1, plazas);
x = b;
end;
end;
M.fillBlock(g, rng, P, x, 310, y0, y1, plazas);
end;
-- levels/city:125
M.build = function(g, rng, P) 
g.ruins = {length=0};
local water = P.makeWater(M.MW, M.MH);
local canals = {length=0};
local plazas = {length=0};
do
local __t8, __t9 = __it(M.CANALS), 0;
while __t9 < __t8.length do
local c = __t8[__t9]; __t9 = __t9 + 1;
P.setWater(water, 0, c.y, M.MW, (((c.y or __NaN) + M.CANAL_H) - 1), 1);
do
local __t11, __t12 = __it(c.br), 0;
while __t12 < __t11.length do
local x = __t11[__t12]; __t12 = __t12 + 1;
P.setWater(water, x, c.y, ((x + M.BR_W) - 1), (((c.y or __NaN) + M.CANAL_H) - 1), 2);
end;
end;
__push(canals, {y0=c.y, y1=((c.y or __NaN) + M.CANAL_H), bridges=__map(c.br, function(x) 
return {x0=x, x1=(x + M.BR_W)};
end), cross=__map(c.br, function(x) 
return (x + (M.BR_W / 2));
end)});
end;
end;
g.water = water;
do
local __t14, __t15 = __it(M.BANDS), 0;
while __t15 < __t14.length do
local B = __t14[__t15]; __t15 = __t15 + 1;
local r1b = ((B.yB or __NaN) - 24);
local r1t = (r1b - 52);
local r2b = (r1t - 28);
local r2t = (r2b - 52);
M.fillRow(g, rng, P, r1t, r1b, B.row1, plazas);
M.fillRow(g, rng, P, r2t, r2b, B.row2, plazas);
do
local x = 22;
while (x < 310) do
if (not __some(M.CANALS, function(c) 
return ((c.y == B.yB) and __some(c.br, function(b) 
return ((x > (b - 4)) and (x < ((b + M.BR_W) + 4)));
end));
end)) then
P.addProp(g, "city_lamp", x, ((B.yB or __NaN) - 3));
end;
x = (x + (46 + __mfloor((rng() * 20))));
end;
end;
do
local x = 30;
while (x < 300) do
P.addProp(g, "city_lamp", x, (r1t - 26));
x = (x + (60 + __mfloor((rng() * 30))));
end;
end;
end;
end;
M.fillRow(g, rng, P, 136, 176, {[0]={[0]=20, 50, length=2}, {[0]=150, 180, length=2}, length=2}, plazas);
__push(plazas, {x0=66, y0=76, x1=254, y1=132});
P.addProp(g, "city_fountain", 160, 108);
do
local __t19, __t20 = __it({[0]={[0]=92, 88, length=2}, {[0]=92, 120, length=2}, {[0]=228, 88, length=2}, {[0]=228, 120, length=2}, length=4}), 0;
while __t20 < __t19.length do
local __t22 = __t19[__t20]; __t20 = __t20 + 1; local x, y; x = __t22[0]; y = __t22[1];
P.addProp(g, "city_tent", x, y, {v=__mfloor((rng() * 4))});
end;
end;
do
local __t23, __t24 = __it({[0]={[0]=112, 104, length=2}, {[0]=208, 104, length=2}, {[0]=136, 126, length=2}, {[0]=184, 126, length=2}, length=4}), 0;
while __t24 < __t23.length do
local __t26 = __t23[__t24]; __t24 = __t24 + 1; local x, y; x = __t26[0]; y = __t26[1];
P.addProp(g, "city_stall", x, y);
end;
end;
M.addBuilding(g, P, "city_inn", 12, 80, 44, 50);
M.addBuilding(g, P, "city_pub", 264, 80, 44, 24);
M.addBuilding(g, P, "city_shop", 264, 106, 44, 24);
do
local __t27, __t28 = __it({[0]=66, 254, length=2}), 0;
while __t28 < __t27.length do
local x = __t27[__t28]; __t28 = __t28 + 1;
P.addProp(g, "city_lamp", x, 133);
end;
end;
__push(plazas, {x0=60, y0=822, x1=260, y1=860});
M.market(g, rng, P, 60, 140, 822, 856, plazas);
M.market(g, rng, P, 180, 260, 822, 856, plazas);
M.placeRun(g, rng, P, 10, 50, 824, 848);
M.placeRun(g, rng, P, 270, 310, 824, 848);
do
local __t30, __t31 = __it({[0]=60, 140, 180, 260, length=4}), 0;
while __t31 < __t30.length do
local x = __t30[__t31]; __t31 = __t31 + 1;
P.addProp(g, "city_lamp", x, 862);
end;
end;
local foots = __map(__filter(g.props, function(p) 
return (__T(p.w) and P.KINDS[p.kind].solid);
end), function(p) 
return {x0=((p.x or __NaN) - ((p.w or __NaN) / 2)), y0=((p.y or __NaN) - ((p.h or __NaN) / 2)), x1=((p.x or __NaN) + ((p.w or __NaN) / 2)), y1=((p.y or __NaN) + ((p.h or __NaN) / 2))};
end);
local n = 0;
do
local tries = 0;
while ((tries < 2000) and (n < 34)) do
repeat
local x = (14 + (rng() * 292));
local y = (90 + (rng() * 760));
if (((__some(foots, function(f) 
return ((((x > ((f.x0 or __NaN) - 3)) and (x < ((f.x1 or __NaN) + 3))) and (y > ((f.y0 or __NaN) - 3))) and (y < ((f.y1 or __NaN) + 3)));
end) or __T(P.isWater(g, x, y))) or __T(P.isWater(g, x, (y + 6)))) or __T(P.isWater(g, x, (y - 6)))) then
do break end;
end;
P.addCritter(g, "city_folk", x, y, {col=__mfloor((rng() * 6))});
n = n + 1;
until true;
tries = tries + 1;
end;
end;
local front = __map(M.FRONT_SECS, function(__t34) local x0, x1, kind; x0 = __t34[0]; x1 = __t34[1]; kind = __t34[2];
local hh = ((kind == "cf_tower") and ((M.FRONT.bot or __NaN) + 6) or M.FRONT.bot);
local hp = M.kinds[kind].hp;
local p = P.addProp(g, kind, ((x0 + x1) / 2), (hh / 2), {w=(x1 - x0), h=hh, hp=hp, maxhp=hp});
do return {x0=x0, x1=x1, kind=kind, prop=p, total=M.HITS[kind], label=M.LABEL[kind], bot=hh, breached=false} end;
end);
do return {w=M.MW, h=M.MH, scroll="y", start={x=160, y=866, face=((-math.pi) / 2)}, canals=canals, plazas=plazas, foots=foots, front=front} end;
end;
-- levels/city:186
M.crossings = function(g, c) 
local w = g.water;
local cs = w.cs;
local r0 = __mfloor(((c.y0 or __NaN) / cs));
local r1 = __mfloor((((c.y1 or __NaN) - 1) / cs));
local out = {length=0};
local run = 0;
for col = 0, w.cols do
local ok = (col < (w.cols or __NaN));
if __T(ok) then
for r = r0, r1 do
if (w.a[((r * (w.cols or __NaN)) + col)] == 1) then
ok = false;
do break end;
end;
end;
end;
if __T(ok) then
run = run + 1;
else
if (run >= 2) then
__push(out, {x=((col - (run / 2)) * cs), half=((run * cs) / 2)});
end;
run = 0;
end;
end;
do return out end;
end;
-- levels/city:197
M.steerHeroes = function(g, dt, barriers) 
if ((not __T((barriers and (barriers.length or #barriers)))) or (not __T(g.water))) then
do return end;
end;
if ((not __T(g.crossT)) or (((g.t or __NaN) - (g.crossT or __NaN)) > 0.5)) then
g.crossT = g.t;
do
local __t37, __t38 = __it(barriers), 0;
while __t38 < __t37.length do
local c = __t37[__t38]; __t38 = __t38 + 1;
c.open = M.crossings(g, c);
end;
end;
end;
local b = g.boss;
do
local __t40, __t41 = __it(g.units), 0;
while __t41 < __t40.length do
repeat
local u = __t40[__t41]; __t41 = __t41 + 1;
if (((__T(u.dead) or __T(u.gone)) or (u.role == "rider")) or ((u.stun or __NaN) > 0)) then
do break end;
end;
local t;
if (((u.state == "flee") or (u.state == "leave")) and __T(u.exit)) then t = u.exit; elseif ((not __T((u.party and u.party.engaged))) and (__T(u.post) or __T(u.stage))) then t = (__T(u.post) and u.post or u.stage); else t = b; end;
do
local __t43, __t44 = __it(barriers), 0;
while __t44 < __t43.length do
repeat
local c = __t43[__t44]; __t44 = __t44 + 1;
local mid = (((c.y0 or __NaN) + (c.y1 or __NaN)) / 2);
if (((((u.y or __NaN) < ((c.y0 or __NaN) - 14)) or ((u.y or __NaN) > ((c.y1 or __NaN) + 14))) or (((u.y or __NaN) < mid) == ((t.y or __NaN) < mid))) or (not __T((c.open and (c.open.length or #c.open))))) then
do break end;
end;
local best = nil;
do
local __t46, __t47 = __it(c.open), 0;
while __t47 < __t46.length do
local o = __t46[__t47]; __t47 = __t47 + 1;
if ((not __T(best)) or (__mabs(((o.x or __NaN) - (u.x or __NaN))) < __mabs(((best.x or __NaN) - (u.x or __NaN))))) then
best = o;
end;
end;
end;
local dx = ((best.x or __NaN) - (u.x or __NaN));
if (__mabs(dx) > ((best.half or __NaN) - 3)) then
u.x = ((u.x or __NaN) + (__sign(dx) * __mmin(__mabs(dx), (46 * dt))));
else
u.y = ((u.y or __NaN) + ((__sign(((t.y or __NaN) - (u.y or __NaN))) * 14) * dt));
end;
until true;
end;
end;
until true;
end;
end;
end;
-- levels/city:218
M.update = function(g, dt, api) 
local m = g.map;
local b = g.boss;
M.steerHeroes(g, dt, m.canals);
local top = ((g.cam.y or __NaN) < 90);
m.edges = (top and {[0]=0, 1, 3, length=3} or nil);
m.sideBand = (top and {[0]=96, 150, length=2} or nil);
do
local __t49, __t50 = __it(m.front), 0;
while __t50 < __t49.length do
repeat
local s = __t49[__t50]; __t50 = __t50 + 1;
local p = s.prop;
if (p.state == "up") then
do break end;
end;
if (not __T(s.breached)) then
s.breached = true;
g.shake = __mmax((g.shake or __NaN), 0.7);
for i = 0, 40 - 1 do
local a = (g.rng() * math.pi);
local sp = (20 + (g.rng() * 50));
api.part(g, ((p.x or __NaN) + ((g.rng() - 0.5) * (p.w or __NaN))), ((s.bot or __NaN) - (g.rng() * 30)), (__mcos(a) * sp), ((__msin(a) * sp) * 0.6), (0.6 + (g.rng() * 0.8)), ((g.rng() < 0.6) and "dust" or "splinter"));
end;
local pts = __mfloor((3000 * (g.mult or __NaN)) + 0.5);
api.addScore(g, pts);
api.text(g, p.x, ((s.bot or __NaN) + 12), ("+" .. __str(pts)), "gold", 2);
api.sound(g, "collapse");
if (not __T(g.clear)) then
api.banner(g, ((s.kind == "cf_gate") and "THE CASTLE GATE IS DOWN" or ((s.kind == "cf_tower") and "THE TOWER IS DOWN" or "THE CASTLE WALL IS DOWN")), "WALK IN.", 4);
end;
end;
if ((((((not __T(g.clear)) and (not __T(g.won))) and (not __T(b.dead))) and ((b.y or __NaN) < ((s.bot or __NaN) + 4))) and ((b.x or __NaN) > ((s.x0 or __NaN) - 2))) and ((b.x or __NaN) < ((s.x1 or __NaN) + 2))) then
api.walkOff(g, {x=M.clamp((((s.x0 or __NaN) + (s.x1 or __NaN)) / 2), 16, (M.MW - 16)), title="INTO THE CASTLE", sub="THE HOARD OPENS IN A MOMENT. THEN THE CASTLE."});
end;
until true;
end;
end;
do
local __t53, __t54 = __it(g.units), 0;
while __t54 < __t53.length do
repeat
local u = __t53[__t54]; __t54 = __t54 + 1;
local s;
if ((__T(u.dead) or __T(u.gone)) or (u.role == "rider")) then
do break end;
end;
if ((__T(u.exit) and ((u.exit.y or __NaN) < ((M.FRONT.bot or __NaN) + 12))) and ((u.state == "flee") or (u.state == "leave"))) then
u.exit = {x=(((u.x or __NaN) < (M.MW / 2)) and (-20) or (M.MW + 20)), y=__mmax((u.y or __NaN), ((M.FRONT.bot or __NaN) + 20))};
end;
if ((u.y or __NaN) > ((M.FRONT.bot or __NaN) + 6)) then
do break end;
end;
s = __find(m.front, function(s) 
return (((u.x or __NaN) >= (s.x0 or __NaN)) and ((u.x or __NaN) < (s.x1 or __NaN)));
end);
if ((__T(s) and (s.prop.state == "up")) and ((u.y or __NaN) < ((s.bot or __NaN) + 2))) then
u.y = ((s.bot or __NaN) + 3);
end;
until true;
end;
end;
end;
-- levels/city:251
M.hud = function(g) 
local m = g.map;
local b = g.boss;
if __T(g.walkoff) then
do return "INTO THE CASTLE" end;
end;
if __some(m.front, function(s) 
return s.breached;
end) then
do return "THE WAY IS OPEN. WALK IN" end;
end;
local best = nil;
do
local __t56, __t57 = __it(m.front), 0;
while __t57 < __t56.length do
local s = __t56[__t57]; __t57 = __t57 + 1;
local hits = __mfloor((((s.prop.maxhp or __NaN) - (s.prop.hp or __NaN)) / M.BASH) + 0.5);
if ((hits > 0) and ((not __T(best)) or ((hits / (s.total or __NaN)) > (best.k or __NaN)))) then
best = {s=s, hits=hits, k=(hits / (s.total or __NaN))};
end;
end;
end;
if __T(best) then
do return (__str(best.s.label) .. " " .. __str(__mmin((best.hits or __NaN), ((best.s.total or __NaN) - 1))) .. "/" .. __str(best.s.total)) end;
end;
if ((b.y or __NaN) < 150) then
do return "THE GATE IS SHUT. BREAK SOMETHING" end;
end;
do return ("NORTH TO THE CASTLE  " .. __str(__mmax(0, __mfloor(((((b.y or __NaN) - (M.FRONT.bot or __NaN)) - 10) / 4) + 0.5))) .. " M") end;
end;
-- levels/city:281
M.put = function(c, x, y, col) 
c.fillStyle = col;
c:fillRect(x, y, 1, 1);
end;
-- levels/city:282
M.rect = function(c, x, y, w, h, col) 
c.fillStyle = col;
c:fillRect(x, y, w, h);
end;
-- levels/city:288
M.paintRoof = function(c, x0, y0, w, rh, style, seed, hash, ns_) 
local pal = M.ROOF[style];
local ridge = (__T(ns_) and (x0 + __mfloor((w / 2))) or (y0 + __mmax(2, __mfloor((rh * 0.42)))));
do
local y = y0;
while (y < (y0 + rh)) do
do
local x = x0;
while (x < (x0 + w)) do
local q;
if __T(ns_) then q = x; else q = y; end;
local lit = (q < ridge);
local d = (lit and (ridge - q) or (q - ridge));
local span = __mmax(1, (lit and (ridge - (function() if __T(ns_) then return x0; else return y0; end; end)()) or ((__T(ns_) and (x0 + w) or (y0 + rh)) - ridge)));
local l = (lit and (3.6 - ((d / span) * 0.8)) or (1.9 - ((d / span) * 0.8)));
l = (l + (__T(ns_) and ((((y0 + (rh / 2)) - y) / rh) * 0.5) or ((((x0 + (w / 2)) - x) / w) * 0.5)));
local along;
if __T(ns_) then along = y; else along = x; end;
if (style == "thatch") then
l = (l + (((hash(((along * 3) + seed), (__mfloor((d / 2)) + seed)) - 0.5) * 1.1) + ((__mfmod(d, 3) == 2) and (-0.5) or 0)));
else
local course = __mfloor((d / 2));
local edge = ((__mfmod(d, 2) == 0) and (d > 0));
if edge then
l = (l - 0.8);
end;
local per = ((style == "slate") and 4 or 3);
if ((not edge) and (__mfmod(((along + (course * 2)) + seed), per) == 0)) then
l = (l - 0.5);
end;
l = (l + ((hash((x + seed), (y * 3)) - 0.5) * 0.35));
end;
if (q == ridge) then
l = 5;
elseif (q == (ridge + 1)) then
l = __mmin(l, 1);
end;
M.put(c, x, y, pal[M.clamp(__mfloor(l + 0.5), 0, 5)]);
x = x + 1;
end;
end;
y = y + 1;
end;
end;
M.rect(c, x0, ((y0 + rh) - 1), w, 1, pal[0]);
do return ridge end;
end;
-- levels/city:313
M.chimney = function(c, x, y) 
M.rect(c, (x - 1), (y - 1), 5, 6, M.INK);
M.rect(c, x, y, 3, 4, M.STONEP[3]);
M.put(c, x, y, M.STONEP[5]);
M.put(c, (x + 2), (y + 3), M.STONEP[1]);
M.rect(c, x, y, 3, 1, M.STONEP[4]);
M.put(c, (x + 1), y, "#1a1612");
end;
-- levels/city:320
M.paintFront = function(c, kind, w, h, F, seed, hash) 
local y0 = (h - F);
local plaster = ((kind ~= "city_house") and (kind ~= "city_chapel"));
do
local y = y0;
while (y < h) do
for x = 0, __mceil(w) - 1 do
if plaster then
local beam = ((((__mfmod(x, 6) == 2) or (y == (y0 + 3))) or (x == 1)) or (x == (w - 2)));
M.put(c, x, y, (beam and M.BEAM or M.PLASTER[M.clamp(((2 + ((x < (w / 2)) and 0 or (-1))) + ((hash((x + seed), y) > 0.8) and (-1) or 0)), 0, 3)]));
else
local course = __mfloor(((y - y0) / 2));
local mortar = (((__mfmod((y - y0), 2) == 1) and (hash(x, (y + seed)) > 0.25)) or (__mfmod(((x + (course * 3)) + seed), 5) == 0));
M.put(c, x, y, (function() if mortar then return M.STONEP[1]; else return M.STONEP[M.clamp(((3 + ((hash(((x * 7) + seed), course) > 0.7) and 1 or 0)) - ((x > (w * 0.7)) and 1 or 0)), 0, 5)]; end; end)());
end;
end;
y = y + 1;
end;
end;
M.rect(c, 0, y0, w, 1, "#1c1610");
local door = (3 + __mfloor((hash(seed, 5) * __mmax(1, (w - 9)))));
for x = 3, __mceil((w - 3)) - 1, 6 do
repeat
if (((x + 2) > (door - 1)) and (x < (door + 4))) then
do break end;
end;
M.rect(c, x, (y0 + 2), 2, 2, M.GLASS);
if (hash(x, seed) > 0.55) then
M.put(c, x, (y0 + 2), M.LIT);
end;
M.rect(c, x, (y0 + 4), 2, 1, (function() if plaster then return M.PLASTER[3]; else return M.STONEP[5]; end; end)());
until true;
end;
M.rect(c, (door - 1), (y0 + 1), 5, (F - 2), M.INK);
M.rect(c, door, (y0 + 2), 3, (F - 3), ((kind == "city_chapel") and "#4a2a18" or "#5a3a22"));
M.put(c, (door + 2), (y0 + 4), "#c8a050");
if (kind == "city_shop") then
local ax = ((door > (w / 2)) and (door - 9) or (door + 4));
local cols = M.TENT[__mfmod(seed, 4)];
for x = 0, 7 - 1 do
M.put(c, (ax + x), (y0 + 1), cols[__band(__shr(x, 1), 1)]);
M.put(c, (ax + x), (y0 + 2), ((__band(x, 1) ~= 0) and M.INK or cols[__band(__shr(x, 1), 1)]));
end;
end;
if ((kind == "city_pub") or (kind == "city_inn")) then
local sx = ((door > (w / 2)) and (door - 5) or (door + 5));
M.rect(c, (sx - 1), (y0 + 1), 5, 1, M.INK);
M.rect(c, sx, (y0 + 2), 3, 3, M.INK);
M.rect(c, sx, (y0 + 2), 3, 2, ((kind == "city_pub") and "#c8962a" or "#8a2a22"));
M.put(c, (sx + 1), (y0 + 2), "#f4d070");
if (kind == "city_pub") then
M.put(c, (door - 2), (h - 2), "#6a4224");
M.put(c, (door + 4), (h - 2), "#6a4224");
end;
end;
if (kind == "city_chapel") then
local rx = (door + 1);
local ry = (y0 + 1);
M.put(c, rx, ry, "#c8962a");
M.put(c, (rx - 1), ry, "#3a6ab0");
M.put(c, (rx + 1), ry, "#a83a3a");
end;
M.rect(c, 0, (h - 1), w, 1, M.INK);
end;
-- levels/city:363
M.paintDamage = function(c, w, h, F, stage, seed, hash, style) 
if (not __T(stage)) then
do return end;
end;
local roofH = (h - F);
local n = ((stage == 1) and 2 or 5);
for i = 0, __mceil(n) - 1 do
local x = (2 + __mfloor((hash(i, seed) * (w - 6))));
local y = (2 + __mfloor((hash(seed, (i * 3)) * (roofH - 4))));
M.rect(c, x, y, 2, 1, "#120c08");
M.put(c, (x + 1), (y + 1), M.ROOF[style][1]);
end;
for i = 0, __mceil((stage * 2)) - 1 do
local x = (1 + __mfloor((hash((i * 5), (seed + 3)) * (w - 3))));
local y = ((h - F) + 1);
for k = 0, 4 - 1 do
M.put(c, x, (y + k), "#1c1610");
x = (x + ((hash(k, (i + seed)) > 0.5) and 1 or 0));
end;
end;
if (stage == 2) then
local hw = __mmin(9, (w - 6));
local hh = __mmin(6, (roofH - 3));
local hx = (3 + __mfloor((hash(seed, 9) * ((w - hw) - 6))));
local hy = (2 + __mfloor((hash(9, seed) * ((roofH - hh) - 3))));
M.rect(c, hx, hy, hw, hh, "#0e0a07");
for x = (hx + 1), __mceil((hx + hw)) - 1, 3 do
M.rect(c, x, hy, 1, hh, "#5a3a22");
end;
M.rect(c, hx, (hy + hh), hw, 1, M.ROOF[style][0]);
end;
end;
-- levels/city:383
M.buildingSprite = function(h, p, stage) 
local W, Hh;
local __t69 = p; W = __t69.w; Hh = __t69.h;
local kind = p.kind;
local v = (__T(p.v) and p.v or 0);
do return h.sprite((__str(kind) .. "|" .. __str(W) .. "|" .. __str(Hh) .. "|" .. __str(v) .. "|" .. __str(stage)), W, Hh, function(c) 
local seed = __mfmod((p.seed or __NaN), 97);
local F = (__T(M.BIG[kind]) and 9 or 7);
local style = ((kind == "city_house") and ((v == 2) and "tile" or "slate") or ((kind == "city_chapel") and "slate" or ((kind == "city_pub") and "thatch" or ((kind == "city_inn") and "tile" or "shingle"))));
M.paintRoof(c, 0, 0, W, (Hh - F), style, seed, h.hash, (((not __T(M.BIG[kind])) and (v == 1)) and (W < 34)));
M.paintFront(c, kind, W, Hh, F, seed, h.hash);
if ((kind == "city_house") or (kind == "city_inn")) then
M.chimney(c, (3 + __mfloor((h.hash(seed, 1) * (W - 9)))), 1);
if (kind == "city_inn") then
M.chimney(c, (W - 7), 2);
end;
end;
if (kind == "city_chapel") then
local tx = 3;
local ty = 2;
local S = 14;
M.rect(c, (tx - 1), (ty - 1), (S + 2), (S + 2), M.INK);
for y = 0, S - 1 do
for x = 0, S - 1 do
local dx = (x - ((S - 1) / 2));
local dy = (y - ((S - 1) / 2));
local face = ((__mabs(dx) > __mabs(dy)) and ((dx < 0) and 4 or 1) or ((dy < 0) and 5 or 2));
M.put(c, (tx + x), (ty + y), (function() if (__mabs((__mabs(dx) - __mabs(dy))) < 0.6) then return M.ROOF.slate[0]; else return M.ROOF.slate[face]; end; end)());
end;
end;
M.put(c, ((tx + (S / 2)) - 1), ((ty + (S / 2)) - 1), "#ffd75a");
M.put(c, (tx + (S / 2)), ((ty + (S / 2)) - 1), "#c8962a");
end;
M.paintDamage(c, W, Hh, F, stage, seed, h.hash, style);
M.rect(c, 0, 0, W, 1, M.INK);
M.rect(c, 0, 0, 1, Hh, M.INK);
M.rect(c, (W - 1), 0, 1, Hh, M.INK);
end) end;
end;
-- levels/city:411
M.wreckSprite = function(h, p) 
local W = p.w;
local Hh = p.h;
local kind = p.kind;
do return h.sprite(("wreck|" .. __str(kind) .. "|" .. __str(W) .. "|" .. __str(Hh) .. "|" .. __str((__T(p.v) and p.v or 0))), W, Hh, function(c) 
local seed = __mfmod((p.seed or __NaN), 89);
local style = ((kind == "city_pub") and "thatch" or ((kind == "city_inn") and "tile" or "shingle"));
local pal = M.ROOF[style];
for i = 0, __mceil(__mmax(4, ((W * Hh) / 70))) - 1 do
local pw = (3 + __mfloor((h.hash(i, seed) * 6)));
local ph = (2 + __mfloor((h.hash(seed, i) * 3)));
local x = __mfloor((h.hash((i * 3), (seed + 1)) * (W - pw)));
local y = __mfloor((h.hash((seed + 2), (i * 3)) * (Hh - ph)));
M.rect(c, x, y, pw, ph, M.INK);
for yy = 1, ph - 1 do
for xx = 1, (pw - 1) - 1 do
M.put(c, (x + xx), (y + yy), pal[M.clamp(((2 + ((yy == 1) and 1 or 0)) + __mfloor(((h.hash((xx + i), yy) - 0.5) * 1.4) + 0.5)), 0, 5)]);
end;
end;
end;
for i = 0, __mceil(__mmax(3, (W / 6))) - 1 do
local a = (h.hash(i, (seed + 7)) * math.pi);
local L = (6 + (h.hash(seed, (i + 7)) * 10));
local x = (2 + (h.hash((i * 7), seed) * (W - 4)));
local y = (2 + (h.hash(seed, (i * 7)) * (Hh - 4)));
for k = 0, __mceil(L) - 1 do
local X = __mfloor((x + (__mcos(a) * k)) + 0.5);
local Y = __mfloor((y + (__msin(a) * k)) + 0.5);
if ((((X < 0) or (Y < 0)) or (X >= W)) or (Y >= (Hh - 1))) then
do break end;
end;
M.put(c, X, (Y + 1), M.INK);
M.put(c, X, Y, ((__mfmod(k, 4) ~= 0) and "#6a4628" or "#84603a"));
end;
end;
for i = 0, __mceil(((W * Hh) / 30)) - 1 do
M.put(c, __mfloor((h.hash(i, (seed + 11)) * W)), __mfloor((h.hash((seed + 11), i) * Hh)), (function() if (h.hash(i, i) > 0.5) then return M.PLASTER[2]; else return M.STONEP[3]; end; end)());
end;
end) end;
end;
-- levels/city:437
M.ruinSprite = function(h, r) 
local W = __mfloor((r.w or __NaN) + 0.5);
local Hh = __mfloor((r.h or __NaN) + 0.5);
local seed = __mfmod((r.seed or __NaN), 83);
do return h.sprite(("ruin|" .. __str(W) .. "|" .. __str(Hh) .. "|" .. __str((__T(r.round) and 1 or 0)) .. "|" .. __str(__mfmod(seed, 4))), (W + 2), (Hh + 2), function(c) 
for y = 0, Hh - 1 do
for x = 0, W - 1 do
repeat
local e;
if __T(r.round) then e = (__mabs(((__hypot(((x - (W / 2)) + 0.5), ((y - (Hh / 2)) + 0.5)) - (W / 2)) + 1.5)) < 1.2); else e = ((((x < 2) or (y < 2)) or (x >= (W - 2))) or (y >= (Hh - 2))); end;
local hh = h.hash((x + (seed * 7)), (y + seed));
if e then
if (hh < 0.3) then
do break end;
end;
M.put(c, (x + 1), (y + 2), M.INK);
M.put(c, (x + 1), (y + 1), (function() if (hh > 0.8) then return M.STONEP[4]; elseif (hh > 0.55) then return M.STONEP[3]; else return M.STONEP[2]; end; end)());
elseif (hh > 0.86) then
M.put(c, (x + 1), (y + 1), (function() if (hh > 0.95) then return M.STONEP[3]; else return M.STONEP[1]; end; end)());
elseif (hh < 0.1) then
M.put(c, (x + 1), (y + 1), "#4a3f30");
end;
until true;
end;
end;
end) end;
end;
-- levels/city:454
M.rubbleSprite = function(h, v, big) 
local S = (__T(big) and 9 or 7);
do return h.sprite(("rubble|" .. __str(v) .. "|" .. __str((__T(big) and 1 or 0))), (S + 2), S, function(c) 
local pts = {length=0};
do
local i = 0;
while (i < (__T(big) and 7 or 5)) do
__push(pts, {[0]=(1 + __mfloor((h.hash(i, (v * 13)) * (S - 3)))), (1 + __mfloor((h.hash((v * 13), i) * (S - 4)))), (1 + ((h.hash((i + v), 3) > 0.5) and 1 or 0)), length=3});
i = i + 1;
end;
end;
__sort(pts, function(a, b) 
return ((a[1] or __NaN) - (b[1] or __NaN));
end);
do
local __t81, __t82 = __it(pts), 0;
while __t82 < __t81.length do
local __t84 = __t81[__t82]; __t82 = __t82 + 1; local x, y, s; x = __t84[0]; y = __t84[1]; s = __t84[2];
M.rect(c, x, y, (s + 2), (s + 2), M.INK);
end;
end;
do
local __t85, __t86 = __it(pts), 0;
while __t86 < __t85.length do
local __t88 = __t85[__t86]; __t86 = __t86 + 1; local x, y, s; x = __t88[0]; y = __t88[1]; s = __t88[2];
M.rect(c, (x + 1), (y + 1), s, s, M.STONEP[(2 + __mfmod(((x + y) + v), 2))]);
M.put(c, (x + 1), (y + 1), M.STONEP[4]);
end;
end;
end) end;
end;
-- levels/city:467
M.shadowRect = function(ctx, x, y, w, h) 
ctx.globalAlpha = 0.3;
ctx.fillStyle = "#05080a";
ctx:fillRect((x + 3), (y + 2), w, h);
ctx.globalAlpha = 1;
end;
-- levels/city:468
M.burnTint = function(ctx, spr, x, y, p, h) 
local d = M.kinds[p.kind];
if __T(p.burning) then
ctx.globalAlpha = __mmin(0.85, (((p.burnT or __NaN) / __orv((d and d.burnTime), 8)) * 0.95));
ctx:drawImage(h.tinted(spr, "#1a120c"), x, y);
ctx.globalAlpha = 1;
end;
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = 0.5;
ctx:drawImage(h.tinted(spr, "#ffffff"), x, y);
ctx.globalAlpha = 1;
end;
end;
-- levels/city:475
M.drawBuilding = function(ctx, p, g, h) 
local x = (__mfloor(((p.x or __NaN) - ((p.w or __NaN) / 2)) + 0.5) + (((p.hitT or __NaN) > 0.07) and 1 or 0));
local y = __mfloor(((p.y or __NaN) - ((p.h or __NaN) / 2)) + 0.5);
if (p.state == "down") then
local s = M.wreckSprite(h, p);
ctx:drawImage(s, x, y);
M.burnTint(ctx, s, x, y, p, h);
do return end;
end;
M.shadowRect(ctx, x, y, p.w, p.h);
local s = M.buildingSprite(h, p, M.stageOf(p));
ctx:drawImage(s, x, y);
M.burnTint(ctx, s, x, y, p, h);
end;
-- levels/city:484
M.drawTent = function(ctx, p, g, h) 
local x = __mfloor(((p.x or __NaN) - 7) + 0.5);
local y = __mfloor(((p.y or __NaN) - 5) + 0.5);
local v = __mfmod((__T(p.v) and p.v or 0), 4);
local cols = M.TENT[v];
if (p.state == "down") then
local s = h.sprite(("tentdown|" .. __str(v) .. "|" .. __str(__mfmod((p.seed or __NaN), 3))), 16, 9, function(c) 
for yy = 0, 8 - 1 do
for xx = 0, 16 - 1 do
repeat
local r = (__hypot(((xx - 8) / 8), ((yy - 4) / 4)) + ((h.hash((xx + (__mfmod((p.seed or __NaN), 3) * 9)), yy) - 0.5) * 0.5));
if (r > 1) then
do break end;
end;
M.put(c, xx, yy, ((r > 0.85) and M.INK or (function() if (__band(__shr(xx, 1), 1) ~= 0) then return cols[1]; else return cols[0]; end; end)()));
until true;
end;
end;
M.put(c, 2, 6, "#5a3a22");
M.put(c, 3, 6, "#5a3a22");
M.put(c, 12, 2, "#5a3a22");
M.put(c, 13, 1, "#5a3a22");
end);
ctx:drawImage(s, (x - 1), (y + 1));
M.burnTint(ctx, s, (x - 1), (y + 1), p, h);
do return end;
end;
local s = h.sprite(("tent|" .. __str(v)), 14, 10, function(c) 
for yy = 0, 10 - 1 do
for xx = 0, 14 - 1 do
local stripe = __band(__shr((xx + 1), 1), 1);
local north = (yy < 4);
local col = cols[stripe];
if ((not north) and (yy < 8)) then
col = M.shade(col, (-28));
elseif (yy >= 8) then
col = M.shade(col, (-50));
end;
if (yy == 3) then
col = M.shade(cols[stripe], 26);
end;
if (((xx == 0) or (xx == 13)) or (yy == 0)) then
col = M.INK;
end;
M.put(c, xx, yy, col);
end;
end;
for xx = 1, 13 - 1, 2 do
M.put(c, xx, 9, M.INK);
end;
M.rect(c, 6, 7, 2, 2, "#1a120c");
end);
ctx.globalAlpha = 0.3;
ctx.fillStyle = "#05080a";
ctx:fillRect((x + 2), (y + 2), 14, 10);
ctx.globalAlpha = 1;
ctx:drawImage(s, x, y);
M.burnTint(ctx, s, x, y, p, h);
end;
-- levels/city:514
M.drawStall = function(ctx, p, g, h) 
local x = __mfloor(((p.x or __NaN) - 5) + 0.5);
local y = __mfloor(((p.y or __NaN) - 3) + 0.5);
if (p.state == "down") then
local s = h.sprite(("stalldown|" .. __str(__mfmod((p.seed or __NaN), 3))), 12, 7, function(c) 
for i = 0, 6 - 1 do
local xx = __mfloor((h.hash(i, __mfmod((p.seed or __NaN), 3)) * 9));
local yy = __mfloor((h.hash(__mfmod((p.seed or __NaN), 3), i) * 5));
M.rect(c, xx, (yy + 1), 3, 1, M.INK);
M.rect(c, xx, yy, 3, 1, ((__band(i, 1) ~= 0) and "#8a6a3a" or "#a07a44"));
end;
M.put(c, 5, 3, "#c83a2a");
M.put(c, 8, 5, "#e8c040");
end);
ctx:drawImage(s, (x - 1), y);
M.burnTint(ctx, s, (x - 1), y, p, h);
do return end;
end;
local s = h.sprite("stall", 10, 7, function(c) 
M.rect(c, 0, 1, 5, 5, M.INK);
M.rect(c, 1, 2, 3, 3, "#a07a44");
M.rect(c, 1, 2, 3, 1, "#c09858");
M.put(c, 2, 3, "#6a4a28");
M.rect(c, 5, 0, 5, 6, M.INK);
M.rect(c, 6, 1, 3, 4, "#7a4e2a");
M.rect(c, 6, 1, 3, 1, "#94643a");
M.rect(c, 6, 3, 3, 1, "#3a2414");
M.put(c, 2, 2, "#c83a2a");
M.put(c, 3, 2, "#e04a2a");
M.put(c, 7, 1, "#58b84a");
M.rect(c, 0, 6, 10, 1, "rgba(5,8,10,.35)");
end);
ctx:drawImage(s, x, y);
M.burnTint(ctx, s, x, y, p, h);
end;
-- levels/city:534
M.drawLamp = function(ctx, p, g) 
local x = __mfloor((p.x or __NaN) + 0.5);
local y = __mfloor((p.y or __NaN) + 0.5);
ctx.fillStyle = "rgba(5,8,10,.35)";
ctx:fillRect(x, y, 3, 1);
ctx.fillStyle = M.INK;
ctx:fillRect(x, (y - 6), 1, 6);
ctx:fillRect((x - 1), (y - 8), 3, 3);
ctx.fillStyle = ((__mfmod(__mfloor((((g.t or __NaN) * 3) + (p.seed or __NaN))), 7) ~= 0) and "#f4c860" or "#e8a040");
ctx:fillRect(x, (y - 7), 1, 1);
ctx.globalAlpha = 0.12;
ctx.fillStyle = "#ffd070";
ctx:fillRect((x - 3), (y - 9), 7, 6);
ctx.globalAlpha = 1;
end;
-- levels/city:542
M.drawFountain = function(ctx, p, g, h) 
local R = 9;
local x = (__mfloor((p.x or __NaN) + 0.5) - R);
local y = (__mfloor((p.y or __NaN) + 0.5) - R);
local s = h.sprite(("fountain|" .. __str(M.stageOf(p))), (R * 2), (R * 2), function(c) 
for yy = 0, (R * 2) - 1 do
for xx = 0, (R * 2) - 1 do
repeat
local d = __hypot(((xx - R) + 0.5), ((yy - R) + 0.5));
if (d > R) then
do break end;
end;
local l = (((-(xx - R)) - (yy - R)) / R);
if (d > (R - 1)) then
M.put(c, xx, yy, M.INK);
elseif (d > (R - 3)) then
M.put(c, xx, yy, M.STONEP[M.clamp((3 + __mfloor((l * 1.2) + 0.5)), 1, 5)]);
else
M.put(c, xx, yy, (function() if (d < 2.5) then return M.STONEP[4]; elseif (__band((xx + yy), 1) ~= 0) then return "#2e5a72"; else return "#346680"; end; end)());
end;
until true;
end;
end;
M.put(c, (R - 1), (R - 1), M.STONEP[5]);
if (M.stageOf(p) > 0) then
M.rect(c, 2, (R + 2), 3, 1, M.INK);
M.rect(c, (R + 3), 3, 1, 3, M.INK);
end;
end);
M.shadowRect(ctx, x, y, ((R * 2) - 3), ((R * 2) - 3));
ctx:drawImage(s, x, y);
local fr = __mfloor(((g.t or __NaN) * 6));
for i = 0, 4 - 1 do
ctx.fillStyle = ((__band(i, 1) ~= 0) and "#bfe8ff" or "#7fc0e0");
ctx:fillRect(((((x + R) - 1) + __i32((h.hash(i, fr) * 5))) - 2), (((y + R) - 3) + __i32((h.hash(fr, i) * 4))), 1, 1);
end;
M.burnTint(ctx, s, x, y, p, h);
end;
-- levels/city:564
M.drawRubble = function(ctx, p, g, h) 
local s = M.rubbleSprite(h, __mfmod((p.seed or __NaN), 4), false);
ctx:drawImage(s, (__mfloor((p.x or __NaN) + 0.5) - 4), (__mfloor((p.y or __NaN) + 0.5) - 3));
end;
-- levels/city:569
M.drawFolk = function(ctx, c, g) 
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
local run = (__T(c.moving) and __mfmod(__mfloor(((c.walk or __NaN) * 2)), 2) or 0);
local col = (((c.hitT or __NaN) > 0) and "#ffffff" or M.FOLK[__mfmod((__T(c.col) and c.col or 0), M.FOLK.length)]);
ctx.fillStyle = "rgba(8,10,6,.4)";
ctx:fillRect((x - 1), (y + 1), 3, 1);
ctx.fillStyle = M.INK;
ctx:fillRect(((x - 1) + run), y, 1, 1);
ctx:fillRect(((x + 1) - run), y, 1, 1);
ctx.fillStyle = col;
ctx:fillRect((x - 1), (y - 2), 3, 2);
ctx.fillStyle = "#e8b48a";
ctx:fillRect(x, (y - 3), 1, 1);
if (((c.scared or __NaN) > 0) or __T(c.bolting)) then
ctx.fillStyle = "#e8b48a";
ctx:fillRect((x - 1), ((y - 4) + run), 1, 1);
ctx:fillRect((x + 1), ((y - 4) + (1 - run)), 1, 1);
end;
end;
-- levels/city:578
M.drawFolkBody = function(ctx, c) 
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
ctx.fillStyle = "#7a1a14";
ctx:fillRect((x - 2), y, 5, 1);
ctx.fillStyle = M.FOLK[__mfmod(__i32(((c.x or __NaN) * 7)), M.FOLK.length)];
ctx:fillRect((x - 1), (y - 1), 3, 1);
ctx.fillStyle = "#e8b48a";
ctx:fillRect((x + 2), (y - 1), 1, 1);
end;
-- levels/city:585
M.shade = function(hex, k) 
local n = __parseInt(__slice(hex, 1), 16);
local f = function(v) 
return M.clamp((v + k), 0, 255);
end;
do return ("#" .. __str(__slice(__toString(__bor(__bor(__bor(__shl(1, 24), __shl(f(__shr(n, 16)), 16)), __shl(f(__band(__shr(n, 8), 255)), 8)), f(__band(n, 255))), 16), 1))) end;
end;
-- levels/city:598
M.paintGround = function(ctx, m, h, zone) 
local img = ctx:createImageData(m.w, m.h);
local d = img.data;
local hash, vnoise;
local __t98 = h; hash = __t98.hash; vnoise = __t98.vnoise;
for y = 0, __mceil(m.h) - 1 do
for x = 0, __mceil(m.w) - 1 do
local z = zone[((y * (m.w or __NaN)) + x)];
local grime = ((vnoise((x / 22), (y / 22)) < 0.32) and (-1) or 0);
local c;
if (z == 1) then
local sx = __mfloor(((x + (__mfmod(__mfloor((y / 7)), 2) * 4)) / 8));
local sy = __mfloor((y / 7));
local lx = __mfmod((x + (__mfmod(sy, 2) * 4)), 8);
local ly = __mfmod(y, 7);
if ((lx == 0) or (ly == 0)) then
c = M.MORTAR;
else
c = M.FLAG[M.clamp((((2 + __mfloor(((hash(sx, sy) - 0.5) * 2.5))) + (((lx == 1) or (ly == 1)) and 1 or 0)) + grime), 0, 4)];
end;
elseif (z == 2) then
c = M.FOUND[__mfloor((hash(x, y) * 3))];
elseif (z == 3) then
local ly = (function() local __t101 = (zone.kerbRow and zone.kerbRow[y]); if __t101 == nil then return 1 end; return __t101 end)();
if (__mfmod((x + (__mfloor((y / 3)) * 3)), 7) == 0) then c = M.KERB[0]; else c = M.KERB[ly]; end;
else
local row = __mfloor((y / 3));
local lx = __mfmod((x + (row * 2)), 5);
local ly = __mfmod(y, 3);
local sx = __mfloor(((x + (row * 2)) / 5));
if ((lx == 0) or (ly == 0)) then
if (hash((x * 3), (y * 5)) < 0.12) then c = M.COBBLE[1]; else c = M.MORTAR; end;
else
c = M.COBBLE[M.clamp(((((1 + __mfloor((hash(sx, row) * 2.6))) + (((lx == 1) and (ly == 1)) and 1 or 0)) - (((lx == 4) and (ly == 2)) and 1 or 0)) + grime), 0, 4)];
end;
end;
local i = (((y * (m.w or __NaN)) + x) * 4);
d[i] = c[0];
d[(i + 1)] = c[1];
d[(i + 2)] = c[2];
d[(i + 3)] = 255;
end;
end;
ctx:putImageData(img, 0, 0);
end;
-- levels/city:621
M.fillZone = function(zone, W, x0, y0, x1, y1, v) 
for y = __mmax(0, __mfloor(y0)), __mceil(__mmin(((zone.length or #zone) / W), __mceil(y1))) - 1 do
for x = __mmax(0, __mfloor(x0)), __mceil(__mmin(W, __mceil(x1))) - 1 do
zone[((y * W) + x)] = v;
end;
end;
end;
-- levels/city:626
M.sideWall = function(ctx, x0, w, y0, y1, h, east) 
do
local y = y0;
while (y < y1) do
do
local x = x0;
while (x < (x0 + w)) do
local merlon;
if __T(east) then merlon = (x == x0); else merlon = (x == ((x0 + w) - 1)); end;
local lit;
if __T(east) then lit = (x == (x0 + 1)); else lit = (x == x0); end;
local col = M.STONEP[(lit and 4 or 3)];
if (__mfmod((y + (__mfloor(((x - x0) / 3)) * 2)), 4) == 0) then
col = M.STONEP[2];
end;
if merlon then
if (__mfmod(y, 6) < 3) then col = M.STONEP[4]; else col = M.INK; end;
end;
M.put(ctx, x, y, col);
x = x + 1;
end;
end;
y = y + 1;
end;
end;
M.rect(ctx, (__T(east) and (x0 - 2) or (x0 + w)), y0, 2, (y1 - y0), "rgba(5,8,10,.35)");
end;
-- levels/city:638
M.ground = function(ctx, m, h) 
local zone = __typed("Uint8Array", ((m.w or __NaN) * (m.h or __NaN)));
do
local __t106, __t107 = __it(m.foots), 0;
while __t107 < __t106.length do
local f = __t106[__t107]; __t107 = __t107 + 1;
M.fillZone(zone, m.w, ((f.x0 or __NaN) - 1), ((f.y0 or __NaN) - 1), ((f.x1 or __NaN) + 1), ((f.y1 or __NaN) + 1), 2);
end;
end;
do
local __t109, __t110 = __it(m.plazas), 0;
while __t110 < __t109.length do
local p = __t109[__t110]; __t110 = __t110 + 1;
M.fillZone(zone, m.w, p.x0, p.y0, p.x1, p.y1, 1);
end;
end;
zone.kerbRow = __typed("Uint8Array", m.h);
do
local __t112, __t113 = __it(m.canals), 0;
while __t113 < __t112.length do
local c = __t112[__t113]; __t113 = __t113 + 1;
M.fillZone(zone, m.w, 0, ((c.y0 or __NaN) - 3), m.w, c.y0, 3);
M.fillZone(zone, m.w, 0, c.y1, m.w, ((c.y1 or __NaN) + 3), 3);
zone.kerbRow[((c.y0 or __NaN) - 3)] = 3;
zone.kerbRow[((c.y0 or __NaN) - 2)] = 2;
zone.kerbRow[((c.y0 or __NaN) - 1)] = 1;
zone.kerbRow[c.y1] = 2;
zone.kerbRow[((c.y1 or __NaN) + 1)] = 2;
zone.kerbRow[((c.y1 or __NaN) + 2)] = 1;
end;
end;
M.paintGround(ctx, m, h, zone);
for i = 0, 160 - 1 do
repeat
local x = __mfloor((h.hash(i, 71) * (m.w or __NaN)));
local y = __mfloor((h.hash(71, i) * (m.h or __NaN)));
if ((zone[((y * (m.w or __NaN)) + x)] or __NaN) > 1) then
do break end;
end;
local r = h.hash(i, i);
if (r < 0.25) then
M.rect(ctx, x, y, 3, 2, "#2a3a44");
M.put(ctx, (x + 1), y, "#5f7e8e");
elseif (r < 0.5) then
M.put(ctx, x, y, "#a88c44");
M.put(ctx, (x + 1), (y + 1), "#c4a85a");
elseif (r < 0.6) then
M.rect(ctx, x, y, 3, 3, M.INK);
M.put(ctx, (x + 1), (y + 1), "#55564f");
end;
until true;
end;
M.sideWall(ctx, 0, 6, 0, m.h, h, false);
M.sideWall(ctx, ((m.w or __NaN) - 6), 6, 0, m.h, h, true);
M.castleFront(ctx, m, h);
M.southGate(ctx, m, h);
end;
-- levels/city:665
M.castleFront = function(ctx, m, h) 
local face, bot;
local __t116 = M.FRONT; face = __t116.face; bot = __t116.bot;
for y = 0, __mceil(bot) - 1 do
for x = 0, __mceil(m.w) - 1 do
local col;
if (y < face) then
if (__mfmod(((x * 3) + (__mfloor((y / 3)) * 7)), 11) == 0) then col = M.STONEP[2]; else col = M.STONEP[((y < (face - 8)) and 3 or 4)]; end;
else
local course = __mfloor(((y - face) / 4));
local mortar = ((__mfmod((y - face), 4) == 3) or (__mfmod((x + (course * 5)), 10) == 0));
if mortar then col = M.STONEP[1]; else col = M.STONEP[M.clamp((((2 + ((h.hash(__mfloor(((x + (course * 5)) / 10)), course) > 0.65) and 1 or 0)) - ((y > (bot - 8)) and 1 or 0)) + ((y < (face + 3)) and 1 or 0)), 0, 5)]; end;
end;
M.put(ctx, x, y, col);
end;
end;
M.rect(ctx, 0, (face - 8), m.w, 1, M.STONEP[1]);
for x = 0, __mceil(m.w) - 1, 7 do
M.rect(ctx, x, (face - 6), 5, 6, M.INK);
M.rect(ctx, x, (face - 6), 4, 5, M.STONEP[4]);
M.rect(ctx, x, (face - 6), 4, 1, M.STONEP[5]);
end;
M.rect(ctx, 0, face, m.w, 1, M.INK);
for x = 12, __mceil(m.w) - 1, 24 do
if ((x < 100) or (x > 220)) then
M.rect(ctx, x, (face + 14), 2, 6, M.INK);
end;
end;
M.rect(ctx, 0, bot, m.w, 1, M.INK);
M.rect(ctx, 0, (bot + 1), m.w, 4, "rgba(5,8,10,.4)");
do
local __t121, __t122 = __it(M.TOWER_X), 0;
while __t122 < __t121.length do
local cx = __t121[__t122]; __t122 = __t122 + 1;
local R = 17;
local cy = 20;
for y = 0, __mceil((bot + 8)) - 1 do
for x = ((-R) - 1), (R + 1) do
repeat
local X = (cx + x);
local inTop = (__hypot(x, ((y - cy) * 1.2)) <= R);
local inBody = (((y >= cy) and (__mabs(x) <= R)) and (y < (bot + 6)));
if ((not inTop) and (not inBody)) then
if (((__hypot(x, ((y - cy) * 1.2)) <= (R + 1.2)) or (((y >= cy) and (__mabs(x) == (R + 1))) and (y < (bot + 7)))) or ((y == (bot + 6)) and (__mabs(x) <= R))) then
M.put(ctx, X, y, M.INK);
end;
do break end;
end;
local col;
if inTop then
local d = __hypot(x, ((y - cy) * 1.2));
local rim = (d > (R - 3));
if rim then col = (function() if (__mfmod(__mfloor(((__matan2((y - cy), x) + 4) * 5)), 2) ~= 0) then return M.STONEP[5]; else return M.STONEP[3]; end; end)(); elseif (h.hash(X, y) > 0.8) then col = M.STONEP[1]; else col = M.STONEP[2]; end;
if (rim and (d > (R - 1))) then
col = M.INK;
end;
else
local l = ((x < ((-R) * 0.5)) and 4 or ((x < (R * 0.3)) and 3 or ((x < (R * 0.75)) and 2 or 1)));
local course = __mfloor((y / 4));
if ((__mfmod(y, 4) == 3) or (__mfmod(((x + (course * 3)) + 40), 8) == 0)) then col = M.STONEP[__mmax(0, (l - 2))]; else col = M.STONEP[l]; end;
end;
M.put(ctx, X, y, col);
until true;
end;
end;
M.rect(ctx, (cx - 5), 40, 11, 22, M.INK);
M.rect(ctx, (cx - 4), 40, 9, 20, "#8a1e18");
M.rect(ctx, (cx - 4), 40, 9, 1, "#c83a2a");
M.rect(ctx, (cx - 4), 40, 2, 20, "#a82a20");
M.rect(ctx, (cx - 2), 46, 5, 1, "#ffd75a");
M.put(ctx, (cx - 2), 45, "#ffd75a");
M.put(ctx, cx, 45, "#ffd75a");
M.put(ctx, (cx + 2), 45, "#ffd75a");
M.rect(ctx, (cx - 2), 47, 5, 1, "#c8962a");
M.rect(ctx, (cx - 4), 60, 2, 2, "#8a1e18");
M.rect(ctx, (cx + 3), 60, 2, 2, "#8a1e18");
M.rect(ctx, (cx - 1), 66, 3, 5, M.INK);
M.put(ctx, cx, 68, "#e8b850");
end;
end;
local gx0 = (M.GATE_X0 + 1);
local gx1 = (M.GATE_X1 - 1);
local gy = 44;
local gw = (gx1 - gx0);
local mid = (((gx0 + gx1) - 1) / 2);
local archTop = function(x) 
return ((gy + 9) - (__msqrt(__mmax(0, (1 - (((x - mid) / (gw / 2)) ^ 2)))) * 9));
end;
for y = (gy - 4), __mceil(bot) - 1 do
do
local x = (gx0 - 3);
while (x < (gx1 + 3)) do
repeat
local t = archTop(M.clamp(x, gx0, (gx1 - 1)));
if (((x < (gx0 - 1)) or (x > gx1)) or (y < (t - 3))) then
if ((((y >= (t - 4)) and (y < (t - 1))) and (x >= (gx0 - 3))) and (x < (gx1 + 3))) then
M.put(ctx, x, y, (function() if (__mfmod((x + y), 3) == 0) then return M.STONEP[3]; else return M.STONEP[4]; end; end)());
end;
do break end;
end;
if (((y < (t - 1)) or (x == (gx0 - 1))) or (x == gx1)) then
M.put(ctx, x, y, M.INK);
do break end;
end;
if (y < (t + 1)) then
M.put(ctx, x, y, M.STONEP[1]);
do break end;
end;
local lx = (x - gx0);
local ly = (y - gy);
local col = ((__mfmod(lx, 3) == 0) and "#3a2414" or ((lx < (gw / 2)) and "#6e4a2a" or "#5a3a22"));
if (__mabs((x - mid)) < 0.6) then
col = "#1a100a";
end;
if (__mfmod(ly, 9) == 5) then
col = "#2e2e30";
end;
M.put(ctx, x, y, col);
until true;
x = x + 1;
end;
end;
end;
do
local x = (gx0 + 1);
while (x < gx1) do
for y = (__mceil(archTop(x)) + 1), __mceil(bot) - 1 do
M.put(ctx, x, y, ((__mfmod(y, 2) ~= 0) and "#62626a" or "#4a4a52"));
end;
x = (x + 3);
end;
end;
for y = (gy + 2), __mceil(bot) - 1, 5 do
do
local x = gx0;
while (x < gx1) do
if (y > (archTop(x) + 1)) then
M.put(ctx, x, y, ((__mfmod(x, 3) == 1) and "#8a8a92" or "#3a3a40"));
end;
x = x + 1;
end;
end;
end;
do
local x = (gx0 + 1);
while (x < gx1) do
M.put(ctx, x, (bot - 1), "#a9a9b2");
x = (x + 3);
end;
end;
M.rect(ctx, (gx0 - 2), (bot - 1), (gw + 4), 1, M.INK);
M.rect(ctx, (gx0 - 4), (face - 8), (gw + 8), 2, M.STONEP[5]);
M.rect(ctx, (gx0 - 4), (face - 6), (gw + 8), 1, M.INK);
do
local __t133, __t134 = __it({[0]=(gx0 - 8), (gx1 + 5), length=2}), 0;
while __t134 < __t133.length do
local tx = __t133[__t134]; __t134 = __t134 + 1;
M.rect(ctx, tx, 56, 3, 4, M.INK);
M.put(ctx, (tx + 1), 54, "#ffa22b");
M.put(ctx, (tx + 1), 55, "#fff07a");
M.put(ctx, (tx + 1), 53, "#d64a18");
end;
end;
end;
-- levels/city:737
M.breachSprite = function(h, s) 
local W = (((s.x1 or __NaN) - (s.x0 or __NaN)) + 2);
local Hh = ((s.bot or __NaN) + 10);
local kind = s.kind;
local seed = (((s.x0 or __NaN) * 7) + 3);
do return h.sprite(("cfbreach|" .. __str(s.x0) .. "|" .. __str(kind)), W, Hh, function(c) 
local edgeL = function(y) 
return (1 + __mfloor(((h.hash(seed, __mfloor((y / 3))) * 3) + ((y < (M.FRONT.face or __NaN)) and 1 or 0))));
end;
local edgeR = function(y) 
return ((W - 2) - __mfloor(((h.hash(__mfloor((y / 3)), seed) * 3) + ((y < (M.FRONT.face or __NaN)) and 1 or 0))));
end;
for y = 0, __mceil(s.bot) - 1 do
local a = edgeL(y);
local b = edgeR(y);
for x = 0, __mceil(W) - 1 do
local col;
if ((x < (a - 1)) or (x > (b + 1))) then
col = nil;
elseif ((x == (a - 1)) or (x == (b + 1))) then
col = M.INK;
elseif ((x == a) or (x == b)) then
if (__mfmod((y + x), 4) == 0) then col = M.STONEP[1]; elseif (x == a) then col = M.STONEP[4]; else col = M.STONEP[2]; end;
else
local k = (y / (s.bot or __NaN));
local row = __mfloor((y / 3));
local lx = __mfmod((x + (row * 2)), 5);
local base = (((lx == 0) or (__mfmod(y, 3) == 0)) and 0 or (1 + __mfloor((h.hash((__mfloor(((x + (row * 2)) / 5)) + seed), row) * 2))));
col = M.COBBLE_HEX[M.clamp(((base - ((k < 0.4) and 1 or 0)) - ((x > (b - 3)) and 1 or 0)), 0, 4)];
if (y < 4) then
col = "#1a1712";
end;
end;
if __T(col) then
M.put(c, x, y, col);
end;
end;
end;
local nS = __mfloor((W / 3) + 0.5);
for i = 0, nS - 1 do
local x = __mfloor((h.hash(i, (seed + 1)) * (W - 3)));
local y = (((s.bot or __NaN) - 8) + __mfloor((h.hash((seed + 1), i) * 14)));
local z = (1 + ((h.hash(i, 7) > 0.6) and 1 or 0));
M.rect(c, x, y, (z + 2), (z + 2), M.INK);
M.rect(c, (x + 1), (y + 1), z, z, M.STONEP[(2 + __mfmod(i, 3))]);
M.put(c, (x + 1), (y + 1), M.STONEP[5]);
end;
if (kind == "cf_gate") then
for i = 0, 6 - 1 do
local x = ((2 + (i * 3)) + ((i > 2) and 2 or 0));
local y = (((s.bot or __NaN) - 14) + (__mfmod(i, 2) * 2));
M.rect(c, x, y, 2, 11, M.INK);
M.rect(c, x, y, 1, 10, ((__mfmod(i, 2) ~= 0) and "#6e4a2a" or "#5a3a22"));
end;
for x = 1, __mceil((W - 2)) - 1 do
local y = (((s.bot or __NaN) - 9) + __mfloor((__msin((x * 0.7)) * 1.5) + 0.5));
M.put(c, x, y, "#62626a");
if (__mfmod(x, 3) == 0) then
M.put(c, x, (y + 1), "#3a3a40");
end;
end;
end;
end) end;
end;
-- levels/city:774
M.southGate = function(ctx, m, h) 
local y0 = ((m.h or __NaN) - 14);
do
local y = y0;
while (y < (m.h or __NaN)) do
for x = 0, __mceil(m.w) - 1 do
repeat
if ((x > 138) and (x < 182)) then
do break end;
end;
M.put(ctx, x, y, ((y == y0) and M.INK or (function() if (y == (y0 + 1)) then return M.STONEP[4]; elseif (__mfmod((x + y), 5) == 0) then return M.STONEP[1]; else return M.STONEP[3]; end; end)()));
until true;
end;
y = y + 1;
end;
end;
for x = 0, __mceil(m.w) - 1, 6 do
if ((x < 136) or (x > 184)) then
M.rect(ctx, x, (y0 - 3), 4, 3, M.STONEP[4]); M.rect(ctx, x, (y0 - 3), 4, 1, M.INK);
end;
end;
M.rect(ctx, 136, (y0 - 4), 4, 18, M.INK);
M.rect(ctx, 181, (y0 - 4), 4, 18, M.INK);
end;
-- levels/city:785
M.under = function(ctx, g, h) 
local m = g.map;
if (__T(m.front) and ((h.VIEW.y or __NaN) < ((M.FRONT.bot or __NaN) + 12))) then
do
local __t144, __t145 = __it(m.front), 0;
while __t145 < __t144.length do
local s = __t144[__t145]; __t145 = __t145 + 1;
if (s.prop.state ~= "up") then
ctx:drawImage(M.breachSprite(h, s), ((s.x0 or __NaN) - 1), 0);
end;
end;
end;
end;
do
local __t147, __t148 = __it(m.canals), 0;
while __t148 < __t147.length do
repeat
local c = __t147[__t148]; __t148 = __t148 + 1;
if ((((c.y1 or __NaN) + 6) < (h.VIEW.y or __NaN)) or (((c.y0 or __NaN) - 6) > ((h.VIEW.y or __NaN) + (h.H or __NaN)))) then
do break end;
end;
do
local __t150, __t151 = __it(c.bridges), 0;
while __t151 < __t150.length do
local b = __t150[__t151]; __t151 = __t151 + 1;
local s = h.sprite(("bridge|" .. __str(((b.x1 or __NaN) - (b.x0 or __NaN)))), ((b.x1 or __NaN) - (b.x0 or __NaN)), (M.CANAL_H + 6), function(cc) 
local W = ((b.x1 or __NaN) - (b.x0 or __NaN));
local Hh = (M.CANAL_H + 6);
for y = 0, __mceil(Hh) - 1 do
for x = 0, __mceil(W) - 1 do
local ry = __mfloor((y / 3));
local lx = __mfmod((x + (ry * 2)), 5);
M.put(cc, x, y, (((lx == 0) or (__mfmod(y, 3) == 0)) and "#3a3730" or M.COBBLE_HEX[(1 + __i32((h.hash(__mfloor(((x + (ry * 2)) / 5)), ry) * 3)))]));
end;
end;
do
local __t155, __t156 = __it({[0]=0, (W - 3), length=2}), 0;
while __t156 < __t155.length do
local px = __t155[__t156]; __t156 = __t156 + 1;
M.rect(cc, px, 0, 3, Hh, M.INK);
for y = 1, __mceil((Hh - 1)) - 1 do
M.put(cc, (px + 1), y, (function() if (__mfmod(y, 4) == 0) then return M.STONEP[2]; else return M.STONEP[4]; end; end)());
M.put(cc, (px + (__T(px) and 1 or 2)), y, M.STONEP[(__T(px) and 2 or 3)]);
end;
end;
end;
M.rect(cc, 3, (Hh - 2), (W - 6), 1, "rgba(10,14,16,.5)");
end);
ctx:drawImage(s, b.x0, ((c.y0 or __NaN) - 3));
end;
end;
until true;
end;
end;
if __T(g.ruins) then
do
local __t159, __t160 = __it(g.ruins), 0;
while __t160 < __t159.length do
repeat
local r = __t159[__t160]; __t160 = __t160 + 1;
if ((((r.y or __NaN) + (r.h or __NaN)) < ((h.VIEW.y or __NaN) - 4)) or (((r.y or __NaN) - (r.h or __NaN)) > (((h.VIEW.y or __NaN) + (h.H or __NaN)) + 4))) then
do break end;
end;
ctx:drawImage(M.ruinSprite(h, r), (__mfloor(((r.x or __NaN) - ((r.w or __NaN) / 2)) + 0.5) - 1), (__mfloor(((r.y or __NaN) - ((r.h or __NaN) / 2)) + 0.5) - 1));
until true;
end;
end;
end;
end;
-- levels/city:816
M.drawFront = function(ctx, p, g, h) 
local st = __mmin(4, __mfloor(((1 - ((p.hp or __NaN) / (p.maxhp or __NaN))) * 5)));
local x0 = __mfloor(((p.x or __NaN) - ((p.w or __NaN) / 2)) + 0.5);
local top = M.FRONT.face;
if (st > 0) then
local s = h.sprite(("cfcrack|" .. __str(p.kind) .. "|" .. __str(p.w) .. "|" .. __str(st) .. "|" .. __str(__mfmod((p.seed or __NaN), 5))), p.w, p.h, function(c) 
local seed = ((__mfmod((p.seed or __NaN), 5) * 17) + 3);
local n = ((st * 2) + (((p.w or __NaN) > 30) and 1 or 0));
for i = 0, __mceil(n) - 1 do
local x = (2 + __mfloor((h.hash(i, seed) * ((p.w or __NaN) - 4))));
local y = ((top + 2) + __mfloor((h.hash(seed, i) * 10)));
local len = (10 + __mfloor((h.hash((i * 3), seed) * (14 + (st * 6)))));
do
local k = 0;
while ((k < len) and (y < ((p.h or __NaN) - 1))) do
M.put(c, x, y, "#120e0a");
if (__mfmod(k, 3) == 1) then
M.put(c, (x + 1), y, M.STONEP[1]);
end;
y = y + 1;
if (h.hash(k, (i + seed)) > 0.62) then
x = (x + ((h.hash(i, (k + seed)) > 0.5) and 1 or (-1)));
end;
x = M.clamp(x, 1, ((p.w or __NaN) - 2));
k = k + 1;
end;
end;
end;
for i = 0, (st * 3) - 1 do
local x = __mfloor((h.hash((i + 40), seed) * ((p.w or __NaN) - 3)));
local y = ((__mfmod(i, 2) ~= 0) and ((top - 6) + __mfloor((h.hash(seed, (i + 40)) * 4))) or ((top + 6) + __mfloor((h.hash(seed, (i + 40)) * (((p.h or __NaN) - top) - 10)))));
M.rect(c, x, y, (2 + __mfmod(i, 2)), 2, "#14110d");
M.put(c, x, (y + 2), M.STONEP[1]);
end;
end);
ctx:drawImage(s, x0, 0);
end;
if ((p.hitT or __NaN) > 0) then
ctx.globalAlpha = (((p.hitT or __NaN) / 0.12) * 0.3);
ctx.fillStyle = "#ffffff";
ctx:fillRect(x0, top, p.w, ((p.h or __NaN) - top));
ctx.globalAlpha = 1;
end;
end;

-- levels/city:9
M.TAU = (math.pi * 2);
-- levels/city:10
M.clamp = function(v, a, b) 
return (function() if (v < a) then return a; elseif (v > b) then return b; else return v; end; end)();
end;
-- levels/city:11
M.INK = "#14100c";
-- levels/city:15
M.MW = 320;
M.MH = 900;
M.CANAL_H = 18;
M.BR_W = 36;
-- levels/city:18
M.FRONT = {face=30, bot=74};
-- levels/city:19
M.BASH = 45;
-- levels/city:20
M.HITS = {cf_wall=20, cf_tower=24, cf_gate=18};
-- levels/city:21
M.LABEL = {cf_wall="WALL", cf_tower="TOWER", cf_gate="GATE"};
-- levels/city:22
M.GATE_X0 = 147;
M.GATE_X1 = 173;
M.TOWER_X = {[0]=114, 206, length=2};
-- levels/city:23
M.FRONT_SECS = {[0]={[0]=0, 52, "cf_wall", length=3}, {[0]=52, 97, "cf_wall", length=3}, {[0]=97, M.GATE_X0, "cf_tower", length=3}, {[0]=M.GATE_X0, M.GATE_X1, "cf_gate", length=3}, {[0]=M.GATE_X1, 223, "cf_tower", length=3}, {[0]=223, 268, "cf_wall", length=3}, {[0]=268, M.MW, "cf_wall", length=3}, length=7};
-- levels/city:24
M.CANALS = {[0]={y=798, br={[0]=252, length=1}}, {y=600, br={[0]=144, length=1}}, {y=402, br={[0]=36, 222, length=2}}, {y=204, br={[0]=246, length=1}}, length=4};
-- levels/city:31
M.BANDS = {[0]={yB=798, row1={[0]={[0]=40, 70, length=2}, {[0]=200, 230, length=2}, length=2}, row2={[0]={[0]=100, 130, length=2}, {[0]=262, 292, length=2}, length=2}}, {yB=600, row1={[0]={[0]=60, 90, length=2}, {[0]=250, 280, length=2}, length=2}, row2={[0]={[0]=160, 190, length=2}, length=1}}, {yB=402, row1={[0]={[0]=130, 160, length=2}, length=1}, row2={[0]={[0]=20, 50, length=2}, {[0]=200, 230, length=2}, length=2}}, length=3};
-- levels/city:39
M.STONE = {solid=true, rubble="city_rubble", rubbleN=2, onDown=M.ruinOf};
-- levels/city:40
M.TIMBER = __assignKV(__assign({}, M.STONE), "flammable", true, "fireVenge", false, "spread", 0.3, "crushShare", 0.75, "rubbleN", 1);
-- levels/city:41
M.FRONTK = {solid=true, rubble="city_rubble", rubbleN=3, value={pts=0, venge=0, chaos=0}};
-- levels/city:42
M.kinds = {cf_wall=__assignKV(__assign({}, M.FRONTK), "w", 45, "h", 74, "hp", ((M.HITS.cf_wall or __NaN) * M.BASH)), cf_tower=__assignKV(__assign({}, M.FRONTK), "w", 50, "h", 80, "hp", ((M.HITS.cf_tower or __NaN) * M.BASH), "rubbleN", 4), cf_gate=__assignKV(__assign({}, M.FRONTK), "w", 26, "h", 74, "hp", ((M.HITS.cf_gate or __NaN) * M.BASH), "rubbleN", 2), city_house=__assignKV(__assign({}, M.STONE), "w", 30, "h", 24, "hp", 300, "value", {pts=300, venge=0.16, chaos=1}), city_chapel=__assignKV(__assign({}, M.STONE), "w", 40, "h", 48, "hp", 560, "rubbleN", 4, "value", {pts=650, venge=0.32, chaos=2}), city_shop=__assignKV(__assign({}, M.TIMBER), "w", 26, "h", 24, "hp", 190, "burnTime", 9, "value", {pts=240, venge=0.14, chaos=1}), city_pub=__assignKV(__assign({}, M.TIMBER), "w", 30, "h", 24, "hp", 220, "burnTime", 8, "spread", 0.4, "value", {pts=280, venge=0.16, chaos=1}), city_inn=__assignKV(__assign({}, M.TIMBER), "w", 40, "h", 48, "hp", 380, "burnTime", 12, "rubbleN", 3, "value", {pts=450, venge=0.25, chaos=2}), city_fountain=__assignKV(__assign({}, M.STONE), "r", 8, "w", 0, "h", 0, "hp", 260, "rubbleN", 3, "value", {pts=300, venge=0.16, chaos=1}), city_tent={w=14, h=10, hp=1, flammable=true, fireVenge=false, burnTime=3, spread=0.35, crushShare=0.8, value={pts=70, venge=0.05, chaos=0.3}}, city_stall={w=10, h=6, hp=1, flammable=true, fireVenge=false, burnTime=3, spread=0.3, crushShare=0.8, value={pts=40, venge=0.03, chaos=0.2}}, city_lamp={r=1.5, hp=1, value={pts=15, venge=0.015, chaos=0.05}}, city_rubble={r=3, push=true, fill=2, value={pts=0, venge=0, chaos=0}}};
-- levels/city:57
M.critters = {city_folk={r=2, hp=15, spd=12, flee=34, fear=44, value={pts=35, venge=0.025, chaos=0.1}}};
-- levels/city:66
M.BIG = {city_inn=1, city_chapel=1};
-- levels/city:267
M.STONEP = {[0]="#3a3a35", "#55564f", "#6b6c63", "#8f8f84", "#aeac9b", "#c8c5b2", length=6};
-- levels/city:268
M.ROOF = {slate={[0]="#1e2630", "#2c3744", "#3c4a59", "#4f6072", "#66798c", "#8496a8", length=6}, tile={[0]="#3a1610", "#5a2218", "#7a3020", "#9a4028", "#b85834", "#d47a4c", length=6}, shingle={[0]="#24180f", "#3a2716", "#4e341e", "#644328", "#7c5634", "#966a42", length=6}, thatch={[0]="#3e3016", "#5c4a22", "#7a642e", "#98803a", "#b49c4c", "#d0ba66", length=6}};
-- levels/city:274
M.ROOF_PAL = M.ROOF;
-- levels/city:275
M.PLASTER = {[0]="#7a6a4a", "#a8966e", "#c8b88e", "#e0d2aa", length=4};
-- levels/city:276
M.BEAM = "#3e2716";
-- levels/city:277
M.GLASS = "#1a222c";
M.LIT = "#e8b850";
-- levels/city:278
M.TENT = {[0]={[0]="#a8302a", "#e2d6b8", length=2}, {[0]="#2e5a9a", "#e2d6b8", length=2}, {[0]="#3e7a3a", "#e8dcb8", length=2}, {[0]="#c8962a", "#6a2a1e", length=2}, length=4};
-- levels/city:279
M.FOLK = {[0]="#7a3a2a", "#3a5a7a", "#5a6a2a", "#8a6a3a", "#6a3a6a", "#9a8a6a", length=6};
-- levels/city:473
M.stageOf = function(p) 
return ((((p.hp or __NaN) / (p.maxhp or __NaN)) < 0.34) and 2 or ((((p.hp or __NaN) / (p.maxhp or __NaN)) < 0.67) and 1 or 0));
end;
-- levels/city:592
M.rgb = function(hex) 
local n = __parseInt(__slice(hex, 1), 16);
do return {[0]=__shr(n, 16), __band(__shr(n, 8), 255), __band(n, 255), length=3} end;
end;
-- levels/city:593
M.COBBLE = __map({[0]="#3c3933", "#48443c", "#534e45", "#5e584d", "#6a6356", length=5}, M.rgb);
-- levels/city:594
M.FLAG = __map({[0]="#4e4a42", "#5e594f", "#6a6559", "#777164", "#847d6e", length=5}, M.rgb);
-- levels/city:595
M.MORTAR = M.rgb("#33302a");
M.FOUND = __map({[0]="#2a2620", "#322d26", "#3a342b", length=3}, M.rgb);
M.KERB = __map({[0]="#3a3833", "#6e6a5e", "#8d8878", "#a8a290", length=4}, M.rgb);
-- levels/city:812
M.COBBLE_HEX = {[0]="#3c3933", "#48443c", "#534e45", "#5e584d", "#6a6356", length=5};
-- levels/city:842
M.props = {city_house=M.drawBuilding, city_shop=M.drawBuilding, city_pub=M.drawBuilding, city_inn=M.drawBuilding, city_chapel=M.drawBuilding, city_tent=M.drawTent, city_stall=M.drawStall, city_lamp=M.drawLamp, city_fountain=M.drawFountain, city_rubble=M.drawRubble, cf_wall=M.drawFront, cf_tower=M.drawFront, cf_gate=M.drawFront};
M.default = {n=6, id="city", name="INSIDE THE WALLS", sub="GO NORTH TO THE CASTLE. BREAK YOUR WAY IN.", mode="timed", kinds=M.kinds, critters=M.critters, build=function(g, rng, P) 
do return M.build(g, rng, P) end;
end, update=M.update, hud=M.hud, art={ground=M.ground, under=M.under, props=M.props, critters={city_folk=M.drawFolk}, corpses={city_folk=M.drawFolkBody}, canopy=false, theme={leash=false}}};
