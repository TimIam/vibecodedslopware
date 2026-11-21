// GET /api/storefront-sync — scheduled refresh (Vercel Cron sends Authorization: Bearer $CRON_SECRET).
//
// Upserts the catalog, folds old first-party visitor hashes into daily counts, then runs every
// store adapter whose credentials are configured. Steam runs only with STEAM_FINANCIAL_SYNC_ENABLED=1.
// Not scheduled yet: add the cron entry in docs/storefront-analytics.md when this is deployed.
import crypto from "node:crypto";
import { serviceDb, storefrontEnv } from "../lib/storefront/db.js";
import { json } from "../lib/storefront/http.js";
import { configuredSources, runSource, syncCatalog } from "../lib/storefront/sync.js";

export function cronAuthorized(request, secret) {
  if (!secret || secret.length < 32) return false;
  const given = Buffer.from(request.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

export async function GET(request) {
  if (!cronAuthorized(request, process.env.CRON_SECRET)) return json({ error: "not authorized" }, 401);
  const cfg = storefrontEnv();
  if (!cfg?.secret) return json({ error: "not configured" }, 503);
  const db = serviceDb(cfg);
  await syncCatalog(db);
  const rolled = await db.rpc("rollup_first_party", { p_keep_days: 2 });
  const results = [];
  for (const source of configuredSources(process.env)) results.push(await runSource(source, { db, env: process.env }));
  return json({ rolledUp: rolled, results }, results.every((r) => r.ok) ? 200 : 502);
}
