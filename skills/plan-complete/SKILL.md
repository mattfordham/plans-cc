---
name: plan-complete
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Bash
description: Mark a task as done and archive it
---

# plan-complete

Mark a task as completed, archive it, and update tracking files.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001") — optional if only one task is in-progress

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Resolve which task to complete**

   **If `$ARGUMENTS` provided:**
   - Zero-pad to 3 digits
   - Find task file in `.plans/pending/NNN-*.md`

   **If no `$ARGUMENTS`:**
   - Find in-progress tasks
   - If exactly one: auto-select it
   - If multiple: list and ask which to complete
   - If none in-progress but pending exist: list pending and ask (with warning)

3. **Validate task state**
   - Read the task file
   - Check Status:
     - If `in-progress`: proceed (ideal)
     - If `pending` or `elaborated`: warn "Task #NNN wasn't started. Are you sure you want to mark it complete?" Require confirmation.
     - If not found: "Task #NNN not found."

4. **Display verification criteria**
   Show the Verification section and ask:
   ```
   Verification criteria for #NNN:
   [Verification section content]

   Have these criteria been met? (yes/no)
   ```
   - If "no": warn but allow completion if user insists
   - If "yes": proceed

5. **Update task file**
   - Change Status to `completed`
   - Add completion timestamp: `**Completed:** [YYYY-MM-DDTHH:MM]`
   - Write updated file (still in pending/ temporarily)

6. **Move to completed/**
   - Move file from `.plans/pending/NNN-slug.md` to `.plans/completed/NNN-slug.md`

7. **Update HISTORY.md**
   - Append row to the history table:
     ```
     | NNN | [Title] | [type] | [YYYY-MM-DD] | [Brief summary from Changes section] |
     ```

8. **Update PROGRESS.md**
   - Remove task from "Active Work" section
   - Add to "Recently Completed" (keep last 5):
     ```
     ## Recently Completed
     - **#NNN** - [Title] (completed [YYYY-MM-DD])
     ```
   - Update Stats section:
     - Decrement In Progress count
     - Increment Completed count
   - Update "Last updated" date

9. **Optional: Git commit**
   - Read config.json for `git_commits` setting
   - If true:
     ```bash
     git add .plans/
     git commit -m "plan: complete #NNN - [title]"
     ```

10. **Display confirmation**
    ```
    Completed task #NNN: [Title]

    Summary:
    [Changes section content]

    Archived to: .plans/completed/NNN-slug.md

    Stats:
    - Pending: X
    - Elaborated: X
    - In Progress: X
    - Completed: X

    Next: /plan-status or /plan-capture for new tasks
    ```

## Edge Cases

- **No ID + one active task**: Auto-select it
- **No ID + multiple active**: List and ask
- **Verification not met**: Warn but allow completion with explicit confirmation
- **Pending/elaborated task** (never started): Extra warning, require confirmation
- **Task not found**: Error with suggestion to `/plan-list`
- **Git commit fails**: Warn but don't fail the completion
- **HISTORY.md malformed**: Append row anyway, it's just a log
