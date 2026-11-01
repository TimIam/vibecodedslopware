// Pour Decisions: the bar's stock. Bottles are drawn after the silhouettes and colors you'd
// recognize on a real back bar, with generic labels and no brand names or logos. Also the ice
// well, the garnish tray and the rimmers. Every bottle shares a 40x90 box standing on y=88, so
// short things (bitters, hot sauce) come out short.

function tx(x, y, size, t, fill = INK, extra = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" fill="${fill}" ${extra}>${t}</text>`;
}
// A paper label; lines are [text, size, color, y offset].
function lab(g, y, h, fill, lines, o = {}) {
  const x0 = (o.x0 ?? g.x0) + (o.in ?? 1.5), x1 = (o.x1 ?? g.x1) - (o.in ?? 1.5);
  const tr = o.rot ? ` transform="rotate(${o.rot} 20 ${y + h / 2})"` : '';
  let s = `<g${tr}><rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" rx="${o.rx ?? .8}" fill="${fill}" stroke="${o.stroke ?? INK}" stroke-width="${o.sw ?? 1}"/>`;
  if (o.band) s += `<rect x="${x0}" y="${y + (o.bandAt ?? h - 3.4)}" width="${x1 - x0}" height="${o.bandH ?? 2}" fill="${o.band}"/>`;
  for (const [t, size, col, dy] of lines) s += tx(20, y + dy, size, t, col);
  return s + '</g>';
}

function bottle(key, o) {
  const w = o.w ?? 22, h = o.h ?? 46, neck = o.neck ?? 8, sh = o.sh ?? 10, nh = o.nh ?? 16, r = o.r ?? 3;
  const g = { x0: 20 - w / 2, x1: 20 + w / 2, yb: 88 - h, w, h };
  g.ys = g.yb - sh; g.yn = g.ys - nh; g.n0 = 20 - neck / 2; g.n1 = 20 + neck / 2;
  Object.assign(g, o.geo);
  const d = o.path || (o.square
    ? `M${g.x0},88 L${g.x0},${g.yb + r} Q${g.x0},${g.ys} ${g.n0},${g.ys} L${g.n0},${g.yn} L${g.n1},${g.yn} L${g.n1},${g.ys} Q${g.x1},${g.ys} ${g.x1},${g.yb + r} L${g.x1},88 Z`
    : `M${g.x0},88 L${g.x0},${g.yb} C${g.x0},${g.ys + sh * .35} ${g.n0},${g.ys + sh * .45} ${g.n0},${g.ys} L${g.n0},${g.yn} L${g.n1},${g.yn} L${g.n1},${g.ys} C${g.n1},${g.ys + sh * .45} ${g.x1},${g.ys + sh * .35} ${g.x1},${g.yb} L${g.x1},88 Z`);
  const id = 'bc-' + key;
  let s = `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${id})">`;
  s += `<rect width="40" height="90" fill="${o.glass ?? 'rgba(226,240,248,.62)'}"/>`;
  if (o.liquid) s += `<rect y="${o.fill ?? g.yb + 3}" width="40" height="90" fill="${o.liquid}" opacity=".92"/>`;
  if (o.inside) s += o.inside(g);
  s += `<path d="M${g.x0 + 3.5},${g.yb + 3} L${g.x0 + 3.5},85" stroke="#fff" stroke-width="2.4" opacity=".45" stroke-linecap="round"/></g>`;
  s += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  if (o.label) s += o.label(g);
  s += cap(g, o);
  if (o.over) s += o.over(g);
  return s;
}
function cap(g, o) {
  const c = o.cap ?? '#222', nw = g.n1 - g.n0, cw = o.capW ?? nw + 2, ch = o.capH ?? 7, x = 20 - cw / 2, y = g.yn - ch + 1;
  const S = `stroke="${INK}" stroke-width="1.6"`;
  switch (o.capKind) {
    case 'none': return '';
    case 'ball': return `<rect x="${g.n0 + 1}" y="${g.yn - 3}" width="${nw - 2}" height="4" fill="#e6c58a" ${S}/><ellipse cx="20" cy="${g.yn - 3 - ch / 2}" rx="${cw / 2}" ry="${ch / 2}" fill="${c}" ${S}/>`;
    case 'wax': return `<path d="M${g.n0 - 2},${g.yn + 12} L${g.n0 - 2},${g.yn - 4} Q20,${g.yn - 9} ${g.n1 + 2},${g.yn - 4} L${g.n1 + 2},${g.yn + 10} Q${g.n1 + 3},${g.yn + 16} ${g.n1 + 1},${g.yn + 17} Q${g.n1},${g.yn + 11} ${g.n1 - 2},${g.yn + 10} L${g.n1 - 2},${g.yn + 14} Q${g.n1 - 3},${g.yn + 19} ${g.n1 - 5},${g.yn + 14} L20,${g.yn + 10} Q18,${g.yn + 21} 16,${g.yn + 12} Q${g.n0},${g.yn + 17} ${g.n0 - 2},${g.yn + 12} Z" fill="${c}" ${S}/><path d="M${g.n0},${g.yn - 2} L${g.n0 + 2},${g.yn + 8}" stroke="#fff" opacity=".4" stroke-width="1.2"/>`;
    case 'foil': return `<path d="M${g.n0 - 1},${g.yn - 2} L${g.n1 + 1},${g.yn - 2} L${g.n1 + 1},${g.ys - 2} L${g.n1 + 4},${g.ys + 6} L${g.n0 - 4},${g.ys + 6} L${g.n0 - 1},${g.ys - 2} Z" fill="${c}" ${S}/><path d="M${g.n0 + 1.5},${g.yn} L${g.n0 + 1.5},${g.ys}" stroke="#fff" opacity=".45" stroke-width="1.2"/>`;
    case 'tip': return `<rect x="${g.n0 - 1}" y="${g.yn - 4}" width="${nw + 2}" height="5" fill="${c}" ${S}/><path d="M${20 - 2.5},${g.yn - 4} L20,${g.yn - 14} L${20 + 2.5},${g.yn - 4} Z" fill="${c}" ${S}/>`;
    case 'dropper': return `<rect x="${g.n0 - 1}" y="${g.yn - 5}" width="${nw + 2}" height="6" fill="#222" ${S}/><path d="M${20 - 3},${g.yn - 5} Q${20 - 3},${g.yn - 14} 20,${g.yn - 14} Q${20 + 3},${g.yn - 14} ${20 + 3},${g.yn - 5} Z" fill="${c}" ${S}/>`;
    case 'crown': return `<path d="M${20 - 6},${g.yn} L${20 - 7},${g.yn - 6} L${20 - 3.5},${g.yn - 3.5} L20,${g.yn - 8} L${20 + 3.5},${g.yn - 3.5} L${20 + 7},${g.yn - 6} L${20 + 6},${g.yn} Z" fill="${c}" ${S}/>`;
    default: return `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="1.2" fill="${c}" ${S}/><path d="M${x + 2},${y + 1.5} L${x + 2},${y + ch - 1.5} M${x + 4.5},${y + 1.5} L${x + 4.5},${y + ch - 1.5}" stroke="#fff" opacity=".3" stroke-width=".8"/>`;
  }
}
const slim = (key, liquid, capC, top, big, extra = {}) => bottle(key, { w: 18, h: 54, sh: 8, nh: 16, neck: 7, liquid, cap: capC, ...extra,
  label: g => lab(g, g.yb + 16, 17, extra.labFill ?? '#fff', [[top, 2.3, extra.ink ?? liquid, 5.5], [big, big.length > 6 ? 3 : 3.8, extra.ink ?? liquid, 11.5]], { band: extra.band }) });
