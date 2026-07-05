#!/usr/bin/env python3
"""Deterministically drive a desktop app with PyAutoGUI and capture step screenshots.

No LLM and no Docker required. Each step runs `actions`, waits `settle` ms, then a
screenshot is taken (full screen, or cropped to a fixed `region`). Reference-image
matching (`find`) is preferred over raw coordinates because it tolerates window moves
and is self-documenting.

Usage:
  python capture_pyautogui.py tutorial.json --out shots/
  python capture_pyautogui.py tutorial.json --out shots/ --countdown 5
  xvfb-run -a python capture_pyautogui.py tutorial.json --out shots/   # headless Linux
"""
import argparse
import json
import sys
import time
from pathlib import Path

try:
    import pyautogui
except Exception as e:
    sys.exit("PyAutoGUI not available: %s\n"
             "  pip install --break-system-packages pyautogui pillow opencv-python\n"
             "  (Linux also needs `scrot`; headless needs Xvfb)" % e)

pyautogui.FAILSAFE = True   # slam mouse to a corner to abort
pyautogui.PAUSE = 0.2


def locate(image, confidence=0.85):
    """Return the center+box of a reference image on screen, or None."""
    try:
        box = pyautogui.locateOnScreen(image, confidence=confidence)
    except Exception:
        box = None
    if box is None:
        return None
    cx, cy = pyautogui.center(box)
    return {"center": (cx, cy),
            "box": {"x": box.left, "y": box.top, "width": box.width, "height": box.height}}


def run_action(action, state):
    """Execute one action; update state['last_match'] when an image is found."""
    if "find" in action:
        ref = action["find"]
        match = None
        for _ in range(action.get("retries", 10)):
            match = locate(ref, action.get("confidence", 0.85))
            if match:
                break
            time.sleep(0.5)
        if not match:
            raise RuntimeError(f"Could not find reference image: {ref}")
        state["last_match"] = match
        then = action.get("then")
        if then == "click":
            pyautogui.click(*match["center"])
        elif then == "doubleclick":
            pyautogui.doubleClick(*match["center"])
        elif then == "move":
            pyautogui.moveTo(*match["center"])
    elif "click" in action:
        c = action["click"]
        pyautogui.click(c["x"], c["y"])
    elif "doubleclick" in action:
        c = action["doubleclick"]
        pyautogui.doubleClick(c["x"], c["y"])
    elif "rightclick" in action:
        c = action["rightclick"]
        pyautogui.rightClick(c["x"], c["y"])
    elif "move" in action:
        c = action["move"]
        pyautogui.moveTo(c["x"], c["y"])
    elif "type" in action:
        pyautogui.write(action["type"], interval=action.get("interval", 0.03))
    elif "hotkey" in action:
        pyautogui.hotkey(*action["hotkey"])
    elif "press" in action:
        pyautogui.press(action["press"])
    elif "scroll" in action:
        pyautogui.scroll(action["scroll"])
    elif "wait" in action:
        time.sleep(action["wait"] / 1000)
    else:
        raise ValueError(f"Unknown action: {action}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--out", default="shots")
    ap.add_argument("--countdown", type=int, default=0,
                    help="seconds to wait before starting (focus the app)")
    args = ap.parse_args()

    m = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    base = Path(args.manifest).parent
    region = m.get("region")   # [x, y, w, h] or null for full screen
    default_settle = m.get("settle", 500)

    if args.countdown:
        for i in range(args.countdown, 0, -1):
            print(f"  starting in {i}...", end="\r"); time.sleep(1)
        print()

    shots = []
    for step in m["steps"]:
        sid = step["id"]
        state = {"last_match": None}
        for action in step.get("actions", []):
            # resolve relative reference-image paths against the manifest dir
            if "find" in action and not Path(action["find"]).is_absolute():
                action = {**action, "find": str(base / action["find"])}
            run_action(action, state)
        time.sleep(step.get("settle", default_settle) / 1000)

        img_path = out_dir / f"{sid}.png"
        shot = pyautogui.screenshot(region=tuple(region) if region else None)
        shot.save(img_path)

        # fill annotation boxes that reference the last image match
        anns = []
        for a in step.get("annotate", []):
            box = a.get("box")
            if a.get("from") == "last_match" and state["last_match"]:
                lm = state["last_match"]["box"]
                if region:
                    lm = {"x": lm["x"] - region[0], "y": lm["y"] - region[1],
                          "width": lm["width"], "height": lm["height"]}
                box = lm
            anns.append({**a, "box": box})

        shots.append({
            "step_id": sid,
            "title": step.get("title", ""),
            "caption": step.get("caption", ""),
            "image": f"{sid}.png",
            "annotated": f"{sid}.annotated.png",
            "annotate": anns,
        })
        print(f"  captured {sid}  {step.get('title','')}")

    manifest = {
        "tutorial": m.get("title", ""),
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "device_scale_factor": 1,   # desktop screenshots are already in device px
        "shots": shots,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {len(shots)} shots + manifest.json to {out_dir}/")


if __name__ == "__main__":
    main()
