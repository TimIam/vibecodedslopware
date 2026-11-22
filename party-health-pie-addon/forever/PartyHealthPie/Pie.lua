-- Everything drawn on screen: the wedges, the metal, and how they are placed at a given size.
--
-- A pie is a circle of wedges with its own hover areas. A party is one pie of five. A raid is either
-- one five-wedge pie per raid group, or one raid pie with a wedge for everyone. All pies sit in one
-- frame, so dragging any of them moves the lot.
--
-- Nothing here may read back an alpha, texture coordinate or colour once it has been set, because
-- those can hold secret values during play.
local _, ns = ...

local TEX = ns.TEX
local GROUP_WEDGES = 5 -- the party and group pies; their sector masks are baked for exactly this
local RAID_WEDGES_MIN, RAID_WEDGES_MAX = 5, 40 -- the raid pie's wedges are cut from rotated half disks
local RESOURCE_SHARE = 2 / 5 -- the resource band's share of the radius; sheet_health is baked to match
local PET_SHARE = 0.33 -- the pet's share of a wedge's arc; the sector masks are baked to match
local SHIELD_HOLE = 0.38 -- mask_hole_shield's hole radius as a share of its half width
local HEAL_MASK_FILL = 256 / 254 -- mask_disk's disk stops 2 texels short of the texture edge
local RAD = math.pi / 180
local GRID, CELL_PAD_HEALTH, CELL_HALF_HEALTH = 8, 2, 64
local CELL_PAD_RES, CELL_HALF_RES = 2, 32
local RING_PX, LOW_RING_PX = 4, 8 -- at LINE_FULL_SIZE and up; smaller pies get thinner lines
local LINE_FULL_SIZE = 200
local HOLE_FRACTION = 0.5 -- mask_hole's hole radius as a share of its half width
local METAL_FILL = 256 / 254 -- metal_disk's disk stops 2 texels short of the texture edge
local DISK_FILL = 128 / 126
local ROLE_GLOW_SCALE = 2.3 -- the halo's width as a multiple of the symbol's
local ROLE_TIMER_SIZE, ROLE_TIMER_MIN = 0.085, 9 -- share of the pie's diameter, and a floor that stays readable
local ROLE_DISTANCE, ROLE_SIZE = 0.62, 0.15 -- shares of the radius and the diameter; a 72 degree wedge balances at 0.62
local PIE_GAP = 0.1 -- space between group pies, as a share of a pie's size
local NARROW_SPOKE_FROM = 0.12 -- a raid pie's spokes start this share of the radius out, so the center isn't solid metal

ns.slots = {} -- the wedges of the pies on screen, in order; Party.lua refreshes these
ns.pies = {} -- every pie built so far
ns.shownPies = {} -- the pies on screen, in layout order

-- The frame the player drags and whose position is saved. It holds the pies.
-- Protected from the start, because the hover areas' secure code needs a handle to it to move it in
-- combat. Out of combat it drags like any frame.
local anchor = CreateFrame("Frame", "PartyHealthPieFrame", UIParent, "SecureFrameTemplate")
anchor:SetClampedToScreen(true)
anchor:SetMovable(true)
anchor:EnableMouse(false) -- the hover areas take the mouse, so empty space stays click-through
ns.root = anchor

