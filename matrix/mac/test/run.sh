#!/bin/bash
# Builds the test harness and runs it against build/MatrixRain.saver.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d build/MatrixRain.saver ] || ./build.sh
xcrun clang -fobjc-arc -O2 -framework AppKit -framework ScreenSaver test/render-test.m -o build/render-test
build/render-test build/MatrixRain.saver
