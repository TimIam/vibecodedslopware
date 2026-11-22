-- Whelp core: who you grouped with, sharing reviews, tooltips, menus and slash commands.
local addonName, ns = ...

local db
local me, homeRealm
local session            -- the party you are in right now
local alerted = {}       -- players already announced this session
local queue = {}         -- addon messages waiting for a send slot
ns.queue = queue
local tokens, lastRefill = 4, 0
local replied = {}       -- [channel..subject] = time, so many askers get one answer
local pendingAlerts = {} -- players to announce once their reviews have had time to arrive

local function say(msg) DEFAULT_CHAT_FRAME:AddMessage("|cffd32323Whelp|r " .. msg) end
ns.Say = say

-- Midnight-era clients can hand back secret values that throw on any use. Drop them.
local function plain(v)
  if issecretvalue and issecretvalue(v) then return nil end
  return v
end
ns.Plain = plain

-- Call fn and hand back its first two results, or nil if it throws or they are secret.
local function safe(fn, ...)
  if not fn then return nil end
  local ok, a, b = pcall(fn, ...)
  if not ok then return nil end
  return plain(a), plain(b)
end
ns.Safe = safe

local function now() return GetTime() end

function ns.Me() return me end
function ns.HomeRealm() return homeRealm end
function ns.DB() return db end

function ns.ClassColor(class)
  local c = class and RAID_CLASS_COLORS and RAID_CLASS_COLORS[class]
  if c then return ("|cff%02x%02x%02x"):format(c.r * 255, c.g * 255, c.b * 255) end
  return "|cffffffff"
end

function ns.Display(key, class)
  return ns.ClassColor(class or (db and db.players[key] and db.players[key].class)) ..
    ns.ShortName(key, homeRealm) .. "|r"
end

-- A player's key from a unit token, or nil when the game is hiding who they are.
function ns.UnitKey(unit)
  unit = plain(unit)
  if not unit or not safe(UnitIsPlayer, unit) then return nil end
  local ok, name, realm = pcall(UnitName, unit)
  if not ok then return nil end
  name, realm = plain(name), plain(realm)
  if not name or name == "" or name == UNKNOWNOBJECT then return nil end
  return ns.Key(name, realm, homeRealm)
end

local function unitInfo(unit)
  local key = ns.UnitKey(unit)
  if not key then return nil end
  local _, class = ns.Safe(UnitClass, unit)
  local role = ns.Safe(UnitGroupRolesAssigned, unit)
  if type(class) ~= "string" then class = nil end
  if role ~= "TANK" and role ~= "HEALER" and role ~= "DAMAGER" then role = nil end
  return key, class, role
end

local function where()
  local inInstance, kind = safe(IsInInstance)
  if inInstance and GetInstanceInfo then
    local name = plain((GetInstanceInfo()))
    if name and name ~= "" then return name, plain(kind) end
  end
  local z = GetRealZoneText and plain(GetRealZoneText())
  return z or "", nil
end

---------------------------------------------------------------------------
-- sending: one queue, a small token bucket, held while chat is locked down
---------------------------------------------------------------------------
local function locked()
  return C_ChatInfo.InChatMessagingLockdown and C_ChatInfo.InChatMessagingLockdown()
end

