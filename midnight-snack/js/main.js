// MIDNIGHT SNACK: a stealth-horror fridge raid. Fan-made for CaseOh; not affiliated.
import { Snd } from "./audio.js";
import { W, H, ROOMS, FOOD, WAYPOINTS, makeHouse, walk, los, bfs, path, nearestFloor, distToRect, roomOf } from "./map.js";
import { T, drawStatic, drawDynamic, drawCase, drawMonster, drawEyes, drawFace } from "./art.js";

const cv = document.getElementById("game"), ctx = cv.getContext("2d");
const VW = 768, MAPH = 480, VH = 528;
cv.width = VW * 2; cv.height = VH * 2;
const lightCv = document.createElement("canvas"); lightCv.width = W; lightCv.height = H;
const lctx = lightCv.getContext("2d"), limg = lctx.createImageData(W, H);
const chatEl = document.getElementById("chatlog"), viewersEl = document.getElementById("viewers");
const muteBtn = document.getElementById("mute");
const syncMute = () => { muteBtn.textContent = Snd.on ? "♪ Sound on" : "♪ Sound off"; muteBtn.setAttribute("aria-pressed", String(!Snd.on)); };
muteBtn.addEventListener("click", () => { Snd.wake(); Snd.setOn(!Snd.on); syncMute(); });
syncMute();

const NIGHTS = [
  { quota: 4000, sleep: 14, line: "It's asleep in the garage. Probably." },
  { quota: 7000, sleep: 6, line: "It checks hiding spots now." },
  { quota: 10000, sleep: 3, line: "It walks faster tonight. It is never hungry." },
  { quota: 13000, sleep: 0, line: "The floorboards are worse. Everything creaks." },
  { quota: 17000, sleep: 0, line: "Final night. It brought a scale." },
];
const NIGHT_LEN = 150; // seconds, 3:00 AM to 6:00 AM
const AMB = 0.045;
const EMO = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
const FONT = "'Trebuchet MS','Segoe UI',system-ui,sans-serif";

const best = JSON.parse(localStorage.getItem("ms-best") || '{"night":0,"kcal":0}');
const R = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.round(n).toLocaleString("en-US");

let G = { mode: "title", t: 0, speed: 1, total: 0 };
const keys = new Set();
const key = (...ks) => ks.some(k => keys.has(k)) ? 1 : 0;

// ---------------------------------------------------------------- chat
const USERS = ["BigBackBandit", "LegoPiece1x1", "FridgeWhisperer", "SnackOverflow", "ChairCrusher9000", "GravyTrain", "Seismograph_Steve",
  "MomSaysEatVeggies", "TurkeyTheft", "DietSodaDealer", "BurgerBaron", "KitchenNightmare", "ButterStickBob", "CreakyFloorFan",
  "NoSecondsAllowed", "DoritoDust", "Nugget_42", "3AMsnacker", "WeighStation", "BuffetBouncer", "lowkeyhungry", "ScaleSaysError"];
const UCOL = ["#ff7a7a", "#ffb35c", "#ffe066", "#8be37a", "#6ec8ff", "#c79bff", "#ff8ad8", "#7fffd4"];
const CHAT = {
  idle: ["case walking to the fridge registers on the richter scale", "bro is a 1x1 lego piece", "the scale asked for one at a time", "mans has his own zip code",
    "he's not fat he's just in 4K", "case's shadow has a shadow", "bro said 'diet' and the fridge laughed", "his chair filed for workers comp",
    "google maps reroutes around him", "he doesn't need a fridge, the fridge needs him", "bro thinks salad is a garnish", "his belt is on its last notch fr",
    "case uses a pizza as a coaster", "the house tilts when he goes upstairs", "bro's blood type is ranch", "NASA called, they want their moon back",
    "this is the most cardio he's done all year", "case's mattress has a dent shaped like a continent", "he's big boned. like all of them. every bone",
    "WSG chat", "who else here at 3am lol", "first time chatter, he's bigger than I thought"],
  creak: ["THE FLOOR SCREAMED 💀", "floorboard said ow", "that board is never recovering", "house is filing a structural report", "the foundation cracked live on stream",
    "bro stepped on it like it owed him money", "LOUD", "sneak with SHIFT bro 😭"],
  fart: ["💨", "he's leaking", "chat I can smell it through the screen", "that one had a WHISTLE", "squeaky", "he's deflating", "pfffft 💀"],
  big: ["💨💨💨💨💨", "NUCLEAR", "THE WINDOWS FOGGED UP", "he weaponized it", "geneva convention violation", "THAT WAS A TUBA", "seismic activity detected",
    "my headphones are brown now", "CLIP IT"],
  forced: ["HE COULDN'T HOLD IT 😭", "the stomach snitched", "involuntary 💀", "bro had no say in that"],
  heavy: ["he took the WHOLE {item} 💀", "bro is carrying the {item} like a baby", "that {item} was for the family", "the {item} weighs more than my car"],
  eat: ["he ate it in the HALLWAY", "no chewing detected", "the {item} never stood a chance", "inhaled not eaten", "bro unhinged his jaw for the {item}"],
  caught: ["HE GOT PORTION CONTROLLED", "L + diet", "the dietician wins again", "BRO SCREAMED 😭", "clip it CLIP IT", "he dropped the food 😭😭", "RIP the snacks"],
  scare: ["HE SCREAMED LIKE A TEAKETTLE", "clip that", "the yelp 😭😭", "his soul left and went to the fridge", "AAAAA", "bro jumped and the house moved"],
  deposit: ["W SNACK RUN", "the stash grows", "chat he's actually good at this", "stealth god (heavy)", "W", "back to the chair 🪑", "the chair is scared"],
  hide: ["bro thinks he's hidden 💀", "hide and seek champion (visible from space)", "hiding {spot}?? we can see you", "he's sticking out of it", "there is no way he fits {spot}"],
  chase: ["RUN CASE RUN", "he's not built for cardio", "it's gaining", "DROP THE FOOD BRO", "FART ON IT", "SPACE BAR SPACE BAR"],
  gag: ["IT'S GAGGING 💀", "he gassed the dietician", "the Portion Controller needs a minute", "chemical warfare W"],
  ban: ["o7 {user}", "{user} got hammered", "RIP {user}", "bro got banned for the truth"],
  win: ["W NIGHT", "HE DID IT", "quota smashed", "certified fridge raider"],
};
G.chat = [];
const recent = [];
function fresh(list) { // don't repeat a line chat said recently
  let s, tries = 0;
  do s = pick(list); while (recent.includes(s) && ++tries < 8);
  recent.push(s); if (recent.length > 14) recent.shift();
  return s;
}
function chatPush(text, opt = {}) {
  const u = opt.user || pick(USERS);
  const msg = { id: Math.random(), user: u, text, tip: !!opt.tip, sys: !!opt.sys, banned: false, col: opt.col || UCOL[USERS.indexOf(u) % UCOL.length] || "#ccc" };
  G.chat.push(msg); if (G.chat.length > 60) G.chat.shift();
  const li = document.createElement("li"); li.dataset.id = msg.id;
  if (msg.tip) li.className = "tip";
  if (msg.sys) li.className = "sys";
  li.innerHTML = msg.sys ? "" : `<b style="color:${msg.tip ? "#5de08a" : msg.col}">${msg.tip ? "🛡 " : ""}${u}</b>: `;
  li.append(document.createTextNode(text));
  msg.el = li; chatEl.append(li);
  while (chatEl.children.length > 60) chatEl.firstChild.remove();
  chatEl.scrollTop = chatEl.scrollHeight;
  return msg;
}
function chatEvent(kind, vars = {}, n = 1, prob = 1) {
  if (Math.random() > prob) return;
  for (let i = 0; i < n; i++) setTimeout(() => {
    let s = fresh(CHAT[kind]); for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
    chatPush(s);
  }, i * R(120, 420));
}
function tipText() {
  const m = G.m, p = G.p, rm = roomOf(G.h, m.x, m.y);
  const opts = [];
  if (m.state === "sleep") opts.push("it's still asleep in the garage, GO GO GO");
  else {
    opts.push(`it's in the ${rm ? rm.name.toLowerCase() : "hallway"} rn`);
    if (m.state === "investigate" || m.state === "chase") opts.push("careful it's coming your way");
  }
  const fr = G.h.furn.find(f => f.k === "fridge");
  if (fr.items.length) opts.push(`${fr.items.length} things still in the fridge`);
  const fz = G.h.furn.find(f => f.k === "freezer");
  if (fz.items.includes("turkey")) opts.push("there's a WHOLE TURKEY in the garage freezer");
  if (G.phone) opts.push("turn your phone light off (L), it can see the light");
  if (p.gas > 70) opts.push("you're about to blow, let some out with F");
  opts.push("light-colored boards are the creaky ones");
  return pick(opts);
}

