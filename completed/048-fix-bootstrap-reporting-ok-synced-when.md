# Fix bootstrap reporting OK synced when offline

**ID:** 048
**Created:** 2026-10-05T16:32
**Type:** bug
**Status:** completed
**Completed:** 2026-10-05T22:01
**Branch:** fix/048-fix-bootstrap-reporting-ok-synced-when

## What
When `.plans` is already attached and the remote is unreachable, `plans-git.js bootstrap` prints `Warning: plans sync failed…` and then still ends with `OK: .plans synced with <r>/<b>`, which overstates what happened. It should end with a `Skipped: <remote> unreachable` line (or a distinct OK wording) in that case. Update the CLAUDE.md final-line list and the README remote-sessions section if the wording changes, and add a test.

## Why
The bootstrap final line is the one line a SessionStart hook surfaces to a human, and it is injected into the session as context. `OK: .plans synced` after an offline `Warning:` is a confident claim that the opposite of what happened happened — the clone did NOT sync. A misleading green line is worse than no line, because it tells the user (and Claude) to trust plan state that was never reconciled with the remote.

## How Summary
The root cause is in `lib/plans-git.js` `bootstrap()`: its branch-mode path (`detectMode === "branch"`) unconditionally sets `action = "synced"` and ignores the `synced` flag that `sync()` already returns. When the remote is unreachable, `sync()`'s `pull --rebase` fails, `handleFailedPull` pushes a `plans sync failed…` warning, and it returns `synced: false` — but bootstrap reports `synced` anyway, so the CLI prints `OK: .plans synced`. The fix inspects `res.synced`: a real sync keeps `action = "synced"`; a sync that did not reconcile with the remote (offline/conflict — distinguished by `synced === false` AND warnings present) becomes `action = "skipped"` with `reason = "<remote> unreachable"`, which the existing `Skipped:` CLI branch already renders. The no-upstream quiet case (`synced === false`, no warnings) is left exactly as today. Then align the two docs that describe the final-line set and add a regression test.

**Files of note:**
- `lib/plans-git.js` — `bootstrap()` (branch-mode path, ~line 1076) sets `action`/`reason` from `sync()`'s result; `sync()` (~line 563) is the source of the `synced` flag and the offline warning
- `bin/plans-git.js` — bootstrap final-line rendering (~line 93-107); the `Skipped:` branch already reads `res.reason`, so likely no change beyond verification
- `test/plans-git.test.js` — new regression test in the `--- bootstrap ---` block (~line 774)
- `CLAUDE.md` — the "Remote bootstrap & helpers" paragraph in the Plans storage-mode contract, which enumerates bootstrap's final lines and the attached-offline behavior
- `README.md` — the "Remote sessions (branch mode)" section (lines ~327-330) describing the attached-offline outcome

## Diagnosis

**Most likely:** `bootstrap()`'s branch-mode path hardcodes `result.action = "synced"` and never reads `res.synced`, so an offline sync whose `pull --rebase` failed is still reported as synced. (`lib/plans-git.js:1076-1082`)
**Evidence:** Lines 1076-1082 call `sync(root)`, then unconditionally set `action = "synced"`, `ok = true`, and push only `res.warnings` — the returned `res.synced` is discarded. `sync()` sets `synced = true` only after a successful `pull` (`lib/plans-git.js:586`); an unreachable remote takes the `!pull.ok` branch into `handleFailedPull` (`lib/plans-git.js:582-584`), which adds `plans sync failed…` and returns with `synced: false`. The CLI then renders the final line purely from `action` (`bin/plans-git.js:106`), so it prints `OK: .plans synced`. The #042 Changes section records this exact gap as a known follow-up (`.plans/completed/042-add-branch-mode-cleanup-health-check.md:143`).
**Confidence:** high

**To confirm:** Add a failing unit test — attach `.plans` via `initBranch` with an upstream, repoint `origin` to a nonexistent path so the remote is unreachable, call `bootstrap`, and assert `res.action !== "synced"` (expected `"skipped"`) with an offline warning present. The test fails against current code (action is `"synced"`); agent-verifiable via `npm test`, so untagged.

