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

## Features

### [ ] Add service worker for offline support

- **What:** Cache the app shell and static assets so the converter works without network
- **Note:** The core image-to-ASCII conversion is fully client-side (including sharing via URL fragment), so the whole app can work offline with a service worker
- **Consider:** Using Vite's PWA plugin (`vite-plugin-pwa`)

---

## Notes

- Tackle these after the production hardening branch is merged and deployed
- Each of these could be its own branch/PR
- The module refactor should come before the viewer script extraction (since it establishes the module pattern)
