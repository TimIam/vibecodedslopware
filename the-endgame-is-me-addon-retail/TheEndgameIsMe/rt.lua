-- The Endgame is Me: the JavaScript runtime the transpiled game modules lean on.
-- Arrays are zero-based tables with an explicit `length` field, so a[i] means the same thing in both languages.
-- Nothing here touches the WoW API; it runs under plain Lua 5.1 for the headless tests.

local ADDON, ns = ...
local RT = {}
ns.RT = RT

local floor, ceil, sqrt, huge, abs = math.floor, math.ceil, math.sqrt, math.huge, math.abs
local type, tostring, tonumber, select, pairs, rawget, setmetatable, getmetatable = type, tostring, tonumber, select, pairs, rawget, setmetatable, getmetatable
local sfind, ssub, sformat, sbyte, schar, srep, supper, slower = string.find, string.sub, string.format, string.byte, string.char, string.rep, string.upper, string.lower
local unpack = unpack or table.unpack
local bit = bit or ns.bit
local band, bor, bxor, lshift, rshift = bit.band, bit.bor, bit.bxor, bit.lshift, bit.rshift

RT.modules = {}
function RT.module(name)
  local m = RT.modules[name]
  if not m then m = {}; RT.modules[name] = m end
  return m
end

-- ------------------------------------------------------------------------------------------------ truth and text

-- JS truthiness: nil, false, 0 and '' are false
local function T(v) return v and v ~= 0 and v ~= "" end
RT.T = T

local function str(v)
  local t = type(v)
  if t == "string" then return v end
  if t == "number" then
    if v ~= v then return "NaN" end
    if v == huge then return "Infinity" elseif v == -huge then return "-Infinity" end
    if v == floor(v) and abs(v) < 1e15 then return sformat("%.0f", v) end
    local s = sformat("%.15g", v)
    if tonumber(s) ~= v then s = sformat("%.17g", v) end
    return s
  end
  if v == nil then return "undefined" end
  if t == "boolean" then return v and "true" or "false" end
  if t == "table" then
    if v.length ~= nil and not v.__set and not v.__map then return RT.join(v, ",") end
    if v.message then return "Error: " .. str(v.message) end
    return "[object Object]"
  end
  return tostring(v)
end
RT.str = str

function RT.isfn(v)
  local t = type(v)
  if t == "function" then return true end
  if t == "table" then local mt = getmetatable(v); return mt ~= nil and mt.__call ~= nil end
  return false
end
function RT.isobj(v) return type(v) == "table" and not RT.isfn(v) end
function RT.typeof(v)
  local t = type(v)
  if t == "nil" then return "undefined" end
  if t == "table" then return RT.isfn(v) and "function" or "object" end
  return t
end

-- ------------------------------------------------------------------------------------------------ numbers

local P32 = 4294967296
local function u32(x)
  if x ~= x or x == huge or x == -huge then return 0 end
  if x < 0 then x = ceil(x) else x = floor(x) end
  return x % P32
end
local function i32(x)
  x = u32(x)
  if x >= 2147483648 then return x - P32 end
  return x
end
RT.u32, RT.i32 = u32, i32
function RT.band(a, b) return i32(band(u32(a), u32(b)) % P32) end
function RT.bor(a, b) return i32(bor(u32(a), u32(b)) % P32) end
function RT.bxor(a, b) return i32(bxor(u32(a), u32(b)) % P32) end
function RT.bnot(a) return i32(P32 - 1 - u32(a)) end
function RT.shl(a, n) return i32((u32(a) * 2 ^ (u32(n) % 32)) % P32) end
function RT.shr(a, n) return floor(i32(a) / 2 ^ (u32(n) % 32)) end
function RT.ushr(a, n) return floor(u32(a) / 2 ^ (u32(n) % 32)) end
local function imul(a, b)
  a, b = u32(a), u32(b)
  local ah, al = floor(a / 65536), a % 65536
  local bh, bl = floor(b / 65536), b % 65536
  return i32(al * bl + ((ah * bl + al * bh) % 65536) * 65536)
end
RT.imul = imul

