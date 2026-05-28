#!/usr/bin/env bash
# Start Vite dev server + Express API server together
# Usage: ./scripts/start.sh
# Press Ctrl+C to stop both.

set -e
cd "$(dirname "$0")/.."

echo "Starting BlockPy..."
echo "  Vite  → http://localhost:3000"
echo "  API   → http://localhost:3001"
echo ""

npm run start
