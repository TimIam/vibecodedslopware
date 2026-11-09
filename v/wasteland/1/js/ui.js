// DOM panels: HUD, tool bar, build lists, inspector, research tree, charter, memo, ticker, toasts.
import { B, TECH, CATS, RES, RES_NAME, FEAT, T_NAME, ERA, MSV, CHARTER, DAY, costFor, ROAD_COST, eraMult } from './data.js';
import { I, inb, eraNow, sidingNow, renovate, renoCost, needsReno, recruit, startMSV, demolish, setResearch, msvCrew, queueClear, outpostOf } from './world.js';
import { icon, buildingSprite, canvas } from './art.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.floor(v).toString());
const ICON = {};
for (const k of [...RES, 'power', 'pop', 'sec', 'kh', 'appeal']) ICON[k] = icon(k, 2);
const ic = (k, n) => `<span><img src="${ICON[k]}" alt="">${n}</span>`;

// small pixel icons for the tool bar
function pix(rows, pal, scale = 2) {
  const c = canvas(14 * scale, 14 * scale), x = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, X) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(X * scale, y * scale, scale, scale); } }));
  return c.toDataURL();
}
const PAL = { k: '#1d1b18', w: '#f5f2e8', g: '#7f7a70', r: '#a5532e', y: '#e8c64a', b: '#5a7aa0', n: '#6aa64a', o: '#c98a3a', d: '#6e5a3e', s: '#b4aea2', p: '#ef7fae', t: '#4f8a8a', l: '#8fc7d4' };
const TOOLICON = {
  inspect: ['', ' k', ' kk', ' kwk', ' kwwk', ' kwwwk', ' kwwwwk', ' kwwwwwk', ' kwwkkkk', ' kwk', ' kk', ' k'],
  clear: ['', '         ss', '        sss', '       sss', '      sd', '     dd', '    dd', '   dd', '  ggg', ' gggg', ' ggg', '  g'],
  road: ['', '      gg', '    gggggg', '  ggggyggggg', 'ggggggggggggg', '  gggyggggg', '    gggggg', '      gg'],
  bulldoze: ['', '', '   yyyyy', '   ykkky', '  yyyyyyy  g', '  yyyyyyy gg', ' kkkkkkkkggg', ' kgkgkgk', ' kkkkkkk'],
  housing: ['', '      r', '     rrr', '    rrrrr', '   rrrrrrr', '  rrrrrrrrr', '   wwwwwww', '   wkwwlkw', '   wkwwlkw', '   wkwwwww', '   wkwwwww'],
  food: ['', '    n   n', '   nn  nn', '    nnnn', '    oo', '   oooo', '  oooooo', '  oooooo', '   oooo', '    oo'],
  industry: ['', '  g', '  g   g', '  g   g', '  g   g', '  ggrrgrrg', '  grrrrrrrr', '  grwrwrwrr', '  grrrrrrrr', '  rrrrrrrrr'],
  power: ['', '      yy', '     yy', '    yy', '   yyyyyy', '     yy', '    yy', '   yy', '  y'],
  civic: ['', '     nnn', '    nnnnn', '   nnnnnnn', '    nnnnn', '     ddd', '      d', '      d', '   nnnnnnn'],
  retail: ['', '   rwrwrwr', '  rwrwrwrwr', '  wwwwwwwww', '  wlllwlllw', '  wlllwlllw', '  wwwkkkwww', '  wwwkkkwww'],
  defense: ['', '    b   b', '    bbbbb', '    bkbkb', '    bbbbb', '     ggg', '    g g g', '   g  g  g', '  g   g   g'],
  transport: ['', '', '  ooooooo', '  oooooool', '  ooooooolll', '  oooooooooo', '  kk     kk', '  kk     kk'],
  research: ['', '     ww', '     ww', '     ww', '    wttw', '   wtttw', '  wttttttw', '  wtytttyw', '  wwwwwwww'],
};
const TOOLS = [
  ['inspect', 'Inspect (Esc)'], ['clear', 'Clear debris (C). Right-drag cancels.'], ['road', 'Road (R)'], ['bulldoze', 'Bulldoze (B)'], '-',
  ...CATS.map(([id, name]) => [id, name]), '-', ['research', 'Research tree (T)'],
];
const CAT_ICON = { housing: 'housing', food: 'food', industry: 'industry', power: 'power', civic: 'civic', retail: 'retail', defense: 'defense', transport: 'transport' };

