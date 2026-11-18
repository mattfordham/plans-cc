# Add a storage-mode and sync-state indicator to the terminal dashboard header

**ID:** 044
**Created:** 2026-10-05T16:29
**Type:** feature
**Status:** completed
**Completed:** 2026-10-05T20:52
**Branch:** feature/044-add-storage-mode-and-sync-state-indicator

## What
Add a storage-mode and sync-state indicator to the terminal dashboard header (bin/dashboard.js): show local/inline/branch mode via lib/plans-git.js mode detection, and in branch mode show unpushed plan commits (ahead/behind @{u} via git -C .plans rev-list) and a stuck rebase/autostash, refreshed on the existing 2s git poll. Complements the plans-desktop sync-status indicator (out of scope in .plans/artifacts/branch-mode-spec.md), which covers only the desktop project card.

## Why
Branch mode's main failure is silent: a capture that never reached the other machine because a push failed, there is no upstream, or a sync stopped partway through a rebase. Nothing shows unpushed plan commits or a stuck sync until the next `sync` runs. A header line on the dashboard you already keep open makes that drift visible as it happens.

## How Summary
Add a read-only `syncStatus(root)` to `lib/plans-git.js` that reuses `detectMode`, `readSyncConfig`, and the never-throwing `git()` helper. It reports the mode and, in branch mode only, the ahead/behind counts against `@{u}`, whether an upstream is set, and whether a rebase is stuck. It never fetches, never takes the `.git-lock`, and never throws. The dashboard caches the result, refreshes it on the existing 2s `gitPollTimer`, and passes it to `buildHeaderContent`. That function renders one `plans:` line under the branch line: a quiet label for local and inline mode, the full sync state for branch mode, and nothing when the root is not a git repo.

**Files of note:**
- `lib/plans-git.js` — new `syncStatus(root)` export, read-only
- `lib/render-dashboard.js` — `buildHeaderContent` gains a `sync` input and renders the `plans:` line
- `bin/dashboard.js` — caches `getSyncStatus()` and refreshes it on the git poll
- `test/plans-git.test.js` / `test/render-dashboard.test.js` — tests for the status reader and the header line

## How
- [x] Step 1: Write failing tests in `test/plans-git.test.js` for a new `syncStatus(root)` export, using `makeBranchModeProject()` plus a bare remote. Cover these cases:
  - Returns `{ mode }` only for `none`, `local`, and `inline`.
  - In branch mode, `ahead` equals the number of local plan commits not yet pushed, and is 0 after pushing.
  - `behind` comes from the local tracking ref, with no fetch.
  - `upstream: false` when no upstream is set.
  - `rebaseStuck: true` when `rebase-merge` or `rebase-apply` exists under `git -C .plans rev-parse --git-path`.
  - Never throws on a nonexistent root.
- [x] Step 2: Implement `syncStatus(root)` in `lib/plans-git.js` and export it. Rules:
  - Reuse `detectMode`, `readSyncConfig`, `git()`, and the `--git-path` rebase check that `handleFailedPull` already uses (pull it into a small shared helper rather than duplicating it).
  - Use `rev-list --left-right --count HEAD...@{u}` for the counts.
  - No fetch, no lock, no writes.
- [x] Step 3: Write failing tests in a new `test/render-dashboard.test.js` for the header's `plans:` line, exporting `buildHeaderContent` to make it testable. Cover these cases:
  - No `sync` input, or mode `none`: no line, and the header is otherwise unchanged.
  - `local` / `inline`: a quiet `plans: local` label.
  - Branch mode in sync: `plans: branch ✓`.
  - Unpushed commits: `↑N` in the dirty color.
  - Behind: `↓N (as of last fetch)`.
  - No upstream: a warning label.
  - Stuck rebase: a warning label in the blocked color.
- [x] Step 4: Implement the line in `lib/render-dashboard.js`. Thread a `sync` field through `updateLayout` into `buildHeaderContent`, and reuse the existing `COLORS` and the `dirtyMark` style. The header height already adapts to its line count.
- [x] Step 5: Wire up `bin/dashboard.js`:
  - Add `getSyncStatus()` with a TTL cache, following `getBranches()`.
  - Invalidate it in the existing `gitPollTimer` callback alongside `cachedBranchesAt`.
  - Pass the result into `updateLayout`.
  - Guard it with try/catch so the dashboard can never break.
- [ ] 👁 Step 6: Run `plans-cc-dashboard` in a branch-mode project and confirm `plans: branch ✓`. Make an unpushed plan commit and confirm `↑1` appears within about 2s. Then run it in a local-mode project (this repo) and confirm `plans: local`. The user observes the TUI.
- [x] Step 7: Add one line to the CLAUDE.md "Plans storage mode & `plans-git`" contract naming `syncStatus` as the read-only consumer for the dashboard: no fetch, no lock, and `behind` is as of the last fetch.

## Verification
- `npm test` passes, including the new `syncStatus` cases (real git temp repos) and the `render-dashboard` header cases.
- `syncStatus` never fetches, never creates `.plans/.git-lock`, and never throws.
- Manual check (step 6): the indicator shows the correct state in a branch-mode project and a local-mode project, and `↑N` updates within about 2s of an unpushed commit.
- Outside branch mode, the dashboard's only change is the one-word mode label. With mode `none`, the header is byte-identical to before.

## Impact Scope

### Files to Modify
- [ ] `lib/plans-git.js` — add and export `syncStatus(root)`; move the rebase-in-progress check into a shared helper
- [ ] `test/plans-git.test.js` — `syncStatus` cases
- [ ] `lib/render-dashboard.js` — `plans:` header line; export `buildHeaderContent`
- [ ] `test/render-dashboard.test.js` — new; header-line cases
- [ ] `bin/dashboard.js` — cached `getSyncStatus()` on the git poll
- [ ] `CLAUDE.md` — one-line contract note

