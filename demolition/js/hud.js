// DOM overlay: readouts, prompt, event log, objectives, end-of-shift incident report.
const $ = id => document.getElementById(id);
const money = v => '$' + Math.round(v).toLocaleString('en-US');

export class HUD {
  constructor() {
    this.el = { damage: $('damage'), timer: $('timer'), temp: $('temp'), cooling: $('cooling'), power: $('power'), fire: $('fire'), net: $('net'),
      prompt: $('prompt'), tool: $('tool'), log: $('log'), obj: $('objectives'), health: $('health'), outage: $('outage') };
    this.shownDamage = 0; this.logLines = []; this.lastPrompt = '';
  }
  prompt(t) { if (t === this.lastPrompt) return; this.lastPrompt = t; this.el.prompt.textContent = t; this.el.prompt.style.opacity = t ? '1' : '0'; }
  tool(name, hint) { this.el.tool.innerHTML = `<b>${name}</b><span>${hint}</span>`; }
  log(msg, cls = '') {
    this.logLines.push({ msg, cls, t: performance.now() });
    if (this.logLines.length > 7) this.logLines.shift();
    this.el.log.innerHTML = this.logLines.map(l => `<div class="${l.cls}">${l.msg}</div>`).join('');
  }
  update(s, dt) {
    this.shownDamage += (s.ledger.total - this.shownDamage) * Math.min(1, dt * 4);
    this.el.damage.textContent = money(this.shownDamage);
    const left = Math.max(0, s.shiftLeft); this.el.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    this.el.temp.textContent = `${s.thermal.inlet.toFixed(1)} °C`;
    this.el.temp.className = s.thermal.inlet > 45 ? 'bad' : s.thermal.inlet > 35 ? 'warn' : s.thermal.inlet > 27 ? 'note' : '';
    this.el.cooling.textContent = `${s.thermal.cracRunning}/${s.thermal.cracTotal} CRAC · ${Math.round(s.thermal.coolKW)} / ${Math.round(s.thermal.itKW)} kW`;
    this.el.cooling.className = s.thermal.coolKW < s.thermal.itKW ? 'bad' : '';
    this.el.power.textContent = s.power.epo ? 'EPO — HALL DARK' : `A ${s.power.feedA ? 'live' : 'DEAD'} · B ${s.power.feedB ? 'live' : 'DEAD'} · ${s.power.racksPowered}/${s.power.racksTotal} racks`;
    this.el.power.className = s.power.epo || (!s.power.feedA && !s.power.feedB) ? 'bad' : (!s.power.feedA || !s.power.feedB) ? 'warn' : '';
    this.el.fire.textContent = s.fire.label; this.el.fire.className = s.fire.cls;
    this.el.net.textContent = s.net.label; this.el.net.className = s.net.cls;
    this.el.outage.textContent = `${s.offline}/${s.power.racksTotal} offline · ${money(s.ledger.downtime)} downtime`;
    this.el.health.style.width = `${Math.max(0, s.health)}%`;
    this.el.health.parentElement.style.opacity = s.health < 100 ? '1' : '0';
    const now = performance.now();
    this.logLines.forEach((l, i) => { const d = this.el.log.children[i]; if (d) d.style.opacity = String(Math.max(0.25, 1 - (now - l.t) / 14000)); });
  }
  objectives(list) {
    this.el.obj.innerHTML = '<b>Shift objectives</b>' + list.map(o => `<div class="${o.done ? 'done' : ''}">${o.done ? '☑' : '☐'} ${o.text}</div>`).join('');
  }
  report(s, cause) {
    const L = s.ledger;
    const rows = Object.entries(L.items).filter(([, v]) => v.count > 0 || v.cost > 0).sort((a, b) => b[1].cost - a[1].cost)
      .map(([k, v]) => `<tr><td>${v.label}</td><td>${v.count ? v.count.toLocaleString() : ''}</td><td>${money(v.cost)}</td></tr>`).join('');
    $('report-body').innerHTML = `
      <p class="cause">${cause}</p>
      <table><thead><tr><th>Item</th><th>Qty</th><th>Cost</th></tr></thead><tbody>${rows}
      <tr><td>Downtime (${s.ledger.outageMinutes.toFixed(1)} rack-weighted minutes at ${money(9000)}/min)</td><td></td><td>${money(L.downtime)}</td></tr></tbody>
      <tfoot><tr><td>Total</td><td></td><td>${money(L.total)}</td></tr></tfoot></table>
      <p class="facts">${s.facts.join(' ')}</p>`;
    $('report').classList.add('show');
  }
}
