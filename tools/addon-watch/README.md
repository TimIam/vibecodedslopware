# Addon watch

Keeps the site's WoW addons current with the game clients, with nobody at the keyboard. It runs every six hours in
GitHub Actions (`.github/workflows/addon-watch.yml`) and releases on its own: Tim asked for it fully automatic
(2026-11-11).

Addons covered (`config.json`): The Endgame is Me and Party Health Pie, each for Classic Forever and retail.

## What one run does

1. **check**: asks Blizzard's version server (`us.patch.battle.net:1119/<product>/versions`, products `wowf` and
   `wow`) which build each client is on. `1.60.1` is Interface `16001`, `12.1.5` is `120105`. It also pulls Blizzard's
   generated API docs (Gethe/wow-ui-source, branches `forever` and `live`, folder
   `Interface/AddOns/Blizzard_APIDocumentationGenerated`), finds every function, widget method and event each addon's
   Lua names, and compares each doc entry with `state.json`. Doc prose is ignored; arguments, returns and secret
   rules are not.
2. **fix** (only when a doc entry the addon uses changed or vanished): Claude Code is given `fix-prompt.md` plus the
   list, and may edit the addon's hand-written Lua. It writes a line for players in `.work/fix-notes.md`.
3. **apply**: new Interface numbers into the TOCs (for The Endgame is Me, into `tools/build.mjs`, which writes the
   TOCs), and a patch version bump (1.1.1 -> 1.1.2) for each addon being released. If an addon still names something
   Blizzard removed, the run stops here.
4. **build**: Party Health Pie is zipped as it is. The Endgame is Me is rebuilt with `tools/build.mjs --zip`, against
   the browser game **as it was when the addon's game_*.lua last changed**, and the run fails if that changes any
   generated Lua. So a client update never also ships browser-game changes nobody has played in the client.
5. **test**: every Lua file compiles (`luac5.1 -p`), each TOC says the client's Interface and lists only files that
   exist, nothing the addon calls is missing from the new API docs, and The Endgame is Me plays a whole session
   against its strict WoW stub (`tools/test/smoke.lua`).
6. **site**: the zips go into the addon's page folder, the download buttons and sizes are updated, and a line goes on
   top of "What's new".
7. **commit**: the addon, then its page on its own (so the home page counts one version), then `state.json`, then
   `tools/versions.mjs` stamps; rebased and pushed to main, retried if main moved.
8. **deploy**: a production deploy of that commit on Vercel, then a check that the new zips are served.
9. **curseforge**: uploads to the Heal Pie project (1792480), Forever as Release, retail as Beta. CurseForge often
   lists a new game version hours after the patch, so uploads wait in `state.pendingCurseforge` and are tried every
   run; after three days of waiting the run fails so someone looks. The Endgame is Me is not on CurseForge.

Any failure opens (or comments on) a GitHub issue labelled `addon-watch`. `state.json` is only written by a run that
got as far as committing, so a failed run is simply tried again.

## Secrets (repository settings > Secrets and variables > Actions)

| Secret | Used for | Where to get it |
| --- | --- | --- |
| `VERCEL_TOKEN` | production deploy | vercel.com > Account Settings > Tokens, scoped to the "timiam's projects" team |
| (all three) | every run starts with `watch.mjs keys`, one read-only call per service, so a dead secret fails the run and opens an issue before a patch needs it | |
| `CURSEFORGE_TOKEN` | uploads to Heal Pie | authors.curseforge.com > Account > API Tokens |
| `ANTHROPIC_API_KEY` | the fix step (only runs when an API changed) | console.anthropic.com > API Keys |

Main must accept pushes from the workflow's `GITHUB_TOKEN` (no branch protection that blocks it).

## Trying it

Actions > Addon watch > Run workflow. `dry_run` (on by default for manual runs) builds and tests but does not push,
deploy or upload; the zips are attached to the run. `force_interface` (for example `forever=16002`) pretends a client
moved, to exercise a whole release.

Locally (Lua 5.1 needed for `test`; on this PC run it in WSL with `the-endgame-is-me-addon/tools/wsl.sh`):

    FORCE_INTERFACE=forever=16002 node tools/addon-watch/watch.mjs check
    node tools/addon-watch/watch.mjs apply && node tools/addon-watch/watch.mjs build
    node tools/addon-watch/watch.mjs test && node tools/addon-watch/watch.mjs site
    NO_PUSH=1 node tools/addon-watch/watch.mjs commit      # commits locally only

`baseline` rewrites `state.json` from what is shipped today; run it only to start over.

## What it does not do

- It never runs the real WoW client. A release is only as good as the stub, the API cross-check and the fixer's
  judgment. Things found only by playing (clipping, the texture limit, the Hoard slots) would get through.
- It does not bring browser-game changes into The Endgame is Me addon, and it builds Party Health Pie from what was
  released (1.1.0), not from the unreleased edits in the main checkout's `party-health-pie/PartyHealthPie`.
- Interface numbers come from the live builds, so a PTR or beta is ignored until it goes live.
