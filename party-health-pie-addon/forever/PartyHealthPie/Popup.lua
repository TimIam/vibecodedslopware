-- The hover pop-up: the debuffs you can dispel on the player under the pointer, and your own heals
-- over time on them. In combat the game hides each aura's name, icon, type and time left from addons,
-- so those go straight into widgets that accept hidden values. Lua reads only the list of aura IDs,
-- which the game leaves plain.
local _, ns = ...

local MAX_ROWS = 4
local WIDTH, PAD, ROW, ICON, HEADER = 220, 6, 18, 16, 14
local SORT = Enum.UnitAuraSortRule.ExpirationOnly
-- "RAID" on harmful auras means the ones you can dispel. The game's raid frames use the second filter
-- for the heals over time you cast.
local SECTIONS = {
	{ key = "dispel", filter = "HARMFUL|RAID", title = "You can dispel" },
	{ key = "hots", filter = "HELPFUL|PLAYER|RAID_IN_COMBAT", title = "Your heals over time" },
}

-- The preview has nobody real to read, so it shows made-up auras like these.
local DEMO_DEBUFFS = {
	{ "Frost Nova", "Interface\\Icons\\Spell_Frost_FrostNova" },
	{ "Curse of Tongues", "Interface\\Icons\\Spell_Shadow_CurseOfTounges" },
	{ "Infected Wound", "Interface\\Icons\\Spell_Nature_NullifyDisease" },
	{ "Deadly Poison", "Interface\\Icons\\Spell_Nature_NullifyPoison" },
}
local DEMO_HOT = { "Renew", "Interface\\Icons\\Spell_Holy_Renew", 15 }

local popup, hover
local elapsed = 0
local CURSOR_GAP = 16 -- the pop-up's lower-left corner sits this far up and right of the pointer

-- Keeps the pop-up just above and to the right of the pointer. Clamping keeps it on screen near edges.
local function FollowCursor()
	local x, y = GetCursorPosition()
	local scale = UIParent:GetEffectiveScale()
	popup:ClearAllPoints()
	popup:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", x / scale + CURSOR_GAP, y / scale + CURSOR_GAP)
end

local function Plain(v)
	if issecretvalue and issecretvalue(v) then return nil end
	return v
end

-- What the last hover did, for /php popup. An error is also said once in chat, because the game
-- hides addon errors unless Lua errors are turned on.
local lastError, lastHover

local function Guard(fn, ...)
	local ok, err = pcall(fn, ...)
	if not ok then
		err = tostring(err)
		if err ~= lastError then print("Heal Pie: the hover pop-up hit an error: " .. err) end
		lastError = err
	end
end

local function NewText(parent)
	local text = parent:CreateFontString(nil, "OVERLAY")
	text:SetFont(STANDARD_TEXT_FONT, 11, "")
	return text
end

local function NewRow()
	local row = CreateFrame("Frame", nil, popup)
	row:SetSize(WIDTH - PAD * 2, ROW)
	row.icon = row:CreateTexture(nil, "ARTWORK")
	row.icon:SetSize(ICON, ICON)
	row.icon:SetPoint("LEFT", row, "LEFT", 0, 0)
	row.seconds = NewText(row)
	row.seconds:SetPoint("RIGHT", row, "RIGHT", 0, 0)
	row.minutes = NewText(row)
	row.minutes:SetPoint("RIGHT", row, "RIGHT", 0, 0)
	row.name = NewText(row)
	row.name:SetPoint("LEFT", row.icon, "RIGHT", 5, 0)
	row.name:SetPoint("RIGHT", row, "RIGHT", -30, 0)
	row.name:SetJustifyH("LEFT")
	return row
end

local function Build()
	popup = CreateFrame("Frame", "HealPieAuraPopup", UIParent)
	popup:SetFrameStrata("TOOLTIP")
	popup:SetClampedToScreen(true)
	popup:SetSize(WIDTH, 40)
	popup:Hide()
	local back = popup:CreateTexture(nil, "BACKGROUND")
	back:SetAllPoints(popup)
	back:SetColorTexture(0.04, 0.04, 0.06, 0.88)
	popup.sections = {}
	for _, section in ipairs(SECTIONS) do
		local header = NewText(popup)
		header:SetTextColor(0.65, 0.65, 0.65)
		header:SetText(section.title)
		popup.sections[section.key] = { header = header, rows = {} }
	end
	popup:SetScript("OnUpdate", function(_, dt)
		FollowCursor()
		elapsed = elapsed + dt
		if elapsed < 0.2 then return end
		elapsed = 0
		Guard(ns.RefreshAuraPopup)
	end)
