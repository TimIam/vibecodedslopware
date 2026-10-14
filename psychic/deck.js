// Shared by the page (as a browser ES module) and by api/reading.js (Node ESM).
// Keep it dependency-free.

const ROMAN = ["0","I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX","XXI"];

export const MAJOR = [
  ["The Fool", "🃏"], ["The Magician", "🪄"], ["The High Priestess", "🔮"], ["The Empress", "🌾"],
  ["The Emperor", "🏛️"], ["The Hierophant", "🗝️"], ["The Lovers", "💞"], ["The Chariot", "🏇"],
  ["Strength", "🦁"], ["The Hermit", "🏮"], ["Wheel of Fortune", "🎡"], ["Justice", "⚖️"],
  ["The Hanged Man", "🙃"], ["Death", "💀"], ["Temperance", "🏺"], ["The Devil", "😈"],
  ["The Tower", "🗼"], ["The Star", "⭐"], ["The Moon", "🌙"], ["The Sun", "☀️"],
  ["Judgement", "🎺"], ["The World", "🌍"],
];

export const SUITS = { Wands: "🔥", Cups: "🏆", Swords: "⚔️", Pentacles: "🪙" };
export const RANKS = ["Ace","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Page","Knight","Queen","King"];
const RANK_LABEL = ["A","2","3","4","5","6","7","8","9","10","P","Kn","Q","K"];

export const DECK = [
  ...MAJOR.map(([name, glyph], i) => ({ name, glyph, arcana: "major", label: ROMAN[i] })),
  ...Object.entries(SUITS).flatMap(([suit, glyph]) =>
    RANKS.map((rank, i) => ({ name: `${rank} of ${suit}`, glyph, arcana: "minor", suit, rank, label: RANK_LABEL[i] }))),
];

export const SPREADS = {
  one: {
    name: "One Card",
    tagline: "A single card. A single answer. Mostly.",
    positions: ["The card"],
  },
  three: {
    name: "Past, Present, Future",
    tagline: "The classic three. Where you've been, where you are, where this is going.",
    positions: ["Past", "Present", "Future"],
  },
  slop: {
    name: "The Slop Spread",
    tagline: "House special. Five cards, no tradition, pure vibes.",
    positions: ["What you want", "What you'll actually get", "Why", "Who's to blame", "The vibes"],
  },
  horseshoe: {
    name: "Horseshoe",
    tagline: "Seven cards in an arc, for a question with more than one side.",
    positions: ["The past", "The present", "Hidden influences", "Obstacles", "The attitudes of others", "What you should do", "The likely outcome"],
  },
  celtic: {
    name: "Celtic Cross",
    tagline: "The big one. Ten cards, a cross and a staff, the whole situation laid bare.",
    positions: ["The heart of the matter", "What crosses it", "The foundation", "The recent past", "What crowns it", "The near future", "You, as you see yourself", "How others see it", "Hopes and fears", "The outcome"],
  },
};

export const SIGNS = [
  { name: "Aries",       glyph: "♈", element: "Fire",  modality: "Cardinal", dates: "Mar 21 – Apr 19", start: [3, 21] },
  { name: "Taurus",      glyph: "♉", element: "Earth", modality: "Fixed",    dates: "Apr 20 – May 20", start: [4, 20] },
  { name: "Gemini",      glyph: "♊", element: "Air",   modality: "Mutable",  dates: "May 21 – Jun 20", start: [5, 21] },
  { name: "Cancer",      glyph: "♋", element: "Water", modality: "Cardinal", dates: "Jun 21 – Jul 22", start: [6, 21] },
  { name: "Leo",         glyph: "♌", element: "Fire",  modality: "Fixed",    dates: "Jul 23 – Aug 22", start: [7, 23] },
  { name: "Virgo",       glyph: "♍", element: "Earth", modality: "Mutable",  dates: "Aug 23 – Sep 22", start: [8, 23] },
  { name: "Libra",       glyph: "♎", element: "Air",   modality: "Cardinal", dates: "Sep 23 – Oct 22", start: [9, 23] },
  { name: "Scorpio",     glyph: "♏", element: "Water", modality: "Fixed",    dates: "Oct 23 – Nov 21", start: [10, 23] },
  { name: "Sagittarius", glyph: "♐", element: "Fire",  modality: "Mutable",  dates: "Nov 22 – Dec 21", start: [11, 22] },
  { name: "Capricorn",   glyph: "♑", element: "Earth", modality: "Cardinal", dates: "Dec 22 – Jan 19", start: [12, 22] },
  { name: "Aquarius",    glyph: "♒", element: "Air",   modality: "Fixed",    dates: "Jan 20 – Feb 18", start: [1, 20] },
  { name: "Pisces",      glyph: "♓", element: "Water", modality: "Mutable",  dates: "Feb 19 – Mar 20", start: [2, 19] },
];

export const FOCUSES = {
  today: "Today",
  week: "The week ahead",
  love: "Love",
  work: "Work & money",
  big: "The big picture",
};

/** Sun sign for a calendar month (1-12) and day. */
export function signFor(month, day) {
  const key = month * 100 + day;
  const ordered = [...SIGNS].sort((a, b) => (a.start[0] * 100 + a.start[1]) - (b.start[0] * 100 + b.start[1]));
  let found = ordered[ordered.length - 1]; // Capricorn wraps the year: Jan 1-19 falls through to it
  for (const s of ordered) if (s.start[0] * 100 + s.start[1] <= key) found = s;
  return found;
}

/** Approximate moon phase for a Date, good to within a few hours. */
export function moonPhase(date = new Date()) {
  const synodic = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNewMoon) / 86400000;
  const age = ((days % synodic) + synodic) % synodic;
  const names = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"];
  const glyphs = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  const i = Math.floor((age / synodic) * 8 + 0.5) % 8;
  const illumination = Math.round((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2 * 100);
  return { age: Math.round(age * 10) / 10, name: names[i], glyph: glyphs[i], illumination };
}
