-- Olympus Auto Invite: /ginv invites the last person who whispered you to your guild.
--   /ginv          invite the last whisperer
--   /ginv Name     invite Name instead
--   /ginv ?        show who /ginv would invite

local PREFIX = "|cff40ff40Olympus Auto Invite:|r "
local lastWhisperer

local function say(msg)
    DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. msg)
end

local function usable(value)
    return type(value) == "string" and value ~= ""
end

-- A Battle.net whisper carries no character name, so look up the character
-- the friend is currently playing.
local function bnetCharacter(bnSenderID)
    if not (bnSenderID and C_BattleNet and C_BattleNet.GetAccountInfoByID) then return end
    local account = C_BattleNet.GetAccountInfoByID(bnSenderID)
    local game = account and account.gameAccountInfo
    if not (game and game.clientProgram == "WoW" and usable(game.characterName)) then return end
    if game.wowProjectID and game.wowProjectID ~= WOW_PROJECT_ID then return end
    if usable(game.realmName) then
        return game.characterName .. "-" .. game.realmName:gsub("[%s%-]", "")
    end
    return game.characterName
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("CHAT_MSG_WHISPER")
frame:RegisterEvent("CHAT_MSG_BN_WHISPER")
frame:SetScript("OnEvent", function(_, event, _, sender, ...)
    if event == "CHAT_MSG_WHISPER" then
        if usable(sender) then lastWhisperer = sender end
    else
        local name = bnetCharacter(select(11, ...)) -- 13th event argument: bnSenderID
        if name then lastWhisperer = name end
    end
end)

local function invite(name)
    if not IsInGuild() then
        say("you are not in a guild.")
        return
    end
    if CanGuildInvite and not CanGuildInvite() then
        say("your guild rank can't invite.")
        return
    end
    GuildInvite(name)
    say("guild invite sent to " .. name .. ".")
end

SLASH_GINV1 = "/ginv"
SlashCmdList["GINV"] = function(msg)
    local arg = strtrim(msg or "")
    if arg == "?" then
        say(lastWhisperer and ("last whisper was from " .. lastWhisperer .. ".")
            or "nobody has whispered you this session.")
    elseif arg ~= "" then
        invite(arg)
    elseif lastWhisperer then
        invite(lastWhisperer)
    else
        say("nobody has whispered you this session. Use /ginv Name to invite someone directly.")
    end
end
