-- Whelp windows: Write a Review, a player's page, and the after-dungeon toast.
local _, ns = ...

local RED = "|cffd32323"
local GREY = "|cff999999"
local ROW_H = 18

local function fs(parent, font, text)
  local f = parent:CreateFontString(nil, "OVERLAY", font or "GameFontHighlight")
  if text then f:SetText(text) end
  return f
end

local function button(parent, text, w, h)
  local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  b:SetSize(w or 100, h or 22)
  b:SetText(text)
  return b
end

local function window(name, w, h, title)
  -- Plain backdrop chrome: BackdropTemplate is known to load on Forever.
  local f = CreateFrame("Frame", name, UIParent, "BackdropTemplate")
  f:SetSize(w, h)
  if f.SetBackdrop then
    f:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
      edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", edgeSize = 16,
      insets = { left = 4, right = 4, top = 4, bottom = 4 } })
    f:SetBackdropColor(0.06, 0.05, 0.05, 0.96)
    f:SetBackdropBorderColor(0.83, 0.14, 0.14, 1)
  end
  local bar = f:CreateTexture(nil, "ARTWORK")
  bar:SetPoint("TOPLEFT", 4, -4)
  bar:SetPoint("TOPRIGHT", -4, -4)
  bar:SetHeight(20)
  bar:SetColorTexture(0.83, 0.14, 0.14, 0.9)
  f.TitleText = fs(f, "GameFontHighlight")
  f.TitleText:SetPoint("TOP", 0, -8)
  local close = button(f, "X", 22, 18)
  close:SetPoint("TOPRIGHT", -6, -5)
  close:SetScript("OnClick", function() f:Hide() end)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:SetMovable(true)
  f:EnableMouse(true)
  f:RegisterForDrag("LeftButton")
  f:SetScript("OnDragStart", f.StartMoving)
  f:SetScript("OnDragStop", f.StopMovingOrSizing)
  f:SetClampedToScreen(true)
  if f.TitleText then f.TitleText:SetText(title) end
  f:Hide()
  tinsert(UISpecialFrames, name)
  return f
end

local function dateText(t) return date("%b %d", t or 0) end

