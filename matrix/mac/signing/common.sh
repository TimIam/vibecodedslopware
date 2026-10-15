# Shared settings for the signing scripts. Everything secret lives in $SIGNING_DIR on the Mac,
# never in the repo: the private key, a keychain just for signing, and that keychain's password.
SIGNING_DIR="${SIGNING_DIR:-$HOME/signing}"
KEYCHAIN="$SIGNING_DIR/signing.keychain-db"
KEYCHAIN_PW_FILE="$SIGNING_DIR/keychain-password"
NOTARY_PROFILE="${NOTARY_PROFILE:-matrix-rain-notary}"

unlock_keychain() {
  [ -f "$KEYCHAIN" ] || { echo "No signing keychain yet. Run 2-import-cert.sh first."; exit 1; }
  security unlock-keychain -p "$(cat "$KEYCHAIN_PW_FILE")" "$KEYCHAIN"
}
