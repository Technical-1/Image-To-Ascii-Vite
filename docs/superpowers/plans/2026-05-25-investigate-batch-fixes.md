# Investigate Batch Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 8 findings produced by the 2026-05-25 `/investigate` run (`.project-hub-tasks.json`): one accessibility blocker, five robustness/perf gaps, and two low-priority polish items — all in the UI layer (`src/script.js`), with two new pure helpers extracted to existing pure-function modules so they're covered by Vitest.

**Architecture:** Most fixes are surgical edits in `src/script.js`. Two changes (HTML escaping per character on the hot path; cell-budget gate for color rendering) are large enough that the pure logic moves to `src/ascii-core.js` and `src/settings-schema.js` so the existing Vitest suite can cover them — matching the project's established pattern (the test suite imports the real production functions, never copies). No new test infrastructure; no DOM tests added.

**Tech Stack:** Vanilla JS (ES modules), Vite 8, Vitest 4. No new dependencies.

**Out of scope:** Adding jsdom / Playwright for UI-layer tests (that is the D1 item in `docs/STATUS-TRACKER.md` and is its own future plan).

---

## File Structure

**Modified:**
- `src/ascii-core.js` — add pure `escapeHtml(str)` helper
- `src/settings-schema.js` — add `MAX_COLOR_CELLS` constant + pure `isColorRenderTractable(width, height, colorMode)` helper
- `src/script.js` — keyboard a11y on upload area; swap `escapeHtml` to pure helper; gate color rendering on cell budget; defer `URL.revokeObjectURL`; guard `navigator.clipboard` access; cap `fitOutputToContainer` RAF retries; declare `;charset=utf-8` on txt/html Blob MIMEs; floor slider max at `MIN_DIMENSION`
- `tests/ascii-conversion.test.js` — add `escapeHtml` tests
- `tests/settings-schema.test.js` — add `isColorRenderTractable` tests

**Not modified:**
- `index.html` — upload area is rendered by `setupUI()`'s template string, not in static HTML
- `package.json`, `vite.config.js`, `vercel.json` — no config changes needed

---

## Task 1: Make upload area keyboard-accessible

**Why:** `#upload-area` is a `<div>` with a click handler but no `role`, `tabindex`, `aria-label`, or keyboard handler. The actual `<input type="file" hidden>` is out of the a11y tree. Keyboard-only and screen-reader users currently cannot upload an image.

**Files:**
- Modify: `src/script.js` — the `setupUI()` template at the upload-area block, and `attachEventListeners()` at the upload area listener block

- [ ] **Step 1.1: Update the upload-area markup to be focusable and labelled**

In `src/script.js` inside `setupUI()`, find the upload-area block (currently the line starting `<div class="upload-area" id="upload-area">`) and change the opening tag to:

```html
<div class="upload-area" id="upload-area" role="button" tabindex="0" aria-label="Upload image. Press Enter or Space to choose a file.">
```

- [ ] **Step 1.2: Add a keyboard handler to trigger the file picker**

In `src/script.js` inside `attachEventListeners()`, immediately after the existing line `uploadArea.addEventListener('click', () => imageInput.click());`, add:

```js
        uploadArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                imageInput.click();
            }
        });
```

- [ ] **Step 1.3: Run the test suite to confirm nothing regressed**

Run: `npm test`
Expected: `Test Files  3 passed (3) / Tests  63 passed (63)`.

- [ ] **Step 1.4: Build to confirm it still ships**

Run: `npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 1.5: Commit**

```bash
git add src/script.js
git commit -m "fix: make upload area keyboard-accessible

Add role='button', tabindex='0', an aria-label, and an Enter/Space
keydown handler to #upload-area. Previously keyboard-only and
screen-reader users had no way to trigger the file picker because the
underlying <input type='file' hidden> is out of the a11y tree.
"
```

---

## Task 2: Extract `escapeHtml` to a pure function, drop the per-character DOM allocation

**Why:** `escapeHtml` currently creates a `<div>`, sets `textContent`, reads `.innerHTML`. `pixelsToAscii` calls it once per pixel. At the clamp ceiling 2000×2000 with a color mode that's 4 million DOM allocations per conversion. A string replace is several orders of magnitude faster and removes a hot-path GC source.

**Files:**
- Modify: `src/ascii-core.js` — add `escapeHtml`
- Modify: `src/script.js` — drop the method body, delegate to the import
- Test: `tests/ascii-conversion.test.js`

- [ ] **Step 2.1: Write the failing test**

Append to `tests/ascii-conversion.test.js`:

```js
import { escapeHtml } from '../src/ascii-core.js';

