// What each platform can tell us, and through which official interface. The dashboard uses this to
// tell "zero" from "unknown": a metric a platform has no official source for is shown as
// unavailable, never as 0, and a supported metric with no successful refresh is shown as pending.
//
// Sources checked 2026-11-21 (see docs/storefront-analytics.md for the details and links).

export const COLUMNS = [
  { key: "site_download", label: "Site downloads", note: "Unique visitors per day who started a download served by vibecodedslopware.com" },
  { key: "outbound_click", label: "Store clicks", note: "Unique visitors per day who clicked through to a store page. A click is not a sale or a download." },
  { key: "sales_units", label: "Sales", note: "Paid units as reported by the store" },
  { key: "refund_units", label: "Refunds", note: "Units returned, as reported by the store" },
  { key: "free_claims", label: "Free claims", note: "Free copies claimed, where the store reports it" },
  { key: "store_downloads", label: "Store downloads", note: "Downloads counted by the store itself" },
  { key: "key_activations", label: "Key activations", note: "Steam: units activated from keys (gross_units_activated)" },
  { key: "revenue", label: "Revenue", note: "Per currency, never converted or summed across currencies" },
];

const OFFICIAL = {
  itch: "https://itch.io/docs/api/serverside",
  steam: "https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService",
  curseforge: "https://docs.curseforge.com/rest-api/",
  github: "https://docs.github.com/en/rest/releases/releases",
};

// support: "api" (official API, synced), "first_party" (our own tracking), "import" (validated manual
// import of a portal export), or a string explaining why it is unavailable.
export const PLATFORMS = {
  site: {
    label: "vibecodedslopware.com",
    source: "first_party",
    metrics: { site_download: "first_party" },
  },
  itch: {
    label: "itch.io",
    source: "itch",
    docs: OFFICIAL.itch,
    basis: "cumulative",
    metrics: {
      outbound_click: "first_party",
      sales_units: "api", // purchases_count
      store_downloads: "api", // downloads_count (includes free downloads)
      views: "api",
      earnings: "api", // earnings[], per currency; itch does not document whether fees are deducted
      free_claims: "itch.io's API has no free-claim counter; free downloads are inside downloads_count",
      refund_units: "Not in itch.io's API",
    },
  },
  steam: {
    label: "Steam",
    source: "steam",
    docs: OFFICIAL.steam,
    basis: "day",
    metrics: {
      outbound_click: "first_party",
      sales_units: "api", // gross_units_sold
      refund_units: "api", // gross_units_returned
      key_activations: "api", // gross_units_activated
      revenue_gross: "api", // gross_sales_usd, USD only
      revenue_net: "api", // net_sales_usd, USD only
      store_downloads: "Steam's Partner API has no download or install counts",
      free_claims: "Steam's Partner API has no free-license counter",
    },
  },
  epic: {
    label: "Epic Games Store",
    source: "epic_import",
    basis: "day",
    metrics: {
      outbound_click: "first_party",
      sales_units: "import",
      refund_units: "import",
      free_claims: "import",
      revenue_gross: "import",
      revenue_net: "import",
      store_downloads: "Epic publishes no reporting API; only what the Developer Portal shows can be imported",
    },
  },
  curseforge: {
    label: "CurseForge",
    source: "curseforge",
    docs: OFFICIAL.curseforge,
    basis: "cumulative",
    metrics: {
      outbound_click: "first_party",
      store_downloads: "api", // Mod.downloadCount
      sales_units: "CurseForge addons are free; there are no sales",
      free_claims: "Not in CurseForge's API",
    },
  },
  github: {
    label: "GitHub Releases",
    source: "github",
    docs: OFFICIAL.github,
    basis: "cumulative",
    metrics: {
      outbound_click: "first_party",
      store_downloads: "api", // sum of release asset download_count
    },
  },
};

export const REVENUE_METRICS = ["revenue_gross", "revenue_net", "earnings"];
export const REVENUE_LABELS = { revenue_gross: "gross", revenue_net: "net", earnings: "earnings (fee treatment not documented by the store)" };

// Support for one (platform, column). Revenue folds the three revenue metrics together.
export function support(platform, column) {
  const p = PLATFORMS[platform];
  if (!p) return "Unknown platform";
  if (column === "revenue") {
    const s = REVENUE_METRICS.map((m) => p.metrics[m]).filter((v) => v === "api" || v === "import");
    if (s.length) return s[0];
    return platform === "site" ? "Nothing is sold on the site" : "No official revenue source for this platform";
  }
  if (column === "site_download") return platform === "site" ? "first_party" : "Not a site-served file";
  if (column === "outbound_click" && platform === "site") return "Not a store page";
  return p.metrics[column] ?? "Not reported by this platform";
}
