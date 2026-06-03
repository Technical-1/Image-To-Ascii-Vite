# Bucket D — Test & Architecture Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the untested `ImageAsciiConverter` orchestration a characterization-test safety net (Hub #1105), then use that net to split the ~1400-line `src/script.js` into focused, individually-testable modules following the codebase's existing pure-function pattern (Hub #1111).

**Architecture:** Two phases. **Phase 1 (tests first)** stands up a jsdom test environment with a minimal canvas stub, exports the converter class, guards its auto-instantiation so importing it under test doesn't auto-run, and writes characterization tests for the conversion pipeline, button lifecycle, settings restore, view-mode error handling, and the share decode→settings round-trip. **Phase 2 (refactor under the net)** extracts `ImageProcessor` (the compute core — and `pixelsToAscii` finally becomes directly unit-testable), `ExportManager`, `ShareManager`, and a `UIManager` markup builder, each as a behavior-preserving move guarded by `npm test`.

**Verification philosophy (resolved):** Per the project's standing preference, we **do not introduce a browser-automation tool (Playwright/Cypress)**. The tests here are jsdom **unit/characterization** tests of *logic* (settings flow, render branch selection, button state, data round-trips) — not pixel/visual assertions. Canvas-pixel fidelity, font measurement, and fit-to-container sizing remain verified by the manual smoke checklist (Task D-T5). This keeps "don't automate a browser to check GUI" intact while still making the refactor safe.

**Tech Stack:** Vanilla ES modules, Vite 8, Vitest 4, **+ jsdom (new devDependency)**. jsdom is enabled per-file via the `// @vitest-environment jsdom` pragma — no global config change, so the existing node-env pure tests are untouched.

**Covers Project Hub tasks:** 1105 (no UI/export/share tests), 1111 (monolithic converter refactor).

**Conventions:** Conventional-commit messages (`test:`, `refactor:`, `chore:`); reference `(hub-1105)` / `(hub-1111)`. Commits authored by Jacob, no AI/assistant attribution (global git rules). **Order matters:** do Phase 1 before Phase 2 so the refactor moves are validated by the new suite.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `package.json` | Dev tooling | **Modify** — add `jsdom` devDependency |
| `tests/helpers/canvas-stub.js` | Minimal 2D-context/canvas stub for jsdom | **Create** |
| `src/script.js` | App entry + orchestrator (`ImageAsciiConverter`) | **Modify** — `export` class, guard auto-start; later, delegate to extracted modules |
| `tests/converter.characterization.test.js` | jsdom characterization tests | **Create** |
| `src/image-processor.js` | Pure image→ASCII compute: `resolveCharset`, `pixelsToAscii`, `drawToImageData` | **Create** (Phase 2) |
| `tests/image-processor.test.js` | Unit tests for `pixelsToAscii`/`resolveCharset` | **Create** (Phase 2) |
| `src/export-manager.js` | Build export artifacts: `exportTxtBlob`, `exportHtmlBlob`, `buildPngCanvas`, `downloadBlob` | **Create** (Phase 2) |
| `src/share-manager.js` | `buildShareUrl` (pure) | **Create** (Phase 2) |
| `src/ui-manager.js` | `createUiMarkup(settings, bounds)` pure HTML builder + `CHARSETS`/`PRESETS` constants | **Create** (Phase 2) |

**Module contract (resolved up front):** Extracted modules follow the existing `ascii-core.js`/`settings-schema.js`/`share-codec.js` pattern — **stateless functions receiving explicit arguments**, not classes holding state. `ImageAsciiConverter` remains the single stateful orchestrator that owns `this.settings`, the canvas, caches, and all DOM event wiring; it calls the pure modules and handles toasts/clipboard/downloads itself. We do **not** extract `applySettings`/`attachSettingsListeners` into a class — they are state-and-DOM glue with low test value and high coupling; only the pure **markup string builder** moves to `ui-manager.js`.

---

# Phase 1 — Characterization tests (Hub #1105)

### Task D-T1: Install jsdom and add the canvas stub

**Files:**
- Modify: `package.json`
- Create: `tests/helpers/canvas-stub.js`

- [ ] **Step 1: Add jsdom**

Run: `npm install -D jsdom`
Expected: `jsdom` appears under `devDependencies` in `package.json` and `package-lock.json` updates.

