// Reviewbomb the Slop: log into a stranger's Vapor account, read a store page,
// pick what to say, watch the engagement roll in, swap to the next account.

import * as G from "./gen.js";
import * as A from "./art.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const wait = (ms) => new Promise((res) => setTimeout(res, hooks.fast ? 0 : ms));

const stage = $("#stage"), roomCv = $("#room"), screen = $("#screen"), card = $("#card"), fade = $("#fade");
roomCv.width = A.ROOM_W; roomCv.height = A.ROOM_H;
const rctx = roomCv.getContext("2d");
const hooks = { fast: false };

// ---------------------------------------------------------------- sound

const Snd = {
  on: localStorage.getItem("rb-mute") !== "1", ctx: null,
  wake() { if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } this.ctx?.resume?.(); },
  tone(f, d = 0.06, type = "square", vol = 0.04, slide = 0, delay = 0) {
    if (!this.on || !this.ctx || hooks.fast) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.02);
  },
  key() { this.tone(900 + Math.random() * 500, 0.018, "square", 0.018); },
  click() { this.tone(520, 0.05, "square", 0.04, 200); },
  post() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.06, 0, i * 0.07)); },
  tick() { this.tone(1400 + Math.random() * 300, 0.02, "triangle", 0.025); },
  award() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, "square", 0.035, 0, i * 0.06)); },
  bad() { this.tone(300, 0.35, "sawtooth", 0.05, -200); },
  swap() { this.tone(200, 0.25, "triangle", 0.05, 400); },
};
const muteBtn = $("#mute");
const syncMute = () => { muteBtn.textContent = Snd.on ? "♪ Sound on" : "♪ Sound off"; muteBtn.setAttribute("aria-pressed", String(!Snd.on)); };
muteBtn.addEventListener("click", () => { Snd.on = !Snd.on; localStorage.setItem("rb-mute", Snd.on ? "0" : "1"); Snd.wake(); syncMute(); });
syncMute();
addEventListener("pointerdown", () => Snd.wake(), { once: true });
addEventListener("keydown", () => Snd.wake(), { once: true });

// ---------------------------------------------------------------- layout + room animation

function layout() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const s = Math.min(W / A.ROOM_W, H / A.ROOM_H);
  const cw = A.ROOM_W * s, ch = A.ROOM_H * s, ox = (W - cw) / 2, oy = (H - ch) / 2;
  Object.assign(roomCv.style, { left: ox + "px", top: oy + "px", width: cw + "px", height: ch + "px" });
  let sx = ox + A.SCREEN.x * s, sy = oy + A.SCREEN.y * s, sw = A.SCREEN.w * s, sh = A.SCREEN.h * s;
  const compact = sw < 720 || sh < 380;
  if (compact) { sx = 6; sy = 6; sw = W - 12; sh = H - 12; }
  stage.classList.toggle("compact", compact);
  screen.style.setProperty("--sh", sh + "px");
  Object.assign(screen.style, { left: sx + "px", top: sy + "px", width: sw + "px", height: sh + "px", fontSize: (compact ? 13 : Math.max(11.5, Math.min(15.5, sw / 72))) + "px" });
}
addEventListener("resize", layout);

let room = null, lastFrame = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!room || t - lastFrame < 66) return;
  lastFrame = t;
  rctx.drawImage(room.canvas, 0, 0);
  for (const a of room.anim) a(rctx, t);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- state

let run = null, cur = null;
const avatarCache = new Map();
function avatar(seed, key) {
  const k = seed + key;
  if (!avatarCache.has(k)) avatarCache.set(k, A.renderAvatar(seed, key).toDataURL());
  return avatarCache.get(k);
}
const capCache = new Map();
function capsule(g) {
  const k = g.id + ":" + g.cats.join(",");
  if (!capCache.has(k)) capCache.set(k, A.renderCapsule(g));
  return capCache.get(k);
}
function copyCanvas(src, cls) {
  const c = A.canvas(src.width, src.height); c.getContext("2d").drawImage(src, 0, 0);
  if (cls) c.className = cls;
  return c;
}

