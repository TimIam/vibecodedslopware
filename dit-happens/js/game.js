import {
  MORSE, KOCH, PASS_MARK, KeyDecoder, accuracy, allowance, clamp, groupLength, keyedAt, nudge, pickChar, speak, timeline,
} from "./morse.js";
import { Sound } from "./audio.js";
import { Scene, SHIP_KINDS } from "./scene.js";

const $ = id => document.getElementById(id);
const SAVE_KEY = "dit-happens-v1";

const SHIP_NAMES = [
  "SS Second Mortgage", "MV Sorry Margaret", "HMS Probably", "The Lady Overdraft", "SS Reply All",
  "MV Per My Last Email", "FV Cod Almighty", "SS Regrettable", "The Wet Blanket", "FV Shore Thing",
  "MV Unsinkable II", "RMS Adequate", "FV Reel Trouble", "The Pier Pressure", "MV Seas the Day",
  "RMS Mid-Budget", "SS Single A", "The Knot Working", "FV Fishful Thinking", "HMS Apology",
  "SS Yacht Again", "MV Tax Deductible", "FV Bass Instinct", "The Bilge Rat's Pension", "SS Good Enough",
  "MV Ask Your Mother", "RMS Limited Liability", "FV Salty Dave", "The Mild Concern", "SS Quarterly Loss",
];
const KIND_POOL = ["trawler", "trawler", "steamer", "steamer", "ketch", "ketch", "tug", "tug", "liner"];

const BRIEF_LINES = [
  "Weather's turning. Ships will signal from the dark. Tell me what they say and they live.",
  "The last signalman left to pursue a career in anything else. You'll do fine.",
  "Copy what you hear. If you start counting dits, you've already hit the rocks.",
  "Don't look at the lamp, listen to it. I know that doesn't make sense. Do it anyway.",
  "The board has approved one (1) lighthouse and asks that you be careful with it.",
];

const DEFAULT = () => ({
  night: 1, unlocked: 2, introduced: 0, best: 0, stats: {},
  settings: { wpm: 18, fwpm: 10, hz: 620, vol: 0.6, signal: "both", seas: "normal", keying: true, sea: true },
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) { const d = DEFAULT(); return { ...d, ...s, settings: { ...d.settings, ...s.settings } }; }
  } catch { /* a corrupt save just starts over */ }
  return DEFAULT();
}

const save = load();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } };

const sound = new Sound();
const scene = new Scene($("sea"));

let G = null;              // the night in progress
let demo = null;           // a code playing on the lighthouse
let intro = null;          // the new-letter card
let keyHeld = false;

// ---- Small helpers --------------------------------------------------------

const unlockedChars = () => KOCH.slice(0, save.unlocked);
const statOf = ch => (save.stats[ch] ??= { rx: 0, tx: 0, seen: 0, hit: 0 });
const pickOf = list => list[Math.floor(Math.random() * list.length)];
const fmt = n => n.toLocaleString("en-US");
const codeHTML = code => [...code].map(s => `<i class="${s === "-" ? "dah" : "dit"}"></i>`).join("");
const opts = () => ({ wpm: save.settings.wpm, fwpm: save.settings.fwpm });
const lampVisible = () => save.settings.signal !== "sound";

function applySettings() {
  const s = save.settings;
  sound.setPitch(s.hz);
  sound.setVolume(s.vol);
  sound.setSea(s.sea);
  sound.signalAudible = s.signal !== "light";
}

function show(id) {
  document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== id; });
  if (id) $(id).querySelector("[data-primary]")?.focus({ preventScroll: true });
}

function playDemo(code, force = true) {
  const text = Object.keys(MORSE).find(k => MORSE[k] === code);
  const tl = timeline(text, opts());
  sound.play(tl, force);
  demo = { tl, start: performance.now() };
}

function say(html) { $("callout").innerHTML = html; }

// ---- Title and briefing ---------------------------------------------------

function refreshTitle() {
  $("start").textContent = save.night > 1 ? `Report for night ${save.night}` : "Report for duty";
  $("title-progress").textContent = save.night > 1
    ? `${save.unlocked} of ${KOCH.length} characters learned` + (save.best ? ` · best night ${fmt(save.best)} tons` : "")
    : "";
}

