#!/usr/bin/env bash
# Helper for running Vamoverse on a real iPhone via Capacitor.
# Auto-detects the connected device UDID and the Mac's LAN IP so you never
# have to remember them. Invoked by the `ios:*` npm scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUNDLE_ID="com.vamoverse.app"
PORT="3000"

# First connected iOS device UDID (last column of `cap run ios --list`).
detect_device() {
  npx cap run ios --list 2>/dev/null \
    | awk 'NF && $1 != "Name" && $0 !~ /----/ {print $NF; exit}'
}

# Mac LAN IP (prefers Wi-Fi en0, falls back to first non-loopback).
detect_ip() {
  ipconfig getifaddr en0 2>/dev/null \
    || ifconfig 2>/dev/null | awk '/inet /&&$2!="127.0.0.1"{print $2; exit}'
}

require_device() {
  local udid; udid="$(detect_device)"
  if [ -z "${udid:-}" ]; then
    echo "❌ No iOS device found. Connect + unlock your iPhone (Developer Mode on)." >&2
    exit 1
  fi
  echo "$udid"
}

dev_running() { curl -sS -o /dev/null "http://localhost:${PORT}" 2>/dev/null; }

DERIVED="$ROOT/ios/App/build"

# Build with xcodebuild, then install + launch via Apple's devicectl.
# We bypass `cap run` because its native-run deploy step breaks on recent Xcode
# ("Unable to retrieve simulator list: Reduce of empty array").
deploy() {
  local udid="$1"
  echo "🔄 Syncing web assets & pods..."
  npx cap copy ios >/dev/null
  echo "🔨 Building for device (xcodebuild)..."
  xcodebuild \
    -workspace ios/App/App.xcworkspace \
    -scheme App \
    -configuration Debug \
    -destination "id=$udid" \
    -derivedDataPath "$DERIVED" \
    -allowProvisioningUpdates \
    ENABLE_DEBUG_DYLIB=NO \
    build | (xcbeautify 2>/dev/null || cat)
  local app; app="$(find "$DERIVED/Build/Products" -name 'App.app' -path '*iphoneos*' -maxdepth 3 | head -1)"
  [ -z "${app:-}" ] && { echo "❌ Build product App.app not found." >&2; exit 1; }
  # devicectl rejects the bundle ("not a valid bundle / CFBundleIdentifier") when
  # macOS stamps a sticky `com.apple.provenance` xattr on build output. Copying to
  # a fresh dir drops it; xattr -cr clears anything else.
  local staged="/tmp/vamoverse-App.app"
  rm -rf "$staged" && cp -R "$app" "$staged" && xattr -cr "$staged"
  echo "📲 Installing $staged ..."
  xcrun devicectl device install app --device "$udid" "$staged"
  echo "🚀 Launching $BUNDLE_ID ..."
  xcrun devicectl device process launch --device "$udid" "$BUNDLE_ID"
  echo "✅ Running on device. JS logs: 'npm run ios:logs' or Safari Web Inspector."
}

cmd="${1:-run}"
case "$cmd" in
  run)
    udid="$(require_device)"
    if ! dev_running; then
      echo "⚠️  Dev server not responding on :${PORT}. Start it with 'npm run dev' (livereload needs it)." >&2
    fi
    deploy "$udid"
    ;;

  go)
    # Start dev server (if not already up) THEN build+run on device.
    udid="$(require_device)"
    if ! dev_running; then
      echo "🚀 Starting dev server..."
      npm run dev >/tmp/vamo_dev.log 2>&1 &
      for _ in $(seq 1 30); do dev_running && break; sleep 1; done
      echo "   dev server logs → tail -f /tmp/vamo_dev.log"
    fi
    deploy "$udid"
    ;;

  logs)
    # Backend/server log — shows each request from the phone (📱 iOS lines),
    # the best "is the phone reaching me" signal. For JS/WebView console + network,
    # use Safari → Develop → <iPhone> → App (Web Inspector).
    echo "📜 Tailing dev server log (Ctrl+C to stop). 📱 iOS = requests from the phone."
    echo "   (For WebView JS logs: Safari → Develop → your iPhone → App)"
    touch /tmp/vamo_dev.log
    tail -f /tmp/vamo_dev.log
    ;;

  ip)
    ip="$(detect_ip)"
    [ -z "${ip:-}" ] && { echo "❌ Could not detect Mac IP." >&2; exit 1; }
    echo "🌐 Mac IP: $ip — updating capacitor.config.ts ..."
    # Rewrite the server.url line to the current IP.
    sed -i '' -E "s#url: 'http://[0-9.]+:${PORT}'#url: 'http://${ip}:${PORT}'#" capacitor.config.ts
    npx cap copy ios >/dev/null
    echo "✅ server.url → http://${ip}:${PORT} (synced to iOS project)."
    ;;

  device)
    echo "Connected iOS devices:"
    npx cap run ios --list 2>/dev/null | grep -v -iE "kext|kernel"
    ;;

  *)
    echo "Usage: bash scripts/ios.sh {run|go|logs|ip|device}" >&2
    exit 1
    ;;
esac
