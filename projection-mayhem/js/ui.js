// DOM side of the game: HUD, hints, registers, the admin computer, dialogs, summaries, splice wrapper.
import { G, film, money, CANDY, CASE_CAP, POP_CAP, SODA_CAP, SUPPLY, ROLES, REF_PRICE, SCREEN_COST, PLATTER_COST, DIGITAL_COST, rentPerDay, saveGame, REEL_SECS, MOTOR_CUE } from './state.js';
import { FILMS, MISCHIEF_FRAMES } from './films.js';
import * as sim from './sim.js';
import { S } from './sim.js';
import * as booth from './booth.js';
import { W, L, P, paintSign, decoText } from './world.js';
import { sfx } from './audio.js';

const $ = s => document.querySelector(s);
let F = null, Splice = null;
export function setArt(frames, splice) { F = frames; Splice = splice; }
export const UI = { modal: null, pip: null, onModalChange: null };

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ------------------------------------------------------------------ modal plumbing
addEventListener('keydown', e => {
  if (!UI.modal || UI.splicing) return;
  const w = UI.modal.wrap;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    const btns = [...w.querySelectorAll('button.big.go')].filter(b => !b.disabled && b.offsetParent);
    if (btns.length) { e.preventDefault(); btns[btns.length - 1].click(); }
  } else if (/^Digit[1-6]$/.test(e.code)) {
    const scr = [...w.querySelectorAll('.pick .scr')][+e.code.slice(5) - 1];
    scr?.click();
  }
});
function openModal(node, { cls = '', onClose } = {}) {
  closeModal(true);
  const wrap = el('div', 'modal ' + cls);
  wrap.appendChild(node);
  $('#modals').appendChild(wrap);
  UI.modal = { wrap, onClose };
  UI.onModalChange?.(true);
  return wrap;
}
export function closeModal(silent) {
  if (!UI.modal) return;
  const m = UI.modal; UI.modal = null;
  m.wrap.remove();
  m.onClose?.();
  if (!silent) UI.onModalChange?.(false);
  else UI.onModalChange?.(false);
}
export function modalOpen() { return !!UI.modal || !!UI.splicing; }

// ------------------------------------------------------------------ toasts + hints
export function toast(msg, kind = 'info') {
  const lastT = $('#toasts').lastElementChild;
  if (lastT && lastT.dataset.msg === msg && !lastT.classList.contains('out')) { lastT.dataset.n = (+lastT.dataset.n || 1) + 1; lastT.innerHTML = esc(msg) + ` <i>×${lastT.dataset.n}</i>`; return; }
  const t = el('div', 'toast ' + kind, esc(msg));
  t.dataset.msg = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4400);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

// ------------------------------------------------------------------ first nights: a checklist of the job
const JOBS = [
  ['threadA', 'Thread reel 1 on projector A (booth, up the stairs)'],
  ['threadB', 'Thread reel 2 on projector B'],
  ['restock', 'Restock the sold-out candy from the stockroom'],
  ['open', 'Open the front doors'],
  ['ticket', 'Sell tickets at the box office'],
  ['snack', 'Serve someone at concessions'],
  ['start', 'Start the show at showtime'],
  ['change', 'Change over on the cigarette burns'],
  ['rewind', 'Rewind a played reel'],
  ['clean', 'Sweep up the theatre when the film lets out'],
  ['bin', 'Empty your trash bag in a bin'],
];
export function tutDone(key) {
  G.flags.jobs = G.flags.jobs || {};
  if (G.flags.jobs[key]) return;
  G.flags.jobs[key] = true;
  renderJobs(true);
}
function renderJobs(flash) {
  const el2 = $('#jobs');
  const jobs = G.flags.jobs || {};
  const done = JOBS.filter(([k]) => jobs[k]).length;
  if (done === JOBS.length || G.day > 3 || G.flags.omni) { el2.style.display = 'none'; return; }
  el2.style.display = '';
  el2.innerHTML = `<b>Tonight’s jobs <span>${done}/${JOBS.length}</span></b>` + JOBS.map(([k, t]) => `<div class="${jobs[k] ? 'ok' : ''}">${jobs[k] ? '☑' : '☐'} ${esc(t)}</div>`).join('');
  if (flash) { el2.classList.remove('flash'); void el2.offsetWidth; el2.classList.add('flash'); sfx('tick'); }
}

