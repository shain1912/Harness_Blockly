---
name: desktop-e2e-screenshot-tutorial
description: >
  Automate a real desktop application or operating system end-to-end and capture
  reproducible step-by-step screenshots for a textbook, manual, or course — WITHOUT
  requiring any LLM API or Docker. Drives the GUI deterministically with PyAutoGUI /
  pywinauto / SikuliX (and Xvfb for headless Linux), screenshots each step, and emits
  the same shot-manifest the docx/pdf skills consume. Use this skill whenever the user
  wants screenshots of a desktop app (installers, IDEs, Unity, Photoshop, Windows
  dialogs, native tools), asks to "automate desktop screenshots", "capture an app's
  screens", build an OS/desktop 교재·매뉴얼, or asks whether desktop automation needs
  the Claude API or Docker (it does not). An optional adaptive Computer-Use mode exists
  only for flows that can't be scripted in advance.
---

# Desktop / OS E2E Screenshot Tutorial

Capture textbook screenshots of native desktop apps by scripting the GUI directly.
Same manifest-driven pipeline as the web and terminal skills.

## Read this first: you do NOT need the Claude API or Docker

For a textbook, the click sequence is already known, so script it deterministically:

| tool | platform | how it targets things | LLM/Docker |
|---|---|---|---|
| **PyAutoGUI** | Win/mac/Linux | screen coords + image matching (`locateOnScreen`) | none |
| **pywinauto** | Windows | finds controls by name/role via UI Automation (most robust) | none |
| **SikuliX** | Win/mac/Linux | uses reference screenshots as selectors | none |
| **xdotool + Xvfb** | Linux | window/key/mouse control on a virtual display (headless) | none |
| Computer Use | all | a vision model decides each click (adaptive) | API + (usually) Docker |

Deterministic scripting is *better* for a book: identical screenshots every run, no
cost, no nondeterminism. Reach for Computer Use only when the steps genuinely can't be
authored ahead of time (unknown/changing UI you must explore). See
`references/computer-use.md` for that optional path; everything else needs no model.

## Pipeline

```
tutorial.json → capture_pyautogui.py → annotate.py → grade.py → shots/manifest.json → (docx skill)
```

## Choosing the driver

- **Windows app with named controls** → pywinauto. Clicking a button by its label
  survives window moves and resolution changes. See `references/pywinauto.md`.
- **Anything, simplest start** → PyAutoGUI (`scripts/capture_pyautogui.py`). Use image
  matching (`find` action) instead of bare coordinates wherever possible so it's not
  resolution-fragile.
- **Cross-platform, screenshot-as-selector** → SikuliX. See `references/sikulix.md`.
- **Headless Linux / CI** → run any of the above under Xvfb. See
  `references/linux-headless.md`.

## Step 1 — Author the manifest

```json
{
  "title": "Unity 설치 마법사",
  "scale": 2,
  "region": null,
  "settle": 600,
  "steps": [
    {
      "id": "01",
      "title": "시작 화면",
      "caption": "설치 마법사가 열리면 Next를 클릭합니다.",
      "actions": [{ "find": "refs/next_button.png", "then": "click" }],
      "annotate": [{ "type": "box", "from": "last_match", "label": "①" }]
    },
    {
      "id": "02",
      "title": "약관 동의",
      "caption": "동의 체크박스를 선택하고 진행합니다.",
      "actions": [
        { "click": { "x": 120, "y": 440 } },
        { "find": "refs/next_button.png", "then": "click" }
      ]
    }
  ]
}
```

Prefer `find` (reference-image matching) over raw `{x,y}` clicks: it tolerates window
movement and is self-documenting. Capture small reference crops of buttons/fields into
`refs/`. When a `find` succeeds, its match box can auto-feed an annotation via
`"from": "last_match"`. See `references/manifest-schema.md`.

## Step 2 — Capture

```bash
pip install --break-system-packages pyautogui pillow opencv-python imagehash
# Linux also needs: sudo apt-get install scrot   (for screenshots)
python scripts/capture_pyautogui.py tutorial.json --out shots/
```

Replays each step's actions, waits `settle` ms for windows/animations, then
screenshots (full screen, or a fixed `region` to crop to the app window). Writes
`shots/<id>.png` + `shots/manifest.json`. Add `--countdown 5` to get five seconds to
focus the target app before it starts.

For an unattended/headless run, wrap it in Xvfb (`references/linux-headless.md`):
```bash
xvfb-run -a --server-args="-screen 0 1440x900x24" \
  python scripts/capture_pyautogui.py tutorial.json --out shots/
```

## Step 3 — Annotate & Step 4 — Grade

Identical to the web skill — these scripts operate on `manifest.json`:

```bash
python scripts/annotate.py shots/manifest.json
python scripts/grade.py shots/manifest.json --accept          # first run
python scripts/grade.py shots/manifest.json --golden golden/  # later, detects drift
```

Desktop UIs drift across OS versions and themes, so the perceptual-hash grader is
especially worth running before each reprint.

## Step 5 — Hand off to the document

`shots/manifest.json` is the shared format. Call the **docx** or **pdf** skill to
insert each `annotated` image with its `caption` as a figure, in order.

## Authoring tips

- Pin display resolution and OS theme (light/dark) for the whole tutorial; a theme
  change re-flows everything and the grader will (correctly) flag it.
- Use a clean VM or fresh user profile so no personal data, notifications, or stray
  windows appear in shots.
- Image-match (`find`) beats coordinates. Keep reference crops tight and unique.
- Stage app state (sample project, fixed file) so screenshots aren't full of today's
  date or your own paths.
- For destructive or irreversible wizard steps, capture up to the confirmation screen
  and stop — don't let automation click "Format disk" / "Delete" for a screenshot.