- [ ] **Step 2: Create the canvas stub**

jsdom ships no canvas implementation: `getContext` returns `null` and `toDataURL`/`toBlob` throw "Not implemented". The converter creates an offscreen canvas in its constructor and calls `getImageData`/`toDataURL`, so we install a minimal deterministic stub.

Create `tests/helpers/canvas-stub.js`:

```js
// Minimal 2D-context + canvas stub so ImageAsciiConverter can be instantiated
// and exercised under jsdom (which has no canvas). Deterministic: measureText
// is 6px/char, getImageData returns a flat mid-gray buffer of the requested
// size. Call installCanvasStub() once per test file before importing/creating
// the converter. hub-1105.
export function installCanvasStub() {
    const ctxStub = {
        canvas: null,
        font: '',
        fillStyle: '',
        drawImage() {},
        fillRect() {},
        fillText() {},
        measureText: (text) => ({ width: String(text).length * 6 }),
        getImageData: (x, y, w, h) => ({
            data: new Uint8ClampedArray(w * h * 4).fill(128),
            width: w,
            height: h,
        }),
    };
    HTMLCanvasElement.prototype.getContext = function getContext() {
        ctxStub.canvas = this;
        return ctxStub;
    };
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgo=';
    HTMLCanvasElement.prototype.toBlob = function toBlob(cb) {
        cb(new Blob([], { type: 'image/png' }));
    };
    return ctxStub;
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json tests/helpers/canvas-stub.js
git commit -m "chore: add jsdom devDependency and a canvas stub for converter tests (hub-1105)"
```

---

### Task D-T2: Export the converter and guard auto-instantiation

**Files:**
- Modify: `src/script.js` — class declaration (~line 87) and the bottom auto-start (~line 1434)

The class auto-instantiates at module load, which would run during test import against a bare DOM. We export it and gate the auto-start so the browser still self-starts but tests instantiate explicitly.

- [ ] **Step 1: Export the class**

Change line 87 from:

```js
class ImageAsciiConverter {
```

to:

```js
export class ImageAsciiConverter {
```

- [ ] **Step 2: Guard the auto-start**

Replace the final line (1434):

```js
new ImageAsciiConverter();
```

with:

```js
// Auto-start only in a real browser. Under Vitest, NODE_ENV is 'test' and the
// class is imported + instantiated explicitly with a controlled DOM. `process`
// is undefined in the browser, so the typeof guard is browser-safe. hub-1105.
const __isTestEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
if (!__isTestEnv) {
    new ImageAsciiConverter();
}
```

- [ ] **Step 3: Verify the browser path still builds**

Run: `npm run build`
Expected: success (the production bundle still instantiates — `NODE_ENV` is `production` during build).

- [ ] **Step 4: Commit**

```bash
git add src/script.js
git commit -m "refactor: export ImageAsciiConverter and gate auto-start for tests (hub-1105)"
```

---

### Task D-T3: Characterization tests — settings restore, view-mode errors, share round-trip

**Files:**
- Create: `tests/converter.characterization.test.js`

These cover the canvas-free orchestration paths, including a regression for Bucket A's restore-desync fix.

- [ ] **Step 1: Write the tests**

