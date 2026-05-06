# App icon

A horizontal slider — the orange-filled portion is the "used" share, the
white knob with the Claude-orange dot marks the current position. The
icon is literal to the app name (Throttle) and to the metric the app
exists to surface (your AI quota slider).

The single source of truth is `assets/icon/icon.svg`. Every platform's
size set is rendered from it by `assets/icon/render.sh`.

## Regenerate

```bash
bash assets/icon/render.sh
```

The script writes into the canonical resource directories so a `git diff`
after a run shows exactly what each platform receives:

| target              | files                                                                |
|---------------------|----------------------------------------------------------------------|
| iOS app             | `ios/PulseWatch/Resources/Assets.xcassets/AppIcon.appiconset/*.png`  |
| watchOS app         | `ios/PulseWatchWatch/Resources/Assets.xcassets/AppIcon.appiconset/*` |
| Android phone       | `android/app/src/main/res/mipmap-*/ic_launcher*.png` + adaptive XML  |
| Wear OS             | `android/wear/src/main/res/mipmap-*/ic_launcher*.png` + adaptive XML |
| Tauri agent         | `desktop-agent/src-tauri/icons/{32,128,128@2x,icon}.png + .ico/.icns + Square*Logo + StoreLogo` |
| Tauri frontend      | `desktop-agent/frontend/icons/icon-{64,128}.png`                     |

`Contents.json` for the iOS/watchOS asset catalogues and the Android
`mipmap-anydpi-v26/ic_launcher{,_round}.xml` adaptive-icon descriptors
are committed alongside the PNGs.

## Tooling

The render needs:
- `rsvg-convert` (Ubuntu: `apt install librsvg2-bin`, macOS: `brew install librsvg`)
- ImageMagick `magick` / `convert` (for the multi-resolution `.ico`)
- `png2icns` (Ubuntu: `apt install icnsutils`) **or** macOS `iconutil`
  (built-in) for `.icns`

The CI `android` and `desktop-agent-release` workflows install these on
their runners before the build step. The script silently skips formats
when the optional tools are missing — if you run it on a fresh box and
the Tauri build complains about a missing `.icns`, install `icnsutils`
and re-run.
