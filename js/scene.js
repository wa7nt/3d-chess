'use strict';

const GLYPH = {
  P: '\u2659', N: '\u2658', B: '\u2657', R: '\u2656', Q: '\u2655', K: '\u2654',
  p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A'
};
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

let scene, camera, renderer, controls;
let piecesGroup;
const pieceAt = new Array(64).fill(null);
let squareMeshes = [];

const tweens = [];
function easeInOutCubic(k) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}
function addTween(dur, update, done) {
  tweens.push({ t0: performance.now(), dur, update, done });
}
function stepTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const k = Math.min(1, (now - tw.t0) / tw.dur);
    tw.update(easeInOutCubic(k), k);
    if (k >= 1) {
      tweens.splice(i, 1);
      if (tw.done) tw.done();
    }
  }
}

function sqToWorld(sq) {
  return { x: (sq & 7) - 3.5, z: 3.5 - (sq >> 3) };
}
function worldToSq(x, z) {
  const f = Math.round(x + 3.5);
  const r = Math.round(3.5 - z);
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 8 + f;
}

let audioCtx = null;
function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type, vol, delay, glideTo) {
  if (!soundOn) return;
  try {
    const ctx = ac();
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch (e) {}
}
function thud(freqLp, vol, delay) {
  if (!soundOn) return;
  try {
    const ctx = ac();
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = freqLp;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(flt); flt.connect(g); g.connect(ctx.destination);
    src.start(t0);
  } catch (e) {}
}
const sMove = () => { tone(185, 0.09, 'triangle', 0.45); thud(1100, 0.22); };
const sCapture = () => { tone(115, 0.13, 'triangle', 0.65); thud(520, 0.5); };
const sCastle = () => {
  tone(185, 0.08, 'triangle', 0.4); thud(1100, 0.18);
  tone(165, 0.09, 'triangle', 0.42, 0.11); thud(1000, 0.2, 0.11);
};
const sCheck = () => { tone(740, 0.09, 'sine', 0.3); tone(740, 0.1, 'sine', 0.28, 0.14); };
const sSelect = () => tone(340, 0.05, 'square', 0.12);
const sEnd = () => { [523, 659, 784].forEach((f, i) => tone(f, 0.4, 'sine', 0.28, i * 0.15)); };

const MAT = {};
const GEO_CACHE = {};

function lathe(pts, segs) {
  return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), segs || 48);
}
function sph(r, y, x, z) {
  return { geo: new THREE.SphereGeometry(r, 22, 16), y, x: x || 0, z: z || 0 };
}
function knightHeadGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.154, 0);
  s.quadraticCurveTo(-0.22, 0.22, -0.1265, 0.374);
  s.quadraticCurveTo(-0.099, 0.451, -0.011, 0.484);
  s.lineTo(-0.0605, 0.572);
  s.lineTo(-0.0055, 0.5005);
  s.lineTo(0.0682, 0.561);
  s.lineTo(0.0726, 0.4785);
  s.quadraticCurveTo(0.187, 0.4235, 0.2695, 0.308);
  s.lineTo(0.2893, 0.2365);
  s.lineTo(0.2442, 0.1925);
  s.quadraticCurveTo(0.11, 0.1705, 0.0682, 0.0605);
  s.lineTo(0.1265, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.225, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, steps: 1 });
  g.translate(0, 0, -0.123);
  return g;
}

