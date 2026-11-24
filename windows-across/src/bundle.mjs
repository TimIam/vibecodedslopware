// Bundles windows-across/src/*.js into the single-file windows-across/windows.html
// Supports browser interactive mode, #embed iframe/kiosk mode, and #host=saver native .scr mode.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(srcDir, '..');

function stripImportsExports(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^(\s*)export\s+(?=(const|let|var|function|class)\s)/gm, '$1');
}

const combinedJs = ['catalog.js', 'audio.js', 'simulation.js', 'renderer.js']
  .map((f) => `// === ${f} ===\n` + stripImportsExports(fs.readFileSync(path.join(srcDir, f), 'utf8')))
  .join('\n\n');

const bootJs = `
    const hashRaw = (location.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(hashRaw);
    const params = new URLSearchParams(location.search);
    const hostMode = hashParams.get('host') || '';
    const isEmbed = hashRaw === 'embed' || hashParams.has('embed') || hostMode === 'saver';
    const isConfig = hostMode === 'config';

    if (isEmbed || isConfig) {
      document.body.classList.add('embed');
    }

    const canvas = document.getElementById('scene');
    const hud = document.getElementById('hud');
    const clockEl = document.getElementById('clockReadout');
    const speedBtn = document.getElementById('speedBtn');
    const seasonSelect = document.getElementById('seasonSelect');
    const weatherSelect = document.getElementById('weatherSelect');
    const burnInBtn = document.getElementById('burnInBtn');
    const xrayBtn = document.getElementById('xrayBtn');
    const audioBtn = document.getElementById('audioBtn');
    const fullBtn = document.getElementById('fullBtn');
    const eventSelect = document.getElementById('eventSelect');
    const triggerBtn = document.getElementById('triggerBtn');
    const inspectorText = document.getElementById('inspectorText');
    const eventTicker = document.getElementById('eventTicker');

    const sim = new VoyeurSimulation();
    // Persist user settings between runs (so /c Settings in Windows Screen Saver carries into /s!)
    const PREF_KEY = 'windowsAcross.prefs.v1';
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      if (saved) {
        if (saved.season) {
          seasonSelect.value = saved.season;
          sim.season = saved.season === 'calendar' ? detectCalendarSeason() : saved.season;
        }
        if (saved.weather) { sim.weatherMode = saved.weather; weatherSelect.value = saved.weather; }
        if (typeof saved.burnIn === 'boolean') {
          sim.burnInProtection = saved.burnIn;
          burnInBtn.textContent = sim.burnInProtection ? 'Anti-Burn: Spaced' : 'Anti-Burn: Off';
          burnInBtn.classList.toggle('active', sim.burnInProtection);
        }
      }
    } catch {}

    function savePrefs() {
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify({
          season: seasonSelect.value,
          weather: sim.weatherMode,
          burnIn: sim.burnInProtection
        }));
      } catch {}
    }

    const renderer = new VoyeurRenderer(canvas, sim);
    const audio = new AmbientAudio();

    if (params.get('season')) {
      seasonSelect.value = params.get('season');
      sim.season = params.get('season') === 'calendar' ? detectCalendarSeason() : params.get('season');
    }
    if (params.get('weather')) {
      sim.weatherMode = params.get('weather');
      weatherSelect.value = sim.weatherMode;
    }
    if (params.get('xray') === '1') { sim.xrayMode = true; xrayBtn.classList.add('active'); }
    if (isEmbed || params.get('hud') === '0') {
      hud.classList.add('hidden');
      document.body.classList.add('idle');
    }
    if (params.get('event')) {
      sim.triggerEvent(params.get('event'), params.get('apt') || null);
      const advance = parseInt(params.get('advance') || '0', 10);
      for (let i = 0; i < advance; i++) sim.step();
    }

    let idleTimer = null;
    function wakeUi() {
      if (isEmbed || params.get('hud') === '0') return;
      document.body.classList.remove('idle');
      hud.classList.remove('hidden');
      clearTimeout(idleTimer);
      if (!isConfig) {
        idleTimer = setTimeout(() => {
          if (!hud.matches(':hover')) {
            hud.classList.add('hidden');
            document.body.classList.add('idle');
          }
        }, 6500);
      }
    }
    if (!isEmbed) {
      window.addEventListener('mousemove', wakeUi);
      window.addEventListener('mousedown', wakeUi);
      wakeUi();
    }

    function updateReadouts() {
      const hrs = String(Math.floor(sim.simTime / 60)).padStart(2, '0');
      const mins = String(Math.floor(sim.simTime % 60)).padStart(2, '0');
      clockEl.textContent = hrs + ':' + mins;
      eventTicker.textContent = sim.lastTicker;

      const targetId = renderer.hoveredAptId || renderer.selectedAptId;
      if (!targetId) {
        const shiftLabel = sim.burnInProtection
          ? (sim.camState === 'shifting' ? 'Micro-shifting view' : 'View steady')
          : 'Drift off';
        inspectorText.textContent = '8 floors · 24 units · 41 residents (' + shiftLabel + ') — hover/click any unit';
        return;
      }
      const apt = sim.apartments.find(a => a.id === targetId);
      if (!apt) return;
      const roomsStr = apt.rooms.map(r => r.type).join(' · ');
      const resStr = apt.residents.map(r => r.name + ': ' + r.activity).join(' | ');
      const visStr = apt.visitors.length ? ' | Responders: ' + apt.visitors.map(v => v.kind).join(', ') : '';
      inspectorText.textContent = 'APT ' + apt.id + ' (' + apt.label + ') [' + roomsStr + '] — ' + resStr + visStr;
    }

    canvas.addEventListener('mousemove', (e) => {
      if (isEmbed) return;
      renderer.hoveredAptId = renderer.hitTestApartment(e.clientX, e.clientY);
      canvas.style.cursor = renderer.hoveredAptId ? 'pointer' : 'default';
      updateReadouts();
    });
    canvas.addEventListener('mouseleave', () => { renderer.hoveredAptId = null; updateReadouts(); });
    canvas.addEventListener('click', (e) => {
      if (isEmbed) return;
      const hit = renderer.hitTestApartment(e.clientX, e.clientY);
      renderer.selectedAptId = hit === renderer.selectedAptId ? null : hit;
      updateReadouts();
    });

    speedBtn.addEventListener('click', () => {
      sim.simSpeed = sim.simSpeed === 1 ? 3 : 1;
      speedBtn.textContent = sim.simSpeed + 'x';
      speedBtn.classList.toggle('active', sim.simSpeed > 1);
    });
    seasonSelect.addEventListener('change', () => {
      sim.season = seasonSelect.value === 'calendar' ? detectCalendarSeason() : seasonSelect.value;
      const labels = {
        winter: 'Winter · Holidays (Christmas trees & Hanukkah menorahs)',
        halloween: 'Autumn · Halloween decorations & harvest moon',
        spring: 'Spring · Flower boxes & evening rain',
        summer: 'Summer · Clear starry night & fireflies'
      };
      sim.setTicker(labels[sim.season] || '');
      savePrefs();
      updateReadouts();
    });
    weatherSelect.addEventListener('change', () => { sim.weatherMode = weatherSelect.value; savePrefs(); });
    burnInBtn.addEventListener('click', () => {
      sim.burnInProtection = !sim.burnInProtection;
      burnInBtn.textContent = sim.burnInProtection ? 'Anti-Burn: Spaced' : 'Anti-Burn: Off';
      burnInBtn.classList.toggle('active', sim.burnInProtection);
      savePrefs();
    });
    xrayBtn.addEventListener('click', () => {
      sim.xrayMode = !sim.xrayMode;
      xrayBtn.classList.toggle('active', sim.xrayMode);
      xrayBtn.textContent = sim.xrayMode ? 'Layouts: On' : 'Layouts';
    });
    audioBtn.addEventListener('click', () => {
      const on = audio.toggle();
      audioBtn.textContent = on ? 'Sound: On' : 'Sound: Off';
      audioBtn.classList.toggle('active', on);
    });
    fullBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && hostMode === 'saver') {
        try { window.chrome?.webview?.postMessage('exit'); } catch {}
      }
      if (isEmbed) return;
      if (e.key === 'f' || e.key === 'F') fullBtn.click();
      if (e.key === 'h' || e.key === 'H') {
        hud.classList.toggle('hidden');
        document.body.classList.toggle('idle', hud.classList.contains('hidden'));
      }
    });
    triggerBtn.addEventListener('click', () => { sim.triggerEvent(eventSelect.value); updateReadouts(); });

    let notifiedReady = false;
    function loop() {
      for (let i = 0; i < sim.simSpeed; i++) sim.step();
      renderer.render();
      if (!notifiedReady) {
        notifiedReady = true;
        try { window.chrome?.webview?.postMessage('ready'); } catch {}
      }
      audio.update(sim.activeWeather(), sim.hasEmergencyArriving(), sim.frame / 60);
      if (sim.frame % 12 === 0) updateReadouts();
      if (params.get('still') !== '1') requestAnimationFrame(loop);
    }

    updateReadouts();
    loop();
`;

