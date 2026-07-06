---
name: verify
description: How to actually run and drive this Tetris game end-to-end (no build tooling, no test suite, canvas rendering)
---

# Verifying claude-tetris changes

This repo is three static files (`game.js`, `index.html`, `style.css`) with
no build step and no test suite. "Verification" means loading the page in a
real browser and driving the UI — reading the source is not enough, since
canvas rendering (colors, `shadowBlur`, custom paths) only shows up at
runtime.

## Serve it

```bash
python3 -m http.server 8791    # from the repo root (or worktree root)
```

Any port works; 8791 avoids clashing with other local dev servers.

## Drive it in a real browser

Prefer the `mcp__claude-in-chrome__*` tools (tabs_context_mcp → navigate →
computer/screenshot) if the Claude browser extension is connected — that's
the normal path and lets you click/screenshot interactively.

**If the extension isn't connected** (`tabs_context_mcp` errors with "Browser
extension is not connected"), fall back to driving headless Chrome directly
via the Chrome DevTools Protocol (CDP) from Node — no extra npm installs
needed, since Node ≥22 ships a global `fetch` and `WebSocket`:

1. Launch headless Chrome with a remote debugging port and a scratch profile:
   `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
   --remote-debugging-port=9333 --headless=new --disable-gpu
   --window-size=520,760 --user-data-dir=<tmp dir> about:blank`
2. Poll `http://localhost:9333/json/version` until it responds, then `PUT
   http://localhost:9333/json/new` to get a target with a
   `webSocketDebuggerUrl`.
3. Open a `WebSocket` to that URL and speak CDP JSON-RPC directly:
   `Page.enable`, `Runtime.enable`, `Page.navigate`, `Runtime.evaluate`
   (`returnByValue: true`) to drive the UI, `Page.captureScreenshot`
   (`format: 'png'`, optionally with a `clip: {x,y,width,height,scale}`) to
   capture evidence, decode the base64 `data` field to a PNG file.
4. Kill the Chrome process (and let the temp `user-data-dir` get cleaned up)
   when done.

A full working driver script was written during the skins-feature
verification; recreate it inline via `Write` + `Bash node <script>.mjs` next
time rather than searching for it — it's ~90 lines, see the pattern above.

### Driving the real UI, not internals

Always trigger state changes the way a user would — set the `<select>`'s
`.value` then `dispatchEvent(new Event('change', {bubbles:true}))`, or
`.click()` the actual button — rather than calling internal functions
directly. **Gotcha:** `game.js` is loaded as a classic (non-module)
`<script>`, so its top-level `function` declarations become `window`
properties, and — less obviously — its top-level `let`/`const` bindings
(e.g. `currentSkin`, `board`) are visible to `Runtime.evaluate` too, because
all classic `<script>` tags on one page share a single global lexical
environment. It's tempting to just poke those directly; don't — drive the
DOM instead so you're exercising the same path a real user hits.

Gameplay input: keyboard handling is on `document`, so dispatch
`new KeyboardEvent('keydown', {code: 'ArrowLeft', bubbles: true})` etc.
against `document`, not the canvas.

## What to check for this feature (skins + light/dark)

- `document.body.className` after each change — should be `skin-<skin>`
  plus `light-theme` when in light mode.
- `getComputedStyle(document.body).getPropertyValue('--bg'|'--board-bg'|...)`
  to confirm the right CSS variables resolved (cheap sanity check before even
  screenshotting).
- Screenshot each of the 4 skins × 2 modes to see the canvas piece colors and
  block-drawing style (flat/glow/rounded/pixel-bevel) — CSS state alone
  doesn't prove `drawBlock`/`SKINS[...].renderBlock` painted correctly.
- Small details like the Pixel Art bevel are subtle at the real 30px block
  size — use `Emulation.setDeviceMetricsOverride` with a higher
  `deviceScaleFactor` (e.g. 4) plus a tight `clip` region in
  `Page.captureScreenshot` to zoom into a handful of blocks for a close look.
- Reload the page and confirm `localStorage.getItem('tetris-skin'/'tetris-theme')`
  restores the same look (persistence).
- Probe a corrupted/legacy `localStorage` value (e.g. an old skin name that
  no longer exists) — should fall back to `retro` without throwing.
- `Runtime.exceptionThrown` / console errors should stay empty across all of
  the above.
