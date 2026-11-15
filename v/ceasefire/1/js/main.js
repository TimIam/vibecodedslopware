import * as C from './chess.js';
import { MISSIONS } from './missions.js';
import { Game, advise } from './game.js';

const $ = id => document.getElementById(id);
const cv = $('board'), ctx = cv.getContext('2d');

// ---------- save ----------
const SAVE_KEY = 'ceasefire.v1';
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } })();
save.stars ||= {};
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} };

// ---------- sound ----------
let ac = null, muted = save.muted || false;
const muteBtn = $('mute');
const paintMute = () => { muteBtn.textContent = muted ? '♪ Sound off' : '♪ Sound on'; muteBtn.setAttribute('aria-pressed', String(!muted)); };
paintMute();
muteBtn.onclick = () => { muted = !muted; save.muted = muted; persist(); paintMute(); };
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  if (muted) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch {}
}
function noise(dur, vol = 0.2, lp = 900) {
  if (muted) return;
  try {
    ac ||= new AudioContext();
    const n = ac.sampleRate * dur, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol;
    s.connect(f).connect(g).connect(ac.destination); s.start();
  } catch {}
}
const sfx = {
  move: () => { tone(220, 0.07, 'triangle', 0.08); noise(0.05, 0.08, 2500); },
  capture: () => { noise(0.45, 0.35, 700); tone(90, 0.35, 'sawtooth', 0.08, -50); },
  check: () => { tone(660, 0.12, 'square', 0.05); tone(520, 0.18, 'square', 0.05, 0, 0.12); },
  deploy: () => { tone(140, 0.12, 'sine', 0.18, -60); noise(0.08, 0.1, 1200); },
  step: () => tone(300, 0.06, 'triangle', 0.08),
  abstain: () => tone(180, 0.2, 'sine', 0.06, -40),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.1, 0, i * 0.13)),
  lose: () => [330, 262, 196].forEach((f, i) => tone(f, 0.6, 'sawtooth', 0.05, 0, i * 0.22)),
  bad: () => tone(120, 0.1, 'square', 0.05),
};

// ---------- news ----------
const NAME = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const SIDE = { w: 'White', b: 'Black' };
const pick = a => a[Math.floor(Math.random() * a.length)];
const FILLER = [
  'Security Council meets to discuss scheduling of next meeting.',
  'Peacekeepers report morale "fine", helmets "a bit warm".',
  'Duck-egg blue confirmed as "the least threatening colour" by independent panel.',
  'White and Black generals both deny wanting to win. Both want to win.',
  'Bishops on dark squares refuse to comment on bishops on light squares.',
  'Knights continue to ignore all walls, rules and borders.',
  'Rook spokesperson: "We only move in straight lines. That is our whole position."',
  'Pawn unions demand clarity on what happens at the eighth rank.',
  'UN catering confirms Geneva chess talks will run past lunch.',
  'Analysts call stalemate "the only result where everyone goes home".',
];
let news = [];
function headline(t) {
  news.push(t); if (news.length > 6) news.shift();
  const el = $('crawl'), txt = news.join('   ◆   ');
  el.textContent = txt;
  el.style.setProperty('--dur', Math.max(25, txt.length * 0.16) + 's');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}

// ---------- state ----------
let g = null, missionIdx = 0;
let speed = save.speed || 1;
let showThreats = save.threats ?? true;
let selected = -1, hover = -1, hintAct = null;
let anim = null;        // { piece, from, to, t0, dur, cap }
let drops = [];         // peacekeeper landing animations
let puffs = [];         // capture smoke
let aiTimer = 0, busy = false;

const unlocked = i => i === 0 || (save.stars[MISSIONS[i - 1].id] || 0) > 0 || i <= (save.maxOpen || 0);

// ---------- layout ----------
let W = 0, H = 0, S = 40, ox = 0, oy = 0, dpr = 1;
function resize() {
  const r = cv.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  S = Math.floor(Math.min(W / 10.2, (H - 20) / 8.6));
  ox = Math.round((W - 8 * S) / 2); oy = Math.round((H - 8 * S) / 2);
}
new ResizeObserver(resize).observe(cv);
const sqXY = s => [ox + (s & 7) * S, oy + (7 - (s >> 3)) * S];
const sqCenter = s => { const [x, y] = sqXY(s); return [x + S / 2, y + S / 2]; };
function sqAt(px, py) {
  const f = Math.floor((px - ox) / S), r = 7 - Math.floor((py - oy) / S);
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1;
}

