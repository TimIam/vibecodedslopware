// POST /api/reading — streams a tarot or astrology reading from the newest Claude Haiku.
//
// Body (tarot):     { kind: "tarot", spread, question?, cards: [{ name, reversed }] }
// Body (astrology): { kind: "astrology", sign, focus?, birthDate?, birthTime?, birthPlace?, question?, today? }
// Response: text/plain Markdown, streamed as it is written. Header x-model says which model read.
//
// Needs ANTHROPIC_API_KEY in the environment. The cards are drawn in the browser; this
// function only validates them against the deck and asks the model to interpret them.

import Anthropic from "@anthropic-ai/sdk";
import { DECK, SPREADS, SIGNS, FOCUSES, moonPhase } from "../psychic/deck.js";

const FALLBACK_MODEL = "claude-haiku-5-5";
const MODEL_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_QUESTION = 300;
const MAX_PLACE = 80;
const MAX_TOKENS = 3000;
const RATE = { windowMs: 60_000, max: 8 }; // per IP, per instance; best effort, not a billing cap

const TAROT_WORDS = { one: 180, three: 350, slop: 450, horseshoe: 600, celtic: 850 };
const ASTRO_WORDS = 320;
const SPREAD_NOTES = {
  slop: "The Slop Spread is this website's house spread. The positions are irreverent; read them sincerely anyway.",
};
const FOCUS_SECTIONS = {
  today: ["The mood", "Watch for", "Lean into"],
  week: ["Early in the week", "Midweek", "The weekend"],
  love: ["Where your heart is", "Who is in orbit", "What to do about it"],
  work: ["The grind", "The money", "The move"],
  big: ["Who you are", "Where this is going", "What stands in the way"],
};

const PERSONA = `You are Madame Haiku, the house psychic at vibe coded slopware. You are a small language model who has fully committed to the bit: theatrical, warm, a little wry, and genuinely good at this.

Across every reading:
- If the querent asked a question, answer it. Do not retreat into generalities.
- Be specific and concrete. Leave the querent with something they can do, notice, or sit with.
- Be kind but not saccharine. You may be funny. You are never cruel.
- You read patterns and possibilities, never certainties. Never predict literal death, illness, accidents, or disaster.
- Stay in character. Do not lecture about this being unscientific and do not add disclaimers; the website handles that.
- Write in plain Markdown. No preamble about yourself, no sign-off, no closing questions.`;

const TAROT_SYSTEM = `${PERSONA}

How you read the cards:
- Use the traditional Rider-Waite-Smith meanings. Honor reversals: a reversed card is the blocked, inward, delayed, or excessive form of its upright meaning, not simply its opposite.
- Read the spread as one story. Notice how the cards talk to each other: a repeated suit, a run of Major Arcana, court cards facing off, a suit that never shows up, a number that recurs.
- Death and the Tower are about endings and upheaval. Say so plainly and kindly.

Format:
- Open with one or two sentences that set the scene for this particular spread.
- Then one "## " heading per position, in the order given, written as "## Position — Card Name" (add " (reversed)" when the card is reversed). Under each heading, two to four sentences.
- Finish with a "## The thread" section of three to six sentences tying the cards together, then one final line in bold: a single-sentence takeaway.
- Keep to the word count you are given.`;

const ASTRO_SYSTEM = `${PERSONA}

How you read the sky:
- Ground the reading in the sun sign's classic character, its element and modality, the time of year, and the moon phase you are given.
- Do not invent precise planetary positions, transits, aspects, or house placements; you cannot compute them. Speak about the general astrological weather instead.
- If a birth time or place was given, treat it as flavor (the rising sign is a mystery you may riff on) without claiming an exact chart.

Format:
- Open with one or two sentences about the sky right now for this sign.
- Then exactly three "## " sections using the headings you are given, in order, two to four sentences each.
- Finish with one final line in bold: a single-sentence mantra for the querent.
- Keep to the word count you are given.`;

let client = null;
let modelCache = { id: null, at: 0 };
const hits = new Map();

class Bad extends Error {}
const fail = (error, status = 400) => Response.json({ error }, { status });
const clip = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const isoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function getClient() {
  return (client ??= new Anthropic());
}

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  if (recent.length >= RATE.max) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

