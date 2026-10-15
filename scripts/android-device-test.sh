#!/usr/bin/env bash
set -euo pipefail

# emulator-runner can hang after successful tests if QEMU ignores adb's shutdown.
# This runner owns one AVD named test; never match unrelated host processes.
cleanup_emulator() {
  timeout --kill-after=5s 15s adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
  pkill -TERM -f '/qemu-system-x86_64[^ ]* .*[-]avd test([[:space:]]|$)' || true
  sleep 2
  pkill -KILL -f '/qemu-system-x86_64[^ ]* .*[-]avd test([[:space:]]|$)' || true
}
trap cleanup_emulator EXIT

adb logcat -c
cd "$(dirname "${BASH_SOURCE[0]}")/../android"
if timeout --kill-after=30s 8m ./gradlew --no-daemon --max-workers=2 -Dorg.gradle.jvmargs=-Xmx1024m :app:connectedDebugAndroidTest; then
  exit 0
fi

# Read diagnostics before emulator-runner shuts down the device.
# A failed diagnostic must not replace the test failure with success.
adb shell dumpsys location || true
adb logcat -d -v threadtime -s AndroidRuntime:E chromium:E Capacitor:W ActivityManager:W || true
exit 1
