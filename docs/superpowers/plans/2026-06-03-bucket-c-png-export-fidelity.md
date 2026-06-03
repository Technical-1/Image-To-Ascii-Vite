# Bucket C — PNG Export Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the color-mode PNG export size the canvas from the **same per-cell advances it draws with**, so a non-monospace custom charset (e.g. emoji glyphs wider than `M`) no longer overlaps cells or clips at the right edge, while preserving the monospace fast-path for the default charsets.

**Architecture:** `exportAsPng` currently sizes the canvas from `measureText(line)` but advances every colored cell by a single `measureText('M')` width — fine for monospace, wrong for emoji. We resolve this by computing one `advanceFor(char)` function: a constant `M`-width for the default charsets, or per-glyph `measureText(char)` when the active charset is `custom`. Both the canvas width and the draw loop use it, and a tiny pure helper `sumAdvances(line, advanceFor)` (code-point-aware, unit-tested) computes per-line width so the canvas can never be narrower than what we draw.

**Decision (resolved up front):** Option **(b)** — keep the single-`measureText('M')` fast path for the built-in monospace charsets (preserves the hub-174 perf win), and switch to per-cell measurement **only** when `charsetType === 'custom'` in a color mode. We do **not** unconditionally per-cell-measure, because that would regress the common-case export speed at large grid sizes.

**Tech Stack:** Vanilla ES modules, Vite 8, Vitest 4 (node env for the pure helper). Canvas mechanics stay in `script.js`. No new dependencies.

**Covers Project Hub tasks:** 1108 (PNG color export overflows non-monospace emoji charsets).

**Conventions:** Conventional-commit messages; reference `(hub-1108)`. Commits authored by Jacob, no AI/assistant attribution (global git rules).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/ascii-core.js` | Pure, DOM-free render helpers (already holds `lineToCells`) | **Modify** — add `sumAdvances` |
| `tests/ascii-conversion.test.js` | Unit tests for the pure core | **Modify** — add `describe('sumAdvances')` |
| `src/script.js` | `exportAsPng` (canvas sizing + color draw loop) | **Modify** — compute `advanceFor`, use it for sizing and drawing |

`sumAdvances` lives next to `lineToCells` because both turn a rendered line into per-cell draw data and both must iterate by code point.

---

### Task 1: `sumAdvances` pure helper

**Files:**
- Modify: `src/ascii-core.js` (add after `lineToCells`, ~line 148)
- Test: `tests/ascii-conversion.test.js`

- [ ] **Step 1: Write the failing tests**

Extend the import block at the top of `tests/ascii-conversion.test.js` (lines 5-16) to add `sumAdvances`:

```js
// add to the existing import list from '../src/ascii-core.js':
    sumAdvances,
