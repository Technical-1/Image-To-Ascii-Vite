import { describe, it, expect } from 'vitest';

// Import the REAL algorithms from src/ascii-core.js (shared with src/script.js).
// These are not copies — a regression in the production code fails these tests.
import {
    adjustBrightnessContrast,
    charForBrightness,
    weightedLuminance,
    ansiColor,
    applyEdgeDetection,
    pixelsToText,
    escapeHtml,
} from '../src/ascii-core.js';

describe('adjustBrightnessContrast', () => {
    it('returns unchanged values at brightness=1.0, contrast=1.0', () => {
        const [r, g, b] = adjustBrightnessContrast(128, 128, 128, 1.0, 1.0);
        expect(r).toBeCloseTo(128, 0);
        expect(g).toBeCloseTo(128, 0);
        expect(b).toBeCloseTo(128, 0);
    });

    it('clamps to 0 for very low brightness', () => {
        const [r, g, b] = adjustBrightnessContrast(50, 50, 50, 0.5, 0.5);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(0);
    });

    it('clamps to 255 for high brightness', () => {
        const [r, g, b] = adjustBrightnessContrast(200, 200, 200, 2.0, 2.0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeLessThanOrEqual(255);
    });

    it('pure black stays black regardless of contrast', () => {
        const [r] = adjustBrightnessContrast(0, 0, 0, 1.0, 2.0);
        expect(r).toBeCloseTo(0, 0);
    });

    it('pure white stays clamped at max', () => {
        const [r] = adjustBrightnessContrast(255, 255, 255, 1.5, 1.5);
        expect(r).toBe(255);
    });
});

describe('charForBrightness', () => {
    const chars = ' .:-=+*#%@';

    it('maps 0 brightness to first character (space)', () => {
        expect(charForBrightness(0, chars)).toBe(' ');
    });

    it('maps 255 brightness to last character (@)', () => {
        expect(charForBrightness(255, chars)).toBe('@');
    });

    it('maps mid brightness to middle character', () => {
        const char = charForBrightness(128, chars);
        const idx = chars.indexOf(char);
        expect(idx).toBeGreaterThan(2);
        expect(idx).toBeLessThan(8);
    });

    it('handles single-char charset', () => {
        expect(charForBrightness(128, '#')).toBe('#');
    });

    it('handles surrogate-pair charsets when passed as an array of glyphs (hub-177)', () => {
        // String indexing would yield lone surrogates here; Array.from
        // gives one element per code point so each emoji is one glyph.
        const glyphs = Array.from('🎨🔥');
        expect(glyphs).toHaveLength(2);
        expect(charForBrightness(0, glyphs)).toBe('🎨');
        expect(charForBrightness(255, glyphs)).toBe('🔥');
    });
});

describe('weightedLuminance', () => {
    it('pure red has luminance ~76', () => {
        expect(weightedLuminance(255, 0, 0)).toBeCloseTo(76.245, 0);
    });

    it('pure green has luminance ~149', () => {
        expect(weightedLuminance(0, 255, 0)).toBeCloseTo(149.685, 0);
    });

    it('pure blue has luminance ~29', () => {
        expect(weightedLuminance(0, 0, 255)).toBeCloseTo(29.07, 0);
    });

    it('white has luminance 255', () => {
        expect(weightedLuminance(255, 255, 255)).toBeCloseTo(255, 0);
    });

    it('black has luminance 0', () => {
        expect(weightedLuminance(0, 0, 0)).toBe(0);
    });
});

describe('ansiColor', () => {
    it('maps black to (0,0,0)', () => {
        const c = ansiColor(0, 0, 0);
        expect(c.r).toBe(0);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
    });

    it('maps white to (255,255,255)', () => {
        const c = ansiColor(255, 255, 255);
        expect(c.r).toBe(255);
        expect(c.g).toBe(255);
        expect(c.b).toBe(255);
    });

    it('quantizes to 6 levels (0,51,102,153,204,255)', () => {
        const c = ansiColor(100, 100, 100);
        const validLevels = [0, 51, 102, 153, 204, 255];
        expect(validLevels).toContain(c.r);
        expect(validLevels).toContain(c.g);
        expect(validLevels).toContain(c.b);
    });
});

describe('pixelsToText', () => {
    // Build a flat RGBA pixel buffer (alpha unused by the algorithm).
    function buildPixels(grid) {
        const height = grid.length;
        const width = grid[0].length;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const v = grid[y][x];
                const o = (y * width + x) * 4;
                data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
            }
        }
        return { data, width, height };
    }

    const chars = ' .:-=+*#%@';

    it('maps a black->white gradient row to ascending characters, newline-terminated', () => {
        const { data, width, height } = buildPixels([[0, 128, 255]]);
        const text = pixelsToText(data, width, height, {
            chars, brightness: 1.0, contrast: 1.0, inverted: false,
        });
        expect(text).toBe(' =@\n');
    });

    it('inverted flag reverses the character ramp', () => {
        const { data, width, height } = buildPixels([[0, 255]]);
        const text = pixelsToText(data, width, height, {
            chars, brightness: 1.0, contrast: 1.0, inverted: true,
        });
        // black now maps to the (reversed) ramp's first char '@', white to ' '
        expect(text).toBe('@ \n');
    });

    it('emits one newline per row', () => {
        const { data, width, height } = buildPixels([[0], [255]]);
        const text = pixelsToText(data, width, height, {
            chars, brightness: 1.0, contrast: 1.0, inverted: false,
        });
        expect(text.split('\n')).toHaveLength(3); // 2 rows + trailing ''
        expect(text.endsWith('\n')).toBe(true);
    });
});

