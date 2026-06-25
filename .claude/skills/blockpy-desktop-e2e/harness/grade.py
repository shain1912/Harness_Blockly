#!/usr/bin/env python3
"""Grade captured screenshots against a golden reference to catch UI drift.

Uses a perceptual hash (robust to font antialiasing / 1px shifts) instead of exact
pixel diff, which is too brittle for real UIs. Each shot is classified:

  pass   — hash distance <= --pass-threshold (default 4)
  drift  — within --fail-threshold (default 12): probably the same screen, moved a bit
  fail   — beyond that, or missing in golden: likely a real change to re-author

For anything not "pass" a side-by-side diff image is written to diffs/.

Workflow:
  python grade.py shots/manifest.json --accept            # first run: set the golden
  python grade.py shots/manifest.json --golden golden/    # later runs: compare

Add --vlm to additionally ask whether each screenshot matches its caption's intent.
(That hook is left as a clearly-marked TODO so you can wire it to whatever model the
session uses; the perceptual-hash grading works with no model and no network.)
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
    import imagehash
except ImportError:
    sys.exit("Run: pip install --break-system-packages pillow imagehash")


def phash(path):
    return imagehash.phash(Image.open(path), hash_size=16)


def side_by_side(a, b, out):
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    h = max(ia.height, ib.height)
    canvas = Image.new("RGB", (ia.width + ib.width + 20, h), "white")
    canvas.paste(ia, (0, 0))
    canvas.paste(ib, (ia.width + 20, 0))
    canvas.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--golden", default="golden")
    ap.add_argument("--accept", action="store_true",
                    help="promote current shots to the golden reference")
    ap.add_argument("--pass-threshold", type=int, default=4)
    ap.add_argument("--fail-threshold", type=int, default=12)
    ap.add_argument("--vlm", action="store_true",
                    help="also run a vision check of screenshot vs caption")
    args = ap.parse_args()

    mpath = Path(args.manifest)
    base = mpath.parent
    golden = Path(args.golden)
    m = json.loads(mpath.read_text(encoding="utf-8"))

    if args.accept:
        golden.mkdir(parents=True, exist_ok=True)
        for shot in m["shots"]:
            shutil.copy(base / shot["image"], golden / shot["image"])
        print(f"Promoted {len(m['shots'])} shots to golden/. Future runs compare against these.")
        return

    if not golden.exists():
        sys.exit(f"No golden reference at {golden}/. Run once with --accept first.")

    diffs = base / "diffs"
    results = []
    summary = {"pass": 0, "drift": 0, "fail": 0}
    for shot in m["shots"]:
        cur = base / shot["image"]
        ref = golden / shot["image"]
        if not ref.exists():
            status, dist = "fail", None
        else:
            dist = int(phash(cur) - phash(ref))  # imagehash returns numpy int64 — cast for JSON
            if dist <= args.pass_threshold:
                status = "pass"
            elif dist <= args.fail_threshold:
                status = "drift"
            else:
                status = "fail"
        if status != "pass" and ref.exists():
            diffs.mkdir(exist_ok=True)
            side_by_side(ref, cur, diffs / f"{shot['step_id']}.diff.png")
        summary[status] += 1
        shot["grade"] = {"status": status, "hash_distance": dist}
        results.append((shot["step_id"], status, dist))
        mark = {"pass": "OK ", "drift": "~~ ", "fail": "XX "}[status]
        print(f"  {mark}{shot['step_id']}  dist={dist}")

    if args.vlm:
        print("\n[--vlm] Vision check requested. Wire this to the session model:")
        print("        for each shot, ask: does <image> show the state described by")
        print("        shot['caption']? Record yes/no into shot['grade']['caption_match'].")
        # TODO: call the available model with the image + caption and store the verdict.

    mpath.write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{summary['pass']} pass / {summary['drift']} drift / {summary['fail']} fail")
    if summary["fail"]:
        print("FAIL shots changed materially — re-author those steps or re-accept golden.")
        sys.exit(1)


if __name__ == "__main__":
    main()
