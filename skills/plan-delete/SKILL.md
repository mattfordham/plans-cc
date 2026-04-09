---
name: plan-delete
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Remove a task permanently
---

# plan-delete

Permanently delete a task from the system.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Resolve task ID**
   - If no `$ARGUMENTS`, list all tasks and ask which to delete:
     ```
     Tasks:
     #001 - Fix login timeout bug (in-progress)
     #002 - Add dark mode (pending)
     #003 - Setup CI (completed)

     Which task ID to delete?
     ```
   - Zero-pad provided ID to 3 digits

3. **Find task file**
   - First check `.plans/pending/NNN-*.md`
   - If not found, check `.plans/completed/NNN-*.md`
   - If not found in either: "Task #NNN not found."

4. **Read and display task info**
   ```
   Task to delete:

   **#NNN** - [Title]
   Type: [type]
   Status: [status]
   Created: [date]
   [If completed: Completed: [date]]

   ## What
   [What section content]
   ```

5. **Warn for in-progress or review tasks**
   If status is `in-progress`:
   ```
   Warning: Task #NNN is currently in progress!
   Any uncommitted work will be lost.
   ```

   If status is `review`:
   ```
   Warning: Task #NNN is in review and has a branch with unmerged changes!
   The branch will remain but the task tracking will be lost.
   ```

6. **Confirm deletion**
   ```
   Are you sure you want to permanently delete task #NNN? (yes/no)
   ```
   - Require explicit "yes" to proceed
   - Any other response: "Deletion cancelled."

7. **Delete the file**
   - Remove the task file from pending/ or completed/

7b. **Clean up state file**
    - Check if `.plans/state/NNN-state.md` exists (where NNN is the zero-padded task ID)
    - If it exists, delete it: `rm .plans/state/NNN-state.md`
    - If the `state/` directory is now empty, remove it: `rmdir .plans/state`

7c. **Clean up associated branch**
    - Check if the task had a `**Branch:**` field (from step 4)
    - If no branch field, skip to step 8
    - Check if the branch exists locally: `git branch --list [branch-name]`
    - **If branch exists, use `AskUserQuestion` tool:**
      - Header: "Branch"
      - Question: "Branch '[branch-name]' exists for this task. Delete it?"
      - Options:
        1. "Delete branch" — Remove the local branch
        2. "Keep branch" — Leave the branch as-is
    - If "Delete branch": `git branch -D [branch-name]`
    - If "Keep branch": no action

8. **Update PROGRESS.md**
   - Update Stats section counts
   - If task was in "Active Work", remove it
   - If task was in "Recently Completed", remove it
   - Update "Last updated" date

9. **Update HISTORY.md (if completed task)**
   - If deleting a completed task, remove its row from the history table
   - (Optional: could leave it for audit trail — user preference)

10. **Commit .plans/ changes**
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently
    - Read `.plans/config.json` for `git_commits` setting
    - If `git_commits` is not `true`: skip silently
    - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
    - If no changes: skip silently
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: delete #NNN - [title]"
      ```
    - If commit fails (e.g. hooks): warn but do not fail the skill

11. **Display confirmation**
    ```
    Deleted task #NNN: [Title]

    Updated stats:
    - Pending: X
    - Elaborated: X
    - In Progress: X
    - Completed: X
    ```

## Edge Cases

- **No ID argument**: List all tasks (both pending and completed) and ask
- **In-progress task**: Extra warning about losing work
- **Review task**: Warning about unmerged branch changes
- **Completed task**: Note that history entry will also be removed
- **Task not found**: Error message
- **User cancels**: "Deletion cancelled." — no changes made
- **Only task in system**: Allow deletion, show empty stats after
