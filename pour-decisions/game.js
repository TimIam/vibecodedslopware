// Pour Decisions: the bar, the shift, and the people on the other side of it.
'use strict';

const $ = s => document.querySelector(s);
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const money = n => '$' + n.toFixed(2);
const oz = n => n.toFixed(2) + ' oz';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function toast(html, cls = '', ms = 2800) {
  const t = document.createElement('div');
  t.className = 't ' + cls; t.innerHTML = html;
  $('#toast').append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- Dates ----------
const TONIGHT = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const yearsAgo = n => { const x = new Date(TONIGHT); x.setFullYear(x.getFullYear() - n); return x; };
function ageOn(dob, ref = TONIGHT) {
  let a = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) a--;
  return a;
}
const fmtD = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
const longD = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const CUTOFF = yearsAgo(21);

// ---------- Audio ----------
const AU = { ctx: null, master: null, music: null, sfx: null, noise: null, muted: store.get('pd.muted', false) };
function audio() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return AU.ctx; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  const ctx = AU.ctx = new C();
  AU.master = ctx.createGain(); AU.master.gain.value = AU.muted ? 0 : .8; AU.master.connect(ctx.destination);
  AU.music = ctx.createGain(); AU.music.gain.value = .3; AU.music.connect(AU.master);
  AU.sfx = ctx.createGain(); AU.sfx.gain.value = .7; AU.sfx.connect(AU.master);
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  AU.noise = b;
  return ctx;
}
function tone(freq, t, dur, { type = 'sine', vol = .3, to, out, attack = .005, cutoff } = {}) {
  const ctx = AU.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  let node = o;
  if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); node = f; }
  node.connect(g); g.connect(out || AU.sfx);
  o.start(t); o.stop(t + dur + .05);
}
function noise(t, dur, { vol = .3, type = 'highpass', freq = 6000, q = 1, out } = {}) {
  const ctx = AU.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = AU.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out || AU.sfx);
  s.start(t, Math.random() * .5); s.stop(t + dur + .05);
}
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
function sfx(name) {
  if (!audio()) return;
  const t = AU.ctx.currentTime;
  switch (name) {
    case 'clink': [2600, 3300, 2900].forEach((f, i) => tone(f, t + i * .05, .12, { vol: .1 })); break;
    case 'dash': tone(700, t, .06, { vol: .1, type: 'triangle', to: 500 }); break;
    case 'shake': for (let i = 0; i < 8; i++) noise(t + i * .1, .07, { vol: .4, type: 'bandpass', freq: 2600 }); break;
    case 'stir': for (let i = 0; i < 5; i++) tone(3000 + i * 90, t + i * .14, .06, { vol: .05 }); break;
    case 'blend': tone(70, t, 1, { type: 'sawtooth', vol: .12, to: 95, cutoff: 600 }); noise(t, 1, { vol: .12, type: 'lowpass', freq: 900 }); break;
    case 'ding': tone(1319, t, .5, { vol: .18 }); tone(1760, t + .08, .7, { vol: .16 }); break;
    case 'buzz': tone(110, t, .35, { type: 'square', vol: .12, cutoff: 900 }); break;
    case 'bell': tone(988, t, .6, { vol: .13 }); tone(1319, t + .12, .8, { vol: .11 }); break;
    case 'pop': tone(500, t, .08, { to: 900, vol: .1, type: 'triangle' }); break;
    case 'garnish': tone(1200, t, .05, { vol: .06, type: 'triangle' }); break;
  }
}
let pourSrc = null;
function pourSound(on) {
  if (!audio()) return;
  const ctx = AU.ctx;
  if (on && !pourSrc) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = AU.noise; s.loop = true; f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = .9; g.gain.value = .16;
    s.connect(f); f.connect(g); g.connect(AU.sfx); s.start(); pourSrc = { s, g };
  } else if (!on && pourSrc) {
    pourSrc.g.gain.setTargetAtTime(0, ctx.currentTime, .03); pourSrc.s.stop(ctx.currentTime + .2); pourSrc = null;
  }
}

// ---------- Jukebox ----------
const SONG_LEN = 60;
const GENRES = {
  jazz: { name: 'Jazz', bpm: 132, swing: true, prog: [[50, 53, 57, 60], [43, 47, 50, 53], [48, 52, 55, 59], [45, 49, 52, 55]], scale: [74, 76, 77, 79, 81, 83, 84, 86] },
  rock: { name: 'Rock', bpm: 144, prog: [[45, 52], [41, 48], [48, 55], [43, 50]], scale: [69, 72, 74, 76, 79, 81] },
  disco: { name: 'Disco', bpm: 118, prog: [[45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53], [48, 52, 55, 59]], scale: [69, 72, 74, 76, 79, 81] },
  synth: { name: 'Synthwave', bpm: 100, prog: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]], scale: [69, 72, 76, 79, 81, 84] },
};
const HINT = {
  jazz: ['Got any jazz on that box?', 'This place needs a saxophone.', 'Put on something smoky. Jazz, maybe.'],
  rock: ['This bar needs some guitars.', 'Crank up some rock, would ya?', 'Where\'s the rock and roll?'],
  disco: ['Somebody put on something I can dance to!', 'Is it too much to ask for a little disco?', 'I need a groove. Disco, please!'],
  synth: ['Got anything spacey? Synthesizers?', 'I could go for some synthwave.', 'Put on something that sounds like outer space.'],
};
const MU = { next: 0, step: 0 };
function kick(t, out) { tone(150, t, .3, { to: 40, vol: .7, out }); }
function snare(t, out, len = .16) { noise(t, len, { vol: .28, type: 'bandpass', freq: 1800, out }); tone(190, t, .07, { vol: .12, type: 'triangle', out }); }
function hat(t, out, len = .04, vol = .08) { noise(t, len, { vol, freq: 8000, out }); }
function musicStep(g, d, s, t, sd) {
  const out = AU.music, bar = Math.floor(s / 16), i = s % 16, ch = d.prog[bar % 4];
  if (g === 'jazz') {
    if (i % 8 === 0 || i % 8 === 6) hat(t, out, .3, .05);
    if (i === 4 || i === 12) hat(t, out, .05, .1);
    if (i % 4 === 0) { const walk = [ch[0], ch[1], ch[2], ch[3] + (bar % 2 ? 1 : -1)][i / 4]; tone(midi(walk - 12), t, sd * 3.6, { type: 'triangle', vol: .35, out, cutoff: 800 }); }
    if (i === 6 || (i === 12 && bar % 2)) ch.forEach(n => tone(midi(n + 12), t, sd * 3, { type: 'triangle', vol: .045, out, cutoff: 2200 }));
    if (i % 2 === 0 && Math.random() < .42) tone(midi(pick(d.scale) - 12), t, sd * 1.8, { type: 'sine', vol: .09, out });
  } else if (g === 'rock') {
    if (i === 0 || i === 8 || i === 10) kick(t, out);
    if (i === 4 || i === 12) snare(t, out);
    if (i % 2 === 0) { hat(t, out); tone(midi(ch[0] - 12), t, sd * 1.8, { type: 'sawtooth', vol: .16, out, cutoff: 500 }); ch.forEach(n => tone(midi(n), t, sd * 1.6, { type: 'square', vol: .04, out, cutoff: 1500 })); }
    if (i % 4 === 0 && bar % 4 >= 2 && Math.random() < .7) tone(midi(pick(d.scale)), t, sd * 3.5, { type: 'square', vol: .045, out, cutoff: 2500 });
  } else if (g === 'disco') {
    if (i % 4 === 0) kick(t, out);
    if (i === 4 || i === 12) snare(t, out, .12);
    if (i % 4 === 2) hat(t, out, .2, .09);
    if (i % 2 === 0) tone(midi(ch[0] - 12 + (i % 4 ? 12 : 0)), t, sd * 1.6, { type: 'sawtooth', vol: .15, out, cutoff: 900 });
    if (i === 0) ch.forEach(n => tone(midi(n + 12), t, sd * 15, { type: 'sawtooth', vol: .018, out, cutoff: 1800, attack: .25 }));
    if (i === 6 || i === 14) ch.forEach(n => tone(midi(n + 12), t, sd * .8, { type: 'square', vol: .03, out, cutoff: 2500 }));
    if (i % 4 === 0 && Math.random() < .35) tone(midi(pick(d.scale) + 12), t, sd * 2, { type: 'triangle', vol: .05, out });
  } else {
    if (i === 0 || i === 8) kick(t, out);
    if (i === 4 || i === 12) snare(t, out, .3);
    const n = ch[s % ch.length] + 12 + (s % 8 >= 4 ? 12 : 0);
    tone(midi(n), t, sd * .9, { type: 'sawtooth', vol: .05, out, cutoff: 1300 + 700 * Math.sin(s / 10) });
    if (i % 2 === 0) tone(midi(ch[0] - 12), t, sd * 1.8, { type: 'sawtooth', vol: .13, out, cutoff: 420 });
    if (i === 0) ch.forEach(n => tone(midi(n + 12), t, sd * 15, { type: 'triangle', vol: .04, out, attack: .4 }));
  }
}
setInterval(() => {
  if (!AU.ctx || !G.genre || G.musicLeft <= 0 || G.paused) return;
  const ctx = AU.ctx, d = GENRES[G.genre], sd = 60 / d.bpm / 4;
  if (MU.next < ctx.currentTime - .2) MU.next = ctx.currentTime + .03;
  while (MU.next < ctx.currentTime + .15) {
    const t = MU.next + (d.swing && MU.step % 4 === 2 ? sd * .35 : 0);
    musicStep(G.genre, d, MU.step, t, sd);
    MU.step++; MU.next += sd;
  }
}, 30);
function playGenre(g) {
  audio();
  G.genre = g; G.musicLeft = SONG_LEN; MU.step = 0; MU.next = 0;
  $('#ovJuke').classList.add('hidden');
  const c = G.cust;
  if (c && c.phase !== 'leaving' && c.p.genre === g && !c.lovedSong) {
    c.lovedSong = true; c.mood = clamp(c.mood + 12, 0, 100); flashExpr(c, 'happy');
    say(`${slur('Ooh, I love this one!', c)}`, true);
  }
}

