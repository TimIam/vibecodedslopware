// The hidden debug screen: Shift+Ctrl+Comma+Period from anywhere. Jump to any race of either season,
// edit the other teams, read their numbers, open any minigame and, mid-race, edit the cars.
import { W, H, rect, panel, shade, tyreIcon } from './gfx.js';
import { text, measure } from './font.js';
import { TEAMS, DRIVERS, COMPOUNDS, COMPOUND_ORDER, PEOPLE } from './data.js';
import { TANK } from './race.js';
import { calendar, TIME_NAME } from './season.js';
import * as C from './custom.js';
import * as A from './audio.js';

const GAMES = [['fishing', 'FLY FISHING: CREW CHIEF'], ['arcade', 'ARCADE: TYRES, JACK, FUEL'], ['bar', 'SNOOKER: TEAM PRINCIPAL'], ['jetski', 'JETSKIS: BOTH DRIVERS'], ['hiking', 'HIKING: CHIEF ENGINEER'], ['splash', 'MIDSEASON SPLASH'], ['laurels', 'REST ON YOUR LAURELS'], ['season', 'SEASON REVIEW SCREEN']];
const COLS = [['LIVERY', 'c1'], ['ACCENT', 'c2'], ['HELMET', 'helmet']];
const CAR_ROWS = ['car', 'fuel', 'compound', 'tw1', 'tw3', 'tw0', 'tw2', 'puncture', 'damage', 'cold', 'fresh', 'back'];
const TYRE_NAME = { tw1: 'FRONT LEFT', tw3: 'FRONT RIGHT', tw0: 'REAR LEFT', tw2: 'REAR RIGHT' };

