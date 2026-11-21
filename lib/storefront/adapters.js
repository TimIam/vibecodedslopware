// Store adapters. Each one reads a platform's documented API and returns metric rows
//   { platform, kind, external_id, metric, basis, day, currency, value }
// for listings the catalog maps. Nothing is guessed: ids the catalog doesn't list are reported back
// as unmapped, and fields whose meaning the docs don't pin down are left out or validated.
//
// Credentials come in through `env`, are only ever put in request headers or (Steam, as Valve
// requires) the query string, and never appear in returned messages: every error is built here
// from a status code, and redact() strips the key from anything else as a last line of defense.

export class SourceError extends Error {}

const today = (now) => now.toISOString().slice(0, 10);

export function redact(text, secrets) {
  let s = String(text ?? "");
  for (const k of secrets) if (k && k.length >= 6) s = s.split(k).join("[redacted]");
  return s.slice(0, 500);
}

async function getJson(fetchImpl, url, headers, label) {
  let res;
  try { res = await fetchImpl(url, { headers }); } catch { throw new SourceError(`${label}: network error`); }
  if (!res.ok) throw new SourceError(`${label}: HTTP ${res.status}`);
  try { return await res.json(); } catch { throw new SourceError(`${label}: response was not JSON`); }
}

const mapped = (listings, platform, kind) => new Map(listings.filter((l) => l.platform === platform && l.kind === kind).map((l) => [String(l.id), l]));

// ---------------------------------------------------------------------------------------------
// itch.io — GET https://api.itch.io/profile/games, Authorization: Bearer <API key>.
// Lifetime counters only (no history), so rows are cumulative snapshots dated today.
// earnings[].amount is in minor units by every example in the docs, but the docs don't say so;
// each amount is checked against its amount_formatted and skipped if they disagree.
export async function itch({ env, fetchImpl, listings, now }) {
  const key = env.ITCH_API_KEY;
  if (!key) throw new SourceError("itch: ITCH_API_KEY is not set");
  const body = await getJson(fetchImpl, "https://api.itch.io/profile/games", { authorization: `Bearer ${key}` }, "itch");
  if (!Array.isArray(body?.games)) throw new SourceError("itch: unexpected response shape");
  const map = mapped(listings, "itch", "itch_game");
  const rows = [], unmapped = [], skipped = [];
  const day = today(now);
  for (const g of body.games) {
    const l = map.get(String(g.id));
    if (!l) { unmapped.push(String(g.id)); continue; }
    const base = { platform: "itch", kind: "itch_game", external_id: String(g.id), basis: "cumulative", day, currency: "" };
    for (const [field, metric] of [["downloads_count", "store_downloads"], ["purchases_count", "sales_units"], ["views_count", "views"]]) {
      if (Number.isInteger(g[field]) && g[field] >= 0) rows.push({ ...base, metric, value: g[field] });
    }
    for (const e of Array.isArray(g.earnings) ? g.earnings : []) {
      const currency = String(e.currency ?? "").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency) || !Number.isInteger(e.amount) || e.amount < 0 || !formattedMatches(e.amount_formatted, e.amount)) {
        skipped.push(`${g.id}:${currency || "?"}`);
        continue;
      }
      rows.push({ ...base, metric: "earnings", currency, value: e.amount / 100 });
    }
  }
  return { rows, note: note({ unmapped, skipped: skipped.length ? `earnings not matching amount_formatted: ${skipped.join(",")}` : null }) };
}

// "$50.47" or "50,47 €" must equal amount/100.
export function formattedMatches(formatted, amount) {
  const digits = String(formatted ?? "").replace(/[^\d]/g, "");
  return digits.length > 0 && Number(digits) === amount;
}