end

local function Row(section, i)
	local row = section.rows[i]
	if not row then
		row = NewRow()
		section.rows[i] = row
	end
	return row
end

local function SetCountdown(row, seconds, secondsAlpha, minutes, minutesAlpha)
	row.seconds:SetFormattedText("%.0f", seconds)
	row.seconds:SetAlpha(secondsAlpha)
	row.minutes:SetFormattedText("%.0fm", minutes)
	row.minutes:SetAlpha(minutesAlpha)
end

-- One aura's row. Any of the game's answers may be hidden, so nothing here is compared or computed;
-- a call that fails because the aura just ended leaves the row out.
local function FillRow(row, unit, id, aura, isDebuff)
	local okTimer, timer = pcall(C_UnitAuras.GetAuraDuration, unit, id)
	if not okTimer or not timer then return false end
	local okCount = pcall(function() SetCountdown(row, ns.AuraCountdown(timer)) end)
	if not okCount then SetCountdown(row, 0, 0, 0, 0) end
	local okName = aura ~= nil and pcall(function()
		row.icon:SetTexture(aura.icon)
		row.name:SetText(aura.name)
	end)
	if not okName then
		row.icon:SetTexture(nil)
		row.name:SetText(isDebuff and "A debuff" or "A heal over time")
	end
	if isDebuff then
		local okColor, color = pcall(ns.DispelColor, unit, id)
		if okColor and color then
			row.name:SetTextColor(color:GetRGB())
		else
			row.name:SetTextColor(1, 1, 1)
		end
	else
		local c = ns.db.healColor
		row.name:SetTextColor(c[1], c[2], c[3])
	end
	return true
end

-- The aura data comes back in the same order as the IDs. Where an aura's own ID is readable it is
-- checked against the list; where it is hidden the order is trusted.
local function AuraFor(data, i, id)
	local aura = data[i]
	if type(aura) ~= "table" then return nil end
	local ok, own = pcall(function() return Plain(aura.auraInstanceID) end)
	if ok and own and own ~= id then
		for _, other in ipairs(data) do
			local okOther, otherID = pcall(function() return Plain(other.auraInstanceID) end)
			if okOther and otherID == id then return other end
		end
		return nil
	end
	return aura
end

local function FillLive(section, filter, unit, isDebuff)
	local ok, ids = pcall(C_UnitAuras.GetUnitAuraInstanceIDs, unit, filter, MAX_ROWS, SORT)
	if not ok or type(ids) ~= "table" then return 0 end
	local okData, data = pcall(C_UnitAuras.GetUnitAuras, unit, filter, MAX_ROWS, SORT)
	if not okData or type(data) ~= "table" then data = {} end
	local used = 0
	for i = 1, MAX_ROWS do
		local id = Plain(ids[i])
		if not id then break end
		if FillRow(Row(section, used + 1), unit, id, AuraFor(data, i, id), isDebuff) then used = used + 1 end
	end
	return used
end

local function FillDemo(section, slot, isDebuff)
	local d = slot.demo
	local name, icon, seconds, color
	if isDebuff then
		if not d.debuff then return 0 end
		name, icon = DEMO_DEBUFFS[d.debuff.type][1], DEMO_DEBUFFS[d.debuff.type][2]
		seconds, color = d.debuff.seconds, ns.DISPEL_COLORS[d.debuff.type]
	else
		if slot.index % 2 == 0 then return 0 end
		name, icon, seconds, color = DEMO_HOT[1], DEMO_HOT[2], DEMO_HOT[3], ns.db.healColor
	end
	local row = Row(section, 1)
	row.icon:SetTexture(icon)
	row.name:SetText(name)
	row.name:SetTextColor(color[1], color[2], color[3])
	SetCountdown(row, ns.SecondsCountdown(seconds - GetTime() % seconds))
	return 1
