# r/VibeCodedSlopware style

The subreddit look, drawn from the studio splash (`/splash.js`) so it matches the games.

- **Header/banner:** the splash, frozen just after the shine (synthwave sky, chrome VIBE CODED, dripping SLOPWARE, the goo blob in shades).
- **Sidebar:** the green goo blob with sunglasses, the same `SlopwareSplash.mascot()` the merch uses.
- **Background:** very dark green `#04140c`, with cards `#071d11` and borders `#0e5238`.
- **Post titles:** orange `#ff8a3a` (the splash sun) in a pixel typeface.
- **Vote arrows:** 12×12 pixel art. Green when untouched, orange when upvoted, chrome blue when downvoted.

Preview it: `node tools/dev.mjs`, then open http://localhost:3131/subreddit/preview.html (click the arrows to vote).
Re-render the art after the splash changes: `node tools/subreddit-art.mjs`.

## Files (`img/`)

| File | Size | Where it goes |
|---|---|---|
| `banner.png` | 1920×384 | new Reddit banner |
| `header.png` | 2560×192 | old Reddit header, uploaded as `header` |
| `icon.png` | 256×256 | community icon (old and new) |
| `sidebar-glob.png` | 300×213 | old Reddit, uploaded as `sidebarglob` |
| `arrows.png` | 144×24 | old Reddit vote sprite, uploaded as `arrows` |
| `vote-up.png`, `vote-upvoted.png`, `vote-down.png`, `vote-downvoted.png` | 48×48 | new Reddit custom vote icons |

## Old Reddit (full style)

1. old.reddit.com/r/VibeCodedSlopware/about/stylesheet
2. Upload `header.png` as **header**, `arrows.png` as **arrows**, `sidebar-glob.png` as **sidebarglob**. The names must match the `%%name%%` tokens in the stylesheet.
3. Paste `stylesheet.css` into the box and save. If Reddit rejects a line (it is picky about newer properties such as `image-rendering`), delete that line. The art is drawn at whole-pixel sizes, so it stays crisp without it.
4. Subreddit settings: upload `icon.png` as the community icon.

## New Reddit (no custom CSS)

Mod Tools → Community Appearance:

- **Banner:** `banner.png`. Reddit crops the top and bottom on narrow screens; the wordmark and blob sit in the middle, so they survive.
- **Avatar/icon:** `icon.png`.
- **Colors:** base/key color `#44c23a` (slime green), highlight `#ff8a3a`, body background `#04140c`.
- **Vote icons** (where the option still appears): inactive `vote-up.png` / `vote-down.png`, active `vote-upvoted.png` / `vote-downvoted.png`.
- **Sidebar:** new Reddit has no sidebar image slot. Put `sidebar-glob.png` in an image widget, or rely on the icon.

## The pixel font

Reddit only lets a subreddit upload images, not fonts, and new Reddit allows no fonts at all. So the title font is a
CSS font stack: `Press Start 2P`, `Pixelify Sans`, `Silkscreen`, `VT323`, then `Lucida Console`/`Courier New`.
Visitors who have one of those pixel fonts installed see pixel titles; everyone else sees the monospace fallback,
still in orange. Turning titles into images is not possible because titles are user text.
