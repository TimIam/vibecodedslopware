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
| `psychic/` | Madame Haiku: tarot spreads and horoscopes. Cards are shuffled in the browser (`deck.js` is shared with the API); the reading streams from `api/reading.js` |
| `api/` | Vercel Functions (Node). `reading.js` picks the newest `claude-haiku-*` model and streams a reading. Needs `ANTHROPIC_API_KEY` |

## Adding a project
1. Put it in its own folder with an `index.html`.
2. Add a card to `index.html` linking to it **with a trailing slash** (`/my-thing/`), so relative paths resolve.

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

`vercel deploy` replaces the whole site with this folder's contents. If anything was deployed from somewhere else, pull it into this folder and commit it first.

`api/reading.js` needs `ANTHROPIC_API_KEY` set on the Vercel project (Settings → Environment Variables, or `npx vercel env add ANTHROPIC_API_KEY production`). Without it the psychic page loads but every reading fails with "the crystal ball isn't plugged in".
