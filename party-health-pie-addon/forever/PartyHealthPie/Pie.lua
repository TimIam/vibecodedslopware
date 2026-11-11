-- Everything drawn on screen: the wedges, the metal, and how they are placed at a given size.
--
-- Nothing here may read back an alpha, texture coordinate or colour once it has been set, because
-- those can hold secret values during play.
local _, ns = ...

local TEX = ns.TEX
local WEDGE = 72
local RESOURCE_SHARE = 2 / 5 -- the resource band's share of the radius; sheet_health is baked to match
local PET_SHARE = 0.33 -- the pet's share of a wedge's arc; the sector masks are baked to match
local SHIELD_HOLE = 0.38 -- mask_hole_shield's hole radius as a share of its half width
local HEAL_MASK_FILL = 256 / 254 -- mask_disk's disk stops 2 texels short of the texture edge
local RAD = math.pi / 180
local GRID, CELL_PAD_HEALTH, CELL_HALF_HEALTH = 8, 2, 64
local CELL_PAD_RES, CELL_HALF_RES = 2, 32
local RING_PX, LOW_RING_PX = 4, 8
local HOLE_FRACTION = 0.5 -- mask_hole's hole radius as a share of its half width
local METAL_FILL = 256 / 254 -- metal_disk's disk stops 2 texels short of the texture edge
local DISK_FILL = 128 / 126
local ROLE_GLOW_SCALE = 2.3 -- the halo's width as a multiple of the symbol's
local ROLE_TIMER_SIZE, ROLE_TIMER_MIN = 0.085, 9 -- share of the pie's diameter, and a floor that stays readable
local ROLE_DISTANCE, ROLE_SIZE = 0.62, 0.15 -- shares of the radius and the diameter; a 72 degree wedge balances at 0.62

ns.slots = {}

local root = CreateFrame("Frame", "PartyHealthPieFrame", UIParent)
root:SetClampedToScreen(true)
root:SetMovable(true)
root:EnableMouse(false) -- the hover areas take the mouse, so the square's corners stay click-through
ns.root = root

-- Player colours and metal live on separate frames so each has its own transparency.
local colorLayer = CreateFrame("Frame", nil, root)
colorLayer:SetAllPoints(root)
local borderLayer = CreateFrame("Frame", nil, root)
borderLayer:SetAllPoints(root)
borderLayer:SetFrameLevel(colorLayer:GetFrameLevel() + 2)

