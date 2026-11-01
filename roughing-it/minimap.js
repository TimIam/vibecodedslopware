// Roughing It: the journey mini map. A little map of the West and the Pacific in the side panel,
// with the route still ahead dotted, the trail behind you in red, and a marker where you are now.
// hud() in game.js calls drawMap() whenever anything changes.
'use strict';

// Places, as [latitude, longitude]. The Pacific is squeezed so Hawaii fits on the same card.
const PLACES = {
  stjoe: [39.77, -94.85, 'St. Joseph'], kearney: [40.64, -99.0, 'Ft. Kearney'], jules: [40.99, -102.26, 'Julesburg'],
  bluffs: [41.83, -103.7], ridge: [42.45, -108.3], pass: [42.35, -108.9, 'South Pass'], green: [41.53, -109.47],
  bridger: [41.32, -110.39], slc: [40.76, -111.89, 'Salt Lake'], desert: [40.1, -114.6], ruby: [40.2, -116.8],
  carson: [39.16, -119.77, 'Carson'], vc: [39.31, -119.65, 'Virginia City'], tahoe: [39.1, -120.03, 'Tahoe'],
  humboldt: [40.45, -118.13, 'Humboldt'], esmeralda: [38.29, -118.9, 'Aurora'], goldhill: [39.29, -119.66],
  sf: [37.77, -122.42, 'San Francisco'], hill: [37.98, -120.43, 'Jackass Hill'],
  oahu: [21.31, -157.86, 'Honolulu'], maui: [20.8, -156.33, 'Maui'], hawaii: [19.6, -155.5, 'Hawaii'],
};
// Overland route, keyed to the miles used by game.js's STOPS
const STAGE = [[0, 'stjoe'], [290, 'kearney'], [470, 'jules'], [600, 'bluffs'], [840, 'ridge'], [900, 'pass'], [1030, 'green'], [1110, 'bridger'], [1200, 'slc'], [1380, 'desert'], [1540, 'ruby'], [1700, 'carson']];
const COAST = [[46.5, -124.1], [43, -124.5], [40.4, -124.4], [38.9, -123.7], [38, -123], [37.8, -122.5], [37.2, -122.4], [36.6, -121.9], [35.5, -121], [34.5, -120.6], [34, -118.5], [33, -117.3], [32.4, -117.1]];

