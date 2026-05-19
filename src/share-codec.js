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

// canvas.toDataURL only ever emits raster formats; SVG data URIs are excluded
// (XML-entity / memory DoS via Image()), and this is the untrusted-input boundary.
const RASTER_DATA_URI = /^data:image\/(png|jpe?g|gif|webp);base64,/;

export function encodeShare({ settings, img } = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('encodeShare: settings object required');
  }
  if (typeof img !== 'string' || !img.startsWith('data:image/')) {
    throw new Error('encodeShare: img must be a data:image/ URI');
  }
  const json = JSON.stringify({ v: SHARE_VERSION, settings, img });
  return _bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeShare(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('decodeShare: empty value');
  }
  // Reject pathologically large fragments before the synchronous
  // atob/JSON.parse work blocks the main thread. 8 MB comfortably exceeds a
  // 2000x2000 PNG data URI (~5 MB worst case under the settings clamp).
  if (value.length > 8_000_000) {
    throw new Error('decodeShare: payload too large');
  }
  let json;
  try {
    json = new TextDecoder().decode(_base64UrlToBytes(value));
  } catch (e) {
    throw new Error('decodeShare: invalid base64url');
  }
  let obj;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    throw new Error('decodeShare: invalid JSON');
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('decodeShare: payload is not an object');
  }
  return obj;
}

// `sanitize` is injected (dependency injection) so the codec stays decoupled
// from settings-schema and is testable with a stub. Only top-level structure is
// validated here; deep field sanitization is the injected sanitize's job.
export function validateShare(decoded, sanitize) {
  if (!decoded || decoded.v !== SHARE_VERSION) {
    throw new Error(`Unsupported share version (expected ${SHARE_VERSION})`);
  }
  if (typeof decoded.img !== 'string' || !RASTER_DATA_URI.test(decoded.img)) {
    throw new Error('Invalid share image');
  }
  if (!decoded.settings || typeof decoded.settings !== 'object' || Array.isArray(decoded.settings)) {
    throw new Error('Invalid share settings');
  }
  return { settings: sanitize(decoded.settings), img: decoded.img };
}