function getParts(type) {
  if (GEO_CACHE[type]) return GEO_CACHE[type];
  let parts = [];
  if (type === 'p') {
    parts = [
      { geo: lathe([[0.26, 0], [0.26, 0.04], [0.21, 0.07], [0.14, 0.12], [0.10, 0.20], [0.088, 0.28], [0.125, 0.305], [0.13, 0.33], [0.075, 0.35]]), y: 0 },
      sph(0.135, 0.47)
    ];
  } else if (type === 'r') {
    parts = [{ geo: lathe([[0.30, 0], [0.30, 0.05], [0.245, 0.09], [0.21, 0.15], [0.20, 0.38], [0.265, 0.44], [0.27, 0.56], [0, 0.56]]), y: 0 }];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      parts.push({ geo: new THREE.BoxGeometry(0.13, 0.11, 0.09), x: Math.cos(a) * 0.19, z: Math.sin(a) * 0.19, y: 0.615, rotY: -a });
    }
  } else if (type === 'n') {
    parts = [
      { geo: lathe([[0.30, 0], [0.30, 0.045], [0.24, 0.09], [0.205, 0.135], [0.225, 0.165], [0.185, 0.19], [0, 0.19]]), y: 0 },
      { geo: knightHeadGeo(), y: 0.185 }
    ];
  } else if (type === 'b') {
    parts = [
      { geo: lathe([[0.28, 0], [0.28, 0.045], [0.225, 0.085], [0.145, 0.16], [0.105, 0.26], [0.14, 0.29], [0.145, 0.315], [0.09, 0.335], [0.13, 0.42], [0.155, 0.50], [0.13, 0.57], [0.06, 0.63], [0.024, 0.65], [0, 0.655]]), y: 0 },
      sph(0.038, 0.69)
    ];
  } else if (type === 'q') {
    parts = [{ geo: lathe([[0.31, 0], [0.31, 0.05], [0.25, 0.10], [0.165, 0.20], [0.12, 0.34], [0.10, 0.48], [0.095, 0.55], [0.14, 0.575], [0.145, 0.60], [0.095, 0.62], [0.15, 0.70], [0.185, 0.76], [0.19, 0.78], [0.11, 0.79], [0, 0.80]]), y: 0 }];
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      parts.push(sph(0.034, 0.815, Math.cos(a) * 0.155, Math.sin(a) * 0.155));
    }
    parts.push(sph(0.055, 0.845));
  } else if (type === 'k') {
    parts = [
      { geo: lathe([[0.32, 0], [0.32, 0.05], [0.26, 0.10], [0.175, 0.21], [0.13, 0.36], [0.108, 0.52], [0.102, 0.58], [0.148, 0.605], [0.153, 0.63], [0.10, 0.65], [0.155, 0.72], [0.19, 0.78], [0.195, 0.80], [0.115, 0.81], [0, 0.82]]), y: 0 },
      { geo: new THREE.BoxGeometry(0.055, 0.20, 0.055), y: 0.91 },
      { geo: new THREE.BoxGeometry(0.15, 0.055, 0.055), y: 0.925 }
    ];
  }
  GEO_CACHE[type] = parts;
  return parts;
}

function makeMaterials() {
  MAT.w = new THREE.MeshPhysicalMaterial({ color: 0xf0e6d2, roughness: 0.3, metalness: 0.02, clearcoat: 0.55, clearcoatRoughness: 0.3 });
  MAT.b = new THREE.MeshPhysicalMaterial({ color: 0x1d2127, roughness: 0.32, metalness: 0.12, clearcoat: 0.65, clearcoatRoughness: 0.22 });
  MAT.w.color.convertSRGBToLinear();
  MAT.b.color.convertSRGBToLinear();
}

