# vibe coded slopware

Source for **https://vibecodedslopware.com**: small, weird, lovingly vibe-coded things.

Plain static site, no build step. Each project lives in its own folder and gets a card on the home page. Anything that needs a server lives in `api/` as a Vercel Function.

| Path | What |
|---|---|
| `index.html` | Home page: the card list |
| `bonsai/` | Desk Bonsai |
| `bonsai-idle/` | Bonsai Idle |
| `strange-weather/` | Strange Weather, a Godot 4.7 web export. Source lives in `C:\Projects\NewerGameIdeas\strange-weather`; rebuild with its `tools/publish_web.sh`, then copy `build/web/*` here |
| `desktop-bag/` | Desktop Bag: landing page, browser demo, Windows download |
| `matrix/` | Matrix Rain, a screensaver for every monitor. `rain.html` is the whole web version (one file; `#saver`, `#embed`, `#backdrop` modes in its header comment). `MatrixRain.scr` is the native Windows one, built from `src/MatrixRain.cs` with `powershell -File matrix/src/build.ps1` (uses the C# compiler inside Windows, no SDK). `mac/` is the native macOS screensaver, built and signed on a Mac with `build.sh` and `signing/*.sh`; `mac/SIGNING.md` walks through Developer ID signing and notarization |
| `psychic/` | Madame Haiku, a 16-bit fortune teller: tarot spreads and horoscopes read one beat at a time. Cards are shuffled in the browser (`deck.js` is shared with the API) |
| `caseodle/` | Caseodle, a five-letter word game with unlimited puzzles for CaseOh's chat (fan-made, unaffiliated). The page never names its theme. Answers are in `index.html` (puzzle #1 is fixed; after that every game is a random draw from the pool); `words.js` is the accepted-guess list, rebuilt with `node tools/caseodle-words.mjs`. `kitty.svg` is the menu icon (an original illustration) and `spooky.png` the opt-in Spooky time image |
| `bear-run/` | Bear Run, a 3D downhill skiing game with a bear on your tail. Plain ES modules, no build: `game.js` builds every model in code (three.js, vendored as `vendor/three.module.min.js` + `three.core.min.js`, r185, MIT). Chase or top-down camera (C) |
| `api/` | Vercel Functions (Node). `reading.js` streams a tarot or astrology reading; `horoscopes.js` writes all twelve signs once a day (CDN-cached per date). Both pick the newest `claude-haiku-*` model via `lib/haiku.js`. Need `ANTHROPIC_API_KEY` |

## Adding a project
1. Put it in its own folder with an `index.html`.
2. Add a card to `index.html` linking to it **with a trailing slash** (`/my-thing/`), so relative paths resolve.
3. Every standalone HTML page, including full-screen games and demos, uses the fixed `.site-topbar` home/support navigation and loads `/site-nav.css` and `/site-nav.js`. Reuse the verified Buy Me a Coffee destination (`https://buymeacoffee.com/twilliamja0`); keep page-specific controls in the bar. Matrix background/embed surfaces retain their navigation-free rendering.

## Local dev
The static pages work from any file server. To run the API too:

```bash
npm install
echo ANTHROPIC_API_KEY=sk-ant-... > .env.local   # or: npx vercel env pull .env.local
npm run dev                                       # http://localhost:3131
```

`tools/dev.mjs` serves the site and mounts `api/*.js` the way Vercel does (Web `Request` in, streamed `Response` out). It is not part of the deploy.

## Deploy
Hosted on Vercel (project `vibecodedslopware`). Pushing to GitHub does **not** deploy; deploy with the CLI from this folder:

```bash
vercel link --yes --project vibecodedslopware   # once per machine
vercel deploy --prod --yes
```

`vercel deploy` replaces the whole site with this folder's contents. It uploads git-ignored files too, so anything that must stay off the public site goes in `.vercelignore` (currently `matrix/mac/` and local secrets). If anything was deployed from somewhere else, pull it into this folder and commit it first.

`api/reading.js` needs `ANTHROPIC_API_KEY` set on the Vercel project (Settings → Environment Variables, or `npx vercel env add ANTHROPIC_API_KEY production`). Without it the psychic page loads but every reading fails with "the crystal ball isn't plugged in".
