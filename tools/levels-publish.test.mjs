// Tests for publishing Par for the Curse course edits from the live site (lib/levels-publish.js and the
// level routes of api/admin.js). GitHub, Supabase Auth and the deploy hook are faked; nothing leaves
// this machine. Run: node --test tools/levels-publish.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { checkLevel, publishLevel, readLevel, LevelError } from "../lib/levels-publish.js";

const EMPTY = JSON.stringify({ version: 1, items: {}, add: [] }, null, 2) + "\n";
const EDITED = JSON.stringify({ version: 1, items: { "h1:prop:14,5.6": { del: true } }, add: [{ id: "a1", hole: 2, m: "cone", args: [10, 0, 1] }] }, null, 2) + "\n";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

// A fake GitHub contents API holding one repo's files, plus a deploy hook.
function fakeGitHub({ files = {}, hookOk = true } = {}) {
  const calls = [];
  let n = 0;
  const shaOf = (s) => "blob" + Buffer.from(s).length + "-" + (++n);
  const store = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, sha: shaOf(t) }]));
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    const u = new URL(url);
    if (u.hostname === "hooks.example") return new Response("{}", { status: hookOk ? 201 : 500 });
    const m = u.pathname.match(/^\/repos\/TimIam\/vibecodedslopware\/contents\/(.+)$/);
    if (!m) return new Response("{}", { status: 404 });
    const path = decodeURIComponent(m[1]);
    if ((init.method || "GET") === "GET") {
      const f = store[path];
      return f ? Response.json({ content: b64(f.text), sha: f.sha }) : Response.json({ message: "Not Found" }, { status: 404 });
    }
    const body = JSON.parse(init.body);
    const cur = store[path];
    if ((cur && body.sha !== cur.sha) || (!cur && body.sha)) return Response.json({ message: "sha mismatch" }, { status: 409 });
    const text = Buffer.from(body.content, "base64").toString("utf8");
    store[path] = { text, sha: shaOf(text) };
    return Response.json({ content: { sha: store[path].sha }, commit: { sha: "c0ffee" + n, html_url: "https://github.com/TimIam/vibecodedslopware/commit/c0ffee" + n } }, { status: cur ? 200 : 201 });
  };
  return { fetchImpl, calls, store };
}
const CFG = { token: "t", repo: "TimIam/vibecodedslopware", branch: "main", hook: "https://hooks.example/deploy" };
const FRONT = "par-for-the-curse/levels/front.json";

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
    ["front", JSON.stringify({ version: 1, items: {}, add: [{ id: "r", hole: 1, m: "road", args: [[[0, 0, 0], [9, 0, 0]], { step: 0.001 }] }] }), 422],
    ["front", JSON.stringify({ version: 1, items: {}, add: Array.from({ length: 401 }, (_, i) => ({ id: "c" + i, hole: 1, m: "cone", args: [1, 0, 1] })) }), 422],
  ];
  for (const [name, text, status] of bad) assert.throws(() => checkLevel(name, text), (e) => e instanceof LevelError && e.status === status, `${name} ${text.slice(0, 40)}`);
});

test("publish commits to main with the right base and starts the deploy", async () => {
  const gh = fakeGitHub({ files: { [FRONT]: EMPTY } });
  const now = await readLevel(CFG, "front", gh.fetchImpl);
  assert.equal(now.text, EMPTY);
  const r = await publishLevel(CFG, { name: "front", text: EDITED, base: now.sha, who: "the site's admin" }, gh.fetchImpl);
  assert.equal(r.ok, true); assert.equal(r.deploy, "started"); assert.match(r.commit, /^c0ffee/);
  assert.equal(gh.store[FRONT].text, EDITED);
  assert.equal(r.sha, gh.store[FRONT].sha);
  const put = gh.calls.find((c) => c.method === "PUT");
  assert.equal(put.body.branch, "main"); assert.equal(put.body.sha, now.sha);
  assert.match(put.body.message, /Mount Bogey/); assert.doesNotMatch(put.body.message, /@/);
  assert.equal(put.headers.authorization, "Bearer t");
  assert.ok(gh.calls.some((c) => c.url === CFG.hook && c.method === "POST"));
  // A second publish from the same editor uses the sha it got back.
  const r2 = await publishLevel(CFG, { name: "front", text: EMPTY, base: r.sha }, gh.fetchImpl);
  assert.equal(r2.ok, true); assert.equal(gh.store[FRONT].text, EMPTY);
});

test("publish refuses a stale base unless forced, and skips unchanged files", async () => {
  const gh = fakeGitHub({ files: { [FRONT]: EMPTY } });
  await assert.rejects(publishLevel(CFG, { name: "front", text: EDITED, base: "old-sha" }, gh.fetchImpl), (e) => e.status === 409);
  await assert.rejects(publishLevel(CFG, { name: "front", text: EDITED, base: undefined }, gh.fetchImpl), (e) => e.status === 409);
  assert.equal(gh.store[FRONT].text, EMPTY);
  const forced = await publishLevel(CFG, { name: "front", text: EDITED, base: "old-sha", force: true }, gh.fetchImpl);
  assert.equal(forced.ok, true); assert.equal(gh.store[FRONT].text, EDITED);
  const same = await publishLevel(CFG, { name: "front", text: EDITED, base: gh.store[FRONT].sha }, gh.fetchImpl);
  assert.equal(same.unchanged, true); assert.equal(same.commit, null);
  assert.equal(gh.calls.filter((c) => c.url === CFG.hook).length, 1);
});