function RT.hypot(a, b, c)
  if c then return sqrt(a * a + b * b + c * c) end
  return sqrt(a * a + b * b)
end
function RT.sign(x) if x > 0 then return 1 elseif x < 0 then return -1 end return x end
function RT.round(x) return floor(x + 0.5) end
function RT.trunc(x) if x < 0 then return ceil(x) end return floor(x) end
function RT.tanh(x)
  if x > 20 then return 1 elseif x < -20 then return -1 end
  local e = math.exp(2 * x)
  return (e - 1) / (e + 1)
end
function RT.isFinite(x) return type(x) == "number" and x == x and x ~= huge and x ~= -huge end
function RT.isInteger(x) return RT.isFinite(x) and x == floor(x) end
function RT.Number(v)
  local t = type(v)
  if t == "number" then return v end
  if t == "string" then
    if v == "" then return 0 end
    if v == "Infinity" then return huge elseif v == "-Infinity" then return -huge end
    return tonumber(v) or (0 / 0)
  end
  if t == "boolean" then return v and 1 or 0 end
  if v == nil then return 0 / 0 end
  return 0 / 0
end
function RT.parseInt(s, radix)
  s = str(s)
  local neg = false
  local digits = s:match("^%s*([%-+]?%w+)")
  if not digits then return 0 / 0 end
  if digits:sub(1, 1) == "-" then neg = true; digits = digits:sub(2) elseif digits:sub(1, 1) == "+" then digits = digits:sub(2) end
  local n = tonumber(digits, radix or 10)
  if not n then
    -- parse as many leading digits as are valid
    local ok
    for i = #digits - 1, 1, -1 do ok = tonumber(digits:sub(1, i), radix or 10); if ok then break end end
    if not ok then return 0 / 0 end
    n = ok
  end
  return neg and -n or n
end
function RT.parseFloat(s) return tonumber((str(s):match("^%s*([%-+]?[%d%.]+[eE]?[%-+]?%d*)"))) or (0 / 0) end
function RT.toFixed(x, n) return sformat("%." .. (n or 0) .. "f", x) end
local DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"
function RT.toString(x, radix)
  if type(x) ~= "number" or not radix or radix == 10 then return str(x) end
  local neg = x < 0
  x = floor(abs(x))
  if x == 0 then return "0" end
  local s = ""
  while x > 0 do local d = x % radix; s = ssub(DIGITS, d + 1, d + 1) .. s; x = floor(x / radix) end
  return neg and "-" .. s or s
end

-- mulberry32, the game's dice. A callable table, because the save code asks it for rngState().
local RNG_MT = {}
function RT.mulberry32(seed)
  local a = u32(seed or 0)
  local o = {}
  o.rngState = function() return i32(a) end
  o.next = function()
    a = (a + 0x6D2B79F5) % P32
    local t = imul(bxor(a, rshift(a, 15)) % P32, bor(1, a) % P32)
    t = u32(t)
    local t2 = (t + u32(imul(bxor(t, rshift(t, 7)) % P32, bor(61, t) % P32))) % P32
    t = bxor(t2, t) % P32
    return (bxor(t, rshift(t, 14)) % P32) / P32
  end
  return setmetatable(o, RNG_MT)
end
RNG_MT.__call = function(self) return self.next() end

-- ------------------------------------------------------------------------------------------------ arrays

local function arr(...)
  local n = select("#", ...)
  local a = { length = n }
  for i = 1, n do a[i - 1] = (select(i, ...)) end
  return a
end
RT.arr = arr
RT.pack = arr
function RT.unpack(a) return unpack(a, 0, a.length - 1) end

function RT.Array(n)
  local a = { length = n or 0 }
  return a
end
function RT.typed(name, src)
  local a = { __ta = name }
  if type(src) == "number" then
    a.length = src
    for i = 0, src - 1 do a[i] = 0 end
  elseif type(src) == "table" then
    local s = RT.it(src)
    a.length = s.length
    for i = 0, s.length - 1 do a[i] = s[i] end
  else
    a.length = 0
  end
  return a
end

