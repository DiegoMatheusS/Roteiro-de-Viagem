#!/usr/bin/env bash
set -euo pipefail

adb logcat -c
cd "$(dirname "${BASH_SOURCE[0]}")/../android"
if ./gradlew :app:connectedDebugAndroidTest; then
  exit 0
fi

# Read diagnostics before emulator-runner shuts down the device.
# A failed diagnostic must not replace the test failure with success.
adb shell dumpsys location || true
adb logcat -d -v threadtime -s AndroidRuntime:E || true
exit 1
