-- The addon menu, under Options > AddOns > Party Health Pie (or /php).
local _, ns = ...

local RED, GOLD = "|cffff6060", "|cffffd100"
local refreshers = {}
local category

local function Changed()
	ns.ApplySettings()
end

local function AddRefresher(fn)
	refreshers[#refreshers + 1] = fn
end

function ns.RefreshOptions()
	for _, fn in ipairs(refreshers) do fn() end
end

local function Label(parent, text, x, y, template)
	local fs = parent:CreateFontString(nil, "ARTWORK", template or "GameFontHighlight")
	fs:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
	fs:SetText(text)
	return fs
end

local function Heading(parent, text, y)
	return Label(parent, GOLD .. text .. "|r", 16, y, "GameFontNormalLarge")
end

local function OpenPicker(get, set)
	local start = get()
	local function Current()
		local r, g, b = ColorPickerFrame:GetColorRGB()
		set({ r, g, b })
		Changed()
	end
	local function Cancel()
		set(start)
		Changed()
	end
	if ColorPickerFrame.SetupColorPickerAndShow then
		ColorPickerFrame:SetupColorPickerAndShow({
			r = start[1], g = start[2], b = start[3],
			swatchFunc = Current, cancelFunc = Cancel, hasOpacity = false,
		})
	else
		ColorPickerFrame.func, ColorPickerFrame.cancelFunc, ColorPickerFrame.hasOpacity = Current, Cancel, false
		ColorPickerFrame:SetColorRGB(start[1], start[2], start[3])
		ColorPickerFrame:Show()
	end
end

local function Swatch(parent, x, y, get, set)
	local button = CreateFrame("Button", nil, parent)
	button:SetSize(22, 22)
	button:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
	local edge = button:CreateTexture(nil, "BACKGROUND")
	edge:SetAllPoints()
	edge:SetColorTexture(0.75, 0.75, 0.75, 1)
	local fill = button:CreateTexture(nil, "ARTWORK")
	fill:SetPoint("TOPLEFT", 2, -2)
	fill:SetPoint("BOTTOMRIGHT", -2, 2)
	fill:SetColorTexture(1, 1, 1, 1)
	local function Show()
		local c = get()
		fill:SetVertexColor(c[1], c[2], c[3])
	end
	button:SetScript("OnClick", function()
		OpenPicker(get, function(c)
			set(c)
			Show()
		end)
	end)
	AddRefresher(Show)
	Show()
	return button
end

local function Check(parent, x, y, text, get, set)
	local box = CreateFrame("CheckButton", nil, parent, "UICheckButtonTemplate")
	box:SetSize(26, 26)
	box:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
	if text then Label(parent, text, x + 30, y - 6) end
	box:SetScript("OnClick", function(self)
		set(self:GetChecked() and true or false)
		Changed()
	end)
	local function Show() box:SetChecked(get()) end
	AddRefresher(Show)
	Show()
	return box
end

local function Slider(parent, x, y, text, low, high, step, format, get, set)
	local title = Label(parent, text, x, y)
	local readout = Label(parent, "", x + 300, y)

	local bar = CreateFrame("Slider", nil, parent)
	bar:SetOrientation("HORIZONTAL")
	bar:SetSize(280, 16)
	bar:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -6)
	bar:SetMinMaxValues(low, high)
	bar:SetValueStep(step)
	bar:SetObeyStepOnDrag(true)
	local track = bar:CreateTexture(nil, "BACKGROUND")
	track:SetPoint("LEFT")
	track:SetPoint("RIGHT")
	track:SetHeight(6)
	track:SetColorTexture(0.25, 0.25, 0.25, 1)
	local thumb = bar:CreateTexture(nil, "ARTWORK")
	thumb:SetSize(12, 18)
	thumb:SetColorTexture(1, 0.82, 0, 1)
	bar:SetThumbTexture(thumb)

	local syncing = false
	local function ShowValue(value) readout:SetText(format(value)) end
	bar:SetScript("OnValueChanged", function(_, value)
		if syncing then return end
		set(value)
		ShowValue(value)
		Changed()
	end)
	local function Show()
		syncing = true
		bar:SetValue(get())
		syncing = false
		ShowValue(get())
	end
	AddRefresher(Show)
	Show()
