// Response helpers shared by the storefront endpoints. Admin responses are never cached or indexed.
export const PRIVATE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: PRIVATE_HEADERS });

export const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function windowFrom(url, now = new Date()) {
  const to = url.searchParams.get("to") || now.toISOString().slice(0, 10);
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 29);
  const from = url.searchParams.get("from") || d.toISOString().slice(0, 10);
  if (!isDay(from) || !isDay(to) || from > to) return null;
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 3660) return null;
  return { from, to };
}

// Local development with the PGlite backend and fixture data. Never on Vercel, never for a
// non-localhost request, and only when explicitly asked for.
export function devMode(request, env = process.env) {
  if (env.STOREFRONT_DEV !== "pglite" || env.VERCEL || env.VERCEL_ENV) return false;
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
