#!/usr/bin/env python3
"""Generate the BlockPy app icon -> build/icon.png (1024) + build/icon.ico (multi-size).

Tries the MiniMax image-generation API using a key from .env (the key VALUE is never
printed). If that's unavailable/fails, draws a clean geometric fallback icon with Pillow so
the build always gets an icon. Run: python scripts/make-icon.py
"""
import base64
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)
PNG = BUILD / "icon.png"
ICO = BUILD / "icon.ico"

CREAM = (250, 249, 245)
CORAL = (204, 120, 92)
TEAL = (93, 184, 166)
INK = (31, 29, 26)


def read_minimax_key():
    env = ROOT / ".env"
    if not env.exists():
        return None
    keys = {}
    for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$", line)
        if m:
            keys[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    for name in ("MINIMAX1", "MINIMAX2", "MINIMAX3", "MINIMAX4"):
        if keys.get(name):
            return keys[name]
    return None


def try_minimax(key):
    """Return PNG bytes from MiniMax image gen, or None on any failure."""
    try:
        import requests
    except Exception:
        return None
    prompt = ("A modern minimalist app icon for 'BlockPy', a visual coding playground that "
              "turns colorful programming blocks into Python. Flat design, rounded-square icon, "
              "two interlocking puzzle/code blocks in warm coral and teal on a soft cream "
              "background, centered, no text, crisp, high contrast, app-icon style.")
    endpoints = ["https://api.minimax.io/v1/image_generation",
                 "https://api.minimaxi.com/v1/image_generation"]
    body = {"model": "image-01", "prompt": prompt, "aspect_ratio": "1:1",
            "response_format": "base64", "n": 1}
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    for url in endpoints:
        try:
            r = requests.post(url, json=body, headers=headers, timeout=90)
        except Exception as e:
            print(f"[icon] MiniMax request failed ({url.split('//')[1].split('/')[0]}): {e}")
            continue
        if r.status_code != 200:
            print(f"[icon] MiniMax {r.status_code} from {url.split('//')[1].split('/')[0]}: {r.text[:160]}")
            continue
        try:
            j = r.json()
        except Exception:
            continue
        # Defensive: find a base64 image or a URL anywhere in the response.
        b64 = _find_b64(j)
        if b64:
            try:
                return base64.b64decode(b64)
            except Exception:
                pass
        link = _find_url(j)
        if link:
            try:
                img = requests.get(link, timeout=60)
                if img.status_code == 200:
                    return img.content
            except Exception:
                pass
    return None


def _find_b64(obj):
    if isinstance(obj, str):
        s = obj.strip()
        if len(s) > 500 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", s):
            return s
        return None
    if isinstance(obj, dict):
        for v in obj.values():
            f = _find_b64(v)
            if f:
                return f
    if isinstance(obj, list):
        for v in obj:
            f = _find_b64(v)
            if f:
                return f
    return None


def _find_url(obj):
    if isinstance(obj, str) and obj.startswith("http") and re.search(r"\.(png|jpg|jpeg|webp)", obj):
        return obj
    if isinstance(obj, dict):
        for v in obj.values():
            f = _find_url(v)
            if f:
                return f
    if isinstance(obj, list):
        for v in obj:
            f = _find_url(v)
            if f:
                return f
    return None


def fallback_icon():
    """A clean geometric BlockPy mark: rounded cream tile with two interlocking blocks."""
    from PIL import Image, ImageDraw
    S = 1024
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # rounded cream tile
    pad = 70
    d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=180, fill=CREAM)
    # subtle border
    d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=180, outline=(230, 223, 216), width=8)

    def block(x, y, w, h, color, knob_up=True):
        r = 36
        d.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=color)
        # a puzzle knob on top/bottom edge
        kr = 52
        kx = x + w / 2
        if knob_up:
            d.ellipse([kx - kr, y - kr, kx + kr, y + kr], fill=color)
        else:
            d.ellipse([kx - kr, y + h - kr, kx + kr, y + h + kr], fill=color)

    # coral block (upper-left) + teal block (lower-right), interlocking
    block(300, 285, 300, 230, CORAL, knob_up=False)
    block(430, 520, 300, 230, TEAL, knob_up=True)
    # tiny "play"/code accent on the coral block
    d.polygon([(372, 350), (372, 450), (452, 400)], fill=CREAM)
    return img


def main():
    from PIL import Image
    png_bytes = None
    key = read_minimax_key()
    if key:
        print("[icon] Trying MiniMax image generation (key from .env)...")
        png_bytes = try_minimax(key)
    else:
        print("[icon] No MiniMax key in .env — using the Pillow fallback icon.")

    if png_bytes:
        PNG.write_bytes(png_bytes)
        base = Image.open(PNG).convert("RGBA")
        print(f"[icon] Used MiniMax-generated image ({base.size[0]}x{base.size[1]}).")
    else:
        base = fallback_icon()
        print("[icon] Used the Pillow geometric fallback icon.")

    base = base.resize((1024, 1024), Image.LANCZOS)
    base.save(PNG)
    # Multi-resolution .ico for Windows (taskbar/explorer/exe).
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    base.save(ICO, format="ICO", sizes=sizes)
    print(f"[icon] Wrote {PNG.relative_to(ROOT)} and {ICO.relative_to(ROOT)} ({len(sizes)} sizes).")


if __name__ == "__main__":
    main()
