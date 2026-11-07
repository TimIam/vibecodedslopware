// Red Tag: you are the federal inspector. Renderer + post, camera, input, the shift clock and scoring.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { World } from './world.js';
import { genPark, INFO } from './gen.js';
import { COST, RANKS, VERDICT_SEV } from './code.js';
import * as UI from './ui.js';
import { Sfx } from './audio.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const LOW = qs.get('q') === 'low';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ------------------------------------------------------------------------------------------------ renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
const world = new World(renderer);
const scene = world.scene;
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 3000);
camera.position.set(0, 160, 220);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.42; controls.minDistance = 4; controls.maxDistance = 520;
controls.screenSpacePanning = false;

let composer = null, gtao = null;
function setupPost() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (!LOW) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2.0, scale: 1.0 });
    composer.addPass(gtao);
  }
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.18, 0.4, 1.6));
  composer.addPass(new OutputPass());
  if (!LOW) composer.addPass(new SMAAPass());
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  composer?.setSize(w, h);
}
addEventListener('resize', resize);

// ------------------------------------------------------------------------------------------------ state
const SAVE = 'rt_career_v1';
const freshCareer = () => ({ day: 1, score: 0, incidents: 0, rank: 0, bribes: 0, seed: (Math.random() * 1e9) | 0, history: [] });
let career;
try { career = JSON.parse(localStorage.getItem(SAVE)) || freshCareer(); } catch { career = freshCareer(); }
const saveCareer = () => { try { localStorage.setItem(SAVE, JSON.stringify(career)); } catch {} };

const G = { mode: 'title', park: null, time: COST.shiftStart, at: null, focus: null, marks: {}, seen: new Set(), verdicts: {}, bribed: {}, card: null, test: null, labels: [] };
window.__rtG = G;

// ------------------------------------------------------------------------------------------------ camera tween
let tween = null;
function flyTo(pos, target, dur = 1.3) {
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), k: 0, dur };
  controls.enabled = false;
}
function overviewView() {
  const ext = world.extent || 120;
  return { pos: V(-ext * 0.12, ext * 0.78, ext * 0.98 + 20), target: V(-ext * 0.16, 0, -ext * 0.1) };
}
function targetView(r) {
  const c = r.focus ? r.focus.clone() : r.group.position.clone();
  c.y = r.focusY;
  const out = r.door.clone().sub(r.group.position).setY(0).normalize();
  if (!isFinite(out.x)) out.set(0, 0, 1);
  const side = V(-out.z, 0, out.x);
  const d = r.size * 1.25 + 8;
  return { pos: c.clone().addScaledVector(out, d * 0.9).addScaledVector(side, d * 0.45).add(V(0, d * 0.42, 0)), target: c };
}

// ------------------------------------------------------------------------------------------------ flow
function newPark() {
  const seed = (career.seed + career.day * 7919) >>> 0;
  const day = career.day;
  G.park = genPark(Number(qs.get('seed')) || seed, Number(qs.get('day')) || day);
  G.time = COST.shiftStart; G.at = 'gate'; G.focus = null; G.marks = {}; G.seen = new Set(); G.verdicts = {}; G.bribed = {};
  world.build(G.park);
  makeLabels();
  const v = overviewView(); camera.position.copy(v.pos); controls.target.copy(v.target);
  world.setShadowFocus(V(0, 0, -20), world.extent + 20);
}

function showTitle() {
  G.mode = 'title';
  const el = UI.overlay(UI.titleHtml(career));
  $('tStart').onclick = () => { Sfx.unlock(); Sfx.click(); showBrief(); };
  const n = $('tNew'); if (n) n.onclick = () => { career = freshCareer(); saveCareer(); newPark(); showTitle(); };
}
function showBrief() {
  G.mode = 'brief';
  UI.overlay(UI.briefHtml(G));
  $('bIn').onclick = () => { Sfx.paper(); UI.overlay(null); startShift(); };
}
function startShift() {
  G.mode = 'overview';
  UI.hud(G); UI.sheetOverview(G, act);
  const v = overviewView(); flyTo(v.pos, v.target, 0.8);
}

