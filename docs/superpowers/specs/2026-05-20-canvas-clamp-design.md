# Canvas Dimension Clamp — Design Spec

**Date:** 2026-05-20
**Branch:** `fix/canvas-clamp` (off `fix/production-hardening` @ `fb34e58`)
**Status:** Approved (design); pending user spec review → implementation plan
**Tracker:** Resolves `docs/STATUS-TRACKER.md` C2 (the one item explicitly held open after URL-share).

---

## 1. Problem & Goal

**Bug.** In create mode the width/height slider's `max` is set to the source image's full dimensions (`updateSliderMax` at `src/script.js:1192-1193`). The slider input handlers (`src/script.js:505-525`) and the resolution-% paths (`:486-499`, `:727-743`) assign `this.settings.width/height` with **no clamp**. `processImage()` then calls `getImageData(0, 0, width, height)`, so loading a 6000×4000 image and dragging width to 6000 allocates ~48 MB of pixel data and drives a 12 M-cell `pixelsToAscii` loop — the tab freezes. `sanitizeSettings` does cap width/height at 2000, but only on localStorage-load and share-decode; the create-mode UI paths bypass it.

**Goal.** Establish a single, system-wide maximum (2000) for ASCII grid dimensions and enforce it at every write path *and* at conversion time. The displayed slider/label values must always equal the value actually rendered. No behavior change for legitimate ≤2000 settings.

**Non-goals (v1):** introducing a stricter perf cap (could be a separate future pass), redesigning the resolution UI, performance work on `pixelsToAscii` itself, any clamp UX beyond reflecting the capped number (no toast).

## 2. Key Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Cap value | **`MAX_DIMENSION = 2000`** | Reuses the existing `sanitizeSettings` ceiling so the contract is uniform across slider/resolution/convert/localStorage/share. Zero behavior change for valid use. |
| Single source of truth | **Export from `src/settings-schema.js`** | Mirrors the existing extraction pattern (`EMPTY_CUSTOM_CHARSET_FALLBACK`, `VIEW_EXPORT_BUTTON_IDS`) — eliminates per-call-site drift. |
| Clamp location | **Every write path + convert-time safety net** (Approach A) | UI consistency at the write paths; convert-time clamp guarantees safety even if a future path is missed. |
| UX on clamp | **Reflect the capped value in the slider/label, no toast** | Matches the app's existing live-update UX. |
| Branch | **`fix/canvas-clamp` off `fix/production-hardening`** | Reversible via `git checkout`; standard pattern. |

## 3. Architecture

Two small surfaces, one shared contract.

- **`src/settings-schema.js` (pure, DOM-free):** exports `MIN_DIMENSION = 10`, `MAX_DIMENSION = 2000`, and a new pure helper `clampDimension(n)`. `sanitizeSettings` is refactored only to *use these constants* in its existing `clampInt(r.width, MIN_DIMENSION, MAX_DIMENSION, defaults.width)` / equivalent height call — its NaN→per-field default fallback is **preserved** (the existing "empty object → defaults" test must stay green). `clampDimension` is a different helper used by create-mode write paths and the convert-time net, where the right NaN fallback is `MIN_DIMENSION` (no per-call default available).
- **`src/script.js` (DOM/canvas glue):** imports `MAX_DIMENSION` and `clampDimension`. Every create-mode location that writes `settings.width`/`settings.height` runs the value through `clampDimension` and reflects the clamped value back into the slider + numeric label. `updateSliderMax` caps `slider.max` at `MAX_DIMENSION`. `processImage` (or `convertToAscii`) clamps the dims it actually feeds to `drawImage`/`getImageData` — the hard guarantee.

Existing module boundaries (settings-schema = pure schema/contract, ascii-core = pure conversion, script.js = DOM glue) are preserved.

## 4. Behavior

`clampDimension(n)` contract:
- `Number.isFinite(n) === false` → return `MIN_DIMENSION` (defensive fallback).
- Otherwise → `Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.round(n)))`.
- Output is always an integer in `[MIN_DIMENSION, MAX_DIMENSION]`.