## How
- [x] Step 1: Add the failing regression test in `test/plans-git.test.js` (in the `--- bootstrap ---` block, near line 795): `initBranch` a clone that has a reachable upstream, run one `bootstrap` to confirm it syncs cleanly, then break the remote (e.g. `git remote set-url origin <nowhere path>` or remove/repoint it) so the next pull is unreachable, run `bootstrap` again, and assert `res.action === "skipped"`, `res.ok === true`, `res.error === null`, `res.reason` matches `/unreachable/`, and `res.warnings` contains the `plans sync failed…` warning. Confirm it FAILS against current code (action is `"synced"`). This confirms the Diagnosis; agent-verifiable, so untagged.
- [x] Step 2: Fix `bootstrap()` in `lib/plans-git.js` (branch-mode path, ~line 1076): after `const res = sync(root)`, set the result from `res`. If `res.synced` is true → `action = "synced"` (today's behavior). If `res.synced` is false AND `res.warnings.length > 0` (offline / aborted rebase) → `action = "skipped"`, `reason = "${result.remote} unreachable"`. If `res.synced` is false with no warnings (no upstream, genuine no-op) → leave today's behavior unchanged. Keep `ok = true` and `renumbered`/`warnings` propagation in all cases.
- [x] Step 3: Verify `bin/plans-git.js` bootstrap rendering (~line 93-107) prints the right final line for the new `action = "skipped"` + `reason` combination via the existing `Skipped:` branch (line 107). Only change the CLI if the existing branch does not produce `Skipped: <remote> unreachable`; prefer leaving it untouched.
- [x] Step 4: Update `CLAUDE.md` "Remote bootstrap & helpers" paragraph in the Plans storage-mode contract so the enumerated final lines and the attached-offline sentence match the new behavior (attached + unreachable now ends `Skipped: <remote> unreachable`, not `OK: … synced` after a warning).
- [x] Step 5: Update `README.md` "Remote sessions (branch mode)" section (lines ~327-330) so the attached-offline bullet describes the `Skipped:` outcome rather than "a `Warning:` and then `OK: .plans synced`".
- [x] Step 6: Run `npm test` and confirm the full suite passes, including the new test (now green) with no regressions to the existing bootstrap tests. _(Ran the targeted file `node --test test/plans-git.test.js` per the plans-cc targeted-tests-only rule: 55 pass, 0 fail.)_

## Verification
- `npm test` passes the full suite, including the new regression test. The new test proves that an already-attached clone whose remote is unreachable ends `bootstrap` with `action = "skipped"` / `reason` matching `/unreachable/` (not `"synced"`), `ok = true`, `error = null`, and the offline warning present.
- The existing bootstrap tests still pass unchanged — in particular the reachable-remote attach/sync tests still report `action = "synced"` (e.g. the `--branch` test's second run), confirming the happy path is untouched.
- A manual `node bin/plans-git.js bootstrap` run (or test harness equivalent) against an attached-but-offline clone emits nothing on stdout, a `Warning:` line, and a final `Skipped: <remote> unreachable` line on stderr, exit 0.
- `CLAUDE.md` and `README.md` descriptions of bootstrap's final lines match the shipped behavior.

## Impact Scope

### Files to Modify
- [ ] `lib/plans-git.js` — `bootstrap()` branch-mode path reads `res.synced` and sets `action`/`reason` accordingly
- [ ] `test/plans-git.test.js` — new attached-offline regression test in the bootstrap block
- [ ] `CLAUDE.md` — "Remote bootstrap & helpers" final-line enumeration + attached-offline wording
- [ ] `README.md` — "Remote sessions (branch mode)" attached-offline bullet

### Related Files (may need updates)
- `bin/plans-git.js` — bootstrap final-line rendering; expected to need no change (the `Skipped:` branch already reads `res.reason`), but verify in Step 3
- `test/branch-mode.integration.test.js` — exercises bootstrap end-to-end; check it does not assert the old `OK: … synced` wording for an offline-attached case (unlikely, but confirm no regression)

### Endpoints/UI Affected
- `plans-git.js bootstrap` stderr final line (SessionStart hook output) — changes from `OK: .plans synced with <r>/<b>` to `Skipped: <remote> unreachable` when attached and offline

## Assumptions

### Initial (from elaboration)
- [high] The root cause is `bootstrap()` discarding `sync()`'s `synced` flag and hardcoding `action = "synced"`. **Why:** Confirmed by reading `lib/plans-git.js:1076-1082` (ignores `res.synced`), `sync()`'s `synced` assignment at line 586 vs. the `!pull.ok` path at 582-584, and the CLI rendering final line from `action` at `bin/plans-git.js:106`. The #042 Changes section also names this exact follow-up.
- [low] The distinct outcome is reported as `action = "skipped"` reusing the existing `Skipped:` CLI branch with `reason = "<remote> unreachable"`, rather than introducing a new `action` value or a new OK wording. **Why:** The task explicitly offers `Skipped: <remote> unreachable` as the preferred wording, the existing `Skipped:` renderer already reads `res.reason`, and this keeps the CLI change to zero. A new `action` enum value would ripple into the integration test and docs for no benefit.
- [low] The offline/failed case is distinguished from the legitimate no-upstream no-op by `res.synced === false` AND `res.warnings.length > 0`. The no-upstream case (no warnings) keeps today's `action = "synced"` behavior and is left untouched. **Why:** `sync()` returns `synced: false` both for a failed pull (which always pushes a warning) and for a missing upstream (which returns silently). The task scopes the fix to the unreachable-remote case only; changing the no-upstream case would be out of scope and could alter a normal outcome. Flagged low because it is a scoping judgment the source description did not spell out.
- [low] A conflict-aborted rebase (also `synced === false` with a warning) will likewise report `Skipped: <remote> unreachable`, which is slightly imprecise wording for that rarer case. **Why:** Both failure modes land in `handleFailedPull` with `synced: false` + a warning, and the task's primary target is the unreachable-remote case. Treating both as "skipped" is correct (neither synced); refining the reason string per failure mode is a possible follow-up but out of scope here. If precision matters, Step 2 could branch on the warning text, but that couples to message strings and was deliberately avoided.

### Discovered during execution
- [high] The test makes the remote unreachable via `git -C .plans remote set-url origin <nonexistent-path>` (on the `.plans` worktree, where `sync` pulls). First try worked — no experimentation needed; the clone's `.plans` worktree shares the superproject's git config but the `set-url` on the `.plans` dir's own remote is what the `pull` inside it consults, and pointing it at a nonexistent bare repo made `git pull --rebase` fail with the expected `plans sync failed` warning. **Why:** matches the plan's recommended first approach; no need to fall back to removing the bare origin.
- [low] Step 2 distinguishes the offline/failed case from the legitimate no-upstream no-op by `res.synced === false && res.warnings.length > 0`, mirroring the elaborated assumption. No new decision — implemented as specified. **Why:** `sync()` returns `synced:false` for both a failed pull (always pushes a warning) and a missing upstream (returns silently, no warning); the warnings-count check cleanly separates them without coupling to message strings.
- [high] `bin/plans-git.js` was NOT changed — its existing `else` branch (line 107) already renders `Skipped: ${res.reason}`, so the new `action:"skipped"` + `reason:"<remote> unreachable"` combination prints `Skipped: origin unreachable` with no CLI edit. **Why:** Step 3 instructed to prefer leaving the CLI untouched if it already produces the right line, which it does.

## Changes

**Fix:** `lib/plans-git.js` — `bootstrap()` branch-mode path (~line 1076) no longer hardcodes `action = "synced"`. It now reads `sync()`'s result: `res.synced === true` → `action = "synced"` (real sync); `res.synced === false` with warnings present (offline / aborted rebase) → `action = "skipped"`, `reason = "<remote> unreachable"` (rendered by the CLI's existing `Skipped:` branch); `res.synced === false` with no warnings (no upstream, legitimate no-op) → unchanged, still reported as `synced`. `ok`, `renumbered`, and `warnings` propagation preserved in all cases.

**Test:** `test/plans-git.test.js` — added regression test "bootstrap: an attached .plans with an unreachable remote is a warning and a skip, never a false 'synced'" in the `--- bootstrap ---` block. It `initBranch`es a clone, bootstraps once (confirms `synced`), repoints the `.plans` worktree's `origin` to a nonexistent path so the next `pull --rebase` fails, bootstraps again, and asserts `action === "skipped"`, `ok === true`, `error === null`, `reason` matches `/unreachable/`, and a `/plans sync failed/` warning is present. Verified RED against the old code (was `synced`), GREEN after the fix.

**Docs:** `CLAUDE.md` "Remote bootstrap & helpers" paragraph and `README.md` "Remote sessions (branch mode)" section updated so the attached + unreachable outcome now reads `Skipped: <remote> unreachable` (after a `Warning:` line), not a misleading `OK: .plans synced`.

**No change needed:** `bin/plans-git.js` — its existing `else` branch (line 107) already renders `Skipped: ${res.reason}`, so the new `action: "skipped"` + `reason` combination prints `Skipped: origin unreachable` with no CLI edit. `test/branch-mode.integration.test.js` grepped (not run): its only `synced` assertion is a reachable-remote case that legitimately still reports `synced` — no regression.

**Tests:** `node --test test/plans-git.test.js` → 55 pass, 0 fail (targeted file only, per the plans-cc targeted-tests-only rule). Independently re-run and re-verified by the orchestrator in the worktree.

**Diffstat (vs main):** `CLAUDE.md` 1 line, `README.md` 1 line, `lib/plans-git.js` +14/-1, `test/plans-git.test.js` +22. Branch/HEAD provenance asserted unchanged across execution.

## Notes
- Follow-up found during #042 execution (see the Changes section of `042-add-branch-mode-cleanup-health-check.md`).
