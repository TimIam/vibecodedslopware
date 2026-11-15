// Turn flow, shared by the page and the headless sim (no DOM in here).
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
    this.phase = 'ai';           // 'ai' | 'deploy' | 'over'
    this.result = null;          // { win, reason, by }
    this.log = [];               // { san, side, round }
    this.deployed = 0;
    this.lastMove = null;
    this.alert = null;           // 'check' | 'mate' when a deployment is urgent
  }

  get status() { return C.status(this.board, this.turn); }

  // One general makes a move. Returns the move (with san) or null.
  aiMove() {
    if (this.phase !== 'ai') return null;
    const side = this.turn;
    const m = C.chooseMove(this.board, side, { ...this.m.ai, rng: this.rng });
    if (!m) return null; // shouldn't happen: settle() catches dead positions
    m.san = C.moveSAN(this.board, m);
    m.piece = this.board[m.from];
    m.side = side;
    if (m.cap) this.casualties++;
    this.board = C.applyMove(this.board, m);
    this.lastMove = m;
    this.log.push({ san: m.san, side, round: this.round });
    this.turn = C.other(side);
    const deployNow = this.m.deploy === 'both' || side === 'b';
    if (side === 'b') this.round++;
    if (deployNow && this.reservesOrMoves()) {
      const st = this.status;
      if (st.over && st.result === 'stalemate') return this.end(true, 'self', m), m;
      this.phase = 'deploy';
      this.alert = st.over ? 'mate' : st.check ? 'check' : null;
    } else this.settle();
    return m;
  }

  reservesOrMoves() { return this.reserves > 0 || this.board.includes('U'); }

  // After a deployment (or a move without one): has the war stopped?
  settle() {
    this.alert = null;
    const st = this.status;
    if (st.over) {
      if (st.result === 'stalemate') return this.end(true, 'stalemate');
      return this.end(false, 'checkmate', C.other(this.turn));
    }
    if (this.round > this.m.mandate) return this.end(false, 'mandate');
    this.phase = 'ai';
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

  // ---------- your actions ----------
  canDeploy(s) { return this.phase === 'deploy' && this.reserves > 0 && C.canDeploy(this.board, s); }
  deploy(s) {
    if (!this.canDeploy(s)) return false;
    this.board = this.board.slice(); this.board[s] = 'U';
    this.reserves--; this.deployed++;
    this.lastAction = { type: 'deploy', to: s };
    this.settle();
    return true;
  }
  canRedeploy(from, to) {
    return this.phase === 'deploy' && C.redeploySquares(this.board, from).includes(to);
  }
  redeploy(from, to) {
    if (!this.canRedeploy(from, to)) return false;
    this.board = this.board.slice(); this.board[from] = null; this.board[to] = 'U';
    this.lastAction = { type: 'redeploy', from, to };
    this.settle();
    return true;
  }
  abstain() {
    if (this.phase !== 'deploy') return false;
    this.lastAction = { type: 'abstain' };
    this.settle();
    return true;
  }

  // Everything you could do right now, as {type, to, from}.
  actions() {
    if (this.phase !== 'deploy') return [];
    const out = [{ type: 'abstain' }];
    if (this.reserves > 0) for (const s of C.deploySquares(this.board)) out.push({ type: 'deploy', to: s });
    for (let s = 0; s < 64; s++) if (this.board[s] === 'U')
      for (const t of C.redeploySquares(this.board, s)) out.push({ type: 'redeploy', from: s, to: t });
    return out;
  }
  act(a) {
    if (a.type === 'deploy') return this.deploy(a.to);
    if (a.type === 'redeploy') return this.redeploy(a.from, a.to);
    return this.abstain();
  }
}

// A simple advisor: greedy one-step search used by the sim and the hint button.
export function advise(g) {
  const acts = g.actions();
  let best = null, bestSc = -Infinity;
  for (const a of acts) {
    const b = g.board.slice();
    if (a.type === 'deploy') b[a.to] = 'U';
    else if (a.type === 'redeploy') { b[a.from] = null; b[a.to] = 'U'; }
    const side = g.turn;
    const mv = C.legalMoves(b, side);
    let sc;
    if (!mv.length) sc = C.inCheck(b, side) ? -1e9 : 1e9;
    else {
      const ov = C.legalMoves(b, C.other(side)).length;
      // squeeze whichever army is closer to stuck; keep reserves when it doesn't help
      sc = -Math.min(mv.length, ov) * 12 - (mv.length + ov) - (a.type === 'deploy' ? 1.5 : 0);
      if (C.inCheck(b, side) && mv.length <= 2) sc -= 40;
    }
    sc += g.rng() * 0.5;
    if (sc > bestSc) { bestSc = sc; best = a; }
  }
  return best;
}
