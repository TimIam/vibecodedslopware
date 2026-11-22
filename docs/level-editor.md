# Par for the Curse level editor

A level editor for the holes of Par for the Curse. It moves, changes, deletes and adds obstacles, and
stores the result as an overlay of the holes, which stay code; `js/levels.js` applies the overlay when the
course loads. On the site the overlay is published to the site's database; locally it is a file,
`par-for-the-curse/levels/front.json` (Mount Bogey) or `back.json` (Lantern Links). With no overlay, the
game builds exactly as the code says.

## Two ways to open it

- **On the site (admin members).** Sign in at https://vibecodedslopware.com/admin/ and use the
  *Par for the Curse level editor* links. The editor opens in the same tab and uses that sign-in.
  **Publish** stores the overlay as a new version in `storefront.levels`, in the same Supabase project
  as the admin page. Every player gets it on their next load, within about 15 seconds (the CDN keeps
  `/api/admin?view=course` for 15 s). Nothing is committed and nothing redeploys. Owner and admin members
  can publish; each publish also writes a row in `storefront.audit_log`.
- **Locally.** Run `node tools/dev.mjs` and open http://localhost:3131/par-for-the-curse/?edit (add
  `&nine=back` for the back nine, `&hole=N` for a hole). **Save** writes the file into that checkout,
  through the loopback-only `POST /__dev/pftc-level`. Locally the game reads only that file, never the
  published course. A committed file is what players get only until the first publish from the site.

Players never load the editor. On the site, `?edit` without a member sign-in shows the normal game with
a note.

## Setup

Nothing beyond the admin page's own setup: the editor uses `STOREFRONT_SUPABASE_URL` and
`STOREFRONT_SUPABASE_PUBLISHABLE_KEY` and the member list (`storefront.members`, see
`docs/storefront-analytics.md`). The table and its two functions come from
`supabase/migrations/20261122120000_storefront_levels.sql`, applied to forageAIv2 on its own like the
other storefront migrations.

## Notes

- Publish refuses (409) if someone published the same course since the editor loaded it, for example
  from another tab. The editor asks before it replaces it.
- Until the first publish of a course, players and the site editor start from the committed file in
  `levels/`. After that the published version wins; a later commit to that file changes nothing on the
  site.
- Every publish is kept. To roll back, republish an older one as the owner in the SQL editor:
  `insert into storefront.levels (name, body) select name, body from storefront.levels where id = <old id>;`
  (`select id, name, published_at, published_by from storefront.levels order by id desc` lists them).
- If the course can't be fetched in 3.5 s, a player builds from the file in `levels/` instead. Players in
  one room must build the same course, so a player who missed a publish (a stale tab, a failed fetch)
  can see pushed rocks out of step until they reload.
- This gives the anonymous role `USAGE` on the `storefront` schema, for `published_level` alone.
  Postgres lets PUBLIC execute every new function by default, so each new storefront function must
  revoke that. `tools/storefront.test.mjs` fails if anon can call anything else.
- Overlays are bounded on the server and again when the game loads: numbers within ±500, at most 400
  added pieces and 3000 edited ones, short strings and lists, and road `step` of at least 0.25. A file
  outside these bounds is refused on publish, and those entries are dropped on load. This stops a single
  bad file from freezing every player's load.
- Security: the editor uses the admin page's sign-in, which is kept in this tab's `sessionStorage` on
  vibecodedslopware.com. The game page also loads three.js and Rapier from jsDelivr, so a compromised
  CDN file could read that session while you edit. Pinning those imports with `integrity` hashes would
  close this. Sign out on the admin page when you are done.
- Test drives on the site run in a private room of their own and never publish.
- Code: `par-for-the-curse/js/levels.js` (overlay, recorder, `siteEditAccess`), `js/editor.js`,
  `lib/levels-publish.js`, the level routes in `api/admin.js`, the migration, and the links in `admin/`.
  Tests: `node --test tools/levels-publish.test.mjs` (runs the migration in PGlite).
