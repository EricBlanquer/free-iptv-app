#!/bin/bash
# Build the release AAB and deploy it to a Google Play track via the Play API.
#
# Prereqs (one-time, already configured):
#   - service account key: ~/.config/play-publisher/key.json
#   - venv with google libs: ~/.config/play-publisher/venv
#   - service account granted "Deploy to test tracks" on Free IPTV
#
# Usage:
#   scripts/deploy-play.sh [track] ["release notes fr-FR"]
#   scripts/deploy-play.sh                       # track=alpha, no notes
#   scripts/deploy-play.sh alpha "Corrections diverses"
#
# Tracks: internal | alpha (closed test) | beta | production

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TRACK="${1:-alpha}"
NOTES="${2:-}"
PY="$HOME/.config/play-publisher/venv/bin/python"
DEPLOY="$PROJECT_DIR/scripts/play_deploy.py"
AAB="$PROJECT_DIR/android/app/build/outputs/bundle/release/app-release.aab"

echo "==> Building release AAB..."
cd "$PROJECT_DIR/android"
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew bundleRelease

if [ ! -f "$AAB" ]; then
    echo "ERROR: AAB not found at $AAB" >&2
    exit 1
fi

echo "==> Deploying to track '$TRACK'..."
"$PY" "$DEPLOY" --aab "$AAB" --track "$TRACK" --notes-fr "$NOTES"

echo "==> Done."
