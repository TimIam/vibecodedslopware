-- Defaults, saved settings and the colour lookups the rest of the addon reads.
local _, ns = ...

ns.TEX = "Interface\\AddOns\\PartyHealthPie\\Textures\\"

local function Hex(s)
	return { tonumber(s:sub(1, 2), 16) / 255, tonumber(s:sub(3, 4), 16) / 255, tonumber(s:sub(5, 6), 16) / 255 }
end
ns.Hex = Hex

ns.DEAD_COLOR = Hex("232323")
ns.OFFLINE_COLOR = Hex("555555")
ns.BACKING_COLOR = { 0, 0, 0 } -- the drained part of a live wedge
ns.BACKING_ALPHA = 0.55
ns.SHIELD_ALPHA = 0.85 -- lets the class color show through a shield
ns.HEAL_ALPHA = 0.85

-- Indexed by the game's dispel type: magic, curse, disease, poison.
ns.DISPEL_COLORS = { Hex("33A0FF"), Hex("B04DFF"), Hex("D9A441"), Hex("35C935") }
ns.GLOW_MIN = 0.3 -- the halo's opacity as a debuff runs out

ns.LOW_ENTER = 0.33
ns.LOW_LEAVE = 0.50
ns.FLASH_HZ = 3

-- Display order of the classes in the menu, with colours used only if the client has none.
ns.CLASSES = {
	{ "WARRIOR", "C69B6D" }, { "PALADIN", "F48CBA" }, { "HUNTER", "AAD372" },
	{ "ROGUE", "FFF468" }, { "PRIEST", "FFFFFF" }, { "DEATHKNIGHT", "C41E3A" },
	{ "SHAMAN", "0070DD" }, { "MAGE", "3FC7EB" }, { "WARLOCK", "8788EE" },
	{ "MONK", "00FF98" }, { "DRUID", "FF7C0A" }, { "DEMONHUNTER", "A330C9" },
	{ "EVOKER", "33937F" },
}

ns.RESOURCES = {
	{ "MANA", "Mana", "3366FF" }, { "RAGE", "Rage", "FF1A1A" }, { "ENERGY", "Energy", "FFE600" },
	{ "FOCUS", "Focus", "FF8040" }, { "RUNIC_POWER", "Runic Power", "00D1FF" },
	{ "LUNAR_POWER", "Astral Power", "4D85E6" }, { "MAELSTROM", "Maelstrom", "0080FF" },
	{ "INSANITY", "Insanity", "6600CC" }, { "FURY", "Fury", "C942FD" }, { "PAIN", "Pain", "FF9C00" },
	{ "COMBO_POINTS", "Combo Points", "FFF569" }, { "RUNES", "Runes", "808080" },
	{ "SOUL_SHARDS", "Soul Shards", "80528C" }, { "HOLY_POWER", "Holy Power", "F2E699" },
	{ "CHI", "Chi", "B5FFEB" }, { "ARCANE_CHARGES", "Arcane Charges", "1A1AFA" },
	{ "ESSENCE", "Essence", "5CE0C6" },
}

-- The class resources that are not a unit's main power type. Enum.PowerType numbers, so the band can
-- ask for them directly. A spec without the resource reports a maximum of 0 and keeps its main power.
ns.SECONDARY = {
	ROGUE = { powerType = 4, token = "COMBO_POINTS", label = "Combo Points" },
	DRUID = { powerType = 4, token = "COMBO_POINTS", label = "Combo Points" },
	DEATHKNIGHT = { powerType = 5, token = "RUNES", label = "Runes" },
	WARLOCK = { powerType = 7, token = "SOUL_SHARDS", label = "Soul Shards" },
	PALADIN = { powerType = 9, token = "HOLY_POWER", label = "Holy Power" },
	MONK = { powerType = 12, token = "CHI", label = "Chi" },
	MAGE = { powerType = 16, token = "ARCANE_CHARGES", label = "Arcane Charges" },
	EVOKER = { powerType = 19, token = "ESSENCE", label = "Essence" },
}

ns.METALS = {
	{ key = "steel", name = "Steel", hi = Hex("C9CED6"), lo = Hex("6C727C") },
	{ key = "iron", name = "Iron", hi = Hex("7D7F84"), lo = Hex("3A3B3F") },
	{ key = "silver", name = "Silver", hi = Hex("F2F3F5"), lo = Hex("A4A7AD") },
	{ key = "gold", name = "Gold", hi = Hex("FFE27A"), lo = Hex("A8831E") },
	{ key = "brass", name = "Brass", hi = Hex("D9BE6E"), lo = Hex("7A6228") },
}

ns.SIZE_MIN, ns.SIZE_MAX = 90, 420

local DEFAULTS = {
	size = 200,
	metal = "steel",
	borderAlpha = 1,
	playerAlpha = 1,
	flash = true,
	mouseover = true,
	roleIcons = true,
	dispelGlow = true,
	lowFill = Hex("770000"),
	flashLow = Hex("330000"),
	flashHigh = Hex("AA0000"),
	defaultPet = Hex("44DD22"),
	shieldColor = Hex("2E9BFF"),
	healColor = Hex("7CFFB0"),
	targetColor = Hex("FFFF00"),
}

-- Per-class and per-resource tables hold only what the player has changed.
local function Fresh()
	return { classColors = {}, resourceColors = {}, petColors = {}, petOff = {}, resourceOff = {}, secondaryOn = {} }
end

function ns.InitDB()
	PartyHealthPieDB = PartyHealthPieDB or {}
	local db = PartyHealthPieDB
	for key, value in pairs(Fresh()) do
		if type(db[key]) ~= "table" then db[key] = value end
	end
	for key, value in pairs(DEFAULTS) do
		if db[key] == nil then db[key] = value end
	end
	ns.db = db
end

function ns.ResetDB()
	local point = ns.db.point
	for key in pairs(ns.db) do ns.db[key] = nil end
	ns.InitDB()
	ns.db.point = point
end

-- The classes this client actually has, in its own order.
function ns.ClassList()
	local list = {}
	for i = 1, GetNumClasses() do
		local _, class = GetClassInfo(i)
		if class then list[#list + 1] = class end
	end
	if #list == 0 then
		for _, entry in ipairs(ns.CLASSES) do list[#list + 1] = entry[1] end
	end
	return list
end

function ns.DefaultClassColor(class)
	local c = RAID_CLASS_COLORS and RAID_CLASS_COLORS[class]
	if c then return { c.r, c.g, c.b } end
	for _, entry in ipairs(ns.CLASSES) do
		if entry[1] == class then return Hex(entry[2]) end
	end
	return { 0.6, 0.6, 0.6 }
end

function ns.DefaultResourceColor(token)
	for _, entry in ipairs(ns.RESOURCES) do
		if entry[1] == token then return Hex(entry[3]) end
	end
	return { 0.5, 0.5, 0.5 }
end

function ns.ClassColor(class) return ns.db.classColors[class] or ns.DefaultClassColor(class) end
function ns.ResourceColor(token) return ns.db.resourceColors[token] or ns.DefaultResourceColor(token) end
function ns.PetColor(class) return ns.db.petColors[class] or ns.db.defaultPet end

function ns.Metal()
	for _, metal in ipairs(ns.METALS) do
		if metal.key == ns.db.metal then return metal end
	end
	return ns.METALS[1]
end

function ns.PetEnabled(class) return not ns.db.petOff[class] end
function ns.ResourceEnabled(class) return not ns.db.resourceOff[class] end
function ns.ActiveSecondary(class) return ns.db.secondaryOn[class] and ns.SECONDARY[class] or nil end
