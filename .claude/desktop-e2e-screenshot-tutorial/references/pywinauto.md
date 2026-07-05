# pywinauto — robust Windows app automation (no LLM, no Docker)

When the target is a Windows application, pywinauto is more reliable than coordinate
or image matching because it finds controls by their accessible name/role through
Windows UI Automation. A button stays findable after the window moves or the screen
resolution changes.

## Install

```bash
pip install --break-system-packages pywinauto pillow
```

## Pattern

```python
from pywinauto.application import Application
import time

app = Application(backend="uia").start(r"C:\Program Files\App\setup.exe")
dlg = app.window(title_re=".*Setup.*")
dlg.wait("visible", timeout=20)

# screenshot the window (not the whole screen) — clean, cropped figures
dlg.capture_as_image().save("shots/01.png")

# act by name, not coordinates
dlg.child_window(title="Next", control_type="Button").click()
dlg.child_window(title="I agree", control_type="CheckBox").toggle()
```

Inspect available control names with `dlg.print_control_identifiers()` (or the
`inspect.exe` / Accessibility Insights tools) while authoring.

## Fitting it into the pipeline

You can keep the same `tutorial.json` discipline by writing a thin pywinauto runner
that, per step, performs the named-control actions and calls
`dlg.capture_as_image().save(...)`, then writes the shared `shots/manifest.json`
(`step_id`, `title`, `caption`, `image`, `annotated`). After that, `annotate.py` and
`grade.py` from this skill work unchanged, and the docx/pdf skills ingest the manifest
as usual.

## When to prefer this over PyAutoGUI

- The app exposes proper UI Automation controls (most native Win32 / WinForms / WPF).
- You need resolution/DPI independence.
- The flow has dynamic layouts where a fixed coordinate would miss.

Fall back to PyAutoGUI image matching for canvas-heavy apps (games, custom-drawn UIs)
that don't expose named controls.
