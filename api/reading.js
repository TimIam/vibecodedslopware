// POST /api/reading — streams a tarot or astrology reading from the newest Claude Haiku.
//
// Body (tarot):     { kind: "tarot", spread, question?, cards: [{ name, reversed }] }
// Body (astrology): { kind: "astrology", sign, focus?, birthDate?, birthTime?, birthPlace?, question?, today? }
// Response: text/plain Markdown, streamed as it is written. Header x-model says which model read.
//
// Needs ANTHROPIC_API_KEY in the environment. The cards are drawn in the browser; this
// function only validates them against the deck and asks the model to interpret them.

import { DECK, SPREADS, SIGNS, FOCUSES, moonPhase } from "../psychic/deck.js";
import { PERSONA, getClient, newestHaiku, fail, isoDate, clip, clientIp, rateLimited, apiFailure, longDate } from "../lib/haiku.js";

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

const TAROT_SYSTEM = `${PERSONA}

How you read the cards:
- Use the traditional Rider-Waite-Smith meanings. Honor reversals: a reversed card is the blocked, inward, delayed, or excessive form of its upright meaning, not simply its opposite.
- Read the spread as one story. Notice how the cards talk to each other: a repeated suit, a run of Major Arcana, court cards facing off, a suit that never shows up, a number that recurs.
- Death and the Tower are about endings and upheaval. Say so plainly and kindly.

Format:
- Open with one or two sentences that set the scene for this particular spread.
- Then one "## " heading per position, in the order given, written as "## Position — Card Name" (add " (reversed)" when the card is reversed). Under each heading, two to four sentences.
- Then a "## The thread" section of three to six sentences tying the cards together.
- Finish with a "## To carry with you" section containing exactly one bold sentence: the takeaway.
- Keep to the word count you are given.`;

const ASTRO_SYSTEM = `${PERSONA}

How you read the sky:
- Ground the reading in the sun sign's classic character, its element and modality, the time of year, and the moon phase you are given.
- Do not invent precise planetary positions, transits, aspects, or house placements; you cannot compute them. Speak about the general astrological weather instead.
- If a birth time or place was given, treat it as flavor (the rising sign is a mystery you may riff on) without claiming an exact chart.

Format:
- Open with one or two sentences about the sky right now for this sign.
- Then exactly three "## " sections using the headings you are given, in order, two to four sentences each.
- Finish with a "## A line to carry" section containing exactly one bold sentence: a mantra for the querent.
- Keep to the word count you are given.`;

class Bad extends Error {}

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
  const moon = moonPhase(new Date());

  const user = [
    `Sign: ${sign.name} ${sign.glyph} (${sign.element}, ${sign.modality}; ${sign.dates}).`,
    birthDate ? `Birthday: ${birthDate}${birthTime ? ` at ${birthTime}` : ""}${birthPlace ? ` in ${birthPlace}` : ""}.` : undefined,
    `Today: ${longDate(today)}. Moon: ${moon.name} ${moon.glyph}, ${moon.illumination}% illuminated, day ${moon.age} of the cycle.`,
    `Focus: ${FOCUSES[focus]}.`,
    question ? `The querent asks: "${question}"` : "The querent asked no question.",
    `Use these three section headings, in order: ${FOCUS_SECTIONS[focus].map((s) => `"${s}"`).join(", ")}.`,
    `Aim for about ${ASTRO_WORDS} words.`,
  ].filter((line) => line !== undefined).join("\n");

  return { system: ASTRO_SYSTEM, user };
}

export async function POST(request) {
  if (rateLimited("reading", clientIp(request), RATE)) return fail("The spirits need a minute. Try again shortly.", 429);

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
        if (final.stop_reason === "refusal") controller.enqueue(enc.encode("\n\n## A disturbance\nMadame Haiku sets the cards down. The spirits decline to speak on this one."));
        else if (final.stop_reason === "max_tokens") controller.enqueue(enc.encode("\n\n*…and the vision fades before the end.*"));
      } catch (err) {
        console.error("reading stream failed", err);
        controller.enqueue(enc.encode("\n\n## A disturbance\nThe connection to the beyond dropped mid-reading."));
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
