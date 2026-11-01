// util.js — number/time formatting and small pure math helpers shared by sim, scene and ui.
// Doubles only, no BigInt (§2). Money suffixes: K M B T Qa Qi Sx Sp Oc No Dc.

export const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// Scale |n| into [1, 999.5) and round to 3 significant figures. Returns { v, i } with SUFFIXES[i]. Past the last
// suffix (>= 1e36, beyond the §2 table) v keeps growing and sig3 prints it whole: "1000Dc", "150000Dc", never "1e+3".
function scaled(n) {
  let i = 0;
  while (n >= 999.5 && i < SUFFIXES.length - 1) { n /= 1000; i++; }
  return { v: Number(n.toPrecision(3)), i };
}

// 3 significant figures of a value already scaled into [1, 1000): 1.23, 12.3, 123. Whole number past the last suffix.
function sig3(v) {
  if (v >= 999.5) return v.toFixed(0);
  return v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0);
}

// "$0.00" "$15.00" "$300" "$1.30K" "$1.90M" "$300M" "$1.00Qa". Negative: "-$5.00". NaN: "$0.00".
export function fmtMoney(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '$0.00';
  if (!Number.isFinite(n)) return n < 0 ? '-$∞' : '$∞';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 99.995) return `${sign}$${n.toFixed(2)}`;
  if (n < 999.5) return `${sign}$${n.toFixed(0)}`;
  const { v, i } = scaled(n);
  return `${sign}$${sig3(v)}${SUFFIXES[i]}`;
}

// Shop-row prices: whole dollars below $1,000 ("$15", "$16", "$43", "$225", "$600") as §12 prints them, fmtMoney above
// that ("$1.30K"). Cash, income and bounties keep their cents through fmtMoney.
export function fmtPrice(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fmtMoney(n);
  if (Math.abs(n) >= 999.5) return fmtMoney(n);
  return `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n))}`;
}

// Plain quantity: integers below 1000 as-is ("12"), otherwise 3 significant figures with a suffix
// ("0.25", "3.3", "1.30K", "12.5M").
export function fmtNum(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return n < 0 ? '-∞' : '∞';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 999.5) return sign + String(Number(n.toPrecision(3)));
  const { v, i } = scaled(n);
  return `${sign}${sig3(v)}${SUFFIXES[i]}`;
}

// Money per second with an explicit sign: "+$1.20K/s", "-$5.00/s".
export function fmtRate(n) {
  const s = fmtMoney(n);
  return (s.startsWith('-') ? s : '+' + s) + '/s';
}

// Clock style for the run timer and contract terms: "0:07", "4:36", "1h06m", "12h00m".
export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}:${String(x).padStart(2, '0')}`;
}

// Prose style for the offline card: "45s", "12m 05s", "6h 12m", "2d 3h".
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(x).padStart(2, '0')}s`;
  return `${x}s`;
}

// Meter numbers keep one decimal when small so "3.0 kW" reads as a capacity, not a count: 3.3 → "3.3",
// 3 → "3.0", 0.25 → "0.25", 12 → "12.0", 500 → "500".
function meterNum(v) {
  const s = v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '.0') : s;
}

// Meter inputs: NaN, Infinity, null and negatives all read as 0 (§2 defines u = 0 when capacity is 0, so a finite
// number is the only legal input; anything else is a bug upstream that should not print "Infinity").
const nonneg = n => { n = Number(n); return Number.isFinite(n) && n > 0 ? n : 0; };

// Past the last unit v keeps growing and meterNum prints it whole ("10000 TW"), never an exponent.
function unitScale(n, units) {
  let i = 0;
  while (n >= 999.5 && i < units.length - 1) { n /= 1000; i++; }
  return { v: n, i };
}

const KW_UNITS = ['kW', 'MW', 'GW', 'TW'];
const GBPS_UNITS = ['Gbps', 'Tbps', 'Pbps', 'Ebps'];

// "3.3 kW", "2.0 MW", "10.0 GW".
export function fmtKw(kw) {
  const { v, i } = unitScale(nonneg(kw), KW_UNITS);
  return `${meterNum(v)} ${KW_UNITS[i]}`;
}

// "1.1 Gbps", "4.0 Tbps", "25.0 Tbps".
export function fmtGbps(gbps) {
  const { v, i } = unitScale(nonneg(gbps), GBPS_UNITS);
  return `${meterNum(v)} ${GBPS_UNITS[i]}`;
}

// HUD meter line "3.3 / 3.0 kW": both numbers share the unit picked for the larger of the two.
// meter is 'power' | 'cooling' | 'network'.
export function fmtMeter(demand, cap, meter) {
  const units = meter === 'network' ? GBPS_UNITS : KW_UNITS;
  const d = nonneg(demand), c = nonneg(cap);
  const { i } = unitScale(Math.max(d, c), units);
  const k = 1000 ** i;
  return `${meterNum(d / k)} / ${meterNum(c / k)} ${units[i]}`;
}

// "92%" for utilisation displays (u = demand / capacity). Non-finite u prints "0%", not "Infinity%".
export function fmtPct(u, digits = 0) {
  return `${(nonneg(u) * 100).toFixed(digits)}%`;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  if (e0 === e1) return x >= e1 ? 1 : 0; // zero-width edge: a hard step instead of 0/0
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Deterministic 32-bit PRNG. Returns () => [0, 1). Same seed, same sequence, across sessions and engines.
// The seed is read as an unsigned 32-bit integer (seed >>> 0): fractions truncate and values wrap at 2^32, so 1.7, 1
// and 2^32 + 1 give the same stream. Pass integers in [0, 2^32); mix in a run counter before seeding if you need
// more streams than that.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr.length ? arr[Math.floor(rng() * arr.length)] : undefined;
}

// Weighted choice. weightOf(item) returns a non-negative weight (defaults to item.w, else 1; NaN counts as 0).
// A zero-weight item is never returned; with no positive weight (or no items) the result is undefined, so a caller
// filtering a contract board gets "nothing eligible" rather than an ineligible pick.
export function weightedPick(rng, items, weightOf = it => (it && it.w != null ? it.w : 1)) {
  const w = it => Math.max(0, weightOf(it) || 0);
  let total = 0;
  for (const it of items) total += w(it);
  if (!(total > 0)) return undefined;
  let r = rng() * total, last;
  for (const it of items) {
    const wi = w(it);
    if (wi <= 0) continue;
    last = it;
    r -= wi;
    if (r < 0) return it;
  }
  return last; // float round-off left r at exactly 0: the last positive-weight item
}
