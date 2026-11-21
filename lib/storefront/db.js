// Talking to the storefront schema through Supabase's REST API (PostgREST).
//
// Two kinds of handle, and the difference matters:
//   userDb(token)  the signed-in person's own access token. Postgres sees role `authenticated` with
//                  their user id, so every read and write goes through the RLS policies.
//   serviceDb()    the project's secret key, server-only. Used for first-party events and API syncs,
//                  never for anything a request from the dashboard asks to read.
//
// Env (Vercel project settings; never sent to a browser):
//   STOREFRONT_SUPABASE_URL              https://<ref>.supabase.co
//   STOREFRONT_SUPABASE_PUBLISHABLE_KEY  publishable (anon) key; public by design
//   STOREFRONT_SUPABASE_SECRET_KEY       secret / service_role key; server only

export class DbError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export function storefrontEnv(env = process.env) {
  const url = env.STOREFRONT_SUPABASE_URL, publishable = env.STOREFRONT_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !publishable) return null;
  return { url, publishable, secret: env.STOREFRONT_SUPABASE_SECRET_KEY || null };
}

export function postgrest({ url, apikey, bearer, fetchImpl = fetch }) {
  const headers = (extra) => {
    const h = { apikey, "accept-profile": "storefront", "content-profile": "storefront", accept: "application/json", ...extra };
    if (bearer) h.authorization = `Bearer ${bearer}`;
    return h;
  };
  async function call(path, init) {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, init);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!res.ok) throw new DbError(res.status, String(body?.message ?? `HTTP ${res.status}`).slice(0, 300), body?.code);
    return body;
  }
  return {
    rpc: (fn, args = {}) => call(`rpc/${encodeURIComponent(fn)}`, {
      method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify(args),
    }),
    select: (table, query = "select=*") => call(`${encodeURIComponent(table)}?${query}`, { method: "GET", headers: headers() }),
    insert: (table, row) => call(encodeURIComponent(table), {
      method: "POST", headers: headers({ "content-type": "application/json", prefer: "return=minimal" }), body: JSON.stringify(row),
    }),
  };
}

export function userDb(cfg, token, fetchImpl) {
  return postgrest({ url: cfg.url, apikey: cfg.publishable, bearer: token, fetchImpl });
}

// New-style secret keys (sb_secret_...) go in `apikey` only; a legacy service_role JWT is also the bearer.
export function serviceDb(cfg, fetchImpl) {
  if (!cfg?.secret) throw new DbError(503, "storefront secret key is not configured");
  const legacyJwt = cfg.secret.split(".").length === 3;
  return postgrest({ url: cfg.url, apikey: cfg.secret, bearer: legacyJwt ? cfg.secret : null, fetchImpl });
}
