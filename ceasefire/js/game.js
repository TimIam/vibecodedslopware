// Turn flow, shared by the page and the headless sim (no DOM in here).
//
// The generals play each other on a clock and never wait for you. Every
// general's move earns you an order (up to `bank` saved), and you can spend
// one at any moment: insert a new peacekeeper, or pick one up and move it.
import * as C from './chess.js';

export class Game {
  constructor(mission, rng = Math.random) {
    this.m = mission;
    this.rng = rng;
    const { board, turn } = C.parseFEN(mission.fen);
    this.board = board;
    this.turn = turn;            // side to move next on the chessboard
    this.round = 1;
    this.reserves = mission.reserves;
    this.casualties = 0;
    this.phase = 'play';         // 'play' | 'over'
    this.result = null;          // { win, reason, by, stars }
    this.log = [];               // { san, side, round }
    this.deployed = 0;
    this.lastMove = null;
    this.bank = mission.bank ?? 2;
    this.orders = mission.startOrders ?? 1;
  }

  get status() { return C.status(this.board, this.turn); }
  // 'mate' or 'check' while the side to move is in trouble: block it before the clock runs out
  get alert() {
    if (this.phase !== 'play') return null;
    const st = this.status;
    return st.over && st.result === 'checkmate' ? 'mate' : st.check ? 'check' : null;
  }

  // The clock ticks: the side to move plays, unless the war is already decided.
  tick() {
    if (this.phase !== 'play') return null;
    const st = this.status;
    if (st.over) {
      if (st.result === 'stalemate') this.end(true, 'stalemate');
      else this.end(false, 'checkmate', C.other(this.turn));
      return null;
    }
    const side = this.turn;
    const m = C.chooseMove(this.board, side, { ...this.m.ai, rng: this.rng });
    m.san = C.moveSAN(this.board, m);
    m.piece = this.board[m.from];
    m.side = side;
    if (m.cap) this.casualties++;
    this.board = C.applyMove(this.board, m);
    this.lastMove = m;
    this.log.push({ san: m.san, side, round: this.round });
    this.turn = C.other(side);
    if (side === 'b') this.round++;
    if (this.m.orders !== 'black' || side === 'b') this.orders = Math.min(this.bank, this.orders + 1);
    const after = this.status;
    if (after.over && after.result === 'stalemate') this.end(true, 'self');
    else if (this.round > this.m.mandate && !after.over) this.end(false, 'mandate');
    // a checkmate is not final until the next tick: you get the gap to block it
    return m;
  }

  // After one of your orders: did it lock the game?
  check() {
    const st = this.status;
    if (st.over && st.result === 'stalemate') this.end(true, 'stalemate');
  }

  end(win, reason, by) {
    this.phase = 'over';
    this.result = { win, reason, by, stars: win ? this.stars() : 0 };
  }

  stars() {
    let s = 1;
    if (this.round - 1 <= this.m.par) s++;
    if (this.casualties <= this.m.casualties) s++;
    return s;
  }

  // ---------- your orders ----------
  get ready() { return this.phase === 'play' && this.orders > 0; }
  canInsert(s) { return this.ready && this.reserves > 0 && C.canDeploy(this.board, s); }
  insert(s) {
    if (!this.canInsert(s)) return false;
    this.board = this.board.slice(); this.board[s] = 'U';
    this.reserves--; this.deployed++; this.orders--;
    this.lastAction = { type: 'insert', to: s };
    this.check();
    return true;
  }
  // A peacekeeper can be moved anywhere a new one could go (sidelines or next
  // to another helmet), as long as it isn't only propping itself up.
  moveTargets(from) {
    if (this.board[from] !== 'U') return [];
    const b = this.board.slice(); b[from] = null;
    return C.deploySquares(b).filter(s => s !== from);
  }
  canMove(from, to) { return this.ready && this.moveTargets(from).includes(to); }
  move(from, to) {
    if (!this.canMove(from, to)) return false;
    this.board = this.board.slice(); this.board[from] = null; this.board[to] = 'U';
    this.orders--;
    this.lastAction = { type: 'move', from, to };
    this.check();
    return true;
  }

  // Everything you could do right now, as {type, to, from}.
  actions() {
    if (!this.ready) return [];
    const out = [];
    if (this.reserves > 0) for (const s of C.deploySquares(this.board)) out.push({ type: 'insert', to: s });
    for (let s = 0; s < 64; s++) if (this.board[s] === 'U')
      for (const t of this.moveTargets(s)) out.push({ type: 'move', from: s, to: t });
    return out;
  }
  act(a) {
    if (!a) return false;
    if (a.type === 'insert') return this.insert(a.to);
    if (a.type === 'move') return this.move(a.from, a.to);
    return false;
  }
}

// A simple advisor: greedy one-step search used by the sim and the Advisor
// button. Returns null when holding the order is better than any action.
export function advise(g) {
  const score = b => {
    const side = g.turn;
    const mv = C.legalMoves(b, side);
    if (!mv.length) return C.inCheck(b, side) ? -1e9 : 1e9;
    const ov = C.legalMoves(b, C.other(side)).length;
    // squeeze whichever army is closer to stuck
    let sc = -Math.min(mv.length, ov) * 12 - (mv.length + ov);
    if (C.inCheck(b, side) && mv.length <= 2) sc -= 40;
    return sc;
  };
  let best = null, bestSc = score(g.board) + 2; // holding keeps an order in the bank
  for (const a of g.actions()) {
    const b = g.board.slice();
    if (a.type === 'insert') b[a.to] = 'U';
    else { b[a.from] = null; b[a.to] = 'U'; }
    const sc = score(b) - (a.type === 'insert' ? 1.5 : 0) + g.rng() * 0.5;
    if (sc > bestSc) { bestSc = sc; best = a; }
  }
  return best;
}
