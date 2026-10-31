# Signing the Mac screensaver

A walkthrough of how a Mac app gets from "built on my machine" to "opens cleanly on anyone's Mac", using the Matrix Rain screensaver as the example. Everything runs on the Mac mini (`ssh tim@192.168.0.39`, files in `~/matrix-mac`, secrets in `~/signing`).

## The four pieces

| Piece | What it proves | Tool |
|---|---|---|
| **Developer ID certificate** | Who made it. Apple vouches that your key belongs to your developer team. | developer.apple.com, once |
| **Code signature** | Nothing changed since you made it. Every file in the bundle is hashed and sealed with your key. | `codesign` |
| **Notarization** | Apple scanned it and found no malware. You upload it; Apple records an approval for that exact signature. | `notarytool` |
| **Stapling** | The approval travels with the file, so a Mac can check it offline. | `stapler` |

**Gatekeeper** is the part of macOS that checks all this. It only looks at files that came from the internet: browsers and AirDrop tag downloads with a "quarantine" flag. A quarantined file without a Developer ID signature and a notarization ticket gets "Apple could not verify it is free of malware" and won't open with a double-click.

The Windows equivalent is Authenticode signing plus SmartScreen reputation. Apple's version adds the malware scan, and in exchange a notarized app opens cleanly from the first download.

## Where things stand

- `build.sh` builds a universal (Apple Silicon + Intel) `MatrixRain.saver` with plain `swiftc`, no Xcode project. It ends with an **ad-hoc** signature (`codesign --sign -`): signed, but by nobody. Fine on the Mac that built it, rejected anywhere else.
- `test/run.sh` loads the bundle the way macOS does and saves screenshots. A full Retina frame takes about 6 ms.
- Apple's own checker on the ad-hoc build says exactly what's missing:

  ```
  $ syspolicy_check distribution build/MatrixRain.saver
  Adhoc Signed App        Severity: Warning   Sign the app with a valid Developer ID certificate
  Notary Ticket Missing   Severity: Fatal     upload to the Apple notary service using notarytool
  ```
- `signing/1-make-csr.sh` has already run. It made a private key (`~/signing/developer-id.key`, readable only by you) and a certificate signing request. The request is also at `matrix/mac/for-apple/developer-id.csr` on the PC, ignored by git.

## What only you can do (about 10 minutes, once)

Both need your Apple developer login, which is the account holder's (forageIQ@icloud.com, team CCGB3K69WK).

### A. Get the Developer ID certificate

1. Go to developer.apple.com → Account → **Certificates, IDs & Profiles** → Certificates → **+**.
2. Under Software, choose **Developer ID Application**. Not "Installer", which is for `.pkg` files, and not "Apple Distribution", which is for the App Store.
3. Profile type: **G2 Sub-CA**.
4. Upload `developer-id.csr`, click Continue, then **Download**. You get `developerID_application.cer`.

This is the same certificate for every Mac app you'll ever distribute outside the App Store. It lasts five years, and a team can only have a handful, so don't make a new one per project.

### B. Get an API key for notarization

1. Go to appstoreconnect.apple.com → **Users and Access** → **Integrations** → App Store Connect API → **Team Keys** → **+**.
2. Name it `notarytool`. Access: **Developer**.
3. Note the **Key ID** in the row, and the **Issuer ID** shown above the table.
4. **Download API Key**. You get `AuthKey_<KeyID>.p8`. Apple only lets you download it once.

An API key beats your Apple ID password here: no two-factor prompts, it works in scripts, and you can revoke it without touching your account.

### C. Hand them to the Mac mini

From the PC, in the folder where both downloaded:

```bash
scp developerID_application.cer AuthKey_XXXXXXXXXX.p8 tim@192.168.0.39:~/signing/
```

Then on the Mac:

```bash
cd ~/matrix-mac
signing/2-import-cert.sh ~/signing/developerID_application.cer
signing/3-save-notary-key.sh ~/signing/AuthKey_XXXXXXXXXX.p8 XXXXXXXXXX <issuer-id>
```

Step 2 should end with `1 valid identities found` and a line like `Developer ID Application: <your name or company> (CCGB3K69WK)`. That name is what people will see.

## Every release

```bash
cd ~/matrix-mac && signing/4-sign-and-notarize.sh
```

It rebuilds, then:

1. **Signs**: `codesign --timestamp --options runtime`. The timestamp keeps the signature valid after the certificate expires. The hardened runtime is required for notarization.
2. **Notarizes**: zips with `ditto` and uploads with `notarytool submit --wait`. Usually takes a few minutes. If Apple says Invalid, the script prints the log, which lists every problem by file.
3. **Staples**: `stapler staple` attaches the ticket to the bundle.
4. **Checks** like a stranger's Mac would (`spctl`, `syspolicy_check`), then writes `dist/MatrixRain-mac.zip`.

**Installing it:** unzip, double-click `MatrixRain.saver`, and System Settings offers to install it. macOS runs one copy on every display by itself.

## Gotchas

- **Any change after signing breaks the signature,** even editing `Info.plist`. Always sign last, notarize what you signed, and staple what you notarized.
- **Zip with `ditto`, not Finder's Compress or `zip`.** Those can drop the extended attributes that carry the signature.
- **"0 valid identities found" after step 2** usually means the certificate came from a different CSR than the key in `~/signing`. Make a new certificate from this CSR.
- **Back up `~/signing`.** The key and certificate together are your publisher identity. A password manager is a good place for an exported `.p12`. If the key ever leaks, revoke the certificate at developer.apple.com.
- **The signing keychain isn't your login keychain.** It's `~/signing/signing.keychain-db`, unlocked by a random password in `~/signing/keychain-password`. That's what lets the scripts run over SSH without a password dialog.
