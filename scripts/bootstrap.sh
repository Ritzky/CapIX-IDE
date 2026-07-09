#!/usr/bin/env bash
#
# bootstrap.sh — clone the Void editor source (a VS Code fork) into ./vscode/
# and apply the CapixIDE rebrand on top.
#
# Void is an archived (read-only) snapshot, which makes it a stable fork base.
# See README.md → "Forking Void" for the rationale.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
VSCODE="${VSCODE_DIR:-$DIR/vscode}"
VOID_REF="${VOID_REF:-main}"

if [ -d "$VSCODE/.git" ]; then
  echo "✓ $VSCODE already cloned. Run ./scripts/rebrand.sh to refresh the rebrand."
  exit 0
fi

echo "▸ Cloning Void editor into $VSCODE (ref: $VOID_REF)…"
git clone --depth 1 --branch "$VOID_REF" https://github.com/voideditor/void.git "$VSCODE"

echo "▸ Applying CapixIDE rebrand…"
bash "$DIR/scripts/rebrand.sh"

echo "✓ Bootstrap complete. Next: ./scripts/dev.sh to launch, or ./scripts/build.sh to package."
