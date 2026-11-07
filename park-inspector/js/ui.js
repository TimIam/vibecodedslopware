// DOM side: the clipboard sheet, finding cards, code book, charts, briefing / report overlays.
import { CODE, SECTION, VERDICT_LABEL, COST, RANKS } from './code.js';
import { INFO } from './gen.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const ICON = { coaster: '🎢', ferris: '🎡', drop: '🗼', swing: '🎠', pirate: '🏴‍☠️', food: '🌭', firstaid: '⛑️' };
export const fmtTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

export function hud(G) {
  $('hud').classList.remove('hide');
  $('clockT').textContent = fmtTime(G.time);
  const left = COST.shiftEnd - G.time;
  $('clockLeft').textContent = left > 0 ? `${Math.floor(left / 60)} h ${Math.round(left % 60)} m left` : 'overtime';
  $('clockBar').style.width = `${Math.min(100, (G.time - COST.shiftStart) / (COST.shiftEnd - COST.shiftStart) * 100)}%`;
  $('clock').classList.toggle('late', left < 60);
  $('pName').textContent = G.park.name;
  $('pSub').textContent = `${G.park.pretty} · Day ${G.park.day} · ${Object.keys(G.verdicts).length}/${G.park.targets.length} stamped`;
}

function statusChip(G, tg) {
  const v = G.verdicts[tg.id];
  if (v) return `<span class="chip ${v}">${VERDICT_LABEL[v]}</span>`;
  const n = tg.findings.filter(f => G.seen.has(f.id)).length;
  return n ? `<span class="chip seen">${n} checked</span>` : '<span class="chip">not visited</span>';
}

export function sheetOverview(G, act) {
  $('sheet').classList.remove('hide');
  $('sheetHead').innerHTML = `<div class="kicker">FASA field sheet · Day ${G.park.day}</div><h2>${esc(G.park.name)}</h2>
    <div class="sub">Owner: ${esc(G.park.owner)} · ${G.park.targets.length} targets</div>`;
  const rows = G.park.targets.map((tg, i) => `<div class="row" data-i="${i}"><div class="ic">${ICON[tg.type]}</div>
    <div class="t"><b>${esc(tg.name)}</b><span>${INFO[tg.type].label}</span></div>${statusChip(G, tg)}</div>`).join('');
  $('sheetBody').innerHTML = `<div class="sec">Targets</div>${rows}
    <div class="hint">Click a ride in the park or in this list to walk there. Walking costs about a minute per 45 m.</div>
    <div class="sec">Desk</div>
    <div class="actions"><button class="btn" id="bBook">📕 Code book <kbd>B</kbd></button><button class="btn" id="bBrief">📨 Briefing</button></div>
    <div class="actions" style="margin-top:6px"><button class="btn primary" id="bEnd" style="grid-column:1/3">Clock out and file report</button></div>`;
  $('sheetBody').querySelectorAll('.row').forEach(el => el.onclick = () => act.walk(+el.dataset.i));
  $('bBook').onclick = () => act.book();
  $('bBrief').onclick = () => act.brief();
  $('bEnd').onclick = () => act.endShift();
}