let hintAcc = 0;
export function updateHUD(dt, ctx) {
  $('#cash').textContent = money(G.cash);
  $('#day').textContent = G.day;
  $('#phase').textContent = G.phase === 'open' ? clock() : G.phase === 'closing' ? 'last show' : 'closed';
  $('#rep').textContent = '★'.repeat(Math.round(G.rep)) + '☆'.repeat(5 - Math.round(G.rep));
  $('#soulBox').style.display = G.act >= 3 || G.flags.omni ? '' : 'none';
  $('#soul').style.width = G.soul + '%';
  $('#mayhemBox').style.display = G.act >= 4 && !G.flags.finale ? '' : 'none';
  $('#mayhem').style.width = G.mayhem + '%';
  // screen chips
  const chips = $('#chips');
  const open = G.screens.filter(s => s.open);
  if (chips.children.length !== open.length) { chips.innerHTML = ''; open.forEach(s => chips.appendChild(el('div', 'chip'))); }
  open.forEach((s, i) => {
    const st = booth.status(s.id);
    const c = chips.children[i];
    const f = film(s.film);
    c.className = 'chip' + (st?.urgent ? ' urgent' : '') + (st?.cue ? ' cue' : '');
    c.innerHTML = `<b>${s.id}</b><span>${esc(f ? f.title : '—')}</span><i>${esc(st?.text || '')}</i>`;
  });
  const bag = G.bag || 0;
  $('#bag').style.display = bag ? '' : 'none';
  $('#bag').innerHTML = `🗑️ Trash bag <b>${bag}/${sim.BAG_CAP}</b>${bag >= sim.BAG_CAP ? ' — FULL' : ''}`;
  if (!UI.jobsDrawn) { UI.jobsDrawn = true; renderJobs(); }
  hintAcc -= dt;
  if (hintAcc <= 0) { hintAcc = 0.25; $('#coach').textContent = hint(ctx); $('#coach').style.opacity = $('#coach').textContent ? 1 : 0; }
  // PiP: the screen you're nearest to while in the booth
  const pip = $('#pip');
  if (ctx.pipScreen) {
    const b = booth.B[ctx.pipScreen];
    pip.style.display = 'block';
    const g = pip.querySelector('canvas').getContext('2d');
    g.drawImage(b.canvas, 0, 0, 256, 145);
    pip.querySelector('span').textContent = `Screen ${ctx.pipScreen} through the port`;
    b.visible = true;
  } else pip.style.display = 'none';
}
function clock() {
  const mins = 18 * 60 + Math.floor(G.t / 2.2);   // doors at 6 pm; game seconds tick the clock along
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 && h < 24 ? 'pm' : 'am'}`;
}

function hint(ctx) {
  const reelScreens = G.screens.filter(s => s.open && s.tier !== 'digital');
  const proj = G.staff.some(s => s.role === 'projectionist');
  for (const s of G.screens.filter(s => s.open)) {
    const sh = booth.B[s.id].show;
    if (sh?.broken) return `FILM BREAK on screen ${s.id}! Booth → projector, press E and splice it.`;
  }
  if (!proj) for (const s of reelScreens) {
    const b = booth.B[s.id], sh = b.show;
    if (!sh || !sh.started || s.tier !== 'reel') continue;
    const f = film(sh.film);
    if (sh.reel >= f.reels) continue;
    const incId = sh.active === 'A' ? 'B' : 'A', inc = b.P[incId];
    const left = REEL_SECS - sh.reelT;
    if (inc.played) return `Screen ${s.id}: rewind the reel on projector ${incId}, then thread reel ${sh.reel + 1}. Hurry.`;
    if (inc.reel !== sh.reel + 1) return `Screen ${s.id}: thread reel ${sh.reel + 1} on projector ${incId} before reel ${sh.reel} runs out.`;
    if (left < MOTOR_CUE + 4) {
      if (!inc.motor) return `Screen ${s.id}: watch the top-right of the picture. First cigarette burn → start projector ${incId}'s motor (E or Q).`;
      return `Screen ${s.id}: motor running. Second burn → CHANGEOVER (E on projector ${incId}, or Space).`;
    }
  }
  const usher = G.staff.some(s => s.role === 'usher');
  if ((G.bag || 0) >= sim.BAG_CAP) return 'Your trash bag is full. Empty it in a bin (one beside every auditorium door, two in the lobby).';
  if (!usher) for (const s of G.screens.filter(s => s.open && s.trash > 0)) {
    const sh = booth.B[s.id].show, out = S.customers.some(c => c.k === s.id && c.state === 'seated');
    if (!sh?.started && !out) return `Screen ${s.id} let out. Sweep up the ${s.trash} piece${s.trash > 1 ? 's' : ''} of trash (hold E) before the next show can start.`;
  }
  for (const s of G.screens.filter(s => s.open)) {
    const b = booth.B[s.id], sh = b.show;
    if (sh && !sh.started && G.t >= sh.startAt - 3 && s.tier !== 'digital' && !proj) {
      if (s.tier === 'reel' && b.P.A.reel !== 1) return `Screen ${s.id} is due to start: thread reel 1 on projector A!`;
      if (s.tier === 'platter' && !b.P.A.threaded) return `Screen ${s.id} is due: lace up the platter!`;
      return `Showtime on screen ${s.id}! Booth → projector A → START THE SHOW.`;
    }
  }
  if (S.boxQ.length && !G.staff.some(s => s.role === 'cashier')) return `${S.boxQ.length} waiting at the box office.`;
  if (S.conQ.length && !G.staff.some(s => s.role === 'concession')) return `${S.conQ.length} waiting at concessions.`;
  if (!proj) for (const s of G.screens.filter(s => s.open && s.tier === 'reel' && s.film)) {
    const b = booth.B[s.id];
    for (const id of ['A', 'B']) {
      const P = b.P[id];
      if (P.played) return `Screen ${s.id}: rewind the played reel on projector ${id}.`;
      if (!b.show?.started && P.reel === null && G.phase === 'open' && s.shows?.some(x => x.state === 'pending' || x.state === 'queued')) return `Screen ${s.id}: thread reel ${P.next} on projector ${id} for the next show.`;
    }
  }
  if (G.carry) {
    const c = G.carry;
    if (c.kind === 'print') return 'Take the print case up the stairs to the splicing bench (right side of the booth balcony). G throws it down.';
    if (c.kind === 'drive') return 'Ingest happens on the projector once the film is booked to a digital screen. Drop it (G) for now.';
    if (c.kind === 'candy') return `Put the ${CANDY[c.i].name} in the glass case at the concession counter.`;
    if (c.kind === 'kernels') return 'Pour the kernels into the popcorn machine behind the counter.';
    if (c.kind === 'syrup') return 'Hook the syrup up to the soda fountain behind the counter.';
  }
  const poster = G.screens.find(s => s.open && s.film && s.poster !== s.film);
  const low = G.stock.candy.findIndex((n, i) => n === 0 && G.back.some(b => b.kind === 'candy' && b.i === i));
  const stocker = G.staff.some(s => s.role === 'stocker');
  if (G.phase === 'closed') {
    if (G.flags.omniPending) return 'A man in a suit is waiting in the lobby.';
    if (G.flags.story.mayhem === 'pending') return 'Something is wrong with you. Check the admin computer.';
    const reelNot = G.screens.find(s => s.open && s.tier === 'reel' && s.film && booth.B[s.id].P.A.reel !== 1 && !booth.B[s.id].P.A.played);
    if (reelNot && G.day === 1) return `Go up to the booth (stairs, left wall) and thread reel 1 on screen ${reelNot.id}'s projector A.`;
    const reelB = G.screens.find(s => s.open && s.tier === 'reel' && s.film && booth.B[s.id].P.B.reel !== 2 && !booth.B[s.id].P.B.played);
    if (reelB && G.day === 1) return `Thread reel 2 on projector B too, so it's ready for the first changeover.`;
    if (G.day === 1 && G.stock.candy[4] === 0 && !G.carry) return 'Twizzle Sticks are sold out. Fetch the carton from the stockroom pallet (door behind the candy counter).';
    if (G.back.some(b => b.kind === 'print')) return 'A new print came in: carry the case from the stockroom up to the splicing bench.';
    const noFilm = G.screens.find(s => s.open && !s.film);
    if (noFilm) return `Screen ${noFilm.id} has nothing booked. Load a print on its projector, or book one on the computer.`;
    if (poster) return `The poster outside screen ${poster.id} is wrong. Swap it (hall, beside the door).`;
    if (low >= 0 && !stocker) return `${CANDY[low].name} is sold out. There's a carton on the stockroom pallet.`;
    return `Ready? Open the front doors to start Day ${G.day}. (Office computer: book films, order stock, set prices.)`;
  }
  if (poster) return `The poster outside screen ${poster.id} is wrong. Swap it (hall, beside the door).`;
  if (low >= 0 && !stocker) return `${CANDY[low].name} is sold out. There's a carton on the stockroom pallet.`;
  return '';
}

// ------------------------------------------------------------------ interaction prompt
export function setPrompt(text, hold = 0, prog = 0) {
  const p = $('#prompt');
  if (!text) { p.style.opacity = 0; return; }
  p.style.opacity = 1;
  p.querySelector('span').innerHTML = `<kbd>E</kbd> ${esc(text)}${hold ? ' <em>(hold)</em>' : ''}`;
  p.querySelector('i').style.width = (prog * 100) + '%';
}
export function setCarry(obj, label) { UI.carryObj = obj; $('#carry').innerHTML = label ? `<b>Carrying</b>${esc(label)}<span><kbd>G</kbd> drop</span>` : ''; UI.onCarry?.(obj); }

