// Level editor for Par for the Curse. main.js loads it with ?edit in the address (add &nine=back for Lantern
// Links): on localhost always, on the live site only for a signed-in admin member. It edits the level overlay
// (levels.js) for the nine on screen: pick a piece of the course and move, turn, change or delete it, or place
// new obstacles from the palette, then save to levels/front.json or levels/back.json through the dev server
// (tools/dev.mjs), or on the live site publish it (stored in the site's database, live on players' next load;
// see publishNow).
// The game sits on its title screen underneath, which keeps its own input, HUD and network quiet; the editor
// flies the camera through window.__freeCam. Test plays the current hole right here; F2 or ` comes back.
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { AD, LOCKED, ADDABLE, patch, plainArgs, getPath, r3, canBeEmpty, moveOf, groundPaths } from './levels.js';
import { holeNumber } from './nine.js';
import { manifest, has } from './assets.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = v => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fmt = v => (typeof v === 'number' ? String(+v.toFixed(2)) : v);
const num = v => typeof v === 'number' && Number.isFinite(v);
const SNAP_M = 0.5, SNAP_A = Math.PI / 12;

// The palette: what it places, with default arguments at a hole-local point (x, z, and y on the ground).
const OBSTACLES = [
  ['Slab', 'block', (x, y, z) => [x - 3, x + 3, z - 2, z + 2, y + 0.5, y + 0.5, { thick: 1, noRock: true }]],
  ['Moving platform', 'platform', (x, y, z) => [x, y + 1, z, 4, 0.6, 4, 0, 0, 3, 0.7, 0, { surf: 'fairway' }]],
  ['Spinner', 'spinner', (x, y, z) => [x, y, z, 6, 0.9, {}]],
  ['Wall', 'wall', (x, y, z) => [x - 2, z, x + 2, z, y, { h: 0.6 }]],
  ['Wood rail', 'wall', (x, y, z) => [x - 2, z, x + 2, z, y, { h: 0.45, wood: true }]],
  ['Sand', 'zone', (x, y, z) => ['sand', x, z, 2, { y, rz: 1.4 }]],
  ['Water', 'zone', (x, y, z) => ['water', x, z, 2, { y, rz: 1.5 }]],
  ['Green', 'zone', (x, y, z) => ['green', x, z, 3, { y }]],
  ['Cone', 'cone', (x, y, z) => [x, y, z]],
  ['Bumper', 'bumper', (x, y, z) => [x, z, y]],
  ['Boom gate', 'boomGate', (x, y, z) => [x, z, y, 2.6, 1]],
  ['Goose', 'patrolGoose', (x, y, z) => [x, y, z, 2, 1, 0]],
  ['Wrecking ball', 'wrecker', (x, y, z) => [x, y, z, 2.4]],
  ['Sign', 'sign', (x, y, z) => [x, z, y, ['NEW SIGN', 'edit me'], 0]],
  ['Push rock', 'pushRock', (x, y, z) => [x, y, z]],
];
// Models that are parts of something else, or have a real palette entry of their own.
const NOT_PROPS = new Set(['cloud_a', 'cloud_b', 'flagpole', 'flag_cloth', 'cup_rim', 'golf_cart', 'sign_board', 'windsock_sock', 'spire', 'blimp', 'balloon', 'windmill_blades', 'cannon_barrel', 'bumper', 'goose']);
const propNames = () => [...new Set([...Object.keys(manifest.props?.objects || {}), 'parasol_bench', 'goose_bag', 'tee_clock'])].filter(n => has(n) && !NOT_PROPS.has(n)).sort();
// prop() gives these their own colliders; anything else placed from the palette is made solid from its triangles.
const OWN_COLLIDER = /^(rock_|lamp|tee_marker|windsock|tree_|bush|flowers)/;
const propArgs = (name, x, y, z) => [name, x, z, { y, rot: 0, scale: 1, ...(/^tree_/.test(name) ? { trunk: 0.35 } : {}), ...(OWN_COLLIDER.test(name) ? {} : { solid: true }) }];
const NAMES = { patrolGoose: 'goose', boomGate: 'boom gate', pushRock: 'push rock', pressurePlate: 'pressure plate', wrecker: 'wrecking ball', makeCup: 'cup and flag',
  parkingBay: 'checkpoint bay', underRocks: 'hanging rocks', shoulders: 'rough terraces', drawbridge: 'drawbridge', lift: 'lift', windsock: 'windsock', platform: 'moving platform', spinner: 'spinner' };

const CSS = `
#lvEd{position:fixed;inset:52px 0 0 0;z-index:25;pointer-events:none;font:12px/1.35 system-ui,sans-serif;color:#f6f0e6}
#lvEd *{box-sizing:border-box}
#lvEd .le-p{pointer-events:auto;background:rgba(24,20,32,.9);border:1px solid rgba(255,255,255,.12);border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.35)}
#lvEd .le-bar{position:absolute;left:8px;right:8px;top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 8px}
#lvEd .le-left{position:absolute;left:8px;top:58px;bottom:34px;width:236px;display:flex;flex-direction:column;padding:8px;gap:6px}
#lvEd .le-right{position:absolute;right:8px;top:58px;width:286px;max-height:calc(100% - 92px);overflow:auto;padding:10px}
#lvEd .le-hint{position:absolute;left:252px;right:302px;bottom:8px;padding:5px 9px;font-size:11px;opacity:.9;text-align:center}
#lvEd button{font:inherit;color:inherit;background:#3b3450;border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:3px 8px;cursor:pointer}
#lvEd button:hover{background:#4d4468} #lvEd button.on{background:#ffcf33;color:#2b2233;border-color:#ffcf33}
#lvEd button:disabled{opacity:.4;cursor:default}
#lvEd .le-title{font-weight:800;margin-right:4px} #lvEd .le-sp{flex:1}
#lvEd .le-status{opacity:.9;max-width:560px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} #lvEd .le-status.bad{color:#ff8d7a}
#lvEd h4{margin:2px 0;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.7}
#lvEd .le-pal{display:flex;flex-wrap:wrap;gap:4px}
#lvEd .le-pal button{padding:2px 6px;font-size:11px}
#lvEd .le-props{display:flex;gap:4px} #lvEd .le-props select{flex:1}
#lvEd input,#lvEd select{font:inherit;color:#f6f0e6;background:#15121d;border:1px solid rgba(255,255,255,.18);border-radius:4px;padding:2px 5px;min-width:0}
#lvEd input[type=checkbox]{width:auto}
#lvEd .le-list{flex:1;overflow:auto;border-top:1px solid rgba(255,255,255,.1);padding-top:4px}
#lvEd .le-row{padding:2px 5px;border-radius:4px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none}
#lvEd .le-row:hover{background:rgba(255,255,255,.08)} #lvEd .le-row.on{background:rgba(255,207,51,.25)}
#lvEd .le-row.dead{opacity:.45;text-decoration:line-through}
#lvEd .b{display:inline-block;font-size:9px;padding:0 4px;border-radius:3px;margin-left:4px;vertical-align:1px;text-decoration:none}
#lvEd .b-edit{background:#36c5f0;color:#102} #lvEd .b-add{background:#2ec4b6;color:#102} #lvEd .b-del{background:#ff5d73;color:#102}
#lvEd .b-lock{background:#888;color:#102} #lvEd .b-loose{background:#9b5de5;color:#fff} #lvEd .b-bad{background:#ff6b35;color:#102}
#lvEd .le-h{font-weight:800;font-size:13px} #lvEd .le-id{font:11px ui-monospace,monospace;opacity:.75;word-break:break-all;user-select:text;margin:2px 0}
#lvEd .le-dim{opacity:.7;margin:4px 0} #lvEd .le-warn{color:#ffb38a}
#lvEd .le-f{display:grid;grid-template-columns:1fr 1.1fr;gap:4px 6px;align-items:center;margin:8px 0}
#lvEd .le-f label{opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lvEd .le-btns{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
#lvEdTest{position:fixed;left:50%;top:13px;transform:translateX(-50%);z-index:101;background:rgba(24,20,32,.85);color:#f6f0e6;font:12px system-ui,sans-serif;padding:5px 10px;border-radius:6px;pointer-events:none}
`;

