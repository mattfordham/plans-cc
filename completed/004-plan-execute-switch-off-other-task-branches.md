# Plan-execute: switch off other in-progress task branches before creating new branch

**ID:** 004
**Created:** 2026-04-12T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-04-13T00:00

## What
When `/plan-execute` starts a new task with branch or worktree mode, detect if the current checked-out branch belongs to another in-progress task (by scanning `.plans/pending/*.md` for `Status: in-progress` and reading their `**Branch:**` field). If it does, automatically switch to the default branch (main/master) before running `git checkout -b` or `git worktree add`, and print a brief notice. Do not ask the user. If the current branch is not another task's branch, leave it alone — branch off the current checkout as before. Resume mode is unaffected. Apply the same pre-switch per-repo in the multi-repo path.

See `~/.claude/plans/quiet-stargazing-pudding.md` for full design context.

## Why
Adds value by preventing silent branch contamination: when a user starts a new task while another in-progress task's branch is still checked out, the new branch is currently created off the other task's branch instead of `main`. This mixes unrelated in-progress work into the new task. The fix is automatic (no prompt) so the user doesn't have to remember to switch manually.

## How
- [x] Step 1: In `skills/plan-execute/SKILL.md`, insert a new "Pre-switch off other in-progress task branches" bullet into step 7c immediately before line 248 (the "Auto-accept shortcut" line). Content: get current branch via `git rev-parse --abbrev-ref HEAD`, scan `.plans/pending/*.md` for `Status: in-progress` (excluding the task being started), extract each `**Branch:**` field value, and if the current branch matches any of them, resolve the default branch via `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` (fall back to `main` then `master`), run `git checkout [default-branch]`, and print `Current branch belongs to in-progress task #MMM. Switched to [default-branch] before creating new branch.` Otherwise do nothing.
- [x] Step 2: Update the multi-repo bullet at lines 236–241 of the same file to note that the same pre-switch check must be applied per-repo: before running `git checkout -b [branch-name]` in each sub-repo (line 240), check that sub-repo's current branch against in-progress task branches and switch it to its default branch first if it matches.
- [x] Step 3: Confirm the Resume mode path (step 5, lines 169–186) is untouched — Resume mode does not run step 7c, so no change needed there. Add no code; just verify by re-reading those lines.
- [x] 👁 Step 4: Manually verify end-to-end in a scratch repo per the Verification section below (requires running interactive `/plan-execute` commands which the agent cannot self-test).

## Verification
Manual end-to-end test in a scratch git repo with `.plans/` initialized:

1. **Contamination scenario (primary):** With task A in-progress and its branch (e.g., `feature/001-task-a`) checked out — do NOT run `/plan-pause` — capture and elaborate task B, then run `/plan-execute 2 branch`. Expected: console prints `Current branch belongs to in-progress task #001. Switched to main before creating new branch.` Then `feature/002-task-b` is created off `main`. Confirm with `git log feature/002-task-b ^main` showing no commits from task A.

2. **Negative test:** From clean `main`, run `/plan-execute N branch` for a fresh task — no pre-switch message appears. From an unrelated user feature branch (not tracked by any task), run `/plan-execute N branch` — no pre-switch; the user's feature branch is respected as the base.

3. **Worktree variant:** Repeat scenario 1 with `/plan-execute 2 worktree`. The worktree's branch should be based on `main`, not on task A's branch. Verify with `cd .worktrees/002-task-b && git log ^main`.

4. **Resume mode untouched:** Run `/plan-execute 1` on an in-progress task — no pre-switch logic should fire.

## Changes
- `skills/plan-execute/SKILL.md`: Inserted new "Pre-switch off other in-progress task branches" sub-bullet in step 7c (single-repo path) at lines 251–259, between "Generate suggested branch name" (line 250) and "Auto-accept shortcut" (line 260). The new block instructs: read current branch, scan `.plans/pending/*.md` for in-progress tasks (excluding the task being started), extract their `**Branch:**` field, and if the current branch matches, resolve the default branch (origin/HEAD → main → master), `git checkout` it, and print a notice. Otherwise no change.
- `skills/plan-execute/SKILL.md`: Expanded the multi-repo branch-creation bullet at line 240 into a sub-block (lines 240–243) that applies the same pre-switch check per sub-repo before `git checkout -b [branch-name]`: checks that sub-repo's current branch against in-progress task branches, resolves that sub-repo's default branch if a match, checks it out, then creates the new branch.
- Verified Resume mode (step 5, lines 165–199) does not invoke step 7c and does not create/check out branches — no changes needed there.

## Notes
Reference plan file: `~/.claude/plans/quiet-stargazing-pudding.md`

Exact insertion point: `skills/plan-execute/SKILL.md` immediately before line 248 (inside step 7c, after the "Generate suggested branch name" bullet on line 247, before the "Auto-accept shortcut" bullet).