// ---------------------------------------------------------------- case talks
const SAY = {
  grab: ["This is a diet snack, chat.", "It's for my health.", "Shh. Shh. Shhhh.", "Don't tell my mom.", "Ain't nobody gonna miss this.", "Stealth. Mode."],
  heavy: ["This is muscle. I'm carrying it with muscle.", "I'm big-boned. The food is big-boned too.", "Okay this might be a two-trip item.", "Lift with the legs, chat."],
  creak: ["That was the house settling.", "That wasn't me. That was the floor.", "Who installed this floor?!", "The floor's lying, chat."],
  fart: ["...excuse me.", "That was a squeaky shoe.", "Chat, it's the AC.", "Pressure release. Science."],
  big: ["I'M A WEAPON.", "Get him out of here!", "Breathe THAT in.", "Chat, that one had BASS."],
  forced: ["...that wasn't on purpose.", "Chat. I couldn't hold it.", "My stomach snitched."],
  eat: ["Just a taste.", "*inhales*", "Evidence destroyed.", "Chewing is for quitters."],
  deposit: ["The stash grows.", "Easy money.", "Chat, I'm literally him.", "The chair missed me."],
  scare: ["AH!", "WHAT IS THAT?!", "NOPE.", "CHAT DID YOU SEE THAT?!"],
  hide: ["I'm invisible.", "Can't see me.", "I'm part of the furniture now."],
  ban: ["BANNED.", "Get him out of here.", "Who said that? BANNED.", "I'm big-boned. BANNED.", "Mods. MODS."],
  banTip: ["Wait, that was the mod. My bad.", "Okay that one was helpful. Oops."],
  empty: ["It's empty. Like my soul.", "Nothing. Who ate this?! ...oh."],
  spotted: ["Oh no. Oh no no no.", "It sees me.", "CHAT IT'S HERE."],
  respawn: ["I'm going back for that food.", "That's a skill issue. ITS skill issue.", "I wasn't even scared."],
  tank: ["Nothing in the tank, chat.", "I need to eat something first."],
};
function say(kind, prob = 1, force = false) {
  if (Math.random() > prob) return;
  if (!force && G.p.bubble && G.p.bubble.t > 1.2) return;
  G.p.bubble = { text: pick(SAY[kind]), t: 2.6 };
}

// ---------------------------------------------------------------- setup
function newPlayer() {
  return { x: 7.5, y: 6.2, face: { x: 0, y: 1 }, carry: [], hidden: null, rush: 0, boost: 0, gas: 15, walk: 0, stepAcc: 0, act: null, bubble: null, moving: false, sneak: false, leakT: 0, compromised: false };
}
function newMonster(n) {
  return { x: 42.5, y: 25.5, face: { x: -1, y: 0 }, state: NIGHTS[n - 1].sleep > 0 ? "sleep" : "patrol", sleepT: NIGHTS[n - 1].sleep, path: null, target: null,
    sus: 0, lost: 0, seenAgo: 99, lastSeen: null, stun: 0, immune: 0, walk: 0, stepAcc: 0, pause: 0, repath: 0, searchT: 0, center: null, checking: null, mark: 0, moving: false };
}
function startNight(n) {
  Snd.wake();
  const h = makeHouse(n);
  G = { ...G, mode: "intro", modeT: 0, night: n, h, stat: drawStatic(h), p: newPlayer(), m: newMonster(n), lives: 3, banked: 0, clock: 0,
    phone: true, fridgeOpen: 0, freezerOpen: 0, clouds: [], rings: [], floaters: [], shake: 0, flash: 0, flashCol: "#fff", banStreak: 0, banFlash: 0,
    fake: null, fakeDone: new Set(), heartT: 0, chaseT: 0, idleChat: 2, tipT: 8, hintT: 0, L: new Float32Array(W * H), pLit: 0, lostKcal: 0,
    stats: { small: 0, big: 0, creaks: 0, eaten: 0, bans: 0, scares: 0, caught: 0, items: 0 } };
  chatEl.innerHTML = "";
  chatPush(`— Night ${n} — 3:00 AM —`, { sys: true });
  chatEvent("idle", {}, 3);
}
const mult = () => 1 + Math.min(0.5, 0.05 * G.banStreak);
const weight = () => G.p.carry.reduce((s, id) => s + FOOD[id].wt, 0);

// ---------------------------------------------------------------- sound in the house
function noise(x, y, r, mine = true) {
  if (mine) G.rings.push({ x, y, r, t: 0 });
  const m = G.m;
  if (m.stun > 0) return;
  const [nx, ny] = nearestFloor(G.h, x, y);
  const d = bfs(G.h, nx, ny, Math.ceil(r) + 1);
  const [mx, my] = nearestFloor(G.h, m.x, m.y);
  const md = d[my * W + mx];
  if (md < 0 || md > r) return;
  const loud = r - md;
  if (m.state === "sleep") { if (loud < 1.5) return; chatPush("uh oh it woke up", { user: "BigBackBandit" }); }
  if (m.state === "chase") return;
  m.state = "investigate"; m.target = [nx, ny]; m.path = null; m.repath = 0; m.mark = 1.2; m.pause = 0;
}

