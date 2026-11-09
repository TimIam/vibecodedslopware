-- Generated from the-endgame-is-me/js/save.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("save");
local __I0 = RT.module("levels/index");
local __I1 = RT.module("world");
local __Error, __Map, __Number, __Set, __T, __add, __ch, __forEach, __get, __indexOf, __isArray, __isFinite, __isfn, __isobj, __it, __map, __objKeys, __pairs, __push, __sarr, __set, __seti, __str, __throw, __type = RT["Error"], RT["Map"], RT["Number"], RT["Set"], RT["T"], RT["add"], RT["ch"], RT["forEach"], RT["get"], RT["indexOf"], RT["isArray"], RT["isFinite"], RT["isfn"], RT["isobj"], RT["it"], RT["map"], RT["objKeys"], pairs, RT["push"], RT["sarr"], RT["set"], RT["seti"], RT["str"], RT["throw"], type;

-- toB64: replaced by the build
M.toB64 = function(a) return RT.packTyped(a) end;
-- fromB64: replaced by the build
M.fromB64 = function(name, s) return RT.unpackTyped(name, s) end;
-- save:25
M.pack = function(root) 
local fn, val, node;
local ids = __Map();
local nodes = {length=0};
fn = function(f) 
if __T(f.rngState) then
do return {[0]="r", f.rngState(), length=2} end;
end;
for i = 0, (__I0.LEVELS.length or #__I0.LEVELS) - 1 do
for __t3 in __pairs(__I0.LEVELS[i]) do
local k = __t3;
if (__I0.LEVELS[i][k] == f) then
do return {[0]="f", i, k, length=3} end;
end;
end;
end;
__throw(__Error("cannot save a function"));
end;
val = function(v) 
if (__type(v) == "number") then
if __isFinite(v) then do return v end; else do return {[0]="n", __str(v), length=2} end; end;
end;
if (v == nil) then
do return {[0]="u", length=1} end;
end;
if __isfn(v) then
do return fn(v) end;
end;
if ((v == nil) or (not __isobj(v))) then
do return v end;
end;
local level = __indexOf(__I0.LEVELS, v);
if (level >= 0) then
do return {[0]="l", level, length=2} end;
end;
local id = __get(ids, v);
if (id ~= nil) then
do return {[0]=id, length=1} end;
end;
id = nodes.length;
__set(ids, v, id);
__push(nodes, nil);
__seti(nodes, id, node(v));
do return {[0]=id, length=1} end;
end;
node = function(o) 
if __T(o.__ta) then
do return {[0]="t", o.__ta, M.toB64(o), length=3} end;
end;
if __isArray(o) then
do return {[0]="a", __map(o, val), length=2} end;
end;
if (__isobj(o) and o.__set == true) then
do return {[0]="s", __map(__sarr(1, o), val), length=2} end;
end;
if (__isobj(o) and o.__map == true) then
do return {[0]="m", __map(__sarr(1, o), function(__t4) local k, v; k = __t4[0]; v = __t4[1];
return {[0]=val(k), val(v), length=2};
end), length=2} end;
end;
local out = {};
do
local __t5, __t6 = __it(__objKeys(o)), 0;
while __t6 < __t5.length do
local k = __t5[__t6]; __t6 = __t6 + 1;
out[k] = val(o[k]);
end;
end;
do return {[0]="o", out, length=2} end;
end;
val(root);
do return nodes end;
end;
-- save:60
M.unpack = function(nodes) 
local made = __map(nodes, function(n) 
do
local __t8 = n[0];
if __t8 == "a" then
do return {length=0} end;
elseif __t8 == "s" then
do return __Set() end;
elseif __t8 == "m" then
do return __Map() end;
elseif __t8 == "t" then
do return M.fromB64(n[1], n[2]) end;
else
do return {} end;
end;
end;
end);
local val = function(v) 
if (not __isArray(v)) then
do return v end;
end;
if (__type(v[0]) == "number") then
do return made[v[0]] end;
end;
do
local __t9 = v[0];
if __t9 == "u" then
do return nil end;
elseif __t9 == "n" then
do return __Number(v[1]) end;
elseif __t9 == "r" then
do return __I1.makeRng(v[1]) end;
elseif __t9 == "l" then
do return __I0.LEVELS[v[1]] end;
elseif __t9 == "f" then
do return __I0.LEVELS[v[1]][v[2]] end;
end;
end;
__throw(__Error("bad save"));
end;
__forEach(nodes, function(n, i) 
local o = made[i];
if (__ch(n, 0) == "a") then
__forEach(n[1], function(v) 
return __push(o, val(v));
end);
elseif (__ch(n, 0) == "s") then
__forEach(n[1], function(v) 
return __add(o, val(v));
end);
elseif (__ch(n, 0) == "m") then
__forEach(n[1], function(__t10) local k, v; k = __t10[0]; v = __t10[1];
return __set(o, val(k), val(v));
end);
elseif (__ch(n, 0) == "o") then
for __t12 in __pairs(n[1]) do
local k = __t12;
o[k] = val(n[1][k]);
end;
end;
end);
do return made[0] end;
end;
-- writeSave: replaced by the build

-- saveInfo: replaced by the build

-- readSave: replaced by the build

-- clearSave: replaced by the build

-- unlockPlus: replaced by the build

-- plusData: replaced by the build


-- save:8
M.KEY = "bosshours.save.v1";
M.META = "bosshours.save.meta.v1";
M.PLUS = "bosshours.plus.v1";
-- save:10
M.TYPED = {Float32Array="Float32Array", Float64Array="Float64Array", Uint8Array="Uint8Array", Uint16Array="Uint16Array", Int16Array="Int16Array", Int32Array="Int32Array", Uint32Array="Uint32Array"};