const smallPop = (key, o, l1, l2, fill, ink, band) => bottle(key, { w: 16, h: 30, sh: 8, nh: 8, neck: 6, ...o,
  label: g => lab(g, g.yb + 8, 13, fill, [[l1, 2.6, ink, 5], [l2, 2.6, ink, 9.5]], { band }) });
const squeeze = (key, liquid, capC, word) => bottle(key, { square: true, w: 16, h: 38, sh: 3, nh: 4, neck: 8, r: 4, glass: 'rgba(240,244,246,.7)', liquid, fill: 58, cap: capC, capKind: 'tip',
  label: g => `<rect x="13" y="${g.yb + 6}" width="14" height="6" fill="#f6f2e4" stroke="${INK}" stroke-width=".6" transform="rotate(-4 20 ${g.yb + 9})"/>` + tx(20, g.yb + 10.6, 2.8, word, '#333', 'font-family="Comic Sans MS,cursive"') });
const can = (key, top, bottom, word, sub) => bottle(key, { path: 'M10,58 L30,58 L30,88 L10,88 Z', geo: { x0: 10, x1: 30, yb: 58, yn: 58, n0: 14, n1: 26 }, capKind: 'none', glass: bottom,
  inside: g => `<rect x="0" y="58" width="40" height="13" fill="${top}"/>`,
  label: g => tx(20, 76, 3.4, word, '#fff', `stroke="${INK}" stroke-width=".3"`) + tx(20, 81, 2.2, sub, '#fff'),
  over: g => `<ellipse cx="20" cy="58" rx="10" ry="2.4" fill="#d6dbe0" stroke="${INK}" stroke-width="1.6"/><rect x="10" y="85" width="20" height="3" fill="#c0c6cc" stroke="${INK}" stroke-width="1"/>` });
const carton = (key, color, word, small) => {
  const t = small ? 62 : 52;
  return bottle(key, { path: `M11,${t} L14,${t - 8} L26,${t - 8} L29,${t} L29,88 L11,88 Z`, geo: { x0: 11, x1: 29, yb: t, yn: t - 8, n0: 22, n1: 26 }, glass: '#fbfbf6', capKind: small ? 'none' : undefined, cap: color, capW: 5, capH: 4,
    inside: g => `<rect x="0" y="${t + 8}" width="40" height="${88 - t - 14}" fill="${color}"/><circle cx="20" cy="${t + 16}" r="${small ? 0 : 4}" fill="#fff" opacity=".7"/>`,
    label: g => tx(20, small ? 80 : 82, small ? 3 : 3.2, word, '#fff', `stroke="${INK}" stroke-width=".25"`),
    over: g => `<path d="M14,${t - 8} L20,${t - 3} L26,${t - 8} M20,${t - 3} L20,${t}" stroke="${INK}" stroke-width="1" fill="none"/>` });
};

