// Renders the merch designs from the games' own art code.
//
//   node tools/shop-designs.mjs            → shop/print/<id>.png (3600×4800, what Printful prints)
//                                            shop/designs/<id>.png (900×1200, what the shop shows)
//
//   node tools/shop-designs.mjs boss-hours bear-run   → just those
//
// Starts tools/dev.mjs on a spare port and opens the games in headless Chrome, so a design changes when the
// game's art does. Three kinds:
//   DESIGNS  drawn with a game's own art modules (pixel art on a 180×240 grid scaled ×20 with no smoothing)
//   SHOTS    a screenshot of the running game in a little desktop window. "canvas" hides the page's HTML
//            and captures the game canvas alone; "page" keeps the HTML (for title screens drawn in HTML)
//   PROPS    a sheet of models from a game's GLB files, rendered with three.js on a transparent background
// Needs `npm install` (playwright-core) and Chrome.

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
  // the desktop-window frame around a screenshot, with a headline and two small lines under it
  window.exe = async (shotUrl, { exe, big, small = [], accent = '#3f7d4e', pixel = false }) => {
    const F = await import('/pit-crew/js/font.js');
    const shot = new Image(); shot.src = shotUrl; await shot.decode();
    const [c, g] = layer();
    const X = 4, Y = 40, w = 172, h = 114;
    g.fillStyle = '#05060a'; g.fillRect(X - 1, Y - 1, w + 2, h + 2);
    g.fillStyle = '#c9c3b2'; g.fillRect(X, Y, w, h);
    g.fillStyle = '#f6f3e9'; g.fillRect(X, Y, w, 1); g.fillRect(X, Y, 1, h);
    g.fillStyle = '#7d776a'; g.fillRect(X, Y + h - 1, w, 1); g.fillRect(X + w - 1, Y, 1, h);
    g.fillStyle = accent; g.fillRect(X + 2, Y + 2, w - 4, 10);
    F.text(g, exe, X + 5, Y + 4, '#f6f3e9');
    ['#e8d23a', '#8fc46a', '#d8473a'].forEach((col, i) => { g.fillStyle = '#05060a'; g.fillRect(X + w - 30 + i * 9, Y + 4, 7, 6); g.fillStyle = col; g.fillRect(X + w - 29 + i * 9, Y + 5, 5, 4); });
    g.fillStyle = '#05060a'; g.fillRect(X + 3, Y + 14, w - 6, h - 17);
    F.text(g, big, 90, 170, '#ffe397', { scale: F.measure(big, 2) <= 172 ? 2 : 1, align: 'center', shadow: '#05060a' });
    small.forEach((s, i) => F.text(g, s, 90, 196 + i * 10, '#f6f3e9', { align: 'center', shadow: '#05060a' }));
    F.text(g, 'VIBECODEDSLOPWARE.COM', 90, 226, '#8c9b80', { align: 'center' });
    // the screenshot at full resolution inside the frame, cropped to fill it
    const dx = (X + 4) * GRID, dy = (Y + 15) * GRID, dw = (w - 8) * GRID, dh = (h - 19) * GRID;
    const k = Math.max(dw / shot.width, dh / shot.height), sw = dw / k, sh = dh / k;
    return out(print(c, (p) => { p.imageSmoothingEnabled = !pixel; p.drawImage(shot, (shot.width - sw) / 2, (shot.height - sh) / 2, sw, sh, dx, dy, dw, dh); p.imageSmoothingEnabled = false; }));
  };
  // renders each { file, nodes, label } (nodes: names in the GLB, or all of it) at a three-quarter view
  window.renderModels = async (items, size = 2000, blueprint = null) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(size, size, false);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(4, 7, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe3ff, 1.2); rim.position.set(-5, 3, -4); scene.add(rim);
    const files = {}, loader = new GLTFLoader();
    const shots = [];
    for (const it of items) {
      files[it.file] ??= await loader.loadAsync(it.file);
      const src = files[it.file].scene;
      src.updateMatrixWorld(true);
      const group = new THREE.Group();
      for (const obj of it.nodes ? it.nodes.map((n) => src.getObjectByName(n)) : [src]) {
        if (!obj) throw new Error(it.file + ': no node in ' + it.nodes);
        const copy = obj.clone(true);
        if (it.nodes) obj.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
        group.add(copy);
      }
      if (blueprint) {
        // Binding Order's look: faint fill, light edge lines
        const fill = new THREE.MeshBasicMaterial({ color: blueprint, transparent: true, opacity: 0.16, depthWrite: false });
        const line = new THREE.LineBasicMaterial({ color: blueprint });
        group.traverse((m) => { if (m.isMesh) { m.material = fill; m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), line)); } });
      }
      const box = new THREE.Box3().setFromObject(group), sphere = box.getBoundingSphere(new THREE.Sphere());
      group.position.sub(sphere.center);
      scene.add(group);
      const cam = new THREE.PerspectiveCamera(28, 1, sphere.radius / 100, sphere.radius * 100);
      const az = (it.az ?? 35) * Math.PI / 180, el = (it.el ?? 20) * Math.PI / 180, d = sphere.radius / Math.sin(14 * Math.PI / 180) * 1.02;
      cam.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
      cam.lookAt(0, 0, 0);
      r.render(scene, cam);
      // crop to the model's own pixels so every prop fills its cell the same way
      const full = document.createElement('canvas'); full.width = full.height = size;
      const fg = full.getContext('2d'); fg.drawImage(r.domElement, 0, 0);
      const px = fg.getImageData(0, 0, size, size).data;
      let x0 = size, y0 = size, x1 = 0, y1 = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (px[(y * size + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const cv = document.createElement('canvas'); cv.width = x1 - x0 + 1; cv.height = y1 - y0 + 1;
      cv.getContext('2d').drawImage(full, -x0, -y0);
      shots.push(cv);
      scene.remove(group);
    }
    return shots;
  };
  // a sheet of rendered models in two columns, a label under each
  window.propSheet = async (items, { title, sub, accent = '#ffe397', blueprint = null }) => {
    const F = await import('/pit-crew/js/font.js');
    const pics = await renderModels(items, 2000, blueprint);
    const [c, g] = layer();
    for (let k = 3; k >= 1; k--) F.text(g, title, 90 + k, 10 + k, '#05060a', { scale: F.measure(title, 3) <= 176 ? 3 : 2, align: 'center' });
    F.text(g, title, 90, 10, accent, { scale: F.measure(title, 3) <= 176 ? 3 : 2, align: 'center' });
    F.text(g, sub, 90, 38, '#f6f3e9', { align: 'center', shadow: '#05060a' });
    const rows = Math.ceil(items.length / 2), top = 52, rowH = Math.floor(166 / rows);
    items.forEach((it, i) => F.text(g, it.label, 45 + (i % 2) * 90, top + Math.floor(i / 2) * rowH + rowH - 9, '#c9c3b2', { align: 'center' }));
    F.text(g, 'VIBECODEDSLOPWARE.COM', 90, 226, '#8c9b80', { align: 'center' });
    return out(print(c, (p) => {
      p.imageSmoothingEnabled = true;
      pics.forEach((pic, i) => {
        const bw = 1500, bh = (rowH - 13) * GRID, k = Math.min(bw / pic.width, bh / pic.height);
        const w = pic.width * k, h = pic.height * k;
        p.drawImage(pic, (45 + (i % 2) * 90) * GRID - w / 2, (top + Math.floor(i / 2) * rowH + 1) * GRID + bh - h, w, h);
      });
      p.imageSmoothingEnabled = false;
    }));
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

  // The studio splash, drawn by /splash.js itself and frozen just after the shine, in a 4:3 screen.
  "splash": { url: "/pit-crew/", setup: async (page) => { await page.setViewportSize({ width: 320, height: 240 }); }, draw: async () => {
    const F = await import("/pit-crew/js/font.js");
    await new Promise((ok, fail) => { const s = document.createElement("script"); s.src = "/splash.js"; s.dataset.manual = ""; s.onload = ok; s.onerror = fail; document.head.append(s); });
    SlopwareSplash.play({ at: 3.2, tagline: "100% HAND-PROMPTED" });
    const shot = document.querySelector("#slopware-splash canvas");
    const [c, g] = layer();
    F.text(g, "VIBECODEDSLOPWARE.COM", 90, 182, "#8c9b80", { align: "center" });
    const X = 40, Y = 800, S = 11, w = shot.width * S, h = shot.height * S;
    return out(print(c, (p) => {
      p.drawImage(shot, X, Y, w, h);
      // stair-stepped corners, one splash pixel per step
      [[0, 3], [1, 2], [2, 1]].forEach(([row, n]) => {
        for (const yy of [Y + row * S, Y + h - (row + 1) * S]) { p.clearRect(X, yy, n * S, S); p.clearRect(X + w - n * S, yy, n * S, S); }
      });
    }));
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

// Screenshots of the games. sel is the element to capture; setup runs after load (start a run, close a menu).
const SHOTS = {
  "par-for-the-curse": { url: "/par-for-the-curse/", sel: "#game", exe: "PAR4THECURSE.EXE", big: "FORE!!!", small: ["MULTIPLAYER RAGE GOLF", "UP MOUNT BOGEY."], accent: "#2f8f3a" },
  "bear-run": { url: "/bear-run/", sel: "#game", exe: "BEARRUN.EXE", big: "RUN.", small: ["SOMETHING IS", "ON YOUR TAIL."], accent: "#2457d6" },
  "fell-swoop": { url: "/fell-swoop/", sel: "#game", exe: "FELLSWOOP.EXE", big: "TIMBER!", small: ["FIRST-PERSON TREE CHOPPING.", "MIND THE AXE."], accent: "#3f7d4e" },
  "peel-out": { url: "/peel-out/", sel: "#game", exe: "PEELOUT.EXE", big: "PEEL OUT", small: ["PIES STAY ON THE PEEL.", "MOSTLY."], accent: "#b8442a" },
  "craps": { url: "/craps/", sel: "#view", exe: "CRAPS.EXE", big: "SEVEN OUT", small: ["LIVE MULTIPLAYER", "3D CRAPS."], accent: "#1f6b3a" },
  "quarterly-rollout": { url: "/quarterly-rollout/", sel: "#screen", exe: "QUARTERLY.EXE", big: "SWIVEL HARD", small: ["AN OFFICE-CHAIR", "ACTION GAME."], accent: "#3a3a8c", pixel: true },
  "roughing-it": { url: "/roughing-it/", sel: "#scene", exe: "ROUGHINGIT.EXE", big: "GO WEST", small: ["A TRAIL GAME AFTER", "MARK TWAIN, 1872."], accent: "#8a5a32", pixel: true },
  "bonsai": { url: "/bonsai/", sel: "#c", exe: "BONSAI.EXE", big: "WATER ME", small: ["IT GROWS WHILE YOU'RE GONE.", "LIKE YOUR REAL PLANTS."], accent: "#4f6a32" },
  "matrix-rain": { url: "/matrix/rain.html", sel: "#c", exe: "RAIN.SCR", big: "WAKE UP.", small: ["A SCREENSAVER FOR", "EVERY MONITOR."], accent: "#0f5a1f" },
  "strange-weather": { url: "/strange-weather/", sel: "canvas", wait: 9000, exe: "WEATHER.EXE", big: "LOOK UP", small: ["A STORY ABOUT", "LOOKING UP."], accent: "#6b3fa0" },
  "projection-mayhem": { url: "/projection-mayhem/", mode: "page", exe: "PROJECTION.EXE", big: "NOW SHOWING", small: ["A PROJECTIONIST SIM AT THE", "PAPER STREET PICTURE HOUSE."], accent: "#8a1c1c" },
  "madame-haiku": { url: "/psychic/", mode: "page", exe: "MADAMEHAIKU.EXE", big: "ASK THE CARDS", small: ["TAROT READ BY A", "VERY SMALL AI."], accent: "#5b3a9c" },
  "safe-water": { url: "/safe-water/", mode: "page", exe: "SAFEWATER.EXE", big: "SAFE WATER", small: ["A PUZZLE ADVENTURE IN", "MARK TWAIN'S COUNTRY."], accent: "#7a5a12" },
};

// Prop sheets from the games' Blender-built models.
const PROPS = {
  "mount-bogey": { title: "MOUNT BOGEY", sub: "HAZARDS OF PAR FOR THE CURSE", accent: "#8fc46a", items: [
    { file: "/par-for-the-curse/assets/props.glb", nodes: ["goose"], label: "GOOSE" },
    { file: "/par-for-the-curse/assets/props.glb", nodes: ["windmill_base", "windmill_blades"], label: "WINDMILL" },
    { file: "/par-for-the-curse/assets/props.glb", nodes: ["golf_cart"], label: "GOLF CART" },
    { file: "/par-for-the-curse/assets/props.glb", nodes: ["cannon_base", "cannon_barrel"], label: "CANNON" },
    { file: "/par-for-the-curse/assets/props.glb", nodes: ["trophy"], label: "TROPHY" },
    { file: "/par-for-the-curse/assets/props.glb", nodes: ["blimp"], label: "BLIMP" },
  ] },
  "binding-order": { title: "BINDING ORDER", sub: "A LOCKPICKING SIMULATOR", accent: "#9fd8ff", blueprint: "#9fd8ff", items: [
    { file: "/binding-order/assets/locks.glb", nodes: ["padlock4_skin", "padlock4_shell", "padlock4_plug", "padlock4_shackle"], label: "PADLOCK" },
    { file: "/binding-order/assets/locks.glb", nodes: ["deadbolt5_skin", "deadbolt5_shell", "deadbolt5_plug"], label: "DEADBOLT" },
    { file: "/binding-order/assets/tools.glb", nodes: ["pick_hook", "pick_hook_grip"], label: "HOOK", el: 60 },
    { file: "/binding-order/assets/tools.glb", nodes: ["wrench_bok"], label: "TENSION WRENCH", el: 60 },
  ] },
  "picture-house": { title: "PAPER STREET", sub: "PROJECTION MAYHEM", accent: "#ffd23a", items: [
    { file: "/projection-mayhem/assets/library.glb", nodes: ["proj35"], label: "35MM PROJECTOR" },
    { file: "/projection-mayhem/assets/library.glb", nodes: ["popcorn", "popcorn_fill"], label: "POPCORN" },
    { file: "/projection-mayhem/assets/library.glb", nodes: ["filmcans"], label: "FILM CANS" },
    { file: "/projection-mayhem/assets/library.glb", nodes: ["soda"], label: "SODA" },
  ] },
  "timberline": { title: "TIMBERLINE", sub: "A TREE FELLING SIM", accent: "#e8892e", items: [
    { file: "/timberline/assets/models/harvester.glb", label: "HARVESTER" },
    { file: "/timberline/assets/models/chainsaw.glb", label: "CHAINSAW" },
    { file: "/timberline/assets/models/axe.glb", label: "AXE" },
    { file: "/timberline/assets/models/wedge.glb", label: "WEDGE" },
  ] },
  "rack-and-ruin": { title: "RACK & RUIN", sub: "DATA CENTER DEMOLITION", accent: "#d8473a", items: [
    { file: "/demolition/assets/rack.glb", label: "RACK" },
    { file: "/demolition/assets/gpu4u.glb", label: "GPU SERVER" },
    { file: "/demolition/assets/ups.glb", label: "UPS" },
    { file: "/demolition/assets/crac.glb", label: "CRAC UNIT" },
  ] },
};

const HIDE_HTML = "body{visibility:hidden!important}canvas{visibility:visible!important}";
// A blank page on the dev server's origin with three.js mapped, for composing shots and prop sheets.
const BLANK = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"}}</script><body style="margin:0">`;

async function capture(page, s) {
  await page.goto(base + s.url, { waitUntil: "load" });
  await page.waitForTimeout(s.wait ?? 6000);
  if (s.setup) await s.setup(page);
  if (s.mode === "page") return page.screenshot({ clip: { x: 0, y: 52, width: 1280, height: 748 } });
  await page.addStyleTag({ content: HIDE_HTML });
  await page.waitForTimeout(300);
  return (await page.$(s.sel)).screenshot();
}

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });   // 2× screenshots print sharper
await context.route(base + "/__merch.html", (r) => r.fulfill({ contentType: "text/html", body: BLANK }));
fs.mkdirSync(path.join(root, "shop/print"), { recursive: true });
fs.mkdirSync(path.join(root, "shop/designs"), { recursive: true });

function save(id, res) {
  for (const [kind, dir] of [["print", "print"], ["preview", "designs"]]) fs.writeFileSync(path.join(root, "shop", dir, `${id}.png`), Buffer.from(res[kind].split(",")[1], "base64"));
  console.log(`${id}: shop/print/${id}.png (${(fs.statSync(path.join(root, "shop/print", id + ".png")).size / 1024).toFixed(0)} KB)`);
}

async function run(id, fn) {
  if (only.length && !only.includes(id)) return;
  const page = await context.newPage();
  page.on("pageerror", (e) => console.warn(`  ${id}: page error: ${e.message}`));
  try { save(id, await fn(page)); } catch (e) { console.warn(`  ${id}: FAILED ${e.message}`); process.exitCode = 1; }
  await page.close();
}

const compose = async (page, expr) => { await page.goto(base + "/__merch.html"); await page.evaluate(HELPERS); return page.evaluate(expr); };

try {
  for (const [id, d] of Object.entries(DESIGNS)) await run(id, async (page) => {
    if (!fs.existsSync(path.join(root, d.url))) throw new Error(`${d.url} isn't in this checkout; keeping the existing files`);
    await page.goto(base + d.url, { waitUntil: "load" });
    await page.waitForTimeout(800);
    if (d.setup) await d.setup(page);
    await page.evaluate(HELPERS);
    return page.evaluate(`(${d.draw.toString()})()`);
  });
  for (const [id, s] of Object.entries(SHOTS)) await run(id, async (page) => {
    const png = await capture(page, s);
    return compose(page, `exe("data:image/png;base64,${png.toString("base64")}", ${JSON.stringify(s)})`);
  });
  for (const [id, p] of Object.entries(PROPS)) await run(id, (page) => compose(page, `propSheet(${JSON.stringify(p.items)}, ${JSON.stringify(p)})`));
} finally {
  await browser.close();
  server.kill();
}
