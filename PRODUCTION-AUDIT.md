# Production Readiness Audit

**Date:** 2026-03-07
**Status:** All Issues Resolved

---

## Issue Tracker

### Legend

- **Status:** `[ ]` = Open, `[x]` = Fixed
- **Severity:** CRITICAL > HIGH > MEDIUM > LOW
- **Verified:** Each issue below was verified against the actual source code

---

## CRITICAL - Must Fix Before Launch

### 1. [x] Stored XSS via unsafe DOM insertion in view.html (share viewer)

- **File:** `public/view.html:387`
- **Severity:** CRITICAL
- **Verified:** YES - The container renders attacker-controlled HTML from Redis without sanitization

**The problem:** Anyone can POST arbitrary HTML to `/api/share` (no auth required). The resulting share link renders that HTML in every visitor's browser. An attacker can inject event handlers like `<img src=x onerror=...>` into the colorized ASCII data.

**Fix:** Install DOMPurify. Sanitize HTML allowing only `<span>` with `style` attribute before rendering. Fallback to `textContent` if sanitization strips everything.

---

### 2. [x] Stored XSS via stats overlay in view.html

- **File:** `public/view.html:405-414`
- **Severity:** CRITICAL
- **Verified:** YES - `shareSettings.width` and `shareSettings.height` come from Redis and are interpolated into unsafe DOM insertion

**The problem:** An attacker can set `settings.width` to an HTML payload in their POST body. This executes in every viewer's browser when the stats overlay renders.

**Fix:** Coerce `width`, `height`, and `views` to integers with `parseInt(..., 10) || 0` before rendering. Build DOM nodes manually.

---

### 3. [x] Reflected XSS in view.html showError function

- **File:** `public/view.html:460-468`
- **Severity:** CRITICAL
- **Verified:** YES - `showError(message)` uses unsafe DOM insertion with `${message}` which comes from API error responses

**The problem:** If the API returns a crafted error message, it gets rendered as HTML. The `message` parameter flows from `data.error` (line 364) which comes from the API response.

**Fix:** Use `textContent` or `createElement` instead of unsafe DOM insertion for the error display.

---

## HIGH - Should Fix Before Launch

### 4. [x] XSS in script.js error display

- **File:** `src/script.js:616`
- **Severity:** HIGH
- **Verified:** YES - Error message rendered with unsafe DOM insertion

**The problem:** Error messages from image processing exceptions are rendered unsafely. While current error messages are benign browser strings, any future code path could introduce attacker-controlled content.

**Fix:** Replace with createElement + textContent:
```javascript
const p = document.createElement('p');
p.className = 'placeholder error';
p.textContent = `Error: ${error.message}`;
output.replaceChildren(p);
```

---

### 5. [x] No payload size limit on share API

- **File:** `api/share.js:21-51`
- **Severity:** HIGH
- **Verified:** YES - No validation on `ascii` field size before Redis write

**The problem:** POST body can be arbitrarily large. A full-color high-res ASCII render produces megabytes of HTML spans. Attacker can exhaust Redis storage quota and Vercel function memory. Vercel's default limit is 4MB per invocation, but that's still very large for repeated abuse.

**Fix:** Add byte-length check at the start of POST handler:
```javascript
const bodySize = JSON.stringify(req.body).length;
if (bodySize > 2_000_000) { // 2MB limit
  return res.status(413).json({ error: 'Payload too large' });
}
```

---

### 6. [x] No rate limiting on share API

- **File:** `api/share.js` (entire handler)
- **Severity:** HIGH
- **Verified:** YES - No throttling mechanism present

**The problem:** Any IP can POST unlimited share links, flooding Redis with 30-day-TTL records and driving up Upstash costs.

**Fix:** Use `@upstash/ratelimit` (natural fit since Redis is already configured):
```javascript
import { Ratelimit } from '@upstash/ratelimit';
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
});
```

---

### 7. [x] API error details leaked to client

- **File:** `api/share.js:84`
- **Severity:** HIGH
- **Verified:** YES - `details: error.message` in 500 response

**The problem:** Redis connection errors, TLS failures, and parse errors can leak internal infrastructure details (hostnames, token format) to any caller.

**Fix:** Remove `details` field from the response. Keep `console.error` for server-side logging.

---

### 8. [x] No share ID validation on GET endpoint

- **File:** `api/share.js:56-62`
- **Severity:** HIGH
- **Verified:** YES - `id` from query string used directly in `redis.get(\`img:${id}\`)`

**The problem:** No format validation on the `id` parameter. Attacker can probe with arbitrary strings like `../admin`, very long strings, or special characters.

