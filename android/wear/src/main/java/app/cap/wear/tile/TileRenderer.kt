package app.cap.wear.tile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.Typeface

/**
 * Throttle palette mirrored from `docs/design-tokens.md`. Kept here as ints
 * so the renderer stays a pure function of `(width, height, content)` —
 * no Compose runtime, no resources beyond the bundled fonts.
 */
private object Palette {
    const val BG = 0xFF0A0A0A.toInt()
    const val TEXT = 0xFFEDEDED.toInt()
    const val TEXT_DIM = 0xFF8A8A8A.toInt()
    const val TEXT_FAINT = 0xFF555555.toInt()
    const val BORDER_BRIGHT = 0xFF2E2E2E.toInt()
    const val CLAUDE = 0xFFD97757.toInt()
    const val CODEX = 0xFF10A37F.toInt()
    const val WARN = 0xFFE8B54A.toInt()

    // Halo: claude with alpha 0x47 (~0.28) — stops at 70% of the radius.
    val CLAUDE_GLOW: Int = (0x47 shl 24) or (CLAUDE and 0x00FFFFFF)
    // Dial border: white at alpha 0x10 (~0.06).
    val DIAL_DASH: Int = (0x10 shl 24) or 0x00FFFFFF
}

data class TileContent(
    val label: String,
    val percent: Double,
    val resetText: String,
    val secondary: SecondaryItem? = null,
) {
    data class SecondaryItem(val value: String, val label: String, val accent: Accent)
    enum class Accent { CODEX, WARN, CLAUDE }
}

/**
 * Renders the round Throttle tile. Sized in pixels; everything inside is laid
 * out relative to `radius` so the same draw works on a 192×192 small watch
 * and a 466×466 Galaxy 6 Classic without re-tuning constants.
 *
 * Returns a fresh ARGB_8888 bitmap; caller is responsible for `recycle()`.
 */
