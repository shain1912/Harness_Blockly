# Headless Linux capture with Xvfb (no Docker required)

You don't need Docker for desktop automation. On Linux you can run a real desktop app
against a **virtual framebuffer** (Xvfb) — an in-memory X display with no physical
monitor — and screenshot it. This is the lightweight, no-API, no-container path, ideal
for CI or a server.

## Install

```bash
sudo apt-get install -y xvfb x11-utils scrot xdotool
pip install --break-system-packages pyautogui pillow opencv-python
```

## Run the capture under a virtual display

```bash
xvfb-run -a --server-args="-screen 0 1440x900x24" \
  python scripts/capture_pyautogui.py tutorial.json --out shots/
```

`xvfb-run` creates the display, sets `$DISPLAY`, runs your command, and tears it down.
Fix the resolution (`1440x900x24`) so every screenshot is identical in size.

## Driving the app

- **PyAutoGUI** works as-is inside the Xvfb session (screenshots via `scrot`).
- For window placement / focus, **xdotool** is handy:
  ```bash
  xdotool search --name "Inkscape" windowactivate
  xdotool key ctrl+s
  ```
- Launch the app yourself first (e.g. `inkscape &`) inside the same `DISPLAY`, or wrap
  both launch and capture in one `xvfb-run bash -c "..."`.

## Notes

- A window manager helps apps that expect one: `fluxbox &` or `openbox &` inside the
  Xvfb session before launching the app.
- Fonts: install the same font packages you'd ship in the book (e.g. Noto Sans CJK)
  so Korean text renders identically.
- This is the same idea Docker-based setups use internally — you're just doing it
  directly on the host without the container layer.