function spend(min) {
  G.time += min;
  UI.hud(G);
  if (G.time >= COST.shiftEnd && !G.overtimeWarned) {
    G.overtimeWarned = true;
    UI.toast('17:00. Shift is over: finish up and clock out. Every minute past five costs points.', 4200);
  }
}

// walking: door → ring → around the ring → door
function routeTo(r) {
  const pts = [];
  const from = G.at === 'gate' ? null : world.targets.find(t => t.tg.id === G.at);
  const R = G.park.ringR;
  const start = from ? from.door.clone() : world.inspector.position.clone();
  pts.push(start);
  const ringA = from ? Math.atan2(from.ringPt.z, from.ringPt.x) : Math.PI / 2;
  if (!from) pts.push(V(0, 0, R));
  else pts.push(from.ringPt.clone());
  const ringB = Math.atan2(r.ringPt.z, r.ringPt.x);
  let d = ringB - ringA; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  const n = Math.ceil(Math.abs(d) / 0.12);
  for (let i = 1; i <= n; i++) { const a = ringA + d * i / n; pts.push(V(Math.cos(a) * R, 0, Math.sin(a) * R)); }
  pts.push(r.door.clone());
  let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
  return { pts, L };
}

function walkTo(i) {
  const r = world.targets[i];
  if (!r || G.mode === 'walking' || G.mode === 'testing') return;
  if (G.focus === r) return;
  if (G.focus) leave(true);
  UI.hideCard(); G.card = null;
  if (G.at === r.tg.id) { focus(r); return; }
  const route = routeTo(r);
  const min = Math.max(1, Math.round(route.L * COST.walkPerM));
  G.mode = 'walking';
  $('walkFx').classList.remove('hide'); $('walkFx').textContent = `Walking to ${r.tg.name} · ${Math.round(route.L)} m · ${min} min`;
  Sfx.steps(8);
  G.walk = { route, k: 0, dur: Math.min(3.2, Math.max(1.2, route.L / 60)), r, min };
  controls.enabled = false;
}

function finishWalk() {
  const { r, min } = G.walk;
  G.walk = null; $('walkFx').classList.add('hide');
  G.at = r.tg.id;
  spend(min);
  focus(r);
}

function focus(r) {
  G.focus = r; G.mode = 'focus';
  r.setMode('stop');
  world.focusId = r.tg.id;
  const v = targetView(r); flyTo(v.pos, v.target, 1.2);
  world.setShadowFocus(r.focus || r.group.position, r.size * 1.2 + 20);
  UI.sheetTarget(G, r, act);
  G.labels.forEach(l => l.visible = false);
}

function leave(silent) {
  const r = G.focus; if (!r) return;
  if (G.test) finishTest(true);
  r.setMode('run');
  world.focusId = null; G.focus = null; G.mode = 'overview';
  UI.hideCard(); G.card = null;
  UI.sheetOverview(G, act);
  G.labels.forEach(l => l.visible = true);
  if (!silent) { const v = overviewView(); flyTo(v.pos, v.target, 1.2); world.setShadowFocus(V(0, 0, -20), world.extent + 20); }
}

function findF(fid) { for (const t of G.park.targets) { const f = t.findings.find(f => f.id === fid); if (f) return { f, tg: t }; } return {}; }

function examine(fid) {
  if (G.mode !== 'focus') return;
  const { f } = findF(fid);
  if (!f) return;
  if (!G.seen.has(fid)) { G.seen.add(fid); spend(COST.examine); world.markerState(fid, G.marks[fid] || 'seen'); Sfx.paper(); }
  else Sfx.click();
  const r = G.focus, obj = r.anchors[fid];
  if (obj) {
    const p = obj.getWorldPosition(V(0, 0, 0));
    const out = p.clone().sub(r.group.position).setY(0);
    if (out.length() < 1) out.copy(r.door).sub(r.group.position).setY(0);
    out.normalize();
    const camDir = camera.position.clone().sub(p).setY(0).normalize();
    const dir = out.lerp(camDir, 0.5).normalize();
    const dist = f.kind === 'envelope' ? 14 : 4.2;
    flyTo(p.clone().addScaledVector(dir, dist).add(V(0, Math.max(1.2, dist * 0.35), 0)), p, 0.9);
  }
  G.card = f;
  UI.card(G, f, act);
  UI.sheetTarget(G, r, act);
}

