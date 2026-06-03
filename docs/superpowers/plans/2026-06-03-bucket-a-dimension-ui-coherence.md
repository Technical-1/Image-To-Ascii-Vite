# Bucket A — Dimension / Resolution UI Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the width/height slider thumb, its numeric label, and `this.settings.{width,height}` always agree, and raise the slider ceiling from the hardcoded `1000` to the real `MAX_DIMENSION` (2000).

**Architecture:** A range `<input>` silently clamps an assigned `.value` to its `max`, but a sibling label's `textContent` does not — so the two can disagree (Hub #1106), and a stale carried-over width can survive a smaller image load (Hub #1110). We fix the root cause once: a pure `clampToSliderMax(requested, sliderMax)` helper (unit-tested) plus a single `syncDimension(dim, requested)` method that writes the slider, the label, and `this.settings` together from one clamped source of truth. Every dimension write site is then routed through it.

**Tech Stack:** Vanilla ES modules, Vite 8, Vitest 4 (node environment for the pure helper). No new dependencies.

**Covers Project Hub tasks:** 1106 (slider max vs MAX_DIMENSION desync), 1110 (custom-reload width desync).

**Conventions:** Conventional-commit messages (`fix:`, `test:`, `refactor:`). Reference the Hub task id as `(hub-1106)` / `(hub-1110)`. Commits are authored by Jacob with no AI/assistant attribution (per the repo's global git rules) — describe the change only.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/settings-schema.js` | Pure dimension contract (already holds `clampDimension`, `MIN/MAX_DIMENSION`) | **Modify** — add `clampToSliderMax` |
| `tests/settings-schema.test.js` | Unit tests for the pure contract | **Modify** — add a `describe('clampToSliderMax')` block |
| `src/script.js` | Create-mode UI orchestration | **Modify** — add `syncDimension`, raise markup `max`, route all dimension writes through it |

No new files. The pure logic lands beside `clampDimension` (its natural home and the one place create-mode + tests already share).

---

### Task 1: Pure `clampToSliderMax` helper

**Files:**
- Modify: `src/settings-schema.js` (add after `clampDimension`, ~line 16)
- Test: `tests/settings-schema.test.js` (add a new `describe` block)

- [ ] **Step 1: Write the failing tests**

Add this block to `tests/settings-schema.test.js`. The import on line 3 already pulls `MIN_DIMENSION, MAX_DIMENSION, clampDimension` from `../src/settings-schema.js`; extend it to also import `clampToSliderMax`:

```js
// line 3 becomes:
import { MIN_DIMENSION, MAX_DIMENSION, clampDimension, clampToSliderMax } from '../src/settings-schema.js';
```

Then append at the end of the file:

```js
describe('clampToSliderMax', () => {
  it('passes a value through when it is within both the global cap and the slider max', () => {
    expect(clampToSliderMax(500, 1000)).toBe(500);
  });
  it('clamps down to the live slider max (image-derived ceiling)', () => {
    expect(clampToSliderMax(1500, 1000)).toBe(1000);
  });
  it('clamps down to MAX_DIMENSION when the slider max is higher', () => {
    expect(clampToSliderMax(3000, 5000)).toBe(MAX_DIMENSION);
  });
  it('floors below MIN_DIMENSION up to MIN_DIMENSION', () => {
    expect(clampToSliderMax(5, 1000)).toBe(MIN_DIMENSION);
  });
  it('treats a tiny slider max as MIN_DIMENSION (never below the contract floor)', () => {
    expect(clampToSliderMax(50, 5)).toBe(MIN_DIMENSION);
  });
  it('falls back to MAX_DIMENSION when no slider max is available (no image yet)', () => {
    expect(clampToSliderMax(1500, NaN)).toBe(1500);
    expect(clampToSliderMax(3000, undefined)).toBe(MAX_DIMENSION);
    expect(clampToSliderMax(800, null)).toBe(800);
  });
  it('rounds non-integer requests via clampDimension before applying the slider max', () => {
    expect(clampToSliderMax(123.7, 1000)).toBe(124);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/settings-schema.test.js`
Expected: FAIL — `clampToSliderMax is not a function` (or an import error).

- [ ] **Step 3: Write the minimal implementation**

In `src/settings-schema.js`, immediately after the `clampDimension` function (ends ~line 16), add:

```js
// Clamp a requested dimension to BOTH the global [MIN, MAX] contract and the
// live slider max. updateSliderMax lowers the slider max to the loaded image's
// size, so a value valid under MAX_DIMENSION can still exceed the slider; the
// range <input> would silently clamp the thumb while the label kept the larger
// number. A non-finite sliderMax means "no image yet" → fall back to the global
// ceiling. Pure so create-mode and tests share one definition. hub-1106/1110.
export function clampToSliderMax(requested, sliderMax) {
    const base = clampDimension(requested);
    const max = Number.isFinite(sliderMax)
        ? Math.max(MIN_DIMENSION, Math.floor(sliderMax))
        : MAX_DIMENSION;
    return Math.min(base, max);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/settings-schema.test.js`
Expected: PASS — all `clampToSliderMax` cases green, existing `clampDimension`/`sanitizeSettings` cases unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/settings-schema.js tests/settings-schema.test.js
git commit -m "feat: add clampToSliderMax dimension helper (hub-1106)"
```

---

### Task 2: Add `syncDimension` and raise the slider ceiling

**Files:**
- Modify: `src/script.js` import line 15
- Modify: `src/script.js` create-mode markup, width/height range inputs (currently lines 261 and 265)
- Modify: `src/script.js` — add `syncDimension` method (place it next to `updateSliderMax`, ~line 1390)

This task has no automated test (it is DOM wiring); it is verified by the manual smoke checklist in Task 4 and by the existing suite still passing.

- [ ] **Step 1: Import the helper**

Change `src/script.js` line 15 from:

```js
import { DEFAULT_SETTINGS, MIN_DIMENSION, MAX_DIMENSION, clampDimension, sanitizeSettings, isColorRenderTractable } from './settings-schema.js';
```

to:

```js
import { DEFAULT_SETTINGS, MIN_DIMENSION, MAX_DIMENSION, clampDimension, clampToSliderMax, sanitizeSettings, isColorRenderTractable } from './settings-schema.js';
```

- [ ] **Step 2: Raise the markup ceiling to MAX_DIMENSION**

In `setupUI`, change the width slider (line 261) from:

```html
<input type="range" id="width-slider" min="10" max="1000" value="${this.settings.width}" step="1">
```

to:

```html
<input type="range" id="width-slider" min="${MIN_DIMENSION}" max="${MAX_DIMENSION}" value="${this.settings.width}" step="1">
```

And the height slider (line 265) from:

```html
<input type="range" id="height-slider" min="10" max="1000" value="${this.settings.height}" step="1">
```

to:

```html
<input type="range" id="height-slider" min="${MIN_DIMENSION}" max="${MAX_DIMENSION}" value="${this.settings.height}" step="1">
```

(`MIN_DIMENSION` and `MAX_DIMENSION` are already imported and in scope inside the template literal.)

- [ ] **Step 3: Add the `syncDimension` method**

In the `ImageAsciiConverter` class, directly above `updateSliderMax()` (~line 1390), add:

```js
// Single source of truth for writing a width/height. Clamps the requested
// value to the global contract AND the live slider max, then sets the slider
// thumb, the numeric label, and this.settings together so they can never
// disagree. Returns the value actually written. hub-1106/1110.
syncDimension(dim, requested) {
    const slider = document.getElementById(`${dim}-slider`);
    const valueEl = document.getElementById(`${dim}-value`);
    const sliderMax = slider ? parseInt(slider.max, 10) : MAX_DIMENSION;
    const value = clampToSliderMax(requested, sliderMax);
    this.settings[dim] = value;
    if (slider) slider.value = value;
    if (valueEl) valueEl.textContent = value;
    return value;
}
```

- [ ] **Step 4: Verify the existing suite still passes and the app builds**

Run: `npm test`
Expected: PASS — all existing tests green (this step changes only DOM code).

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/script.js
git commit -m "fix: raise dimension slider ceiling to MAX_DIMENSION and add syncDimension (hub-1106)"
```

---

### Task 3: Route every dimension write through `syncDimension`

**Files:**
- Modify: `src/script.js` — `applySettings` (~lines 702-706), the width slider `input` handler (~563-580), the height slider `input` handler (~583-599), the resolution-select `change` handler (~542-556), and both `handleFileSelect` resolution branches (~816-833).

This replaces every place that hand-writes the `(settings, slider.value, label.textContent)` triplet. Verified by Task 4's manual checklist + the suite.

- [ ] **Step 1: `applySettings` — use syncDimension on restore**

In `applySettings`, replace these four lines (702-706):

```js
document.getElementById('width-slider').value = this.settings.width;
document.getElementById('width-value').textContent = this.settings.width;

document.getElementById('height-slider').value = this.settings.height;
document.getElementById('height-value').textContent = this.settings.height;
```

with:

```js
// Route through syncDimension so a persisted dimension that exceeds the
// current slider max can't leave the thumb and label disagreeing. hub-1106.
this.syncDimension('width', this.settings.width);
this.syncDimension('height', this.settings.height);
```

- [ ] **Step 2: Width slider `input` handler — sync the linked height through the helper**

In the width slider handler (`widthSlider.addEventListener('input', ...)`, ~563-580), replace the body from `const value = ...` through the aspect-ratio block with:

```js
const value = this.syncDimension('width', parseInt(e.target.value, 10));
document.getElementById('resolution-select').value = 'custom';
document.getElementById('custom-resolution').classList.remove('hidden');
if (this.settings.preserveAspectRatio && this.currentImage) {
    // /2 because ASCII chars are roughly twice as tall as wide.
    const aspectRatio = this.currentImage.width / this.currentImage.height;
    this.syncDimension('height', value / aspectRatio / 2);
}
this.saveSettings();
this.debounceConvert();
```

- [ ] **Step 3: Height slider `input` handler — symmetric change**

In the height slider handler (~583-599), replace the body with:

```js
const value = this.syncDimension('height', parseInt(e.target.value, 10));
document.getElementById('resolution-select').value = 'custom';
document.getElementById('custom-resolution').classList.remove('hidden');
if (this.settings.preserveAspectRatio && this.currentImage) {
    const aspectRatio = this.currentImage.width / this.currentImage.height;
    this.syncDimension('width', value * 2 * aspectRatio);
}
this.saveSettings();
this.debounceConvert();
```

- [ ] **Step 4: Resolution-select `change` handler — sync both dimensions**

In the resolution-select handler (~542-556), replace the block that sets width/height/labels (from `const width = clampDimension(...)` through the two `width-value`/`height-value` writes) with:

```js
const percent = parseInt(e.target.value, 10) / 100;
this.updateSliderMax();
this.syncDimension('width', this.currentImage.width * percent);
// Divide height by 2 because ASCII chars are taller than wide.
this.syncDimension('height', (this.currentImage.height * percent) / 2);
this.saveSettings();
this.debounceConvert();
```

(Note: `updateSliderMax()` must run before `syncDimension` so the slider max reflects the current image. It was not called here before; adding it is correct and harmless.)

- [ ] **Step 5: `handleFileSelect` — both resolution branches (fixes hub-1110)**

In `handleFileSelect`'s `previewImg.onload`, the non-custom branch (~816-825) currently sets the triplet inline. Replace its body with:

```js
const percent = parseInt(resolutionSelect.value, 10) / 100;
this.syncDimension('width', this.currentImage.width * percent);
this.syncDimension('height', (this.currentImage.height * percent) / 2);
this.saveSettings();
```

And replace the custom branch (`else if (this.settings.preserveAspectRatio)`, ~826-833) with:

```js
} else if (this.settings.preserveAspectRatio) {
    // updateSliderMax (called above) may have lowered the width slider's max
    // for a smaller image — re-clamp the carried-over width so slider/label/
    // setting agree, THEN derive height from the freshly-clamped width. hub-1110.
    const width = this.syncDimension('width', this.settings.width);
    const aspectRatio = previewImg.naturalWidth / previewImg.naturalHeight;
    this.syncDimension('height', width / aspectRatio / 2);
    this.saveSettings();
}
```

- [ ] **Step 6: Verify the suite and build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/script.js
git commit -m "fix: route all width/height writes through syncDimension to fix slider/label/setting desync (hub-1110)"
```

---

### Task 4: Manual smoke verification

No browser automation (per project verification preference). Run the dev server and walk this checklist.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed `http://localhost:*` URL.

- [ ] **Step 2: hub-1106 — restore beyond old ceiling**

1. Load a large image (≥1600px wide). Drag the width slider to the far right; confirm it now reaches **2000** (not 1000) and the label matches the thumb.
2. With width shown as e.g. **1500**, reload the page (no image loaded yet).
3. Expected: the width slider thumb and the `W:` label both read **1500** — they agree. (Before the fix the label read 1500 while the thumb sat at the 1000 ceiling.)

- [ ] **Step 3: hub-1110 — custom-resolution reload onto a smaller image**

1. Set Resolution to **Custom**, lock aspect ratio, load a large image, and set width high (e.g. 1800).
2. Now load a **smaller** image (e.g. 400px wide).
3. Expected: the width slider max drops to ~400, and the width thumb, the `W:` label, and the rendered ASCII grid width all agree on the clamped value — no stale 1800 lingering in the label.

- [ ] **Step 4: Regression — normal flows unchanged**

1. Switch Resolution between 25% / 50% / 100% on a loaded image; sliders + labels + output update coherently.
2. Drag width with aspect-lock on; height follows and never exceeds its slider max.

- [ ] **Step 5: Final commit (if any checklist tweak was needed)**

If no code changed during smoke, nothing to commit. Otherwise re-run `npm test` and commit with a `fix:` message referencing `hub-1106`/`hub-1110`.

---

## Self-Review

- **Spec coverage:** hub-1106 → Task 1 (helper) + Task 2 (raised ceiling) + Task 3 Step 1 (restore path). hub-1110 → Task 3 Step 5 (custom branch re-clamps width). ✅
- **Type consistency:** `clampToSliderMax(requested, sliderMax)` and `syncDimension(dim, requested)` are referenced with identical signatures across all tasks. `dim` is always `'width'`/`'height'`, matching the `${dim}-slider` / `${dim}-value` element ids. ✅
- **Placeholder scan:** every code step shows full code; commands have expected output. ✅
- **Open questions resolved:** ceiling → `MAX_DIMENSION` via the imported constant (not a literal); desync → one helper + one setter method routed everywhere. No decisions deferred to implementation. ✅
