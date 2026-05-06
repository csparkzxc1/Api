#!/usr/bin/env bash
# Copy assets/fonts/*.ttf into Android res/font/ with snake_case names so
# they're addressable as R.font.<name> and into the Tauri agent frontend.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
src=$repo/assets/fonts

if [ ! -f "$src/Geist-Regular.ttf" ]; then
  echo "→ fonts not downloaded yet; running download.sh"
  bash "$src/download.sh"
fi

map() {
  local in=$1 dst_phone=$2 dst_wear=$3
  local snake
  snake=$(echo "$in" | sed -E 's/([A-Z])([A-Z]*)/\1\L\2/g; s/[- ]/_/g; s/\.[Tt][Tt][Ff]$/.ttf/' | tr '[:upper:]' '[:lower:]')
  cp "$src/$in" "$dst_phone/$snake"
  cp "$src/$in" "$dst_wear/$snake"
  cp "$src/$in" "$repo/desktop-agent/frontend/fonts/$in"
}

mkdir -p "$repo/android/app/src/main/res/font" \
         "$repo/android/wear/src/main/res/font" \
         "$repo/desktop-agent/frontend/fonts"

phone="$repo/android/app/src/main/res/font"
wear="$repo/android/wear/src/main/res/font"

for f in InstrumentSerif-Regular.ttf InstrumentSerif-Italic.ttf \
         JetBrainsMono-Light.ttf JetBrainsMono-Regular.ttf \
         JetBrainsMono-Medium.ttf JetBrainsMono-SemiBold.ttf \
         Geist-Light.ttf Geist-Regular.ttf Geist-Medium.ttf \
         Geist-SemiBold.ttf Geist-Bold.ttf; do
  map "$f" "$phone" "$wear"
done

echo "ok"
