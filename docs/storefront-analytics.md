# Storefront analytics (private dashboard)

The private sales and downloads dashboard for vibecodedslopware.com. It is meant to live at
**admin.vibecodedslopware.com**, for the owner (Tim) and one collaborator (Josh).

**Status (2026-11-21):** implemented and tested locally on branch `claude/storefront-analytics-dashboard-6198ce`.
The database migration **is applied** to forageAIv2, with the owner's approval (see "Live database" below).
None of the following has been done yet: deploying it, adding the DNS record, exposing the schema,
creating keys, adding members, pushing or merging. Each one is a separate step below that needs the
owner's go-ahead.

## What it shows

For each game and each platform, the dashboard has these columns. Each one is filled only from a
source that can actually report it:

| Column | Meaning | Source |
|---|---|---|
| Site downloads | Visitors who started a download of a file served by vibecodedslopware.com, counted once per visitor, per file, per day | First-party tracking |
| Store clicks | Visitors who clicked through to a store page. **A click is not a sale or a download**, and it has its own column | First-party tracking |
| Sales | Paid units | itch.io API, Steam API, Epic import |
| Refunds | Units returned | Steam API, Epic import |
| Free claims | Free copies claimed | Epic import only; no official API reports this |
| Store downloads | Downloads counted by the store | itch.io, CurseForge, GitHub APIs |
| Key activations | Steam `gross_units_activated` | Steam API |
| Revenue | One line per currency. Never converted, never added across currencies | Steam (USD gross/net), itch.io (`earnings`), Epic import |

Each cell is in one of four states. A number is only shown when a source supports it:

- **a number**, tagged either *in window* or *lifetime as of DATE*. itch.io, CurseForge and GitHub
  publish only running totals, so their numbers are lifetime totals and are not cut to the window.
- **partial**: the window reaches past what the source has covered. Hover the cell to see why.
- **unknown**: the source can report this but has not refreshed yet, or returned nothing.
- **n/a**: the platform has no official source for this number.

Unknown is never shown as 0. A 0 appears only in two cases: Steam has reported every day in the
window and there were no sales, or first-party tracking was live for the whole window and counted
nobody.

The Sources panel lists each source with its last successful refresh, last attempt, the date its
coverage runs through, its last error, and a link to its API documentation.

## Platform support (official interfaces only, checked 2026-11-21)

