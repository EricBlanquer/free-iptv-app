#!/usr/bin/env bash
#
# Build the webOS (LG TV) package (.ipk) from the shared web app.
#
# Requires the webOS TV CLI (ares-cli):
#   npm install -g @webosose/ares-cli
#
# The app is the same HTML/JS/CSS as the Tizen build. On webOS the player
# falls back to the HTML5 <video> path automatically (no Tizen `webapis`),
# the Back button (keyCode 461) is mapped to the TV Back action, and exit
# uses window.close(). The webOS manifest and icons live in this webos/
# directory (kept out of the Tizen/Android packages) and are injected into
# the package root at build time.
#
# Install/run on an LG TV in developer mode:
#   ares-setup-device                       # register the TV once
#   ares-install --device <name> <ipk>
#   ares-launch --device <name> fr.blanquer.freeiptv
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
STAGE="$(mktemp -d /tmp/webos-stage.XXXXXX)"
OUT="${1:-$ROOT}"

trap 'rm -rf "$STAGE"' EXIT

# Stage only the shared web app (exclude Tizen/Android/tooling and webos/ itself).
rsync -a \
  --exclude='.git' --exclude='node_modules' --exclude='android' \
  --exclude='server' --exclude='tests' --exclude='scripts' \
  --exclude='cloudflare-worker' --exclude='seller-office' --exclude='www' \
  --exclude='store-assets' --exclude='.buildResult' --exclude='*.wgt' \
  --exclude='config.xml' --exclude='tizen-manifest.xml' \
  --exclude='.tizen-package-exclude' --exclude='package*.json' \
  --exclude='*.md' --exclude='.vscode' --exclude='.gitignore' \
  --exclude='webos' --exclude='docs' \
  "$ROOT/" "$STAGE/"

# Inject the webOS manifest + icons at the package root.
cp "$HERE/appinfo.json" "$STAGE/appinfo.json"
cp "$HERE/icon-80.png"  "$STAGE/icon-80.png"
cp "$HERE/icon-130.png" "$STAGE/icon-130.png"

[ -f "$STAGE/appinfo.json" ] || { echo "ERROR: appinfo.json missing" >&2; exit 1; }
[ -f "$STAGE/index.html" ]   || { echo "ERROR: index.html missing" >&2; exit 1; }
[ -f "$STAGE/icon-80.png" ]  || { echo "ERROR: icon-80.png missing" >&2; exit 1; }

ares-package "$STAGE" -o "$OUT"
echo "webOS package written to: $OUT/fr.blanquer.freeiptv_*.ipk"
