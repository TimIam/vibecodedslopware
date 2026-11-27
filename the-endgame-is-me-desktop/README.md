# The Endgame is Me: desktop builds for Steam

The browser game (`../the-endgame-is-me/`) in an Electron window, for Windows, macOS (one universal app for Intel and
Apple Silicon) and Linux. Nothing of the game is copied by hand: `stage.mjs` copies it into `app/game/` at build time
and swaps the website's bits for offline ones (the Silkscreen font from @fontsource, the studio splash from the repo
root, no site bar, the page using the whole window). It fails loudly if the game page changes under it.

What the desktop build adds: fullscreen by default (F11 or Alt+Enter toggles, remembered), a Quit item on the title
menu (shown only when `window.slopDesktop` exists, so the website never shows it), sound without a "click to start"
gate, links opening in the player's browser, one instance at a time. Saves are the same localStorage as the website,
kept in the app's user data folder (`%APPDATA%\The Endgame is Me`, `~/Library/Application Support/The Endgame is Me`,
`~/.config/The Endgame is Me`).

## Controls (v17)

The game itself (`../the-endgame-is-me/js/controls.js` and `js/nav.js`) handles keyboard and controller, so the
desktop build needs nothing extra. The title menu has a **Controls** panel (next to **Phenotype**, the old Settings)
with a Keyboard / Controller toggle and remappable slots, saved in localStorage under `bosshours.controls`.

| Action | Keyboard | Controller |
| --- | --- | --- |
| Walk | WASD / arrows | Left stick or d-pad: orthogonal movement |
| Turn and walk | | Right stick: tank turn, forward/back |
| Slot 1 (swipe) | J | L3 |
| Slot 2 (stomp) | K | R3 |
| Slots 3, 4, 5 | Q, E, R | RB, LB, RT |
| Roar | Space | A |
| Pause | Esc | Start |
| Fullscreen | F11 / Alt+Enter | Select |

Moving with several inputs at once never adds up: the walk vector is clamped to length 1. Every menu works by arrow keys
or controller with a square cursor; select with A, or Space, Enter or Tab. On a Steam Deck the game reads the built-in
controls as a standard gamepad (use Steam's "Gamepad" layout, not a keyboard one), and the page has Deck-sized CSS.

## Building

    npm ci
    npm start               # run it from source
    npm run build:win       # dist/win-unpacked/TheEndgameIsMe.exe
    npm run build:linux     # dist/linux-unpacked/TheEndgameIsMe (builds on Windows too)
    npm run build:mac       # dist/mac-universal/TheEndgameIsMe.app (macOS only)

CI does all three on every push that touches the game (`.github/workflows/endgame-desktop.yml`); each comes out as a
zip artifact of the run. The Mac app is ad-hoc signed there.

## Shipping on Steam

One-off, in Steamworks (partner.steamgames.com), after paying the Steam Direct fee for the app:
1. Note the app id, and make three depots (Windows, macOS, Linux + SteamOS), each with its operating system set.
   Put the ids in `steam/config.json`.
2. Installation > General Installation > Launch Options, one per OS:
   - Windows: executable `TheEndgameIsMe.exe`
   - macOS: executable `TheEndgameIsMe.app`
   - Linux: executable `TheEndgameIsMe`
3. Publish the app config.

Each release: let CI build, then either upload from WSL (not Git Bash: the Mac app's symlinks would be lost)

    gh run list -w "Endgame desktop builds" -R TimIam/vibecodedslopware
    bash steam/upload.sh <run-id> <your-steamworks-login>

where steamcmd asks for the password and Steam Guard code itself, or (as done so far) upload the run's three zips in
Steamworks > SteamPipe > Web Uploads, one per depot. Either way the build then shows in SteamPipe > Builds, where you
set it live on the default branch (Steam asks for approval in the mobile app).

## Other stores

- itch.io (`vibecodedslopware/the-endgame-is-me`): `butler push` the CI zips to the `windows`, `mac` and `linux`
  channels and a zip of `app/game/` to `html5`, with `--userversion <game version>`.
- Epic Games Store: upload the Windows zip's contents with BuildPatchTool to the product's artifact, then make the new
  binary active for Windows in the Developer Portal. macOS waits on notarization.

Released: v17 (Phenotype menu, remappable keyboard and controller controls, controller menus) on 2026-11-22 to Steam
(build 26855100), itch.io and Epic (17-win-1).

## Known gaps

- Windows: signed in CI by Azure Artifact (Trusted) Signing over GitHub OIDC (see the workflow). The Azure federated
  credentials must match GitHub's subject format,
  `repo:TimIam@92952477/vibecodedslopware@1387589836:ref:refs/heads/<branch>`, or the sign-in step fails.
- macOS: ad-hoc signed only. Fine when Steam installs it; a Developer ID signature and notarization would let it run
  anywhere and are needed if it is ever sold outside Steam.
- Steam achievements through steamworks.js (app/main.cjs), only when Steam launched the game (SteamGameId/SteamAppId
  in the environment, or `--steam`), so the same build on Epic or itch never touches Steam. The overlay is switched on
  too (steamworks.js electronEnableSteamOverlay). The list lives in the game (the-endgame-is-me/js/achievements.js);
  steam/achievements/ has the icon drawings (icons.html, kit.js, icons-a.js, icons-b.js), save.mjs to write the PNGs,
  and make-csv.mjs for Steamworks' bulk import. No Steam Cloud saves yet.
- Controller support is tested with simulated gamepads only, not yet on a real controller or Steam Deck.
- The app's own version (`package.json`) is still 1.0.0; the game version is the site's stamp (17).
