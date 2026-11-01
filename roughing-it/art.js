// Roughing It: the scene painter. A 320x160 pixel picture above the story.
//
// The background (sky, mountain ranges, hills, water, ground, road) is written pixel by pixel into
// an ImageData every frame, with ordered dithering for gradients and hashed texture that scrolls
// with parallax. Everything on top of it (the coach, horses, towns, trees, ships...) is a sprite:
// drawn once with canvas shapes into a small offscreen canvas, then hardened into pixel art
// (alpha thresholded, a dark one-pixel outline added) and cached.
//
// API: scene.set(region, opts), scene.roll(ms). Parts II/III add regions through window.SCENES,
// each { pal, draw(g, t, px, opts, moving, offset) }, and can use the helpers on window.ART.
'use strict';
window.SCENES = window.SCENES || {};

const ART = (() => {
  // ---------------------------------------------------------------- colour and noise
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const add = (c, d) => c.map(v => Math.max(0, Math.min(255, v + d)));
  const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const shade = (h, d) => css(add(hex(h), d));
  const pack = c => ((255 << 24) | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255)) >>> 0;
  function hash(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
  const h2 = (x, y) => hash(Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263));
  function noise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }
  const fbm = x => noise(x) * .58 + noise(x * 2.13 + 17.3) * .28 + noise(x * 4.37 + 41.1) * .14;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
  const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

  // ---------------------------------------------------------------- sprites
  const cache = new Map();
  function spr(key, w, h, draw, outline) {
    let c = cache.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); draw(x);
    const im = x.getImageData(0, 0, w, h), d = im.data, a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { a[i] = d[i * 4 + 3] >= 100 ? 1 : 0; d[i * 4 + 3] = a[i] ? 255 : 0; }
    if (outline) {
      const o = hex(outline);
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
        const i = y * w + xx; if (a[i]) continue;
        if ((xx > 0 && a[i - 1]) || (xx < w - 1 && a[i + 1]) || (y > 0 && a[i - w]) || (y < h - 1 && a[i + w])) { d[i * 4] = o[0]; d[i * 4 + 1] = o[1]; d[i * 4 + 2] = o[2]; d[i * 4 + 3] = 255; }
      }
    }
    x.putImageData(im, 0, 0); cache.set(key, c); return c;
  }
  const circ = (x, cx, cy, r, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
  const ell = (x, cx, cy, rx, ry, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill(); };
  const poly = (x, pts, col) => { x.fillStyle = col; x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.fill(); };
  const rect = (x, a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };

  // a 3x5 pixel font for painted signs
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111', '&': '010101010101011', '.': '000000000000010', "'": '010010000000000', ' ': '000000000000000',
    '1': '010110010010111', '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', '5': '111100110001110', '6': '011100110101010',
  };
  const textW = s => s.length * 4 - 1;
  function text(g, s, x, y, col) {
    g.fillStyle = col; let cx = Math.round(x); y = Math.round(y);
    for (const ch of String(s).toUpperCase()) { const f = FONT[ch]; if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') g.fillRect(cx + i % 3, y + (i / 3 | 0), 1, 1); cx += 4; }
  }
  // pixel line and circle, for crisp wheels, reins and rigging
  function pline(g, x0, y0, x1, y1, col) {
    g.fillStyle = col; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (let n = 0; n < 400; n++) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  function pring(g, cx, cy, r, col) {
    g.fillStyle = col; let x = r, y = 0, e = 1 - r; cx = Math.round(cx); cy = Math.round(cy);
    while (x >= y) { for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) g.fillRect(cx + a, cy + b, 1, 1); y++; if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; } }
  }

  // ---------------------------------------------------------------- plants, rocks, clouds
  const sage = v => spr('sage' + v, 12, 8, x => {
    const n = 4 + (v % 3);
    for (let k = 0; k < n; k++) circ(x, 2.5 + k * 1.8 + hash(v * 9 + k) * 1.2, 4.6 - hash(v * 7 + k) * 1.4, 1.9 + hash(v + k * 3) * .9, '#7f8d6b');
    for (let k = 0; k < n - 1; k++) circ(x, 2.2 + k * 1.8, 3.4 - hash(v * 5 + k), 1, '#a7b38f');
    rect(x, 1, 6, 10, 1, '#5d6b4c');
  }, '#3b4632');
  const pine = v => spr('pine' + v, 15, 26, x => {
    rect(x, 6, 19, 3, 7, '#5a3f25');
    const tiers = 5;
    for (let i = 0; i < tiers; i++) { const y = 1 + i * 3.8, w = 2.2 + i * 1.5; poly(x, [[7.5, y], [7.5 + w + 1.5, y + 6], [7.5 - w - 1.5, y + 6]], '#2f5a35'); poly(x, [[7.5, y + .5], [7.5 - w - .5, y + 5.5], [7.5 - 1, y + 5.5]], '#47784a'); }
  }, '#16281a');
  const oak = v => spr('oak' + v, 24, 22, x => {
    rect(x, 10, 12, 3, 10, '#5a3f25'); rect(x, 8, 14, 3, 1, '#5a3f25');
    for (let k = 0; k < 6; k++) circ(x, 5 + k * 2.8 + hash(v + k) * 2, 8 - hash(v * 3 + k) * 4, 4 + hash(k + v * 7) * 2, '#4f6b33');
    for (let k = 0; k < 4; k++) circ(x, 6 + k * 3, 5 - hash(v * 2 + k) * 2, 2.2, '#6f8f45');
    rect(x, 3, 11, 18, 2, '#3e5527');
  }, '#22301a');
  const rock = v => spr('rock' + v, 9, 6, x => { ell(x, 4.5, 3.5, 4, 2.5, '#8a8070'); ell(x, 3.5, 2.6, 2.2, 1.2, '#aaa08e'); rect(x, 1, 5, 7, 1, '#6a6050'); }, '#4a4036');
  const cloud = v => spr('cloud' + v, 40, 16, x => {
    const n = 4 + v % 3, pts = [];
    for (let k = 0; k < n; k++) pts.push([7 + k * (26 / n) + hash(v * 11 + k) * 4, 9 - Math.sin(k / (n - 1) * Math.PI) * 3 - hash(v + k) * 2, 4 + Math.sin(k / (n - 1) * Math.PI) * 3 + hash(k * 7 + v) * 1.5]);
    for (const [a, b, r] of pts) circ(x, a, b + 1.5, r, '#d9e2ea');
    for (const [a, b, r] of pts) circ(x, a, b, r - .3, '#ffffff');
  });
  const palm = v => spr('palm' + v, 34, 44, x => {
    x.strokeStyle = '#7a5a3a'; x.lineWidth = 2.6; x.beginPath(); x.moveTo(15 + v % 2, 44); x.quadraticCurveTo(13 + v % 3 * 2, 26, 17, 12); x.stroke();
    x.strokeStyle = '#5a3f25'; x.lineWidth = .9; for (let y = 16; y < 44; y += 3) { x.beginPath(); x.moveTo(13, y); x.lineTo(17, y + 1); x.stroke(); }
    for (let a = 0; a < 7; a++) {
      const an = -Math.PI + a / 6 * Math.PI + (hash(v + a) - .5) * .3, len = 12 + hash(a * 3 + v) * 4;
      x.strokeStyle = a % 2 ? '#2f6a2f' : '#3f8a3a'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(17, 12);
      x.quadraticCurveTo(17 + Math.cos(an) * len * .6, 12 + Math.sin(an) * len * .6 - 3, 17 + Math.cos(an) * len, 12 + Math.sin(an) * len * .5 + len * .35); x.stroke();
    }
    circ(x, 16, 13, 1.6, '#6a4a22'); circ(x, 18.5, 13.5, 1.5, '#6a4a22');
  }, '#163016');

  // ---------------------------------------------------------------- horses and the coach
  function horse(f, coat = '#7a4a2a', harness = false) {
    return spr(`horse${coat}${f}${harness}`, 30, 22, x => {
      const c = hex(coat), dark = css(add(c, -38)), light = css(add(c, 28));
      const ph = f < 0 ? null : f / 6 * Math.PI * 2, bob = ph === null ? 0 : Math.sin(ph) * .6;
      x.lineCap = 'round';
      const leg = (hx, hy, a1, a2, col) => {
        const kx = hx + Math.sin(a1) * 4.3, ky = hy + Math.cos(a1) * 4.3, fx = kx + Math.sin(a2) * 4.6, fy = ky + Math.cos(a2) * 4.6;
        x.strokeStyle = col; x.lineWidth = 1.9; x.beginPath(); x.moveTo(hx, hy); x.lineTo(kx, ky); x.lineTo(fx, fy); x.stroke();
        rect(x, fx - 1, fy - .3, 2.2, 1.6, '#241810');
      };
      const S = (o) => ph === null ? 0 : Math.sin(ph + o);
      const front = o => [ph === null ? .06 : .18 + .78 * S(o), 0], hind = o => [ph === null ? -.06 : -.22 + .66 * S(o + Math.PI), 0];
      let [a, ] = front(.75); leg(17.6, 10.5 + bob, a, a - Math.max(0, S(1.55)) * 1.4, dark);
      [a] = hind(.75); leg(6.8, 10.3 + bob, a, a + Math.max(0, S(Math.PI + 1.55)) * 1.1, dark);
      // tail, body, neck, head
      poly(x, [[5, 6.6 + bob], [1.2, 9 + bob], [1.5, 14 + bob], [3.4, 12.6 + bob], [6.2, 8.6 + bob]], css(add(c, -55)));
      ell(x, 12.5, 8.6 + bob, 7.9, 3.7, coat); circ(x, 6.4, 8.4 + bob, 3.6, coat); circ(x, 18, 9 + bob, 3.4, coat);
      poly(x, [[15.8, 7.8 + bob], [19.4, 3.4 + bob * 1.5], [22, 2.4 + bob * 1.5], [22.6, 6 + bob], [20, 10.4 + bob]], coat);
      poly(x, [[19.8, 1.8 + bob * 1.5], [23, 1 + bob * 1.5], [27.4, 5.2 + bob * 1.5], [26.8, 7.2 + bob * 1.5], [24.6, 7.4 + bob * 1.5], [21.4, 5.2 + bob * 1.5]], coat);
      poly(x, [[20.6, 2.2 + bob * 1.5], [21.2, -.4 + bob * 1.5], [22.4, 1.6 + bob * 1.5]], coat);
      x.strokeStyle = css(add(c, -60)); x.lineWidth = 1.6; x.beginPath(); x.moveTo(16.2, 6.6 + bob); x.lineTo(19.6, 2.8 + bob * 1.5); x.lineTo(21.4, 1.6 + bob * 1.5); x.stroke();
      x.strokeStyle = light; x.lineWidth = 1.1; x.beginPath(); x.moveTo(7.5, 5.4 + bob); x.quadraticCurveTo(12, 4.4 + bob, 15.5, 5.6 + bob); x.stroke();
      rect(x, 24, 3 + bob * 1.5, 1, 1, '#120a06');
      if (harness) {
        x.strokeStyle = '#2e1e12'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(19.4, 4.6 + bob); x.lineTo(18.4, 10.6 + bob); x.stroke();
        x.beginPath(); x.moveTo(12, 4.9 + bob); x.lineTo(12, 12.2 + bob); x.stroke();
        x.lineWidth = 1.1; x.beginPath(); x.moveTo(18.6, 8.6 + bob); x.lineTo(3, 8.8 + bob); x.stroke();
        rect(x, 11, 4.4 + bob, 3, 1.4, '#c9a040');
      }
      [a] = front(0); leg(18.4, 11 + bob, a, a - Math.max(0, S(.8)) * 1.4, coat);
      [a] = hind(0); leg(7.6, 10.8 + bob, a, a + Math.max(0, S(Math.PI + .8)) * 1.1, coat);
    }, '#1a120a');
  }
  const coachBody = () => spr('coach', 54, 36, x => {
    // luggage on the roof
    rect(x, 9, 4, 11, 6, '#7a5230'); rect(x, 9, 4, 11, 1, '#9a7048'); rect(x, 12, 4, 1, 6, '#3a2616'); rect(x, 17, 4, 1, 6, '#3a2616');
    ell(x, 25, 7.5, 4.4, 2.6, '#4d6b2f'); rect(x, 24, 4, 2, 1, '#2e3e1a');
    ell(x, 32, 8, 3.2, 2.2, '#c9bfa0'); ell(x, 36.5, 8.2, 2.6, 2, '#b8ad8a');
    rect(x, 5, 10, 39, 1, '#3a2616'); for (let i = 6; i < 44; i += 6) rect(x, i, 8, 1, 3, '#3a2616');
    rect(x, 4, 11, 42, 2, '#3a2616');
    // body: the Concord's egg-shaped red shell
    x.fillStyle = '#9b2d20'; x.beginPath(); x.moveTo(5, 13); x.lineTo(45, 13); x.lineTo(45, 15); x.quadraticCurveTo(47.5, 23, 42, 29); x.lineTo(11, 29); x.quadraticCurveTo(3.5, 26, 4, 16); x.closePath(); x.fill();
    x.save(); x.clip(); rect(x, 0, 25, 54, 6, '#7a2218'); rect(x, 0, 13, 54, 2, '#b8402c'); x.restore();
    rect(x, 5, 15, 40, 1, '#e2b552'); rect(x, 9, 26, 33, 1, '#e2b552');
    // windows with passengers, and the door
    for (const wx of [8, 31]) { rect(x, wx, 16, 9, 6, '#2a1d12'); circ(x, wx + 3.5, 19.6, 1.7, '#e0c08a'); rect(x, wx + 1.8, 17, 3.6, 1, '#3a2616'); rect(x, wx, 16, 9, 1, '#c94a35'); }
    rect(x, 20, 16, 9, 10, '#8a2618'); x.strokeStyle = '#e2b552'; x.lineWidth = 1; x.strokeRect(20.5, 16.5, 8, 9); rect(x, 27, 21, 1, 1, '#e2b552'); rect(x, 23, 19, 3, 3, '#c9a040');
    // leather boot behind, footboard in front
    ell(x, 3.8, 21, 3.6, 5.5, '#5a3a22'); rect(x, 1, 18, 5, 1, '#3a2616');
    rect(x, 45, 18, 7, 2, '#3a2616'); rect(x, 47, 13, 2, 6, '#3a2616');
    // the driver
    rect(x, 41, 0, 5, 2, '#4a3520'); rect(x, 39, 2, 9, 1, '#4a3520'); rect(x, 42, 3, 4, 3, '#e0c08a');
    rect(x, 40, 6, 7, 7, '#3a4a6a'); rect(x, 46, 8, 4, 2, '#3a4a6a'); rect(x, 45, 13, 3, 5, '#2a2a3a');
  }, '#1a120a');
  function wheel(g, cx, cy, r, ang) {
    g.fillStyle = '#c9a040';
    for (let s = 0; s < 10; s++) { const a = ang + s * Math.PI / 5; pline(g, cx, cy, cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), '#d9a441'); }
    pring(g, cx, cy, r, '#2a1d12'); pring(g, cx, cy, r - 1, '#b8862a');
    g.fillStyle = '#2a1d12'; g.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
  }
  function coach(g, x, gy, t, moving) {
    const bob = moving ? Math.round(Math.sin(t * 13) * 1) : 0, sway = moving ? Math.round(Math.sin(t * 6.5)) : 0;
    // shadow
    g.fillStyle = 'rgba(40,25,10,.22)'; g.fillRect(x + 2, gy - 1, 134, 3); g.fillRect(x + 6, gy + 2, 126, 1);
    // dust
    if (moving) for (let i = 0; i < 10; i++) {
      const age = (t * 1.6 + i / 10) % 1, r = 2 + age * 5;
      g.fillStyle = `rgba(214,196,150,${(1 - age) * .55})`; g.beginPath(); g.arc(x - 2 - age * 34 + Math.sin(i * 7) * 3, gy - 3 - age * 9 + Math.sin(i) * 2, r, 0, 7); g.fill();
    }
    // the team: three pairs, the far horse of each pair a shade darker
    const coats = [['#6e4528', '#8a5a34'], ['#4a3020', '#5e3e26'], ['#7a5a3a', '#94704a']];
    for (let i = 2; i >= 0; i--) {
      const hx = x + 52 + i * 25, f = moving ? Math.floor(t * 11 + i * 2.3) % 6 : -1, f2 = moving ? Math.floor(t * 11 + i * 2.3 + 1.5) % 6 : -1;
      g.drawImage(horse(f2, coats[i][0], true), hx + 3, gy - 23);
      g.drawImage(horse(f, coats[i][1], true), hx, gy - 21);
    }
    // traces and reins
    for (let i = 0; i < 3; i++) pline(g, x + 49, gy - 26 + bob, x + 52 + i * 25 + 24, gy - 18, '#2a1d12');
    // undercarriage and thoroughbraces
    g.fillStyle = '#2a1d12'; g.fillRect(x + 8, gy - 10, 38, 2); g.fillRect(x + 44, gy - 12, 10, 1);
    pline(g, x + 12, gy - 10, x + 9, gy - 14 + bob, '#5a3a22'); pline(g, x + 40, gy - 10, x + 43, gy - 14 + bob, '#5a3a22');
    g.drawImage(coachBody(), x + sway * .5, gy - 42 + bob);
    // whip
    const crack = moving && Math.sin(t * 1.7) > .8;
    const hx2 = x + 49, hy2 = gy - 33 + bob;
    for (let k = 0; k <= 14; k++) { const s = k / 14, wx = hx2 + s * (crack ? 30 : 16), wy = hy2 - s * 14 + s * s * (crack ? 18 : 10); g.fillStyle = '#2a1d12'; g.fillRect(Math.round(wx), Math.round(wy), 1, 1); }
    // wheels on top
    const a = moving ? t * 9 : 0;
    wheel(g, x + 13, gy - 8, 8, a); wheel(g, x + 41, gy - 6, 6, a * 1.33);
  }
  // a lone galloping rider (the Pony Express)
  function rider(g, x, gy, t) {
    const f = Math.floor(t * 16) % 6;
    g.drawImage(horse(f, '#3a2616'), x, gy - 21);
    const bob = Math.round(Math.sin(f / 6 * Math.PI * 2) * .6);
    g.fillStyle = '#9b2d20'; g.fillRect(x + 12, gy - 24 + bob, 5, 6); g.fillStyle = '#e0c08a'; g.fillRect(x + 14, gy - 28 + bob, 3, 3);
    g.fillStyle = '#3a2616'; g.fillRect(x + 12, gy - 29 + bob, 7, 1); g.fillRect(x + 13, gy - 30 + bob, 4, 1);
    g.fillStyle = '#7a5230'; g.fillRect(x + 9, gy - 18 + bob, 4, 4); // the mochila
  }

  // ---------------------------------------------------------------- buildings
  const WOODS = ['#c9a27a', '#b88a5e', '#d8c4a0', '#9e7a58', '#a9a48a', '#c4b08a'];
  // wooden false-front store with a painted sign
  const falseFront = (v, sign, w = 34) => spr(`ff${v}${sign}${w}`, w + 2, 44, x => {
    const wall = WOODS[v % WOODS.length], c = hex(wall);
    rect(x, 1, 16, w, 28, wall);
    for (let y = 18; y < 44; y += 3) rect(x, 1, y, w, 1, css(add(c, -16)));
    const top = 2 + (v % 3);
    rect(x, 1, top, w, 15 - top, css(add(c, 10))); rect(x, 0, top - 1, w + 2, 2, css(add(c, -50)));
    if (v % 2) { rect(x, 6, top - 3, w - 10, 2, css(add(c, 10))); rect(x, 5, top - 4, w - 8, 1, css(add(c, -50))); }
    const sw = Math.max(textW(sign) + 6, 14); rect(x, 1 + (w - sw) / 2, top + 2, sw, 8, v % 3 === 1 ? '#2a1d12' : '#efe3c4');
    text(x, sign, 1 + (w - textW(sign)) / 2, top + 3.5, v % 3 === 1 ? '#efe3c4' : '#7a2218');
    rect(x, 0, 18, w + 2, 2, '#5a3f25'); rect(x, 1, 20, w, 2, css(add(c, -40)));
    rect(x, 1, 20, 1, 24, '#5a3f25'); rect(x, w, 20, 1, 24, '#5a3f25');
    for (const wx of [5, w - 10]) { rect(x, wx, 25, 6, 9, '#c9b48a'); rect(x, wx + 1, 26, 4, 7, '#3a4a5a'); rect(x, wx + 1, 29, 4, 1, '#c9b48a'); rect(x, wx + 3, 26, 1, 7, '#c9b48a'); rect(x, wx + 1, 26, 1, 1, '#9fb7c8'); }
    rect(x, w / 2 - 2, 28, 6, 16, '#5a3a22'); rect(x, w / 2 + 2, 36, 1, 1, '#e2b552');
  }, '#2a1d12');
  // brick block, two storeys, for Virginia City and San Francisco
  const brick = (v, sign, w = 30) => spr(`br${v}${sign}${w}`, w + 2, 50, x => {
    const wall = ['#9a4a34', '#8a5a44', '#a0644a', '#7a4a3a'][v % 4], c = hex(wall);
    rect(x, 1, 6, w, 44, wall);
    for (let y = 8; y < 50; y += 2) for (let xx = 1 + (y % 4 ? 0 : 2); xx < w; xx += 4) rect(x, xx, y, 1, 1, css(add(c, -22)));
    rect(x, 0, 3, w + 2, 3, '#5a3a2a'); rect(x, 1, 6, w, 1, '#c9b48a');
    for (let r = 0; r < 2; r++) for (let wx = 4; wx < w - 4; wx += 8) { rect(x, wx, 10 + r * 15, 5, 8, '#e6dcc4'); rect(x, wx + 1, 11 + r * 15, 3, 6, '#2e3a48'); rect(x, wx + 1, 11 + r * 15, 1, 1, '#9fb7c8'); }
    if (sign) { rect(x, 2, 33, w - 2, 6, '#2a1d12'); text(x, sign, 1 + (w - textW(sign)) / 2, 33.5, '#e2b552'); }
    rect(x, w / 2 - 2, 41, 6, 9, '#3a2616');
  }, '#1e140c');
  // San Francisco row houses: narrow, bay-windowed, painted
  const victorian = v => spr('vic' + v, 18, 40, x => {
    const wall = ['#d8c8a8', '#b8c4b0', '#c8a8a0', '#e4dcc4', '#a8b8c8'][v % 5], c = hex(wall);
    poly(x, [[0, 10], [9, 2], [18, 10]], css(add(c, -60)));
    rect(x, 1, 10, 16, 30, wall); rect(x, 1, 10, 16, 1, '#f4f0e6');
    rect(x, 2, 14, 8, 10, css(add(c, 12))); rect(x, 3, 15, 2, 7, '#2e3a48'); rect(x, 7, 15, 2, 7, '#2e3a48'); rect(x, 2, 24, 8, 1, '#f4f0e6');
    rect(x, 12, 15, 3, 6, '#2e3a48'); rect(x, 3, 28, 4, 6, '#2e3a48'); rect(x, 11, 28, 4, 12, '#5a3a22'); rect(x, 10, 27, 6, 1, '#f4f0e6');
  }, '#2a1d12');
  const cabin = (v = 0) => spr('cabin' + v, 44, 30, x => {
    poly(x, [[0, 12], [22, 2], [44, 12]], '#5a3f25'); poly(x, [[2, 11], [22, 3.5], [42, 11]], '#6e4e30');
    for (let y = 12; y < 30; y += 3) { rect(x, 2, y, 40, 3, y % 2 ? '#7a5a3a' : '#8a6844'); rect(x, 2, y + 2, 40, 1, '#5a3f25'); }
    rect(x, 34, 0, 4, 8, '#7a6a5a'); rect(x, 33, 0, 6, 1, '#5a4a3a');
    rect(x, 17, 16, 7, 14, '#3a2616'); rect(x, 6, 16, 6, 6, '#e8c870'); rect(x, 8, 16, 1, 6, '#5a3f25'); rect(x, 6, 18, 6, 1, '#5a3f25');
  }, '#1e140c');

  // ---------------------------------------------------------------- boats
  const steamboat = () => spr('steamboat', 110, 56, x => {
    rect(x, 4, 44, 100, 6, '#f4ecd2'); poly(x, [[100, 44], [110, 44], [104, 50], [100, 50]], '#f4ecd2'); rect(x, 4, 49, 100, 2, '#2a1d12');
    rect(x, 10, 36, 84, 8, '#f4ecd2'); rect(x, 20, 30, 60, 6, '#e8e0c8'); rect(x, 42, 22, 16, 8, '#f4ecd2');
    for (let i = 12; i < 92; i += 3) rect(x, i, 36, 1, 3, '#8a7a6a'); for (let i = 22; i < 78; i += 3) rect(x, i, 30, 1, 2, '#8a7a6a');
    for (let i = 14; i < 90; i += 6) rect(x, i, 40, 3, 3, '#3a4a5a'); for (let i = 45; i < 56; i += 4) rect(x, i, 24, 2, 3, '#3a4a5a');
    rect(x, 8, 35, 88, 1, '#9b2d20'); rect(x, 18, 29, 64, 1, '#9b2d20');
    for (const sx of [30, 38]) { rect(x, sx, 2, 4, 28, '#2a1d12'); rect(x, sx - 1, 1, 6, 2, '#2a1d12'); rect(x, sx - 1, 0, 1, 2, '#2a1d12'); rect(x, sx + 4, 0, 1, 2, '#2a1d12'); }
    x.fillStyle = '#9b2d20'; x.beginPath(); x.arc(64, 44, 10, Math.PI, 0); x.fill(); rect(x, 55, 40, 18, 1, '#e2b552');
    for (let i = 0; i < 6; i++) rect(x, 56 + i * 3, 36, 1, 8, '#7a2218');
  }, '#2a1d12');
  const ship = v => spr('ship' + v, 64, 56, x => {
    poly(x, [[2, 44], [62, 44], [56, 52], [8, 52]], '#2a1d12'); rect(x, 6, 44, 52, 2, '#7a2218');
    for (const [mx, h] of [[18, 40], [34, 44], [48, 36]]) {
      rect(x, mx, 44 - h, 1.5, h, '#4a3520');
      for (let k = 0; k < 3; k++) { const y = 44 - h + 3 + k * (h / 3.4), w = 8 + k * 3; poly(x, [[mx - w, y], [mx + w, y], [mx + w - 1, y + h / 4], [mx - w + 1, y + h / 4]], k % 2 ? '#e8e0cc' : '#f4ecd8'); }
    }
    poly(x, [[50, 18], [63, 42], [50, 42]], '#ece4d0');
  }, '#1e140c');
  const steamer = () => spr('steamer', 100, 48, x => {
    poly(x, [[2, 34], [96, 34], [90, 42], [8, 42]], '#2a1d12'); rect(x, 6, 34, 86, 2, '#f4ecd2');
    rect(x, 20, 26, 56, 8, '#f4ecd2'); for (let i = 22; i < 74; i += 5) rect(x, i, 28, 3, 3, '#3a4a5a');
    rect(x, 46, 8, 6, 18, '#2a1d12'); rect(x, 46, 8, 6, 2, '#9b2d20');
    for (const mx of [14, 84]) { rect(x, mx, 2, 1.5, 32, '#4a3520'); rect(x, mx - 6, 10, 12, 1, '#4a3520'); poly(x, [[mx + 1, 4], [mx + 9, 26], [mx + 1, 26]], '#ece4d0'); }
    x.fillStyle = '#9b2d20'; x.beginPath(); x.arc(49, 34, 9, Math.PI, 0); x.fill(); rect(x, 41, 31, 16, 1, '#e2b552');
  }, '#1e140c');
  const schooner = () => spr('schooner', 64, 50, x => {
    poly(x, [[2, 38], [62, 38], [56, 46], [8, 46]], '#3a2616'); rect(x, 6, 38, 52, 1, '#c9a040');
    for (const [mx, h] of [[22, 34], [40, 30]]) { rect(x, mx, 38 - h, 1.5, h, '#4a3520'); poly(x, [[mx + 1, 38 - h + 2], [mx + 15, 36], [mx + 1, 36]], '#f0e8d4'); }
    poly(x, [[42, 10], [62, 36], [42, 36]], '#e4dcc8');
  }, '#1e140c');

  // expose the smoke puff for other scenes
  return { hex, mix, add, css, shade, pack, hash, h2, noise, fbm, bayer, spr, circ, ell, poly, rect, text, textW, pline, pring,
    sage, pine, oak, rock, cloud, palm, horse, coach, rider, wheel, falseFront, brick, victorian, cabin, steamboat, ship, steamer, schooner };
})();
window.ART = ART;

