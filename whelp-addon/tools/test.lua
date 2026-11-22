-- Runs Whelp under plain Lua 5.1 against a small WoW API stub.
-- usage: lua5.1 tools/test.lua   (from whelp/)

local failures = 0
local function check(cond, what)
  if cond then print("ok   " .. what) else failures = failures + 1 print("FAIL " .. what) end
end

---------------------------------------------------------------------------
-- stub
---------------------------------------------------------------------------
local chat, sent, frames = {}, {}, {}
local clock, wall = 1000, 1763400000

local function newObj()
  local o = { scripts = {}, shown = true, text = "" }
  return setmetatable(o, { __index = function(t, k)
    return function(self, ...)
      if k == "SetScript" then local name, fn = ...; self.scripts[name] = fn
      elseif k == "HookScript" then local name, fn = ...; self.scripts[name] = fn
      elseif k == "Show" then
        local was = self.shown; self.shown = true
        if not was and self.scripts.OnShow then self.scripts.OnShow(self) end
      elseif k == "Hide" then self.shown = false
      elseif k == "SetShown" then if ... then self:Show() else self:Hide() end
      elseif k == "IsShown" then return self.shown
      elseif k == "SetText" then self.text = tostring((...) or "")
      elseif k == "GetText" then return self.text
      elseif k == "GetChecked" then return self.checked
      elseif k == "SetChecked" then self.checked = ...
      elseif k == "GetStringHeight" then return 100
      elseif k == "CreateFontString" or k == "CreateTexture" then return newObj()
      elseif k == "RegisterEvent" then rawset(self, "events", rawget(self, "events") or {}); self.events[...] = true
      end
    end
  end })
end