// ---------------------------------------------------------------------------------------------
// Steam — IPartnerFinancialsService on https://partner.steam-api.com, with a Financial API Group key.
// Separately authorized: runs only when STEAM_FINANCIAL_SYNC_ENABLED=1 as well as the key being set.
//   GetChangedDatesForPartner(highwatermark) -> dates whose data changed, new highwatermark
//   GetDetailedSales(date, highwatermark_id) -> pages until max_id == the id sent
// A changed date is re-fetched in full and replaces what we had, including zeros for mapped apps
// that no longer have rows, so reruns are idempotent. Work is resumable: pending dates and the
// next highwatermark are kept in the cursor and the highwatermark only advances once all are done.
// Dates are Pacific Time, as Steam reports them. Revenue is USD (the only totals Steam gives).
const STEAM = "https://partner.steam-api.com/IPartnerFinancialsService";

export function steamEnabled(env) {
  return env.STEAM_FINANCIAL_SYNC_ENABLED === "1" && !!env.STEAM_FINANCIAL_API_KEY;
}

export async function steam({ env, fetchImpl, listings, cursor = {}, now, maxDates = 30 }) {
  if (env.STEAM_FINANCIAL_SYNC_ENABLED !== "1") throw new SourceError("steam: not enabled (STEAM_FINANCIAL_SYNC_ENABLED is not 1)");
  const key = env.STEAM_FINANCIAL_API_KEY;
  if (!key) throw new SourceError("steam: STEAM_FINANCIAL_API_KEY is not set");
  const q = (params) => new URLSearchParams({ key, ...params }).toString();
  const apps = mapped(listings, "steam", "steam_app");

  let pending = Array.isArray(cursor.pending) ? cursor.pending : [];
  let next = cursor.next_highwatermark ?? null;
  const hwm = String(cursor.highwatermark ?? "0");
  if (!pending.length) {
    const r = await getJson(fetchImpl, `${STEAM}/GetChangedDatesForPartner/v001/?${q({ highwatermark: hwm })}`, {}, "steam GetChangedDatesForPartner");
    const dates = r?.response?.dates;
    if (!Array.isArray(dates)) throw new SourceError("steam: unexpected GetChangedDatesForPartner response");
    pending = dates.map(normalizeSteamDate).filter(Boolean).sort();
    next = String(r.response.result_highwatermark ?? hwm);
  }

  const rows = [], unmapped = new Set();
  const batch = pending.slice(0, maxDates);
  for (const date of batch) {
    const totals = new Map(); // appid -> metric sums
    let id = "0";
    for (let page = 0; page < 1000; page++) {
      const r = await getJson(fetchImpl, `${STEAM}/GetDetailedSales/v001/?${q({ date, highwatermark_id: id })}`, {}, "steam GetDetailedSales");
      const res = r?.response;
      if (!res) throw new SourceError("steam: unexpected GetDetailedSales response");
      for (const row of res.results ?? []) {
        const app = String(row.primary_appid || row.appid || "");
        if (!apps.has(app)) { if (app && app !== "0") unmapped.add(app); continue; }
        const t = totals.get(app) ?? { sales_units: 0, refund_units: 0, key_activations: 0, revenue_gross: 0, revenue_net: 0 };
        // Units only from package rows; microtransaction rows carry revenue but no copies of the game.
        if (Number(row.packageid) > 0) {
          t.sales_units += num(row.gross_units_sold);
          t.refund_units += num(row.gross_units_returned);
          t.key_activations += num(row.gross_units_activated);
        }
        t.revenue_gross += num(row.gross_sales_usd);
        t.revenue_net += num(row.net_sales_usd);
        totals.set(app, t);
      }
      const maxId = String(res.max_id ?? id);
      if (maxId === id) break;
      id = maxId;
    }
    for (const app of apps.keys()) {
      const t = totals.get(app) ?? { sales_units: 0, refund_units: 0, key_activations: 0, revenue_gross: 0, revenue_net: 0 };
      for (const [metric, value] of Object.entries(t)) {
        rows.push({ platform: "steam", kind: "steam_app", external_id: app, metric, basis: "day", day: date,
          currency: metric.startsWith("revenue") ? "USD" : "", value: round4(value) });
      }
    }
  }
  const rest = pending.slice(batch.length);
  const done = rest.length === 0;
  const newCursor = done
    ? { highwatermark: next, pending: [], next_highwatermark: null, covered_to: pacificYesterday(now) }
    : { highwatermark: hwm, pending: rest, next_highwatermark: next, covered_to: cursor.covered_to ?? null };
  return { rows, cursor: newCursor, note: note({ unmapped: [...unmapped], more: done ? null : `${rest.length} dates left for the next run` }) };
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round4 = (n) => Math.round(n * 10000) / 10000;

export function normalizeSteamDate(d) {
  const m = String(d).match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function pacificYesterday(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${parts}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// CurseForge — GET https://api.curseforge.com/v1/mods/{modId}, header x-api-key. Mod.downloadCount.
export async function curseforge({ env, fetchImpl, listings, now }) {
  const key = env.CURSEFORGE_API_KEY;
  if (!key) throw new SourceError("curseforge: CURSEFORGE_API_KEY is not set");
  const rows = [];
  for (const id of mapped(listings, "curseforge", "curseforge_project").keys()) {
    if (!/^\d+$/.test(id)) continue;
    const r = await getJson(fetchImpl, `https://api.curseforge.com/v1/mods/${id}`, { "x-api-key": key, accept: "application/json" }, `curseforge mod ${id}`);
    const n = r?.data?.downloadCount;
    if (typeof n !== "number" || n < 0) throw new SourceError(`curseforge mod ${id}: no downloadCount`);
    rows.push({ platform: "curseforge", kind: "curseforge_project", external_id: id, metric: "store_downloads", basis: "cumulative", day: today(now), currency: "", value: Math.floor(n) });
  }
  return { rows, note: null };
}

// ---------------------------------------------------------------------------------------------
// GitHub Releases — GET /repos/{owner}/{repo}/releases (paged), summing assets' download_count.
// Catalog id "owner/repo#Prefix-" counts the assets whose name starts with Prefix-.
export async function github({ env, fetchImpl, listings, now }) {
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "storefront-analytics" };
  if (env.GITHUB_RELEASES_TOKEN) headers.authorization = `Bearer ${env.GITHUB_RELEASES_TOKEN}`;
  const rows = [], byRepo = new Map();
  for (const id of mapped(listings, "github", "github_asset").keys()) {
    const m = id.match(/^([\w.-]+\/[\w.-]+)#(.+)$/);
    if (!m) continue;
    if (!byRepo.has(m[1])) byRepo.set(m[1], []);
    byRepo.get(m[1]).push({ id, prefix: m[2] });
  }
  for (const [repo, wanted] of byRepo) {
    const assets = [];
    for (let page = 1; page <= 20; page++) {
      const r = await getJson(fetchImpl, `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, headers, `github ${repo}`);
      if (!Array.isArray(r)) throw new SourceError(`github ${repo}: unexpected response`);
      for (const rel of r) for (const a of rel.assets ?? []) assets.push(a);
      if (r.length < 100) break;
    }
    for (const w of wanted) {
      const total = assets.filter((a) => String(a.name).startsWith(w.prefix)).reduce((s, a) => s + num(a.download_count), 0);
      rows.push({ platform: "github", kind: "github_asset", external_id: w.id, metric: "store_downloads", basis: "cumulative", day: today(now), currency: "", value: total });
    }
  }
  return { rows, note: null };
}

function note({ unmapped = [], skipped = null, more = null }) {
  const parts = [];
  if (unmapped.length) parts.push(`unmapped ids: ${unmapped.slice(0, 20).join(",")}`);
  if (skipped) parts.push(skipped);
  if (more) parts.push(more);
  return parts.join("; ") || null;
}

export const ADAPTERS = { itch, steam, curseforge, github };