// ---------------------------------------------------------------- player actions
function nearFurn() {
  const p = G.p; let bestF = null, bd = 1.05;
  for (const f of G.h.furn) {
    const d = distToRect(p.x, p.y - 0.25, f) - (f.items.length ? 0.15 : 0);
    if (d < bd && (f.items.length || f.hide || f.stash || f.pool)) { bd = d; bestF = f; }
  }
  return bestF;
}
function interact() {
  const p = G.p;
  if (p.hidden) { unhide(); return; }
  if (p.act) return;
  const f = nearFurn(); if (!f) return;
  if (f.items.length) {
    const id = f.items[f.items.length - 1];
    p.act = { f, t: 0, dur: 0.3 + FOOD[id].wt * 0.1 + (f.open ? 0.25 : 0) };
    if (f.k === "fridge") { if (G.fridgeOpen <= 0) { Snd.fridgeOpen(); Snd.fridgeHum(true); maybeFake("fridge"); } G.fridgeOpen = 1.6; noise(p.x, p.y, 2.6); }
    else if (f.k === "freezer") { if (G.freezerOpen <= 0) { Snd.fridgeOpen(); maybeFake("freezer"); } G.freezerOpen = 1.6; noise(p.x, p.y, 2.4); }
    else { Snd.rustle(0.4); noise(p.x, p.y, 1.2); }
  } else if (f.hide) hide(f);
  else if (f.stash) say("deposit", 1, true);
  else say("empty", 1, true);
}
function finishGrab() {
  const p = G.p, f = p.act.f; p.act = null;
  const id = f.items.pop(); if (!id) return;
  const food = FOOD[id];
  p.carry.push(id); G.stats.items++;
  Snd.pickup(); Snd.rustle(0.3);
  noise(p.x, p.y, 1 + food.wt * 0.3);
  G.floaters.push({ x: p.x, y: p.y - 3, text: `${food.e} ${food.n}`, t: 0, col: "#fff3c4" });
  if (food.wt >= 4) { say("heavy", 1, true); chatEvent("heavy", { item: food.n.toLowerCase() }, 2); }
  else { say("grab", 0.35); chatEvent("idle", {}, 1, 0.3); }
}
function hide(f) {
  const p = G.p, m = G.m;
  p.hidden = f; p.prevX = p.x; p.prevY = p.y; p.act = null;
  p.compromised = m.state === "chase" && m.seenAgo < 1.2;
  Snd.rustle(0.5); noise(p.x, p.y, 0.8);
  say("hide", 0.6, true); chatEvent("hide", { spot: f.hide }, 1, 0.6);
}
function unhide() {
  const p = G.p; p.hidden = null; p.x = p.prevX; p.y = p.prevY; p.compromised = false;
  Snd.rustle(0.4); noise(p.x, p.y, 0.8);
}
function eat() {
  const p = G.p; if (!p.carry.length || p.hidden) return;
  const id = p.carry.pop(), food = FOOD[id];
  const gain = Math.round(food.kcal * 0.4 * mult());
  G.banked += gain; G.stats.eaten++;
  p.gas = Math.min(100, p.gas + 6 + food.wt * 7); p.rush = 5;
  Snd.chomp(); noise(p.x, p.y, 1.8);
  G.floaters.push({ x: p.x, y: p.y - 3, text: `+${fmt(gain)} kcal (ate it)`, t: 0, col: "#ffcf5c" });
  say("eat", 0.8, true); chatEvent("eat", { item: food.n.toLowerCase() }, 1);
}
function leak() {
  const p = G.p; if (p.gas < 4) return;
  const k = pick(["squeak", "squeak", "flap", "wet"]);
  Snd.fart(k, p.hidden ? 0.28 : 0.42);
  noise(p.hidden ? p.prevX : p.x, p.hidden ? p.prevY : p.y, p.hidden ? 1.6 : 2.4);
  p.gas = Math.max(0, p.gas - 9); G.stats.small++;
  G.clouds.push({ x: p.x + R(-0.2, 0.2), y: p.y - 0.2, r: 0.9, t: 0, life: 5, big: false });
  if (Math.random() < 0.3) { say("fart", 1); chatEvent("fart", {}, 1); }
}
function bigFart(forced = false) {
  const p = G.p, g = p.gas;
  if (!forced && g < 30) { say("tank", 1, true); return; }
  const kind = g > 85 ? "tuba" : g > 55 ? pick(["rumble", "wet"]) : "flap";
  Snd.fart(kind, 1.1);
  if (g > 85) setTimeout(() => Snd.fart("squeak", 0.5), 900);
  const cx = p.hidden ? p.prevX : p.x, cy = p.hidden ? p.prevY : p.y;
  noise(cx, cy, 5 + g / 10);
  // in a hiding spot the cloud stays trapped in there with you: no stun, just evidence
  if (p.hidden) G.clouds.push({ x: p.hidden.x + p.hidden.w / 2, y: p.hidden.y + p.hidden.h / 2, r: 1.2, t: 0, life: 7, big: false });
  else G.clouds.push({ x: cx, y: cy - 0.3, r: 1.4 + g / 42, t: 0, life: 7, big: true });
  p.gas = 0; p.boost = 0.9; G.shake = 0.35 + g / 200; G.stats.big++;
  if (forced) { say("forced", 1, true); chatEvent("forced", {}, 2); }
  else { say("big", 1, true); chatEvent("big", {}, 3); }
}
function ban() {
  const msg = [...G.chat].reverse().find(m => !m.banned && !m.sys);
  if (!msg) return;
  msg.banned = true; msg.el.classList.add("banned");
  const tag = document.createElement("span"); tag.className = "stamp"; tag.textContent = "BANNED"; msg.el.append(tag);
  Snd.ban(); G.stats.bans++; G.banFlash = 0.9;
  if (msg.tip) { G.banStreak = 0; say("banTip", 1, true); setTimeout(() => chatPush("case banned the MOD 💀"), 300); }
  else { G.banStreak++; say("ban", 0.8, true); chatEvent("ban", { user: msg.user }, 1, 0.6); }
}
function deposit() {
  const p = G.p; if (!p.carry.length) return;
  let sum = 0; for (const id of p.carry) sum += FOOD[id].kcal;
  sum = Math.round(sum * mult());
  G.banked += sum;
  G.floaters.push({ x: p.x, y: p.y - 3, text: `+${fmt(sum)} kcal STASHED${mult() > 1 ? ` (x${mult().toFixed(2)})` : ""}`, t: 0, col: "#7dff9b" });
  p.carry = [];
  Snd.deposit(); say("deposit", 1, true); chatEvent("deposit", {}, 2);
}

// ---------------------------------------------------------------- scares
const FAKES = {
  mirror: { x: 19.5, y: 0.6, near: [19.5, 2.5, 2.2], chance: 0.75 },
  kwin: { x: 43.5, y: 0.6, near: [43.5, 2.5, 2.6], chance: 0.55 },
  lwin: { x: 0.6, y: 17.6, near: [2.0, 18, 2.6], chance: 0.6 },
  tv: { x: 8.5, y: 27.6, near: [8.5, 25.5, 2.5], chance: 0.45 },
  fridge: { x: 32, y: 1.3, chance: 0.3 },
  freezer: { x: 45, y: 27, chance: 0.6 },
};
function maybeFake(id) {
  if (G.fakeDone.has(id) || G.clock < 12 || G.fake) return;
  G.fakeDone.add(id);
  if (Math.random() > FAKES[id].chance) return;
  const f = FAKES[id];
  G.fake = { x: f.x, y: f.y, t: 0 };
  Snd.sting(); Snd.yelp(0.12);
  noise(G.p.x, G.p.y, 5.5);
  G.shake = 0.45; G.flash = 0.5; G.flashCol = "#ffffff"; G.stats.scares++;
  say("scare", 1, true); chatEvent("scare", {}, 3);
}
function caught() {
  const p = G.p;
  G.mode = "scare"; G.modeT = 0;
  Snd.fridgeHum(false); Snd.scream();
  G.lostKcal = p.carry.reduce((s, id) => s + FOOD[id].kcal, 0);
  p.carry = []; p.hidden = null; p.act = null;
  G.lives--; G.stats.caught++;
  chatEvent("caught", {}, 5);
}
function respawn() {
  const p = G.p, gas = 15;
  Object.assign(p, newPlayer(), { gas });
  const m = G.m;
  let far = WAYPOINTS[0], fd = -1;
  for (const w of WAYPOINTS) { const d = Math.hypot(w[0] - 7, w[1] - 5); if (d > fd) { fd = d; far = w; } }
  Object.assign(m, { x: far[0] + 0.5, y: far[1] + 0.5, state: "patrol", path: null, sus: 0, stun: 0, immune: 3, lost: 0, seenAgo: 99, pause: 2.5 });
  say("respawn", 1, true);
}

