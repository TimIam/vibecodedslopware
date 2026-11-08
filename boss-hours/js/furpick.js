// The fur colour picker in the store: a hue ring around a triangle, drawn at 72 px and shown three times bigger so it
// stays pixel art. The triangle's corners are the pure hue (top), white (bottom left) and black (bottom right); any
// point in it is a mix of the three, which reaches every colour of that hue.

const N = 72, C = N / 2, R1 = 35, R0 = 28, TR = 25;
const TAU = Math.PI * 2;
const INK = [20, 16, 12];

// corners: hue at the top, white bottom-left, black bottom-right
const CORNER = [-90, 150, 30].map(d => [C + Math.cos(d * Math.PI / 180) * TR, C + Math.sin(d * Math.PI / 180) * TR]);

function hueRgb(h) {
  const x = 1 - Math.abs((h / 60) % 2 - 1);
  const [r, g, b] = h < 60 ? [1, x, 0] : h < 120 ? [x, 1, 0] : h < 180 ? [0, 1, x] : h < 240 ? [0, x, 1] : h < 300 ? [x, 0, 1] : [1, 0, x];
  return [r, g, b];
}

// barycentric weights of (x, y) for the hue, white and black corners
function bary(x, y) {
  const [[x1, y1], [x2, y2], [x3, y3]] = CORNER;
  const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  const a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d;
  const w = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d;
  return [a, w, 1 - a - w];
}

export function createFurPicker(cv, onPick) {
  const ctx = cv.getContext('2d');
  cv.width = N; cv.height = N;
  let h = 21, a = 0.24, w = 0.15, drag = null;   // natural brown

  const mix = (a, w) => hueRgb(h).map(c => Math.round((a * c + w) * 255));
  const hex = () => '#' + mix(a, w).map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

  function draw() {
    const img = ctx.createImageData(N, N), d = img.data;
    const put = (x, y, [r, g, b]) => { const i = (y * N + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - C, dy = y + 0.5 - C, r = Math.hypot(dx, dy);
      if (r >= R0 && r < R1) {
        // the ring, in 48 steps so it reads as pixel art; inked at its edges
        const hh = Math.floor(((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360) / 7.5) * 7.5;
        put(x, y, r < R0 + 1 || r >= R1 - 1 ? INK : hueRgb(hh).map(c => Math.round(c * 255)));
        continue;
      }
      const [ba, bw, bk] = bary(x + 0.5, y + 0.5);
      if (ba < -0.02 || bw < -0.02 || bk < -0.02) continue;
      if (ba < 0.03 || bw < 0.03 || bk < 0.03) { put(x, y, INK); continue; }
      // quantised to 12 steps each way, a little dithered
      const q = v => Math.round(v * 12 + ((x + y) % 2 ? 0.25 : -0.25)) / 12;
      put(x, y, mix(Math.max(0, q(ba)), Math.max(0, q(bw))));
    }
    ctx.putImageData(img, 0, 0);
    // markers: a notch on the ring, a hollow square in the triangle
    const ang = (h - 90) * Math.PI / 180, mr = (R0 + R1) / 2;
    box(Math.round(C + Math.cos(ang) * mr), Math.round(C + Math.sin(ang) * mr), 2);
    const [x1, y1] = CORNER[0], [x2, y2] = CORNER[1], [x3, y3] = CORNER[2], k = 1 - a - w;
    box(Math.round(a * x1 + w * x2 + k * x3), Math.round(a * y1 + w * y2 + k * y3), 2);
  }
  function box(x, y, s) {
    ctx.fillStyle = '#14100c'; ctx.fillRect(x - s - 1, y - s - 1, s * 2 + 3, s * 2 + 3);
    ctx.fillStyle = '#f4ecd2'; ctx.fillRect(x - s, y - s, s * 2 + 1, s * 2 + 1);
    ctx.fillStyle = '#14100c'; ctx.fillRect(x - s + 1, y - s + 1, s * 2 - 1, s * 2 - 1);
  }

  function at(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * N, (e.clientY - r.top) / r.height * N];
  }
  function apply(x, y) {
    if (drag === 'ring') h = ((Math.atan2(y - C, x - C) * 180 / Math.PI + 90) % 360 + 360) % 360;
    else {
      let [ba, bw, bk] = bary(x, y);
      ba = Math.max(0, ba); bw = Math.max(0, bw); bk = Math.max(0, bk);
      const s = ba + bw + bk; a = ba / s; w = bw / s;
    }
    draw();
    onPick(hex());
  }
  cv.addEventListener('pointerdown', e => {
    const [x, y] = at(e), r = Math.hypot(x - C, y - C);
    drag = r >= R0 - 2 ? 'ring' : 'tri';
    cv.setPointerCapture(e.pointerId);
    apply(x, y);
  });
  cv.addEventListener('pointermove', e => { if (drag) apply(...at(e)); });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('pointercancel', () => { drag = null; });

  // show a colour without reporting it: max - min of the channels is the hue's share, min is the white's
  function set(col) {
    const n = parseInt((col || '#633b25').slice(1), 16), rgb = [n >> 16, n >> 8 & 255, n & 255].map(v => v / 255);
    const mx = Math.max(...rgb), mn = Math.min(...rgb);
    a = mx - mn; w = mn;
    if (a > 0.01) {
      const [r, g, b] = rgb, dd = mx - mn;
      const hh = mx === r ? ((g - b) / dd + 6) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      h = hh * 60;
    }
    draw();
  }
  draw();
  return { set, get value() { return hex(); } };
}
