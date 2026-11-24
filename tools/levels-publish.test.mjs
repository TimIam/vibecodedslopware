// Tests for publishing Par for the Curse course edits from the live site: lib/levels-publish.js, the
// storefront.levels migration (run for real in PGlite, as the anon / authenticated roles PostgREST uses)
// and the level routes of api/admin.js (with its local PGlite backend). Nothing leaves this machine.
// Run: node --test tools/levels-publish.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { checkLevel, publishLevel, readPublished, LevelError } from "../lib/levels-publish.js";
import { makeDb } from "./storefront/pgdb.mjs";

const EMPTY = JSON.stringify({ version: 1, items: {}, add: [] }, null, 2) + "\n";
const EDITED = JSON.stringify({ version: 1, items: { "h1:prop:14,5.6": { del: true } }, add: [{ id: "a1", hole: 2, m: "cone", args: [10, 0, 1] }] }, null, 2) + "\n";
const OWNER = "00000000-0000-4000-8000-0000000000b1", ADMIN = "00000000-0000-4000-8000-0000000000b2", PLAYER = "00000000-0000-4000-8000-0000000000b3";

async function freshDb() {
  const db = await makeDb();
  for (const id of [OWNER, ADMIN, PLAYER]) await db.addUser({ id });
  await db.addMember(OWNER, "owner");
  await db.addMember(ADMIN, "admin");
  return db;
}

test("checkLevel accepts editor overlays and refuses junk", () => {
  assert.equal(checkLevel("front", EDITED), EDITED);
  assert.equal(checkLevel("back", EDITED.trimEnd()), EDITED);
  const bad = [
    ["sideways", EMPTY, 400], ["front", "", 400], ["front", "{", 422], ["front", "[]", 422],
    ["front", '{"version":2,"items":{},"add":[]}', 422], ["front", '{"version":1,"items":[],"add":[]}', 422],
    ["front", '{"version":1,"items":{},"add":{}}', 422], ["front", '{"version":1,"items":{},"add":[],"x":1}', 422],
    ["front", '{"version":1,"items":{"a":1},"add":[]}', 422], ["front", '{"version":1,"items":{},"add":[{"id":"a","hole":12,"m":"cone","args":[]}]}', 422],
    ["front", JSON.stringify({ version: 1, items: { a: { s: "x".repeat(1_100_000) } }, add: [] }), 413],
    ["../../api/admin", EMPTY, 400], ["__proto__", EMPTY, 400],
    // bounds that keep a file from freezing every player's load
    ["front", JSON.stringify({ version: 1, items: {}, add: [{ id: "a", hole: 1, m: "block", args: [0, 1e9, 0, 4, 0] }] }), 422],
    ["front", JSON.stringify({ version: 1, items: { "h1:block:0,9,0": { set: { "1": 600 } } }, add: [] }), 422],
    ["front", JSON.stringify({ version: 1, items: {}, add: [{ id: "r", hole: 1, m: "road", args: [[[0, 0, 0], [9, 0, 0]], 3, { step: 0.001 }] }] }), 422],
    // an item edit names the field by path, and must not get round the step rule that way
    ["front", JSON.stringify({ version: 1, items: { "h1:road:0,0": { set: { "2.step": 1e-300 } } }, add: [] }), 422],
    ["front", JSON.stringify({ version: 1, items: { "h1:road:0,0": { set: { "2.step": 0.1 } } }, add: [] }), 422],
    ["front", JSON.stringify({ version: 1, items: {}, add: Array.from({ length: 401 }, (_, i) => ({ id: "c" + i, hole: 1, m: "cone", args: [1, 0, 1] })) }), 422],
  ];
  for (const [name, text, status] of bad) assert.throws(() => checkLevel(name, text), (e) => e instanceof LevelError && e.status === status, `${name} ${text.slice(0, 40)}`);
});

test("publish stores versions, refuses a stale base unless forced, and skips unchanged text", async () => {
  const db = await freshDb(), admin = db.user(ADMIN), anon = db.anon();
  assert.deepEqual(await readPublished(anon, "front"), { text: null, id: "none", at: null });
  const r1 = await publishLevel(admin, { name: "front", text: EDITED, base: "none" });
  assert.equal(r1.ok, true); assert.equal(r1.unchanged, false);
  const seen = await readPublished(anon, "front");
  assert.equal(seen.text, EDITED); assert.equal(seen.id, r1.sha);
  assert.equal((await readPublished(anon, "back")).text, null);
  // Stale or missing base: 409, nothing stored.
  await assert.rejects(publishLevel(admin, { name: "front", text: EMPTY, base: "none" }), (e) => e instanceof LevelError && e.status === 409);
  await assert.rejects(publishLevel(admin, { name: "front", text: EMPTY, base: undefined }), (e) => e.status === 409);
  assert.equal((await readPublished(anon, "front")).text, EDITED);
  const same = await publishLevel(admin, { name: "front", text: EDITED, base: r1.sha });
  assert.equal(same.unchanged, true); assert.equal(same.sha, r1.sha);
  const forced = await publishLevel(db.user(OWNER), { name: "front", text: EMPTY, base: "none", force: true });
  assert.equal(forced.unchanged, false);
  assert.equal((await readPublished(anon, "front")).text, EMPTY);
  // Every publish is kept, with who did it, and audited.
  const rows = (await db.pg.query(`select name, published_by::text as by from storefront.levels order by id`)).rows;
  assert.deepEqual(rows, [{ name: "front", by: ADMIN }, { name: "front", by: OWNER }]);
  const audit = (await db.pg.query(`select actor::text as actor, detail->>'forced' as forced from storefront.audit_log where action = 'level-publish' order by id`)).rows;
  assert.deepEqual(audit, [{ actor: ADMIN, forced: "false" }, { actor: OWNER, forced: "true" }]);
});