// ---------------------------------------------------------------- the Portion Controller
function canSee() {
  const p = G.p, m = G.m; if (p.hidden) return false;
  const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
  const Rv = 5 + (G.phone ? 3.5 : 0) + (G.pLit > 0.35 ? 4 : 0) + 0.3 * (G.night - 1) - (p.sneak && !G.phone ? 1 : 0);
  if (d > Rv) return false;
  if (d > 1.8 && m.state !== "chase") { const c = (dx * m.face.x + dy * m.face.y) / d; if (c < Math.cos(1.05)) return false; }
  return los(G.h, m.x, m.y - 0.4, p.x, p.y - 0.4);
}
function setPathTo(tx, ty) {
  const m = G.m, [mx, my] = nearestFloor(G.h, m.x, m.y);
  m.path = path(G.h, mx, my, tx, ty) || [];
  m.target = [tx, ty];
}
function hideSpotNear(x, y, r) {
  const opts = G.h.furn.filter(f => f.hide && distToRect(x, y, f) < r);
  return opts.length ? pick(opts) : null;
}
function adjFloor(f) {
  const opts = [];
  for (let x = f.x - 1; x <= f.x + f.w; x++) for (let y = f.y - 1; y <= f.y + f.h; y++) if (walk(G.h, x, y)) opts.push([x, y]);
  return opts.length ? pick(opts) : nearestFloor(G.h, f.x, f.y);
}
function checkSpot(f) { // the monster pulls back the covers
  const p = G.p;
  if (p.hidden && p.hidden === f) { caught(); return true; }
  return false;
}
function startChase() {
  const m = G.m; m.state = "chase"; m.lost = 0; m.path = null; m.repath = 0;
  Snd.spotted(); say("spotted", 1, true); chatEvent("chase", {}, 3);
  G.flash = 0.25; G.flashCol = "#ff2020";
}
function updMonster(dt) {
  const m = G.m, p = G.p, n = G.night - 1;
  m.mark = Math.max(0, m.mark - dt);
  m.immune = Math.max(0, m.immune - dt);
  if (m.stun > 0) {
    m.stun -= dt; m.moving = false;
    if (Math.random() < dt * 1.2) Snd.gag(0.5 * vol(m), pan(m));
    if (m.stun <= 0) { m.state = "search"; m.searchT = 3; m.center = nearestFloor(G.h, m.x, m.y); m.path = null; }
    return;
  }
  if (m.state === "sleep") { m.sleepT -= dt; m.moving = false; if (m.sleepT <= 0) m.state = "patrol"; return; }

  const see = canSee();
  const d = Math.hypot(p.x - m.x, p.y - m.y);
  if (see) { m.sus = Math.min(1.2, m.sus + dt * (1.3 + Math.max(0, 9 - d) * 0.28) * (p.sneak ? 0.7 : 1)); m.seenAgo = 0; m.lastSeen = [Math.floor(p.x), Math.floor(p.y)]; }
  else { m.sus = Math.max(0, m.sus - dt * 0.3); m.seenAgo += dt; }
  if (see && m.sus >= 1 && m.state !== "chase") startChase();
  else if (see && m.sus > 0.35 && (m.state === "patrol" || m.state === "search")) { m.state = "investigate"; m.mark = 1; setPathTo(...m.lastSeen); }

  let speed = 1.5 + 0.12 * n;
  m.repath -= dt;
  if (m.state === "patrol") {
    if (m.pause > 0) { m.pause -= dt; lookAround(m, dt); }
    else if ((!m.path || !m.path.length) && m.checking) {
      const f = m.checking; m.checking = null;
      if (checkSpot(f)) return;
      m.pause = R(0.8, 1.6);
    } else if (!m.path || !m.path.length) {
      let tgt = pick(WAYPOINTS);
      if (n >= 1 && Math.random() < 0.3) { const f = pick(G.h.furn.filter(f => f.hide)); m.checking = f; tgt = adjFloor(f); } else m.checking = null;
      setPathTo(tgt[0], tgt[1]);
      if (!m.path.length) { if (m.checking && checkSpot(m.checking)) return; m.pause = R(0.6, 2); }
    }
  } else if (m.state === "investigate") {
    speed = 2.4 + 0.15 * n;
    if (!m.path || (m.repath <= 0 && m.target)) { setPathTo(...m.target); m.repath = 1.5; }
    if (!m.path.length) {
      // arrived: if Case is hiding right here (say, because he just farted in the closet), it finds him
      if (p.hidden && distToRect(m.x, m.y, p.hidden) < 2.4) { caught(); return; }
      m.state = "search"; m.searchT = 3 + n; m.center = [Math.floor(m.x), Math.floor(m.y)]; m.path = null; m.pause = 0.8;
    }
  } else if (m.state === "search") {
    speed = 1.8 + 0.12 * n;
    m.searchT -= dt;
    if (m.searchT <= 0) { m.state = "patrol"; m.path = null; }
    else if (m.pause > 0) { m.pause -= dt; lookAround(m, dt); }
    else if (!m.path || !m.path.length) {
      if (m.checking) { const f = m.checking; m.checking = null; if (checkSpot(f)) return; m.pause = 0.8; }
      else if (n >= 1 && Math.random() < 0.45 && (m.checking = hideSpotNear(m.center[0], m.center[1], 6))) { const a = adjFloor(m.checking); setPathTo(a[0], a[1]); }
      else {
        let tx, ty, tries = 0;
        do { tx = m.center[0] + Math.round(R(-4, 4)); ty = m.center[1] + Math.round(R(-4, 4)); } while (!walk(G.h, tx, ty) && ++tries < 20);
        if (walk(G.h, tx, ty)) setPathTo(tx, ty);
        m.pause = R(0.3, 1.0);
      }
    }
  } else if (m.state === "chase") {
    speed = 3.1 + 0.22 * n;
    if (!see) m.lost += dt; else m.lost = 0;
    if (p.hidden && p.compromised && distToRect(m.x, m.y, p.hidden) < 1.6) { caught(); return; }
    if (m.lost > 3.2) { m.state = "search"; m.searchT = 5 + n; m.center = m.lastSeen || [Math.floor(m.x), Math.floor(m.y)]; m.path = null; m.sus = 0.5; }
    else if (m.repath <= 0 || !m.path || !m.path.length) {
      const tgt = p.hidden && p.compromised ? adjFloor(p.hidden) : see ? [Math.floor(p.x), Math.floor(p.y)] : m.lastSeen;
      if (tgt) setPathTo(tgt[0], tgt[1]);
      m.repath = 0.25;
    }
  }

  // stink clouds slow it, a big one stuns it
  for (const c of G.clouds) {
    const dc = Math.hypot(c.x - m.x, c.y - m.y);
    if (dc > c.r) continue;
    if (c.big && m.immune <= 0 && c.t < c.life - 1) {
      m.stun = 4.5; m.immune = 9; m.moving = false; Snd.gag(0.8 * vol(m), pan(m)); chatEvent("gag", {}, 2);
      G.floaters.push({ x: m.x, y: m.y - 3.5, text: "*GAG*", t: 0, col: "#9dff6a" });
      return;
    }
    speed *= 0.55;
  }

  // move
  const before = [m.x, m.y];
  if (m.state === "chase" && see && d < 1.6) moveToward(m, p.x, p.y, speed * dt);
  else if (m.path && m.path.length && m.pause <= 0) {
    const [tx, ty] = m.path[0];
    if (moveToward(m, tx + 0.5, ty + 0.5, speed * dt)) m.path.shift();
  }
  const moved = Math.hypot(m.x - before[0], m.y - before[1]);
  m.moving = moved > 0.001;
  if (m.moving) {
    m.face = { x: (m.x - before[0]) / moved, y: (m.y - before[1]) / moved };
    m.walk += moved; m.stepAcc += moved;
    if (m.stepAcc > 0.75) { m.stepAcc = 0; Snd.mstep((m.state === "chase" ? 0.7 : 0.45) * vol(m), pan(m)); }
  }
  if (!p.hidden && d < 0.7) caught();
}
function lookAround(m, dt) {
  const a = Math.atan2(m.face.y, m.face.x) + dt * 1.8 * Math.sin(G.t * 0.9);
  m.face = { x: Math.cos(a), y: Math.sin(a) };
}
function moveToward(o, tx, ty, step) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d <= step) { o.x = tx; o.y = ty; return true; }
  o.x += dx / d * step; o.y += dy / d * step; return false;
}
const vol = o => clamp(1.4 / (1 + Math.hypot(o.x - G.p.x, o.y - G.p.y) * 0.4), 0, 1);
const pan = o => clamp((o.x - G.p.x) / 14, -1, 1);