const MW = 256, MH = 128;
function mapXY(lat, lon) {
  // land east of the coast gets the room; the Pacific is compressed into the left quarter
  const x = lon >= -126 ? 74 + (lon + 126) / 32 * (MW - 80) : 6 + (lon + 160) / 34 * 66;
  // the mainland band (latitude 30–45) gets most of the height; the tropics are squeezed below
  const y = lat >= 30 ? 6 + (45 - lat) / 15 * 92 : 98 + (30 - lat) / 11 * 26;
  return [x, y];
}
const P = k => mapXY(PLACES[k][0], PLACES[k][1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Where the player is right now, in map pixels.
function whereNow() {
  if (!S || S.act === 'title' || S.act === 'outfit') return P('stjoe');
  if (S.act === 'stage') {
    for (let i = 0; i < STAGE.length - 1; i++) {
      const [m0, a] = STAGE[i], [m1, b] = STAGE[i + 1];
      if (S.mi <= m1) return lerp(P(a), P(b), (S.mi - m0) / (m1 - m0));
    }
    return P('carson');
  }
  if (S.act === 'nevada') return P(S.loc && PLACES[S.loc] ? S.loc : 'carson');
  if (S.act === 'paper') return P('vc');
  if (S.act === 'sf') return P('sf');
  if (S.act === 'pocket') return P('hill');
  if (S.act === 'pacific') {
    if (S.isle) return P(S.isle);
    if (S.homeward) return lerp(P('oahu'), P('sf'), .5);
    return lerp(P('sf'), P('oahu'), Math.min(1, (S.voyage || 0) / 5));
  }
  return P('sf'); // the lecture, and the end
}

const mapCv = document.getElementById('map');
const mg = mapCv && mapCv.getContext('2d');
function drawMap() {
  if (!mg || !S) return;
  const here = whereNow();
  // remember the trail: a new point whenever you have moved a pixel or two
  S.trail = S.trail || [];
  const last = S.trail[S.trail.length - 1];
  if (S.act !== 'title' && (!last || Math.hypot(last[0] - here[0], last[1] - here[1]) > 1.5)) S.trail.push([Math.round(here[0] * 10) / 10, Math.round(here[1] * 10) / 10]);
  if (S.act === 'title') S.trail = [];
  paint(here);
  const label = document.getElementById('mapLabel');
  if (label) label.textContent = mapCaption();
}
function mapCaption() {
  if (S.act === 'title' || S.act === 'outfit') return 'St. Joseph, Missouri: 1,700 miles to Carson';
  if (S.act === 'stage') return `${S.mi.toLocaleString()} of 1,700 miles to Carson City`;
  if (S.act === 'nevada') return S.loc ? { humboldt: 'Prospecting in the Humboldt', esmeralda: 'Prospecting at Aurora', goldhill: 'Scratching at Gold Hill', tahoe: 'On the shore of Lake Tahoe' }[S.loc] || 'Carson City' : 'Carson City, Nevada Territory';
  if (S.act === 'paper') return 'Virginia City, on the Comstock';
  if (S.act === 'sf') return 'San Francisco';
  if (S.act === 'pocket') return 'Jackass Hill, Tuolumne County';
  if (S.act === 'pacific') return S.isle ? `${{ oahu: 'Oahu', maui: 'Maui', hawaii: 'Island of Hawaii' }[S.isle]}, the Sandwich Islands` : 'On the Pacific';
  if (S.act === 'lecture') return 'San Francisco: the trouble begins at eight';
  return 'The end of the trail';
}

function paint(here) {
  const g = mg;
  // sea and land
  g.fillStyle = '#2b4a5e'; g.fillRect(0, 0, MW, MH);
  g.fillStyle = '#c9b48a'; g.beginPath();
  const c0 = mapXY(...COAST[0]); g.moveTo(c0[0], -2);
  for (const c of COAST) { const [x, y] = mapXY(...c); g.lineTo(x, y); }
  g.lineTo(mapXY(...COAST[COAST.length - 1])[0], MH + 2); g.lineTo(MW + 2, MH + 2); g.lineTo(MW + 2, -2); g.fill();
  // a few landmarks: the Rockies, the Sierra, the Great Salt Lake, the Platte
  g.fillStyle = '#8a7a5a';
  for (let lat = 37; lat < 45; lat += 1.4) for (const lon of [-106.2, -107.6]) { const [x, y] = mapXY(lat + (lon % 2) * .3, lon); g.fillRect(x, y, 3, 2); g.fillRect(x + 1, y - 1, 1, 1); }
  for (let lat = 36.5; lat < 41; lat += 1) { const [x, y] = mapXY(lat, -120.2 + (41 - lat) * .45); g.fillStyle = '#6f7a5a'; g.fillRect(x, y, 3, 2); g.fillRect(x + 1, y - 1, 1, 1); }
  const [lx, ly] = mapXY(41.1, -112.5); g.fillStyle = '#5f8aa0'; g.fillRect(lx - 2, ly - 2, 5, 4);
  const [tx, ty] = P('tahoe'); g.fillStyle = '#5f8aa0'; g.fillRect(tx - 1, ty - 1, 2, 3);
  g.strokeStyle = '#7f9ab0'; g.lineWidth = 1; g.beginPath();
  for (let lon = -95.9; lon > -104; lon -= .8) { const [x, y] = mapXY(40.9 + Math.sin(lon) * .25, lon); lon > -95.8 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
  // islands
  g.fillStyle = '#7f9a5a';
  for (const [k, r] of [['oahu', 2], ['maui', 2], ['hawaii', 3]]) { const [x, y] = P(k); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  // the whole route, dotted
  const route = [...STAGE.map(s => P(s[1])), P('vc'), P('sf'), P('oahu')];
  g.strokeStyle = 'rgba(42,29,18,.55)'; g.setLineDash([2, 2]); g.beginPath();
  route.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]);
  // the trail so far
  const tr = S.trail || [];
  if (tr.length > 1) {
    g.strokeStyle = '#9b2d20'; g.lineWidth = 1.5; g.beginPath();
    tr.forEach(([x, y], i) => {
      // don't draw a line across the whole map for jumps (e.g. Carson to a district and back)
      if (i && Math.hypot(x - tr[i - 1][0], y - tr[i - 1][1]) > 60 && !(S.act === 'pacific' || S.act === 'lecture' || S.act === 'end')) g.moveTo(x, y);
      else i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke(); g.lineWidth = 1;
  }
  // town dots and labels
  g.font = '7px monospace'; g.textBaseline = 'middle';
  // only the labels that matter right now, so the Nevada towns don't pile up
  const labels = [['stjoe', -1], ['slc', 0]];
  labels.push([S.act === 'pacific' && S.isle ? S.isle : 'oahu', 0]);
  if (S.act === 'paper') labels.push(['vc', 1]);
  else if (['sf', 'pocket', 'pacific', 'lecture', 'end'].includes(S.act)) labels.push(['sf', 1]);
  else labels.push(['carson', 1]);
  if (S.act === 'nevada' && S.loc && PLACES[S.loc] && PLACES[S.loc][2]) labels.push([S.loc, S.loc === 'humboldt' ? 0 : 1]);
  if (S.act === 'pocket') labels.push(['hill', 1]);
  for (const [k] of [...STAGE.map(s => [s[1]]), ['vc'], ['sf'], ['hill'], ['humboldt'], ['esmeralda'], ['oahu'], ['maui'], ['hawaii']]) {
    const [x, y] = P(k); g.fillStyle = '#2a1d12'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }
  for (const [k, side] of labels) {
    const [x, y] = P(k), t = PLACES[k][2];
    const w = g.measureText(t).width, lx2 = side < 0 ? x - w - 6 : side > 0 ? x + 6 : x - w / 2, ly2 = side === 0 ? y - 8 : y;
    g.fillStyle = k === 'oahu' ? '#d8e6ee' : '#3a2616'; g.fillText(t, Math.max(1, Math.min(MW - w - 1, lx2)), ly2);
  }
  // you are here
  const [hx, hy] = here;
  g.fillStyle = '#f3d38c'; g.beginPath(); g.arc(hx, hy, 4, 0, 7); g.fill();
  g.fillStyle = '#9b2d20'; g.beginPath(); g.arc(hx, hy, 2.2, 0, 7); g.fill();
}
// a gentle pulse on the marker
setInterval(() => { if (mg && S) { const h = whereNow(); paint(h); const g = mg, r = 4 + (Date.now() / 300 % 3); g.strokeStyle = 'rgba(243,211,140,.8)'; g.beginPath(); g.arc(h[0], h[1], r, 0, 7); g.stroke(); } }, 120);
window.drawMap = drawMap;