// ------------------------------------------------------------------ registers
const BILLS = [50, 20, 10, 5, 1];
function payBlock(total, done, opts = {}) {
  const box = el('div', 'pay');
  const card = Math.random() < (G.flags.omni ? 0.75 : 0.5);
  if (card || total <= 0) {
    box.innerHTML = `<div class="paymsg">${total <= 0 ? 'Nothing to charge.' : `They tap a card for <b>${money(total)}</b>.`}</div>`;
    const b = el('button', 'big go', total <= 0 ? 'OK' : '💳 Run the card');
    b.onclick = () => done(0);
    box.appendChild(b);
    return box;
  }
  const given = [5, 10, 20, 50, 100].find(v => v >= total + (Math.random() < 0.5 ? 1 : 0)) || 100;
  const owed = given - total;
  let gave = 0;
  box.innerHTML = `<div class="paymsg">They hand you <b>${money(given)}</b> for <b>${money(total)}</b>. Count out <b>${money(owed)}</b> in change.</div><div class="till"></div><div class="changeline">Change given: <b class="cg">$0</b> of ${money(owed)}</div>`;
  const till = box.querySelector('.till');
  for (const v of BILLS) { const b = el('button', 'bill', `$${v}`); b.onclick = () => { gave += v; sfx('tick'); upd(); }; till.appendChild(b); }
  const undo = el('button', 'bill undo', 'clear'); undo.onclick = () => { gave = 0; upd(); }; till.appendChild(undo);
  const go = el('button', owed === 0 ? 'big go' : 'big', owed === 0 ? 'Exact. Close the drawer' : 'Hand over the change');
  go.onclick = () => done(gave - owed);
  box.appendChild(go);
  function upd() { const cg = box.querySelector('.cg'); cg.textContent = money(gave); cg.style.color = gave === owed ? '#7fb87a' : gave > owed ? '#ff9a7a' : ''; go.classList.toggle('go', gave === owed); }
  return box;
}

export function openPOS(kind, c) {
  if (kind === 'box') return boxPOS(c);
  return conPOS(c);
}
function face(c) { return c.type === 'hipster' ? '🧔' : c.type === 'corpo' ? '👔' : ['🙂', '😀', '🧑', '👩', '👨', '👵'][c.p.phase * 10 % 6 | 0]; }
const QTY = ['', 'One', 'Two', 'Three'];
function boxPOS(c) {
  const f = film(G.screens.find(s => s.id === c.k).film);
  const node = el('div', 'pos');
  const lines = c.type === 'hipster'
    ? [`${QTY[c.qty]} for <b>${esc(f.title)}</b>. Is it projected on actual film? I can tell, you know.`, `${QTY[c.qty]} for <b>${esc(f.title)}</b>. I saw it before it was a pun.`]
    : [`${QTY[c.qty]} for <b>${esc(f.title)}</b>, please.`, `Can I get ${QTY[c.qty].toLowerCase()} for <b>${esc(f.title)}</b>?`, `${QTY[c.qty]} adult${c.qty > 1 ? 's' : ''}, <b>${esc(f.title)}</b>.`];
  node.innerHTML = `<h2>Box office</h2><div class="cust"><div class="face">${face(c)}</div><div class="say">${lines[c.born * 7 % lines.length | 0]}</div></div>`;
  let screen = null, qty = 1;
  const pick = el('div', 'pick');
  for (const s of G.screens.filter(s => s.open && s.film)) {
    const sh = s.shows?.find(x => x.state === 'queued' || x.state === 'pending' || x.state === 'running');
    const b = el('button', 'scr', `<b>${s.id}</b> ${esc(film(s.film).title)}<small>${sh ? (sh.state === 'running' ? 'in progress' : 'next show') : 'no more shows'}</small>`);
    b.onclick = () => { screen = s.id; [...pick.children].forEach(x => x.classList.toggle('on', x === b)); upd(); };
    pick.appendChild(b);
  }
  node.appendChild(pick);
  const qrow = el('div', 'qrow', `<span>Tickets</span><button class="q">−</button><b>1</b><button class="q">+</button><span class="tot"></span>`);
  const [minus, plus] = qrow.querySelectorAll('button');
  minus.onclick = () => { qty = Math.max(1, qty - 1); upd(); };
  plus.onclick = () => { qty = Math.min(6, qty + 1); upd(); };
  node.appendChild(qrow);
  const act = el('div', 'actions');
  const print = el('button', 'big go', 'Print tickets');
  const refuse = el('button', 'big no', G.flags.finale ? 'No hipsters. Refuse.' : 'Refuse service');
  act.append(refuse, print);
  node.appendChild(act);
  const payArea = el('div');
  node.appendChild(payArea);
  function upd() { qrow.querySelector('b').textContent = qty; qrow.querySelector('.tot').textContent = `${money(qty * G.prices.ticket)}`; print.disabled = !screen; }
  upd();
  refuse.onclick = () => { closeModal(); sim.sellTicket(c, { refused: true }); };
  print.onclick = () => {
    if (!screen) return;
    tutDone('ticket');
    act.remove(); pick.style.pointerEvents = 'none'; qrow.style.pointerEvents = 'none';
    sfx('print');
    payArea.appendChild(payBlock(qty * G.prices.ticket, err => { closeModal(); sim.sellTicket(c, { screen, qty, changeErr: err }); }));
  };
  openModal(node, { cls: 'posm' });
}
function conPOS(c) {
  const node = el('div', 'pos');
  const w = c.conWants;
  node.innerHTML = `<h2>Concessions</h2><div class="cust"><div class="face">${face(c)}</div><div class="say">Can I get ${sim.orderText(w).map(esc).join(', ')}?</div></div>`;
  const sel = { popcorn: false, soda: false, candy: [] };
  const grid = el('div', 'items');
  const item = (label, stock, key, i) => {
    const b = el('button', 'item', `${label}<small>${stock} left</small>`);
    b.disabled = stock <= 0;
    b.onclick = () => {
      if (key === 'candy') { const j = sel.candy.indexOf(i); if (j >= 0) sel.candy.splice(j, 1); else sel.candy.push(i); b.classList.toggle('on', sel.candy.includes(i)); }
      else { sel[key] = !sel[key]; b.classList.toggle('on', sel[key]); }
      sfx('tick'); upd();
    };
    grid.appendChild(b);
  };
  item(`🍿 Popcorn ${money(G.prices.popcorn)}`, Math.floor(G.stock.popcorn), 'popcorn');
  item(`🥤 Soda ${money(G.prices.soda)}`, Math.floor(G.stock.soda), 'soda');
  CANDY.forEach((cd, i) => item(`${cd.icon} ${cd.name} ${money(G.prices.candy)}`, G.stock.candy[i], 'candy', i));
  node.appendChild(grid);
  const tot = el('div', 'qrow', '<span>Total</span><b class="t">$0</b>');
  node.appendChild(tot);
  let upsell = false;
  const act = el('div', 'actions');
  if (G.flags.omni) {
    const u = el('button', 'big alt', 'Upsell: make it a large (+$2)');
    u.onclick = () => { if (!sel.popcorn) return; upsell = Math.random() < 0.6; u.disabled = true; u.textContent = upsell ? 'They caved. Large it is.' : '"No thanks." (OmniPlex is watching)'; upd(); };
    act.appendChild(u);
  }
  const ring = el('button', 'big go', 'Ring it up');
  act.appendChild(ring);
  node.appendChild(act);
  const payArea = el('div'); node.appendChild(payArea);
  function total() {
    let t = 0;
    if (sel.popcorn && w.popcorn) t += G.prices.popcorn + (upsell ? 2 : 0);
    if (sel.soda && w.soda) t += G.prices.soda;
    if (w.candy !== null && sel.candy.includes(w.candy)) t += G.prices.candy;
    return t;
  }
  function upd() { tot.querySelector('.t').textContent = money(total()); }
  ring.onclick = () => {
    tutDone('snack');
    act.remove(); grid.style.pointerEvents = 'none';
    payArea.appendChild(payBlock(total(), err => { closeModal(); sim.sellConcession(c, sel, { changeErr: err, upsell }); }));
  };
  openModal(node, { cls: 'posm' });
}

