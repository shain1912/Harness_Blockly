---
name: blockpy-roundtrip-verify
description: >-
  End-to-end verification that a Python<->Blockly syntax feature actually works in the REAL
  BlockPy app, not just in the parser. Drives the live UI headlessly (type Python -> click
  Convert -> screenshot the rendered blocks), then judges round-trip correctness from the
  screenshot + a JSON report. Use this whenever you add or change support for a Python
  construct (a new block, a parser/astToBlockly change, a round-trip fix) and want proof it
  renders correctly — especially before claiming a feature is done or committing. Also use
  when asked to "stress-test", "fuzz", "screenshot-verify", or run a "generate-and-verify
  loop" over BlockPy conversions. Prefer this over unit tests alone when the question is
  "does the actual block view look right", since Node-level round-trip tests never exercise
  Blockly serialization, variable resolution, or rendering.
---

# BlockPy round-trip verification (real UI + screenshots)

## Why this exists

The Node-level Playwright specs (`tests/*.spec.js`) check `astToPython` / `astToBlockly`
in isolation. They do **not** prove the construct survives the real path:
`Blockly.serialization.workspaces.load` → workspace render → `workspaceToCode`. Bugs hide
exactly there — unresolved variables, missing block fields, gray `raw_*` fallbacks, a
construct that parses fine but renders as the stale previous workspace. The only way to be
sure is to drive the actual app and **look at the blocks**.

This skill does that: it feeds Python through the live UI and reports both machine-checkable
signals and a screenshot for visual judgment.

## Prerequisites

- Dev server running on `http://localhost:3000` (`npm run dev -- --port 3000 --strictPort`).
  Start it in the background first; the driver connects to it. Override the URL with the
  `APP_URL` env var if the server is on another port.
- Playwright chromium is already installed (the repo's test setup provides it).

## The driver

`scripts/ui_roundtrip_driver.mjs` is the workhorse. One snippet per run:

```bash
node .Codex/skills/blockpy-roundtrip-verify/scripts/ui_roundtrip_driver.mjs <snippetFile> <outDir> <label>
```

It loads the app, switches to the Python tab (`#tab-btn-python`), types the snippet into
`#python-code`, reads the live syntax status (`#syntax-status-text`), clicks Convert
(`#btn-sync-to-blocks`), switches to the block workspace (`#tab-btn-blockly`), screenshots
it, and inspects `window.__blocklyWorkspace`. It writes `<outDir>/<label>.png` and
`<outDir>/<label>.json`, prints `RESULT:<json>`, and exits 0 (ok) / 1 (failed) / 2 (bad args).

Put scratch output under `tmp/` (already gitignored) — e.g. `tmp/rt_shots/`.

### What the JSON report contains

| Field | Meaning |
|---|---|
| `ok` | automated pass: `syntaxValid && blockCount>0 && rawBlockCount===0 && roundTripEquivalent` |
| `syntaxValid` / `syntaxText` | the app's live parser status for the typed code |
| `regenerated` | Python regenerated from the loaded workspace (`workspaceToCode`) |
| `blockTypes` | distinct block types in the workspace |
| `rawBlockCount` | count of gray `raw_statement` / `raw_expression` fallback blocks |
| `roundTripEquivalent` | order-independent line-multiset match of input vs regenerated |
| `error`, `consoleErrors` | driver exception / browser console errors |
| `screenshot` | path to the PNG to read and inspect |

### Verdict criteria

A conversion is correct when **both** hold:
1. The JSON `ok` is true (valid parse, blocks produced, no raw fallback, round-trip equivalent).
2. The screenshot **visually** shows the construct as proper dedicated blocks — no gray/raw
   block, no error banner, and the stale previous workspace did not linger (a hard parse
   failure leaves the prior demo blocks on screen, which `roundTripEquivalent` will already
   flag as false).

Always **Read the PNG** — `ok:true` with a wrong-looking screenshot still fails. Conversely,
investigate every `ok:false`: distinguish a real feature bug from a known unrelated gap
(e.g. a `range()` sub-expression falling back to `raw_expression` is a pre-existing
limitation, not a regression in the construct under test). `roundTripEquivalent:false` while
`syntaxValid:true` usually means the Convert threw and the workspace shows stale blocks.

## Two ways to run

### A. Quick check (a handful of known snippets)
Write each snippet to a `.py` file under `tmp/rt_shots/`, run the driver on each, read the
JSON and the PNG, and report. Good for confirming a specific fix.

### B. Generate-and-verify agent loop (stress test / fuzz)
When asked to stress-test a feature, run it as a multi-agent loop (this requires explicit
opt-in for the Workflow tool — the user asking to "run a loop / fan out agents" counts).
Use `references/loop-workflow.md` as the template. The shape:

- **Generator agent** (one per round) — produces N diverse, random, valid Python snippets
  that exercise the target construct, varying identifiers/types/structure. Steer each round
  to a different theme (basic → generics/edge types → tricky combinations mixed with
  unrelated constructs) so coverage broadens instead of repeating one shape.
- **Verifier agents** (one per snippet, run in parallel) — each writes its snippet to a
  file, runs the driver, reads the JSON **and** the screenshot, and returns a structured
  verdict `{label, ok, blocksRenderedCorrectly, issue}`.
- Loop over rounds, accumulate verdicts, then triage failures into: real bug / out-of-scope
  construct / false-negative from an unrelated known gap.

Keep rounds bounded (e.g. 3 rounds × 5 snippets) unless the user sets a larger budget.

## After verifying

- If a snippet surfaces a real bug, fix it with TDD (add a failing Node spec first), then
  re-run the driver on the offending snippet to confirm the screenshot is now correct.
- Record genuinely out-of-scope constructs (e.g. unsupported syntax that fails hard) rather
  than silently passing over them — they are the next iteration's work.
- Don't commit `tmp/` screenshots; they're scratch.