function paper() {
  if (G.mode !== 'focus') return;
  const f = G.focus.tg.findings.find(f => f.group === 'paper');
  if (!G.seen.has(f.id)) { G.seen.add(f.id); spend(COST.paper); }
  Sfx.paper();
  G.card = f; UI.card(G, f, act); UI.sheetTarget(G, G.focus, act);
}

function test() {
  if (G.mode !== 'focus') return;
  const r = G.focus, f = r.tg.findings.find(f => f.group === 'test');
  if (!f) return;
  if (G.seen.has(f.id)) { G.card = f; UI.card(G, f, act); return; }
  G.seen.add(f.id); spend(COST.test);
  G.mode = 'testing';
  r.setMode('test');
  r.speedMul = Math.max(1, r.testDuration / 22);
  G.test = { r, f, t: 0 };
  G.card = f;
  UI.card(G, f, act, { running: true });
  world.hideMarkers = true;
  const v = targetView(r); flyTo(v.pos.clone().add(V(0, r.size * 0.2, 0)), v.target, 1.0);
  Sfx.whoosh(Math.min(6, r.testDuration / r.speedMul * 0.5));
}
function finishTest(silent) {
  const T = G.test; if (!T) return;
  G.test = null; world.hideMarkers = false;
  T.r.speedMul = 1; T.r.setMode('stop');
  if (silent) return;
  G.mode = 'focus';
  UI.card(G, T.f, act);
  UI.sheetTarget(G, T.r, act);
}

function mark(fid, m) {
  G.marks[fid] = G.marks[fid] === m ? undefined : m;
  if (!G.marks[fid]) delete G.marks[fid];
  world.markerState(fid, G.marks[fid] || 'seen');
  Sfx.click();
  if (G.card) UI.card(G, G.card, act);
  if (G.focus) UI.sheetTarget(G, G.focus, act);
}

function verdict(v) {
  const r = G.focus; if (!r) return;
  const tg = r.tg;
  G.verdicts[tg.id] = v;
  Sfx.stamp(v); UI.stampFx(v);
  updateLabel(r);
  UI.sheetTarget(G, r, act); UI.hud(G);
  // the owner sometimes tries to talk you out of a red tag
  if (v === 'redtag' && !G.bribed[tg.id] && Math.random() < 0.22) {
    G.bribed[tg.id] = 'offered';
    const amount = [200, 500, 500, 1000, 50][Math.floor(Math.random() * 5)];
    setTimeout(() => {
      UI.overlay(UI.bribeHtml(G, tg, amount));
      $('bbNo').onclick = () => { UI.overlay(null); Sfx.click(); UI.toast(`${G.park.owner} mutters something about "you people".`); };
      $('bbYes').onclick = () => {
        UI.overlay(null); G.bribed[tg.id] = amount; G.verdicts[tg.id] = 'approve'; Sfx.paper();
        updateLabel(r); UI.sheetTarget(G, r, act); UI.toast(`$${amount} richer. ${tg.name} is approved.`);
      };
    }, 950);
  }
}