test("only owner and admin members can publish; players read only the newest version", async () => {
  const db = await freshDb();
  await assert.rejects(publishLevel(db.user(PLAYER), { name: "front", text: EDITED, base: "none" }), (e) => e.status === 403);
  await assert.rejects(db.anon().rpc("publish_level", { p_name: "front", p_body: EDITED, p_base: "none", p_force: true }), (e) => e.code === "42501");
  await assert.rejects(db.user(ADMIN).rpc("publish_level", { p_name: "../x", p_body: EDITED, p_base: "none", p_force: true }));
  await assert.rejects(db.user(ADMIN).rpc("publish_level", { p_name: "front", p_body: "x".repeat(1_000_001), p_base: "none", p_force: true }));
  await publishLevel(db.user(ADMIN), { name: "back", text: EDITED, base: "none" });
  // Neither a player nor anon can read the table itself (old versions, who published).
  assert.deepEqual(await db.user(PLAYER).select("levels", "select=id"), []);
  await assert.rejects(db.anon().select("levels", "select=id"), (e) => e.code === "42501");
  assert.equal((await readPublished(db.user(PLAYER), "back")).text, EDITED);
});

test("anon can call published_level and nothing else in storefront", async () => {
  const db = await freshDb();
  const fns = (await db.pg.query(`select p.oid::regprocedure::text as fn, has_function_privilege('anon', p.oid, 'execute') as ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'storefront' order by 1`)).rows;
  assert.ok(fns.length > 10);
  assert.deepEqual(fns.filter((r) => r.ok).map((r) => r.fn), ["storefront.published_level(text)"]);
  const rels = (await db.pg.query(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storefront' and (
      (c.relkind in ('r', 'v', 'm') and has_table_privilege('anon', c.oid, 'select,insert,update,delete'))
      or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'usage')))`)).rows;
  assert.deepEqual(rels, []);
});

// ---------------------------------------------------------------------------------------------
// api/admin.js level routes, with the local PGlite backend (fixture users, the real migrations).
test("api/admin: public course read, members-only editor read and publish", async () => {
  const saved = { ...process.env };
  process.env.STOREFRONT_DEV = "pglite";
  delete process.env.VERCEL; delete process.env.VERCEL_ENV;
  try {
    const { GET, POST } = await import("../api/admin.js");
    const req = (method, query, tok, body) => new Request("http://localhost:3131/api/admin" + query, { method, headers: { ...(tok ? { authorization: "Bearer " + tok } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const pub = await GET(req("GET", "?view=course&name=front"));
    assert.equal(pub.status, 200); assert.match(pub.headers.get("cache-control"), /s-maxage=15/);
    assert.deepEqual(await pub.json(), { text: null, id: "none" });
    assert.equal((await GET(req("GET", "?view=course&name=../x"))).status, 400);
    assert.equal((await GET(req("GET", "?view=level&name=front"))).status, 401);
    assert.equal((await GET(req("GET", "?view=level&name=front", "dev.outsider.fixture"))).status, 403);
    assert.equal((await POST(req("POST", "", "dev.outsider.fixture", { action: "level-publish", name: "front", text: EDITED, base: "none" }))).status, 403);
    const got = await (await GET(req("GET", "?view=level&name=front", "dev.admin.fixture"))).json();
    assert.equal(got.text, null); assert.equal(got.sha, "none"); assert.equal(got.role, "admin");
    const ok = await POST(req("POST", "", "dev.admin.fixture", { action: "level-publish", name: "front", text: EDITED, base: got.sha }));
    const out = await ok.json();
    assert.equal(ok.status, 200, JSON.stringify(out)); assert.equal(out.unchanged, false);
    const stale = await POST(req("POST", "", "dev.owner.fixture", { action: "level-publish", name: "front", text: EMPTY, base: "none" }));
    assert.equal(stale.status, 409);
    assert.equal((await POST(req("POST", "", "dev.admin.fixture", { action: "level-publish", name: "front", text: "{}", base: out.sha }))).status, 422);
    assert.deepEqual(await (await GET(req("GET", "?view=course&name=front"))).json(), { text: EDITED, id: out.sha });
    assert.equal((await (await GET(req("GET", "?view=level&name=front", "dev.owner.fixture"))).json()).sha, out.sha);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