function goTitle() {
  G = null;
  intro = null;
  sound.stop();
  scene.ships.forEach(s => { if (s.state === "sail") s.dead = true; });
  persist();
  $("hud").hidden = true;
  $("ledger").innerHTML = "";
  say("");
  setDesk("idle");
  refreshTitle();
  show("panel-title");
}

function brief() {
  sound.unlock();
  const chars = unlockedChars();
  $("brief-night").textContent = `Night ${save.night}`;
  $("brief-line").textContent = pickOf(BRIEF_LINES);
  $("brief-chars").innerHTML = chars.map(c => `<kbd>${c}</kbd>`).join("");
  const s = save.settings;
  $("brief-speed").textContent = `${s.wpm} WPM letters, spaced at ${s.fwpm >= s.wpm ? s.wpm : s.fwpm} WPM`;
  show("panel-brief");
}

// ---- New letter cards -----------------------------------------------------

function startIntros(after) {
  const pending = KOCH.slice(save.introduced, save.unlocked);
  if (!pending.length) { after(); return; }
  intro = { queue: pending, after, ch: null, plays: 0, nextAt: 0 };
  nextIntro();
}

function nextIntro() {
  const ch = intro.queue.shift();
  if (!ch) {
    const { after } = intro;
    intro = null;
    save.introduced = save.unlocked;
    persist();
    after();
    return;
  }
  intro.ch = ch;
  intro.plays = 0;
  intro.nextAt = performance.now() + 450;
  const code = MORSE[ch];
  $("intro-glyph").textContent = ch;
  $("intro-code").innerHTML = codeHTML(code);
  $("intro-speak").textContent = speak(code);
  $("intro-press").textContent = `Press ${ch} when you've got the rhythm.`;
  show("panel-intro");
}

function finishIntro() {
  if (!intro) return;
  sound.stop();
  demo = null;
  sound.click();
  nextIntro();
}

// ---- Running a night ------------------------------------------------------

function startNight({ chars = unlockedChars(), total = 16, mode = "night", fresh = [] } = {}) {
  G = {
    mode, chars, fresh, total, index: 0, tons: 0, streak: 0, bestStreak: 0,
    rx: { clean: 0, assisted: 0, total: 0 }, tx: { ok: 0, total: 0 },
    misses: {}, recent: [], recentTx: [], phase: "idle", phaseAt: 0, cur: null, ship: null, paused: false, nextAt: 0,
  };
  scene.weather = clamp((save.night - 1) * 0.07 + (save.settings.seas === "heavy" ? 0.25 : 0), 0, 0.85);
  $("ledger").innerHTML = "";
  $("hud").hidden = false;
  show(null);
  document.activeElement?.blur?.();
  buildKeys(chars);
  updateHud();
  nextShip();
}

function buildKeys(chars) {
  $("keys").innerHTML = chars.map(c => `<button type="button" class="k" data-ch="${c}" tabindex="-1">${c}</button>`).join("");
}

function updateHud() {
  $("h-night").textContent = G.mode === "drill" ? "Drill" : `Night ${save.night}`;
  $("h-ship").textContent = `Ship ${Math.min(G.index + 1, G.total)} of ${G.total}`;
  $("h-tons").textContent = `${fmt(G.tons)} tons saved`;
  $("h-streak").textContent = G.streak > 1 ? `${G.streak} in a row` : "";
}

function makePrompt() {
  const replyDue = save.settings.keying && G.index >= 3 && (G.index + 1) % 5 === 0;
  if (replyDue) {
    const text = pickChar(G.chars, save.stats, Math.random, G.recentTx, "tx");
    G.recentTx = [text, ...G.recentTx].slice(0, 2);
    return { kind: "tx", text };
  }
  const len = G.mode === "drill" ? 1 : groupLength(G.chars.length, Math.random);
  let text = "";
  for (let i = 0; i < len; i++) {
    const useFresh = G.fresh.length && Math.random() < 0.38;
    const ch = useFresh ? pickOf(G.fresh) : pickChar(G.chars, save.stats, Math.random, G.recent);
    G.recent = [ch, ...G.recent].slice(0, 2);
    text += ch;
  }
  return { kind: "rx", text };
}

