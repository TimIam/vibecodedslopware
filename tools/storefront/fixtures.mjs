// Mock store responses for tests and local development. Shapes follow the official docs
// (itch.io server-side API, Steam IPartnerFinancialsService, CurseForge REST, GitHub Releases).
// Every id here is made up and every listing is attached to the "sample-*" games, so fixture
// numbers can never sit next to a real game's name.

export const SAMPLE_GAMES = {
  "sample-game": {
    title: "Sample Game (fixture)",
    listings: [
      { platform: "site", kind: "site_asset", id: "/sample-game/SampleGame-1.0.0.zip", label: "SampleGame-1.0.0.zip" },
      { platform: "itch", kind: "itch_game", id: "900001", url: "https://example-studio.itch.io/sample-game", label: "itch.io (fixture)", manual: true },
      { platform: "steam", kind: "steam_app", id: "3900001", url: "https://store.steampowered.com/app/3900001/Sample_Game", label: "Steam (fixture)", manual: true },
      { platform: "epic", kind: "epic_product", id: "fixture-epic-offer-1", url: "https://store.epicgames.com/p/sample-game", label: "Epic (fixture)", manual: true },
    ],
  },
  "sample-free-game": {
    title: "Sample Free Game (fixture)",
    listings: [
      { platform: "itch", kind: "itch_game", id: "900002", url: "https://example-studio.itch.io/sample-free-game", label: "itch.io (fixture)", manual: true },
      { platform: "curseforge", kind: "curseforge_project", id: "9000001", label: "CurseForge (fixture)", manual: true },
      { platform: "github", kind: "github_asset", id: "example/sample-free-game#SampleFree-", label: "GitHub release assets (fixture)", manual: true },
    ],
  },
};

export function withSamples(catalog) {
  return { ...catalog, firstPartyTrackingSince: catalog.firstPartyTrackingSince, games: { ...catalog.games, ...SAMPLE_GAMES } };
}

const iso = (d) => d.toISOString().slice(0, 10);
export function daysAgo(now, n) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - n); return iso(d); }

export const ITCH_GAMES = {
  games: [
    { id: 900001, title: "Sample Game", type: "default", classification: "game", published: true, min_price: 499,
      downloads_count: 1520, purchases_count: 212, views_count: 18400,
      earnings: [{ currency: "USD", amount_formatted: "$847.11", amount: 84711 }, { currency: "EUR", amount_formatted: "120,50 €", amount: 12050 }] },
    { id: 900002, title: "Sample Free Game", type: "default", classification: "game", published: true, min_price: 0,
      downloads_count: 640, purchases_count: 0, views_count: 5100, earnings: [] },
    { id: 900099, title: "Not in the catalog", downloads_count: 3, purchases_count: 0, views_count: 10, earnings: [] },
  ],
};

// Steam: three changed dates; the middle one comes in two pages.
export function steamDates(now) { return [daysAgo(now, 4), daysAgo(now, 3), daysAgo(now, 2)]; }
const salesRow = (date, over) => ({
  partnerid: 1, date: date.replace(/-/g, "/"), line_item_type: "Package", packageid: 4900001, bundleid: 0, appid: 3900001, primary_appid: 3900001,
  game_item_id: 0, package_sale_type: "Steam", platform: "Windows", country_code: "US", base_price: "999", sale_price: "999", currency: "USD",
  gross_units_sold: 3, gross_units_returned: 0, gross_units_activated: 0, net_units_sold: 3,
  gross_sales_usd: "29.9700", gross_returns_usd: "0.0000", net_tax_usd: "0.0000", net_sales_usd: "29.9700", ...over,
});
export function steamSales(now) {
  const [a, b, c] = steamDates(now);
  return {
    [a]: [{ max_id: "10", results: [salesRow(a, {}), salesRow(a, { country_code: "DE", currency: "EUR", gross_units_sold: 1, gross_sales_usd: "9.4000", net_sales_usd: "7.9000" })] }, { max_id: "10", results: [] }],
    [b]: [
      { max_id: "20", results: [salesRow(b, { gross_units_sold: 5, gross_units_returned: 1, gross_sales_usd: "49.9500", gross_returns_usd: "9.9900", net_sales_usd: "39.9600" })] },
      { max_id: "21", results: [salesRow(b, { packageid: 0, line_item_type: "MicroTxn", game_item_id: 7, gross_units_sold: 2, gross_sales_usd: "4.0000", net_sales_usd: "4.0000" }),
        salesRow(b, { appid: 3999999, primary_appid: 3999999 })] },
      { max_id: "21", results: [] },
    ],
    [c]: [{ max_id: "30", results: [salesRow(c, { gross_units_sold: 0, gross_units_activated: 4, gross_sales_usd: "0.0000", net_sales_usd: "0.0000" })] }, { max_id: "30", results: [] }],
  };
}

export function fixtureFetch(now, { log = [] } = {}) {
  const sales = steamSales(now);
  return async (url, init = {}) => {
    const u = new URL(url);
    log.push({ url: `${u.origin}${u.pathname}`, query: Object.fromEntries(u.searchParams), headers: init.headers ?? {} });
    const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (u.href === "https://api.itch.io/profile/games") return ok(ITCH_GAMES);
    if (u.pathname === "/IPartnerFinancialsService/GetChangedDatesForPartner/v001/") {
      const hwm = u.searchParams.get("highwatermark");
      return ok({ response: hwm === "0" ? { dates: steamDates(now).map((d) => d.replace(/-/g, "/")), result_highwatermark: "4242" } : { dates: [], result_highwatermark: hwm } });
    }
    if (u.pathname === "/IPartnerFinancialsService/GetDetailedSales/v001/") {
      const pages = sales[u.searchParams.get("date")] ?? [{ max_id: "0", results: [] }];
      const ids = ["0", ...pages.map((p) => p.max_id)];
      const i = Math.max(0, ids.indexOf(u.searchParams.get("highwatermark_id")));
      return ok({ response: pages[Math.min(i, pages.length - 1)] });
    }
    if (u.href === "https://api.curseforge.com/v1/mods/9000001") return ok({ data: { id: 9000001, name: "Sample", downloadCount: 18233.0 } });
    if (u.pathname === "/repos/example/sample-free-game/releases") {
      return ok([{ tag_name: "v1", assets: [{ name: "SampleFree-1.0.zip", download_count: 40 }, { name: "Other.zip", download_count: 999 }] },
        { tag_name: "v2", assets: [{ name: "SampleFree-2.0.zip", download_count: 25 }] }]);
    }
    return new Response("not found", { status: 404 });
  };
}

export const FIXTURE_ENV = {
  ITCH_API_KEY: "fixture-itch-key-0001",
  STEAM_FINANCIAL_API_KEY: "fixture-steam-financial-key-0001",
  STEAM_FINANCIAL_SYNC_ENABLED: "1",
  CURSEFORGE_API_KEY: "fixture-curseforge-key-0001",
};

export function epicCsv(now) {
  return [
    "platform,external_id,date,basis,metric,currency,value",
    `epic,fixture-epic-offer-1,${daysAgo(now, 6)},day,sales_units,,4`,
    `epic,fixture-epic-offer-1,${daysAgo(now, 6)},day,revenue_gross,USD,39.96`,
    `epic,fixture-epic-offer-1,${daysAgo(now, 5)},day,free_claims,,1200`,
  ].join("\n") + "\n";
}
