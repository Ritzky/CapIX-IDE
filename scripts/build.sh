#!/usr/bin/env bash
#
# build.sh — produce packaged CapixIDE binaries for the current platform.
#
# Mirrors the Void/VSCodium build pipeline:
#   1. compile TypeScript + React
#   2. gulp minify per platform
#   3. assemble the Electron app (gulp vscode-<platform>-<arch>-min-ci)
#
# For CI / cross-platform release builds, use .github/workflows/release.yml
# which runs this per-platform on macos/linux/windows runners.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
VSCODE="${VSCODE_DIR:-$DIR/vscode}"

if [ ! -d "$VSCODE" ]; then
  echo "✗ No $VSCODE. Run ./scripts/bootstrap.sh first."
  exit 1
fi

cd "$VSCODE"
export NODE_OPTIONS="--max-old-space-size=8192"

ARCH="${VSCODE_ARCH:-$(uname -m)}"
case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
esac

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="darwin" ;;
  Linux)  PLATFORM="linux" ;;
  *)      PLATFORM="win32" ;;
esac

echo "▸ Building CapixIDE for $PLATFORM-$ARCH…"

# Compile the Capix LLM extension (TypeScript → JavaScript)
echo "  → compiling capix-llm extension…"
(cd "$VSCODE/extensions/capix-llm" && npm install --silent 2>/dev/null && npx tsc -p ./ 2>/dev/null || echo "  ! extension compile skipped (may need npm install)")

echo "  → compiling React (chat panel UI)…"
npm run buildreact

echo "  → compiling VS Code core…"
npm run gulp compile-build-without-mangling
npm run gulp compile-extension-media
npm run gulp compile-extensions-build

echo "  → minifying…"
npm run gulp "minify-vscode"

echo "  → packaging ($PLATFORM-$ARCH)…"
npm run gulp "vscode-${PLATFORM}-${ARCH}-min-ci"

echo "✓ Build complete. Output: ../VSCode-${PLATFORM}-${ARCH}/"
echo "  For distributable installers (.dmg/.exe/.deb), use electron-builder:"
echo "    npx electron-builder --$PLATFORM --$ARCH --config ../../electron-builder.yml"