// ======================================================================= the scene
const scene = (() => {
  const cv = document.getElementById('scene'), g = cv.getContext('2d');
  const W = 320, H = 160;
  g.imageSmoothingEnabled = false;
  const img = g.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
  let region = 'river', opts = {}, rollUntil = 0, offset = 0, last = 0, t0 = performance.now(), tones = null;
  const PAL = {
    plains: { sky: ['#7fb6dc', '#f2e4b8'], far: '#93a8b2', mid: '#8a9a55', ground: '#c2ae6c', dot: '#7c8a46', hills: true },
    bluffs: { sky: ['#86b8da', '#f4e0b0'], far: '#c79f6a', mid: '#a88355', ground: '#c9b07a', dot: '#7c8a46', buttes: true },
    rockies: { sky: ['#6fa8d6', '#e6ebe8'], far: '#7f8ea3', mid: '#64726b', ground: '#a69a72', dot: '#7f8f6a', snow: true },
    salt: { sky: ['#82b8dc', '#f6eed4'], far: '#93a0b0', mid: '#8fb9c8', ground: '#d8ceaa', dot: '#8a9a55', lake: true },
    desert: { sky: ['#b0d0e4', '#fcf2da'], far: '#cdbfa6', mid: '#e1d6c0', ground: '#ece4d2', dot: '#a9a58a', haze: true },
    sierra: { sky: ['#7cb2da', '#e8f0ea'], far: '#6f8197', mid: '#3e5a41', ground: '#8a7f5e', dot: '#2f4a32', pines: true, snow: true },
    town: { sky: ['#94c0dc', '#f2e4bc'], far: '#9d8f7e', mid: '#8b7f68', ground: '#b9a374', dot: '#8b8a5a', hills: true },
    mine: { sky: ['#8cbadb', '#f2e2b8'], far: '#a28e74', mid: '#8c7454', ground: '#9c8460', dot: '#7c7a52', hills: true },
    city: { sky: ['#82aed2', '#f0dcb4'], far: '#8d7a66', mid: '#7b6750', ground: '#9a8460', dot: '#6e6a4a', hills: true },
    snow: { sky: ['#a8b4c0', '#e6eaee'], far: '#c4ccd4', mid: '#d8dfe4', ground: '#eef2f5', dot: '#c2cbd2', snow: true },
    tahoe: { sky: ['#6eaee2', '#e6f2f4'], far: '#6f8197', mid: '#2e6fa8', ground: '#c9b98e', dot: '#2f4a32', pines: true, lake: true, snow: true },
    sea: { sky: ['#e89a5a', '#f9e2b0'], far: '#5f7f9a', mid: '#3f6f94', ground: '#c9b98e', dot: '#8a9a55', water: true, lowsun: true },
    river: { sky: ['#e2905a', '#f6dcaa'], far: '#6d7f5a', mid: '#6a5a40', ground: '#5e5038', dot: '#4f6b3a', water: true, lowsun: true },
  };
  const P = () => PAL[region] || (SCENES[region] && SCENES[region].pal) || PAL.plains;

  // Precompute this region's tones (packed colours) and its dithered sky.
  function prepare() {
    const p = P(), h = ART.hex, k = c => ART.pack(c);
    const sky0 = h(p.sky[0]), sky1 = h(p.sky[1]);
    const T = { p, sky: new Uint32Array(W * 104) };
    const sunX = p.night ? 60 : p.lowsun ? 250 : 262, sunY = p.night ? 22 : p.lowsun ? 62 : 26, sunR = p.night ? 7 : p.lowsun ? 14 : 9;
    T.sun = [sunX, sunY, sunR];
    const bands = 9;
    for (let y = 0; y < 104; y++) for (let x = 0; x < W; x++) {
      const v = Math.min(1, y / 96) * (bands - 1), b = Math.floor(v), f = v - b;
      const band = f > ART.bayer(x, y) ? b + 1 : b;
      let c = ART.mix(sky0, sky1, Math.pow(band / (bands - 1), 1.15));
      const d = Math.hypot(x - sunX, (y - sunY) * 1.1);
      if (!p.night && d < sunR * 4) { const glow = Math.max(0, 1 - d / (sunR * 4)); if (glow * .55 > ART.bayer(x + 1, y)) c = ART.add(c, 18); }
      if (d < sunR) c = p.night ? h('#f4f0dc') : p.lowsun ? h('#fff1c0') : h('#fff8dc');
      else if (d < sunR + 1 && !p.night) c = ART.add(c, 30);
      if (p.night && ART.h2(x, y) > .993 && y < 80) c = h('#ffffff');
      T.sky[y * W + x] = k(c);
    }
    const far = h(p.far), mid = h(p.mid), gr = h(p.ground);
    T.farLit = k(ART.add(far, 14)); T.farSh = k(ART.add(far, -12)); T.farHaze = k(ART.mix(far, sky1, .45));
    T.far2Lit = k(ART.add(ART.mix(far, mid, .55), 6)); T.far2Sh = k(ART.add(ART.mix(far, mid, .55), -18));
    T.snowLit = k(h('#f6f8f8')); T.snowSh = k(h('#c8d4dc'));
    T.mid = [k(mid), k(ART.add(mid, -14)), k(ART.add(mid, 12))];
    T.gr = [k(gr), k(ART.add(gr, -12)), k(ART.add(gr, 10)), k(ART.add(gr, -24))];
    T.road = [k(ART.add(gr, -16)), k(ART.add(gr, -30)), k(ART.add(gr, -6))];
    T.water = [k(mid), k(ART.add(mid, 22)), k(ART.add(mid, -16)), k(ART.mix(mid, sky1, .5))];
    T.strata = k(ART.add(far, -28));
    tones = T;
  }

  function background(t) {
    const T = tones, p = T.p;
    buf.set(T.sky.subarray(0, W * 104));
    // far range (mountains, buttes, or low hills)
    if (!p.flat) {
      const farTop = wx => {
        if (p.buttes) { const n = ART.noise(wx * .011 + 3); return 74 - (n > .56 ? 26 : n > .5 ? (n - .5) * 433 : 0) - ART.noise(wx * .2) * 1.5; }
        if (p.snow || p.pines) return 50 + (1 - ART.fbm(wx * .018 + 1)) * 34 - 14;
        return 66 + (1 - ART.fbm(wx * .012 + 7)) * 18;
      };
      for (let x = 0; x < W; x++) {
        const wx = x + offset * .12, raw = farTop(wx), top = Math.round(raw);
        const lit = raw - farTop(wx - 2) > .12; // faces the sun on the right
        const snowLine = 50 + ART.noise(wx * .07) * 7;
        for (let y = Math.max(0, top); y < 104; y++) {
          let c = lit ? T.farLit : T.farSh;
          if (p.snow && y < snowLine) c = lit ? T.snowLit : T.snowSh;
          if (p.buttes && y % 5 === 2 && y < 98 && y > top + 1) c = T.strata;
          if (y > 90 && (y - 90) / 14 > ART.bayer(x, y)) c = T.farHaze;
          buf[y * W + x] = c;
        }
      }
      // a nearer, darker range for the mountains
      if (p.snow || p.pines) {
        const nearTop = wx => 70 + (1 - ART.fbm(wx * .026 + 31)) * 22 - 6;
        for (let x = 0; x < W; x++) {
          const wx = x + offset * .22, raw = nearTop(wx), top = Math.round(raw), lit = raw - nearTop(wx - 2) > .12;
          for (let y = Math.max(0, top); y < 104; y++) buf[y * W + x] = lit ? T.far2Lit : T.far2Sh;
        }
      }
    }
    // water band, or rolling mid hills
    if (p.lake && !p.flat && !p.water) {
      for (let y = 88; y < 104; y++) for (let x = 0; x < W; x++) {
        const s = ART.h2((x + t * (6 + (y - 88))) | 0, y);
        buf[y * W + x] = y === 88 ? T.water[3] : s > .965 ? T.water[1] : s < .05 ? T.water[2] : T.water[0];
      }
    } else if (!p.flat && !p.water) {
      for (let x = 0; x < W; x++) {
        const wx = x + offset * .4, top = Math.round(90 + (1 - ART.fbm(wx * .03 + 13)) * 9 - 3);
        for (let y = top; y < 104; y++) { const s = ART.h2(wx | 0, y); buf[y * W + x] = s < .18 ? T.mid[1] : s > .9 ? T.mid[2] : T.mid[0]; }
      }
    }
    // ground with perspective-scrolled texture, the road, and a darker foreground
    for (let y = p.water ? 92 : 100; y < H; y++) {
      const sp = .55 + (y - 100) / 60 * .9, oy = y * W;
      for (let x = 0; x < W; x++) {
        if (p.flat || (p.water && y >= 92)) {
          const wv = Math.sin(x * .09 + y * .7 - t * 1.6) + Math.sin(x * .031 - t * .7 + y * .2);
          const s = ART.h2((x + t * 8) | 0, y);
          buf[oy + x] = wv > 1.55 ? T.water[1] : wv < -1.4 ? T.water[2] : s > .985 ? T.water[1] : (y > 140 && ART.bayer(x, y) < (y - 140) / 40) ? T.water[2] : T.water[0];
          continue;
        }
        const wx = (x + offset * sp) | 0, s = ART.h2(wx, y);
        let c = s < .1 ? T.gr[1] : s > .93 ? T.gr[2] : T.gr[0];
        if (y >= 121 && y < 129 && !p.noroad && !p.noprops) { c = (y === 122 || y === 126) ? T.road[1] : s > .9 ? T.road[2] : T.road[0]; }
        else if (y > 146 && ART.bayer(x, y) < (y - 146) / 30) c = T.gr[3];
        buf[oy + x] = c;
      }
    }
    g.putImageData(img, 0, 0);
  }

  // scatter props at stable world positions so they scroll with the ground
  function scatter(step, speed, y0, y1, seed, fn) {
    const off = offset * speed, k0 = Math.floor(off / step) - 1, k1 = k0 + Math.ceil(W / step) + 3;
    for (let k = k0; k < k1; k++) { const r = ART.hash(k * 31 + seed); fn(Math.round(k * step + r * step * .8 - off), Math.round(y0 + ART.hash(k * 17 + seed + 5) * (y1 - y0)), ART.hash(k * 7 + seed + 9), k); }
  }
  function clouds(t, p) {
    if (p.night || p.noclouds) return;
    for (let i = 0; i < 4; i++) {
      const x = ((i * 97 + t * (2 + i * .6) - offset * .05) % 400 + 400) % 400 - 50, y = 6 + i * 9 + (i % 2) * 3;
      g.drawImage(ART.cloud(i), Math.round(x), y);
    }
  }
  function props(p, front) {
    const yA = front ? 132 : 102, yB = front ? 156 : 118, sp = front ? 1.1 : .7;
    if (p.flat || p.water || p.noprops || region === 'snow') return;
    if (p.pines) scatter(front ? (region === 'tahoe' ? 140 : 60) : 26, sp, yA, yB, front ? 3 : 4, (x, y, r) => g.drawImage(ART.pine(Math.floor(r * 4)), x, y - 24));
    else if (region === 'desert') scatter(front ? 70 : 34, sp, yA, yB, 5, (x, y, r) => r < .5 ? g.drawImage(ART.rock(Math.floor(r * 6)), x, y - 4) : g.drawImage(ART.sage(Math.floor(r * 9)), x, y - 6));
    else scatter(front ? 38 : 22, sp, yA, yB, front ? 7 : 8, (x, y, r) => r < .15 ? g.drawImage(ART.rock(Math.floor(r * 40)), x, y - 4) : g.drawImage(ART.sage(Math.floor(r * 9)), x, y - 6));
  }

  // set pieces
  const SIGNS = ['SALOON', 'HOTEL', 'ASSAY', 'STORE', 'BANK', 'LIVERY', 'BARBER', 'EXPRESS', 'DRUGS', 'BOOTS'];
  function town(city, t) {
    if (city) {
      // Virginia City: rows of brick and wood climbing Mount Davidson, with mine works above
      for (let r = 2; r >= 0; r--) for (let i = 0; i < 9; i++) {
        const x = -8 + i * 38 + r * 13, base = 120 - r * 15 - Math.round(i * 1.4);
        const s = (i + r * 3) % 3 === 0 ? ART.brick(i + r, r === 0 ? SIGNS[(i + 2) % SIGNS.length] : '') : ART.falseFront(i + r * 2, SIGNS[(i * 3 + r) % SIGNS.length]);
        g.drawImage(s, x, base - s.height);
      }
      headframe(262, 64, t, .8);
    } else {
      for (let i = 0; i < 8; i++) { const s = ART.falseFront(i, SIGNS[i % SIGNS.length], 30 + (i % 3) * 4); g.drawImage(s, 4 + i * 40, 118 - s.height); }
    }
    // boardwalk and hitching rail
    g.fillStyle = '#7a5a3a'; g.fillRect(0, 118, W, 3); g.fillStyle = '#5a3f25'; for (let x = 0; x < W; x += 5) g.fillRect(x, 118, 1, 3);
    if (!city) { g.fillStyle = '#5a3f25'; g.fillRect(120, 124, 30, 1); g.fillRect(122, 124, 1, 6); g.fillRect(147, 124, 1, 6); g.drawImage(ART.horse(-1, '#6e4528'), 124, 110); }
    if (opts.press) { const s = ART.brick(7, 'ENTERPRISE', 46); g.drawImage(s, 262, 120 - s.height); }
    if (opts.sign) signpost(opts.sign);
  }
  function signpost(label) {
    const w = ART.textW(label) + 8;
    g.fillStyle = '#5a3f25'; g.fillRect(14, 136, 2, 16); g.fillRect(12 + w - 4, 136, 2, 16);
    g.fillStyle = '#2a1d12'; g.fillRect(9, 129, w + 2, 11); g.fillStyle = '#c9a27a'; g.fillRect(10, 130, w, 9);
    ART.text(g, label, 14, 132, '#3a2616');
  }
  function station() {
    const s = ART.cabin(1); g.drawImage(s, 24, 118 - s.height);
    g.fillStyle = '#5a3f25'; for (let x = 74; x < 140; x += 8) g.fillRect(x, 106, 2, 12); g.fillRect(74, 108, 66, 1); g.fillRect(74, 113, 66, 1);
    g.fillStyle = '#efe3c4'; g.fillRect(30, 93, 33, 7); ART.text(g, 'STAGE', 36, 94, '#7a2218');
    smoke(60, 86, '#d8d4cc');
  }
  function smoke(x, y, col) {
    const t = (performance.now() - t0) / 1000;
    for (let i = 0; i < 6; i++) { const a = (t * .4 + i / 6) % 1; g.fillStyle = col; g.globalAlpha = (1 - a) * .7; g.beginPath(); g.arc(x + a * 10 + Math.sin(a * 6 + i) * 2, y - a * 26, 1.5 + a * 4, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }
  function headframe(x, y, t, s = 1) {
    g.fillStyle = '#4a3520';
    ART.pline(g, x, y + 44 * s, x + 12 * s, y, '#4a3520'); ART.pline(g, x + 24 * s, y + 44 * s, x + 12 * s, y, '#4a3520');
    ART.pline(g, x + 4 * s, y + 30 * s, x + 20 * s, y + 30 * s, '#4a3520'); ART.pline(g, x + 7 * s, y + 18 * s, x + 17 * s, y + 18 * s, '#4a3520');
    const r = Math.round(5 * s); ART.pring(g, x + 12 * s, y, r, '#2a1d12');
    for (let k = 0; k < 4; k++) { const a = t * 2 + k * Math.PI / 2; ART.pline(g, x + 12 * s, y, x + 12 * s + Math.cos(a) * r, y + Math.sin(a) * r, '#2a1d12'); }
    ART.pline(g, x + 12 * s + r, y, x + 12 * s + r, y + 44 * s, '#6a5a4a');
  }
  function mine(t) {
    // hillside with a timbered tunnel, tailings, a headframe, an ore cart
    g.fillStyle = '#7a6448'; g.beginPath(); g.moveTo(0, 118); g.lineTo(0, 70); g.quadraticCurveTo(50, 56, 110, 82); g.lineTo(130, 118); g.fill();
    g.fillStyle = '#8c7454'; g.beginPath(); g.moveTo(0, 118); g.lineTo(0, 80); g.quadraticCurveTo(40, 70, 96, 92); g.lineTo(112, 118); g.fill();
    g.fillStyle = '#1b130d'; g.fillRect(40, 96, 14, 22); g.fillStyle = '#5a3f25'; g.fillRect(37, 93, 20, 3); g.fillRect(37, 96, 3, 22); g.fillRect(54, 96, 3, 22);
    g.fillStyle = '#a89878'; g.beginPath(); g.moveTo(110, 118); g.lineTo(150, 98); g.lineTo(196, 118); g.fill();
    for (let i = 0; i < 30; i++) { g.fillStyle = i % 3 ? '#988868' : '#b8a888'; g.fillRect(118 + (i * 23) % 70, 104 + (i * 7) % 13, 2, 1); }
    g.fillStyle = '#3a2616'; g.fillRect(56, 116, 70, 1); for (let x = 58; x < 126; x += 5) g.fillRect(x, 117, 2, 1);
    const cx = 64 + ((t * 8) % 50); g.fillStyle = '#5a4a3a'; g.fillRect(cx, 108, 12, 7); g.fillStyle = '#8a7a6a'; g.fillRect(cx, 106, 12, 2);
    ART.pring(g, cx + 3, 116, 1, '#2a1d12'); ART.pring(g, cx + 9, 116, 1, '#2a1d12');
    headframe(214, 64, t);
    // the miner and his pick
    const sw = Math.sin(t * 5) > 0;
    g.fillStyle = '#3a4a6a'; g.fillRect(150, 122, 5, 8); g.fillStyle = '#e0c08a'; g.fillRect(150, 118, 5, 4); g.fillStyle = '#5a3f25'; g.fillRect(149, 116, 7, 2);
    ART.pline(g, 154, 124, sw ? 160 : 159, sw ? 116 : 126, '#2a1d12'); ART.pline(g, sw ? 157 : 157, sw ? 114 : 125, sw ? 162 : 161, sw ? 118 : 128, '#6a6a6a');
    if (opts.cabin) { const s = ART.cabin(0); g.drawImage(s, 250, 118 - s.height); smoke(286, 86, '#d8d4cc'); }
  }
  function zephyr(t) {
    for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(200,180,140,${.25 + (i % 3) * .1})`; g.fillRect(((i * 47 + t * (140 + i % 5 * 30)) % 360) - 20, 50 + (i * 11) % 100, 8 + i % 7, 1); }
    const things = [['#3a2a1a', 6, 4], ['#8a6a4a', 7, 2], ['#e0d8c8', 5, 5], ['#5a5a5a', 4, 3]];
    things.forEach(([c, w, h], i) => { const x = ((t * (110 + i * 25) + i * 90) % 380) - 30, y = 60 + i * 14 + Math.sin(t * 3 + i) * 10; g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(Math.round(t * 4 + i) * Math.PI / 4); g.fillStyle = c; g.fillRect(-w / 2, -h / 2, w, h); g.restore(); });
  }

  function draw(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const moving = now < rollUntil || (opts.coach && typeof S !== 'undefined' && S && S.act === 'end');
    if (moving) offset += dt * 60;
    if (!tones) prepare();
    const p = tones.p, t = (now - t0) / 1000, X = SCENES[region];
    background(t);
    clouds(t, p);
    if (region === 'river') { const s = ART.steamboat(); g.drawImage(s, 104, 46); g.globalAlpha = .25; g.save(); g.scale(1, -1); g.drawImage(s, 104, -142); g.restore(); g.globalAlpha = 1; for (let i = 0; i < 6; i++) { const a = (t * .5 + i / 6) % 1; g.fillStyle = `rgba(70,60,50,${(1 - a) * .6})`; g.beginPath(); g.arc(138 + i % 2 * 8 + a * 22, 44 - a * 30, 2 + a * 5, 0, 7); g.fill(); } }
    if (region === 'sea') { const s = ART.ship(0); g.drawImage(s, 196, 46 + Math.round(Math.sin(t * 1.2))); }
    props(p, false);
    if (region === 'town' || region === 'city') town(region === 'city', t);
    if (region === 'mine') mine(t);
    if (opts.station) station();
    if (X && X.draw) X.draw(g, t, (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }, opts, moving, offset);
    if (opts.pony) ART.rider(g, ((t * 150) % 440) - 60, 116, t);
    if (opts.coach) ART.coach(g, 104, 128, t, moving);
    props(p, true);
    if (region === 'snow') for (let i = 0; i < 160; i++) { g.fillStyle = i % 4 ? 'rgba(255,255,255,.9)' : 'rgba(220,228,236,.9)'; g.fillRect(((i * 61 + t * 30 * (1 + i % 3)) % W), ((i * 37 + t * 40 * (1 + i % 2)) % H), 1 + i % 2, 1 + i % 2); }
    if (p.haze && moving) for (let i = 0; i < 24; i++) { g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(((i * 41 + t * 60) % W), 108 + (i * 7) % 40, 7, 1); }
    if (opts.wind) zephyr(t);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(n => { last = n; draw(n); });
  return {
    set(r, o) { if (r !== region) tones = null; region = r; opts = o || {}; },
    roll(ms) { rollUntil = performance.now() + ms; if (typeof sfx === 'function') sfx('clop', ms); },
  };
})();
