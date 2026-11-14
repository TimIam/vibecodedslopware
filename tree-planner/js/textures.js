// Procedural canvas textures: needles, wrapping paper, skirts, glitter, tags.
import * as THREE from 'three';

const cache = new Map();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function shade(hex, f) { const c = new THREE.Color(hex); if (f > 0) c.lerp(new THREE.Color('#ffffff'), f); else c.multiplyScalar(1 + f); return '#' + c.getHexString(); }
function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// A branchlet card: twig up the middle (v axis), needles off it. Alpha-tested.
export function needleTexture(style, color, under, flock = 0) {
  const key = ['n', style, color, under, flock].join('|');
  if (cache.has(key)) return cache.get(key);
  const W = 128, H = 256, c = canvas(W, H), g = c.getContext('2d'), r = rng(style.length * 977 + 13);
  const cx = W / 2;
  const twig = style === 'tinsel' || style === 'fiber' ? '#8d9aa3' : '#5a4632';
  g.lineCap = 'round';
  const needle = (x, y, ang, len, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke(); };
  const cols = [color, shade(color, 0.12), shade(color, -0.18), under];
  const pick = () => style === 'fir' && r() < 0.12 ? under : cols[Math.floor(r() * 3)];
  g.strokeStyle = twig; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 6); g.stroke();
  if (style === 'fir' || style === 'concolor' || style === 'noble') {
    const L = style === 'concolor' ? 54 : style === 'noble' ? 34 : 40;
    for (let y = H - 6; y > 8; y -= 4.2) for (const s of [-1, 1]) {
      const ang = (s < 0 ? Math.PI : 0) + s * (-0.55 - r() * 0.35) * (style === 'noble' ? 1.4 : 1);
      needle(cx, y, ang, L * (0.75 + r() * 0.3) * Math.min(1, (H - y) / 70 + 0.45), 5.5, pick());
    }
  } else if (style === 'douglas') {
    for (let i = 0; i < 150; i++) { const y = 8 + r() * (H - 12), a = -Math.PI / 2 + (r() - 0.5) * 2.6; needle(cx, y, a + (r() < .5 ? 0 : Math.PI) * 0, 30 + r() * 16, 4.5, pick()); }
  } else if (style === 'spruce') {
    for (let i = 0; i < 220; i++) { const y = 8 + r() * (H - 12), a = -Math.PI / 2 + (r() - 0.5) * 3.0; needle(cx, y, a, 20 + r() * 12, 3.2, pick()); }
  } else if (style === 'pine2' || style === 'pine5') {
    const n = style === 'pine5' ? 5 : 2, L = style === 'pine5' ? 62 : 48;
    for (let y = H - 10; y > 10; y -= 9) { const base = -Math.PI / 2 + (r() - 0.5) * 2.6; for (let k = 0; k < n; k++) { const a = base + (k - n / 2) * 0.12 + (r() - .5) * .2; g.strokeStyle = pick(); g.lineWidth = style === 'pine5' ? 2 : 3.2; g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + Math.cos(a) * L * .5 + (r() - .5) * 10, y + Math.sin(a) * L * .5, cx + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); } }
  } else if (style === 'cypress' || style === 'cedar') {
    const frond = (x, y, ang, len, w) => { for (let t = 0; t < len; t += 4) { const px = x + Math.cos(ang) * t, py = y + Math.sin(ang) * t; g.fillStyle = pick(); g.beginPath(); g.ellipse(px, py, w * (1 - t / len * .6), 3.4, ang, 0, 7); g.fill(); } };
    frond(cx, H - 4, -Math.PI / 2, H - 10, 9);
    for (let y = H - 20; y > 20; y -= 18) for (const s of [-1, 1]) frond(cx, y, -Math.PI / 2 + s * (0.8 + r() * .3), 40 + r() * 15, 6);
    if (style === 'cedar') for (let i = 0; i < 10; i++) { g.fillStyle = '#6d8fb5'; g.beginPath(); g.arc(cx + (r() - .5) * 70, 20 + r() * (H - 40), 4, 0, 7); g.fill(); }
  } else if (style === 'pvc') {
    for (let y = H - 6; y > 6; y -= 3) { const a = -Math.PI / 2 + (r() - 0.5) * 3.0; g.strokeStyle = pick(); g.lineWidth = 3; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + Math.cos(a) * 36, y + Math.sin(a) * 36); g.stroke(); }
  } else if (style === 'pe') {
    for (let y = H - 6; y > 8; y -= 4.6) for (const s of [-1, 1]) needle(cx, y, (s < 0 ? Math.PI : 0) + s * (-0.6 - r() * 0.3), 34 + r() * 8, 5, pick());
  } else if (style === 'tinsel') {
    for (let i = 0; i < 160; i++) { const y = 8 + r() * (H - 12), a = -Math.PI / 2 + (r() - 0.5) * 3.0; g.strokeStyle = r() < .3 ? '#ffffff' : pick(); g.lineWidth = 2.2; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + Math.cos(a) * 52, y + Math.sin(a) * 52); g.stroke(); }
  } else if (style === 'fiber') {
    for (let y = H - 6; y > 6; y -= 4) { const a = -Math.PI / 2 + (r() - 0.5) * 3.0; needle(cx, y, a, 30, 3, pick()); }
  }
  if (flock > 0) { // snow on the upper sides of needles
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 90 * flock; i++) { g.fillStyle = `rgba(250,252,255,${0.55 + r() * 0.4})`; g.beginPath(); g.arc(r() * W, r() * H, 3 + r() * 6 * flock / 2, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  }
  const t = tex(c); cache.set(key, t); return t;
}

