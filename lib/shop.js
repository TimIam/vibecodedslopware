// Stripe and Printful calls for the merch shop, with plain fetch (no SDKs).
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PRINTFUL_API_TOKEN, and optionally
// PRINTFUL_STORE_ID (only for account-level tokens), PRINTFUL_CONFIRM=1 (send orders straight to
// production instead of leaving them as drafts to approve in the Printful dashboard), SHOP_ORIGIN
// (the public site origin that Printful downloads print files from; defaults to the request's origin).

import crypto from "node:crypto";

export const env = (k) => process.env[k] || "";
export const shopIsOpen = () => Boolean(env("STRIPE_SECRET_KEY") && env("STRIPE_WEBHOOK_SECRET") && env("PRINTFUL_API_TOKEN"));
export const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

// {a: {b: [x]}} → "a[b][0]=x", the form encoding Stripe's API takes
function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? form(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data.error?.message || res.status}`);
  return data;
}

// Verifies a Stripe-Signature header ("t=...,v1=...") against the raw body. Returns the parsed event or null.
export function verifyStripeEvent(raw, header, secret = env("STRIPE_WEBHOOK_SECRET"), toleranceSec = 300) {
  if (!header || !secret) return null;
  const parts = Object.groupBy(header.split(",").map((p) => p.split("=")), ([k]) => k);
  const t = parts.t?.[0]?.[1];
  const sigs = (parts.v1 || []).map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return null;
  const want = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest();
  const ok = sigs.some((s) => { const got = Buffer.from(s, "hex"); return got.length === want.length && crypto.timingSafeEqual(got, want); });
  return ok ? JSON.parse(raw) : null;
}

export async function printful(method, path, body) {
  const headers = { authorization: `Bearer ${env("PRINTFUL_API_TOKEN")}`, "content-type": "application/json" };
  if (env("PRINTFUL_STORE_ID")) headers["x-pf-store-id"] = env("PRINTFUL_STORE_ID");
  const res = await fetch(`https://api.printful.com/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