export class UI {
  constructor(app) {
    this.A = app;
    this.lastLog = 0; this.dismissed = new Set(); this.memoId = null; this.headT = 0; this.head = '';
    this.prev = {};
    this.buildToolbar();
    this.buildRes();
    for (const el of document.querySelectorAll('[data-close]')) el.addEventListener('click', () => { $(el.dataset.close).hidden = true; if (el.dataset.close === 'fly') this.setActiveCat(null); if (el.dataset.close === 'insp') { this.A.R.ui.sel = null; } });
    $('rsch').onclick = () => this.openTree();
    $('charterBtn').onclick = () => this.openCharter();
    $('menuBtn').onclick = () => { $('menuM').hidden = false; };
    $('town').onclick = () => this.A.nextTown();
    $('memoX').onclick = () => { if (this.memoId) this.dismissed.add(this.memoId); $('memo').hidden = true; };
    $('tickText').onclick = () => { const l = this.A.G.log[this.A.G.log.length - 1]; if (l && l.x != null) this.A.R.centerOn(l.x, l.y); };
    for (const b of document.querySelectorAll('#speed .btn')) b.onclick = () => this.A.setSpeed(+b.dataset.s);
  }
  buildToolbar() {
    const el = $('tools');
    el.innerHTML = '';
    for (const t of TOOLS) {
      if (t === '-') { el.appendChild(document.createElement('hr')); continue; }
      const [id, name] = t, b = document.createElement('button');
      b.className = 'btn'; b.title = name; b.dataset.tool = id; b.setAttribute('aria-label', name);
      b.innerHTML = `<img src="${pix(TOOLICON[CAT_ICON[id] || id], PAL)}" alt="">`;
      b.onclick = () => {
        if (id === 'research') return this.openTree();
        if (CAT_ICON[id]) return this.toggleCat(id);
        this.A.setTool(id);
      };
      el.appendChild(b);
    }
  }
  setActiveCat(cat) { this.cat = cat; this.markTools(); }
  markTools() {
    const tool = this.A.tool;
    for (const b of document.querySelectorAll('#tools .btn')) {
      const id = b.dataset.tool;
      b.classList.toggle('on', id === tool || id === this.cat || (tool.startsWith('build:') && B[tool.slice(6)]?.cat === id));
    }
  }
  toggleCat(cat) {
    if (this.cat === cat && !$('fly').hidden) { $('fly').hidden = true; this.setActiveCat(null); return; }
    this.cat = cat;
    $('flyTitle').textContent = CATS.find((c) => c[0] === cat)[1];
    $('fly').hidden = false;
    this.renderFly();
    this.markTools();
  }
  preview(type) {
    const G = this.A.G, s = G.settlements[this.A.sid], era = eraNow(G), sd = sidingNow(G, s);
    const k = `${type}|${era}|${sd}`;
    this.prevImg = this.prevImg || {};
    if (!this.prevImg[k]) this.prevImg[k] = buildingSprite({ type, era, siding: sd, hue: 2 }).c.toDataURL();
    return this.prevImg[k];
  }
  renderFly() {
    if ($('fly').hidden || !this.cat) return;
    const G = this.A.G, s = G.settlements[this.A.sid], era = eraNow(G), sd = sidingNow(G, s);
    const list = Object.values(B).filter((d) => d.cat === this.cat && !d.unique);
    const html = list.map((d) => {
      const locked = d.tech && !G.research.done[d.tech];
      const cost = costFor(d, era, sd);
      const cs = Object.entries(cost).map(([k, v]) => `<span class="${s.res[k] < v ? 'short' : ''}"><img src="${ICON[k]}" alt="${k}">${v}</span>`).join('');
      const meta = [];
      if (d.house) meta.push(`houses ${Math.round(d.house * (era === 0 ? 1 : eraMult({ era, siding: sd })))}`);
      if (d.jobs) meta.push(`${d.jobs} jobs`);
      if (d.prod) for (const k in d.prod) meta.push(`+${d.prod[k]} ${k}/day`);
      if (d.cons) for (const k in d.cons) meta.push(`−${d.cons[k]} ${k}/day`);
      if (d.power) meta.push(d.power > 0 ? `+${d.power} power` : `${d.power} power`);
      if (d.research) meta.push(`+${d.research} know-how/day`);
      if (d.appeal) meta.push(`+${d.appeal} appeal`);
      if (d.bunks) meta.push(`${d.bunks} bunks`);
      if (d.crew) meta.push(`+${d.crew} crew`);
      return `<button class="btn bcard ${locked ? 'locked' : ''}" data-b="${d.id}" ${locked ? 'aria-disabled="true"' : ''} title="${esc(d.desc)}">
        <img src="${this.preview(d.id)}" alt="">
        <div><b>${esc(d.name)} <small style="font-weight:400">${d.size[0]}×${d.size[1]}</small></b>
        ${locked ? `<div class="meta no">Needs research: ${esc(TECH[d.tech].name)}</div>` : `<div class="cost">${cs || 'free'}</div>`}
        <div class="meta">${meta.join(' · ')}</div></div></button>`;
    }).join('');
    $('flyList').innerHTML = html;
    for (const el of $('flyList').querySelectorAll('.bcard')) el.onclick = () => {
      const d = B[el.dataset.b];
      if (d.tech && !this.A.G.research.done[d.tech]) { this.toast(`Research ${TECH[d.tech].name} first.`, 'warn'); return; }
      this.A.setTool('build:' + d.id);
      if (window.innerWidth < 760) $('fly').hidden = true;
    };
  }
  buildRes() {
    const el = $('resBar');
    el.innerHTML = '';
    for (const k of [...RES, 'pop', 'sec', 'power', 'appeal']) {
      const d = document.createElement('div');
      d.className = 'res sunk'; d.id = 'r_' + k;
      d.innerHTML = `<img src="${ICON[k]}" alt=""><span></span><small></small>`;
      d.title = { pop: 'Settlers / beds', sec: 'Security / bunks', power: 'Power supply / demand', appeal: 'Appeal: parks and shops draw settlers and raise the population cap', kh: 'Know-how per day (research)' }[k] || `${RES_NAME[k]} (change per day)`;
      el.appendChild(d);
    }
  }
  updateHUD() {
    const A = this.A, G = A.G, s = G.settlements[A.sid];
    $('town').textContent = s.name + (G.settlements.length > 1 ? ' ▾' : '');
    for (const k of RES) {
      const d = $('r_' + k), v = s.res[k], r = s.rate[k] || 0;
      d.querySelector('span').textContent = fmt(v);
      const sm = d.querySelector('small');
      sm.textContent = Math.abs(r) < 0.05 ? '' : (r > 0 ? '+' : '') + r.toFixed(r < 10 && r > -10 ? 1 : 0);
      sm.className = r < -0.05 ? 'neg' : r > 0.05 ? 'pos' : '';
      d.classList.toggle('low', k === 'food' && v < 6 && r < 0);
      d.hidden = k !== 'food' && k !== 'scrap' && v < 0.5 && Math.abs(r) < 0.05;
    }
    const set = (id, a, b, warn) => { const d = $('r_' + id); d.querySelector('span').textContent = a; d.querySelector('small').textContent = b; d.querySelector('small').className = warn ? 'neg' : ''; };
    set('pop', `${s.civ}`, `/${s.house}`, s.civ >= s.house);
    $('r_pop').title = `Settlers ${s.civ} / beds ${s.house}. Population cap ${s.popCap} (raise it with appeal).`;
    set('sec', `${s.sec}`, `/${s.bunks}`, s.sec === 0);
    set('power', `${s.power.sup.toFixed(0)}`, `/${s.power.dem.toFixed(0)}`, s.power.ratio < 0.99);
    $('r_power').hidden = !G.research.done.electric && s.power.dem === 0;
    set('appeal', `${Math.round(s.appeal)}`, '', false);
    $('r_appeal').hidden = s.appeal < 0.5 && !G.research.done.civics;
    const R = G.research, cur = R.cur ? TECH[R.cur] : null;
    const khd = G.settlements.reduce((a, x) => a + x.kh, 0);
    $('rsch').title = `Research (T). Know-how ${khd.toFixed(1)} per day.`;
    $('rsch').querySelector('span').textContent = cur ? `${cur.name} ${Math.floor((R.prog / cur.cost) * 100)}%` : G.kh > 0.5 ? `Pick research (${Math.floor(G.kh)} banked)` : 'Research: none';
    $('rsch').querySelector('.bar').style.width = cur ? `${(R.prog / cur.cost) * 100}%` : '0%';
    $('rsch').classList.toggle('on', !cur && G.kh > 0.5 && Math.floor(G.t) % 2 === 0);
    $('day').textContent = `Day ${Math.floor(G.t / DAY) + 1} · ${ERA[eraNow(G)]}${s.siding ? ' + vinyl' : ''}`;
    for (const b of document.querySelectorAll('#speed .btn')) b.classList.toggle('on', +b.dataset.s === A.speed);
  }
  update() {
    const A = this.A, G = A.G;
    this.updateHUD();
    this.inspect();
    this.logs();
    this.memo();
    this.alerts();
    if (!$('fly').hidden) { const sig = JSON.stringify([eraNow(G), A.sid, Object.keys(G.research.done).length, ...RES.map((k) => Math.floor(G.settlements[A.sid].res[k] / 5))]); if (sig !== this.flySig) { this.flySig = sig; this.renderFly(); } }
    if (!$('treeM').hidden) this.renderTree();
    if (!$('charterM').hidden) this.renderCharter();
  }
  // ---------- inspector ----------
  inspect() {
    const A = this.A, G = A.G, R = A.R, el = $('inspBody');
    const sel = R.ui.sel != null ? G.buildings[R.ui.sel] : null;
    if (sel && !sel.dead) {
      $('insp').hidden = false;
      const def = B[sel.type], s = G.settlements[sel.sid];
      $('inspTitle').textContent = def.name;
      const task = G.tasks.find((t) => !t.dead && t.bid === sel.id);
      const rows = [];
      let status;
      if (!sel.built) status = `<span class="wn">Under construction ${Math.floor((task ? task.prog / task.need : 0) * 100)}%</span>${task && task.n === 0 ? ' <span class="no">(waiting for crew)</span>' : ''}`;
      else if (sel.reno) status = `<span class="wn">Renovating ${Math.floor((task ? task.prog / task.need : 0) * 100)}%</span>`;
      else if (def.jobs && sel.workers === 0) status = '<span class="no">Unstaffed: needs settlers</span>';
      else if (def.power < 0 && s.power.ratio < 0.99) status = `<span class="no">Brownout: ${Math.round(s.power.ratio * 100)}% power</span>`;
      else if (def.cons && sel.eff < 0.2 && sel.staff > 0) status = `<span class="no">Out of ${Object.keys(def.cons).join('/')}</span>`;
      else status = '<span class="ok">Operating</span>';
      rows.push(['Status', status]);
      rows.push(['Built from', `${ERA[sel.era]}${sel.siding ? ' + vinyl siding' : ''}`]);
      rows.push(['Town', esc(s.name)]);
      if (def.jobs) rows.push(['Workers', `${sel.workers}/${def.jobs}`]);
      if (def.crew) rows.push(['Crew slots', `${def.crew} (town crew ${s.crewN || 0})`]);
      if (sel.built) {
        const m = (def.jobs ? sel.staff : 1) * (def.power < 0 ? s.power.ratio : 1) * eraMult(sel) * (sel.road ? 1.15 : 1);
        if (def.prod) for (const k in def.prod) rows.push([RES_NAME[k], `<span class="ok">+${(def.prod[k] * m * (def.cons ? sel.eff / Math.max(0.001, sel.staff * (def.power < 0 ? s.power.ratio : 1)) : 1)).toFixed(1)}/day</span>`]);
        if (def.cons) for (const k in def.cons) rows.push([RES_NAME[k], `<span class="no">−${(def.cons[k] * (def.power > 0 ? sel.eff : sel.staff)).toFixed(1)}/day</span>`]);
        if (def.research) rows.push(['Know-how', `+${(def.research * m).toFixed(1)}/day`]);
        if (def.power) rows.push(['Power', def.power > 0 ? `+${(def.power * sel.eff).toFixed(1)}` : `${def.power}`]);
        if (def.house) rows.push(['Residents', `${G.units.filter((u) => u.home === sel.id).length}/${Math.round(def.house * eraMult(sel))}`]);
        if (def.bunks) rows.push(['Security', `${G.units.filter((u) => u.post === sel.id && u.kind === 'sec').length}/${Math.round(def.bunks * (sel.type === 'outpost' ? 1 : eraMult(sel)))}`]);
        if (def.appeal) rows.push(['Appeal', `+${(def.appeal * eraMult(sel)).toFixed(1)}`]);
        if (def.jobs || def.prod || def.research) rows.push(['Road access', sel.road ? '<span class="ok">yes, +15%</span>' : '<span class="wn">no (+15% with a road)</span>']);
      }
      let acts = '';
      if (sel.built && (def.bunks)) acts += `<button class="btn go" data-a="recruit" title="Turn a settler into security (8 food)">Recruit security</button>`;
      if (sel.type === 'outpost') acts += `<label class="btn" style="gap:4px"><input type="checkbox" data-a="auto" ${s.autoRecruit ? 'checked' : ''}>Keep bunks filled</label>`;
      if (needsReno(G, sel)) {
        const c = renoCost(G, sel);
        acts += `<button class="btn" data-a="reno" title="Rebuild in ${ERA[eraNow(G)]}${sidingNow(G, s) ? ' with vinyl siding' : ''}: better output and looks">Renovate ${Object.entries(c).map(([k, v]) => ic(k, v)).join(' ')}</button>`;
      }
      if (sel.type === 'vworks' && sel.built) {
        if (!sel.msv) acts += `<button class="btn go" data-a="msv">Assemble MSV ${Object.entries(MSV.cost).map(([k, v]) => ic(k, v)).join(' ')}</button>`;
        else if (!sel.msv.ready) rows.push(['MSV', `<span class="wn">Assembling ${Math.floor((sel.msv.prog / MSV.days) * 100)}%</span>`]);
        else {
          const c = msvCrew(G, sel.sid);
          rows.push(['MSV', '<span class="ok">Ready to roll</span>']);
          rows.push(['Aboard', c.ok ? `${c.n} settlers + ${c.sec} security` : `<span class="no">needs ${MSV.minSettlers + 4}+ settlers in town</span>`]);
          acts += `<button class="btn go" data-a="dispatch" ${c.ok ? '' : 'disabled'}>Choose destination…</button>`;
        }
      }
      if (sel.type !== 'outpost') acts += `<button class="btn red" data-a="demolish" title="${sel.built ? 'Refunds 30%' : 'Refunds 80%'}">Demolish</button>`;
      const html = `<p class="desc">${esc(def.desc)}</p>${rows.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('')}<div class="acts">${acts}</div>`;
      if (html !== this.inspHtml) {
        this.inspHtml = html; el.innerHTML = html;
        for (const b of el.querySelectorAll('[data-a]')) {
          const a = b.dataset.a;
          if (a === 'auto') { b.onchange = () => { s.autoRecruit = b.checked; }; continue; }
          b.onclick = () => this.act(a, sel);
        }
      }
      return;
    }
    const t = R.ui.tileSel;
    if (t && inb(t[0], t[1])) {
      const i = I(t[0], t[1]);
      $('insp').hidden = false;
      if (!G.fog[i]) { $('inspTitle').textContent = 'Unexplored'; const h = '<p class="desc">Nobody has been out there. Recruit security and let them patrol, or let the town grow.</p>'; if (h !== this.inspHtml) { this.inspHtml = h; el.innerHTML = h; } return; }
      const f = G.feat[i], own = G.own[i];
      $('inspTitle').textContent = f ? FEAT[f].name : T_NAME[G.terr[i]];
      const rows = [['Ground', T_NAME[G.terr[i]]], ['Town', own >= 0 ? esc(G.settlements[own].name) : '<span class="wn">outside town limits</span>']];
      if (G.road[i]) rows.push(['Road', ['', 'dirt track', 'gravel', 'asphalt'][G.road[i]]]);
      if (f) rows.push(['Salvage', Object.entries(FEAT[f].yield).map(([k, v]) => ic(k, v)).join(' ')]);
      const queued = G.tasks.some((k) => !k.dead && k.kind === 'clear' && k.x === t[0] && k.y === t[1]);
      let acts = '';
      if (f && own >= 0 && !queued) acts = '<button class="btn go" data-a="clear1">Clear it</button>';
      if (queued) rows.push(['Orders', '<span class="wn">queued for clearing</span>']);
      const html = `${rows.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('')}<div class="acts">${acts}</div>`;
      if (html !== this.inspHtml) {
        this.inspHtml = html; el.innerHTML = html;
        const b = el.querySelector('[data-a=clear1]');
        if (b) b.onclick = () => { queueClear(G, t[0], t[1], t[0], t[1]); this.inspHtml = ''; };
      }
      return;
    }
    $('insp').hidden = true;
    this.inspHtml = '';
  }
  act(a, sel) {
    const A = this.A, G = A.G;
    let r = { ok: true };
    if (a === 'recruit') r = recruit(G, sel.sid);
    else if (a === 'reno') r = renovate(G, sel.id);
    else if (a === 'msv') r = startMSV(G, sel.id);
    else if (a === 'dispatch') { A.setTool('msv'); A.msvFrom = sel.id; this.toast('Pick a spot in the wastes, at least 30 tiles from any town.', 'good'); return; }
    else if (a === 'demolish') { if (!confirm(`Demolish this ${B[sel.type].name}?`)) return; r = demolish(G, sel.id); if (r.ok) A.R.ui.sel = null; }
    if (!r.ok) this.toast(r.reason, 'bad'); else A.sfx(a === 'demolish' ? 'boom' : 'click');
    this.inspHtml = '';
  }
  // ---------- research tree ----------
  openTree() { $('treeM').hidden = false; this.treeSig = ''; this.renderTree(); }
  renderTree() {
    const G = this.A.G, R = G.research;
    const sig = JSON.stringify([R.cur, Math.floor(R.prog), Object.keys(R.done)]);
    if (sig === this.treeSig) return;
    this.treeSig = sig;
    const small = window.innerWidth < 760, CW2 = small ? 124 : 158, RH = small ? 66 : 64, NW = small ? 112 : 128;
    const el = $('tree');
    el.style.width = `${6 * CW2}px`; el.style.height = `${8 * RH + 10}px`;
    const unlocks = (id) => Object.values(B).filter((b) => b.tech === id).map((b) => b.name);
    let lines = '';
    for (const id in TECH) for (const r of TECH[id].req) {
      const a = TECH[r], b = TECH[id];
      const x1 = a.x * CW2 + NW, y1 = a.y * RH + 26, x2 = b.x * CW2, y2 = b.y * RH + 26, mx = (x1 + x2) / 2;
      lines += `<path d="M${x1} ${y1} H${mx} V${y2} H${x2}" stroke="${R.done[r] ? '#2f7a3a' : '#77736a'}" stroke-width="2" fill="none"/>`;
    }
    let html = `<svg width="${6 * CW2}" height="${8 * RH + 10}">${lines}</svg>`;
    for (const id in TECH) {
      const t = TECH[id], done = R.done[id], avail = !done && t.req.every((r) => R.done[r]), cur = R.cur === id;
      const cls = done ? 'done' : cur ? 'cur' : avail ? '' : 'lock';
      html += `<button class="btn tnode ${cls}" data-t="${id}" style="left:${t.x * CW2}px;top:${t.y * RH}px;width:${NW}px" title="${esc(t.desc)}">
        <b>${esc(t.name)}</b><span class="u">${done ? 'Known' : `${t.cost} know-how`}${unlocks(id).length ? ' · ' + esc(unlocks(id).join(', ')) : ''}${id === 'carpentry' ? ' · Timber era' : id === 'reconstruction' ? ' · Masonry era' : id === 'petro' ? ' · vinyl siding' : ''}</span>
        ${cur ? `<div class="pb" style="width:${(R.prog / t.cost) * 100}%"></div>` : ''}</button>`;
    }
    el.innerHTML = html;
    for (const b of el.querySelectorAll('.tnode')) b.onclick = () => {
      const r = setResearch(G, b.dataset.t);
      if (!r.ok) this.toast(r.reason, 'warn'); else { this.A.sfx('click'); this.treeSig = ''; this.renderTree(); }
    };
    const kh = G.settlements.reduce((a, x) => a + x.kh, 0);
    $('treeInfo').innerHTML = `Know-how: <b>${kh.toFixed(1)}/day</b> from Tinker's Sheds, schools and the newspaper. ${G.kh > 0.5 ? `<b>${Math.floor(G.kh)}</b> banked. ` : ''}Click a lit node to research it.`;
  }
  // ---------- charter ----------
  openCharter() { $('charterM').hidden = false; this.renderCharter(); }
  renderCharter() {
    const G = this.A.G, c = G.counts;
    const items = CHARTER.map((it) => `<li><span class="ck">${it.test(c, G) ? '✓' : ''}</span>${esc(it.text)}</li>`).join('');
    if (items !== this.chHtml) { this.chHtml = items; $('charterList').innerHTML = items; }
    $('statsBox').innerHTML = this.statsHtml();
  }
  statsHtml() {
    const G = this.A.G, st = G.stats;
    const pop = G.settlements.reduce((a, s) => a + s.pop, 0);
    return [['Days in session', Math.floor(G.t / DAY) + 1], ['Towns', G.settlements.length], ['Population', pop], ['Buildings raised', st.built], ['Debris cleared', st.cleared], ['Settlers arrived', st.born], ['Hostiles stopped', st.hostilesKilled], ['People lost', st.killed]].map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  }
  // ---------- log, ticker, toasts ----------
  logs() {
    const G = this.A.G;
    while (this.lastLog < G.log.length) {
      const l = G.log[this.lastLog++];
      if (l.kind === 'bad' || l.kind === 'warn' || (l.kind === 'good' && !/wandered into/.test(l.msg))) this.toast(l.msg, l.kind);
      if (l.kind === 'bad') this.A.sfx('alarm');
      this.tickMsg = l; this.tickT = performance.now();
    }
    const s = G.settlements[this.A.sid];
    const paper = s.blds && s.blds.some((b) => b.type === 'newspaper' && b.built);
    const now = performance.now();
    let html, lbl = 'BULLETIN';
    if (this.tickMsg && now - this.tickT < 9000) html = `<span class="${this.tickMsg.kind}">${esc(this.tickMsg.msg)}</span>`;
    else if (paper) {
      lbl = 'GAZETTE';
      if (now - this.headT > 14000) { this.headT = now; this.head = headline(G, s); }
      html = esc(this.head);
    } else html = this.tickMsg ? esc(this.tickMsg.msg) : '';
    $('tickLbl').textContent = lbl;
    if (html !== this.tickHtml) { this.tickHtml = html; $('tickText').innerHTML = html; }
  }
  toast(msg, kind = 'good') {
    const el = $('toasts');
    while (el.children.length > 2) el.firstChild.remove();
    const d = document.createElement('div');
    d.className = `toast bev ${kind}`; d.textContent = msg;
    el.appendChild(d);
    setTimeout(() => d.remove(), kind === 'bad' ? 5500 : 4000);
  }
  alerts() {
    const A = this.A, G = A.G;
    while (G.alerts.length) {
      const a = G.alerts.shift();
      if (a.k === 'tech') { A.sfx('tech'); if (!G.research.cur) setTimeout(() => this.toast('Pick the next research: click the research bar.', 'good'), 1200); }
      if (a.k === 'built') A.sfx('built');
      if (a.k === 'founded') { A.sid = a.sid; const op = outpostOf(G, a.sid); if (op) A.R.centerOn(op.x + 1, op.y + 1); A.sfx('tech'); }
      if (a.k === 'msv') A.sfx('tech');
    }
    if (!G.won && CHARTER.every((it) => it.test(G.counts, G))) {
      G.won = true;
      $('winStats').innerHTML = this.statsHtml();
      $('winM').hidden = false;
      A.sfx('tech');
    }
  }
  // ---------- memo (contextual tips) ----------
  memo() {
    const G = this.A.G, s = G.settlements[this.A.sid], c = G.counts;
    const op = s.blds && s.blds.find((b) => b.type === 'outpost');
    const has = (t) => s.blds && s.blds.some((b) => b.type === t);
    const anyReno = s.blds && s.blds.some((b) => needsReno(G, b));
    const vw = s.blds && s.blds.find((b) => b.type === 'vworks' && b.built);
    const tips = [
      ['colony', s.id > 0 && !has('farm'), `${esc(s.name)} has supplies for only a few buildings. Build a <b>Farm</b> first: food makes new settlers. Homes and a Guard Post next.`],
      ['clear', G.stats.cleared < 4 && !G.tasks.some((t) => t.kind === 'clear'), 'Your crew needs materials. Pick the <b>Clear</b> tool (the shovel) and drag a box over junk, wrecks and dead trees near the Outpost.'],
      ['home', s.civ >= s.house && (c.home || 0) < 2, 'Settlers only move in when there is a free bed. Build a <b>Homestead</b> from the Housing menu.'],
      ['sec', s.sec === 0 && G.t > 30, 'Mutants roam the wastes. Select the <b>Outpost</b> and press <b>Recruit security</b>. A <b>Guard Post</b> adds bunks for more.'],
      ['tinker', !c.tinker && !G.tasks.some((t) => !t.dead && t.kind === 'build' && G.buildings[t.bid]?.type === 'tinker') && G.t > 20, "Research needs know-how. Build a <b>Tinker's Shed</b> (Civic menu) and keep it staffed."],
      ['rsch', !G.research.cur && (G.kh > 0.5 || has('tinker')) && Object.keys(G.research.done).length < 3, 'Pick something to research: click the <b>research bar</b> at the top. Carpentry starts the Timber era.'],
      ['food', s.rate.food < 0 && s.res.food < 30, 'Food is running down. Build another <b>Farm</b> and make sure it is staffed. Hungry settlers leave.'],
      ['staff', s.blds && s.blds.filter((b) => b.built && B[b.type].jobs && !b.workers).length >= 2, 'Several buildings stand empty. More <b>homes</b> and <b>food</b> bring more settlers to staff them.'],
      ['road', !G.road.some((v) => v) && G.t > 180, 'Buildings touching a <b>road</b> work 15% better, and people walk faster on roads.'],
      ['reno', anyReno && eraNow(G) > 0, `A new era: select older buildings and <b>Renovate</b> them in ${ERA[eraNow(G)]}${s.siding ? ' with vinyl siding' : ''} for better output and looks.`],
      ['appeal', s.pop >= s.popCap - 1, 'Settlers will not come to a dump. <b>Parks</b>, <b>shops</b> and a <b>newspaper</b> raise appeal and the population cap.'],
      ['power', s.power.ratio < 0.99, 'Brownout! Build more power: a <b>Wood-Gas Generator</b> now, <b>wind</b> and <b>solar</b> later.'],
      ['msv1', vw && !vw.msv, 'The Vehicle Works is up. Select it and <b>Assemble MSV</b>.'],
      ['msv2', vw && vw.msv && vw.msv.ready, 'An MSV is ready. Select the Vehicle Works and <b>Choose destination</b> out in the fresh wasteland.'],
    ];
    const t = tips.find(([id, cond]) => cond && !this.dismissed.has(id));
    if (!t) { $('memo').hidden = true; this.memoId = null; return; }
    if (t[0] !== this.memoId) { this.memoId = t[0]; $('memoBody').innerHTML = t[2]; }
    $('memo').hidden = false;
    void op;
  }
}

