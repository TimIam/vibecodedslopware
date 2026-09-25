# vibe coded slopware

Source for **https://vibecodedslopware.com**: small, weird, lovingly vibe-coded things.

Plain static site, no build step. Each project lives in its own folder and gets a card on the home page.

| Path | What |
|---|---|
| `index.html` | Home page: the card list |
| `bonsai/` | Desk Bonsai |
| `bonsai-idle/` | Bonsai Idle |
| `strange-weather/` | Strange Weather, a Godot 4.7 web export. Source lives in `C:\Projects\NewerGameIdeas\strange-weather`; rebuild with its `tools/publish_web.sh`, then copy `build/web/*` here |

## Adding a project
1. Put it in its own folder with an `index.html`.
2. Add a card to `index.html` linking to it **with a trailing slash** (`/my-thing/`), so relative paths resolve.

## Deploy
Hosted on Vercel (project `vibecodedslopware`). Pushing to GitHub does **not** deploy; deploy with the CLI from this folder:

```bash
vercel link --yes --project vibecodedslopware   # once per machine
vercel deploy --prod --yes
```

`vercel deploy` replaces the whole site with this folder's contents. If anything was deployed from somewhere else, pull it into this folder and commit it first.
