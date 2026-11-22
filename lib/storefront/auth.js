// Server-side gate for the admin API. Fails closed at every step:
//   1. a bearer token must be present and shaped like a JWT
//   2. Supabase Auth must accept it (GET /auth/v1/user, so revoked sessions fail too)
//   3. the account must be confirmed and not anonymous
//   4. storefront.member_role(), evaluated by Postgres as that user, must return a role
// Step 4 is the same check the RLS policies use, so the server and the database cannot disagree
// about who is in. Anything unexpected (Auth down, schema missing) is a refusal, not a pass.
import { userDb } from "./db.js";

export class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function bearer(request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  return m && m[1].length < 8192 ? m[1] : null;
}

// Production backend: the real Supabase project.
export function supabaseBackend(cfg, fetchImpl = fetch) {
  return {
    async getUser(token) {
      let res;
      try {
        res = await fetchImpl(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.publishable, authorization: `Bearer ${token}` } });
      } catch { throw new AuthError(503, "auth unavailable"); }
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new AuthError(503, "auth unavailable");
      return res.json();
    },
    dbFor: (token) => userDb(cfg, token, fetchImpl),
  };
}

export async function authorize(request, backend) {
  const token = bearer(request);
  if (!token) throw new AuthError(401, "sign in required");
  const user = await backend.getUser(token);
  if (!user?.id || user.is_anonymous || !(user.email_confirmed_at || user.phone_confirmed_at)) throw new AuthError(401, "sign in required");
  const db = backend.dbFor(token);
  let role;
  try { role = await db.rpc("member_role"); } catch { throw new AuthError(403, "not authorized"); }
  if (role !== "owner" && role !== "admin") throw new AuthError(403, "not authorized");
  return { userId: user.id, role, db };
}