// ---------------------------------------------------------------- player update
function blocked(x, y) {
  const r = 0.36;
  for (const [ax, ay] of [[-r, -r * 0.6], [r, -r * 0.6], [-r, r * 0.4], [r, r * 0.4]]) if (!walk(G.h, Math.floor(x + ax), Math.floor(y + ay))) return true;
  return false;
}
function updPlayer(dt) {
  const p = G.p;
  p.rush = Math.max(0, p.rush - dt); p.boost = Math.max(0, p.boost - dt);
  if (p.bubble) { p.bubble.t -= dt; if (p.bubble.t <= 0) p.bubble = null; }
  // gas builds up; nerves make it worse when hiding
  p.gas += dt * (1.0 + 0.15 * (G.night - 1)) * (p.hidden ? 2.2 : 1);
  if (p.gas >= 100) { p.gas = 100; bigFart(true); }
  if (key("f")) { p.leakT -= dt; if (p.leakT <= 0) { leak(); p.leakT = 0.38; } } else p.leakT = 0;

  if (p.hidden) { p.moving = false; return; }
  let ix = key("d", "arrowright") - key("a", "arrowleft"), iy = key("s", "arrowdown") - key("w", "arrowup");
  p.sneak = !!key("shift");
  p.moving = !!(ix || iy);
  if (p.moving) {
    const l = Math.hypot(ix, iy); ix /= l; iy /= l; p.face = { x: ix, y: iy };
    if (p.act) { p.act = null; }
    const wt = weight(), wf = Math.max(0.36, 1 - wt * 0.065);
    const sp = (p.sneak ? 2.0 : 4.0) * wf * (p.rush > 0 ? 1.35 : 1) * (p.boost > 0 ? 1.7 : 1);
    const ox = p.x, oy = p.y;
    const step = sp * dt;
    // slide around door frames instead of snagging on their corners
    const slide = (dx, dy) => {
      for (const off of [0.15, -0.15, 0.3, -0.3, 0.45, -0.45]) {
        const sx = dy ? off : 0, sy = dx ? off : 0;
        if (!blocked(p.x + sx, p.y + sy) && !blocked(p.x + sx + dx, p.y + sy + dy)) {
          p.x += Math.sign(sx) * Math.min(Math.abs(sx), step); p.y += Math.sign(sy) * Math.min(Math.abs(sy), step); return;
        }
      }
    };
    if (ix) { if (!blocked(p.x + ix * step, p.y)) p.x += ix * step; else if (!iy) slide(ix * step, 0); }
    if (iy) { if (!blocked(p.x, p.y + iy * step)) p.y += iy * step; else if (!ix) slide(0, iy * step); }
    const dd = Math.hypot(p.x - ox, p.y - oy);
    p.walk += dd; p.stepAcc += dd;
    if (p.stepAcc >= 0.85) { p.stepAcc = 0; footstep(p.sneak, wt); }
  }
  if (p.act) {
    p.act.t += dt;
    if (p.act.f.k === "fridge") G.fridgeOpen = 1.6;
    if (p.act.f.k === "freezer") G.freezerOpen = 1.6;
    if (p.act.t >= p.act.dur) finishGrab();
  }
  if (roomOf(G.h, p.x, p.y)?.id === "bedroom" && p.carry.length) deposit();
  for (const id in FAKES) { const f = FAKES[id]; if (f.near && Math.hypot(p.x - f.near[0], p.y - f.near[1]) < f.near[2]) maybeFake(id); }
}
function footstep(sneak, wt) {
  const p = G.p, i = Math.floor(p.y) * W + Math.floor(p.x);
  const creaky = G.h.creaky.has(i);
  let r = sneak ? 0.5 + wt * 0.15 : 2.0 + wt * 0.35;
  Snd.step(clamp(0.22 + wt * 0.05 - (sneak ? 0.12 : 0), 0.05, 0.8));
  if (creaky) {
    r += (sneak ? 2.2 : 3.5) + wt * 0.45; Snd.creak(0.5 + wt * 0.05); G.stats.creaks++;
    say("creak", 0.3); chatEvent("creak", {}, 1, 0.5);
  }
  noise(p.x, p.y, r);
}

