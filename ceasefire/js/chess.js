// Ceasefire chess engine. Plain chess (no castling, no en passant, pawns
// promote to queens) plus 'U': a UN peacekeeper. Peacekeepers belong to
// nobody, can't be captured, and block every piece and every line of attack.
// Knights still jump over them, as knights do.
//
// Board: array of 64, index = rank * 8 + file, rank 0 is White's back rank.
// Pieces: 'PNBRQK' white, 'pnbrqk' black, 'U' peacekeeper, null empty.

export const VAL = { P: 100, N: 310, B: 320, R: 500, Q: 900, K: 0 };
export const FILES = 'abcdefgh';
export const sqName = s => FILES[s & 7] + ((s >> 3) + 1);
export const sqOf = n => FILES.indexOf(n[0]) + (Number(n[1]) - 1) * 8;
export const colorOf = p => (!p || p === 'U') ? null : (p === p.toUpperCase() ? 'w' : 'b');
export const other = c => c === 'w' ? 'b' : 'w';
export const kindOf = p => p.toUpperCase();

const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KG = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISH = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function parseFEN(fen) {
  const [rows, turn = 'w'] = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  rows.split('/').forEach((row, i) => {
    const r = 7 - i; let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else { board[r * 8 + f] = ch; f++; }
    }
  });
  return { board, turn };
}

export function toFEN(board, turn) {
  let out = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', e = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) e++; else { if (e) row += e; e = 0; row += p; }
    }
    if (e) row += e;
    out.push(row);
  }
  return out.join('/') + ' ' + turn;
}

export function kingSq(b, c) {
  const k = c === 'w' ? 'K' : 'k';
  for (let i = 0; i < 64; i++) if (b[i] === k) return i;
  return -1;
}

// Is square s attacked by colour `by`?
export function attacked(b, s, by) {
  const f = s & 7, r = s >> 3;
  const up = by === 'w' ? -1 : 1; // attacker pawns sit one rank behind (from their view)
  const P = by === 'w' ? 'P' : 'p', N = by === 'w' ? 'N' : 'n', K = by === 'w' ? 'K' : 'k';
  const Bq = by === 'w' ? 'B' : 'b', Rq = by === 'w' ? 'R' : 'r', Q = by === 'w' ? 'Q' : 'q';
  for (const df of [-1, 1]) {
    const ff = f + df, rr = r + up;
    if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[rr * 8 + ff] === P) return true;
  }
  for (const [df, dr] of KN) {
    const ff = f + df, rr = r + dr;
    if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[rr * 8 + ff] === N) return true;
  }
  for (const [df, dr] of KG) {
    const ff = f + df, rr = r + dr;
    if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[rr * 8 + ff] === K) return true;
  }
  for (const [df, dr] of ROOK) {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
      const p = b[rr * 8 + ff];
      if (p) { if (p === Rq || p === Q) return true; break; }
      ff += df; rr += dr;
    }
  }
  for (const [df, dr] of BISH) {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
      const p = b[rr * 8 + ff];
      if (p) { if (p === Bq || p === Q) return true; break; }
      ff += df; rr += dr;
    }
  }
  return false;
}

export const inCheck = (b, c) => { const k = kingSq(b, c); return k >= 0 && attacked(b, k, other(c)); };

// Pseudo-legal moves for colour c.
export function pseudoMoves(b, c, capturesOnly = false) {
  const out = [];
  const enemy = p => p && p !== 'U' && colorOf(p) !== c;
  for (let s = 0; s < 64; s++) {
    const p = b[s];
    if (!p || colorOf(p) !== c) continue;
    const f = s & 7, r = s >> 3, k = kindOf(p);
    const push = (t, promo) => out.push({ from: s, to: t, cap: b[t] || null, promo: promo || null });
    if (k === 'P') {
      const dir = c === 'w' ? 1 : -1, last = c === 'w' ? 7 : 0, start = c === 'w' ? 1 : 6;
      const r1 = r + dir;
      if (r1 >= 0 && r1 < 8) {
        if (!capturesOnly && !b[r1 * 8 + f]) {
          push(r1 * 8 + f, r1 === last ? 'Q' : null);
          const r2 = r + 2 * dir;
          if (r === start && !b[r2 * 8 + f]) push(r2 * 8 + f);
        }
        for (const df of [-1, 1]) {
          const ff = f + df;
          if (ff >= 0 && ff < 8 && enemy(b[r1 * 8 + ff])) push(r1 * 8 + ff, r1 === last ? 'Q' : null);
        }
      }
    } else if (k === 'N' || k === 'K') {
      for (const [df, dr] of (k === 'N' ? KN : KG)) {
        const ff = f + df, rr = r + dr;
        if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
        const t = rr * 8 + ff, q = b[t];
        if (!q ? !capturesOnly : enemy(q)) push(t);
      }
    } else {
      const dirs = k === 'R' ? ROOK : k === 'B' ? BISH : KG;
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const t = rr * 8 + ff, q = b[t];
          if (!q) { if (!capturesOnly) push(t); }
          else { if (enemy(q)) push(t); break; }
          ff += df; rr += dr;
        }
      }
    }
  }
  return out;
}

export function applyMove(b, m) {
  const nb = b.slice();
  const p = nb[m.from];
  nb[m.from] = null;
  nb[m.to] = m.promo ? (colorOf(p) === 'w' ? m.promo : m.promo.toLowerCase()) : p;
  return nb;
}

export function legalMoves(b, c, capturesOnly = false) {
  return pseudoMoves(b, c, capturesOnly).filter(m => !inCheck(applyMove(b, m), c));
}

