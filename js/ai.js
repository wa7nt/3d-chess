'use strict';

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PHASE_VAL = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };

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
  pEg: [
      0,  0,  0,  0,  0,  0,  0,  0,
     90, 90, 90, 90, 90, 90, 90, 90,
     55, 55, 55, 55, 55, 55, 55, 55,
     32, 32, 32, 32, 32, 32, 32, 32,
     20, 20, 20, 20, 20, 20, 20, 20,
     10, 10, 10, 10, 10, 10, 10, 10,
     10, 10, 10, 10, 10, 10, 10, 10,
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
      8, 12, 12, 12, 12, 12, 12,  8,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  4,  8,  8,  4,  0,  0
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
  kMg: [
    -65,-75,-75,-85,-85,-75,-75,-65,
    -55,-65,-65,-75,-75,-65,-65,-55,
    -45,-55,-55,-65,-65,-55,-55,-45,
    -35,-45,-45,-55,-55,-45,-45,-35,
    -25,-35,-35,-45,-45,-35,-35,-25,
    -15,-25,-25,-35,-35,-25,-25,-15,
     -5,-15,-15,-25,-25,-15,-15, -5,
     15, 25, -5, -8, -8,  -5, 25, 15
  ],
  kEg: [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50
  ]
};

const PASSED_BONUS = [0, 8, 14, 24, 42, 68, 110, 0];
const PASSED_BONUS_MG = [0, 5, 8, 14, 22, 34, 50, 0];

function pstIndex(sq, color) {
  const f = sq & 7, r = sq >> 3;
  return color === 'w' ? (7 - r) * 8 + f : r * 8 + f;
}