local function isArray(v) return type(v) == "table" and v.length ~= nil and not v.__set and not v.__map end
RT.isArray = isArray

function RT.len(x)
  if type(x) == "string" then return #x end
  return x.length
end
function RT.setlen(a, n)
  local old = a.length
  for i = n, old - 1 do a[i] = nil end
  a.length = n
  return n
end

function RT.push(a, ...)
  local n = a.length
  local c = select("#", ...)
  if c == 1 then
    a[n] = (...)
    a.length = n + 1
    return n + 1
  end
  for i = 1, c do a[n + i - 1] = (select(i, ...)) end
  a.length = n + c
  return n + c
end
function RT.pop(a)
  local n = a.length
  if n == 0 then return nil end
  local v = a[n - 1]
  a[n - 1] = nil
  a.length = n - 1
  return v
end
function RT.shift(a)
  local n = a.length
  if n == 0 then return nil end
  local v = a[0]
  for i = 1, n - 1 do a[i - 1] = a[i] end
  a[n - 1] = nil
  a.length = n - 1
  return v
end
function RT.unshift(a, ...)
  local c = select("#", ...)
  local n = a.length
  for i = n - 1, 0, -1 do a[i + c] = a[i] end
  for i = 1, c do a[i - 1] = (select(i, ...)) end
  a.length = n + c
  return n + c
end
function RT.splice(a, start, del, ...)
  local n = a.length
  if start < 0 then start = n + start; if start < 0 then start = 0 end end
  if start > n then start = n end
  if del == nil then del = n - start end
  if del > n - start then del = n - start end
  if del < 0 then del = 0 end
  local out = { length = del }
  for i = 0, del - 1 do out[i] = a[start + i] end
  local c = select("#", ...)
  local shiftBy = c - del
  if shiftBy < 0 then
    for i = start + del, n - 1 do a[i + shiftBy] = a[i] end
    for i = n + shiftBy, n - 1 do a[i] = nil end
  elseif shiftBy > 0 then
    for i = n - 1, start + del, -1 do a[i + shiftBy] = a[i] end
  end
  for i = 1, c do a[start + i - 1] = (select(i, ...)) end
  a.length = n + shiftBy
  return out
end
local function norm(i, n, def)
  if i == nil then return def end
  if i < 0 then i = n + i; if i < 0 then i = 0 end end
  if i > n then i = n end
  return i
end
function RT.slice(x, s, e)
  if type(x) == "string" then
    local n = #x
    s = norm(s, n, 0); e = norm(e, n, n)
    if e <= s then return "" end
    return ssub(x, s + 1, e)
  end
  local n = x.length
  s = norm(s, n, 0); e = norm(e, n, n)
  local out = { length = e > s and e - s or 0, __ta = x.__ta }
  for i = s, e - 1 do out[i - s] = x[i] end
  return out
end
RT.subarray = RT.slice
function RT.concat(x, ...)
  if type(x) == "string" then
    local s = x
    for i = 1, select("#", ...) do s = s .. str((select(i, ...))) end
    return s
  end
  local out = { length = 0 }
  local n = 0
  for i = 0, x.length - 1 do out[n] = x[i]; n = n + 1 end
  for k = 1, select("#", ...) do
    local v = (select(k, ...))
    if isArray(v) then for i = 0, v.length - 1 do out[n] = v[i]; n = n + 1 end
    else out[n] = v; n = n + 1 end
  end
  out.length = n
  return out
end
function RT.indexOf(x, v, from)
  if type(x) == "string" then
    local i = sfind(x, v, (from or 0) + 1, true)
    return i and i - 1 or -1
  end
  for i = from or 0, x.length - 1 do if x[i] == v then return i end end
  return -1
end
function RT.includes(x, v)
  if type(x) == "string" then return sfind(x, v, 1, true) ~= nil end
  for i = 0, x.length - 1 do if x[i] == v then return true end end
  return false
end
function RT.join(a, sep)
  sep = sep or ","
  local n = a.length
  if n == 0 then return "" end
  local t = {}
  for i = 0, n - 1 do local v = a[i]; t[i + 1] = v == nil and "" or str(v) end
  return table.concat(t, sep)
