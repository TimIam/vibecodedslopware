// Builds the home page's version history: node tools/versions.mjs
//
// Every commit that changes one game (commits touching three or more game
// folders at once, like the nav bar, don't count) is a version of it; the
// newest is what's live at /<slug>/. Older versions are served at
// /v/<slug>/<n>/. Only the files that differ from today's folder are written
// under v/; vercel.json rewrites every other /v/ path to the live file.
//
// Writes v/, apps.js (what index.html reads) and vercel.json. Run it from a
// checkout with full history after committing the game, then commit the output.
// Prompts and tokens come from this machine's Claude Code transcripts
// (SESSIONS below); visits come from tools/popularity.json.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const gitBuf = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 1 << 30 });

// Claude Code sessions that built each game (session id prefixes). Sessions from
// Claude Code on the web leave no local transcript, so those games have none.
const SESSIONS = {
  "strange-weather": ["40d990f6"], "desktop-bag": ["2f5533ad"], bonsai: ["8389367f"], psychic: ["64c77da6"],
  matrix: ["6c6dd5fe"], Claude3d: ["b2b708e7"], datacenter: ["af72bc54"], demolition: ["d4fc90b7"],
  "pour-decisions": ["d422c125"], timberline: ["a40b8edd"], "fell-swoop": ["9120001a"], "peel-out": ["a3cda84d"],
  craps: ["78700707"], "safe-water": ["00e37866"], "par-for-the-curse": ["47f422c5", "20edeecd"],
  "pit-crew": ["1aea2484"], "the-endgame-is-me": ["30bbe722"], "projection-mayhem": ["9aea4264"],
  "binding-order": ["73ca41e4"], shop: ["18796b08"], "park-inspector": ["2108b4e3"],
  wasteland: ["4c2439ef"], antfarm: ["bb8a5495"], snowglobe: ["f7ab5567"],
};
// Built in the same session as another game: its prompts and tokens are counted there.
// Games whose folder was renamed: new name -> old name. History before the move is read from the old folder, and
// the old addresses redirect to the new ones.
const MOVED = { "the-endgame-is-me": "boss-hours" };
const SHARED = { "bonsai-idle": "bonsai", terrarium: "snowglobe", rainwindow: "snowglobe", koipond: "snowglobe", aurora: "snowglobe" };

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const slugs = [...html.matchAll(/<a class="card"[^>]*href="\/([^/"]+)\/"/g)].map((m) => m[1]);
const topDirs = new Set(git("ls-tree", "-d", "--name-only", "HEAD").split("\n").filter(Boolean));
const notGames = new Set(["api", "lib", "tools", "v"]);

// --- transcripts: every prompt and assistant turn, by game, with timestamps
function transcriptEvents() {
  const base = path.join(os.homedir(), ".claude", "projects");
  const events = {};
  if (!fs.existsSync(base)) return events;
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith(".jsonl")) files.push(p);
    }
  })(base);
  const bySession = Object.entries(SESSIONS).flatMap(([slug, ids]) => ids.map((id) => [id, slug]));
  const seen = {};
  for (const f of files) {
    const rel = path.relative(base, f).split(path.sep);
    const sub = rel.length > 2; // <project>/<session>/subagents/...
    const sid = sub ? rel[1] : path.basename(f, ".jsonl");
    const slug = bySession.find(([id]) => sid.startsWith(id))?.[1];
    if (!slug) continue;
    const ev = (events[slug] ??= []);
    const s = (seen[slug] ??= { msg: new Set(), prompt: new Set() }); // forked sessions repeat history
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (!sub && j.type === "user" && !j.isMeta && !j.isSidechain && !j.isCompactSummary && j.message) {
        const c = j.message.content;
        const text = typeof c === "string" ? c
          : Array.isArray(c) && c.every((x) => x.type !== "tool_result") ? c.filter((x) => x.type === "text").map((x) => x.text).join(" ") : null;
        const key = j.timestamp + (text || "").slice(0, 200);
        if (text && !/^\s*<(command|local-command|system|task-notification|side-sessions|ci-monitor)/.test(text)
          && !text.startsWith("[Request interrupted") && !text.startsWith("This session is being continued") && !s.prompt.has(key)) {
          s.prompt.add(key);
          ev.push({ t: Date.parse(j.timestamp), prompt: 1, tokens: 0 });
        }
      }
      if (j.type === "assistant" && j.message?.usage && !s.msg.has(j.message.id)) {
        s.msg.add(j.message.id);
        const u = j.message.usage; // cached re-reads aren't counted
        ev.push({ t: Date.parse(j.timestamp), prompt: 0, tokens: (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) });
      }
    }
  }
  return events;
}