export function sheetTarget(G, r, act) {
  const tg = r.tg;
  const pts = tg.findings.filter(f => f.group === 'point');
  const paper = tg.findings.find(f => f.group === 'paper'), test = tg.findings.find(f => f.group === 'test');
  const st = f => G.marks[f.id] || (G.seen.has(f.id) ? 'seen' : '');
  const lab = f => ({ ok: 'OK', bad: 'Violation', seen: 'Examined', '': '' })[st(f)];
  const sp = tg.spec;
  const specLine = tg.kind === 'ride' ? `${esc(sp.maker)} · built ${sp.year}` : (tg.type === 'food' ? 'Food service' : 'Guest services');
  $('sheetHead').innerHTML = `<div class="back" id="bBack">← Park overview <kbd>Esc</kbd></div><div class="kicker">${ICON[tg.type]} ${INFO[tg.type].label}</div>
    <h2>${esc(tg.name)}</h2><div class="sub">${specLine}</div>`;
  const pdone = G.seen.has(paper.id), tdone = test && G.seen.has(test.id);
  $('sheetBody').innerHTML = `<div class="sec">Records and tests</div>
    <div class="actions">
      <button class="btn ${pdone ? 'done' : ''}" id="bPaper">📋 Paperwork ${pdone ? `<span class="chip ${st(paper)}">${lab(paper)}</span>` : `<small>${COST.paper} min</small>`}</button>
      ${test ? `<button class="btn ${tdone ? 'done' : ''}" id="bTest">🧪 Test run ${tdone ? `<span class="chip ${st(test)}">${lab(test)}</span>` : `<small>${COST.test} min</small>`}</button>` : '<div></div>'}
    </div>
    <div class="sec">Inspection points · ${COST.examine} min each</div>
    ${pts.map(f => `<div class="pt" data-f="${f.id}"><div class="n ${st(f)}">${st(f) === 'ok' ? '✓' : st(f) === 'bad' ? '✕' : f.n}</div><div class="l">${esc(f.label)}</div>${st(f) ? `<span class="chip ${st(f)}">${lab(f)}</span>` : ''}</div>`).join('')}
    <div class="sec">Verdict</div>
    <div class="verdicts">${['approve', 'cite', 'redtag'].map(v => `<button class="vbtn ${v} ${G.verdicts[tg.id] === v ? 'sel' : ''}" data-v="${v}">${VERDICT_LABEL[v]}</button>`).join('')}</div>
    <div class="hint">Any major defect: Red Tag (closed). Minor only: Cite (fix order, stays open). None: Approve. Markers show where to look; drag to orbit, scroll to zoom.</div>`;
  $('bBack').onclick = () => act.leave();
  $('bPaper').onclick = () => act.paper();
  if (test) $('bTest').onclick = () => act.test();
  $('sheetBody').querySelectorAll('.pt').forEach(el => el.onclick = () => act.examine(el.dataset.f));
  $('sheetBody').querySelectorAll('.vbtn').forEach(el => el.onclick = () => act.verdict(el.dataset.v));
}

export function card(G, f, act, opts = {}) {
  const el = $('card');
  el.classList.remove('hide');
  const mk = G.marks[f.id];
  const form = f.group === 'test' ? 'FASA 27-T · Dynamic test' : f.group === 'paper' ? 'FASA 27-R · Records review' : 'FASA 27-B · Point inspection';
  el.innerHTML = `<div class="clip"></div><div class="in"><button class="x" id="cX" aria-label="Close">×</button>
    <div class="form"><span>${form}</span><span>${fmtTime(G.time)}</span></div>
    <h3>${esc(f.label)}</h3>
    ${f.trace ? '<canvas id="chart" width="728" height="380"></canvas>' : ''}
    <ul id="cLines">${opts.running ? '<li>Test cycle running…</li>' : f.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="mark ${opts.running ? 'hide' : ''}"><button class="ok ${mk === 'ok' ? 'sel' : ''}" data-m="ok">✓ Within code</button><button class="bad ${mk === 'bad' ? 'sel' : ''}" data-m="bad">✕ Violation</button></div>
    <div class="foot"><a id="cBook">Open code book (B)</a>${opts.running ? '<a id="cSkip">Skip to end</a>' : `<span>${f.group === 'point' ? `Point ${f.n}` : ''}</span>`}</div></div>`;
  $('cX').onclick = () => act.closeCard();
  $('cBook').onclick = () => act.book();
  if (opts.running) $('cSkip').onclick = () => act.skipTest();
  el.querySelectorAll('.mark button').forEach(b => b.onclick = () => act.mark(f.id, b.dataset.m));
  if (f.trace) drawChart($('chart'), f.trace, opts.running ? 0 : 1);
}
export function hideCard() { $('card').classList.add('hide'); }

