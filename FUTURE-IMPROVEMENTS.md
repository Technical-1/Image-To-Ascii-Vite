# Future Improvements

**Created:** 2026-03-07
**Status:** Deferred - To be tackled after production hardening is complete

These items were identified during the production readiness audit but are not security/correctness issues. They improve maintainability, performance, and user experience.

---

## Architectural

### [ ] Refactor ImageAsciiConverter into smaller modules

- **Current:** Single 1080-line class handles UI, image processing, export, and sharing
- **Target:** Split into ~4 focused modules:
  - `UIManager` — setupUI, attachEventListeners, applySettings
  - `ImageProcessor` — processImage, pixelsToAscii, edgeDetection, adjustBrightnessContrast
  - `ExportManager` — exportAsTxt, exportAsPng, exportAsHtml, downloadBlob
  - `ShareManager` — shareAscii and related functions
- **Why:** Easier to test, maintain, and reason about. Each module has a single responsibility.

---

### [ ] Move view.html inline script to external module

- **Current:** `public/view.html` has a ~225-line inline `<script>` block
- **Target:** Extract to `src/viewer.js` (or similar), bundle with Vite
- **Why:** Enables strict CSP without `'unsafe-inline'` for `script-src`. Also allows imports (e.g., DOMPurify) without a CDN script tag.

---

## Features

### [ ] Add service worker for offline support

- **What:** Cache the app shell and static assets so the converter works without network
- **Note:** The share feature requires network, but the core image-to-ASCII conversion is fully client-side and should work offline
- **Consider:** Using Vite's PWA plugin (`vite-plugin-pwa`)

---

### [ ] Dynamic OG images per share link

- **Current:** All share links show the same generic OG preview image
- **Target:** Generate a per-share OG image (screenshot of the ASCII art) at share creation time
- **Approach options:**
  - Server-side: Use `@vercel/og` to render a preview at share time
  - Client-side: Use the existing canvas PNG export to generate a preview image, upload as part of the share payload
- **Why:** Share links on iMessage/Twitter/LinkedIn would show the actual ASCII art instead of a generic logo

---

## Notes

- Tackle these after the production hardening branch is merged and deployed
- Each of these could be its own branch/PR
- The module refactor should come before the viewer script extraction (since it establishes the module pattern)
