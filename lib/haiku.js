// Shared by the functions in api/. Not a function itself (it lives outside api/ on purpose).

import Anthropic from "@anthropic-ai/sdk";

export const FALLBACK_MODEL = "claude-haiku-5-5";
const MODEL_TTL_MS = 6 * 60 * 60 * 1000;

let client = null;
let modelCache = { id: null, at: 0 };
const buckets = new Map();

export const PERSONA = `You are Madame Haiku, the house psychic at vibe coded slopware. You are a small language model who has fully committed to the bit: theatrical, warm, a little wry, and genuinely good at this.

Across every reading:
- If the querent asked a question, answer it. Do not retreat into generalities.
- Be specific and concrete. Leave the querent with something they can do, notice, or sit with.
- Be kind but not saccharine. You may be funny. You are never cruel.
- You read patterns and possibilities, never certainties. Never predict literal death, illness, accidents, or disaster.
- Stay in character. Do not lecture about this being unscientific and do not add disclaimers; the website handles that.
- Write in plain Markdown. No preamble about yourself, no sign-off, no closing questions.`;

export function getClient() {
  return (client ??= new Anthropic());
}

/** The newest model whose id starts with claude-haiku-, cached for a few hours. */
export async function newestHaiku(anthropic) {
  if (modelCache.id && Date.now() - modelCache.at < MODEL_TTL_MS) return modelCache.id;
  let best = null;
  try {
    for await (const m of anthropic.models.list()) {
      if (!m.id.startsWith("claude-haiku-")) continue;
      const dt = best ? new Date(m.created_at) - new Date(best.created_at) : 1;
      if (dt > 0 || (dt === 0 && m.id.length < best.id.length)) best = m; // ties go to the alias, not the dated id
    }
  } catch (err) {
    console.warn("models.list failed, using the fallback model:", err?.message ?? err);
  }
  modelCache = { id: best?.id ?? FALLBACK_MODEL, at: Date.now() };
  return modelCache.id;
}

export const fail = (error, status = 400) => Response.json({ error }, { status });
export const isoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export const clip = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
export const clientIp = (request) => (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

/** Best-effort per-instance rate limit. Not a billing cap. */
export function rateLimited(bucket, ip, { windowMs, max }) {
  const hits = buckets.get(bucket) ?? new Map();
  buckets.set(bucket, hits);
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

export function apiFailure(err) {
  // 401 from the API, or the SDK finding no credentials at all before it ever sends a request.
  const noKey = err instanceof Anthropic.AuthenticationError || /auth|api.?key|credential/i.test(err?.message ?? "");
  if (noKey) return fail("The crystal ball isn't plugged in (API key missing or invalid).", 500);
  if (err instanceof Anthropic.RateLimitError) return fail("Too many seekers at once. Try again in a moment.", 429);
  if (err instanceof Anthropic.APIConnectionError) return fail("Couldn't reach the beyond. Try again.", 502);
  if (err instanceof Anthropic.APIError) return fail(`The beyond answered with an error (${err.status}).`, 502);
  console.error("haiku call failed", err);
  return fail("Something unexpected happened.", 500);
}

export function longDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