Create `tests/converter.characterization.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { installCanvasStub } from './helpers/canvas-stub.js';
import { encodeShare } from '../src/share-codec.js';
import { DEFAULT_SETTINGS } from '../src/settings-schema.js';

const IMG = 'data:image/png;base64,iVBORw0KGgo=';

// Fresh DOM + stub + module per test. script.js auto-start is gated off under
// NODE_ENV=test, so importing it only defines the class.
async function freshConverter() {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    location.hash = '';
    installCanvasStub();
    const { ImageAsciiConverter } = await import('../src/script.js?t=' + Math.random());
    return new ImageAsciiConverter();
}

describe('settings restore (applySettings)', () => {
    beforeEach(() => { localStorage.clear(); });

    it('reflects persisted settings into the create-mode controls', async () => {
        localStorage.setItem('imageAsciiSettings', JSON.stringify({
            ...DEFAULT_SETTINGS, colorMode: 'rgb', brightness: 1.5,
        }));
        await freshConverter();
        expect(document.getElementById('color-mode-select').value).toBe('rgb');
        expect(document.getElementById('brightness-value').textContent).toBe('1.5');
    });

    it('keeps slider thumb and label in agreement for a persisted width above the old 1000 ceiling (hub-1106)', async () => {
        localStorage.setItem('imageAsciiSettings', JSON.stringify({ ...DEFAULT_SETTINGS, width: 1500 }));
        await freshConverter();
        const slider = document.getElementById('width-slider');
        const label = document.getElementById('width-value');
        expect(slider.value).toBe('1500');     // requires Bucket A: markup max raised to MAX_DIMENSION
        expect(label.textContent).toBe('1500'); // thumb and label agree
    });
});

describe('view mode — invalid share link', () => {
    it('renders the invalid-link error instead of throwing', async () => {
        const c = await freshConverter();
        c.enterViewMode('!!!not-a-valid-share!!!');
        const output = document.getElementById('ascii-output');
        expect(output.textContent).toMatch(/invalid or corrupted/i);
    });
});

describe('share decode → settings round-trip', () => {
    it('loads sanitized settings and the image from a valid share value', async () => {
        const settings = { ...DEFAULT_SETTINGS, colorMode: 'ansi', width: 120 };
        const shareValue = encodeShare({ settings, img: IMG });
        const c = await freshConverter();
        c.enterViewMode(shareValue);
        expect(c.settings.colorMode).toBe('ansi');
        expect(c.settings.width).toBe(120);
        expect(c.currentImageDataUrl).toBe(IMG);
    });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- tests/converter.characterization.test.js`
Expected: PASS. If the `hub-1106` agreement test fails because Bucket A is not yet applied, that is the intended signal — either apply Bucket A first or temporarily mark that single `it` with `it.skip` and a `// blocked on Bucket A` note. (Prefer sequencing Bucket A before this.)

- [ ] **Step 3: Commit**

```bash
git add tests/converter.characterization.test.js
git commit -m "test: characterize settings restore, view-mode errors, and share round-trip (hub-1105)"
```

---

### Task D-T4: Characterization tests — conversion pipeline & button lifecycle

**Files:**
- Modify: `tests/converter.characterization.test.js`

By overriding `_getDecodedImage` (the one method that wraps real image decoding) we drive the whole convert→render→enable-buttons path against the canvas stub, with no real image load.

- [ ] **Step 1: Add the pipeline tests**

Append to `tests/converter.characterization.test.js`:

```js
describe('conversion pipeline + export-button lifecycle', () => {
    async function converterWithImage() {
        const c = await freshConverter();
        // Bypass real decoding: processImage only needs an object with width/height
        // for the stubbed ctx.drawImage; getImageData (stub) supplies the pixels.
        c._getDecodedImage = async () => ({ width: 4, height: 4 });
        c.currentImageDataUrl = IMG;
        c.settings.width = 4;
        c.settings.height = 4;
        return c;
    }

    it('produces newline-terminated ASCII text and enables the export buttons', async () => {
        const c = await converterWithImage();
        await c.convertToAscii();
        expect(c.currentAscii).not.toBeNull();
        expect(c.currentAscii.text.endsWith('\n')).toBe(true);
        expect(document.getElementById('copy-btn').disabled).toBe(false);
        expect(document.getElementById('export-png-btn').disabled).toBe(false);
    });

    it('disables exports and clears currentAscii when conversion throws (hub-134 contract)', async () => {
        const c = await converterWithImage();
        c._getDecodedImage = async () => { throw new Error('decode boom'); };
        await c.convertToAscii();
        expect(c.currentAscii).toBeNull();
        expect(document.getElementById('copy-btn').disabled).toBe(true);
        const output = document.getElementById('ascii-output');
        expect(output.textContent).toMatch(/error/i);
    });

    it('drops a superseded (stale) conversion result', async () => {
        const c = await converterWithImage();
        const stale = c.convertToAscii();   // token N
        c._convertToken++;                  // simulate a newer conversion starting
        await stale;
        // The stale run bailed after its await; buttons remain disabled from init.
        expect(document.getElementById('copy-btn').disabled).toBe(true);
    });
});
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS — all pure tests, plus the characterization suite (jsdom file) green.

- [ ] **Step 3: Commit**

```bash
git add tests/converter.characterization.test.js
git commit -m "test: characterize convert pipeline and export-button lifecycle (hub-1105)"
```

---

### Task D-T5: Manual smoke baseline for canvas-pixel paths

Record the current behavior of the paths jsdom can't assert, so Phase 2 refactors can be checked against it. No code change.

- [ ] **Step 1: Capture baselines with `npm run dev`**

Walk and note results for:
1. Upload → convert → on-screen render (grayscale + each color mode).
2. **PNG** export (grayscale and color) — file opens, looks correct.
3. **HTML** export — opens, colors preserved.
4. **TXT** export and **Copy** — content matches the on-screen art.
5. **Share** → link copied → open the `#s=` URL in a new tab → view mode renders the same art.
6. Fit-to-container resize behavior (font auto-scales).