### Related Files (may need updates)
- `skills/plan-cleanup/SKILL.md` — step 7.6 (c)/(d) uses the same stuck-rebase/autostash detection; keep the semantics aligned
- `.plans/artifacts/desktop-app-spec.md` — the desktop sync indicator (plans-desktop) may want to mirror `syncStatus`'s shape later

### Endpoints/UI Affected
- `plans-cc-dashboard` header — new `plans:` line under the branch line

## Assumptions

### Initial (from elaboration)
_To be filled during elaboration_

### Discovered during execution
- [low] `syncStatus` reports `branch` as the branch actually checked out at `.plans` (falling back to `sync.branch` on a detached HEAD), while `remote` comes from `readSyncConfig`. **Why:** the dashboard should show what is really there, matching how `isPlansBranch` treats the checked-out branch as authoritative. `remote` has no comparably cheap "actual" value, and the configured remote is what pushes go to.
- [low] Any failure, including a non-string root, degrades to `{ mode: "none" }` (whole call) or to zero counts (when `rev-list` output can't be parsed). **Why:** the never-throw contract. The non-string guard matters because `git(undefined, ...)` would run in `process.cwd()` and report the caller's own repo.
- [high] Extracted the `--git-path` rebase check into `rebaseInProgress(dir)`, which both `handleFailedPull` and `syncStatus` now use. **Why:** the step asked for one shared helper, and `handleFailedPull` behaves exactly as before.
- [low] Header label wording and colors: `plans: local` / `plans: inline` all in the quiet branch color. In branch mode, `plans: branch` followed by: `✓` (clean color) when nothing is wrong, `↑N` in the dirty color, `↓N` in the dirty color plus `(as of last fetch)` in the hint color, `⚠ no upstream` in the dirty color, and `⚠ rebase stuck` in the blocked color. Problems stack in that order (stuck, no upstream, ahead, behind), and `✓` shows only when none apply. The plans branch name is not shown. **Why:** this reuses the existing `COLORS` and the `dirtyMark` palette (yellow means needs attention, red means blocked), so the line matches the branch line. The name is almost always `plans`, so showing it would be noise.
- [low] The `plans:` line goes directly under the root `branch:` line, before any sub-repo block. With no branch line, it follows the project line. **Why:** the step says "under the branch line", and storage mode belongs to the root, not to the sub-repos.
- [low] `getSyncStatus()` uses a 5s TTL (`SYNC_CACHE_TTL_MS`, same as the branch cache), and the 2s `gitPollTimer` resets it, so in practice it refreshes every ~2s. **Why:** this follows `getBranches()` exactly, and the poll is what delivers the ~2s update the observation needs.
- [high] `blessed` stays a top-level require in `lib/render-dashboard.js`. Requiring the module loads blessed but creates no screen (only `buildLayout` touches it), so the pure `buildHeaderContent` is testable as-is. In the worktree, blessed resolves through the parent checkout's `node_modules`. **Why:** the step allowed a restructure only if the require started blessed or a screen, and it does not.

## Changes
- Execution moved from the shared main checkout into a worktree after segment 1, because another session switched the main checkout back to `main` mid-segment (reflog 16:39:12). The work was carried over intact as a patch, and tests were re-run in the worktree with branch and SHA unchanged before and after.
- `lib/plans-git.js`: moved the rebase-in-progress check out of `handleFailedPull` into a shared `rebaseInProgress(dir)` helper. Added and exported a read-only `syncStatus(root)`. It returns `{ mode }` outside branch mode. In branch mode it returns `{ mode, branch, remote, upstream, ahead, behind, rebaseStuck }`, counted with `rev-list --left-right --count HEAD...@{u}`. It never fetches, locks, writes, or throws, and a missing root gives `{ mode: 'none' }`.
- `test/plans-git.test.js`: 6 `syncStatus` cases, plus the helpers `makeTrackedBranchProject()` and `localPlanCommit()`. 60/60 pass.
- `lib/render-dashboard.js`: new `buildPlansLine(sync)`; `buildHeaderContent` / `updateLayout` take a `sync` field and render a `plans:` line directly under the root `branch:` line. Labels: `plans: local` / `plans: inline` (quiet), `plans: branch ✓`, or stacked `⚠ rebase stuck` (blocked color) / `⚠ no upstream` / `↑N` / `↓N (as of last fetch)` (dirty color). Mode `none` or no input leaves the header byte-identical. Exports `buildHeaderContent` and `COLORS`.
- `test/render-dashboard.test.js` (new): 15 header-line cases, 15/15 pass.
- `bin/dashboard.js`: `getSyncStatus()` with a 5s TTL cache (like `getBranches()`), invalidated on the 2s `gitPollTimer`, try/catch → `null`, passed to `updateLayout`.
- `CLAUDE.md`: a **Dashboard read.** paragraph in the Plans storage mode contract (`syncStatus` is the read-only dashboard consumer: no fetch, no `.git-lock`, no writes, and `behind` is as of the last fetch). Also added render-dashboard to the Testing section's coverage list.
- Step 6 (manual TUI check) is deferred to review. Committed `4b5a627` on the task branch.

## Notes
- Leftover-autostash detection (cleanup 7.6 (d)) is deliberately left out of the header for now. It needs the stash-ancestry check against the shared `refs/stash`, which is too heavy for a 2s poll. A stuck rebase covers the common case, and `/plan-cleanup` remains the full health check.
- Sequence after #043 if possible. Both touch the dashboard code paths, though they don't overlap.