```

Append at the end of the file:

```js
describe('sumAdvances', () => {
  it('sums a constant advance across a monospace line', () => {
    expect(sumAdvances('abc', () => 10)).toBe(30);
  });
  it('counts a surrogate-pair emoji as ONE cell (code-point iteration)', () => {
    // UTF-16 indexing would see 4 code units → 28; code-point iteration sees 2 → 14.
    expect(sumAdvances('🎨🔥', () => 7)).toBe(14);
  });
  it('supports a variable per-glyph advance', () => {
    expect(sumAdvances('ab', (ch) => (ch === 'a' ? 5 : 3))).toBe(8);
  });
  it('returns 0 for an empty line', () => {
    expect(sumAdvances('', () => 9)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/ascii-conversion.test.js`
Expected: FAIL — `sumAdvances is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/ascii-core.js`, after `lineToCells` (~line 148), add:

```js
/**
 * Sum per-cell horizontal advances across a rendered line, iterating by code
 * point so a surrogate-pair emoji counts as ONE cell (matching lineToCells and
 * the ASCII grid column count). `advanceFor(char)` returns the advance for one
 * glyph. The PNG exporter sizes its canvas from the SAME advances it draws with,
 * so a non-monospace custom charset can't overflow or clip. hub-1108.
 */
export function sumAdvances(line, advanceFor) {
    let width = 0;
    for (const ch of line) width += advanceFor(ch);
    return width;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/ascii-conversion.test.js`
Expected: PASS — all four `sumAdvances` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/ascii-core.js tests/ascii-conversion.test.js
git commit -m "feat: add code-point-aware sumAdvances helper for PNG sizing (hub-1108)"
```

---

### Task 2: Use `advanceFor` for canvas sizing and color drawing

**Files:**
- Modify: `src/script.js` import (line 14 block, from `./ascii-core.js`); `exportAsPng` (~1236-1329)

This is canvas code; jsdom cannot measure real glyphs, so it is verified by the manual checklist in Task 3. The pure sizing math is already locked by Task 1.

- [ ] **Step 1: Import `sumAdvances`**

In the `./ascii-core.js` import (lines 5-14), add `sumAdvances` to the named imports:

```js
import {
    adjustBrightnessContrast,
    weightedLuminance,
    charForBrightness,
    applyEdgeDetection,
    escapeHtml,
    prepareGlyphs,
    colorCellStyle,
    lineToCells,
    sumAdvances,
} from './ascii-core.js';
```

- [ ] **Step 2: Define `advanceFor` and size the canvas from it**

In `exportAsPng`, after the font is first set (`ctx.font = ...`, ~line 1248) and after `const lines = ...` (~1251), replace the `maxWidth` computation (line 1252) so sizing uses the per-cell advance model.

Replace:

```js
const lines = this.currentAscii.text.split('\n').filter(l => l.length > 0);
const maxWidth = lines.length > 0 ? Math.max(...lines.map(line => ctx.measureText(line).width)) : 100;
```

with:

```js
const lines = this.currentAscii.text.split('\n').filter(l => l.length > 0);

// Per-cell advance: constant 'M' width for the built-in monospace charsets
// (keeps the hub-174 measure-once fast path), but per-glyph measurement for a
// custom charset in a color mode, where emoji are wider than 'M'. hub-1108.
const isCustomColor = colorMode !== 'grayscale' && this.settings.charsetType === 'custom';
const monoCharWidth = ctx.measureText('M').width;
const advanceFor = isCustomColor ? (ch) => ctx.measureText(ch).width : () => monoCharWidth;

// Size the canvas from the SAME advances we draw with, so a custom charset
// can never overflow the right edge or clip.
const maxWidth = lines.length > 0
    ? Math.max(...lines.map((line) => sumAdvances(line, advanceFor)))
    : 100;
```

Then **remove** the now-duplicate `monoCharWidth` declaration that currently lives after the resize (~line 1284), since it is defined above:

```js
// DELETE this line (now declared earlier):
const monoCharWidth = ctx.measureText('M').width;
```

Note: `ctx.font` is set identically before sizing (line 1248) and again after the resize (line 1279); `measureText` depends only on the font, so measuring advances before the resize is correct.

- [ ] **Step 3: Use `advanceFor` in the color draw loop**

In the color branch (`if (colorMode !== 'grayscale' && this.currentAscii.colors)`, ~1286-1311), update the per-cell loop to advance by the measured width and size the background rect to match. Replace the inner `for (let x ...)` body with:

```js
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
```

(The grayscale `else` branch that draws whole lines at once is unchanged.)

- [ ] **Step 4: Verify suite + build**

Run: `npm test`
Expected: PASS (pure helper covered; no tested code path changed behavior).

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/script.js
git commit -m "fix: size and draw PNG color export with per-cell advances so emoji charsets don't overflow (hub-1108)"
```

---

### Task 3: Manual smoke verification

No browser automation (per project verification preference). Walk this with `npm run dev`.

- [ ] **Step 1: Custom emoji charset, color mode**

1. Upload a small image (keep cells under the color budget, e.g. 80×60).
2. Charset → **Custom...**, paste a few emoji (e.g. `🎨🔥💚`).
3. Color Mode → **RGB** (or Full RGB).
4. Click **🖼️ PNG**, open the downloaded file.
5. Expected: every emoji cell's colored background block aligns with its glyph, cells don't overlap, and nothing is clipped at the right edge. The PNG matches the on-screen layout.

- [ ] **Step 2: Default charset regression (fast path intact)**

1. Charset → **Standard**, Color Mode → **RGB**, export PNG.
2. Expected: visually identical to before this change (monospace columns, tight grid) and the export completes promptly even at higher resolutions.

- [ ] **Step 3: Grayscale unchanged**

1. Color Mode → **Grayscale**, export PNG. Expected: green-on-black text export exactly as before.

- [ ] **Step 4: Oversize guard still works**

1. Push resolution/font high enough to exceed the `MAX_CANVAS_DIMENSION` guard. Expected: the **"PNG export too large for this browser…"** toast still fires (this guard is untouched).

- [ ] **Step 5: Commit (only if a tweak was needed)**

If smoke surfaced an adjustment, apply it, re-run `npm test`, and commit with a `fix:` message referencing `hub-1108`.

---

## Self-Review

- **Spec coverage:** hub-1108 → Task 1 (`sumAdvances`) + Task 2 (canvas sized and drawn via `advanceFor`). ✅
- **Type consistency:** `advanceFor(char) → number` and `sumAdvances(line, advanceFor) → number` are used consistently; `monoCharWidth` is declared exactly once (the later duplicate is explicitly deleted). The color branch still consumes `lineToCells(...)` cells `{ char, style }`. ✅
- **Placeholder scan:** all steps show full code; the delete step names the exact line to remove. ✅
- **Open questions resolved:** sizing-vs-drawing divergence eliminated by a single advance model; per-cell measurement scoped to `custom` color charsets only (fast path preserved) — chosen deliberately, not left open. ✅
