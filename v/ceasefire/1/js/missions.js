// Each mission: a position the generals start from, how many peacekeepers
// the Security Council gives you, and how many rounds (one White move plus
// one Black move) before the mandate expires.
//   deploy: 'both' = you act after every move, 'black' = only after Black's
//   ai: search settings for both generals (see chooseMove in chess.js)
//   par: rounds for the punctuality star; casualties: cap for the lives star

export const MISSIONS = [
  {
    id: 'kings', name: 'Two Kings and a Queen', where: 'Border post, sector H',
    fen: '8/8/2k5/p7/8/8/3QK3/8 w',
    reserves: 9, mandate: 16, par: 8, casualties: 0, deploy: 'both',
    ai: { depth: 2, noise: 20 },
    brief: "White has a queen and wants a checkmate. Black has a king and one pawn and wants to go home. Fill every square the black king could move to and block the pawn. Do it without the king being in check, or it's checkmate and White wins the war.",
    tip: 'Peacekeepers walk on from the a- and h-files, or next to one already on the board.',
  },
  {
    id: 'pawns', name: 'The Pawn Wall', where: 'Demilitarised zone, ranks 3 to 6',
    fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w',
    reserves: 12, mandate: 24, par: 12, casualties: 2, deploy: 'both',
    ai: { depth: 2, noise: 30 },
    brief: 'Infantry only. A pawn can never move through a peacekeeper, so a helmet in front of a pawn holds it in place for good. Pin one army down before the pawns start trading.',
    tip: 'A pawn can\'t move forward into a peacekeeper. A king boxed in by its own pawns has nowhere to go.',
  },
  {
    id: 'cavalry', name: 'Cavalry Charge', where: 'Open steppe',
    fen: '1n2k1n1/pppppppp/8/8/8/8/PPPPPPPP/1N2K1N1 w',
    reserves: 14, mandate: 26, par: 14, casualties: 3, deploy: 'both',
    ai: { depth: 2, noise: 25 },
    brief: "Knights jump over peacekeepers, so you can't wall them in. You can only fill the squares they would land on.",
    tip: 'A knight is stuck only when every square it could land on is filled.',
  },
  {
    id: 'rooks', name: 'Rook and Roll', where: 'Coastal highway',
    fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w',
    reserves: 14, mandate: 28, par: 14, casualties: 3, deploy: 'both',
    ai: { depth: 2, noise: 25, mob: 1 },
    brief: 'Heavy armour. Rooks behind their own pawns are already stuck, so keep it that way. The generals now care about room to move, and they will open files to get it.',
    tip: 'Don\'t let a rook onto an open file.',
  },
  {
    id: 'opening', name: 'Total War', where: 'The whole board',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w',
    reserves: 12, mandate: 30, par: 12, casualties: 4, deploy: 'both',
    ai: { depth: 2, noise: 20, mob: 1 },
    brief: 'Full armies, full rules, full press coverage. Twelve helmets, thirty-two pieces. Lock one side up before they finish destroying each other.',
    tip: 'From the opening position, one row of helmets in front of the pawns leaves that army with no legal moves.',
  },
  {
    id: 'resolution', name: 'Resolution 64', where: 'Security Council budget cuts',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w',
    reserves: 14, mandate: 32, par: 18, casualties: 4, deploy: 'black',
    ai: { depth: 2, noise: 10, mob: 2, quiesce: true },
    brief: 'Budget cuts. You only get a deployment after Black moves, and the generals read the news: they know what a ceasefire looks like and they will keep their pieces moving.',
    tip: 'One action per round. White moves twice between your turns, in effect. Plan ahead.',
  },
  {
    id: 'grandmasters', name: 'The Grandmasters', where: 'Geneva, closed session',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w',
    reserves: 12, mandate: 30, par: 20, casualties: 6, deploy: 'black',
    ai: { depth: 3, noise: 6, mob: 3, quiesce: true },
    brief: "Two grandmasters who think three moves ahead and hate draws. Twelve helmets. Nobody at the UN expects this to work.",
    tip: 'They see checks coming. They don\'t see you coming.',
  },
];