function evaluate(game) {
  const b = game.board;
  let mg = 0, eg = 0, phase = 0;
  const wf = [0,0,0,0,0,0,0,0], bf = [0,0,0,0,0,0,0,0];
  const wPawns = [], bPawns = [];
  let wB = 0, bB = 0;
  const wRooks = [], bRooks = [];
  let wKing = game.kings.w, bKing = game.kings.b;

  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p) continue;
    const t = p.toLowerCase();
    const white = p === p.toUpperCase();
    const zi = white ? (7 - (sq >> 3)) * 8 + (sq & 7) : (sq >> 3) * 8 + (sq & 7);
    const v = PIECE_VALUE[t];
    if (t !== 'k') {
      mg += (white ? 1 : -1) * (v + PST[t][zi]);
      eg += (white ? 1 : -1) * (v + (t === 'p' ? PST.pEg[zi] : PST[t][zi]));
      phase += PHASE_VAL[t];
    }
    if (t === 'p') {
      if (white) { wf[sq & 7]++; wPawns.push(sq); }
      else { bf[sq & 7]++; bPawns.push(sq); }
    } else if (t === 'b') {
      white ? wB++ : bB++;
    } else if (t === 'r') {
      white ? wRooks.push(sq) : bRooks.push(sq);
    }
  }

  const sign = game.turn === 'w' ? 1 : -1;
  let mgS = 0, egS = 0;

  for (let f = 0; f < 8; f++) {
    if (wf[f] > 1) { mgS -= 12 * (wf[f] - 1); egS -= 22 * (wf[f] - 1); }
    if (bf[f] > 1) { mgS += 12 * (bf[f] - 1); egS += 22 * (bf[f] - 1); }
    const wIso = wf[f] > 0 && (f === 0 || !wf[f - 1]) && (f === 7 || !wf[f + 1]);
    const bIso = bf[f] > 0 && (f === 0 || !bf[f - 1]) && (f === 7 || !bf[f + 1]);
    if (wIso) { mgS -= 14; egS -= 18; }
    if (bIso) { mgS += 14; egS += 18; }
  }

  for (let i = 0; i < wPawns.length; i++) {
    const sq = wPawns[i], f = sq & 7, r = sq >> 3;
    let passed = true;
    for (let j = 0; j < bPawns.length; j++) {
      const bs = bPawns[j];
      if (Math.abs((bs & 7) - f) <= 1 && (bs >> 3) > r) { passed = false; break; }
    }
    if (passed) { mgS += PASSED_BONUS_MG[r]; egS += PASSED_BONUS[r]; }
  }
  for (let i = 0; i < bPawns.length; i++) {
    const sq = bPawns[i], f = sq & 7, r = 7 - (sq >> 3);
    let passed = true;
    for (let j = 0; j < wPawns.length; j++) {
      const ws = wPawns[j];
      if (Math.abs((ws & 7) - f) <= 1 && (7 - (ws >> 3)) > r) { passed = false; break; }
    }
    if (passed) { mgS -= PASSED_BONUS_MG[r]; egS -= PASSED_BONUS[r]; }
  }

  if (wB >= 2) { mgS += 28; egS += 44; }
  if (bB >= 2) { mgS -= 28; egS -= 44; }

  for (let i = 0; i < wRooks.length; i++) {
    const f = wRooks[i] & 7;
    if (!wf[f] && !bf[f]) mgS += 22;
    else if (!wf[f]) mgS += 10;
  }
  for (let i = 0; i < bRooks.length; i++) {
    const f = bRooks[i] & 7;
    if (!wf[f] && !bf[f]) mgS -= 22;
    else if (!bf[f]) mgS -= 10;
  }

  if (wKing >= 0) {
    const kf = wKing & 7, kr = wKing >> 3;
    let shield = 0;
    for (let df = -1; df <= 1; df++) {
      const f = kf + df;
      if (f < 0 || f > 7) continue;
      if (wf[f]) {
        for (let i = 0; i < wPawns.length; i++) {
          const ps = wPawns[i];
          if ((ps & 7) === f) {
            const d = (ps >> 3) - kr;
            if (d === 1 || d === 2) shield++;
            break;
          }
        }
      }
    }
    mgS += shield * 14 - (3 - shield) * 10;
  }
  if (bKing >= 0) {
    const kf = bKing & 7, kr = bKing >> 3;
    let shield = 0;
    for (let df = -1; df <= 1; df++) {
      const f = kf + df;
      if (f < 0 || f > 7) continue;
      if (bf[f]) {
        for (let i = 0; i < bPawns.length; i++) {
          const ps = bPawns[i];
          if ((ps & 7) === f) {
            const d = kr - (ps >> 3);
            if (d === 1 || d === 2) shield++;
            break;
          }
        }
      }
    }
    mgS -= shield * 14 - (3 - shield) * 10;
  }

  const ph = Math.min(24, phase);
  let score = (mg * ph + eg * (24 - ph)) / 24;
  score += (mgS * ph + egS * (24 - ph)) / 24;
  score += 12 * sign;

  return game.turn === 'w' ? score : -score;
}

const MATE = 100000;
const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const ttKey = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);

const killers = [];
const historyTbl = new Int32Array(12 * 64);

function packMove(m) {
  let promo = 15;
  if (m.promotion) promo = { q: 0, r: 1, b: 2, n: 3 }[m.promotion.toLowerCase()];
  return m.from | (m.to << 6) | (promo << 12);
}
function sameMove(m, packed) {
  if ((m.from | (m.to << 6)) !== (packed & 4095)) return false;
  const promo = (packed >> 12) & 15;
  if (promo === 15) return !m.promotion;
  if (!m.promotion) return false;
  return 'qrbn'[promo] === m.promotion.toLowerCase();
}

function clearSearchState() {
  ttKey.fill(0);
  ttFlag.fill(0);
  historyTbl.fill(0);
  killers.length = 0;
}

let nodes = 0;
let deadline = 0;
const ABORT = { abort: true };
let useNull = true;
let useLmr = true;