// ------------------------------------------------------------------ choose film / poster
export function chooseFilm(k) {
  const s = G.screens.find(s => s.id === k);
  const ready = Object.entries(G.prints).filter(([id, p]) => (s.tier === 'digital' ? ['drive', 'ingesting', 'ingested'].includes(p.state) : p.state === 'built'));
  const node = el('div', 'menu', `<h2>Screen ${k}: load a feature</h2>`);
  if (!ready.length) node.appendChild(el('p', '', s.tier === 'digital' ? 'No DCPs on hand. Book a film on the admin computer.' : 'No made-up prints. Carry a print case to the splicing bench first, or book one on the computer.'));
  for (const [id] of ready) {
    const other = G.screens.find(o => o.film === id && o.id !== k);
    const b = el('button', 'opt', `<b>${esc(film(id).title)}</b><small>${esc(film(id).genre)} · ${film(id).reels} reels${other ? ` · now on screen ${other.id}` : ''}</small>`);
    b.onclick = () => { if (other) other.film = null; s.film = id; closeModal(); toast(`${film(id).title} loaded on screen ${k}. Hang its poster by the door.`); booth.layoutScreen(k); };
    node.appendChild(b);
  }
  node.appendChild(closeBtn());
  openModal(node);
}
export function choosePoster(k) {
  const s = G.screens.find(s => s.id === k);
  const node = el('div', 'menu', `<h2>Poster for screen ${k}</h2><p>Playing: <b>${esc(film(s.film)?.title || 'nothing')}</b>. The wrong poster halves the walk-ups.</p>`);
  const grid = el('div', 'postergrid');
  for (const id of Object.keys(G.prints)) {
    const b = el('button', 'poster');
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 180;
    try { F.paintPoster(cv.getContext('2d'), film(id), 120, 180); } catch {}
    b.appendChild(cv);
    b.appendChild(el('span', '', esc(film(id).title)));
    if (id === s.film) b.classList.add('match');
    b.onclick = () => { s.poster = id; paintPosters(); closeModal(); sfx('stock'); };
    grid.appendChild(b);
  }
  node.appendChild(grid);
  node.appendChild(closeBtn());
  openModal(node);
}
function closeBtn(label = 'Close') { const b = el('button', 'big', label); b.onclick = () => closeModal(); return b; }

