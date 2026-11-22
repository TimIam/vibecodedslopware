// Local development backend for /api/admin: PGlite + the real migration + fixture data, loaded by
// api/admin.js only when STOREFRONT_DEV=pglite, off Vercel, on localhost (lib/storefront/http.js).
//
//   STOREFRONT_DEV=pglite npm run dev    then open http://localhost:3131/admin/
//
// The fixture data is produced by running the real adapters against tools/storefront/fixtures.mjs,
// and every dashboard read still goes through member_role() and RLS, so signing in as the
// "outsider" fixture user shows the refusal a non-member gets in production.
import { loadCatalog } from "../../lib/storefront/catalog.js";
import { runSource, syncCatalog } from "../../lib/storefront/sync.js";
import { daysAgo, epicCsv, FIXTURE_ENV, fixtureFetch, SAMPLE_GAMES, withSamples } from "./fixtures.mjs";
import { makeDb } from "./pgdb.mjs";
import { validateImport } from "../../lib/storefront/importer.js";
import crypto from "node:crypto";

export const DEV_USERS = {
  "dev.owner.fixture": { id: "00000000-0000-4000-8000-0000000000a1", label: "Owner (fixture)", role: "owner" },
  "dev.admin.fixture": { id: "00000000-0000-4000-8000-0000000000a2", label: "Admin (fixture)", role: "admin" },
  "dev.outsider.fixture": { id: "00000000-0000-4000-8000-0000000000a3", label: "Signed in, not a member", role: null },
};

let ready = null;

export async function seed(db, now = new Date()) {
  for (const u of Object.values(DEV_USERS)) {
    await db.addUser({ id: u.id });
    if (u.role) await db.addMember(u.id, u.role);
  }
  const catalog = withSamples(loadCatalog());
  const service = db.service();
  await syncCatalog(service, catalog);
  const fetchImpl = fixtureFetch(now);
  // Adapters only see the sample games, so real games keep showing "not refreshed" locally.
  const samplesOnly = { games: SAMPLE_GAMES, firstPartyTrackingSince: null };
  for (const source of ["itch", "steam", "curseforge", "github"]) {
    const r = await runSource(source, { db: service, env: FIXTURE_ENV, fetchImpl, now, catalog: samplesOnly });
    if (!r.ok) throw new Error(`fixture sync ${source} failed: ${r.error}`);
  }
  // First-party: a few visitors on the sample download and the itch store link.
  for (let d = 0; d < 10; d++) {
    for (let v = 0; v < (d % 4) + 1; v++) {
      const hash = crypto.createHash("sha256").update(`fixture-${d}-${v}`).digest("base64url");
      await service.rpc("record_event", { p_platform: "site", p_kind: "site_asset", p_external_id: "/sample-game/SampleGame-1.0.0.zip", p_event: "site_download", p_day: daysAgo(now, d), p_visitor_hash: hash });
      if (v % 2 === 0) await service.rpc("record_event", { p_platform: "itch", p_kind: "itch_game", p_external_id: "900001", p_event: "outbound_click", p_day: daysAgo(now, d), p_visitor_hash: hash });
    }
  }
  await service.rpc("rollup_first_party", { p_keep_days: 2 });
  const owner = db.user(DEV_USERS["dev.owner.fixture"].id);
  const listings = await owner.select("listings", "select=id,platform,external_id&active=is.true");
  const v = validateImport({ source: "epic_import", text: epicCsv(now), listings });
  await owner.rpc("import_metrics", { p_source: "epic_import", p_sha256: v.sha256, p_filename: "epic-fixture.csv", p_rows: v.rows });
  return { trackingSince: daysAgo(now, 20) };
}

export async function devBackend() {
  ready ??= (async () => {
    const db = await makeDb();
    const { trackingSince } = await seed(db);
    return { db, trackingSince };
  })();
  const { db, trackingSince } = await ready;
  return {
    mode: "dev",
    trackingSince,
    devUsers: Object.entries(DEV_USERS).map(([token, u]) => ({ token, label: u.label })),
    async getUser(token) {
      const u = DEV_USERS[token];
      return u ? { id: u.id, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false } : null;
    },
    anon: () => db.anon(),
    dbFor(token) {
      const u = DEV_USERS[token];
      return db.user(u ? u.id : "00000000-0000-4000-8000-00000000ffff");
    },
  };
}
