---
name: plan-review
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
description: Review a task's changes — checkout branch, walk through deferred observations, and show diff summary
---

# plan-review

Review a task that has completed execution (typically via worktree workflow). **Where it runs depends on whether the execution worktree was kept.** For most tasks the execution worktree was already removed by `/plan-execute` and the task's commits live on a branch in this repository (worktrees share `.git` with the main repo, so the branch survives worktree removal); in that case this skill checks out that branch in the **main project directory** and displays a summary of changes. For a task executed with the `keep` keyword, the worktree survives and the task carries a live `**Worktree:**` field — in that case `/plan-review` `cd`s **into that worktree** and reviews in place (the branch is already checked out there), which is what lets multiple single-repo tasks be reviewed concurrently. Either way the user gets a summary of changes to inspect and test manually.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve task ID**
   - Accept flexible ID formats: "1", "01", "001"
   - Zero-pad to 3 digits for file lookup
   - Find task file in `.plans/pending/NNN-*.md`

   **If no `$ARGUMENTS`:**
   - Scan `.plans/pending/*.md` for tasks with `**Status:** review` or `**Status:** in-review`
   - If exactly one eligible task: auto-select it
   - If multiple eligible tasks: list them (tag each with its status — `review` = ready for review, `in-review` = resume) and ask which to review
   - If none found: check for in-progress tasks with `**Branch:**` field and list those
   - If nothing found at all: "No tasks ready for review. Run `/plan-execute <id>` to execute a task first."

3. **Validate task state**
   - Read the task file
   - Check Status field:
     - `review`: proceed — will transition to `in-review` in step 6.5 (entering review)
     - `in-review`: proceed (resuming review — status stays as-is)
     - `in-progress`: proceed (user may want to review mid-execution — do NOT change status)
     - `pending` or `elaborated`: "Task #NNN hasn't been started yet. Run `/plan-execute NNN` first."
     - `completed`: "Task #NNN is already completed."
     - Not found: "Task #NNN not found. Run `/plan-list` to see available tasks."
   - Remember the original status (`review`, `in-review`, or `in-progress`) — step 6.5 uses it.
   - Check for `**Branch:**` field:
     - If no branch: "Task #NNN has no branch. Nothing to review — the changes are in the current checkout."