function nextShip() {
  if (G.index >= G.total) { endNight(); return; }
  const kind = pickOf(KIND_POOL);
  const prompt = makePrompt();
  G.cur = {
    ...prompt, name: pickOf(SHIP_NAMES), shipKind: kind, typed: "", replayed: false, attempts: 0,
    waitSpent: 0, firstPass: true,
  };
  G.ship = scene.spawn(kind);
  G.phase = "approach";
  G.phaseAt = performance.now();
  G.keyer = null;
  updateHud();
  setDesk(prompt.kind);
  renderSlate();
  say(`<b>${G.cur.name}</b>`);
}

function startSignal(now) {
  const c = G.cur;
  c.tl = timeline(c.text, opts());
  c.sigAt = now;
  sound.play(c.tl);
  G.phase = "signal";
  G.phaseAt = now;
  say(`<b>${c.name}</b> is signalling`);
}

function startKeying(now) {
  const c = G.cur;
  G.keyer = new KeyDecoder(1200 / save.settings.wpm);
  G.phase = "key";
  G.phaseAt = now;
  c.allow = save.settings.seas === "calm" ? Infinity : 15000;
  say(`<b>${c.name}</b> needs a reply. Send <b class="big">${c.text}</b>`);
  renderSlate();
}

function avgMastery(text, field) {
  const list = [...text].map(c => statOf(c)[field]);
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function shipProgress(now) {
  const c = G.cur;
  const frac = clamp(c.waitSpent + (G.phase === "wait" || G.phase === "key" ? now - G.phaseAt : 0), 0, Infinity) / (c.allow ?? 1e9);
  const reach = save.settings.seas === "calm" ? 0.3 : 1;
  if (G.phase === "approach") return clamp((now - G.phaseAt) / 900, 0, 1) * 0.16;
  if (G.phase === "signal") {
    const sig = c.firstPass ? clamp((now - G.phaseAt) / c.tl.total, 0, 1) : 1;
    return 0.16 + 0.08 * sig + 0.76 * (Number.isFinite(c.allow) ? frac : 0);
  }
  return Math.min(reach, 0.24 + 0.76 * (Number.isFinite(c.allow) ? frac : 0)) || 0.24;
}

function update(now) {
  const demoOn = demo && keyedAt(demo.tl, now - demo.start);
  if (demo && now - demo.start > demo.tl.total + 40) demo = null;
  scene.keyLamp = Boolean(demoOn || keyHeld);

  if (intro?.ch && !$("panel-intro").hidden && intro.plays < 3 && now >= intro.nextAt) {
    playDemo(MORSE[intro.ch]);
    intro.plays++;
    intro.nextAt = now + demo.tl.total + 1100;
  }

  if (!G || G.paused) return;
  const c = G.cur;

  switch (G.phase) {
    case "approach":
      if (now - G.phaseAt >= 900) (c.kind === "rx" ? startSignal(now) : startKeying(now));
      break;
    case "signal": {
      const at = now - G.phaseAt;
      G.ship.lamp = lampVisible() && keyedAt(c.tl, at);
      if (at >= c.tl.total) {
        c.firstPass = false;
        G.ship.lamp = false;
        c.allow = allowance(avgMastery(c.text, "rx"), c.text.length, save.settings.seas);
        G.phase = "wait";
        G.phaseAt = now;
        c.endAt ??= now;
        say(`<b>${c.name}</b> is waiting on you`);
      }
      break;
    }
    case "wait":
      if (now - G.phaseAt + c.waitSpent >= c.allow) resolve(false, "silence");
      break;
    case "key": {
      const res = G.keyer.poll(now);
      if (res) onKeyed(res, now);
      else if (now - G.phaseAt + c.waitSpent >= c.allow && !G.keyer.pressed && !G.keyer.presses.length) resolve(false, "silence");
      renderLive();
      break;
    }
    case "resolve":
      if (c.teachAt && now >= c.teachAt) {
        c.teachAt = 0;
        playDemo(MORSE[c.text[0]], true);
      }
      if (now >= G.nextAt) { G.index++; nextShip(); }
      return;
  }

  if (G.phase !== "resolve" && G.ship) G.ship.p = shipProgress(now);

  const m = $("meter-fill");
  if (c.allow && Number.isFinite(c.allow) && (G.phase === "wait" || G.phase === "key" || G.phase === "signal")) {
    const running = G.phase === "signal" ? 0 : now - G.phaseAt;
    m.style.transform = `scaleX(${clamp(1 - (c.waitSpent + running) / c.allow, 0, 1)})`;
  } else {
    m.style.transform = "scaleX(1)";
  }
}

function onKeyed(res, now) {
  const c = G.cur;
  if (res.ch === c.text) { resolve(true); return; }
  c.attempts++;
  if (c.attempts >= 2) { resolve(false, res.code); return; }
  c.waitSpent = 0;
  G.phaseAt = now;
  c.lastSent = res.code;
  say(`Say again. <b class="big">${c.text}</b> goes like this`);
  playDemo(MORSE[c.text]);
  renderSlate();
}

function onCopy(ch) {
  if (!G || G.paused || G.cur.kind !== "rx" || !["signal", "wait"].includes(G.phase)) return;
  if (!G.chars.includes(ch)) return;
  const c = G.cur;
  if (ch !== c.text[c.typed.length]) { resolve(false, ch); return; }
  sound.click();
  c.typed += ch;
  renderSlate();
  if (c.typed.length === c.text.length) resolve(true);
}

function replay() {
  if (!G || G.paused || G.cur.kind !== "rx" || !["signal", "wait"].includes(G.phase) || G.cur.firstPass) return;
  const now = performance.now();
  const c = G.cur;
  if (G.phase === "wait") c.waitSpent += now - G.phaseAt;
  c.replayed = true;
  startSignal(now);
  say(`<b>${c.name}</b> is repeating. Half credit for this one`);
}

function resolve(ok, detail) {
  const now = performance.now();
  const c = G.cur;
  const wasKey = c.kind === "tx";
  sound.stop();
  if (keyHeld) { keyHeld = false; }
  G.ship.lamp = false;
  G.phase = "resolve";
  $("meter-fill").style.transform = "scaleX(1)";

  if (wasKey) {
    G.tx.total++;
    if (ok) G.tx.ok++;
    const st = statOf(c.text);
    st.tx = nudge(st.tx, ok ? (c.attempts ? 0.6 : 1) : 0);
  } else {
    G.rx.total++;
    if (ok && !c.replayed) G.rx.clean++;
    else if (ok) G.rx.assisted++;
    for (const ch of c.text) {
      const st = statOf(ch);
      st.seen++;
      if (ok) st.hit++;
      st.rx = nudge(st.rx, ok ? (c.replayed ? 0.5 : 1) : 0);
      if (!ok) G.misses[ch] = (G.misses[ch] || 0) + 1;
    }
  }

  if (ok) {
    const tons = SHIP_KINDS[c.shipKind];
    G.tons += tons;
    G.streak++;
    G.bestStreak = Math.max(G.bestStreak, G.streak);
    scene.saved(G.ship);
    sound.horn();
    say(`<b>${c.name}</b> is safe`);
    logLine(`${c.name}, ${fmt(tons)} tons`, c.text, true);
    if (!wasKey) c.typed = c.text;
    renderSlate(true);
    G.nextAt = now + 1500;
  } else {
    G.streak = 0;
    scene.wrecked(G.ship);
    sound.wreck();
    const heard = detail === "silence" ? "No reply" : wasKey ? "Garbled" : `You copied ${detail}`;
    say(`<b>${c.name}</b> is on the rocks. ${heard}`);
    logLine(c.name, c.text, false);
    teachSlate(c.text);
    c.teachAt = now + 750;
    const first = timeline(c.text[0], opts());
    G.nextAt = now + 750 + first.total + 1300;
  }
  updateHud();
}

function logLine(name, text, ok) {
  const li = document.createElement("li");
  li.className = ok ? "ok" : "lost";
  li.innerHTML = `<span>${name}</span><kbd>${text}</kbd>`;
  const log = $("ledger");
  log.prepend(li);
  while (log.children.length > 5) log.lastChild.remove();
}

// ---- The desk -------------------------------------------------------------

function setDesk(mode) {
  $("keys").hidden = mode !== "rx";
  $("tkey").hidden = mode !== "tx";
  $("replay").hidden = mode !== "rx";
  $("nameplate").hidden = mode !== "idle";
  $("slate").hidden = mode === "idle";
  $("meter").style.visibility = mode === "idle" ? "hidden" : "visible";
  $("desk-hint").textContent = mode === "tx"
    ? "Hold Space, or press and hold the key. Short for dit, long for dah."
    : "";
}

function renderSlate(done) {
  const c = G?.cur;
  if (!c) return;
  if (c.kind === "rx") {
    $("slate").innerHTML = [...c.text].map((ch, i) => {
      const got = c.typed[i];
      return `<span class="tile ${got ? "filled" : ""} ${done ? "good" : ""}">${got ?? ""}</span>`;
    }).join("");
  } else {
    const showCode = c.attempts > 0 || statOf(c.text).tx < 0.6;
    $("slate").innerHTML = `<span class="tile filled ${done ? "good" : ""}">${c.text}</span>
      <span class="code-box"><span class="hint-code">${showCode ? codeHTML(MORSE[c.text]) : "from memory"}</span>
      <span class="live-code" id="live"></span></span>`;
  }
}

function teachSlate(text) {
  $("slate").innerHTML = [...text].slice(0, 3).map(ch => `<span class="tile lost">${ch}</span>
    <span class="code-box"><span class="hint-code">${codeHTML(MORSE[ch])}</span><span class="speak">${speak(MORSE[ch])}</span></span>`).join("");
}

function renderLive() {
  const el = $("live");
  if (el && G.keyer) {
    const live = G.keyer.live;
    if (el.dataset.v !== live) { el.dataset.v = live; el.innerHTML = codeHTML(live); }
  }
}

function pressKey(down) {
  const keying = G && !G.paused && G.phase === "key";
  if (down) {
    if (keyHeld) return;
    if (!keying) return;
    keyHeld = true;
    G.keyer.down(performance.now());
    sound.keyTone(true);
    $("tkey").classList.add("down");
  } else {
    $("tkey").classList.remove("down");
    if (!keyHeld) return;
    keyHeld = false;
    sound.keyTone(false);
    if (keying) G.keyer.up(performance.now());
  }
}

// ---- Ending a night -------------------------------------------------------

function endNight() {
  const { rx, tx, mode } = G;
  const acc = accuracy(rx);
  const pct = Math.round(acc * 100);
  const passed = acc >= PASS_MARK;
  G.phase = "over";
  setDesk("idle");
  say("");
  $("hud").hidden = true;
  $("ledger").innerHTML = "";

  let verdict, unlockText = "";
  if (mode === "night") {
    if (passed && save.unlocked < KOCH.length) {
      save.unlocked++;
      const ch = KOCH[save.unlocked - 1];
      unlockText = `New page in the codebook: <kbd>${ch}</kbd>`;
      sound.bell();
    }
    save.best = Math.max(save.best, G.tons);
    save.night++;
    verdict = passed
      ? pickOf(["The harbor is very nearly full of ships. Good.", "Nobody drowned on your watch, or not enough to file.", "That'll do. Don't let it go to your head."])
      : pct >= 70
        ? `You need ${Math.round(PASS_MARK * 100)}% to get a new letter. Same codebook tomorrow.`
        : "The insurers have asked for your name. Same codebook tomorrow, and slow down in your head.";
  } else {
    verdict = "Drill done. Those letters are a little less weak now.";
  }

  $("debrief-title").textContent = mode === "night" ? `Night ${save.night - 1} log` : "Drill log";
  $("debrief-verdict").textContent = verdict;
  $("d-acc").textContent = `${pct}%`;
  $("d-saved").textContent = `${rx.clean + rx.assisted + tx.ok} of ${G.total}`;
  $("d-tons").textContent = fmt(G.tons);
  $("d-streak").textContent = G.bestStreak;
  $("d-unlock").innerHTML = unlockText;
  const missed = Object.entries(G.misses).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $("d-missed").innerHTML = missed.length
    ? `<h3>Practice these</h3>` + missed.map(([ch]) => `<button type="button" class="miss" data-play="${ch}"><kbd>${ch}</kbd>${codeHTML(MORSE[ch])}</button>`).join("")
    : "";
  $("next-night").textContent = `Report for night ${save.night}`;
  persist();
  G = null;
  show("panel-debrief");
}

function startDrill() {
  sound.unlock();
  const weakest = unlockedChars().sort((a, b) => statOf(a).rx - statOf(b).rx).slice(0, Math.max(2, Math.min(6, save.unlocked)));
  startNight({ chars: weakest, total: 12, mode: "drill" });
}

function beginShift() {
  sound.unlock();
  const freshFrom = Math.max(save.introduced === 0 ? 0 : save.unlocked - 1, 0);
  const fresh = save.unlocked > save.introduced || save.introduced === 0 ? KOCH.slice(freshFrom, save.unlocked) : [];
  startIntros(() => startNight({ fresh: save.unlocked > 2 ? fresh : [] }));
}

function setPaused(on) {
  if (!G || G.phase === "over" || G.paused === on) return;
  G.paused = on;
  if (on) {
    sound.stop();
    pressKey(false);
    show("panel-pause");
  } else {
    show(null);
    document.activeElement?.blur?.();
    const now = performance.now();
    // Whatever was being signalled starts over, so a pause never costs a letter.
    if (["signal", "wait"].includes(G.phase)) {
      G.cur.firstPass = false;
      startSignal(now);
    } else if (G.phase === "key" || G.phase === "approach") {
      G.phaseAt = now;
    }
  }
}

// ---- Codebook and settings ------------------------------------------------

function openBook() {
  sound.unlock();
  $("book-grid").innerHTML = KOCH.map((ch, i) => {
    const st = save.stats[ch];
    const known = i < save.unlocked;
    const pct = Math.round((st?.rx ?? 0) * 100);
    return `<button type="button" class="book-cell ${known ? "" : "locked"}" data-play="${ch}" aria-label="Play ${ch}">
      <b>${ch}</b><span class="code">${codeHTML(MORSE[ch])}</span><span class="bar"><i style="width:${pct}%"></i></span></button>`;
  }).join("");
  show("panel-book");
}

const SETTINGS = [
  { key: "wpm", label: "Letter speed", hint: "Words per minute within each letter. Learning at 18 or faster stops you counting dits.", options: [[12, "12"], [15, "15"], [18, "18"], [20, "20"], [25, "25"]] },
  { key: "fwpm", label: "Spacing", hint: "Farnsworth spacing: the gap between letters in a multi-letter signal.", options: [[5, "5"], [8, "8"], [10, "10"], [13, "13"], [99, "Full"]] },
  { key: "signal", label: "Ship signal", hint: "Sound only is the real test. Lamp only works with the sound off.", options: [["both", "Sound + lamp"], ["sound", "Sound only"], ["light", "Lamp only"]] },
  { key: "seas", label: "Seas", hint: "Calm seas: ships wait for you as long as you need.", options: [["calm", "Calm"], ["normal", "Normal"], ["heavy", "Heavy"]] },
  { key: "keying", label: "Reply drills", hint: "Every fifth ship has you send with the telegraph key.", options: [[true, "On"], [false, "Off"]] },
  { key: "sea", label: "Sea noise", options: [[true, "On"], [false, "Off"]] },
];

function openSettings() {
  sound.unlock();
  const rows = SETTINGS.map(s => `<div class="row"><div><label>${s.label}</label>${s.hint ? `<p>${s.hint}</p>` : ""}</div>
    <div class="seg">${s.options.map(([v, t]) => `<button type="button" data-set="${s.key}" data-val='${JSON.stringify(v)}' class="${save.settings[s.key] === v ? "on" : ""}">${t}</button>`).join("")}</div></div>`).join("");
  $("settings-rows").innerHTML = rows + `
    <div class="row"><div><label for="s-hz">Tone</label></div><div class="slide"><input id="s-hz" type="range" min="450" max="900" step="10" value="${save.settings.hz}"><output id="hz-out">${save.settings.hz} Hz</output></div></div>
    <div class="row"><div><label for="s-vol">Volume</label></div><div class="slide"><input id="s-vol" type="range" min="0.05" max="1" step="0.05" value="${save.settings.vol}"></div></div>
    <div class="row"><div><label>Graphics</label><p>Budget review concluded in March.</p></div>
      <div class="seg"><button type="button" class="on">A</button><button type="button" disabled>AA</button><button type="button" disabled>AAA</button></div></div>`;
  $("s-hz").oninput = e => {
    save.settings.hz = Number(e.target.value);
    $("hz-out").textContent = `${save.settings.hz} Hz`;
    applySettings();
    persist();
  };
  $("s-hz").onchange = () => playDemo(MORSE.K);
  $("s-vol").oninput = e => { save.settings.vol = Number(e.target.value); applySettings(); persist(); };
  $("s-vol").onchange = () => playDemo(MORSE.K);
  show("panel-settings");
}

// ---- Input ----------------------------------------------------------------

addEventListener("keydown", e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
    if (e.code === "Space" && G?.phase === "key") e.preventDefault();
    return;
  }
  if (e.target.closest?.(".site-topbar")) return;

  if (e.key === "Escape") {
    if (G) setPaused(!G.paused);
    else if ($("panel-title").hidden) goTitle();
    return;
  }
  const ch = e.key.toUpperCase();

  if (intro?.ch && !$("panel-intro").hidden) {
    if (ch === intro.ch) { e.preventDefault(); finishIntro(); }
    return;
  }
  if (!G || G.paused) return;

  if (e.code === "Space") {
    e.preventDefault();
    pressKey(true);
    return;
  }
  if (e.key === "Enter") { e.preventDefault(); replay(); return; }
  if (MORSE[ch]) { e.preventDefault(); onCopy(ch); }
});