// ---------- Art for the back bar ----------
const LABELS = ['#f6efd8', '#ffe08a', '#c9e6ff', '#ffd1dc', '#d8f5c8', '#f2d0a8', '#e6d3ff'];
function labelColor(k) { let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return LABELS[h % LABELS.length]; }
function bottleSVG(it) {
  const c = it.color, S = `stroke="${INK}" stroke-width="2.5"`, lab = labelColor(it.key);
  const tag = (y, h = 14) => `<rect x="11" y="${y}" width="18" height="${h}" rx="1.5" fill="${lab}" stroke="${INK}" stroke-width="1.5"/><text x="20" y="${y + h / 2 + 3}" text-anchor="middle" font-size="7.5" font-weight="700" font-family="Fredoka,sans-serif" fill="${INK}">${esc(it.name.replace(/^Crème de /, '').slice(0, 3).toUpperCase())}</text>`;
  const shine = '<path d="M14,30 L14,62" stroke="#fff" stroke-width="2" opacity=".45"/>';
  let s;
  switch (it.shape) {
    case 'square': s = `<rect x="16" y="4" width="8" height="16" rx="2" fill="#333" ${S}/><rect x="8" y="20" width="24" height="50" rx="3" fill="${c}" ${S}/>${tag(38, 16)}${shine}`; break;
    case 'round': s = `<rect x="16" y="2" width="8" height="22" rx="2" fill="#333" ${S}/><path d="M20,24 C2,30 4,70 12,70 L28,70 C36,70 38,30 20,24 Z" fill="${c}" ${S}/>${tag(42)}`; break;
    case 'wine': s = `<rect x="17" y="2" width="6" height="22" fill="#d9b84a" ${S}/><path d="M17,24 C10,30 10,30 10,40 L10,68 Q10,70 12,70 L28,70 Q30,70 30,68 L30,40 C30,30 30,30 23,24 Z" fill="#244a2a" ${S}/><rect x="11.5" y="44" width="17" height="16" fill="${c}" opacity=".9"/>${tag(44, 16)}`; break;
    case 'soda': s = `<rect x="17" y="2" width="6" height="6" fill="#c0283a" ${S}/><path d="M17,8 L23,8 L25,20 C30,24 30,30 28,36 C30,44 30,60 28,70 L12,70 C10,60 10,44 12,36 C10,30 10,24 15,20 Z" fill="${c}" ${S}/>${tag(46)}`; break;
    case 'carton': s = `<path d="M8,22 L20,8 L32,22 Z" fill="#fff" ${S}/><rect x="8" y="22" width="24" height="48" fill="#fff" ${S}/><rect x="8" y="34" width="24" height="24" fill="${c}"/><rect x="8" y="22" width="24" height="48" fill="none" ${S}/>${tag(38, 14)}`; break;
    case 'squeeze': s = `<path d="M17,2 L23,2 L22,14 L18,14 Z" fill="#fff" ${S}/><rect x="13" y="14" width="14" height="6" fill="#ddd" ${S}/><rect x="9" y="20" width="22" height="50" rx="7" fill="${c}" ${S}/>${tag(38)}`; break;
    case 'pot': s = `<path d="M8,26 L32,26 L30,70 L10,70 Z" fill="${c}" ${S}/><path d="M6,24 L34,24 L30,16 L10,16 Z" fill="#333" ${S}/><path d="M32,34 C40,36 40,56 31,58" fill="none" stroke="${INK}" stroke-width="4"/>${tag(40)}`; break;
    case 'dash': s = `<rect x="16" y="8" width="8" height="12" rx="2" fill="#f2c230" ${S}/><path d="M14,22 L26,22 L28,30 L28,68 L12,68 L12,30 Z" fill="${c}" ${S}/><rect x="12" y="34" width="16" height="26" fill="${lab}" stroke="${INK}" stroke-width="1.5"/>`; break;
    default: s = `<rect x="16" y="2" width="8" height="18" rx="2" fill="#2a2a2a" ${S}/><path d="M10,26 Q10,18 17,18 L23,18 Q30,18 30,26 L30,68 Q30,70 28,70 L12,70 Q10,70 10,68 Z" fill="${c}" ${S}/>${tag(38, 16)}${shine}`;
  }
  return `<svg viewBox="0 0 40 72">${s}</svg>`;
}
function garnishSVG(k) {
  const S = `stroke="${INK}" stroke-width="2"`;
  const wedge = (c, l) => `<path d="M3,20 A12,12 0 0 1 27,20 Z" fill="${c}" ${S}/><path d="M7,19 A8,8 0 0 1 23,19 Z" fill="${l}"/><path d="M15,19 L15,11 M15,19 L9,14 M15,19 L21,14" stroke="${c}" stroke-width="1.5"/>`;
  const g = {
    lime: wedge('#5aa52e', '#c8ec8a'), lemon: wedge('#e8c21c', '#fff3a0'), orange: wedge('#ef8a1c', '#ffd08a'),
    cherry: `<path d="M15,16 C15,8 20,4 24,2" fill="none" stroke="#3a6a1a" stroke-width="2.2"/><circle cx="14" cy="19" r="7" fill="#c41230" ${S}/><circle cx="11.5" cy="16.5" r="2" fill="#fff" opacity=".7"/>`,
    olive: `<path d="M4,6 L26,22" stroke="#bfa070" stroke-width="2"/><ellipse cx="15" cy="15" rx="9" ry="7" fill="#7f9b2c" ${S}/><circle cx="12" cy="14" r="3" fill="#d23a2a"/>`,
    onion: `<path d="M4,6 L26,22" stroke="#bfa070" stroke-width="2"/><circle cx="15" cy="15" r="7.5" fill="#f6f2e2" ${S}/><path d="M11,12 Q15,18 19,12" stroke="#c9c0a0" fill="none"/>`,
    mint: `<path d="M15,24 C4,22 4,10 13,6 C15,14 16,18 15,24 Z" fill="#3fae4a" ${S}/><path d="M15,24 C26,22 26,10 17,6 C15,14 14,18 15,24 Z" fill="#5ccc5a" ${S}/>`,
    celery: `<rect x="12" y="8" width="7" height="18" rx="3" fill="#9cd06a" ${S}/><path d="M15,9 C10,2 6,6 8,8 M15,9 C18,1 24,4 22,8" stroke="#3fae4a" stroke-width="3" fill="none"/>`,
    pineapple: `<path d="M4,24 L26,24 L15,10 Z" fill="#f5d033" ${S}/><path d="M15,10 L10,2 M15,10 L15,1 M15,10 L20,2" stroke="#3a8a2a" stroke-width="2.5"/>`,
    nutmeg: `<circle cx="9" cy="16" r="2" fill="#7a4a22"/><circle cx="15" cy="12" r="2.4" fill="#8a5a2a"/><circle cx="20" cy="18" r="2" fill="#6a3a18"/><circle cx="14" cy="20" r="1.6" fill="#7a4a22"/><circle cx="22" cy="10" r="1.4" fill="#8a5a2a"/>`,
    beans: [8, 15, 22].map((x, i) => `<ellipse cx="${x}" cy="${14 + (i % 2) * 4}" rx="3.6" ry="5" fill="#4a2a12" ${S.replace('2"', '1.5"')}/><path d="M${x},${10 + (i % 2) * 4} L${x},${18 + (i % 2) * 4}" stroke="#a87a4a"/>`).join(''),
    saltrim: `<path d="M3,10 L27,10 L24,26 L6,26 Z" fill="none" ${S}/><path d="M3,10 L27,10" stroke="#fff" stroke-width="4" stroke-dasharray="2 2"/>`,
    sugarrim: `<path d="M3,10 L27,10 L24,26 L6,26 Z" fill="none" ${S}/><path d="M3,10 L27,10" stroke="#ffe7f3" stroke-width="4" stroke-dasharray="2 1"/><path d="M22,2 L23,6 L27,7 L23,8 L22,12 L21,8 L17,7 L21,6 Z" fill="#fff6a8" stroke="${INK}" stroke-width="1"/>`,
  };
  return `<svg viewBox="0 0 30 28">${g[k]}</svg>`;
}

