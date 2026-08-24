'use strict';

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST = {
  p: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ]
};

const MATE = 100000;

function pstIndex(sq, color) {
  const f = sq & 7, r = sq >> 3;
  return color === 'w' ? (7 - r) * 8 + f : r * 8 + f;
}

function evaluate(game) {
  let score = 0;
  const b = game.board;
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p) continue;
    const color = game.colorOf(p);
    const type = p.toLowerCase();
    const val = PIECE_VALUE[type] + PST[type][pstIndex(sq, color)];
    score += color === 'w' ? val : -val;
  }
  // лёгкий бонус за подвижность в эндшпиле не нужен — держим просто
  return game.turn === 'w' ? score : -score;
}

function orderMoves(moves) {
  for (const m of moves) {
    m._score = 0;
    if (m.captured) {
      m._score += 10 * PIECE_VALUE[m.captured.toLowerCase()] - PIECE_VALUE[m.piece.toLowerCase()];
    }
    if (m.promotion) m._score += PIECE_VALUE[m.promotion.toLowerCase()];
  }
  moves.sort((a, b2) => b2._score - a._score);
  return moves;
}

function quiescence(game, alpha, beta, depth) {
  const stand = evaluate(game);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;

  const caps = orderMoves(game.generateMoves(true, true));
  for (const m of caps) {
    game.make(m);
    const score = -quiescence(game, -beta, -alpha, depth - 1);
    game.unmake();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(game, depth, alpha, beta, ply, useQ) {
  if (depth === 0) {
    return useQ ? quiescence(game, alpha, beta, 6) : evaluate(game);
  }
  const us = game.turn;
  const moves = orderMoves(game.generateMoves(true));
  if (moves.length === 0) {
    return game.inCheck(us) ? -(MATE - ply) : 0;
  }
  if (game.fiftyMoveDraw() || game.insufficientMaterial()) return 0;

  for (const m of moves) {
    game.make(m);
    const score = -negamax(game, depth - 1, -beta, -alpha, ply + 1, useQ);
    game.unmake();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function findBestMove(realGame, difficulty) {
  const game = realGame.clone();
  const depth = Math.max(1, Math.min(3, difficulty));
  const useQ = depth >= 3;
  const moves = orderMoves(game.generateMoves(true));
  if (!moves.length) return null;

  const scored = [];
  let alpha = -Infinity;
  for (const m of moves) {
    game.make(m);
    const score = -negamax(game, depth - 1, -Infinity, -alpha, 1, useQ);
    game.unmake();
    scored.push({ m, score });
    if (score > alpha) alpha = score;
  }

  scored.sort((a, b) => b.score - a.score);

  // Разнообразие игры: на низких уровнях выбираем случайно среди близких ходов
  const windowCp = depth === 1 ? 60 : depth === 2 ? 25 : 8;
  const bestScore = scored[0].score;
  const pool = scored.filter(s => s.score >= bestScore - windowCp);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick.m;
}

window.ChessAI = { findBestMove };
