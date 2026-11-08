// ---- settings
Object.assign(S, SCENE.defaults);
try { Object.assign(S, JSON.parse(localStorage.getItem(SCENE.key + '.settings') || '{}')); } catch (e) {}
if (SCENE.validate) SCENE.validate(S);
const saveSettings = () => { if (LEADER) try { localStorage.setItem(SCENE.key + '.settings', JSON.stringify(S)); } catch (e) {} };

// ---- the scene across browser windows: one window thinks, the others draw what it says
let channel = null, cid = hash.cid || '', netT = 0;
function openChannel(id) {
  if (channel) channel.close(); cid = id; channel = new BroadcastChannel(SCENE.key + '-' + id);
  channel.onmessage = (e) => {
    const m = e.data;
    if (LEADER) { if (m.t === 'hello') channel.postMessage({ t: 'world', W, H, seed: SEED, S: { ...S } }); else if (m.t === 'act') act(m.tool, m.x, m.y, m.phase, m.dx, m.dy); else if (m.t === 'stop') stopSaver(); return; }
    if (m.t === 'world') { W = m.W; H = m.H; SEED = m.seed; Object.assign(S, m.S); SCENE.build(); }
    else if (m.t === 'f') { if (SCENE.netApply) SCENE.netApply(m.d); }
    else if (m.t === 'settings') { const prev = { ...S }; Object.assign(S, m.S); if (SCENE.changed) for (const k in m.S) if (prev[k] !== m.S[k]) SCENE.changed(k); }
    else if (m.t === 'stop') { try { window.close(); } catch (e) {} }
  };
}

