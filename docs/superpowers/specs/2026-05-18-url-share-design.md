# URL-Encoded Sharing — Design Spec

**Date:** 2026-05-18
**Branch:** `feat/url-share` (off `fix/production-hardening` @ `b604129`)
**Status:** Approved (design); pending user spec review → implementation plan
**Tracker:** Resolves/retires `docs/STATUS-TRACKER.md` items A2, B1, B2, C1, C4,
C2, U1, U2, U3 (see §9).

---

## 1. Problem & Goal

The Share feature is backed by an Upstash Redis instance that **has been
deleted** (owner-confirmed). The feature is dead in production (HTTP 500), and
the backend carries a cluster of security/correctness debt (CDN-loaded
DOMPurify with no SRI, hardcoded CORS domain, ephemeral `VERCEL_URL` share
links, view-count race).

**Goal:** Replace server-backed sharing with **fully client-side, backend-free
sharing**: the entire shared artwork is encoded into the share URL itself.
Color modes must work. URL length is not a constraint; cross-platform
reliability is. The Redis backend and its dependencies are deleted entirely.

**Non-goals (v1):** recipient-editable shares (the chosen model enables this
nearly for free as a future fast-follow — explicitly out of scope here);
URL shortening; server-rendered social link previews.

## 2. Key Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| What to encode | **The input** (downscaled source image + settings), not the rendered output | Output (per-char color HTML) is ~300 KB and redundant; input is ~5–12 KB and the converter is deterministic |
| Regeneration | Viewer re-runs the shared `src/ascii-core.js` pipeline | App & viewer already share one deterministic core (commit `86458ba`) |
| Image format | **PNG (lossless)** | Recipient sees the *exact* art the creator made; universal browser support; a low-res grid is only a few KB |
| Transport | URL **fragment** (`#s=…`), base64url-encoded JSON | Fragment is never sent to any server → more private than Redis, no backend |
| Viewer topology | **Unified app with read-only view mode** (Approach A) | Deletes the separate viewer page + duplication; one conversion path |
| Backend | **Full deletion** | Redis already gone; nothing to migrate (all old links already dead) |
| Reversibility | All work on `feat/url-share` | `git checkout` reverts everything |

## 3. Architecture

Single-page app, two modes, one conversion path:

- **Create mode** (default, unchanged editor): the **Share** button no longer
  calls the network. It snapshots the downscaled canvas, builds a
  self-contained URL, and copies it to the clipboard.
- **View mode** (app loads with a `#s=` fragment): decode → validate →
  regenerate → render a read-only layout (ASCII output + export buttons +
  "Create your own" link; no upload/sidebar/sliders).

New module **`src/share-codec.js`** — pure, DOM-free, unit-testable
(mirrors the `ascii-core.js` pattern):

- `encodeShare({ settings, imageDataUri }) -> string` (the `s=` value)
- `decodeShare(fragmentValue) -> { v, settings, img }` (throws on malformed)
- `validateShare(decoded) -> { settings, img }` (version check + structural
  validation, then delegates settings clamping — see sanitization boundary
  below)

**Sanitization boundary (resolves a design ambiguity):** `sanitizeSettings`
currently lives as a method on `ImageAsciiConverter` (it is already DOM-free
logic). It will be **extracted into a pure module** (`src/ascii-core.js` or a
small `src/settings-schema.js`) so that: (a) create mode, view mode, and
`share-codec`'s validation all use the *same* clamp contract, and (b) it is
unit-testable without the DOM. `share-codec.validateShare` calls this pure
sanitizer; `script.js` no longer owns the only copy.

`script.js` owns the DOM/canvas glue; `share-codec.js` owns the
serialization + structural validation; the pure settings sanitizer owns the
clamp contract; `ascii-core.js` owns the conversion. Clear boundaries.

## 4. Payload Format

```
location.hash = "#s=" + base64url( utf8( JSON.stringify(payload) ) )

payload = {
  v: 1,                       // format version, forward-compat guard
  settings: { …current settings object, ~12 small fields… },
  img: "data:image/png;base64,…"   // downscaled canvas at settings.width × settings.height
}
```

- The `img` is the canvas snapshot taken **immediately after `drawImage` at the
  ASCII target size**, *before* edge detection / brightness / contrast / char
  mapping. The viewer reproduces all effects deterministically from
  `settings`.
- No extra compression layer: PNG is already compressed and the JSON wrapper
  is tiny. (Native `CompressionStream` on the wrapper is a possible future
  micro-optimization; deliberately omitted for simplicity — YAGNI.)
- Estimated URL size: ~5–12 KB for a typical 100×75 grid.

## 5. Data Flow

**Create (Share button):**
1. Produce the downscaled canvas at `settings.width × settings.height`
   (reuse/extract the existing `processImage` resize step; snapshot before
   effects).
