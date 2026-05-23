// Pure, DOM-free core algorithms for image -> ASCII conversion.
// Imported by both src/script.js (production) and tests/ — so the tests
// exercise the exact code that ships.

/**
 * Apply brightness/contrast to an RGB triple. Returns clamped [r, g, b].
 */
export function adjustBrightnessContrast(r, g, b, brightness, contrast) {
    const adjust = (value) => {
        let adjusted = ((value / 255 - 0.5) * contrast + 0.5) * 255;
        adjusted = adjusted * brightness;
        return Math.max(0, Math.min(255, adjusted));
    };
    return [adjust(r), adjust(g), adjust(b)];
}

/**
 * Perceptual (Rec. 601 weighted) luminance for an RGB triple, 0..255.
 */
export function weightedLuminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Map a 0..255 brightness onto a character ramp (dark -> light = index 0 -> end).
 */
export function charForBrightness(brightness, chars) {
    const charIndex = Math.floor((brightness / 255) * (chars.length - 1));
    return chars[charIndex] || ' ';
}

/**
 * Quantize an RGB triple to the ANSI 256 6x6x6 color cube, returned as the
 * approximate RGB used for HTML rendering (each channel one of 0,51,102,153,204,255).
 */
export function ansiColor(r, g, b) {
    const rIndex = Math.round(r / 255 * 5);
    const gIndex = Math.round(g / 255 * 5);
    const bIndex = Math.round(b / 255 * 5);
    return {
        r: Math.round(rIndex * 51),
        g: Math.round(gIndex * 51),
        b: Math.round(bIndex * 51),
    };
}

/**
 * In-place Sobel edge detection. `imageData` is any object with
 * { data: Uint8ClampedArray (RGBA), width, height }. Pixels whose gradient
 * magnitude exceeds the threshold are brightened proportionally.
 */
export function applyEdgeDetection(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const tempData = new Uint8ClampedArray(data);
    const threshold = 50;

    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0, gy = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const brightness = (tempData[idx] + tempData[idx + 1] + tempData[idx + 2]) / 3;

                    const kernelIdx = (ky + 1) * 3 + (kx + 1);
                    gx += brightness * sobelX[kernelIdx];
                    gy += brightness * sobelY[kernelIdx];
                }
            }

            const magnitude = Math.sqrt(gx * gx + gy * gy);
            const idx = (y * width + x) * 4;

            if (magnitude > threshold) {
                data[idx] = Math.min(255, data[idx] + magnitude * 0.5);
                data[idx + 1] = Math.min(255, data[idx + 1] + magnitude * 0.5);
                data[idx + 2] = Math.min(255, data[idx + 2] + magnitude * 0.5);
            }
        }
    }
    return imageData;
}

/**
 * Convert a flat RGBA pixel buffer to plain ASCII text (grayscale path).
 * `chars` is the (already preset-selected) ramp; `inverted` reverses it.
 * One '\n' is emitted per row, including a trailing newline.
 */
export function pixelsToText(pixels, width, height, { chars, brightness, contrast, inverted }) {
    let ramp = chars;
    if (inverted) {
        ramp = ramp.split('').reverse().join('');
    }

    let text = '';
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            const [r, g, b] = adjustBrightnessContrast(
                pixels[offset], pixels[offset + 1], pixels[offset + 2],
                brightness, contrast,
            );
            const lum = weightedLuminance(r, g, b);
            text += charForBrightness(lum, ramp);
        }
        text += '\n';
    }
    return text;
}