describe('escapeHtml', () => {
    it('escapes the five HTML-sensitive characters', () => {
        expect(escapeHtml('<')).toBe('&lt;');
        expect(escapeHtml('>')).toBe('&gt;');
        expect(escapeHtml('&')).toBe('&amp;');
        expect(escapeHtml('"')).toBe('&quot;');
        expect(escapeHtml("'")).toBe('&#39;');
    });
    it('escapes all five together in one pass', () => {
        expect(escapeHtml(`<a href="x" title='y'>&</a>`))
            .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    });
    it('preserves unicode (no escaping needed)', () => {
        expect(escapeHtml('░▒▓█ 日本語 🎨')).toBe('░▒▓█ 日本語 🎨');
    });
    it('returns empty string for empty input', () => {
        expect(escapeHtml('')).toBe('');
    });
    it('coerces non-string input to string', () => {
        expect(escapeHtml(0)).toBe('0');
        expect(escapeHtml(null)).toBe('null');
        expect(escapeHtml(undefined)).toBe('undefined');
    });
});

describe('applyEdgeDetection', () => {
    function solidImage(width, height, value) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
        }
        return { data, width, height };
    }

    it('leaves a flat (edge-free) image unchanged', () => {
        const img = solidImage(5, 5, 120);
        const before = Uint8ClampedArray.from(img.data);
        applyEdgeDetection(img);
        expect(Array.from(img.data)).toEqual(Array.from(before));
    });

    it('brightens pixels along a sharp vertical edge', () => {
        // Left half black, right half white -> strong edge down the middle.
        const width = 6, height = 3;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const v = x < width / 2 ? 0 : 255;
                const o = (y * width + x) * 4;
                data[o] = data[o + 1] = data[o + 2] = v;
                data[o + 3] = 255;
            }
        }
        const img = { data, width, height };
        const beforeMid = data[((1 * width) + 3) * 4]; // an interior pixel on the bright side of the edge
        applyEdgeDetection(img);
        const afterMid = img.data[((1 * width) + 3) * 4];
        expect(afterMid).toBeGreaterThanOrEqual(beforeMid);
        // At least one interior pixel must have been boosted by the Sobel response.
        let boosted = false;
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const o = (y * width + x) * 4;
                const original = x < width / 2 ? 0 : 255;
                if (img.data[o] > original) boosted = true;
            }
        }
        expect(boosted).toBe(true);
    });
});
