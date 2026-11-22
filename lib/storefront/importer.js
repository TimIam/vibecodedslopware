// Validated manual imports (Epic Games Store, or any store without an API).
//
// Epic publishes no reporting API, and the Developer Portal's export format is not documented, so
// we don't parse it directly. Copy the numbers the portal shows into this template instead:
//
//   platform,external_id,date,basis,metric,currency,value
//   epic,<product or offer id>,2026-11-01,day,sales_units,,12
//   epic,<product or offer id>,2026-11-01,day,revenue_gross,USD,95.88
//
// basis: day (that one day) or cumulative (lifetime total as of that date).
// metric: sales_units, refund_units, free_claims, store_downloads, revenue_gross, revenue_net.
// currency: ISO 4217 for revenue rows, empty otherwise. value: a plain non-negative number.
// The whole file is rejected if any row is wrong; nothing is half-imported.
import crypto from "node:crypto";

export const IMPORT_HEADER = ["platform", "external_id", "date", "basis", "metric", "currency", "value"];
const METRICS = new Set(["sales_units", "refund_units", "free_claims", "store_downloads", "revenue_gross", "revenue_net"]);
const MAX_BYTES = 2_000_000;
const MAX_ROWS = 20_000;

export class ImportError extends Error {
  constructor(errors) { super(errors[0]); this.errors = errors; }
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r" && text[i + 1] === "\n") i++;
    if (c === "\n" || c === "\r") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (quoted) throw new ImportError(["unterminated quoted field"]);
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

// listings: [{ id (uuid), platform, external_id }] the member can see.
// -> { sha256, rows: [{listing_id, metric, basis, day, currency, value}] }
export function validateImport({ source, text, listings, today = new Date().toISOString().slice(0, 10) }) {
  if (source !== "epic_import" && source !== "manual_import") throw new ImportError(["unknown import source"]);
  if (typeof text !== "string" || !text.length) throw new ImportError(["empty file"]);
  if (Buffer.byteLength(text) > MAX_BYTES) throw new ImportError(["file is larger than 2 MB"]);
  const sha256 = crypto.createHash("sha256").update(text).digest("hex");
  const table = parseCsv(text.replace(/^﻿/, ""));
  const header = (table.shift() ?? []).map((h) => h.trim().toLowerCase());
  if (header.join(",") !== IMPORT_HEADER.join(",")) throw new ImportError([`header must be exactly: ${IMPORT_HEADER.join(",")}`]);
  if (!table.length) throw new ImportError(["no data rows"]);
  if (table.length > MAX_ROWS) throw new ImportError([`more than ${MAX_ROWS} rows`]);

  const byKey = new Map();
  for (const l of listings) {
    const k = `${l.platform}\u0000${l.external_id}`;
    byKey.set(k, byKey.has(k) ? "ambiguous" : l);
  }
  const errors = [], rows = [], seen = new Set();
  table.forEach((cells, i) => {
    const line = i + 2;
    if (cells.length !== IMPORT_HEADER.length) { errors.push(`line ${line}: expected ${IMPORT_HEADER.length} columns`); return; }
    const [platform, externalId, day, basis, metric, currencyRaw, valueRaw] = cells.map((c) => c.trim());
    const currency = currencyRaw.toUpperCase();
    if (source === "epic_import" && platform !== "epic") errors.push(`line ${line}: an Epic import may only contain platform "epic"`);
    const l = byKey.get(`${platform}\u0000${externalId}`);
    if (!l) errors.push(`line ${line}: no listing for ${platform} id "${externalId.slice(0, 60)}" (add it to the catalog first)`);
    else if (l === "ambiguous") errors.push(`line ${line}: ${platform} id "${externalId.slice(0, 60)}" matches more than one listing`);
    if (!validDate(day)) errors.push(`line ${line}: date must be YYYY-MM-DD`);
    else if (day > today) errors.push(`line ${line}: date is in the future`);
    if (basis !== "day" && basis !== "cumulative") errors.push(`line ${line}: basis must be day or cumulative`);
    if (!METRICS.has(metric)) errors.push(`line ${line}: unknown metric "${metric.slice(0, 30)}"`);
    const revenue = metric.startsWith("revenue_");
    if (revenue && !/^[A-Z]{3}$/.test(currency)) errors.push(`line ${line}: revenue needs a 3-letter currency code`);
    if (!revenue && currency) errors.push(`line ${line}: only revenue rows take a currency`);
    if (!/^\d+(\.\d{1,4})?$/.test(valueRaw)) errors.push(`line ${line}: value must be a non-negative number (no symbols or separators)`);
    else if (!revenue && !/^\d+$/.test(valueRaw)) errors.push(`line ${line}: unit counts must be whole numbers`);
    const key = `${platform}|${externalId}|${day}|${basis}|${metric}|${currency}`;
    if (seen.has(key)) errors.push(`line ${line}: duplicate of an earlier row`);
    seen.add(key);
    if (l && l !== "ambiguous") rows.push({ listing_id: l.id, metric, basis, day, currency, value: valueRaw });
  });
  if (errors.length) throw new ImportError(errors.slice(0, 50));
  return { sha256, rows };
}
