# App icon

A horizontal slider — the orange-filled portion is the "used" share, the
white knob with the Claude-orange dot marks the current position. The
icon is literal to the app name (Cap) and to the metric the app
exists to surface (your AI quota slider).

## Sources

There are four SVG masters in `assets/icon/`:

| file                    | role                                                                  |
|-------------------------|-----------------------------------------------------------------------|
| `icon.svg`              | Composed marketing icon — slider on the dark vignette plate.          |
| `icon-foreground.svg`   | Slider-only, sized for the central 66% of a 108×108 viewport. Used as the Android adaptive-icon foreground so any launcher mask (circle, squircle, teardrop) keeps both the track and the knob visible. |
| `icon-background.svg`   | Dark vignette plate without the slider. Pairs with the foreground via `mipmap-anydpi-v26/ic_launcher{,_round}.xml`. |
| `tray-icon.svg`         | Monochrome silhouette — black on transparent, with the inner dot punched as a real hole via `fill-rule: evenodd`. macOS uses `iconAsTemplate: true` to invert it for dark menu bars; Windows and Linux render the silhouette as-is. |

`assets/icon/render.sh` reads all four and writes into the canonical
resource directories.

## Regenerate

```bash
bash assets/icon/render.sh
```

The script writes into the canonical resource directories so a `git diff`
after a run shows exactly what each platform receives:

| target              | files                                                                |
|---------------------|----------------------------------------------------------------------|
| iOS app             | `ios/Cap/Resources/Assets.xcassets/AppIcon.appiconset/*.png`  |
| watchOS app         | `ios/CapWatch/Resources/Assets.xcassets/AppIcon.appiconset/*` |
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
