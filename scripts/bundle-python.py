#!/usr/bin/env python3
"""Build a self-contained portable Python into ./python-embed with opencv + numpy + pillow,
so the packaged desktop app runs REAL Python (real cv2.imread/imwrite/imshow) with NO system
Python installed. electron-builder ships ./python-embed as resources/python; main.cjs points
PYTHON_CMD at it. Run on a machine with internet: python scripts/bundle-python.py

Downloads the official Windows "embeddable" CPython zip (independent of the system Python),
enables site-packages, bootstraps pip, then pip-installs the runtime libraries into it.
"""
import io
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "python-embed"
PKGS = ["numpy", "opencv-python", "pillow", "jedi", "pyserial"]   # jedi = Tier-2 receiver-type oracle for /api/infer-types; pyserial = core hardware/robotics lib (serial.tools.list_ports)
# 3.12 has wheels for everything we need; the bundled runtime is independent of system Python.
PY_VERSIONS = ["3.12.8", "3.12.7", "3.12.10", "3.12.6"]


def log(*a):
    print("[bundle-python]", *a, flush=True)


def download(url):
    log("download", url)
    req = urllib.request.Request(url, headers={"User-Agent": "blockpy-bundler"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def fetch_embed_zip():
    last = None
    for v in PY_VERSIONS:
        url = f"https://www.python.org/ftp/python/{v}/python-{v}-embed-amd64.zip"
        try:
            return v, download(url)
        except Exception as e:
            last = e
            log(f"  {v} unavailable ({e}); trying next")
    raise SystemExit(f"Could not download any embeddable Python: {last}")


def main():
    if DEST.exists():
        log("removing existing", DEST)
        shutil.rmtree(DEST, ignore_errors=True)
    DEST.mkdir(parents=True)

    version, zbytes = fetch_embed_zip()
    log(f"extracting CPython {version} embeddable")
    zipfile.ZipFile(io.BytesIO(zbytes)).extractall(DEST)

    # Enable site-packages + the current dir so pip-installed packages import. The embeddable
    # distro ships a pythonXY._pth that disables site by default.
    pth = next(DEST.glob("python3*._pth"), None)
    if not pth:
        raise SystemExit("no pythonXY._pth in the embeddable zip")
    zipname = next((p.name for p in DEST.glob("python3*.zip")), "python312.zip")
    pth.write_text("\n".join([zipname, ".", "Lib\\site-packages", "import site", ""]), encoding="utf-8")
    (DEST / "Lib" / "site-packages").mkdir(parents=True, exist_ok=True)

    py = DEST / "python.exe"

    log("bootstrapping pip (get-pip.py)")
    getpip = DEST / "get-pip.py"
    getpip.write_bytes(download("https://bootstrap.pypa.io/get-pip.py"))
    subprocess.check_call([str(py), str(getpip), "--no-warn-script-location"])

    log("pip install:", " ".join(PKGS))
    subprocess.check_call([str(py), "-m", "pip", "install", "--no-warn-script-location", *PKGS])

    # Trim obvious bloat to keep the installer smaller (safe to delete).
    for pat in ["**/__pycache__", "**/*.dist-info/RECORD", "Lib/site-packages/**/tests"]:
        for p in DEST.glob(pat):
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
    try:
        getpip.unlink(missing_ok=True)
    except Exception:
        pass

    log("verifying cv2 / numpy / PIL import in the bundled runtime")
    out = subprocess.check_output(
        [str(py), "-c", "import cv2,numpy,PIL;print('cv2',cv2.__version__,'numpy',numpy.__version__,'PIL',PIL.__version__)"],
        text=True)
    log("OK ->", out.strip())

    size = sum(f.stat().st_size for f in DEST.rglob("*") if f.is_file())
    log(f"bundle ready: {DEST}  ({size/1048576:.0f} MB)")


if __name__ == "__main__":
    main()
