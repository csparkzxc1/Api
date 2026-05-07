#!/usr/bin/env bash
# Render the master icon SVG into every platform's required size set.
# Idempotent: writes into the canonical resource directories so committing
# the result is enough; CI re-runs this on every checkout via tools/sync-icons.sh.
set -euo pipefail

cd "$(dirname "$0")"
repo=$(cd ../.. && pwd)
src="$repo/assets/icon/icon.svg"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert is required (apt install librsvg2-bin / brew install librsvg)" >&2
  exit 1
fi

render() {
  local size=$1 out=$2 svg=${3:-$src}
  mkdir -p "$(dirname "$out")"
  rsvg-convert -w "$size" -h "$size" "$svg" -o "$out"
}

bg_src="$repo/assets/icon/icon-background.svg"
fg_src="$repo/assets/icon/icon-foreground.svg"
tray_src="$repo/assets/icon/tray-icon.svg"

# ---------- iOS phone ------------------------------------------------------
ios_set="$repo/ios/Cap/Resources/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$ios_set"
render 1024 "$ios_set/AppIcon-1024.png"
render  120 "$ios_set/AppIcon-60@2x.png"
render  180 "$ios_set/AppIcon-60@3x.png"
render   80 "$ios_set/AppIcon-40@2x.png"
render  120 "$ios_set/AppIcon-40@3x.png"
render   58 "$ios_set/AppIcon-29@2x.png"
render   87 "$ios_set/AppIcon-29@3x.png"
render   40 "$ios_set/AppIcon-20@2x.png"
render   60 "$ios_set/AppIcon-20@3x.png"

# ---------- watchOS --------------------------------------------------------
watch_set="$repo/ios/CapWatch/Resources/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$watch_set"
render 1024 "$watch_set/AppIcon-1024.png"
render   48 "$watch_set/AppIcon-24@2x.png"
render   55 "$watch_set/AppIcon-27.5@2x.png"
render   58 "$watch_set/AppIcon-29@2x.png"
render   87 "$watch_set/AppIcon-29@3x.png"
render   66 "$watch_set/AppIcon-33@2x.png"
render   80 "$watch_set/AppIcon-40@2x.png"
render   88 "$watch_set/AppIcon-44@2x.png"
render  100 "$watch_set/AppIcon-50@2x.png"
render  172 "$watch_set/AppIcon-86@2x.png"
render  196 "$watch_set/AppIcon-98@2x.png"
render  216 "$watch_set/AppIcon-108@2x.png"
render  234 "$watch_set/AppIcon-117@2x.png"
render  258 "$watch_set/AppIcon-129@2x.png"

# ---------- Android phone (legacy mipmap-* + adaptive foreground) ---------
android="$repo/android/app/src/main/res"
render  48 "$android/mipmap-mdpi/ic_launcher.png"
render  72 "$android/mipmap-hdpi/ic_launcher.png"
render  96 "$android/mipmap-xhdpi/ic_launcher.png"
render 144 "$android/mipmap-xxhdpi/ic_launcher.png"
render 192 "$android/mipmap-xxxhdpi/ic_launcher.png"
render  48 "$android/mipmap-mdpi/ic_launcher_round.png"
render  72 "$android/mipmap-hdpi/ic_launcher_round.png"
render  96 "$android/mipmap-xhdpi/ic_launcher_round.png"
render 144 "$android/mipmap-xxhdpi/ic_launcher_round.png"
render 192 "$android/mipmap-xxxhdpi/ic_launcher_round.png"
# Adaptive icon: foreground is the slider only (sized for the 66% safe
# zone), background is the dark vignette plate. Shipped at xxxhdpi
# (432px = 108dp × 4); Android downscales for lower densities.
render 432 "$android/mipmap-xxxhdpi/ic_launcher_foreground.png" "$fg_src"
render 432 "$android/drawable-xxxhdpi/ic_launcher_background.png" "$bg_src"