2. `canvas.toDataURL('image/png')`.
3. `encodeShare({ settings, imageDataUri })`.
4. `shareUrl = location.origin + location.pathname + '#s=' + encoded`.
5. Copy to clipboard; success toast. No network, no await, no failure path.

**View (any app load):**
1. On init, check `location.hash` for the `s=` param.
2. `decodeShare` → `validateShare`: base64url-decode → `JSON.parse` →
   version check → run settings through the existing **`sanitizeSettings`**
   contract (clamps width/height ≤ 2000, enums, etc.).
3. Load `img` into an `Image`; draw onto the processing canvas at the
   **clamped** dimensions.
4. Run the existing pipeline: optional edge detection → `pixelsToAscii`
   (via `ascii-core.js`) → render.
5. Switch DOM to read-only view layout; wire existing export buttons
   (they already operate from `currentAscii`).
6. Any failure (bad base64 / JSON / version / image load) → friendly
   "This share link is invalid or corrupted" state with a create link.

## 6. Security

- Link data is attacker-controllable, but it is **never injected as HTML**.
  It is decoded to JSON; the image is drawn to a canvas (images cannot
  execute script — a malformed image fails to load → handled error state).
- `settings` pass through the existing `sanitizeSettings` clamps. This
  **also resolves tracker C2**: the view path reuses the same
  canvas-dimension clamp, so an oversized embedded image cannot freeze the
  tab.
- Grayscale output renders via `textContent`; color output builds spans
  with `escapeHtml` on each character (existing behavior). No
  link-controlled HTML reaches the DOM.
- Consequences:
  - **DOMPurify is no longer needed** (it existed only to sanitize
    server-supplied HTML) → removed.
  - **CSP tightens**: `script-src` → `'self'` (drop the `cdnjs`
    exception); remove the `/api/` rewrite and the API `connect-src`
    allowance. `style-src 'unsafe-inline'` stays (index.html still has an
    inline `<style>` for critical CSS).

## 7. Deletions (full replacement)

- Files: `api/share.js`, `public/view.html`, `public/viewer.js`.
- Dependencies: `@upstash/redis`, `@upstash/ratelimit`, `nanoid`,
  `dompurify`.
- Config: `/api/` rewrite in `vercel.json`; CORS / rate-limit / `VERCEL_URL`
  logic; CSP `cdnjs` + API allowances.
- Verify no other references before deleting (grep for each symbol/dep).

## 8. Testing

- **`tests/share-codec.test.js`** (Vitest, existing pattern):
  - encode → decode round-trip preserves settings + img exactly
  - version mismatch (`v` unknown) → rejected
  - malformed base64 / non-JSON / missing fields → safe throw, no crash
  - oversized / out-of-range settings → sanitized via the existing contract
  - URL-safety: encoded output contains only base64url characters
- Conversion correctness is already covered by `tests/ascii-conversion.test.js`
  (the `ascii-core.js` path the viewer reuses).
- Manual/e2e (ties to tracker D1, tracked separately): create → copy link →
  open in fresh tab → byte-identical render across color modes; invalid
  fragment → error state; verify under the tightened CSP.

## 9. Tracker Impact (`docs/STATUS-TRACKER.md`)

To be updated as part of this work:

- **Resolved by deletion / N/A:** A2 (share feature decision = replace),
  B1 (DOMPurify CDN — removed), B2 (CORS — removed), C1 (`VERCEL_URL` —
  removed), C4 (view-count race — removed), U1/U2/U3 (Upstash owner actions
  — no longer needed).
- **Resolved by reuse:** C2 (canvas clamp — view path shares
  `sanitizeSettings`).
- **Doc reconciliation (E-cluster):** E2 (PRODUCTION-AUDIT — note share
  backend removed), E3/E4 (.portfolio — architecture diagram drops the
  Server/Redis subgraph), E6 (FUTURE-IMPROVEMENTS — viewer-module item now
  moot), README (share section rewrite).

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Very long URLs break in SMS / some QR generators / link unfurlers | Accepted (user: length not a constraint); fragment means unfurlers show the generic OG image, never the art — documented behavior |
| Embedded low-res image is a (faint) recoverable copy of the source photo | By design & acceptable (user-approved); fragment never leaves the device-to-recipient channel; more private than the prior server-stored model |
| Future payload format change | `v` version field; `decodeShare` rejects unknown versions with a clear message |
| Regenerated art must equal the original | PNG is lossless + shared deterministic `ascii-core.js` ⇒ bit-identical reproduction |
| Old browsers can't encode PNG via canvas | `canvas.toDataURL('image/png')` is universally supported (baseline since forever) |

## 11. Out of Scope (future, explicitly deferred)

- Recipient-editable shared art (the store-input model makes this a small
  follow-up — separate spec).
- `CompressionStream` wrapper compression for marginally shorter URLs.
- URL shortening / dynamic OG preview images per share.
