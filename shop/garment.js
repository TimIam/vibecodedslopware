// Draws a tee or hoodie with a design on it, in a 1000×1200 template space.
// The product pictures and the try-on both use it; the try-on maps the template's shoulder and hip
// anchors (ANCHORS) onto the shopper's body with one affine transform.

// Where the wearer's shoulder joints and hip joints sit in template space. Shapes follow the blanks'
// size charts (a large tee is 20" wide and 29" long, the hoodie 22" by 28"); the hem sits a little below the hips.
export const ANCHORS = { shoulderL: [330, 190], shoulderR: [670, 190], hipMid: [500, 690] };

// Chest print area, 3:4 like the print files. The hoodie's sits above the pocket.
const PRINT = { tee: { x: 368, y: 245, w: 264, h: 352 }, hoodie: { x: 400, y: 250, w: 200, h: 266 } };

// What each shape covers, for centring product pictures.
const BOUNDS = { tee: { x: 128, y: 112, w: 744, h: 664 }, hoodie: { x: 124, y: 62, w: 752, h: 742 } };

function teePath(p) {
  p.moveTo(418, 118);
  p.bezierCurveTo(445, 175, 555, 175, 582, 118);  // neckline
  p.lineTo(700, 150);
  p.bezierCurveTo(760, 175, 820, 215, 868, 268);  // right shoulder into sleeve
  p.lineTo(790, 410);
  p.lineTo(712, 372);                            // sleeve hem to armpit
  p.bezierCurveTo(706, 500, 712, 640, 720, 765);
  p.bezierCurveTo(580, 776, 420, 776, 280, 765);
  p.bezierCurveTo(288, 640, 294, 500, 288, 372);
  p.lineTo(210, 410);
  p.lineTo(132, 268);
  p.bezierCurveTo(180, 215, 240, 175, 300, 150);
  p.closePath();
}

function hoodieBody(p) {
  p.moveTo(405, 150);
  p.lineTo(300, 168);
  p.bezierCurveTo(230, 190, 190, 250, 178, 330);  // left shoulder and sleeve
  p.bezierCurveTo(160, 480, 140, 640, 128, 790);
  p.lineTo(214, 800);                           // cuff
  p.bezierCurveTo(228, 660, 258, 520, 292, 410);
  p.bezierCurveTo(292, 560, 290, 650, 286, 740);
  p.lineTo(714, 740);
  p.bezierCurveTo(710, 650, 708, 560, 708, 410);
  p.bezierCurveTo(742, 520, 772, 660, 786, 800);
  p.lineTo(872, 790);
  p.bezierCurveTo(860, 640, 840, 480, 822, 330);
  p.bezierCurveTo(810, 250, 770, 190, 700, 168);
  p.lineTo(595, 150);
  p.closePath();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  return `rgb(${c.map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))).join(",")})`;
}

