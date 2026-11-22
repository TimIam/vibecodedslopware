// Runs one store adapter end to end against the service handle:
//   sync_catalog -> begin_run -> adapter -> upsert_metrics (batches) -> finish_run(cursor)
// A failure finishes the run as an error with a redacted message and leaves the cursor where it
// was, so the next run repeats the same work (upserts make that harmless).
import { ADAPTERS, SourceError, redact, steamEnabled } from "./adapters.js";
import { allListings, loadCatalog } from "./catalog.js";

export const SECRET_ENV = ["ITCH_API_KEY", "STEAM_FINANCIAL_API_KEY", "CURSEFORGE_API_KEY", "GITHUB_RELEASES_TOKEN", "STOREFRONT_SUPABASE_SECRET_KEY"];

export function configuredSources(env) {
  const out = [];
  if (env.ITCH_API_KEY) out.push("itch");
  if (steamEnabled(env)) out.push("steam");
  if (env.CURSEFORGE_API_KEY) out.push("curseforge");
  if (allListings().some((l) => l.platform === "github")) out.push("github");
  return out;
}

export async function syncCatalog(db, catalog = loadCatalog()) {
  return db.rpc("sync_catalog", { p_catalog: catalog });
}

export async function runSource(source, { db, env, fetchImpl = fetch, now = new Date(), catalog = loadCatalog() }) {
  const adapter = ADAPTERS[source];
  if (!adapter) throw new Error(`unknown source ${source}`);
  const secrets = SECRET_ENV.map((k) => env[k]);
  const state = await db.select("source_state", `select=cursor&source=eq.${source}`);
  const cursor = state?.[0]?.cursor ?? {};
  const run = await db.rpc("begin_run", { p_source: source });
  try {
    const result = await adapter({ env, fetchImpl, listings: allListings(catalog), cursor, now });
    let written = 0;
    for (let i = 0; i < result.rows.length; i += 500) {
      written += await db.rpc("upsert_metrics", { p_run: run, p_rows: result.rows.slice(i, i + 500) });
    }
    await db.rpc("finish_run", { p_run: run, p_ok: true, p_message: redact(result.note ?? `ok: ${result.rows.length} rows read`, secrets), p_cursor: result.cursor ?? null });
    return { source, ok: true, rows: result.rows.length, written };
  } catch (err) {
    const message = redact(err instanceof SourceError ? err.message : `${source}: sync failed (${err?.name ?? "Error"})`, secrets);
    await db.rpc("finish_run", { p_run: run, p_ok: false, p_message: message, p_cursor: null }).catch(() => {});
    return { source, ok: false, error: message };
  }
}
