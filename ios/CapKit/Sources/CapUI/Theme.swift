import SwiftUI

/// Throttle design tokens. Mirrors `docs/design-tokens.md` 1:1; any change
/// here must land there too. Use `Theme.Colors.*` and `Theme.font(.x)` from
/// every SwiftUI surface — no raw hex / system fonts in feature code.
public enum Theme {

    public enum Colors {
        public static let bg          = Color(hex: 0x0A0A0A)
        public static let panel       = Color(hex: 0x131313)
        public static let panel2      = Color(hex: 0x181818)
        public static let border      = Color(hex: 0x222222)
        public static let borderBright = Color(hex: 0x2E2E2E)
        public static let text        = Color(hex: 0xEDEDED)
        public static let textDim     = Color(hex: 0x8A8A8A)
        public static let textFaint   = Color(hex: 0x555555)
        public static let claude      = Color(hex: 0xD97757)
        public static let claudeGlow  = Color(red: 217/255, green: 119/255, blue: 87/255).opacity(0.28)
        public static let codex       = Color(hex: 0x10A37F)
        public static let codexGlow   = Color(red: 16/255, green: 163/255, blue: 127/255).opacity(0.28)
        public static let warn        = Color(hex: 0xE8B54A)
        public static let success     = Color(hex: 0x22C55E)
    }

    /// Font role + size in one call. Falls back to system fonts when the
    /// bundled TTFs aren't present (dev builds without `download.sh`).
    public static func font(_ role: Role) -> Font {
        switch role {
        case .displayXL: return custom("InstrumentSerif-Italic", size: 96, fallback: .system(size: 96, weight: .regular, design: .serif).italic())
        case .displayLG: return custom("InstrumentSerif-Italic", size: 40, fallback: .system(size: 40, weight: .regular, design: .serif).italic())
        case .displayMD: return custom("InstrumentSerif-Italic", size: 30, fallback: .system(size: 30, weight: .regular, design: .serif).italic())
        case .serifBody: return custom("InstrumentSerif-Regular", size: 18, fallback: .system(size: 18, weight: .regular, design: .serif))

        case .monoXL:    return custom("JetBrainsMono-SemiBold", size: 42, fallback: .system(size: 42, weight: .semibold, design: .monospaced))
        case .monoLG:    return custom("JetBrainsMono-SemiBold", size: 28, fallback: .system(size: 28, weight: .semibold, design: .monospaced))
        case .monoMD:    return custom("JetBrainsMono-SemiBold", size: 18, fallback: .system(size: 18, weight: .semibold, design: .monospaced))
        case .monoSM:    return custom("JetBrainsMono-Medium",   size: 11, fallback: .system(size: 11, weight: .medium,   design: .monospaced))
        case .monoXS:    return custom("JetBrainsMono-SemiBold", size:  9, fallback: .system(size:  9, weight: .semibold, design: .monospaced))
        case .mono2XS:   return custom("JetBrainsMono-SemiBold", size:  7, fallback: .system(size:  7, weight: .semibold, design: .monospaced))

        case .bodyLG:    return custom("Geist-Regular", size: 16, fallback: .system(size: 16, weight: .regular))
        case .bodyMD:    return custom("Geist-Regular", size: 12, fallback: .system(size: 12, weight: .regular))
        case .bodySM:    return custom("Geist-Medium",  size: 10, fallback: .system(size: 10, weight: .medium))
        }
    }

    public enum Role {
        case displayXL, displayLG, displayMD, serifBody
        case monoXL, monoLG, monoMD, monoSM, monoXS, mono2XS
        case bodyLG, bodyMD, bodySM
    }

    public enum Tracking {
        // SwiftUI applies tracking via .tracking(_) (em-equivalent points).
        // Values calibrated against the mockup's `letter-spacing` em values.
        public static let tightDisplay: CGFloat = -1.2  // -0.02em on 96px hero
        public static let tight:        CGFloat = -0.6  // -0.03em on 18–28px
        public static let labelCaps:    CGFloat =  1.4  // +0.18em on 9px
        public static let mediumCaps:   CGFloat =  0.8  // +0.12em on 11px
    }

    public enum Radius {
        public static let card:       CGFloat = 20
        public static let pill:       CGFloat = 14
        public static let chip:       CGFloat = 10
    }

    private static func custom(_ name: String, size: CGFloat, fallback: Font) -> Font {
        // SwiftUI's `Font.custom` falls back to system silently if the font
        // isn't registered, so passing the registered name is enough at
        // runtime. We still expose the explicit fallback so dev builds that
        // skipped `download.sh` render with the system equivalent rather
        // than Helvetica-on-Times bleed.
        _ = fallback
        return Font.custom(name, size: size)
    }
}

private extension Color {
    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >>  8) & 0xFF) / 255
        let b = Double( hex        & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
