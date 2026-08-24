'use strict';

let engine = new ChessEngine();
let mode = 'pvp';
let humanColor = 'w';
let aiLevel = 2;
let soundOn = true;

let selectedSq = null;
let currentLegal = [];
const sanHistory = [];
const capturedByW = [];
const capturedByB = [];
let gameOver = false;
let busy = false;
let aiTimer = null;
let promoPending = null;

function isHumanTurn() {
  return mode === 'pvp' || engine.turn === humanColor;
}

function refreshLegal() {
  currentLegal = engine.generateMoves(true);
}

function selectSquare(sq) {
  selectedSq = sq;
  const w = sqToWorld(sq);
  FX.selRing.position.x = w.x;
  FX.selRing.position.z = w.z;
  FX.selRing.visible = true;
  showLegalHints(currentLegal.filter(m => m.from === sq));
  sSelect();
}

function deselect() {
  selectedSq = null;
  deselectVisual();
}

function handleSquareClick(sq) {
  if (busy || gameOver) return;
  if (!isHumanTurn()) return;

  if (selectedSq !== null) {
    const cands = currentLegal.filter(m => m.from === selectedSq && m.to === sq);
    if (cands.length) {
      if (cands[0].promotion) openPromotion(cands);
      else doMove(cands[0]);
      return;
    }
  }

  const piece = engine.board[sq];
  if (piece && engine.colorOf(piece) === engine.turn) {
    if (sq === selectedSq) { deselect(); return; }
    selectSquare(sq);
  } else {
    deselect();
  }
}

function openPromotion(cands) {
  promoPending = cands;
  const color = engine.turn;
  const wrap = document.getElementById('promo-btns');
  wrap.innerHTML = '';
  for (const t of ['q', 'r', 'b', 'n']) {
    const btn = document.createElement('button');
    btn.className = color === 'w' ? 'w' : 'b';
    const glyphChar = { q: 'Q', r: 'R', b: 'B', n: 'N' }[t];
    btn.textContent = color === 'w' ? GLYPH[glyphChar] : GLYPH[glyphChar.toLowerCase()];
    btn.addEventListener('click', () => {
      document.getElementById('promo-modal').classList.remove('open');
      const mv = promoPending.find(m => m.promotion.toLowerCase() === t);
      promoPending = null;
      if (mv) doMove(mv);
    });
    wrap.appendChild(btn);
  }
  document.getElementById('promo-modal').classList.add('open');
}

const raycaster = new THREE.Raycaster();
const pointerV = new THREE.Vector2();
let downX = 0, downY = 0;

function pickSquare(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerV.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerV.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerV, camera);
  const targets = [...squareMeshes, ...piecesGroup.children];
  const hits = raycaster.intersectObjects(targets, true);
  for (const h of hits) {
    let o = h.object;
    while (o) {
      if (o.userData && o.userData.sq !== undefined) return o.userData.sq;
      o = o.parent;
    }
  }
  return -1;
}

