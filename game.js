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

const highscoreEntry = document.getElementById('highscore-entry');
const highscoreNameInput = document.getElementById('highscore-name-input');
const highscoreSubmitBtn = document.getElementById('highscore-submit-btn');
const overlayHighscoresSection = document.getElementById('overlay-highscores-section');
const overlayHighscoresBody = document.querySelector('#overlay-highscores-table tbody');

const startScreen = document.getElementById('start-screen');
const startHighscoresBody = document.querySelector('#start-highscores-table tbody');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const playBtn = document.getElementById('play-btn');

const THEME_KEY = 'tetris-theme';
const HIGHSCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';
const MAX_HIGHSCORES = 5;

let board, current, next, score, lines, level, lastTime, dropAccum, dropInterval, animId;
let paused = false;
let gameOver = true; // no game is active until init() runs (start screen is showing)
let rewardPending;
let combo, maxCombo;
let pendingHighscoreSubmit = false;
let gridColor, highlightColor;

function loadHighscores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(e => e && typeof e.name === 'string' && typeof e.score === 'number')
      .slice(0, MAX_HIGHSCORES);
  } catch {
    return [];
  }
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
  } catch {
    // ignore write failures (private mode, quota, etc.)
  }
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY));
    return {
      bestCombo: parsed && typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      maxLines: parsed && typeof parsed.maxLines === 'number' ? parsed.maxLines : 0,
    };
  } catch {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore write failures
  }
}

function qualifiesForHighscore(candidateScore, list) {
  if (list.length < MAX_HIGHSCORES) return true;
  return candidateScore > list[list.length - 1].score;
}

function insertHighscore(name, candidateScore) {
  const list = loadHighscores();
  const entry = { name, score: candidateScore };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const capped = list.slice(0, MAX_HIGHSCORES);
  saveHighscores(capped);
  return { list: capped, index: capped.indexOf(entry) };
}

function renderHighscoresTable(tbody, list, highlightIndex) {
  tbody.innerHTML = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'highscores-empty';
    td.textContent = 'Sin récords todavía';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  list.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('highscore-new');
    const nameTd = document.createElement('td');
    nameTd.textContent = entry.name;
    const scoreTd = document.createElement('td');
    scoreTd.textContent = entry.score.toLocaleString();
    tr.appendChild(nameTd);
    tr.appendChild(scoreTd);
    tbody.appendChild(tr);
  });
}

function renderStartScreen() {
  renderHighscoresTable(startHighscoresBody, loadHighscores(), -1);
  const stats = loadStats();
  startBestCombo.textContent = stats.bestCombo;
  startMaxLines.textContent = stats.maxLines;
}

function showStartScreen() {
  renderStartScreen();
  startScreen.classList.remove('hidden');
}

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
  return cleared;
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
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

  const stats = loadStats();
  let statsChanged = false;
  if (maxCombo > stats.bestCombo) { stats.bestCombo = maxCombo; statsChanged = true; }
  if (lines > stats.maxLines) { stats.maxLines = lines; statsChanged = true; }
  if (statsChanged) saveStats(stats);

  const highscores = loadHighscores();
  if (qualifiesForHighscore(score, highscores)) {
    pendingHighscoreSubmit = true;
    highscoreNameInput.value = '';
    highscoreEntry.classList.remove('hidden');
  } else {
    pendingHighscoreSubmit = false;
    highscoreEntry.classList.add('hidden');
  }
  renderHighscoresTable(overlayHighscoresBody, highscores, -1);
  overlayHighscoresSection.classList.remove('hidden');

  overlay.classList.remove('hidden');
}

function submitHighscore() {
  if (!pendingHighscoreSubmit) return;
  const rawName = highscoreNameInput.value.trim();
  const name = (rawName || 'Jugador').slice(0, 12);
  const { list, index } = insertHighscore(name, score);
  renderHighscoresTable(overlayHighscoresBody, list, index);
  highscoreEntry.classList.add('hidden');
  pendingHighscoreSubmit = false;
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
    highscoreEntry.classList.add('hidden');
    overlayHighscoresSection.classList.add('hidden');
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
  combo = 0;
  maxCombo = 0;
  pendingHighscoreSubmit = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  highscoreEntry.classList.add('hidden');
  overlayHighscoresSection.classList.add('hidden');
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

restartBtn.addEventListener('click', () => {
  if (pendingHighscoreSubmit) submitHighscore();
  init();
});

highscoreSubmitBtn.addEventListener('click', submitHighscore);
highscoreNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitHighscore();
});

resetScoresBtn.addEventListener('click', () => {
  try {
    localStorage.removeItem(HIGHSCORES_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch {
    // ignore
  }
  renderStartScreen();
});

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
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

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

showStartScreen();