end
function RT.reverse(a)
  local n = a.length
  for i = 0, floor(n / 2) - 1 do a[i], a[n - 1 - i] = a[n - 1 - i], a[i] end
  return a
end
function RT.map(a, f)
  local n = a.length
  local out = { length = n }
  for i = 0, n - 1 do out[i] = f(a[i], i, a) end
  return out
end
function RT.filter(a, f)
  local out = { length = 0 }
  local n = 0
  for i = 0, a.length - 1 do
    local v = a[i]
    if T(f(v, i, a)) then out[n] = v; n = n + 1 end
  end
  out.length = n
  return out
end
function RT.forEach(a, f)
  if a.__set then local it = a.items; for i = 0, it.length - 1 do f(it[i], it[i], a) end return end
  if a.__map then local it = a.items; for i = 0, it.length - 1 do f(it[i][1], it[i][0], a) end return end
  local i = 0
  while i < a.length do f(a[i], i, a); i = i + 1 end
end
function RT.some(a, f)
  for i = 0, a.length - 1 do if T(f(a[i], i, a)) then return true end end
  return false
end
function RT.every(a, f)
  for i = 0, a.length - 1 do if not T(f(a[i], i, a)) then return false end end
  return true
end
function RT.find(a, f)
  for i = 0, a.length - 1 do local v = a[i]; if T(f(v, i, a)) then return v end end
  return nil
end
function RT.findIndex(a, f)
  for i = 0, a.length - 1 do if T(f(a[i], i, a)) then return i end end
  return -1
end
function RT.reduce(a, f, ...)
  local acc, i0
  if select("#", ...) > 0 then acc = (...); i0 = 0 else acc = a[0]; i0 = 1 end
  for i = i0, a.length - 1 do acc = f(acc, a[i], i, a) end
  return acc
end
function RT.fill(a, v, s, e)
  local n = a.length
  s = norm(s, n, 0); e = norm(e, n, n)
  for i = s, e - 1 do a[i] = v end
  return a
end
function RT.at(a, i)
  if type(a) == "string" then local n = #a; if i < 0 then i = n + i end; local c = ssub(a, i + 1, i + 1); return c ~= "" and c or nil end
  if i < 0 then i = a.length + i end
  return a[i]
end
function RT.flat(a)
  local out = { length = 0 }
  local n = 0
  for i = 0, a.length - 1 do
    local v = a[i]
    if isArray(v) then for j = 0, v.length - 1 do out[n] = v[j]; n = n + 1 end else out[n] = v; n = n + 1 end
  end
  out.length = n
  return out
end
-- stable merge sort, like the browser's
local function defcmp(x, y)
  if x == nil then return y == nil and 0 or 1 end
  if y == nil then return -1 end
  local sx, sy = str(x), str(y)
  if sx < sy then return -1 elseif sx > sy then return 1 end
  return 0
end
function RT.sort(a, cmp)
  cmp = cmp or defcmp
  local n = a.length
  if n < 2 then return a end
  if n <= 12 then
    for i = 1, n - 1 do
      local v = a[i]
      local j = i - 1
      while j >= 0 and cmp(a[j], v) > 0 do a[j + 1] = a[j]; j = j - 1 end
      a[j + 1] = v
    end
    return a
  end
  local src, dst = a, {}
  local width = 1
  while width < n do
    local i = 0
    while i < n do
      local mid, hi = i + width, i + 2 * width
      if mid > n then mid = n end
      if hi > n then hi = n end
      local l, r, k = i, mid, i
      while l < mid and r < hi do
        if cmp(src[r], src[l]) < 0 then dst[k] = src[r]; r = r + 1 else dst[k] = src[l]; l = l + 1 end
        k = k + 1
      end
      while l < mid do dst[k] = src[l]; l = l + 1; k = k + 1 end
      while r < hi do dst[k] = src[r]; r = r + 1; k = k + 1 end
      i = hi
    end
    src, dst = dst, src
    width = width * 2
  end
  if src ~= a then for i = 0, n - 1 do a[i] = src[i] end end
  return a