function onPointerDown(e) {
  downX = e.clientX; downY = e.clientY;
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function onPointerUp(e) {
  const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (dist > 8) return;
  if (e.target !== renderer.domElement) return;
  const sq = pickSquare(e.clientX, e.clientY);
  if (sq >= 0) handleSquareClick(sq);
  else deselect();
}

let hoverThrottle = 0;
function onPointerMove(e) {
  const now = performance.now();
  if (now - hoverThrottle < 80) return;
  hoverThrottle = now;
  let cursor = 'default';
  if (!busy && !gameOver && isHumanTurn() && e.target === renderer.domElement) {
    const sq = pickSquare(e.clientX, e.clientY);
    if (sq >= 0) {
      const piece = engine.board[sq];
      const ownPiece = piece && engine.colorOf(piece) === engine.turn;
      const legalTarget = selectedSq !== null && currentLegal.some(m => m.from === selectedSq && m.to === sq);
      if (ownPiece || legalTarget) cursor = 'pointer';
    }
  }
  document.body.style.cursor = cursor;
}

function movePieceVisual(move, done) {
  const g = pieceAt[move.from];
  if (!g) { done(); return; }
  pieceAt[move.from] = null;

  let capSq = -1;
  if (move.captured) {
    const mover = engine.colorOf(move.piece);
    capSq = move.ep ? (mover === 'w' ? move.to - 8 : move.to + 8) : move.to;
  }
  const capturedGroup = capSq >= 0 ? pieceAt[capSq] : null;
  if (capturedGroup) {
    pieceAt[capSq] = null;
    const g0 = capturedGroup;
    addTween(230, (e, k) => {
      const s = Math.max(0.001, 1 - e);
      g0.scale.set(s, s, s);
      g0.position.y = k * 0.25;
    }, () => piecesGroup.remove(g0));
  }

  const fromW = sqToWorld(move.from);
  const toW = sqToWorld(move.to);
  pieceAt[move.to] = g;
  g.userData.sq = move.to;
  const isKnight = move.piece.toLowerCase() === 'n';
  const hop = isKnight ? 0.45 : 0.14;

  addTween(380, e => {
    g.position.x = fromW.x + (toW.x - fromW.x) * e;
    g.position.z = fromW.z + (toW.z - fromW.z) * e;
    g.position.y = Math.sin(e * Math.PI) * hop;
  }, () => {
    g.position.set(toW.x, 0, toW.z);
    if (move.promotion) {
      piecesGroup.remove(g);
      placePiece(move.to, move.promotion);
    }
    done();
  });

  if (move.castle) {
    const w = move.piece === 'K';
    let rf, rt;
    if (move.castle === 'k') { rf = w ? 7 : 63; rt = w ? 5 : 61; }
    else { rf = w ? 0 : 56; rt = w ? 3 : 59; }
    const rookG = pieceAt[rf];
    if (rookG) {
      pieceAt[rf] = null;
      pieceAt[rt] = rookG;
      rookG.userData.sq = rt;
      const rFrom = sqToWorld(rf), rTo = sqToWorld(rt);
      addTween(340, e => {
        rookG.position.x = rFrom.x + (rTo.x - rFrom.x) * e;
        rookG.position.z = rFrom.z + (rTo.z - rFrom.z) * e;
        rookG.position.y = Math.sin(e * Math.PI) * 0.1;
      }, () => rookG.position.set(rTo.x, 0, rTo.z));
    }
  }
}

function doMove(move) {
  busy = true;
  deselect();

  const all = currentLegal.length ? currentLegal : engine.generateMoves(true);
  let san = engine.moveToSan(move, all);

  engine.make(move);
  engine._pushRepetition();
  san = engine.sanWithSuffix(san);

  sanHistory.push({ san, captured: move.captured || null });
  if (move.captured) {
    if (engine.colorOf(move.captured) === 'b') capturedByW.push(move.captured);
    else capturedByB.push(move.captured);
  }

  refreshLegal();
  updateCheckMarker();
  renderTrays();
  renderHistory();

  const wasCapture = !!move.captured;
  const wasCastle = !!move.castle;

  movePieceVisual(move, () => {
    setLastMove(move);
    updateCheckMarker();
    busy = false;

    if (wasCastle) sCastle();
    else if (wasCapture) sCapture();
    else sMove();

    const ended = checkGameEnd();
    if (!ended && FX.checkDisc.visible) setTimeout(sCheck, 160);

    if (!ended && mode === 'ai' && engine.turn !== humanColor) {
      setStatus('Компьютер думает…');
      aiTimer = setTimeout(aiMove, 450);
    } else {
      updateStatusText();
    }
  });
}

function aiMove() {
  if (gameOver) return;
  const m = ChessAI.findBestMove(engine, aiLevel);
  if (m) doMove(m);
}

function checkGameEnd() {
  if (!engine.hasLegalMoves()) {
    gameOver = true;
    if (engine.inCheck(engine.turn)) {
      const winner = engine.turn === 'w' ? 'чёрные' : 'белые';
      showOver('Мат!', `Победили ${winner}`);
    } else {
      showOver('Пат', 'Ничья: у стороны нет ходов');
    }
    sEnd();
    return true;
  }
  if (engine.fiftyMoveDraw()) return endDraw('Ничья: правило 50 ходов');
  if (engine.repetitionDraw()) return endDraw('Ничья: троекратное повторение');
  if (engine.insufficientMaterial()) return endDraw('Ничья: недостаточно материала');
  return false;
}
function endDraw(reason) {
  gameOver = true;
  showOver('Ничья', reason);
  sEnd();
  return true;
}

function showOver(title, text) {
  document.getElementById('over-title').textContent = title;
  document.getElementById('over-text').textContent = text;
  document.getElementById('over-modal').classList.add('open');
  setStatus(`${title} — ${text}`, true);
}

function undo() {
  if (busy || !sanHistory.length) return;
  clearTimeout(aiTimer);
  document.getElementById('promo-modal').classList.remove('open');
  promoPending = null;

  const steps = mode === 'ai' ? Math.min(2, sanHistory.length) : 1;
  for (let i = 0; i < steps; i++) {
    engine._popRepetition();
    engine.unmake();
    const rec = sanHistory.pop();
    if (rec.captured) {
      const arr = engine.colorOf(rec.captured) === 'b' ? capturedByW : capturedByB;
      const idx = arr.lastIndexOf(rec.captured);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  gameOver = false;
  document.getElementById('over-modal').classList.remove('open');
  rebuildPieces();
  deselect();
  FX.lastA.visible = false;
  FX.lastB.visible = false;
  updateCheckMarker();
  refreshLegal();
  renderTrays();
  renderHistory();
  updateStatusText();
}

function newGame() {
  clearTimeout(aiTimer);
  mode = document.querySelector('#mode-seg .active').dataset.mode;
  humanColor = document.getElementById('human-color').value;
  aiLevel = +document.getElementById('ai-level').value;

  engine.reset();
  sanHistory.length = 0;
  capturedByW.length = 0;
  capturedByB.length = 0;
  gameOver = false;
  busy = false;
  promoPending = null;
  document.getElementById('over-modal').classList.remove('open');
  document.getElementById('promo-modal').classList.remove('open');

  rebuildPieces();
  deselect();
  FX.lastA.visible = false;
  FX.lastB.visible = false;
  FX.checkDisc.visible = false;
  refreshLegal();
  renderTrays();
  renderHistory();
  updateStatusText();

  animateCameraTo(humanColor === 'w' ? 0 : Math.PI, 700);

  if (mode === 'ai' && engine.turn !== humanColor) {
    setStatus('Компьютер думает…');
    aiTimer = setTimeout(aiMove, 800);
  }
}

function setStatus(text, alert) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.classList.toggle('alert', !!alert);
}
function updateStatusText() {
  const side = engine.turn === 'w' ? 'Ход белых' : 'Ход чёрных';
  if (gameOver) return;
  setStatus(engine.inCheck(engine.turn) ? `${side} — шах!` : side, engine.inCheck(engine.turn));
}

function renderTrays() {
  const order = p => VALUE[p.toLowerCase()] || 0;
  const sorted = arr => arr.slice().sort((a, b) => order(b) - order(a));
  const gw = sorted(capturedByW).map(p => GLYPH[p.toLowerCase()]).join('');
  const gb = sorted(capturedByB).map(p => GLYPH[p.toLowerCase()]).join('');
  document.getElementById('caps-w').textContent = gw;
  document.getElementById('caps-b').textContent = gb;
  const sw = capturedByW.reduce((s, p) => s + order(p), 0);
  const sb = capturedByB.reduce((s, p) => s + order(p), 0);
  document.getElementById('score-w').textContent = sw > sb ? `+${sw - sb}` : '';
  document.getElementById('score-b').textContent = sb > sw ? `+${sb - sw}` : '';
}

function renderHistory() {
  const wrap = document.getElementById('moves');
  if (!sanHistory.length) {
    wrap.innerHTML = '<div class="empty-hint">Ходов пока нет</div>';
    return;
  }
  let html = '';
  for (let i = 0; i < sanHistory.length; i += 2) {
    const n = i / 2 + 1;
    const w = sanHistory[i];
    const b = sanHistory[i + 1];
    const isLastW = i === sanHistory.length - 1;
    const isLastB = i + 1 === sanHistory.length - 1;
    html += `<div class="move-pair"><span class="move-num">${n}.</span>` +
      `<span class="move-san${isLastW ? ' last' : ''}">${w.san}</span>` +
      `<span class="move-san${isLastB ? ' last' : ''}">${b ? b.san : ''}</span></div>`;
  }
  wrap.innerHTML = html;
  wrap.scrollTop = wrap.scrollHeight;
}

function wireUi() {
  const setPanel = hidden => {
    document.body.classList.toggle('side-collapsed', hidden);
    try { localStorage.setItem('chess-panel', hidden ? 'hidden' : 'shown'); } catch (e) {}
  };
  document.getElementById('side-toggle').addEventListener('click', () => setPanel(true));
  document.getElementById('side-open').addEventListener('click', () => setPanel(false));
  try {
    if (localStorage.getItem('chess-panel') === 'hidden') setPanel(true);
  } catch (e) {}

  document.querySelectorAll('#mode-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mode-seg button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('ai-only').classList.toggle('visible', btn.dataset.mode === 'ai');
    });
  });

  document.getElementById('btn-new').addEventListener('click', newGame);
  document.getElementById('over-new').addEventListener('click', newGame);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-flip').addEventListener('click', () => {
    animateCameraTo(controls.getAzimuthalAngle() + Math.PI, 650);
  });
  document.getElementById('btn-sound').addEventListener('click', e => {
    soundOn = !soundOn;
    e.target.textContent = soundOn ? 'Звук: вкл' : 'Звук: выкл';
  });
  document.getElementById('over-close').addEventListener('click', () => {
    document.getElementById('over-modal').classList.remove('open');
  });

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
}

function loop(now) {
  requestAnimationFrame(loop);
  stepTweens(now);
  if (FX.checkDisc.visible) {
    FX.checkDisc.material.opacity = 0.3 + Math.sin(now * 0.006) * 0.18;
  }
  controls.update();
  renderer.render(scene, camera);
}

function boot() {
  try {
    initScene();
  } catch (e) {
    document.getElementById('scene').innerHTML =
      '<p style="padding:40px;font-size:16px">Не удалось инициализировать WebGL.</p>';
    return;
  }
  makeMaterials();
  rebuildPieces();
  refreshLegal();
  wireUi();
  renderTrays();
  updateStatusText();
  requestAnimationFrame(loop);
}

window.sqToScreen = function (sq) {
  const w = sqToWorld(sq);
  return window.worldToScreen(w.x, w.z);
};
window.worldToScreen = function (x, z) {
  const v = new THREE.Vector3(x, 0, z).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((-v.y + 1) / 2) * r.height + r.top };
};

boot();