**Fix:** Validate nanoid format: `if (!/^[A-Za-z0-9_-]{10}$/.test(id)) return res.status(400).json({ error: 'Invalid share ID' });`

---

### 9. [x] Wildcard CORS allows any origin to use share API

- **File:** `api/share.js:12` + `vercel.json:15`
- **Severity:** HIGH
- **Verified:** YES - `Access-Control-Allow-Origin: *` in both locations

**The problem:** Any website can call `/api/share` from a user's browser, creating share records and burning Redis quota without the user visiting your app.

**Fix:** Restrict to production domain + localhost for dev. Remove static CORS headers from `vercel.json` (let the function code control them to avoid duplication).

---

### 10. [x] No file size limit before image processing

- **File:** `src/script.js:524-589`
- **Severity:** HIGH
- **Verified:** YES - No check between file selection and `reader.readAsDataURL(file)`

**The problem:** Loading a 500MB+ image will freeze the browser tab. The data URL alone could consume hundreds of MB of memory.

**Fix:** Add check after line 531:
```javascript
if (file.size > 50 * 1024 * 1024) {
  this.showToast('File too large. Maximum size is 50MB.', 'error');
  return;
}
```

---

### 11. [x] Dependency vulnerabilities (npm audit)

- **File:** `package.json`
- **Severity:** HIGH (rollup) + MODERATE (esbuild, vite)
- **Verified:** YES - `npm audit` confirms 3 vulnerabilities

| Package | Severity | Issue |
|---------|----------|-------|
| rollup 4.0.0-4.58.0 | HIGH | Arbitrary file write via path traversal |
| esbuild <=0.24.2 | MODERATE | Dev server cross-origin request leak |
| vite (transitive) | MODERATE | Inherits esbuild issue |

**Note:** These affect dev/build environment only, not deployed runtime. Still should be fixed.

**Fix:** `npm audit fix` for rollup (non-breaking). `npm audit fix --force` for esbuild/vite (major version bump to vite@7, requires testing).

---

## MEDIUM - Should Address

### 12. [x] No Content Security Policy headers

- **File:** `vercel.json`
- **Severity:** MEDIUM
- **Verified:** YES - No CSP, X-Content-Type-Options, X-Frame-Options, or Referrer-Policy headers

**The problem:** Without CSP, any XSS that gets through has unrestricted access. CSP would serve as a defense-in-depth layer.

**Fix:** Add headers block in `vercel.json` with CSP, X-Content-Type-Options: nosniff, X-Frame-Options: DENY, and Referrer-Policy: strict-origin-when-cross-origin. Note: `style-src 'unsafe-inline'` needed because both pages use inline `<style>` blocks.

---

### 13. [x] File name injected into HTML export without escaping

- **File:** `src/script.js:999`
- **Severity:** MEDIUM
- **Verified:** YES - `<title>${imageName} - ASCII Art</title>` with unescaped user filename

**The problem:** A file named with HTML characters embeds those into the downloaded HTML file. Lower risk since it's a local download, but could be weaponized if users share HTML exports.

**Fix:** Use the existing `this.escapeHtml()` method on the filename before interpolating.

---

### 14. [x] localStorage settings deserialized without type validation

- **File:** `src/script.js:103-108`
- **Severity:** MEDIUM
- **Verified:** YES - `{ ...defaults, ...JSON.parse(saved) }` with no type coercion

**The problem:** Malicious values from localStorage (writable by any same-origin script or browser extension) flow into template literals in `setupUI()` at line 135. Non-numeric values for `fontSize` or `lineHeight` could break rendering or introduce injection.

**Fix:** Add a `sanitizeSettings()` function that coerces each field to its expected type (parseInt for numbers, includes-check for enums, Boolean for flags) after JSON.parse.

---

### 15. [x] Math.max() crash on empty array in PNG export

- **File:** `src/script.js:933` + `public/view.html:501`
- **Severity:** MEDIUM
- **Verified:** YES - `Math.max(...lines.map(...))` returns `-Infinity` if text is empty

**The problem:** If `this.currentAscii.text` is empty or only newlines, `Math.max(...[])` returns `-Infinity`, creating a canvas with invalid dimensions that fails silently.

**Fix:** Guard with: `const maxWidth = lines.length > 0 ? Math.max(...lines.map(l => ctx.measureText(l).width)) : 100;`

---

### 16. [x] canvas.toBlob callback doesn't handle null blob

- **File:** `src/script.js:982` + `public/view.html:517`
- **Severity:** MEDIUM
- **Verified:** YES - No null check in toBlob callback

**The problem:** Some browsers return null if the canvas is tainted or has invalid dimensions. The callback would then call `downloadBlob(null, ...)` which crashes.

**Fix:** Add null guard at the start of the toBlob callback.