// Draws into g in template coordinates (set a transform first to place or scale it).
// design: an image (or canvas) holding the 3:4 design, or null for a blank.
export function drawGarment(g, kind, hex, design) {
  const ink = shade(hex, -0.45), hi = shade(hex, 0.16), lo = shade(hex, -0.25);
  g.save();
  g.lineJoin = "round"; g.lineCap = "round";

  if (kind === "hoodie") {
    // hood, behind the neck
    g.beginPath();
    g.moveTo(370, 175); g.bezierCurveTo(340, 40, 660, 40, 630, 175); g.bezierCurveTo(600, 215, 400, 215, 370, 175);
    g.fillStyle = lo; g.fill(); g.strokeStyle = ink; g.lineWidth = 6; g.stroke();
  }

  g.beginPath();
  kind === "hoodie" ? hoodieBody(g) : teePath(g);
  g.fillStyle = hex; g.fill();

  // soft light from the upper left, fabric darkening toward the sides
  g.save();
  g.clip();
  const lg = g.createLinearGradient(150, 0, 850, 0);
  lg.addColorStop(0, "rgba(0,0,0,.28)"); lg.addColorStop(0.28, "rgba(255,255,255,.07)"); lg.addColorStop(0.55, "rgba(255,255,255,0)"); lg.addColorStop(1, "rgba(0,0,0,.32)");
  g.fillStyle = lg; g.fillRect(0, 0, 1000, 1200);
  const vg = g.createLinearGradient(0, 100, 0, 1150);
  vg.addColorStop(0, "rgba(255,255,255,.06)"); vg.addColorStop(1, "rgba(0,0,0,.18)");
  g.fillStyle = vg; g.fillRect(0, 0, 1000, 1200);

  const art = PRINT[kind];
  if (design) {
    g.globalAlpha = 0.94;
    g.drawImage(design, art.x, art.y, art.w, art.h);
    g.globalAlpha = 1;
  }

  // folds
  g.strokeStyle = "rgba(0,0,0,.22)"; g.lineWidth = 5;
  g.beginPath();
  if (kind === "hoodie") {
    g.moveTo(240, 480); g.quadraticCurveTo(224, 600, 206, 720);
    g.moveTo(760, 480); g.quadraticCurveTo(776, 600, 794, 720);
  } else {
    g.moveTo(330, 620); g.quadraticCurveTo(372, 680, 356, 755);
    g.moveTo(690, 580); g.quadraticCurveTo(656, 670, 668, 758);
  }
  g.stroke();
  g.restore();

  g.strokeStyle = ink; g.lineWidth = 6;
  g.beginPath();
  kind === "hoodie" ? hoodieBody(g) : teePath(g);
  g.stroke();

  if (kind === "hoodie") {
    // pocket, waistband, cuffs, drawstrings, hood opening
    g.fillStyle = "rgba(0,0,0,.08)"; g.strokeStyle = ink; g.lineWidth = 5;
    g.beginPath(); g.moveTo(352, 532); g.lineTo(648, 532); g.lineTo(696, 680); g.lineTo(304, 680); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = lo;
    g.beginPath(); g.rect(286, 692, 428, 48); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(133, 752); g.lineTo(217, 762); g.moveTo(783, 762); g.lineTo(867, 752); g.stroke();
    g.strokeStyle = shade(hex, 0.55); g.lineWidth = 8;
    g.beginPath(); g.moveTo(455, 205); g.lineTo(447, 320); g.moveTo(545, 205); g.lineTo(553, 320); g.stroke();
    g.fillStyle = shade(hex, -0.6); g.strokeStyle = ink; g.lineWidth = 6;
    g.beginPath(); g.moveTo(380, 160); g.bezierCurveTo(420, 230, 580, 230, 620, 160); g.bezierCurveTo(580, 195, 420, 195, 380, 160); g.fill(); g.stroke();
  } else {
    // collar rib and sleeve hems
    g.strokeStyle = hi; g.lineWidth = 10;
    g.beginPath(); g.moveTo(426, 128); g.bezierCurveTo(452, 182, 548, 182, 574, 128); g.stroke();
    g.strokeStyle = ink; g.lineWidth = 4;
    g.beginPath(); g.moveTo(222, 384); g.lineTo(292, 350); g.moveTo(778, 384); g.lineTo(708, 350); g.stroke();
  }
  g.restore();
}

// Renders a product picture centred in the canvas.
export function productCanvas(canvas, kind, hex, design, { pad = 0.08, background = null } = {}) {
  const w = canvas.width, h = canvas.height, g = canvas.getContext("2d"), b = BOUNDS[kind];
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  if (background) { g.fillStyle = background; g.fillRect(0, 0, w, h); }
  const s = Math.min(w / b.w, h / b.h) * (1 - pad * 2);
  g.setTransform(s, 0, 0, s, (w - b.w * s) / 2 - b.x * s, (h - b.h * s) / 2 - b.y * s);
  drawGarment(g, kind, hex, design);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