// ---- input and controls
const $ = (id) => document.getElementById(id);
const toolsEl = $('tools'), panel = $('panel'), menuBtn = $('menuBtn'), toast = $('toast');
let toastT = 0, idleT = 0;
function say(msg, ms = 2800) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), ms); }
function act(tool, x, y, phase, dx, dy) { if (!LEADER) { channel && channel.postMessage({ t: 'act', tool, x, y, phase, dx, dy }); return; } SCENE.act(tool, x, y, phase, dx || 0, dy || 0); }
function buildTools() {
  toolsEl.innerHTML = '';
  for (const t of SCENE.tools) { if (!t) { toolsEl.appendChild(document.createElement('i')); continue; } const b = document.createElement('button'); b.textContent = t[1]; b.dataset.tool = t[0]; if (S.tool === t[0]) b.className = 'on'; b.onclick = () => { if (t[2]) { t[2](); return; } S.tool = t[0]; saveSettings(); toolsEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.tool === S.tool)); }; toolsEl.appendChild(b); }
}
function changed(key) { saveSettings(); if (channel) channel.postMessage({ t: 'settings', S: { ...S } }); if (key && SCENE.changed) SCENE.changed(key); }
const ui = {
  row(label) { const d = document.createElement('div'); d.className = 'row'; const l = document.createElement('label'); l.textContent = label; d.appendChild(l); panel.appendChild(d); return [d, l]; },
  sel(label, key, table, nameOf) { const [d] = ui.row(label); const s = document.createElement('select'); for (const k in table) { const o = document.createElement('option'); o.value = k; o.textContent = nameOf ? nameOf(table[k]) : table[k].name || table[k]; s.appendChild(o); } s.value = S[key]; s.setAttribute('aria-label', label); s.onchange = () => { S[key] = s.value; changed(key); }; d.appendChild(s); },
  seg(label, key, opts) { const [d] = ui.row(label); const w = document.createElement('div'); w.className = 'seg'; for (const [v, t] of opts) { const b = document.createElement('button'); b.textContent = t; b.className = String(S[key]) === String(v) ? 'on' : ''; b.onclick = () => { S[key] = v; changed(key); w.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }; w.appendChild(b); } d.appendChild(w); },
  tog(label, key) { const l = document.createElement('label'); l.className = 'tog'; l.textContent = label; const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!S[key]; c.onchange = () => { S[key] = c.checked; changed(key); }; l.appendChild(c); panel.appendChild(l); },
  range(label, key, min, max, step, fmt) { const [d, l] = ui.row(label); const b = document.createElement('b'); const f = fmt || (v => v); b.textContent = f(S[key]); l.appendChild(b); const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = S[key]; r.setAttribute('aria-label', label); r.oninput = () => { S[key] = +r.value; b.textContent = f(S[key]); changed(key); }; d.appendChild(r); },
};
function buildPanel() {
  panel.innerHTML = `<h2>${SCENE.panelTitle}</h2><p class="sub">${SCENE.panelSub}</p>`;
  SCENE.panel(ui);
  const btns = document.createElement('div'); btns.className = 'btns'; panel.appendChild(btns);
  const addBtn = (t, fn, cls) => { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = fn; btns.appendChild(b); return b; };
  if (!HOST) {
    addBtn('Fullscreen', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
    addBtn('Every monitor', () => spread());
    addBtn('Screensaver mode', () => goSaver());
  } else addBtn('Quit', () => hostPost('exit'));
  addBtn('Show stats', () => { S.stats = !S.stats; saveSettings(); $('stats').classList.toggle('on', S.stats); });
  const note = document.createElement('p'); note.className = 'note'; note.textContent = HOST ? 'Esc quits.' : 'Space hides everything. Settings are saved between visits.'; panel.appendChild(note);
}
menuBtn.onclick = () => { const o = panel.classList.toggle('open'); menuBtn.setAttribute('aria-expanded', o ? 'true' : 'false'); menuBtn.textContent = o ? 'Close' : 'Customize'; };

function worldAt(ev) {
  const k = canvas.width / (canvas.clientWidth || canvas.width), px = ev.clientX * k, py = ev.clientY * k;
  for (const v of views) if (px >= v.cx && px < v.cx + v.cw && py >= v.cy && py < v.cy + v.ch) return [v.wx + (px - v.cx) / v.cw * v.ww, (py - v.cy) / v.ch * v.wh];
  return null;
}
let dragging = false, lastW = null;
canvas.addEventListener('pointerdown', (e) => { if (EMBED || HOST === 'saver' || saverOn) return; const w = worldAt(e); if (!w) return; dragging = true; lastW = w; act(S.tool, w[0], w[1], 'down', 0, 0); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!dragging) return; const w = worldAt(e); if (!w) return; act(S.tool, w[0], w[1], 'drag', w[0] - lastW[0], w[1] - lastW[1]); lastW = w; });
addEventListener('pointerup', () => { if (dragging && lastW) act(S.tool, lastW[0], lastW[1], 'up', 0, 0); dragging = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function wake() { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => { if (!panel.classList.contains('open')) document.body.classList.add('idle'); }, 3200); }
addEventListener('pointermove', wake); addEventListener('pointerdown', wake);
addEventListener('keydown', (e) => {
  if (HOST === 'saver' || saverOn) return;
  if (e.key === 'Escape' && HOST) hostPost('exit');
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); document.body.classList.toggle('idle'); }
  const n = +e.key, real = SCENE.tools.filter(Boolean); if (n >= 1 && n <= real.length) { const b = toolsEl.querySelector(`[data-tool="${real[n - 1][0]}"]`); if (b) b.click(); }
});

