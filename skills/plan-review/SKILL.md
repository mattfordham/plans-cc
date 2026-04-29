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

Review a task that has completed execution (typically via worktree workflow). Checks out the task's branch and displays a summary of changes for the user to inspect and test manually.

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

4. **Check for uncommitted changes**
   - Run `git status --porcelain` to check for uncommitted changes in the current checkout
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
   - Get the branch name from the task file's `**Branch:**` field
   - Check if branch exists: `git branch --list [branch-name]`
   - If branch doesn't exist: "Branch '[branch-name]' not found. It may have been deleted."
   - Checkout branch: `git checkout [branch-name]`

6. **Rebase onto latest main**
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

8. **Commit .plans/ changes**
   - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
   - If not a git repo: skip silently
   - Check if `.plans/` is gitignored: `git check-ignore -q .plans/ 2>/dev/null`
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

9. **Display review summary**

   Determine the default/target branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` or fall back to main/master.

   ```
   # Review: Task #NNN — [Title]

   **Branch:** [branch-name]
   **Type:** [type] | **Status:** [status]

   ## Summary
   [First 2-3 sentences from the What section]

   ## Changes
   [Output of: git diff --stat [default-branch]...[branch-name]]

   ## Completed Steps
   - [x] Step 1 description
   - [x] Step 2 description
   - [x] Step 3 description

   ## Verification Criteria
   [Verification section content]

   ---
   You're now on branch `[branch-name]`.
   Test the changes, then:
   - `/plan-complete NNN` to merge and archive
   - `/plan-execute NNN` to continue working
   - `/plan-pause NNN` to commit changes, revert status to `review`, and switch back to main
   - `/plan-reopen NNN` if it needs rework after completion
   ```

## Edge Cases

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