// ------------------------------------------------------------------ the admin computer
let compTab = 'films';
export function openComputer() {
  const node = el('div', 'computer' + (G.flags.omni ? ' omni' : ''));
  node.innerHTML = `<div class="crt"><div class="bar"><b>${G.flags.omni ? 'OmniPlex® OS 9' : 'PAPER STREET PICTURE HOUSE — BACK OFFICE'}</b><span>${money(G.cash)}</span></div><div class="tabs"></div><div class="body"></div></div>`;
  const tabs = [['films', 'Coming soon'], ['supply', 'Supplies'], ['prices', 'Prices'], ['schedule', 'Screens'], ['staff', 'Staff'], ['upgrades', 'Expand'], ['mail', 'Mail'], ['stats', 'Books']];
  if (G.act >= 4 && !G.flags.finale) tabs.splice(6, 0, ['mayhem', 'Project Mayhem']);
  const tb = node.querySelector('.tabs');
  for (const [id, label] of tabs) { const b = el('button', id === compTab ? 'on' : '', label); b.onclick = () => { compTab = id; render(); }; tb.appendChild(b); }
  const body = node.querySelector('.body');
  function render() {
    [...tb.children].forEach((b, i) => b.classList.toggle('on', tabs[i][0] === compTab));
    node.querySelector('.bar span').textContent = money(G.cash);
    body.innerHTML = '';
    TAB[compTab](body, render);
  }
  render();
  const x = el('button', 'xbtn', 'Log off'); x.onclick = () => closeModal();
  node.querySelector('.crt').appendChild(x);
  openModal(node, { cls: 'compm' });
  if (G.flags.story.mayhem === 'pending') setTimeout(() => mayhemIntro(), 200);
}
const stars = n => '★'.repeat(Math.round(n * 5)) + '☆'.repeat(5 - Math.round(n * 5));
const TAB = {
  films(body, render) {
    body.appendChild(el('p', 'note', G.flags.omni ? 'Corporate-approved titles only. Delivered on hard drive, ingested in the booth.' : 'Prints ship overnight in a case of 35mm reels. Make them up on the splicing bench before the first show. The distributor takes a cut of every ticket.'));
    if (!G.catalog.length) body.appendChild(el('p', '', 'Nothing new this week.'));
    for (const id of G.catalog) {
      const f = film(id);
      const row = el('div', 'filmrow');
      const cv = document.createElement('canvas'); cv.width = 72; cv.height = 108;
      try { F.paintPoster(cv.getContext('2d'), f, 72, 108); } catch {}
      row.appendChild(cv);
      row.appendChild(el('div', 'fi', `<b>${esc(f.title)}</b> <small>(a pun on ${esc(f.spoof)})</small><p>${esc(f.tagline)}</p><small>${esc(f.genre)} · ${f.kind} · ${f.reels} reels · crowd ${stars(f.appeal)} · hipsters ${stars(f.hip)} · distributor keeps ${Math.round(f.cut * 100)}%</small>`));
      const b = el('button', 'buy', `Book — ${money(f.cost)}`);
      b.disabled = G.cash < f.cost;
      b.onclick = () => { const r = sim.order('film', { film: id }); if (r.ok) { toast(`${f.title} booked. It arrives tomorrow morning.`, 'good'); sfx('register'); paintSigns(); } render(); };
      row.appendChild(b);
      body.appendChild(row);
    }
    const owned = Object.entries(G.prints);
    if (owned.length) {
      body.appendChild(el('h3', '', 'Prints on hand'));
      for (const [id, p] of owned) body.appendChild(el('div', 'line', `<b>${esc(film(id).title)}</b> — ${({ shipping: 'arriving tomorrow', cans: 'in the shipping case (needs making up)', built: `made up · splice quality ${Math.round(p.quality * 100)}%`, drive: 'DCP drive (needs ingest)', ingesting: 'ingesting', ingested: 'ingested, KDM valid' })[p.state]} · novelty ${Math.round(p.fresh * 100)}%${p.mischief.length ? ` · ✂ ${p.mischief.length} single frame${p.mischief.length > 1 ? 's' : ''}` : ''}`));
    }
  },
  supply(body, render) {
    body.appendChild(el('p', 'note', 'Cartons land on the stockroom pallet tomorrow morning. While the doors are closed you can pay a little extra for a same-day rush.'));
    const row = (label, kind, extra = {}) => {
      const r = el('div', 'line buyline', `<span>${label}</span>`);
      const b = el('button', 'buy', `${money(SUPPLY[kind].cost)}`);
      b.onclick = () => { const res = sim.order(kind, extra); if (res.ok) { sfx('register'); toast('Ordered.'); } render(); };
      r.appendChild(b);
      if (G.phase === 'closed') {
        const rb = el('button', 'buy alt', `Rush ${money(SUPPLY[kind].cost + 8)}`);
        rb.onclick = () => { if (G.cash < SUPPLY[kind].cost + 8) return; G.cash -= 8; const res = sim.order(kind, { ...extra, rush: true }); if (res.ok) { sfx('register'); toast('On the pallet now.'); } else G.cash += 8; render(); };
        r.appendChild(rb);
      }
      body.appendChild(r);
    };
    CANDY.forEach((c, i) => row(`${c.icon} ${c.name} — case ${G.stock.candy[i]}/${CASE_CAP} · 24 per carton`, 'candy', { i }));
    row(`🍿 Popcorn kernels — popper ${Math.round(G.stock.popcorn)}/${POP_CAP}`, 'kernels');
    row(`🥤 Soda syrup — fountain ${Math.round(G.stock.soda)}/${SODA_CAP}`, 'syrup');
    const pend = G.orders.filter(o => !o.film).length;
    if (pend) body.appendChild(el('p', 'note', `${pend} carton${pend > 1 ? 's' : ''} arriving tomorrow.`));
  },
  prices(body, render) {
    body.appendChild(el('p', 'note', G.flags.omni ? 'Corporate floor on tickets: $13. Concessions are where the money is.' : 'Tickets mostly pay the distributor. Concessions pay the rent. Push prices too far and people stay home or skip the candy.'));
    for (const [k, label, lo, hi] of [['ticket', 'Ticket', G.flags.omni ? 13 : 3, 25], ['popcorn', 'Popcorn', 2, 15], ['soda', 'Soda', 1, 10], ['candy', 'Candy', 1, 8]]) {
      const r = el('div', 'line priceline', `<span>${label}</span><button>−</button><b>${money(G.prices[k])}</b><button>+</button><small>usual ${money(REF_PRICE[k])}</small>`);
      const [m, p] = r.querySelectorAll('button');
      m.onclick = () => { G.prices[k] = Math.max(lo, G.prices[k] - 1); paintSigns(); render(); };
      p.onclick = () => { G.prices[k] = Math.min(hi, G.prices[k] + 1); paintSigns(); render(); };
      body.appendChild(r);
    }
  },
  schedule(body, render) {
    for (const s of G.screens) {
      if (!s.open) continue;
      const r = el('div', 'line', `<span><b>Screen ${s.id}</b> · ${({ reel: '35mm changeover (2 projectors)', platter: '35mm platter', digital: 'Digital (DCP)' })[s.tier]} · ${esc(film(s.film)?.title || 'nothing booked')}</span>`);
      const b = el('button', 'buy alt', 'Change feature');
      b.disabled = !!booth.B[s.id].show;
      b.onclick = () => { closeModal(); chooseFilm(s.id); };
      r.appendChild(b);
      body.appendChild(r);
    }
    body.appendChild(el('p', 'note', 'Shows run on a fixed schedule once the doors open. Two shows per screen on your first days, three after that.'));
  },
  staff(body, render) {
    const can = G.screens.filter(s => s.open).length >= 2 || G.flags.finale;
    body.appendChild(el('p', 'note', can ? 'Wages come out at the end of each day.' : 'One screen, one Tyler. Open a second screen and you can afford help.'));
    for (const st of G.staff) {
      const r = el('div', 'line', `<span><b>${esc(st.name)}</b> — ${ROLES[st.role].label} · ${money(ROLES[st.role].wage)}/day</span>`);
      const b = el('button', 'buy no', 'Let go'); b.onclick = () => { sim.fire(st.id); render(); };
      r.appendChild(b); body.appendChild(r);
    }
    if (can) {
      body.appendChild(el('h3', '', 'Hire'));
      for (const [role, R] of Object.entries(ROLES)) {
        const r = el('div', 'line', `<span><b>${R.label}</b> · ${money(R.wage)}/day — ${esc(R.blurb)}</span>`);
        const b = el('button', 'buy', 'Hire'); b.onclick = () => { const st = sim.hire(role); toast(`${st.name} starts now.`, 'good'); render(); };
        r.appendChild(b); body.appendChild(r);
      }
    }
  },
  upgrades(body, render) {
    const nOpen = G.screens.filter(s => s.open).length;
    if (G.flags.finale) { body.appendChild(el('p', 'note', 'One screen. 35mm. No multiplex. That was the point.')); return; }
    if (nOpen < 6) {
      const cost = SCREEN_COST[nOpen + 1];
      const r = el('div', 'line', `<span><b>Open screen ${nOpen + 1}</b> — knock down the plywood, seat 48 more. Rent goes to ${money(rentPerDay(nOpen + 1))}/day.</span>`);
      const b = el('button', 'buy', money(cost)); b.disabled = G.cash < cost;
      b.onclick = () => { const res = sim.openNextScreen(cost); if (res.ok) { sfx('bell'); toast(`Screen ${res.id} is open. Load a print on its projector.`, 'good'); if (res.newAct) setTimeout(() => actTwo(), 300); } render(); };
      r.appendChild(b); body.appendChild(r);
    }
    for (const s of G.screens.filter(s => s.open)) {
      if (G.flags.omni) continue;
      if (s.tier === 'reel' && G.act >= 2) {
        const r = el('div', 'line', `<span>Screen ${s.id}: <b>platter system</b> — one projector runs the whole feature built up on a giant platter. No changeovers, no rewinding.</span>`);
        const b = el('button', 'buy', money(PLATTER_COST)); b.disabled = G.cash < PLATTER_COST;
        b.onclick = () => { const res = sim.setTier(s.id, 'platter', PLATTER_COST); if (!res.ok) toast(res.reason, 'bad'); render(); };
        r.appendChild(b); body.appendChild(r);
      }
      if (s.tier !== 'digital' && G.act >= 2) {
        const r = el('div', 'line', `<span>Screen ${s.id}: <b>digital projector</b> — hard drives, keys, automation. No film at all.</span>`);
        const b = el('button', 'buy', money(DIGITAL_COST)); b.disabled = G.cash < DIGITAL_COST;
        b.onclick = () => { const res = sim.setTier(s.id, 'digital', DIGITAL_COST); if (!res.ok) toast(res.reason, 'bad'); render(); };
        r.appendChild(b); body.appendChild(r);
      }
    }
  },
  mail(body) {
    const mails = [];
    mails.push(['Distributor', 'Your prints are rentals. Splice clean, mark your splices, ship them back in one piece. And stop splicing things into them. We know.']);
    if (G.act >= 2) mails.push(['Bank', 'Congratulations on your expansion. Please find attached your expanded loan.']);
    if (G.flags.omniPending || G.flags.omni) mails.push(['Richard Chesler, OmniPlex', 'Tyler! Love what you’ve done with the place. Let’s talk synergy. I’ll swing by.']);
    if (G.flags.omni) mails.push(['OmniPlex HR', 'Reminder: smile at the customer. Upsell the customer. You are not your khakis, but please wear the khakis.']);
    if (G.flags.finale) mails.push(['Marla', 'Saw the OmniPlex sign come down from the roof of my building. Was that you? Don’t answer that.']);
    for (const [from, text] of mails.reverse()) body.appendChild(el('div', 'mail', `<b>${esc(from)}</b><p>${esc(text)}</p>`));
  },
  mayhem(body, render) {
    body.appendChild(el('p', 'note', 'Project Mayhem. One task per night. Single frames spliced into prints count too.'));
    body.appendChild(el('div', 'meter', `<i style="width:${G.mayhem}%"></i><span>Mayhem ${Math.round(G.mayhem)}%</span>`));
    const tasks = [
      ['frame', 'Splice a single frame into the corporate ad reel', 22, 'Every audience in the building sees a rubber duck for 1/24th of a second.'],
      ['kdm', 'Lose the KDM keys for a day', 18, 'Every digital screen locks itself. Corporate sends a strongly worded fax.'],
      ['sign', 'Repaint the OmniPlex sign on the roof', 18, 'It now reads OMNIPLEX: WE ARE NOT OUR KHAKIS.'],
      ['soap', 'Swap the butter pumps for Paper Street soap', 14, 'It’s just soap. Nobody gets hurt. The popcorn smells amazing.'],
      ['rules', 'Teach the staff the rules', 20, 'They shave their heads and start wearing black.'],
      ['dumpster', 'Pull the old 35mm projector out of the dumpster', 16, 'You hide it in the booth. It still works.'],
    ];
    const tonight = G.flags.sabotage.night === G.day;
    for (const [id, label, pts, flavour] of tasks) {
      const done = G.flags.sabotage[id];
      const r = el('div', 'line', `<span><b>${label}</b> — ${done ? '<em>done</em>' : esc(flavour)}</span>`);
      const b = el('button', 'buy no', done ? '✓' : `+${pts}`);
      b.disabled = done || tonight || G.phase !== 'closed';
      b.onclick = () => {
        G.flags.sabotage[id] = true; G.flags.sabotage.night = G.day;
        sim.addMayhem(pts, label.toLowerCase());
        if (id === 'rules') { G.flags.monkeys = true; sim.restyleStaff(); }
        if (G.mayhem >= 100) { closeModal(); setTimeout(() => finaleSequence(), 300); return; }
        render();
      };
      r.appendChild(b); body.appendChild(r);
    }
    if (G.mayhem >= 100) { const b = el('button', 'big no', 'It’s time.'); b.onclick = () => { closeModal(); finaleSequence(); }; body.appendChild(b); }
  },
  stats(body) {
    const h = G.stats.history.slice(-10);
    body.appendChild(el('p', 'note', `Lifetime gross ${money(G.lifetime)} · reputation ${G.rep.toFixed(1)}/5 · cult following ${Math.round(G.cult)}${G.act >= 3 ? ` · soul ${Math.round(G.soul)}%` : ''}`));
    for (const d of h.reverse()) body.appendChild(el('div', 'line', `<span>Day ${d.day}</span><span>${d.cust} customers</span><b class="${d.net < 0 ? 'neg' : ''}">${money(d.net)}</b>`));
  },
};

