-- Whelp data: keys, tags, review encoding and summaries. Pure Lua, no frames.
local _, ns = ...

ns.VERSION = "1.0.0"
ns.PREFIX = "Whelp"

ns.ROLES = { "TANK", "HEALER", "DAMAGER" }
ns.ROLE_LABEL = { TANK = "Tank", HEALER = "Healer", DAMAGER = "DPS" }
ns.ROLE_CODE = { TANK = "T", HEALER = "H", DAMAGER = "D" }
ns.CODE_ROLE = { T = "TANK", H = "HEALER", D = "DAMAGER" }

-- Yelp's own words for each star count.
ns.STAR_WORDS = { "Not good", "Could've been better", "OK", "Good", "Great" }
-- Star colours climb from mustard to red, the way the real site does it.
ns.STAR_RGB = {
  { 1.00, 0.80, 0.29 }, { 1.00, 0.68, 0.28 }, { 1.00, 0.55, 0.22 },
  { 1.00, 0.39, 0.24 }, { 0.98, 0.26, 0.24 },
}
ns.STAR_TEX = "Interface\\TargetingFrame\\UI-RaidTargetingIcon_1"

-- Eight highlights per role: four good (true), four bad (false).
ns.TAGS = {
  TANK = {
    { "Steady pulls", true }, { "Never lost aggro", true },
    { "Knows the route", true }, { "Marks targets", true },
    { "Chain-pulled the whole wing", false }, { "Ran ahead, died, blamed heals", false },
    { "Turned the boss on us", false }, { "Left after the first wipe", false },
  },
  HEALER = {
    { "Kept us topped", true }, { "Dispels like a champ", true },
    { "Rezzed without asking", true }, { "Calls out OOM", true },
    { "Drinks every pull", false }, { "Was DPSing instead", false },
    { "Let the hunter die", false }, { "Rage-quit at 2%", false },
  },
  DAMAGER = {
    { "Pumps", true }, { "Interrupts!", true },
    { "CC'd without being asked", true }, { "Stays out of the fire", true },
    { "Stood in fire", false }, { "Pulled aggro off the tank", false },
    { "Needed on everything", false }, { "Pet pulled the next room", false },
  },
}

ns.TEXT_BYTES = 140
ns.WHERE_BYTES = 40
ns.RECOMMEND_AFTER = 3   -- reviewers with fewer reviews land in "not recommended"
ns.ELITE_AFTER = 20      -- reviews before a reviewer earns Elite
ns.ALERT_BELOW = 2.0     -- average that raises a Consumer Alert...
ns.ALERT_MIN = 3         -- ...once this many reviews agree

---------------------------------------------------------------------------
-- strings
---------------------------------------------------------------------------

-- Cut a string to at most n bytes without splitting a UTF-8 character.
function ns.CutBytes(s, n)
  if #s <= n then return s end
  local cut = n
  while cut > 0 do
    local b = s:byte(cut + 1)
    if not b or b < 0x80 or b >= 0xC0 then break end
    cut = cut - 1
  end
  return s:sub(1, cut)
end

-- Text that is safe to store, send and show: no tabs, newlines or escapes.
function ns.Clean(s, n)
  s = tostring(s or "")
  s = s:gsub("[%c]", " "):gsub("|", "/"):gsub("^%s+", ""):gsub("%s+$", ""):gsub("  +", " ")
  return ns.CutBytes(s, n or ns.TEXT_BYTES)
end

local function cap(s) return (s:gsub("^%l", string.upper)) end

-- "Name-Realm" with spaces dropped from the realm, the way the chat system writes it.
function ns.Key(name, realm, homeRealm)
  if type(name) ~= "string" or name == "" then return nil end
  local n, r = name:match("^([^%-]+)%-(.+)$")
  if n then name, realm = n, r end
  if type(realm) ~= "string" or realm == "" then realm = homeRealm end
  if type(realm) ~= "string" or realm == "" then return nil end
  realm = realm:gsub("[%s%-']", "")
  return cap(name) .. "-" .. realm
end