const RIM = { rocks: [20, 100, 70], highball: [30, 90, 28], collins: [37, 83, 10], martini: [10, 110, 32], coupe: [12, 108, 40], shot: [40, 80, 100], hurricane: [38, 82, 18], mug: [26, 88, 42], wine: [28, 92, 22], flute: [46, 74, 10], margarita: [8, 112, 34], irish: [34, 86, 30] };
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mixColor(items) {
  let r = 0, g = 0, b = 0, w = 0;
  for (const it of items) { const wt = ING[it.k].kind === 'dash' ? it.a * .05 : it.a; const [R, Gg, B] = hexRgb(ING[it.k].color); r += R * wt; g += Gg * wt; b += B * wt; w += wt; }
  if (!w) return '#ddd';
  return `rgb(${r / w | 0},${g / w | 0},${b / w | 0})`;
}
const volume = items => items.reduce((a, i) => a + (ING[i.k].kind === 'dash' ? 0 : i.a), 0);
let clipN = 0;
function glassSVG(type, gl) {
  const D = GLASSES[type], id = 'gc' + (++clipN), [x1, x2, ry] = RIM[type];
  let s = `<defs><clipPath id="${id}"><path d="${D.inside}"/></clipPath></defs>`;
  s += `<path d="${D.inside}" fill="rgba(200,230,255,.16)"/>`;
  if (gl && (gl.items.length || gl.ice)) {
    const h = D.bot - D.top, vol = volume(gl.items), level = D.bot - h * Math.min(1, vol / D.cap);
    s += `<g clip-path="url(#${id})">`;
    if (gl.method && gl.method !== 'build') {
      s += `<rect x="0" y="${level}" width="120" height="${D.bot - level + 2}" fill="${mixColor(gl.items)}"/>`;
      if (vol && (gl.method === 'shake' || gl.method === 'blend')) s += `<rect x="0" y="${level}" width="120" height="5" fill="#fff" opacity=".55"/>`;
    } else {
      let y = D.bot;
      for (const it of gl.items) {
        if (ING[it.k].kind === 'dash') continue;
        const hh = h * it.a / D.cap; y -= hh;
        s += `<rect x="0" y="${y}" width="120" height="${hh + .6}" fill="${ING[it.k].color}"/>`;
      }
    }
    if (gl.ice) for (let i = 0; i < 4; i++) {
      const cx = x1 + 12 + i * (x2 - x1 - 34) / 3, cy = D.bot - 20 - (i % 2) * 15;
      s += `<rect x="${cx}" y="${cy}" width="17" height="17" rx="3" transform="rotate(${i * 17 - 20} ${cx + 8} ${cy + 8})" fill="#fff" fill-opacity=".55" stroke="#9ccbe8" stroke-width="1.5"/>`;
    }
    s += '</g>';
    if (D.copper) s += `<path d="${D.inside}" fill="#c8743a"/><ellipse cx="57" cy="${Math.max(level, D.top + 4)}" rx="30" ry="4" fill="${vol ? mixColor(gl.items) : 'none'}"/>`;
  } else if (D.copper) s += `<path d="${D.inside}" fill="#c8743a"/>`;
  s += `<path d="${D.inside}" fill="none" stroke="${INK}" stroke-width="3.5"/>`;
  s += `<path d="M${x1 + 7},${ry + 6} L${x1 + 9},${ry + 40}" stroke="#fff" stroke-width="3" opacity=".55" stroke-linecap="round"/>`;
  if (D.extra) s += `<path d="${D.extra}" fill="${D.copper ? '#a85a28' : 'rgba(210,235,255,.45)'}" stroke="${INK}" stroke-width="3"/>`;
  if (D.handle) s += `<path d="${D.handle}" fill="none" stroke="${INK}" stroke-width="7"/><path d="${D.handle}" fill="none" stroke="${D.copper ? '#c8743a' : '#e6f2fa'}" stroke-width="3"/>`;
  if (gl) {
    if (gl.garn.has('saltrim')) s += `<path d="M${x1},${ry} L${x2},${ry}" stroke="#fff" stroke-width="5" stroke-dasharray="2 2"/>`;
    if (gl.garn.has('sugarrim')) s += `<path d="M${x1},${ry} L${x2},${ry}" stroke="#ffe0f0" stroke-width="5" stroke-dasharray="3 1"/>`;
    let n = 0;
    for (const k of gl.garn) {
      if (k === 'saltrim' || k === 'sugarrim') continue;
      const gx = x2 - 14 - n * 18, gy = ry - 20; n++;
      s += `<g transform="translate(${gx} ${gy}) scale(.9)">${garnishSVG(k).replace(/<\/?svg[^>]*>/g, '')}</g>`;
    }
  }
  return s;
}

