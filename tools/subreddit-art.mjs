// Renders the subreddit's art from the studio splash's own code, so the subreddit changes when the splash does.
//
//   node tools/subreddit-art.mjs     → subreddit/img/*.png
//
//   banner.png        1920×384   new Reddit desktop banner (the splash, frozen after the shine, widened to 5:1)
//   header.png        2560×192   old Reddit header (the same frame at 1×, widened to fill a big monitor)
//   icon.png           256×256   community icon: the goo mascot, shades on, on the dark green
//   sidebar-glob.png   300×208   the goo mascot alone, transparent, for the top of the sidebar
//   arrows.png         sprite sheet of pixel vote arrows, one 24×24 cell each (see subreddit/stylesheet.css)
//   vote-*.png          48×48     the arrows one per file, for new Reddit's custom vote icons
//
// Starts tools/dev.mjs on a spare port and opens headless Chrome. Needs `npm install` (playwright-core) and Chrome.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3198;
const base = `http://localhost:${PORT}`;
const outDir = path.join(root, "subreddit/img");
fs.mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, [path.join(root, "tools/dev.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
for (let i = 0; i < 50; i++) { try { await fetch(base + "/"); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--mute-audio"] });
const save = (name, dataUrl) => {
  fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("subreddit/img/" + name);
};

try {
  // The banner: a 1920×384 viewport makes the splash pick a 2× scale and a 960×192 framebuffer, so the
  // scene widens to 5:1 the way it does on a wide monitor, wordmark and mascot in the middle.
  const page = await browser.newPage({ viewport: { width: 1920, height: 384 } });
  await page.goto(base + "/subreddit/blank.html");
  const shots = await page.evaluate(async () => {
    await new Promise((ok, fail) => { const s = document.createElement("script"); s.src = "/splash.js"; s.dataset.manual = ""; s.onload = ok; s.onerror = fail; document.head.append(s); });
    SlopwareSplash.play({ at: 3.2, tagline: "100% HAND-PROMPTED" });
    const shot = document.querySelector("#slopware-splash canvas");
    const scaled = (src, w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, w, h); return c; };
    const banner = scaled(shot, shot.width * 2, shot.height * 2).toDataURL("image/png");
    const frame = [shot.width, shot.height];
    SlopwareSplash.skip();

    // the mascot, trimmed to its pixels
    const blob = SlopwareSplash.mascot();
    const d = blob.getContext("2d").getImageData(0, 0, 64, 64).data;
    let x0 = 64, y0 = 64, x1 = -1, y1 = -1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (d[(y * 64 + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const mw = x1 - x0 + 1, mh = y1 - y0 + 1;

    // community icon: biggest whole-pixel scale that fits 256 with a margin, on the background green
    const icon = document.createElement("canvas"); icon.width = icon.height = 256;
    const ig = icon.getContext("2d"); ig.imageSmoothingEnabled = false;
    ig.fillStyle = "#04140c"; ig.fillRect(0, 0, 256, 256);
    const k = Math.floor(200 / Math.max(mw, mh));
    ig.drawImage(blob, x0, y0, mw, mh, (256 - mw * k) >> 1, (256 - mh * k) >> 1, mw * k, mh * k);

    // sidebar: whole-pixel scale to fit 300 wide, transparent
    const ks = Math.floor(280 / mw), side = document.createElement("canvas");
    side.width = 300; side.height = mh * ks + 8;
    const sg = side.getContext("2d"); sg.imageSmoothingEnabled = false;
    sg.drawImage(blob, x0, y0, mw, mh, (300 - mw * ks) >> 1, 4, mw * ks, mh * ks);

    // Vote arrows, 12×12 pixel art drawn at 2× in 24×24 cells. O outline, X fill, H highlight, S shade.
    const UP = [
      ".....OO.....",
      "....OHXO....",
      "...OHXXXO...",
      "..OHXXXXSO..",
      ".OHXXXXXXSO.",
      "OOOOHXXSOOOO",
      "...OHXXSO...",
      "...OHXXSO...",
      "...OHXXSO...",
      "...OHXXSO...",
      "...OSSSSO...",
      "...OOOOOO...",
    ];
    const DOWN = UP.slice().reverse().map((r) => r.replace(/H/g, "h").replace(/S/g, "H").replace(/h/g, "S"));
    // neutral and hover in slime greens, upvoted in splash-sun orange, downvoted in splash-chrome blue
    const SETS = {
      up:       { O: "#021008", X: "#1c8a3c", H: "#44c23a", S: "#0e5238" },
      upHover:  { O: "#021008", X: "#44c23a", H: "#d8ff86", S: "#1c8a3c" },
      upmod:    { O: "#2a0f05", X: "#ff8a3a", H: "#fff6a8", S: "#c0207a" },
      down:     { O: "#021008", X: "#1c8a3c", H: "#44c23a", S: "#0e5238" },
      downHover:{ O: "#021008", X: "#44c23a", H: "#d8ff86", S: "#1c8a3c" },
      downmod:  { O: "#05082a", X: "#2f80e8", H: "#9fe6ff", S: "#101a6a" },
    };
    const order = ["up", "upHover", "upmod", "down", "downHover", "downmod"];
    const sheet = document.createElement("canvas"); sheet.width = 24 * order.length; sheet.height = 24;
    const ag = sheet.getContext("2d");
    order.forEach((name, i) => {
      const art = name.startsWith("up") ? UP : DOWN, pal = SETS[name];
      art.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === ".") return; ag.fillStyle = pal[ch]; ag.fillRect(i * 24 + x * 2, y * 2, 2, 2); }));
    });

    // the same arrows one per file at 4×, for new Reddit's custom vote icons
    const single = {};
    for (const [file, i] of [["vote-up", 0], ["vote-upvoted", 2], ["vote-down", 3], ["vote-downvoted", 5]]) {
      const c = document.createElement("canvas"); c.width = c.height = 48;
      const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
      g.drawImage(sheet, i * 24, 0, 24, 24, 0, 0, 48, 48);
      single[file] = c.toDataURL("image/png");
    }

    return { banner, frame, single, icon: icon.toDataURL("image/png"), side: side.toDataURL("image/png"), sideH: side.height, arrows: sheet.toDataURL("image/png") };
  });
  save("banner.png", shots.banner);

  // Old Reddit's header spans the window, so it gets its own frame at 1×, as wide as a big monitor:
  // a 2560×192 viewport keeps the scale at 1 and the splash widens its sky and floor to fill it.
  const wide = await browser.newPage({ viewport: { width: 2560, height: 192 } });
  await wide.goto(base + "/subreddit/blank.html");
  save("header.png", await wide.evaluate(async () => {
    await new Promise((ok, fail) => { const s = document.createElement("script"); s.src = "/splash.js"; s.dataset.manual = ""; s.onload = ok; s.onerror = fail; document.head.append(s); });
    SlopwareSplash.play({ at: 3.2, tagline: "100% HAND-PROMPTED" });
    return document.querySelector("#slopware-splash canvas").toDataURL("image/png");
  }));
  save("icon.png", shots.icon);
  save("sidebar-glob.png", shots.side);
  save("arrows.png", shots.arrows);
  for (const [file, url] of Object.entries(shots.single)) save(file + ".png", url);
  console.log("splash frame", shots.frame.join("×"), "· sidebar glob height", shots.sideH);
} finally {
  await browser.close();
  server.kill();
}
