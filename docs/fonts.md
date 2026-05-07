# Fonts

Throttle ships three font families. They live in `assets/fonts/` and get
copied into each app target by the build configs.

## Files (drop into `assets/fonts/`)

| filename                            | family            | weight |
|-------------------------------------|-------------------|--------|
| `InstrumentSerif-Regular.ttf`       | Instrument Serif  | 400    |
| `InstrumentSerif-Italic.ttf`        | Instrument Serif  | 400i   |
| `JetBrainsMono-Light.ttf`           | JetBrains Mono    | 300    |
| `JetBrainsMono-Regular.ttf`         | JetBrains Mono    | 400    |
| `JetBrainsMono-Medium.ttf`          | JetBrains Mono    | 500    |
| `JetBrainsMono-SemiBold.ttf`        | JetBrains Mono    | 600    |
| `Geist-Light.ttf`                   | Geist             | 300    |
| `Geist-Regular.ttf`                 | Geist             | 400    |
| `Geist-Medium.ttf`                  | Geist             | 500    |
| `Geist-SemiBold.ttf`                | Geist             | 600    |
| `Geist-Bold.ttf`                    | Geist             | 700    |

The build won't run without these files present. CI uses
`assets/fonts/download.sh` to fetch them from Google Fonts on every fresh
checkout.

## Auto-download

```bash
bash assets/fonts/download.sh
```

The script pulls each family's official ZIP from
`https://fonts.google.com/download?family=...`, extracts the static-weight
TTFs, and renames them to match the table above.

## Per-platform wiring

### iOS / watchOS
- `ios/Cap/Resources/Info.plist` declares each filename under
  `UIAppFonts`.
- `ios/project.yml` adds `assets/fonts/` to the resource bundle for both
  the phone and watch targets.
- Loaded via `CapUI.Theme.serif(...)` / `mono(...)` / `body(...)`.

### Android / Wear OS
- Each TTF is copied to `app/src/main/res/font/` (lowercase, underscores)
  by `tools/sync-fonts.sh`. Compose accesses them through
  `androidx.compose.ui.text.font.Font(R.font.geist_regular, ...)` in
  `ui/theme/Type.kt`.

### Tauri agent
- `desktop-agent/frontend/style.css` uses `@font-face` rules pointing at
  the same TTFs copied to `desktop-agent/frontend/fonts/` (kept identical
  to `assets/fonts/` via the same sync script).

## Licensing

- Instrument Serif: SIL Open Font License 1.1 (Google)
- JetBrains Mono: SIL Open Font License 1.1 (JetBrains)
- Geist: SIL Open Font License 1.1 (Vercel)

`assets/fonts/LICENSES.md` has the full texts; ship them with bundle
metadata on app stores.
