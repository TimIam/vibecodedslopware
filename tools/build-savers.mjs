// Builds the photoreal screensavers: tools/savers/{page.html,shell.css,head.js,tail.js} + <dir>/src/scene.js
// become one self-contained <dir>/<file>. Run after changing either side:  node tools/build-savers.mjs [dir]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const svg = (body, bg) => `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='${bg.replace("#", "%23")}'/>${body}</svg>`;

const SAVERS = [
  { dir: "snowglobe", file: "globe.html", title: "Snow Globe", desc: "Photoreal snow globes on a shelf across every monitor. Shake them. A toy train keeps the rounds.", loading: "Filling the glass", accent: "#cfe3f5", accentFg: "#10202e", ink: "#e6edf4", bg: "#07090c", panel: "rgba(12,16,22,.8)", icon: svg("<circle cx='50' cy='44' r='30' fill='%23cfe3f5'/><rect x='26' y='72' width='48' height='14' rx='4' fill='%23302016'/>", "#10202e") },
  { dir: "terrarium", file: "tank.html", title: "Terrarium", desc: "A photoreal reptile terrarium across every monitor. Feed crickets, mist the glass, watch them bask.", loading: "Misting the glass", accent: "#b9d68a", accentFg: "#172208", ink: "#e8ecd9", bg: "#070a05", panel: "rgba(14,19,10,.82)", icon: svg("<ellipse cx='50' cy='56' rx='30' ry='13' fill='%23b9d68a'/><circle cx='78' cy='48' r='9' fill='%23b9d68a'/>", "#22300f") },
  { dir: "rainwindow", file: "window.html", title: "Rain Window", desc: "A rain-streaked window at night across every monitor. Draw in the fog while the city goes by.", loading: "Waiting for rain", accent: "#ffb56b", accentFg: "#2a1605", ink: "#ecebea", bg: "#05070b", panel: "rgba(10,13,20,.8)", icon: svg("<rect x='22' y='18' width='56' height='64' rx='5' fill='%23182638'/><path d='M38 28v14M56 34v20M46 56v14' stroke='%23ffb56b' stroke-width='5' stroke-linecap='round'/>", "#0b121c") },
  { dir: "koipond", file: "pond.html", title: "Koi Pond", desc: "A photoreal koi pond seen from above, across every monitor. Feed them and trail your finger in the water.", loading: "Filling the pond", accent: "#f2a65a", accentFg: "#2b1503", ink: "#eaf0ea", bg: "#050b0a", panel: "rgba(8,18,16,.8)", icon: svg("<ellipse cx='48' cy='50' rx='28' ry='13' fill='%23f26b3a'/><path d='M74 50l14-11v22z' fill='%23f26b3a'/><circle cx='30' cy='46' r='6' fill='%23fff'/>", "#0d2b2a") },
  { dir: "aurora", file: "sky.html", title: "Aurora", desc: "Northern lights over a frozen lake, across every monitor. Release lanterns and make a wish on the meteors.", loading: "Waiting for dark", accent: "#7ef0b8", accentFg: "#04201a", ink: "#e4efea", bg: "#02040a", panel: "rgba(6,12,20,.8)", icon: svg("<path d='M10 70C30 20 50 80 90 24v60H10z' fill='%237ef0b8' opacity='.8'/><path d='M10 82h80' stroke='%23031' stroke-width='6'/>", "#031018") },
];

const only = process.argv[2];
const page = read("tools/savers/page.html"), css = read("tools/savers/shell.css"), head = read("tools/savers/head.js"), tail = read("tools/savers/tail.js");
for (const s of SAVERS) {
  if (only && s.dir !== only) continue;
  if (!fs.existsSync(path.join(root, s.dir, "src", "scene.js"))) continue;
  const values = { ...s, css, head, tail, scene: read(s.dir, "src", "scene.js") };
  const html = page.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? values[k] : m));
  fs.writeFileSync(path.join(root, s.dir, s.file), html);
  console.log(`${s.dir}/${s.file}  ${(html.length / 1024).toFixed(0)} KB`);
}
