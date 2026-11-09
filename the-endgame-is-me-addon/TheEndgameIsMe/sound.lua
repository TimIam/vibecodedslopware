-- The Endgame is Me: sound. The browser game synthesises everything with Web Audio, which an addon cannot do, so the
-- build renders the game's own effects and music to OGG files (tools/bake-audio.mjs) and this plays them.
-- Music is a loop per level in two mixes, calm and fighting; WoW cannot layer stems in time, so the mix changes by
-- cross-fading to the other file.

local ADDON, ns = ...
local RT = ns.RT
local DIR = "Interface\\AddOns\\" .. ADDON .. "\\Sounds\\"

local S = { stage = 0, combat = false, handle = nil, playing = nil, token = 0 }
ns.Sound = S
local M = ns.SoundManifest or { sfx = {}, music = {} }   -- written by the build: which files exist, and how long the loops are

local lastAt = {}
local function clockNow() return _G.GetTime and _G.GetTime() or 0 end

function S.init() end

-- one of the game's event names (the same strings main.js hands to audio.play)
function S.play(name)
  if not ns.DB or ns.DB.mute or not M.sfx[name] then return end
  local t = clockNow()
  if lastAt[name] and t - lastAt[name] < 0.05 then return end   -- a raid dying all at once is one crunch, not forty
  lastAt[name] = t
  _G.PlaySoundFile(DIR .. name .. ".ogg", "SFX")
end

local function stop(fade)
  S.token = S.token + 1
  if S.handle and _G.StopSound then _G.StopSound(S.handle, fade or 600) end
  S.handle, S.playing = nil, nil
end

local function loop(file, seconds)
  local token = S.token
  local ok, handle = _G.PlaySoundFile(DIR .. file .. ".ogg", "Music")
  S.handle = ok and handle or nil
  if not ok or not _G.C_Timer then return end
  -- come back just before the file runs out and start it again
  _G.C_Timer.After(math.max(1, seconds - 0.05), function()
    if S.token == token and S.playing == file then loop(file, seconds) end
  end)
end

local function refresh()
  local want = nil
  if ns.DB and not ns.DB.mute and ns.DB.music ~= false and S.stage > 0 then
    local track = M.music[S.stage]
    if track then want = track.id .. (S.combat and "_fight" or "_calm") end
  end
  if want == S.playing then return end
  stop(700)
  if want then
    S.playing = want
    loop(want, M.music[S.stage].seconds)
  end
end

-- 0 is silence (the window is shut or on the menu); 1 to 7 is the level
function S.setStage(n) S.stage = n or 0; refresh() end
function S.setCombat(on)
  on = on and true or false
  if on == S.combat then return end
  S.combat = on
  refresh()
end
function S.toggle()
  ns.DB.mute = not ns.DB.mute
  refresh()
  return ns.DB.mute
end
