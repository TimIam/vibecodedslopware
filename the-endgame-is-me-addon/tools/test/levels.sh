#!/bin/bash
# inside WSL: peak and mean level of a few baked sounds, to see that none came out silent or clipped
cd "$(dirname "$0")/../../sounds"
for f in stomp swipe roar kill lap tick bossdie menuGo crunch rock_calm rock_fight king_fight; do
  printf "%-12s " $f
  ffmpeg -hide_banner -i $f.ogg -af volumedetect -f null - 2>&1 | grep -E "Duration|mean_volume|max_volume" | sed -e 's/.*Duration: \([0-9:.]*\).*/\1/' -e 's/.*mean_volume: /mean /' -e 's/.*max_volume: /max /' | tr "\n" " "
  echo
done
ls *.ogg | wc -l
