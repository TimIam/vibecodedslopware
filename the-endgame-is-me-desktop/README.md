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

## Building

    npm ci
    npm start               # run it from source
    npm run build:win       # dist/win-unpacked/TheEndgameIsMe.exe
    npm run build:linux     # dist/linux-unpacked/TheEndgameIsMe (builds on Windows too)
    npm run build:mac       # dist/mac-universal/The Endgame is Me.app (macOS only)

CI does all three on every push that touches the game (`.github/workflows/endgame-desktop.yml`); each comes out as a
zip artifact of the run. The Mac app is ad-hoc signed there.

## Shipping on Steam

One-off, in Steamworks (partner.steamgames.com), after paying the Steam Direct fee for the app:
1. Note the app id, and make three depots (Windows, macOS, Linux + SteamOS), each with its operating system set.
   Put the ids in `steam/config.json`.
2. Installation > General Installation > Launch Options, one per OS:
   - Windows: executable `TheEndgameIsMe.exe`
   - macOS: executable `The Endgame is Me.app`
   - Linux: executable `TheEndgameIsMe`
3. Publish the app config.

Each release: let CI build, then from WSL (not Git Bash: the Mac app's symlinks would be lost)

    gh run list -w "Endgame desktop builds" -R TimIam/vibecodedslopware
    bash steam/upload.sh <run-id> <your-steamworks-login>

steamcmd asks for the password and Steam Guard code itself. The build then shows in Steamworks > SteamPipe > Builds,
where you set it live (or put a branch such as `beta` in config.json to set that branch live on upload).

## Known gaps

- Windows: the .exe is not code-signed. Windows' Smart App Control refuses unsigned programs outright (it blocks this
  build on Tim's PC), and SmartScreen may warn. Signing it (Azure Trusted Signing, or an OV certificate) fixes both.
- macOS: ad-hoc signed only. Fine when Steam installs it; a Developer ID signature and notarization would let it run
  anywhere and are needed if it is ever sold outside Steam.
- No Steamworks SDK yet: no achievements, no Steam Cloud saves, and the Steam overlay does not draw over Electron.
- Keyboard and mouse only. On a Steam Deck it needs a Steam Input layout (or controller support in the game).
