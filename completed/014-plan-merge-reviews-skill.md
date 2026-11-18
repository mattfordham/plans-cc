# Add A Plan-Merge-Reviews Skill

**ID:** 014
**Created:** 2026-06-07T00:00
**Type:** feature
**Status:** completed
**Branch:** feature/014-plan-merge-reviews-skill
**Completed:** 2026-06-08T00:00

## What
Add a `/plan-merge-reviews` skill that consolidates multiple review-state tasks into one combined diff for a single review pass — dry-runs for clean mergeability first, merges branches/worktrees onto one integration branch if disjoint, refuses and names conflicts if not. Note overlap with epics (#012) as a possible future `/plan-epic review` operation.

This is a **branch-level** merge tool, distinct from `/plan-combine` (which merges plan *text* pre-execution). It takes N tasks already in `review`/`in-review`, confirms their branches are disjoint and conflict-free, and stitches them onto one `integration/` branch so the user gets a single combined diff to review once instead of N times. It is deliberately safe-by-construction: it confirms the "these are simple/independent" suspicion cheaply via a dry-run and bows out the moment they aren't.

## Why
Adds value by collapsing the review burden of several small, independent finished tasks into a single review pass. Today each worktree/branch task lands in `review` separately, and `/plan-review` walks one task's branch at a time — so three trivial tasks mean three context-switches into three review sessions. When the user suspects a batch of review-state tasks are simple and non-overlapping, this skill confirms that suspicion (or denies it) and, if confirmed, produces one diff to resolve. It reuses existing conventions — `/plan-combine`'s multi-ID argument parsing, `/plan-review`'s branch/diff plumbing, `/plan-execute`'s `**Branch:**` field — rather than inventing new machinery, and it explicitly stops short of merging to main (that stays `/plan-complete`'s job).

## How

This skill is a new declarative `skills/plan-merge-reviews/SKILL.md` plus small doc patches. Frontmatter: `disable-model-invocation: true`, `argument-hint: "<id> <id> [id...]"`, allowed-tools `Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion`. The core invariant: **never touch a branch for real until an in-memory dry-run proves all branches are mergeable and disjoint.**

- [x] Step 1: **Create `skills/plan-merge-reviews/SKILL.md` — argument parsing & validation gates.** Verify `.plans/config.json` exists (else "Run /plan-init first"). Parse 2+ task IDs (zero-pad, dedup) reusing `/plan-combine`'s parsing; with no args, glob `.plans/pending/*.md`, filter `**Status:** review|in-review`, and offer them via `AskUserQuestion`. Validate gates, failing with a clear message on the first that trips: (a) every ID exists in `.plans/pending/`; (b) every task is `review` or `in-review`; (c) every task has a `**Branch:**` field (no branch → nothing to merge); (d) we are in the main repo, not a worktree (`git rev-parse --show-superproject-working-tree` must be empty, per `/plan-review`).
- [x] Step 2: **Dry-run mergeability first (the safety gate).** Detect the default branch the same way `/plan-review` does (`git symbolic-ref refs/remotes/origin/HEAD`, fallback main/master). For each task collect its changed files with `git diff --name-only [default]..[branch]`. Intersect the file sets: any overlap → STOP and name the offending files + task pairs. If file sets are disjoint, prove a real merge would be clean: create a throwaway temp branch off the default, attempt `git merge --no-commit --no-ff [each-branch]` in turn, and on any conflict abort the merge, delete the temp branch, and STOP. The refusal message names the conflicting files and the two task IDs and tells the user to resolve manually or `/plan-review` each task separately. No partial state is left behind.
- [x] Step 3: **Create the integration branch (only if dry-run passed).** Branch name `integration/review-NNN-MMM[-...]` (sorted member IDs; no timestamp so re-running on the same set is detectable). If that branch already exists, `AskUserQuestion`: reuse-after-reset vs. abort (handles the "merge the same set again after edits" case). Check out the default branch, create the integration branch, then `git merge --no-ff [each-branch]` for each member (preserve merge commits for an audit trail). Pre-merge, guard against uncommitted changes in the working tree (`git status --porcelain`) as `/plan-complete` does.
- [x] Step 4: **Update task-file bookkeeping (no status change, no main merge).** On each member task file add an `**Integration Branch:** integration/review-...` field below `**Branch:**`, and append a Notes line: `Merged into integration branch [name] for combined review via /plan-merge-reviews on [date].` Do NOT change task **Status** (they stay `review`/`in-review`), do NOT move files, and explicitly do NOT merge the integration branch to main — `/plan-complete` per task still owns the merge-to-main decision. Then run the standard `.plans/` commit block (git repo? gitignored? `git_commits` true? changes present? → `git add .plans/ && git commit -m "plan: merge-reviews #NNN #MMM ..."`).
- [x] Step 5: **Display summary + register telemetry.** Print the member task IDs/branches merged, the integration branch name, and how to review it: `git checkout integration/review-... && git diff [default]...HEAD` (or a future `/plan-epic review`). Clarify the lifecycle: review the combined branch; when satisfied, run `/plan-complete NNN` per task as usual (each still merges its own branch to main); the integration branch is a temporary review artifact the user can `git branch -d` afterward. Run the best-effort `node ~/.claude/plans-cc/plan-touch.js "$PWD"` telemetry touch. End-of-action marker: `🟢 MERGED · N tasks → Next: review integration branch` on success; on conflict-refusal emit no marker, just the named-conflict error.
- [x] Step 6: **Wire into docs + note the epics overlap.** Add a `/plan-merge-reviews` row to the "All Skills" table in `CLAUDE.md` and to `skills/plan-help/SKILL.md`. In `CLAUDE.md`, add `🟢` coverage for this skill in the emoji table's "Progress / advancing" row (no new emoji needed). Add a one-line note in this task's Notes and in #012 (`.plans/pending/012-collections-of-plans-epics.md`) Notes that `/plan-merge-reviews` is the natural primitive a future `/plan-epic review <id>` would call to review all of an epic's review-state children as one diff.

## Verification
1. Scratch repo with two review-state tasks on disjoint files: `/plan-merge-reviews <a> <b>` creates `integration/review-...`, both branches merge, `git diff [default]...HEAD` shows the combined change, both task files gain `**Integration Branch:**` and a Notes line, neither status changed, main is untouched.
2. Two review-state tasks that both edit the same file: `/plan-merge-reviews <a> <b>` refuses, names the shared file and both task IDs, creates no integration branch, and leaves no temp branch behind (`git branch` is clean).
3. Guard cases: a pending/elaborated task ID → rejected with status message; a task missing `**Branch:**` → rejected; running inside a worktree → rejected.
4. Re-running on an already-merged set offers reuse-vs-abort rather than erroring.

## Impact Scope

### Files to Modify
- [x] `skills/plan-merge-reviews/SKILL.md` — new skill (the bulk of the work)
- [x] `CLAUDE.md` — add skill to the "All Skills" table; note `🟢` coverage in the emoji table
- [x] `skills/plan-help/SKILL.md` — add the command to the help reference
- [x] `.plans/pending/012-collections-of-plans-epics.md` — Notes line on the future `/plan-epic review` overlap

### Related Files (read for conventions, not modified)
- `skills/plan-combine/SKILL.md` — multi-ID parsing, validation, commit block to imitate
- `skills/plan-review/SKILL.md` — default-branch detection, worktree guard, `git diff` plumbing
- `skills/plan-execute/SKILL.md` — `**Branch:**`/`**Worktree:**` field names, branch-prefix mapping
- `skills/plan-complete/SKILL.md` — uncommitted-changes guard and merge command shape
- `skills/plan-spawn/SKILL.md` — serialize-git-ops concurrency principle

### Behavior Affected
- New user-invoked command `/plan-merge-reviews`; no change to existing skills' behavior (doc rows only).

## Assumptions

### Initial (from elaboration)
- [high] Refuse-on-conflict with a dry-run before any real merge; never resolve conflicts or drag the user into a mid-skill conflict. **Why:** This was the explicit decision in the backlog discussion and is the skill's reason for existing — confirm/deny the "these are simple" suspicion cheaply.
- [high] The skill does NOT merge the integration branch to main; per-task `/plan-complete` keeps owning the merge-to-main decision. **Why:** `plan-complete/SKILL.md` is the sole place that prompts for and performs merge-to-main today; duplicating that here would create two divergent merge paths.
- [high] `disable-model-invocation: true`. **Why:** Every git-orchestration / action skill in the suite (combine, execute, complete, spawn) sets this; only read-only/capture skills set false.
- [low] Deliver as an integration **branch** only — no synthetic "integration task" file and no `/plan-complete-batch`. **Why:** Research flagged a synthetic task would couple this skill to the full task lifecycle; the lighter branch-only artifact meets the "one combined diff" goal. The user picked "one combined diff" but didn't specify the bookkeeping shape — worth review.
- [low] Integration branch named `integration/review-NNN-MMM` (sorted member IDs, no timestamp). **Why:** Deterministic so a re-run on the same set is detectable for reuse-vs-abort; the `integration/` prefix is a new convention not present elsewhere in the codebase.
- [low] On a re-run over an already-merged set, offer reuse-after-reset vs. abort rather than auto-creating a fresh branch; no automatic cleanup of stale integration branches. **Why:** A research Open Question with no established convention; chose the least-surprising/non-destructive default, but the lifecycle of the integration branch is unspecified by the source request.
- [low] Standalone skill, with only a doc note about the epics (#012) overlap — not folded into #012. **Why:** Matches the user's explicit "standalone, note the overlap" choice in discussion; the `/plan-epic review` operation doesn't exist yet, so this is forward-referencing.

### Discovered during execution
- [low] Dry-run (step 2b) **accumulates** merges onto the temp branch (each member merged against the already-merged result, with a throwaway `git commit --no-verify` between probes) rather than probing each branch independently against `[default]`. **Why:** Disjoint-by-name file sets can still collide (renames, mode changes, parallel adds); accumulating catches conflicts that only surface in the combined result, which is the state step 3 actually produces. Independent probes would be cheaper but less faithful.
- [low] Temp dry-run branch is named `plan-merge-reviews-dryrun` (fixed name, deleted with `git branch -D` and the user's original branch restored via `git checkout [original-branch]`). **Why:** The task said "throwaway temp branch" without naming it; a fixed, skill-namespaced name is greppable and the teardown restores the user's checkout so no state leaks. A name collision with a real branch is unlikely but unguarded.
- [low] Merge commit messages use `merge: #NNN [title] for combined review` (step 3) and member branches are merged in **sorted-ID order**. **Why:** The task specified `--no-ff` for an audit trail but not the message text or merge order; sorted order matches the deterministic branch name and gives a stable, reproducible history.
- [low] The uncommitted-changes guard (step 3) **refuses** and tells the user to commit/stash rather than offering an AskUserQuestion stash/commit/abort menu like `/plan-review` does. **Why:** This skill is a batch git-orchestration op over multiple branches; auto-stashing mid-merge is riskier here than refusing up front. The task said "guard against uncommitted changes ... as `/plan-complete` does" — `/plan-complete` commits-all without prompting, but for a review-only artifact a hard refuse is the least-surprising/non-destructive default. Worth review.
- [low] Steps 4–6 are written as one-line italic placeholders under the same `## Steps` list so the next segment can flesh them out in place. **Why:** The segment brief said to leave a skeleton for the later steps; kept them numbered and named so the structure is stable.
- [low] The `/plan-merge-reviews` row was slotted **directly after `/plan-combine`** in both `CLAUDE.md`'s "All Skills" table and `plan-help`'s "All Commands" table. **Why:** Both are multi-ID consolidation/merge operations, so co-locating them reads naturally; the brief allowed "near combine or review" and combine sits adjacent in both tables already.
- [low] Step 4 bookkeeping **updates an existing `**Integration Branch:**` field in place** but **appends a fresh Notes line** on a reuse-reset re-run (rather than rewriting the old Notes line). **Why:** The field is current-state (one integration branch per task), but the Notes history of when merges happened is informative; the brief specified the field/Notes shapes but not the re-run behavior.
- [low] Step 4's `.plans/` commit message uses the form `plan: merge-reviews #NNN #MMM → integration/review-NNN-MMM` (sorted IDs + branch name). **Why:** The brief gave `plan: merge-reviews #NNN #MMM ...` as an example; appended the integration branch name for a self-describing commit, matching `/plan-combine`'s descriptive commit style.
- [low] The SKILL.md's internal step-6 placeholder ("Wire into docs") was **removed** rather than fleshed out, leaving the skill's `## Steps` list as 1–5. **Why:** That item was a one-time build task (editing CLAUDE.md / plan-help / #012), not runtime behavior the skill performs when invoked; the actual doc wiring is the task's step 6 and is now done in those files. Keeping a "wire into docs" step in the skill's own runtime instructions would be misleading. Worth review if the placeholder was meant to remain as a runtime forward-reference.

## Changes
- Created `skills/plan-merge-reviews/SKILL.md` (new skill) with frontmatter (`name`, `disable-model-invocation: true`, `argument-hint`, `allowed-tools`, `description`) and intro prose.
- Implemented the skill's internal Steps 1–3: init check + multi-ID parse/dedup/zero-pad + no-args AskUserQuestion offer + four validation gates (existence, review/in-review status, `**Branch:**` present, main-repo-not-worktree); the dry-run safety gate (default-branch detection, file-overlap intersection, accumulating temp-branch clean-merge proof, named-conflict refusal with no partial state); and integration-branch creation (`integration/review-NNN-MMM`, reuse-vs-abort on existing branch, uncommitted-changes guard, per-member `git merge --no-ff`).
- Left Steps 4–6 as numbered italic placeholders under the same `## Steps` list for the next segment.
- Fleshed out the SKILL.md's internal Steps 4 (task-file bookkeeping + `.plans/` commit block) and 5 (summary, lifecycle clarification, telemetry touch, cold-return How-to-verify/Next blocks, `🟢 MERGED` marker, explicit no-marker-on-conflict clause). Removed the internal step-6 placeholder (it was a one-time build task, not runtime skill behavior) — skill now has 5 runtime steps.
- Wired docs: added `/plan-merge-reviews` to the "All Skills" table in `CLAUDE.md` (after `/plan-combine`) and `merge-reviews` to the 🟢 emoji row; added the command to `skills/plan-help/SKILL.md`'s command table; added the `/plan-epic review` overlap note to `.plans/pending/012-collections-of-plans-epics.md` Notes.

## Notes
Overlaps with epics (#012): a future `/plan-epic review <id>` would naturally call `/plan-merge-reviews` over an epic's review-state children to produce one combined diff. Captured here as a forward reference; not a dependency.