function best() { return +localStorage.getItem("rb-best") || 0; }

function newRun(seed = (Math.random() * 1e9) | 0) {
  const r = G.makeRng(seed);
  run = { seed, r, pool: G.makePool(r.int(1e9)), shift: 0, total: 0, log: [], lastGame: -1, lastPersona: null };
  capCache.clear();
  return run;
}

// ---------------------------------------------------------------- top bar

function topbar(active = "STORE") {
  const rv = cur?.reviewer;
  const user = rv ? `<span class="vp-shift">${run.shift}/${G.SHIFTS}</span><span class="vp-score">${fmt(run.total)} pts</span><img src="${avatar(rv.avatarSeed, rv.persona.key)}" alt=""><b>${esc(rv.handle)}</b>` : `<span>not signed in</span>`;
  return `<div class="vp-top"><span class="vp-logo"><i>☁</i>VAPOR</span>
    <span class="vp-nav">${["STORE", "LIBRARY", "COMMUNITY"].map((n) => n === active ? `<b>${n}</b>` : `<span>${n}</span>`).join("")}</span>
    <span class="vp-user">${user}</span></div>`;
}
function setScreen(html, active) {
  screen.innerHTML = topbar(active) + `<div class="vp-body">${html}</div>`;
}

// ---------------------------------------------------------------- login

function logo() {
  const c = A.canvas(132, 34), x = c.getContext("2d");
  const bands = (y0, str, s, cols) => {
    const w = A.textWidth(str, s), xx = Math.round((132 - w) / 2);
    A.text(x, str, xx + 1, y0 + 1, "#000", s);
    A.text(x, str, xx, y0, cols[0], s);
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = cols[1]; x.fillRect(0, y0 + 3 * s, 132, 2 * s);
    x.globalCompositeOperation = "source-over";
  };
  bands(1, "REVIEWBOMB", 3, ["#ffd43b", "#ff7a3b"]);
  bands(19, "THE SLOP", 2, ["#6fe3c1", "#2fa58c"]);
  // little bomb
  x.fillStyle = "#222"; x.fillRect(8, 22, 8, 8); x.fillRect(9, 21, 6, 10); x.fillRect(7, 23, 10, 6);
  x.fillStyle = "#555"; x.fillRect(10, 23, 2, 2); x.fillStyle = "#c9a26a"; x.fillRect(14, 18, 1, 4); x.fillRect(15, 17, 2, 1);
  x.fillStyle = "#ffd43b"; x.fillRect(17, 16, 1, 1);
  x.fillStyle = "#222"; x.fillRect(116, 22, 8, 8); x.fillRect(117, 21, 6, 10); x.fillRect(115, 23, 10, 6);
  x.fillStyle = "#555"; x.fillRect(118, 23, 2, 2); x.fillStyle = "#c9a26a"; x.fillRect(122, 18, 1, 4); x.fillRect(123, 17, 2, 1);
  c.className = "logo";
  return c;
}

function showLogin() {
  cur = null;
  if (!run) newRun();
  room = A.makeRoom(run.r.int(1e9), "rage", run.pool.map(capsule));
  setScreen(`<div class="vp-center">
    <div id="logo-slot"></div>
    <p>You have the passwords to eight Vapor accounts belonging to eight very online people. Every account gets one game that disclosed AI use. Log in, read the store page, and post the review that gets the most engagement.</p>
    <ol class="rules">
      <li><b>Read the AI disclosure.</b> It ranges from two autocompleted lines of code to fully generated slopware.</li>
      <li><b>Match the heat to the slop.</b> Fair, specific reviews go viral. Going nuclear on two lines of autocomplete gets you ratio'd. Going easy on slopware gets you called a shill.</li>
      <li><b>Blame the right part.</b> The credits name the humans. Blame the composer's music on AI and you get community noted.</li>
      <li><b>Post fast.</b> Early reviews get seen: the hype window boosts engagement for 30 seconds.</li>
      <li><b>Play to the account.</b> Each reviewer has a specialty that earns 40% more when they're right about it.</li>
    </ol>
    <button class="vp-btn" id="go" data-primary>Log in to account 1</button>
    <div class="best">Pick a review with <kbd>1</kbd>–<kbd>4</kbd> or click. ${best() ? `Best session: ${fmt(best())} pts.` : ""}</div>
  </div>`, "STORE");
  $("#logo-slot").replaceWith(logo());
  $("#go").addEventListener("click", () => { Snd.click(); nextShift(); });
  $("#go").focus();
}

