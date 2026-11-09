// Everything drawn in HTML. Two voices throughout: yours (serif, calm) and theirs (stencil, capitals, certain).

import * as THREE from 'three';
import { S, clamp, saveGame, wipeSave, xpNeed, hasSkill, MAX_LEVEL } from './state.js';
import { SPEAKERS, DESIGNATIONS, DEBRIEFS, ENDINGS, LOGS, INTRO } from './data.js';
import { MISSIONS } from './missions.js';
import { P, SKILLS, recompute } from './player.js';
import { sfx, initAudio, setVolume, setCombat } from './audio.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
export const on = {};   // main.js fills in: startMission(i), lock(), bloom(bool), preview()

let dlg = null, typer = null, tab = 'out', sel = 0, hitT = 0, hintT = 0, logT = 0, introT = 0, tgtT = 0, deathCb = null, boss = null;
const dmgT = [0, 0, 0], marks = [];
const v = new THREE.Vector3(), f = new THREE.Vector3();

function show(id, yes = true) { $(id).classList.toggle('on', yes); }
function playing(yes) { document.body.classList.toggle('playing', yes); }

export function initUI() {
  for (let i = 0; i < 16; i++) { const m = el('i'); $('marks').appendChild(m); marks.push(m); }
  $('btnStart').onclick = () => {
    initAudio(); sfx('ui');
    if (!S.save.seenIntro) showDialog(INTRO, () => { S.save.seenIntro = true; saveGame(); showConclave(); });
    else showConclave();
  };
  $('btnWipe').onclick = () => { if (confirm('Forget everything and start again from the first note?')) { wipeSave(); recompute(); showTitle(); } };
  $('btnToTitle').onclick = () => { sfx('uiBack'); showTitle(); };
  $('btnUp').onclick = () => { if (!deathCb) return; show('death', false); const cb = deathCb; deathCb = null; cb(); on.lock(); };
  $('pause').onclick = e => { if (e.target.id === 'btnQuit') { show('pause', false); S.paused = false; setCombat(0); showConclave(); } else on.lock(); };
  $('dbox').onclick = e => { if (!e.target.closest('.ch')) advance(); };
  addEventListener('keydown', e => {
    if (S.mode === 'dialog' && (e.code === 'Space' || e.code === 'Enter') && dlg && !dlg.cur?.choices) { e.preventDefault(); advance(); }
    if (S.mode === 'dialog' && dlg?.cur?.choices && /^Digit[1-9]$/.test(e.code)) { const b = $('dbox').querySelectorAll('.ch button')[+e.code.slice(5) - 1]; b?.click(); }
    if (S.mode === 'dead' && (e.code === 'Space' || e.code === 'Enter')) $('btnUp').click();
  });
  showTitle();
}

// ------------------------------------------------------------------ title and Conclave
export function showTitle() {
  S.mode = 'title'; playing(false);
  for (const id of ['conclave', 'debrief', 'death', 'pause', 'dialog']) show(id, false);
  show('title');
  const started = S.save.seenIntro;
  $('btnStart').textContent = started ? 'Back to the Conclave' : 'Go and ask them to leave';
  $('btnWipe').style.display = started ? '' : 'none';
  on.preview?.();
}

export function showConclave() {
  S.mode = 'conclave'; playing(false);
  for (const id of ['title', 'debrief', 'death', 'pause', 'dialog']) show(id, false);
  show('conclave');
  if (document.pointerLockElement) document.exitPointerLock();
  const next = MISSIONS.findIndex((m, i) => !S.save.done.includes(i));
  sel = next < 0 ? MISSIONS.length - 1 : next;
  on.preview?.();
  drawConclave();
}