// ---------------------------------------------------------------- light
function computeLight() {
  const p = G.p, L = G.L, h = G.h;
  L.fill(AMB);
  const src = [];
  if (!p.hidden) {
    if (G.phone) src.push({ x: p.x, y: p.y - 0.4, r: 7.5, i: 0.95, cone: { x: p.face.x, y: p.face.y, cos: Math.cos(0.62) } });
    src.push({ x: p.x, y: p.y - 0.4, r: 2.4, i: G.phone ? 0.55 : 0.3 });
  }
  const others = [
    { x: 10.8, y: 2.2, r: 3.4, i: 0.5 },
    { x: 8.5, y: 27.3, r: 5, i: 0.42 + 0.15 * Math.sin(G.t * 13) * Math.sin(G.t * 3.1) },
    { x: 24.5, y: 11.8, r: 2.4, i: 0.35 },
    { x: 1.5, y: 14.5, r: 2.2, i: 0.3 },
  ];
  if (G.fridgeOpen > 0) others.push({ x: 32, y: 2.4, r: 6.5, i: 1 });
  if (G.freezerOpen > 0) others.push({ x: 45, y: 26.4, r: 4, i: 0.85 });
  const apply = (s, out) => {
    const x0 = Math.max(0, Math.floor(s.x - s.r)), x1 = Math.min(W - 1, Math.ceil(s.x + s.r));
    const y0 = Math.max(0, Math.floor(s.y - s.r)), y1 = Math.min(H - 1, Math.ceil(s.y + s.r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5, cy = y + 0.5, d = Math.hypot(cx - s.x, cy - s.y);
      if (d > s.r) continue;
      let v = s.i * Math.pow(1 - d / s.r, 1.1);
      if (s.cone && d > 0.9) { const c = ((cx - s.x) * s.cone.x + (cy - s.y) * s.cone.y) / d; v *= clamp((c - s.cone.cos) / 0.18, 0, 1); }
      const i = y * W + x;
      if (v <= out[i]) continue;
      if (!los(h, s.x, s.y, cx, cy)) continue;
      out[i] = v;
    }
  };
  for (const s of others) apply(s, L);
  const pi = Math.floor(p.y) * W + Math.floor(p.x);
  G.pLit = p.hidden ? 0 : L[pi];
  for (const s of src) apply(s, L);
}
function drawLight() {
  const L = G.L, d = limg.data;
  for (let i = 0; i < W * H; i++) {
    const a = 1 - Math.min(1, L[i] * 1.15);
    d[i * 4] = 4; d[i * 4 + 1] = 3; d[i * 4 + 2] = 12; d[i * 4 + 3] = a * 0.985 * 255;
  }
  lctx.putImageData(limg, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCv, 0, 0, W * T, H * T);
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const glow = (x, y, r, col) => { const g = ctx.createRadialGradient(x * T, y * T, 0, x * T, y * T, r * T); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect((x - r) * T, (y - r) * T, r * 2 * T, r * 2 * T); };
  if (G.fridgeOpen > 0) glow(32, 2.4, 5, "rgba(255,240,190,.22)");
  if (G.freezerOpen > 0) glow(45, 26.4, 3.5, "rgba(180,220,255,.2)");
  glow(8.5, 27, 4.5, `rgba(80,120,255,${0.12 + 0.05 * Math.sin(G.t * 11)})`);
  glow(10.8, 2, 3, "rgba(120,80,255,.12)");
  ctx.restore();
}

// ---------------------------------------------------------------- input
const ONE_SHOT = { e: interact, q: eat, " ": () => bigFart(false), b: ban, l: () => { G.phone = !G.phone; Snd.blip(G.phone ? 900 : 500, 0.1); } };
addEventListener("keydown", e => {
  if (e.target.closest?.(".site-topbar")) return;
  const k = e.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  if (e.repeat) { keys.add(k); return; }
  keys.add(k);
  Snd.wake();
  if (k === "m") { Snd.setOn(!Snd.on); syncMute(); return; }
  if (G.mode === "title") {
    if (k === "enter" || k === " ") startNight(1);
    else if (/^[1-5]$/.test(k) && +k <= best.night + 1) startNight(+k);
    return;
  }
  if (G.mode === "play") {
    if (k === "escape" || k === "p") { G.mode = "pause"; Snd.fridgeHum(false); return; }
    ONE_SHOT[k]?.();
    return;
  }
  advanceCard(k);
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => { keys.clear(); if (G.mode === "play") { G.mode = "pause"; Snd.fridgeHum(false); } });
cv.addEventListener("pointerdown", () => { Snd.wake(); cv.focus(); if (G.mode === "title") startNight(1); else if (G.mode !== "play") advanceCard("enter"); });

function advanceCard(k) {
  if (G.modeT < 0.6) return;
  if (G.mode === "pause") { if (k === "escape" || k === "p" || k === "enter" || k === " ") G.mode = "play"; else if (k === "q") G.mode = "title"; return; }
  if (!["enter", " ", "e"].includes(k)) return;
  if (G.mode === "intro") { G.mode = "play"; G.modeT = 0; }
  else if (G.mode === "caughtCard") { respawn(); G.mode = "play"; }
  else if (G.mode === "end") {
    if (G.won) { if (G.night >= 5) { G.mode = "victory"; G.modeT = 0; } else startNight(G.night + 1); }
    else startNight(G.night);
  } else if (G.mode === "fail") startNight(G.night);
  else if (G.mode === "victory") G.mode = "title";
}

// ---------------------------------------------------------------- loop
function update(dt) {
  G.t += dt; G.modeT = (G.modeT || 0) + dt;
  if (G.mode === "scare") { if (G.modeT > 1.5) { G.mode = G.lives > 0 ? "caughtCard" : "fail"; G.modeT = 0; } return; }
  if (G.mode !== "play") return;
  G.clock += dt;
  G.fridgeOpen = Math.max(0, G.fridgeOpen - dt); if (G.fridgeOpen <= 0) Snd.fridgeHum(false);
  G.freezerOpen = Math.max(0, G.freezerOpen - dt);
  G.shake = Math.max(0, G.shake - dt); G.flash = Math.max(0, G.flash - dt * 2); G.banFlash = Math.max(0, G.banFlash - dt);
  updPlayer(dt);
  if (G.mode !== "play") return;
  updMonster(dt);
  if (G.mode !== "play") return;
  for (const c of G.clouds) c.t += dt; G.clouds = G.clouds.filter(c => c.t < c.life);
  for (const r of G.rings) r.t += dt; G.rings = G.rings.filter(r => r.t < 0.7);
  for (const f of G.floaters) f.t += dt; G.floaters = G.floaters.filter(f => f.t < 2);
  if (G.fake) { G.fake.t += dt; if (G.fake.t > 0.9) G.fake = null; }
  // dread: heartbeat, chase pulse, drone
  const m = G.m, d = Math.hypot(m.x - G.p.x, m.y - G.p.y);
  const danger = m.state === "sleep" ? 0 : clamp(1 - d / 10, 0, 1);
  Snd.dread(m.state === "chase" ? 1 : danger * 0.6);
  G.heartT -= dt;
  if (danger > 0.1 && G.heartT <= 0) { Snd.heartbeat(0.25 + danger * 0.5); G.heartT = 1.1 - danger * 0.75; }
  if (m.state === "chase") { G.chaseT -= dt; if (G.chaseT <= 0) { Snd.chasePulse(); G.chaseT = 0.28; } }
  // chat
  G.idleChat -= dt;
  if (G.idleChat <= 0) { chatPush(fresh(CHAT.idle)); G.idleChat = R(2.2, 5); }
  G.tipT -= dt;
  if (G.tipT <= 0) { chatPush(tipText(), { tip: true, user: pick(["mod_Gravy", "mod_Crumbs", "BackseatBarry"]) }); G.tipT = R(9, 16); }
  viewersEl.textContent = `👁 ${fmt(41000 + Math.sin(G.t * 0.1) * 900 + G.banked / 3)}`;
  if (G.clock >= NIGHT_LEN) endNight();
}
function endNight() {
  Snd.fridgeHum(false);
  const p = G.p;
  G.won = G.banked >= NIGHTS[G.night - 1].quota;
  G.mode = "end"; G.modeT = 0; p.carry = [];
  if (G.won) {
    G.total += G.banked;
    best.night = Math.max(best.night, G.night); best.kcal = Math.max(best.kcal, G.banked);
    localStorage.setItem("ms-best", JSON.stringify(best));
    chatEvent("win", {}, 4); Snd.deposit();
  } else chatEvent("caught", {}, 2);
}

// ---------------------------------------------------------------- render
function text(s, x, y, size, col = "#fff", align = "left", weight = "bold", outline = true) {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = "middle";
  if (outline) { ctx.lineWidth = Math.max(2, size / 5); ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineJoin = "round"; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function bubble(s, x, y) {
  ctx.font = `bold 10px ${FONT}`;
  const w = Math.min(220, ctx.measureText(s).width + 12);
  const bx = clamp(x - w / 2, 4, VW - w - 4), by = Math.max(4, y - 22);
  ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.beginPath(); ctx.roundRect(bx, by, w, 16, 5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4, by + 16); ctx.lineTo(x + 2, by + 16); ctx.lineTo(x - 2, by + 21); ctx.fill();
  ctx.fillStyle = "#111"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, bx + w / 2, by + 8.5, w - 8);
}
function drawWorld() {
  const p = G.p, m = G.m;
  ctx.drawImage(G.stat, 0, 0, W * T, H * T);
  drawDynamic(ctx, G.h, G);
  // stink
  for (const c of G.clouds) {
    const a = Math.min(1, (c.life - c.t) / 1.5) * (c.big ? 0.4 : 0.25);
    for (let k = 0; k < (c.big ? 7 : 3); k++) {
      const ang = k * 2.4 + c.t * 0.5, rr = c.r * T * (0.35 + 0.25 * Math.sin(k + c.t));
      ctx.fillStyle = `rgba(120,200,60,${a})`;
      ctx.beginPath(); ctx.arc(c.x * T + Math.cos(ang) * rr, c.y * T + Math.sin(ang) * rr * 0.7, c.r * T * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  const ents = [];
  if (!p.hidden) ents.push({ y: p.y, draw: () => drawCase(ctx, p.x * T, p.y * T, { face: p.face, walk: p.walk, t: G.t, moving: p.moving, sneak: p.sneak, carry: p.carry.map(id => FOOD[id].e), scared: !!G.fake || m.state === "chase" }) });
  if (m.state !== "sleep" || true) ents.push({ y: m.y, draw: () => drawMonster(ctx, m.x * T, m.y * T, { t: G.t, face: m.face, state: m.state, stun: m.stun, moving: m.moving, walk: m.walk }) });
  ents.sort((a, b) => a.y - b.y).forEach(e => e.draw());
  drawLight();
  // glowing eyes in the dark
  const mi = Math.floor(m.y) * W + Math.floor(m.x), mLit = G.L[mi] || 0;
  const dm = Math.hypot(m.x - p.x, m.y - p.y);
  if (m.state !== "sleep" && mLit < 0.35 && dm < 11 && los(G.h, p.x, p.y - 0.4, m.x, m.y - 2)) drawEyes(ctx, m.x * T, m.y * T, G.t, m.state === "chase");
  if (m.state === "sleep" && mLit < 0.35 && dm < 7) { text("z", m.x * T + 6, m.y * T - 50 - (G.t * 8 % 10), 9, "#9ab"); }
  // status above its head (only when you could see it)
  if (mLit >= 0.35 || m.state === "chase") {
    if (m.state === "chase") text("!", m.x * T, m.y * T - 58, 16, "#ff3b3b", "center");
    else if (m.state === "investigate" || m.mark > 0) text("?", m.x * T, m.y * T - 58, 14, "#ffd24a", "center");
    else if (m.sus > 0.05) { ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(m.x * T - 10, m.y * T - 60, 20, 4); ctx.fillStyle = "#ffd24a"; ctx.fillRect(m.x * T - 10, m.y * T - 60, 20 * Math.min(1, m.sus), 4); }
  }
  // sound rings: you can see how loud you are
  for (const r of G.rings) {
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - r.t / 0.7)})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(r.x * T, r.y * T, r.r * T * (0.3 + r.t / 0.7 * 0.7), 0, Math.PI * 2); ctx.stroke();
  }
  if (p.hidden) {
    const f = p.hidden, cx = (f.x + f.w / 2) * T, cy = (f.y + f.h / 2) * T;
    ctx.font = `12px ${EMO}`; ctx.textAlign = "center"; ctx.fillText("👀", cx, cy);
    text(`Hiding ${f.hide}`, cx, cy - 16, 9, "#cfe", "center");
    if (p.gas > 70) text("gas is building up in here...", cx, cy + 16, 9, "#9dff6a", "center");
  } else {
    const f = nearFurn();
    if (f && !p.act) {
      const lbl = f.items.length ? (f.k === "fridge" ? `E  Raid THE FRIDGE` : f.k === "freezer" ? "E  Dig in the freezer" : `E  Grab ${FOOD[f.items.at(-1)].n}`) : f.hide ? `E  Hide ${f.hide}` : f.stash ? "Walk in here to stash food" : "empty";
      const ly = f.y * T - 14 < 30 ? (f.y + f.h) * T + 10 : f.y * T - 14;
      text(lbl, (f.x + f.w / 2) * T, ly, 9, f.items.length ? "#ffe9a8" : "#bbb", "center");
    }
    if (p.act) {
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(p.x * T - 14, p.y * T - 56, 28, 5);
      ctx.fillStyle = "#ffd24a"; ctx.fillRect(p.x * T - 14, p.y * T - 56, 28 * p.act.t / p.act.dur, 5);
    }
    if (p.bubble) bubble(p.bubble.text, p.x * T, p.y * T - 44 - p.carry.length * 8);
  }
  for (const f of G.floaters) text(f.text, f.x * T, f.y * T - f.t * 18, 10, f.col, "center");
  // fake-out faces: the window, the mirror, the fridge
  if (G.fake) {
    const f = G.fake, s = 0.09 + Math.min(0.06, f.t * 0.2);
    drawFace(ctx, f.x * T, f.y * T + 6, s, G.t, 0.7);
    if (f.t < 0.2) { ctx.globalAlpha = 0.55 * (1 - f.t / 0.2); drawFace(ctx, VW / 2, MAPH / 2, 1.1, G.t); ctx.globalAlpha = 1; }
  }
  // edges go red in a chase
  if (m.state === "chase") {
    const g = ctx.createRadialGradient(VW / 2, MAPH / 2, MAPH * 0.5, VW / 2, MAPH / 2, MAPH * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(170,0,0,${0.28 + 0.1 * Math.sin(G.t * 10)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, MAPH);
  }
  if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.6; ctx.fillStyle = G.flashCol; ctx.fillRect(0, 0, VW, MAPH); ctx.globalAlpha = 1; }
  if (G.banFlash > 0) {
    ctx.save(); ctx.translate(VW - 110, 70); ctx.rotate(-0.18); ctx.globalAlpha = Math.min(1, G.banFlash * 2);
    const s = 1 + (0.9 - G.banFlash) * 0.15;
    ctx.scale(s, s);
    ctx.strokeStyle = "#e0262b"; ctx.lineWidth = 4; ctx.strokeRect(-70, -20, 140, 40);
    text("BANNED", 0, 1, 28, "#e0262b", "center", "900", false);
    ctx.restore();
  }
  if (G.night === 1 && G.clock < 48) {
    const tips = ["WASD to move. SHIFT to sneak. Light-colored boards creak.", "Get food from THE FRIDGE (E) and walk it back to your room.",
      "Heavier food = slower and louder. Eat it (Q) to bank 40% now.", "Gas builds up. Hold F to leak quietly. SPACE for the BIG ONE: it stuns.",
      "L turns your phone light off. It sees the light. B bans the newest chat roast.", "Hide in furniture with E. Don't let the gas out in there."];
    const s = tips[Math.floor(G.clock / 8) % tips.length];
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(VW / 2 - 250, MAPH - 28, 500, 22);
    text(s, VW / 2, MAPH - 17, 11, "#ffe9a8", "center", "bold", false);
  }
}
function drawHUD() {
  const p = G.p, y0 = MAPH, q = NIGHTS[G.night - 1].quota;
  ctx.fillStyle = "#0e0b14"; ctx.fillRect(0, y0, VW, VH - MAPH);
  ctx.fillStyle = "#2a2238"; ctx.fillRect(0, y0, VW, 1);
  const mins = Math.min(180, G.clock / NIGHT_LEN * 180), hh = 3 + Math.floor(mins / 60), mm = Math.floor(mins % 60);
  text(`NIGHT ${G.night}`, 10, y0 + 14, 12, "#c9b8ff");
  text(`${hh}:${String(mm).padStart(2, "0")} AM`, 10, y0 + 33, 15, G.clock > NIGHT_LEN - 20 ? "#ffd24a" : "#fff");
  ctx.font = `13px ${EMO}`; ctx.textAlign = "left";
  for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < G.lives ? 1 : 0.2; ctx.fillText("🍩", 92 + i * 17, y0 + 15); }
  ctx.globalAlpha = 1;
  text("cheat days", 92, y0 + 33, 9, "#9a8fb5", "left", "normal", false);
  // quota
  const bx = 160, bw = 200;
  text(`STASH ${fmt(G.banked)} / ${fmt(q)} kcal`, bx, y0 + 12, 10, G.banked >= q ? "#7dff9b" : "#ffe9a8", "left", "bold", false);
  ctx.fillStyle = "#231b30"; ctx.fillRect(bx, y0 + 22, bw, 9);
  ctx.fillStyle = G.banked >= q ? "#4fd16b" : "#e0a52b"; ctx.fillRect(bx, y0 + 22, bw * Math.min(1, G.banked / q), 9);
  const carryK = p.carry.reduce((s, id) => s + FOOD[id].kcal, 0);
  if (carryK) { ctx.fillStyle = "rgba(255,233,168,.35)"; ctx.fillRect(bx + bw * Math.min(1, G.banked / q), y0 + 22, Math.max(0, Math.min(bw * (1 - G.banked / q), bw * carryK * mult() / q)), 9); }
  text(mult() > 1 ? `🔨 ban bonus x${mult().toFixed(2)}` : "🔨 ban roasts (B) for a bonus", bx, y0 + 40, 9, "#ff9a9a", "left", "normal", false);
  // gas
  const gx = 375, gw = 150, hot = p.gas > 80;
  text("GAS", gx, y0 + 12, 10, "#9dff6a", "left", "bold", false);
  ctx.fillStyle = "#1c2416"; ctx.fillRect(gx, y0 + 22, gw, 9);
  ctx.fillStyle = p.gas > 80 ? (Math.sin(G.t * 20) > 0 ? "#ff5a3a" : "#ffb03a") : p.gas > 30 ? "#a6e33a" : "#5f9a3a";
  ctx.fillRect(gx, y0 + 22, gw * p.gas / 100, 9);
  ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fillRect(gx + gw * 0.3, y0 + 21, 1, 11);
  text(hot ? "ABOUT TO BLOW" : p.gas >= 30 ? "SPACE ready" : "F leak · SPACE at 30+", gx, y0 + 40, 9, hot ? "#ff7a5a" : "#bde59a", "left", "normal", false);
  // carry
  const cx = 540;
  const wt = weight();
  text(`CARRYING ${wt ? `· weight ${wt}` : ""}`, cx, y0 + 12, 10, wt >= 8 ? "#ff9a5a" : "#ddd", "left", "bold", false);
  ctx.font = `12px ${EMO}`; ctx.textAlign = "left";
  p.carry.slice(-9).forEach((id, i) => ctx.fillText(FOOD[id].e, cx + i * 15, y0 + 30));
  if (!p.carry.length) text("nothing (yet)", cx, y0 + 29, 9, "#777", "left", "normal", false);
  text(`${G.phone ? "🔦 light ON" : "🌑 light OFF"}  (L)`, cx, y0 + 43, 9, G.phone ? "#ffe9a8" : "#8aa", "left", "normal", false);
}
function card(title, lines, foot, col = "#ffe9a8") {
  ctx.fillStyle = "rgba(4,3,10,.82)"; ctx.fillRect(0, 0, VW, VH);
  const h = 120 + lines.length * 20;
  ctx.fillStyle = "#15101e"; ctx.strokeStyle = "#4b3a66"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(VW / 2 - 250, VH / 2 - h / 2, 500, h, 10); ctx.fill(); ctx.stroke();
  text(title, VW / 2, VH / 2 - h / 2 + 34, 26, col, "center", "900");
  lines.forEach((l, i) => text(l, VW / 2, VH / 2 - h / 2 + 72 + i * 20, 13, "#e8e2f4", "center", "normal", false));
  if (G.modeT > 0.6) text(foot, VW / 2, VH / 2 + h / 2 - 22, 12, "#9d8cc9", "center", "bold", false);
}
function drawTitle() {
  const t = G.t;
  ctx.fillStyle = "#06050a"; ctx.fillRect(0, 0, VW, VH);
  // fridge light spilling across a dark kitchen floor
  const g = ctx.createRadialGradient(560, 300, 10, 560, 300, 360);
  g.addColorStop(0, "rgba(255,240,190,.55)"); g.addColorStop(0.5, "rgba(255,220,150,.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  for (let x = 0; x < VW; x += 32) for (let y = 330; y < VH; y += 32) { ctx.fillStyle = ((x + y) / 32) % 2 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.2)"; ctx.fillRect(x, y, 32, 32); }
  ctx.fillStyle = "#cfd5da"; ctx.fillRect(520, 150, 90, 190); ctx.fillStyle = "#fff6d8"; ctx.fillRect(528, 158, 74, 174);
  for (let k = 0; k < 4; k++) { ctx.fillStyle = "#c8c2a8"; ctx.fillRect(528, 196 + k * 36, 74, 3); }
  ctx.font = `22px ${EMO}`; ctx.textAlign = "center"; ["🍕", "🍗", "🥛", "🍰", "🧈", "🍝"].forEach((e, i) => ctx.fillText(e, 545 + (i % 3) * 20, 186 + Math.floor(i / 3) * 36));
  ctx.fillStyle = "#aab2b8"; ctx.fillRect(470, 150, 50, 190);
  ctx.save(); ctx.translate(470, 345); ctx.scale(4, 4);
  drawCase(ctx, 0, 0, { face: { x: 1, y: 0.2 }, walk: 0, t, moving: false, sneak: true, carry: [] });
  ctx.restore();
  // it's in the doorway behind you
  ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 0.8);
  ctx.translate(120, 330); ctx.scale(3.2, 3.2); drawMonster(ctx, 0, 0, { t, face: { x: 1, y: 1 }, state: "patrol", stun: 0, moving: false, walk: 0 });
  ctx.restore();
  const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.9); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.85)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, VW, VH);
  ctx.save(); ctx.translate(VW / 2, 74); ctx.rotate(Math.sin(t * 1.3) * 0.015);
  text("MIDNIGHT SNACK", 0, 0, 56, "#ffe36e", "center", "900");
  ctx.restore();
  text("a CaseOh stealth-horror fridge raid", VW / 2, 118, 15, "#e8dcff", "center", "bold");
  text("It's 3 AM. You're starving. The Portion Controller is in the house.", VW / 2, 142, 12, "#b9a9d9", "center", "normal");
  const blink = Math.sin(t * 4) > -0.3;
  if (blink) text("CLICK or press ENTER", VW / 2, 420, 18, "#fff", "center", "900");
  if (best.night > 0) text(`Nights cleared: ${best.night}/5 · best night ${fmt(best.kcal)} kcal · press 1-${Math.min(5, best.night + 1)} to pick a night`, VW / 2, 446, 11, "#9dff9d", "center", "normal");
  text("WASD move · SHIFT sneak · E grab/hide · Q eat · hold F leak · SPACE big one · L light · B ban · ESC pause", VW / 2, 474, 11, "#cfc4e8", "center", "normal", false);
  text("Fan-made for CaseOh. Not affiliated with or endorsed by him. Turn your sound ON.", VW / 2, 504, 10, "#6e6488", "center", "normal", false);
}
function drawScare() {
  const t = G.modeT;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, VW, VH);
  const s = 0.55 + Math.min(1, t * 6) * 0.9 + t * 0.15;
  const jx = (Math.random() - 0.5) * 30 * (1.5 - t), jy = (Math.random() - 0.5) * 30 * (1.5 - t);
  if (Math.random() > 0.08) drawFace(ctx, VW / 2 + jx, VH / 2 + 40 + jy, s, G.t, 0.85 + 0.15 * Math.sin(t * 50));
  ctx.fillStyle = `rgba(180,0,0,${0.25 + 0.2 * Math.sin(t * 30)})`; ctx.fillRect(0, 0, VW, VH);
  if (t > 0.5) text("PORTION CONTROLLED", VW / 2, 60, 40, "#fff", "center", "900");
}
function render() {
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (G.mode === "title") { drawTitle(); return; }
  if (G.mode === "scare") { drawScare(); return; }
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * G.shake, (Math.random() - 0.5) * 10 * G.shake);
  if (G.mode === "play" || G.mode === "pause" || G.mode === "caughtCard" || G.mode === "end" || G.mode === "intro" || G.mode === "fail") computeLight();
  drawWorld();
  ctx.restore();
  drawHUD();
  const n = NIGHTS[G.night - 1], go = "press ENTER";
  if (G.mode === "intro") card(`NIGHT ${G.night}`, [`Stash ${fmt(n.quota)} kcal in your room before 6:00 AM.`, n.line, "Daily recommended intake: 2,000 kcal. Lol."], `${go} to sneak out of bed`);
  else if (G.mode === "pause") card("PAUSED", ["The fridge will wait. It always waits."], "ESC to resume · Q to quit to title");
  else if (G.mode === "caughtCard") card("CAUGHT", [`The Portion Controller took ${fmt(G.lostKcal)} kcal off you.`, `${G.lives} cheat day${G.lives === 1 ? "" : "s"} left.`, "Back to bed. Try again."], `${go} to respawn`, "#ff6a6a");
  else if (G.mode === "fail") card("NO CHEAT DAYS LEFT", ["It put you on a diet. Salad. Forever.", `You stashed ${fmt(G.banked)} kcal before it ended.`], `${go} to retry night ${G.night}`, "#ff6a6a");
  else if (G.mode === "end") {
    const s = G.stats;
    card(G.won ? "6:00 AM · NIGHT CLEARED" : "6:00 AM · QUOTA MISSED", [
      `Stashed ${fmt(G.banked)} / ${fmt(n.quota)} kcal`,
      `Snacks grabbed ${s.items} · eaten on the spot ${s.eaten}`,
      `Farts: ${s.small} leaks, ${s.big} big ones · creaky boards ${s.creaks}`,
      `Jump scares survived ${s.scares} · times caught ${s.caught} · chatters banned ${s.bans}`,
    ], G.won ? (G.night >= 5 ? `${go}` : `${go} for night ${G.night + 1}`) : `${go} to retry`, G.won ? "#7dff9b" : "#ff9a5a");
  } else if (G.mode === "victory") card("CASE IS FULL", ["Five nights. Every fridge in the house is empty.", `Total stashed: ${fmt(G.total)} kcal.`, "The Portion Controller has resigned.", "...for now. (it's in the garage again)"], "press ENTER for the title", "#ffe36e");
}

