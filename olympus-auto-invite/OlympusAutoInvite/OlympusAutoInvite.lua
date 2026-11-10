-- Olympus Auto Invite: guild invites by whisper.
--   Auto mode: anyone who whispers your keyword gets a guild invite.
--   Set the keyword and turn it on under Options > AddOns > Olympus Auto Invite.
--
--   /ginv           invite the last person who whispered you
--   /ginv Name      invite Name instead
--   /ginv ?         show the auto mode status and who /ginv would invite
--   /ginv on|off    turn auto mode on or off
--   /ginv options   open the settings

local ADDON = ...
local TITLE = "Olympus Auto Invite"
local PREFIX = "|cff40ff40" .. TITLE .. ":|r "
local REPEAT_SECONDS = 10 -- the same person can't trigger a second auto invite sooner than this

local db
local category
local lastWhisperer
local lastAuto = {}
local refreshPanel = function() end

local function say(msg)
    DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. msg)
end

-- Forever can hide chat data from addons (secret values). Even comparing a
-- hidden value throws, so it has to be checked before anything else touches it.
local function usable(value)
    if issecretvalue and issecretvalue(value) then return false end
    return type(value) == "string" and value ~= ""
end

local function clean(text)
    return strtrim(text):lower()
end

-- A Battle.net whisper carries no character name, so look up the character
-- the friend is currently playing.
local function bnetCharacter(bnSenderID)
    if not (bnSenderID and C_BattleNet and C_BattleNet.GetAccountInfoByID) then return end
    if issecretvalue and issecretvalue(bnSenderID) then return end
    local account = C_BattleNet.GetAccountInfoByID(bnSenderID)
    local game = account and account.gameAccountInfo
    if not (game and usable(game.characterName) and game.clientProgram == "WoW") then return end
    if game.wowProjectID and game.wowProjectID ~= WOW_PROJECT_ID then return end
    if usable(game.realmName) then
        return game.characterName .. "-" .. game.realmName:gsub("[%s%-]", "")
    end
    return game.characterName
end

-- Returns nil when the invite was sent, or the reason it wasn't.
local function invite(name)
    if not IsInGuild() then return "you are not in a guild." end
    if CanGuildInvite and not CanGuildInvite() then return "your guild rank can't invite." end
    if C_GuildInfo and C_GuildInfo.Invite then
        C_GuildInfo.Invite(name)
    else
        GuildInvite(name)
    end
end

local function autoInvite(name, text)
    if not (db and db.enabled and usable(text)) then return end
    local keyword = clean(db.keyword)
    if keyword == "" or clean(text) ~= keyword then return end
    local now = GetTime()
    if lastAuto[name] and now - lastAuto[name] < REPEAT_SECONDS then return end
    lastAuto[name] = now
    local problem = invite(name)
    if problem then
        say(name .. " whispered the keyword, but " .. problem)
    else
        say(name .. " whispered the keyword. Guild invite sent.")
    end
end

local function status()
    if not db.enabled then return "auto invite is off." end
    if clean(db.keyword) == "" then return "auto invite is on, but no keyword is set, so nobody will be invited." end
    return 'auto invite is on. Anyone who whispers "' .. strtrim(db.keyword) .. '" gets a guild invite.'
end

local function setEnabled(on)
    db.enabled = on
    refreshPanel()
    say(status())
end

local function createOptions()
    local panel = CreateFrame("Frame")
    panel.name = TITLE

    local function label(text, y, template)
        local fs = panel:CreateFontString(nil, "ARTWORK", template or "GameFontHighlight")
        fs:SetPoint("TOPLEFT", panel, "TOPLEFT", 16, y)
        fs:SetWidth(560)
        fs:SetJustifyH("LEFT")
        fs:SetText(text)
        return fs
    end

    label(TITLE, -16, "GameFontNormalLarge")
    label("Whisper keyword", -56)

    local edit = CreateFrame("EditBox", nil, panel, "InputBoxTemplate")
    edit:SetSize(220, 24)
    edit:SetPoint("TOPLEFT", panel, "TOPLEFT", 22, -74)
    edit:SetAutoFocus(false)
    edit:SetMaxLetters(60)
    edit:SetScript("OnTextChanged", function(self, userInput)
        if userInput then db.keyword = self:GetText() end
    end)
    edit:SetScript("OnEnterPressed", edit.ClearFocus)
    edit:SetScript("OnEscapePressed", edit.ClearFocus)

    local check = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
    check:SetSize(26, 26)
    check:SetPoint("TOPLEFT", panel, "TOPLEFT", 14, -108)
    check:SetScript("OnClick", function(self)
        db.enabled = self:GetChecked() and true or false
    end)
    local checkLabel = label("Send a guild invite to anyone who whispers the keyword", -114)
    checkLabel:SetPoint("TOPLEFT", panel, "TOPLEFT", 46, -114)

    label("The whisper has to be the keyword and nothing else. Capitals don't matter.\n"
        .. "With the box unticked, nothing is sent until you type /ginv.", -150, "GameFontDisable")

    refreshPanel = function()
        edit:SetText(db.keyword)
        check:SetChecked(db.enabled)
    end
    panel:SetScript("OnShow", refreshPanel)
    refreshPanel()

    category = Settings.RegisterCanvasLayoutCategory(panel, panel.name)
    Settings.RegisterAddOnCategory(category)
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("CHAT_MSG_WHISPER")
frame:RegisterEvent("CHAT_MSG_BN_WHISPER")
frame:SetScript("OnEvent", function(_, event, text, sender, ...)
    if event == "ADDON_LOADED" then
        if text ~= ADDON then return end
        OlympusAutoInviteDB = OlympusAutoInviteDB or {}
        db = OlympusAutoInviteDB
        if type(db.keyword) ~= "string" then db.keyword = "" end
        db.enabled = db.enabled and true or false
        createOptions()
        return
    end
    local name
    if event == "CHAT_MSG_WHISPER" then
        name = usable(sender) and sender
    else
        name = bnetCharacter(select(11, ...)) -- 13th event argument: bnSenderID
    end
    if not name then return end
    lastWhisperer = name
    autoInvite(name, text)
end)

local function manualInvite(name)
    local problem = invite(name)
    say(problem or ("guild invite sent to " .. name .. "."))
end

SLASH_OLYMPUSAUTOINVITE1 = "/ginv"
SlashCmdList["OLYMPUSAUTOINVITE"] = function(msg)
    local arg = strtrim(msg or "")
    local word = arg:lower()
    if word == "?" then
        say(status())
        say(lastWhisperer and ("last whisper was from " .. lastWhisperer .. ".")
            or "nobody has whispered you this session.")
    elseif word == "on" or word == "off" then
        setEnabled(word == "on")
    elseif word == "options" or word == "config" then
        if category then Settings.OpenToCategory(category:GetID()) end
    elseif arg ~= "" then
        manualInvite(arg)
    elseif lastWhisperer then
        manualInvite(lastWhisperer)
    else
        say("nobody has whispered you this session. Use /ginv Name to invite someone directly.")
    end
end