function drawConclave() {
  const sv = S.save;
  $('cLevel').textContent = sv.level;
  $('cXp').style.width = (sv.level >= MAX_LEVEL ? 100 : 100 * sv.xp / xpNeed(sv.level)) + '%';
  $('cStats').innerHTML = `${sv.returned} visitors returned unharmed.<br>Slain, according to them: ${sv.slain} time${sv.slain === 1 ? '' : 's'}.`;
  const tabs = [['out', 'Outings'], ['skills', 'Adaptations', sv.pts || ''], ['logs', 'Intercepts', ''], ['opts', 'Settings']];
  $('cTabs').innerHTML = '';
  for (const [id, name, badge] of tabs) { const b = el('button', tab === id ? 'on' : '', name + (badge ? `<em>${badge}</em>` : '')); b.onclick = () => { tab = id; sfx('ui'); drawConclave(); }; $('cTabs').appendChild(b); }
  const main = $('cmain'); main.innerHTML = '';
  if (tab === 'out') {
    main.appendChild(el('h3', '', 'Outings'));
    MISSIONS.forEach((m, i) => {
      const open = i === 0 || sv.done.includes(i - 1), done = sv.done.includes(i);
      const row = el('div', 'ms' + (open ? '' : ' lock') + (i === sel ? ' sel' : ''), `<div class="n">${['i', 'ii', 'iii', 'iv', 'v'][i]}</div><div><b>${open ? m.name : 'Not yet'}</b><small>${open ? `THEY CALL IT: ${m.human}` : 'THE CONCLAVE IS STILL DELIBERATING'}</small></div><div class="st">${done ? 'returned ✓' : open ? m.place : ''}</div>`);
      row.onclick = () => { sel = i; sfx('ui'); drawConclave(); };
      main.appendChild(row);
      if (i === sel && open) {
        const br = el('div', 'brief');
        for (const l of m.brief) { const sp = SPEAKERS[l.who]; br.appendChild(el('p', '', `<b style="color:${sp.color}">${sp.name}</b>${l.text}`)); }
        const go = el('button', 'btn', done ? 'Walk out there again' : 'Set out'); go.style.marginTop = '6px';
        go.onclick = () => { initAudio(); sfx('objective'); show('conclave', false); on.startMission(i); };
        br.appendChild(go); main.appendChild(br);
      }
    });
    if (sv.ending !== null && sv.done.includes(4)) main.appendChild(el('div', 'brief', `<p><b style="color:#c9a6ff">Afterwards</b>${ENDINGS[sv.ending].text}</p>`));
  } else if (tab === 'skills') {
    main.appendChild(el('h3', '', `Adaptations <span style="font-size:14px;color:#c9a6ff">${sv.pts ? `${sv.pts} to spend` : 'earn Standing to grow more'}</span>`));
    const cols = el('div', 'cols');
    for (const tree of ['Carapace', 'Voice', 'Garden']) {
      const c = el('div'); c.appendChild(el('h4', '', tree));
      const list = SKILLS.filter(s => s.tree === tree);
      list.forEach((s, i) => {
        const have = hasSkill(s.id), can = !have && sv.pts > 0 && (i === 0 || hasSkill(list[i - 1].id));
        const d = el('div', 'skill' + (have ? ' have' : can ? ' can' : ''), `<b>${s.name}</b>${s.text}`);
        if (can) d.onclick = () => { sv.skills[s.id] = 1; sv.pts--; saveGame(); recompute(); sfx('level'); drawConclave(); };
        c.appendChild(d);
      });
      cols.appendChild(c);
    }
    main.appendChild(cols);
  } else if (tab === 'logs') {
    main.appendChild(el('h3', '', `Intercepts <span style="font-size:14px;color:#8fa9a8">${sv.logs.length} of ${LOGS.length} datapads recovered and translated</span>`));
    for (const l of LOGS) main.appendChild(sv.logs.includes(l.id) ? el('div', 'lg', `<b>${l.who.toUpperCase()} · ${l.title.toUpperCase()}</b>${l.text}`) : el('div', 'lg no', 'A datapad somewhere on outing ' + ('abcde'.indexOf(l.id[0]) + 1) + '. They glow orange.'));
  } else {
    main.appendChild(el('h3', '', 'Settings'));
    const range = (label, key, min, max, step, apply) => { const o = el('div', 'opt', `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${sv.opts[key]}">`); o.querySelector('input').oninput = e => { sv.opts[key] = +e.target.value; saveGame(); apply?.(sv.opts[key]); }; main.appendChild(o); };
    range('Look sensitivity', 'sens', 0.3, 2.5, 0.05); range('Volume', 'vol', 0, 1, 0.05, setVolume);
    const o = el('div', 'opt', `<label>Glow (bloom)</label><input type="checkbox" ${sv.opts.bloom ? 'checked' : ''}>`); o.querySelector('input').onchange = e => { sv.opts.bloom = e.target.checked; saveGame(); on.bloom?.(sv.opts.bloom); }; main.appendChild(o);
  }
}