local function send(msg, channel)
  if not channel then return end
  for _, q in ipairs(queue) do if q[1] == msg and q[2] == channel then return end end
  queue[#queue + 1] = { msg, channel }
end
ns.Send = send

local function groupChannel()
  if IsInRaid() then return "RAID" end
  if IsInGroup() then return "PARTY" end
end

function ns.Flush()
  local t = now()
  tokens = math.min(4, tokens + (t - lastRefill))
  lastRefill = t
  while queue[1] and tokens >= 1 and not locked() do
    local q = table.remove(queue, 1)
    local ch = q[2]
    local ok = true
    if ch == "GUILD" and not IsInGuild() then ok = false end
    if (ch == "PARTY" or ch == "RAID") and not IsInGroup() then ok = false end
    if ch == "RAID" and not IsInRaid() then ch = IsInGroup() and "PARTY" or nil end
    if ok and ch then
      pcall(C_ChatInfo.SendAddonMessage, ns.PREFIX, q[1], ch)
      tokens = tokens - 1
    end
  end
end

local function share(subject, r)
  if not db.opts.share then return end
  local msg = ns.EncodeReview(subject, r)
  send(msg, "GUILD")
end

---------------------------------------------------------------------------
-- reviews
---------------------------------------------------------------------------
function ns.MyReview(subject, role)
  local p = db.players[subject]
  return p and p.reviews[me .. ":" .. role]
end

function ns.PostReview(subject, role, stars, tagMask, text, place, class)
  if subject == me then return false, "You can't review your own business." end
  stars = math.floor(tonumber(stars) or 0)
  if stars < 1 or stars > 5 then return false, "Pick a star rating first." end
  local r = { role = role, stars = stars, tags = tagMask or 0, when = time(),
    where = ns.Clean(place, ns.WHERE_BYTES), text = ns.Clean(text) }
  local old = ns.MyReview(subject, role)
  if old and old.when >= r.when then r.when = old.when + 1 end
  ns.AddReview(db, subject, me, r)
  local p = ns.Player(db, subject, true)
  if class then p.class = class end
  share(subject, r)
  if ns.OnReviewsChanged then ns.OnReviewsChanged(subject) end
  return true
end

function ns.DeleteReview(subject, role)
  local p = db.players[subject]
  if p then p.reviews[me .. ":" .. role] = nil; db.authorCounts = nil end
  if ns.OnReviewsChanged then ns.OnReviewsChanged(subject) end
end

---------------------------------------------------------------------------
-- the party session
---------------------------------------------------------------------------
local function newSession()
  local w = where()
  return { id = ("%d-%d"):format(time(), math.random(1000, 9999)), when = time(), where = w,
    members = {}, order = {}, instanceTime = 0, kills = 0, prompted = false }
end

local function finishSession(reason)
  if not session then return end
  local s = session
  session = nil
  alerted = {}
  if #s.order == 0 then return end
  local party = { id = s.id, when = s.when, where = s.where, members = {} }
  for _, key in ipairs(s.order) do
    local m = s.members[key]
    party.members[#party.members + 1] = { key = key, class = m.class, role = m.role }
  end
  ns.SaveParty(db, party)
  if db.opts.prompt and (s.instanceTime >= 240 or s.kills > 0) and ns.ShowToast then
    ns.ShowToast(party)
  end
end
ns.FinishSession = finishSession

local function rosterUnits()
  local list = {}
  if IsInRaid() then
    for i = 1, (GetNumGroupMembers() or 0) do list[#list + 1] = "raid" .. i end
  else
    for i = 1, 4 do list[#list + 1] = "party" .. i end
  end
  return list
end

local function askAbout(keys)
  if #keys == 0 then return end
  for _, msg in ipairs(ns.EncodeQueries(keys)) do
    send(msg, "GUILD")
    send(msg, groupChannel())
  end
end

local function announce(key)
  if alerted[key] or not db.opts.alerts then return end
  local s = ns.Summary(db, key, me)
  if s.n == 0 then return end
  alerted[key] = true
  local m = session and session.members[key]
  local line = ("%s %s %s %.1f from %d review%s"):format(ns.Display(key, m and m.class),
    m and m.role and ("(" .. ns.ROLE_LABEL[m.role] .. ")") or "", ns.StarText(s.avg, 12), s.avg, s.n,
    s.n == 1 and "" or "s")
  if s.tags[1] then line = line .. (" - \"%s\" x%d"):format(s.tags[1].label, s.tags[1].count) end
  if s.alert then line = "|cffff2020CONSUMER ALERT|r " .. line end
  say(line)
end

function ns.ScanRoster()
  if not IsInGroup() then return end
  if not session then session = newSession() end
  local fresh = {}
  for _, unit in ipairs(rosterUnits()) do
    do
      local key, class, role = unitInfo(unit)
      if key and key ~= me then
        local m = session.members[key]
        if not m then
          m = {}
          session.members[key] = m
          session.order[#session.order + 1] = key
          fresh[#fresh + 1] = key
        end
        m.class = class or m.class
        m.role = role or m.role
        if class then ns.Player(db, key, true).class = class end
      end
    end
  end
  if #fresh > 0 then
    askAbout(fresh)
    for _, k in ipairs(fresh) do pendingAlerts[k] = now() + 4 end
  end
end

function ns.Session() return session end

---------------------------------------------------------------------------
-- receiving
---------------------------------------------------------------------------
local function answer(keys, channel)
  if not db.opts.share then return end
  local t = now()
  for _, key in ipairs(keys) do
    local p = db.players[key]
    if p then
      for _, role in ipairs(ns.ROLES) do
        local r = p.reviews[me .. ":" .. role]
        local id = channel .. key .. role
        if r and (not replied[id] or t - replied[id] > 60) then
          replied[id] = t
          send(ns.EncodeReview(key, r), channel)
        end
      end
    end
  end
end

function ns.OnAddonMessage(prefix, msg, channel, sender)
  if prefix ~= ns.PREFIX then return end
  msg, sender = plain(msg), plain(sender)
  if type(msg) ~= "string" or type(sender) ~= "string" then return end
  local author = ns.Key(sender, nil, homeRealm)
  if not author or author == me then return end
  ns.Player(db, author, true).claimed = true
  local kind = msg:sub(1, 1)
  if kind == "Q" then
    local keys = ns.DecodeQuery(msg)
    if keys then answer(keys, channel == "WHISPER" and nil or channel) end
  elseif kind == "R" then
    local subject, r = ns.DecodeReview(msg)
    if subject and r.when <= time() + 86400 and ns.AddReview(db, subject, author, r) then
      if ns.OnReviewsChanged then ns.OnReviewsChanged(subject) end
    end
  end
end

---------------------------------------------------------------------------
-- tooltips and right-click menus
---------------------------------------------------------------------------
function ns.TooltipLines(key)
  local s = ns.Summary(db, key, me)
  local lines = {}
  if s.n == 0 then
    if s.claimed then lines[1] = "|cffd32323Whelp|r |cff999999No reviews yet. Be the first!|r" end
    return lines
  end
  local roles = {}
  for _, role in ipairs(ns.ROLES) do
    local br = s.byRole[role]
    if br then roles[#roles + 1] = ("%s %.1f"):format(ns.ROLE_LABEL[role], br.avg) end
  end
  lines[1] = ("|cffd32323Whelp|r %s |cffffffff%.1f|r |cff999999(%d)|r"):format(ns.StarText(s.avg, 12), s.avg, s.n)
  lines[2] = "|cffcccccc" .. table.concat(roles, " / ") .. "|r"
  if s.tags[1] then
    local t = s.tags[1]
    lines[#lines + 1] = ("%s\"%s\"|r x%d"):format(t.good and "|cff60d060" or "|cffff7060", t.label, t.count)
  end
  if s.alert then lines[#lines + 1] = "|cffff2020Consumer Alert: unusual number of bad reviews|r" end
  return lines
end

local function onTooltip(tt)
  if not db.opts.tooltip or tt ~= GameTooltip then return end
  local ok, _, unit = pcall(tt.GetUnit, tt)
  unit = ok and plain(unit)
  if not unit then return end
  local key = ns.UnitKey(unit)
  if not key or key == me then return end
  for _, line in ipairs(ns.TooltipLines(key)) do tt:AddLine(line) end
end

local function hookTooltip()
  if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum.TooltipDataType then
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Unit, onTooltip)
  elseif GameTooltip and GameTooltip.HookScript then
    GameTooltip:HookScript("OnTooltipSetUnit", onTooltip)
  end
end

ns.MENUS = { "PARTY", "PLAYER", "RAID_PLAYER", "RAID", "FRIEND", "TARGET", "FOCUS", "GUILD",
  "CHAT_ROSTER", "COMMUNITIES_GUILD_MEMBER", "COMMUNITIES_WOW_MEMBER", "ENEMY_PLAYER" }

local function menuKey(ctx)
  if not ctx then return nil end
  local unit = plain(ctx.unit)
  if unit then
    local key, class = unitInfo(unit)
    if key then return key, class end
  end
  local name, server = plain(ctx.name), plain(ctx.server)
  if type(server) ~= "string" then server = nil end
  if type(name) == "string" then return ns.Key(name, server, homeRealm) end
end

local function hookMenus()
  if not Menu or not Menu.ModifyMenu then return end
  for _, which in ipairs(ns.MENUS) do
    pcall(Menu.ModifyMenu, "MENU_UNIT_" .. which, function(_, root, ctx)
      local key, class = menuKey(ctx)
      if not key or key == me then return end
      root:CreateDivider()
      root:CreateTitle("Whelp")
      root:CreateButton("Write a review", function() ns.OpenReview(key, class) end)
      root:CreateButton("See reviews", function() ns.OpenProfile(key) end)
    end)
  end
end

---------------------------------------------------------------------------
-- slash commands
---------------------------------------------------------------------------
local OPTS = {
  prompt = "ask to review your party after a dungeon",
  share = "share your reviews with other Whelp users",
  tooltip = "show ratings on player tooltips",
  alerts = "announce rated players when they join your group",
}

function ns.Slash(input)
  input = (input or ""):gsub("^%s+", ""):gsub("%s+$", "")
  local cmd, rest = input:match("^(%S*)%s*(.-)$")
  cmd = cmd:lower()
  if cmd == "" or cmd == "review" or cmd == "write" then
    ns.OpenReview()
  elseif OPTS[cmd] then
    if rest == "on" then db.opts[cmd] = true elseif rest == "off" then db.opts[cmd] = false
    else db.opts[cmd] = not db.opts[cmd] end
    say(("%s %s: %s."):format(cmd, db.opts[cmd] and "|cff60d060on|r" or "|cffff7060off|r", OPTS[cmd]))
  elseif cmd == "me" then
    ns.OpenProfile(me)
  elseif cmd == "target" or cmd == "t" then
    local key = ns.UnitKey("target")
    if key then ns.OpenProfile(key) else say("Target a player first.") end
  elseif cmd == "help" or cmd == "?" then
    say("/whelp - write a review of your party (or a recent one)")
    say("/whelp Name or Name-Realm - read a player's reviews")
    say("/whelp target - read your target's reviews; /whelp me - reviews of you")
    for k, v in pairs(OPTS) do say(("/whelp %s - %s (%s)"):format(k, v, db.opts[k] and "on" or "off")) end
  else
    local key = ns.Key(input:gsub("%s", ""), nil, homeRealm)
    if key then ns.OpenProfile(key) else say("Try /whelp help.") end
  end
end

SLASH_WHELP1 = "/whelp"
SLASH_WHELP2 = "/yelp"
SlashCmdList.WHELP = function(msg) ns.Slash(msg) end

---------------------------------------------------------------------------
-- events
---------------------------------------------------------------------------
local ev = CreateFrame("Frame")
ns.events = ev
local wasInInstance = false
local tickAcc = 0

-- A run ends when you leave the group, walk into a different instance, or stay
-- outside (alive, so not a corpse run) for OUTSIDE_LIMIT seconds.
ns.OUTSIDE_LIMIT = 120
local function zoneCheck()
  local inInstance = safe(IsInInstance) and true or false
  local w = where()
  if session and inInstance and session.instance and w ~= session.instance then
    finishSession("new instance")
  end
  if inInstance and IsInGroup() then
    if not session then session = newSession() end
    session.where, session.instance, session.outside = w, w, nil
    ns.ScanRoster()
  elseif session and session.instance and not session.outside then
    session.outside = 0
  end
  wasInInstance = inInstance
end

ev:SetScript("OnEvent", function(_, event, ...)
  if event == "ADDON_LOADED" then
    if ... ~= addonName then return end
    WhelpDB = ns.NewDB(WhelpDB)
    db = WhelpDB
    local n, r = UnitName("player")
    homeRealm = (GetNormalizedRealmName and GetNormalizedRealmName()) or (GetRealmName() or ""):gsub("[%s%-']", "")
    me = ns.Key(n, r, homeRealm)
    if C_ChatInfo.RegisterAddonMessagePrefix then C_ChatInfo.RegisterAddonMessagePrefix(ns.PREFIX) end
    hookTooltip()
    hookMenus()
    ev:RegisterEvent("PLAYER_ENTERING_WORLD")
    ev:RegisterEvent("ZONE_CHANGED_NEW_AREA")
    ev:RegisterEvent("GROUP_ROSTER_UPDATE")
    ev:RegisterEvent("GROUP_LEFT")
    ev:RegisterEvent("ENCOUNTER_END")
    ev:RegisterEvent("PLAYER_REGEN_ENABLED")
    ev:RegisterEvent("CHAT_MSG_ADDON")
    ev:RegisterEvent("PLAYER_LOGOUT")
  elseif event == "PLAYER_ENTERING_WORLD" then
    local login, reload = ...
    if login or reload then send("Q", "GUILD") end
    zoneCheck()
    if IsInGroup() then ns.ScanRoster() end
  elseif event == "ZONE_CHANGED_NEW_AREA" then
    zoneCheck()
  elseif event == "GROUP_ROSTER_UPDATE" or event == "PLAYER_REGEN_ENABLED" then
    if IsInGroup() then ns.ScanRoster() elseif session then finishSession("disbanded") end
  elseif event == "GROUP_LEFT" then
    finishSession("left group")
  elseif event == "ENCOUNTER_END" then
    local success = plain((select(5, ...)))
    if session and success == 1 then session.kills = session.kills + 1 end
  elseif event == "CHAT_MSG_ADDON" then
    ns.OnAddonMessage(...)
  elseif event == "PLAYER_LOGOUT" then
    if session and #session.order > 0 then
      local s = session
      local party = { id = s.id, when = s.when, where = s.where, members = {} }
      for _, key in ipairs(s.order) do
        local m = s.members[key]
        party.members[#party.members + 1] = { key = key, class = m.class, role = m.role }
      end
      ns.SaveParty(db, party)
    end
  end
end)
ev:RegisterEvent("ADDON_LOADED")

ev:SetScript("OnUpdate", function(_, elapsed)
  tickAcc = tickAcc + elapsed
  if tickAcc < 0.25 then return end
  local dt = tickAcc
  tickAcc = 0
  if not db then return end
  if session and wasInInstance then session.instanceTime = session.instanceTime + dt end
  if session and session.outside and not safe(UnitIsDeadOrGhost, "player") then
    session.outside = session.outside + dt
    if session.outside >= ns.OUTSIDE_LIMIT then finishSession("walked out") end
  end
  ns.Flush()
  local t = now()
  for key, at in pairs(pendingAlerts) do
    if t >= at then pendingAlerts[key] = nil; announce(key) end
  end
end)