export function drawChart(cv, tr, p) {
  if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#121722'; g.fillRect(0, 0, W, H);
  const L = 54, R = 12, T = 30, B = 34;
  const series = tr.series;
  // each series gets its own y-scale, drawn as two stacked bands
  const band = (H - T - B) / series.length;
  const tMax = tr.t[tr.t.length - 1] || 1;
  const n = Math.max(2, Math.floor(tr.t.length * p));
  series.forEach((s, k) => {
    const y0 = T + band * k, y1 = y0 + band - 14;
    let lo = Math.min(...s.data, ...s.lines), hi = Math.max(...s.data, ...s.lines);
    const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
    const Y = v => y1 - (v - lo) / (hi - lo) * (y1 - y0);
    const X = t => L + t / tMax * (W - L - R);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    const step = niceStep((hi - lo) / 4);
    g.font = '600 15px "IBM Plex Mono", monospace'; g.fillStyle = '#7f8ba0'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(fmtN(v), L - 6, Y(v)); }
    for (const [i, v] of s.lines.entries()) {
      const major = Math.abs(v) === Math.max(...s.lines.map(Math.abs).filter(a => Math.sign(a) === Math.sign(v) || true));
      g.setLineDash([8, 6]); g.strokeStyle = i % 2 === 0 && s.lines.length > 2 ? 'rgba(255,178,62,.8)' : 'rgba(255,90,80,.85)';
      if (s.lines.length <= 2) g.strokeStyle = 'rgba(255,90,80,.85)';
      g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.setLineDash([]);
      g.fillStyle = g.strokeStyle; g.textAlign = 'left'; g.fillText(fmtN(v), W - R - 52, Y(v) - 10);
    }
    g.strokeStyle = s.color; g.lineWidth = 2.6; g.beginPath();
    for (let i = 0; i < n; i++) { const x = X(tr.t[i]), y = Y(s.data[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    if (p < 1 && n > 1) { g.fillStyle = s.color; g.beginPath(); g.arc(X(tr.t[n - 1]), Y(s.data[n - 1]), 5, 0, 7); g.fill(); }
    g.fillStyle = s.color; g.textAlign = 'left'; g.font = '700 16px "Barlow Condensed", sans-serif';
    g.fillText(s.name.toUpperCase(), L + 6, y0 - 4);
  });
  g.fillStyle = '#7f8ba0'; g.textAlign = 'center'; g.font = '600 14px "IBM Plex Mono", monospace';
  for (let t = 0; t <= tMax; t += niceStep(tMax / 6)) g.fillText(`${Math.round(t)}s`, L + t / tMax * (W - L - R), H - 14);
}
function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))); const m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function fmtN(v) { return Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2); }

export function book(open, highlight = null) {
  const el = $('book');
  if (!open) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  el.innerHTML = `<div class="pg"><button class="close" id="bkX">Close · Esc</button><div class="meta">49 FASA · Amusement Ride and Park Safety Standard · rev. 2027</div>
    <h2>Inspector's Code Book</h2><div class="cols">${CODE.map(c => `<div class="ch"><h4>${c.ch}</h4>${c.items.map(i => `<div class="it ${highlight?.includes(i.id) ? 'hl' : ''}"><b>${i.id}</b><span><u>${i.t}.</u> ${i.x}</span></div>`).join('')}</div>`).join('')}</div>
    <div class="meta" style="margin-top:14px">Verdict: any major defect → Red Tag · minor defects only → Cite · none → Approve</div></div>`;
  $('bkX').onclick = () => book(false);
  el.onclick = e => { if (e.target === el) book(false); };
}

export function overlay(html) {
  const el = $('ov');
  if (!html) { el.classList.add('hide'); el.innerHTML = ''; return el; }
  el.classList.remove('hide'); el.innerHTML = html; return el;
}