// ------------------------------------------------------------------ dialogue
export function showDialog(nodes, cb) {
  dlg = { q: [...nodes], cb, prev: S.mode === 'dialog' ? dlg?.prev : S.mode };
  S.mode = 'dialog';
  if (document.pointerLockElement) document.exitPointerLock();
  show('title', false); show('dialog');
  nextNode();
}
function nextNode() {
  const n = dlg.q.shift();
  if (!n) { const d = dlg; dlg = null; show('dialog', false); S.mode = d.prev; d.cb?.(); if (S.mode === 'mission') on.lock(); return; }
  dlg.cur = n;
  const sp = SPEAKERS[n.who], box = $('dbox');
  box.className = (sp.human ? 'human' : '') + (n.who === 'translator' ? ' tr' + (n.ok ? ' ok' : '') : '');
  box.querySelector('.who').textContent = n.who === 'translator' && n.ok ? 'UES FIELD TRANSLATOR v1.1 (REPAIRED)' : sp.name; box.querySelector('.who').style.color = n.who === 'translator' && n.ok ? '#6ad08a' : sp.color;
  box.querySelector('.ttl').textContent = n.who === 'translator' ? (n.ok ? 'Accuracy: 100%' : 'Accuracy: confident') : sp.title;
  const txt = box.querySelector('.txt'), ch = box.querySelector('.ch');
  ch.innerHTML = ''; box.querySelector('.more').style.display = n.choices ? 'none' : '';
  clearInterval(typer); dlg.full = n.text || ''; dlg.shown = 0; txt.textContent = '';
  typer = setInterval(() => { dlg && (dlg.shown = Math.min(dlg.full.length, dlg.shown + 2)); if (!dlg) return clearInterval(typer); txt.textContent = dlg.full.slice(0, dlg.shown); if (dlg.shown >= dlg.full.length) clearInterval(typer); }, 16);
  sfx(sp.human ? 'uiBack' : 'ui');
  if (n.choices) n.choices.forEach((c, i) => {
    const o = typeof c === 'string' ? { text: c } : c;
    const b = el('button', '', `<kbd>${i + 1}</kbd>${o.text}`);
    b.onclick = e => {
      e.stopPropagation(); n.onPick?.(o);
      const follow = [{ who: 'you', text: o.text }];
      if (o.tr) follow.push({ who: 'translator', text: o.tr, ok: n.accurate });
      if (o.re) follow.push({ who: n.reWho, text: o.re });
      if (n.text) follow.shift();
      dlg.q.unshift(...follow); nextNode();
    };
    ch.appendChild(b);
  });
}
function advance() {
  if (!dlg) return;
  if (dlg.shown < dlg.full.length) { dlg.shown = dlg.full.length; $('dbox').querySelector('.txt').textContent = dlg.full; clearInterval(typer); return; }
  if (!dlg.cur.choices) nextNode();
}