export function glitterTexture() {
  if (cache.has('glit')) return cache.get('glit');
  const c = canvas(128, 128), g = c.getContext('2d'), r = rng(5), img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = r() < 0.5 ? 255 : 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = tex(c, { repeat: true, srgb: false }); t.repeat.set(3, 3); cache.set('glit', t); return t;
}

// ---- Wrapping paper (512px tile, ~12 in of paper) -------------------------------------
export function paperCanvas(style, c1, c2) {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), r = rng(style.length * 31 + 7);
  g.fillStyle = c1; g.fillRect(0, 0, S, S);
  const star = (x, y, R, n = 5, inner = 0.45) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, rr = i % 2 ? R * inner : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  switch (style) {
    case 'candystripe': g.fillStyle = c2; for (let i = -S; i < S * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 28, 0); g.lineTo(i + 28 - S, S); g.lineTo(i - S, S); g.fill(); } break;
    case 'buffalo': { g.fillStyle = c1; g.fillRect(0, 0, S, S); g.globalAlpha = .55; g.fillStyle = c2; for (let i = 0; i < S; i += 128) { g.fillRect(i, 0, 64, S); g.fillRect(0, i, S, 64); } g.globalAlpha = 1; for (let i = 0; i < S; i += 128) for (let j = 0; j < S; j += 128) g.fillRect(i, j, 64, 64); break; }
    case 'tartan': case 'gingham': {
      const step = style === 'gingham' ? 64 : 128; g.globalAlpha = .5; g.fillStyle = c2;
      for (let i = 0; i < S; i += step) { g.fillRect(i, 0, step / 2, S); g.fillRect(0, i, S, step / 2); }
      if (style === 'tartan') { g.globalAlpha = .8; g.fillStyle = '#f2d36b'; for (let i = 0; i < S; i += 128) { g.fillRect(i + 92, 0, 4, S); g.fillRect(0, i + 92, S, 4); } g.fillStyle = '#0c1a2e'; for (let i = 0; i < S; i += 128) { g.fillRect(i + 20, 0, 16, S); g.fillRect(0, i + 20, S, 16); } }
      g.globalAlpha = 1; break; }
    case 'dots': g.fillStyle = c2; for (let y = 0; y < S; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < S + 32; x += 64) { g.beginPath(); g.arc(x, y + 32, 13, 0, 7); g.fill(); } break;
    case 'snowflakes': g.strokeStyle = c2; g.lineWidth = 3; for (let i = 0; i < 18; i++) { const x = (i * 137) % S, y = (i * 211 + 40) % S, R = 18 + (i % 3) * 8; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); g.moveTo(x + Math.cos(a) * R * .6, y + Math.sin(a) * R * .6); g.lineTo(x + Math.cos(a + .5) * R * .85, y + Math.sin(a + .5) * R * .85); g.stroke(); } } break;
    case 'kraft': { const img = g.getImageData(0, 0, S, S); for (let i = 0; i < img.data.length; i += 4) { const n = (r() - .5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * .8; } g.putImageData(img, 0, 0); g.fillStyle = c2; for (let i = 0; i < 26; i++) star((i * 173) % S, (i * 97 + 30) % S, 9 + (i % 3) * 3); break; }
    case 'gold': case 'silver': { const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, c1); gr.addColorStop(.45, c2); gr.addColorStop(.55, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, S, S); g.globalAlpha = .25; g.fillStyle = '#fff'; for (let i = 0; i < 400; i++) g.fillRect(r() * S, r() * S, 2, 2); g.globalAlpha = 1; break; }
    case 'trees': g.fillStyle = c2; for (let y = 20; y < S; y += 100) for (let x = (y / 100 | 0) % 2 ? 60 : 10; x < S; x += 100) { g.beginPath(); g.moveTo(x + 30, y); g.lineTo(x + 52, y + 60); g.lineTo(x + 8, y + 60); g.fill(); g.fillStyle = '#7a4f2a'; g.fillRect(x + 26, y + 60, 8, 10); g.fillStyle = c2; } break;
    case 'reindeer': g.fillStyle = c2; for (let y = 30; y < S; y += 128) for (let x = (y / 128 | 0) % 2 ? 70 : 6; x < S; x += 128) { g.save(); g.translate(x, y); g.beginPath(); g.ellipse(40, 40, 26, 12, 0, 0, 7); g.fill(); g.fillRect(18, 44, 5, 26); g.fillRect(55, 44, 5, 26); g.fillRect(28, 46, 5, 24); g.fillRect(46, 46, 5, 24); g.beginPath(); g.ellipse(70, 22, 8, 7, 0, 0, 7); g.fill(); g.fillRect(62, 24, 6, 18); g.strokeStyle = c2; g.lineWidth = 3; g.beginPath(); g.moveTo(70, 15); g.lineTo(66, 0); g.lineTo(60, -4); g.moveTo(67, 6); g.lineTo(74, 0); g.stroke(); g.restore(); } break;
    case 'holly': for (let i = 0; i < 16; i++) { const x = (i * 151) % S, y = (i * 89 + 50) % S; g.fillStyle = c2; for (const a of [0.4, 2.6]) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(18, 0, 18, 8, 0, 0, 7); g.fill(); g.restore(); } g.fillStyle = '#c3192b'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x - 4 + k * 5, y - 4 + (k % 2) * 6, 5, 0, 7); g.fill(); } } break;
    default: break;
  }
  return c;
}
export function paperTexture(paper, imgEl) {
  const key = 'p|' + paper.style + paper.c1 + paper.c2 + (paper.imgId || '');
  if (cache.has(key)) return cache.get(key);
  let t;
  if (paper.style === 'custom' && imgEl) { const c = canvas(512, 512), g = c.getContext('2d'); const s = Math.min(imgEl.width, imgEl.height); g.drawImage(imgEl, (imgEl.width - s) / 2, (imgEl.height - s) / 2, s, s, 0, 0, 512, 512); t = tex(c, { repeat: true }); }
  else t = tex(paperCanvas(paper.style, paper.c1, paper.c2), { repeat: true });
  cache.set(key, t); return t;
}

