# Canvas Dimension Clamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve tracker C2: enforce a single shared `MAX_DIMENSION = 2000` ceiling on ASCII grid width/height across every create-mode write path AND at conversion time, eliminating the tab-freeze when a large source image lets the slider exceed 2000.

**Architecture:** Add `MIN_DIMENSION`/`MAX_DIMENSION`/`clampDimension` to the existing pure `src/settings-schema.js`; `sanitizeSettings` keeps its NaN→per-field-default semantics but substitutes the literals for the new constants. Five create-mode write paths in `src/script.js` route through `clampDimension` and reflect the clamped value into the slider + numeric label. A defensive `clampDimension` at the top of `processImage`'s `img.onload` is the hard safety net regardless of how settings got there.

**Tech Stack:** Vanilla ES modules, Vitest 4, browser Canvas/DOM. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-20-canvas-clamp-design.md`
**Branch:** `fix/canvas-clamp` (already created off `fix/production-hardening` @ `fb34e58`)

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/settings-schema.js` | Add `MIN_DIMENSION`, `MAX_DIMENSION`, pure `clampDimension(n)`; substitute constants in existing `sanitizeSettings` clamps | Modify |
| `tests/settings-schema.test.js` | Add `clampDimension` unit tests; keep existing 8 green | Modify |
| `src/script.js` | Import constants/helper; clamp 5 create-mode write paths (slider × 2, resolution-select %, handleFileSelect resolution apply, `updateSliderMax`); convert-time clamp at top of `processImage`'s `img.onload` | Modify |
| `docs/STATUS-TRACKER.md` | Flip C2 to `[x]` with resolved-by note | Modify |

---

## Task 1: settings-schema — constants + clampDimension

**Files:**
- Modify: `src/settings-schema.js`
- Modify: `tests/settings-schema.test.js`

- [ ] **Step 1: Add the failing tests**

Append to `tests/settings-schema.test.js` (inside the existing `describe('sanitizeSettings', …)` block is fine, or create a new sibling `describe`; the example below adds a new describe block — place it AFTER the existing `describe('sanitizeSettings', …)` block):

```javascript
import { MIN_DIMENSION, MAX_DIMENSION, clampDimension } from '../src/settings-schema.js';

describe('clampDimension', () => {
  it('exposes the contract values', () => {
    expect(MIN_DIMENSION).toBe(10);
    expect(MAX_DIMENSION).toBe(2000);
  });
  it('passes through in-range integers unchanged', () => {
    expect(clampDimension(100)).toBe(100);
    expect(clampDimension(MIN_DIMENSION)).toBe(MIN_DIMENSION);
    expect(clampDimension(MAX_DIMENSION)).toBe(MAX_DIMENSION);
  });
  it('clamps above MAX_DIMENSION down to MAX_DIMENSION', () => {
    expect(clampDimension(2001)).toBe(MAX_DIMENSION);
    expect(clampDimension(999999)).toBe(MAX_DIMENSION);
  });
  it('clamps below MIN_DIMENSION up to MIN_DIMENSION', () => {
    expect(clampDimension(9)).toBe(MIN_DIMENSION);
    expect(clampDimension(-50)).toBe(MIN_DIMENSION);
    expect(clampDimension(0)).toBe(MIN_DIMENSION);
  });
  it('rounds non-integer inputs to the nearest integer', () => {
    expect(clampDimension(123.4)).toBe(123);
    expect(clampDimension(123.7)).toBe(124);
  });
  it('returns MIN_DIMENSION for non-finite input (defensive fallback)', () => {
    expect(clampDimension(NaN)).toBe(MIN_DIMENSION);
    expect(clampDimension(Infinity)).toBe(MIN_DIMENSION);
    expect(clampDimension(-Infinity)).toBe(MIN_DIMENSION);
    expect(clampDimension(undefined)).toBe(MIN_DIMENSION);
    expect(clampDimension(null)).toBe(MIN_DIMENSION);
    expect(clampDimension('nope')).toBe(MIN_DIMENSION);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/settings-schema.test.js`