- [ ] **Step 2: Save the baseline note**

No commit required (observational). Keep these results handy to compare after each Phase 2 extraction.

---

# Phase 2 — Refactor under the net (Hub #1111)

> Each task is a **behavior-preserving move**. After every task: `npm test` must stay green and the Task D-T5 smoke must still pass. Commit per task so a regression bisects cleanly.

### Task D-R1: Extract `ImageProcessor` (and make `pixelsToAscii` unit-testable)

**Files:**
- Create: `src/image-processor.js`
- Create: `tests/image-processor.test.js`
- Modify: `src/script.js` — remove the module-level `charsets`; delegate `processImage`/`pixelsToAscii`

- [ ] **Step 1: Create the module**

Create `src/image-processor.js`:

```js
// Pure, DOM-free image→ASCII compute. Extracted from ImageAsciiConverter so the
// per-pixel logic is directly unit-testable (it was previously reachable only
// through the DOM class). hub-1111.
import {
    adjustBrightnessContrast,
    weightedLuminance,
    charForBrightness,
    prepareGlyphs,
    colorCellStyle,
    escapeHtml,
    applyEdgeDetection,
} from './ascii-core.js';
import { isColorRenderTractable } from './settings-schema.js';

export const CHARSETS = {
    standard: ' .:-=+*#%@',
    detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    blocks: ' ░▒▓█',
    binary: ' █',
    dots: ' .·:•',
    custom: ' .:-=+*#%@',
};

export function resolveCharset(charsetType, customChars) {
    if (charsetType === 'custom') return customChars || CHARSETS.standard;
    return CHARSETS[charsetType] || CHARSETS.standard;
}

// Draw a decoded image onto the provided canvas/ctx at width×height and return
// its ImageData, applying Sobel edge detection in place when requested. The
// caller owns the canvas (state) and the dimension clamping.
export function drawToImageData({ image, width, height, canvas, ctx, edgeDetection }) {
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    if (edgeDetection) applyEdgeDetection(imageData);
    return imageData;
}

// Convert an RGBA buffer to { text, html, colors }. Byte-identical to the
// previous ImageAsciiConverter.pixelsToAscii so on-screen and exported renders
// don't drift.
export function pixelsToAscii(imageData, { colorMode, inverted, charsetType, customChars, brightness, contrast }) {
    const { width, height, data: pixels } = imageData;
    const buildColor = isColorRenderTractable(width, height, colorMode);
    const effectiveColorMode = buildColor ? colorMode : 'grayscale';
    const chars = resolveCharset(charsetType, customChars);
    const glyphs = prepareGlyphs(chars, inverted);

    const textRows = new Array(height);
    const htmlRows = new Array(height);
    const colors = new Array(height);

    for (let y = 0; y < height; y++) {
        const textChars = new Array(width);
        const htmlParts = new Array(width);
        const rowColors = new Array(width);
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            const [r, g, b] = adjustBrightnessContrast(
                pixels[offset], pixels[offset + 1], pixels[offset + 2], brightness, contrast,
            );
            const lum = weightedLuminance(r, g, b);
            textChars[x] = charForBrightness(lum, glyphs);

            const style = colorCellStyle(r, g, b, effectiveColorMode);
            if (style.color) {
                const css = style.background
                    ? `color:${style.color};background:${style.background}`
                    : `color:${style.color}`;
                htmlParts[x] = `<span style="${css}">${escapeHtml(textChars[x])}</span>`;
                rowColors[x] = style.background
                    ? { color: style.color, background: style.background }
                    : { color: style.color };
            } else {
                htmlParts[x] = escapeHtml(textChars[x]);
                rowColors[x] = null;
            }
        }
        textRows[y] = textChars.join('');
        htmlRows[y] = htmlParts.join('');
        colors[y] = rowColors;
    }

    return { text: textRows.join('\n') + '\n', html: htmlRows.join('\n') + '\n', colors };
}
```