// ------------------------------------------------------------------ dialogs / story
export function dialog(lines, choices = null) {
  return new Promise(res => {
    let i = 0;
    const node = el('div', 'dialog');
    const who = el('div', 'who'), txt = el('div', 'txt'), btns = el('div', 'actions');
    node.append(who, txt, btns);
    const show = () => {
      const [w, t] = lines[i];
      who.textContent = w; txt.innerHTML = t;
      btns.innerHTML = '';
      if (i < lines.length - 1) { const b = el('button', 'big go', 'Next'); b.onclick = () => { i++; show(); }; btns.appendChild(b); }
      else if (choices) for (const [label, val, cls] of choices) { const b = el('button', 'big ' + (cls || 'go'), label); b.onclick = () => { closeModal(); res(val); }; btns.appendChild(b); }
      else { const b = el('button', 'big go', 'OK'); b.onclick = () => { closeModal(); res(true); }; btns.appendChild(b); }
    };
    show();
    openModal(node, { cls: 'dlgm' });
  });
}
export async function intro() {
  await dialog([
    ['Tyler', 'Night projectionist. Paper Street Picture House. One screen, two old 35mm projectors, a candy case and a lot of opinions.'],
    ['Tyler', 'The owner left. Gave me the keys. Said "don’t burn it down." So now I run the place.'],
    ['The rules of the booth', '<ol><li>You do not talk about the booth.</li><li>You <b>do not</b> talk about the booth.</li><li>When the first cigarette burn flashes in the corner, start the other projector.</li><li>When the second one flashes, change over.</li><li>Rewind every reel. Every one.</li><li>One feature at a time.</li><li>No shirts, no shoes: still sell them a ticket.</li><li>If this is your first night at the booth, you have to change over.</li></ol>'],
    ['Tyler', 'And when a film lets out, the house is a disaster. Cups, buckets, wrappers. Nobody gets in for the next show until it’s swept. Trash goes in a bin; there’s one by every auditorium door.'],
    ['Tyler', 'WASD walks, the mouse looks, <kbd>E</kbd> uses things, <kbd>G</kbd> throws down what you’re carrying, <kbd>H</kbd> opens the projectionist’s handbook. The booth is up the stairs on the left.'],
  ]);
}
export async function actTwo() {
  await dialog([
    ['Tyler', 'Two screens. Twice the reels to thread. I can’t be at the box office and the booth at the same time.'],
    ['Tyler', 'Time to hire. The admin computer has a Staff page now. And the distributors will finally send me the big summer movies. Platter systems too: one projector, no changeovers.'],
  ]);
}
export async function omniOffer() {
  const v = await dialog([
    ['Richard Chesler', 'Tyler! Richard Chesler, OmniPlex Corp. Four screens in a building this old. I’m impressed. Genuinely.'],
    ['Richard Chesler', 'Here’s the deal. We convert every screen to digital. Free. Hard drives, servers, automation. No more threading, no more cigarette burns.'],
    ['Richard Chesler', 'You get $2,500 today. You keep running the place. We just have a few… brand standards. Tickets start at $13. Pre-show ads. Upsell every customer. No arthouse.'],
    ['Tyler', 'And the 35mm projectors?'],
    ['Richard Chesler', 'Dumpster. Do we have a deal?'],
  ], [['Take the money (convert to OmniPlex)', true, 'alt'], ['Not today', false, 'no']]);
  if (v) { sim.acceptOmni(); paintSigns(); toast('Welcome to OmniPlex. Your screens are digital now.', 'info'); }
  else { sim.declineOmni(); toast('Chesler says he’ll be back.', 'info'); }
}
async function mayhemIntro() {
  G.flags.story.mayhem = 'seen';
  closeModal();
  await dialog([
    ['Tyler', 'I used to splice the reels by hand. Now a hard drive shows up and plays itself while I sell large popcorns to people who don’t want large popcorns.'],
    ['Tyler', 'I am Tyler’s complete lack of surprise.'],
    ['Tyler', 'There’s a project. It doesn’t have a name yet. Actually it does.'],
    ['', '<b>PROJECT MAYHEM</b> has a page on the admin computer now. Fill the meter. Bring the OmniPlex down.'],
  ]);
  saveGame();
}
async function finaleSequence() {
  UI.onFinale?.(true);
  await new Promise(r => setTimeout(r, 6500));
  sim.runFinale();
  paintSigns();
  UI.onFinale?.(false);
  await dialog([
    ['Tyler', 'The OmniPlex sign came off the roof at 2 a.m. Nobody was hurt. The servers are in the dumpster. The old projector is back in the booth.'],
    ['Tyler', 'One screen. 35mm. Reel to reel. Changeovers by hand.'],
    ['Tyler', 'And a new door policy: <b>no hipsters</b>. Refuse them at the box office. They’ll survive. They’ll write about it.'],
    ['', '<b>THE END.</b> Changeover. The movie goes on and nobody in the audience has any idea.<br><br>The Paper Street Picture House stays open. Keep running it.'],
  ]);
}

