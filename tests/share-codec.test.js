import { describe, it, expect } from 'vitest';
import { _bytesToBase64Url, _base64UrlToBytes } from '../src/share-codec.js';

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
});