end

-- anything a for...of or a spread can walk, as an array
local function it(x)
  if type(x) == "string" then
    local n = #x
    local a = { length = n }
    for i = 1, n do a[i - 1] = ssub(x, i, i) end
    return a
  end
  if x == nil then error("undefined is not iterable", 2) end
  if x.__set or x.__map then return x.items end
  return x
end
RT.it = it

-- sarr(1, iterable, 0, value, ...): an array literal with spreads in it
function RT.sarr(...)
  local out = { length = 0 }
  local n = 0
  for k = 1, select("#", ...), 2 do
    local spread, v = select(k, ...)
    if spread == 1 then
      local s = it(v)
      for i = 0, s.length - 1 do out[n] = s[i]; n = n + 1 end
    else out[n] = v; n = n + 1 end
  end
  out.length = n
  return out
end

function RT.arrayFrom(src, f)
  local out
  if type(src) == "table" and src.length ~= nil and src[0] == nil and not src.__set and not src.__map and f then
    -- Array.from({ length: n }, fn)
    out = { length = src.length }
    for i = 0, src.length - 1 do out[i] = f(nil, i) end
    return out
  end
  local s = it(src)
  out = { length = s.length }
  for i = 0, s.length - 1 do
    if f then out[i] = f(s[i], i) else out[i] = s[i] end
  end
  return out
end

-- ------------------------------------------------------------------------------------------------ Set and Map

function RT.Set(src)
  local s = { __set = true, size = 0, items = { length = 0 }, idx = {} }
  if src ~= nil then
    local a = it(src)
    for i = 0, a.length - 1 do RT.add(s, a[i]) end
  end
  return s
end
function RT.Map(src)
  local m = { __map = true, size = 0, items = { length = 0 }, idx = {} }
  if src ~= nil then
    local a = it(src)
    for i = 0, a.length - 1 do RT.set(m, a[i][0], a[i][1]) end
  end
  return m
end
function RT.add(s, v)
  if not s.idx[v] then
    local n = s.items.length
    s.items[n] = v
    s.items.length = n + 1
    s.idx[v] = true
    s.size = n + 1
  end
  return s
end
function RT.has(s, v)
  return s.idx[v] ~= nil
end
function RT.get(m, k)
  local e = m.idx[k]
  return e and e[1]
end
function RT.set(m, k, v)
  local e = m.idx[k]
  if e then e[1] = v
  else
    e = { [0] = k, v, length = 2 }
    local n = m.items.length
    m.items[n] = e
    m.items.length = n + 1
    m.idx[k] = e
    m.size = n + 1
  end
  return m
end
RT["delete"] = function(s, v)
  local e = s.idx[v]
  if e == nil then return false end
  s.idx[v] = nil
  local items = s.items
  local n = items.length
  local at = -1
  if s.__set then for i = 0, n - 1 do if items[i] == v then at = i; break end end
  else for i = 0, n - 1 do if items[i] == e then at = i; break end end end
  for i = at + 1, n - 1 do items[i - 1] = items[i] end
  items[n - 1] = nil
  items.length = n - 1
  s.size = n - 1
  return true
end
function RT.clear(s)
  s.items = { length = 0 }; s.idx = {}; s.size = 0
end
function RT.keys(m)
  if m.__map then local out = { length = m.items.length }; for i = 0, out.length - 1 do out[i] = m.items[i][0] end; return out end
  if m.__set then return m.items end
  return m.keys()
end
function RT.values(m)
  if m.__map then local out = { length = m.items.length }; for i = 0, out.length - 1 do out[i] = m.items[i][1] end; return out end
  if m.__set then return m.items end
  return m.values()
end
function RT.entries(m)
  if m.__map then return m.items end
  return m.entries()
end

-- ------------------------------------------------------------------------------------------------ objects

local function sortedKeys(o)
  local ks, n = {}, 0
  for k in pairs(o) do n = n + 1; ks[n] = k end
  table.sort(ks, function(a, b)
    local ta, tb = type(a), type(b)
    if ta ~= tb then return ta == "number" end
    return a < b
  end)
  return ks, n
