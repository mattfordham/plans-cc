---
name: plan-list
disable-model-invocation: true
argument-hint: "[filter: pending|elaborated|in-progress|review|completed|bug|feature|refactor|chore|all]"
allowed-tools:
  - Read
  - Bash
  - Glob
description: List tasks with optional filtering
---

# plan-list

Display a filtered list of tasks in table format.

## Arguments

- `$ARGUMENTS`: Optional filter (default: all non-completed)

## Valid Filters

**By status:**
- `pending` — tasks not yet elaborated
- `elaborated` — tasks researched but not started
- `in-progress` — tasks currently being worked on
- `review` — tasks with execution complete, awaiting review
- `completed` — archived tasks

**By type:**
- `bug` — bug fix tasks
- `feature` — new feature tasks
- `refactor` — refactoring tasks
- `chore` — maintenance/config tasks

**Special:**
- `all` — all tasks including completed
- (no filter) — all non-completed tasks (default)

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Parse filter**
   - If `$ARGUMENTS` provided, validate it's a known filter
   - If invalid filter: "Unknown filter '[filter]'. Valid filters: pending, elaborated, in-progress, review, completed, bug, feature, refactor, chore, all"
   - If no filter: default to showing all non-completed

3. **Scan task files**

   **For non-completed statuses (pending, elaborated, in-progress, review):**
   - Scan `.plans/pending/*.md`

   **For completed:**
   - Scan `.plans/completed/*.md`

   **For type filters or 'all':**
   - Scan both directories

4. **Parse each task file**
   Extract:
   - ID (from filename: first 3 digits)
   - Title (from `# ` header)
   - Type (from `**Type:**` line)
   - Status (from `**Status:**` line)
   - Created (from `**Created:**` line)
   - Completed (from `**Completed:**` line, if present)
   - **Checkbox progress (for elaborated/in-progress tasks):**
     - Count `- [ ]` and `- [x]` lines in How section
     - Calculate: completed/total
   - **Issue count (if Issues section present):**
     - Count `- [ ]` lines in Issues section
     - Store as `issue_count`

5. **Apply filter**
   - Status filter: match Status field
   - Type filter: match Type field
   - 'all': no filtering
   - Default (no arg): exclude completed status

6. **Sort results**
   - By status priority: in-progress > review > elaborated > pending > completed
   - Within status: by ID ascending

7. **Display as table**
   ```
   # Tasks [filter info]

   | ID | Title | Type | Status | Progress | Created |
   |----|-------|------|--------|----------|---------|
   | 001 | Fix login timeout bug | bug | in-progress | 3/5, 2 issues | 2024-01-15 |
   | 002 | Add dark mode support | feature | elaborated | 0/4 | 2024-01-16 |
   | 003 | Refactor auth module | refactor | pending | — | 2024-01-17 |

   Total: X tasks
   ```

   **Progress column:**
   - For pending tasks: show `—` (no steps defined yet)
   - For elaborated tasks: show `0/N` (N steps defined, none started)
   - For in-progress tasks: show `X/N` (X completed of N total)
   - For review tasks: show `X/N` (same as in-progress)
   - **If task has unresolved issues:** append `, N issues` (e.g., `3/5, 2 issues`)

   For completed filter, include Completed date instead of Created:
   ```
   | ID | Title | Type | Completed |
   |----|-------|------|-----------|
   | 001 | Initial setup | chore | 2024-01-10 |
   ```

8. **Handle no results**
   ```
   No tasks found matching filter '[filter]'.

   [Contextual suggestion based on filter]
   ```
   - For status filters: suggest `/plan-capture` or relevant command
   - For type filters: note that no tasks of that type exist

## Edge Cases

- **Invalid filter**: Error with list of valid filters
- **No matches**: Friendly message with suggestion
- **No tasks at all**: "No tasks yet. Run `/plan-capture` to add one."
- **Many tasks**: Show all (no pagination needed for CLI)
- **Malformed files**: Skip and note count at end