// ---------- drawing ----------
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const FONT = '"Segoe UI Symbol","Noto Sans Symbols 2","Apple Symbols","DejaVu Sans",serif';
function drawPiece(p, cx, cy, s, alpha = 1) {
  if (p === 'U') return drawPeacekeeper(cx, cy, s, alpha);
  const white = C.colorOf(p) === 'w';
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `${Math.round(s * 0.8)}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ch = GLYPH[C.kindOf(p)] + '︎';
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.fillText(ch, cx + s * 0.03, cy + s * 0.07);
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.07; ctx.strokeStyle = white ? '#2a2620' : '#d9d2c2';
  ctx.strokeText(ch, cx, cy + s * 0.04);
  ctx.fillStyle = white ? '#f6f0e2' : '#24242a';
  ctx.fillText(ch, cx, cy + s * 0.04);
  ctx.restore();
}

// The peacekeeper: a duck-egg-blue pawn wearing a UN helmet.
function drawPeacekeeper(cx, cy, s, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.scale(s / 100, s / 100);
  ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = '#3f6e69';
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(3, 38, 30, 8, 0, 0, 7); ctx.fill();
  const body = ctx.createLinearGradient(-28, 0, 28, 0);
  body.addColorStop(0, '#d9f0ec'); body.addColorStop(0.45, '#b5dcd6'); body.addColorStop(1, '#7fb3ac');
  ctx.fillStyle = body;
  // base
  ctx.beginPath(); ctx.ellipse(0, 31, 30, 8, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-28, 31); ctx.lineTo(-28, 25); ctx.ellipse(0, 25, 28, 7, 0, Math.PI, 0); ctx.lineTo(28, 31); ctx.fill();
  // body
  ctx.beginPath();
  ctx.moveTo(-23, 26);
  ctx.bezierCurveTo(-18, 12, -9, 4, -10, -6);
  ctx.lineTo(10, -6);
  ctx.bezierCurveTo(9, 4, 18, 12, 23, 26);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // collar
  ctx.beginPath(); ctx.ellipse(0, -6, 16, 4.5, 0, 0, 7); ctx.fill(); ctx.stroke();
  // head
  ctx.beginPath(); ctx.arc(0, -19, 13, 0, 7); ctx.fill(); ctx.stroke();
  // helmet
  const hel = ctx.createLinearGradient(-16, -40, 16, -20);
  hel.addColorStop(0, '#d4eef7'); hel.addColorStop(0.5, '#9fd3e8'); hel.addColorStop(1, '#6aaecb');
  ctx.fillStyle = hel; ctx.strokeStyle = '#356a80';
  ctx.beginPath(); ctx.moveTo(-19, -20); ctx.bezierCurveTo(-19, -48, 19, -48, 19, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -20, 22, 4.5, 0, 0, 7); ctx.fill(); ctx.stroke();
  // UN
  ctx.fillStyle = '#fff'; ctx.font = '900 16px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#356a80'; ctx.lineWidth = 2.2; ctx.strokeText('UN', 0, -31); ctx.fillText('UN', 0, -31);
  ctx.restore();
}

function dot(s, color, r = 0.14) {
  const [cx, cy] = sqCenter(s);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, S * r, 0, 7); ctx.fill();
}
function fillSq(s, color) { const [x, y] = sqXY(s); ctx.fillStyle = color; ctx.fillRect(x, y, S, S); }
function ring(s, color, w = 3) {
  const [x, y] = sqXY(s); ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.strokeRect(x + w / 2, y + w / 2, S - w, S - w);
}

function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!S) return;
  // sidelines: the staging lanes peacekeepers walk on from
  for (const side of [-1, 1]) {
    const x = side < 0 ? ox - S * 0.95 : ox + 8 * S + S * 0.1;
    ctx.fillStyle = 'rgba(181,220,214,.06)';
    ctx.strokeStyle = 'rgba(181,220,214,.22)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
    ctx.fillRect(x, oy, S * 0.85, 8 * S); ctx.strokeRect(x + .5, oy + .5, S * 0.85 - 1, 8 * S - 1); ctx.setLineDash([]);
  }
  // frame
  ctx.fillStyle = '#3a2c1e'; ctx.fillRect(ox - 10, oy - 10, 8 * S + 20, 8 * S + 20);
  ctx.fillStyle = '#251b12'; ctx.fillRect(ox - 3, oy - 3, 8 * S + 6, 8 * S + 6);
  for (let s = 0; s < 64; s++) {
    const light = ((s & 7) + (s >> 3)) % 2 === 1;
    fillSq(s, light ? '#e8dcc2' : '#9a7b58');
  }
  // supply lanes on the board: a- and h-files tinted
  for (let r = 0; r < 8; r++) { fillSq(r * 8, 'rgba(91,146,229,.10)'); fillSq(r * 8 + 7, 'rgba(91,146,229,.10)'); }
  // coords
  ctx.fillStyle = '#b8a689'; ctx.font = `600 ${Math.max(10, S * 0.17)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    ctx.fillText(C.FILES[i], ox + i * S + S / 2, oy + 8 * S + 6 + S * 0.08);
    ctx.fillText(String(8 - i), ox - 6 - S * 0.05, oy + i * S + S / 2);
  }
  if (!g) return;

  const lm = g.lastMove;
  if (lm) { fillSq(lm.from, 'rgba(240,199,94,.28)'); fillSq(lm.to, 'rgba(240,199,94,.4)'); }
  // kings in check
  for (const c of ['w', 'b']) if (C.inCheck(g.board, c)) {
    const k = C.kingSq(g.board, c), [cx, cy] = sqCenter(k);
    const rg = ctx.createRadialGradient(cx, cy, S * .1, cx, cy, S * .62);
    rg.addColorStop(0, 'rgba(255,60,40,.85)'); rg.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = rg; ctx.fillRect(cx - S / 2, cy - S / 2, S, S);
  }

  const you = g.phase === 'deploy' && !busy;
  // what the side to move could do next
  if (showThreats && g.phase !== 'over') {
    const seen = new Set();
    for (const m of C.legalMoves(g.board, g.turn)) seen.add(m.to);
    for (const s of seen) {
      const [cx, cy] = sqCenter(s);
      ctx.strokeStyle = g.turn === 'w' ? 'rgba(255,250,235,.75)' : 'rgba(25,25,30,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - S * .1, cy - S * .1); ctx.lineTo(cx + S * .1, cy + S * .1);
      ctx.moveTo(cx + S * .1, cy - S * .1); ctx.lineTo(cx - S * .1, cy + S * .1); ctx.stroke();
    }
  }
  if (you) {
    if (selected >= 0) {
      ring(selected, '#b5dcd6', 4);
      for (const t of C.redeploySquares(g.board, selected)) dot(t, 'rgba(91,146,229,.75)', 0.17);
    } else if (g.reserves > 0) {
      for (const s of C.deploySquares(g.board)) dot(s, 'rgba(70,140,200,.45)', 0.11);
    }
    if (hover >= 0) {
      const can = selected >= 0 ? C.redeploySquares(g.board, selected).includes(hover) : (g.reserves > 0 && C.canDeploy(g.board, hover));
      if (can) { const [cx, cy] = sqCenter(hover); drawPeacekeeper(cx, cy, S * 0.92, 0.45); }
    }
    if (hintAct && hintAct.to !== undefined) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ring(hintAct.to, `rgba(240,199,94,${0.5 + pulse * 0.5})`, 4);
      if (hintAct.from !== undefined) ring(hintAct.from, 'rgba(240,199,94,.6)', 2);
    }
  }

  // pieces
  for (let s = 0; s < 64; s++) {
    const p = g.board[s];
    if (!p) continue;
    if (anim && s === anim.to && now - anim.t0 < anim.dur) continue;
    const d = drops.find(d => d.s === s);
    const [cx, cy] = sqCenter(s);
    if (d) {
      const t = Math.min(1, (now - d.t0) / d.dur);
      const e = t < .7 ? (t / .7) ** 2 : 1 - Math.sin((t - .7) / .3 * Math.PI) * 0.08;
      const fx = d.fx ?? cx, fy = d.fy ?? cy - S * 1.2;
      drawPiece(p, fx + (cx - fx) * Math.min(1, t / .7), fy + (cy - fy) * e, S * 0.92);
      continue;
    }
    drawPiece(p, cx, cy, S * 0.92);
  }
  drops = drops.filter(d => now - d.t0 < d.dur);
  if (anim) {
    const t = Math.min(1, (now - anim.t0) / anim.dur), e = 1 - (1 - t) ** 3;
    const [ax, ay] = sqCenter(anim.from), [bx, by] = sqCenter(anim.to);
    if (anim.cap && t < 1) drawPiece(anim.cap, bx, by, S * 0.92, 1 - t * 0.6);
    drawPiece(g.board[anim.to] || anim.piece, ax + (bx - ax) * e, ay + (by - ay) * e - Math.sin(t * Math.PI) * S * 0.15, S * 0.92);
    if (t >= 1) anim = null;
  }
  // smoke
  for (const p of puffs) {
    const t = (now - p.t0) / 900;
    ctx.fillStyle = `rgba(${p.c},${(1 - t) * 0.45})`;
    ctx.beginPath(); ctx.arc(p.x + p.vx * t * S, p.y + p.vy * t * S, S * (0.08 + t * 0.25), 0, 7); ctx.fill();
  }
  puffs = puffs.filter(p => now - p.t0 < 900);

  // reserves standing at the sidelines
  const n = g.reserves;
  const per = Math.ceil(n / 2), rs = S * 0.62, gap = Math.min(S * 0.5, (8 * S - rs) / Math.max(1, per - 1));
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0, k = Math.floor(i / 2);
    const x = left ? ox - S * 0.525 : ox + 8 * S + S * 0.525;
    drawPeacekeeper(x, oy + 8 * S - rs * 0.6 - k * gap, rs);
  }
  // stalemate banner
  if (g.phase === 'over' && g.result) {
    ctx.fillStyle = g.result.win ? 'rgba(181,220,214,.18)' : 'rgba(224,96,79,.18)';
    ctx.fillRect(ox, oy, 8 * S, 8 * S);
  }
}
function loop(now) { draw(now); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

// ---------- panel ----------
function paint() {
  if (!g) return;
  $('m-name').textContent = g.m.name;
  $('m-where').textContent = g.m.where;
  $('s-round').textContent = `${Math.min(g.round, g.m.mandate)}/${g.m.mandate}`;
  $('s-res').textContent = g.reserves;
  $('s-cas').textContent = g.casualties;
  const mw = C.legalMoves(g.board, 'w').length, mb = C.legalMoves(g.board, 'b').length;
  $('mob-wn').textContent = mw; $('mob-bn').textContent = mb;
  $('mob-w').style.width = Math.min(100, mw / 0.4) + '%';
  $('mob-b').style.width = Math.min(100, mb / 0.4) + '%';
  document.querySelector('.mob.w').classList.toggle('next', g.turn === 'w' && g.phase !== 'over');
  document.querySelector('.mob.b').classList.toggle('next', g.turn === 'b' && g.phase !== 'over');
  const pr = $('prompt'); pr.className = '';
  const you = g.phase === 'deploy' && !busy;
  if (g.phase === 'over') pr.innerHTML = g.result.win ? '<b>Ceasefire.</b> Nobody can move. Nobody wins.' : '<b>The war is over.</b> Somebody won. That was the one thing you had to stop.';
  else if (you) {
    const side = SIDE[g.turn];
    if (g.alert === 'mate') { pr.className = 'danger'; pr.innerHTML = `<b>CHECKMATE INCOMING.</b> ${side}'s king is mated. Put a helmet in the line of fire or the war ends.`; }
    else if (g.alert === 'check') { pr.className = 'danger'; pr.innerHTML = `<b>${side} is in check.</b> Don't seal off the king's escape squares. Block the line if you can.`; }
    else { pr.className = 'you'; pr.innerHTML = `<b>Your deployment.</b> ${side} moves next and has ${g.turn === 'w' ? mw : mb} legal moves. ${selected >= 0 ? 'Pick a square next to the selected helmet.' : g.reserves ? 'Place a helmet, or click one on the board to step it.' : 'Out of helmets. Click one to step it.'}`; }
  } else pr.innerHTML = `${SIDE[g.turn]}'s general is thinking…`;
  $('b-abstain').disabled = !you; $('b-hint').disabled = !you;
  $('b-threats').setAttribute('aria-pressed', String(showThreats));
  $('b-speed').textContent = `Speed ${speed}×`;
  const log = $('log');
  log.innerHTML = '';
  for (const e of g.log.slice(-40)) {
    const li = document.createElement('li');
    li.textContent = e.side === 'u' ? `  ☮ ${e.san}` : `${e.side === 'w' ? e.round + '.' : e.round + '…'} ${e.san}`;
    if (e.side === 'u') li.className = 'u';
    else if (e.san.includes('x')) li.className = 'cap';
    log.appendChild(li);
  }
  log.scrollTop = log.scrollHeight;
}

// ---------- flow ----------
function startMission(i) {
  missionIdx = i;
  clearTimeout(aiTimer);
  g = new Game(MISSIONS[i]);
  selected = -1; hintAct = null; anim = null; drops = []; puffs = []; busy = false;
  news = [];
  headline(`Peacekeeping mission "${g.m.name}" begins. ${g.m.reserves} helmets issued.`);
  headline(pick(FILLER));
  for (const o of ['title', 'brief', 'result']) $(o).hidden = true;
  paint();
  schedule();
}
function schedule() {
  clearTimeout(aiTimer);
  if (g.phase === 'ai') {
    busy = true; paint();
    aiTimer = setTimeout(doAI, 520 / speed);
  } else { busy = false; paint(); if (g.phase === 'over') finish(); }
}
function doAI() {
  const before = g.board;
  const m = g.aiMove();
  if (!m) return schedule();
  anim = { piece: m.piece, from: m.from, to: m.to, t0: performance.now(), dur: 300 / speed, cap: m.cap };
  if (m.cap) {
    sfx.capture();
    const [cx, cy] = sqCenter(m.to);
    for (let i = 0; i < 10; i++) puffs.push({ x: cx, y: cy, vx: (Math.random() - .5) * 1.2, vy: -Math.random() * 1.1, t0: performance.now() + i * 20, c: i % 3 ? '120,110,100' : '230,140,60' });
    headline(pick([
      `${SIDE[m.side]} ${NAME[C.kindOf(m.piece)]} takes ${NAME[C.kindOf(m.cap)]} on ${C.sqName(m.to)}. Security Council "deeply concerned".`,
      `Casualty on ${C.sqName(m.to)}: one ${NAME[C.kindOf(m.cap)]}. Both generals call it "regrettable but necessary".`,
      `${NAME[C.kindOf(m.cap)][0].toUpperCase() + NAME[C.kindOf(m.cap)].slice(1)} lost at ${C.sqName(m.to)}. Toll rises to ${g.casualties}.`,
    ]));
  } else sfx.move();
  if (m.san.includes('#')) headline(`${SIDE[m.side]} announces checkmate. UN scrambles a response.`);
  else if (m.san.includes('+')) { sfx.check(); headline(pick([`${SIDE[g.turn]} king under fire. Embassy evacuated.`, `Check on the ${SIDE[g.turn].toLowerCase()} king. Diplomats reach for the phones.`])); }
  else if (Math.random() < 0.18) headline(pick(FILLER));
  if (g.phase === 'deploy' && !muted) setTimeout(() => tone(880, 0.06, 'sine', 0.05), 320 / speed);
  hintAct = null; selected = -1;
  if (g.phase === 'over') setTimeout(schedule, 400 / speed);
  else if (g.phase === 'ai') setTimeout(schedule, 300 / speed);
  else { busy = false; paint(); }
  paint();
}
function afterAct(a) {
  hintAct = null; selected = -1;
  const alert = g.alert;
  if (a.type === 'deploy') {
    g.log.push({ side: 'u', san: `☮ ${C.sqName(a.to)}`.slice(2) });
    sfx.deploy();
    const [cx, cy] = sqCenter(a.to);
    const edgeX = (a.to & 7) < 4 ? ox - S * 0.5 : ox + 8 * S + S * 0.5;
    drops.push({ s: a.to, t0: performance.now(), dur: 420, fx: (a.to & 7) === 0 || (a.to & 7) === 7 ? edgeX : cx, fy: (a.to & 7) === 0 || (a.to & 7) === 7 ? cy - S * 0.3 : cy - S * 1.3 });
    headline(pick([
      `Peacekeeper deployed to ${C.sqName(a.to)}. Locals unsure what it is for.`,
      `Blue helmet takes up position on ${C.sqName(a.to)}. "I'm just standing here," it says.`,
      `UN presence on ${C.sqName(a.to)} confirmed. Both generals file complaints.`,
      `New peacekeeper on ${C.sqName(a.to)}. ${g.reserves} still in the motor pool.`,
    ]));
  } else if (a.type === 'redeploy') {
    g.log.push({ side: 'u', san: `${C.sqName(a.from)}→${C.sqName(a.to)}` });
    sfx.step();
    drops.push({ s: a.to, t0: performance.now(), dur: 260, fx: sqCenter(a.from)[0], fy: sqCenter(a.from)[1] });
    headline(`Peacekeeper repositions from ${C.sqName(a.from)} to ${C.sqName(a.to)}.`);
  } else {
    g.log.push({ side: 'u', san: 'abstains' });
    sfx.abstain();
    headline(pick(['UN abstains. Press room groans.', 'The peacekeepers hold their positions.', 'No new deployments. A spokesperson cites "strategic patience".']));
  }
  if (alert && g.phase !== 'over') headline(alert === 'mate' ? 'A peacekeeper steps into the line of fire. The checkmate is off.' : 'The king survives the check. Talks continue.');
  schedule();
}
function finish() {
  const r = g.result;
  const card = $('result');
  const prev = save.stars[g.m.id] || 0;
  if (r.win) {
    sfx.win();
    save.stars[g.m.id] = Math.max(prev, r.stars);
    save.maxOpen = Math.max(save.maxOpen || 0, missionIdx + 1);
    persist();
    headline(`CEASEFIRE HOLDS: stalemate after ${g.round - 1} rounds. ${g.casualties} casualties.`);
  } else {
    sfx.lose();
    headline(r.reason === 'mandate' ? 'Mandate expires. Peacekeepers sent home, the war goes on.' : `${SIDE[r.by]} wins the war. UN "disappointed".`);
  }
  setTimeout(() => {
    $('rs-crest').textContent = r.win ? 'RESOLUTION ADOPTED' : 'MISSION FAILED';
    $('rs-head').textContent = r.win ? (r.reason === 'self' ? 'They walked right into it' : 'Stalemate!') : r.reason === 'mandate' ? 'Mandate expired' : `Checkmate. ${SIDE[r.by]} wins.`;
    const st = r.win ? r.stars : 0;
    $('rs-stars').innerHTML = [0, 1, 2].map(i => `<span class="${i < st ? '' : 'off'}">★</span>`).join('');
    const stuck = SIDE[g.turn];
    $('rs-text').textContent = r.win
      ? `${stuck} has no legal moves and isn't in check, so nobody wins. ${g.round - 1} rounds (par ${g.m.par}), ${g.casualties} casualties (cap ${g.m.casualties}), ${g.deployed} helmets deployed.${r.reason === 'self' ? ' The last move was the generals\' own.' : ''}`
      : r.reason === 'mandate'
        ? `${g.m.mandate} rounds and the war is still going. The Security Council has stopped paying for helmets.`
        : `${SIDE[r.by]} found a checkmate. A helmet in the line of fire, or one less square filled around the king, could have stopped it.`;
    $('rs-next').hidden = !(r.win && missionIdx < MISSIONS.length - 1);
    card.hidden = false;
    ($('rs-next').hidden ? $('rs-retry') : $('rs-next')).focus();
  }, 900 / speed);
}

// ---------- input ----------
function tryAct(a) {
  if (!g || g.phase !== 'deploy' || busy) return false;
  if (!g.act(a)) { sfx.bad(); return false; }
  afterAct(a); return true;
}
cv.addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect();
  hover = sqAt(e.clientX - r.left, e.clientY - r.top);
});
cv.addEventListener('pointerleave', () => { hover = -1; });
cv.addEventListener('pointerdown', e => {
  if (!g || g.phase !== 'deploy' || busy) return;
  const r = cv.getBoundingClientRect();
  const s = sqAt(e.clientX - r.left, e.clientY - r.top);
  if (s < 0) { selected = -1; paint(); return; }
  if (selected >= 0) {
    if (s === selected) { selected = -1; paint(); return; }
    if (g.board[s] === 'U') { selected = s; paint(); return; }
    if (tryAct({ type: 'redeploy', from: selected, to: s })) return;
    selected = -1; paint(); return;
  }
  if (g.board[s] === 'U') { selected = s; sfx.step(); paint(); return; }
  if (g.reserves > 0 && C.canDeploy(g.board, s)) { tryAct({ type: 'deploy', to: s }); return; }
  sfx.bad();
  if (g.board[s]) headline('Peacekeepers can only be placed on empty squares.');
  else headline(g.reserves ? 'Too far from the sidelines. Deploy on the a- or h-file, or next to another helmet.' : 'Out of helmets. Step an existing one instead.');
});

