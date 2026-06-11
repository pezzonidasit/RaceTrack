#!/usr/bin/env bash
# Unit test runner — compile TypeScript tests via esbuild then run node --test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"

# Create a per-invocation temp directory (avoid race on shared dist/test-unit/)
DIST="$(mktemp -d /tmp/racetrack-test-unit-XXXXXX)"
trap 'rm -rf "$DIST"' EXIT

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

# Check for compiled tests and fail clearly if none found
shopt -s nullglob
js_files=("$DIST"/*.js)
shopt -u nullglob
if [[ ${#js_files[@]} -eq 0 ]]; then
  echo "ERROR: aucun test compilé dans $DIST (esbuild a-t-il échoué silencieusement ?)" >&2
  exit 1
fi

# Run all compiled tests with node --test
node --test "${js_files[@]}"
