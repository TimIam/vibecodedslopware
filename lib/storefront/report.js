// Turns database rows into the dashboard: per game, per platform, one cell per column.
//
// Every cell says what it knows and how:
//   value       a number we can stand behind for the window (or "lifetime as of" for cumulative)
//   partial     a number, but the window reaches outside what the source has covered
//   pending     the source is supported but has never refreshed (or nothing was imported)
//   unavailable no official source for this number on this platform (reason given)
// A missing number is never shown as 0. Zero only appears when a source that reports complete
// days (Steam, or our own tracking once live) covered the window and saw nothing.
import { COLUMNS, PLATFORMS, REVENUE_METRICS, support } from "./capabilities.js";

const COLUMN_METRICS = {
  site_download: ["site_download"], outbound_click: ["outbound_click"], sales_units: ["sales_units"],
  refund_units: ["refund_units"], free_claims: ["free_claims"], store_downloads: ["store_downloads"],
  key_activations: ["key_activations"], revenue: REVENUE_METRICS,
};

export function buildDashboard({ games, listings, rows, sourceState, trackingSince, from, to, now = new Date() }) {
  const state = Object.fromEntries((sourceState ?? []).map((s) => [s.source, s]));
  const byListing = new Map();
  for (const r of rows) {
    if (!byListing.has(r.listing_id)) byListing.set(r.listing_id, []);
    byListing.get(r.listing_id).push(r);
  }
  const fixture = rows.some((r) => String(r.sources ?? "").includes("fixture")) || !!state.fixture?.last_success_at;

  const out = [];
  for (const g of [...games].sort((a, b) => a.title.localeCompare(b.title))) {
    const mine = listings.filter((l) => l.game_slug === g.slug && l.active);
    const platforms = [];
    for (const platform of Object.keys(PLATFORMS)) {
      const ls = mine.filter((l) => l.platform === platform);
      if (!ls.length) continue;
      const cells = {};
      for (const col of COLUMNS) cells[col.key] = cell({ platform, col: col.key, ls, byListing, state, trackingSince, from, to });
      platforms.push({
        platform, label: PLATFORMS[platform].label,
        listings: ls.map((l) => ({ id: l.id, kind: l.kind, external_id: l.external_id, label: l.label, url: l.url })),
        cells,
      });
    }
    out.push({ slug: g.slug, title: g.title, platforms });
  }

  const sources = Object.entries(PLATFORMS).filter(([p]) => p !== "site").map(([p, info]) => ({
    platform: p, label: info.label, source: info.source, docs: info.docs ?? null,
    lastSuccessAt: state[info.source]?.last_success_at ?? null,
    lastAttemptAt: state[info.source]?.last_attempt_at ?? null,
    lastError: state[info.source]?.last_error ?? null,
    coveredTo: state[info.source]?.cursor?.covered_to ?? null,
  }));
  sources.unshift({ platform: "site", label: "First-party tracking", source: "first_party", lastSuccessAt: null, trackingSince: trackingSince ?? null });

  return { window: { from, to }, generatedAt: now.toISOString(), fixture, columns: COLUMNS, games: out, sources };
}

function cell({ platform, col, ls, byListing, state, trackingSince, from, to }) {
  const s = support(platform, col);
  if (s !== "api" && s !== "import" && s !== "first_party") return { state: "unavailable", reason: s };
  const metrics = COLUMN_METRICS[col];
  const rows = ls.flatMap((l) => (byListing.get(l.id) ?? []).filter((r) => metrics.includes(r.metric)));

  if (s === "first_party") {
    const targets = col === "outbound_click" ? ls.filter((l) => l.url) : ls;
    if (!targets.length) return { state: "unavailable", reason: "No store page url in the catalog to count clicks on" };
    if (!trackingSince) return { state: "pending", reason: "First-party tracking is not live yet" };
    const value = rows.reduce((n, r) => n + Number(r.value), 0);
    const partial = from < trackingSince;
    return { state: partial ? "partial" : "value", value, basis: "day", source: "first_party", coveredFrom: trackingSince,
      reason: partial ? `Tracking started ${trackingSince}; earlier days are unknown` : null };
  }

  const info = PLATFORMS[platform];
  const st = state[info.source];
  if (!st?.last_success_at) return { state: "pending", reason: s === "import" ? "Nothing imported yet" : "Not refreshed yet" };
  const refreshedAt = st.last_success_at;

  if (col === "revenue") {
    if (!rows.length) return unknownOrZero(info, st, from, to, refreshedAt, s, true);
    const amounts = rows.map((r) => ({ metric: r.metric, currency: r.currency, value: Number(r.value), basis: r.basis, asOf: r.last_day }))
      .sort((a, b) => (a.metric + a.currency).localeCompare(b.metric + b.currency));
    return withCoverage({ state: "value", amounts, basis: rows[0].basis, source: info.source, refreshedAt, asOf: maxDay(rows) }, info, st, ls, rows, from, to, s);
  }
  if (!rows.length) return unknownOrZero(info, st, from, to, refreshedAt, s, false);
  const value = rows.reduce((n, r) => n + Number(r.value), 0);
  return withCoverage({ state: "value", value, basis: rows[0].basis, source: info.source, refreshedAt, asOf: maxDay(rows), daysWithData: sumDays(rows) }, info, st, ls, rows, from, to, s);
}

// Steam reports complete days, so a covered window with no rows is a real zero. Everything else
// with no rows is unknown.
function unknownOrZero(info, st, from, to, refreshedAt, s, revenue) {
  const coveredTo = st.cursor?.covered_to;
  if (info.basis === "day" && s === "api" && coveredTo && to <= coveredTo) {
    return revenue ? { state: "value", amounts: [], zero: true, basis: "day", source: info.source, refreshedAt }
      : { state: "value", value: 0, basis: "day", source: info.source, refreshedAt };
  }
  return { state: "pending", reason: s === "import" ? "No imported rows for this window" : "Source returned nothing for this listing", refreshedAt };
}

function withCoverage(c, info, st, ls, rows, from, to, s) {
  if (c.basis === "cumulative") {
    const covered = new Set(rows.map((r) => r.listing_id));
    if (covered.size < ls.length) return { ...c, state: "partial", reason: `${ls.length - covered.size} of ${ls.length} listings have no data` };
    return { ...c, reason: "Lifetime total as reported on the as-of date; not limited to the window" };
  }
  if (s === "import") return { ...c, state: "partial", reason: "Only the imported days are counted; other days are unknown" };
  const coveredTo = st.cursor?.covered_to;
  if (coveredTo && to > coveredTo) return { ...c, state: "partial", reason: `Source covers through ${coveredTo}` };
  return c;
}

const maxDay = (rows) => rows.reduce((m, r) => (r.last_day > m ? r.last_day : m), "");
const sumDays = (rows) => Math.max(0, ...rows.map((r) => r.days_with_data ?? 0));
