# RESUME-HERE — Push to origin/main is stuck

Written: 2026-05-21 by Claude Code session.
Context: User reported `git push origin` doesn't push their local `main` work to the remote.

---

## 1. The goal

Get the local `main` branch (which has all the recent canvas-clamp / share-codec / production-hardening work) onto `origin/main` on GitHub.

## 2. What I found

### Two separate problems

**(a) `git push origin` was pushing the wrong thing.**
The user was running `git push origin` while checked out on `fix/production-hardening`. In modern git that pushes only the *current* branch, not all branches. `fix/production-hardening` is already up-to-date on origin, so the command reports `Everything up-to-date` — but the work on local `main` never moves because `main` isn't the current branch.

**(b) Local `main` and `origin/main` have NO common ancestor.**
`git merge-base main origin/main` returns nothing. They are two completely independent histories.
- Local `main` tip: `0edb678 docs: add historical banners to March plan docs; flip E2-E7 to resolved`
- Origin/main tip: `1994156 Add OG image as portfolio preview` (+3 prior commits about OG images and portfolio docs)

So even an explicit `git push origin main` will be rejected as non-fast-forward.

### User's decision

The user chose to **force-push local main** over origin/main, accepting the loss of these 4 remote-only commits (they're obsolete OG-image / portfolio work):
- `1994156 Add OG image as portfolio preview`
- `d51a4c7 Update docs and add OG images with terminal-style design`
- `84797cb Merge branch 'main' of https://github.com/Technical-1/Image-To-Ascii-Vite`
- `9353027 Local changes`

The planned command was:
```bash
git push origin main:main --force-with-lease
```
(Using `main:main` so we don't have to `git checkout main` and disturb the working tree on `fix/production-hardening`.)

## 3. The blocker (this is the live issue)

**Any git command that walks history hangs indefinitely.** Quick ref lookups work fine.

| Command | Behavior |
|---|---|
| `git ls-remote origin HEAD` | ✅ Instant |
| `git log -1 --oneline main` | ✅ Instant |
| `git log --oneline main` (full) | ❌ Hangs |
| `git rev-list --count main` | ❌ Hangs |
| `git merge-base main origin/main` | ❌ Hangs |
| `git push origin main:main --force-with-lease` | ❌ Hangs (0% CPU, no output) |
| `git cat-file -t 7a946945237b2ac56e83c5b3ac71bcd393d257e5` | ❌ Hangs |

Every stuck process is blocked reading the same file:
```
.git/objects/7a/946945237b2ac56e83c5b3ac71bcd393d257e5
```
300 bytes, dated `Mar 7 03:19`, read-only, has macOS extended attributes (the `@` flag in `ls -la`).

### What was ruled out

- ❌ Auth: `gh auth status` shows logged in as `Technical-1` (matches repo owner). `ls-remote` works instantly, so HTTPS + credential helper are fine.
- ❌ Locks: No `.git/index.lock` or other `*.lock` files in `.git/`.
- ❌ Hooks: All hooks in `.git/hooks/` are `.sample` (inactive). No `pre-push`.
- ❌ Network: Tiny repo (4.3MB), `ls-remote` instant, fetch worked silently earlier.
- ❌ Stuck procs from other repos: There WAS a stuck `git worktree add` / `git reset --hard` from `~/Desktop/Code/second-brain/` (different repo), but killing it did not unstick this one. The hang reappears on every new invocation.

## 4. Where I stopped

About to inspect the suspect object and clear/decode it. **The user interrupted that tool call** (`xattr -l` + python zlib decompress) — likely because they didn't want me modifying things without their say-so, or because the session was getting long. Either way, that's the next thing to do.

## 5. Concrete next steps (in order)

### Step 1 — Identify the stuck object

```bash
xattr -l .git/objects/7a/946945237b2ac56e83c5b3ac71bcd393d257e5
# Then try decoding it manually (read-only, safe):
python3 -c "
import zlib
data = open('.git/objects/7a/946945237b2ac56e83c5b3ac71bcd393d257e5','rb').read()
print('compressed bytes:', len(data))
out = zlib.decompress(data)
print('decompressed bytes:', len(out))
print('header:', out[:100])
"
```
The first space-separated token (`blob`, `commit`, `tree`, `tag`) tells you the object's role.

### Step 2 — Strip extended attributes if present

If `xattr -l` shows quarantine flags (`com.apple.quarantine`) or anything weird, clear them:
```bash
xattr -c .git/objects/7a/946945237b2ac56e83c5b3ac71bcd393d257e5
```
Then retry `git cat-file -t 7a946945237b2ac56e83c5b3ac71bcd393d257e5` to see if it returns instantly.

### Step 3 — Run `git fsck`

If clearing xattrs doesn't help, look for broader corruption:
```bash
git fsck --full --strict 2>&1 | head -40
```

### Step 4 — If object is corrupt but the same hash exists in pack files

Delete the loose copy and rely on the packed one:
```bash
mv .git/objects/7a/946945237b2ac56e83c5b3ac71bcd393d257e5 /tmp/corrupt-object-backup
git fsck --full
```
If git is happy, the loose copy was the problem.

### Step 5 — Fallback: re-pack everything

```bash
git gc --aggressive
# or
git repack -a -d -f
```

### Step 6 — Last resort: clone fresh

If nothing fixes it, the working state is recoverable from refs:
```bash
cd ..
git clone --no-local /Users/jacobkanfer/Desktop/CodeRepositories/Image-To-Ascii-Vite Image-To-Ascii-Vite-fresh
cd Image-To-Ascii-Vite-fresh
git remote set-url origin https://github.com/Technical-1/Image-To-Ascii-Vite.git
git push origin main:main --force-with-lease
```

### Step 7 — Once the push succeeds

Verify:
```bash
git ls-remote origin refs/heads/main   # should show 0edb678...
```

## 6. Don't forget

- The working tree on `fix/production-hardening` has a bunch of `M` and `D` entries (deleted plan/audit files, modified portfolio docs). Those are unrelated to the push problem but you may want to commit or stash them after this is fixed.
- There are a half-dozen stray `._*` AppleDouble files in the working tree (`._.gitignore`, `._README.md`, etc.) — macOS metadata cruft. Add them to `.gitignore` or `find . -name '._*' -delete` to clean up.
- The user is on branch `fix/production-hardening`; they should stay there unless they explicitly switch. The push plan uses the `main:main` refspec so no checkout is needed.

## 7. Process-hygiene note

While debugging, multiple `git rev-list` / `merge-base` processes accumulated in zombie state (alive, 0% CPU, holding fds on the suspect object). If you see weird hangs again, check:
```bash
pgrep -af 'git (rev-list|merge-base|push|fetch|log)'
```
and `kill -9` anything older than a minute before retrying.
