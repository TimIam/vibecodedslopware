-- Generated from the-endgame-is-me/js/levels/index.js by tools/build.mjs. Do not edit; edit the game and rebuild.
local ADDON, ns = ...;
local RT = ns.RT;
local M = RT.module("levels/index");
local __I0 = RT.module("levels/clearing");
local __I1 = RT.module("levels/forest");
local __I2 = RT.module("levels/farms");
local __I3 = RT.module("levels/village");
local __I4 = RT.module("levels/wall");
local __I5 = RT.module("levels/city");
local __I6 = RT.module("levels/castle");
local __mmin = math.min;


-- levels/index:21
M.LEVELS = {[0]=__I0.default, __I1.default, __I2.default, __I3.default, __I4.default, __I5.default, __I6.default, length=7};
-- levels/index:23
M.levelFor = function(n) 
return M.LEVELS[(__mmin(n, M.LEVELS.length) - 1)];
end;
-- levels/index:24
M.lastLevel = function() 
return M.LEVELS.length;
end;