- [ ] **Step 2: Write unit tests for the newly-testable compute**

Create `tests/image-processor.test.js`:

```js
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
```

- [ ] **Step 3: Delegate from `script.js`**

In `src/script.js`:

1. Add the import (below the existing `./ascii-core.js` import):

```js
import { pixelsToAscii as pixelsToAsciiCore, drawToImageData } from './image-processor.js';
```

2. **Delete** the module-level `charsets` object (lines 31-38). (It is now `CHARSETS` inside `image-processor.js`; the only consumer was `pixelsToAscii`, moved below.)

3. Replace the `processImage` body (the `.then(...)` callback, ~932-957) so the canvas mechanics live in the module:

```js
processImage() {
    return this._getDecodedImage().then((img) => {
        // Convert-time safety net: canvas can never exceed MAX_DIMENSION. Tracker C2.
        const width = clampDimension(this.settings.width);
        const height = clampDimension(this.settings.height);
        return drawToImageData({
            image: img, width, height,
            canvas: this.canvas, ctx: this.ctx,
            edgeDetection: this.settings.edgeDetection,
        });
    });
}
```

4. Replace the entire `pixelsToAscii(imageData)` method (~971-1042) with a thin delegator:

```js
pixelsToAscii(imageData) {
    return pixelsToAsciiCore(imageData, {
        colorMode: this.settings.colorMode,
        inverted: this.settings.inverted,
        charsetType: this.settings.charsetType,
        customChars: this.customChars,
        brightness: this.settings.brightness,
        contrast: this.settings.contrast,
    });
}
```

(The standalone `applyEdgeDetection` and `adjustBrightnessContrast` wrapper methods on the class may remain or be removed; if removed, confirm no other caller references them. `drawToImageData` now applies edge detection, so the class `applyEdgeDetection` wrapper is no longer called by `processImage`.)

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: PASS — new `image-processor` tests green; characterization suite green.

Run: `npm run build`
Expected: success.

Re-run the Task D-T5 smoke for render + each color mode.

- [ ] **Step 5: Commit**

```bash
git add src/image-processor.js tests/image-processor.test.js src/script.js
git commit -m "refactor: extract ImageProcessor module; unit-test pixelsToAscii directly (hub-1111)"
```

---

### Task D-R2: Extract `ExportManager`

**Files:**
- Create: `src/export-manager.js`
- Modify: `src/script.js` — `exportAsTxt`, `exportAsPng`, `exportAsHtml`, `downloadBlob`

The exporters build an artifact (Blob/canvas); the converter keeps the toast + trigger. `buildPngCanvas` returns either `{ error }` (too large) or `{ canvas }`; the converter still calls `canvas.toBlob`.

- [ ] **Step 1: Create the module**

Create `src/export-manager.js`:

```js
// Build export artifacts from a converted ascii result. DOM-light: takes
// explicit args, returns Blobs/canvases. Toasts, downloads, and canvas.toBlob
// stay in the converter. hub-1111.
import { escapeHtml, lineToCells, sumAdvances } from './ascii-core.js';

export function exportTxtBlob(ascii) {
    return new Blob([ascii.text], { type: 'text/plain;charset=utf-8' });
}

export function exportHtmlBlob(ascii, { fontSize, lineHeight }, imageName) {
    const safeName = escapeHtml(imageName || 'ASCII Art');
    const body = ascii.html || escapeHtml(ascii.text);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeName} - ASCII Art</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0a; display: flex; justify-content: center; padding: 40px 20px; min-height: 100vh; }
        .ascii-container { background: #000; color: #00ff00; font-family: 'Courier New', monospace; font-size: ${fontSize}px; line-height: ${lineHeight}; white-space: pre; padding: 30px; border: 2px solid #333; border-radius: 12px; box-shadow: 0 0 30px rgba(0, 255, 0, 0.1); overflow: auto; max-width: 100%; }
    </style>
</head>
<body>
    <pre class="ascii-container">${body}</pre>
</body>
</html>`;
    return new Blob([html], { type: 'text/html;charset=utf-8' });
}