const events = transcriptEvents();
const popularity = JSON.parse(fs.readFileSync(path.join(root, "tools", "popularity.json"), "utf8"));
const treeOf = (rev, dir) => new Map(git("ls-tree", "-r", rev, "--", dir + "/").split("\n").filter(Boolean)
  .map((l) => { const [meta, p] = l.split("\t"); return [p, meta.split(" ")[2]]; }));

fs.rmSync(path.join(root, "v"), { recursive: true, force: true });
const apps = {};
let written = 0, bytes = 0;
for (const slug of slugs) {
  if (!topDirs.has(slug)) continue; // not committed yet
  const log = git("log", "HEAD", "--no-merges", "--reverse", "--format=%H %aI %s", "--", slug + "/", ...(MOVED[slug] ? [MOVED[slug] + "/"] : [])).split("\n").filter(Boolean);
  const versions = log.map((l, i) => {
    const [sha, date, ...s] = l.split(" ");
    if (i > 0) {
      const dirs = new Set(git("show", "--format=", "--name-only", sha).split("\n").filter(Boolean)
        .map((p) => p.split("/")[0]).filter((d) => (topDirs.has(d) || Object.values(MOVED).includes(d)) && !notGames.has(d)));
      if (dirs.size > 2) return null; // site-wide change, not a release of this game
    }
    return { sha, date, note: s.join(" ") };
  }).filter(Boolean);
  if (!versions.length) continue;

  // prompts and tokens up to each version's commit; anything after the last commit counts toward it
  const ev = events[SHARED[slug]] ? [] : (events[slug] || []);
  let prev = -Infinity;
  versions.forEach((v, i) => {
    const t = i === versions.length - 1 ? Infinity : Date.parse(v.date);
    const mine = ev.filter((e) => e.t > prev && e.t <= t);
    v.prompts = mine.reduce((a, e) => a + e.prompt, 0);
    v.tokens = mine.reduce((a, e) => a + e.tokens, 0);
    prev = t;
  });

  // files of each older version that differ from the live folder
  const live = treeOf("HEAD", slug);
  versions.slice(0, -1).forEach((v, i) => {
    const here = treeOf(v.sha, slug);
    const old = here.size ? null : MOVED[slug];
    for (const [p, blob] of old ? treeOf(v.sha, old) : here) {
      const rel = p.slice((old || slug).length + 1);
      if (live.get(slug + "/" + rel) === blob) continue;
      const out = path.join(root, "v", slug, String(i + 1), rel);
      const data = gitBuf("cat-file", "blob", blob);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, data);
      written++; bytes += data.length;
    }
  });

  apps[slug] = {
    visits: popularity.visits[slug] ?? 0,
    prompts: ev.length ? versions.reduce((a, v) => a + v.prompts, 0) : null,
    tokens: ev.length ? versions.reduce((a, v) => a + v.tokens, 0) : null,
    sharedWith: SHARED[slug] || null,
    versions: versions.map((v, i) => ({
      n: i + 1, date: v.date, note: v.note.replace(/^[^:]{1,40}:\s*/, ""),
      ...(ev.length ? { prompts: v.prompts, tokens: v.tokens } : {}),
    })),
  };
}

fs.writeFileSync(path.join(root, "apps.js"),
  "// Generated by tools/versions.mjs. Don't edit by hand.\n" +
  `window.SLOPWARE = ${JSON.stringify({ visitsSince: popularity.since, apps }, null, 1)};\n`);
fs.writeFileSync(path.join(root, "vercel.json"), JSON.stringify({
  redirects: Object.entries(MOVED).flatMap(([to, from]) => [
    { source: `/${from}`, destination: `/${to}/`, permanent: true },
    { source: `/${from}/(.*)`, destination: `/${to}/$1`, permanent: true },
    { source: `/v/${from}/(.*)`, destination: `/v/${to}/$1`, permanent: true },
  ]),
  rewrites: [{ source: "/v/:slug/:n/:path*", destination: "/:slug/:path*" }],
}, null, 2) + "\n");
console.log(`${Object.keys(apps).length} apps, ${Object.values(apps).reduce((a, x) => a + x.versions.length, 0)} versions; wrote ${written} files (${(bytes / 1e6).toFixed(1)} MB) under v/`);
