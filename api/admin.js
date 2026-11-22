// /api/admin — the private storefront dashboard's API (admin.vibecodedslopware.com).
//
//   GET  /api/admin?view=config            public: how the page should sign in (no data)
//   GET  /api/admin?from=YYYY-MM-DD&to=...  dashboard for a window (default: last 30 days)
//   POST /api/admin {action:"import", source:"epic_import"|"manual_import", filename, csv}
//   POST /api/admin {action:"sync", source:"itch"|"steam"|"curseforge"|"github"}   owner only
//   GET  /api/admin?view=course&name=front|back  public: the published Par for the Curse course edits
//        ({text, id}, text null before the first publish), cached for a few seconds at the CDN
//   GET  /api/admin?view=level&name=front|back   the level editor: the same, read as the member
//   POST /api/admin {action:"level-publish", name, text, base, force}   publish a new version; live
//        for players on their next load (lib/levels-publish.js; owner and admins)
//
// Every data request is authorized by lib/storefront/auth.js (Supabase Auth + storefront.members)
// and then reads through the caller's own token, so Postgres RLS applies to everything returned.
// Only the owner-triggered sync uses the server's secret key, after authorization. The one read
// without a sign-in, view=course, uses the public key and can reach only storefront.published_level.
import { AuthError, authorize, supabaseBackend } from "../lib/storefront/auth.js";
import { loadCatalog } from "../lib/storefront/catalog.js";
import { postgrest, serviceDb, storefrontEnv } from "../lib/storefront/db.js";
import { ImportError, validateImport } from "../lib/storefront/importer.js";
import { buildDashboard } from "../lib/storefront/report.js";
import { devMode, json, PRIVATE_HEADERS, windowFrom } from "../lib/storefront/http.js";
import { steamEnabled } from "../lib/storefront/adapters.js";
import { runSource, syncCatalog } from "../lib/storefront/sync.js";
import { LevelError, publishLevel, readPublished } from "../lib/levels-publish.js";

// The dev backend lives in tools/, which is never deployed; building its path at runtime keeps the
// bundler from pulling it (or PGlite) into the production function.
async function backend(request) {
  if (devMode(request)) {
    const mod = await import(new URL(["..", "tools", "storefront", "dev-backend.mjs"].join("/"), import.meta.url).href);
    return mod.devBackend();
  }
  const cfg = storefrontEnv();
  if (!cfg) return null;
  return { mode: "supabase", cfg, ...supabaseBackend(cfg), anon: () => postgrest({ url: cfg.url, apikey: cfg.publishable }), service: () => serviceDb(cfg) };
}

function fail(err) {
  if (err instanceof AuthError || err instanceof LevelError) return json({ error: err.message }, err.status);
  console.error("admin: request failed", err?.name, err?.status ?? "");
  return json({ error: "request failed" }, 500);
}

export async function GET(request) {
  const url = new URL(request.url);
  const be = await backend(request);
  if (url.searchParams.get("view") === "config") {
    if (!be) return json({ mode: "unconfigured" });
    return json(be.mode === "dev" ? { mode: "dev", users: be.devUsers } : { mode: "supabase", supabaseUrl: be.cfg.url, publishableKey: be.cfg.publishable });
  }
  if (!be) return json({ error: "not configured" }, 503);
  if (url.searchParams.get("view") === "course") {
    // Every player's load asks this, so the CDN keeps it for 15 s (a publish reaches everyone within that).
    try {
      const r = await readPublished(be.anon(), url.searchParams.get("name"));
      return new Response(JSON.stringify({ text: r.text, id: r.id }), { headers: { ...PRIVATE_HEADERS, "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60" } });
    } catch (err) { return fail(err); }
  }
  try {
    const { db, role } = await authorize(request, be);
    if (url.searchParams.get("view") === "level") {
      const r = await readPublished(db, url.searchParams.get("name"));
      return json({ role, text: r.text, sha: r.id, at: r.at });
    }
    const win = windowFrom(url);
    if (!win) return json({ error: "bad date window" }, 400);
    const [rows, games, listings, sourceState, runs, imports] = await Promise.all([
      db.rpc("report", { p_from: win.from, p_to: win.to }),
      db.select("games", "select=slug,title"),
      db.select("listings", "select=id,game_slug,platform,kind,external_id,url,label,active"),
      db.select("source_state", "select=source,last_attempt_at,last_success_at,last_error,cursor"),
      db.select("sync_runs", "select=source,started_at,finished_at,status,rows_written,message&order=started_at.desc&limit=20"),
      db.select("imports", "select=source,filename,row_count,imported_at&order=imported_at.desc&limit=10"),
    ]);
    const dashboard = buildDashboard({ games, listings, rows, sourceState, trackingSince: be.trackingSince ?? loadCatalog().firstPartyTrackingSince, ...win });
    return json({ role, steamSyncEnabled: be.mode === "dev" ? false : steamEnabled(process.env), ...dashboard, runs, imports });
  } catch (err) { return fail(err); }
}

export async function POST(request) {
  const be = await backend(request);
  if (!be) return json({ error: "not configured" }, 503);
  try {
    const { db, role } = await authorize(request, be);
    const text = await request.text();
    if (text.length > 2_200_000) return json({ error: "request too large" }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }

    if (body.action === "import") {
      const listings = await db.select("listings", "select=id,platform,external_id&active=is.true");
      let v;
      try { v = validateImport({ source: body.source, text: body.csv, listings }); }
      catch (err) { if (err instanceof ImportError) return json({ error: "invalid file", details: err.errors }, 422); throw err; }
      const result = await db.rpc("import_metrics", { p_source: body.source, p_sha256: v.sha256, p_filename: String(body.filename ?? "").slice(0, 200), p_rows: v.rows });
      return json(result);
    }

    if (body.action === "sync") {
      if (role !== "owner") return json({ error: "only the owner can start a sync" }, 403);
      if (!["itch", "steam", "curseforge", "github"].includes(body.source)) return json({ error: "unknown source" }, 400);
      if (be.mode === "dev") return json({ error: "sync is not available with fixture data; run the adapter tests instead" }, 400);
      if (body.source === "steam" && !steamEnabled(process.env)) return json({ error: "Steam financial sync is not enabled on the server" }, 403);
      const service = be.service();
      await syncCatalog(service);
      const result = await runSource(body.source, { db: service, env: process.env });
      await db.insert("audit_log", { action: "sync", detail: { source: body.source, ok: result.ok } }).catch(() => {});
      return json(result, result.ok ? 200 : 502);
    }
    if (body.action === "level-publish") {
      return json(await publishLevel(db, { name: body.name, text: body.text, base: body.base, force: body.force === true }));
    }
    return json({ error: "unknown action" }, 400);
  } catch (err) { return fail(err); }
}