// ---- browser screensaver mode and spreading over monitors (Chrome/Edge; one popup per click)
let saverOn = false, saverOrigin = null, saverArm = 0, details = null, queue = [], popups = [];
function goSaver() { document.documentElement.requestFullscreen().catch(() => {}); saverOn = true; saverArm = performance.now() + 1200; saverOrigin = null; document.body.classList.add('saver'); panel.classList.remove('open'); }
function stopSaver() { saverOn = false; document.body.classList.remove('saver'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); for (const w of popups) try { w.close(); } catch (e) {} popups = []; if (channel) channel.postMessage({ t: 'stop' }); }
addEventListener('mousemove', (e) => { if (!saverOn || performance.now() < saverArm) return; if (!saverOrigin) { saverOrigin = [e.screenX, e.screenY]; return; } if (Math.hypot(e.screenX - saverOrigin[0], e.screenY - saverOrigin[1]) > 14) stopSaver(); });
for (const ev of ['mousedown', 'keydown', 'wheel']) addEventListener(ev, () => { if (saverOn && performance.now() >= saverArm) stopSaver(); }, { passive: true });
async function spread() {
  if (!window.getScreenDetails) { say('This browser can only use one screen. Chrome or Edge can use them all.'); return; }
  if (!details) {
    try { details = await window.getScreenDetails(); } catch (e) { say('Permission declined, so just this screen.'); details = null; return; }
    if (details.screens.length < 2) { say('Only one monitor here.'); details = null; return; }
    const sorted = [...details.screens].sort((a, b) => a.left - b.left), list = sorted.map(s => { const d = s.devicePixelRatio || 1; return { s, w: Math.round(s.width * d), h: Math.round(s.height * d) }; });
    let wx = 0; for (const i of list) { i.wx = wx; wx += i.w; }
    const totalW = wx, totalH = Math.max(...list.map(i => i.h)), mine = list.find(i => i.s === details.currentScreen) || list[0];
    multi = { W: totalW, H: totalH, wx: mine.wx, ww: mine.w, wh: mine.h, list };
    layout(); SCENE.build();
    const id = Math.random().toString(36).slice(2, 10); openChannel(id);
    queue = list.filter(i => i !== mine);
    say(`${list.length} monitors found. Click Every monitor once per extra screen.`, 5000);
    return;
  }
  if (queue.length) {
    const i = queue.shift(), s = i.s, mons = multi.list.map(l => [l.wx, l.w, l.h, 1].join(',')).join(';'), url = location.href.replace(/#.*$/, '') + `#pane=1&cid=${cid}&wx=${i.wx}&ww=${i.w}&wh=${i.h}&W=${multi.W}&H=${multi.H}&seed=${SEED}&mons=${encodeURIComponent(mons)}`;
    const w = window.open(url, '_blank', `popup,left=${s.availLeft},top=${s.availTop},width=${s.availWidth},height=${s.availHeight}`);
    if (w) popups.push(w);
    say(queue.length ? `Opened. ${queue.length} more to go.` : 'All open. Click once inside each new window to fill its screen.', 5000);
  } else say('Every monitor already has its window. Click inside each to fill the screen.', 4000);
}
if (IS_PANE) { const card = $('paneCard'); card.style.display = 'grid'; card.onclick = () => { document.documentElement.requestFullscreen().catch(() => {}); card.style.display = 'none'; }; }

// ---- go
let last = performance.now(), fps = 60, frameCount = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!W) return;
  const dt = Math.min(.05, Math.max(.001, (now - last) / 1000)); last = now; fps = lerp(fps, 1 / dt, .05); frameCount++;
  if (bakeQ.length) runBakes();
  if (!baked) return;
  SCENE.sim(dt, now / 1000);
  if (channel && LEADER && SCENE.netState) { netT -= dt; if (netT <= 0) { netT = 1 / 30; channel.postMessage({ t: 'f', d: SCENE.netState() }); } }
  SCENE.render(now / 1000);
  if (S.stats && frameCount % 15 === 0) $('stats').innerHTML = (SCENE.stats ? SCENE.stats() + '<br>' : '') + fps.toFixed(0) + ' fps';
}
function boot() {
  if (!innerWidth || !innerHeight) { setTimeout(boot, 100); return; }
  layout();
  if (LEADER) SCENE.build(); else { openChannel(cid); channel.postMessage({ t: 'hello' }); }
  buildTools(); buildPanel();
  if (S.stats) $('stats').classList.add('on');
  if (HOST === 'config') { panel.classList.add('open'); menuBtn.textContent = 'Close'; }
  if (LEADER && !EMBED && HOST !== 'saver' && SCENE.hello) say(SCENE.hello, 6000);
  wake();
  requestAnimationFrame(frame);
}
let resizeT = 0;
addEventListener('resize', () => { if (hostRects) return; if (screenRects) { layout(); return; } clearTimeout(resizeT); resizeT = setTimeout(() => { layout(); if (LEADER && !multi) SCENE.build(); }, 260); });
if (navigator.wakeLock && (HOST || EMBED)) navigator.wakeLock.request('screen').catch(() => {});
window.__saver = { S, act, SCENE, get views() { return views; }, get W() { return W; }, get H() { return H; }, get baked() { return baked; }, get fps() { return fps; }, get bakeLeft() { return bakeQ.length; }, changed };
boot();
