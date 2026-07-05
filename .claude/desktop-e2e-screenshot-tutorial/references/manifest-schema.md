# tutorial.json — desktop manifest schema

## Top-level

| field | type | notes |
|---|---|---|
| `title` | string | tutorial name |
| `region` | [x, y, w, h] \| null | crop every screenshot to this rect (the app window); null = full screen |
| `settle` | number | default ms to wait after a step's actions before the screenshot |
| `scale` | number | informational; desktop shots are already in device px (annotate uses dsf=1) |
| `steps` | step[] | ordered |

## Step

| field | type | notes |
|---|---|---|
| `id` | string | "01"… filename stem |
| `title` | string | figure heading |
| `caption` | string | sentence under the figure |
| `actions` | action[] | run in order before the screenshot |
| `settle` | number | override default settle for this step |
| `annotate` | annotation[] | boxes/arrows/highlights (see below) |

## Actions (PyAutoGUI driver)

```
{ "find": "refs/next.png", "then": "click", "confidence": 0.85, "retries": 10 }
{ "click":       { "x": 120, "y": 440 } }
{ "doubleclick": { "x": 300, "y": 200 } }
{ "rightclick":  { "x": 300, "y": 200 } }
{ "move":        { "x": 300, "y": 200 } }
{ "type": "hello world", "interval": 0.03 }
{ "hotkey": ["ctrl", "s"] }
{ "press": "enter" }
{ "scroll": -400 }
{ "wait": 800 }
```

`find` matches a reference-image crop on screen (needs `opencv-python` for the
`confidence` tolerance). Prefer it over raw coordinates — it survives window moves and
documents intent. Keep reference crops tight and visually unique. Store them under a
`refs/` folder next to the manifest; relative paths resolve there.

## Annotations

Same renderer as the web skill. Two ways to get a box:

```json
{ "type": "box", "from": "last_match", "label": "①" }   // auto from the last `find`
{ "type": "box", "box": { "x": 100, "y": 420, "width": 220, "height": 40 }, "label": "②" }
```
Also supports `arrow`, `highlight`, `blur` (e.g. blur a username field). Because
desktop screenshots are already device pixels, boxes are in screenshot pixels directly.

## Output: shots/manifest.json

Identical shape to the web/terminal skills — the docx/pdf skills consume all three the
same way.