end
function RT.objKeys(o)
  if isArray(o) then local out = { length = o.length }; for i = 0, o.length - 1 do out[i] = str(i) end; return out end
  local ks, n = sortedKeys(o)
  local out = { length = n }
  for i = 1, n do out[i - 1] = ks[i] end
  return out
end
function RT.objValues(o)
  local ks, n = sortedKeys(o)
  local out = { length = n }
  for i = 1, n do out[i - 1] = o[ks[i]] end
  return out
end
function RT.objEntries(o)
  local ks, n = sortedKeys(o)
  local out = { length = n }
  for i = 1, n do out[i - 1] = { [0] = ks[i], o[ks[i]], length = 2 } end
  return out
end
function RT.fromEntries(src)
  local a = it(src)
  local o = {}
  for i = 0, a.length - 1 do o[a[i][0]] = a[i][1] end
  return o
end
function RT.assign(o, ...)
  for i = 1, select("#", ...) do
    local s = (select(i, ...))
    if type(s) == "table" then for k, v in pairs(s) do o[k] = v end end
  end
  return o
end

-- ------------------------------------------------------------------------------------------------ strings

function RT.split(s, sep)
  local out = { length = 0 }
  local n = 0
  if sep == "" then
    for i = 1, #s do out[n] = ssub(s, i, i); n = n + 1 end
  else
    local from = 1
    while true do
      local a, b = sfind(s, sep, from, true)
      if not a then break end
      out[n] = ssub(s, from, a - 1); n = n + 1
      from = b + 1
    end
    out[n] = ssub(s, from); n = n + 1
  end
  out.length = n
  return out
