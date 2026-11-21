// Storefront analytics tests: node --test tools/storefront.test.mjs
// Runs the real migration in PGlite (Postgres 17) behind a Supabase-compatible auth shim.
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, test, before } from "node:test";
import { makeDb } from "./storefront/pgdb.mjs";
import { daysAgo, epicCsv, FIXTURE_ENV, fixtureFetch, SAMPLE_GAMES, steamDates, withSamples } from "./storefront/fixtures.mjs";
import { loadCatalog, resolveTarget } from "../lib/storefront/catalog.js";
import { runSource, syncCatalog } from "../lib/storefront/sync.js";
import { formattedMatches, itch, redact, steam } from "../lib/storefront/adapters.js";
import { ImportError, validateImport } from "../lib/storefront/importer.js";
import { AuthError, authorize } from "../lib/storefront/auth.js";
import { serviceDb, userDb } from "../lib/storefront/db.js";
import { buildDashboard } from "../lib/storefront/report.js";
import { devMode } from "../lib/storefront/http.js";
import { classify, visitorHash } from "../api/track.js";
import { cronAuthorized } from "../api/storefront-sync.js";

const OWNER = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const OUTSIDER = "00000000-0000-4000-8000-000000000003";
const UNCONFIRMED = "00000000-0000-4000-8000-000000000004";
const BANNED = "00000000-0000-4000-8000-000000000005";
const DELETED = "00000000-0000-4000-8000-000000000006";
const MFA = "00000000-0000-4000-8000-000000000007";
const NOW = new Date("2026-11-21T18:00:00Z");
const samplesOnly = { games: SAMPLE_GAMES, firstPartyTrackingSince: null };
const TABLES = ["members", "games", "listings", "first_party_events", "first_party_daily", "sync_runs", "imports", "metrics", "source_state", "audit_log"];
const SERVICE_FNS = [
  ["record_event", { p_platform: "site", p_kind: "site_asset", p_external_id: "/sample-game/SampleGame-1.0.0.zip", p_event: "site_download", p_day: "2026-11-20", p_visitor_hash: "a".repeat(43) }],
  ["sync_catalog", { p_catalog: { games: {} } }],
  ["begin_run", { p_source: "steam" }],
  ["rollup_first_party", { p_keep_days: 2 }],
];

async function seeded() {
  const db = await makeDb();
  await db.addUser({ id: OWNER }); await db.addMember(OWNER, "owner");
  await db.addUser({ id: ADMIN }); await db.addMember(ADMIN, "admin");
  await db.addUser({ id: OUTSIDER });
  await db.addUser({ id: UNCONFIRMED, confirmed: false }); await db.addMember(UNCONFIRMED, "admin");
  await db.addUser({ id: BANNED, banned: true }); await db.addMember(BANNED, "admin");
  await db.addUser({ id: DELETED, deleted: true }); await db.addMember(DELETED, "admin");
  await db.addUser({ id: MFA }); await db.addMember(MFA, "admin", { requireMfa: true });
  await syncCatalog(db.service(), withSamples(loadCatalog()));
  return db;
}

async function syncAll(db, fetchImpl = fixtureFetch(NOW)) {
  const out = [];
  for (const s of ["itch", "steam", "curseforge", "github"]) out.push(await runSource(s, { db: db.service(), env: FIXTURE_ENV, fetchImpl, now: NOW, catalog: samplesOnly }));
  return out;
}

const metricsSnapshot = async (db) => (await db.pg.query(`select listing_id, metric, basis, day::text, currency, value::text, source from storefront.metrics order by 1,2,3,4,5`)).rows;