function buildPieceMesh(type, color) {
  const group = new THREE.Group();
  for (const p of getParts(type)) {
    const mesh = new THREE.Mesh(p.geo, color === 'w' ? MAT.w : MAT.b);
    mesh.position.set(p.x || 0, p.y || 0, p.z || 0);
    if (p.rotY) mesh.rotation.y = p.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (type === 'n') group.rotation.y = color === 'w' ? Math.PI / 2 : -Math.PI / 2;
  return group;
}

function placePiece(sq, char) {
  const type = char.toLowerCase();
  const color = char === char.toUpperCase() ? 'w' : 'b';
  const g = buildPieceMesh(type, color);
  const w = sqToWorld(sq);
  g.position.set(w.x, 0, w.z);
  g.userData.sq = sq;
  g.userData.char = char;
  piecesGroup.add(g);
  pieceAt[sq] = g;
}

function rebuildPieces() {
  while (piecesGroup.children.length) piecesGroup.remove(piecesGroup.children[0]);
  pieceAt.fill(null);
  for (let sq = 0; sq < 64; sq++) {
    const p = engine.board[sq];
    if (p) placePiece(sq, p);
  }
}

let labelMatCache = {};
function labelMesh(text, flip) {
  if (!labelMatCache[text]) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#cfae74';
    x.font = '600 82px Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    labelMatCache[text] = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), labelMatCache[text]);
  m.rotation.x = -Math.PI / 2;
  if (flip) m.rotation.z = Math.PI;
  return m;
}

const FX = {};
function initFx() {
  FX.selRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.035, 12, 40),
    new THREE.MeshBasicMaterial({ color: 0xe7c46a, transparent: true, opacity: 0.95, depthWrite: false })
  );
  FX.selRing.rotation.x = -Math.PI / 2;
  FX.selRing.position.y = 0.02;
  FX.selRing.visible = false;

  FX.dots = [];
  FX.rings = [];
  for (let i = 0; i < 28; i++) {
    const dot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.018, 20),
      new THREE.MeshBasicMaterial({ color: 0x86d97f, transparent: true, opacity: 0.9, depthWrite: false })
    );
    dot.position.y = 0.015;
    dot.visible = false;
    FX.dots.push(dot);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.37, 0.042, 10, 36),
      new THREE.MeshBasicMaterial({ color: 0xe06a55, transparent: true, opacity: 0.9, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.018;
    ring.visible = false;
    FX.rings.push(ring);
  }

  FX.lastA = new THREE.Mesh(
    new THREE.PlaneGeometry(0.97, 0.97),
    new THREE.MeshBasicMaterial({ color: 0xf2cf5b, transparent: true, opacity: 0.26, depthWrite: false })
  );
  FX.lastB = FX.lastA.clone();
  [FX.lastA, FX.lastB].forEach(m => { m.rotation.x = -Math.PI / 2; m.position.y = 0.008; m.visible = false; });

  FX.checkDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.47, 36),
    new THREE.MeshBasicMaterial({ color: 0xe04b38, transparent: true, opacity: 0.45, depthWrite: false })
  );
  FX.checkDisc.rotation.x = -Math.PI / 2;
  FX.checkDisc.position.y = 0.011;
  FX.checkDisc.visible = false;

  scene.add(FX.selRing, FX.checkDisc, FX.lastA, FX.lastB);
  FX.dots.forEach(d => scene.add(d));
  FX.rings.forEach(r => scene.add(r));
}