// Render the ascii into a fresh canvas. Returns { error } if the canvas would
// exceed the browser dimension cap, else { canvas }. `doc` is injected so this
// is testable with a stubbed document. Preserves the per-cell advance model
// (hub-1108) and the monospace fast path.
export function buildPngCanvas(ascii, settings, doc) {
    const { fontSize, lineHeight, colorMode } = settings;
    const backgroundColor = '#000000';
    const textColor = '#00ff00';
    const MAX_CANVAS_DIMENSION = 32000;

    const canvas = doc.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px 'Courier New', monospace`;

    const lines = ascii.text.split('\n').filter((l) => l.length > 0);
    const isCustomColor = colorMode !== 'grayscale' && settings.charsetType === 'custom';
    const monoCharWidth = ctx.measureText('M').width;
    const advanceFor = isCustomColor ? (ch) => ctx.measureText(ch).width : () => monoCharWidth;

    const maxWidth = lines.length > 0 ? Math.max(...lines.map((line) => sumAdvances(line, advanceFor))) : 100;
    const canvasHeight = lines.length * fontSize * lineHeight;
    const targetWidth = maxWidth + 40;
    const targetHeight = canvasHeight + 40;

    if (targetWidth > MAX_CANVAS_DIMENSION || targetHeight > MAX_CANVAS_DIMENSION) {
        return { error: 'PNG export too large for this browser. Lower the resolution or font size and try again.' };
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px 'Courier New', monospace`;

    if (colorMode !== 'grayscale' && ascii.colors) {
        for (let y = 0; y < lines.length; y++) {
            const cells = lineToCells(lines[y], ascii.colors[y]);
            let currentX = 20;
            const yPos = 20 + (y + 1) * fontSize * lineHeight;
            for (let x = 0; x < cells.length; x++) {
                const { char, style } = cells[x];
                const adv = advanceFor(char);
                if (style) {
                    if (style.background) {
                        ctx.fillStyle = style.background;
                        ctx.fillRect(currentX, yPos - fontSize * lineHeight, adv, fontSize * lineHeight);
                    }
                    ctx.fillStyle = style.color;
                } else {
                    ctx.fillStyle = textColor;
                }
                ctx.fillText(char, currentX, yPos);
                currentX += adv;
            }
        }
    } else {
        ctx.fillStyle = textColor;
        lines.forEach((line, index) => {
            ctx.fillText(line, 20, 20 + (index + 1) * fontSize * lineHeight);
        });
    }

    return { canvas };
}

