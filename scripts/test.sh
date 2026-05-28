#!/usr/bin/env bash
# Run Playwright tests with WSL2 libasound2 shim
# Usage:
#   ./scripts/test.sh              → all tests
#   ./scripts/test.sh e2e          → e2e only
#   ./scripts/test.sh p0p1         → P0/P1 tests
#   ./scripts/test.sh p2p4         → P2/P4 tests
#   ./scripts/test.sh --headed     → show browser window
#   ./scripts/test.sh --ui         → interactive Playwright UI

set -e
cd "$(dirname "$0")/.."

# WSL2: inject libasound2 if the shim dir exists
if [ -d /tmp/browser-libs ]; then
  export LD_LIBRARY_PATH=/tmp/browser-libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}
fi

SUITE="${1:-}"
shift 2>/dev/null || true
EXTRA_ARGS="$*"

case "$SUITE" in
  e2e)    npx playwright test tests/e2e.spec.js $EXTRA_ARGS ;;
  p0p1)   npx playwright test tests/test_p0_p1.spec.js $EXTRA_ARGS ;;
  p2p4)   npx playwright test tests/test_p2_p4.spec.js $EXTRA_ARGS ;;
  --ui|--headed|--debug)
          npx playwright test $SUITE $EXTRA_ARGS ;;
  "")     npx playwright test $EXTRA_ARGS ;;
  *)
    # Treat unknown arg as a file/pattern passed directly
    npx playwright test "$SUITE" $EXTRA_ARGS ;;
esac