end

local function Layout(counts)
	local y = -PAD
	for _, section in ipairs(SECTIONS) do
		local part = popup.sections[section.key]
		local count = counts[section.key]
		part.header:ClearAllPoints()
		if count > 0 then
			part.header:SetPoint("TOPLEFT", popup, "TOPLEFT", PAD, y)
			part.header:Show()
			y = y - HEADER
		else
			part.header:Hide()
		end
		for i, row in ipairs(part.rows) do
			if i <= count then
				row:ClearAllPoints()
				row:SetPoint("TOPLEFT", popup, "TOPLEFT", PAD, y)
				row:Show()
				y = y - ROW
			else
				row:Hide()
			end
		end
	end
	popup:SetHeight(-y + PAD)
end

function ns.RefreshAuraPopup()
	if not popup or not hover then return end
	local counts = {}
	local any = false
	for _, section in ipairs(SECTIONS) do
		local part = popup.sections[section.key]
		local isDebuff = section.key == "dispel"
		local count = 0
		if hover.slot and hover.slot.demo then
			count = FillDemo(part, hover.slot, isDebuff)
		elseif hover.unit and Plain(UnitExists(hover.unit)) then
			count = FillLive(part, section.filter, hover.unit, isDebuff)
		end
		counts[section.key] = count
		any = any or count > 0
	end
	if not any then
		popup:Hide()
		return
	end
	Layout(counts)
	popup:Show()
end

local function Show(button, unit, slot)
	if not popup then Build() end
	local fresh = not hover or hover.button ~= button
	hover = { button = button, unit = unit, slot = slot }
	if fresh then elapsed = 0 end
	FollowCursor()
	ns.RefreshAuraPopup()
	lastHover = (slot and slot.demo and "a preview wedge" or tostring(unit)) .. (popup:IsShown() and ", pop-up shown" or ", nothing to show")
end

-- Called whenever the pointer is over a wedge. The pop-up hangs beside the pointer and follows it.
function ns.ShowAuraPopup(button, unit, slot)
	if not ns.db.auraPopup then
		lastHover = tostring(unit) .. ", pop-up turned off in the settings"
		return
	end
	Guard(Show, button, unit, slot)
end

-- /php popup: what the game lists on each member under each filter, and what the pop-up would show.
local CHECKS = {
	{ "HARMFUL", "debuffs" },
	{ "HARMFUL|RAID", "you can dispel" },
	{ "HELPFUL|PLAYER", "your buffs" },
	{ "HELPFUL|PLAYER|RAID_IN_COMBAT", "your heals over time" },
}

function ns.ReportPopup()
	local say = function(text) print("Heal Pie: " .. text) end
	say("pop-up is " .. (ns.db.auraPopup and "on" or "off in the settings") .. ".")
	say("last hover: " .. (lastHover or "none since loading"))
	if lastError then say("last error: " .. lastError) end
	if not popup then Build() end
	local any = false
	for _, slot in ipairs(ns.slots) do
		local unit = slot.unit
		if unit and Plain(UnitExists(unit)) then
			any = true
			local parts = {}
			for _, check in ipairs(CHECKS) do
				local ok, ids = pcall(C_UnitAuras.GetUnitAuraInstanceIDs, unit, check[1])
				if ok and type(ids) == "table" then
					parts[#parts + 1] = #ids .. " " .. check[2]
				else
					parts[#parts + 1] = check[2] .. " unreadable (" .. tostring(ids) .. ")"
				end
			end
			local rows = {}
			for _, section in ipairs(SECTIONS) do
				local ok, count = pcall(FillLive, popup.sections[section.key], section.filter, unit, section.key == "dispel")
				rows[#rows + 1] = ok and tostring(count) or ("error: " .. tostring(count))
			end
			local name = Plain(UnitName(unit)) or unit
			say(name .. " (" .. unit .. "): " .. table.concat(parts, ", ") .. "; pop-up rows " .. table.concat(rows, " + "))
		end
	end
	if not any then say("nobody to check; join a group first.") end
	if popup and not hover then popup:Hide() end
end

function ns.HideAuraPopup()
	hover = nil
	if popup then popup:Hide() end
end
