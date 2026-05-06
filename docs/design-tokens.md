# Throttle design tokens

Single source of truth for every platform. The Swift `Theme` and Kotlin
`ThrottleTheme` files import these names verbatim — keep this doc in sync.

## Palette

| token             | hex / rgba                  | use                                                |
|-------------------|-----------------------------|----------------------------------------------------|
| `bg`              | `#0a0a0a`                   | window background                                  |
| `panel`           | `#131313`                   | usage cards, watch face background                 |
| `panel.2`         | `#181818`                   | secondary surfaces (quick-action buttons)          |
| `border`          | `#222222`                   | hairline divider                                   |
| `border.bright`   | `#2e2e2e`                   | accents, button outlines                           |
| `text`            | `#ededed`                   | primary copy, monospace numbers                    |
| `text.dim`        | `#8a8a8a`                   | secondary copy, axis labels                        |
| `text.faint`      | `#555555`                   | tertiary, sparkline base                           |
| `claude`          | `#D97757`                   | Anthropic / Claude Code accent                     |
| `claude.glow`     | `rgba(217,119,87,0.28)`     | drop-shadow / radial-gradient halo for Claude card |
| `codex`           | `#10a37f`                   | OpenAI / Codex accent                              |
| `codex.glow`      | `rgba(16,163,127,0.28)`     | halo for Codex card                                |
| `warn`            | `#e8b54a`                   | reset countdown, threshold-near                    |

Status: never use raw hex in surface code. Pull from the typed token.

## Typography

| role               | family             | weights      | typical size · tracking          |
|--------------------|--------------------|--------------|----------------------------------|
| display / heading  | Instrument Serif   | 400, 400i    | clamp(28–96)px · −0.01em        |
|                    |                    |              | italics highlight the brand mark |
| data / numerics    | JetBrains Mono     | 300/400/500/600 | 9–42px · varies                |
|                    |                    |              | tabular-figures = on             |
| body / UI          | Geist              | 300–700      | 11–18px · 1.5–1.75 line          |

Size scale (the only ones referenced by code):

```
display.xl   96px / line .95 / tracking -0.02em   Instrument Serif italic
display.lg   40px / line 1.05 / tracking -0.01em  Instrument Serif italic
display.md   30px / line 1.10 / tracking -0.01em  Instrument Serif italic

mono.xl      42px / -0.04em   JetBrains Mono 600  hero number
mono.lg      28px / -0.03em   JetBrains Mono 600  card hero
mono.md      18px / -0.03em   JetBrains Mono 600  donut center
mono.sm      11px / +0.04em   JetBrains Mono 500  data row value
mono.xs       9px / +0.18em   JetBrains Mono 600  label caps
mono.2xs      7px / +0.18em   JetBrains Mono 600  micro caps

body.lg      16px / 1.65      Geist 400
body.md      12px / 1.5       Geist 400
body.sm      10px / 1.5       Geist 500
```

## Shape & spacing

- Radii: `card 20px`, `pill 14px`, `chip 10px`, `donut-stroke-cap round`.
- Card padding: `18px` (phone), `24px` (watch).
- Card border: `1px solid border`.
- Watch face frame: `52px` radius for Apple Watch, `50%` for Galaxy.
- Background grain: feTurbulence baseFrequency 0.9, opacity 0.05, `mix-blend-mode: overlay`.

## Component contracts

### Provider card (phone)
- Outer: `panel` bg, `border` 1px, radius 20.
- Top-right radial halo: 140×140 radial-gradient(`claude.glow` / `codex.glow`).
- Header: dot (`claude` / `codex`, 8×8, glow) + uppercase mono label.
- Donut: r 42, stroke 8, cap round, fg has 4px drop-shadow in glow color.
- Sparkline: 12 bars, gap 3px, current bar marked with `outline 1px rgba(255,255,255,.15)` offset 1px. Future bars use `border.bright`.
- Axis: 3 labels — past / NOW / future — all 8px, +0.1em.

### Apple Watch — Modular complication
- Three rows: time row · main complication · sub-row of two compacts.
- Main complication: `linear-gradient 135deg from rgba(claude,.18) to rgba(claude,.04)`, border `rgba(claude,.22)`.
- Main bar: 3px tall, claude fg with 10px glow.

### Apple Watch — Glance
- Outer ring (Claude): r 42, stroke 11.
- Inner ring (Codex): r 28, stroke 11.
- Centered percentage with provider caption below, both monospace.
- Footer: claude % · "until reset" countdown in warn · codex $.

### Galaxy Watch — Tile
- Round face, radial bg from `claude.glow` 0% to transparent 60% at 50%/35%.
- Inset 6px dashed circle border `rgba(255,255,255,.06)` to suggest dial.
- Body stack: caps label → big % → reset time → divider 48×1 → secondary strip.

## Pulse / motion

- Eyebrow dot: 2s ease-in-out infinite, scale 1 ↔ 0.85 + opacity 1 ↔ 0.4.
- Threshold breach: card border flashes `warn` at 50ms cadence × 4, then settles.
  (Defined here; implemented in M7 if/when motion is added.)