$('b-abstain').onclick = () => tryAct({ type: 'abstain' });
$('b-hint').onclick = () => {
  if (!g || g.phase !== 'deploy') return;
  hintAct = advise(g);
  if (hintAct.type === 'abstain') headline('Advisor: "Honestly? Do nothing this turn."');
  else if (hintAct.type === 'redeploy') headline(`Advisor suggests stepping the helmet on ${C.sqName(hintAct.from)} to ${C.sqName(hintAct.to)}.`);
  else headline(`Advisor suggests a helmet on ${C.sqName(hintAct.to)}.`);
};
$('b-threats').onclick = () => { showThreats = !showThreats; save.threats = showThreats; persist(); paint(); };
$('b-speed').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; save.speed = speed; persist(); paint(); };
$('b-restart').onclick = () => g && startMission(missionIdx);
$('b-menu').onclick = showTitle;
$('rs-next').onclick = () => showBrief(missionIdx + 1);
$('rs-retry').onclick = () => startMission(missionIdx);
$('rs-menu').onclick = showTitle;
$('br-back').onclick = showTitle;
$('br-go').onclick = () => startMission(missionIdx);

addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' && g?.phase === 'deploy' && $('result').hidden) { e.preventDefault(); tryAct({ type: 'abstain' }); }
  else if (k === 'h') $('b-hint').click();
  else if (k === 't') $('b-threats').click();
  else if (k === 'f') $('b-speed').click();
  else if (k === 'r' && g) startMission(missionIdx);
  else if (k === 'escape') { if (!$('title').hidden && g) $('title').hidden = true; else showTitle(); }
});

