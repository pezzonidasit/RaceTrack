#!/usr/bin/env bash
# Unit test runner — compile TypeScript tests via esbuild then run node --test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/test-unit"
ESBUILD="$ROOT/node_modules/.bin/esbuild"

# Clean previous compiled tests
rm -rf "$DIST"
mkdir -p "$DIST"

# Compile each unit test file to CJS
for f in "$ROOT"/tests/unit/*.test.ts; do
  name="$(basename "$f" .ts)"
  "$ESBUILD" "$f" \
    --bundle \
    --platform=node \
    --format=cjs \
    --target=node18 \
    --outfile="$DIST/$name.js" \
    --log-level=error
done

# Run all compiled tests with node --test
node --test "$DIST"/*.js
