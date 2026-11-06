// Local dev server: serves the static site from the repo root and mounts api/*.js
// the way Vercel does (Web-standard Request in, Response out, streaming bodies).
//
//   node tools/dev.mjs          → http://localhost:3131
//
// Reads ANTHROPIC_API_KEY from the environment, .env.local, or .env.
// No Vercel login needed. Not deployed anywhere; Vercel only builds api/.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
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

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) await serveFunction(req, res, url);
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