const BOTTLE_ART = {
  vodka: () => bottle('vodka', { w: 24, h: 50, sh: 6, nh: 10, neck: 10, cap: '#c4ccd4', capH: 6,
    label: g => tx(20, g.yb + 15, 6.4, 'VODKA', '#1c4fa8', 'letter-spacing=".2"') + tx(20, g.yb + 21, 2.6, 'IMPORTED', '#1c4fa8') + `<path d="M11,${g.yb + 24} L29,${g.yb + 24}" stroke="#1c4fa8" stroke-width=".6"/>` + tx(20, g.yb + 30, 2.3, 'COUNTRY OF ORIGIN', '#1c4fa8') + tx(20, g.yb + 34, 2.3, '40% ALC/VOL', '#1c4fa8') }),
  gin: () => bottle('gin', { square: true, w: 22, h: 52, sh: 3, nh: 12, neck: 9, r: 2, glass: 'rgba(60,135,215,.78)', cap: '#23408f',
    label: g => lab(g, g.yb + 14, 22, '#eef4fb', [['DRY GIN', 4.2, '#23408f', 8], ['LONDON', 2.6, '#23408f', 13], ['◆', 5, '#4a8ad8', 20]], { stroke: '#23408f' }) }),
  rum: () => bottle('rum', { w: 20, h: 50, sh: 10, nh: 18, cap: '#111',
    label: g => lab(g, g.yb + 12, 24, '#fbf7ec', [['RUM', 6, '#111', 11], ['SUPERIOR', 2.6, '#b01e2a', 16], ['●', 4, '#b01e2a', 22]], { band: '#b01e2a', bandAt: 1 }) }),
  darkrum: () => bottle('darkrum', { w: 26, h: 42, sh: 12, nh: 14, neck: 10, glass: '#3a1a0c', cap: '#111', capW: 13,
    label: g => `<ellipse cx="20" cy="${g.yb + 22}" rx="11" ry="12" fill="#f3e3c0" stroke="${INK}" stroke-width="1"/>` + tx(20, g.yb + 20, 4.2, 'DARK', '#a8141e') + tx(20, g.yb + 25, 4.2, 'RUM', '#a8141e') + tx(20, g.yb + 29.5, 2.3, 'JAMAICA', '#333') }),
  tequila: () => bottle('tequila', { square: true, w: 26, h: 38, sh: 4, nh: 7, neck: 11, r: 6, capKind: 'ball', cap: '#dcb47c', capW: 14, capH: 11,
    label: g => lab(g, g.yb + 18, 13, '#f6f1e2', [['TEQUILA', 3.4, '#2d6a3e', 6], ['100% AGAVE', 2.1, '#2d6a3e', 10]], { x0: 13, x1: 27, in: 0, rx: 2, stroke: '#2d6a3e' }) + `<path d="M17,${g.yn + 1} L14,${g.yb + 18} M23,${g.yn + 1} L26,${g.yb + 18}" stroke="#2d6a3e" stroke-width="1.1"/>` }),
  bourbon: () => bottle('bourbon', { square: true, w: 24, h: 44, sh: 5, nh: 14, neck: 9, r: 7, liquid: '#b8661c', capKind: 'wax', cap: '#c0141e',
    label: g => lab(g, g.yb + 13, 20, '#f4ecd6', [['BOURBON', 3.6, '#111', 8], ['WHISKY', 2.6, '#111', 12.5], ['KENTUCKY', 2.1, '#555', 17]], { rx: 3 }) }),
  rye: () => bottle('rye', { w: 22, h: 54, sh: 8, nh: 16, liquid: '#b0601e', cap: '#2a2a2a',
    label: g => lab(g, g.yb + 16, 18, '#e9b866', [['RYE', 5, '#2a1a0a', 8], ['FRONTIER', 2.4, '#2a1a0a', 13]], { rot: -9 }) }),
  scotch: () => bottle('scotch', { square: true, w: 24, h: 54, sh: 3, nh: 12, neck: 9, r: 2, liquid: '#c98a2c', cap: '#d4a93a',
    label: g => lab(g, g.yb + 18, 14, '#111', [['SCOTCH', 3.8, '#e0b84a', 7], ['BLENDED · 12', 2.1, '#e0b84a', 11]], { rot: -22, stroke: '#e0b84a', x0: 7, x1: 33 }) }),
  irish: () => bottle('irish', { w: 22, h: 50, sh: 10, nh: 18, glass: '#2f6b3c', cap: '#1d1d1d',
    label: g => lab(g, g.yb + 12, 22, '#f1e6c8', [['IRISH', 4.2, '#111', 8], ['WHISKEY', 3.1, '#111', 13], ['TRIPLE DISTILLED', 1.9, '#4a3a1a', 18]], { band: '#c9a24a', bandAt: 1, bandH: 1.5 }) }),
  brandy: () => bottle('brandy', { w: 26, h: 36, sh: 18, nh: 14, neck: 8, glass: '#5a2a0e', cap: '#111', capH: 8,
    label: g => lab(g, g.yb + 8, 16, '#111', [['COGNAC', 3.8, '#d8b04a', 7], ['V.S.O.P', 2.6, '#d8b04a', 12]], { rx: 6, stroke: '#d8b04a' }) }),
  cachaca: () => bottle('cachaca', { w: 20, h: 52, sh: 9, nh: 16, cap: '#2b8a3e',
    label: g => lab(g, g.yb + 14, 20, '#ffd84a', [['CACHAÇA', 3.2, '#1d6b30', 8], ['BRASIL', 2.4, '#1d6b30', 13]], { band: '#2b8a3e', bandAt: 16 }) }),
  sparkling: () => bottle('sparkling', { w: 22, h: 44, sh: 20, nh: 12, neck: 9, glass: '#1f3a22', capKind: 'foil', cap: '#e9a21c',
    label: g => lab(g, g.yb + 12, 15, '#f2a21c', [['BRUT', 4.2, '#111', 7], ['CHAMPAGNE', 2.1, '#111', 11.5]]) }),
  redwine: () => bottle('redwine', { w: 20, h: 48, sh: 8, nh: 20, neck: 7, glass: '#2a0a12', cap: '#6e0f1f', capH: 12,
    label: g => lab(g, g.yb + 16, 18, '#f3ecdc', [['CHÂTEAU', 2.5, '#6e0f1f', 6], ['ROUGE', 3.8, '#111', 11], ['2019', 2.3, '#6e0f1f', 15]]) }),

  triplesec: () => bottle('triplesec', { square: true, w: 22, h: 48, sh: 3, nh: 12, neck: 9, r: 2, glass: '#c9681c', cap: '#b8561a',
    label: g => `<path d="M${g.x0},${g.yb + 30} L${g.x1},${g.yb + 12} L${g.x1},${g.yb + 17} L${g.x0},${g.yb + 35} Z" fill="#c0141e" stroke="${INK}" stroke-width=".8"/>` + tx(20, g.yb + 42, 2.8, 'TRIPLE SEC', '#fff3c8') }),
  coffee: () => bottle('coffee', { w: 26, h: 40, sh: 12, nh: 10, neck: 10, glass: '#2b1608', cap: '#c0141e', capW: 12,
    label: g => `<path d="M8,${g.yb + 26} L8,${g.yb + 14} Q20,${g.yb + 4} 32,${g.yb + 14} L32,${g.yb + 26} Z" fill="#f3d27a" stroke="${INK}" stroke-width="1"/>` + tx(20, g.yb + 17, 3.6, 'COFFEE', '#c0141e') + tx(20, g.yb + 22, 2.5, 'LIQUEUR', '#3a1a0a') }),
  amaretto: () => bottle('amaretto', { square: true, w: 24, h: 44, sh: 2, nh: 8, neck: 10, r: 2, liquid: '#a8521b', glass: 'rgba(200,120,50,.5)', cap: '#d8a03a', capW: 18, capH: 9,
    label: g => lab(g, g.yb + 14, 13, '#f4e9cc', [['AMARETTO', 2.9, '#6a2a0a', 6], ['ORIGINALE', 2, '#6a2a0a', 10]], { x0: 12, x1: 28, in: 0 }) }),
  irishcream: () => bottle('irishcream', { w: 24, h: 48, sh: 10, nh: 12, neck: 10, glass: '#3a2414', cap: '#d0aa5a',
    label: g => lab(g, g.yb + 10, 24, '#efe1c4', [['IRISH', 4, '#3a2414', 8], ['CREAM', 4, '#3a2414', 13], ['ORIGINAL', 2.1, '#a8141e', 19]], { rx: 3 }) }),
  cacao: () => slim('cacao', '#5a3018', '#3a2010', 'CRÈME DE', 'CACAO'),
  menthe: () => slim('menthe', '#2fb34a', '#1d6b30', 'CRÈME DE', 'MENTHE'),
  peach: () => slim('peach', '#f7c58a', '#e07a3a', 'PEACH', 'SCHNAPPS', { ink: '#c0561a', w: 20 }),
  melon: () => bottle('melon', { square: true, w: 22, h: 50, sh: 4, nh: 12, r: 4, glass: '#59c43a', cap: '#111',
    inside: g => { let s = ''; for (let y = g.yb + 4; y < 86; y += 5) for (let x = g.x0 + 2 + ((y / 5) % 2) * 2.5; x < g.x1; x += 5) s += `<circle cx="${x}" cy="${y}" r="1.3" fill="#a6ee7a" opacity=".7"/>`; return s; },
    label: g => lab(g, g.yb + 30, 8, '#111', [['MELON', 3.2, '#9fe86a', 5.8]]) }),
  bluecur: () => slim('bluecur', '#1e8ee8', '#0d4a8a', 'BLUE', 'CURAÇAO', { w: 20 }),
  galliano: () => bottle('galliano', { path: 'M10,88 L15,26 Q16,16 18,12 L18,4 L22,4 L22,12 Q24,16 25,26 L30,88 Z', geo: { x0: 10, x1: 30, yb: 30, yn: 4, n0: 18, n1: 22 }, liquid: '#f2d21b', fill: 20, cap: '#d8b04a', capH: 5,
    label: g => lab(g, 56, 14, '#fff8e0', [['ITALIANO', 2.5, '#8a5a0a', 6], ['VANILLA', 2.1, '#8a5a0a', 10]], { x0: 13, x1: 27, in: 0 }) }),
  raspberry: () => bottle('raspberry', { path: 'M18,52 L18,44 L22,44 L22,52 C34,54 36,62 36,70 C36,82 28,88 20,88 C12,88 4,82 4,70 C4,62 6,54 18,52 Z', geo: { x0: 4, x1: 36, yb: 54, yn: 44, n0: 18, n1: 22 }, glass: '#3a0820', capKind: 'crown', cap: '#d8b04a',
    over: g => `<path d="M5,71 Q20,76 35,71" stroke="#d8b04a" stroke-width="3" fill="none"/><circle cx="20" cy="74" r="3" fill="#d8b04a" stroke="${INK}" stroke-width=".8"/>` }),
  maraschino: () => bottle('maraschino', { w: 20, h: 52, sh: 8, nh: 16, glass: '#2d5a2a', cap: '#eee',
    inside: g => { let s = `<rect x="0" y="${g.yb + 16}" width="40" height="50" fill="#d9b06a"/>`; for (let y = g.yb + 18; y < 88; y += 3) s += `<path d="M0,${y} L40,${y + 2}" stroke="#a87a3a" stroke-width=".8"/>`; for (let x = g.x0; x < g.x1; x += 3) s += `<path d="M${x},${g.yb + 16} L${x + 1},88" stroke="#b8894a" stroke-width=".6"/>`; return s; },
    label: g => lab(g, g.yb + 3, 11, '#fff', [['MARASCHINO', 2.1, '#a8141e', 4.6], ['ZARA', 1.9, '#111', 8.6]]) }),
  benedictine: () => bottle('benedictine', { w: 24, h: 40, sh: 12, nh: 12, glass: '#2a1608', capKind: 'wax', cap: '#a8141e',
    label: g => lab(g, g.yb + 10, 18, '#111', [['D.O.M.', 3.8, '#d8b04a', 8], ['LIQUEUR', 2.2, '#d8b04a', 13]], { stroke: '#d8b04a' }) }),
  drambuie: () => bottle('drambuie', { w: 22, h: 46, sh: 12, liquid: '#d39a2b', glass: 'rgba(210,150,50,.55)', cap: '#111',
    label: g => lab(g, g.yb + 12, 18, '#f3ecd6', [['HONEY', 3.2, '#a8141e', 7], ['SCOTCH LIQUEUR', 1.9, '#333', 12]], { band: '#a8141e', bandAt: 1 }) }),
  chartreuse: () => bottle('chartreuse', { w: 22, h: 44, sh: 14, nh: 12, liquid: '#9fd13a', cap: '#1d4a1a',
    label: g => `<ellipse cx="20" cy="${g.yb + 18}" rx="9" ry="8" fill="#eef6dc" stroke="${INK}" stroke-width="1"/>` + tx(20, g.yb + 18, 3, 'VERTE', '#1d4a1a') + tx(20, g.yb + 22, 1.9, 'DES PÈRES', '#1d4a1a') }),
  elderflower: () => bottle('elderflower', { square: true, w: 22, h: 56, sh: 2, nh: 8, r: 1, liquid: '#f1ecc0', glass: 'rgba(240,236,205,.6)', cap: '#c9a23a', capH: 10, capW: 12,
    inside: g => [13, 17, 23, 27].map(x => `<path d="M${x},${g.yb} L${x},88" stroke="#c9b87a" stroke-width=".8"/>`).join(''),
    label: g => `<rect x="${g.x0}" y="${g.yb + 6}" width="${g.w}" height="5" fill="#c9a23a" stroke="${INK}" stroke-width=".8"/>` + tx(20, g.yb + 10, 2.6, 'FLEUR', '#fff') }),
  cassis: () => bottle('cassis', { w: 24, h: 44, sh: 12, liquid: '#4a0d2a', cap: '#4a0d2a',
    label: g => lab(g, g.yb + 12, 18, '#fff', [['CASSIS', 3.8, '#4a0d2a', 7.5], ['DE DIJON', 2.2, '#4a0d2a', 12]]) }),
  campari: () => slim('campari', '#d21f2b', '#111', 'BITTER', 'MILANO', { ink: '#c0141e' }),
  aperol: () => bottle('aperol', { w: 20, h: 52, sh: 8, liquid: '#f2661e', cap: '#1d3d6a',
    label: g => lab(g, g.yb + 15, 14, '#fff', [['APERITIVO', 2.6, '#e2561a', 6], ['ITALIA', 2.2, '#1d3d6a', 10.5]], { rot: -10, stroke: '#1d3d6a' }) }),
  swvermouth: () => bottle('swvermouth', { w: 18, h: 50, sh: 16, nh: 16, neck: 7, glass: '#3a1a10', cap: '#a8141e',
    label: g => lab(g, g.yb + 10, 18, '#fff', [['ROSSO', 3.6, '#a8141e', 7], ['VERMOUTH', 2.3, '#111', 12]], { band: '#a8141e', bandAt: 14.5, bandH: 1.6 }) }),
  dryvermouth: () => bottle('dryvermouth', { w: 18, h: 50, sh: 16, nh: 16, neck: 7, glass: '#86a36a', cap: '#2a4a2a',
    label: g => lab(g, g.yb + 10, 18, '#fff', [['DRY', 4, '#2a4a2a', 7], ['VERMOUTH', 2.3, '#111', 12]], { band: '#2a4a2a', bandAt: 14.5, bandH: 1.6 }) }),
  lillet: () => bottle('lillet', { w: 22, h: 44, sh: 14, liquid: '#f0dc8a', cap: '#c9a23a',
    label: g => lab(g, g.yb + 12, 18, '#f6efd8', [['BLANC', 3.8, '#8a6a1a', 7.5], ['APÉRITIF', 2.3, '#8a6a1a', 12]], { band: '#c9a23a', bandAt: 1 }) }),

  cola: () => bottle('cola', { path: 'M16.5,46 L23.5,46 L23.5,52 C27,58 28,62 26,68 C25,72 28,76 28,82 L28,88 L12,88 L12,82 C12,76 15,72 14,68 C12,62 13,58 16.5,52 Z', geo: { x0: 12, x1: 28, yb: 56, yn: 46, n0: 16.5, n1: 23.5 }, liquid: '#3b1a0c', fill: 52, cap: '#c0141e', capH: 4,
    label: g => tx(20, 76, 4.2, 'Cola', '#fff', 'font-style="italic" font-family="Brush Script MT,cursive"') }),
  tonic: () => smallPop('tonic', { liquid: '#eef6f8', cap: '#d8b04a' }, 'INDIAN', 'TONIC', '#f6d64a', '#1d3d6a'),
  soda: () => smallPop('soda', { liquid: '#eef6fa', cap: '#2f8fd8' }, 'CLUB', 'SODA', '#d8ecfa', '#1d4a8a'),
  gingerale: () => smallPop('gingerale', { glass: '#2f7a3a', cap: '#d8b04a' }, 'GINGER', 'ALE', '#fff', '#2f7a3a', '#d8b04a'),
  gingerbeer: () => smallPop('gingerbeer', { glass: '#a8703e', cap: '#1d1d1d', w: 18, neck: 8, nh: 6 }, 'GINGER', 'BEER', '#f3e3c0', '#6a3a1a'),
  lemonlime: () => smallPop('lemonlime', { glass: '#3fae4a', cap: '#2a8a3a' }, 'LEMON', 'LIME', '#fff', '#2a8a3a', '#f2d21b'),
  oj: () => carton('oj', '#ff9a1e', 'ORANGE'),
  cranberry: () => bottle('cranberry', { square: true, w: 22, h: 36, sh: 4, nh: 6, neck: 8, r: 4, liquid: '#c0141e', fill: 54, glass: 'rgba(240,240,240,.7)', cap: '#1d6b30',
    label: g => lab(g, g.yb + 12, 14, '#fff', [['CRAN', 3.6, '#c0141e', 6], ['●●●', 2.6, '#c0141e', 11]]),
    over: g => `<path d="M${g.x1},${g.yb + 2} Q${g.x1 + 6},${g.yb + 2} ${g.x1 + 5},${g.yb + 10} Q${g.x1 + 4},${g.yb + 16} ${g.x1},${g.yb + 16}" fill="none" stroke="${INK}" stroke-width="2"/>` }),
  pineapple: () => can('pineapple', '#2f8a3a', '#f5c824', 'PINEAPPLE', 'JUICE'),
  grapefruit: () => bottle('grapefruit', { w: 18, h: 38, sh: 6, nh: 6, neck: 8, liquid: '#f59c86', cap: '#e05a4a',
    label: g => lab(g, g.yb + 10, 14, '#fff', [['GRAPE', 2.8, '#e05a4a', 5.5], ['FRUIT', 2.8, '#e05a4a', 10]]) }),
  tomato: () => can('tomato', '#d8281e', '#f6f2e4', 'TOMATO', 'JUICE'),
  passion: () => carton('passion', '#7a2a8a', 'PASSION'),
  peachpuree: () => bottle('peachpuree', { square: true, w: 20, h: 24, sh: 2, nh: 3, neck: 16, r: 3, liquid: '#f8b27c', cap: '#e07a3a', capW: 20, capH: 5,
    label: g => lab(g, g.yb + 8, 11, '#fff', [['PEACH', 2.6, '#c0561a', 5], ['PURÉE', 2.3, '#c0561a', 9]]) }),
  lime: () => squeeze('lime', '#c8e07a', '#3fae4a', 'LIME'),
  lemon: () => squeeze('lemon', '#f6ec8a', '#f2c230', 'LEMON'),
  simple: () => squeeze('simple', '#f6f4ea', '#f6f6f6', 'SIMPLE'),
  honey: () => `<path d="M20,52 m-8,0 a8,8 0 1 1 16,0 a8,8 0 1 1 -16,0" fill="#e8a82a" stroke="${INK}" stroke-width="2"/><circle cx="13" cy="46" r="3.2" fill="#e8a82a" stroke="${INK}" stroke-width="1.6"/><circle cx="27" cy="46" r="3.2" fill="#e8a82a" stroke="${INK}" stroke-width="1.6"/><ellipse cx="20" cy="74" rx="12" ry="14" fill="#e8a82a" stroke="${INK}" stroke-width="2"/><ellipse cx="20" cy="76" rx="6" ry="7" fill="#f6c84a"/><circle cx="17" cy="51" r="1" fill="${INK}"/><circle cx="23" cy="51" r="1" fill="${INK}"/><ellipse cx="20" cy="55" rx="3" ry="2" fill="#f6c84a" stroke="${INK}" stroke-width=".8"/><rect x="17" y="40" width="6" height="5" fill="#c0141e" stroke="${INK}" stroke-width="1.4"/><path d="M18.5,40 L20,33 L21.5,40 Z" fill="#c0141e" stroke="${INK}" stroke-width="1.2"/>`,
  agave: () => bottle('agave', { w: 16, h: 40, sh: 6, nh: 8, neck: 6, liquid: '#e2b45a', cap: '#2a2a2a', capKind: 'tip',
    label: g => lab(g, g.yb + 12, 12, '#2d6a3e', [['AGAVE', 2.8, '#f6e6b0', 5], ['NECTAR', 2.1, '#f6e6b0', 9]]) }),
  orgeat: () => bottle('orgeat', { w: 16, h: 44, sh: 8, nh: 12, neck: 6, liquid: '#efe6d2', cap: '#111',
    label: g => lab(g, g.yb + 14, 14, '#fff', [['ORGEAT', 2.8, '#111', 6], ['ALMOND', 2, '#a8141e', 10]], { band: '#a8141e', bandAt: 1, bandH: 1.4 }) }),
  grenadine: () => bottle('grenadine', { w: 16, h: 36, sh: 8, nh: 10, neck: 6, liquid: '#b5102c', cap: '#b5102c',
    label: g => lab(g, g.yb + 10, 12, '#fff', [['GRENA-', 2.4, '#b5102c', 5], ['DINE', 2.4, '#b5102c', 9]]) }),
  cream: () => carton('cream', '#2f6fc0', 'CREAM', true),
  coconut: () => can('coconut', '#2f6fc0', '#f6f6f2', 'COCO', 'CREAM OF'),
  espresso: () => `<path d="M12,88 L14,72 L26,72 L28,88 Z" fill="#b8c0c8" stroke="${INK}" stroke-width="2"/><rect x="13" y="69" width="14" height="4" fill="#8a929a" stroke="${INK}" stroke-width="1.4"/><path d="M14,69 L12,54 L28,54 L26,69 Z" fill="#c8d0d8" stroke="${INK}" stroke-width="2"/><path d="M19,50 L21,50 L21,54 L19,54 Z" fill="#222"/><ellipse cx="20" cy="52" rx="5" ry="2" fill="#222"/><path d="M28,60 C35,60 35,70 27,70" fill="none" stroke="#222" stroke-width="3"/><path d="M12,58 L8,56" stroke="${INK}" stroke-width="2"/><path d="M14,54 L16,69" stroke="#fff" opacity=".5" stroke-width="1.6"/>`,
  hotcoffee: () => `<path d="M11,88 Q8,74 14,64 L14,58 L26,58 L26,64 Q32,74 29,88 Z" fill="rgba(226,240,248,.6)" stroke="${INK}" stroke-width="2"/><path d="M10.5,88 Q9,78 12,72 L28,72 Q31,78 29.5,88 Z" fill="#3a210f"/><rect x="13" y="53" width="14" height="6" rx="1" fill="#222" stroke="${INK}" stroke-width="1.6"/><path d="M27,62 C35,62 35,76 28,76" fill="none" stroke="#222" stroke-width="3"/><path d="M16,40 Q14,46 17,50 M21,38 Q19,44 22,49" stroke="#ccc" stroke-width="1.2" fill="none" opacity=".8"/>`,
  hotwater: () => `<path d="M10,88 L12,64 Q20,58 28,64 L30,88 Z" fill="#d0d6dc" stroke="${INK}" stroke-width="2"/><path d="M10,70 L3,62 L5,60 L12,66" fill="#d0d6dc" stroke="${INK}" stroke-width="1.8"/><path d="M14,62 Q20,48 26,62" fill="none" stroke="#222" stroke-width="3"/><circle cx="20" cy="60" r="2" fill="#222"/><path d="M13,70 L14,84" stroke="#fff" opacity=".6" stroke-width="1.6"/><path d="M4,56 Q2,50 5,46" stroke="#ccc" stroke-width="1.2" fill="none"/>`,

  angostura: () => bottle('angostura', { w: 16, h: 38, sh: 8, nh: 8, neck: 6, liquid: '#7a1a10', cap: '#f2c230', capH: 6,
    label: g => lab(g, g.yn + 4, 88 - g.yn - 6, '#f6efd8', [['AROMATIC', 2.4, '#a8141e', 8], ['BITTERS', 2.8, '#111', 13], ['≡≡≡', 2.6, '#999', 19], ['≡≡≡', 2.6, '#999', 24]], { x0: 9, x1: 31, in: 0 }) }),
  orangebitters: () => bottle('orangebitters', { w: 12, h: 24, sh: 6, nh: 6, neck: 5, liquid: '#e08a2a', glass: 'rgba(200,120,40,.5)', cap: '#e08a2a', capKind: 'dropper',
    label: g => lab(g, g.yb + 8, 9, '#fff', [['ORANGE', 1.9, '#c0561a', 5.5]]) }),
  peychauds: () => bottle('peychauds', { w: 14, h: 30, sh: 7, nh: 10, neck: 5, liquid: '#c42a2a', cap: '#f2c230',
    label: g => lab(g, g.yb + 8, 12, '#f6efd8', [['CREOLE', 2, '#c42a2a', 5], ['BITTERS', 2, '#111', 9]]) }),
  absinthe: () => bottle('absinthe', { w: 16, h: 40, sh: 10, nh: 12, neck: 6, liquid: '#9ad06a', cap: '#111',
    label: g => lab(g, g.yb + 12, 14, '#f3ecd6', [['ABSINTHE', 2.3, '#2a6a1a', 6], ['SUPÉRIEURE', 1.7, '#111', 10]]) }),
  worcestershire: () => bottle('worcestershire', { w: 14, h: 30, sh: 8, nh: 10, neck: 5, glass: '#3a1a0a', cap: '#111',
    inside: g => `<rect x="0" y="${g.yb - 2}" width="40" height="50" fill="#e8c58a"/><path d="M0,${g.yb + 4} L40,${g.yb + 6} M0,${g.yb + 20} L40,${g.yb + 22}" stroke="#c9a46a" stroke-width=".8"/>`,
    label: g => lab(g, g.yb + 8, 10, '#e0761e', [['SAUCE', 2.3, '#fff', 6]]) }),
  hotsauce: () => bottle('hotsauce', { w: 10, h: 20, sh: 6, nh: 10, neck: 4, liquid: '#d8301c', fill: 64, capKind: 'foil', cap: '#2f7a3a',
    label: g => `<path d="M20,${g.yb + 4} L${g.x1 - .5},${g.yb + 10} L20,${g.yb + 16} L${g.x0 + .5},${g.yb + 10} Z" fill="#fff" stroke="${INK}" stroke-width=".8"/>` + tx(20, g.yb + 11, 1.8, 'HOT', '#d8301c') }),
};
function bottleArt(k) { return (BOTTLE_ART[k] || (() => bottle(k, { liquid: ING[k].color })))(); }

