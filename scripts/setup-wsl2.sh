#!/usr/bin/env bash
# WSL2 one-time Playwright browser dependency setup
# Run once: bash scripts/setup-wsl2.sh

set -e
DEST=/tmp/browser-libs
TMP_DEB=/tmp/deb_downloads
mkdir -p "$DEST" "$TMP_DEB"

echo "==> Installing Playwright browsers..."
npx playwright install chromium

echo ""
echo "==> Downloading missing WSL2 system libraries (no sudo needed)..."
cd "$TMP_DEB"
apt-get download libnspr4 libnss3 libasound2t64 2>&1

echo ""
echo "==> Extracting to $DEST..."
for DEB in libasound2t64_*.deb libnspr4_2*.deb libnss3_2*.deb; do
  [ -f "$DEB" ] && dpkg-deb -x "$DEB" "$DEST" && echo "  OK: $DEB"
done

# libasound symlink
ln -sf libasound.so.2.0.0 "$DEST/usr/lib/x86_64-linux-gnu/libasound.so.2" 2>/dev/null || true

echo ""
echo "==> Verifying Chromium deps..."
MISSING=$(LD_LIBRARY_PATH="$DEST/usr/lib/x86_64-linux-gnu" \
  ldd /home/shain/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>&1 \
  | grep "not found" || echo "")
if [ -z "$MISSING" ]; then
  echo "  All dependencies resolved!"
else
  echo "  Still missing: $MISSING"
  exit 1
fi

echo ""
echo "Done!  Run tests with:"
echo "  ./scripts/test.sh"
echo "  ./scripts/test.sh p0p1"
echo "  ./scripts/test.sh e2e"
