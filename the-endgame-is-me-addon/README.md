# The Endgame is Me, as a WoW addon

The browser game in `../the-endgame-is-me/` running inside World of Warcraft, in a movable window. Type `/endgame`.

Two builds, same Lua, different TOC:

| Client | Folder | Interface |
| --- | --- | --- |
| WoW Classic Forever | `TheEndgameIsMe/` (here) | 16001 |
| Retail | `../the-endgame-is-me-addon-retail/TheEndgameIsMe/` | 120105 |

Both folders are build output. Do not edit them; edit `src/` or the game, then rebuild.

## How it works

An addon has no canvas and no Web Audio, only Lua, frames and textures. So:

- **The game's own code is translated, not rewritten.** `tools/js2lua.mjs` is a small JavaScript to Lua 5.1 transpiler,
  sized for this game's modules (plain ES modules, no classes, no `this`). `tools/build.mjs` runs it over `world.js`,
  `props.js`, `smoke.js`, the seven levels, `art.js`, `render.js` and `save.js`, which become the `game_*.lua` files.
  Rules, balance, barks and pixel art are therefore the browser game's, and a new version of the game is a rebuild.
  The handful of places where the source is changed first are listed, with reasons, in `PATCHES` and `OVERRIDES` at the
  top of `build.mjs`.
- **`src/rt.lua`** is the JavaScript the translated code leans on: zero-based arrays with a `length`, `Set`, `Map`,
  string and array methods, 32-bit integer maths for the dice.
- **`src/canvas.lua`** is the slice of the 2D canvas the drawing code uses. Sprites are tables of pixels. The screen is
  320×180 colours plus a record of which changed.
- **`src/display.lua`** shows that on 57,600 one-pixel textures, snapped to whole screen pixels. The grid is addressed
  as a torus and slides under a clipping frame, so a scrolling level repaints one row or column per step, not the screen.
- **`src/app.lua`** is what `main.js` and the page's HTML did: input, the fixed 60 Hz step, menus, the Hoard, the
  ending, the slash command. **`src/saves.lua`** keeps the run, best score, look and New Game+ in `TheEndgameIsMeDB`.
- **`src/keys.lua`** is which key or mouse button does what. The defaults are the browser game's; the Controls panel
  (on the menu and the pause menu, or `/endgame keys`) changes them, two places per action, kept in
  `TheEndgameIsMeDB.keys`. Esc is not bindable: it always pauses, so there is always a way to get the keyboard back.
  The HUD's letters under the ability buttons come from here too (`keyLabel`, a patch to `render.js` in `build.mjs`).
- **Sound** is the game's own, rendered to OGG by `tools/bake-audio.mjs` (headless Chrome runs `audio.js` and
  `music.js` against offline audio contexts; ffmpeg encodes). The files live in `sounds/` and are copied into each build.

Anything slow (painting a level's ground, the boss's 256 sprites) runs in a coroutine a few milliseconds a frame, so
the client never freezes; see `RT.breathe` and the loader in `app.lua`.

## Building

```bash
cd the-endgame-is-me-addon/tools
npm install                 # acorn (parser); fengari and playwright-core are only for tests and the audio bake
node build.mjs              # transpile, and write both addon folders
node build.mjs --zip        # the same, plus dist/TheEndgameIsMe-<version>.zip and dist/TheEndgameIsMe-Retail-<version>.zip
node build.mjs --check      # transpile only, into ../build
node bake-audio.mjs         # only when the game's sounds change: needs Chrome and ffmpeg (PATH or WSL)
```

To install, copy `TheEndgameIsMe/` into the client's `Interface\AddOns` (or unzip the matching file from `dist/` there).
The folder name is the same for both clients, so each client's AddOns folder gets its own copy.

A client only finds new files when it starts. After an update that adds a Lua file (1.1.0 added `keys.lua`), a
`/reload` loads everything except the new file; `app.lua` notices and tells the player to restart the game.

