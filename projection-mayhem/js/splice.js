// Projection Mayhem: the splicing bench.
//
//   openSplice(root, { film, mode: 'buildup' | 'repair', reel, allowMischief, onDone(result) }) -> { close() }
//
// A full-screen DOM + canvas overlay appended to `root`. Build-up joins film.reels - 1 reel pairs; each splice
// is taught step by step the way a projectionist really does it: cut the tail on the frame line, cut the head
// leader off, seat both ends on the registration pins, tape the emulsion side, trim + punch, flip, tape the
// base side, trim + punch, grease-pencil the edge. Repair mode cuts the damage out of a mid-reel break.
//
// result = { aborted, quality 0..1, framesLost, leaderFlashes, mischief (id|null), splices: [{ quality, framesLost, leaderFlash }] }
// close() tears the overlay down without calling onDone.

import { paintShot, paintLeader, paintCue, paintMischief, paintPoster } from './frames.js';
import { MISCHIEF_FRAMES } from './films.js';

// ---------------------------------------------------------------- 35mm geometry (mm)
const PITCH = 19;                // 4 perfs x 4.75mm
const FILM_W = 35;
const PERF_P = 4.75, PERF_W = 2.79, PERF_H = 1.98, PERF_L = 2.01, PERF_R = 30.2;
const PIC_X = 7.9, PIC_W = 22, PIC_Y = 1.5, PIC_H = 16;
const TRACK_X = 5.15, TRACK_W = 2.4;
const SNAP = 0.075;              // frame units within which a cut counts as "on the frame line"
const T_STEP = 0.012;            // t advance per frame (consecutive frames look nearly identical)

const VERDICTS = [
  [0.92, 'Clean splices. Nobody in the audience will ever know.'],
  [0.78, 'Good, tight splices. The print will hold.'],
  [0.6, 'It’ll run. The front row might feel a little jump.'],
  [0.4, 'Rough. That join is going to chatter through the gate.'],
  [-1, 'That splice is held together by hope. Watch the take-up reel.'],
];

const STEP_TEXT = {
  tail: ['Tail of reel {k} on the light box. Find the last picture frame before the run-out leader and cut on the frame line just below it.',
    'Scroll or drag the film; click to cut. The four frames with a round cue dot top-right are the changeover cue, about a second from the end.'],
  head: ['Head of reel {k1}. Wind past the head leader, PICTURE START and the 8…3 countdown to the first frame of picture, and cut on the frame line just above it.',
    'Leave leader on and the audience sees a flash of countdown. Cut into the picture and frames go in the trim bin. (A real head leader is about 12 feet; this one is trimmed.)'],
  cutA: ['The film broke in the gate and the heat burned it. Cut on the frame line just above the first damaged frame.',
    'Scroll or drag to find the damage; click to cut. Take out every scorched frame, and as little picture as you can.'],
  cutB: ['Now cut on the frame line just below the last damaged frame.',
    'Anything scorched left in the print will jump or tear again in the gate.'],
  seat: ['Seat both ends on the splicer’s registration pins so the sprocket holes sit on the pins and the frame lines butt together.',
    'Drag each end toward the middle and let go. The pins catch it if you are close; a sloppy seat makes a crooked splice.'],
  box: ['Tyler’s shoebox: single frames cut out of other prints. One frame is 1/24 of a second. Nobody can ever be sure they saw it.',
    'Drop one between the ends (it becomes part of this print), or tape it clean.'],
  tape1: ['Lay clear splicing tape across the join on the emulsion side (the dull side), straight and centred on the frame line.',
    'Drag the tape from the dispenser and let go over the join. Slow hands lay it straight; a fast swing lays it crooked.'],
  press1: ['Pull the splicer handle down. The blades trim the tape to the film’s edges and punch the sprocket holes back through it.',
    'Drag the handle all the way down.'],
  flip: ['Flip the film over. Tape on one side only peels off in the heat of the gate.',
    'Click “Flip the film” or press F.'],
  tape2: ['Now tape the base side (the shiny side) the same way, right over the join.',
    'Same as before: drag the tape, slow down as you lay it.'],
  press2: ['Trim and punch again.', 'Drag the handle all the way down.'],
  mark: ['Optional: a grease-pencil tick on the edge, so whoever breaks this print down later can find the splice in a hurry.',
    'Click the film’s edge beside the splice, or skip it.'],
};

const CSS = `
.spl-root{position:absolute;inset:0;z-index:60;display:flex;flex-direction:column;background:#120d0a radial-gradient(ellipse at 50% 40%,#2a1d14 0%,#120d0a 70%);color:#f2e3c6;font:14px/1.4 "Segoe UI",system-ui,-apple-system,sans-serif;user-select:none;-webkit-user-select:none;overflow:hidden}
.spl-root *{box-sizing:border-box}
.spl-top{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #3a2a1c;background:linear-gradient(#1f1610,#18110c)}
.spl-title{font:600 17px Georgia,"Times New Roman",serif;color:#ffcf7a;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.spl-title small{color:#b89a70;font:13px "Segoe UI",system-ui,sans-serif;margin-left:8px;letter-spacing:0}
.spl-pips{display:flex;gap:5px;margin-left:auto}
.spl-pip{width:28px;height:8px;border-radius:4px;background:#3a2a1c;border:1px solid #5a4028}
.spl-pip.on{background:#f0b050;border-color:#ffd080;box-shadow:0 0 8px #f0b05088}
.spl-pip.done{background:#7a5a30}
.spl-x{margin-left:10px;background:#2a1d14;border:1px solid #5a4028;color:#f2e3c6;border-radius:6px;padding:5px 11px;font:600 13px system-ui,sans-serif;cursor:pointer}
.spl-x:hover{background:#3a2818;border-color:#f0b050}
.spl-cap{padding:10px 18px 9px;border-bottom:1px solid #2e2116;background:#17100b;min-height:62px}
.spl-cap b{display:block;font:500 16px/1.35 Georgia,serif;color:#fff0d4}
.spl-cap span{display:block;font-size:12.5px;color:#c4a77e;margin-top:3px}
.spl-main{flex:1;display:flex;min-height:0}
.spl-stage{position:relative;flex:1;min-width:0}
.spl-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.spl-side{width:300px;flex:none;border-left:1px solid #3a2a1c;background:linear-gradient(#1a130e,#140e0a);padding:12px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.spl-film{display:flex;gap:10px;align-items:flex-start}
.spl-film canvas{width:64px;height:96px;border-radius:2px;box-shadow:0 2px 8px #000a;flex:none}
.spl-film div{font-size:12px;color:#b89a70}
.spl-film b{display:block;font:600 14px Georgia,serif;color:#ffe0a8;margin-bottom:2px}
.spl-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;font-size:12.5px}
.spl-steps li{padding:3px 8px;border-radius:5px;color:#8a7458;display:flex;gap:8px}
.spl-steps li::before{content:'\\25CB';width:12px;flex:none}
.spl-steps li.done{color:#b89a70}
.spl-steps li.done::before{content:'\\2713';color:#9ac070}
.spl-steps li.on{background:#3a2814;color:#ffd890;font-weight:600}
.spl-steps li.on::before{content:'\\25B6';color:#f0b050}
.spl-h{font:600 11px system-ui,sans-serif;color:#a08060;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px}
.spl-btn{display:block;width:100%;background:linear-gradient(#f4b85a,#d88f30);color:#2a1606;border:0;border-radius:7px;padding:9px 12px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 0 #7a4a14,0 0 14px #f0a04040;margin-top:6px}
.spl-btn:hover{filter:brightness(1.08)}
.spl-btn.ghost{background:#2a1d14;color:#f2e3c6;box-shadow:none;border:1px solid #5a4028;font-weight:600}
.spl-btn.ghost:hover{border-color:#f0b050}
.spl-box{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;padding:8px;border-radius:8px;background:#5a3c22 repeating-linear-gradient(90deg,#5a3c22 0 6px,#53371f 6px 12px);border:2px solid #7a5430;box-shadow:inset 0 3px 10px #0008}
.spl-box button{background:#111;border:2px solid #2a1d14;border-radius:3px;padding:0;cursor:pointer;position:relative}
.spl-box button:hover{border-color:#ffd080;transform:translateY(-1px)}
.spl-box button canvas{display:block;width:100%;height:auto}
.spl-box button span{position:absolute;left:0;right:0;bottom:0;font-size:8.5px;line-height:1.15;background:#000a;color:#f2e3c6;padding:1px 3px;text-align:left}
.spl-boxnote{font-size:12px;color:#ffcf7a;font-style:italic}
.spl-score{font-size:12.5px;color:#c4a77e}
.spl-score b{color:#ffe0a8;font-size:15px}
.spl-log{font-size:12px;color:#a89070;display:flex;flex-direction:column;gap:2px}
.spl-toast{position:absolute;left:50%;top:14px;transform:translateX(-50%);background:#1a120cee;border:1px solid #f0b050;color:#ffe8c0;border-radius:8px;padding:7px 14px;font:600 14px system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 20px #000a}
.spl-toast.show{opacity:1}
.spl-toast.bad{border-color:#e06040;color:#ffd0c0}
.spl-toast.good{border-color:#9ac070;color:#e0f8c8}
.spl-end{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0a0705d0;z-index:5}
.spl-card{width:min(520px,92%);background:linear-gradient(#22180f,#18110b);border:1px solid #7a5430;border-radius:14px;padding:22px 24px;box-shadow:0 10px 40px #000c;text-align:center}
.spl-card h2{margin:0 0 6px;font:600 22px Georgia,serif;color:#ffcf7a}
.spl-card p{margin:6px 0;color:#f2e3c6;font:16px/1.45 Georgia,serif}
.spl-card .spl-stats{display:flex;justify-content:center;gap:22px;margin:14px 0 6px;font-size:12px;color:#a89070}
.spl-card .spl-stats b{display:block;font:600 22px Georgia,serif;color:#ffe0a8}
.spl-card .spl-btn{max-width:260px;margin:14px auto 0}
@media (max-width:1100px){.spl-side{width:250px}.spl-cap b{font-size:15px}}
@media (max-width:960px){.spl-side{width:220px;padding:10px}.spl-film canvas{width:48px;height:72px}.spl-cap b{font-size:14px}}
`;