---

### 17. [x] Duplicate CORS configuration

- **File:** `api/share.js:12-14` + `vercel.json:11-20`
- **Severity:** MEDIUM
- **Verified:** YES - CORS headers set in both places

**The problem:** Maintaining CORS config in two places creates confusion and potential conflicts.

**Fix:** Remove CORS headers from `vercel.json` and keep them only in the function code (where you need dynamic origin checking anyway after fixing the wildcard issue).

---

### 18. [x] Lock file excluded from version control

- **File:** `.gitignore` (lines 3-5)
- **Severity:** MEDIUM
- **Verified:** YES - `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` all gitignored

**The problem:** Without a committed lock file, `npm install` may resolve different dependency versions across environments, causing inconsistent builds.

**Fix:** Remove `package-lock.json` from `.gitignore`. Run `npm install` to generate it, then commit it.

---

### 19. [x] File name displayed via unsafe DOM insertion in image preview

- **File:** `src/script.js:543-547`
- **Severity:** MEDIUM
- **Verified:** YES - User filename is interpolated into unsafe DOM context

**The problem:** The user-selected filename is injected into an unsafe DOM context. While this is a local file (user-selected), files can have names containing HTML-significant characters on some systems.

**Fix:** Use createElement + textContent, or escape the filename before interpolating.

---

## LOW - Nice to Have

### 20. [x] No test suite

- **File:** `package.json`
- **Severity:** LOW
- **Verified:** YES - No test runner, no test files

**The problem:** Core algorithms (Sobel edge detection, brightness/contrast, pixel-to-ASCII mapping, ANSI color conversion) have no automated tests. Regressions can be introduced silently.

**Fix:** Add Vitest. Write unit tests for `pixelsToAscii()`, `adjustBrightnessContrast()`, `applyEdgeDetection()`, and `toAnsiColor()`.

---

### 21. [x] Accessibility gaps

- **File:** `src/script.js:280`, toolbar buttons throughout
- **Severity:** LOW
- **Verified:** YES - No ARIA attributes on ASCII output, emoji-only button labels

**The problem:**
- ASCII output container has no `role="img"` or `aria-label`
- Toolbar buttons use emoji + text but no `aria-label` for the combined meaning
- No skip-navigation links

**Fix:** Add `role="img" aria-label="ASCII art output"` to the output container. Add `aria-label` to toolbar buttons.

---

### 22. [x] Unnecessary DOM append in downloadBlob

- **File:** `src/script.js:1035-1044`
- **Severity:** LOW
- **Verified:** YES - Anchor element appended to DOM before click, then removed after

**The problem:** The anchor element doesn't need to be appended to the DOM for `click()` to trigger a download in modern browsers. The append/remove is unnecessary clutter.

**Fix:** Remove the `appendChild` and `removeChild` calls. Just `a.click()` directly.

---

## Rejected Findings (False Positives)

These were flagged by the initial audit but are NOT real issues:

| Finding | Why It's Not an Issue |
|---------|----------------------|
| "Canvas memory leak in constructor (line 77)" | The canvas is intentionally reused as a single instance. This is the correct pattern - creating/destroying per conversion is worse for performance and GC. |
| "Window resize listener added multiple times" | `init()` is only called once from the constructor. No duplicate listeners. |
| "Vite config missing minification" | Vite uses esbuild minification by default in production builds. No explicit config needed. |
| "Inline critical CSS causes FOUC" | Backwards - inline critical CSS *prevents* FOUC. This is a best practice. |
| "Promise chain vs async/await in copyAscii" | Style preference, not a bug. The .then/.catch pattern handles errors correctly. |

---

## Suggested Fix Order

**Phase 1 - Security (Issues 1-9):** Fix all XSS vectors and API hardening
- Install DOMPurify, sanitize all dynamic DOM insertions
- Add rate limiting, payload size validation, share ID validation
- Restrict CORS, remove error detail leaks

**Phase 2 - Robustness (Issues 10, 15-16, 18):** File limits, error guards, lock file
- Add file size check before processing
- Guard Math.max() and toBlob() edge cases
- Commit lock file

**Phase 3 - Config (Issues 11-12, 17):** Dependencies, security headers, CORS cleanup
- Run npm audit fix
- Add CSP and security headers to vercel.json
- Deduplicate CORS config

**Phase 4 - Code Quality (Issues 13-14, 19-22):** Escaping, validation, a11y, tests
- Escape filenames in exports and previews
- Add localStorage schema validation
- Add ARIA attributes
- Add Vitest test suite

---

## Stats

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 8 |
| MEDIUM | 8 |
| LOW | 3 |
| **Total** | **22** |
| Rejected (false positives) | 5 |
