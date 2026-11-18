# Fix plan-complete worktree path parsing on paths with spaces

**ID:** 045
**Created:** 2026-10-05T16:32
**Type:** bug
**Status:** completed
**Completed:** 2026-10-05T21:09
**Branch:** fix/045-fix-plan-complete-worktree-path-parsing

## What
`skills/plan-complete/SKILL.md` step 14 finds where the target branch is checked out with `git worktree list --porcelain | grep -B2 ... | head -1 | cut -d' ' -f2`. `cut` stops at the first space, so any project path containing a space (including this repo's own, `.../Open Source/plans`) yields a truncated path and the A/B/C/D merge dispatch can pick the wrong case. Replace the `cut` with `sed 's/^worktree //'` (or equivalent) and audit other skills for the same `git worktree list` parsing pattern.

## Why
A truncated `[target-checkout-path]` silently corrupts step 14's merge dispatch: a real checkout at `~/Work/Open Source/plans` becomes `~/Work/Open`, which never equals this session's `git rev-parse --show-toplevel`, so Case B (merge in place) is misread as Case C (refuse — "checked out by another session") or, if emptied, Case A/D. The user is blocked from completing a task in their own checkout, or worse, a merge runs in the wrong case. The fix makes merge-case selection correct on every path, not just space-free ones.

## How Summary
The `worktree <abs-path>` porcelain line is `worktree ` (9 chars) followed by the full absolute path, which may contain spaces. Replace the space-truncating `cut -d' ' -f2` on `skills/plan-complete/SKILL.md:284` with a prefix-strip that keeps the whole remainder — `sed 's/^worktree //'`. Then audit the only other `git worktree list --porcelain` consumer (`plan-cleanup`) to confirm it parses space-safely; it describes the parse in prose rather than a concrete `cut`, so tighten that prose to mandate a prefix-strip rather than a space split.

**Files of note:**
- `skills/plan-complete/SKILL.md` — step 14 line 284, the buggy `cut -d' ' -f2`; the single functional fix
- `skills/plan-cleanup/SKILL.md` — step ~215 prose parsing `worktree <abs-path>` lines; audit + tighten to space-safe wording

## Diagnosis

**Most likely:** `cut -d' ' -f2` on the `worktree <abs-path>` porcelain line splits on the first space and returns only the first path segment, so a target checked out at a space-containing path yields a truncated `[target-checkout-path]` that never matches this session's real toplevel (`skills/plan-complete/SKILL.md:284`).
**Evidence:** The porcelain format is a literal `worktree ` prefix (9 chars) followed by the unescaped absolute path; `git worktree list --porcelain` does not quote or escape spaces. `cut -d' ' -f2` takes field 2 only, dropping everything after the first space. This repo's own root (`~/Work/Open Source/plans`) contains a space, so the bug reproduces here.
**Confidence:** high

**To confirm:** From a worktree whose project path contains a space, run `git worktree list --porcelain | grep -B2 "^branch refs/heads/<target>$" | head -1 | cut -d' ' -f2` and confirm it prints a path truncated at the first space, then confirm `… | sed 's/^worktree //'` prints the full path intact.

## How
- [x] Step 1: Confirm the truncation. In a dir whose absolute path contains a space, create a worktree and run the existing `git worktree list --porcelain | grep -B2 "^branch refs/heads/<branch>$" | head -1 | cut -d' ' -f2` pipeline; verify it truncates at the first space, and that swapping `cut -d' ' -f2` for `sed 's/^worktree //'` returns the full path. (Confirms the Diagnosis; agent-verifiable, so untagged.)
- [x] Step 2: In `skills/plan-complete/SKILL.md:284`, replace `| cut -d' ' -f2` with `| sed 's/^worktree //'`, leaving the `grep -B2 "^branch refs/heads/[target-branch]$" | head -1` prefix of the pipeline unchanged. The result still yields `[target-checkout-path]` (empty when checked out nowhere).
- [x] Step 3: Audit `skills/plan-cleanup/SKILL.md` (~line 215), the only other `git worktree list --porcelain` consumer. It parses the `worktree <abs-path>` lines in prose, not a concrete `cut`; tighten the wording to explicitly strip the `worktree ` prefix (keep the whole remainder) rather than split on space, so an implementer cannot reintroduce the same truncation.
- [x] Step 4: Re-grep the whole repo (`skills/`, `agents/`, `lib/`, `bin/`) for `cut -d' '`, `cut -d" "`, and `git worktree list` to confirm no other space-truncating parse of worktree/path output remains.

## Verification
- The `sed 's/^worktree //'` form, run against a real `git worktree list --porcelain` whose worktree path contains a space, returns the full untruncated absolute path, so step 14's Case A/B/C/D dispatch compares the correct path against `git rev-parse --show-toplevel`.
- `skills/plan-complete/SKILL.md:284` no longer contains `cut -d' '`; `plan-cleanup`'s worktree-parsing prose no longer implies a space split.
- A repo-wide grep for `cut -d' '` / `git worktree list` surfaces no remaining space-truncating path parse.
- `npm test` still passes (no runtime code changed; this guards against accidental edits elsewhere).

## Impact Scope

### Files to Modify
- [x] `skills/plan-complete/SKILL.md` — replace `cut -d' ' -f2` with `sed 's/^worktree //'` on line 284 (the functional fix)
- [x] `skills/plan-cleanup/SKILL.md` — tighten the ~line 215 prose to mandate a space-safe prefix-strip when parsing `worktree <abs-path>` lines (audit hardening, not a behavior change)

### Related Files (may need updates)
- `lib/plans-git.js` — the Node runtime also shells out to git, but it does NOT parse `git worktree list --porcelain` path output with a space-unsafe split (verified); no change expected, listed only so the audit is explicit.

### Endpoints/UI Affected
- `/plan-complete` step 14 merge dispatch — correctly classifies Case A/B/C/D on space-containing project paths (previously misclassified).

## Assumptions

### Initial (from elaboration)
Elaborated autonomously (no interactive UI); the decisions below were made on the user's behalf and are flagged as discovered assumptions for review.

- [high] Chose `sed 's/^worktree //'` over the task's parenthetical "(or equivalent)" (e.g. `cut -c10-`, `awk '{print substr($0,10)}'`). **Why:** the porcelain line is a fixed literal `worktree ` prefix; a prefix-strip is the most self-documenting space-safe form and is exactly what the task text proposed first.
- [high] Classified this as a SIMPLE task (Path A, auto-generated Why/How/Verification). **Why:** research found one file to functionally change plus one prose audit, a single concrete fix, and no open questions — it meets every Path A criterion. (No interactive confirmation was possible.)
- [low] Did NOT propose a `**Build:**` route. **Why:** there is no `design-system/` directory in this repo and the task is a shell-pipeline bug fix, not design-system component work — the route trigger does not fire.
- [low] Scoped the audit (Step 3) to `plan-cleanup` as a prose tightening rather than a code change, and did not rewrite it in this task. **Why:** `plan-cleanup`'s line is descriptive prose ("parse those absolute paths"), not a literal space-truncating `cut`; it is not presently buggy, so the safe-and-minimal action is to harden the wording, keeping this task a focused one-line fix plus an audit note. (Flagged for reviewer awareness.)

### Discovered during execution
- [high] Used `sed 's/^worktree //'` for the fix (exactly as the plan specified) rather than an alternative like `cut -c10-` or `awk`. **Why:** `sed 's/^worktree //'` strips the literal 9-char prefix and keeps the entire remainder including embedded spaces; it is the plan's named replacement and reads clearly as "strip the prefix".
- [low] In the plan-cleanup prose hardening I cited `cut -d' ' -f2` by name as the anti-pattern to avoid, with a concrete space-containing example path. **Why:** naming the exact wrong command an implementer might reach for is the strongest guard against reintroducing the truncation; the trade-off is that a repo-wide grep for `cut -d' '` now surfaces this prose line, but it is a warning reference, not a live parse.
- [high] Made no change to `lib/plans-git.js`. **Why:** audited it — it never parses `git worktree list --porcelain` path output; it reads single paths via `rev-parse --show-toplevel` through the git arg-array API and uses `worktree add`/`prune`, none of which split on space. No runtime change was warranted.

## Changes

**Executed in worktree** `~/Work/Open Source/plans/.worktrees/045-fix-plan-complete-worktree-path-parsing` on branch `fix/045-fix-plan-complete-worktree-path-parsing` (branched from `main`).

### Step 1 — Confirmed the truncation (diagnosis verified)
Against the real main-checkout porcelain line `worktree ~/Work/Open Source/plans`:
- Buggy `… | cut -d' ' -f2` → `~/Work/Open` (truncated at first space)
- Fixed `… | sed 's/^worktree //'` → `~/Work/Open Source/plans` (full path)

Observation provenance: branch/SHA identical before and after — not VOID.

### Step 2 — Functional fix
`skills/plan-complete/SKILL.md:284`
- Before: `… | grep -B2 "^branch refs/heads/[target-branch]$" | head -1 | cut -d' ' -f2`
- After:  `… | grep -B2 "^branch refs/heads/[target-branch]$" | head -1 | sed 's/^worktree //'`

The `grep … | head -1` prefix is unchanged; the result still yields `[target-checkout-path]` (empty when checked out nowhere), so the Case A/B/C/D merge dispatch now compares the full, untruncated path against `git rev-parse --show-toplevel`.

### Step 3 — Audit hardening (prose, not behavior)
`skills/plan-cleanup/SKILL.md:215` — reworded the worktree-registry parse instruction from the ambiguous "parse those absolute paths" to mandate stripping the literal `worktree ` prefix and keeping the **entire** remainder, explicitly warning that `cut -d' ' -f2` truncates a space-containing path. Hardens against reintroducing the same bug.

### Step 4 — Repo-wide audit
Grepped `skills/ agents/ lib/ bin/` for `cut -d' '`, `cut -d" "`, `git worktree list`:
- `plan-complete/SKILL.md:284` — now the space-safe `sed` (fixed).
- `plan-cleanup/SKILL.md:215` — the only remaining `cut -d' '` is the prose warning naming the anti-pattern, not a live parse.
- `plan-cleanup/SKILL.md:219`, `:282` — prose references, assert presence only, no path split.
- `lib/plans-git.js` — confirmed no space-unsafe worktree-path parse: reads single paths via `rev-parse --show-toplevel` through the git arg-array API; every `.split()` is on `"\n"`, never on space. **No change made.**

### Tests
`node --test test/plans-git.test.js` (targeted regression guard for the audited runtime file) — **54 pass, 0 fail**. No runtime code was changed.

## Notes
- Follow-up found during #042 execution (see the Changes section of `042-add-branch-mode-cleanup-health-check.md`).
