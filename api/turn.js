// GET /api/turn → { iceServers } for voice chat in Par for the Curse.
//
// Two players who are both behind strict NATs cannot reach each other directly; a TURN server relays
// their audio. This asks Cloudflare's TURN service for credentials that last a few hours and hands them
// to the browser. The long-lived key stays here, in two environment variables:
//
//   CLOUDFLARE_TURN_KEY_ID      the Turn Token ID   (Cloudflare dashboard → Realtime → TURN Server)
//   CLOUDFLARE_TURN_API_TOKEN   that key's API token
//
// With neither set this answers { iceServers: [] } and the game carries on with public STUN only.

const TTL = 4 * 60 * 60;      // seconds a credential lasts: only needed while a connection is being set up
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET(request) {
  // Only pages on this site may ask. (Not a lock: it stops other sites' pages borrowing the relay.)
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return json({ error: "not for other sites" }, 403);

  const id = process.env.CLOUDFLARE_TURN_KEY_ID, token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!id || !token) return json({ iceServers: [], relay: false });

  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ttl: TTL }),
    });
    if (!r.ok) throw new Error(`Cloudflare answered ${r.status}`);
    const data = await r.json();
    // One entry or a list, depending on the API version. Keep only what a browser needs, and drop the
    // port 53 addresses, which browsers refuse and then sit waiting on.
    const servers = [].concat(data.iceServers || []).map((s) => {
      const urls = [].concat(s.urls || []).filter((u) => typeof u === "string" && /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u));
      const out = { urls };
      if (typeof s.username === "string" && typeof s.credential === "string") { out.username = s.username; out.credential = s.credential; }
      return out;
    }).filter((s) => s.urls.length);
    return json({ iceServers: servers, relay: servers.some((s) => s.credential), ttl: TTL });
  } catch (err) {
    console.error("turn credentials failed:", err?.message ?? err);
    return json({ iceServers: [], relay: false });
  }
}