# ---------- Wear OS -------------------------------------------------------
wear="$repo/android/wear/src/main/res"
render  48 "$wear/mipmap-mdpi/ic_launcher.png"
render  72 "$wear/mipmap-hdpi/ic_launcher.png"
render  96 "$wear/mipmap-xhdpi/ic_launcher.png"
render 144 "$wear/mipmap-xxhdpi/ic_launcher.png"
render 192 "$wear/mipmap-xxxhdpi/ic_launcher.png"
render  48 "$wear/mipmap-mdpi/ic_launcher_round.png"
render  72 "$wear/mipmap-hdpi/ic_launcher_round.png"
render  96 "$wear/mipmap-xhdpi/ic_launcher_round.png"
render 144 "$wear/mipmap-xxhdpi/ic_launcher_round.png"
render 192 "$wear/mipmap-xxxhdpi/ic_launcher_round.png"
render 384 "$wear/mipmap-xxxhdpi/ic_launcher_foreground.png" "$fg_src"
render 384 "$wear/drawable-xxxhdpi/ic_launcher_background.png" "$bg_src"

# ---------- Tauri agent ---------------------------------------------------
tauri="$repo/desktop-agent/src-tauri/icons"
render   32 "$tauri/32x32.png"
render  128 "$tauri/128x128.png"
render  256 "$tauri/128x128@2x.png"
render  512 "$tauri/icon.png"
render  256 "$tauri/StoreLogo.png"
render   30 "$tauri/Square30x30Logo.png"
render   44 "$tauri/Square44x44Logo.png"
render   71 "$tauri/Square71x71Logo.png"
render  150 "$tauri/Square150x150Logo.png"
render  310 "$tauri/Square310x310Logo.png"

# Monochrome tray icon. macOS uses `iconAsTemplate: true` to invert it
# for dark menu bars; Windows / Linux render the black silhouette as-is
# (still legible on light or dark taskbars).
render   22 "$tauri/tray-icon.png"     "$tray_src"
render   44 "$tauri/tray-icon@2x.png"  "$tray_src"

# Composite Windows .ico (multi-resolution) and macOS .icns from rendered PNGs.
# The .ico ships 16/32/48/256 sizes; .icns ships up through 1024 retina.
ico_tmp=$(mktemp -d)
for sz in 16 24 32 48 64 128 256; do
  render "$sz" "$ico_tmp/$sz.png"
done
if command -v magick >/dev/null 2>&1; then
  magick "$ico_tmp"/*.png "$tauri/icon.ico"
elif command -v convert >/dev/null 2>&1; then
  convert "$ico_tmp"/*.png "$tauri/icon.ico"
else
  echo "  ! magick / convert missing; skipping icon.ico"
fi
rm -rf "$ico_tmp"

icns_tmp=$(mktemp -d)
for sz in 16 32 48 128 256 512 1024; do
  render "$sz" "$icns_tmp/$sz.png"
done
if command -v png2icns >/dev/null 2>&1; then
  png2icns "$tauri/icon.icns" \
    "$icns_tmp/16.png" "$icns_tmp/32.png" "$icns_tmp/48.png" \
    "$icns_tmp/128.png" "$icns_tmp/256.png" "$icns_tmp/512.png" \
    "$icns_tmp/1024.png" >/dev/null
elif command -v iconutil >/dev/null 2>&1; then
  set="$icns_tmp/AppIcon.iconset"
  mkdir -p "$set"
  cp "$icns_tmp/16.png"   "$set/icon_16x16.png"
  cp "$icns_tmp/32.png"   "$set/icon_16x16@2x.png"
  cp "$icns_tmp/32.png"   "$set/icon_32x32.png"
  cp "$icns_tmp/64.png"   "$set/icon_32x32@2x.png" 2>/dev/null || render 64 "$set/icon_32x32@2x.png"
  cp "$icns_tmp/128.png"  "$set/icon_128x128.png"
  cp "$icns_tmp/256.png"  "$set/icon_128x128@2x.png"
  cp "$icns_tmp/256.png"  "$set/icon_256x256.png"
  cp "$icns_tmp/512.png"  "$set/icon_256x256@2x.png"
  cp "$icns_tmp/512.png"  "$set/icon_512x512.png"
  cp "$icns_tmp/1024.png" "$set/icon_512x512@2x.png"
  iconutil -c icns "$set" -o "$tauri/icon.icns"
else
  echo "  ! png2icns / iconutil missing; skipping icon.icns"
fi
rm -rf "$icns_tmp"

# Frontend uses the same icon for the onboarding window header.
mkdir -p "$repo/desktop-agent/frontend/icons"
render  64 "$repo/desktop-agent/frontend/icons/icon-64.png"
render 128 "$repo/desktop-agent/frontend/icons/icon-128.png"

echo "ok"