function injectCss() {
  if (document.getElementById('spl-style')) return;
  const st = document.createElement('style'); st.id = 'spl-style'; st.textContent = CSS; document.head.appendChild(st);
}
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------------------------------------------------------- reel strips
function tailStrip(film, k) {
  const shot = k % film.shots, NP = 30, frames = [];
  for (let i = 0; i < NP; i++) frames.push({ kind: 'pic', shot, t: (0.08 + i * T_STEP) % 1, cue: i >= NP - 24 && i < NP - 20 });
  for (let i = 0; i < 3; i++) frames.push({ kind: 'leader', lk: 'black' });
  for (let i = 0; i < 3; i++) frames.push({ kind: 'leader', lk: 'tail', n: k });
  for (let i = 0; i < 5; i++) frames.push({ kind: 'leader', lk: 'black' });
  return { frames, ideal: NP, keep: 'above', bad: 'leader' };
}
function headStrip(film, k1) {
  const shot = (k1 - 1) % film.shots, frames = [];
  for (let i = 0; i < 3; i++) frames.push({ kind: 'leader', lk: 'head', n: k1 });
  for (let i = 0; i < 2; i++) frames.push({ kind: 'leader', lk: 'start' });
  for (let d = 8; d >= 3; d--) for (let j = 0; j < 3; j++) frames.push({ kind: 'leader', lk: 'countdown', n: d - j / 3 });
  frames.push({ kind: 'leader', lk: 'countdown', n: 2 });
  for (let i = 0; i < 4; i++) frames.push({ kind: 'leader', lk: 'black' });
  const L = frames.length;
  for (let i = 0; i < 26; i++) frames.push({ kind: 'pic', shot, t: (0.08 + (30 + i) * T_STEP) % 1 });
  return { frames, ideal: L, keep: 'below', bad: 'leader' };
}
function repairStrip(film, reel) {
  const r = (n) => hash(strHash(film.id) + reel * 977 + n * 131);
  const shot = (reel || 1) % film.shots, N = 40, T = 19 + Math.floor(r(1) * 4);
  const a = 1 + Math.floor(r(2) * 2), b = 1 + Math.floor(r(3) * 2);
  const frames = [];
  for (let i = 0; i < N; i++) {
    const f = { kind: 'pic', shot, t: (0.2 + i * T_STEP) % 1 };
    if (i >= T - a && i <= T + b) f.damage = { amt: i === T ? 1 : 0.55 + r(10 + i) * 0.35, seed: strHash(film.id) + i * 31 + reel };
    frames.push(f);
  }
  return { frames, tear: T + 0.35 + r(4) * 0.3, dmgFrom: T - a, dmgTo: T + b + 1 };
}

