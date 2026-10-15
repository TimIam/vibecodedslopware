#!/bin/bash
# Step 4, every release: sign, notarize, staple, check, and zip for download.
#   signing/4-sign-and-notarize.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source signing/common.sh

./build.sh >/dev/null
SAVER=build/MatrixRain.saver
unlock_keychain

echo "== 1. Sign with your Developer ID"
# --options runtime: the hardened runtime, which notarization requires.
# --timestamp: Apple's server vouches for when you signed, so the signature stays valid after
#              the certificate expires.
codesign --force --timestamp --options runtime --keychain "$KEYCHAIN" --sign "Developer ID Application" "$SAVER"
codesign --verify --strict --verbose=2 "$SAVER"
codesign -dvv "$SAVER" 2>&1 | grep -E '^(Identifier|Authority|TeamIdentifier|Timestamp|Runtime Version)='

echo
echo "== 2. Notarize: Apple scans it for malware and records the result (usually a few minutes)"
ditto -c -k --keepParent "$SAVER" build/upload.zip
xcrun notarytool submit build/upload.zip --keychain-profile "$NOTARY_PROFILE" --keychain "$KEYCHAIN" \
  --wait --output-format json > build/notary.json || true
STATUS=$(plutil -extract status raw build/notary.json 2>/dev/null || echo "no response")
ID=$(plutil -extract id raw build/notary.json 2>/dev/null || true)
echo "submission $ID: $STATUS"
if [ "$STATUS" != "Accepted" ]; then
  cat build/notary.json
  [ -n "$ID" ] && xcrun notarytool log "$ID" --keychain-profile "$NOTARY_PROFILE" --keychain "$KEYCHAIN"
  exit 1
fi

echo
echo "== 3. Staple: attach Apple's approval to the bundle, so it checks out even offline"
xcrun stapler staple "$SAVER"
xcrun stapler validate "$SAVER"

echo
echo "== 4. Check it the way Gatekeeper will on someone else's Mac"
spctl --assess --type open --context context:primary-signature -vv "$SAVER" || true
syspolicy_check distribution "$SAVER" || true

mkdir -p dist
rm -f dist/MatrixRain-mac.zip
ditto -c -k --keepParent "$SAVER" dist/MatrixRain-mac.zip
echo
echo "Ready to share: $(pwd)/dist/MatrixRain-mac.zip"
