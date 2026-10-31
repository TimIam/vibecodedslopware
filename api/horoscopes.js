// GET /api/horoscopes?date=YYYY-MM-DD — today's horoscope for all twelve signs, written once per day.
//
// The date comes from the visitor's clock (so "today" is their today) and must be within a day of
// the server's. The response is cached by Vercel's CDN per date for two days, and memoized per
// function instance, so Haiku writes each day's sky roughly once rather than once per visitor.

import { SIGNS, moonPhase } from "../psychic/deck.js";
import { PERSONA, getClient, newestHaiku, fail, isoDate, apiFailure, longDate } from "../lib/haiku.js";

const MAX_TOKENS = 3000;
const CDN_SECONDS = 2 * 24 * 60 * 60;
const memo = new Map();   // date -> { data | promise }

const SYSTEM = `${PERSONA}

Today you write the daily horoscope column: one short entry for each of the twelve signs.
- Ground every entry in the date, the season, and the moon phase you are given. Do not invent planetary positions.
- Each sign gets its own angle: a different mood, a different small thing to do or notice. No two entries should feel interchangeable.
- Two or three sentences per sign, about 50 words. Specific, warm, a little funny, never cruel.

Format:
- Exactly twelve "## " headings, one per sign, in this order: ${SIGNS.map((s) => s.name).join(", ")}. The heading is only the sign's name.
- Under each heading, the entry. Nothing before the first heading and nothing after the last entry.`;

function parse(text) {
  const signs = {};
  for (const part of text.split(/^##\s+/m).slice(1)) {
    const nl = part.indexOf("\n");
    const name = (nl < 0 ? part : part.slice(0, nl)).trim().replace(/[^A-Za-z]/g, "");
    const body = nl < 0 ? "" : part.slice(nl + 1).trim();
    if (SIGNS.some((s) => s.name === name) && body) signs[name] = body;
  }
  return signs;
}

async function generate(date) {
  const anthropic = getClient();
  const model = await newestHaiku(anthropic);
  const moon = moonPhase(new Date(`${date}T12:00:00Z`));
  const res = await anthropic.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: `Today is ${longDate(date)}. Moon: ${moon.name} ${moon.glyph}, ${moon.illumination}% illuminated, day ${moon.age} of the cycle. Write the column.` }],
  });
  if (res.stop_reason === "refusal") throw new Error("refused");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const signs = parse(text);
  if (Object.keys(signs).length !== SIGNS.length) throw new Error(`only ${Object.keys(signs).length} signs parsed`);
  return { date, dateText: longDate(date), moon, model, generatedAt: new Date().toISOString(), signs };
}

export async function GET(request) {
  const date = new URL(request.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const todayUTC = new Date().toISOString().slice(0, 10);
  if (!isoDate(date) || Math.abs(Date.parse(date) - Date.parse(todayUTC)) > 26 * 60 * 60 * 1000) {
    return fail("That day isn't on the calendar.", 400);
  }

  let entry = memo.get(date);
  if (!entry) {
    entry = generate(date).catch((err) => { memo.delete(date); throw err; });
    memo.set(date, entry);
  }

  let data;
  try { data = await entry; } catch (err) {
    if (err?.message === "refused") return fail("The stars declined to comment today.", 502);
    if (/signs parsed/.test(err?.message ?? "")) return fail("The stars were hard to read today. Try again in a moment.", 502);
    return apiFailure(err);
  }

  return Response.json(data, {
    headers: { "cache-control": `public, s-maxage=${CDN_SECONDS}, stale-while-revalidate=3600`, "x-model": data.model },
  });
}