// ---------------------------------------------------------------- account swap

async function nextShift() {
  if (run.shift >= G.SHIFTS) return showSummary();
  Snd.swap();
  fade.classList.add("on");
  await wait(380);
  run.shift++;
  const reviewer = G.makeReviewer(run.r.int(1e9), run.lastPersona);
  run.lastPersona = reviewer.persona.key;
  const game = G.nextGame(run.pool, run.lastGame, run.r);
  run.lastGame = game.id;
  cur = { reviewer, game, options: G.makeOptions(game, run.pool, run.r.int(1e9)), phase: "card", shot: 1 };
  room = A.makeRoom(reviewer.roomSeed, reviewer.persona.prop, run.pool.filter((g) => g !== game).map(capsule));
  setScreen(`<div class="vp-center"><p style="margin-top:30%">Signing in…</p></div>`, "STORE");
  showCard();
  fade.classList.remove("on");
}

function showCard() {
  const { reviewer: rv, game } = cur;
  const p = rv.persona;
  const spec = p.spec.includes("all") ? "going hard on anything that deserves it" : p.spec.map((c) => G.CAT_LABEL[c]).join(" and ");
  card.innerHTML = `<div class="shiftno">ACCOUNT ${run.shift} OF ${G.SHIFTS}</div>
    <div class="row"><span id="card-av"></span><div>
      <h2>${esc(rv.handle)}</h2>
      <div class="persona">${esc(p.title)} · Level ${rv.level} · ${fmt(rv.reviews)} reviews</div>
      <p>${esc(p.blurb)}</p>
      <div class="spec">Specialty: ${esc(spec)} (+40% engagement when right)</div>
    </div></div>
    <div class="lib" id="card-lib"></div>
    <div class="go"><span>Today's game is highlighted. <kbd>Enter</kbd></span><button class="vp-btn" id="card-go" data-primary>Open store page</button></div>`;
  const av = A.renderAvatar(rv.avatarSeed, p.key); $("#card-av").replaceWith(av);
  const lib = $("#card-lib");
  for (const g of run.pool) {
    const d = document.createElement("div");
    d.className = g === game ? "on" : "";
    d.append(copyCanvas(capsule(g)));
    d.append(document.createTextNode(`${g.title}${g.myReviews.length ? ` · ${g.myReviews.length} of your reviews` : ""}`));
    lib.append(d);
  }
  card.hidden = false;
  cur.phase = "card";
  $("#card-go").addEventListener("click", openStore);
  $("#card-go").focus();
}

// ---------------------------------------------------------------- store page

function reviewSummary(g, delta) {
  const label = G.ratingLabel(g.reviewsPos, g.reviewsTotal);
  const d = delta ? `<span class="delta">(+${fmt(delta)} since your review)</span>` : "";
  return `<span class="${G.ratingClass(label)}">${label}</span> <span style="color:var(--vp-dim)">(${fmt(g.reviewsTotal)})</span>${d}`;
}

