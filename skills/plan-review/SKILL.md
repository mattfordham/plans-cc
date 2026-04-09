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
   - Scan `.plans/pending/*.md` for tasks with `**Status:** review`
   - If exactly one review task: auto-select it
   - If multiple review tasks: list them and ask which to review
   - If no review tasks: check for in-progress tasks with `**Branch:**` field and list those
   - If nothing found: "No tasks ready for review. Run `/plan-execute <id>` to execute a task first."

3. **Validate task state**
   - Read the task file
   - Check Status field:
     - `review`: proceed (ideal)
     - `in-progress`: proceed (user may want to review mid-execution)
     - `pending` or `elaborated`: "Task #NNN hasn't been started yet. Run `/plan-execute NNN` first."
     - `completed`: "Task #NNN is already completed."
     - Not found: "Task #NNN not found. Run `/plan-list` to see available tasks."
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
     - Abort the rebase: `git rebase --abort`
     - Inform the user:
       ```
       ⚠ Rebase onto [default-branch] has conflicts. The branch is unchanged.

       Conflicting files:
       [list conflicting files from rebase output]

       You can:
       - Resolve conflicts manually and re-run `/plan-review NNN`
       - `/plan-execute NNN` to continue working and resolve conflicts there
       ```
     - **Stop here** — do not proceed to the review summary

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
   - `/plan-reopen NNN` if it needs rework after completion
   ```

## Edge Cases

- **No ID + one review task**: Auto-select it
- **No ID + no review tasks**: Check for in-progress tasks with branches, list those
- **No ID + no eligible tasks**: Error suggesting `/plan-execute`
- **Uncommitted changes**: Must handle before branch switch (stash, commit, or abort)
- **Branch doesn't exist**: Error — branch may have been deleted or never created
- **Task has no branch**: Error — nothing to review in a branch-less workflow
- **Task is pending/elaborated**: Error — must execute first
- **Already on the task's branch**: Skip checkout, just display the summary
- **Merge conflicts during checkout**: Report the conflict and suggest resolving manually
- **Rebase conflicts**: Abort rebase, show conflicting files, and stop — don't show a stale review
- **Already up to date with main**: Skip rebase, proceed to observations/review summary
- **Local main ahead of origin**: Rebase onto local main (handles merged-but-not-pushed tasks)
- **No state file**: Skip observation walkthrough — no deferred observations to process
- **No deferred observations in state file**: Skip observation walkthrough, proceed to review summary
- **Fix sub-agent changes during observation**: Commit fixes to the branch before continuing to next observation
