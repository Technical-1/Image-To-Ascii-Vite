# Production Hardening Implementation Plan

> **⚠️ HISTORICAL DOCUMENT (2026-03-07).** This plan executed in March 2026 and resolved its 22 audited items, but the project moved substantially afterward (URL-share replaced the Redis backend; canvas-clamp resolved C2; the CSP that this plan shipped silently broke the share viewer and was later corrected). **For the current authoritative project status, see [`docs/STATUS-TRACKER.md`](../STATUS-TRACKER.md).** This file is kept only as a record of the original hardening sprint's intent.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 22 verified security, robustness, and quality issues identified in PRODUCTION-AUDIT.md to make the app production-ready.

**Architecture:** Single branch (`fix/production-hardening`), sequential fixes, tested after each. Hybrid XSS strategy: DOMPurify for colorized HTML, textContent/createElement everywhere else. API hardened with rate limiting, payload validation, and CORS restriction.

**Tech Stack:** Vite 7, DOMPurify, @upstash/ratelimit, Vitest

---

## Pre-Flight

### Task 0: Create branch and install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Create feature branch**

```bash
git checkout -b fix/production-hardening
```

**Step 2: Install new dependencies**

```bash
npm install dompurify @upstash/ratelimit
npm install -D vitest
```

**Step 3: Verify install succeeded**

Run: `npm ls dompurify @upstash/ratelimit vitest`
Expected: All three packages listed with versions, no errors

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dompurify, @upstash/ratelimit, vitest dependencies"
```

---

## Phase 1: Security -- XSS Fixes (Issues 1-7)

### Task 1: Fix stored XSS in view.html ASCII render (Issue #1)

**Files:**
- Modify: `public/view.html:346-347,386-390`

**Step 1: Add DOMPurify CDN script tag**

In `public/view.html`, add this line after line 345 (before the existing `<script>` tag). We use CDN here because `view.html` is a standalone static file not processed by Vite's bundler:

```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.4/purify.min.js"></script>
  <script>
