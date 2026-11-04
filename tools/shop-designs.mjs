// Renders the merch designs from the games' own art code.
//
//   node tools/shop-designs.mjs            → shop/print/<id>.png (3600×4800, what Printful prints)
//                                            shop/designs/<id>.png (900×1200, what the shop shows)
//
// Starts tools/dev.mjs on a spare port, opens each game in headless Chrome and draws with its modules,
// so a design changes when the game's art does. Pixel designs are laid out on a 180×240 grid and scaled
// ×20 with no smoothing. Needs `npm install` (playwright-core) and Chrome.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3197;
const base = `http://localhost:${PORT}`;
const only = process.argv.slice(2);

const server = spawn(process.execPath, [path.join(root, "tools/dev.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
for (let i = 0; i < 50; i++) { try { await fetch(base + "/"); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

// Shared in-page helpers: a 180×240 pixel layer scaled up to the print size, and PNG export.
const HELPERS = `
  window.W = 3600; window.H = 4800; window.GRID = 20;
  window.layer = (w = 180, h = 240) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  window.print = (...layers) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    for (const l of layers) typeof l === 'function' ? l(g) : g.drawImage(l, 0, 0, W, H);
    return c;
  };
  window.out = (c) => {
    const s = document.createElement('canvas'); s.width = 900; s.height = 1200;
    const g = s.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, 900, 1200);
    return { print: c.toDataURL('image/png'), preview: s.toDataURL('image/png') };
  };
  // drips of slop hanging from the bottom edge of whatever is drawn in colour col on layer g
  window.drips = (g, col, y0, x0, x1, seed) => {
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = col;
    for (let x = x0; x < x1; x++) {
      if (rnd() > 0.16) continue;
      const len = 3 + Math.floor(rnd() * rnd() * 22), w = rnd() > 0.6 ? 2 : 1;
      g.fillRect(x, y0, w, len); g.fillRect(x - 1 + (w === 2 ? 0 : 0), y0 + len, w + 1, 2);
      x += 3;
    }
  };
`;

const DESIGNS = {
  // The boss, facing you, over the title in its own 3×5 font.
  "boss-hours": { url: "/boss-hours/", draw: async () => {
    const A = await import("/boss-hours/js/art.js");
    const [c, g] = layer();
    const boss = A.makeBossSprites()[8][0];
    g.drawImage(boss, 18, 22, 144, 144);
    A.drawText(g, "BOSS HOURS", 90, 176, "gold", { scale: 3, align: "center" });
    A.drawText(g, "I AM THE ENCOUNTER", 90, 200, "cream", { scale: 1, align: "center" });
    A.drawText(g, "VIBECODEDSLOPWARE.COM", 90, 226, "hornD", { scale: 1, align: "center", shadow: false });
    return out(print(c));
  } },

  // Logo, the Brightwater car, and the crew's motto.
  "pit-crew": { url: "/pit-crew/", draw: async () => {
    const F = await import("/pit-crew/js/font.js");
    const G = await import("/pit-crew/js/gfx.js");
    const D = await import("/pit-crew/js/data.js");
    const [c, g] = layer();
    const line = (s, y, col, sc, deep) => {
      for (let k = 3; k >= 1; k--) F.text(g, s, 90 + k, y + k, k === 1 ? deep : "#05060a", { scale: sc, align: "center" });
      F.text(g, s, 90, y, col, { scale: sc, align: "center" });
    };
    line("PIT CREW", 30, "#ffffff", 3, "#0b3a44");
    const wa = F.measure("PIT CREW", 3);
    for (let r = 0; r < 21; r += 6) { g.fillStyle = "rgba(22,179,163,0.35)"; g.fillRect(90 - Math.floor(wa / 2), 30 + r + 3, wa, 3); }
    line("'26", 60, "#ff8a1e", 4, "#7a3a08");
    g.drawImage(G.carSprite(D.TEAMS[0]), 12, 112, 156, 64);
    F.text(g, "A REVERSE RACING GAME.", 90, 192, "#9ad8ff", { align: "center", shadow: "#05060a" });
    F.text(g, "YOU ARE THE PIT CREW.", 90, 204, "#ffd23a", { align: "center", shadow: "#05060a" });
    F.text(g, "VIBECODEDSLOPWARE.COM", 90, 226, "#5c6a8a", { align: "center" });
    return out(print(c));
  } },

  // The site's name, dripping.
  "slopware": { url: "/pit-crew/", draw: async () => {
    const F = await import("/pit-crew/js/font.js");
    const [c, g] = layer();
    const line = (s, y, col, sc, deep) => {
      for (let k = 3; k >= 1; k--) F.text(g, s, 90 + k, y + k, k === 1 ? deep : "#05060a", { scale: sc, align: "center" });
      F.text(g, s, 90, y, col, { scale: sc, align: "center" });
    };
    line("VIBE", 40, "#ffe397", 5, "#7a5a12");
    line("CODED", 84, "#f6f3e9", 4, "#46504b");
    line("SLOPWARE", 124, "#8fc46a", 3, "#2c4a2c");
    drips(g, "#8fc46a", 145, 90 - Math.floor(F.measure("SLOPWARE", 3) / 2) + 1, 90 + Math.floor(F.measure("SLOPWARE", 3) / 2) - 1, 7);
    F.text(g, "MADE WITH VIBES.", 90, 190, "#f6f3e9", { align: "center", shadow: "#05060a" });
    F.text(g, "SHIPPED WITH BUGS.", 90, 202, "#f6f3e9", { align: "center", shadow: "#05060a" });
    F.text(g, "VIBECODEDSLOPWARE.COM", 90, 226, "#8c9b80", { align: "center" });
    return out(print(c));
  } },

  // Orbital, the bear astronaut regular from Pour Decisions (vector, so drawn at full size).
  "space-bear": { url: "/pour-decisions/", draw: async () => {
    const F = await import("/pit-crew/js/font.js");
    const svg = face(PEOPLE.find((p) => p.look.bear).look, { mood: "happy" });   // eslint-disable-line no-undef
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const [c, g] = layer();
    const line = (s, y, col, sc) => { F.text(g, s, 90, y, col, { scale: sc, align: "center", outline: "#1b1414" }); };
    line("GRAVITY IS", 14, "#ffe397", 2);
    line("A LOT TONIGHT", 34, "#ffe397", 2);
    line("POUR DECISIONS", 196, "#f4f4f0", 2);
    F.text(g, "VIBECODEDSLOPWARE.COM", 90, 228, "#9aa0a8", { align: "center" });
    return out(print(c, (p) => { p.imageSmoothingEnabled = true; p.drawImage(img, 600, 1020, 2400, 2760); p.imageSmoothingEnabled = false; }));
  } },

  // A real screenshot of Mycelium, in a little desktop window.
  "mycelium": { url: "/mycelium/", setup: async (page) => {
    await page.click("#playBtn").catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector(".screen:not(.hidden) .plot, #garden canvas, #garden button")?.click());
    await page.waitForTimeout(9000);
  }, draw: async () => {
    const F = await import("/pit-crew/js/font.js");
    const shot = document.getElementById("world");
    const [c, g] = layer();
    // window chrome on the pixel grid: 172×110 frame, title bar 10 high
    const X = 4, Y = 40, w = 172, h = 114;
    g.fillStyle = "#05060a"; g.fillRect(X - 1, Y - 1, w + 2, h + 2);
    g.fillStyle = "#c9c3b2"; g.fillRect(X, Y, w, h);
    g.fillStyle = "#f6f3e9"; g.fillRect(X, Y, w, 1); g.fillRect(X, Y, 1, h);
    g.fillStyle = "#7d776a"; g.fillRect(X, Y + h - 1, w, 1); g.fillRect(X + w - 1, Y, 1, h);
    g.fillStyle = "#3f7d4e"; g.fillRect(X + 2, Y + 2, w - 4, 10);
    F.text(g, "MYCELIUM.EXE", X + 5, Y + 4, "#f6f3e9");
    for (const [i, col] of [["#e8d23a"], ["#8fc46a"], ["#d8473a"]].entries()) { g.fillStyle = "#05060a"; g.fillRect(X + w - 30 + i * 9, Y + 4, 7, 6); g.fillStyle = col[0]; g.fillRect(X + w - 29 + i * 9, Y + 5, 5, 4); }
    g.fillStyle = "#05060a"; g.fillRect(X + 3, Y + 14, w - 6, h - 17);
    F.text(g, "I AM THE FUNGUS.", 90, 170, "#ffe397", { scale: 2, align: "center", shadow: "#05060a" });
    F.text(g, "A COLONY SIM WHERE YOU", 90, 196, "#f6f3e9", { align: "center", shadow: "#05060a" });
    F.text(g, "ARE THE MUSHROOM.", 90, 206, "#f6f3e9", { align: "center", shadow: "#05060a" });
    F.text(g, "VIBECODEDSLOPWARE.COM", 90, 226, "#8c9b80", { align: "center" });
    // the screenshot itself at full resolution inside the frame (166×97 grid px ≈ 480×288 × 6.9)
    return out(print(c, (p) => { p.drawImage(shot, (X + 4) * GRID, (Y + 15) * GRID, (w - 8) * GRID, (h - 19) * GRID); }));
  } },
};

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"] });
fs.mkdirSync(path.join(root, "shop/print"), { recursive: true });
fs.mkdirSync(path.join(root, "shop/designs"), { recursive: true });
try {
  for (const [id, d] of Object.entries(DESIGNS)) {
    if (only.length && !only.includes(id)) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("pageerror", (e) => console.warn(`  ${id}: page error: ${e.message}`));
    await page.goto(base + d.url, { waitUntil: "load" });
    await page.waitForTimeout(800);
    if (d.setup) await d.setup(page);
    await page.evaluate(HELPERS);
    const res = await page.evaluate(`(${d.draw.toString()})()`);
    for (const [kind, dir] of [["print", "print"], ["preview", "designs"]]) {
      const file = path.join(root, "shop", dir, `${id}.png`);
      fs.writeFileSync(file, Buffer.from(res[kind].split(",")[1], "base64"));
    }
    console.log(`${id}: shop/print/${id}.png (${(fs.statSync(path.join(root, "shop/print", id + ".png")).size / 1024).toFixed(0)} KB)`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