fun renderUsageTileBitmap(ctx: Context, width: Int, height: Int, c: TileContent): Bitmap {
    val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val cx = width / 2f
    val cy = height / 2f
    val r = minOf(cx, cy)

    // 1. Solid base + radial halo. The halo sits slightly above centre so the
    //    composition feels weighted toward the bottom secondary stats.
    canvas.drawColor(Palette.BG)
    val haloPaint = Paint().apply {
        shader = RadialGradient(
            cx, cy * 0.6f, r * 1.15f,
            intArrayOf(Palette.CLAUDE_GLOW, Color.TRANSPARENT),
            floatArrayOf(0f, 0.7f),
            Shader.TileMode.CLAMP,
        )
    }
    canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), haloPaint)

    // 2. Inset dashed dial.
    val dialPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1f
        color = Palette.DIAL_DASH
        pathEffect = DashPathEffect(floatArrayOf(3f, 4f), 0f)
    }
    canvas.drawCircle(cx, cy, r - r * 0.03f, dialPaint)

    // The mockup specifies JetBrains Mono SemiBold. We deliberately avoid
    // `R.font.jetbrains_mono_semibold` here so the build doesn't hard-require
    // `tools/sync-fonts.sh` to have run first; on a 200×200 round tile the
    // visual difference between JetBrains Mono and the system mono is small
    // enough that the trade is worth it. The phone-side dashboard, where
    // typography matters more, still uses the bundled font via Compose.
    val _unused = ctx // keep ctx in the signature for future R.font lookup
    val mono = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)

    // 3. Caps label, claude orange, kerned wide. Sits ~45% of radius above centre.
    drawCenteredText(
        canvas, cx, cy - r * 0.45f,
        c.label.uppercase(),
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = mono
            textSize = r * 0.10f
            color = Palette.CLAUDE
            letterSpacing = 0.18f
        },
    )

    // 4. Big number with small "%". Number is true-centred; "%" hugs the right
    //    edge with one mono glyph of separation, matching the mockup's
    //    "73%" with the percent sign tucked low.
    val numberSize = r * 0.50f
    val pctSize = r * 0.22f
    val numberText = "${(c.percent * 100).toInt()}"
    val numberPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = mono
        textSize = numberSize
        color = Palette.TEXT
        letterSpacing = -0.04f
    }
    val signPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = mono
        textSize = pctSize
        color = Palette.TEXT_DIM
    }
    val numberWidth = numberPaint.measureText(numberText)
    val signWidth = signPaint.measureText("%")
    val totalWidth = numberWidth + signWidth * 0.4f
    val numberBaseline = cy + r * 0.10f
    canvas.drawText(numberText, cx - totalWidth / 2f, numberBaseline, numberPaint)
    canvas.drawText("%", cx - totalWidth / 2f + numberWidth, numberBaseline, signPaint)

    // 5. Reset text — dim mono, slightly looser tracking.
    drawCenteredText(
        canvas, cx, cy + r * 0.30f,
        c.resetText,
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = mono
            textSize = r * 0.09f
            color = Palette.TEXT_DIM
            letterSpacing = 0.05f
        },
    )

    // 6. Divider 48×1 (scaled to ~25% of the radius).
    val dividerHalf = r * 0.25f
    val dividerY = cy + r * 0.40f
    val dividerPaint = Paint().apply { color = Palette.BORDER_BRIGHT }
    canvas.drawRect(cx - dividerHalf, dividerY, cx + dividerHalf, dividerY + 1f, dividerPaint)

    // 7. Secondary item (codex value + label caps), with a small dot anchor.
    c.secondary?.let { sec ->
        val accentColor = when (sec.accent) {
            TileContent.Accent.CODEX  -> Palette.CODEX
            TileContent.Accent.WARN   -> Palette.WARN
            TileContent.Accent.CLAUDE -> Palette.CLAUDE
        }
        val secValPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = mono
            textSize = r * 0.12f
            color = Palette.TEXT
        }
        val valWidth = secValPaint.measureText(sec.value)
        val dotR = r * 0.025f
        val gap = r * 0.04f
        val secY = cy + r * 0.58f
        val rowWidth = dotR * 2f + gap + valWidth
        val rowLeft = cx - rowWidth / 2f
        // dot
        canvas.drawCircle(rowLeft + dotR, secY - r * 0.04f, dotR, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accentColor })
        // value
        canvas.drawText(sec.value, rowLeft + dotR * 2f + gap, secY, secValPaint)
        // caption caps below
        drawCenteredText(
            canvas, cx, secY + r * 0.10f,
            sec.label.uppercase(),
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                typeface = mono
                textSize = r * 0.075f
                color = Palette.TEXT_FAINT
                letterSpacing = 0.15f
            },
        )
    }

    return bmp
}

private fun drawCenteredText(canvas: Canvas, cx: Float, baselineY: Float, text: String, paint: Paint) {
    paint.textAlign = Paint.Align.CENTER
    canvas.drawText(text, cx, baselineY, paint)
}

/**
 * Serialise an ARGB_8888 [Bitmap] to the byte order proto-layout's
 * `IMAGE_FORMAT_ARGB_8888` expects: `[A, R, G, B]` per pixel, little-endian
 * device or otherwise (we don't trust `copyPixelsToBuffer` since its layout
 * varies by platform endianness).
 */
fun Bitmap.toArgb8888Bytes(): ByteArray {
    val w = width; val h = height
    val pixels = IntArray(w * h)
    getPixels(pixels, 0, w, 0, 0, w, h)
    val out = ByteArray(pixels.size * 4)
    var o = 0
    for (px in pixels) {
        out[o]     = ((px ushr 24) and 0xff).toByte()
        out[o + 1] = ((px ushr 16) and 0xff).toByte()
        out[o + 2] = ((px ushr  8) and 0xff).toByte()
        out[o + 3] = (px and 0xff).toByte()
        o += 4
    }
    return out
}