// ------------------------------------------------------------------ end of day
export function summary(s) {
  const node = el('div', 'summary');
  const net = s.net + s.conNet - s.wages - s.rent;
  const q = net > 300 ? 'A good night. The projector hummed. Nobody noticed you.' : net > 0 ? 'You made rent. Barely. Tomorrow you make rent again.' : 'In the red. Self-improvement is masturbation. Self-destruction might be the answer. Or more candy.';
  node.innerHTML = `<h2>Day ${s.day} — lights up</h2>
    <div class="grid">
      <span>Customers</span><b>${s.cust}</b>
      <span>Tickets sold</span><b>${s.tickets}</b>
      <span>Box office (after the distributor)</span><b>${money(s.net)}</b>
      <span>Concessions (after cost)</span><b>${money(s.conNet)}</b>
      <span>Wages</span><b>-${money(s.wages)}</b>
      <span>Rent &amp; power</span><b>-${money(s.rent)}</b>
      <span>Net</span><b class="${net < 0 ? 'neg' : 'gain'}">${money(net)}</b>
      <span>Clean changeovers / flubs</span><b>${s.clean} / ${s.flubs}</b>
      <span>Walk-outs, refunds</span><b>${s.lost}, ${money(s.refunds)}</b>
      ${s.hipRefused ? `<span>Hipsters turned away</span><b>${s.hipRefused}</b>` : ''}
      <span>Reputation</span><b>${'★'.repeat(Math.round(s.rep))}${'☆'.repeat(5 - Math.round(s.rep))}</b>
    </div><p class="quote">${q}</p>`;
  const b = el('button', 'big go', 'Night shift: computer, deliveries, prep');
  b.onclick = () => closeModal();
  node.appendChild(b);
  openModal(node, { cls: 'summ' });
  paintSigns();
}

// ------------------------------------------------------------------ handbook
export function handbook() {
  const node = el('div', 'menu handbook');
  node.innerHTML = `<h2>The projectionist’s handbook</h2>
  <h3>The print</h3><p>A feature ships in a case as several reels of 35mm, about 2,000 feet each: roughly twenty minutes at 24 frames a second, 16 frames to the foot. Every reel starts with a <b>head leader</b> (START mark, a countdown from 8, the "2" frame, black) and ends with a <b>tail leader</b>.</p>
  <h3>Making up a print (the splicing bench)</h3><p>Cut the tail leader off reel 1 exactly on the frame line after the last picture frame. Cut the head leader off reel 2 on the frame line before its first picture frame. Seat both ends on the splicer’s registration pins so the sprocket holes line up, lay tape across the join, pull the handle to trim and punch the perforations, flip the film and tape the base side. Mark the splice on the edge so you can find it again when the print goes back. Consecutive frames of a shot are nearly identical, so a clean splice is invisible.</p>
  <h3>Threading</h3><p>Feed reel → upper sprocket → upper loop → the gate (aperture and pressure plate) → intermittent sprocket → lower loop → sound head → lower sprocket → take-up reel. Lose a loop and the picture jumps.</p>
  <h3>Changeovers</h3><p>Two projectors, alternating reels. Near the end of each reel, two <b>cue marks</b> (the "cigarette burns") flash in the upper-right corner of the picture. The first, the <b>motor cue</b>, means start the motor on the incoming projector: its leader has to run down to the first frame. The second, the <b>changeover cue</b>, means switch: the douser closes on one machine and opens on the other. Too early on the motor and the countdown hits the screen. Too late on the changeover and the audience gets a white screen.</p>
  <p>Here: <kbd>E</kbd> on a projector does whatever it needs next. In the booth, <kbd>Q</kbd> starts the incoming motor and <kbd>Space</kbd> changes over on the nearest screen. Rewind every played reel before you thread the next one.</p>
  <h3>Between shows</h3><p>When the lights come up the house is a mess. Hold <kbd>E</kbd> on each piece of trash to bag it (24 to a bag) and empty the bag in a bin. The next audience waits in the hall until the auditorium is clean, and the show can’t start until it is. An usher does this for you.</p>
  <h3>Platters and digital</h3><p>A <b>platter</b> holds the whole feature built up into one enormous horizontal reel, so one projector runs the show with no changeovers. <b>Digital</b> features arrive as a DCP on a hard drive, get ingested into the server, and only play inside the window of their key (KDM). The booth goes quiet.</p>`;
  node.appendChild(closeBtn());
  openModal(node);
}

// ------------------------------------------------------------------ splice
export function openSplice(filmId, mode = 'buildup', done) {
  if (!Splice) { toast('The splicer is jammed (splice.js failed to load).', 'bad'); return; }
  const root = $('#spliceRoot');
  root.style.display = 'block';
  UI.splicing = true;
  UI.onModalChange?.(true);
  const f = film(filmId);
  try {
    Splice.openSplice(root, {
      film: f, mode, reel: 1 + Math.floor(Math.random() * f.reels), allowMischief: true,
      onDone: res => {
        root.style.display = 'none'; root.innerHTML = '';
        UI.splicing = false; UI.onModalChange?.(false);
        if (mode === 'buildup') sim.finishBuildUp(filmId, res);
        done?.(res);
      },
    });
  } catch (e) {
    console.error(e);
    root.style.display = 'none'; UI.splicing = false; UI.onModalChange?.(false);
    toast('The splicer jammed.', 'bad');
  }
}

