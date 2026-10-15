#!/bin/bash
# Step 3: save an App Store Connect API key so notarytool can upload to Apple without your
# password or two-factor codes. notarytool checks the key with Apple before saving it.
#   signing/3-save-notary-key.sh ~/Downloads/AuthKey_ABC123XYZ.p8 ABC123XYZ 69a6de7e-xxxx-xxxx-xxxx-xxxxxxxxxxxx
set -euo pipefail
source "$(dirname "$0")/common.sh"

P8="${1:?usage: 3-save-notary-key.sh AuthKey_XXXX.p8 <key id> <issuer id>}"
KEY_ID="${2:?missing key id}"
ISSUER="${3:?missing issuer id}"
unlock_keychain
xcrun notarytool store-credentials "$NOTARY_PROFILE" --key "$P8" --key-id "$KEY_ID" --issuer "$ISSUER" --keychain "$KEYCHAIN"
echo "Saved as profile \"$NOTARY_PROFILE\" in $KEYCHAIN. You can delete $P8 from Downloads once you've backed it up."
