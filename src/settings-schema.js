// Pure settings schema + clamp contract. DOM-free; shared by create mode,
// view mode, and the share codec so all paths enforce identical bounds.

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
  lineHeight: 0.7,
  preserveAspectRatio: true,
  fitToContainer: true,
};

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
    width: clampInt(r.width, 10, 2000, defaults.width),
    height: clampInt(r.height, 10, 2000, defaults.height),
    fontSize: clampInt(r.fontSize, 4, 20, defaults.fontSize),
    lineHeight: clampFloat(r.lineHeight, 0.5, 1.5, defaults.lineHeight),
    brightness: clampFloat(r.brightness, 0.5, 2.0, defaults.brightness),
    contrast: clampFloat(r.contrast, 0.5, 2.0, defaults.contrast),
    colorMode: enumVal(r.colorMode, ['grayscale', 'ansi', 'rgb', 'full-rgb'], defaults.colorMode),
    charsetType: enumVal(r.charsetType, ['standard', 'detailed', 'blocks', 'binary', 'dots', 'custom'], defaults.charsetType),
    inverted: Boolean(r.inverted),
    edgeDetection: Boolean(r.edgeDetection),
    preserveAspectRatio: r.preserveAspectRatio !== undefined ? Boolean(r.preserveAspectRatio) : defaults.preserveAspectRatio,
    fitToContainer: r.fitToContainer !== undefined ? Boolean(r.fitToContainer) : defaults.fitToContainer,
    customCharset: String(r.customCharset ?? defaults.customCharset).slice(0, 200),
  };
}
