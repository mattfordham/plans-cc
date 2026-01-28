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

Display a dashboard showing the current state of all tasks.

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found: "Not initialized. Run `/plan-init` to get started."

2. **Count tasks by status**
   - Scan `.plans/pending/*.md` files
   - For each file, grep for `**Status:**` line
   - Count: pending, elaborated, in-progress
   - Count files in `.plans/completed/` for completed count

3. **Gather task details**
   For each task in pending/:
   - Extract ID from filename (first 3 digits)
   - Extract title from `# ` header line
   - Extract type from `**Type:**` line
   - Extract status from `**Status:**` line
   - Extract created date from `**Created:**` line

4. **Read recent history**
   - Read last 5 entries from `.plans/HISTORY.md` table

5. **Display dashboard**
   ```
   # Plans Status

   ## Overview
   | Status | Count |
   |--------|-------|
   | Pending | X |
   | Elaborated | X |
   | In Progress | X |
   | Completed | X |
   | **Total** | **X** |

   ## Active Work
   [List in-progress tasks, or "No active tasks"]
   - **#NNN** - [Title] ([type])

   ## Ready to Start
   [List elaborated tasks, or "No elaborated tasks"]
   - **#NNN** - [Title] ([type])

   ## Backlog
   [List pending tasks, or "No pending tasks"]
   - **#NNN** - [Title] ([type])

   ## Recently Completed
   [Last 5 from HISTORY.md, or "No completed tasks yet"]
   - **#NNN** - [Title] (completed [date])

   ## Quick Actions
   [Contextual suggestions based on current state]
   ```

6. **Generate contextual suggestions**
   Based on current state:

   **If no tasks at all:**
   - "Get started: `/plan-capture <description>` to add your first task"

   **If only pending tasks:**
   - "Next: `/plan-elaborate <id>` to research a task before starting"

   **If elaborated tasks exist:**
   - "Ready to work: `/plan-start <id>` to begin an elaborated task"

   **If in-progress tasks exist:**
   - "Continue: `/plan-execute <id>` to continue working"
   - "Done? `/plan-complete <id>` to mark complete"

   **If tasks completed recently:**
   - "Great progress! `/plan-capture` to add more tasks"

## Edge Cases

- **Not initialized**: Friendly message suggesting `/plan-init`
- **No tasks**: Show empty dashboard with suggestion to capture first task
- **Many tasks**: Show counts, don't list more than 10 per section (show "and X more...")
- **Malformed task files**: Skip them, note count of unreadable files
