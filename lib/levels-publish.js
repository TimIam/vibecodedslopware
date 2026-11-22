// Publishing Par for the Curse course edits from the level editor on the live site.
//
// The editor (par-for-the-curse/js/editor.js) runs on vibecodedslopware.com/par-for-the-curse/?edit
// for a signed-in admin member. Its Publish sends the overlay here through /api/admin, which has
// already checked the member (lib/storefront/auth.js). This module then:
//   1. checks the overlay's shape and size,
//   2. commits it to par-for-the-curse/levels/<name>.json on main through the GitHub contents API,
//      refusing (409) when the file on main is no longer the one the editor started from,
//   3. starts a production deploy through a Vercel deploy hook, since main is not deployed on push.
//
// Server env (set in Vercel, never in the repo):
//   LEVELS_GITHUB_TOKEN  fine-grained token for this repo only, "Contents: read and write"
//   LEVELS_DEPLOY_HOOK   the project's deploy hook URL for main (Settings > Git > Deploy Hooks)
//   LEVELS_GITHUB_REPO   optional, default TimIam/vibecodedslopware
//   LEVELS_GITHUB_BRANCH optional, default main

export const LEVEL_NAMES = { front: "Mount Bogey (front nine)", back: "Lantern Links (back nine)" };
export const MAX_LEVEL_BYTES = 1_000_000;

// Bounds that keep a published overlay from freezing players' loads (a block 1e9 m long would build
// about 10^8 rocks). The game checks the same bounds again when it loads (saneValue in
// par-for-the-curse/js/levels.js; keep the two copies the same).
export const MAX_ITEMS = 3000, MAX_ADDS = 400;
const MAX_NUM = 500, MAX_ARRAY = 300, MAX_STR = 300, MAX_DEPTH = 8, MIN_STEP = 0.25;
export function saneValue(v, depth = 0, key = "") {
  if (depth > MAX_DEPTH) return false;
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) <= MAX_NUM && !(key === "step" && v < MIN_STEP);
  if (typeof v === "string") return v.length <= MAX_STR;
  if (v === null || typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length <= MAX_ARRAY && v.every((x) => saneValue(x, depth + 1, key));
  if (typeof v === "object") return Object.keys(v).length <= MAX_ARRAY && Object.entries(v).every(([k, x]) => saneValue(x, depth + 1, k));
  return false;
}

export class LevelError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function levelsEnv(env = process.env) {
  const token = env.LEVELS_GITHUB_TOKEN;
  if (!token) return null;
  return {
    token,
    repo: env.LEVELS_GITHUB_REPO || "TimIam/vibecodedslopware",
    branch: env.LEVELS_GITHUB_BRANCH || "main",
    hook: env.LEVELS_DEPLOY_HOOK || null,
  };
}

const pathOf = (name) => `par-for-the-curse/levels/${name}.json`;

// The overlay as the editor writes it: {version:1, items:{id:{...}}, add:[{id,hole,m,args}]}.
// The game checks every value again when it loads; this only keeps junk out of the repo.
export function checkLevel(name, text) {
  if (!Object.hasOwn(LEVEL_NAMES, name)) throw new LevelError(400, "unknown level");
  if (typeof text !== "string" || !text.length) throw new LevelError(400, "no level data");
  if (Buffer.byteLength(text) > MAX_LEVEL_BYTES) throw new LevelError(413, "level file too large");
  let d;
  try { d = JSON.parse(text); } catch { throw new LevelError(422, "level is not valid JSON"); }
  if (!d || typeof d !== "object" || Array.isArray(d) || d.version !== 1) throw new LevelError(422, "level must be an overlay object with version 1");
  if (!d.items || typeof d.items !== "object" || Array.isArray(d.items)) throw new LevelError(422, "level items must be an object");
  if (!Array.isArray(d.add)) throw new LevelError(422, "level add must be a list");
  const keys = Object.keys(d).filter((k) => !["version", "items", "add"].includes(k));
  if (keys.length) throw new LevelError(422, "level has unknown fields: " + keys.slice(0, 5).join(", "));
  if (Object.keys(d.items).length > MAX_ITEMS || d.add.length > MAX_ADDS) throw new LevelError(422, "level has too many pieces");
  for (const [id, e] of Object.entries(d.items)) {
    if (id.length > 200 || !e || typeof e !== "object" || Array.isArray(e) || !saneValue(e)) throw new LevelError(422, "level has a bad item entry");
  }
  for (const a of d.add) {
    if (!a || typeof a.id !== "string" || typeof a.m !== "string" || !Array.isArray(a.args) || !(a.hole >= 1 && a.hole <= 9) || !saneValue(a)) throw new LevelError(422, "level has a bad added piece");
  }
  // Stored exactly as the editor laid it out (it keeps the holes' build order, so diffs read well).
  return text.endsWith("\n") ? text : text + "\n";
}