// ------------------------------------------------------------------------------------------------ scoring
const HEADLINES = {
  coaster: ['{n} train finishes lap with noticeably fewer riders', 'Lap bar on {n} opens at the bottom of the drop; man lands in funnel cake stand, calls it "worth it"', '{n} derails, continues as a recreational vehicle'],
  ferris: ['{p}\'s ferris wheel breaks free, rolls into parking lot', 'Gondola door opens at the top of {n}; family loses picnic, dignity', '{n} now leans "about like Pisa", says county'],
  drop: ['{n} drop tower "just kept dropping", witnesses say', 'Riders on {n} report unscheduled visit to the basement'],
  swing: ['Swing seat from {n} found two towns over', '{n} rider clips lamp post at 40 mph, lamp post in critical condition'],
  pirate: ['{n} completes full loop for the first time; was not designed to', 'Pirate ship {n} lost at sea (parking lot)'],
  food: ['Health department: 41 guests ill after {n} corn dogs', '{n} fryer fire spotted from space'],
  firstaid: ['Guest with broken wrist treated by mascot after {n} found locked', 'Bee-sting victim waits two hours outside {n}'],
};
function scoreShift() {
  const rows = [], heads = [];
  let total = 0;
  for (const tg of G.park.targets) {
    const truth = ['approve', 'cite', 'redtag'][tg.truth];
    const v = G.verdicts[tg.id] || 'approve', auto = !G.verdicts[tg.id];
    const sv = VERDICT_SEV[v], st = tg.truth;
    let pts = 0; const notes = [];
    if (sv === st) { pts += 100; notes.push('Correct call.'); }
    else if (sv > st) { pts -= 60; notes.push(st === 0 ? 'Nothing was wrong. The owner is appealing.' : 'Too harsh: minor defects only.'); }
    else if (st === 2) { pts -= 250; notes.push('A major defect got through.'); heads.push(pickHead(tg)); }
    else { pts -= 60; notes.push('Missed a minor defect.'); }
    if (auto) pts -= 30;
    for (const f of tg.findings) {
      const m = G.marks[f.id];
      if (f.defect) {
        const what = `${f.label}: ${UI.sectionText(f.defect.code)} (${f.defect.sev === 2 ? 'major' : 'minor'})`;
        if (m === 'bad') { pts += 20; notes.push(`✓ ${what}`); }
        else if (m === 'ok') { pts -= 20; notes.push(`✕ Marked OK: ${what}`); }
        else notes.push(`· Missed: ${what}`);
      } else if (m === 'bad') { pts -= 20; notes.push(`✕ False flag: ${f.label}`); }
    }
    if (G.bribed[tg.id] > 0) notes.push(`Envelope: $${G.bribed[tg.id]}`);
    total += pts;
    rows.push({ tg, v, truth, pts, notes, auto });
  }
  const over = Math.max(0, G.time - COST.shiftEnd);
  const extra = [];
  if (over > 0) { const p = Math.round(over * 2); total -= p; extra.push(`Overtime ${Math.round(over)} min: −${p}`); }
  const bribes = Object.values(G.bribed).filter(x => x > 0);
  let fired = null;
  if (bribes.length && Math.random() < 0.3 * bribes.length) fired = `Internal Affairs found the envelope${bribes.length > 1 ? 's' : ''}. Turns out "THANKS" in crayon is evidence.`;
  return { rows, headlines: heads, total, extra, fired, out: UI.fmtTime(G.time), bribes: bribes.length };
}
// headlines for the specific major defect that got through, falling back to the ride type
const HEAD_BY_DEFECT = {
  bar: ['Restraint on {n} "more of a suggestion", rider reports from the duck pond'], latch: ['Gondola door on {n} opens at the top; family loses picnic, dignity'],
  belt: ['Child on {n} discovers what the little chain was for'], weld: ['Support on {n} "just sort of folded", witnesses say'],
  bolt: ['{n} wanders 3 m off its foundation during the lunch rush'], corrosion: ['{n} support rusts through; ride now leans "artistically"'],
  hot: ['Bearing on {n} seizes; riders stranded six hours, extremely sunburnt'], gz: ['Riders on {n} briefly experience 6 g and a past life'],
  neg: ['{n} riders achieve low orbit, return via funnel cake stand'], lat: ['{n} sharp turn rearranges riders alphabetically'],
  margin: ['Riders on {n} report unscheduled visit to the basement'], fin: ['{n} drop tower "just kept dropping", witnesses say'],
  missing: ['{n} fire extinguisher located, unfortunately after the fire'], ndt: ['Uninspected {n} inspected by gravity instead'],
  cap: ['{n} carries 40% over capacity; so does the ambulance'], estop: ['Operator hits E-stop on {n}; ride declines'],
  open: ['Guest gets 480-volt hairdo at {n} control panel'], close: ['{n} rider clips lamp post at 40 mph, lamp post in critical condition'],
  warm: ['Health department: 41 guests ill after {n} corn dogs'], empty: ['Guest with broken wrist treated by mascot after {n} found locked'],
  rpm: ['{n} reaches "ludicrous speed", says a rider, from a hedge'], angle: ['{n} completes full loop for the first time; was not designed to'],
  permit: ['{n} serves food without a permit, and also without food safety'], arb: ['{n} train rolls back down the lift hill, then up it, then down it'],
};
function pickHead(tg) {
  const worst = tg.findings.filter(f => f.defect?.sev === 2).map(f => (f.defect.v || '').split(',')[0]);
  const byD = worst.map(v => HEAD_BY_DEFECT[v === 'missing' && tg.type === 'drop' ? 'fin' : v]).find(Boolean);
  const a = byD || HEADLINES[tg.type];
  return a[Math.floor(Math.random() * a.length)].replace('{n}', tg.name).replace('{p}', G.park.name);
}

