#!/usr/bin/env bash
# Fetch the three Throttle font families from Google Fonts.
# Idempotent: skips families that already have all expected files.
set -euo pipefail

cd "$(dirname "$0")"

need=(
  "InstrumentSerif-Regular.ttf"
  "InstrumentSerif-Italic.ttf"
  "JetBrainsMono-Light.ttf"
  "JetBrainsMono-Regular.ttf"
  "JetBrainsMono-Medium.ttf"
  "JetBrainsMono-SemiBold.ttf"
  "Geist-Light.ttf"
  "Geist-Regular.ttf"
  "Geist-Medium.ttf"
  "Geist-SemiBold.ttf"
  "Geist-Bold.ttf"
)

missing=0
for f in "${need[@]}"; do
  if [ ! -f "$f" ]; then missing=1; break; fi
done
if [ "$missing" -eq 0 ]; then
  echo "fonts already present"
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fetch() {
  local family=$1
  local zip=$tmp/$family.zip
  echo "→ $family"
  curl -sL --fail "https://fonts.google.com/download?family=${family// /%20}" -o "$zip"
  unzip -qo "$zip" -d "$tmp/$family"
}

fetch "Instrument Serif"
fetch "JetBrains Mono"
fetch "Geist"

# Move only the static TTFs we need, normalising filenames.
copy() {
  local src=$1 dst=$2
  # Pick the first match of $src under $tmp.
  local found
  found=$(find "$tmp" -type f -iname "$src" | head -n 1 || true)
  if [ -z "$found" ]; then
    echo "  ! missing: $src"
    return 1
  fi
  cp "$found" "$dst"
}

copy "InstrumentSerif-Regular.ttf"  "InstrumentSerif-Regular.ttf"
copy "InstrumentSerif-Italic.ttf"   "InstrumentSerif-Italic.ttf"
copy "JetBrainsMono-Light.ttf"      "JetBrainsMono-Light.ttf"
copy "JetBrainsMono-Regular.ttf"    "JetBrainsMono-Regular.ttf"
copy "JetBrainsMono-Medium.ttf"     "JetBrainsMono-Medium.ttf"
copy "JetBrainsMono-SemiBold.ttf"   "JetBrainsMono-SemiBold.ttf"
copy "Geist-Light.ttf"              "Geist-Light.ttf"
copy "Geist-Regular.ttf"            "Geist-Regular.ttf"
copy "Geist-Medium.ttf"             "Geist-Medium.ttf"
copy "Geist-SemiBold.ttf"           "Geist-SemiBold.ttf"
copy "Geist-Bold.ttf"               "Geist-Bold.ttf"

echo "ok"