function CreateFrame(kind, name, parent, template)
  local f = newObj()
  f.TitleText = newObj()
  f.kind = kind
  frames[#frames + 1] = f
  if name then _G[name] = f end
  return f
end
UIParent = newObj()
UISpecialFrames = {}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chat[#chat + 1] = m end }
function tinsert(t, v) t[#t + 1] = v end
function GetTime() return clock end
function time() return wall end
date = os.date
RAID_CLASS_COLORS = { WARRIOR = { r = 0.78, g = 0.61, b = 0.43 }, PRIEST = { r = 1, g = 1, b = 1 }, MAGE = { r = 0.25, g = 0.78, b = 0.92 } }
Enum = { TooltipDataType = { Unit = 2 } }
SlashCmdList = {}

-- A value the game is hiding from addons: any use of it throws, like the client.
local SECRET = setmetatable({}, { __tostring = function() error("secret used") end,
  __concat = function() error("secret used") end, __eq = function() error("secret used") end,
  __index = function() error("secret used") end })
function issecretvalue(v) return v == nil and false or rawequal(v, SECRET) end

local tooltipHook
TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) tooltipHook = fn end }
local menus = {}
Menu = { ModifyMenu = function(tag, fn) menus[tag] = fn end }

local lockdown = false
C_ChatInfo = {
  SendAddonMessage = function(prefix, msg, ch) sent[#sent + 1] = { prefix = prefix, msg = msg, ch = ch } end,
  RegisterAddonMessagePrefix = function() end,
  InChatMessagingLockdown = function() return lockdown end,
}

-- the party: unit -> { name, realm, class, role }
local units = {}
local inGroup, inRaid, inGuild = false, false, true
local instance = nil
local dead = false
function UnitName(u)
  if u == "player" then return "Tester", nil end
  local p = units[u]; if not p then return nil end
  return p[1], p[2]
end
function UnitIsPlayer(u) return u == "player" or units[u] ~= nil end
function UnitClass(u) local p = units[u]; if p then return p[3], p[3], 1 end return "Mage", "MAGE", 8 end
function UnitGroupRolesAssigned(u) local p = units[u]; return p and p[4] or "NONE" end
function UnitIsDeadOrGhost() return dead end
function IsInGroup() return inGroup end
function IsInRaid() return inRaid end
function IsInGuild() return inGuild end
function GetNumGroupMembers() local n = 1 for _ in pairs(units) do n = n + 1 end return n end
function IsInInstance() if instance then return true, "party" end return false, "none" end
function GetInstanceInfo() return instance end
function GetRealZoneText() return instance or "Elwynn Forest" end
function GetNormalizedRealmName() return "SomeRealm" end
function GetRealmName() return "Some Realm" end
GameTooltip = newObj()

---------------------------------------------------------------------------
-- load the addon like the client does
---------------------------------------------------------------------------
local ns = {}
for line in io.lines("Whelp/Whelp.toc") do
  if line:match("%.lua$") then assert(loadfile("Whelp/" .. line))("Whelp", ns) end
end
local events = ns.events
local function fire(e, ...) events.scripts.OnEvent(events, e, ...) end
local function tick(seconds)
  local steps = math.floor(seconds / 0.25 + 0.5)
  for _ = 1, steps do clock = clock + 0.25; events.scripts.OnUpdate(events, 0.25) end
end
fire("ADDON_LOADED", "Whelp")
check(WhelpDB and WhelpDB.players and WhelpDB.opts.share, "saved variables made with defaults on")
check(ns.Me() == "Tester-SomeRealm", "my key uses the normalized realm")
check(tooltipHook ~= nil, "tooltip post-call registered")
check(menus.MENU_UNIT_PARTY and menus.MENU_UNIT_PLAYER, "right-click menus hooked")

---------------------------------------------------------------------------
-- pure data
---------------------------------------------------------------------------
check(ns.Key("bob", "Area 52", "Home") == "Bob-Area52", "key drops realm spaces and capitalises")
check(ns.Key("Bob-Other", nil, "Home") == "Bob-Other", "key keeps a realm already in the name")
check(ns.Key("Bob", "", "Home") == "Bob-Home", "same-realm players get the home realm")
check(ns.Key(nil, nil, "Home") == nil, "no name, no key")
check(ns.CutBytes("caf\195\169!", 4) == "caf", "byte cut never splits a UTF-8 character")
check(ns.Clean("a\tb\nc|cffff  d ") == "a b c/cffff d", "clean strips tabs, newlines and escapes")
local mask = ns.TagMask({ true, false, true, false, false, false, false, true })
local back = ns.TagList(mask)
check(mask == 133 and back[1] and back[3] and back[8] and not back[2], "tag mask round trip")

local r0 = { role = "TANK", stars = 2, tags = 0x30, when = 123456, where = "Deadmines", text = "Pulled the whole ship. Twice." }
local subj, r1 = ns.DecodeReview(ns.EncodeReview("Gorbash-SomeRealm", r0))
check(subj == "Gorbash-SomeRealm" and r1.role == "TANK" and r1.stars == 2 and r1.tags == 0x30
  and r1.when == 123456 and r1.where == "Deadmines" and r1.text == r0.text, "review encodes and decodes")
local _, r2 = ns.DecodeReview(ns.EncodeReview("A-B", { role = "HEALER", stars = 5, when = 1, where = "", text = "" }))
check(r2 and r2.text == "" and r2.where == "", "empty text and place survive the wire")
check(ns.DecodeReview("R\tA-B\tT\t7\t00\t1\tx\ty") == nil, "seven stars rejected")
check(ns.DecodeReview("R\tnobody\tT\t3\t00\t1\tx\ty") == nil, "subject without a realm rejected")
check(ns.DecodeReview("R\tA-B\tX\t3\t00\t1\tx\ty") == nil, "unknown role rejected")
local long = ns.EncodeReview("Averyveryverylongname-Averyveryverylongrealmname",
  { role = "DAMAGER", stars = 1, tags = 255, when = 9999999999, where = string.rep("w", 90), text = string.rep("x", 400) })
check(#long <= 255, "the longest review fits one addon message (" .. #long .. " bytes)")
local keys = {}
for i = 1, 40 do keys[i] = ("Member%02d-SomeLongRealmName"):format(i) end
local qs = ns.EncodeQueries(keys)
local seen, fits = 0, true
for _, q in ipairs(qs) do fits = fits and #q <= 255; seen = seen + #ns.DecodeQuery(q) end
check(#qs > 1 and fits and seen == 40, "a raid's worth of names splits into fitting queries")

-- summaries and the "not recommended" filter
local db = ns.NewDB({})
for i = 1, 3 do
  ns.AddReview(db, "Other" .. i .. "-R", "Regular-R", { role = "DAMAGER", stars = 4, when = i })
end
ns.AddReview(db, "Gorbash-R", "Regular-R", { role = "TANK", stars = 1, tags = 16 + 32, when = 10, text = "chain pulled" })
ns.AddReview(db, "Gorbash-R", "Drive-R", { role = "TANK", stars = 5, when = 11, text = "best tank ever (my alt)" })
local s = ns.Summary(db, "Gorbash-R", "Me-R")
check(s.n == 1 and s.avg == 1 and #s.hidden == 1, "one-review accounts go to not recommended")
check(s.tags[1] and s.tags[1].count == 1 and not s.tags[1].good, "bad highlights counted")
ns.AddReview(db, "Gorbash-R", "Me-R", { role = "TANK", stars = 1, when = 12 })
s = ns.Summary(db, "Gorbash-R", "Me-R")
check(s.n == 2 and s.byRole.TANK.n == 2, "your own reviews always count")
check(not s.alert, "no alert below three reviews")
for i = 1, 3 do ns.AddReview(db, "Other" .. i .. "-R", "Second-R", { role = "DAMAGER", stars = 3, when = i }) end
ns.AddReview(db, "Gorbash-R", "Second-R", { role = "TANK", stars = 2, when = 13 })
s = ns.Summary(db, "Gorbash-R", "Me-R")
check(s.n == 3 and s.alert, "three bad reviews raise a Consumer Alert")
check(not ns.AddReview(db, "Gorbash-R", "Second-R", { role = "TANK", stars = 5, when = 2 }), "an older copy never replaces a newer review")
check(ns.AddReview(db, "Gorbash-R", "Second-R", { role = "TANK", stars = 4, when = 20 }), "an edit replaces the old review")
check(not ns.AddReview(db, "Gorbash-R", "Gorbash-R", { role = "TANK", stars = 5, when = 30 }), "nobody reviews themselves")
local _, stars = ns.StarText(3.5):gsub("|T", "")
check(stars == 5, "five star textures in a rating")
check(ns.HalfStars(3.74) == 3.5 and ns.HalfStars(3.76) == 4, "ratings round to half stars")

---------------------------------------------------------------------------
-- grouping, sharing and the prompt
---------------------------------------------------------------------------
fire("PLAYER_ENTERING_WORLD", true, false)
tick(1)
local hello = false
for _, m in ipairs(sent) do if m.msg == "Q" and m.ch == "GUILD" then hello = true end end
check(hello, "says hello to the guild on login")

sent = {}
inGroup = true
units.party1 = { "Gorbash", nil, "WARRIOR", "TANK" }
units.party2 = { "Mendy", "Other Realm", "PRIEST", "HEALER" }
units.party3 = { SECRET, SECRET, SECRET, SECRET }
local ok, err = pcall(fire, "GROUP_ROSTER_UPDATE")
check(ok, "a hidden (secret) party member doesn't break the scan " .. tostring(err))
local sess = ns.Session()
check(sess and #sess.order == 2, "two readable party members tracked")
check(sess and sess.members["Mendy-OtherRealm"].role == "HEALER", "cross-realm healer keyed with their realm")
tick(1)
local askG, askP
for _, m in ipairs(sent) do
  if m.msg:match("^Q\t") and m.msg:find("Gorbash%-SomeRealm") then
    if m.ch == "GUILD" then askG = true elseif m.ch == "PARTY" then askP = true end
  end
end
check(askG and askP, "asks guild and party about new members")

-- someone in the guild answers with their review of Gorbash
ns.OnAddonMessage("Whelp", ns.EncodeReview("Gorbash-SomeRealm", { role = "TANK", stars = 1, tags = 16, when = wall - 100, where = "Stockade", text = "pulled everything" }), "GUILD", "Grumpy")
check(WhelpDB.players["Gorbash-SomeRealm"].reviews["Grumpy-SomeRealm:TANK"], "incoming review stored under the sender as author")
check(WhelpDB.players["Grumpy-SomeRealm"].claimed, "the sender is marked as a Whelp user")
ns.OnAddonMessage("Whelp", ns.EncodeReview("Gorbash-SomeRealm", { role = "TANK", stars = 5, when = wall }), "GUILD", "Tester-SomeRealm")
check(not WhelpDB.players["Gorbash-SomeRealm"].reviews["Tester-SomeRealm:TANK"], "messages claiming to be from me are ignored")
ns.OnAddonMessage("Whelp", "R\tjunk", "GUILD", "Grumpy")
ns.OnAddonMessage("Other", "R\tx", "GUILD", "Grumpy")
check(true, "junk and foreign prefixes are ignored")
ok = pcall(ns.OnAddonMessage, "Whelp", SECRET, "PARTY", SECRET)
check(ok, "a secret chat message is dropped quietly")

-- Grumpy has only one review, so the join alert waits for a trusted reviewer
chat = {}
tick(5)
local alertLine
for _, m in ipairs(chat) do if m:find("Gorbash") then alertLine = m end end
check(not alertLine, "no join alert from not-recommended reviewers")

-- posting my own review shares it with the guild
sent = {}
local okPost = ns.PostReview("Gorbash-SomeRealm", "TANK", 2, ns.TagMask({ [5] = true }), "Chain pulled\tthe library", "Scarlet Monastery", "WARRIOR")
tick(1)
local shared
for _, m in ipairs(sent) do if m.ch == "GUILD" and m.msg:match("^R\tGorbash%-SomeRealm\tT\t2\t10\t") then shared = m.msg end end
check(okPost and shared and shared:find("Chain pulled the library", 1, true), "my review goes to the guild, tabs cleaned")
check(not ns.PostReview("Tester-SomeRealm", "TANK", 5, 0, "", ""), "can't review yourself")
check(not ns.PostReview("Gorbash-SomeRealm", "TANK", 0, 0, "", ""), "a review needs stars")

-- a party member asks about Gorbash: only my own review is sent back, once
sent = {}
ns.OnAddonMessage("Whelp", "Q\tGorbash-SomeRealm,Nobody-SomeRealm", "PARTY", "Mendy-OtherRealm")
ns.OnAddonMessage("Whelp", "Q\tGorbash-SomeRealm", "PARTY", "Someone-SomeRealm")
tick(1)
local replies, relayed = 0, false
for _, m in ipairs(sent) do
  if m.ch == "PARTY" and m.msg:match("^R\tGorbash") then
    replies = replies + 1
    if m.msg:find("pulled everything") then relayed = true end
  end
end
check(replies == 1, "answers a question once even when asked twice (" .. replies .. ")")
check(not relayed, "never passes on other people's reviews")

-- held while chat is locked down, sent afterwards
sent = {}
lockdown = true
ns.PostReview("Mendy-OtherRealm", "HEALER", 5, 1, "Kept us alive", "Scarlet Monastery", "PRIEST")
tick(3)
check(#sent == 0, "nothing sent during chat lockdown")
lockdown = false
tick(1)
check(#sent == 1 and sent[1].msg:match("^R\tMendy"), "queued review sent once lockdown lifts")

-- sharing off: nothing leaves
sent = {}
SlashCmdList.WHELP("share off")
ns.PostReview("Mendy-OtherRealm", "HEALER", 4, 1, "edit", "", "PRIEST")
ns.OnAddonMessage("Whelp", "Q\tMendy-OtherRealm", "PARTY", "Gorbash")
tick(2)
check(#sent == 0 and not WhelpDB.opts.share, "share off keeps reviews local")
SlashCmdList.WHELP("share on")

-- a dungeon run: corpse run doesn't end it, walking out does, then the prompt
instance = "Scarlet Monastery"
fire("ZONE_CHANGED_NEW_AREA")
tick(300)
fire("ENCOUNTER_END", 1, "Herod", 1, 5, 1)
check(ns.Session().kills == 1, "boss kill counted")
instance = nil
dead = true
fire("ZONE_CHANGED_NEW_AREA")
tick(400)
check(ns.Session() ~= nil, "a corpse run doesn't end the run")
dead = false
instance = "Scarlet Monastery"
fire("ZONE_CHANGED_NEW_AREA")
instance = nil
fire("ZONE_CHANGED_NEW_AREA")
tick(60)
check(ns.Session() ~= nil, "a quick step outside doesn't end the run")
tick(70)
check(WhelpToast and WhelpToast.shown, "walking out for two minutes ends the run and asks for reviews")
check(WhelpDB.parties[1] and #WhelpDB.parties[1].members == 2 and WhelpDB.parties[1].where == "Scarlet Monastery", "the party is saved for later reviews")
check(WhelpToast.text.text:find("Scarlet Monastery"), "the prompt names the dungeon")

-- a short open-world group gets no prompt
WhelpToast:Hide()
fire("GROUP_ROSTER_UPDATE")
inGroup = false
units = {}
fire("GROUP_LEFT")
check(not WhelpToast.shown, "no prompt after a short open-world group")

---------------------------------------------------------------------------
-- tooltips, menus, windows
---------------------------------------------------------------------------
for i = 1, 3 do ns.AddReview(WhelpDB, "Filler" .. i .. "-R", "Grumpy-SomeRealm", { role = "DAMAGER", stars = 3, when = i }) end
units.target = { "Gorbash", nil, "WARRIOR", "TANK" }
local lines = {}
local tt = GameTooltip
tt.GetUnit = function() return "Gorbash", "target" end
tt.AddLine = function(_, l) lines[#lines + 1] = l end
tooltipHook(tt)
check(lines[1] and lines[1]:find("Whelp") and lines[1]:find("1.5"), "tooltip shows the average (" .. tostring(lines[1]) .. ")")
lines = {}
tt.GetUnit = function() return SECRET, SECRET end
ok = pcall(tooltipHook, tt)
check(ok and #lines == 0, "tooltip on a hidden unit adds nothing and doesn't error")

local root = { items = {} }
function root:CreateDivider() end
function root:CreateTitle(t) self.items[#self.items + 1] = t end
function root:CreateButton(t, fn) self.items[#self.items + 1] = t; self[t] = fn end
menus.MENU_UNIT_PARTY(nil, root, { unit = "target" })
check(root["Write a review"] and root["See reviews"], "menu offers write and read")
root["See reviews"]()
check(WhelpProfileFrame and WhelpProfileFrame.shown and WhelpProfileFrame.key == "Gorbash-SomeRealm", "menu opens their page")
local body = WhelpProfileFrame.body.text
check(body:find("Chain pulled the library", 1, true) and body:find("pulled everything", 1, true), "page lists both reviews")
check(body:find("You", 1, true), "your own review is labelled You")

SlashCmdList.WHELP("")
check(WhelpReviewFrame and WhelpReviewFrame.shown, "/whelp opens Write a Review")
root["Write a review"]()
local RF = ns.reviewFrame
check(RF.who.text:find("Gorbash"), "menu picks the player in the form")
check(RF.edit.text == "Chain pulled the library", "my existing review is loaded for editing")
RF.roleButtons.DAMAGER.scripts.OnClick()
check(RF.edit.text == "" and RF.post.text == "Post Review", "a different role starts a fresh review")
RF.stars[4].scripts.OnClick()
RF.tags[1].checked = true
RF.edit.text = "Actually great on his DPS spec"
sent = {}
RF.post.scripts.OnClick()
tick(1)
local mine = WhelpDB.players["Gorbash-SomeRealm"].reviews["Tester-SomeRealm:DAMAGER"]
check(mine and mine.stars == 4 and mine.tags == 1 and mine.text == "Actually great on his DPS spec", "the form posts a review")
local formShared = false
for _, m in ipairs(sent) do if m.msg:match("^R\tGorbash%-SomeRealm\tD\t4\t01\t") then formShared = true end end
check(formShared, "and shares it")
RF.delete.scripts.OnClick()
check(not WhelpDB.players["Gorbash-SomeRealm"].reviews["Tester-SomeRealm:DAMAGER"], "delete removes it")

SlashCmdList.WHELP("Mendy-Other Realm")
check(WhelpProfileFrame.key == "Mendy-OtherRealm", "/whelp Name-Realm opens a page")
SlashCmdList.WHELP("me")
check(WhelpProfileFrame.key == "Tester-SomeRealm" and not WhelpProfileFrame.write.shown, "/whelp me has no write button")
chat = {}
SlashCmdList.WHELP("prompt")
check(WhelpDB.opts.prompt == false and chat[1]:find("off"), "/whelp prompt toggles")
SlashCmdList.WHELP("help")
check(#chat > 4, "help lists the commands")

fire("PLAYER_LOGOUT")
print(failures == 0 and "\nall passed" or ("\n" .. failures .. " failed"))
os.exit(failures == 0 and 0 or 1)