// ------------------------------------------------------------------ in-mission messages
export function missionStart(def, idx) {
  playing(true);
  for (const id of ['title', 'conclave', 'debrief', 'death', 'pause']) show(id, false);
  $('feed').innerHTML = ''; $('subs').innerHTML = ''; $('toasts').innerHTML = '';
  $('bossName').textContent = DESIGNATIONS[idx];
  const i = $('intro'); i.querySelector('h2').textContent = def.name; i.querySelector('p').textContent = def.place; i.querySelector('h3').textContent = `${def.human} · ${def.humanPlace}`;
  i.style.opacity = 1; introT = 4.5; $('keys').style.opacity = 1; setTimeout(() => { $('keys').style.opacity = 0.0; }, 30000);
  bossBar(null); $('hint').style.opacity = 0; hintT = 0; $('log').style.opacity = 0;
}
export function objective(mine, theirs, quiet) {
  if ($('objMine').textContent === mine) return;
  $('objMine').textContent = mine; $('objTheirs').textContent = theirs || '';
  if (!quiet) { $('obj').classList.remove('flash'); void $('obj').offsetWidth; $('obj').classList.add('flash'); }
}
function fade(node, ms) { setTimeout(() => { node.style.opacity = 0; setTimeout(() => node.remove(), 600); }, ms); }
export function toast(text, cls = '') { const t = el('div', 'toast ' + cls, text); $('toasts').appendChild(t); while ($('toasts').children.length > 3) $('toasts').firstChild.remove(); fade(t, 3400); }
export function hint(text) { const h = $('hint'); h.innerHTML = text.replace(/\[(\w+)\]/g, '<kbd>$1</kbd>'); h.style.opacity = 1; hintT = 8; }
export function subtitle(who, text, cls = 'human') {
  const tag = cls === 'alien' ? '' : '<i>[translated]</i>';
  const s = el('div', 'sb ' + cls, `${tag}<b>${who}</b>${text}`); $('subs').appendChild(s);
  while ($('subs').children.length > 3) $('subs').firstChild.remove();
  fade(s, 3200 + text.length * 38);
}
export function feed(main, sub) { const d = el('div', 'fd', `${main}<small>${sub}</small>`); $('feed').appendChild(d); while ($('feed').children.length > 5) $('feed').firstChild.remove(); fade(d, 5200); }
export function hitMark(crit) { hitT = 0.18; $('hit').classList.toggle('crit', !!crit); }
export function prompt(label, k = 0) {
  const p = $('prompt');
  if (!label) { if (p.style.opacity !== '0') p.style.opacity = 0; return; }
  p.style.opacity = 1; const t = `<kbd>F</kbd>${k > 0 || label.startsWith('Open') ? 'Hold: ' : ''}${label}`;
  if (p.firstChild.innerHTML !== t) p.firstChild.innerHTML = t;
  p.querySelector('.pb').style.display = k > 0 ? '' : 'none'; p.querySelector('.pb i').style.width = k * 100 + '%';
}
export function showLog(l) { if (!l) return; $('log').innerHTML = `<b>DATAPAD · ${l.who.toUpperCase()} · ${l.title.toUpperCase()}</b>${l.text}<em>Filed under Intercepts at the Conclave.</em>`; $('log').style.opacity = 1; logT = 11; }
export function damageFrom(rel) { let i = dmgT.indexOf(Math.min(...dmgT)); dmgT[i] = 1; $('dmg').children[i].style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(0)}deg)`; }
export function bossBar(e) { if (e === boss) return; boss = e; $('hero').style.display = e ? 'block' : 'none'; }

export function showDeath(head, count, cb) {
  deathCb = cb; $('deathHead').textContent = head; $('deathCnt').textContent = `TIMES THE MONSTER HAS BEEN DEFINITIVELY SLAIN: ${count}`;
  if (document.pointerLockElement) document.exitPointerLock();
  show('death');
}

export function showDebrief(M) {
  playing(false);
  const d = DEBRIEFS[M.idx], def = M.def, st = M.stats, sv = S.save, last = M.idx === 4;
  const w = $('debriefWrap'); w.innerHTML = '';
  w.appendChild(el('div', 'minutes', `<h3>Conclave minutes · what happened</h3><h2>${def.name}</h2><ul>${d.ours.map(l => `<li>${l}</li>`).join('')}</ul>
    <table><tr><td>Visitors returned to orbit</td><td>${st.returned}</td></tr><tr><td>Visitors harmed</td><td>0</td></tr><tr><td>Times you were "slain"</td><td>${st.slain}</td></tr><tr><td>Datapads recovered</td><td>${st.logs}</td></tr><tr><td>Standing earned</td><td>+${st.xp}</td></tr></table>
    ${last && sv.ending !== null ? `<div class="epi">${ENDINGS[sv.ending].text}</div>` : ''}${sv.pts ? `<div class="epi" style="border-color:#7fe8d4;color:#d9fff8">You have ${sv.pts} adaptation${sv.pts > 1 ? 's' : ''} to grow at the Conclave.</div>` : ''}`));
  w.appendChild(el('div', 'news', `<div class="mast"><b>COLONY FLEET NEWS NETWORK</b><span><span class="live">LIVE</span> FROM DECK 4</span></div><div class="in"><h2>${d.head}</h2><h4>${d.sub}</h4><p>${d.body}</p></div><div class="tick"><span>${d.ticker.join('  ★  ')}  ★  ${d.ticker.join('  ★  ')}</span></div>`));
  const go = el('div', 'go'); const b = el('button', 'btn', last ? 'Go and water the Lawn' : 'Back to the Conclave'); b.onclick = () => { sfx('ui'); showConclave(); }; go.appendChild(b); w.appendChild(go);
  show('debrief'); sfx('sad');
}

export function showPause(yes) { show('pause', yes); }

// ------------------------------------------------------------------ per-frame HUD
export function updateHud(dt, camera, vw, vh) {
  const M = S.M; if (!M) return;
  const hp = clamp(P.hp / P.maxHp, 0, 1);
  $('bossHp').style.width = hp * 100 + '%'; $('bossSh').style.width = clamp(P.sh / P.maxSh, 0, 1) * 100 + '%';
  $('bossNum').textContent = `HP ${Math.ceil(P.hp)} · SHELL ${Math.ceil(P.sh)}`; $('bossSlain').textContent = `TIMES SLAIN: ${S.save.slain}`;
  $('boss').classList.toggle('low', hp < 0.3 && P.alive);
  if (boss) { if (boss.gone) bossBar(null); else $('heroHp').style.width = clamp(boss.hp / boss.max, 0, 1) * 100 + '%'; }

  const wp = $('weapons').children;
  for (let i = 0; i < 3; i++) wp[i].classList.toggle('on', P.weapon === i);
  wp[0].querySelector('.m i').style.width = P.thorn / P.thornMax * 100 + '%';
  pips(wp[1].querySelector('.pips'), P.cells, P.cellMax); pips(wp[2].querySelector('.pips'), P.pods, P.podMax);
  cd('abClaw', P.cdClaw / 0.65); cd('abBlink', P.cdBlink / P.blinkCd); cd('abLook', P.cdLook / P.lookCd);
  $('chargebar').style.opacity = P.charging ? 1 : 0; $('chargebar').firstChild.style.width = P.charge * 100 + '%';
  $('cross').style.setProperty('--r', (S.time * 40) % 360 + 'deg'); $('cross').style.setProperty('--s', 1 + P.recoil * 0.25 + (P.charging ? P.charge * 0.6 : 0));
  hitT = Math.max(0, hitT - dt); $('hit').style.opacity = hitT * 6;
  $('vign').style.opacity = clamp(Math.max(P.hurtT * 2, hp < 0.3 ? 0.5 + 0.3 * Math.sin(S.time * 6) : 0), 0, 1);
  $('haze').style.opacity = S.W.haze * 0.9;
  for (let i = 0; i < 3; i++) { dmgT[i] = Math.max(0, dmgT[i] - dt * 1.2); $('dmg').children[i].style.opacity = dmgT[i]; }
  if (hintT > 0 && (hintT -= dt) <= 0) $('hint').style.opacity = 0;
  if (logT > 0 && (logT -= dt) <= 0) $('log').style.opacity = 0;
  if (introT > 0 && (introT -= dt) <= 0) $('intro').style.opacity = 0;

  // Who you're looking at.
  if ((tgtT -= dt) <= 0) {
    tgtT = 0.12; camera.getWorldDirection(f);
    let best = null, bd = 0.994;
    for (const e of S.enemies) {
      if (e.gone) continue;
      v.set(e.pos.x - camera.position.x, e.pos.y + e.def.h * 0.6 - camera.position.y, e.pos.z - camera.position.z); const d = v.length(); if (d > 70) continue;
      const dot = v.dot(f) / d; if (dot > bd - Math.min(0.05, 0.5 / d) && e.los) { if (!best || dot > bd) { bd = Math.max(bd, dot); best = e; } }
    }
    const t = $('target');
    if (best) { t.style.opacity = 1; t.firstChild.textContent = `${best.rank ? best.rank + ' ' : ''}${best.name}`; t.lastChild.textContent = best.reason; } else t.style.opacity = 0;
  }

  // Objective markers, pinned to the edge of the screen when out of view.
  let list = M.cur?.marks?.(M) || [];
  if (list.length > marks.length) { list.forEach(m => { m.d = Math.hypot(m.x - P.pos.x, m.z - P.pos.z); }); list = list.sort((a, b) => a.d - b.d).slice(0, marks.length); }
  for (let i = 0; i < marks.length; i++) {
    const m = list[i], node = marks[i];
    if (!m || !P.alive) { if (node.style.display !== 'none') node.style.display = 'none'; continue; }
    v.set(m.x, m.y, m.z).project(camera);
    let x = (v.x + 1) / 2 * vw, y = (1 - v.y) / 2 * vh, off = false;
    if (v.z > 1) { x = vw - x; y = vh - 40; off = true; }
    if (x < 40 || x > vw - 40 || y < 70 || y > vh - 110) off = true;
    x = clamp(x, 40, vw - 40); y = clamp(y, 70, vh - 110);
    const dist = Math.hypot(m.x - P.pos.x, m.z - P.pos.z), enemy = !m.label;
    node.style.display = enemy && !off && dist < 30 ? 'none' : 'block';
    node.className = enemy ? 'e' : '';
    const txt = enemy ? '' : `${m.label} · ${dist.toFixed(0)}m${m.t && m.t.hp < m.t.max ? `<u><s style="width:${(m.t.hp / m.t.max * 100).toFixed(0)}%"></s></u>` : ''}`;
    if (node.dataset.t !== txt) { node.innerHTML = txt; node.dataset.t = txt; }
    node.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-100%)`;
    node.style.opacity = off ? 0.75 : 1;
  }
}
function pips(node, n, max) { if (node.children.length !== max) { node.innerHTML = ''; for (let i = 0; i < max; i++) node.appendChild(el('u')); } for (let i = 0; i < max; i++) node.children[i].className = i < n ? 'f' : ''; }
function cd(id, k) { const a = $(id); k = clamp(k, 0, 1); a.classList.toggle('cd', k > 0); a.lastElementChild.style.height = k * 100 + '%'; }

// For the headless bot: take the first option, close whatever is open.
export function botSkip() {
  if (dlg) { const b = $('dbox').querySelector('.ch button'); if (b) b.click(); else nextNode(); }
  else if (deathCb) $('btnUp').click();
}
