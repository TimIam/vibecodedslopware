#!/bin/bash
# Step 1: make a private key and a certificate signing request (CSR).
# The private key never leaves this Mac. Only the .csr goes to Apple, which signs it and sends
# back a certificate saying "this key belongs to your developer team".
#   APPLE_ID=you@example.com signing/1-make-csr.sh
set -euo pipefail
source "$(dirname "$0")/common.sh"

mkdir -p "$SIGNING_DIR" && chmod 700 "$SIGNING_DIR"
KEY="$SIGNING_DIR/developer-id.key"
CSR="$SIGNING_DIR/developer-id.csr"
[ -e "$KEY" ] && { echo "$KEY already exists; not overwriting it."; exit 1; }

# Apple only reads the public key and the email from a CSR. It writes its own name on the
# certificate: "Developer ID Application: <your team> (<team ID>)".
openssl req -new -newkey rsa:2048 -nodes -keyout "$KEY" -out "$CSR" \
  -subj "/emailAddress=${APPLE_ID:?set APPLE_ID to your Apple developer account email}/CN=Developer ID Application/C=US" 2>/dev/null
chmod 600 "$KEY"

openssl req -in "$CSR" -noout -subject
echo "Private key: $KEY (keep it; back it up somewhere safe)"
echo "Upload this: $CSR"