export function titleHtml(C) {
  const rank = RANKS[Math.min(RANKS.length - 1, C.rank || 0)];
  return `<div class="panel"><div class="logo"><div class="tag">RED<br>TAG</div><div><h1>PARK <span>INSPECTOR</span></h1>
    <div class="cond" style="font-size:18px;color:var(--dim);letter-spacing:.1em">FEDERAL AMUSEMENT SAFETY ADMINISTRATION · FIELD DIVISION</div></div></div>
    <p class="lede">Somebody else designed these parks. Somebody else built them, cheaply. You're the one with the clipboard.
    Walk each park, examine the rides, read the paperwork, run test cycles with crash dummies, and decide what opens tomorrow.</p>
    <div class="grid2">
      <div class="box"><h4>How a shift works</h4><ul>
        <li>08:00 to 17:00. Walking, examining (${COST.examine} min), paperwork (${COST.paper} min) and test runs (${COST.test} min) all cost time.</li>
        <li>Findings are raw numbers. Compare them to the <b>code book</b> (<kbd>B</kbd>) and mark each one.</li>
        <li>Stamp every ride: <b>Approve</b>, <b>Cite</b> or <b>Red Tag</b>. Unstamped rides open as approved.</li></ul></div>
      <div class="box"><h4>Your file</h4><ul>
        <li>${rank}</li>
        <li>Shifts worked: ${C.day - 1} · Career score: ${C.score}</li>
        <li>Incidents on your watch: ${C.incidents} of 3</li>
        ${C.bribes ? `<li>"Gifts" accepted: ${C.bribes}</li>` : ''}</ul></div>
    </div>
    <div class="box" style="margin-top:12px"><h4>Controls</h4><p>Drag to orbit · right-drag or two fingers to pan · scroll to zoom · click a ride to walk there · click a marker to examine · <kbd>Esc</kbd> back · <kbd>B</kbd> code book</p></div>
    <div class="cta"><button class="btn primary" id="tStart">${C.day > 1 ? `Report for duty · Day ${C.day}` : 'Report for duty'}</button>
    ${C.day > 1 || C.incidents ? '<button class="btn" id="tNew">New career</button>' : ''}<span class="hint">Every park is generated from a seed; nobody has seen this one before.</span></div></div>`;
}