new Function(combinedJs + '\n' + bootJs);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Windows Across the Street · Vibe Coded Slopware</title>
  <meta name="description" content="Eight-story nocturnal apartment screensaver with 24 multi-room units, 41 autonomous residents, four seasons, street services, and spaced anti-burn-in drift." />
  <meta name="color-scheme" content="dark" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%230a1020'/><rect x='18' y='16' width='64' height='68' rx='4' fill='%23291e23'/><rect x='26' y='26' width='18' height='14' fill='%23ffcf87'/><rect x='56' y='26' width='18' height='14' fill='%23182338'/><rect x='26' y='50' width='18' height='14' fill='%237cd8ff'/><rect x='56' y='50' width='18' height='14' fill='%23ffcf87'/></svg>" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #04060c;
      --hud-bg: rgba(10, 14, 24, 0.84);
      --hud-border: rgba(148, 163, 184, 0.22);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #f59e0b;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
      background: var(--bg); color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
    }
    body { padding-top: 0 !important; }
    body.idle { cursor: none; }
    .site-topbar { transition: opacity 0.7s ease; }
    body.idle .site-topbar, body.embed .site-topbar { opacity: 0; pointer-events: none; display: none; }
    .stage {
      position: relative; width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center; background: #03050a;
    }
    canvas { width: 100%; height: 100%; object-fit: cover; display: block; cursor: default; }
    body.idle canvas { cursor: none; }
    .hud {
      position: fixed; left: 16px; right: 16px; bottom: 14px;
      display: flex; flex-direction: column; gap: 8px; padding: 10px 14px;
      background: var(--hud-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--hud-border); border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
      transition: opacity 0.6s ease, transform 0.45s ease; z-index: 20;
    }
    .hud.hidden { opacity: 0; transform: translateY(18px); pointer-events: none; }
    .hud-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
    .group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .clock { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; font-size: 13px; color: #f8fafc; letter-spacing: 0.04em; padding-right: 4px; }
    button, select {
      background: rgba(25, 33, 52, 0.88); color: var(--text);
      border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 6px;
      padding: 4px 9px; font-size: 12px; font-family: inherit; cursor: pointer;
    }
    button:hover, select:hover { background: rgba(40, 52, 78, 0.95); border-color: rgba(203, 213, 225, 0.4); }
    button.active { border-color: rgba(245, 158, 11, 0.65); color: #fde68a; }
    button.primary { background: var(--accent); color: #0f172a; border-color: var(--accent); font-weight: 600; }
    button.primary:hover { background: #fbbf24; }
    .status-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding-top: 4px; border-top: 1px solid rgba(148, 163, 184, 0.14);
    }
    #inspectorText { color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #eventTicker { color: var(--muted); flex-shrink: 0; max-width: 44%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
  </style>
  <link rel="stylesheet" href="/site-nav.css" />
</head>
<body>
  <nav class="site-topbar" aria-label="Site">
    <a class="site-home" href="/windows-across/" aria-label="Windows Across the Street info">← <span class="site-long">windows across the </span>street</a>
    <a class="site-coffee" href="https://buymeacoffee.com/twilliamja0" target="_blank" rel="noopener"><span aria-hidden="true">☕</span> Support<span class="site-long"> my streams</span></a>
  </nav>
  <script src="/site-nav.js"></script>
  <div class="stage"><canvas id="scene" width="1600" height="900"></canvas></div>
  <div id="hud" class="hud">
    <div class="hud-row">
      <div class="group">
        <span id="clockReadout" class="clock">22:35</span>
        <button id="speedBtn" title="Simulation speed">1x</button>
        <select id="seasonSelect" title="Season & Holidays">
          <option value="winter" selected>Winter · Holidays</option>
          <option value="halloween">Autumn · Halloween</option>
          <option value="spring">Spring · Mild</option>
          <option value="summer">Summer · Warm</option>
          <option value="calendar">Auto (Calendar)</option>
        </select>
        <select id="weatherSelect" title="Weather">
          <option value="auto" selected>Weather: Auto</option>
          <option value="snow">Snow</option>
          <option value="rain">Rain</option>
          <option value="storm">Storm</option>
          <option value="leaves">Autumn Leaves</option>
          <option value="clear">Clear</option>
        </select>
        <button id="burnInBtn" class="active" title="Spaced, almost imperceptible anti-burn-in camera shifts">Anti-Burn: Spaced</button>
        <button id="xrayBtn" title="Reveal 3-window apartment floorplans & doorways">Layouts</button>
        <button id="audioBtn" title="Toggle procedural ambient city & rain audio">Sound: Off</button>
        <button id="fullBtn" title="Toggle fullscreen (F)">Fullscreen</button>
      </div>
      <div class="group">
        <select id="eventSelect" title="Preview a street or apartment event">
          <option value="delivery">Package Delivery Van</option>
          <option value="fire">Kitchen Fire + Fire Truck</option>
          <option value="murder">Murder + Police Inspectors</option>
          <option value="medical">Medical + Ambulance</option>
          <option value="pizza">Late-Night Pizza Delivery</option>
          <option value="argument">Couple Argument</option>
          <option value="burglary">Dark Burglary</option>
          <option value="ufo">UFO Abduction</option>
          <option value="telescope">Telescope Spying Back</option>
          <option value="blackout">Floor Power Flicker</option>
          <option value="fuse">Blown Fuse</option>
          <option value="disco">Late-Night Party</option>
          <option value="random">Random Event</option>
        </select>
        <button id="triggerBtn" class="primary">Trigger</button>
      </div>
    </div>
    <div class="status-row">
      <div id="inspectorText">8 floors · 24 multi-room apartments · 41 residents — hover or click any apartment to inspect</div>
      <div id="eventTicker">Quiet winter night · 24 units · 41 residents</div>
    </div>
  </div>
  <script>
(() => {
${combinedJs}

// === main ===
${bootJs}
})();
  </script>
</body>
</html>
`;

const outPath = path.join(rootDir, 'windows.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Built ${outPath} (${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB)`);
