import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, capGraphemes } from '../src/settings-schema.js';
import { MIN_DIMENSION, MAX_DIMENSION, clampDimension, clampToSliderMax } from '../src/settings-schema.js';
import { MAX_COLOR_CELLS, isColorRenderTractable } from '../src/settings-schema.js';

describe('sanitizeSettings', () => {
  it('returns defaults for an empty object', () => {
    const s = sanitizeSettings({}, DEFAULT_SETTINGS);
    expect(s).toEqual(DEFAULT_SETTINGS);
  });
  it('clamps width/height into [10, 2000]', () => {
    expect(sanitizeSettings({ width: 999999, height: -5 }, DEFAULT_SETTINGS).width).toBe(2000);
    expect(sanitizeSettings({ width: 999999, height: -5 }, DEFAULT_SETTINGS).height).toBe(10);
  });
  it('rejects unknown enums, falling back to defaults', () => {
    const s = sanitizeSettings({ colorMode: 'x', charsetType: 'y' }, DEFAULT_SETTINGS);
    expect(s.colorMode).toBe('grayscale');
    expect(s.charsetType).toBe('standard');
  });
  it('coerces booleans and caps customCharset at 200 chars', () => {
    const s = sanitizeSettings({ inverted: 1, customCharset: 'a'.repeat(500) }, DEFAULT_SETTINGS);
    expect(s.inverted).toBe(true);
    expect(s.customCharset.length).toBe(200);
  });
  it('caps customCharset by code point so emoji are never split (hub-1109)', () => {
    const s = sanitizeSettings({ customCharset: '🎨'.repeat(250) }, DEFAULT_SETTINGS);
    expect(Array.from(s.customCharset)).toHaveLength(200);
    expect(s.customCharset).not.toMatch(/[\uD800-\uDBFF]$/);
  });
  it('clamps brightness/contrast/fontSize/lineHeight to range', () => {
    const s = sanitizeSettings({ brightness: 99, contrast: 0, fontSize: 1, lineHeight: 9 }, DEFAULT_SETTINGS);
    expect(s.brightness).toBe(2.0);
    expect(s.contrast).toBe(0.5);
    expect(s.fontSize).toBe(4);
    expect(s.lineHeight).toBe(1.5);
  });
  it('falls back to defaults for null / non-object raw', () => {
    expect(sanitizeSettings(null, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope', DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(undefined, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
  it('preserves explicit false booleans (does not collapse to default)', () => {
    const s = sanitizeSettings({ inverted: false, edgeDetection: false, preserveAspectRatio: false, fitToContainer: false }, DEFAULT_SETTINGS);
    expect(s.inverted).toBe(false);
    expect(s.edgeDetection).toBe(false);
    expect(s.preserveAspectRatio).toBe(false);
    expect(s.fitToContainer).toBe(false);
  });
  it('keeps preserveAspectRatio/fitToContainer defaults when keys are absent', () => {
    const s = sanitizeSettings({}, DEFAULT_SETTINGS);
    expect(s.preserveAspectRatio).toBe(true);
    expect(s.fitToContainer).toBe(true);
  });
});

describe('clampDimension', () => {
  it('exposes the contract values', () => {
    expect(MIN_DIMENSION).toBe(10);
    expect(MAX_DIMENSION).toBe(2000);
  });
  it('passes through in-range integers unchanged', () => {
    expect(clampDimension(100)).toBe(100);
    expect(clampDimension(MIN_DIMENSION)).toBe(MIN_DIMENSION);
    expect(clampDimension(MAX_DIMENSION)).toBe(MAX_DIMENSION);
  });
  it('clamps above MAX_DIMENSION down to MAX_DIMENSION', () => {
    expect(clampDimension(2001)).toBe(MAX_DIMENSION);
    expect(clampDimension(999999)).toBe(MAX_DIMENSION);
    expect(clampDimension(2000.5)).toBe(MAX_DIMENSION); // round first (->2001), then clamp
  });
  it('clamps below MIN_DIMENSION up to MIN_DIMENSION', () => {
    expect(clampDimension(9)).toBe(MIN_DIMENSION);
    expect(clampDimension(-50)).toBe(MIN_DIMENSION);
    expect(clampDimension(0)).toBe(MIN_DIMENSION);
  });
  it('rounds non-integer inputs to the nearest integer', () => {
    expect(clampDimension(123.4)).toBe(123);
    expect(clampDimension(123.7)).toBe(124);
    expect(clampDimension(123.5)).toBe(124); // Math.round rounds half up
  });
  it('returns MIN_DIMENSION for non-finite input (defensive fallback)', () => {
    expect(clampDimension(NaN)).toBe(MIN_DIMENSION);
    expect(clampDimension(Infinity)).toBe(MIN_DIMENSION);
    expect(clampDimension(-Infinity)).toBe(MIN_DIMENSION);
    expect(clampDimension(undefined)).toBe(MIN_DIMENSION);
    expect(clampDimension(null)).toBe(MIN_DIMENSION);
    expect(clampDimension('nope')).toBe(MIN_DIMENSION);
  });
});

describe('isColorRenderTractable', () => {
  it('always returns true for grayscale regardless of size', () => {
    expect(isColorRenderTractable(2000, 2000, 'grayscale')).toBe(true);
    expect(isColorRenderTractable(10, 10, 'grayscale')).toBe(true);
  });
  it('returns true for color when cells <= MAX_COLOR_CELLS', () => {
    expect(isColorRenderTractable(100, 100, 'rgb')).toBe(true);
    expect(isColorRenderTractable(500, 500, 'ansi')).toBe(true);
  });
  it('returns false for color when cells > MAX_COLOR_CELLS', () => {
    expect(isColorRenderTractable(2000, 2000, 'rgb')).toBe(false);
    expect(isColorRenderTractable(1000, 1000, 'full-rgb')).toBe(false);
  });
  it('handles the exact boundary', () => {
    const w = 1000, h = MAX_COLOR_CELLS / 1000;
    expect(isColorRenderTractable(w, h, 'rgb')).toBe(true);
    expect(isColorRenderTractable(w, h + 1, 'rgb')).toBe(false);
  });
  it('exposes the constant', () => {
    expect(MAX_COLOR_CELLS).toBeGreaterThan(0);
  });
});

describe('capGraphemes', () => {
  it('returns the string unchanged when under the cap', () => {
    expect(capGraphemes('abc', 200)).toBe('abc');
  });
  it('caps ASCII at exactly `max` code points', () => {
    expect(capGraphemes('a'.repeat(500), 200).length).toBe(200);
  });
  it('keeps an exactly-`max`-length string intact', () => {
    expect(capGraphemes('a'.repeat(200), 200).length).toBe(200);
  });
  it('caps emoji by code point without leaving a lone surrogate', () => {
    // 250 painters, each a surrogate pair (2 UTF-16 code units).
    const result = capGraphemes('🎨'.repeat(250), 200);
    // 200 code points...
    expect(Array.from(result)).toHaveLength(200);
    // ...which is 400 UTF-16 code units (pairs intact, none bisected)...
    expect(result.length).toBe(400);
    // ...and the string must not end on a dangling high surrogate.
    expect(result).not.toMatch(/[\uD800-\uDBFF]$/);
  });
  it('coerces non-string input to string first', () => {
    expect(capGraphemes(12345, 3)).toBe('123');
  });
});

describe('clampToSliderMax', () => {
  it('passes a value through when it is within both the global cap and the slider max', () => {
    expect(clampToSliderMax(500, 1000)).toBe(500);
  });
  it('clamps down to the live slider max (image-derived ceiling)', () => {
    expect(clampToSliderMax(1500, 1000)).toBe(1000);
  });
  it('clamps down to MAX_DIMENSION when the slider max is higher', () => {
    expect(clampToSliderMax(3000, 5000)).toBe(MAX_DIMENSION);
  });
  it('floors below MIN_DIMENSION up to MIN_DIMENSION', () => {
    expect(clampToSliderMax(5, 1000)).toBe(MIN_DIMENSION);
  });
  it('treats a tiny slider max as MIN_DIMENSION (never below the contract floor)', () => {
    expect(clampToSliderMax(50, 5)).toBe(MIN_DIMENSION);
  });
  it('falls back to MAX_DIMENSION when no slider max is available (no image yet)', () => {
    expect(clampToSliderMax(1500, NaN)).toBe(1500);
    expect(clampToSliderMax(3000, undefined)).toBe(MAX_DIMENSION);
    expect(clampToSliderMax(800, null)).toBe(800);
  });
  it('rounds non-integer requests via clampDimension before applying the slider max', () => {
    expect(clampToSliderMax(123.7, 1000)).toBe(124);
  });
});
