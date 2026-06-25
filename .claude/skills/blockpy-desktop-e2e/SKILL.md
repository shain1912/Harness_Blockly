---
name: blockpy-desktop-e2e
description: >
  Launch the BlockPy desktop app (the real Electron .exe / win-unpacked, or the dev
  electron build) and inspect its UI one element at a time over the Chrome DevTools
  Protocol — selecting each element by CSS selector, asserting it exists / is visible /
  has the expected text, taking a real screenshot of every step, and emitting a pass/fail
  report plus annotated screenshots. Pure Python (requests + websocket-client); no
  Playwright, no node driver, no Claude API, no Docker. Use this whenever the user wants
  to E2E-test / QA / "검수" / smoke-test / screenshot-verify the BlockPy DESKTOP app, the
  packaged .exe, or the Electron build; verify the workspace file-explorer / Run / Save /
  tabs after a UI change; produce a visual inspection report of the running app; or run a
  "launch the app and check each element" routine. Prefer this over the JS/Playwright web
  tests (tests/*.spec.js) when the target is the actual desktop window, not a dev page.
---

# BlockPy Desktop E2E (CDP element inspection)

Drive the **real packaged BlockPy window** and verify it element-by-element. Borrows the
manifest → annotate → grade pipeline from `desktop-e2e-screenshot-tutorial`, but targets
our own Electron app over CDP for precise, deterministic element selection.

## Why CDP (not pywinauto / PyAutoGUI)

BlockPy is an Electron/Chromium app. UI-Automation (pywinauto) sees only a flaky, collapsed
Chromium accessibility tree, and pixel matching (PyAutoGUI) can't read text or state. CDP
lets us select any element by CSS selector and read its existence, visibility, text, and
bounding box directly — exactly "하나씩 선택해서 검수". We still capture a **real screenshot**
of the running window for the visual record.

## Pipeline

```
checklist.json → run_e2e.py (launch .exe + CDP) → shots/{NN.png, manifest.json, report.html}
              → annotate.py (box each inspected element) → shots/NN.annotated.png
              → grade.py --accept (baseline) / --golden (drift)
```

## One-time setup

```bash
python -m pip install requests websocket-client pillow imagehash
```

## Run it

```bash
# Fastest: launch the dev electron with the current repo code (no repackage needed)
python harness/run_e2e.py --dev

# Against the packaged installer build:
python harness/run_e2e.py --exe "C:/Users/<you>/blockpy-release/win-unpacked/BlockPy.exe"

# Useful flags
python harness/run_e2e.py --dev --keep-open          # leave the window open to poke at it
python harness/run_e2e.py --dev --workspace C:/tmp/ws # pin the workspace folder
python harness/run_e2e.py --dev --out shots/ --port 9222
```

`run_e2e.py` launches the app with `--remote-debugging-port` **and**
`--remote-allow-origins=*` (Chromium 111+ rejects CDP connects otherwise), waits for React +
Blockly to be ready, then walks `checklist.json`. It uses a throwaway temp `BLOCKPY_WORKSPACE`
so the file tree is deterministic (seeded `main.py` + `sample.jpg`) unless you pass
`--workspace`. **Exit code is non-zero if any check fails** — drop it into CI / a routine.

Then make the figures and a drift baseline:

```bash
python harness/annotate.py shots/manifest.json          # draws a box around each element
python harness/grade.py   shots/manifest.json --accept   # first run: promote to golden/
python harness/grade.py   shots/manifest.json --golden golden/   # later: detect visual drift
```

## Authoring the checklist

`checklist.json` is a list of `steps`. Each step optionally runs `do` actions, then a
`check` selects an element and asserts on it. Screenshot + annotation box are automatic.

```json
{
  "id": "06", "title": "Open main.py into the editor",
  "caption": "Clicking the file opens it; the active-file chip updates.",
  "do": [ { "clickText": [".fx-name", "main.py"] }, { "sleep": 500 } ],
  "check": { "selector": ".active-file-chip", "textIncludes": "main.py" }
}
```

**Actions** (`do`): `{"click": "#sel"}`, `{"clickText": ["#sel","label"]}` (first match whose
text contains the label), `{"type": ["#sel","text"]}`, `{"waitFor": ".sel"}`,
`{"evaluate": "js", "await": false}`, `{"sleep": ms}`.

**Check**: `selector` (required) + any of `exists` (default true; set `false` to assert an
element is ABSENT — e.g. the removed sprite canvas), `visible` (default true), `minCount`,
`textIncludes`. The element's text comes from `innerText` OR `value` (so `<textarea>` / inputs
work). `highlight` (selector) overrides which element gets outlined for the shot.

## Gotchas

- Launch flags are mandatory: `--remote-debugging-port=<port> --remote-allow-origins=*`.
- Selectors are CSS only — for "the row whose text is X" use `clickText`, not `:has-text()`.
- `device_scale_factor` in the manifest is the window's `devicePixelRatio` (often 2 on
  high-DPI Windows); `annotate.py` scales boxes by it so they land on the right pixels.
- The harness clicks via JS (`el.click()`), which fires React handlers reliably. For native
  key events (global Ctrl+S etc.) add an `evaluate` action dispatching the event.
- Don't point `--workspace` at a real project unless you mean it — steps create folders.
- See `references/cdp-notes.md` for the raw CDP details and how to extend the client.
