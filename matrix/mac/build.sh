#!/bin/bash
# Builds build/MatrixRain.saver, a universal (Apple Silicon + Intel) macOS screensaver.
# No Xcode project: swiftc compiles each architecture, lipo merges them, and the bundle is
# just a folder layout. Ends with an ad-hoc signature, which is enough to run it on this Mac
# but not to hand it to anyone else. signing/4-sign-and-notarize.sh does the real thing.
set -euo pipefail
cd "$(dirname "$0")"

OUT=build/MatrixRain.saver
rm -rf build
mkdir -p "$OUT/Contents/MacOS"

for arch in arm64 x86_64; do
  # -Xlinker -bundle makes a loadable bundle (what screensavers are) instead of an app.
  xcrun swiftc -swift-version 5 -O -target "$arch-apple-macos13.0" -module-name MatrixRain \
    -emit-executable -Xlinker -bundle -framework ScreenSaver -framework AppKit \
    src/Rain.swift src/MatrixRainView.swift -o "build/MatrixRain-$arch"
done
lipo -create build/MatrixRain-arm64 build/MatrixRain-x86_64 -output "$OUT/Contents/MacOS/MatrixRain"
rm build/MatrixRain-arm64 build/MatrixRain-x86_64
cp Info.plist "$OUT/Contents/Info.plist"

codesign --force --sign - "$OUT"   # "-" means ad-hoc: signed, but by nobody in particular
file "$OUT/Contents/MacOS/MatrixRain"
echo "built $OUT"
