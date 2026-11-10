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

The first time the window opens in a client it runs a display test: the picture is 57,600 textures, and how many the
client's renderer will draw at once depends on how they are grouped. The test shows a card each way, asks which one
is visible, and remembers the answer (`/endgame probe` runs it again). See `Display.setMode` in `src/display.lua`.

## Tests

These need a Lua 5.1 interpreter (`lua5.1`, `luac5.1`); none of them needs the game client.

| What | Command (from this folder) | Checks |
| --- | --- | --- |
| Same game? | `bash tools/test/exact.sh` | Plays every level with scripted input in the JS and in the Lua (on Fengari, so both use the same maths library) and compares the state line by line. |
| Does the addon run? | `lua5.1 tools/test/smoke.lua TheEndgameIsMe` | Loads the built folder against a strict stub of the WoW API (`wowstub.lua`) and plays a whole session: menus, a run, save and reload, every level, the Hoard, winning, dying. Also checks the texture grid shows exactly the frame the game drew. |
| Pictures and timings | `lua5.1 tools/test/shot.lua <seed> <level> <steps> out.ppm` | Renders through the real renderer; `ppm2png.mjs` converts. Prints ms per step and per frame. |
| Every look | `lua5.1 tools/test/looks.lua` | Paints the boss in every option of every part. |
| Where time goes | `lua5.1 tools/test/profile.lua <level> <steps>` | Per-function frame cost. |

`tools/wsl.sh` runs a command in WSL with an unpacked `lua5.1` on the path, for Windows machines without one.

## What differs from the browser game

- No studio splash, animated title or attract-mode fights; the menu is a plain panel.
- The Hoard has no demo reel, and no icons: abilities are a list with a description.
- Fur colour is a row of swatches, not the colour triangle. No music picker or volume sliders (WoW has its own).
- Smoke is dithered instead of blended, and the ending has no warm wash, both to save frame time.
- Music is two mixes per level (calm, fighting) that cross-fade; changing mix restarts the loop.
- The screen shake moves the whole picture, HUD included.
