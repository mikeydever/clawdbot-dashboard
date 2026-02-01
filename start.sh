#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install from https://nodejs.org/ then rerun."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install
fi
node server.js
