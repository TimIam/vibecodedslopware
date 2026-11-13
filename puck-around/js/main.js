// Menus, the lobby, input, and the loop that runs a match: as the one player against the computer, as
// the host of an online room (runs the game and sends it out), or as a guest (sends buttons, draws
// what comes back).
import * as SIM from './sim.js';
import * as R from './render.js';
import * as A from './audio.js';
import { TEAMS, kits } from './teams.js';
import { openRoom, openQueue, newCode, cleanCode, cleanName } from './net.js';
import * as ELO from './elo.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), stage = $('stage'), uiEl = $('ui');
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const store = {
  get(k, d) { try { return localStorage.getItem('pafo-' + k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pafo-' + k, v); } catch (e) {} },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DT = 1 / 60;
R.init(canvas);

// mode: 'title' (the computer plays itself behind the menu), 'solo', 'host', 'guest'
const G = { mode: 'title', S: null, cfg: null, me: -1, kits: kits(0, 1), names: [], paused: false, room: null, lob: null,
  buf: [], off: Infinity, gap: 2, pred: null, lastSnap: 0, rat: {}, mm: false, queue: null, hover: -1, evCur: 0, banner: null, shake: 0, cheer: 0, t: 0, hintT: 0, n: 0, panel: null };

// ---------------------------------------------------------------------------------------------- input
const keys = new Set(), inp = { mx: 0, my: 0, a: false, b: false };
let tgt = -1, mouseB = false, mouseMode = false, mcx = 0, mcy = 0, aimX = 0, aimY = 0;
let ca = 0, cb = 0, sentCa = 0, sentCb = 0, padA = false, padB = false, padX = 0, padY = 0, seq = 0, lastSent = '';
const PASS = ['KeyJ', 'KeyZ', 'Space'], SHOOT = ['KeyK', 'KeyX', 'KeyL'], MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const typing = e => e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
const playing = () => G.mode !== 'title' && !G.panel;
addEventListener('keydown', e => {
  A.init();
  if (e.code === 'Escape') { if (G.mode !== 'title') { e.preventDefault(); if (performance.now() - lockLostAt > 400) togglePause(); } return; }
  if (typing(e) || !playing()) return;
  if (PASS.includes(e.code) || SHOOT.includes(e.code) || MOVE.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (PASS.includes(e.code) || SHOOT.includes(e.code)) mouseMode = false;      // keyboard actions use the stick and the goal marker
  if (PASS.includes(e.code)) { tgt = -1; ca++; }
  if (SHOOT.includes(e.code)) cb++;
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('pointerdown', () => A.init());
// The mouse: left click a teammate to pass (or switch) to them, anywhere else to shoot (or check).
// Right click passes where you are steering, or switches to whoever is nearest the puck.
const curView = () => (G.mode === 'guest' ? (G.buf.length ? G.buf[G.buf.length - 1].v : null) : G.S);
const worldAt = (x, y) => { const r = canvas.getBoundingClientRect(); return [(x - r.left) / r.width * R.SW + R.camX(), (y - r.top) / r.height * R.SH - R.ICE_Y]; };
function mateAt() {
  const V = curView();
  if (!V || G.me < 0 || !playing() || V.phase === 'fight') return -1;
  const [wx, wy] = worldAt(mcx, mcy);
  const team = G.cfg.humans[G.me].team;
  let best = -1, bd = 22;
  for (const s of V.sk) { if (s.team !== team || s.role === 5 || s.out > 0 || s.ctl === G.me) continue; const d = Math.hypot(s.x - wx, s.y - 8 - wy); if (d < bd) { bd = d; best = s.id; } }
  return best;
}
// While you play the mouse belongs to the game: the pointer is locked to the rink and the game draws
// its own cursor, so it cannot wander onto the page, another window or a browser menu. Esc lets it go
// (and opens the menu); any click on the rink takes it back.
let locked = false, lockLostAt = 0;
function lockMouse() {
  if (locked || !canvas.requestPointerLock || !playing()) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === canvas;
  const r = canvas.getBoundingClientRect();
  if (locked) { mcx = clamp(mcx || r.left + r.width / 2, r.left, r.right - 1); mcy = clamp(mcy || r.top + r.height / 2, r.top, r.bottom - 1); }
  else if (was && playing()) { lockLostAt = performance.now(); togglePause(); }
});
const wrap = $('wrap');
wrap.addEventListener('mousedown', e => {
  if (!playing()) return;
  e.preventDefault(); canvas.focus();
  if (!locked) { mcx = e.clientX; mcy = e.clientY; lockMouse(); }
  mouseMode = true; [aimX, aimY] = worldAt(mcx, mcy);
  const V = curView();
  if (!V) return;
  if (V.phase === 'fight') { if (e.button === 0) ca++; else if (e.button === 2) cb++; return; }
  if (e.button === 2) { tgt = -1; ca++; return; }
  if (e.button !== 0) return;
  const mate = mateAt();
  if (mate >= 0) { tgt = mate; ca++; } else { cb++; mouseB = true; }
});
addEventListener('mouseup', e => { if (e.button === 0) mouseB = false; });
// No browser menus anywhere on the page: right click is a game button. (Text boxes keep theirs.)
addEventListener('contextmenu', e => { if (!typing(e)) e.preventDefault(); });
addEventListener('auxclick', e => { if (!typing(e)) e.preventDefault(); });
addEventListener('mousemove', e => {
  if (locked) { const r = canvas.getBoundingClientRect(); mcx = clamp(mcx + e.movementX, r.left, r.right - 1); mcy = clamp(mcy + e.movementY, r.top, r.bottom - 1); }
  else { mcx = e.clientX; mcy = e.clientY; }
  if (playing()) mouseMode = true;
  G.hover = mateAt();
});
// Right and middle buttons never reach the browser while a game is on.
for (const ev of ['mousedown', 'mouseup', 'pointerdown', 'pointerup']) addEventListener(ev, e => { if (e.button !== 0 && G.mode !== 'title' && !typing(e)) e.preventDefault(); }, true);
wrap.addEventListener('mouseleave', () => { G.hover = -1; });
function readInput() {
  const k = c => keys.has(c);
  let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0), my = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0);
  let a = PASS.some(k), b = SHOOT.some(k);
  const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(p => p && p.connected);
  if (pad && playing()) {
    const dz = v => (Math.abs(v) < 0.25 ? 0 : v), B = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
    padX = dz(pad.axes[0] || 0) + (B(15) ? 1 : 0) - (B(14) ? 1 : 0); padY = dz(pad.axes[1] || 0) + (B(13) ? 1 : 0) - (B(12) ? 1 : 0);
    const pa = B(0), pb = B(2) || B(1);
    if (pa && !padA) ca++; if (pb && !padB) cb++;
    padA = pa; padB = pb;
    if (padX || padY) { mx = clamp(padX, -1, 1); my = clamp(padY, -1, 1); }
    a = a || pa; b = b || pb;
  }
  b = b || mouseB;
  if (!playing()) { mx = my = 0; a = b = false; mouseB = false; }
  // The skater follows the cursor unless a key or stick is steering.
  const V = mouseMode && playing() && G.me >= 0 ? curView() : null;
  if (V && V.phase !== 'fight') {
    [aimX, aimY] = worldAt(mcx, mcy);
    const me = G.mode === 'guest' && G.pred ? G.pred : V.sk.find(k => k.ctl === G.me);
    if (me && !mx && !my) { const dx = aimX - me.x, dy = aimY + 6 - me.y, d = Math.hypot(dx, dy); if (d > 9) { const k = Math.min(1, d / 26) / d; mx = dx * k; my = dy * k; } }
  }
  inp.mx = mx; inp.my = my; inp.a = a; inp.b = b;
}

// ------------------------------------------------------------------------------------------- effects
function say(text, o = {}) {
  const b = G.banner;
  if (b && b.t > 0 && (b.pri || 0) > (o.pri || 0)) return;
  G.banner = { text, t: o.dur || 1.5, color: o.color || '#ffffff', scale: o.scale || 3, y: o.y, sub: o.sub, flash: o.flash, pri: o.pri || 0 };
}
const periodName = p => (p > 3 ? 'OVERTIME' : ['1ST', '2ND', '3RD'][p - 1] + ' PERIOD');
function onEvent(e, V) {
  const K = G.kits, quiet = G.mode === 'title';
  const sfx = (n, p) => { if (!quiet) A.sfx(n, p); };
  switch (e.k) {
    case 'faceoff': say('FACE OFF', { dur: 1.7 }); sfx('whistle'); break;
    case 'drop': sfx('drop'); if (G.banner && G.banner.text === 'FACE OFF') G.banner.t = 0; break;
    case 'draw': case 'pick': sfx('pick'); break;
    case 'early': if (V.sk.some(s => s.ctl === G.me && G.me >= 0 && s.team === e.a)) { sfx('early'); say('TOO EARLY!', { dur: 0.6, scale: 2, y: 70, color: '#ff6b5e' }); } break;
    case 'pass': case 'steal': case 'board': case 'block': case 'fblock': case 'fmiss': sfx(e.k); break;
    case 'switch': if (e.a === G.me) sfx('switch'); break;
    case 'shot': sfx('shot', e.a); break;
    case 'save': sfx('save'); if (!e.a) say('SAVE!', { dur: 0.7, scale: 2, y: 62, color: '#7fdbff' }); break;
    case 'post': sfx('post'); say('OFF THE POST!', { dur: 0.9, scale: 2, y: 62, color: '#ffb300' }); break;
    case 'check': sfx('check'); G.shake = 0.25; break;
    case 'goal': sfx('goal'); G.cheer = 3.2; G.shake = 0.3; say('GOAL!', { dur: 3.2, scale: 6, y: 74, flash: true, color: '#ffe14d', sub: K[e.a].name + ' SCORE', pri: 2 }); break;
    case 'horn':
      sfx('horn');
      if (V.phase !== 'final') say(V.period > 3 ? 'OVERTIME' : 'END OF THE ' + periodName(V.period - 1), { dur: 3, scale: 2, sub: V.period > 3 ? 'NEXT GOAL WINS' : 'UP NEXT: THE ' + periodName(V.period), pri: 2 });
      break;
    case 'fightStart': sfx('bell'); G.banner = null; break;
    case 'fhit': sfx('fhit', e.a); G.shake = e.a ? 0.3 : 0.18; break;
    case 'ko': sfx('ko'); G.cheer = 2; G.shake = 0.4; break;
    case 'bell': sfx('bell'); break;
    case 'penalty': sfx('penalty'); say('FIVE FOR FIGHTING', { dur: 2.6, scale: 3, color: '#ff6b5e', sub: K[e.a].name + ' SKATE ONE SHORT', pri: 1 }); break;
    case 'penEnd': sfx('switch'); say(K[e.a].abbr + ' BACK AT FULL STRENGTH', { dur: 1.2, scale: 1, y: 60 }); break;
    case 'final':
      if (quiet) break;
      A.sfx('win'); G.banner = null; show('p-final');
      if (G.cfg.rated && G.me >= 0 && G.mode !== 'solo') reportResult(G.cfg, V.score.slice());
      break;
  }
}
function drain(V) {
  for (const e of V.ev) if (e.i > G.evCur) { G.evCur = e.i; onEvent(e, V); }
}

// -------------------------------------------------------------------------------------------- panels
function show(id) {
  G.panel = id;
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('on', p.id === id);
  if (id === 'p-final') {
    const boss = G.mode !== 'guest';
    $('b-rematch').hidden = !boss;
    $('b-done').textContent = G.mode === 'solo' ? 'Back to the menu' : boss ? 'Back to the lobby' : 'Leave the room';
    $('final-info').textContent = (G.cfg.rated || G.mode === 'solo' ? '' : 'Unrated: rated games need a person on each side. ') + (boss ? '' : 'Waiting for the host to pick what happens next.');
    if (G.mm) $('b-done').textContent = 'Done';
  }
  if (id === 'p-pause') {
    $('pause-title').textContent = G.mode === 'solo' ? 'Paused' : 'Menu (the game carries on)';
    $('b-quit').textContent = G.mode === 'solo' ? 'Quit to the menu' : G.mm ? 'Leave the match' : G.mode === 'host' ? 'End the game for everyone' : 'Leave the room';
  }
  if (id) { if (document.pointerLockElement) document.exitPointerLock(); } else { canvas.focus(); lockMouse(); }
}
let noticeT = 0;
function notice(msg) { const n = $('notice'); n.textContent = msg; n.classList.toggle('on', !!msg); clearTimeout(noticeT); if (msg) noticeT = setTimeout(() => n.classList.remove('on'), 7000); }
function togglePause() {
  if (G.panel === 'p-pause') { G.paused = false; show(G.S && G.S.phase === 'final' ? 'p-final' : null); }
  else if (!G.panel || G.panel === 'p-final') { G.paused = G.mode === 'solo'; keys.clear(); show('p-pause'); }
}
const fill = (sel, v) => { sel.innerHTML = TEAMS.map((t, i) => `<option value="${i}">${t.name}</option>`).join(''); sel.value = v; };
fill($('s-home'), store.get('home', '0')); fill($('s-away'), store.get('away', '1')); fill($('l-home'), 0); fill($('l-away'), 1);
$('s-diff').value = store.get('diff', '1'); $('s-len').value = store.get('len', '120');
$('name').value = cleanName(store.get('name', '')) || 'SKATER' + (10 + ((Math.random() * 90) | 0));
const showElo = () => { const p = ELO.profile(); $('my-elo').textContent = p ? 'Rating ' + p.rating : ''; };
async function signIn() { try { await ELO.me(myName()); showElo(); return ELO.profile().pub; } catch (e) { console.warn('ratings unavailable', e); return null; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function reportResult(cfg, score) {
  const el = $('final-elo'), home = cfg.humans.filter(h => h.team === 0).map(h => h.pub), away = cfg.humans.filter(h => h.team === 1).map(h => h.pub);
  el.textContent = 'Recording the result...';
  for (let i = 0; i < 8; i++) {
    try {
      const r = await ELO.report(cfg.match, home, away, score[0], score[1]);
      if (G.cfg !== cfg) return;
      if (r && r.applied) { el.textContent = 'Rating ' + (r.rating - r.delta) + ' > ' + r.rating + ' (' + (r.delta > 0 ? '+' : '') + r.delta + ')'; showElo(); G.rat = {}; return; }
      if (r && r.error) break;
    } catch (e) { console.warn('report', e); }
    await sleep(1500);
  }
  if (G.cfg === cfg) el.textContent = 'This one could not be rated.';
}
async function fetchRatings() {
  const need = G.room ? [...G.room.members.values()].map(m => m.pb).filter(p => p && !(p in G.rat)) : [];
  if (!need.length) return;
  for (const p of need) G.rat[p] = 0;
  try { for (const r of await ELO.ratings(need)) G.rat[r.pub] = r.rating; renderLobby(); } catch (e) { for (const p of need) delete G.rat[p]; }
}
const myName = () => { const n = cleanName($('name').value) || 'SKATER'; store.set('name', n); return n; };

// -------------------------------------------------------------------------------------------- matches
function attract() {
  const a = (Math.random() * TEAMS.length) | 0, b = (a + 1 + ((Math.random() * (TEAMS.length - 1)) | 0)) % TEAMS.length;
  G.mode = 'title'; G.cfg = { periodLen: 90, diff: 2, seed: (Math.random() * 1e9) | 0, teams: [a, b], humans: [] };
  G.kits = kits(a, b); G.S = SIM.newGame(G.cfg); G.me = -1; G.names = []; G.evCur = 0; G.banner = null; G.paused = false;
}
function toTitle(msg) {
  attract(); show('p-title'); A.music('title'); A.setCrowd(0.4);
  if (msg) notice(msg);
}
function startMatch(cfg, mode) {
  G.cfg = cfg; G.kits = kits(cfg.teams[0], cfg.teams[1]); G.names = cfg.humans.map(h => h.name); G.mode = mode; G.paused = false;
  G.me = mode === 'solo' ? 0 : cfg.humans.findIndex(h => h.id === G.room.me);
  G.evCur = 0; G.buf = []; G.off = Infinity; G.pred = null; G.banner = null; G.shake = G.cheer = 0; G.hintT = 16; G.lastSnap = performance.now();
  G.S = mode === 'guest' ? null : SIM.newGame(cfg);
  sentCa = ca; sentCb = cb; keys.clear();
  $('final-elo').textContent = ''; G.hover = -1; mouseB = false; clearTimeout(mmTimer);
  show(null); notice(''); A.music(null); A.setCrowd(1); A.sfx('charge');
}
$('b-solo').onclick = () => { A.sfx('select'); show('p-solo'); };
$('b-how').onclick = () => { A.sfx('select'); show('p-how'); };
$('b-online').onclick = () => { A.sfx('select'); $('online-status').textContent = ''; show('p-online'); };
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => { A.sfx('move'); show('p-title'); };
$('b-solo-go').onclick = () => {
  for (const k of ['home', 'away', 'diff', 'len']) store.set(k, $('s-' + k).value);
  startMatch({ periodLen: +$('s-len').value, diff: +$('s-diff').value, seed: (Math.random() * 1e9) | 0, teams: [+$('s-home').value, +$('s-away').value], humans: [{ team: 0, name: 'YOU' }] }, 'solo');
};
$('b-resume').onclick = () => togglePause();
$('b-quit').onclick = () => { if (G.mode === 'solo') toTitle(); else if (G.mode === 'host' && !G.mm) endHosted(); else leaveRoom(); };
$('b-rematch').onclick = () => {
  if (G.mode === 'solo') startMatch({ ...G.cfg, seed: (Math.random() * 1e9) | 0 }, 'solo'); else if (G.mode === 'host') hostStart();
};
$('b-done').onclick = () => { if (G.mode === 'solo') toTitle(); else if (G.mode === 'host' && !G.mm) endHosted(); else leaveRoom(); };
$('b-queue').onclick = () => { A.sfx('select'); startQueue(); };
$('b-queue-cancel').onclick = () => { A.sfx('move'); stopQueue(); if (G.room) leaveRoom(); else show('p-title'); };
$('b-board').onclick = async () => {
  A.sfx('select'); show('p-board'); $('board').innerHTML = '<li class="dim">Loading...</li>';
  try {
    const me = await signIn(), rows = await ELO.leaderboard();
    $('board').innerHTML = rows.length ? rows.map(r => '<li class="' + (r.pub === me ? 'me' : '') + '"><span class="nm">' + cleanName(r.name) + '</span><span class="dim">' + (r.wins | 0) + '-' + (r.losses | 0) + '</span><span class="rt">' + (r.rating | 0) + '</span></li>').join('') : '<li class="dim">Nobody has finished a rated game yet. Be the first.</li>';
  } catch (e) { $('board').innerHTML = '<li class="dim">The leaderboard could not be reached.</li>'; }
};
$('name').onchange = () => { myName(); if (ELO.profile()) signIn(); };

// --------------------------------------------------------------------------------------------- rooms
const isHost = () => !!G.room && G.room.isHost;
const sorted = () => [...G.room.members.values()].sort((a, b) => a.jt - b.jt || (a.id < b.id ? -1 : 1));
const freshLob = () => ({ sides: {}, teams: [0, 1], periodLen: 120, diff: 1, started: false, cfg: null });
function seat(lob, id, want) {
  const count = s => Object.entries(lob.sides).filter(([k, v]) => v === s && k !== id && G.room.members.has(k)).length;
  if (want === -1) lob.sides[id] = -1;
  else if (want === 0 || want === 1) { if (count(want) < 2) lob.sides[id] = want; }
  else lob.sides[id] = count(0) <= count(1) ? (count(0) < 2 ? 0 : -1) : (count(1) < 2 ? 1 : -1);
}
function pushLob() { if (isHost() && G.lob) { G.room.send('lob', G.lob); renderLobby(); } }
function reconcile() {       // host: seat newcomers, forget leavers
  const lob = G.lob, ids = new Set(G.room.members.keys());
  for (const id of Object.keys(lob.sides)) if (!ids.has(id)) delete lob.sides[id];
  for (const m of sorted()) if (!(m.id in lob.sides)) seat(lob, m.id);
  if (G.mode === 'host' && G.S) G.cfg.humans.forEach((h, i) => { if (!ids.has(h.id)) SIM.dropController(G.S, i); });
  if (G.mm && G.mode === 'title' && !lob.started && ids.size === 2 && Object.values(lob.sides).filter(s => s >= 0).length === 2) {
    const a = (Math.random() * TEAMS.length) | 0;
    lob.teams = [a, (a + 1 + ((Math.random() * (TEAMS.length - 1)) | 0)) % TEAMS.length];
    return hostStart();
  }
  pushLob();
}
function renderLobby() {
  const room = G.room, lob = G.lob;
  if (!room) return;
  $('l-code').textContent = room.code;
  const host = isHost();
  $('players').innerHTML = sorted().map(m => {
    const s = lob ? lob.sides[m.id] : undefined, you = m.id === room.me;
    const link = m.id === room.hostId ? '' : host ? (room.linked(m.id) ? 'direct' : 'relay') : you ? (room.linked(room.hostId) ? 'direct' : 'relay') : '';
    return `<li><span class="nm">${m.nm}</span>${m.pb && G.rat[m.pb] ? `<span class="tag">${G.rat[m.pb]}</span>` : ''}${you ? '<span class="tag you">you</span>' : ''}${m.id === room.hostId ? '<span class="tag">host</span>' : ''}${link ? `<span class="tag">${link}</span>` : ''}<span class="tag ${s === 0 ? 'h' : s === 1 ? 'a' : ''}">${s === 0 ? 'home' : s === 1 ? 'away' : s === -1 ? 'watching' : '...'}</span></li>`;
  }).join('');
  const mine = lob ? lob.sides[room.me] : undefined;
  for (const b of document.querySelectorAll('[data-side]')) b.classList.toggle('sel', +b.dataset.side === mine);
  for (const id of ['l-home', 'l-away', 'l-len', 'l-diff']) $(id).disabled = !host;
  if (lob) { $('l-home').value = lob.teams[0]; $('l-away').value = lob.teams[1]; $('l-len').value = lob.periodLen; $('l-diff').value = lob.diff; }
  $('b-start').hidden = !host;
  const n = lob ? Object.values(lob.sides).filter(s => s >= 0).length : 0;
  $('l-info').textContent = !lob ? 'Finding the host...' : host
    ? (room.members.size < 2 ? 'Send a friend the link or the code. Empty spots are filled by computer skaters.' : n ? 'Everyone in? Drop the puck.' : 'Somebody has to pick a side.')
    : 'Waiting for the host to drop the puck.';
  $('b-start').disabled = !n;
  fetchRatings();
}
function hostStart() {
  const lob = G.lob;
  const humans = sorted().filter(m => lob.sides[m.id] >= 0).map(m => ({ id: m.id, team: lob.sides[m.id], name: m.nm, pub: m.pb }));
  if (!humans.length) return;
  const rated = humans.some(h => h.team === 0) && humans.some(h => h.team === 1) && humans.every(h => h.pub);
  lob.cfg = { periodLen: lob.periodLen, diff: lob.diff, seed: (Math.random() * 1e9) | 0, teams: lob.teams.slice(), humans, rated, match: crypto.randomUUID() };
  lob.started = true;
  startMatch(lob.cfg, 'host');
  pushLob();
}
function endHosted() { G.lob.started = false; G.lob.cfg = null; toLobby(); pushLob(); }
function toLobby(msg) {
  attract(); A.music('title'); A.setCrowd(0.4); show('p-lobby'); renderLobby();
  if (msg) notice(msg);
}
async function leaveRoom(msg) {
  const room = G.room;
  G.room = null; G.lob = null; G.mm = false; clearInterval(lobTimer); clearTimeout(mmTimer);
  history.replaceState(null, '', location.pathname);
  toTitle(msg);
  if (room) await room.leave();
}
let lobTimer = 0, joining = false;
async function startQueue() {
  if (G.queue || joining) return;
  show('p-queue'); $('q-status').textContent = 'Looking for an opponent...';
  try {
    await signIn();
    const q = await openQueue(code => { G.queue = null; if (G.panel === 'p-queue') enterRoom(code, true); },
      n => { $('q-status').textContent = n > 1 ? 'Opponent found. Getting the room ready...' : 'Looking for an opponent... You are the only one in line right now.'; });
    if (G.panel !== 'p-queue') return q.leave();
    G.queue = q;
  } catch (e) { console.error(e); show('p-title'); notice(e.message || 'Matchmaking is not available right now.'); }
}
function stopQueue() { if (G.queue) { G.queue.leave(); G.queue = null; } }
async function enterRoom(code, mm = false) {
  if (joining) return;
  joining = true; $('online-status').textContent = 'Connecting...';
  try {
    const room = await openRoom(code, myName(), await signIn());
    G.room = room; G.lob = null; G.mm = mm;
    room.on('host', () => {
      if (room.isHost) {
        const was = G.mode === 'guest';
        G.lob = G.lob ? { ...G.lob, started: false, cfg: null } : freshLob();
        if (was) toLobby('The host left, so that game is over. You are the host now.');
        reconcile();
      } else if (G.mode === 'host') toLobby();
      renderLobby();
    });
    room.on('members', () => { if (room.isHost && G.lob) reconcile(); else { renderLobby(); if (!G.lob) room.send('hi', 0, room.hostId); } });
    room.on('link', () => renderLobby());
    room.on('down', () => leaveRoom('Lost the connection to the room.'));
    room.on('msg', onMsg);
    lobTimer = setInterval(() => { if (isHost()) pushLob(); else if (G.room && !G.lob) G.room.send('hi', 0, G.room.hostId); }, 2000);
    history.replaceState(null, '', location.pathname + '?room=' + room.code);
    if (mm) {
      history.replaceState(null, '', location.pathname);
      show('p-queue'); $('q-status').textContent = 'Opponent found. Dropping the puck...';
      // if the other player never turns up, get back in line
      mmTimer = setTimeout(async () => { if (G.room === room && G.mm && G.mode === 'title') { await leaveRoom(); startQueue(); } }, 12000);
    } else toLobby();
    if (room.isHost && !G.lob) { G.lob = freshLob(); reconcile(); }
  } catch (e) {
    console.error(e);
    $('online-status').textContent = '';
    notice(e.message || 'Could not open the room.');
  }
  joining = false;
}
function onMsg(k, d, from) {
  const room = G.room;
  if (!room) return;
  if (room.isHost) {
    if (k === 'hi') pushLob();
    else if (k === 'side' && G.lob && !G.lob.started) { seat(G.lob, from, d === 0 || d === 1 ? d : -1); pushLob(); }
    else if (k === 'in' && G.mode === 'host' && G.S && d) {
      const c = G.S.ctl[G.cfg.humans.findIndex(h => h.id === from)];
      if (!c || c.dead || !(d.q > (c.q || 0))) return;
      c.q = d.q;
      c.inp.mx = clamp(+d.mx || 0, -1, 1); c.inp.my = clamp(+d.my || 0, -1, 1); c.inp.a = !!d.a; c.inp.b = !!d.b;
      c.inp.mu = !!d.mu; c.inp.ax = clamp(+d.ax || 0, -60, 1020); c.inp.ay = clamp(+d.ay || 0, -60, 280);
      if (c.ca !== undefined) { if (d.ca > c.ca) c.inp.pt = Number.isInteger(d.pt) ? d.pt : -1; c.inp.pa += clamp(d.ca - c.ca, 0, 3); c.inp.pb += clamp(d.cb - c.cb, 0, 3); }
      c.ca = d.ca; c.cb = d.cb;
    }
    return;
  }
  if (from !== room.hostId) return;
  if (k === 'lob' && d && d.sides) {
    G.lob = d;
    if (d.started && d.cfg) { if (G.mode !== 'guest' || G.cfg.seed !== d.cfg.seed) startMatch(d.cfg, 'guest'); }
    else if (G.mode === 'guest') toLobby();
    renderLobby();
  } else if (k === 'sn' && G.mode === 'guest' && d) {
    const last = G.buf[G.buf.length - 1];
    if (d.g !== G.cfg.seed || (last && d.n <= last.n)) return;
    const now = performance.now(), v = SIM.unpack(d, G.cfg);
    if (last) G.gap += ((d.n - last.n) - G.gap) * 0.1;
    G.off = Math.min(G.off + 0.02 * (d.n - (last ? last.n : d.n)), now - d.n * 1000 / 60);
    G.buf.push({ n: d.n, v }); if (G.buf.length > 12) G.buf.shift();
    G.lastSnap = now;
    drain(v);
  }
}
$('b-create').onclick = () => enterRoom(newCode());
$('b-join').onclick = () => { const c = cleanCode($('code').value); if (c.length < 3) return notice('Type the room code your friend sent you.'); enterRoom(c); };
$('code').onkeydown = e => { if (e.key === 'Enter') $('b-join').click(); };
$('b-leave').onclick = () => leaveRoom();
$('b-start').onclick = () => { if (isHost()) hostStart(); };
$('b-copy').onclick = async () => {
  const url = location.origin + location.pathname + '?room=' + G.room.code;
  try { await navigator.clipboard.writeText(url); $('l-copy').textContent = 'Copied. Send it to a friend.'; } catch (e) { $('l-copy').textContent = url; }
};
for (const b of document.querySelectorAll('[data-side]')) b.onclick = () => {
  const s = +b.dataset.side;
  if (isHost()) { seat(G.lob, G.room.me, s); pushLob(); } else if (G.room) G.room.send('side', s, G.room.hostId);
};
for (const id of ['l-home', 'l-away', 'l-len', 'l-diff']) $(id).onchange = () => {
  if (!isHost()) return;
  G.lob.teams = [+$('l-home').value, +$('l-away').value]; G.lob.periodLen = +$('l-len').value; G.lob.diff = +$('l-diff').value;
  pushLob();
};

// ---------------------------------------------------------------------------------------------- loop
function localToSim() {
  const c = G.me >= 0 ? G.S.ctl[G.me] : null;
  if (!c) return;
  const on = playing();
  c.inp.mx = on ? inp.mx : 0; c.inp.my = on ? inp.my : 0; c.inp.a = on && inp.a; c.inp.b = on && inp.b;
  c.inp.mu = on && mouseMode; c.inp.ax = aimX; c.inp.ay = aimY;
  if (ca > sentCa) c.inp.pt = tgt;
  c.inp.pa += ca - sentCa; c.inp.pb += cb - sentCb; sentCa = ca; sentCb = cb;
}
function guestTick() {
  const room = G.room, last = G.buf[G.buf.length - 1];
  if (G.me >= 0) {
    const sig = `${inp.mx.toFixed(1)},${inp.my.toFixed(1)},${inp.a},${inp.b},${ca},${cb}`;
    if (G.n % 2 === 0 || sig !== lastSent) { lastSent = sig; room.fast('in', { q: ++seq, mx: +inp.mx.toFixed(2), my: +inp.my.toFixed(2), a: inp.a ? 1 : 0, b: inp.b ? 1 : 0, ca, cb, pt: tgt, mu: mouseMode ? 1 : 0, ax: Math.round(aimX), ay: Math.round(aimY) }, room.hostId); }
  }
  if (performance.now() - G.lastSnap > 8000) { G.lastSnap = performance.now(); return toLobby('Lost touch with the host.'); }
  // move our own skater straight away, easing back toward where the host says it is
  const v = last && last.v, s = v && G.me >= 0 ? v.sk.find(k => k.ctl === G.me) : null;
  if (!s || v.phase !== 'play' || s.down || s.lunge || s.out > 0) { G.pred = null; return; }
  if (!G.pred || G.pred.id !== s.id) G.pred = { ...s };
  const p = G.pred;
  p.wind = s.wind;
  SIM.predictMove(p, inp.mx, inp.my, DT, v.puck.owner === s.id);
  const ex = s.x + s.vx * 0.07 - p.x, ey = s.y + s.vy * 0.07 - p.y;
  if (Math.hypot(ex, ey) > 46) { p.x = s.x; p.y = s.y; p.vx = s.vx; p.vy = s.vy; } else { const k = 1 - Math.exp(-DT * 5); p.x += ex * k; p.y += ey * k; }
}
function tick() {
  G.t += DT; G.n++;
  readInput();
  if (G.banner && G.banner.t > 0) G.banner.t -= DT;
  if (G.shake > 0) G.shake -= DT; if (G.cheer > 0) G.cheer -= DT; if (G.hintT > 0 && G.mode !== 'title') G.hintT -= DT;
  if (G.mode === 'guest') return guestTick();
  if (G.mode === 'solo' && G.paused) return;
  if (G.mode !== 'title') localToSim();
  SIM.step(G.S, DT);
  drain(G.S);
  if (G.mode === 'title' && G.S.phase === 'final') attract();
  if (G.mode === 'host' && G.S.tick % 2 === 0) { const o = SIM.pack(G.S); o.g = G.cfg.seed; G.room.fastAll('sn', o); }
}
function guestView() {
  const b = G.buf;
  if (!b.length) return null;
  const rn = (performance.now() - G.off) * 60 / 1000 - clamp(G.gap * 1.5 + 1, 3, 16);
  let V = b[b.length - 1].v;
  for (let i = b.length - 1; i > 0; i--) if (b[i - 1].n <= rn) { V = rn >= b[i].n ? b[i].v : SIM.blend(b[i - 1].v, b[i].v, (rn - b[i - 1].n) / (b[i].n - b[i - 1].n)); break; } else if (i === 1) V = b[0].v;
  const p = G.pred;
  if (p && V.phase === 'play') {
    V = { ...V, sk: V.sk.slice() };
    const s = V.sk[p.id] = { ...V.sk[p.id], x: p.x, y: p.y, vx: p.vx, vy: p.vy, face: p.face, dx: p.dx, dy: p.dy };
    if (V.puck.owner === p.id) V.puck = { ...V.puck, x: s.x + s.dx * 7, y: s.y + s.dy * 4 + 1 };
  }
  return V;
}
const KEYS_HINT = 'MOUSE: SKATE AND AIM   CLICK: SHOOT / CHECK   RIGHT CLICK: PASS';
function render(dt) {
  const V = G.mode === 'guest' ? guestView() : G.S;
  if (!V) { const g = canvas.getContext('2d'); g.fillStyle = '#0b0f1a'; g.fillRect(0, 0, R.SW, R.SH); R.drawPanel([{ text: 'WAITING FOR THE HOST...', color: '#f2c230' }], 120); return; }
  const title = G.mode === 'title', mine = G.me >= 0 ? V.sk.find(s => s.ctl === G.me) : null;
  const ui = { kits: G.kits, me: G.me, names: G.names, t: G.t, dt, banner: title ? null : G.banner, shake: G.shake, cheer: G.cheer, dim: title ? 0.45 : G.panel === 'p-pause' ? 0.5 : 0, hint: '', hover: title ? -1 : G.hover };
  canvas.classList.toggle('play', playing());
  if (!title) {
    if (G.me < 0) ui.hint = 'WATCHING';
    else if (V.phase === 'fight') ui.hint = V.fight.ids.includes(mine ? mine.id : -1) || !V.sk.some(s => V.fight.ids.includes(s.id) && s.ctl >= 0 && s.team === G.cfg.humans[G.me].team)
      ? 'A/D: MOVE   W: GUARD HEAD   S: GUARD BODY   LEFT CLICK: JAB   RIGHT CLICK: BODY SHOT' : 'YOUR TEAMMATE IS IN THIS ONE';
    else if ((V.phase === 'faceoff' || V.phase === 'draw') && mine && Math.abs(mine.x - 480) < 20 && Math.abs(mine.y - 108) < 4) ui.hint = 'CLICK THE MOMENT THE PUCK DROPS';
    else if (V.phase === 'play' && G.hintT > 0) ui.hint = KEYS_HINT;
  }
  if (playing()) {
    if (locked) { const r = canvas.getBoundingClientRect(); ui.cur = [(mcx - r.left) / r.width * R.SW, (mcy - r.top) / r.height * R.SH]; }
    else if (!ui.hint && canvas.requestPointerLock && matchMedia('(pointer: fine)').matches) ui.hint = 'CLICK THE RINK TO PLAY WITH THE MOUSE   ESC LETS IT GO';
  }
  if (V.phase === 'fight' && V.fight) R.drawFight(V, ui); else R.draw(V, ui);
  if (title) R.drawLogo(G.t);
  else if (V.phase === 'final') {
    const K = G.kits;
    R.drawPanel([{ text: 'FINAL', color: '#f2c230', scale: 2 }, { text: `${K[0].name} ${V.score[0]} - ${V.score[1]} ${K[1].name}`, scale: 2 }, { text: K[V.winner >= 0 ? V.winner : 0].name + ' WIN' + (V.period > 3 ? ' IN OVERTIME' : ''), color: '#ffe14d' }], 70);
  }
}
let last = performance.now(), acc = 0, lastFrame = last;
var mmTimer = 0;
function advance() {
  const now = performance.now();
  acc += Math.min(0.25, (now - last) / 1000); last = now;
  let n = 0;
  while (acc >= DT && n < 10) { tick(); acc -= DT; n++; }
  if (n === 10) acc = 0;
}
function frame() {
  advance();
  const now = performance.now();
  render(Math.min(0.1, (now - lastFrame) / 1000)); lastFrame = now;
  requestAnimationFrame(frame);
}
// A hidden tab stops drawing, but a host must keep the game going for everyone else.
try {
  const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),16)'], { type: 'text/javascript' })));
  w.onmessage = () => { if (document.hidden) advance(); };
} catch (e) {}

function fit() {
  const wrap = $('wrap'), s0 = Math.min(wrap.clientWidth / R.SW, wrap.clientHeight / R.SH), s = s0 >= 1 ? Math.floor(s0) : s0;
  canvas.style.width = R.SW * s + 'px'; canvas.style.height = R.SH * s + 'px';
  stage.style.width = R.SW * s + 'px';
  uiEl.style.fontSize = Math.max(10, Math.round(R.SH * s / 44)) + 'px';
}
addEventListener('resize', fit); fit();

const mute = $('mute');
const setMute = m => { A.setMuted(m); store.set('muted', m ? '1' : '0'); mute.textContent = m ? '♪ Sound off' : '♪ Sound on'; };
setMute(store.get('muted', '0') === '1');
mute.onclick = () => { A.init(); setMute(!A.isMuted()); mute.blur(); };
addEventListener('pointerdown', () => { if (G.mode === 'title') A.music('title'); }, { once: true });
addEventListener('beforeunload', () => { if (G.room) G.room.leave(); });

toTitle();
signIn();
const invite = cleanCode(new URLSearchParams(location.search).get('room'));
if (invite) { $('code').value = invite; show('p-online'); $('online-status').textContent = 'Invited to room ' + invite + '. Pick a name and press Join.'; }
requestAnimationFrame(frame);

// Handles for automated tests on a developer's machine.
if (LOCAL) window.__pa = { mouse: () => ({ locked, mcx, mcy, mouseMode }), G, SIM, ELO, startMatch, tick, enterRoom, hostStart, startQueue, press: k => { if (k === 'a') ca++; else cb++; }, inp, keys };
