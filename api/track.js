// POST /api/track — first-party counting of site downloads and outbound store clicks.
//
// Sent by /track.js as a beacon: {"t":"d"|"o","u":"<href>"}. Always answers 204, counted or not, so
// it tells a caller nothing. Privacy-minimal by construction:
//   * nothing is counted when the browser sends Sec-GPC: 1 or DNT: 1, or for obvious bots
//   * only files and store pages listed in lib/storefront/catalog.json count
//   * no address, user agent, referrer or cookie is stored. The visitor key is an HMAC of
//     (day, address, user agent) under STOREFRONT_TRACK_SECRET; it exists only to count a visitor
//     once per file or store page per day, and is deleted two days later (rollup_first_party)
// Missing configuration means nothing is stored.
import crypto from "node:crypto";
import { resolveTarget } from "../lib/storefront/catalog.js";
import { serviceDb, storefrontEnv } from "../lib/storefront/db.js";

const BOT = /bot|crawl|spider|slurp|preview|fetch|curl|wget|python|httpclient|headless|lighthouse|monitor|scan/i;
const ORIGINS = new Set(["https://vibecodedslopware.com", "https://www.vibecodedslopware.com"]);
const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export function visitorHash(secret, day, ip, ua) {
  return crypto.createHmac("sha256", secret).update(`${day}\n${ip}\n${ua}`).digest("base64url");
}

export function siteOrigin(request, env = process.env) {
  const origin = request.headers.get("origin");
  if (origin && ORIGINS.has(origin)) return origin;
  if (origin && !env.VERCEL && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

// Returns what would be recorded, or null. Exported for tests.
export function classify(request, text, env = process.env, now = new Date()) {
  if (request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1") return null;
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return null;
  const origin = siteOrigin(request, env);
  if (!origin || !env.STOREFRONT_TRACK_SECRET || env.STOREFRONT_TRACK_SECRET.length < 32) return null;
  if (text.length > 2048) return null;
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  const type = body?.t === "d" ? "site_download" : body?.t === "o" ? "outbound_click" : null;
  if (!type || typeof body.u !== "string" || body.u.length > 1500) return null;
  const target = resolveTarget(type, body.u, origin);
  if (!target) return null;
  const ip = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0].trim();
  if (!ip) return null;
  const day = now.toISOString().slice(0, 10);
  return { platform: target.platform, kind: target.kind, external_id: target.id, event: type, day,
    visitor_hash: visitorHash(env.STOREFRONT_TRACK_SECRET, day, ip, ua) };
}

export async function POST(request, { env = process.env, fetchImpl = fetch } = {}) {
  const cfg = storefrontEnv(env);
  let text = "";
  try { text = await request.text(); } catch { return done(); }
  const hit = classify(request, text, env);
  if (!hit || !cfg?.secret) return done();
  try {
    await serviceDb(cfg, fetchImpl).rpc("record_event", {
      p_platform: hit.platform, p_kind: hit.kind, p_external_id: hit.external_id,
      p_event: hit.event, p_day: hit.day, p_visitor_hash: hit.visitor_hash,
    });
  } catch (err) {
    console.error("track: not recorded", err?.status ?? err?.name);
  }
  return done();
}
