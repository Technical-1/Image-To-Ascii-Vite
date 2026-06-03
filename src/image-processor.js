// Pure, DOM-free image→ASCII compute. Extracted from ImageAsciiConverter so the
// per-pixel logic is directly unit-testable (it was previously reachable only
// through the DOM class). hub-1111.
import {
    adjustBrightnessContrast,
    weightedLuminance,
    charForBrightness,
    prepareGlyphs,
    colorCellStyle,
    escapeHtml,
    applyEdgeDetection,
} from './ascii-core.js';
import { isColorRenderTractable } from './settings-schema.js';

export const CHARSETS = {
    standard: ' .:-=+*#%@',
    detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    blocks: ' ░▒▓█',
    binary: ' █',
    dots: ' .·:•',
    custom: ' .:-=+*#%@',
};

export function resolveCharset(charsetType, customChars) {
    if (charsetType === 'custom') return customChars || CHARSETS.standard;
    return CHARSETS[charsetType] || CHARSETS.standard;
}

// Draw a decoded image onto the provided canvas/ctx at width×height and return
// its ImageData, applying Sobel edge detection in place when requested. The
// caller owns the canvas (state) and the dimension clamping.
export function drawToImageData({ image, width, height, canvas, ctx, edgeDetection }) {
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    if (edgeDetection) applyEdgeDetection(imageData);
    return imageData;
}

// Convert an RGBA buffer to { text, html, colors }. Byte-identical to the
// previous ImageAsciiConverter.pixelsToAscii so on-screen and exported renders
// don't drift.
export function pixelsToAscii(imageData, { colorMode, inverted, charsetType, customChars, brightness, contrast }) {
    const { width, height, data: pixels } = imageData;
    const buildColor = isColorRenderTractable(width, height, colorMode);
    const effectiveColorMode = buildColor ? colorMode : 'grayscale';
    const chars = resolveCharset(charsetType, customChars);
    const glyphs = prepareGlyphs(chars, inverted);

    const textRows = new Array(height);
    const htmlRows = new Array(height);
    const colors = new Array(height);

    for (let y = 0; y < height; y++) {
        const textChars = new Array(width);
        const htmlParts = new Array(width);
        const rowColors = new Array(width);
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            const [r, g, b] = adjustBrightnessContrast(
                pixels[offset], pixels[offset + 1], pixels[offset + 2], brightness, contrast,
            );
            const lum = weightedLuminance(r, g, b);
            textChars[x] = charForBrightness(lum, glyphs);

            const style = colorCellStyle(r, g, b, effectiveColorMode);
            if (style.color) {
                const css = style.background
                    ? `color:${style.color};background:${style.background}`
                    : `color:${style.color}`;
                htmlParts[x] = `<span style="${css}">${escapeHtml(textChars[x])}</span>`;
                rowColors[x] = style.background
                    ? { color: style.color, background: style.background }
                    : { color: style.color };
            } else {
                htmlParts[x] = escapeHtml(textChars[x]);
                rowColors[x] = null;
            }
        }
        textRows[y] = textChars.join('');
        htmlRows[y] = htmlParts.join('');
        colors[y] = rowColors;
    }

    return { text: textRows.join('\n') + '\n', html: htmlRows.join('\n') + '\n', colors };
}
