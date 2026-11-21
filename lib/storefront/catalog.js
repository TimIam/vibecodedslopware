// Lookups over lib/storefront/catalog.json for the tracking endpoint and the sync job.
import fs from "node:fs";

let cached = null;
export function loadCatalog() {
  if (!cached) cached = JSON.parse(fs.readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));
  return cached;
}

export function allListings(catalog = loadCatalog()) {
  const out = [];
  for (const [slug, g] of Object.entries(catalog.games)) for (const l of g.listings) out.push({ game: slug, ...l });
  return out;
}

// Store page urls are compared without query string, fragment, trailing slash or case in the host.
export function normalizeUrl(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const pathname = u.pathname.replace(/\/+$/, "") || "/";
  return `https://${u.hostname.toLowerCase()}${pathname}`;
}

// A site download path. Older versions are served under /v/<slug>/<n>/..., which maps back to the
// live file the catalog lists only when that exact file is listed.
export function normalizePath(href, siteOrigin) {
  let u;
  try { u = new URL(href, siteOrigin); } catch { return null; }
  if (u.origin !== new URL(siteOrigin).origin) return null;
  let p;
  try { p = decodeURIComponent(u.pathname); } catch { return null; }
  const versioned = p.match(/^\/v\/[^/]+\/\d+(\/.*)$/);
  return versioned ? versioned[1] : p;
}

// -> { platform, kind, id, game } or null. Only catalog entries resolve.
export function resolveTarget(type, href, siteOrigin, catalog = loadCatalog()) {
  const listings = allListings(catalog);
  if (type === "site_download") {
    const p = normalizePath(href, siteOrigin);
    return (p && listings.find((l) => l.platform === "site" && l.kind === "site_asset" && l.id === p)) || null;
  }
  if (type === "outbound_click") {
    const n = normalizeUrl(href);
    return (n && listings.find((l) => l.platform !== "site" && l.url && normalizeUrl(l.url) === n)) || null;
  }
  return null;
}