export function skirtTexture(style, color, color2 = '#ffffff') {
  const key = 's|' + style + color + color2;
  if (cache.has(key)) return cache.get(key);
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), r = rng(9);
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  const noise = (amp) => { const img = g.getImageData(0, 0, S, S); for (let i = 0; i < img.data.length; i += 4) { const n = (r() - .5) * amp; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; } g.putImageData(img, 0, 0); };
  if (style === 'quilted') { g.strokeStyle = shade(color, -0.35); g.lineWidth = 3; for (let i = -S; i < S * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke(); } noise(14); }
  else if (style === 'fur') { for (let i = 0; i < 9000; i++) { g.strokeStyle = r() < .5 ? shade(color, -0.12) : shade(color, 0.12); g.lineWidth = 1.5; const x = r() * S, y = r() * S, a = r() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); g.stroke(); } }
  else if (style === 'plaid') { g.globalAlpha = .45; g.fillStyle = color2 === '#ffffff' ? '#111' : color2; for (let i = 0; i < S; i += 96) { g.fillRect(i, 0, 40, S); g.fillRect(0, i, S, 40); } g.globalAlpha = .9; g.fillStyle = '#f0d36a'; for (let i = 0; i < S; i += 96) { g.fillRect(i + 70, 0, 3, S); g.fillRect(0, i + 70, S, 3); } g.globalAlpha = 1; }
  else if (style === 'knit') { for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) { g.fillStyle = shade(color, ((x + y) / 16) % 2 ? -0.08 : 0.06); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 16); g.lineTo(x + 16, y); g.fill(); } g.fillStyle = color2; for (let x = 8; x < S; x += 64) for (const y of [200, 300]) { g.font = 'bold 32px serif'; g.fillText('❄', x, y); } }
  else if (style === 'sequin') { for (let y = 0; y < S; y += 10) for (let x = (y / 10) % 2 ? 5 : 0; x < S; x += 10) { g.fillStyle = shade(color, (r() - .5) * 0.9); g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); } }
  else if (style === 'burlap') { for (let i = 0; i < S; i += 4) { g.fillStyle = shade(color, (r() - .5) * .3); g.fillRect(i, 0, 2, S); g.fillStyle = shade(color, (r() - .5) * .3); g.fillRect(0, i, S, 2); } noise(18); }
  else noise(10); // velvet
  const t = tex(c, { repeat: true }); cache.set(key, t); return t;
}

export function cardTexture(type, color, to, from) {
  const key = 'c|' + type + color + to + from;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(256, 160), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, 160);
  const ink = new THREE.Color(color).getHSL({}).l > 0.55 ? '#222' : '#fff';
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 3;
  if (type === 'envelope') { g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 90); g.lineTo(256, 0); g.stroke(); g.font = '22px Georgia'; g.fillText(to ? 'To ' + to : '', 70, 135); }
  else { g.strokeRect(8, 8, 240, 144); g.font = 'bold 26px Georgia'; g.fillText('To: ' + (to || ''), 22, 62); g.fillText('From: ' + (from || ''), 22, 112); }
  const t = tex(c); cache.set(key, t); return t;
}

export function glowSprite() {
  if (cache.has('glow')) return cache.get('glow');
  const c = canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = tex(c); cache.set('glow', t); return t;
}
