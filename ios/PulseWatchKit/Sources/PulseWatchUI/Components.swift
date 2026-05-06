import SwiftUI

// MARK: - HaloCard ---------------------------------------------------------

/// Throttle's signature card: panel surface, hairline border, top-right
/// radial halo in the brand accent. Use the `accent` parameter to switch
/// between Claude / Codex / warn.
public struct HaloCard<Content: View>: View {
    public enum Accent { case claude, codex, neutral }
    public let accent: Accent
    public let content: () -> Content

    public init(accent: Accent = .neutral, @ViewBuilder content: @escaping () -> Content) {
        self.accent = accent
        self.content = content
    }

    public var body: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .fill(Theme.Colors.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                        .stroke(Theme.Colors.border, lineWidth: 1)
                )
            if let halo = haloColor {
                RadialGradient(
                    colors: [halo, halo.opacity(0)],
                    center: .topTrailing,
                    startRadius: 0,
                    endRadius: 140
                )
                .frame(width: 160, height: 160)
                .offset(x: 30, y: -30)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
                .allowsHitTesting(false)
            }
            content().padding(18)
        }
    }

    private var haloColor: Color? {
        switch accent {
        case .claude:  return Theme.Colors.claudeGlow
        case .codex:   return Theme.Colors.codexGlow
        case .neutral: return nil
        }
    }
}

// MARK: - BrandDot ---------------------------------------------------------

public struct BrandDot: View {
    public enum Accent { case claude, codex, success }
    public let accent: Accent
    public let size: CGFloat

    public init(_ accent: Accent, size: CGFloat = 8) {
        self.accent = accent
        self.size = size
    }

    public var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .shadow(color: glow, radius: size * 1.2, x: 0, y: 0)
    }

    private var color: Color {
        switch accent {
        case .claude:  return Theme.Colors.claude
        case .codex:   return Theme.Colors.codex
        case .success: return Theme.Colors.success
        }
    }
    private var glow: Color {
        switch accent {
        case .claude:  return Theme.Colors.claudeGlow
        case .codex:   return Theme.Colors.codexGlow
        case .success: return Theme.Colors.success.opacity(0.35)
        }
    }
}

// MARK: - Donut ------------------------------------------------------------

/// Single-track donut. `progress` ∈ [0, 1].
public struct Donut: View {
    public let progress: Double
    public let accent: BrandDot.Accent
    public let lineWidth: CGFloat
    public let diameter: CGFloat

    public init(progress: Double, accent: BrandDot.Accent, lineWidth: CGFloat = 8, diameter: CGFloat = 78) {
        self.progress = max(0, min(1, progress))
        self.accent = accent
        self.lineWidth = lineWidth
        self.diameter = diameter
    }

    public var body: some View {
        ZStack {
            Circle().stroke(track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(stroke, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: glow, radius: 4)
        }
        .frame(width: diameter, height: diameter)
    }

    private var stroke: Color { color }
    private var track: Color { color.opacity(0.16) }
    private var glow: Color {
        switch accent {
        case .claude:  return Theme.Colors.claudeGlow
        case .codex:   return Theme.Colors.codexGlow
        case .success: return Theme.Colors.success.opacity(0.35)
        }
    }
    private var color: Color {
        switch accent {
        case .claude:  return Theme.Colors.claude
        case .codex:   return Theme.Colors.codex
        case .success: return Theme.Colors.success
        }
    }
}

// MARK: - DualRing ---------------------------------------------------------

/// Concentric rings used by the watch glance and the iOS hero card.
public struct DualRing: View {
    public let outer: Double
    public let inner: Double
    public let outerAccent: BrandDot.Accent
    public let innerAccent: BrandDot.Accent
    public let lineWidth: CGFloat

    public init(outer: Double, inner: Double,
                outerAccent: BrandDot.Accent = .claude,
                innerAccent: BrandDot.Accent = .codex,
                lineWidth: CGFloat = 11) {
        self.outer = outer
        self.inner = inner
        self.outerAccent = outerAccent
        self.innerAccent = innerAccent
        self.lineWidth = lineWidth
    }

    public var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let outerD = side
            let innerD = side - lineWidth * 3.4
            ZStack {
                Donut(progress: outer, accent: outerAccent, lineWidth: lineWidth, diameter: outerD)
                Donut(progress: inner, accent: innerAccent, lineWidth: lineWidth, diameter: innerD)
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

// MARK: - Sparkline --------------------------------------------------------

/// 12-bar sparkline. `values` ∈ [0, 1]; `nowIndex` marks the current bucket
/// with a 1px outline; bars past `nowIndex` render in `borderBright`.
public struct Sparkline: View {
    public let values: [Double]
    public let nowIndex: Int
    public let accent: BrandDot.Accent

    public init(values: [Double], nowIndex: Int, accent: BrandDot.Accent) {
        self.values = values
        self.nowIndex = nowIndex
        self.accent = accent
    }

    public var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(values.indices, id: \.self) { i in
                let v = max(0.04, min(1, values[i]))
                let isPast = i <= nowIndex
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(isPast ? color : Theme.Colors.borderBright)
                    .frame(maxWidth: .infinity)
                    .frame(height: 30 * v)
                    .shadow(color: isPast ? glow : .clear, radius: 4)
                    .overlay(
                        RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                            .stroke(Color.white.opacity(i == nowIndex ? 0.15 : 0), lineWidth: 1)
                            .padding(-1)
                    )
            }
        }
        .frame(height: 30)
    }

    private var color: Color {
        switch accent {
        case .claude:  return Theme.Colors.claude
        case .codex:   return Theme.Colors.codex
        case .success: return Theme.Colors.success
        }
    }
    private var glow: Color {
        switch accent {
        case .claude:  return Theme.Colors.claudeGlow
        case .codex:   return Theme.Colors.codexGlow
        case .success: return Theme.Colors.success.opacity(0.35)
        }
    }
}

// MARK: - LabelCaps --------------------------------------------------------

/// Uppercase mono caps, used for section labels and data row labels.
public struct LabelCaps: View {
    public let text: String
    public let color: Color
    public let size: Theme.Role

    public init(_ text: String, color: Color = Theme.Colors.textDim, size: Theme.Role = .monoXS) {
        self.text = text
        self.color = color
        self.size = size
    }

    public var body: some View {
        Text(text.uppercased())
            .font(Theme.font(size))
            .tracking(Theme.Tracking.labelCaps)
            .foregroundStyle(color)
    }
}
