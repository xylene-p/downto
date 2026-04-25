#!/bin/bash
# Clean-slate iOS build + install on a connected iPhone.
#
# Useful when iterating on permission/registration flows where iOS caches the
# previous answer (push notifications, tracking, location, etc.). This script
# uninstalls the app first so the next launch behaves like a fresh install.
#
# Steps:
#   1. Find the first connected iPhone via `xcrun devicectl`.
#   2. Uninstall xyz.downto.app from that device.
#   3. Run npm run build:capacitor (next build → static export → cap sync).
#   4. xcodebuild → produce a Debug .app for arm64-apple-ios.
#   5. Install + launch the .app on the device.
#
# Requirements: Xcode 15+ (for devicectl), jq, automatic code signing
# already configured in Xcode at least once.

set -euo pipefail

BUNDLE_ID="xyz.downto.app"
SCHEME="App"
PROJECT="ios/App/App.xcodeproj"
DERIVED_DATA="/tmp/downto-ios-fresh"

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
fail() { printf "\033[1;31m✖ %s\033[0m\n" "$1" >&2; exit 1; }

command -v jq >/dev/null || fail "jq not installed (brew install jq)"
command -v xcodebuild >/dev/null || fail "xcodebuild not on PATH"

step "Finding connected iOS device"
DEVICES_JSON=$(mktemp)
trap 'rm -f "$DEVICES_JSON"' EXIT
xcrun devicectl list devices --json-output "$DEVICES_JSON" >/dev/null

DEVICE_ID=$(jq -r '
  .result.devices[]
  | select(.connectionProperties.tunnelState == "connected")
  | select(.hardwareProperties.platform == "iOS")
  | .identifier
' "$DEVICES_JSON" | head -1)

[ -n "$DEVICE_ID" ] || fail "No connected iOS device. Plug in an iPhone, unlock it, trust the Mac."

DEVICE_NAME=$(jq -r --arg id "$DEVICE_ID" '
  .result.devices[] | select(.identifier == $id) | .deviceProperties.name
' "$DEVICES_JSON")
echo "  $DEVICE_NAME ($DEVICE_ID)"

step "Uninstalling $BUNDLE_ID"
xcrun devicectl device uninstall app --device "$DEVICE_ID" "$BUNDLE_ID" 2>/dev/null \
  || echo "  (not installed; skipping)"

step "Building Capacitor web bundle"
npm run build:capacitor

step "Building iOS app (Debug, device arm64)"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -destination "id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  build \
  | xcbeautify 2>/dev/null || xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -destination "id=$DEVICE_ID" \
    -derivedDataPath "$DERIVED_DATA" \
    -allowProvisioningUpdates \
    build

APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphoneos/App.app"
[ -d "$APP_PATH" ] || fail "Build did not produce $APP_PATH"

step "Installing on $DEVICE_NAME"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"

step "Launching $BUNDLE_ID"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID"

printf "\n\033[1;32m✔ Fresh install running on %s\033[0m\n" "$DEVICE_NAME"
echo "Open Web Inspector (Safari → Develop → $DEVICE_NAME → App) to debug."
