// GET  /api/shop-checkout → { open }: whether checkout is wired up (Stripe and Printful keys are set).
// POST /api/shop-checkout { items: [{ design, garment, color, size, qty }], region } → { url } of a Stripe Checkout page.
//
// Every price comes from shop/catalog.js; the browser only says what it wants. Each line carries its
// Printful variant and design in the Stripe product's metadata, which api/shop-webhook.js reads back.

import { resolveLine, shippingFor, SHIPPING } from "../shop/catalog.js";
import { env, json, shopIsOpen, stripe } from "../lib/shop.js";

const MAX_LINES = 20;

export function GET() {
  return json({ open: shopIsOpen() });
}

export async function POST(request) {
  if (!shopIsOpen()) return json({ error: "The till isn't plugged in yet. Check back soon." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "That cart didn't make sense." }, 400); }
  const region = SHIPPING[body?.region] ? body.region : null;
  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_LINES + 1) : [];
  const lines = items.map(resolveLine);
  if (!region || !lines.length || items.length > MAX_LINES || lines.some((l) => !l)) {
    return json({ error: "Something in your cart isn't for sale anymore. Remove it and try again." }, 400);
  }

  const origin = env("SHOP_ORIGIN") || new URL(request.url).origin;
  const https = origin.startsWith("https://");
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const ship = SHIPPING[region];

  try {
    const session = await stripe("POST", "checkout/sessions", {
      mode: "payment",
      success_url: `${origin}/shop/?paid=1`,
      cancel_url: `${origin}/shop/`,
      line_items: lines.map((l, i) => ({
        quantity: l.qty,
        price_data: {
          currency: "usd",
          unit_amount: l.unit,
          product_data: {
            name: `${l.design.title} ${l.garment.name}`,
            description: `${items[i].color}, size ${items[i].size}. ${l.garment.blank}.`,
            images: https ? [`${origin}/shop/designs/${l.design.id}.png`] : undefined,
            metadata: { variant: l.variant, design: l.design.id },
          },
        },
      })),
      shipping_address_collection: { allowed_countries: ship.countries },
      shipping_options: [{
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: `Standard shipping (${ship.label})`,
          fixed_amount: { amount: shippingFor(region, count), currency: "usd" },
          delivery_estimate: { minimum: { unit: "business_day", value: region === "us" ? 5 : 8 }, maximum: { unit: "business_day", value: region === "us" ? 12 : 20 } },
        },
      }],
      metadata: { shop: "vibecodedslopware", region },
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again in a minute." }, 502);
  }
}