// ---------- State ----------
const G = {
  night: 1, tips: 0, strikes: 0, running: false, paused: true,
  genre: null, musicLeft: 0, cust: null, queue: [], total: 0, done: 0,
  glass: null, pour: null, stats: null, best: store.get('pd.best', 0),
};
const RATE = 1; // ounces per second of free pour
function newStats() { return { tips: 0, served: 0, perfect: 0, caught: 0, walkouts: 0, peeks: 0 }; }

// ---------- Build the bar ----------
function buildBar() {
  const rack = $('#rack');
  for (const [k, D] of Object.entries(GLASSES)) {
    const b = document.createElement('button');
    b.className = 'gl'; b.dataset.g = k; b.title = D.name;
    b.innerHTML = `<svg viewBox="0 0 120 170">${glassSVG(k)}</svg>${D.name}`;
    b.onclick = () => takeGlass(k);
    rack.append(b);
  }
  for (const it of Object.values(ING)) {
    const shelf = $('#sh-' + (it.kind === 'wine' ? 'spirit' : it.kind));
    const b = document.createElement('button');
    b.className = 'btl' + (it.kind === 'dash' ? ' dash' : ''); b.dataset.k = it.key; b.title = it.name;
    b.innerHTML = bottleSVG(it) + `<span>${esc(it.name)}</span>`;
    b.addEventListener('pointerdown', e => startPour(e, it.key, b));
    b.addEventListener('contextmenu', e => e.preventDefault());
    shelf.append(b);
  }
  const tray = $('#tray');
  for (const [k, name] of Object.entries(GARNISH)) {
    const b = document.createElement('button');
    b.className = 'gar'; b.dataset.k = k;
    b.innerHTML = garnishSVG(k) + esc(name);
    b.onclick = () => toggleGarnish(k);
    tray.append(b);
  }
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => setMethod(b.dataset.m));
  $('#bIce').onclick = toggleIce;
  $('#bDump').onclick = () => { if (G.glass) { G.glass = null; sfx('pop'); renderGlass(); } };
  $('#bServe').onclick = serve;
}

// ---------- The glass ----------
function takeGlass(type) {
  audio();
  if (G.glass && (G.glass.items.length || G.glass.ice)) { toast('Dump what you have first.'); sfx('buzz'); return; }
  G.glass = { type, items: [], ice: false, garn: new Set(), method: null };
  sfx('clink'); renderGlass();
}
function needGlass() { if (G.glass) return true; toast('Grab a glass from the rack first.'); sfx('buzz'); return false; }
function addIng(k, a) {
  const gl = G.glass, have = gl.items.find(i => i.k === k);
  if (have) have.a += a; else gl.items.push({ k, a });
  if (gl.method && gl.method !== 'build') gl.method = null; // new liquid after mixing needs mixing again
  const D = GLASSES[gl.type];
  if (volume(gl.items) > D.cap + .01) {
    const over = volume(gl.items) - D.cap;
    const last = gl.items.find(i => i.k === k); last.a = Math.max(0, last.a - over);
    if (!last.a) gl.items.splice(gl.items.indexOf(last), 1);
    toast(`Whoa, it's overflowing! A ${D.name.toLowerCase()} holds ${D.cap} oz.`, 'bad');
  }
}
function toggleIce() {
  audio();
  if (!needGlass()) return;
  G.glass.ice = !G.glass.ice; sfx('clink'); renderGlass();
}
function toggleGarnish(k) {
  audio();
  if (!needGlass()) return;
  const s = G.glass.garn;
  s.has(k) ? s.delete(k) : s.add(k);
  sfx('garnish'); renderGlass();
}
function setMethod(m) {
  audio();
  if (!needGlass()) return;
  G.glass.method = m;
  if (m !== 'build') {
    sfx(m);
    const st = $('#station'); st.classList.remove('shaking'); void st.offsetWidth; st.classList.add('shaking');
  } else sfx('pop');
  renderGlass();
}

function startPour(e, k, btn) {
  e.preventDefault();
  audio();
  if (!needGlass() || G.pour) return;
  const it = ING[k];
  if (it.kind === 'dash') { addIng(k, 1); sfx('dash'); renderGlass(); return; }
  btn.setPointerCapture?.(e.pointerId);
  G.pour = { k, t0: performance.now(), btn };
  btn.classList.add('pouring');
  const pb = $('#pourBottle'); pb.innerHTML = bottleSVG(it).replace(/<\/?svg[^>]*>/g, ''); pb.classList.add('on');
  $('#pourRead').classList.add('on');
  pourSound(true);
  const end = () => { btn.removeEventListener('pointerup', end); btn.removeEventListener('pointercancel', end); btn.removeEventListener('lostpointercapture', end); endPour(); };
  btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end); btn.addEventListener('lostpointercapture', end);
}
const pourAmount = () => Math.max(.25, Math.round((performance.now() - G.pour.t0) / 1000 * RATE * 4) / 4);
function endPour() {
  if (!G.pour) return;
  const { k, btn } = G.pour, a = pourAmount();
  G.pour = null;
  btn.classList.remove('pouring');
  $('#pourBottle').classList.remove('on'); $('#pourRead').classList.remove('on');
  pourSound(false);
  if (G.glass) { addIng(k, a); renderGlass(); }
}

function renderGlass() {
  const gl = G.glass;
  let view = gl;
  if (gl && G.pour) { // show the pour in progress without committing it
    view = { ...gl, items: gl.items.map(i => ({ ...i })) };
    const h = view.items.find(i => i.k === G.pour.k), a = pourAmount();
    if (h) h.a += a; else view.items.push({ k: G.pour.k, a });
  }
  $('#glassView').innerHTML = gl ? glassSVG(gl.type, view) : '';
  $('#emptyNote').style.display = gl ? 'none' : '';
  $('#tGlass').textContent = gl ? GLASSES[gl.type].name + ' glass' : 'No glass';
  document.querySelectorAll('.gl').forEach(b => b.classList.toggle('on', !!gl && b.dataset.g === gl.type));
  document.querySelectorAll('.gar').forEach(b => b.classList.toggle('on', !!gl && gl.garn.has(b.dataset.k)));
  document.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', !!gl && (gl.method || 'build') === b.dataset.m && (gl.method !== null || b.dataset.m === 'build')));
  $('#bIce').classList.toggle('on', !!gl && gl.ice);
  let h = '';
  if (gl) {
    for (const it of gl.items) h += `<div class="line"><span>${esc(ING[it.k].name)}</span><b>${ING[it.k].kind === 'dash' ? it.a + (it.a === 1 ? ' dash' : ' dashes') : oz(it.a)}</b></div>`;
    const extra = [gl.ice ? 'Ice' : 'No ice', METHODS[gl.method || 'build'] + (gl.method ? '' : ' (default)')].concat([...gl.garn].map(k => GARNISH[k]));
    h += `<div style="margin-top:4px;color:#6b5a40;font-size:13px">${extra.map(esc).join(' · ')}</div>`;
  } else h = '<div style="color:#8a7a5a">Pick a glass from the rack, then press and hold bottles to pour.</div>';
  $('#contents').innerHTML = h;
}
function updatePourRead() {
  if (!G.pour) return;
  const it = ING[G.pour.k];
  $('#pourRead').textContent = `${it.name}: ${oz(pourAmount())}`;
  renderGlass();
}