function endShift() {
  if (G.mode === 'report') return;
  if (G.focus) leave(true);
  const unst = G.park.targets.filter(t => !G.verdicts[t.id]).length;
  if (unst && !G.confirmEnd) {
    G.confirmEnd = true;
    UI.toast(`${unst} target${unst > 1 ? 's' : ''} not stamped: they open as approved. Click again to clock out.`, 3500);
    setTimeout(() => { G.confirmEnd = false; }, 3500);
    return;
  }
  G.confirmEnd = false;
  G.mode = 'report';
  const rep = scoreShift();
  career.score += rep.total;
  career.incidents += rep.headlines.length;
  career.bribes += rep.bribes;
  const oldRank = career.rank;
  career.rank = Math.max(career.rank, Math.min(RANKS.length - 1, Math.floor(Math.max(0, career.score) / 500)));
  if (career.incidents >= 3 && !rep.fired) rep.fired = 'Three incidents on your signature. The Administrator would like your badge, your clipboard and the hard hat.';
  if (career.rank > oldRank) rep.promo = RANKS[career.rank];
  career.history.push({ day: career.day, park: G.park.name, total: rep.total });
  career.day++;
  saveCareer();
  $('sheet').classList.add('hide'); UI.hideCard();
  UI.overlay(UI.reportHtml(G, rep));
  Sfx.stamp(rep.total >= 0 ? 'approve' : 'redtag');
  $('rNext').onclick = () => {
    if (rep.fired) career = freshCareer();
    saveCareer(); newPark(); showTitle();
  };
  $('rReview').onclick = () => { UI.overlay(null); G.mode = 'review'; reviewMode(); };
}

function reviewMode() {
  // after the report: markers show the truth, panel lists defects
  for (const sp of world.markers) {
    const { f } = findF(sp.userData.fid);
    world.markerState(f.id, f.defect ? 'bad' : 'ok');
  }
  $('sheet').classList.remove('hide');
  $('sheetHead').innerHTML = `<div class="kicker">Review · answers shown</div><h2>${G.park.name}</h2><div class="sub">Red markers had defects. Click a ride to look.</div>`;
  $('sheetBody').innerHTML = G.park.targets.map((tg, i) => `<div class="row" data-i="${i}"><div class="ic">${UI.ICON[tg.type]}</div><div class="t"><b>${tg.name}</b><span>${tg.findings.filter(f => f.defect).map(f => f.label).join(', ') || 'clean'}</span></div></div>`).join('') +
    '<div class="actions" style="margin-top:10px"><button class="btn primary" id="rvNext" style="grid-column:1/3">Next park</button></div>';
  $('sheetBody').querySelectorAll('.row').forEach(el => el.onclick = () => {
    const r = world.targets[+el.dataset.i]; world.focusId = r.tg.id; r.setMode('stop');
    const v = targetView(r); flyTo(v.pos, v.target, 1.0);
  });
  $('rvNext').onclick = () => { newPark(); showTitle(); $('sheet').classList.add('hide'); $('hud').classList.add('hide'); };
}