end
function RT.startsWith(s, p) return ssub(s, 1, #p) == p end
function RT.endsWith(s, p) return p == "" or ssub(s, -#p) == p end
function RT.trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end
function RT.padStart(s, n, c)
  s = str(s); c = c or " "
  if #s >= n then return s end
  return ssub(srep(c, ceil((n - #s) / #c)), 1, n - #s) .. s
end
function RT.padEnd(s, n, c)
  s = str(s); c = c or " "
  if #s >= n then return s end
  return s .. ssub(srep(c, ceil((n - #s) / #c)), 1, n - #s)
end
function RT.toUpperCase(s) return supper(s) end
function RT.toLowerCase(s) return slower(s) end
function RT.charAt(s, i) return ssub(s, i + 1, i + 1) end
function RT.charCodeAt(s, i) return sbyte(s, (i or 0) + 1) or (0 / 0) end
function RT.fromCharCode(...) return schar(...) end
function RT.rep(s, n) return srep(s, n) end
-- plain-text replace (first match only, as with a string pattern in JS)
function RT.replace(s, what, with)
  local a, b = sfind(s, what, 1, true)
  if not a then return s end
  return ssub(s, 1, a - 1) .. (type(with) == "string" and with or str(with(ssub(s, a, b)))) .. ssub(s, b + 1)
end
function RT.replaceAll(s, what, with)
  local out, from = {}, 1
  while true do
    local a, b = sfind(s, what, from, true)
    if not a then break end
    out[#out + 1] = ssub(s, from, a - 1); out[#out + 1] = with
    from = b + 1
  end
  out[#out + 1] = ssub(s, from)
  return table.concat(out)
end
-- 1234567 → "1,234,567"
function RT.commas(n)
  local s = sformat("%.0f", floor(n))
  local neg = ""
  if ssub(s, 1, 1) == "-" then neg = "-"; s = ssub(s, 2) end
  local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
  if ssub(out, 1, 1) == "," then out = ssub(out, 2) end
  return neg .. out
end

-- s[i] on something that may be a string
function RT.ch(s, i)
  if type(s) == "string" then local c = ssub(s, i + 1, i + 1); if c == "" then return nil end return c end
  return s[i]
end
function RT.orv(a, b) if T(a) then return a end return b end
function RT.isNaN(x) return x ~= x end
function RT.seti(a, i, v)
  a[i] = v
  if type(i) == "number" and a.length ~= nil and i >= a.length then a.length = i + 1 end
end

-- A plain object can have a method with one of these names too (an occupancy grid's has(), a sprite sheet's get()).
-- Those are ordinary functions on a table with no `length`, so hand the call straight to them.
do
  local names = { "push", "pop", "shift", "unshift", "splice", "slice", "subarray", "concat", "indexOf", "includes", "join", "reverse", "map", "filter",
    "forEach", "some", "every", "find", "findIndex", "reduce", "fill", "at", "flat", "sort", "add", "has", "get", "set", "delete", "clear", "keys",
    "values", "entries", "replace", "split", "toString" }
  for _, name in ipairs(names) do
    local impl = RT[name]
    RT[name] = function(recv, ...)
      if type(recv) == "table" and recv.length == nil and not recv.__set and not recv.__map then
        local f = recv[name]
        if f then return f(...) end
      end
      return impl(recv, ...)
    end
  end
end

-- ------------------------------------------------------------------------------------------------ slow work

-- Painting a level takes seconds. The host runs that inside a coroutine and sets RT.yieldAt (a perfNow() time);
-- the long loops call breathe(), which hands control back once the slice is spent. Outside a slice it does nothing.
RT.yieldAt = nil
function RT.breathe()
  local t = RT.yieldAt
  if t and RT.perfNow() >= t then coroutine.yield() end
end

-- world.js's pathField: how far every pixel of the Clearing is from the path. Two million distance checks, so it
-- breathes, and since level 1's path never changes the answer is kept.
local fieldKey, fieldMemo
function RT.pathField(pts)
  local W, H = 320, 180
  local n = pts.length
  local key = n .. ":" .. pts[0].x .. "," .. pts[0].y .. ":" .. pts[n - 1].x .. "," .. pts[n - 1].y .. ":" .. pts[floor(n / 2)].x .. "," .. pts[floor(n / 2)].y
  if key == fieldKey then return fieldMemo end
  local xs, ys, m = {}, {}, 0
  for i = 0, n - 1, 2 do m = m + 1; xs[m] = pts[i].x; ys[m] = pts[i].y end
  local df = { __ta = "Float32Array", length = W * H }
  for y = 0, H - 1 do
    local py = y + 0.5
    for x = 0, W - 1 do
      local px, best = x + 0.5, huge
      for k = 1, m do
        local dx, dy = px - xs[k], py - ys[k]
        local d = dx * dx + dy * dy
        if d < best then best = d end
      end
      df[y * W + x] = sqrt(best)
    end
    if y % 4 == 3 then RT.breathe() end
  end
  fieldKey, fieldMemo = key, df
  return df
end

-- ------------------------------------------------------------------------------------------------ errors and the host

function RT.Error(msg) return { message = msg, __error = true } end
function RT.throw(e) error(e, 0) end
-- what a catch clause receives: thrown objects as they are, Lua errors wrapped
function RT.caught(e)
  if type(e) == "table" then return e end
  return { message = tostring(e), __error = true }
end

RT.console = {
  log = function(...) if RT.print then RT.print(...) end end,
  warn = function(...) if RT.print then RT.print(...) end end,
  info = function(...) if RT.print then RT.print(...) end end,
  error = function(...) if RT.print then RT.print(...) end end,
}
-- the host fills these in (GetTime in the client, os.clock in the tests)
RT.now = function() return 0 end        -- milliseconds, wall clock
RT.perfNow = function() return 0 end    -- milliseconds, fine-grained

-- The only use the game's own modules make of JSON is JSON.parse(JSON.stringify(x)) to copy a table of numbers,
-- so "stringify" hands back a wrapped deep copy and "parse" unwraps one.
local function deep(v)
  if type(v) ~= "table" then return v end
  local o = {}
  for k, x in pairs(v) do o[k] = deep(x) end
  return o
end
RT.deep = deep
RT.host = {
  JSON = {
    stringify = function(v) return { __json = deep(v) } end,
    parse = function(s)
      if type(s) == "table" and s.__json ~= nil then return deep(s.__json) end
      error({ message = "JSON.parse: not something this runtime made", __error = true }, 0)
    end,
  },
}