// ---------- Scoring ----------
function evaluate(gl, r) {
  let score = 100; const notes = [];
  if (gl.type !== r.glass) { score -= 20; notes.push(`Wrong glass: should be a ${GLASSES[r.glass].name.toLowerCase()}`); }
  const m = gl.method || 'build';
  if (m !== r.method) { score -= 10; notes.push(`Method: should be ${METHODS[r.method].toLowerCase()}, not ${METHODS[m].toLowerCase()}`); }
  if (gl.ice !== r.ice) { score -= 8; notes.push(r.ice ? 'Needed ice in the glass' : 'Should be served without ice'); }
  for (const want of r.ings) {
    const have = gl.items.find(i => i.k === want.k), name = ING[want.k].name;
    if (!have) { score -= 15; notes.push(`Missing ${name}`); continue; }
    const diff = Math.abs(have.a - want.a);
    if (ING[want.k].kind === 'dash') { if (diff > 1) { score -= 5; notes.push(`${name}: ${have.a} dashes (wants ${want.a})`); } continue; }
    if (diff <= .13) continue;
    score -= diff <= .5 ? 5 : 12;
    notes.push(`${name}: ${oz(have.a)} (wants ${oz(want.a)})`);
  }
  for (const have of gl.items) if (!r.ings.some(w => w.k === have.k)) { score -= 12; notes.push(`Doesn't have ${ING[have.k].name}`); }
  for (const g of r.garnish) if (!gl.garn.has(g)) { score -= 5; notes.push(`Forgot the ${GARNISH[g].toLowerCase()}`); }
  for (const g of gl.garn) if (!r.garnish.includes(g)) { score -= 3; notes.push(`No ${GARNISH[g].toLowerCase()} on this one`); }
  return { q: clamp(score, 0, 100) / 100, notes };
}

// ---------- Customers ----------
const STREETS = ['Ludlow St', 'Orchard St', 'Rivington St', 'Delancey St', 'Bedford Ave', 'Atlantic Ave', 'Grand St', 'Myrtle Ave', 'Court St', 'Ditmars Blvd'];
function dobForAge(age) { return addDays(yearsAgo(age), -randInt(1, 360)); }
function makeId(p, kind) {
  const st = STATES[p.state];
  const id = {
    first: p.first, last: p.last, look: p.look, state: p.state, header: st.name, holo: true,
    dob: dobForAge(p.age), exp: addDays(TONIGHT, randInt(40, 1600)),
    num: String(randInt(100, 999)) + ' ' + String(randInt(100, 999)) + ' ' + String(randInt(100, 999)),
    addr: p.state === 'ORBIT' ? 'Module 3, Station Alpha' : `${randInt(12, 990)} ${pick(STREETS)}`,
    city: pick(st.city), height: p.look.bear ? '7-02' : `${randInt(5, 6)}-${String(randInt(0, 11)).padStart(2, '0')}`,
  };
  if (p.almost) id.dob = addDays(yearsAgo(21), randInt(1, 6));
  if (kind === 'expired') id.exp = addDays(TONIGHT, -randInt(3, 320));
  if (kind === 'borrowed') { id.first = p.alias.first; id.look = p.alias.look; id.dob = dobForAge(p.alias.age); }
  if (kind === 'fake') { id.dob = dobForAge(randInt(21, 24)); if (Math.random() < .5) id.header = TYPOS[p.state]; else id.holo = false; }
  return id;
}
function idCaseFor(p) {
  if (p.fakeOnly) return 'fake';
  if (p.underage) return Math.random() < .5 ? 'underage' : 'borrowed';
  const r = Math.random();
  if (r < (p.look.bear ? .15 : .09)) return 'expired';
  if (r < .13) return 'fake';
  return 'valid';
}
function makeVisit(p) {
  const kind = idCaseFor(p);
  const pre = Math.random() < .15 ? rand(.65, 1.05) : rand(0, .3);
  return {
    p, idCase: kind, id: makeId(p, kind), idChecked: false, idAccepted: false,
    mood: rand(52, 66), bac: p.tol * pre, drinks: 0, maxDrinks: 1 + (Math.random() < .6) + (Math.random() < .3),
    order: null, patience: 0, patienceMax: 1, peeked: false, chatted: false, charmed: false, phase: 'arriving',
    expr: null, exprUntil: 0, lovedSong: false,
  };
}
const stage = c => { const l = c.bac / c.p.tol; return l < .35 ? 0 : l < .7 ? 1 : l < 1 ? 2 : 3; };
function slur(t, c) {
  const s = stage(c);
  if (s < 2) return t;
  t = t.replace(/s(?=[a-z ])/g, 'sh');
  if (s >= 3) t = t.replace(/([aeiou])/g, m => Math.random() < .18 ? m + m + m : m) + ' *hic*';
  return t;
}
function pickDrink(c) {
  const cap = G.night === 1 ? 4 : G.night === 2 ? 6 : 99;
  const favs = c.p.favs.map(n => RECIPE[n]).filter(r => difficulty(r) <= cap || G.night > 2);
  let r;
  do {
    r = favs.length && Math.random() < .55 ? pick(favs) : pick(RECIPES.filter(r => difficulty(r) <= cap && (c.p.underage || !r.name.startsWith('Virgin'))));
  } while (c.order && r.name === c.order.name);
  return r;
}
const ORDER_LINES = ['I\'ll have a {d}.', 'Can I get a {d}?', '{d}, please.', 'Make me a {d}.', 'One {d}. Don\'t skimp.', 'What I need is a {d}.'];
function newOrder(c, again) {
  c.order = pickDrink(c);
  const r = c.order;
  c.patienceMax = (32 + 7 * r.ings.length + 3 * r.garnish.length + (r.method !== 'build' ? 4 : 0)) * Math.max(.65, 1 - .06 * (G.night - 1));
  c.patience = c.patienceMax; c.peeked = false; c.chatted = false; c.charmed = false; c.phase = 'waiting';
  let line = pick(ORDER_LINES).replace('{d}', `<span class="order">${esc(r.name)}</span>`);
  if (c.p.look.bear) line += Math.random() < .5 ? ' Hold the gravity.' : '';
  if (again) line = pick(['Another round!', 'Hit me again.', 'Okay, one more.', 'Keep \'em coming!']) + ' ' + line;
  say(slur(again ? line : `${esc(pick(c.p.hi))} I'm ${esc(c.p.first)}. ${line}`, c));
  if (!again) {
    if (!G.genre || G.musicLeft <= 0) say(`<br><small><i>${slur("It's dead quiet in here.", c)}</i></small>`, true);
    else if (G.genre !== c.p.genre && Math.random() < .7) say(`<br><small><i>${esc(slur(pick(HINT[c.p.genre]), c))}</i></small>`, true);
  }
  renderCustomer();
}

function say(html, append) {
  const b = $('#bubble');
  b.classList.remove('hidden');
  b.innerHTML = append ? b.innerHTML + ' ' + html : html;
}
function flashExpr(c, e, ms = 1800) { c.expr = e; c.exprUntil = performance.now() + ms; renderCustomer(); }
let lastFace = '';
function renderCustomer() {
  const c = G.cust;
  if (!c) { $('#cust').innerHTML = ''; lastFace = ''; return; }
  const st = stage(c);
  const mood = c.exprUntil > performance.now() ? c.expr : c.mood > 68 ? 'happy' : c.mood < 30 ? 'angry' : 'neutral';
  const key = mood + st;
  if (key !== lastFace) {
    lastFace = key;
    $('#cust').innerHTML = face(c.p.look, { mood, drunk: st }) + (st >= 3 ? '<div class="hic">hic!</div>' : '');
    $('#cust').className = st >= 3 ? 'sway2' : st === 2 ? 'sway1' : '';
  }
  $('#mName').textContent = `${c.p.first}${c.p.look.bear ? ' 🐻🚀' : ''}`;
}