// Game state from the side to move's point of view.
export function status(b, c) {
  const moves = legalMoves(b, c);
  const check = inCheck(b, c);
  if (!moves.length) return { over: true, result: check ? 'checkmate' : 'stalemate', check, moves };
  return { over: false, result: null, check, moves };
}

// ---------- peacekeepers ----------
export const neighbours = s => {
  const f = s & 7, r = s >> 3, out = [];
  for (const [df, dr] of KG) {
    const ff = f + df, rr = r + dr;
    if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) out.push(rr * 8 + ff);
  }
  return out;
};

// Fresh peacekeepers walk on from the sidelines (the a- and h-files) or
// join an existing peacekeeper on an adjacent square.
export function canDeploy(b, s) {
  if (b[s]) return false;
  const f = s & 7;
  if (f === 0 || f === 7) return true;
  return neighbours(s).some(n => b[n] === 'U');
}
export const deploySquares = b => { const o = []; for (let s = 0; s < 64; s++) if (canDeploy(b, s)) o.push(s); return o; };
export const redeploySquares = (b, from) => b[from] === 'U' ? neighbours(from).filter(n => !b[n]) : [];

// ---------- the generals ----------
// Small piece-square nudges: centre the minors, push the pawns.
const CENTER = [0, 1, 2, 3, 3, 2, 1, 0];
function pst(k, s, c) {
  const f = s & 7, r = s >> 3, rr = c === 'w' ? r : 7 - r;
  switch (k) {
    case 'P': return rr * 7 + (f > 1 && f < 6 ? rr * 2 : 0);
    case 'N': return (CENTER[f] + CENTER[r]) * 6 - 10;
    case 'B': return (CENTER[f] + CENTER[r]) * 4;
    case 'R': return rr === 6 ? 15 : 0;
    case 'Q': return (CENTER[f] + CENTER[r]) * 2;
    case 'K': return 0;
  }
  return 0;
}

export function material(b, c) {
  let m = 0;
  for (let s = 0; s < 64; s++) { const p = b[s]; if (p && colorOf(p) === c) m += VAL[kindOf(p)]; }
  return m;
}

function evaluate(b, c, opt, myMoves) {
  let score = 0;
  for (let s = 0; s < 64; s++) {
    const p = b[s];
    if (!p || p === 'U') continue;
    const k = kindOf(p), pc = colorOf(p);
    const v = VAL[k] + pst(k, s, pc);
    score += pc === c ? v : -v;
  }
  if (opt.mob) {
    const theirs = pseudoMoves(b, other(c)).length;
    score += opt.mob * (myMoves - theirs);
  }
  // A cornered enemy king is a happy general: drives mating play in endgames.
  const ek = kingSq(b, other(c)), mk = kingSq(b, c);
  if (ek >= 0 && mk >= 0 && material(b, other(c)) < 600) {
    const ef = ek & 7, er = ek >> 3;
    score += (6 - CENTER[ef] - CENTER[er]) * 12;
    const dist = Math.max(Math.abs(ef - (mk & 7)), Math.abs(er - (mk >> 3)));
    score += (7 - dist) * 4;
  }
  return score;
}

const MATE = 100000;
let nodes = 0;

function order(moves) {
  return moves.sort((a, b) =>
    ((b.cap ? VAL[kindOf(b.cap)] * 10 : 0) + (b.promo ? 800 : 0)) -
    ((a.cap ? VAL[kindOf(a.cap)] * 10 : 0) + (a.promo ? 800 : 0)));
}

function quiesce(b, c, alpha, beta, opt, qd) {
  nodes++;
  const stand = evaluate(b, c, { ...opt, mob: 0 }, 0);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (qd <= 0) return stand;
  for (const m of order(legalMoves(b, c, true))) {
    const sc = -quiesce(applyMove(b, m), other(c), -beta, -alpha, opt, qd - 1);
    if (sc >= beta) return sc;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function negamax(b, c, depth, alpha, beta, opt, ply) {
  nodes++;
  const moves = legalMoves(b, c);
  if (!moves.length) return inCheck(b, c) ? -MATE + ply : (opt.drawScore || 0);
  if (depth <= 0) {
    if (opt.quiesce) {
      const q = quiesce(b, c, alpha, beta, opt, 4);
      return q + (opt.mob ? opt.mob * (moves.length - pseudoMoves(b, other(c)).length) : 0);
    }
    return evaluate(b, c, opt, moves.length);
  }
  let best = -Infinity;
  for (const m of order(moves)) {
    const sc = -negamax(applyMove(b, m), other(c), depth - 1, -beta, -alpha, opt, ply + 1);
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}

// opt: { depth, noise, mob, quiesce, rng }
export function chooseMove(b, c, opt = {}) {
  const depth = opt.depth ?? 2, rng = opt.rng || Math.random;
  const moves = order(legalMoves(b, c));
  if (!moves.length) return null;
  nodes = 0;
  let best = null, bestSc = -Infinity;
  for (const m of moves) {
    let sc = -negamax(applyMove(b, m), other(c), depth - 1, -Infinity, Infinity, opt, 1);
    sc += (rng() - 0.5) * (opt.noise || 0);
    if (sc > bestSc) { bestSc = sc; best = m; }
  }
  best.score = bestSc; best.nodes = nodes;
  return best;
}

export function moveSAN(b, m) {
  const p = b[m.from], k = kindOf(p);
  const nb = applyMove(b, m), opp = other(colorOf(p));
  const st = status(nb, opp);
  const suffix = st.result === 'checkmate' ? '#' : st.check ? '+' : '';
  if (k === 'P') return (m.cap ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=Q' : '') + suffix;
  return k + (m.cap ? 'x' : '') + sqName(m.to) + suffix;
}
