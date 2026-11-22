# Par for the Curse level editor

A level editor for the holes of Par for the Curse. It moves, changes, deletes and adds obstacles, and
stores the result as an overlay: `par-for-the-curse/levels/front.json` (Mount Bogey) and `back.json`
(Lantern Links). The holes themselves stay code, and `js/levels.js` applies the overlay when the course
loads. With empty overlays, the game builds exactly as the code says.

## Two ways to open it

- **On the site (admin members).** Sign in at https://vibecodedslopware.com/admin/ and use the
  *Par for the Curse level editor* links. The editor opens in the same tab and uses that sign-in.
  **Publish** commits the overlay to `main` through GitHub and starts a production deploy. Every
  player gets the edit about a minute later. Owner and admin members can publish. Each publish is a
  commit ("Par for the Curse: course edits on ...") and a row in `storefront.audit_log`.
- **Locally.** Run `node tools/dev.mjs` and open http://localhost:3131/par-for-the-curse/?edit (add
  `&nine=back` for the back nine, `&hole=N` for a hole). **Save** writes the file into that checkout,
  through the loopback-only `POST /__dev/pftc-level`. Commit it, rerun `tools/versions.mjs` and deploy
  as usual.

Players never load the editor. On the site, `?edit` without a member sign-in shows the normal game with
a note.

## Setup for publishing from the site (once)

`/api/admin` needs two server env vars in the Vercel project (Production):

| Variable | What it is |
|---|---|
| `LEVELS_GITHUB_TOKEN` | A GitHub fine-grained personal access token. Repository access: only `TimIam/vibecodedslopware`. Permissions: **Contents: Read and write** (Metadata read-only is added automatically). |
| `LEVELS_DEPLOY_HOOK` | A Vercel deploy hook for branch `main` (Project Settings > Git > Deploy Hooks). Production is not deployed on push, so this is what starts the deploy. |

Optional: `LEVELS_GITHUB_REPO` (default `TimIam/vibecodedslopware`) and `LEVELS_GITHUB_BRANCH`
(default `main`). The member list is the storefront one (`storefront.members`, see
`docs/storefront-analytics.md`).

Without the token, the editor still won't open on the site. Instead it shows "publishing is not set up
on the server". Without the hook, Publish still commits, then says the deploy did not start.

## Notes

- Publish refuses (409) if the file on `main` changed since the editor loaded it, for example a publish
  from another tab or a commit from a checkout. The editor asks before it replaces the file.
- On the site, the editor loads the overlay from `main` (through the API), not from the deployed copy,
  so a publish that is still deploying is not lost.
- A deploy from the hook ships whatever is on `main` at that moment, including other sessions' pushed
  commits. If production was deployed by hand from another branch that is ahead of `main`, a publish
  rolls production back to `main`. Keep `main` the branch that production comes from.
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
  `lib/levels-publish.js`, the level routes in `api/admin.js`, and the links in `admin/`. Tests:
  `node --test tools/levels-publish.test.mjs`.
