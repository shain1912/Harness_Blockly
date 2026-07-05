#!/usr/bin/env python3
"""Draw annotations (numbered boxes, arrows, highlights) onto captured screenshots.

Reads shots/manifest.json. Each shot's `annotate` list contains items with a `box`
(x, y, width, height in CSS px) recorded at capture time, scaled by the manifest's
device_scale_factor. Writes <id>.annotated.png next to each source image.

Annotation item fields:
  type:   "box" | "arrow" | "highlight" | "blur"
  box:    {x, y, width, height}   (auto-filled at capture for web; manual for others)
  label:  optional text drawn in/near the box (e.g. "①")
  color:  optional hex, defaults to a strong accent
  at:     for arrow only — where the arrow points from, {x, y} in CSS px

Usage: python annotate.py shots/manifest.json
"""
import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    sys.exit("Pillow not installed. Run: pip install --break-system-packages pillow")

ACCENT = "#E8483C"
PAD = 6


def load_font(size):
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "C:/Windows/Fonts/malgunbd.ttf",
    ]:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def scaled(box, s):
    return (box["x"] * s, box["y"] * s, box["width"] * s, box["height"] * s)


def draw_box(d, box, s, color, width=4):
    x, y, w, h = scaled(box, s)
    d.rounded_rectangle([x - PAD, y - PAD, x + w + PAD, y + h + PAD],
                        radius=8, outline=color, width=width)


def draw_label(d, box, s, label, color, font):
    x, y, w, h = scaled(box, s)
    tb = d.textbbox((0, 0), label, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    cx, cy = x - PAD - tw - 14, y - PAD
    d.rounded_rectangle([cx, cy, cx + tw + 14, cy + th + 12], radius=6, fill=color)
    d.text((cx + 7, cy + 4), label, fill="white", font=font)


def draw_arrow(d, frm, box, s, color):
    import math
    x, y, w, h = scaled(box, s)
    tx, ty = x + w / 2, y - PAD
    fx, fy = frm["x"] * s, frm["y"] * s
    d.line([fx, fy, tx, ty], fill=color, width=5)
    ang = math.atan2(ty - fy, tx - fx)
    L = 18
    for da in (-0.5, 0.5):
        d.line([tx, ty, tx - L * math.cos(ang - da), ty - L * math.sin(ang - da)],
               fill=color, width=5)


def draw_highlight(img, box, s):
    x, y, w, h = scaled(box, s)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle([x, y, x + w, y + h], fill=(255, 230, 0, 90))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def draw_blur(img, box, s):
    x, y, w, h = [int(v) for v in scaled(box, s)]
    region = img.crop((x, y, x + w, y + h)).filter(ImageFilter.GaussianBlur(12))
    img.paste(region, (x, y))
    return img


def annotate_shot(src: Path, dst: Path, items, dsf):
    img = Image.open(src).convert("RGBA")
    font = load_font(34)
    # blur/highlight first (compositing), then vector marks on top
    for a in items:
        if a.get("box") is None:
            continue
        if a["type"] == "blur":
            img = draw_blur(img, a["box"], dsf)
        elif a["type"] == "highlight":
            img = draw_highlight(img, a["box"], dsf)
    d = ImageDraw.Draw(img)
    for a in items:
        if a.get("box") is None:
            continue
        color = a.get("color", ACCENT)
        if a["type"] == "box":
            draw_box(d, a["box"], dsf, color)
        elif a["type"] == "arrow" and a.get("at"):
            draw_arrow(d, a["at"], a["box"], dsf, color)
        if a.get("label"):
            draw_label(d, a["box"], dsf, a["label"], color, font)
    img.convert("RGB").save(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    args = ap.parse_args()
    mpath = Path(args.manifest)
    base = mpath.parent
    m = json.loads(mpath.read_text(encoding="utf-8"))
    dsf = m.get("device_scale_factor", 2)
    n = 0
    for shot in m["shots"]:
        items = shot.get("annotate", [])
        src = base / shot["image"]
        dst = base / shot["annotated"]
        if not items:
            # nothing to draw — annotated == original
            Image.open(src).convert("RGB").save(dst)
        else:
            annotate_shot(src, dst, items, dsf)
            n += 1
        print(f"  annotated {shot['step_id']}")
    print(f"\nDrew annotations on {n} shot(s).")


if __name__ == "__main__":
    main()