end

local function Percent(v) return string.format("%d%%", math.floor(v * 100 + 0.5)) end
local function Pixels(v) return string.format("%d px", math.floor(v + 0.5)) end

local function ClassName(class)
	if LOCALIZED_CLASS_NAMES_MALE and LOCALIZED_CLASS_NAMES_MALE[class] then
		return LOCALIZED_CLASS_NAMES_MALE[class]
	end
	return class
end

local function MetalChooser(parent, y)
	local buttons = {}
	local x = 16
	for _, metal in ipairs(ns.METALS) do
		local button = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
		button:SetSize(92, 24)
		button:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
		button:SetText(metal.name)
		button:SetScript("OnClick", function()
			ns.db.metal = metal.key
			Changed()
			ns.RefreshOptions()
		end)
		buttons[metal.key] = button
		x = x + 98
	end
	AddRefresher(function()
		for key, button in pairs(buttons) do
			button:SetEnabled(key ~= ns.db.metal)
		end
	end)
end

local function Build(content)
	local y = -12
	Label(content, "Party Health Pie", 16, y, "GameFontNormalHuge")
	y = y - 30
	Label(content, "Drag the circle to move it. |cffffffff/php demo|r previews a sample party.", 16, y)
	y = y - 26

	local preview = CreateFrame("Button", nil, content, "UIPanelButtonTemplate")
	preview:SetSize(150, 24)
	preview:SetPoint("TOPLEFT", content, "TOPLEFT", 16, y)
	preview:SetScript("OnClick", function()
		ns.SetDemo(not ns.demo)
		ns.RefreshOptions()
	end)
	AddRefresher(function() preview:SetText(ns.IsDemo() and "Stop Preview" or "Preview Party") end)

	local reset = CreateFrame("Button", nil, content, "UIPanelButtonTemplate")
	reset:SetSize(150, 24)
	reset:SetPoint("TOPLEFT", content, "TOPLEFT", 174, y)
	reset:SetText("Reset to Defaults")
	reset:SetScript("OnClick", function()
		ns.ResetDB()
		Changed()
		ns.RefreshOptions()
	end)
	y = y - 42

	Heading(content, "Size and Transparency", y)
	y = y - 28
	Slider(content, 16, y, "Size", ns.SIZE_MIN, ns.SIZE_MAX, 2, Pixels,
		function() return ns.db.size end, function(v) ns.db.size = v end)
	y = y - 50
	Slider(content, 16, y, "Border opacity", 0, 1, 0.05, Percent,
		function() return ns.db.borderAlpha end, function(v) ns.db.borderAlpha = v end)
	y = y - 50
	Slider(content, 16, y, "Player color opacity", 0, 1, 0.05, Percent,
		function() return ns.db.playerAlpha end, function(v) ns.db.playerAlpha = v end)
	y = y - 56

	Heading(content, "Border Metal", y)
	y = y - 30
	MetalChooser(content, y)
	y = y - 36
	Label(content, "Selected target outline", 46, y - 4)
	Swatch(content, 16, y, function() return ns.db.targetColor end, function(c) ns.db.targetColor = c end)
	y = y - 42

	Heading(content, "Role Symbols", y)
	y = y - 28
	Check(content, 16, y, "Show a tank, healer or DPS symbol on each wedge",
		function() return ns.db.roleIcons end, function(v) ns.db.roleIcons = v end)
	y = y - 30
	Check(content, 16, y, "Color and glow it, with a timer, for debuffs you can dispel",
		function() return ns.db.dispelGlow end, function(v) ns.db.dispelGlow = v end)
	y = y - 40

	Heading(content, "Mouseover Healing", y)
	y = y - 28
	Check(content, 16, y, "Hovering a wedge targets that player or pet (changes wait for combat to end)",
		function() return ns.db.mouseover end,
		function(v)
			ns.db.mouseover = v
			if v then ns.ApplyGameMouseover() end
		end)
	y = y - 40

	Heading(content, "Low Health", y)
	y = y - 28
	Check(content, 16, y, "Flash the outline at low health",
		function() return ns.db.flash end, function(v) ns.db.flash = v end)
	y = y - 34
	Label(content, "Low-health wedge color", 46, y - 4)
	Swatch(content, 16, y, function() return ns.db.lowFill end, function(c) ns.db.lowFill = c end)
	y = y - 30
	Label(content, "Outline flash, dark end", 46, y - 4)
	Swatch(content, 16, y, function() return ns.db.flashLow end, function(c) ns.db.flashLow = c end)
	y = y - 30
	Label(content, "Outline flash, bright end (used when flashing is off)", 46, y - 4)
	Swatch(content, 16, y, function() return ns.db.flashHigh end, function(c) ns.db.flashHigh = c end)
	y = y - 42

	Heading(content, "Shields and Incoming Heals", y)
	y = y - 28
	Label(content, "Shield color", 46, y - 4)
	Swatch(content, 16, y, function() return ns.db.shieldColor end, function(c) ns.db.shieldColor = c end)
	y = y - 30
	Label(content, "Incoming heal color", 46, y - 4)
	Swatch(content, 16, y, function() return ns.db.healColor end, function(c) ns.db.healColor = c end)
	y = y - 42

	Heading(content, "Classes", y)
	y = y - 28
	local COL_CLASS, COL_PET, COL_PET_ON, COL_RES_ON, COL_SECONDARY = 136, 200, 268, 346, 424
	Label(content, "Class", 16, y, "GameFontNormal")
	Label(content, "Color", COL_CLASS - 6, y, "GameFontNormal")
	Label(content, "Pet Color", COL_PET - 14, y, "GameFontNormal")
	Label(content, "Pet Wedge", COL_PET_ON - 12, y, "GameFontNormal")
	Label(content, "Resource", COL_RES_ON - 10, y, "GameFontNormal")
	Label(content, "Secondary", COL_SECONDARY, y, "GameFontNormal")
	y = y - 24
	for _, class in ipairs(ns.ClassList()) do
		Label(content, ClassName(class), 16, y - 4)
		Swatch(content, COL_CLASS, y, function() return ns.ClassColor(class) end,
			function(c) ns.db.classColors[class] = c end)
		Swatch(content, COL_PET, y, function() return ns.PetColor(class) end,
			function(c) ns.db.petColors[class] = c end)
		Check(content, COL_PET_ON, y + 2, nil, function() return ns.PetEnabled(class) end,
			function(v) ns.db.petOff[class] = (not v) or nil end)
		Check(content, COL_RES_ON, y + 2, nil, function() return ns.ResourceEnabled(class) end,
			function(v) ns.db.resourceOff[class] = (not v) or nil end)
		local secondary = ns.SECONDARY[class]
		if secondary then
			Check(content, COL_SECONDARY, y + 2, secondary.label,
				function() return ns.db.secondaryOn[class] == true end,
				function(v) ns.db.secondaryOn[class] = v or nil end)
		end
		y = y - 28
	end
	y = y - 14

	Heading(content, "Resource Colors", y)
	y = y - 28
	for _, entry in ipairs(ns.RESOURCES) do
		local token = entry[1]
		Label(content, entry[2], 46, y - 4)
		Swatch(content, 16, y, function() return ns.ResourceColor(token) end,
			function(c) ns.db.resourceColors[token] = c end)
		y = y - 28
	end
	return -y + 20
end

function ns.CreateOptions()
	local panel = CreateFrame("Frame")
	panel.name = "Party Health Pie"

	local scroll = CreateFrame("ScrollFrame", nil, panel, "UIPanelScrollFrameTemplate")
	scroll:SetPoint("TOPLEFT", 4, -4)
	scroll:SetPoint("BOTTOMRIGHT", -28, 4)
	local content = CreateFrame("Frame", nil, scroll)
	content:SetSize(600, 1)
	scroll:SetScrollChild(content)

	local height = Build(content)
	content:SetHeight(height)
	ns.RefreshOptions()

	category = Settings.RegisterCanvasLayoutCategory(panel, panel.name)
	Settings.RegisterAddOnCategory(category)
end

function ns.OpenOptions()
	if not category then
		print(RED .. "Party Health Pie:|r the options are not ready yet.")
		return
	end
	Settings.OpenToCategory(category:GetID())
end
