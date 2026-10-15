#!/bin/bash
# Step 2: put Apple's certificate together with your private key in a keychain codesign can use.
# It's a separate keychain, not your login one, so scripts can unlock it with a password from a
# file. That makes signing work over SSH and on build machines.
#   signing/2-import-cert.sh ~/Downloads/developerID_application.cer
set -euo pipefail
source "$(dirname "$0")/common.sh"

CER="${1:?usage: 2-import-cert.sh path/to/developerID_application.cer}"
KEY="$SIGNING_DIR/developer-id.key"
[ -f "$KEY" ] || { echo "No private key at $KEY. Run 1-make-csr.sh first."; exit 1; }

if [ ! -f "$KEYCHAIN" ]; then
  (umask 077; openssl rand -base64 24 > "$KEYCHAIN_PW_FILE")
  security create-keychain -p "$(cat "$KEYCHAIN_PW_FILE")" "$KEYCHAIN"
  security set-keychain-settings -lut 21600 "$KEYCHAIN"   # locks itself after 6 idle hours
fi
unlock_keychain

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# Apple sends DER. Convert to PEM, then bundle certificate + key as a .p12, which the keychain
# imports as one "identity" (a certificate whose private key you hold).
openssl x509 -inform DER -in "$CER" -out "$TMP/cert.pem" 2>/dev/null || openssl x509 -in "$CER" -out "$TMP/cert.pem"
openssl x509 -in "$TMP/cert.pem" -noout -subject -enddate
P12PW=$(openssl rand -hex 16)
LEGACY=$(openssl version | grep -q '^OpenSSL 3' && echo -legacy || true)
openssl pkcs12 -export $LEGACY -inkey "$KEY" -in "$TMP/cert.pem" -name "Developer ID Application" \
  -out "$TMP/identity.p12" -passout "pass:$P12PW"
security import "$TMP/identity.p12" -k "$KEYCHAIN" -P "$P12PW" -T /usr/bin/codesign >/dev/null
# Let command-line tools use the key without a "codesign wants to access..." dialog.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$(cat "$KEYCHAIN_PW_FILE")" "$KEYCHAIN" >/dev/null

# The intermediate certificate that links yours to Apple's root, straight from Apple.
curl -fsSL https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer -o "$TMP/g2.cer"
security import "$TMP/g2.cer" -k "$KEYCHAIN" >/dev/null 2>&1 || true

echo
security find-identity -v -p codesigning "$KEYCHAIN"