describe('escapeHtml', () => {
    it('escapes the five HTML-sensitive characters', () => {
        expect(escapeHtml('<')).toBe('&lt;');
        expect(escapeHtml('>')).toBe('&gt;');
        expect(escapeHtml('&')).toBe('&amp;');
        expect(escapeHtml('"')).toBe('&quot;');
        expect(escapeHtml("'")).toBe('&#39;');
    });
    it('escapes all five together in one pass', () => {
        expect(escapeHtml(`<a href="x" title='y'>&</a>`))
            .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    });
    it('preserves unicode (no escaping needed)', () => {
        expect(escapeHtml('░▒▓█ 日本語 🎨')).toBe('░▒▓█ 日本語 🎨');
    });
    it('returns empty string for empty input', () => {
        expect(escapeHtml('')).toBe('');
    });
    it('coerces non-string input to string', () => {
        expect(escapeHtml(0)).toBe('0');
        expect(escapeHtml(null)).toBe('null');
        expect(escapeHtml(undefined)).toBe('undefined');
    });
});
```

- [ ] **Step 2.2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `escapeHtml is not a function` (or import error).

- [ ] **Step 2.3: Add `escapeHtml` to `src/ascii-core.js`**

Append at the bottom of `src/ascii-core.js`:

```js
/**
 * Escape the five HTML-sensitive characters. Pure string replace — used on
 * the per-pixel hot path in `pixelsToAscii`, so building a <div> per call
 * (the previous implementation) would burn millions of DOM allocations at
 * the max grid size.
 */
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
```

- [ ] **Step 2.4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, total now 68 tests.

- [ ] **Step 2.5: Swap the consumer in `src/script.js`**

In `src/script.js`, find the existing import block at the top:

```js
import {
    adjustBrightnessContrast,
    weightedLuminance,
    charForBrightness,
    ansiColor,
    applyEdgeDetection,
} from './ascii-core.js';
```

Change to add `escapeHtml`:

```js
import {
    adjustBrightnessContrast,
    weightedLuminance,
    charForBrightness,
    ansiColor,
    applyEdgeDetection,
    escapeHtml,
} from './ascii-core.js';
```

Then find the existing method definition:

```js
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
```

Delete those 5 lines entirely.

Then find every `this.escapeHtml(` callsite in `src/script.js` (there are 6 of them — in `pixelsToAscii`'s rgb/full-rgb/ansi/default branches, in `toAnsiColor`, and in `exportAsHtml`'s `imageName` and the `currentAscii.text` fallback) and rename `this.escapeHtml(` to `escapeHtml(`. Use Edit's `replace_all` on the token `this.escapeHtml(` → `escapeHtml(` within the file.

- [ ] **Step 2.6: Run the test suite and build**

Run: `npm test && npm run build`
Expected: 68 tests pass, build succeeds.

- [ ] **Step 2.7: Commit**

```bash
git add src/ascii-core.js src/script.js tests/ascii-conversion.test.js
git commit -m "perf: drop per-character DOM allocation from escapeHtml

The old escapeHtml created a <div>, set textContent, and read its HTML
on every call. pixelsToAscii invokes it once per pixel; at the 2000x2000
clamp ceiling with a color mode that was 4M DOM allocations per
conversion. Move to a pure string-replace exported from ascii-core.js so
the existing test suite covers it and the hot path stays allocation-free.
"
```

---

## Task 3: Gate color rendering on a cell budget

**Why:** With colorMode != 'grayscale' and the canvas clamped at 2000×2000, `pixelsToAscii` can build a 4-million-`<span>` HTML string (~150-200 MB) which then goes through the DOM parser via the output element's HTML setter. That OOMs mobile Safari and freezes desktop. The C2 canvas-clamp protects the pixel buffer; this protects the DOM render step.

**Threshold rationale:** 500,000 cells (~700×700) is the heuristic ceiling where the resulting `<span>` DOM is still under ~150 MB on a typical browser. Above that we fall back to plain text and show a one-time toast.

**Files:**
- Modify: `src/settings-schema.js` — add `MAX_COLOR_CELLS` + `isColorRenderTractable`
- Modify: `src/script.js` — gate `pixelsToAscii`'s HTML build and `renderAscii`'s HTML write
- Test: `tests/settings-schema.test.js`

- [ ] **Step 3.1: Write the failing test**

Append to `tests/settings-schema.test.js`:

```js
import { MAX_COLOR_CELLS, isColorRenderTractable } from '../src/settings-schema.js';

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
```

- [ ] **Step 3.2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `MAX_COLOR_CELLS is not exported`.

- [ ] **Step 3.3: Add the constant and helper to `src/settings-schema.js`**

Append at the bottom of `src/settings-schema.js`:

```js
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
```

- [ ] **Step 3.4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, total now 73 tests.

- [ ] **Step 3.5: Gate the HTML build in `pixelsToAscii`**

In `src/script.js`, update the import line for settings-schema to include the new symbols:

```js
import { DEFAULT_SETTINGS, MAX_DIMENSION, clampDimension, sanitizeSettings, isColorRenderTractable } from './settings-schema.js';
```

Then in `pixelsToAscii`, find the top of the method where `colorMode`, `inverted`, `charsetType` are destructured. Right after that destructure, add:

```js
        // Above the cell budget we still produce text but skip the per-pixel
        // <span> HTML build — that string would be 150+ MB at 2000x2000 in a
        // color mode and OOM the tab. renderAscii detects and falls back to
        // textContent. See MAX_COLOR_CELLS in settings-schema.
        const buildColor = isColorRenderTractable(width, height, colorMode);
        const effectiveColorMode = buildColor ? colorMode : 'grayscale';
```

Then in the inner loop, change the existing `switch (colorMode) {` to `switch (effectiveColorMode) {`.

- [ ] **Step 3.6: Update `renderAscii` to show a toast on fallback**

In `src/script.js`, replace the existing `renderAscii(asciiContent)` method body up through (but not including) the `if (this.settings.fitToContainer)` block with:

```js
    renderAscii(asciiContent) {
        if (!asciiContent) return;

        const output = document.getElementById('ascii-output');
        const wantedColor = this.settings.colorMode !== 'grayscale';
        const tractable = isColorRenderTractable(
            this.settings.width,
            this.settings.height,
            this.settings.colorMode,
        );

        if (wantedColor && tractable) {
            // Safe: asciiContent.html is built in pixelsToAscii from numeric
            // pixel values + escapeHtml(char) only — never from link/network strings.
            output.innerHTML = asciiContent.html;
        } else {
            output.textContent = asciiContent.text;
            if (wantedColor && !tractable && !this._colorBudgetWarned) {
                this._colorBudgetWarned = true;
                this.showToast(
                    'Resolution too high for color rendering — showing grayscale. Lower resolution to use color.',
                    'error',
                );
                setTimeout(() => { this._colorBudgetWarned = false; }, 5000);
            }
        }

```

(Leave the existing `if (this.settings.fitToContainer) { ... } else { this.updateOutputStyle(); }` tail intact.)

- [ ] **Step 3.7: Initialize the warned-flag on the instance**

In `src/script.js`, in the constructor, find the existing `this._shareRestoreTimer = null;` line and immediately after it add:

```js
        // One-shot guard so the "color too heavy" toast doesn't fire on every
        // debounced re-render while the user is dragging a slider.
        this._colorBudgetWarned = false;
```

- [ ] **Step 3.8: Run the test suite and build**

Run: `npm test && npm run build`
Expected: 73 tests pass, build succeeds.

- [ ] **Step 3.9: Commit**

```bash
git add src/settings-schema.js src/script.js tests/settings-schema.test.js
git commit -m "fix: cap color rendering at 500k cells to prevent DOM OOM

Color modes build one <span> per pixel. At the 2000x2000 canvas clamp
ceiling that's 4M DOM nodes (~150 MB) — enough to crash mobile Safari
and freeze desktop. Add a 500k-cell budget; above it, pixelsToAscii
skips the per-pixel HTML build and renderAscii falls back to
textContent with a one-shot toast explaining the fallback.
"
```

---

## Task 4: Defer `URL.revokeObjectURL` until after the download fires

**Why:** `downloadBlob` revokes the object URL synchronously in the `finally` block, immediately after `a.click()` returns. In some browsers (older Safari, Firefox configurations) the download has not yet latched onto the URL when the synchronous click returns, and revoking it cancels the save.

**Files:**
- Modify: `src/script.js` — `downloadBlob` method

- [ ] **Step 4.1: Update `downloadBlob` to defer the revoke**

In `src/script.js`, replace the existing `downloadBlob` method:

```js
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        // Defer revoke so the download latches onto the URL first. Some
        // browsers (older Safari, certain Firefox configurations) cancel
        // the save if the URL is revoked synchronously after click().
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
```

- [ ] **Step 4.2: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 4.3: Commit**

```bash
git add src/script.js
git commit -m "fix: defer URL.revokeObjectURL so downloads latch onto the URL first

The previous finally-block revoke ran synchronously after a.click()
returned, which in some browser/version combos cancelled the download.
Defer with a 1s setTimeout — the navigation has started by then.
"
```

---

## Task 5: Guard `navigator.clipboard` access against `undefined`

**Why:** `navigator.clipboard.writeText(...).then(...).catch(...)` throws a synchronous `TypeError` if `navigator.clipboard` itself is undefined (insecure context, older browsers, sandboxed iframes). The `.catch` never sees it, so the user gets nothing.

**Files:**
- Modify: `src/script.js` — `copyAscii` and `shareAscii` methods

- [ ] **Step 5.1: Guard `copyAscii`**

In `src/script.js`, find the existing `copyAscii` method and replace it with:

```js
    copyAscii() {
        if (!this.currentAscii) return;

        if (!navigator.clipboard?.writeText) {
            this.showToast('Clipboard not available in this browser', 'error');
            return;
        }

        navigator.clipboard.writeText(this.currentAscii.text).then(() => {
            this.showToast('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Copy failed:', err);
            this.showToast('Failed to copy', 'error');
        });
    }
```

- [ ] **Step 5.2: Guard `shareAscii`'s clipboard call**

In `src/script.js`, in `shareAscii`, find the existing block that begins with `navigator.clipboard.writeText(url).then(() => {`. Immediately before that block, insert:

```js
        if (!navigator.clipboard?.writeText) {
            this.showToast('Clipboard not available — copy the URL from the address bar after navigating to it.', 'error');
            return;
        }

```

(Leave the existing `navigator.clipboard.writeText(url).then(...).catch(...)` block as-is. Only insert the guard above it.)

- [ ] **Step 5.3: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5.4: Commit**

```bash
git add src/script.js
git commit -m "fix: guard navigator.clipboard absence in copy/share paths

navigator.clipboard.writeText(...) throws a synchronous TypeError if
navigator.clipboard itself is undefined (insecure context, older
browsers, sandboxed iframes) — the .catch never sees it. Check
navigator.clipboard?.writeText up front and surface an actionable toast
instead of silently failing.
"
```

---

## Task 6: Cap `fitOutputToContainer`'s RAF retry

**Why:** When the container measures 0 (display:none, detached subtree, not-yet-painted tab), `fitOutputToContainer` schedules a single RAF retry guarded by `_fitRetryScheduled`. On the retry the flag is reset BEFORE the recursive call, so if the container is still 0 the recursive call re-enters the same branch, re-arms the flag, and schedules another RAF — forever.

**Files:**
- Modify: `src/script.js` — `fitOutputToContainer` and the constructor

- [ ] **Step 6.1: Add a retry counter on the instance**

In `src/script.js`, in the constructor, find the existing `this._colorBudgetWarned = false;` line (added in Task 3.7) and add immediately after it:

```js
        // Cap on fitOutputToContainer RAF retries. Without a cap, a
        // permanently-zero-size container (display:none, hidden tab,
        // detached subtree) would spin RAF forever.
        this._fitRetryCount = 0;
```

- [ ] **Step 6.2: Cap the retry loop in `fitOutputToContainer`**

In `src/script.js`, find the existing block inside `fitOutputToContainer`:

```js
        if (availableWidth <= 0 || availableHeight <= 0) {
            // Layout not measured yet (e.g. first view-mode paint): retry once
            // on the next frame rather than silently leaving text unsized.
            if (!this._fitRetryScheduled) {
                this._fitRetryScheduled = true;
                requestAnimationFrame(() => {
                    this._fitRetryScheduled = false;
                    this.fitOutputToContainer();
                });
            }
            return;
        }
```

Replace with:

```js
        if (availableWidth <= 0 || availableHeight <= 0) {
            // Layout not measured yet (e.g. first view-mode paint): retry on
            // the next frame, but cap retries at 10 so a permanently-hidden
            // container can't spin RAF forever.
            const MAX_FIT_RETRIES = 10;
            if (!this._fitRetryScheduled && this._fitRetryCount < MAX_FIT_RETRIES) {
                this._fitRetryScheduled = true;
                this._fitRetryCount += 1;
                requestAnimationFrame(() => {
                    this._fitRetryScheduled = false;
                    this.fitOutputToContainer();
                });
            }
            return;
        }
        // Successful measure — reset the counter so a later resize starts fresh.
        this._fitRetryCount = 0;
```

- [ ] **Step 6.3: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 6.4: Commit**

```bash
git add src/script.js
git commit -m "fix: cap fitOutputToContainer RAF retries at 10

Without a cap, a permanently-zero-size container (display:none, hidden
tab, detached subtree) would re-enter the retry branch on every
animation frame and spin RAF forever. Track a counter on the instance;
give up after 10 attempts and reset on the first successful measure.
"
```

---

## Task 7: Declare `;charset=utf-8` on the txt/html export Blob MIMEs

**Why:** ASCII output frequently contains non-ASCII bytes (block characters `░▒▓█`, dots `·•`, any user-supplied custom charset including emoji). Without an explicit charset some OS preview tools and text viewers decode the file as Latin-1, corrupting the multibyte sequences.

**Files:**
- Modify: `src/script.js` — `exportAsTxt` and `exportAsHtml`

- [ ] **Step 7.1: Update `exportAsTxt`**

In `src/script.js`, find:

```js
        const blob = new Blob([this.currentAscii.text], { type: 'text/plain' });
```

Replace with:

```js
        const blob = new Blob([this.currentAscii.text], { type: 'text/plain;charset=utf-8' });
```

- [ ] **Step 7.2: Update `exportAsHtml`**

In `src/script.js`, find:

```js
        const blob = new Blob([html], { type: 'text/html' });
```

Replace with:

```js
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
```

- [ ] **Step 7.3: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 7.4: Commit**

```bash
git add src/script.js
git commit -m "fix: declare utf-8 charset on txt/html export Blob MIME types

ASCII output may contain non-ASCII glyphs (block characters, dots, any
user-supplied custom charset including emoji). Without an explicit
charset, some OS preview tools decode the file as Latin-1 and corrupt
the multibyte sequences. Add ;charset=utf-8.
"
```

---

## Task 8: Floor slider max at `MIN_DIMENSION`

**Why:** For images with a dimension below 10 (e.g. a 5×5 favicon), `updateSliderMax` produces `max < min=10`, which makes the range input behave inconsistently across browsers.

**Files:**
- Modify: `src/script.js` — `updateSliderMax` and the settings-schema import

- [ ] **Step 8.1: Floor the computed slider max**

In `src/script.js`, find:

```js
    updateSliderMax() {
        if (!this.currentImage) return;

        const widthSlider = document.getElementById('width-slider');
        const heightSlider = document.getElementById('height-slider');

        // Set max to the full image dimensions
        widthSlider.max = Math.min(this.currentImage.width, MAX_DIMENSION);
        heightSlider.max = Math.min(Math.round(this.currentImage.height / 2), MAX_DIMENSION);
    }
```

Replace with:

```js
    updateSliderMax() {
        if (!this.currentImage) return;

        const widthSlider = document.getElementById('width-slider');
        const heightSlider = document.getElementById('height-slider');

        // Floor at MIN_DIMENSION so a tiny image (e.g. a 5x5 favicon)
        // doesn't produce a slider whose max is below its hardcoded min=10.
        widthSlider.max = Math.max(
            MIN_DIMENSION,
            Math.min(this.currentImage.width, MAX_DIMENSION),
        );
        heightSlider.max = Math.max(
            MIN_DIMENSION,
            Math.min(Math.round(this.currentImage.height / 2), MAX_DIMENSION),
        );
    }
```

- [ ] **Step 8.2: Add `MIN_DIMENSION` to the settings-schema import**

In `src/script.js`, find the existing import:

```js
import { DEFAULT_SETTINGS, MAX_DIMENSION, clampDimension, sanitizeSettings, isColorRenderTractable } from './settings-schema.js';
```

(Note: this is what the line will look like *after* Task 3 has run. If Task 3 hasn't run yet, the line lacks `isColorRenderTractable`.)

Update to add `MIN_DIMENSION`:

```js
import { DEFAULT_SETTINGS, MIN_DIMENSION, MAX_DIMENSION, clampDimension, sanitizeSettings, isColorRenderTractable } from './settings-schema.js';
```

- [ ] **Step 8.3: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 8.4: Commit**

```bash
git add src/script.js
git commit -m "fix: floor slider max at MIN_DIMENSION for tiny images

updateSliderMax took Math.min(image dim, MAX_DIMENSION) which, for an
image whose width or height/2 was below 10, produced max < the
hardcoded min='10' on the range input — inconsistent across browsers.
Floor with Math.max(MIN_DIMENSION, ...) so the slider's max >= min is
always preserved.
"
```

---

## Task 9: Delete the resolved `.project-hub-tasks.json` and run final verification

- [ ] **Step 9.1: Confirm all 8 tasks are addressed**

Open `.project-hub-tasks.json` and visually map each task title to the commit that resolved it. All 8 should be accounted for.

- [ ] **Step 9.2: Delete the now-stale tasks file**

```bash
rm .project-hub-tasks.json
```

- [ ] **Step 9.3: Run the full verification sweep**

```bash
npm test
npm run build
npm audit
git status --short
```

Expected:
- `npm test`: 73 tests pass (63 original + 5 escapeHtml + 5 isColorRenderTractable).
- `npm run build`: succeeds, dist/ output sizes broadly similar to before.
- `npm audit`: 0 vulnerabilities.
- `git status --short`: empty (clean tree, all changes committed).

- [ ] **Step 9.4: Commit the deletion**

```bash
git add -u
git commit -m "chore: drop resolved .project-hub-tasks.json (investigate batch)

All 8 findings from the 2026-05-25 /investigate run are resolved in the
preceding commits. The tasks file was a transient artifact;
STATUS-TRACKER remains the authoritative status doc.
"
```

---

## Self-review

**Spec coverage:**
- Task 1 in `.project-hub-tasks.json` (a11y upload area) → Plan Task 1 ✅
- Task 2 (innerHTML OOM at max color grid) → Plan Task 3 ✅
- Task 3 (revokeObjectURL race) → Plan Task 4 ✅
- Task 4 (escapeHtml DOM allocs) → Plan Task 2 ✅
- Task 5 (clipboard sync throw) → Plan Task 5 ✅
- Task 6 (RAF retry loop) → Plan Task 6 ✅
- Task 7 (Blob charset) → Plan Task 7 ✅
- Task 8 (slider max floor) → Plan Task 8 ✅

All 8 covered.

**Placeholder scan:** No "TODO", "TBD", "implement later", "add validation" strings. Every step that changes code shows the exact code. Every step that runs a command shows the command and the expected output.

**Type consistency:**
- `escapeHtml` — signature is `(value) => string`; tests cover string, number, null, undefined.
- `isColorRenderTractable` — signature `(width, height, colorMode) => boolean`; tests cover all branches.
- `MAX_COLOR_CELLS` — exported constant; tests confirm export.
- `MIN_DIMENSION` — already exported from settings-schema.js; Task 8 just adds it to the script.js import.
- Instance flags `_colorBudgetWarned` (Task 3) and `_fitRetryCount` (Task 6) are both initialized in the constructor and consumed in the methods that own them.

No issues found.

---

## Notes for the implementer

- The Vitest suite imports the **real** production functions; there is no copy. A regression in `src/ascii-core.js` or `src/settings-schema.js` will fail the existing tests. Trust them.
- The "fix" commit-message prefix follows the repository's established convention (see recent commits like `fix: refuse oversized PNG export with actionable toast [hub-179]`). The hub IDs in the existing log refer to a task tracker that was deleted on 2026-05-24; new commits in this plan do not need hub IDs.
- Stay within the test file's existing block-comment / docstring style. No emojis in code or commit messages.
