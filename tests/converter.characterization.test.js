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
    // NOTE: do NOT clear localStorage here — the settings-restore tests seed
    // localStorage immediately before calling freshConverter(), and the
    // converter reads it in its constructor. Per-test isolation is handled by
    // the describe-level beforeEach (and each test seeds the store it needs).
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