async function github(cfg, method, path, body, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(`https://api.github.com/repos/${cfg.repo}/${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${cfg.token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "vibecodedslopware-level-editor",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new LevelError(502, "GitHub could not be reached"); }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// The file on main now: its text and blob sha (sha null when it does not exist yet).
export async function readLevel(cfg, name, fetchImpl = fetch) {
  if (!Object.hasOwn(LEVEL_NAMES, name)) throw new LevelError(400, "unknown level");
  const r = await github(cfg, "GET", `contents/${pathOf(name)}?ref=${encodeURIComponent(cfg.branch)}`, null, fetchImpl);
  if (r.status === 404) return { text: null, sha: null };
  if (r.status !== 200 || typeof r.data.content !== "string") throw new LevelError(502, `GitHub answered ${r.status} reading the level`);
  return { text: Buffer.from(r.data.content, "base64").toString("utf8"), sha: r.data.sha };
}

// base: the blob sha the editor started from ("none" for a file that did not exist). force: replace
// whatever is on main (the editor asks first). Returns the new commit and whether a deploy started.
export async function publishLevel(cfg, { name, text, base, force = false, who = "a member" }, fetchImpl = fetch) {
  const body = checkLevel(name, text);
  const now = await readLevel(cfg, name, fetchImpl);
  if (!force && (base || "none") !== (now.sha || "none")) {
    throw new LevelError(409, `levels/${name}.json changed on the site since the editor loaded it`);
  }
  if (now.text === body) return { ok: true, unchanged: true, sha: now.sha, commit: null, deploy: "not needed" };
  const put = await github(cfg, "PUT", `contents/${pathOf(name)}`, {
    message: `Par for the Curse: course edits on ${LEVEL_NAMES[name]}\n\nPublished by ${who} with the level editor on the site.`,
    content: Buffer.from(body, "utf8").toString("base64"),
    branch: cfg.branch,
    ...(now.sha ? { sha: now.sha } : {}),
  }, fetchImpl);
  // 409: the sha moved under us (a race). A 422 that mentions the sha is the same thing; any other 422
  // or a 403 (a protected branch, a ruleset, a token without write access) is not a conflict to override.
  if (put.status === 409 || (put.status === 422 && /sha/i.test(put.data.message || ""))) throw new LevelError(409, `levels/${name}.json changed on the site while publishing`);
  if (put.status === 401 || put.status === 403 || put.status === 404 || put.status === 422) throw new LevelError(502, `GitHub refused the commit (${put.status}${put.data.message ? ": " + String(put.data.message).slice(0, 120) : ""}); check LEVELS_GITHUB_TOKEN and branch rules`);
  if (put.status !== 200 && put.status !== 201) throw new LevelError(502, `GitHub answered ${put.status} saving the level`);
  const commit = put.data.commit?.sha ?? null;
  let deploy = "no deploy hook set";
  if (cfg.hook) {
    try { deploy = (await fetchImpl(cfg.hook, { method: "POST" })).ok ? "started" : "deploy hook failed"; }
    catch { deploy = "deploy hook failed"; }
  }
  return { ok: true, sha: put.data.content?.sha ?? null, commit, commitUrl: put.data.commit?.html_url ?? null, deploy };
}