// ---------- menus ----------
function showTitle() {
  clearTimeout(aiTimer);
  const ol = $('missions'); ol.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const li = document.createElement('li'), b = document.createElement('button');
    const st = save.stars[m.id] || 0;
    b.disabled = !unlocked(i);
    b.innerHTML = `<span class="n">${i + 1}</span><span class="t"><b>${m.name}</b><small>${unlocked(i) ? m.where : 'Classified until the previous ceasefire holds'}</small></span><span class="st">${[0, 1, 2].map(j => `<span class="${j < st ? '' : 'off'}">★</span>`).join('')}</span>`;
    b.onclick = () => showBrief(i);
    li.appendChild(b); ol.appendChild(li);
  });
  $('brief').hidden = true; $('result').hidden = true; $('title').hidden = false;
  const first = ol.querySelector('button:not(:disabled):last-of-type');
  [...ol.querySelectorAll('button:not(:disabled)')].pop()?.focus();
}
function showBrief(i) {
  missionIdx = i;
  const m = MISSIONS[i];
  $('br-where').textContent = `MISSION ${i + 1} · ${m.where.toUpperCase()}`;
  $('br-name').textContent = m.name;
  $('br-text').textContent = m.brief;
  $('br-res').textContent = m.reserves;
  $('br-man').textContent = m.mandate;
  $('br-dep').innerHTML = m.deploy === 'both' ? 'You act after <b>every</b> move' : 'You act only after <b>Black</b> moves';
  $('br-tip').textContent = m.tip;
  $('br-par').textContent = m.par;
  $('br-cas').textContent = m.casualties;
  // preview position behind the card
  g = new Game(m); paint();
  $('title').hidden = true; $('result').hidden = true; $('brief').hidden = false;
  $('br-go').focus();
}

// idle board behind the title
g = new Game(MISSIONS[4]); paint();
headline('Welcome to the Department of Peace Operations. Please take a helmet.');
headline(pick(FILLER));
showTitle();

// ---------- test hooks ----------
window.__cf = {
  get game() { return g; }, C, MISSIONS, advise,
  start: i => startMission(i),
  act: a => tryAct(a),
  hint: () => advise(g),
  set speed(v) { speed = v; }, get speed() { return speed; },
  // play the advisor until the game ends; resolves with the result
  bot: () => new Promise(res => {
    const tick = () => {
      if (g.phase === 'over') return res(g.result);
      if (g.phase === 'deploy' && !busy) tryAct(advise(g));
      setTimeout(tick, 60);
    };
    tick();
  }),
};
