import { describe, it, expect } from 'vitest';

// Pure function copies of core algorithms from src/script.js for testing

function adjustBrightnessContrast(r, g, b, brightness, contrast) {
    const adjust = (value) => {
        let adjusted = ((value / 255 - 0.5) * contrast + 0.5) * 255;
        adjusted = adjusted * brightness;
        return Math.max(0, Math.min(255, adjusted));
    };
    return [adjust(r), adjust(g), adjust(b)];
}

function mapBrightnessToChar(brightness, chars) {
    const charIndex = Math.floor((brightness / 255) * (chars.length - 1));
    return chars[charIndex] || ' ';
}

function calculateLuminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function toAnsiColor(r, g, b) {
    const rIndex = Math.round(r / 255 * 5);
    const gIndex = Math.round(g / 255 * 5);
    const bIndex = Math.round(b / 255 * 5);
    return {
        r: Math.round(rIndex * 51),
        g: Math.round(gIndex * 51),
        b: Math.round(bIndex * 51),
    };
}

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

describe('mapBrightnessToChar', () => {
    const chars = ' .:-=+*#%@';

    it('maps 0 brightness to first character (space)', () => {
        expect(mapBrightnessToChar(0, chars)).toBe(' ');
    });

    it('maps 255 brightness to last character (@)', () => {
        expect(mapBrightnessToChar(255, chars)).toBe('@');
    });

    it('maps mid brightness to middle character', () => {
        const char = mapBrightnessToChar(128, chars);
        const idx = chars.indexOf(char);
        expect(idx).toBeGreaterThan(2);
        expect(idx).toBeLessThan(8);
    });

    it('handles single-char charset', () => {
        expect(mapBrightnessToChar(128, '#')).toBe('#');
    });
});

describe('calculateLuminance', () => {
    it('pure red has luminance ~76', () => {
        expect(calculateLuminance(255, 0, 0)).toBeCloseTo(76.245, 0);
    });

    it('pure green has luminance ~149', () => {
        expect(calculateLuminance(0, 255, 0)).toBeCloseTo(149.685, 0);
    });

    it('pure blue has luminance ~29', () => {
        expect(calculateLuminance(0, 0, 255)).toBeCloseTo(29.07, 0);
    });

    it('white has luminance 255', () => {
        expect(calculateLuminance(255, 255, 255)).toBeCloseTo(255, 0);
    });

    it('black has luminance 0', () => {
        expect(calculateLuminance(0, 0, 0)).toBe(0);
    });
});

describe('toAnsiColor', () => {
    it('maps black to (0,0,0)', () => {
        const c = toAnsiColor(0, 0, 0);
        expect(c.r).toBe(0);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
    });

    it('maps white to (255,255,255)', () => {
        const c = toAnsiColor(255, 255, 255);
        expect(c.r).toBe(255);
        expect(c.g).toBe(255);
        expect(c.b).toBe(255);
    });

    it('quantizes to 6 levels (0,51,102,153,204,255)', () => {
        const c = toAnsiColor(100, 100, 100);
        const validLevels = [0, 51, 102, 153, 204, 255];
        expect(validLevels).toContain(c.r);
        expect(validLevels).toContain(c.g);
        expect(validLevels).toContain(c.b);
    });
});