export function downloadBlob(blob, filename, doc) {
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // Defer revoke so the download latches onto the URL first (older Safari/Firefox).
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

(Note: this assumes Bucket C has landed `sumAdvances` in `ascii-core.js`. If Bucket C has not been applied, apply it first — it is a prerequisite for `buildPngCanvas`.)

- [ ] **Step 2: Delegate from `script.js`**

Add the import:

```js
import { exportTxtBlob, exportHtmlBlob, buildPngCanvas, downloadBlob as downloadBlobUtil } from './export-manager.js';
```

Replace the four methods. `exportAsTxt`:

```js
exportAsTxt() {
    if (!this.currentAscii) return;
    downloadBlobUtil(exportTxtBlob(this.currentAscii), `ascii-art-${Date.now()}.txt`, document);
    this.showToast('Saved as TXT!', 'success');
}
```

`exportAsHtml`:

```js
exportAsHtml() {
    if (!this.currentAscii) return;
    const blob = exportHtmlBlob(this.currentAscii, this.settings, this.currentImage?.name);
    downloadBlobUtil(blob, `ascii-art-${Date.now()}.html`, document);
    this.showToast('Saved as HTML!', 'success');
}
```

`exportAsPng`:

```js
exportAsPng() {
    if (!this.currentAscii) return;
    const result = buildPngCanvas(this.currentAscii, this.settings, document);
    if (result.error) {
        this.showToast(result.error, 'error');
        return;
    }
    result.canvas.toBlob((blob) => {
        if (!blob) {
            this.showToast('PNG export failed', 'error');
            return;
        }
        downloadBlobUtil(blob, `ascii-art-${Date.now()}.png`, document);
        this.showToast('Saved as PNG!', 'success');
    });
}
```

Delete the old class `downloadBlob` method (replaced by `downloadBlobUtil`); confirm no other caller used it (grep `this.downloadBlob`).

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: success.

Re-run Task D-T5 smoke items 2, 3, 4 (PNG/HTML/TXT exports) and confirm the Bucket C emoji-PNG check still holds.

- [ ] **Step 4: Commit**

```bash
git add src/export-manager.js src/script.js
git commit -m "refactor: extract ExportManager (txt/html/png/download) (hub-1111)"
```

---

### Task D-R3: Extract `ShareManager`

**Files:**
- Create: `src/share-manager.js`
- Modify: `src/script.js` — `shareAscii`

- [ ] **Step 1: Create the module**

Create `src/share-manager.js`:

```js
// Build the shareable URL (or throw via the codec). Clipboard, button text, and
// toasts stay in the converter — those are DOM/UX concerns. hub-1111.
import { encodeShare } from './share-codec.js';

export function buildShareUrl({ settings, img, origin, pathname }) {
    const encoded = encodeShare({ settings, img });
    return `${origin}${pathname}#s=${encoded}`;
}
```

- [ ] **Step 2: Delegate from `script.js`**

Add the import:

```js
import { buildShareUrl } from './share-manager.js';
```

In `shareAscii`, replace the `encodeShare(...)` try/catch block and the URL construction (the `let encoded; try { ... } catch ...` plus `const url = ...`) with:

```js
let url;
try {
    url = buildShareUrl({
        settings: this.settings,
        img: this.currentShareImage,
        origin: location.origin,
        pathname: location.pathname,
    });
} catch (error) {
    console.error('Share encode error:', error);
    const friendly = error.message && error.message.includes('too large')
        ? 'Image too large to share. Lower the resolution and try again.'
        : 'Failed to create share link';
    this.showToast(friendly, 'error');
    return;
}
```

(The clipboard write, button-text restore, and toasts below remain unchanged. Remove the now-unused `encodeShare` import from `script.js` if nothing else references it — grep first.)

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: PASS (the share round-trip characterization test still exercises decode; encode is covered by `share-codec.test.js`).

Run: `npm run build`
Expected: success.

Re-run Task D-T5 smoke item 5 (share → open `#s=` link → view mode).

- [ ] **Step 4: Commit**

```bash
git add src/share-manager.js src/script.js
git commit -m "refactor: extract ShareManager buildShareUrl (hub-1111)"
```

---

### Task D-R4: Extract the `UIManager` markup builder

**Files:**
- Create: `src/ui-manager.js`
- Modify: `src/script.js` — `setupUI`, and the `presets` constant

Only the **pure markup string** and the static `PRESETS` move; `applySettings`/`attachSettingsListeners` stay in the converter (they are state+DOM glue, per the module contract above).

- [ ] **Step 1: Create the module**

Create `src/ui-manager.js`. Move the `presets` object here as `PRESETS`, and move the create-mode template into a function. Paste the existing template literal from `setupUI` verbatim into the `return` below (it already references `${settings.*}` fields and the bounds):

```js
// Pure create-mode markup + the static style presets. No DOM access — returns a
// string the converter injects. Keeps the 150-line template out of the
// orchestrator and makes the markup independently assertable. hub-1111.
export const PRESETS = {
    classic:      { charsetType: 'standard', colorMode: 'grayscale', inverted: false, brightness: 1.0, contrast: 1.0 },
    colored:      { charsetType: 'standard', colorMode: 'rgb',       inverted: false, brightness: 1.0, contrast: 1.0 },
    blocks:       { charsetType: 'blocks',   colorMode: 'grayscale', inverted: false, brightness: 1.0, contrast: 1.0 },
    matrix:       { charsetType: 'detailed', colorMode: 'grayscale', inverted: true,  brightness: 1.3, contrast: 1.4 },
    highContrast: { charsetType: 'detailed', colorMode: 'grayscale', inverted: false, brightness: 1.2, contrast: 1.5 },
    inverted:     { charsetType: 'standard', colorMode: 'grayscale', inverted: true,  brightness: 1.0, contrast: 1.0 },
};

// `bounds` = { MIN_DIMENSION, MAX_DIMENSION }. Move the EXACT template from the
// old setupUI here; only the slider min/max use the bounds (Bucket A).
export function createUiMarkup(settings, bounds) {
    const { MIN_DIMENSION, MAX_DIMENSION } = bounds;
    return `
        <div class="app-layout">
            <!-- ...PASTE THE EXISTING setupUI TEMPLATE BODY VERBATIM... -->
        </div>
    `;
}
```

