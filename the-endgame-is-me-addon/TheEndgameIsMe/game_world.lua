-- Generated from the-endgame-is-me/js/world.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("world");
local __I0 = RT.module("props");
local __I1 = RT.module("smoke");
local __I2 = RT.module("levels/index");
local __Set, __T, __add, __assign, __assignKV, __every, __filter, __find, __findIndex, __forEach, __fromEntries, __has, __hypot, __indexOf, __it, __map, __objKeys, __orv, __pairs, __push, __reduce, __sarr, __setlen, __shift, __shr, __sign, __slice, __some, __sort, __splice, __startsWith, __str, __toFixed, __u32 = RT["Set"], RT["T"], RT["add"], RT["assign"], RT["assignKV"], RT["every"], RT["filter"], RT["find"], RT["findIndex"], RT["forEach"], RT["fromEntries"], RT["has"], RT["hypot"], RT["indexOf"], RT["it"], RT["map"], RT["objKeys"], RT.orv, pairs, RT["push"], RT["reduce"], RT["sarr"], RT["setlen"], RT["shift"], RT["shr"], RT["sign"], RT["slice"], RT["some"], RT["sort"], RT["splice"], RT["startsWith"], RT["str"], RT["toFixed"], RT["u32"];
local __NaN = 0 / 0;
local __mabs, __matan2, __mceil, __mcos, __mexp, __mfloor, __mfmod, __mmax, __mmin, __mrandom, __msin, __msqrt = math.abs, math.atan2, math.ceil, math.cos, math.exp, math.floor, math.fmod, math.max, math.min, math.random, math.sin, math.sqrt;