addEventListener("keyup", e => { if (e.code === "Space") pressKey(false); });
addEventListener("blur", () => { pressKey(false); if (G) setPaused(true); });
document.addEventListener("visibilitychange", () => { if (document.hidden && G) setPaused(true); });

const tk = $("tkey");
tk.addEventListener("pointerdown", e => { e.preventDefault(); tk.setPointerCapture?.(e.pointerId); pressKey(true); });
for (const ev of ["pointerup", "pointercancel"]) tk.addEventListener(ev, () => pressKey(false));

$("keys").addEventListener("pointerdown", e => {
  const b = e.target.closest("[data-ch]");
  if (b) { e.preventDefault(); onCopy(b.dataset.ch); }
});

document.addEventListener("click", e => {
  const play = e.target.closest("[data-play]");
  if (play) { playDemo(MORSE[play.dataset.play]); return; }
  const set = e.target.closest("[data-set]");
  if (set) {
    save.settings[set.dataset.set] = JSON.parse(set.dataset.val);
    applySettings();
    persist();
    openSettings();
  }
});

$("start").onclick = brief;
$("book").onclick = openBook;
$("settings").onclick = openSettings;
$("brief-go").onclick = beginShift;
$("intro-again").onclick = () => playDemo(MORSE[intro.ch]);
$("intro-glyph").onclick = finishIntro;
$("replay").onclick = replay;
$("resume").onclick = () => setPaused(false);
$("quit").onclick = () => { sound.stop(); goTitle(); };
$("next-night").onclick = brief;
$("debrief-home").onclick = goTitle;
$("book-drill").onclick = startDrill;
for (const b of document.querySelectorAll("[data-back]")) b.onclick = goTitle;
$("reset").onclick = () => {
  if (!confirm("Forget every letter and start again from night 1?")) return;
  const keep = save.settings;
  Object.assign(save, DEFAULT(), { settings: keep });
  persist();
  goTitle();
};

$("mute").onclick = () => {
  sound.setMuted(!sound.muted);
  $("mute").textContent = sound.muted ? "♪ Sound off" : "♪ Sound on";
};

// ---- Boot -----------------------------------------------------------------

applySettings();
$("title-morse").innerHTML = [..."DIT HAPPENS"].map(c => (c === " " ? `<span class="gap"></span>` : `<span>${codeHTML(MORSE[c])}</span>`)).join("");
goTitle();

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  update(now);
  scene.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Headless test hooks.
window.__dh = {
  save, scene, sound,
  get G() { return G; },
  get intro() { return intro; },
  startNight, setPaused,
};
