---
name: plan-start
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
description: Begin working on a task
---

# plan-start

Begin working on a task, loading its context and marking it as in-progress.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve task ID**
   - Accept flexible ID formats: "1", "01", "001"
   - Zero-pad to 3 digits for file lookup
   - Find task file: `.plans/pending/NNN-*.md`

3. **Handle missing ID argument**
   - If no `$ARGUMENTS`, list elaborated tasks (preferred) and pending tasks:
     ```
     Ready to start (elaborated):
     #001 - Fix login timeout bug

     Also available (pending - not yet elaborated):
     #002 - Add dark mode

     Which task ID to start?
     ```

4. **Validate task state**
   - Read the task file
   - Check Status field:
     - If `elaborated`: proceed (ideal)
     - If `pending`: warn "Task #NNN hasn't been elaborated yet. Starting anyway, but consider `/plan-elaborate NNN` first for better planning." Then proceed.
     - If `in-progress`: "Task #NNN is already in progress. Run `/plan-execute NNN` to continue."
     - If not found in pending/: "Task #NNN not found. Run `/plan-list` to see available tasks."

5. **Check for other in-progress tasks**
   - Scan `.plans/pending/*.md` for Status: in-progress
   - If found, warn but don't block:
     ```
     Note: Task #MMM is also in progress. Consider completing it first.
     Proceeding with #NNN anyway.
     ```

6. **Update task status**
   - Change Status from `pending` or `elaborated` to `in-progress`
   - Write updated task file

7. **Update PROGRESS.md**
   - Add task to "Active Work" section:
     ```
     ## Active Work
     - **#NNN** - [Title] (started [YYYY-MM-DD])
     ```
   - Update Stats section counts

8. **Present task context**
   Display the task information to prepare for work:
   ```
   Starting task #NNN: [Title]
   Type: [type] | Status: in-progress

   ## What
   [What section content]

   ## How
   [How section content - the approach]

   ## Verification
   [Verification criteria]

   ## Relevant Files
   [List files mentioned in How section or detected from task]
   ```

9. **Display next steps**
   ```
   Task #NNN is now in progress.

   Work on the task now, or run `/plan-execute NNN` later to continue.
   When done, run `/plan-complete NNN`.
   ```

## Edge Cases

- **No ID argument**: List elaborated tasks first (ready), then pending tasks, ask which to start
- **Already in-progress**: Redirect to `/plan-execute`
- **No elaborated tasks**: Show pending tasks with note about elaboration
- **No tasks at all**: "No tasks to start. Run `/plan-capture` to add one."
- **Task not found**: Error with suggestion to run `/plan-list`