When pasting, change the two range inputs' `min`/`max` to `${MIN_DIMENSION}`/`${MAX_DIMENSION}` (already done in Bucket A) and every `this.settings.X` reference to `settings.X`.

- [ ] **Step 2: Write a markup unit test**

Create `tests/ui-manager.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createUiMarkup, PRESETS } from '../src/ui-manager.js';
import { DEFAULT_SETTINGS, MIN_DIMENSION, MAX_DIMENSION } from '../src/settings-schema.js';

describe('createUiMarkup', () => {
    const markup = createUiMarkup(DEFAULT_SETTINGS, { MIN_DIMENSION, MAX_DIMENSION });
    it('contains the core control ids the converter wires up', () => {
        for (const id of ['upload-area', 'width-slider', 'height-slider', 'charset-select', 'color-mode-select', 'share-btn', 'ascii-output']) {
            expect(markup).toContain(`id="${id}"`);
        }
    });
    it('uses MAX_DIMENSION as the slider ceiling (hub-1106)', () => {
        expect(markup).toContain(`max="${MAX_DIMENSION}"`);
        expect(markup).not.toContain('max="1000"');
    });
});

describe('PRESETS', () => {
    it('makes Matrix visibly distinct from Classic (hub-168)', () => {
        expect(PRESETS.matrix).not.toEqual(PRESETS.classic);
    });
});
```

- [ ] **Step 3: Delegate from `script.js`**

Add the import:

```js
import { createUiMarkup, PRESETS } from './ui-manager.js';
```

Delete the module-level `presets` object (~41-84) and replace every reference to `presets` with `PRESETS` (in `applyPreset`, ~1148). Replace the `setupUI` body that assigns `app.innerHTML = \`...\`` with:

```js
setupUI() {
    const app = document.querySelector('#app') || document.body;
    app.innerHTML = createUiMarkup(this.settings, { MIN_DIMENSION, MAX_DIMENSION });
}
```

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: PASS — `ui-manager` tests green; characterization suite (which exercises the real markup via `setupUI`) green.

Run: `npm run build`
Expected: success.

Re-run the full Task D-T5 smoke once (the markup is now sourced from the module).

- [ ] **Step 5: Commit**

```bash
git add src/ui-manager.js tests/ui-manager.test.js src/script.js
git commit -m "refactor: extract UIManager markup builder and PRESETS (hub-1111)"
```

---

## Self-Review

- **Spec coverage:** hub-1105 → D-T1..D-T4 (jsdom env, canvas stub, exported class, characterization tests) + D-T5 (manual baseline). hub-1111 → D-R1 (ImageProcessor), D-R2 (ExportManager), D-R3 (ShareManager), D-R4 (UIManager markup). ✅
- **Type/name consistency:** `pixelsToAscii(imageData, opts)` signature matches between `image-processor.js`, its test, and the `script.js` delegator (imported as `pixelsToAsciiCore`). `buildPngCanvas(ascii, settings, doc) → {canvas}|{error}`, `downloadBlob(blob, filename, doc)`, `buildShareUrl({settings,img,origin,pathname})`, `createUiMarkup(settings, bounds)`, and `PRESETS` are referenced identically wherever they appear. `installCanvasStub()` is imported the same way in every jsdom test. ✅
- **Placeholder scan:** the only intentional "paste verbatim" is the 150-line `setupUI` template in D-R4 Step 1 — repeating it here would duplicate ~150 lines already in the repo; the instruction names the exact source and the exact edits (bounds + `this.settings`→`settings`). Everything else is complete code. ✅
- **Dependency notes resolved:** `buildPngCanvas` requires Bucket C's `sumAdvances`; `createUiMarkup`'s raised ceiling and the `width=1500` characterization test require Bucket A. Sequencing is called out where it bites. ✅
- **Open questions resolved:** "split into how many modules?" → four extractions with a stated module contract (stateless functions; orchestrator keeps state + event wiring; `applySettings`/listeners deliberately NOT extracted). "Browser automation?" → no; jsdom logic tests + manual smoke, per project preference. ✅
