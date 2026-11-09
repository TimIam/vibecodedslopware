-- Paints the boss in every option of every body part (and a picked fur colour), and every rock marker, to shake out
-- anything in the sprite code that only one look reaches.   lua5.1 tools/test/looks.lua
local ns = dofile("tools/test/host.lua")
ns.loadAll()
local RT = ns.RT
local World, Render = RT.modules.world, RT.modules.render
local parts = { "head", "horns", "neck", "back", "tail", "limbs", "legs" }
local n = 0
for _, part in ipairs(parts) do
  for opt = 0, World.LOOKS[part].length - 1 do
    local look = { head = 0, horns = 0, neck = 0, back = 0, tail = 0, limbs = 0, legs = 0, marker = 0, fur = (opt % 2 == 1) and "#3a6a9a" or nil }
    look[part] = opt
    for _, dir in ipairs({ 0, 5, 13, 22 }) do
      for _, idx in ipairs({ 0, 2, 5 }) do
        local spr = Render.bossPreview(look, dir, idx)
        local filled = 0
        for _ in pairs(spr.px) do filled = filled + 1 end
        assert(filled > 300, part .. " " .. opt .. " painted an empty sprite")
        n = n + 1
      end
    end
  end
end
for style = 0, World.LOOKS.marker.length - 1 do
  for _, t in ipairs({ 0.1, 1.3, 2.7, 4.2 }) do assert(Render.markerPreview(style, t).px, "marker " .. style) end
end
print("OK: " .. n .. " boss sprites across every look, and every marker")
