// An in-process Postgres 17 (PGlite) with the Supabase auth shim and the real storefront migration,
// for tests and local development. Statements run as the same roles PostgREST would use
// (anon / authenticated / service_role) with the same request.jwt.claims setting, so RLS and
// grants are exercised exactly as written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { DbError } from "../../lib/storefront/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
export const MIGRATIONS = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => path.join(root, "supabase/migrations", f));

const SET_RETURNING = new Set(["report"]);

export async function makeDb() {
  // Return date/timestamp columns as text, the way PostgREST does, not as JS Date objects.
  const asText = (v) => v;
  const isoTz = (v) => v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const pg = new PGlite({ parsers: { 1082: asText, 1114: asText, 1184: isoTz } });
  await pg.exec(fs.readFileSync(path.join(here, "supabase-shim.sql"), "utf8"));
  for (const f of MIGRATIONS) await pg.exec(fs.readFileSync(f, "utf8"));

  // Run fn(tx) as a role with JWT claims, in a transaction that is always rolled back on error.
  async function as(role, claims, fn) {
    return pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? {})]);
      if (role) await tx.exec(`set local role ${role}`);
      return fn(tx);
    });
  }

  const wrap = (e) => new DbError(e?.code === "42501" ? 403 : 400, String(e?.message ?? e).slice(0, 300), e?.code);

  // A PostgREST look-alike handle for one identity. Supports the calls lib/storefront uses.
  function handle(role, claims) {
    const run = async (sql, params) => {
      try { return await as(role, claims, (tx) => tx.query(sql, params)); } catch (e) { throw wrap(e); }
    };
    return {
      async rpc(fn, args = {}) {
        if (!/^[a-z_]+$/.test(fn)) throw new DbError(404, "no such function");
        const names = Object.keys(args);
        const params = names.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
        const call = `storefront.${fn}(${names.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
        if (SET_RETURNING.has(fn)) return (await run(`select * from ${call}`, params)).rows;
        return (await run(`select ${call} as v`, params)).rows[0].v;
      },
      async select(table, query = "select=*") {
        if (!/^[a-z_]+$/.test(table)) throw new DbError(404, "no such table");
        const q = new URLSearchParams(query);
        const cols = (q.get("select") || "*").split(",").map((c) => (c === "*" ? "*" : `"${c.replace(/"/g, "")}"`)).join(", ");
        const where = [], params = [];
        let order = "", limit = "";
        for (const [k, v] of q) {
          if (k === "select") continue;
          if (k === "order") { const [c, dir] = v.split("."); order = ` order by "${c.replace(/"/g, "")}" ${dir === "desc" ? "desc" : "asc"}`; continue; }
          if (k === "limit") { limit = ` limit ${Number(v) | 0}`; continue; }
          const col = `"${k.replace(/"/g, "")}"`;
          if (v.startsWith("eq.")) { params.push(v.slice(3)); where.push(`${col}::text = $${params.length}`); }
          else if (v === "is.true") where.push(`${col} is true`);
          else throw new DbError(400, `unsupported filter ${k}`);
        }
        const sql = `select ${cols} from storefront.${table}${where.length ? ` where ${where.join(" and ")}` : ""}${order}${limit}`;
        return (await run(sql, params)).rows;
      },
      async insert(table, row) {
        if (!/^[a-z_]+$/.test(table)) throw new DbError(404, "no such table");
        const keys = Object.keys(row);
        const vals = keys.map((k) => (row[k] !== null && typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k]));
        await run(`insert into storefront.${table} (${keys.map((k) => `"${k}"`).join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, vals);
        return null;
      },
    };
  }

  return {
    pg,
    as,
    async addUser({ id, email = null, confirmed = true, banned = false, deleted = false, anonymous = false }) {
      await pg.query(
        `insert into auth.users (id, email, email_confirmed_at, banned_until, deleted_at, is_anonymous) values ($1, $2, $3, $4, $5, $6)`,
        [id, email, confirmed ? new Date() : null, banned ? new Date(Date.now() + 864e5) : null, deleted ? new Date() : null, anonymous]);
    },
    // What the operator does by hand in the SQL editor (see docs). Runs as the database owner.
    async addMember(userId, role, { requireMfa = false } = {}) {
      await pg.query(`insert into storefront.members (user_id, role, require_mfa) values ($1, $2, $3)`, [userId, role, requireMfa]);
    },
    user: (sub, extra = {}) => handle("authenticated", { sub, role: "authenticated", aal: "aal1", ...extra }),
    anon: () => handle("anon", { role: "anon" }),
    service: () => handle("service_role", { role: "service_role" }),
  };
}
