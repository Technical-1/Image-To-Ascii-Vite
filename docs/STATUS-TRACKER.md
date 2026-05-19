# Project Status Tracker — Single Source of Truth

**Created:** 2026-05-18
**Branch:** `fix/production-hardening` (⚠️ local only — never pushed to GitHub)
**Last verified commit:** `86458ba` — "fix: make CSP-safe share viewer, dedupe core algorithms, clean repo"
**URL-share update (2026-05-19):** Branch `feat/url-share` resolved the entire share-backend cluster (A2, B1, B2, C1, C2, C4, U1-U3): Redis backend deleted; sharing is now client-side via URL fragment (`#s=`). See `docs/superpowers/specs/2026-05-18-url-share-design.md`.

> **Purpose.** This is the authoritative tracking document for the Image-to-ASCII
> project. It supersedes the status claims in `PRODUCTION-AUDIT.md`,
> `FUTURE-IMPROVEMENTS.md`, and `.project-hub-tasks.json` (all of which are stale
> or incomplete — see Section E). Every finding has a stable ID (A1, B2, …).
> Future spec-planning sessions should reference these IDs and update the Status
> column here. Do not duplicate this list elsewhere.

> **Why this exists.** The repo's own MD files claimed "all 22 production audit
> issues resolved / production ready." A ground-truth re-audit (reading code,
> running tests/build/`npm audit`, checking git topology) found that the security
> fixes are genuinely implemented, BUT: a shipped CSP silently broke the share
> viewer, the "0 vulnerabilities" claim had gone stale, and several real bugs
> were never in the original audit at all. Trust this document, not the others.

---

## 0. OWNER ACTION REQUIRED (manual — cannot be automated by the agent)

These require the human owner; the agent has no access to the dashboards.

