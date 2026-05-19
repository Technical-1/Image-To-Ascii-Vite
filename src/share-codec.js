// Pure share payload codec. DOM-free, no dependencies.
// Works in browsers and the Vitest node env (btoa/atob/TextEncoder are global in both).

export const SHARE_VERSION = 1;

// Exported with leading underscore = internal, exposed only for unit tests.
export function _bytesToBase64Url(bytes) {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function _base64UrlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // len % 4 === 1 is structurally impossible for valid base64 (a fractional
  // byte) — reject it explicitly rather than relying on atob's behaviour.
  if (b64.length % 4 === 1) throw new Error('invalid base64url length');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