local function NewMask(parent, file)
	local mask = parent:CreateMaskTexture()
	mask:SetTexture(TEX .. file, "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
	mask:SetPoint("CENTER", root, "CENTER")
	return mask
end

local function NewTexture(parent, layer, sub, file, ...)
	local tex = parent:CreateTexture(nil, layer, nil, sub)
	tex:SetTexture(TEX .. file)
	tex:SetPoint("CENTER", root, "CENTER")
	for i = 1, select("#", ...) do tex:AddMaskTexture((select(i, ...))) end
	return tex
end

local function NewLine(parent, layer, sub)
	local line = parent:CreateLine(nil, layer, nil, sub)
	line:SetColorTexture(1, 1, 1, 1)
	return line
end

-- theta: degrees clockwise from 12 o'clock. side: sideways shift in UI units, for parallel lines.
local function PlaceLine(line, thickness, r0, r1, theta, side)
	local s, c = math.sin(theta * RAD), math.cos(theta * RAD)
	local nx, ny = c * side, -s * side
	line:SetThickness(thickness)
	line:SetStartPoint("CENTER", root, s * r0 + nx, c * r0 + ny)
	line:SetEndPoint("CENTER", root, s * r1 + nx, c * r1 + ny)
end

-- A spoke is two lines side by side, one lit and one shaded, which is what reads as metal.
local function NewSpoke(parent)
	return { lit = NewLine(parent, "ARTWORK", 1), shade = NewLine(parent, "ARTWORK", 1) }
end

local function PlaceSpoke(spoke, px, r0, r1, theta)
	local half = px * RING_PX / 2
	PlaceLine(spoke.lit, half, r0, r1, theta, -half / 2)
	PlaceLine(spoke.shade, half, r0, r1, theta, half / 2)
end

local function TintSpoke(spoke, metal)
	spoke.lit:SetVertexColor(metal.hi[1], metal.hi[2], metal.hi[3])
	spoke.shade:SetVertexColor(metal.lo[1], metal.lo[2], metal.lo[3])
end

-- The hole mask is oversized so white reaches past the disk it cuts: only the hole's edge matters.
local holeOuter = NewMask(borderLayer, "mask_hole")
local ring = NewTexture(borderLayer, "ARTWORK", 0, "metal_disk", holeOuter)

local spokes = {}
for i = 1, 5 do spokes[i] = NewSpoke(borderLayer) end

local holeLow = NewMask(borderLayer, "mask_hole")

-- A shield amount is secret and has no percent API, so Lua cannot size anything from it. A StatusBar
-- can: its fill edge lands where the secret value says. Four invisible bars, one per side, pin the
-- edges of a round hole mask, so the hole closes in from the rim's side as the shield grows.
local function NewHiddenBar(orientation, reverse)
	local bar = CreateFrame("StatusBar", nil, colorLayer)
	bar:SetStatusBarTexture(TEX .. "disk")
	bar:SetStatusBarColor(1, 1, 1, 0) -- vertex alpha, so the engine still lays the fill out
	bar:SetOrientation(orientation)
	bar:SetReverseFill(reverse)
	bar:SetMinMaxValues(0, 1)
	bar:SetValue(0)
	return bar
end

local function NewShieldHole(bars)
	local mask = colorLayer:CreateMaskTexture()
	mask:SetTexture(TEX .. "mask_hole_shield", "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
	mask:SetPoint("RIGHT", bars.right:GetStatusBarTexture(), "LEFT")
	mask:SetPoint("LEFT", bars.left:GetStatusBarTexture(), "RIGHT")
	mask:SetPoint("TOP", bars.top:GetStatusBarTexture(), "BOTTOM")
	mask:SetPoint("BOTTOM", bars.bottom:GetStatusBarTexture(), "TOP")
	return mask
end

-- An incoming heal starts where health ends, and one secret cannot be added to another. So each side
-- has a health bar with a heal bar anchored to the end of its fill, and the engine does the adding.
local function NewHealChain(orientation, reverse, startPoint, endPoint)
	local health = NewHiddenBar(orientation, reverse)
	local heal = NewHiddenBar(orientation, reverse)
	heal:SetPoint(startPoint, health:GetStatusBarTexture(), endPoint)
	return { health = health, heal = heal, tip = heal:GetStatusBarTexture() }
end

local function NewHealMask(chains)
	local mask = colorLayer:CreateMaskTexture()
	mask:SetTexture(TEX .. "mask_disk", "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
	mask:SetPoint("RIGHT", chains.right.tip, "RIGHT")
	mask:SetPoint("LEFT", chains.left.tip, "LEFT")
	mask:SetPoint("TOP", chains.top.tip, "TOP")
	mask:SetPoint("BOTTOM", chains.bottom.tip, "BOTTOM")
	return mask
end

for i = 1, 5 do
	local maskFull = NewMask(colorLayer, "mask_full_" .. i)
	local maskClass = NewMask(colorLayer, "mask_class_" .. i)
	local maskPet = NewMask(colorLayer, "mask_pet_" .. i)
	local maskLow = NewMask(borderLayer, "mask_full_" .. i)
	local maskPetOutline = NewMask(borderLayer, "mask_pet_" .. i)

	local shieldBars = {
		right = NewHiddenBar("HORIZONTAL", true),
		left = NewHiddenBar("HORIZONTAL", false),
		top = NewHiddenBar("VERTICAL", true),
		bottom = NewHiddenBar("VERTICAL", false),
	}
	local shieldHole = NewShieldHole(shieldBars)

	local healChains = {
		right = NewHealChain("HORIZONTAL", false, "LEFT", "RIGHT"),
		left = NewHealChain("HORIZONTAL", true, "RIGHT", "LEFT"),
		top = NewHealChain("VERTICAL", false, "BOTTOM", "TOP"),
		bottom = NewHealChain("VERTICAL", true, "TOP", "BOTTOM"),
	}
	local healMask = NewHealMask(healChains)

	local slot = {
		index = i,
		healChains = healChains,
		-- Under the health fill, which covers everything but the part beyond current health.
		healWhole = NewTexture(colorLayer, "ARTWORK", -1, "ring_health", maskFull, healMask),
		healClass = NewTexture(colorLayer, "ARTWORK", -1, "ring_health", maskClass, healMask),
		shieldBars = shieldBars,
		shieldWhole = NewTexture(colorLayer, "ARTWORK", 1, "disk", maskFull, shieldHole),
		shieldClass = NewTexture(colorLayer, "ARTWORK", 1, "disk", maskClass, shieldHole),
		masks = { maskFull, maskClass, maskPet, maskLow, maskPetOutline },
		backing = NewTexture(colorLayer, "BACKGROUND", 0, "disk", maskFull),
		healthWhole = NewTexture(colorLayer, "ARTWORK", 0, "sheet_health", maskFull),
		healthClass = NewTexture(colorLayer, "ARTWORK", 0, "sheet_health", maskClass),
		-- The pet always runs from the center to the rim and takes that arc from the resource band.
		pet = NewTexture(colorLayer, "ARTWORK", 0, "sheet_health_full", maskPet),
		resourceWhole = NewTexture(colorLayer, "ARTWORK", 0, "sheet_resource", maskFull),
		resourceClass = NewTexture(colorLayer, "ARTWORK", 0, "sheet_resource", maskClass),
		lowArc = NewTexture(borderLayer, "OVERLAY", 0, "disk", maskLow, holeLow),
		lowLeft = NewLine(borderLayer, "OVERLAY", 1),
		lowRight = NewLine(borderLayer, "OVERLAY", 1),
		-- Border-width and above the low-health outline, so a selected low member shows both colors.
		targetParts = {
			NewTexture(borderLayer, "OVERLAY", 2, "disk", maskLow, holeOuter),
			NewLine(borderLayer, "OVERLAY", 3),
			NewLine(borderLayer, "OVERLAY", 3),
		},
		petTargetParts = {
			NewTexture(borderLayer, "OVERLAY", 2, "disk", maskPetOutline, holeOuter),
			NewLine(borderLayer, "OVERLAY", 3),
			NewLine(borderLayer, "OVERLAY", 3),
		},
		-- Above every band of the wedge, and it fades with them under Player color opacity.
		role = colorLayer:CreateTexture(nil, "OVERLAY"),
		roleTint = colorLayer:CreateTexture(nil, "OVERLAY", nil, 1),
		roleGlow = NewTexture(colorLayer, "OVERLAY", -1, "role_glow"),
		roleTimer = colorLayer:CreateFontString(nil, "OVERLAY"),
	}
	slot.roleTimer:SetDrawLayer("OVERLAY", 2)
	slot.roleTimer:SetFont(STANDARD_TEXT_FONT, ROLE_TIMER_MIN, "OUTLINE") -- text set before a font is an error
	slot.roleTimer:SetTextColor(1, 1, 1)
	ns.slots[i] = slot
end

-- ---- Sprite sheet addressing ------------------------------------------------------------------

-- The API's cell numbering is undocumented, so read it off a throwaway texture using plain numbers.
local cellBase, rowMajor = 0, true
local hasSheetCells = false
do
	local probe = colorLayer:CreateTexture()
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

-- A secure button can only be a rectangle, so the circle is tiled with thin horizontal strips, each
-- belonging to the wedge under it. They carry the unit that makes [@mouseover] work. Everything here
-- is locked during combat.
local HIT_ROW = 3 -- a hover can only land on the wrong side of an edge within half of this
local hitButtons = {}
local hitUsed = 0
ns.hitButtons = hitButtons

-- Which wedge is at a point, and whether it is in that wedge's pet arc.
local function SlotAt(x, y)
	local around = (math.atan2(x, y) / RAD + WEDGE / 2) % 360
	return math.floor(around / WEDGE) % 5 + 1, around % WEDGE >= WEDGE * (1 - PET_SHARE)
end

local function HitButton(index)
	local button = hitButtons[index]
	if not button then
		button = CreateFrame("Button", nil, root, "SecureUnitButtonTemplate")
		button:SetFrameLevel(borderLayer:GetFrameLevel() + 2)
		button:EnableMouse(true)
		button:RegisterForClicks("AnyUp")
		button:SetAttribute("type1", "target") -- left-click selects whoever "unit1" names
		button.drivers = {}
		button:RegisterForDrag("LeftButton")
		button:SetScript("OnDragStart", function() ns.StartDrag() end)
		button:SetScript("OnDragStop", function() ns.StopDrag() end)
		hitButtons[index] = button
	end
	return button
end

local function PlaceStrip(left, right, top, slot, isPet)
	if right - left < 1 then return end
	hitUsed = hitUsed + 1
	local button = HitButton(hitUsed)
	button:ClearAllPoints()
	button:SetPoint("TOPLEFT", root, "CENTER", left, top)
	button:SetSize(right - left, HIT_ROW)
	button:Show()
	button.slot, button.isPet = slot, isPet
end

local function LayoutHitAreas(radius)
	hitUsed = 0
	for row = 1, math.ceil(radius * 2 / HIT_ROW) do
		local top = radius - (row - 1) * HIT_ROW
		local y = top - HIT_ROW / 2
		local half = math.sqrt(math.max(0, radius * radius - y * y))
		local left = -half
		local current, currentPet = SlotAt(-half + 0.5, y)
		for x = -half + 1, half - 1 do
			local slot, isPet = SlotAt(x + 0.5, y)
			if slot ~= current or isPet ~= currentPet then
				PlaceStrip(left, x, top, current, currentPet)
				left, current, currentPet = x, slot, isPet
			end
		end
		PlaceStrip(left, half, top, current, currentPet)
	end
	for i = hitUsed + 1, #hitButtons do hitButtons[i]:Hide() end
	ns.SyncHover()
end

local function Aim(button, attribute, unit, driver)
	local drivers = button.drivers
	if driver ~= drivers[attribute] then
		if drivers[attribute] then UnregisterAttributeDriver(button, attribute) end
		if driver then RegisterAttributeDriver(button, attribute, driver) end
		drivers[attribute] = driver
	end
	if not driver then button:SetAttribute(attribute, unit) end
end

-- Points the hover areas at whoever each wedge is drawing. Preview wedges are nobody, so they get no unit.
-- A pet can appear or die in combat, when attributes are locked, so pet arcs use a secure driver
-- that follows the same rule the drawing does. A dead owner comes first, so resurrection still lands.
-- "unit" is the mouseover aim and "unit1" the left-click aim, so clicks survive the mouseover toggle.
function ns.SyncHover()
	if InCombatLockdown() then return end
	local hover = ns.db.mouseover
	for _, slot in ipairs(ns.slots) do slot.hoverPet = ns.PetEnabled(slot.class) end
	for i = 1, hitUsed do
		local button = hitButtons[i]
		local slot = ns.slots[button.slot]
		local unit = (not ns.demo) and slot.unit or nil
		local driver
		if unit and button.isPet and slot.hoverPet then
			local pet = slot.petUnit
			driver = ("[@%s,dead] %s; [@%s,exists,nodead] %s; %s"):format(unit, unit, pet, pet, unit)
		end
		Aim(button, "unit1", unit, driver)
		Aim(button, "unit", hover and unit or nil, hover and driver or nil)
	end
end

-- ---- Layout ------------------------------------------------------------------------------------

local function PixelSize()
	local _, height = GetPhysicalScreenSize()
	if not height or height == 0 then return 1 end
	return 768 / height / root:GetEffectiveScale()
end

-- A full shield reaches the resource line, at any class setting, so the same % always looks the same.
local function PlaceShieldBars(bars, radius)
	local length = radius * (1 - RESOURCE_SHARE) / SHIELD_HOLE
	local offset = radius / SHIELD_HOLE - length / 2
	bars.right:SetSize(length, 2)
	bars.right:SetPoint("CENTER", root, "CENTER", offset, 0)
	bars.left:SetSize(length, 2)
	bars.left:SetPoint("CENTER", root, "CENTER", -offset, 0)
	bars.top:SetSize(2, length)
	bars.top:SetPoint("CENTER", root, "CENTER", 0, offset)
	bars.bottom:SetSize(2, length)
	bars.bottom:SetPoint("CENTER", root, "CENTER", 0, -offset)
end

-- The health bars cover the same radial span as the health band, scaled to the round mask's edge.
local function PlaceHealBars(chains, radius, showsResource)
	local start = (showsResource and radius * RESOURCE_SHARE or 0) * HEAL_MASK_FILL
	local length = radius * HEAL_MASK_FILL - start
	for side, chain in pairs(chains) do
		local across = side == "right" or side == "left"
		chain.health:SetSize(across and length or 2, across and 2 or length)
		chain.heal:SetSize(across and length or 2, across and 2 or length)
	end
	chains.right.health:SetPoint("LEFT", root, "CENTER", start, 0)
	chains.left.health:SetPoint("RIGHT", root, "CENTER", -start, 0)
	chains.top.health:SetPoint("BOTTOM", root, "CENTER", 0, start)
	chains.bottom.health:SetPoint("TOP", root, "CENTER", 0, -start)
end

-- Centered on the member's own part of the wedge, so a pet's slice never sits under it.
local function PlaceRole(slot)
	local arc = slot.showsPet and WEDGE * (1 - PET_SHARE) or WEDGE
	local theta = ((slot.index - 1) * WEDGE - WEDGE / 2 + arc / 2) * RAD
	local distance = ns.db.size / 2 * ROLE_DISTANCE
	local x, y = math.sin(theta) * distance, math.cos(theta) * distance
	for _, part in ipairs({ slot.role, slot.roleTint, slot.roleGlow, slot.roleTimer }) do
		part:SetPoint("CENTER", root, "CENTER", x, y)
	end
end

-- Fixed-pixel lines mean this reruns when the size or the UI scale changes.
function ns.Layout()
	if InCombatLockdown() and root:IsProtected() then
		ns.layoutPending = true
		return
	end
	local db = ns.db
	local size = db.size
	local radius = size / 2
	local px = PixelSize()
	root:SetSize(size, size)

	local inner = radius * RESOURCE_SHARE
	local healthQuad = size * CELL_HALF_HEALTH / (CELL_HALF_HEALTH - CELL_PAD_HEALTH)
	local resourceQuad = inner * 2 * CELL_HALF_RES / (CELL_HALF_RES - CELL_PAD_RES)

	ring:SetSize(size * METAL_FILL, size * METAL_FILL)
	local holeSize = (radius - RING_PX * px) * 2 / HOLE_FRACTION
	holeOuter:SetSize(holeSize, holeSize)
	local lowHoleSize = (radius - LOW_RING_PX * px) * 2 / HOLE_FRACTION
	holeLow:SetSize(lowHoleSize, lowHoleSize)

	for i, spoke in ipairs(spokes) do
		PlaceSpoke(spoke, px, 0, radius, (i - 1) * WEDGE - WEDGE / 2)
	end

	for i, slot in ipairs(ns.slots) do
		local start = (i - 1) * WEDGE - WEDGE / 2
		for _, mask in ipairs(slot.masks) do mask:SetSize(size, size) end
		slot.backing:SetSize(size * DISK_FILL, size * DISK_FILL)
		slot.healthWhole:SetSize(healthQuad, healthQuad)
		slot.healthClass:SetSize(healthQuad, healthQuad)
		slot.pet:SetSize(healthQuad, healthQuad)
		slot.resourceWhole:SetSize(resourceQuad, resourceQuad)
		slot.resourceClass:SetSize(resourceQuad, resourceQuad)
		slot.shieldWhole:SetSize(size * DISK_FILL, size * DISK_FILL)
		slot.shieldClass:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceShieldBars(slot.shieldBars, radius)
		slot.healWhole:SetSize(size * DISK_FILL, size * DISK_FILL)
		slot.healClass:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceHealBars(slot.healChains, radius, slot.showsResource ~= false)
		slot.lowArc:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceLine(slot.lowLeft, LOW_RING_PX * px, 0, radius, start, 0)
		PlaceLine(slot.lowRight, LOW_RING_PX * px, 0, radius, start + WEDGE, 0)
		local outline = RING_PX * px
		local petStart = start + WEDGE * (1 - PET_SHARE)
		slot.targetParts[1]:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceLine(slot.targetParts[2], outline, 0, radius, start, 0)
		PlaceLine(slot.targetParts[3], outline, 0, radius, start + WEDGE, 0)
		slot.petTargetParts[1]:SetSize(size * DISK_FILL, size * DISK_FILL)
		PlaceLine(slot.petTargetParts[2], outline, 0, radius, petStart, 0)
		PlaceLine(slot.petTargetParts[3], outline, 0, radius, start + WEDGE, 0)
		slot.role:SetSize(size * ROLE_SIZE, size * ROLE_SIZE)
		slot.roleTint:SetSize(size * ROLE_SIZE, size * ROLE_SIZE)
		slot.roleGlow:SetSize(size * ROLE_SIZE * ROLE_GLOW_SCALE, size * ROLE_SIZE * ROLE_GLOW_SCALE)
		slot.roleTimer:SetFont(STANDARD_TEXT_FONT, math.max(ROLE_TIMER_MIN, size * ROLE_TIMER_SIZE), "OUTLINE")
		PlaceRole(slot)
	end

	if InCombatLockdown() then
		ns.layoutPending = true
	else
		LayoutHitAreas(radius)
	end
end

-- Metal colours and both transparency settings.
function ns.ApplyLook()
	local metal = ns.Metal()
	ring:SetVertexColor(metal.hi[1], metal.hi[2], metal.hi[3])
	for _, spoke in ipairs(spokes) do TintSpoke(spoke, metal) end
	local target = ns.db.targetColor
	for _, slot in ipairs(ns.slots) do
		for _, parts in ipairs({ slot.targetParts, slot.petTargetParts }) do
			for _, part in ipairs(parts) do part:SetVertexColor(target[1], target[2], target[3]) end
		end
	end
	colorLayer:SetAlpha(ns.db.playerAlpha)
	borderLayer:SetAlpha(ns.db.borderAlpha)
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
	PlaceHealBars(slot.healChains, ns.db.size / 2, showsResource)
	slot.showsResource = showsResource
	slot.showsPet = showsPet
	PlaceRole(slot)
end

local function ShowIf(region, shown)
	if shown then region:Show() else region:Hide() end
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

-- Every value may be secret, so each goes straight to a call that accepts one.
function ns.SetDispel(slot, r, g, b, glow, seconds, timerAlpha)
	slot.roleTint:SetVertexColor(r, g, b)
	slot.roleGlow:SetVertexColor(r, g, b)
	slot.roleGlow:SetAlpha(glow)
	slot.roleTimer:SetFormattedText("%.0f", seconds)
	slot.roleTimer:SetAlpha(timerAlpha)
end

function ns.ClearDispel(slot)
	slot.roleTint:SetAlpha(0)
	slot.roleGlow:SetAlpha(0)
	slot.roleTimer:SetAlpha(0)
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