- [x] **U1 — Re-provision Upstash Redis and wire env vars.** The previous Upstash
      instance has been **deleted** (confirmed by owner). The Share feature is
      therefore non-functional in production until this is done.
  - Create a new Redis database (Upstash console, or Vercel → Storage →
    Marketplace → Upstash; note Vercel's first-party KV product was sunset).
  - Set these env vars in Vercel → Project → Settings → Environment Variables
    (the code accepts either naming pair — `api/share.js:7-8`):
    - `KV_REST_API_URL` **or** `UPSTASH_REDIS_REST_URL`
    - `KV_REST_API_TOKEN` **or** `UPSTASH_REDIS_REST_TOKEN`
  - Redeploy. Verify a share round-trips (create link → open `/view.html?id=…`).
  - **Blocks/relates to:** A2, B1, B2, C1, C4, D1. Decide A2 (revive vs. remove
    Share) before or alongside this — if Share is being removed, U1 is moot.
  - N/A — Redis backend removed; sharing is now client-side.
- [x] **U2 — Confirm what is actually deployed on Vercel.** Determine which
      branch/commit Vercel builds (Project → Settings → Git). If it tracks
      `main`, production is the **old Feb pre-hardening code** and none of the
      hardening (or these fixes) is live. (Finding A3.)
  - N/A — Redis backend removed; sharing is now client-side.
- [x] **U3 — Confirm the real production domain.** The code hardcodes
      `image-to-ascii-nine.vercel.app` (CORS allowlist). Confirm this is correct
      or supply the real domain. (Feeds B2 / C1.)
  - N/A — Redis backend removed; sharing is now client-side.

---

## 1. Status legend

- **Status:** `[ ]` open · `[~]` in progress · `[x]` done & verified · `[B]` blocked (needs owner)
- **Severity:** CRITICAL > HIGH > MEDIUM > LOW
- **Origin:** `new` = found in the 2026-05-18 deep dive (NOT in original audit) ·
  `orig` = original audit issue · `regression` = introduced by the hardening branch

---

## A. Operational / repository state

| ID | Sev | Status | Origin | Finding | Evidence | Notes |
|----|-----|--------|--------|---------|----------|-------|
| A1 | CRITICAL | [x] | new | RESOLVED 2026-05-18: `fix/production-hardening` pushed to `origin` (this commit + push). Previously the 25 commits existed only on this machine with no backup. | `git ls-remote --heads origin`; `git branch -vv` | Branch now backed up on GitHub. `main` had 0 commits the branch lacked (no merge-conflict risk). Merge-to-`main` decision still open (separate from backup). |
| A2 | HIGH | [x] | new | Share feature non-functional in production: Upstash deleted (U1). `redis.set/get` throws → caught → HTTP 500. Degrades gracefully (toast "Failed to create share link"), but the Share button stays enabled and always fails. Core converter is unaffected (100% client-side). | `api/share.js:6-9,110-113`; `script.js` `shareAscii` | **Decision needed:** (a) revive via U1, or (b) remove Share button + `api/share.js` + `public/view.html` + `public/viewer.js` + share-only deps (`@upstash/*`, `nanoid`, `dompurify`) entirely. Blocks B1/B2/C1/C4/D1. RESOLVED 2026-05-19 by URL-share (feat/url-share): backend deleted; see docs/superpowers/specs/2026-05-18-url-share-design.md. |
| A3 | HIGH | [B] | new | Unknown which commit Vercel deploys. If it tracks `main`, prod = old vulnerable Feb build. | branch topology | Resolved by U2. |

---

## B. Security gaps the original audit missed

| ID | Sev | Status | Origin | Finding | Evidence | Notes |
|----|-----|--------|--------|---------|----------|-------|
| B1 | HIGH | [x] | new | DOMPurify is loaded from cdnjs with **no Subresource Integrity** (`integrity`/`crossorigin`). If cdnjs is compromised, arbitrary script runs with full page access — and DOMPurify *is* the stored-XSS defense, so this defeats the headline audit fix. `dompurify` is already an npm dependency but the viewer uses the CDN copy. | `public/view.html:348` | Best fix: bundle DOMPurify via the existing npm dep (requires making `viewer.js` a Vite-built entry, or an import map). Interim: add SRI hash + `crossorigin="anonymous"`. Couples with the "viewer as bundled module" future item. RESOLVED 2026-05-19 by URL-share (feat/url-share): backend deleted; see docs/superpowers/specs/2026-05-18-url-share-design.md. |
| B2 | MEDIUM | [x] | new | CORS allowlist hardcodes `image-to-ascii-nine.vercel.app`. If the real prod domain differs, the share API blocks the legitimate site. The audit "fixed wildcard CORS" by substituting a hardcoded guess. | `api/share.js:18-24` | Needs U3. Consider an env-var-driven allowlist. RESOLVED 2026-05-19 by URL-share (feat/url-share): backend deleted; see docs/superpowers/specs/2026-05-18-url-share-design.md. |

---

## C. Correctness / robustness bugs the audit missed

| ID | Sev | Status | Origin | Finding | Evidence | Notes |
|----|-----|--------|--------|---------|----------|-------|
| C1 | MEDIUM | [x] | new | Share URLs are built from `process.env.VERCEL_URL` — the **ephemeral per-deployment** hostname, not the stable production domain. Even with Redis working, generated links rot as deployments rotate. | `api/share.js:71-72` | Use `VERCEL_PROJECT_PRODUCTION_URL` (Vercel's stable domain var) or a configured base URL. Bundle with B2/U3. RESOLVED 2026-05-19 by URL-share (feat/url-share): backend deleted; see docs/superpowers/specs/2026-05-18-url-share-design.md. |
| C2 | MEDIUM | [x] | new | Canvas dimensions unbounded at conversion time. `sanitizeSettings` clamps width/height ≤2000 only when loading from localStorage; the width/height slider `max` is set to the full image dimension (`updateSliderMax`). Maxing the slider on a large image → `getImageData(0,0,N,…)` with N in the thousands → tab freeze. The 50MB *file*-size limit does not bound *output* dimensions. | `src/script.js` `updateSliderMax` vs `sanitizeSettings`; `processImage` | Redis-independent. Clamp at convert time and/or cap slider max. Add a regression test (logic is testable via `ascii-core.js`-style extraction). RESOLVED 2026-05-19 by URL-share (feat/url-share): backend deleted; see docs/superpowers/specs/2026-05-18-url-share-design.md. |
| C3 | LOW | [ ] | new | "💚 Matrix" preset is byte-identical to "🟢 Classic" (`standard` / `grayscale` / not inverted). The button visibly does nothing distinct. | `src/script.js` `presets.matrix` vs `presets.classic` | Redis-independent. Either give Matrix a distinct config (e.g. green-tinted, custom charset) or remove it. Product decision. |
| C4 | LOW | [x] | new | View-count increment is a read-modify-write (`get` → `+1` → `set`); concurrent GETs lose updates. | `api/share.js:99-101` | Cosmetic (view counter only). Moot while Redis down. Use Redis atomic `INCR` on a separate key if revived. RESOLVED 2026-05-19 by URL-share (feat/url-share): backend deleted; see docs/superpowers/specs/2026-05-18-url-share-design.md. |

---

## D. Verification gaps

| ID | Sev | Status | Origin | Finding | Notes |
|----|-----|--------|--------|---------|-------|
| D1 | MEDIUM | [ ] | new | **Zero integration/browser tests exist.** Only `src/ascii-core.js` pure functions are unit-tested (22 tests). The `ImageAsciiConverter` UI class and `public/viewer.js` have never been exercised by automation. The CSP fix (`86458ba`) is verified by inspection + build + an independent code review, but **never run in a real browser against a live share** (also currently blocked by U1). | Add a smoke/e2e layer (e.g. Playwright) covering: upload→render, each color mode, export buttons, and the `/view.html` page under the production CSP. Largest residual risk after A1. |

---

## E. Documentation reconciliation (explicitly in scope)

All project docs must be brought into agreement with this tracker and the code.
Each is a tracked task:

| ID | Status | Doc | Required change |
|----|--------|-----|-----------------|
| E1 | [x] | `README.md` | Already corrected in `86458ba`: "Vite 5"→"Vite 7", accurate structure tree. Re-verify after future changes. |
| E2 | [ ] | `PRODUCTION-AUDIT.md` | The 22 fixes ARE real, but the doc must (a) record the CSP-vs-inline-script regression and that `86458ba` resolved it, (b) drop or annotate the stale line numbers, (c) change "production ready" framing — it was not, due to the regression and dead Share backend. |
| E3 | [ ] | `.portfolio/architecture.md` | Says "Vite 5 Build Tool" (actual 7). Update; re-verify the system diagram still matches (now includes `src/ascii-core.js` and `public/viewer.js`). |
| E4 | [ ] | `.portfolio/stack.md`, `.portfolio/qa.md` | Audit for stale version/feature claims (not yet fully reviewed). Reconcile with current code. |
| E5 | [ ] | `.project-hub-tasks.json` | 15 tasks, no completion status — stale artifact. Either delete it or regenerate with current status. Decide its role vs. this tracker (this tracker is authoritative). |
| E6 | [ ] | `FUTURE-IMPROVEMENTS.md` | Its "move viewer to external module" item is now partially done (`86458ba` externalized it; full Vite-bundled module + npm DOMPurify is B1). Reconcile. |
| E7 | [ ] | `docs/plans/2026-03-07-production-hardening*.md` | Historical record — keep as-is but add a pointer/banner noting this tracker supersedes their status claims. |

---

## F. Done & verified (do NOT redo)

- **The original 22 audit fixes are genuinely present in current code** (not just
  doc-claimed). Spot-verified on 2026-05-18: DOMPurify allowlist sanitization,
  `parseInt` coercion, safe DOM in `showError`, rate-limit + 2MB payload +
  ID-regex + no-error-leak + restricted CORS in `share.js`, 50MB file limit,
  `sanitizeSettings`, `Math.max` guards, `toBlob` null checks, `try/finally`
  `downloadBlob`, ARIA labels, committed lockfile.
- **Commit `86458ba`** (verified: 22 tests pass, build OK, `npm audit` = 0,
  independent code review = no regressions):
  - CSP regression fixed — `view.html` inline `<script>` + `onclick=` extracted
    to external `public/viewer.js` (works under the existing CSP, no
    `'unsafe-inline'` added). *Still pending real-browser verification — see D1.*
  - `src/ascii-core.js` created; `script.js` + tests both consume it (tests now
    exercise real code; added `pixelsToText` + `applyEdgeDetection` coverage).
  - `npm audit fix`: 4 vulns → 0; Vite 7.3.1 → 7.3.3.
  - Untracked 10 macOS `._*` files; `.gitignore` updated.
  - `README.md` corrected (E1).

---

## G. Suggested spec-planning session grouping

Each bullet = one focused planning session; sequence top-to-bottom.

1. **Backup & deploy truth** — A1 (push branch), A3/U2 (what's deployed).
   Smallest, unblocks confidence. No code design needed.
2. **Share feature decision** — A2: revive (U1) vs. remove. This binary
   decision gates the entire B/C-share cluster.
3. **Share-path hardening** (only if "revive") — B1 (bundle DOMPurify),
   B2 + C1 + U3 (domain/env-var correctness), C4 (atomic view count).
4. **Converter robustness** (Redis-independent, can run anytime) — C2 (canvas
   clamp + test), C3 (Matrix preset).
5. **Verification** — D1 (introduce e2e/browser tests; validate the CSP fix
   for real).
6. **Documentation reconciliation** — E2–E7.

---

## H. Open questions for the owner

- A2: Revive Share, or remove it entirely? (Drives U1 and sessions 2–3.)
- C3: Should "Matrix" become a distinct style, or be removed?
- E5: Keep `.project-hub-tasks.json` tooling, or retire it in favor of this tracker?
- Process: are these sessions done here, or via the `/kais-design` / spec-planning
  workflow? (This tracker is the input either way.)