function arrive() {
  if (!G.running) return;
  if (!G.queue.length) { endNight(); return; }
  const c = G.cust = makeVisit(G.queue.shift());
  lastFace = '';
  renderCustomer();
  $('#custWrap').className = '';
  sfx('bell');
  setTimeout(() => { if (G.cust === c) newOrder(c); }, 500);
  renderQueue();
}
function leave(c, happy) {
  if (c.phase === 'leaving') return;
  c.phase = 'leaving';
  if (!happy) flashExpr(c, 'angry', 3000);
  setTimeout(() => {
    const w = $('#custWrap');
    w.className = 'leave';
    setTimeout(() => {
      w.style.transition = 'none'; w.className = 'out'; void w.offsetWidth; w.style.transition = '';
      if (G.cust === c) G.cust = null;
      $('#bubble').classList.add('hidden');
      renderCustomer();
      G.done++;
      setTimeout(arrive, 900);
    }, 650);
  }, 1300);
}

// ---------- Actions ----------
function strike(msg) {
  G.strikes++;
  sfx('buzz');
  toast(`⚠️ <b>Strike ${G.strikes}!</b> ${msg}`, 'bad', 4200);
  if (G.strikes >= 3) { fired(`Three strikes. ${msg}`); return true; }
  return false;
}
function canAct() { const c = G.cust; return c && c.phase === 'waiting'; }

function idCardHTML(id) {
  const st = STATES[id.state];
  return `<div class="idcard">
    <div class="idhead" style="background:${st.color}">${esc(id.header)}<small>${esc(st.tag)}</small></div>
    <div class="idbody">
      <div class="idphoto">${face(id.look, { mood: 'neutral' })}</div>
      <div class="idf">
        <div class="k">ID NO.</div><div class="v">${id.num}</div>
        <div class="k">NAME</div><div class="v">${esc(id.last.toUpperCase())}, ${esc(id.first.toUpperCase())}</div>
        <div class="k">DATE OF BIRTH</div><div class="v dob">${fmtD(id.dob)}</div>
        <div class="k">EXPIRES</div><div class="v">${fmtD(id.exp)}</div>
        <div class="k">ADDRESS</div><div style="font-weight:600">${esc(id.addr)}<br>${esc(id.city)}</div>
        <div class="k">HEIGHT ${id.height}</div>
        <div class="sig">${esc(id.first)} ${esc(id.last)}</div>
      </div>
    </div>
    ${id.holo ? '<div class="holo">★</div>' : ''}
  </div>`;
}
function checkId() {
  if (!canAct()) return;
  const c = G.cust;
  c.idChecked = true;
  $('#idCard').innerHTML = idCardHTML(c.id);
  $('#idTonight').innerHTML = `Tonight is <b>${longD(TONIGHT)}</b>. 21+ means born on or before <b>${fmtD(CUTOFF)}</b>.<br>They said their name is <b>${esc(c.p.first)}</b>.`;
  $('#ovId').classList.remove('hidden');
}
function acceptId() {
  $('#ovId').classList.add('hidden');
  const c = G.cust; if (!c) return;
  c.idAccepted = true; sfx('pop');
}
function refuse() {
  $('#ovId').classList.add('hidden');
  if (!canAct()) return;
  const c = G.cust;
  if (stage(c) >= 3 && c.idCase === 'valid') { cutOff(); return; }
  if (c.idCase === 'valid') {
    toast(`${esc(c.p.first)}'s ID was legit. They storm out.`, 'bad');
    say(slur('Are you kidding me? I\'m ' + c.p.age + '!', c)); sfx('buzz');
    leave(c, false); return;
  }
  G.stats.caught++;
  const why = {
    underage: `${esc(c.p.first)} is only ${ageOn(c.id.dob)}.`,
    borrowed: `That was ${esc(c.id.first)}'s ID, not ${esc(c.p.first)}'s.`,
    expired: `That ID expired on ${fmtD(c.id.exp)}.`,
    fake: c.id.holo ? `"${esc(c.id.header)}"? That's a fake.` : 'No hologram. That\'s a fake.',
  }[c.idCase];
  toast(`👮 Good catch! ${why}`, 'good', 3600); sfx('ding');
  say(slur(pick(['Ugh. Fine.', 'Worth a shot.', 'This bar sucks anyway.', 'You can\'t prove anything!']), c));
  leave(c, false);
}
function cutOff() {
  if (!canAct()) return;
  const c = G.cust, st = stage(c);
  if (st >= 3) {
    toast(`💧 Smart move. ${esc(c.p.first)} gets a water and a cab.`, 'good');
    say(slur(pick(['Yeah... yeah, okay. You\'re right.', 'Wassser. Fine. You\'re a good friend.', 'I love you, man.']), c));
    G.tips += .5; G.stats.tips += .5;
    leave(c, true);
  } else {
    toast(st === 2 ? `${esc(c.p.first)} was tipsy, not drunk. They leave in a huff.` : `${esc(c.p.first)} is stone sober and insulted.`, 'bad');
    say(slur('Cut ME off? I\'m fine!', c)); sfx('buzz');
    leave(c, false);
  }
}
const REPLIES = {
  listen: ['That sounds like a lot. Tell me more.', 'I\'m listening. Take your time.', 'Rough. How are you holding up?'],
  joke: ['Well, at least the drinks here are strong. Some of them.', 'Plot twist: I\'m three raccoons in an apron.', 'Sounds like a job for... another drink.'],
  compliment: ['Honestly? You look amazing tonight.', 'You\'re easily the most interesting person in here.', 'That\'s incredible. You\'re kind of a legend.'],
};
const REACT = {
  listen: ['...thanks. I needed that.', 'You\'re a good listener, you know that?'],
  joke: ['HA! Okay, you\'re funny.', '*snorts* Stop it.'],
  compliment: ['Oh, stop. No, keep going.', 'Finally, somebody noticed!'],
  bad: ['...okay?', 'Not really in the mood for that.', 'Huh. Anyway.', 'Read the room.'],
};
function chat() {
  if (!canAct()) return;
  const c = G.cust;
  if (c.chatted) { toast(`You already chatted with ${esc(c.p.first)} this round.`); return; }
  c.chatted = true;
  const opts = shuffle(Object.keys(REPLIES).map(style => ({ style, text: pick(REPLIES[style]) })));
  say(`${esc(slur(pick(c.p.chat), c))}<div class="choices">${opts.map((o, i) => `<button data-i="${i}">${esc(o.text)}</button>`).join('')}</div>`);
  $('#bubble').querySelectorAll('.choices button').forEach(b => b.onclick = () => {
    const o = opts[+b.dataset.i];
    if (G.cust !== c || c.phase !== 'waiting') return;
    if (o.style === c.p.style) {
      c.mood = clamp(c.mood + 22, 0, 100); c.charmed = true; flashExpr(c, 'happy');
      say(esc(slur(pick(REACT[o.style]), c)) + ` <small>(still want that <span class="order">${esc(c.order.name)}</span>)</small>`); sfx('ding');
    } else {
      c.mood = clamp(c.mood - 10, 0, 100); flashExpr(c, 'sad');
      say(esc(slur(pick(REACT.bad), c)) + ` <small>(waiting on a <span class="order">${esc(c.order.name)}</span>)</small>`);
    }
  });
}
function serve() {
  audio();
  if (!canAct()) { toast('Nobody\'s waiting on a drink.'); return; }
  const gl = G.glass;
  if (!gl || !gl.items.length) { toast('Pour something first.'); sfx('buzz'); return; }
  const c = G.cust, r = c.order, p = c.p, std = standardDrinks(gl.items), st = stage(c);
  if (std > .05) {
    if (p.underage) { fired(`You served alcohol to ${esc(p.first)}, who is ${p.age}. ${c.idChecked ? 'You looked right at the ID.' : 'You never even checked an ID.'}`); return; }
    if (!c.idAccepted) { if (strike(`You didn't card ${esc(p.first)}. The manager saw.`)) return; c.idAccepted = true; }
    else if (c.idCase !== 'valid') { if (strike(`You took a bad ID from ${esc(p.first)} (${c.idCase === 'expired' ? 'expired' : c.idCase === 'fake' ? 'fake' : 'not theirs'}).`)) return; c.idCase = 'valid'; }
    if (st >= 3) { if (strike(`${esc(p.first)} was already wasted. You over-served them.`)) return; }
  }
  const res = evaluate(gl, r);
  G.glass = null; renderGlass();
  if (res.q < .45) {
    c.mood = clamp(c.mood - 20, 0, 100); flashExpr(c, 'angry');
    say(slur(`That's not a <span class="order">${esc(r.name)}</span>! Try again.`, c)); sfx('buzz');
    toast(res.notes.slice(0, 4).map(esc).join('<br>'), 'bad', 4500);
    return;
  }
  const base = price(r) * .2;
  const qf = res.q >= .97 ? 1.3 : res.q;
  const moodF = .4 + c.mood / 100 * 1.1;
  const speedF = .75 + .5 * (c.patience / c.patienceMax);
  let tip = base * qf * moodF * speedF * (c.peeked ? .5 : 1) + (c.charmed ? 1.5 : 0);
  tip = Math.max(.25, Math.round(tip * 4) / 4);
  G.tips += tip; G.stats.tips += tip; G.stats.served++;
  if (res.q >= .97) G.stats.perfect++;
  c.bac += std; c.drinks++; c.mood = clamp(c.mood + res.q * 10, 0, 100); c.phase = 'drinking';
  flashExpr(c, 'happy', 2200); sfx('ding');
  const verdict = res.q >= .97 ? pick(['Perfect.', 'Now THAT is a drink.', 'Chef\'s kiss.', 'Exactly how I like it.']) : res.q >= .8 ? pick(['Pretty good!', 'Not bad.', 'That hits.']) : pick(['Eh. It\'s drinkable.', 'Hm. Close enough.', 'I\'ve had better.']);
  say(slur(verdict, c));
  toast(`💵 +${money(tip)} tip${c.peeked ? ' <small>(halved: you peeked)</small>' : ''}${c.charmed ? ' <small>(+charm)</small>' : ''}`, 'money');
  if (res.notes.length) toast(res.notes.slice(0, 4).map(esc).join('<br>'), '', 4200);
  setTimeout(() => {
    if (G.cust !== c || !G.running) return;
    renderCustomer();
    if (c.drinks < c.maxDrinks + (stage(c) >= 3 ? 1 : 0) && c.mood > 30) newOrder(c, true);
    else { say(slur(pick(['G\'night!', 'See you next time.', 'Thanks, bartender!', 'This place is alright.']), c)); leave(c, true); }
  }, 2400);
}

