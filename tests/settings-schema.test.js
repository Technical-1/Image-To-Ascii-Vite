import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings-schema.js';

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