const act = {
  walk: walkTo, leave: () => leave(false), examine, paper, test, mark, verdict, endShift,
  book: () => UI.book(true, G.card?.defect ? null : null), brief: () => { UI.overlay(UI.briefHtml(G)); $('bIn').textContent = 'Back to work'; $('bIn').onclick = () => UI.overlay(null); },
  closeCard: () => { UI.hideCard(); G.card = null; },
  skipTest: () => { if (G.test) G.test.t = 1e9; },
};

// ------------------------------------------------------------------------------------------------ ride labels (overview)
function labelTex(tg, v) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  const col = v === 'redtag' ? '#e0352b' : v === 'cite' ? '#ffb23e' : v === 'approve' ? '#4fd18b' : '#d8f02a';
  g.fillStyle = 'rgba(12,17,28,0.85)'; roundRect(g, 4, 18, 504, 92, 46); g.fill();
  g.lineWidth = 6; g.strokeStyle = col; g.stroke();
  g.fillStyle = col; g.beginPath(); g.arc(64, 64, 26, 0, 7); g.fill();
  g.fillStyle = '#0c111c'; g.font = '800 32px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(v === 'redtag' ? '✕' : v === 'cite' ? '!' : v === 'approve' ? '✓' : '?', 64, 66);
  g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '700 40px "Barlow Condensed", sans-serif';
  let name = tg.name.toUpperCase(); while (g.measureText(name).width > 400) name = name.slice(0, -2);
  g.fillText(name, 104, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function makeLabels() {
  G.labels.forEach(l => { l.parent?.remove(l); l.material.map.dispose(); });
  G.labels = world.targets.map(r => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(r.tg, null), depthTest: false, transparent: true, sizeAttenuation: false }));
    const h = { coaster: 34, ferris: 30, drop: 8 + r.tg.spec.sections * 4 + 6, swing: 18, pirate: 22, food: 8, firstaid: 8 }[r.tg.type];
    const p = r.focus ? r.focus.clone() : r.group.position.clone(); p.y = h;
    sp.position.copy(p); sp.scale.set(0.15, 0.0375, 1); sp.renderOrder = 20; sp.userData.r = r;
    world.root.add(sp); r.label = sp; return sp;
  });
}
function updateLabel(r) { if (!r.label) return; r.label.material.map.dispose(); r.label.material.map = labelTex(r.tg, G.verdicts[r.tg.id]); r.label.material.needsUpdate = true; }

// ------------------------------------------------------------------------------------------------ input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null, hoverSp = null, lastMove = 0;
function pick(e) {
  const rc = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (G.mode === 'focus') {
    const vis = world.markers.filter(m => m.visible);
    const hit = ray.intersectObjects(vis, false)[0];
    return hit ? { marker: hit.object } : null;
  }
  if (G.mode === 'overview') {
    const labels = ray.intersectObjects(G.labels, false)[0];
    if (labels) return { target: labels.object.userData.r };
    const hits = ray.intersectObjects(world.targets.map(t => t.group), true);
    if (hits[0]) { let o = hits[0].object; while (o && !world.targets.find(t => t.group === o)) o = o.parent; const r = world.targets.find(t => t.group === o); if (r) return { target: r }; }
  }
  return null;
}
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', e => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
  if (moved > 6) return;
  const h = pick(e);
  if (!h) return;
  if (h.marker) examine(h.marker.userData.fid);
  if (h.target) walkTo(world.targets.indexOf(h.target));
});
canvas.addEventListener('pointermove', e => {
  const now = performance.now(); if (now - lastMove < 60) return; lastMove = now;
  if (e.buttons) { UI.tip(null); return; }
  const h = pick(e);
  if (hoverSp) hoverSp.userData.hover = false; hoverSp = null;
  if (h?.marker) {
    hoverSp = h.marker; hoverSp.userData.hover = true;
    const { f } = findF(h.marker.userData.fid);
    UI.tip(`<b>${f.n}. ${f.label}</b>${G.seen.has(f.id) ? '' : ` · ${COST.examine} min`}`, e.clientX, e.clientY);
    canvas.style.cursor = 'pointer';
  } else if (h?.target) {
    const tg = h.target.tg;
    UI.tip(`${UI.ICON[tg.type]} <b>${tg.name}</b> · ${INFO[tg.type].label}${G.at === tg.id ? '' : ` · walk ${Math.max(1, Math.round(routeTo(h.target).L * COST.walkPerM))} min`}`, e.clientX, e.clientY);
    canvas.style.cursor = 'pointer';
  } else { UI.tip(null); canvas.style.cursor = ''; }
});
canvas.addEventListener('pointerleave', () => UI.tip(null));
addEventListener('keydown', e => {
  if (e.key === 'b' || e.key === 'B') { UI.book($('book').classList.contains('hide')); }
  if (e.key === 'Escape') {
    if (!$('book').classList.contains('hide')) { UI.book(false); return; }
    if (G.card) { act.closeCard(); return; }
    if (G.mode === 'focus') leave(false);
  }
});
$('mute').onclick = () => { Sfx.unlock(); const on = Sfx.toggle(); $('mute').textContent = on ? '♪ Sound on' : '♪ Sound off'; };
$('mute').textContent = Sfx.on ? '♪ Sound on' : '♪ Sound off';

