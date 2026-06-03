# Bucket B — Input-Boundary & Unicode Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the two untrusted-input boundaries that still have gaps: cap the custom charset by **code point** (not UTF-16 code unit) so an emoji can't be bisected into a lone surrogate (Hub #1109), and reject SVG / zero-intrinsic-size uploads up front so the user never sees a "loaded successfully" toast immediately followed by an "Error:" (Hub #1107).

**Architecture:** Hub #1109 is a pure-logic fix shared by `sanitizeSettings` and the live input handler — extract a `capGraphemes(str, max)` helper (grapheme-aware via `Array.from`, mirroring `prepareGlyphs` from `ascii-core.js`) and unit-test it. Hub #1107 is a DOM-path guard in `handleFileSelect`: an explicit MIME rejection for `image/svg+xml` plus a `naturalWidth`/`naturalHeight` check inside `previewImg.onload` before the success toast.

**Tech Stack:** Vanilla ES modules, Vite 8, Vitest 4 (node env for the pure helper). No new dependencies.

**Covers Project Hub tasks:** 1109 (surrogate-pair split in the 200-char cap), 1107 (MIME-only upload accepts SVG/zero-size).

**Conventions:** Conventional-commit messages; reference `(hub-1109)` / `(hub-1107)`. Commits authored by Jacob, no AI/assistant attribution (global git rules).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/settings-schema.js` | Pure settings sanitize/clamp contract | **Modify** — add `capGraphemes`, use it in `sanitizeSettings` |
| `tests/settings-schema.test.js` | Unit tests for the contract | **Modify** — add `describe('capGraphemes')` + a sanitize-level emoji case |
| `src/script.js` | Create-mode UI: custom-charset input + file upload | **Modify** — use `capGraphemes` at the live input; add SVG + zero-dimension guards in `handleFileSelect` |

No new files. The pure helper lives beside the existing slice it replaces.

---

### Task 1: `capGraphemes` helper + use in `sanitizeSettings`

**Files:**
- Modify: `src/settings-schema.js` (add helper near top; change the `customCharset` line, currently line 61)
- Test: `tests/settings-schema.test.js`

- [ ] **Step 1: Write the failing tests**

Extend the import on line 2 of `tests/settings-schema.test.js`:

```js
// line 2 becomes:
import { DEFAULT_SETTINGS, sanitizeSettings, capGraphemes } from '../src/settings-schema.js';
```

Append at the end of the file:

```js
describe('capGraphemes', () => {
  it('returns the string unchanged when under the cap', () => {
    expect(capGraphemes('abc', 200)).toBe('abc');
  });
  it('caps ASCII at exactly `max` code points', () => {
    expect(capGraphemes('a'.repeat(500), 200).length).toBe(200);
  });
  it('keeps an exactly-`max`-length string intact', () => {
    expect(capGraphemes('a'.repeat(200), 200).length).toBe(200);
  });
  it('caps emoji by code point without leaving a lone surrogate', () => {
    // 250 painters, each a surrogate pair (2 UTF-16 code units).
    const result = capGraphemes('🎨'.repeat(250), 200);
    // 200 code points...
    expect(Array.from(result)).toHaveLength(200);
    // ...which is 400 UTF-16 code units (pairs intact, none bisected)...
    expect(result.length).toBe(400);
    // ...and the string must not end on a dangling high surrogate.
    expect(result).not.toMatch(/[\uD800-\uDBFF]$/);
  });
  it('coerces non-string input to string first', () => {
    expect(capGraphemes(12345, 3)).toBe('123');
  });
});
```

Also add a sanitize-level regression so the wiring is covered:

```js
// add inside the existing describe('sanitizeSettings', ...) block:
it('caps customCharset by code point so emoji are never split (hub-1109)', () => {
  const s = sanitizeSettings({ customCharset: '🎨'.repeat(250) }, DEFAULT_SETTINGS);
  expect(Array.from(s.customCharset)).toHaveLength(200);
  expect(s.customCharset).not.toMatch(/[\uD800-\uDBFF]$/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/settings-schema.test.js`
Expected: FAIL — `capGraphemes is not a function`, and the emoji sanitize case fails (current `.slice(0, 200)` yields 200 code units = 100 emoji + a split tail).

- [ ] **Step 3: Implement the helper and wire it in**

In `src/settings-schema.js`, add the helper above `DEFAULT_SETTINGS` (after `clampDimension`, ~line 17):

```js
// Cap a string to `max` CODE POINTS without bisecting a surrogate pair.
// String#slice counts UTF-16 code units, so slicing at 200 can split an emoji
// into a lone high surrogate; Array.from is code-point-aware, matching the
// grapheme handling in ascii-core's prepareGlyphs (hub-177). hub-1109.
export function capGraphemes(str, max) {
    const points = Array.from(String(str));
    return points.length <= max ? points.join('') : points.slice(0, max).join('');
}
```

Then change the `customCharset` line inside `sanitizeSettings` (line 61) from:

```js
customCharset: String(r.customCharset ?? defaults.customCharset).slice(0, 200),
```

to:

```js
customCharset: capGraphemes(r.customCharset ?? defaults.customCharset, 200),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/settings-schema.test.js`
Expected: PASS — including the existing `'coerces booleans and caps customCharset at 200 chars'` case (200 ASCII `a` → still length 200).

- [ ] **Step 5: Commit**

```bash
git add src/settings-schema.js tests/settings-schema.test.js
git commit -m "fix: cap customCharset by code point to avoid splitting surrogate pairs (hub-1109)"
```

---

### Task 2: Use `capGraphemes` at the live custom-charset input

**Files:**
- Modify: `src/script.js` import line 15; the custom-charset `input` handler (~616-624)

Verified by the suite (Task 1 covers the logic) + the manual check in Step 4.

- [ ] **Step 1: Import the helper**

Update `src/script.js` line 15 to include `capGraphemes` in the `settings-schema.js` import. If Bucket A has already been applied the line also contains `clampToSliderMax`; either way the result is:

```js
import { DEFAULT_SETTINGS, MIN_DIMENSION, MAX_DIMENSION, clampDimension, capGraphemes, sanitizeSettings, isColorRenderTractable } from './settings-schema.js';
```

(If `clampToSliderMax` from Bucket A is present, keep it in the list too.)

- [ ] **Step 2: Replace the code-unit slice in the input handler**

In the custom-charset handler (~616-624), change:

```js
const value = e.target.value.slice(0, 200);
```

to:

```js
// Code-point cap so the live ramp matches the sanitized (shared-link) value
// and never carries a lone surrogate. hub-1109.
const value = capGraphemes(e.target.value, 200);
```

- [ ] **Step 3: Verify suite + build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual check**

Run `npm run dev`, choose **Custom...** charset, paste a string of 250 emoji (e.g. repeated 🎨🔥💚). Expected: the rendered ASCII uses whole emoji glyphs (no � replacement boxes), and the input is capped at 200 emoji.

- [ ] **Step 5: Commit**

```bash
git add src/script.js
git commit -m "fix: cap live custom-charset input by code point (hub-1109)"
```

---

### Task 3: Reject SVG and zero-dimension uploads in `handleFileSelect`

**Files:**
- Modify: `src/script.js` — `handleFileSelect` MIME check (~758-761) and `previewImg.onload` (~781)

This is a DOM/decode path; jsdom does not decode real images, so it is verified by the manual checklist in Step 4. (A jsdom characterization test for the success/error toast split is added in Bucket D, Task D-T2, once the class is exported and a canvas stub exists.)

- [ ] **Step 1: Reject SVG at the MIME gate**

In `handleFileSelect`, immediately after the existing image-MIME check (the block ending with `return;` at ~761), add:

```js
// SVG has no reliable intrinsic raster size and can encode external refs; the
// share codec already excludes SVG (RASTER_DATA_URI), so the create path must
// match. Reject up front with a clear message instead of failing at draw time.
if (file.type === 'image/svg+xml') {
    this.showToast('SVG is not supported. Please use a PNG, JPEG, GIF, or WebP image.', 'error');
    return;
}
```

- [ ] **Step 2: Guard zero intrinsic dimensions before the success toast**

In `previewImg.onload`, insert the dimension guard right after the upload-token check (the first line of the handler, `if (this._uploadToken !== uploadToken) return;`) and before `imageInfo.textContent = '';`:

```js
// A decode can "succeed" with zero intrinsic size (a dimensionless image, or a
// malformed raster that slipped past the MIME check). drawImage with a 0×0
// source rect throws downstream, so reject here with a clear message instead of
// a misleading "Image loaded successfully!" followed by "Error:". hub-1107.
if (!previewImg.naturalWidth || !previewImg.naturalHeight) {
    previewContainer.classList.add('hidden');
    this.showToast('Could not read image dimensions. The file may be corrupt or an unsupported format.', 'error');
    return;
}
```

- [ ] **Step 3: Verify suite + build**

Run: `npm test`
Expected: PASS (no behavior change to tested pure code).

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual smoke checklist**

Run `npm run dev`, then:
1. Drag in a `.svg` file (or pick one via the file dialog). Expected: a single **"SVG is not supported…"** error toast; no preview, no success toast, no later "Error:" in the output.
2. Upload a normal `.png`/`.jpg`. Expected: unchanged happy path — preview appears, **"Image loaded successfully!"**, ASCII renders.
3. (Optional) Craft a 0-byte-dimension image; confirm the **"Could not read image dimensions…"** path fires cleanly with no contradictory success toast.

- [ ] **Step 5: Commit**

```bash
git add src/script.js
git commit -m "fix: reject SVG and zero-dimension uploads before the success toast (hub-1107)"
```

---

## Self-Review

- **Spec coverage:** hub-1109 → Task 1 (helper + `sanitizeSettings`) and Task 2 (live input). hub-1107 → Task 3 (SVG MIME reject + zero-dimension guard). ✅
- **Type consistency:** `capGraphemes(str, max)` used identically in `sanitizeSettings`, `script.js`, and all tests. The existing `'a'.repeat(500)` test still asserts `length === 200`, which `capGraphemes` satisfies (ASCII: 1 code point = 1 code unit). ✅
- **Placeholder scan:** all code and commands are concrete; toast strings are final copy. ✅
- **Open questions resolved:** SVG → explicitly rejected (not silently re-encoded), matching the share codec's raster allowlist; cap unit → code points everywhere. No decisions deferred. ✅