// ---------- Nights ----------
function startNight() {
  audio();
  G.stats = newStats(); G.done = 0; G.glass = null; renderGlass();
  const count = Math.min(PEOPLE.length, 6 + G.night);
  const minors = PEOPLE.filter(p => p.underage), adults = PEOPLE.filter(p => !p.underage && !p.look.bear);
  const bear = PEOPLE.find(p => p.look.bear);
  const nMinor = G.night >= 3 ? 2 : 1;
  const crew = shuffle(minors).slice(0, nMinor).concat(G.night === 1 || Math.random() < .6 ? [bear] : []);
  G.queue = shuffle(crew.concat(shuffle(adults).slice(0, count - crew.length)));
  G.total = G.queue.length;
  G.running = true; G.paused = false;
  $('#ovTitle').classList.add('hidden'); $('#ovEnd').classList.add('hidden');
  toast(`🌙 Night ${G.night}. ${G.total} customers tonight.`, '', 3000);
  renderQueue();
  setTimeout(arrive, 1200);
}
function renderQueue() { $('#queue').innerHTML = '<span></span>'.repeat(Math.min(5, G.queue.length)); }
function saveBest() { if (G.tips > G.best) { G.best = G.tips; store.set('pd.best', G.best); return true; } return false; }
function endNight() {
  G.running = false;
  const s = G.stats, record = saveBest();
  $('#endCard').innerHTML = `<h2>Last call! Night ${G.night} done</h2>
    <ul>
      <li>Tips tonight: <b>${money(s.tips)}</b></li>
      <li>Drinks served: <b>${s.served}</b>, perfect: <b>${s.perfect}</b></li>
      <li>Bad IDs caught: <b>${s.caught}</b></li>
      <li>Walkouts: <b>${s.walkouts}</b></li>
      <li>Strikes: <b>${G.strikes}/3</b></li>
    </ul>
    <p>Total tips: <b>${money(G.tips)}</b>${record ? ' 🏆 New best!' : ''}</p>
    <p style="color:#6b5a40">Tomorrow: more customers, harder orders, less patience.</p>
    <div class="row"><button class="big" id="bNext">Open night ${G.night + 1}</button></div>`;
  $('#ovEnd').classList.remove('hidden');
  $('#bNext').onclick = () => { G.night++; startNight(); };
}
function fired(reason) {
  G.running = false;
  const record = saveBest();
  if (G.cust) { G.cust.phase = 'leaving'; }
  sfx('buzz');
  $('#endCard').innerHTML = `<h2>You're fired!</h2>
    <p style="font-size:17px">${reason}</p>
    <p>You lasted <b>${G.night}</b> night${G.night > 1 ? 's' : ''} and made <b>${money(G.tips)}</b> in tips.${record ? ' 🏆 New best!' : ''}</p>
    <div class="row"><button class="big" id="bAgain">Get rehired</button></div>`;
  $('#ovEnd').classList.remove('hidden');
  $('#bAgain').onclick = () => {
    G.night = 1; G.tips = 0; G.strikes = 0; G.cust = null; G.genre = null; G.musicLeft = 0;
    const w = $('#custWrap'); w.style.transition = 'none'; w.className = 'out'; void w.offsetWidth; w.style.transition = '';
    $('#bubble').classList.add('hidden'); renderCustomer();
    startNight();
  };
}