// ---------------------------------------------------------------- the minigame
export function openSplice(root, opts = {}) {
  injectCss();
  const film = opts.film;
  const mode = opts.mode === 'repair' ? 'repair' : 'buildup';
  const total = mode === 'repair' ? 1 : Math.max(1, (film.reels || 2) - 1);
  const allowMischief = !!opts.allowMischief;
  const onDone = typeof opts.onDone === 'function' ? opts.onDone : () => {};

  // ---- DOM
  const R = el('div', 'spl-root');
  R.setAttribute('role', 'dialog'); R.setAttribute('aria-label', 'Splicing bench');
  const top = el('div', 'spl-top');
  const title = el('div', 'spl-title', `Splicing bench <small>${film.title} · ${mode === 'repair' ? `film break, reel ${opts.reel || 1}` : `build-up, ${film.reels} reels`}</small>`);
  const pips = el('div', 'spl-pips');
  for (let i = 0; i < total; i++) pips.appendChild(el('div', 'spl-pip'));
  const xBtn = el('button', 'spl-x', 'Close ✕'); xBtn.title = 'Abort (Esc)';
  top.append(title, pips, xBtn);
  const cap = el('div', 'spl-cap', '<b></b><span></span>');
  const main = el('div', 'spl-main');
  const stage = el('div', 'spl-stage');
  const cv = document.createElement('canvas');
  const toast = el('div', 'spl-toast');
  stage.append(cv, toast);
  const side = el('div', 'spl-side');
  main.append(stage, side);
  R.append(top, cap, main);
  root.appendChild(R);

  // side panel
  const filmBox = el('div', 'spl-film');
  const posterCv = document.createElement('canvas'); posterCv.width = 128; posterCv.height = 192;
  try { paintPoster(posterCv.getContext('2d'), film, 128, 192); } catch (e) { /* art is optional */ }
  filmBox.append(posterCv, el('div', null, `<b>${film.title}</b>${film.genre || ''}<br>${film.shots} shots · ${film.reels} reels`));
  const stepsWrap = el('div'); stepsWrap.append(el('div', 'spl-h', 'This splice'));
  const stepsUl = el('ul', 'spl-steps'); stepsWrap.appendChild(stepsUl);
  const actions = el('div');
  const scoreBox = el('div', 'spl-score');
  const logBox = el('div', 'spl-log');
  side.append(filmBox, stepsWrap, actions, scoreBox, logBox);

  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, s = 6.5; // s = px per mm
  let layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  const frameCache = new Map();

  // ---- state
  const S = {
    k: 1, phase: '', strip: null, scroll: 0, hoverY: null, hoverX: null,
    cuts: [], top: null, bot: null, trims: [],
    seat: null, mischief: null, mischiefUsed: null,
    tapes: [], tapeDrag: null, handle: 0, handleDrag: null, pressedFlash: 0,
    flip: 0, flipping: false, flipped: false, marked: null,
    splices: [], cur: null, done: false, drag: null, now: 0,
  };
  let closed = false, raf = 0, toastTimer = 0;

  function say(text, kind = '', ms = 2600) {
    toast.textContent = text; toast.className = 'spl-toast show ' + kind;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.className = 'spl-toast ' + kind; }, ms);
  }

  // ---- layout
  function resize() {
    const r = stage.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(200, r.width); H = Math.max(200, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    layer.width = cv.width; layer.height = cv.height;
    const ns = clamp(Math.min(H / (PITCH * 4.1), (W * 0.36) / FILM_W, 250 / FILM_W), 3.2, 9);
    if (Math.abs(ns - s) > 0.01) { s = ns; frameCache.clear(); }
    clampScroll();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(stage); else window.addEventListener('resize', resize);

  const stripX = () => Math.round(W * 0.5 - FILM_W * s / 2);     // left edge of film, CSS px
  const joinY = () => Math.round(H * 0.5);

  // ---- frame images (cached per descriptor at current scale)
  function frameImage(f) {
    const pw = Math.max(8, Math.round(PIC_W * s * DPR)), ph = Math.max(6, Math.round(PIC_H * s * DPR));
    const key = f.kind === 'pic' ? `p${f.shot}|${f.t.toFixed(3)}|${f.cue ? 1 : 0}` : f.kind === 'mischief' ? `m${f.id}` : `l${f.lk}|${f.n ?? ''}`;
    let c = frameCache.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = pw; c.height = ph;
    const g = c.getContext('2d');
    try {
      if (f.kind === 'pic') { paintShot(g, film.id, f.shot, pw, ph, f.t); if (f.cue) paintCue(g, pw, ph); }
      else if (f.kind === 'mischief') paintMischief(g, f.id, pw, ph);
      else paintLeader(g, f.lk, f.n, pw, ph);
    } catch (e) { g.fillStyle = '#555'; g.fillRect(0, 0, pw, ph); }
    frameCache.set(key, c);
    return c;
  }

  // ---- film drawing (into the layer, which has real holes for the perfs)
  // cell: frame descriptor; x0/yTop in CSS px; clip [y0,y1] optional; gIdx = global index for edge print/track continuity
  function drawCell(g, f, x0, yTop, gIdx, clipTop = -1e9, clipBot = 1e9, tearTop = null, tearBot = null) {
    const ch = PITCH * s, cw = FILM_W * s;
    const y0 = Math.max(yTop, clipTop), y1 = Math.min(yTop + ch, clipBot);
    if (y1 <= y0 || y1 < -20 || y0 > H + 20) return;
    g.save();
    g.beginPath();
    if (tearTop || tearBot) {
      // jagged break: polygon clip
      const pts = [];
      if (tearTop) { for (const [x, y] of tearTop) pts.push([x, y]); } else { pts.push([x0, y0], [x0 + cw, y0]); }
      if (tearBot) { for (const [x, y] of [...tearBot].reverse()) pts.push([x, y]); } else { pts.push([x0 + cw, y1], [x0, y1]); }
      g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath();
    } else g.rect(x0, y0, cw, y1 - y0);
    g.clip();
    const leaderBlack = f.kind === 'leader' && f.lk === 'black';
    g.fillStyle = leaderBlack ? '#0c0a08' : '#17110d'; g.fillRect(x0, yTop, cw, ch);
    // picture
    if (!leaderBlack) {
      const img = frameImage(f);
      g.drawImage(img, x0 + PIC_X * s, yTop + PIC_Y * s, PIC_W * s, PIC_H * s);
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.strokeRect(x0 + PIC_X * s, yTop + PIC_Y * s, PIC_W * s, PIC_H * s);
    }
    // optical soundtrack: bilateral variable-area squiggle, continuous along the strip
    const tx = x0 + TRACK_X * s, tw = TRACK_W * s, mid = tx + tw / 2;
    g.fillStyle = '#0a0806'; g.fillRect(tx, yTop, tw, ch);
    g.beginPath();
    const steps = Math.max(8, Math.round(ch / 2));
    const silent = f.kind !== 'pic';
    for (let i = 0; i <= steps; i++) {
      const yy = yTop + ch * i / steps, gy = gIdx * PITCH + PITCH * i / steps;
      const a = silent ? 0.06 : 0.12 + 0.88 * Math.abs(Math.sin(gy * 0.83) * Math.sin(gy * 0.21 + 1.3) * (0.6 + 0.4 * Math.sin(gy * 2.7)));
      const hw = a * tw * 0.46;
      i ? g.lineTo(mid + hw, yy) : g.moveTo(mid + hw, yy);
    }
    for (let i = steps; i >= 0; i--) {
      const yy = yTop + ch * i / steps, gy = gIdx * PITCH + PITCH * i / steps;
      const a = silent ? 0.06 : 0.12 + 0.88 * Math.abs(Math.sin(gy * 0.83) * Math.sin(gy * 0.21 + 1.3) * (0.6 + 0.4 * Math.sin(gy * 2.7)));
      g.lineTo(mid - a * tw * 0.46, yy);
    }
    g.closePath(); g.fillStyle = 'rgba(255,246,222,0.85)'; g.fill();
    // edge print (key numbers every foot = 16 frames), right edge outside the perfs
    g.save(); g.translate(x0 + 34.1 * s, yTop + ch / 2); g.rotate(Math.PI / 2);
    g.fillStyle = 'rgba(255,214,140,0.55)'; g.font = `${Math.max(6, 1.25 * s)}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(gIdx % 4 === 0 ? `KODAK 2383 ● ${String(1000 + Math.floor(gIdx / 16)).slice(-3)}+${(gIdx % 16).toString().padStart(2, '0')}` : (gIdx % 4 === 2 ? 'SAFETY FILM' : '▪'), 0, 0);
    g.restore();
    if (f.kind === 'leader' && !leaderBlack) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x0, yTop, PIC_X * s - 1, ch); }
    // damage: burn + bubbles
    if (f.damage) burn(g, x0, yTop, cw, ch, f.damage);
    g.restore();
    // punch the perforations out of the film
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.rect(x0 - 2, y0, cw + 4, y1 - y0); g.clip();
    for (let k = 0; k < 4; k++) {
      const py = yTop + (PERF_P * (k + 0.5) - PERF_H / 2) * s;
      roundRect(g, x0 + PERF_L * s, py, PERF_W * s, PERF_H * s, 0.45 * s); roundRect(g, x0 + PERF_R * s, py, PERF_W * s, PERF_H * s, 0.45 * s);
    }
    g.restore();
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); }
  function burn(g, x0, y0, w, h, d) {
    const r = (n) => hash(d.seed + n * 7);
    const cx = x0 + w * (0.3 + r(1) * 0.4), cy = y0 + h * (0.3 + r(2) * 0.4), rad = w * (0.18 + d.amt * 0.32);
    const gr = g.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
    gr.addColorStop(0, 'rgba(8,4,2,0.98)'); gr.addColorStop(0.45, 'rgba(40,16,4,0.92)'); gr.addColorStop(0.7, 'rgba(190,90,20,0.75)'); gr.addColorStop(0.85, 'rgba(240,190,90,0.45)'); gr.addColorStop(1, 'rgba(240,200,120,0)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI * 2, k = rad * (0.75 + r(10 + i) * 0.4); i ? g.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k) : g.moveTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); }
    g.closePath(); g.fill();
    for (let i = 0; i < 9 * d.amt + 3; i++) { const bx = cx + (r(40 + i) - 0.5) * rad * 2.2, by = cy + (r(60 + i) - 0.5) * rad * 1.6, br = 1 + r(80 + i) * 0.9 * s; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.strokeStyle = 'rgba(230,170,80,0.7)'; g.lineWidth = 1; g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const sx = x0 + r(90 + i) * w; g.beginPath(); g.moveTo(sx, y0); g.lineTo(sx + (r(95 + i) - 0.5) * 8, y0 + h); g.stroke(); }
  }

  // ---- strip coordinates for the cutting phases
  const stripLen = () => S.strip.frames.length * PITCH;
  function clampScroll() {
    if (!S.strip) return;
    const half = H / 2 / s;
    S.scroll = clamp(S.scroll, half - PITCH * 0.35, stripLen() + (S.strip.gapMm || 0) - half + PITCH * 0.35);
  }
  // screen y <-> strip mm (accounts for the torn gap in repair mode)
  function mmToY(mm) { const gap = S.strip.gapMm && mm > S.strip.tear * PITCH ? S.strip.gapMm : 0; return H / 2 + (mm + gap - S.scroll) * s; }
  function yToMm(y) {
    let mm = S.scroll + (y - H / 2) / s;
    if (S.strip.gapMm) { const t = S.strip.tear * PITCH; if (mm > t + S.strip.gapMm) mm -= S.strip.gapMm; else if (mm > t) mm = null; }
    return mm;
  }

  // ---- background: bench, light box, minimap
  function drawBench() {
    const g = ctx;
    g.fillStyle = '#1c130d'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${i % 2 ? 50 : 30},${i % 2 ? 32 : 20},${i % 2 ? 20 : 12},0.35)`; g.fillRect(0, i * H / 26, W, H / 52); }
    const lx = stripX() - 96, lw = FILM_W * s + 192;
    g.save(); g.shadowColor = 'rgba(255,220,150,0.55)'; g.shadowBlur = 40;
    const gr = g.createLinearGradient(lx, 0, lx + lw, 0); gr.addColorStop(0, '#f6dfae'); gr.addColorStop(0.5, '#fff8e8'); gr.addColorStop(1, '#f6dfae');
    g.fillStyle = gr; g.fillRect(lx, 0, lw, H); g.restore();
    g.fillStyle = 'rgba(120,90,50,0.25)'; for (let y = 0; y < H; y += 3) g.fillRect(lx, y, lw, 1);
    g.fillStyle = '#3a2a1c'; g.fillRect(lx - 6, 0, 6, H); g.fillRect(lx + lw, 0, 6, H);
  }

  function drawMinimap() {
    if (!S.strip || !(S.phase === 'tail' || S.phase === 'head' || S.phase === 'cutA' || S.phase === 'cutB')) return;
    const g = ctx, n = S.strip.frames.length;
    const mx = Math.max(12, stripX() - 96 - 52), my = 20, mh = H - 40, mw = 26;
    const fh = mh / n;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    for (let i = 0; i < n; i++) {
      const f = S.strip.frames[i];
      g.fillStyle = f.kind === 'pic' ? (f.damage ? '#8a3a10' : (f.cue ? '#f0e0b0' : '#b89a70')) : (f.lk === 'black' ? '#151010' : '#6a6a6a');
      g.fillRect(mx, my + i * fh + 0.5, mw, Math.max(1, fh - 1));
    }
    if (S.cuts.length) for (const c of S.cuts) { g.fillStyle = '#ff5040'; g.fillRect(mx - 4, my + c.u * fh - 1, mw + 8, 2); }
    const v0 = (S.scroll - H / 2 / s) / PITCH, v1 = (S.scroll + H / 2 / s) / PITCH;
    g.strokeStyle = '#ffd080'; g.lineWidth = 2; g.strokeRect(mx - 3, my + v0 * fh, mw + 6, (v1 - v0) * fh);
    g.fillStyle = '#c4a77e'; g.font = '10px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('REEL', mx + mw / 2, my - 7);
    S.mini = { x: mx - 6, y: my, w: mw + 12, h: mh, n };
  }

  // ---- render
  function render() {
    if (closed) return;
    raf = requestAnimationFrame(render);
    S.now = performance.now();
    if (!W) resize();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height); lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBench();
    const ph = S.phase;
    if (ph === 'tail' || ph === 'head' || ph === 'cutA' || ph === 'cutB') drawCutPhase();
    else if (S.seat && S.top) drawSplicer();
    drawMinimap();
  }

  function drawCutPhase() {
    const x0 = stripX(), n = S.strip.frames.length, ch = PITCH * s;
    const first = Math.max(0, Math.floor((S.scroll - H / 2 / s - (S.strip.gapMm || 0)) / PITCH) - 1);
    const last = Math.min(n - 1, Math.ceil((S.scroll + H / 2 / s) / PITCH) + 1);
    const cuts = S.cuts;
    const tear = S.strip.tear;
    for (let i = first; i <= last; i++) {
      const f = S.strip.frames[i];
      if (tear != null && i === Math.floor(tear)) {
        // the torn frame is drawn as two halves with a jagged edge
        const ty = mmToY(tear * PITCH - 0.0001), ty2 = mmToY(tear * PITCH + 0.0001);
        const jag = (base) => { const pts = []; for (let k = 0; k <= 10; k++) pts.push([x0 + FILM_W * s * k / 10, base + (hash(k * 13 + 7) - 0.5) * 2.4 * s]); return pts; };
        drawCell(lctx, f, x0, mmToY(i * PITCH), i, -1e9, ty + 3 * s, null, jag(ty));
        drawCell(lctx, f, x0, ty2 - (tear - i) * ch, i, ty2 - 3 * s, 1e9, jag(ty2), null);
      } else drawCell(lctx, f, x0, mmToY(i * PITCH), i);
    }
    // removed pieces fade out
    ctx.drawImage(layer, 0, 0, W, H);
    for (const c of cuts) {
      // kept side stays; the trimmed side is greyed out
      const y = mmToY(c.u * PITCH);
      const ya = c.from <= 0 ? -10 : mmToY(c.from * PITCH + (S.strip.tear != null && c.from === S.strip.tear ? 0.001 : 0)), yb = c.to >= S.strip.frames.length ? H + 10 : mmToY(c.to * PITCH - (S.strip.tear != null && c.to === S.strip.tear ? 0.001 : 0));
      ctx.fillStyle = 'rgba(20,12,8,0.66)'; ctx.fillRect(x0 - 2, Math.min(ya, yb), FILM_W * s + 4, Math.abs(yb - ya));
      const my = clamp((Math.max(0, Math.min(ya, yb)) + Math.min(H, Math.max(ya, yb))) / 2, 50, H - 20); ctx.fillStyle = 'rgba(255,200,170,0.85)'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; if (Math.max(ya, yb) > 40 && Math.min(ya, yb) < H - 10) ctx.fillText('↓ TRIM BIN', x0 + FILM_W * s / 2, my);
      ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x0 - 16, y); ctx.lineTo(x0 + FILM_W * s + 16, y); ctx.stroke();
    }
    // hover cut line
    if (S.hoverY != null && !S.drag?.moved && S.hoverX != null && Math.abs(S.hoverX - (x0 + FILM_W * s / 2)) < FILM_W * s * 0.5 + 60) {
      const mm = yToMm(S.hoverY);
      if (mm != null) {
        let u = mm / PITCH; const r = Math.round(u); const on = Math.abs(u - r) < SNAP; if (on) u = r;
        const y = mmToY(u * PITCH);
        ctx.save(); ctx.strokeStyle = on ? '#3cf07a' : '#ffb040'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
        ctx.beginPath(); ctx.moveTo(x0 - 30, y); ctx.lineTo(x0 + FILM_W * s + 30, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = on ? '#3cf07a' : '#ffb040'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(on ? '✂ on the frame line' : '✂ inside a frame', x0 + FILM_W * s + 34, y + 4);
        ctx.restore();
      }
    }
    // labels
    ctx.fillStyle = '#5a4028'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'right';
    const lbl = S.phase === 'tail' ? ['TAIL END', `REEL ${S.k}`] : S.phase === 'head' ? ['HEAD', `REEL ${S.k + 1}`] : ['FILM BREAK', `REEL ${opts.reel || 1}`];
    ctx.textAlign = 'right'; ctx.fillText(lbl[0], x0 - 10, 22); ctx.fillText(lbl[1], x0 - 10, 37);
  }

  // ---- splicer phases
  function pieceGeom() {
    // top piece ends at join + offTop (mm); bottom piece starts at join + offBot. Mischief inserts one frame between.
    const gap = S.mischief ? PITCH / 2 : 0;
    return { topTarget: -gap, botTarget: gap };
  }
  function drawSplicer() {
    const g = ctx, x0 = stripX(), jy = joinY(), cw = FILM_W * s, ch = PITCH * s;
    const flipK = S.flipping ? Math.cos(S.flip * Math.PI) : (S.flipped ? -1 : 1);
    // splicer plate (under the film; shows through the perf holes)
    const px0 = x0 - 26, pw = cw + 52, py0 = jy - ch * 2.3, phh = ch * 4.6;
    const pg = g.createLinearGradient(px0, 0, px0 + pw, 0); pg.addColorStop(0, '#4a4e54'); pg.addColorStop(0.5, '#8a9098'); pg.addColorStop(1, '#4a4e54');
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(px0 + 6, py0 + 8, pw, phh);
    g.fillStyle = pg; g.fillRect(px0, py0, pw, phh);
    g.fillStyle = '#2a2c30'; g.fillRect(x0 - 3, py0, cw + 6, phh); // channel
    g.fillStyle = '#16181a'; g.fillRect(px0, jy - 1, pw, 2);      // cutting groove
    g.fillStyle = '#c8ccd2'; g.font = '600 10px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('CIR · TAPE SPLICER', px0 + pw / 2, py0 + phh + 14);
    // registration pins
    for (let k = -8; k < 8; k++) {
      const y = jy + (PERF_P * (k + 0.5)) * s;
      if (y < py0 + 6 || y > py0 + phh - 6) continue;
      for (const px of [x0 + (PERF_L + PERF_W / 2) * s, x0 + (PERF_R + PERF_W / 2) * s]) {
        const xx = S.flipping || S.flipped ? 2 * (x0 + cw / 2) - px : px;
        g.beginPath(); g.arc(xx, y, 0.72 * s, 0, Math.PI * 2); const pinG = g.createRadialGradient(xx - 1, y - 1, 0, xx, y, 0.72 * s); pinG.addColorStop(0, '#ffffff'); pinG.addColorStop(1, '#7a8088'); g.fillStyle = pinG; g.fill();
      }
    }
    // film pieces into the layer
    const geo = pieceGeom();
    const lift = (p) => S.drag && S.drag.what === p;
    const tY = jy + S.seat.top * s, bY = jy + S.seat.bot * s;
    // shadows for lifted pieces
    if (lift('top')) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 6, -10, cw, tY + 16); }
    if (lift('bot')) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 6, bY + 6, cw, H - bY); }
    lctx.save();
    if (flipK !== 1) { lctx.translate(x0 + cw / 2, 0); lctx.scale(flipK, 1); lctx.translate(-(x0 + cw / 2), 0); }
    const T = S.top, B = S.bot;
    // top piece: frames up to endU, end at tY
    for (let i = Math.floor(T.endU - 1e-6), j = 0; j < 8 && i >= 0; i--, j++) {
      const yTop = tY - (T.endU - i) * ch;
      if (yTop + ch < -20) break;
      drawCell(lctx, T.frames[i], x0, yTop, T.base + i, -1e9, tY);
    }
    // bottom piece: frames from startU, start at bY
    for (let i = Math.floor(B.startU), j = 0; j < 8 && i < B.frames.length; i++, j++) {
      const yTop = bY + (i - B.startU) * ch;
      if (yTop > H + 20) break;
      drawCell(lctx, B.frames[i], x0, yTop, B.base + i, bY, 1e9);
    }
    if (S.mischief) drawCell(lctx, { kind: 'mischief', id: S.mischief }, x0, jy + geo.topTarget * s, 7);
    lctx.restore();
    g.drawImage(layer, 0, 0, W, H);
    // tape(s)
    for (const tp of S.tapes) drawTape(g, tp, x0, jy, flipK);
    if (S.tapeDrag) { const t = S.tapeDrag; if (S.now - t.lt > 45) t.ang *= 0.86; drawTape(g, t, x0, jy, 1, true); }
    // grease pencil mark
    if (S.marked) { g.save(); g.strokeStyle = '#ffd400'; g.lineWidth = 3.2; g.lineCap = 'round'; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(S.marked.x - 4, S.marked.y - 9); g.lineTo(S.marked.x + 3, S.marked.y + 9); g.moveTo(S.marked.x + 5, S.marked.y - 9); g.lineTo(S.marked.x + 12, S.marked.y + 9); g.stroke(); g.restore(); }
    // labels on the light box
    g.fillStyle = '#5a4028'; g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'right';
    const lab = mode === 'repair' ? ['ABOVE BREAK', 'BELOW BREAK'] : [`TAIL · REEL ${S.k}`, `HEAD · REEL ${S.k + 1}`];
    const lx = x0 - 30;
    g.fillText(lab[0], lx, clamp(tY - ch * 1.2, 18, H - 40)); g.fillText(lab[1], lx, clamp(bY + ch * 1.2, 40, H - 24));
    g.fillStyle = '#3a7a2a';
    if (S.seat.topOk) g.fillText('✓ on the pins', lx, clamp(tY - ch * 1.2 + 15, 32, H - 26));
    if (S.seat.botOk) g.fillText('✓ on the pins', lx, clamp(bY + ch * 1.2 + 15, 54, H - 10));
    g.fillStyle = '#6a4a2a'; g.textAlign = 'center';
    g.textAlign = 'right';
    g.fillText(S.flipped ? 'base side up' : S.flipping ? 'flipping…' : 'emulsion up', lx, jy - 4);
    g.fillText(S.flipped ? '(shiny)' : S.flipping ? '' : '(dull)', lx, jy + 10);
    // dispenser + handle
    drawDispenser(g, x0, jy);
    drawHandle(g, x0, jy);
    if (S.pressedFlash > 0) { g.fillStyle = `rgba(255,255,255,${S.pressedFlash * 0.35})`; g.fillRect(x0 - 30, jy - ch * 2.3, cw + 60, ch * 4.6); S.pressedFlash = Math.max(0, S.pressedFlash - 0.05); }
    if (S.flipping) { S.flip = Math.min(1, S.flip + 0.035); if (S.flip >= 1) { S.flipping = false; S.flipped = true; S.flip = 0; advance(); } }
  }
  function tapeSpan() { return S.mischief ? PITCH * 1.9 : PITCH * 0.95; }
  // Tapes live in film coordinates (dx from the film's centre line, dy from the join, ang) and are drawn under
  // the same horizontal flip as the film. A pressed tape is trimmed to the film edges and has the perforations
  // punched through it (evenodd holes at the film's real perf positions).
  function drawTape(g, tp, x0, jy, flipK, dragging) {
    const cw = FILM_W * s, th = tapeSpan() * s, mid = x0 + cw / 2;
    g.save();
    if (dragging) {
      g.translate(tp.x, tp.y); g.rotate(tp.ang);
      g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 6;
      const wide = cw + 4 * s;
      g.fillStyle = 'rgba(255,252,235,0.36)'; g.fillRect(-wide / 2, -th / 2, wide, th);
      g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.strokeRect(-wide / 2, -th / 2, wide, th);
      g.restore(); return;
    }
    if (flipK !== 1) { g.translate(mid, 0); g.scale(flipK, 1); g.translate(-mid, 0); }
    const under = (tp.side === 'emulsion') === (flipK < 0);
    const wide = tp.pressed ? cw : cw + 4 * s;
    const cx = mid + tp.dx, cy = jy + tp.dy, ca = Math.cos(tp.ang), sa = Math.sin(tp.ang);
    const corner = (x, y) => [cx + x * ca - y * sa, cy + x * sa + y * ca];
    const pts = [corner(-wide / 2, -th / 2), corner(wide / 2, -th / 2), corner(wide / 2, th / 2), corner(-wide / 2, th / 2)];
    if (tp.pressed) { g.beginPath(); g.rect(x0, 0, cw, H); g.clip(); }
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.closePath();
    if (tp.pressed) {
      for (let k = -8; k < 8; k++) {
        const y = jy + (PERF_P * (k + 0.5) - PERF_H / 2) * s;
        if (Math.abs(y - cy) > th * 0.75 + PERF_H * s) continue;
        g.rect(x0 + PERF_L * s, y, PERF_W * s, PERF_H * s); g.rect(x0 + PERF_R * s, y, PERF_W * s, PERF_H * s);
      }
    }
    g.globalAlpha = under ? 0.55 : 1;
    g.fillStyle = tp.side === 'base' ? 'rgba(225,238,255,0.30)' : 'rgba(255,252,235,0.34)'; g.fill('evenodd');
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.closePath(); g.stroke();
    const sh = g.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.45, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fill('evenodd');
    g.restore();
  }
  function dispenserGeom() { const x0 = stripX(), jy = joinY(); return { x: x0 + FILM_W * s + 90, y: jy - PITCH * s * 1.7, r: 26 }; }
  function drawDispenser(g, x0, jy) {
    const d = dispenserGeom();
    const active = S.phase === 'tape1' || S.phase === 'tape2';
    g.fillStyle = '#2a2420'; g.fillRect(d.x - 34, d.y - 34, 68, 80);
    g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fillStyle = 'rgba(240,240,230,0.75)'; g.fill();
    g.beginPath(); g.arc(d.x, d.y, d.r * 0.45, 0, Math.PI * 2); g.fillStyle = '#3a3430'; g.fill();
    g.fillStyle = '#d8d8d0'; g.font = '600 10px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('TAPE', d.x, d.y + 40);
    if (active && !S.tapeDrag) {
      const pulse = 0.5 + 0.5 * Math.sin(S.now / 250);
      g.fillStyle = `rgba(255,252,235,${0.35 + pulse * 0.25})`; g.fillRect(d.x - 18, d.y + d.r - 4, 36, 18);
      g.strokeStyle = `rgba(255,208,128,${0.5 + pulse * 0.5})`; g.lineWidth = 2; g.strokeRect(d.x - 20, d.y + d.r - 6, 40, 22);
    }
  }
  function handleGeom() { const x0 = stripX(), jy = joinY(); const px = x0 + FILM_W * s + 50, py = jy + PITCH * s * 0.9; const a = -1.1 + S.handle * 1.35; return { px, py, kx: px + Math.cos(a) * 95, ky: py + Math.sin(a) * 95, a }; }
  function drawHandle(g) {
    const h = handleGeom();
    const active = S.phase === 'press1' || S.phase === 'press2';
    g.strokeStyle = '#7a8088'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(h.px, h.py); g.lineTo(h.kx, h.ky); g.stroke();
    g.strokeStyle = '#b8bec6'; g.lineWidth = 3; g.beginPath(); g.moveTo(h.px, h.py); g.lineTo(h.kx, h.ky); g.stroke();
    g.beginPath(); g.arc(h.px, h.py, 9, 0, Math.PI * 2); g.fillStyle = '#4a4e54'; g.fill();
    g.beginPath(); g.arc(h.kx, h.ky, 13, 0, Math.PI * 2); g.fillStyle = active ? '#d8402a' : '#7a2a1a'; g.fill();
    if (active && !S.handleDrag) { const pulse = 0.5 + 0.5 * Math.sin(S.now / 250); g.strokeStyle = `rgba(255,208,128,${pulse})`; g.lineWidth = 2; g.beginPath(); g.arc(h.kx, h.ky, 18, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#ffd080'; g.font = '600 11px system-ui'; g.textAlign = 'left'; g.fillText('↓ pull', h.kx + 20, h.ky + 4); }
    if (!S.handleDrag && S.handle > 0 && !(S.phase === 'press1' || S.phase === 'press2')) S.handle = Math.max(0, S.handle - 0.06);
  }

  // ---- phases
  function stepList() {
    const L = mode === 'repair' ? ['cutA', 'cutB', 'seat'] : ['tail', 'head', 'seat'];
    if (allowMischief && !S.mischiefUsed) L.push('box');
    L.push('tape1', 'press1', 'flip', 'tape2', 'press2', 'mark');
    return L;
  }
  const STEP_LABEL = { tail: 'Cut the tail', head: 'Cut the head leader', cutA: 'Cut above the damage', cutB: 'Cut below the damage', seat: 'Seat on the pins', box: 'Tyler’s shoebox', tape1: 'Tape the emulsion side', press1: 'Trim + punch', flip: 'Flip the film', tape2: 'Tape the base side', press2: 'Trim + punch', mark: 'Grease-pencil mark' };

  function setPhase(ph) {
    S.phase = ph;
    S.hoverY = null; S.lock = false;
    const [a, b] = STEP_TEXT[ph] || ['', ''];
    const fill = (t) => t.replace('{k}', S.k).replace('{k1}', S.k + 1);
    cap.querySelector('b').textContent = fill(a); cap.querySelector('span').textContent = fill(b);
    const list = S.stepList;
    stepsUl.innerHTML = '';
    const idx = list.indexOf(ph);
    list.forEach((p, i) => { const li = el('li', i < idx ? 'done' : i === idx ? 'on' : '', STEP_LABEL[p]); stepsUl.appendChild(li); });
    renderActions();
    pips.querySelectorAll('.spl-pip').forEach((p, i) => { p.className = 'spl-pip' + (i < S.k - 1 ? ' done' : i === S.k - 1 ? ' on' : ''); });
  }
  function advance() {
    const L = S.stepList; const i = L.indexOf(S.phase);
    const next = L[i + 1];
    if (!next) return finishSplice();
    if (next === 'head') loadStrip(headStrip(film, S.k + 1), 'head');
    else if (next === 'cutB') { /* same strip */ }
    else if (next === 'seat') buildPieces();
    setPhase(next);
  }

  function loadStrip(st) {
    S.strip = st; S.cuts = [];
    S.scroll = H / 2 / s; clampScroll();
  }

  function startSplice() {
    S.cur = { cutQ: [], framesLost: 0, leaderFlash: false, damageLeft: false, seatQ: 1, tapeQ: [], marked: false, mischief: null };
    S.tapes = []; S.tapeDrag = null; S.handle = 0; S.markDone = false; S.flip = 0; S.flipping = false; S.flipped = false; S.marked = null; S.mischief = null;
    S.stepList = stepList(); S.top = null; S.bot = null; S.seat = null;
    if (mode === 'repair') {
      const st = repairStrip(film, opts.reel || 1); st.gapMm = 7; loadStrip(st);
      // start with the break a little below the middle so the player has to look for it
      S.scroll = clamp(st.tear * PITCH - H / 2 / s - PITCH * 3.2, H / 2 / s, 1e9); clampScroll();
      setPhase('cutA');
    } else { loadStrip(tailStrip(film, S.k)); setPhase('tail'); }
  }

  // cut evaluation
  function doCut(mm) {
    let u = mm / PITCH; const r = Math.round(u); const on = Math.abs(u - r) < SNAP; if (on) u = r;
    const st = S.strip, ph = S.phase;
    let lost = 0, extra = 0, msg = '', kind = 'good', q = 1;
    if (ph === 'tail' || ph === 'head') {
      const N = st.ideal;
      if (st.keep === 'above') { // keep [0,u)
        if (u <= N) lost = on ? N - u : N - Math.floor(u); else extra = on ? u - N : Math.ceil(u - N);
      } else {                   // keep [u,end)
        if (u >= N) lost = on ? u - N : Math.ceil(u) - N; else extra = on ? N - u : N - Math.floor(u);
      }
      lost = Math.max(0, Math.round(lost)); extra = Math.max(0, Math.round(extra));
      q = 1 - 0.2 * lost - (extra ? 0.45 : 0) - (on ? 0 : 0.12);
      if (!lost && !extra && on) msg = 'Clean cut, right on the frame line.';
      else if (lost) { msg = `Cut into the picture: ${lost} frame${lost > 1 ? 's' : ''} in the trim bin.`; kind = 'bad'; }
      else if (extra) { msg = `${extra} frame${extra > 1 ? 's' : ''} of leader left on. The audience will see a flash.`; kind = 'bad'; S.cur.leaderFlash = true; }
      else { msg = 'Off the frame line: a sliver of a frame stays on the join.'; kind = 'bad'; }
      S.cur.framesLost += lost;
      S.cuts.push({ u, from: st.keep === 'above' ? u : 0, to: st.keep === 'above' ? st.frames.length : u });
      S.cur.cutQ.push(clamp(q, 0, 1));
      if (ph === 'tail') S.cur.tail = { u, frames: st.frames }; else S.cur.head = { u, frames: st.frames };
    } else { // repair cuts
      if (ph === 'cutA') {
        if (u >= st.tear) { say('That’s past the break. Cut above it first.', 'bad'); return; }
        const ideal = st.dmgFrom;
        const left = u > ideal ? (on ? u - ideal : Math.ceil(u - ideal)) : 0; // damaged frames left on top
        const lostGood = u < ideal ? (on ? ideal - u : ideal - Math.floor(u)) : 0;
        if (left) S.cur.damageLeft = true;
        S.cur.framesLost += Math.round(lostGood);
        q = 1 - 0.15 * Math.round(lostGood) - (left ? 0.5 : 0) - (on ? 0 : 0.12);
        msg = left ? 'Scorched frames are still on the top piece.' : lostGood ? `Clear of the damage, but ${Math.round(lostGood)} good frame${lostGood > 1 ? 's' : ''} went with it.` : (on ? 'Clean: right above the damage, on the frame line.' : 'Clear of the damage, but off the frame line.');
        kind = left || lostGood || !on ? 'bad' : 'good';
        S.cuts.push({ u, from: u, to: st.tear }); S.cur.cutQ.push(clamp(q, 0, 1)); S.cur.tail = { u, frames: st.frames };
      } else {
        if (u <= st.tear) { say('Cut below the break this time.', 'bad'); return; }
        const ideal = st.dmgTo;
        const left = u < ideal ? (on ? ideal - u : ideal - Math.floor(u)) : 0;
        const lostGood = u > ideal ? (on ? u - ideal : Math.ceil(u) - ideal) : 0;
        if (left) S.cur.damageLeft = true;
        S.cur.framesLost += Math.round(lostGood) + (st.dmgTo - st.dmgFrom);
        q = 1 - 0.15 * Math.round(lostGood) - (left ? 0.5 : 0) - (on ? 0 : 0.12);
        msg = left ? 'Scorched frames are still on the bottom piece.' : lostGood ? `Clear of the damage, but ${Math.round(lostGood)} good frame${lostGood > 1 ? 's' : ''} went with it.` : (on ? 'Clean: the damage is out, and not a frame more.' : 'Clear of the damage, but off the frame line.');
        kind = left || lostGood || !on ? 'bad' : 'good';
        S.cuts.push({ u, from: st.tear, to: u }); S.cur.cutQ.push(clamp(q, 0, 1)); S.cur.head = { u, frames: st.frames };
      }
    }
    say(msg, kind);
    setTimeout(() => { if (!closed) advance(); }, 650);
    S.lock = true; // freeze cutting until the next phase
  }

  function buildPieces() {
    const t = S.cur.tail, h = S.cur.head;
    S.top = { frames: t.frames, endU: t.u, base: 0 };
    S.bot = { frames: h.frames, startU: h.u, base: mode === 'repair' ? 0 : 1000 };
    S.seat = { top: -PITCH * 1.6, bot: PITCH * 1.75, topOk: false, botOk: false, errs: [] };
    S.strip = null;
  }

  // ---- seating
  function release(which) {
    const geo = pieceGeom();
    const target = which === 'top' ? geo.topTarget : geo.botTarget;
    const off = S.seat[which];
    const nearest = target + Math.round((off - target) / PERF_P) * PERF_P;
    const err = Math.abs(off - nearest);
    const TOL = 1.5;
    if (err > TOL) { say('The perforations missed the pins. Try again.', 'bad', 1600); return; }
    S.seat[which] = nearest + (off - nearest) * 0.12; // the pins pull it home, nearly
    if (Math.abs(nearest - target) > 0.01) {
      S.seat[which + 'Ok'] = false;
      say(nearest < target === (which === 'top') ? 'On the pins, but there’s a gap between the ends.' : 'On the pins, but the ends overlap.', 'bad', 1800);
      return;
    }
    S.seat[which + 'Ok'] = true;
    S.seat[which + 'Err'] = err / TOL;
    say(err / TOL < 0.35 ? 'Click. Seated square on the pins.' : 'Seated, a hair off square.', err / TOL < 0.35 ? 'good' : '', 1400);
    if (S.seat.topOk && S.seat.botOk) {
      S.cur.seatQ = clamp(1 - 0.45 * ((S.seat.topErr ** 1.3 + S.seat.botErr ** 1.3) / 2), 0, 1);
      setTimeout(() => { if (!closed && S.phase === 'seat') advance(); }, 500);
    }
  }

  // ---- mischief
  function insertMischief(id) {
    if (S.phase !== 'box') return;
    S.mischief = id; S.mischiefUsed = id; S.cur.mischief = id;
    S.seat.top = -PITCH / 2; S.seat.bot = PITCH / 2;
    const m = MISCHIEF_FRAMES.find(x => x.id === id);
    say(`${m ? m.label : 'A frame'}: in. One twenty-fourth of a second.`, '', 2200);
    advance();
  }

  // ---- tape
  function dropTape(tp) {
    const x0 = stripX(), jy = joinY(), cw = FILM_W * s;
    const dx = tp.x - (x0 + cw / 2), dy = tp.y - jy;
    if (Math.abs(dx) > cw * 0.35 || Math.abs(dy) > PITCH * s * 0.6) { say('Missed the join. The tape goes back on the roll.', 'bad', 1500); return; }
    const side = S.phase === 'tape1' ? 'emulsion' : 'base';
    const q = clamp(1 - Math.min(1, Math.abs(tp.ang) / 0.22) * 0.55 - Math.min(1, Math.abs(dy) / (5 * s)) * 0.3 - Math.min(1, Math.abs(dx) / (cw * 0.35)) * 0.15, 0, 1);
    const fk = S.flipped ? -1 : 1;
    S.tapes.push({ dx: dx * 0.15 * fk, dy: dy * 0.6, ang: tp.ang * fk, side, pressed: false });
    S.cur.tapeQ.push(q);
    say(q > 0.85 ? 'Laid straight across the join.' : q > 0.6 ? 'A little crooked, but it’ll hold.' : 'Crooked tape. It’ll hold, ugly.', q > 0.85 ? 'good' : q > 0.6 ? '' : 'bad', 1600);
    advance();
  }

  // ---- handle
  function pressDone() {
    S.pressedFlash = 1; S.handleDrag = null;
    const tp = S.tapes[S.tapes.length - 1]; if (tp) tp.pressed = true;
    say('Chunk. Trimmed and punched.', 'good', 1200);
    advance();
  }

  function finishSplice() {
    const c = S.cur;
    const cutQ = c.cutQ.length ? c.cutQ.reduce((a, b) => a + b, 0) / c.cutQ.length : 1;
    const tapeQ = c.tapeQ.length ? c.tapeQ.reduce((a, b) => a + b, 0) / c.tapeQ.length : 0.5;
    let q = cutQ * 0.45 + c.seatQ * 0.25 + tapeQ * 0.3 + (c.marked ? 0.03 : 0);
    if (c.damageLeft) q = Math.min(q, 0.45);
    q = clamp(q, 0, 1);
    const rec = { quality: Math.round(q * 1000) / 1000, framesLost: c.framesLost, leaderFlash: !!c.leaderFlash };
    if (mode === 'repair') rec.damageLeft = !!c.damageLeft;
    S.splices.push(rec);
    const li = el('div', null, `Splice ${S.k}: <b style="color:#ffe0a8">${Math.round(q * 100)}%</b>${c.framesLost ? ` · ${c.framesLost} lost` : ''}${c.leaderFlash ? ' · leader flash' : ''}${c.mischief ? ' · ★' : ''}`);
    logBox.appendChild(li);
    updateScore();
    if (S.k < total) { S.k++; S.phase = 'between'; setTimeout(() => { if (!closed) startSplice(); }, 900); say(`Splice ${S.k - 1} done: ${Math.round(q * 100)}%. On to reel ${S.k + 1}.`, 'good', 1800); }
    else setTimeout(() => { if (!closed) endCard(); }, 700);
  }
  function result(aborted) {
    const sp = S.splices;
    const quality = sp.length ? sp.reduce((a, b) => a + b.quality, 0) / sp.length : 0;
    return { aborted: !!aborted, quality: Math.round(quality * 1000) / 1000, framesLost: sp.reduce((a, b) => a + b.framesLost, 0), leaderFlashes: sp.filter(x => x.leaderFlash).length, mischief: S.mischiefUsed || null, splices: sp.slice() };
  }
  function updateScore() {
    const r = result(false);
    scoreBox.innerHTML = r.splices.length ? `Print quality so far <b>${Math.round(r.quality * 100)}%</b>` : '';
  }
  function endCard() {
    S.done = true; S.phase = 'end';
    const r = result(false);
    let verdict = VERDICTS.find(v => r.quality >= v[0])[1];
    if (mode === 'repair') verdict = r.splices[0]?.damageLeft ? 'Some of that scorched film is still in there. It’ll go again.' : verdict.replace('splices', 'splice');
    const extras = [];
    if (r.leaderFlashes) extras.push(`Somebody’s going to see a flash of countdown leader${r.leaderFlashes > 1 ? `, ${r.leaderFlashes} times` : ''}.`);
    if (r.framesLost && mode !== 'repair') extras.push(`${r.framesLost} frame${r.framesLost > 1 ? 's' : ''} went in the trim bin. Nobody will miss them. Probably.`);
    if (r.mischief) extras.push('And one frame that doesn’t belong there. Tyler would be proud.');
    const wrap = el('div', 'spl-end');
    const card = el('div', 'spl-card');
    card.innerHTML = `<h2>${mode === 'repair' ? 'Print repaired' : 'Print built up'}</h2><p>${verdict}</p>${extras.map(e => `<p style="font-size:14px;color:#c4a77e">${e}</p>`).join('')}
      <div class="spl-stats"><div><b>${Math.round(r.quality * 100)}%</b>quality</div><div><b>${r.framesLost}</b>frames lost</div><div><b>${r.splices.length}</b>splice${r.splices.length > 1 ? 's' : ''}</div></div>`;
    const b = el('button', 'spl-btn', 'Back to the booth');
    b.addEventListener('click', () => finish(false));
    card.appendChild(b); wrap.appendChild(card); stage.appendChild(wrap);
    stepsUl.querySelectorAll('li').forEach(li => { li.className = 'done'; });
    cap.querySelector('b').textContent = 'Done. Spool it onto the reel and get it in the can.'; cap.querySelector('span').textContent = 'Press Enter or click Back to the booth.';
    S.phase = 'end';
    actions.innerHTML = '';
    setTimeout(() => b.focus(), 50);
  }
  function finish(aborted) {
    if (closed) return;
    const r = result(aborted);
    teardown();
    try { onDone(r); } catch (e) { console.error(e); }
  }

  // ---- side actions per phase
  function renderActions() {
    actions.innerHTML = ''; stepsWrap.style.display = '';
    const ph = S.phase;
    if (ph === 'box') {
      actions.append(el('div', 'spl-h', 'Tyler’s shoebox'));
      stepsWrap.style.display = 'none';
      const box = el('div', 'spl-box');
      for (const m of MISCHIEF_FRAMES) {
        const b = el('button'); b.title = m.label; b.dataset.id = m.id;
        const c = document.createElement('canvas'); c.width = 120; c.height = 87;
        try { paintMischief(c.getContext('2d'), m.id, 120, 87); } catch (e) { /* ignore */ }
        b.append(c, el('span', null, m.label));
        b.addEventListener('click', () => insertMischief(m.id));
        box.appendChild(b);
      }
      const clean = el('button', 'spl-btn', 'Tape it clean');
      clean.addEventListener('click', () => { if (S.phase === 'box') { say('Clean. Nobody gets hurt tonight.', '', 1400); advance(); } });
      actions.append(box, el('div', 'spl-boxnote', 'Or click a frame to splice it in between the ends.'), clean);
    } else if (ph === 'flip') {
      const b = el('button', 'spl-btn', 'Flip the film (F)'); b.addEventListener('click', doFlip); actions.append(b);
    } else if (ph === 'mark') {
      const b = el('button', 'spl-btn ghost', 'Skip the mark'); b.addEventListener('click', () => { if (S.phase === 'mark') advance(); }); actions.append(b);
    }
  }
  function doFlip() { if (S.phase !== 'flip' || S.flipping) return; S.flipping = true; S.flip = 0; }

  // ---- input
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitPiece(p) {
    const x0 = stripX(), cw = FILM_W * s, jy = joinY();
    if (p.x < x0 - 10 || p.x > x0 + cw + 10) return null;
    const tY = jy + S.seat.top * s, bY = jy + S.seat.bot * s;
    if (p.y < tY + 4) return 'top';
    if (p.y > bY - 4) return 'bot';
    return p.y < (tY + bY) / 2 ? 'top' : 'bot';
  }
  function onDown(e) {
    if (closed || S.done) return;
    const p = pos(e);
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
    const ph = S.phase;
    if (S.mini && (ph === 'tail' || ph === 'head' || ph === 'cutA' || ph === 'cutB') && p.x >= S.mini.x && p.x <= S.mini.x + S.mini.w && p.y >= S.mini.y - 4 && p.y <= S.mini.y + S.mini.h + 4) {
      S.drag = { what: 'mini' }; jumpMini(p.y); return;
    }
    if (ph === 'tail' || ph === 'head' || ph === 'cutA' || ph === 'cutB') { S.drag = { what: 'strip', y0: p.y, x0: p.x, scroll0: S.scroll, moved: false }; return; }
    if (ph === 'seat') { const w = hitPiece(p); if (w && !S.seat[w + 'Ok']) { S.drag = { what: w, y0: p.y, off0: S.seat[w] }; } else if (w) { S.drag = { what: w, y0: p.y, off0: S.seat[w] }; S.seat[w + 'Ok'] = false; } return; }
    if (ph === 'tape1' || ph === 'tape2') {
      const d = dispenserGeom();
      if (Math.abs(p.x - d.x) < 48 && p.y > d.y - 40 && p.y < d.y + 70) { S.tapeDrag = { x: p.x, y: p.y, ang: 0, lx: p.x, lt: performance.now() }; S.drag = { what: 'tape' }; }
      else say('Grab the tape from the dispenser.', '', 1200);
      return;
    }
    if (ph === 'press1' || ph === 'press2') {
      const h = handleGeom();
      if (Math.hypot(p.x - h.kx, p.y - h.ky) < 34) { S.handleDrag = { y0: p.y, h0: S.handle }; S.drag = { what: 'handle' }; }
      else say('Grab the red handle knob and pull it down.', '', 1200);
      return;
    }
    if (ph === 'mark' && !S.markDone) {
      const x0 = stripX(), cw = FILM_W * s, jy = joinY();
      const span = S.mischief ? PITCH * 1.4 : PITCH * 0.9;
      if (p.x > x0 - 12 && p.x < x0 + cw + 12 && Math.abs(p.y - jy) < span * s) {
        const edgeX = p.x < x0 + cw / 2 ? x0 + 0.4 * s : x0 + cw - 2.4 * s;
        S.marked = { x: edgeX, y: clamp(p.y, jy - 14, jy + 4) }; S.cur.marked = true;
        say('Marked. Easy to find at breakdown.', 'good', 1300);
        S.markDone = true;
        setTimeout(() => { if (!closed && S.phase === 'mark') advance(); }, 700);
      } else say('Mark the edge right beside the splice.', '', 1300);
    }
  }
  function jumpMini(y) { const m = S.mini; const u = clamp((y - m.y) / m.h, 0, 1) * m.n; S.scroll = u * PITCH; clampScroll(); }
  function onMove(e) {
    if (closed) return;
    const p = pos(e); S.hoverX = p.x; S.hoverY = p.y;
    const d = S.drag; if (!d) return;
    if (d.what === 'mini') { jumpMini(p.y); return; }
    if (d.what === 'strip') { if (Math.abs(p.y - d.y0) > 4 || Math.abs(p.x - d.x0) > 4) d.moved = true; if (d.moved) { S.scroll = d.scroll0 - (p.y - d.y0) / s; clampScroll(); } return; }
    if (d.what === 'top' || d.what === 'bot') {
      const off = d.off0 + (p.y - d.y0) / s;
      S.seat[d.what] = d.what === 'top' ? clamp(off, -PITCH * 3, PITCH * 0.6) : clamp(off, -PITCH * 0.6, PITCH * 3);
      return;
    }
    if (d.what === 'tape' && S.tapeDrag) {
      const t = S.tapeDrag, now = performance.now(), dt = Math.max(8, now - t.lt);
      const vx = (p.x - t.lx) / dt;              // px per ms
      const target = clamp(vx * 0.4, -0.5, 0.5);
      t.ang += (target - t.ang) * 0.35;
      t.x = p.x; t.y = p.y; t.lx = p.x; t.lt = now;
      return;
    }
    if (d.what === 'handle' && S.handleDrag) {
      S.handle = clamp(S.handleDrag.h0 + (p.y - S.handleDrag.y0) / 120, 0, 1);
      if (S.handle >= 0.97) { S.drag = null; pressDone(); }
    }
  }
  function onUp(e) {
    if (closed) return;
    const p = pos(e); const d = S.drag; S.drag = null;
    if (!d) return;
    if (d.what === 'strip' && !d.moved) {
      if (S.lock) return;
      const x0 = stripX(), cw = FILM_W * s;
      if (p.x < x0 - 60 || p.x > x0 + cw + 60) return;
      const mm = yToMm(p.y);
      if (mm == null) { say('That’s the break itself. Cut on a frame line.', 'bad', 1400); return; }
      doCut(mm);
      return;
    }
    if (d.what === 'top' || d.what === 'bot') { release(d.what); return; }
    if (d.what === 'tape' && S.tapeDrag) { const t = S.tapeDrag; S.tapeDrag = null; dropTape(t); return; }
    if (d.what === 'handle') { S.handleDrag = null; if (S.handle < 0.97) say('All the way down.', '', 900); }
  }
  function onWheel(e) {
    if (!(S.phase === 'tail' || S.phase === 'head' || S.phase === 'cutA' || S.phase === 'cutB')) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    S.scroll += dy / s * 1.4; clampScroll();
  }
  function onKey(e) {
    if (closed) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); return; }
    if (S.phase === 'end' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); finish(false); return; }
    if ((e.key === 'f' || e.key === 'F') && S.phase === 'flip') { e.preventDefault(); e.stopPropagation(); doFlip(); return; }
    if (S.strip && (S.phase === 'tail' || S.phase === 'head' || S.phase === 'cutA' || S.phase === 'cutB')) {
      const step = { ArrowDown: PITCH / 2, ArrowUp: -PITCH / 2, PageDown: PITCH * 3, PageUp: -PITCH * 3 }[e.key];
      if (step) { e.preventDefault(); e.stopPropagation(); S.scroll += step; clampScroll(); }
    }
    e.stopPropagation();
  }

  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('pointerleave', () => { if (!S.drag) { S.hoverY = null; S.hoverX = null; } });
  cv.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey, true);
  xBtn.addEventListener('click', () => finish(true));

  function teardown() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf); clearTimeout(toastTimer);
    window.removeEventListener('keydown', onKey, true);
    if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
    R.remove();
    frameCache.clear();
    if (window.__spl && window.__spl._S === S) delete window.__spl;
  }

  // ---- dev/test hooks (headless verification)
  window.__spl = {
    _S: S,
    state: () => ({ phase: S.phase, k: S.k, total, cuts: S.cuts.map(c => c.u), seat: S.seat && { top: S.seat.top, bot: S.seat.bot, topOk: S.seat.topOk, botOk: S.seat.botOk }, tapes: S.tapes.length, splices: S.splices.slice(), mischief: S.mischiefUsed }),
    // page coordinates of useful targets for the current phase
    targets: () => {
      const r = cv.getBoundingClientRect(), x0 = stripX(), cw = FILM_W * s, jy = joinY();
      const o = { stripCenterX: r.left + x0 + cw / 2 };
      if (S.strip) {
        const st = S.strip, ph = S.phase;
        const ideal = ph === 'cutA' ? st.dmgFrom : ph === 'cutB' ? st.dmgTo : st.ideal;
        o.idealU = ideal;
        o.scrollTo = (u) => { S.scroll = u * PITCH; clampScroll(); return mmToY(u * PITCH) + r.top; };
        o.idealY = r.top + mmToY(ideal * PITCH);
      }
      if (S.seat) { o.topEndY = r.top + jy + S.seat.top * s; o.botStartY = r.top + jy + S.seat.bot * s; o.joinY = r.top + jy; o.pxPerMm = s; o.target = pieceGeom(); }
      const d = dispenserGeom(); o.dispenser = [r.left + d.x, r.top + d.y + d.r + 4];
      const h = handleGeom(); o.knob = [r.left + h.kx, r.top + h.ky];
      o.join = [r.left + x0 + cw / 2, r.top + jy]; o.edge = [r.left + x0 + 1.5 * s, r.top + jy - 4];
      return o;
    },
  };

  resize();
  startSplice();
  render();

  return { close: teardown };
}