// ------------------------------------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let simT = 0;
function frame(dt) {
  simT += dt;
  if (tween) {
    tween.k = Math.min(1, tween.k + dt / tween.dur);
    const k = ease(tween.k);
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    if (tween.k >= 1) { tween = null; controls.enabled = true; }
  }
  if (G.walk) {
    const W = G.walk; W.k = Math.min(1, W.k + dt / W.dur);
    const pts = W.route.pts, total = W.route.L;
    let want = ease(W.k) * total, i = 1;
    while (i < pts.length - 1 && want > pts[i].distanceTo(pts[i - 1])) { want -= pts[i].distanceTo(pts[i - 1]); i++; }
    const a = pts[i - 1], b = pts[i], seg = a.distanceTo(b) || 1;
    const p = a.clone().lerp(b, Math.min(1, want / seg));
    const ins = world.inspector;
    ins.position.copy(p); ins.position.y = Math.abs(Math.sin(simT * 9)) * 0.06;
    ins.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    const off = V(0, 38, 46);
    camera.position.lerp(p.clone().add(off), Math.min(1, dt * 3));
    controls.target.lerp(p, Math.min(1, dt * 4));
    if (W.k >= 1) { controls.enabled = true; finishWalk(); }
  } else if (G.focus && G.mode !== 'walking') {
    const ins = world.inspector, d = G.focus.door;
    ins.position.set(d.x, 0, d.z);
    ins.rotation.y = Math.atan2(G.focus.group.position.x - d.x, G.focus.group.position.z - d.z);
  }
  if (G.test) {
    const T = G.test;
    T.t += dt * T.r.speedMul;
    const p = Math.min(1, T.t / T.r.testDuration);
    UI.drawChart($('chart'), T.f.trace, p);
    if (p >= 1) finishTest(false);
  }
  controls.update();
  world.update(dt, camera, simT);
}
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  frame(dt);
  if (composer) composer.render(); else renderer.render(scene, camera);
}

// ------------------------------------------------------------------------------------------------ boot
(async () => {
  try {
    await document.fonts?.load?.('700 40px "Barlow Condensed"').catch(() => {});
    await world.init();
    setupPost(); resize();
    newPark();
    $('loading').classList.add('hide');
    if (qs.has('skip')) { UI.overlay(null); startShift(); } else showTitle();
    loop();
  } catch (e) {
    console.error(e);
    $('loading').textContent = 'Could not load the park: ' + e.message;
  }
})();

// headless hooks (localhost only)
if (/^(localhost|127\.)/.test(location.hostname)) {
  window.__rt = {
    G, world, camera, controls, career,
    start(seed, day) { if (seed) { career.seed = seed; } if (day) career.day = day; newPark(); UI.overlay(null); startShift(); tween = null; },
    walk: walkTo, examine, paper, test, mark, verdict, endShift, leave: () => leave(false),
    step(n = 60, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); composer ? composer.render() : renderer.render(scene, camera); },
    cam(px, py, pz, tx, ty, tz) { tween = null; camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); },
    finishTween() { if (tween) { tween.k = 1; frame(0); } },
  };
}
