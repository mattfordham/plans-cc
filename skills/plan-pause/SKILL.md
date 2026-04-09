---
name: plan-pause
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
description: Pause an in-progress task to switch context
---

# plan-pause

Pause an in-progress task so you can switch to another task. Progress (checked boxes) is preserved — resume later with `/plan-execute`.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001") — optional if only one task is in-progress

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Resolve task ID**

   **If `$ARGUMENTS` provided:**
   - Extract the numeric ID (first word)
   - Zero-pad to 3 digits
   - Find task file in `.plans/pending/NNN-*.md`

   **If no `$ARGUMENTS`:**
   - Find in-progress tasks in `.plans/pending/`
   - If exactly one: auto-select it
   - If multiple: list them and ask which to pause
   - If none: error "No in-progress tasks to pause."

3. **Validate task state**
   - Read the task file
   - Check Status:
     - If `in-progress`: proceed
     - If `review`: error "Task #NNN is in review, not in-progress. Use `/plan-review NNN` or `/plan-complete NNN`."
     - If `elaborated` or `pending`: error "Task #NNN is not in progress."
     - If `completed`: error "Task #NNN is already completed."
   - Extract title from H1 heading
   - Parse checkbox progress from How section:
     - Count total: all `- [ ]` and `- [x]` lines
     - Count completed: `- [x]` lines

4. **Update task file**
   - Change Status from `in-progress` to `elaborated`
   - **Do NOT touch checkboxes** — leave all `[x]` and `[ ]` as-is
   - Do NOT change any other metadata fields (Branch, Created, Type, etc.)
   - Add or append to Notes section:
     ```markdown
     **Paused:** [ISO timestamp YYYY-MM-DDTHH:MM]
     ```
     If Notes section already exists, append the line to it.

5. **Update PROGRESS.md**
   - Remove task from "Active Work" section (if present)
   - Update Stats section:
     - Decrement In Progress count
     - Increment Elaborated count
   - Update "Last updated" date

6. **Optional: Git commit**
   - Read config.json for `git_commits` setting
   - If true:
     ```bash
     git add .plans/
     git commit -m "plan: pause #NNN - [title]"
     ```

7. **Display confirmation**

   Print EXACTLY this format (substitute values in {braces}):

   ```
   Task #{id} paused: {title}

   Progress: {completed}/{total} steps complete (preserved)

   Resume with: /plan-execute {id}
   ```

   **STOP after "Resume with:" line. Do not add anything else.**

## Edge Cases

- **Not initialized**: Error: "Not initialized. Run `/plan-init` first."
- **No in-progress tasks**: Error: "No in-progress tasks to pause."
- **Task not found**: Error: "Task #NNN not found."
- **Task not in-progress**: Error with appropriate message based on actual status
- **Multiple in-progress tasks, no ID**: List them and ask which to pause
- **Task has no How section**: Show "Progress: 0/0 steps" — still allow pause
- **Git commit fails**: Warn but don't fail the pause operation