function openStore() {
  Snd.click();
  card.hidden = true;
  const { game: g } = cur;
  const desc = G.description(g);
  const disc = G.disclosure(g);
  const nAI = g.cats.length;
  const past = g.myReviews.slice().reverse();
  setScreen(`<div class="vp-page">
    <div class="vp-head"><div class="vp-crumbs">All Games › ${esc(G.GENRES[g.genre].tags[0])} Games › ${esc(g.title)}</div><h1 class="vp-title">${esc(g.title)}</h1></div>
    <div class="vp-col" id="left">
      <div class="vp-media" id="media"></div>
      <div class="vp-thumbs" id="thumbs"></div>
      <p class="vp-short">${esc(desc[0])}</p>
      <section class="vp-sec vp-ai"><h3>AI GENERATED CONTENT DISCLOSURE</h3>
        <p class="sub">The developers describe how their game uses AI generated content like this:</p>
        ${disc.map((t) => `<p class="${/^UPDATE/.test(t) ? "upd" : ""}">${esc(t)}</p>`).join("")}
      </section>
      <section class="vp-sec"><h3>ABOUT THIS GAME</h3>${desc.slice(1).map((t) => `<p>${esc(t)}</p>`).join("")}
        <dl class="vp-credits">${G.credits(g).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      </section>
      ${past.length ? `<section class="past"><h3>YOUR OTHER ACCOUNTS ALREADY REVIEWED THIS</h3>${past.map(miniReview).join("")}</section>` : ""}
    </div>
    <div class="vp-col" id="right">
      <dl class="vp-info">
        <dt>ALL REVIEWS</dt><dd id="rating">${reviewSummary(g)}</dd>
        <dt>RELEASE DATE</dt><dd>${esc(g.date)}</dd>
        <dt>DEVELOPER</dt><dd>${esc(g.dev)}</dd>
        <dt>PRICE</dt><dd>${esc(g.price)}</dd>
      </dl>
      <div class="vp-tags">${g.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
      <div class="vp-compose" id="compose">
        <h3>WRITE A REVIEW FOR ${esc(g.title.toUpperCase())}</h3>
        <p class="hint">Posting as ${esc(cur.reviewer.handle)}. ${nAI ? "" : "This game has no AI content left."}</p>
        <div class="hype"><span>HYPE WINDOW</span><span class="bar"><i id="hype"></i></span><b id="hype-x">×1.50</b></div>
        <div class="opts" id="opts">${cur.options.map((o, i) => `<button class="opt" type="button" data-i="${i}">
          <span class="num">${i + 1}</span><span class="rec ${o.rec ? "up" : "down"}">${o.rec ? "▲ RECOMMENDED" : "▼ NOT RECOMMENDED"}</span>
          <span class="txt">${esc(o.text)}</span></button>`).join("")}</div>
      </div>
    </div>
  </div>`, "STORE");

  // media
  const shots = [capsule(g), A.renderShot(g, 0), A.renderShot(g, 1), A.renderShot(g, 2)];
  const media = $("#media"), thumbs = $("#thumbs");
  const show = (i) => {
    cur.shot = i;
    media.replaceChildren(copyCanvas(shots[i]));
    [...thumbs.children].forEach((b, j) => b.classList.toggle("on", j === i));
  };
  shots.forEach((s, i) => {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", i ? `Screenshot ${i}` : "Capsule art");
    b.append(copyCanvas(s)); b.addEventListener("click", () => show(i)); thumbs.append(b);
  });
  show(1);
  cur.shotTimer = setInterval(() => { if (cur.phase === "store") show((cur.shot + 1) % shots.length); }, 4500);

  $("#opts").addEventListener("click", (e) => { const b = e.target.closest(".opt"); if (b) choose(+b.dataset.i); });
  cur.phase = "store";
  cur.t0 = performance.now();
  tickHype();
}

function miniReview(rv) {
  return `<div class="review mini"><div class="who"><img class="avatar" src="${avatar(rv.avatarSeed, rv.persona)}" alt=""><b>${esc(rv.handle)}</b><span>account ${rv.shift + 1}</span></div>
    <div class="badge ${rv.rec ? "up" : "down"}">${rv.rec ? "▲ Recommended" : "▼ Not Recommended"}</div>
    <div class="body">${esc(rv.text)}</div>
    <div class="votes"><span><b>${fmt(rv.helpful)}</b> found this helpful</span><span><b>${fmt(rv.funny)}</b> found this funny</span></div></div>`;
}