-- mulberry32: replaced by the build
M.mulberry32 = RT.mulberry32;
-- world:164
M.syncView = function(g) 
M.AR = g.map.arena;
M.V.x = g.cam.x;
M.V.y = g.cam.y;
end;
-- world:171
M.makeMap = function(n, rng) 
local A;
local B;
local ctrl;
if (n == 1) then
A = {x=92, y=98};
B = {x=228, y=98};
ctrl = {[0]=A, B, length=2};
else
A = {x=(38 + (rng() * 22)), y=(48 + (rng() * 90))};
B = {x=((M.W - 38) - (rng() * 22)), y=(48 + (rng() * 90))};
if (rng() < 0.5) then
A, B = B, A;
end;
local k = __mmin(7, (n + 1));
local amp = __mmin(54, (18 + (n * 9)));
ctrl = {[0]=A, length=1};
for i = 1, k do
local t = (i / (k + 1));
local x = (((A.x or __NaN) + (((B.x or __NaN) - (A.x or __NaN)) * t)) + ((rng() - 0.5) * 16));
local y = ((98 + (((__mfmod(i, 2) ~= 0) and (-1) or 1) * (amp * (0.6 + (rng() * 0.4))))) + ((rng() - 0.5) * 12));
__push(ctrl, {x=x, y=M.clamp(y, ((x < 110) and 44 or 36), 144)});
end;
__push(ctrl, B);
end;
local pts = {length=0};
local P = function(i) 
return ctrl[M.clamp(i, 0, ((ctrl.length or #ctrl) - 1))];
end;
do
local i = 0;
while (i < ((ctrl.length or #ctrl) - 1)) do
local p0 = P((i - 1));
local p1 = P(i);
local p2 = P((i + 1));
local p3 = P((i + 2));
local steps = __mmax(2, __mceil((__hypot(((p2.x or __NaN) - (p1.x or __NaN)), ((p2.y or __NaN) - (p1.y or __NaN))) / 2)));
for s = 0, steps - 1 do
local t = (s / steps);
local t2 = (t * t);
local t3 = (t2 * t);
local f = function(a, b, c, d) 
return (0.5 * ((((2 * b) + (((-a) + c) * t)) + (((((2 * a) - (5 * b)) + (4 * c)) - d) * t2)) + (((((-a) + (3 * b)) - (3 * c)) + d) * t3)));
end;
__push(pts, {x=f(p0.x, p1.x, p2.x, p3.x), y=f(p0.y, p1.y, p2.y, p3.y)});
end;
i = i + 1;
end;
end;
__push(pts, {x=B.x, y=B.y});
local len = 0;
__forEach(pts, function(p, i) 
if __T(i) then
len = (len + __hypot(((p.x or __NaN) - (pts[(i - 1)].x or __NaN)), ((p.y or __NaN) - (pts[(i - 1)].y or __NaN))));
end;
p.s = len;
end);
local df = M.pathField(pts);
do return {n=n, theme=M.THEMES[__mfmod((n - 1), M.THEMES.length)], A=A, B=B, pts=pts, len=len, df=df, seed=__mfloor((rng() * 1000000000))} end;
end;
-- pathField: replaced by the build
M.pathField = RT.pathField;
-- world:218
M.pathDist = function(m, x, y) 
do return m.df[((M.clamp(__mfloor((y - 0.5) + 0.5), 0, (M.H - 1)) * M.W) + M.clamp(__mfloor((x - 0.5) + 0.5), 0, (M.W - 1)))] end;
end;
-- world:219
M.pathNearest = function(m, x, y) 
local best = m.pts[0];
local bd = math.huge;
do
local __t7, __t8 = __it(m.pts), 0;
while __t8 < __t7.length do
local p = __t7[__t8]; __t8 = __t8 + 1;
local d = ((((p.x or __NaN) - x) ^ 2) + (((p.y or __NaN) - y) ^ 2));
if (d < bd) then
bd = d;
best = p;
end;
end;
end;
do return best end;
end;
-- world:224
M.pathAt = function(m, s) 
local q;
local p = (function() local __t10 = __find(m.pts, function(q) 
return ((q.s or __NaN) >= s);
end); if __T(__t10) then return __t10 end; return m.pts[((m.pts.length or #m.pts) - 1)] end)();
local i = __indexOf(m.pts, p);
q = m.pts[__mmin(((m.pts.length or #m.pts) - 1), (i + 1))];
do return {x=p.x, y=p.y, face=__matan2(((q.y or __NaN) - (p.y or __NaN)), ((q.x or __NaN) - (p.x or __NaN)))} end;
end;
-- world:233
M.createGame = function(seed, look) if seed == nil then seed = __u32((__mrandom() * (2 ^ 32))) end;
local rng = M.mulberry32(seed);
local g = {seed=seed, rng=rng, t=0, map=nil, cam={x=0, y=0}, boss={x=0, y=0, face=0, r=M.BOSS_R, hp=M.BOSS_HP, maxhp=M.BOSS_HP, act=nil, queue=nil, cd=__fromEntries(__map(__objKeys(M.ABIL), function(k) 
return {[0]=k, 0, length=2};
end)), walk=0, moving=false, evade=nil, taunt=nil, flash=0, dead=false, deadT=0, calmT=99, haste=0, name=M.BOSS_NAMES[__mfloor((rng() * M.BOSS_NAMES.length))]}, units={length=0}, parties={length=0}, corpses={length=0}, ghosts={length=0}, fires={length=0}, ice={length=0}, bolts={length=0}, parts={length=0}, texts={length=0}, barks={length=0}, rings={length=0}, adds={length=0}, steps={length=0}, props={length=0}, critters={length=0}, ashes={length=0}, water=nil, chaos=0, vengeT=0, won=false, winT=0, abil=nil, owned=__Set(__map(__filter(M.ABILITIES, function(a) 
return a.start;
end), function(a) 
return a.id;
end)), lvl={}, slots={[0]="swipe", "stomp", "breath", "roar", nil, length=5}, look=__assign({head=0, horns=0, neck=0, back=0, tail=0, limbs=0, legs=0, marker=0, fur=nil}, look), ng=0, score=0, points=0, spent=0, mult=1, laps=0, lapsMap=0, legDist=0, kills=0, summoned=0, maps=0, wipes={raid=0, dungeon=0, rider=0, final=0}, escaped=0, patrolDist=0, lastMark="A", onPatrol=false, offLane=0, shortcutT=0, banner=nil, thought=nil, thoughtT=4, clear=nil, store=false, dir={next=8, n=0, lastRaid=(-999), raids=0, final=false}, blame={raid=0, dungeon=0, rider=0}, events={length=0}, shake=0, over=false, nextId=1};
M.applyLevels(g);
M.loadLevel(g, 1);
do return g end;
end;
-- world:262
M.placeBoss = function(g) 
local m = g.map;
local p = ((m.mode == "patrol") and M.pathAt(m, __mmin(26, ((m.len or __NaN) * 0.15))) or m.start);
__assignKV(g.boss, "x", p.x, "y", p.y, "face", (__T(p.face) and p.face or 0));
end;
-- world:271
M.loadLevel = function(g, n) 
local L = __I2.levelFor(n);
local fixedRng = RT.host.layoutRng(n);
local runRng = g.rng;
if __T(fixedRng) then
g.rng = fixedRng;
end;
do
local __t11, __t12 = __it(M.ARRAYS), 0;
while __t12 < __t11.length do
local k = __t11[__t12]; __t12 = __t12 + 1;
g[k] = {length=0};
end;
end;
g.water = nil;
g.pgrid = nil;
g.chaos = 0;
g.vengeT = 0;
local m = ((L.mode == "patrol") and M.makeMap(n, g.rng) or __assign({w=M.W, h=M.H, scroll="none"}, L.build(g, g.rng, __I0)));
__assignKV(m, "n", n, "level", L, "mode", L.mode, "name", L.name, "theme", {id=L.id, name=L.name});
if not __T(m.w) then m.w = M.W end;
if not __T(m.h) then m.h = M.H end;
if not __T(m.scroll) then m.scroll = "none" end;
m.arena = {x0=5, y0=16, x1=((m.w or __NaN) - 5), y1=((m.h or __NaN) - 20)};
local total = 0;
do
local __t14, __t15 = __it(g.props), 0;
while __t15 < __t14.length do
local p = __t14[__t15]; __t15 = __t15 + 1;
total = (total + (__I0.KINDS[p.kind].value.chaos or __NaN));
end;
end;
do
local __t17, __t18 = __it(g.critters), 0;
while __t18 < __t17.length do
local c = __t17[__t18]; __t18 = __t18 + 1;
total = (total + (__I0.CRITTERS[c.kind].value.chaos or __NaN));
end;
end;
m.chaosNeed = __mmax(1, (total * 0.55));
if __T(fixedRng) then
m.layout = RT.host.layoutSeed(n);
end;
g.map = m;
g.levelT0 = g.t;
M.placeBoss(g);
M.updateCam(g, 0, true);
M.syncView(g);
if __T(fixedRng) then
g.rng = runRng;
end;
end;
-- world:296
M.updateCam = function(g, dt, snap) 
if (__T(g.walkoff) and (not __T(snap))) then
do return end;
end;
local m = g.map;
local b = g.boss;
local tx;
if ((m.scroll == "x") or (m.scroll == "xy")) then tx = M.clamp(((b.x or __NaN) - (M.W / 2)), 0, ((m.w or __NaN) - M.W)); else tx = 0; end;
local ty;
if ((m.scroll == "y") or (m.scroll == "xy")) then ty = M.clamp((((b.y or __NaN) - (M.H / 2)) - 8), 0, ((m.h or __NaN) - M.H)); else ty = 0; end;
local k = (__T(snap) and 1 or (1 - __mexp(((-6) * dt))));
g.cam.x = ((g.cam.x or __NaN) + ((tx - (g.cam.x or __NaN)) * k));
g.cam.y = ((g.cam.y or __NaN) + ((ty - (g.cam.y or __NaN)) * k));
end;
-- world:306
M.nextMap = function(g) 
local n = ((g.map.n or __NaN) + 1);
local b = g.boss;
__assignKV(b, "act", nil, "queue", nil, "evade", nil, "taunt", nil, "haste", 0, "flash", 0, "hp", b.maxhp, "calmT", 99);
for __t21 in __pairs(b.cd) do
local k = __t21;
b.cd[k] = 0;
end;
__assignKV(g, "lastMark", "A", "legDist", 0, "lapsMap", 0, "clear", nil, "store", false, "offLane", 0, "mult", 1, "walkoff", nil);
M.loadLevel(g, n);
g.dir = {next=((g.t or __NaN) + 8), n=0, lastRaid=g.t, raids=0, final=false};
M.banner(g, ("LEVEL " .. __str(n) .. ": " .. __str(g.map.level.name)), (__T(g.map.level.sub) and g.map.level.sub or ""), 4);
__push(g.events, "newmap");
end;
-- world:319
M.jumpToLevel = function(g, n) 
g.map.n = (n - 1);
g.store = true;
M.nextMap(g);
end;
-- world:324
M.step = function(g, inp, dt) 
if __T(g.store) then
do return end;
end;
M.syncView(g);
g.t = ((g.t or __NaN) + dt);
g.shake = __mmax(0, ((g.shake or __NaN) - dt));
M.updateBoss(g, inp, dt);
M.updateCam(g, dt);
M.syncView(g);
M.director(g, dt);
__I0.updateProps(g, dt);
if g.map.level.update then g.map.level.update(g, dt, M.LAPI); end;
do
local __t22, __t23 = __it(g.parties), 0;
while __t23 < __t22.length do
local p = __t22[__t23]; __t23 = __t23 + 1;
M.updateParty(g, p, dt);
end;
end;
do
local __t25, __t26 = __it(g.units), 0;
while __t26 < __t25.length do
local u = __t25[__t26]; __t26 = __t26 + 1;
if (not __T(u.dead)) then
M.updateUnit(g, u, dt);
end;
end;
end;
do
local __t28, __t29 = __it(g.adds), 0;
while __t29 < __t28.length do
local a = __t28[__t29]; __t29 = __t29 + 1;
if (not __T(a.dead)) then
M.updateAdd(g, a, dt);
end;
end;
end;
M.separate(g);
M.updateBolts(g, dt);
M.updateFx(g, dt);
__I1.updateSmoke(g, dt);
g.units = __filter(g.units, function(u) 
return ((not __T(u.dead)) and (not __T(u.gone)));
end);
g.adds = __filter(g.adds, function(a) 
return (not __T(a.dead));
end);
g.parties = __filter(g.parties, function(p) 
return (not __T(p.done));
end);
for __t32 in __pairs(g.blame) do
local k = __t32;
g.blame[k] = ((g.blame[k] or __NaN) * __mexp(((-dt) / 8)));
end;
if __T(g.boss.dead) then
g.boss.deadT = ((g.boss.deadT or __NaN) + dt);
if (((g.boss.deadT or __NaN) > 4) and (not __T(g.over))) then
g.over = true;
__push(g.events, "over");
end;
end;
if (__T(g.won) and (not __T(g.boss.dead))) then
g.winT = ((g.winT or __NaN) + dt);
if (((g.winT or __NaN) > 6) and (not __T(g.wonSent))) then
g.wonSent = true;
__push(g.events, "won");
end;
end;
if (__T(g.clear) and (not __T(g.boss.dead))) then
g.clear.t = ((g.clear.t or __NaN) + dt);
if __T(g.walkoff) then
if (__T(g.walkoff.off) and ((function() g.walkoff.offT = ((__T(g.walkoff.offT) and g.walkoff.offT or 0) + dt); return g.walkoff.offT end)() > 1)) then
g.store = true;
g.maps = (g.maps or __NaN) + 1;
__push(g.events, "store");
end;
elseif ((((g.clear.t or __NaN) > 4.5) and (not __some(g.units, function(u) 
return (((((not __T(u.gone)) and ((u.x or __NaN) > ((M.V.x or __NaN) - 8))) and ((u.x or __NaN) < (((M.V.x or __NaN) + M.W) + 8))) and ((u.y or __NaN) > ((M.V.y or __NaN) - 8))) and ((u.y or __NaN) < (((M.V.y or __NaN) + M.H) + 8)));
end))) or ((g.clear.t or __NaN) > 9)) then
g.store = true;
g.maps = (g.maps or __NaN) + 1;
__push(g.events, "store");
end;
end;
end;
-- world:359
M.addScore = function(g, n) 
g.score = ((g.score or __NaN) + n);
g.points = ((g.points or __NaN) + n);
end;
-- world:362
M.vengeance = function(g, v) 
if (g.map.mode == "patrol") then
do return end;
end;
g.mult = __mmin(M.MULT_MAX, ((g.mult or __NaN) + v));
g.vengeT = 0;
end;
-- world:367
M.addChaos = function(g, c) 
if (g.map.mode ~= "chaos") then
do return end;
end;
local before = g.chaos;
g.chaos = __mmin(1.25, ((g.chaos or __NaN) + (c / (g.map.chaosNeed or __NaN))));
if ((before < 0.5) and ((g.chaos or __NaN) >= 0.5)) then
M.text(g, g.boss.x, ((g.boss.y or __NaN) - 26), "CHAOS 50%", "gold", 1.6);
end;
if ((before < 1) and ((g.chaos or __NaN) >= 1)) then
M.text(g, g.boss.x, ((g.boss.y or __NaN) - 26), "CHAOS 100%", "gold", 1.6);
end;
end;
-- world:374
M.sound = function(g, e) 
local last = (function() if not __T(g.sndT) then g.sndT = {} end; return g.sndT end)()[e];
if ((last ~= nil) and (((g.t or __NaN) - last) < 0.06)) then
do return end;
end;
g.sndT[e] = g.t;
__push(g.events, e);
end;
-- world:407
M.updateBoss = function(g, inp, dt) 
local b = g.boss;
local m = g.map;
if __T(b.dead) then
do return end;
end;
if __T(g.walkoff) then
M.walkOffStep(g, dt);
do return end;
end;
for __t34 in __pairs(b.cd) do
local k = __t34;
b.cd[k] = __mmax(0, ((b.cd[k] or __NaN) - dt));
end;
b.flash = __mmax(0, ((b.flash or __NaN) - dt));
b.haste = __mmax(0, ((b.haste or __NaN) - dt));
b.calmT = ((b.calmT or __NaN) + dt);
if __T(b.evade) then
local dx = ((b.evade.x or __NaN) - (b.x or __NaN));
local dy = ((b.evade.y or __NaN) - (b.y or __NaN));
local d = __hypot(dx, dy);
local s = __mmin(d, (62 * dt));
if (d > 0.01) then
b.x = ((b.x or __NaN) + ((dx / d) * s));
b.y = ((b.y or __NaN) + ((dy / d) * s));
b.face = M.turnToward(b.face, __matan2(dy, dx), (8 * dt));
b.walk = ((b.walk or __NaN) + (s * 0.3));
end;
b.hp = __mmin((b.maxhp or __NaN), ((b.hp or __NaN) + ((((b.maxhp or __NaN) - (b.hp or __NaN)) * 0.5) * dt)));
b.moving = true;
if (d < 1) then
b.evade = nil;
end;
do return end;
end;
local tx = inp.mx;
local ty = inp.my;
if __T(b.taunt) then
local u = b.taunt.u;
b.taunt.t = ((b.taunt.t or __NaN) - dt);
if (__T(u.dead) or ((b.taunt.t or __NaN) <= 0)) then
b.taunt = nil;
else
tx = u.x;
ty = u.y;
end;
end;
local channel = (__T((b.act and b.act.fired)) and ((b.act.kind == "breath") or (b.act.kind == "beam")));
local locked = (((b.act and b.act.kind) == "charge") and b.act.fired);
local turn = (__T(channel) and ((b.act.kind == "beam") and 1.2 or 1.5) or (__T(b.taunt) and 7 or 5.5));
if ((not __T(locked)) and (__hypot((tx - (b.x or __NaN)), (ty - (b.y or __NaN))) > 2)) then
b.face = M.turnToward(b.face, __matan2((ty - (b.y or __NaN)), (tx - (b.x or __NaN))), (turn * dt));
end;
for i = 0, 5 - 1 do
local k = g.slots[i];
if ((__T(k) and __T((inp.press and inp.press[("slot" .. __str(i))]))) and (not M.tryCast(g, k))) then
b.queue = {k=k, t=0.5};
end;
end;
if (__T((inp.press and inp.press.shake)) and (not M.tryCast(g, "shake"))) then
b.queue = {k="shake", t=0.5};
end;
if __T(b.queue) then
b.queue.t = ((b.queue.t or __NaN) - dt);
if (((b.queue.t or __NaN) <= 0) or M.tryCast(g, b.queue.k)) then
b.queue = nil;
end;
end;
if (((__T((inp.hold and inp.hold.slot0)) and __T(g.slots[0])) and (not __T(b.act))) and (not __T(b.queue))) then
M.tryCast(g, g.slots[0]);
end;
local mx = (__T(inp.ax) and inp.ax or 0);
local my = (__T(inp.ay) and inp.ay or 0);
local ml = __hypot(mx, my);
if (ml > 1) then
mx = (mx / ml);
my = (my / ml);
end;
local sp = ((M.BOSS_SPEED * (((b.haste or __NaN) > 0) and (1 + (g.abil.haste.boost or __NaN)) or 1)) * (function() if __T(b.act) then return g.abil[b.act.kind].move; else return 1; end; end)());
local ox = b.x;
local oy = b.y;
M.moveBoss(g, ((b.x or __NaN) + ((mx * sp) * dt)), ((b.y or __NaN) + ((my * sp) * dt)));
if (((g.props.length or #g.props) ~= 0) or ((g.critters.length or #g.critters) ~= 0)) then
__I0.bossTouch(g, ox, oy, dt);
end;
if ((((b.haste or __NaN) > 0) and (__T(mx) or __T(my))) and (g.rng() < 0.5)) then
M.part(g, ((b.x or __NaN) - (mx * 10)), (((b.y or __NaN) - (my * 10)) + 3), ((-mx) * 20), ((-my) * 20), 0.3, "dust");
end;
if __T(b.act) then
M.advanceAct(g, dt);
end;
local moved = __hypot(((b.x or __NaN) - ox), ((b.y or __NaN) - oy));
b.moving = (moved > 0.01);
if __T(b.moving) then
local before = __mfloor(((b.walk or __NaN) / 4));
b.walk = ((b.walk or __NaN) + (moved * 0.3));
end;
if (m.mode ~= "patrol") then
g.onPatrol = false;
g.vengeT = ((g.vengeT or __NaN) + dt);
if ((g.vengeT or __NaN) > 4) then
g.mult = __mmax(1, ((g.mult or __NaN) - (0.1 * dt)));
end;
else
local sd = M.pathDist(m, b.x, b.y);
g.onPatrol = (sd < M.LANE);
if __T(g.onPatrol) then
M.addScore(g, (moved * (g.mult or __NaN)));
g.patrolDist = ((g.patrolDist or __NaN) + moved);
g.legDist = ((g.legDist or __NaN) + moved);
g.offLane = 0;
else
g.offLane = ((g.offLane or __NaN) + dt);
if ((g.offLane or __NaN) > 3) then
g.mult = __mmax(1, ((g.mult or __NaN) - (0.12 * dt)));
end;
end;
g.shortcutT = __mmax(0, ((g.shortcutT or __NaN) - dt));
local R = M.destRock(g);
if (__hypot(((b.x or __NaN) - (R.x or __NaN)), ((b.y or __NaN) - (R.y or __NaN))) < M.TOUCH) then
if ((g.legDist or __NaN) >= ((m.len or __NaN) * 0.6)) then
g.laps = (g.laps or __NaN) + 1;
g.lapsMap = (g.lapsMap or __NaN) + 1;
local pts = __mfloor((100 * (g.mult or __NaN)) + 0.5);
M.addScore(g, pts);
g.mult = __mmin(M.MULT_MAX, ((g.mult or __NaN) + M.MULT_STEP));
M.text(g, R.x, ((R.y or __NaN) - 14), ("+" .. __str(pts)), "gold");
M.text(g, R.x, ((R.y or __NaN) - 20), ("AIMLESS X" .. __toFixed(g.mult, 2)), "cream", 1.6);
__push(g.events, "lap");
g.lastMark = ((R == m.A) and "A" or "B");
g.legDist = 0;
elseif ((g.shortcutT or __NaN) <= 0) then
M.text(g, R.x, ((R.y or __NaN) - 14), "SHORTCUT. DOES NOT COUNT", "pink", 1.6);
g.shortcutT = 3;
end;
end;
if ((sd > M.LEASH) and (not __T(locked))) then
M.startEvade(g);
end;
end;
local fighting = __some(g.parties, function(p) 
return p.engaged;
end);
if ((not fighting) and ((b.calmT or __NaN) > 4)) then
b.hp = __mmin((b.maxhp or __NaN), ((b.hp or __NaN) + (((b.maxhp or __NaN) * 0.035) * dt)));
end;
g.thoughtT = ((g.thoughtT or __NaN) - dt);
if __T(g.thought) then
g.thought.t = ((g.thought.t or __NaN) + dt);
if ((g.thought.t or __NaN) > 2.4) then
g.thought = nil;
end;
end;
if ((g.thoughtT or __NaN) <= 0) then
g.thoughtT = (7 + (g.rng() * 7));
if (not fighting) then
g.thought = {s=M.pick(g, (function() if (m.mode == "patrol") then return M.BARK.thoughts; else return M.BARK.wreckThoughts; end; end)()), t=0};
end;
end;
end;
-- world:519
M.moveBoss = function(g, x, y) 
local b = g.boss;
local m = g.map;
x = M.clamp(x, ((M.AR.x0 or __NaN) + (b.r or __NaN)), ((M.AR.x1 or __NaN) - (b.r or __NaN)));
y = M.clamp(y, ((M.AR.y0 or __NaN) + (b.r or __NaN)), ((M.AR.y1 or __NaN) - (b.r or __NaN)));
if (__T(g.water) and __T(__I0.hitsWater(g, x, y, b.r))) then
if (not __T(__I0.hitsWater(g, x, b.y, b.r))) then
y = b.y;
elseif (not __T(__I0.hitsWater(g, b.x, y, b.r))) then
x = b.x;
else
x = b.x;
y = b.y;
end;
end;
b.x = x;
b.y = y;
if __T(m.A) then
do
local __t36, __t37 = __it({[0]=m.A, m.B, length=2}), 0;
while __t37 < __t36.length do
local R = __t36[__t37]; __t37 = __t37 + 1;
local dx = ((b.x or __NaN) - (R.x or __NaN));
local dy = ((b.y or __NaN) - (R.y or __NaN));
local d = __hypot(dx, dy);
local min = ((b.r or __NaN) + M.ROCK_R);
if ((d < min) and (d > 0.001)) then
b.x = ((R.x or __NaN) + ((dx / d) * min));
b.y = ((R.y or __NaN) + ((dy / d) * min));
end;
end;
end;
end;
end;
-- world:536
M.startEvade = function(g) 
local b = g.boss;
local p = M.pathNearest(g.map, b.x, b.y);
b.evade = {x=p.x, y=p.y};
b.act = nil;
b.taunt = nil;
b.queue = nil;
local lost = ((g.mult or __NaN) > 1);
g.mult = 1;
M.text(g, b.x, ((b.y or __NaN) - 18), "EVADE", "white", 1.6);
if lost then
M.text(g, b.x, ((b.y or __NaN) - 24), "AIMLESSNESS RESET", "pink", 1.8);
end;
__push(g.events, "evade");
do
local __t39, __t40 = __it(g.parties), 0;
while __t40 < __t39.length do
local p = __t39[__t40]; __t40 = __t40 + 1;
if (__T(p.engaged) and (p.type ~= "rider")) then
local u = M.alive(p)[0];
if __T(u) then
M.bark(g, u, M.pick(g, M.BARK.evade));
end;
end;
end;
end;
end;
-- world:552
M.walkOff = function(g, o) if o == nil then o = {} end;
local b = g.boss;
if (((__T(g.walkoff) or __T(g.clear)) or __T(g.won)) or __T(b.dead)) then
do return end;
end;
g.walkoff = {x=(o.x == nil and b.x or o.x), t=0, off=false};
__assignKV(b, "act", nil, "queue", nil, "evade", nil, "taunt", nil, "haste", 0);
M.levelCleared(g, o.title, o.sub);
end;
-- world:559
M.walkOffStep = function(g, dt) 
local b = g.boss;
local w = g.walkoff;
w.t = ((w.t or __NaN) + dt);
b.flash = 0;
local sp = (M.BOSS_SPEED * 1.1);
local vx = M.clamp((((w.x or __NaN) - (b.x or __NaN)) * 3), ((-sp) * 0.8), (sp * 0.8));
local vy = (-__msqrt(((sp * sp) - (vx * vx))));
local ox = b.x;
local oy = b.y;
b.x = ((b.x or __NaN) + (vx * dt));
b.y = ((b.y or __NaN) + (vy * dt));
b.face = M.turnToward(b.face, __matan2(vy, vx), (6 * dt));
local moved = __hypot(((b.x or __NaN) - ox), ((b.y or __NaN) - oy));
b.moving = (moved > 0.01);
local before = __mfloor(((b.walk or __NaN) / 4));
b.walk = ((b.walk or __NaN) + (moved * 0.3));
if ((not __T(w.off)) and ((b.y or __NaN) < ((M.V.y or __NaN) - 26))) then
w.off = true;
__push(g.events, "walkoff");
end;
end;
-- world:576
M.tryCast = function(g, k) 
local b = g.boss;
if ((((__T(b.act) or __T(b.evade)) or __T(b.dead)) or ((b.cd[k] or __NaN) > 0)) or __T(g.clear)) then
do return false end;
end;
if ((k ~= "shake") and (not __has(g.owned, k))) then
do return false end;
end;
local d = g.abil[k];
b.act = {kind=k, t=0, fired=false, tick=0, fireT=0};
b.cd[k] = d.cd;
__push(g.events, ("wind_" .. __str(k)));
do
local __t42, __t43 = __it(g.units), 0;
while __t43 < __t42.length do
local u = __t42[__t43]; __t43 = __t43 + 1;
local sk = u.party.skill;
u.willDodge = (g.rng() < (sk.dodge or __NaN));
u.react = ((g.t or __NaN) + ((sk.react or __NaN) * (0.7 + (g.rng() * 0.7))));
end;
end;
do
local __t45, __t46 = __it(g.parties), 0;
while __t46 < __t45.length do
repeat
local p = __t45[__t46]; __t46 = __t46 + 1;
if (((p.type ~= "raid") or (not __T(p.engaged))) or (g.rng() > 0.7)) then
do break end;
end;
local u = M.alive(p)[__mfloor((g.rng() * 3))];
if (not __T(u)) then
do break end;
end;
if (k == "stomp") then
M.bark(g, u, M.pick(g, M.BARK.stomp));
end;
if (k == "breath") then
M.bark(g, u, M.pick(g, M.BARK.frontal));
end;
if (k == "beam") then
M.bark(g, u, M.pick(g, M.BARK.beam));
end;
if (k == "tail") then
M.bark(g, u, "TAIL!");
end;
if (k == "charge") then
M.bark(g, u, "CHARGE! MOVE!");
end;
if (k == "summon") then
M.bark(g, u, M.pick(g, M.BARK.adds));
end;
until true;
end;
end;
if (d.wind == 0) then
M.advanceAct(g, 0);
end;
do return true end;
end;
-- world:605
M.advanceAct = function(g, dt) 
local b = g.boss;
local a = b.act;
local d = g.abil[a.kind];
a.t = ((a.t or __NaN) + dt);
if ((not __T(a.fired)) and ((a.t or __NaN) >= (d.wind or __NaN))) then
a.fired = true;
M.fire(g, a.kind);
end;
if (not __T(b.act)) then
do return end;
end;
if ((a.kind == "charge") and __T(a.fired)) then
M.chargeStep(g, a, d, dt);
do return end;
end;
if (((a.kind == "breath") or (a.kind == "beam")) and __T(a.fired)) then
a.tick = ((a.tick or __NaN) - dt);
if ((a.tick or __NaN) <= 0) then
a.tick = ((a.tick or __NaN) + 0.1);
do
local __t48, __t49 = __it(g.units), 0;
while __t49 < __t48.length do
local u = __t48[__t49]; __t49 = __t49 + 1;
if (M.hittable(u) and M.inZone(g, a.kind, u.x, u.y, 1)) then
M.hurt(g, u, ((d.dps or __NaN) * 0.1));
end;
end;
end;
if (((g.props.length or #g.props) ~= 0) or ((g.critters.length or #g.critters) ~= 0)) then
local test = function(x, y) 
return M.inZone(g, a.kind, x, y, 2);
end;
local reach = ((a.kind == "beam") and ((M.beamEnd(g).len or __NaN) + 8) or ((d.range or __NaN) + 6));
__I0.igniteZone(g, test, b.x, b.y, reach, ((a.kind == "beam") and 0.7 or 0.35));
do
local __t51, __t52 = __it(g.critters), 0;
while __t52 < __t51.length do
local c = __t51[__t52]; __t52 = __t52 + 1;
if ((not __T(c.dead)) and test(c.x, c.y)) then
__I0.hurtCritter(g, c, ((d.dps or __NaN) * 0.1));
end;
end;
end;
if (a.kind == "beam") then
__I0.damageZone(g, test, ((d.dps or __NaN) * 0.1), b.x, b.y, reach);
end;
end;
end;
end;
if ((a.kind == "breath") and __T(a.fired)) then
a.fireT = ((a.fireT or __NaN) - dt);
if (((a.fireT or __NaN) <= 0) and ((g.fires.length or #g.fires) < 40)) then
a.fireT = ((a.fireT or __NaN) + 0.11);
local ang = ((b.face or __NaN) + ((g.rng() - 0.5) * (d.arc or __NaN)));
local dist = (16 + (g.rng() * ((d.range or __NaN) - 18)));
local x = ((b.x or __NaN) + (__mcos(ang) * dist));
local y = ((b.y or __NaN) + (__msin(ang) * dist));
if (((((x > (M.AR.x0 or __NaN)) and (x < (M.AR.x1 or __NaN))) and (y > ((M.AR.y0 or __NaN) - 6))) and (y < ((M.AR.y1 or __NaN) + 6))) and (not __T(__I0.isWater(g, x, y)))) then
local f = {x=x, y=y, r=(3.5 + (g.rng() * 2.5)), t=0, life=(7 + (g.rng() * 2))};
__push(g.fires, f);
if ((g.props.length or #g.props) ~= 0) then
__I0.igniteZone(g, function(px, py) 
return (__hypot((px - x), (py - y)) < ((f.r or __NaN) + 3));
end, x, y, ((f.r or __NaN) + 6));
end;
end;
end;
for i = 0, 3 - 1 do
local ang = ((b.face or __NaN) + ((g.rng() - 0.5) * (d.arc or __NaN)));
local sp = (60 + (g.rng() * 60));
M.part(g, ((b.x or __NaN) + (__mcos((b.face or __NaN)) * 14)), ((b.y or __NaN) + (__msin((b.face or __NaN)) * 14)), (__mcos(ang) * sp), (__msin(ang) * sp), (0.25 + (g.rng() * 0.45)), ((g.rng() < 0.5) and "flame" or "ember"));
end;
end;
if (a.kind == "beam") then
g.shake = __mmax((g.shake or __NaN), (__T(a.fired) and 0.12 or 0.03));
if ((not __T(a.fired)) and (g.rng() < 0.6)) then
local k = (g.rng() * M.TAU);
M.part(g, ((b.x or __NaN) + (__mcos(k) * 11)), ((b.y or __NaN) + (__msin(k) * 11)), ((-__mcos(k)) * 15), ((-__msin(k)) * 15), 0.3, "spark");
end;
if __T(a.fired) then
local e = M.beamEnd(g);
for i = 0, 2 - 1 do
M.part(g, e.x, e.y, ((g.rng() - 0.5) * 80), ((g.rng() - 0.5) * 80), 0.3, "spark");
end;
end;
end;
if ((a.t or __NaN) >= ((d.wind or __NaN) + (d.dur or __NaN))) then
b.act = nil;
end;
end;
-- world:651
M.beamEnd = function(g) 
local b = g.boss;
local d = g.abil.beam;
local c = __mcos((b.face or __NaN));
local s = __msin((b.face or __NaN));
local len = d.range;
if (c > 0.001) then
len = __mmin(len, (((((M.V.x or __NaN) + M.W) + 4) - (b.x or __NaN)) / c));
elseif (c < (-0.001)) then
len = __mmin(len, ((((M.V.x or __NaN) - 4) - (b.x or __NaN)) / c));
end;
if (s > 0.001) then
len = __mmin(len, (((((M.V.y or __NaN) + M.H) + 4) - (b.y or __NaN)) / s));
elseif (s < (-0.001)) then
len = __mmin(len, ((((M.V.y or __NaN) - 4) - (b.y or __NaN)) / s));
end;
do return {x=((b.x or __NaN) + (c * len)), y=((b.y or __NaN) + (s * len)), len=len} end;
end;
-- world:659
M.fire = function(g, k) 
local b = g.boss;
local d = g.abil[k];
__push(g.events, k);
if (((k == "swipe") or (k == "stomp")) or (k == "tail")) then
do
local __t56, __t57 = __it(g.units), 0;
while __t57 < __t56.length do
repeat
local u = __t56[__t57]; __t57 = __t57 + 1;
if ((not M.hittable(u)) or (not M.inZone(g, k, u.x, u.y, 1))) then
do break end;
end;
M.hurt(g, u, d.dmg);
M.knock(u, b, d.kb);
until true;
end;
end;
if (((g.props.length or #g.props) ~= 0) or ((g.critters.length or #g.critters) ~= 0)) then
__I0.damageZone(g, function(x, y) 
return M.inZone(g, k, x, y, 2);
end, d.dmg, b.x, b.y, ((d.range or __NaN) + 8));
end;
if (k == "stomp") then
g.shake = 0.35;
__push(g.rings, {x=b.x, y=b.y, r=4, max=d.range, t=0, col="dust"});
for i = 0, 28 - 1 do
local a = (g.rng() * M.TAU);
local s = (30 + (g.rng() * 50));
M.part(g, ((b.x or __NaN) + (__mcos(a) * 10)), ((b.y or __NaN) + (__msin(a) * 10)), (__mcos(a) * s), (__msin(a) * s), 0.5, "dust");
end;
else
g.shake = __mmax((g.shake or __NaN), 0.08);
__push(g.rings, {x=b.x, y=b.y, face=M.zoneFace(g, k), t=0, col="slash", big=(k == "tail")});
end;
elseif (k == "breath") then
do
local __t60, __t61 = __it(g.units), 0;
while __t61 < __t60.length do
local u = __t60[__t61]; __t61 = __t61 + 1;
if (M.hittable(u) and M.inZone(g, "breath", u.x, u.y, 1)) then
M.hurt(g, u, d.dmg);
end;
end;
end;
elseif (k == "roar") then
g.shake = 0.25;
__push(g.rings, {x=b.x, y=b.y, r=6, max=d.range, t=0, col="roar"});
do
local __t63, __t64 = __it(g.units), 0;
while __t64 < __t63.length do
repeat
local u = __t63[__t64]; __t64 = __t64 + 1;
if ((u.role == "rider") and (u.state == "climb")) then
do break end;
end;
if (__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) > (d.range or __NaN)) then
do break end;
end;
u.fear = ((d.fear or __NaN) * (0.8 + (g.rng() * 0.4)));
u.cast = 0;
if ((u.role == "rider") and __T(u.mounted)) then
u.state = "orbit";
u.orbitT = (1 + (d.fear or __NaN));
u.orbitA = __matan2(((u.y or __NaN) - (b.y or __NaN)), ((u.x or __NaN) - (b.x or __NaN)));
if not __T(u.orbitDir) then u.orbitDir = 1 end;
end;
until true;
end;
end;
do
local __t66, __t67 = __it(g.parties), 0;
while __t67 < __t66.length do
local p = __t66[__t67]; __t67 = __t67 + 1;
if ((p.type == "raid") and __T(p.engaged)) then
local u = M.alive(p)[1];
if __T(u) then
M.bark(g, u, M.pick(g, M.BARK.roar));
end;
end;
end;
end;
do
local __t69, __t70 = __it(g.critters), 0;
while __t70 < __t69.length do
local c = __t69[__t70]; __t70 = __t70 + 1;
if (__hypot(((c.x or __NaN) - (b.x or __NaN)), ((c.y or __NaN) - (b.y or __NaN))) < (d.range or __NaN)) then
c.scared = 5;
end;
end;
end;
elseif (k == "shake") then
for i = 0, 14 - 1 do
local a = (g.rng() * M.TAU);
local s = (25 + (g.rng() * 30));
M.part(g, ((b.x or __NaN) + (__mcos(a) * 9)), ((b.y or __NaN) + (__msin(a) * 9)), (__mcos(a) * s), (__msin(a) * s), 0.4, "fur");
end;
do
local __t73, __t74 = __it(g.units), 0;
while __t74 < __t73.length do
repeat
local u = __t73[__t74]; __t74 = __t74 + 1;
if ((u.role == "rider") and (u.state == "climb")) then
M.shakeRider(g, u);
do break end;
end;
if (M.hittable(u) and (__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) < (((b.r or __NaN) + (d.range or __NaN)) - 8))) then
M.knock(u, b, d.kb);
end;
until true;
end;
end;
elseif (k == "charge") then
b.act.start = {x=b.x, y=b.y};
b.act.out = 0;
b.act.back = false;
b.act.hitIds = __Set();
g.shake = __mmax((g.shake or __NaN), 0.12);
elseif (k == "summon") then
M.summon(g);
elseif (k == "ice") then
__push(g.ice, {x=b.x, y=b.y, r=d.range, t=0, life=d.life, seed=__mfloor((g.rng() * 1000000))});
if ((g.ice.length or #g.ice) > 3) then
__shift(g.ice);
end;
__push(g.rings, {x=b.x, y=b.y, r=6, max=d.range, t=0, col="ice"});
for i = 0, 30 - 1 do
local a = (g.rng() * M.TAU);
local s = (20 + (g.rng() * 60));
M.part(g, ((b.x or __NaN) + (__mcos(a) * 8)), ((b.y or __NaN) + (__msin(a) * 8)), (__mcos(a) * s), (__msin(a) * s), 0.6, "frost");
end;
do
local __t77, __t78 = __it(g.parties), 0;
while __t78 < __t77.length do
local p = __t77[__t78]; __t78 = __t78 + 1;
if ((__T(p.engaged) and (p.type ~= "rider")) and (g.rng() < 0.6)) then
local u = M.alive(p)[2];
if __T(u) then
M.bark(g, u, M.pick(g, M.BARK.ice));
end;
end;
end;
end;
elseif (k == "haste") then
b.haste = d.time;
M.text(g, b.x, ((b.y or __NaN) - 20), "ZOOMIES", "gold", 1.2);
elseif (k == "beam") then
g.shake = 0.3;
end;
end;
-- world:717
M.chargeStep = function(g, a, d, dt) 
local b = g.boss;
if (not __T(a.back)) then
local ox = b.x;
local oy = b.y;
M.moveBoss(g, ((b.x or __NaN) + ((__mcos((b.face or __NaN)) * (d.speed or __NaN)) * dt)), ((b.y or __NaN) + ((__msin((b.face or __NaN)) * (d.speed or __NaN)) * dt)));
if (((g.props.length or #g.props) ~= 0) or ((g.critters.length or #g.critters) ~= 0)) then
do
local __t80, __t81 = __it(__I0.near(g, b.x, b.y, ((b.r or __NaN) + 16))), 0;
while __t81 < __t80.length do
repeat
local p = __t80[__t81]; __t81 = __t81 + 1;
if (((p.state ~= "up") or __has(a.hitIds, ("p" .. __str(p.id)))) or (not __I0.touches(p, b.x, b.y, ((b.r or __NaN) + 3)))) then
do break end;
end;
__add(a.hitIds, ("p" .. __str(p.id)));
__I0.hitProp(g, p, ((d.dmg or __NaN) * 2), b.face);
until true;
end;
end;
__I0.bossTouch(g, ox, oy, dt);
end;
local moved = __hypot(((b.x or __NaN) - ox), ((b.y or __NaN) - oy));
a.out = ((a.out or __NaN) + moved);
if (((a.out or __NaN) >= (d.range or __NaN)) or (moved < (((d.speed or __NaN) * dt) * 0.3))) then
a.back = true;
a.pause = 0.15;
end;
if (g.rng() < 0.7) then
M.part(g, ((b.x or __NaN) - (__mcos((b.face or __NaN)) * 10)), ((b.y or __NaN) - (__msin((b.face or __NaN)) * 10)), ((g.rng() - 0.5) * 30), ((g.rng() - 0.5) * 30), 0.4, "dust");
end;
do
local __t83, __t84 = __it(g.units), 0;
while __t84 < __t83.length do
repeat
local u = __t83[__t84]; __t84 = __t84 + 1;
if (((not M.hittable(u)) or __has(a.hitIds, u.id)) or (__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) > ((b.r or __NaN) + 5))) then
do break end;
end;
__add(a.hitIds, u.id);
M.hurt(g, u, d.dmg);
if __T(u.dead) then
do break end;
end;
M.stun(g, u, d.stun);
local side = (((((-((u.x or __NaN) - (b.x or __NaN))) * __msin((b.face or __NaN))) + (((u.y or __NaN) - (b.y or __NaN)) * __mcos((b.face or __NaN)))) >= 0) and 1 or (-1));
u.kx = ((u.kx or __NaN) + ((((-__msin((b.face or __NaN))) * side) * (d.kb or __NaN)) * 5));
u.ky = ((u.ky or __NaN) + (((__mcos((b.face or __NaN)) * side) * (d.kb or __NaN)) * 5));
until true;
end;
end;
do return end;
end;
if ((a.pause or __NaN) > 0) then
a.pause = ((a.pause or __NaN) - dt);
do return end;
end;
local dx = ((a.start.x or __NaN) - (b.x or __NaN));
local dy = ((a.start.y or __NaN) - (b.y or __NaN));
local dist = __hypot(dx, dy);
local s = __mmin(dist, (((d.speed or __NaN) * 0.8) * dt));
local ox = b.x;
local oy = b.y;
if (dist > 0.5) then
M.moveBoss(g, ((b.x or __NaN) + ((dx / dist) * s)), ((b.y or __NaN) + ((dy / dist) * s)));
end;
if (((g.props.length or #g.props) ~= 0) or ((g.critters.length or #g.critters) ~= 0)) then
__I0.bossTouch(g, ox, oy, dt);
end;
if (((dist <= 0.5) or (s < 0.01)) or (__hypot(((b.x or __NaN) - ox), ((b.y or __NaN) - oy)) < (s * 0.3))) then
b.act = nil;
end;
end;
-- world:754
M.stun = function(g, u, t) 
if (u.role == "rider") then
if __T(u.mounted) then
u.mounted = false;
u.horse.tx = M.clamp(((u.x or __NaN) + ((g.rng() - 0.5) * 60)), ((M.AR.x0 or __NaN) + 15), ((M.AR.x1 or __NaN) - 15));
u.horse.ty = M.clamp(((u.y or __NaN) + ((g.rng() - 0.5) * 40)), ((M.AR.y0 or __NaN) + 10), ((M.AR.y1 or __NaN) - 10));
end;
u.state = "stun";
u.stunT = (t + 0.8);
do return end;
end;
u.stun = t;
u.cast = 0;
end;
-- world:766
M.inZone = function(g, k, x, y, pad) if pad == nil then pad = 0 end;
local b = g.boss;
local d = g.abil[k];
local dx = (x - (b.x or __NaN));
local dy = (y - (b.y or __NaN));
local dist = __hypot(dx, dy);
if ((k == "charge") or (k == "beam")) then
local c = __mcos((b.face or __NaN));
local s = __msin((b.face or __NaN));
local lx = ((dx * c) + (dy * s));
local ly = (((-dx) * s) + (dy * c));
local len;
if (k == "beam") then len = M.beamEnd(g).len; else len = d.range; end;
do return (((lx > ((k == "beam") and 6 or (-4))) and (lx < (len + pad))) and (__mabs(ly) < ((d.width or __NaN) + pad))) end;
end;
if (dist > ((d.range or __NaN) + pad)) then
do return false end;
end;
if (((k == "stomp") or (k == "roar")) or (k == "shake")) then
do return true end;
end;
if (dist < 6) then
do return true end;
end;
do return (__mabs(M.angDiff(__matan2(dy, dx), M.zoneFace(g, k))) < (((d.arc or __NaN) / 2) + (pad / dist))) end;
end;
-- world:782
M.telegraph = function(g) 
local a = g.boss.act;
if (not __T(a)) then
do return nil end;
end;
if ((a.kind == "breath") or (a.kind == "beam")) then
do return a.kind end;
end;
if (((((a.kind == "swipe") or (a.kind == "stomp")) or (a.kind == "tail")) or (a.kind == "charge")) and (not __T(a.fired))) then
do return a.kind end;
end;
do return nil end;
end;
-- world:790
M.hurtBoss = function(g, amt, u) 
local b = g.boss;
if ((__T(b.evade) or __T(b.dead)) or __T(g.walkoff)) then
do return end;
end;
b.hp = ((b.hp or __NaN) - (amt * (1 + (M.NG_HIT * (g.ng or __NaN)))));
b.flash = 0.06;
b.calmT = 0;
g.blame[u.party.type] = ((g.blame[u.party.type] or __NaN) + amt);
u.party.hitT = g.t;
if ((b.hp or __NaN) <= 0) then
b.hp = 0;
b.dead = true;
b.act = nil;
b.taunt = nil;
__push(g.events, "bossdie");
g.shake = 0.6;
do
local __t86, __t87 = __it(g.parties), 0;
while __t87 < __t86.length do
local p = __t86[__t87]; __t87 = __t87 + 1;
do
local __t89, __t90 = __it(M.alive(p)), 0;
while __t90 < __t89.length do
local v = __t89[__t90]; __t90 = __t90 + 1;
if (g.rng() < 0.35) then
M.bark(g, v, M.pick(g, M.BARK.dance));
end;
end;
end;
end;
end;
end;
end;
-- world:808
M.edgeSpot = function(g, avoid) 
do
local tries = 0;
while true do
local sides = g.map.edges;
local s;
if __T(sides) then s = sides[__mfloor((g.rng() * (sides.length or #sides)))]; else s = __mfloor((g.rng() * 4)); end;
local along = g.rng();
local sb = (__T(g.map.sideBand) and g.map.sideBand or {[0]=40, 140, length=2});
local sy = (((M.V.y or __NaN) + (sb[0] or __NaN)) + (along * ((sb[1] or __NaN) - (sb[0] or __NaN))));
local e;
if (s == 0) then
e = {x=((M.V.x or __NaN) - 8), y=sy, nx=1, ny=0};
elseif (s == 1) then
e = {x=(((M.V.x or __NaN) + M.W) + 8), y=sy, nx=(-1), ny=0};
elseif (s == 2) then
e = {x=(((M.V.x or __NaN) + 30) + (along * 260)), y=((M.V.y or __NaN) + 6), nx=0, ny=1};
else
e = {x=(((M.V.x or __NaN) + 30) + (along * 260)), y=(((M.V.y or __NaN) + M.H) + 4), nx=0, ny=(-1)};
end;
if (((not __T(avoid)) or (tries > 6)) or (__hypot(((e.x or __NaN) - (g.boss.x or __NaN)), ((e.y or __NaN) - (g.boss.y or __NaN))) > 110)) then
do return e end;
end;
tries = tries + 1;
end;
end;
end;
-- world:824
M.director = function(g) 
local d = g.dir;
local mode = g.map.mode;
if (((__T(g.boss.dead) or __T(d.final)) or __T(g.clear)) or __T(g.won)) then
do return end;
end;
local raidUp = __some(g.parties, function(p) 
return (p.type == "raid");
end);
if (mode == "timed") then
if (((not raidUp) and (((g.t or __NaN) - (g.levelT0 or __NaN)) > 55)) and (((g.t or __NaN) - (d.lastRaid or __NaN)) > 110)) then
M.spawnRaid(g, ((__mfmod((d.raids or __NaN), 3) == 2) and 40 or 25));
d.lastRaid = g.t;
do return end;
end;
else
local prog = ((mode == "patrol") and ((g.lapsMap or __NaN) / M.FINAL_LAPS) or g.chaos);
if (prog >= 1) then
d.final = true;
M.spawnRaid(g, 40, true);
do return end;
end;
if (((prog >= (M.RAID_LAPS / M.FINAL_LAPS)) and (not raidUp)) and (((g.t or __NaN) - (d.lastRaid or __NaN)) > (__T(d.raids) and 80 or 0))) then
M.spawnRaid(g, 25);
d.lastRaid = g.t;
do return end;
end;
end;
if ((g.t or __NaN) < (d.next or __NaN)) then
do return end;
end;
if (((g.units.length or #g.units) > 60) or __T(g.boss.evade)) then
d.next = ((g.t or __NaN) + 4);
do return end;
end;
local riders = __filter(g.parties, function(p) 
return (p.type == "rider");
end).length;
local type = ({[0]="dungeon", "rider", "dungeon", length=3})[d.n];
if (not __T(type)) then
type = (((riders < (((g.map.n or __NaN) > 2) and 2 or 1)) and (g.rng() < 0.3)) and "rider" or "dungeon");
end;
if (type == "rider") then
M.spawnRider(g);
else
M.spawnDungeon(g);
if (((d.n or __NaN) > 6) and (g.rng() < 0.3)) then
M.spawnDungeon(g, true);
end;
end;
d.n = (d.n or __NaN) + 1;
d.next = ((g.t or __NaN) + ((__mmax(14, ((30 - ((d.n or __NaN) * 1.2)) - ((g.map.n or __NaN) * 2))) + (g.rng() * 8)) / (1 + (M.NG_PACE * (g.ng or __NaN)))));
end;
-- world:846
M.newParty = function(g, type) 
local power = ((type == "rider") and 1 or ((1 + (((g.map.n or __NaN) - 1) * 0.28)) + ((type == "raid") and ((g.dir.raids or __NaN) * 0.05) or ((g.dir.n or __NaN) * 0.05))));
local p = {id=(function() local __t93 = g.nextId; g.nextId = __t93 + 1; return __t93 end)(), type=type, power=power, units={length=0}, skill=M.SKILL[type], engaged=false, done=false, fleeing=false, t=0, brez=0, deadList={length=0}, barkT=3};
__push(g.parties, p);
do return p end;
end;
-- world:854
M.mkUnit = function(g, p, cls, x, y) 
local c = M.CLASS[cls];
local u = {id=(function() local __t94 = g.nextId; g.nextId = __t94 + 1; return __t94 end)(), party=p, cls=cls, role=c.role, x=x, y=y, hp=(((c.hp or __NaN) * (p.power or __NaN)) * (1 + (M.NG_HP * (g.ng or __NaN)))), maxhp=(((c.hp or __NaN) * (p.power or __NaN)) * (1 + (M.NG_HP * (g.ng or __NaN)))), spd=c.spd, atk=(g.rng() * (c.rate or __NaN)), cast=0, state="travel", kx=0, ky=0, hit=0, dead=false, gone=false, moving=false, fx=1, walk=(g.rng() * 10), slotA=0, slotD=0, fear=0, stun=0, slow=1, react=math.huge, willDodge=false, inFire=false, fireOk=false, tauntCd=(4 + (g.rng() * 6))};
__push(g.units, u);
__push(p.units, u);
do return u end;
end;
-- world:865
M.spawnDungeon = function(g, quiet) 
local p = M.newParty(g, "dungeon");
local e = M.edgeSpot(g, true);
local base = __matan2(((e.y or __NaN) - (g.boss.y or __NaN)), ((e.x or __NaN) - (g.boss.x or __NaN)));
local comp = {[0]="warrior", ((g.rng() < 0.5) and "priest" or "druid"), ((g.rng() < 0.5) and "rogue" or "berserker"), "mage", "hunter", length=5};
__forEach(comp, function(cls, i) 
local u = M.mkUnit(g, p, cls, (((e.x or __NaN) - (((e.nx or __NaN) * i) * 3)) + ((g.rng() - 0.5) * 8)), (((e.y or __NaN) - (((e.ny or __NaN) * i) * 3)) + ((g.rng() - 0.5) * 8)));
u.slotA = ((u.role == "melee") and ((g.rng() - 0.5) * 1.6) or (base + ((g.rng() - 0.5) * 1.6)));
u.slotD = ((u.role == "healer") and (52 + (g.rng() * 8)) or ((u.role == "ranged") and (44 + (g.rng() * 12)) or (g.rng() * 3)));
u.home = {x=((u.x or __NaN) + ((e.nx or __NaN) * 14)), y=((u.y or __NaN) + ((e.ny or __NaN) * 14))};
if (cls == "hunter") then
local pet = M.mkUnit(g, p, "pet", u.x, u.y);
pet.slotA = ((g.rng() - 0.5) * 2);
pet.state = "pull";
end;
end);
local afk = __filter(M.alive(p), function(u) 
return ((u.role == "ranged") or (u.role == "melee"));
end);
if (g.rng() < 0.55) then
local u = M.pick(g, afk);
u.state = "afk";
u.afk = (7 + (g.rng() * 6));
end;
if (not __T(quiet)) then
M.banner(g, "A 5-MAN HAS ZONED IN", "TANK, HEALER, THREE DPS. ONE IS AFK.");
end;
__push(g.events, "horn");
end;
-- world:887
M.spawnRaid = function(g, size, final) 
local p = M.newParty(g, "raid");
p.final = (not (not __T(final)));
p.brez = (__T(final) and 2 or 1);
g.dir.raids = (g.dir.raids or __NaN) + 1;
local e = M.edgeSpot(g, true);
local cols = ((size <= 25) and 5 or __mceil(__msqrt((size * 1.4))));
local sp = ((size <= 25) and 6 or 5);
local half = (((cols - 1) / 2) * sp);
local depth = (((__mceil((size / cols)) - 1) * sp) * 0.8);
local sx = M.clamp(((e.x or __NaN) + ((e.nx or __NaN) * 40)), ((M.V.x or __NaN) + 40), (((M.V.x or __NaN) + M.W) - 40));
local sy = M.clamp(((e.y or __NaN) + ((e.ny or __NaN) * 40)), ((M.V.y or __NaN) + 48), (((M.V.y or __NaN) + M.H) - 62));
if __T(e.nx) then
sy = M.clamp(sy, (((M.V.y or __NaN) + 38) + half), ((((M.V.y or __NaN) + M.H) - 44) - half));
else
sx = M.clamp(sx, (((M.V.x or __NaN) + 12) + half), ((((M.V.x or __NaN) + M.W) - 12) - half));
sy = (((e.ny or __NaN) > 0) and __mmax(sy, (((M.V.y or __NaN) + 38) + depth)) or __mmin(sy, ((((M.V.y or __NaN) + M.H) - 30) - depth)));
end;
sx = M.clamp(sx, ((M.AR.x0 or __NaN) + 10), ((M.AR.x1 or __NaN) - 10));
sy = M.clamp(sy, ((M.AR.y0 or __NaN) + 10), ((M.AR.y1 or __NaN) - 10));
p.stage = {x=sx, y=sy};
local base = __matan2((sy - (g.boss.y or __NaN)), (sx - (g.boss.x or __NaN)));
local comp = M.raidComp(size);
local nMelee = __filter(comp, function(c) 
return (M.CLASS[c].role == "melee");
end).length;
local px = (-(e.ny or __NaN));
local py = e.nx;
local tank = 0;
local mi = 0;
__forEach(comp, function(cls, i) 
local row = __mfloor((i / cols));
local col = __mfmod(i, cols);
local ox = ((col - ((cols - 1) / 2)) * sp);
local oy = (row * sp);
local u = M.mkUnit(g, p, cls, (((e.x or __NaN) + (px * ox)) - ((e.nx or __NaN) * oy)), (((e.y or __NaN) + (py * ox)) - ((e.ny or __NaN) * oy)));
u.stage = {x=((sx + (px * ox)) - (((e.nx or __NaN) * oy) * 0.8)), y=((sy + (py * ox)) - (((e.ny or __NaN) * oy) * 0.8))};
if (u.role == "tank") then
u.slot = (function() local __t95 = tank; tank = __t95 + 1; return __t95 end)();
end;
u.slotA = ((u.role == "melee") and ((((function() local __t96 = mi; mi = __t96 + 1; return __t96 end)() / __mmax(1, (nMelee - 1))) - 0.5) * 2.2) or (base + ((g.rng() - 0.5) * 2.6)));
u.slotD = ((u.role == "healer") and (54 + (g.rng() * 10)) or ((u.role == "ranged") and (44 + (g.rng() * 16)) or (g.rng() * 4)));
end);
p.leader = p.units[0];
if __T(final) then
M.banner(g, "A 40-MAN RAID HAS ENTERED", "THE BIG ONE. NOTHING ELSE IS COMING.", 4);
else
M.banner(g, ("A " .. __str(size) .. "-MAN RAID HAS ENTERED"), "THEY HAVE WATCHED A GUIDE.");
end;
__push(g.events, "raidhorn");
end;
-- world:921
M.spawnRider = function(g) 
local p = M.newParty(g, "rider");
local e = M.edgeSpot(g, false);
local u = M.mkUnit(g, p, "rider", e.x, e.y);
u.state = "arrive";
u.mounted = true;
u.grip = 100;
u.hface = 0;
u.horse = {x=e.x, y=e.y, face=0, walk=0};
p.engaged = true;
M.banner(g, "A QUIET MAN ON A HORSE", "HE WANTS TO CLIMB YOUR FUR.");
__push(g.events, "neigh");
end;
-- world:933
M.raidComp = function(size) 
local tanks = (2 + __mfloor(((size - 25) / 15)));
local healers = __mfloor((size * 0.2) + 0.5);
local dps = ((size - tanks) - healers);
local melee = {[0]="rogue", "berserker", "paladin", length=3};
local ranged = {[0]="mage", "warlock", "hunter", length=3};
local comp = {length=0};
for i = 0, tanks - 1 do
__push(comp, "warrior");
end;
for i = 0, healers - 1 do
__push(comp, ((__mfmod(i, 2) ~= 0) and "druid" or "priest"));
end;
for i = 0, __mceil(dps) - 1 do
__push(comp, (function() if (__mfmod(i, 2) ~= 0) then return ranged[__mfmod(__shr(i, 1), 3)]; else return melee[__mfmod(__shr(i, 1), 3)]; end; end)());
end;
do return comp end;
end;
-- world:944
M.garrison = function(g, o) 
local size = ((o.size ~= 0) and o.size or 5);
local raid = (size > 5);
local p = M.newParty(g, (raid and "raid" or "dungeon"));
if __T(o.power) then
p.power = o.power;
end;
p.post = {x=o.x, y=o.y};
p.guard = (__T(o.guard) and o.guard or (raid and 60 or 56));
p.leash = (__T(o.leash) and o.leash or (raid and 150 or 120));
if raid then
p.brez = 1;
g.dir.raids = (g.dir.raids or __NaN) + 1;
end;
local comp;
if raid then comp = M.raidComp(size); else comp = {[0]="warrior", ((g.rng() < 0.5) and "priest" or "druid"), ((g.rng() < 0.5) and "rogue" or "berserker"), "mage", "hunter", length=5}; end;
local cols = (raid and __mceil(__msqrt((size * 1.4))) or 3);
local sp = (__T(o.spread) and o.spread or (raid and 5 or 6));
local rows = __mceil(((comp.length or #comp) / cols));
local face = __matan2(((g.boss.y or __NaN) - (o.y or __NaN)), ((g.boss.x or __NaN) - (o.x or __NaN)));
local nMelee = __filter(comp, function(c) 
return (M.CLASS[c].role == "melee");
end).length;
local tank = 0;
local mi = 0;
__forEach(comp, function(cls, i) 
local row = __mfloor((i / cols));
local col = __mfmod(i, cols);
local x = (((o.x or __NaN) + ((col - ((cols - 1) / 2)) * sp)) + ((g.rng() - 0.5) * 1.5));
local y = ((o.y or __NaN) + (((row - ((rows - 1) / 2)) * sp) * 0.8));
local u = M.mkUnit(g, p, cls, x, y);
u.state = "post";
u.post = {x=x, y=y};
u.fx = ((__mcos(face) >= 0) and 1 or (-1));
if (u.role == "tank") then
u.slot = (function() local __t100 = tank; tank = __t100 + 1; return __t100 end)();
end;
u.slotA = ((u.role == "melee") and (raid and ((((function() local __t101 = mi; mi = __t101 + 1; return __t101 end)() / __mmax(1, (nMelee - 1))) - 0.5) * 2.2) or ((g.rng() - 0.5) * 1.6)) or ((face + math.pi) + ((g.rng() - 0.5) * 2.2)));
u.slotD = ((u.role == "healer") and (52 + (g.rng() * 10)) or ((u.role == "ranged") and (44 + (g.rng() * 14)) or (g.rng() * 3)));
if ((cls == "hunter") and (not raid)) then
local pet = M.mkUnit(g, p, "pet", (x + 2), (y + 1));
pet.state = "post";
pet.post = {x=(x + 2), y=(y + 1)};
pet.slotA = ((g.rng() - 0.5) * 2);
end;
end);
p.leader = p.units[0];
do return p end;
end;
-- world:971
M.spawnKing = function(g, o) 
local p = M.newParty(g, "dungeon");
p.king = true;
p.post = {x=o.x, y=o.y};
p.power = 1;
p.skill = {react=0.9, dodge=0.15, fire=0};
local u = M.mkUnit(g, p, "king", o.x, o.y);
do local __t102 = (__T(o.hp) and o.hp or M.CLASS.king.hp); u.maxhp = __t102; u.hp = __t102; end;
u.state = "post";
u.post = {x=o.x, y=o.y};
u.king = true;
do return u end;
end;
-- world:981
M.scatter = function(g, p) 
p.fleeing = true;
do
local __t103, __t104 = __it(M.alive(p)), 0;
while __t104 < __t103.length do
local u = __t103[__t104]; __t104 = __t104 + 1;
u.state = "flee";
u.exit = M.nearestExit(u);
u.fear = 0;
end;
end;
end;
-- world:990
M.engage = function(g, p, why) 
if __T(p.engaged) then
do return end;
end;
p.engaged = true;
p.engT = g.t;
p.countdown = nil;
do
local __t106, __t107 = __it(p.units), 0;
while __t107 < __t106.length do
local u = __t106[__t107]; __t107 = __t107 + 1;
if ((((u.state == "travel") or (u.state == "stage")) or (u.state == "post")) and (u.role ~= "king")) then
u.state = "fight";
end;
end;
end;
__push(g.events, "engage");
local u = __find(M.alive(p), function(v) 
return (v.role ~= "pet");
end);
if __T(u) then
M.bark(g, u, (function() if (why == "pet") then return M.pick(g, M.BARK.pet); elseif (why == "early") then return M.pick(g, M.BARK.pull); elseif (p.type == "raid") then return "GO GO GO"; else return "GOGO"; end; end)());
end;
end;
-- world:1000
M.updateParty = function(g, p, dt) 
p.t = ((p.t or __NaN) + dt);
local live = M.alive(p);
if (not (live.length ~= 0)) then
M.finishParty(g, p);
do return end;
end;
if (p.type == "rider") then
do return end;
end;
local b = g.boss;
if ((__T(p.post) and (not __T(g.clear))) and (not __T(g.won))) then
if __T(p.king) then
do return end;
end;
if ((__T(p.engaged) and (not __T(p.fleeing))) and ((__hypot(((b.x or __NaN) - (p.post.x or __NaN)), ((b.y or __NaN) - (p.post.y or __NaN))) > (p.leash or __NaN)) or (((g.t or __NaN) - __mmax((__T(p.engT) and p.engT or 0), (__T(p.hitT) and p.hitT or 0))) > 8))) then
p.engaged = false;
do
local __t109, __t110 = __it(live), 0;
while __t110 < __t109.length do
local u = __t109[__t110]; __t110 = __t110 + 1;
if ((u.state == "fight") or (u.state == "afk")) then
u.state = "post";
u.foe = nil;
end;
end;
end;
if (g.rng() < 0.5) then
M.bark(g, live[0], M.pick(g, M.BARK.reset));
end;
elseif (not __T(p.engaged)) then
local near = __find(live, function(u) 
return (__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) < (p.guard or __NaN));
end);
if (__T(near) and (__hypot(((b.x or __NaN) - (p.post.x or __NaN)), ((b.y or __NaN) - (p.post.y or __NaN))) < ((p.leash or __NaN) * 0.8))) then
M.engage(g, p, ((near.role == "pet") and "pet" or "near"));
end;
do return end;
end;
end;
if ((not __T(p.engaged)) and (not __T(g.clear))) then
local near = __find(live, function(u) 
return ((u.state ~= "afk") and (__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) < ((p.type == "raid") and 52 or M.ENGAGE_R)));
end);
if __T(near) then
M.engage(g, p, ((near.role == "pet") and "pet" or ((p.type == "raid") and "early" or "near")));
elseif (p.type == "raid") then
local staged = ((__every(live, function(u) 
return (u.state == "stage");
end) and ((p.t or __NaN) > 5)) or ((p.t or __NaN) > 10));
if (staged and (not __T(p.countdown))) then
p.countdown = 5.99;
end;
if __T(p.countdown) then
local before = __mceil((p.countdown or __NaN));
p.countdown = ((p.countdown or __NaN) - dt);
if ((__mceil((p.countdown or __NaN)) ~= before) and ((p.countdown or __NaN) > 0)) then
__push(g.events, "tick");
M.banner(g, ("PULL IN " .. __str(__mceil((p.countdown or __NaN)))), nil, 1.1);
end;
if ((p.countdown or __NaN) <= 0) then
M.engage(g, p, "timer");
end;
end;
end;
end;
p.barkT = ((p.barkT or __NaN) - dt);
if ((p.barkT or __NaN) <= 0) then
p.barkT = (((p.type == "raid") and 2.6 or 4) + (g.rng() * 3));
local u = M.pick(g, live);
if ((u.role ~= "pet") and (not __T(g.clear))) then
local list;
if (p.type == "raid") then list = (function() if __T(p.engaged) then return M.BARK.raidFight; else return M.BARK.raidIdle; end; end)(); elseif __T(p.engaged) then list = M.BARK.dungeonFight; else list = M.BARK.dungeonIdle; end;
if ((__T(p.engaged) and ((g.adds.length or #g.adds) ~= 0)) and (g.rng() < 0.3)) then
list = M.BARK.adds;
end;
if ((__T(p.engaged) and ((b.hp or __NaN) < ((b.maxhp or __NaN) * 0.3))) and (g.rng() < 0.4)) then
list = M.BARK.execute;
end;
M.bark(g, u, M.pick(g, list));
end;
end;
if (((((p.brez or __NaN) > 0) and __T(p.engaged)) and (not __T(p.fleeing))) and ((p.deadList.length or #p.deadList) ~= 0)) then
local c;
local healer = __find(live, function(u) 
return (u.role == "healer");
end);
c = __find(p.deadList, function(c) 
return ((((g.t or __NaN) - (c.t or __NaN)) > 4) and __some(g.corpses, function(k) 
return (k.u == c.u);
end));
end);
if ((__T(healer) and __T(c)) and (g.rng() < (0.3 * dt))) then
p.brez = (p.brez or __NaN) - 1;
__splice(p.deadList, __indexOf(p.deadList, c), 1);
local u = c.u;
u.dead = false;
u.hp = ((u.maxhp or __NaN) * 0.5);
u.state = "fight";
u.x = c.x;
u.y = c.y;
u.fear = 0;
u.stun = 0;
__push(g.units, u);
g.corpses = __filter(g.corpses, function(k) 
return (k.u ~= u);
end);
M.bark(g, healer, "BREZ!");
for i = 0, 12 - 1 do
local a = (g.rng() * M.TAU);
M.part(g, u.x, ((u.y or __NaN) - 2), (__mcos(a) * 18), ((__msin(a) * 18) - 10), 0.6, "heal");
end;
__push(g.events, "rez");
end;
end;
p.fleeT = ((__T(p.fleeT) and p.fleeT or 0) - dt);
if ((__T(p.engaged) and (p.fleeing ~= true)) and ((p.fleeT or __NaN) <= 0)) then
local noFront = (((p.type == "raid") and (live.length <= ((p.units.length or #p.units) * 0.35))) and (not __some(live, function(u) 
return ((u.role == "tank") or (u.role == "melee"));
end)));
local few;
if (p.type == "raid") then few = (live.length <= __mmax(3, __mfloor(((p.units.length or #p.units) * 0.12) + 0.5))); else few = (((live.length == 1) and (live[0].role == "healer")) and ((p.units.length or #p.units) > 2)); end;
if ((few or noFront) and (noFront or (g.rng() < 0.55))) then
p.fleeing = true;
M.bark(g, live[0], (noFront and "NO TANK. WIPE IT" or (function() if (p.type == "raid") then return M.pick(g, M.BARK.flee); else return "NOPE"; end; end)()));
do
local __t113, __t114 = __it(live), 0;
while __t114 < __t113.length do
local u = __t113[__t114]; __t114 = __t114 + 1;
u.state = "flee";
u.exit = M.nearestExit(u);
end;
end;
elseif few then
p.fleeing = "no";
p.fleeT = 12;
end;
end;
end;
-- world:1081
M.finishParty = function(g, p) 
p.done = true;
if __T(p.king) then
do return end;
end;
local esc = __filter(p.units, function(u) 
return u.gone;
end).length;
if (__T(p.final) and (not __T(g.boss.dead))) then
M.mapCleared(g, esc);
do return end;
end;
if ((esc ~= 0) and ((__T(g.boss.dead) or __T(g.clear)) or __T(g.won))) then
do return end;
end;
if (p.type == "rider") then
if (esc ~= 0) then
do return end;
end;
g.wipes.rider = (g.wipes.rider or __NaN) + 1;
M.banner(g, "HORSE GUY DEFEATED", "THE HORSE SEEMS RELIEVED.");
__push(g.events, "wipe");
do return end;
end;
if (esc ~= 0) then
M.banner(g, ((esc == 1) and "ONE GOT AWAY" or (__str(esc) .. " GOT AWAY")), "NO WIPE BONUS. THEY WILL TELL OTHERS.");
do return end;
end;
local pts = __mfloor(((M.WIPE[p.type] or __NaN) * (g.mult or __NaN)) + 0.5);
M.addScore(g, pts);
g.wipes[p.type] = (g.wipes[p.type] or __NaN) + 1;
M.banner(g, ((p.type == "raid") and "RAID WIPED" or "PARTY WIPED"), (("+" .. __str(pts)) .. ((p.type == "raid") and "  SEE YOU NEXT RESET" or "")));
__push(g.events, "wipe");
end;
-- world:1106
M.mapCleared = function(g, esc) 
if __T(g.clear) then
do return end;
end;
g.clear = {t=0};
local pts = (__T(esc) and 0 or __mfloor(((M.WIPE.final or __NaN) * (g.mult or __NaN)) + 0.5));
if (pts ~= 0) then
M.addScore(g, pts);
g.wipes.final = (g.wipes.final or __NaN) + 1;
end;
M.banner(g, "LEVEL CLEARED", ((pts ~= 0) and ("+" .. __str(pts) .. ". THE HOARD OPENS IN A MOMENT.") or "SOME GOT AWAY. THE HOARD OPENS IN A MOMENT."), 5);
__push(g.events, "clear");
M.sendHome(g);
end;
-- world:1117
M.levelCleared = function(g, title, sub) if title == nil then title = "LEVEL CLEARED" end; if sub == nil then sub = "THE HOARD OPENS IN A MOMENT." end;
if (__T(g.clear) or __T(g.won)) then
do return end;
end;
g.clear = {t=0};
M.banner(g, title, sub, 5);
__push(g.events, "clear");
M.sendHome(g);
end;
-- world:1126
M.winGame = function(g) 
if __T(g.won) then
do return end;
end;
g.won = true;
g.winT = 0;
g.dir.final = true;
M.banner(g, "THE KINGDOM IS RUBBLE", "EVERY HERO LEFT IS RUNNING. YOU WIN.", 7);
__push(g.events, "clear");
M.sendHome(g);
end;
-- world:1134
M.sendHome = function(g) 
g.boss.act = nil;
g.boss.taunt = nil;
do
local __t116, __t117 = __it(g.units), 0;
while __t117 < __t116.length do
repeat
local u = __t116[__t117]; __t117 = __t117 + 1;
if (__T(u.dead) or __T(u.gone)) then
do break end;
end;
if (u.role == "rider") then
u.state = "leave";
u.mounted = true;
u.exit = M.nearestExit(u);
do break end;
end;
u.state = "flee";
u.exit = M.nearestExit(u);
u.fear = 0;
u.stun = 0;
if (g.rng() < 0.15) then
M.bark(g, u, M.pick(g, M.BARK.logoff));
end;
until true;
end;
end;
end;
-- world:1144
M.nearestExit = function(u) 
local opts = {[0]={x=((M.V.x or __NaN) - 12), y=u.y}, {x=(((M.V.x or __NaN) + M.W) + 12), y=u.y}, {x=u.x, y=((M.V.y or __NaN) - 12)}, {x=u.x, y=(((M.V.y or __NaN) + M.H) + 12)}, length=4};
do return __reduce(opts, function(a, c) 
if (__hypot(((c.x or __NaN) - (u.x or __NaN)), ((c.y or __NaN) - (u.y or __NaN))) < __hypot(((a.x or __NaN) - (u.x or __NaN)), ((a.y or __NaN) - (u.y or __NaN)))) then do return c end; else do return a end; end;
end) end;
end;
-- world:1151
M.moveTo = function(u, tx, ty, spd, dt) 
spd = (spd * (u.slow == nil and 1 or u.slow));
local dx = (tx - (u.x or __NaN));
local dy = (ty - (u.y or __NaN));
local d = __hypot(dx, dy);
if (d < 0.6) then
u.moving = false;
do return true end;
end;
local s = __mmin(d, (spd * dt));
u.x = ((u.x or __NaN) + ((dx / d) * s));
u.y = ((u.y or __NaN) + ((dy / d) * s));
u.moving = true;
if (__mabs(dx) > 0.3) then
u.fx = ((dx > 0) and 1 or (-1));
end;
u.walk = ((u.walk or __NaN) + (s * 0.5));
do return (d < 2) end;
end;
-- world:1162
M.moveDir = function(u, dx, dy, spd, dt) 
spd = (spd * (u.slow == nil and 1 or u.slow));
local d = ((__hypot(dx, dy) ~= 0) and __hypot(dx, dy) or 1);
u.x = ((u.x or __NaN) + (((dx / d) * spd) * dt));
u.y = ((u.y or __NaN) + (((dy / d) * spd) * dt));
u.moving = true;
if (__mabs(dx) > 0.1) then
u.fx = ((dx > 0) and 1 or (-1));
end;
u.walk = ((u.walk or __NaN) + ((spd * dt) * 0.5));
end;
-- world:1170
M.clampArena = function(u) 
u.x = M.clamp(u.x, M.AR.x0, M.AR.x1);
u.y = M.clamp(u.y, ((M.AR.y0 or __NaN) - 6), ((M.AR.y1 or __NaN) + 8));
end;
-- world:1176
M.knock = function(u, b, kb) 
local dx = ((u.x or __NaN) - (b.x or __NaN));
local dy = ((u.y or __NaN) - (b.y or __NaN));
local d = ((__hypot(dx, dy) ~= 0) and __hypot(dx, dy) or 1);
u.kx = ((u.kx or __NaN) + (((dx / d) * kb) * 5));
u.ky = ((u.ky or __NaN) + (((dy / d) * kb) * 5));
end;
-- world:1181
M.escapeDir = function(g, k, u) 
local b = g.boss;
local d = g.abil[k];
local dx = ((u.x or __NaN) - (b.x or __NaN));
local dy = ((u.y or __NaN) - (b.y or __NaN));
local dist = ((__hypot(dx, dy) ~= 0) and __hypot(dx, dy) or 1);
if (k == "stomp") then
do return {x=(dx / dist), y=(dy / dist)} end;
end;
if ((k == "charge") or (k == "beam")) then
local s = (((((-dx) * __msin((b.face or __NaN))) + (dy * __mcos((b.face or __NaN)))) >= 0) and 1 or (-1));
do return {x=((-__msin((b.face or __NaN))) * s), y=(__mcos((b.face or __NaN)) * s)} end;
end;
local f = M.zoneFace(g, k);
local ad = M.angDiff(__matan2(dy, dx), f);
local radial = (((d.range or __NaN) + 4) - dist);
local lateral = (dist * ((((d.arc or __NaN) / 2) + 0.2) - __mabs(ad)));
if (lateral < radial) then
local s = ((ad >= 0) and 1 or (-1));
do return {x=((-__msin(f)) * s), y=(__mcos(f) * s)} end;
end;
do return {x=(dx / dist), y=(dy / dist)} end;
end;
-- world:1194
M.fireAt = function(g, x, y) 
do
local __t119, __t120 = __it(g.fires), 0;
while __t120 < __t119.length do
local f = __t119[__t120]; __t120 = __t120 + 1;
if (((f.t or __NaN) < ((f.life or __NaN) - 0.4)) and (__hypot((x - (f.x or __NaN)), (y - (f.y or __NaN))) < (f.r or __NaN))) then
do return f end;
end;
end;
end;
do return nil end;
end;
-- world:1198
M.onIce = function(g, x, y) 
do
local __t122, __t123 = __it(g.ice), 0;
while __t123 < __t122.length do
local i = __t122[__t123]; __t123 = __t123 + 1;
if (((i.t or __NaN) < ((i.life or __NaN) - 0.5)) and (__hypot((x - (i.x or __NaN)), (y - (i.y or __NaN))) < (i.r or __NaN))) then
do return true end;
end;
end;
end;
do return false end;
end;
-- world:1203
M.fightSpot = function(g, u) 
local b = g.boss;
local a;
local d;
if (u.role == "tank") then
a = ((b.face or __NaN) + (({[0]=0, 0.95, (-0.95), 0.5, (-0.5), length=5})[__mfmod((__T(u.slot) and u.slot or 0), 5)] or __NaN));
d = ((b.r or __NaN) + 5);
elseif ((u.role == "melee") or (u.role == "pet")) then
a = (((b.face or __NaN) + math.pi) + (u.slotA or __NaN));
d = (((b.r or __NaN) + 4) + (u.slotD or __NaN));
else
a = u.slotA;
d = u.slotD;
end;
do return {x=M.clamp(((b.x or __NaN) + (__mcos(a) * d)), M.AR.x0, M.AR.x1), y=M.clamp(((b.y or __NaN) + (__msin(a) * d)), M.AR.y0, M.AR.y1)} end;
end;
-- world:1212
M.updateUnit = function(g, u, dt) 
local b = g.boss;
local p = u.party;
u.hit = __mmax(0, ((u.hit or __NaN) - dt));
u.x = ((u.x or __NaN) + ((u.kx or __NaN) * dt));
u.y = ((u.y or __NaN) + ((u.ky or __NaN) * dt));
local k = __mexp(((-9) * dt));
u.kx = ((u.kx or __NaN) * k);
u.ky = ((u.ky or __NaN) * k);
u.slow = ((M.onIce(g, u.x, u.y) and 0.4 or 1) * (function() if ((g.props.length or #g.props) ~= 0) then return __I0.slowAt(g, u.x, u.y); else return 1; end; end)());
if (u.role == "rider") then
M.updateRider(g, u, dt);
do return end;
end;
if __T(b.dead) then
u.moving = false;
u.dance = ((__T(u.dance) and u.dance or (g.rng() * 3)) + dt);
do return end;
end;
local f = M.fireAt(g, u.x, u.y);
if __T(f) then
if (not __T(u.inFire)) then
u.inFire = true;
u.fireOk = (g.rng() < (p.skill.fire or __NaN));
if (__T(u.fireOk) and (g.rng() < 0.6)) then
M.bark(g, u, M.pick(g, M.BARK.fire));
end;
end;
M.hurt(g, u, (32 * dt));
if __T(u.dead) then
do return end;
end;
else
u.inFire = false;
end;
if ((u.stun or __NaN) > 0) then
u.stun = ((u.stun or __NaN) - dt);
u.moving = false;
u.cast = 0;
do return end;
end;
if (u.state == "flee") then
M.moveTo(u, u.exit.x, u.exit.y, ((u.spd or __NaN) * 0.95), dt);
if (((((u.x or __NaN) < ((M.V.x or __NaN) - 10)) or ((u.x or __NaN) > (((M.V.x or __NaN) + M.W) + 10))) or ((u.y or __NaN) < ((M.V.y or __NaN) - 10))) or ((u.y or __NaN) > (((M.V.y or __NaN) + M.H) + 10))) then
u.gone = true;
if (not __T(g.clear)) then
g.escaped = (g.escaped or __NaN) + 1;
end;
end;
do return end;
end;
if ((u.fear or __NaN) > 0) then
u.fear = ((u.fear or __NaN) - dt);
u.cast = 0;
M.moveDir(u, (((u.x or __NaN) - (b.x or __NaN)) + (__msin((((g.t or __NaN) * 3) + (u.id or __NaN))) * 20)), (((u.y or __NaN) - (b.y or __NaN)) + (__mcos((((g.t or __NaN) * 3) + (u.id or __NaN))) * 20)), ((u.spd or __NaN) * 1.1), dt);
M.clampArena(u);
do return end;
end;
local tele = M.telegraph(g);
if (__T(tele) and (u.state ~= "afk")) then
local inside = M.inZone(g, tele, u.x, u.y, 4);
if ((((tele == "breath") or (tele == "beam")) and inside) and (not __T(u.inCone))) then
u.react = __mmax((u.react or __NaN), ((g.t or __NaN) + ((p.skill.react or __NaN) * (0.4 + (g.rng() * 0.5)))));
end;
u.inCone = inside;
if ((inside and __T(u.willDodge)) and ((g.t or __NaN) >= (u.react or __NaN))) then
local e = M.escapeDir(g, tele, u);
M.moveDir(u, e.x, e.y, ((u.spd or __NaN) * 1.8), dt);
u.cast = 0;
M.clampArena(u);
do return end;
end;
else
u.inCone = false;
end;
if (__T(f) and (not __T(u.fireOk))) then
M.moveDir(u, ((u.x or __NaN) - (f.x or __NaN)), ((u.y or __NaN) - (f.y or __NaN)), ((u.spd or __NaN) * 1.3), dt);
u.cast = 0;
do return end;
end;
do
local __t125 = u.state;
if __t125 == "afk" then
u.moving = false;
u.afk = ((u.afk or __NaN) - dt);
if ((u.afk or __NaN) <= 0) then
u.state = (__T(p.engaged) and "fight" or "travel");
M.bark(g, u, "BACK");
elseif ((not __T(u.saidBrb)) and ((p.t or __NaN) > 1)) then
u.saidBrb = true;
M.bark(g, u, "BRB");
end;
if __T(u.home) then
M.moveTo(u, u.home.x, u.home.y, u.spd, dt);
end;
do return end;
elseif __t125 == "pull" then
M.moveTo(u, b.x, b.y, u.spd, dt);
if (__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) < ((b.r or __NaN) + 8)) then
u.state = "fight";
M.engage(g, p, "pet");
end;
do return end;
elseif __t125 == "travel" then
if (p.type == "raid") then
if M.moveTo(u, u.stage.x, u.stage.y, u.spd, dt) then
u.state = "stage";
end;
else
M.moveTo(u, b.x, b.y, u.spd, dt);
end;
do return end;
elseif __t125 == "stage" then
u.moving = false;
do return end;
elseif __t125 == "post" then
local tx = u.post.x;
local ty = u.post.y;
local db = __hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN)));
local shy = ((u.role == "king") and (db < 70));
if shy then
local l = ((db ~= 0) and db or 1);
local k = ((70 - db) * 0.6);
tx = M.clamp(((u.x or __NaN) + ((((u.x or __NaN) - (b.x or __NaN)) / l) * k)), ((u.post.x or __NaN) - 34), ((u.post.x or __NaN) + 34));
ty = M.clamp(((u.y or __NaN) + ((((u.y or __NaN) - (b.y or __NaN)) / l) * k)), ((u.post.y or __NaN) - 22), ((u.post.y or __NaN) + 22));
if ((db < 44) and (g.rng() < (0.5 * dt))) then
M.bark(g, u, M.pick(g, M.BARK.king));
end;
end;
if (__hypot((tx - (u.x or __NaN)), (ty - (u.y or __NaN))) > 1.5) then
M.moveTo(u, tx, ty, u.spd, dt);
else
u.moving = false;
end;
M.clampArena(u);
do return end;
end;
end;
u.foeT = ((__T(u.foeT) and u.foeT or 0) - dt);
if ((u.foeT or __NaN) <= 0) then
u.foeT = (0.4 + (g.rng() * 0.4));
u.foe = M.pickFoe(g, u);
end;
if __T((u.foe and u.foe.dead)) then
u.foe = nil;
end;
if __T(u.foe) then
M.fightAdd(g, u, u.foe, dt);
do return end;
end;
local s = M.fightSpot(g, u);
local dist = __hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN)));
local there;
if ((u.role == "ranged") or (u.role == "healer")) then
if ((__T(u.repos) or (__hypot(((s.x or __NaN) - (u.x or __NaN)), ((s.y or __NaN) - (u.y or __NaN))) > 16)) or (dist < 22)) then
u.repos = (not M.moveTo(u, s.x, s.y, u.spd, dt));
else
u.moving = false;
end;
there = (not __T(u.repos));
else
there = M.moveTo(u, s.x, s.y, u.spd, dt);
end;
M.clampArena(u);
local c = M.CLASS[u.cls];
if (((u.role == "tank") or (u.role == "melee")) or (u.role == "pet")) then
if (dist < ((b.r or __NaN) + 7)) then
u.atk = ((u.atk or __NaN) - dt);
if ((u.atk or __NaN) <= 0) then
u.atk = ((c.rate or __NaN) * (0.85 + (g.rng() * 0.3)));
u.swing = 0.15;
M.hurtBoss(g, ((c.dmg or __NaN) * (p.power or __NaN)), u);
if (g.rng() < 0.5) then
M.part(g, ((b.x or __NaN) + (((u.x or __NaN) - (b.x or __NaN)) * 0.7)), ((b.y or __NaN) + (((u.y or __NaN) - (b.y or __NaN)) * 0.7)), ((g.rng() - 0.5) * 30), ((g.rng() - 0.5) * 30), 0.25, "fur");
end;
end;
end;
if (u.role == "tank") then
u.tauntCd = ((u.tauntCd or __NaN) - dt);
if ((((((u.tauntCd or __NaN) <= 0) and (dist < 34)) and (not __T(b.taunt))) and (not __T(b.evade))) and (not ((b.act and b.act.kind) == "charge"))) then
u.tauntCd = (9 + (g.rng() * 6));
b.taunt = {u=u, t=1.2};
__push(g.events, "taunt");
M.text(g, u.x, ((u.y or __NaN) - 8), "TAUNT", "steelHi", 1);
end;
end;
elseif (u.role == "ranged") then
if (__T(there) and (dist < 84)) then
u.cast = ((u.cast or __NaN) + dt);
if ((u.cast or __NaN) >= (c.rate or __NaN)) then
u.cast = 0;
__push(g.bolts, {x=u.x, y=((u.y or __NaN) - 3), dmg=((c.dmg or __NaN) * (p.power or __NaN)), kind=c.bolt, u=u, t=0});
end;
else
u.cast = 0;
end;
elseif (u.role == "healer") then
u.cast = ((u.cast or __NaN) + dt);
if ((u.cast or __NaN) >= (c.rate or __NaN)) then
local tgt = __sort(__filter(M.alive(p), function(v) 
return (((v.hp or __NaN) < ((v.maxhp or __NaN) * 0.97)) and (__hypot(((v.x or __NaN) - (u.x or __NaN)), ((v.y or __NaN) - (u.y or __NaN))) < 110));
end), function(x, y) 
return (((x.hp or __NaN) / (x.maxhp or __NaN)) - ((y.hp or __NaN) / (y.maxhp or __NaN)));
end)[0];
if __T(tgt) then
u.cast = 0;
tgt.hp = __mmin((tgt.maxhp or __NaN), ((tgt.hp or __NaN) + ((c.heal or __NaN) * (p.power or __NaN))));
u.glow = 0.4;
for i = 0, 4 - 1 do
M.part(g, ((tgt.x or __NaN) + ((g.rng() - 0.5) * 4)), ((tgt.y or __NaN) - 2), 0, ((-10) - (g.rng() * 10)), 0.6, "heal");
end;
else
u.cast = c.rate;
end;
end;
end;
u.swing = __mmax(0, ((__T(u.swing) and u.swing or 0) - dt));
u.glow = __mmax(0, ((__T(u.glow) and u.glow or 0) - dt));
end;
-- world:1362
M.updateRider = function(g, u, dt) 
local b = g.boss;
local h = u.horse;
if (__T(b.dead) and (u.state ~= "leave")) then
u.state = "leave";
u.exit = M.nearestExit(u);
u.mounted = true;
end;
local ride = function(tx, ty, spd) 
local ox = u.x;
local oy = u.y;
M.moveTo(u, tx, ty, spd, dt);
if (__hypot(((u.x or __NaN) - ox), ((u.y or __NaN) - oy)) > 0.01) then
h.face = __matan2(((u.y or __NaN) - oy), ((u.x or __NaN) - ox));
end;
h.x = u.x;
h.y = u.y;
h.walk = ((h.walk or __NaN) + __hypot(((u.x or __NaN) - ox), ((u.y or __NaN) - oy)));
end;
local dodge = function() 
local tele = M.telegraph(g);
if (not __T(tele)) then
do return false end;
end;
if ((M.inZone(g, tele, u.x, u.y, 6) and __T(u.willDodge)) and ((g.t or __NaN) >= (u.react or __NaN))) then
local e = M.escapeDir(g, tele, u);
ride(((u.x or __NaN) + ((e.x or __NaN) * 20)), ((u.y or __NaN) + ((e.y or __NaN) * 20)), (M.HORSE_SPD * 1.2));
do return true end;
end;
do return false end;
end;
u.stab = __mmax(0, ((__T(u.stab) and u.stab or 0) - dt));
repeat
local __t127 = u.state;
if __t127 == "arrive" then
local a = __matan2(((u.y or __NaN) - (b.y or __NaN)), ((u.x or __NaN) - (b.x or __NaN)));
ride(((b.x or __NaN) + (__mcos(a) * 46)), ((b.y or __NaN) + (__msin(a) * 46)), M.HORSE_SPD);
if (__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) < 52) then
u.state = "orbit";
u.orbitT = (2.5 + (g.rng() * 2));
u.orbitDir = ((g.rng() < 0.5) and (-1) or 1);
u.orbitA = a;
end;
elseif __t127 == "orbit" then
if dodge() then
do break end;
end;
if ((u.fear or __NaN) > 0) then
u.fear = ((u.fear or __NaN) - dt);
ride(((u.x or __NaN) + ((u.x or __NaN) - (b.x or __NaN))), ((u.y or __NaN) + ((u.y or __NaN) - (b.y or __NaN))), M.HORSE_SPD);
M.clampArena(u);
do break end;
end;
u.orbitA = ((u.orbitA or __NaN) + (((u.orbitDir or __NaN) * 1.3) * dt));
ride(M.clamp(((b.x or __NaN) + (__mcos((u.orbitA or __NaN)) * 44)), M.AR.x0, M.AR.x1), M.clamp(((b.y or __NaN) + (__msin((u.orbitA or __NaN)) * 44)), M.AR.y0, M.AR.y1), M.HORSE_SPD);
u.orbitT = ((u.orbitT or __NaN) - dt);
if ((u.orbitT or __NaN) <= 0) then
u.state = "charge";
if (g.rng() < 0.4) then
M.bark(g, u, "...");
end;
end;
elseif __t127 == "charge" then
if dodge() then
do break end;
end;
local tx = ((b.x or __NaN) - (__mcos((b.face or __NaN)) * ((b.r or __NaN) + 1)));
local ty = ((b.y or __NaN) - (__msin((b.face or __NaN)) * ((b.r or __NaN) + 1)));
ride(tx, ty, (M.HORSE_SPD * 1.15));
if ((__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) < ((b.r or __NaN) + 4)) and (not __T(b.evade))) then
u.state = "climb";
u.mounted = false;
u.grip = 100;
local dx = ((u.x or __NaN) - (b.x or __NaN));
local dy = ((u.y or __NaN) - (b.y or __NaN));
local c = __mcos((-(b.face or __NaN)));
local s = __msin((-(b.face or __NaN)));
local lx = ((dx * c) - (dy * s));
local ly = ((dx * s) + (dy * c));
local l = ((__hypot(lx, ly) ~= 0) and __hypot(lx, ly) or 1);
lx = ((lx / l) * 9);
ly = ((ly / l) * 8);
u.lx = lx;
u.ly = ly;
local ha = (g.rng() * M.TAU);
h.tx = M.clamp(((b.x or __NaN) + (__mcos(ha) * 60)), ((M.AR.x0 or __NaN) + 15), ((M.AR.x1 or __NaN) - 15));
h.ty = M.clamp(((b.y or __NaN) + (__msin(ha) * 50)), ((M.AR.y0 or __NaN) + 10), ((M.AR.y1 or __NaN) - 10));
__push(g.events, "climb");
M.bark(g, u, "*GRABS FUR*");
end;
elseif __t127 == "climb" then
local dx = ((M.SIGIL.x or __NaN) - (u.lx or __NaN));
local dy = ((M.SIGIL.y or __NaN) - (u.ly or __NaN));
local d = __hypot(dx, dy);
if (d > 1.2) then
local s = __mmin(d, (2.8 * dt));
u.lx = ((u.lx or __NaN) + ((dx / d) * s));
u.ly = ((u.ly or __NaN) + ((dy / d) * s));
else
u.atk = ((u.atk or __NaN) - dt);
if ((u.atk or __NaN) <= 0) then
u.atk = M.CLASS.rider.rate;
u.stab = 0.25;
M.hurtBoss(g, M.CLASS.rider.dmg, u);
M.text(g, b.x, ((b.y or __NaN) - 16), ("-" .. __str(M.CLASS.rider.dmg)), "red", 0.9);
g.shake = __mmax((g.shake or __NaN), 0.15);
__push(g.events, "stab");
end;
end;
u.grip = __mmin(100, ((u.grip or __NaN) + (14 * dt)));
local c = __mcos((b.face or __NaN));
local s = __msin((b.face or __NaN));
u.x = (((b.x or __NaN) + ((u.lx or __NaN) * c)) - ((u.ly or __NaN) * s));
u.y = (((b.y or __NaN) + ((u.lx or __NaN) * s)) + ((u.ly or __NaN) * c));
u.walk = ((u.walk or __NaN) + (dt * 6));
elseif __t127 == "flung" then
u.x = ((u.x or __NaN) + ((u.vx or __NaN) * dt));
u.y = ((u.y or __NaN) + ((u.vy or __NaN) * dt));
u.vx = ((u.vx or __NaN) * __mexp(((-5) * dt)));
u.vy = ((u.vy or __NaN) * __mexp(((-5) * dt)));
M.clampArena(u);
u.flungT = ((u.flungT or __NaN) - dt);
if ((u.flungT or __NaN) <= 0) then
u.state = "stun";
u.stunT = 2.4;
end;
elseif __t127 == "stun" then
u.moving = false;
u.stunT = ((u.stunT or __NaN) - dt);
if ((u.stunT or __NaN) <= 0) then
u.state = "tohorse";
__push(g.events, "whistle");
end;
elseif __t127 == "tohorse" then
M.moveTo(u, h.x, h.y, M.CLASS.rider.spd, dt);
M.clampArena(u);
local ox = h.x;
local oy = h.y;
local hd = __hypot(((u.x or __NaN) - (h.x or __NaN)), ((u.y or __NaN) - (h.y or __NaN)));
if (hd > 2) then
h.x = ((h.x or __NaN) + ((((u.x or __NaN) - (h.x or __NaN)) / hd) * __mmin(hd, (50 * dt))));
h.y = ((h.y or __NaN) + ((((u.y or __NaN) - (h.y or __NaN)) / hd) * __mmin(hd, (50 * dt))));
h.face = __matan2(((h.y or __NaN) - oy), ((h.x or __NaN) - ox));
h.walk = ((h.walk or __NaN) + __hypot(((h.x or __NaN) - ox), ((h.y or __NaN) - oy)));
end;
if (hd < 3) then
u.mounted = true;
u.state = "orbit";
u.orbitT = (1.5 + (g.rng() * 1.5));
u.orbitA = __matan2(((u.y or __NaN) - (b.y or __NaN)), ((u.x or __NaN) - (b.x or __NaN)));
u.orbitDir = ((g.rng() < 0.5) and (-1) or 1);
__push(g.events, "neigh");
end;
elseif __t127 == "leave" then
h.x = u.x;
h.y = u.y;
ride(u.exit.x, u.exit.y, M.HORSE_SPD);
if (((((u.x or __NaN) < ((M.V.x or __NaN) - 10)) or ((u.x or __NaN) > (((M.V.x or __NaN) + M.W) + 10))) or ((u.y or __NaN) < ((M.V.y or __NaN) - 10))) or ((u.y or __NaN) > (((M.V.y or __NaN) + M.H) + 10))) then
u.gone = true;
end;
end;
until true;
if (((not __T(u.mounted)) and (u.state ~= "tohorse")) and (h.tx ~= nil)) then
local dx = ((h.tx or __NaN) - (h.x or __NaN));
local dy = ((h.ty or __NaN) - (h.y or __NaN));
local d = __hypot(dx, dy);
if (d > 1) then
local s = __mmin(d, (40 * dt));
h.x = ((h.x or __NaN) + ((dx / d) * s));
h.y = ((h.y or __NaN) + ((dy / d) * s));
h.face = __matan2(dy, dx);
h.walk = ((h.walk or __NaN) + s);
elseif (g.rng() < (0.3 * dt)) then
h.tx = M.clamp(((h.x or __NaN) + ((g.rng() - 0.5) * 30)), ((M.AR.x0 or __NaN) + 15), ((M.AR.x1 or __NaN) - 15));
h.ty = M.clamp(((h.y or __NaN) + ((g.rng() - 0.5) * 20)), ((M.AR.y0 or __NaN) + 10), ((M.AR.y1 or __NaN) - 10));
end;
end;
end;
-- world:1473
M.shakeRider = function(g, u) 
local b = g.boss;
u.grip = ((u.grip or __NaN) - (30 + (g.rng() * 18)));
if ((u.grip or __NaN) > 0) then
local dx = ((u.lx or __NaN) - (M.SIGIL.x or __NaN));
local dy = ((u.ly or __NaN) - (M.SIGIL.y or __NaN));
local d = ((__hypot(dx, dy) ~= 0) and __hypot(dx, dy) or 1);
u.lx = M.clamp((((u.lx or __NaN) + ((dx / d) * 2.5)) + ((g.rng() - 0.5) * 2)), (-11), 9);
u.ly = M.clamp((((u.ly or __NaN) + ((dy / d) * 2.5)) + ((g.rng() - 0.5) * 2)), (-8), 8);
do return end;
end;
local c = __mcos((b.face or __NaN));
local s = __msin((b.face or __NaN));
local wx = (((u.lx or __NaN) * c) - ((u.ly or __NaN) * s));
local wy = (((u.lx or __NaN) * s) + ((u.ly or __NaN) * c));
local l = __hypot(wx, wy);
if (l < 1) then
local a = (g.rng() * M.TAU);
wx = __mcos(a);
wy = __msin(a);
else
wx = (wx / l);
wy = (wy / l);
end;
u.state = "flung";
u.flungT = 0.4;
u.x = ((b.x or __NaN) + (wx * ((b.r or __NaN) + 3)));
u.y = ((b.y or __NaN) + (wy * ((b.r or __NaN) + 3)));
u.vx = (wx * 110);
u.vy = (wy * 110);
M.text(g, u.x, ((u.y or __NaN) - 8), "SHAKEN OFF", "cream", 1.2);
__push(g.events, "fling");
end;
-- world:1496
M.hurt = function(g, u, amt) 
if (not M.hittable(u)) then
do return end;
end;
if ((u.role == "rider") and (u.state == "stun")) then
amt = (amt * 2);
end;
u.hp = ((u.hp or __NaN) - amt);
if (amt > 5) then
u.hit = 0.12;
end;
if ((u.hp or __NaN) <= 0) then
M.kill(g, u);
elseif ((not __T(u.party.engaged)) and (amt > 5)) then
M.engage(g, u.party, "early");
end;
end;
-- world:1505
M.kill = function(g, u) 
u.dead = true;
local p = u.party;
local base;
if (u.role == "pet") then base = M.PTS.pet; else base = M.PTS[p.type]; end;
local pts = __mfloor((base * (g.mult or __NaN)) + 0.5);
M.addScore(g, pts);
g.kills = (g.kills or __NaN) + 1;
M.text(g, u.x, ((u.y or __NaN) - 6), ("+" .. __str(pts)), ((u.role == "rider") and "gold" or "cream"), ((u.role == "rider") and 1.6 or 0.9));
__push(g.events, ((u.role == "rider") and "riderdie" or "kill"));
for i = 0, 7 - 1 do
local a = (g.rng() * M.TAU);
local s = (10 + (g.rng() * 30));
M.part(g, u.x, ((u.y or __NaN) - 1), (__mcos(a) * s), (__msin(a) * s), 0.35, "blood");
end;
local corpse = {u=u, x=u.x, y=u.y, cls=u.cls, t=0};
__push(g.corpses, corpse);
if ((g.corpses.length or #g.corpses) > 90) then
__shift(g.corpses);
end;
if (u.role ~= "pet") then
__push(g.ghosts, {x=u.x, y=((u.y or __NaN) - 2), t=0, vx=((g.rng() - 0.5) * 6)});
end;
__push(p.deadList, {u=u, x=u.x, y=u.y, t=g.t});
if ((g.boss.taunt and g.boss.taunt.u) == u) then
g.boss.taunt = nil;
end;
if (((p.type ~= "rider") and (u.role ~= "pet")) and (g.rng() < 0.3)) then
M.bark(g, {x=u.x, y=((u.y or __NaN) - 4), dead=true}, M.pick(g, M.BARK.died));
end;
if (u.role == "rider") then
local h = u.horse;
__push(g.ghosts, {x=u.x, y=((u.y or __NaN) - 2), t=0, vx=0});
__push(g.parts, {horse=true, x=h.x, y=h.y, vx=((((h.x or __NaN) < ((M.V.x or __NaN) + (M.W / 2))) and (-1) or 1) * 70), vy=0, t=0, life=4, face=(((h.x or __NaN) < ((M.V.x or __NaN) + (M.W / 2))) and math.pi or 0), walk=h.walk});
end;
end;
-- world:1531
M.updateBolts = function(g, dt) 
local b = g.boss;
do
local __t130, __t131 = __it(g.bolts), 0;
while __t131 < __t130.length do
repeat
local o = __t130[__t131]; __t131 = __t131 + 1;
o.t = ((o.t or __NaN) + dt);
local tgt;
if __T(o.ally) then tgt = o.tgt; else tgt = (__T(o.foe) and o.foe or b); end;
if __T((function() if __T(o.ally) then return (not M.hittable(tgt)); else return (o.foe and o.foe.dead); end; end)()) then
o.done = true;
do break end;
end;
local dx = ((tgt.x or __NaN) - (o.x or __NaN));
local dy = ((tgt.y or __NaN) - (o.y or __NaN));
local d = __hypot(dx, dy);
local sp = ((o.kind == "arrow") and 150 or ((o.kind == "fireball") and 90 or 100));
o.vx = ((dx / ((d ~= 0) and d or 1)) * sp);
o.vy = ((dy / ((d ~= 0) and d or 1)) * sp);
o.x = ((o.x or __NaN) + ((o.vx or __NaN) * dt));
o.y = ((o.y or __NaN) + ((o.vy or __NaN) * dt));
local hitR = (__T(o.ally) and 2 or (function() if __T(o.foe) then return o.foe.r; else return ((b.r or __NaN) - 1); end; end)());
if ((d < hitR) or ((o.t or __NaN) > 2)) then
o.done = true;
if __T(o.ally) then
M.hurt(g, tgt, o.dmg);
for i = 0, 4 - 1 do
M.part(g, o.x, o.y, ((g.rng() - 0.5) * 30), ((g.rng() - 0.5) * 30), 0.3, ((o.kind == "fireball") and "flame" or "shadow"));
end;
elseif __T(o.foe) then
M.hurtAdd(g, o.foe, o.dmg);
elseif (not __T(b.dead)) then
M.hurtBoss(g, o.dmg, o.u);
for i = 0, 3 - 1 do
M.part(g, o.x, o.y, ((g.rng() - 0.5) * 30), ((g.rng() - 0.5) * 30), 0.25, o.kind);
end;
end;
end;
until true;
end;
end;
g.bolts = __filter(g.bolts, function(o) 
return (not __T(o.done));
end);
end;
-- world:1555
M.updateFx = function(g, dt) 
do
local __t135, __t136 = __it(g.parts), 0;
while __t136 < __t135.length do
local p = __t135[__t136]; __t136 = __t136 + 1;
p.t = ((p.t or __NaN) + dt);
p.x = ((p.x or __NaN) + ((p.vx or __NaN) * dt));
p.y = ((p.y or __NaN) + ((p.vy or __NaN) * dt));
if (not __T(p.horse)) then
p.vx = ((p.vx or __NaN) * __mexp(((-4) * dt)));
p.vy = ((p.vy or __NaN) * __mexp(((-4) * dt)));
else
p.walk = ((p.walk or __NaN) + (__mabs((p.vx or __NaN)) * dt));
end;
end;
end;
g.parts = __filter(g.parts, function(p) 
return ((p.t or __NaN) < (p.life or __NaN));
end);
do
local __t138, __t139 = __it(g.fires), 0;
while __t139 < __t138.length do
local f = __t138[__t139]; __t139 = __t139 + 1;
f.t = ((f.t or __NaN) + dt);
end;
end;
g.fires = __filter(g.fires, function(f) 
return ((f.t or __NaN) < (f.life or __NaN));
end);
do
local __t141, __t142 = __it(g.ice), 0;
while __t142 < __t141.length do
local i = __t141[__t142]; __t142 = __t142 + 1;
i.t = ((i.t or __NaN) + dt);
end;
end;
g.ice = __filter(g.ice, function(i) 
return ((i.t or __NaN) < (i.life or __NaN));
end);
do
local __t144, __t145 = __it(g.corpses), 0;
while __t145 < __t144.length do
local c = __t144[__t145]; __t145 = __t145 + 1;
c.t = ((c.t or __NaN) + dt);
end;
end;
g.corpses = __filter(g.corpses, function(c) 
return ((c.t or __NaN) < 40);
end);
do
local __t147, __t148 = __it(g.ghosts), 0;
while __t148 < __t147.length do
local o = __t147[__t148]; __t148 = __t148 + 1;
o.t = ((o.t or __NaN) + dt);
o.y = ((o.y or __NaN) - (7 * dt));
o.x = ((o.x or __NaN) + ((o.vx or __NaN) * dt));
end;
end;
g.ghosts = __filter(g.ghosts, function(o) 
return ((o.t or __NaN) < 3.5);
end);
do
local __t150, __t151 = __it(g.texts), 0;
while __t151 < __t150.length do
local t = __t150[__t151]; __t151 = __t151 + 1;
t.t = ((t.t or __NaN) + dt);
end;
end;
g.texts = __filter(g.texts, function(t) 
return ((t.t or __NaN) < (t.life or __NaN));
end);
do
local __t153, __t154 = __it(g.barks), 0;
while __t154 < __t153.length do
local k = __t153[__t154]; __t154 = __t154 + 1;
k.t = ((k.t or __NaN) + dt);
if ((__T(k.u) and (not __T(k.u.dead))) and (not __T(k.u.gone))) then
k.x = k.u.x;
k.y = k.u.y;
end;
end;
end;
g.barks = __filter(g.barks, function(k) 
return ((k.t or __NaN) < (k.life or __NaN));
end);
do
local __t156, __t157 = __it(g.rings), 0;
while __t157 < __t156.length do
local r = __t156[__t157]; __t157 = __t157 + 1;
r.t = ((r.t or __NaN) + dt);
end;
end;
g.rings = __filter(g.rings, function(r) 
return ((r.t or __NaN) < ((r.col == "slash") and 0.18 or 0.45));
end);
if __T(g.banner) then
g.banner.t = ((g.banner.t or __NaN) + dt);
if ((g.banner.t or __NaN) > (g.banner.dur or __NaN)) then
g.banner = nil;
end;
end;
end;
-- world:1575
M.separate = function(g) 
local us = g.units;
for i = 0, (us.length or #us) - 1 do
repeat
local a = us[i];
if (__T(a.dead) or (a.role == "rider")) then
do break end;
end;
for j = (i + 1), (us.length or #us) - 1 do
repeat
local c = us[j];
if (__T(c.dead) or (c.role == "rider")) then
do break end;
end;
local dx = ((c.x or __NaN) - (a.x or __NaN));
local dy = ((c.y or __NaN) - (a.y or __NaN));
local d2 = ((dx * dx) + (dy * dy));
if ((d2 < 9) and (d2 > 0.0001)) then
local d = __msqrt(d2);
local push = ((3 - d) * 0.5);
a.x = ((a.x or __NaN) - ((dx / d) * push));
a.y = ((a.y or __NaN) - ((dy / d) * push));
c.x = ((c.x or __NaN) + ((dx / d) * push));
c.y = ((c.y or __NaN) + ((dy / d) * push));
end;
until true;
end;
local b = g.boss;
local dx = ((a.x or __NaN) - (b.x or __NaN));
local dy = ((a.y or __NaN) - (b.y or __NaN));
local d = __hypot(dx, dy);
local min = ((b.r or __NaN) + 2);
if (((d < min) and (d > 0.001)) and (not __T(b.dead))) then
a.x = ((b.x or __NaN) + ((dx / d) * min));
a.y = ((b.y or __NaN) + ((dy / d) * min));
end;
do
local __t161, __t162 = __it(g.adds), 0;
while __t162 < __t161.length do
local m = __t161[__t162]; __t162 = __t162 + 1;
local ex = ((a.x or __NaN) - (m.x or __NaN));
local ey = ((a.y or __NaN) - (m.y or __NaN));
local e = __hypot(ex, ey);
local em = ((m.r or __NaN) + 2);
if ((e < em) and (e > 0.001)) then
a.x = ((m.x or __NaN) + ((ex / e) * em));
a.y = ((m.y or __NaN) + ((ey / e) * em));
end;
end;
end;
until true;
end;
if (((g.props.length or #g.props) ~= 0) or __T(g.water)) then
do
local __t164, __t165 = __it(us), 0;
while __t165 < __t164.length do
local u = __t164[__t165]; __t165 = __t165 + 1;
if ((not __T(u.dead)) and (not ((u.role == "rider") and (u.state == "climb")))) then
__I0.solidPush(g, u, 2);
end;
end;
end;
do
local __t167, __t168 = __it(g.adds), 0;
while __t168 < __t167.length do
local m = __t167[__t168]; __t168 = __t168 + 1;
__I0.solidPush(g, m, m.r);
end;
end;
end;
local b = g.boss;
do
local __t170, __t171 = __it(g.adds), 0;
while __t171 < __t170.length do
local m = __t170[__t171]; __t171 = __t171 + 1;
local dx = ((m.x or __NaN) - (b.x or __NaN));
local dy = ((m.y or __NaN) - (b.y or __NaN));
local d = __hypot(dx, dy);
local min = ((b.r or __NaN) + (m.r or __NaN));
if ((d < min) and (d > 0.001)) then
m.x = ((b.x or __NaN) + ((dx / d) * min));
m.y = ((b.y or __NaN) + ((dy / d) * min));
end;
end;
end;
end;
-- world:1607
M.pickFoe = function(g, u) 
if (u.role == "healer") then
do return nil end;
end;
local best = nil;
local bd = math.huge;
do
local __t173, __t174 = __it(g.adds), 0;
while __t174 < __t173.length do
repeat
local a = __t173[__t174]; __t174 = __t174 + 1;
if __T(a.dead) then
do break end;
end;
local d = __hypot(((u.x or __NaN) - (a.x or __NaN)), ((u.y or __NaN) - (a.y or __NaN)));
local reach = ((u.role == "ranged") and ((__mfmod((u.id or __NaN), 3) == 0) and 72 or 0) or ((u.role == "tank") and 8 or 12));
if ((d < reach) and (d < bd)) then
best = a;
bd = d;
end;
until true;
end;
end;
do return best end;
end;
-- world:1620
M.fightAdd = function(g, u, a, dt) 
local c = M.CLASS[u.cls];
local d = __orv(__hypot(((u.x or __NaN) - (a.x or __NaN)), ((u.y or __NaN) - (a.y or __NaN))), 1);
if (u.role == "ranged") then
if (d > 70) then
M.moveTo(u, a.x, a.y, u.spd, dt);
u.cast = 0;
else
u.moving = false;
u.cast = ((u.cast or __NaN) + dt);
if ((u.cast or __NaN) >= (c.rate or __NaN)) then
u.cast = 0;
__push(g.bolts, {x=u.x, y=((u.y or __NaN) - 3), dmg=((c.dmg or __NaN) * (u.party.power or __NaN)), kind=c.bolt, u=u, foe=a, t=0});
end;
end;
else
local ring = ((a.r or __NaN) + 3);
M.moveTo(u, ((a.x or __NaN) + ((((u.x or __NaN) - (a.x or __NaN)) / d) * ring)), ((a.y or __NaN) + ((((u.y or __NaN) - (a.y or __NaN)) / d) * ring)), u.spd, dt);
if (d < ((a.r or __NaN) + 6)) then
u.atk = ((u.atk or __NaN) - dt);
if ((u.atk or __NaN) <= 0) then
u.atk = ((c.rate or __NaN) * (0.85 + (g.rng() * 0.3)));
u.swing = 0.15;
M.hurtAdd(g, a, (((c.dmg or __NaN) * (u.party.power or __NaN)) * 1.5));
end;
end;
end;
if (__mabs(((a.x or __NaN) - (u.x or __NaN))) > 0.5) then
u.fx = (((a.x or __NaN) > (u.x or __NaN)) and 1 or (-1));
end;
M.clampArena(u);
u.swing = __mmax(0, ((__T(u.swing) and u.swing or 0) - dt));
end;
-- world:1642
M.hurtAdd = function(g, a, amt) 
if __T(a.dead) then
do return end;
end;
a.hp = ((a.hp or __NaN) - amt);
a.hit = 0.1;
if ((a.hp or __NaN) > 0) then
do return end;
end;
a.dead = true;
M.text(g, a.x, ((a.y or __NaN) - 8), (__str(M.ADDS[a.kind].name) .. " DOWN"), "pink", 1.3);
for i = 0, 10 - 1 do
local k = (g.rng() * M.TAU);
local s = (15 + (g.rng() * 30));
M.part(g, a.x, ((a.y or __NaN) - 1), (__mcos(k) * s), (__msin(k) * s), 0.45, (__startsWith(a.kind, "skel") and "bone" or "fur"));
end;
__push(g.events, "adddie");
end;
-- world:1654
M.summon = function(g) 
local lvl = (__T(g.lvl.summon) and g.lvl.summon or 0);
local kinds = ((lvl == 0) and {[0]="gnasher", "gnasher", length=2} or ((lvl == 1) and {[0]="spitter", "spitter", length=2} or {[0]="necro", length=1}));
do
local __t177, __t178 = __it(kinds), 0;
while __t178 < __t177.length do
local k = __t177[__t178]; __t178 = __t178 + 1;
if (__filter(g.adds, function(a) 
return (not __startsWith(a.kind, "skel"));
end).length >= M.MAX_ADDS) then
do break end;
end;
M.spawnAdd(g, k);
end;
end;
if (lvl == 2) then
for i = 0, 2 - 1 do
M.spawnAdd(g, "skeleton", ((g.boss.x or __NaN) + ((g.rng() - 0.5) * 30)), ((g.boss.y or __NaN) + ((g.rng() - 0.5) * 30)));
end;
end;
g.shake = __mmax((g.shake or __NaN), 0.2);
end;
-- world:1665
M.spawnAdd = function(g, kind, x, y) 
local b = g.boss;
local D = M.ADDS[kind];
if (x == nil) then
if ((kind == "spitter") and __T(g.map.pts)) then
local p = M.pathNearest(g.map, ((b.x or __NaN) + ((g.rng() - 0.5) * 50)), ((b.y or __NaN) + ((g.rng() - 0.5) * 50)));
local side = ((g.rng() < 0.5) and (-1) or 1);
local q = M.pathNearest(g.map, ((p.x or __NaN) + 3), p.y);
local ang = (__matan2(((q.y or __NaN) - (p.y or __NaN)), ((q.x or __NaN) - (p.x or __NaN))) + (math.pi / 2));
x = ((p.x or __NaN) + ((__mcos(ang) * side) * (M.LANE + 5)));
y = ((p.y or __NaN) + ((__msin(ang) * side) * (M.LANE + 5)));
else
local k = (((b.face or __NaN) + math.pi) + ((g.rng() - 0.5) * 1.5));
x = ((b.x or __NaN) + (__mcos(k) * (((b.r or __NaN) + (D.r or __NaN)) + 3)));
y = ((b.y or __NaN) + (__msin(k) * (((b.r or __NaN) + (D.r or __NaN)) + 3)));
end;
end;
local a = {id=(function() local __t181 = g.nextId; g.nextId = __t181 + 1; return __t181 end)(), kind=kind, x=M.clamp(x, M.AR.x0, M.AR.x1), y=M.clamp(y, M.AR.y0, M.AR.y1), hp=D.hp, maxhp=D.hp, r=D.r, atk=0.5, walk=0, moving=false, fx=1, hit=0, t=0, swing=0, slot=(g.rng() * M.TAU), raise=2};
__push(g.adds, a);
g.summoned = (g.summoned or __NaN) + 1;
M.text(g, a.x, ((a.y or __NaN) - 9), (__startsWith(kind, "skel") and "RISE" or (__str(D.name) .. "!")), (__startsWith(kind, "skel") and "heal" or "gold"), 1.4);
for i = 0, 12 - 1 do
local k = (g.rng() * M.TAU);
local s = (20 + (g.rng() * 25));
M.part(g, a.x, a.y, (__mcos(k) * s), (__msin(k) * s), 0.5, ((__startsWith(kind, "skel") or (kind == "necro")) and "heal" or "dust"));
end;
__push(g.events, (__startsWith(kind, "skel") and "rise" or "summon"));
do return a end;
end;
-- world:1688
M.updateAdd = function(g, a, dt) 
local b = g.boss;
local D = M.ADDS[a.kind];
a.t = ((a.t or __NaN) + dt);
a.hit = __mmax(0, ((a.hit or __NaN) - dt));
a.atk = ((a.atk or __NaN) - dt);
a.swing = __mmax(0, ((a.swing or __NaN) - dt));
if __T(b.dead) then
a.moving = false;
do return end;
end;
local tgt = nil;
local td = math.huge;
do
local __t183, __t184 = __it(g.units), 0;
while __t184 < __t183.length do
repeat
local u = __t183[__t184]; __t184 = __t184 + 1;
if ((not M.hittable(u)) or (u.state == "flee")) then
do break end;
end;
local d = __hypot(((u.x or __NaN) - (a.x or __NaN)), ((u.y or __NaN) - (a.y or __NaN)));
if ((d < (D.sense or __NaN)) and (d < td)) then
tgt = u;
td = d;
end;
until true;
end;
end;
if (a.kind == "necro") then
a.raise = ((a.raise or __NaN) - dt);
if (((a.raise or __NaN) <= 0) and (__filter(g.adds, function(m) 
return __startsWith(m.kind, "skel");
end).length < M.MAX_SKELETONS)) then
local c;
local raises = function(c) 
if __T(c.critter) then do return __I0.CRITTERS[c.critter].raise end; else do return ((c.cls ~= "pet") and "skeleton") end; end;
end;
c = __sort(__filter(g.corpses, function(c) 
return (__T(raises(c)) and (__hypot(((c.x or __NaN) - (a.x or __NaN)), ((c.y or __NaN) - (a.y or __NaN))) < 90));
end), function(p, q) 
return (__hypot(((p.x or __NaN) - (a.x or __NaN)), ((p.y or __NaN) - (a.y or __NaN))) - __hypot(((q.x or __NaN) - (a.x or __NaN)), ((q.y or __NaN) - (a.y or __NaN))));
end)[0];
if __T(c) then
__splice(g.corpses, __indexOf(g.corpses, c), 1);
if __T(c.u) then
local dl = __findIndex(c.u.party.deadList, function(e) 
return (e.u == c.u);
end);
if (dl >= 0) then
__splice(c.u.party.deadList, dl, 1);
end;
end;
M.spawnAdd(g, raises(c), c.x, c.y);
a.swing = 0.4;
a.raise = 3.2;
else
a.raise = 0.5;
end;
end;
end;
if ((a.kind == "spitter") or (a.kind == "necro")) then
if __T(tgt) then
a.fx = (((tgt.x or __NaN) > (a.x or __NaN)) and 1 or (-1));
if ((a.atk or __NaN) <= 0) then
a.atk = D.rate;
a.swing = __mmax((a.swing or __NaN), 0.25);
__push(g.bolts, {x=a.x, y=((a.y or __NaN) - 3), dmg=D.dmg, kind=((a.kind == "spitter") and "fireball" or "shadow"), ally=true, tgt=tgt, t=0});
__push(g.events, "spit");
end;
end;
if (a.kind == "spitter") then
a.moving = false;
do return end;
end;
local k = ((b.face or __NaN) + ((math.pi * 0.75) * ((__msin((a.slot or __NaN)) > 0) and 1 or (-1))));
local dist = ((b.r or __NaN) + 12);
if M.moveTo(a, ((b.x or __NaN) + (__mcos(k) * dist)), ((b.y or __NaN) + (__msin(k) * dist)), D.spd, dt) then
a.moving = false;
end;
M.clampArena(a);
do return end;
end;
if (__hypot(((a.x or __NaN) - (b.x or __NaN)), ((a.y or __NaN) - (b.y or __NaN))) > 95) then
tgt = nil;
end;
if __T(tgt) then
local reach = ((a.r or __NaN) + (D.reach or __NaN));
if (td > (reach - 1)) then
M.moveTo(a, tgt.x, tgt.y, D.spd, dt);
else
a.moving = false;
end;
if ((td < (reach + 1)) and ((a.atk or __NaN) <= 0)) then
a.atk = ((D.rate or __NaN) * (0.85 + (g.rng() * 0.3)));
a.swing = 0.2;
M.hurt(g, tgt, D.dmg);
__push(g.events, "bite");
end;
else
local k = (((b.face or __NaN) + math.pi) + (__msin((a.slot or __NaN)) * 1.3));
local dist = (((b.r or __NaN) + (a.r or __NaN)) + 6);
if M.moveTo(a, ((b.x or __NaN) + (__mcos(k) * dist)), ((b.y or __NaN) + (__msin(k) * dist)), ((D.spd or __NaN) * 1.1), dt) then
a.moving = false;
end;
end;
M.clampArena(a);
end;
-- world:1753
M.applyLevels = function(g) 
local L = function(k) 
return (__T(g.lvl[k]) and g.lvl[k] or 0);
end;
local a = RT.host.JSON.parse(RT.host.JSON.stringify(M.ABIL));
a.swipe.dmg = ((a.swipe.dmg or __NaN) * (1 + (0.3 * L("swipe"))));
a.swipe.range = ((a.swipe.range or __NaN) + (3 * L("swipe")));
a.stomp.dmg = ((a.stomp.dmg or __NaN) * (1 + (0.3 * L("stomp"))));
a.stomp.range = ((a.stomp.range or __NaN) * (1 + (0.12 * L("stomp"))));
a.breath.dps = ((a.breath.dps or __NaN) * (1 + (0.3 * L("breath"))));
a.breath.dmg = ((a.breath.dmg or __NaN) * (1 + (0.3 * L("breath"))));
a.breath.range = ((a.breath.range or __NaN) * (1 + (0.15 * L("breath"))));
a.roar.range = ((a.roar.range or __NaN) * (1 + (0.15 * L("roar"))));
a.roar.fear = ((a.roar.fear or __NaN) + (0.6 * L("roar")));
a.tail.dmg = ((a.tail.dmg or __NaN) * (1 + (0.3 * L("tail"))));
a.tail.range = ((a.tail.range or __NaN) + (3 * L("tail")));
a.beam.dps = ((a.beam.dps or __NaN) * (1 + (0.35 * L("beam"))));
a.beam.range = ((a.beam.range or __NaN) * (1 + (0.2 * L("beam"))));
a.ice.range = ((a.ice.range or __NaN) * (1 + (0.25 * L("ice"))));
a.ice.life = ((a.ice.life or __NaN) + (2 * L("ice")));
a.charge.dmg = ((a.charge.dmg or __NaN) * (1 + (0.3 * L("charge"))));
a.charge.range = ((a.charge.range or __NaN) * (1 + (0.2 * L("charge"))));
a.charge.stun = ((a.charge.stun or __NaN) + (0.5 * L("charge")));
a.haste.time = ((a.haste.time or __NaN) + (1.5 * L("haste")));
a.haste.boost = ((a.haste.boost or __NaN) + (0.2 * L("haste")));
g.abil = a;
local b = g.boss;
local old = b.maxhp;
b.maxhp = (M.BOSS_HP * (1 + (0.25 * L("fur"))));
b.hp = __mmax(1, (((b.hp or __NaN) + (b.maxhp or __NaN)) - old));
end;
-- world:1771
M.abilityOffer = function(g, id) 
local it = __find(M.ABILITIES, function(a) 
return (a.id == id);
end);
local lvl = (__T(g.lvl[id]) and g.lvl[id] or 0);
local max = M.maxLevel(id);
if __T(it.passive) then
local cost;
if (lvl < max) then cost = __sarr(0, it.cost, 1, __slice(M.UP_COST, 1))[lvl]; else cost = nil; end;
do return {it=it, owned=(lvl > 0), lvl=lvl, max=max, buyCost=nil, upCost=cost, upText=it.up} end;
end;
local owned = __has(g.owned, id);
local upCost;
if (owned and (lvl < max)) then upCost = (__T(it.upCost) and it.upCost or M.UP_COST)[lvl]; else upCost = nil; end;
local upText;
if __T(it.ups) then upText = it.ups[lvl]; else upText = it.up; end;
do return {it=it, owned=owned, lvl=lvl, max=max, buyCost=(function() if owned then return nil; else return it.cost; end; end)(), upCost=upCost, upText=upText} end;
end;
-- world:1783
M.spend = function(g, n) 
if ((g.points or __NaN) < n) then
do return false end;
end;
g.points = ((g.points or __NaN) - n);
g.spent = ((g.spent or __NaN) + n);
do return true end;
end;
-- world:1789
M.buyAbility = function(g, id) 
local o = M.abilityOffer(g, id);
if ((o.buyCost == nil) or (not M.spend(g, o.buyCost))) then
do return false end;
end;
__add(g.owned, id);
local free = __indexOf(g.slots, nil);
if (free >= 0) then
g.slots[free] = id;
end;
do return true end;
end;
-- world:1798
M.upgradeAbility = function(g, id) 
local o = M.abilityOffer(g, id);
if ((o.upCost == nil) or (not M.spend(g, o.upCost))) then
do return false end;
end;
g.lvl[id] = ((__T(g.lvl[id]) and g.lvl[id] or 0) + 1);
M.applyLevels(g);
do return true end;
end;
-- world:1807
M.setSlot = function(g, i, id) 
if (__T(id) and (not __has(g.owned, id))) then
do return end;
end;
local j = (__T(id) and __indexOf(g.slots, id) or (-1));
if (j >= 0) then
g.slots[j] = g.slots[i];
end;
g.slots[i] = (__T(id) and id or nil);
end;
-- world:1819
M.createDemo = function(look) 
local d = M.createGame(7, look);
d.dir.final = true;
__assignKV(d.map, "plain", true, "A", {x=(-400), y=(-400)}, "B", {x=(-300), y=(-400)});
d.demo = {id="swipe", t=0, cycle=0};
do return d end;
end;
-- world:1828
M.demoSet = function(d, id, lvl, look) 
do
local __t186, __t187 = __it({[0]="units", "parties", "corpses", "ghosts", "fires", "ice", "bolts", "parts", "texts", "barks", "rings", "adds", "ashes", length=13}), 0;
while __t187 < __t186.length do
local k = __t186[__t187]; __t187 = __t187 + 1;
d[k] = {length=0};
end;
end;
local it = __find(M.ABILITIES, function(a) 
return (a.id == id);
end);
d.owned = __Set({[0]=id, "swipe", length=2});
d.lvl = {[id]=lvl};
d.slots = {[0]=(__T(it.passive) and "swipe" or id), nil, nil, nil, nil, length=5};
if __T(look) then
d.look = __assign({}, look);
end;
local b = d.boss;
b.hp = b.maxhp;
M.applyLevels(d);
__assignKV(b, "x", M.DEMO_AT.x, "y", M.DEMO_AT.y, "face", 0, "act", nil, "queue", nil, "haste", 0, "taunt", nil, "evade", nil, "dead", false, "hp", b.maxhp);
for __t190 in __pairs(b.cd) do
local k = __t190;
b.cd[k] = 0;
end;
d.demo = {id=id, t=0, cycle=0};
d.banner = nil;
d.thought = nil;
M.demoParty(d);
end;
-- world:1844
M.demoParty = function(d) 
local p = M.newParty(d, "dungeon");
p.power = 0.6;
local tail = (d.demo.id == "tail");
local comp = {[0]="warrior", "priest", "rogue", "mage", "hunter", length=5};
__forEach(comp, function(cls, i) 
local x = (tail and (30 + (i * 6)) or (200 + (i * 7)));
local y = (((M.DEMO_AT.y or __NaN) - 14) + (i * 7));
local u = M.mkUnit(d, p, cls, x, y);
u.slotA = ((u.role == "melee") and ((d.rng() - 0.5) * 1.2) or (math.pi + ((d.rng() - 0.5) * 1.2)));
u.slotD = ((u.role == "healer") and 50 or ((u.role == "ranged") and 42 or 2));
u.home = {x=x, y=y};
end);
end;
-- world:1858
M.demoStep = function(d, dt) 
local dm = d.demo;
local b = d.boss;
local id = dm.id;
dm.t = ((dm.t or __NaN) + dt);
local live = __filter(d.units, function(u) 
return ((not __T(u.dead)) and (not __T(u.gone)));
end);
if ((not (live.length ~= 0)) or __every(live, function(u) 
return (((((u.x or __NaN) < (-20)) or ((u.x or __NaN) > (M.W + 20))) or ((u.y or __NaN) < (-20))) or ((u.y or __NaN) > (M.H + 20)));
end)) then
if ((function() dm.gap = ((__T(dm.gap) and dm.gap or 0) + dt); return dm.gap end)() > 1.2) then
dm.gap = 0;
d.units = {length=0};
d.parties = {length=0};
M.demoParty(d);
end;
end;
b.hp = b.maxhp;
b.dead = false;
b.evade = nil;
local near = __reduce(live, function(a, u) 
if ((not __T(a)) or (__hypot(((u.x or __NaN) - (b.x or __NaN)), ((u.y or __NaN) - (b.y or __NaN))) < __hypot(((a.x or __NaN) - (b.x or __NaN)), ((a.y or __NaN) - (b.y or __NaN))))) then do return u end; else do return a end; end;
end, nil);
local aim = (__T(near) and {x=near.x, y=near.y} or {x=((b.x or __NaN) + 40), y=b.y});
local inp = {mx=aim.x, my=aim.y, ax=0, ay=0, press={}, hold={}};
local dist = (__T(near) and __hypot(((near.x or __NaN) - (b.x or __NaN)), ((near.y or __NaN) - (b.y or __NaN))) or 999);
local it = __find(M.ABILITIES, function(a) 
return (a.id == id);
end);
if (id == "tail") then
inp.mx = ((b.x or __NaN) + ((b.x or __NaN) - (aim.x or __NaN)));
inp.my = ((b.y or __NaN) + ((b.y or __NaN) - (aim.y or __NaN)));
end;
if (id == "haste") then
local k = ((__mfmod(__mfloor(((dm.t or __NaN) / 1.6)), 2) ~= 0) and (-1) or 1);
inp.ax = k;
inp.mx = ((b.x or __NaN) + (k * 30));
inp.my = b.y;
if (((b.haste or __NaN) <= 0) and (not __T(b.act))) then
b.cd.haste = 0;
inp.press.slot0 = true;
end;
if (__hypot(((b.x or __NaN) - (M.DEMO_AT.x or __NaN)), ((b.y or __NaN) - (M.DEMO_AT.y or __NaN))) > 70) then
inp.ax = __sign(((M.DEMO_AT.x or __NaN) - (b.x or __NaN)));
end;
elseif ((id == "swipe") or __T(it.passive)) then
if (dist < 34) then
inp.hold.slot0 = true;
end;
else
local ready = ((not __T(b.act)) and (((dm.t or __NaN) - (__T(dm.last) and dm.last or (-9))) > 3.2));
local range = __orv(({stomp=34, roar=70, breath=60, beam=160, ice=44, charge=60, summon=200, tail=30})[id], 40);
if (ready and (dist < range)) then
b.cd[id] = 0;
inp.press.slot0 = true;
dm.last = dm.t;
end;
end;
if (((not __T(b.act)) and (id ~= "haste")) and (__hypot(((b.x or __NaN) - (M.DEMO_AT.x or __NaN)), ((b.y or __NaN) - (M.DEMO_AT.y or __NaN))) > 6)) then
inp.ax = M.clamp((((M.DEMO_AT.x or __NaN) - (b.x or __NaN)) / 20), (-1), 1);
inp.ay = M.clamp((((M.DEMO_AT.y or __NaN) - (b.y or __NaN)) / 20), (-1), 1);
end;
M.step(d, inp, dt);
if ((d.adds.length or #d.adds) > 4) then
__splice(d.adds, 0, ((d.adds.length or #d.adds) - 4));
end;
__setlen(d.events, 0);
d.banner = nil;
d.thought = nil;
d.clear = nil;
d.store = false;
end;
-- world:1897
M.part = function(g, x, y, vx, vy, life, kind) 
if ((g.parts.length or #g.parts) < 400) then
__push(g.parts, {x=x, y=y, vx=vx, vy=vy, t=0, life=life, kind=kind});
end;
end;
-- world:1898
M.text = function(g, x, y, s, col, life) if life == nil then life = 1.1 end;
__push(g.texts, {x=x, y=y, s=s, col=col, t=0, life=life});
end;
-- world:1899
M.bark = function(g, u, s) 
g.barks = __filter(g.barks, function(k) 
return (k.u ~= u);
end);
if ((g.barks.length or #g.barks) >= 6) then
__shift(g.barks);
end;
__push(g.barks, {u=(function() if __T(u.dead) then return nil; else return u; end; end)(), x=u.x, y=u.y, s=s, t=0, life=2});
end;
-- world:1904
M.banner = function(g, s, sub, dur) if dur == nil then dur = 3.2 end;
g.banner = {s=s, sub=sub, t=0, dur=dur};
end;
-- world:1907
M.newGamePlus = function(prev, look) 
local g = M.createGame(nil, look);
g.ng = ((__T(prev.ng) and prev.ng or 0) + 1);
g.owned = __Set(prev.owned);
g.lvl = __assign({}, prev.lvl);
g.slots = __sarr(1, prev.slots);
M.applyLevels(g);
g.boss.hp = g.boss.maxhp;
do return g end;
end;
-- world:1925
M.createEnding = function(look) 
local e = M.createGame(11, look);
e.dir.final = true;
local A, B;
local __t191 = e.map; A = __t191.A; B = __t191.B;
__assignKV(e.boss, "x", (M.W - 8), "y", (M.H - 26), "face", (math.pi * 1.2));
e.lastMark = "A";
e["end"] = {wp={[0]={x=(M.W - 70), y=(M.H - 46)}, {x=((B.x or __NaN) + 40), y=((B.y or __NaN) + 22)}, length=2}, t=0, phase="walk", caption=M.ENDING_LINES[0][1], capT=0, hearts={length=0}, at=nil, done=false};
do return e end;
end;
-- world:1934
M.endingStep = function(e, dt) 
local en = e["end"];
local b = e.boss;
local A, B;
local __t192 = e.map; A = __t192.A; B = __t192.B;
en.t = ((en.t or __NaN) + dt);
en.capT = ((en.capT or __NaN) + dt);
local say = function(s) 
if (en.caption ~= s) then
en.caption = s;
en.capT = 0;
end;
end;
local heart = function(n) 
for i = 0, __mceil(n) - 1 do
__push(en.hearts, {x=((b.x or __NaN) + ((e.rng() - 0.5) * 18)), y=(((b.y or __NaN) - 8) - (e.rng() * 6)), vx=((e.rng() - 0.5) * 8), t=((-i) * 0.18)});
end;
end;
do
local __t194, __t195 = __it(en.hearts), 0;
while __t195 < __t194.length do
local h = __t194[__t195]; __t195 = __t195 + 1;
h.t = ((h.t or __NaN) + dt);
if ((h.t or __NaN) > 0) then
h.y = ((h.y or __NaN) - (9 * dt));
h.x = ((h.x or __NaN) + ((h.vx or __NaN) * dt));
end;
end;
end;
en.hearts = __filter(en.hearts, function(h) 
return ((h.t or __NaN) < 2.4);
end);
if (en.phase == "walk") then
do
local __t197, __t198 = __it(M.ENDING_LINES), 0;
while __t198 < __t197.length do
local __t200 = __t197[__t198]; __t198 = __t198 + 1; local t, s; t = __t200[0]; s = __t200[1];
if ((en.t or __NaN) >= t) then
say(s);
end;
end;
end;
end;
local inp = {mx=((b.x or __NaN) - 30), my=b.y, ax=0, ay=0, press={}, hold={}};
local go = function(p, side, pace) if pace == nil then pace = 1 end;
local tx = ((p.x or __NaN) + (side * 15));
local ty = ((p.y or __NaN) + 3);
local dx = (tx - (b.x or __NaN));
local dy = (ty - (b.y or __NaN));
local d = __hypot(dx, dy);
if (d < 2) then
do return true end;
end;
inp.ax = ((dx / __mmax(d, 8)) * pace);
inp.ay = ((dy / __mmax(d, 8)) * pace);
inp.mx = ((b.x or __NaN) + dx);
inp.my = ((b.y or __NaN) + dy);
do return false end;
end;
local look = function(p) 
inp.mx = p.x;
inp.my = p.y;
end;
if (en.phase == "walk") then
if ((en.wp.length or #en.wp) ~= 0) then
if go(en.wp[0], 0, 0.55) then
__shift(en.wp);
end;
elseif go(B, 1, 0.7) then
en.phase = "other";
en.at = en.t;
e.lastMark = "B";
say("OTHER ROCK!");
heart(6);
inp.press.shake = true;
__push(e.events, "buy");
end;
elseif (en.phase == "other") then
look(B);
if (((en.t or __NaN) - (en.at or __NaN)) > 2.6) then
en.phase = "cross";
say("NOW, WHERE IS...");
end;
elseif (en.phase == "cross") then
b.haste = 0.5;
if go(A, (-1)) then
b.haste = 0;
en.phase = "rock";
en.at = en.t;
e.lastMark = "A";
say("ROCK!!");
heart(9);
inp.press.shake = true;
__push(e.events, "buy");
end;
elseif (en.phase == "rock") then
look(A);
if (((en.t or __NaN) - (en.at or __NaN)) > 2.6) then
en.phase = "home";
en.at = en.t;
say("TOGETHER AGAIN. AS IT SHOULD BE.");
end;
elseif (en.phase == "home") then
local mid = {x=(((A.x or __NaN) + (B.x or __NaN)) / 2), y=((A.y or __NaN) + 14)};
local dx = ((mid.x or __NaN) - (b.x or __NaN));
local dy = ((mid.y or __NaN) - (b.y or __NaN));
local d = __hypot(dx, dy);
if (d > 2) then
inp.ax = (dx / __mmax(d, 8));
inp.ay = (dy / __mmax(d, 8));
inp.mx = ((b.x or __NaN) + dx);
inp.my = ((b.y or __NaN) + dy);
else
inp.mx = b.x;
inp.my = ((b.y or __NaN) + 30);
end;
if (__mfloor((((en.t or __NaN) - (en.at or __NaN)) / 1.4)) ~= __mfloor(((((en.t or __NaN) - (en.at or __NaN)) - dt) / 1.4))) then
heart(2);
end;
if (((en.t or __NaN) - (en.at or __NaN)) > 5.5) then
say("THE END. (CLOCK IN AGAIN?)");
end;
if (((en.t or __NaN) - (en.at or __NaN)) > 8.5) then
en.done = true;
end;
end;
M.step(e, inp, dt);
b.hp = b.maxhp;
__setlen(e.texts, 0);
e.thought = nil;
e.banner = nil;
__setlen(e.barks, 0);
do return (not __T(en.done)) end;
end;

-- world:8
M.W = 320;
M.H = 180;
-- world:9
M.LANE = 11;
-- world:10
M.LEASH = 60;
-- world:11
M.ROCK_R = 4;
-- world:12
M.TOUCH = 17;
-- world:13
M.ARENA = {x0=5, y0=16, x1=(M.W - 5), y1=(M.H - 20)};
-- world:14
M.BOSS_HP = 4000;
M.BOSS_SPEED = 23;
M.BOSS_R = 10;
-- world:15
M.MULT_STEP = 0.25;
M.MULT_MAX = 5;
-- world:16
M.RAID_LAPS = 10;
M.FINAL_LAPS = 20;
-- world:17
M.SLOT_KEYS = {[0]="LMB", "RMB", "Q", "E", "R", length=5};
-- world:20
M.ABIL = {swipe={cd=0.7, wind=0.22, dur=0.14, move=0.55, range=28, arc=2, dmg=110, kb=16}, stomp={cd=4.5, wind=0.85, dur=0.2, move=0, range=37, dmg=190, kb=30}, breath={cd=9, wind=0.45, dur=1.7, move=0.3, range=74, arc=0.8, dmg=40, dps=95}, roar={cd=16, wind=0.35, dur=0.45, move=0, range=92, fear=3.2}, shake={cd=0.32, wind=0, dur=0.3, move=0, range=16, kb=12}, tail={cd=3.2, wind=0.3, dur=0.16, move=0.4, range=28, arc=2.3, dmg=120, kb=26, back=true}, summon={cd=18, wind=0.5, dur=0.3, move=0}, beam={cd=14, wind=0.9, dur=1.4, move=0, range=170, width=5, dps=260}, ice={cd=12, wind=0.3, dur=0.2, move=0.3, range=42, life=7}, charge={cd=8, wind=0.35, dur=4, move=0, range=52, width=11, dmg=100, kb=20, speed=150, stun=1.6}, haste={cd=15, wind=0, dur=0.1, move=1, time=4, boost=0.8}};
-- world:35
M.ABILITIES = {[0]={id="swipe", name="Swipe", start=true, desc="Claw a wide arc in front of you. Hold the button to keep swiping.", up="+30% damage, longer reach"}, {id="stomp", name="Stomp", start=true, desc="Slam the ground and hit everyone around you.", up="+30% damage, 12% wider"}, {id="breath", name="Fire Breath", start=true, desc="A cone of fire that leaves the ground burning.", up="+30% damage, 15% farther"}, {id="roar", name="Roar", start=true, desc="Everyone nearby runs away screaming.", up="15% farther, fear lasts longer"}, {id="summon", name="Call Adds", cost=12000, desc="Summon two Gnashers: melee adds that run down heroes and bite.", ups={[0]="Casters instead: two Spitters that spit fire from beside the path", "A Necromancer instead, who raises dead heroes as skeletons", length=2}, upCost={[0]=25000, 40000, length=2}}, {id="beam", name="Lightning Beam", cost=20000, desc="Charge up, then fire a huge beam of lightning across the map. Steer it with the mouse.", up="+35% damage, 20% longer"}, {id="ice", name="Ice Floor", cost=10000, desc="Coat the ground around you in ice. Heroes on it slow to a shuffle.", up="25% wider, lasts 2 s longer"}, {id="charge", name="Stun Charge", cost=12000, desc="Lunge forward, stunning everyone you hit, then back up to where you started.", up="+30% damage, 20% farther, longer stun"}, {id="haste", name="Zoomies", cost=8000, desc="Run 80% faster for a few seconds. More path, more points.", up="Lasts 1.5 s longer, 20% faster"}, {id="tail", name="Tail Sweep", cost=9000, desc="Sweep your tail through everyone standing behind you.", up="+30% damage, longer reach"}, {id="fur", name="Thicker Fur", passive=true, cost=6000, desc="Not an ability. +25% max health, permanently.", up="+25% max health"}, length=11};
-- world:49
M.UP_COST = {[0]=16000, 24000, 38000, length=3};
-- world:53
M.LOOKS = {head={[0]="Snout", "Cyclops", "Croc snout", "Turtle beak", "Bird beak", length=5}, horns={[0]="Bull horns", "Ram curls", "Antlers", "No horns", length=4}, neck={[0]="Bare", "Lion mane", "Spiked collar", "Long neck", "Frill", length=5}, back={[0]="Shag", "Dorsal plates", "Shell", "Mushrooms", "Bat wings", length=5}, tail={[0]="Tuft", "Club", "Stinger", "Whip", "Fox brush", length=5}, limbs={[0]="Claws", "Hooves", "Talons", "Tentacles", length=4}, legs={[0]="Four legs", "Six legs", "Eight legs", length=3}, marker={[0]="Sparkles", "Black hole", "TomTom arrow", "Victim on a cross", "Disco ball", length=5}};
-- world:64
M.ADDS = {gnasher={name="GNASHER", hp=160, r=2.5, spd=36, dmg=26, rate=0.8, reach=4, sense=80}, spitter={name="SPITTER", hp=140, r=3, spd=0, dmg=34, rate=1.5, reach=70, sense=70}, necro={name="NECROMANCER", hp=220, r=3, spd=26, dmg=22, rate=2, reach=70, sense=70}, skeleton={name="SKELETON", hp=80, r=2, spd=30, dmg=14, rate=0.9, reach=4, sense=70}};
-- world:70
M.MAX_ADDS = 8;
M.MAX_SKELETONS = 10;
do
do
local __t1, __t2 = __it(__I2.LEVELS), 0;
while __t2 < __t1.length do
local L = __t1[__t2]; __t2 = __t2 + 1;
__I0.registerKinds(L.kinds, L.critters);
__assign(M.ADDS, (__T(L.adds) and L.adds or {}));
end;
end;
end;
-- world:74
M.CLASS = {warrior={role="tank", col="steel", hp=460, spd=25, dmg=14, rate=1.2}, priest={role="healer", col="white", hp=70, spd=26, heal=34, rate=1.7}, druid={role="healer", col="orange", hp=80, spd=26, heal=28, rate=1.5}, rogue={role="melee", col="yellow", hp=85, spd=28, dmg=7, rate=0.9}, berserker={role="melee", col="red", hp=95, spd=27, dmg=8, rate=1.1}, paladin={role="melee", col="pink", hp=120, spd=25, dmg=7, rate=1.1}, mage={role="ranged", col="blue", hp=70, spd=26, dmg=13, rate=1.8, bolt="frost"}, warlock={role="ranged", col="purple", hp=75, spd=25, dmg=12, rate=1.6, bolt="shadow"}, hunter={role="ranged", col="green", hp=80, spd=27, dmg=9, rate=1.3, bolt="arrow"}, pet={role="pet", col="brown", hp=40, spd=40, dmg=2, rate=0.9}, rider={role="rider", col="tan", hp=100, spd=30, dmg=100, rate=1.1}, king={role="king", col="gold", hp=30, spd=14, rate=(0/0)}};
-- world:89
M.SKILL = {raid={react=0.24, dodge=0.88, fire=0.06}, dungeon={react=0.55, dodge=0.6, fire=0.3}, rider={react=0.22, dodge=0.85, fire=0}};
-- world:94
M.PTS = {raid=30, dungeon=60, pet=10, rider=1500};
-- world:95
M.WIPE = {raid=3000, dungeon=400, final=8000};
-- world:96
M.ENGAGE_R = 80;
-- world:97
M.SIGIL = {x=(-4), y=0};
-- world:98
M.HORSE_SPD = 64;
-- world:100
M.THEMES = {[0]={id="clearing", name="THE CLEARING"}, {id="autumn", name="THE AUTUMN WOOD"}, {id="ash", name="THE ASHLANDS"}, {id="snow", name="THE SNOWFIELD"}, length=4};
-- world:106
M.NG_HP = 0.6;
M.NG_HIT = 0.4;
M.NG_PACE = 0.25;
-- world:108
M.BOSS_NAMES = {[0]="GORMUND THE UNBOTHERED", "OLD BRISTLES", "GRUBB, WARDEN OF TWO ROCKS", "HAROLD", "MORVAK THE AMBLING", "THE PACING ONE", "BIG LOUIS", "UNGOR, WHO WALKS", "MIKE", length=9};
-- world:112
M.BARK = {raidIdle={[0]="HEALERS READY?", "BUFFS PLS", "DONT PULL", "WHO HAS FOOD", "ONE SEC DOG", "READY CHECK", "AFK 1 MIN", "IS IT TANK SWAP?", "INV PLS", "SUMMON PLS", "LOOT RULES?", "DKP OR ROLLS", "LINK THE GUIDE", "MOM SAYS DINNER", "IS THIS TRASH?", "WHO PULLS", "DISCORD UP?", "PUSH TO TALK PLS", "WHOS BREATHING", "MUTE YOUR MIC", "RES THE HUNTER", "GEAR CHECK", "IM ONLY 2K GS", "FLASKS ON", length=24}, raidFight={[0]="DPS!!", "HEAL TANK", "PUMP", "NICE", "KEEP DPS", "STAY BEHIND", "LUST?", "WE GOT THIS", "DONT PANIC", "MELEE BEHIND", "POP CDS", "PARSE CHECK", "IM OOM", "HEALZ", "TANK DIED???", "WHO IS ON ADDS", "STOP TAKING AGGRO", "SEND IT", "BOP IT", "HUNTER WHY", "TOP METER LOL", "SOAK IT", "CLIP THAT", "FOCUS", "HOLD THREAT", "ROTATION", "GREED ROLL", length=27}, stomp={[0]="SPREAD!", "MOVE OUT", "OUT OUT OUT", "STOMP!", length=4}, frontal={[0]="FRONTAL!", "DODGE", "BREATH!", "SIDESTEP", length=4}, beam={[0]="BEAM!!", "LOS IT!", "GET BEHIND", "WHAT IS THAT", "GODZILLA??", length=5}, roar={[0]="FEAR!", "AAAA", "NOT AGAIN", "TREMOR?", length=4}, fire={[0]="ITS WARM", "LOL", "IM FINE", "OOPS", "THIS IS FINE", length=5}, ice={[0]="ICE!", "CANT MOVE", "SLIPPY", "MY KNEES", "SNARED", length=5}, adds={[0]="ADDS!", "SWITCH TO ADDS", "KILL THE ADDS", "ADDS ADDS ADDS", "WHO IS ON ADDS", "AOE THEM", "IGNORE ADDS", "PET TANK ADDS", length=8}, execute={[0]="EXECUTE PHASE", "ALMOST DEAD", "DONT DIE NOW", "BURN IT", "POP EVERYTHING", "LAST PHASE?", "IT HAS 10%", length=7}, died={[0]="REZ PLS", "LAG", "WTF", "RIP", "I WAS MOVING", "REZ?", "TANK??", "MY CAT", "HEALS??", "UNLUCKY", "BUGGED", "I WAS AFK", "NO HEALS", "GG", "SPIRIT REZ?", "CORPSE RUN", "NERF IT", "MY PING", length=18}, pull={[0]="WHO PULLED", "WTF", "GO GO GO", "PULLED!", "OK WE GO", "LEEROY?", "SOMEONE PULLED", "BRUH", length=8}, evade={[0]="EVADE BUG?", "IT RESET LOL", "KITE IT BACK", "LEASHED", "REALLY?", "EXPLOIT??", "REPORTED", length=7}, flee={[0]="WIPE IT!", "RUN!", "RUN OUT", "RELEASE?", "ABANDON", "SAVE REPAIRS", length=6}, dance={[0]="GG", "EZ", "LOOT!", "NEED", "/DANCE", "GZ", "FUR IS MINE", "ROLL NEED", "FIRST TRY", "SCREENSHOT", "GIT GUD", length=11}, dungeonIdle={[0]="GOGO", "PULL?", "MANA", "K", "WAIT", "ONE MORE", "LOL", "LFG", "NEED TANK", "SPEEDRUN?", "SKIP TRASH?", "FIRST TIME BTW", "SWEATY", "WHO IS LEADER", "R U A BOT", "GG EZ", "KEYS?", "NEW HERE", length=18}, dungeonFight={[0]="TANK??", "HEAL PLS", "LOL", "OMG", "SRY", "AGGRO", "OOM", "NICE", "HEALER WHY", "KICK HUNTER", "GIT GUD", "RIP BOZO", "NERF THIS", "PATCH WHEN", "ITS BUGGED", "L", "RATIO", "SKILL ISSUE", "TOUCH GRASS", "COPE", "MAIN CHARACTER", length=21}, pet={[0]="PET!!!", "HUNTER WTF", "PET PULLED", "SORRY PET", "TURN PET OFF", "GROWL OFF PLS", length=6}, logoff={[0]="BRB", "GTG", "LOGGING", "NOPE", "CYA", "BEDTIME", "WORK TMRW", "DC", length=8}, reset={[0]="BACK TO POSTS", "LEASH IT", "RESET", "HOLD THE TOWER", "NOT OUR JOB", "GUARD DUTY", length=6}, king={[0]="GUARDS!", "NOT THE FACE", "I AM THE KING", "SOMEONE DO SOMETHING", "MY ARMOUR!", "I PAY YOU PEOPLE", "PROTECT ME", length=7}, wreckThoughts={[0]="SMASH.", "VENGEANCE...", "MINE NOW", "NO MORE ROCKS", "*SNIFF* SMOKE", "WHO BUILT THIS", "TOO MANY HOUSES", "HM. FLAMMABLE", "THEY STARTED IT", length=9}, thoughts={[0]="HM.", "*SNIFF*", "NICE ROCK", "OTHER ROCK", "PATROL...", "WHERE WAS I", "*YAWN*", "THIS WAY", "NO, THIS WAY", "GOOD PATH", "...", length=11}};
-- world:145
M.TAU = (math.pi * 2);
-- world:146
M.clamp = function(v, a, b) 
if (v < a) then do return a end; elseif (v > b) then do return b end; else do return v end; end;
end;
-- world:147
M.angDiff = function(a, b) 
local d = __mfmod((a - b), M.TAU);
if (d > math.pi) then
d = (d - M.TAU);
end;
if (d < (-math.pi)) then
d = (d + M.TAU);
end;
do return d end;
end;
-- world:148
M.turnToward = function(a, target, max) 
return (a + M.clamp(M.angDiff(target, a), (-max), max));
end;
-- world:159
M.makeRng = M.mulberry32;
-- world:160
M.pick = function(g, arr) 
return arr[__mfloor((g.rng() * (arr.length or #arr)))];
end;
-- world:162
M.AR = M.ARENA;
-- world:163
M.V = {x=0, y=0};
-- world:229
M.destRock = function(g) 
if (g.lastMark == "A") then do return g.map.B end; else do return g.map.A end; end;
end;
-- world:268
M.ARRAYS = {[0]="units", "parties", "corpses", "ghosts", "fires", "ice", "bolts", "parts", "texts", "barks", "rings", "adds", "steps", "props", "critters", "ashes", length=16};
-- world:317
M.isLastLevel = function(g) 
return ((g.map.n or __NaN) >= __I2.lastLevel());
end;
do
__I0.setWorldApi({addScore=M.addScore, text=M.text, part=M.part, hurt=function(g, u, a) 
return M.hurt(g, u, a);
end, sound=M.sound, vengeance=M.vengeance, chaos=M.addChaos});
end;
-- world:383
M.LAPI = {endLevel=function(g, title, sub) 
return M.levelCleared(g, title, sub);
end, win=function(g) 
return M.winGame(g);
end, banner=function(g, s, sub, d) 
return M.banner(g, s, sub, d);
end, text=M.text, part=M.part, addScore=M.addScore, vengeance=M.vengeance, sound=M.sound, spawnRaid=function(g, size) 
return M.spawnRaid(g, size);
end, spawnDungeon=function(g) 
return M.spawnDungeon(g);
end, addAdd=function(g, kind, x, y) 
return M.spawnAdd(g, kind, x, y);
end, hurtUnit=function(g, u, a) 
return M.hurt(g, u, a);
end, flee=function(g) 
return M.sendHome(g);
end, walkOff=function(g, o) 
return M.walkOff(g, o);
end, garrison=function(g, o) 
return M.garrison(g, o);
end, king=function(g, o) 
return M.spawnKing(g, o);
end, scatter=function(g, p) 
return M.scatter(g, p);
end, bark=function(g, u, s) 
return M.bark(g, u, s);
end, alive=function(p) 
return M.alive(p);
end};
-- world:764
M.zoneFace = function(g, k) 
return ((g.boss.face or __NaN) + (__T(g.abil[k].back) and math.pi or 0));
end;
-- world:988
M.alive = function(p) 
return __filter(p.units, function(u) 
return ((not __T(u.dead)) and (not __T(u.gone)));
end);
end;
-- world:1174
M.hittable = function(u) 
return (((not __T(u.dead)) and (not __T(u.gone))) and (not ((u.role == "rider") and (u.state == "climb"))));
end;
-- world:1750
M.maxLevel = function(id) 
return ((id == "summon") and 2 or 3);
end;
-- world:1818
M.DEMO_AT = {x=110, y=96};
-- world:1920
M.ENDING_LINES = {[0]={[0]=0, "THE KINGDOM IS RUBBLE.", length=2}, {[0]=2.8, "THE HEROES HAVE ALL LOGGED OFF.", length=2}, {[0]=5.6, "AND AT LAST, THE LONG WALK HOME.", length=2}, length=3};