function hideMoveHints() {
  FX.dots.forEach(d => d.visible = false);
  FX.rings.forEach(r => r.visible = false);
}
function deselectVisual() {
  FX.selRing.visible = false;
  hideMoveHints();
}
function showLegalHints(moves) {
  hideMoveHints();
  let di = 0, ri = 0;
  for (const m of moves) {
    const w = sqToWorld(m.to);
    let marker;
    if (m.captured && ri < FX.rings.length) marker = FX.rings[ri++];
    else if (di < FX.dots.length) marker = FX.dots[di++];
    else continue;
    marker.position.x = w.x;
    marker.position.z = w.z;
    marker.visible = true;
  }
}
function setLastMove(move) {
  const a = sqToWorld(move.from), b = sqToWorld(move.to);
  FX.lastA.position.x = a.x; FX.lastA.position.z = a.z; FX.lastA.visible = true;
  FX.lastB.position.x = b.x; FX.lastB.position.z = b.z; FX.lastB.visible = true;
}
function updateCheckMarker() {
  if (gameOver || !engine.inCheck(engine.turn)) { FX.checkDisc.visible = false; return; }
  const w = sqToWorld(engine.kings[engine.turn]);
  FX.checkDisc.position.x = w.x;
  FX.checkDisc.position.z = w.z;
  FX.checkDisc.visible = true;
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);
  scene.fog = new THREE.Fog(0x070a10, 18, 46);

  camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(0, 7.2, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('scene').appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.15, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 22;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.42;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xbdd2ff, 0x241708, 0.5));

  const key = new THREE.DirectionalLight(0xfff0da, 1.0);
  key.position.set(6, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7.5;
  key.shadow.camera.right = 7.5;
  key.shadow.camera.top = 7.5;
  key.shadow.camera.bottom = -7.5;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x93a7c8, 0.35);
  fill.position.set(-7, 6, -5);
  scene.add(fill);

  buildBoard();

  piecesGroup = new THREE.Group();
  scene.add(piecesGroup);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(34, 48),
    new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.96 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.161;
  ground.receiveShadow = true;
  scene.add(ground);

  initFx();

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function buildBoard() {
  const boardGroup = new THREE.Group();
  squareMeshes = [];

  const lightMat = new THREE.MeshStandardMaterial({ color: 0xdcc39a, roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x54331c, roughness: 0.55 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b1c10, roughness: 0.58 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xcfa85c, roughness: 0.3, metalness: 0.75 });
  [lightMat, darkMat, frameMat, trimMat].forEach(m => m.color.convertSRGBToLinear());

  const sqGeo = new THREE.BoxGeometry(0.98, 0.1, 0.98);
  for (let sq = 0; sq < 64; sq++) {
    const f = sq & 7, r = sq >> 3;
    const mat = (f + r) % 2 === 0 ? darkMat : lightMat;
    const m = new THREE.Mesh(sqGeo, mat);
    const w = sqToWorld(sq);
    m.position.set(w.x, -0.05, w.z);
    m.receiveShadow = true;
    m.userData.sq = sq;
    boardGroup.add(m);
    squareMeshes.push(m);
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(8.72, 0.16, 8.72), frameMat);
  body.position.y = -0.13;
  body.receiveShadow = true;
  body.castShadow = true;
  boardGroup.add(body);

  function frameBox(w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = true;
    boardGroup.add(m);
  }
  frameBox(9.0, 0.16, 0.5, 0, -0.10, 4.25);
  frameBox(9.0, 0.16, 0.5, 0, -0.10, -4.25);
  frameBox(0.5, 0.16, 8.0, 4.25, -0.10, 0);
  frameBox(0.5, 0.16, 8.0, -4.25, -0.10, 0);

  function trim(w, d, x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), trimMat);
    m.position.set(x, -0.005, z);
    boardGroup.add(m);
  }
  trim(8.06, 0.06, 0, 4.03);
  trim(8.06, 0.06, 0, -4.03);
  trim(0.06, 8.06, 4.03, 0);
  trim(0.06, 8.06, -4.03, 0);

  for (let f = 0; f < 8; f++) {
    const l1 = labelMesh(FILES[f], false);
    l1.position.set(f - 3.5, -0.017, 4.25);
    boardGroup.add(l1);
    const l2 = labelMesh(FILES[f], true);
    l2.position.set(f - 3.5, -0.017, -4.25);
    boardGroup.add(l2);
  }
  for (let r = 0; r < 8; r++) {
    const n1 = labelMesh(String(r + 1), false);
    n1.position.set(-4.25, -0.017, 3.5 - r);
    boardGroup.add(n1);
    const n2 = labelMesh(String(r + 1), true);
    n2.position.set(4.25, -0.017, 3.5 - r);
    boardGroup.add(n2);
  }

  scene.add(boardGroup);
}

function animateCameraTo(thetaTarget, dur) {
  const offset = camera.position.clone().sub(controls.target);
  const sphv = new THREE.Spherical().setFromVector3(offset);
  let delta = thetaTarget - sphv.theta;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const theta0 = sphv.theta;
  addTween(dur || 600, e => {
    sphv.theta = theta0 + delta * e;
    offset.setFromSpherical(sphv);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  });
}
