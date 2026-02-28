---
name: plan-review
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Review a task's changes — checkout branch and show diff summary
---

# plan-review

Review a task that has completed execution (typically via worktree workflow). Checks out the task's branch and displays a summary of changes for the user to inspect and test manually.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

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

6. **Display review summary**

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