```

**Step 2: Sanitize the HTML before rendering**

Replace lines 386-390 in `renderContent()` with code that sanitizes using DOMPurify configured with ALLOWED_TAGS: ['span'] and ALLOWED_ATTR: ['style']. The sanitized output is then set on the container. The else branch continues to use textContent for plain text.

**Step 3: Test**

- Open `public/view.html` in browser (via `npm run dev`)
- Check browser console for errors
- Verify the DOMPurify script loads (type `DOMPurify` in console -- should be defined)
- Manually test: in console run `DOMPurify.sanitize('<img src=x onerror=alert(1)><span style="color:red">A</span>')` -- should return only the span tag

**Step 4: Commit**

```bash
git add public/view.html
git commit -m "fix: sanitize shared ASCII HTML with DOMPurify to prevent stored XSS"
```

---

### Task 2: Fix stored XSS in view.html stats overlay (Issue #2)

**Files:**
- Modify: `public/view.html:403-414`

**Step 1: Replace unsafe DOM insertion with safe DOM construction**

Replace lines 403-414 in `renderContent()` with code that:
- Clears stats element with `textContent = ''`
- Creates two stat divs using `document.createElement`
- Sets icon text with `textContent` (eye emoji for views, ruler emoji for dimensions)
- Coerces values to integers: `parseInt(data.views, 10) || 1` for views, `parseInt(shareSettings.width, 10) || '?'` and same for height
- Sets dimension text as `${w}\u00D7${h}` using textContent
- Appends both stat divs to the stats element

**Step 2: Test**

- Load a shared ASCII art page
- Verify stats overlay shows correctly with view count and dimensions
- Check browser console for errors

**Step 3: Commit**

```bash
git add public/view.html
git commit -m "fix: replace stats unsafe DOM insertion with safe DOM construction"
```

---

### Task 3: Fix reflected XSS in view.html showError (Issue #3)

**Files:**
- Modify: `public/view.html:460-468`

**Step 1: Replace unsafe DOM insertion with safe DOM construction**

Replace the `showError` function with code that:
- Gets content element and clears it with `textContent = ''`
- Creates an error div with className 'error'
- Creates h2 with textContent 'Oops!'
- Creates p with textContent set to the message parameter
- Creates an anchor with href='/', className='create-btn', textContent='Create Your Own ASCII Art'
- Appends all to the error div, appends error div to content

**Step 2: Test**

- Navigate to `/view.html` with no `id` param -- should show error message safely
- Navigate to `/view.html?id=nonexistent` -- should show "Share not found" error safely
- Check browser console for errors

**Step 3: Commit**

```bash
git add public/view.html
git commit -m "fix: replace showError unsafe DOM insertion with safe DOM construction"
```

---

### Task 4: Fix XSS in script.js error display (Issue #4)

**Files:**
- Modify: `src/script.js:613-617`

**Step 1: Replace unsafe DOM insertion with safe DOM construction**

Replace the catch block content at lines 613-617 with code that:
- Creates a p element with className 'placeholder error'
- Sets its textContent to the error message
- Uses `output.replaceChildren(p)` to safely replace content

**Step 2: Test**

- Load the app via `npm run dev`
- Verify normal image upload still works
- To test error path: temporarily break `processImage()` (e.g., set `img.src = ''`) and verify error message displays safely
- Revert the temporary break

**Step 3: Commit**

```bash
git add src/script.js
git commit -m "fix: replace error display unsafe DOM insertion with textContent"
```

---

### Task 5: Fix file name display in image preview (Issue #19)

**Files:**
- Modify: `src/script.js:542-547`

**Step 1: Replace unsafe DOM insertion with safe DOM construction**

Replace lines 542-547 inside `previewImg.onload` with code that:
- Clears imageInfo with `textContent = ''`
- For each field (File, Size, Dimensions), creates a span element
- Sets the label part (e.g., "File:") as a strong element with static text
- Appends the dynamic value (file.name, formatted size, dimensions) using `document.createTextNode()`
- This ensures dynamic user content (especially file.name) is never interpreted as HTML

**Step 2: Test**

- Upload an image -- verify file info shows correctly with name, size, dimensions
- Try renaming a test file to include HTML characters and upload -- verify the name renders as text

**Step 3: Commit**

```bash
git add src/script.js
git commit -m "fix: use safe DOM construction for file info display"
```

---

### Task 6: Fix file name in HTML export title (Issue #13)

**Files:**
- Modify: `src/script.js:992`

**Step 1: Escape the filename before interpolation**

At line 992, change:
```javascript
const imageName = this.escapeHtml(this.currentImage?.name || 'ASCII Art');
```

This was previously `this.currentImage?.name || 'ASCII Art'` without escaping.

**Step 2: Test**

- Upload an image, click HTML export, open the downloaded file
- Verify the title tag contains the escaped filename
- Verify the exported HTML renders correctly in a browser

**Step 3: Commit**

```bash
git add src/script.js
git commit -m "fix: escape filename in HTML export title tag"
```

---

### Task 7: Add localStorage settings validation (Issue #14)

**Files:**
- Modify: `src/script.js:86-109`

**Step 1: Add sanitizeSettings method and update loadSettings**

Replace the `loadSettings()` method with a version that:
- Keeps the same defaults object
- After JSON.parse, passes result through a new `sanitizeSettings(raw, defaults)` method
- `sanitizeSettings` coerces every field to its expected type:
  - Numbers: parseInt/parseFloat with Math.max/Math.min clamping (width: 10-2000, height: 10-2000, fontSize: 4-20, lineHeight: 0.5-1.5, brightness: 0.5-2.0, contrast: 0.5-2.0)
  - Enums: validates against allowlists (['grayscale','ansi','rgb','full-rgb'] for colorMode, ['standard','detailed','blocks','binary','dots','custom'] for charsetType)
  - Booleans: `Boolean(raw.fieldName)` for inverted, edgeDetection; with undefined check for preserveAspectRatio and fitToContainer
  - Strings: `String(raw.customCharset || '').slice(0, 200)` for customCharset

**Step 2: Test**

- Open the app -- verify it loads with saved settings or defaults
- In browser console: set localStorage with malicious values (fontSize: 99999, colorMode: 'malicious', width: -5) then reload
- Verify fontSize is clamped to 20, colorMode falls back to 'grayscale', width is clamped to 10

**Step 3: Commit**

```bash
git add src/script.js
git commit -m "fix: validate and sanitize localStorage settings on load"
```

---

## Phase 2: Security -- API Hardening (Issues 8-12)

### Task 8: Remove API error detail leak (Issue #7)

**Files:**
- Modify: `api/share.js:84`

**Step 1: Remove details field from error response**

Replace line 84:
```javascript
return res.status(500).json({ error: 'Internal server error' });
```

**Step 2: Test**

Run: `node -c api/share.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add api/share.js
git commit -m "fix: remove error.message from API 500 responses"
```

---

### Task 9: Add share ID validation (Issue #8)

**Files:**
- Modify: `api/share.js:56-62`

**Step 1: Add regex validation before Redis lookup**

Replace the existing `if (!id)` check with a combined check:
```javascript
if (!id || !/^[A-Za-z0-9_-]{10}$/.test(id)) {
  return res.status(400).json({ error: 'Invalid share ID' });
}
```

**Step 2: Test**

Run: `node -c api/share.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add api/share.js
git commit -m "fix: validate share ID format before Redis lookup"
```

---

### Task 10: Add payload size limit (Issue #5)

**Files:**
- Modify: `api/share.js:21-27`

**Step 1: Add size validation at the start of POST handler**

After the `if (req.method === 'POST') {` line, add a payload size check:
- Stringify `req.body` and check `.length > 2_000_000`
- Return 413 status with error message if too large
- Then continue with existing destructuring of `ascii, settings, preview`

**Step 2: Test**

Run: `node -c api/share.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add api/share.js
git commit -m "fix: enforce 2MB payload size limit on share API"
```

---

### Task 11: Add rate limiting (Issue #6)

**Files:**
- Modify: `api/share.js:1-3,10-18`

**Step 1: Import and configure ratelimit**

Add import at the top of the file (after existing imports):
```javascript
import { Ratelimit } from '@upstash/ratelimit';
```

After the `redis` initialization, add:
```javascript
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
});
```

**Step 2: Add rate limit check at the start of POST handler**

Inside the POST block, before the payload size check, add:
- Extract IP from `x-forwarded-for` header (split on comma, trim, fallback to '127.0.0.1')
- Call `await ratelimit.limit(ip)`
- Return 429 if `!success`

**Step 3: Test**

Run: `node -c api/share.js`
Expected: No syntax errors

**Step 4: Commit**

```bash
git add api/share.js
git commit -m "fix: add rate limiting to share API (10 creates/min per IP)"
```

---

### Task 12: Restrict CORS and deduplicate config (Issues #9, #17)

**Files:**
- Modify: `api/share.js:11-14`
- Modify: `vercel.json`

**Step 1: Replace wildcard CORS with origin allowlist in api/share.js**

Replace lines 11-14 with code that:
- Defines an array of allowed origins: production domain, localhost:3000, localhost:5173
- Reads `req.headers.origin`
- Only sets `Access-Control-Allow-Origin` header if origin is in the allowlist
- Adds `Vary: Origin` header when origin matches
- Still sets Allow-Methods and Allow-Headers unconditionally

**Step 2: Remove CORS headers from vercel.json**

Replace vercel.json with only buildCommand, outputDirectory, framework, and rewrites. Remove the entire headers block (CORS is now handled only in function code).

**Step 3: Test**

Run: `node -c api/share.js`
Validate vercel.json: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid')"`
Expected: No errors

