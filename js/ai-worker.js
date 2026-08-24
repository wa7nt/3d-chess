'use strict';

importScripts('engine.js', 'ai.js');

self.onmessage = e => {
  const d = e.data;
  let m = null;
  try {
    const g = new ChessEngine(d.fen);
    m = findBestMove(g, d.difficulty);
  } catch (err) {
    m = null;
  }
  self.postMessage({
    id: d.id,
    move: m ? {
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured || null,
      promotion: m.promotion || null,
      ep: !!m.ep,
      castle: m.castle || null,
      double: !!m.double
    } : null
  });
};
