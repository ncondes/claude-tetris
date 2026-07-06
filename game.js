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

// Paleta suavizada/desaturada usada por el skin "pastel".
const PASTEL_COLORS = [
  null,
  '#b3e5fc', // I - cyan pastel
  '#fff59d', // O - amarillo pastel
  '#e1bee7', // T - púrpura pastel
  '#c8e6c9', // S - verde pastel
  '#ffab91', // Z - salmón pastel
  '#c5cae9', // J - índigo pastel
  '#ffe0b2', // L - naranja pastel
  '#f8bbd0', // + pentominó - rosa pastel
  '#b2dfdb', // U pentominó - teal pastel
  '#f0f4c3', // Y pentominó - lima pastel
  '#fafafa', // single 1x1 - blanco suave
  '#cfd8dc', // hueco 3x3 - gris pastel
];

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

const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const toggleControlsBtn = document.getElementById('toggle-controls-btn');
const pauseControlsList = document.getElementById('pause-controls-list');
const startLevelSelect = document.getElementById('start-level-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';
const START_LEVEL_KEY = 'tetris-start-level';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let rewardPending;
let gridColor, highlightColor;
let activeSkin;

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

// Traza un rectángulo con esquinas redondeadas en el path actual del contexto,
// usando context.roundRect si está disponible o un fallback manual con arcTo.
function roundedRectPath(context, x, y, w, h, r) {
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  context.moveTo(x + rr, y);
  context.arcTo(x + w, y, x + w, y + h, rr);
  context.arcTo(x + w, y + h, x, y + h, rr);
  context.arcTo(x, y + h, x, y, rr);
  context.arcTo(x, y, x + w, y, rr);
  context.closePath();
}

// Cada skin define su propia rutina de pintado de bloque; drawBlock() delega
// en la del skin activo manteniendo su firma/llamadas intactas.
const SKINS = {
  retro: {
    // Comportamiento original: relleno plano + franja de brillo.
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = COLORS[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = highlightColor;
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    // Bloques con resplandor (glow) sobre fondo oscuro forzado vía CSS.
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = COLORS[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // Resetear el glow para que no se filtre a la cuadrícula ni a otros bloques.
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.fillStyle = highlightColor;
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  pastel: {
    // Paleta suavizada + esquinas redondeadas.
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = PASTEL_COLORS[colorIndex] || COLORS[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      const radius = Math.min(6, s / 3);
      context.globalAlpha = alpha ?? 1;
      context.beginPath();
      roundedRectPath(context, px, py, s, s, radius);
      context.fillStyle = color;
      context.fill();
      // Recortar la franja de brillo a la forma redondeada.
      context.save();
      context.clip();
      context.fillStyle = highlightColor;
      context.fillRect(px, py, s, 4);
      context.restore();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    // Relleno plano + textura de mini-píxeles en patrón de tablero.
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = COLORS[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      const cell = Math.max(2, Math.floor(s / 4));
      context.fillStyle = highlightColor;
      for (let ry = 0; ry < s; ry += cell * 2) {
        for (let rx = 0; rx < s; rx += cell * 2) {
          context.fillRect(px + rx, py + ry, cell, cell);
          if (rx + cell < s && ry + cell < s) {
            context.fillRect(px + rx + cell, py + ry + cell, cell, cell);
          }
        }
      }
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      context.fillRect(px + s - cell, py, cell, cell);
      context.globalAlpha = 1;
    },
  },
};

function drawBlock(context, x, y, colorIndex, size, alpha) {
  const skin = SKINS[activeSkin] || SKINS.retro;
  skin.drawBlock(context, x, y, colorIndex, size, alpha);
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
    // avoid a lingering focused control inside the pause menu from
    // reacting to a stray Space/Enter keypress once gameplay resumes
    if (document.activeElement && pauseMenu.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseMenu.classList.remove('hidden');
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
  const startLevel = parseInt(startLevelSelect.value, 10) || 1;
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  rewardPending = false;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // let a focused <select> handle its own Escape (e.g. closing a native
  // dropdown) instead of also toggling the whole pause menu underneath it
  if (e.code === 'Escape' && e.target === startLevelSelect) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
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

resumeBtn.addEventListener('click', () => {
  resumeBtn.blur();
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', () => {
  pauseRestartBtn.blur();
  init();
});

toggleControlsBtn.addEventListener('click', () => {
  toggleControlsBtn.blur();
  pauseControlsList.classList.toggle('hidden');
});

function loadStartLevel() {
  try {
    const stored = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
    if (Number.isInteger(stored) && stored >= 1 && stored <= 10) return stored;
  } catch (e) {
    // localStorage unavailable (private mode, disabled, etc.) — fall back to default
  }
  return 1;
}

startLevelSelect.value = String(loadStartLevel());

startLevelSelect.addEventListener('change', () => {
  try {
    localStorage.setItem(START_LEVEL_KEY, startLevelSelect.value);
  } catch (e) {
    // ignore persistence failures
  }
});

function readThemeColors() {
  const styles = getComputedStyle(document.body);
  gridColor = styles.getPropertyValue('--grid-color').trim();
  highlightColor = styles.getPropertyValue('--highlight-color').trim();
}

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  themeIcon.textContent = theme === 'light' ? '☀' : '🌙';
  readThemeColors();
  if (board) draw();
}

function toggleTheme() {
  const newTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, newTheme);
  applyTheme(newTheme);
}

themeToggle.addEventListener('click', toggleTheme);

function applySkin(name) {
  const skinName = SKINS[name] ? name : 'retro';
  activeSkin = skinName;
  localStorage.setItem(SKIN_KEY, skinName);
  Array.from(document.body.classList)
    .filter(cls => cls.startsWith('skin-'))
    .forEach(cls => document.body.classList.remove(cls));
  document.body.classList.add(`skin-${skinName}`);
  if (skinSelect) skinSelect.value = skinName;
  // Algunos skins (p. ej. neon) redefinen --grid-color/--highlight-color en
  // combinación con el tema activo; releer tras cambiar la clase del body.
  readThemeColors();
  if (board) {
    draw();
    drawNext();
  }
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
}

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

let persistedSkin = 'retro';
try {
  persistedSkin = localStorage.getItem(SKIN_KEY) || 'retro';
} catch {
  persistedSkin = 'retro';
}
applySkin(persistedSkin);

init();