export function briefHtml(G) {
  const p = G.park;
  return `<div class="panel" style="background:none;border:none;box-shadow:none;padding:0"><div class="memo">
    <div class="hdr"><b>TO</b><span>Field Inspector, Region 4</span><b>FROM</b><span>Regional Office</span><b>DATE</b><span>${p.pretty}</span><b>RE</b><span>Annual inspection: ${esc(p.name)}</span></div>
    <h3>Today: ${esc(p.name)}</h3>
    <div>Owner on site: <b>${esc(p.owner)}</b>. <span class="q">"${esc(p.quote)}"</span></div>
    <div style="margin-top:8px"><b>On the schedule:</b><ul>${p.targets.map(t => `<li>${ICON[t.type]} ${esc(t.name)} (${INFO[t.type].label.toLowerCase()})</li>`).join('')}</ul></div>
    ${p.briefing.length ? `<div><b>Complaints and tips on file:</b><ul>${p.briefing.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>` : '<div><b>Complaints on file:</b> none. Suspicious.</div>'}
    <div style="margin-top:8px;font-size:13px">Clock runs 08:00–17:00. Anything you don't stamp opens tomorrow as approved, and it's your signature.</div>
    <div class="cta"><button class="btn primary" id="bIn" style="background:#1d2a44;color:#fff">Clock in</button></div></div></div>`;
}

export function reportHtml(G, rep) {
  const p = G.park;
  const rows = rep.rows.map(r => `<tr><td>${ICON[r.tg.type]} <b>${esc(r.tg.name)}</b><div style="font-size:12px;color:#6d6450">${r.notes.map(esc).join('<br>')}</div></td>
    <td><span class="stamp" style="font-size:13px;color:${r.v === 'redtag' ? '#b3261e' : r.v === 'cite' ? '#a86a10' : '#1e6a43'}">${VERDICT_LABEL[r.v]}</span>${r.auto ? '<div style="font-size:11px;color:#6d6450">(not stamped)</div>' : ''}</td>
    <td><span class="stamp" style="font-size:13px;color:${r.truth === 'redtag' ? '#b3261e' : r.truth === 'cite' ? '#a86a10' : '#1e6a43'}">${VERDICT_LABEL[r.truth]}</span></td>
    <td class="pts ${r.pts >= 0 ? 'pos' : 'neg'}">${r.pts >= 0 ? '+' : ''}${r.pts}</td></tr>`).join('');
  const news = rep.headlines.length ? `<div class="news"><div class="mast">THE ${esc(p.name.split(' ')[0].toUpperCase().replace(/'S$/, ''))} COUNTY GAZETTE</div>
    ${rep.headlines.map(h => `<div class="hl">${esc(h)}</div><div class="by">Federal inspector had approved the ride the day before.</div>`).join('')}</div>` : `<div class="news"><div class="mast">THE COUNTY GAZETTE</div><div class="hl">Nothing happened at ${esc(p.name)} today</div><div class="by">Local inspector credited, briefly.</div></div>`;
  return `<div class="panel" style="background:none;border:none;box-shadow:none;padding:0;width:min(860px,96vw)"><div class="memo">
    <div class="hdr"><b>FORM</b><span>FASA 31 · Shift report</span><b>PARK</b><span>${esc(p.name)}</span><b>DATE</b><span>${p.pretty} · clocked out ${rep.out}</span></div>
    <table class="rep"><thead><tr><th>Target</th><th>Your verdict</th><th>Should be</th><th style="text-align:right">Points</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="display:flex;justify-content:space-between;margin-top:10px;font:600 14px 'IBM Plex Mono'"><span>${rep.extra.map(esc).join(' · ')}</span><span class="${rep.total >= 0 ? 'pos' : 'neg'}">Shift total ${rep.total >= 0 ? '+' : ''}${rep.total}</span></div>
    ${news}
    ${rep.fired ? `<h3 style="color:#b3261e;margin-top:14px">You're fired.</h3><div>${esc(rep.fired)}</div>` : rep.promo ? `<h3 style="margin-top:14px">Promoted: ${esc(rep.promo)}</h3>` : ''}
    <div class="cta"><button class="btn primary" id="rNext" style="background:#1d2a44;color:#fff">${rep.fired ? 'Start a new career' : 'Next park'}</button><button class="btn" id="rReview" style="color:#2c281f;border-color:#2c281f">Review this park</button></div></div></div>`;
}

export function bribeHtml(G, tg, amount) {
  return `<div class="panel" style="background:none;border:none;box-shadow:none;padding:0;width:min(520px,94vw)"><div class="memo">
    <h3>${esc(G.park.owner)} would like a word</h3>
    <div class="q">"Red tag? On ${esc(tg.name)}? Come on. That ride's older than you are and it's fine. Look, I found this envelope, I think it's yours."</div>
    <div>The envelope has <b>$${amount}</b> in it and the word "THANKS" in crayon.</div>
    <div class="cta"><button class="btn primary" id="bbNo" style="background:#1d2a44;color:#fff">Refuse it, keep the red tag</button><button class="btn" id="bbYes" style="color:#2c281f;border-color:#2c281f">Take it, change to Approve</button></div></div></div>`;
}

let toastT = 0;
export function toast(msg, ms = 2200) {
  const el = $('toast'); el.textContent = msg; el.style.opacity = 1;
  clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, ms);
}
export function stampFx(v) {
  const el = $('stampFx');
  el.textContent = v === 'redtag' ? 'RED TAG' : v === 'cite' ? 'CITED' : 'APPROVED';
  el.style.color = v === 'redtag' ? '#ff4b3a' : v === 'cite' ? '#ffb23e' : '#4fd18b';
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
}
export function tip(html, x, y) {
  const el = $('tip');
  if (!html) { el.classList.add('hide'); return; }
  el.classList.remove('hide'); el.innerHTML = html; el.style.left = x + 'px'; el.style.top = y + 'px';
}
export function sectionText(code) { return String(code).split(', ').map(c => SECTION[c] ? `§${c} ${SECTION[c].t}` : c).join(', '); }