3.5. **Resolve the review working directory — kept worktree if present, else the main repo**
   - **First, read the task file's `**Worktree:**` field.** This is the load-bearing signal: a task that was executed with the `keep` keyword carries a live `**Worktree:**` field naming its own checkout, and a kept worktree is the *expected* place to review (not an error).
     - **If a `**Worktree:**` field is present AND that path exists on disk:** `cd` into the worktree, set `review_in_worktree = true`, and **skip the rest of this step's "trapped in a worktree" check** — being inside the worktree is exactly what we want. The branch is already checked out there; all subsequent git commands run from this worktree cwd.
     - **If a `**Worktree:**` field is present but the path no longer exists** (manually deleted, etc.): treat it as absent — set `review_in_worktree = false`, fall through to the main-repo handling below, and proceed (the branch still lives in the main repo's `.git`).
     - **If there is no `**Worktree:**` field:** set `review_in_worktree = false` and continue to the main-repo handling below.
   - **Main-repo handling (only when `review_in_worktree` is false):**
     - Run `pwd` and verify it matches the project root (the directory containing `.plans/`). If it does not, `cd` to the project root before continuing.
     - Run `git rev-parse --git-dir 2>/dev/null` from the project root. **If the project root is not itself a git repo** (multi-repo project — the parent holds git sub-repos), this guard does not apply: there is no single worktree to be trapped in; the per-repo step 5 handles each sub-repo. Skip the rest of this step.
     - Otherwise (single git repo at the root): run `git rev-parse --show-toplevel` and `git rev-parse --git-dir`. If `--git-dir` resolves to a path inside `.worktrees/` (e.g. `.git/worktrees/NNN-slug`), error out: "plan-review must run from the main project directory, not a worktree. cd to [project-root] and re-run `/plan-review NNN`."
     - This guards against the case where a previous `/plan-execute` left the shell context positioned inside `.worktrees/NNN-slug/` for a task that has **no** live `**Worktree:**` field (e.g. a non-`keep` task whose worktree was supposed to be removed). The branch lives in the main repo's `.git`; all subsequent steps must run from there. (When `review_in_worktree` is true this error must NOT fire — the worktree is intentional.)

3.6. **Enforce review concurrency by repo set** (only when the original status from step 3 was `review` — i.e. this task is about to *enter* review)
   - **The key is worktree-liveness, not single- vs multi-repo.** A task occupies the shared `MAIN` checkout **if and only if it has NO live `**Worktree:**` field** (i.e. `review_in_worktree` is false for it — it must check its branch out into the shared main working directory). A task **with** a live kept worktree reviews entirely inside its own checkout, so it is **never** assigned `MAIN` and never contends for the shared directory. This is what lets two single-repo *kept-worktree* tasks be `in-review` concurrently — the case that previously serialized. (Multi-repo disjoint-repo-set concurrency, commit 7d6723e, still holds — it falls out of the same per-repo intersection logic below.)
   - **Repo set of a task** (compute for the incoming task and for each existing in-review task):
     - **If the task has a live `**Worktree:**` field** (its path exists on disk → it reviews in its own worktree, never in main): its repo set is its actual repos and **never includes the `MAIN` sentinel**:
       - `**Repos:**` field present → repo set = the comma-separated names there.
       - else (single-repo kept worktree, no repo metadata) → repo set = the empty set (it touches its own single repo but does *not* occupy the shared main checkout, so it cannot conflict with anything over `MAIN`). Two such single-repo kept-worktree tasks are always disjoint with respect to the shared checkout.
     - **Otherwise (no live worktree → it must check out into the shared main directory):**
       - `**Repos:**` field present → repo set = the comma-separated names there, **plus the `MAIN` sentinel** (it occupies the shared parent main checkout while operating on those repos — a no-worktree multi-repo review still uses the shared main directory).
       - else the `**Branch:**` line contains a `(multi-repo: A, B, ...)` parenthetical → repo set = the comma-separated names inside it, **plus `MAIN`** (covers legacy tasks executed before `**Repos:**` was persisted into review). Parse: take the substring between `multi-repo:` and the closing `)`, split on commas, trim each; tolerate a single name and arbitrary whitespace.
       - else (no repo metadata) → the task is **single-repo with no kept worktree**; treat its repo set as the sentinel `MAIN` (it occupies the single shared main-checkout). `MAIN` conflicts with any other task that also occupies `MAIN`.
   - Scan `.plans/pending/*.md` for every **other** task (different ID) with `**Status:** in-review`. If none, proceed.
   - Let `incoming` = this task's repo set. For each in-review occupant `O` (repo set `occ`):
     - If **both** `incoming` and `occ` contain the `MAIN` sentinel → **conflict** (both need the shared main checkout) — stop with the shared-checkout error below.
     - else if `incoming ∩ occ` is non-empty (intersecting *named* repos) → **conflict** on the overlapping repos — stop with the overlap error below.
     - else disjoint → no conflict with `O`; keep scanning. (Two kept-worktree tasks with no shared named repo, or one kept-worktree task vs a main-occupant on a different repo, are disjoint and may review concurrently.)
   - No conflicting occupant → **proceed** (concurrent review is allowed). On the first conflict, **stop now — before any checkout or status mutation** — and error:
     - Shared-checkout conflict: `Task #MMM ([title]) is already in review and occupies the shared main working directory. Concurrent single-repo review requires a kept worktree — execute with the keep keyword (/plan-execute NNN worktree keep). Otherwise pause the occupant with /plan-pause MMM (returns it to the review queue) or finish it with /plan-complete MMM, then re-run /plan-review NNN.`
     - Repo-overlap conflict (name the intersection): `Task #MMM ([title]) is already in review and touches the same repo(s): [intersection]. Concurrent review needs disjoint repo sets. Pause it with /plan-pause MMM or finish it with /plan-complete MMM, then re-run /plan-review NNN.`
   - This guard does not apply when the original status was `in-review` (resuming the same task) or `in-progress` (reviewing mid-execution) — neither creates a new `in-review` occupant.

4. **Check for uncommitted changes**
   - **Multi-repo** (`multi_repo_review` is true — determined in step 5; for ordering, compute the repo set here per step 3.6 if not yet known): run `git status --porcelain` in **each** repo in `review_repos` (`cd [repo] && git status --porcelain`) and treat the combined output as "the current checkout" below. A "Stash changes" choice stashes per repo (`cd [repo] && git stash`); "Commit changes" commits per repo (`cd [repo] && git add -A && git commit -m "wip: save changes before review"`).
   - **Single-repo:** run `git status --porcelain` to check for uncommitted changes in the current checkout
   - If uncommitted changes exist:

     **REQUIRED: You MUST call the `AskUserQuestion` tool here — do NOT auto-select an option, do NOT stash or commit automatically, do NOT skip this prompt.** The user must choose how to handle their uncommitted work.

     Call `AskUserQuestion` with:
     - Header: "Uncommitted changes"
     - Question: "You have uncommitted changes in the current checkout. What would you like to do before switching branches?"
     - Options:
       1. "Stash changes" (description: "Run `git stash` to save changes temporarily")
       2. "Commit changes" (description: "Commit current changes before switching")
       3. "Abort" (description: "Cancel the review — deal with changes first")
     - **After user responds via AskUserQuestion:**
       - If "Stash changes": run `git stash`
       - If "Commit changes": run `git add -A && git commit -m "wip: save changes before review"`
       - If "Abort": stop and exit

5. **Checkout branch**
   - **If `review_in_worktree` is true (from step 3.5): SKIP the `git checkout [branch]`.** The kept worktree already has the task branch checked out — there is nothing to switch to. Run every git command in the rest of this step (and all later steps) **from the worktree cwd** rather than the main project directory. Still run the `.plans`-protection safety guard below (do not weaken it). Then proceed to step 6. The `multi_repo_review` / `review_repos` determination below still applies (a kept multi-repo worktree carries `**Repos:**`), but each repo's commands run from inside the worktree's per-repo subdirectory rather than the main parent root.
   - **Determine review repo mode (once):** compute this task's repo set per step 3.6's definition. If it is the `MAIN` sentinel (no `**Repos:**` field and no `(multi-repo: ...)` parenthetical), set `multi_repo_review = false`. Otherwise set `multi_repo_review = true` and `review_repos = [the repo names]`.
   - **If `multi_repo_review` is false:** run the checkout body below exactly as written, in the main project directory.
   - **If `multi_repo_review` is true:** run the checkout body below **once per repo** in `review_repos`, prefixing every git command with `cd [repo] && ` (from the parent project root). The `.plans`-protection safety guard runs per repo; it is normally a no-op for sub-repos (`.plans/` lives in the parent non-git dir, not inside any sub-repo) but keep it — if a sub-repo unexpectedly tracks `.plans`, stop with the existing warning naming that repo.

   Checkout body:
   - **All commands here run in the main project directory** (single-repo) **or in each repo's directory** (multi-repo, via the `cd [repo] &&` prefix), as determined above. The branch was created by `/plan-execute` inside this same repository — `git worktree add` shares the `.git` of the (sub-)repo, so removing the worktree does not remove the branch. There is no "bringing code back" step needed.
   - Get the branch name from the task file's `**Branch:**` field
   - Check if branch exists: `git branch --list [branch-name]`
   - If branch doesn't exist: "Branch '[branch-name]' not found. It may have been deleted."
   - **Safety guard — protect the live `.plans/` directory before checkout:** A checkout that lays down a tracked `.plans` entry can delete the real untracked `.plans/` working directory. A self-referential `.plans` symlink is especially dangerous (causes an ELOOP and silently destroys task files).
     - Check whether the target branch tracks anything named `.plans`: `git ls-tree -r --name-only [branch-name] | grep -E '^\.plans($|/)'`
     - If it returns nothing: proceed normally.
     - If it returns a match: **do not checkout.** Stop and warn the user: "Branch '[branch-name]' tracks a committed `.plans` entry. Checking it out would overwrite your local `.plans/` task directory. This usually means a stray `.plans` symlink was accidentally committed. Fix it by removing the tracked entry from that branch (`git rm --cached -r .plans` on the branch) and ensure `.gitignore` contains `.plans` (no trailing slash), then retry."
   - Checkout branch: `git checkout [branch-name]`

6. **Rebase onto latest main**
   - **If `review_in_worktree` is true (from step 3.5):** no logic change to the rebase procedure below — but every git command in this step runs **from the worktree cwd** (and, for multi-repo, from the worktree's per-repo subdirectory) rather than the main project directory.
   - **If `multi_repo_review` is true (from step 5):** run this entire rebase procedure **once per repo** in `review_repos`, prefixing every git command with `cd [repo] && ` — each repo resolves its **own** default branch (the `origin/HEAD` detection below runs per repo). Scope the conflict-handling `AskUserQuestion` prompts and messages to the current repo (say "[repo]" in them). If the user picks "Resolve in place" or "Abort rebase" for **any** repo, **stop the whole review** — do not advance the remaining repos into a half-rebased state. Otherwise the single-repo procedure below is unchanged.
   - Determine the default/target branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` or fall back to main/master.
   - Fetch latest: `git fetch origin [default-branch]` (ignore errors if remote is unavailable)
   - Determine the rebase target — pick whichever is further ahead between local and remote:
     - If `origin/[default-branch]` exists: check `git merge-base --is-ancestor origin/[default-branch] [default-branch]`
       - If exit code 0: local is equal or ahead — use `[default-branch]` (local) as the rebase target
       - If exit code 1: remote is ahead — use `origin/[default-branch]` as the rebase target
     - If `origin/[default-branch]` doesn't exist (no remote): use `[default-branch]` (local)
   - Check if rebase is needed: `git merge-base --is-ancestor [rebase-target] HEAD`
     - If exit code 0: branch is already up to date, skip rebase
     - If exit code 1: rebase is needed
   - Run rebase: `git rebase [rebase-target]`
   - **If rebase succeeds:** inform the user: "Rebased onto latest `[default-branch]` — review reflects current state."
   - **If rebase conflicts:**
     - **Do NOT abort yet.** Leave the rebase in progress so the user keeps the in-flight state if they want to resolve in place.
     - Capture the conflicting file list from `git diff --name-only --diff-filter=U`.
     - Tell the user the rebase is paused mid-flight and list the conflicting files.

     **REQUIRED: You MUST call the `AskUserQuestion` tool here to let the user choose how to proceed.**

     Call `AskUserQuestion` with:
     - Header: "Rebase conflict"
     - Question: "Rebase onto `[default-branch]` hit conflicts in: [files]. The rebase is currently paused. How would you like to proceed?"
     - Options:
       1. "Resolve for me" (description: "I'll resolve the conflicts, stage the files, and continue the rebase, then proceed to the review summary")
       2. "Resolve in place" (description: "Leave the rebase paused — you'll resolve the conflicts and run `git rebase --continue` yourself")
       3. "Abort rebase" (description: "Run `git rebase --abort` and stop — branch left unchanged, re-run `/plan-review` after resolving")
       4. "Skip rebase" (description: "Abort the rebase and proceed to the review summary against the un-rebased branch (diff may be stale)")
     - **After user responds:**
       - If "Resolve for me":
         - For each file in `git diff --name-only --diff-filter=U`:
           - Read the file and resolve `<<<<<<<` / `=======` / `>>>>>>>` markers using judgment based on the task's intent (the task file's What/How sections describe what this branch is trying to achieve — favor the branch's changes for files central to the task, favor `[default-branch]` for unrelated drift).
           - For ambiguous conflicts where intent is unclear, fall back to calling `AskUserQuestion` with the conflict hunk and let the user pick a side.
           - `git add <file>` once resolved.
         - Run `git rebase --continue`.
         - If further conflicts surface (multi-commit rebase): repeat the resolve loop.
         - If `git rebase --continue` fails for a non-conflict reason: report the error, leave the rebase paused, and stop.
         - On success: tell the user "Resolved conflicts and rebased onto `[default-branch]`." and continue to step 6.5.
       - If "Resolve in place": print the conflicting files and the next-step hints (`git add <file>`, `git rebase --continue`, or `git rebase --abort`), then **stop** — do not proceed to the review summary. The user will re-run `/plan-review NNN` after resolving.
       - If "Abort rebase": run `git rebase --abort` and **stop** — do not proceed to the review summary.
       - If "Skip rebase": run `git rebase --abort`, warn that the diff is against the branch's original base and may not reflect current `[default-branch]`, then continue to step 6.5.

6.5. **Mark task as in-review**
   - If the original status from step 3 was `review`:
     - Rewrite the `**Status:**` line in the task file from `review` to `in-review`
     - Update the "Last updated" date to today
   - If the original status was `in-review` or `in-progress`: skip this step (do not mutate status)
   - The status mutation is committed as part of step 8's `.plans/` commit — do not commit separately.

7. **Walk through deferred observations**

   - Read state file (`.plans/state/NNN-state.md`) if it exists
   - Check the Observations section for any `⏳ Deferred to review` entries
   - If no deferred observations found, skip to step 8

   For each deferred observation (in order):

   1. Find the corresponding step description in the task file's How section
   2. **MUST use `AskUserQuestion` tool:**
      - Header: `"Observation"`
      - Question: Quote the observation step description, tell the user the implementation is in place, and ask them to perform the observation and report what they see. **If the entry contains ⚠ (dependency flag)**, prominently note: "Later steps were built on plan assumptions without verifying this observation — please check carefully."
      - Options:
        1. "Looks good" (description: "The observation matches expectations — continue")
        2. "Something's wrong" (description: "The observation doesn't match — describe what you see")
        3. "Skip" (description: "Continue without verifying this step")
      - **On "Looks good":**
        - Update state file Observations section: replace `⏳ Deferred to review` with `✓ User confirmed`
        - Continue to next observation
      - **On "Something's wrong":**
        - Ask user to describe what they observed (they can type in the "Other" text field, or describe in the follow-up)
        - Update state file Observations section: replace entry with `✗ [user's observation]`
        - Spawn plan-executor sub-agent with `model: "opus"` to fix the issue, including the user's observation and the current branch context in the prompt
        - After fix, **ask user to re-observe** using `AskUserQuestion` again with the same format
        - If user says "Something's wrong" again after 2 fix attempts, suggest:
          ```
          Two fix attempts haven't resolved this. Consider investigating manually,
          or run `/plan-issue` to capture this for a focused debugging session.
          ```
          Then continue to next observation (don't block indefinitely)
      - **On "Skip":**
        - Update state file Observations section: replace `⏳ Deferred to review` with `⊘ Skipped`
        - Continue to next observation

8. **Register project (best-effort telemetry)**
   - Run via Bash, best-effort and silent: `node ~/.claude/plans-cc/plan-touch.js "$PWD" 2>/dev/null || true`
   - This registers the project in the system-wide plans registry for the desktop dashboard.
   - Ignore any error and do NOT surface output to the user. Never let this break the skill.

9. **Commit .plans/ changes**
   - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
   - If not a git repo: skip silently
   - Check if `.plans/` is gitignored: `git check-ignore -q .plans 2>/dev/null`
   - If exit code 0 (ignored): skip silently
   - Read `.plans/config.json` for `git_commits` setting
   - If `git_commits` is not `true`: skip silently
   - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
   - If no changes: skip silently
   - Commit:
     ```bash
     git add .plans/
     git commit -m "plan: review #NNN - [title]"
     ```
   - If commit fails (e.g. hooks): warn but do not fail the skill

10. **Display review summary**

   Determine the default/target branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` or fall back to main/master.

   **9.a. Collect low-confidence assumptions (pre-render step)**

   Before assembling the summary output, scan the task file for a `## Assumptions` section and extract any low-confidence bullets so they can be rendered at the top of the summary.

   - Read the task file once. Locate the `## Assumptions` section heading.
     - If the section is absent (older tasks captured before the `## Assumptions` template was added won't have it): treat as empty, skip the block entirely, and continue rendering the rest of the summary. No warning, no "nothing to verify" message.
   - Within the `## Assumptions` section, scan both `### Initial (from elaboration)` and `### Discovered during execution` subsections.
   - Filter lines matching the regex `^- \[low\]` (tolerate the lines exactly as written by plan-elaborate / plan-executor — no leading whitespace expected, since these are top-level bullets under a `###` heading). For a quick runtime sanity check the rough shape is:
     ```bash
     grep -E '^- \[low\]' .plans/pending/NNN-*.md
     ```
   - Preserve each matched line's text verbatim (including any inline `**Why:**` or `**Verify during execution:**` clauses). Render the whole bullet — the trailing context is often the point of flagging the assumption.
   - High-confidence (`- [high]`) items are intentionally omitted from the default review summary to keep it uncluttered. A future flag (e.g., `/plan-review NNN --all-assumptions`) could surface them; not implemented today.
   - If zero `- [low]` matches are found: omit the `⚠ Low-confidence assumptions to verify:` block entirely. Do not render an empty heading or a "no items" placeholder.

   **9.b. Render the summary**

   If the low-confidence collection in 9.a produced one or more bullets, prepend a `⚠ Low-confidence assumptions to verify:` block to the summary, BEFORE the `**Branch:**` / `**Type:**` metadata, the diff stats, and the completed steps. The block goes at the very top so the reviewer sees it first.

   Before printing, read the task file's `## Verification` section. If it contains real content (not just the `_To be filled during elaboration_` placeholder), render each non-empty line as a `-` bullet under `**How to verify:**`. Cap at 4 bullets — if Verification is longer, pick the most concrete user-observable checks (prefer behavioral/UI checks the user can run now over abstract criteria). If Verification is empty/placeholder, use the single fallback bullet: `- Manually exercise the changes on this branch and confirm the verification criteria above hold`.

   The full `## Verification Criteria` block that earlier versions of this skill rendered between Completed Steps and the footer has been removed — the `**How to verify:**` block at the bottom is the actionable distillation, positioned for cold-return readers. The Verification content still lives in the task file for anyone who wants the full spec.

   ```
   ⚠ Low-confidence assumptions to verify:
   [matched - [low] lines, verbatim, one per line]

   # Review: Task #NNN — [Title]

   **Branch:** [branch-name]
   **Type:** [type] | **Status:** [status]

   ## Summary
   [First 2-3 sentences from the What section]

   ## Changes
   [Single-repo (`multi_repo_review` false): output of `git diff --stat [default-branch]...[branch-name]`.
    Multi-repo (`multi_repo_review` true): for each repo in `review_repos`, render a `### [repo-name]` sub-heading followed by the output of `cd [repo] && git diff --stat [that-repo's-default-branch]...[branch-name]`.]

   ## Completed Steps
   - [x] Step 1 description
   - [x] Step 2 description
   - [x] Step 3 description

   ---
   You're now on branch `[branch-name]`.

   **How to verify:**
   [bullets from Verification section, or fallback]

   **Next:** /plan-complete NNN to merge and archive

   _Other options:_ `/plan-execute NNN` to continue working · `/plan-pause NNN` to switch back to main · `/plan-reopen NNN` if rework needed
   ```

   End-of-action marker (final line): `🟡 REVIEWED · Task #NNN → Next: /plan-complete NNN`

## Edge Cases

- **Another task already `in-review`**: Block before checkout (step 3.6) only on a genuine conflict. The shared-checkout sentinel `MAIN` is keyed on **worktree-liveness**: a task occupies `MAIN` *iff* it has no live `**Worktree:**` field (it must check out into the shared main directory). Two `MAIN` occupants conflict (the shared directory can hold only one branch). A task executed with `keep` reviews inside its own kept worktree — it never occupies `MAIN`, so two single-repo kept-worktree reviews run concurrently. Tasks (worktree or not) still conflict when their **named** repo sets intersect (the error names the overlapping repos). Multi-repo tasks with **disjoint** repo sets may review concurrently (commit 7d6723e behavior preserved). Tell the user to `/plan-pause` or `/plan-complete` the conflicting occupant first — or, for a single-repo `MAIN` conflict, re-execute with `keep` to get a worktree. Does not apply when resuming the same `in-review` task or reviewing an `in-progress` one.
- **Shared non-git dir touched by two concurrent reviews**: A symlinked non-git directory (e.g. `shared-config`) is never part of a task's repo set, so the step 3.6 guard does not arbitrate it. Review provides git-checkout isolation per sub-repo only; shared non-git files are not isolated (the same as during execution, where both worktrees symlink the same shared files). Intentional non-guarantee.
- **No ID + one review/in-review task**: Auto-select it
- **No ID + no review/in-review tasks**: Check for in-progress tasks with branches, list those
- **No ID + no eligible tasks**: Error suggesting `/plan-execute`
- **Uncommitted changes**: Must handle before branch switch (stash, commit, or abort)
- **Branch doesn't exist**: Error — branch may have been deleted or never created
- **Task has no branch**: Error — nothing to review in a branch-less workflow
- **Task is pending/elaborated**: Error — must execute first
- **Already on the task's branch**: Skip checkout, just display the summary
- **Merge conflicts during checkout**: Report the conflict and suggest resolving manually
- **Rebase conflicts**: Leave the rebase paused, list conflicting files, and prompt the user to choose: have Claude resolve, resolve themselves, abort, or skip — never auto-abort
- **Already up to date with main**: Skip rebase, proceed to observations/review summary
- **Local main ahead of origin**: Rebase onto local main (handles merged-but-not-pushed tasks)
- **No state file**: Skip observation walkthrough — no deferred observations to process
- **No deferred observations in state file**: Skip observation walkthrough, proceed to review summary
- **Fix sub-agent changes during observation**: Commit fixes to the branch before continuing to next observation
- **Task file has no `## Assumptions` section**: Older tasks captured before assumption-tracking won't have the section. Step 9.a treats this as zero low-confidence items and omits the `⚠` block silently — never error or warn.
- **`## Assumptions` section present but no `- [low]` lines**: Omit the `⚠` block entirely; do not render an empty heading or "no items" message.
- **High-confidence (`- [high]`) assumptions**: Not surfaced by default. A future `--all-assumptions` flag could include them; for now, the default review summary stays uncluttered.
