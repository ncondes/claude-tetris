# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build tools, no `package.json` — the whole game is three files.

## Running the game

There is no build/lint/test tooling. To run:

```bash
open index.html                # macOS, just opens the file
python3 -m http.server 8000    # or serve locally, then visit localhost:8000
```

Verify changes by opening the page and playing — there is no automated test suite.

## Architecture

The game lives entirely in `game.js` (~300 lines), driven by `index.html` (DOM/canvas structure) and `style.css` (dark/retro theme). All three files are loaded directly via `<script src="game.js">` with no modules or bundling — everything in `game.js` shares one global scope.

Key pieces in `game.js`:

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–12` identifying which piece locked there.
- **Pieces**: `PIECES` defines each piece as a matrix of color indices, indices `1–7` are the classic tetrominoes, `8–10` are pentominoes (`+`, `U`, `Y`), `11` is a 1×1 single, `12` is a hollow 3×3. `makePiece(type)` builds a piece instance (deep-copies the shape, centers it via `x`). Rotation (`rotateCW`) is a transpose + row-reverse, not per-piece rotation tables.
- **Piece selection** (`randomType`/`randomPiece`): weighted random — hollow 3×3 (reto) ~5%, pentominoes `+`/`U`/`Y` ~8% combined, classic tetrominoes ~87%. The single 1×1 (`11`) is excluded from the random pool.
- **Reward mechanic** (`rewardPending`): set when `clearLines` clears exactly 4 lines (a Tetris); `spawn()` checks it and forces the *next* piece to be the 1×1 single instead of drawing from `randomPiece()`.
- **Collision** (`collide`): checks a shape at a given offset against board bounds and already-locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` and takes the first that doesn't collide.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time in `dropAccum` and drops the piece one row once `dropAccum >= dropInterval`.
- **Line clearing** (`clearLines`): scans bottom-up, splices full rows out and unshifts empty rows at the top; re-checks the same row index after a splice.
- **Scoring/leveling**: `LINE_SCORES` (`[0,100,300,500,800]`) times current `level`; hard drop adds 2 pts/row, soft drop 1 pt/row. Level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`. Special pieces (pentominoes, single, hollow 3×3) carry no scoring bonus.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn at low alpha.
- All game state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `rewardPending`, timing vars) lives in module-level `let` bindings reset by `init()` — there is no state container/class.

Tunable constants at the top of `game.js`: `COLS`, `ROWS`, `BLOCK` (px per cell), `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).

Controls (keydown handler at the bottom of `game.js`): arrows to move/soft-drop, `↑`/`X` to rotate, `Space` for hard drop, `P` to pause.