**Step 4: Commit**

```bash
git add api/share.js vercel.json
git commit -m "fix: restrict CORS to specific origins, remove duplicate config from vercel.json"
```

---

## Phase 3: Security -- Headers and Config (Issues 12-13, 18)

### Task 13: Add security headers (Issue #12)

**Files:**
- Modify: `vercel.json`

**Step 1: Add security headers block**

Add a `headers` array into `vercel.json` (after the `rewrites` block) with a catch-all source `"/(.*)"` containing:
- Content-Security-Policy: `default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'`
- X-Content-Type-Options: `nosniff`
- X-Frame-Options: `DENY`
- Referrer-Policy: `strict-origin-when-cross-origin`

Note: `script-src` includes cdnjs.cloudflare.com for DOMPurify in view.html. `style-src 'unsafe-inline'` needed for inline style blocks.

**Step 2: Test**

Validate vercel.json: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid')"`
Expected: "valid"

**Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat: add CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy headers"
```

---

### Task 14: Commit lock file to version control (Issue #18)

**Files:**
- Modify: `.gitignore`

**Step 1: Remove lock file entries from .gitignore**

Remove these three lines from `.gitignore` (currently lines 3-5):
```
package-lock.json
yarn.lock
pnpm-lock.yaml
```

**Step 2: Test**

Run: `git status`
Expected: `.gitignore` modified, `package-lock.json` shows as untracked (now trackable)

**Step 3: Commit**

```bash
git add .gitignore package-lock.json
git commit -m "chore: track package-lock.json for reproducible builds"
```

---

## Phase 4: Robustness (Issues 10, 15-16, 22)

### Task 15: Add file size limit on upload (Issue #10)

**Files:**
- Modify: `src/script.js:528-531`

**Step 1: Add file size check after type validation**

After the image type check closing brace (line 531), add:
```javascript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
if (file.size > MAX_FILE_SIZE) {
    this.showToast('File too large. Maximum size is 50MB.', 'error');
    return;
}
```

**Step 2: Test**

- Upload a normal image -- should work as before
- Verify no console errors

**Step 3: Commit**

```bash
git add src/script.js
git commit -m "fix: reject images larger than 50MB before processing"
```

---

### Task 16: Guard Math.max() on empty arrays (Issue #15)

**Files:**
- Modify: `src/script.js:932-933`
- Modify: `public/view.html:496,501`

**Step 1: Fix in src/script.js exportAsPng**

Replace line 932-933 with:
```javascript
const lines = this.currentAscii.text.split('\n').filter(l => l.length > 0);
const maxWidth = lines.length > 0 ? Math.max(...lines.map(line => ctx.measureText(line).width)) : 100;
```

**Step 2: Fix in public/view.html downloadPng**

Replace lines 496-501 with the same pattern:
```javascript
const lines = asciiData.text.split('\n').filter(l => l.length > 0);
const fontSize = 12;
const lineHeight = fontSize * 0.8;
ctx.font = `${fontSize}px "Courier New", monospace`;
const maxWidth = lines.length > 0 ? Math.max(...lines.map(line => ctx.measureText(line).width)) : 100;
```

**Step 3: Test**

- Upload an image, export as PNG -- should work as before
- Verify no console errors

**Step 4: Commit**

```bash
git add src/script.js public/view.html
git commit -m "fix: guard Math.max() against empty line arrays in PNG export"
```

---

### Task 17: Handle null blob in canvas.toBlob (Issue #16)

**Files:**
- Modify: `src/script.js:982-985`
- Modify: `public/view.html:517-520`

**Step 1: Fix in src/script.js**

Replace lines 982-985 with a version that checks `if (!blob)` at the start of the callback, shows an error toast, and returns early before calling downloadBlob.

**Step 2: Fix in public/view.html**

Replace lines 517-520 with the same null-check pattern.

**Step 3: Test**

- Export a PNG from both the main app and a shared view page -- should work as before
- Verify no console errors

**Step 4: Commit**

```bash
git add src/script.js public/view.html
git commit -m "fix: handle null blob in canvas.toBlob callback"
```

---

### Task 18: Clean up downloadBlob (Issue #22)

**Files:**
- Modify: `src/script.js:1035-1044`

**Step 1: Remove unnecessary DOM append, add try/finally**

Replace the `downloadBlob` method with:
```javascript
downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    } finally {
        URL.revokeObjectURL(url);
    }
}
```

**Step 2: Test**

- Export as TXT, PNG, and HTML from the main app -- all should download correctly
- Verify no console errors

**Step 3: Commit**

```bash
git add src/script.js
git commit -m "fix: simplify downloadBlob, use try/finally for URL cleanup"
```

---

## Phase 5: Dependencies (Issue 11)

### Task 19: Fix dependency vulnerabilities

**Files:**
- Modify: `package.json`, `package-lock.json`

**Step 1: Fix rollup vulnerability (non-breaking)**

```bash
npm audit fix
```

**Step 2: Upgrade vite to v7 (breaking change)**

```bash
npm audit fix --force
```

**Step 3: Test that the app still builds and runs**

```bash
npm run build && npm run preview
```

Expected: Build completes without errors. Preview server starts. Open in browser and verify:
- App loads with loading spinner then shows UI
- Upload an image -- conversion works
- All color modes work
- Export buttons work

**Step 4: Run npm audit to confirm clean**

```bash
npm audit
```

Expected: `found 0 vulnerabilities`

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade vite to v7, fix all dependency vulnerabilities"
```

