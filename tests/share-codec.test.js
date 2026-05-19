import { describe, it, expect } from 'vitest';
import {
  _bytesToBase64Url,
  _base64UrlToBytes,
  encodeShare,
  decodeShare,
  validateShare,
  SHARE_VERSION,
} from '../src/share-codec.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings-schema.js';

const realSanitize = (raw) => sanitizeSettings(raw, DEFAULT_SETTINGS);
const IMG = 'data:image/png;base64,iVBORw0KGgo=';

describe('base64url helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 65, 66]);
    const s = _bytesToBase64Url(bytes);
    expect(Array.from(_base64UrlToBytes(s))).toEqual(Array.from(bytes));
  });
  it('produces only URL-safe characters (no +, /, =)', () => {
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    const s = _bytesToBase64Url(bytes);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('round-trips UTF-8 multibyte text', () => {
    const text = 'café ░▒▓█ 日本語 🎨';
    const bytes = new TextEncoder().encode(text);
    const decoded = new TextDecoder().decode(_base64UrlToBytes(_bytesToBase64Url(bytes)));
    expect(decoded).toBe(text);
  });
  it('throws on structurally invalid base64url length (len % 4 === 1)', () => {
    expect(() => _base64UrlToBytes('A')).toThrow();
  });
  it('round-trips empty input both directions', () => {
    expect(_bytesToBase64Url(new Uint8Array([]))).toBe('');
    expect(Array.from(_base64UrlToBytes(''))).toEqual([]);
  });
  it('round-trips every byte value 0-255 (encode then decode)', () => {
    const all = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    expect(Array.from(_base64UrlToBytes(_bytesToBase64Url(all)))).toEqual(Array.from(all));
  });
});

describe('encode/decode round-trip', () => {
  it('preserves settings and img exactly', () => {
    const settings = { ...DEFAULT_SETTINGS, colorMode: 'rgb', width: 120 };
    const decoded = decodeShare(encodeShare({ settings, img: IMG }));
    expect(decoded.v).toBe(SHARE_VERSION);
    expect(decoded.settings).toEqual(settings);
    expect(decoded.img).toBe(IMG);
  });
});

describe('encodeShare guards', () => {
  it('rejects missing settings', () => {
    expect(() => encodeShare({ img: IMG })).toThrow();
  });
  it('rejects a non-image img', () => {
    expect(() => encodeShare({ settings: {}, img: 'http://evil/x' })).toThrow();
  });
});

describe('decodeShare guards', () => {
  it('throws on empty input', () => {
    expect(() => decodeShare('')).toThrow();
  });
  it('throws on non-base64url', () => {
    expect(() => decodeShare('!!!not base64!!!')).toThrow();
  });
  it('throws on valid base64url that is not JSON', () => {
    expect(() => decodeShare(_bytesToBase64Url(new TextEncoder().encode('not json')))).toThrow();
  });
});

describe('validateShare', () => {
  it('rejects an unsupported version', () => {
    expect(() => validateShare({ v: 999, settings: {}, img: IMG }, realSanitize)).toThrow(/version/i);
  });
  it('rejects a missing/invalid image', () => {
    expect(() => validateShare({ v: SHARE_VERSION, settings: {}, img: 'nope' }, realSanitize)).toThrow();
  });
  it('runs settings through the injected sanitizer (clamps hostile values)', () => {
    const out = validateShare(
      { v: SHARE_VERSION, settings: { width: 999999, colorMode: 'evil' }, img: IMG },
      realSanitize,
    );
    expect(out.settings.width).toBe(2000);
    expect(out.settings.colorMode).toBe('grayscale');
    expect(out.img).toBe(IMG);
  });
});

describe('validateShare hostile input', () => {
  it('rejects an SVG data URI (raster allowlist)', () => {
    expect(() => validateShare({ v: SHARE_VERSION, img: 'data:image/svg+xml,<svg/>', settings: {} }, realSanitize)).toThrow(/image/i);
  });
  it('rejects an array as settings', () => {
    expect(() => validateShare({ v: SHARE_VERSION, img: IMG, settings: [] }, realSanitize)).toThrow(/settings/i);
  });
  it('rejects falsy/missing/null version', () => {
    expect(() => validateShare({ v: 0, img: IMG, settings: {} }, realSanitize)).toThrow(/version/i);
    expect(() => validateShare({ img: IMG, settings: {} }, realSanitize)).toThrow(/version/i);
    expect(() => validateShare({ v: null, img: IMG, settings: {} }, realSanitize)).toThrow(/version/i);
    expect(() => validateShare({ v: '1', img: IMG, settings: {} }, realSanitize)).toThrow(/version/i);
  });
  it('rejects missing or null img', () => {
    expect(() => validateShare({ v: SHARE_VERSION, settings: {} }, realSanitize)).toThrow(/image/i);
    expect(() => validateShare({ v: SHARE_VERSION, img: null, settings: {} }, realSanitize)).toThrow(/image/i);
  });
  it('does not pollute via a __proto__ settings key', () => {
    const out = validateShare(
      { v: SHARE_VERSION, img: IMG, settings: JSON.parse('{"__proto__":{"width":9999}}') },
      realSanitize,
    );
    expect(out.settings.width).toBe(DEFAULT_SETTINGS.width);
    expect({}.width).toBeUndefined();
  });
  it('rejects an oversized fragment before decoding', () => {
    expect(() => decodeShare('A'.repeat(8_000_001))).toThrow(/too large/i);
  });
});