function ns.ShortName(key, homeRealm)
  local n, r = tostring(key):match("^([^%-]+)%-(.+)$")
  if not n then return tostring(key) end
  if homeRealm and r == homeRealm:gsub("[%s%-']", "") then return n end
  return n .. "-" .. r
end

---------------------------------------------------------------------------
-- tags as an 8-bit mask
---------------------------------------------------------------------------
function ns.TagMask(list)
  local m = 0
  for i = 1, 8 do if list[i] then m = m + 2 ^ (i - 1) end end
  return m
end

function ns.TagList(mask)
  local t = {}
  mask = tonumber(mask) or 0
  for i = 1, 8 do t[i] = mask % 2 == 1; mask = math.floor(mask / 2) end
  return t
end

---------------------------------------------------------------------------
-- wire format
--   R \t subject \t role \t stars \t tags(hex) \t when \t where \t text
--   Q \t key,key,...      (who has reviews of these players?)
-- The author of an R is always the sender, so nobody can post as someone else.
---------------------------------------------------------------------------
function ns.EncodeReview(subject, r)
  return table.concat({ "R", subject, ns.ROLE_CODE[r.role] or "D", tostring(r.stars),
    ("%02x"):format(r.tags or 0), tostring(math.floor(r.when or 0)),
    ns.Clean(r.where, ns.WHERE_BYTES), ns.Clean(r.text) }, "\t")
end

function ns.DecodeReview(msg)
  local kind, subject, role, stars, tags, when, where, text =
    msg:match("^(R)\t([^\t]+)\t(%u)\t(%d)\t(%x%x)\t(%d+)\t([^\t]*)\t?(.*)$")
  if not kind then return nil end
  role = ns.CODE_ROLE[role]
  stars = tonumber(stars)
  if not role or not stars or stars < 1 or stars > 5 then return nil end
  if not subject:match("^[^%-]+%-[^%-]+$") then return nil end
  return subject, {
    role = role, stars = stars, tags = tonumber(tags, 16), when = tonumber(when),
    where = ns.Clean(where, ns.WHERE_BYTES), text = ns.Clean(text),
  }
end

