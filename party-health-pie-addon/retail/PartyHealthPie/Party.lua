-- Who is in each wedge and how they are doing, plus events, dragging and the preview mode.
local addonName, ns = ...

local SLOTS = 5
local CELLS_FIRST, CELLS_LAST = 1, 63 -- sheet cell 0 is empty, and a live unit always shows a sliver

-- A plain copy of a value, or nil when the client keeps it secret.
local function Plain(v)
	if issecretvalue and issecretvalue(v) then return nil end
	return v
end

local ROUND_UP = 0.49 -- just under half, so a whole number of seconds left isn't shown as one more
local MINUTES_FROM = 99.001 -- seconds left above which the countdown is in minutes
local LONGEST_DEBUFF = 86400 -- the rounding curves are straight lines out to here

local function CellForFraction(f)
	local span = CELLS_LAST - CELLS_FIRST
	local index = CELLS_FIRST + math.floor(math.max(0, math.min(1, f)) * span + 0.5)
	return ns.ApiCell(index)
end

-- ---- Curves: how a secret percentage is turned into something a texture can use ----------------

local curves = {}

local function BuildSharedCurves()
	local step = Enum.LuaCurveType.Step

	local cell = C_CurveUtil.CreateCurve()
	cell:SetType(step)
	local span = CELLS_LAST - CELLS_FIRST
	for k = CELLS_FIRST, CELLS_LAST do
		cell:AddPoint(math.max(0, (k - CELLS_FIRST - 0.5) / span), ns.ApiCell(k))
	end
	curves.cell = cell

	-- The bare percent's scale is undocumented; a curve's input is documented as 0-1.
	local fraction = C_CurveUtil.CreateCurve()
	fraction:SetType(Enum.LuaCurveType.Linear)
	fraction:AddPoint(0, 0)
	fraction:AddPoint(1, 1)
	curves.fraction = fraction

	local lowAlpha = C_CurveUtil.CreateCurve()
	lowAlpha:SetType(step)
	lowAlpha:AddPoint(0, 1)
	lowAlpha:AddPoint(ns.LOW_ENTER + 0.0001, 0)
	curves.lowAlpha = lowAlpha

	-- The game's dispel type numbers are the input. Anything past poison reads as white.
	local dispel = C_CurveUtil.CreateColorCurve()
	dispel:SetType(step)
	dispel:AddPoint(0, CreateColor(1, 1, 1, 1))
	for id, c in ipairs(ns.DISPEL_COLORS) do
		dispel:AddPoint(id, CreateColor(c[1], c[2], c[3], 1))
	end
	dispel:AddPoint(#ns.DISPEL_COLORS + 1, CreateColor(1, 1, 1, 1))
	curves.dispel = dispel

	-- The halo fades as the debuff runs out, but never so far that it can be missed.
	local glow = C_CurveUtil.CreateCurve()
	glow:SetType(Enum.LuaCurveType.Linear)
	glow:AddPoint(0, ns.GLOW_MIN)
	glow:AddPoint(1, 1)
	curves.glow = glow

	-- The countdown rounds up, like the game's own cooldowns, so it never reads 0 while the debuff is on.
	-- "%.0f" rounds to nearest, so adding just under half does it. Past MINUTES_FROM seconds it counts
	-- in minutes instead, so a long curse reads "5m" rather than a number wider than the symbol.
	local function RoundedUp(perUnit)
		local curve = C_CurveUtil.CreateCurve()
		curve:SetType(Enum.LuaCurveType.Linear)
		curve:AddPoint(0, ROUND_UP)
		curve:AddPoint(LONGEST_DEBUFF, LONGEST_DEBUFF / perUnit + ROUND_UP)
		return curve
	end
	curves.seconds, curves.minutes = RoundedUp(1), RoundedUp(60)

	-- A debuff with no end has zero seconds left, and no number is better than a stuck 0.
	local secondsAlpha = C_CurveUtil.CreateCurve()
	secondsAlpha:SetType(step)
	secondsAlpha:AddPoint(0, 0)
	secondsAlpha:AddPoint(0.05, 1)
	secondsAlpha:AddPoint(MINUTES_FROM, 0)
	curves.secondsAlpha = secondsAlpha
	local minutesAlpha = C_CurveUtil.CreateCurve()
	minutesAlpha:SetType(step)
	minutesAlpha:AddPoint(0, 0)
	minutesAlpha:AddPoint(MINUTES_FROM, 1)
	curves.minutesAlpha = minutesAlpha
end

-- At or below the low threshold the wedge is the low colour; above it, the class colour.
local function BuildFillCurve(class)
	local curve = C_CurveUtil.CreateColorCurve()
	curve:SetType(Enum.LuaCurveType.Step)
	local low, cls = ns.db.lowFill, ns.ClassColor(class)
	curve:AddPoint(0, CreateColor(low[1], low[2], low[3], 1))
	curve:AddPoint(ns.LOW_ENTER + 0.0001, CreateColor(cls[1], cls[2], cls[3], 1))
	return curve
end

local function FillCurve(class)
	curves.fill = curves.fill or {}
	if not curves.fill[class] then curves.fill[class] = BuildFillCurve(class) end
	return curves.fill[class]
end

-- ---- Drawing one member ---------------------------------------------------------------------

-- Preview members hold plain fractions. Real members ask the game, which may answer with a secret.
local function HealthFraction(slot)
	if slot.demo then return slot.demo.health end
	return UnitHealthPercent(slot.unit, false, curves.fraction)
end

local function ApplyHealth(slot)
	if slot.mode ~= "live" then return end
	local class = slot.class
	local fraction = Plain(HealthFraction(slot))

	if fraction then
		-- Readable: the full rule, staying red until the member is back to 50%.
		if fraction <= ns.LOW_ENTER then
			slot.low = true
		elseif fraction >= ns.LOW_LEAVE then
			slot.low = false
		end
		ns.SetCell(slot.fill, CellForFraction(fraction))
		local c = slot.low and ns.db.lowFill or ns.ClassColor(class)
		slot.fill:SetVertexColor(c[1], c[2], c[3])
		ns.SetLowAlpha(slot, slot.low and 1 or 0)
	else
		-- Secret: no comparing or remembering is possible, so the curves apply the 33% line.
		local unit = slot.unit
		ns.SetCell(slot.fill, UnitHealthPercent(unit, false, curves.cell))
		local color = UnitHealthPercent(unit, false, FillCurve(class))
		slot.fill:SetVertexColor(color:GetRGB())
		ns.SetLowAlpha(slot, UnitHealthPercent(unit, false, curves.lowAlpha))
	end
end

local function ApplyPet(slot)
	if slot.mode ~= "live" or not slot.showsPet then return end
	local c = ns.PetColor(slot.class)
	slot.pet:SetVertexColor(c[1], c[2], c[3])
	if slot.demo then
		ns.SetCell(slot.pet, CellForFraction(slot.demo.pet))
	else
		ns.SetCell(slot.pet, UnitHealthPercent(slot.petUnit, false, curves.cell))
	end
end

local function ApplyResource(slot)
	if slot.mode ~= "live" or not slot.showsResource then return end
	local c = ns.ResourceColor(slot.powerToken)
	slot.resource:SetVertexColor(c[1], c[2], c[3])
	if slot.demo then
		ns.SetCell(slot.resource, CellForFraction(slot.demo.resource))
	else
		ns.SetCell(slot.resource, UnitPowerPercent(slot.unit, slot.powerType, false, curves.cell))
	end
end

local PREVIEW_MAX_HEALTH = 1000

local function ApplyShield(slot)
	if slot.mode ~= "live" then return end
	if slot.demo then
		ns.SetShield(slot, PREVIEW_MAX_HEALTH, slot.demo.shield * PREVIEW_MAX_HEALTH)
	else
		ns.SetShield(slot, UnitHealthMax(slot.unit), UnitGetTotalAbsorbs(slot.unit))
	end
end

local function ApplyHeal(slot)
	if slot.mode ~= "live" then return end
	if slot.demo then
		local d = slot.demo
		ns.SetHeal(slot, PREVIEW_MAX_HEALTH, d.health * PREVIEW_MAX_HEALTH, d.heal * PREVIEW_MAX_HEALTH)
		return
	end
	local unit = slot.unit
	-- Nil when nothing is incoming. A secret number is always truthy, so this test is allowed.
	ns.SetHeal(slot, UnitHealthMax(unit), UnitHealth(unit, false), UnitGetIncomingHeals(unit) or 0)
end

-- Selecting a pet outlines only its slice, and a dead member can be selected for a resurrection.
local function ApplyTarget(slot)
	local onMember, onPet = false, false
	if slot.demo then
		onMember = slot.demo.selected == true
	elseif slot.unit and slot.mode ~= "empty" then
		onMember = UnitIsUnit("target", slot.unit)
		if slot.mode == "live" and slot.showsPet then
			onPet = UnitIsUnit("target", slot.petUnit)
		end
	end
	ns.SetTargetOutline(slot, onMember, onPet)
end

-- The class's secondary resource if the player chose it and this spec has one, or else its main power.
local function ChooseResource(unit, class, powerType, powerToken)
	local secondary = ns.ActiveSecondary(class)
	if secondary then
		local max = Plain(UnitPowerMax(unit, secondary.powerType))
		if max and max > 0 then return secondary.powerType, secondary.token end
	end
	return powerType, powerToken
end

local ROLE_TEXTURES = { TANK = ns.TEX .. "role_tank", HEALER = ns.TEX .. "role_healer", DAMAGER = ns.TEX .. "role_dps" }
local ROLE_OPTIONS = { displayRoleIcon = true, textureMap = ROLE_TEXTURES }
local ROLE_TINTS = { TANK = ns.TEX .. "role_tank_w", HEALER = ns.TEX .. "role_healer_w", DAMAGER = ns.TEX .. "role_dps_w" }
local ROLE_TINT_OPTIONS = { displayRoleIcon = true, textureMap = ROLE_TINTS }

local ANGEL = ns.TEX .. "role_angel"

-- True while someone is casting a resurrection on this member. The game's raid frames read the same
-- answer plainly; if a client ever hides it, no angel shows.
local function BeingRezzed(slot)
	if slot.mode == "empty" then return false end
	if slot.demo then return slot.demo.rez == true end
	return UnitHasIncomingResurrection ~= nil and Plain(UnitHasIncomingResurrection(slot.unit)) == true
end

-- Blizzard's helper for addons: it picks the art itself, so Lua never has to compare a secret role.
-- Someone with no role set gets no symbol, the same as on the game's own party frames. An incoming
-- resurrection swaps in an angel, even for someone with no role or with role symbols turned off.
local function ApplyRole(slot)
	if BeingRezzed(slot) then
		ns.SetRole(slot, ANGEL, true)
	elseif slot.mode == "empty" or not ns.db.roleIcons then
		ns.SetRole(slot, nil, false)
	elseif slot.demo then
		ns.SetRole(slot, ROLE_TEXTURES[slot.demo.role], true)
	else
		local info = UnitFrameUtil.GetUnitRoleIconDisplayInfo(slot.unit, ROLE_OPTIONS)
		ns.SetRole(slot, info.roleIconTexture, info.showRoleIcon)
	end
end

-- The debuff this player can dispel that runs out soonest. The list of IDs is plain, but the type and
-- the time left are not, so they come back as a color and a duration object for widgets to use.
-- Timed debuffs sort before ones with no end, so a permanent one never hides another's countdown.
local function ShownDebuffID(unit)
	local ids = C_UnitAuras.GetUnitAuraInstanceIDs(unit, "HARMFUL|RAID", 1, Enum.UnitAuraSortRule.ExpirationOnly)
	return ids and Plain(ids[1])
end

local function ReadDebuff(unit)
	local id = ShownDebuffID(unit)
	if not id then return end
	return C_UnitAuras.GetAuraDispelTypeColor(unit, id, curves.dispel), C_UnitAuras.GetAuraDuration(unit, id)
end

-- The countdown's four values, from a duration object or, in the preview, plain seconds.
local function Countdown(evaluate, source)
	return evaluate(source, curves.seconds), evaluate(source, curves.secondsAlpha),
		evaluate(source, curves.minutes), evaluate(source, curves.minutesAlpha)
end
local function FromDuration(timer, curve) return timer:EvaluateRemainingDuration(curve) end
local function FromSeconds(seconds, curve) return curve:Evaluate(seconds) end

-- For the hover pop-up, which shows the same countdown and debuff colors in its rows.
function ns.AuraCountdown(timer) return Countdown(FromDuration, timer) end
function ns.SecondsCountdown(seconds) return Countdown(FromSeconds, seconds) end
function ns.DispelColor(unit, id) return C_UnitAuras.GetAuraDispelTypeColor(unit, id, curves.dispel) end

local function TintRole(slot, texture, show)
	if ns.db.roleIcons then
		ns.SetRoleTint(slot, texture, show)
	else
		ns.SetRoleTint(slot, nil, false)
	end
end

-- Someone with no role has no symbol to tint, but still gets the halo and the timer.
local function ApplyDispel(slot)
	if slot.mode ~= "live" or not ns.db.dispelGlow then
		ns.ClearDispel(slot)
		return
	end
	if slot.demo then
		local debuff = slot.demo.debuff
		if not debuff then
			ns.ClearDispel(slot)
			return
		end
		local left = debuff.seconds - GetTime() % debuff.seconds
		local c = ns.DISPEL_COLORS[debuff.type]
		TintRole(slot, ROLE_TINTS[slot.demo.role], true)
		ns.SetDispel(slot, c[1], c[2], c[3], ns.GLOW_MIN + (1 - ns.GLOW_MIN) * left / debuff.seconds,
			Countdown(FromSeconds, left))
		return
	end
	-- An aura can vanish between these calls, and a stale ID must not take the meter down with it.
	local ok, color, timer = pcall(ReadDebuff, slot.unit)
	if not ok or not color or not timer then
		ns.ClearDispel(slot)
		return
	end
	local info = UnitFrameUtil.GetUnitRoleIconDisplayInfo(slot.unit, ROLE_TINT_OPTIONS)
	TintRole(slot, info.roleIconTexture, info.showRoleIcon)
	local r, g, b = color:GetRGB()
	ns.SetDispel(slot, r, g, b, timer:EvaluateRemainingPercent(curves.glow), Countdown(FromDuration, timer))
end

-- UnitInRange is the game's own healing-range check (about 40 yards), the one its raid frames fade by.
-- It never checks you, so your own wedge never grays. If the client hides the answer, the secret
-- boolean still drives the overlay; only the "was it checked" answer has to be plain.
local function ApplyRange(slot, state)
	if not ns.db.rangeFade or state == "empty" or state == "offline" then
		ns.SetRange(slot, nil)
	elseif slot.demo then
		if slot.demo.far then ns.SetRange(slot, false) else ns.SetRange(slot, nil) end
	elseif not slot.unit or slot.unit == "player" then
		ns.SetRange(slot, nil)
	else
		local inRange, checked = UnitInRange(slot.unit)
		if Plain(checked) == false then
			ns.SetRange(slot, nil)
		else
			ns.SetRange(slot, inRange)
		end
	end
end

-- Works out the wedge's state and shape from facts the game gives as plain values.
local function ReadMember(slot)
	if slot.demo then
		local d = slot.demo
		return d.state, d.class, d.powerToken, d.state ~= "empty" and d.pet ~= nil
	end
	local unit = slot.unit
	if not unit or not Plain(UnitExists(unit)) then return "empty" end
	local _, class = UnitClass(unit)
	class = Plain(class) or "WARRIOR"
	local powerType, powerToken = UnitPowerType(unit)
	powerType, powerToken = ChooseResource(unit, class, Plain(powerType), Plain(powerToken) or "MANA")
	slot.powerType = powerType

	local state = "live"
	if Plain(UnitIsConnected(unit)) == false then
		state = "offline"
	elseif Plain(UnitIsDeadOrGhost(unit)) and not (UnitIsFeignDeath and Plain(UnitIsFeignDeath(unit))) then
		state = "dead"
	end
	local hasPet = slot.petUnit and Plain(UnitExists(slot.petUnit)) and not Plain(UnitIsDead(slot.petUnit))
	return state, class, powerToken, hasPet and true or false
end

local function RefreshSlot(slot)
	local state, class, powerToken, hasPet = ReadMember(slot)
	slot.class, slot.powerToken = class, powerToken

	if state == "empty" then
		slot.low = false
		ns.SetMode(slot, "empty")
		ApplyTarget(slot)
		ApplyRole(slot)
		ApplyDispel(slot)
		ApplyRange(slot, state)
		return
	end

	local showsResource = ns.ResourceEnabled(class)
	-- The class can arrive after the roster update that aimed the hover areas.
	if not slot.demo and slot.hoverPet ~= ns.PetEnabled(class) then ns.SyncHover() end

	local petAllowed = ns.PetEnabled(class)
	if InCombatLockdown() and not slot.demo and slot.hoverPet ~= nil then
		petAllowed = slot.hoverPet -- matches the hover areas, which cannot change until combat ends
	end
	local showsPet = hasPet and petAllowed or false
	if showsResource ~= slot.showsResource or showsPet ~= slot.showsPet then
		ns.SetShape(slot, showsResource, showsPet)
	end

	if state == "dead" then
		slot.low = false
		ns.SetMode(slot, "flat")
		ns.SetBacking(slot, ns.DEAD_COLOR, 1)
	elseif state == "offline" then
		slot.low = false
		ns.SetMode(slot, "flat")
		ns.SetBacking(slot, ns.OFFLINE_COLOR, 1)
	else
		ns.SetMode(slot, "live")
		ns.SetBacking(slot, ns.BACKING_COLOR, ns.BACKING_ALPHA)
		ApplyHealth(slot)
		ApplyPet(slot)
		ApplyResource(slot)
		ApplyShield(slot)
		ApplyHeal(slot)
	end
	ApplyTarget(slot)
	ApplyRole(slot)
	ApplyDispel(slot)
	ApplyRange(slot, state)
end

local function RefreshAll()
	for _, slot in ipairs(ns.slots) do RefreshSlot(slot) end
end
ns.RefreshAll = RefreshAll

-- ---- Roster: members keep their wedge, so someone leaving empties it instead of shifting others -

local function PetUnitFor(unit)
	if unit == "player" then return "pet" end
	if unit:match("^raid%d") then return (unit:gsub("^raid", "raidpet")) end
	return (unit:gsub("party", "partypet"))
end

local function AssignUnit(slot, unit, guid)
	slot.unit, slot.guid, slot.petUnit = unit, guid, unit and PetUnitFor(unit)
end

-- members: { unit =, guid = } in the order new arrivals should fill free wedges. Someone already in
-- a wedge of these slots keeps it; the rest take the first free ones.
local function FillSlots(slots, members, first)
	local wanted = {}
	for _, m in ipairs(members) do wanted[m.guid] = m.unit end
	for i = first, #slots do
		local slot = slots[i]
		local unit = slot.guid and wanted[slot.guid]
		if unit then
			slot.unit, slot.petUnit = unit, PetUnitFor(unit)
			wanted[slot.guid] = nil
		else
			AssignUnit(slot, nil, nil)
		end
	end
	for _, m in ipairs(members) do
		if wanted[m.guid] then
			for i = first, #slots do
				if not slots[i].guid then
					AssignUnit(slots[i], m.unit, m.guid)
					break
				end
			end
		end
	end
end

local function PieSlots(pie)
	local slots = {}
	for i = 1, pie.wedges do slots[i] = pie.slots[i] end
	return slots
end

local function PartyRoster()
	local pie = ns.partyPie
	ns.UsePies({ pie })
	local slots = PieSlots(pie)
	AssignUnit(slots[1], "player", Plain(UnitGUID("player")))

	local members = {}
	for i = 1, SLOTS - 1 do
		local unit = "party" .. i
		if Plain(UnitExists(unit)) then members[#members + 1] = { unit = unit, guid = Plain(UnitGUID(unit)) or unit } end
	end
	FillSlots(slots, members, 2)

	-- Empty wedges hold the unused tokens, so someone joining mid-combat still has a wedge to appear in.
	local taken = {}
	for i = 2, SLOTS do
		if slots[i].unit then taken[slots[i].unit] = true end
	end
	local nextToken = 1
	for i = 2, SLOTS do
		if not slots[i].unit then
			while taken["party" .. nextToken] do nextToken = nextToken + 1 end
			AssignUnit(slots[i], "party" .. nextToken, nil)
			taken["party" .. nextToken] = true
		end
	end
end

-- The raid by group, as Blizzard's raid frames read it. If the game hides someone's group number,
-- they are placed as if the raid were filled in order, five to a group.
local function RaidGroups()
	local groups, own = {}, nil
	local me = Plain(UnitGUID("player"))
	for i = 1, MAX_RAID_MEMBERS or 40 do
		local unit = "raid" .. i
		if Plain(UnitExists(unit)) then
			local _, _, subgroup = GetRaidRosterInfo(i)
			subgroup = Plain(subgroup) or math.ceil(i / SLOTS)
			local guid = Plain(UnitGUID(unit)) or unit
			groups[subgroup] = groups[subgroup] or {}
			local list = groups[subgroup]
			if guid == me then
				own = subgroup
				table.insert(list, 1, { unit = unit, guid = guid })
			else
				list[#list + 1] = { unit = unit, guid = guid }
			end
		end
	end
	return groups, own
end

-- The groups to show, in order: the player's own first if they chose that, then the rest by number.
local function GroupOrder(groups, own)
	local order = {}
	local function Add(g)
		if groups[g] and #groups[g] > 0 and not ns.db.hiddenGroups[g] then order[#order + 1] = g end
	end
	if own and ns.db.ownGroupFirst then Add(own) end
	for g = 1, 8 do
		if not (own and ns.db.ownGroupFirst and g == own) then Add(g) end
	end
	return order
end

-- Works out the pies for a raid. Returns, for each pie shown, its member list.
local function PlanRaid(groups, own)
	local order = GroupOrder(groups, own)
	if ns.db.raidLayout == "single" then
		local everyone = {}
		for _, g in ipairs(order) do
			for _, m in ipairs(groups[g]) do everyone[#everyone + 1] = m end
		end
		local pie = ns.RaidPie()
		ns.UsePies({ pie }, #everyone)
		return { { pie = pie, members = everyone } }
	end
	local pies, labels, plan = {}, {}, {}
	for n, g in ipairs(order) do
		local pie = ns.GroupPie(n)
		pies[n], labels[n] = pie, "Group " .. g
		plan[n] = { pie = pie, members = groups[g] }
	end
	if #pies == 0 then pies[1] = ns.partyPie end
	ns.UsePies(pies, nil, labels)
	return plan
end

local function RaidRoster()
	local groups, own = RaidGroups()
	for _, entry in ipairs(PlanRaid(groups, own)) do
		local slots = PieSlots(entry.pie)
		FillSlots(slots, entry.members, 1)
	end
end

local function UpdateRoster()
	-- Hover areas cannot be repointed in combat, so wedges stay on their unit tokens until it ends.
	-- Otherwise a hover could cast on someone other than the member drawn there.
	if InCombatLockdown() then
		RefreshAll()
		return
	end
	if IsInRaid() then RaidRoster() else PartyRoster() end
	RefreshAll()
	ns.SyncHover()
end

local function SlotFor(unit)
	for _, slot in ipairs(ns.slots) do
		if slot.unit == unit then return slot, false end
		if slot.petUnit == unit then return slot, true end
	end
end

-- ---- Preview ------------------------------------------------------------------------------------

local DEMO = {
	{ state = "live", class = "PRIEST", role = "HEALER", powerToken = "MANA", phase = 0.0, selected = true },
	{ state = "live", class = "HUNTER", role = "DAMAGER", powerToken = "FOCUS", phase = 1.4, pet = 0.8, debuff = { type = 2, seconds = 18 } },
	{ state = "live", class = "DEMONHUNTER", role = "TANK", powerToken = "FURY", phase = 2.8, debuff = { type = 4, seconds = 12 } },
	{ state = "dead", class = "EVOKER", role = "DAMAGER", powerToken = "MANA", phase = 0 },
	{ state = "live", class = "WARLOCK", role = "DAMAGER", powerToken = "MANA", phase = 4.0, pet = 0.5, debuff = { type = 1, seconds = 9 }, far = true },
}

-- A sample raid: all eight groups, the last one short, built from the party preview's members.
local DEMO_RAID_GROUPS = { 5, 5, 5, 5, 5, 5, 5, 3 }
local function DemoRaid()
	local groups, n = {}, 0
	for g, count in ipairs(DEMO_RAID_GROUPS) do
		groups[g] = {}
		for i = 1, count do
			n = n + 1
			local base = DEMO[(n - 1) % #DEMO + 1]
			local d = {}
			for k, v in pairs(base) do d[k] = v end
			d.phase = base.phase + n * 0.37
			d.selected = n == 1
			if base.debuff and n % 3 ~= 0 then d.debuff = nil end
			groups[g][i] = { demo = d, guid = "demo" .. n }
		end
	end
	return groups, 1
end

function ns.IsDemo() return ns.demo == true end

local function ClearDemo()
	for _, pie in ipairs(ns.pies) do
		for _, slot in ipairs(pie.slots) do
			slot.demo = nil
			slot.low = false
		end
	end
end

-- raid: preview a raid instead of a party, laid out the way the raid settings say.
function ns.SetDemo(on, raid)
	if on and InCombatLockdown() then
		-- Fake wedges over hover areas still aimed at real players would be misleading.
		print("Heal Pie: the preview can't start during combat.")
		return
	end
	ns.demo = on or false
	ns.demoRaid = on and raid or nil
	ClearDemo()
	if not on then
		UpdateRoster()
		return
	end
	if raid then
		local groups, own = DemoRaid()
		for _, entry in ipairs(PlanRaid(groups, own)) do
			for i, m in ipairs(entry.members) do entry.pie.slots[i].demo = m.demo end
		end
	else
		ns.UsePies({ ns.partyPie })
		for i, slot in ipairs(ns.slots) do slot.demo = DEMO[i] end
	end
	for _, slot in ipairs(ns.slots) do
		if not slot.demo then slot.demo = { state = "empty", class = "WARRIOR", powerToken = "MANA", phase = 0 } end
	end
	ns.SyncHover()
	ns.StepDemo(GetTime())
end

function ns.StepDemo(now)
	for _, slot in ipairs(ns.slots) do
		local d = slot.demo
		if d then
			d.health = 0.55 + 0.45 * math.sin(now * 0.7 + d.phase)
			d.resource = 0.5 + 0.5 * math.sin(now * 1.1 + d.phase * 2)
			d.shield = math.max(0, math.sin(now * 0.5 + d.phase * 1.7)) * 0.8
			d.heal = math.max(0, math.sin(now * 0.8 + d.phase * 2.3)) * 0.3
			if d.pet then d.pet = 0.5 + 0.5 * math.sin(now * 0.9 + d.phase * 3) end
			d.rez = d.state == "dead" and now % 8 < 4 -- the angel comes and goes in the preview
		end
	end
	RefreshAll()
end

-- Which pies there are and who is in them, after a setting that changes the raid layout.
local function Rearrange()
	if InCombatLockdown() then
		ns.rosterPending = true
		return
	end
	if ns.demo then
		ns.SetDemo(true, ns.demoRaid)
	else
		UpdateRoster()
	end
end

-- ---- Settings changed -----------------------------------------------------------------------

function ns.ApplySettings()
	curves.fill = nil
	ns.SyncMoveSetting()
	ns.laidOut = false
	Rearrange()
	if not ns.laidOut then ns.Layout() end
	ns.ApplyLook()
	RefreshAll()
end

-- ---- Running ------------------------------------------------------------------------------------

local function TintFlash(now)
	local high = ns.db.flashHigh
	if not ns.db.flash then
		ns.TintLowOutlines(high[1], high[2], high[3])
		return
	end
	local low = ns.db.flashLow
	local t = 0.5 + 0.5 * math.sin(2 * math.pi * ns.FLASH_HZ * now)
	ns.TintLowOutlines(low[1] + (high[1] - low[1]) * t, low[2] + (high[2] - low[2]) * t, low[3] + (high[3] - low[3]) * t)
end

local sincePoll, sinceDemo = 0, 0
local POLL_SECONDS, DEMO_SECONDS = 0.25, 0.05
local POLL_BATCH = 10 -- wedges refreshed per poll; a full raid takes a second to go round
local nextPolled = 1

-- Unit events keep health and power current. The poll is for what has no event, such as a debuff's
-- countdown or a party member's resurrection, so in a raid it goes round a few wedges at a time.
local function Poll()
	local slots = ns.slots
	if #slots <= POLL_BATCH then
		RefreshAll()
		return
	end
	for _ = 1, POLL_BATCH do
		if nextPolled > #slots then nextPolled = 1 end
		RefreshSlot(slots[nextPolled])
		nextPolled = nextPolled + 1
	end
end

ns.root:SetScript("OnUpdate", function(_, elapsed)
	local now = GetTime()
	TintFlash(now)
	sincePoll = sincePoll + elapsed
	if ns.demo then
		sinceDemo = sinceDemo + elapsed
		if sinceDemo >= DEMO_SECONDS then
			sinceDemo = 0
			ns.StepDemo(now)
		end
	elseif sincePoll >= POLL_SECONDS then
		-- Death, release and resurrection do not all raise a unit event for party members.
		sincePoll = 0
		Poll()
	end
end)

-- Blizzard's casting code needs the option on and its modifier set to None. If the player already
-- has the option on, their modifier is theirs and stays as it is. Keybinding calls are locked in combat.
function ns.ApplyGameMouseover()
	if InCombatLockdown() then
		ns.gameMouseoverPending = true
		return
	end
	ns.gameMouseoverPending = false
	ns.db.gameMouseoverSet = true
	if GetCVarBool("enableMouseoverCast") then return end

	SetCVar("enableMouseoverCast", "1")
	if GetModifiedClick("MOUSEOVERCAST") ~= "NONE" then
		SetModifiedClick("MOUSEOVERCAST", "NONE")
		SaveBindings(GetCurrentBindingSet())
	end
	if GetCVarBool("enableMouseoverCast") then
		print("Heal Pie: turned on the game's Mouseover Cast option, so hovering a wedge casts on that player. You can change it under Options > Combat.")
	else
		print("Heal Pie: couldn't turn on Mouseover Cast. Please enable it under Options > Combat.")
	end
end

local dragging = false

local function SavePosition()
	ns.positionUnsaved = false
	local point, _, relativePoint, x, y = ns.root:GetPoint(1)
	if point then ns.db.point = { point, relativePoint, x, y } end
end

function ns.StartDrag()
	-- In combat the hover areas take no drags; their secure snippets move the pies instead.
	if InCombatLockdown() then return end
	dragging = true
	ns.root:StartMoving()
end

function ns.StopDrag()
	if not dragging then return end
	dragging = false
	ns.root:StopMovingOrSizing()
	SavePosition()
end

local function RestorePosition()
	-- The frame is protected, so after a reload in combat this waits for combat to end.
	if InCombatLockdown() then
		ns.restorePending = true
		return
	end
	ns.restorePending = false
	local p = ns.db.point
	ns.root:ClearAllPoints()
	if p then
		ns.root:SetPoint(p[1], UIParent, p[2], p[3], p[4])
	else
		ns.root:SetPoint("CENTER", UIParent, "CENTER", -300, -120)
	end
end

local events = CreateFrame("Frame")
for _, name in ipairs({
	"ADDON_LOADED", "PLAYER_ENTERING_WORLD", "GROUP_ROSTER_UPDATE", "UI_SCALE_CHANGED", "DISPLAY_SIZE_CHANGED",
	"PLAYER_REGEN_DISABLED", "PLAYER_REGEN_ENABLED", "PLAYER_LOGOUT",
	"UNIT_HEALTH", "UNIT_MAXHEALTH", "UNIT_POWER_FREQUENT", "UNIT_MAXPOWER", "UNIT_ABSORB_AMOUNT_CHANGED", "UNIT_HEAL_PREDICTION", "PLAYER_TARGET_CHANGED",
	"UNIT_DISPLAYPOWER", "UNIT_PET", "UNIT_CONNECTION", "UPDATE_BINDINGS", "INCOMING_RESURRECT_CHANGED",
}) do
	events:RegisterEvent(name)
end

events:SetScript("OnEvent", function(_, event, arg1)
	if event == "ADDON_LOADED" then
		if arg1 == addonName then
			ns.InitDB()
			BuildSharedCurves()
			RestorePosition()
			ns.ApplySettings()
			ns.CreateOptions()
		end
		return
	end
	if not ns.db or (issecretvalue and issecretvalue(arg1)) then return end

	if event == "PLAYER_LOGOUT" then
		-- A combat move is saved when combat ends; this catches one made as it ended.
		if ns.positionUnsaved then SavePosition() end
		return
	elseif event == "PLAYER_REGEN_DISABLED" then
		-- Fires just before lockdown, the last chance to let go of a drag in progress.
		ns.StopDrag()
		ns.SetCombatDrag(true)
		return
	elseif event == "PLAYER_REGEN_ENABLED" then
		ns.SetCombatDrag(false)
		if ns.restorePending then RestorePosition() end
		if ns.positionUnsaved then SavePosition() end
		if ns.moveSettingPending then ns.SyncMoveSetting() end
		if ns.layoutPending then
			ns.layoutPending = false
			ns.Layout()
		end
		if ns.gameMouseoverPending then ns.ApplyGameMouseover() end
		if ns.rosterPending then
			ns.rosterPending = false
			Rearrange()
		elseif not ns.demo then
			UpdateRoster()
		end
		return
	elseif event == "PLAYER_ENTERING_WORLD" and ns.db.mouseover and not ns.db.gameMouseoverSet then
		-- Only ever once, so turning the game's option back off is respected.
		ns.ApplyGameMouseover()
	end
	if ns.demo then return end

	if event == "UI_SCALE_CHANGED" or event == "DISPLAY_SIZE_CHANGED" then
		ns.Layout()
	elseif event == "UPDATE_BINDINGS" then
		ns.SyncHover() -- in combat this waits for the roster update when combat ends
	elseif event == "PLAYER_ENTERING_WORLD" or event == "GROUP_ROSTER_UPDATE" then
		UpdateRoster()
	elseif event == "UNIT_PET" then
		-- The payload names the owner here, not the pet.
		local slot = SlotFor(arg1)
		if slot then RefreshSlot(slot) end
	elseif event == "UNIT_CONNECTION" or event == "UNIT_DISPLAYPOWER" then
		local slot = SlotFor(arg1)
		if slot then RefreshSlot(slot) end
	elseif event == "INCOMING_RESURRECT_CHANGED" then
		local slot, isPet = SlotFor(arg1)
		if slot and not isPet then ApplyRole(slot) end
	elseif event == "PLAYER_TARGET_CHANGED" then
		for _, slot in ipairs(ns.slots) do ApplyTarget(slot) end
	elseif event == "UNIT_ABSORB_AMOUNT_CHANGED" then
		local slot, isPet = SlotFor(arg1)
		if slot and not isPet then ApplyShield(slot) end
	elseif event == "UNIT_HEAL_PREDICTION" then
		local slot, isPet = SlotFor(arg1)
		if slot and not isPet then ApplyHeal(slot) end
	elseif event == "UNIT_HEALTH" or event == "UNIT_MAXHEALTH" then
		local slot, isPet = SlotFor(arg1)
		if slot and isPet then
			ApplyPet(slot)
		elseif slot then
			ApplyHealth(slot)
			ApplyHeal(slot) -- the heal band starts where health ends
		end
	else
		local slot, isPet = SlotFor(arg1)
		if slot and not isPet then ApplyResource(slot) end
	end
end)

-- ---- /php debuffs ------------------------------------------------------------------------------

-- What the game says about each member's debuffs, to tell why one shows no countdown. Anything the
-- game keeps secret is reported as hidden rather than read.
local function Say(v)
	if issecretvalue and issecretvalue(v) then return "hidden" end
	return tostring(v)
end

local function DescribeDebuff(unit, id, dispellable, shown)
	local aura = C_UnitAuras.GetAuraDataByAuraInstanceID(unit, id)
	if issecretvalue and issecretvalue(aura) then return "a debuff the game keeps hidden" end
	if not aura then return nil end
	local kind = aura.dispelName
	if issecretvalue and issecretvalue(kind) then
		kind = "type hidden"
	elseif not kind or kind == "" then
		kind = "no dispel type"
	end
	local duration, expires = Plain(aura.duration), Plain(aura.expirationTime)
	local time
	if not duration or not expires then
		time = "time left hidden by the game"
	elseif duration == 0 then
		time = "the game gives no end time, so there is no countdown"
	else
		time = ("%.0f of %.0f seconds left"):format(math.max(0, expires - GetTime()), duration)
	end
	local status = dispellable and "you can dispel it" or "you can't dispel it, so the wedge ignores it"
	if shown then status = "you can dispel it, and it is the one the wedge shows" end
	return ("%s (%s): %s; %s."):format(Say(aura.name), kind, time, status)
end

local function ReportDebuffs()
	local say = function(text) print("Heal Pie: " .. text) end
	if not ns.db.dispelGlow then say("the debuff glow is turned off in the settings.") end
	local found = false
	for _, slot in ipairs(ns.slots) do
		local unit = slot.unit
		if unit and Plain(UnitExists(unit)) then
			local who = Say(UnitName(unit))
			local ok, all = pcall(C_UnitAuras.GetUnitAuraInstanceIDs, unit, "HARMFUL")
			if not ok or type(all) ~= "table" then
				found = true
				say(who .. ": the game won't list their debuffs right now.")
			else
				local mine = {}
				local okMine, ids = pcall(C_UnitAuras.GetUnitAuraInstanceIDs, unit, "HARMFUL|RAID")
				if okMine and type(ids) == "table" then
					for _, id in ipairs(ids) do
						id = Plain(id)
						if id then mine[id] = true end
					end
				end
				local okShown, shown = pcall(ShownDebuffID, unit)
				if not okShown then shown = nil end
				for _, id in ipairs(all) do
					found = true
					local plainID = Plain(id)
					local okText, text = false, nil
					if plainID then okText, text = pcall(DescribeDebuff, unit, plainID, mine[plainID], plainID == shown) end
					if not okText or not text then text = "a debuff the game keeps hidden." end
					say(who .. ": " .. text)
				end
			end
		end
	end
	if not found then say("nobody in the party has a debuff right now.") end
end
ns.ReportDebuffs = ReportDebuffs

SLASH_PARTYHEALTHPIE1 = "/php"
SLASH_PARTYHEALTHPIE2 = "/healthpie"
SlashCmdList.PARTYHEALTHPIE = function(input)
	if input:lower():match("^%s*demo") then
		local raid = input:lower():match("^%s*demo%s+raid") ~= nil
		ns.SetDemo(not (ns.demo and (ns.demoRaid or false) == raid), raid)
		if ns.RefreshOptions then ns.RefreshOptions() end
	elseif input:lower():match("^%s*debuff") then
		ReportDebuffs()
	elseif input:lower():match("^%s*popup") then
		ns.ReportPopup()
	else
		ns.OpenOptions()
	end
end
