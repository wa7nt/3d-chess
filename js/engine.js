'use strict';

const FILES = 'abcdefgh';

function sqName(sq) { return FILES[sq & 7] + ((sq >> 3) + 1); }

class ChessEngine {
  constructor(fen) {
    this.reset(fen || ChessEngine.START_FEN);
  }

  static START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  reset(fen) {
    this.loadFen(fen || ChessEngine.START_FEN);
    this.repetitionCounts = new Map();
    this.positionKeys = [];
    this._pushRepetition();
  }

  loadFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    this.board = new Array(64).fill(null);
    for (let r = 0; r < 8; r++) {
      // rows[0] = 8-я горизонталь
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') f += +ch;
        else {
          const rank = 7 - r;
          this.board[rank * 8 + f] = ch;
          f++;
        }
      }
    }
    this.turn = parts[1] || 'w';
    const c = parts[2] || '-';
    this.castling = { wK: c.includes('K'), wQ: c.includes('Q'), bK: c.includes('k'), bQ: c.includes('q') };
    this.ep = (parts[3] && parts[3] !== '-') ? (FILES.indexOf(parts[3][0]) + (+parts[3][1] - 1) * 8) : -1;
    this.halfmove = +(parts[4] || 0);
    this.fullmove = +(parts[5] || 1);
    this.history = [];
    this.kings = { w: -1, b: -1 };
    for (let i = 0; i < 64; i++) {
      if (this.board[i] === 'K') this.kings.w = i;
      else if (this.board[i] === 'k') this.kings.b = i;
    }
  }

  fenPrefix() {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 8 + f];
        if (!p) empty++;
        else {
          if (empty) { s += empty; empty = 0; }
          s += p;
        }
      }
      if (empty) s += empty;
      if (r) s += '/';
    }
    const c = (this.castling.wK ? 'K' : '') + (this.castling.wQ ? 'Q' : '') +
              (this.castling.bK ? 'k' : '') + (this.castling.bQ ? 'q' : '');
    return `${s} ${this.turn} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'}`;
  }

  _pushRepetition() {
    const key = this.fenPrefix();
    this.repetitionCounts.set(key, (this.repetitionCounts.get(key) || 0) + 1);
    this.positionKeys.push({ key });
  }

  _popRepetition() {
    const rec = this.positionKeys.pop();
    const n = this.repetitionCounts.get(rec.key) - 1;
    if (n <= 0) this.repetitionCounts.delete(rec.key);
    else this.repetitionCounts.set(rec.key, n);
  }

  colorOf(piece) { return piece === piece.toUpperCase() ? 'w' : 'b'; }

  isSquareAttacked(sq, byColor) {
    const board = this.board;
    const f = sq & 7, r = sq >> 3;

    // Пешки
    const pr = byColor === 'w' ? r - 1 : r + 1;
    if (pr >= 0 && pr <= 7) {
      for (const df of [-1, 1]) {
        const pf = f + df;
        if (pf >= 0 && pf <= 7) {
          const p = board[pr * 8 + pf];
          if (p && (p === 'P' || p === 'p') && this.colorOf(p) === byColor) return true;
        }
      }
    }
    // Конь
    const KNIGHT = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
    for (const [df, dr] of KNIGHT) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const p = board[nr * 8 + nf];
        if (p && (p === 'N' || p === 'n') && this.colorOf(p) === byColor) return true;
      }
    }
    // Король
    const KING = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    for (const [df, dr] of KING) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const p = board[nr * 8 + nf];
        if (p && (p === 'K' || p === 'k') && this.colorOf(p) === byColor) return true;
      }
    }
    // Слоны / ферзь (диагонали)
    const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [df, dr] of DIAG) {
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const p = board[nr * 8 + nf];
        if (p) {
          if (this.colorOf(p) === byColor && (p === 'B' || p === 'b' || p === 'Q' || p === 'q')) return true;
          break;
        }
        nf += df; nr += dr;
      }
    }
    // Ладьи / ферзь (линии)
    const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [df, dr] of ORTH) {
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const p = board[nr * 8 + nf];
        if (p) {
          if (this.colorOf(p) === byColor && (p === 'R' || p === 'r' || p === 'Q' || p === 'q')) return true;
          break;
        }
        nf += df; nr += dr;
      }
    }
    return false;
  }

  inCheck(color) {
    return this.isSquareAttacked(this.kings[color], color === 'w' ? 'b' : 'w');
  }

  // move: {from, to, piece, captured?, promotion?, ep?, castle?, double?}
  generateMoves(legalOnly = true, capturesOnly = false) {
    const moves = [];
    const board = this.board;
    const us = this.turn;

    for (let from = 0; from < 64; from++) {
      const piece = board[from];
      if (!piece || this.colorOf(piece) !== us) continue;
      const f = from & 7, r = from >> 3;
      const type = piece.toLowerCase();

      if (type === 'p') {
        const dir = us === 'w' ? 1 : -1;
        const startRank = us === 'w' ? 1 : 6;
        const promoRank = us === 'w' ? 7 : 0;
        const one = from + dir * 8;
        if (!capturesOnly && one >= 0 && one < 64 && !board[one]) {
          this._addPawnMoves(moves, from, one, null, promoRank);
          const two = from + dir * 16;
          if (r === startRank && !board[two]) moves.push({ from, to: two, piece, captured: null, double: true });
        }
        for (const df of [-1, 1]) {
          const nf = f + df, nr = r + dir;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const to = nr * 8 + nf;
          const target = board[to];
          if (target && this.colorOf(target) !== us) this._addPawnMoves(moves, from, to, target, promoRank);
          else if (to === this.ep) moves.push({ from, to, piece, captured: us === 'w' ? 'p' : 'P', ep: true });
        }
      } else if (type === 'n' || type === 'k') {
        const DELTAS = type === 'n'
          ? [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]
          : [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
        for (const [df, dr] of DELTAS) {
          const nf = f + df, nr = r + dr;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const to = nr * 8 + nf;
          const t = board[to];
          if (!t) { if (!capturesOnly) moves.push({ from, to, piece, captured: null }); }
          else if (this.colorOf(t) !== us) moves.push({ from, to, piece, captured: t });
        }
        if (type === 'k' && !capturesOnly) this._genCastles(moves, us);
      } else {
        const DIRS = type === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]]
                   : type === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]]
                   : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for (const [df, dr] of DIRS) {
          let nf = f + df, nr = r + dr;
          while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
            const to = nr * 8 + nf;
            const t = board[to];
            if (!t) { if (!capturesOnly) moves.push({ from, to, piece, captured: null }); }
            else {
              if (this.colorOf(t) !== us) moves.push({ from, to, piece, captured: t });
              break;
            }
            nf += df; nr += dr;
          }
        }
      }
    }

    if (!legalOnly) return moves;
    const legal = [];
    for (const m of moves) {
      this.make(m);
      if (!this.inCheck(us)) legal.push(m);
      this.unmake();
    }
    return legal;
  }

  _addPawnMoves(moves, from, to, captured, promoRank) {
    const piece = this.board[from];
    if ((to >> 3) === promoRank) {
      for (const pr of ['q', 'r', 'b', 'n']) {
        moves.push({
          from, to, piece, captured,
          promotion: this.turn === 'w' ? pr.toUpperCase() : pr
        });
      }
    } else {
      moves.push({ from, to, piece, captured });
    }
  }

  _genCastles(moves, us) {
    const opp = us === 'w' ? 'b' : 'w';
    if (us === 'w') {
      if (this.castling.wK &&
          !this.board[5] && !this.board[6] &&
          !this.isSquareAttacked(4, opp) && !this.isSquareAttacked(5, opp) && !this.isSquareAttacked(6, opp)) {
        moves.push({ from: 4, to: 6, piece: 'K', captured: null, castle: 'k' });
      }
      if (this.castling.wQ &&
          !this.board[3] && !this.board[2] && !this.board[1] &&
          !this.isSquareAttacked(4, opp) && !this.isSquareAttacked(3, opp) && !this.isSquareAttacked(2, opp)) {
        moves.push({ from: 4, to: 2, piece: 'K', captured: null, castle: 'q' });
      }
    } else {
      if (this.castling.bK &&
          !this.board[61] && !this.board[62] &&
          !this.isSquareAttacked(60, opp) && !this.isSquareAttacked(61, opp) && !this.isSquareAttacked(62, opp)) {
        moves.push({ from: 60, to: 62, piece: 'k', captured: null, castle: 'k' });
      }
      if (this.castling.bQ &&
          !this.board[59] && !this.board[58] && !this.board[57] &&
          !this.isSquareAttacked(60, opp) && !this.isSquareAttacked(59, opp) && !this.isSquareAttacked(58, opp)) {
        moves.push({ from: 60, to: 58, piece: 'k', captured: null, castle: 'q' });
      }
    }
  }

  make(m) {
    const rec = {
      m,
      capturedPiece: m.captured,
      prevCastling: { ...this.castling },
      prevEp: this.ep,
      prevHalfmove: this.halfmove
    };
    const us = this.turn;
    this.history.push(rec);

    this.ep = -1;
    this.halfmove++;

    if (m.captured) this.halfmove = 0;
    if (m.piece.toLowerCase() === 'p') this.halfmove = 0;

    // взятие (в т.ч. на проходе)
    if (m.ep) {
      const capSq = us === 'w' ? m.to - 8 : m.to + 8;
      this.board[capSq] = null;
    }

    // перемещение фигуры
    this.board[m.to] = m.promotion || m.piece;
    this.board[m.from] = null;

    // рокировка — двигаем ладью
    if (m.castle) {
      if (us === 'w') {
        if (m.castle === 'k') { this.board[5] = 'R'; this.board[7] = null; }
        else { this.board[3] = 'R'; this.board[0] = null; }
      } else {
        if (m.castle === 'k') { this.board[61] = 'r'; this.board[63] = null; }
        else { this.board[59] = 'r'; this.board[56] = null; }
      }
    }

    // права на рокировку
    if (m.piece === 'K') { this.castling.wK = false; this.castling.wQ = false; }
    if (m.piece === 'k') { this.castling.bK = false; this.castling.bQ = false; }
    if (m.from === 0 || m.to === 0) this.castling.wQ = false;
    if (m.from === 7 || m.to === 7) this.castling.wK = false;
    if (m.from === 56 || m.to === 56) this.castling.bQ = false;
    if (m.from === 63 || m.to === 63) this.castling.bK = false;

    // взятие на угловой клетке ладьи уже покрыто проверкой to выше

    // двойной ход пешки — битое поле
    if (m.double) this.ep = (m.from + m.to) >> 1;

    if (m.piece === 'K') this.kings.w = m.to;
    if (m.piece === 'k') this.kings.b = m.to;

    if (us === 'b') this.fullmove++;
    this.turn = us === 'w' ? 'b' : 'w';
    return rec;
  }

  unmake() {
    const rec = this.history.pop();
    const m = rec.m;
    const mover = this.turn === 'w' ? 'b' : 'w'; // кто делал ход
    this.turn = mover;
    if (mover === 'b') this.fullmove--;

    this.board[m.from] = m.piece;
    this.board[m.to] = null;

    if (m.ep) {
      const capSq = mover === 'w' ? m.to - 8 : m.to + 8;
      this.board[capSq] = m.captured;
    } else if (m.captured) {
      this.board[m.to] = m.captured;
    }

    if (m.castle) {
      if (mover === 'w') {
        if (m.castle === 'k') { this.board[7] = 'R'; this.board[5] = null; }
        else { this.board[0] = 'R'; this.board[3] = null; }
      } else {
        if (m.castle === 'k') { this.board[63] = 'r'; this.board[61] = null; }
        else { this.board[56] = 'r'; this.board[59] = null; }
      }
    }

    if (m.piece === 'K') this.kings.w = m.from;
    if (m.piece === 'k') this.kings.b = m.from;

    this.castling = rec.prevCastling;
    this.ep = rec.prevEp;
    this.halfmove = rec.prevHalfmove;
    return rec;
  }

  hasLegalMoves() {
    return this.generateMoves(true).length > 0;
  }

  insufficientMaterial() {
    const minors = [], bishopsSqColors = [];
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (!p) continue;
      const t = p.toLowerCase();
      if (t === 'k') continue;
      if (t === 'p' || t === 'r' || t === 'q') return false;
      minors.push(t);
      if (t === 'b') bishopsSqColors.push(((i >> 3) + (i & 7)) % 2);
    }
    if (minors.length === 0) return true;                 // K vs K
    if (minors.length === 1) return true;                 // K+N/B vs K
    if (minors.every(m => m === 'b') && bishopsSqColors.every(c => c === bishopsSqColors[0])) return true; // одноцветные слоны
    return false;
  }

  repetitionDraw() {
    const n = this.repetitionCounts.get(this.fenPrefix()) || 0;
    return n >= 3;
  }

  fiftyMoveDraw() { return this.halfmove >= 100; }

  moveToSan(move, allLegal) {
    let base;
    if (move.castle === 'k') base = 'O-O';
    else if (move.castle === 'q') base = 'O-O-O';
    else {
      const type = move.piece.toLowerCase();
      let disamb = '';
      if (type !== 'p') {
        const others = allLegal.filter(o =>
          o.piece === move.piece && o.to === move.to && o.from !== move.from);
        if (others.length) {
          const sameFile = others.some(o => (o.from & 7) === (move.from & 7));
          const sameRank = others.some(o => (o.from >> 3) === (move.from >> 3));
          if (!sameFile) disamb = FILES[move.from & 7];
          else if (!sameRank) disamb = String((move.from >> 3) + 1);
          else disamb = sqName(move.from);
        }
      }
      const letter = type === 'p' ? '' : move.piece.toUpperCase();
      const cap = (move.captured) ? 'x' : '';
      const dest = sqName(move.to);
      const pawnCap = type === 'p' && move.captured ? FILES[move.from & 7] : '';
      base = letter + disamb + pawnCap + cap + dest;
      if (move.promotion) base += '=' + move.promotion.toUpperCase();
    }
    // шах/мат добавит вызывающий после выполнения хода
    return base;
  }

  sanWithSuffix(san) {
    const opp = this.turn;
    if (this.inCheck(opp)) san += this.hasLegalMoves() ? '+' : '#';
    return san;
  }

  clone() {
    const c = new ChessEngine();
    c.board = this.board.slice();
    c.turn = this.turn;
    c.castling = { ...this.castling };
    c.ep = this.ep;
    c.halfmove = this.halfmove;
    c.fullmove = this.fullmove;
    c.kings = { ...this.kings };
    c.history = [];
    return c;
  }
}

window.ChessEngine = ChessEngine;