local function placeLine(where, when)
  local bits = {}
  if where and where ~= "" then bits[#bits + 1] = where end
  if when then bits[#bits + 1] = dateText(when) end
  return table.concat(bits, " - ")
end

---------------------------------------------------------------------------
-- Write a Review
---------------------------------------------------------------------------
local RF                 -- the frame
local sel = nil          -- { key, class, role, where, stars, tags }
local rows = {}
local extraPeople = {}   -- people opened by name who were never in a saved party

local function people()
  local list = {}
  local session = ns.Session()
  local function section(title, members)
    if #members == 0 then return end
    list[#list + 1] = { header = title }
    for _, m in ipairs(members) do list[#list + 1] = m end
  end
  if session and #session.order > 0 then
    local ms = {}
    for _, key in ipairs(session.order) do
      local m = session.members[key]
      ms[#ms + 1] = { key = key, class = m.class, role = m.role, where = session.where }
    end
    section("Your group" .. (session.where ~= "" and (" - " .. session.where) or ""), ms)
  end
  for _, party in ipairs(ns.DB().parties) do
    if not (session and party.id == session.id) then
      local ms = {}
      for _, m in ipairs(party.members) do
        ms[#ms + 1] = { key = m.key, class = m.class, role = m.role, where = party.where }
      end
      section(placeLine(party.where, party.when), ms)
    end
  end
  local ms = {}
  for _, m in ipairs(extraPeople) do ms[#ms + 1] = m end
  section("Other", ms)
  return list
end

local function reviewedAny(key)
  for _, role in ipairs(ns.ROLES) do if ns.MyReview(key, role) then return true end end
  return false
end

local function paintStars(n)
  for i, s in ipairs(RF.stars) do
    local rgb = ns.STAR_RGB[n]
    if n > 0 and i <= n then s.box:SetColorTexture(rgb[1], rgb[2], rgb[3], 1)
    else s.box:SetColorTexture(0.22, 0.22, 0.22, 1) end
  end
  RF.starWord:SetText(n > 0 and ns.STAR_WORDS[n] or GREY .. "Select your rating|r")
end

local function updateCount()
  local n = #(RF.edit:GetText() or "")
  RF.count:SetText(("%s%d / %d|r"):format(n > ns.TEXT_BYTES - 10 and RED or GREY, n, ns.TEXT_BYTES))
end

local function loadRole(role)
  sel.role = role
  local old = ns.MyReview(sel.key, role)
  sel.stars = old and old.stars or 0
  sel.tags = ns.TagList(old and old.tags or 0)
  for _, r in ipairs(ns.ROLES) do
    local b = RF.roleButtons[r]
    if r == role then b:LockHighlight() else b:UnlockHighlight() end
    b:SetText((r == role and "> " or "") .. ns.ROLE_LABEL[r] .. (ns.MyReview(sel.key, r) and " *" or ""))
  end
  local defs = ns.TAGS[role]
  for i, cb in ipairs(RF.tags) do
    cb.label:SetText((defs[i][2] and "|cff60d060" or "|cffff7060") .. defs[i][1] .. "|r")
    cb:SetChecked(sel.tags[i])
  end
  RF.edit:SetText(old and old.text or "")
  updateCount()
  paintStars(sel.stars)
  RF.delete:SetShown(old ~= nil)
  RF.post:SetText(old and "Update Review" or "Post Review")
end

local function refreshList()
  local list = people()
  local child = RF.listChild
  for i, item in ipairs(list) do
    local row = rows[i]
    if not row then
      row = CreateFrame("Button", nil, child)
      row:SetSize(170, ROW_H)
      row:SetPoint("TOPLEFT", 0, -(i - 1) * ROW_H)
      row.text = fs(row, "GameFontHighlightSmall")
      row.text:SetPoint("LEFT", 4, 0)
      row.text:SetPoint("RIGHT", -2, 0)
      row.text:SetJustifyH("LEFT")
      row.hl = row:CreateTexture(nil, "BACKGROUND")
      row.hl:SetAllPoints()
      row.hl:SetColorTexture(0.83, 0.14, 0.14, 0.35)
      row:SetScript("OnClick", function(self) if self.item and self.item.key then ns.SelectPerson(self.item) end end)
      rows[i] = row
    end
    row.item = item
    if item.header then
      row.text:SetText("|cffffd100" .. item.header .. "|r")
      row.hl:Hide()
    else
      local mark = reviewedAny(item.key) and " |cff60d060(reviewed)|r" or ""
      row.text:SetText("  " .. ns.Display(item.key, item.class) .. mark)
      row.hl:SetShown(sel and sel.key == item.key and sel.where == item.where)
    end
    row:Show()
  end
  for i = #list + 1, #rows do rows[i]:Hide() end
  child:SetHeight(math.max(1, #list * ROW_H))
  RF.empty:SetShown(#list == 0)
  return list
end

function ns.SelectPerson(item)
  sel = { key = item.key, class = item.class, where = item.where or "" }
  RF.form:Show()
  RF.who:SetText(ns.Display(item.key, item.class))
  RF.where:SetText(GREY .. (sel.where ~= "" and ("at " .. sel.where) or "") .. "|r")
  local role = item.role
  if not role then
    for _, r in ipairs(ns.ROLES) do if ns.MyReview(item.key, r) then role = r break end end
  end
  loadRole(role or "DAMAGER")
  refreshList()
end

local function post()
  if not sel then return end
  local tags = {}
  for i, cb in ipairs(RF.tags) do tags[i] = cb:GetChecked() and true or false end
  local ok, err = ns.PostReview(sel.key, sel.role, sel.stars, ns.TagMask(tags), RF.edit:GetText(), sel.where, sel.class)
  if not ok then ns.Say(err) return end
  ns.Say(("Review posted for %s: %s"):format(ns.Display(sel.key, sel.class), ns.StarText(sel.stars, 12)))
  RF.edit:ClearFocus()
  loadRole(sel.role)
  refreshList()
end

local function buildReview()
  RF = window("WhelpReviewFrame", 640, 440, "Whelp - Write a Review")
  ns.reviewFrame = RF

  local logo = fs(RF, "GameFontNormalLarge", RED .. "whelp|r " .. GREY .. "real reviews from real party members|r")
  logo:SetPoint("TOPLEFT", 14, -30)

  local scroll = CreateFrame("ScrollFrame", nil, RF, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 12, -56)
  scroll:SetSize(176, 368)
  local child = CreateFrame("Frame", nil, scroll)
  child:SetSize(170, 1)
  scroll:SetScrollChild(child)
  RF.listChild = child
  RF.empty = fs(RF, "GameFontDisable", "Group up and run something.\nYour parties show up here.")
  RF.empty:SetPoint("TOPLEFT", 16, -64)
  RF.empty:SetWidth(170)

  local form = CreateFrame("Frame", nil, RF)
  form:SetPoint("TOPLEFT", 214, -56)
  form:SetPoint("BOTTOMRIGHT", -14, 12)
  form:Hide()
  RF.form = form
  RF.pick = fs(RF, "GameFontNormal", "Pick someone on the left to review.")
  RF.pick:SetPoint("CENTER", form, "CENTER")
  form:SetScript("OnShow", function() RF.pick:Hide() end)

  RF.who = fs(form, "GameFontNormalHuge")
  RF.who:SetPoint("TOPLEFT", 0, 0)
  RF.where = fs(form, "GameFontHighlightSmall")
  RF.where:SetPoint("LEFT", RF.who, "RIGHT", 8, -2)

  local asLabel = fs(form, "GameFontNormalSmall", "Reviewing them as")
  asLabel:SetPoint("TOPLEFT", 0, -36)
  RF.roleButtons = {}
  for i, role in ipairs(ns.ROLES) do
    local b = button(form, ns.ROLE_LABEL[role], 90, 22)
    b:SetPoint("TOPLEFT", 110 + (i - 1) * 96, -31)
    b:SetScript("OnClick", function() if sel then loadRole(role) end end)
    RF.roleButtons[role] = b
  end

  RF.stars = {}
  for i = 1, 5 do
    local s = CreateFrame("Button", nil, form)
    s:SetSize(30, 30)
    s:SetPoint("TOPLEFT", (i - 1) * 34, -64)
    s.box = s:CreateTexture(nil, "BACKGROUND")
    s.box:SetAllPoints()
    s.star = s:CreateTexture(nil, "ARTWORK")
    s.star:SetPoint("TOPLEFT", 4, -4)
    s.star:SetPoint("BOTTOMRIGHT", -4, 4)
    s.star:SetTexture(ns.STAR_TEX)
    s.star:SetDesaturated(true)
    s.star:SetVertexColor(1, 1, 1)
    s:SetScript("OnEnter", function() paintStars(i) end)
    s:SetScript("OnLeave", function() paintStars(sel and sel.stars or 0) end)
    s:SetScript("OnClick", function() if sel then sel.stars = i; paintStars(i) end end)
    RF.stars[i] = s
  end
  RF.starWord = fs(form, "GameFontNormalLarge")
  RF.starWord:SetPoint("LEFT", RF.stars[5], "RIGHT", 12, 0)

  local hl = fs(form, "GameFontNormalSmall", "Highlights")
  hl:SetPoint("TOPLEFT", 0, -104)
  RF.tags = {}
  for i = 1, 8 do
    local cb = CreateFrame("CheckButton", nil, form, "UICheckButtonTemplate")
    cb:SetSize(22, 22)
    -- good highlights on the left, bad on the right
    local col, row = i <= 4 and 0 or 1, (i - 1) % 4
    cb:SetPoint("TOPLEFT", col * 206, -118 - row * 22)
    cb.label = fs(cb, "GameFontHighlightSmall")
    cb.label:SetPoint("LEFT", cb, "RIGHT", 2, 0)
    RF.tags[i] = cb
  end

  local boxLabel = fs(form, "GameFontNormalSmall", "Your review")
  boxLabel:SetPoint("TOPLEFT", 0, -214)
  local box = CreateFrame("Frame", nil, form, "BackdropTemplate")
  box:SetPoint("TOPLEFT", 0, -228)
  box:SetSize(410, 90)
  if box.SetBackdrop then
    box:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
      edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", edgeSize = 12,
      insets = { left = 3, right = 3, top = 3, bottom = 3 } })
    box:SetBackdropColor(0, 0, 0, 0.6)
  end
  local edit = CreateFrame("EditBox", nil, box)
  edit:SetMultiLine(true)
  edit:SetAutoFocus(false)
  edit:SetFontObject(ChatFontNormal)
  edit:SetPoint("TOPLEFT", 8, -8)
  edit:SetPoint("BOTTOMRIGHT", -8, 8)
  edit:SetWidth(394)
  edit:SetMaxBytes(ns.TEXT_BYTES + 1)
  edit:SetScript("OnEscapePressed", edit.ClearFocus)
  edit:SetScript("OnTextChanged", updateCount)
  box:EnableMouse(true)
  box:SetScript("OnMouseDown", function() edit:SetFocus() end)
  RF.edit = edit
  RF.count = fs(form, "GameFontHighlightSmall")
  RF.count:SetPoint("TOPRIGHT", box, "BOTTOMRIGHT", 0, -4)

  RF.post = button(form, "Post Review", 130, 26)
  RF.post:SetPoint("TOPLEFT", box, "BOTTOMLEFT", 0, -20)
  RF.post:SetScript("OnClick", post)
  RF.delete = button(form, "Delete", 80, 26)
  RF.delete:SetPoint("LEFT", RF.post, "RIGHT", 8, 0)
  RF.delete:SetScript("OnClick", function()
    if not sel then return end
    ns.DeleteReview(sel.key, sel.role)
    loadRole(sel.role)
    refreshList()
  end)
  local page = button(form, "See their page", 120, 26)
  page:SetPoint("LEFT", RF.delete, "RIGHT", 8, 0)
  page:SetScript("OnClick", function() if sel then ns.OpenProfile(sel.key) end end)

  RF:SetScript("OnShow", function() refreshList() end)
end

function ns.OpenReview(key, class)
  if not RF then buildReview() end
  if ns.toast then ns.toast:Hide() end
  RF:Show()
  local list = refreshList()
  if key then
    if key == ns.Me() then ns.Say("You can't review your own business.") return end
    for _, item in ipairs(list) do
      if item.key == key then ns.SelectPerson(item) return end
    end
    local item = { key = key, class = class, where = "" }
    table.insert(extraPeople, 1, item)
    refreshList()
    ns.SelectPerson(item)
  elseif not sel then
    for _, item in ipairs(list) do
      if item.key and not reviewedAny(item.key) then ns.SelectPerson(item) return end
    end
  end
end

---------------------------------------------------------------------------
-- A player's page
---------------------------------------------------------------------------
local PF
local showHidden = false

local function tagLine(r)
  local good, bad = {}, {}
  local tl = ns.TagList(r.tags)
  for i = 1, 8 do
    if tl[i] then
      local def = ns.TAGS[r.role][i]
      if def[2] then good[#good + 1] = def[1] else bad[#bad + 1] = def[1] end
    end
  end
  local out = {}
  if #good > 0 then out[#out + 1] = "|cff60d060+ " .. table.concat(good, ", ") .. "|r" end
  if #bad > 0 then out[#out + 1] = "|cffff7060- " .. table.concat(bad, ", ") .. "|r" end
  return table.concat(out, "\n")
end

local function reviewText(r, db)
  local author = r.author == ns.Me() and "|cffffd100You|r" or ns.Display(r.author)
  if ns.IsElite(db, r.author) then author = author .. " " .. RED .. "Elite '" .. date("%y") .. "|r" end
  local lines = {
    author .. GREY .. "  " .. placeLine(r.where, r.when) .. "|r",
    ns.StarText(r.stars, 13) .. "  |cffccccccas " .. ns.ROLE_LABEL[r.role] .. "|r",
  }
  if r.text ~= "" then lines[#lines + 1] = "|cffffffff" .. r.text .. "|r" end
  local t = tagLine(r)
  if t ~= "" then lines[#lines + 1] = t end
  return table.concat(lines, "\n")
end

local function refreshProfile()
  local key = PF.key
  local db = ns.DB()
  local s = ns.Summary(db, key, ns.Me())
  local mine = key == ns.Me()
  PF.name:SetText(ns.Display(key, s.class) .. (s.claimed and "  |cff4fa3ffClaimed|r" or ""))
  if s.n > 0 then
    PF.stars:SetText(("%s  |cffffffff%.1f|r  %s%d review%s|r"):format(ns.StarText(s.avg, 18), s.avg, GREY, s.n, s.n == 1 and "" or "s"))
  else
    PF.stars:SetText(GREY .. "No recommended reviews yet." .. (mine and "" or " Be the first!") .. "|r")
  end
  local roles = {}
  for _, role in ipairs(ns.ROLES) do
    local br = s.byRole[role]
    if br then roles[#roles + 1] = ("%s %s %.1f %s(%d)|r"):format(ns.ROLE_LABEL[role], ns.StarText(br.avg, 11), br.avg, GREY, br.n) end
  end
  PF.roles:SetText(table.concat(roles, "    "))
  PF.alert:SetShown(s.alert)
  local tags = {}
  for i = 1, math.min(6, #s.tags) do
    local t = s.tags[i]
    tags[#tags + 1] = ("%s%s|r x%d"):format(t.good and "|cff60d060" or "|cffff7060", t.label, t.count)
  end
  PF.tags:SetText(#tags > 0 and ("Highlights: " .. table.concat(tags, ", ")) or "")

  local blocks = {}
  for _, r in ipairs(s.list) do blocks[#blocks + 1] = reviewText(r, db) end
  if #s.hidden > 0 then
    PF.hiddenBtn:Show()
    PF.hiddenBtn:SetText(showHidden and "Hide not recommended" or (#s.hidden .. " not recommended"))
    if showHidden then
      blocks[#blocks + 1] = GREY .. "Not currently recommended. These reviewers haven't written enough reviews for us to trust them yet.|r"
      for _, r in ipairs(s.hidden) do blocks[#blocks + 1] = reviewText(r, db) end
    end
  else
    PF.hiddenBtn:Hide()
  end
  if #blocks == 0 then
    blocks[1] = GREY .. (mine and "Nobody has reviewed you yet. Reviews from other Whelp users arrive when you group or share a guild with them."
      or "Nothing here yet. Reviews from other Whelp users in your guild or group arrive as you play.") .. "|r"
  end
  PF.body:SetText(table.concat(blocks, "\n\n"))
  PF.bodyChild:SetHeight(PF.body:GetStringHeight() + 10)
  PF.write:SetShown(not mine)
end

local function buildProfile()
  PF = window("WhelpProfileFrame", 440, 500, "Whelp")
  ns.profileFrame = PF
  PF.name = fs(PF, "GameFontNormalHuge")
  PF.name:SetPoint("TOPLEFT", 16, -32)
  PF.stars = fs(PF, "GameFontHighlight")
  PF.stars:SetPoint("TOPLEFT", 16, -62)
  PF.roles = fs(PF, "GameFontHighlightSmall")
  PF.roles:SetPoint("TOPLEFT", 16, -86)
  PF.alert = CreateFrame("Frame", nil, PF)
  PF.alert:SetPoint("TOPLEFT", 12, -104)
  PF.alert:SetSize(416, 34)
  local bg = PF.alert:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints()
  bg:SetColorTexture(0.6, 0.05, 0.05, 0.8)
  local at = fs(PF.alert, "GameFontHighlightSmall",
    "|cffffffffCONSUMER ALERT|r  This player has received an unusual number of bad reviews. Group at your own risk.")
  at:SetPoint("TOPLEFT", 6, -4)
  at:SetPoint("BOTTOMRIGHT", -6, 4)
  at:SetJustifyH("LEFT")
  PF.tags = fs(PF, "GameFontHighlightSmall")
  PF.tags:SetPoint("TOPLEFT", 16, -144)
  PF.tags:SetWidth(408)
  PF.tags:SetJustifyH("LEFT")

  local head = fs(PF, "GameFontNormal", "Recommended Reviews")
  head:SetPoint("TOPLEFT", 16, -178)
  local scroll = CreateFrame("ScrollFrame", nil, PF, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 14, -196)
  scroll:SetPoint("BOTTOMRIGHT", -32, 44)
  local child = CreateFrame("Frame", nil, scroll)
  child:SetSize(380, 1)
  scroll:SetScrollChild(child)
  PF.bodyChild = child
  PF.body = fs(child, "GameFontHighlightSmall")
  PF.body:SetPoint("TOPLEFT", 2, -2)
  PF.body:SetWidth(376)
  PF.body:SetJustifyH("LEFT")
  PF.body:SetSpacing(2)

  PF.write = button(PF, "Write a Review", 130, 24)
  PF.write:SetPoint("BOTTOMLEFT", 14, 12)
  PF.write:SetScript("OnClick", function() ns.OpenReview(PF.key) end)
  PF.hiddenBtn = button(PF, "", 170, 24)
  PF.hiddenBtn:SetPoint("BOTTOMRIGHT", -14, 12)
  PF.hiddenBtn:SetScript("OnClick", function() showHidden = not showHidden; refreshProfile() end)
end

function ns.OpenProfile(key)
  if not PF then buildProfile() end
  if PF.key ~= key then showHidden = false end
  PF.key = key
  refreshProfile()
  PF:Show()
end

function ns.OnReviewsChanged(subject)
  if PF and PF:IsShown() and PF.key == subject then refreshProfile() end
  if RF and RF:IsShown() then refreshList() end
end

---------------------------------------------------------------------------
-- After a run: "How was it?"
---------------------------------------------------------------------------
function ns.ShowToast(party)
  local t = ns.toast
  if not t then
    t = CreateFrame("Frame", "WhelpToast", UIParent, "BackdropTemplate")
    ns.toast = t
    t:SetSize(340, 78)
    t:SetPoint("TOP", 0, -140)
    t:SetFrameStrata("DIALOG")
    if t.SetBackdrop then
      t:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", edgeSize = 14,
        insets = { left = 4, right = 4, top = 4, bottom = 4 } })
      t:SetBackdropColor(0.12, 0.02, 0.02, 0.95)
      t:SetBackdropBorderColor(0.83, 0.14, 0.14, 1)
    end
    t.text = fs(t, "GameFontHighlight")
    t.text:SetPoint("TOP", 0, -12)
    t.text:SetWidth(320)
    local yes = button(t, "Write reviews", 120, 22)
    yes:SetPoint("BOTTOMRIGHT", t, "BOTTOM", -4, 10)
    yes:SetScript("OnClick", function() t:Hide(); ns.OpenReview(t.first) end)
    local no = button(t, "Not now", 90, 22)
    no:SetPoint("BOTTOMLEFT", t, "BOTTOM", 4, 10)
    no:SetScript("OnClick", function() t:Hide() end)
    t:SetScript("OnUpdate", function(self, e)
      self.left = (self.left or 0) - e
      if self.left <= 0 then self:Hide() end
    end)
  end
  local place = party.where ~= "" and party.where or "your run"
  t.text:SetText(("%swhelp|r  How was %s?\nRate your party of %d."):format(RED, place, #party.members))
  t.first = party.members[1] and party.members[1].key
  t.left = 60
  t:Show()
  if PlaySound and SOUNDKIT and SOUNDKIT.TELL_MESSAGE then pcall(PlaySound, SOUNDKIT.TELL_MESSAGE) end
end