`sanitizeSettings` is unchanged in shape — its `width`/`height` lines continue to use the existing `clampInt(value, min, max, fallback)` helper, with `MIN_DIMENSION`/`MAX_DIMENSION` substituted for the literal `10`/`2000`. Externally identical: bounded `[10, 2000]`, integer, NaN→`defaults.width`/`defaults.height`. Existing 8 settings-schema tests stay green by construction (pure substitution of constants for literals).

UI write paths (in `src/script.js`):
- **Width slider input handler (~505-513):** parse → `clampDimension` → write to `this.settings.width` → set `width-value` label AND `width-slider.value` to the clamped number.
- **Height slider input handler (~516-525):** symmetric.
- **Resolution-% select handler (~486-499):** clamp the computed `width` and `height` before assigning; update label + slider with the clamped result.
- **`handleFileSelect` resolution apply (~727-743):** same — clamp computed dims; update slider + label.
- **`updateSliderMax` (~1185-1194):** `widthSlider.max = Math.min(currentImage.width, MAX_DIMENSION)`; `heightSlider.max = Math.min(Math.round(currentImage.height/2), MAX_DIMENSION)`.

Convert-time safety net (in `processImage`):
- Derive `const width = clampDimension(this.settings.width);` and `const height = clampDimension(this.settings.height);` at the top of the `img.onload` callback, and use those for `this.canvas.width/height`, `drawImage`, and `getImageData`. Any code path that ever produces an out-of-range `this.settings.width/height` still cannot exceed 2000 at conversion. (The matching share-snapshot `toDataURL` then captures a canvas already at the clamped size, so a re-shared link is bit-identical.)

## 5. Testing

- **`tests/settings-schema.test.js`:** new cases for `clampDimension` — in-range passthrough; `>2000 → 2000`; `<10 → 10`; `NaN`/`Infinity`/`undefined` → `MIN_DIMENSION`; non-integer rounds (`123.7 → 124`). Add one assertion that `sanitizeSettings` still bounds `width`/`height` to `[10, 2000]` (existing coverage stays).
- **Build + full suite:** `npm test && npm run build` after each task. Existing 54 tests must continue to pass.
- **Manual browser smoke (tracker D1 — no jsdom):** load a >2000-wide image; pick "100%" → confirm slider & label cap at 2000 and output renders without freezing; drag width slider to its max → never exceeds 2000; verify share round-trip on the clamped value (already covered indirectly by the existing snapshot capture).

## 6. Out of Scope (explicit)

- Lowering `MAX_DIMENSION` for perf (separate future pass if needed).
- Toasting/announcing the clamp (decided no).
- Refactoring `pixelsToAscii` or color-mode performance.
- Touching the static `max="1000"` default in `setupUI()` markup (the runtime `updateSliderMax` overrides it on image load; the pre-image default is fine).

## 7. Tracker Impact (`docs/STATUS-TRACKER.md`)

- **C2** flips from `[ ]` to `[x]` with `RESOLVED 2026-05-20 by canvas-clamp (fix/canvas-clamp): shared MAX_DIMENSION constant; clamped at every UI write path and at conversion time; see docs/superpowers/specs/2026-05-20-canvas-clamp-design.md.` This is the last open item from the deep-dive cluster directly attributable to a code defect (D1 remains as the verification-gap meta-item).

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A path is missed in the write-path clamp sweep | The convert-time safety net in `processImage` guarantees no `getImageData` ever exceeds 2000 regardless of how settings got there. |
| `clampDimension` refactor of `sanitizeSettings` accidentally changes behavior | The existing 8 settings-schema tests pin current behavior; new tests pin `clampDimension`'s contract. A diff-only-touches-bounds review confirms semantic equivalence. |
| User confusion when "100%" on a >2000px image yields 2000 | The slider and numeric label both reflect the clamped value, so the displayed number equals the rendered number — consistent with the app's existing live-update UX. |
| Re-shared links from a clamped session might differ from the same image's "100%" on someone else's machine | They don't — `MAX_DIMENSION` is the same everywhere and the snapshot captures a canvas already at the clamped size. Bit-identical guarantee preserved. |
