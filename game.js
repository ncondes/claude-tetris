'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#f06292', // + pentominó - rosa
  '#4db6ac', // U pentominó - teal
  '#dce775', // Y pentominó - lima
  '#ffffff', // single 1x1 (recompensa) - blanco
  '#90a4ae', // hueco 3x3 (reto) - gris acero
];

// Paleta skin Neon: colores saturados/brillantes para el glow con shadowBlur
const NEON_COLORS = [
  null,
  '#00e5ff', '#ffea00', '#d500f9', '#00e676', '#ff1744', '#2979ff', '#ff9100',
  '#ff4081', '#1de9b6', '#c6ff00', '#ffffff', '#b0bec5',
];

// Paleta skin Pastel: colores suaves
const PASTEL_COLORS = [
  null,
  '#a0e7e5', '#ffe5a0', '#d3b5e5', '#b5e7c8', '#f7b2b7', '#b5c7f7', '#ffd8a8',
  '#f7c8dd', '#a8e0d8', '#e2edb0', '#fdfdfd', '#cfd8dc',
];

// Registro de skins: cada uno combina una paleta de color con una función de
// dibujo de bloque (renderFlat/renderGlow/renderRounded/renderPixel, más abajo).
// colorsLight es opcional: solo si un skin necesita una paleta distinta en modo claro.
const SKINS = {
  retro: { colors: COLORS, renderBlock: renderFlat },
  neon: { colors: NEON_COLORS, renderBlock: renderGlow },
  pastel: { colors: PASTEL_COLORS, renderBlock: renderRounded },
  pixel: { colors: COLORS, renderBlock: renderPixel },
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + pentominó
  [[9,0,9],[9,9,9],[0,0,0]],                  // U pentominó
  [[0,10],[10,10],[0,10],[0,10]],             // Y pentominó
  [[11]],                                      // single 1x1 (recompensa)
  [[12,12,12],[12,0,12],[12,12,12]],          // hueco 3x3 (reto)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle.querySelector('.theme-icon');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let rewardPending;
let gridColor, highlightColor;
let currentSkin, currentMode;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomType() {
  const r = Math.random();
  if (r < 0.05) return 12;                                 // hueco 3x3 (reto) ~5%
  if (r < 0.13) return 8 + Math.floor(Math.random() * 3);  // +, U, Y ~8%
  return Math.floor(Math.random() * 7) + 1;                // clásicas ~87%
}

function randomPiece() {
  return makePiece(randomType());
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (cleared === 4) rewardPending = true; // Tetris: recompensa = pieza 1x1
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  if (rewardPending) {
    next = makePiece(11);
    rewardPending = false;
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  const palette = (currentMode === 'light' && skin.colorsLight) || skin.colors;
  const color = palette[colorIndex];
  context.globalAlpha = alpha ?? 1;
  skin.renderBlock(context, x * size, y * size, size, color);
  context.globalAlpha = 1;
}

// -- Renderers de bloque por skin --
// Firma común: (context, px, py, size, color) donde px/py es la esquina
// superior izquierda en píxeles. Cada uno restaura cualquier estado de ctx
// que modifique (sobre todo shadowBlur).

function renderFlat(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function renderGlow(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = size * 0.4;
  context.fillStyle = color;
  context.fillRect(px + 2, py + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.fillStyle = highlightColor;
  context.fillRect(px + 3, py + 3, size - 6, 3);
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.arcTo(x + w, y, x + w, y + r, r);
  context.lineTo(x + w, y + h - r);
  context.arcTo(x + w, y + h, x + w - r, y + h, r);
  context.lineTo(x + r, y + h);
  context.arcTo(x, y + h, x, y + h - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function renderRounded(context, px, py, size, color) {
  const inset = 2;
  roundRectPath(context, px + inset, py + inset, size - inset * 2, size - inset * 2, 7);
  context.fillStyle = color;
  context.fill();
  context.save();
  context.clip();
  context.fillStyle = highlightColor;
  context.fillRect(px + inset, py + inset, size - inset * 2, 6);
  context.restore();
}

function shade(hex, amt) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `rgb(${r}, ${g}, ${b})`;
}

function renderPixel(context, px, py, size, color) {
  const bevel = Math.max(2, Math.round(size * 0.1));
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // bevel claro arriba/izquierda
  context.fillStyle = shade(color, 40);
  context.fillRect(px + 1, py + 1, size - 2, bevel);
  context.fillRect(px + 1, py + 1, bevel, size - 2);
  // bevel oscuro abajo/derecha
  context.fillStyle = shade(color, -40);
  context.fillRect(px + 1, py + size - 1 - bevel, size - 2, bevel);
  context.fillRect(px + size - 1 - bevel, py + 1, bevel, size - 2);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // stop the loop once the game has ended
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  rewardPending = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function readSkinColors() {
  const styles = getComputedStyle(document.body);
  gridColor = styles.getPropertyValue('--grid-color').trim();
  highlightColor = styles.getPropertyValue('--highlight-color').trim();
}

// Aplica los dos ejes de apariencia (skin + modo claro/oscuro) al DOM y
// repinta si ya hay una partida en curso.
function applyAppearance() {
  Object.keys(SKINS).forEach(s =>
    document.body.classList.toggle('skin-' + s, s === currentSkin));
  document.body.classList.toggle('light-theme', currentMode === 'light');
  skinSelect.value = currentSkin;
  themeIcon.textContent = currentMode === 'light' ? '☀' : '🌙';
  readSkinColors();
  if (board) draw();
  if (next) drawNext();
}

skinSelect.addEventListener('change', () => {
  currentSkin = SKINS[skinSelect.value] ? skinSelect.value : 'retro';
  localStorage.setItem(SKIN_KEY, currentSkin);
  applyAppearance();
});

themeToggle.addEventListener('click', () => {
  currentMode = currentMode === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, currentMode);
  applyAppearance();
});

const savedSkin = localStorage.getItem(SKIN_KEY);
currentSkin = SKINS[savedSkin] ? savedSkin : 'retro';
currentMode = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
applyAppearance();

init();
