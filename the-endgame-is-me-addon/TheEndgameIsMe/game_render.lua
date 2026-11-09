-- Generated from the-endgame-is-me/js/render.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("render");
local __I0 = RT.module("art");
local __I1 = RT.module("world");
local __I2 = RT.module("levels/index");
local __I3 = RT.module("props");
local __Map, __Set, __T, __assign, __band, __ch, __charAt, __fill, __find, __forEach, __get, __has, __hypot, __i32, __it, __join, __map, __orv, __pack, __padStart, __parseInt, __push, __sarr, __set, __setlen, __slice, __some, __sort, __split, __str, __toFixed, __typed, __unpack = RT["Map"], RT["Set"], RT["T"], RT["assign"], RT["band"], RT["ch"], RT["charAt"], RT["fill"], RT["find"], RT["forEach"], RT["get"], RT["has"], RT["hypot"], RT["i32"], RT["it"], RT["join"], RT["map"], RT.orv, RT["pack"], RT["padStart"], RT["parseInt"], RT["push"], RT["sarr"], RT["set"], RT["setlen"], RT["slice"], RT["some"], RT["sort"], RT["split"], RT["str"], RT["toFixed"], RT["typed"], RT["unpack"];
local __NaN = 0 / 0;
local __mabs, __matan2, __mceil, __mcos, __mfloor, __mfmod, __mmax, __mmin, __msin = math.abs, math.atan2, math.ceil, math.cos, math.floor, math.fmod, math.max, math.min, math.sin;

