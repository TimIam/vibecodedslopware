// Private storefront dashboard. Signs in with Supabase Auth (email one-time code, no sign-ups),
// keeps the session in sessionStorage only, and asks /api/admin for everything; the server checks
// membership and the database applies RLS. Nothing here is trusted for access: it only decides
// which screen to show. All data is rendered with textContent, never as HTML.

const $ = (id) => document.getElementById(id);
const KEY = "storefront-session";
let config = null;

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
};

// ---------------------------------------------------------------------------------------------
// Session
const session = {
  get() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } },
  set(s) { sessionStorage.setItem(KEY, JSON.stringify(s)); },
  clear() { sessionStorage.removeItem(KEY); },
};

async function auth(path, body, token) {
  const headers = { apikey: config.publishableKey, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || `sign-in failed (${res.status})`);
  return data;
}

const store = (d) => session.set({ access: d.access_token, refresh: d.refresh_token, expires: Date.now() + (d.expires_in ?? 3600) * 1000 });

async function token() {
  const s = session.get();
  if (!s) return null;
  if (config.mode === "dev") return s.access;
  if (Date.now() < s.expires - 60_000) return s.access;
  try { store(await auth("token?grant_type=refresh_token", { refresh_token: s.refresh })); return session.get().access; }
  catch { session.clear(); return null; }
}

// Magic-link sign-in lands with tokens in the fragment; take them and clean the address bar.
function takeFragment() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("access_token")) {
    store({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: Number(p.get("expires_in")) });
  }
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