export function startEditor(api) {
  const { S, camera, scene, canvas, level } = api, C = api.course, rec = C && C.rec, data = level && level.data;
  if (!rec || !data) { console.error('level editor: the course was built without a level recorder'); return; }
  const SAVE = level.site ? 'Publish' : 'Save';      // the live site publishes (see publishNow)
  // A hole number from the address or a key: whole, 1 to 9 (10 to 18 also name the back nine's), else 1.
  const holeNum = v => { let n = Math.round(+v); if (api.backNine && n >= 10 && n <= 18) n -= 9; return Number.isFinite(n) ? clamp(n, 1, 9) : 1; };
  // sel: the piece selected, or null. multi: two or more pieces moved as one (Shift+click), or null; when
  // it is set, sel is null. rev counts edits, so a save knows whether anything changed while it was sent.
  const E = { active: true, sel: null, multi: null, hole: holeNum(new URLSearchParams(location.search).get('hole') ?? 1), mode: 'translate', snap: true,
    placing: null, dirty: false, rev: 0, batch: null, undo: [], redo: [], keys: new Set(), rmb: false, down: null, filter: '', fpv: S.fpv };
  const cam = { pos: V(), yaw: 0, pitch: -0.3, speed: 14 };
  const holeH = i => C.H[i - 1];

  /* ---------------- wreckable things made or revived after the build need wreck.js to know them ---------------- */
  rec.onThings = ths => { const w = api.wreck; if (!w) return; for (const th of ths) { const i = C.things.indexOf(th); if (i >= 0 && th.obj?.parent) try { w.prepare(th, i); } catch (e) {} } };

  /* ---------------- the page ---------------- */
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'lvEd';
  const nineName = api.backNine ? 'Lantern Links (back nine)' : 'Mount Bogey (front nine)';
  root.innerHTML = `
    <div class="le-p le-bar">
      <span class="le-title">Level editor</span><span class="le-dim">${esc(nineName)}</span>
      <span class="le-holes"></span>
      <button data-a="translate" title="Move (W)">Move</button><button data-a="rotate" title="Turn about up (R)">Turn</button>
      <label title="Snap moves to 0.5 m and turns to 15 degrees"><input type="checkbox" class="le-snap" checked> snap</label>
      <button data-a="undo" title="Ctrl+Z">Undo</button><button data-a="redo" title="Ctrl+Y">Redo</button>
      <button data-a="save" title="${level.site ? 'Ctrl+S: publish to the live site' : 'Ctrl+S'}">${SAVE}</button><button data-a="test" title="${level.site ? 'Play this hole here (does not publish)' : 'Save, then play this hole here'}">Test</button>
      <span class="le-sp"></span><span class="le-status"></span>
    </div>
    <div class="le-p le-left">
      <h4>Place</h4><div class="le-pal"></div>
      <div class="le-props"><select class="le-propsel"></select><button data-a="prop">Place</button></div>
      <h4 class="le-lh">Hole</h4><input class="le-filter" placeholder="filter: prop, tree, h3:block, ...">
      <div class="le-list"></div>
    </div>
    <div class="le-p le-right"><div class="le-insp"></div></div>
    <div class="le-p le-hint">Click: select. Shift+click (here or in the list): add or drop a piece, to move several as one. Hold right mouse: look,
      WASD fly, Q/E down/up, Shift fast, wheel speed. Wheel: dolly. W move, R turn (drag across the ring where it faces you), F frame,
      Del delete, Ctrl+Z/Y undo/redo, Ctrl+D copy, Ctrl+S save, ${api.backNine ? '1-9: holes 10-18' : '1-9 hole'}. Grass, wreckable plants and the cart route refresh on reload.</div>`;
  document.body.appendChild(root);
  const testBadge = document.createElement('div'); testBadge.id = 'lvEdTest'; testBadge.hidden = true; testBadge.textContent = 'Test drive: F2 or ` returns to the level editor'; document.body.appendChild(testBadge);
  const q = s => root.querySelector(s);
  const ui = { holes: q('.le-holes'), status: q('.le-status'), pal: q('.le-pal'), propsel: q('.le-propsel'), list: q('.le-list'), lh: q('.le-lh'), filter: q('.le-filter'), insp: q('.le-insp'), snap: q('.le-snap') };
  for (let i = 1; i <= 9; i++) { const b = document.createElement('button'); b.textContent = holeNumber(i); b.title = 'Hole ' + holeNumber(i) + ' (' + i + ')'; b.onclick = () => goHole(i); b.dataset.h = i; ui.holes.appendChild(b); }
  for (const p of OBSTACLES) { const b = document.createElement('button'); b.textContent = p[0]; b.onclick = () => startPlace({ label: p[0], m: p[1], args: p[2] }, b); ui.pal.appendChild(b); }
  for (const n of propNames()) { const o = document.createElement('option'); o.value = o.textContent = n; ui.propsel.appendChild(o); }
  q('[data-a=prop]').onclick = ev => { const n = ui.propsel.value; if (n) startPlace({ label: n, m: 'prop', args: (x, y, z) => propArgs(n, x, y, z) }, ev.currentTarget); };
  q('[data-a=translate]').onclick = () => setMode('translate'); q('[data-a=rotate]').onclick = () => setMode('rotate');
  q('[data-a=undo]').onclick = () => undo(); q('[data-a=redo]').onclick = () => redo();
  q('[data-a=save]').onclick = () => save(); q('[data-a=test]').onclick = () => test();
  ui.snap.onchange = () => { E.snap = ui.snap.checked; tc.setRotationSnap(E.snap ? SNAP_A : null); };
  ui.filter.oninput = () => { E.filter = ui.filter.value.trim().toLowerCase(); renderList(); };
  // Keys typed into the editor's own fields never reach the game's handlers.
  for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, e => e.stopPropagation());
  // A button or checkbox clicked with the mouse lets go of the focus, or the next Enter or Space would press
  // it again (pick hole 2, press 7, press Enter: back on hole 2). One pressed from the keyboard (Space on a
  // checkbox you tabbed to: a click with no mouse, detail 0) keeps it, so Tab goes on from there.
  root.addEventListener('click', e => { const b = e.target.closest('button, input[type=checkbox]'); if (b && e.detail > 0) b.blur(); });
  let statusT = 0;
  // The line has room for about 65 characters: a longer story goes in tip (its tooltip).
  function status(msg, bad = false, tip = msg) { ui.status.textContent = msg; ui.status.title = tip; ui.status.classList.toggle('bad', bad); statusT = performance.now(); }
  // What the status line says when nothing just happened: a problem with the file stays in view.
  const idleText = () => (level.problem ? `Problem with levels/${level.name}.json` : E.dirty ? (level.site ? 'Unpublished changes' : 'Unsaved changes') : '');
  function idleStatus() { if (E.placing) return; ui.status.textContent = ui.status.title = idleText(); ui.status.classList.toggle('bad', !!level.problem); statusT = 0; }
  // After the selection or the hole changes: the selection, or nothing (an old error or id would be stale).
  function selStatus() { if (E.placing) return; if (E.sel) status(E.sel.id); else if (E.multi) status(`${E.multi.length} pieces selected`); else idleStatus(); }

  /* ---------------- camera ---------------- */
  const dirOf = () => V(Math.cos(cam.pitch) * Math.sin(cam.yaw), Math.sin(cam.pitch), Math.cos(cam.pitch) * Math.cos(cam.yaw));
  function lookFrom(from, to) { cam.pos.copy(from); const d = to.clone().sub(from).normalize(); cam.yaw = Math.atan2(d.x, d.z); cam.pitch = Math.asin(clamp(d.y, -1, 1)); }
  // From behind the tee and out over the sea, below the hole 28 m up, looking up the whole hole and its cart
  // road (straight out from the middle, the corkscrew tower of the hole above hangs in the way).
  function overview(i) { const F = holeH(i).frame; lookFrom(F.w(-14, 16, -34), F.w(36, 2, 0)); }
  // Back the camera off along the way it looks until the pieces fill the view. A piece with nothing on show
  // (deleted, or an add that was undone) is framed at the point it stood.
  function frameItems(list) {
    const b = new THREE.Box3(), t = new THREE.Box3();
    for (const it of list) {
      if (!it.deleted) rec.worldBox(it, t); else t.makeEmpty();
      if (t.isEmpty()) { const F = it.H.frame, p = rec.pivotOf(it); t.setFromCenterAndSize(F.w(p.x, p.y, p.z), V(2, 2, 2)); }
      b.union(t);
    }
    if (b.isEmpty()) return;
    const c = b.getCenter(V()), r = Math.max(1.5, b.getSize(V()).length() / 2);
    // Aim at the middle of the box, but no lower than the pieces' own pivots (a block's is the middle of its
    // top): a fairway's box goes deep into the rock under it, and from above that middle is behind the tee.
    let low = Infinity;
    for (const it of list) { const F = it.H.frame, p = rec.pivotOf(it); low = Math.min(low, F.w(p.x, p.y, p.z).y); }
    if (Number.isFinite(low)) c.y = Math.max(c.y, low);
    // From the way the camera looks now, unless another piece stands between it and these (hole 5's hanging
    // rock hides hole 1's raised fairway; the pads' checkpoint bays hide what stands behind them): then from
    // the first of a few other ways round, and higher up, that is clear. Nothing clear: the way it looks.
    const dist = r * 2.2 + 2, skip = new Set(list), probe = new THREE.Raycaster();
    const dirAt = (yaw, pitch) => V(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    const clear = d => { probe.set(c, d.clone().negate()); probe.far = dist; return !hitsOn(probe, skip).some(h => h.distance > Math.min(r, dist / 2)); };
    found: for (const pitch of [cam.pitch, -0.6, -1.0]) for (const dy of [0, 0.7, -0.7, 1.5, -1.5, 2.3, -2.3, Math.PI]) {
      if (clear(dirAt(cam.yaw + dy, pitch))) { cam.yaw = Math.atan2(Math.sin(cam.yaw + dy), Math.cos(cam.yaw + dy)); cam.pitch = pitch; break found; }
    }
    cam.pos.copy(c).addScaledVector(dirOf(), -dist);
  }
  const selected = () => E.multi || (E.sel ? [E.sel] : []);
  function frameSel() { const L = selected().filter(it => !it.deleted); if (L.length) frameItems(L); }
  function fly(dt) {
    const k = E.keys, f = E.rmb, d = dirOf(), right = V(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw)), m = V();
    if ((f && k.has('w')) || k.has('arrowup')) m.add(d);
    if ((f && k.has('s')) || k.has('arrowdown')) m.sub(d);
    if ((f && k.has('d')) || k.has('arrowright')) m.add(right);
    if ((f && k.has('a')) || k.has('arrowleft')) m.sub(right);
    if ((f && k.has('e')) || k.has('pageup')) m.add(UP);
    if ((f && k.has('q')) || k.has('pagedown')) m.sub(UP);
    if (m.lengthSq()) cam.pos.addScaledVector(m.normalize(), cam.speed * (k.has('shift') ? 3.5 : 1) * dt);
  }

  /* ---------------- gizmo and selection box ---------------- */
  const tc = new TransformControls(camera, canvas);
  tc.setSpace('local'); tc.setSize(0.85); tc.setRotationSnap(SNAP_A);      // moves snap in dragDelta
  scene.add(tc);
  const proxy = new THREE.Object3D(); proxy.name = 'level-editor-pivot'; scene.add(proxy);
  const boxH = new THREE.Box3Helper(new THREE.Box3(), 0xffd23f);
  boxH.material.depthTest = false; boxH.material.transparent = true; boxH.material.opacity = 0.9; boxH.renderOrder = 999; boxH.visible = false; scene.add(boxH);
  let drag = null;
  const canTurn = it => !AD[it.m]?.move || !!AD[it.m].turn;      // moved by offsets: always; by arguments: if it knows how
  const axesOf = it => (it.lockMove ? '' : AD[it.m]?.axes || 'xyz');      // lockMove: it can only turn in place (levels.js)
  const editable = it => it && !it.deleted && !LOCKED.has(it.m) && !(it.add && !data.add.includes(it.add));
  // A group moves along the axes all of its pieces can, and turns (about its middle) only if every piece
  // can turn and can be carried round in x and z.
  const groupAxes = L => [...'xyz'].filter(a => L.every(it => axesOf(it).includes(a))).join('');
  const groupTurns = L => L.every(it => canTurn(it) && /x/.test(axesOf(it)) && /z/.test(axesOf(it)));
  // The middle of a group, in its hole's frame: the middle of the box round all of it.
  function groupCentre(L) {
    const b = new THREE.Box3(), t = new THREE.Box3();
    for (const it of L) b.union(rec.worldBox(it, t));
    if (!b.isEmpty()) return L[0].H.frame.local(b.getCenter(V()), V());
    const c = V(); for (const it of L) c.add(rec.pivotOf(it)); return c.divideScalar(L.length);
  }
  const turnPt = (x, z, cx, cz, da) => { const c = Math.cos(da), s = Math.sin(da), dx = x - cx, dz = z - cz; return [cx + dx * c + dz * s, cz - dx * s + dz * c]; };
  function placeProxy(F, p) { proxy.position.copy(F.w(p.x, p.y, p.z)); proxy.quaternion.copy(F.q); proxy.updateMatrixWorld(true); }
  function gizmo() {
    const L = E.multi || (editable(E.sel) ? [E.sel] : []);
    // While placing, a click goes to the course: the last piece placed (it is selected) shows no handles, or
    // the next click beside it would grab one of them instead of placing.
    if (!E.active || !L.length || E.placing) { tc.detach(); return; }
    const one = L.length === 1 ? L[0] : null, axes = one ? axesOf(one) : groupAxes(L), turns = one ? canTurn(one) : groupTurns(L);
    const mode = (E.mode === 'rotate' || !axes) && turns ? 'rotate' : 'translate';
    if (mode === 'translate' && !axes) { tc.detach(); return; }
    tc.setMode(mode);
    tc.showX = mode === 'translate' && axes.includes('x'); tc.showY = mode === 'rotate' || axes.includes('y'); tc.showZ = mode === 'translate' && axes.includes('z');
    placeProxy(L[0].H.frame, one ? rec.pivotOf(one) : groupCentre(L)); tc.attach(proxy);
  }
  // Snap rounds the move itself, not where the gizmo ends up: a group's gizmo sits on the middle of its box,
  // which is seldom on the grid, and a piece the code put at 5.6 moves to 6.1, not to 6. A slip of a few
  // pixels on a handle rounds to no move at all. With snap on, the gizmo is put where the piece will go.
  function dragDelta() {
    const F = drag.F, a = F.local(drag.p0, V()), b = F.local(proxy.position, V());
    const dq = drag.q0.clone().invert().multiply(proxy.quaternion);
    let d = [b.x - a.x, b.y - a.y, b.z - a.z];
    if (E.snap) { d = d.map(v => Math.round(v / SNAP_M) * SNAP_M || 0); proxy.position.copy(F.w(a.x + d[0], a.y + d[1], a.z + d[2])); proxy.updateMatrixWorld(true); }
    return { d, da: 2 * Math.atan2(dq.y, dq.w) };
  }
  // A gesture on a group: each piece moves by the drag, plus, when it turns, by its way round the group's
  // middle; and it turns by the same angle about its own pivot. Pivots are taken where the gesture began.
  function groupMoves(g, d, da) {
    return g.L.map((it, i) => {
      const p = g.piv[i];
      if (!da) return [it, d, 0];
      const [x, z] = turnPt(p.x, p.z, g.c.x, g.c.z, da);
      return [it, [d[0] + x - p.x, d[1], d[2] + z - p.z], da];
    });
  }
  function startGesture(L) {
    const F = L[0].H.frame, g = { L, it: L[0], F, p0: proxy.position.clone(), q0: proxy.quaternion.clone() };
    if (L.length > 1) { g.c = F.local(g.p0, V()); g.piv = L.map(it => rec.pivotOf(it)); }
    return g;
  }
  tc.addEventListener('dragging-changed', e => {
    if (e.value) { const L = E.multi || (E.sel ? [E.sel] : []); if (L.length) drag = startGesture(L); return; }
    if (!drag) return;
    const g = drag, { d, da } = dragDelta(); drag = null;
    if (Math.hypot(...d) < 1e-4 && Math.abs(da) < 1e-4) { for (const it of g.L) rec.preview(it, [0, 0, 0], 0); gizmo(); return; }
    if (g.L.length > 1) commitGroup(g, d, da); else commitMove(g.it, d, da);
  });
  tc.addEventListener('objectChange', () => {
    if (!drag) return;
    const { d, da } = dragDelta();
    try { if (drag.L.length > 1) for (const [it, di, dai] of groupMoves(drag, d, da)) rec.preview(it, di, dai); else rec.preview(drag.it, d, da); } catch (e) { console.warn(e); }
  });

  /* ---------------- picking ---------------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // Every piece of the course a ray meets, nearest first (skip: pieces to look through).
  function hitsOn(rc, skip) {
    const hits = [];
    // The game turns raycasting off on many course meshes (so its camera ignores them); call it directly.
    for (const it of rec.list) {
      if (it.deleted || skip?.has(it)) continue;
      for (const obj of [...(it.out.group || []), ...(it.out.scene || [])]) obj.traverse(m => {
        if (!m.isMesh || m.userData.isOutline || !m.visible) return;
        const n = hits.length;
        (m.isInstancedMesh ? THREE.InstancedMesh : THREE.Mesh).prototype.raycast.call(m, rc, hits);
        for (let i = n; i < hits.length; i++) hits[i].item = it;
      });
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }
  function castAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
    return hitsOn(ray)[0] || null;
  }
  function pickAt(cx, cy) { const h = castAt(cx, cy); select(h ? h.item : null); return h ? h.item.id : null; }
  function screenOf(it) {
    const F = it.H.frame, p = rec.pivotOf(it), s = F.w(p.x, p.y, p.z).project(camera), r = canvas.getBoundingClientRect();
    return [r.left + (s.x + 1) / 2 * r.width, r.top + (1 - s.y) / 2 * r.height];
  }

  /* ---------------- placing from the palette ---------------- */
  const placePrompt = p => status(`Click to place ${p.label} · Shift: keep placing · Esc: stop`, false, `Click the course to place ${p.label}. Hold Shift to keep placing more; Esc stops.`);
  function startPlace(p, btn) {
    E.placing = p;
    root.querySelectorAll('.le-pal button, [data-a=prop]').forEach(b => b.classList.toggle('on', b === btn));
    placePrompt(p); gizmo();
  }
  function stopPlace() { if (!E.placing) return; E.placing = null; root.querySelectorAll('.le-pal button, [data-a=prop]').forEach(b => b.classList.remove('on')); gizmo(); }
  function nextId() {
    let n = 0;
    for (const id of [...rec.items.keys(), ...data.add.map(a => a.id)]) { const m = /^a(\d+)$/.exec(id); if (m) n = Math.max(n, +m[1]); }
    return 'a' + (n + 1);
  }
  // The height to place at: the solid ground under the clicked point, not a decal lying on it (a green,
  // sand or water sits a few millimetres up) or a leafy crown a ball drops through. null: nothing under it.
  function groundUnder(p, lift = 0.6) {
    let y = p.y + lift;
    for (let k = 0; k < 6; k++) {
      const g = C.world.groundAt(p.x, y, p.z, 3, true);
      if (!g) return null;
      if (!g.col.soft && g.col.tag !== 'leaf') return g.y;
      y = g.y - 0.02;
    }
    return null;
  }
  const snapXZ = v => (E.snap ? Math.round(v / SNAP_M) * SNAP_M : r3(Math.round(v * 10) / 10));
  function placeAt(cx, cy, keep) {
    const hit = castAt(cx, cy);
    let p = hit && hit.point.clone();
    if (!p) { const F = holeH(E.hole).frame; p = ray.ray.intersectPlane(new THREE.Plane(UP, -F.o.y), V()); }
    if (!p) { status('Click on the course to place it.', true); return null; }
    const h = C.holeAt(p, E.hole) || E.hole, F = holeH(h).frame, l = F.local(p, V());
    // The ground where the piece will stand, once snapped, not where the click was. Ground more than 0.2 m
    // above the clicked point is something the snap moved it into (a rail beside the fairway clicked, the
    // piece placed just before): it stands under that, on what was clicked.
    const w = F.w(snapXZ(l.x), l.y, snapXZ(l.z));
    let gy = groundUnder(w);
    if (gy !== null && gy > w.y + 0.2) gy = groundUnder(w, 0.2) ?? gy;
    if (gy !== null) w.y = gy;
    return placeLocal(E.placing, h, F.local(w, V()), keep);
  }
  function placeLocal(pal, h, l, keep) {
    const sn = snapXZ;
    // A hair off the ground is on it: a bumper given y 0.012 would stand on a steel disc (any y but 0 does).
    const y = Math.abs(l.y) < 0.1 ? 0 : r3(l.y);
    const a = { id: nextId(), hole: h, m: pal.m, args: clone(pal.args(sn(l.x), y, sn(l.z))) };
    doChange({ kind: 'add', id: a.id, before: null, after: a, index: data.add.length });
    const it = rec.items.get(a.id);
    if (!keep) stopPlace();
    select(it || null);
    if (it?.broken) status(`${pal.label} did not build: ${it.broken}`, true); else report(`Placed ${pal.label} on hole ${holeNumber(h)}${keep ? ' · Shift-click for another, Esc: stop' : ''}`);
    return a.id;
  }

  /* ---------------- edits, as overlay changes that undo and redo ---------------- */
  // A change is { kind: 'item', id, before, after } (an entry in data.items) or { kind: 'add', id, before,
  // after, index } (an entry in data.add); before/after are plain copies, or null for none.
  function tidyEntry(e) {
    if (!e) return null;
    const o = {};
    if (e.set && Object.keys(e.set).length) o.set = e.set;
    if (e.off && e.off.some(v => Math.abs(v) > 1e-6)) o.off = e.off.map(r3);
    if (e.rot && Math.abs(e.rot) > 1e-6) o.rot = r3(e.rot);
    if (e.del) o.del = true;
    return Object.keys(o).length ? o : null;
  }
  function applyState(ch, st) {
    if (ch.kind === 'item') {
      if (st) data.items[ch.id] = clone(st); else delete data.items[ch.id];
      rec.refresh(rec.items.get(ch.id));
      return;
    }
    const i = data.add.findIndex(a => a.id === ch.id), it = rec.items.get(ch.id);
    if (!st) { if (i >= 0) data.add.splice(i, 1); if (it) rec.refresh(it); return; }
    const a = it?.add || (i >= 0 ? data.add[i] : {});
    for (const k of Object.keys(a)) delete a[k];
    Object.assign(a, clone(st));
    if (!data.add.includes(a)) data.add.splice(Math.min(ch.index ?? data.add.length, data.add.length), 0, a);
    if (it) { it.origArgs = a.args; rec.refresh(it); } else rec.addLive(a);
  }
  // { kind: 'group', changes } is one gesture on several pieces (a group move, Delete all): one undo step.
  // Its changes are applied in the order they were made, both ways: surfaces first (see commitGroup).
  function applyCh(ch, after) { if (ch.kind === 'group') for (const c of ch.changes) applyCh(c, after); else applyState(ch, after ? ch.after : ch.before); }
  function doChange(ch) {
    if (!E.batch) E.note = null;
    if (same(ch.before, ch.after)) return;
    if (!E.batch) gestureStart();
    try { applyState(ch, ch.after); } catch (e) { console.error('level editor:', e); status('That edit failed: ' + e.message, true); }
    if (E.batch) { E.batch.push(ch); return; }
    E.undo.push(ch); E.redo.length = 0; dirty(true); afterChange(ch, 'do'); gestureEnd();
  }
  // Runs fn, gathering the changes it makes into one undo step.
  function batch(fn) {
    const outer = E.batch, list = E.batch = [];
    if (!outer) { E.note = null; gestureStart(); }
    try { fn(); } finally { E.batch = outer; }
    if (!list.length) return null;
    const ch = list.length === 1 ? list[0] : { kind: 'group', changes: list };
    if (outer) outer.push(ch); else { E.undo.push(ch); E.redo.length = 0; dirty(true); afterChange(ch, 'do'); gestureEnd(); }
    return ch;
  }
  const lastChange = () => { const L = E.batch || E.undo; return L[L.length - 1]; };
  function undo() { const ch = E.undo.pop(); if (!ch) return status('Nothing to undo'); E.note = null; gestureStart(); applyCh(ch, false); E.redo.push(ch); dirty(true); afterChange(ch, 'undo'); gestureEnd(); report('Undone'); }
  function redo() { const ch = E.redo.pop(); if (!ch) return status('Nothing to redo'); E.note = null; gestureStart(); applyCh(ch, true); E.undo.push(ch); dirty(true); afterChange(ch, 'redo'); gestureEnd(); report('Redone'); }
  // A prop or windsock is not built where there is no ground under it, here or on a normal load. A gesture
  // that leaves one like that (moved off the edge, or the block under it moved away) says so, instead of
  // the piece just vanishing. An old error on the status line (a failed save) goes when an edit begins.
  let unbuilt0 = null;
  function gestureStart() { unbuilt0 = new Set(rec.list.filter(x => x.unbuilt && !x.deleted)); if (ui.status.classList.contains('bad')) selStatus(); }
  function gestureEnd() {
    const before = unbuilt0; unbuilt0 = null;
    const L = before ? rec.list.filter(x => x.unbuilt && !x.deleted && !before.has(x)) : [];
    if (!L.length) return;
    const one = L.length === 1, it_ = one ? 'it' : 'them';
    E.note = { short: `no ground under ${one ? label(L[0]) : L.length + ' pieces'}: not built`,
      tip: `${L.map(label).join('; ')}: there is no ground under ${it_} where ${one ? 'it stands' : 'they stand'} now, so ${one ? 'it is' : 'they are'} not built, here or on a normal load. Move ${it_} back over the course, give ${it_} a y, or Ctrl+Z.` };
    status(`Not built: ${E.note.short.replace(/: not built$/, '')} (Ctrl+Z undoes)`, true, E.note.tip);
  }
  // What a gesture did, with the note above when it left something unbuilt.
  function report(msg) { const n = E.note; E.note = null; if (n) status(`${msg} · ${n.short}`, true, `${msg}. ${n.tip}`); else status(msg); }
  function afterChange(ch, from) {
    const its = (ch.kind === 'group' ? ch.changes : [ch]).map(c => rec.items.get(c.id)).filter(Boolean);
    if (its.length === 1) { const it = its[0]; if (E.sel === it || (!E.sel && !E.multi)) E.sel = it; }
    else if (its.length > 1 && from !== 'do') { const L = its.filter(editable); if (L.length > 1) { E.multi = L; E.sel = null; } else { E.multi = null; E.sel = L[0] || its[0]; } }
    // Undone or redone on another hole: go there, select it and bring the camera to it.
    if (from !== 'do' && its.length && its.every(it => it.hole !== E.hole)) {
      if (its.length === 1) { E.sel = its[0]; E.multi = null; }
      E.hole = its[0].hole; frameItems(its);
    }
    if (E.sel && E.sel.hole !== E.hole) E.hole = E.sel.hole;
    if (E.multi) { E.multi = E.multi.filter(editable); if (E.multi.length < 2) { E.sel = E.multi[0] || null; E.multi = null; } }
    render();
  }
  function setEntry(it, e) { doChange({ kind: 'item', id: it.id, before: clone(rec.entry(it)), after: tidyEntry(e) }); }
  const roundPatch = p => { for (const k in p) { const v = p[k]; p[k] = typeof v === 'number' ? r3(v) : Array.isArray(v) && Array.isArray(v[0]) ? v.map(x => x.map(r3)) : v; } return p; };
  // Patches on an item's arguments: in the add itself for a placed piece, as "set" for one the code built
  // (dropping any patch that puts back what the code wrote).
  function setArgs(it, pat) {
    pat = { ...pat };
    followGround(it, pat); pinLook(it, pat);
    if (it.add) { const before = clone(it.add), after = { ...before, args: clone(patch(it.add.args, pat)) }; doChange({ kind: 'add', id: it.id, before, after, index: data.add.indexOf(it.add) }); pinHeight(it, pat); return; }
    const e = clone(rec.entry(it)) || {}, set = { ...(e.set || {}) };
    for (const [k, v] of Object.entries(pat)) { const o = getPath(it.origArgs, k); if (v === null || v === undefined ? o === undefined : same(o, v)) delete set[k]; else set[k] = v; }
    setEntry(it, { ...e, set });
    pinHeight(it, pat);
  }
  // A prop, zone or windsock standing on the ground and moved sideways (by the gizmo or its x and z fields)
  // finds its feet again at the new spot, up a ramp or down off a block, and is pinned there (pinHeight).
  // One raised off the ground on purpose keeps its height, and so does one the hole's code gave a height.
  function followGround(it, pat) {
    const g = groundPaths(it.m);
    if (!g || g.y in pat || !g.xz.some(p => p in pat)) return;
    if (!it.add && num(getPath(it.origArgs, g.y))) return;
    if (rec.standsOnGround(it)) pat[g.y] = null;
  }
  // prop() turns and sizes a tree at random when the code gives it no turn or scale, so every rebuild would
  // show another tree. An edit keeps the ones it has on screen (as a copy does).
  function pinLook(it, pat) {
    const m0 = it.m === 'prop' && !it.add && !it.deleted && it.out.group?.[0];
    if (!m0) return;
    if (!('3.rot' in pat) && !num(getPath(it.args, '3.rot'))) pat['3.rot'] = r3(m0.rotation.y);
    if (!('3.scale' in pat) && !num(getPath(it.args, '3.scale'))) pat['3.scale'] = r3(m0.scale.x);
  }
  // A prop, zone or windsock the code built finds its height on the ground below it. Moved sideways, it
  // keeps the height it lands on here: a normal load builds it before the cart roads, the adds and the holes
  // above exist, so looking for the ground again there could put it somewhere else (a windsock moved onto a
  // cart road would come back under it). Clearing its y field brings back "on the ground". A placed piece
  // keeps the height it was given; one that followed the ground (above) is given the one it found.
  function pinHeight(it, pat) {
    const g = groundPaths(it.m);
    if (!g || !g.xz.some(p => p in pat) || pat[g.y] != null) return;
    const y = rec.heightOf(it), path = g.y;
    if (y === null) return;
    const ch = lastChange();
    if (it.add) {
      if (pat[path] !== null || !data.add.includes(it.add)) return;
      const a = it.add; a.args = patch(a.args, { [path]: y }); it.args = it.origArgs = a.args;      // it already stands there: no rebuild
      if (ch && ch.kind === 'add' && ch.id === it.id) ch.after = clone(a);
    } else {
      const e = data.items[it.id];
      if (!e?.set || !g.xz.some(p => p in e.set) || path in e.set) return;
      e.set[path] = y;
      it.args = patch(it.origArgs, e.set); it.setKey = JSON.stringify(e.set);
      if (ch && ch.kind === 'item' && ch.id === it.id) ch.after = clone(e);
    }
    renderInspector();
  }
  function commitMove(it, d, da) { planMove(it, d, da)?.(); }
  // The edit a move makes, worked out from where the piece stands now and made when the returned function
  // runs. A group works out all of its pieces' edits before it makes any: moving a block rebuilds the props
  // standing on it, which would change what "1 m up from here" means for them.
  function planMove(it, d, da) {
    if (!editable(it)) return null;
    if (it.lockMove) d = [0, 0, 0];
    const ad = AD[it.m], moved = Math.hypot(...d) > 1e-6, turned = Math.abs(da) > 1e-6;
    if (ad?.move) {
      const pat = moved ? ad.move(it.args, d, it) : {};
      if (turned && ad.turn) Object.assign(pat, ad.turn(moved ? patch(it.args, pat) : it.args, da, it));
      const p = roundPatch(pat);
      return () => setArgs(it, p);
    }
    const e = clone(rec.entry(it)) || {}, { off, rot } = moveOf(e);
    const ne = { ...e, off: off.map((v, i) => v + d[i]), rot: Math.atan2(Math.sin(rot + da), Math.cos(rot + da)) };
    return () => setEntry(it, ne);
  }
  function del(it) {
    if (!it || LOCKED.has(it.m) || (it.add ? !data.add.includes(it.add) : it.deleted)) return;      // an add that would not build can still go
    if (it.add) doChange({ kind: 'add', id: it.id, before: clone(it.add), after: null, index: data.add.indexOf(it.add) });
    else setEntry(it, { ...(clone(rec.entry(it)) || {}), del: true });
    report('Deleted ' + label(it) + ' (Ctrl+Z or Restore brings it back)');
  }
  function restore(it) {
    if (!it) return;
    if (it.add) { if (data.add.includes(it.add)) return; doChange({ kind: 'add', id: it.id, before: null, after: clone(it.add), index: data.add.length }); }
    else { if (!rec.entry(it)?.del) return; const e = clone(rec.entry(it)) || {}; delete e.del; setEntry(it, e); }
    report('Restored ' + label(it));
  }
  function revert(it) { if (!it || it.add || !rec.entry(it)) return; setEntry(it, null); report('Reverted ' + label(it) + ' to what the code builds'); }
  // A copy of a piece as a new add, 1 m along the hole: the add's id, or null if it can't be copied.
  function copyOf(it) {
    if (!ADDABLE.has(it.m) || it.deleted) return null;
    const args = plainArgs(it.args, rec);
    if (!args) return null;
    if (it.m === 'prop') { const m0 = it.out.group?.[0], o = args[3] = { ...(args[3] || {}) }; if (m0) { o.y ??= r3(m0.position.y); o.rot ??= r3(m0.rotation.y); o.scale ??= r3(m0.scale.x); } }
    const ad = AD[it.m], moved = ad?.move ? patch(args, roundPatch(ad.move(args, [1, 0, 0], it))) : args;
    const a = { id: nextId(), hole: it.hole, m: it.m, args: clone(moved) };
    doChange({ kind: 'add', id: a.id, before: null, after: a, index: data.add.length });
    return a.id;
  }
  function dup(it) {
    if (!it) return status('Select something to copy.');
    if (!ADDABLE.has(it.m) || it.deleted) return status("Only pieces built from plain values can be copied (this one's arguments are code).", true);
    const id = copyOf(it);
    if (!id) return status("This one can't be copied: its arguments hold code (a gust, a bridge, a closure).", true);
    select(rec.items.get(id)); status('Copied as ' + id + ', 1 m along the hole');
  }

  /* ---------------- several pieces at once (Shift+click) ---------------- */
  // Surfaces go first, so what stands on a moved block lands on its new place and not its old one (a prop
  // moved first would pin itself to whatever was under it before the block arrived).
  const SURF = new Set(['block', 'shoulders', 'underRocks', 'wall', 'road', 'loose']);
  function commitGroup(g, d, da) {
    const moves = groupMoves(g, d, da).sort(([a], [b]) => (SURF.has(b.m) - SURF.has(a.m)) || rec.list.indexOf(a) - rec.list.indexOf(b));
    const plans = moves.map(([it, di, dai]) => planMove(it, di, dai));
    batch(() => { for (const p of plans) p?.(); });
    report(`${da ? 'Turned' : 'Moved'} ${moves.length} pieces as one`);
  }
  function delSel() {
    const L = E.multi; if (!L) return del(E.sel);
    batch(() => { for (const it of L) del(it); });
    E.multi = null; E.sel = null; render();
    report(`Deleted ${L.length} pieces (Ctrl+Z brings them back)`);
  }
  function dupSel() {
    const L = E.multi; if (!L) return dup(E.sel);
    const ids = [];
    batch(() => { for (const it of L) { const id = copyOf(it); if (id) ids.push(id); } });
    const made = ids.map(id => rec.items.get(id)).filter(Boolean);
    if (!made.length) return status("None of these can be copied: the hole's code builds them (their arguments are code).", true);
    setSel(made);
    const left = L.length - made.length;
    status(`Copied ${plural(made.length, 'piece')}, 1 m along the hole` + (left ? ` (${left} built by the hole's code can't be copied)` : ''));
  }
  function revertSel() { const L = E.multi; if (!L) return revert(E.sel); const n = L.filter(it => !it.add && rec.entry(it)).length; batch(() => { for (const it of L) revert(it); }); report(`Reverted ${n} piece${n === 1 ? '' : 's'} to what the code builds`); }
  // An inspector field: a path into the arguments, or @off.N / @rot for pieces moved by offsets.
  function setField(it, path, v) {
    if (!editable(it)) return;
    // levels.js refuses numbers past ±500 on load (they could freeze the build), so don't take them here.
    if (typeof v === 'number' && Math.abs(v) > 500) { status('Keep numbers between -500 and 500.', true); renderInspector(); return false; }
    if (path[0] === '@') {
      if (it.lockMove && path.startsWith('@off')) { status(`This one can only turn in place: ${it.lockMove}.`, true); renderInspector(); return false; }
      const e = clone(rec.entry(it)) || {}, mv = moveOf(e), off = [...mv.off];
      e.rot = mv.rot;
      if (path === '@rot') e.rot = +v || 0; else off[+path.split('.')[1]] = +v || 0;
      setEntry(it, { ...e, off }); return;
    }
    // Emptied: fine for an option ("on the ground", "default"), not for a position the piece needs: it
    // would be built at NaN, and one NaN collider sends the ball to NaN on every hole.
    if (v == null && !canBeEmpty(it.m, path)) {
      const f = (AD[it.m]?.fields || []).find(f => f[0] === path);
      status(`"${f ? f[1] : path}" needs a value: it can't be left empty.`, true); renderInspector(); return false;
    }
    setArgs(it, it.m === 'prop' && path === '0' && typeof v === 'string' ? modelPatch(it, v) : { [path]: v });
  }
  // Another model for a prop. prop() builds a 3 m trunk pole for any model given a trunk, so a tree turned
  // into a rock would keep an invisible wooden pole: only trees keep (or get) one. A model with no collider
  // of its own is made solid from its triangles, as the palette does, and one that has its own loses that.
  function modelPatch(it, name) {
    const o = it.args[3] && typeof it.args[3] === 'object' ? it.args[3] : {}, pat = { 0: name };
    if (!/^tree_/.test(name)) { if (o.trunk != null) pat['3.trunk'] = null; }
    else if (!num(o.trunk)) pat['3.trunk'] = 0.35;      // what the holes give theirs
    const own = OWN_COLLIDER.test(name);
    if (own && o.solid) pat['3.solid'] = null;
    else if (!own && OWN_COLLIDER.test(String(it.args[0])) && !o.solid && !it.follow) pat['3.solid'] = true;
    return pat;
  }

  /* ---------------- save ---------------- */
  function dirty(d) { E.dirty = d; if (d) E.rev++; q('[data-a=save]').textContent = d ? SAVE + '*' : SAVE; document.title = (d ? '* ' : '') + document.title.replace(/^\* /, ''); }
  // The file keeps the code's build order, so a diff reads like the holes.
  function fileData() {
    const order = new Map(rec.list.map((it, i) => [it.id, i])), ids = Object.keys(data.items).sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || (a < b ? -1 : 1));
    const items = {}; for (const id of ids) { const e = tidyEntry(data.items[id]); if (e) items[id] = e; }
    return { version: 1, items, add: clone(data.add) };
  }
  // One save at a time, in order: a second Ctrl+S waits for the first to answer.
  let saving = Promise.resolve();
  function save() { const p = saving.then(saveNow); saving = p.catch(() => {}); return p; }
  async function saveNow() {
    // What is sent is the overlay as it stands now (rev). An edit made while the request is out is not in
    // the file, so it keeps the page "unsaved" (and the warning on leaving).
    const name = level.name, rev = E.rev, body = JSON.stringify(fileData(), null, 2) + '\n';
    // The file was there but could not be read when the editor started (a merge conflict, a typo, a newer
    // version): what is on screen is the course without it, and saving would throw its edits away.
    if (level.problem) {
      if (!confirm(`levels/${name}.json had a problem when the editor started: ${level.problem}.\n\nSaving replaces the whole file with what the editor shows now, which leaves that part out. Save anyway?`)) {
        status(`Not saved: fix levels/${name}.json and reload, or Save to replace it`, true, `Not saved: levels/${name}.json had a problem (${level.problem}). Fix the file and reload, or Save again to replace it.`);
        return false;
      }
      level.problem = null;
    }
    if (level.site) return publishNow(name, rev, body);
    try {
      // level.disk: the file as the editor read it (or last saved it). The dev server answers 409 if the
      // file on disk is not that any more: another tab saved, or a git pull or merge brought in edits.
      const send = force => fetch('/__dev/pftc-level?name=' + encodeURIComponent(name) + (force ? '&force=1' : ''),
        { method: 'POST', headers: { 'Content-Type': 'application/json', ...(level.disk ? { 'X-Level-Base': level.disk } : {}) }, body });
      let r = await send(false);
      if (r.status === 409) {
        const why = (await r.text()).slice(0, 160);
        if (!confirm(`${why}: another editor tab saved it, or a git pull or merge changed it.\n\nSaving replaces the whole file with what this editor shows, and those changes are lost. Save anyway?\n\n(Cancel, then reload the page, to pick them up first. Your unsaved edits here are lost on reload.)`)) {
          status(`Not saved: ${name}.json changed on disk since you opened it`, true, `Not saved: ${why}. Reload the page to pick up those changes (your unsaved edits here are lost), or Save again and confirm to replace them.`);
          return false;
        }
        r = await send(true);
      }
      if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 120));
      level.disk = (await r.json().catch(() => ({}))).hash || null;
      if (E.rev !== rev) { status(`Saved, but you changed something meanwhile: Save again`, false, `Saved levels/${name}.json, but you changed something while it saved: Save again to keep that too`); return true; }
      dirty(false); status(`Saved levels/${name}.json`);
      return true;
    } catch (e) {
      // No dev server (or an old one): hand the file over instead.
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' })); a.download = name + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      status(`Not saved: downloaded ${name}.json, put it in par-for-the-curse/levels/`, true,
        `Could not save through the dev server (${e.message}). Downloaded ${name}.json instead: put it in par-for-the-curse/levels/. Run node tools/dev.mjs to save directly.`);
      return false;
    }
  }
  // The live site (level.site, from siteEditAccess): Save publishes. The server stores the overlay as a new
  // version of the course, which every player gets on their next load (within about 15 s). level.disk is the
  // id of the version the editor started from ('none': none published yet); the server answers 409 if
  // someone has published since.
  async function publishNow(name, rev, body) {
    const where = api.backNine ? 'Lantern Links' : 'Mount Bogey';
    if (!confirm(`Publish your ${where} edits to vibecodedslopware.com?\n\nThey go live for every player on their next load (within about 15 seconds). The version they replace is kept.`)) {
      status('Not published', false); return false;
    }
    status('Publishing…');
    try {
      let r = await level.site.publish(body, level.disk, false);
      if (r.status === 409) {
        if (!confirm(`${r.data.error}: someone published this course from another tab since you opened it.\n\nPublishing replaces the whole file with what this editor shows, and those changes are lost. Publish anyway?\n\n(Cancel, then reload the page, to pick them up first. Your unpublished edits here are lost on reload.)`)) {
          status(`Not published: the course changed since you opened it`, true, 'Not published: it changed on the site since the editor loaded it. Reload to pick that up, or Save again and confirm to replace it.');
          return false;
        }
        r = await level.site.publish(body, level.disk, true);
      }
      if (!r.ok) throw new Error(r.data.error || 'the server answered ' + r.status);
      level.disk = r.data.sha || level.disk;
      const live = r.data.unchanged ? 'nothing to publish: it is already on the site' : 'published: live for everyone within about 15 seconds';
      if (E.rev !== rev) { status(`${cap(live)} · you changed something meanwhile: Save again`, false); return true; }
      dirty(false); status(cap(live), false);
      return true;
    } catch (e) {
      status('Not published: ' + e.message, true);
      return false;
    }
  }
  const cap = s => s[0].toUpperCase() + s.slice(1);
  addEventListener('beforeunload', e => { if (E.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- test drive ---------------- */
  async function test() {
    if (drag) return;
    stopPlace();      // back from the drive, a click selects again
    if (E.dirty && !level.site) await save();      // an unchanged file is left as it is (no rewrite, no diff noise); on the live site a test never publishes
    setActive(false);
    delete window.__freeCam;
    S.fpv = E.fpv; S.savedG = null;
    if (api.me) api.me.root.visible = true;
    S.hole = E.hole;      // start() shows the card of S.hole: make it this hole's
    S.startedAt = 0;      // and start() starts the race clock again: time spent editing is not race time
    api.start(); api.teleport(E.hole);
    testBadge.hidden = false;
  }
  async function back() {
    testBadge.hidden = true;
    try { await api.toTitle(); } catch (e) { console.warn(e); }
    setActive(true);
  }
  function setActive(on) {
    E.active = on; root.hidden = !on;
    E.keys.clear(); E.rmb = false; E.down = null;
    // The game lets go too: a key held when the drive ends is let go in the editor, which keeps its keyup
    // from the game, so the golfer would walk off by itself on the next drive.
    try { api.letGo?.(); } catch (e) {}
    if (on) {
      S.fpv = false;      // the free camera needs the game's third-person path
      const t = document.getElementById('title'); if (t) t.hidden = true;
      const tags = document.getElementById('tags'); if (tags) tags.style.display = 'none';
      if (api.me) api.me.root.visible = false;
      render();
    } else { tc.detach(); boxH.visible = false; const tags = document.getElementById('tags'); if (tags) tags.style.display = ''; }
  }

  /* ---------------- panels ---------------- */
  // What an inline piece is: the hole code's label for it (userData.label), the model it is made of
  // (windmill_blades_1 is a part of windmill_blades), or its name. (Its id keeps the name: see levels.js.)
  // Front-nine inline pieces the hole code leaves unnamed ("Mesh", "Group"), by hole and shape, or by id for
  // the one-off groups. Kept here rather than as labels in course.js, whose hole code other work edits.
  const FRONT_INLINE = { 3: { CylinderGeometry: 'grass disk' }, 5: { CylinderGeometry: 'corkscrew tower' }, 6: { CylinderGeometry: 'rope post' },
    7: { RingGeometry: 'catch ring', ConeGeometry: 'catch arrow' }, 9: { CylinderGeometry: 'peg' } };
  const FRONT_GROUPS = { 'h5:loose:Group:30,-1': 'sweeper', 'h7:loose:Group:35,4.2': 'cannon barrel', 'h9:loose:Group:80,0': 'turntable' };
  function looseName(it) {
    const o = it.out.group?.[0];
    if (o?.userData?.label) return o.userData.label;
    if (!api.backNine && it.scope[0] === 'h') { const n = o?.isMesh ? FRONT_INLINE[it.hole]?.[o.geometry?.type] : FRONT_GROUPS[it.id]; if (n) return n; }
    if (/^(Mesh|Group|Object3D)$/.test(it.name) && o) { let part = null; o.traverse(m => { const k = !part && /^([a-z][a-z0-9_]*?)_\d+$/i.exec(m.name || ''); if (k) part = k[1]; }); if (part) return part.replace(/_/g, ' '); }
    return it.name.replace(/_/g, ' ');
  }
  const plural = (n, w) => `${n} ${n === 1 ? w : w === 'goose' ? 'geese' : w === 'cup and flag' ? 'cups and flags' : /(s|sh|ch|x)$/.test(w) ? w + (/s$/.test(w) ? '' : 'es') : w + 's'}`;
  function label(it) {
    const a = it.args;
    // Inline pieces are often unnamed parts ("Mesh", "Group") of one thing: where they are tells them apart.
    if (it.loose) { const p = rec.pivotOf(it); return `${looseName(it)} (inline) at ${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}`; }
    switch (it.m) {
      case 'prop': return `${a[0]} at ${fmt(a[1])}, ${fmt(a[2])}`;
      case 'block': return `block ${fmt(a[0])}..${fmt(a[1])} by ${fmt(a[2])}..${fmt(a[3])}, top ${fmt(a[4])}${typeof a[5] === 'number' && a[5] !== a[4] ? '..' + fmt(a[5]) : ''}`;
      case 'zone': return `${a[0]} at ${fmt(a[1])}, ${fmt(a[2])}`;
      case 'sign': return `sign "${(Array.isArray(a[3]) ? a[3] : []).join(' ')}"`;
      case 'wall': return `wall ${fmt(a[0])},${fmt(a[1])} to ${fmt(a[2])},${fmt(a[3])}`;
      case 'road': return `cart road from ${(a[0]?.[0] || []).map(fmt).join(', ')}`;
      case 'mover': return `moving block ${it.id.split(':')[2] || ''}`;
      default: { const p = AD[it.m]?.pivot ? AD[it.m].pivot(a, it) : null; return `${NAMES[it.m] || it.m}${p ? ` at ${fmt(p[0])}, ${fmt(p[2])}` : ''}`; }
    }
  }
  function badges(it) {
    const e = rec.entry(it), gone = it.add && !data.add.includes(it.add);
    return (it.add ? '<i class="b b-add">added</i>' : '') + (e && (e.set || e.off || e.rot) ? '<i class="b b-edit">edited</i>' : '')
      + (it.deleted || gone ? '<i class="b b-del">deleted</i>' : '') + (LOCKED.has(it.m) ? '<i class="b b-lock">locked</i>' : '')
      + (it.loose ? '<i class="b b-loose">inline</i>' : '') + (it.broken ? '<i class="b b-bad">!</i>' : '')
      + (it.unbuilt && !it.deleted ? '<i class="b b-bad" title="no ground under it here: not built">no ground</i>' : '');
  }
  function renderBar() {
    for (const b of ui.holes.children) b.classList.toggle('on', +b.dataset.h === E.hole);
    q('[data-a=translate]').classList.toggle('on', E.mode === 'translate'); q('[data-a=rotate]').classList.toggle('on', E.mode === 'rotate');
    q('[data-a=undo]').disabled = !E.undo.length; q('[data-a=redo]').disabled = !E.redo.length;
  }
  function renderList() {
    const H = holeH(E.hole);
    ui.lh.textContent = `Hole ${holeNumber(E.hole)}${H.name ? ': ' + H.name : ''}`;
    const f = E.filter, frag = document.createDocumentFragment();
    let n = 0;
    for (const it of rec.list) {
      if (it.hole !== E.hole) continue;
      const lb = label(it);
      if (f && !lb.toLowerCase().includes(f) && !it.id.toLowerCase().includes(f)) continue;
      const d = document.createElement('div'), gone = it.deleted || (it.add && !data.add.includes(it.add));
      d.className = 'le-row' + (it === E.sel || E.multi?.includes(it) ? ' on' : '') + (gone ? ' dead' : '');
      d.innerHTML = esc(lb) + badges(it); d.title = it.id;
      d.onclick = ev => { if (ev.shiftKey) toggle(it); else { select(it); frameSel(); } };
      frag.appendChild(d); n++;
    }
    ui.list.innerHTML = ''; ui.list.appendChild(frag);
    if (!n) ui.list.innerHTML = '<div class="le-dim">Nothing here matches.</div>';
    ui.list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  function field(it, [path, lab, type = 'num'], ad, off) {
    const v = path[0] === '@' ? (path === '@rot' ? rec.entry(it)?.rot || 0 : (rec.entry(it)?.off || [0, 0, 0])[+path.split('.')[1]]) : getPath(it.args, path);
    const peek = ad?.peek?.(it, path), ph = peek == null ? '' : ` placeholder="${esc(fmt(peek))}"`, dis = off ? ' disabled' : '';
    let inp;
    if (type === 'bool') inp = `<input type="checkbox" data-p="${path}" data-t="bool"${v ? ' checked' : ''}${dis}>`;
    else if (type === 'lines') inp = `<input data-p="${path}" data-t="lines" value="${esc((Array.isArray(v) ? v : []).join(' | '))}"${dis}>`;
    else if (type === 'str') inp = `<input data-p="${path}" data-t="str" value="${esc(v ?? '')}"${dis}>`;
    else if (Array.isArray(type) || type === 'props') {
      const opts = type === 'props' ? propNames() : type, list = v != null && !opts.includes(v) ? [v, ...opts] : opts;
      inp = `<select data-p="${path}" data-t="${type === 'props' ? 'str' : typeof opts[0] === 'number' ? 'numsel' : 'str'}"${dis}>${type === 'props' ? '' : '<option value="">(default)</option>'}${list.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (type === 'deg') {      // turns are radians in the file and degrees here
      const deg = r => (typeof r === 'number' ? String(+(r * 180 / Math.PI).toFixed(1)) : '');
      inp = `<input type="number" step="5" data-p="${path}" data-t="deg" value="${deg(v)}"${peek == null ? '' : ` placeholder="${esc(deg(peek))}"`}${dis}>`;
    } else inp = `<input type="number" step="0.1" data-p="${path}" data-t="num" value="${typeof v === 'number' ? fmt(v) : ''}"${ph}${dis}>`;
    return `<label title="${esc(path)}">${esc(lab)}</label>${inp}`;
  }
  // The panel for the selection: [key, html]. The key names what its fields are, so a change that keeps
  // them (an edited value, a rebuilt piece) updates them in place (see renderInspector).
  function inspectorHtml() {
    const it = E.sel;
    if (E.multi) {
      const L = E.multi, kinds = new Map();
      for (const x of L) { const n = x.loose ? looseName(x) : NAMES[x.m] || x.m; kinds.set(n, (kinds.get(n) || 0) + 1); }
      const top = `<div class="le-h">${L.length} pieces</div><div class="le-dim">hole ${holeNumber(L[0].hole)} · ${esc([...kinds].map(([k, n]) => plural(n, k)).join(', '))}</div>
        <p class="le-dim">${groupTurns(L) ? 'The gizmo moves and turns them as one, about their middle.' : `The gizmo moves them as one (${L.some(x => canTurn(x)) ? 'not all of them' : 'none of them'} can turn).`} Each is saved as its own edit. Shift+click a piece to add or drop it, Esc to let go.</p>`;
      const btns = '<button data-b="del">Delete all</button>' + (L.some(x => ADDABLE.has(x.m)) ? '<button data-b="dup">Duplicate</button>' : '')
        + (L.some(x => !x.add && rec.entry(x)) ? '<button data-b="revert" title="Drop their saved edits">Revert</button>' : '') + '<button data-b="focus">Focus (F)</button>';
      return ['multi', `<div class="le-top">${top}</div><div class="le-btns">${btns}</div>`];
    }
    if (!it) return ['none', `<div class="le-top"><p class="le-dim">Click a piece of the course to select it (Shift+click for several), or pick something from Place and click where it goes.</p>
      <p class="le-dim">${Object.keys(data.items).length} edited, ${data.add.length} added on this nine.${rec.orphans.length ? ` <span class="le-warn">${rec.orphans.length} saved edit(s) match nothing in the code (the holes changed?); they stay in the file.</span>` : ''}</p>
      ${level.problem ? `<p class="le-warn">Problem with levels/${esc(level.name)}.json: ${esc(level.problem)}. The course shows without that part, and saving would drop it.</p>` : ''}</div>`];
    const ad = AD[it.m], locked = LOCKED.has(it.m), gone = it.add ? !data.add.includes(it.add) : it.deleted, off = !editable(it);
    let h = `<div class="le-h">${esc(label(it))}</div><div class="le-id">${esc(it.id)}</div><div class="le-dim">hole ${holeNumber(it.hole)}${it.scope[0] === 'p' ? ' · tee/green pad' : ''} · ${esc(it.m)}${badges(it)}</div>`;
    if (it.broken) h += `<p class="le-warn">Would not build from these values (${esc(it.broken)}).${it.add ? '' : ' Built as the code wrote it.'}</p>`;
    if (it.unbuilt && !it.deleted) h += '<p class="le-warn">Not built: there is no ground under it here, so it is left out (a normal load leaves it out too). Move it back over the course, give it a y, or undo.</p>';
    if (locked) h += '<p class="le-dim">Built by the course for the rules (cups, checkpoint bays): shown here, not editable.</p>';
    else if (it.lockMove) h += `<p class="le-warn">This one can turn in place but not move: ${esc(it.lockMove)}.</p>`;
    else if (it.loose) h += '<p class="le-dim">Built inline by the hole\'s code: it can be moved, turned or deleted. Its other parts (a windmill\'s blades, a mushroom\'s stem, the cannon\'s barrel and ring) are pieces of their own: Shift+click them to move them together.</p>';
    const fields = [];
    if (!ad?.move && !locked) fields.push(['@off.0', 'move x'], ['@off.1', 'move y'], ['@off.2', 'move z'], ['@rot', 'turn (degrees)', 'deg']);
    for (const f of ad?.fields || []) fields.push(f);
    let b = '';
    if (!locked) b += gone ? '<button data-b="restore">Restore</button>' : '<button data-b="del">Delete</button>';
    if (ADDABLE.has(it.m) && !it.deleted) b += '<button data-b="dup">Duplicate</button>';
    const en = !it.add && rec.entry(it);      // deleted and nothing else: Restore does what Revert would
    if (en && (!en.del || en.set || en.off || en.rot)) b += '<button data-b="revert" title="Drop this piece\'s saved edit">Revert</button>';
    if (!it.deleted) b += '<button data-b="focus">Focus (F)</button>';
    const key = 'one:' + it.id + ':' + fields.map(f => f[0]).join(',');
    return [key, `<div class="le-top">${h}</div>${fields.length ? `<div class="le-f">${fields.map(f => field(it, f, ad, off || (it.lockMove && f[0].startsWith('@off')))).join('')}</div>` : ''}<div class="le-btns">${b}</div>`];
  }
  // A full redraw would drop the focus (Tab or Enter in one field, or a click into the next, commits the
  // first, and the edit redraws the panel). So the same fields are updated in place, and when the panel
  // does have to be drawn again, the focus goes back to the field it was in or on its way to.
  // (Fields only: a clicked button lets go of the focus on purpose, see the click handler on the panel.)
  let wantFocus = null;
  const focusKey = n => (n?.dataset?.p != null ? `[data-p="${n.dataset.p.replace(/["\\]/g, '\\$&')}"]` : null);
  const focusable = () => [...ui.insp.querySelectorAll('input:not(:disabled), select:not(:disabled), button:not(:disabled)')];
  ui.insp.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = focusable(), i = f.indexOf(e.target);
    wantFocus = i >= 0 ? focusKey(f[i + (e.shiftKey ? -1 : 1)]) : null;
    setTimeout(() => { wantFocus = null; }, 0);
  }, true);
  ui.insp.addEventListener('pointerdown', e => { wantFocus = focusKey(e.target.closest('[data-p], [data-b]')); setTimeout(() => { wantFocus = null; }, 500); }, true);
  // Typing not yet committed (see the Ctrl+Z rule in the key handler).
  ui.insp.addEventListener('input', e => { if (e.target.dataset?.p != null) e.target.dataset.typed = '1'; });
  function patchInspector(el, html) {
    const nu = document.createElement('div'); nu.innerHTML = html;
    const a = [...el.querySelectorAll('[data-p]')], b = [...nu.querySelectorAll('[data-p]')];
    if (a.length !== b.length || a.some((x, i) => x.dataset.p !== b[i].dataset.p || x.tagName !== b[i].tagName || x.type !== b[i].type)) return false;
    const swap = s => { const o = el.querySelector(s), n = nu.querySelector(s); if (!o || !n) return !o === !n; if (o.innerHTML !== n.innerHTML) o.innerHTML = n.innerHTML; return true; };
    if (!swap('.le-top')) return false;
    a.forEach((x, i) => {
      const y = b[i];
      x.disabled = y.disabled;
      if (x.type === 'checkbox') x.checked = y.checked;
      else if (x.tagName === 'SELECT') { if (x.innerHTML !== y.innerHTML) x.innerHTML = y.innerHTML; x.value = y.value; }
      else { if (x.value !== y.value) x.value = y.value; x.placeholder = y.placeholder; }
    });
    const B = el.querySelector('.le-btns'), B2 = nu.querySelector('.le-btns');
    if (B.innerHTML !== B2.innerHTML) { B.innerHTML = B2.innerHTML; bindButtons(el); }
    return true;
  }
  function bindButtons(el) {
    const it = E.sel, many = !!E.multi;
    const B = { del: () => (many ? delSel() : del(it)), restore: () => restore(it), dup: () => (many ? dupSel() : dup(it)), revert: () => (many ? revertSel() : revert(it)), focus: () => frameSel() };
    el.querySelectorAll('[data-b]').forEach(b => { b.onclick = () => B[b.dataset.b](); });
  }
  function renderInspector() {
    const el = ui.insp, [key, html] = inspectorHtml(), it = E.sel, same = !!it && el.dataset.item === it.id;
    if (el.dataset.key === key && key.startsWith('one:') && patchInspector(el, html)) return;
    const ae = document.activeElement, fk = same ? wantFocus || (ae && el.contains(ae) ? focusKey(ae) : null) : null;
    let caret = null; try { if (ae && fk === focusKey(ae) && ae.selectionStart != null) caret = [ae.selectionStart, ae.selectionEnd]; } catch (e) {}
    el.innerHTML = html; el.dataset.key = key; el.dataset.item = it ? it.id : '';
    el.querySelectorAll('[data-p]').forEach(inp => {
      inp.onchange = () => {
        delete inp.dataset.typed;
        const t = inp.dataset.t, raw = inp.value;
        let v;
        if (t === 'bool') v = inp.checked || null;
        else if (t === 'num' || t === 'deg') { if (raw === '') v = null; else { v = +raw; if (!Number.isFinite(v)) return; if (t === 'deg') v = Math.round(v * Math.PI / 180 * 1e4) / 1e4; } }
        else if (t === 'numsel') v = raw === '' ? null : +raw;
        else if (t === 'lines') { v = raw.split('|').map(s => s.trim()).filter(Boolean).slice(0, 3); if (!v.length) return; }
        else v = raw === '' ? null : raw;
        setField(it, inp.dataset.p, v);
      };
    });
    bindButtons(el);
    const n = fk && el.querySelector(fk);
    if (n && !n.disabled) { n.focus(); try { if (caret) n.setSelectionRange(...caret); else if (n.select && n.tagName === 'INPUT' && n.type !== 'checkbox') n.select(); } catch (e) {} }
  }
  function render() { renderBar(); renderList(); renderInspector(); gizmo(); }
  function select(it) {
    E.sel = it || null; E.multi = null;
    if (it && it.hole !== E.hole) E.hole = it.hole;
    render(); selStatus();
  }
  // Several pieces (two or more), or one, or none.
  function setSel(L) {
    if (L.length < 2) return select(L[0] || null);
    E.multi = L; E.sel = null; E.hole = L[0].hole;
    render(); selStatus();
  }
  // Shift+click: a piece joins the selection, or leaves it. A group is pieces that can be moved, on one hole.
  function toggle(it) {
    if (!it) return;
    const cur = selected().slice(), at = cur.indexOf(it);
    if (at >= 0) { cur.splice(at, 1); return setSel(cur); }
    if (!cur.length) return select(it);
    if (LOCKED.has(it.m)) return status('Cups and checkpoint bays are built for the rules: they stay out of a group.');
    if (!editable(it)) return status('A deleted piece cannot join a group: restore it first.');
    if (it.lockMove) return status(`That one can only turn in place (${it.lockMove}): it stays out of a group.`);
    // A group stays on one hole. A far piece of another one is easy to hit by accident (the holes above
    // are in view), so it is left out and the selection stays as it is: a plain click selects it there.
    if (it.hole !== E.hole || cur.some(x => x.hole !== it.hole)) return status(`Left out: that is on hole ${holeNumber(it.hole)}, a group stays on one hole`, false, `Left out ${label(it)}: it is on hole ${holeNumber(it.hole)}, and a group stays on one hole. Click it (without Shift) to select it there.`);
    const keep = cur.filter(x => editable(x) && !x.lockMove);
    setSel([...keep, it]);
    if (keep.length < cur.length) status('Left out what cannot move (a cup, a bay, a deleted piece).');
  }
  function goHole(i) {
    E.hole = holeNum(i); overview(E.hole);
    if (E.sel && E.sel.hole !== E.hole) E.sel = null;
    if (E.multi && E.multi[0].hole !== E.hole) E.multi = null;
    render(); selStatus();
  }
  function setMode(m) {
    E.mode = m;
    if (m === 'rotate' && E.sel && !canTurn(E.sel)) status('This one has no turn: move it, or change its values.');
    if (m === 'rotate' && E.multi && !groupTurns(E.multi)) status(`${E.multi.some(x => canTurn(x)) ? 'Not all' : 'None'} of these can turn (blocks, terraces, roads and bumpers stay as they are): the group only moves.`);
    if (m === 'translate' && E.sel?.lockMove) status(`This one can only turn in place: ${E.sel.lockMove}.`);
    render();
  }

  /* ---------------- input ---------------- */
  const typing = t => t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !/^(checkbox|button|range)$/.test(t.type)));
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (!E.active) { if (e.key === 'F2' || e.code === 'Backquote') { e.preventDefault(); e.stopPropagation(); back(); } return; }
    // Ctrl shortcuts work from the filter and the inspector too (Ctrl+S would open the browser's "Save page
    // as"), except undo and redo in a text box, which undo the typing. An inspector field keeps the focus
    // after Enter: with nothing typed since, Ctrl+Z there undoes the edit it just made.
    const t = e.target, inText = typing(t) && t.tagName !== 'SELECT' && !(t.dataset?.p != null && !t.dataset.typed);
    if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'd' || (!inText && (k === 'z' || k === 'y')))) {
      e.preventDefault(); e.stopPropagation();
      if (k === 's') { if (typing(e.target)) e.target.blur(); save(); }      // blur: a typed value commits first
      else if (k === 'd') dupSel(); else if (k === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (typing(e.target)) { if (k === 'escape') e.target.blur(); return; }
    e.stopPropagation();      // the game's own keys stay out of the editor (it is on its title screen anyway)
    if (k === 'tab') { if (!root.contains(e.target)) e.preventDefault(); return; }      // in the panels it goes on to the next field
    if (e.ctrlKey || e.metaKey) return;
    E.keys.add(k);
    if (E.rmb || e.repeat) return;      // flying: WASD QE move the camera
    if (k === 'w') setMode('translate'); else if (k === 'r') setMode('rotate');
    else if (k === 'f') frameSel();
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); delSel(); }
    else if (k === 'escape') { if (E.placing) { stopPlace(); status('Stopped placing'); } else select(null); }
    else if (/^[1-9]$/.test(k)) goHole(+k);
  }, true);
  addEventListener('keyup', e => { E.keys.delete(e.key.toLowerCase()); if (E.active && !typing(e.target)) e.stopPropagation(); }, true);
  addEventListener('blur', () => { E.keys.clear(); E.rmb = false; });
  canvas.addEventListener('pointerdown', e => {
    if (!E.active) return;
    if (e.button === 2) { E.rmb = true; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} return; }
    if (e.button === 0) E.down = { x: e.clientX, y: e.clientY, gizmo: !!tc.object && tc.axis !== null };
  });
  addEventListener('pointermove', e => {
    if (!E.active || !E.rmb) return;
    cam.yaw -= e.movementX * 0.0032; cam.pitch = clamp(cam.pitch - e.movementY * 0.0032, -1.52, 1.52);
  });
  addEventListener('pointerup', e => {
    if (!E.active) return;
    if (e.button === 2) { E.rmb = false; E.keys.clear(); return; }
    const d = E.down; E.down = null;
    if (e.button !== 0 || !d || d.gizmo || drag || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    if (E.placing) placeAt(e.clientX, e.clientY, e.shiftKey);
    else if (e.shiftKey) { const h = castAt(e.clientX, e.clientY); if (h) toggle(h.item); }      // Shift+click on nothing keeps the selection
    else pickAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('wheel', e => {
    if (!E.active) return;
    e.preventDefault();
    if (E.rmb) { cam.speed = clamp(cam.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 2, 150); status(`Fly speed ${cam.speed.toFixed(0)} m/s`); }
    else cam.pos.addScaledVector(dirOf(), -Math.sign(e.deltaY) * Math.max(1.5, cam.speed * 0.3));
  }, { passive: false });

  /* ---------------- every frame ---------------- */
  const tmpBox = new THREE.Box3();
  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.2, (now - last) / 1000); last = now;      // real time, so flying keeps its speed on a slow frame
    if (!E.active) return;
    fly(dt);
    const d = dirOf();
    window.__freeCam = [cam.pos.toArray(), cam.pos.clone().add(d).toArray()];
    S.golferG.copy(cam.pos).addScaledVector(d, 18);      // the sun's shadow box follows the golfer: keep it on what you look at
    if (api.me) api.me.root.visible = false;
    const it = E.sel, L = E.multi || (it && !it.deleted ? [it] : []);
    boxH.box.makeEmpty(); for (const x of L) boxH.box.union(rec.worldBox(x, tmpBox));
    boxH.visible = !boxH.box.isEmpty();
    // A moving piece carries the move gizmo along (its pivot is where it was at t = 0, which it may be far
    // from). It holds still while the mouse is over a handle, so the handle can be grabbed; a drag measures
    // from where it started, so riding along does not change what the drag does. The turn ring stays on the
    // pivot, the point it turns about (a goose's is the middle of its patrol).
    if (it && !E.multi && E.mode === 'translate' && boxH.visible && tc.object === proxy && !tc.dragging && tc.axis === null && !AD[it.m]?.pivot && it.out.movers?.length) { boxH.box.getCenter(proxy.position); proxy.updateMatrixWorld(true); }
    if (statusT && now - statusT > 12000 && !E.placing) idleStatus();
  }

  // Start: the title screen goes, the camera looks over the first hole (or ?hole=N).
  setActive(true);
  overview(E.hole);
  render();
  requestAnimationFrame(tick);
  if (level.problem) status(`Problem with levels/${level.name}.json: ${level.problem}. The course shows without that part and saving would drop it: fix the file and reload (Save asks first).`, true);
  else status(rec.orphans.length ? `${rec.orphans.length} saved edit(s) match nothing in the code (the holes changed?): kept in the file` : `Editing ${level.name}.json · ${rec.list.length} pieces`, !!rec.orphans.length);

  // For headless tests and the console (localhost only, like window.__g).
  window.__ed = {
    rec, data, E, cam, level, tc, proxy, get sel() { return E.sel; }, item: id => rec.items.get(id), label,
    boxScreen: id => { const it = rec.items.get(id), b = rec.worldBox(it); if (b.isEmpty()) return null; const s = b.getCenter(V()).project(camera), r = canvas.getBoundingClientRect(); return [r.left + (s.x + 1) / 2 * r.width, r.top + (1 - s.y) / 2 * r.height]; },
    select: id => select(typeof id === 'string' ? rec.items.get(id) : id), pickAt, screenOf, castAt: (x, y) => castAt(x, y)?.item?.id ?? null,
    // move: the selection, as one gizmo gesture would (a group about its middle).
    move: (d, da = 0) => { if (E.multi) { placeProxy(E.multi[0].H.frame, groupCentre(E.multi)); commitGroup(startGesture(E.multi), d, da); } else if (E.sel) commitMove(E.sel, d, da); },
    del: () => delSel(), restore: () => restore(E.sel), dup: () => dupSel(), revert: () => revertSel(),
    get multi() { return E.multi; }, toggle: id => toggle(typeof id === 'string' ? rec.items.get(id) : id), selectMany: ids => setSel(ids.map(id => rec.items.get(id)).filter(it => editable(it) && !it.lockMove)),
    setField: (p, v) => setField(E.sel, p, v), undo, redo, save, test, back, hole: goHole, overview, lookFrom: (a, b) => lookFrom(V(...a), V(...b)), frameSel,
    place: (m, hole, x, y, z, propName) => { const p = m === 'prop' ? { label: propName, m: 'prop', args: (a, b, c) => propArgs(propName, a, b, c) } : (() => { const o = OBSTACLES.find(o => o[1] === m || o[0] === m); return o && { label: o[0], m: o[1], args: o[2] }; })(); return p ? placeLocal(p, hole, V(x, y, z)) : null; },
    get dirty() { return E.dirty; }, get status() { return ui.status.textContent; }, get active() { return E.active; },
  };
}