| Platform | Interface | What we take | Not available |
|---|---|---|---|
| itch.io | Server-side API `GET https://api.itch.io/profile/games`, `Authorization: Bearer` key ([docs](https://itch.io/docs/api/serverside)) | `downloads_count`, `purchases_count`, `views_count`, `earnings[]` (per currency) | Any history; refunds; free claims. The docs do not say what unit `earnings.amount` uses. Each amount is therefore checked against its `amount_formatted` and skipped if the two disagree. The docs also do not say whether itch's fee is already deducted, so the column is labelled "earnings" |
| Steam | `IPartnerFinancialsService` on `partner.steam-api.com`, using a **Financial API Group** key ([docs](https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService)) | Daily, per app: units sold, units returned, key activations, gross and net sales in USD | Download or install counts; free-license claims; totals in local currency. Unit counts come only from package rows, so microtransaction rows add to revenue but not to units. Dates are in Pacific Time, as Steam reports them. Wishlists (`GetAppWishlistReporting`) are available but not implemented |
| Epic Games Store | **No reporting API**, and the Developer Portal's export format is not documented | Validated manual import (template below), labelled as imported | Anything not typed in from the portal. There is no scraping, and imported numbers are never presented as live |
| CurseForge | `GET https://api.curseforge.com/v1/mods/{id}`, `x-api-key` ([docs](https://docs.curseforge.com/rest-api/)) | `downloadCount` (lifetime) | History; sales (addons are free) |
| GitHub Releases | `GET /repos/{owner}/{repo}/releases` ([docs](https://docs.github.com/en/rest/releases/releases)) | Sum of `download_count` for assets whose name starts with a prefix | History. There are no releases in this repo today, so there is nothing to map yet |
| GOG, Game Jolt, Humble | No official creator reporting API | — | Everything. Use a manual import if needed |

### Source ids per game: `lib/storefront/catalog.json`

`node tools/storefront-catalog.mjs` rebuilds the catalog. It fills in two kinds of entry on its own:

- every downloadable file tracked in git (`site_asset`)
- the CurseForge project ids that the release bot already uploads to (`tools/addon-watch/config.json`):
  1792480 Heal Pie, 1800371 The Endgame is Me, 1814519 Whelp

Store listings for itch.io, Steam, Epic and GitHub have to be added by hand, with `"manual": true`.
The id and url must be read from that store's own dashboard; never guess them. For example:

```json
{ "platform": "steam", "kind": "steam_app", "id": "<appid>", "url": "https://store.steampowered.com/app/<appid>/<slug>", "label": "Steam", "manual": true }
```

Kinds: `itch_game` (the itch game id), `steam_app` (the appid), `epic_product` (the id you will use
in imports), `curseforge_project`, `github_asset` (`owner/repo#AssetPrefix-`). The `url` is what
outbound clicks are matched against.

## How it is built

- `admin/` is the dashboard page. Sign-in is the existing Supabase Auth of the **forageAIv2**
  project, the same project the site's multiplayer already uses. Sign-in uses an email code or
  magic link with `create_user: false`, so the page can never create an account. The session is
  kept in `sessionStorage`. The page renders data with `textContent` only, and `vercel.json` sets a
  strict CSP, `noindex` and `no-store`.
- `api/admin.js` serves dashboard data, imports, and owner-only "refresh now". Each request goes
  through `lib/storefront/auth.js`:
  1. it needs a bearer JWT;
  2. Supabase Auth must accept the JWT (`/auth/v1/user`, so revoked sessions fail);
  3. the account must be confirmed and not anonymous;
  4. `storefront.member_role()`, run as that user, must return `owner` or `admin`.

  Every data read then uses the caller's own token, so Postgres RLS filters it again. If anything
  is unexpected, the request is refused.
- `api/track.js` and `/track.js` handle first-party counting (see Privacy).
- `api/storefront-sync.js` is the cron endpoint. It upserts the catalog, rolls up tracking, and
  runs each adapter that is configured.
- `lib/storefront/`: `adapters.js` (itch.io, Steam, CurseForge, GitHub), `importer.js` (CSV
  validation), `report.js` (cell states), `capabilities.js` (the platform matrix above), `db.js`
  (PostgREST), `sync.js`.
- `supabase/migrations/20261121120000_storefront_analytics.sql` is the schema. It is checked in only.

### Database: the `storefront` schema in forageAIv2

The forageAIv2 project is shared with ForageAI and has about 88 end-user accounts (email, Google,
Apple and Azure sign-ins). It has no admin-role concept. **So being signed in grants nothing.**
Access comes only from a row in `storefront.members`:

- `member_role()` is `security definer` and fails closed. Anonymous, unconfirmed, banned and
  deleted users get no role, and so does a JWT whose role is not `authenticated`. A member with
  `require_mfa` also needs an `aal2` session.
- RLS is on for every table. Members (owner or admin) can read everything. They can write
  `games`/`listings` and manual imports. **Nobody can write `members` through the API**: there is
  no grant and no policy for it.
- Members can never write numbers that came from a platform API. The import function also refuses
  to overwrite them, and refuses Epic imports that name non-Epic listings.
- `anon` has no access to the schema at all. The functions that write events, syncs, catalog
  updates and rollups are granted only to `service_role`.
- Sync is idempotent:
  - Cumulative numbers are upserted per as-of day.
  - Steam replaces every changed date in full, including zeros.
  - Steam's highwatermark advances only after every pending date is stored, and pending dates are
    carried in the cursor, so a long backfill resumes where it stopped.
- Imports are idempotent by SHA-256: sending the same file again changes nothing, and a corrected
  file replaces its rows. Each import is written to `audit_log` along with the member who made it.

### Privacy (first-party tracking)

- `/track.js` loads only on the pages that serve downloads. It sends a beacon only when someone
  clicks a download link or a store link. It uses no cookies, no storage and no identifiers.
  Nothing is sent when the browser sends Global Privacy Control or Do Not Track.
- The server ignores bots, other origins, and any file or url not in the catalog. It always
  answers 204.
- No IP address, user agent, referrer or country is stored. The visitor key is
  `HMAC(STOREFRONT_TRACK_SECRET, day | ip | user-agent)`. It exists only to count a visitor once
  per file per day, it does not link across days, and the nightly rollup deletes it after 2 days,
  leaving only per-day counts.
- Counts therefore leave out GPC/DNT visitors and people who download without JavaScript (direct
  links). They are a lower bound, not a census.

## Prerequisites before going live

Each item needs the owner's action or explicit approval. None of them has been done.

1. ~~**Apply the migration**~~ **Done 2026-11-21.** Both files in `supabase/migrations/` were applied
   one at a time, as `storefront_analytics` and `storefront_revoke_public_execute`. Live migrations
   on this project are applied individually (its history holds ForageAI's migrations, not this
   repo's), so **never run `supabase db push` from this repo**. Apply any future storefront
   migration the same way.
2. **Expose the schema**: Dashboard → Project Settings → Data API → Exposed schemas → add
   `storefront`. Until this is done the dashboard refuses every request. Exposing the schema is
   safe because RLS and grants gate it.
3. **Auth URL configuration**: add `https://admin.vibecodedslopware.com/**` under Authentication →
   URL Configuration → Redirect URLs. The project's Site URL belongs to ForageAI, so leave it alone.
4. **Email template**: to sign in by code, the *Magic Link* template must include `{{ .Token }}`.
   Without it, only the link works. That still signs in, as long as the redirect URL is allowed.
   The template is shared with ForageAI, so check its wording before you edit it.
5. **Vercel environment variables** (Production only). Set them with `npx vercel env add NAME
   production` and never commit them:
   - `STOREFRONT_SUPABASE_URL` = `https://dgpfngeqozrbwmjgnzuw.supabase.co`
   - `STOREFRONT_SUPABASE_PUBLISHABLE_KEY`: the publishable key (it is public)
   - `STOREFRONT_SUPABASE_SECRET_KEY`: a **new, dedicated** secret key. Create it under Project
     Settings → API Keys, so you can revoke it on its own. It is used only by `/api/track`, the
     cron endpoint, and owner-triggered sync.
   - `STOREFRONT_TRACK_SECRET`: 32 or more random bytes, for example
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   - `CRON_SECRET`: 32 or more random characters
   - Optional, per store: `ITCH_API_KEY`, `CURSEFORGE_API_KEY`, `GITHUB_RELEASES_TOKEN`
6. **Steam**, authorized separately. Create a Financial API Group in Steamworks → Users &
   Permissions → Manage Groups. Its Web API key returns financial data for every app on the
   account. Valve asks you to guard it like a password and to restrict it by IP. Vercel functions
   have no fixed outbound IP, so choose one:
   - leave the key unrestricted by IP; or
   - run the Steam sync from a host with a fixed IP.

   Then set `STEAM_FINANCIAL_API_KEY` **and** `STEAM_FINANCIAL_SYNC_ENABLED=1`. Without both, Steam
   never runs, and only the owner can start it by hand.
7. **Domain**: add `admin.vibecodedslopware.com` to the Vercel project. DNS for vibecodedslopware.com
   is at **Porkbun** (not Vercel), so add the record there: `CNAME admin → bdbd5d56bd9dcf61.vercel-dns-016.com`
   (the value Vercel recommended on 2026-11-21; re-check it in Vercel's domain panel). `vercel.json` already sends that host to `/admin/` with the locked-down headers.
8. ~~**Cron**~~ **Done in code**: `vercel.json` (generated by `tools/versions.mjs`) runs `/api/storefront-sync`
   daily at 09:00 UTC. It refuses every call until `CRON_SECRET` is set, and syncs nothing
   until the secret key and store keys exist.

   ⚠️ `tools/versions.mjs` regenerates `vercel.json` from scratch, so add the entry **in
   `versions.mjs`** too. That file already carries the admin rewrite and headers.
9. **Turn tracking on**: deploy, then set `"firstPartyTrackingSince": "YYYY-MM-DD"` in the catalog
   to the deploy date. Until it is set, every first-party cell says "not live yet" and shows no
   number.

## Live database (forageAIv2, applied 2026-11-21)

These checks ran right after applying:

- Every `storefront` function body on live matches the tested PGlite copy (md5 of all 12).
- RLS is on for all 10 tables and there are 18 policies.
- `anon` has no table grants, no schema usage and no function execute. The follow-up migration
  removed default `PUBLIC` execute on `import_metrics` and `report`; before that, `anon` could not
  reach them anyway, because it had no schema usage.
- `storefront.members` is empty.
- In a rolled-back transaction, a made-up signed-in non-member got `member_role() = null` and 0 rows
  from members, metrics and the report.
- The Security Advisor showed no `storefront` findings; everything it listed predates this work, in
  `public`. Once `storefront` is exposed (prerequisite 2), expect the lint "Signed-In Users Can
  Execute SECURITY DEFINER Function" for `member_role`, `is_member` and `is_owner`. That is
  intentional: they only ever report the caller's own role. They need definer rights to read
  `auth.users` and `members`.

## Onboarding (do this later, by hand)

Accounts in forageAIv2 are identified by their auth user id. Nothing in this branch names or adds
either person. Do these steps only after the prerequisites above are done.

**Tim (owner)**
1. Sign in at admin.vibecodedslopware.com with your email. The page shows "not on the storefront
   member list", which is expected. If you have no account in forageAIv2 yet, invite yourself
   first: Dashboard → Authentication → Users → Invite user.
2. In the SQL editor, which runs as the database owner, run:
   ```sql
   select id, email, email_confirmed_at from auth.users where email = '<your email>';
   insert into storefront.members (user_id, role, require_mfa, note) values ('<that id>', 'owner', false, 'Tim');
   ```
3. Recommended: enroll TOTP MFA for your account, then set `require_mfa = true` on your row.

**Josh (admin)**
1. Confirm Josh's exact sign-in email **with Josh directly**. Don't take it from any other source.
2. Check whether that address already has a forageAIv2 account (`select id ... where email = ...`).
   If it doesn't, invite it from Authentication → Users → Invite user. Make sure the invite
   redirect goes to the admin URL, not ForageAI's site.
3. Once Josh has signed in once and the account is confirmed, run
   `insert into storefront.members (user_id, role, note) values ('<id>', 'admin', 'Josh');`
4. Have Josh load the page and confirm he sees the dashboard.
5. Optionally check from his session that `select storefront.member_role()` returns `admin`.

Admins can see everything, including revenue, and can import. Only the owner can start a manual
refresh. To remove someone, run `delete from storefront.members where user_id = '<id>';`. Access
ends on their next request.

## Epic / manual import template

```
platform,external_id,date,basis,metric,currency,value
epic,<epic_product id from the catalog>,2026-11-01,day,sales_units,,12
epic,<epic_product id from the catalog>,2026-11-01,day,revenue_gross,USD,95.88
```

- `basis`: `day` or `cumulative` (the lifetime total as of that date).
- `metric`: `sales_units`, `refund_units`, `free_claims`, `store_downloads`, `revenue_gross` or
  `revenue_net`.
- `currency`: required on revenue rows and blank on every other row.
- Values are plain numbers. Unit counts must be whole numbers.

The whole file is rejected if any row is wrong. Future dates, duplicates, unknown ids and ids from
other platforms are all errors. An Epic import that only covers some days shows as *partial*,
because days that were not imported are unknown, not zero.

## Local development and tests

```bash
npm install
npm run test:storefront                 # 37 tests, PGlite, no network
STOREFRONT_DEV=pglite npm run dev       # http://localhost:3131/admin/ with fixture data
```

- The tests run the real migration on Postgres 17 (PGlite), on top of a stand-in for Supabase's
  auth schema and roles (`tools/storefront/supabase-shim.sql`).
- Local dev mode starts the same database and loads it by running the real adapters against mock
  API responses (`tools/storefront/fixtures.mjs`). Every fixture id is made up and attached to the
  "Sample … (fixture)" games, and the page shows a fixture banner.
- Dev mode is refused when it runs on Vercel, when a request comes from anywhere but localhost, or
  when `STOREFRONT_DEV` is unset. `tools/` is never deployed.

### Test results (2026-11-21, Node 25.8.1, Windows)

`node --test tools/storefront.test.mjs`: **37 passed, 0 failed.** The existing Mostly Sword suites
still pass (47 passed in total). The tests cover:

- **Access control.** `anon` can read and call nothing. A signed-in non-member gets 0 rows from
  every table and the report. Non-members can't write the catalog, imports or metrics. Members
  can't change membership, including their own role. Server-only functions are refused for
  members and `anon`. Unconfirmed, banned, deleted and anonymous accounts, and non-`authenticated`
  JWTs, all fail closed. `require_mfa` needs `aal2`. Members can't write or overwrite
  platform-reported numbers. Imports can't target another platform.
- **Server authorization.** Missing, malformed, rejected, unconfirmed or anonymous tokens get 401.
  Users with no role, or when the role check errors, get 403. Dashboard reads carry the user's own
  token and the publishable key, never the secret. The fixture backend is unreachable off localhost
  or on Vercel. Outsiders get 403 and admins can't start a sync. The cron secret must match exactly.
- **Idempotency.** Running every adapter twice gives identical rows. A Steam backfill that resumes
  over three runs matches a single run, and the highwatermark holds until it finishes. A revised
  Steam date drops back to 0. A failed sync stores a redacted error and keeps its cursor. Imports
  dedupe by hash and a corrected file replaces its rows. First-party dedupe stays correct across
  rollup, and old visitor keys are deleted.
- **Privacy and secrets.** Tracking ignores GPC, DNT, bots, foreign origins and files outside the
  catalog. The visitor key is not stored with the IP address or user agent and changes daily. Each
  key reaches only its own API (itch.io in the header, Steam in its query), and no secret appears
  in stored errors.
- **Model.** Unknown is never 0. Clicks never fill the sales column. Revenue stays per currency.
- **Hygiene.** The `vercel.json` admin headers match `versions.mjs`. Migrations, docs and tools are
  in `.vercelignore`. The catalog holds only ids taken from the repo.

The page was also checked in the browser with the fixture backend. The outsider account saw the
"not on the member list" refusal. The owner saw every game, with partial, unknown and n/a states
and revenue split by currency.

**Not tested:** anything against the live Supabase project, real store APIs or real keys. The
cron schedule and Vercel's handling of the new headers and host rewrite are also untested, because
none of it is deployed.
