---
name: plan-merge-reviews
disable-model-invocation: true
argument-hint: "<id> <id> [id...]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Consolidate multiple review-state tasks onto one integration branch for a single combined-diff review
---

# plan-merge-reviews

Consolidate multiple `review`/`in-review` tasks into **one** combined diff so you can review them in a single pass instead of N separate `/plan-review` sessions. This is a **branch-level** merge tool — distinct from `/plan-combine`, which merges plan *text* before execution. It takes tasks whose work is already finished and living on branches, confirms those branches are disjoint and conflict-free, and stitches them onto one `integration/` branch.

It is deliberately **safe-by-construction**: it proves all branches are cleanly mergeable in a throwaway dry-run *before* touching any real branch, and bows out the moment they overlap or conflict. It never resolves conflicts for you, and it never merges to main — per-task `/plan-complete` still owns the merge-to-main decision.

## Arguments

- `$ARGUMENTS`: Two or more task IDs separated by spaces (e.g., "2 4 5"). With no arguments, the skill offers the eligible review-state tasks to pick from.

## Steps

1. **Verify init, parse IDs, and validate gates**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check. If it does not exist, error: "Not initialized. Run `/plan-init` first."
   - **Parse task IDs** (reuse `/plan-combine`'s parsing):
     - Split `$ARGUMENTS` by spaces. Zero-pad each ID to 3 digits. Deduplicate silently (e.g. "2 2 4" → "2 4").
     - **If no `$ARGUMENTS` were provided:** glob `.plans/pending/*.md` and read each file's `**Status:**` line. Collect every task whose status is `review` or `in-review`. 
       - If none are eligible: "No tasks are in `review`/`in-review`. There's nothing to merge — run `/plan-execute <id>` to take a task to review first."
       - If one or more are eligible: present them via `AskUserQuestion` (Header: "Tasks", Question: "Which review-state tasks do you want to merge into one combined-review branch?", with one option per eligible task labeled `#NNN - [Title]` and described by its status). Let the user select (they may pick multiple, or choose an "Other" option to type IDs). Resolve the selection back to IDs.
     - After resolution, if fewer than 2 distinct IDs remain: error "Need at least 2 review-state tasks to merge — give me two or more task IDs."
   - **Validation gates** — check each in order, and on the FIRST gate that trips, STOP with a clear message naming the offending task(s). Do not proceed to step 2 unless all gates pass.
     - (a) **Existence:** every ID resolves to a file `.plans/pending/NNN-*.md`. If not: "Task #NNN not found. Run `/plan-list` to see available tasks."
     - (b) **Status:** every task's `**Status:**` is `review` or `in-review`. If a task is `pending`, `elaborated`, `in-progress`, or `completed`: "Cannot merge #NNN — its status is `[status]`, not `review`/`in-review`. Only review-state tasks can be merged for combined review."
     - (c) **Branch present:** every task file has a non-empty `**Branch:**` field. If missing/empty: "Task #NNN has no `**Branch:**` field — there's nothing to merge. (A branch-less task's changes live in the working tree, not on a branch.)"
     - (d) **Main repo, not a worktree:** run `git rev-parse --show-superproject-working-tree` (per `/plan-review`'s guard). If it prints a non-empty path, we're inside a worktree — STOP: "plan-merge-reviews must run from the main project directory, not a worktree. cd to the project root and re-run." Also confirm `pwd` is the project root containing `.plans/`; if not, `cd` there first.
   - Record, for each task, its ID, title, and branch name — steps 2 and 3 reuse them.

2. **Dry-run mergeability first (the safety gate)**

   The core invariant: **never touch a real branch until an in-memory dry-run proves every branch is mergeable and disjoint.** Run the two checks below; either failing STOPs the skill and leaves **no partial state** behind (no integration branch, no leftover temp branch).

   - **Detect the default branch** the same way `/plan-review` does: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'`; if empty, fall back to `main`, then `master`. Call this `[default]`.
   - For each member branch, confirm it exists: `git branch --list [branch]`. If a branch named in a task file doesn't exist: STOP — "Branch '[branch]' for task #NNN not found. It may have been deleted; re-run `/plan-execute NNN` or remove the stale `**Branch:**` field."

   - **2a. Cheap file-overlap check.** For each task collect the files its branch changed relative to the default:
     ```bash
     git diff --name-only [default]..[branch]
     ```
     Intersect the file sets pairwise across all members. **If any two members touch the same file**, STOP without creating anything:
     ```
     Cannot merge for combined review — overlapping files:
       [path/to/file] — changed by both #NNN and #MMM
       [other/file]   — changed by both #NNN and #PPP

     These tasks aren't independent. Resolve the overlap manually, or run
     /plan-review on each task separately.
     ```
     Name every offending file and the specific pair of task IDs that share it. Disjoint file sets are a necessary but not sufficient condition — still run 2b.

   - **2b. Prove a clean real merge via a throwaway temp branch.** Even with disjoint paths, prove the merges actually apply cleanly:
     - Before starting, ensure the working tree is clean (`git status --porcelain`); if it isn't, defer to step 3's uncommitted-changes guard handling — but for the dry-run, do not mutate the user's checkout beyond the temp branch. Record the current branch so it can be restored.
     - Create a throwaway temp branch off the default **without** moving the user's checkout permanently: `git checkout -b plan-merge-reviews-dryrun [default]`.
     - For each member branch in turn: `git merge --no-commit --no-ff [branch]`.
       - On success, reset the index/worktree for the next probe: `git merge --abort` is not applicable after a clean `--no-commit` merge with no conflict, so use `git reset --hard [default]` between probes (or accumulate merges if you want to prove the *combined* result — accumulating is preferred: it catches conflicts that only appear when two disjoint-by-name branches still collide, e.g. via rename/mode). Prefer accumulating: merge each branch onto the temp branch in sequence with `git merge --no-commit --no-ff [branch] && git commit -m "dryrun" --no-verify`, so a later branch is tested against the already-merged result.
       - **On ANY conflict** (non-zero exit, or `git diff --name-only --diff-filter=U` is non-empty): abort and tear down cleanly:
         ```bash
         git merge --abort
         git checkout [original-branch]
         git branch -D plan-merge-reviews-dryrun
         ```
         Then STOP with a refusal that names the conflicting files and the two task IDs whose branches collided:
         ```
         Cannot merge for combined review — merge conflict:
           [path/to/file] conflicts between #NNN and #MMM

         Resolve the conflict manually, or run /plan-review on each task
         separately. No integration branch was created.
         ```
     - **On full success** (all member branches merged cleanly onto the temp branch): tear the probe down so step 3 starts from a known-clean state — `git checkout [original-branch]` then `git branch -D plan-merge-reviews-dryrun`. The dry-run only proves mergeability; step 3 builds the real branch from scratch.
   - If both 2a and 2b pass, the set is provably disjoint and conflict-free — proceed to step 3.

3. **Create the integration branch (only if the dry-run passed)**
   - **Pre-merge guard against uncommitted changes** (as `/plan-complete` does): run `git status --porcelain`. If it reports any uncommitted changes in the working tree, STOP and tell the user to commit or stash first: "You have uncommitted changes in the working tree. Commit or stash them before merging — plan-merge-reviews won't touch your in-flight work." Do not auto-stash.
   - **Branch name:** `integration/review-` followed by the member IDs **sorted ascending** and joined by `-`, with no timestamp — e.g. two tasks #004 and #009 → `integration/review-004-009`; three tasks → `integration/review-004-009-013`. The deterministic name (no timestamp) makes a re-run on the same set detectable.
   - **If that branch already exists** (`git branch --list integration/review-...` is non-empty): use `AskUserQuestion`:
     - Header: "Integration branch exists"
     - Question: "`integration/review-NNN-MMM` already exists (you've merged this set before). What would you like to do?"
     - Options:
       1. "Reuse (reset)" (description: "Hard-reset the branch to [default] and re-merge the current branches — picks up any edits since last time")
       2. "Abort" (description: "Stop and leave the existing integration branch untouched")
     - On "Reuse (reset)": continue, recreating the branch from scratch (see below). On "Abort": STOP — print the existing branch name and how to review it (`git checkout integration/review-... && git diff [default]...HEAD`).
   - **Build the branch:**
     - Check out the default branch: `git checkout [default]`.
     - Create (or, on reuse, reset) the integration branch:
       - Fresh: `git checkout -b integration/review-NNN-MMM`.
       - Reuse-after-reset: `git checkout -B integration/review-NNN-MMM [default]`.
     - For each member branch in **sorted-ID order**, merge preserving the merge commit for an audit trail:
       ```bash
       git merge --no-ff [branch] -m "merge: #NNN [title] for combined review"
       ```
     - Because step 2 already proved disjointness and clean mergeability, these merges should not conflict. If one unexpectedly does (e.g. the working tree changed between dry-run and now), abort it (`git merge --abort`), check the default branch back out, delete the half-built integration branch, and STOP — report that the working tree shifted and ask the user to re-run.
   - After all members merge, the integration branch holds the combined diff. Proceed to step 4 (bookkeeping).

4. **Update task-file bookkeeping (no status change, no main merge)**

   Record the merge in each member task file so the relationship is grep-queryable later, but change nothing about the task's lifecycle — members **stay** `review`/`in-review`, files are **not** moved out of `pending/`, and the integration branch is **never** merged to main here. Per-task `/plan-complete` still owns the merge-to-main decision.

   - For **each** member task file `.plans/pending/NNN-*.md`, in sorted-ID order:
     - **Add an `**Integration Branch:**` field** on the line directly **below** the existing `**Branch:**` line, naming the integration branch built in step 3:
       ```
       **Branch:** feature/004-some-task
       **Integration Branch:** integration/review-004-009
       ```
       If the field already exists (a re-run after reuse-reset), update it in place rather than duplicating it.
     - **Append a Notes line** to the task's `## Notes` section (create the section at the end of the file if it doesn't exist):
       ```
       Merged into integration branch integration/review-004-009 for combined review via /plan-merge-reviews on 2026-06-08.
       ```
       Use today's date (`YYYY-MM-DD`). On a reuse-reset re-run, append a fresh line rather than rewriting the old one — the history of merges is informative.
   - **Do NOT** touch `**Status:**`, do NOT move the file to `completed/`, do NOT edit `PROGRESS.md`/`HISTORY.md`, and do NOT merge `integration/review-...` to the default branch.
   - **Run the standard `.plans/` commit block** (exactly as `/plan-combine` does):
     - Check inside a git repo: `git rev-parse --git-dir 2>/dev/null` — if not, skip silently.
     - Check `.plans/` is not gitignored: `git check-ignore -q .plans 2>/dev/null` — if exit code 0 (ignored), skip silently.
     - Read `git_commits` from `.plans/config.json` — if not `true`, skip silently.
     - Check for uncommitted `.plans/` changes: `git status --porcelain .plans/` — if none, skip silently.
     - Otherwise commit (use the sorted member IDs in the message):
       ```bash
       git add .plans/
       git commit -m "plan: merge-reviews #004 #009 → integration/review-004-009"
       ```
     - If the commit fails (e.g. a hook rejects it), warn but do not fail the skill.

5. **Display summary + register telemetry**

   On success (all branches merged, bookkeeping committed), print a summary that tells the user what was merged, where, and how to review and unwind it.

   - **Print the merged members and the integration branch:**
     ```
     Merged 2 review-state tasks onto one integration branch for combined review:

       #004  Some task title          feature/004-some-task
       #009  Another task title       feature/009-another-task

     Integration branch: integration/review-004-009
     ```
   - **Show how to review it:**
     ```
     Review the combined diff:
       git checkout integration/review-004-009
       git diff [default]...HEAD          # all member changes in one diff

     (A future /plan-epic review would call this skill to do the same for an
     epic's review-state children.)
     ```
     Substitute the real `[default]` branch detected in step 2.
   - **Clarify the lifecycle** so the integration branch isn't mistaken for a permanent artifact:
     ```
     What happens next:
       • Review the combined branch above as one diff.
       • When satisfied, run /plan-complete NNN per task as usual — each task
         still merges its OWN branch to main. plan-merge-reviews did NOT merge
         anything to main.
       • The integration branch is a temporary review artifact. Once the member
         tasks are completed you can delete it: git branch -d integration/review-004-009
     ```
   - **Register telemetry** (best-effort, never fails the skill):
     ```bash
     node ~/.claude/plans-cc/plan-touch.js "$PWD" 2>/dev/null || true
     ```
   - **Cold-return blocks** — end the success output with, in this order (the marker is the very last line):

     **How to verify:**
     - `git branch --list 'integration/review-*'` shows the new integration branch.
     - `git checkout integration/review-... && git diff [default]...HEAD` shows every member's changes in one combined diff.
     - Each member task file now has an `**Integration Branch:**` field and a Notes line; their `**Status:**` is unchanged (`review`/`in-review`).
     - The default branch is untouched — `git log [default]` has no new merge commits.

     **Next:** review the combined branch, then `/plan-complete NNN` per task when satisfied

     `🟢 MERGED · N tasks → Next: review integration branch`

   - **On the conflict-refusal path (step 2a overlap or step 2b merge conflict):** the skill has already STOPPED in step 2 with the named-conflict / named-overlap error and left no partial state. In that case emit **NO** end-of-action marker and none of the cold-return blocks above — the named-conflict error message is the entire output. The `🟢 MERGED` marker only ever appears when an integration branch was actually created and bookkeeping committed.

## Edge Cases

- **< 2 IDs after dedup**: Error "Need at least 2 review-state tasks to merge."
- **No arguments**: Offer the eligible `review`/`in-review` tasks via AskUserQuestion.
- **Task not found**: Error "Task #NNN not found."
- **Task not in review/in-review**: Block, naming the offending status — only review-state tasks are mergeable.
- **Task missing `**Branch:**`**: Block — nothing to merge.
- **Running inside a worktree**: Block — must run from the main repo (`git rev-parse --show-superproject-working-tree` non-empty).
- **Overlapping files between two members**: Refuse, naming the shared files and the task pairs; create nothing.
- **Merge conflict in the dry-run**: Refuse, naming the conflicting files and the two task IDs; tear down the temp branch so `git branch` is left clean; create no integration branch.
- **Branch named in a task file doesn't exist**: Error — branch may have been deleted.
- **Uncommitted changes in the working tree**: Block before merging — ask the user to commit or stash; never auto-stash.
- **Integration branch already exists (re-run on same set)**: Offer reuse-after-reset vs. abort.
