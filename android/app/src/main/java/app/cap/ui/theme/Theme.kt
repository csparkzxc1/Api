package app.cap.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.cap.R

/** Throttle palette. Mirrors `docs/design-tokens.md` 1:1. */
data class ThrottlePalette(
    val bg: Color = Color(0xFF0A0A0A),
    val panel: Color = Color(0xFF131313),
    val panel2: Color = Color(0xFF181818),
    val border: Color = Color(0xFF222222),
    val borderBright: Color = Color(0xFF2E2E2E),
    val text: Color = Color(0xFFEDEDED),
    val textDim: Color = Color(0xFF8A8A8A),
    val textFaint: Color = Color(0xFF555555),
    val claude: Color = Color(0xFFD97757),
    val claudeGlow: Color = Color(0x47D97757),  // alpha 0.28
    val codex: Color = Color(0xFF10A37F),
    val codexGlow: Color = Color(0x4710A37F),
    val warn: Color = Color(0xFFE8B54A),
    val success: Color = Color(0xFF22C55E),
)

val LocalThrottlePalette = staticCompositionLocalOf { ThrottlePalette() }

private val InstrumentSerif = FontFamily(
    Font(R.font.instrument_serif_regular, FontWeight.Normal, FontStyle.Normal),
    Font(R.font.instrument_serif_italic,  FontWeight.Normal, FontStyle.Italic),
)
private val JetBrainsMono = FontFamily(
    Font(R.font.jetbrains_mono_light,    FontWeight.Light),
    Font(R.font.jetbrains_mono_regular,  FontWeight.Normal),
    Font(R.font.jetbrains_mono_medium,   FontWeight.Medium),
    Font(R.font.jetbrains_mono_semibold, FontWeight.SemiBold),
)
private val Geist = FontFamily(
    Font(R.font.geist_light,    FontWeight.Light),
    Font(R.font.geist_regular,  FontWeight.Normal),
    Font(R.font.geist_medium,   FontWeight.Medium),
    Font(R.font.geist_semibold, FontWeight.SemiBold),
    Font(R.font.geist_bold,     FontWeight.Bold),
)

object ThrottleType {
    val DisplayLG = TextStyle(
        fontFamily = InstrumentSerif, fontStyle = FontStyle.Italic,
        fontWeight = FontWeight.Normal, fontSize = 40.sp, lineHeight = 42.sp,
        letterSpacing = (-0.01).em,
    )
    val DisplayMD = TextStyle(
        fontFamily = InstrumentSerif, fontStyle = FontStyle.Italic,
        fontWeight = FontWeight.Normal, fontSize = 30.sp, lineHeight = 33.sp,
        letterSpacing = (-0.01).em,
    )
    val SerifBody = TextStyle(
        fontFamily = InstrumentSerif, fontWeight = FontWeight.Normal,
        fontSize = 18.sp, lineHeight = 26.sp,
    )

    val MonoXL = TextStyle(fontFamily = JetBrainsMono, fontWeight = FontWeight.SemiBold, fontSize = 42.sp, letterSpacing = (-0.04).em)
    val MonoLG = TextStyle(fontFamily = JetBrainsMono, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, letterSpacing = (-0.03).em)
    val MonoMD = TextStyle(fontFamily = JetBrainsMono, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, letterSpacing = (-0.03).em)
    val MonoSM = TextStyle(fontFamily = JetBrainsMono, fontWeight = FontWeight.Medium,   fontSize = 11.sp, letterSpacing = 0.04.em)
    val MonoXS = TextStyle(fontFamily = JetBrainsMono, fontWeight = FontWeight.SemiBold, fontSize =  9.sp, letterSpacing = 0.18.em)
    val Mono2XS = TextStyle(fontFamily = JetBrainsMono, fontWeight = FontWeight.SemiBold, fontSize = 7.sp, letterSpacing = 0.18.em)

    val BodyLG = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 26.sp)
    val BodyMD = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 18.sp)
    val BodySM = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Medium, fontSize = 10.sp, lineHeight = 15.sp)
}

object ThrottleShape {
    val Card = RoundedCornerShape(20.dp)
    val Pill = RoundedCornerShape(14.dp)
    val Chip = RoundedCornerShape(10.dp)
}

@Composable
fun ThrottleTheme(content: @Composable () -> Unit) {
    val p = ThrottlePalette()
    val scheme = darkColorScheme(
        primary = p.claude,
        onPrimary = p.bg,
        secondary = p.codex,
        background = p.bg,
        onBackground = p.text,
        surface = p.panel,
        onSurface = p.text,
        surfaceVariant = p.panel2,
        onSurfaceVariant = p.textDim,
        outline = p.border,
        error = p.warn,
    )
    androidx.compose.runtime.CompositionLocalProvider(LocalThrottlePalette provides p) {
        MaterialTheme(colorScheme = scheme, typography = androidx.compose.material3.Typography(), content = content)
    }
}