function elapsed() { return ((cur.tChosen ?? performance.now()) - cur.t0) / 1000; }
function tickHype() {
  if (!cur || cur.phase !== "store") return;
  const t = elapsed(), m = G.speedMult(t);
  const bar = $("#hype"), x = $("#hype-x");
  if (bar) { bar.style.width = Math.max(0, 100 * (1 - t / G.HYPE_SECONDS)) + "%"; x.textContent = "×" + m.toFixed(2); }
  requestAnimationFrame(tickHype);
}

// ---------------------------------------------------------------- posting

async function choose(i, seconds) {
  if (!cur || cur.phase !== "store") return;
  const opt = cur.options[i];
  if (!opt) return;
  cur.phase = "posting";
  cur.tChosen = performance.now();
  const secs = seconds ?? elapsed();
  clearInterval(cur.shotTimer);
  Snd.click();
  const { game: g, reviewer: rv } = cur;
  const res = G.judge(opt, g, rv, secs, run.r.int(1e9));
  cur.choice = i; cur.res = res;

  [...document.querySelectorAll(".opt")].forEach((b, j) => { b.disabled = true; b.classList.toggle("picked", j === i); });
  const compose = $("#compose");
  await wait(250);
  compose.innerHTML = `<h3>WRITE A REVIEW FOR ${esc(g.title.toUpperCase())}</h3>
    <div class="badge-pick ${opt.rec ? "pos" : "neg"}" style="font-weight:800;font-size:.85em;margin:.2em 0 .4em">${opt.rec ? "▲ Recommended" : "▼ Not Recommended"}</div>
    <div class="typing" id="typing"></div>
    <div class="post-row"><span>${fmt(secs)}s · hype ×${res.speed.toFixed(2)}</span><button class="vp-btn" id="postbtn" type="button" disabled>Post review</button></div>`;
  const ty = $("#typing");
  if (hooks.fast) ty.textContent = opt.text;
  else {
    const step = Math.max(1, Math.round(opt.text.length / 70));
    for (let k = 0; k < opt.text.length; k += step) { ty.textContent = opt.text.slice(0, k + step); if (k % (step * 2) === 0) Snd.key(); await wait(14); }
  }
  ty.classList.add("done");
  const pb = $("#postbtn"); pb.classList.add("press"); await wait(220); pb.classList.remove("press");
  Snd.post();

  // the review lands
  const before = { total: g.reviewsTotal };
  cur.levelAtPost = g.level; cur.levelName = G.levelInfo(g).name;
  const applied = G.applyReview(g, opt, res, rv, run.shift - 1);
  run.total += res.points;
  run.log.push({ handle: rv.handle, avatarSeed: rv.avatarSeed, persona: rv.persona.key, title: g.title, gameId: g.id, verdict: res.verdict, points: res.points, rec: opt.rec, patch: applied.patch });
  await showResult(opt, res, applied, before);
}

const STAMP = { "ON THE MONEY": "good", "CLOSE ENOUGH": "ok", "MEH": "ok" };