export function makeDebug(h) {
  const { g, button, ui, typer, cv } = h;
  let page = 'main', sel = 0, items = [], teamId = null, carI = 0, row = 0, editing = null, before = '', t = 0;
  const open = p => { page = p; sel = 0; row = 0; };
  const race = () => { const f = self.from; return f && f.S && f.S.race ? f.S.race : null; };
  const SL = { x: 262, w: 196 };
  const rowY = i => 22 + i * 19;

  function header(mid) {
    rect(g, 0, 0, W, H, '#07090f');
    for (let y = 12; y < H; y += 4) rect(g, 0, y, W, 1, '#0b0e16');
    rect(g, 0, 0, W, 12, '#05060a'); rect(g, 0, 11, W, 1, '#2a3040');
    text(g, 'DEBUG', 4, 3, '#ff5a8a');
    text(g, mid, W / 2, 3, '#ffffff', { align: 'center' });
    text(g, 'ESC: BACK', W - 4, 3, '#9aa8c8', { align: 'right' });
  }
  // A list of big buttons: keyboard works through whatever is in `items`.
  function btn(x, y, w, hh, label, fn, opt = {}) {
    const i = items.length;
    items.push({ fn });
    button(x, y, w, hh, label, () => { sel = i; fn(); }, { hot: sel === i, color: '#3a6a9a', ...opt });
  }
  function jump(mode, i) { h.jumpTo(mode, i); }

  // ---------------------------------------------------------------- pages
  const PAGES = {
    main() {
      header('MENU');
      const list = [['ANY RACE, ANY SEASON', () => open('races')], ['OTHER TEAMS: NAMES AND COLOURS', () => open('teams')], ['RIVAL STATS AND SCORES', () => open('stats')], ['RACE RESULTS, ALL TEAMS', () => open('results')], ['MINIGAMES', () => open('games')]];
      if (race()) list.unshift(['CARS IN THIS RACE', () => open('cars')]);
      list.push(['CLOSE', () => close()]);
      list.forEach(([l, fn], i) => btn(W / 2 - 110, 36 + i * 28, 220, 22, l, fn));
    },
    races() {
      header('ANY RACE, ANY SEASON');
      const sv = h.save(), cur = sv.mode || 'short';
      text(g, 'SHORT SEASON', 16, 20, '#ffd23a');
      text(g, 'LONG SEASON', 262, 20, '#ffd23a');
      const row1 = (mode, tr, i, x, y, w) => {
        const tag = `R${i + 1} ${tr.name.toUpperCase()} ${TIME_NAME[tr.time]}${tr.weather.some(q => q.wet) ? ' RAIN' : ''}`;
        btn(x, y, w, 15, tag, () => jump(mode, i), { color: mode === cur && i === sv.round ? '#3a9a5a' : '#3a6a9a' });
      };
      calendar('short').forEach((tr, i) => row1('short', tr, i, 12, 31 + i * 17, 236));
      calendar('long').forEach((tr, i) => row1('long', tr, i, 262, 31 + i * 17, 238));
      ['GREEN IS WHERE THE SEASON IS NOW.', 'JUMPING MOVES THE SAVE THERE.', 'GOING BACK TAKES THOSE ROUNDS', 'OFF THE POINTS.'].forEach((l, i) => text(g, l, 12, 146 + i * 10, '#6a7898'));
      btn(12, 262, 100, 18, 'BACK', () => open('main'));
    },
    teams() {
      header('OTHER TEAMS');
      TEAMS.slice(1).forEach((tm, i) => {
        const y = 28 + i * 44, r = C.rivals[tm.id];
        panel(g, 12, y, 488, 40);
        rect(g, 20, y + 7, 26, 12, tm.c1); rect(g, 20, y + 16, 26, 4, tm.c2); rect(g, 40, y + 9, 4, 4, tm.helmet);
        text(g, tm.name.toUpperCase(), 54, y + 7, '#ffffff');
        text(g, `${r.d[0].join(' ')}  /  ${r.d[1].join(' ')}`, 54, y + 17, '#9ad8ff');
        text(g, `PRINCIPAL ${r.boss}   CHIEF ${r.chief}`, 54, y + 27, '#8a96b0');
        btn(420, y + 10, 72, 20, 'EDIT', () => { teamId = tm.id; open('team'); });
      });
      btn(12, 212, 200, 20, 'RESET ALL TO DEFAULTS', () => { C.resetRivals(); h.changed(); }, { color: '#9a5a3a' });
      btn(12, 262, 100, 18, 'BACK', () => open('main'));
    },
    team() {
      const tm = TEAMS.find(q => q.id === teamId);
      header(tm.name.toUpperCase());
      panel(g, 6, 18, 500, 236);
      C.RIVAL_FIELDS.forEach(([label, key], i) => {
        const y = 26 + i * 18, idx = items.length, on = sel === idx, ed = editing === key;
        items.push({ fn: () => startEdit(key) });
        text(g, label, 14, y + 3, on ? '#ffd23a' : '#8a96b0');
        rect(g, 130, y, 210, 14, '#05060a'); rect(g, 131, y + 1, 208, 12, ed ? '#22304a' : on ? '#1a2234' : '#121624');
        const v = C.rivalGet(teamId, key);
        text(g, v, 135, y + 3, ed ? '#ffffff' : '#e8e6dc');
        if (ed && (t * 2 % 1) < 0.6) rect(g, 135 + measure(v) + 1, y + 2, 1, 10, '#7cff8a');
        text(g, C.rivalDefaultOf(teamId, key), 348, y + 3, '#4a5878');
        ui.push({ x: 130, y, w: 210, h: 14, fn: () => { sel = idx; startEdit(key); } });
      });
      COLS.forEach(([label, key], ci) => {
        const y = 158 + ci * 20, idx = items.length, on = sel === idx;
        items.push({ fn: () => cycle(key, 1), cycle: d => cycle(key, d) });
        text(g, label, 14, y + 3, on ? '#ffd23a' : '#8a96b0');
        C.PALETTE.forEach((col, k) => {
          const x = 130 + k * 15, cur = C.rivalGet(teamId, key) === col;
          rect(g, x - 1, y - 1, 15, 15, cur ? '#ffffff' : '#05060a'); rect(g, x, y, 13, 13, col);
          ui.push({ x: x - 1, y: y - 1, w: 15, h: 15, fn: () => { sel = idx; C.rivalSet(teamId, key, col); h.changed(); } });
        });
        const dv = C.rivalDefaultOf(teamId, key);
        rect(g, 382, y - 1, 15, 15, '#05060a'); rect(g, 383, y, 13, 13, dv);
        text(g, 'DEFAULT', 402, y + 3, '#4a5878');
      });
      btn(130, 226, 180, 18, 'RESET THIS TEAM', () => { C.resetRival(teamId); h.changed(); }, { color: '#9a5a3a' });
      btn(12, 262, 100, 18, 'BACK', () => open('teams'));
      text(g, editing ? 'TYPE, THEN ENTER. ESC UNDOES.' : 'ENTER OR CLICK TO TYPE. ARROWS CHANGE COLOURS.', 300, 268, '#6a7898', { align: 'center' });
    },
    stats() {
      header('RIVAL STATS AND SCORES');
      const sv = h.save(), log = (sv.log || []).filter(Boolean);
      const wins = new Map(), pods = new Map(), best = new Map(), teamW = {}, teamP = {};
      for (const race1 of log) for (const e of race1) {
        const code = e.i;
        if (e.pos === 1 && !e.dnf) { wins.set(code, (wins.get(code) || 0) + 1); teamW[e.t] = (teamW[e.t] || 0) + 1; }
        if (e.pos <= 3 && !e.dnf) { pods.set(code, (pods.get(code) || 0) + 1); teamP[e.t] = (teamP[e.t] || 0) + 1; }
        if (!e.dnf) best.set(code, Math.min(best.get(code) || 99, e.pos));
      }
      const hd = (s, x, y, a) => text(g, s, x, y, '#ffd23a', a ? { align: 'right' } : {});
      hd('TEAM', 14, 18); hd('LAP PACE', 186, 18, true); hd('PRINCIPAL', 196, 18); hd('CREW CHIEF', 306, 18); hd('PTS', 438, 18, true); hd('W', 468, 18, true); hd('POD', 500, 18, true);
      TEAMS.forEach((tm, i) => {
        const y = 29 + i * 12, r = C.rivals[tm.id];
        rect(g, 14, y, 3, 8, tm.c1);
        text(g, tm.name, 20, y, i ? '#c8ccd4' : '#ffffff');
        text(g, tm.pace.toFixed(2), 186, y, '#9aa8c8', { align: 'right' });
        text(g, r ? r.boss : cap(PEOPLE.boss.name), 196, y, '#8a96b0');
        text(g, r ? r.chief : cap(PEOPLE.mags.name), 306, y, '#8a96b0');
        text(g, String(sv.team[tm.id] || 0), 438, y, '#ffd23a', { align: 'right' });
        text(g, String(teamW[tm.id] || 0), 468, y, '#c8ccd4', { align: 'right' });
        text(g, String(teamP[tm.id] || 0), 500, y, '#c8ccd4', { align: 'right' });
      });
      hd('NO', 26, 96, true); hd('DRIVER', 34, 96); hd('TEAM', 176, 96); hd('SKILL', 330, 96, true); hd('PTS', 384, 96, true); hd('W', 416, 96, true); hd('POD', 454, 96, true); hd('BEST', 500, 96, true);
      DRIVERS.forEach((d, i) => {
        const y = 107 + i * 13, tm = TEAMS[d.team];
        rect(g, 8, y, 3, 8, tm.c1);
        text(g, String(d.num), 26, y, '#6a7898', { align: 'right' });
        text(g, d.name, 34, y, d.team ? '#c8ccd4' : '#ffffff');
        text(g, tm.short, 176, y, '#8a96b0');
        text(g, d.skill.toFixed(2), 330, y, '#9aa8c8', { align: 'right' });
        text(g, String(sv.drv[d.code] || 0), 384, y, '#ffd23a', { align: 'right' });
        text(g, String(wins.get(i) || 0), 416, y, '#c8ccd4', { align: 'right' });
        text(g, String(pods.get(i) || 0), 454, y, '#c8ccd4', { align: 'right' });
        text(g, best.has(i) ? 'P' + best.get(i) : '-', 500, y, '#c8ccd4', { align: 'right' });
      });
      text(g, 'LOWER PACE AND SKILL ARE FASTER.', 130, 256, '#6a7898');
      btn(12, 262, 100, 18, 'BACK', () => open('main'));
    },
    results() {
      header('RACE RESULTS, ALL TEAMS');
      const sv = h.save(), races = calendar(sv.mode || 'short'), log = sv.log || [];
      const cx = j => 140 + j * 62;
      TEAMS.forEach((tm, j) => { rect(g, cx(j), 18, 3, 8, tm.c1); text(g, tm.short.slice(0, 8), cx(j) + 5, 18, j ? '#c8ccd4' : '#ffffff'); });
      text(g, 'WINNER', 452, 18, '#ffd23a');
      races.forEach((tr, i) => {
        const y = 30 + i * 16;
        text(g, `R${i + 1} ${tr.name.toUpperCase()}`.slice(0, 22), 6, y, i < sv.round ? '#c8ccd4' : '#4a5878');
        const e = log[i];
        if (!e) { if (i < sv.round) text(g, 'NOT RECORDED', cx(0), y, '#4a5878'); return; }
        TEAMS.forEach((tm, j) => {
          const cars = e.filter(q => q.t === tm.id).map(q => q.dnf ? 'X' : q.pos);
          text(g, cars.join(' '), cx(j) + 5, y, j ? '#9aa8c8' : '#ffffff');
        });
        text(g, DRIVERS[e[0].i].code, 452, y, '#ffd23a');
      });
      if (!log.filter(Boolean).length) text(g, 'NO RACES RECORDED THIS SEASON YET.', W / 2, 250, '#6a7898', { align: 'center' });
      const ty = 30 + races.length * 16 + 2;
      text(g, 'POINTS', 6, ty, '#ffd23a');
      TEAMS.forEach((tm, j) => text(g, String(sv.team[tm.id] || 0), cx(j) + 5, ty, '#ffd23a'));
      btn(12, 262, 100, 18, 'BACK', () => open('main'));
    },
    games() {
      header('MINIGAMES');
      GAMES.forEach(([id, label], i) => btn(W / 2 - 110, 26 + i * 26, 220, 21, label, () => h.openGame(id)));
      btn(12, 262, 100, 18, 'BACK', () => open('main'));
    },
    cars() {
      const rc = race();
      if (!rc) return open('main');
      header(`${rc.track.name.toUpperCase()}: THE CARS`);
      panel(g, 6, 18, 180, 236);
      rc.cars.forEach((c, i) => {
        const y = 24 + i * 22, on = i === carI;
        rect(g, 11, y, 170, 20, on ? '#22304a' : '#121624');
        if (on) rect(g, 11, y, 2, 20, '#ffd23a');
        rect(g, 15, y + 3, 3, 14, c.team.c1);
        text(g, `P${c.pos}`, 24, y + 3, '#9aa8c8');
        text(g, c.code, 46, y + 3, c.player ? '#ffffff' : '#c8ccd4');
        text(g, `#${c.num}`, 72, y + 3, '#6a7898');
        tyreIcon(g, 104, y + 6, c.compound, 3);
        text(g, Math.max(0, c.fuel).toFixed(1), 176, y + 3, c.outOfFuel ? '#ff5a4a' : '#7cff8a', { align: 'right' });
        const flags = `${c.state === 'run' ? '' : c.state.toUpperCase() + ' '}${c.puncture ? 'PUNCT ' : ''}${c.damage ? 'WING ' : ''}${c.dnf ? 'DNF' : ''}`;
        text(g, flags, 24, y + 12, '#ff8a5a');
        ui.push({ x: 11, y, w: 170, h: 20, fn: () => { carI = i; } });
      });
      const c = rc.cars[carI];
      panel(g, 192, 18, 314, 236);
      const label = (r, s) => text(g, s, 200, rowY(r) + 4, row === r ? '#ffd23a' : '#8a96b0');
      CAR_ROWS.forEach((key, r) => {
        const y = rowY(r);
        if (key === 'car') { label(r, 'CAR'); text(g, `#${c.num} ${c.d.name.toUpperCase()}, ${c.team.short}`, SL.x, y + 4, '#ffffff'); }
        else if (key === 'fuel') slider(r, 'FUEL', Math.max(0, c.fuel) / TANK, `${Math.max(0, c.fuel).toFixed(1)} LAPS`);
        else if (key.startsWith('tw')) { const ti = +key[2]; slider(r, TYRE_NAME[key], Math.min(1, c.tw[ti]), `${Math.round(c.tw[ti] * 100)}% WORN`); }
        else if (key === 'compound') {
          label(r, 'TYRES ON');
          COMPOUND_ORDER.forEach((cp, k) => {
            const x = SL.x + k * 50, on = c.compound === cp;
            rect(g, x, y, 46, 15, '#05060a'); rect(g, x + 1, y + 1, 44, 13, on ? '#2a3a5a' : '#161a26');
            if (on) rect(g, x + 1, y + 13, 44, 1, '#ffd23a');
            tyreIcon(g, x + 8, y + 7, cp, 3);
            text(g, cp === 'medium' ? 'MED' : COMPOUNDS[cp].name, x + 14, y + 4, on ? '#ffffff' : '#9aa8c8');
            ui.push({ x, y, w: 46, h: 15, fn: () => { row = r; c.compound = cp; } });
          });
        }
        else if (key === 'puncture' || key === 'damage' || key === 'cold') {
          const name = { puncture: 'PUNCTURE', damage: 'WING DAMAGE', cold: 'COLD TYRES' }[key];
          label(r, name);
          const on = !!c[key];
          button(SL.x, y, 60, 15, on ? 'YES' : 'NO', () => { row = r; toggle(c, key); }, { hot: row === r, color: on ? '#b03a2a' : '#5c6a8a' });
        }
        else if (key === 'fresh') {
          label(r, 'QUICK');
          button(SL.x, y, 118, 15, 'FULL TANK, NEW TYRES', () => { row = r; fresh(c); }, { hot: row === r, color: '#3a9a5a' });
        }
        else if (key === 'back') button(SL.x, y, 60, 15, 'BACK', () => open('main'), { hot: row === r });
      });
      text(g, 'ARROWS PICK A LINE AND CHANGE IT. THE RACE IS FROZEN UNTIL YOU CLOSE THIS.', W / 2, 266, '#6a7898', { align: 'center' });
    },
  };
  const cap = s => s.charAt(0) + s.slice(1).toLowerCase();

  function slider(r, name, v, read) {
    const y = rowY(r), on = row === r;
    text(g, name, 200, y + 4, on ? '#ffd23a' : '#8a96b0');
    rect(g, SL.x - 1, y + 4, SL.w + 2, 7, '#05060a'); rect(g, SL.x, y + 5, Math.round(SL.w * v), 5, on ? '#ffd23a' : '#3ab04a');
    const kx = SL.x + Math.round(SL.w * v); rect(g, kx - 2, y + 1, 5, 13, '#05060a'); rect(g, kx - 1, y + 2, 3, 11, '#ffffff');
    text(g, read, 500, y + 4, '#c8ccd4', { align: 'right' });
    ui.push({ x: SL.x - 6, y, w: SL.w + 12, h: 15, fn: () => { row = r; setSlider(r, h.mouse().x); } });
  }
  function setSlider(r, x) { setValue(r, Math.max(0, Math.min(1, (x - SL.x) / SL.w))); }
  function setValue(r, v) {
    const c = race()?.cars[carI], key = CAR_ROWS[r];
    if (!c) return;
    if (key === 'fuel') { c.fuel = Math.round(v * TANK * 10) / 10; if (c.fuel > 0) c.outOfFuel = false; }
    else if (key.startsWith('tw')) { c.tw[+key[2]] = Math.round(v * 100) / 100; c.wear = Math.max(...c.tw); }
  }
  function valueOf(r) {
    const c = race()?.cars[carI], key = CAR_ROWS[r];
    if (key === 'fuel') return Math.max(0, c.fuel) / TANK;
    return Math.min(1, c.tw[+key[2]]);
  }
  function toggle(c, key) {
    if (key === 'puncture') { c.puncture = !c.puncture; if (c.puncture) c.box = true; else if (c.wear > 1) { c.tw = c.tw.map(v => Math.min(1, v)); c.wear = Math.max(...c.tw); } }
    else if (key === 'damage') c.damage = c.damage ? 0 : 1;
    else c.cold = c.cold ? 0 : 1;
    A.sfx('select');
  }
  function fresh(c) { c.fuel = TANK; c.outOfFuel = false; c.tw = [0, 0, 0, 0]; c.wear = 0; c.puncture = false; c.damage = 0; c.cold = 0; A.sfx('good'); }

  function startEdit(key) {
    editing = key; before = C.rivalGet(teamId, key);
    typer.value = before;
    setTimeout(() => { typer.focus(); try { typer.setSelectionRange(0, before.length); } catch (e) {} }, 0);
    A.sfx('select');
  }
  function cycle(key, d) {
    const i = C.PALETTE.indexOf(C.rivalGet(teamId, key));
    C.rivalSet(teamId, key, C.PALETTE[(i + d + C.PALETTE.length) % C.PALETTE.length]);
    h.changed(); A.sfx('move');
  }
  function close() { editing = null; h.setScene(self.from); }

  const self = {
    from: null,
    enter() { open('main'); editing = null; },
    update(dt) { t += dt; },
    draw() { items = []; PAGES[page](); sel = Math.min(sel, Math.max(0, items.length - 1)); },
    typed() {
      if (!editing) return;
      const v = typer.value.replace(/[^ -~]/g, '').slice(0, 20);
      if (v !== typer.value) typer.value = v;
      C.rivalSet(teamId, editing, v || C.rivalDefaultOf(teamId, editing));
      h.changed();
    },
    typeEnd(keep) {
      if (!editing) return;
      if (!keep) C.rivalSet(teamId, editing, before);
      else C.rivalSet(teamId, editing, typer.value.trim().replace(/\s+/g, ' ') || C.rivalDefaultOf(teamId, editing));
      h.changed();
      editing = null;
      typer.blur(); cv.focus();
    },
    drag(x, y) {
      if (page !== 'cars') return;
      for (let r = 0; r < CAR_ROWS.length; r++) {
        const key = CAR_ROWS[r];
        if ((key === 'fuel' || key.startsWith('tw')) && y >= rowY(r) && y < rowY(r) + 15 && x >= SL.x - 6 && x <= SL.x + SL.w + 6) { row = r; setSlider(r, x); }
      }
    },
    key(k) {
      if (page === 'cars') {
        const rc = race();
        if (k === 'esc') return open('main');
        if (!rc) return;
        const c = rc.cars[carI], key = CAR_ROWS[row], n = rc.cars.length;
        if (k === 'up') { row = (row + CAR_ROWS.length - 1) % CAR_ROWS.length; A.sfx('move'); }
        if (k === 'down') { row = (row + 1) % CAR_ROWS.length; A.sfx('move'); }
        const d = k === 'left' ? -1 : k === 'right' ? 1 : 0;
        if (d) {
          if (key === 'car') carI = (carI + d + n) % n;
          else if (key === 'fuel' || key.startsWith('tw')) setValue(row, Math.max(0, Math.min(1, valueOf(row) + d * 0.05)));
          else if (key === 'compound') c.compound = COMPOUND_ORDER[(COMPOUND_ORDER.indexOf(c.compound) + d + 4) % 4];
          A.sfx('move');
        }
        if (k === 'enter' || k === 'space') {
          if (key === 'puncture' || key === 'damage' || key === 'cold') toggle(c, key);
          else if (key === 'fresh') fresh(c);
          else if (key === 'back') open('main');
        }
        return;
      }
      if (k === 'esc') { if (page === 'main') close(); else if (page === 'team') open('teams'); else open('main'); return; }
      const n = items.length;
      if (!n) return;
      if (k === 'up') { sel = (sel + n - 1) % n; A.sfx('move'); }
      if (k === 'down') { sel = (sel + 1) % n; A.sfx('move'); }
      const it = items[sel];
      if ((k === 'left' || k === 'right') && it && it.cycle) it.cycle(k === 'left' ? -1 : 1);
      if ((k === 'enter' || k === 'space') && it) { A.sfx('select'); it.fn(); }
    },
    get page() { return page; },
  };
  return self;
}