// ---------------------------------------------------------------------------------------------
async function api(method, query = "", body) {
  const t = await token();
  if (!t) throw Object.assign(new Error("sign in required"), { status: 401 });
  const res = await fetch(`/api/admin${query}`, {
    method, headers: { authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

function showSignIn(message = "") {
  $("app").hidden = true; $("who").hidden = true; $("signin").hidden = false;
  $("signin-msg").textContent = message;
  const dev = config.mode === "dev";
  $("email-form").hidden = dev; $("dev-users").hidden = !dev;
}

async function load() {
  const status = $("status");
  status.textContent = "Loading…";
  try {
    const d = await api("GET", `?from=${$("from").value}&to=${$("to").value}`);
    render(d);
    status.textContent = `Updated ${new Date(d.generatedAt).toLocaleString()}`;
  } catch (err) {
    if (err.status === 401) { session.clear(); return showSignIn("Please sign in."); }
    if (err.status === 403) { return showSignIn("This account is signed in but is not on the storefront member list."); }
    status.textContent = `Could not load: ${err.message}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Rendering
const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = (a) => { try { return Number(a.value).toLocaleString(undefined, { style: "currency", currency: a.currency }); } catch { return `${a.currency} ${fmt(a.value)}`; } };
const REV = { revenue_gross: "gross", revenue_net: "net", earnings: "earnings" };

function cellNode(c) {
  const td = el("td", { class: `num state-${c.state}` });
  const why = [c.reason, c.source && `source: ${c.source}`, c.refreshedAt && `refreshed ${new Date(c.refreshedAt).toLocaleString()}`].filter(Boolean).join(" · ");
  if (why) td.title = why;
  if (c.state === "unavailable") { td.textContent = "n/a"; return td; }
  if (c.state === "pending") { td.textContent = "unknown"; return td; }
  if (c.amounts) {
    if (!c.amounts.length) td.append(el("div", { text: c.zero ? "0 (all currencies)" : "unknown" }));
    for (const a of c.amounts) td.append(el("div", { text: `${money(a)} ${REV[a.metric] ?? a.metric}` }));
  } else td.append(el("div", { text: fmt(c.value) }));
  const tag = c.basis === "cumulative" ? `lifetime as of ${c.asOf}` : "in window";
  td.append(el("span", { class: `tag${c.state === "partial" ? " partial" : ""}`, text: c.state === "partial" ? `${tag} · partial` : tag }));
  return td;
}

function render(d) {
  $("signin").hidden = true; $("app").hidden = false; $("who").hidden = false;
  $("who-role").textContent = `Signed in as ${d.role}`;
  const banner = $("banner");
  banner.hidden = !(config.mode === "dev" || d.fixture);
  banner.textContent = "Local development: every number here is fixture data, not real sales.";

  const root = $("games");
  root.replaceChildren();
  for (const g of d.games) {
    const table = el("table", { class: "grid" });
    table.append(el("thead", {}, el("tr", {}, el("th", { text: "Platform / source ids" }), ...d.columns.map((c) => el("th", { title: c.note, text: c.label })))));
    const tbody = el("tbody");
    for (const p of g.platforms) {
      const ids = p.listings.map((l) => l.external_id).join(", ");
      const head = el("td", {}, el("div", { text: p.label }), el("div", { class: "ids", text: ids }));
      tbody.append(el("tr", {}, head, ...d.columns.map((c) => cellNode(p.cells[c.key]))));
    }
    table.append(tbody);
    root.append(el("section", { class: "game" }, el("h3", { text: g.title }), el("div", { class: "scroll" }, table)));
  }

  const sources = $("sources").tBodies[0];
  sources.replaceChildren();
  for (const s of d.sources) {
    const when = (t) => (t ? new Date(t).toLocaleString() : "never");
    const docs = s.docs ? el("a", { href: s.docs, rel: "noreferrer noopener", target: "_blank", text: "API docs" }) : "";
    sources.append(el("tr", {},
      el("td", { text: s.label }),
      el("td", { text: s.source === "first_party" ? (s.trackingSince ? `counting since ${s.trackingSince}` : "not live yet") : when(s.lastSuccessAt) }),
      el("td", { text: s.source === "first_party" ? "" : when(s.lastAttemptAt) }),
      el("td", { text: s.coveredTo ?? "" }),
      el("td", { text: s.lastError ?? "" }),
      el("td", {}, docs)));
  }

  $("owner-tools").hidden = d.role !== "owner" || config.mode === "dev";
  const buttons = $("sync-buttons");
  buttons.replaceChildren();
  for (const src of ["itch", "curseforge", "github", ...(d.steamSyncEnabled ? ["steam"] : [])]) {
    const b = el("button", { type: "button", text: `Refresh ${src}` });
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { const r = await api("POST", "", { action: "sync", source: src }); $("status").textContent = `${src}: ${r.ok ? `ok, ${r.rows} rows` : r.error}`; }
      catch (err) { $("status").textContent = `${src}: ${err.data?.error ?? err.message}`; }
      b.disabled = false; load();
    });
    buttons.append(b);
  }

  const runs = $("runs").tBodies[0];
  runs.replaceChildren();
  const items = [
    ...d.runs.map((r) => ({ at: r.started_at, source: r.source, status: r.status, rows: r.rows_written, message: r.message ?? "" })),
    ...d.imports.map((i) => ({ at: i.imported_at, source: i.source, status: "imported", rows: i.row_count, message: i.filename ?? "" })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  for (const r of items) runs.append(el("tr", {}, el("td", { text: new Date(r.at).toLocaleString() }), el("td", { text: r.source }), el("td", { text: r.status }), el("td", { class: "num", text: String(r.rows) }), el("td", { text: r.message })));
}

// ---------------------------------------------------------------------------------------------
async function start() {
  config = await fetch("/api/admin?view=config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ mode: "unconfigured" }));
  if (config.mode === "unconfigured") { $("signin").hidden = false; $("email-form").hidden = true; $("signin-msg").textContent = "The dashboard is not configured on this server."; return; }
  takeFragment();
  // The level editor reads this page's session from sessionStorage, which is per site: from the
  // admin. subdomain, send people to the main site's admin page to sign in there.
  if (location.hostname.startsWith("admin.")) {
    const apex = `https://${location.hostname.slice(6)}/admin/`;
    $("level-links").replaceChildren(el("a", { href: apex, text: "Open the main site's admin page" }));
    $("level-note").textContent = `The game is on another address, so the editor needs the sign-in at ${apex}. Sign in there and use its Level editor links.`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(); from.setUTCDate(from.getUTCDate() - 29);
  $("to").value = today; $("from").value = from.toISOString().slice(0, 10);

  for (const u of config.users ?? []) {
    const b = el("button", { type: "button", text: u.label });
    b.addEventListener("click", () => { session.set({ access: u.token }); load(); });
    $("dev-users").append(b, " ");
  }

  $("email-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    // create_user: false — this page never creates accounts. redirect_to brings a magic link back
    // here instead of the shared project's Site URL (it must be on Auth's redirect allow list).
    const back = encodeURIComponent(location.origin + location.pathname);
    try { await auth(`otp?redirect_to=${back}`, { email, create_user: false, data: {} }); } catch { /* same message either way */ }
    $("signin-msg").textContent = "If this address has access, a sign-in email is on its way. Enter the code, or open the link in this browser.";
    $("code-form").hidden = false;
  });
  $("code-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { store(await auth("verify", { type: "email", email: $("email").value.trim(), token: $("code").value.trim() })); load(); }
    catch { $("signin-msg").textContent = "That code did not work. Request a new one."; }
  });
  $("sign-out").addEventListener("click", async () => {
    const t = config.mode === "supabase" ? await token() : null;
    if (t) await auth("logout", {}, t).catch(() => {});
    session.clear(); showSignIn("Signed out.");
  });
  $("window").addEventListener("submit", (e) => { e.preventDefault(); load(); });
  $("import-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = $("import-file").files[0];
    if (!file) return;
    if (file.size > 2_000_000) { $("import-result").hidden = false; $("import-result").textContent = "File is larger than 2 MB."; return; }
    const out = $("import-result");
    out.hidden = false; out.textContent = "Importing…";
    try { const r = await api("POST", "", { action: "import", source: $("import-source").value, filename: file.name, csv: await file.text() }); out.textContent = r.status === "duplicate" ? "This exact file was already imported; nothing changed." : `Imported ${r.rows} rows.`; load(); }
    catch (err) { out.textContent = [err.data?.error ?? err.message, ...(err.data?.details ?? [])].join("\n"); }
  });

  if (session.get()) load(); else showSignIn();
}

start();