// ------------------------------------------------------------------ signage
export function paintPosters() {
  for (const s of G.screens) {
    paintSign(`poster_${s.id}`, 240, 360, (g, w, h) => {
      if (s.open && s.poster) { try { F.paintPoster(g, film(s.poster), w, h); } catch { g.fillStyle = '#333'; g.fillRect(0, 0, w, h); } }
      else { g.fillStyle = '#0d0b0a'; g.fillRect(0, 0, w, h); decoText(g, s.open ? 'NO POSTER' : '', w / 2, h / 2, 24, '#7a6a50'); }
    });
    paintSign(`screen_no_${s.id}`, 128, 76, (g, w, h) => { g.fillStyle = '#120a06'; g.fillRect(0, 0, w, h); decoText(g, String(s.id), w / 2, h / 2 + 2, 56, s.open ? '#ffcf6a' : '#3a2a1a', { glow: s.open ? '#ff9a2a' : null }); });
    paintSign(`soon_sign_${s.id}`, 256, 128, (g, w, h) => { g.fillStyle = '#c9a26a'; g.fillRect(0, 0, w, h); decoText(g, G.flags.finale ? 'CLOSED' : 'COMING SOON', w / 2, h / 2, 34, '#3a1a08', { font: 'Impact, sans-serif', weight: 'normal' }); });
  }
  const soon = Object.entries(G.prints).filter(([id, p]) => !G.screens.some(s => s.film === id)).map(([id]) => id);
  ['coming_soon', 'coming_soon_2'].forEach((nm, i) => paintSign(nm, 240, 360, (g, w, h) => {
    const id = soon[i];
    if (id) { try { F.paintPoster(g, film(id), w, h); } catch {} g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, h - 34, w, 34); decoText(g, 'COMING SOON', w / 2, h - 17, 20, '#ffd27a'); }
    else { g.fillStyle = '#0d0b0a'; g.fillRect(0, 0, w, h); decoText(g, 'COMING', w / 2, h / 2 - 16, 30, '#6a5a40'); decoText(g, 'SOON', w / 2, h / 2 + 18, 30, '#6a5a40'); }
  }));
}
export function paintSigns() {
  const omni = G.flags.omni;
  const titles = G.screens.filter(s => s.open && s.film).map(s => film(s.film).title.toUpperCase());
  if (W.omni !== !!G.flags.omni) { W.omni = !!G.flags.omni; P.sodaLabel?.(); }
  renderJobs();
  paintSign('marquee_panel', 1024, 114, (g, w, h) => {
    g.fillStyle = '#f5ecd6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1410';
    const line1 = omni ? 'OMNIPLEX® 6 — NOW SHOWING' : G.flags.finale ? 'PAPER ST PICTURE HOUSE — 35MM ONLY — NO HIPSTERS' : 'PAPER STREET PICTURE HOUSE';
    decoText(g, line1, w / 2, 30, 30, omni ? '#1d4fb8' : '#8a1a12', { font: '"Arial Black", Impact, sans-serif', weight: 'normal' });
    let line2 = titles.join('  •  ') || 'DARK TONIGHT';
    let size = 40; g.font = `normal ${size}px Impact, sans-serif`;
    while (g.measureText(line2).width > w - 40 && size > 18) { size -= 2; g.font = `normal ${size}px Impact, sans-serif`; }
    decoText(g, line2, w / 2, 78, size, '#1a1410', { font: 'Impact, sans-serif', weight: 'normal' });
  });
  for (const side of ['marquee_side_l', 'marquee_side_r']) paintSign(side, 256, 128, (g, w, h) => { g.fillStyle = '#f5ecd6'; g.fillRect(0, 0, w, h); decoText(g, omni ? 'OMNI' : 'PAPER ST', w / 2, h / 2, 46, omni ? '#1d4fb8' : '#8a1a12', { font: 'Impact, sans-serif', weight: 'normal' }); });
  for (const side of ['blade_l', 'blade_r']) paintSign(side, 128, 448, (g, w, h) => {
    g.fillStyle = omni ? '#0f2a66' : '#2a0c08'; g.fillRect(0, 0, w, h);
    const word = omni ? 'OMNI' : 'PAPER';
    [...word].forEach((ch, i) => decoText(g, ch, w / 2, 50 + i * (h - 80) / (word.length - 1 || 1), 64, omni ? '#9fc6ff' : '#ffcf6a', { font: 'Impact, sans-serif', weight: 'normal', glow: omni ? '#4a8aff' : '#ff8a2a' }));
  });
  paintSign('sign_tickets', 512, 120, (g, w, h) => { g.fillStyle = '#1b0d07'; g.fillRect(0, 0, w, h); decoText(g, omni ? 'GUEST SERVICES' : 'TICKETS', w / 2, h / 2, 64, '#ffd27a', { glow: '#ff9a2a' }); });
  paintSign('sign_concessions', 640, 120, (g, w, h) => { g.fillStyle = '#1b0d07'; g.fillRect(0, 0, w, h); decoText(g, omni ? 'OMNI SNACK ZONE®' : 'CONCESSIONS', w / 2, h / 2, 62, omni ? '#9fc6ff' : '#ff6a5a', { glow: omni ? '#4a8aff' : '#ff2a1a', font: 'Georgia, serif' }); });
  paintSign('menu_board', 640, 196, (g, w, h) => {
    g.fillStyle = '#121010'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9963a'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    const p = G.prices;
    const rows = [['POPCORN', p.popcorn], ['SODA', p.soda], ['CANDY', p.candy], ['ADMISSION', p.ticket]];
    rows.forEach(([n, v], i) => { decoText(g, n, 40, 34 + i * 42, 30, '#f5ecd6', { align: 'left', font: '"Courier New", monospace' }); decoText(g, money(v), w - 40, 34 + i * 42, 30, '#ffd27a', { align: 'right', font: '"Courier New", monospace' }); });
  });
  paintSign('sign_theatres', 512, 90, (g, w, h) => { g.fillStyle = '#1b0d07'; g.fillRect(0, 0, w, h); decoText(g, 'THEATRES ← →', w / 2, h / 2, 46, '#ffd27a', { glow: '#ff9a2a' }); });
  paintSign('sign_booth', 256, 160, (g, w, h) => { g.fillStyle = '#e9e2d0'; g.fillRect(0, 0, w, h); g.fillStyle = '#b01818'; g.fillRect(0, 0, w, 44); decoText(g, 'PROJECTION BOOTH', w / 2, 23, 24, '#fff', { font: 'Arial, sans-serif' }); decoText(g, 'AUTHORIZED', w / 2, 80, 26, '#222', { font: 'Arial, sans-serif' }); decoText(g, 'PERSONNEL ONLY', w / 2, 116, 26, '#222', { font: 'Arial, sans-serif' }); });
  paintSign('sign_rules', 256, 340, (g, w, h) => {
    g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h);
    decoText(g, 'RULES OF THE BOOTH', w / 2, 26, 20, '#8a1a12', { font: 'Georgia, serif' });
    const r = ['1. Don’t talk about the booth.', '2. DON’T talk about the booth.', '3. 1st burn: start the motor.', '4. 2nd burn: change over.', '5. Rewind every reel.', '6. One feature at a time.', '7. Mark your splices.', '8. First night? You change over.'];
    r.forEach((t, i) => decoText(g, t, 16, 62 + i * 34, 15, '#222', { align: 'left', font: 'Georgia, serif', weight: 'normal' }));
  });
  paintSign('sign_office', 256, 90, (g, w, h) => { g.fillStyle = '#1b0d07'; g.fillRect(0, 0, w, h); decoText(g, 'OFFICE', w / 2, h / 2, 46, '#e9c27a'); });
  paintSign('sign_stock', 256, 90, (g, w, h) => { g.fillStyle = '#1b0d07'; g.fillRect(0, 0, w, h); decoText(g, 'STOCK ROOM', w / 2, h / 2, 40, '#e9c27a'); });
  paintPosters();
}

export { sfx };
export { finaleSequence, mayhemIntro };
