# Projection Mayhem — design

A first-person projectionist/theatre management sim (Supermarket Simulator-style) with lots of Fight Club
references. You are **Tyler**, night projectionist turned owner of the **Paper Street Picture House**.

## Arc
- **Act I: The Paper Street Picture House.** One screen, two 35mm projectors in the booth, reel-to-reel
  *changeovers*. Arthouse and cult prints only. Solo: you sell tickets, sell candy, swap posters, build up
  prints on the splicing bench, thread, and watch the screen for cigarette burns.
- **Act II: Expansion.** More screens (up to 6), platter systems (one long platter per screen, no changeovers,
  but you still build up and break down prints), blockbusters, hire staff (short stubby cartoon humans).
- **Act III: OmniPlex.** A corporation (rep: Richard Chesler) buys in. Digital projectors: DCP hard drives,
  ingest, KDM keys, pre-show ads, upsell quotas. Money's great. Your Soul meter drains. Hipsters complain.
- **Act IV: Project Mayhem.** You splice single frames into everything, the staff become space monkeys,
  and in the end the OmniPlex comes down. You re-open as a one-screen 35mm arthouse. No hipsters.

## Real projection practice the game teaches (in-game handbook)
- A feature arrives in a shipping case as 5–6 reels of ~2,000 ft (about 20 minutes each at 24 fps,
  90 ft/min, 16 frames per foot). Each reel has a **head leader** (start mark, countdown 8…3, the "2" frame,
  black) and a **tail leader** (run-out).
- **Building up**: cut off the tail leader of reel 1 exactly on the frame line after the last picture frame,
  cut the head leader off reel 2 on the frame line before its first picture frame, butt the two ends
  together on the splicer's registration pins, tape the emulsion side, trim and punch the sprocket holes,
  flip and tape the base side, then mark the splice on the edge so it can be found again at breakdown.
  Consecutive frames of one shot are nearly identical, so a clean splice is invisible on screen.
- **Threading**: feed reel → upper sprocket → upper loop → gate (aperture, pressure plate) → intermittent
  sprocket → lower loop → sound head → lower sprocket → take-up reel. Lose a loop and the picture jumps.
- **Changeover** (two-projector booths): near the end of each reel two **cue marks** (the "cigarette burns")
  flash in the upper-right corner of the picture, four frames each. The first, the **motor cue**, comes
  about 8 seconds (12 ft) before the end: start the incoming projector's motor. The second, the
  **changeover cue**, comes about 1 second before the end: hit the changeover; the douser closes on the
  outgoing machine and opens on the incoming one, and the audience never notices.
- **Platters** let one projector run a whole feature built up into a single huge horizontal reel.
- **Digital**: the film arrives as a DCP on a hard drive, gets ingested into the server, and plays only
  inside the window of its KDM (key delivery message).

## Module contract (js/)
- `films.js` — catalog (`FILMS`, `FILM_BY_ID`, `MISCHIEF_FRAMES`). Owned by the main build.
- `frames.js` — all 2D art: film shots, leaders, cue marks, mischief frames, posters. Owned by the splice agent.
  - `paintShot(ctx, filmId, shot, w, h, t = 0)` paints shot `shot` (0..film.shots-1) of the film into
    (0,0,w,h). `t` in [0,1) nudges the subject a little (frame-to-frame motion; two frames with close `t`
    look nearly identical). Deterministic, no randomness without a seed. Should be fast enough to call
    once per shot change at 512×372 (the game caches the result).
  - `paintLeader(ctx, kind, n, w, h)` — kind `'countdown'` (n = 8..2, Academy-style sweep, n may be
    fractional for the sweep), `'black'`, `'head'` / `'tail'` (leader text frame; n = reel number),
    `'start'` (the START mark frame).
  - `paintCue(ctx, w, h)` — draws one cigarette-burn cue mark in the upper-right of an already painted frame.
  - `paintMischief(ctx, id, w, h)` — one of `MISCHIEF_FRAMES`.
  - `paintPoster(ctx, film, w, h)` — a 2:3 one-sheet: key art, title, tagline.
- `splice.js` — the splicing bench minigame (2D DOM/canvas overlay). Owned by the splice agent.
  - `openSplice(root, opts)` returns `{ close() }`. `opts = { film, mode: 'buildup' | 'repair', reel,
    allowMischief, onDone(result) }`. `result = { aborted, quality /*0..1*/, framesLost, leaderFlashes,
    mischief /* id or null */, splices: [{ quality, framesLost, leaderFlash }] }`.
  - Buildup does `film.reels - 1` splices; splice k (1-based) joins the tail of reel k to the head of reel
    k+1, and both sides show shot `k % film.shots`.
- Everything else (world, people, sim, booth, ui, audio, main) is the main build.