The first time the window opens in a client it runs a display test: the picture is 57,600 textures, and how many the
client's renderer will draw at once depends on how they are grouped. The test shows a card each way, asks which one
is visible, and remembers the answer (`/endgame probe` runs it again). See `Display.setMode` in `src/display.lua`.

## Publishing a release

The public page is `../the-endgame-is-me-wow/` (vibecodedslopware.com/the-endgame-is-me-wow/): `index.html`, two
pictures and the two zips. This folder and the retail one are in `.vercelignore`, so only the page folder is served.

1. Bump `VERSION` in `tools/build.mjs`, run `node tools/build.mjs --zip` and the tests, and commit that.
   (The build takes the game from `GAME_COMMIT`, so it does not matter what the working tree's game is.)
2. Copy both zips from `dist/` into `../the-endgame-is-me-wow/` (old ones stay: older versions of the page link to
   them), and update the version, size and status note in its `index.html`.
3. Commit the page folder **on its own**. `tools/versions.mjs` treats each commit that touches it as a version of the
   card on the home page, and ignores commits that touch three or more project folders at once.
4. Run `node ../tools/versions.mjs` and commit what it writes.

The pictures come from `tools/test/shot.lua` with kit `-1` (see `tools/test/previews.sh`), through `ppm2png.mjs`.

## Tests

These need a Lua 5.1 interpreter (`lua5.1`, `luac5.1`); none of them needs the game client.

| What | Command (from this folder) | Checks |
| --- | --- | --- |
| Same game? | `bash tools/test/exact.sh` | Plays every level with scripted input in the JS and in the Lua (on Fengari, so both use the same maths library) and compares the state line by line. |
| Does the addon run? | `lua5.1 tools/test/smoke.lua TheEndgameIsMe` | Loads the built folder against a strict stub of the WoW API (`wowstub.lua`) and plays a whole session: menus, a run, save and reload, every level, the Hoard, winning, dying. Also checks the texture grid shows exactly the frame the game drew. |
| Pictures and timings | `lua5.1 tools/test/shot.lua <seed> <level> <steps> out.ppm` | Renders through the real renderer; `ppm2png.mjs` converts. Prints ms per step and per frame. |
| Every look | `lua5.1 tools/test/looks.lua` | Paints the boss in every option of every part. |
| What a panel looks like | `lua5.1 tools/test/panels.lua`, then `node tools/test/panels.mjs` | Opens the menus in the stub and draws what it recorded as PNGs in `build/` (a browser's font, so a check for overlaps, not for looks). |
| Where time goes | `lua5.1 tools/test/profile.lua <level> <steps>` | Per-function frame cost. `prims.lua` splits it by drawing call (fills, sprites) and who asked for it. |
| What each level costs | `lua5.1 tools/test/levelcost.lua walk` | Every level in one run: ms for rules and drawing, cells recoloured, garbage per frame, memory held. `cold <level>` starts at one level, to show nothing piles up. `garbage.lua <level>` charges the garbage to source lines. |
| Did a speed-up change the picture? | `lua5.1 tools/test/framehash.lua > build/before.txt`, change, run again, `diff` | A checksum of the screen every few frames on every level, with a bot that casts everything. |
| Water | `lua5.1 tools/test/water.lua` | The addon's water (a retained layer plus glints) against the game's own loop, before and after rubble is tipped in: no pixel may differ. |

Speed-ups live in `src/gfx.lua` and `src/canvas.lua` (hand-written loops, the water layer, cached blends) and in the
build's patches and overrides. The rule for all of them: same pixels, same game state. Prove it with `framehash.lua`
and `exact.sh` before keeping one. The client collects garbage in step with what is thrown away, so churn is frame
time there even where stock Lua does not show it.

`tools/wsl.sh` runs a command in WSL with an unpacked `lua5.1` on the path, for Windows machines without one.

## Ground images

Each level's ground is painted once, at build time, and ships as an image (`art/ground_N.tga`, copied to `Art/` in
the built folders). The client draws it as one texture under the grid; the grid shows only the cells with something
on them, and a see-through cell (a shadow, the HUD's panel) carries its alpha for the client to blend. Levels load
in a few frames instead of seconds, and half to two thirds of the 57,600 textures are hidden at any moment.

- **`lua5.1 tools/bake-art.lua`** (after a build, then build again) makes the images, `art/ground.json`,
  `art/props.json` and `art/units.json` (`bake-art.lua units` makes only the units sheet, in a second). Run it whenever the game's art or level layouts change. The files are 32-bit uncompressed TGA
  padded to powers of two. It takes a few minutes.
- **A baked level is always laid out the same way.** A ground depends on where the level put its roads and fields,
  so the level is built from the seed its image was made with (`SEEDS` in the bake tool, `ns.Ground` in the
  addon, the `layoutRng` patches to `world.js` in the build). The run's own random numbers still decide
  everything that happens after that. A save from before this has no such layout and is painted the old way.
- **`/endgame ground off`** paints the ground in Lua as before (same layouts), in case a client will not show the
  image. `RT.fixedLayouts` is off under `exact.sh`, which compares with the browser game.
- **`lua5.1 tools/test/ground.lua`** plays every level both ways and compares the two pictures: the one the
  client would make (the ground file's pixels, the prop textures asked for from the sheet file, then the cells) and
  the one painted the old way.

## Prop images

A tree or a cottage nobody has touched looks the same every frame, and a baked level has the same ones in the same
places every run. The bake tool paints each standing prop once into a sheet per level (`art/props_N.tga`) and the
client draws it as a texture between the ground image and the grid (`D.setProps`, one texture per prop, made once
per level and only shown or hidden after that).

- **A prop is a texture only while** it is as it was made (standing, full health, not burning, not moved) **and**
  nothing has been drawn on the cells under it yet this frame (`Screen.clear`, a coarse map of where things are).
  The frame is drawn back to front, so anything already there belongs behind the prop, which a texture under the
  grid could not cover; then the level's own art paints the prop into the grid as before. Anything drawn later is
  in front, and the grid is on top anyway. The two ways look the same, so the switch does not show.
- **Which props are baked** is decided by painting each at two dozen moments with the camera in different places:
  one that ever differs (a lamp that flickers, a flag) is left to the grid. So is one too big for the screen.
- **Who is in front** among the textures is the draw layer: the tool gives each prop a layer one above the deepest
  thing it overlaps, up to 48 (three layers of sixteen sublevels). Props piled deeper than that stay in the grid.
- `RT.propImages = false` (in `src/gfx.lua`) turns it off; `/endgame ground off` turns both off.

- **A sprite's name must say everything its picture depends on.** The level art keeps the sprites it paints by
  name. The city's buildings left their seed out of the name, so every building of one size showed whichever was
  painted first, which depends on where the camera has been, and a sheet cannot match that. The build adds the
  seed to the name (`levels/city` in `PATCHES`), and the bake tool paints every prop a second time in the opposite
  order from an empty cache: one that comes out differently is left to the grid and reported, so the name can be
  fixed.

## Which game the addon is made from

`GAME_COMMIT` holds the commit whose `the-endgame-is-me/js` the addon is transpiled from; `tools/build.mjs` reads the
files from that commit with `git show`, whatever the working tree holds. The browser game has moved on since (new
final powers, the keep tower, necromancers that raise the dead), and none of that is in the addon until someone puts
a newer commit in `GAME_COMMIT` and fixes what the build and the tests then say.

Rule changes the web version has made since, which the addon takes on their own, are `RULE_PATCHES` in
`tools/build.mjs`. `tools/test/refgame.mjs` writes the same game with the same patches to `build/ref-game` for the
reference run, so `exact.sh` still compares like with like. `NO_RULE_PATCHES=1 node tools/build.mjs` builds without
them: use it with `framehash.lua` to show that a speed-up alone leaves every frame as it was.

- **Crushing pays in full** (web version, 2026-11-11): a tree, crop or building knocked down pays its whole value,
  where it paid half and the rest only for burning it. A loadout with no fire can finish levels 2 and 4.

## The rules, by hand

Three routines of the rules are replaced with hand-written Lua by the build (`OVERRIDES` in `tools/build.mjs`),
because in the castle, with over a hundred adventurers, they were most of a step: `separate` (every pair of
adventurers; the living are listed once and a pair too far apart in x is dropped at once), `solidPush` and `slowAt`
(the props near each adventurer; they walk the grid's cells themselves, with no list and no table per prop). A
castle step went from 1.9 ms to 1.05 ms and the garbage from 576 KB to 256 KB a frame. Same arithmetic in the same
order: `exact.sh` is the proof.

## Ice floors and lanes

An ice floor is a disc as wide as the ability reaches, and `drawIce` worked every pixel of it out again each frame
(a square root, a hash, an arctangent and a sine apiece, for up to three floors): 14 ms of an 18 ms frame in stock
Lua, and 120 ms in the client. `iceFloor` in `src/gfx.lua` works a floor out once and draws it from lists; with
light effects on it fades in six steps. `teleLane` (the strip before a charge or a beam) walks only the part of the
screen the lane covers, not the whole square around the boss. Both give the same picture (`framehash.lua`).

`Screen.points` (`src/canvas.lua`) draws a list of single pixels in one colour without a `fillRect` call apiece; ice
floors and fires go through it, sorted by colour. A disc's geometry (distance and angle of each pixel) is kept per
radius, so a second floor of the same size only pays for its hashes. And the trail canvas's list of changed
rectangles no longer gives up after 96 (a shower of ash did that, and the Screen then worked out the whole
picture's ground again, a 13 ms frame): the last entry grows to hold the rest.

## Sprites: the units and the boss

Over a ground image the things that move are textures under the grid too (`Screen.sprite`, `Screen.padSprite` in
`src/canvas.lua`; `syncSprites`, `syncPad` in `src/display.lua`). `/endgame sprites off` paints them as before.

- **Adventurers and the boss's adds** are one texture each, cut from `art/units.tga`. What `drawUnit` paints depends
  on a handful of things (class, facing, which foot is forward, hit or not, and one more by role: a sword
  mid-swing, a glowing staff, a healer's sparkle, the king's glint), 256 pictures in all with the adds. The bake
  tool makes a unit in each state and has the game's own `drawUnit` / `drawAdd` paint it; `src/sprites.lua`
  works out the same number for a live unit (`unitKey`, `addKey`) and stands in front of those two functions. The
  shadow, the health bar, the Z of someone away from their keys and the spark of standing in fire are still
  painted, by the same arithmetic as `render.js`. Riders, horses and the animals a level draws itself are painted
  as before. If `drawUnit` or `drawAdd` changes in the game, `sprites.lua` has to follow; `ground.lua` is the
  test that says whether it did.
- **The boss** cannot ship as a picture: its look is the player's choice out of 30,000 and any colour. It gets a
  block of one-pixel textures of its own (a "pad", 56 by 56, in its own frame) that hangs from an anchor, so moving
  the boss is one call. Each picture of it (a heading, a step, the mouth) is put on a block the first time it is
  wanted, and twelve blocks are kept. Painted in the grid a walking boss was about a thousand cells a frame.
- **Order.** The grid lies over every texture, and the frame is drawn back to front, so a sprite empties the cells
  under its solid pixels ("punches"): that is what painting it would have overwritten, and whatever is drawn later
  lands in the grid, on top. Among the textures: props, then the units drawn before the boss, the boss, the units
  drawn after it, and inside each of those two frames a draw layer one above whatever the sprite overlaps (64 of
  them; a sprite that would need a 65th is painted). A prop drawn after a sprite that overlaps it is painted, not
  shown as a texture, because the Screen's map of where things are (`Screen.clear`) counts sprites too.
- **Only solid pixels are on the sheet.** A see-through pixel under the grid would be blended in the wrong order
  with what was drawn before it, so shadows stay in the grid. While the boss flickers (evading) it is painted.
- `lua5.1 tools/test/spritecost.lua` plays every level both ways and prints what each costs.

## The HUD's layer

The HUD stays put on the screen while the grid's cells belong to the ground, so every pixel the camera moved, each
edge of each letter landed on different cells and had to be recoloured: a third of all the recolouring in a quiet
frame. Over a ground image the HUD and the cursor are drawn on a layer of their own (`Screen.hudBegin` /
`hudEnd` in `src/canvas.lua`, which point the Screen's drawing at the layer's tables; `setHud` in
`src/display.lua`), shown by textures fixed to the picture and made the first time a cell of it is lit. A HUD that
says what it said last frame costs nothing. It also holds still when the ground shakes, as it does in the browser.

There are two such layers: the HUD, and the cursor over it. Drawing the HUD was over a third of a frame's Lua, so
the renderer asks `Screen.hudDue()` first and, with `Screen.hudEvery = 3` (set in `src/app.lua`; 1 under the
tests), draws it on one frame in three; its layer stays as it is on the others. The cursor is drawn every frame.

## Panes

The dark see-through panel behind the HUD was 7,500 blended cells a frame, 13% of the grid, all of them showing. On
the HUD's layer it is one flat texture between the grid and that layer (`ctx.pane` in `src/canvas.lua`,
`Screen.panes`, `syncPanes` in `src/display.lua`), and the client blends it over whatever the grid shows. Painted
grounds still get it the old way.

## What differs from the browser game

- **No footprints.** The boss does not wear dark marks into the path; the build takes that code out.
- **Levels 1 to 7 are the same place every run** (see Ground images).
- **Every city building has its own roof and front.** In the browser, buildings of one size all show the details of
  whichever was drawn first (see Prop images).
- **The HUD is redrawn 20 times a second**, not 60, over a ground image (see The HUD's layer).
- **The HUD does not shake** with the ground over a ground image (it does not in the browser either; painted
  grounds still shake it).

- **Light effects.** When the addon's own share of a frame passes 14 ms for two seconds running, the rest of that
  level is drawn with less: the attack telegraph's fill stops blinking, fires flicker five times a second instead of
  ten, and the HUD loses its see-through panel. `/endgame effects full`, `light` or `auto` (the default).
- **Smoke** is dithered, and the dither pattern is tied to the ground rather than the screen, so a cloud does not
  shimmer (and cost a recolour per cell) every time the camera moves.

- No studio splash, animated title or attract-mode fights; the menu is a plain panel.
- The Hoard has no demo reel, and no icons: abilities are a list with a description. Where the browser game has a
  drop-down on each slot, clicking a slot puts up a list of what is owned (`pick` in `build.store`). Either way only
  that slot changes, and a pick that was on another button trades places with it. Do not go back to stepping through
  the abilities on each click: every step is a trade, so by the time the wanted one comes up the other buttons have
  been shuffled (that was 1.0.0's Hoard).
- Fur colour is a row of swatches, not the colour triangle. No music picker or volume sliders (WoW has its own).
- Smoke is dithered instead of blended, and the ending has no warm wash, both to save frame time.
- Music is two mixes per level (calm, fighting) that cross-fade; changing mix restarts the loop.
- The screen shake moves the whole picture, HUD included.
- The keys can be changed (Controls). The browser game's spare key for ability 2, F, is not bound to start with: each
  action has two places, and ability 2's are right click and K. The mouse wheel and combinations (Shift+1) cannot be
  bound; Shift, Ctrl and Alt count as keys of their own.