let last = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  const steps = G.speed > 1 ? Math.round(G.speed) : 1;
  for (let i = 0; i < steps; i++) update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// headless test hooks
window.__ms = {
  get G() { return G; },
  state: () => ({ mode: G.mode, night: G.night, banked: G.banked, lives: G.lives, gas: G.p?.gas, carry: G.p?.carry.slice(), p: G.p && [G.p.x, G.p.y], m: G.m && { x: G.m.x, y: G.m.y, state: G.m.state, stun: G.m.stun }, clock: G.clock, stats: G.stats }),
  start: n => { startNight(n); G.mode = "play"; },
  tp: (x, y) => { G.p.x = x; G.p.y = y; },
  give: id => G.p.carry.push(id),
  gas: v => { G.p.gas = v; },
  monTo: (x, y, state = "patrol") => Object.assign(G.m, { x, y, state, path: null, pause: 0 }),
  press: k => dispatchEvent(new KeyboardEvent("keydown", { key: k })),
  release: k => dispatchEvent(new KeyboardEvent("keyup", { key: k })),
  skip: s => { G.clock += s; },
  fast: k => { G.speed = k; },
  step: (sec, hold = []) => { hold.forEach(k => keys.add(k)); for (let i = 0; i < sec * 60; i++) update(1 / 60); hold.forEach(k => keys.delete(k)); return window.__ms.state(); },
  caught,
};