/** The newest model whose id starts with claude-haiku-, cached for a few hours. */
async function newestHaiku(anthropic) {
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

function buildTarot(body) {
  const spread = SPREADS[body.spread];
  if (!spread) throw new Bad("Pick a real spread.");
  const picks = Array.isArray(body.cards) ? body.cards : [];
  if (picks.length !== spread.positions.length) throw new Bad(`${spread.name} takes ${spread.positions.length} cards.`);

  const byName = new Map(DECK.map((c) => [c.name, c]));
  const seen = new Set();
  const cards = picks.map((p) => {
    const card = byName.get(p?.name);
    if (!card || seen.has(card.name)) throw new Bad("That isn't a card in this deck.");
    seen.add(card.name);
    return { ...card, reversed: p.reversed === true };
  });

  const question = clip(body.question, MAX_QUESTION);
  const user = [
    `Spread: ${spread.name} (${cards.length} card${cards.length === 1 ? "" : "s"}).`,
    SPREAD_NOTES[body.spread],
    question ? `The querent asks: "${question}"` : "The querent asked no question; give a general reading.",
    "",
    "The cards, in position order:",
    ...cards.map((c, i) => `${i + 1}. ${spread.positions[i]} — ${c.name}${c.reversed ? " (reversed)" : ""}`),
    "",
    `Aim for about ${TAROT_WORDS[body.spread]} words.`,
  ].filter((line) => line !== undefined).join("\n");

  return { system: TAROT_SYSTEM, user };
}

function buildAstrology(body) {
  const sign = SIGNS.find((s) => s.name === body.sign);
  if (!sign) throw new Bad("Pick a sign.");
  const focus = FOCUSES[body.focus] ? body.focus : "today";
  const birthDate = isoDate(body.birthDate) && Date.parse(body.birthDate) <= Date.now() ? body.birthDate : "";
  const birthTime = typeof body.birthTime === "string" && /^\d{2}:\d{2}$/.test(body.birthTime) ? body.birthTime : "";
  const birthPlace = clip(body.birthPlace, MAX_PLACE);
  const question = clip(body.question, MAX_QUESTION);
  const today = isoDate(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const todayText = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const moon = moonPhase(new Date());

  const user = [
    `Sign: ${sign.name} ${sign.glyph} (${sign.element}, ${sign.modality}; ${sign.dates}).`,
    birthDate ? `Birthday: ${birthDate}${birthTime ? ` at ${birthTime}` : ""}${birthPlace ? ` in ${birthPlace}` : ""}.` : undefined,
    `Today: ${todayText}. Moon: ${moon.name} ${moon.glyph}, ${moon.illumination}% illuminated, day ${moon.age} of the cycle.`,
    `Focus: ${FOCUSES[focus]}.`,
    question ? `The querent asks: "${question}"` : "The querent asked no question.",
    `Use these three section headings, in order: ${FOCUS_SECTIONS[focus].map((s) => `"${s}"`).join(", ")}.`,
    `Aim for about ${ASTRO_WORDS} words.`,
  ].filter((line) => line !== undefined).join("\n");

  return { system: ASTRO_SYSTEM, user };
}

function apiFailure(err) {
  // 401 from the API, or the SDK finding no credentials at all before it ever sends a request.
  const noKey = err instanceof Anthropic.AuthenticationError || /auth|api.?key|credential/i.test(err?.message ?? "");
  if (noKey) return fail("The crystal ball isn't plugged in (API key missing or invalid).", 500);
  if (err instanceof Anthropic.RateLimitError) return fail("Too many seekers at once. Try again in a moment.", 429);
  if (err instanceof Anthropic.APIConnectionError) return fail("Couldn't reach the beyond. Try again.", 502);
  if (err instanceof Anthropic.APIError) return fail(`The beyond answered with an error (${err.status}).`, 502);
  console.error("reading failed", err);
  return fail("Something unexpected happened.", 500);
}

export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (limited(ip)) return fail("The spirits need a minute. Try again shortly.", 429);

  let body;
  try { body = await request.json(); } catch { return fail("Send JSON."); }

  let prompt;
  try {
    if (body?.kind === "tarot") prompt = buildTarot(body);
    else if (body?.kind === "astrology") prompt = buildAstrology(body);
    else throw new Bad("Unknown kind of reading.");
  } catch (err) {
    if (err instanceof Bad) return fail(err.message);
    throw err;
  }

  let anthropic;
  try { anthropic = getClient(); } catch { return fail("The crystal ball isn't plugged in (no API key configured).", 500); }

  const model = await newestHaiku(anthropic);
  const stream = anthropic.messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    system: prompt.system,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: prompt.user }],
  });

  // Wait for the first event before answering, so an upstream failure gets a real HTTP status.
  const events = stream[Symbol.asyncIterator]();
  let first;
  try { first = await events.next(); } catch (err) { return apiFailure(err); }

  const enc = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      const push = (ev) => {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") controller.enqueue(enc.encode(ev.delta.text));
      };
      try {
        if (!first.done) push(first.value);
        for (let r = await events.next(); !r.done; r = await events.next()) push(r.value);
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(enc.encode("\n\n*Madame Haiku sets the cards down. The spirits decline to speak on this one.*"));
        else if (final.stop_reason === "max_tokens") controller.enqueue(enc.encode("\n\n*…and the vision fades before the end.*"));
      } catch (err) {
        console.error("reading stream failed", err);
        controller.enqueue(enc.encode("\n\n*The connection to the beyond dropped mid-reading.*"));
      } finally {
        controller.close();
      }
    },
    cancel() { stream.abort(); },
  });

  return new Response(out, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-model": model },
  });
}