// ---------------------------------------------------------------------------------------------
describe("access control (RLS + grants)", () => {
  let db;
  before(async () => { db = await seeded(); await syncAll(db); });

  test("anon can read nothing and call nothing", async () => {
    for (const t of TABLES) await assert.rejects(db.anon().select(t), /permission denied/, t);
    await assert.rejects(db.anon().rpc("member_role"), /permission denied/);
    await assert.rejects(db.anon().rpc("report", { p_from: "2026-01-01", p_to: "2026-12-31" }), /permission denied/);
  });

  test("anon has no schema usage and no execute on any storefront function", async () => {
    const r = (await db.pg.query(`select has_schema_privilege('anon', 'storefront', 'USAGE') as usage,
      (select json_agg(p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'storefront' and has_function_privilege('anon', p.oid, 'EXECUTE')) as fns`)).rows[0];
    assert.equal(r.usage, false);
    assert.equal(r.fns, null);
  });

  test("a signed-in non-member sees zero rows everywhere and has no role", async () => {
    const u = db.user(OUTSIDER);
    assert.equal(await u.rpc("member_role"), null);
    for (const t of TABLES) assert.equal((await u.select(t)).length, 0, t);
    assert.equal((await u.rpc("report", { p_from: "2000-01-01", p_to: "2100-01-01" })).length, 0);
  });

  test("a non-member cannot write the catalog, metrics, imports or membership", async () => {
    const u = db.user(OUTSIDER);
    await assert.rejects(u.insert("games", { slug: "evil", title: "x" }), /row-level security/);
    await assert.rejects(u.insert("members", { user_id: OUTSIDER, role: "owner" }), /permission denied/);
    await assert.rejects(u.rpc("import_metrics", { p_source: "epic_import", p_sha256: "0".repeat(64), p_filename: "x", p_rows: [{}] }), /not authorized/);
  });

  test("members cannot change membership, including their own role", async () => {
    for (const id of [ADMIN, OWNER]) {
      const u = db.user(id);
      await assert.rejects(u.insert("members", { user_id: OUTSIDER, role: "admin" }), /permission denied/);
      await assert.rejects(db.as("authenticated", { sub: id, role: "authenticated" }, (tx) => tx.query(`update storefront.members set role = 'owner' where user_id = $1`, [ADMIN])), /permission denied/);
      await assert.rejects(db.as("authenticated", { sub: id, role: "authenticated" }, (tx) => tx.query(`delete from storefront.members`)), /permission denied/);
    }
  });

  test("server-only functions are not callable by members or anon", async () => {
    for (const who of [db.user(OWNER), db.user(OUTSIDER), db.anon()]) {
      for (const [fn, args] of SERVICE_FNS) await assert.rejects(who.rpc(fn, args), /permission denied/, fn);
    }
  });

  test("members read everything; owner and admin both have a role", async () => {
    assert.equal(await db.user(OWNER).rpc("member_role"), "owner");
    assert.equal(await db.user(ADMIN).rpc("member_role"), "admin");
    assert.ok((await db.user(ADMIN).select("metrics")).length > 0);
    assert.equal((await db.user(ADMIN).select("members")).length, 6);
  });

  test("fails closed for unconfirmed, banned, deleted and anonymous accounts", async () => {
    for (const id of [UNCONFIRMED, BANNED, DELETED]) {
      assert.equal(await db.user(id).rpc("member_role"), null, id);
      assert.equal((await db.user(id).select("metrics")).length, 0, id);
    }
    assert.equal(await db.user(OWNER, { is_anonymous: true }).rpc("member_role"), null);
    assert.equal(await db.user(OWNER, { role: "anon" }).rpc("member_role"), null);
  });

  test("require_mfa members need an aal2 session", async () => {
    assert.equal(await db.user(MFA).rpc("member_role"), null);
    assert.equal(await db.user(MFA, { aal: "aal2" }).rpc("member_role"), "admin");
  });

  test("members cannot write platform-reported numbers directly", async () => {
    const [l] = await db.user(OWNER).select("listings", "select=id&external_id=eq.3900001");
    await assert.rejects(db.user(OWNER).insert("metrics", { listing_id: l.id, metric: "sales_units", basis: "day", day: "2026-11-01", value: 999, source: "steam" }), /row-level security/);
    const before = await metricsSnapshot(db);
    // The UPDATE policy only matches import rows, so this touches nothing (and raises nothing).
    await db.as("authenticated", { sub: OWNER, role: "authenticated" }, (tx) => tx.query(`update storefront.metrics set value = 777777 where source = 'steam'`));
    assert.deepEqual(await metricsSnapshot(db), before);
  });

  test("imports cannot target other platforms or overwrite API data", async () => {
    const owner = db.user(OWNER);
    const listings = await owner.select("listings", "select=id,platform,external_id&active=is.true");
    const steamListing = listings.find((l) => l.platform === "steam");
    const day = steamDates(NOW)[0];
    await assert.rejects(owner.rpc("import_metrics", { p_source: "epic_import", p_sha256: "1".repeat(64), p_filename: "x.csv",
      p_rows: [{ listing_id: steamListing.id, metric: "sales_units", basis: "day", day, currency: "", value: 1 }] }), /platform/);
    await assert.rejects(owner.rpc("import_metrics", { p_source: "manual_import", p_sha256: "2".repeat(64), p_filename: "x.csv",
      p_rows: [{ listing_id: steamListing.id, metric: "sales_units", basis: "day", day, currency: "", value: 1 }] }), /overwrite platform-reported/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("idempotent sync and import", () => {
  test("running every adapter twice leaves the same numbers", async () => {
    const db = await seeded();
    const first = await syncAll(db);
    assert.ok(first.every((r) => r.ok), JSON.stringify(first));
    const a = await metricsSnapshot(db);
    const second = await syncAll(db);
    assert.ok(second.every((r) => r.ok));
    assert.deepEqual(await metricsSnapshot(db), a);
    const runs = (await db.pg.query(`select source, status from storefront.sync_runs`)).rows;
    assert.equal(runs.length, 8);
    assert.ok(runs.every((r) => r.status === "success"));
  });

  test("steam sums every page of a date, excludes microtransaction units and unmapped apps", async () => {
    const db = await seeded();
    await syncAll(db);
    const rows = (await db.pg.query(`select metric, sum(value)::float8 v from storefront.metrics where source='steam' group by 1 order by 1`)).rows;
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.metric, r.v])),
      { key_activations: 4, refund_units: 1, revenue_gross: 93.32, revenue_net: 81.83, sales_units: 9 });
    const state = (await db.pg.query(`select cursor from storefront.source_state where source='steam'`)).rows[0].cursor;
    assert.equal(state.highwatermark, "4242");
    assert.deepEqual(state.pending, []);
  });

  test("steam resumes across runs and ends with the same totals", async () => {
    const one = await seeded();
    await runSource("steam", { db: one.service(), env: FIXTURE_ENV, fetchImpl: fixtureFetch(NOW), now: NOW, catalog: samplesOnly });
    const reference = (await metricsSnapshot(one)).map(({ listing_id, ...r }) => r);

    const db = await seeded();
    const fetchImpl = fixtureFetch(NOW);
    let cursor = {}, rounds = 0;
    const svc = db.service();
    do {
      const res = await steam({ env: FIXTURE_ENV, fetchImpl, listings: Object.entries(SAMPLE_GAMES).flatMap(([g, x]) => x.listings.map((l) => ({ game: g, ...l }))), cursor, now: NOW, maxDates: 1 });
      const run = await svc.rpc("begin_run", { p_source: "steam" });
      await svc.rpc("upsert_metrics", { p_run: run, p_rows: res.rows });
      await svc.rpc("finish_run", { p_run: run, p_ok: true, p_message: "ok", p_cursor: res.cursor });
      cursor = res.cursor;
      rounds++;
      if (cursor.pending.length) assert.equal(cursor.highwatermark, "0", "highwatermark must not advance while dates are pending");
    } while (cursor.pending.length && rounds < 10);
    assert.equal(rounds, 3);
    assert.equal(cursor.highwatermark, "4242");
    assert.deepEqual((await metricsSnapshot(db)).map(({ listing_id, ...r }) => r).map((r) => ({ ...r })), reference.map((r) => ({ ...r })));
  });

  test("a revised steam date replaces old values, including back to zero", async () => {
    const db = await seeded();
    await syncAll(db);
    const day = steamDates(NOW)[0];
    const empty = async (url) => {
      const u = new URL(url);
      if (u.pathname.endsWith("GetChangedDatesForPartner/v001/")) return Response.json({ response: { dates: [day], result_highwatermark: "5000" } });
      return Response.json({ response: { max_id: "0", results: [] } });
    };
    const r = await runSource("steam", { db: db.service(), env: FIXTURE_ENV, fetchImpl: empty, now: NOW, catalog: samplesOnly });
    assert.ok(r.ok);
    const v = (await db.pg.query(`select value::float8 v from storefront.metrics where source='steam' and metric='sales_units' and day=$1`, [day])).rows[0].v;
    assert.equal(v, 0);
  });

  test("a failed sync records a redacted error and keeps the cursor", async () => {
    const db = await seeded();
    const leaky = async () => { throw new Error(`boom ${FIXTURE_ENV.STEAM_FINANCIAL_API_KEY}`); };
    const r = await runSource("steam", { db: db.service(), env: FIXTURE_ENV, fetchImpl: leaky, now: NOW, catalog: samplesOnly });
    assert.equal(r.ok, false);
    const st = (await db.pg.query(`select last_error, last_success_at, cursor from storefront.source_state where source='steam'`)).rows[0];
    assert.equal(st.last_success_at, null);
    assert.deepEqual(st.cursor, {});
    const all = JSON.stringify((await db.pg.query(`select * from storefront.sync_runs`)).rows) + JSON.stringify(st) + JSON.stringify(r);
    for (const k of Object.values(FIXTURE_ENV)) if (k.length > 2) assert.ok(!all.includes(k), "secret leaked into stored error");
  });

  test("the same import file is accepted once; a corrected file replaces its rows", async () => {
    const db = await seeded();
    const owner = db.user(OWNER);
    const listings = await owner.select("listings", "select=id,platform,external_id&active=is.true");
    const csv = epicCsv(NOW);
    const v = validateImport({ source: "epic_import", text: csv, listings, today: "2026-11-21" });
    const first = await owner.rpc("import_metrics", { p_source: "epic_import", p_sha256: v.sha256, p_filename: "a.csv", p_rows: v.rows });
    assert.equal(first.status, "imported");
    assert.equal(first.rows, 3);
    const again = await db.user(ADMIN).rpc("import_metrics", { p_source: "epic_import", p_sha256: v.sha256, p_filename: "a-copy.csv", p_rows: v.rows });
    assert.equal(again.status, "duplicate");
    const fixed = csv.replace(",day,sales_units,,4", ",day,sales_units,,5");
    const v2 = validateImport({ source: "epic_import", text: fixed, listings, today: "2026-11-21" });
    assert.equal((await owner.rpc("import_metrics", { p_source: "epic_import", p_sha256: v2.sha256, p_filename: "b.csv", p_rows: v2.rows })).status, "imported");
    const rows = (await db.pg.query(`select metric, value::float8 v from storefront.metrics where source='epic_import' order by 1`)).rows;
    assert.deepEqual(rows.map((r) => [r.metric, r.v]), [["free_claims", 1200], ["revenue_gross", 39.96], ["sales_units", 5]]);
    assert.equal((await db.pg.query(`select count(*)::int n from storefront.imports`)).rows[0].n, 2);
    const audit = (await db.pg.query(`select actor from storefront.audit_log where action='import'`)).rows;
    assert.deepEqual(audit.map((a) => a.actor), [OWNER, OWNER]);
  });

  test("first-party events count each visitor once per file per day, before and after rollup", async () => {
    const db = await seeded();
    const svc = db.service();
    const args = (day, h) => ({ p_platform: "site", p_kind: "site_asset", p_external_id: "/sample-game/SampleGame-1.0.0.zip", p_event: "site_download", p_day: day, p_visitor_hash: h });
    const h1 = visitorHash("k".repeat(32), "x", "1.2.3.4", "ua"), h2 = visitorHash("k".repeat(32), "y", "1.2.3.4", "ua");
    const old = daysAgo(new Date(), 5), recent = daysAgo(new Date(), 0);
    assert.equal(await svc.rpc("record_event", args(old, h1)), true);
    assert.equal(await svc.rpc("record_event", args(old, h1)), false);
    assert.equal(await svc.rpc("record_event", args(old, h2)), true);
    assert.equal(await svc.rpc("record_event", args(recent, h1)), true);
    assert.equal(await svc.rpc("record_event", { ...args(recent, h1), p_external_id: "/not/in/catalog.zip" }), false);
    const count = async () => (await db.user(OWNER).rpc("report", { p_from: daysAgo(new Date(), 30), p_to: recent })).find((r) => r.metric === "site_download");
    assert.equal(Number((await count()).value), 3);
    assert.equal(await svc.rpc("rollup_first_party", { p_keep_days: 2 }), 2);
    assert.equal(Number((await count()).value), 3);
    assert.equal((await db.pg.query(`select count(*)::int n from storefront.first_party_events`)).rows[0].n, 1, "old visitor hashes are deleted");
    await svc.rpc("rollup_first_party", { p_keep_days: 2 });
    assert.equal(Number((await count()).value), 3, "a second rollup changes nothing");
  });
});

// ---------------------------------------------------------------------------------------------
describe("server authorization", () => {
  const req = (auth) => new Request("https://admin.vibecodedslopware.com/api/admin", { headers: auth ? { authorization: auth } : {} });
  const backend = (user, role, { throws = false } = {}) => ({
    getUser: async () => user,
    dbFor: () => ({ rpc: async () => { if (throws) throw new Error("db down"); return role; } }),
  });
  const confirmed = { id: OWNER, email_confirmed_at: "2026-01-01T00:00:00Z" };

  test("refuses missing, malformed, rejected, unconfirmed and anonymous tokens", async () => {
    for (const [r, be] of [
      [req(null), backend(confirmed, "owner")],
      [req("Bearer not-a-jwt"), backend(confirmed, "owner")],
      [req("Basic a.b.c"), backend(confirmed, "owner")],
      [req("Bearer a.b.c"), backend(null, "owner")],
      [req("Bearer a.b.c"), backend({ id: OWNER, email_confirmed_at: null }, "owner")],
      [req("Bearer a.b.c"), backend({ ...confirmed, is_anonymous: true }, "owner")],
    ]) await assert.rejects(authorize(r, be), (e) => e instanceof AuthError && e.status === 401);
  });

  test("refuses signed-in users without a role, or when the role check fails", async () => {
    for (const be of [backend(confirmed, null), backend(confirmed, "superuser"), backend(confirmed, "owner", { throws: true })]) {
      await assert.rejects(authorize(req("Bearer a.b.c"), be), (e) => e instanceof AuthError && e.status === 403);
    }
    assert.equal((await authorize(req("Bearer a.b.c"), backend(confirmed, "admin"))).role, "admin");
  });

  test("dashboard reads use the caller's token and the publishable key, never the secret", async () => {
    const seen = [];
    const fetchImpl = async (url, init) => { seen.push({ url, headers: init.headers }); return new Response("[]", { status: 200 }); };
    const cfg = { url: "https://abc.supabase.co", publishable: "sb_publishable_test", secret: "sb_secret_test_value" };
    await userDb(cfg, "user.jwt.token", fetchImpl).select("metrics");
    assert.equal(seen[0].headers.apikey, "sb_publishable_test");
    assert.equal(seen[0].headers.authorization, "Bearer user.jwt.token");
    assert.equal(seen[0].headers["accept-profile"], "storefront");
    assert.ok(!JSON.stringify(seen).includes("sb_secret_test_value"));
    await serviceDb(cfg, fetchImpl).rpc("record_event", {});
    assert.equal(seen[1].headers.apikey, "sb_secret_test_value");
    assert.equal(seen[1].headers.authorization, undefined, "new-style secret keys are not sent as a bearer token");
  });

  test("the fixture backend is only reachable on localhost, off Vercel, when asked for", () => {
    const local = new Request("http://localhost:3131/api/admin");
    assert.equal(devMode(local, { STOREFRONT_DEV: "pglite" }), true);
    assert.equal(devMode(local, {}), false);
    assert.equal(devMode(local, { STOREFRONT_DEV: "pglite", VERCEL: "1" }), false);
    assert.equal(devMode(local, { STOREFRONT_DEV: "pglite", VERCEL_ENV: "preview" }), false);
    assert.equal(devMode(new Request("https://admin.vibecodedslopware.com/api/admin"), { STOREFRONT_DEV: "pglite" }), false);
  });

  test("the admin API refuses outsiders and lets only the owner start a sync", async () => {
    process.env.STOREFRONT_DEV = "pglite";
    try {
      const { GET, POST } = await import("../api/admin.js");
      const call = (method, token, body) => (method === "GET" ? GET : POST)(new Request("http://localhost:3131/api/admin", {
        method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
      assert.equal((await call("GET", "dev.outsider.fixture")).status, 403);
      assert.equal((await call("GET", "dev.nobody.fixture")).status, 401);
      const ok = await call("GET", "dev.owner.fixture");
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get("cache-control"), "no-store");
      assert.equal((await call("POST", "dev.admin.fixture", { action: "sync", source: "itch" })).status, 403);
      assert.equal((await call("POST", "dev.outsider.fixture", { action: "import", source: "epic_import", csv: "x" })).status, 403);
      const bad = await call("POST", "dev.admin.fixture", { action: "import", source: "epic_import", filename: "x.csv", csv: "platform,external_id,date,basis,metric,currency,value\nsteam,3900001,2026-11-01,day,sales_units,,1\n" });
      assert.equal(bad.status, 422);
    } finally { delete process.env.STOREFRONT_DEV; }
  });

  test("cron endpoint needs the exact secret", () => {
    const secret = "s".repeat(40);
    const r = (h) => new Request("https://x/api/storefront-sync", { headers: h ? { authorization: h } : {} });
    assert.equal(cronAuthorized(r(`Bearer ${secret}`), secret), true);
    assert.equal(cronAuthorized(r(`Bearer ${secret}x`), secret), false);
    assert.equal(cronAuthorized(r(null), secret), false);
    assert.equal(cronAuthorized(r("Bearer "), ""), false, "an unset secret never matches");
  });
});

// ---------------------------------------------------------------------------------------------
describe("first-party tracking", () => {
  const env = { STOREFRONT_TRACK_SECRET: "t".repeat(40) };
  const catalog = withSamples(loadCatalog());
  const UA = "Mozilla/5.0 (Windows NT 10.0) Firefox/140.0";
  const req = (headers = {}) => new Request("https://vibecodedslopware.com/api/track", { method: "POST",
    headers: { origin: "https://vibecodedslopware.com", "user-agent": UA, "x-forwarded-for": "203.0.113.9, 10.0.0.1", ...headers } });

  test("counts a catalog download with a daily, non-reversible visitor key", () => {
    const real = Object.values(loadCatalog().games).flatMap((g) => g.listings).find((l) => l.platform === "site");
    const hit = classify(req(), JSON.stringify({ t: "d", u: real.id }), env, NOW);
    assert.ok(hit);
    assert.equal(hit.event, "site_download");
    assert.match(hit.visitor_hash, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!JSON.stringify(hit).includes("203.0.113.9") && !JSON.stringify(hit).includes("Firefox"));
    const tomorrow = classify(req(), JSON.stringify({ t: "d", u: real.id }), env, new Date(NOW.getTime() + 864e5));
    assert.notEqual(tomorrow.visitor_hash, hit.visitor_hash, "keys don't link across days");
  });

  test("ignores GPC, DNT, bots, other origins, unknown files and missing secrets", () => {
    const real = Object.values(loadCatalog().games).flatMap((g) => g.listings).find((l) => l.platform === "site").id;
    const body = JSON.stringify({ t: "d", u: real });
    assert.equal(classify(req({ "sec-gpc": "1" }), body, env), null);
    assert.equal(classify(req({ dnt: "1" }), body, env), null);
    assert.equal(classify(req({ "user-agent": "Googlebot/2.1" }), body, env), null);
    assert.equal(classify(req({ origin: "https://evil.example" }), body, env), null);
    assert.equal(classify(req(), JSON.stringify({ t: "d", u: "/whelp/NotAFile.zip" }), env), null);
    assert.equal(classify(req(), body, {}), null);
    assert.equal(classify(req(), "not json", env), null);
  });

  test("resolves versioned paths and store urls only through the catalog", () => {
    const origin = "https://vibecodedslopware.com";
    assert.equal(resolveTarget("site_download", "/v/whelp/1/whelp/Whelp-1.0.0.zip", origin, catalog)?.game, "whelp");
    assert.equal(resolveTarget("site_download", "https://elsewhere.example/whelp/Whelp-1.0.0.zip", origin, catalog), null);
    assert.equal(resolveTarget("outbound_click", "https://Example-Studio.itch.io/sample-game/?utm=x#y", origin, catalog)?.id, "900001");
    assert.equal(resolveTarget("outbound_click", "http://example-studio.itch.io/sample-game", origin, catalog), null);
    assert.equal(resolveTarget("outbound_click", "https://itch.io/some-other-game", origin, catalog), null);
  });
});

// ---------------------------------------------------------------------------------------------
describe("adapters, imports and the dashboard model", () => {
  const listings = Object.entries(SAMPLE_GAMES).flatMap(([g, x]) => x.listings.map((l) => ({ game: g, ...l })));

  test("keys travel only where each API expects them", async () => {
    const log = [];
    const fetchImpl = fixtureFetch(NOW, { log });
    await itch({ env: FIXTURE_ENV, fetchImpl, listings, now: NOW });
    await steam({ env: FIXTURE_ENV, fetchImpl, listings, now: NOW });
    for (const call of log) {
      const where = JSON.stringify(call);
      if (call.url.startsWith("https://api.itch.io")) {
        assert.equal(call.headers.authorization, `Bearer ${FIXTURE_ENV.ITCH_API_KEY}`);
        assert.ok(!JSON.stringify(call.query).includes(FIXTURE_ENV.ITCH_API_KEY));
      } else {
        assert.ok(call.url.startsWith("https://partner.steam-api.com/IPartnerFinancialsService/"));
        assert.equal(call.query.key, FIXTURE_ENV.STEAM_FINANCIAL_API_KEY);
      }
      assert.ok(!where.includes(FIXTURE_ENV.CURSEFORGE_API_KEY));
    }
  });

  test("steam stays off unless separately enabled", async () => {
    await assert.rejects(steam({ env: { STEAM_FINANCIAL_API_KEY: "k" }, fetchImpl: fixtureFetch(NOW), listings, now: NOW }), /not enabled/);
  });

  test("itch earnings are kept only when amount matches amount_formatted", () => {
    assert.equal(formattedMatches("$50.47", 5047), true);
    assert.equal(formattedMatches("50,47 €", 5047), true);
    assert.equal(formattedMatches("$5,047.00", 5047), false);
    assert.equal(formattedMatches("", 0), false);
  });

  test("redact strips secrets from messages", () => {
    assert.equal(redact("bad key abcdef123 here", ["abcdef123"]), "bad key [redacted] here");
  });

  test("import validation rejects the whole file on any bad row", () => {
    const ls = [{ id: "l1", platform: "epic", external_id: "E1" }];
    const h = "platform,external_id,date,basis,metric,currency,value";
    const bad = [
      `${h}\nepic,E1,2026-13-01,day,sales_units,,1`,
      `${h}\nepic,E1,2026-11-01,day,revenue_gross,,9.99`,
      `${h}\nepic,E1,2026-11-01,day,sales_units,USD,1`,
      `${h}\nepic,E1,2026-11-01,day,sales_units,,1.5`,
      `${h}\nepic,E1,2026-11-01,day,sales_units,,$1`,
      `${h}\nepic,E2,2026-11-01,day,sales_units,,1`,
      `${h}\nsteam,E1,2026-11-01,day,sales_units,,1`,
      `${h}\nepic,E1,2026-11-01,week,sales_units,,1`,
      `${h}\nepic,E1,2099-11-01,day,sales_units,,1`,
      `${h}\nepic,E1,2026-11-01,day,sales_units,,1\nepic,E1,2026-11-01,day,sales_units,,2`,
      "units,date\n1,2026-11-01",
    ];
    for (const text of bad) assert.throws(() => validateImport({ source: "epic_import", text, listings: ls, today: "2026-11-21" }), ImportError, text);
    const ok = validateImport({ source: "epic_import", text: `﻿${h}\r\nepic,E1,2026-11-01,day,revenue_gross,usd,"9.99"\r\n`, listings: ls, today: "2026-11-21" });
    assert.deepEqual(ok.rows, [{ listing_id: "l1", metric: "revenue_gross", basis: "day", day: "2026-11-01", currency: "USD", value: "9.99" }]);
  });

  test("unknown is never shown as zero, and clicks are never sales", () => {
    const games = [{ slug: "g", title: "G" }];
    const ls = [
      { id: "s", game_slug: "g", platform: "steam", kind: "steam_app", external_id: "1", url: "https://store.steampowered.com/app/1", active: true },
      { id: "i", game_slug: "g", platform: "itch", kind: "itch_game", external_id: "2", url: "https://a.itch.io/g", active: true },
    ];
    const none = buildDashboard({ games, listings: ls, rows: [], sourceState: [], trackingSince: null, from: "2026-11-01", to: "2026-11-20" });
    const [steamRow, itchRow] = ["steam", "itch"].map((p) => none.games[0].platforms.find((x) => x.platform === p).cells);
    assert.equal(steamRow.sales_units.state, "pending");
    assert.equal(steamRow.store_downloads.state, "unavailable");
    assert.equal(steamRow.free_claims.state, "unavailable");
    assert.equal(steamRow.outbound_click.state, "pending", "tracking not live is unknown, not zero");
    assert.equal(itchRow.free_claims.state, "unavailable");
    for (const c of [...Object.values(steamRow), ...Object.values(itchRow)]) assert.notEqual(c.value, 0);

    // Steam covered the window and reported nothing: that is a real zero. itch with no rows is still unknown.
    const covered = buildDashboard({ games, listings: ls, rows: [{ listing_id: "i", metric: "outbound_click", basis: "day", currency: "", value: "7", first_day: "2026-11-02", last_day: "2026-11-09", days_with_data: 3 }],
      sourceState: [{ source: "steam", last_success_at: "2026-11-21T00:00:00Z", cursor: { covered_to: "2026-11-20" } }, { source: "itch", last_success_at: "2026-11-21T00:00:00Z", cursor: {} }],
      trackingSince: "2026-11-01", from: "2026-11-01", to: "2026-11-20" });
    const s = covered.games[0].platforms.find((x) => x.platform === "steam").cells;
    const i = covered.games[0].platforms.find((x) => x.platform === "itch").cells;
    assert.deepEqual([s.sales_units.state, s.sales_units.value], ["value", 0]);
    assert.equal(i.sales_units.state, "pending");
    assert.equal(i.outbound_click.value, 7);
    assert.equal(i.sales_units.value, undefined, "a click never fills the sales column");
  });

  test("revenue is kept per currency", async () => {
    const db = await seeded();
    await syncAll(db);
    const rows = await db.user(OWNER).rpc("report", { p_from: "2026-10-01", p_to: "2026-11-21" });
    const earnings = rows.filter((r) => r.metric === "earnings").map((r) => [r.currency, Number(r.value)]).sort();
    assert.deepEqual(earnings, [["EUR", 120.5], ["USD", 847.11]]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("repository hygiene", () => {
  test("vercel.json matches what tools/versions.mjs writes for the admin host", () => {
    const v = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    const src = fs.readFileSync(new URL("./versions.mjs", import.meta.url), "utf8");
    const csp = v.headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
    assert.ok(src.includes(csp), "CSP in vercel.json and versions.mjs differ");
    assert.equal(v.rewrites[0].destination, "/admin/");
    assert.deepEqual(v.headers[1].has, [{ type: "host", value: "admin.vibecodedslopware.com" }]);
  });

  test("migrations, docs and dev tooling stay out of the deploy", () => {
    const ignore = fs.readFileSync(new URL("../.vercelignore", import.meta.url), "utf8").split(/\r?\n/);
    for (const p of ["supabase/", "docs/", "tools/", ".env*"]) assert.ok(ignore.includes(p), p);
  });

  test("the catalog only names ids taken from the repo", () => {
    const listings = Object.values(loadCatalog().games).flatMap((g) => g.listings);
    for (const l of listings) assert.ok(l.platform === "site" || l.from === "tools/addon-watch/config.json" || l.manual, JSON.stringify(l));
    assert.equal(loadCatalog().firstPartyTrackingSince, null, "set only when tracking is actually deployed");
  });
});