Expected: FAIL — `MIN_DIMENSION is not exported` (or similar — the new symbols don't exist yet).

- [ ] **Step 3: Add the exports to `src/settings-schema.js`**

In `src/settings-schema.js`, immediately ABOVE the existing `export const DEFAULT_SETTINGS = { ... };` line, add:

```javascript
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
```

Then, in the existing `sanitizeSettings` body, change ONLY the two `width`/`height` lines so the literals are replaced by the constants (do NOT change the surrounding `clampInt` call shape — the NaN→`defaults.width`/`defaults.height` fallback must be preserved):

Find:
```javascript
        width: clampInt(r.width, 10, 2000, defaults.width),
        height: clampInt(r.height, 10, 2000, defaults.height),
```
Replace with:
```javascript
        width: clampInt(r.width, MIN_DIMENSION, MAX_DIMENSION, defaults.width),
        height: clampInt(r.height, MIN_DIMENSION, MAX_DIMENSION, defaults.height),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/settings-schema.test.js`
Expected: PASS — original 8 tests + 6 new `clampDimension` tests = 14.

- [ ] **Step 5: Full suite + build**

Run: `npm test && npm run build`
Expected: all 54 → 60 tests PASS, build OK.

- [ ] **Step 6: Commit**

```bash
git add src/settings-schema.js tests/settings-schema.test.js
git commit -m "feat: add MIN/MAX_DIMENSION constants + clampDimension helper"
```

---

## Task 2: Create-mode write-path clamping in script.js

**Files:**
- Modify: `src/script.js` (top import block; `attachSettingsListeners` resolution-select handler ~478-501; width-slider handler ~504-513; height-slider handler ~516-525; `handleFileSelect` resolution apply ~727-743; `updateSliderMax` ~1185-1194)

**Context:** This task adds the UI-side guarantee. Each write path runs the value through `clampDimension` AND writes the clamped value back into `settings`, the slider's `value`, and the numeric label — so the displayed number always equals what's rendered. There is no jsdom; verification = build + the existing test suite + a manual smoke at Task 4.

- [ ] **Step 1: Add the import**

In `src/script.js`, find the import line (added in earlier work):
```javascript
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings-schema.js';
```
Replace it with:
```javascript
import { DEFAULT_SETTINGS, MAX_DIMENSION, clampDimension, sanitizeSettings } from './settings-schema.js';
```

- [ ] **Step 2: Cap the slider `max` attribute in `updateSliderMax`**

Find `updateSliderMax()` (around lines 1185-1194). Replace:
```javascript
        widthSlider.max = this.currentImage.width;
        heightSlider.max = Math.round(this.currentImage.height / 2); // /2 for char aspect ratio
```
with:
```javascript
        widthSlider.max = Math.min(this.currentImage.width, MAX_DIMENSION);
        heightSlider.max = Math.min(Math.round(this.currentImage.height / 2), MAX_DIMENSION);
```

- [ ] **Step 3: Clamp the width slider input handler**

Find the width-slider handler (around lines 504-513). Replace its body so the parsed value is clamped, written back to settings, AND reflected into both the label and the slider's `.value`. Replace:
```javascript
        const widthSlider = document.getElementById('width-slider');
        widthSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('width-value').textContent = value;
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
            this.settings.width = value;
            this.saveSettings();
            this.debounceConvert();
        });
```
with:
```javascript
        const widthSlider = document.getElementById('width-slider');
        widthSlider.addEventListener('input', (e) => {
            const value = clampDimension(parseInt(e.target.value, 10));
            document.getElementById('width-value').textContent = value;
            widthSlider.value = value;
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
            this.settings.width = value;
            this.saveSettings();
            this.debounceConvert();
        });
```

- [ ] **Step 4: Clamp the height slider input handler**

Find the height-slider handler (around lines 516-525). Replace:
```javascript
        const heightSlider = document.getElementById('height-slider');
        heightSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('height-value').textContent = value;
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
            this.settings.height = value;
            this.saveSettings();
            this.debounceConvert();
        });
```
with:
```javascript
        const heightSlider = document.getElementById('height-slider');
        heightSlider.addEventListener('input', (e) => {
            const value = clampDimension(parseInt(e.target.value, 10));
            document.getElementById('height-value').textContent = value;
            heightSlider.value = value;
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
            this.settings.height = value;
            this.saveSettings();
            this.debounceConvert();
        });
```

- [ ] **Step 5: Clamp the resolution-select percentage path**

Find the resolution-select `change` handler's non-custom branch (around lines 482-500). Replace the block that currently looks like:
```javascript
                customRes.classList.add('hidden');
                // Calculate dimensions based on percentage of actual image
                if (this.currentImage) {
                    const percent = parseInt(e.target.value) / 100;
                    const width = Math.max(10, Math.round(this.currentImage.width * percent));
                    // Divide height by 2 because ASCII chars are taller than wide
                    const height = Math.max(10, Math.round((this.currentImage.height * percent) / 2));
                    this.settings.width = width;
                    this.settings.height = height;
                    this.updateSliderMax();
                    document.getElementById('width-slider').value = width;
                    document.getElementById('height-slider').value = height;
                    document.getElementById('width-value').textContent = width;
                    document.getElementById('height-value').textContent = height;
                    this.saveSettings();
                    this.debounceConvert();
                }
```
with:
```javascript
                customRes.classList.add('hidden');
                // Calculate dimensions based on percentage of actual image
                if (this.currentImage) {
                    const percent = parseInt(e.target.value, 10) / 100;
                    // clampDimension enforces the shared MAX_DIMENSION ceiling.
                    const width = clampDimension(this.currentImage.width * percent);
                    // Divide height by 2 because ASCII chars are taller than wide.
                    const height = clampDimension((this.currentImage.height * percent) / 2);
                    this.settings.width = width;
                    this.settings.height = height;
                    this.updateSliderMax();
                    document.getElementById('width-slider').value = width;
                    document.getElementById('height-slider').value = height;
                    document.getElementById('width-value').textContent = width;
                    document.getElementById('height-value').textContent = height;
                    this.saveSettings();
                    this.debounceConvert();
                }
```
(Note: `Math.max(10, Math.round(...))` is removed because `clampDimension` already covers both rounding and the MIN_DIMENSION floor.)

- [ ] **Step 6: Clamp the `handleFileSelect` resolution apply**

Find the resolution-apply block in `handleFileSelect` (around lines 727-743). It looks like:
```javascript
                // Apply default 50% resolution for new images
                const resolutionSelect = document.getElementById('resolution-select');
                if (resolutionSelect.value !== 'custom') {
                    const percent = parseInt(resolutionSelect.value) / 100;
                    this.settings.width = Math.max(10, Math.round(this.currentImage.width * percent));
                    this.settings.height = Math.max(10, Math.round((this.currentImage.height * percent) / 2));
                    document.getElementById('width-slider').value = this.settings.width;
                    document.getElementById('height-slider').value = this.settings.height;
                    document.getElementById('width-value').textContent = this.settings.width;
                    document.getElementById('height-value').textContent = this.settings.height;
                    this.saveSettings();
                } else if (this.settings.preserveAspectRatio) {
                    // Auto-adjust height to preserve aspect ratio for custom mode
                    const aspectRatio = previewImg.naturalWidth / previewImg.naturalHeight;
                    const newHeight = Math.round(this.settings.width / aspectRatio / 2);
                    this.settings.height = Math.max(10, newHeight);
                    document.getElementById('height-slider').value = this.settings.height;
                    document.getElementById('height-value').textContent = this.settings.height;
                    this.saveSettings();
                }
```
Replace it with (clamps both branches; same shape, `clampDimension` substituted for the `Math.max(10, Math.round(...))` pattern):
```javascript
                // Apply default 50% resolution for new images
                const resolutionSelect = document.getElementById('resolution-select');
                if (resolutionSelect.value !== 'custom') {
                    const percent = parseInt(resolutionSelect.value, 10) / 100;
                    this.settings.width = clampDimension(this.currentImage.width * percent);
                    this.settings.height = clampDimension((this.currentImage.height * percent) / 2);
                    document.getElementById('width-slider').value = this.settings.width;
                    document.getElementById('height-slider').value = this.settings.height;
                    document.getElementById('width-value').textContent = this.settings.width;
                    document.getElementById('height-value').textContent = this.settings.height;
                    this.saveSettings();
                } else if (this.settings.preserveAspectRatio) {
                    // Auto-adjust height to preserve aspect ratio for custom mode
                    const aspectRatio = previewImg.naturalWidth / previewImg.naturalHeight;
                    this.settings.height = clampDimension(this.settings.width / aspectRatio / 2);
                    document.getElementById('height-slider').value = this.settings.height;
                    document.getElementById('height-value').textContent = this.settings.height;
                    this.saveSettings();
                }
```

- [ ] **Step 7: Verify build + full suite**

Run: `npm test && npm run build`
Expected: 60 tests PASS, build OK. (No new tests in this task — pure DOM glue verified via build.)

- [ ] **Step 8: Static sanity grep**

Run: `grep -n "Math.max(10, Math.round\|widthSlider.max = this.currentImage.width\b\|heightSlider.max = Math.round(this.currentImage.height / 2);" src/script.js`
Expected: NO output (all the old un-clamped patterns are gone).

- [ ] **Step 9: Commit**

```bash
git add src/script.js
git commit -m "fix: clamp width/height at every create-mode write path"
```

---

## Task 3: Convert-time safety net in processImage

**Files:**
- Modify: `src/script.js` (`processImage` ~787-815)

- [ ] **Step 1: Replace the dim destructure with a clamped derivation**

Find the `img.onload` handler inside `processImage()` (around lines 787-815). It currently begins:
```javascript
            img.onload = () => {
                const { width, height } = this.settings;
                
                this.canvas.width = width;
                this.canvas.height = height;
                
                // Draw scaled image
                this.ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, width, height);
                
                // Get image data
                const imageData = this.ctx.getImageData(0, 0, width, height);
```
Replace the first line of the onload body (the `const { width, height } = this.settings;` line) with:
```javascript
            img.onload = () => {
                // Convert-time safety net: regardless of how settings got here
                // (slider, resolution-%, localStorage, share decode), the canvas
                // can never exceed MAX_DIMENSION. Tracker C2.
                const width = clampDimension(this.settings.width);
                const height = clampDimension(this.settings.height);
```
Leave the rest of the body (canvas sizing, drawImage, getImageData, edge detection, resolve) unchanged — `width` and `height` are still in scope and have the same names, so no other references need updating.

- [ ] **Step 2: Verify build + full suite**

Run: `npm test && npm run build`
Expected: 60 tests PASS, build OK.

- [ ] **Step 3: Static sanity grep**

Run: `grep -n "const { width, height } = this.settings;" src/script.js`
Expected: NO output (the old destructure is gone — there is only one such line; if there are other matches we've missed them; flag if so).

- [ ] **Step 4: Commit**

```bash
git add src/script.js
git commit -m "fix: clamp canvas dims at conversion time as the hard safety net"
```

---

## Task 4: Final verification

**Files:** (none modified by this task; verification only)

- [ ] **Step 1: Full automated gates**

Run: `npm test && npm run build && npm audit`
Expected: 60 tests PASS, build OK, `found 0 vulnerabilities`.

- [ ] **Step 2: Branch summary**

Run: `git log --oneline fix/production-hardening..fix/canvas-clamp`
Expected: ~4 focused commits + the design-spec commit `82c92e6`. Confirm `git status` is clean.

- [ ] **Step 3: Manual browser smoke (tracker D1 — no jsdom)**

Run `npm run build && npm run preview` and verify in a real browser:
1. Load any source image that is **wider than 2000 px** (or use the largest you have).
2. Pick **"100% (Full)"** in the resolution dropdown → confirm the width-slider numeric label and the slider knob both show **≤ 2000**, NOT the source image's full width. Output renders without freezing.
3. Pick **"Custom"** and drag the width slider all the way right → maximum value reached must be **2000**, not higher.
4. Reload the page → confirm previously-clamped settings persist (localStorage round-trip via `sanitizeSettings` is unchanged).
5. Click **🔗 Share**, paste the resulting URL in a new tab → confirm the read-only view renders identically (the embedded image was already at the clamped size, so the snapshot is bit-identical).
6. Open devtools → confirm no console errors or warnings.

Record pass/fail explicitly for each substep. **Do not fabricate** results — if the browser step is not run, say so.

- [ ] **Step 4: If all green, no commit needed**

This task is verification-only. The tracker update happens in Task 5.

---

## Task 5: Reconcile STATUS-TRACKER C2 → resolved

**Files:**
- Modify: `docs/STATUS-TRACKER.md`

- [ ] **Step 1: Flip C2 and append the resolution note**

In `docs/STATUS-TRACKER.md`, find the C2 row in section "## C. Correctness / robustness bugs the audit missed". It currently has Status `[ ]` and a Notes cell ending with `... Still OPEN.`

- Change the Status cell from `[ ]` to `[x]`.
- In the Notes cell, REMOVE the trailing `Still OPEN.` sentence and instead append: `RESOLVED 2026-05-20 by canvas-clamp (fix/canvas-clamp): shared MAX_DIMENSION=2000 constant; clamped at every create-mode UI write path and at convert-time in processImage; new pure clampDimension helper unit-tested; see docs/superpowers/specs/2026-05-20-canvas-clamp-design.md.`

- [ ] **Step 2: Update the top summary line (if present)**

Find the URL-share update line (near the top of the file) which currently reads similar to:
`**URL-share update (2026-05-19):** ... **C2 is NOT in this cluster** — it is a client-side create-mode bug (unbounded canvas), still open.`

Append an additional line immediately below it:
`**Canvas-clamp update (2026-05-20):** Branch \`fix/canvas-clamp\` resolved C2 — single shared \`MAX_DIMENSION = 2000\`, clamped at every create-mode UI write path AND in \`processImage\` as the hard safety net. See \`docs/superpowers/specs/2026-05-20-canvas-clamp-design.md\`.`

- [ ] **Step 3: Verify**

Run: `grep -n "^| C2 " docs/STATUS-TRACKER.md` → confirm the C2 row now starts with `| C2 | MEDIUM | [x] |` (or whatever severity column shape exists — the `[x]` matters).
Run: `grep -n "Still OPEN" docs/STATUS-TRACKER.md` → expect NO output (the old "Still OPEN" sentence on C2 is gone).
Run: `grep -n "Canvas-clamp update (2026-05-20)" docs/STATUS-TRACKER.md` → expect 1 match.

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS-TRACKER.md
git commit -m "docs: mark tracker C2 resolved by canvas-clamp"
```

---

## Self-Review

- **Spec coverage:**
  - Spec §1 (Problem/Goal) → all tasks.
  - Spec §2 decisions (MAX_DIMENSION=2000 shared constant; UI reflects clamped value; Approach A; UX no toast; branch) → Task 1 (constants), Task 2 (UI reflect), Task 3 (safety net), this whole plan (branch).
  - Spec §3 architecture (settings-schema add, script.js modify, no new files) → File Structure + Tasks 1-3.
  - Spec §4 behavior:
    - `clampDimension` contract → Task 1 tests + impl ✓
    - sanitizeSettings keeps NaN→defaults (no behavior change) → Task 1 Step 3 (pure literal-to-constant substitution; existing 8 tests stay green) ✓
    - 5 UI write paths clamp + reflect → Task 2 Steps 2-6 ✓
    - Convert-time net in `processImage` → Task 3 ✓
  - Spec §5 testing (clampDimension unit tests; existing 54 stay green; manual smoke) → Task 1 tests, Task 4 Step 3 manual smoke ✓
  - Spec §6 out-of-scope items not introduced.
  - Spec §7 tracker impact → Task 5 ✓
  - Spec §8 risks/mitigations are addressed: convert-time net (Task 3) covers the "missed UI path" risk; existing tests pin sanitizeSettings semantic equivalence (Task 1); UI reflects clamped value (Task 2); share snapshot is taken from the clamped canvas (Task 3 effect — `currentShareImage` is `toDataURL` of `this.canvas` which is now sized to `clampDimension(settings.width)` in processImage).

- **Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has expected output.

- **Type consistency:** `clampDimension(n) → integer`, `MIN_DIMENSION = 10`, `MAX_DIMENSION = 2000` used consistently across tasks. `clampInt(value, min, max, fallback)` in `sanitizeSettings` retained verbatim with only literal-to-constant substitution. Slider `value` property assignment uses the clamped number consistently in Tasks 2 Step 3 / Step 4 / Step 5 / Step 6.

- **Honest limitation:** Tasks 2 and 3 (DOM glue) have no automated coverage — pre-existing D1 (no jsdom). Task 4 Step 3 is the explicit manual smoke checklist that must be performed before Task 5 lands. The pure module additions (Task 1) are fully TDD-covered.
