#!/usr/bin/env bash
# Uploads the three desktop builds to Steam with SteamPipe. Run it in Linux (WSL on Windows), never in Git Bash:
# the Mac app is full of symlinks, and only a Linux or Mac file system keeps them on the way to Steam.
#
#   bash steam/upload.sh <run-id> <steam-login>
#
#   run-id       the GitHub Actions run of "Endgame desktop builds" to ship (gh run list -w "Endgame desktop builds")
#   steam-login  a Steamworks account with "Edit App Metadata" and "Publish App Changes To Steam" on the app.
#                steamcmd asks for its password and Steam Guard code itself; nothing here stores them.
#
# steam/config.json holds the app id and the three depot ids from Steamworks. "branch" empty = upload only (you set
# the build live yourself in Steamworks > SteamPipe > Builds); a branch name such as "beta" sets it live there.
set -euo pipefail
cd "$(dirname "$0")"
RUN="${1:?run id}"; LOGIN="${2:?steam login}"
APP=$(node -p "require('./config.json').appId"); [ "$APP" != 0 ] || { echo "Put the app id and depot ids in steam/config.json first."; exit 1; }
DW=$(node -p "require('./config.json').depots.windows"); DM=$(node -p "require('./config.json').depots.mac"); DL=$(node -p "require('./config.json').depots.linux")
BRANCH=$(node -p "require('./config.json').branch"); DESC="$(node -p "require('./config.json').description") ($(date +%F), run $RUN)"

rm -rf work && mkdir -p work/zips work/content/{windows,mac,linux} work/output
gh run download "$RUN" -R TimIam/vibecodedslopware -D work/zips
for os in windows mac linux; do unzip -q "work/zips/endgame-$os/endgame-$os.zip" -d "work/content/$os"; done
chmod +x work/content/linux/TheEndgameIsMe

depot() { cat > "work/depot_$1.vdf" <<V
"DepotBuild" { "DepotID" "$2" "ContentRoot" "$PWD/work/content/$1" "FileMapping" { "LocalPath" "*" "DepotPath" "." "Recursive" "1" } }
V
}
depot windows "$DW"; depot mac "$DM"; depot linux "$DL"
cat > work/app_build.vdf <<V
"AppBuild" { "AppID" "$APP" "Desc" "$DESC" "SetLive" "$BRANCH" "ContentRoot" "$PWD/work/content" "BuildOutput" "$PWD/work/output"
  "Depots" { "$DW" "$PWD/work/depot_windows.vdf" "$DM" "$PWD/work/depot_mac.vdf" "$DL" "$PWD/work/depot_linux.vdf" } }
V

# Valve's own steamcmd, fetched once into ~/steamcmd
if [ ! -x ~/steamcmd/steamcmd.sh ]; then mkdir -p ~/steamcmd && curl -sSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar -xz -C ~/steamcmd; fi
~/steamcmd/steamcmd.sh +login "$LOGIN" +run_app_build "$PWD/work/app_build.vdf" +quit
