# Optional: adaptive Computer-Use mode (only when you can't script the steps)

Everything else in this skill is deterministic and needs no model. Use Computer Use
only when the flow genuinely can't be authored ahead of time — an unknown or
frequently-changing UI you must explore to navigate. For a textbook with a fixed click
sequence, this mode is the wrong tool: it's nondeterministic (screenshots differ run
to run), costs money per step, and is slower.

## What it is

The Anthropic Computer Use capability lets a vision model look at a screenshot and
decide the next mouse/keyboard action. Anthropic ships a reference Docker image with a
virtual display + screenshot loop, but Docker is a convenience, not a requirement — the
model just needs (a) a screenshot to look at and (b) a way to execute the
mouse/keyboard action it returns. You can provide those on a plain VM or host with a
small loop of your own.

## Minimal shape (host, no Docker)

1. Take a screenshot (PyAutoGUI / scrot).
2. Send it to the model with the computer-use tool definitions and the goal.
3. Receive a tool call (e.g. click at x,y / type text), execute it with PyAutoGUI.
4. Screenshot again, loop until the goal screen is reached.
5. Save the screenshots you want as figures.

## Make it textbook-usable

Adaptive runs aren't reproducible, so don't ship their raw output as final figures.
Instead, use Computer Use **once** to discover the exact steps, then **transcribe the
successful path into a deterministic `tutorial.json`** (coordinates → `find` reference
crops, typed text, hotkeys) and capture the real figures with
`capture_pyautogui.py`. You get the convenience of exploration and the reproducibility
a book needs.

## Cost / safety reminders

- Every step is a model call against an image — budget accordingly.
- Keep `pyautogui.FAILSAFE = True` so you can abort by slamming the cursor to a corner.
- Never let an adaptive agent click irreversible controls (delete, format, purchase)
  unattended just to get a screenshot — stop at the confirmation screen.