---

## Phase 6: Accessibility (Issue 21)

### Task 20: Add ARIA attributes

**Files:**
- Modify: `src/script.js:273-282`

**Step 1: Add aria-labels to toolbar buttons and ASCII output**

In the `setupUI()` method, add `aria-label` attributes to each toolbar button:
- share-btn: "Share ASCII art"
- copy-btn: "Copy to clipboard"
- export-txt-btn: "Export as text file"
- export-png-btn: "Export as PNG image"
- export-html-btn: "Export as HTML file"

Add `role="img" aria-label="ASCII art output"` to the ascii-output container div.

**Step 2: Test**

- Open the app, inspect the buttons and output container in DevTools
- Verify `aria-label` attributes are present on all toolbar buttons
- Verify `role="img"` and `aria-label` on the ASCII output container

**Step 3: Commit**

```bash
git add src/script.js
git commit -m "feat: add ARIA labels to toolbar buttons and ASCII output container"
```

---

## Phase 7: Testing (Issue 20)

### Task 21: Add Vitest test suite for core algorithms

**Files:**
- Create: `tests/ascii-conversion.test.js`
- Modify: `package.json` (add test script)

**Step 1: Add test script to package.json**

Add to the `scripts` section:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 2: Create test file**

Create `tests/ascii-conversion.test.js` with pure function copies of the core algorithms and tests covering:

