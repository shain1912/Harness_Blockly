# SikuliX — screenshot-as-selector automation (cross-platform, no LLM)

SikuliX finds things on screen by matching reference images, then clicks/types. It's
cross-platform and great for apps with no accessible control tree (games, Electron
canvases, custom UIs). Runs on the JVM (Jython).

## Setup

Download `sikulixide-*.jar` from the SikuliX releases. Run scripts headless with:

```bash
java -jar sikulixide.jar -r script.sikuli
```

## Pattern

```python
# script.sikuli  (Jython)
from sikuli import *
import shutil

setAutoWaitTimeout(15)
click("refs/next_button.png")        # match + click
type("hello")
wait("refs/finished.png")            # block until this appears
shutil.copy(capture(SCREEN.getBounds()), "shots/01.png")  # screenshot
```

`capture(region)` returns a path to a saved screenshot; copy it to your `shots/` with
the step id. Build the shared `shots/manifest.json` (same fields as the other skills)
from your script so `annotate.py` / `grade.py` and the docx/pdf skills work unchanged.

## Strengths / limits

- Strength: works anywhere pixels are pixels; reference images double as documentation.
- Limit: sensitive to theme/resolution/scaling changes (so is any image approach) —
  pin those for the tutorial and let `grade.py` flag drift on reprints.
- For Windows apps with real controls, prefer pywinauto (more robust). SikuliX shines
  where no control tree exists.
