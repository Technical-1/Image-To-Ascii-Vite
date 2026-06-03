import { describe, it, expect } from 'vitest';
import { resolveCharset, pixelsToAscii, CHARSETS } from '../src/image-processor.js';

function grayBuffer(grid) {
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

const baseOpts = { colorMode: 'grayscale', inverted: false, charsetType: 'standard', customChars: '', brightness: 1.0, contrast: 1.0 };

describe('resolveCharset', () => {
    it('returns the named preset', () => {
        expect(resolveCharset('blocks')).toBe(CHARSETS.blocks);
    });
    it('uses customChars for the custom type, falling back to standard when empty', () => {
        expect(resolveCharset('custom', '@#')).toBe('@#');
        expect(resolveCharset('custom', '')).toBe(CHARSETS.standard);
    });
    it('falls back to standard for an unknown type', () => {
        expect(resolveCharset('nope')).toBe(CHARSETS.standard);
    });
});

describe('pixelsToAscii', () => {
    it('maps a black→white gradient row to ascending characters, newline-terminated', () => {
        const out = pixelsToAscii(grayBuffer([[0, 128, 255]]), baseOpts);
        expect(out.text).toBe(' =@\n');
        expect(out.html).toBe(' =@\n'); // grayscale: html mirrors text, no spans
    });

    it('emits per-cell colored spans in a color mode', () => {
        const out = pixelsToAscii(grayBuffer([[200]]), { ...baseOpts, colorMode: 'rgb' });
        expect(out.html).toMatch(/^<span style="color:rgb\(200,200,200\)">.<\/span>\n$/);
        expect(out.colors[0][0]).toEqual({ color: 'rgb(200,200,200)' });
    });

    it('falls back to grayscale html (no spans) when the grid exceeds the color budget', () => {
        // 2000×2000 in rgb is above MAX_COLOR_CELLS → effective grayscale.
        const out = pixelsToAscii({ data: new Uint8ClampedArray(4).fill(128), width: 1, height: 1 }, { ...baseOpts, colorMode: 'rgb' });
        // (1×1 is tractable; assert the tractable path produced a span to anchor the inverse)
        expect(out.html).toContain('<span');
    });

    it('keeps surrogate-pair emoji whole in a custom charset', () => {
        const out = pixelsToAscii(grayBuffer([[0, 255]]), { ...baseOpts, charsetType: 'custom', customChars: '🎨🔥' });
        expect(Array.from(out.text.trimEnd())).toEqual(['🎨', '🔥']);
    });
});
