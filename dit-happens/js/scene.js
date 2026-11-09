// The harbor at night, on Canvas 2D. Depth runs z = 0 at the horizon to z = 1 at
// the viewer. Sea layers paint back to front and ships, reef and cliff slot in
// between them. Rock, sky and moon are painted once per resize and reused.

import { clamp, lerp } from "./morse.js";

const LAYERS = 22;
const REEF_Z = 0.64;
const CLIFF_Z = 0.8;
const TAU = Math.PI * 2;

const LAMP_WARM = "255,226,160";
const LAMP_GREEN = "150,255,190";

function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(",")})`;
};
const ease = t => t * t * (3 - 2 * t);

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function sprite(w, h, dpr, paint) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  paint(ctx);
  c.logicalW = w;
  c.logicalH = h;
  return c;
}

/** Fill an outline as faceted rock lit by the moon from the upper right. */
function paintRock(ctx, pts, rng, { base, dark, rim }, size) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  ctx.save();
  poly(ctx, pts);
  const g = ctx.createLinearGradient(x1, y0, x0, y1);
  g.addColorStop(0, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const facets = Math.floor(((x1 - x0) * (y1 - y0)) / (size * size * 0.5));
  for (let i = 0; i < facets; i++) {
    const x = lerp(x0, x1, rng()), y = lerp(y0, y1, rng());
    const r = size * (0.5 + rng() * 1.5);
    const a = rng() * TAU;
    poly(ctx, [
      [x + Math.cos(a) * r, y + Math.sin(a) * r],
      [x + Math.cos(a + 2.1) * r * 0.8, y + Math.sin(a + 2.1) * r * 0.8],
      [x + Math.cos(a + 4.2) * r * 0.9, y + Math.sin(a + 4.2) * r * 0.9],
    ]);
    ctx.fillStyle = rng() < 0.6 ? `rgba(0,6,14,${0.08 + rng() * 0.2})` : `rgba(120,160,190,${0.03 + rng() * 0.07})`;
    ctx.fill();
  }
  ctx.restore();
  ctx.lineCap = "round";
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const nx = by - ay, ny = ax - bx, len = Math.hypot(nx, ny) || 1;
    const lit = (nx / len) * 0.6 + (ny / len) * -0.8;
    if (lit <= 0.1 || ay >= y1 - 1 || by >= y1 - 1) continue;
    ctx.strokeStyle = `rgba(${rim},${0.15 + lit * 0.5})`;
    ctx.lineWidth = Math.max(0.8, size * 0.09);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
}

// ---- Ships. Local units: bow to the left, waterline at y = 0. -------------

function drawWindows(ctx, list, color) {
  ctx.fillStyle = color;
  for (const [x, y, w, h] of list) ctx.fillRect(x, y, w, h);
}

function funnel(ctx, x, top, bottom, w, colors) {
  poly(ctx, [[x, bottom], [x + 3, top], [x + w + 3, top], [x + w, bottom]]);
  ctx.fillStyle = colors.funnel;
  ctx.fill();
  ctx.fillStyle = colors.band;
  ctx.fillRect(x + 1.5, top + 4, w, 5);
}

function mast(ctx, x, top, bottom, colors) {
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, bottom);
  ctx.lineTo(x, top);
  ctx.stroke();
}

function rimLine(ctx, pts, colors) {
  ctx.strokeStyle = colors.rim;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

const SHIPS = {
  trawler: {
    tons: 180, width: 110, lamp: [-10, -68], smoke: [18, -48],
    draw(ctx, c) {
      mast(ctx, -10, -66, -16, c);
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10, -60); ctx.lineTo(-52, -20);
      ctx.moveTo(-10, -60); ctx.lineTo(44, -15);
      ctx.moveTo(-10, -30); ctx.lineTo(-40, -46);
      ctx.stroke();
      ctx.fillStyle = c.deck;
      ctx.fillRect(8, -42, 26, 28);
      funnel(ctx, 14, -50, -40, 8, c);
      drawWindows(ctx, [[11, -37, 6, 7], [20, -37, 6, 7]], c.window);
      poly(ctx, [[-58, -22], [-30, -14], [46, -14], [52, -20], [50, 12], [-46, 12]]);
      ctx.fillStyle = c.hull;
      ctx.fill();
      rimLine(ctx, [[-58, -22], [-30, -14], [46, -14], [52, -20]], c);
    },
  },
  steamer: {
    tons: 2400, width: 180, lamp: [-66, -88], smoke: [32, -80],
    draw(ctx, c) {
      mast(ctx, -66, -86, -20, c);
      mast(ctx, 68, -74, -20, c);
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-66, -82); ctx.lineTo(68, -70);
      ctx.moveTo(-66, -80); ctx.lineTo(-92, -24);
      ctx.moveTo(68, -70); ctx.lineTo(82, -20);
      ctx.stroke();
      funnel(ctx, 22, -78, -42, 16, c);
      ctx.fillStyle = c.deck;
      ctx.fillRect(-32, -44, 86, 26);
      ctx.fillRect(-24, -58, 30, 15);
      drawWindows(ctx, [[-20, -54, 22, 5]], c.window);
      drawWindows(ctx, [-26, -14, -2, 10, 22, 34, 46].map(x => [x - 2, -36, 5, 6]), c.window);
      poly(ctx, [[-96, -26], [-62, -18], [76, -18], [88, -24], [84, 12], [-80, 12]]);
      ctx.fillStyle = c.hull;
      ctx.fill();
      rimLine(ctx, [[-96, -26], [-62, -18], [76, -18], [88, -24]], c);
    },
  },
  ketch: {
    tons: 12, width: 90, lamp: [-2, -100], smoke: null,
    draw(ctx, c) {
      mast(ctx, -2, -98, -8, c);
      mast(ctx, 28, -62, -8, c);
      poly(ctx, [[1, -94], [1, -14], [25, -14]]);
      ctx.fillStyle = c.sail;
      ctx.fill();
      poly(ctx, [[-5, -92], [-5, -13], [-44, -12]]);
      ctx.fillStyle = c.sailDark;
      ctx.fill();
      poly(ctx, [[31, -58], [31, -14], [52, -14]]);
      ctx.fillStyle = c.sailDark;
      ctx.fill();
      poly(ctx, [[-50, -12], [-20, -8], [40, -8], [46, -12], [38, 10], [-38, 10]]);
      ctx.fillStyle = c.hull;
      ctx.fill();
      rimLine(ctx, [[-50, -12], [-20, -8], [40, -8], [46, -12]], c);
    },
  },
  tug: {
    tons: 320, width: 86, lamp: [-10, -64], smoke: [10, -70],
    draw(ctx, c) {
      mast(ctx, -10, -62, -36, c);
      ctx.fillStyle = c.deck;
      ctx.fillRect(-18, -36, 42, 22);
      funnel(ctx, 4, -68, -36, 13, c);
      drawWindows(ctx, [[-14, -31, 7, 7], [-4, -31, 7, 7], [12, -28, 6, 5]], c.window);
      poly(ctx, [[-46, -24], [-26, -14], [34, -14], [42, -18], [40, 12], [-36, 12]]);
      ctx.fillStyle = c.hull;
      ctx.fill();
      ctx.fillStyle = c.rim;
      ctx.fillRect(-30, -11, 62, 2);
      rimLine(ctx, [[-46, -24], [-26, -14], [34, -14], [42, -18]], c);
    },
  },
  liner: {
    tons: 18000, width: 262, lamp: [-98, -104], smoke: [20, -100],
    draw(ctx, c) {
      mast(ctx, -98, -102, -30, c);
      mast(ctx, 100, -92, -30, c);
      funnel(ctx, -18, -96, -60, 20, c);
      funnel(ctx, 30, -96, -60, 20, c);
      ctx.fillStyle = c.deck;
      ctx.fillRect(-70, -44, 160, 20);
      ctx.fillRect(-56, -62, 128, 18);
      ctx.fillRect(-52, -74, 30, 12);
      const rows = [];
      for (let x = -66; x < 86; x += 8.5) rows.push([x, -38, 4.5, 5]);
      for (let x = -50; x < 66; x += 8.5) rows.push([x, -56, 4.5, 5]);
      rows.push([-48, -70, 22, 4]);
      drawWindows(ctx, rows, c.window);
      poly(ctx, [[-136, -34], [-100, -24], [112, -24], [126, -30], [122, 12], [-114, 12]]);
      ctx.fillStyle = c.hull;
      ctx.fill();
      const low = [];
      for (let x = -92; x < 108; x += 11) low.push([x, -15, 3, 3]);
      drawWindows(ctx, low, c.window);
      rimLine(ctx, [[-136, -34], [-100, -24], [112, -24], [126, -30]], c);
    },
  },
};

export const SHIP_KINDS = Object.fromEntries(Object.entries(SHIPS).map(([k, v]) => [k, v.tons]));

function shipColors(z) {
  const f = clamp(1 - z / 0.42, 0, 1) * 0.4; // distance haze, kept light so far ships still read
  const fog = "#3a5d78";
  return {
    hull: mix("#0a1119", fog, f),
    deck: mix("#222c36", fog, f),
    funnel: mix("#1a1412", fog, f),
    band: mix("#a2452f", fog, f),
    line: mix("#39424d", fog, f),
    sail: mix("#aebfcc", fog, f),
    sailDark: mix("#7f93a4", fog, f),
    rim: `rgba(165,205,235,${0.6 - f * 0.4})`,
    window: `rgba(255,205,120,${0.95 - f * 0.55})`,
  };
}

// ---- The scene. -----------------------------------------------------------

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ships = [];
    this.particles = [];
    this.weather = 0;
    this.keyLamp = false;
    this.shake = 0;
    this.time = 0;
    this.focus = null;
    this.focusUntil = 0;
    this.calmMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.drops = Array.from({ length: 460 }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.8]);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    this.dpr = Math.min(devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.U = Math.min(W / 1000, H / 520);
    this.horizon = H * 0.42;
    this.buildStatics();
  }

  depthY(z) {
    return this.horizon + (this.H * 1.1 - this.horizon) * Math.pow(z, 1.7);
  }

  surf(x, z) {
    const { U, time: t } = this;
    const amp = U * (0.8 + 13 * z) * (0.75 + this.weather * 0.6);
    const k = 1 / (U * (10 + 95 * z));
    return amp * (
      Math.sin(x * k + t * 0.9 + z * 31) * 0.55 +
      Math.sin(x * k * 2.3 - t * 0.6 + z * 17) * 0.28 +
      Math.sin(x * k * 5.1 + t * 1.5 - z * 43) * 0.12
    );
  }

  layerColor(z) {
    return mix("#2c5a78", "#04101a", Math.pow(z, 0.62));
  }

  buildStatics() {
    const { W, H, U, dpr, horizon } = this;
    const rng = mulberry(77031);

    const sky = sprite(W, Math.ceil(horizon + 4), dpr, c => {
      const g = c.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, "#040915");
      g.addColorStop(0.55, "#0c2036");
      g.addColorStop(0.86, "#23475f");
      g.addColorStop(1, "#4a7a8f");
      c.fillStyle = g;
      c.fillRect(0, 0, W, horizon + 4);
    });
    this.skySprite = sky;

    this.stars = Array.from({ length: 170 }, () => ({
      x: rng() * W, y: Math.pow(rng(), 1.5) * horizon * 0.9, r: 0.5 + rng() * 1.1, p: rng() * TAU,
    }));

    const moonR = 36 * U;
    const halo = moonR * 6;
    this.moonPos = [W * 0.66, H * 0.17];
    this.moon = sprite(halo * 2, halo * 2, dpr, c => {
      const g = c.createRadialGradient(halo, halo, moonR * 0.8, halo, halo, halo);
      g.addColorStop(0, "rgba(190,215,235,.33)");
      g.addColorStop(0.3, "rgba(150,190,220,.1)");
      g.addColorStop(1, "rgba(120,170,210,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, halo * 2, halo * 2);
      const d = c.createRadialGradient(halo + moonR * 0.3, halo - moonR * 0.3, moonR * 0.2, halo, halo, moonR);
      d.addColorStop(0, "#f6f3df");
      d.addColorStop(1, "#c3cdd0");
      c.fillStyle = d;
      c.beginPath();
      c.arc(halo, halo, moonR, 0, TAU);
      c.fill();
      c.fillStyle = "rgba(120,135,150,.28)";
      for (const [dx, dy, r] of [[-0.35, -0.2, 0.22], [0.25, 0.35, 0.28], [0.3, -0.4, 0.13], [-0.2, 0.5, 0.12], [-0.55, 0.3, 0.1]]) {
        c.beginPath();
        c.arc(halo + dx * moonR, halo + dy * moonR, r * moonR, 0, TAU);
        c.fill();
      }
    });

    this.clouds = Array.from({ length: 3 }, (_, n) => {
      const w = (380 + n * 110) * U, h = 110 * U;
      return sprite(w, h, dpr, c => {
        for (let i = 0; i < 70; i++) {
          const t = rng();
          const x = lerp(w * 0.08, w * 0.92, t);
          const fall = Math.sin(t * Math.PI);
          const y = h * 0.62 - rng() * h * 0.3 * fall;
          const r = (12 + rng() * 30) * U * (0.4 + fall * 0.7);
          const g = c.createRadialGradient(x, y, 0, x, y, r);
          const shade = y < h * 0.45 ? "96,130,158" : "32,54,76";
          g.addColorStop(0, `rgba(${shade},.3)`);
          g.addColorStop(1, `rgba(${shade},0)`);
          c.fillStyle = g;
          c.fillRect(x - r, y - r, r * 2, r * 2);
        }
      });
    });
    this.cloudBank = Array.from({ length: 7 }, (_, i) => ({
      sprite: i % 3, x: rng() * W * 1.4, y: rng() * horizon * 0.55, v: (3 + rng() * 6) * U,
    }));

    this.fog = sprite(W, 70 * U, dpr, c => {
      const g = c.createLinearGradient(0, 0, 0, 70 * U);
      g.addColorStop(0, "rgba(110,150,175,0)");
      g.addColorStop(0.5, "rgba(120,160,185,.2)");
      g.addColorStop(1, "rgba(110,150,175,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, W, 70 * U);
    });

    this.vignette = sprite(W, H, 0.5, c => {
      const g = c.createRadialGradient(W * 0.55, H * 0.45, Math.min(W, H) * 0.35, W * 0.55, H * 0.45, Math.max(W, H) * 0.8);
      g.addColorStop(0, "rgba(0,4,12,0)");
      g.addColorStop(1, "rgba(0,4,12,.62)");
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    });

    this.buildReef(rng);
    this.buildCliff(rng);
  }

  buildReef(rng) {
    const { U, dpr, W } = this;
    const w = 210 * U, h = 96 * U;
    const peaks = [[0, h], [w * 0.05, h * 0.68], [w * 0.11, h * 0.76], [w * 0.2, h * 0.3], [w * 0.28, h * 0.52], [w * 0.36, h * 0.12], [w * 0.45, h * 0.46], [w * 0.52, h * 0.34], [w * 0.61, h * 0.64], [w * 0.7, h * 0.26], [w * 0.8, h * 0.62], [w * 0.88, h * 0.52], [w * 0.96, h * 0.82], [w, h]];
    this.reef = sprite(w, h, dpr, c => paintRock(c, peaks, rng, { base: "#2a3c4c", dark: "#070e15", rim: "170,205,230" }, 17 * U));
    this.reefX = W * 0.44 - w / 2;
  }

  buildCliff(rng) {
    const { U, dpr, H, W } = this;
    const w = Math.min(W, 430 * U);
    const base = this.depthY(CLIFF_Z);
    const top = base - 180 * U;
    const towerX = 118 * U;
    const towerH = 212 * U;
    const towerBase = top + 8 * U;
    const towerTop = towerBase - towerH;
    const lanternY = towerTop - 26 * U;
    const spriteTop = lanternY - 60 * U;
    const offset = spriteTop;
    this.cliffOffset = offset;
    this.lampPos = [towerX, lanternY];

    this.cliff = sprite(w, H - offset + 20, dpr, c => {
      c.translate(0, -offset);

      // Keeper's cottage, behind the tower.
      const cx = 34 * U, cy = top + 2 * U;
      c.fillStyle = "#26303a";
      c.fillRect(cx, cy - 34 * U, 58 * U, 36 * U);
      poly(c, [[cx - 6 * U, cy - 34 * U], [cx + 29 * U, cy - 58 * U], [cx + 64 * U, cy - 34 * U]]);
      c.fillStyle = "#151c24";
      c.fill();
      c.fillStyle = "#1a212a";
      c.fillRect(cx + 42 * U, cy - 62 * U, 9 * U, 22 * U);
      this.chimney = [cx + 46.5 * U, cy - 64 * U + 0];
      c.fillStyle = "#ffcf85";
      c.fillRect(cx + 11 * U, cy - 25 * U, 12 * U, 13 * U);
      c.fillStyle = "#26303a";
      c.fillRect(cx + 16.5 * U, cy - 25 * U, 1.3 * U, 13 * U);

      // Tower: tapered, banded, lit from the moon side.
      const bw = 27 * U, tw = 17 * U;
      const tower = (y0, y1) => {
        const f = y => (y - towerTop) / towerH;
        const hw = y => lerp(tw, bw, f(y));
        return [[towerX - hw(y1), y1], [towerX - hw(y0), y0], [towerX + hw(y0), y0], [towerX + hw(y1), y1]];
      };
      c.save();
      poly(c, tower(towerTop, towerBase));
      c.clip();
      const bands = 6;
      for (let i = 0; i < bands; i++) {
        c.fillStyle = i % 2 ? "#a23c30" : "#d9d3bf";
        c.fillRect(towerX - bw, towerTop + (towerH / bands) * i, bw * 2, towerH / bands + 1);
      }
      const shade = c.createLinearGradient(towerX - bw, 0, towerX + bw, 0);
      shade.addColorStop(0, "rgba(3,9,20,.93)");
      shade.addColorStop(0.55, "rgba(3,9,20,.6)");
      shade.addColorStop(0.92, "rgba(50,90,130,.12)");
      shade.addColorStop(1, "rgba(180,215,240,.3)");
      c.fillStyle = shade;
      c.fillRect(towerX - bw, towerTop, bw * 2, towerH);
      c.restore();
      for (const f of [0.28, 0.58]) {
        c.fillStyle = "#ffcf85";
        c.fillRect(towerX + 1 * U, towerTop + towerH * f, 6 * U, 11 * U);
      }

      // Gallery, lantern glass and roof.
      c.fillStyle = "#10161d";
      c.fillRect(towerX - 25 * U, towerTop - 4 * U, 50 * U, 7 * U);
      c.strokeStyle = "#39454f";
      c.lineWidth = 1.1 * U;
      c.beginPath();
      c.moveTo(towerX - 25 * U, towerTop - 15 * U);
      c.lineTo(towerX + 25 * U, towerTop - 15 * U);
      for (let x = -25; x <= 25; x += 8.33) {
        c.moveTo(towerX + x * U, towerTop - 15 * U);
        c.lineTo(towerX + x * U, towerTop - 4 * U);
      }
      c.stroke();
      c.fillStyle = "rgba(255,226,160,.92)";
      c.fillRect(towerX - 13 * U, lanternY - 16 * U, 26 * U, 37 * U);
      c.fillStyle = "#1a222b";
      for (const x of [-13, -5, 3.5, 11.5]) c.fillRect(towerX + x * U, lanternY - 16 * U, 1.6 * U, 37 * U);
      poly(c, [[towerX - 17 * U, lanternY - 16 * U], [towerX, lanternY - 37 * U], [towerX + 17 * U, lanternY - 16 * U]]);
      c.fillStyle = "#141b23";
      c.fill();
      c.fillRect(towerX - 1 * U, lanternY - 46 * U, 2 * U, 10 * U);

      // The headland.
      const rock = [[0, top - 6 * U], [40 * U, top - 2 * U], [96 * U, top + 3 * U], [150 * U, top + 3 * U], [186 * U, top + 16 * U], [206 * U, top + 11 * U], [232 * U, top + 52 * U], [260 * U, top + 66 * U], [282 * U, top + 118 * U], [324 * U, top + 150 * U], [346 * U, H - offset + top + 400], [0, H - offset + top + 400]];
      paintRock(c, rock, rng, { base: "#33485a", dark: "#080f17", rim: "185,215,238" }, 19 * U);
      c.fillStyle = "rgba(38,60,44,.55)";
      for (let i = 0; i < 44; i++) {
        const x = rng() * 180 * U;
        c.beginPath();
        c.ellipse(x, top + (x > 96 * U ? 3 : -2) * U + rng() * 4 * U, (4 + rng() * 9) * U, (1 + rng() * 2) * U, 0, 0, TAU);
        c.fill();
      }
    });
  }

  // ---- Ships ---------------------------------------------------------------

  spawn(kind) {
    const ship = {
      kind, spec: SHIPS[kind], p: 0, lamp: false, lampColor: LAMP_WARM,
      state: "sail", age: 0, stateAge: 0, x: this.pathX(0), z: this.pathZ(0), tilt: 0, sink: 0, alpha: 0,
    };
    this.ships.push(ship);
    return ship;
  }

  pathX(p) { return this.W * (0.93 - 0.42 * p); }
  pathZ(p) { return lerp(0.14, REEF_Z - 0.02, Math.pow(p, 1.1)); }

  saved(ship) {
    if (!ship) return;
    ship.state = "saved";
    ship.stateAge = 0;
    ship.from = [ship.x, ship.z];
    ship.lamp = true;
    ship.lampColor = LAMP_GREEN;
    this.focus = ship;
    this.focusUntil = this.time + 1.7;
  }

  wrecked(ship) {
    if (!ship) return;
    ship.state = "wreck";
    ship.stateAge = 0;
    ship.from = [ship.x, ship.z];
    ship.lamp = false;
    ship.impacted = false;
  }

  updateShip(ship, dt) {
    ship.age += dt;
    ship.stateAge += dt;
    ship.alpha = Math.min(1, ship.age / 0.6);
    if (ship.state === "sail") {
      const k = 1 - Math.exp(-dt * 7);
      ship.x += (this.pathX(ship.p) - ship.x) * k;
      ship.z += (this.pathZ(ship.p) - ship.z) * k;
    } else if (ship.state === "saved") {
      const t = ease(clamp(ship.stateAge / 3.2, 0, 1));
      ship.x = lerp(ship.from[0], this.W * 0.06, t);
      ship.z = lerp(ship.from[1], Math.min(ship.from[1], 0.36), t);
      if (ship.stateAge > 3.4) ship.dead = true;
    } else if (ship.state === "wreck") {
      const hit = 0.42;
      const t = ease(clamp(ship.stateAge / hit, 0, 1));
      ship.x = lerp(ship.from[0], this.reefX + this.reef.logicalW * 0.74, t);
      ship.z = lerp(ship.from[1], REEF_Z - 0.015, t);
      if (ship.stateAge >= hit && !ship.impacted) {
        ship.impacted = true;
        if (!this.calmMotion) this.shake = 1;
        this.burst(ship);
      }
      if (ship.impacted) {
        const s = clamp((ship.stateAge - hit) / 2.4, 0, 1);
        ship.tilt = ease(Math.min(1, s * 3)) * 0.2 + s * s * 0.5;
        ship.sink = s * s;
        ship.fade = clamp((s - 0.72) / 0.28, 0, 1);
      }
      if (ship.stateAge > hit + 2.6) ship.dead = true;
    }
    if (ship.spec.smoke && ship.state !== "wreck" && Math.random() < dt * 9) this.puff(ship);
    if (ship.state === "wreck" && ship.impacted && !ship.fade && Math.random() < dt * 22) this.puff(ship, true);
  }

  shipScale(z) { return this.U * (0.16 + 1.25 * z); }

  shipY(ship) { return this.depthY(ship.z) + this.surf(ship.x, ship.z); }

  shipPoint(ship, lx, ly) {
    const s = this.shipScale(ship.z);
    const tilt = ship.tilt + this.shipPitch(ship);
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    return [ship.x + (lx * cos - ly * sin) * s, this.shipY(ship) + (lx * sin + ly * cos) * s + (ship.sink || 0) * 70 * s];
  }

  shipPitch(ship) {
    const s = this.shipScale(ship.z);
    const reach = ship.spec.width * s * 0.3;
    return Math.atan2(this.surf(ship.x + reach, ship.z) - this.surf(ship.x - reach, ship.z), reach * 2) * 0.7;
  }

  puff(ship, heavy) {
    if (this.particles.length > 220) return;
    const [lx, ly] = heavy ? [10, -30] : ship.spec.smoke;
    const [x, y] = this.shipPoint(ship, lx, ly);
    const s = this.shipScale(ship.z);
    this.particles.push({ type: "smoke", x, y, vx: (8 + Math.random() * 10) * this.U, vy: -(9 + Math.random() * 7) * this.U, r: (heavy ? 12 : 6) * s, life: 0, max: heavy ? 2.6 : 2.1, a: heavy ? 0.42 : 0.26 });
  }

  burst(ship) {
    const s = this.shipScale(ship.z);
    const y = this.shipY(ship);
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI * Math.random();
      const v = (40 + Math.random() * 160) * this.U;
      this.particles.push({
        type: i % 4 ? "foam" : "debris",
        x: ship.x + (Math.random() - 0.5) * 80 * s, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: (1 + Math.random() * 3) * this.U, life: 0, max: 0.8 + Math.random() * 0.9, a: 0.9,
      });
    }
  }

  updateParticles(dt) {
    const g = 260 * this.U;
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type !== "smoke") p.vy += g * dt;
      else p.r += 7 * this.U * dt;
    }
    this.particles = this.particles.filter(p => p.life < p.max);
  }

  // ---- Frame ---------------------------------------------------------------

  frame(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.ships.forEach(s => this.updateShip(s, dt));
    this.ships = this.ships.filter(s => !s.dead);
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 3.2);

    const { ctx, W, H, U, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = this.shake ? Math.sin(this.time * 71) * this.shake * 5 * U : 0;
    const sy = this.shake ? Math.cos(this.time * 53) * this.shake * 4 * U : 0;
    ctx.translate(sx, sy);

    this.drawSky(dt);
    this.drawSea();
    this.drawBeam();
    this.drawParticles();
    this.drawRain(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.vignette, 0, 0, W, H);
  }

  drawSky(dt) {
    const { ctx, W, horizon, U, time } = this;
    ctx.drawImage(this.skySprite, 0, 0, W, this.skySprite.logicalH);
    ctx.fillStyle = "#dbe7f5";
    for (const s of this.stars) {
      ctx.globalAlpha = (0.25 + 0.55 * Math.abs(Math.sin(time * 0.7 + s.p))) * (1 - this.weather * 0.75);
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    const [mx, my] = this.moonPos;
    ctx.drawImage(this.moon, mx - this.moon.logicalW / 2, my - this.moon.logicalH / 2, this.moon.logicalW, this.moon.logicalH);
    ctx.globalAlpha = 0.6 + this.weather * 0.4;
    for (const c of this.cloudBank) {
      const sp = this.clouds[c.sprite];
      c.x -= c.v * dt * (1 + this.weather * 1.5);
      if (c.x + sp.logicalW < 0) c.x = W + Math.random() * 120 * U;
      ctx.drawImage(sp, c.x, c.y, sp.logicalW, sp.logicalH);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.fog, (Math.sin(time * 0.05) - 1) * 30 * U, horizon - 40 * U, W + 60 * U, this.fog.logicalH);
  }

  drawSea() {
    const { ctx, W, H, U } = this;
    const step = Math.max(7, 9 * U);
    const reefLayer = Math.floor(REEF_Z * (LAYERS - 1));
    const cliffLayer = Math.floor(CLIFF_Z * (LAYERS - 1));

    for (let i = 0; i < LAYERS; i++) {
      const z = i / (LAYERS - 1);
      const y0 = this.depthY(z);
      ctx.beginPath();
      ctx.moveTo(-10, H + 20);
      ctx.lineTo(-10, y0 + this.surf(-10, z));
      for (let x = 0; x <= W + step; x += step) ctx.lineTo(x, y0 + this.surf(x, z));
      ctx.lineTo(W + 10, H + 20);
      ctx.closePath();
      ctx.fillStyle = this.layerColor(z);
      ctx.fill();

      // A cold rim on each swell.
      ctx.beginPath();
      for (let x = 0; x <= W + step; x += step) {
        const y = y0 + this.surf(x, z);
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `rgba(150,195,225,${0.16 - z * 0.08})`;
      ctx.lineWidth = 0.6 + z * 1.4;
      ctx.stroke();

      this.drawGlitter(z, y0);

      if (i === reefLayer) this.drawReef();
      for (const s of this.ships) {
        if (Math.floor(s.z * (LAYERS - 1)) === i) this.drawShip(s);
      }
      if (i === cliffLayer) ctx.drawImage(this.cliff, 0, this.cliffOffset, this.cliff.logicalW, this.cliff.logicalH);
    }
  }

  drawGlitter(z, y0) {
    const { ctx, time, U } = this;
    const mx = this.moonPos[0];
    const spread = U * (16 + 190 * z);
    ctx.fillStyle = `rgba(226,236,240,${0.52 * (1 - z * 0.55)})`;
    for (let n = 0; n < 9; n++) {
      const h = Math.sin(n * 91.7 + z * 57.3) * 43758.5;
      const frac = h - Math.floor(h);
      const x = mx + (frac - 0.5) * 2 * spread;
      const on = Math.sin(time * (1.4 + frac * 2) + n * 2.1 + z * 20);
      if (on < 0.05) continue;
      const w = U * (2 + 24 * z) * on;
      ctx.fillRect(x - w / 2, y0 + this.surf(x, z) + U * 1.4 * (1 + z * 3), w, Math.max(1, U * (0.8 + 1.8 * z)));
    }
  }

  drawReef() {
    const { ctx, U, time } = this;
    const r = this.reef;
    const y = this.depthY(REEF_Z) + 8 * U;
    ctx.drawImage(r, this.reefX, y - r.logicalH, r.logicalW, r.logicalH);
    // Broken surf: lots of thin, unevenly spaced slivers that swell and die.
    ctx.fillStyle = "rgba(216,234,242,.5)";
    for (let i = 0; i < 44; i++) {
      const h = Math.sin(i * 73.13) * 9631.7;
      const rnd = h - Math.floor(h);
      const swell = Math.sin(time * (0.9 + rnd * 1.4) + i * 2.7);
      if (swell < -0.15) continue;
      const size = (swell + 0.15) / 1.15;
      const x = this.reefX + r.logicalW * (i / 43) * 1.04 - r.logicalW * 0.02 + Math.sin(i * 11.3) * 5 * U;
      const row = ((i * 7) % 3) * 2.6 * U;
      ctx.beginPath();
      ctx.ellipse(x, y - 1.5 * U + row, (2 + size * 9 * (0.5 + rnd)) * U, (0.4 + size * 1.1) * U, 0, 0, TAU);
      ctx.fill();
    }
  }

  drawShip(ship) {
    const { ctx } = this;
    const z = ship.z;
    const s = this.shipScale(z);
    const y = this.shipY(ship);
    const tilt = ship.tilt + this.shipPitch(ship);
    const fade = (1 - (ship.fade || 0)) * ship.alpha;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(ship.x, y + (ship.sink || 0) * 70 * s);
    ctx.rotate(tilt);
    ctx.scale(s, s);
    ship.spec.draw(ctx, shipColors(z));
    ctx.restore();

    // Water laps over the hull, in the color of the sea at this depth.
    const half = ship.spec.width * 0.62 * s;
    const stepX = Math.max(4, half / 12);
    ctx.globalAlpha = fade;
    ctx.beginPath();
    for (let x = -half; x <= half + 0.1; x += stepX) {
      const wy = y + (this.surf(ship.x + x, z) - this.surf(ship.x, z)) + 3 * s;
      if (x === -half) ctx.moveTo(ship.x + x, wy); else ctx.lineTo(ship.x + x, wy);
    }
    ctx.lineTo(ship.x + half * 0.9, y + 30 * s);
    ctx.lineTo(ship.x - half * 0.9, y + 30 * s);
    ctx.closePath();
    ctx.fillStyle = this.layerColor(z);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Bow foam, if she's moving.
    ctx.fillStyle = `rgba(214,232,240,${0.5 * fade})`;
    ctx.beginPath();
    ctx.ellipse(ship.x - ship.spec.width * 0.42 * s, y + 3 * s, 16 * s, 1.2 + 1.8 * s, 0, 0, TAU);
    ctx.fill();

    if (ship.lamp) this.drawLamp(ship, s, y, fade);
    else if (fade > 0.3 && ship.state === "sail") {
      const [lx, ly] = this.shipPoint(ship, ...ship.spec.lamp);
      ctx.fillStyle = `rgba(90,80,62,${fade})`;
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(1.2, 2.2 * s), 0, TAU);
      ctx.fill();
    }
  }

  drawLamp(ship, s, y, fade) {
    const { ctx, U } = this;
    const [lx, ly] = this.shipPoint(ship, ...ship.spec.lamp);
    const color = ship.lampColor;
    const R = (46 * s + 26 * U) * (ship.state === "saved" ? 0.7 : 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = fade;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
    g.addColorStop(0, `rgba(${color},.95)`);
    g.addColorStop(0.16, `rgba(${color},.5)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(lx, ly, Math.max(2.2, 3.4 * s), 0, TAU);
    ctx.fill();

    // Its reflection, broken up by the swell.
    const len = 70 * s + 20 * U;
    const r = ctx.createLinearGradient(0, y, 0, y + len);
    r.addColorStop(0, `rgba(${color},.42)`);
    r.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = r;
    for (let i = 0; i < 8; i++) {
      const f = i / 8;
      const w = (2 + 8 * s) * (1 - f * 0.5) * (0.6 + 0.4 * Math.sin(this.time * 7 + i * 1.7));
      ctx.fillRect(lx - w + Math.sin(this.time * 2.3 + i) * 3 * s, y + 5 * s + f * len, w * 2, len / 13);
    }
    ctx.restore();
  }

  drawBeam() {
    const { ctx, W, U, time } = this;
    const [lx, ly] = this.lampPos;
    const phase = time * (this.calmMotion ? 0.2 : 0.45);
    const facing = Math.cos(phase);
    const sweep = Math.sin(phase);

    let ex, ey, spread, alpha;
    if (this.focus && time < this.focusUntil && !this.focus.dead) {
      const [tx, ty] = this.shipPoint(this.focus, 0, -30);
      ex = tx; ey = ty;
      spread = 24 * U + this.shipScale(this.focus.z) * 34;
      alpha = 0.33 * clamp((this.focusUntil - time) / 0.5, 0, 1);
    } else {
      const reach = W * 1.05 * Math.abs(sweep) + 30 * U;
      ex = lx + Math.sign(sweep || 1) * reach;
      ey = ly + reach * 0.14;
      spread = 24 * U + reach * 0.09 * (0.5 + Math.abs(facing));
      alpha = 0.26 * Math.pow(Math.abs(sweep), 0.6);
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(lx, ly, ex, ey);
    g.addColorStop(0, `rgba(${LAMP_WARM},${alpha})`);
    g.addColorStop(1, `rgba(${LAMP_WARM},0)`);
    ctx.fillStyle = g;
    poly(ctx, [[lx, ly - 4 * U], [ex, ey - spread], [ex, ey + spread], [lx, ly + 4 * U]]);
    ctx.fill();

    // The lantern blazes as the lens turns toward us, or when you key it.
    const keyed = this.keyLamp;
    const bloom = keyed ? 1 : 0.22 + 0.38 * Math.pow(Math.max(0, facing), 4);
    const R = (keyed ? 130 : 88) * U;
    const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
    const color = keyed ? "255,246,214" : LAMP_WARM;
    glow.addColorStop(0, `rgba(${color},${bloom})`);
    glow.addColorStop(0.2, `rgba(${color},${bloom * 0.42})`);
    glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
    ctx.restore();

    // Cottage chimney.
    if (Math.random() < 0.09 && this.particles.length < 200) {
      const [cx, cy] = this.chimney;
      this.particles.push({ type: "smoke", x: cx, y: cy, vx: (6 + Math.random() * 6) * U, vy: -(10 + Math.random() * 5) * U, r: 3 * U, life: 0, max: 3, a: 0.14 });
    }
  }

  drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      const f = 1 - p.life / p.max;
      ctx.globalAlpha = p.a * f;
      ctx.fillStyle = p.type === "smoke" ? "#7c8a97" : p.type === "foam" ? "#e4f0f5" : "#2d2219";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawRain(dt) {
    if (this.weather <= 0.02) return;
    const { ctx, W, H, U } = this;
    const count = Math.floor(this.drops.length * this.weather);
    const fall = dt * 1.5;
    const slant = 0.32;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const d = this.drops[i];
      d[1] += fall * d[2];
      d[0] -= fall * d[2] * slant;
      if (d[1] > 1) d[1] -= 1;
      if (d[0] < -0.05) d[0] += 1.1;
      const x = d[0] * W, y = d[1] * H, len = 22 * U * d[2];
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * slant, y + len);
    }
    ctx.strokeStyle = "rgba(170,205,230,.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
