---
name: plan-show
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Glob
description: Show detailed overview of a specific task
---

# plan-show

Display a focused overview of a single task: what it is, current progress, and what remains.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve task ID**
   - Accept flexible ID formats: "1", "01", "001"
   - Zero-pad to 3 digits for file lookup
   - Search both `.plans/pending/NNN-*.md` and `.plans/completed/NNN-*.md`

3. **Handle missing ID argument**
   - If no `$ARGUMENTS`, list all tasks and ask which to show:
     ```
     Which task do you want to see?

     Active:
     #001 - Fix login timeout bug (in-progress)
     #002 - Add dark mode (elaborated)

     Completed:
     #003 - Initial setup (completed)
     ```

4. **Validate task exists**
   - If not found in either directory: "Task #NNN not found. Run `/plan-list` to see available tasks."

5. **Parse task file**
   Extract all fields:
   - Title (from `# ` header)
   - Type (from `**Type:**` line)
   - Status (from `**Status:**` line)
   - Created (from `**Created:**` line)
   - Completed (from `**Completed:**` line, if present)
   - What section content
   - Why section content
   - How section content (including checkboxes)
   - Verification section content

6. **Parse checkbox progress**
   From the How section:
   - Find all `- [ ]` lines (incomplete steps)
   - Find all `- [x]` lines (completed steps)
   - Calculate: completed / total
   - Extract step text for each checkbox

7. **Display task overview**

   **For pending tasks (not yet elaborated):**
   ```
   # Task #NNN: [Title]

   **Status:** pending | **Type:** [type] | **Created:** [date]

   ## What
   [What section content]

   ---
   This task hasn't been elaborated yet.
   Next: `/plan-elaborate NNN` to research and plan the implementation.
   ```

   **For elaborated tasks:**
   ```
   # Task #NNN: [Title]

   **Status:** elaborated | **Type:** [type] | **Created:** [date]

   ## Summary
   [First sentence or two from What section]

   ## Why
   [Why section content]

   ## Progress: 0/N steps (not started)
   - [ ] Step 1 description
   - [ ] Step 2 description
   - [ ] Step 3 description

   ## Verification
   [Verification section content]

   ---
   Next: `/plan-execute NNN` to start working on this task.
   ```

   **For in-progress tasks:**
   ```
   # Task #NNN: [Title]

   **Status:** in-progress | **Type:** [type] | **Created:** [date]

   ## Summary
   [First sentence or two from What section]

   ## Why
   [Why section content]

   ## Progress: X/N steps ████░░ XX%

   ### Completed
   - [x] Step 1 description
   - [x] Step 2 description

   ### Remaining
   - [ ] Step 3 description
   - [ ] Step 4 description

   ## Verification
   [Verification section content]

   ---
   Next: `/plan-execute NNN` to continue working.
   ```

   **For review tasks:**
   ```
   # Task #NNN: [Title]

   **Status:** review | **Type:** [type] | **Created:** [date]
   **Branch:** [branch-name]

   ## Summary
   [First sentence or two from What section]

   ## Completed Steps (X/N)
   - [x] Step 1 description
   - [x] Step 2 description
   - [x] Step 3 description

   ## Verification
   [Verification section content]

   ---
   Next: `/plan-review NNN` to review changes, then `/plan-complete NNN` to finalize.
   ```

   **For completed tasks:**
   ```
   # Task #NNN: [Title]

   **Status:** completed | **Type:** [type]
   **Created:** [date] | **Completed:** [date]

   ## Summary
   [First sentence or two from What section]

   ## Why
   [Why section content]

   ## Completed Steps (N/N)
   - [x] Step 1 description
   - [x] Step 2 description
   - [x] Step 3 description

   ## Verification
   [Verification section content]
   ```

   **Progress bar rendering:**
   - Use filled/empty blocks: `████░░` (4 filled, 2 empty for ~67%)
   - 6 total blocks, scale percentage to blocks
   - Include X/N count and percentage

8. **Handle sparse task files**
   - If Why section is empty: omit it from display
   - If How section is empty: show "No steps defined"
   - If Verification is empty: omit it from display

## Edge Cases

- **No ID argument**: List tasks and prompt for selection
- **Task not found**: Error with suggestion to run `/plan-list`
- **Pending task**: Show limited info, suggest elaboration
- **Malformed file**: Show what can be parsed, note issues
- **Very long sections**: Show full content (no truncation)
