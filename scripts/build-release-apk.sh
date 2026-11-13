#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-$ROOT/.tools/jdk-17.0.21+9/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-/tmp/pulse-android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/tmp/pulse-gradle-home}"
export PATH="$JAVA_HOME/bin:$PATH"
mkdir -p "$GRADLE_USER_HOME"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "Missing JDK at $JAVA_HOME"
  exit 1
fi
if [ ! -d "$ANDROID_HOME/platforms/android-36" ]; then
  echo "Missing Android SDK at $ANDROID_HOME"
  exit 1
fi
GRADLE_BIN="${GRADLE_BIN:-/tmp/gradle-8.14.3/bin/gradle}"
if [ ! -x "$GRADLE_BIN" ]; then
  GRADLE_BIN="$ROOT/android/gradlew"
fi

echo "sdk.dir=$ANDROID_HOME" > "$ROOT/android/local.properties"
cd "$ROOT/android"
echo "Building release APK (arm64-v8a)..."
"$GRADLE_BIN" assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
APK=$(ls -t app/build/outputs/apk/release/*.apk | head -1)
cp "$APK" "$ROOT/pulse-release.apk"
echo ""
echo "APK ready:"
echo "  $APK"
echo "  $ROOT/pulse-release.apk"
ls -lh "$APK" "$ROOT/pulse-release.apk"
open -R "$ROOT/pulse-release.apk" 2>/dev/null || true