test("publish creates a missing file from base 'none' and reports a failed or missing hook", async () => {
  const gh = fakeGitHub({ hookOk: false });
  const r = await publishLevel(CFG, { name: "back", text: EDITED, base: "none" }, gh.fetchImpl);
  assert.equal(r.ok, true); assert.equal(r.deploy, "deploy hook failed");
  assert.equal(gh.store["par-for-the-curse/levels/back.json"].text, EDITED);
  const gh2 = fakeGitHub({ files: { [FRONT]: EMPTY } });
  const now = await readLevel(CFG, "front", gh2.fetchImpl);
  const r2 = await publishLevel({ ...CFG, hook: null }, { name: "front", text: EDITED, base: now.sha }, gh2.fetchImpl);
  assert.equal(r2.deploy, "no deploy hook set");
});

test("publish turns a race on GitHub into 409", async () => {
  const gh = fakeGitHub({ files: { [FRONT]: EMPTY } });
  const now = await readLevel(CFG, "front", gh.fetchImpl);
  const racing = async (url, init = {}) => {
    if ((init.method || "GET") === "PUT") gh.store[FRONT] = { text: "someone else\n", sha: "other" };
    return gh.fetchImpl(url, init);
  };
  await assert.rejects(publishLevel(CFG, { name: "front", text: EDITED, base: now.sha }, racing), (e) => e.status === 409);
});

// ---------------------------------------------------------------------------------------------
// api/admin.js: the level routes need a signed-in member; Supabase Auth and PostgREST are faked.
test("api/admin level routes: members only, then read and publish", async () => {
  const env = { STOREFRONT_SUPABASE_URL: "https://abc.supabase.co", STOREFRONT_SUPABASE_PUBLISHABLE_KEY: "pk", LEVELS_GITHUB_TOKEN: "t", LEVELS_DEPLOY_HOOK: CFG.hook };
  const saved = { ...process.env }, savedFetch = globalThis.fetch;
  Object.assign(process.env, env);
  delete process.env.STOREFRONT_DEV;
  const gh = fakeGitHub({ files: { [FRONT]: EMPTY } });
  const roles = { "aaa.member.sig": "admin", "aaa.player.sig": null };
  const audit = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), tok = (init.headers?.authorization || "").replace("Bearer ", "");
    if (u.hostname === "abc.supabase.co" && u.pathname === "/auth/v1/user") {
      return tok in roles ? Response.json({ id: tok, email_confirmed_at: "2026-01-01" }) : new Response("{}", { status: 401 });
    }
    if (u.hostname === "abc.supabase.co" && u.pathname === "/rest/v1/rpc/member_role") return Response.json(roles[tok]);
    if (u.hostname === "abc.supabase.co" && u.pathname === "/rest/v1/audit_log") { audit.push(JSON.parse(init.body)); return new Response("", { status: 201 }); }
    return gh.fetchImpl(url, init);
  };
  try {
    const { GET, POST } = await import("../api/admin.js");
    const req = (method, query, tok, body) => new Request("https://vibecodedslopware.com/api/admin" + query, { method, headers: { ...(tok ? { authorization: "Bearer " + tok } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await GET(req("GET", "?view=level&name=front"))).status, 401);
    assert.equal((await GET(req("GET", "?view=level&name=front", "aaa.player.sig"))).status, 403);
    assert.equal((await POST(req("POST", "", "aaa.player.sig", { action: "level-publish", name: "front", text: EDITED, base: "x" }))).status, 403);
    assert.equal((await GET(req("GET", "?view=level&name=../../x", "aaa.member.sig"))).status, 400);
    const got = await (await GET(req("GET", "?view=level&name=front", "aaa.member.sig"))).json();
    assert.equal(got.text, EMPTY); assert.equal(got.role, "admin"); assert.equal(got.deployHook, true);
    const stale = await POST(req("POST", "", "aaa.member.sig", { action: "level-publish", name: "front", text: EDITED, base: "nope" }));
    assert.equal(stale.status, 409);
    const ok = await POST(req("POST", "", "aaa.member.sig", { action: "level-publish", name: "front", text: EDITED, base: got.sha }));
    const out = await ok.json();
    assert.equal(ok.status, 200, JSON.stringify(out)); assert.equal(out.deploy, "started");
    assert.equal(gh.store[FRONT].text, EDITED);
    assert.match(gh.calls.find((c) => c.method === "PUT").body.message, /site's admin/);
    assert.deepEqual(audit.map((a) => a.action), ["level-publish"]);
    const bad = await POST(req("POST", "", "aaa.member.sig", { action: "level-publish", name: "front", text: "{}", base: gh.store[FRONT].sha }));
    assert.equal(bad.status, 422);
    // Without the GitHub token the routes say so instead of failing oddly.
    delete process.env.LEVELS_GITHUB_TOKEN;
    assert.equal((await GET(req("GET", "?view=level&name=front", "aaa.member.sig"))).status, 503);
  } finally {
    globalThis.fetch = savedFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