-- render:20
M.sprite = function(key, w, h, paint) 
local c = __get(M.sprites, key);
if __T(c) then
do return c end;
end;
local pre = ((((__join(__split(key, "|", 2), "|") .. "#") .. __str(w)) .. "x") .. __str(h));
if ((M.spriteBudget <= 0) and __has(M.similar, pre)) then
do return __get(M.similar, pre) end;
end;
local t0 = RT.perfNow();
c = __I0.newCanvas(w, h);
paint(c:getContext("2d"));
__set(M.sprites, key, c);
__set(M.similar, pre, c);
M.spriteBudget = (M.spriteBudget - (RT.perfNow() - t0));
do return c end;
end;
-- render:35
M.vnoise = function(x, y) 
local xi = __mfloor(x);
local yi = __mfloor(y);
local xf = (x - xi);
local yf = (y - yi);
local s = function(t) 
return ((t * t) * (3 - (2 * t)));
end;
local a = __I0.hash(xi, yi);
local b = __I0.hash((xi + 1), yi);
local c = __I0.hash(xi, (yi + 1));
local d = __I0.hash((xi + 1), (yi + 1));
local u = s(xf);
local v = s(yf);
do return (((a + ((b - a) * u)) + ((c - a) * v)) + (((((a - b) - c) + d) * u) * v)) end;
end;
-- render:57
M.setCalm = function(on) 
M.calm = on;
end;
-- render:59
M.createRenderer = function() 
local render, drawBoss, reset;
local buf = RT.host.makeScreen(__I1.W, __I1.H);
local ctx = buf:getContext("2d");
local shadow = M.makeShadow();
local trail = __I0.newCanvas(__I1.W, __I1.H);
local tctx = trail:getContext("2d");
local boss = nil;
local bg = nil;
local fg = nil;
local bgFor = nil;
render = function(g, view) if view == nil then view = {} end;
if ((not __T(boss)) or (boss.key ~= __I0.bossKey(g.look))) then
boss = __I0.makeBossSprites(g.look);
end;
local m = g.map;
local art = (__T(m.level.art) and m.level.art or {});
if (bgFor ~= m) then
if (m.mode == "patrol") then bg = M.makeBackground(m); else bg = M.makeGround(m); end;
if (__T(art.decorate) and (not __T(m.plain))) then
art.decorate(bg:getContext("2d"), m, M.H_ART);
end;
if __T(art.canopy) then fg = M.makeForeground(m.theme.id); else fg = nil; end;
bgFor = m;
trail = __I0.newCanvas(m.w, m.h);
tctx = trail:getContext("2d");
end;
M.VIEW.x = __mfloor((g.cam.x or __NaN) + 0.5);
M.VIEW.y = __mfloor((g.cam.y or __NaN) + 0.5);
M.spriteBudget = 6;
ctx:setTransform(1, 0, 0, 1, 0, 0);
ctx.globalAlpha = 1;
local s = ((((g.shake or __NaN) > 0) and (not __T(M.calm))) and __mceil(((g.shake or __NaN) * 4)) or 0);
local ox = ((s ~= 0) and ((__mfmod(__mfloor(((g.t or __NaN) * 40)), 2) ~= 0) and s or (-s)) or 0);
local oy = ((s ~= 0) and (((__mfmod(__mfloor(((g.t or __NaN) * 33)), 2) ~= 0) and s or (-s)) * 0.6) or 0);
buf.shakeX = __mfloor(ox + 0.5);
buf.shakeY = __mfloor(oy + 0.5);
do
local __t5, __t6 = __it(g.ashes), 0;
while __t6 < __t5.length do
local a = __t5[__t6]; __t6 = __t6 + 1;
if (not __T(a.stamped)) then
a.stamped = true;
M.stampAsh(tctx, a);
end;
end;
end;
do
local __t8, __t9 = __it(g.steps), 0;
while __t9 < __t8.length do
local st = __t8[__t9]; __t9 = __t9 + 1;
local px = (-__msin((st.face or __NaN)));
local py = __mcos((st.face or __NaN));
local sd = (__T(st.side) and 6 or (-6));
tctx.fillStyle = "rgba(40,30,18,0.16)";
tctx:fillRect(__mfloor((((st.x or __NaN) + (px * sd)) + (__mcos((st.face or __NaN)) * 3)) + 0.5), __mfloor((((st.y or __NaN) + (py * sd)) + (__msin((st.face or __NaN)) * 3)) + 0.5), 2, 2);
end;
end;
__setlen(g.steps, 0);
buf.begin(bg, trail, M.VIEW.x, M.VIEW.y, fg);
ctx:translate((-(M.VIEW.x or __NaN)), (-(M.VIEW.y or __NaN)));
if __T(g.water) then
M.drawWater(ctx, g);
end;
if art.under then art.under(ctx, g, M.H_ART); end;
do
local __t11, __t12 = __it(g.ice), 0;
while __t12 < __t11.length do
local i = __t11[__t12]; __t12 = __t12 + 1;
M.drawIce(ctx, i, g);
end;
end;
M.drawFires(ctx, g);
M.drawTelegraph(ctx, g);
do
local __t14, __t15 = __it(g.corpses), 0;
while __t15 < __t14.length do
local c = __t14[__t15]; __t15 = __t15 + 1;
if M.onScreen(c.x, c.y) then
M.drawCorpse(ctx, c);
end;
end;
end;
do
local __t17, __t18 = __it(g.rings), 0;
while __t18 < __t17.length do
local r = __t17[__t18]; __t18 = __t18 + 1;
if (r.col ~= "slash") then
M.drawRing(ctx, r);
end;
end;
end;
local patrol = ((m.mode == "patrol") and (not __T(m.plain)));
if (patrol and (not __T(g.clear))) then
M.drawMarker(ctx, g, false);
end;
local list = {length=0};
do
local __t20, __t21 = __it(g.units), 0;
while __t21 < __t20.length do
local u = __t20[__t21]; __t21 = __t21 + 1;
if (u.role == "rider") then
if (not __T(u.mounted)) then
__push(list, {y=u.horse.y, f=function() 
return M.drawHorse(ctx, u.horse.x, u.horse.y, u.horse.face, u.horse.walk, false, g.t);
end});
end;
if (u.state ~= "climb") then
__push(list, {y=u.y, f=function() 
return M.drawRider(ctx, u, g);
end});
end;
else
__push(list, {y=u.y, f=function() 
return M.drawUnit(ctx, u, g);
end});
end;
end;
end;
do
local __t23, __t24 = __it(g.parts), 0;
while __t24 < __t23.length do
local p = __t23[__t24]; __t24 = __t24 + 1;
if __T(p.horse) then
__push(list, {y=p.y, f=function() 
return M.drawHorse(ctx, p.x, p.y, p.face, p.walk, false, g.t);
end});
end;
end;
end;
do
local __t26, __t27 = __it(g.adds), 0;
while __t27 < __t26.length do
local a = __t26[__t27]; __t27 = __t27 + 1;
__push(list, {y=a.y, f=function() 
return M.drawAdd(ctx, a, g);
end});
end;
end;
do
local __t29, __t30 = __it(g.props), 0;
while __t30 < __t29.length do
repeat
local p = __t29[__t30]; __t30 = __t30 + 1;
if ((p.state == "gone") or (not M.onScreen(p.x, p.y, 40))) then
do break end;
end;
local draw = M.PROP_ART[p.kind];
if (not __T(draw)) then
do break end;
end;
__push(list, {y=((p.state == "down") and ((p.y or __NaN) - 40) or (((p.y or __NaN) + (__T(p.h) and ((p.h or __NaN) / 2) or 0)) + (__T(p.sortY) and p.sortY or 0))), f=function() 
draw(ctx, p, g, M.H_ART);
if __T(p.burning) then
M.drawFlames(ctx, p, g.t);
end;
end});
until true;
end;
end;
do
local __t32, __t33 = __it(g.critters), 0;
while __t33 < __t32.length do
local c = __t32[__t33]; __t33 = __t33 + 1;
if M.onScreen(c.x, c.y) then
__push(list, {y=c.y, f=function() 
return ((__T(M.CRITTER_ART[c.kind]) and M.CRITTER_ART[c.kind] or M.drawCritter))(ctx, c, g, M.H_ART);
end});
end;
end;
end;
__push(list, {y=((g.boss.y or __NaN) + 2), f=function() 
return drawBoss(ctx, g);
end});
__sort(list, function(a, b) 
return ((a.y or __NaN) - (b.y or __NaN));
end);
do
local __t35, __t36 = __it(list), 0;
while __t36 < __t35.length do
local d = __t35[__t36]; __t36 = __t36 + 1;
d.f();
end;
end;
do
local __t38, __t39 = __it(g.units), 0;
while __t39 < __t38.length do
local u = __t38[__t39]; __t39 = __t39 + 1;
if ((u.role == "rider") and (u.state == "climb")) then
M.drawClimber(ctx, u, g);
end;
end;
end;
if art.over then art.over(ctx, g, M.H_ART); end;
if (patrol and (not __T(g.clear))) then
M.drawMarker(ctx, g, true);
end;
M.drawBeam(ctx, g);
do
local __t41, __t42 = __it(g.bolts), 0;
while __t42 < __t41.length do
local o = __t41[__t42]; __t42 = __t42 + 1;
M.drawBolt(ctx, o);
end;
end;
do
local __t44, __t45 = __it(g.rings), 0;
while __t45 < __t44.length do
local r = __t44[__t45]; __t45 = __t45 + 1;
if (r.col == "slash") then
M.drawSlash(ctx, r);
end;
end;
end;
do
local __t47, __t48 = __it(g.parts), 0;
while __t48 < __t47.length do
local p = __t47[__t48]; __t48 = __t48 + 1;
if ((not __T(p.horse)) and M.onScreen(p.x, p.y, 4)) then
M.drawPart(ctx, p);
end;
end;
end;
buf.maskOff();
M.drawSmoke(ctx, g);
do
local __t50, __t51 = __it(g.ghosts), 0;
while __t51 < __t50.length do
local o = __t50[__t51]; __t51 = __t51 + 1;
M.drawGhost(ctx, o);
end;
end;
do
local __t53, __t54 = __it(g.texts), 0;
while __t54 < __t53.length do
local t = __t53[__t54]; __t54 = __t54 + 1;
local k = ((t.t or __NaN) / (t.life or __NaN));
local a = ((k > 0.7) and ((1 - k) / 0.3) or 1);
__I0.drawText(ctx, t.s, t.x, ((t.y or __NaN) - (k * 10)), t.col, {align="center", alpha=a});
end;
end;
do
local __t56, __t57 = __it(g.barks), 0;
while __t57 < __t56.length do
local k = __t56[__t57]; __t57 = __t57 + 1;
M.drawBark(ctx, k);
end;
end;
if (__T(g.thought) and (not __T(g.boss.dead))) then
M.drawThought(ctx, g);
end;
ctx:setTransform(1, 0, 0, 1, 0, 0);
if (not __T(view.bare)) then
M.drawHud(ctx, g, view);
end;
if __T(view.cursor) then
M.drawCursor(ctx, view.mx, view.my, g);
end;
do return buf end;
end;
drawBoss = function(ctx, g) 
local b = g.boss;
local a = __mfmod((__mfmod((b.face or __NaN), M.TAU) + M.TAU), M.TAU);
local dir = __mfmod(__mfloor(((a / M.TAU) * __I0.BOSS_DIRS) + 0.5), __I0.BOSS_DIRS);
local act = b.act;
local mouth = ((__T(act) and ((((act.kind == "breath") or (act.kind == "roar")) or (act.kind == "beam")) or (act.kind == "summon"))) and 1 or 0);
local frame = (__T(b.moving) and __mfmod(__mfloor(((b.walk or __NaN) / 2.2)), 4) or 0);
local lift = 0;
local jx = 0;
if (((act and act.kind) == "stomp") and (not __T(act.fired))) then
lift = (-__mfloor((((act.t or __NaN) / (g.abil.stomp.wind or __NaN)) * 3) + 0.5));
end;
if (((act and act.kind) == "charge") and (not __T(act.fired))) then
jx = (-__mfloor((__mcos((b.face or __NaN)) * 2) + 0.5));
end;
if ((act and act.kind) == "shake") then
jx = ((__mfmod(__mfloor(((act.t or __NaN) * 30)), 2) ~= 0) and 1 or (-1));
frame = __mfmod(__mfloor(((act.t or __NaN) * 20)), 4);
end;
if (((act and act.kind) == "beam") and (not __T(act.fired))) then
jx = ((__mfmod(__mfloor(((act.t or __NaN) * 24)), 2) ~= 0) and 1 or 0);
end;
local x = ((__mfloor((b.x or __NaN) + 0.5) - (__I0.BOSS_SIZE / 2)) + jx);
local y = (__mfloor((b.y or __NaN) + 0.5) - (__I0.BOSS_SIZE / 2));
ctx.globalAlpha = 0.4;
ctx:drawImage(shadow, (__mfloor((b.x or __NaN) + 0.5) - 14), (__mfloor((b.y or __NaN) + 0.5) - 9));
ctx.globalAlpha = 1;
if (((b.haste or __NaN) > 0) and __T(b.moving)) then
local back = __get(boss, dir, frame);
ctx.globalAlpha = 0.18;
ctx:drawImage(__I0.tinted(back, __I0.PAL.gold), (x - __mfloor((__mcos((b.face or __NaN)) * 6) + 0.5)), (y - __mfloor((__msin((b.face or __NaN)) * 6) + 0.5)));
ctx.globalAlpha = 1;
end;
local spr = __get(boss, dir, ((mouth * 4) + frame));
if __T(b.evade) then
ctx.globalAlpha = ((__mfmod(__mfloor(((g.t or __NaN) * 12)), 2) ~= 0) and 0.55 or 0.85);
end;
ctx:drawImage(spr, x, (y + lift));
if __T(b.dead) then
ctx.globalAlpha = __mmin(0.6, ((b.deadT or __NaN) * 0.4));
ctx:drawImage(__I0.tinted(spr, __I0.PAL.rock0), x, y);
elseif ((b.flash or __NaN) > 0) then
ctx.globalAlpha = 0.55;
ctx:drawImage(__I0.tinted(spr, "#ffffff"), x, (y + lift));
elseif ((act and act.kind) == "beam") then
ctx.globalAlpha = (__T(act.fired) and 0.35 or (__mmin(0.6, (((act.t or __NaN) / (g.abil.beam.wind or __NaN)) * 0.6)) * (0.6 + (0.4 * __msin(((g.t or __NaN) * 40))))));
ctx:drawImage(__I0.tinted(spr, __I0.PAL.beam), x, (y + lift));
elseif ((act and act.kind) == "summon") then
ctx.globalAlpha = 0.3;
ctx:drawImage(__I0.tinted(spr, __I0.PAL.shadow), x, (y + lift));
end;
ctx.globalAlpha = 1;
if (__T(b.taunt) and (not __T(b.dead))) then
local u = b.taunt.u;
local n = __mceil((__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) / 2));
ctx.fillStyle = __I0.PAL.red;
for i = 1, n - 1 do
if (__mfmod((i + __mfloor(((g.t or __NaN) * 20))), 3) ~= 0) then
ctx:fillRect(__mfloor(((b.x or __NaN) + ((((u.x or __NaN) - (b.x or __NaN)) * i) / n)) + 0.5), __mfloor(((b.y or __NaN) + ((((u.y or __NaN) - (b.y or __NaN)) * i) / n)) + 0.5), 1, 1);
end;
end;
end;
if (not __T(b.dead)) then
local c = __mcos((b.face or __NaN));
local sn = __msin((b.face or __NaN));
local sx = __mfloor(((b.x or __NaN) - (4 * c)) + 0.5);
local sy = (__mfloor(((b.y or __NaN) - (4 * sn)) + 0.5) + lift);
local climbed = __some(g.units, function(u) 
return ((u.role == "rider") and (u.state == "climb"));
end);
local pulse = (climbed and __mfmod(__mfloor(((g.t or __NaN) * 8)), 2) or ((__msin(((g.t or __NaN) * 2.5)) > 0.2) and 1 or 0));
ctx.fillStyle = __I0.PAL.sigil;
ctx.globalAlpha = (climbed and 0.9 or (0.55 + (pulse * 0.3)));
ctx:fillRect(sx, sy, 1, 1);
if (pulse ~= 0) then
ctx.globalAlpha = ((ctx.globalAlpha or __NaN) * 0.5);
ctx:fillRect((sx - 1), sy, 1, 1);
ctx:fillRect((sx + 1), sy, 1, 1);
ctx:fillRect(sx, (sy - 1), 1, 1);
ctx:fillRect(sx, (sy + 1), 1, 1);
end;
ctx.globalAlpha = 1;
end;
end;
reset = function() 
tctx:clearRect(0, 0, __I1.W, __I1.H);
end;
do return {buf=buf, render=render, reset=reset} end;
end;
-- render:207
M.bossPreview = function(look, dir, frame) if frame == nil then frame = 0 end;
local k = __I0.bossKey(look);
if (not __has(M.previews, k)) then
__set(M.previews, k, __I0.makeBossSprites(look));
end;
do return __get(__get(M.previews, k), dir, frame) end;
end;
-- render:215
M.markerPreview = function(style, t) 
if not __T(M.markerCv) then M.markerCv = __I0.newCanvas(__I0.BOSS_SIZE, __I0.BOSS_SIZE) end;
local c = M.markerCv:getContext("2d");
local x = 28;
local y = 40;
c:clearRect(0, 0, __I0.BOSS_SIZE, __I0.BOSS_SIZE);
M.markerAt(c, style, x, y, t, false, nil);
M.drawRock(c, x, y, 6.2, 1, 3);
M.markerAt(c, style, x, y, t, true, "42 M");
do return M.markerCv end;
end;
-- render:231
M.makeGround = function(m) 
local c = __I0.newCanvas(m.w, m.h);
local x = c:getContext("2d");
x.fillStyle = __I0.PAL.grass1;
x:fillRect(0, 0, m.w, m.h);
local __t60 = (m.level.art and (m.level.art.ground and m.level.art.ground(x, m, M.H_ART)));
do return c end;
end;
-- render:238
M.stampAsh = function(c, a) 
local R = (__mceil((a.r or __NaN)) + 1);
for py = (-R), R do
for qx = (-R), R do
repeat
local inside;
if __T(a.w) then inside = ((__mabs(qx) <= (((a.w or __NaN) / 2) + 1)) and (__mabs(py) <= (((a.h or __NaN) / 2) + 1))); else inside = (__hypot(qx, py) <= (a.r or __NaN)); end;
if (not inside) then
do break end;
end;
local h = __I0.hash((qx + (a.seed or __NaN)), (py + __mfloor((a.x or __NaN) + 0.5)));
if (h < 0.25) then
do break end;
end;
c.fillStyle = ((h > 0.92) and "#5a5248" or ((h > 0.6) and "#1c1814" or "#2a241e"));
c:fillRect((__mfloor((a.x or __NaN) + 0.5) + qx), (__mfloor((a.y or __NaN) + 0.5) + py), 1, 1);
until true;
end;
end;
end;
-- render:251
M.drawWater = function(ctx, g) 
local w = g.water;
local cs = w.cs;
local fr = __mfloor(((g.t or __NaN) * 3));
local c0 = __mmax(0, __mfloor(((M.VIEW.x or __NaN) / cs)));
local c1 = __mmin(((w.cols or __NaN) - 1), __mceil((((M.VIEW.x or __NaN) + __I1.W) / cs)));
local r0 = __mmax(0, __mfloor(((M.VIEW.y or __NaN) / cs)));
local r1 = __mmin(((w.rows or __NaN) - 1), __mceil((((M.VIEW.y or __NaN) + __I1.H) / cs)));
for r = r0, r1 do
for c = c0, c1 do
repeat
local v = w.a[((r * (w.cols or __NaN)) + c)];
if (not __T(v)) then
do break end;
end;
local x = (c * cs);
local y = (r * cs);
if (v == 1) then
ctx.fillStyle = ((__band((c + r), 1) ~= 0) and "#2a4a5e" or "#2e5266");
ctx:fillRect(x, y, cs, cs);
if (__I0.hash((c + fr), r) > 0.8) then
ctx.fillStyle = "#5f8ea6";
ctx:fillRect((x + __i32((__I0.hash(c, (r + fr)) * cs))), (y + __i32((__I0.hash(r, c) * cs))), 2, 1);
end;
if ((r > 0) and (not __T(w.a[(((r - 1) * (w.cols or __NaN)) + c)]))) then
ctx.fillStyle = "#16262e";
ctx:fillRect(x, y, cs, 1);
end;
else
for k = 0, 6 - 1 do
ctx.fillStyle = ({[0]="#6b6c63", "#55564f", "#7a5a3a", "#8f8f84", "#5a3d29", "#3f403a", length=6})[__i32((__I0.hash(((c * 7) + k), r) * 6))];
ctx:fillRect((x + __i32((__I0.hash(k, (c + (r * 31))) * (cs - 1)))), (y + __i32((__I0.hash(c, (k + r)) * (cs - 1)))), 2, 2);
end;
ctx.fillStyle = "rgba(30,40,46,.35)";
ctx:fillRect(x, y, cs, cs);
end;
until true;
end;
end;
end;
-- render:272
M.drawFlames = function(ctx, p, t) 
local w = (__T(p.w) and p.w or (((p.r or __NaN) * 2) + 4));
local top = ((p.y or __NaN) - ((p.state == "up") and (__T(p.h) and (((p.h or __NaN) / 2) + 3) or 9) or 2));
local fr = __mfloor((t * 12));
local n = __mmin(16, (3 + __mfloor((w / 2))));
for i = 0, n - 1 do
local x = __mfloor((((p.x or __NaN) - (w / 2)) + (__I0.hash((i + (p.seed or __NaN)), fr) * w)) + 0.5);
local y = __mfloor((top + (__I0.hash((i * 3), (fr + (p.seed or __NaN))) * 5)) + 0.5);
local h = __I0.hash(i, ((fr * 7) + (p.seed or __NaN)));
if (h > 0.75) then ctx.fillStyle = __I0.PAL.fire3; elseif (h > 0.4) then ctx.fillStyle = __I0.PAL.fire2; else ctx.fillStyle = __I0.PAL.fire1; end;
ctx:fillRect(x, y, 1, ((h > 0.5) and 2 or 1));
end;
end;
-- render:284
M.drawCritter = function(ctx, c) 
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
ctx.fillStyle = (((c.hitT or __NaN) > 0) and "#ffffff" or __I0.PAL.brown);
ctx:fillRect((x - 1), (y - 2), 3, 2);
M.px(ctx, (x + (c.fx or __NaN)), (y - 3), __I0.PAL.ink);
end;
-- render:292
M.makeBackground = function(m) 
local T = M.THEME_PAL[m.theme.id];
local c = __I0.newCanvas(__I1.W, __I1.H);
local x = c:getContext("2d");
local so = __mfmod((m.seed or __NaN), 1000);
for py = 0, __mceil(__I1.H) - 1 do
for px = 0, __mceil(__I1.W) - 1 do
local n = (((M.vnoise(((px / 22) + so), (py / 22)) * 0.55) + (M.vnoise((((px / 7) + 40) + so), (py / 7)) * 0.3)) + (__I0.hash((px + so), py) * 0.2));
local lvl = __mmax(0, __mmin(3, __mfloor((((n * 3.4) - 0.35) + (__band((px + py), 1) * 0.3)))));
x.fillStyle = T.grass[lvl];
x:fillRect(px, py, 1, 1);
end;
end;
if (not __T(m.plain)) then
for py = 0, __mceil(__I1.H) - 1 do
for px = 0, __mceil(__I1.W) - 1 do
repeat
local d = m.df[((py * __I1.W) + px)];
local w = (5.2 + (M.vnoise(((px / 6) + so), (py / 6)) * 2.6));
if (d > (w + 1.5)) then
do break end;
end;
local n = (M.vnoise((px / 3), (py / 3)) + (__I0.hash((px * 3), py) * 0.4));
if (d > w) then
if (__I0.hash(px, (py * 7)) < 0.45) then
x.fillStyle = T.dirt[0];
x:fillRect(px, py, 1, 1);
end;
do break end;
end;
if (d > (w - 1.3)) then x.fillStyle = T.dirt[0]; elseif (n > 1.05) then x.fillStyle = T.dirt[3]; elseif (n > 0.7) then x.fillStyle = T.dirt[2]; else x.fillStyle = T.dirt[1]; end;
x:fillRect(px, py, 1, 1);
until true;
end;
end;
end;
local seed = (7 + ((m.n or __NaN) * 101));
local r = function() 
return ((function() seed = __mfmod((seed * 16807), 2147483647); return seed end)() / 2147483647);
end;
for i = 0, 700 - 1 do
repeat
local px = __mfloor((r() * __I1.W));
local py = __mfloor((r() * __I1.H));
if ((not __T(m.plain)) and ((m.df[((py * __I1.W) + px)] or __NaN) < 9)) then
do break end;
end;
if (r() < 0.5) then x.fillStyle = T.tuft[0]; else x.fillStyle = T.tuft[1]; end;
x:fillRect(px, py, 1, 1);
x.fillStyle = T.tuft[0];
x:fillRect((px + ((r() < 0.5) and (-1) or 1)), (py + 1), 1, 1);
until true;
end;
for i = 0, 60 - 1 do
repeat
local px = __mfloor((r() * __I1.W));
local py = __mfloor((r() * __I1.H));
if ((not __T(m.plain)) and ((m.df[((py * __I1.W) + px)] or __NaN) < 9)) then
do break end;
end;
x.fillStyle = T.flowers[__mfloor((r() * (T.flowers.length or #T.flowers)))];
if (((m.n == 1) and (px == 128)) and (py == 47)) then
do break end;
end;
x:fillRect(px, py, 1, 1);
until true;
end;
for i = 0, 40 - 1 do
local px = __mfloor((r() * __I1.W));
local py = __mfloor((r() * __I1.H));
x.fillStyle = __I0.PAL.rock1;
x:fillRect(px, py, 1, 1);
x.fillStyle = __I0.PAL.rock0;
x:fillRect((px + 1), (py + 1), 1, 1);
end;
if __T(m.plain) then
do return c end;
end;
local A, B;
local __t74 = m; A = __t74.A; B = __t74.B;
M.drawRock(x, __mfloor((A.x or __NaN) + 0.5), __mfloor((A.y or __NaN) + 0.5), 6.2, 1, 3);
M.drawRock(x, __mfloor((B.x or __NaN) + 0.5), __mfloor((B.y or __NaN) + 0.5), 5.6, 2, 7);
__I0.drawText(x, "ROCK", A.x, ((A.y or __NaN) + 10), __I0.PAL.rock3, {align="center", alpha=0.75});
__I0.drawText(x, "OTHER ROCK", B.x, ((B.y or __NaN) + 10), __I0.PAL.rock3, {align="center", alpha=0.75});
do return c end;
end;
-- render:343
M.drawRock = function(x, cx, cy, R, kind, sd) 
local shapeR = function(a) 
return (R + (((__I0.hash((__mfloor(((a + 4) * 3) + 0.5) + sd), sd) - 0.5) * 2.2) * ((kind == 1) and 1.4 or 0.8)));
end;
local inside = function(px, py) 
local dx = (px - cx);
local dy = ((py - cy) * ((kind == 1) and 1.15 or 1));
do return (__hypot(dx, dy) < shapeR(__matan2(dy, dx))) end;
end;
do
local py = (cy - 12);
while (py < (cy + 12)) do
do
local px = (cx - 12);
while (px < (cx + 12)) do
if (inside((px - 2), (py - 2)) and (not inside(px, py))) then
x.fillStyle = "rgba(10,14,8,.45)";
x:fillRect(px, py, 1, 1);
end;
px = px + 1;
end;
end;
py = py + 1;
end;
end;
do
local py = (cy - 12);
while (py < (cy + 12)) do
do
local px = (cx - 12);
while (px < (cx + 12)) do
repeat
if (not inside(px, py)) then
do break end;
end;
local edge = ((((not inside((px - 1), py)) or (not inside((px + 1), py))) or (not inside(px, (py - 1)))) or (not inside(px, (py + 1))));
local l = (((((-(px - cx)) * 0.6) - ((py - cy) * 0.8)) / R) + (__I0.hash((px * 5), (py * 3)) * 0.35));
local col;
if edge then col = __I0.PAL.ink; elseif (l > 0.75) then col = __I0.PAL.rock4; elseif (l > 0.25) then col = __I0.PAL.rock3; elseif (l > (-0.3)) then col = __I0.PAL.rock2; else col = __I0.PAL.rock1; end;
if ((((not edge) and (kind == 2)) and (l < 0.1)) and (__I0.hash(px, (py * 9)) < 0.45)) then
col = __I0.PAL.moss;
end;
x.fillStyle = col;
x:fillRect(px, py, 1, 1);
until true;
px = px + 1;
end;
end;
py = py + 1;
end;
end;
end;
-- render:360
M.makeForeground = function(theme) 
local T = M.THEME_PAL[theme];
local c = __I0.newCanvas(__I1.W, __I1.H);
local x = c:getContext("2d");
local trees = {length=0};
local seed = (31 + ((theme.length or #theme) * 7));
local r = function() 
return ((function() seed = __mfmod((seed * 16807), 2147483647); return seed end)() / 2147483647);
end;
do
local px = (-6);
while (px < (__I1.W + 10)) do
__push(trees, {[0]=px, ((-4) + (r() * 6)), (8 + (r() * 6)), length=3});
__push(trees, {[0]=(px + 5), ((__I1.H + 3) - (r() * 6)), (8 + (r() * 6)), length=3});
px = (px + (11 + (r() * 7)));
end;
end;
do
local py = 10;
while (py < __I1.H) do
__push(trees, {[0]=((-5) + (r() * 5)), py, (8 + (r() * 5)), length=3});
__push(trees, {[0]=((__I1.W + 5) - (r() * 5)), (py + 6), (8 + (r() * 5)), length=3});
py = (py + (12 + (r() * 7)));
end;
end;
local cover = __typed("Float32Array", (__I1.W * __I1.H));
local owner = __fill(__typed("Int16Array", (__I1.W * __I1.H)), (-1));
for py = 0, __mceil(__I1.H) - 1 do
for px = 0, __mceil(__I1.W) - 1 do
repeat
if ((((px > 26) and (px < (__I1.W - 26))) and (py > 22)) and (py < (__I1.H - 22))) then
do break end;
end;
local best = 0;
__forEach(trees, function(t, i) 
local dx = (px - (t[0] or __NaN));
local dy = (py - (t[1] or __NaN));
local d = __hypot(dx, dy);
local rr = ((t[2] or __NaN) + ((__I0.hash((__mfloor(((__matan2(dy, dx) + 4) * 5) + 0.5) + (i * 13)), i) - 0.5) * 2.5));
local v = (1 - (d / rr));
if (v > best) then
best = v;
owner[((py * __I1.W) + px)] = i;
end;
end);
cover[((py * __I1.W) + px)] = best;
until true;
end;
end;
local on = function(px, py) 
return (((((px < 0) or (py < 0)) or (px >= __I1.W)) or (py >= __I1.H)) or ((cover[((py * __I1.W) + px)] or __NaN) > 0));
end;
for py = 0, __mceil(__I1.H) - 1 do
for px = 0, __mceil(__I1.W) - 1 do
repeat
local i = ((py * __I1.W) + px);
if ((cover[i] or __NaN) <= 0) then
do break end;
end;
local t = trees[owner[i]];
local edge = ((((not on((px - 1), py)) or (not on((px + 1), py))) or (not on(px, (py - 1)))) or (not on(px, (py + 1))));
local l = (((((-(px - (t[0] or __NaN))) * 0.55) - ((py - (t[1] or __NaN)) * 0.8)) / (t[2] or __NaN)) + ((__I0.hash(((px * 3) + 1), (py * 5)) - 0.5) * 0.5));
if edge then x.fillStyle = __I0.PAL.ink; elseif (l > 0.55) then x.fillStyle = T.canopy[3]; elseif (l > 0) then x.fillStyle = T.canopy[2]; elseif (l > (-0.5)) then x.fillStyle = T.canopy[1]; else x.fillStyle = T.canopy[0]; end;
x:fillRect(px, py, 1, 1);
until true;
end;
end;
do return c end;
end;
-- render:393
M.makeShadow = function() 
local c = __I0.newCanvas(28, 22);
local x = c:getContext("2d");
x.fillStyle = __I0.PAL.ink;
for py = 0, 22 - 1 do
for px = 0, 28 - 1 do
local dx = (((px + 0.5) - 14) / 13);
local dy = (((py + 0.5) - 12) / 10);
if (((dx * dx) + (dy * dy)) < 1) then
x:fillRect(px, py, 1, 1);
end;
end;
end;
do return c end;
end;
-- render:406
M.drawIce = function(ctx, i, g) 
local fade = (((i.t or __NaN) < 0.2) and ((i.t or __NaN) / 0.2) or (((i.t or __NaN) > ((i.life or __NaN) - 1.2)) and __mmax(0, (((i.life or __NaN) - (i.t or __NaN)) / 1.2)) or 1));
local R = __mceil((i.r or __NaN));
local fr = __mfloor(((g.t or __NaN) * 4));
for py = (-R), R do
for px = (-R), R do
repeat
local d = (__hypot(px, py) / (i.r or __NaN));
if (d > 1) then
do break end;
end;
local wx = (__mfloor((i.x or __NaN) + 0.5) + px);
local wy = (__mfloor((i.y or __NaN) + 0.5) + py);
local h = __I0.hash(((wx * 3) + (i.seed or __NaN)), (wy * 5));
if ((d > 0.85) and (h < ((d - 0.85) * 5))) then
do break end;
end;
local crack = ((__mabs(__msin(((__matan2(py, px) * 5) + (i.seed or __NaN)))) < 0.08) and (d > 0.2));
ctx.globalAlpha = (fade * (crack and 0.7 or 0.45));
ctx.fillStyle = (crack and "#ffffff" or (function() if (h > 0.82) then return __I0.PAL.ice1; elseif (__band((px + py), 1) ~= 0) then return __I0.PAL.ice0; else return __I0.PAL.ice2; end; end)());
ctx:fillRect(wx, wy, 1, 1);
if ((h > 0.996) and (__mfmod((fr + wx), 3) == 0)) then
ctx.globalAlpha = fade;
ctx.fillStyle = "#ffffff";
ctx:fillRect(wx, wy, 1, 1);
end;
until true;
end;
end;
ctx.globalAlpha = 1;
end;
-- render:425
M.drawBeam = function(ctx, g) 
local b = g.boss;
local a = b.act;
if ((((not __T(a)) or (a.kind ~= "beam")) or (not __T(a.fired))) or __T(b.dead)) then
do return end;
end;
local e = __I1.beamEnd(g);
local c = __mcos((b.face or __NaN));
local s = __msin((b.face or __NaN));
local w = g.abil.beam.width;
local fr = __mfloor(((g.t or __NaN) * 30));
local fade = __mmin(1, ((((g.abil.beam.wind or __NaN) + (g.abil.beam.dur or __NaN)) - (a.t or __NaN)) / 0.25));
do
local l = 10;
while (l < (e.len or __NaN)) do
local bx = ((b.x or __NaN) + (c * l));
local by = ((b.y or __NaN) + (s * l));
local wob = (__msin(((l * 0.3) + fr)) * 0.6);
do
local k = (-w);
while (k <= w) do
local px = __mfloor((bx - (s * (k + wob))) + 0.5);
local py = __mfloor((by + (c * (k + wob))) + 0.5);
local ak = __mabs(k);
ctx.globalAlpha = (fade * ((ak < 1.2) and 1 or ((ak < (w * 0.6)) and 0.8 or 0.35)));
ctx.fillStyle = ((ak < 1.2) and "#ffffff" or (function() if (ak < (w * 0.6)) then return __I0.PAL.beam; else return __I0.PAL.blue; end; end)());
ctx:fillRect(px, py, 1, 1);
k = (k + 0.7);
end;
end;
l = (l + 0.7);
end;
end;
ctx.fillStyle = __I0.PAL.spark;
for f = 0, 4 - 1 do
local l = (((__I0.hash(fr, f) * 0.9) + 0.05) * (e.len or __NaN));
local k = 0;
local side = ((__I0.hash(fr, (f + 9)) < 0.5) and (-1) or 1);
for i = 0, 10 - 1 do
l = (l + 1.5);
k = (k + (side * (0.5 + (__I0.hash((fr + i), f) * 1.5))));
ctx.globalAlpha = (fade * 0.8);
ctx:fillRect(__mfloor((((b.x or __NaN) + (c * l)) - (s * k)) + 0.5), __mfloor((((b.y or __NaN) + (s * l)) + (c * k)) + 0.5), 1, 1);
end;
end;
ctx.globalAlpha = 1;
end;
-- render:457
M.drawMarker = function(ctx, g, over) 
local R = __I1.destRock(g);
local style = (__T(g.look.marker) and g.look.marker or 0);
local label = nil;
if ((style == 2) and __T(over)) then
local b = g.boss;
local here = __I1.pathNearest(g.map, b.x, b.y);
local left = __mmax(0, __mfloor(((R == g.map.B) and ((g.map.len or __NaN) - (here.s or __NaN)) or here.s) + 0.5));
label = ((left < 20) and "ARRIVE" or (__str(left) .. " M"));
end;
M.markerAt(ctx, style, __mfloor((R.x or __NaN) + 0.5), __mfloor((R.y or __NaN) + 0.5), g.t, over, label);
end;
-- render:466
M.markerAt = function(ctx, style, x, y, t, over, label) 
if (style == 0) then
if (not __T(over)) then
do return end;
end;
for i = 0, 6 - 1 do
local a = ((t * 0.8) + ((i * M.TAU) / 6));
local rr = (9 + (__msin(((t * 2) + i)) * 2));
local sx = __mfloor((x + (__mcos(a) * rr)) + 0.5);
local sy = __mfloor(((y - 3) + ((__msin(a) * rr) * 0.6)) + 0.5);
local tw = ((__msin(((t * 6) + (i * 1.7))) + 1) / 2);
ctx.globalAlpha = (0.4 + (tw * 0.6));
M.px(ctx, sx, sy, ((tw > 0.7) and "#ffffff" or __I0.PAL.gold));
if (tw > 0.45) then
ctx.fillStyle = __I0.PAL.gold;
ctx:fillRect((sx - 1), sy, 1, 1);
ctx:fillRect((sx + 1), sy, 1, 1);
ctx:fillRect(sx, (sy - 1), 1, 1);
ctx:fillRect(sx, (sy + 1), 1, 1);
end;
if (tw > 0.85) then
ctx.globalAlpha = 0.5;
ctx:fillRect((sx - 2), sy, 1, 1);
ctx:fillRect((sx + 2), sy, 1, 1);
ctx:fillRect(sx, (sy - 2), 1, 1);
ctx:fillRect(sx, (sy + 2), 1, 1);
end;
end;
ctx.globalAlpha = (0.35 + (0.25 * __msin((t * 3))));
M.ring(ctx, x, y, 7, __I0.PAL.gold, ctx.globalAlpha);
ctx.globalAlpha = 1;
elseif (style == 1) then
local cy = (y - 13);
if (not __T(over)) then
ctx.globalAlpha = 0.3;
ctx.fillStyle = __I0.PAL.ink;
for py = (-9), 9 do
for qx = (-11), 11 do
if (((((qx / 11) ^ 2) + ((py / 9) ^ 2)) < 1) and (__band((qx + py), 1) ~= 0)) then
ctx:fillRect((x + qx), (cy + py), 1, 1);
end;
end;
end;
ctx.globalAlpha = 1;
do return end;
end;
for i = 0, 28 - 1 do
local a = ((t * (2.4 - (__mfmod(i, 3) * 0.4))) + (i * 0.7));
local rr = (5.5 + (__mfmod(i, 3) * 1.4));
local sx = __mfloor((x + (__mcos(a) * rr)) + 0.5);
local sy = __mfloor((cy + ((__msin(a) * rr) * 0.45)) + 0.5);
M.px(ctx, sx, sy, ((__mfmod(i, 4) == 0) and "#ffffff" or (function() if (__mfmod(i, 2) ~= 0) then return __I0.PAL.orange; else return __I0.PAL.purple; end; end)()));
end;
ctx.fillStyle = "#000000";
for py = (-3), 3 do
for qx = (-3), 3 do
if (((qx * qx) + (py * py)) <= 10) then
ctx:fillRect((x + qx), (cy + py), 1, 1);
end;
end;
end;
ctx.globalAlpha = 0.6;
M.ring(ctx, x, cy, 4, __I0.PAL.purple, 0.6);
ctx.globalAlpha = 1;
elseif (style == 2) then
if (not __T(over)) then
do return end;
end;
local by = ((y - 16) + __mfloor((__msin((t * 4)) * 1.5) + 0.5));
local arrow = {[0]="#######", ".#####.", "..###..", "...#...", length=4};
__forEach(arrow, function(row, ry) 
for rx = 0, 7 - 1 do
if (__ch(row, rx) == "#") then
M.px(ctx, ((x - 3) + rx), (by + ry), ((((ry == 0) or (rx == 0)) or (rx == 6)) and "#ffffff" or "#3a7bff"));
end;
end;
end);
ctx.fillStyle = __I0.PAL.ink;
ctx:fillRect((x - 4), (by - 1), 9, 1);
__I0.drawText(ctx, label, x, (by - 8), "#9fc4ff", {align="center"});
elseif (style == 3) then
if (not __T(over)) then
do return end;
end;
local top = (y - 22);
local sway = __mfloor((__msin((t * 1.5)) * 0.6) + 0.5);
ctx.fillStyle = __I0.PAL.ink;
ctx:fillRect((x - 1), (top - 1), 3, 17);
ctx:fillRect((x - 5), (top + 2), 11, 3);
ctx.fillStyle = __I0.PAL.horse;
ctx:fillRect(x, top, 1, 15);
ctx:fillRect((x - 4), (top + 3), 9, 1);
M.px(ctx, (x + sway), (top + 1), __I0.PAL.skin);
ctx.fillStyle = __I0.PAL.white;
ctx:fillRect((x - 1), (top + 3), 3, 4);
M.px(ctx, (x - 3), (top + 3), __I0.PAL.skin);
M.px(ctx, (x + 3), (top + 3), __I0.PAL.skin);
M.px(ctx, x, (top + 8), __I0.PAL.skin);
if ((__mfmod(__mfloor((t / 4)), 3) == 0) and (__mfmod(t, 4) < 1.6)) then
__I0.drawText(ctx, "HELP", (x + 8), (top - 2), __I0.PAL.cream, {alpha=0.85});
end;
elseif (style == 4) then
local by = (y - 18);
if (not __T(over)) then
local cols = {[0]=__I0.PAL.pink, __I0.PAL.blue, __I0.PAL.gold, __I0.PAL.green, __I0.PAL.purple, length=5};
for i = 0, 14 - 1 do
local a = ((t * 1.3) + (i * 2.1));
local rr = (6 + __mfmod((i * 7), 13));
ctx.globalAlpha = 0.7;
ctx.fillStyle = cols[__mfmod(i, cols.length)];
ctx:fillRect(__mfloor((x + (__mcos(a) * rr)) + 0.5), __mfloor((y + ((__msin(a) * rr) * 0.6)) + 0.5), 2, 1);
end;
ctx.globalAlpha = 1;
do return end;
end;
ctx.fillStyle = __I0.PAL.rock2;
ctx:fillRect(x, (by - 8), 1, 6);
for py = (-2), 2 do
for qx = (-2), 2 do
repeat
if (((qx * qx) + (py * py)) > 5) then
do break end;
end;
local lit = (__mfmod(((qx + py) + __mfloor((t * 8))), 3) == 0);
M.px(ctx, (x + qx), (by + py), (lit and "#ffffff" or (function() if (__band((qx + py), 1) ~= 0) then return __I0.PAL.rock3; else return __I0.PAL.rock2; end; end)()));
until true;
end;
end;
end;
end;
-- render:542
M.smokeSprite = function(R, db, v) 
local S = ((2 * R) + 5);
do return M.sprite(("smoke|" .. __str(R) .. "|" .. __str(db) .. "|" .. __str(v)), S, S, function(c) 
local img = c:createImageData(S, S);
local d = img.data;
local o = (R + 2);
local dens = (db / 4);
local L = {[0]={x=0, y=0, r=((R * ((R < 5) and 1 or 0.64)) + 0.5)}, length=1};
if (R >= 5) then
local n = (4 + v);
local a0 = ((v * 1.7) + (R * 0.3));
for i = 0, __mceil(n) - 1 do
local a = ((a0 + ((i / n) * M.TAU)) + ((__I0.hash((i + R), v) - 0.5) * 0.6));
local r = (R * (0.42 + (__I0.hash(v, ((i * 7) + R)) * 0.16)));
__push(L, {x=(__mcos(a) * (R - r)), y=((__msin(a) * (R - r)) * 0.85), r=(r + 0.5)});
end;
end;
local rim = (0.35 - (0.25 * dens));
for y = 0, __mceil(S) - 1 do
for x = 0, __mceil(S) - 1 do
repeat
local dx = (x - o);
local dy = (y - o);
local h = (-1);
local lit = 0;
do
local __t106, __t107 = __it(L), 0;
while __t107 < __t106.length do
local l = __t106[__t107]; __t107 = __t107 + 1;
local lx = (dx - (l.x or __NaN));
local ly = (dy - (l.y or __NaN));
local k = (1 - (__hypot(lx, ly) / (l.r or __NaN)));
if (k > h) then
h = k;
lit = ((((-lx) * 0.6) - (ly * 0.8)) / (l.r or __NaN));
end;
end;
end;
if (h < 0) then
do break end;
end;
if ((h < rim) and ((M.BAYER[((__band(y, 3) * 4) + __band(x, 3))] or __NaN) >= (0.35 + ((h / rim) * 0.5)))) then
do break end;
end;
local deep = (1 - (__hypot(dx, dy) / (R + 0.5)));
local ci = (((3 + __mfloor((lit * 1.5) + 0.5)) - ((h < 0.12) and 1 or 0)) - __mfloor(((__mmax(0, deep) * dens) * 2.2) + 0.5));
if (__I0.hash(((x * 3) + v), ((y * 5) + R)) > 0.9) then
ci = (ci + 1);
end;
ci = __mmax(0, __mmin(5, ci));
local i = (((y * S) + x) * 4);
local col = M.SMOKE_RGB[ci];
d[i] = col[0];
d[(i + 1)] = col[1];
d[(i + 2)] = col[2];
d[(i + 3)] = 255;
until true;
end;
end;
c:putImageData(img, 0, 0);
end) end;
end;
-- render:576
M.drawSmoke = function(ctx, g) 
local cs = (g.smoke and g.smoke.clouds);
if ((not __T(cs)) or (not ((cs.length or #cs) ~= 0))) then
do return end;
end;
do
local __t109, __t110 = __it(cs), 0;
while __t110 < __t109.length do
repeat
local c = __t109[__t110]; __t110 = __t110 + 1;
if (not M.onScreen(c.x, c.y, ((c.r or __NaN) + 4))) then
do break end;
end;
local dn = __mmin(1, ((c.m or __NaN) / ((c.r or __NaN) * (c.r or __NaN))));
local R = M.SMOKE_R[0];
do
local __t112, __t113 = __it(M.SMOKE_R), 0;
while __t113 < __t112.length do
local r = __t112[__t113]; __t113 = __t113 + 1;
if (__mabs((r - (c.r or __NaN))) < __mabs((R - (c.r or __NaN)))) then
R = r;
end;
end;
end;
local spr = M.smokeSprite(R, __mmin(4, __mfloor((dn * 4) + 0.5)), c.v);
local born = ((((c.age or __NaN) < 0.35) and ((c.age or __NaN) / 0.35) or 1) * __mmin(1, ((dn - 0.045) / 0.06)));
ctx:drawDithered(spr, ((__mfloor((c.x or __NaN) + 0.5) - R) - 2), ((__mfloor((c.y or __NaN) + 0.5) - R) - 2), (__mmin(0.9, (0.28 + (0.64 * (dn ^ 1.3)))) * born));
until true;
end;
end;
ctx.globalAlpha = 1;
end;
-- render:591
M.drawFires = function(ctx, g) 
local fr = __mfloor(((g.t or __NaN) * 10));
do
local __t115, __t116 = __it(g.fires), 0;
while __t116 < __t115.length do
local f = __t115[__t116]; __t116 = __t116 + 1;
local fade = (((f.t or __NaN) < 0.25) and ((f.t or __NaN) / 0.25) or (((f.t or __NaN) > ((f.life or __NaN) - 1.2)) and __mmax(0, (((f.life or __NaN) - (f.t or __NaN)) / 1.2)) or 1));
local R = __mceil((f.r or __NaN));
for py = (-R), R do
for px = (-R), R do
repeat
local d = (__hypot(px, py) / (f.r or __NaN));
if (d > 1) then
do break end;
end;
local wx = (__mfloor((f.x or __NaN) + 0.5) + px);
local wy = (__mfloor((f.y or __NaN) + 0.5) + py);
local h = __I0.hash(((wx * 7) + (fr * 31)), ((wy * 13) + fr));
if (h < (0.15 + ((d * 0.45) * (2 - fade)))) then
do break end;
end;
if ((d < 0.35) and (h > 0.6)) then ctx.fillStyle = __I0.PAL.fire3; elseif (d < 0.6) then ctx.fillStyle = __I0.PAL.fire2; elseif (h > 0.7) then ctx.fillStyle = __I0.PAL.fire1; else ctx.fillStyle = __I0.PAL.fire0; end;
ctx.globalAlpha = fade;
ctx:fillRect(wx, wy, 1, 1);
until true;
end;
end;
end;
end;
ctx.globalAlpha = 1;
end;
-- render:610
M.drawTelegraph = function(ctx, g) 
local b = g.boss;
local a = b.act;
if ((not __T(a)) or __T(b.dead)) then
do return end;
end;
local k = a.kind;
local d = g.abil[k];
if (k == "shake") then
do return end;
end;
if (k == "charge") then
if (not __T(a.fired)) then
M.drawLane(ctx, g, d.range, d.width, ((a.t or __NaN) / (d.wind or __NaN)));
end;
do return end;
end;
if (k == "beam") then
if (not __T(a.fired)) then
M.drawLane(ctx, g, __I1.beamEnd(g).len, d.width, ((a.t or __NaN) / (d.wind or __NaN)));
end;
do return end;
end;
if (((k == "summon") or (k == "ice")) or (k == "haste")) then
do return end;
end;
if (k == "roar") then
if __T(a.fired) then
do return end;
end;
local rr = (6 + (((a.t or __NaN) / (d.wind or __NaN)) * 8));
M.ring(ctx, b.x, b.y, rr, __I0.PAL.cream, 0.6);
do return end;
end;
if (__T(a.fired) and (k ~= "breath")) then
do return end;
end;
local prog = (__T(a.fired) and 1 or ((a.t or __NaN) / (d.wind or __NaN)));
local R = d.range;
local x0 = __mmax((M.VIEW.x or __NaN), __mfloor(((b.x or __NaN) - R)));
local x1 = __mmin((((M.VIEW.x or __NaN) + __I1.W) - 1), __mceil(((b.x or __NaN) + R)));
local y0 = __mmax((M.VIEW.y or __NaN), __mfloor(((b.y or __NaN) - R)));
local y1 = __mmin((((M.VIEW.y or __NaN) + __I1.H) - 1), __mceil(((b.y or __NaN) + R)));
local blink = __band(__mfloor(((g.t or __NaN) * ((prog > 0.6) and 24 or 10))), 1);
local half = ((d.arc or __NaN) / 2);
local face = __I1.zoneFace(g, k);
local channel = a.fired;
ctx.fillStyle = __I0.PAL.tele;
do
local py = y0;
while (py <= y1) do
do
local px = x0;
while (px <= x1) do
repeat
local dx = ((px + 0.5) - (b.x or __NaN));
local dy = ((py + 0.5) - (b.y or __NaN));
local dist = __hypot(dx, dy);
if ((dist > R) or (dist < 8)) then
do break end;
end;
local edge = (dist > (R - 1));
if (k ~= "stomp") then
local ad = __mabs(__I1.angDiff(__matan2(dy, dx), face));
if (ad > half) then
do break end;
end;
if (((half - ad) * dist) < 1) then
edge = true;
end;
end;
local al;
if __T(edge) then
al = (__T(channel) and 0.35 or 0.85);
elseif (dist < (8 + ((R - 8) * prog))) then
al = ((__band(((px + py) + blink), 1) ~= 0) and (__T(channel) and 0.12 or 0.42) or (__T(channel) and 0.04 or 0.16));
else
al = ((__band((px + py), 1) ~= 0) and 0.12 or 0);
end;
if (not __T(al)) then
do break end;
end;
ctx.globalAlpha = al;
ctx:fillRect(px, py, 1, 1);
until true;
px = px + 1;
end;
end;
py = py + 1;
end;
end;
ctx.globalAlpha = 1;
end;
-- render:652
M.drawLane = function(ctx, g, range, width, prog) 
local d = {range=range, width=width};
local b = g.boss;
local c = __mcos((b.face or __NaN));
local s = __msin((b.face or __NaN));
local R = ((d.range or __NaN) + 4);
local blink = __band(__mfloor(((g.t or __NaN) * ((prog > 0.6) and 24 or 10))), 1);
ctx.fillStyle = __I0.PAL.tele;
for py = __mfloor(((b.y or __NaN) - R)), __mceil(((b.y or __NaN) + R)) do
for qx = __mfloor(((b.x or __NaN) - R)), __mceil(((b.x or __NaN) + R)) do
repeat
local dx = ((qx + 0.5) - (b.x or __NaN));
local dy = ((py + 0.5) - (b.y or __NaN));
local lx = ((dx * c) + (dy * s));
local ly = (((-dx) * s) + (dy * c));
if (((((((qx < (M.VIEW.x or __NaN)) or (py < (M.VIEW.y or __NaN))) or (qx >= ((M.VIEW.x or __NaN) + __I1.W))) or (py >= ((M.VIEW.y or __NaN) + __I1.H))) or (lx < 8)) or (lx > (d.range or __NaN))) or (__mabs(ly) > (d.width or __NaN))) then
do break end;
end;
local edge = ((lx > ((d.range or __NaN) - 1)) or (__mabs(ly) > ((d.width or __NaN) - 1)));
local al = (edge and 0.85 or ((lx < (8 + (((d.range or __NaN) - 8) * prog))) and ((__band(((qx + py) + blink), 1) ~= 0) and 0.42 or 0.16) or ((__band((qx + py), 1) ~= 0) and 0.12 or 0)));
if (not (al ~= 0)) then
do break end;
end;
ctx.globalAlpha = al;
ctx:fillRect(qx, py, 1, 1);
until true;
end;
end;
ctx.globalAlpha = 1;
end;
-- render:669
M.ring = function(ctx, cx, cy, r, col, alpha) 
ctx.fillStyle = col;
ctx.globalAlpha = alpha;
local n = __mmax(12, __mfloor((r * 6.3)));
local lx = nil;
local ly = nil;
for i = 0, n - 1 do
local a = ((i / n) * M.TAU);
local x = __mfloor((cx + (__mcos(a) * r)) + 0.5);
local y = __mfloor((cy + (__msin(a) * r)) + 0.5);
if ((x ~= lx) or (y ~= ly)) then
ctx:fillRect(x, y, 1, 1);
end;
lx = x;
ly = y;
end;
ctx.globalAlpha = 1;
end;
-- render:682
M.drawRing = function(ctx, r) 
local k = ((r.t or __NaN) / 0.45);
local rr = ((r.r or __NaN) + (((r.max or __NaN) - (r.r or __NaN)) * (1 - ((1 - k) * (1 - k)))));
if (r.col == "dust") then
M.ring(ctx, r.x, r.y, rr, __I0.PAL.dust, ((1 - k) * 0.9));
M.ring(ctx, r.x, r.y, (rr * 0.8), __I0.PAL.dirt3, ((1 - k) * 0.5));
elseif (r.col == "ice") then
M.ring(ctx, r.x, r.y, rr, "#ffffff", ((1 - k) * 0.9));
M.ring(ctx, r.x, r.y, (rr * 0.85), __I0.PAL.ice0, ((1 - k) * 0.6));
else
M.ring(ctx, r.x, r.y, rr, __I0.PAL.cream, ((1 - k) * 0.8));
M.ring(ctx, r.x, r.y, (rr * 0.7), __I0.PAL.cream, ((1 - k) * 0.45));
end;
end;
-- render:690
M.drawSlash = function(ctx, r) 
local k = ((r.t or __NaN) / 0.18);
ctx.fillStyle = ((k < 0.5) and "#ffffff" or __I0.PAL.cream);
ctx.globalAlpha = (1 - k);
for j = 0, 3 - 1 do
local rad = ((__T(r.big) and 16 or 17) + (j * (__T(r.big) and 5 or 4)));
local sweep = (__T(r.big) and 2.2 or 1.9);
for i = 0, 18 do
local a = ((((r.face or __NaN) - (sweep / 2)) + ((i / 18) * sweep)) + (j * 0.08));
if ((i / 18) > ((k * 1.6) + 0.2)) then
do break end;
end;
ctx:fillRect(__mfloor(((r.x or __NaN) + (__mcos(a) * rad)) + 0.5), __mfloor(((r.y or __NaN) + (__msin(a) * rad)) + 0.5), 1, 1);
end;
end;
ctx.globalAlpha = 1;
end;
-- render:705
M.px = function(ctx, x, y, col) 
ctx.fillStyle = col;
ctx:fillRect(x, y, 1, 1);
end;
-- render:707
M.drawUnit = function(ctx, u, g) 
local b = g.boss;
local x = __mfloor((u.x or __NaN) + 0.5);
local y = (__mfloor((u.y or __NaN) + 0.5) - (__T(u.dance) and __mfmod(__mfloor(((u.dance or __NaN) * 7)), 2) or 0));
local fx;
if __T(u.moving) then fx = u.fx; elseif ((b.x or __NaN) > (u.x or __NaN)) then fx = 1; else fx = (-1); end;
local flash = ((u.hit or __NaN) > 0);
local C = function(c) 
return (flash and "#ffffff" or c);
end;
local col = C(__I0.PAL[__I1.CLASS[u.cls].col]);
ctx.fillStyle = "rgba(8,10,6,.4)";
ctx:fillRect((x - 1), (__mfloor((u.y or __NaN) + 0.5) + 1), 3, 1);
if (u.role == "pet") then
local st = (__T(u.moving) and __mfmod(__mfloor(((u.walk or __NaN) * 1.5)), 2) or 0);
M.px(ctx, (x - 1), y, C(__I0.PAL.ink));
M.px(ctx, (x + 1), (y - st), C(__I0.PAL.ink));
ctx.fillStyle = col;
ctx:fillRect((x - 1), (y - 2), 3, 2);
M.px(ctx, (x + fx), (y - 3), C(__I0.PAL.brown));
M.px(ctx, (x + (fx * 2)), (y - 2), C(__I0.PAL.ink));
do return end;
end;
local st = (__T(u.moving) and __mfmod(__mfloor((u.walk or __NaN)), 2) or 2);
if (st ~= 0) then
M.px(ctx, (x - 1), y, C(__I0.PAL.ink));
end;
if (st ~= 1) then
M.px(ctx, (x + 1), y, C(__I0.PAL.ink));
end;
local tall = (((u.role == "tank") or (u.role == "king")) and 3 or 2);
if (u.role == "king") then
ctx.fillStyle = C("#8a1e18");
ctx:fillRect((x - (fx * 2)), (y - 3), 1, 3);
M.px(ctx, (x - fx), y, C("#8a1e18"));
end;
ctx.fillStyle = col;
ctx:fillRect((x - 1), (y - tall), 3, tall);
M.px(ctx, x, ((y - tall) - 1), C((function() if (u.role == "tank") then return __I0.PAL.steelHi; else return __I0.PAL.skin; end; end)()));
if (u.role == "king") then
M.px(ctx, (x - fx), (y - 1), C("#c8962a"));
M.px(ctx, x, (y - 2), C("#fff2b0"));
if (__mfmod(__mfloor((((g.t or __NaN) * 2.3) + (u.id or __NaN))), 5) == 0) then
M.px(ctx, (x + fx), (y - 3), "#ffffff");
end;
M.px(ctx, (x - 1), ((y - tall) - 2), C(__I0.PAL.gold));
M.px(ctx, x, ((y - tall) - 2), C("#e0403a"));
M.px(ctx, (x + 1), ((y - tall) - 2), C(__I0.PAL.gold));
M.px(ctx, (x - 1), ((y - tall) - 3), C(__I0.PAL.gold));
M.px(ctx, (x + 1), ((y - tall) - 3), C(__I0.PAL.gold));
end;
if (u.role == "tank") then
ctx.fillStyle = C(__I0.PAL.steelHi);
ctx:fillRect((x + (fx * 2)), (y - 3), 1, 3);
elseif (u.role == "melee") then
local sw = ((u.swing or __NaN) > 0);
M.px(ctx, (x + (fx * 2)), (y - (sw and 2 or 3)), C(__I0.PAL.steelHi));
M.px(ctx, (x + (fx * (sw and 3 or 2))), (y - (sw and 2 or 4)), C(__I0.PAL.steelHi));
elseif (u.role == "ranged") then
local casting = ((u.cast or __NaN) > 0.3);
if (u.cls == "hunter") then
ctx.fillStyle = C(__I0.PAL.tan);
ctx:fillRect((x + (fx * 2)), (y - 3), 1, 3);
else
ctx.fillStyle = C(__I0.PAL.brown);
ctx:fillRect((x + (fx * 2)), (y - 4), 1, 4);
M.px(ctx, (x + (fx * 2)), (y - 5), C(((casting and (__mfmod(__mfloor(((g.t or __NaN) * 10)), 2) ~= 0)) and "#ffffff" or (function() if (u.cls == "mage") then return __I0.PAL.frost; else return __I0.PAL.shadow; end; end)())));
end;
elseif (u.role == "healer") then
M.px(ctx, (x + (fx * 2)), (y - 2), C(__I0.PAL.cream));
if ((u.glow or __NaN) > 0) then
M.px(ctx, x, (y - 5), __I0.PAL.heal);
M.px(ctx, (x - 1), (y - 4), __I0.PAL.heal);
M.px(ctx, (x + 1), (y - 4), __I0.PAL.heal);
end;
end;
if (u.state == "afk") then
local z = __mfmod(__mfloor(((g.t or __NaN) * 2)), 3);
__I0.drawText(ctx, "Z", ((x + 2) + z), ((y - 9) - (z * 2)), __I0.PAL.cream, {shadow=false, alpha=0.7});
end;
if (__T(u.inFire) and __T(u.fireOk)) then
M.px(ctx, x, ((y - tall) - 2), __I0.PAL.fire2);
end;
if (((u.hp or __NaN) < (u.maxhp or __NaN)) and __T(u.party.engaged)) then
local w = __mmax(0, __mceil(((3 * (u.hp or __NaN)) / (u.maxhp or __NaN))));
ctx.fillStyle = __I0.PAL.hpBg;
ctx:fillRect((x - 1), ((y - tall) - 3), 3, 1);
if (((u.hp or __NaN) / (u.maxhp or __NaN)) > 0.4) then ctx.fillStyle = __I0.PAL.heal; else ctx.fillStyle = __I0.PAL.red; end;
ctx:fillRect((x - 1), ((y - tall) - 3), w, 1);
end;
end;
-- render:758
M.drawHorse = function(ctx, hx, hy, face, walk, rider, t) 
local c = __mcos(face);
local s = __msin(face);
local gait = __mfmod(__mfloor((walk / 1.6)), 4);
local cx = __mfloor(hx + 0.5);
local cy = __mfloor(hy + 0.5);
local mat = function(lx, ly) 
if (__hypot((lx - 5), ly) < 1.25) then
do return "head" end;
end;
if (((__mabs(ly) < 0.7) and (lx > 1)) and (lx < 4.4)) then
do return "mane" end;
end;
if (((__mabs(ly) < 1.1) and (lx > 2)) and (lx < 5)) then
do return "body" end;
end;
if ((((lx / 3.6) ^ 2) + ((ly / 1.9) ^ 2)) < 1) then
do return "body" end;
end;
if (__hypot((lx + 4.4), ly) < 1) then
do return "mane" end;
end;
local ph = ({[0]=0, 1, 0, (-1), length=4})[gait];
do
local __t127, __t128 = __it({[0]={[0]=2.3, 1, 1, length=3}, {[0]=2.3, (-1), (-1), length=3}, {[0]=(-2.4), 1, (-1), length=3}, {[0]=(-2.4), (-1), 1, length=3}, length=4}), 0;
while __t128 < __t127.length do
local __t130 = __t127[__t128]; __t128 = __t128 + 1; local fx, sy, sw; fx = __t130[0]; sy = __t130[1]; sw = __t130[2];
if (__hypot(((lx - fx) - (ph * sw)), (ly - (sy * 2))) < 0.75) then
do return "leg" end;
end;
end;
end;
do return nil end;
end;
ctx.fillStyle = "rgba(8,10,6,.4)";
ctx:fillRect((cx - 3), (cy + 2), 7, 1);
local cells = {length=0};
for py = (-7), 7 do
for qx = (-7), 7 do
local lx = ((qx * c) + (py * s));
local ly = (((-qx) * s) + (py * c));
local m = mat(lx, ly);
if __T(m) then
__push(cells, {[0]=qx, py, m, length=3});
end;
end;
end;
local has = __Set(__map(cells, function(__t133) local a, b; a = __t133[0]; b = __t133[1];
return ((__str(a) .. ",") .. __str(b));
end));
do
local __t134, __t135 = __it(cells), 0;
while __t135 < __t134.length do
local __t137 = __t134[__t135]; __t135 = __t135 + 1; local qx, py, m; qx = __t137[0]; py = __t137[1]; m = __t137[2];
local edge = ((m ~= "leg") and ((((not __has(has, ((__str((qx - 1)) .. ",") .. __str(py)))) or (not __has(has, ((__str((qx + 1)) .. ",") .. __str(py))))) or (not __has(has, ((__str(qx) .. ",") .. __str((py - 1)))))) or (not __has(has, ((__str(qx) .. ",") .. __str((py + 1)))))));
M.px(ctx, (cx + qx), ((cy + py) - 1), (function() if edge then return __I0.PAL.ink; elseif (m == "mane") then return __I0.PAL.mane; elseif (m == "leg") then return __I0.PAL.horseD; else return __I0.PAL.horse; end; end)());
end;
end;
end;
-- render:786
M.drawRider = function(ctx, u, g) 
local flash;
local x = __mfloor((u.x or __NaN) + 0.5);
local y = __mfloor((u.y or __NaN) + 0.5);
flash = ((u.hit or __NaN) > 0);
local C = function(c) 
return (flash and "#ffffff" or c);
end;
if __T(u.mounted) then
M.drawHorse(ctx, u.horse.x, u.horse.y, u.horse.face, u.horse.walk, true, g.t);
M.px(ctx, x, (y - 2), C(__I0.PAL.tan));
M.px(ctx, (x - 1), (y - 2), C(__I0.PAL.tan));
M.px(ctx, x, (y - 3), C(__I0.PAL.hair));
M.px(ctx, (x + ((__mcos((u.horse.face or __NaN)) > 0) and 1 or (-1))), (y - 3), C((function() if (__mfmod(__mfloor(((g.t or __NaN) * 3)), 4) ~= 0) then return __I0.PAL.steel; else return "#ffffff"; end; end)()));
do return end;
end;
if ((u.state == "flung") or (u.state == "stun")) then
ctx.fillStyle = C(__I0.PAL.tan);
ctx:fillRect((x - 1), (y - 1), 3, 1);
M.px(ctx, (x + 2), (y - 1), C(__I0.PAL.hair));
if (u.state == "stun") then
local a = ((g.t or __NaN) * 6);
M.px(ctx, __mfloor((x + (__mcos(a) * 3)) + 0.5), __mfloor(((y - 4) + __msin(a)) + 0.5), __I0.PAL.gold);
M.px(ctx, __mfloor((x + (__mcos((a + math.pi)) * 3)) + 0.5), __mfloor(((y - 4) + __msin((a + math.pi))) + 0.5), __I0.PAL.gold);
end;
do return end;
end;
local st = (__T(u.moving) and __mfmod(__mfloor((u.walk or __NaN)), 2) or 2);
if (st ~= 0) then
M.px(ctx, (x - 1), y, __I0.PAL.ink);
end;
if (st ~= 1) then
M.px(ctx, (x + 1), y, __I0.PAL.ink);
end;
ctx.fillStyle = C(__I0.PAL.tan);
ctx:fillRect((x - 1), (y - 2), 3, 2);
M.px(ctx, x, (y - 3), C(__I0.PAL.hair));
M.px(ctx, (x + ((u.fx or __NaN) * 2)), (y - 3), C(__I0.PAL.steelHi));
end;
-- render:813
M.drawClimber = function(ctx, u, g) 
local x = __mfloor((u.x or __NaN) + 0.5);
local y = __mfloor((u.y or __NaN) + 0.5);
local wig = __mfmod(__mfloor((u.walk or __NaN)), 2);
ctx.fillStyle = __I0.PAL.ink;
ctx:fillRect(((x - 1) - wig), (y - 3), 4, 5);
ctx.fillStyle = __I0.PAL.tan;
ctx:fillRect((x - wig), (y - 1), 2, 2);
M.px(ctx, ((x + 1) - wig), (y - 2), __I0.PAL.skin);
M.px(ctx, (x - wig), (y - 2), __I0.PAL.hair);
if ((u.stab or __NaN) > 0) then
M.px(ctx, (x - 1), (y - 2), "#ffffff");
M.px(ctx, (x - 2), (y - 3), __I0.PAL.sigil);
else
M.px(ctx, ((x + 2) - wig), (y - 1), __I0.PAL.steelHi);
end;
local w = 12;
local gx = (__mfloor((g.boss.x or __NaN) + 0.5) - 6);
local gy = (__mfloor((g.boss.y or __NaN) + 0.5) - 22);
ctx.fillStyle = __I0.PAL.ink;
ctx:fillRect((gx - 1), (gy - 1), (w + 2), 3);
ctx.fillStyle = __I0.PAL.gold;
ctx:fillRect(gx, gy, __mmax(0, __mfloor(((w * (u.grip or __NaN)) / 100) + 0.5)), 1);
end;
-- render:837
M.drawAdd = function(ctx, a, g) 
local x = __mfloor((a.x or __NaN) + 0.5);
local y = __mfloor((a.y or __NaN) + 0.5);
local flip = ((a.fx or __NaN) < 0);
local flash = ((a.hit or __NaN) > 0);
ctx.fillStyle = "rgba(8,10,6,.4)";
ctx:fillRect((x - __mceil((a.r or __NaN))), (y + 1), ((__mceil((a.r or __NaN)) * 2) + 1), 1);
if __T(M.LEVEL_ADD_ART[a.kind]) then
M.LEVEL_ADD_ART[a.kind](ctx, a, g, M.H_ART);
else
local frames = M.ADD_ART[a.kind];
local map;
if ((a.kind == "spitter") or (a.kind == "necro")) then map = frames[(((a.swing or __NaN) > 0) and 1 or 0)]; else map = frames[(__T(a.moving) and __mfmod(__mfloor((a.walk or __NaN)), 2) or 0)]; end;
local w = (map[0].length or #map[0]);
local h = (map.length or #map);
local ox = (x - __mfloor((w / 2)));
local oy = (((y - h) + 1) - (((a.kind == "gnasher") and ((a.swing or __NaN) > 0)) and 1 or 0));
__forEach(map, function(row, ry) 
for rx = 0, w - 1 do
local ch = __charAt(row, (flip and ((w - 1) - rx) or rx));
if (ch ~= ".") then
M.px(ctx, (ox + rx), (oy + ry), (flash and "#ffffff" or M.ADD_COL[ch]));
end;
end;
end);
end;
if ((a.hp or __NaN) < (a.maxhp or __NaN)) then
local bw = 5;
local bx = (x - 2);
local by = (y - ((a.kind == "necro") and 9 or 7));
ctx.fillStyle = __I0.PAL.ink;
ctx:fillRect(bx, by, bw, 1);
ctx.fillStyle = __I0.PAL.gold;
ctx:fillRect(bx, by, __mmax(1, __mfloor(((bw * (a.hp or __NaN)) / (a.maxhp or __NaN)) + 0.5)), 1);
end;
end;
-- render:854
M.drawCorpse = function(ctx, c) 
local a = (((c.t or __NaN) > 30) and ((40 - (c.t or __NaN)) / 10) or 1);
ctx.globalAlpha = (__mmax(0, a) * 0.85);
local x = __mfloor((c.x or __NaN) + 0.5);
local y = __mfloor((c.y or __NaN) + 0.5);
if __T(c.critter) then
if __T(M.CORPSE_ART[c.critter]) then
M.CORPSE_ART[c.critter](ctx, c, M.H_ART);
else
ctx.fillStyle = __I0.PAL.brown;
ctx:fillRect((x - 1), (y - 1), 3, 1);
M.px(ctx, x, y, __I0.PAL.blood);
end;
ctx.globalAlpha = 1;
do return end;
end;
ctx.fillStyle = __I0.PAL[__I1.CLASS[c.cls].col];
ctx:fillRect((x - 1), (y - 1), ((c.cls == "pet") and 2 or 3), 1);
M.px(ctx, (x + 2), (y - 1), (function() if (c.cls == "pet") then return __I0.PAL.brown; else return __I0.PAL.skin; end; end)());
M.px(ctx, x, y, __I0.PAL.blood);
if ((c.t or __NaN) < 8) then
M.px(ctx, (x - 1), y, __I0.PAL.blood);
end;
ctx.globalAlpha = 1;
end;
-- render:871
M.drawGhost = function(ctx, o) 
local a = ((1 - ((o.t or __NaN) / 3.5)) * 0.7);
ctx.globalAlpha = a;
local x = __mfloor(((o.x or __NaN) + (__msin(((o.t or __NaN) * 4)) * 1.2)) + 0.5);
local y = __mfloor((o.y or __NaN) + 0.5);
ctx.fillStyle = __I0.PAL.ghost;
ctx:fillRect(x, (y - 2), 1, 1);
ctx:fillRect((x - 1), (y - 1), 3, 2);
M.px(ctx, (x - 1), (y + 1), __I0.PAL.ghost);
M.px(ctx, (x + 1), (y + 1), __I0.PAL.ghost);
ctx.globalAlpha = 1;
end;
-- render:880
M.drawBolt = function(ctx, o) 
local col = __I0.PAL[o.kind];
local x = __mfloor((o.x or __NaN) + 0.5);
local y = __mfloor((o.y or __NaN) + 0.5);
local l = __orv(__hypot((__T(o.vx) and o.vx or 0), (__T(o.vy) and o.vy or 0)), 1);
M.px(ctx, x, y, col);
ctx.globalAlpha = 0.6;
M.px(ctx, __mfloor(((o.x or __NaN) - (((o.vx or __NaN) / l) * 1.5)) + 0.5), __mfloor(((o.y or __NaN) - (((o.vy or __NaN) / l) * 1.5)) + 0.5), col);
ctx.globalAlpha = 1;
if (o.kind == "arrow") then
M.px(ctx, __mfloor(((o.x or __NaN) - (((o.vx or __NaN) / l) * 2.5)) + 0.5), __mfloor(((o.y or __NaN) - (((o.vy or __NaN) / l) * 2.5)) + 0.5), __I0.PAL.tan);
end;
end;
-- render:889
M.drawPart = function(ctx, p) 
local k = ((p.t or __NaN) / (p.life or __NaN));
local col = (__T(__I0.PAL[p.kind]) and __I0.PAL[p.kind] or p.kind);
if (p.kind == "flame") then
if (k < 0.3) then col = __I0.PAL.fire3; elseif (k < 0.6) then col = __I0.PAL.fire2; else col = __I0.PAL.fire1; end;
end;
ctx.globalAlpha = (((p.kind == "heal") or (p.kind == "dust")) and (1 - k) or 1);
M.px(ctx, __mfloor((p.x or __NaN) + 0.5), __mfloor((p.y or __NaN) + 0.5), col);
ctx.globalAlpha = 1;
end;
-- render:898
M.bubble = function(ctx, s, x, y, bg, fg, alpha) if alpha == nil then alpha = 1 end;
local w = __I0.textWidth(s);
local bx = __mmax(((M.VIEW.x or __NaN) + 2), __mmin(((((M.VIEW.x or __NaN) + __I1.W) - w) - 6), __mfloor(((x - (w / 2)) - 2) + 0.5)));
local by = __mmax(((M.VIEW.y or __NaN) + 2), __mfloor(y + 0.5));
ctx.globalAlpha = (alpha * 0.82);
ctx.fillStyle = bg;
ctx:fillRect(bx, by, (w + 4), 7);
ctx:fillRect(__mfloor(x + 0.5), (by + 7), 1, 1);
ctx.globalAlpha = 1;
__I0.drawText(ctx, s, (bx + 2), (by + 1), fg, {shadow=false, alpha=alpha});
end;
-- render:908
M.drawBark = function(ctx, k) 
local a = (((k.t or __NaN) < 0.1) and ((k.t or __NaN) / 0.1) or (((k.t or __NaN) > ((k.life or __NaN) - 0.3)) and (((k.life or __NaN) - (k.t or __NaN)) / 0.3) or 1));
M.bubble(ctx, k.s, k.x, ((k.y or __NaN) - 14), __I0.PAL.ink, __I0.PAL.cream, a);
end;
-- render:913
M.drawThought = function(ctx, g) 
local b = g.boss;
local t = g.thought;
local a = (((t.t or __NaN) < 0.2) and ((t.t or __NaN) / 0.2) or (((t.t or __NaN) > 2.1) and ((2.4 - (t.t or __NaN)) / 0.3) or 1));
M.bubble(ctx, t.s, b.x, ((b.y or __NaN) - 32), __I0.PAL.cream, __I0.PAL.ink, a);
ctx.globalAlpha = (a * 0.8);
ctx.fillStyle = __I0.PAL.cream;
ctx:fillRect((__mfloor((b.x or __NaN) + 0.5) + 1), (__mfloor((b.y or __NaN) + 0.5) - 22), 1, 1);
ctx.globalAlpha = 1;
end;
-- fmt: replaced by the build
M.fmt = RT.commas;
-- render:926
M.drawHud = function(ctx, g, view) 
local b = g.boss;
ctx.fillStyle = __I0.PAL.ink;
ctx.globalAlpha = 0.28;
ctx:fillRect(0, 0, 136, 36);
ctx:fillRect((__I1.W - __mmax(108, (__I0.textWidth(b.name) + 8))), 0, __mmax(108, (__I0.textWidth(b.name) + 8)), 24);
ctx.globalAlpha = 1;
__I0.drawText(ctx, M.fmt(g.score), 4, 3, __I0.PAL.cream, {scale=2});
local mc;
if ((g.mult or __NaN) >= 4) then mc = __I0.PAL.gold; elseif ((g.mult or __NaN) >= 2) then mc = __I0.PAL.yellow; else mc = __I0.PAL.cream; end;
local mp = g.map;
local L = mp.level;
__I0.drawText(ctx, (((mp.mode == "patrol") and "AIMLESS" or "VENGEANCE") .. " X" .. __toFixed(g.mult, 2)), 4, 15, mc);
local goal = (__T(g.won) and "YOU WIN" or (__T(g.clear) and "LEVEL CLEARED" or (function() if __T(L.hud) then return L.hud(g); elseif __T(g.dir.final) then return "BEAT THE 40-MAN"; elseif (mp.mode == "patrol") then return (((g.lapsMap or __NaN) < __I1.RAID_LAPS) and ("LAP " .. __str(g.lapsMap) .. "/" .. __str(__I1.RAID_LAPS) .. " TO THE RAID") or ("LAP " .. __str(g.lapsMap) .. "/" .. __str(__I1.FINAL_LAPS) .. " TO THE BIG ONE")); else return ("CHAOS " .. __str(__mfloor(((g.chaos or __NaN) * 100))) .. "%  " .. (((g.chaos or __NaN) < 0.5) and "RAID AT 50" or "BIG ONE AT 100")); end; end)()));
__I0.drawText(ctx, ("LV " .. __str(mp.n) .. "  " .. __str(goal)), 4, 22, (function() if __T(g.dir.final) then return __I0.PAL.red; else return __I0.PAL.rock3; end; end)());
if (mp.mode == "chaos") then
local cx = (8 + __I0.textWidth(("HOARD " .. __str(M.fmt(g.points)))));
ctx.fillStyle = __I0.PAL.ink;
ctx:fillRect(cx, 30, 42, 4);
if ((g.chaos or __NaN) >= 1) then ctx.fillStyle = __I0.PAL.red; else ctx.fillStyle = __I0.PAL.orange; end;
ctx:fillRect((cx + 1), 31, __mfloor((40 * __mmin(1, (g.chaos or __NaN))) + 0.5), 2);
ctx.fillStyle = __I0.PAL.cream;
ctx:fillRect((cx + 21), 30, 1, 4);
end;
__I0.drawText(ctx, ("HOARD " .. __str(M.fmt(g.points))), 4, 29, __I0.PAL.gold, {alpha=0.85});
__I0.drawText(ctx, b.name, (__I1.W - 4), 3, __I0.PAL.cream, {align="right"});
local bw = 100;
local bx = ((__I1.W - 4) - bw);
local by = 10;
ctx.fillStyle = __I0.PAL.ink;
ctx:fillRect((bx - 1), (by - 1), (bw + 2), 7);
ctx.fillStyle = __I0.PAL.hpBg;
ctx:fillRect(bx, by, bw, 5);
local fw = __mfloor(((bw * (b.hp or __NaN)) / (b.maxhp or __NaN)) + 0.5);
ctx.fillStyle = __I0.PAL.hpLo;
ctx:fillRect(bx, by, fw, 5);
ctx.fillStyle = __I0.PAL.hpHi;
ctx:fillRect(bx, by, fw, 3);
if ((b.flash or __NaN) > 0) then
ctx.fillStyle = "#ffffff";
ctx:fillRect(((bx + fw) - 1), by, 1, 5);
end;
ctx.fillStyle = __I0.PAL.ink;
for i = 1, 10 - 1 do
ctx:fillRect((bx + (i * 10)), (by + 4), 1, 1);
end;
__I0.drawText(ctx, (__str(__mceil((b.hp or __NaN))) .. " / " .. __str(b.maxhp)), (__I1.W - 4), 17, __I0.PAL.rock3, {align="right"});
local blink = __mfmod(__mfloor(((g.t or __NaN) * 3)), 2);
if __T(b.dead) then
__I0.drawText(ctx, "DEFEATED", 4, 170, __I0.PAL.red);
elseif __T(b.evade) then
__I0.drawText(ctx, "EVADING...", 4, 170, __I0.PAL.cream, {alpha=((blink ~= 0) and 1 or 0.5)});
elseif (g.map.mode ~= "patrol") then
__I0.drawText(ctx, ((((g.vengeT or __NaN) > 4) and ((g.mult or __NaN) > 1)) and "VENGEANCE FADING" or "WRECK IT"), 4, 170, (function() if (((g.vengeT or __NaN) > 4) and ((g.mult or __NaN) > 1)) then return __I0.PAL.red; else return __I0.PAL.orange; end; end)(), {alpha=(((((g.vengeT or __NaN) > 4) and ((g.mult or __NaN) > 1)) and (not (blink ~= 0))) and 0.6 or 1)});
elseif __T(g.onPatrol) then
__I0.drawText(ctx, "ON PATROL", 4, 170, __I0.PAL.tuftHi);
else
__I0.drawText(ctx, (((g.offLane or __NaN) > 3) and "AIMLESSNESS FADING" or "OFF THE PATH"), 4, 170, __I0.PAL.red, {alpha=((blink ~= 0) and 1 or 0.6)});
end;
local m = __mfloor(((g.t or __NaN) / 60));
local s = __mfloor(__mfmod((g.t or __NaN), 60));
__I0.drawText(ctx, (__str(m) .. ":" .. __padStart(__str(s), 2, "0")), (__I1.W - 4), 170, __I0.PAL.rock3, {align="right"});
if __T(view.muted) then
__I0.drawText(ctx, "MUTED", (__I1.W - 4), 163, __I0.PAL.rock2, {align="right"});
end;
local n = 6;
local bs = 14;
local gap = 3;
local x0 = __mfloor(((__I1.W / 2) - (((n * bs) + ((n - 1) * gap)) / 2)) + 0.5);
local y0 = 160;
__forEach(__sarr(1, g.slots, 0, "shake"), function(k, i) 
local x = (x0 + (i * (bs + gap)));
local key;
if (i < 5) then key = __I1.SLOT_KEYS[i]; else key = "SPC"; end;
ctx.fillStyle = __I0.PAL.ink;
ctx.globalAlpha = 0.8;
ctx:fillRect(x, y0, bs, bs);
ctx.globalAlpha = 1;
if (not __T(k)) then
ctx.fillStyle = __I0.PAL.rock1;
ctx:fillRect(x, y0, bs, 1);
ctx:fillRect(x, ((y0 + bs) - 1), bs, 1);
ctx:fillRect(x, y0, 1, bs);
ctx:fillRect(((x + bs) - 1), y0, 1, bs);
__forEach(__I0.ICONS.empty, function(row, r) 
for c = 0, 8 - 1 do
if (__ch(row, c) == "#") then
ctx:fillRect(((x + 3) + c), ((y0 + 3) + r), 1, 1);
end;
end;
end);
__I0.drawText(ctx, key, ((x + (bs / 2)) + 1), ((y0 + bs) + 1), __I0.PAL.rock1, {align="center", shadow=false});
do return end;
end;
local cd = b.cd[k];
local max = g.abil[k].cd;
local ready = ((cd <= 0) and (not __T(b.dead)));
local active = ((b.act and b.act.kind) == k);
if active then ctx.fillStyle = __I0.PAL.gold; elseif ready then ctx.fillStyle = __I0.PAL.rock3; else ctx.fillStyle = __I0.PAL.rock1; end;
ctx:fillRect(x, y0, bs, 1);
ctx:fillRect(x, ((y0 + bs) - 1), bs, 1);
ctx:fillRect(x, y0, 1, bs);
ctx:fillRect(((x + bs) - 1), y0, 1, bs);
if ready then ctx.fillStyle = (function() if active then return __I0.PAL.gold; else return __I0.PAL.cream; end; end)(); else ctx.fillStyle = __I0.PAL.rock2; end;
__forEach(__I0.ICONS[k], function(row, r) 
for c = 0, 8 - 1 do
if (__ch(row, c) == "#") then
ctx:fillRect(((x + 3) + c), ((y0 + 3) + r), 1, 1);
end;
end;
end);
if (cd > 0) then
local h = __mceil((((bs - 2) * cd) / max));
ctx.fillStyle = __I0.PAL.ink;
ctx.globalAlpha = 0.6;
ctx:fillRect((x + 1), (y0 + 1), (bs - 2), h);
ctx.globalAlpha = 1;
if (cd > 1) then
__I0.drawText(ctx, __str(__mceil(cd)), ((x + (bs / 2)) + 1), (y0 + 5), __I0.PAL.cream, {align="center"});
end;
end;
__I0.drawText(ctx, key, ((x + (bs / 2)) + 1), ((y0 + bs) + 1), __I0.PAL.rock3, {align="center", shadow=false});
end);
if ((b.haste or __NaN) > 0) then
__I0.drawText(ctx, "ZOOMIES", (x0 - 4), 163, __I0.PAL.gold, {align="right"});
end;
local climber = __find(g.units, function(u) 
return ((u.role == "rider") and (u.state == "climb"));
end);
if (__T(climber) and (not __T(b.dead))) then
__I0.drawText(ctx, "HE IS IN YOUR FUR! SHAKE! [SPACE]", (__I1.W / 2), 151, __I0.PAL.gold, {align="center", alpha=((blink ~= 0) and 1 or 0.55)});
elseif __T(b.taunt) then
__I0.drawText(ctx, "TAUNTED", (__I1.W / 2), 151, __I0.PAL.red, {align="center"});
end;
if __T(g.banner) then
local t = g.banner.t;
local d = g.banner.dur;
local a = ((t < 0.2) and (t / 0.2) or ((t > (d - 0.5)) and __mmax(0, ((d - t) / 0.5)) or 1));
__I0.drawText(ctx, g.banner.s, (__I1.W / 2), 34, __I0.PAL.cream, {scale=2, align="center", alpha=a});
if __T(g.banner.sub) then
__I0.drawText(ctx, g.banner.sub, (__I1.W / 2), 47, __I0.PAL.rock4, {align="center", alpha=a});
end;
end;
end;
-- render:1013
M.drawCursor = function(ctx, mx, my, g) 
local x = __mfloor(mx + 0.5);
local y = __mfloor(my + 0.5);
local col;
if __T(g.boss.act) then col = __I0.PAL.gold; else col = __I0.PAL.cream; end;
do
local __t142, __t143 = __it({[0]={[0]=(-3), 0, length=2}, {[0]=(-2), 0, length=2}, {[0]=2, 0, length=2}, {[0]=3, 0, length=2}, {[0]=0, (-3), length=2}, {[0]=0, (-2), length=2}, {[0]=0, 2, length=2}, {[0]=0, 3, length=2}, length=8}), 0;
while __t143 < __t142.length do
local __t145 = __t142[__t143]; __t143 = __t143 + 1; local dx, dy; dx = __t145[0]; dy = __t145[1];
ctx.fillStyle = __I0.PAL.ink;
ctx:fillRect(((x + dx) + 1), ((y + dy) + 1), 1, 1);
end;
end;
do
local __t146, __t147 = __it({[0]={[0]=(-3), 0, length=2}, {[0]=(-2), 0, length=2}, {[0]=2, 0, length=2}, {[0]=3, 0, length=2}, {[0]=0, (-3), length=2}, {[0]=0, (-2), length=2}, {[0]=0, 2, length=2}, {[0]=0, 3, length=2}, length=8}), 0;
while __t147 < __t146.length do
local __t149 = __t146[__t147]; __t147 = __t147 + 1; local dx, dy; dx = __t149[0]; dy = __t149[1];
M.px(ctx, (x + dx), (y + dy), col);
end;
end;
end;

-- render:9
M.PROP_ART = __assign({}, __unpack(__it(__map(__I2.LEVELS, function(L) 
return (function() local __t1 = (L.art and L.art.props); if __T(__t1) then return __t1 end; return {} end)();
end))));
-- render:10
M.CRITTER_ART = __assign({}, __unpack(__it(__map(__I2.LEVELS, function(L) 
return (function() local __t2 = (L.art and L.art.critters); if __T(__t2) then return __t2 end; return {} end)();
end))));
-- render:11
M.LEVEL_ADD_ART = __assign({}, __unpack(__it(__map(__I2.LEVELS, function(L) 
return (function() local __t3 = (L.art and L.art.adds); if __T(__t3) then return __t3 end; return {} end)();
end))));
-- render:12
M.CORPSE_ART = __assign({}, __unpack(__it(__map(__I2.LEVELS, function(L) 
return (function() local __t4 = (L.art and L.art.corpses); if __T(__t4) then return __t4 end; return {} end)();
end))));
-- render:14
M.VIEW = {x=0, y=0};
-- render:18
M.sprites = __Map();
M.similar = __Map();
-- render:19
M.spriteBudget = 0;
-- render:31
M.onScreen = function(x, y, m) if m == nil then m = 30 end;
return ((((x > ((M.VIEW.x or __NaN) - m)) and (x < (((M.VIEW.x or __NaN) + __I1.W) + m))) and (y > ((M.VIEW.y or __NaN) - m))) and (y < (((M.VIEW.y or __NaN) + __I1.H) + m)));
end;
-- render:33
M.TAU = (math.pi * 2);
-- render:44
M.THEME_PAL = {clearing={grass={[0]=__I0.PAL.grass0, __I0.PAL.grass1, __I0.PAL.grass2, __I0.PAL.grass3, length=4}, tuft={[0]=__I0.PAL.tuft, __I0.PAL.tuftHi, length=2}, canopy={[0]=__I0.PAL.canopy0, __I0.PAL.canopy1, __I0.PAL.canopy2, __I0.PAL.canopy3, length=4}, dirt={[0]=__I0.PAL.dirt0, __I0.PAL.dirt1, __I0.PAL.dirt2, __I0.PAL.dirt3, length=4}, flowers={[0]=__I0.PAL.cream, __I0.PAL.yellow, __I0.PAL.pink, __I0.PAL.frost, length=4}}, autumn={grass={[0]="#3a2a16", "#4a3519", "#5c4220", "#6e5126", length=4}, tuft={[0]="#8a5a22", "#b06f26", length=2}, canopy={[0]="#1c0e08", "#4a1a0e", "#7a2c12", "#b0501c", length=4}, dirt={[0]="#33251a", "#4a3825", "#5e4830", "#72583a", length=4}, flowers={[0]=__I0.PAL.gold, __I0.PAL.red, __I0.PAL.orange, length=3}}, ash={grass={[0]="#24221e", "#2c2a25", "#35322c", "#3f3b34", length=4}, tuft={[0]="#4a463e", "#5a554b", length=2}, canopy={[0]="#0b0a09", "#161412", "#211e1b", "#2e2a25", length=4}, dirt={[0]="#1a1714", "#26221e", "#322d27", "#3e3830", length=4}, flowers={[0]="#ff6a2a", "#ffb02e", "#c0392b", length=3}}, snow={grass={[0]="#aab8c3", "#bccad4", "#cfdbe3", "#e2eaf0", length=4}, tuft={[0]="#93a5b3", "#a3b4c1", length=2}, canopy={[0]="#0b1812", "#13261d", "#1d382a", "#dfe8ee", length=4}, dirt={[0]="#6e6459", "#83786b", "#968a7c", "#a99d8e", length=4}, flowers={[0]="#ffffff", "#9fd8ff", length=2}}};
-- render:56
M.calm = false;
-- render:206
M.previews = __Map();
-- render:214
M.markerCv = nil;
-- render:228
M.H_ART = {px=function(ctx, x, y, c) 
return M.px(ctx, x, y, c);
end, PAL=__I0.PAL, hash=__I0.hash, vnoise=M.vnoise, drawText=__I0.drawText, sprite=M.sprite, tinted=__I0.tinted, ring=function(...) local a = __pack(...);
return M.ring(__unpack(__it(a)));
end, textWidth=__I0.textWidth, VIEW=M.VIEW, W=__I1.W, H=__I1.H};
-- render:538
M.SMOKE_R = {[0]=2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 19, 22, 26, 30, length=15};
-- render:539
M.SMOKE_COL = {[0]="#3a3733", "#55514a", __I0.PAL.smoke, "#8a857a", "#aba69a", "#c9c4b6", length=6};
-- render:540
M.SMOKE_RGB = __map(M.SMOKE_COL, function(h) 
return {[0]=__parseInt(__slice(h, 1, 3), 16), __parseInt(__slice(h, 3, 5), 16), __parseInt(__slice(h, 5, 7), 16), length=3};
end);
-- render:541
M.BAYER = __map({[0]=0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5, length=16}, function(v) 
return ((v + 0.5) / 16);
end);
-- render:828
M.ADD_ART = {gnasher={[0]={[0]=".h..h.", "kFFFFk", "kfFFek", "kfffFk", ".k..k.", length=5}, {[0]=".h..h.", "kFFFFk", "kfFFek", "kfffFk", "..kk..", length=5}, length=2}, spitter={[0]={[0]="..kkk..", ".kRRRk.", "kRrRRek", "kRrRRmk", "kRRrRRk", ".kkkkk.", length=6}, {[0]="..kkk..", ".kRRRk.", "kRrRRek", "kRrRMMM", "kRRrRRk", ".kkkkk.", length=6}, length=2}, necro={[0]={[0]="..kkk..s", ".kPPPk.s", ".kPgPk.s", "kPPPPPks", "kPpPPPks", "kPPPPPk.", ".kk.kk..", length=7}, {[0]="..kkk..G", ".kPPPk.s", ".kPgPk.s", "kPPPPPks", "kPpPPPks", "kPPPPPk.", ".kk.kk..", length=7}, length=2}, skeleton={[0]={[0]=".b.", "bbb", ".b.", "b.b", length=4}, {[0]=".b.", "bbb", ".b.", ".b.", length=4}, length=2}};
-- render:834
M.ADD_COL = {k=__I0.PAL.ink, F=__I0.PAL.fur3, f=__I0.PAL.fur2, e=__I0.PAL.eye, h=__I0.PAL.horn, R="#b8452a", r="#7e2a18", m="#3a120a", M=__I0.PAL.fire3, P="#4a2a5e", p="#2e1a3c", g=__I0.PAL.heal, s=__I0.PAL.brown, G=__I0.PAL.heal, b=__I0.PAL.bone};