// ---------- Recipe book ----------
let bookSel = null;
function openBook(practice) {
  const c = G.cust, peek = !practice && c && c.phase === 'waiting';
  if (peek && !c.peeked) { c.peeked = true; G.stats.peeks++; }
  $('#peekWarn').hidden = !peek;
  $('#ovBook').classList.remove('hidden');
  $('#bookSearch').value = ''; renderBookList();
  $('#bookSearch').focus();
}
function renderBookList() {
  const q = $('#bookSearch').value.trim().toLowerCase();
  const list = RECIPES.slice().sort((a, b) => a.name.localeCompare(b.name)).filter(r => !q || r.name.toLowerCase().includes(q) || r.ings.some(i => ING[i.k].name.toLowerCase().includes(q)));
  $('#bookList').innerHTML = list.map(r => `<button data-n="${esc(r.name)}" class="${r.name === bookSel ? 'on' : ''}">${esc(r.name)}</button>`).join('') || '<div style="padding:8px">Nothing by that name.</div>';
  $('#bookList').querySelectorAll('button').forEach(b => b.onclick = () => showRecipe(b.dataset.n));
}
function showRecipe(n) {
  bookSel = n;
  const r = RECIPE[n];
  $('#bookList').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.n === n));
  $('#bookPage').innerHTML = `<h3>${esc(r.name)}</h3>
    <div style="display:flex;gap:14px;align-items:flex-start">
      <svg viewBox="0 0 120 170" style="width:84px;flex:none">${glassSVG(r.glass, { items: r.ings, ice: r.ice, garn: new Set(r.garnish), method: r.method })}</svg>
      <div style="flex:1">
        <table>${r.ings.map(i => `<tr><td><b>${ING[i.k].kind === 'dash' ? i.a + ' dash' + (i.a > 1 ? 'es' : '') : oz(i.a)}</b></td><td>${esc(ING[i.k].name)}</td></tr>`).join('')}</table>
        <div><b>Glass:</b> ${GLASSES[r.glass].name} · <b>Ice in glass:</b> ${r.ice ? 'yes' : 'no'} · <b>Method:</b> ${METHODS[r.method]}</div>
        <div><b>Garnish:</b> ${r.garnish.length ? r.garnish.map(g => GARNISH[g]).join(', ') : 'none'}</div>
        <div style="margin-top:6px;color:#6b5a40">${standardDrinks(r.ings) < .05 ? 'Zero proof.' : `About ${standardDrinks(r.ings).toFixed(1)} standard drinks.`}</div>
      </div>
    </div>`;
}

// ---------- HUD and loop ----------
function renderPatience(f) {
  f = clamp(f, 0, 1);
  const a = f * Math.PI * 2, x = 32 + 26 * Math.sin(a), y = 32 - 26 * Math.cos(a);
  const col = f > .5 ? '#3fae5a' : f > .25 ? '#f2c230' : '#e0473a';
  const wedge = f >= .999 ? `<circle cx="32" cy="32" r="26" fill="${col}"/>` : f > .002 ? `<path d="M32,32 L32,6 A26,26 0 ${f > .5 ? 1 : 0} 1 ${x.toFixed(2)},${y.toFixed(2)} Z" fill="${col}"/>` : '';
  $('#patience').innerHTML = `<circle cx="32" cy="32" r="29" fill="#fffbea" stroke="${INK}" stroke-width="3"/>${wedge}<line x1="32" y1="32" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${INK}" stroke-width="3"/><circle cx="32" cy="32" r="3" fill="${INK}"/>`;
}
function hud() {
  $('#hNight').textContent = G.night;
  const frac = G.total ? G.done / G.total : 0, mins = 21 * 60 + Math.round(frac * 300);
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  $('#hClock').textContent = `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
  $('#hTips').textContent = money(G.tips);
  $('#hStrikes').textContent = '●'.repeat(G.strikes) + '○'.repeat(Math.max(0, 3 - G.strikes));
  const on = G.genre && G.musicLeft > 0;
  $('#hMusic').textContent = on ? `${GENRES[G.genre].name} ${Math.ceil(G.musicLeft)}s` : 'Jukebox: silent!';
  $('#bJuke').classList.toggle('warn', !on && G.running);
  const c = G.cust, act = canAct();
  for (const id of ['#bId', '#bChat', '#bCut', '#bRefuse']) $(id).disabled = !act;
  $('#bId').classList.toggle('done', !!(c && c.idAccepted));
  $('#bId').innerHTML = c && c.idAccepted ? '🪪 ID accepted' : '🪪 Check ID';
  $('#bChat').classList.toggle('done', !!(c && c.chatted));
  $('#mMood').style.width = (c ? c.mood : 0) + '%';
  $('#mMood').style.background = !c ? '#555' : c.mood > 60 ? 'var(--good)' : c.mood > 30 ? 'var(--gold)' : 'var(--bad)';
  if (!c) $('#mName').textContent = '—';
  renderPatience(c && c.phase === 'waiting' ? c.patience / c.patienceMax : 0);
}
let last = performance.now();
function tick(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (G.running && !G.paused) {
    if (G.musicLeft > 0) { G.musicLeft -= dt; if (G.musicLeft <= 0) { G.genre = null; toast('🎵 The jukebox went quiet.', 'bad'); } }
    const c = G.cust;
    if (c && c.phase === 'waiting') {
      c.patience -= dt;
      const on = G.genre && G.musicLeft > 0;
      c.mood = clamp(c.mood - dt * (on ? (G.genre === c.p.genre ? .05 : .3) : .75), 0, 100);
      if (c.patience <= 0) {
        G.stats.walkouts++;
        toast(`⌛ ${esc(c.p.first)} got tired of waiting and walked out.`, 'bad');
        say(slur(pick(['Forget it.', 'I\'ll go to the bar next door.', 'Unbelievable.']), c)); sfx('buzz');
        $('#ovId').classList.add('hidden');
        leave(c, false);
      }
    }
    if (c && c.exprUntil && c.exprUntil < now) { c.exprUntil = 0; renderCustomer(); }
    if (c && Math.random() < dt * .25) renderCustomer();
  }
  updatePourRead();
  hud();
  requestAnimationFrame(tick);
}

// ---------- Wiring ----------
function setMute(m) { AU.muted = m; store.set('pd.muted', m); if (AU.master) AU.master.gain.value = m ? 0 : .8; $('#bMute').textContent = m ? '🔇' : '🔊'; }
function init() {
  buildBar(); renderGlass();
  $('#cDate').textContent = longD(TONIGHT);
  $('#cBorn').innerHTML = `Born on or before<br><b>${fmtD(CUTOFF)}</b>`;
  $('#best').textContent = G.best ? `Best total tips: ${money(G.best)}` : '';
  setMute(AU.muted);
  $('#bStart').onclick = () => {
    if (G.running && G.paused) { G.paused = false; $('#ovTitle').classList.add('hidden'); return; }
    startNight();
  };
  $('#bPractice').onclick = () => openBook(true);
  $('#bHelp').onclick = () => { if (G.running) { G.paused = true; $('#bStart').textContent = 'Back to the bar'; } $('#ovTitle').classList.remove('hidden'); };
  $('#bMute').onclick = () => { audio(); setMute(!AU.muted); };
  $('#bBook').onclick = () => openBook(false);
  $('#bBookClose').onclick = () => $('#ovBook').classList.add('hidden');
  $('#bookSearch').oninput = renderBookList;
  $('#bJuke').onclick = () => { audio(); $('#ovJuke').classList.remove('hidden'); };
  $('#bJukeClose').onclick = () => $('#ovJuke').classList.add('hidden');
  document.querySelectorAll('.jukebox [data-g]').forEach(b => b.onclick = () => playGenre(b.dataset.g));
  $('#bId').onclick = checkId; $('#bIdOk').onclick = acceptId; $('#bIdNo').onclick = refuse;
  $('#bChat').onclick = chat; $('#bCut').onclick = cutOff; $('#bRefuse').onclick = refuse;
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#ovBook').classList.add('hidden'); $('#ovJuke').classList.add('hidden'); }
  });
  for (const id of ['#ovBook', '#ovJuke']) $(id).addEventListener('pointerdown', e => { if (e.target === $(id)) $(id).classList.add('hidden'); });
  requestAnimationFrame(tick);
}
init();