function headline(G, s) {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  const c = G.counts;
  const pool = [
    `${s.name.toUpperCase()} POPULATION HITS ${s.pop}; COMMISSION TAKES CREDIT`,
    'WEATHER: DUST. OUTLOOK: DUST. LONG RANGE: MORE DUST',
    'LETTERS: READER ASKS WHY THE FARM SMELLS LIKE A FARM',
    `COMMISSION APPROVES ${2 + Math.floor(Math.random() * 9)} PERMITS, DENIES ONE ON PRINCIPLE`,
    'LOCAL MAN FINDS WORKING TOASTER; HALF-DAY HOLIDAY DECLARED',
    'PRICE OF SCRAP STEADY AT "A LOT"',
    'EDITORIAL: SHOULD WE BE NAMING THE MUTANTS?',
    'CLASSIFIEDS: WANTED, ONE (1) LEFT BOOT. NO QUESTIONS',
    'SECURITY CHIEF: "WE HAVE THE PERIMETER MOSTLY SURROUNDED"',
    'COMMISSION MEETING RUNS 4 HOURS, ENDS IN AGREEMENT ON SNACKS',
    `${Math.max(1, G.stats.hostilesKilled)} HOSTILES TURNED AWAY SINCE FOUNDING, GUARDS REPORT`,
  ];
  if (c.chickens || c.cattle) pool.push('BATTERY HENS DECLINE TO COMMENT', 'FEEDLOT EXPANSION: "IT IS A LOT OF COWS," CONFIRMS OFFICIAL');
  if (c.evplant) pool.push('ELECTRIC CAR STOPS AT JUNCTION; CROWD GATHERS TO WATCH IT GO', 'EV OWNERS FORM CLUB, DISCUSS EVs');
  if (c.windmill || c.solar) pool.push('WIND TURBINE SPINS; EXPERTS CREDIT WIND', 'SOLAR ARRAY "JUST SITTING THERE", SAYS CRITIC; LIGHTS STAY ON');
  if (c.park) pool.push('PARK OPENS; RESIDENTS TOUCH GRASS FOR FIRST TIME IN YEARS');
  if (c.mall || c.store) pool.push('GENERAL STORE NOW STOCKS "THINGS"; SHOPPERS DELIGHTED');
  if (G.research.done.petro) pool.push('VINYL SIDING CRAZE SWEEPS TOWN: "TEAL IS BACK"');
  if (G.settlements.length > 1) pool.push(`ROAD TO ${G.settlements[G.settlements.length - 1].name.toUpperCase()} OPEN; TRAFFIC "ONE TRUCK, LIGHT"`);
  if (G.stats.killed) pool.push('COMMISSION REMINDS SETTLERS: DO NOT HUG THE MUTANTS');
  return 'THE WASTELAND GAZETTE · ' + r(pool);
}
export { esc, ICON, ROAD_COST };