function sortMoves(moves, ttPacked, ply) {
  for (const m of moves) {
    if (ttPacked && sameMove(m, ttPacked)) m._s = 1e9;
    else if (m.captured) m._s = 1e6 + 10 * PIECE_VALUE[m.captured.toLowerCase()] - PIECE_VALUE[m.piece.toLowerCase()] + (m.promotion ? 500 : 0);
    else if (m.promotion) m._s = 9e5;
    else {
      const k = killers[ply];
      m._s = (k && k[0] && sameMove(m, k[0])) ? 8e5
        : (k && k[1] && sameMove(m, k[1])) ? 7e5
        : historyTbl[(m.from << 6) | m.to];
    }
  }
  moves.sort((a, b) => b._s - a._s);
  return moves;
}

function quiescence(game, alpha, beta, qdepth) {
  nodes++;
  if ((nodes & 2047) === 0 && Date.now() > deadline) throw ABORT;
  const stand = evaluate(game);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (qdepth <= 0) return alpha;

  const caps = game.generateMoves(true, true);
  for (const m of caps) {
    m._s = 10 * PIECE_VALUE[m.captured.toLowerCase()] - PIECE_VALUE[m.piece.toLowerCase()] + (m.promotion ? 800 : 0);
  }
  caps.sort((a, b) => b._s - a._s);

  const us = game.turn;
  for (const m of caps) {
    if (stand + PIECE_VALUE[m.captured.toLowerCase()] + 220 <= alpha) continue;
    game.make(m);
    if (game.inCheck(us)) { game.unmake(); continue; }
    const score = -quiescence(game, -beta, -alpha, qdepth - 1);
    game.unmake();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(game, depth, alpha, beta, ply) {
  nodes++;
  if ((nodes & 2047) === 0 && Date.now() > deadline) throw ABORT;

  const us = game.turn;
  const checked = game.inCheck(us);
  if (checked) depth++;

  if (depth <= 0) return quiescence(game, alpha, beta, 10);

  const idx = game.hash & TT_MASK;
  let ttPacked = 0;
  if (ttFlag[idx] && ttKey[idx] === game.hash) {
    ttPacked = ttMove[idx];
    const eDepth = ttDepth[idx];
    const eScore = ttScore[idx];
    const eFlag = ttFlag[idx];
    if (eDepth >= depth && ply > 0) {
      let s = eScore;
      if (s > MATE - 1000) s -= ply;
      else if (s < -MATE + 1000) s += ply;
      if (eFlag === 1) return s;
      if (eFlag === 2 && s <= alpha) return alpha;
      if (eFlag === 3 && s >= beta) return beta;
    }
  }

  if (useNull && !checked && depth >= 3 && ply > 0 && beta < MATE - 1000) {
    let hasBig = false;
    for (let sq = 0; sq < 64; sq++) {
      const p = game.board[sq];
      if (p && game.colorOf(p) === us && p.toLowerCase() !== 'p' && p.toLowerCase() !== 'k') { hasBig = true; break; }
    }
    if (hasBig) {
      game.make({ null: true });
      const score = -negamax(game, depth - 3, -beta, -beta + 1, ply + 1);
      game.unmake();
      if (score >= beta) return beta;
    }
  }

  const moves = sortMoves(game.generateMoves(false), ttPacked, ply);

  const alphaOrig = alpha;
  let best = -Infinity;
  let bestPacked = 0;
  let legal = 0;

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    game.make(m);
    if (game.inCheck(us)) { game.unmake(); continue; }
    legal++;

    let score;
    const givesCheck = game.inCheck(game.turn);
    const quiet = !m.captured && !m.promotion && !givesCheck;

    if (legal === 1) {
      score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
    } else {
      let reduce = 0;
      if (useLmr && depth >= 3 && i >= 4 && quiet && !checked) {
        reduce = i >= 12 ? 2 : 1;
      }
      score = -negamax(game, depth - 1 - reduce, -alpha - 1, -alpha, ply + 1);
      if (score > alpha && reduce) score = -negamax(game, depth - 1, -alpha - 1, -alpha, ply + 1);
      if (score > alpha && score < beta) score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
    }
    game.unmake();

    if (score > best) {
      best = score;
      bestPacked = packMove(m);
      if (score > alpha) {
        alpha = score;
        if (!m.captured && !m.promotion) {
          historyTbl[(m.from << 6) | m.to] += depth * depth;
          const k = killers[ply] || (killers[ply] = [null, null]);
          if (!k[0] || !sameMove(m, k[0])) { k[1] = k[0]; k[0] = packMove(m); }
        }
        if (alpha >= beta) {
          ttKey[idx] = game.hash;
          ttMove[idx] = bestPacked;
          ttDepth[idx] = depth;
          let st = score > MATE - 1000 ? score + ply : score < -MATE + 1000 ? score - ply : score;
          ttScore[idx] = st | 0;
          ttFlag[idx] = 3;
          return beta;
        }
      }
    }
  }

  if (legal === 0) return checked ? -(MATE - ply) : 0;

  ttKey[idx] = game.hash;
  ttMove[idx] = bestPacked;
  ttDepth[idx] = depth;
  let st = best > MATE - 1000 ? best + ply : best < -MATE + 1000 ? best - ply : best;
  ttScore[idx] = st | 0;
  ttFlag[idx] = best <= alphaOrig ? 2 : 1;
  return best;
}

function findBestMove(realGame, difficulty) {
  const presets = {
    1: { maxDepth: 2, timeMs: 400, window: 120 },
    2: { maxDepth: 8, timeMs: 1500, window: 25 },
    3: { maxDepth: 64, timeMs: 3200, window: 0 }
  };
  const cfg = presets[Math.max(1, Math.min(3, difficulty)) || 2];

  const game = realGame.clone();
  const rootMoves = game.generateMoves(true);
  if (!rootMoves.length) return null;

  clearSearchState();
  nodes = 0;
  deadline = Date.now() + cfg.timeMs;
  useNull = difficulty >= 2;
  useLmr = difficulty >= 2;

  let scored = rootMoves.map(m => ({ m, score: -Infinity }));
  let bestMove = scored[0].m;
  let completedDepth = 0;

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    let iterBest = null, iterBestScore = -Infinity;
    const iterScored = [];
    try {
      let alpha = -Infinity;
      for (const entry of scored) {
        game.make(entry.m);
        let score;
        if (iterBest === null) {
          score = -negamax(game, depth - 1, -Infinity, -alpha, 1);
        } else {
          score = -negamax(game, depth - 1, -alpha - 1, -alpha, 1);
          if (score > alpha) score = -negamax(game, depth - 1, -Infinity, -alpha, 1);
        }
        game.unmake();
        iterScored.push({ m: entry.m, score });
        if (score > iterBestScore) {
          iterBestScore = score;
          iterBest = entry.m;
          if (score > alpha) alpha = score;
        }
      }
    } catch (e) {
      if (e !== ABORT) throw e;
      game.history.length = 0;
      if (iterBest && completedDepth === 0) {
        bestMove = iterBest;
      }
      break;
    }
    completedDepth = depth;
    scored = iterScored.sort((a, b) => b.score - a.score);
    bestMove = scored[0].m;
    if (Math.abs(scored[0].score) > MATE - 1000) break;
  }

  findBestMove.lastStats = { depth: completedDepth, nodes, ms: Date.now() - (deadline - cfg.timeMs), score: scored.length ? Math.round(scored[0].score) : 0 };
  if (cfg.window > 0 && completedDepth >= 1) {
    const bestScore = scored[0].score;
    const pool = scored.filter(s => s.score >= bestScore - cfg.window);
    return pool[Math.floor(Math.random() * pool.length)].m;
  }
  return bestMove;
}

window.ChessAI = { findBestMove };
