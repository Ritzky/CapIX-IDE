#!/usr/bin/env bash
#
# rebrand.sh — search-replace Void → CapixIDE across the VS Code fork tree.
#
# Void marks every change it made inside the VS Code / VSCodium trees with
# the caps-sensitive word "Void" (images excepted). Per the Void team's
# own guidance, forking is a search-and-replace of:
#
#   "Void"        → "CapixIDE" / "Capix"   (display names)
#   "void"        → "capix"              (lowercase identifiers / folder names)
#   "voideditor"  → "Ritzky"             (github orgs / repo urls)
#   "Glass Devtools" → "Capix"           (copyright headers)
#
# Run this AFTER `./scripts/bootstrap.sh` has cloned Void into ./vscode/.
# Re-run safely — replacements are idempotent.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
VSCODE="${VSCODE_DIR:-$DIR/vscode}"

if [ ! -d "$VSCODE" ]; then
  echo "✗ No $VSCODE directory. Run ./scripts/bootstrap.sh first."
  exit 1
fi

echo "▸ Rebranding Void → CapixIDE in $VSCODE"

# 1. Copy our rebranded product.json over Void's.
cp "$DIR/product.json" "$VSCODE/product.json"
echo "  ✓ product.json"

# 2. Rename the contrib folder so imports read capix.
if [ -d "$VSCODE/src/vs/workbench/contrib/void" ]; then
  mv "$VSCODE/src/vs/workbench/contrib/void" "$VSCODE/src/vs/workbench/contrib/capix"
  echo "  ✓ contrib/void → contrib/capix"
fi

# 3. Caps-sensitive replacements across the whole tree (skip binary / .git).
#    We use ripgrep's file list to avoid images, lockfiles, and build output.
SEARCH_REPLACE=(
  "voideditor:Ritzky"
  "VoidEditor:CapixIDE"
  "Glass Devtools, Inc:Capix"
  "Glass Devtools:Capix"
  "void-editor:capix-ide"
  "void-server:capix-server"
  "void-tunnel:capix-tunnel"
  "com.voideditor:network.capix"
  "Void:CapixIDE"
  "void:capix"
)

for pair in "${SEARCH_REPLACE[@]}"; do
  old="${pair%%:*}"
  new="${pair#*:}"
  # -i '' = in-place for macOS sed; --color=never keeps output clean.
  files=$(rg -l --color=never -g '!*.png' -g '!*.ico' -g '!*.icns' -g '!*.svg' -g '!*.{jpg,jpeg,gif,bmp}' -g '!package-lock.json' -g '!yarn.lock' -g '!Cargo.lock' -g '!*.snap' -g '!.git/**' "$old" "$VSCODE" 2>/dev/null || true)
  if [ -n "$files" ]; then
    echo "$files" | xargs sed -i '' "s/$old/$new/g"
    echo "  ✓ $old → $new"
  fi
done

# 4. Re-link the contrib registration path.
#    void.contribution.ts registers under "void.*" — flip the folder rename
#    in any remaining import paths that still reference void.
rg -l --color=never "contrib/void" "$VSCODE/src" 2>/dev/null | while read -r f; do
  sed -i '' 's|contrib/void|contrib/capix|g' "$f"
done

echo "▸ Copying CapixIDE icons…"
# 5. Drop our branded icons on top of VS Code's (resources/, void_icons/).
if [ -d "$DIR/resources/icons" ]; then
  for icon in "$DIR/resources/icons"/*; do
    [ -e "$icon" ] || continue
    name="$(basename "$icon")"
    # Map the standard VS Code icon filenames.
    case "$name" in
      code.icns)    cp "$icon" "$VSCODE/resources/darwin/code.icns" ;;
      code.ico)     cp "$icon" "$VSCODE/resources/win32/code.ico" ;;
      code.png)     cp "$icon" "$VSCODE/resources/linux/code.png" ;;
      *)            cp "$icon" "$VSCODE/void_icons/${name}" 2>/dev/null || true ;;
    esac
  done
  echo "  ✓ icons applied"
fi

echo "✓ Rebrand complete. Run ./scripts/build.sh to package CapixIDE."

# 6. Apply CapixIDE-specific patches (add Capix as a first-class provider).
echo "▸ Applying CapixIDE patches…"
for patch in "$DIR"/patches/*.patch; do
  [ -e "$patch" ] || continue
  if (cd "$VSCODE" && git apply --check "$patch" 2>/dev/null); then
    (cd "$VSCODE" && git apply "$patch")
    echo "  ✓ $(basename "$patch")"
  else
    echo "  ! $(basename "$patch") did not apply cleanly — applying with --3way or resolve manually"
    (cd "$VSCODE" && git apply --3way "$patch" 2>/dev/null || echo "    Manual resolution needed: $patch")
  fi
done

# 7. Drop our default AI provider settings so first launch pre-fills "Capix".
mkdir -p "$VSCODE/src/vs/workbench/contrib/capix/browser/react/src/void-settings-tsx"
cp "$DIR/config/settings-defaults.json" "$VSCODE/src/vs/workbench/contrib/capix/browser/react/src/void-settings-tsx/capixDefaults.json" 2>/dev/null || true
echo "  ✓ capix settings defaults"

# 8. Copy the Capix LLM extension into the VS Code built-in extensions dir.
#    This ships deploy/destroy/logs/exec controls + the model catalog tree
#    in the Capix IDE sidebar — no separate install needed.
if [ -d "$DIR/extensions/capix-llm" ]; then
  mkdir -p "$VSCODE/extensions/capix-llm"
  cp -R "$DIR/extensions/capix-llm/"* "$VSCODE/extensions/capix-llm/"
  echo "  ✓ capix-llm extension copied to extensions/"
fi

# 9. Drop the Capix logo on top of the app icons.
echo "▸ Applying Capix logo/icons…"
if [ -d "$DIR/resources/icons" ]; then
  for icon in "$DIR/resources/icons"/*; do
    [ -e "$icon" ] || continue
    name="$(basename "$icon")"
    case "$name" in
      *.icns) cp "$icon" "$VSCODE/resources/darwin/code.icns" 2>/dev/null || true ;;
      *.ico)  cp "$icon" "$VSCODE/resources/win32/code.ico" 2>/dev/null || true ;;
      *.png)  cp "$icon" "$VSCODE/resources/linux/code.png" 2>/dev/null || true ;;
    esac
  done
  echo "  ✓ logo/icons applied"
fi

echo "✓ All patches + extensions + defaults applied."
