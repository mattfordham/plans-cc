---
name: plan-reopen
disable-model-invocation: true
argument-hint: "<id> [reason]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
description: Reopen a completed task and move it back to pending
---

# plan-reopen

Reopen a completed task and move it back to pending status. This is the inverse of `/plan-complete`.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001"), optionally followed by a reason for reopening or an auto-accept keyword
  - Example: `5` — reopen task #005 without a reason
  - Example: `5 Need to add more tests` — reopen task #005 with reason
  - Example: `5 quick` — reopen task #005 immediately without prompting

### Auto-Accept Keywords

If `$ARGUMENTS` contains any of these words (case-insensitive) alongside the task ID, **quick reopen** — skip the reason prompt (step 5) and don't add new steps (step 6):

`verified`, `verify`, `quick`, `accept`, `accepted`, `skip`, `done`, `lgtm`, `good`, `approved`, `confirmed`, `yep`, `yolo`, `ship`, `ship it`

**Parsing:** Extract the numeric task ID first, then check if any remaining text matches an auto-accept keyword. If it matches, set `quick_mode = true`. If it doesn't match a keyword, treat remaining text as the reason.

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Resolve task ID**

   **If `$ARGUMENTS` starts with a number:**
   - Extract the numeric ID (first word)
   - Zero-pad to 3 digits
   - Find task file in `.plans/completed/NNN-*.md`

   **If no `$ARGUMENTS`:**
   - List completed tasks in `.plans/completed/`
   - If exactly one: auto-select it
   - If multiple: list and ask which to reopen
   - If none: error "No completed tasks to reopen."

3. **Parse optional reason text**
   - Extract any text after the ID from `$ARGUMENTS`
   - Check if text matches an auto-accept keyword — if so, set `quick_mode = true` and reason = "Quick reopen"
   - Otherwise: Example: `/plan-reopen 5 Need to add more tests` → reason is "Need to add more tests"
   - If no text after ID, reason is empty — will prompt in step 5 (unless quick_mode)

4. **Read and validate task**
   - Read the task file from `.plans/completed/`
   - Parse Status field (should be `completed`)
   - Extract title from H1 heading
   - Check for `**Branch:**` field

5. **Get reason if not provided**

   **If `quick_mode = true`:** Skip this step entirely. Reason is "Quick reopen".

   **If no reason in `$ARGUMENTS`, use `AskUserQuestion` tool:**
   - Header: "Reopen reason"
   - Question: "Why are you reopening this task? What additional work is needed?"
   - Options:
     1. "Missing tests" — Need to add or fix tests
     2. "Bug found" — Issue discovered after completion
     3. "Requirements changed" — New or updated requirements
     4. "Incomplete implementation" — Original work was not fully done
   - User can also select "Other" to provide custom reason
   - Store the response as the reason

6. **Update task file**
   - Change Status: `completed` → `pending`
   - Remove the `**Completed:**` line entirely
   - **Keep all checkboxes in their current state** — Do NOT reset `[x]` to `[ ]`
   - **If `quick_mode = true`:** Do NOT add new steps to the How section. Skip straight to Notes update.
   - **Otherwise:** Add new unchecked step(s) to the How section based on the reason:
     ```markdown
     - [ ] [New step derived from reopening reason]
     ```
     For example, if reason is "Need to add more tests", add:
     ```markdown
     - [ ] Add additional tests for [relevant area]
     ```
   - Add or append to Notes section:
     ```markdown
     ## Notes
     **Reopened:** [reason]
     ```
     If Notes section already exists, append the "**Reopened:**" line to it.

7. **Move file**
   - Move from `.plans/completed/NNN-slug.md` to `.plans/pending/NNN-slug.md`
   - Use: `mv .plans/completed/NNN-slug.md .plans/pending/NNN-slug.md`

8. **Update PROGRESS.md**
   - Remove task from "Recently Completed" section (if present)
   - Update Stats section:
     - Decrement Completed count
     - Increment Pending count
   - Update "Last updated" date

9. **Update HISTORY.md**
   - Remove the row for this task ID from the history table
   - Match by task ID in the first column (| NNN |)

10. **Ask about branch** (if task has a branch)
    - Check if task file has `**Branch:**` field
    - If no branch field, skip to step 11
    - Get the branch name from the task file
    - Check if branch exists locally: `git branch --list [branch-name]`
    - **If branch exists, use `AskUserQuestion` tool:**
      - Header: "Branch"
      - Question: "Branch '[branch-name]' exists. Would you like to check it out to continue work?"
      - Options:
        1. "Checkout branch" — Switch to the task's branch
        2. "Stay on current branch" — Keep working on current branch
    - **After user responds:**
      - If "Checkout branch": `git checkout [branch-name]`
      - If "Stay on current branch": no action
    - If branch doesn't exist, note this in the confirmation message

11. **Optional: Git commit**
    - Read config.json for `git_commits` setting
    - If true:
      ```bash
      git add .plans/
      git commit -m "plan: reopen #NNN - [title]"
      ```

12. **Display confirmation**

    Print EXACTLY this format (substitute values in {braces}):

    ```
    Task #{id} reopened: {title}

    Reason: {reason or "No reason provided"}

    Moved to: .plans/pending/{id}-{slug}.md

    Next: /plan-elaborate {id} or /plan-execute {id}
    ```

    **Example output:**

    ```
    Task #005 reopened: User Authentication

    Reason: Need to add OAuth support

    Moved to: .plans/pending/005-user-authentication.md

    Next: /plan-elaborate 5 or /plan-execute 5
    ```

    **STOP after "Next:" line. Do not add anything else.**

## Edge Cases

- **Not initialized**: Error: "Not initialized. Run `/plan-init` first."
- **Task not in completed/**: Error: "Task #NNN not found in completed tasks. Use `/plan-list completed` to see completed tasks."
- **No completed tasks**: Error: "No completed tasks to reopen."
- **Multiple completed, no ID**: List completed tasks and ask which to reopen
- **Branch deleted**: Note in confirmation that branch no longer exists
- **Git commit fails**: Warn but don't fail the reopen operation
- **HISTORY.md row not found**: Continue without error (task may have been added before history tracking)
