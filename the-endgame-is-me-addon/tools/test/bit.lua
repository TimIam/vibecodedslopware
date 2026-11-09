-- A pure-Lua stand-in for WoW's `bit` library (unsigned 32-bit results), for running the addon's Lua outside the game.
local floor = math.floor
local AND, OR, XOR = {}, {}, {}
for a = 0, 15 do
  for b = 0, 15 do
    local x, o, r = 0, 0, 0
    for i = 0, 3 do
      local p = 2 ^ i
      local ba, bb = floor(a / p) % 2, floor(b / p) % 2
      if ba == 1 and bb == 1 then x = x + p end
      if ba == 1 or bb == 1 then o = o + p end
      if ba ~= bb then r = r + p end
    end
    AND[a * 16 + b], OR[a * 16 + b], XOR[a * 16 + b] = x, o, r
  end
end
local function op(tab)
  return function(a, b)
    a, b = a % 4294967296, b % 4294967296
    local out, p = 0, 1
    for _ = 1, 8 do
      out = out + tab[(a % 16) * 16 + b % 16] * p
      a, b, p = floor(a / 16), floor(b / 16), p * 16
    end
    return out
  end
end
return {
  band = op(AND), bor = op(OR), bxor = op(XOR),
  bnot = function(a) return 4294967295 - a % 4294967296 end,
  lshift = function(a, n) return (a % 4294967296 * 2 ^ n) % 4294967296 end,
  rshift = function(a, n) return floor(a % 4294967296 / 2 ^ n) end,
}
