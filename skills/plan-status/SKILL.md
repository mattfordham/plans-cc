---
name: plan-status
disable-model-invocation: false
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

2. **Gather git branch info**
   - Run `git branch --show-current` to get the current branch (if in a git repo)
   - Scan for sub-repos: `find . -maxdepth 2 -name .git -type d` (excluding `./.git`)
   - If sub-repos found, run `git -C [sub-repo-dir] branch --show-current` for each
   - Store results for display in step 5

3. **Gather all tasks**
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

4. **Sort tasks for display**
   Order pending tasks by status priority:
   1. `in-progress` (currently being worked on)
   2. `review` (execution complete, awaiting review)
   3. `elaborated` (ready to start)
   4. `pending` (needs elaboration)

5. **Display output**

   Output EXACTLY this format. Each task is ONE LINE. No tables, no separators, no labels.

   ```
   # Plans Status

   Branch: feature/login-fix
   Sub-repos: app → feature/login-fix · api → main

   2 pending · 1 ready · 1 in progress · 1 in review · 3 completed

   ▶ 003 Fix login timeout [bug] 3/5
   ★ 004 Add search feature [feature] 4/4
   ○ 002 Add dark mode [feature] 0/4
   · 001 Update docs [chore]

   Legend: ▶ In Progress  ★ Review  ○ Ready  · Pending

   ## Quick Actions
   [Contextual suggestions based on current state]
   ```

   **Branch display rules:**
   - `Branch:` line — show current branch of the root repo (omit if not a git repo)
   - `Sub-repos:` line — only show if sub-repos were detected. Format: `name → branch` separated by ` · `
   - If root is not a git repo but sub-repos exist, omit the `Branch:` line and only show `Sub-repos:`
   - Blank line between branch info and the summary counts line

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

6. **Generate contextual suggestions**
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
