// Local dev server: serves the static site from the repo root and mounts api/*.js
// the way Vercel does (Web-standard Request in, Response out, streaming bodies).
//
//   node tools/dev.mjs          → http://localhost:3131
//
// Reads ANTHROPIC_API_KEY from the environment, .env.local, or .env.
// No Vercel login needed. Not deployed anywhere; Vercel only builds api/.
// Also takes saves from the Par for the Curse level editor (POST /__dev/pftc-level, see serveLevelSave).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(path.join(root, ".env.local"));
loadEnv(path.join(root, ".env"));

const port = Number(process.env.PORT) || 3131;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8",
};
const functions = new Map();

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

async function serveFunction(req, res, url) {
  const name = url.pathname.slice("/api/".length).replace(/\/$/, "");
  const file = path.join(root, "api", `${name}.js`);
  if (!/^[\w-]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404); return res.end("no such function"); }
  // Re-import when the file changes, so edits to api/*.js show up without a restart.
  const stamp = fs.statSync(file).mtimeMs;
  if (functions.get(file)?.stamp !== stamp) functions.set(file, { stamp, mod: await import(`${pathToFileURL(file).href}?v=${stamp}`) });
  const { mod } = functions.get(file);
  const handler = mod[req.method] ?? mod.default;
  if (!handler) { res.writeHead(405); return res.end(); }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const request = new Request(url, { method: req.method, headers: req.headers, body: hasBody ? Buffer.concat(chunks) : undefined });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return res.end();
  for await (const chunk of response.body) res.write(chunk);
  res.end();
}

function serveStatic(req, res, url) {
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!url.pathname.endsWith("/")) { res.writeHead(302, { location: url.pathname + "/" }); return res.end(); }
    file = path.join(file, "index.html");
  }
  // vercel.json: an older version's unchanged files come from the live folder
  const old = url.pathname.match(/^\/v\/([^/]+)\/\d+\/(.*)$/);
  if (!fs.existsSync(file) && old) return serveStatic(req, res, new URL(`/${old[1]}/${old[2]}`, url));
  if (!fs.existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found"); }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

// The Par for the Curse level editor (par-for-the-curse/js/editor.js, localhost with ?edit) saves its edits
// here, into par-for-the-curse/levels/<front|back>.json in this checkout, for the owner to commit. It is a
// file writer, so it only answers this machine: a loopback socket, a loopback Host (no DNS rebinding), the
// page's own Origin, and a JSON body (which makes any other site's request a CORS preflight, and this server
// never answers one). It lives here and never in api/, which Vercel deploys.
// The editor sends x-level-base, a hash of the file as it read it ("none": there was none). If the file
// changed on disk since (another editor tab saved, a git pull or merge), writing would drop that change
// unseen: the answer is 409, and the editor asks before it sends the save again with force=1.
const LEVELS = path.join(root, "par-for-the-curse", "levels");
const sha256 = buf => crypto.createHash("sha256").update(buf).digest("hex");
async function serveLevelSave(req, res, url) {
  const no = (code, msg) => { res.writeHead(code, { "content-type": "text/plain; charset=utf-8" }); res.end(msg); };
  if (req.method !== "POST") return no(405, "POST only");
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return no(403, "this machine only");
  const host = String(req.headers.host || "");
  if (!new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]).has(host) || req.headers.origin !== `http://${host}`) return no(403, "same origin only");
  if (!/^application\/json(\s*;|$)/i.test(String(req.headers["content-type"] || ""))) return no(415, "send application/json");
  const name = url.searchParams.get("name") || "";
  if (!/^(front|back)$/.test(name)) return no(400, "name must be front or back");
  const file = path.resolve(LEVELS, `${name}.json`);
  if (path.dirname(file) !== path.resolve(LEVELS)) return no(400, "bad name");
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 2 * 1024 * 1024) return no(413, "too big (2 MB at most)"); chunks.push(c); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { return no(400, "not JSON"); }
  const plain = v => v && typeof v === "object" && !Array.isArray(v);
  if (!plain(data) || data.version !== 1 || !plain(data.items) || !Array.isArray(data.add)) return no(400, "not a level overlay (version 1, items, add)");
  const base = req.headers["x-level-base"];
  if (base && url.searchParams.get("force") !== "1") {
    let now = "none";
    try { now = sha256(fs.readFileSync(file)); } catch (e) { if (e.code !== "ENOENT") return no(500, "could not read the file: " + e.code); }
    if (now !== base) return no(409, `levels/${name}.json changed on disk since the editor read it`);
  }
  // Written next to the file and renamed over it, so the game never reads half a save.
  // A write or rename that fails (a full disk, the file locked or read-only) leaves no temp file behind.
  const text = JSON.stringify(data, null, 2) + "\n", tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(LEVELS, { recursive: true });
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (e2) {}
    console.error(`level editor: could not save ${path.relative(root, file)}:`, e.message);
    return no(500, "could not write the file: " + e.code);
  }
  console.log(`level editor saved ${path.relative(root, file)} (${text.length} bytes)`);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, file: path.relative(root, file).split(path.sep).join("/"), bytes: Buffer.byteLength(text), hash: sha256(Buffer.from(text)) }));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/__dev/pftc-level") await serveLevelSave(req, res, url);
    else if (url.pathname.startsWith("/api/")) await serveFunction(req, res, url);
    else serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("dev server error: " + (err?.message ?? err));
  }
}).listen(port, () => {
  console.log(`vibe coded slopware → http://localhost:${port}`);
  console.log(`ANTHROPIC_API_KEY ${process.env.ANTHROPIC_API_KEY ? "found" : "NOT set (readings will fail)"}`);
});
