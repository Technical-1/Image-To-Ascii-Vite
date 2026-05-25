// Pure settings schema + clamp contract. DOM-free; shared by create mode,
// view mode, and the share codec so all paths enforce identical bounds.

// Shared ASCII grid dimension bounds — the SINGLE source of truth used by
// the schema clamps, the create-mode UI write paths, and the convert-time
// safety net in script.js. Tracker C2.
export const MIN_DIMENSION = 10;
export const MAX_DIMENSION = 2000;

// Defensive pure clamp for create-mode write paths and convert-time. Non-finite
// input → MIN_DIMENSION (slider/UI has no per-call default to fall back to,
// unlike sanitizeSettings which has per-field defaults).
export function clampDimension(n) {
    if (!Number.isFinite(n)) return MIN_DIMENSION;
    return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.round(n)));
}

export const DEFAULT_SETTINGS = {
  width: 100,
  height: 75,
  charsetType: 'standard',
  customCharset: '',
  colorMode: 'grayscale',
  brightness: 1.0,
  contrast: 1.0,
  inverted: false,
  edgeDetection: false,
  fontSize: 8,
  lineHeight: 0.7, // intentionally within the [0.5, 1.5] clamp range
  preserveAspectRatio: true,
  fitToContainer: true,
};

// `defaults` is an injectable param so the share codec can reuse this exact contract without a circular import.
export function sanitizeSettings(raw, defaults = DEFAULT_SETTINGS) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const clampInt = (val, min, max, fallback) => {
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
  };
  const clampFloat = (val, min, max, fallback) => {
    const n = parseFloat(val);
    return Number.isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
  };
  const enumVal = (val, allowed, fallback) =>
    allowed.includes(val) ? val : fallback;

  return {
    width: clampInt(r.width, MIN_DIMENSION, MAX_DIMENSION, defaults.width),
    height: clampInt(r.height, MIN_DIMENSION, MAX_DIMENSION, defaults.height),
    fontSize: clampInt(r.fontSize, 4, 20, defaults.fontSize),
    lineHeight: clampFloat(r.lineHeight, 0.5, 1.5, defaults.lineHeight),
    brightness: clampFloat(r.brightness, 0.5, 2.0, defaults.brightness),
    contrast: clampFloat(r.contrast, 0.5, 2.0, defaults.contrast),
    colorMode: enumVal(r.colorMode, ['grayscale', 'ansi', 'rgb', 'full-rgb'], defaults.colorMode),
    charsetType: enumVal(r.charsetType, ['standard', 'detailed', 'blocks', 'binary', 'dots', 'custom'], defaults.charsetType),
    inverted: r.inverted !== undefined ? Boolean(r.inverted) : defaults.inverted,
    edgeDetection: r.edgeDetection !== undefined ? Boolean(r.edgeDetection) : defaults.edgeDetection,
    preserveAspectRatio: r.preserveAspectRatio !== undefined ? Boolean(r.preserveAspectRatio) : defaults.preserveAspectRatio,
    fitToContainer: r.fitToContainer !== undefined ? Boolean(r.fitToContainer) : defaults.fitToContainer,
    customCharset: String(r.customCharset ?? defaults.customCharset).slice(0, 200),
  };
}

// Hard cap on cells (width * height) for which we build per-pixel HTML
// in a color mode. Above this, the DOM render step would allocate
// hundreds of MB of nodes and freeze mobile Safari. The grid is
// otherwise allowed up to MAX_DIMENSION^2 = 4,000,000 cells in
// grayscale (where rendering is one textContent write).
export const MAX_COLOR_CELLS = 500_000;

export function isColorRenderTractable(width, height, colorMode) {
  if (colorMode === 'grayscale') return true;
  return (width * height) <= MAX_COLOR_CELLS;
}