async function showResult(opt, res, applied, before) {
  const { game: g, reviewer: rv } = cur;
  cur.phase = "result";
  const hrs = (G.makeRng(rv.seed)() * (opt.kind === "generic" && opt.intensity >= 4 ? 0.3 : 140) + 0.1).toFixed(1);
  const segs = (n, on, col) => `<span class="seg" style="--c:${col}">${Array.from({ length: n }, (_, i) => `<i class="${i <= on ? "on" : ""}"></i>`).join("")}</span>`;
  const targetOk = res.acc >= 1, target = opt.cat ? G.CAT_LABEL[opt.cat] : opt.kind === "confused" ? "enemy AI" : opt.kind === "offgame" ? "another game" : "AI in general";
  const cmp = $("#compose");
  requestAnimationFrame(() => { const rc = $("#right"); rc && rc.scrollTo({ top: cmp.offsetTop - rc.offsetTop - 4, behavior: "smooth" }); });
  cmp.innerHTML = `
    <div class="verdict"><span class="stamp ${STAMP[res.verdict] || "bad"}">${res.verdict}</span><span class="pts ${res.points < 0 ? "neg" : ""}" id="v-pts">+0</span></div>
    <p class="why">${esc(res.why)}</p>
    <dl class="meters">
      <dt>AI use</dt><dd>${segs(5, cur.levelAtPost, "#a98bff")}<span>${esc(cur.levelName)}</span></dd>
      <dt>Your heat</dt><dd>${segs(5, opt.intensity, opt.intensity > 2 ? "#ff7a6b" : "#74c7ff")}<span>${["defending it", "mild", "measured", "furious", "nuclear"][opt.intensity]}</span></dd>
      <dt>You blamed</dt><dd>${esc(target)} <b style="color:${targetOk ? "#6fe3a0" : "#ff7a6b"}">${targetOk ? "✓ disclosed" : opt.cat === null && opt.kind === "generic" ? "~ vague" : "✗ wrong"}</b></dd>
    </dl>
    <p class="mult">Hype <b>×${res.speed.toFixed(2)}</b>${res.specMult > 1 ? ` · ${esc(rv.persona.title)} specialty <b>×1.4</b>` : ""} · audience <b>×${g.pop.toFixed(2)}</b></p>
    ${applied.patch ? `<div class="patchnote">📦 ${esc(g.dev)} pushed a patch overnight: the AI ${esc(G.CAT_LABEL[applied.patch])} is gone. The next account to review this game will see the update.</div>` : ""}
    <div class="review" id="myrev">
      <div class="who"><img class="avatar" src="${avatar(rv.avatarSeed, rv.persona.key)}" alt=""><b>${esc(rv.handle)}</b><span>${fmt(rv.reviews + 1)} products reviewed</span></div>
      <div class="badge ${opt.rec ? "up" : "down"}">${opt.rec ? "▲ Recommended" : "▼ Not Recommended"}<small>${hrs} hrs on record · posted just now</small></div>
      <div class="body">${esc(opt.text)}</div>
      <div class="votes"><span><b id="v-help">0</b> found this helpful</span><span><b id="v-funny">0</b> found this funny</span><span><b id="v-not">0</b> not helpful</span></div>
      <div class="awards" id="v-awards"></div>
      <ul class="replies" id="v-replies"></ul>
    </div>
    <div class="next-row"><small><kbd>Enter</kbd></small><button class="vp-btn" id="next" type="button" disabled>${run.shift >= G.SHIFTS ? "See session summary" : "Log out, next account →"}</button></div>`;

  // engagement counters climb
  const dur = hooks.fast ? 0 : 1500, t0 = performance.now();
  const els = { h: $("#v-help"), f: $("#v-funny"), n: $("#v-not"), p: $("#v-pts") };
  await new Promise((done) => {
    const step = () => {
      const k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      els.h.textContent = fmt(res.helpful * e); els.f.textContent = fmt(res.funny * e); els.n.textContent = fmt(res.notHelpful * e);
      const p = Math.round(res.points * e); els.p.textContent = (p >= 0 ? "+" : "") + fmt(p);
      if (k < 1) { if (Math.random() < 0.4) Snd.tick(); requestAnimationFrame(step); } else done();
    };
    step();
  });
  $("#rating").innerHTML = reviewSummary(g, g.reviewsTotal - before.total);
  if (res.awards) { $("#v-awards").textContent = "🏆".repeat(Math.min(6, res.awards)) + ` ${res.awards} award${res.awards > 1 ? "s" : ""}`; Snd.award(); }
  else if (res.points < 0) Snd.bad();
  toast((res.points >= 0 ? "+" : "") + fmt(res.points), res.points < 0);
  const ul = $("#v-replies");
  for (const rep of res.replies) {
    await wait(420);
    const li = document.createElement("li");
    if (/^📝/.test(rep)) li.className = "note";
    if (/^DEV RESPONSE/.test(rep)) li.className = "dev";
    li.textContent = rep;
    ul.append(li); Snd.tick();
    li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  const nb = $("#next"); nb.disabled = false; nb.focus();
  nb.addEventListener("click", () => { Snd.click(); nextShift(); });
  screen.querySelector(".vp-user .vp-score").textContent = fmt(run.total) + " pts";
  cur.phase = "done";
}

function toast(txt, neg) {
  const t = document.createElement("div");
  t.className = "toast" + (neg ? " neg" : "");
  t.textContent = txt; t.style.top = "3.2em";
  screen.append(t); setTimeout(() => t.remove(), 1500);
}

// ---------------------------------------------------------------- summary

function showSummary() {
  cur = null;
  card.hidden = true;
  const total = run.total;
  const prev = best();
  if (total > prev) localStorage.setItem("rb-best", String(total));
  const rank = G.rankFor(total);
  room = A.makeRoom(run.r.int(1e9), "rage", run.pool.map(capsule));
  setScreen(`<div class="vp-center">
    <div style="color:var(--vp-violet);font:700 .8em var(--mono);letter-spacing:.2em">SESSION OVER · ${G.SHIFTS} ACCOUNTS</div>
    <div class="big-rank">${esc(rank)}</div>
    <p><b class="vp-score" style="font-size:1.3em">${fmt(total)}</b> engagement points${total > prev ? " · new best" : prev ? ` · best ${fmt(prev)}` : ""}</p>
    <table class="sum"><thead><tr><th>Account</th><th>Game</th><th>Verdict</th><th class="n">Points</th></tr></thead><tbody>
      ${run.log.map((l) => `<tr><td><img class="avatar" src="${avatar(l.avatarSeed, l.persona)}" alt="">${esc(l.handle)}</td><td>${esc(l.title)}</td><td>${esc(l.verdict)}${l.patch ? " · patched" : ""}</td><td class="n">${fmt(l.points)}</td></tr>`).join("")}
    </tbody></table>
    <div class="gamesum" id="gamesum"></div>
    <button class="vp-btn" id="again" data-primary>New session</button>
  </div>`, "COMMUNITY");
  const gs = $("#gamesum");
  for (const g of run.pool) {
    const d = document.createElement("div");
    d.append(copyCanvas(capsule(g)));
    const label = G.ratingLabel(g.reviewsPos, g.reviewsTotal);
    d.insertAdjacentHTML("beforeend", `<b>${esc(g.title)}</b><br>Started as: ${esc(g.startName)}<br><span class="${G.ratingClass(label)}">${label}</span> (${fmt(g.reviewsTotal)})${g.patched.length ? `<br>Patched out: ${g.patched.map((c) => G.CAT_LABEL[c]).join(", ")}` : ""}`);
    gs.append(d);
  }
  $("#again").addEventListener("click", () => { Snd.click(); newRun(); startRun(); });
  $("#again").focus();
}

// ---------------------------------------------------------------- input

addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (cur?.phase === "store" && /^[1-4]$/.test(e.key)) { e.preventDefault(); choose(+e.key - 1); return; }
  if (e.key === "Enter" && !card.hidden && cur?.phase === "card") { e.preventDefault(); openStore(); }
  else if (e.key === "Enter" && cur?.phase === "done" && document.activeElement?.id !== "next") { e.preventDefault(); $("#next")?.click(); }
});

// ---------------------------------------------------------------- boot

function startRun() {
  for (const g of run.pool) g.startName = G.levelInfo(g).name;
  showLogin();
}

layout();
newRun();
startRun();

// headless hooks
Object.defineProperties(hooks, { run: { get: () => run }, cur: { get: () => cur } });
Object.assign(hooks, {
  G, A,
  newRun: (seed) => { newRun(seed); startRun(); },
  start: () => nextShift(), open: () => openStore(), choose: (i, s) => choose(i, s),
  next: () => nextShift(),
  best: () => cur?.options.map((o) => G.judge(o, cur.game, cur.reviewer, 5, 1).points),
});
window.__rb = hooks;
