# Production Hardening Design

**Date:** 2026-03-07
**Branch:** Single branch, all fixes sequential, tested after each
**Issues:** 22 verified from PRODUCTION-AUDIT.md

---

## Problem

The Image-to-ASCII converter is feature-complete but has critical security vulnerabilities (stored XSS via share links), API hardening gaps (no rate limiting, no payload limits, wildcard CORS), and several robustness/quality issues that prevent safe production deployment.

## Decisions

### XSS Mitigation: Hybrid Approach

- **DOMPurify** (new dependency, ~7KB gzipped) for the one location that genuinely needs HTML: colorized ASCII rendering in `view.html`. Strict allowlist: `<span>` tag with `style` attribute only.
- **textContent / createElement** everywhere else: error displays, stats overlay, file info preview, showError(). These locations don't need HTML.
- **escapeHtml()** for string interpolation into HTML templates (export filenames).

### API Hardening

- **@upstash/ratelimit** (new dependency) for rate limiting: 10 creates/minute per IP via sliding window.
- **Payload validation:** 2MB max body size check before Redis write.
- **Share ID validation:** Regex `/^[A-Za-z0-9_-]{10}$/` on GET requests.
- **Error sanitization:** Remove `error.message` from 500 responses.
- **CORS:** Replace wildcard with explicit origin allowlist. Single source of truth in function code (remove from vercel.json).

### Security Headers

Added to `vercel.json` for all routes:
- `Content-Security-Policy`: self + unsafe-inline for styles + blob/data for images
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Dependencies

- Upgrade to vite@7 (fixes esbuild + vite vulnerabilities)
- `npm audit fix` for rollup
- Add `dompurify`, `@upstash/ratelimit` as production deps
- Add `vitest` as dev dep

### Client Hardening

- 50MB file size limit before readAsDataURL()
- sanitizeSettings() with type coercion for localStorage
- Math.max() empty array guard in PNG export
- canvas.toBlob() null blob check
- Remove unnecessary DOM append in downloadBlob()
- ARIA attributes on ASCII output and toolbar buttons

### Build/Config

- Commit package-lock.json (remove from .gitignore)

### Testing

- Add Vitest
- Extract core algorithms as testable pure functions
- Unit tests for: adjustBrightnessContrast(), pixel-to-ASCII mapping, edge detection, ANSI color conversion

## Files Modified

| File | Changes |
|------|---------|
| `public/view.html` | DOMPurify for ASCII render, textContent for stats/errors, toBlob null check, Math.max guard |
| `src/script.js` | textContent for errors/fileinfo, escapeHtml for exports, file size limit, settings validation, Math.max guard, toBlob null check, downloadBlob cleanup, ARIA attributes |
| `api/share.js` | Rate limiting, payload size limit, ID validation, error sanitization, CORS restriction |
| `vercel.json` | Security headers, remove CORS (moved to code) |
| `package.json` | Add dompurify, @upstash/ratelimit, vitest |
| `.gitignore` | Remove lock file exclusion |
| `tests/*` | New test files for core algorithms |
| `PRODUCTION-AUDIT.md` | Mark all issues as fixed |

## Out of Scope

Tracked in FUTURE-IMPROVEMENTS.md:
- Class refactor into modules
- Move view.html inline script to external module
- Service worker / offline support
- Dynamic OG images per share link

## Fix Order

22 fixes applied sequentially. Each tested before moving to the next.
See implementation plan for detailed steps.
