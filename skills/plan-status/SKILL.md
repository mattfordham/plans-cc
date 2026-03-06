---
name: plan-status
disable-model-invocation: true
allowed-tools:
  - Read
  - Bash
  - Glob
description: Show dashboard of all tasks and current progress
---

# plan-status

Display a compact dashboard showing the current state of all tasks.

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist: "Not initialized. Run `/plan-init` to get started."

2. **Gather all tasks**
   For each task in `.plans/pending/`:
   - Extract ID from filename (first 3 digits)
   - Extract title from `# ` header line
   - Extract type from `**Type:**` line
   - Extract status from `**Status:**` line
   - **Parse checkbox progress from How section:**
     - Count total: all `- [ ]` and `- [x]` lines
     - Count completed: `- [x]` lines
     - Store as `completed_steps/total_steps`

   Count tasks in `.plans/completed/` for the summary line.

3. **Sort tasks for display**
   Order pending tasks by status priority:
   1. `in-progress` (currently being worked on)
   2. `review` (execution complete, awaiting review)
   3. `elaborated` (ready to start)
   4. `pending` (needs elaboration)

4. **Display output**

   Output EXACTLY this format. Each task is ONE LINE. No tables, no separators, no labels.

   ```
   # Plans Status

   2 pending · 1 ready · 1 in progress · 1 in review · 3 completed

   ▶ 003 Fix login timeout [bug] 3/5
   ★ 004 Add search feature [feature] 4/4
   ○ 002 Add dark mode [feature] 0/4
   · 001 Update docs [chore]

   Legend: ▶ In Progress  ★ Review  ○ Ready  · Pending

   ## Quick Actions
   [Contextual suggestions based on current state]
   ```

   **CRITICAL: Each task must be exactly ONE LINE in this format:**
   - `▶ 003 Fix login timeout [bug] 3/5` — in-progress task
   - `★ 004 Add search feature [feature] 4/4` — review task
   - `○ 002 Add dark mode [feature] 0/4` — elaborated task
   - `· 001 Update docs [chore]` — pending task (no progress)

   **DO NOT use:**
   - Tables or columns
   - Separators or dividers between tasks
   - Labels like "ID:", "Task:", "Type:", "Progress:"
   - Multi-line formatting per task

7. **Generate contextual suggestions**
   Based on current state:

   **If no tasks at all:**
   - "Get started: `/plan-capture <description>` to add your first task"

   **If only pending tasks:**
   - "Next: `/plan-elaborate <id>` to research a task before starting"

   **If elaborated tasks exist:**
   - "Ready to work: `/plan-execute <id>` to start an elaborated task"

   **If in-progress tasks exist:**
   - "Continue: `/plan-execute <id>` to continue working"
   - "Done? `/plan-complete <id>` to mark complete"

   **If review tasks exist:**
   - "Ready for review: `/plan-review <id>` to review changes"

   **If tasks completed recently:**
   - "Great progress! `/plan-capture` to add more tasks"

## Edge Cases

- **Not initialized**: Friendly message suggesting `/plan-init`
- **No tasks**: Show empty table header with suggestion to capture first task
- **Many tasks**: Show all pending tasks; completed tasks only shown as count in summary
- **Malformed task files**: Skip them, note count of unreadable files if any
