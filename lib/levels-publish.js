// Publishing Par for the Curse course edits from the level editor on the live site.
//
// The editor (par-for-the-curse/js/editor.js) runs on vibecodedslopware.com/par-for-the-curse/?edit
// for a signed-in admin member. Its Publish sends the overlay here through /api/admin, which has
// already checked the member (lib/storefront/auth.js). This module checks the overlay's shape and
// size, then stores it as a new version in storefront.levels (the Supabase project the admin page
// already uses) through storefront.publish_level, called with the member's own token. Players read
// the newest version on load (/api/admin?view=course). Nothing is committed and nothing redeploys.
// Schema: supabase/migrations/20261122120000_storefront_levels.sql.
import { DbError } from "./storefront/db.js";

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

// The overlay as the editor writes it: {version:1, items:{id:{...}}, add:[{id,hole,m,args}]}.
// The game checks every value again when it loads; this keeps junk out of what players get.
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

// The newest published version: {text, id, at} ({text: null, id: "none"} before the first publish).
// db: a storefront handle (anon for players, the member's own for the editor).
export async function readPublished(db, name) {
  if (!Object.hasOwn(LEVEL_NAMES, name)) throw new LevelError(400, "unknown level");
  const r = await db.rpc("published_level", { p_name: name });
  return r && typeof r.text === "string" ? { text: r.text, id: String(r.id), at: r.at ?? null } : { text: null, id: "none", at: null };
}

// base: the id the editor started from ("none" before the first publish). force: replace whatever is
// published (the editor asks first). db must be the member's own handle: the function checks the role.
export async function publishLevel(db, { name, text, base, force = false }) {
  const body = checkLevel(name, text);
  try {
    const r = await db.rpc("publish_level", { p_name: name, p_body: body, p_base: String(base || "none"), p_force: force === true });
    return { ok: true, sha: String(r.id), unchanged: !!r.unchanged };
  } catch (err) {
    if (err instanceof DbError && (err.code === "PT409" || err.status === 409)) throw new LevelError(409, `the ${name} course changed on the site since the editor loaded it`);
    if (err instanceof DbError && (err.code === "42501" || err.status === 403)) throw new LevelError(403, "not authorized to publish");
    throw err;
  }
}
