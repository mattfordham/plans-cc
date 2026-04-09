---
name: plan-depends
disable-model-invocation: true
argument-hint: "<id> [blocked by <id> | clear | show]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
description: Add or view dependency relationships between tasks
---

# plan-depends

Manage task dependencies. Mark tasks as blocked by other tasks, view dependency chains, or clear dependencies.

## Arguments

- `$ARGUMENTS`: One of the following forms:
  - `NNN blocked by MMM` — mark task #NNN as blocked by task #MMM
  - `NNN blocked by MMM PPP` — mark task #NNN as blocked by tasks #MMM and #PPP
  - `NNN clear` — remove all dependencies from task #NNN
  - `NNN show` or just `NNN` — show dependencies for task #NNN
  - _(no arguments)_ — show all tasks that have dependencies

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments**
   - If no arguments: go to step 6 (show all dependencies)
   - Extract the first numeric ID as the target task
   - Check for action keywords:
     - If remaining text contains "blocked by" followed by one or more numeric IDs: action = `add`, extract blocker IDs
     - If remaining text is "clear": action = `clear`
     - If remaining text is "show" or empty: action = `show`

3. **Resolve and validate task IDs**
   - Zero-pad the target task ID to 3 digits
   - Find task file in `.plans/pending/NNN-*.md`
   - If not found: error "Task #NNN not found in pending tasks."
   - For `add` action: also resolve each blocker ID and verify it exists in either `.plans/pending/` or `.plans/completed/`
   - If any blocker not found: error "Task #MMM not found."

4. **Execute action: add dependency**
   (Only if action = `add`)
   - Check for circular dependencies: for each blocker task, read its file and check if it has `**Blocked by:**` that references the target task (directly or transitively). If circular: error "Circular dependency: #NNN → #MMM → #NNN. Cannot add."
   - Read the target task file
   - If `**Blocked by:**` field already exists: append the new blocker IDs (avoid duplicates)
   - If no `**Blocked by:**` field: add it after the `**Status:**` line:
     ```
     **Blocked by:** #MMM, #PPP
     ```
   - Write updated file
   - Display: "Task #NNN is now blocked by #MMM."
   - Check if blocker tasks are already completed and note: "Note: #MMM is already completed — dependency is already satisfied."

5. **Execute action: clear dependencies**
   (Only if action = `clear`)
   - Read the target task file
   - Remove the `**Blocked by:**` line entirely
   - Write updated file
   - Display: "Dependencies cleared for task #NNN."

5b. **Execute action: show single task**
    (Only if action = `show`)
    - Read the target task file
    - If no `**Blocked by:**` field: "Task #NNN has no dependencies."
    - If `**Blocked by:**` exists: parse the referenced task IDs
    - For each blocker, check its status:
      - If in `.plans/completed/`: ✓ completed
      - If in `.plans/pending/` with status `in-progress`: ◷ in progress
      - If in `.plans/pending/` with other status: ✗ not started
    - Display:
      ```
      Task #NNN: [title]
      Blocked by:
        #MMM - [title] (completed) ✓
        #PPP - [title] (elaborated) ✗

      Status: blocked (1 of 2 dependencies resolved)
      ```
    - If all blockers are completed: "Status: unblocked (all dependencies resolved)"

6. **Show all dependencies**
   (Only if no arguments)
   - Scan all `.plans/pending/*.md` files
   - For each, check if `**Blocked by:**` field exists
   - If no tasks have dependencies: "No tasks have dependencies."
   - Otherwise display:
     ```
     # Task Dependencies

     #NNN [title] ← blocked by #MMM (completed ✓), #PPP (pending ✗)
     #QQQ [title] ← blocked by #NNN (in-progress ◷)

     2 tasks with dependencies (1 fully resolved)
     ```

7. **Commit .plans/ changes** (only for `add` or `clear` actions)
   - If action is `show`: skip this step
   - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
   - If not a git repo: skip silently
   - Read `.plans/config.json` for `git_commits` setting
   - If `git_commits` is not `true`: skip silently
   - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
   - If no changes: skip silently
   - Commit:
     ```bash
     git add .plans/
     git commit -m "plan: update dependencies for #NNN"
     ```
   - If commit fails (e.g. hooks): warn but do not fail the skill

## Edge Cases

- **Not initialized**: Error suggesting `/plan-init`
- **Task not found**: Error with task ID
- **Blocker not found**: Error with blocker ID
- **Circular dependency**: Error with cycle description
- **Blocker already completed**: Note that dependency is already satisfied
- **Duplicate blocker IDs**: Deduplicate silently
- **Task already blocked by this ID**: Skip silently, no duplicate entry
- **Clearing task with no dependencies**: "Task #NNN has no dependencies to clear."
- **Completed task as target**: Error "Task #NNN is completed. Reopen it first to add dependencies."