local function NewMask(pie, parent, file)
	local mask = parent:CreateMaskTexture()
	mask:SetTexture(TEX .. file, "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
	mask:SetPoint("CENTER", pie.root, "CENTER")
	return mask
end

-- masks: a list of mask textures, each of which cuts the texture further.
local function NewTexture(pie, parent, layer, sub, file, masks)
	local tex = parent:CreateTexture(nil, layer, nil, sub)
	tex:SetTexture(TEX .. file)
	tex:SetPoint("CENTER", pie.root, "CENTER")
	for _, mask in ipairs(masks or {}) do tex:AddMaskTexture(mask) end
	return tex
end

local function Join(...)
	local out = {}
	for i = 1, select("#", ...) do
		for _, mask in ipairs((select(i, ...))) do out[#out + 1] = mask end
	end
	return out
end

local function NewLine(parent, layer, sub)
	local line = parent:CreateLine(nil, layer, nil, sub)
	line:SetColorTexture(1, 1, 1, 1)
	return line
end

-- theta: degrees clockwise from 12 o'clock. side: sideways shift in UI units, for parallel lines.
local function PlaceLine(pie, line, thickness, r0, r1, theta, side)
	local s, c = math.sin(theta * RAD), math.cos(theta * RAD)
	local nx, ny = c * side, -s * side
	line:SetThickness(thickness)
	line:SetStartPoint("CENTER", pie.root, s * r0 + nx, c * r0 + ny)
	line:SetEndPoint("CENTER", pie.root, s * r1 + nx, c * r1 + ny)
end

-- A spoke is two lines side by side, one lit and one shaded, which is what reads as metal.
local function NewSpoke(parent)
	return { lit = NewLine(parent, "ARTWORK", 1), shade = NewLine(parent, "ARTWORK", 1) }
end

local function PlaceSpoke(pie, spoke, width, r0, r1, theta)
	local half = width / 2
	PlaceLine(pie, spoke.lit, half, r0, r1, theta, -half / 2)
	PlaceLine(pie, spoke.shade, half, r0, r1, theta, half / 2)
end

local function TintSpoke(spoke, metal)
	spoke.lit:SetVertexColor(metal.hi[1], metal.hi[2], metal.hi[3])
	spoke.shade:SetVertexColor(metal.lo[1], metal.lo[2], metal.lo[3])
end

-- ---- Sectors: a wedge's shape ------------------------------------------------------------------

-- Party and group pies use masks baked for their five positions. A raid pie can have any number of
-- wedges, so each sector there is two half-disk masks turned to its edges: one keeps the half that
-- starts at the sector's first edge, the other the half that ends at its last, and only the sector is
-- in both. That needs the sector to be at most half the circle, which RAID_WEDGES_MIN guarantees.
local function NewSector(pie, parent, baked)
	if baked then return { NewMask(pie, parent, baked) } end
	return { NewMask(pie, parent, "mask_half"), NewMask(pie, parent, "mask_half") }
end

-- from and to in degrees clockwise from 12 o'clock. SetRotation turns counterclockwise, hence the sign.
local function PlaceSector(sector, size, from, to)
	for _, mask in ipairs(sector) do mask:SetSize(size, size) end
	if sector[2] then
		sector[1]:SetRotation(-from * RAD)
		sector[2]:SetRotation(-(to - 180) * RAD)
	end
end

-- ---- Hidden status bars ------------------------------------------------------------------------

-- A shield amount is secret and has no percent API, so Lua cannot size anything from it. A StatusBar
-- can: its fill edge lands where the secret value says. Four invisible bars, one per side, pin the
-- edges of a round hole mask, so the hole closes in from the rim's side as the shield grows.
local function NewHiddenBar(parent, orientation, reverse)
	local bar = CreateFrame("StatusBar", nil, parent)
	bar:SetStatusBarTexture(TEX .. "disk")
	bar:SetStatusBarColor(1, 1, 1, 0) -- vertex alpha, so the engine still lays the fill out
	bar:SetOrientation(orientation)
	bar:SetReverseFill(reverse)
	bar:SetMinMaxValues(0, 1)
	bar:SetValue(0)
	return bar
end

local function NewShieldHole(parent, bars)
	local mask = parent:CreateMaskTexture()
	mask:SetTexture(TEX .. "mask_hole_shield", "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
	mask:SetPoint("RIGHT", bars.right:GetStatusBarTexture(), "LEFT")
	mask:SetPoint("LEFT", bars.left:GetStatusBarTexture(), "RIGHT")
	mask:SetPoint("TOP", bars.top:GetStatusBarTexture(), "BOTTOM")
	mask:SetPoint("BOTTOM", bars.bottom:GetStatusBarTexture(), "TOP")
	return mask
end

-- An incoming heal starts where health ends, and one secret cannot be added to another. So each side
-- has a health bar with a heal bar anchored to the end of its fill, and the engine does the adding.
local function NewHealChain(parent, orientation, reverse, startPoint, endPoint)
	local health = NewHiddenBar(parent, orientation, reverse)
	local heal = NewHiddenBar(parent, orientation, reverse)
	heal:SetPoint(startPoint, health:GetStatusBarTexture(), endPoint)
	return { health = health, heal = heal, tip = heal:GetStatusBarTexture() }
end

local function NewHealMask(parent, chains)
	local mask = parent:CreateMaskTexture()
	mask:SetTexture(TEX .. "mask_disk", "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
	mask:SetPoint("RIGHT", chains.right.tip, "RIGHT")
	mask:SetPoint("LEFT", chains.left.tip, "LEFT")
	mask:SetPoint("TOP", chains.top.tip, "TOP")
	mask:SetPoint("BOTTOM", chains.bottom.tip, "BOTTOM")
	return mask
end

-- ---- One wedge ---------------------------------------------------------------------------------

local function NewSlot(pie, i)
	local colorLayer, borderLayer = pie.colorLayer, pie.borderLayer
	local baked = pie.kind ~= "raid"
	local full = NewSector(pie, colorLayer, baked and ("mask_full_" .. i))
	local class = NewSector(pie, colorLayer, baked and ("mask_class_" .. i))
	local pet = NewSector(pie, colorLayer, baked and ("mask_pet_" .. i))
	local low = NewSector(pie, borderLayer, baked and ("mask_full_" .. i))
	local petOutline = NewSector(pie, borderLayer, baked and ("mask_pet_" .. i))

	local shieldBars = {
		right = NewHiddenBar(colorLayer, "HORIZONTAL", true),
		left = NewHiddenBar(colorLayer, "HORIZONTAL", false),
		top = NewHiddenBar(colorLayer, "VERTICAL", true),
		bottom = NewHiddenBar(colorLayer, "VERTICAL", false),
	}
	local shieldHole = NewShieldHole(colorLayer, shieldBars)

	local healChains = {
		right = NewHealChain(colorLayer, "HORIZONTAL", false, "LEFT", "RIGHT"),
		left = NewHealChain(colorLayer, "HORIZONTAL", true, "RIGHT", "LEFT"),
		top = NewHealChain(colorLayer, "VERTICAL", false, "BOTTOM", "TOP"),
		bottom = NewHealChain(colorLayer, "VERTICAL", true, "TOP", "BOTTOM"),
	}
	local healMask = NewHealMask(colorLayer, healChains)

	local slot = {
		index = i,
		pie = pie,
		sectors = { full = full, class = class, pet = pet, low = low, petOutline = petOutline },
		healChains = healChains,
		-- Under the health fill, which covers everything but the part beyond current health.
		healWhole = NewTexture(pie, colorLayer, "ARTWORK", -1, "ring_health", Join(full, { healMask })),
		healClass = NewTexture(pie, colorLayer, "ARTWORK", -1, "ring_health", Join(class, { healMask })),
		shieldBars = shieldBars,
		shieldWhole = NewTexture(pie, colorLayer, "ARTWORK", 1, "disk", Join(full, { shieldHole })),
		shieldClass = NewTexture(pie, colorLayer, "ARTWORK", 1, "disk", Join(class, { shieldHole })),
		backing = NewTexture(pie, colorLayer, "BACKGROUND", 0, "disk", full),
		healthWhole = NewTexture(pie, colorLayer, "ARTWORK", 0, "sheet_health", full),
		healthClass = NewTexture(pie, colorLayer, "ARTWORK", 0, "sheet_health", class),
		-- The pet always runs from the center to the rim and takes that arc from the resource band.
		pet = NewTexture(pie, colorLayer, "ARTWORK", 0, "sheet_health_full", pet),
		resourceWhole = NewTexture(pie, colorLayer, "ARTWORK", 0, "sheet_resource", full),
		resourceClass = NewTexture(pie, colorLayer, "ARTWORK", 0, "sheet_resource", class),
		lowArc = NewTexture(pie, borderLayer, "OVERLAY", 0, "disk", Join(low, { pie.holeLow })),
		lowLeft = NewLine(borderLayer, "OVERLAY", 1),
		lowRight = NewLine(borderLayer, "OVERLAY", 1),
		-- Border-width and above the low-health outline, so a selected low member shows both colors.
		targetParts = {
			NewTexture(pie, borderLayer, "OVERLAY", 2, "disk", Join(low, { pie.holeOuter })),
			NewLine(borderLayer, "OVERLAY", 3),
			NewLine(borderLayer, "OVERLAY", 3),
		},
		petTargetParts = {
			NewTexture(pie, borderLayer, "OVERLAY", 2, "disk", Join(petOutline, { pie.holeOuter })),
			NewLine(borderLayer, "OVERLAY", 3),
			NewLine(borderLayer, "OVERLAY", 3),
		},
		-- Above every band of the wedge, and it fades with them under Player color opacity.
		role = colorLayer:CreateTexture(nil, "OVERLAY"),
		roleTint = colorLayer:CreateTexture(nil, "OVERLAY", nil, 1),
		roleGlow = NewTexture(pie, colorLayer, "OVERLAY", -1, "role_glow"),
		roleTimer = colorLayer:CreateFontString(nil, "OVERLAY"),
		roleMinutes = colorLayer:CreateFontString(nil, "OVERLAY"), -- takes over from the seconds on long debuffs
	}
	for _, text in ipairs({ slot.roleTimer, slot.roleMinutes }) do
		text:SetDrawLayer("OVERLAY", 2)
		text:SetFont(STANDARD_TEXT_FONT, ROLE_TIMER_MIN, "OUTLINE") -- text set before a font is an error
		text:SetTextColor(1, 1, 1)
		text:SetAlpha(0)
	end
	return slot
end

-- ---- One pie -----------------------------------------------------------------------------------

-- kind: "party" for the party pie, which also shows the first raid group; "group" for the other raid
-- groups; "raid" for the pie with a wedge for everyone. Builds secure frames, so never in combat.
local function NewPie(kind)
	local pie = { id = #ns.pies + 1, kind = kind, slots = {}, hitButtons = {}, hitUsed = 0, spokes = {} }
	pie.wedges = kind == "raid" and RAID_WEDGES_MIN or GROUP_WEDGES
	pie.maxWedges = kind == "raid" and RAID_WEDGES_MAX or GROUP_WEDGES

	local root = CreateFrame("Frame", nil, anchor)
	root:EnableMouse(false)
	pie.root = root
	-- Player colours and metal live on separate frames so each has its own transparency.
	pie.colorLayer = CreateFrame("Frame", nil, root)
	pie.colorLayer:SetAllPoints(root)
	pie.borderLayer = CreateFrame("Frame", nil, root)
	pie.borderLayer:SetAllPoints(root)
	pie.borderLayer:SetFrameLevel(pie.colorLayer:GetFrameLevel() + 2)

	-- The hole mask is oversized so white reaches past the disk it cuts: only the hole's edge matters.
	pie.holeOuter = NewMask(pie, pie.borderLayer, "mask_hole")
	pie.ring = NewTexture(pie, pie.borderLayer, "ARTWORK", 0, "metal_disk", { pie.holeOuter })
	pie.holeLow = NewMask(pie, pie.borderLayer, "mask_hole")
	for i = 1, pie.maxWedges do pie.spokes[i] = NewSpoke(pie.borderLayer) end
	for i = 1, pie.maxWedges do pie.slots[i] = NewSlot(pie, i) end

	-- "Group 3" over a group pie in a raid.
	pie.label = pie.borderLayer:CreateFontString(nil, "OVERLAY")
	pie.label:SetFont(STANDARD_TEXT_FONT, 11, "OUTLINE")
	pie.label:SetPoint("TOPLEFT", root, "TOPLEFT", 0, 0)
	pie.label:SetTextColor(1, 0.82, 0)
	pie.label:SetText("")

	ns.pies[#ns.pies + 1] = pie
	return pie
end

-- The party pie always exists; the others are built the first time a raid needs them.
local partyPie = NewPie("party")
ns.partyPie = partyPie
ns.hitButtons = partyPie.hitButtons
ns.shownPies = { partyPie }
for i = 1, GROUP_WEDGES do ns.slots[i] = partyPie.slots[i] end
local groupPies, raidPie = { partyPie }, nil

function ns.GroupPie(n)
	if not groupPies[n] then groupPies[n] = NewPie("group") end
	return groupPies[n]
end

function ns.RaidPie()
	if not raidPie then raidPie = NewPie("raid") end
	return raidPie
end

-- ---- Sprite sheet addressing ------------------------------------------------------------------

-- The API's cell numbering is undocumented, so read it off a throwaway texture using plain numbers.
local cellBase, rowMajor = 0, true
local hasSheetCells = false
do
	local probe = partyPie.colorLayer:CreateTexture()
	probe:SetTexture(TEX .. "sheet_resource")
	if probe.SetSpriteSheetCell then
		hasSheetCells = true
		local function CornerOf(cell)
			probe:SetSpriteSheetCell(cell, GRID, GRID)
			local x, y = probe:GetTexCoord()
			return x, y
		end
		local ok, x1, y1 = pcall(CornerOf, 1)
		local ok2, x2, y2 = pcall(CornerOf, 2)
		if ok and ok2 and type(x1) == "number" and type(x2) == "number" and x2 ~= x1 then
			rowMajor = true
			cellBase = 1 - math.floor(x1 * GRID + 0.5)
		elseif ok and ok2 and type(y1) == "number" and type(y2) == "number" and y2 ~= y1 then
			rowMajor = false
			cellBase = 1 - math.floor(y1 * GRID + 0.5)
		end
	end
	probe:Hide()
end

-- Turns a sheet index (0-63, row-major, as baked) into the number the API wants.
function ns.ApiCell(index)
	if rowMajor then return index + cellBase end
	local row, col = math.floor(index / GRID), index % GRID
	return col * GRID + row + cellBase
end

function ns.SetCell(tex, cell)
	if hasSheetCells then
		tex:SetSpriteSheetCell(cell, GRID, GRID)
		return
	end
	-- Only reachable on a client without the API, where values are plain numbers.
	local index = cell - cellBase
	local col, row = index % GRID, math.floor(index / GRID)
	tex:SetTexCoord(col / GRID, (col + 1) / GRID, row / GRID, (row + 1) / GRID)
end

-- ---- Hover areas -------------------------------------------------------------------------------

-- A secure button can only be a rectangle, so each circle is tiled with thin horizontal strips, each
-- belonging to the wedge under it. They carry the unit that makes [@mouseover] work. Everything here
-- is locked during combat.
local HIT_ROW = 3 -- a hover can only land on the wrong side of an edge within half of this

local function Arc(pie) return 360 / pie.wedges end

-- Which wedge of a pie is at a point, and whether it is in that wedge's pet arc.
local function SlotAt(pie, x, y)
	local arc = Arc(pie)
	local around = (math.atan2(x, y) / RAD + arc / 2) % 360
	return math.floor(around / arc) % pie.wedges + 1, around % arc >= arc * (1 - PET_SHARE)
end

-- The same tooltip Blizzard's unit frames show. UpdateTooltip keeps it current while the pointer rests.
local function ShowUnitTooltip(button)
	local unit = button:GetAttribute("unit1")
	if not unit then return end
	GameTooltip_SetDefaultAnchor(GameTooltip, button)
	button.UpdateTooltip = GameTooltip:SetUnit(unit) and ShowUnitTooltip or nil
end

local function HideUnitTooltip(button)
	button.UpdateTooltip = nil
	GameTooltip:Hide()
end

-- Addon code can't move a frame holding hover areas in combat, but the game's secure snippets can,
-- and they can place a frame relative to the cursor. So in combat a left press over the pie notes
-- where on it the cursor grabbed, and the release puts that spot under the cursor. The release only
-- moves it if the cursor travelled, so a plain click stays a click. The client sends no release to a
-- frame once a drag has begun, so the hover areas stop taking drags while combat lasts.
local GRAB_SNIPPET = [[
	grabX, grabY, dropped = nil, nil, nil
	if button ~= "LeftButton" or not PlayerInCombat() then return end
	local anchor = self:GetFrameRef("anchor")
	if not anchor or not anchor:GetAttribute("moveincombat") then return end
	local x, y = anchor:GetMousePosition()
	if not x then return end
	local _, _, w, h = anchor:GetRect()
	grabX, grabY = x * w, y * h
]]
local DROP_SNIPPET = [[
	if button ~= "LeftButton" or not grabX then return end
	local gx, gy = grabX, grabY
	grabX, grabY = nil, nil
	local anchor = self:GetFrameRef("anchor")
	if not anchor then return end
	local x, y = anchor:GetMousePosition()
	if x then
		local _, _, w, h = anchor:GetRect()
		local dx, dy = x * w - gx, y * h - gy
		if dx * dx + dy * dy < 25 then return end
	end
	anchor:ClearAllPoints()
	anchor:SetPoint("BOTTOMLEFT", "$cursor", -gx, -gy)
	dropped = true
]]
-- The grabbed spot lands back under the cursor, so a drop would also count as a click on that wedge.
-- This stops it targeting anyone, whether the client sends the click before or after the release.
local CLICK_GUARD = [[
	if button ~= "LeftButton" then return end
	if dropped then
		dropped = nil
		return false
	end
	if not grabX then return end
	local anchor = self:GetFrameRef("anchor")
	local x, y = anchor:GetMousePosition()
	if not x then return false end
	local _, _, w, h = anchor:GetRect()
	local dx, dy = x * w - grabX, y * h - grabY
	if dx * dx + dy * dy >= 25 then return false end
]]

local function PressForGhost(_, mouseButton)
	if mouseButton == "LeftButton" and InCombatLockdown() and anchor:GetAttribute("moveincombat") then ns.StartGhost() end
end

local function HitButton(pie, index)
	local button = pie.hitButtons[index]
	if not button then
		button = CreateFrame("Button", nil, pie.root, "SecureUnitButtonTemplate,SecureHandlerMouseUpDownTemplate")
		button:SetFrameRef("anchor", anchor)
		button:SetAttribute("_onmousedown", GRAB_SNIPPET)
		button:SetAttribute("_onmouseup", DROP_SNIPPET)
		button:WrapScript(button, "OnClick", CLICK_GUARD)
		button:HookScript("OnMouseDown", PressForGhost)
		button:HookScript("OnMouseUp", function() ns.StopGhost() end)
		button:SetFrameLevel(pie.borderLayer:GetFrameLevel() + 2)
		button:EnableMouse(true)
		-- The extra mouse buttons act on press, as they do when bound to a spell away from the wedge.
		button:RegisterForClicks("LeftButtonUp", "RightButtonUp", "MiddleButtonDown", "Button4Down", "Button5Down")
		button:SetAttribute("type1", "target") -- left-click selects whoever "unit1" names
		button.drivers = {}
		button.aimed = {} -- the attribute values last set, so unchanged ones aren't written again
		button.clicks = {}
		button:RegisterForDrag("LeftButton")
		button:SetScript("OnDragStart", function() ns.StartDrag() end)
		button:SetScript("OnDragStop", function() ns.StopDrag() end)
		button:SetScript("OnEnter", ShowUnitTooltip)
		button:SetScript("OnLeave", HideUnitTooltip)
		pie.hitButtons[index] = button
	end
	return button
end

local function PlaceStrip(pie, left, right, top, slot, isPet)
	if right - left < 1 then return end
	pie.hitUsed = pie.hitUsed + 1
	local button = HitButton(pie, pie.hitUsed)
	button:ClearAllPoints()
	button:SetPoint("TOPLEFT", pie.root, "CENTER", left, top)
	button:SetSize(right - left, HIT_ROW)
	button:Show()
	button.slot, button.isPet = slot, isPet
end

local function LayoutHitAreas(pie, radius)
	pie.hitUsed = 0
	for row = 1, math.ceil(radius * 2 / HIT_ROW) do
		local top = radius - (row - 1) * HIT_ROW
		local y = top - HIT_ROW / 2
		local half = math.sqrt(math.max(0, radius * radius - y * y))
		local left = -half
		local current, currentPet = SlotAt(pie, -half + 0.5, y)
		for x = -half + 1, half - 1 do
			local slot, isPet = SlotAt(pie, x + 0.5, y)
			if slot ~= current or isPet ~= currentPet then
				PlaceStrip(pie, left, x, top, current, currentPet)
				left, current, currentPet = x, slot, isPet
			end
		end
		PlaceStrip(pie, left, half, top, current, currentPet)
	end
	for i = pie.hitUsed + 1, #pie.hitButtons do pie.hitButtons[i]:Hide() end
end

-- Attribute writes are the costly part of re-aiming, and most re-aims change nothing, so only a
-- changed value is written. A driver leaves its last value behind, so dropping one always writes.
local DRIVEN = {}
local function Aim(button, attribute, unit, driver)
	local drivers = button.drivers
	if driver ~= drivers[attribute] then
		if drivers[attribute] then UnregisterAttributeDriver(button, attribute) end
		if driver then RegisterAttributeDriver(button, attribute, driver) end
		drivers[attribute] = driver
		button.aimed[attribute] = DRIVEN
	end
	if not driver and button.aimed[attribute] ~= unit then
		button:SetAttribute(attribute, unit)
		button.aimed[attribute] = unit
	end
end

-- A frame under the pointer swallows every mouse button, so a key binding on the middle or side
-- buttons never fires over a wedge. Each strip runs that binding itself. The modifiers are in the
-- order that key names and secure attribute names both use.
local MODIFIERS = { "", "SHIFT-", "CTRL-", "CTRL-SHIFT-", "ALT-", "ALT-SHIFT-", "ALT-CTRL-", "ALT-CTRL-SHIFT-" }
local MULTI_BARS = { "MultiBarBottomLeft", "MultiBarBottomRight", "MultiBarRight", "MultiBarLeft", "MultiBar5", "MultiBar6", "MultiBar7" }

local function BarButton(action)
	local index = action:match("^ACTIONBUTTON(%d+)$")
	if index then return "ActionButton" .. index end
	local bar, slot = action:match("^MULTIACTIONBAR(%d+)BUTTON(%d+)$")
	local name = bar and MULTI_BARS[tonumber(bar)]
	return name and (name .. "Button" .. slot)
end

-- A button acts on the press or the release depending on how it was set up, so it is sent both.
local function ClickText(name, mouseButton)
	return ("/click %s %s 1\n/click %s %s"):format(name, mouseButton, name, mouseButton)
end

-- Which macro attribute runs a binding, and its value. Other bindings, such as autorun, can't be run from here.
local function BindingCommand(action)
	local button = BarButton(action)
	if button then return "macrotext", ClickText(button, "LeftButton") end
	local kind, rest = action:match("^(%u+) (.+)$")
	if kind == "SPELL" then return "macrotext", "/cast [@mouseover,help][] " .. rest end
	if kind == "ITEM" then return "macrotext", "/use [@mouseover,help][] " .. rest end
	if kind == "MACRO" then return "macro", rest end
	if kind == "CLICK" then
		local name, mouseButton = rest:match("^([^:]+):(.+)$")
		return "macrotext", ClickText(name or rest, mouseButton or "LeftButton")
	end
end

local function BoundAction(key)
	local action = GetBindingAction(key, true)
	if action and action ~= "" then return action end
end

-- The game falls back to the plain binding when a modified one isn't set, so this does too.
local function MouseBindingAttributes()
	local attributes = {}
	for number = 3, 5 do
		local key = "BUTTON" .. number
		for _, modifiers in ipairs(MODIFIERS) do
			local action = BoundAction(modifiers .. key) or BoundAction(key)
			local field, value
			if action then field, value = BindingCommand(action) end
			if field then
				local prefix = modifiers:lower()
				attributes[prefix .. "type" .. number] = "macro"
				attributes[prefix .. field .. number] = value
			end
		end
	end
	return attributes
end

local function AimClicks(button, attributes)
	local previous = button.clicks
	for name in pairs(previous) do
		if attributes[name] == nil then button:SetAttribute(name, nil) end
	end
	for name, value in pairs(attributes) do
		if previous[name] ~= value then button:SetAttribute(name, value) end
	end
	button.clicks = attributes
end

-- Points the hover areas at whoever each wedge is drawing. Preview wedges are nobody, so they get no unit.
-- A pet can appear or die in combat, when attributes are locked, so pet arcs use a secure driver
-- that follows the same rule the drawing does. A dead owner comes first, so resurrection still lands.
-- "unit" is the mouseover aim and "unit1" the left-click aim, so clicks survive the mouseover toggle.
function ns.SyncHover()
	if InCombatLockdown() then return end
	local hover = ns.db.mouseover
	local mouseBindings = MouseBindingAttributes()
	for _, slot in ipairs(ns.slots) do slot.hoverPet = ns.PetEnabled(slot.class) end
	for _, pie in ipairs(ns.shownPies) do
		for i = 1, pie.hitUsed do
			local button = pie.hitButtons[i]
			local slot = pie.slots[button.slot]
			local unit = (not ns.demo) and slot.unit or nil
			local driver
			if unit and button.isPet and slot.hoverPet then
				local pet = slot.petUnit
				driver = ("[@%s,dead] %s; [@%s,exists,nodead] %s; %s"):format(unit, unit, pet, pet, unit)
			end
			Aim(button, "unit1", unit, driver)
			Aim(button, "unit", hover and unit or nil, hover and driver or nil)
			AimClicks(button, mouseBindings)
		end
	end
end

-- ---- Which pies are on screen --------------------------------------------------------------------

local function ShowIf(region, shown)
	if shown then region:Show() else region:Hide() end
end

-- Wedges past a raid pie's count, and every wedge of a pie that is put away, draw nothing.
local function Blank(slot)
	ns.SetMode(slot, "empty")
	ns.SetRole(slot, nil, false)
	ns.SetRoleTint(slot, nil, false)
	ns.ClearDispel(slot)
	ns.SetTargetOutline(slot, false, false)
	slot.unit, slot.guid, slot.petUnit, slot.demo = nil, nil, nil, nil
end

-- list: the pies to show, in layout order. wedges: the raid pie's wedge count, if it is in the list.
-- labels: text over each pie, or nil. Moves secure frames, so only out of combat. Laying out hover
-- areas is the slow part, so nothing happens when the pies, labels and wedge count are as they were.
local shownKey
function ns.UsePies(list, wedges, labels)
	local key = {}
	for n, pie in ipairs(list) do key[n] = pie.id .. ":" .. (labels and labels[n] or "") end
	key = table.concat(key, ",") .. "/" .. tostring(wedges)
	if key == shownKey then return end
	shownKey = key

	local using = {}
	for _, pie in ipairs(list) do using[pie] = true end
	for _, pie in ipairs(ns.pies) do
		if not using[pie] then
			for _, slot in ipairs(pie.slots) do Blank(slot) end
			pie.root:Hide()
		end
	end
	if raidPie and using[raidPie] then
		raidPie.wedges = math.max(RAID_WEDGES_MIN, math.min(RAID_WEDGES_MAX, wedges or RAID_WEDGES_MIN))
		for i = raidPie.wedges + 1, raidPie.maxWedges do Blank(raidPie.slots[i]) end
	end
	ns.shownPies = list
	ns.slots = {}
	for n, pie in ipairs(list) do
		pie.root:Show()
		pie.label:SetText(labels and labels[n] or "")
		for i = 1, pie.wedges do ns.slots[#ns.slots + 1] = pie.slots[i] end
	end
	ns.Layout()
	ns.laidOut = true
end

-- ---- Layout ------------------------------------------------------------------------------------

local function PixelSize()
	local _, height = GetPhysicalScreenSize()
	if not height or height == 0 then return 1 end
	return 768 / height / anchor:GetEffectiveScale()
end

local function PieSize(pie)
	return pie.kind == "raid" and ns.db.raidSize or ns.db.size
end

-- A full shield reaches the resource line, at any class setting, so the same % always looks the same.
local function PlaceShieldBars(pie, bars, radius)
	local length = radius * (1 - RESOURCE_SHARE) / SHIELD_HOLE
	local offset = radius / SHIELD_HOLE - length / 2
	bars.right:SetSize(length, 2)
	bars.right:SetPoint("CENTER", pie.root, "CENTER", offset, 0)
	bars.left:SetSize(length, 2)
	bars.left:SetPoint("CENTER", pie.root, "CENTER", -offset, 0)
	bars.top:SetSize(2, length)
	bars.top:SetPoint("CENTER", pie.root, "CENTER", 0, offset)
	bars.bottom:SetSize(2, length)
	bars.bottom:SetPoint("CENTER", pie.root, "CENTER", 0, -offset)
end

-- The health bars cover the same radial span as the health band, scaled to the round mask's edge.
local function PlaceHealBars(pie, chains, radius, showsResource)
	local start = (showsResource and radius * RESOURCE_SHARE or 0) * HEAL_MASK_FILL
	local length = radius * HEAL_MASK_FILL - start
	for side, chain in pairs(chains) do
		local across = side == "right" or side == "left"
		chain.health:SetSize(across and length or 2, across and 2 or length)
		chain.heal:SetSize(across and length or 2, across and 2 or length)
	end
	chains.right.health:SetPoint("LEFT", pie.root, "CENTER", start, 0)
	chains.left.health:SetPoint("RIGHT", pie.root, "CENTER", -start, 0)
	chains.top.health:SetPoint("BOTTOM", pie.root, "CENTER", 0, start)
	chains.bottom.health:SetPoint("TOP", pie.root, "CENTER", 0, -start)
end

-- How much smaller than a party wedge's a symbol must be to fit a wedge of this arc.
local function RoleScale(pie)
	return math.min(1, math.sin(Arc(pie) / 2 * RAD) / math.sin(36 * RAD))
end

-- Centered on the member's own part of the wedge, so a pet's slice never sits under it.
local function PlaceRole(slot)
	local pie = slot.pie
	local wedge = Arc(pie)
	local arc = slot.showsPet and wedge * (1 - PET_SHARE) or wedge
	local theta = ((slot.index - 1) * wedge - wedge / 2 + arc / 2) * RAD
	local distance = PieSize(pie) / 2 * ROLE_DISTANCE
	local x, y = math.sin(theta) * distance, math.cos(theta) * distance
	for _, part in ipairs({ slot.role, slot.roleTint, slot.roleGlow, slot.roleTimer, slot.roleMinutes }) do
		part:SetPoint("CENTER", pie.root, "CENTER", x, y)
	end
end

-- Returns whether anything moved. The client often reports a scale or display change at login that
-- changes nothing, and a pie whose size, pixel scale and wedge count are as before is left alone.
local function LayoutPie(pie, px)
	local size = PieSize(pie)
	local key = size .. "/" .. px .. "/" .. pie.wedges
	if pie.layoutKey == key then return false end
	pie.layoutKey = key
	local radius = size / 2
	local wedge = Arc(pie)
	pie.root:SetSize(size, size)

	local inner = radius * RESOURCE_SHARE
	local healthQuad = size * CELL_HALF_HEALTH / (CELL_HALF_HEALTH - CELL_PAD_HEALTH)
	local resourceQuad = inner * 2 * CELL_HALF_RES / (CELL_HALF_RES - CELL_PAD_RES)

	-- Outlines keep the share of a wedge's width they have on a full-size party wedge, so a small pie
	-- or a narrow raid wedge looks like a big one scaled down. The rim follows the pie's size alone.
	-- Raid spokes stop short of the center. Whole pixels stay crisp.
	local narrow = pie.wedges > GROUP_WEDGES
	local shrink = math.min(1, size / LINE_FULL_SIZE)
	local thin = math.min(1, size * wedge / (LINE_FULL_SIZE * 72))
	local function Pixels(n) return math.max(1, math.floor(n + 0.5)) * px end
	local outline, lowOutline = Pixels(RING_PX * thin), Pixels(LOW_RING_PX * thin)
	local ringWidth = Pixels(RING_PX * shrink)

	pie.ring:SetSize(size * METAL_FILL, size * METAL_FILL)
	local holeSize = (radius - ringWidth) * 2 / HOLE_FRACTION
	pie.holeOuter:SetSize(holeSize, holeSize)
	local lowHoleSize = (radius - lowOutline) * 2 / HOLE_FRACTION
	pie.holeLow:SetSize(lowHoleSize, lowHoleSize)

	local spokeWidth = math.max(2 * px, outline) -- a lit and a shaded half, a pixel each at least
	local spokeStart = narrow and radius * NARROW_SPOKE_FROM or 0
	for i, spoke in ipairs(pie.spokes) do
		if i <= pie.wedges then PlaceSpoke(pie, spoke, spokeWidth, spokeStart, radius, (i - 1) * wedge - wedge / 2) end
	end

	ns.ShowMetal(pie)

	local symbol = size * ROLE_SIZE * RoleScale(pie)
	local timerFont = math.max(ROLE_TIMER_MIN, size * ROLE_TIMER_SIZE * RoleScale(pie))
	for i = 1, pie.wedges do
		local slot = pie.slots[i]
		local start = (i - 1) * wedge - wedge / 2
		local petStart = start + wedge * (1 - PET_SHARE)
		local s = slot.sectors
		PlaceSector(s.full, size, start, start + wedge)
		PlaceSector(s.class, size, start, petStart)
		PlaceSector(s.pet, size, petStart, start + wedge)
		PlaceSector(s.low, size, start, start + wedge)
		PlaceSector(s.petOutline, size, petStart, start + wedge)
		slot.backing:SetSize(size * DISK_FILL, size * DISK_FILL)
		slot.healthWhole:SetSize(healthQuad, healthQuad)
		slot.healthClass:SetSize(healthQuad, healthQuad)
		slot.pet:SetSize(healthQuad, healthQuad)
		slot.resourceWhole:SetSize(resourceQuad, resourceQuad)
		slot.resourceClass:SetSize(resourceQuad, resourceQuad)
		slot.shieldWhole:SetSize(size * DISK_FILL, size * DISK_FILL)
		slot.shieldClass:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceShieldBars(pie, slot.shieldBars, radius)
		slot.healWhole:SetSize(size * DISK_FILL, size * DISK_FILL)
		slot.healClass:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceHealBars(pie, slot.healChains, radius, slot.showsResource ~= false)
		slot.lowArc:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceLine(pie, slot.lowLeft, lowOutline, 0, radius, start, 0)
		PlaceLine(pie, slot.lowRight, lowOutline, 0, radius, start + wedge, 0)
		slot.targetParts[1]:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceLine(pie, slot.targetParts[2], outline, 0, radius, start, 0)
		PlaceLine(pie, slot.targetParts[3], outline, 0, radius, start + wedge, 0)
		slot.petTargetParts[1]:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceLine(pie, slot.petTargetParts[2], outline, 0, radius, petStart, 0)
		PlaceLine(pie, slot.petTargetParts[3], outline, 0, radius, start + wedge, 0)
		slot.role:SetSize(symbol, symbol)
		slot.roleTint:SetSize(symbol, symbol)
		slot.roleGlow:SetSize(symbol * ROLE_GLOW_SCALE, symbol * ROLE_GLOW_SCALE)
		slot.roleTimer:SetFont(STANDARD_TEXT_FONT, timerFont, "OUTLINE")
		slot.roleMinutes:SetFont(STANDARD_TEXT_FONT, timerFont, "OUTLINE")
		PlaceRole(slot)
	end
	return true
end

-- Group pies wrap after "Pies per row". The raid pie and the party pie are alone.
local function Arrange()
	local columns = math.max(1, ns.db.groupColumns or 4)
	local width, height = 0, 0
	for n, pie in ipairs(ns.shownPies) do
		local size = PieSize(pie)
		local step = size * (1 + PIE_GAP)
		local col, row = (n - 1) % columns, math.floor((n - 1) / columns)
		pie.root:ClearAllPoints()
		pie.root:SetPoint("TOPLEFT", anchor, "TOPLEFT", col * step, -row * step)
		width = math.max(width, col * step + size)
		height = math.max(height, row * step + size)
	end
	anchor:SetSize(math.max(width, 1), math.max(height, 1))
end

-- Fixed-pixel lines mean this reruns when the size or the UI scale changes.
function ns.Layout()
	if InCombatLockdown() and anchor:IsProtected() then
		ns.layoutPending = true
		return
	end
	local px = PixelSize()
	for _, pie in ipairs(ns.shownPies) do LayoutPie(pie, px) end
	Arrange()

	if InCombatLockdown() then
		ns.layoutPending = true
	else
		-- Hover strips depend only on the radius and the wedges, not the pixel scale.
		for _, pie in ipairs(ns.shownPies) do
			local radius = PieSize(pie) / 2
			local key = radius .. "/" .. pie.wedges
			if pie.hitKey ~= key then
				pie.hitKey = key
				LayoutHitAreas(pie, radius)
			end
		end
		ns.SyncHover()
	end
end

-- The rim and the dividers, unless the metal is None.
function ns.ShowMetal(pie)
	local on = not ns.Metal().none
	ShowIf(pie.ring, on)
	for i, spoke in ipairs(pie.spokes) do
		local shown = on and i <= pie.wedges
		ShowIf(spoke.lit, shown)
		ShowIf(spoke.shade, shown)
	end
end

-- Metal colours and both transparency settings.
function ns.ApplyLook()
	local metal = ns.Metal()
	local target = ns.db.targetColor
	for _, pie in ipairs(ns.pies) do
		ns.ShowMetal(pie)
		pie.ring:SetVertexColor(metal.hi[1], metal.hi[2], metal.hi[3])
		for _, spoke in ipairs(pie.spokes) do TintSpoke(spoke, metal) end
		for _, slot in ipairs(pie.slots) do
			for _, parts in ipairs({ slot.targetParts, slot.petTargetParts }) do
				for _, part in ipairs(parts) do part:SetVertexColor(target[1], target[2], target[3]) end
			end
		end
		pie.colorLayer:SetAlpha(ns.db.playerAlpha)
		pie.borderLayer:SetAlpha(ns.db.borderAlpha)
	end
end

-- Picks which textures this wedge uses. Only ever called with plain facts about the member.
function ns.SetShape(slot, showsResource, showsPet)
	local sheet = TEX .. (showsResource and "sheet_health" or "sheet_health_full")
	slot.healthWhole:SetTexture(sheet)
	slot.healthClass:SetTexture(sheet)
	slot.fill = showsPet and slot.healthClass or slot.healthWhole
	slot.resource = showsPet and slot.resourceClass or slot.resourceWhole
	slot.shield = showsPet and slot.shieldClass or slot.shieldWhole
	local band = TEX .. (showsResource and "ring_health" or "disk")
	slot.healWhole:SetTexture(band)
	slot.healClass:SetTexture(band)
	slot.heal = showsPet and slot.healClass or slot.healWhole
	PlaceHealBars(slot.pie, slot.healChains, PieSize(slot.pie) / 2, showsResource)
	slot.showsResource = showsResource
	slot.showsPet = showsPet
	PlaceRole(slot)
end

-- mode: "live" draws the bands, "flat" one solid wedge, "empty" nothing at all.
function ns.SetMode(slot, mode)
	local live = mode == "live"
	ShowIf(slot.backing, mode ~= "empty")
	ShowIf(slot.healthWhole, live and slot.fill == slot.healthWhole)
	ShowIf(slot.healthClass, live and slot.fill == slot.healthClass)
	ShowIf(slot.pet, live and slot.showsPet)
	ShowIf(slot.resourceWhole, live and slot.showsResource and slot.resource == slot.resourceWhole)
	ShowIf(slot.resourceClass, live and slot.showsResource and slot.resource == slot.resourceClass)
	ShowIf(slot.shieldWhole, live and slot.shield == slot.shieldWhole)
	ShowIf(slot.shieldClass, live and slot.shield == slot.shieldClass)
	ShowIf(slot.healWhole, live and slot.heal == slot.healWhole)
	ShowIf(slot.healClass, live and slot.heal == slot.healClass)
	if not live then ns.SetLowAlpha(slot, 0) end
	slot.mode = mode
end

function ns.SetBacking(slot, color, alpha)
	slot.backing:SetVertexColor(color[1], color[2], color[3], alpha)
end

-- max and amount may be secret, so these only pass them along. SetAlpha clamps to 0-1, which makes
-- any real shield opaque and no shield invisible without ever comparing the number.
function ns.SetShield(slot, max, amount)
	local c = ns.db.shieldColor
	slot.shield:SetVertexColor(c[1], c[2], c[3], ns.SHIELD_ALPHA)
	slot.shield:SetAlpha(amount)
	for _, bar in pairs(slot.shieldBars) do
		bar:SetMinMaxValues(0, max)
		bar:SetValue(amount)
	end
end

-- Both answers may be secret booleans, which only SetAlphaFromBoolean can use. Never test them in Lua.
function ns.SetTargetOutline(slot, onMember, onPet)
	for _, part in ipairs(slot.targetParts) do part:SetAlphaFromBoolean(onMember, 1, 0) end
	for _, part in ipairs(slot.petTargetParts) do part:SetAlphaFromBoolean(onPet, 1, 0) end
end

-- Both may be secret where the game hides who is who. The texture accepts a secret path, and the
-- flag must never be tested in Lua.
function ns.SetRole(slot, texture, show)
	slot.role:SetTexture(texture)
	slot.role:SetAlphaFromBoolean(show, 1, 0)
end

-- The white copy of the symbol that takes the debuff's color. Same secret rules as SetRole.
function ns.SetRoleTint(slot, texture, show)
	slot.roleTint:SetTexture(texture)
	slot.roleTint:SetAlphaFromBoolean(show, 1, 0)
end

-- Every value may be secret, so each goes straight to a call that accepts one. The seconds and the
-- minutes are both always set; their alphas decide which one shows.
function ns.SetDispel(slot, r, g, b, glow, seconds, secondsAlpha, minutes, minutesAlpha)
	slot.roleTint:SetVertexColor(r, g, b)
	slot.roleGlow:SetVertexColor(r, g, b)
	slot.roleGlow:SetAlpha(glow)
	slot.roleTimer:SetFormattedText("%.0f", seconds)
	slot.roleTimer:SetAlpha(secondsAlpha)
	slot.roleMinutes:SetFormattedText("%.0fm", minutes)
	slot.roleMinutes:SetAlpha(minutesAlpha)
end

function ns.ClearDispel(slot)
	slot.roleTint:SetAlpha(0)
	slot.roleGlow:SetAlpha(0)
	slot.roleTimer:SetAlpha(0)
	slot.roleMinutes:SetAlpha(0)
end

function ns.SetHeal(slot, max, health, amount)
	local c = ns.db.healColor
	slot.heal:SetVertexColor(c[1], c[2], c[3], ns.HEAL_ALPHA)
	slot.heal:SetAlpha(amount)
	for _, chain in pairs(slot.healChains) do
		chain.health:SetMinMaxValues(0, max)
		chain.health:SetValue(health)
		chain.heal:SetMinMaxValues(0, max)
		chain.heal:SetValue(amount)
	end
end

-- alpha may be secret, so this passes it along and never looks at it.
function ns.SetLowAlpha(slot, alpha)
	slot.lowArc:SetAlpha(alpha)
	slot.lowLeft:SetAlpha(alpha)
	slot.lowRight:SetAlpha(alpha)
end

function ns.TintLowOutlines(r, g, b)
	for _, slot in ipairs(ns.slots) do
		slot.lowArc:SetVertexColor(r, g, b)
		slot.lowLeft:SetVertexColor(r, g, b)
		slot.lowRight:SetVertexColor(r, g, b)
	end
end

-- ---- Moving in combat --------------------------------------------------------------------------

-- The secure snippets read this, so it can only change out of combat.
function ns.SyncMoveSetting()
	if InCombatLockdown() then
		ns.moveSettingPending = true
		return
	end
	ns.moveSettingPending = false
	local on = ns.db.moveInCombat and true or false
	if anchor:GetAttribute("moveincombat") ~= on then anchor:SetAttribute("moveincombat", on) end
end

-- Called just before combat locks the frames, and once it ends. While moving in combat is on, the hover
-- areas give up drags for the fight so the release reaches their snippets.
function ns.SetCombatDrag(fighting)
	local off = fighting and anchor:GetAttribute("moveincombat")
	for _, pie in ipairs(ns.pies) do
		for _, button in ipairs(pie.hitButtons) do
			if off then button:RegisterForDrag() else button:RegisterForDrag("LeftButton") end
		end
	end
end

-- In combat the pies can't follow the cursor, so faint discs do, showing where they will land. They
-- appear once the cursor has travelled as far as the snippets need to treat the press as a move.
local ghost

local function CursorXY()
	local x, y = GetCursorPosition()
	local scale = anchor:GetEffectiveScale()
	return x / scale, y / scale
end

local function FollowCursor(self)
	if not IsMouseButtonDown("LeftButton") then
		ns.StopGhost()
		return
	end
	local x, y = CursorXY()
	if not self.moved then
		local dx, dy = x - self.startX, y - self.startY
		if dx * dx + dy * dy < 25 then return end
		self.moved = true
		self:SetAlpha(1)
	end
	self:ClearAllPoints()
	self:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", x - self.grabX, y - self.grabY)
end

function ns.StartGhost()
	local left, bottom, width, height = anchor:GetRect()
	if not left then return false end
	if not ghost then
		ghost = CreateFrame("Frame", nil, UIParent)
		ghost:SetClampedToScreen(true)
		ghost:SetFrameStrata("HIGH")
		ghost:SetScript("OnUpdate", FollowCursor)
		ghost.discs = {}
	end
	local x, y = CursorXY()
	ghost.startX, ghost.startY = x, y
	ghost.grabX, ghost.grabY = x - left, y - bottom
	ghost.moved = false
	ghost:SetAlpha(0)
	ghost:ClearAllPoints()
	ghost:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", left, bottom)
	ghost:SetSize(width, height)
	for n, pie in ipairs(ns.shownPies) do
		local disc = ghost.discs[n]
		if not disc then
			disc = ghost:CreateTexture(nil, "ARTWORK")
			disc:SetTexture(TEX .. "disk")
			disc:SetVertexColor(1, 1, 1, 0.3)
			ghost.discs[n] = disc
		end
		local l, b, w, h = pie.root:GetRect()
		disc:ClearAllPoints()
		disc:SetPoint("BOTTOMLEFT", ghost, "BOTTOMLEFT", l - left, b - bottom)
		disc:SetSize(w, h)
		disc:Show()
	end
	for n = #ns.shownPies + 1, #ghost.discs do ghost.discs[n]:Hide() end
	ghost:Show()
	return true
end

function ns.StopGhost()
	if ghost and ghost:IsShown() then
		ghost:Hide()
		-- The snippet has moved the pies by now, or left them if the press was a click; either way
		-- what is there gets saved when combat ends.
		if ghost.moved then ns.positionUnsaved = true end
	end
end
