# CDP notes — driving the Electron app from Python

## Launch flags (both required)

```
BlockPy.exe --remote-debugging-port=9222 --remote-allow-origins=*
```

- `--remote-debugging-port` makes Chromium expose the DevTools endpoint at
  `http://127.0.0.1:9222`. Electron forwards this switch to Chromium automatically.
- `--remote-allow-origins=*` is mandatory on Chromium 111+. Without it the websocket
  handshake is rejected with **403 "Rejected an incoming WebSocket connection ... origin"**.
  Use `*` for local testing, or the exact origin (`http://127.0.0.1:9222`).

A packaged Electron app honours these unless its build explicitly disabled remote debugging
(we don't). If `--inspect`-style flags were fused off, `--remote-debugging-port` still works.

## Finding the page target

```
GET http://127.0.0.1:9222/json          -> [{ "type":"page", "url":..., "webSocketDebuggerUrl":... }]
```

The app may have several targets (the page, plus any DevTools/extension targets). Pick the
`type=="page"` whose `url` starts with `http://127.0.0.1` (the embedded server) — that's our
window. `cdp.py` does this with the `page_url_prefix` arg.

## The protocol we use

One websocket, synchronous request/reply. Each message is `{id, method, params}`; the reply
has the same `id`. Events (no `id`) are interleaved — `cdp.send()` reads until the matching
id and ignores events.

| need | CDP method | notes |
|---|---|---|
| select + inspect an element | `Runtime.evaluate` | run JS: `document.querySelector(...)`, read `getBoundingClientRect()`, `getComputedStyle`, `innerText`/`value` |
| click / type | `Runtime.evaluate` | `el.click()`; for inputs set `.value` via the native setter + dispatch `input`/`change` |
| screenshot | `Page.captureScreenshot` | returns base64 PNG of the viewport (the app content) |
| DPR | `Runtime.evaluate` | `window.devicePixelRatio` → manifest `device_scale_factor` |

Evaluating JS is the most robust way to "select and inspect": one round-trip returns count,
visibility, text, and rect together, and it survives layout/DPI changes (pixel/AX tools don't).

## Why not `Input.dispatchMouseEvent` for clicks?

Coordinate clicks need the element rect → CSS px → device px conversion and can miss after a
reflow. `el.click()` via `Runtime.evaluate` fires the same React onClick deterministically.
Reach for `Input.*` only for things JS can't do (true OS drag, native menus).

## Extending the client

- **Wait for a condition**: `cdp.wait_for("document.querySelector('.fx-row')")` polls a JS
  boolean with a timeout.
- **Element screenshot (cropped)**: pass `clip={x,y,width,height,scale:1}` to
  `Page.captureScreenshot` using the inspected rect.
- **Console/exception capture**: subscribe to `Runtime.consoleAPICalled` /
  `Runtime.exceptionThrown` events (read them in the `send` loop instead of discarding).
- **Multiple windows**: open a second `CDP` against a different target's
  `webSocketDebuggerUrl`.

## Headless?

Electron can't run truly headless for screenshots, but a dedicated desktop / a second user
session / a VM keeps the harness unattended and the shots free of stray windows. Pin the OS
theme + display scale so `grade.py` doesn't flag benign drift.