// ---------- The well: ice, garnish tray, rimmers ----------
const TRAY = '#c9ced4', TRAYD = '#8d949c';
function compartment(inner) {
  return `<svg viewBox="0 0 70 54"><rect x="2" y="2" width="66" height="50" rx="5" fill="${TRAYD}" stroke="${INK}" stroke-width="2.5"/><rect x="6" y="6" width="58" height="42" rx="3" fill="#5d646c"/>${inner}</svg>`;
}
function wedges(c, l, n = 6) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = 12 + (i % 3) * 17 + (i > 2 ? 6 : 0), y = i > 2 ? 40 : 26, a = (i * 37) % 50 - 25;
    s += `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M-9,0 A9,9 0 0 1 9,0 Z" fill="${c}" stroke="${INK}" stroke-width="1.5"/><path d="M-6.5,-.5 A6.5,6.5 0 0 1 6.5,-.5 Z" fill="${l}"/><path d="M0,-.5 L0,-6 M0,-.5 L-4.5,-4 M0,-.5 L4.5,-4" stroke="${c}" stroke-width="1"/></g>`;
  }
  return s;
}
function wheels(c, l, n = 5) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = 16 + (i % 3) * 19 + (i > 2 ? 9 : 0), y = i > 2 ? 37 : 21;
    s += `<g transform="translate(${x} ${y})"><circle r="9" fill="${c}" stroke="${INK}" stroke-width="1.5"/><circle r="6.8" fill="${l}"/>${[0, 60, 120].map(a => `<path d="M${-6.8 * Math.cos(a * Math.PI / 180)},${-6.8 * Math.sin(a * Math.PI / 180)} L${6.8 * Math.cos(a * Math.PI / 180)},${6.8 * Math.sin(a * Math.PI / 180)}" stroke="${c}" stroke-width=".9"/>`).join('')}</g>`;
  }
  return s;
}
const WELL = {
  lime: () => compartment(wedges('#4f9e2a', '#c4ea86')),
  lemon: () => compartment(wheels('#e8c21c', '#fff3a0')),
  orange: () => compartment(wheels('#ef8a1c', '#ffd08a')),
  cherry: () => compartment(`<rect x="6" y="20" width="58" height="28" fill="#6a0a1a"/>` + [[14, 22], [24, 28], [36, 22], [48, 27], [58, 21], [19, 38], [31, 40], [44, 39], [55, 38]].map(([x, y], i) => `<path d="M${x},${y - 3} Q${x + 4},${y - 12} ${x + 8 - i % 3 * 4},${y - 16}" stroke="#3a6a1a" stroke-width="1.6" fill="none"/><circle cx="${x}" cy="${y}" r="5.5" fill="#d0122e" stroke="${INK}" stroke-width="1.2"/><circle cx="${x - 2}" cy="${y - 2}" r="1.5" fill="#fff" opacity=".7"/>`).join('')),
  olive: () => compartment(`<rect x="6" y="18" width="58" height="30" fill="#a8b47a" opacity=".6"/>` + [[15, 20], [28, 18], [42, 21], [55, 18], [20, 34], [34, 36], [48, 34], [58, 38], [12, 40]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="4.6" fill="#7f9b2c" stroke="${INK}" stroke-width="1.2"/><circle cx="${x - 1}" cy="${y - 1}" r="1.8" fill="#d23a2a"/>`).join('')),
  onion: () => compartment(`<rect x="6" y="18" width="58" height="30" fill="#dfe6e0" opacity=".5"/>` + [[14, 20], [25, 17], [36, 21], [47, 18], [58, 21], [19, 33], [31, 35], [43, 32], [55, 35], [12, 42], [38, 43]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#f6f2e2" stroke="${INK}" stroke-width="1.1"/><path d="M${x - 2},${y - 2} Q${x},${y + 2} ${x + 2},${y - 2}" stroke="#c9c0a0" fill="none" stroke-width=".7"/>`).join('')),
  pineapple: () => compartment([[16, 30, -10], [34, 26, 8], [52, 32, -4], [26, 44, 12], [46, 44, -12]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M-10,8 L10,8 L0,-9 Z" fill="#f5d033" stroke="${INK}" stroke-width="1.3"/><path d="M-10,8 L10,8" stroke="#a87a2a" stroke-width="2"/></g>`).join('')),
  mint: () => compartment([[16, 26], [30, 32], [44, 24], [56, 34], [22, 42], [40, 42]].map(([x, y], i) => `<g transform="translate(${x} ${y}) rotate(${i * 50})"><path d="M0,0 C-7,-2 -7,-10 -1,-12 C0,-6 1,-3 0,0 Z" fill="#3fae4a" stroke="${INK}" stroke-width="1"/><path d="M0,0 C7,-2 7,-10 1,-12 C0,-6 -1,-3 0,0 Z" fill="#5ccc5a" stroke="${INK}" stroke-width="1"/></g>`).join('')),
  celery: () => compartment([12, 22, 32, 42, 52].map((x, i) => `<g transform="rotate(${-8 + i * 4} ${x} 30)"><rect x="${x - 3}" y="12" width="7" height="34" rx="3" fill="${i % 2 ? '#9cd06a' : '#b2dc80'}" stroke="${INK}" stroke-width="1.2"/><path d="M${x},14 C${x - 5},6 ${x - 8},10 ${x - 6},12 M${x},14 C${x + 3},5 ${x + 8},8 ${x + 6},12" stroke="#3fae4a" stroke-width="2.4" fill="none"/></g>`).join('')),
  nutmeg: () => `<svg viewBox="0 0 70 54"><ellipse cx="35" cy="46" rx="30" ry="6" fill="#f2efe6" stroke="${INK}" stroke-width="2"/><rect x="14" y="8" width="14" height="38" rx="2" fill="#c8d0d8" stroke="${INK}" stroke-width="2"/>${[12, 17, 22, 27, 32, 37].map(y => `<path d="M17,${y} L25,${y}" stroke="#7a828a" stroke-width="1.2" stroke-dasharray="1.5 1.5"/>`).join('')}<ellipse cx="44" cy="38" rx="9" ry="7.5" fill="#8a5a2a" stroke="${INK}" stroke-width="1.6"/><path d="M38,36 Q44,32 50,37 M39,41 Q45,38 49,42" stroke="#5a3a1a" stroke-width="1" fill="none"/><circle cx="56" cy="44" r="1.2" fill="#8a5a2a"/><circle cx="60" cy="42" r="1" fill="#8a5a2a"/></svg>`,
  beans: () => `<svg viewBox="0 0 70 54"><ellipse cx="35" cy="40" rx="27" ry="11" fill="#fff" stroke="${INK}" stroke-width="2"/><ellipse cx="35" cy="36" rx="22" ry="7" fill="#e8e2d6"/>${[[24, 34], [32, 31], [41, 33], [48, 36], [28, 39], [37, 38], [45, 40]].map(([x, y], i) => `<g transform="rotate(${i * 40} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="4" ry="2.8" fill="#4a2a12" stroke="${INK}" stroke-width=".8"/><path d="M${x - 3},${y} L${x + 3},${y}" stroke="#a87a4a" stroke-width=".8"/></g>`).join('')}</svg>`,
  saltrim: () => rimmer('#ffffff', 'SALT'),
  sugarrim: () => rimmer('#ffe8f2', 'SUGAR'),
};
function rimmer(grain, word) {
  let dots = '';
  for (let i = 0; i < 40; i++) { const a = i * 2.4, r = 6 + (i * 7) % 16; dots += `<circle cx="${35 + r * Math.cos(a)}" cy="${30 + r * Math.sin(a) * .4}" r=".9" fill="#c8c0b8"/>`; }
  return `<svg viewBox="0 0 70 54"><ellipse cx="35" cy="44" rx="30" ry="8" fill="#2a2a2a" stroke="${INK}" stroke-width="2"/><rect x="5" y="30" width="60" height="14" fill="#2a2a2a"/><ellipse cx="35" cy="30" rx="30" ry="9" fill="#3a3a3a" stroke="${INK}" stroke-width="2"/><ellipse cx="35" cy="30" rx="25" ry="6.5" fill="${grain}"/>${dots}<rect x="22" y="40" width="26" height="8" rx="2" fill="#f2c230" stroke="${INK}" stroke-width="1.2"/>${tx(35, 46.2, 5.4, word, INK, 'font-family="Fredoka,sans-serif"')}</svg>`;
}
function iceWell() {
  let cubes = '';
  const rnd = i => (Math.sin(i * 91.7) + 1) / 2;
  for (let i = 0; i < 42; i++) {
    const x = 14 + (i % 7) * 18 + rnd(i) * 6, y = 24 + Math.floor(i / 7) * 13 + rnd(i + 9) * 5, a = rnd(i + 3) * 50 - 25;
    cubes += `<rect x="${x}" y="${y}" width="15" height="13" rx="3" transform="rotate(${a} ${x + 7} ${y + 6})" fill="#e6f6ff" stroke="#8cc4e6" stroke-width="1.4"/><path d="M${x + 3},${y + 3} L${x + 8},${y + 3}" stroke="#fff" stroke-width="1.6" transform="rotate(${a} ${x + 7} ${y + 6})"/>`;
  }
  return `<svg viewBox="0 0 150 110"><rect x="3" y="8" width="144" height="99" rx="8" fill="#b8c0c8" stroke="${INK}" stroke-width="3"/><rect x="10" y="16" width="130" height="86" rx="4" fill="#9fb4c4"/>${cubes}
    <g transform="rotate(-18 95 50)"><path d="M70,40 Q70,26 92,26 L112,26 Q118,26 118,33 L118,55 Q118,62 112,62 L92,62 Q70,62 70,48 Z" fill="#dfe5ea" stroke="${INK}" stroke-width="2.5"/><path d="M76,36 Q80,30 92,30" stroke="#fff" stroke-width="2.5" fill="none"/><rect x="118" y="38" width="30" height="12" rx="5" fill="#2a2a2a" stroke="${INK}" stroke-width="2.5"/></g>
    <rect x="3" y="2" width="144" height="12" rx="4" fill="#d6dbe0" stroke="${INK}" stroke-width="3"/>${tx(75, 11, 7, 'ICE', '#5a6a7a', 'font-family="Fredoka,sans-serif" letter-spacing="2"')}</svg>`;
}
