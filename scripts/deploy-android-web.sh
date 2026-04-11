#!/bin/bash
# Deploy web assets for Android auto-update
# Creates web-assets.zip and version.json, uploads to iptv.blanquer.org/android/

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/.buildResult"
OUT_DIR="/tmp/android-web-deploy"
FTP_PASSWORD=$(kwallet-query -r "ftp-ftp.webmo.fr:-1" kdewallet 2>/dev/null | grep password | cut -d'"' -f4)

if [ -z "$FTP_PASSWORD" ]; then
    echo "ERROR: Could not get FTP password from KDE Wallet"
    exit 1
fi

# Read version from config.xml
VERSION=$(grep -oP '<widget[^>]+version="\K[^"]+' "$PROJECT_DIR/config.xml")
if [ -z "$VERSION" ]; then
    echo "ERROR: Could not read version from config.xml"
    exit 1
fi

echo "Deploying Android web assets v$VERSION..."

# Build web app (same excludes as Tizen but also exclude Tizen-specific files)
rm -rf "$BUILD_DIR"
~/tizen-studio/tools/ide/bin/tizen build-web \
    -e "android/*" -e "node_modules/*" -e "server/*" -e "tests/*" \
    -e "scripts/*" -e "cloudflare-worker/*" -e "seller-office/*" \
    -e "www/*" -e "CLAUDE.md" -e "README.md" -e "PRIVACY_POLICY.md" \
    -e "package.json" -e "package-lock.json" -e ".git/*" \
    -e "tizen-manifest.xml" -e ".gitignore" \
    -- "$PROJECT_DIR"

# Create zip
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cd "$BUILD_DIR"
zip -r "$OUT_DIR/web-assets.zip" . -x "*.wgt" ".buildResult/*"
cd "$PROJECT_DIR"

# Sign the zip
PRIVATE_KEY="$PROJECT_DIR/android/signing-key-private.pem"
if [ ! -f "$PRIVATE_KEY" ]; then
    echo "ERROR: Signing key not found: $PRIVATE_KEY"
    exit 1
fi
SIGNATURE=$(openssl dgst -sha256 -sign "$PRIVATE_KEY" "$OUT_DIR/web-assets.zip" | base64 -w0)

# Create version.json with build hash and signature
BUILD_HASH=$(cd "$BUILD_DIR" && find . -type f -exec md5sum {} \; | sort | md5sum | cut -d' ' -f1)

# Check if APK exists and sign it too
APK_FILE="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
APK_VERSION=""
APK_SIGNATURE=""
if [ -f "$APK_FILE" ]; then
    APK_VERSION=$(~/Android/Sdk/build-tools/$(ls ~/Android/Sdk/build-tools/ | tail -1)/aapt dump badging "$APK_FILE" 2>/dev/null | grep -oP "versionCode='\K\d+" || echo "0")
    APK_SIGNATURE=$(openssl dgst -sha256 -sign "$PRIVATE_KEY" "$APK_FILE" | base64 -w0)
fi

cat > "$OUT_DIR/version.json" << EOF
{"version":"$VERSION","build":"$BUILD_HASH","signature":"$SIGNATURE","apkVersion":${APK_VERSION:-0},"apkSignature":"$APK_SIGNATURE"}
EOF

# Upload to FTP
echo "Uploading to FTP..."
curl -s -u "dpteam:$FTP_PASSWORD" --ftp-create-dirs \
    -T "$OUT_DIR/version.json" "ftp://ftp.webmo.fr/www/iptv/android/version.json"
curl -s -u "dpteam:$FTP_PASSWORD" \
    -T "$OUT_DIR/web-assets.zip" "ftp://ftp.webmo.fr/www/iptv/android/web-assets.zip"

# Upload APK if exists
if [ -f "$APK_FILE" ]; then
    cp "$APK_FILE" "$OUT_DIR/app.apk"
    curl -s -u "dpteam:$FTP_PASSWORD" \
        -T "$OUT_DIR/app.apk" "ftp://ftp.webmo.fr/www/iptv/app.apk"
    echo "APK uploaded (versionCode=$APK_VERSION)"
fi

# Cleanup
rm -rf "$BUILD_DIR" "$OUT_DIR"

echo "Done! Deployed v$VERSION to iptv.blanquer.org/android/"
echo "  version.json: https://iptv.blanquer.org/android/version.json"
echo "  web-assets.zip: https://iptv.blanquer.org/android/web-assets.zip"
