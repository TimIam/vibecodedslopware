// POST /api/shop-webhook — Stripe calls this when a checkout is paid; it turns the order into a Printful order.
//
// Set it up in Stripe (Developers → Webhooks) for checkout.session.completed and
// checkout.session.async_payment_succeeded, and put the signing secret in STRIPE_WEBHOOK_SECRET.
// The Printful external_id is derived from the Stripe session id, so a retried webhook can't place the
// order twice. Orders are drafts (approve them in the Printful dashboard) unless PRINTFUL_CONFIRM=1.
// Anything that fails returns 500 so Stripe retries it, for up to three days.

import crypto from "node:crypto";
import { DESIGNS } from "../shop/catalog.js";
import { env, json, printful, stripe, verifyStripeEvent } from "../lib/shop.js";

const PAID = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

export async function POST(request) {
  const raw = await request.text();
  const event = verifyStripeEvent(raw, request.headers.get("stripe-signature"));
  if (!event) return json({ error: "bad signature" }, 400);
  if (!PAID.has(event.type)) return json({ ignored: event.type });

  const session = event.data.object;
  if (session.payment_status !== "paid" || session.metadata?.shop !== "vibecodedslopware") return json({ ignored: "not a paid shop order" });

  const origin = env("SHOP_ORIGIN") || new URL(request.url).origin;
  const ship = session.collected_information?.shipping_details ?? session.shipping_details;
  const a = ship?.address;
  if (!a) { console.error(`shop: session ${session.id} has no shipping address`); return json({ error: "no address" }, 500); }

  try {
    const { data: lineItems } = await stripe("GET", `checkout/sessions/${session.id}/line_items?limit=100&expand[]=data.price.product`);
    const items = lineItems.map((li) => {
      const { variant, design } = li.price.product.metadata;
      if (!DESIGNS.some((d) => d.id === design)) throw new Error(`unknown design ${design}`);
      return {
        variant_id: Number(variant),
        quantity: li.quantity,
        name: li.description,
        retail_price: (li.price.unit_amount / 100).toFixed(2),
        files: [{ type: "front", url: `${origin}/shop/print/${design}.png` }],
      };
    });

    const externalId = "vcs-" + crypto.createHash("sha256").update(session.id).digest("hex").slice(0, 28);
    const confirm = env("PRINTFUL_CONFIRM") === "1";
    const res = await printful("POST", `orders?confirm=${confirm}`, {
      external_id: externalId,
      shipping: "STANDARD",
      recipient: {
        name: ship.name,
        address1: a.line1,
        address2: a.line2 || undefined,
        city: a.city,
        state_code: a.state || undefined,
        country_code: a.country,
        zip: a.postal_code,
        email: session.customer_details?.email,
      },
      items,
      retail_costs: {
        currency: "USD",
        subtotal: (session.amount_subtotal / 100).toFixed(2),
        shipping: ((session.total_details?.amount_shipping ?? 0) / 100).toFixed(2),
        tax: ((session.total_details?.amount_tax ?? 0) / 100).toFixed(2),
        total: (session.amount_total / 100).toFixed(2),
      },
    });

    const duplicate = !res.ok && /external.?id/i.test(JSON.stringify(res.data)) && /exist|already|unique/i.test(JSON.stringify(res.data));
    if (!res.ok && !duplicate) throw new Error(`Printful ${res.status}: ${JSON.stringify(res.data).slice(0, 500)}`);

    const orderId = res.data?.result?.id;
    if (orderId && session.payment_intent) {
      // note the Printful order on the payment, so it shows up in the Stripe dashboard
      await stripe("POST", `payment_intents/${session.payment_intent}`, { metadata: { printful_order: orderId } }).catch(() => {});
    }
    console.log(`shop: ${session.id} → Printful ${duplicate ? "(already placed)" : `order ${orderId} (${confirm ? "confirmed" : "draft"})`}`);
    return json({ ok: true, printful: orderId ?? "duplicate" });
  } catch (e) {
    console.error(`shop: ${session.id} failed: ${e.message}`);
    return json({ error: "fulfilment failed" }, 500);
  }
}