-- Split a key list into Q messages that each fit an addon message.
function ns.EncodeQueries(keys)
  local out, cur = {}, nil
  for _, k in ipairs(keys) do
    if cur and #cur + 1 + #k > 250 then out[#out + 1] = cur; cur = nil end
    cur = cur and (cur .. "," .. k) or ("Q\t" .. k)
  end
  if cur then out[#out + 1] = cur end
  return out
end

function ns.DecodeQuery(msg)
  local body = msg:match("^Q\t?(.*)$")
  if not body then return nil end
  local keys = {}
  for k in body:gmatch("[^,]+") do keys[#keys + 1] = k end
  return keys
end

---------------------------------------------------------------------------
-- the database
--   db.players[key] = { class, claimed, reviews = { ["author:ROLE"] = review } }
--   review = { author, role, stars, tags, when, where, text }
---------------------------------------------------------------------------
function ns.NewDB(db)
  db = type(db) == "table" and db or {}
  db.players = db.players or {}
  db.parties = db.parties or {}
  db.opts = db.opts or {}
  for k, v in pairs({ prompt = true, share = true, tooltip = true, alerts = true }) do
    if db.opts[k] == nil then db.opts[k] = v end
  end
  db.schema = 1
  return db
end

function ns.Player(db, key, create)
  local p = db.players[key]
  if not p and create then p = { reviews = {} }; db.players[key] = p end
  return p
end

-- Store a review; an author's newer review for the same role replaces the old one.
-- Returns true when something changed.
function ns.AddReview(db, subject, author, r)
  if not subject or not author or subject == author then return false end
  local p = ns.Player(db, subject, true)
  local id = author .. ":" .. r.role
  local old = p.reviews[id]
  if old and (old.when or 0) > (r.when or 0) then return false end
  if old and old.when == r.when and old.stars == r.stars and old.text == r.text and old.tags == r.tags then
    return false
  end
  p.reviews[id] = {
    author = author, role = r.role, stars = r.stars, tags = r.tags or 0,
    when = r.when or 0, where = r.where or "", text = r.text or "",
  }
  db.authorCounts = nil
  return true
end

function ns.AuthorCounts(db)
  if db.authorCounts then return db.authorCounts end
  local c = {}
  for _, p in pairs(db.players) do
    for _, r in pairs(p.reviews) do c[r.author] = (c[r.author] or 0) + 1 end
  end
  db.authorCounts = c
  return c
end

function ns.IsElite(db, author) return (ns.AuthorCounts(db)[author] or 0) >= ns.ELITE_AFTER end

-- The filter everyone loves: reviewers with too few reviews don't count.
function ns.IsRecommended(db, author, me)
  return author == me or (ns.AuthorCounts(db)[author] or 0) >= ns.RECOMMEND_AFTER
end

-- Everything a tooltip or profile page needs about one player.
function ns.Summary(db, key, me)
  local p = db.players[key]
  local s = { n = 0, sum = 0, all = 0, byRole = {}, tags = {}, list = {}, hidden = {} }
  if not p then return s end
  local tagCount = {}
  for _, r in pairs(p.reviews) do
    s.all = s.all + 1
    if ns.IsRecommended(db, r.author, me) then
      s.list[#s.list + 1] = r
      s.n = s.n + 1
      s.sum = s.sum + r.stars
      local br = s.byRole[r.role] or { n = 0, sum = 0 }
      br.n, br.sum = br.n + 1, br.sum + r.stars
      s.byRole[r.role] = br
      local tl = ns.TagList(r.tags)
      for i = 1, 8 do
        if tl[i] then
          local id = r.role .. i
          tagCount[id] = (tagCount[id] or 0) + 1
        end
      end
    else
      s.hidden[#s.hidden + 1] = r
    end
  end
  s.avg = s.n > 0 and s.sum / s.n or nil
  for _, br in pairs(s.byRole) do br.avg = br.sum / br.n end
  for id, c in pairs(tagCount) do
    local role, i = id:match("^(%u+)(%d)$")
    i = tonumber(i)
    local def = ns.TAGS[role][i]
    s.tags[#s.tags + 1] = { role = role, i = i, label = def[1], good = def[2], count = c }
  end
  table.sort(s.tags, function(a, b)
    if a.count ~= b.count then return a.count > b.count end
    return a.label < b.label
  end)
  local function newest(a, b) return (a.when or 0) > (b.when or 0) end
  table.sort(s.list, newest)
  table.sort(s.hidden, newest)
  s.alert = s.n >= ns.ALERT_MIN and s.avg < ns.ALERT_BELOW
  s.claimed = p.claimed
  s.class = p.class
  return s
end

-- Round to the nearest half star, as the bars do.
function ns.HalfStars(avg) return math.floor((avg or 0) * 2 + 0.5) / 2 end

-- Five inline star textures, coloured by the rounded rating.
function ns.StarText(avg, size)
  size = size or 14
  local half = ns.HalfStars(avg)
  local rgb = ns.STAR_RGB[math.max(1, math.min(5, math.ceil(half)))]
  local out = {}
  for i = 1, 5 do
    local r, g, b
    if half >= i then r, g, b = rgb[1], rgb[2], rgb[3]
    elseif half >= i - 0.5 then r, g, b = rgb[1] * 0.75, rgb[2] * 0.55, rgb[3] * 0.55
    else r, g, b = 0.3, 0.3, 0.3 end
    out[i] = ("|T%s:%d:%d:0:0:64:64:0:64:0:64:%d:%d:%d|t"):format(ns.STAR_TEX, size, size,
      math.floor(r * 255), math.floor(g * 255), math.floor(b * 255))
  end
  return table.concat(out)
end

-- Keep the last few parties so you can still review them after the group breaks up.
ns.MAX_PARTIES = 15
function ns.SaveParty(db, party)
  if not party or not next(party.members) then return end
  for i, old in ipairs(db.parties) do
    if old.id == party.id then table.remove(db.parties, i) break end
  end
  table.insert(db.parties, 1, party)
  while #db.parties > ns.MAX_PARTIES do table.remove(db.parties) end
end