**adjustBrightnessContrast:**
- Returns unchanged values at brightness=1.0, contrast=1.0
- Clamps to 0 for very low brightness
- Clamps to 255 for high brightness
- Pure black stays black regardless of contrast
- Pure white stays clamped at max

**mapBrightnessToChar:**
- Maps 0 brightness to first character (space)
- Maps 255 brightness to last character (@)
- Maps mid brightness to middle character
- Handles single-char charset

**calculateLuminance:**
- Pure red has luminance ~76
- Pure green has luminance ~149
- Pure blue has luminance ~29
- White has luminance 255
- Black has luminance 0

**toAnsiColor:**
- Maps black to (0,0,0)
- Maps white to (255,255,255)
- Quantizes to 6 levels (0,51,102,153,204,255)

**Step 3: Run the tests**

```bash
npm test
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add tests/ascii-conversion.test.js package.json
git commit -m "feat: add Vitest test suite for core ASCII conversion algorithms"
```

---

## Phase 8: Finalize

### Task 22: Update PRODUCTION-AUDIT.md and mark all issues fixed

**Files:**
- Modify: `PRODUCTION-AUDIT.md`

**Step 1: Mark all issues as fixed**

Replace every `### N. [ ]` with `### N. [x]` in `PRODUCTION-AUDIT.md`.

Update the header status line to:
```
**Status:** All Issues Resolved
```

**Step 2: Final build and test**

```bash
npm run build && npm test
```

Expected: Build succeeds, all tests pass.

**Step 3: Commit**

```bash
git add PRODUCTION-AUDIT.md
git commit -m "docs: mark all 22 production audit issues as resolved"
```

---

## Post-Completion Checklist

After all 22 tasks are done:

1. `npm run build` -- clean build, no errors
2. `npm test` -- all tests pass
3. `npm audit` -- 0 vulnerabilities
4. `git log --oneline` -- verify 23 commits (1 setup + 22 fixes)
5. Manual smoke test via `npm run preview`:
   - Upload image, verify conversion
   - Try all color modes
   - Try all presets
   - Export TXT, PNG, HTML
   - Share button works (if Redis env vars configured)
6. Deploy to Vercel and verify:
   - Security headers present (check with `curl -I`)
   - Share API rate limiting works
   - Existing share links still load
   - CORS restricted (test from different origin)
